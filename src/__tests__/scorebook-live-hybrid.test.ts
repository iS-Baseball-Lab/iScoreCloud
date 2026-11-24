// filepath: src/__tests__/scorebook-live-hybrid.test.ts
import { describe, expect, it } from "vitest";
import {
  applyAnchorAtBatResultPreservingPaperPitches,
  detectLiveAnchorDiscrepancies,
  enrichAtBatsWithDigitalAnchor,
  formatDigitalAnchorForInningChunkPrompt,
  formatDigitalAnchorForReconcilePrompt,
  formatDigitalAnchorForStructurePrompt,
  mergeStructureWithDigitalAnchor,
} from "@/lib/liff/scorebook-live-hybrid";
import { validateScorebookSheet } from "@/lib/liff/scorebook-validator";
import type {
  ScorebookRosterPlayer,
  ScorebookSheetStructure,
  ScorebookV2AtBat,
} from "@/types/scorebook-v2";

function makeAtBat(overrides: Partial<ScorebookV2AtBat>): ScorebookV2AtBat {
  return {
    id: overrides.id ?? "ab-1",
    inning: overrides.inning ?? 1,
    isTop: overrides.isTop ?? true,
    columnIndex: overrides.columnIndex ?? 1,
    battingOrder: overrides.battingOrder ?? 1,
    batterName: overrides.batterName ?? "山田 太郎",
    batterPlayerId:
      overrides.batterPlayerId !== undefined ? overrides.batterPlayerId : "p1",
    pitcherName: overrides.pitcherName ?? "相手投手",
    pitcherPlayerId:
      overrides.pitcherPlayerId !== undefined
        ? overrides.pitcherPlayerId
        : null,
    resultCode: overrides.resultCode ?? "groundout",
    resultLabel: overrides.resultLabel ?? "遊ゴロ",
    battedDirection: overrides.battedDirection ?? "6-3",
    rbi: overrides.rbi ?? 0,
    outsInPlay: overrides.outsInPlay ?? 1,
    endingOuts: overrides.endingOuts ?? 1,
    runsInPlay: overrides.runsInPlay ?? 0,
    balls: overrides.balls ?? 1,
    strikes: overrides.strikes ?? 2,
    pitches: overrides.pitches ?? ["ball", "strike", "foul", "in_play"],
    advances: overrides.advances ?? [
      {
        id: "adv-1",
        runnerName: "山田 太郎",
        from: "BAT",
        to: "1B",
        method: "other",
        isOut: true,
      },
    ],
    pinchRunners: overrides.pinchRunners,
    confidence: overrides.confidence ?? "high",
    confidenceReason: overrides.confidenceReason,
    cellBox: overrides.cellBox,
  };
}

function makeStructure(
  overrides: Partial<ScorebookSheetStructure> = {}
): ScorebookSheetStructure {
  return {
    isTop: overrides.isTop ?? true,
    isMyTeamBatting: overrides.isMyTeamBatting ?? true,
    batters:
      overrides.batters ??
      Array.from({ length: 9 }, (_, i) => ({
        battingOrder: i + 1,
        name: `選手${i + 1}`,
        uniformNumber: String(i + 1),
        position: String(i + 1),
        playerId: `p${i + 1}`,
        substitutions: [],
        rowBox: [100 + i * 70, 50, 170 + i * 70, 220],
      })),
    pitchers: overrides.pitchers ?? [
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
    innings: overrides.innings ?? [
      {
        inning: 1,
        columnCount: 1,
        runs: 0,
        hits: 0,
        columnBox: [100, 230, 730, 310],
      },
    ],
    totalRuns: overrides.totalRuns ?? 0,
    totalHits: overrides.totalHits ?? 0,
    totalErrors: overrides.totalErrors ?? 0,
    lineupRightX: overrides.lineupRightX ?? 230,
    gridCorners: overrides.gridCorners ?? {
      tl: [230, 100],
      tr: [790, 102],
      br: [788, 732],
      bl: [228, 730],
    },
  };
}

describe("scorebook-live-hybrid", () => {
  it("mergeStructureWithDigitalAnchor preserves scanned grid geometry & handwritten opponent names while restoring playerIds, substitutions, and reliever stints", () => {
    const roster: ScorebookRosterPlayer[] = [
      {
        id: "p1",
        name: "山田 太郎",
        nameKana: "やまだ たろう",
        uniformNumber: "10",
        primaryPosition: "6",
        bats: "R",
      },
      {
        id: "p12",
        name: "佐藤 次郎",
        nameKana: "さとう じろう",
        uniformNumber: "12",
        primaryPosition: "9",
        bats: "L",
      },
    ];

    // 1) 自チーム攻撃シート: 紙面読取で1番のplayerIdと5回の代打が漏れたケース
    const scannedMySide = makeStructure({
      isTop: true,
      isMyTeamBatting: true,
      batters: [
        {
          battingOrder: 1,
          name: "山田",
          uniformNumber: "10",
          position: "6",
          playerId: null,
          substitutions: [],
          rowBox: [110, 48, 178, 225],
        },
      ],
    });
    const anchorMySide = makeStructure({
      isTop: true,
      isMyTeamBatting: true,
      batters: [
        {
          battingOrder: 1,
          name: "山田 太郎",
          uniformNumber: "10",
          position: "6",
          playerId: "p1",
          bats: "R",
          substitutions: [
            {
              id: "sub-ph-5",
              inningEntered: 5,
              subType: "PH",
              name: "佐藤 次郎",
              uniformNumber: "12",
              position: "9",
              playerId: "p12",
              bats: "L",
            },
          ],
        },
      ],
      gridCorners: undefined,
    });

    const mergedMy = mergeStructureWithDigitalAnchor(
      scannedMySide,
      anchorMySide,
      roster
    );
    expect(mergedMy.gridCorners).toEqual(scannedMySide.gridCorners);
    expect(mergedMy.batters[0]?.rowBox).toEqual([110, 48, 178, 225]);
    expect(mergedMy.batters[0]?.playerId).toBe("p1");
    expect(mergedMy.batters[0]?.name).toBe("山田 太郎");
    expect(mergedMy.batters[0]?.substitutions).toHaveLength(1);
    expect(mergedMy.batters[0]?.substitutions[0]?.name).toBe("佐藤 次郎");

    // 2) 相手攻撃シート（自チーム守備）: 紙面で手書き相手打者実名「鈴木」が読め、下部投手欄で継投2人目が省略されたケース
    const scannedOppSide = makeStructure({
      isTop: false,
      isMyTeamBatting: false,
      batters: [
        {
          battingOrder: 1,
          name: "鈴木",
          uniformNumber: "8",
          position: "8",
          playerId: null,
          substitutions: [],
        },
        {
          battingOrder: 2,
          name: "相手2番",
          uniformNumber: "",
          position: "4",
          playerId: null,
          substitutions: [],
        },
      ],
      pitchers: [
        {
          id: "pit-scan-1",
          order: 1,
          name: "高橋",
          uniformNumber: "18",
          playerId: null,
          fromInning: 1,
          toInning: 7,
        },
      ],
    });
    const anchorOppSide = makeStructure({
      isTop: false,
      isMyTeamBatting: false,
      batters: [
        {
          battingOrder: 1,
          name: "相手1番",
          uniformNumber: "",
          position: "8",
          playerId: null,
          substitutions: [],
        },
        {
          battingOrder: 2,
          name: "田中",
          uniformNumber: "4",
          position: "4",
          playerId: null,
          substitutions: [],
        },
      ],
      pitchers: [
        {
          id: "pit-a-1",
          order: 1,
          name: "高橋 四郎",
          uniformNumber: "18",
          playerId: "pit18",
          fromInning: 1,
          toInning: 4,
        },
        {
          id: "pit-a-2",
          order: 2,
          name: "伊藤 五郎",
          uniformNumber: "11",
          playerId: "pit11",
          fromInning: 5,
          toInning: 7,
        },
      ],
    });

    const mergedOpp = mergeStructureWithDigitalAnchor(
      scannedOppSide,
      anchorOppSide
    );
    // 手書きで読めた実名「鈴木」は「相手1番」で上書きされない
    expect(mergedOpp.batters[0]?.name).toBe("鈴木");
    // 紙面で読めなかった2番は速報の実名「田中」で補完される
    expect(mergedOpp.batters[1]?.name).toBe("田中");
    // 継投2名（高橋 四郎 ➔ 伊藤 五郎）が復元される
    expect(mergedOpp.pitchers).toHaveLength(2);
    expect(mergedOpp.pitchers[0]?.playerId).toBe("pit18");
    expect(mergedOpp.pitchers[1]?.name).toBe("伊藤 五郎");
  });

  it("enrichAtBatsWithDigitalAnchor preserves paper BSO pitches & fielding numbers while restoring pinchRunners, playerIds, and missed steals", () => {
    const paperAtBats: ScorebookV2AtBat[] = [
      makeAtBat({
        id: "paper-1",
        inning: 2,
        battingOrder: 1,
        batterName: "山田 太郎",
        batterPlayerId: null,
        resultCode: "single",
        resultLabel: "左安",
        battedDirection: "7",
        outsInPlay: 0,
        endingOuts: 0,
        runsInPlay: 0,
        balls: 1,
        strikes: 1,
        pitches: ["ball", "strike", "hit"],
        advances: [
          {
            id: "pa-1",
            runnerName: "山田 太郎",
            from: "BAT",
            to: "1B",
            method: "hit",
            isOut: false,
          },
        ],
      }),
      makeAtBat({
        id: "paper-2",
        inning: 2,
        battingOrder: 2,
        batterName: "佐藤 次郎",
        batterPlayerId: "p2",
        resultCode: "groundout",
        resultLabel: "遊ゴロ",
        battedDirection: "6-3",
        outsInPlay: 1,
        endingOuts: 1,
        runsInPlay: 0,
        balls: 2,
        strikes: 2,
        pitches: ["ball", "strike", "foul", "ball", "foul", "in_play"],
        advances: [
          {
            id: "pa-2",
            runnerName: "佐藤 次郎",
            from: "BAT",
            to: "1B",
            method: "other",
            isOut: true,
          },
        ],
      }),
    ];

    const anchorAtBats: ScorebookV2AtBat[] = [
      makeAtBat({
        id: "live-1",
        inning: 2,
        battingOrder: 1,
        batterName: "山田 太郎",
        batterPlayerId: "p1",
        resultCode: "single",
        resultLabel: "左安",
        battedDirection: "7",
        outsInPlay: 0,
        endingOuts: 0,
        runsInPlay: 0,
        pitches: ["hit"],
        advances: [
          {
            id: "la-1",
            runnerName: "山田 太郎",
            from: "BAT",
            to: "1B",
            method: "hit",
            isOut: false,
          },
        ],
      }),
      makeAtBat({
        id: "live-2",
        inning: 2,
        battingOrder: 2,
        batterName: "佐藤 次郎",
        batterPlayerId: "p2",
        resultCode: "groundout",
        resultLabel: "内ゴロ",
        battedDirection: "",
        outsInPlay: 1,
        endingOuts: 1,
        runsInPlay: 0,
        pitches: ["in_play"],
        pinchRunners: [
          {
            base: "1B",
            subType: "PR",
            battingOrder: 1,
            replacedName: "山田 太郎",
            name: "高橋 四郎",
            uniformNumber: "14",
            playerId: "p14",
          },
        ],
        advances: [
          {
            id: "la-steal",
            runnerName: "高橋 四郎",
            from: "1B",
            to: "2B",
            method: "steal",
            isOut: false,
          },
          {
            id: "la-2",
            runnerName: "佐藤 次郎",
            from: "BAT",
            to: "1B",
            method: "other",
            isOut: true,
          },
        ],
      }),
    ];

    const enriched = enrichAtBatsWithDigitalAnchor(paperAtBats, anchorAtBats);
    expect(enriched[0]?.batterPlayerId).toBe("p1");
    expect(enriched[0]?.pitches).toEqual(["ball", "strike", "hit"]);

    // 2打席目: 紙面の6球順序と「6-3」は100%保持しつつ、速報の代走(PR)と二盗進塁が補完される
    expect(enriched[1]?.pitches).toEqual([
      "ball",
      "strike",
      "foul",
      "ball",
      "foul",
      "in_play",
    ]);
    expect(enriched[1]?.battedDirection).toBe("6-3");
    expect(enriched[1]?.pinchRunners).toHaveLength(1);
    expect(enriched[1]?.pinchRunners?.[0]?.name).toBe("高橋 四郎");
    expect(
      enriched[1]?.advances.some(
        (a) => a.from === "1B" && a.to === "2B" && a.method === "steal"
      )
    ).toBe(true);
  });

  it("detectLiveAnchorDiscrepancies & validateScorebookSheet ignore compatible refinements and flag real conflicts until confirmed", () => {
    const structure = makeStructure({
      innings: [{ inning: 1, columnCount: 1, runs: 0, hits: 1 }],
    });

    const paperAtBats: ScorebookV2AtBat[] = [
      // 1番: 速報は「内ゴロ」、紙面は「遊ゴロ(6-3) + 4球」 -> 互換詳細化なので警告ゼロ
      makeAtBat({
        id: "ab-1",
        inning: 1,
        battingOrder: 1,
        resultCode: "groundout",
        resultLabel: "遊ゴロ",
        battedDirection: "6-3",
        outsInPlay: 1,
        endingOuts: 1,
      }),
      // 2番: 速報は「四球」、紙面は「二ゴロ」に誤読 -> 出塁 vs アウトの重大差異
      makeAtBat({
        id: "ab-2",
        inning: 1,
        battingOrder: 2,
        batterName: "選手2",
        batterPlayerId: "p2",
        resultCode: "groundout",
        resultLabel: "二ゴロ",
        battedDirection: "4-3",
        outsInPlay: 1,
        endingOuts: 2,
      }),
      // 3番: 三振（一致）
      makeAtBat({
        id: "ab-3",
        inning: 1,
        battingOrder: 3,
        batterName: "選手3",
        batterPlayerId: "p3",
        resultCode: "strikeout",
        resultLabel: "空振三振",
        battedDirection: "",
        outsInPlay: 1,
        endingOuts: 3,
        balls: 1,
        strikes: 3,
        pitches: ["ball", "strike", "foul", "swinging_strike"],
      }),
    ];

    const anchorAtBats: ScorebookV2AtBat[] = [
      makeAtBat({
        id: "live-1",
        inning: 1,
        battingOrder: 1,
        resultCode: "groundout",
        resultLabel: "内ゴロ",
        battedDirection: "",
        outsInPlay: 1,
        endingOuts: 1,
        pitches: ["in_play"],
      }),
      makeAtBat({
        id: "live-2",
        inning: 1,
        battingOrder: 2,
        batterName: "選手2",
        batterPlayerId: "p2",
        resultCode: "walk",
        resultLabel: "四球",
        battedDirection: "",
        outsInPlay: 0,
        endingOuts: 1,
        balls: 4,
        strikes: 0,
        pitches: ["ball", "ball", "ball", "ball"],
        advances: [
          {
            id: "l2-adv",
            runnerName: "選手2",
            from: "BAT",
            to: "1B",
            method: "walk",
            isOut: false,
          },
        ],
      }),
      makeAtBat({
        id: "live-3",
        inning: 1,
        battingOrder: 3,
        batterName: "選手3",
        batterPlayerId: "p3",
        resultCode: "dropped_third_strike_out",
        resultLabel: "振逃アウト",
        battedDirection: "K2-3",
        outsInPlay: 1,
        endingOuts: 2,
      }),
    ];

    const diffs = detectLiveAnchorDiscrepancies(paperAtBats, anchorAtBats, true);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.id).toBe("live-diff-t-ab-2");
    expect(diffs[0]?.severity).toBe("error");
    expect(diffs[0]?.atBatId).toBe("ab-2");

    // ユーザーが「紙面読取で確定」を押した後は同一差異IDが抑制される
    const afterConfirm = validateScorebookSheet(paperAtBats, structure, true, {
      anchorAtBats,
      confirmedLiveDiffIds: new Set(["live-diff-t-ab-2"]),
    });
    expect(afterConfirm.some((iss) => iss.id === "live-diff-t-ab-2")).toBe(
      false
    );
  });

  it("applyAnchorAtBatResultPreservingPaperPitches adopts live result while preserving compatible pre-terminal paper pitches", () => {
    // ケース1: 紙面が「遊ゴロ（B, S, F, in_play）」に誤読されていたが、速報の「左安（single）」を採用 -> B, S, F, hit になる
    const paperGroundout = makeAtBat({
      id: "ab-hit-adopt",
      resultCode: "groundout",
      resultLabel: "遊ゴロ",
      battedDirection: "6-3",
      outsInPlay: 1,
      balls: 1,
      strikes: 2,
      pitches: ["ball", "strike", "foul", "in_play"],
    });
    const anchorSingle = makeAtBat({
      id: "live-single",
      resultCode: "single",
      resultLabel: "左安",
      battedDirection: "7",
      outsInPlay: 0,
      runsInPlay: 1,
      rbi: 1,
      pitches: ["hit"],
      advances: [
        {
          id: "la-hp",
          runnerName: "選手1",
          from: "2B",
          to: "HP",
          method: "hit",
          isOut: false,
        },
        {
          id: "la-1b",
          runnerName: "山田 太郎",
          from: "BAT",
          to: "1B",
          method: "hit",
          isOut: false,
        },
      ],
    });

    const adoptedHit = applyAnchorAtBatResultPreservingPaperPitches(
      paperGroundout,
      anchorSingle
    );
    expect(adoptedHit.resultCode).toBe("single");
    expect(adoptedHit.battedDirection).toBe("7");
    expect(adoptedHit.runsInPlay).toBe(1);
    expect(adoptedHit.rbi).toBe(1);
    expect(adoptedHit.pitches).toEqual(["ball", "strike", "foul", "hit"]);
    expect(adoptedHit.balls).toBe(1);
    expect(adoptedHit.strikes).toBe(2);

    // ケース2: 紙面が3ストライク三振に誤読されていたが、速報の「四球（walk）」を採用 -> ストライク上限2に丸めて4ボールを保証
    const paperStrikeout = makeAtBat({
      id: "ab-walk-adopt",
      resultCode: "strikeout",
      resultLabel: "空振三振",
      battedDirection: "",
      outsInPlay: 1,
      balls: 2,
      strikes: 3,
      pitches: ["ball", "strike", "ball", "swinging_strike", "strike"],
    });
    const anchorWalk = makeAtBat({
      id: "live-walk",
      resultCode: "walk",
      resultLabel: "四球",
      battedDirection: "",
      outsInPlay: 0,
      balls: 4,
      strikes: 0,
      pitches: ["ball", "ball", "ball", "ball"],
      advances: [
        {
          id: "lw-1",
          runnerName: "山田 太郎",
          from: "BAT",
          to: "1B",
          method: "walk",
          isOut: false,
        },
      ],
    });

    const adoptedWalk = applyAnchorAtBatResultPreservingPaperPitches(
      paperStrikeout,
      anchorWalk
    );
    expect(adoptedWalk.resultCode).toBe("walk");
    expect(adoptedWalk.outsInPlay).toBe(0);
    expect(adoptedWalk.balls).toBe(4);
    expect(adoptedWalk.strikes).toBe(2);
  });

  it("formats structure, chunk, and reconcile prompts cleanly when digital anchor exists", () => {
    const struct = makeStructure({
      batters: [
        {
          battingOrder: 4,
          name: "山田 太郎",
          uniformNumber: "10",
          position: "2",
          playerId: "p1",
          substitutions: [
            {
              id: "sub-1",
              inningEntered: 6,
              subType: "PR",
              name: "佐藤 次郎",
              uniformNumber: "12",
              position: "2",
              playerId: "p2",
            },
          ],
        },
      ],
      pitchers: [
        {
          id: "pit-1",
          order: 1,
          name: "高橋 四郎",
          uniformNumber: "18",
          playerId: "pit18",
          fromInning: 1,
          toInning: 7,
        },
      ],
    });
    const abs = [
      makeAtBat({
        id: "a1",
        inning: 1,
        battingOrder: 1,
        batterName: "山田 太郎",
        resultCode: "single",
        resultLabel: "中安",
        battedDirection: "8",
        outsInPlay: 0,
      }),
    ];

    const sPrompt = formatDigitalAnchorForStructurePrompt(
      { source: "live_report", structure: struct, atBats: abs },
      true
    );
    expect(sPrompt).toContain("4番枠: 6回〜 PR #12 佐藤 次郎");
    expect(sPrompt).toContain("高橋 四郎");
    expect(sPrompt).toContain("1回=0点(1打席)");

    const cPrompt = formatDigitalAnchorForInningChunkPrompt(abs, [1], true);
    expect(cPrompt).toContain("1回表（速報記録 1打席");
    expect(cPrompt).toContain("中安 (rc:single, dir:8");

    const rPrompt = formatDigitalAnchorForReconcilePrompt(abs, [
      { slotKey: "item-1", inning: 1, battingOrder: 1 },
    ]);
    expect(rPrompt).toContain("[item-1] 1回 1番のLINE速報記録: 中安");
  });
});
