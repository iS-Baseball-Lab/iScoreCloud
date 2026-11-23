// filepath: src/__tests__/scorebook-batting-order-cycle.test.ts
import { describe, expect, it } from "vitest";
import { orderAndAssignColumnsForChunk } from "@/api/liff/scorebook";
import { buildDirectDigitalScorebookDraft } from "@/lib/liff/scorebook-live-converter";
import { compileScorebookSheetModel } from "@/lib/liff/scorebook-renderer-model";
import {
  detectMissingOrderGaps,
  isNonBattingBatterSlot,
  normalizePositionCode,
  reconcileSheetExcessOutsDeterministically,
  resolveEffectiveBattingCycleLength,
  validateScorebookSheet,
} from "@/lib/liff/scorebook-validator";
import type {
  CanonicalAtBatResult,
  ScorebookBatterSlot,
  ScorebookSheetStructure,
  ScorebookV2Advance,
  ScorebookV2AtBat,
} from "@/types/scorebook-v2";

function makeStructure(options?: {
  withDhTenthPitcher?: boolean;
  explicitTenthNonBatting?: boolean;
  withEveryoneBatsTen?: boolean;
  withBlankTenthRow?: boolean;
  inningRuns?: Record<number, number>;
}): ScorebookSheetStructure {
  const positions9 = options?.withDhTenthPitcher
    ? ["8", "4", "6", "D", "3", "5", "7", "2", "9"]
    : ["8", "4", "6", "1", "3", "5", "7", "2", "9"];

  const batters: ScorebookBatterSlot[] = positions9.map((pos, idx) => ({
    battingOrder: idx + 1,
    name: `打者${idx + 1}`,
    uniformNumber: String(idx + 1),
    position: pos,
    playerId: `p-${idx + 1}`,
    substitutions: [],
  }));

  if (options?.withDhTenthPitcher) {
    batters.push({
      battingOrder: 10,
      name: "専任投手",
      uniformNumber: "18",
      position: "1",
      playerId: "p-10",
      ...(typeof options.explicitTenthNonBatting === "boolean"
        ? { nonBatting: options.explicitTenthNonBatting }
        : {}),
      substitutions: [],
    });
  } else if (options?.withEveryoneBatsTen) {
    batters.push({
      battingOrder: 10,
      name: "打者10",
      uniformNumber: "10",
      position: "D",
      playerId: "p-10",
      substitutions: [],
    });
  } else if (options?.withBlankTenthRow) {
    batters.push({
      battingOrder: 10,
      name: "",
      uniformNumber: "",
      position: "",
      playerId: null,
      substitutions: [],
    });
  }

  const runsMap = options?.inningRuns ?? { 1: 0, 2: 3, 3: 0 };
  const innings = Object.entries(runsMap).map(([innStr, runs]) => ({
    inning: Number(innStr),
    columnCount: 1,
    runs,
    hits: runs > 0 ? 4 : 0,
  }));

  return {
    isTop: true,
    isMyTeamBatting: true,
    batters,
    pitchers: [
      {
        id: "opp-p-1",
        order: 1,
        name: "相手先発",
        uniformNumber: "11",
        playerId: null,
        fromInning: 1,
        toInning: 7,
      },
    ],
    innings,
    totalRuns: innings.reduce((s, m) => s + m.runs, 0),
    totalHits: innings.reduce((s, m) => s + m.hits, 0),
    totalErrors: 0,
  };
}

function makeAtBat(params: {
  id: string;
  inning: number;
  battingOrder: number;
  resultCode: CanonicalAtBatResult;
  resultLabel: string;
  battedDirection?: string;
  outsInPlay: number;
  endingOuts: number;
  runsInPlay?: number;
  rbi?: number;
  columnIndex?: number;
  advances?: ScorebookV2Advance[];
}): ScorebookV2AtBat {
  const isHit =
    params.resultCode === "single" ||
    params.resultCode === "double" ||
    params.resultCode === "triple" ||
    params.resultCode === "home_run";
  return {
    id: params.id,
    inning: params.inning,
    isTop: true,
    columnIndex: params.columnIndex ?? 1,
    battingOrder: params.battingOrder,
    batterName: `打者${params.battingOrder}`,
    batterPlayerId: `p-${params.battingOrder}`,
    pitcherName: "相手先発",
    pitcherPlayerId: null,
    resultCode: params.resultCode,
    resultLabel: params.resultLabel,
    battedDirection: params.battedDirection ?? (isHit ? "8" : "6-3"),
    rbi: params.rbi ?? params.runsInPlay ?? 0,
    outsInPlay: params.outsInPlay,
    endingOuts: params.endingOuts,
    runsInPlay: params.runsInPlay ?? 0,
    balls: params.resultCode === "walk" ? 4 : 1,
    strikes: params.resultCode === "strikeout" ? 3 : 1,
    pitches:
      params.resultCode === "walk"
        ? ["ball", "ball", "ball", "ball"]
        : params.resultCode === "strikeout"
        ? ["strike", "swinging_strike", "swinging_strike"]
        : ["ball", "strike", isHit ? "hit" : "in_play"],
    advances: params.advances ?? [],
    confidence: "high",
  };
}

describe("DH制10人表記（打席なし専任投手枠）と有効打順サイクルの判定", () => {
  it("DH・DP・D4・指などの守備位置表記をすべて 'D' に正規化する", () => {
    expect(normalizePositionCode("D")).toBe("D");
    expect(normalizePositionCode("DH")).toBe("D");
    expect(normalizePositionCode("DP")).toBe("D");
    expect(normalizePositionCode("D4")).toBe("D");
    expect(normalizePositionCode("DH4")).toBe("D");
    expect(normalizePositionCode("指")).toBe("D");
  });

  it("1〜9番にDHがあり10枠目に投手(P/1)が書かれている場合、nonBatting未指定でも打席なしと判定し9人循環になる", () => {
    const dhStructure = makeStructure({ withDhTenthPitcher: true });
    const tenthSlot = dhStructure.batters[9]!;
    expect(isNonBattingBatterSlot(tenthSlot, dhStructure.batters)).toBe(true);
    expect(resolveEffectiveBattingCycleLength(dhStructure)).toBe(9);
  });

  it("10行目が完全空欄の場合も9人循環を維持する", () => {
    const blank10Structure = makeStructure({ withBlankTenthRow: true });
    expect(resolveEffectiveBattingCycleLength(blank10Structure)).toBe(9);
  });

  it("全員打ち制（1〜9番に投手がおり10番にDH/EH打者がいる場合、または10番の実打席がある場合）は10人循環になる", () => {
    const everyoneStructure = makeStructure({ withEveryoneBatsTen: true });
    expect(resolveEffectiveBattingCycleLength(everyoneStructure)).toBe(10);

    const dhToggledToBatting = makeStructure({
      withDhTenthPitcher: true,
      explicitTenthNonBatting: false,
    });
    expect(resolveEffectiveBattingCycleLength(dhToggledToBatting)).toBe(10);
  });

  it("スタメン登録の order=0（DH専任先発投手）からスコアブック初期化した際も10枠 nonBatting:true・9人循環になる", () => {
    const draft = buildDirectDigitalScorebookDraft({
      battingOrder: "first",
      scheduledInnings: 7,
      myLineup: [
        { battingOrder: 1, position: "8", playerId: "p1", playerName: "一番", uniformNumber: "1" },
        { battingOrder: 2, position: "4", playerId: "p2", playerName: "二番", uniformNumber: "2" },
        { battingOrder: 3, position: "6", playerId: "p3", playerName: "三番", uniformNumber: "3" },
        { battingOrder: 4, position: "DH", playerId: "p4", playerName: "四番", uniformNumber: "4" },
        { battingOrder: 5, position: "3", playerId: "p5", playerName: "五番", uniformNumber: "5" },
        { battingOrder: 6, position: "5", playerId: "p6", playerName: "六番", uniformNumber: "6" },
        { battingOrder: 7, position: "7", playerId: "p7", playerName: "七番", uniformNumber: "7" },
        { battingOrder: 8, position: "2", playerId: "p8", playerName: "八番", uniformNumber: "8" },
        { battingOrder: 9, position: "9", playerId: "p9", playerName: "九番", uniformNumber: "9" },
        { battingOrder: 0, position: "1", playerId: "p10", playerName: "先発専任", uniformNumber: "18" },
      ],
    });
    expect(draft.topStructure.batters).toHaveLength(10);
    expect(draft.topStructure.batters[9]?.nonBatting).toBe(true);
    expect(resolveEffectiveBattingCycleLength(draft.topStructure)).toBe(9);
    expect(draft.bottomStructure.pitchers[0]?.name).toBe("先発専任");
  });
});

describe("イニングが9人ピッタリで終わるケース（打順一巡ちょうど3アウト終了）の整合検証", () => {
  it("2回が4番先頭で9人ピッタリ（4〜9→1〜3番）で終わり3回も4番先頭になる場合、AIが1〜9の行順で返しても正確に4〜3番へ整列する", () => {
    const structure = makeStructure({
      withDhTenthPitcher: true,
      inningRuns: { 1: 0, 2: 3, 3: 0 },
    });

    // Stage 2 生データ: AIがシート上端の1番〜9番の順（＋10行目の空欄ノイズ）で返したケース
    const rawInning2TopToBottom = [
      { i: 2, bo: 1, c: 1, rc: "single", rl: "中安", dir: "8", o: 0, eo: 2, ru: 1, rbi: 1, obs: "本一:実線" },
      { i: 2, bo: 2, c: 1, rc: "walk", rl: "四球", dir: "", o: 0, eo: 2, ru: 0, rbi: 0, obs: "左:B,B,B,B" },
      { i: 2, bo: 3, c: 1, rc: "flyout", rl: "中飛", dir: "8", o: 1, eo: 3, ru: 0, rbi: 0, obs: "中:Ⅲ/右下:斜線" },
      { i: 2, bo: 4, c: 1, rc: "single", rl: "左安", dir: "7", o: 0, eo: 0, ru: 0, rbi: 0, obs: "本一:実線" },
      { i: 2, bo: 5, c: 1, rc: "strikeout", rl: "空三振", dir: "K", o: 1, eo: 1, ru: 0, rbi: 0, obs: "中:Ⅰ" },
      { i: 2, bo: 6, c: 1, rc: "double", rl: "右二", dir: "9", o: 0, eo: 1, ru: 1, rbi: 1, obs: "本二:実線" },
      { i: 2, bo: 7, c: 1, rc: "groundout", rl: "遊ゴロ", dir: "6-3", o: 1, eo: 2, ru: 0, rbi: 0, obs: "中:Ⅱ" },
      { i: 2, bo: 8, c: 1, rc: "single", rl: "中安", dir: "8", o: 0, eo: 2, ru: 1, rbi: 1, obs: "本一:実線" },
      { i: 2, bo: 9, c: 1, rc: "walk", rl: "四球", dir: "", o: 0, eo: 2, ru: 0, rbi: 0, obs: "左:B,B,B,B" },
      // 10枠目（DH専任投手）の空欄を万一ノイズ出力した場合も自動除外されること
      { i: 2, bo: 10, c: 1, rc: "other", rl: "", dir: "", o: 0, eo: 0, ru: 0, rbi: 0, obs: "空欄" },
    ];

    const orderedRaw = orderAndAssignColumnsForChunk(
      rawInning2TopToBottom,
      [2],
      structure,
      4
    );
    expect(orderedRaw.map((x) => x.bo)).toEqual([4, 5, 6, 7, 8, 9, 1, 2, 3]);
    expect(orderedRaw.every((x) => x.c === 1)).toBe(true);

    // 単一イニングチャンクでの reconcileSheetExcessOutsDeterministically（走塁死二重計上で仮4アウトの状態でも先頭4番を維持！）
    const singleChunkWithOvercount: ScorebookV2AtBat[] = [
      makeAtBat({ id: "2-1", inning: 2, battingOrder: 1, resultCode: "single", resultLabel: "中安", outsInPlay: 0, endingOuts: 2, runsInPlay: 1 }),
      makeAtBat({ id: "2-2", inning: 2, battingOrder: 2, resultCode: "walk", resultLabel: "四球", outsInPlay: 0, endingOuts: 2 }),
      makeAtBat({ id: "2-3", inning: 2, battingOrder: 3, resultCode: "flyout", resultLabel: "中飛", battedDirection: "8", outsInPlay: 1, endingOuts: 3 }),
      // 4番単打に後続打席での走塁死 outsInPlay:1 が誤混入し合計4アウトになっていたケース
      makeAtBat({ id: "2-4", inning: 2, battingOrder: 4, resultCode: "single", resultLabel: "左安", outsInPlay: 1, endingOuts: 1 }),
      makeAtBat({ id: "2-5", inning: 2, battingOrder: 5, resultCode: "strikeout", resultLabel: "三振", outsInPlay: 1, endingOuts: 1 }),
      makeAtBat({ id: "2-6", inning: 2, battingOrder: 6, resultCode: "double", resultLabel: "右二", outsInPlay: 0, endingOuts: 1, runsInPlay: 1 }),
      makeAtBat({ id: "2-7", inning: 2, battingOrder: 7, resultCode: "groundout", resultLabel: "遊ゴロ", outsInPlay: 1, endingOuts: 2 }),
      makeAtBat({ id: "2-8", inning: 2, battingOrder: 8, resultCode: "single", resultLabel: "中安", outsInPlay: 0, endingOuts: 2, runsInPlay: 1 }),
      makeAtBat({ id: "2-9", inning: 2, battingOrder: 9, resultCode: "walk", resultLabel: "四球", outsInPlay: 0, endingOuts: 2 }),
    ];

    const singleChunkFixed = reconcileSheetExcessOutsDeterministically(
      singleChunkWithOvercount,
      structure,
      { expectedFirstInningLeadOffOrder: 4 }
    ).atBats;
    expect(singleChunkFixed.map((a) => a.battingOrder)).toEqual([
      4, 5, 6, 7, 8, 9, 1, 2, 3,
    ]);
    expect(
      singleChunkFixed.reduce((sum, a) => sum + a.outsInPlay, 0)
    ).toBe(3);

    // 1回(1〜3番) ➔ 2回(4〜9→1〜3番の9人ピッタリ) ➔ 3回(4〜9→1番で9番→1番折り返し、10番スキップ) のシート全体検証
    const fullSheetAtBats: ScorebookV2AtBat[] = [
      makeAtBat({ id: "1-1", inning: 1, battingOrder: 1, resultCode: "groundout", resultLabel: "遊ゴロ", outsInPlay: 1, endingOuts: 1 }),
      makeAtBat({ id: "1-2", inning: 1, battingOrder: 2, resultCode: "strikeout", resultLabel: "三振", outsInPlay: 1, endingOuts: 2 }),
      makeAtBat({ id: "1-3", inning: 1, battingOrder: 3, resultCode: "flyout", resultLabel: "中飛", battedDirection: "8", outsInPlay: 1, endingOuts: 3 }),
      ...singleChunkFixed,
      makeAtBat({ id: "3-4", inning: 3, battingOrder: 4, resultCode: "single", resultLabel: "中安", outsInPlay: 0, endingOuts: 0 }),
      makeAtBat({ id: "3-5", inning: 3, battingOrder: 5, resultCode: "sac_bunt", resultLabel: "投犠打", battedDirection: "1-4", outsInPlay: 1, endingOuts: 1 }),
      makeAtBat({ id: "3-6", inning: 3, battingOrder: 6, resultCode: "walk", resultLabel: "四球", outsInPlay: 0, endingOuts: 1 }),
      makeAtBat({ id: "3-7", inning: 3, battingOrder: 7, resultCode: "strikeout", resultLabel: "三振", outsInPlay: 1, endingOuts: 2 }),
      makeAtBat({ id: "3-8", inning: 3, battingOrder: 8, resultCode: "walk", resultLabel: "四球", outsInPlay: 0, endingOuts: 2 }),
      makeAtBat({ id: "3-9", inning: 3, battingOrder: 9, resultCode: "walk", resultLabel: "四球", outsInPlay: 0, endingOuts: 2 }),
      makeAtBat({ id: "3-1", inning: 3, battingOrder: 1, resultCode: "groundout", resultLabel: "二ゴロ", battedDirection: "4-3", outsInPlay: 1, endingOuts: 3 }),
    ];

    const gaps = detectMissingOrderGaps(fullSheetAtBats, structure);
    expect(gaps).toEqual([]);

    const issues = validateScorebookSheet(fullSheetAtBats, structure, true);
    const orderOrOutErrors = issues.filter(
      (iss) =>
        iss.severity === "error" &&
        (iss.category === "order" || iss.category === "outs")
    );
    expect(orderOrOutErrors).toEqual([]);

    // デジタルスコアブック描画モデルでも2回3番にイニング終了斜線が付き、10枠目の専任投手に守備成績(投ゴロ1-3)が集計される
    const oppAtBats: ScorebookV2AtBat[] = [
      makeAtBat({
        id: "b1-1",
        inning: 1,
        battingOrder: 1,
        resultCode: "groundout",
        resultLabel: "投ゴロ",
        battedDirection: "1-3",
        outsInPlay: 1,
        endingOuts: 1,
      }),
      {
        ...makeAtBat({
          id: "b1-2",
          inning: 1,
          battingOrder: 2,
          resultCode: "flyout",
          resultLabel: "投飛",
          battedDirection: "1",
          outsInPlay: 1,
          endingOuts: 2,
        }),
        pitcherName: "専任投手",
        pitcherPlayerId: "p-10",
      },
    ];
    const compiled = compileScorebookSheetModel(
      structure,
      fullSheetAtBats,
      {
        matchId: "m-test-1",
        date: "2026-11-22",
        matchTypeLabel: "公式戦",
        topTeamName: "自チーム",
        bottomTeamName: "相手チーム",
        scheduledInnings: 7,
        topInningScores: [0, 3, 0],
        bottomInningScores: [0, 0, 0],
        topTotalRuns: 3,
        bottomTotalRuns: 0,
        topTotalHits: 5,
        bottomTotalHits: 0,
        topTotalErrors: 0,
        bottomTotalErrors: 0,
      },
      {
        opponentAtBats: oppAtBats,
      }
    );
    expect(compiled.cellsByKey["2-1-3"]?.isInningEndCell).toBe(true);
    expect(compiled.cellsByKey["2-1-9"]?.isInningEndCell).toBeFalsy();
    const tenthPitcherRow = compiled.batterRows.find(
      (r) => r.battingOrder === 10
    );
    expect(tenthPitcherRow?.plateAppearances).toBe(0);
    expect(tenthPitcherRow?.assists).toBe(1);
    expect(tenthPitcherRow?.putouts).toBe(1);
  });

  it("9人ピッタリ攻撃の9打席目（3番）の打席途中に盗塁死で3アウトチェンジになった場合、次回先頭は同じ3番で打ち直しになる", () => {
    const structure = makeStructure({ inningRuns: { 1: 0, 2: 2, 3: 0 } });
    const atBats: ScorebookV2AtBat[] = [
      makeAtBat({ id: "1-1", inning: 1, battingOrder: 1, resultCode: "groundout", resultLabel: "遊ゴロ", outsInPlay: 1, endingOuts: 1 }),
      makeAtBat({ id: "1-2", inning: 1, battingOrder: 2, resultCode: "groundout", resultLabel: "二ゴロ", outsInPlay: 1, endingOuts: 2 }),
      makeAtBat({ id: "1-3", inning: 1, battingOrder: 3, resultCode: "strikeout", resultLabel: "三振", outsInPlay: 1, endingOuts: 3 }),
      // 2回: 4番先頭〜3番（9人目）の打席途中に1塁走者2番が盗塁死でチェンジ
      makeAtBat({ id: "2-4", inning: 2, battingOrder: 4, resultCode: "single", resultLabel: "中安", outsInPlay: 0, endingOuts: 0 }),
      makeAtBat({ id: "2-5", inning: 2, battingOrder: 5, resultCode: "strikeout", resultLabel: "三振", outsInPlay: 1, endingOuts: 1 }),
      makeAtBat({ id: "2-6", inning: 2, battingOrder: 6, resultCode: "double", resultLabel: "左二", outsInPlay: 0, endingOuts: 1, runsInPlay: 1 }),
      makeAtBat({ id: "2-7", inning: 2, battingOrder: 7, resultCode: "groundout", resultLabel: "三ゴロ", outsInPlay: 1, endingOuts: 2 }),
      makeAtBat({ id: "2-8", inning: 2, battingOrder: 8, resultCode: "single", resultLabel: "右安", outsInPlay: 0, endingOuts: 2, runsInPlay: 1 }),
      makeAtBat({ id: "2-9", inning: 2, battingOrder: 9, resultCode: "walk", resultLabel: "四球", outsInPlay: 0, endingOuts: 2 }),
      makeAtBat({ id: "2-1", inning: 2, battingOrder: 1, resultCode: "walk", resultLabel: "四球", outsInPlay: 0, endingOuts: 2 }),
      makeAtBat({ id: "2-2", inning: 2, battingOrder: 2, resultCode: "single", resultLabel: "中安", outsInPlay: 0, endingOuts: 2 }),
      makeAtBat({
        id: "2-3",
        inning: 2,
        battingOrder: 3,
        resultCode: "other",
        resultLabel: "打席途中断(盗塁死)",
        battedDirection: "",
        outsInPlay: 1,
        endingOuts: 3,
        advances: [
          {
            id: "adv-cs",
            runnerName: "打者2",
            from: "1B",
            to: "2B",
            method: "caught_stealing",
            isOut: true,
            throwChain: "2-6",
          },
        ],
      }),
      // 3回: 3番から打ち直し！
      makeAtBat({ id: "3-3", inning: 3, battingOrder: 3, resultCode: "groundout", resultLabel: "遊ゴロ", outsInPlay: 1, endingOuts: 1 }),
      makeAtBat({ id: "3-4", inning: 3, battingOrder: 4, resultCode: "flyout", resultLabel: "右飛", battedDirection: "9", outsInPlay: 1, endingOuts: 2 }),
      makeAtBat({ id: "3-5", inning: 3, battingOrder: 5, resultCode: "strikeout", resultLabel: "三振", outsInPlay: 1, endingOuts: 3 }),
    ];

    const reconciled = reconcileSheetExcessOutsDeterministically(
      atBats,
      structure
    ).atBats;
    const inn2 = reconciled.filter((a) => a.inning === 2);
    const inn3 = reconciled.filter((a) => a.inning === 3);
    expect(inn2.map((a) => a.battingOrder)).toEqual([
      4, 5, 6, 7, 8, 9, 1, 2, 3,
    ]);
    expect(inn3[0]?.battingOrder).toBe(3);
    expect(detectMissingOrderGaps(reconciled, structure)).toEqual([]);
  });

  it("9人ピッタリ攻撃で途中の1人（6番）だけ読取漏れして8/9件返った場合、偽の7番先頭へ回転せず先頭4番を維持して6番欠損を特定できる", () => {
    const structure = makeStructure({ inningRuns: { 1: 0, 2: 2 } });
    const rawEightOfNine = [
      { i: 2, bo: 1, c: 1, rc: "single", rl: "中安", o: 0, eo: 2 },
      { i: 2, bo: 2, c: 1, rc: "walk", rl: "四球", o: 0, eo: 2 },
      { i: 2, bo: 3, c: 1, rc: "flyout", rl: "中飛", o: 1, eo: 3 },
      { i: 2, bo: 4, c: 1, rc: "single", rl: "左安", o: 0, eo: 0 },
      { i: 2, bo: 5, c: 1, rc: "strikeout", rl: "三振", o: 1, eo: 1 },
      // 6番が読取漏れ！
      { i: 2, bo: 7, c: 1, rc: "groundout", rl: "遊ゴロ", o: 1, eo: 2 },
      { i: 2, bo: 8, c: 1, rc: "single", rl: "右安", o: 0, eo: 2 },
      { i: 2, bo: 9, c: 1, rc: "walk", rl: "四球", o: 0, eo: 2 },
    ];

    const ordered = orderAndAssignColumnsForChunk(
      rawEightOfNine,
      [2],
      structure,
      4
    );
    expect(ordered.map((x) => x.bo)).toEqual([4, 5, 7, 8, 9, 1, 2, 3]);
  });
});
