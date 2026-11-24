// filepath: src/__tests__/scorebook-inning-plan.test.ts
import { describe, expect, it } from "vitest";
import {
  alignParsedAtBatsToPlannedInningSequence,
  applyInningBatterCountEdit,
  applyInningLeadOffEdit,
  computeInningEndOrder,
  computeInningPlannedSlots,
  normalizeStructureInningBatterPlan,
} from "@/lib/liff/scorebook-inning-plan";
import { reconcileSheetExcessOutsDeterministically } from "@/lib/liff/scorebook-validator";
import type {
  ScorebookSheetStructure,
  ScorebookV2AtBat,
} from "@/types/scorebook-v2";

function makeStructureWithInnings(
  innings: ScorebookSheetStructure["innings"],
  includeDhTenthPitcher = false
): ScorebookSheetStructure {
  const batters: ScorebookSheetStructure["batters"] = Array.from(
    { length: 9 },
    (_, i) => ({
      battingOrder: i + 1,
      name: `選手${i + 1}`,
      uniformNumber: String(i + 1),
      position: i === 3 && includeDhTenthPitcher ? "D" : String(i + 1),
      playerId: `p${i + 1}`,
      substitutions: [],
    })
  );
  if (includeDhTenthPitcher) {
    batters.push({
      battingOrder: 10,
      name: "専任投手",
      uniformNumber: "18",
      position: "1",
      playerId: "p10",
      nonBatting: true,
      substitutions: [],
    });
  }
  return {
    isTop: true,
    isMyTeamBatting: true,
    batters,
    pitchers: [
      {
        id: "pit-1",
        order: 1,
        name: "相手投手",
        uniformNumber: "1",
        playerId: null,
        fromInning: 1,
        toInning: 7,
      },
    ],
    innings,
    totalRuns: innings.reduce((s, m) => s + m.runs, 0),
    totalHits: 0,
    totalErrors: 0,
  };
}

function makeSimpleAtBat(
  inning: number,
  battingOrder: number,
  outsInPlay: number,
  resultCode: ScorebookV2AtBat["resultCode"] = outsInPlay > 0
    ? "groundout"
    : "single"
): ScorebookV2AtBat {
  return {
    id: `ab-${inning}-${battingOrder}-${Math.random().toString(36).slice(2, 6)}`,
    inning,
    isTop: true,
    columnIndex: 1,
    battingOrder,
    batterName: `選手${battingOrder}`,
    batterPlayerId: `p${battingOrder}`,
    pitcherName: "相手投手",
    pitcherPlayerId: null,
    resultCode,
    resultLabel: outsInPlay > 0 ? "遊ゴロ" : "左安",
    battedDirection: outsInPlay > 0 ? "6-3" : "7",
    rbi: 0,
    outsInPlay,
    endingOuts: outsInPlay,
    runsInPlay: 0,
    balls: 1,
    strikes: 1,
    pitches: ["ball", "strike", outsInPlay > 0 ? "in_play" : "hit"],
    advances: [
      {
        id: `adv-${inning}-${battingOrder}`,
        runnerName: `選手${battingOrder}`,
        from: "BAT",
        to: "1B",
        method: outsInPlay > 0 ? "other" : "hit",
        isOut: outsInPlay > 0,
      },
    ],
    confidence: "high",
  };
}

describe("scorebook-inning-plan", () => {
  it("computes planned slots accurately for 9-batter cycles, DH 10th non-batting slots, and cycle vs bottom_wrap 2-column innings", () => {
    const structDh = makeStructureWithInnings(
      [
        {
          inning: 1,
          columnCount: 1,
          runs: 3,
          hits: 3,
          leadOffOrder: 4,
          batterCount: 9,
        },
        {
          inning: 2,
          columnCount: 2,
          runs: 6,
          hits: 5,
          leadOffOrder: 4,
          batterCount: 11,
          wrapStyle: "bottom_wrap",
        },
      ],
      true
    );

    const normalized = normalizeStructureInningBatterPlan(structDh, {
      fillDefaultWhenMissing: true,
    });
    // DH10行目があっても打順は9人循環（4番から9人一巡 ➔ 最終は3番、2回も4番先頭）
    expect(computeInningEndOrder(4, 9, 9)).toBe(3);
    expect(normalized.innings[1]?.leadOffOrder).toBe(4);

    const slotsCycle = computeInningPlannedSlots(
      {
        inning: 2,
        columnCount: 2,
        runs: 6,
        hits: 5,
        leadOffOrder: 4,
        batterCount: 11,
        wrapStyle: "cycle",
      },
      9
    );
    expect(slotsCycle?.map((s) => [s.battingOrder, s.subCol])).toEqual([
      [4, 1],
      [5, 1],
      [6, 1],
      [7, 1],
      [8, 1],
      [9, 1],
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 2],
      [5, 2],
    ]);

    // 9番下端折り返し式: 4〜9番が1列目(c:1)、1〜5番が2列目(c:2)
    const slotsBottomWrap = computeInningPlannedSlots(
      normalized.innings[1],
      9
    );
    expect(slotsBottomWrap?.map((s) => [s.battingOrder, s.subCol])).toEqual([
      [4, 1],
      [5, 1],
      [6, 1],
      [7, 1],
      [8, 1],
      [9, 1],
      [1, 2],
      [2, 2],
      [3, 2],
      [4, 2],
      [5, 2],
    ]);
  });

  it("applyInningBatterCountEdit preserves downstream end-order on 1-row boundary fix and cascades on 3-up-3-down chains", () => {
    // ケースA: 1回と2回の境界1マスズレ（AI初期推定: 1回=1〜4番[4人], 2回=5〜8番[4人], 3回=9〜3番[4人]）
    const boundaryDrift = makeStructureWithInnings([
      { inning: 1, columnCount: 1, runs: 1, hits: 1, leadOffOrder: 1, batterCount: 4 },
      { inning: 2, columnCount: 1, runs: 0, hits: 0, leadOffOrder: 5, batterCount: 4 },
      { inning: 3, columnCount: 1, runs: 0, hits: 1, leadOffOrder: 9, batterCount: 4 },
    ]);

    // ユーザーが1回を「5人（1〜5番）」へ1タップ修正
    const fixedBoundary = applyInningBatterCountEdit(boundaryDrift, 1, 5);
    expect(fixedBoundary.innings[0]?.batterCount).toBe(5);
    // 2回は自動で「6番〜8番（3人）」になり、3回（9番〜3番）は一切ズレない！
    expect(fixedBoundary.innings[1]?.leadOffOrder).toBe(6);
    expect(fixedBoundary.innings[1]?.batterCount).toBe(3);
    expect(fixedBoundary.innings[2]?.leadOffOrder).toBe(9);
    expect(fixedBoundary.innings[2]?.batterCount).toBe(4);

    // ケースB: 3者凡退の連鎖ズレ（AI初期推定: 1回=1〜3番[3人], 2回=4〜6番[3人], 3回=7〜9番[3人]）
    const threeUpChain = makeStructureWithInnings([
      { inning: 1, columnCount: 1, runs: 0, hits: 0, leadOffOrder: 1, batterCount: 3 },
      { inning: 2, columnCount: 1, runs: 0, hits: 0, leadOffOrder: 4, batterCount: 3 },
      { inning: 3, columnCount: 1, runs: 0, hits: 0, leadOffOrder: 7, batterCount: 3 },
    ]);

    // 1回を「4人（1〜4番）」へ修正 -> 2回は2人未満にならないよう「5〜7番（3人）」、3回は「8〜1番（3人）」へ自動玉突き！
    const cascaded = applyInningBatterCountEdit(threeUpChain, 1, 4);
    expect(cascaded.innings[1]?.leadOffOrder).toBe(5);
    expect(cascaded.innings[1]?.batterCount).toBe(3);
    expect(cascaded.innings[2]?.leadOffOrder).toBe(8);
    expect(cascaded.innings[2]?.batterCount).toBe(3);

    // ケースC: 10人以上へ増やすと自動で columnCount が 2列へ昇格
    const batAround = applyInningBatterCountEdit(threeUpChain, 1, 11);
    expect(batAround.innings[0]?.columnCount).toBe(2);
    expect(batAround.innings[1]?.leadOffOrder).toBe(3);
  });

  it("applyInningLeadOffEdit supports mid-at-bat caught stealing same-batter lead-off pinning", () => {
    const base = makeStructureWithInnings([
      { inning: 1, columnCount: 1, runs: 0, hits: 1, leadOffOrder: 1, batterCount: 5 },
      { inning: 2, columnCount: 1, runs: 0, hits: 0, leadOffOrder: 6, batterCount: 3 },
    ]);

    // 1回5番の打席途中に盗塁死チェンジ -> 2回も5番先頭に固定
    const pinned = applyInningLeadOffEdit(base, 2, 5);
    expect(pinned.innings[1]?.leadOffOrder).toBe(5);
    expect(pinned.innings[1]?.isLeadOffPinned).toBe(true);
    // 2回の終了打順（8番）は維持されて 5番〜8番(4人) になる
    expect(pinned.innings[1]?.batterCount).toBe(4);

    // 自動連動へ戻す
    const unpinned = applyInningLeadOffEdit(pinned, 2, null);
    expect(unpinned.innings[1]?.leadOffOrder).toBe(6);
    expect(unpinned.innings[1]?.isLeadOffPinned).toBe(false);
  });

  it("alignParsedAtBatsToPlannedInningSequence & reconcileSheetExcessOutsDeterministically strictly preserve locked batter sequence without trimming", () => {
    const struct = makeStructureWithInnings([
      { inning: 1, columnCount: 1, runs: 1, hits: 2, leadOffOrder: 1, batterCount: 5 },
      { inning: 2, columnCount: 1, runs: 0, hits: 1, leadOffOrder: 6, batterCount: 5 },
    ]);

    // 2回（確定: 6番→7番→8番→9番→1番 の5人）で、AIが上から順に [1番, 6番, 8番, 9番] + 白紙2番ノイズ を返し、7番を飛ばした場合
    const rawInning2 = [
      makeSimpleAtBat(2, 1, 1),
      makeSimpleAtBat(2, 2, 0), // 範囲外の幽霊ノイズ -> 除去されるべき
      makeSimpleAtBat(2, 6, 0),
      makeSimpleAtBat(2, 8, 1),
      makeSimpleAtBat(2, 9, 1),
    ];

    const aligned2 = alignParsedAtBatsToPlannedInningSequence(
      rawInning2,
      [2],
      true,
      struct
    );
    expect(aligned2.map((a) => a.battingOrder)).toEqual([6, 7, 8, 9, 1]);
    // 補完された7番は他の3アウト（1番・8番・9番）を壊さないよう outsInPlay=0 かつ confidence="low" になる
    expect(aligned2[1]?.battingOrder).toBe(7);
    expect(aligned2[1]?.outsInPlay).toBe(0);
    expect(aligned2[1]?.confidence).toBe("low");

    // 1回（確定: 1番〜5番 の5人）で、3番のエラー出塁が誤ってアウトと読まれ仮4アウトになった場合でも、Pass 2-D で4番・5番が絶対に削除されないことを検証
    const rawInning1MisreadOut = [
      makeSimpleAtBat(1, 1, 1),
      makeSimpleAtBat(1, 2, 1),
      makeSimpleAtBat(1, 3, 1), // 本来E6出塁だが仮1アウト誤読で3アウト到達
      makeSimpleAtBat(1, 4, 0, "single"),
      makeSimpleAtBat(1, 5, 1, "strikeout"),
    ];
    const afterDet = reconcileSheetExcessOutsDeterministically(
      rawInning1MisreadOut,
      struct
    );
    expect(afterDet.atBats).toHaveLength(5);
    expect(afterDet.atBats.map((a) => a.battingOrder)).toEqual([1, 2, 3, 4, 5]);
  });
});
