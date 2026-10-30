// filepath: src/app/liff/tools/scorebook-import/_components/Step3PinpointReview.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  X,
  Save,
  Loader2,
  ZoomIn,
  Maximize2,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  ArrowRightLeft,
  Check,
  Clock,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  AT_BAT_RESULT_PRESETS,
  LEGACY_PICKOFF_PRESET,
  PITCH_RESULT_PRESETS,
  formatElapsedSeconds,
  formatTotalElapsedSeconds,
  isNonPitchMoundEvent,
  isPickoffPitch,
  type CanonicalAtBatResult,
  type CanonicalPitchResult,
  type ImportScopeMode,
  type NormalizedBox,
  type ScorebookAnalysisTimingSummary,
  type ScorebookSheetStructure,
  type ScorebookV2Advance,
  type ScorebookV2AtBat,
  type ScorebookValidationIssue,
} from "@/types/scorebook-v2";
import {
  computeCountFromPitches,
  detectExcessOutInnings,
  detectMissingOrderGaps,
  resolveActiveMatchupFromStructure,
  validateScorebookSheet,
} from "@/lib/liff/scorebook-validator";
import {
  buildSmartAdvancesForResultChange,
  computeSyncedStatsFromAdvances,
  isForceOutGroundout,
  simulateSheetRunners,
} from "@/lib/liff/scorebook-runners";
import {
  DEFENSIVE_POSITIONS,
  DP_RELAY_PRESETS,
  composeFieldingResult,
  getDefaultDpRelay,
  parseFieldingMeta,
  type AssistTargetOption,
  type DefensivePosNumber,
  type ErrorStyleOption,
  type FlyStyleOption,
  type HitZoneOption,
} from "@/lib/liff/scorebook-fielding";
import {
  getCellQuadInStructure,
  quadToBoundingBox,
} from "@/lib/liff/scorebook-grid";
import {
  cropScorebookQuad,
  cropScorebookRegion,
} from "@/lib/liff/scorebook-image";
import { ActionStatusBanner } from "./ActionStatusBanner";
import {
  AtBatCardRunnerStrip,
  AtBatModalRunnerEditor,
} from "./RunnerSituationPanel";

interface Step3PinpointReviewProps {
  importScope: ImportScopeMode;
  opponentName: string;
  topImageDataUrl: string | null;
  bottomImageDataUrl: string | null;
  topStructure: ScorebookSheetStructure | null;
  bottomStructure: ScorebookSheetStructure | null;
  topAtBats: ScorebookV2AtBat[];
  bottomAtBats: ScorebookV2AtBat[];
  onChangeAtBats: (isTop: boolean, updated: ScorebookV2AtBat[]) => void;
  onBack: () => void;
  onSave: () => void;
  isSaving: boolean;
  onReanalyzeInning?: (isTop: boolean, inning: number) => void;
  reanalyzingInningKey?: string | null;
  onRepairOrderGaps?: () => void;
  isRepairingOrderGaps?: boolean;
  timingSummary?: ScorebookAnalysisTimingSummary | null;
  errorMessage?: string | null;
  onDismissError?: () => void;
}

export function Step3PinpointReview({
  importScope,
  opponentName,
  topImageDataUrl,
  bottomImageDataUrl,
  topStructure,
  bottomStructure,
  topAtBats,
  bottomAtBats,
  onChangeAtBats,
  onBack,
  onSave,
  isSaving,
  onReanalyzeInning,
  reanalyzingInningKey = null,
  onRepairOrderGaps,
  isRepairingOrderGaps = false,
  timingSummary = null,
  errorMessage,
  onDismissError,
}: Step3PinpointReviewProps) {
  const [mounted, setMounted] = useState(false);
  const [activeSide, setActiveSide] = useState<"top" | "bottom">(
    importScope === "bottom_only" ? "bottom" : "top"
  );
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [selectedInning, setSelectedInning] = useState<number | "all">("all");
  const [editingAtBatId, setEditingAtBatId] = useState<string | null>(null);
  const [croppedCellUrl, setCroppedCellUrl] = useState<string | null>(null);
  const [showFullSheetInModal, setShowFullSheetInModal] = useState(false);
  const [showOrderAdjustPanel, setShowOrderAdjustPanel] = useState(false);
  const [showTimingDetails, setShowTimingDetails] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isTop = activeSide === "top";
  const currentList = isTop ? topAtBats : bottomAtBats;
  const currentStructure = isTop ? topStructure : bottomStructure;
  const currentSheetImage = isTop ? topImageDataUrl : bottomImageDataUrl;

  const topIssues = useMemo(
    () =>
      importScope === "bottom_only"
        ? []
        : validateScorebookSheet(topAtBats, topStructure, true),
    [importScope, topAtBats, topStructure]
  );

  const bottomIssues = useMemo(
    () =>
      importScope === "top_only"
        ? []
        : validateScorebookSheet(bottomAtBats, bottomStructure, false),
    [importScope, bottomAtBats, bottomStructure]
  );

  const currentIssues = isTop ? topIssues : bottomIssues;
  const totalIssuesCount = topIssues.length + bottomIssues.length;

  const missingOrderGapsCount = useMemo(() => {
    const topCount =
      importScope === "bottom_only"
        ? 0
        : detectMissingOrderGaps(topAtBats, topStructure).length;
    const bottomCount =
      importScope === "top_only"
        ? 0
        : detectMissingOrderGaps(bottomAtBats, bottomStructure).length;
    return topCount + bottomCount;
  }, [importScope, topAtBats, topStructure, bottomAtBats, bottomStructure]);

  const excessOutInningsCount = useMemo(() => {
    const topCount =
      importScope === "bottom_only"
        ? 0
        : detectExcessOutInnings(topAtBats, topStructure).length;
    const bottomCount =
      importScope === "top_only"
        ? 0
        : detectExcessOutInnings(bottomAtBats, bottomStructure).length;
    const issueCount = [...topIssues, ...bottomIssues].filter(
      (iss) =>
        iss.id.startsWith("outs-over-") || iss.id.startsWith("outs-extra-")
    ).length;
    return Math.max(topCount + bottomCount, issueCount > 0 ? 1 : 0);
  }, [
    importScope,
    topAtBats,
    topStructure,
    bottomAtBats,
    bottomStructure,
    topIssues,
    bottomIssues,
  ]);

  const issuesByAtBatId = useMemo(() => {
    const map = new Map<string, ScorebookValidationIssue[]>();
    for (const iss of currentIssues) {
      if (!iss.atBatId) continue;
      const arr = map.get(iss.atBatId) || [];
      arr.push(iss);
      map.set(iss.atBatId, arr);
    }
    return map;
  }, [currentIssues]);

  const availableInnings = useMemo(() => {
    const set = new Set<number>();
    currentStructure?.innings.forEach((m) => set.add(m.inning));
    currentList.forEach((ab) => set.add(ab.inning));
    if (set.size === 0) set.add(1);
    return Array.from(set).sort((a, b) => a - b);
  }, [currentList, currentStructure]);

  const selectableTargetInnings = useMemo(() => {
    const maxInn = Math.max(
      9,
      availableInnings[availableInnings.length - 1] || 7
    );
    const limit = Math.min(15, maxInn + 1);
    return Array.from({ length: limit }, (_, idx) => idx + 1);
  }, [availableInnings]);

  const maxBattingOrder = useMemo(() => {
    return Math.max(
      9,
      currentStructure?.batters.length || 9,
      ...currentList.map((a) => a.battingOrder || 9)
    );
  }, [currentStructure, currentList]);

  const visibleList = useMemo(() => {
    return currentList.filter((ab) => {
      if (selectedInning !== "all" && ab.inning !== selectedInning) {
        return false;
      }
      if (onlyFlagged) {
        return (
          issuesByAtBatId.has(ab.id) || ab.confidence === "low"
        );
      }
      return true;
    });
  }, [currentList, selectedInning, onlyFlagged, issuesByAtBatId]);

  const runnerSnapshotsByAtBatId = useMemo(
    () => simulateSheetRunners(currentList, currentStructure),
    [currentList, currentStructure]
  );

  const editingIndex = editingAtBatId
    ? currentList.findIndex((ab) => ab.id === editingAtBatId)
    : -1;
  const editingAtBat = editingIndex >= 0 ? currentList[editingIndex] : null;
  const editingRunnerSnapshot = editingAtBat
    ? runnerSnapshotsByAtBatId.get(editingAtBat.id)
    : undefined;

  const editingInningPeers = useMemo(() => {
    if (!editingAtBat) return [];
    return currentList.filter((a) => a.inning === editingAtBat.inning);
  }, [currentList, editingAtBat]);

  const editingIndexWithinInning = useMemo(() => {
    if (!editingAtBat) return -1;
    return editingInningPeers.findIndex((a) => a.id === editingAtBat.id);
  }, [editingInningPeers, editingAtBat]);

  // 編集中マスの切り抜きズーム画像を生成（4隅歪み補正ホモグラフィ＆複数列サブ列分割を最優先し、隣接マス映り込みゼロで水平展開）
  useEffect(() => {
    let cancelled = false;
    setShowFullSheetInModal(false);
    setShowOrderAdjustPanel(false);

    if (!editingAtBat || !currentSheetImage) {
      setCroppedCellUrl(null);
      return;
    }

    if (currentStructure) {
      const quad = getCellQuadInStructure(
        currentStructure,
        editingAtBat.inning,
        editingAtBat.columnIndex || 1,
        editingAtBat.battingOrder,
        0
      );
      if (quad) {
        cropScorebookQuad(currentSheetImage, quad, 0.04, 480)
          .then((url) => {
            if (!cancelled) setCroppedCellUrl(url);
          })
          .catch(() => {
            if (!cancelled) setCroppedCellUrl(currentSheetImage);
          });
        return () => {
          cancelled = true;
        };
      }
    }

    const resolvedBox: NormalizedBox | undefined = editingAtBat.cellBox;
    if (!resolvedBox) {
      setCroppedCellUrl(currentSheetImage);
      return;
    }

    cropScorebookRegion(currentSheetImage, resolvedBox, 0.04)
      .then((url) => {
        if (!cancelled) setCroppedCellUrl(url);
      })
      .catch(() => {
        if (!cancelled) setCroppedCellUrl(currentSheetImage);
      });

    return () => {
      cancelled = true;
    };
  }, [
    editingAtBat?.id,
    editingAtBat?.inning,
    editingAtBat?.columnIndex,
    editingAtBat?.battingOrder,
    editingAtBat?.cellBox,
    currentStructure,
    currentSheetImage,
  ]);

  /**
   * イニング昇順に整列しつつ、同一イニング内の並び順を維持して endingOuts（累積アウト）を再計算する
   */
  const recomputeSheetList = (items: ScorebookV2AtBat[]): ScorebookV2AtBat[] => {
    const byInning = new Map<number, ScorebookV2AtBat[]>();
    for (const item of items) {
      const inn = Math.max(1, item.inning || 1);
      const arr = byInning.get(inn) || [];
      arr.push({ ...item, inning: inn });
      byInning.set(inn, arr);
    }

    const sortedInns = Array.from(byInning.keys()).sort((a, b) => a - b);
    const result: ScorebookV2AtBat[] = [];

    for (const inn of sortedInns) {
      const group = byInning.get(inn) || [];
      let cumOuts = 0;
      for (const ab of group) {
        cumOuts = Math.min(3, cumOuts + Math.max(0, ab.outsInPlay));
        result.push({
          ...ab,
          endingOuts: ab.outsInPlay > 0 ? cumOuts : cumOuts,
        });
      }
    }
    return result;
  };

  const updateSingleAtBat = (
    targetId: string,
    updater: (prev: ScorebookV2AtBat) => ScorebookV2AtBat
  ) => {
    const updated = recomputeSheetList(
      currentList.map((item) => (item.id === targetId ? updater(item) : item))
    );
    onChangeAtBats(isTop, updated);
  };

  /**
   * 指定打席を別イニングへ移動する
   * - 前のイニングへ戻す場合（例: 2回 ➔ 1回）: 移動先イニングの「末尾」へ自動配置
   * - 後のイニングへ送る場合（例: 1回 ➔ 2回）: 移動先イニングの「先頭」へ自動配置
   */
  const handleMoveAtBatToInning = (targetId: string, rawNextInning: number) => {
    const nextInning = Math.max(1, Math.min(15, rawNextInning));
    const target = currentList.find((a) => a.id === targetId);
    if (!target || target.inning === nextInning) return;

    const movingEarlier = nextInning < target.inning;
    const resolved = currentStructure
      ? resolveActiveMatchupFromStructure(
          currentStructure,
          nextInning,
          target.battingOrder
        )
      : null;

    const movedItem: ScorebookV2AtBat = {
      ...target,
      inning: nextInning,
      batterName: resolved?.batterName || target.batterName,
      batterPlayerId: resolved ? resolved.batterPlayerId : target.batterPlayerId,
      pitcherName: resolved?.pitcherName || target.pitcherName,
      pitcherPlayerId: resolved
        ? resolved.pitcherPlayerId
        : target.pitcherPlayerId,
    };

    const others = currentList.filter((a) => a.id !== targetId);
    const beforeTarget = others.filter((a) => a.inning < nextInning);
    const inTarget = others.filter((a) => a.inning === nextInning);
    const afterTarget = others.filter((a) => a.inning > nextInning);

    const mergedTarget = movingEarlier
      ? [...inTarget, movedItem]
      : [movedItem, ...inTarget];

    const updated = recomputeSheetList([
      ...beforeTarget,
      ...mergedTarget,
      ...afterTarget,
    ]);
    onChangeAtBats(isTop, updated);

    if (selectedInning !== "all" && editingAtBatId === targetId) {
      setSelectedInning(nextInning);
    }
  };

  /**
   * 同一イニング内で打席の順序を1つ上(前) / 1つ下(後)へ入れ替える
   */
  const handleReorderWithinInning = (
    targetId: string,
    direction: "up" | "down"
  ) => {
    const target = currentList.find((a) => a.id === targetId);
    if (!target) return;

    const peers = currentList.filter((a) => a.inning === target.inning);
    const idx = peers.findIndex((a) => a.id === targetId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= peers.length) return;

    const nextPeers = [...peers];
    [nextPeers[idx], nextPeers[swapIdx]] = [nextPeers[swapIdx], nextPeers[idx]];

    const before = currentList.filter((a) => a.inning < target.inning);
    const after = currentList.filter((a) => a.inning > target.inning);
    const updated = recomputeSheetList([...before, ...nextPeers, ...after]);
    onChangeAtBats(isTop, updated);
  };

  /**
   * 1イニング9人一巡などで先頭打者の位置がズレている場合に、選択中の打者をこのイニングの先頭打者になるよう循環回転する
   */
  const handleRotateInningLeadOffToAtBat = (targetId: string) => {
    const target = currentList.find((a) => a.id === targetId);
    if (!target) return;

    const peers = currentList.filter((a) => a.inning === target.inning);
    const idx = peers.findIndex((a) => a.id === targetId);
    if (idx <= 0) return;

    const lineupCycle = Math.max(9, currentStructure?.batters.length ?? 9);
    const startBo = target.battingOrder;
    const innMeta = currentStructure?.innings.find(
      (m) => m.inning === target.inning
    );
    const maxSubCols = Math.max(1, innMeta?.columnCount ?? 1);

    const rotatedPeers = [...peers.slice(idx), ...peers.slice(0, idx)].map(
      (ab, posIdx) => {
        const isFirstLapBeforeNineWrap =
          posIdx < lineupCycle && ab.battingOrder >= startBo;
        const safeCol = isFirstLapBeforeNineWrap
          ? 1
          : Math.max(1, Math.min(maxSubCols, ab.columnIndex || 1));
        if (safeCol === ab.columnIndex) {
          return ab;
        }
        const nextQuad = currentStructure
          ? getCellQuadInStructure(
              currentStructure,
              target.inning,
              safeCol,
              ab.battingOrder,
              0
            )
          : null;
        return {
          ...ab,
          columnIndex: safeCol,
          cellBox: nextQuad ? quadToBoundingBox(nextQuad) : ab.cellBox,
        };
      }
    );

    const before = currentList.filter((a) => a.inning < target.inning);
    const after = currentList.filter((a) => a.inning > target.inning);
    const updated = recomputeSheetList([...before, ...rotatedPeers, ...after]);
    onChangeAtBats(isTop, updated);
  };

  /**
   * 打者一巡の列折り返し等でこの打席以降のイニングが丸ごとズレている場合に一括シフト（-1回 / +1回）する
   */
  const handleShiftSubsequentInnings = (
    fromAtBatId: string,
    delta: -1 | 1
  ) => {
    const startIdx = currentList.findIndex((a) => a.id === fromAtBatId);
    if (startIdx < 0) return;

    const shifted = currentList.map((item, idx) => {
      if (idx < startIdx) return item;
      const nextInn = Math.max(1, Math.min(15, item.inning + delta));
      const resolved = currentStructure
        ? resolveActiveMatchupFromStructure(
            currentStructure,
            nextInn,
            item.battingOrder
          )
        : null;
      return {
        ...item,
        inning: nextInn,
        batterName: resolved?.batterName || item.batterName,
        batterPlayerId: resolved ? resolved.batterPlayerId : item.batterPlayerId,
        pitcherName: resolved?.pitcherName || item.pitcherName,
        pitcherPlayerId: resolved
          ? resolved.pitcherPlayerId
          : item.pitcherPlayerId,
      };
    });

    const updated = recomputeSheetList(shifted);
    onChangeAtBats(isTop, updated);

    if (selectedInning !== "all") {
      const movedSelf = updated.find((a) => a.id === fromAtBatId);
      if (movedSelf) {
        setSelectedInning(movedSelf.inning);
      }
    }
  };

  /**
   * 打順番号を変更し、骨格情報から該当打者名を自動解決する
   */
  const handleChangeBattingOrder = (targetId: string, nextOrder: number) => {
    updateSingleAtBat(targetId, (prev) => {
      const resolved = currentStructure
        ? resolveActiveMatchupFromStructure(
            currentStructure,
            prev.inning,
            nextOrder
          )
        : null;
      return {
        ...prev,
        battingOrder: nextOrder,
        batterName: resolved?.batterName || prev.batterName,
        batterPlayerId: resolved ? resolved.batterPlayerId : prev.batterPlayerId,
      };
    });
  };

  const handleAddAtBatInInning = (inning: number) => {
    const inInning = currentList.filter((a) => a.inning === inning);
    const lastInInning = inInning[inInning.length - 1];
    const nextOrder = lastInInning
      ? (lastInInning.battingOrder % maxBattingOrder) + 1
      : 1;
    const resolved = currentStructure
      ? resolveActiveMatchupFromStructure(currentStructure, inning, nextOrder)
      : null;

    const newItem: ScorebookV2AtBat = {
      id: crypto.randomUUID(),
      inning,
      isTop,
      columnIndex: lastInInning?.columnIndex || 1,
      battingOrder: nextOrder,
      batterName: resolved?.batterName || "",
      batterPlayerId: resolved?.batterPlayerId || null,
      pitcherName: resolved?.pitcherName || "",
      pitcherPlayerId: resolved?.pitcherPlayerId || null,
      resultCode: "groundout",
      resultLabel: "内ゴロ",
      battedDirection: "",
      rbi: 0,
      outsInPlay: 1,
      endingOuts: Math.min(3, (lastInInning?.endingOuts || 0) + 1),
      runsInPlay: 0,
      balls: 0,
      strikes: 0,
      pitches: ["in_play"],
      advances: [],
      confidence: "high",
    };

    const nextList = recomputeSheetList([...currentList, newItem]);
    onChangeAtBats(isTop, nextList);
    setEditingAtBatId(newItem.id);
  };

  const handleDeleteAtBat = (targetId: string) => {
    const nextList = recomputeSheetList(
      currentList.filter((a) => a.id !== targetId)
    );
    onChangeAtBats(isTop, nextList);
    setEditingAtBatId(null);
  };

  const getPitchMeta = (code: CanonicalPitchResult) => {
    if (code === "pickoff") return LEGACY_PICKOFF_PRESET;
    return (
      PITCH_RESULT_PRESETS.find((p) => p.code === code) ||
      PITCH_RESULT_PRESETS[0]
    );
  };

  /**
   * STEP 1（投球・牽制・ボーク順序）の更新を STEP 2（打撃結果）・STEP 3（走者・進塁）へ時系列連動させる
   */
  const applyPitchSequenceChange = (
    prev: ScorebookV2AtBat,
    nextPitches: CanonicalPitchResult[],
    addedCode?: CanonicalPitchResult
  ): ScorebookV2AtBat => {
    const cnt = computeCountFromPitches(nextPitches);
    const outsBefore = editingRunnerSnapshot?.outsBefore ?? 0;
    const basesBefore = editingRunnerSnapshot?.basesBefore ?? {
      "1B": null,
      "2B": null,
      "3B": null,
    };

    let nextResultCode = prev.resultCode;
    let nextResultLabel = prev.resultLabel;
    let nextDirection = prev.battedDirection;
    let nextAdvances = [...prev.advances];
    let nextOutsInPlay = prev.outsInPlay;
    let nextRunsInPlay = prev.runsInPlay;
    let nextRbi = prev.rbi;

    // ボーク追加時、塁上に走者がいれば全員1つずつ安全進塁を自動付与（重複未登録時のみ）
    if (
      addedCode === "balk" &&
      !nextAdvances.some((a) => a.method === "balk") &&
      (basesBefore["3B"] || basesBefore["2B"] || basesBefore["1B"])
    ) {
      const realPitchCountBeforeBalk = nextPitches
        .slice(0, -1)
        .filter((p) => !isNonPitchMoundEvent(p)).length;
      const pitchNumber =
        realPitchCountBeforeBalk > 0 ? realPitchCountBeforeBalk : undefined;
      const balkEntries: ScorebookV2Advance[] = [];
      if (basesBefore["3B"]) {
        balkEntries.push({
          id: `${prev.id}-bk-3b-${Date.now()}`,
          runnerName: basesBefore["3B"].name,
          from: "3B",
          to: "HP",
          method: "balk",
          isOut: false,
          pitchNumber,
        });
      }
      if (basesBefore["2B"]) {
        balkEntries.push({
          id: `${prev.id}-bk-2b-${Date.now()}`,
          runnerName: basesBefore["2B"].name,
          from: "2B",
          to: "3B",
          method: "balk",
          isOut: false,
          pitchNumber,
        });
      }
      if (basesBefore["1B"]) {
        balkEntries.push({
          id: `${prev.id}-bk-1b-${Date.now()}`,
          runnerName: basesBefore["1B"].name,
          from: "1B",
          to: "2B",
          method: "balk",
          isOut: false,
          pitchNumber,
        });
      }
      nextAdvances = [...nextAdvances, ...balkEntries];
      const syncedBk = computeSyncedStatsFromAdvances(
        prev,
        nextAdvances,
        outsBefore,
        basesBefore
      );
      nextOutsInPlay = syncedBk.outsInPlay;
      nextRunsInPlay = syncedBk.runsInPlay;
      nextRbi = syncedBk.rbi;
    }

    const batterPitches = nextPitches.filter((p) => !isNonPitchMoundEvent(p));
    const lastBatterPitch =
      batterPitches.length > 0
        ? batterPitches[batterPitches.length - 1]
        : undefined;
    const hasInPlayOrHit = batterPitches.some(
      (p) => p === "in_play" || p === "hit"
    );

    // 2ストライク後のバントファウル（スリーバント失敗）判定
    let runningStrikes = 0;
    let endedWithThreeBuntFoul = false;
    for (const p of batterPitches) {
      if (p === "bunt_foul" && runningStrikes >= 2) {
        endedWithThreeBuntFoul = true;
      }
      if (
        p === "strike" ||
        p === "swinging_strike" ||
        p === "bunt_swinging" ||
        p === "bunt_foul"
      ) {
        runningStrikes = Math.min(3, runningStrikes + 1);
      } else if (p === "foul" && runningStrikes < 2) {
        runningStrikes += 1;
      }
    }

    const syncToResult = (
      targetCode: CanonicalAtBatResult,
      targetLabel: string,
      targetDir: string,
      defaultOuts: number
    ) => {
      nextResultCode = targetCode;
      nextResultLabel = targetLabel;
      nextDirection = targetDir;
      const smartSync = buildSmartAdvancesForResultChange({
        prevAb: {
          ...prev,
          advances: nextAdvances,
          outsInPlay: nextOutsInPlay,
          runsInPlay: nextRunsInPlay,
          rbi: nextRbi,
        },
        nextResultCode: targetCode,
        nextBattedDirection: targetDir,
        nextResultLabel: targetLabel,
        defaultPresetOuts: defaultOuts,
        outsBefore,
        basesBefore,
      });
      nextAdvances = smartSync.advances;
      nextOutsInPlay = smartSync.outsInPlay;
      nextRunsInPlay = smartSync.runsInPlay;
      nextRbi = smartSync.rbi;
    };

    if (lastBatterPitch === "hbp") {
      if (prev.resultCode !== "hit_by_pitch") {
        syncToResult("hit_by_pitch", "死球", "", 0);
      }
    } else if (lastBatterPitch === "hit") {
      const isAlreadyHit =
        prev.resultCode === "single" ||
        prev.resultCode === "double" ||
        prev.resultCode === "triple" ||
        prev.resultCode === "home_run";
      if (!isAlreadyHit) {
        const prevFielding = parseFieldingMeta(
          prev.resultCode,
          prev.battedDirection,
          prev.resultLabel
        );
        if (prevFielding.primaryPos) {
          const composed = composeFieldingResult({
            resultCode: "single",
            primaryPos: prevFielding.primaryPos,
            assistTargetPos: prevFielding.assistTargetPos,
            dpRelay: prevFielding.dpRelay,
            hitZone: prevFielding.hitZone,
            flyStyle: prevFielding.flyStyle,
            errorStyle: prevFielding.errorStyle,
            fallbackLabel: "安打",
          });
          syncToResult(
            "single",
            composed.resultLabel,
            composed.battedDirection,
            0
          );
        } else {
          syncToResult("single", "安打", "", 0);
        }
      }
    } else if (lastBatterPitch === "in_play") {
      const isAlreadyInPlayNonHit =
        prev.resultCode === "groundout" ||
        prev.resultCode === "flyout" ||
        prev.resultCode === "infield_fly" ||
        prev.resultCode === "sac_bunt" ||
        prev.resultCode === "sac_fly" ||
        prev.resultCode === "double_play" ||
        prev.resultCode === "triple_play" ||
        prev.resultCode === "interference_out" ||
        prev.resultCode === "error" ||
        prev.resultCode === "fc" ||
        prev.resultCode === "interference";
      if (!isAlreadyInPlayNonHit) {
        const prevFielding = parseFieldingMeta(
          prev.resultCode,
          prev.battedDirection,
          prev.resultLabel
        );
        if (prevFielding.primaryPos) {
          const composed = composeFieldingResult({
            resultCode: "groundout",
            primaryPos: prevFielding.primaryPos,
            assistTargetPos: prevFielding.assistTargetPos || "3",
            dpRelay: prevFielding.dpRelay,
            hitZone: prevFielding.hitZone,
            flyStyle: prevFielding.flyStyle,
            errorStyle: prevFielding.errorStyle,
            fallbackLabel: "ゴロ",
          });
          syncToResult(
            "groundout",
            composed.resultLabel,
            composed.battedDirection,
            1
          );
        } else {
          syncToResult("groundout", "ゴロ", "", 1);
        }
      }
    } else if (
      !hasInPlayOrHit &&
      cnt.balls >= 4 &&
      lastBatterPitch === "ball"
    ) {
      if (
        prev.resultCode !== "walk" &&
        prev.resultCode !== "intentional_walk"
      ) {
        syncToResult("walk", "四球", "", 0);
      }
    } else if (
      !hasInPlayOrHit &&
      (cnt.strikes >= 3 || endedWithThreeBuntFoul)
    ) {
      if (
        prev.resultCode !== "dropped_third_strike" &&
        prev.resultCode !== "dropped_third_strike_out"
      ) {
        const soLabel =
          endedWithThreeBuntFoul || lastBatterPitch === "bunt_foul"
            ? "スリーバント失敗"
            : lastBatterPitch === "strike"
            ? "見逃し三振"
            : "空振り三振";
        if (prev.resultCode !== "strikeout" || prev.resultLabel !== soLabel) {
          syncToResult("strikeout", soLabel, "", 1);
        }
      }
    }

    return {
      ...prev,
      pitches: nextPitches,
      balls: cnt.balls,
      strikes: cnt.strikes,
      resultCode: nextResultCode,
      resultLabel: nextResultLabel,
      battedDirection: nextDirection,
      advances: nextAdvances,
      outsInPlay: nextOutsInPlay,
      runsInPlay: nextRunsInPlay,
      rbi: nextRbi,
      confidence: "high",
    };
  };

  const batterPitchPresets = useMemo(
    () => PITCH_RESULT_PRESETS.filter((p) => !isNonPitchMoundEvent(p.code)),
    []
  );
  const moundActionPresets = useMemo(
    () => PITCH_RESULT_PRESETS.filter((p) => isNonPitchMoundEvent(p.code)),
    []
  );

  const topTimingEntries = useMemo(
    () => (timingSummary ? timingSummary.inningEntries.filter((e) => e.isTop) : []),
    [timingSummary]
  );
  const bottomTimingEntries = useMemo(
    () => (timingSummary ? timingSummary.inningEntries.filter((e) => !e.isTop) : []),
    [timingSummary]
  );
  const topTimingSumMs = useMemo(
    () => topTimingEntries.reduce((sum, e) => sum + e.durationMs, 0),
    [topTimingEntries]
  );
  const bottomTimingSumMs = useMemo(
    () => bottomTimingEntries.reduce((sum, e) => sum + e.durationMs, 0),
    [bottomTimingEntries]
  );

  return (
    <div className="space-y-4">
      {/* AI解析タイム計測サマリー（トータル秒数＋イニング別秒数） */}
      {timingSummary && timingSummary.inningEntries.length > 0 && (
        <section className="rounded-3xl bg-card border-2 border-indigo-500/35 p-4 space-y-2.5 shadow-xs">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <h2 className="text-xs font-black text-foreground">
                AI解析タイム計測
              </h2>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-black tabular-nums">
                合計 {formatTotalElapsedSeconds(timingSummary.deepTotalMs)}
              </span>
              <button
                type="button"
                onClick={() => setShowTimingDetails((prev) => !prev)}
                className="px-2 py-1 rounded-lg bg-muted hover:bg-muted/80 border border-border text-[10px] font-black text-foreground inline-flex items-center gap-0.5 cursor-pointer"
              >
                <span>{showTimingDetails ? "内訳を隠す" : "イニング別を表示"}</span>
                {showTimingDetails ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>
            </div>
          </div>

          {typeof timingSummary.structureTotalMs === "number" &&
            timingSummary.structureTotalMs > 0 && (
              <p className="text-[10px] font-bold text-muted-foreground tabular-nums">
                全工程トータル:{" "}
                <span className="font-black text-foreground">
                  {formatTotalElapsedSeconds(
                    timingSummary.structureTotalMs + timingSummary.deepTotalMs
                  )}
                </span>
                （骨格スキャン {formatElapsedSeconds(timingSummary.structureTotalMs)} ＋ 全イニング解析{" "}
                {formatElapsedSeconds(timingSummary.deepTotalMs)}）
              </p>
            )}

          {showTimingDetails && (
            <div className="space-y-2 pt-0.5">
              {topTimingEntries.length > 0 && (
                <div className="p-2.5 rounded-2xl bg-muted border border-border space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black text-foreground">
                      先攻（表）イニング別秒数
                    </span>
                    <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 tabular-nums">
                      小計 {formatElapsedSeconds(topTimingSumMs)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {topTimingEntries.map((entry) => {
                      const isEntryError = entry.status === "error";
                      const isSelected =
                        activeSide === "top" &&
                        entry.innings.length === 1 &&
                        selectedInning === entry.innings[0];
                      return (
                        <button
                          key={entry.key}
                          type="button"
                          onClick={() => {
                            setActiveSide("top");
                            if (entry.innings.length === 1) {
                              setSelectedInning(entry.innings[0]);
                            } else {
                              setSelectedInning("all");
                            }
                          }}
                          className={`px-2 py-1 rounded-lg text-[10px] font-black tabular-nums inline-flex items-center gap-1 transition-all cursor-pointer ${
                            isSelected
                              ? "bg-indigo-600 text-white border border-indigo-600"
                              : isEntryError
                              ? "bg-card border border-destructive/60 text-destructive"
                              : "bg-card hover:bg-card/80 border border-border text-foreground"
                          }`}
                        >
                          <span>{entry.label}</span>
                          <span
                            className={
                              isSelected
                                ? "text-white"
                                : isEntryError
                                ? "text-destructive"
                                : "text-indigo-600 dark:text-indigo-400"
                            }
                          >
                            {isEntryError
                              ? "未取得(要再解析)"
                              : entry.fromCache
                              ? "保持済"
                              : formatElapsedSeconds(entry.durationMs)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {bottomTimingEntries.length > 0 && (
                <div className="p-2.5 rounded-2xl bg-muted border border-border space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black text-foreground">
                      後攻（裏）イニング別秒数
                    </span>
                    <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 tabular-nums">
                      小計 {formatElapsedSeconds(bottomTimingSumMs)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {bottomTimingEntries.map((entry) => {
                      const isEntryError = entry.status === "error";
                      const isSelected =
                        activeSide === "bottom" &&
                        entry.innings.length === 1 &&
                        selectedInning === entry.innings[0];
                      return (
                        <button
                          key={entry.key}
                          type="button"
                          onClick={() => {
                            setActiveSide("bottom");
                            if (entry.innings.length === 1) {
                              setSelectedInning(entry.innings[0]);
                            } else {
                              setSelectedInning("all");
                            }
                          }}
                          className={`px-2 py-1 rounded-lg text-[10px] font-black tabular-nums inline-flex items-center gap-1 transition-all cursor-pointer ${
                            isSelected
                              ? "bg-indigo-600 text-white border border-indigo-600"
                              : isEntryError
                              ? "bg-card border border-destructive/60 text-destructive"
                              : "bg-card hover:bg-card/80 border border-border text-foreground"
                          }`}
                        >
                          <span>{entry.label}</span>
                          <span
                            className={
                              isSelected
                                ? "text-white"
                                : isEntryError
                                ? "text-destructive"
                                : "text-indigo-600 dark:text-indigo-400"
                            }
                          >
                            {isEntryError
                              ? "未取得(要再解析)"
                              : entry.fromCache
                              ? "保持済"
                              : formatElapsedSeconds(entry.durationMs)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* 総合整合性サマリーバナー */}
      {totalIssuesCount === 0 ? (
        <section className="rounded-3xl bg-emerald-500/10 border border-emerald-500/35 p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <h2 className="text-xs font-black text-emerald-700 dark:text-emerald-300">
              全イニングの整合性チェックをクリアしました！
            </h2>
            <p className="text-[11px] font-bold text-muted-foreground">
              アウト数・イニング得点・打順連続性・1球履歴カウントすべて整合しています。各打席をタップして詳細確認・微調整もできます。
            </p>
          </div>
        </section>
      ) : (
        <section className="rounded-3xl bg-amber-500/10 border border-amber-500/35 p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <h2 className="text-xs font-black text-foreground">
                確認おすすめの箇所が {totalIssuesCount} 件あります
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setOnlyFlagged((prev) => !prev)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-black transition-all cursor-pointer ${
                onlyFlagged
                  ? "bg-amber-600 text-white"
                  : "bg-card border border-amber-500/40 text-amber-700 dark:text-amber-300"
              }`}
            >
              {onlyFlagged ? "すべて表示に戻す" : "要確認のみ絞込"}
            </button>
          </div>

          {onRepairOrderGaps &&
            (missingOrderGapsCount > 0 ||
              excessOutInningsCount > 0 ||
              isRepairingOrderGaps) && (
              <div className="p-2.5 rounded-2xl bg-card border border-indigo-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <p className="text-[11px] font-bold text-foreground leading-snug">
                  野球規則整合チェックで{" "}
                  <strong className="text-indigo-600 dark:text-indigo-400">
                    {[
                      missingOrderGapsCount > 0
                        ? `打順抜け${missingOrderGapsCount}件`
                        : "",
                      excessOutInningsCount > 0
                        ? `3アウト超過${excessOutInningsCount}回`
                        : "",
                    ]
                      .filter(Boolean)
                      .join("・") || "補正対象"}
                  </strong>{" "}
                  を検出しました。該当マスをピンポイント拡大照合して自動補正できます。
                </p>
                <button
                  type="button"
                  disabled={
                    isRepairingOrderGaps || Boolean(reanalyzingInningKey)
                  }
                  onClick={onRepairOrderGaps}
                  className="h-9 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-[11px] font-black flex items-center justify-center gap-1.5 shrink-0 cursor-pointer active:scale-95 transition-all"
                >
                  {isRepairingOrderGaps ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>該当マスを拡大照合・補正中...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>
                        {missingOrderGapsCount > 0 && excessOutInningsCount > 0
                          ? "打順抜け・3アウト超過をAI自動補正"
                          : excessOutInningsCount > 0
                          ? "3アウト超過をAI自動補正"
                          : "打順の抜け・飛びをAI自動補正"}
                      </span>
                    </>
                  )}
                </button>
              </div>
            )}

          <div className="max-h-32 overflow-y-auto space-y-1.5">
            {currentIssues.map((iss) => (
              <button
                key={iss.id}
                type="button"
                onClick={() => {
                  if (iss.atBatId) {
                    setEditingAtBatId(iss.atBatId);
                  } else {
                    setSelectedInning(iss.inning);
                  }
                }}
                className="w-full text-left p-2 rounded-xl bg-card/90 hover:bg-card border border-border/80 flex items-start justify-between gap-2 transition-all cursor-pointer"
              >
                <span className="text-[11px] font-bold text-foreground leading-snug">
                  <strong
                    className={
                      iss.severity === "error"
                        ? "text-destructive mr-1"
                        : "text-amber-600 dark:text-amber-400 mr-1"
                    }
                  >
                    [{iss.inning}回{iss.isTop ? "表" : "裏"}
                    {iss.battingOrder ? ` ${iss.battingOrder}番` : ""}]
                  </strong>
                  {iss.message}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 先攻 / 後攻 タブ切替 */}
      {importScope === "both" && (
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-muted/70 border border-border/60">
          <button
            type="button"
            onClick={() => {
              setActiveSide("top");
              setSelectedInning("all");
            }}
            className={`py-2.5 px-2 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeSide === "top"
                ? "bg-card text-foreground font-black shadow-2xs"
                : "text-muted-foreground font-bold"
            }`}
          >
            <span>
              先攻（{topStructure?.isMyTeamBatting ? "自チーム" : opponentName}）
            </span>
            {topIssues.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[9px] font-black">
                {topIssues.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSide("bottom");
              setSelectedInning("all");
            }}
            className={`py-2.5 px-2 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeSide === "bottom"
                ? "bg-card text-foreground font-black shadow-2xs"
                : "text-muted-foreground font-bold"
            }`}
          >
            <span>
              後攻（{bottomStructure?.isMyTeamBatting ? "自チーム" : opponentName}）
            </span>
            {bottomIssues.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[9px] font-black">
                {bottomIssues.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* イニング絞り込みピルバー */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 -mx-4 px-4 scrollbar-none">
        <button
          type="button"
          onClick={() => setSelectedInning("all")}
          className={`px-3 py-1.5 rounded-xl text-xs font-black shrink-0 cursor-pointer ${
            selectedInning === "all"
              ? "bg-foreground text-background"
              : "bg-card border border-border text-muted-foreground"
          }`}
        >
          全回 ({currentList.length}打席)
        </button>
        {availableInnings.map((inn) => (
          <button
            key={inn}
            type="button"
            onClick={() => setSelectedInning(inn)}
            className={`px-3 py-1.5 rounded-xl text-xs font-black shrink-0 cursor-pointer ${
              selectedInning === inn
                ? "bg-indigo-600 text-white"
                : "bg-card border border-border text-foreground"
            }`}
          >
            {inn}回{isTop ? "表" : "裏"}
          </button>
        ))}
      </div>

      {/* イニング別 打席カード一覧 */}
      <div className="space-y-4">
        {(selectedInning === "all" ? availableInnings : [selectedInning]).map(
          (inn) => {
            const innItems = visibleList.filter((a) => a.inning === inn);
            const hasInningLevelIssue = currentIssues.some(
              (iss) => iss.inning === inn && !iss.atBatId
            );
            if (innItems.length === 0 && onlyFlagged && !hasInningLevelIssue) {
              return null;
            }

            const innRuns = currentList
              .filter((a) => a.inning === inn)
              .reduce((s, a) => s + a.runsInPlay, 0);
            const innOuts = currentList
              .filter((a) => a.inning === inn)
              .reduce((s, a) => s + a.outsInPlay, 0);
            const currentInningKey = `${isTop ? "top" : "bottom"}-${inn}`;
            const isReanalyzingThisInning =
              reanalyzingInningKey === currentInningKey;
            const isAnyReanalyzing = Boolean(reanalyzingInningKey);

            return (
              <section
                key={inn}
                className={`rounded-3xl bg-card border shadow-xs p-3.5 space-y-2.5 ${
                  hasInningLevelIssue
                    ? "border-destructive/60"
                    : "border-border"
                }`}
              >
                <div className="flex items-center justify-between gap-1.5 px-1 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 text-xs font-black">
                      {inn}回{isTop ? "表" : "裏"}
                    </span>
                    <span className="text-[11px] font-bold text-muted-foreground">
                      得点 {innRuns} / アウト計 {innOuts}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {onReanalyzeInning && (
                      <button
                        type="button"
                        disabled={isAnyReanalyzing || isSaving}
                        onClick={() => onReanalyzeInning(isTop, inn)}
                        className="px-2 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/35 text-[10px] font-black text-indigo-700 dark:text-indigo-300 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        {isReanalyzingThisInning ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>再解析中...</span>
                          </>
                        ) : (
                          <>
                            <RotateCcw className="w-3 h-3" />
                            <span>AI再解析</span>
                          </>
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleAddAtBatInInning(inn)}
                      className="px-2 py-1 rounded-lg bg-muted hover:bg-muted/80 text-[10px] font-black text-foreground flex items-center gap-0.5 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>打席追加</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {innItems.length === 0 ? (
                    <div
                      className={`py-3.5 px-3 rounded-2xl border border-dashed text-center space-y-2.5 ${
                        hasInningLevelIssue
                          ? "bg-destructive/5 border-destructive/45"
                          : "bg-muted/25 border-border"
                      }`}
                    >
                      <p className="text-[11px] font-bold text-foreground">
                        このイニングの打席が0件です（AI再解析または手動で打席追加できます）
                      </p>
                      {onReanalyzeInning && (
                        <button
                          type="button"
                          disabled={isAnyReanalyzing || isSaving}
                          onClick={() => onReanalyzeInning(isTop, inn)}
                          className="mx-auto px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                        >
                          {isReanalyzingThisInning ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>{inn}回{isTop ? "表" : "裏"}を再解析中...</span>
                            </>
                          ) : (
                            <>
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>この回だけAI再解析する</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  ) : (
                    innItems.map((ab) => {
                      const rowIssues = issuesByAtBatId.get(ab.id) || [];
                      const hasError = rowIssues.some(
                        (i) => i.severity === "error"
                      );
                      const hasWarning =
                        rowIssues.length > 0 || ab.confidence === "low";
                      const isHit =
                        ab.resultCode === "single" ||
                        ab.resultCode === "double" ||
                        ab.resultCode === "triple" ||
                        ab.resultCode === "home_run";

                      const sameInningAll = currentList.filter(
                        (x) => x.inning === ab.inning
                      );
                      const posInInning = sameInningAll.findIndex(
                        (x) => x.id === ab.id
                      );

                      return (
                        <div
                          key={ab.id}
                          className={`w-full rounded-2xl border transition-all overflow-hidden ${
                            hasError
                              ? "bg-destructive/5 border-destructive/45"
                              : hasWarning
                              ? "bg-amber-500/5 border-amber-500/45"
                              : "bg-muted/30 border-border/80"
                          }`}
                        >
                          {/* メイン領域タップで詳細・1球編集モーダルを開く */}
                          <button
                            type="button"
                            onClick={() => setEditingAtBatId(ab.id)}
                            className="w-full text-left p-3 space-y-2 hover:bg-muted/40 active:scale-99 transition-all cursor-pointer"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="w-6 h-6 rounded-lg bg-foreground text-background text-[11px] font-black flex items-center justify-center shrink-0">
                                  {ab.battingOrder}
                                </span>
                                <span className="text-xs font-black text-foreground truncate">
                                  {ab.batterName || "未設定"}
                                </span>
                                {(ab.columnIndex || 1) >= 2 && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/35 text-amber-700 dark:text-amber-300 text-[9px] font-black shrink-0">
                                    {ab.columnIndex}列目
                                  </span>
                                )}
                                <span className="text-[10px] font-bold text-muted-foreground truncate">
                                  vs {ab.pitcherName || "投手"}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {ab.runsInPlay > 0 && (
                                  <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black">
                                    +{ab.runsInPlay}点
                                  </span>
                                )}
                                {ab.outsInPlay > 0 && (
                                  <span className="px-2 py-0.5 rounded-full bg-slate-700 text-white text-[10px] font-black">
                                    {ab.outsInPlay}死
                                  </span>
                                )}
                                {ab.battedDirection &&
                                  !ab.resultLabel.includes(
                                    ab.battedDirection
                                  ) && (
                                    <span className="px-1.5 py-0.5 rounded-md bg-indigo-500/12 border border-indigo-500/25 text-indigo-700 dark:text-indigo-300 text-[10px] font-black">
                                      守備:{ab.battedDirection}
                                    </span>
                                  )}
                                <span
                                  className={`px-2.5 py-0.5 rounded-lg text-xs font-black ${
                                    isHit
                                      ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                                      : "bg-card border border-border text-foreground"
                                  }`}
                                >
                                  {ab.resultLabel}
                                </span>
                              </div>
                            </div>

                            {/* 1球ごとの投球・牽制・ボーク順序ピル表示 */}
                            <div className="flex items-center flex-wrap gap-1">
                              {(() => {
                                const pickoffCnt = ab.pitches.filter((p) =>
                                  isPickoffPitch(p)
                                ).length;
                                const balkCnt = ab.pitches.filter(
                                  (p) => p === "balk"
                                ).length;
                                const realCnt =
                                  ab.pitches.length - pickoffCnt - balkCnt;
                                let realSeq = 0;
                                return (
                                  <>
                                    <span className="text-[10px] font-black text-muted-foreground mr-0.5">
                                      {realCnt}球
                                      {pickoffCnt > 0
                                        ? ` (+牽制${pickoffCnt})`
                                        : ""}
                                      {balkCnt > 0 ? ` (+BK${balkCnt})` : ""}:
                                    </span>
                                    {ab.pitches.map((p, pIdx) => {
                                      const meta = getPitchMeta(p);
                                      const isMound = isNonPitchMoundEvent(p);
                                      if (!isMound) realSeq += 1;
                                      return (
                                        <span
                                          key={`${ab.id}-p-${pIdx}`}
                                          className={`px-1.5 py-0.5 rounded-md border text-[9px] font-black ${meta.toneClass}`}
                                        >
                                          {isMound
                                            ? meta.shortLabel
                                            : `${realSeq}.${meta.shortLabel}`}
                                        </span>
                                      );
                                    })}
                                  </>
                                );
                              })()}
                            </div>

                            {/* 走者・アウト状況（打席前➔打席後）＆ 先行走者進塁バー */}
                            <AtBatCardRunnerStrip
                              atBat={ab}
                              snapshot={runnerSnapshotsByAtBatId.get(ab.id)}
                            />

                            {rowIssues.length > 0 && (
                              <p className="text-[10px] font-black text-amber-700 dark:text-amber-300 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                <span className="truncate">
                                  {rowIssues[0].message}
                                </span>
                              </p>
                            )}
                          </button>

                          {/* クイック操作バー: 同回内の順序入替 ＆ ワンタップイニング移動 */}
                          <div className="px-2.5 py-1.5 bg-card/75 border-t border-border/60 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={posInInning <= 0}
                                onClick={() =>
                                  handleReorderWithinInning(ab.id, "up")
                                }
                                className="h-6 px-1.5 rounded-md bg-muted border border-border text-[10px] font-black text-foreground flex items-center gap-0.5 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
                                aria-label="1つ上の打席順へ"
                              >
                                <ArrowUp className="w-3 h-3" />
                                <span>上へ</span>
                              </button>
                              <button
                                type="button"
                                disabled={
                                  posInInning < 0 ||
                                  posInInning >= sameInningAll.length - 1
                                }
                                onClick={() =>
                                  handleReorderWithinInning(ab.id, "down")
                                }
                                className="h-6 px-1.5 rounded-md bg-muted border border-border text-[10px] font-black text-foreground flex items-center gap-0.5 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
                                aria-label="1つ下の打席順へ"
                              >
                                <ArrowDown className="w-3 h-3" />
                                <span>下へ</span>
                              </button>
                            </div>

                            <div className="flex items-center gap-1">
                              {ab.inning > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleMoveAtBatToInning(
                                      ab.id,
                                      ab.inning - 1
                                    )
                                  }
                                  className="h-6 px-2 rounded-md bg-indigo-500/12 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-[10px] font-black flex items-center gap-0.5 active:scale-95 transition-all cursor-pointer"
                                >
                                  <ChevronLeft className="w-3 h-3" />
                                  <span>{ab.inning - 1}回へ</span>
                                </button>
                              )}

                              <select
                                value={ab.inning}
                                onChange={(e) =>
                                  handleMoveAtBatToInning(
                                    ab.id,
                                    Number(e.target.value)
                                  )
                                }
                                aria-label="イニング移動先を選択"
                                className="h-6 px-1.5 rounded-md bg-card border border-border text-[10px] font-black text-foreground cursor-pointer"
                              >
                                {selectableTargetInnings.map((targetInn) => (
                                  <option key={targetInn} value={targetInn}>
                                    {targetInn}回{isTop ? "表" : "裏"}
                                    {targetInn === ab.inning
                                      ? "（現在）"
                                      : "へ移動"}
                                  </option>
                                ))}
                              </select>

                              {ab.inning < 15 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleMoveAtBatToInning(
                                      ab.id,
                                      ab.inning + 1
                                    )
                                  }
                                  className="h-6 px-2 rounded-md bg-indigo-500/12 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-[10px] font-black flex items-center gap-0.5 active:scale-95 transition-all cursor-pointer"
                                >
                                  <span>{ab.inning + 1}回へ</span>
                                  <ChevronRight className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            );
          }
        )}
      </div>

      {/* 進捗表示・エラー表示 ＆ 下部保存アクション */}
      <div className="space-y-2.5 pt-2">
        <ActionStatusBanner
          isLoading={isSaving}
          loadingTitle="試合データ・個人成績を保存中..."
          loadingDetail="プレイログ・打撃成績・投手成績を集計してデータベースへ反映しています..."
          errorMessage={errorMessage}
          onDismissError={onDismissError}
        />

        <div className="flex gap-2.5">
          <button
            type="button"
            disabled={isSaving}
            onClick={onBack}
            className="h-13 px-4 rounded-2xl bg-card border border-border text-xs font-black text-foreground flex items-center gap-1 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>骨格確認へ</span>
          </button>

          <button
            type="button"
            disabled={isSaving}
            onClick={onSave}
            className="flex-1 h-13 px-4 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-black shadow-md flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>試合データ・成績を保存中...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>試合データ・個人成績に保存する</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          🔍 Portal z-[9999] マス拡大＆1球履歴ディープ編集モーダル
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {mounted &&
        editingAtBat &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex justify-center items-end sm:items-center bg-black/70 p-0 sm:p-4 animate-in fade-in duration-150">
            <div
              className="absolute inset-0"
              onClick={() => setEditingAtBatId(null)}
            />

            <div className="relative z-10 w-full max-w-lg max-h-[92dvh] bg-card rounded-t-3xl sm:rounded-3xl border border-border shadow-2xl flex flex-col overflow-hidden">
              {/* モーダルヘッダー（前後打席送り付き） */}
              <div className="px-4 py-3 border-b border-border bg-card flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={editingIndex <= 0}
                    onClick={() =>
                      editingIndex > 0 &&
                      setEditingAtBatId(currentList[editingIndex - 1].id)
                    }
                    className="p-1.5 rounded-xl bg-muted border border-border disabled:opacity-35 cursor-pointer"
                    aria-label="前の打席"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <div>
                    <p className="text-xs font-black text-foreground">
                      {editingAtBat.inning}回{editingAtBat.isTop ? "表" : "裏"} ・{" "}
                      {editingAtBat.battingOrder}番 {editingAtBat.batterName}
                    </p>
                    <p className="text-[10px] font-bold text-muted-foreground">
                      打席 {editingIndex + 1} / {currentList.length}（投手:{" "}
                      {editingAtBat.pitcherName || "未設定"}）
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={editingIndex >= currentList.length - 1}
                    onClick={() =>
                      editingIndex < currentList.length - 1 &&
                      setEditingAtBatId(currentList[editingIndex + 1].id)
                    }
                    className="p-1.5 rounded-xl bg-muted border border-border disabled:opacity-35 cursor-pointer"
                    aria-label="次の打席"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setEditingAtBatId(null)}
                  className="p-1.5 rounded-full bg-muted text-foreground cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* スクロール編集ボディ */}
              <div className="p-4 space-y-4 overflow-y-auto flex-1">
                {/* 1. 元スコアブック画像 該当マス拡大プレビュー */}
                {currentSheetImage && (
                  <div className="rounded-2xl bg-slate-950 border border-border overflow-hidden">
                    <div className="px-3 py-1.5 bg-slate-900 flex items-center justify-between gap-2 text-white">
                      <span className="text-[10px] font-black flex items-center gap-1 min-w-0 truncate">
                        <ZoomIn className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span className="truncate">
                          {showFullSheetInModal
                            ? "シート全体画像"
                            : `手書き原本マス切り抜き${
                                (editingAtBat.columnIndex || 1) >= 2
                                  ? `（${editingAtBat.columnIndex}列目）`
                                  : ""
                              }`}
                        </span>
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {(() => {
                          const editInnMeta = currentStructure?.innings.find(
                            (m) => m.inning === editingAtBat.inning
                          );
                          const totalSubCols = Math.max(
                            editInnMeta?.columnCount ?? 1,
                            editingAtBat.columnIndex || 1
                          );
                          if (totalSubCols < 2 || showFullSheetInModal) {
                            return null;
                          }
                          return Array.from(
                            { length: totalSubCols },
                            (_, idx) => idx + 1
                          ).map((colNo) => (
                            <button
                              key={colNo}
                              type="button"
                              onClick={() =>
                                updateSingleAtBat(editingAtBat.id, (prev) => ({
                                  ...prev,
                                  columnIndex: colNo,
                                }))
                              }
                              className={`px-1.5 py-0.5 rounded-md text-[9px] font-black cursor-pointer transition-colors ${
                                (editingAtBat.columnIndex || 1) === colNo
                                  ? "bg-amber-500 text-white"
                                  : "bg-white/10 text-slate-300 hover:bg-white/20"
                              }`}
                            >
                              {colNo}列目
                            </button>
                          ));
                        })()}
                        <button
                          type="button"
                          onClick={() =>
                            setShowFullSheetInModal((prev) => !prev)
                          }
                          className="px-2 py-0.5 rounded-md bg-white/15 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Maximize2 className="w-3 h-3" />
                          <span>
                            {showFullSheetInModal
                              ? "マス拡大に戻す"
                              : "全体を見る"}
                          </span>
                        </button>
                      </div>
                    </div>
                    <div className="max-h-44 overflow-auto flex items-center justify-center p-2">
                      <img
                        src={
                          showFullSheetInModal
                            ? currentSheetImage
                            : croppedCellUrl || currentSheetImage
                        }
                        alt="Scorebook cell preview"
                        className="max-h-40 object-contain rounded-lg"
                      />
                    </div>
                  </div>
                )}

                {/* 1.5 イニング移動・打順・並び順の調整（初期折りたたみアコーディオン） */}
                {(() => {
                  const hasOrderIssueOnCurrent = (
                    issuesByAtBatId.get(editingAtBat.id) || []
                  ).some((iss) => iss.category === "order");

                  return (
                    <div
                      className={`rounded-2xl border transition-colors ${
                        showOrderAdjustPanel
                          ? "p-3 bg-indigo-500/8 border-indigo-500/30 space-y-2.5"
                          : "bg-card border-border"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setShowOrderAdjustPanel((prev) => !prev)
                        }
                        aria-expanded={showOrderAdjustPanel}
                        className={`w-full flex items-center justify-between gap-2 text-left cursor-pointer ${
                          showOrderAdjustPanel
                            ? ""
                            : "px-3 py-2.5 rounded-2xl hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                          <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          <span className="text-xs font-black text-foreground">
                            イニング・打順・並び順の調整
                          </span>
                          <span className="px-1.5 py-0.5 rounded-md bg-muted text-[10px] font-black text-muted-foreground">
                            {editingAtBat.inning}回
                            {editingAtBat.isTop ? "表" : "裏"}・
                            {editingAtBat.battingOrder}番（回内
                            {editingIndexWithinInning + 1}/
                            {editingInningPeers.length}）
                          </span>
                          {hasOrderIssueOnCurrent && (
                            <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[9px] font-black">
                              打順要確認
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 flex items-center gap-0.5 shrink-0">
                          <span>{showOrderAdjustPanel ? "閉じる" : "展開"}</span>
                          {showOrderAdjustPanel ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </span>
                      </button>

                      {showOrderAdjustPanel && (
                        <div className="space-y-2.5 pt-1 border-t border-indigo-500/20">
                          {/* イニング変更（前後ワンタップ＋選択式） */}
                          <div className="grid grid-cols-12 gap-1.5 items-center">
                            <button
                              type="button"
                              disabled={editingAtBat.inning <= 1}
                              onClick={() =>
                                handleMoveAtBatToInning(
                                  editingAtBat.id,
                                  editingAtBat.inning - 1
                                )
                              }
                              className="col-span-4 h-9 px-2 rounded-xl bg-card border border-border text-xs font-black text-foreground flex items-center justify-center gap-1 disabled:opacity-35 active:scale-95 transition-all cursor-pointer disabled:cursor-not-allowed"
                            >
                              <ChevronLeft className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                              <span>
                                {Math.max(1, editingAtBat.inning - 1)}回へ移動
                              </span>
                            </button>

                            <select
                              value={editingAtBat.inning}
                              onChange={(e) =>
                                handleMoveAtBatToInning(
                                  editingAtBat.id,
                                  Number(e.target.value)
                                )
                              }
                              aria-label="この打席のイニング"
                              className="col-span-4 h-9 px-2 rounded-xl bg-card border border-indigo-500/40 text-xs font-black text-foreground text-center cursor-pointer"
                            >
                              {selectableTargetInnings.map((innOpt) => (
                                <option key={innOpt} value={innOpt}>
                                  {innOpt}回{editingAtBat.isTop ? "表" : "裏"}
                                </option>
                              ))}
                            </select>

                            <button
                              type="button"
                              disabled={editingAtBat.inning >= 15}
                              onClick={() =>
                                handleMoveAtBatToInning(
                                  editingAtBat.id,
                                  editingAtBat.inning + 1
                                )
                              }
                              className="col-span-4 h-9 px-2 rounded-xl bg-card border border-border text-xs font-black text-foreground flex items-center justify-center gap-1 disabled:opacity-35 active:scale-95 transition-all cursor-pointer disabled:cursor-not-allowed"
                            >
                              <span>{editingAtBat.inning + 1}回へ移動</span>
                              <ChevronRight className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                            </button>
                          </div>

                          {/* 打順選択 ＆ 同一イニング内の前後入替 */}
                          <div className="grid grid-cols-12 gap-1.5 items-center">
                            <div className="col-span-6">
                              <select
                                value={editingAtBat.battingOrder}
                                onChange={(e) =>
                                  handleChangeBattingOrder(
                                    editingAtBat.id,
                                    Number(e.target.value)
                                  )
                                }
                                aria-label="打順を変更"
                                className="w-full h-8 px-2 rounded-xl bg-card border border-border text-[11px] font-black text-foreground cursor-pointer"
                              >
                                {Array.from(
                                  { length: maxBattingOrder },
                                  (_, i) => i + 1
                                ).map((ord) => {
                                  const slot = currentStructure?.batters.find(
                                    (b) => b.battingOrder === ord
                                  );
                                  return (
                                    <option key={ord} value={ord}>
                                      {ord}番
                                      {slot?.name ? `: ${slot.name}` : ""}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>

                            <button
                              type="button"
                              disabled={editingIndexWithinInning <= 0}
                              onClick={() =>
                                handleReorderWithinInning(editingAtBat.id, "up")
                              }
                              className="col-span-3 h-8 px-2 rounded-xl bg-card border border-border text-[11px] font-black text-foreground flex items-center justify-center gap-1 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
                            >
                              <ArrowUp className="w-3 h-3" />
                              <span>順を上へ</span>
                            </button>

                            <button
                              type="button"
                              disabled={
                                editingIndexWithinInning < 0 ||
                                editingIndexWithinInning >=
                                  editingInningPeers.length - 1
                              }
                              onClick={() =>
                                handleReorderWithinInning(
                                  editingAtBat.id,
                                  "down"
                                )
                              }
                              className="col-span-3 h-8 px-2 rounded-xl bg-card border border-border text-[11px] font-black text-foreground flex items-center justify-center gap-1 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
                            >
                              <ArrowDown className="w-3 h-3" />
                              <span>順を下へ</span>
                            </button>
                          </div>

                          {/* 1イニング9人一巡などで先頭打者がズレていた場合のワンタップ打順回転 */}
                          {editingInningPeers.length >= 2 &&
                            editingIndexWithinInning > 0 && (
                              <div className="pt-1 border-t border-indigo-500/20 flex items-center justify-between gap-2 flex-wrap">
                                <span className="text-[10px] font-bold text-muted-foreground">
                                  打者一巡などでこの回の先頭位置がズレている場合:
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRotateInningLeadOffToAtBat(
                                      editingAtBat.id
                                    )
                                  }
                                  className="h-7 px-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-black flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>
                                    この打者（{editingAtBat.battingOrder}番）を
                                    {editingAtBat.inning}回の先頭にする（打順回転）
                                  </span>
                                </button>
                              </div>
                            )}

                          {/* 打者一巡などの列ズレ一括シフト */}
                          <div className="pt-1 border-t border-indigo-500/20 flex items-center justify-between gap-1.5 flex-wrap">
                            <span className="text-[10px] font-bold text-muted-foreground">
                              以降の打席も丸ごと列ズレしている場合:
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={editingAtBat.inning <= 1}
                                onClick={() =>
                                  handleShiftSubsequentInnings(
                                    editingAtBat.id,
                                    -1
                                  )
                                }
                                className="h-7 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-35 text-white text-[10px] font-black active:scale-95 transition-all cursor-pointer disabled:cursor-not-allowed"
                              >
                                この打席以降すべて -1回
                              </button>
                              <button
                                type="button"
                                disabled={editingAtBat.inning >= 15}
                                onClick={() =>
                                  handleShiftSubsequentInnings(
                                    editingAtBat.id,
                                    1
                                  )
                                }
                                className="h-7 px-2.5 rounded-lg bg-card border border-border hover:bg-muted text-foreground text-[10px] font-black active:scale-95 transition-all cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
                              >
                                以降すべて +1回
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* STEP 1: 1球ごとの投球・牽制・ボーク順序エディタ（実際の試合・スコアラー記入順の先頭！） */}
                <div className="p-3 rounded-2xl bg-sky-500/8 border-2 border-sky-500/35 space-y-2.5">
                  {(() => {
                    const modalPickoffCnt = editingAtBat.pitches.filter((p) =>
                      isPickoffPitch(p)
                    ).length;
                    const modalBalkCnt = editingAtBat.pitches.filter(
                      (p) => p === "balk"
                    ).length;
                    const modalRealCnt =
                      editingAtBat.pitches.length -
                      modalPickoffCnt -
                      modalBalkCnt;
                    return (
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded-md bg-sky-600 text-white text-[10px] font-black">
                            STEP 1
                          </span>
                          <span>
                            1球ごとの投球・牽制・ボーク順序（{modalRealCnt}球
                            {modalPickoffCnt > 0
                              ? ` / 牽制${modalPickoffCnt}`
                              : ""}
                            {modalBalkCnt > 0 ? ` / BK${modalBalkCnt}` : ""}）
                          </span>
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-card border border-border text-[11px] font-black text-sky-700 dark:text-sky-300">
                          B:{editingAtBat.balls} - S:{editingAtBat.strikes}
                        </span>
                      </div>
                    );
                  })()}

                  {/* 登録済み球順リスト */}
                  <div className="space-y-1.5">
                    {editingAtBat.pitches.length === 0 ? (
                      <div className="px-3 py-2 rounded-xl bg-card border border-dashed border-border text-[11px] font-bold text-muted-foreground text-center">
                        まだ投球が登録されていません。下のボタンから1球ずつ追加してください。
                      </div>
                    ) : (
                      (() => {
                        let editRealSeq = 0;
                        return editingAtBat.pitches.map((pCode, pIdx) => {
                          const meta = getPitchMeta(pCode);
                          const isMound = isNonPitchMoundEvent(pCode);
                          if (!isMound) editRealSeq += 1;
                          const moundBadge =
                            pCode === "pickoff_1b"
                              ? "牽1"
                              : pCode === "pickoff_2b"
                              ? "牽2"
                              : pCode === "pickoff_3b"
                              ? "牽3"
                              : pCode === "balk"
                              ? "BK"
                              : "牽";
                          return (
                            <div
                              key={`${editingAtBat.id}-edit-p-${pIdx}`}
                              className="flex items-center justify-between gap-1.5 p-1.5 rounded-xl bg-card border border-border"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`min-w-5 h-5 px-1 rounded-full text-[10px] font-black flex items-center justify-center shrink-0 ${
                                    isMound
                                      ? "bg-slate-500/20 text-slate-700 dark:text-slate-200"
                                      : "bg-muted text-foreground"
                                  }`}
                                >
                                  {isMound ? moundBadge : editRealSeq}
                                </span>
                                <select
                                  value={pCode}
                                  onChange={(e) => {
                                    const nextCode = e.target
                                      .value as CanonicalPitchResult;
                                    updateSingleAtBat(editingAtBat.id, (prev) => {
                                      const nextPitches = [...prev.pitches];
                                      nextPitches[pIdx] = nextCode;
                                      return applyPitchSequenceChange(
                                        prev,
                                        nextPitches,
                                        nextCode === "balk" ? "balk" : undefined
                                      );
                                    });
                                  }}
                                  className={`h-7 px-2 rounded-lg border text-[11px] font-black ${meta.toneClass}`}
                                >
                                  {pCode === "pickoff" && (
                                    <option value="pickoff">
                                      {LEGACY_PICKOFF_PRESET.badgeLabel}
                                    </option>
                                  )}
                                  {PITCH_RESULT_PRESETS.map((opt) => (
                                    <option key={opt.code} value={opt.code}>
                                      {opt.badgeLabel}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  disabled={pIdx === 0}
                                  onClick={() =>
                                    updateSingleAtBat(editingAtBat.id, (prev) => {
                                      const next = [...prev.pitches];
                                      [next[pIdx - 1], next[pIdx]] = [
                                        next[pIdx],
                                        next[pIdx - 1],
                                      ];
                                      return applyPitchSequenceChange(prev, next);
                                    })
                                  }
                                  className="p-1 rounded-md bg-muted disabled:opacity-30 cursor-pointer"
                                >
                                  <ArrowLeft className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    pIdx === editingAtBat.pitches.length - 1
                                  }
                                  onClick={() =>
                                    updateSingleAtBat(editingAtBat.id, (prev) => {
                                      const next = [...prev.pitches];
                                      [next[pIdx], next[pIdx + 1]] = [
                                        next[pIdx + 1],
                                        next[pIdx],
                                      ];
                                      return applyPitchSequenceChange(prev, next);
                                    })
                                  }
                                  className="p-1 rounded-md bg-muted disabled:opacity-30 cursor-pointer"
                                >
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateSingleAtBat(editingAtBat.id, (prev) => {
                                      const next = prev.pitches.filter(
                                        (_, i) => i !== pIdx
                                      );
                                      return applyPitchSequenceChange(prev, next);
                                    })
                                  }
                                  className="p-1 text-destructive cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        });
                      })()
                    )}
                  </div>

                  {/* 末尾に1球・牽制・ボークをワンタップ追加 */}
                  <div className="pt-1 space-y-1.5">
                    <span className="text-[10px] font-bold text-muted-foreground block">
                      ＋ 末尾に投球を追加（4球ボールで四球、3ストライクで三振、インプレー/安打球でSTEP 2へ自動連動）
                    </span>
                    <div className="grid grid-cols-3 gap-1">
                      {batterPitchPresets.map((opt) => (
                        <button
                          key={opt.code}
                          type="button"
                          onClick={() =>
                            updateSingleAtBat(editingAtBat.id, (prev) => {
                              const next = [...prev.pitches, opt.code];
                              return applyPitchSequenceChange(
                                prev,
                                next,
                                opt.code
                              );
                            })
                          }
                          className={`py-1.5 px-1 rounded-lg border text-[10px] font-black active:scale-95 cursor-pointer ${opt.toneClass}`}
                        >
                          +{opt.shortLabel}
                        </button>
                      ))}
                    </div>
                    <span className="text-[10px] font-bold text-muted-foreground block pt-0.5">
                      ＋ 牽制球・ボークを追加（投球数・BSカウント外）
                    </span>
                    <div className="grid grid-cols-4 gap-1">
                      {moundActionPresets.map((opt) => (
                        <button
                          key={opt.code}
                          type="button"
                          onClick={() =>
                            updateSingleAtBat(editingAtBat.id, (prev) => {
                              const next = [...prev.pitches, opt.code];
                              return applyPitchSequenceChange(
                                prev,
                                next,
                                opt.code
                              );
                            })
                          }
                          className={`py-1.5 px-1 rounded-lg border text-[10px] font-black active:scale-95 cursor-pointer ${opt.toneClass}`}
                        >
                          +{opt.shortLabel}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* STEP 1 -> STEP 2 接続ナビゲーションバー */}
                  {(() => {
                    const batterOnly = editingAtBat.pitches.filter(
                      (p) => !isNonPitchMoundEvent(p)
                    );
                    const lastBP =
                      batterOnly.length > 0
                        ? batterOnly[batterOnly.length - 1]
                        : undefined;
                    const isNoInPlayResult =
                      editingAtBat.resultCode === "walk" ||
                      editingAtBat.resultCode === "intentional_walk" ||
                      editingAtBat.resultCode === "hit_by_pitch" ||
                      editingAtBat.resultCode === "strikeout";

                    return (
                      <div className="px-2.5 py-1.5 rounded-xl bg-card border border-border flex items-center justify-between gap-2 text-[10px] font-black">
                        {lastBP === "hit" ? (
                          <span className="text-emerald-700 dark:text-emerald-400">
                            最終球: 安打球 ➔ 下の STEP 2 で安打種別・打球方向を選択
                          </span>
                        ) : lastBP === "in_play" ? (
                          <span className="text-indigo-700 dark:text-indigo-300">
                            最終球: インプレー ➔ 下の STEP 2 で打球結果・守備位置を選択
                          </span>
                        ) : isNoInPlayResult ? (
                          <span className="text-sky-700 dark:text-sky-300">
                            投球確定: {editingAtBat.resultLabel}（インプレーなし） ➔ STEP 3 で走者状況を確認
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            打球が発生した場合は「+インプレー」または「+安打球」を追加して STEP 2 へ
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* STEP 2: 打撃結果・守備位置ワンタップ選択 */}
                <div className="p-3 rounded-2xl bg-indigo-500/6 border-2 border-indigo-500/30 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <label className="text-xs font-black text-foreground flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded-md bg-indigo-600 text-white text-[10px] font-black">
                        STEP 2
                      </span>
                      <span>打撃結果・守備位置（インプレー内容／確定結果）</span>
                    </label>
                    {editingAtBat.confidence === "low" && (
                      <button
                        type="button"
                        onClick={() =>
                          updateSingleAtBat(editingAtBat.id, (prev) => ({
                            ...prev,
                            confidence: "high",
                            confidenceReason: undefined,
                          }))
                        }
                        className="px-2.5 py-1 rounded-full bg-emerald-600 text-white text-[10px] font-black flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3 h-3" />
                        <span>確認済みにする</span>
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {(
                      [
                        { group: "hit", title: "安打" },
                        { group: "walk_sac", title: "四死球・敬遠・打撃妨害・犠打飛" },
                        { group: "out", title: "アウト・三振・振逃アウト・インフィールドF・妨害" },
                        { group: "reach", title: "振逃セーフ・失策・野選・途中断" },
                      ] as const
                    ).map((cat) => {
                      const items = AT_BAT_RESULT_PRESETS.filter(
                        (p) => p.group === cat.group
                      );
                      return (
                        <div key={cat.group} className="space-y-1">
                          <span className="text-[10px] font-bold text-muted-foreground block">
                            {cat.title}
                          </span>
                          <div className="grid grid-cols-4 gap-1">
                            {items.map((preset) => {
                              const sameCodeCount = AT_BAT_RESULT_PRESETS.filter(
                                (x) => x.code === preset.code
                              ).length;
                              const active =
                                editingAtBat.resultCode === preset.code &&
                                (sameCodeCount === 1 ||
                                  editingAtBat.resultLabel ===
                                    preset.defaultLabel ||
                                  (preset.id === "so_swing" &&
                                    editingAtBat.resultLabel !== "見逃し三振" &&
                                    editingAtBat.resultLabel !==
                                      "スリーバント失敗") ||
                                  (preset.id === "flyout" &&
                                    !editingAtBat.resultLabel.includes("直") &&
                                    !editingAtBat.resultLabel.includes(
                                      "ライナー"
                                    )));
                              return (
                                <button
                                  key={preset.id}
                                  type="button"
                                  onClick={() =>
                                    updateSingleAtBat(
                                      editingAtBat.id,
                                      (prev) => {
                                        const nextCode =
                                          preset.code as CanonicalAtBatResult;
                                        const nonFieldedCodes =
                                          nextCode === "walk" ||
                                          nextCode === "intentional_walk" ||
                                          nextCode === "hit_by_pitch" ||
                                          nextCode === "strikeout" ||
                                          nextCode === "other";

                                        const prevFielding = parseFieldingMeta(
                                          prev.resultCode,
                                          prev.battedDirection,
                                          prev.resultLabel
                                        );

                                        let nextDir = "";
                                        let nextLabel = preset.defaultLabel;

                                        if (!nonFieldedCodes) {
                                          const effectivePos:
                                            | DefensivePosNumber
                                            | "" =
                                            prevFielding.primaryPos ||
                                            (nextCode ===
                                              "dropped_third_strike_out" ||
                                            nextCode === "interference"
                                              ? "2"
                                              : "");

                                          if (effectivePos) {
                                            const forcedFlyStyle: FlyStyleOption =
                                              preset.id === "lineout"
                                                ? "liner"
                                                : preset.id === "flyout" &&
                                                  prevFielding.flyStyle ===
                                                    "liner"
                                                ? "fly"
                                                : prevFielding.flyStyle;

                                            const composed =
                                              composeFieldingResult({
                                                resultCode: nextCode,
                                                primaryPos: effectivePos,
                                                assistTargetPos:
                                                  prevFielding.assistTargetPos,
                                                dpRelay: prevFielding.dpRelay,
                                                hitZone: prevFielding.hitZone,
                                                flyStyle: forcedFlyStyle,
                                                errorStyle:
                                                  prevFielding.errorStyle,
                                                fallbackLabel:
                                                  preset.defaultLabel,
                                              });
                                            nextDir = composed.battedDirection;
                                            nextLabel = composed.resultLabel;
                                          }
                                        }

                                        // STEP 2 の選択に合わせて STEP 1 の最終打者球（インプレー / 安打球 / 死球）も双方向同期
                                        let nextPitches = [...prev.pitches];
                                        let lastBatterPitchIdx = -1;
                                        for (
                                          let i = nextPitches.length - 1;
                                          i >= 0;
                                          i--
                                        ) {
                                          if (
                                            !isNonPitchMoundEvent(
                                              nextPitches[i]
                                            )
                                          ) {
                                            lastBatterPitchIdx = i;
                                            break;
                                          }
                                        }

                                        const isNextHit =
                                          nextCode === "single" ||
                                          nextCode === "double" ||
                                          nextCode === "triple" ||
                                          nextCode === "home_run";

                                        if (isNextHit) {
                                          if (
                                            lastBatterPitchIdx >= 0 &&
                                            (nextPitches[lastBatterPitchIdx] ===
                                              "in_play" ||
                                              nextPitches[
                                                lastBatterPitchIdx
                                              ] === "hbp")
                                          ) {
                                            nextPitches[lastBatterPitchIdx] =
                                              "hit";
                                          } else if (nextPitches.length === 0) {
                                            nextPitches = ["hit"];
                                          }
                                        } else if (
                                          nextCode === "hit_by_pitch"
                                        ) {
                                          if (
                                            lastBatterPitchIdx >= 0 &&
                                            (nextPitches[lastBatterPitchIdx] ===
                                              "in_play" ||
                                              nextPitches[
                                                lastBatterPitchIdx
                                              ] === "hit")
                                          ) {
                                            nextPitches[lastBatterPitchIdx] =
                                              "hbp";
                                          } else if (nextPitches.length === 0) {
                                            nextPitches = ["hbp"];
                                          }
                                        } else if (
                                          !nonFieldedCodes &&
                                          nextCode !== "dropped_third_strike" &&
                                          nextCode !==
                                            "dropped_third_strike_out"
                                        ) {
                                          if (
                                            lastBatterPitchIdx >= 0 &&
                                            (nextPitches[lastBatterPitchIdx] ===
                                              "hit" ||
                                              nextPitches[
                                                lastBatterPitchIdx
                                              ] === "hbp")
                                          ) {
                                            nextPitches[lastBatterPitchIdx] =
                                              "in_play";
                                          } else if (nextPitches.length === 0) {
                                            nextPitches = ["in_play"];
                                          }
                                        } else if (
                                          nextCode === "walk" ||
                                          nextCode === "intentional_walk" ||
                                          nextCode === "strikeout" ||
                                          nextCode === "dropped_third_strike" ||
                                          nextCode ===
                                            "dropped_third_strike_out"
                                        ) {
                                          if (
                                            lastBatterPitchIdx >= 0 &&
                                            (nextPitches[lastBatterPitchIdx] ===
                                              "in_play" ||
                                              nextPitches[
                                                lastBatterPitchIdx
                                              ] === "hit" ||
                                              nextPitches[
                                                lastBatterPitchIdx
                                              ] === "hbp") &&
                                            nextPitches.length > 1
                                          ) {
                                            nextPitches = nextPitches.filter(
                                              (_, idx) =>
                                                idx !== lastBatterPitchIdx
                                            );
                                          }
                                        }

                                        const syncedCnt =
                                          computeCountFromPitches(nextPitches);

                                        const smartRunnerSync =
                                          buildSmartAdvancesForResultChange({
                                            prevAb: prev,
                                            nextResultCode: nextCode,
                                            nextBattedDirection: nextDir,
                                            nextResultLabel: nextLabel,
                                            defaultPresetOuts:
                                              preset.defaultOuts,
                                            outsBefore:
                                              editingRunnerSnapshot?.outsBefore ??
                                              0,
                                            basesBefore:
                                              editingRunnerSnapshot?.basesBefore ?? {
                                                "1B": null,
                                                "2B": null,
                                                "3B": null,
                                              },
                                          });

                                        return {
                                          ...prev,
                                          resultCode: nextCode,
                                          resultLabel: nextLabel,
                                          battedDirection: nextDir,
                                          pitches: nextPitches,
                                          balls: syncedCnt.balls,
                                          strikes: syncedCnt.strikes,
                                          advances: smartRunnerSync.advances,
                                          outsInPlay: smartRunnerSync.outsInPlay,
                                          runsInPlay: smartRunnerSync.runsInPlay,
                                          rbi: smartRunnerSync.rbi,
                                          confidence: "high",
                                        };
                                      }
                                    )
                                  }
                                  className={`py-1.5 px-1 rounded-xl text-[10px] border border-border transition-all cursor-pointer ${
                                    active
                                      ? "bg-indigo-600 text-white border-indigo-600 font-black shadow-2xs"
                                      : "bg-card text-foreground font-bold hover:bg-muted/60"
                                  }`}
                                >
                                  {preset.shortLabel}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 2-B. 守備位置・打球方向・送球ルート ワンタップ指定パネル */}
                  {(() => {
                    const fMeta = parseFieldingMeta(
                      editingAtBat.resultCode,
                      editingAtBat.battedDirection,
                      editingAtBat.resultLabel
                    );
                    const rc = editingAtBat.resultCode;
                    const isHitCode =
                      rc === "single" ||
                      rc === "double" ||
                      rc === "triple" ||
                      rc === "home_run";
                    const isThrowOutCode =
                      rc === "groundout" ||
                      rc === "sac_bunt" ||
                      rc === "dropped_third_strike_out";
                    const isDpCode =
                      rc === "double_play" || rc === "triple_play";
                    const isFlyCode = rc === "flyout" || rc === "sac_fly";
                    const isErrorCode = rc === "error";
                    const isNonFielded =
                      rc === "walk" ||
                      rc === "intentional_walk" ||
                      rc === "hit_by_pitch" ||
                      rc === "strikeout";

                    const outfieldPositions = DEFENSIVE_POSITIONS.filter(
                      (p) => p.isOutfield
                    );
                    const infieldPositions = DEFENSIVE_POSITIONS.filter(
                      (p) => !p.isOutfield
                    );

                    const applyPositionSelection = (
                      nextPos: DefensivePosNumber,
                      overrides?: {
                        assistTargetPos?: AssistTargetOption | "";
                        dpRelay?: string;
                        hitZone?: HitZoneOption;
                        flyStyle?: FlyStyleOption;
                        errorStyle?: ErrorStyleOption;
                      }
                    ) => {
                      updateSingleAtBat(editingAtBat.id, (prev) => {
                        const cur = parseFieldingMeta(
                          prev.resultCode,
                          prev.battedDirection,
                          prev.resultLabel
                        );
                        // 四死球・三振のまま守備位置をタップした場合は自動でゴロまたは単打に切り替えず、もし三振なら振逃アウト以外ではそのまま記号保持、それ以外は自動ラベル合成
                        const effectiveCode =
                          prev.resultCode === "strikeout"
                            ? prev.resultCode
                            : prev.resultCode;

                        if (
                          effectiveCode === "walk" ||
                          effectiveCode === "intentional_walk" ||
                          effectiveCode === "hit_by_pitch" ||
                          effectiveCode === "strikeout"
                        ) {
                          return {
                            ...prev,
                            battedDirection: nextPos,
                            confidence: "high",
                          };
                        }

                        const nextZone: HitZoneOption =
                          overrides?.hitZone ??
                          (Number(nextPos) <= 6 && effectiveCode === "single"
                            ? "infield"
                            : cur.hitZone === "gap_lc" ||
                              cur.hitZone === "gap_rc" ||
                              cur.hitZone === "infield"
                            ? effectiveCode === "single"
                              ? "front"
                              : "over"
                            : cur.hitZone);

                        const nextDpRelay =
                          overrides?.dpRelay !== undefined
                            ? overrides.dpRelay
                            : nextPos !== cur.primaryPos
                            ? getDefaultDpRelay(nextPos)
                            : cur.dpRelay;

                        const nextAssist =
                          overrides?.assistTargetPos !== undefined
                            ? overrides.assistTargetPos
                            : nextPos === "3" && effectiveCode === "groundout"
                            ? "unassisted"
                            : cur.assistTargetPos === "unassisted" &&
                              nextPos !== "3"
                            ? "3"
                            : cur.assistTargetPos;

                        const composed = composeFieldingResult({
                          resultCode: effectiveCode,
                          primaryPos: nextPos,
                          assistTargetPos: nextAssist,
                          dpRelay: nextDpRelay,
                          hitZone: nextZone,
                          flyStyle: overrides?.flyStyle ?? cur.flyStyle,
                          errorStyle: overrides?.errorStyle ?? cur.errorStyle,
                          fallbackLabel: prev.resultLabel,
                        });

                        const wasForceGroundout = isForceOutGroundout(
                          prev.resultCode,
                          prev.battedDirection,
                          prev.resultLabel
                        );
                        const willBeForceGroundout = isForceOutGroundout(
                          effectiveCode,
                          composed.battedDirection,
                          composed.resultLabel
                        );

                        if (wasForceGroundout !== willBeForceGroundout) {
                          const syncedForce =
                            buildSmartAdvancesForResultChange({
                              prevAb: prev,
                              nextResultCode: effectiveCode,
                              nextBattedDirection: composed.battedDirection,
                              nextResultLabel: composed.resultLabel,
                              defaultPresetOuts: 1,
                              outsBefore:
                                editingRunnerSnapshot?.outsBefore ?? 0,
                              basesBefore:
                                editingRunnerSnapshot?.basesBefore ?? {
                                  "1B": null,
                                  "2B": null,
                                  "3B": null,
                                },
                            });
                          return {
                            ...prev,
                            battedDirection: composed.battedDirection,
                            resultLabel: composed.resultLabel,
                            advances: syncedForce.advances,
                            outsInPlay: syncedForce.outsInPlay,
                            runsInPlay: syncedForce.runsInPlay,
                            rbi: syncedForce.rbi,
                            confidence: "high",
                          };
                        }

                        return {
                          ...prev,
                          battedDirection: composed.battedDirection,
                          resultLabel: composed.resultLabel,
                          confidence: "high",
                        };
                      });
                    };

                    return (
                      <div className="p-3 rounded-2xl bg-muted/35 border border-border space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-black text-foreground">
                              守備位置・打球方向を指定
                            </span>
                            {editingAtBat.battedDirection && (
                              <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-black">
                                {editingAtBat.battedDirection}
                              </span>
                            )}
                          </div>
                          {(fMeta.primaryPos ||
                            editingAtBat.battedDirection) && (
                            <button
                              type="button"
                              onClick={() =>
                                updateSingleAtBat(editingAtBat.id, (prev) => {
                                  const genericPreset =
                                    AT_BAT_RESULT_PRESETS.find(
                                      (p) => p.code === prev.resultCode
                                    );
                                  return {
                                    ...prev,
                                    battedDirection: "",
                                    resultLabel:
                                      genericPreset?.defaultLabel ||
                                      prev.resultLabel,
                                  };
                                })
                              }
                              className="px-2 py-0.5 rounded-lg bg-card border border-border text-[10px] font-black text-muted-foreground hover:text-foreground cursor-pointer"
                            >
                              位置クリア
                            </button>
                          )}
                        </div>

                        {isNonFielded ? (
                          <p className="text-[10px] font-bold text-muted-foreground">
                            ※四死球・三振のため守備位置の指定は不要です（ゴロ・フライ・安打・失策等を選ぶとワンタップで1投〜9右を指定できます）
                          </p>
                        ) : (
                          <>
                            {/* 外野 7左・8中・9右（グラウンド視点の上段3列） */}
                            <div className="grid grid-cols-3 gap-1">
                              {outfieldPositions.map((pos) => {
                                const isSelected =
                                  fMeta.primaryPos === pos.code &&
                                  fMeta.hitZone !== "gap_lc" &&
                                  fMeta.hitZone !== "gap_rc";
                                return (
                                  <button
                                    key={pos.code}
                                    type="button"
                                    onClick={() =>
                                      applyPositionSelection(pos.code)
                                    }
                                    className={`py-1.5 px-2 rounded-xl text-[11px] border transition-all cursor-pointer ${
                                      isSelected
                                        ? "bg-emerald-600 text-white border-emerald-600 font-black shadow-2xs"
                                        : "bg-card border-border text-foreground font-black hover:bg-muted"
                                    }`}
                                  >
                                    {pos.code} {pos.shortJa}（{pos.fullJa}）
                                  </button>
                                );
                              })}
                            </div>

                            {/* 内野・バッテリー 1投〜6遊（下段6列） */}
                            <div className="grid grid-cols-6 gap-1">
                              {infieldPositions.map((pos) => {
                                const isSelected =
                                  fMeta.primaryPos === pos.code;
                                return (
                                  <button
                                    key={pos.code}
                                    type="button"
                                    onClick={() =>
                                      applyPositionSelection(pos.code)
                                    }
                                    className={`py-1.5 px-1 rounded-xl text-[11px] border transition-all cursor-pointer ${
                                      isSelected
                                        ? "bg-emerald-600 text-white border-emerald-600 font-black shadow-2xs"
                                        : "bg-card border-border text-foreground font-black hover:bg-muted"
                                    }`}
                                  >
                                    {pos.badgeLabel}
                                  </button>
                                );
                              })}
                            </div>

                            {/* 安打時の打球性質・左中間/右中間チップ */}
                            {isHitCode && (
                              <div className="pt-1 space-y-1">
                                <span className="text-[10px] font-bold text-muted-foreground block">
                                  打球ゾーン・性質:
                                </span>
                                <div className="grid grid-cols-3 gap-1">
                                  {(
                                    [
                                      { id: "front", label: "前（左前・中前等）" },
                                      { id: "over", label: "越（オーバー）" },
                                      { id: "line", label: "線（ライン際）" },
                                      { id: "gap_lc", label: "左中間 (7-8)" },
                                      { id: "gap_rc", label: "右中間 (8-9)" },
                                      {
                                        id: "infield",
                                        label:
                                          rc === "home_run"
                                            ? "ランニングHR"
                                            : "内野安打/強襲",
                                      },
                                    ] as const
                                  ).map((z) => {
                                    const activeZone = fMeta.hitZone === z.id;
                                    return (
                                      <button
                                        key={z.id}
                                        type="button"
                                        onClick={() => {
                                          const basePos: DefensivePosNumber =
                                            z.id === "gap_lc"
                                              ? "7"
                                              : z.id === "gap_rc"
                                              ? "9"
                                              : fMeta.primaryPos || "8";
                                          applyPositionSelection(basePos, {
                                            hitZone: z.id,
                                          });
                                        }}
                                        className={`py-1 px-1.5 rounded-lg text-[10px] border transition-all cursor-pointer ${
                                          activeZone &&
                                          (fMeta.primaryPos !== "" ||
                                            z.id === "gap_lc" ||
                                            z.id === "gap_rc")
                                            ? "bg-indigo-600 text-white border-indigo-600 font-black"
                                            : "bg-card border-border text-foreground font-bold"
                                        }`}
                                      >
                                        {z.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* ゴロ・犠打・振逃アウト時の送球先（刺殺野手）セレクター */}
                            {isThrowOutCode && fMeta.primaryPos && (
                              <div className="pt-1 space-y-1">
                                <span className="text-[10px] font-bold text-muted-foreground block">
                                  送球先（アウトにした野手・塁）:
                                </span>
                                <div className="grid grid-cols-3 gap-1">
                                  {(
                                    [
                                      { id: "3", label: "一塁送球 (-3)" },
                                      { id: "1", label: "一塁カバー投 (-1)" },
                                      { id: "4", label: "二封・二塁手 (-4)" },
                                      { id: "6", label: "二封・遊撃手 (-6)" },
                                      { id: "5", label: "三塁封殺 (-5)" },
                                      { id: "2", label: "本塁封殺 (-2)" },
                                      {
                                        id: "unassisted",
                                        label: "単独アウト (無補殺)",
                                      },
                                    ] as const
                                  ).map((tgt) => {
                                    const effectiveCurTarget =
                                      fMeta.assistTargetPos ||
                                      (fMeta.primaryPos === "3" &&
                                      rc === "groundout"
                                        ? "unassisted"
                                        : "3");
                                    const isTgtActive =
                                      effectiveCurTarget === tgt.id;
                                    return (
                                      <button
                                        key={tgt.id}
                                        type="button"
                                        onClick={() =>
                                          fMeta.primaryPos &&
                                          applyPositionSelection(
                                            fMeta.primaryPos,
                                            { assistTargetPos: tgt.id }
                                          )
                                        }
                                        className={`py-1 px-1.5 rounded-lg text-[10px] border transition-all cursor-pointer ${
                                          isTgtActive
                                            ? "bg-indigo-600 text-white border-indigo-600 font-black"
                                            : "bg-card border-border text-foreground font-bold"
                                        }`}
                                      >
                                        {tgt.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* 併殺打・三重殺の中継ルートプリセット */}
                            {isDpCode && (
                              <div className="pt-1 space-y-1">
                                <span className="text-[10px] font-bold text-muted-foreground block">
                                  併殺送球ルート（ワンタップ選択）:
                                </span>
                                <div className="flex flex-wrap gap-1">
                                  {DP_RELAY_PRESETS.map((relay) => {
                                    const isRelayActive =
                                      editingAtBat.battedDirection === relay ||
                                      fMeta.dpRelay === relay;
                                    return (
                                      <button
                                        key={relay}
                                        type="button"
                                        onClick={() => {
                                          const firstPos =
                                            relay[0] as DefensivePosNumber;
                                          applyPositionSelection(firstPos, {
                                            dpRelay: relay,
                                          });
                                        }}
                                        className={`py-1 px-2 rounded-lg text-[10px] border transition-all cursor-pointer ${
                                          isRelayActive
                                            ? "bg-indigo-600 text-white border-indigo-600 font-black"
                                            : "bg-card border-border text-foreground font-bold"
                                        }`}
                                      >
                                        {relay}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* フライ・邪飛・ライナー種別切替 */}
                            {isFlyCode && fMeta.primaryPos && (
                              <div className="pt-1 space-y-1">
                                <span className="text-[10px] font-bold text-muted-foreground block">
                                  飛球・ライナー種別:
                                </span>
                                <div className="grid grid-cols-3 gap-1">
                                  {(rc === "sac_fly"
                                    ? ([
                                        { id: "fly", label: "犠飛（フェア）" },
                                        {
                                          id: "foul_fly",
                                          label: "邪犠飛（ファウル）",
                                        },
                                      ] as const)
                                    : ([
                                        { id: "fly", label: "フライ (飛)" },
                                        {
                                          id: "foul_fly",
                                          label: "ファウルフライ (邪飛)",
                                        },
                                        {
                                          id: "liner",
                                          label: "ライナー (直)",
                                        },
                                      ] as const)
                                  ).map((st) => (
                                    <button
                                      key={st.id}
                                      type="button"
                                      onClick={() =>
                                        fMeta.primaryPos &&
                                        applyPositionSelection(
                                          fMeta.primaryPos,
                                          { flyStyle: st.id }
                                        )
                                      }
                                      className={`py-1 px-1.5 rounded-lg text-[10px] border transition-all cursor-pointer ${
                                        fMeta.flyStyle === st.id
                                          ? "bg-indigo-600 text-white border-indigo-600 font-black"
                                          : "bg-card border-border text-foreground font-bold"
                                      }`}
                                    >
                                      {st.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* 失策の捕球失策 / 悪送球切替 */}
                            {isErrorCode && fMeta.primaryPos && (
                              <div className="pt-1 grid grid-cols-2 gap-1">
                                {(
                                  [
                                    {
                                      id: "fielding",
                                      label: "捕球・ファンブル失策",
                                    },
                                    { id: "throwing", label: "悪送球エラー" },
                                  ] as const
                                ).map((es) => (
                                  <button
                                    key={es.id}
                                    type="button"
                                    onClick={() =>
                                      fMeta.primaryPos &&
                                      applyPositionSelection(fMeta.primaryPos, {
                                        errorStyle: es.id,
                                      })
                                    }
                                    className={`py-1 px-2 rounded-lg text-[10px] border transition-all cursor-pointer ${
                                      fMeta.errorStyle === es.id
                                        ? "bg-indigo-600 text-white border-indigo-600 font-black"
                                        : "bg-card border-border text-foreground font-bold"
                                    }`}
                                  >
                                    {es.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-12 gap-1.5 pt-1">
                    <div className="col-span-5 space-y-1">
                      <span className="text-[10px] font-bold text-muted-foreground">
                        詳細表記（例: 左前安打）
                      </span>
                      <input
                        type="text"
                        value={editingAtBat.resultLabel}
                        onChange={(e) =>
                          updateSingleAtBat(editingAtBat.id, (prev) => ({
                            ...prev,
                            resultLabel: e.target.value,
                          }))
                        }
                        className="w-full h-9 px-2 rounded-xl bg-card border border-border text-xs font-black text-foreground"
                      />
                    </div>

                    <div className="col-span-3 space-y-1">
                      <span className="text-[10px] font-bold text-muted-foreground">
                        守備記号
                      </span>
                      <input
                        type="text"
                        value={editingAtBat.battedDirection}
                        onChange={(e) =>
                          updateSingleAtBat(editingAtBat.id, (prev) => ({
                            ...prev,
                            battedDirection: e.target.value,
                          }))
                        }
                        placeholder="6-3 / 8"
                        className="w-full h-9 px-2 rounded-xl bg-card border border-border text-xs font-black text-foreground"
                      />
                    </div>

                    <div className="col-span-2 space-y-1">
                      <span className="text-[10px] font-bold text-muted-foreground">
                        アウト
                      </span>
                      <select
                        value={editingAtBat.outsInPlay}
                        onChange={(e) =>
                          updateSingleAtBat(editingAtBat.id, (prev) => ({
                            ...prev,
                            outsInPlay: Number(e.target.value),
                          }))
                        }
                        className="w-full h-9 px-1 rounded-xl bg-card border border-border text-xs font-black text-foreground"
                      >
                        <option value={0}>0死</option>
                        <option value={1}>1死</option>
                        <option value={2}>2死</option>
                        <option value={3}>3死</option>
                      </select>
                    </div>

                    <div className="col-span-2 space-y-1">
                      <span className="text-[10px] font-bold text-muted-foreground">
                        得点
                      </span>
                      <select
                        value={editingAtBat.runsInPlay}
                        onChange={(e) =>
                          updateSingleAtBat(editingAtBat.id, (prev) => ({
                            ...prev,
                            runsInPlay: Number(e.target.value),
                            rbi: Number(e.target.value),
                          }))
                        }
                        className="w-full h-9 px-1 rounded-xl bg-card border border-border text-xs font-black text-foreground"
                      >
                        {[0, 1, 2, 3, 4].map((r) => (
                          <option key={r} value={r}>
                            {r}点
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* STEP 3: 塁上の走者状況（打席前➔打席後）＆ 前の走者の進塁・生還ワンタップエディタ */}
                <AtBatModalRunnerEditor
                  atBat={editingAtBat}
                  snapshot={editingRunnerSnapshot}
                  batters={currentStructure?.batters || []}
                  onUpdateAtBat={(updater) =>
                    updateSingleAtBat(editingAtBat.id, updater)
                  }
                />

                {/* 打席削除 */}
                <div className="flex justify-between items-center pt-1">
                  <button
                    type="button"
                    onClick={() => handleDeleteAtBat(editingAtBat.id)}
                    className="px-3 py-2 rounded-xl text-xs font-black text-destructive hover:bg-destructive/10 flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>この打席を削除</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditingAtBatId(null)}
                    className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black cursor-pointer"
                  >
                    完了して閉じる
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

