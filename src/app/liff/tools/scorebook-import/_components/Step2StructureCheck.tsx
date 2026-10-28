// filepath: src/app/liff/tools/scorebook-import/_components/Step2StructureCheck.tsx
"use client";

import React, { useState } from "react";
import {
  Users,
  Plus,
  Trash2,
  Sparkles,
  ChevronLeft,
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
} from "lucide-react";
import { normalizePositionCode } from "@/lib/liff/scorebook-validator";
import { ActionStatusBanner } from "./ActionStatusBanner";
import type {
  ImportScopeMode,
  NormalizedBox,
  ScorebookBatterSlot,
  ScorebookInningMeta,
  ScorebookPitcherStint,
  ScorebookRosterPlayer,
  ScorebookSheetStructure,
  ScorebookSubstitution,
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
  onBack: () => void;
  onStartDeepAnalysis: () => void;
  isAnalyzingInnings: boolean;
  analysisProgressLabel: string;
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
  onBack,
  onStartDeepAnalysis,
  isAnalyzingInnings,
  analysisProgressLabel,
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

  const isTop = activeSide === "top";
  const current = isTop ? topStructure : bottomStructure;
  const activeSheetDataUrl = isTop ? topImageDataUrl : bottomImageDataUrl;
  const isBusy = isAnalyzingInnings || isRescanningSide;

  if (!current) {
    return null;
  }

  // 現在のシートのグリッド4辺境界（0..1000）を算出
  const batterCount = Math.max(1, current.batters.length);
  const firstInningBox = current.innings[0]?.columnBox;
  const lastInningBox = current.innings[current.innings.length - 1]?.columnBox;
  const firstBatterBox = current.batters[0]?.rowBox;
  const lastBatterBox = current.batters[current.batters.length - 1]?.rowBox;

  const gridLeftX =
    firstInningBox?.[1] ?? current.lineupRightX ?? 310;
  const totalPhysCols = Math.max(
    1,
    current.innings.reduce((acc, m) => acc + Math.max(1, m.columnCount || 1), 0)
  );
  const gridRightX =
    lastInningBox?.[3] ??
    Math.min(960, Math.round(gridLeftX + totalPhysCols * 58));
  const gridTopY =
    firstBatterBox?.[0] ?? firstInningBox?.[0] ?? 165;
  const gridBottomY =
    lastBatterBox?.[2] ??
    lastInningBox?.[2] ??
    Math.min(930, Math.round(gridTopY + batterCount * 66));

  /**
   * 4辺境界 (leftX, rightX, topY, bottomY) から全イニング列(columnBox)と全打順行(rowBox)を等間隔再配分する
   */
  const rebuildStructureWithBounds = (
    base: ScorebookSheetStructure,
    nextLeftX: number,
    nextRightX: number,
    nextTopY: number,
    nextBottomY: number
  ): ScorebookSheetStructure => {
    const safeLeftX = Math.max(120, Math.min(540, Math.round(nextLeftX)));
    const colsSum = Math.max(
      1,
      base.innings.reduce((acc, m) => acc + Math.max(1, m.columnCount || 1), 0)
    );
    const safeRightX = Math.max(
      safeLeftX + colsSum * 20,
      Math.min(985, Math.round(nextRightX))
    );
    const bLen = Math.max(1, base.batters.length);
    const safeTopY = Math.max(30, Math.min(450, Math.round(nextTopY)));
    const safeBottomY = Math.max(
      safeTopY + bLen * 22,
      Math.min(985, Math.round(nextBottomY))
    );

    const rowH = (safeBottomY - safeTopY) / bLen;
    const nextBatters: ScorebookBatterSlot[] = base.batters.map((b, idx) => {
      const y1 = Math.round(safeTopY + idx * rowH);
      const y2 = Math.round(safeTopY + (idx + 1) * rowH);
      return {
        ...b,
        rowBox: [y1, 0, Math.max(y1 + 12, y2), safeLeftX] as NormalizedBox,
      };
    });

    const unitW = (safeRightX - safeLeftX) / colsSum;
    let cumCols = 0;
    const nextInnings: ScorebookInningMeta[] = base.innings.map((m) => {
      const w = Math.max(1, m.columnCount || 1);
      const x1 = Math.round(safeLeftX + cumCols * unitW);
      cumCols += w;
      const x2 = Math.round(safeLeftX + cumCols * unitW);
      return {
        ...m,
        columnBox: [
          safeTopY,
          x1,
          safeBottomY,
          Math.max(x1 + 12, x2),
        ] as NormalizedBox,
      };
    });

    return {
      ...base,
      lineupRightX: safeLeftX,
      batters: nextBatters,
      innings: nextInnings,
    };
  };

  const handleAdjustGridBound = (
    edge: "left" | "right" | "top" | "bottom",
    nextVal: number
  ) => {
    const updated = rebuildStructureWithBounds(
      current,
      edge === "left" ? nextVal : gridLeftX,
      edge === "right" ? nextVal : gridRightX,
      edge === "top" ? nextVal : gridTopY,
      edge === "bottom" ? nextVal : gridBottomY
    );
    onChangeStructure(isTop, updated);
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
    const prevUnitW = (gridRightX - gridLeftX) / totalPhysCols;
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
      onChangeStructure(
        isTop,
        rebuildStructureWithBounds(
          baseUpdated,
          gridLeftX,
          gridRightX + deltaCols * prevUnitW,
          gridTopY,
          gridBottomY
        )
      );
    } else {
      onChangeStructure(isTop, baseUpdated);
    }
  };

  const handleAddInning = () => {
    const prevUnitW = (gridRightX - gridLeftX) / totalPhysCols;
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
      rebuildStructureWithBounds(
        { ...current, innings: nextInnings },
        gridLeftX,
        gridRightX + prevUnitW,
        gridTopY,
        gridBottomY
      )
    );
  };

  const handleRemoveLastInning = () => {
    if (current.innings.length <= 1) return;
    const prevUnitW = (gridRightX - gridLeftX) / totalPhysCols;
    const removedCols = Math.max(
      1,
      current.innings[current.innings.length - 1].columnCount || 1
    );
    const nextInnings = current.innings.slice(0, -1);
    const totalRuns = nextInnings.reduce((s, m) => s + m.runs, 0);
    onChangeStructure(
      isTop,
      rebuildStructureWithBounds(
        {
          ...current,
          innings: nextInnings,
          totalRuns,
        },
        gridLeftX,
        gridRightX - removedCols * prevUnitW,
        gridTopY,
        gridBottomY
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
    const prevRowH = (gridBottomY - gridTopY) / batterCount;
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
      rebuildStructureWithBounds(
        { ...current, batters: nextBatters },
        gridLeftX,
        gridRightX,
        gridTopY,
        gridBottomY + prevRowH
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
            <div className="bg-slate-950 overflow-auto max-h-72">
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
                <div className="relative w-full">
                  <img
                    src={activeSheetDataUrl}
                    alt="マス枠オーバーレイ確認プレビュー"
                    className="w-full h-auto block select-none"
                  />
                  {/* 早稲田式の赤ペンと絶対干渉しないシアン(縦列)＋エメラルド(横行)の精密SVG枠 */}
                  <svg
                    viewBox="0 0 1000 1000"
                    preserveAspectRatio="none"
                    className="absolute inset-0 w-full h-full pointer-events-none"
                  >
                    {/* 各イニング列のシアン枠 */}
                    {current.innings.map((inn) => {
                      const box = inn.columnBox;
                      if (!box) return null;
                      const [y1, x1, y2, x2] = box;
                      const colW = Math.max(8, x2 - x1);
                      const colH = Math.max(12, y2 - y1);
                      const subCols = Math.max(1, inn.columnCount || 1);
                      const labelY = Math.max(24, y1 - 6);
                      return (
                        <g key={`col-${inn.inning}`}>
                          <rect
                            x={x1}
                            y={y1}
                            width={colW}
                            height={colH}
                            fill="rgba(56, 189, 248, 0.06)"
                            stroke="#38bdf8"
                            strokeWidth="2.4"
                          />
                          {subCols >= 2 &&
                            Array.from({ length: subCols - 1 }, (_, sIdx) => {
                              const divX =
                                x1 + ((sIdx + 1) * colW) / subCols;
                              return (
                                <line
                                  key={`sub-${inn.inning}-${sIdx}`}
                                  x1={divX}
                                  y1={y1}
                                  x2={divX}
                                  y2={y2}
                                  stroke="#38bdf8"
                                  strokeWidth="1.8"
                                  strokeDasharray="6 4"
                                />
                              );
                            })}
                          <rect
                            x={x1 + colW / 2 - 17}
                            y={Math.max(2, labelY - 22)}
                            width={34}
                            height={20}
                            rx={5}
                            fill="#0284c7"
                          />
                          <text
                            x={x1 + colW / 2}
                            y={Math.max(16, labelY - 8)}
                            textAnchor="middle"
                            fill="#ffffff"
                            fontSize="14"
                            fontWeight="900"
                          >
                            {inn.inning}回
                          </text>
                        </g>
                      );
                    })}

                    {/* 選手欄と1回の境界線（太線ハイライト） */}
                    <line
                      x1={gridLeftX}
                      y1={Math.max(10, gridTopY - 24)}
                      x2={gridLeftX}
                      y2={Math.min(990, gridBottomY + 12)}
                      stroke="#22d3ee"
                      strokeWidth="4"
                    />

                    {/* 各打順行のエメラルド横罫線 */}
                    {current.batters.map((slot, bIdx) => {
                      const rBox = slot.rowBox;
                      if (!rBox) return null;
                      const [ry1, , ry2] = rBox;
                      const midY = (ry1 + ry2) / 2;
                      return (
                        <g key={`row-${slot.battingOrder}`}>
                          {bIdx === 0 && (
                            <line
                              x1={Math.max(10, gridLeftX - 28)}
                              y1={ry1}
                              x2={gridRightX}
                              y2={ry1}
                              stroke="#34d399"
                              strokeWidth="2.6"
                            />
                          )}
                          <line
                            x1={Math.max(10, gridLeftX - 28)}
                            y1={ry2}
                            x2={gridRightX}
                            y2={ry2}
                            stroke="#34d399"
                            strokeWidth="2.2"
                          />
                          <rect
                            x={Math.max(4, gridLeftX - 26)}
                            y={midY - 10}
                            width={22}
                            height={20}
                            rx={4}
                            fill="#059669"
                          />
                          <text
                            x={Math.max(15, gridLeftX - 15)}
                            y={midY + 5}
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

          {/* マス枠4辺キャリブレーションバー（ズレがある時だけワンタップで微調整可能） */}
          {previewMode === "grid" && (
            <div className="px-3.5 py-2.5 bg-card border-t border-border space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold text-muted-foreground leading-snug">
                  青い枠が「1回〜最終回」、緑の枠が「1番〜{current.batters.length}番」に重なっていればOKです
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
                  <span>{showGridTuner ? "調整を閉じる" : "枠ズレを微調整"}</span>
                </button>
              </div>

              {showGridTuner && (
                <div className="grid grid-cols-2 gap-2 pt-0.5">
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
                          handleAdjustGridBound("right", Number(e.target.value))
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
              )}
            </div>
          )}
        </section>
      )}

      {/* A. イニング別得点 ＆ 打者一巡(2列)設定 */}
      <section className="rounded-3xl bg-card border border-border shadow-xs p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-black text-foreground">
              {isTop ? "先攻（表）" : "後攻（裏）"} イニング別得点・列数
            </h3>
            <p className="text-[10px] font-bold text-muted-foreground">
              打者一巡して2列使ったイニングは「2列(一巡)」をONにしてください
            </p>
          </div>
          <div className="flex items-center gap-1">
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

        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
          {current.innings.map((inn) => (
            <div
              key={inn.inning}
              className={`p-2 rounded-2xl border text-center space-y-1.5 ${
                inn.columnCount >= 2
                  ? "bg-indigo-500/8 border-indigo-500/40"
                  : "bg-muted/35 border-border"
              }`}
            >
              <span className="text-[10px] font-black text-muted-foreground block">
                {inn.inning}回{isTop ? "表" : "裏"}
              </span>

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

              <button
                type="button"
                onClick={() =>
                  updateInningMeta(inn.inning, {
                    columnCount: inn.columnCount >= 2 ? 1 : 2,
                  })
                }
                className={`w-full py-0.5 px-1 rounded-md text-[9px] font-black flex items-center justify-center gap-0.5 cursor-pointer ${
                  inn.columnCount >= 2
                    ? "bg-indigo-600 text-white"
                    : "bg-card text-muted-foreground border border-border/60"
                }`}
              >
                <Columns2 className="w-2.5 h-2.5" />
                <span>{inn.columnCount >= 2 ? "2列(一巡)" : "1列"}</span>
              </button>
            </div>
          ))}

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
              : "イニング分割ディープ解析を実行中..."
          }
          loadingDetail={
            isRescanningSide
              ? structureProgressLabel ||
                "打順・投手・各回得点を再取得しています..."
              : analysisProgressLabel ||
                "各イニングの1球順序・打撃結果・進塁を解析しています..."
          }
          errorMessage={errorMessage}
          onDismissError={onDismissError}
        />

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

          <button
            type="button"
            disabled={isBusy}
            onClick={onStartDeepAnalysis}
            className="flex-1 h-13 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-black shadow-md flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>全打席・1球順序をディープ解析</span>
          </button>
        </div>
      </div>
    </div>
  );
}

