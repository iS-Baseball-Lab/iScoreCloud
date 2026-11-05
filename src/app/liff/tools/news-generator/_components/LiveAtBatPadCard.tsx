// filepath: src/app/liff/tools/news-generator/_components/LiveAtBatPadCard.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Zap,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  POSITION_OPTIONS,
  buildBattedPlayCandidates,
  computeHalfInningSituation,
  computeScoreboardSummary,
  findActiveDefenderByDirection,
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
}

const DIRECTION_BUTTONS = [
  "投",
  "捕",
  "一",
  "二",
  "三",
  "遊",
  "左",
  "中",
  "右",
  "左中",
  "右中",
] as const;

const DIRECT_OUTCOMES: ReadonlyArray<{
  code: DirectOutcomeCode;
  label: string;
  tone: "out" | "reach";
}> = [
  { code: "strikeout_swing", label: "空三振", tone: "out" },
  { code: "strikeout_look", label: "見逃三振", tone: "out" },
  { code: "walk", label: "四球", tone: "reach" },
  { code: "hbp", label: "死球", tone: "reach" },
  { code: "ibb", label: "敬遠", tone: "reach" },
  { code: "dropped_3rd_out", label: "振逃アウト", tone: "out" },
  { code: "dropped_3rd_safe", label: "振逃出塁", tone: "reach" },
];

const BATTED_OUTCOMES: ReadonlyArray<{
  code: BattedOutcomeCode;
  label: string;
  group: "out" | "sac" | "hit" | "err";
}> = [
  { code: "groundout", label: "ゴロ", group: "out" },
  { code: "hard_groundout", label: "強襲ゴロ", group: "out" },
  { code: "flyout", label: "フライ", group: "out" },
  { code: "liner", label: "ライナー", group: "out" },
  { code: "foul_fly", label: "邪飛", group: "out" },
  { code: "double_play", label: "併殺", group: "out" },
  { code: "sac_bunt", label: "送りバント", group: "sac" },
  { code: "sac_fly", label: "犠飛", group: "sac" },
  { code: "front_hit", label: "前ヒット", group: "hit" },
  { code: "hit", label: "ヒット", group: "hit" },
  { code: "infield_hit", label: "内野安打", group: "hit" },
  { code: "double", label: "二塁打", group: "hit" },
  { code: "triple", label: "三塁打", group: "hit" },
  { code: "homerun", label: "本塁打", group: "hit" },
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
}: LiveAtBatPadCardProps) {
  const [mounted, setMounted] = useState(false);

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

  // 詳細手動微調整トグル
  const [showCustomOverride, setShowCustomOverride] = useState(false);
  const [customPlayText, setCustomPlayText] = useState("");
  const [customOutsAfter, setCustomOutsAfter] = useState<number | null>(null);
  const [customRunnersAfter, setCustomRunnersAfter] = useState<
    LiveReportBaseNum[] | null
  >(null);
  const [customRunsScored, setCustomRunsScored] = useState<number | null>(null);

  // モーダル制御
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [subType, setSubType] = useState<LiveReportSubType | "NOTE">("P");
  const [subSlotOrder, setSubSlotOrder] = useState<number>(1);
  const [subPlayerId, setSubPlayerId] = useState<string>("");
  const [subNewName, setSubNewName] = useState<string>("");
  const [subNewPos, setSubNewPos] = useState<string>("1");
  const [subCustomNote, setSubCustomNote] = useState<string>("");

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

  const [isGameSetPanelOpen, setIsGameSetPanelOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // SKILL.md 規約5: 対象試合やイニング切替時に一時状態を安全にリセット
  useEffect(() => {
    setIsSubModalOpen(false);
    setIsFollowUpModalOpen(false);
    setManualStartOuts(null);
    setManualStartRunners(null);
    resetPadSelection();
  }, [activeContextKey, doc.activeInning, doc.activeIsBottom]);

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
  const maxMyOrder = Math.max(9, doc.lineup.length);
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
    candidates[Math.min(selectedCandidateIdx, Math.max(0, candidates.length - 1))] ||
    null;

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

  const handleSelectHalfInning = (inning: number, isBottom: boolean) => {
    onChangeDoc((prev) => ({
      ...prev,
      activeInning: Math.max(1, inning),
      activeIsBottom: isBottom,
    }));
  };

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

  return (
    <>
      <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
        {/* A-3 ダークヘッダーキャップ */}
        <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Zap className="w-4 h-4 text-amber-400 shrink-0" />
            <h2 className="text-xs font-black text-white truncate">
              2. ライブ1打席入力パッド
            </h2>
          </div>
          <span
            className={cn(
              "px-2 py-0.5 rounded text-[10.5px] font-black shrink-0",
              isMyAttack
                ? "bg-primary text-primary-foreground"
                : "bg-slate-800 text-slate-200 border border-slate-700"
            )}
          >
            {doc.activeInning}回{doc.activeIsBottom ? "裏" : "表"} •{" "}
            {isMyAttack ? "自チーム攻撃" : "相手攻撃"}
          </span>
        </div>

        <div className="p-3.5 space-y-3.5">
          {/* ① タップ切替可能なミニスコアボード */}
          <div className="rounded-xl border border-border bg-[#0f172a] text-white overflow-x-auto">
            <table className="w-full text-center font-mono text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] text-slate-400">
                  <th className="py-1.5 px-2.5 text-left font-sans font-black min-w-[68px]">
                    TEAM
                  </th>
                  {Array.from(
                    { length: scoreboardSummary.maxInning },
                    (_, idx) => idx + 1
                  ).map((inn) => (
                    <th
                      key={inn}
                      className={cn(
                        "py-1.5 px-1.5 font-black min-w-[26px]",
                        doc.activeInning === inn && "text-amber-400"
                      )}
                    >
                      {inn}
                    </th>
                  ))}
                  <th className="py-1.5 px-2.5 font-sans font-black text-amber-400 border-l border-slate-800">
                    計
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* 先攻（表） */}
                <tr className="border-b border-slate-800/80">
                  <td className="py-1.5 px-2.5 text-left font-sans text-[11px] font-black truncate">
                    {doc.firstTeamShortName}
                  </td>
                  {scoreboardSummary.firstInningScores.map((sc, idx) => {
                    const inn = idx + 1;
                    const isActiveCell =
                      doc.activeInning === inn && !doc.activeIsBottom;
                    return (
                      <td key={`t-${inn}`} className="p-0.5">
                        <button
                          type="button"
                          onClick={() => handleSelectHalfInning(inn, false)}
                          className={cn(
                            "w-full py-1 rounded-md font-black transition-all cursor-pointer",
                            isActiveCell
                              ? "bg-primary text-white ring-2 ring-sky-300"
                              : "hover:bg-slate-800 text-slate-100"
                          )}
                        >
                          {sc !== null ? sc : "·"}
                        </button>
                      </td>
                    );
                  })}
                  <td className="py-1.5 px-2.5 font-black text-sm text-amber-400 border-l border-slate-800">
                    {scoreboardSummary.firstTotal}
                  </td>
                </tr>

                {/* 後攻（裏） */}
                <tr>
                  <td className="py-1.5 px-2.5 text-left font-sans text-[11px] font-black truncate">
                    {doc.secondTeamShortName}
                  </td>
                  {scoreboardSummary.secondInningScores.map((sc, idx) => {
                    const inn = idx + 1;
                    const isActiveCell =
                      doc.activeInning === inn && doc.activeIsBottom;
                    return (
                      <td key={`b-${inn}`} className="p-0.5">
                        <button
                          type="button"
                          onClick={() => handleSelectHalfInning(inn, true)}
                          className={cn(
                            "w-full py-1 rounded-md font-black transition-all cursor-pointer",
                            isActiveCell
                              ? "bg-primary text-white ring-2 ring-sky-300"
                              : "hover:bg-slate-800 text-slate-100"
                          )}
                        >
                          {sc !== null ? sc : "·"}
                        </button>
                      </td>
                    );
                  })}
                  <td className="py-1.5 px-2.5 font-black text-sm text-amber-400 border-l border-slate-800">
                    {scoreboardSummary.secondTotal}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* イニング送りバー */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => handleStepHalfInning(-1)}
              disabled={doc.activeInning === 1 && !doc.activeIsBottom}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-border bg-muted hover:bg-accent disabled:opacity-40 text-xs font-black text-foreground cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>前の回</span>
            </button>

            <div className="text-center">
              <span className="text-xs font-black text-foreground">
                {doc.activeInning}回{doc.activeIsBottom ? "裏" : "表"}（この回{" "}
                {autoSituation.runs}点）
              </span>
            </div>

            <button
              type="button"
              onClick={() => handleStepHalfInning(1)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-border bg-muted hover:bg-accent text-xs font-black text-foreground cursor-pointer"
            >
              <span>次の回</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 3アウト到達時のワンタップチェンジ誘導バナー */}
          {autoSituation.outs >= 3 && manualStartOuts === null && (
            <button
              type="button"
              onClick={() => handleStepHalfInning(1)}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-2 shadow-xs transition-all active:scale-98 cursor-pointer"
            >
              <span>⚾️ 3アウトチェンジ！ 次の「{nextHalfLabel}」へ進む</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          )}

          {/* ② 現在のアウト・塁状況・打者ステータスバー（タップでタイブレーク等の初期走者調整も可能） */}
          <div className="rounded-xl border border-border bg-muted/45 p-2.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* アウト数 */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10.5px] font-black text-muted-foreground">
                  現在アウト:
                </span>
                <div className="inline-flex items-center gap-1 bg-card border border-border rounded-lg px-2 py-1">
                  {[0, 1, 2].map((o) => {
                    const active = o < (effectiveOutsBefore >= 3 ? 3 : effectiveOutsBefore);
                    return (
                      <button
                        key={o}
                        type="button"
                        onClick={() => {
                          const target = o + 1 === effectiveOutsBefore ? o : o + 1;
                          setManualStartOuts(target);
                        }}
                        className={cn(
                          "w-4 h-4 rounded-full border transition-all cursor-pointer",
                          active
                            ? "bg-slate-900 border-slate-900"
                            : "bg-muted border-slate-300"
                        )}
                        title={`${o + 1}アウトに切替`}
                      />
                    );
                  })}
                  <span className="ml-1 text-[11px] font-black font-mono text-foreground">
                    {effectiveOutsBefore >= 3 ? "3死" : `${effectiveOutsBefore}死`}
                  </span>
                </div>
              </div>

              {/* 走者ピル（タップで手動ON/OFF可＝タイブレーク等にも即対応） */}
              <div className="flex items-center gap-1">
                <span className="text-[10.5px] font-black text-muted-foreground mr-0.5">
                  走者:
                </span>
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
                        "px-2 py-1 rounded-lg text-[10.5px] font-black border transition-all cursor-pointer",
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
            </div>

            {/* 現在の打者 ＆ 選手交代ボタン */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/70">
              <div className="flex items-center gap-1.5 min-w-0">
                <button
                  type="button"
                  onClick={() => handleShiftOrder(-1)}
                  className="w-7 h-7 rounded-lg bg-card border border-border text-xs font-black text-foreground flex items-center justify-center cursor-pointer active:scale-95"
                >
                  -
                </button>
                <span className="px-2 py-1 rounded-lg bg-[#0f172a] text-white font-mono text-xs font-black shrink-0">
                  {currentOrder}番
                </span>
                <button
                  type="button"
                  onClick={() => handleShiftOrder(1)}
                  className="w-7 h-7 rounded-lg bg-card border border-border text-xs font-black text-foreground flex items-center justify-center cursor-pointer active:scale-95"
                >
                  +
                </button>

                {isMyAttack ? (
                  <div className="min-w-0 ml-1">
                    {activeBatterSlot?.playerName ? (
                      <span className="text-sm font-black text-foreground truncate block">
                        {formatPlayerReportName(
                          activeBatterSlot.playerName,
                          doc.showSurnameOnly
                        )}
                        <span className="ml-1 text-[10.5px] font-bold text-muted-foreground">
                          ({normalizeReportPositionCode(activeBatterSlot.position)})
                        </span>
                      </span>
                    ) : (
                      <input
                        type="text"
                        value={activeBatterSlot?.playerName || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          onChangeDoc((prev) => ({
                            ...prev,
                            lineup: prev.lineup.map((s) =>
                              s.order === currentOrder
                                ? { ...s, playerName: val }
                                : s
                            ),
                          }));
                        }}
                        placeholder={`${currentOrder}番の苗字を入力`}
                        className="h-7 w-32 rounded-lg border border-border bg-card px-2 text-xs font-black text-foreground outline-none focus:border-primary"
                      />
                    )}
                  </div>
                ) : (
                  <span className="text-xs font-bold text-muted-foreground ml-1 truncate">
                    相手打者（番号のみ出力）
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={openSubstitutionModal}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-card border border-border hover:bg-muted text-[11px] font-black text-primary shrink-0 cursor-pointer active:scale-95"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>{isMyAttack ? "代打・代走" : "投手・守備交代"}</span>
              </button>
            </div>
          </div>

          {/* ③ A. 1タップ結果（三振・四死球） */}
          <div className="space-y-1.5">
            <span className="block text-[10.5px] font-black text-muted-foreground">
              A. 三振・四死球（1タップ）
            </span>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
              {DIRECT_OUTCOMES.map((item) => {
                const isSelected = selectedDirect === item.code;
                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => {
                      setSelectedDirect(isSelected ? null : item.code);
                      setSelectedBatted(null);
                      setSelectedCandidateIdx(0);
                      setCustomPlayText("");
                      setCustomOutsAfter(null);
                      setCustomRunnersAfter(null);
                      setCustomRunsScored(null);
                    }}
                    className={cn(
                      "py-2 px-1.5 rounded-xl border text-xs font-black transition-all cursor-pointer active:scale-95",
                      isSelected
                        ? "bg-[#0f172a] text-white border-[#0f172a] shadow-xs"
                        : item.tone === "reach"
                        ? "bg-sky-500/10 text-sky-800 dark:text-sky-300 border-sky-500/30 hover:bg-sky-500/15"
                        : "bg-card text-foreground border-border hover:bg-muted"
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ④ B. 打球方向 × 打球結果（2タップ） */}
          <div className="space-y-2">
            <span className="block text-[10.5px] font-black text-muted-foreground">
              B. 打球方向 ➔ 打球結果（2タップ）
            </span>

            {/* 方向ボタン */}
            <div className="grid grid-cols-6 sm:grid-cols-11 gap-1.5">
              {DIRECTION_BUTTONS.map((dir) => {
                const isSelected = selectedDirection === dir;
                return (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => {
                      setSelectedDirection(isSelected ? "" : dir);
                      setSelectedDirect(null);
                      setSelectedCandidateIdx(0);
                    }}
                    className={cn(
                      "py-2 px-1 rounded-xl border text-xs font-black transition-all cursor-pointer active:scale-95",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                        : "bg-muted/60 text-foreground border-border hover:bg-muted"
                    )}
                  >
                    {dir}
                  </button>
                );
              })}
            </div>

            {/* 打球結果ボタン */}
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 pt-0.5">
              {BATTED_OUTCOMES.map((item) => {
                const isSelected = selectedBatted === item.code;
                const toneClass =
                  item.group === "hit"
                    ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30 hover:bg-rose-500/15"
                    : item.group === "sac"
                    ? "bg-amber-500/12 text-amber-800 dark:text-amber-300 border-amber-500/35 hover:bg-amber-500/20"
                    : item.group === "err"
                    ? "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30 hover:bg-purple-500/15"
                    : "bg-card text-foreground border-border hover:bg-muted";

                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => {
                      setSelectedBatted(isSelected ? null : item.code);
                      setSelectedDirect(null);
                      setSelectedCandidateIdx(0);
                      setCustomPlayText("");
                      setCustomOutsAfter(null);
                      setCustomRunnersAfter(null);
                      setCustomRunsScored(null);
                    }}
                    className={cn(
                      "py-2 px-1.5 rounded-xl border text-[11.5px] font-black transition-all cursor-pointer active:scale-95",
                      isSelected
                        ? "bg-[#0f172a] text-white border-[#0f172a] shadow-xs"
                        : toneClass
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ⑤ 走者がいる場合の自動進塁パターン切替ピル */}
          {candidates.length > 1 && (
            <div className="rounded-xl border border-primary/30 bg-primary/6 p-2.5 space-y-1.5 animate-in fade-in duration-150">
              <span className="block text-[10.5px] font-black text-primary">
                走者の動きを選択:
              </span>
              <div className="flex flex-wrap gap-1.5">
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
                        "px-2.5 py-1.5 rounded-lg border text-[11px] font-black transition-all cursor-pointer",
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
            </div>
          )}

          {/* ⑥ 一言リアクション・好守備ワンタップ付与 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-black text-muted-foreground flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>一言リアクション・好守備追記（任意）</span>
              </span>
              <button
                type="button"
                onClick={() => setShowCustomOverride((v) => !v)}
                className="inline-flex items-center gap-1 text-[10.5px] font-black text-primary cursor-pointer"
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>{showCustomOverride ? "詳細調整を閉じる" : "手動微調整"}</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {/* 相手攻撃時、打球方向の自チーム守備選手名を自動サジェスト（例: 赤羽ナイスキャッチ❗️） */}
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
                      "px-2.5 py-1 rounded-lg border text-[11px] font-black transition-all cursor-pointer",
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
                      "px-2.5 py-1 rounded-lg border text-[11px] font-black transition-all cursor-pointer",
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
                      "px-2.5 py-1 rounded-lg border text-[11px] font-black transition-all cursor-pointer",
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

            {/* 手動微調整ドロワー（例外プレー・自由文言・アウト・残塁・得点の完全制御） */}
            {showCustomOverride && (
              <div className="mt-2 rounded-xl border border-border bg-muted/40 p-3 space-y-2.5 animate-in fade-in duration-150">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-black text-muted-foreground">
                      結果文言（自由編集可）
                    </label>
                    <input
                      type="text"
                      value={customPlayText || activeCandidate?.playText || ""}
                      onChange={(e) => setCustomPlayText(e.target.value)}
                      placeholder="例: 中前ヒット中暴投"
                      className="w-full h-8 rounded-lg border border-border bg-card px-2.5 text-xs font-bold text-foreground outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] font-black text-muted-foreground">
                      一言コメント（自由入力）
                    </label>
                    <input
                      type="text"
                      value={reactionText}
                      onChange={(e) => setReactionText(e.target.value)}
                      placeholder="例: ナイスラン❗️"
                      className="w-full h-8 rounded-lg border border-border bg-card px-2.5 text-xs font-bold text-foreground outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-black text-muted-foreground">
                      後アウト:
                    </span>
                    {[0, 1, 2, 3].map((o) => (
                      <button
                        key={o}
                        type="button"
                        onClick={() => setCustomOutsAfter(o)}
                        className={cn(
                          "w-7 h-7 rounded-lg border text-xs font-black cursor-pointer",
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
                    <span className="text-[10px] font-black text-muted-foreground">
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
                            "px-2 h-7 rounded-lg border text-[10.5px] font-black cursor-pointer disabled:opacity-40",
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
                    <span className="text-[10px] font-black text-muted-foreground">
                      この打席得点:
                    </span>
                    {[0, 1, 2, 3, 4].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setCustomRunsScored(r)}
                        className={cn(
                          "w-6 h-7 rounded-lg border text-xs font-black cursor-pointer",
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
            )}
          </div>

          {/* ⑦ 1行リアルタイムプレビュー ＆ 記録確定ボタン */}
          <div className="rounded-xl border border-border bg-muted/50 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-black text-muted-foreground">
                追加される速報行プレビュー:
              </span>
              {finalRunsScored > 0 && (
                <span className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-black">
                  ＋{finalRunsScored}点記録
                </span>
              )}
            </div>

            <div className="min-h-[36px] rounded-lg border border-border bg-card px-3 py-2 flex items-center">
              {previewLine ? (
                <p className="text-xs sm:text-sm font-black text-foreground break-all">
                  {previewLine}
                </p>
              ) : (
                <p className="text-xs font-bold text-muted-foreground">
                  上のボタンから打席結果を選ぶとここに表示されます
                </p>
              )}
            </div>

            <button
              type="button"
              disabled={!finalPlayText}
              onClick={handleRecordAtBat}
              className="w-full py-3 px-4 rounded-xl bg-primary hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground text-primary-foreground text-sm font-black flex items-center justify-center gap-2 shadow-xs transition-all active:scale-98 cursor-pointer disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              <span>
                {doc.activeInning}回{doc.activeIsBottom ? "裏" : "表"}に記録する
              </span>
            </button>
          </div>

          {/* ⑧ サブ操作バー（直前走塁追記・1つ戻す・試合終了設定） */}
          <div className="grid grid-cols-3 gap-2 pt-0.5">
            <button
              type="button"
              disabled={!lastBatterEntry}
              onClick={openFollowUpModal}
              className="py-2 px-2 rounded-xl border border-border bg-card hover:bg-muted disabled:opacity-40 text-[11px] font-black text-foreground flex items-center justify-center gap-1 cursor-pointer active:scale-95"
            >
              <Footprints className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span className="truncate">直前に走塁追記</span>
            </button>

            <button
              type="button"
              disabled={!currentHalf || currentHalf.entries.length === 0}
              onClick={handleUndoLastEntry}
              className="py-2 px-2 rounded-xl border border-border bg-card hover:bg-muted disabled:opacity-40 text-[11px] font-black text-foreground flex items-center justify-center gap-1 cursor-pointer active:scale-95"
            >
              <Undo2 className="w-3.5 h-3.5 text-slate-600 shrink-0" />
              <span className="truncate">1つ戻す</span>
            </button>

            <button
              type="button"
              onClick={() => setIsGameSetPanelOpen((v) => !v)}
              className={cn(
                "py-2 px-2 rounded-xl border text-[11px] font-black flex items-center justify-center gap-1 cursor-pointer active:scale-95",
                doc.isGameFinished
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-card hover:bg-muted text-foreground border-border"
              )}
            >
              <Flag className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="truncate">
                {doc.isGameFinished ? "試合終了ON" : "ゲームセット"}
              </span>
            </button>
          </div>

          {/* 試合終了（ゲームセット）設定パネル */}
          {(isGameSetPanelOpen || doc.isGameFinished) && (
            <div className="rounded-xl border border-slate-300 bg-muted/50 p-3 space-y-2.5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Flag className="w-4 h-4 text-primary" />
                  <span className="text-xs font-black text-foreground">
                    ゲームセット（試合終了行）の出力設定
                  </span>
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
                    "px-3 py-1 rounded-lg text-xs font-black cursor-pointer",
                    doc.isGameFinished
                      ? "bg-emerald-600 text-white"
                      : "bg-card border border-border text-foreground"
                  )}
                >
                  {doc.isGameFinished ? "ゲームセット出力中" : "試合終了にする"}
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10.5px] font-black text-muted-foreground">
                  スコア直後の結びコメント（例:{" "}
                  {scoreboardSummary.firstTotal}-{scoreboardSummary.secondTotal}
                  {doc.closingComment || "〇〇惜敗。。"}）
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
                          closingComment: preset,
                        }))
                      }
                      className="px-2 py-1 rounded-lg bg-card border border-border hover:bg-muted text-[10.5px] font-bold text-foreground cursor-pointer"
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
                  placeholder="例: 惜敗。。 / 見事勝利❗️"
                  className="w-full h-9 rounded-xl border border-border bg-card px-3 text-xs font-bold text-foreground outline-none focus:border-primary"
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* モーダル1: 選手交代・自由メモモーダル（createPortal + z-[9999]） */}
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
                      className="w-full h-10 rounded-xl border border-border bg-card px-3 text-xs font-bold text-foreground outline-none focus:border-primary"
                    />
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-black text-muted-foreground">
                        交代する打順枠（以降の打席も自動で新選手名に更新されます）
                      </label>
                      <select
                        value={subSlotOrder}
                        onChange={(e) => {
                          const ord = Number(e.target.value) || 1;
                          setSubSlotOrder(ord);
                          const found = activeLineup.find(
                            (s) => s.order === ord
                          );
                          if (found && subType !== "P") {
                            setSubNewPos(found.position);
                          }
                        }}
                        className="w-full h-10 rounded-xl border border-border bg-card px-3 text-xs font-black text-foreground outline-none focus:border-primary"
                      >
                        {activeLineup.map((s) => (
                          <option key={s.order} value={s.order}>
                            {s.order}番（現在:{" "}
                            {normalizeReportPositionCode(s.position)}{" "}
                            {s.playerName || "未登録"}）
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <label className="block text-[11px] font-black text-muted-foreground">
                          守備位置
                        </label>
                        <select
                          value={normalizeReportPositionCode(subNewPos)}
                          onChange={(e) => setSubNewPos(e.target.value)}
                          className="w-full h-10 rounded-xl border border-border bg-card px-2 text-xs font-black text-foreground outline-none focus:border-primary"
                        >
                          {POSITION_OPTIONS.map((p) => (
                            <option key={p.code} value={p.code}>
                              {p.shortLabel}
                            </option>
                          ))}
                          <option value="打">打</option>
                        </select>
                      </div>

                      <div className="col-span-2 space-y-1">
                        <label className="block text-[11px] font-black text-muted-foreground">
                          交代で入る選手（名簿選択 or 手入力）
                        </label>
                        {rosterPlayers.length > 0 && (
                          <select
                            value={subPlayerId}
                            onChange={(e) => {
                              const pid = e.target.value;
                              setSubPlayerId(pid);
                              const matched = rosterPlayers.find(
                                (r) => r.id === pid
                              );
                              if (matched) setSubNewName(matched.name);
                            }}
                            className="w-full h-9 mb-1.5 rounded-xl border border-border bg-muted/50 px-2.5 text-xs font-bold text-foreground outline-none focus:border-primary"
                          >
                            <option value="">チーム名簿から選ぶ...</option>
                            {rosterPlayers.map((rp) => (
                              <option key={rp.id} value={rp.id}>
                                {rp.uniformNumber ? `#${rp.uniformNumber} ` : ""}
                                {rp.name}
                              </option>
                            ))}
                          </select>
                        )}
                        <input
                          type="text"
                          value={subNewName}
                          onChange={(e) => setSubNewName(e.target.value)}
                          placeholder="新しい選手名を入力"
                          className="w-full h-10 rounded-xl border border-border bg-card px-3 text-xs font-black text-foreground outline-none focus:border-primary"
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

      {/* モーダル2: 直前の打席への走塁追記モーダル（暴投・盗塁・飛び出し封殺等） */}
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
                    className="w-full h-9 rounded-xl border border-border bg-card px-3 text-xs font-black text-foreground outline-none focus:border-primary"
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

