// filepath: src/app/liff/tools/news-generator/_components/LiveAtBatPadCard.tsx
"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Undo2,
  UserPlus,
  Flag,
  SlidersHorizontal,
  X,
  Footprints,
  Sparkles,
  Copy,
  Check,
  Share2,
  FileText,
  Clock,
  RotateCcw,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LiffSelect } from "@/components/liff/LiffSelect";
import {
  POSITION_OPTIONS,
  buildBattedPlayCandidates,
  computeHalfInningSituation,
  computeScoreboardSummary,
  findActiveDefenderByDirection,
  formatLiveReportText,
  formatPlayerReportName,
  formatSinglePlayEntryLine,
  getCurrentHmText,
  isMyTeamBattingHalf,
  normalizeReportPositionCode,
  normalizeRunnersList,
  resolveActiveLineupAtInning,
  simulateDirectOutcome,
  type BattedOutcomeCode,
  type DirectOutcomeCode,
  type SimulatedPlayCandidate,
} from "@/lib/liff/live-report-v2";
import type {
  LiveReportBaseNum,
  LiveReportHalfInning,
  LiveReportOutputMode,
  LiveReportPlayEntry,
  LiveReportRosterPlayer,
  LiveReportSubType,
  LiveReportV2Document,
} from "@/types/live-report-v2";

interface LiveAtBatPadCardProps {
  doc: LiveReportV2Document;
  onChangeDoc: (
    updater: (prev: LiveReportV2Document) => LiveReportV2Document
  ) => void;
  rosterPlayers: ReadonlyArray<LiveReportRosterPlayer>;
  activeContextKey: string;
  outputMode?: LiveReportOutputMode;
  onChangeOutputMode?: (mode: LiveReportOutputMode) => void;
  onCopyText?: () => void;
  onShareLine?: () => void;
  copied?: boolean;
  onOpenFullPreview?: () => void;
}

const INFIELD_DIRECTIONS = ["投", "捕", "一", "二", "三", "遊"] as const;
const OUTFIELD_DIRECTIONS = ["左", "左中", "中", "右中", "右"] as const;

const DIRECT_OUTCOMES: ReadonlyArray<{
  code: DirectOutcomeCode;
  label: string;
  tone: "out" | "reach";
}> = [
  { code: "strikeout_swing", label: "空三振", tone: "out" },
  { code: "strikeout_look", label: "見三振", tone: "out" },
  { code: "walk", label: "四球", tone: "reach" },
  { code: "hbp", label: "死球", tone: "reach" },
  { code: "ibb", label: "敬遠", tone: "reach" },
  { code: "dropped_3rd_out", label: "振逃死", tone: "out" },
  { code: "dropped_3rd_safe", label: "振逃生", tone: "reach" },
];

const OUT_BATTED_OUTCOMES: ReadonlyArray<{
  code: BattedOutcomeCode;
  label: string;
}> = [
  { code: "groundout", label: "ゴロ" },
  { code: "hard_groundout", label: "強襲ゴロ" },
  { code: "flyout", label: "フライ" },
  { code: "liner", label: "ライナー" },
  { code: "foul_fly", label: "邪飛" },
  { code: "double_play", label: "併殺" },
];

const HIT_BATTED_OUTCOMES: ReadonlyArray<{
  code: BattedOutcomeCode;
  label: string;
}> = [
  { code: "front_hit", label: "前ヒット" },
  { code: "hit", label: "ヒット" },
  { code: "infield_hit", label: "内野安打" },
  { code: "double", label: "二塁打" },
  { code: "triple", label: "三塁打" },
  { code: "homerun", label: "本塁打" },
];

const OTHER_BATTED_OUTCOMES: ReadonlyArray<{
  code: BattedOutcomeCode;
  label: string;
  group: "sac" | "hit" | "err";
}> = [
  { code: "sac_bunt", label: "送りバント", group: "sac" },
  { code: "sac_fly", label: "犠飛", group: "sac" },
  { code: "rh_homerun", label: "走本塁打", group: "hit" },
  { code: "error", label: "エラー", group: "err" },
  { code: "fc", label: "野選", group: "err" },
];

const REACTION_PRESETS = [
  "❗️",
  "‼️",
  "‼️ナイスバッティング‼️",
  "ナイスキャッチ❗️",
  "好守備❗️",
  "惜しい❗️",
] as const;

export function LiveAtBatPadCard({
  doc,
  onChangeDoc,
  rosterPlayers,
  activeContextKey,
  outputMode = "full",
  onChangeOutputMode,
  onCopyText,
  onShareLine,
  copied = false,
  onOpenFullPreview,
}: LiveAtBatPadCardProps) {
  const [mounted, setMounted] = useState(false);
  const [monitorMode, setMonitorMode] = useState<"inning" | "full">("inning");
  const monitorScrollRef = useRef<HTMLDivElement | null>(null);

  // 状況の手動一時変更（タイブレーク無死1・2塁など）
  const [manualStartOuts, setManualStartOuts] = useState<number | null>(null);
  const [manualStartRunners, setManualStartRunners] = useState<
    LiveReportBaseNum[] | null
  >(null);

  // 打席選択状態
  const [selectedDirect, setSelectedDirect] =
    useState<DirectOutcomeCode | null>(null);
  const [selectedDirection, setSelectedDirection] = useState<string>("");
  const [selectedBatted, setSelectedBatted] =
    useState<BattedOutcomeCode | null>(null);
  const [selectedCandidateIdx, setSelectedCandidateIdx] = useState<number>(0);
  const [reactionText, setReactionText] = useState<string>("");

  // 詳細手動微調整モーダル
  const [showCustomOverride, setShowCustomOverride] = useState(false);
  const [customPlayText, setCustomPlayText] = useState("");
  const [customOutsAfter, setCustomOutsAfter] = useState<number | null>(null);
  const [customRunnersAfter, setCustomRunnersAfter] = useState<
    LiveReportBaseNum[] | null
  >(null);
  const [customRunsScored, setCustomRunsScored] = useState<number | null>(null);

  // 選手交代・イベントモーダル
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [subType, setSubType] = useState<LiveReportSubType | "NOTE">("P");
  const [subSlotOrder, setSubSlotOrder] = useState<number>(1);
  const [subPlayerId, setSubPlayerId] = useState<string>("");
  const [subNewName, setSubNewName] = useState<string>("");
  const [subNewPos, setSubNewPos] = useState<string>("1");
  const [subCustomNote, setSubCustomNote] = useState<string>("");

  // 直前走塁追記モーダル
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const [followUpMode, setFollowUpMode] = useState<"inline" | "chained">(
    "chained"
  );
  const [followUpText, setFollowUpText] = useState<string>("");
  const [followUpOuts, setFollowUpOuts] = useState<number>(0);
  const [followUpRunners, setFollowUpRunners] = useState<LiveReportBaseNum[]>(
    []
  );
  const [followUpAddRuns, setFollowUpAddRuns] = useState<number>(0);

  // ゲームセット設定モーダル
  const [isGameSetPanelOpen, setIsGameSetPanelOpen] = useState(false);

  // 現在打者のクイック設定モーダル（ボトム固定ドックの高さを崩さず、iOSズームも防ぐ）
  const [isBatterQuickModalOpen, setIsBatterQuickModalOpen] = useState(false);
  const [quickBatterPlayerId, setQuickBatterPlayerId] = useState<string>("");
  const [quickBatterName, setQuickBatterName] = useState<string>("");
  const [quickBatterPos, setQuickBatterPos] = useState<string>("打");

  useEffect(() => {
    setMounted(true);
  }, []);

  const resetPadSelection = () => {
    setSelectedDirect(null);
    setSelectedDirection("");
    setSelectedBatted(null);
    setSelectedCandidateIdx(0);
    setReactionText("");
    setCustomPlayText("");
    setCustomOutsAfter(null);
    setCustomRunnersAfter(null);
    setCustomRunsScored(null);
  };

  // SKILL.md 規約5: 対象試合やイニング切替時にオーバーレイと一時状態を安全にリセット
  useEffect(() => {
    setIsSubModalOpen(false);
    setIsFollowUpModalOpen(false);
    setShowCustomOverride(false);
    setIsGameSetPanelOpen(false);
    setIsBatterQuickModalOpen(false);
    setManualStartOuts(null);
    setManualStartRunners(null);
    resetPadSelection();
  }, [activeContextKey, doc.activeInning, doc.activeIsBottom]);

  const currentHalf = useMemo(
    () =>
      doc.halfInnings.find(
        (h) =>
          h.inning === doc.activeInning && h.isBottom === doc.activeIsBottom
      ),
    [doc.halfInnings, doc.activeInning, doc.activeIsBottom]
  );

  const autoSituation = useMemo(
    () => computeHalfInningSituation(currentHalf),
    [currentHalf]
  );

  const effectiveOutsBefore =
    manualStartOuts !== null ? manualStartOuts : autoSituation.outs;
  const effectiveRunnersBefore =
    manualStartRunners !== null ? manualStartRunners : autoSituation.runners;

  const isMyAttack = isMyTeamBattingHalf(doc.battingOrder, doc.activeIsBottom);
  const activeLineup = useMemo(
    () =>
      resolveActiveLineupAtInning(
        doc.lineup,
        doc.activeInning,
        doc.activeIsBottom
      ),
    [doc.lineup, doc.activeInning, doc.activeIsBottom]
  );

  const currentOrder = isMyAttack ? doc.nextMyOrder : doc.nextOpponentOrder;
  const activeBatterSlot = isMyAttack
    ? activeLineup.find((s) => s.order === currentOrder) || activeLineup[0]
    : null;

  const activeDefenderSurname = useMemo(() => {
    if (isMyAttack || !selectedDirection) return "";
    return findActiveDefenderByDirection(
      doc.lineup,
      doc.activeInning,
      doc.activeIsBottom,
      selectedDirection,
      doc.showSurnameOnly
    );
  }, [
    isMyAttack,
    selectedDirection,
    doc.lineup,
    doc.activeInning,
    doc.activeIsBottom,
    doc.showSurnameOnly,
  ]);

  const candidates: SimulatedPlayCandidate[] = useMemo(() => {
    const startOuts = effectiveOutsBefore >= 3 ? 0 : effectiveOutsBefore;
    if (selectedDirect) {
      return [
        simulateDirectOutcome(
          selectedDirect,
          startOuts,
          effectiveRunnersBefore
        ),
      ];
    }
    if (selectedBatted) {
      return buildBattedPlayCandidates(
        selectedDirection,
        selectedBatted,
        startOuts,
        effectiveRunnersBefore
      );
    }
    return [];
  }, [
    selectedDirect,
    selectedDirection,
    selectedBatted,
    effectiveOutsBefore,
    effectiveRunnersBefore,
  ]);

  const activeCandidate =
    candidates[
      Math.min(selectedCandidateIdx, Math.max(0, candidates.length - 1))
    ] || null;

  const hasCustomOverride =
    customPlayText.trim().length > 0 ||
    customOutsAfter !== null ||
    customRunnersAfter !== null ||
    customRunsScored !== null;

  const finalPlayText =
    customPlayText.trim() || activeCandidate?.playText || "";
  const finalOutsAfter =
    customOutsAfter !== null
      ? customOutsAfter
      : activeCandidate?.outsAfter ?? Math.min(3, effectiveOutsBefore);
  const finalRunnersAfter =
    finalOutsAfter >= 3
      ? []
      : customRunnersAfter !== null
      ? customRunnersAfter
      : activeCandidate?.runnersAfter ?? effectiveRunnersBefore;
  const finalRunsScored =
    customRunsScored !== null
      ? customRunsScored
      : activeCandidate?.runsScored ?? 0;

  const previewEntry: LiveReportPlayEntry | null = finalPlayText
    ? {
        id: "preview",
        entryType: "batter",
        battingOrder: currentOrder,
        batterName: isMyAttack ? activeBatterSlot?.playerName || "" : "",
        playText: finalPlayText,
        reactionText,
        outsAfter: finalOutsAfter,
        runnersAfter: finalRunnersAfter,
        runsScored: finalRunsScored,
        chainedPlays: [],
        eventText: "",
      }
    : null;

  const previewLine = previewEntry
    ? formatSinglePlayEntryLine(previewEntry, isMyAttack, doc.showSurnameOnly)
    : "";

  const scoreboardSummary = useMemo(() => computeScoreboardSummary(doc), [doc]);

  const handleStepHalfInning = (delta: -1 | 1) => {
    onChangeDoc((prev) => {
      if (delta === 1) {
        if (!prev.activeIsBottom) {
          return { ...prev, activeIsBottom: true };
        }
        return {
          ...prev,
          activeInning: prev.activeInning + 1,
          activeIsBottom: false,
        };
      }
      if (prev.activeIsBottom) {
        return { ...prev, activeIsBottom: false };
      }
      if (prev.activeInning > 1) {
        return {
          ...prev,
          activeInning: prev.activeInning - 1,
          activeIsBottom: true,
        };
      }
      return prev;
    });
  };

  const handleShiftOrder = (delta: -1 | 1) => {
    onChangeDoc((prev) => {
      if (isMyAttack) {
        const limit = Math.max(9, prev.lineup.length);
        const next = ((prev.nextMyOrder - 1 + delta + limit) % limit) + 1;
        return { ...prev, nextMyOrder: next };
      }
      const next = ((prev.nextOpponentOrder - 1 + delta + 9) % 9) + 1;
      return { ...prev, nextOpponentOrder: next };
    });
  };

  const handleRecordAtBat = () => {
    if (!finalPlayText) return;
    const newEntry: LiveReportPlayEntry = {
      id: `ab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      entryType: "batter",
      battingOrder: currentOrder,
      batterName: isMyAttack ? activeBatterSlot?.playerName || "" : "",
      playText: finalPlayText,
      reactionText: reactionText.trim(),
      outsAfter: finalOutsAfter,
      runnersAfter: finalRunnersAfter,
      runsScored: finalRunsScored,
      chainedPlays: [],
      eventText: "",
    };

    onChangeDoc((prev) => {
      const halves = [...prev.halfInnings];
      const idx = halves.findIndex(
        (h) =>
          h.inning === prev.activeInning && h.isBottom === prev.activeIsBottom
      );
      if (idx >= 0) {
        halves[idx] = {
          ...halves[idx],
          entries: [...halves[idx].entries, newEntry],
        };
      } else {
        const created: LiveReportHalfInning = {
          inning: prev.activeInning,
          isBottom: prev.activeIsBottom,
          entries: [newEntry],
          manualRunsOverride: null,
        };
        halves.push(created);
      }

      const limitMy = Math.max(9, prev.lineup.length);
      return {
        ...prev,
        halfInnings: halves,
        nextMyOrder: isMyAttack
          ? (prev.nextMyOrder % limitMy) + 1
          : prev.nextMyOrder,
        nextOpponentOrder: !isMyAttack
          ? (prev.nextOpponentOrder % 9) + 1
          : prev.nextOpponentOrder,
      };
    });

    setShowCustomOverride(false);
    setManualStartOuts(null);
    setManualStartRunners(null);
    resetPadSelection();
  };

  const handleUndoLastEntry = () => {
    if (!currentHalf || currentHalf.entries.length === 0) return;
    const lastEntry = currentHalf.entries[currentHalf.entries.length - 1];

    onChangeDoc((prev) => {
      const halves = prev.halfInnings.map((h) => {
        if (
          h.inning === prev.activeInning &&
          h.isBottom === prev.activeIsBottom
        ) {
          return {
            ...h,
            entries: h.entries.slice(0, -1),
          };
        }
        return h;
      });

      if (lastEntry.entryType === "batter") {
        return {
          ...prev,
          halfInnings: halves,
          nextMyOrder: isMyAttack ? lastEntry.battingOrder : prev.nextMyOrder,
          nextOpponentOrder: !isMyAttack
            ? lastEntry.battingOrder
            : prev.nextOpponentOrder,
        };
      }
      return { ...prev, halfInnings: halves };
    });
  };

  // 現在打者のクイック設定モーダルを開く
  const openBatterQuickModal = () => {
    if (!isMyAttack) return;
    setQuickBatterPlayerId(activeBatterSlot?.playerId || "");
    setQuickBatterName(activeBatterSlot?.playerName || "");
    setQuickBatterPos(
      normalizeReportPositionCode(activeBatterSlot?.position || "打")
    );
    setIsBatterQuickModalOpen(true);
  };

  const handleSaveQuickBatter = () => {
    const trimmedName = quickBatterName.trim();
    const normPos = normalizeReportPositionCode(quickBatterPos || "打");

    onChangeDoc((prev) => ({
      ...prev,
      lineup: prev.lineup.map((s) => {
        if (s.order !== currentOrder) return s;
        if (s.substitutions.length > 0) {
          const nextSubs = [...s.substitutions];
          const lastIdx = nextSubs.length - 1;
          nextSubs[lastIdx] = {
            ...nextSubs[lastIdx],
            newName: trimmedName,
            newPosition: normPos,
            playerId: quickBatterPlayerId || null,
          };
          return { ...s, substitutions: nextSubs };
        }
        return {
          ...s,
          playerName: trimmedName,
          position: normPos,
          playerId: quickBatterPlayerId || null,
        };
      }),
    }));
    setIsBatterQuickModalOpen(false);
  };

  // 直前打席への走塁追記モーダルを開く
  const lastBatterEntry = useMemo(() => {
    if (!currentHalf) return null;
    for (let i = currentHalf.entries.length - 1; i >= 0; i--) {
      if (currentHalf.entries[i].entryType === "batter") {
        return currentHalf.entries[i];
      }
    }
    return null;
  }, [currentHalf]);

  const openFollowUpModal = () => {
    if (!lastBatterEntry) return;
    const lastChain =
      lastBatterEntry.chainedPlays[lastBatterEntry.chainedPlays.length - 1];
    const curOuts = lastChain ? lastChain.outsAfter : lastBatterEntry.outsAfter;
    const curRunners = lastChain
      ? lastChain.runnersAfter
      : lastBatterEntry.runnersAfter;
    setFollowUpMode("chained");
    setFollowUpText("");
    setFollowUpOuts(curOuts);
    setFollowUpRunners(curRunners);
    setFollowUpAddRuns(0);
    setIsFollowUpModalOpen(true);
  };

  const applyFollowUpPreset = (preset: {
    mode: "inline" | "chained";
    text: string;
    outDelta: number;
    advanceAll: boolean;
    clearOutBase?: LiveReportBaseNum;
  }) => {
    if (!lastBatterEntry) return;
    const lastChain =
      lastBatterEntry.chainedPlays[lastBatterEntry.chainedPlays.length - 1];
    const baseOuts = lastChain
      ? lastChain.outsAfter
      : lastBatterEntry.outsAfter;
    const baseRunners = lastChain
      ? lastChain.runnersAfter
      : lastBatterEntry.runnersAfter;

    setFollowUpMode(preset.mode);
    setFollowUpText(preset.text);

    const nextOuts = Math.min(3, baseOuts + preset.outDelta);
    setFollowUpOuts(nextOuts);

    if (nextOuts >= 3) {
      setFollowUpRunners([]);
      setFollowUpAddRuns(0);
      return;
    }

    if (preset.advanceAll) {
      const nextR: LiveReportBaseNum[] = [];
      let scored = 0;
      for (const r of baseRunners) {
        if (r === 3) scored += 1;
        else nextR.push((r + 1) as LiveReportBaseNum);
      }
      setFollowUpRunners(normalizeRunnersList(nextR));
      setFollowUpAddRuns(scored);
    } else if (preset.clearOutBase) {
      setFollowUpRunners(baseRunners.filter((r) => r !== preset.clearOutBase));
      setFollowUpAddRuns(0);
    } else {
      setFollowUpRunners(baseRunners);
      setFollowUpAddRuns(0);
    }
  };

  const handleCommitFollowUp = () => {
    if (!lastBatterEntry || !followUpText.trim()) return;
    const cleanText = followUpText.trim();

    onChangeDoc((prev) => {
      const halves = prev.halfInnings.map((h) => {
        if (
          h.inning !== prev.activeInning ||
          h.isBottom !== prev.activeIsBottom
        ) {
          return h;
        }
        const entries = h.entries.map((e) => {
          if (e.id !== lastBatterEntry.id) return e;
          if (followUpMode === "inline") {
            return {
              ...e,
              playText: `${e.playText}${cleanText}`,
              outsAfter: followUpOuts,
              runnersAfter: followUpOuts >= 3 ? [] : followUpRunners,
              runsScored: e.runsScored + followUpAddRuns,
            };
          }
          return {
            ...e,
            runsScored: e.runsScored + followUpAddRuns,
            chainedPlays: [
              ...e.chainedPlays,
              {
                id: `cp-${Date.now()}`,
                playText: cleanText,
                outsAfter: followUpOuts,
                runnersAfter: followUpOuts >= 3 ? [] : followUpRunners,
                runsScored: followUpAddRuns,
              },
            ],
          };
        });
        return { ...h, entries };
      });
      return { ...prev, halfInnings: halves };
    });

    setIsFollowUpModalOpen(false);
  };

  // 選手交代モーダルを開く
  const openSubstitutionModal = () => {
    if (isMyAttack) {
      setSubType("PH");
      setSubSlotOrder(currentOrder);
      const slot = activeLineup.find((s) => s.order === currentOrder);
      setSubNewPos(slot?.position || "打");
    } else {
      setSubType("P");
      const pitcherSlot =
        activeLineup.find(
          (s) => normalizeReportPositionCode(s.position) === "1"
        ) || activeLineup[0];
      setSubSlotOrder(pitcherSlot?.order || 1);
      setSubNewPos("1");
    }
    setSubPlayerId("");
    setSubNewName("");
    setSubCustomNote("");
    setIsSubModalOpen(true);
  };

  const handleCommitSubstitution = () => {
    if (subType === "NOTE") {
      if (!subCustomNote.trim()) return;
      const noteEntry: LiveReportPlayEntry = {
        id: `note-${Date.now()}`,
        entryType: "note",
        battingOrder: 0,
        batterName: "",
        playText: "",
        reactionText: "",
        outsAfter: 0,
        runnersAfter: [],
        runsScored: 0,
        chainedPlays: [],
        eventText: subCustomNote.trim(),
      };
      onChangeDoc((prev) => {
        const halves = [...prev.halfInnings];
        const idx = halves.findIndex(
          (h) =>
            h.inning === prev.activeInning && h.isBottom === prev.activeIsBottom
        );
        if (idx >= 0) {
          halves[idx] = {
            ...halves[idx],
            entries: [...halves[idx].entries, noteEntry],
          };
        } else {
          halves.push({
            inning: prev.activeInning,
            isBottom: prev.activeIsBottom,
            entries: [noteEntry],
            manualRunsOverride: null,
          });
        }
        return { ...prev, halfInnings: halves };
      });
      setIsSubModalOpen(false);
      return;
    }

    if (!subNewName.trim()) return;
    const targetActiveSlot = activeLineup.find((s) => s.order === subSlotOrder);
    const oldDisplay = formatPlayerReportName(
      targetActiveSlot?.playerName || "",
      doc.showSurnameOnly
    );
    const newDisplay = formatPlayerReportName(subNewName, doc.showSurnameOnly);

    const typeLabel =
      subType === "P"
        ? "投手交代"
        : subType === "PH"
        ? "代打"
        : subType === "PR"
        ? "代走"
        : "守備交代";
    const eventText = oldDisplay
      ? `${typeLabel} ${oldDisplay}→${newDisplay}`
      : `${typeLabel} ${newDisplay}`;

    const subEntry: LiveReportPlayEntry = {
      id: `sub-${Date.now()}`,
      entryType: "substitution",
      battingOrder: 0,
      batterName: "",
      playText: "",
      reactionText: "",
      outsAfter: 0,
      runnersAfter: [],
      runsScored: 0,
      chainedPlays: [],
      eventText,
    };

    onChangeDoc((prev) => {
      const nextLineup = prev.lineup.map((slot) => {
        if (slot.order !== subSlotOrder) return slot;
        return {
          ...slot,
          substitutions: [
            ...slot.substitutions,
            {
              id: `lsub-${Date.now()}`,
              inning: prev.activeInning,
              isBottom: prev.activeIsBottom,
              subType,
              oldName: targetActiveSlot?.playerName || slot.playerName,
              newName: subNewName.trim(),
              newPosition: normalizeReportPositionCode(
                subType === "P" ? "1" : subNewPos || slot.position
              ),
              playerId: subPlayerId || null,
            },
          ],
        };
      });

      const halves = [...prev.halfInnings];
      const idx = halves.findIndex(
        (h) =>
          h.inning === prev.activeInning && h.isBottom === prev.activeIsBottom
      );
      if (idx >= 0) {
        halves[idx] = {
          ...halves[idx],
          entries: [...halves[idx].entries, subEntry],
        };
      } else {
        halves.push({
          inning: prev.activeInning,
          isBottom: prev.activeIsBottom,
          entries: [subEntry],
          manualRunsOverride: null,
        });
      }

      return {
        ...prev,
        lineup: nextLineup,
        halfInnings: halves,
      };
    });

    setIsSubModalOpen(false);
  };

  const nextHalfLabel = doc.activeIsBottom
    ? `${doc.activeInning + 1}回表`
    : `${doc.activeInning}回裏`;

  const currentInningLines = useMemo(() => {
    if (!currentHalf || currentHalf.entries.length === 0) return [];
    return currentHalf.entries
      .map((e) => ({
        id: e.id,
        text: formatSinglePlayEntryLine(e, isMyAttack, doc.showSurnameOnly),
      }))
      .filter((item) => item.text.length > 0);
  }, [currentHalf, isMyAttack, doc.showSurnameOnly]);

  const fullFormattedText = useMemo(
    () => formatLiveReportText(doc, outputMode),
    [doc, outputMode]
  );

  const liveFirstTotal =
    scoreboardSummary.firstTotal +
    (!doc.activeIsBottom ? finalRunsScored : 0);
  const liveSecondTotal =
    scoreboardSummary.secondTotal +
    (doc.activeIsBottom ? finalRunsScored : 0);

  useEffect(() => {
    if (monitorMode === "inning" && monitorScrollRef.current) {
      monitorScrollRef.current.scrollTop =
        monitorScrollRef.current.scrollHeight;
    }
  }, [
    monitorMode,
    currentInningLines.length,
    previewLine,
    doc.activeInning,
    doc.activeIsBottom,
  ]);

  const selectDirection = (dir: string) => {
    setSelectedDirection((prev) => (prev === dir ? "" : dir));
    setSelectedDirect(null);
    setSelectedCandidateIdx(0);
  };

  const selectBattedOutcome = (code: BattedOutcomeCode) => {
    setSelectedBatted((prev) => (prev === code ? null : code));
    setSelectedDirect(null);
    setSelectedCandidateIdx(0);
    setCustomPlayText("");
    setCustomOutsAfter(null);
    setCustomRunnersAfter(null);
    setCustomRunsScored(null);
  };

  const selectDirectOutcome = (code: DirectOutcomeCode) => {
    setSelectedDirect((prev) => (prev === code ? null : code));
    setSelectedBatted(null);
    setSelectedCandidateIdx(0);
    setCustomPlayText("");
    setCustomOutsAfter(null);
    setCustomRunnersAfter(null);
    setCustomRunsScored(null);
  };

  return (
    <>
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* ════════════════════════════════════════════════════════════════
            CENTER ZONE: 可変伸縮する速報ライブモニター（余白をフル活用・外枠スクロール0）
           ════════════════════════════════════════════════════════════════ */}
        <div className="flex-1 min-h-0 flex flex-col bg-slate-900 text-slate-100 overflow-hidden">
          {/* モニター上部固定バー: 表示切替 ＆ ワンタップコピー・LINE送信 */}
          <div className="shrink-0 px-2.5 py-1 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1 min-w-0">
              <button
                type="button"
                onClick={() => setMonitorMode("inning")}
                className={cn(
                  "px-2 py-0.5 rounded-md text-[10.5px] font-black transition-all cursor-pointer shrink-0",
                  monitorMode === "inning"
                    ? "bg-primary text-white"
                    : "bg-slate-800 text-slate-300 hover:text-white"
                )}
              >
                {doc.activeInning}回{doc.activeIsBottom ? "裏" : "表"}
              </button>
              <button
                type="button"
                onClick={() => setMonitorMode("full")}
                className={cn(
                  "px-2 py-0.5 rounded-md text-[10.5px] font-black transition-all cursor-pointer shrink-0",
                  monitorMode === "full"
                    ? "bg-primary text-white"
                    : "bg-slate-800 text-slate-300 hover:text-white"
                )}
              >
                全文
              </button>

              {monitorMode === "inning" ? (
                <span className="ml-1 font-mono text-[10.5px] font-black text-amber-300 truncate">
                  得点{autoSituation.runs + (previewLine ? finalRunsScored : 0)}{" "}
                  ｜ {liveFirstTotal}-{liveSecondTotal}
                </span>
              ) : (
                onChangeOutputMode && (
                  <div className="flex items-center gap-0.5 ml-0.5 bg-slate-900 rounded-md p-0.5 border border-slate-800 shrink-0">
                    {(
                      [
                        { id: "full", label: "全文" },
                        { id: "latest_inning", label: "直近" },
                        { id: "lineup", label: "スタメン" },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onChangeOutputMode(m.id)}
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[9.5px] font-black cursor-pointer",
                          outputMode === m.id
                            ? "bg-amber-400 text-slate-950"
                            : "text-slate-400 hover:text-white"
                        )}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                )
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {onCopyText && (
                <button
                  type="button"
                  onClick={onCopyText}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-[10px] font-black cursor-pointer active:scale-95"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-300">コピー済</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-sky-400" />
                      <span>コピー</span>
                    </>
                  )}
                </button>
              )}
              {onShareLine && (
                <button
                  type="button"
                  onClick={onShareLine}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#06C755] hover:bg-[#05b34c] text-white text-[10px] font-black cursor-pointer active:scale-95"
                >
                  <Share2 className="w-3 h-3" />
                  <span>LINE送信</span>
                </button>
              )}
              {onOpenFullPreview && (
                <button
                  type="button"
                  onClick={onOpenFullPreview}
                  title="全文・出力形式の手直し画面を開く"
                  className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
                >
                  <FileText className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* モニター本文（自動で残り縦幅いっぱいに伸縮し、長くなったらここだけスクロール） */}
          <div
            ref={monitorScrollRef}
            className="flex-1 min-h-0 overflow-y-auto px-3 py-1.5"
          >
            {monitorMode === "inning" ? (
              <div className="space-y-0.5 font-sans text-[11.5px] leading-snug">
                <div className="flex items-center justify-between gap-2 text-[10px] font-black text-slate-400 pb-0.5">
                  <span>
                    {doc.activeInning}回{doc.activeIsBottom ? "裏" : "表"}（
                    {isMyAttack ? "自チーム攻撃" : "相手攻撃"}）
                  </span>
                  {doc.isGameFinished && (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9.5px] font-black">
                      試合終了出力ON
                    </span>
                  )}
                </div>

                {currentInningLines.length === 0 && !previewLine ? (
                  <p className="text-[11px] font-bold text-slate-400 py-1">
                    下のキーパッドで結果を選択 ➔「記録確定」でここに速報行が追加されます
                  </p>
                ) : (
                  currentInningLines.map((line) => (
                    <p
                      key={line.id}
                      className="text-[11.5px] font-bold text-slate-100 break-all"
                    >
                      {line.text}
                    </p>
                  ))
                )}

                {previewLine && (
                  <div className="mt-1 px-2 py-1 rounded-md bg-amber-400/15 border border-amber-400/60 flex items-center justify-between gap-2">
                    <p className="text-[11.5px] font-black text-amber-300 break-all">
                      ➕ {previewLine}
                    </p>
                    <span className="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[9.5px] font-black shrink-0">
                      確定待ち
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="font-sans text-[11px] leading-relaxed text-slate-100 whitespace-pre-wrap">
                {fullFormattedText}
              </div>
            )}
          </div>

          {/* 3アウト到達時のワンタップ次イニング誘導バー */}
          {autoSituation.outs >= 3 && manualStartOuts === null && (
            <div className="shrink-0 px-2.5 py-1.5 bg-slate-950 border-t border-slate-800">
              <button
                type="button"
                onClick={() => handleStepHalfInning(1)}
                className="w-full py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-2xs transition-all active:scale-98 cursor-pointer"
              >
                <span>⚾️ 3アウトチェンジ！ 次の「{nextHalfLabel}」へ進む</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* ════════════════════════════════════════════════════════════════
            BOTTOM DOCK: ボトムナビの代わりに最下部へ固定配置する片手操作パッド
           ════════════════════════════════════════════════════════════════ */}
        <div className="shrink-0 bg-card border-t-2 border-[#0f172a] shadow-[0_-4px_12px_rgba(15,23,42,0.08)] px-2 pt-1.5 pb-[max(env(safe-area-inset-bottom),8px)] space-y-1 select-none">
          {/* ① 状況・打者・サブ操作コンパクトボックス */}
          <div className="rounded-xl border border-border bg-muted/50 px-2 py-1 space-y-1">
            {/* 上段: 回送り ＋ アウト ＋ 走者 ＋ 走塁追記/戻す */}
            <div className="flex items-center justify-between gap-1">
              <div className="inline-flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleStepHalfInning(-1)}
                  disabled={doc.activeInning === 1 && !doc.activeIsBottom}
                  className="w-6 h-6 rounded-lg border border-border bg-card hover:bg-accent disabled:opacity-40 flex items-center justify-center text-foreground cursor-pointer"
                  title="前の回へ"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-1.5 py-0.5 rounded-md bg-[#0f172a] text-white text-[10.5px] font-black">
                  {doc.activeInning}回{doc.activeIsBottom ? "裏" : "表"}
                </span>
                <button
                  type="button"
                  onClick={() => handleStepHalfInning(1)}
                  className="w-6 h-6 rounded-lg border border-border bg-card hover:bg-accent flex items-center justify-center text-foreground cursor-pointer"
                  title="次の回へ"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* アウト数（タップ切替） */}
              <div className="inline-flex items-center gap-1 bg-card border border-border rounded-lg px-1.5 h-6 shrink-0">
                {[0, 1, 2].map((o) => {
                  const active =
                    o < (effectiveOutsBefore >= 3 ? 3 : effectiveOutsBefore);
                  return (
                    <button
                      key={o}
                      type="button"
                      onClick={() => {
                        const target =
                          o + 1 === effectiveOutsBefore ? o : o + 1;
                        setManualStartOuts(target);
                      }}
                      className={cn(
                        "w-3.5 h-3.5 rounded-full border transition-all cursor-pointer",
                        active
                          ? "bg-slate-900 border-slate-900"
                          : "bg-muted border-slate-300"
                      )}
                      title={`${o + 1}アウトに切替`}
                    />
                  );
                })}
                <span className="text-[10px] font-black font-mono text-foreground">
                  {effectiveOutsBefore >= 3 ? "3死" : `${effectiveOutsBefore}死`}
                </span>
              </div>

              {/* 走者ピル（タップで手動ON/OFF可） */}
              <div className="inline-flex items-center gap-0.5 shrink-0">
                {([1, 2, 3] as const).map((b) => {
                  const onBase = effectiveRunnersBefore.includes(b);
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => {
                        const next = onBase
                          ? effectiveRunnersBefore.filter((x) => x !== b)
                          : normalizeRunnersList([
                              ...effectiveRunnersBefore,
                              b,
                            ]);
                        setManualStartRunners(next);
                      }}
                      className={cn(
                        "px-1.5 h-6 rounded-lg text-[10px] font-black border transition-all cursor-pointer",
                        onBase
                          ? "bg-amber-400 text-slate-950 border-amber-500"
                          : "bg-card text-muted-foreground border-border hover:text-foreground"
                      )}
                    >
                      {b}塁
                    </button>
                  );
                })}
              </div>

              {/* 直前走塁追記 ＆ 1つ戻す */}
              <div className="inline-flex items-center gap-1 ml-auto shrink-0">
                <button
                  type="button"
                  disabled={!lastBatterEntry}
                  onClick={openFollowUpModal}
                  className="px-1.5 h-6 rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-40 text-[10px] font-black text-foreground inline-flex items-center gap-0.5 cursor-pointer active:scale-95"
                  title="直前の打席行に盗塁・暴投・走塁死などを追記"
                >
                  <Footprints className="w-3 h-3 text-teal-600 shrink-0" />
                  <span>走塁</span>
                </button>
                <button
                  type="button"
                  disabled={!currentHalf || currentHalf.entries.length === 0}
                  onClick={handleUndoLastEntry}
                  className="px-1.5 h-6 rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-40 text-[10px] font-black text-foreground inline-flex items-center gap-0.5 cursor-pointer active:scale-95"
                  title="直前の1行を取り消す"
                >
                  <Undo2 className="w-3 h-3 text-slate-600 shrink-0" />
                  <span>戻す</span>
                </button>
              </div>
            </div>

            {/* 下段: 現在の打者 ＆ 選手交代・微調整・試合終了 */}
            <div className="flex items-center justify-between gap-1 pt-1 border-t border-border/70">
              <div className="flex items-center gap-1 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => handleShiftOrder(-1)}
                  className="w-6 h-6 rounded-lg bg-card border border-border text-xs font-black text-foreground flex items-center justify-center shrink-0 cursor-pointer active:scale-95"
                >
                  -
                </button>
                <span className="px-1.5 py-0.5 rounded-lg bg-[#0f172a] text-white font-mono text-[10.5px] font-black shrink-0">
                  {currentOrder}番
                </span>
                <button
                  type="button"
                  onClick={() => handleShiftOrder(1)}
                  className="w-6 h-6 rounded-lg bg-card border border-border text-xs font-black text-foreground flex items-center justify-center shrink-0 cursor-pointer active:scale-95"
                >
                  +
                </button>

                {isMyAttack ? (
                  <button
                    type="button"
                    onClick={openBatterQuickModal}
                    className={cn(
                      "min-w-0 ml-0.5 px-2 h-6 rounded-lg border text-left inline-flex items-center gap-1 transition-all cursor-pointer active:scale-95",
                      activeBatterSlot?.playerName
                        ? "bg-card border-border hover:border-primary/40 text-foreground"
                        : "bg-amber-500/15 border-amber-500/45 text-amber-800 dark:text-amber-300"
                    )}
                    title="タップして打者の選手名・守備位置を設定"
                  >
                    {activeBatterSlot?.playerName ? (
                      <>
                        <span className="text-xs font-black truncate">
                          {formatPlayerReportName(
                            activeBatterSlot.playerName,
                            doc.showSurnameOnly
                          )}
                        </span>
                        <span className="text-[9.5px] font-bold text-muted-foreground shrink-0">
                          ({normalizeReportPositionCode(activeBatterSlot.position)})
                        </span>
                        <Pencil className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                      </>
                    ) : (
                      <span className="text-[10.5px] font-black truncate">
                        ＋{currentOrder}番を設定
                      </span>
                    )}
                  </button>
                ) : (
                  <span className="text-[10.5px] font-bold text-muted-foreground ml-1 truncate">
                    相手打者（番号のみ）
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={openSubstitutionModal}
                  className="inline-flex items-center gap-0.5 px-1.5 h-6 rounded-lg bg-card border border-border hover:bg-muted text-[10px] font-black text-primary cursor-pointer active:scale-95"
                >
                  <UserPlus className="w-3 h-3" />
                  <span>{isMyAttack ? "代打/走" : "交代"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowCustomOverride(true)}
                  className={cn(
                    "inline-flex items-center gap-0.5 px-1.5 h-6 rounded-lg border text-[10px] font-black cursor-pointer active:scale-95",
                    hasCustomOverride
                      ? "bg-amber-400 text-slate-950 border-amber-500"
                      : "bg-card text-foreground border-border hover:bg-muted"
                  )}
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  <span>微調整</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsGameSetPanelOpen(true)}
                  className={cn(
                    "inline-flex items-center gap-0.5 px-1.5 h-6 rounded-lg border text-[10px] font-black cursor-pointer active:scale-95",
                    doc.isGameFinished
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-card text-foreground border-border hover:bg-muted"
                  )}
                >
                  <Flag
                    className={cn(
                      "w-3 h-3",
                      doc.isGameFinished ? "text-white" : "text-amber-500"
                    )}
                  />
                  <span>{doc.isGameFinished ? "終了ON" : "終了"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* ② プレビュー ＆ 記録確定バー */}
          <div
            className={cn(
              "rounded-xl border px-2 py-1 transition-all space-y-1",
              finalPlayText
                ? "border-primary bg-primary/8 shadow-2xs"
                : "border-border bg-muted/40"
            )}
          >
            {/* 走者がいる場合の自動進塁パターン切替ピル */}
            {candidates.length > 1 && (
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
                <span className="text-[10px] font-black text-primary shrink-0">
                  走者:
                </span>
                {candidates.map((cand, idx) => {
                  const active = idx === selectedCandidateIdx;
                  return (
                    <button
                      key={cand.id}
                      type="button"
                      onClick={() => {
                        setSelectedCandidateIdx(idx);
                        setCustomPlayText("");
                        setCustomOutsAfter(null);
                        setCustomRunnersAfter(null);
                        setCustomRunsScored(null);
                      }}
                      className={cn(
                        "px-2 py-0.5 rounded-lg border text-[10px] font-black whitespace-nowrap transition-all cursor-pointer",
                        active
                          ? "bg-primary text-primary-foreground border-primary shadow-2xs"
                          : "bg-card text-foreground border-border hover:bg-muted"
                      )}
                    >
                      {cand.chipLabel}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between gap-1.5">
              <div className="min-w-0 flex-1 flex items-center gap-1.5">
                {previewLine ? (
                  <>
                    {finalRunsScored > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-black shrink-0">
                        +{finalRunsScored}点
                      </span>
                    )}
                    <p className="text-xs font-black text-foreground truncate">
                      {previewLine}
                    </p>
                  </>
                ) : (
                  <p className="text-[10.5px] font-bold text-muted-foreground truncate">
                    {selectedDirection
                      ? `方向「${selectedDirection}」を選択中 ➔ 打球結果を選択`
                      : "下のボタンを選択 ➔ 右の「記録確定」をタップ"}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {(selectedDirection ||
                  selectedBatted ||
                  selectedDirect ||
                  hasCustomOverride) && (
                  <button
                    type="button"
                    onClick={resetPadSelection}
                    className="w-7 h-8 rounded-xl border border-border bg-card hover:bg-muted text-muted-foreground flex items-center justify-center cursor-pointer"
                    title="選択をクリア"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  disabled={!finalPlayText}
                  onClick={handleRecordAtBat}
                  className="h-8 px-3.5 rounded-xl bg-primary hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground text-primary-foreground text-xs font-black inline-flex items-center justify-center gap-1 shadow-xs transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>記録確定</span>
                </button>
              </div>
            </div>
          </div>

          {/* ③ 片手親指キーパッド（方向2段 ＋ 結果4段 ＋ 一言リアクション1段） */}
          <div className="space-y-1">
            {/* 打球方向（内野6列 ＋ 外野5列） */}
            <div className="grid grid-cols-6 gap-1">
              {INFIELD_DIRECTIONS.map((dir) => {
                const isSelected = selectedDirection === dir;
                return (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => selectDirection(dir)}
                    className={cn(
                      "h-[30px] rounded-lg border text-xs font-black transition-all cursor-pointer active:scale-95",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-2xs"
                        : "bg-muted/65 text-foreground border-border hover:bg-muted"
                    )}
                  >
                    {dir}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-5 gap-1">
              {OUTFIELD_DIRECTIONS.map((dir) => {
                const isSelected = selectedDirection === dir;
                return (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => selectDirection(dir)}
                    className={cn(
                      "h-[30px] rounded-lg border text-xs font-black transition-all cursor-pointer active:scale-95",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-2xs"
                        : "bg-muted/65 text-foreground border-border hover:bg-muted"
                    )}
                  >
                    {dir}
                  </button>
                );
              })}
            </div>

            {/* Row A: アウト系（6列） */}
            <div className="grid grid-cols-6 gap-1">
              {OUT_BATTED_OUTCOMES.map((item) => {
                const isSelected = selectedBatted === item.code;
                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => selectBattedOutcome(item.code)}
                    className={cn(
                      "h-[30px] px-0.5 rounded-lg border text-[11px] font-black transition-all cursor-pointer active:scale-95 truncate",
                      isSelected
                        ? "bg-[#0f172a] text-white border-[#0f172a] shadow-2xs"
                        : "bg-card text-foreground border-border hover:bg-muted"
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            {/* Row B: 安打系（6列） */}
            <div className="grid grid-cols-6 gap-1">
              {HIT_BATTED_OUTCOMES.map((item) => {
                const isSelected = selectedBatted === item.code;
                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => selectBattedOutcome(item.code)}
                    className={cn(
                      "h-[30px] px-0.5 rounded-lg border text-[11px] font-black transition-all cursor-pointer active:scale-95 truncate",
                      isSelected
                        ? "bg-[#0f172a] text-white border-[#0f172a] shadow-2xs"
                        : "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30 hover:bg-rose-500/15"
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            {/* Row C: 犠打・走本・エラー・野選（5列） */}
            <div className="grid grid-cols-5 gap-1">
              {OTHER_BATTED_OUTCOMES.map((item) => {
                const isSelected = selectedBatted === item.code;
                const toneClass =
                  item.group === "sac"
                    ? "bg-amber-500/12 text-amber-800 dark:text-amber-300 border-amber-500/35 hover:bg-amber-500/20"
                    : item.group === "hit"
                    ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30 hover:bg-rose-500/15"
                    : "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30 hover:bg-purple-500/15";
                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => selectBattedOutcome(item.code)}
                    className={cn(
                      "h-[30px] px-0.5 rounded-lg border text-[11px] font-black transition-all cursor-pointer active:scale-95 truncate",
                      isSelected
                        ? "bg-[#0f172a] text-white border-[#0f172a] shadow-2xs"
                        : toneClass
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            {/* Row D: 1タップ三振・四死球（7列） */}
            <div className="grid grid-cols-7 gap-1">
              {DIRECT_OUTCOMES.map((item) => {
                const isSelected = selectedDirect === item.code;
                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => selectDirectOutcome(item.code)}
                    className={cn(
                      "h-[30px] px-0.5 rounded-lg border text-[10.5px] font-black transition-all cursor-pointer active:scale-95 truncate",
                      isSelected
                        ? "bg-[#0f172a] text-white border-[#0f172a] shadow-2xs"
                        : item.tone === "reach"
                        ? "bg-sky-500/10 text-sky-800 dark:text-sky-300 border-sky-500/30 hover:bg-sky-500/15"
                        : "bg-slate-100 dark:bg-slate-800 text-foreground border-border hover:bg-muted"
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            {/* 一言リアクション・好守備ワンタップ付与（横スクロール1行） */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pt-0.5">
              <span className="text-[10px] font-black text-muted-foreground flex items-center gap-0.5 shrink-0 mr-0.5">
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>一言:</span>
              </span>

              {activeDefenderSurname && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setReactionText((prev) =>
                        prev === `${activeDefenderSurname}ナイスキャッチ❗️`
                          ? ""
                          : `${activeDefenderSurname}ナイスキャッチ❗️`
                      )
                    }
                    className={cn(
                      "px-2 h-[26px] rounded-lg border text-[10px] font-black whitespace-nowrap transition-all cursor-pointer shrink-0",
                      reactionText === `${activeDefenderSurname}ナイスキャッチ❗️`
                        ? "bg-amber-400 text-slate-950 border-amber-500"
                        : "bg-amber-500/12 text-amber-900 dark:text-amber-300 border-amber-500/35"
                    )}
                  >
                    ＋{activeDefenderSurname}ナイスキャッチ❗️
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setReactionText((prev) =>
                        prev === `${activeDefenderSurname}好守備❗️`
                          ? ""
                          : `${activeDefenderSurname}好守備❗️`
                      )
                    }
                    className={cn(
                      "px-2 h-[26px] rounded-lg border text-[10px] font-black whitespace-nowrap transition-all cursor-pointer shrink-0",
                      reactionText === `${activeDefenderSurname}好守備❗️`
                        ? "bg-amber-400 text-slate-950 border-amber-500"
                        : "bg-amber-500/12 text-amber-900 dark:text-amber-300 border-amber-500/35"
                    )}
                  >
                    ＋{activeDefenderSurname}好守備❗️
                  </button>
                </>
              )}

              {REACTION_PRESETS.map((chip) => {
                const isSelected = reactionText === chip;
                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setReactionText(isSelected ? "" : chip)}
                    className={cn(
                      "px-2 h-[26px] rounded-lg border text-[10px] font-black whitespace-nowrap transition-all cursor-pointer shrink-0",
                      isSelected
                        ? "bg-amber-400 text-slate-950 border-amber-500"
                        : "bg-muted/60 text-foreground border-border hover:bg-muted"
                    )}
                  >
                    {chip}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* モーダル1: 現在打者のクイック設定モーダル（createPortal + z-[9999]） */}
      {mounted &&
        isBatterQuickModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            onClick={() => setIsBatterQuickModalOpen(false)}
          >
            <div
              className="w-full sm:max-w-md max-h-[88dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between shrink-0">
                <h3 className="text-sm font-black text-white">
                  {currentOrder}番打者の設定
                </h3>
                <button
                  type="button"
                  onClick={() => setIsBatterQuickModalOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto space-y-3 flex-1">
                {rosterPlayers.length > 0 && (
                  <div className="space-y-1">
                    <label className="block text-xs font-black text-muted-foreground">
                      チーム名簿から1タップ選択
                    </label>
                    <LiffSelect
                      value={quickBatterPlayerId}
                      onChange={(pid) => {
                        setQuickBatterPlayerId(pid);
                        const matched = rosterPlayers.find(
                          (rp) => rp.id === pid
                        );
                        if (matched) {
                          setQuickBatterName(matched.name);
                        }
                      }}
                      options={[
                        {
                          value: "",
                          label: "手入力する（名簿未選択）",
                        },
                        ...rosterPlayers.map((rp) => ({
                          value: rp.id,
                          label: `${
                            rp.uniformNumber ? `#${rp.uniformNumber} ` : ""
                          }${rp.name}`,
                          badge: rp.mainPosition || undefined,
                          badgeTone: "slate" as const,
                          keywords: `${rp.uniformNumber || ""} ${rp.name}`,
                        })),
                      ]}
                      title={`${currentOrder}番打者を名簿から選択`}
                      size="md"
                      searchable={true}
                      searchPlaceholder="選手名・背番号で検索..."
                      className="w-full"
                    />
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="block text-xs font-black text-muted-foreground">
                      守備位置
                    </label>
                    <LiffSelect
                      value={normalizeReportPositionCode(quickBatterPos)}
                      onChange={(val) => setQuickBatterPos(val)}
                      options={[
                        ...POSITION_OPTIONS.map((p) => ({
                          value: p.code,
                          label: p.shortLabel,
                        })),
                        { value: "打", label: "打" },
                      ]}
                      title="守備位置を選択"
                      size="md"
                      searchable={false}
                      className="w-full"
                    />
                  </div>

                  <div className="col-span-2 space-y-1">
                    <label className="block text-xs font-black text-muted-foreground">
                      選手名（自由入力も可）
                    </label>
                    <input
                      type="text"
                      value={quickBatterName}
                      onChange={(e) => setQuickBatterName(e.target.value)}
                      placeholder="例: 山田 太郎"
                      className="w-full h-10 rounded-xl border border-border bg-card px-3 text-base sm:text-xs font-black text-foreground outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-border bg-muted/40 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsBatterQuickModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-border bg-card text-xs font-black text-foreground cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleSaveQuickBatter}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black cursor-pointer active:scale-95"
                >
                  設定する
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* モーダル2: 打席結果の手動微調整モーダル（createPortal + z-[9999]） */}
      {mounted &&
        showCustomOverride &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            onClick={() => setShowCustomOverride(false)}
          >
            <div
              className="w-full sm:max-w-md max-h-[88dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 px-4 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-black text-white">
                    打席結果・走者・得点の微調整
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCustomOverride(false)}
                  className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto space-y-3.5 flex-1">
                {previewLine && (
                  <div className="rounded-xl border border-primary/35 bg-primary/8 px-3 py-2 text-xs font-black text-foreground">
                    プレビュー: {previewLine}
                  </div>
                )}

                <div className="space-y-1">
                  <label className="block text-xs font-black text-muted-foreground">
                    プレー結果テキスト（自由入力・上書き可）
                  </label>
                  <input
                    type="text"
                    value={customPlayText || activeCandidate?.playText || ""}
                    onChange={(e) => setCustomPlayText(e.target.value)}
                    placeholder="例: 中前ヒット中暴投 / 振り逃げセーフ"
                    className="w-full h-10 rounded-xl border border-border bg-card px-3 text-base sm:text-xs font-black text-foreground outline-none focus:border-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-black text-muted-foreground">
                    一言コメント・リアクション（自由入力）
                  </label>
                  <input
                    type="text"
                    value={reactionText}
                    onChange={(e) => setReactionText(e.target.value)}
                    placeholder="例: ナイスラン❗️"
                    className="w-full h-10 rounded-xl border border-border bg-card px-3 text-base sm:text-xs font-black text-foreground outline-none focus:border-primary"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-black text-muted-foreground">
                      後アウト:
                    </span>
                    {[0, 1, 2, 3].map((o) => (
                      <button
                        key={o}
                        type="button"
                        onClick={() => setCustomOutsAfter(o)}
                        className={cn(
                          "w-8 h-8 rounded-lg border text-xs font-black cursor-pointer",
                          finalOutsAfter === o
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-card text-foreground border-border"
                        )}
                      >
                        {o}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="text-xs font-black text-muted-foreground">
                      後走者:
                    </span>
                    {([1, 2, 3] as const).map((b) => {
                      const onB = finalRunnersAfter.includes(b);
                      return (
                        <button
                          key={b}
                          type="button"
                          disabled={finalOutsAfter >= 3}
                          onClick={() => {
                            const next = onB
                              ? finalRunnersAfter.filter((x) => x !== b)
                              : normalizeRunnersList([...finalRunnersAfter, b]);
                            setCustomRunnersAfter(next);
                          }}
                          className={cn(
                            "px-2.5 h-8 rounded-lg border text-xs font-black cursor-pointer disabled:opacity-40",
                            onB
                              ? "bg-amber-400 text-slate-950 border-amber-500"
                              : "bg-card text-foreground border-border"
                          )}
                        >
                          {b}塁
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="text-xs font-black text-muted-foreground">
                      得点:
                    </span>
                    {[0, 1, 2, 3, 4].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setCustomRunsScored(r)}
                        className={cn(
                          "w-7 h-8 rounded-lg border text-xs font-black cursor-pointer",
                          finalRunsScored === r
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card text-foreground border-border"
                        )}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-border bg-muted/40 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 flex items-center justify-between gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setCustomPlayText("");
                    setCustomOutsAfter(null);
                    setCustomRunnersAfter(null);
                    setCustomRunsScored(null);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-2.5 rounded-xl border border-border bg-card text-xs font-black text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>リセット</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCustomOverride(false)}
                    className="px-4 py-2.5 rounded-xl border border-border bg-card text-xs font-black text-foreground cursor-pointer"
                  >
                    適用して戻る
                  </button>
                  <button
                    type="button"
                    disabled={!finalPlayText}
                    onClick={handleRecordAtBat}
                    className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground disabled:opacity-40 text-xs font-black inline-flex items-center gap-1 cursor-pointer active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>記録確定</span>
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* モーダル3: 試合終了（ゲームセット）設定モーダル（createPortal + z-[9999]） */}
      {mounted &&
        isGameSetPanelOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            onClick={() => setIsGameSetPanelOpen(false)}
          >
            <div
              className="w-full sm:max-w-md max-h-[88dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Flag className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-black text-white">
                    ゲームセット（試合終了行）の設定
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsGameSetPanelOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto space-y-3.5 flex-1">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/45 p-3">
                  <div>
                    <p className="text-xs font-black text-foreground">
                      速報末尾に「試合終了」行を出力する
                    </p>
                    <p className="text-[10.5px] font-bold text-muted-foreground">
                      ONにすると最終スコアと結びコメントが付与されます
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeDoc((p) => ({
                        ...p,
                        isGameFinished: !p.isGameFinished,
                        endTime:
                          !p.isGameFinished && !p.endTime.trim()
                            ? getCurrentHmText()
                            : p.endTime,
                      }))
                    }
                    className={cn(
                      "px-3.5 py-2 rounded-xl text-xs font-black shrink-0 cursor-pointer transition-all active:scale-95",
                      doc.isGameFinished
                        ? "bg-emerald-600 text-white"
                        : "bg-card border border-border text-foreground"
                    )}
                  >
                    {doc.isGameFinished ? "試合終了ON" : "試合終了にする"}
                  </button>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-black text-muted-foreground">
                    試合終了時刻
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 rounded-xl border border-border bg-card px-3 h-10">
                      <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                      <input
                        type="text"
                        value={doc.endTime}
                        onChange={(e) =>
                          onChangeDoc((p) => ({
                            ...p,
                            endTime: e.target.value,
                          }))
                        }
                        placeholder="例: 13:17"
                        className="w-full bg-transparent text-base sm:text-xs font-mono font-black text-foreground outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onChangeDoc((p) => ({
                          ...p,
                          endTime: getCurrentHmText(),
                        }))
                      }
                      className="h-10 px-3 rounded-xl border border-border bg-muted hover:bg-accent text-xs font-black text-primary shrink-0 cursor-pointer active:scale-95"
                    >
                      現在時刻
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-black text-muted-foreground">
                    結びコメント（タップで自動セット＆試合終了ON）
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      "勝利❗️応援ありがとうございました🙌",
                      "快勝‼️",
                      "惜敗。。",
                      "引き分け",
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() =>
                          onChangeDoc((p) => ({
                            ...p,
                            isGameFinished: true,
                            endTime: p.endTime.trim()
                              ? p.endTime
                              : getCurrentHmText(),
                            closingComment: preset,
                          }))
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-card border border-border hover:bg-muted text-[11px] font-black text-foreground cursor-pointer"
                      >
                        ＋{preset}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={doc.closingComment}
                    onChange={(e) =>
                      onChangeDoc((p) => ({
                        ...p,
                        closingComment: e.target.value,
                      }))
                    }
                    placeholder="結びコメント（例: 惜敗。。 / 見事勝利❗️）"
                    className="w-full h-10 rounded-xl border border-border bg-card px-3 text-base sm:text-xs font-bold text-foreground outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="border-t border-border bg-muted/40 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsGameSetPanelOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-border bg-card text-xs font-black text-foreground cursor-pointer"
                >
                  閉じる
                </button>
                {onShareLine && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsGameSetPanelOpen(false);
                      onShareLine();
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white text-xs font-black inline-flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>LINEで速報送信</span>
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* モーダル4: 選手交代・自由メモモーダル（createPortal + z-[9999]） */}
      {mounted &&
        isSubModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            onClick={() => setIsSubModalOpen(false)}
          >
            <div
              className="w-full sm:max-w-md max-h-[88dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-sky-400" />
                  <h3 className="text-sm font-black text-white">
                    選手交代・イベント行を追加（{doc.activeInning}回
                    {doc.activeIsBottom ? "裏" : "表"}）
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSubModalOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto space-y-3.5 flex-1">
                <div className="grid grid-cols-5 gap-1 bg-muted p-1 rounded-xl border border-border">
                  {(
                    [
                      { id: "P", label: "投手交代" },
                      { id: "PH", label: "代打" },
                      { id: "PR", label: "代走" },
                      { id: "DEF", label: "守備交代" },
                      { id: "NOTE", label: "自由行" },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setSubType(t.id);
                        if (t.id === "P") setSubNewPos("1");
                      }}
                      className={cn(
                        "py-1.5 rounded-lg text-[11px] font-black cursor-pointer",
                        subType === t.id
                          ? "bg-card text-foreground shadow-2xs border border-border"
                          : "text-muted-foreground"
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {subType === "NOTE" ? (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-black text-muted-foreground">
                      イニング内に挿入するテキスト
                    </label>
                    <input
                      type="text"
                      value={subCustomNote}
                      onChange={(e) => setSubCustomNote(e.target.value)}
                      placeholder="例: タイブレーク無死1・2塁から開始"
                      className="w-full h-10 rounded-xl border border-border bg-card px-3 text-base sm:text-xs font-bold text-foreground outline-none focus:border-primary"
                    />
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-black text-muted-foreground">
                        交代する打順枠（以降の打席も自動で新選手名に更新されます）
                      </label>
                      <LiffSelect
                        value={String(subSlotOrder)}
                        onChange={(val) => {
                          const ord = Number(val) || 1;
                          setSubSlotOrder(ord);
                          const found = activeLineup.find(
                            (s) => s.order === ord
                          );
                          if (found && subType !== "P") {
                            setSubNewPos(found.position);
                          }
                        }}
                        options={activeLineup.map((s) => ({
                          value: String(s.order),
                          label: `${s.order}番（現在: ${normalizeReportPositionCode(
                            s.position
                          )} ${s.playerName || "未登録"}）`,
                        }))}
                        title="交代する打順枠を選択"
                        size="md"
                        searchable={false}
                        className="w-full"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <label className="block text-[11px] font-black text-muted-foreground">
                          守備位置
                        </label>
                        <LiffSelect
                          value={normalizeReportPositionCode(subNewPos)}
                          onChange={(val) => setSubNewPos(val)}
                          options={[
                            ...POSITION_OPTIONS.map((p) => ({
                              value: p.code,
                              label: p.shortLabel,
                            })),
                            { value: "打", label: "打" },
                          ]}
                          title="交代後の守備位置を選択"
                          size="md"
                          searchable={false}
                          className="w-full"
                        />
                      </div>

                      <div className="col-span-2 space-y-1">
                        <label className="block text-[11px] font-black text-muted-foreground">
                          交代で入る選手（名簿選択 or 手入力）
                        </label>
                        {rosterPlayers.length > 0 && (
                          <LiffSelect
                            value={subPlayerId}
                            onChange={(pid) => {
                              setSubPlayerId(pid);
                              const matched = rosterPlayers.find(
                                (r) => r.id === pid
                              );
                              if (matched) setSubNewName(matched.name);
                            }}
                            options={[
                              {
                                value: "",
                                label: "チーム名簿から選ぶ...",
                                sublabel: "手入力する場合は未選択のままでOKです",
                              },
                              ...rosterPlayers.map((rp) => ({
                                value: rp.id,
                                label: `${
                                  rp.uniformNumber ? `#${rp.uniformNumber} ` : ""
                                }${rp.name}`,
                                badge: rp.mainPosition || undefined,
                                badgeTone: "slate" as const,
                                keywords: `${rp.uniformNumber || ""} ${rp.name}`,
                              })),
                            ]}
                            placeholder="チーム名簿から選ぶ..."
                            title="交代で入る選手を選択"
                            size="sm"
                            searchable={true}
                            searchPlaceholder="選手名・背番号で検索..."
                            className="w-full h-9 mb-1.5 bg-muted/50"
                          />
                        )}
                        <input
                          type="text"
                          value={subNewName}
                          onChange={(e) => setSubNewName(e.target.value)}
                          placeholder="新しい選手名を入力"
                          className="w-full h-10 rounded-xl border border-border bg-card px-3 text-base sm:text-xs font-black text-foreground outline-none focus:border-primary"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="border-t border-border bg-muted/40 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsSubModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-border bg-card text-xs font-black text-foreground cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleCommitSubstitution}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black cursor-pointer active:scale-95"
                >
                  反映する
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* モーダル5: 直前の打席への走塁追記モーダル（暴投・盗塁・飛び出し封殺等） */}
      {mounted &&
        isFollowUpModalOpen &&
        lastBatterEntry &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            onClick={() => setIsFollowUpModalOpen(false)}
          >
            <div
              className="w-full sm:max-w-md max-h-[88dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 px-4 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Footprints className="w-4 h-4 text-teal-400" />
                  <h3 className="text-sm font-black text-white">
                    直前の打席行に走塁プレーを追記
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFollowUpModalOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto space-y-3.5 flex-1">
                <div className="rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs font-bold text-foreground">
                  対象:{" "}
                  {formatSinglePlayEntryLine(
                    lastBatterEntry,
                    isMyAttack,
                    doc.showSurnameOnly
                  )}
                </div>

                <div className="space-y-1.5">
                  <span className="block text-[11px] font-black text-muted-foreground">
                    1タップ定型プリセット:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      {
                        label: "中暴投（進塁）",
                        mode: "inline" as const,
                        text: "中暴投",
                        outDelta: 0,
                        advanceAll: true,
                      },
                      {
                        label: "暴投（進塁）",
                        mode: "chained" as const,
                        text: "暴投進塁",
                        outDelta: 0,
                        advanceAll: true,
                      },
                      {
                        label: "捕逸（進塁）",
                        mode: "chained" as const,
                        text: "捕逸進塁",
                        outDelta: 0,
                        advanceAll: true,
                      },
                      {
                        label: "盗塁成功",
                        mode: "chained" as const,
                        text: "盗塁",
                        outDelta: 0,
                        advanceAll: true,
                      },
                      {
                        label: "二塁走者飛び出し封殺",
                        mode: "chained" as const,
                        text: "二塁走者飛び出し封殺",
                        outDelta: 1,
                        advanceAll: false,
                        clearOutBase: 2 as LiveReportBaseNum,
                      },
                      {
                        label: "一塁走者飛び出し封殺",
                        mode: "chained" as const,
                        text: "一塁走者飛び出し封殺",
                        outDelta: 1,
                        advanceAll: false,
                        clearOutBase: 1 as LiveReportBaseNum,
                      },
                      {
                        label: "盗塁死",
                        mode: "chained" as const,
                        text: "盗塁死",
                        outDelta: 1,
                        advanceAll: false,
                        clearOutBase: 1 as LiveReportBaseNum,
                      },
                      {
                        label: "牽制死",
                        mode: "chained" as const,
                        text: "牽制死",
                        outDelta: 1,
                        advanceAll: false,
                        clearOutBase: 1 as LiveReportBaseNum,
                      },
                    ].map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => applyFollowUpPreset(p)}
                        className="px-2.5 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-[11px] font-black text-foreground cursor-pointer"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5 bg-muted p-1 rounded-xl border border-border">
                  <button
                    type="button"
                    onClick={() => setFollowUpMode("chained")}
                    className={cn(
                      "py-1.5 rounded-lg text-[11px] font-black cursor-pointer",
                      followUpMode === "chained"
                        ? "bg-card text-foreground shadow-2xs"
                        : "text-muted-foreground"
                    )}
                  >
                    後ろに連結（⚫️2塁　〇〇　⚫️⚫️⚫️）
                  </button>
                  <button
                    type="button"
                    onClick={() => setFollowUpMode("inline")}
                    className={cn(
                      "py-1.5 rounded-lg text-[11px] font-black cursor-pointer",
                      followUpMode === "inline"
                        ? "bg-card text-foreground shadow-2xs"
                        : "text-muted-foreground"
                    )}
                  >
                    結果に直結（中前ヒット中暴投　⚫️2塁）
                  </button>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-black text-muted-foreground">
                    追記テキスト
                  </label>
                  <input
                    type="text"
                    value={followUpText}
                    onChange={(e) => setFollowUpText(e.target.value)}
                    placeholder="例: 二塁走者飛び出し封殺 / 盗塁"
                    className="w-full h-10 rounded-xl border border-border bg-card px-3 text-base sm:text-xs font-black text-foreground outline-none focus:border-primary"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] font-black text-muted-foreground">
                      後アウト:
                    </span>
                    {[0, 1, 2, 3].map((o) => (
                      <button
                        key={o}
                        type="button"
                        onClick={() => setFollowUpOuts(o)}
                        className={cn(
                          "w-7 h-7 rounded-lg border text-xs font-black cursor-pointer",
                          followUpOuts === o
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-card text-foreground border-border"
                        )}
                      >
                        {o}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="text-[11px] font-black text-muted-foreground">
                      後走者:
                    </span>
                    {([1, 2, 3] as const).map((b) => {
                      const active = followUpRunners.includes(b);
                      return (
                        <button
                          key={b}
                          type="button"
                          disabled={followUpOuts >= 3}
                          onClick={() =>
                            setFollowUpRunners(
                              active
                                ? followUpRunners.filter((x) => x !== b)
                                : normalizeRunnersList([...followUpRunners, b])
                            )
                          }
                          className={cn(
                            "px-2 h-7 rounded-lg border text-[11px] font-black cursor-pointer disabled:opacity-40",
                            active
                              ? "bg-amber-400 text-slate-950 border-amber-500"
                              : "bg-card text-foreground border-border"
                          )}
                        >
                          {b}塁
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="text-[11px] font-black text-muted-foreground">
                      追加得点:
                    </span>
                    {[0, 1, 2].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setFollowUpAddRuns(r)}
                        className={cn(
                          "w-7 h-7 rounded-lg border text-xs font-black cursor-pointer",
                          followUpAddRuns === r
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card text-foreground border-border"
                        )}
                      >
                        +{r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-border bg-muted/40 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsFollowUpModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-border bg-card text-xs font-black text-foreground cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={!followUpText.trim()}
                  onClick={handleCommitFollowUp}
                  className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-xs font-black cursor-pointer active:scale-95"
                >
                  この打席行に追記する
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
