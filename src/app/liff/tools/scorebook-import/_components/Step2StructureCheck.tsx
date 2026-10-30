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
import { normalizePositionCode } from "@/lib/liff/scorebook-validator";
import { ActionStatusBanner } from "./ActionStatusBanner";
import {
  formatElapsedSeconds,
  formatTotalElapsedSeconds,
  type ImportScopeMode,
  type NormalizedPoint,
  type ScorebookBatterSlot,
  type ScorebookGridCorners,
  type ScorebookInningMeta,
  type ScorebookPitcherStint,
  type ScorebookRosterPlayer,
  type ScorebookSheetStructure,
  type ScorebookSubstitution,
  type ScorebookTimingEntry,
} from "@/types/scorebook-v2";

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
  const [showGridTuner, setShowGridTuner] = useState(false);
  const [draggingCorner, setDraggingCorner] = useState<
    keyof ScorebookGridCorners | null
  >(null);
  const gridContainerRef = useRef<HTMLDivElement | null>(null);

  const isTop = activeSide === "top";
  const current = isTop ? topStructure : bottomStructure;
  const activeSheetDataUrl = isTop ? topImageDataUrl : bottomImageDataUrl;
  const isBusy =
    isAnalyzingInnings || isRescanningSide || Boolean(reanalyzingInningKey);

  if (!current) {
    return null;
  }

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

  const handleUpdateCornerPoint = (
    key: keyof ScorebookGridCorners,
    clientX: number,
    clientY: number
  ) => {
    const el = gridContainerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return;
    const nx = clamp1000(((clientX - rect.left) / rect.width) * 1000);
    const ny = clamp1000(((clientY - rect.top) / rect.height) * 1000);
    const nextCorners: ScorebookGridCorners = {
      ...gridCorners,
      [key]: [nx, ny] as NormalizedPoint,
    };
    onChangeStructure(
      isTop,
      syncStructureBoxesFromCorners(current, nextCorners)
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

  const updateInningMeta = (
    inningNum: number,
    patch: Partial<ScorebookInningMeta>
  ) => {
    const prevTarget = current.innings.find((m) => m.inning === inningNum);
    const deltaCols =
      patch.columnCount !== undefined && prevTarget
        ? Math.max(1, patch.columnCount) - Math.max(1, prevTarget.columnCount)
        : 0;

    const nextInnings = current.innings.map((m) =>
      m.inning === inningNum ? { ...m, ...patch } : m
    );
    const totalRuns = nextInnings.reduce((s, m) => s + m.runs, 0);
    const baseUpdated: ScorebookSheetStructure = {
      ...current,
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
      current.innings.length > 0
        ? current.innings[current.innings.length - 1].inning + 1
        : 1;
    const nextInnings = [
      ...current.innings,
      { inning: nextNum, columnCount: 1, runs: 0, hits: 0 },
    ];
    onChangeStructure(
      isTop,
      extrapolateHorizontalCols({ ...current, innings: nextInnings }, 1)
    );
  };

  const handleRemoveLastInning = () => {
    if (current.innings.length <= 1) return;
    const removedCols = Math.max(
      1,
      current.innings[current.innings.length - 1].columnCount || 1
    );
    const nextInnings = current.innings.slice(0, -1);
    const totalRuns = nextInnings.reduce((s, m) => s + m.runs, 0);
    onChangeStructure(
      isTop,
      extrapolateHorizontalCols(
        {
          ...current,
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
          Math.ceil((prevLast.fromInning + maxInn) / 2)
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
    onChangeStructure(isTop, {
      ...current,
      pitchers: current.pitchers.filter((p) => p.id !== id),
    });
  };

  return (
    <div className="space-y-4">
      {/* ガイドバナー */}
      <section className="rounded-3xl bg-card border border-indigo-500/35 shadow-xs p-4 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <h2 className="text-xs font-black text-foreground truncate">
              骨格確認（打順・登板投手・各回得点の確認）
            </h2>
          </div>

          {onRescanSide && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onRescanSide(isTop)}
              className="px-2.5 py-1 rounded-xl bg-indigo-500/12 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-[10px] font-black flex items-center gap-1 shrink-0 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
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
          ここで確定した「各回の得点」「打者一巡(2列)の有無」「打順・途中交代・投手」を正解アンカーとして、次のステップで全投球・全打席を精密解析します。
        </p>
        {structureTotalMs !== null && structureTotalMs > 0 && (
          <div className="pt-1 flex items-center gap-1.5 flex-wrap text-[10px] font-black text-indigo-700 dark:text-indigo-300 tabular-nums">
            <span className="px-2 py-0.5 rounded-lg bg-indigo-500/12 border border-indigo-500/30 inline-flex items-center gap-1">
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
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-muted/70 border border-border/60">
          <button
            type="button"
            onClick={() => setActiveSide("top")}
            className={`py-2.5 px-3 rounded-xl text-xs transition-all cursor-pointer ${
              activeSide === "top"
                ? "bg-card text-foreground font-black shadow-2xs"
                : "text-muted-foreground font-bold"
            }`}
          >
            先攻（表）: {topStructure?.isMyTeamBatting ? "自チーム" : opponentName}
          </button>
          <button
            type="button"
            onClick={() => setActiveSide("bottom")}
            className={`py-2.5 px-3 rounded-xl text-xs transition-all cursor-pointer ${
              activeSide === "bottom"
                ? "bg-card text-foreground font-black shadow-2xs"
                : "text-muted-foreground font-bold"
            }`}
          >
            後攻（裏）: {bottomStructure?.isMyTeamBatting ? "自チーム" : opponentName}
          </button>
        </div>
      )}

      {/* 手書き原本シート照合＆マス枠キャリブレーションビューア */}
      {activeSheetDataUrl && (
        <section className="rounded-3xl bg-card border border-border shadow-xs overflow-hidden">
          <div className="px-3.5 py-2.5 bg-muted/45 border-b border-border flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Grid3X3 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span className="text-[11px] font-black text-foreground truncate">
                原本シート＆マス枠（{isTop ? "先攻・表" : "後攻・裏"}）
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setPreviewMode("grid")}
                className={`px-2 py-1 rounded-lg text-[10px] font-black cursor-pointer transition-colors ${
                  previewMode === "grid"
                    ? "bg-indigo-600 text-white"
                    : "bg-card text-muted-foreground border border-border"
                }`}
              >
                マス枠確認
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode("lineup")}
                className={`px-2 py-1 rounded-lg text-[10px] font-black cursor-pointer transition-colors ${
                  previewMode === "lineup"
                    ? "bg-indigo-600 text-white"
                    : "bg-card text-muted-foreground border border-border"
                }`}
              >
                打順欄ズーム
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode("full")}
                className={`px-2 py-1 rounded-lg text-[10px] font-black cursor-pointer transition-colors ${
                  previewMode === "full"
                    ? "bg-indigo-600 text-white"
                    : "bg-card text-muted-foreground border border-border"
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
                className="px-2 py-1 rounded-lg bg-card border border-border text-[10px] font-black text-muted-foreground flex items-center gap-0.5 cursor-pointer"
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
                    {/* 各イニング列＆サブ列（2列・3列以上）の歪み追従ポリゴン */}
                    {(() => {
                      const circledNums = ["①", "②", "③", "④", "⑤", "⑥"];
                      let cumCols = 0;
                      return current.innings.map((inn) => {
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

                        return (
                          <g key={`col-${inn.inning}`}>
                            <polygon
                              points={polyPts}
                              fill={
                                subCols >= 2
                                  ? "rgba(245, 158, 11, 0.10)"
                                  : "rgba(56, 189, 248, 0.06)"
                              }
                              stroke={subCols >= 2 ? "#f59e0b" : "#38bdf8"}
                              strokeWidth="2.6"
                            />
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
                  </svg>

                  {/* 枠ズレ微調整モード中は画像上の4隅（左上・右上・右下・左下）を直接指でドラッグして傾き・台形歪みにピタッと合わせられる！ */}
                  {showGridTuner &&
                    (
                      [
                        { key: "tl", label: "左上" },
                        { key: "tr", label: "右上" },
                        { key: "br", label: "右下" },
                        { key: "bl", label: "左下" },
                      ] as const
                    ).map(({ key, label }) => {
                      const pt = gridCorners[key];
                      const active = draggingCorner === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.currentTarget.setPointerCapture(e.pointerId);
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
                          className={`absolute -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full border-2 border-white shadow-md flex items-center justify-center text-[9px] font-black text-white touch-none cursor-grab active:cursor-grabbing transition-transform ${
                            active
                              ? "bg-amber-500 scale-125 z-20"
                              : "bg-indigo-600 z-10"
                          }`}
                          aria-label={`グリッド${label}角をドラッグ調整`}
                        >
                          {label}
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
                      ? "bg-indigo-600 text-white"
                      : "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30"
                  }`}
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  <span>
                    {showGridTuner ? "調整を閉じる" : "歪み・枠ズレ調整"}
                  </span>
                </button>
              </div>

              {showGridTuner && (
                <div className="space-y-2 pt-0.5">
                  <div className="px-2.5 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Move className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      <span className="text-[10px] font-black text-foreground leading-snug">
                        原本が傾いている・歪んでいる時は、上の画像の<strong>「左上・右上・右下・左下」の丸印</strong>を指でドラッグして表の4隅に合わせてください
                      </span>
                    </div>
                    {isGridSkewed && (
                      <button
                        type="button"
                        onClick={handleResetSkewToRectangle}
                        className="px-2 py-1 rounded-lg bg-card border border-border text-[9px] font-black text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
                      >
                        水平に戻す
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {/* 1回左端（選手欄との境界） */}
                    <div className="p-2 rounded-2xl bg-muted/45 border border-border space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-sky-700 dark:text-sky-300">
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
                          className="w-7 h-7 rounded-lg bg-card border border-border text-xs font-black text-foreground active:scale-90 cursor-pointer shrink-0"
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
                          className="flex-1 min-w-0 accent-sky-500"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleAdjustGridBound("left", gridLeftX + 6)
                          }
                          className="w-7 h-7 rounded-lg bg-card border border-border text-xs font-black text-foreground active:scale-90 cursor-pointer shrink-0"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* 最終回右端 */}
                    <div className="p-2 rounded-2xl bg-muted/45 border border-border space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-sky-700 dark:text-sky-300">
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
                          className="w-7 h-7 rounded-lg bg-card border border-border text-xs font-black text-foreground active:scale-90 cursor-pointer shrink-0"
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
                          className="flex-1 min-w-0 accent-sky-500"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleAdjustGridBound("right", gridRightX + 6)
                          }
                          className="w-7 h-7 rounded-lg bg-card border border-border text-xs font-black text-foreground active:scale-90 cursor-pointer shrink-0"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* 1番上端 */}
                    <div className="p-2 rounded-2xl bg-muted/45 border border-border space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-300">
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
                          className="w-7 h-7 rounded-lg bg-card border border-border text-xs font-black text-foreground active:scale-90 cursor-pointer shrink-0"
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
                          className="flex-1 min-w-0 accent-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleAdjustGridBound("top", gridTopY + 5)
                          }
                          className="w-7 h-7 rounded-lg bg-card border border-border text-xs font-black text-foreground active:scale-90 cursor-pointer shrink-0"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* 最終打順の下端 */}
                    <div className="p-2 rounded-2xl bg-muted/45 border border-border space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-300">
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
                          className="w-7 h-7 rounded-lg bg-card border border-border text-xs font-black text-foreground active:scale-90 cursor-pointer shrink-0"
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
                          className="flex-1 min-w-0 accent-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleAdjustGridBound("bottom", gridBottomY + 5)
                          }
                          className="w-7 h-7 rounded-lg bg-card border border-border text-xs font-black text-foreground active:scale-90 cursor-pointer shrink-0"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* A. イニング別得点 ＆ 複数列（1列・2列・3列以上）設定 */}
      <section className="rounded-3xl bg-card border border-border shadow-xs p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-black text-foreground">
              {isTop ? "先攻（表）" : "後攻（裏）"} イニング別得点・使用列数
            </h3>
            <p className="text-[10px] font-bold text-muted-foreground">
              打者一巡・二巡して2列・3列以上使った回は列数の「+」で合わせた列数にしてください
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleRemoveLastInning}
              className="px-2 py-1 rounded-lg bg-muted border border-border text-[10px] font-black text-muted-foreground cursor-pointer"
            >
              -回
            </button>
            <button
              type="button"
              onClick={handleAddInning}
              className="px-2 py-1 rounded-lg bg-primary/12 text-primary text-[10px] font-black cursor-pointer"
            >
              +回
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {current.innings.map((inn) => {
            const cols = Math.max(1, inn.columnCount || 1);
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
            return (
              <div
                key={inn.inning}
                className={`p-2 rounded-2xl border text-center space-y-1.5 ${
                  cols >= 2
                    ? "bg-amber-500/10 border-amber-500/50"
                    : maybeNeedsMoreCols
                    ? "bg-amber-500/8 border-amber-500/60"
                    : "bg-muted/35 border-border"
                }`}
              >
                <div className="flex items-center justify-center gap-1">
                  <span className="text-[10px] font-black text-muted-foreground">
                    {inn.inning}回{isTop ? "表" : "裏"}
                  </span>
                </div>

                {/* 得点ステッパー */}
                <div className="flex items-center justify-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      updateInningMeta(inn.inning, {
                        runs: Math.max(0, inn.runs - 1),
                      })
                    }
                    className="w-6 h-6 rounded-lg bg-card border border-border text-xs font-black text-foreground active:scale-90 cursor-pointer"
                  >
                    -
                  </button>
                  <span className="w-6 text-sm font-black text-foreground">
                    {inn.runs}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      updateInningMeta(inn.inning, { runs: inn.runs + 1 })
                    }
                    className="w-6 h-6 rounded-lg bg-card border border-border text-xs font-black text-foreground active:scale-90 cursor-pointer"
                  >
                    +
                  </button>
                </div>

                {/* 使用列数ステッパー（1列・2列・3列・4列〜6列まで自在に設定可能！） */}
                <div className="flex items-center justify-between gap-0.5 pt-0.5">
                  <button
                    type="button"
                    disabled={cols <= 1}
                    onClick={() =>
                      updateInningMeta(inn.inning, {
                        columnCount: Math.max(1, cols - 1),
                      })
                    }
                    className="w-5 h-5 rounded-md bg-card border border-border text-[10px] font-black text-foreground disabled:opacity-35 active:scale-90 cursor-pointer shrink-0"
                    aria-label={`${inn.inning}回の列数を減らす`}
                  >
                    -
                  </button>
                  <span
                    className={`flex-1 py-0.5 px-1 rounded-md text-[9px] font-black flex items-center justify-center gap-0.5 truncate ${
                      cols >= 2
                        ? "bg-amber-600 text-white"
                        : "bg-card text-muted-foreground border border-border/60"
                    }`}
                  >
                    <Columns2 className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate">{colBadgeText}</span>
                  </span>
                  <button
                    type="button"
                    disabled={cols >= 6}
                    onClick={() =>
                      updateInningMeta(inn.inning, {
                        columnCount: Math.min(6, cols + 1),
                      })
                    }
                    className="w-5 h-5 rounded-md bg-card border border-border text-[10px] font-black text-foreground disabled:opacity-35 active:scale-90 cursor-pointer shrink-0"
                    aria-label={`${inn.inning}回の列数を増やす`}
                  >
                    +
                  </button>
                </div>

                {maybeNeedsMoreCols && (
                  <span className="block text-[8px] font-black text-amber-700 dark:text-amber-300 leading-tight">
                    大量得点: 列数+を確認
                  </span>
                )}
              </div>
            );
          })}

          {/* 合計得点表示 */}
          <div className="p-2 rounded-2xl bg-primary/10 border border-primary/30 flex flex-col items-center justify-center">
            <span className="text-[10px] font-black text-primary">合計得点</span>
            <span className="text-lg font-black text-primary">
              {current.innings.reduce((s, m) => s + m.runs, 0)}
            </span>
          </div>
        </div>
      </section>

      {/* B. 打順（1〜9番＋途中交代）確認 */}
      <section className="rounded-3xl bg-card border border-border shadow-xs p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <div>
              <h3 className="text-sm font-black text-foreground">
                {current.isMyTeamBatting
                  ? "自チームの打順・途中交代"
                  : `相手（${opponentName}）の打順・途中交代`}
              </h3>
              <p className="text-[10px] font-bold text-muted-foreground">
                {current.isMyTeamBatting
                  ? "登録選手と紐付けることで個人成績に正確に集計されます"
                  : "手書き文字の読み間違いがあれば修正してください"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddBatterSlot}
            className="px-2.5 py-1 rounded-xl bg-muted border border-border text-[10px] font-black text-foreground cursor-pointer"
          >
            +10番以降
          </button>
        </div>

        <div className="space-y-2.5">
          {current.batters.map((slot) => (
            <div
              key={slot.battingOrder}
              className="p-2.5 rounded-2xl bg-muted/35 border border-border/80 space-y-2"
            >
              <div className="flex items-center gap-1.5">
                <span className="w-6 h-6 rounded-lg bg-foreground text-background text-[11px] font-black flex items-center justify-center shrink-0">
                  {slot.battingOrder}
                </span>

                {current.isMyTeamBatting && roster.length > 0 ? (
                  <select
                    value={slot.playerId || ""}
                    onChange={(e) =>
                      handleSelectRosterForBatter(
                        slot.battingOrder,
                        e.target.value
                      )
                    }
                    className="flex-1 min-w-0 h-9 px-2 rounded-xl bg-card border border-border text-xs font-black text-foreground"
                  >
                    <option value="">
                      {slot.name
                        ? `未登録: ${slot.name} (#${slot.uniformNumber || "-"})`
                        : "-- 選手を選択 --"}
                    </option>
                    {roster.map((p) => (
                      <option key={p.id} value={p.id}>
                        #{p.uniformNumber} {p.name}
                      </option>
                    ))}
                  </select>
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

                <select
                  value={slot.position}
                  onChange={(e) =>
                    updateBatter(slot.battingOrder, { position: e.target.value })
                  }
                  className="w-16 h-9 px-1 rounded-xl bg-card border border-border text-[11px] font-black text-foreground shrink-0"
                >
                  {POSITION_OPTIONS.map((pos) => (
                    <option key={pos.value} value={pos.value}>
                      {pos.label}
                    </option>
                  ))}
                </select>

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

              {/* 途中交代（代打・代走・守備交代・守備位置指定） */}
              {slot.substitutions.length > 0 && (
                <div className="pl-5 space-y-1.5">
                  {slot.substitutions.map((sub) => (
                    <div
                      key={sub.id}
                      className="p-2 rounded-xl bg-amber-500/8 border border-amber-500/25 space-y-1.5"
                    >
                      <div className="flex items-center gap-1.5">
                        <select
                          value={sub.inningEntered}
                          onChange={(e) =>
                            updateSubstitution(slot.battingOrder, sub.id, {
                              inningEntered: Number(e.target.value),
                            })
                          }
                          className="h-8 px-1 rounded-lg bg-card border border-border text-[10px] font-black text-foreground shrink-0"
                        >
                          {inningOptions.map((n) => (
                            <option key={n} value={n}>
                              {n}回〜
                            </option>
                          ))}
                        </select>

                        <select
                          value={sub.subType}
                          onChange={(e) =>
                            updateSubstitution(slot.battingOrder, sub.id, {
                              subType: e.target.value as
                                | "PH"
                                | "PR"
                                | "TR"
                                | "DEF",
                            })
                          }
                          className="h-8 px-1 rounded-lg bg-card border border-border text-[10px] font-black text-amber-700 dark:text-amber-300 shrink-0"
                        >
                          <option value="PH">代打</option>
                          <option value="PR">代走</option>
                          <option value="TR">臨時代走</option>
                          <option value="DEF">守備</option>
                        </select>

                        {current.isMyTeamBatting && roster.length > 0 ? (
                          <select
                            value={sub.playerId || ""}
                            onChange={(e) => {
                              const found = roster.find(
                                (p) => p.id === e.target.value
                              );
                              if (found) {
                                const autoPos =
                                  sub.position ||
                                  (sub.subType === "DEF" && found.primaryPosition
                                    ? normalizePositionCode(found.primaryPosition)
                                    : "");
                                updateSubstitution(slot.battingOrder, sub.id, {
                                  playerId: found.id,
                                  name: found.name,
                                  uniformNumber: found.uniformNumber,
                                  position: autoPos,
                                });
                              } else {
                                updateSubstitution(slot.battingOrder, sub.id, {
                                  playerId: null,
                                });
                              }
                            }}
                            className="flex-1 min-w-0 h-8 px-1.5 rounded-lg bg-card border border-border text-[11px] font-black text-foreground"
                          >
                            <option value="">
                              {sub.name ? `未登録: ${sub.name}` : "-- 交代選手 --"}
                            </option>
                            {roster.map((p) => (
                              <option key={p.id} value={p.id}>
                                #{p.uniformNumber} {p.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <>
                            <input
                              type="text"
                              value={sub.uniformNumber}
                              onChange={(e) =>
                                updateSubstitution(slot.battingOrder, sub.id, {
                                  uniformNumber: e.target.value,
                                })
                              }
                              placeholder="#"
                              className="w-10 h-8 px-1 rounded-lg bg-card border border-border text-center text-[11px] font-black text-foreground shrink-0"
                            />
                            <input
                              type="text"
                              value={sub.name}
                              onChange={(e) =>
                                updateSubstitution(slot.battingOrder, sub.id, {
                                  name: e.target.value,
                                })
                              }
                              placeholder="交代選手名"
                              className="flex-1 min-w-0 h-8 px-2 rounded-lg bg-card border border-border text-[11px] font-black text-foreground"
                            />
                          </>
                        )}

                        <select
                          value={sub.position}
                          onChange={(e) =>
                            updateSubstitution(slot.battingOrder, sub.id, {
                              position: e.target.value,
                            })
                          }
                          aria-label="交代後の守備位置"
                          className="w-16 h-8 px-1 rounded-lg bg-card border border-border text-[10px] font-black text-foreground shrink-0"
                        >
                          <option value="">守備 -</option>
                          {POSITION_OPTIONS.filter((p) => p.value !== "").map(
                            (pos) => (
                              <option key={pos.value} value={pos.value}>
                                {pos.label}
                              </option>
                            )
                          )}
                        </select>

                        <button
                          type="button"
                          onClick={() =>
                            removeSubstitution(slot.battingOrder, sub.id)
                          }
                          className="p-1 text-destructive cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {current.isMyTeamBatting &&
                        roster.length > 0 &&
                        !sub.playerId && (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={sub.uniformNumber}
                              onChange={(e) =>
                                updateSubstitution(slot.battingOrder, sub.id, {
                                  uniformNumber: e.target.value,
                                })
                              }
                              placeholder="背番号"
                              className="w-14 h-7 px-1.5 rounded-lg bg-card border border-border text-center text-[10px] font-black text-foreground"
                            />
                            <input
                              type="text"
                              value={sub.name}
                              onChange={(e) =>
                                updateSubstitution(slot.battingOrder, sub.id, {
                                  name: e.target.value,
                                })
                              }
                              placeholder="助っ人・未登録の交代選手名を入力"
                              className="flex-1 min-w-0 h-7 px-2 rounded-lg bg-card border border-border text-[10px] font-black text-foreground"
                            />
                          </div>
                        )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* C. 登板投手（先発・継投）確認 */}
      <section className="rounded-3xl bg-card border border-border shadow-xs p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-black text-foreground">
              {!current.isMyTeamBatting
                ? "自チームの登板投手（継投）"
                : `相手（${opponentName}）の登板投手（継投）`}
            </h3>
            <p className="text-[10px] font-bold text-muted-foreground leading-relaxed">
              このシートの打者に対して投げた投手と担当回（回途中の交代は「1〜4回」と「4〜7回」のように交代回を重ねると波線位置で自動振り分けます）
            </p>
          </div>
          <button
            type="button"
            onClick={addPitcher}
            className="px-2.5 py-1.5 rounded-xl bg-primary/12 text-primary text-[10px] font-black flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>継投追加</span>
          </button>
        </div>

        <div className="space-y-2">
          {current.pitchers.map((pt, idx) => (
            <div
              key={pt.id}
              className="p-2.5 rounded-2xl bg-muted/35 border border-border/80 space-y-2"
            >
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-1 rounded-lg bg-foreground text-background text-[10px] font-black shrink-0">
                  {idx === 0 ? "先発" : `${idx + 1}番手`}
                </span>

                {!current.isMyTeamBatting && roster.length > 0 ? (
                  <select
                    value={pt.playerId || ""}
                    onChange={(e) => {
                      const found = roster.find((p) => p.id === e.target.value);
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
                    className="flex-1 min-w-0 h-9 px-2.5 rounded-xl bg-card border border-border text-xs font-black text-foreground"
                  >
                    <option value="">
                      {pt.name ? `未登録: ${pt.name}` : "-- 自チーム投手を選択 --"}
                    </option>
                    {roster.map((p) => (
                      <option key={p.id} value={p.id}>
                        #{p.uniformNumber} {p.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input
                      type="text"
                      value={pt.uniformNumber}
                      onChange={(e) =>
                        updatePitcher(pt.id, { uniformNumber: e.target.value })
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

              {!current.isMyTeamBatting && roster.length > 0 && !pt.playerId && (
                <div className="pl-12 flex items-center gap-1.5">
                  <input
                    type="text"
                    value={pt.uniformNumber}
                    onChange={(e) =>
                      updatePitcher(pt.id, { uniformNumber: e.target.value })
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

              <div className="flex items-center justify-between gap-2 pl-1">
                <span className="text-[11px] font-bold text-muted-foreground">
                  担当イニング
                </span>
                <div className="flex items-center gap-1.5">
                  <select
                    aria-label="登板開始イニング"
                    value={pt.fromInning}
                    onChange={(e) => {
                      const nextFrom = Number(e.target.value);
                      updatePitcher(pt.id, {
                        fromInning: nextFrom,
                        toInning: Math.max(pt.toInning, nextFrom),
                      });
                    }}
                    className="h-9 min-w-[4.5rem] px-2.5 rounded-xl bg-card border border-border text-xs font-black text-foreground cursor-pointer"
                  >
                    {inningOptions.map((n) => (
                      <option key={n} value={n}>
                        {n}回
                      </option>
                    ))}
                  </select>
                  <span className="text-xs font-black text-muted-foreground">
                    〜
                  </span>
                  <select
                    aria-label="登板終了イニング"
                    value={pt.toInning}
                    onChange={(e) => {
                      const nextTo = Number(e.target.value);
                      updatePitcher(pt.id, {
                        fromInning: Math.min(pt.fromInning, nextTo),
                        toInning: nextTo,
                      });
                    }}
                    className="h-9 min-w-[4.5rem] px-2.5 rounded-xl bg-card border border-border text-xs font-black text-foreground cursor-pointer"
                  >
                    {inningOptions.map((n) => (
                      <option key={n} value={n}>
                        {n}回
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 進捗表示・エラー表示 ＆ アクションボタン */}
      <div className="space-y-2.5 pt-1">
        <ActionStatusBanner
          isLoading={isAnalyzingInnings || isRescanningSide}
          loadingTitle={
            isRescanningSide
              ? "シートの骨格を再スキャン中..."
              : "イニング並列・高速ディープ解析を実行中..."
          }
          loadingDetail={
            isRescanningSide
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
            !isRescanningSide && analysisCompletedTimings.length > 0
          }
          onRetryEntry={isRescanningSide ? undefined : onRetryTimingEntry}
          retryingEntryKey={reanalyzingInningKey}
          errorMessage={errorMessage}
          onDismissError={onDismissError}
        />

        {/* 途中完了イニング保持・再開パネル（エラー時やStep3から戻った際も完了分を無駄にしない） */}
        {!isBusy && preservedAtBatsCount > 0 && (
          <div className="p-3.5 rounded-2xl bg-card border-2 border-emerald-500/50 shadow-xs space-y-2.5">
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

            <div className="flex flex-col sm:flex-row gap-2">
              {missingInningsCount > 0 && onResumeMissingInnings && (
                <button
                  type="button"
                  onClick={onResumeMissingInnings}
                  className="flex-1 h-12 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-xs flex items-center justify-center gap-1.5 active:scale-98 transition-all cursor-pointer"
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
                  className="flex-1 h-12 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-xs flex items-center justify-center gap-1.5 active:scale-98 transition-all cursor-pointer"
                >
                  <span>完了済みの結果で確認画面へ進む</span>
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
            className="h-13 px-4 rounded-2xl bg-card border border-border text-xs font-black text-foreground flex items-center gap-1 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>画像選択へ</span>
          </button>

          {onStartDeepAnalysis ? (
            <button
              type="button"
              disabled={isBusy}
              onClick={onStartDeepAnalysis}
              className={`flex-1 h-13 px-4 rounded-2xl text-xs sm:text-sm font-black shadow-md flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer disabled:opacity-50 ${
                preservedAtBatsCount > 0
                  ? "bg-muted hover:bg-muted/80 border border-border text-foreground shadow-none"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white"
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
                className="flex-1 h-13 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-black shadow-md flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
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

