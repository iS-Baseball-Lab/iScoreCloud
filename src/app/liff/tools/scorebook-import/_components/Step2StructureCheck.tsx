// filepath: src/app/liff/tools/scorebook-import/_components/Step2StructureCheck.tsx
"use client";

import React, { useState, useRef } from "react";
import {
  Users,
  Plus,
  Trash2,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Loader2,
  Columns2,
  ShieldCheck,
  UserPlus,
  Eye,
  EyeOff,
  RotateCcw,
  ZoomIn,
  Grid3X3,
  SlidersHorizontal,
  Move,
  Clock,
} from "lucide-react";
import {
  bilinearGridPoint,
  clamp1000,
  resolveStructureGridCorners,
  syncStructureBoxesFromCorners,
} from "@/lib/liff/scorebook-grid";
import {
  isNonBattingBatterSlot,
  normalizePositionCode,
  resolveEffectiveBattingCycleLength,
} from "@/lib/liff/scorebook-validator";
import {
  applyInningBatterCountEdit,
  applyInningLeadOffEdit,
  computeInningEndOrder,
  computeInningPlannedSlots,
  normalizeStructureInningBatterPlan,
} from "@/lib/liff/scorebook-inning-plan";
import {
  LiffSelect,
  type LiffSelectOption,
} from "@/components/liff/LiffSelect";
import { ActionStatusBanner } from "./ActionStatusBanner";
import {
  FourCornerFineTuner,
  clampSingleCornerInQuad,
  type CornerKey,
} from "./FourCornerFineTuner";
import {
  formatElapsedSeconds,
  formatTotalElapsedSeconds,
  type ImportScopeMode,
  type NormalizedPoint,
  type OfficialPitcherDecision,
  type ScorebookBatterSlot,
  type ScorebookGridCorners,
  type ScorebookInningMeta,
  type ScorebookPitcherStint,
  type ScorebookRosterPlayer,
  type ScorebookSheetStructure,
  type ScorebookSubstitution,
  type ScorebookTimingEntry,
} from "@/types/scorebook-v2";

const OFFICIAL_PITCHER_DECISION_OPTIONS: LiffSelectOption[] = [
  {
    value: "",
    label: "自動判定（規則9.17〜9.19）",
    sublabel: "イニング・得点推移から勝敗・S・Hを公認野球規則どおり自動算出",
  },
  {
    value: "win",
    label: "○ 勝利投手（記録員指定）",
    sublabel: "規則9.17(b)/(c) 先発規定回未満や継投時の公式記録員裁定で勝利を指定",
  },
  {
    value: "loss",
    label: "● 敗戦投手（記録員指定）",
    sublabel: "規則9.17(d) 公式記録員指定による敗戦投手オーバーライド",
  },
  {
    value: "save",
    label: "S セーブ（記録員指定）",
    sublabel: "規則9.19 公式記録員指定によるセーブ投手付与",
  },
  {
    value: "hold",
    label: "H ホールド（記録員指定）",
    sublabel: "リード保持救援のホールドを手動付与",
  },
  {
    value: "none",
    label: "記録なし固定",
    sublabel: "規則9.17(c) 短時間非効果的登板など勝敗・S・H対象外に固定",
  },
];

interface Step2StructureCheckProps {
  importScope: ImportScopeMode;
  roster: ScorebookRosterPlayer[];
  opponentName: string;
  topImageDataUrl?: string | null;
  bottomImageDataUrl?: string | null;
  topStructure: ScorebookSheetStructure | null;
  bottomStructure: ScorebookSheetStructure | null;
  onChangeStructure: (isTop: boolean, updated: ScorebookSheetStructure) => void;
  onRescanSide?: (isTop: boolean) => void;
  isRescanningSide?: boolean;
  onDetectInningRanges?: (isTop: boolean) => void;
  isDetectingInningRanges?: boolean;
  structureProgressLabel?: string;
  structureTotalMs?: number | null;
  structureTimingEntries?: ScorebookTimingEntry[];
  onBack: () => void;
  onStartDeepAnalysis?: () => void;
  isAnalyzingInnings: boolean;
  analysisProgressLabel: string;
  analysisStartedAtMs?: number | null;
  analysisTotalDurationMs?: number | null;
  analysisActiveLabel?: string | null;
  analysisActiveLabels?: string[];
  analysisActiveStartedAtMs?: number | null;
  analysisCompletedTimings?: ScorebookTimingEntry[];
  onRetryTimingEntry?: (entry: ScorebookTimingEntry) => void;
  reanalyzingInningKey?: string | null;
  preservedAtBatsCount?: number;
  missingInningsCount?: number;
  onResumeMissingInnings?: () => void;
  onProceedWithCompleted?: () => void;
  errorMessage?: string | null;
  onDismissError?: () => void;
}

const POSITION_OPTIONS = [
  { value: "", label: "-" },
  { value: "1", label: "1 投" },
  { value: "2", label: "2 捕" },
  { value: "3", label: "3 一" },
  { value: "4", label: "4 二" },
  { value: "5", label: "5 三" },
  { value: "6", label: "6 遊" },
  { value: "7", label: "7 左" },
  { value: "8", label: "8 中" },
  { value: "9", label: "9 右" },
  { value: "D", label: "DH" },
];

export function Step2StructureCheck({
  importScope,
  roster,
  opponentName,
  topImageDataUrl,
  bottomImageDataUrl,
  topStructure,
  bottomStructure,
  onChangeStructure,
  onRescanSide,
  isRescanningSide = false,
  onDetectInningRanges,
  isDetectingInningRanges = false,
  structureProgressLabel,
  structureTotalMs = null,
  structureTimingEntries = [],
  onBack,
  onStartDeepAnalysis,
  isAnalyzingInnings,
  analysisProgressLabel,
  analysisStartedAtMs = null,
  analysisTotalDurationMs = null,
  analysisActiveLabel = null,
  analysisActiveLabels,
  analysisActiveStartedAtMs = null,
  analysisCompletedTimings = [],
  onRetryTimingEntry,
  reanalyzingInningKey = null,
  preservedAtBatsCount = 0,
  missingInningsCount = 0,
  onResumeMissingInnings,
  onProceedWithCompleted,
  errorMessage,
  onDismissError,
}: Step2StructureCheckProps) {
  const [activeSide, setActiveSide] = useState<"top" | "bottom">(
    importScope === "bottom_only" ? "bottom" : "top"
  );
  const [previewMode, setPreviewMode] = useState<
    "grid" | "lineup" | "full" | "hidden"
  >("grid");
  const [showBatterRangeOverlay, setShowBatterRangeOverlay] = useState(true);
  const [showGridTuner, setShowGridTuner] = useState(false);
  const [gridTuneTab, setGridTuneTab] = useState<"corners" | "edges">(
    "corners"
  );
  const [selectedCorner, setSelectedCorner] = useState<CornerKey>("tl");
  const [draggingCorner, setDraggingCorner] = useState<CornerKey | null>(null);
  const gridContainerRef = useRef<HTMLDivElement | null>(null);

  const isTop = activeSide === "top";
  const current = isTop ? topStructure : bottomStructure;
  const activeSheetDataUrl = isTop ? topImageDataUrl : bottomImageDataUrl;
  const isBusy =
    isAnalyzingInnings ||
    isRescanningSide ||
    isDetectingInningRanges ||
    Boolean(reanalyzingInningKey);

  if (!current) {
    return null;
  }

  const plannedCurrent = normalizeStructureInningBatterPlan(current, {
    fillDefaultWhenMissing: true,
  });
  const effectiveLineupLen = resolveEffectiveBattingCycleLength(plannedCurrent);

  // 現在のシートのグリッド4隅座標（0..1000、傾き・台形歪み対応）を算出
  const batterCount = Math.max(1, current.batters.length);
  const totalPhysCols = Math.max(
    1,
    current.innings.reduce((acc, m) => acc + Math.max(1, m.columnCount || 1), 0)
  );
  const gridCorners = resolveStructureGridCorners(current);

  const gridLeftX = Math.round((gridCorners.tl[0] + gridCorners.bl[0]) / 2);
  const gridRightX = Math.round((gridCorners.tr[0] + gridCorners.br[0]) / 2);
  const gridTopY = Math.round((gridCorners.tl[1] + gridCorners.tr[1]) / 2);
  const gridBottomY = Math.round((gridCorners.bl[1] + gridCorners.br[1]) / 2);
  const isGridSkewed =
    Math.abs(gridCorners.tl[1] - gridCorners.tr[1]) >= 4 ||
    Math.abs(gridCorners.bl[1] - gridCorners.br[1]) >= 4 ||
    Math.abs(gridCorners.tl[0] - gridCorners.bl[0]) >= 4 ||
    Math.abs(gridCorners.tr[0] - gridCorners.br[0]) >= 4;

  const handleUpdateCornerCoordinate = (
    key: CornerKey,
    nextPoint: NormalizedPoint
  ) => {
    const nextCorners: ScorebookGridCorners = {
      ...gridCorners,
      [key]: nextPoint,
    };
    onChangeStructure(
      isTop,
      syncStructureBoxesFromCorners(current, nextCorners)
    );
  };

  const handleUpdateCornerPoint = (
    key: CornerKey,
    clientX: number,
    clientY: number
  ) => {
    const el = gridContainerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return;
    const nx = clamp1000(((clientX - rect.left) / rect.width) * 1000);
    const ny = clamp1000(((clientY - rect.top) / rect.height) * 1000);
    handleUpdateCornerCoordinate(
      key,
      clampSingleCornerInQuad(gridCorners, key, nx, ny, 90, 125)
    );
  };

  const handleAdjustGridBound = (
    edge: "left" | "right" | "top" | "bottom",
    nextVal: number
  ) => {
    const nextCorners: ScorebookGridCorners = {
      tl: [...gridCorners.tl] as NormalizedPoint,
      tr: [...gridCorners.tr] as NormalizedPoint,
      br: [...gridCorners.br] as NormalizedPoint,
      bl: [...gridCorners.bl] as NormalizedPoint,
    };
    if (edge === "left") {
      const dx = nextVal - gridLeftX;
      nextCorners.tl[0] += dx;
      nextCorners.bl[0] += dx;
    } else if (edge === "right") {
      const dx = nextVal - gridRightX;
      nextCorners.tr[0] += dx;
      nextCorners.br[0] += dx;
    } else if (edge === "top") {
      const dy = nextVal - gridTopY;
      nextCorners.tl[1] += dy;
      nextCorners.tr[1] += dy;
    } else {
      const dy = nextVal - gridBottomY;
      nextCorners.bl[1] += dy;
      nextCorners.br[1] += dy;
    }
    onChangeStructure(
      isTop,
      syncStructureBoxesFromCorners(current, nextCorners)
    );
  };

  const handleResetSkewToRectangle = () => {
    onChangeStructure(
      isTop,
      syncStructureBoxesFromCorners(current, {
        tl: [gridLeftX, gridTopY],
        tr: [gridRightX, gridTopY],
        br: [gridRightX, gridBottomY],
        bl: [gridLeftX, gridBottomY],
      })
    );
  };

  const extrapolateHorizontalCols = (
    base: ScorebookSheetStructure,
    deltaCols: number
  ): ScorebookSheetStructure => {
    const topUx = (gridCorners.tr[0] - gridCorners.tl[0]) / totalPhysCols;
    const topUy = (gridCorners.tr[1] - gridCorners.tl[1]) / totalPhysCols;
    const botUx = (gridCorners.br[0] - gridCorners.bl[0]) / totalPhysCols;
    const botUy = (gridCorners.br[1] - gridCorners.bl[1]) / totalPhysCols;
    return syncStructureBoxesFromCorners(base, {
      tl: gridCorners.tl,
      tr: [
        gridCorners.tr[0] + deltaCols * topUx,
        gridCorners.tr[1] + deltaCols * topUy,
      ],
      br: [
        gridCorners.br[0] + deltaCols * botUx,
        gridCorners.br[1] + deltaCols * botUy,
      ],
      bl: gridCorners.bl,
    });
  };

  const maxInningOption = Math.max(
    12,
    current.innings[current.innings.length - 1]?.inning || 7,
    ...current.pitchers.flatMap((p) => [p.fromInning, p.toInning]),
    ...current.batters.flatMap((b) =>
      b.substitutions.map((s) => s.inningEntered)
    )
  );
  const inningOptions = Array.from(
    { length: maxInningOption },
    (_, i) => i + 1
  );

  const commitPlannedStructureUpdate = (nextStruct: ScorebookSheetStructure) => {
    const newPhysCols = Math.max(
      1,
      nextStruct.innings.reduce(
        (acc, m) => acc + Math.max(1, m.columnCount || 1),
        0
      )
    );
    const deltaCols = newPhysCols - totalPhysCols;
    if (deltaCols !== 0) {
      onChangeStructure(isTop, extrapolateHorizontalCols(nextStruct, deltaCols));
    } else {
      onChangeStructure(isTop, nextStruct);
    }
  };

  const handleChangeInningBatterCount = (
    inningNum: number,
    nextBatterCount: number
  ) => {
    const updated = applyInningBatterCountEdit(
      plannedCurrent,
      inningNum,
      nextBatterCount
    );
    commitPlannedStructureUpdate(updated);
  };

  const handleChangeInningLeadOff = (
    inningNum: number,
    nextLeadOff: number | null
  ) => {
    const updated = applyInningLeadOffEdit(
      plannedCurrent,
      inningNum,
      nextLeadOff
    );
    commitPlannedStructureUpdate(updated);
  };

  const updateInningMeta = (
    inningNum: number,
    patch: Partial<ScorebookInningMeta>
  ) => {
    const prevTarget = plannedCurrent.innings.find(
      (m) => m.inning === inningNum
    );
    const deltaCols =
      patch.columnCount !== undefined && prevTarget
        ? Math.max(1, patch.columnCount) - Math.max(1, prevTarget.columnCount)
        : 0;

    const nextInnings = plannedCurrent.innings.map((m) =>
      m.inning === inningNum ? { ...m, ...patch } : m
    );
    const totalRuns = nextInnings.reduce((s, m) => s + m.runs, 0);
    const baseUpdated: ScorebookSheetStructure = {
      ...plannedCurrent,
      innings: nextInnings,
      totalRuns,
    };

    if (deltaCols !== 0) {
      onChangeStructure(isTop, extrapolateHorizontalCols(baseUpdated, deltaCols));
    } else {
      onChangeStructure(isTop, baseUpdated);
    }
  };

  const handleAddInning = () => {
    const nextNum =
      plannedCurrent.innings.length > 0
        ? plannedCurrent.innings[plannedCurrent.innings.length - 1].inning + 1
        : 1;
    const nextInnings = [
      ...plannedCurrent.innings,
      { inning: nextNum, columnCount: 1, runs: 0, hits: 0 },
    ];
    const normalizedAdded = normalizeStructureInningBatterPlan(
      { ...plannedCurrent, innings: nextInnings },
      { fillDefaultWhenMissing: true }
    );
    onChangeStructure(isTop, extrapolateHorizontalCols(normalizedAdded, 1));
  };

  const handleRemoveLastInning = () => {
    if (plannedCurrent.innings.length <= 1) return;
    const removedCols = Math.max(
      1,
      plannedCurrent.innings[plannedCurrent.innings.length - 1].columnCount || 1
    );
    const nextInnings = plannedCurrent.innings.slice(0, -1);
    const totalRuns = nextInnings.reduce((s, m) => s + m.runs, 0);
    onChangeStructure(
      isTop,
      extrapolateHorizontalCols(
        {
          ...plannedCurrent,
          innings: nextInnings,
          totalRuns,
        },
        -removedCols
      )
    );
  };

  const updateBatter = (
    order: number,
    patch: Partial<ScorebookBatterSlot>
  ) => {
    const nextBatters = current.batters.map((b) =>
      b.battingOrder === order ? { ...b, ...patch } : b
    );
    onChangeStructure(isTop, { ...current, batters: nextBatters });
  };

  const handleSelectRosterForBatter = (order: number, playerId: string) => {
    if (!playerId) {
      updateBatter(order, { playerId: null });
      return;
    }
    const found = roster.find((p) => p.id === playerId);
    if (found) {
      updateBatter(order, {
        playerId: found.id,
        name: found.name,
        uniformNumber: found.uniformNumber,
      });
    }
  };

  const handleAddBatterSlot = () => {
    const leftVx = (gridCorners.bl[0] - gridCorners.tl[0]) / batterCount;
    const leftVy = (gridCorners.bl[1] - gridCorners.tl[1]) / batterCount;
    const rightVx = (gridCorners.br[0] - gridCorners.tr[0]) / batterCount;
    const rightVy = (gridCorners.br[1] - gridCorners.tr[1]) / batterCount;
    const nextOrder = current.batters.length + 1;
    const nextBatters: ScorebookBatterSlot[] = [
      ...current.batters,
      {
        battingOrder: nextOrder,
        name: "",
        uniformNumber: "",
        position: "",
        playerId: null,
        substitutions: [],
      },
    ];
    onChangeStructure(
      isTop,
      syncStructureBoxesFromCorners(
        { ...current, batters: nextBatters },
        {
          tl: gridCorners.tl,
          tr: gridCorners.tr,
          bl: [gridCorners.bl[0] + leftVx, gridCorners.bl[1] + leftVy],
          br: [gridCorners.br[0] + rightVx, gridCorners.br[1] + rightVy],
        }
      )
    );
  };

  const handleAddSubstitution = (order: number) => {
    const sub: ScorebookSubstitution = {
      id: crypto.randomUUID(),
      inningEntered: 4,
      subType: "PH",
      name: "",
      uniformNumber: "",
      position: "",
      playerId: null,
    };
    const slot = current.batters.find((b) => b.battingOrder === order);
    if (!slot) return;
    updateBatter(order, { substitutions: [...slot.substitutions, sub] });
  };

  const updateSubstitution = (
    order: number,
    subId: string,
    patch: Partial<ScorebookSubstitution>
  ) => {
    const slot = current.batters.find((b) => b.battingOrder === order);
    if (!slot) return;
    const nextSubs = slot.substitutions.map((s) =>
      s.id === subId ? { ...s, ...patch } : s
    );
    updateBatter(order, { substitutions: nextSubs });
  };

  const removeSubstitution = (order: number, subId: string) => {
    const slot = current.batters.find((b) => b.battingOrder === order);
    if (!slot) return;
    updateBatter(order, {
      substitutions: slot.substitutions.filter((s) => s.id !== subId),
    });
  };

  const updatePitcher = (
    id: string,
    patch: Partial<ScorebookPitcherStint>
  ) => {
    const nextPitchers = current.pitchers.map((p) =>
      p.id === id ? { ...p, ...patch } : p
    );
    onChangeStructure(isTop, { ...current, pitchers: nextPitchers });
  };

  const addPitcher = () => {
    const maxInn =
      current.innings[current.innings.length - 1]?.inning || 7;
    const prevList = [...current.pitchers];
    const prevLast = prevList[prevList.length - 1];

    let nextFrom = 1;
    if (prevLast) {
      if (prevLast.toInning >= maxInn && prevLast.fromInning < maxInn) {
        // 前の投手が最終回までになっていた場合は自動で前半・後半に分割し、重複ミスを防止
        const splitInn = Math.max(
          prevLast.fromInning + 1,
          Math.floor((prevLast.fromInning + maxInn) / 2) + 1
        );
        prevList[prevList.length - 1] = {
          ...prevLast,
          toInning: splitInn - 1,
        };
        nextFrom = splitInn;
      } else {
        nextFrom = Math.min(maxInn, prevLast.toInning + 1);
      }
    }

    onChangeStructure(isTop, {
      ...current,
      pitchers: [
        ...prevList,
        {
          id: crypto.randomUUID(),
          order: prevList.length + 1,
          name: "",
          uniformNumber: "",
          playerId: null,
          fromInning: nextFrom,
          toInning: maxInn,
        },
      ],
    });
  };

  const removePitcher = (id: string) => {
    if (current.pitchers.length <= 1) return;
    const removedIdx = current.pitchers.findIndex((p) => p.id === id);
    const removed = removedIdx >= 0 ? current.pitchers[removedIdx] : null;
    const remaining = current.pitchers.filter((p) => p.id !== id);
    if (
      removed &&
      remaining.length > 0 &&
      removedIdx === current.pitchers.length - 1
    ) {
      const lastIdx = remaining.length - 1;
      remaining[lastIdx] = {
        ...remaining[lastIdx],
        toInning: Math.max(remaining[lastIdx].toInning, removed.toInning),
      };
    }
    onChangeStructure(isTop, {
      ...current,
      pitchers: remaining.map((p, idx) => ({ ...p, order: idx + 1 })),
    });
  };

  return (
    <div className="space-y-4">
      {/* ガイドバナー */}
      <section className="rounded-2xl border border-border bg-card shadow-xs p-4 space-y-2.5 overflow-hidden">
        <div className="-mx-4 -mt-4 px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-6 h-6 rounded-lg bg-primary/20 text-blue-300 border border-primary/40 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-3.5 h-3.5" />
            </span>
            <h2 className="text-xs font-black text-white truncate">
              骨格確認（打順・登板投手・各回得点の確認）
            </h2>
          </div>

          {onRescanSide && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onRescanSide(isTop)}
              className="px-2.5 py-1 rounded-xl bg-primary/20 hover:bg-primary/30 border border-primary/40 text-blue-200 hover:text-white text-[10px] font-black flex items-center gap-1 shrink-0 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              {isRescanningSide ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>再スキャン中...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-3 h-3" />
                  <span>この面を再スキャン</span>
                </>
              )}
            </button>
          )}
        </div>
        <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
          {activeSheetDataUrl
            ? "ここで確定した「各回の得点」「打者一巡(2列)の有無」「打順・途中交代・投手」を正解アンカーとして、次のステップで全投球・全打席を精密解析します。"
            : "ここで確定した「打順・途中交代・登板投手・各回得点」をもとに、次のステップ（STEP 3）で打席・1球データを入力・検算します。"}
        </p>
        {structureTotalMs !== null && structureTotalMs > 0 && (
          <div className="pt-0.5 flex items-center gap-1.5 flex-wrap text-[10px] font-black tabular-nums">
            <span className="px-2 py-0.5 rounded-lg bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25 inline-flex items-center gap-1">
              <Clock className="w-3 h-3 shrink-0" />
              <span>
                骨格スキャン完了: 合計 {formatTotalElapsedSeconds(structureTotalMs)}
              </span>
            </span>
            {structureTimingEntries.map((entry) => (
              <span
                key={entry.key}
                className="px-2 py-0.5 rounded-lg bg-muted border border-border text-foreground"
              >
                {entry.label}: {formatElapsedSeconds(entry.durationMs)}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* 先攻 / 後攻 シート切替タブ */}
      {importScope === "both" && (
        <div className="grid grid-cols-2 gap-1 bg-muted p-1 rounded-2xl border border-border">
          <button
            type="button"
            onClick={() => setActiveSide("top")}
            className={`py-2.5 px-3 rounded-xl text-xs transition-all cursor-pointer ${
              activeSide === "top"
                ? "bg-card text-foreground shadow-xs border border-border font-black"
                : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
            }`}
          >
            先攻（表）: {topStructure?.isMyTeamBatting ? "自チーム" : opponentName}
          </button>
          <button
            type="button"
            onClick={() => setActiveSide("bottom")}
            className={`py-2.5 px-3 rounded-xl text-xs transition-all cursor-pointer ${
              activeSide === "bottom"
                ? "bg-card text-foreground shadow-xs border border-border font-black"
                : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
            }`}
          >
            後攻（裏）: {bottomStructure?.isMyTeamBatting ? "自チーム" : opponentName}
          </button>
        </div>
      )}

      {/* 手書き原本シート照合＆マス枠キャリブレーションビューア */}
      {activeSheetDataUrl && (
        <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="px-3.5 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-5 h-5 rounded-md bg-primary/20 text-blue-300 border border-primary/40 flex items-center justify-center shrink-0">
                <Grid3X3 className="w-3 h-3" />
              </span>
              <span className="text-[11px] font-black text-white truncate">
                原本シート＆マス枠（{isTop ? "先攻・表" : "後攻・裏"}）
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setPreviewMode("grid")}
                className={`px-2 py-1 rounded-lg text-[10px] cursor-pointer transition-colors ${
                  previewMode === "grid"
                    ? "bg-primary text-primary-foreground border border-primary font-black shadow-2xs"
                    : "bg-slate-800 text-slate-300 border border-slate-700 hover:text-white hover:bg-slate-700 font-bold"
                }`}
              >
                マス枠確認
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode("lineup")}
                className={`px-2 py-1 rounded-lg text-[10px] cursor-pointer transition-colors ${
                  previewMode === "lineup"
                    ? "bg-primary text-primary-foreground border border-primary font-black shadow-2xs"
                    : "bg-slate-800 text-slate-300 border border-slate-700 hover:text-white hover:bg-slate-700 font-bold"
                }`}
              >
                打順欄ズーム
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode("full")}
                className={`px-2 py-1 rounded-lg text-[10px] cursor-pointer transition-colors ${
                  previewMode === "full"
                    ? "bg-primary text-primary-foreground border border-primary font-black shadow-2xs"
                    : "bg-slate-800 text-slate-300 border border-slate-700 hover:text-white hover:bg-slate-700 font-bold"
                }`}
              >
                原本のみ
              </button>
              <button
                type="button"
                onClick={() =>
                  setPreviewMode((prev) =>
                    prev === "hidden" ? "grid" : "hidden"
                  )
                }
                className="px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-[10px] font-bold text-slate-300 hover:text-white flex items-center gap-0.5 cursor-pointer"
              >
                {previewMode === "hidden" ? (
                  <>
                    <Eye className="w-3 h-3" />
                    <span>表示</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3 h-3" />
                    <span>隠す</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {previewMode === "grid" && (
            <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[10px] font-bold text-slate-300">
                {showBatterRangeOverlay
                  ? "番号バッジ＝打席あり ／ 暗転マス＝白紙空欄（下の「各回の打順範囲」と連動）"
                  : "印刷罫線の枠線のみ表示中"}
              </span>
              <button
                type="button"
                onClick={() => setShowBatterRangeOverlay((prev) => !prev)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-black border cursor-pointer transition-colors ${
                  showBatterRangeOverlay
                    ? "bg-emerald-600 text-white border-emerald-500"
                    : "bg-slate-800 text-slate-300 border-slate-700 hover:text-white"
                }`}
              >
                {showBatterRangeOverlay
                  ? "打席範囲ハイライト ON"
                  : "打席範囲ハイライト OFF"}
              </button>
            </div>
          )}

          {previewMode !== "hidden" && (
            <div
              className={`bg-slate-950 overflow-auto ${
                previewMode === "grid" && showGridTuner
                  ? "max-h-none"
                  : "max-h-72"
              }`}
            >
              {previewMode === "lineup" ? (
                <div className="flex items-center gap-1">
                  <ZoomIn className="sr-only" />
                  <img
                    src={activeSheetDataUrl}
                    alt="打順欄ズームプレビュー"
                    className="w-[210%] max-w-none h-auto block"
                  />
                </div>
              ) : previewMode === "grid" ? (
                <div ref={gridContainerRef} className="relative w-full select-none">
                  <img
                    src={activeSheetDataUrl}
                    alt="マス枠オーバーレイ確認プレビュー"
                    className="w-full h-auto block select-none pointer-events-none"
                  />
                  {/* 早稲田式の赤ペンと絶対干渉しないシアン(縦列)＋アンバー(複数列境界)＋エメラルド(横行)の歪み追従SVG枠 */}
                  <svg
                    viewBox="0 0 1000 1000"
                    preserveAspectRatio="none"
                    className="absolute inset-0 w-full h-full pointer-events-none"
                  >
                    {/* 各イニング列＆サブ列（2列・3列以上）の歪み追従ポリゴン ＋ 打席範囲ハイライト */}
                    {(() => {
                      const circledNums = ["①", "②", "③", "④", "⑤", "⑥"];
                      let cumCols = 0;
                      return plannedCurrent.innings.map((inn) => {
                        const subCols = Math.max(1, inn.columnCount || 1);
                        const s0 = cumCols / totalPhysCols;
                        const startCum = cumCols;
                        cumCols += subCols;
                        const s1 = cumCols / totalPhysCols;

                        const qTl = bilinearGridPoint(gridCorners, s0, 0);
                        const qTr = bilinearGridPoint(gridCorners, s1, 0);
                        const qBr = bilinearGridPoint(gridCorners, s1, 1);
                        const qBl = bilinearGridPoint(gridCorners, s0, 1);
                        const polyPts = `${qTl[0]},${qTl[1]} ${qTr[0]},${qTr[1]} ${qBr[0]},${qBr[1]} ${qBl[0]},${qBl[1]}`;

                        const innPlannedSlots = showBatterRangeOverlay
                          ? computeInningPlannedSlots(inn, effectiveLineupLen)
                          : null;

                        return (
                          <g key={`col-${inn.inning}`}>
                            <polygon
                              points={polyPts}
                              fill={
                                subCols >= 2
                                  ? "rgba(245, 158, 11, 0.08)"
                                  : "rgba(56, 189, 248, 0.04)"
                              }
                              stroke={subCols >= 2 ? "#f59e0b" : "#38bdf8"}
                              strokeWidth="2.6"
                            />

                            {/* 打席範囲外（空欄・DH打席なし行）の暗転マスク ＆ 打席ありマスの通番バッジ・終了下線 */}
                            {innPlannedSlots !== null &&
                              Array.from({ length: subCols }, (_, scIdx) => {
                                const subColNum = scIdx + 1;
                                const cs0 =
                                  (startCum + scIdx) / totalPhysCols;
                                const cs1 =
                                  (startCum + scIdx + 1) / totalPhysCols;
                                return plannedCurrent.batters.map(
                                  (bSlot, bIdx) => {
                                    const rt0 = bIdx / batterCount;
                                    const rt1 = (bIdx + 1) / batterCount;
                                    const cTl = bilinearGridPoint(
                                      gridCorners,
                                      cs0,
                                      rt0
                                    );
                                    const cTr = bilinearGridPoint(
                                      gridCorners,
                                      cs1,
                                      rt0
                                    );
                                    const cBr = bilinearGridPoint(
                                      gridCorners,
                                      cs1,
                                      rt1
                                    );
                                    const cBl = bilinearGridPoint(
                                      gridCorners,
                                      cs0,
                                      rt1
                                    );
                                    const cellPts = `${cTl[0]},${cTl[1]} ${cTr[0]},${cTr[1]} ${cBr[0]},${cBr[1]} ${cBl[0]},${cBl[1]}`;
                                    const matchedSlots = innPlannedSlots.filter(
                                      (sl) =>
                                        sl.subCol === subColNum &&
                                        sl.battingOrder === bSlot.battingOrder
                                    );
                                    if (matchedSlots.length === 0) {
                                      return (
                                        <polygon
                                          key={`mask-${inn.inning}-${subColNum}-${bSlot.battingOrder}`}
                                          points={cellPts}
                                          fill="rgba(15, 23, 42, 0.48)"
                                        />
                                      );
                                    }
                                    const lastMatched =
                                      matchedSlots[matchedSlots.length - 1];
                                    const isFinalBatterInInning =
                                      lastMatched.seqNumber ===
                                      innPlannedSlots.length;
                                    const badgePt = bilinearGridPoint(
                                      gridCorners,
                                      cs1 - 0.16 / totalPhysCols,
                                      rt0 + 0.22 / batterCount
                                    );
                                    return (
                                      <g
                                        key={`act-${inn.inning}-${subColNum}-${bSlot.battingOrder}`}
                                      >
                                        {isFinalBatterInInning && (
                                          <line
                                            x1={cBl[0]}
                                            y1={cBl[1]}
                                            x2={cBr[0]}
                                            y2={cBr[1]}
                                            stroke="#10b981"
                                            strokeWidth="4.4"
                                          />
                                        )}
                                        <rect
                                          x={badgePt[0] - 11}
                                          y={badgePt[1] - 8}
                                          width={22}
                                          height={16}
                                          rx={4}
                                          fill={
                                            isFinalBatterInInning
                                              ? "#059669"
                                              : "#0284c7"
                                          }
                                        />
                                        <text
                                          x={badgePt[0]}
                                          y={badgePt[1] + 4}
                                          textAnchor="middle"
                                          fill="#ffffff"
                                          fontSize="11"
                                          fontWeight="900"
                                        >
                                          {`#${lastMatched.seqNumber}`}
                                        </text>
                                      </g>
                                    );
                                  }
                                );
                              })}

                            {/* 2列・3列以上の内部サブ列破線 */}
                            {subCols >= 2 &&
                              Array.from({ length: subCols - 1 }, (_, sIdx) => {
                                const subS =
                                  (startCum + sIdx + 1) / totalPhysCols;
                                const pTop = bilinearGridPoint(
                                  gridCorners,
                                  subS,
                                  0
                                );
                                const pBot = bilinearGridPoint(
                                  gridCorners,
                                  subS,
                                  1
                                );
                                return (
                                  <line
                                    key={`sub-${inn.inning}-${sIdx}`}
                                    x1={pTop[0]}
                                    y1={pTop[1]}
                                    x2={pBot[0]}
                                    y2={pBot[1]}
                                    stroke="#fbbf24"
                                    strokeWidth="2.2"
                                    strokeDasharray="8 5"
                                  />
                                );
                              })}

                            {/* 列見出しバッジ（2列以上の回は 2回①, 2回②, 2回③ と各列ごとに明示！） */}
                            {Array.from({ length: subCols }, (_, scIdx) => {
                              const midS =
                                (startCum + scIdx + 0.5) / totalPhysCols;
                              const topMid = bilinearGridPoint(
                                gridCorners,
                                midS,
                                0
                              );
                              const badgeLabel =
                                subCols >= 2
                                  ? `${inn.inning}回${
                                      circledNums[scIdx] || scIdx + 1
                                    }`
                                  : `${inn.inning}回`;
                              const badgeW = subCols >= 2 ? 44 : 34;
                              const badgeY = Math.max(2, topMid[1] - 24);
                              return (
                                <g key={`hdr-${inn.inning}-${scIdx}`}>
                                  <rect
                                    x={topMid[0] - badgeW / 2}
                                    y={badgeY}
                                    width={badgeW}
                                    height={20}
                                    rx={5}
                                    fill={
                                      subCols >= 2 ? "#d97706" : "#0284c7"
                                    }
                                  />
                                  <text
                                    x={topMid[0]}
                                    y={badgeY + 14}
                                    textAnchor="middle"
                                    fill="#ffffff"
                                    fontSize="13"
                                    fontWeight="900"
                                  >
                                    {badgeLabel}
                                  </text>
                                </g>
                              );
                            })}
                          </g>
                        );
                      });
                    })()}

                    {/* 選手欄と1回の境界線（傾きに完全追従する太線ハイライト） */}
                    <line
                      x1={gridCorners.tl[0]}
                      y1={gridCorners.tl[1]}
                      x2={gridCorners.bl[0]}
                      y2={gridCorners.bl[1]}
                      stroke="#22d3ee"
                      strokeWidth="4.2"
                    />

                    {/* 各打順行のエメラルド横罫線（傾き・台形歪みに完全追従） */}
                    {current.batters.map((slot, bIdx) => {
                      const t0 = bIdx / batterCount;
                      const t1 = (bIdx + 1) / batterCount;
                      const tMid = (bIdx + 0.5) / batterCount;
                      const pL0 = bilinearGridPoint(gridCorners, 0, t0);
                      const pR0 = bilinearGridPoint(gridCorners, 1, t0);
                      const pL1 = bilinearGridPoint(gridCorners, 0, t1);
                      const pR1 = bilinearGridPoint(gridCorners, 1, t1);
                      const pLMid = bilinearGridPoint(gridCorners, 0, tMid);

                      return (
                        <g key={`row-${slot.battingOrder}`}>
                          {bIdx === 0 && (
                            <line
                              x1={Math.max(8, pL0[0] - 26)}
                              y1={pL0[1]}
                              x2={pR0[0]}
                              y2={pR0[1]}
                              stroke="#34d399"
                              strokeWidth="2.8"
                            />
                          )}
                          <line
                            x1={Math.max(8, pL1[0] - 26)}
                            y1={pL1[1]}
                            x2={pR1[0]}
                            y2={pR1[1]}
                            stroke="#34d399"
                            strokeWidth="2.2"
                          />
                          <rect
                            x={Math.max(4, pLMid[0] - 26)}
                            y={pLMid[1] - 10}
                            width={22}
                            height={20}
                            rx={4}
                            fill="#059669"
                          />
                          <text
                            x={Math.max(15, pLMid[0] - 15)}
                            y={pLMid[1] + 5}
                            textAnchor="middle"
                            fill="#ffffff"
                            fontSize="13"
                            fontWeight="900"
                          >
                            {slot.battingOrder}
                          </text>
                        </g>
                      );
                    })}
                    {showGridTuner &&
                      (["tl", "tr", "br", "bl"] as const).map((key) => {
                        const pt = gridCorners[key];
                        const isSelected = selectedCorner === key;
                        const color = isSelected ? "#f59e0b" : "#38bdf8";
                        return (
                          <g key={`grid-cross-${key}`}>
                            <line
                              x1={pt[0] - 16}
                              y1={pt[1]}
                              x2={pt[0] + 16}
                              y2={pt[1]}
                              stroke={color}
                              strokeWidth={isSelected ? "4" : "2.8"}
                            />
                            <line
                              x1={pt[0]}
                              y1={pt[1] - 16}
                              x2={pt[0]}
                              y2={pt[1] + 16}
                              stroke={color}
                              strokeWidth={isSelected ? "4" : "2.8"}
                            />
                          </g>
                        );
                      })}
                  </svg>

                  {/* 枠ズレ微調整モード中は画像上の4隅（角が透けて見える中抜きリング）で選択＆ドラッグ調整 */}
                  {showGridTuner &&
                    (
                      [
                        { key: "tl", label: "左上", isTopRow: true },
                        { key: "tr", label: "右上", isTopRow: true },
                        { key: "br", label: "右下", isTopRow: false },
                        { key: "bl", label: "左下", isTopRow: false },
                      ] as const
                    ).map(({ key, label, isTopRow }) => {
                      const pt = gridCorners[key];
                      const active = draggingCorner === key;
                      const isSelected = selectedCorner === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.currentTarget.setPointerCapture(e.pointerId);
                            setSelectedCorner(key);
                            setDraggingCorner(key);
                          }}
                          onPointerMove={(e) => {
                            if (draggingCorner !== key) return;
                            e.preventDefault();
                            handleUpdateCornerPoint(key, e.clientX, e.clientY);
                          }}
                          onPointerUp={(e) => {
                            if (draggingCorner === key) {
                              e.currentTarget.releasePointerCapture(e.pointerId);
                              setDraggingCorner(null);
                            }
                          }}
                          onPointerCancel={() => setDraggingCorner(null)}
                          style={{
                            left: `${pt[0] / 10}%`,
                            top: `${pt[1] / 10}%`,
                          }}
                          className={`absolute -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full border-2 shadow-md touch-none cursor-grab active:cursor-grabbing transition-transform ${
                            active
                              ? "border-primary bg-primary/25 scale-125 z-20"
                              : isSelected
                              ? "border-primary bg-primary/15 ring-2 ring-white/80 z-20"
                              : "border-white/80 bg-black/35 z-10"
                          }`}
                          aria-label={`グリッド${label}角を選択・ドラッグ調整`}
                        >
                          <span
                            className={`absolute left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[8px] font-black whitespace-nowrap pointer-events-none shadow-2xs ${
                              isTopRow ? "-bottom-4" : "-top-4"
                            } ${
                              isSelected
                                ? "bg-primary text-primary-foreground"
                                : "bg-black/80 text-white"
                            }`}
                          >
                            {label}
                          </span>
                        </button>
                      );
                    })}
                </div>
              ) : (
                <img
                  src={activeSheetDataUrl}
                  alt="スコアブック全体プレビュー"
                  className="w-full h-auto object-contain block"
                />
              )}
            </div>
          )}

          {/* マス枠4隅・4辺キャリブレーションバー（傾き・歪みも4隅ドラッグで3秒補正！） */}
          {previewMode === "grid" && (
            <div className="px-3.5 py-2.5 bg-card border-t border-border space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold text-muted-foreground leading-snug">
                  青・橙枠が「1回〜最終回（複数列含む）」、緑枠が「1番〜{current.batters.length}番」に重なっていればOKです
                </p>
                <button
                  type="button"
                  onClick={() => setShowGridTuner((prev) => !prev)}
                  className={`px-2.5 py-1 rounded-xl text-[10px] font-black flex items-center gap-1 shrink-0 cursor-pointer transition-colors ${
                    showGridTuner
                      ? "bg-primary/12 text-primary border border-primary/35 shadow-2xs"
                      : "bg-card text-muted-foreground hover:text-foreground border border-border hover:bg-muted"
                  }`}
                >
                  <SlidersHorizontal className="w-3 h-3 text-primary" />
                  <span>
                    {showGridTuner ? "調整を閉じる" : "歪み・枠ズレ調整"}
                  </span>
                </button>
              </div>

              {showGridTuner && (
                <div className="space-y-2.5 pt-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="grid grid-cols-2 gap-1 bg-muted p-1 rounded-2xl border border-border flex-1">
                      <button
                        type="button"
                        onClick={() => setGridTuneTab("corners")}
                        className={`py-1.5 px-2 rounded-xl text-[10px] transition-all cursor-pointer ${
                          gridTuneTab === "corners"
                            ? "bg-card text-foreground shadow-xs border border-border font-black"
                            : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                        }`}
                      >
                        4隅を1点ずつ微調整（目盛り）
                      </button>
                      <button
                        type="button"
                        onClick={() => setGridTuneTab("edges")}
                        className={`py-1.5 px-2 rounded-xl text-[10px] transition-all cursor-pointer ${
                          gridTuneTab === "edges"
                            ? "bg-card text-foreground shadow-xs border border-border font-black"
                            : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                        }`}
                      >
                        4辺をまとめて平行移動
                      </button>
                    </div>

                    {isGridSkewed && (
                      <button
                        type="button"
                        onClick={handleResetSkewToRectangle}
                        className="px-2.5 py-2 rounded-xl bg-card border border-border hover:bg-muted text-[10px] font-black text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
                      >
                        水平に戻す
                      </button>
                    )}
                  </div>

                  {gridTuneTab === "corners" ? (
                    <FourCornerFineTuner
                      previewUrl={activeSheetDataUrl}
                      corners={gridCorners}
                      selectedCorner={selectedCorner}
                      onSelectCorner={setSelectedCorner}
                      onChangeCorner={handleUpdateCornerCoordinate}
                      minGapX={90}
                      minGapY={125}
                      disabled={isBusy}
                      accentColor="indigo"
                      targetDescription={`1回〜最終回・1番〜${current.batters.length}番の表の四隅`}
                    />
                  ) : (
                    <>
                      <div className="px-2.5 py-2 rounded-xl bg-primary/10 border border-primary/25 flex items-center gap-1.5">
                        <Move className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="text-[10px] font-black text-foreground leading-snug">
                          上下左右の辺全体を平行にスライドします（傾き・歪みを1点ずつ直す場合は「4隅を1点ずつ微調整」タブをご利用ください）
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                    {/* 1回左端（選手欄との境界） */}
                    <div className="p-2 rounded-2xl bg-muted border border-border space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-primary">
                          1回左端（選手欄境）
                        </span>
                        <span className="text-[10px] font-black text-muted-foreground">
                          {gridLeftX}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleAdjustGridBound("left", gridLeftX - 6)
                          }
                          className="w-7 h-7 rounded-lg bg-card border border-border hover:bg-muted text-xs font-black text-foreground active:scale-90 cursor-pointer shrink-0"
                        >
                          -
                        </button>
                        <input
                          type="range"
                          min={140}
                          max={500}
                          value={gridLeftX}
                          onChange={(e) =>
                            handleAdjustGridBound("left", Number(e.target.value))
                          }
                          aria-label="1回左端の位置調整"
                          className="flex-1 min-w-0 accent-primary"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleAdjustGridBound("left", gridLeftX + 6)
                          }
                          className="w-7 h-7 rounded-lg bg-card border border-border hover:bg-muted text-xs font-black text-foreground active:scale-90 cursor-pointer shrink-0"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* 最終回右端 */}
                    <div className="p-2 rounded-2xl bg-muted border border-border space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-primary">
                          最終回右端
                        </span>
                        <span className="text-[10px] font-black text-muted-foreground">
                          {gridRightX}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleAdjustGridBound("right", gridRightX - 6)
                          }
                          className="w-7 h-7 rounded-lg bg-card border border-border hover:bg-muted text-xs font-black text-foreground active:scale-90 cursor-pointer shrink-0"
                        >
                          -
                        </button>
                        <input
                          type="range"
                          min={380}
                          max={980}
                          value={gridRightX}
                          onChange={(e) =>
                            handleAdjustGridBound(
                              "right",
                              Number(e.target.value)
                            )
                          }
                          aria-label="最終回右端の位置調整"
                          className="flex-1 min-w-0 accent-primary"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleAdjustGridBound("right", gridRightX + 6)
                          }
                          className="w-7 h-7 rounded-lg bg-card border border-border hover:bg-muted text-xs font-black text-foreground active:scale-90 cursor-pointer shrink-0"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* 1番上端 */}
                    <div className="p-2 rounded-2xl bg-muted border border-border space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-primary">
                          1番打者の上端
                        </span>
                        <span className="text-[10px] font-black text-muted-foreground">
                          {gridTopY}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleAdjustGridBound("top", gridTopY - 5)
                          }
                          className="w-7 h-7 rounded-lg bg-card border border-border hover:bg-muted text-xs font-black text-foreground active:scale-90 cursor-pointer shrink-0"
                        >
                          -
                        </button>
                        <input
                          type="range"
                          min={50}
                          max={420}
                          value={gridTopY}
                          onChange={(e) =>
                            handleAdjustGridBound("top", Number(e.target.value))
                          }
                          aria-label="1番打者上端の位置調整"
                          className="flex-1 min-w-0 accent-primary"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleAdjustGridBound("top", gridTopY + 5)
                          }
                          className="w-7 h-7 rounded-lg bg-card border border-border hover:bg-muted text-xs font-black text-foreground active:scale-90 cursor-pointer shrink-0"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* 最終打順の下端 */}
                    <div className="p-2 rounded-2xl bg-muted border border-border space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-primary">
                          {current.batters.length}番打者の下端
                        </span>
                        <span className="text-[10px] font-black text-muted-foreground">
                          {gridBottomY}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleAdjustGridBound("bottom", gridBottomY - 5)
                          }
                          className="w-7 h-7 rounded-lg bg-card border border-border hover:bg-muted text-xs font-black text-foreground active:scale-90 cursor-pointer shrink-0"
                        >
                          -
                        </button>
                        <input
                          type="range"
                          min={450}
                          max={980}
                          value={gridBottomY}
                          onChange={(e) =>
                            handleAdjustGridBound(
                              "bottom",
                              Number(e.target.value)
                            )
                          }
                          aria-label="最終打順下端の位置調整"
                          className="flex-1 min-w-0 accent-primary"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleAdjustGridBound("bottom", gridBottomY + 5)
                          }
                          className="w-7 h-7 rounded-lg bg-card border border-border hover:bg-muted text-xs font-black text-foreground active:scale-90 cursor-pointer shrink-0"
                        >
                          +
                        </button>
                        </div>
                      </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* A. イニング別の打順範囲・人数・得点 ＆ 複数列（1球検算前の枠ロック） */}
      <section className="rounded-2xl border border-border bg-card shadow-xs p-4 space-y-3 overflow-hidden">
        <div className="-mx-4 -mt-4 px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-black text-white">
              {isTop ? "先攻（表）" : "後攻（裏）"} 各回の打順範囲・人数・得点
            </h3>
            <p className="text-[10px] font-bold text-slate-300 leading-relaxed mt-0.5">
              1球検算の前に「何番〜何番（何人）」かを合わせると人数ズレがゼロになります（終了打者を直すと次回先頭も自動連動）
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0 flex-wrap">
            {onDetectInningRanges && activeSheetDataUrl && (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => onDetectInningRanges(isTop)}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 border border-emerald-400/50 text-[10px] font-black text-white flex items-center gap-1 cursor-pointer active:scale-95 transition-all disabled:opacity-50"
              >
                {isDetectingInningRanges ? (
                  <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                ) : (
                  <Sparkles className="w-3 h-3 shrink-0" />
                )}
                <span>
                  {isDetectingInningRanges
                    ? "AI判定中..."
                    : "打順範囲をAI再判定"}
                </span>
              </button>
            )}
            <button
              type="button"
              disabled={isBusy}
              onClick={handleRemoveLastInning}
              className="px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-[10px] font-black text-slate-200 hover:text-white cursor-pointer disabled:opacity-50"
            >
              -回
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={handleAddInning}
              className="px-2 py-1 rounded-lg bg-primary/20 border border-primary/40 hover:bg-primary/30 text-blue-200 hover:text-white text-[10px] font-black cursor-pointer disabled:opacity-50"
            >
              +回
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {plannedCurrent.innings.map((inn, innIdx) => {
            const isFinalInning =
              innIdx === plannedCurrent.innings.length - 1;
            const cols = Math.max(1, inn.columnCount || 1);
            const leadOff = Math.max(
              1,
              Math.min(effectiveLineupLen, inn.leadOffOrder ?? 1)
            );
            const countVal = Math.max(0, inn.batterCount ?? 3);
            const endOrder = computeInningEndOrder(
              leadOff,
              countVal,
              effectiveLineupLen
            );
            const getBatterShortName = (bo: number): string => {
              const found = plannedCurrent.batters.find(
                (b) => b.battingOrder === bo
              );
              return (found?.name || "").trim();
            };
            const leadName = getBatterShortName(leadOff);
            const endName = endOrder ? getBatterShortName(endOrder) : "";

            const maybeNeedsMoreCols =
              (inn.runs >= 7 && cols < 2) || (inn.runs >= 16 && cols < 3);
            const colBadgeText =
              cols === 1
                ? "1列"
                : cols === 2
                  ? "2列(一巡)"
                  : cols === 3
                    ? "3列(二巡)"
                    : `${cols}列`;

            const maxSelectableCount = cols >= 2 ? 27 : 18;
            const minCountForStepper =
              isFinalInning && !isTop ? 0 : 1;

            const batterCountOptions: LiffSelectOption[] = [];
            if (isFinalInning && !isTop) {
              batterCountOptions.push({
                value: "0",
                label: "× 未消化（0人・後攻省略）",
                sublabel: "サヨナラ勝ちやリード終了で裏の攻撃が無かった場合",
              });
            }
            for (let c = 1; c <= maxSelectableCount; c++) {
              const eBo =
                ((leadOff - 1 + c - 1) % effectiveLineupLen) + 1;
              const eName = getBatterShortName(eBo);
              const lapNum = Math.floor((c - 1) / effectiveLineupLen) + 1;
              const nameSuffix = eName ? ` ${eName}` : "";
              const groupLabel =
                lapNum === 1
                  ? `1巡目（1〜${effectiveLineupLen}人）`
                  : `${lapNum}巡目・打者一巡（自動で${lapNum}列以上へ設定）`;
              const subHint =
                c === 3 && inn.runs === 0
                  ? "三者凡退（3アウト）"
                  : c === effectiveLineupLen
                    ? `${effectiveLineupLen}人ちょうど一巡（次回も${leadOff}番先頭）`
                    : lapNum >= 2
                      ? `${lapNum}巡目の${eBo}番まで（計${c}打席）`
                      : `${leadOff}番から${eBo}番まで（計${c}打席）`;
              batterCountOptions.push({
                value: String(c),
                label:
                  lapNum >= 2
                    ? `${lapNum}巡目 ${eBo}番${nameSuffix} まで（${c}人）`
                    : `${eBo}番${nameSuffix} まで（${c}人）`,
                sublabel: subHint,
                group: groupLabel,
              });
            }

            const leadOffOptions: LiffSelectOption[] = [
              ...(innIdx > 0
                ? [
                    {
                      value: "auto",
                      label: "前の回から自動連動（標準）",
                      sublabel:
                        "前イニング最終打者の次の打順を先頭に自動設定します",
                    },
                  ]
                : []),
              ...Array.from(
                { length: effectiveLineupLen },
                (_, idx) => idx + 1
              ).map((bo): LiffSelectOption => {
                const nm = getBatterShortName(bo);
                return {
                  value: String(bo),
                  label: `先頭: ${bo}番${nm ? `（${nm}）` : ""}`,
                  sublabel:
                    innIdx > 0
                      ? "打席途中の盗塁死・牽制死チェンジ等でこの打者から始まる場合に固定"
                      : "1回の先頭打者",
                };
              }),
            ];

            return (
              <div
                key={inn.inning}
                className={`p-2.5 rounded-2xl border space-y-2 ${
                  countVal === 0
                    ? "bg-muted/60 border-border"
                    : cols >= 2 || maybeNeedsMoreCols
                      ? "bg-amber-500/10 border-amber-500/35"
                      : "bg-[#eef2f6] dark:bg-slate-900/60 border-border"
                }`}
              >
                {/* 上段: イニング見出し・現在範囲バッジ・得点・列数 */}
                <div className="flex items-center justify-between gap-1.5 flex-wrap">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="px-2 py-0.5 rounded-lg bg-[#0f172a] text-white text-[11px] font-black shrink-0">
                      {inn.inning}回{isTop ? "表" : "裏"}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-black border truncate ${
                        countVal === 0
                          ? "bg-card text-muted-foreground border-border"
                          : "bg-primary/12 text-primary border-primary/30"
                      }`}
                    >
                      {countVal === 0
                        ? "× 未消化 (0人)"
                        : `${leadOff}番${
                            leadName ? `(${leadName.slice(0, 3)})` : ""
                          }〜${endOrder}番${
                            endName ? `(${endName.slice(0, 3)})` : ""
                          }・${countVal}人`}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* 得点ステッパー */}
                    <div className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg bg-card border border-border">
                      <span className="text-[9px] font-bold text-muted-foreground mr-0.5">
                        点
                      </span>
                      <button
                        type="button"
                        disabled={isBusy || inn.runs <= 0}
                        onClick={() =>
                          updateInningMeta(inn.inning, {
                            runs: Math.max(0, inn.runs - 1),
                          })
                        }
                        className="w-5 h-5 rounded bg-muted hover:bg-border text-[11px] font-black text-foreground disabled:opacity-35 active:scale-90 cursor-pointer"
                        aria-label={`${inn.inning}回の得点を減らす`}
                      >
                        -
                      </button>
                      <span className="w-5 text-center text-xs font-black text-foreground tabular-nums">
                        {inn.runs}
                      </span>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          updateInningMeta(inn.inning, { runs: inn.runs + 1 })
                        }
                        className="w-5 h-5 rounded bg-muted hover:bg-border text-[11px] font-black text-foreground disabled:opacity-35 active:scale-90 cursor-pointer"
                        aria-label={`${inn.inning}回の得点を増やす`}
                      >
                        +
                      </button>
                    </div>

                    {/* 列数ステッパー */}
                    <div className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded-lg bg-card border border-border">
                      <button
                        type="button"
                        disabled={isBusy || cols <= 1}
                        onClick={() =>
                          updateInningMeta(inn.inning, {
                            columnCount: Math.max(1, cols - 1),
                          })
                        }
                        className="w-4 h-5 rounded bg-muted hover:bg-border text-[10px] font-black text-foreground disabled:opacity-35 cursor-pointer"
                        aria-label={`${inn.inning}回の列数を減らす`}
                      >
                        -
                      </button>
                      <span
                        className={`px-1 text-[9px] font-black flex items-center gap-0.5 ${
                          cols >= 2
                            ? "text-amber-700 dark:text-amber-300"
                            : "text-muted-foreground"
                        }`}
                      >
                        <Columns2 className="w-2.5 h-2.5 shrink-0" />
                        <span>{colBadgeText}</span>
                      </span>
                      <button
                        type="button"
                        disabled={isBusy || cols >= 6}
                        onClick={() =>
                          updateInningMeta(inn.inning, {
                            columnCount: Math.min(6, cols + 1),
                          })
                        }
                        className="w-4 h-5 rounded bg-muted hover:bg-border text-[10px] font-black text-foreground disabled:opacity-35 cursor-pointer"
                        aria-label={`${inn.inning}回の列数を増やす`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* 下段: 先頭打順 ＆ 終了打者（人数）LiffSelect ＋ ワンタップ -/+ */}
                <div className="flex items-center gap-1.5">
                  <LiffSelect
                    value={String(leadOff)}
                    disabled={isBusy}
                    onChange={(val) => {
                      if (val === "auto") {
                        handleChangeInningLeadOff(inn.inning, null);
                      } else {
                        handleChangeInningLeadOff(inn.inning, Number(val));
                      }
                    }}
                    title={`${inn.inning}回${isTop ? "表" : "裏"}の先頭打者`}
                    subtitle="通常は前の回から自動連動します。盗塁死チェンジ等で同じ打者が先頭に立つ場合のみ変更してください"
                    size="xs"
                    searchable={false}
                    className="shrink-0"
                    triggerTextClassName={
                      inn.isLeadOffPinned ? "text-amber-700 dark:text-amber-300" : undefined
                    }
                    ariaLabel={`${inn.inning}回の先頭打順`}
                    options={leadOffOptions}
                  />

                  <LiffSelect
                    value={String(countVal)}
                    disabled={isBusy}
                    onChange={(val) =>
                      handleChangeInningBatterCount(inn.inning, Number(val))
                    }
                    title={`${inn.inning}回${isTop ? "表" : "裏"}の最終打者（打席人数）を選択`}
                    subtitle={`先頭は ${leadOff}番${
                      leadName ? `（${leadName}）` : ""
                    } です。このイニング最後の打者を選ぶと次イニング以降の先頭打順も自動で連動します`}
                    size="xs"
                    searchable={false}
                    className="flex-1 min-w-0"
                    ariaLabel={`${inn.inning}回の終了打者・打席人数`}
                    options={batterCountOptions}
                  />

                  <div className="inline-flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={isBusy || countVal <= minCountForStepper}
                      onClick={() =>
                        handleChangeInningBatterCount(
                          inn.inning,
                          Math.max(minCountForStepper, countVal - 1)
                        )
                      }
                      className="w-7 h-7 rounded-xl bg-card border border-border hover:bg-muted text-xs font-black text-foreground disabled:opacity-35 active:scale-90 cursor-pointer"
                      aria-label={`${inn.inning}回の打席人数を1人減らす`}
                    >
                      -
                    </button>
                    <button
                      type="button"
                      disabled={isBusy || countVal >= 36}
                      onClick={() =>
                        handleChangeInningBatterCount(inn.inning, countVal + 1)
                      }
                      className="w-7 h-7 rounded-xl bg-card border border-border hover:bg-muted text-xs font-black text-foreground disabled:opacity-35 active:scale-90 cursor-pointer"
                      aria-label={`${inn.inning}回の打席人数を1人増やす`}
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* 2列以上のときの折り返し記法ワンタップ切替 */}
                {cols >= 2 && countVal > 0 && (
                  <div className="flex items-center justify-between gap-2 pt-0.5 flex-wrap">
                    <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300">
                      2列目への折り返し位置:
                    </span>
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          updateInningMeta(inn.inning, { wrapStyle: "cycle" })
                        }
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-black border cursor-pointer ${
                          inn.wrapStyle !== "bottom_wrap"
                            ? "bg-amber-600 text-white border-amber-600"
                            : "bg-card text-muted-foreground border-border hover:text-foreground"
                        }`}
                      >
                        一巡{effectiveLineupLen}枠充填
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          updateInningMeta(inn.inning, {
                            wrapStyle: "bottom_wrap",
                          })
                        }
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-black border cursor-pointer ${
                          inn.wrapStyle === "bottom_wrap"
                            ? "bg-amber-600 text-white border-amber-600"
                            : "bg-card text-muted-foreground border-border hover:text-foreground"
                        }`}
                      >
                        {effectiveLineupLen}番下端で2列目へ
                      </button>
                    </div>
                  </div>
                )}

                {maybeNeedsMoreCols && (
                  <span className="block text-[9px] font-black text-amber-700 dark:text-amber-300 leading-tight">
                    ⚠️ 大量得点回のため、2列以上使っていれば列数の「+」を確認してください
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* 合計得点 ＆ 確定総打席数サマリー */}
        <div className="px-3 py-2 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
            <span className="text-[11px] font-black text-foreground">
              1球検算ロック合計:{" "}
              <span className="text-primary">
                {plannedCurrent.innings.reduce(
                  (s, m) => s + Math.max(0, m.batterCount ?? 0),
                  0
                )}{" "}
                打席
              </span>
            </span>
          </div>
          <span className="text-xs font-black text-primary tabular-nums">
            合計得点: {plannedCurrent.innings.reduce((s, m) => s + m.runs, 0)} 点
          </span>
        </div>
      </section>

      {/* B. 打順（1〜9番＋途中交代）確認 */}
      <section className="rounded-2xl border border-border bg-card shadow-xs p-4 space-y-3 overflow-hidden">
        <div className="-mx-4 -mt-4 px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-6 h-6 rounded-lg bg-primary/20 text-blue-300 border border-primary/40 flex items-center justify-center shrink-0">
              <Users className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-white truncate">
                {current.isMyTeamBatting
                  ? "自チームの打順・途中交代"
                  : `相手（${opponentName}）の打順・途中交代`}
              </h3>
              <p className="text-[10px] font-bold text-slate-300">
                {current.isMyTeamBatting
                  ? "登録選手と紐付けることで個人成績に正確に集計されます"
                  : "手書き文字の読み間違いがあれば修正してください"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddBatterSlot}
            className="px-2.5 py-1 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 text-[10px] font-black text-slate-200 hover:text-white shrink-0 cursor-pointer"
          >
            +10番以降
          </button>
        </div>

        <div className="space-y-2.5">
          {current.batters.map((slot) => {
            const isSlotNonBatting = isNonBattingBatterSlot(
              slot,
              current.batters
            );
            return (
            <div
              key={slot.battingOrder}
              className="p-2.5 rounded-2xl bg-muted border border-border space-y-2"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={
                    isSlotNonBatting
                      ? "px-1.5 h-6 rounded-lg bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/35 text-[10px] font-black flex items-center justify-center shrink-0"
                      : "w-6 h-6 rounded-lg bg-primary/12 text-primary border border-primary/30 text-[11px] font-black flex items-center justify-center shrink-0"
                  }
                  title={
                    isSlotNonBatting
                      ? "打席に入らない枠（DH制の専任投手欄など）"
                      : `${slot.battingOrder}番打者`
                  }
                >
                  {isSlotNonBatting ? "投" : slot.battingOrder}
                </span>

                {current.isMyTeamBatting && roster.length > 0 ? (
                  <LiffSelect
                    value={slot.playerId || ""}
                    onChange={(val) =>
                      handleSelectRosterForBatter(slot.battingOrder, val)
                    }
                    title={`${slot.battingOrder}番打者を選択`}
                    subtitle="登録選手と紐付けることで個人成績に正確に集計されます"
                    searchable={true}
                    searchPlaceholder="背番号・選手名で検索..."
                    size="sm"
                    className="flex-1 min-w-0"
                    ariaLabel={`${slot.battingOrder}番打者を選択`}
                    options={[
                      {
                        value: "",
                        label: slot.name
                          ? `未登録: ${slot.name} (#${slot.uniformNumber || "-"})`
                          : "-- 選手を選択 --",
                      },
                      ...roster.map(
                        (p): LiffSelectOption => ({
                          value: p.id,
                          label: `#${p.uniformNumber} ${p.name}`,
                          sublabel: p.primaryPosition
                            ? `主守備: ${p.primaryPosition}`
                            : undefined,
                          keywords: `${p.uniformNumber} ${p.name} ${
                            p.nameKana || ""
                          }`,
                        })
                      ),
                    ]}
                  />
                ) : (
                  <>
                    <input
                      type="text"
                      value={slot.uniformNumber}
                      onChange={(e) =>
                        updateBatter(slot.battingOrder, {
                          uniformNumber: e.target.value,
                        })
                      }
                      placeholder="#"
                      className="w-11 h-9 px-1.5 rounded-xl bg-card border border-border text-center text-xs font-black text-foreground"
                    />
                    <input
                      type="text"
                      value={slot.name}
                      onChange={(e) =>
                        updateBatter(slot.battingOrder, { name: e.target.value })
                      }
                      placeholder="選手名"
                      className="flex-1 min-w-0 h-9 px-2.5 rounded-xl bg-card border border-border text-xs font-black text-foreground"
                    />
                  </>
                )}

                <LiffSelect
                  value={slot.position}
                  onChange={(val) =>
                    updateBatter(slot.battingOrder, { position: val })
                  }
                  title={`${slot.battingOrder}番の守備位置を選択`}
                  size="sm"
                  searchable={false}
                  className="w-20 shrink-0"
                  ariaLabel={`${slot.battingOrder}番の守備位置`}
                  options={POSITION_OPTIONS}
                />

                <button
                  type="button"
                  onClick={() => handleAddSubstitution(slot.battingOrder)}
                  className="h-9 px-2 rounded-xl bg-card hover:bg-muted border border-border text-[10px] font-black text-primary flex items-center gap-0.5 shrink-0 cursor-pointer"
                  title="途中交代を追加"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>交代</span>
                </button>
              </div>

              {slot.battingOrder >= 10 && (
                <div className="pl-7 flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[10px] font-bold text-muted-foreground">
                    {isSlotNonBatting
                      ? "DH制などの守備専任枠（打順は1〜9番で循環・この行は打席なし）"
                      : `${slot.battingOrder}番打者として打順循環に含める（全員打ち制）`}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      updateBatter(slot.battingOrder, {
                        nonBatting: !isSlotNonBatting,
                      })
                    }
                    className={
                      isSlotNonBatting
                        ? "px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/35 text-[10px] font-black cursor-pointer shrink-0"
                        : "px-2.5 py-1 rounded-lg bg-primary/12 text-primary border border-primary/30 text-[10px] font-black cursor-pointer shrink-0"
                    }
                  >
                    {isSlotNonBatting
                      ? "打席なし(DH投手) ➔ 打席ありへ切替"
                      : "打席あり(全員打ち) ➔ 打席なしへ切替"}
                  </button>
                </div>
              )}

              {/* 自チームで未登録（助っ人・手書き名）状態のときは直接テキスト修正も可能にする */}
              {current.isMyTeamBatting && roster.length > 0 && !slot.playerId && (
                <div className="pl-7 flex items-center gap-1.5">
                  <input
                    type="text"
                    value={slot.uniformNumber}
                    onChange={(e) =>
                      updateBatter(slot.battingOrder, {
                        uniformNumber: e.target.value,
                      })
                    }
                    placeholder="背番号"
                    className="w-14 h-8 px-1.5 rounded-lg bg-card border border-border text-center text-[11px] font-black text-foreground"
                  />
                  <input
                    type="text"
                    value={slot.name}
                    onChange={(e) =>
                      updateBatter(slot.battingOrder, { name: e.target.value })
                    }
                    placeholder="助っ人・未登録選手名を直接入力"
                    className="flex-1 min-w-0 h-8 px-2.5 rounded-lg bg-card border border-border text-[11px] font-black text-foreground"
                  />
                </div>
              )}

              {/* 途中交代（代打・代走・守備交代・守備位置変更） */}
              {slot.substitutions.length > 0 && (
                <div className="pl-5 space-y-2">
                  {slot.substitutions.map((sub, subIdx) => {
                    const prevSubs = slot.substitutions.slice(0, subIdx);
                    const lastNonTrSub = [...prevSubs]
                      .reverse()
                      .find((s) => s.subType !== "TR" && s.name.trim() !== "");
                    const priorPlayer = lastNonTrSub
                      ? {
                          playerId: lastNonTrSub.playerId,
                          name: lastNonTrSub.name,
                          uniformNumber: lastNonTrSub.uniformNumber,
                          position: lastNonTrSub.position || slot.position,
                        }
                      : {
                          playerId: slot.playerId,
                          name: slot.name,
                          uniformNumber: slot.uniformNumber,
                          position: slot.position,
                        };
                    const isSamePlayerPosShift =
                      sub.subType === "DEF" &&
                      Boolean(priorPlayer.name.trim()) &&
                      sub.name.trim() === priorPlayer.name.trim() &&
                      (sub.playerId || "") === (priorPlayer.playerId || "");
                    const effectiveSubTypeValue = isSamePlayerPosShift
                      ? "POS_SHIFT"
                      : sub.subType;

                    return (
                      <div
                        key={sub.id}
                        className="p-2.5 rounded-xl bg-primary/5 border border-primary/25 space-y-2"
                      >
                        {/* 1段目: イニング ・ 回頭/途中タイミング ・ 交代種別 ・ 守備位置 ・ 削除 */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <LiffSelect
                            value={String(sub.inningEntered)}
                            onChange={(val) =>
                              updateSubstitution(slot.battingOrder, sub.id, {
                                inningEntered: Number(val),
                              })
                            }
                            title="途中交代のイニングを選択"
                            size="xs"
                            searchable={false}
                            className="shrink-0"
                            ariaLabel="途中交代のイニング"
                            options={inningOptions.map((n) => ({
                              value: String(n),
                              label: `${n}回`,
                            }))}
                          />

                          <LiffSelect
                            value={
                              typeof sub.enteredFromBatterOrder === "number" &&
                              sub.enteredFromBatterOrder >= 1
                                ? String(sub.enteredFromBatterOrder)
                                : ""
                            }
                            onChange={(val) =>
                              updateSubstitution(slot.battingOrder, sub.id, {
                                enteredFromBatterOrder: val
                                  ? Number(val)
                                  : null,
                              })
                            }
                            title={`${sub.inningEntered}回の交代・守備変更タイミングを選択`}
                            subtitle="イニング途中の守備交代・守備位置変更の場合は開始打順を選択してください"
                            size="xs"
                            searchable={false}
                            className="shrink-0"
                            ariaLabel="イニング内の交代タイミング"
                            options={[
                              {
                                value: "",
                                label: "回頭から",
                                sublabel: `${sub.inningEntered}回の先頭打者から適用`,
                              },
                              ...Array.from(
                                {
                                  length: resolveEffectiveBattingCycleLength(current),
                                },
                                (_, i) => i + 1
                              ).map((orderNum): LiffSelectOption => {
                                const bSlot = current.batters.find(
                                  (b) => b.battingOrder === orderNum
                                );
                                const bName = bSlot?.name
                                  ? `（${bSlot.name}）`
                                  : "";
                                return {
                                  value: String(orderNum),
                                  label: `途中:${orderNum}番〜`,
                                  sublabel: `${sub.inningEntered}回途中・${orderNum}番打者${bName}の時から適用`,
                                };
                              }),
                            ]}
                          />

                          <LiffSelect
                            value={effectiveSubTypeValue}
                            onChange={(val) => {
                              if (val === "POS_SHIFT") {
                                updateSubstitution(slot.battingOrder, sub.id, {
                                  subType: "DEF",
                                  playerId: priorPlayer.playerId,
                                  name: priorPlayer.name,
                                  uniformNumber: priorPlayer.uniformNumber,
                                });
                              } else {
                                const nextType = val as
                                  | "PH"
                                  | "PR"
                                  | "TR"
                                  | "DEF";
                                const shouldClearCopiedPlayer =
                                  isSamePlayerPosShift && nextType === "DEF";
                                updateSubstitution(slot.battingOrder, sub.id, {
                                  subType: nextType,
                                  ...(shouldClearCopiedPlayer
                                    ? {
                                        playerId: null,
                                        name: "",
                                        uniformNumber: "",
                                      }
                                    : {}),
                                });
                              }
                            }}
                            title="途中交代・守備変更の種別を選択"
                            size="xs"
                            searchable={false}
                            className="shrink-0"
                            triggerTextClassName="text-primary"
                            ariaLabel="途中交代の種別"
                            options={[
                              {
                                value: "PH",
                                label: "代打",
                                sublabel: "打席から控え選手と交代して出場",
                              },
                              {
                                value: "PR",
                                label: "代走",
                                sublabel:
                                  "塁上から控え選手と交代し以降の打順も引継",
                              },
                              {
                                value: "TR",
                                label: "臨時代走",
                                sublabel: "このイニングの走塁のみ代走",
                              },
                              {
                                value: "DEF",
                                label: "守備交代",
                                sublabel: "控え選手と交代して守備から途中出場",
                              },
                              ...(priorPlayer.name.trim()
                                ? [
                                    {
                                      value: "POS_SHIFT",
                                      label: "守備変更(同選手)",
                                      sublabel: `出場中の ${priorPlayer.name} が別ポジションへ移動（例: 遊→投、投→一）`,
                                    },
                                  ]
                                : []),
                            ]}
                          />

                          <LiffSelect
                            value={sub.position}
                            onChange={(val) =>
                              updateSubstitution(slot.battingOrder, sub.id, {
                                position: val,
                              })
                            }
                            title="交代・変更後の守備位置を選択"
                            size="xs"
                            searchable={false}
                            className="w-[4.5rem] shrink-0 ml-auto"
                            ariaLabel="交代後の守備位置"
                            options={[
                              { value: "", label: "守備 -" },
                              ...POSITION_OPTIONS.filter((p) => p.value !== ""),
                            ]}
                          />

                          <button
                            type="button"
                            onClick={() =>
                              removeSubstitution(slot.battingOrder, sub.id)
                            }
                            className="p-1 text-destructive cursor-pointer shrink-0"
                            aria-label="途中交代を削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* 2段目: 選手選択（守備変更(同選手)の場合は同選手バッジを表示） */}
                        {isSamePlayerPosShift ? (
                          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-card border border-border">
                            <span className="text-[11px] font-black text-foreground truncate">
                              #{priorPlayer.uniformNumber || "-"}{" "}
                              {priorPlayer.name} のポジション移動
                              {priorPlayer.position && sub.position
                                ? `（${
                                    POSITION_OPTIONS.find(
                                      (p) => p.value === priorPlayer.position
                                    )?.label || priorPlayer.position
                                  } → ${
                                    POSITION_OPTIONS.find(
                                      (p) => p.value === sub.position
                                    )?.label || sub.position
                                  }）`
                                : ""}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                updateSubstitution(slot.battingOrder, sub.id, {
                                  playerId: null,
                                  name: "",
                                  uniformNumber: "",
                                })
                              }
                              className="text-[10px] font-black text-primary hover:underline shrink-0 cursor-pointer"
                            >
                              別選手と交代に切替
                            </button>
                          </div>
                        ) : current.isMyTeamBatting && roster.length > 0 ? (
                          <div className="space-y-1.5">
                            <LiffSelect
                              value={sub.playerId || ""}
                              onChange={(val) => {
                                const found = roster.find((p) => p.id === val);
                                if (found) {
                                  const autoPos =
                                    sub.position ||
                                    (sub.subType === "DEF" &&
                                    found.primaryPosition
                                      ? normalizePositionCode(
                                          found.primaryPosition
                                        )
                                      : "");
                                  updateSubstitution(
                                    slot.battingOrder,
                                    sub.id,
                                    {
                                      playerId: found.id,
                                      name: found.name,
                                      uniformNumber: found.uniformNumber,
                                      position: autoPos,
                                    }
                                  );
                                } else {
                                  updateSubstitution(
                                    slot.battingOrder,
                                    sub.id,
                                    {
                                      playerId: null,
                                    }
                                  );
                                }
                              }}
                              title={`${slot.battingOrder}番の交代選手を選択`}
                              searchable={true}
                              searchPlaceholder="背番号・選手名で検索..."
                              size="xs"
                              className="w-full"
                              ariaLabel="交代選手を選択"
                              options={[
                                {
                                  value: "",
                                  label: sub.name
                                    ? `未登録: ${sub.name}`
                                    : "-- 交代選手を選択 --",
                                },
                                ...roster.map(
                                  (p): LiffSelectOption => ({
                                    value: p.id,
                                    label: `#${p.uniformNumber} ${p.name}`,
                                    sublabel: p.primaryPosition
                                      ? `主守備: ${p.primaryPosition}`
                                      : undefined,
                                    keywords: `${p.uniformNumber} ${p.name} ${
                                      p.nameKana || ""
                                    }`,
                                  })
                                ),
                              ]}
                            />

                            {!sub.playerId && (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={sub.uniformNumber}
                                  onChange={(e) =>
                                    updateSubstitution(
                                      slot.battingOrder,
                                      sub.id,
                                      {
                                        uniformNumber: e.target.value,
                                      }
                                    )
                                  }
                                  placeholder="背番号"
                                  className="w-14 h-7 px-1.5 rounded-lg bg-card border border-border text-center text-[10px] font-black text-foreground"
                                />
                                <input
                                  type="text"
                                  value={sub.name}
                                  onChange={(e) =>
                                    updateSubstitution(
                                      slot.battingOrder,
                                      sub.id,
                                      {
                                        name: e.target.value,
                                      }
                                    )
                                  }
                                  placeholder="助っ人・未登録の交代選手名を入力"
                                  className="flex-1 min-w-0 h-7 px-2 rounded-lg bg-card border border-border text-[10px] font-black text-foreground"
                                />
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={sub.uniformNumber}
                              onChange={(e) =>
                                updateSubstitution(slot.battingOrder, sub.id, {
                                  uniformNumber: e.target.value,
                                })
                              }
                              placeholder="#"
                              className="w-12 h-8 px-1.5 rounded-lg bg-card border border-border text-center text-[11px] font-black text-foreground shrink-0"
                            />
                            <input
                              type="text"
                              value={sub.name}
                              onChange={(e) =>
                                updateSubstitution(slot.battingOrder, sub.id, {
                                  name: e.target.value,
                                })
                              }
                              placeholder="交代選手名を入力"
                              className="flex-1 min-w-0 h-8 px-2 rounded-lg bg-card border border-border text-[11px] font-black text-foreground"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            );
          })}
        </div>
      </section>

      {/* C. 登板投手（先発・継投）確認 */}
      <section className="rounded-2xl border border-border bg-card shadow-xs p-4 space-y-3 overflow-hidden">
        <div className="-mx-4 -mt-4 px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-black text-white">
              {!current.isMyTeamBatting
                ? "自チームの登板投手（継投）"
                : `相手（${opponentName}）の登板投手（継投）`}
            </h3>
            <p className="text-[10px] font-bold text-slate-300 leading-relaxed">
              このシートの打者に対して投げた投手と担当回（イニング途中の投手交代も「途中：○番打者から」で正確に指定できます）
            </p>
          </div>
          <button
            type="button"
            onClick={addPitcher}
            className="px-2.5 py-1.5 rounded-xl bg-primary/20 border border-primary/40 hover:bg-primary/30 text-blue-200 hover:text-white text-[10px] font-black flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>継投追加</span>
          </button>
        </div>

        <div className="space-y-2">
          {current.pitchers.map((pt, idx) => {
            const nextPt = current.pitchers[idx + 1];
            const hasMidInningExit =
              Boolean(nextPt) &&
              nextPt.fromInning === pt.toInning &&
              typeof nextPt.fromBatterOrder === "number" &&
              nextPt.fromBatterOrder >= 1;
            const hasMidInningEntry =
              idx >= 1 &&
              typeof pt.fromBatterOrder === "number" &&
              pt.fromBatterOrder >= 1;

            return (
              <div
                key={pt.id}
                className="p-2.5 rounded-2xl bg-muted border border-border space-y-2"
              >
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-1 rounded-lg bg-primary/12 text-primary border border-primary/30 text-[10px] font-black shrink-0">
                    {idx === 0 ? "先発" : `${idx + 1}番手`}
                  </span>

                  {!current.isMyTeamBatting && roster.length > 0 ? (
                    <LiffSelect
                      value={pt.playerId || ""}
                      onChange={(val) => {
                        const found = roster.find((p) => p.id === val);
                        if (found) {
                          updatePitcher(pt.id, {
                            playerId: found.id,
                            name: found.name,
                            uniformNumber: found.uniformNumber,
                          });
                        } else {
                          updatePitcher(pt.id, { playerId: null });
                        }
                      }}
                      title={`${
                        idx === 0 ? "先発" : `${idx + 1}番手`
                      }投手を選択`}
                      searchable={true}
                      searchPlaceholder="背番号・選手名で検索..."
                      size="sm"
                      className="flex-1 min-w-0"
                      ariaLabel="登板投手を選択"
                      options={[
                        {
                          value: "",
                          label: pt.name
                            ? `未登録: ${pt.name}`
                            : "-- 自チーム投手を選択 --",
                        },
                        ...roster.map(
                          (p): LiffSelectOption => ({
                            value: p.id,
                            label: `#${p.uniformNumber} ${p.name}`,
                            sublabel: p.primaryPosition
                              ? `主守備: ${p.primaryPosition}`
                              : undefined,
                            keywords: `${p.uniformNumber} ${p.name} ${
                              p.nameKana || ""
                            }`,
                          })
                        ),
                      ]}
                    />
                  ) : (
                    <>
                      <input
                        type="text"
                        value={pt.uniformNumber}
                        onChange={(e) =>
                          updatePitcher(pt.id, {
                            uniformNumber: e.target.value,
                          })
                        }
                        placeholder="#"
                        className="w-11 h-9 px-1.5 rounded-xl bg-card border border-border text-center text-xs font-black text-foreground shrink-0"
                      />
                      <input
                        type="text"
                        value={pt.name}
                        onChange={(e) =>
                          updatePitcher(pt.id, { name: e.target.value })
                        }
                        placeholder="相手投手名"
                        className="flex-1 min-w-0 h-9 px-2.5 rounded-xl bg-card border border-border text-xs font-black text-foreground"
                      />
                    </>
                  )}

                  {current.pitchers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePitcher(pt.id)}
                      className="h-9 w-9 rounded-xl bg-card border border-border flex items-center justify-center text-destructive hover:bg-destructive/10 shrink-0 cursor-pointer"
                      aria-label="投手を削除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {!current.isMyTeamBatting &&
                  roster.length > 0 &&
                  !pt.playerId && (
                    <div className="pl-12 flex items-center gap-1.5">
                      <input
                        type="text"
                        value={pt.uniformNumber}
                        onChange={(e) =>
                          updatePitcher(pt.id, {
                            uniformNumber: e.target.value,
                          })
                        }
                        placeholder="背番号"
                        className="w-14 h-8 px-1.5 rounded-lg bg-card border border-border text-center text-[11px] font-black text-foreground shrink-0"
                      />
                      <input
                        type="text"
                        value={pt.name}
                        onChange={(e) =>
                          updatePitcher(pt.id, { name: e.target.value })
                        }
                        placeholder="助っ人・未登録投手名を直接入力"
                        className="flex-1 min-w-0 h-8 px-2.5 rounded-lg bg-card border border-border text-[11px] font-black text-foreground"
                      />
                    </div>
                  )}

                <div className="flex items-center justify-between gap-2 pl-1 flex-wrap">
                  <span className="text-[11px] font-bold text-muted-foreground shrink-0">
                    担当イニング
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    <LiffSelect
                      ariaLabel="登板開始イニング"
                      title="登板開始イニングを選択"
                      value={String(pt.fromInning)}
                      size="xs"
                      searchable={false}
                      className="min-w-[4rem]"
                      onChange={(val) => {
                        const nextFrom = Number(val);
                        const isMidInning =
                          typeof pt.fromBatterOrder === "number" &&
                          pt.fromBatterOrder >= 1;
                        const nextPitchers = current.pitchers.map(
                          (item, pIdx) => {
                            if (item.id === pt.id) {
                              return {
                                ...item,
                                fromInning: nextFrom,
                                toInning: Math.max(item.toInning, nextFrom),
                              };
                            }
                            if (pIdx === idx - 1) {
                              if (isMidInning) {
                                return {
                                  ...item,
                                  toInning: Math.max(item.fromInning, nextFrom),
                                };
                              }
                              if (
                                item.toInning >= nextFrom &&
                                item.fromInning < nextFrom
                              ) {
                                return {
                                  ...item,
                                  toInning: nextFrom - 1,
                                };
                              }
                            }
                            return item;
                          }
                        );
                        onChangeStructure(isTop, {
                          ...current,
                          pitchers: nextPitchers,
                        });
                      }}
                      options={inningOptions.map((n) => ({
                        value: String(n),
                        label: `${n}回`,
                      }))}
                    />

                    {idx >= 1 && (
                      <LiffSelect
                        ariaLabel="イニング内の登板開始タイミング"
                        title={`${pt.fromInning}回の登板開始タイミングを選択`}
                        subtitle="イニング途中で投手交代した場合は、この投手が投げ始めた打順を選択してください"
                        value={
                          typeof pt.fromBatterOrder === "number" &&
                          pt.fromBatterOrder >= 1
                            ? String(pt.fromBatterOrder)
                            : ""
                        }
                        size="xs"
                        searchable={false}
                        className="shrink-0"
                        triggerTextClassName={
                          hasMidInningEntry ? "text-primary" : undefined
                        }
                        onChange={(val) => {
                          const nextOrder = val ? Number(val) : null;
                          const nextPitchers = current.pitchers.map(
                            (item, pIdx) => {
                              if (item.id === pt.id) {
                                return {
                                  ...item,
                                  fromBatterOrder: nextOrder,
                                };
                              }
                              if (pIdx === idx - 1) {
                                if (nextOrder && nextOrder >= 1) {
                                  return {
                                    ...item,
                                    toInning: Math.max(
                                      item.fromInning,
                                      pt.fromInning
                                    ),
                                  };
                                }
                                if (
                                  item.toInning === pt.fromInning &&
                                  item.fromInning < pt.fromInning
                                ) {
                                  return {
                                    ...item,
                                    toInning: pt.fromInning - 1,
                                  };
                                }
                              }
                              return item;
                            }
                          );
                          onChangeStructure(isTop, {
                            ...current,
                            pitchers: nextPitchers,
                          });
                        }}
                        options={[
                          {
                            value: "",
                            label: "回頭から",
                            sublabel: `${pt.fromInning}回の先頭打者から登板`,
                          },
                          ...Array.from(
                            { length: resolveEffectiveBattingCycleLength(current) },
                            (_, i) => i + 1
                          ).map((orderNum): LiffSelectOption => {
                            const bSlot = current.batters.find(
                              (b) => b.battingOrder === orderNum
                            );
                            const bName = bSlot?.name
                              ? `（${bSlot.name}）`
                              : "";
                            return {
                              value: String(orderNum),
                              label: `途中:${orderNum}番〜`,
                              sublabel: `${pt.fromInning}回途中・${orderNum}番打者${bName}の打席から登板`,
                            };
                          }),
                        ]}
                      />
                    )}

                    <span className="text-xs font-black text-muted-foreground">
                      〜
                    </span>
                    <LiffSelect
                      ariaLabel="登板終了イニング"
                      title="登板終了イニングを選択"
                      value={String(pt.toInning)}
                      size="xs"
                      searchable={false}
                      className="min-w-[4rem]"
                      onChange={(val) => {
                        const nextTo = Number(val);
                        updatePitcher(pt.id, {
                          fromInning: Math.min(pt.fromInning, nextTo),
                          toInning: nextTo,
                        });
                      }}
                      options={inningOptions.map((n) => ({
                        value: String(n),
                        label: `${n}回`,
                      }))}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pl-1 flex-wrap pt-0.5">
                  <span className="text-[11px] font-bold text-muted-foreground shrink-0">
                    勝敗・S・H裁定
                  </span>
                  <LiffSelect
                    ariaLabel="公式記録員の勝敗・セーブ裁定"
                    title={`${
                      pt.name || `${idx === 0 ? "先発" : `${idx + 1}番手`}投手`
                    } の勝敗・セーブ裁定`}
                    subtitle="通常は「自動判定」のままで公認野球規則 9.17〜9.19 どおり算出されます。記録員裁定がある場合のみ指定してください"
                    value={pt.manualDecision ?? ""}
                    size="xs"
                    searchable={false}
                    className="min-w-[10.5rem]"
                    triggerTextClassName={
                      pt.manualDecision ? "text-primary" : undefined
                    }
                    onChange={(val) => {
                      const nextDecision = val
                        ? (val as OfficialPitcherDecision | "none")
                        : null;
                      updatePitcher(pt.id, { manualDecision: nextDecision });
                    }}
                    options={OFFICIAL_PITCHER_DECISION_OPTIONS}
                  />
                </div>

                {(hasMidInningEntry || hasMidInningExit) && (
                  <div className="px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/25 text-[10px] font-black text-primary flex items-center justify-between gap-2">
                    <span>
                      {hasMidInningEntry
                        ? `${pt.fromInning}回途中（${pt.fromBatterOrder}番打者${
                            current.batters.find(
                              (b) => b.battingOrder === pt.fromBatterOrder
                            )?.name
                              ? `・${
                                  current.batters.find(
                                    (b) => b.battingOrder === pt.fromBatterOrder
                                  )?.name
                                }`
                              : ""
                          }から）`
                        : `${pt.fromInning}回頭から`}
                      {" 〜 "}
                      {hasMidInningExit && nextPt
                        ? `${pt.toInning}回途中（${nextPt.fromBatterOrder}番打者の前まで）`
                        : `${pt.toInning}回終了まで`}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 進捗表示・エラー表示 ＆ アクションボタン */}
      <div className="space-y-2.5 pt-1">
        <ActionStatusBanner
          isLoading={
            isAnalyzingInnings || isRescanningSide || isDetectingInningRanges
          }
          loadingTitle={
            isDetectingInningRanges
              ? "各イニングの打順範囲・人数をAI判定中..."
              : isRescanningSide
                ? "シートの骨格を再スキャン中..."
                : "イニング並列・高速ディープ解析を実行中..."
          }
          loadingDetail={
            isDetectingInningRanges
              ? "位置合わせ済みのマス枠から「何番〜何番（計何人）」かを一括検算しています..."
              : isRescanningSide
                ? structureProgressLabel ||
                  "打順・投手・各回得点を再取得しています..."
                : analysisProgressLabel ||
                  "各イニングの1球順序・打撃結果・進塁を高速解析しています..."
          }
          startedAtMs={analysisStartedAtMs}
          totalDurationMs={analysisTotalDurationMs}
          activeSubStepLabel={analysisActiveLabel}
          activeSubStepLabels={analysisActiveLabels}
          activeSubStepStartedAtMs={analysisActiveStartedAtMs}
          completedTimings={analysisCompletedTimings}
          persistTimingsWhenIdle={
            !isRescanningSide &&
            !isDetectingInningRanges &&
            analysisCompletedTimings.length > 0
          }
          onRetryEntry={
            isRescanningSide || isDetectingInningRanges
              ? undefined
              : onRetryTimingEntry
          }
          retryingEntryKey={reanalyzingInningKey}
          errorMessage={errorMessage}
          onDismissError={onDismissError}
        />

        {/* 途中完了イニング保持・再開パネル（エラー時やStep3から戻った際も完了分を無駄にしない） */}
        {!isBusy && preservedAtBatsCount > 0 && (
          <div className="p-3.5 rounded-2xl border border-border border-l-4 border-l-emerald-500 bg-card shadow-xs space-y-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-xs font-black text-foreground">
                  完了済みイニングの解析データを保持しています（計{" "}
                  {preservedAtBatsCount} 打席）
                </p>
                <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
                  {missingInningsCount > 0
                    ? `未完了の回が ${missingInningsCount} イニングあります。完了分は消えずに保存されているため、残り ${missingInningsCount} イニングだけ数秒で再解析するか、このまま確認画面へ進めます。`
                    : "全イニングの解析データが保持されています。そのまま確認画面へ進めます（上のバッジから回ごとの個別再解析も可能です）。"}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              {missingInningsCount > 0 && onResumeMissingInnings && (
                <button
                  type="button"
                  onClick={onResumeMissingInnings}
                  className="w-full sm:flex-1 min-h-13 py-3.5 px-4 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs sm:text-sm font-black shadow-xs flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4 shrink-0" />
                  <span>
                    未完了の回（残り{missingInningsCount}回）だけ再解析
                  </span>
                </button>
              )}

              {onProceedWithCompleted && (
                <button
                  type="button"
                  onClick={onProceedWithCompleted}
                  className={`w-full sm:flex-1 min-h-13 py-3.5 px-4 rounded-xl text-xs sm:text-sm font-black shadow-xs flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer ${
                    missingInningsCount > 0 && onResumeMissingInnings
                      ? "bg-primary/10 hover:bg-primary/15 border border-primary/25 text-primary"
                      : "bg-primary hover:bg-primary/90 text-primary-foreground"
                  }`}
                >
                  <span>
                    {missingInningsCount > 0
                      ? "完了済みの結果で確認画面へ進む"
                      : "変更を反映して打席確認（STEP 3）へ進む"}
                  </span>
                  <ChevronRight className="w-4 h-4 shrink-0" />
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-2.5">
          <button
            type="button"
            disabled={isBusy}
            onClick={onBack}
            className="h-13 px-4 rounded-2xl bg-card border border-border hover:bg-muted text-xs font-black text-foreground flex items-center gap-1 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>{activeSheetDataUrl ? "画像選択へ" : "STEP 1へ"}</span>
          </button>

          {onStartDeepAnalysis ? (
            <button
              type="button"
              disabled={isBusy}
              onClick={onStartDeepAnalysis}
              className={`flex-1 h-13 px-4 rounded-2xl text-xs sm:text-sm font-black shadow-md flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer disabled:opacity-50 ${
                preservedAtBatsCount > 0
                  ? "bg-card hover:bg-muted border border-border text-foreground shadow-xs"
                  : "bg-primary hover:bg-primary/90 text-primary-foreground"
              }`}
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>
                {preservedAtBatsCount > 0
                  ? "最初から全イニングを再解析"
                  : "全打席・1球順序をディープ解析"}
              </span>
            </button>
          ) : (
            onProceedWithCompleted && (
              <button
                type="button"
                disabled={isBusy}
                onClick={onProceedWithCompleted}
                className="flex-1 h-13 px-4 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs sm:text-sm font-black shadow-md flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
              >
                <span>打席・1球検算の編集へ進む</span>
                <ChevronRight className="w-4 h-4 shrink-0" />
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

