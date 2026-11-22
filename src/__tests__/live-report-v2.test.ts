// filepath: src/__tests__/live-report-v2.test.ts
import { describe, expect, it } from "vitest";
import {
  applyFinalStateToPlayEntry,
  applyLineupEditorStateToDoc,
  buildAttachedPitchesForAtBat,
  computeHalfInningSituation,
  computeLiveReportPitchCounts,
  computeScoreboardSummary,
  computeSituationBeforeEntry,
  createInitialLiveReportDocument,
  extractEditablePendingPitches,
  extractLineupEditorStateFromDoc,
  formatLiveReportText,
  getEffectiveEntryFinalState,
  getHalfInningRuns,
  hasMeaningfulDocLineupData,
  hydrateLiveReportFromLegacyLogsAndScores,
  inferPadSelectionFromPlayEntry,
  mergeSavedMatchLineupIntoDoc,
  reconcileHalfInningManualRuns,
  replaceHalfInningPlayEntry,
  resolveDisplayedLiveReportText,
  sanitizeLiveReportDocument,
  serializeDocLineupForMatchStorage,
  splitLoadedMyLineupSlots,
} from "@/lib/liff/live-report-v2";
import type {
  LiveReportHalfInning,
  LiveReportPlayEntry,
} from "@/types/live-report-v2";

function makeBatterEntry(
  overrides: Partial<LiveReportPlayEntry> = {}
): LiveReportPlayEntry {
  return {
    id: overrides.id ?? "ab-1",
    entryType: "batter",
    battingOrder: 1,
    batterName: "山田 太郎",
    playText: "レフト前ヒット",
    reactionText: "",
    outsAfter: 0,
    runnersAfter: [1],
    runsScored: 0,
    chainedPlays: [],
    eventText: "",
    ...overrides,
  };
}

describe("live-report-v2 fine-tuning & reconciliation", () => {
  it("clears stale manualRunsOverride=0 from legacy hydration when plays are recorded and updates scoreboard", () => {
    const baseDoc = createInitialLiveReportDocument({
      myTeamName: "横浜ドリームズ",
      opponentName: "湘南スターズ",
      battingOrder: "first",
    });

    // Legacy hydration with [0] creates a half-inning with entries: [] and manualRunsOverride: 0
    const hydrated = hydrateLiveReportFromLegacyLogsAndScores({
      baseDoc,
      playLogs: [],
      myInningScores: [0],
      opponentInningScores: [],
      matchStatus: "live",
    });

    const topFirst = hydrated.halfInnings.find(
      (h) => h.inning === 1 && !h.isBottom
    );
    expect(topFirst).toBeDefined();
    expect(topFirst?.manualRunsOverride).toBe(0);

    // Append a 2-run home run entry and reconcile manualRunsOverride
    const scoringEntry = makeBatterEntry({
      id: "ab-hr",
      playText: "レフト越え2ランホームラン",
      outsAfter: 0,
      runnersAfter: [],
      runsScored: 2,
      rbi: 2,
    });
    const nextEntries = [scoringEntry];
    const nextOverride = reconcileHalfInningManualRuns(
      topFirst!,
      nextEntries,
      "append_or_remove"
    );
    expect(nextOverride).toBeNull();

    const updatedDoc = {
      ...hydrated,
      halfInnings: hydrated.halfInnings.map((h) =>
        h.inning === 1 && !h.isBottom
          ? { ...h, entries: nextEntries, manualRunsOverride: nextOverride }
          : h
      ),
    };

    const summary = computeScoreboardSummary(updatedDoc);
    expect(summary.firstInningScores[0]).toBe(2);
    expect(summary.firstTotal).toBe(2);
  });

  it("adjusts manualRunsOverride by score delta when editing an existing entry", () => {
    const entry1 = makeBatterEntry({ id: "ab-1", runsScored: 1 });
    const halfWithExtraManualRun: LiveReportHalfInning = {
      inning: 1,
      isBottom: false,
      entries: [entry1],
      // Suppose +2 manual score was set (1 from play + 1 unrecorded balk)
      manualRunsOverride: 2,
    };

    // Edit entry1 from 1 run to 3 runs (+2 delta) -> manual override shifts from 2 to 4
    const editedEntry = { ...entry1, runsScored: 3 };
    expect(
      reconcileHalfInningManualRuns(
        halfWithExtraManualRun,
        [editedEntry],
        "edit_entry"
      )
    ).toBe(4);

    // If manualRunsOverride matched oldSum (1), editing entry1 to 2 clears override to null
    const syncedHalf: LiveReportHalfInning = {
      inning: 1,
      isBottom: false,
      entries: [entry1],
      manualRunsOverride: 1,
    };
    expect(
      reconcileHalfInningManualRuns(
        syncedHalf,
        [{ ...entry1, runsScored: 2 }],
        "edit_entry"
      )
    ).toBeNull();
  });

  it("updates final outs/runners on the last chainedPlay when chainedPlays exist", () => {
    const entryWithSteal = makeBatterEntry({
      id: "ab-steal",
      outsAfter: 0,
      runnersAfter: [1],
      runsScored: 0,
      chainedPlays: [
        {
          id: "cp-1",
          playText: "二盗成功",
          outsAfter: 0,
          runnersAfter: [2],
          runsScored: 0,
        },
      ],
    });

    expect(getEffectiveEntryFinalState(entryWithSteal)).toEqual({
      outsAfter: 0,
      runnersAfter: [2],
    });

    // Fine-tune outsAfter to 1 and runnersAfter to [3], runsScored to 1
    const updated = applyFinalStateToPlayEntry(entryWithSteal, {
      outsAfter: 1,
      runnersAfter: [3],
      runsScored: 1,
    });

    expect(getEffectiveEntryFinalState(updated)).toEqual({
      outsAfter: 1,
      runnersAfter: [3],
    });
    expect(updated.runsScored).toBe(1);
    expect(updated.rbi).toBe(1);

    const sit = computeHalfInningSituation({
      inning: 1,
      isBottom: false,
      entries: [updated],
      manualRunsOverride: null,
    });
    expect(sit.outs).toBe(1);
    expect(sit.runners).toEqual([3]);
    expect(sit.runs).toBe(1);

    // Setting outsAfter to 3 clears runnersAfter
    const threeOuts = applyFinalStateToPlayEntry(updated, { outsAfter: 3 });
    expect(getEffectiveEntryFinalState(threeOuts)).toEqual({
      outsAfter: 3,
      runnersAfter: [],
    });
  });

  it("applies manualOutsOverride, manualRunnersOverride, and pre-batter br- note entries in computeHalfInningSituation", () => {
    const brNote: LiveReportPlayEntry = {
      id: "br-1234",
      entryType: "note",
      battingOrder: 1,
      batterName: "",
      playText: "",
      reactionText: "",
      outsAfter: 1,
      runnersAfter: [2],
      runsScored: 0,
      chainedPlays: [],
      eventText: "二塁走者牽制アウト（1死2塁）",
    };

    const sitFromBr = computeHalfInningSituation({
      inning: 2,
      isBottom: true,
      entries: [brNote],
      manualRunsOverride: null,
    });
    expect(sitFromBr.outs).toBe(1);
    expect(sitFromBr.runners).toEqual([2]);

    const sitOverridden = computeHalfInningSituation({
      inning: 2,
      isBottom: true,
      entries: [brNote],
      manualRunsOverride: null,
      manualOutsOverride: 2,
      manualRunnersOverride: [1, 3],
    });
    expect(sitOverridden.outs).toBe(2);
    expect(sitOverridden.runners).toEqual([1, 3]);
  });

  it("preserves manual situation and manualTextOverrides in sanitizeLiveReportDocument and resolves displayed text", () => {
    const rawDoc = createInitialLiveReportDocument({
      myTeamName: "横浜ドリームズ",
      opponentName: "湘南スターズ",
    });
    rawDoc.halfInnings = [
      {
        inning: 1,
        isBottom: false,
        entries: [makeBatterEntry({ runsScored: 1, rbi: 1 })],
        manualRunsOverride: null,
        manualOutsOverride: 2,
        manualRunnersOverride: [2, 3],
      },
    ];
    rawDoc.manualTextOverrides = {
      full: "【手動微調整テスト】カスタム速報テキスト",
    };

    const sanitized = sanitizeLiveReportDocument(rawDoc);
    expect(sanitized).not.toBeNull();
    expect(sanitized?.halfInnings[0]?.manualOutsOverride).toBe(2);
    expect(sanitized?.halfInnings[0]?.manualRunnersOverride).toEqual([2, 3]);
    expect(sanitized?.manualTextOverrides?.full).toBe(
      "【手動微調整テスト】カスタム速報テキスト"
    );

    expect(resolveDisplayedLiveReportText(sanitized!, "full")).toBe(
      "【手動微調整テスト】カスタム速報テキスト"
    );
    expect(resolveDisplayedLiveReportText(sanitized!, "latest_inning")).toBe(
      formatLiveReportText(sanitized!, "latest_inning")
    );
  });
});

describe("live-report-v2 unified lineup & two-way match sync", () => {
  it("does not lock positions 1..9 when extracting editor state from a blank initial document", () => {
    const blankDoc = createInitialLiveReportDocument({
      myTeamName: "〇〇チーム",
      opponentName: "対戦チーム",
    });
    expect(hasMeaningfulDocLineupData(blankDoc)).toBe(false);

    const extracted = extractLineupEditorStateFromDoc(blankDoc);
    expect(extracted.myLineup).toHaveLength(9);
    // Empty slots must have position="" so defensive positions 1..9 are freely selectable
    expect(extracted.myLineup.every((s) => s.position === "")).toBe(true);
    expect(extracted.dhStarterPitcher).toBeNull();
  });

  it("splits order=0 DH starting pitcher cleanly without turning it into 10th batter", () => {
    const rawSavedMyLineup = [
      {
        order: 1,
        position: "6",
        playerId: "p-1",
        name: "佐藤 翔太",
        uniformNumber: "6",
      },
      {
        order: 4,
        position: "DH",
        playerId: "p-4",
        name: "高橋 大輔",
        uniformNumber: "25",
      },
      {
        order: 0,
        position: "1",
        playerId: "p-18",
        name: "伊藤 健太",
        uniformNumber: "18",
      },
    ];

    const split = splitLoadedMyLineupSlots(rawSavedMyLineup);
    expect(split.battingSlots).toHaveLength(9);
    expect(split.battingSlots[0]?.name).toBe("佐藤 翔太");
    expect(split.battingSlots[3]?.position).toBe("DH");
    expect(split.dhPitcher).toEqual({
      order: 0,
      position: "1",
      playerId: "p-18",
      name: "伊藤 健太",
      uniformNumber: "18",
    });
  });

  it("round-trips lineup, DH pitcher, attendance, and opponent lineup while preserving in-game substitutions and play logs", () => {
    let doc = createInitialLiveReportDocument({
      matchId: "match-101",
      myTeamName: "〇〇クラブ",
      opponentName: "相手スワローズ",
      battingOrder: "first",
    });

    // Apply unified lineup editor state (with DH + non-batting starter pitcher + 10 opponent batters)
    doc = applyLineupEditorStateToDoc(doc, {
      myLineup: [
        {
          order: 1,
          position: "8",
          playerId: "p-1",
          name: "山田 太郎",
          uniformNumber: "1",
        },
        {
          order: 2,
          position: "4",
          playerId: "p-2",
          name: "鈴木 次郎",
          uniformNumber: "4",
        },
        {
          order: 3,
          position: "DH",
          playerId: "p-3",
          name: "田中 三郎",
          uniformNumber: "10",
        },
      ],
      dhStarterPitcher: {
        order: 0,
        position: "1",
        playerId: "p-11",
        name: "渡辺 投手",
        uniformNumber: "11",
      },
      opponentLineup: Array.from({ length: 10 }, (_, idx) => ({
        order: idx + 1,
        position: idx < 9 ? String(idx + 1) : "DH",
        name: `相手選手${idx + 1}`,
        uniformNumber: String(idx + 1),
      })),
      opponentBench: [
        {
          id: "ob-1",
          name: "相手控えA",
          uniformNumber: "20",
          position: "2",
        },
      ],
      myAttendance: {
        "p-99": "bench",
        "p-98": "absent",
        "p-97": "excluded",
      },
    });

    expect(hasMeaningfulDocLineupData(doc)).toBe(true);
    expect(doc.lineup[2]?.position).toBe("D");
    expect(doc.dhStarterPitcher?.playerName).toBe("渡辺 投手");
    expect(doc.opponentBatterCount).toBe(10);

    // Lineup announcement text includes DH non-batting starting pitcher
    const lineupText = formatLiveReportText(doc, "lineup");
    expect(lineupText).toContain("3.D 田中");
    expect(lineupText).toContain("先発P 渡辺");

    // Record an in-game substitution on 2nd batter and a defensive pitch count in 1st bottom
    doc = {
      ...doc,
      activeInning: 1,
      activeIsBottom: true,
      lineup: doc.lineup.map((s) =>
        s.order === 2
          ? {
              ...s,
              substitutions: [
                {
                  id: "sub-1",
                  inning: 4,
                  isBottom: false,
                  subType: "PH",
                  oldName: "鈴木 次郎",
                  newName: "中村 代打",
                  newPosition: "4",
                  playerId: "p-99",
                },
              ],
            }
          : s
      ),
      halfInnings: [
        {
          inning: 1,
          isBottom: true,
          manualRunsOverride: null,
          entries: [
            makeBatterEntry({
              id: "opp-ab-1",
              batterName: "",
              pitches: ["strike", "ball", "strike", "strike"],
              pitchCount: 4,
            }),
          ],
        },
      ],
    };

    // Pitch count resolves active pitcher to dhStarterPitcher when no pitcher is in 1..N
    const pitchSummary = computeLiveReportPitchCounts(doc);
    expect(pitchSummary.activeMyPitcherId).toBe("p-11");
    expect(pitchSummary.activeMyPitcherName).toContain("渡辺");
    expect(pitchSummary.activeMyPitcherPitches).toBe(4);

    // Serialize for matches storage and merge back into doc (simulating /liff/matches/lineup save)
    const serialized = serializeDocLineupForMatchStorage(doc);
    expect(serialized.myLineup.some((s) => s.order === 0 && s.playerId === "p-11")).toBe(true);
    expect(serialized.myAttendance?.["p-98"]).toBe("absent");

    // Update 1st batter in match lineup setup and merge back into live report doc
    const updatedPayload = {
      ...serialized,
      myLineup: serialized.myLineup.map((s) =>
        s.order === 1 ? { ...s, name: "山田 改名", uniformNumber: "7" } : s
      ),
    };
    const mergedDoc = mergeSavedMatchLineupIntoDoc(doc, updatedPayload, {
      overwriteFilled: true,
    });

    expect(mergedDoc.lineup[0]?.playerName).toBe("山田 改名");
    expect(mergedDoc.lineup[0]?.uniformNumber).toBe("7");
    // Preserves in-game substitution on 2nd slot and recorded half-innings!
    expect(mergedDoc.lineup[1]?.substitutions).toHaveLength(1);
    expect(mergedDoc.lineup[1]?.substitutions[0]?.newName).toBe("中村 代打");
    expect(mergedDoc.halfInnings).toHaveLength(1);

    // Sanitize preserves all extended fields (including free mode with matchId: null)
    const freeDoc = sanitizeLiveReportDocument({
      ...mergedDoc,
      matchId: null,
    });
    expect(freeDoc?.matchId).toBeNull();
    expect(freeDoc?.dhStarterPitcher?.playerId).toBe("p-11");
    expect(freeDoc?.opponentLineup).toHaveLength(10);
    expect(freeDoc?.opponentBench).toHaveLength(1);
    expect(freeDoc?.myAttendance?.["p-97"]).toBe("excluded");
  });
});

describe("live-report-v2 input-pad re-entry & cascade reconciliation", () => {
  it("computes accurate pre-entry situation including prior chained stolen bases", () => {
    const half: LiveReportHalfInning = {
      inning: 1,
      isBottom: false,
      manualRunsOverride: null,
      manualOutsOverride: 2,
      manualRunnersOverride: [3],
      entries: [
        makeBatterEntry({
          id: "ab-1",
          battingOrder: 1,
          batterName: "山田 太郎",
          playText: "四球",
          resultCode: "walk",
          outsAfter: 0,
          runnersAfter: [1],
          runsScored: 0,
          chainedPlays: [
            {
              id: "cp-1",
              playText: "二盗",
              outsAfter: 0,
              runnersAfter: [2],
              runsScored: 0,
            },
          ],
        }),
        makeBatterEntry({
          id: "ab-2",
          battingOrder: 2,
          batterName: "佐藤 次郎",
          playText: "遊ゴロ二塁走者進塁",
          resultCode: "groundout",
          battedDirection: "遊",
          outsAfter: 1,
          runnersAfter: [3],
          runsScored: 0,
        }),
      ],
    };

    const beforeFirst = computeSituationBeforeEntry(half, "ab-1");
    expect(beforeFirst.outs).toBe(0);
    expect(beforeFirst.runners).toEqual([]);

    const beforeSecond = computeSituationBeforeEntry(half, "ab-2");
    expect(beforeSecond.outs).toBe(0);
    expect(beforeSecond.runners).toEqual([2]);
  });

  it("round-trips editable pending pitches without inflating terminal pitches", () => {
    // 1) Batted ball: B1-S2 (3 pending) -> 4 recorded -> restores 3 pending -> re-builds 4 recorded
    const battedAttached = buildAttachedPitchesForAtBat({
      pendingPitches: ["ball", "strike", "foul"],
      isPitchTrackingActive: true,
      selectedDirect: null,
      selectedBatted: "front_hit",
      selectedBattedVariant: null,
      finalPlayText: "中前ヒット",
    });
    expect(battedAttached).toEqual(["ball", "strike", "foul", "in_play"]);

    const restoredBatted = extractEditablePendingPitches(
      makeBatterEntry({
        resultCode: "front_hit",
        playText: "中前ヒット",
        pitches: battedAttached,
        pitchCount: battedAttached?.length,
      })
    );
    expect(restoredBatted).toEqual(["ball", "strike", "foul"]);

    const rebuiltBatted = buildAttachedPitchesForAtBat({
      pendingPitches: restoredBatted,
      isPitchTrackingActive: true,
      selectedDirect: null,
      selectedBatted: "double",
      selectedBattedVariant: null,
      finalPlayText: "左越二塁打",
    });
    expect(rebuiltBatted).toHaveLength(4);

    // 2) Walk & Strikeout round-trip
    const walkEntry = makeBatterEntry({
      resultCode: "walk",
      playText: "四球",
      pitches: ["ball", "strike", "ball", "ball", "ball"],
      pitchCount: 5,
    });
    const restoredWalk = extractEditablePendingPitches(walkEntry);
    expect(restoredWalk).toEqual(["ball", "strike", "ball", "ball"]);
    expect(
      buildAttachedPitchesForAtBat({
        pendingPitches: restoredWalk,
        isPitchTrackingActive: true,
        selectedDirect: "walk",
        selectedBatted: null,
        selectedBattedVariant: null,
        finalPlayText: "四球",
      })
    ).toHaveLength(5);

    const kEntry = makeBatterEntry({
      resultCode: "strikeout_swing",
      playText: "空三振",
      pitches: ["strike", "foul", "strike"],
      pitchCount: 3,
    });
    const restoredK = extractEditablePendingPitches(kEntry);
    expect(restoredK).toEqual(["strike", "foul"]);
    expect(
      buildAttachedPitchesForAtBat({
        pendingPitches: restoredK,
        isPitchTrackingActive: true,
        selectedDirect: "strikeout_look",
        selectedBatted: null,
        selectedBattedVariant: null,
        finalPlayText: "見逃三振",
      })
    ).toHaveLength(3);
  });

  it("infers pad direction, outcome, flick variant, and runner candidate index from recorded entries", () => {
    // Flick variant + runner advancement candidate ("1塁走者も3塁へ" on 1B runner single)
    const aggrHit = makeBatterEntry({
      resultCode: "front_hit",
      battedDirection: "右",
      playText: "右前ポテンヒット",
      outsAfter: 0,
      runnersAfter: [1, 3],
      runsScored: 0,
    });
    const infHit = inferPadSelectionFromPlayEntry(aggrHit, 0, [1]);
    expect(infHit.direction).toBe("右");
    expect(infHit.directionAnchor).toBe("右");
    expect(infHit.battedCode).toBe("front_hit");
    expect(infHit.battedVariant).toBe("hit_poten");
    expect(infHit.matchedCandidateId).toBe("1b_1to3");
    expect(infHit.customPlayText).toBeNull();

    // Legacy imported entry without resultCode or battedDirection
    const legacyDouble = makeBatterEntry({
      resultCode: undefined,
      battedDirection: undefined,
      playText: "左中間破る適時二塁打1点",
      outsAfter: 1,
      runnersAfter: [2],
      runsScored: 1,
    });
    const infLegacy = inferPadSelectionFromPlayEntry(legacyDouble, 1, [2]);
    expect(infLegacy.direction).toBe("左中間破る");
    expect(infLegacy.directionAnchor).toBe("左中");
    expect(infLegacy.battedCode).toBe("double");
    expect(infLegacy.customPlayText).toBeNull();
  });

  it("replaces an earlier entry on the pad and cascades outs, runners, and runs to subsequent batters", () => {
    const initialHalf: LiveReportHalfInning = {
      inning: 1,
      isBottom: false,
      manualRunsOverride: null,
      entries: [
        makeBatterEntry({
          id: "ab-1",
          battingOrder: 1,
          batterName: "山田",
          resultCode: "groundout",
          battedDirection: "遊",
          playText: "遊ゴロ",
          outsAfter: 1,
          runnersAfter: [],
          runsScored: 0,
        }),
        makeBatterEntry({
          id: "ab-2",
          battingOrder: 2,
          batterName: "佐藤",
          resultCode: "front_hit",
          battedDirection: "中",
          playText: "中前ヒット",
          outsAfter: 1,
          runnersAfter: [1],
          runsScored: 0,
        }),
        makeBatterEntry({
          id: "ab-3",
          battingOrder: 3,
          batterName: "鈴木",
          resultCode: "double",
          battedDirection: "左",
          playText: "左越二塁打",
          outsAfter: 1,
          runnersAfter: [2, 3],
          runsScored: 0,
        }),
      ],
    };

    // Re-enter 1st batter on the pad from "遊ゴロ (1死)" to "四球 (無死1塁)"
    const updatedFirst = makeBatterEntry({
      id: "ab-1",
      battingOrder: 1,
      batterName: "山田",
      resultCode: "walk",
      battedDirection: undefined,
      playText: "四球",
      outsAfter: 0,
      runnersAfter: [1],
      runsScored: 0,
    });

    const reconciled = replaceHalfInningPlayEntry(
      initialHalf,
      "ab-1",
      updatedFirst,
      { cascadeSubsequent: true }
    );

    expect(reconciled.entries[0]?.playText).toBe("四球");
    expect(reconciled.entries[0]?.outsAfter).toBe(0);
    expect(reconciled.entries[0]?.runnersAfter).toEqual([1]);

    // 2nd batter (中前ヒット) automatically updates from 1死1塁 -> 無死1.2塁
    expect(reconciled.entries[1]?.playText).toBe("中前ヒット");
    expect(reconciled.entries[1]?.outsAfter).toBe(0);
    expect(reconciled.entries[1]?.runnersAfter).toEqual([1, 2]);

    // 3rd batter (左越二塁打) automatically updates from 1死2.3塁(0点) -> 無死2.3塁(+1点適時二塁打)
    expect(reconciled.entries[2]?.playText).toBe("左越適時二塁打1点");
    expect(reconciled.entries[2]?.outsAfter).toBe(0);
    expect(reconciled.entries[2]?.runnersAfter).toEqual([2, 3]);
    expect(reconciled.entries[2]?.runsScored).toBe(1);
    expect(getHalfInningRuns(reconciled)).toBe(1);
  });
});


