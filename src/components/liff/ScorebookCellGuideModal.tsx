// filepath: src/components/liff/ScorebookCellGuideModal.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Compass,
  Diamond,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CompiledScorebookCell } from "@/lib/liff/scorebook-renderer-model";
import type { ScorebookSymbolRules } from "@/lib/liff/scorebook-symbol-rules";
import {
  buildScorebookCellGuide,
  type InspectedScorebookCellItem,
  type PitchGuideItem,
} from "@/lib/liff/scorebook-cell-guide";
import {
  renderCellSubstitutionsOverlaySvg,
  renderSingleScorebookCellSvg,
} from "@/components/liff/DigitalScorebookSheet";

const CELL_W = 88;
const CELL_H = 74;
const PAPER_BG = "#fffefb";
const COLOR_INK = "#0f172a";
const COLOR_RED = "#dc2626";
const COLOR_BLUE = "#1d4ed8";

export interface ScorebookSingleCellThumbnailProps {
  cell: CompiledScorebookCell;
  rules: ScorebookSymbolRules;
  className?: string;
  /** 拡大表示時に左外の代打波線・氏名も含めて表示するか */
  showLeftOutsideSub?: boolean;
}

/**
 * 清書シートと100%同一の描画ロジック・チーム記号ルールで「1マス」を単体SVGとして切り出し描画するコンポーネント
 */
export function ScorebookSingleCellThumbnail({
  cell,
  rules,
  className,
  showLeftOutsideSub = false,
}: ScorebookSingleCellThumbnailProps) {
  const hasLeftSub =
    showLeftOutsideSub &&
    Boolean(cell.leftOutsideSub) &&
    rules.pinchHitterMark !== "lineup_only";
  const hasTopPitcherChange =
    Boolean(cell.hasPitcherChangeBefore) &&
    typeof cell.pitcherChangeAtPitchIndex !== "number";
  const leftPad = hasLeftSub ? 22 : 0;
  const topPad = hasTopPitcherChange ? 12 : 0;
  const totalW = CELL_W + leftPad;
  const totalH = CELL_H + topPad;
  const hasUpperRightSubMark =
    rules.pinchHitterMark !== "lineup_only" && Boolean(cell.rightInsideSub);

  const cellForOverlay: CompiledScorebookCell = hasLeftSub
    ? cell
    : { ...cell, leftOutsideSub: undefined };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${totalW} ${totalH}`}
      width={totalW}
      height={totalH}
      className={cn("block select-none", className)}
      style={{ backgroundColor: PAPER_BG }}
      aria-hidden="true"
    >
      {(leftPad > 0 || topPad > 0) && (
        <rect x={0} y={0} width={totalW} height={totalH} fill={PAPER_BG} />
      )}
      {renderSingleScorebookCellSvg(
        cell,
        rules,
        leftPad,
        topPad,
        hasUpperRightSubMark,
        true
      )}
      {renderCellSubstitutionsOverlaySvg(
        cellForOverlay,
        rules,
        leftPad,
        topPad,
        0
      )}
    </svg>
  );
}

/**
 * ① 左列（BSO欄）の1球ごとの記号を、実際のシートと完全一致するベクター図形で描画するミニバッジ
 */
function ScorebookPitchGlyphBadge({
  item,
  rules,
}: {
  item: PitchGuideItem;
  rules: ScorebookSymbolRules;
}) {
  if (item.isNoBsoMarkEvent) {
    return (
      <span className="w-9 h-7 rounded-lg border border-dashed border-slate-300 bg-[#fffefb] text-[10px] font-black text-slate-600 inline-flex items-center justify-center shrink-0">
        {item.symbolHint}
      </span>
    );
  }

  if (rules.pitchMark === "numbered_bs" && item.numberedToken && item.numberedLane) {
    return (
      <span className="w-9 h-7 rounded-lg border border-slate-300 bg-[#fffefb] font-mono text-[10px] font-black text-slate-900 inline-flex items-center justify-center gap-0.5 shrink-0">
        <span className="text-[8px] text-slate-500">{item.numberedLane}</span>
        <span>{item.numberedToken}</span>
      </span>
    );
  }

  const p = item.pitchCode;
  const cx = 12;
  const cy = 12;

  return (
    <span className="w-9 h-7 rounded-lg border border-slate-300 bg-[#fffefb] inline-flex items-center justify-center shrink-0">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        className="w-5 h-5 block"
        aria-hidden="true"
      >
        {p === "strike" ? (
          <circle
            cx={cx}
            cy={cy}
            r={4.6}
            fill="none"
            stroke={COLOR_INK}
            strokeWidth={2.0}
          />
        ) : p === "bunt_swinging" && rules.buntPitchMark === "v_dot_circle_dot" ? (
          <g>
            <circle
              cx={cx}
              cy={cy}
              r={5.0}
              fill="none"
              stroke={COLOR_INK}
              strokeWidth={1.8}
            />
            <circle cx={cx} cy={cy} r={1.7} fill={COLOR_INK} />
          </g>
        ) : p === "bunt_swinging" &&
          rules.buntPitchMark === "inv_triangle_diamond" ? (
          <polygon
            points={`${cx},${cy - 5.2} ${cx + 5.0},${cy} ${cx},${cy + 5.2} ${cx - 5.0},${cy}`}
            fill="none"
            stroke={COLOR_INK}
            strokeWidth={1.8}
          />
        ) : p === "swinging_strike" || p === "bunt_swinging" ? (
          rules.pitchMark === "cross_swing" ||
          rules.pitchMark === "cross_dot_swing" ? (
            <g>
              <line
                x1={cx - 4.5}
                y1={cy - 4.5}
                x2={cx + 4.5}
                y2={cy + 4.5}
                stroke={COLOR_INK}
                strokeWidth={2.1}
                strokeLinecap="round"
              />
              <line
                x1={cx + 4.5}
                y1={cy - 4.5}
                x2={cx - 4.5}
                y2={cy + 4.5}
                stroke={COLOR_INK}
                strokeWidth={2.1}
                strokeLinecap="round"
              />
            </g>
          ) : rules.pitchMark === "slash_swing" ? (
            <line
              x1={cx - 5.0}
              y1={cy + 4.2}
              x2={cx + 5.0}
              y2={cy - 4.2}
              stroke={COLOR_INK}
              strokeWidth={2.1}
              strokeLinecap="round"
            />
          ) : (
            <circle cx={cx} cy={cy} r={4.7} fill={COLOR_INK} />
          )
        ) : p === "ball" ? (
          rules.pitchMark === "slash_swing" ||
          rules.pitchMark === "cross_dot_swing" ? (
            <circle cx={cx} cy={cy} r={2.5} fill={COLOR_INK} />
          ) : (
            <line
              x1={cx - 5.6}
              y1={cy}
              x2={cx + 5.6}
              y2={cy}
              stroke={COLOR_INK}
              strokeWidth={2.2}
              strokeLinecap="round"
            />
          )
        ) : p === "foul" ? (
          <polygon
            points={`${cx},${cy - 4.8} ${cx - 5.2},${cy + 4.2} ${cx + 5.2},${cy + 4.2}`}
            fill="none"
            stroke={COLOR_INK}
            strokeWidth={1.85}
          />
        ) : p === "bunt_foul" ? (
          rules.buntPitchMark === "v_dot_circle_dot" ? (
            <g>
              <polyline
                points={`${cx - 5.0},${cy - 4.0} ${cx},${cy + 4.6} ${cx + 5.0},${cy - 4.0}`}
                fill="none"
                stroke={COLOR_INK}
                strokeWidth={1.9}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx={cx} cy={cy - 1.5} r={1.6} fill={COLOR_INK} />
            </g>
          ) : rules.buntPitchMark === "inv_triangle_diamond" ? (
            <polygon
              points={`${cx},${cy + 4.8} ${cx - 5.2},${cy - 4.2} ${cx + 5.2},${cy - 4.2}`}
              fill="none"
              stroke={COLOR_INK}
              strokeWidth={1.85}
            />
          ) : rules.buntPitchMark === "same_as_normal" ? (
            <polygon
              points={`${cx},${cy - 4.8} ${cx - 5.2},${cy + 4.2} ${cx + 5.2},${cy + 4.2}`}
              fill="none"
              stroke={COLOR_INK}
              strokeWidth={1.85}
            />
          ) : (
            <polygon
              points={`${cx},${cy - 4.8} ${cx - 5.2},${cy + 4.2} ${cx + 5.2},${cy + 4.2}`}
              fill={COLOR_INK}
            />
          )
        ) : p === "balk" ? (
          <text
            x={cx}
            y={cy + 3.5}
            fontSize={9.5}
            fontWeight={900}
            textAnchor="middle"
            fill={COLOR_RED}
          >
            BK
          </text>
        ) : rules.pickoffMark === "kanji_num" ? (
          <text
            x={cx}
            y={cy + 3.5}
            fontSize={9.0}
            fontWeight={900}
            textAnchor="middle"
            fill={COLOR_BLUE}
          >
            {item.symbolHint}
          </text>
        ) : rules.pickoffMark === "full_arrow" ? (
          p === "pickoff_2b" ? (
            <g
              fill="none"
              stroke={COLOR_INK}
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1={cx} y1={cy + 5} x2={cx} y2={cy - 4.5} />
              <polyline
                points={`${cx - 3.8},${cy - 0.8} ${cx},${cy - 5} ${cx + 3.8},${cy - 0.8}`}
              />
            </g>
          ) : p === "pickoff_3b" ? (
            <g
              fill="none"
              stroke={COLOR_INK}
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1={cx + 5.2} y1={cy} x2={cx - 4.8} y2={cy} />
              <polyline
                points={`${cx - 0.8},${cy - 3.8} ${cx - 5.2},${cy} ${cx - 0.8},${cy + 3.8}`}
              />
            </g>
          ) : (
            <g
              fill="none"
              stroke={COLOR_INK}
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1={cx - 5.2} y1={cy} x2={cx + 4.8} y2={cy} />
              <polyline
                points={`${cx + 0.8},${cy - 3.8} ${cx + 5.2},${cy} ${cx + 0.8},${cy + 3.8}`}
              />
            </g>
          )
        ) : p === "pickoff_2b" ? (
          <polyline
            points={`${cx - 4.6},${cy + 3.6} ${cx},${cy - 4.0} ${cx + 4.6},${cy + 3.6}`}
            fill="none"
            stroke={COLOR_INK}
            strokeWidth={2.1}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : p === "pickoff_3b" ? (
          <polyline
            points={`${cx + 4.0},${cy - 4.4} ${cx - 4.0},${cy} ${cx + 4.0},${cy + 4.4}`}
            fill="none"
            stroke={COLOR_INK}
            strokeWidth={2.1}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <polyline
            points={`${cx - 4.0},${cy - 4.4} ${cx + 4.0},${cy} ${cx - 4.0},${cy + 4.4}`}
            fill="none"
            stroke={COLOR_INK}
            strokeWidth={2.1}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </span>
  );
}

export interface ScorebookCellGuideModalProps {
  activeItem: InspectedScorebookCellItem | null;
  navigationItems: InspectedScorebookCellItem[];
  rules: ScorebookSymbolRules;
  onSelectItem: (item: InspectedScorebookCellItem) => void;
  onClose: () => void;
}

export function ScorebookCellGuideModal({
  activeItem,
  navigationItems,
  rules,
  onSelectItem,
  onClose,
}: ScorebookCellGuideModalProps) {
  const scrollBodyRef = useRef<HTMLDivElement | null>(null);

  const activeCellKey = activeItem
    ? `${activeItem.model.isTop ? "T" : "B"}:${activeItem.cell.cellKey}`
    : null;

  useEffect(() => {
    if (!activeItem) return;
    if (scrollBodyRef.current) {
      scrollBodyRef.current.scrollTop = 0;
    }
  }, [activeCellKey, activeItem]);

  useEffect(() => {
    if (!activeItem) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeItem, onClose]);

  const guide = useMemo(() => {
    if (!activeItem) return null;
    return buildScorebookCellGuide(activeItem.cell, activeItem.model, rules);
  }, [activeItem, rules]);

  const currentIndex = useMemo(() => {
    if (!activeItem) return -1;
    return navigationItems.findIndex(
      (it) =>
        it.model.isTop === activeItem.model.isTop &&
        it.cell.cellKey === activeItem.cell.cellKey
    );
  }, [activeItem, navigationItems]);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !activeItem || !guide) {
    return null;
  }

  const prevItem = currentIndex > 0 ? navigationItems[currentIndex - 1] : null;
  const nextItem =
    currentIndex >= 0 && currentIndex + 1 < navigationItems.length
      ? navigationItems[currentIndex + 1]
      : null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${guide.inningText} ${guide.batterOrder}番 ${guide.batterName} スコア記号解説`}
      className="fixed inset-0 z-[9999] bg-slate-950/75 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full sm:max-w-lg max-h-[88dvh] rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col">
        {/* ━━━ A-3 上帯ダークキャップ（グラデーション・ブラー完全排除） ━━━ */}
        <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-black leading-tight">
                <BookOpen className="w-3 h-3 shrink-0" />
                <span>スコア1マス解説</span>
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 text-[10px] font-black font-mono">
                {guide.inningText}
              </span>
              <span className="text-[11px] font-bold text-slate-300 truncate">
                {guide.teamAttackText}
              </span>
            </div>

            <div className="flex items-baseline gap-1.5 flex-wrap pt-0.5">
              <span className="text-xs font-mono font-black text-amber-400">
                {guide.batterOrder}番
              </span>
              <span className="text-sm font-black text-white truncate">
                {guide.batterName}
              </span>
              {guide.batterUniformNumber && (
                <span className="text-[11px] font-mono font-bold text-slate-300">
                  #{guide.batterUniformNumber}
                </span>
              )}
              {guide.pitcherName && (
                <span className="text-[11px] font-bold text-slate-400 truncate">
                  vs {guide.pitcherName}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="解説を閉じる"
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 flex items-center justify-center shrink-0 cursor-pointer active:scale-95 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ━━━ 上段ヒーロー：拡大1マスSVG ＋ 打席サマリー ━━━ */}
        <div className="bg-muted/45 border-b border-border px-3.5 py-3 flex items-center gap-3.5 shrink-0">
          <div className="rounded-xl border border-slate-300 bg-[#fffefb] p-1.5 shadow-2xs shrink-0">
            <ScorebookSingleCellThumbnail
              cell={activeItem.cell}
              rules={rules}
              showLeftOutsideSub
              className="h-[88px] w-auto"
            />
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-primary text-primary-foreground text-xs font-black leading-snug">
                {guide.headlineResult}
              </span>
              {guide.rbi > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-rose-600 text-white text-[11px] font-black leading-snug">
                  {guide.rbi}打点
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="px-2 py-0.5 rounded-md bg-card border border-border text-[10px] font-mono font-black text-foreground">
                {guide.pitchSummaryBadge}
              </span>
              {guide.resultDecoratorLabel && (
                <span className="px-2 py-0.5 rounded-md bg-card border border-border text-[10px] font-bold text-muted-foreground">
                  {guide.resultDecoratorLabel}
                </span>
              )}
            </div>

            <p className="text-[10px] font-bold text-muted-foreground leading-relaxed">
              マスの「①左列＝配球」「②右下＝打撃結果」「③中央ダイヤ＝進塁・アウト」の順に読むと内容がひと目でわかります。
            </p>
          </div>
        </div>

        {/* ━━━ スクロール解説エリア（①配球 / ②打席結果・守備番号 / ③ダイヤ・進塁・アウト） ━━━ */}
        <div
          ref={scrollBodyRef}
          className={cn(
            "flex-1 overflow-y-auto overscroll-contain p-3.5 space-y-3.5 bg-card",
            navigationItems.length <= 1 &&
              "pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5"
          )}
        >
          {/* ① 左列：配球記号 */}
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-3 py-2 bg-muted/60 border-b border-border flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-xs font-black text-foreground">
                <CircleDot className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>① 左列：配球記号（上から1球順）</span>
              </h3>
              <span className="text-[10px] font-mono font-bold text-muted-foreground">
                {guide.pitchSummaryBadge}
              </span>
            </div>

            <div className="p-2.5 space-y-2">
              {guide.pitchEmptyNote && (
                <div className="rounded-lg bg-muted/45 border border-border px-2.5 py-2 text-[11px] font-bold text-foreground leading-relaxed">
                  {guide.pitchEmptyNote}
                </div>
              )}

              {guide.pitches.length > 0 && (
                <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                  {guide.pitches.map((pItem) => (
                    <div
                      key={`pitch-step-${pItem.stepIndex}`}
                      className="px-2.5 py-2 bg-card flex items-start gap-2.5"
                    >
                      <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                        <span className="w-9 text-[10px] font-mono font-black text-muted-foreground text-center">
                          {pItem.pitchNumber !== null
                            ? `${pItem.pitchNumber}球目`
                            : "牽制等"}
                        </span>
                        <ScorebookPitchGlyphBadge item={pItem} rules={rules} />
                      </div>

                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-xs font-black text-foreground">
                            {pItem.title}
                          </span>
                          {pItem.countText && (
                            <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono font-black text-foreground shrink-0">
                              {pItem.countText}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-medium text-muted-foreground leading-snug">
                          {pItem.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ② 右下：打席結果・守備番号 */}
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-3 py-2 bg-muted/60 border-b border-border flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-xs font-black text-foreground">
                <Compass className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>② 右下：打席結果・守備番号</span>
              </h3>
              {guide.resultNotationMain && (
                <span className="px-1.5 py-0.5 rounded bg-[#fffefb] border border-slate-300 font-mono text-[10px] font-black text-slate-900">
                  {guide.resultNotationMain}
                  {guide.resultNotationSub ? ` ${guide.resultNotationSub}` : ""}
                </span>
              )}
            </div>

            <div className="divide-y divide-border">
              {guide.resultRows.map((row, idx) => {
                const badgeCls =
                  row.badgeTone === "red"
                    ? "bg-rose-600 text-white border-rose-600"
                    : row.badgeTone === "blue"
                    ? "bg-sky-600 text-white border-sky-600"
                    : row.badgeTone === "amber"
                    ? "bg-amber-500 text-slate-950 border-amber-500"
                    : "bg-[#0f172a] text-white border-[#0f172a]";

                return (
                  <div
                    key={`res-row-${idx}`}
                    className="p-2.5 flex items-start gap-2.5"
                  >
                    <span
                      className={cn(
                        "min-w-[2.75rem] px-2 py-1 rounded-lg border font-mono text-[11px] font-black text-center leading-tight shrink-0 mt-0.5",
                        badgeCls
                      )}
                    >
                      {row.badge}
                    </span>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="text-xs font-black text-foreground leading-snug">
                        {row.title}
                      </p>
                      <p className="text-[11px] font-medium text-muted-foreground leading-relaxed">
                        {row.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ③ ダイヤモンド・中央：進塁・得点・アウト */}
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-3 py-2 bg-muted/60 border-b border-border flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-xs font-black text-foreground">
                <Diamond className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>③ ダイヤモンド・中央：進塁・得点・アウト</span>
              </h3>
            </div>

            <div className="divide-y divide-border">
              {guide.diamondRows.map((row, idx) => {
                const symCls =
                  row.tone === "red"
                    ? "bg-rose-50 text-rose-700 border-rose-300"
                    : row.tone === "blue"
                    ? "bg-sky-50 text-sky-700 border-sky-300"
                    : row.tone === "muted"
                    ? "bg-slate-100 text-slate-600 border-slate-300"
                    : "bg-[#fffefb] text-slate-900 border-slate-300";

                return (
                  <div
                    key={`dia-row-${idx}`}
                    className="p-2.5 flex items-start gap-2.5"
                  >
                    <div className="w-[4.75rem] shrink-0 flex flex-col items-center gap-1 pt-0.5">
                      <span className="text-[9px] font-black text-muted-foreground leading-none">
                        {row.zoneLabel}
                      </span>
                      <span
                        className={cn(
                          "w-full px-1.5 py-1 rounded-lg border font-mono text-[11px] font-black text-center leading-tight",
                          symCls
                        )}
                      >
                        {row.symbolText}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="text-xs font-black text-foreground leading-snug">
                        {row.title}
                      </p>
                      <p className="text-[11px] font-medium text-muted-foreground leading-relaxed">
                        {row.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* ━━━ 下段ナビバー：前後のマスへワンタップ移動 ━━━ */}
        {navigationItems.length > 1 && (
          <div className="bg-card border-t border-border px-3.5 py-2.5 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-2.5 flex items-center justify-between gap-2 shrink-0">
            <button
              type="button"
              disabled={!prevItem}
              onClick={() => prevItem && onSelectItem(prevItem)}
              className="h-9 px-3 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-xs font-black inline-flex items-center gap-1 cursor-pointer active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4 text-primary shrink-0" />
              <span>前のマス</span>
            </button>

            <span className="text-[11px] font-mono tabular-nums font-black text-muted-foreground">
              {currentIndex >= 0
                ? `${currentIndex + 1} / ${navigationItems.length}`
                : `${navigationItems.length}マス`}
            </span>

            <button
              type="button"
              disabled={!nextItem}
              onClick={() => nextItem && onSelectItem(nextItem)}
              className="h-9 px-3 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-xs font-black inline-flex items-center gap-1 cursor-pointer active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>次のマス</span>
              <ChevronRight className="w-4 h-4 text-primary shrink-0" />
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
