// filepath: src/__tests__/live-report-v2.test.ts
import { describe, expect, it } from "vitest";
import {
  applyFinalStateToPlayEntry,
  computeHalfInningSituation,
  computeScoreboardSummary,
  createInitialLiveReportDocument,
  formatLiveReportText,
  getEffectiveEntryFinalState,
  hydrateLiveReportFromLegacyLogsAndScores,
  reconcileHalfInningManualRuns,
  resolveDisplayedLiveReportText,
  sanitizeLiveReportDocument,
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
