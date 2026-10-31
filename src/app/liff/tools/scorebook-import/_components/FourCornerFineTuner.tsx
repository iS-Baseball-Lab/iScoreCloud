// filepath: src/app/liff/tools/scorebook-import/_components/FourCornerFineTuner.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ZoomIn,
  Crosshair,
} from "lucide-react";
import { bilinearGridPoint, clamp1000 } from "@/lib/liff/scorebook-grid";
import type {
  NormalizedPoint,
  ScorebookGridCorners,
} from "@/types/scorebook-v2";

export type CornerKey = keyof ScorebookGridCorners;

export const CORNER_ITEMS: ReadonlyArray<{
  key: CornerKey;
  label: string;
  shortArrow: string;
}> = [
  { key: "tl", label: "左上", shortArrow: "↖" },
  { key: "tr", label: "右上", shortArrow: "↗" },
  { key: "bl", label: "左下", shortArrow: "↙" },
  { key: "br", label: "右下", shortArrow: "↘" },
];

export function clampSingleCornerInQuad(
  corners: ScorebookGridCorners,
  key: CornerKey,
  rawX: number,
  rawY: number,
  minGapX = 100,
  minGapY = 130
): NormalizedPoint {
  const nx = clamp1000(rawX);
  const ny = clamp1000(rawY);
  if (key === "tl") {
    return [
      Math.max(0, Math.min(nx, corners.tr[0] - minGapX)),
      Math.max(0, Math.min(ny, corners.bl[1] - minGapY)),
    ];
  }
  if (key === "tr") {
    return [
      Math.min(1000, Math.max(nx, corners.tl[0] + minGapX)),
      Math.max(0, Math.min(ny, corners.br[1] - minGapY)),
    ];
  }
  if (key === "br") {
    return [
      Math.min(1000, Math.max(nx, corners.bl[0] + minGapX)),
      Math.min(1000, Math.max(ny, corners.tr[1] + minGapY)),
    ];
  }
  return [
    Math.max(0, Math.min(nx, corners.br[0] - minGapX)),
    Math.min(1000, Math.max(ny, corners.tl[1] + minGapY)),
  ];
}

function getCornerAxisBounds(
  corners: ScorebookGridCorners,
  key: CornerKey,
  minGapX: number,
  minGapY: number
): { minX: number; maxX: number; minY: number; maxY: number } {
  if (key === "tl") {
    return {
      minX: 0,
      maxX: Math.max(0, corners.tr[0] - minGapX),
      minY: 0,
      maxY: Math.max(0, corners.bl[1] - minGapY),
    };
  }
  if (key === "tr") {
    return {
      minX: Math.min(1000, corners.tl[0] + minGapX),
      maxX: 1000,
      minY: 0,
      maxY: Math.max(0, corners.br[1] - minGapY),
    };
  }
  if (key === "br") {
    return {
      minX: Math.min(1000, corners.bl[0] + minGapX),
      maxX: 1000,
      minY: Math.min(1000, corners.tr[1] + minGapY),
      maxY: 1000,
    };
  }
  return {
    minX: 0,
    maxX: Math.max(0, corners.br[0] - minGapX),
    minY: Math.min(1000, corners.tl[1] + minGapY),
    maxY: 1000,
  };
}

interface RepeatStepButtonProps {
  onStep: () => void;
  disabled?: boolean;
  ariaLabel: string;
  children: React.ReactNode;
}

function RepeatStepButton({
  onStep,
  disabled = false,
  ariaLabel,
  children,
}: RepeatStepButtonProps) {
  const stepCallbackRef = useRef(onStep);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    stepCallbackRef.current = onStep;
  }, [onStep]);

  const stopRepeat = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => stopRepeat, []);

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      onPointerDown={(e) => {
        if (disabled) return;
        e.preventDefault();
        stopRepeat();
        stepCallbackRef.current();
        timeoutRef.current = setTimeout(() => {
          intervalRef.current = setInterval(() => {
            stepCallbackRef.current();
          }, 75);
        }, 320);
      }}
      onPointerUp={stopRepeat}
      onPointerLeave={stopRepeat}
      onPointerCancel={stopRepeat}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          stepCallbackRef.current();
        }
      }}
      className="h-9 px-2 rounded-xl bg-card hover:bg-muted border border-border text-[10px] font-black text-foreground flex items-center justify-center gap-0.5 shrink-0 active:scale-95 transition-transform select-none touch-manipulation cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

interface GraduatedAxisScaleProps {
  axisLabel: string;
  negHint: string;
  posHint: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  isVerticalAxis?: boolean;
  onChange: (nextVal: number) => void;
}

function GraduatedAxisScale({
  axisLabel,
  negHint,
  posHint,
  value,
  min,
  max,
  disabled = false,
  isVerticalAxis = false,
  onChange,
}: GraduatedAxisScaleProps) {
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startVal: number;
    lockedAxis: "h" | "v" | null;
  } | null>(null);
  const [isSliding, setIsSliding] = useState(false);

  const clampAxis = (v: number): number =>
    Math.max(min, Math.min(max, Math.round(v)));

  // 1目盛り = 5px の高分解能スライド感度（指を少し転がすだけで1目盛り=0.1%ずつピタッと合う）
  const PX_PER_UNIT = 5;
  const VISIBLE_HALF_UNITS = 26;

  const startTick = Math.max(min, value - VISIBLE_HALF_UNITS);
  const endTick = Math.min(max, value + VISIBLE_HALF_UNITS);
  const ticks: number[] = [];
  for (let v = startTick; v <= endTick; v++) {
    ticks.push(v);
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <span className="text-[10px] font-black text-foreground">
          {axisLabel}
        </span>
        <div className="flex items-center gap-1.5 text-[10px] font-black tabular-nums">
          <span className="text-muted-foreground">
            {negHint} ⇄ {posHint}
          </span>
          <span className="px-1.5 py-0.5 rounded-md bg-slate-900 text-amber-300 border border-slate-700">
            {value}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <RepeatStepButton
          disabled={disabled || value <= min}
          ariaLabel={`${axisLabel}を5目盛り${negHint}へ`}
          onStep={() => onChange(clampAxis(value - 5))}
        >
          {isVerticalAxis ? (
            <ArrowUp className="w-3 h-3 text-sky-600 dark:text-sky-400" />
          ) : (
            <ArrowLeft className="w-3 h-3 text-sky-600 dark:text-sky-400" />
          )}
          <span>5</span>
        </RepeatStepButton>

        <RepeatStepButton
          disabled={disabled || value <= min}
          ariaLabel={`${axisLabel}を1目盛り${negHint}へ`}
          onStep={() => onChange(clampAxis(value - 1))}
        >
          {isVerticalAxis ? (
            <ArrowUp className="w-3 h-3 text-amber-600 dark:text-amber-400" />
          ) : (
            <ArrowLeft className="w-3 h-3 text-amber-600 dark:text-amber-400" />
          )}
          <span>1</span>
        </RepeatStepButton>

        {/* 目盛りルーラー本体（横スライドで1目盛り=0.1%ずつ精密移動、縦スクロールは阻害しない touch-pan-y） */}
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={`${axisLabel}の目盛りスライダー`}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
              e.preventDefault();
              onChange(clampAxis(value - 1));
            } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
              e.preventDefault();
              onChange(clampAxis(value + 1));
            }
          }}
          onPointerDown={(e) => {
            if (disabled) return;
            dragStateRef.current = {
              pointerId: e.pointerId,
              startX: e.clientX,
              startY: e.clientY,
              startVal: value,
              lockedAxis: null,
            };
          }}
          onPointerMove={(e) => {
            const st = dragStateRef.current;
            if (!st || st.pointerId !== e.pointerId) return;
            const dx = e.clientX - st.startX;
            const dy = e.clientY - st.startY;

            if (st.lockedAxis === null) {
              if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
              if (Math.abs(dy) > Math.abs(dx) * 1.15) {
                st.lockedAxis = "v";
                dragStateRef.current = null;
                setIsSliding(false);
                return;
              }
              st.lockedAxis = "h";
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                // ignore pointer capture error
              }
              setIsSliding(true);
            }

            if (st.lockedAxis === "h") {
              e.preventDefault();
              const deltaUnits = Math.round(dx / PX_PER_UNIT);
              onChange(clampAxis(st.startVal + deltaUnits));
            }
          }}
          onPointerUp={(e) => {
            const st = dragStateRef.current;
            if (st && st.pointerId === e.pointerId) {
              if (st.lockedAxis === "h") {
                try {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                } catch {
                  // ignore
                }
              }
              dragStateRef.current = null;
              setIsSliding(false);
            }
          }}
          onPointerCancel={() => {
            dragStateRef.current = null;
            setIsSliding(false);
          }}
          className={`relative flex-1 min-w-0 h-9 rounded-xl bg-slate-950 border overflow-hidden select-none touch-pan-y cursor-ew-resize transition-colors ${
            isSliding
              ? "border-amber-400 ring-2 ring-amber-400/35"
              : "border-slate-700"
          } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
        >
          {/* 目盛り線と10刻みの数値ラベル */}
          <div className="absolute inset-0 pointer-events-none">
            {ticks.map((t) => {
              const offsetPx = (t - value) * PX_PER_UNIT;
              const isMajor = t % 10 === 0;
              const isMid = !isMajor && t % 5 === 0;
              return (
                <div
                  key={t}
                  style={{
                    left: `calc(50% + ${offsetPx}px)`,
                  }}
                  className="absolute bottom-0 top-0 -translate-x-1/2 flex flex-col items-center justify-end"
                >
                  {isMajor && (
                    <span className="text-[8px] font-black text-slate-300 leading-none mb-0.5 tabular-nums">
                      {t}
                    </span>
                  )}
                  <div
                    className={
                      isMajor
                        ? "w-[1.5px] h-3.5 bg-slate-200"
                        : isMid
                        ? "w-px h-2.5 bg-slate-400"
                        : "w-px h-1.5 bg-slate-600"
                    }
                  />
                </div>
              );
            })}
          </div>

          {/* 中央の固定アンバー指針（▼＋縦ヘアライン） */}
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 pointer-events-none flex flex-col items-center justify-between z-10">
            <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-amber-400" />
            <div className="w-[2px] flex-1 bg-amber-400/90" />
          </div>

          {/* 左右端のフェードで目盛りの視認性を向上 */}
          <div className="absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-slate-950 to-transparent pointer-events-none" />
          <div className="absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-slate-950 to-transparent pointer-events-none" />
        </div>

        <RepeatStepButton
          disabled={disabled || value >= max}
          ariaLabel={`${axisLabel}を1目盛り${posHint}へ`}
          onStep={() => onChange(clampAxis(value + 1))}
        >
          <span>1</span>
          {isVerticalAxis ? (
            <ArrowDown className="w-3 h-3 text-amber-600 dark:text-amber-400" />
          ) : (
            <ArrowRight className="w-3 h-3 text-amber-600 dark:text-amber-400" />
          )}
        </RepeatStepButton>

        <RepeatStepButton
          disabled={disabled || value >= max}
          ariaLabel={`${axisLabel}を5目盛り${posHint}へ`}
          onStep={() => onChange(clampAxis(value + 5))}
        >
          <span>5</span>
          {isVerticalAxis ? (
            <ArrowDown className="w-3 h-3 text-sky-600 dark:text-sky-400" />
          ) : (
            <ArrowRight className="w-3 h-3 text-sky-600 dark:text-sky-400" />
          )}
        </RepeatStepButton>
      </div>
    </div>
  );
}

interface FourCornerFineTunerProps {
  previewUrl: string;
  corners: ScorebookGridCorners;
  selectedCorner: CornerKey;
  onSelectCorner: (key: CornerKey) => void;
  onChangeCorner: (key: CornerKey, nextPoint: NormalizedPoint) => void;
  minGapX?: number;
  minGapY?: number;
  disabled?: boolean;
  accentColor?: "sky" | "indigo";
  targetDescription?: string;
}

export function FourCornerFineTuner({
  previewUrl,
  corners,
  selectedCorner,
  onSelectCorner,
  onChangeCorner,
  minGapX = 100,
  minGapY = 130,
  disabled = false,
  accentColor = "sky",
  targetDescription = "スコアブックの角",
}: FourCornerFineTunerProps) {
  const [imgAspect, setImgAspect] = useState<number>(1.33);
  const [highZoom, setHighZoom] = useState<boolean>(false);

  const activePoint = corners[selectedCorner];
  const activeMeta =
    CORNER_ITEMS.find((c) => c.key === selectedCorner) || CORNER_ITEMS[0];
  const bounds = getCornerAxisBounds(
    corners,
    selectedCorner,
    minGapX,
    minGapY
  );

  // 正方形ルーペ内で画像の縦横比が歪まないよう naturalWidth / naturalHeight に合わせて viewBox 範囲を計算
  const halfSpanX = highZoom ? 28 : 54;
  const halfSpanY = Math.max(18, Math.round(halfSpanX * imgAspect));
  const polyPoints = `${corners.tl[0]},${corners.tl[1]} ${corners.tr[0]},${corners.tr[1]} ${corners.br[0]},${corners.br[1]} ${corners.bl[0]},${corners.bl[1]}`;

  const strokeHex = accentColor === "indigo" ? "#38bdf8" : "#0ea5e9";

  return (
    <div className="p-2.5 rounded-2xl bg-muted/60 border border-border space-y-2.5">
      {/* 1. 4点切替セレクター（シートの左上・右上・左下・右下と空間一致する2×2配置） */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-black text-foreground flex items-center gap-1">
            <Crosshair className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>微調整する角を選択（4点すべて上下・左右に対応）</span>
          </span>
          <span className="text-[9px] font-bold text-muted-foreground shrink-0">
            1目盛り = 0.1%
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          {CORNER_ITEMS.map((item) => {
            const pt = corners[item.key];
            const isSelected = selectedCorner === item.key;
            return (
              <button
                key={item.key}
                type="button"
                disabled={disabled}
                onClick={() => onSelectCorner(item.key)}
                className={`py-1.5 px-2.5 rounded-xl border text-[11px] font-black flex items-center justify-between gap-1.5 transition-all cursor-pointer active:scale-98 ${
                  isSelected
                    ? "bg-amber-500 text-white border-amber-500 shadow-2xs"
                    : "bg-card hover:bg-muted text-foreground border-border"
                }`}
              >
                <span className="flex items-center gap-1">
                  <span>{item.shortArrow}</span>
                  <span>{item.label}</span>
                </span>
                <span
                  className={`text-[9px] font-bold tabular-nums ${
                    isSelected ? "text-white/95" : "text-muted-foreground"
                  }`}
                >
                  X:{pt[0]} Y:{pt[1]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. 指で隠れない「選択中の角の拡大ルーペ（×4 / ×8 切替・十字目盛り付き）」 */}
      <div className="p-2 rounded-xl bg-card border border-border flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => setHighZoom((prev) => !prev)}
          title="タップで拡大倍率（×4 / ×8）を切り替え"
          className="relative w-20 h-20 rounded-xl overflow-hidden bg-slate-950 border-2 border-amber-500 shrink-0 cursor-pointer group"
        >
          {/* 画像本来の縦横比を取得する軽量非表示img */}
          <img
            src={previewUrl}
            alt=""
            aria-hidden="true"
            onLoad={(e) => {
              const w = e.currentTarget.naturalWidth;
              const h = e.currentTarget.naturalHeight;
              if (w > 0 && h > 0) {
                setImgAspect(w / h);
              }
            }}
            className="hidden"
          />

          <svg
            viewBox={`${activePoint[0] - halfSpanX} ${
              activePoint[1] - halfSpanY
            } ${halfSpanX * 2} ${halfSpanY * 2}`}
            preserveAspectRatio="none"
            className="w-full h-full block pointer-events-none"
          >
            <rect
              x={-1000}
              y={-1000}
              width={3000}
              height={3000}
              fill="#020617"
            />
            <image
              href={previewUrl}
              x={0}
              y={0}
              width={1000}
              height={1000}
              preserveAspectRatio="none"
            />

            {/* 補正枠エッジと内部補助線 */}
            <polygon
              points={polyPoints}
              fill="rgba(14, 165, 233, 0.10)"
              stroke={strokeHex}
              strokeWidth={highZoom ? 1.1 : 1.8}
            />
            {[0.25, 0.5, 0.75].map((r) => {
              const hL = bilinearGridPoint(corners, 0, r);
              const hR = bilinearGridPoint(corners, 1, r);
              const vT = bilinearGridPoint(corners, r, 0);
              const vB = bilinearGridPoint(corners, r, 1);
              return (
                <g key={r}>
                  <line
                    x1={hL[0]}
                    y1={hL[1]}
                    x2={hR[0]}
                    y2={hR[1]}
                    stroke="rgba(56, 189, 248, 0.55)"
                    strokeWidth={highZoom ? 0.7 : 1.1}
                    strokeDasharray="3 2"
                  />
                  <line
                    x1={vT[0]}
                    y1={vT[1]}
                    x2={vB[0]}
                    y2={vB[1]}
                    stroke="rgba(56, 189, 248, 0.55)"
                    strokeWidth={highZoom ? 0.7 : 1.1}
                    strokeDasharray="3 2"
                  />
                </g>
              );
            })}

            {/* 中心の精密十字レティクル */}
            <line
              x1={activePoint[0] - halfSpanX}
              y1={activePoint[1]}
              x2={activePoint[0] + halfSpanX}
              y2={activePoint[1]}
              stroke="#f59e0b"
              strokeWidth={highZoom ? 0.7 : 1.2}
              strokeDasharray="2.5 2"
            />
            <line
              x1={activePoint[0]}
              y1={activePoint[1] - halfSpanY}
              x2={activePoint[0]}
              y2={activePoint[1] + halfSpanY}
              stroke="#f59e0b"
              strokeWidth={highZoom ? 0.7 : 1.2}
              strokeDasharray="2.5 2"
            />
            <circle
              cx={activePoint[0]}
              cy={activePoint[1]}
              r={highZoom ? 2.2 : 3.8}
              fill="none"
              stroke="#fbbf24"
              strokeWidth={highZoom ? 0.9 : 1.5}
            />
          </svg>

          <span className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-slate-950/90 text-amber-300 text-[8px] font-black flex items-center gap-0.5 border border-slate-700">
            <ZoomIn className="w-2.5 h-2.5" />
            <span>{highZoom ? "×8" : "×4"}</span>
          </span>
        </button>

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="px-2 py-0.5 rounded-md bg-amber-500 text-white text-[10px] font-black">
              {activeMeta.shortArrow} {activeMeta.label}を微調整中
            </span>
            <span className="text-[9px] font-bold text-muted-foreground">
              ルーペタップで×4/×8切替
            </span>
          </div>
          <p className="text-[10px] font-bold text-muted-foreground leading-relaxed">
            左の拡大ルーペの中心（黄色の十字）が<strong>{targetDescription}</strong>にピタリと重なるよう、下の目盛りをスライドまたは「1・5」ボタンで微調整してください。
          </p>
        </div>
      </div>

      {/* 3. 左右（横位置 X）＆ 上下（縦位置 Y）の精密目盛りバー */}
      <div className="space-y-2">
        <GraduatedAxisScale
          axisLabel={`${activeMeta.label}の左右（横位置）`}
          negHint="左"
          posHint="右"
          value={activePoint[0]}
          min={bounds.minX}
          max={bounds.maxX}
          disabled={disabled}
          onChange={(nextX) =>
            onChangeCorner(
              selectedCorner,
              clampSingleCornerInQuad(
                corners,
                selectedCorner,
                nextX,
                activePoint[1],
                minGapX,
                minGapY
              )
            )
          }
        />

        <GraduatedAxisScale
          axisLabel={`${activeMeta.label}の上下（縦位置）`}
          negHint="上"
          posHint="下"
          value={activePoint[1]}
          min={bounds.minY}
          max={bounds.maxY}
          disabled={disabled}
          isVerticalAxis
          onChange={(nextY) =>
            onChangeCorner(
              selectedCorner,
              clampSingleCornerInQuad(
                corners,
                selectedCorner,
                activePoint[0],
                nextY,
                minGapX,
                minGapY
              )
            )
          }
        />
      </div>
    </div>
  );
}

