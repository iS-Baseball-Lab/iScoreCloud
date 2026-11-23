// filepath: src/__tests__/scorebook-flagged-reconcile.test.ts
import { describe, expect, it } from "vitest";
import {
  formatTeamSymbolRulesForAiPrompt,
  normalizePitchArray,
} from "@/api/liff/scorebook";
import {
  SENIOR_CHART_SCOREBOOK_SYMBOL_RULES,
  STANDARD_SCOREBOOK_SYMBOL_RULES,
} from "@/lib/liff/scorebook-symbol-rules";
import {
  applyReconciledFlaggedAtBats,
  buildFlaggedAtBatReconcileSpecs,
  validateScorebookSheet,
} from "@/lib/liff/scorebook-validator";
import type {
  ReconciledFlaggedAtBatItem,
  ScorebookSheetStructure,
  ScorebookV2AtBat,
} from "@/types/scorebook-v2";

function makeStructure(): ScorebookSheetStructure {
  return {
    isTop: true,
    isMyTeamBatting: true,
    totalRuns: 1,
    totalHits: 1,
    totalErrors: 0,
    lineupRightX: 200,
    gridCorners: {
      tl: [200, 120],
      tr: [820, 120],
      br: [820, 840],
      bl: [200, 840],
    },
    batters: Array.from({ length: 9 }, (_, i) => ({
      battingOrder: i + 1,
      name: `選手${i + 1}`,
      uniformNumber: String(i + 1),
      position: String(i + 1),
      playerId: `p-${i + 1}`,
      rowBox: [120 + i * 80, 200, 120 + (i + 1) * 80, 820],
      substitutions: [],
    })),
    innings: [
      {
        inning: 1,
        columnCount: 1,
        runs: 1,
        hits: 1,
        columnBox: [120, 200, 840, 280],
      },
    ],
    pitchers: [
      {
        id: "stint-1",
        order: 1,
        name: "相手先発",
        uniformNumber: "18",
        playerId: null,
        fromInning: 1,
        toInning: 7,
      },
    ],
  };
}

function makeAtBat(
  overrides: Partial<ScorebookV2AtBat> & {
    id: string;
    inning: number;
    battingOrder: number;
  }
): ScorebookV2AtBat {
  const { id, inning, battingOrder, ...rest } = overrides;
  return {
    id,
    inning,
    isTop: true,
    columnIndex: 1,
    battingOrder,
    batterName: `選手${battingOrder}`,
    batterPlayerId: `p-${battingOrder}`,
    pitcherName: "相手先発",
    pitcherPlayerId: null,
    resultCode: "groundout",
    resultLabel: "遊ゴロ",
    battedDirection: "6-3",
    rbi: 0,
    outsInPlay: 1,
    endingOuts: 1,
    runsInPlay: 0,
    balls: 1,
    strikes: 1,
    pitches: ["strike", "ball", "in_play"],
    advances: [],
    confidence: "high",
    ...rest,
  };
}

describe("STEP 3 pinpoint flagged at-bat AI reconcile specs & non-regression merge", () => {
  it("builds specs only for flagged cells with exact pre-play outs and preceding runner coordinates", () => {
    const structure = makeStructure();
    const atBats: ScorebookV2AtBat[] = [
      // 1番: 四球だがボール3球のみ仮読取（pitch-bb-* 警告）
      makeAtBat({
        id: "ab-1",
        inning: 1,
        battingOrder: 1,
        resultCode: "walk",
        resultLabel: "四球",
        battedDirection: "B",
        outsInPlay: 0,
        endingOuts: 0,
        balls: 3,
        strikes: 1,
        pitches: ["ball", "strike", "ball", "ball"],
      }),
      // 2番: 適時二塁打で1番が生還（整合済みクリーン打席）
      makeAtBat({
        id: "ab-2",
        inning: 1,
        battingOrder: 2,
        resultCode: "double",
        resultLabel: "左二",
        battedDirection: "7",
        outsInPlay: 0,
        endingOuts: 0,
        runsInPlay: 1,
        rbi: 1,
        balls: 0,
        strikes: 1,
        pitches: ["strike", "hit"],
        advances: [
          {
            id: "adv-1",
            runnerName: "選手1",
            from: "1B",
            to: "HP",
            method: "hit",
            isOut: false,
          },
        ],
      }),
      // 3番: 8-3 外野ゴロにじみ誤読（dir-rare-ofg-* 警告）
      makeAtBat({
        id: "ab-3",
        inning: 1,
        battingOrder: 3,
        resultCode: "groundout",
        resultLabel: "中ゴロ",
        battedDirection: "8-3",
        outsInPlay: 1,
        endingOuts: 1,
      }),
      // 4番: 遊ゴロ（整合済みクリーン打席）
      makeAtBat({
        id: "ab-4",
        inning: 1,
        battingOrder: 4,
        outsInPlay: 1,
        endingOuts: 2,
      }),
      // 5番: 空振三振（整合済みクリーン打席）
      makeAtBat({
        id: "ab-5",
        inning: 1,
        battingOrder: 5,
        resultCode: "strikeout",
        resultLabel: "空振三振",
        battedDirection: "SO",
        outsInPlay: 1,
        endingOuts: 3,
        balls: 1,
        strikes: 3,
        pitches: ["ball", "strike", "foul", "swinging_strike"],
      }),
    ];

    const specs = buildFlaggedAtBatReconcileSpecs(atBats, structure);
    expect(specs.map((s) => s.atBatId)).toEqual(["ab-1", "ab-3"]);

    // ab-1 は無死走者なし・ボール数不足の警告を含む
    expect(specs[0]?.outsBefore).toBe(0);
    expect(specs[0]?.precedingRunners).toHaveLength(0);
    expect(specs[0]?.issueIds.some((id) => id.startsWith("pitch-bb-"))).toBe(
      true
    );

    // ab-3 は打席前に二塁走者（2番 選手2）が乗っていることを保持し、先行走者マス参照に使える
    expect(specs[1]?.outsBefore).toBe(0);
    expect(specs[1]?.precedingRunners).toHaveLength(1);
    expect(specs[1]?.precedingRunners[0]).toMatchObject({
      startBase: "2B",
      battingOrder: 2,
      runnerName: "選手2",
      inning: 1,
      columnIndex: 1,
    });
    expect(
      specs[1]?.issueIds.some((id) => id.startsWith("dir-rare-ofg-"))
    ).toBe(true);
  });

  it("accepts issue-resolving updates while rejecting hallucinated regressions in batch mode", () => {
    const structure = makeStructure();
    const atBats: ScorebookV2AtBat[] = [
      makeAtBat({
        id: "ab-1",
        inning: 1,
        battingOrder: 1,
        resultCode: "walk",
        resultLabel: "四球",
        battedDirection: "B",
        outsInPlay: 0,
        endingOuts: 0,
        balls: 3,
        strikes: 1,
        pitches: ["ball", "strike", "ball", "ball"],
        pinchRunners: [
          {
            base: "1B",
            subType: "PR",
            battingOrder: 1,
            replacedName: "選手1",
            name: "代走選手",
            uniformNumber: "12",
            playerId: "p-12",
          },
        ],
      }),
      makeAtBat({
        id: "ab-2",
        inning: 1,
        battingOrder: 2,
        resultCode: "double",
        resultLabel: "左二",
        battedDirection: "7",
        outsInPlay: 0,
        endingOuts: 0,
        runsInPlay: 1,
        rbi: 1,
        pitches: ["strike", "hit"],
        advances: [
          {
            id: "adv-1",
            runnerName: "代走選手",
            from: "1B",
            to: "HP",
            method: "hit",
            isOut: false,
          },
        ],
      }),
      makeAtBat({
        id: "ab-3",
        inning: 1,
        battingOrder: 3,
        resultCode: "groundout",
        resultLabel: "中ゴロ",
        battedDirection: "8-3",
        outsInPlay: 1,
        endingOuts: 1,
      }),
      makeAtBat({
        id: "ab-4",
        inning: 1,
        battingOrder: 4,
        outsInPlay: 1,
        endingOuts: 2,
      }),
      makeAtBat({
        id: "ab-5",
        inning: 1,
        battingOrder: 5,
        outsInPlay: 1,
        endingOuts: 3,
      }),
    ];

    // シナリオ1: ab-1 の4球目ボール発見 ＆ ab-3 の 8-3 ➔ 6-3 にじみ修正（全警告クリア）
    const goodItems: ReconciledFlaggedAtBatItem[] = [
      {
        slotKey: "F1",
        atBatId: "ab-1",
        atBat: makeAtBat({
          id: "ab-1",
          inning: 1,
          battingOrder: 1,
          resultCode: "walk",
          resultLabel: "四球",
          battedDirection: "B",
          outsInPlay: 0,
          endingOuts: 0,
          balls: 4,
          strikes: 1,
          pitches: ["ball", "strike", "ball", "ball", "ball"],
        }),
      },
      {
        slotKey: "F2",
        atBatId: "ab-3",
        atBat: makeAtBat({
          id: "ab-3",
          inning: 1,
          battingOrder: 3,
          resultCode: "groundout",
          resultLabel: "遊ゴロ",
          battedDirection: "6-3",
          outsInPlay: 1,
          endingOuts: 1,
          pitches: ["in_play"], // 事前投球が空で返っても元の ["strike","ball"] が保護される
        }),
      },
    ];

    const resGood = applyReconciledFlaggedAtBats(atBats, goodItems, structure);
    expect(resGood.beforeIssueCount).toBe(2);
    expect(resGood.afterIssueCount).toBe(0);
    expect(resGood.updatedAtBatIds).toEqual(["ab-1", "ab-3"]);
    // 代走メタデータおよび元の事前投球履歴が破壊されず保持されていること
    expect(resGood.atBats[0]?.pinchRunners).toHaveLength(1);
    expect(resGood.atBats[2]?.battedDirection).toBe("6-3");
    expect(resGood.atBats[2]?.pitches).toEqual(["strike", "ball", "in_play"]);
    expect(validateScorebookSheet(resGood.atBats, structure, true)).toHaveLength(
      0
    );

    // シナリオ2: 同一イニング内で ab-1 は改善したが、ab-3 が誤って単打(o:0)になりイニング2アウト不足エラーを生む場合
    // ➔ イニング一括適用を却下し、改善する ab-1 のみを個別採用して ab-3 の退行をブロック！
    const mixedItems: ReconciledFlaggedAtBatItem[] = [
      goodItems[0]!,
      {
        slotKey: "F2",
        atBatId: "ab-3",
        atBat: makeAtBat({
          id: "ab-3",
          inning: 1,
          battingOrder: 3,
          resultCode: "single",
          resultLabel: "中安",
          battedDirection: "8",
          outsInPlay: 0,
          endingOuts: 0,
          pitches: ["strike", "hit"],
        }),
      },
    ];

    const resMixed = applyReconciledFlaggedAtBats(atBats, mixedItems, structure);
    expect(resMixed.updatedAtBatIds).toEqual(["ab-1"]);
    expect(resMixed.afterIssueCount).toBe(1);
    expect(resMixed.atBats[0]?.balls).toBe(4);
    expect(resMixed.atBats[2]?.resultCode).toBe("groundout");
  });

  it("applies user-triggered single-cell re-read directly when forceApplyAll is true", () => {
    const structure = makeStructure();
    const atBats: ScorebookV2AtBat[] = [
      makeAtBat({ id: "ab-1", inning: 1, battingOrder: 1, endingOuts: 1 }),
      makeAtBat({ id: "ab-2", inning: 1, battingOrder: 2, endingOuts: 2 }),
      makeAtBat({
        id: "ab-3",
        inning: 1,
        battingOrder: 3,
        resultCode: "home_run",
        resultLabel: "左本",
        battedDirection: "7",
        outsInPlay: 0,
        endingOuts: 2,
        runsInPlay: 1,
        rbi: 1,
        pitches: ["ball", "hit"],
      }),
      makeAtBat({ id: "ab-4", inning: 1, battingOrder: 4, endingOuts: 3 }),
    ];

    const targetSpecs = buildFlaggedAtBatReconcileSpecs(atBats, structure, {
      targetAtBatIds: ["ab-2"],
    });
    expect(targetSpecs).toHaveLength(1);
    expect(targetSpecs[0]?.atBatId).toBe("ab-2");

    const singleRes = applyReconciledFlaggedAtBats(
      atBats,
      [
        {
          slotKey: "F1",
          atBatId: "ab-2",
          atBat: makeAtBat({
            id: "ab-2",
            inning: 1,
            battingOrder: 2,
            resultCode: "flyout",
            resultLabel: "右飛",
            battedDirection: "9F",
            outsInPlay: 1,
            endingOuts: 2,
            pitches: ["ball", "strike", "in_play"],
          }),
        },
      ],
      structure,
      { forceApplyAll: true }
    );

    expect(singleRes.updatedAtBatIds).toEqual(["ab-2"]);
    expect(singleRes.atBats[1]?.resultCode).toBe("flyout");
    expect(singleRes.atBats[1]?.battedDirection).toBe("9F");
    // 他の打席（ab-1, ab-3, ab-4）は一切変更されない
    expect(singleRes.atBats[0]?.resultLabel).toBe("遊ゴロ");
    expect(singleRes.atBats[2]?.resultCode).toBe("home_run");
  });
});

describe("Pitch normalization & team symbol rules prompt injection", () => {
  it("never turns pitch sequence digits (1, 2, 3) or called-strike 'K' into fake pickoff throws", () => {
    const emptyBases = { "1B": false, "2B": false, "3B": false } as const;

    const seqRes = normalizePitchArray(
      ["1", "B", "2", "S", "3", "X"],
      "groundout",
      [],
      emptyBases
    );
    expect(seqRes).toEqual(["ball", "strike", "in_play"]);
    expect(seqRes.some((p) => p.startsWith("pickoff"))).toBe(false);

    const calledKRes = normalizePitchArray(
      ["B", "S", "K"],
      "strikeout",
      [],
      emptyBases
    );
    expect(calledKRes).toEqual(["ball", "strike", "strike"]);
    expect(calledKRes.some((p) => p.startsWith("pickoff"))).toBe(false);
  });

  it("strips physically impossible empty-base pickoffs and recovers misread balk dashes while keeping occupied-base pickoffs", () => {
    const emptyBases = { "1B": false, "2B": false, "3B": false } as const;
    const cleaned = normalizePitchArray(
      ["PO1", "BK", "S", "X"],
      "flyout",
      [],
      emptyBases
    );
    expect(cleaned).toEqual(["ball", "strike", "in_play"]);

    const runner1B = { "1B": true, "2B": false, "3B": false } as const;
    const kept = normalizePitchArray(
      ["PO1", "B", "X"],
      "groundout",
      [],
      runner1B
    );
    expect(kept).toEqual(["pickoff_1b", "ball", "in_play"]);
  });

  it("formats team ScorebookSymbolRules into explicit Gemini reading instructions", () => {
    const seniorPrompt = formatTeamSymbolRulesForAiPrompt({
      ...SENIOR_CHART_SCOREBOOK_SYMBOL_RULES,
      pitchMark: "numbered_bs",
      buntMark: "square_all_bh",
      forceOutMark: "base_letter_abch",
      customNote: "内野安打は右下に赤丸囲み",
    });

    expect(seniorPrompt).toContain("点線維持式");
    expect(seniorPrompt).toContain("球数番号記入式");
    expect(seniorPrompt).toContain("無走者バント凡退でも四角『□』");
    expect(seniorPrompt).toContain("1A(一塁)・6B(二封)・5C(三封)・2H(本封)");
    expect(seniorPrompt).toContain("内野安打は右下に赤丸囲み");

    const stdPrompt = formatTeamSymbolRulesForAiPrompt(
      STANDARD_SCOREBOOK_SYMBOL_RULES
    );
    expect(stdPrompt).toContain("手書き実線でなぞる流儀");
    expect(formatTeamSymbolRulesForAiPrompt(null)).toBe("");
  });
});

