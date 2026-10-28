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
} from "lucide-react";
import {
  ADVANCE_METHOD_LABELS,
  AT_BAT_RESULT_PRESETS,
  LEGACY_PICKOFF_PRESET,
  PITCH_RESULT_PRESETS,
  isNonPitchMoundEvent,
  isPickoffPitch,
  type AdvanceMethodCode,
  type CanonicalAtBatResult,
  type CanonicalPitchResult,
  type ImportScopeMode,
  type ScorebookSheetStructure,
  type ScorebookV2Advance,
  type ScorebookV2AtBat,
  type ScorebookValidationIssue,
} from "@/types/scorebook-v2";
import {
  computeCountFromPitches,
  resolveActiveMatchupFromStructure,
  validateScorebookSheet,
} from "@/lib/liff/scorebook-validator";
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
import { cropScorebookRegion } from "@/lib/liff/scorebook-image";
import { ActionStatusBanner } from "./ActionStatusBanner";

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
        : validateScorebookSheet(topAtBats, topStructure),
    [importScope, topAtBats, topStructure]
  );

  const bottomIssues = useMemo(
    () =>
      importScope === "top_only"
        ? []
        : validateScorebookSheet(bottomAtBats, bottomStructure),
    [importScope, bottomAtBats, bottomStructure]
  );

  const currentIssues = isTop ? topIssues : bottomIssues;
  const totalIssuesCount = topIssues.length + bottomIssues.length;

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

  const editingIndex = editingAtBatId
    ? currentList.findIndex((ab) => ab.id === editingAtBatId)
    : -1;
  const editingAtBat = editingIndex >= 0 ? currentList[editingIndex] : null;

  const editingInningPeers = useMemo(() => {
    if (!editingAtBat) return [];
    return currentList.filter((a) => a.inning === editingAtBat.inning);
  }, [currentList, editingAtBat]);

  const editingIndexWithinInning = useMemo(() => {
    if (!editingAtBat) return -1;
    return editingInningPeers.findIndex((a) => a.id === editingAtBat.id);
  }, [editingInningPeers, editingAtBat]);

  // 編集中マスの切り抜きズーム画像を生成
  useEffect(() => {
    let cancelled = false;
    setShowFullSheetInModal(false);

    if (!editingAtBat || !currentSheetImage) {
      setCroppedCellUrl(null);
      return;
    }

    if (!editingAtBat.cellBox) {
      setCroppedCellUrl(currentSheetImage);
      return;
    }

    cropScorebookRegion(currentSheetImage, editingAtBat.cellBox, 0.35)
      .then((url) => {
        if (!cancelled) setCroppedCellUrl(url);
      })
      .catch(() => {
        if (!cancelled) setCroppedCellUrl(currentSheetImage);
      });

    return () => {
      cancelled = true;
    };
  }, [editingAtBat?.id, editingAtBat?.cellBox, currentSheetImage]);

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

  const batterPitchPresets = useMemo(
    () => PITCH_RESULT_PRESETS.filter((p) => !isNonPitchMoundEvent(p.code)),
    []
  );
  const moundActionPresets = useMemo(
    () => PITCH_RESULT_PRESETS.filter((p) => isNonPitchMoundEvent(p.code)),
    []
  );

  return (
    <div className="space-y-4">
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

          <div className="max-h-32 overflow-y-auto space-y-1.5">
            {currentIssues.map((iss) => (
              <button
                key={iss.id}
                type="button"
                onClick={() => {
                  if (iss.atBatId) setEditingAtBatId(iss.atBatId);
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
            if (innItems.length === 0 && onlyFlagged) return null;

            const innRuns = currentList
              .filter((a) => a.inning === inn)
              .reduce((s, a) => s + a.runsInPlay, 0);
            const innOuts = currentList
              .filter((a) => a.inning === inn)
              .reduce((s, a) => s + a.outsInPlay, 0);

            return (
              <section
                key={inn}
                className="rounded-3xl bg-card border border-border shadow-xs p-3.5 space-y-2.5"
              >
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 text-xs font-black">
                      {inn}回{isTop ? "表" : "裏"}
                    </span>
                    <span className="text-[11px] font-bold text-muted-foreground">
                      得点 {innRuns} / アウト計 {innOuts}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAddAtBatInInning(inn)}
                    className="px-2 py-1 rounded-lg bg-muted hover:bg-muted/80 text-[10px] font-black text-foreground flex items-center gap-0.5 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>打席追加</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {innItems.length === 0 ? (
                    <div className="py-3 px-3 rounded-2xl bg-muted/25 border border-dashed border-border text-center text-[11px] font-bold text-muted-foreground">
                      このイニングの打席はありません（右上の「打席追加」または他イニングから移動できます）
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

                            {/* 盗塁・進塁があれば表示 */}
                            {ab.advances.length > 0 && (
                              <div className="flex items-center flex-wrap gap-1 text-[10px] font-bold text-muted-foreground">
                                {ab.advances.map((adv) => (
                                  <span
                                    key={adv.id}
                                    className={`px-1.5 py-0.5 rounded-md border ${
                                      adv.isOut
                                        ? "bg-destructive/10 text-destructive border-destructive/25"
                                        : adv.to === "HP"
                                        ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25"
                                        : "bg-card border-border"
                                    }`}
                                  >
                                    {adv.runnerName
                                      ? `${adv.runnerName}: `
                                      : ""}
                                    {adv.from}→{adv.to}（
                                    {ADVANCE_METHOD_LABELS[adv.method] ||
                                      adv.method}
                                    ）
                                  </span>
                                ))}
                              </div>
                            )}

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
                    <div className="px-3 py-1.5 bg-slate-900 flex items-center justify-between text-white">
                      <span className="text-[10px] font-black flex items-center gap-1">
                        <ZoomIn className="w-3.5 h-3.5 text-indigo-400" />
                        {showFullSheetInModal
                          ? "シート全体画像"
                          : "手書き原本マス切り抜き"}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setShowFullSheetInModal((prev) => !prev)
                        }
                        className="px-2 py-0.5 rounded-md bg-white/15 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Maximize2 className="w-3 h-3" />
                        <span>
                          {showFullSheetInModal ? "マス拡大に戻す" : "全体を見る"}
                        </span>
                      </button>
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

                {/* 1.5 イニング移動・打順・並び順の調整（列ズレ一括補正付き） */}
                <div className="p-3 rounded-2xl bg-indigo-500/8 border border-indigo-500/25 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                      <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>イニング・打順・並び順の調整</span>
                    </span>
                    <span className="text-[10px] font-bold text-muted-foreground">
                      {editingAtBat.inning}回内 {editingIndexWithinInning + 1}/
                      {editingInningPeers.length}打席目
                    </span>
                  </div>

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
                        handleReorderWithinInning(editingAtBat.id, "down")
                      }
                      className="col-span-3 h-8 px-2 rounded-xl bg-card border border-border text-[11px] font-black text-foreground flex items-center justify-center gap-1 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <ArrowDown className="w-3 h-3" />
                      <span>順を下へ</span>
                    </button>
                  </div>

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
                          handleShiftSubsequentInnings(editingAtBat.id, -1)
                        }
                        className="h-7 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-35 text-white text-[10px] font-black active:scale-95 transition-all cursor-pointer disabled:cursor-not-allowed"
                      >
                        この打席以降すべて -1回
                      </button>
                      <button
                        type="button"
                        disabled={editingAtBat.inning >= 15}
                        onClick={() =>
                          handleShiftSubsequentInnings(editingAtBat.id, 1)
                        }
                        className="h-7 px-2.5 rounded-lg bg-card border border-border hover:bg-muted text-foreground text-[10px] font-black active:scale-95 transition-all cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
                      >
                        以降すべて +1回
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. 打撃結果ワンタップ選択 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-foreground">
                      打撃結果（成績集計カテゴリ＋表示名）
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

                                        // 単一プレースホルダー球のみの場合は安打球/インプレー球も自動同期
                                        let nextPitches = prev.pitches;
                                        const isNextHit =
                                          nextCode === "single" ||
                                          nextCode === "double" ||
                                          nextCode === "triple" ||
                                          nextCode === "home_run";
                                        if (
                                          prev.pitches.length === 1 &&
                                          (prev.pitches[0] === "in_play" ||
                                            prev.pitches[0] === "hit")
                                        ) {
                                          if (isNextHit) {
                                            nextPitches = ["hit"];
                                          } else if (!nonFieldedCodes) {
                                            nextPitches = ["in_play"];
                                          }
                                        }

                                        return {
                                          ...prev,
                                          resultCode: nextCode,
                                          resultLabel: nextLabel,
                                          battedDirection: nextDir,
                                          pitches: nextPitches,
                                          outsInPlay: preset.defaultOuts,
                                          confidence: "high",
                                        };
                                      }
                                    )
                                  }
                                  className={`py-1.5 px-1 rounded-xl text-[10px] border transition-all cursor-pointer ${
                                    active
                                      ? "bg-indigo-600 text-white border-indigo-600 font-black shadow-2xs"
                                      : "bg-muted/40 border-border text-foreground font-bold"
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
                        className="w-full h-9 px-2 rounded-xl bg-muted/40 border border-border text-xs font-black text-foreground"
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
                        className="w-full h-9 px-2 rounded-xl bg-muted/40 border border-border text-xs font-black text-foreground"
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
                        className="w-full h-9 px-1 rounded-xl bg-muted/40 border border-border text-xs font-black text-foreground"
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
                        className="w-full h-9 px-1 rounded-xl bg-muted/40 border border-border text-xs font-black text-foreground"
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

                {/* 3. 1球ごとの投球・牽制・ボーク順序エディタ（必須機能！） */}
                <div className="p-3 rounded-2xl bg-muted/35 border border-border space-y-2.5">
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
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-foreground">
                          1球ごとの投球・牽制・ボーク順序（投球 {modalRealCnt}球
                          {modalPickoffCnt > 0
                            ? ` / 牽制${modalPickoffCnt}`
                            : ""}
                          {modalBalkCnt > 0 ? ` / BK${modalBalkCnt}` : ""}）
                        </span>
                        <span className="text-[11px] font-black text-indigo-600 dark:text-indigo-400">
                          B:{editingAtBat.balls} - S:{editingAtBat.strikes}
                        </span>
                      </div>
                    );
                  })()}

                  {/* 登録済み球順リスト */}
                  <div className="space-y-1.5">
                    {(() => {
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
                                    const cnt =
                                      computeCountFromPitches(nextPitches);
                                    return {
                                      ...prev,
                                      pitches: nextPitches,
                                      balls: cnt.balls,
                                      strikes: cnt.strikes,
                                    };
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
                                    const cnt = computeCountFromPitches(next);
                                    return {
                                      ...prev,
                                      pitches: next,
                                      balls: cnt.balls,
                                      strikes: cnt.strikes,
                                    };
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
                                    const cnt = computeCountFromPitches(next);
                                    return {
                                      ...prev,
                                      pitches: next,
                                      balls: cnt.balls,
                                      strikes: cnt.strikes,
                                    };
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
                                    const cnt = computeCountFromPitches(next);
                                    return {
                                      ...prev,
                                      pitches: next,
                                      balls: cnt.balls,
                                      strikes: cnt.strikes,
                                    };
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
                    })()}
                  </div>

                  {/* 末尾に1球・牽制・ボークをワンタップ追加 */}
                  <div className="pt-1 space-y-1.5">
                    <span className="text-[10px] font-bold text-muted-foreground block">
                      ＋ 末尾に投球を追加
                    </span>
                    <div className="grid grid-cols-3 gap-1">
                      {batterPitchPresets.map((opt) => (
                        <button
                          key={opt.code}
                          type="button"
                          onClick={() =>
                            updateSingleAtBat(editingAtBat.id, (prev) => {
                              const next = [...prev.pitches, opt.code];
                              const cnt = computeCountFromPitches(next);
                              return {
                                ...prev,
                                pitches: next,
                                balls: cnt.balls,
                                strikes: cnt.strikes,
                              };
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
                              const cnt = computeCountFromPitches(next);
                              return {
                                ...prev,
                                pitches: next,
                                balls: cnt.balls,
                                strikes: cnt.strikes,
                              };
                            })
                          }
                          className={`py-1.5 px-1 rounded-lg border text-[10px] font-black active:scale-95 cursor-pointer ${opt.toneClass}`}
                        >
                          +{opt.shortLabel}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 4. 走者進塁・盗塁・ボーク・暴投・妨害・本塁生還エディタ */}
                <div className="p-3 rounded-2xl bg-muted/35 border border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-foreground">
                      走者進塁・盗塁・ボーク・暴投・生還 ({editingAtBat.advances.length}件)
                    </span>
                  </div>

                  {/* 主要走塁イベントのワンタップ追加チップ */}
                  <div className="grid grid-cols-4 gap-1">
                    {(
                      [
                        { label: "+盗塁(S)", from: "1B", to: "2B", method: "steal", isOut: false },
                        { label: "+盗塁死(CS)", from: "1B", to: "2B", method: "caught_stealing", isOut: true },
                        { label: "+牽制死(PO)", from: "1B", to: "1B", method: "pickoff_out", isOut: true },
                        { label: "+牽制悪送球", from: "1B", to: "2B", method: "pickoff_error", isOut: false },
                        { label: "+ボーク進塁", from: "1B", to: "2B", method: "balk", isOut: false },
                        { label: "+暴投(WP)", from: "1B", to: "2B", method: "wp", isOut: false },
                        { label: "+捕逸(PB)", from: "1B", to: "2B", method: "pb", isOut: false },
                        { label: "+送球間(T)", from: "1B", to: "2B", method: "throw_advance", isOut: false },
                        { label: "+走塁妨害", from: "1B", to: "2B", method: "obstruction", isOut: false },
                        { label: "+守備妨害死", from: "1B", to: "2B", method: "interference_out", isOut: true },
                        { label: "+アピール死", from: "1B", to: "1B", method: "appeal_out", isOut: true },
                        { label: "+本塁生還", from: "3B", to: "HP", method: "hit", isOut: false },
                      ] as const
                    ).map((q) => (
                      <button
                        key={q.label}
                        type="button"
                        onClick={() => {
                          const newAdv: ScorebookV2Advance = {
                            id: crypto.randomUUID(),
                            runnerName: "",
                            from: q.from,
                            to: q.to,
                            method: q.method,
                            isOut: q.isOut,
                          };
                          updateSingleAtBat(editingAtBat.id, (prev) => ({
                            ...prev,
                            outsInPlay: q.isOut
                              ? Math.min(3, prev.outsInPlay + 1)
                              : prev.outsInPlay,
                            runsInPlay:
                              q.to === "HP" && !q.isOut
                                ? prev.runsInPlay + 1
                                : prev.runsInPlay,
                            advances: [...prev.advances, newAdv],
                          }));
                        }}
                        className={`py-1.5 px-1 rounded-lg border text-[9px] font-black active:scale-95 cursor-pointer ${
                          q.isOut
                            ? "bg-destructive/10 text-destructive border-destructive/25"
                            : q.to === "HP"
                            ? "bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/30"
                            : "bg-card text-foreground border-border"
                        }`}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>

                  {editingAtBat.advances.map((adv) => (
                    <div
                      key={adv.id}
                      className="grid grid-cols-12 gap-1 items-center p-1.5 rounded-xl bg-card border border-border"
                    >
                      <input
                        type="text"
                        value={adv.runnerName}
                        onChange={(e) =>
                          updateSingleAtBat(editingAtBat.id, (prev) => ({
                            ...prev,
                            advances: prev.advances.map((a) =>
                              a.id === adv.id
                                ? { ...a, runnerName: e.target.value }
                                : a
                            ),
                          }))
                        }
                        placeholder="走者名"
                        className="col-span-3 h-8 px-1.5 rounded-lg bg-muted/40 border border-border text-[10px] font-black"
                      />

                      <select
                        value={adv.from}
                        onChange={(e) =>
                          updateSingleAtBat(editingAtBat.id, (prev) => ({
                            ...prev,
                            advances: prev.advances.map((a) =>
                              a.id === adv.id
                                ? {
                                    ...a,
                                    from: e.target.value as
                                      | "BAT"
                                      | "1B"
                                      | "2B"
                                      | "3B",
                                  }
                                : a
                            ),
                          }))
                        }
                        className="col-span-2 h-8 px-1 rounded-lg bg-muted/40 border border-border text-[10px] font-black"
                      >
                        <option value="BAT">打者</option>
                        <option value="1B">1塁</option>
                        <option value="2B">2塁</option>
                        <option value="3B">3塁</option>
                      </select>

                      <select
                        value={adv.to}
                        onChange={(e) =>
                          updateSingleAtBat(editingAtBat.id, (prev) => ({
                            ...prev,
                            advances: prev.advances.map((a) =>
                              a.id === adv.id
                                ? {
                                    ...a,
                                    to: e.target.value as
                                      | "1B"
                                      | "2B"
                                      | "3B"
                                      | "HP",
                                  }
                                : a
                            ),
                          }))
                        }
                        className="col-span-2 h-8 px-1 rounded-lg bg-muted/40 border border-border text-[10px] font-black"
                      >
                        <option value="1B">→1塁</option>
                        <option value="2B">→2塁</option>
                        <option value="3B">→3塁</option>
                        <option value="HP">→本塁</option>
                      </select>

                      <select
                        value={adv.method}
                        onChange={(e) => {
                          const m = e.target.value as AdvanceMethodCode;
                          const autoOut =
                            m === "caught_stealing" ||
                            m === "pickoff_out" ||
                            m === "interference_out" ||
                            m === "appeal_out" ||
                            m === "out_on_base";
                          updateSingleAtBat(editingAtBat.id, (prev) => ({
                            ...prev,
                            advances: prev.advances.map((a) =>
                              a.id === adv.id
                                ? { ...a, method: m, isOut: autoOut }
                                : a
                            ),
                          }));
                        }}
                        className="col-span-4 h-8 px-1 rounded-lg bg-muted/40 border border-border text-[10px] font-black"
                      >
                        {(
                          Object.keys(
                            ADVANCE_METHOD_LABELS
                          ) as AdvanceMethodCode[]
                        ).map((k) => (
                          <option key={k} value={k}>
                            {ADVANCE_METHOD_LABELS[k]}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() =>
                          updateSingleAtBat(editingAtBat.id, (prev) => ({
                            ...prev,
                            advances: prev.advances.filter(
                              (a) => a.id !== adv.id
                            ),
                          }))
                        }
                        className="col-span-1 flex justify-center text-destructive cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

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

