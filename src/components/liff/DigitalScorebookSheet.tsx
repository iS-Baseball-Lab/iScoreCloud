// filepath: src/components/liff/DigitalScorebookSheet.tsx
"use client";

import React from "react";
import {
  isNonPitchMoundEvent,
  type CanonicalPitchResult,
} from "@/types/scorebook-v2";
import {
  formatAdvanceMethodByRules,
  formatAtBatPlayNotation,
  formatOutOrdinalText,
  formatPositionByRules,
  type FormattedPlayNotation,
  type ScorebookNotationMode,
  type ScorebookSymbolRules,
} from "@/lib/liff/scorebook-symbol-rules";
import {
  formatSubstitutionRoleShort,
  type BaseSegmentIndex,
  type CompiledDiamondSegment,
  type CompiledScorebookCell,
  type CompiledScorebookSheetModel,
  type ScorebookMatchHeaderMeta,
} from "@/lib/liff/scorebook-renderer-model";

const FONT_SANS =
  "'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Meiryo', system-ui, -apple-system, sans-serif";
const FONT_MONO =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

const COLOR_PAPER = "#fffefb";
const COLOR_PAPER_SUB = "#f8fafc";
const COLOR_FRAME = "#1e293b";
const COLOR_GRID = "#64748b";
const COLOR_GRID_LIGHT = "#cbd5e1";
const COLOR_INK = "#0f172a";
const COLOR_MUTED = "#475569";
const COLOR_RED = "#dc2626";
const COLOR_RED_SOFT = "#fef2f2";
const COLOR_BLUE = "#1d4ed8";
const COLOR_BLUE_SOFT = "#eff6ff";

const CELL_W = 88;
const CELL_H = 74;
const BSO_W = 18;

// 1マス内ダイヤモンド頂点座標
const PT_HP = { x: 52, y: 55 };
const PT_1B = { x: 74, y: 34 };
const PT_2B = { x: 52, y: 13 };
const PT_3B = { x: 30, y: 34 };
const PT_CENTER = { x: 52, y: 34 };

const SEGMENT_ENDPOINTS: Record<
  BaseSegmentIndex,
  {
    from: { x: number; y: number };
    to: { x: number; y: number };
    labelPos: { x: number; y: number };
  }
> = {
  1: { from: PT_HP, to: PT_1B, labelPos: { x: 69, y: 49 } },
  2: { from: PT_1B, to: PT_2B, labelPos: { x: 70, y: 18 } },
  3: { from: PT_2B, to: PT_3B, labelPos: { x: 34, y: 18 } },
  4: { from: PT_3B, to: PT_HP, labelPos: { x: 33, y: 49 } },
};

function renderPitchColumn(
  pitches: CanonicalPitchResult[],
  rules: ScorebookSymbolRules,
  originX: number,
  originY: number
): React.ReactNode {
  if (rules.pitchMark === "numbered_bs") {
    const strikeTokens: string[] = [];
    const ballTokens: string[] = [];
    let seq = 0;

    for (const p of pitches) {
      if (isNonPitchMoundEvent(p)) continue;
      if (p === "in_play" || p === "hit" || p === "hbp") continue;
      seq += 1;
      if (p === "ball") {
        ballTokens.push(String(seq));
      } else if (p === "foul" || p === "bunt_foul") {
        strikeTokens.push(`${seq}F`);
      } else {
        strikeTokens.push(String(seq));
      }
    }

    return (
      <g>
        <line
          x1={originX}
          y1={originY + 38}
          x2={originX + BSO_W}
          y2={originY + 38}
          stroke={COLOR_GRID_LIGHT}
          strokeWidth={0.8}
        />
        <text
          x={originX + 3.5}
          y={originY + 9}
          fontSize={6.5}
          fontWeight={800}
          fill={COLOR_MUTED}
          fontFamily={FONT_MONO}
        >
          S
        </text>
        <text
          x={originX + 3.5}
          y={originY + 47}
          fontSize={6.5}
          fontWeight={800}
          fill={COLOR_MUTED}
          fontFamily={FONT_MONO}
        >
          B
        </text>
        {strikeTokens.slice(0, 5).map((tok, i) => (
          <text
            key={`st-${i}`}
            x={originX + BSO_W / 2 + 1.5}
            y={originY + 15 + i * 5.2}
            fontSize={5.8}
            fontWeight={800}
            textAnchor="middle"
            fill={COLOR_INK}
            fontFamily={FONT_MONO}
          >
            {tok}
          </text>
        ))}
        {ballTokens.slice(0, 4).map((tok, i) => (
          <text
            key={`bl-${i}`}
            x={originX + BSO_W / 2 + 1.5}
            y={originY + 53 + i * 5.6}
            fontSize={6}
            fontWeight={800}
            textAnchor="middle"
            fill={COLOR_INK}
            fontFamily={FONT_MONO}
          >
            {tok}
          </text>
        ))}
      </g>
    );
  }

  // 早稲田記号式・×空振り式・斜線空振り式
  const visible = pitches.filter(
    (p) => p !== "in_play" && p !== "hit" && p !== "hbp"
  );
  if (visible.length === 0) return null;

  const maxDraw = visible.slice(0, 10);
  const stepY = Math.min(7.2, 62 / Math.max(1, maxDraw.length));
  const cx = originX + BSO_W / 2;

  return (
    <g>
      {maxDraw.map((p, idx) => {
        const cy = originY + 8.5 + idx * stepY;

        if (p === "strike") {
          return (
            <circle
              key={idx}
              cx={cx}
              cy={cy}
              r={2.5}
              fill="none"
              stroke={COLOR_INK}
              strokeWidth={1.25}
            />
          );
        }
        if (p === "swinging_strike" || p === "bunt_swinging") {
          if (
            rules.pitchMark === "cross_swing" ||
            rules.pitchMark === "cross_dot_swing"
          ) {
            return (
              <g key={idx}>
                <line
                  x1={cx - 2.6}
                  y1={cy - 2.6}
                  x2={cx + 2.6}
                  y2={cy + 2.6}
                  stroke={COLOR_INK}
                  strokeWidth={1.35}
                  strokeLinecap="round"
                />
                <line
                  x1={cx + 2.6}
                  y1={cy - 2.6}
                  x2={cx - 2.6}
                  y2={cy + 2.6}
                  stroke={COLOR_INK}
                  strokeWidth={1.35}
                  strokeLinecap="round"
                />
              </g>
            );
          }
          if (rules.pitchMark === "slash_swing") {
            return (
              <line
                key={idx}
                x1={cx - 3}
                y1={cy + 2.5}
                x2={cx + 3}
                y2={cy - 2.5}
                stroke={COLOR_INK}
                strokeWidth={1.4}
              />
            );
          }
          return <circle key={idx} cx={cx} cy={cy} r={2.6} fill={COLOR_INK} />;
        }
        if (p === "ball") {
          if (
            rules.pitchMark === "slash_swing" ||
            rules.pitchMark === "cross_dot_swing"
          ) {
            return <circle key={idx} cx={cx} cy={cy} r={1.45} fill={COLOR_INK} />;
          }
          return (
            <line
              key={idx}
              x1={cx - 3.2}
              y1={cy}
              x2={cx + 3.2}
              y2={cy}
              stroke={COLOR_INK}
              strokeWidth={1.35}
            />
          );
        }
        if (p === "foul") {
          return (
            <polygon
              key={idx}
              points={`${cx},${cy - 2.7} ${cx - 3},${cy + 2.3} ${cx + 3},${cy + 2.3}`}
              fill="none"
              stroke={COLOR_INK}
              strokeWidth={1.15}
            />
          );
        }
        if (p === "bunt_foul") {
          return (
            <polygon
              key={idx}
              points={`${cx},${cy - 2.7} ${cx - 3},${cy + 2.3} ${cx + 3},${cy + 2.3}`}
              fill={COLOR_INK}
            />
          );
        }
        if (p === "balk") {
          return (
            <text
              key={idx}
              x={cx}
              y={cy + 2}
              fontSize={5.5}
              fontWeight={800}
              textAnchor="middle"
              fill={COLOR_RED}
              fontFamily={FONT_SANS}
            >
              BK
            </text>
          );
        }
        // pickoff
        return (
          <text
            key={idx}
            x={cx}
            y={cy + 2}
            fontSize={5.5}
            fontWeight={800}
            textAnchor="middle"
            fill={COLOR_BLUE}
            fontFamily={FONT_SANS}
          >
            牽
          </text>
        );
      })}
    </g>
  );
}

function renderHitHashMarks(
  hitBases: 1 | 2 | 3 | 4,
  rules: ScorebookSymbolRules,
  ox: number,
  oy: number
): React.ReactNode {
  const color = rules.hitLine === "mono_bold" ? COLOR_INK : COLOR_RED;
  const mx = ox + (PT_HP.x + PT_1B.x) / 2;
  const my = oy + (PT_HP.y + PT_1B.y) / 2;
  // HP->1B 単位ベクトル (0.724, -0.690), 法線 (0.690, 0.724)
  const ux = 0.724;
  const uy = -0.69;
  const nx = 0.69;
  const ny = 0.724;

  const count = hitBases;
  const halfLen = rules.hitLine === "parallel_bars" ? 5.2 : 4.2;
  const spacing = 3.6;
  const offsets: number[] = [];
  for (let i = 0; i < count; i++) {
    offsets.push((i - (count - 1) / 2) * spacing);
  }

  return (
    <g>
      {offsets.map((off, idx) => {
        const cx = mx + ux * off;
        const cy = my + uy * off;
        return (
          <line
            key={idx}
            x1={cx - nx * halfLen}
            y1={cy - ny * halfLen}
            x2={cx + nx * halfLen}
            y2={cy + ny * halfLen}
            stroke={color}
            strokeWidth={rules.hitLine === "parallel_bars" ? 1.9 : 1.5}
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
}

function renderDiamondSegment(
  seg: CompiledDiamondSegment,
  rules: ScorebookSymbolRules,
  ox: number,
  oy: number
): React.ReactNode {
  const geom = SEGMENT_ENDPOINTS[seg.segment];
  const x1 = ox + geom.from.x;
  const y1 = oy + geom.from.y;
  const x2 = ox + geom.to.x;
  const y2 = oy + geom.to.y;

  const hitColor = rules.hitLine === "mono_bold" ? COLOR_INK : COLOR_RED;
  const strokeColor = seg.isBatterHit ? hitColor : COLOR_INK;
  const strokeW = seg.isBatterHit
    ? rules.hitLine === "mono_bold"
      ? 2.8
      : 2.4
    : 1.75;

  const advLabel = !seg.isBatterHit
    ? formatAdvanceMethodByRules(seg.method, rules, seg.drivingBatterOrder)
    : "";

  if (seg.status === "out") {
    const ratio = 0.66;
    const stopX = x1 + (x2 - x1) * ratio;
    const stopY = y1 + (y2 - y1) * ratio;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * 4.2;
    const ny = (dx / len) * 4.2;

    return (
      <g key={`seg-${seg.segment}`}>
        <line
          x1={x1}
          y1={y1}
          x2={stopX}
          y2={stopY}
          stroke={COLOR_INK}
          strokeWidth={1.7}
        />
        <line
          x1={stopX - nx}
          y1={stopY - ny}
          x2={stopX + nx}
          y2={stopY + ny}
          stroke={COLOR_INK}
          strokeWidth={2}
          strokeLinecap="round"
        />
        {advLabel && (
          <text
            x={ox + geom.labelPos.x}
            y={oy + geom.labelPos.y}
            fontSize={7.2}
            fontWeight={800}
            textAnchor="middle"
            fill={COLOR_INK}
            fontFamily={FONT_SANS}
          >
            {advLabel}
          </text>
        )}
      </g>
    );
  }

  return (
    <g key={`seg-${seg.segment}`}>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={strokeColor}
        strokeWidth={strokeW}
        strokeDasharray={seg.method === "tiebreak" ? "3,2" : undefined}
        strokeLinecap="round"
      />
      {seg.segment === 1 &&
        seg.isBatterHit &&
        seg.hitBases !== 0 &&
        renderHitHashMarks(seg.hitBases, rules, ox, oy)}
      {advLabel && (
        <text
          x={ox + geom.labelPos.x}
          y={oy + geom.labelPos.y}
          fontSize={7.2}
          fontWeight={800}
          textAnchor="middle"
          fill={seg.method === "tiebreak" ? COLOR_BLUE : COLOR_INK}
          fontFamily={FONT_SANS}
        >
          {advLabel}
        </text>
      )}
    </g>
  );
}

function renderCenterStatus(
  cell: CompiledScorebookCell,
  rules: ScorebookSymbolRules,
  ox: number,
  oy: number
): React.ReactNode {
  const cx = ox + PT_CENTER.x;
  const cy = oy + PT_CENTER.y;
  const runColor = rules.hitLine === "mono_bold" ? COLOR_INK : COLOR_RED;

  if (cell.runScored) {
    if (rules.runMark === "double_circle") {
      return (
        <g>
          <circle
            cx={cx}
            cy={cy}
            r={7.8}
            fill={COLOR_PAPER}
            stroke={runColor}
            strokeWidth={1.8}
          />
          <circle cx={cx} cy={cy} r={4.2} fill={runColor} />
        </g>
      );
    }
    if (rules.runMark === "kanji_toku") {
      return (
        <g>
          <circle
            cx={cx}
            cy={cy}
            r={8.2}
            fill={COLOR_PAPER}
            stroke={runColor}
            strokeWidth={1.6}
          />
          <text
            x={cx}
            y={cy + 3.5}
            fontSize={9.5}
            fontWeight={900}
            textAnchor="middle"
            fill={runColor}
            fontFamily={FONT_SANS}
          >
            得
          </text>
        </g>
      );
    }
    return <circle cx={cx} cy={cy} r={7.2} fill={runColor} />;
  }

  if (cell.outNumber) {
    const outText = formatOutOrdinalText(cell.outNumber, rules);
    return (
      <text
        x={cx}
        y={cy + 4.5}
        fontSize={13}
        fontWeight={900}
        textAnchor="middle"
        fill={COLOR_INK}
        fontFamily={FONT_SANS}
      >
        {outText}
      </text>
    );
  }

  if (cell.isResidual) {
    return (
      <text
        x={cx}
        y={cy + 4.5}
        fontSize={12.5}
        fontWeight={800}
        fontStyle="italic"
        textAnchor="middle"
        fill={COLOR_MUTED}
        fontFamily={FONT_SANS}
      >
        ℓ
      </text>
    );
  }

  return null;
}

function renderPlayNotation(
  notation: FormattedPlayNotation,
  ox: number,
  oy: number
): React.ReactNode {
  if (!notation.mainText) return null;

  const px = ox + 71;
  const py = oy + 64;
  const ink = notation.isRedInk ? COLOR_RED : COLOR_INK;

  if (notation.decorator === "reverse_k") {
    return (
      <g>
        <g transform={`translate(${px}, ${py}) scale(-1, 1)`}>
          <text
            x={0}
            y={0}
            fontSize={11.5}
            fontWeight={900}
            textAnchor="middle"
            fill={ink}
            fontFamily={FONT_MONO}
          >
            K
          </text>
        </g>
        {notation.subText && (
          <text
            x={px + 9}
            y={py + 1}
            fontSize={6.5}
            fontWeight={800}
            fill={COLOR_MUTED}
            fontFamily={FONT_MONO}
          >
            {notation.subText}
          </text>
        )}
      </g>
    );
  }

  if (notation.decorator === "circle_k") {
    return (
      <g>
        <circle
          cx={px}
          cy={py - 3.8}
          r={6.8}
          fill="none"
          stroke={ink}
          strokeWidth={1.3}
        />
        <text
          x={px}
          y={py}
          fontSize={9.5}
          fontWeight={900}
          textAnchor="middle"
          fill={ink}
          fontFamily={FONT_MONO}
        >
          K
        </text>
        {notation.subText && (
          <text
            x={px + 9.5}
            y={py + 1}
            fontSize={6.3}
            fontWeight={800}
            fill={COLOR_MUTED}
            fontFamily={FONT_MONO}
          >
            {notation.subText}
          </text>
        )}
      </g>
    );
  }

  if (
    notation.decorator === "umbrella" ||
    notation.decorator === "sac_fly_umbrella"
  ) {
    return (
      <g>
        {notation.decorator === "sac_fly_umbrella" && (
          <polygon
            points={`${px},${py - 13.5} ${px + 9.5},${py - 3.8} ${px},${py + 5.5} ${px - 9.5},${py - 3.8}`}
            fill="none"
            stroke={ink}
            strokeWidth={1.1}
          />
        )}
        <path
          d={`M ${px - 6.2} ${py - 8.2} Q ${px} ${py - 13.2} ${px + 6.2} ${py - 8.2}`}
          fill="none"
          stroke={ink}
          strokeWidth={1.4}
          strokeLinecap="round"
        />
        <text
          x={px}
          y={py + 0.5}
          fontSize={9.8}
          fontWeight={900}
          textAnchor="middle"
          fill={ink}
          fontFamily={FONT_MONO}
        >
          {notation.mainText}
        </text>
        {notation.subText && (
          <text
            x={px + 8.5}
            y={py + 0.5}
            fontSize={6.5}
            fontWeight={800}
            fill={COLOR_MUTED}
            fontFamily={FONT_MONO}
          >
            {notation.subText}
          </text>
        )}
      </g>
    );
  }

  if (notation.decorator === "overline") {
    return (
      <g>
        <line
          x1={px - 6}
          y1={py - 9.5}
          x2={px + 6}
          y2={py - 9.5}
          stroke={ink}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
        <text
          x={px}
          y={py + 0.5}
          fontSize={9.8}
          fontWeight={900}
          textAnchor="middle"
          fill={ink}
          fontFamily={FONT_MONO}
        >
          {notation.mainText}
        </text>
      </g>
    );
  }

  if (notation.decorator === "sac_diamond") {
    return (
      <g>
        <polygon
          points={`${px},${py - 12} ${px + 12.5},${py - 3.5} ${px},${py + 5} ${px - 12.5},${py - 3.5}`}
          fill="none"
          stroke={ink}
          strokeWidth={1.15}
        />
        <text
          x={px}
          y={py - 0.5}
          fontSize={8.2}
          fontWeight={900}
          textAnchor="middle"
          fill={ink}
          fontFamily={FONT_MONO}
        >
          {notation.mainText}
        </text>
      </g>
    );
  }

  const fontSize =
    notation.mainText.length >= 5
      ? 7.8
      : notation.mainText.length >= 4
      ? 8.5
      : 9.8;

  return (
    <g>
      <text
        x={px}
        y={py}
        fontSize={fontSize}
        fontWeight={900}
        textAnchor="middle"
        fill={ink}
        fontFamily={FONT_SANS}
      >
        {notation.mainText}
      </text>
      {notation.subText && (
        <text
          x={px}
          y={py + 7.2}
          fontSize={6.2}
          fontWeight={800}
          textAnchor="middle"
          fill={COLOR_MUTED}
          fontFamily={FONT_MONO}
        >
          {notation.subText}
        </text>
      )}
    </g>
  );
}

export function renderSingleScorebookCellSvg(
  cell: CompiledScorebookCell | undefined,
  rules: ScorebookSymbolRules,
  ox: number,
  oy: number
): React.ReactNode {
  const ab = cell?.atBat ?? null;
  const playNotation = ab ? formatAtBatPlayNotation(ab, rules) : null;
  const rbiCount = Math.max(0, ab?.rbi || 0);
  const rbiColor = rules.hitLine === "mono_bold" ? COLOR_INK : COLOR_RED;

  return (
    <g>
      {/* マス外枠 */}
      <rect
        x={ox}
        y={oy}
        width={CELL_W}
        height={CELL_H}
        fill={COLOR_PAPER}
        stroke={COLOR_GRID}
        strokeWidth={0.9}
      />

      {/* 左BSO縦区切り線 */}
      <line
        x1={ox + BSO_W}
        y1={oy}
        x2={ox + BSO_W}
        y2={oy + CELL_H}
        stroke={COLOR_GRID_LIGHT}
        strokeWidth={0.85}
      />

      {/* 事前印刷の点線ダイヤモンド＋4ベース小四角 */}
      <polygon
        points={`${ox + PT_HP.x},${oy + PT_HP.y} ${ox + PT_1B.x},${oy + PT_1B.y} ${ox + PT_2B.x},${oy + PT_2B.y} ${ox + PT_3B.x},${oy + PT_3B.y}`}
        fill="none"
        stroke="#cbd5e1"
        strokeWidth={0.9}
        strokeDasharray="2,2"
      />
      {[PT_HP, PT_1B, PT_2B, PT_3B].map((pt, bIdx) => (
        <rect
          key={bIdx}
          x={ox + pt.x - 1.8}
          y={oy + pt.y - 1.8}
          width={3.6}
          height={3.6}
          fill={COLOR_PAPER}
          stroke="#94a3b8"
          strokeWidth={0.8}
          transform={`rotate(45 ${ox + pt.x} ${oy + pt.y})`}
        />
      ))}

      {/* 途中投手交代の波線マーク（マス上辺） */}
      {cell?.hasPitcherChangeBefore && (
        <g>
          <path
            d={`M ${ox + 1} ${oy + 2.5} q 4 -2.5 8 0 t 8 0 t 8 0 t 8 0 t 8 0 t 8 0 t 8 0 t 8 0 t 8 0 t 8 0 t 6 0`}
            fill="none"
            stroke={COLOR_BLUE}
            strokeWidth={1.6}
          />
        </g>
      )}

      {/* 投球履歴 (BSO) */}
      {ab && renderPitchColumn(ab.pitches, rules, ox, oy)}

      {/* ダイヤモンド進塁線 (1〜4区間) */}
      {cell &&
        ([1, 2, 3, 4] as const).map((segIdx) => {
          const seg = cell.segments[segIdx];
          if (!seg) return null;
          return renderDiamondSegment(seg, rules, ox, oy);
        })}

      {/* 中央ステータス（●得点 / ⅠⅡⅢ・①②③アウト / ℓ残塁） */}
      {cell && renderCenterStatus(cell, rules, ox, oy)}

      {/* 右上：打点ドット表示 */}
      {rbiCount > 0 && (
        <g>
          {Array.from({ length: Math.min(4, rbiCount) }).map((_, i) => (
            <circle
              key={i}
              cx={ox + CELL_W - 6 - i * 5.2}
              cy={oy + 7}
              r={2.1}
              fill={rbiColor}
            />
          ))}
        </g>
      )}

      {/* 右下：打撃結果記号 */}
      {playNotation && renderPlayNotation(playNotation, ox, oy)}

      {/* イニング3アウト終了打者マスの右下斜線 */}
      {cell?.isInningEndCell && (
        <g>
          <line
            x1={ox + CELL_W - 14}
            y1={oy + CELL_H}
            x2={ox + CELL_W}
            y2={oy + CELL_H - 14}
            stroke={COLOR_INK}
            strokeWidth={1.7}
          />
          <line
            x1={ox + CELL_W - 10}
            y1={oy + CELL_H}
            x2={ox + CELL_W}
            y2={oy + CELL_H - 10}
            stroke={COLOR_INK}
            strokeWidth={1.1}
          />
        </g>
      )}
    </g>
  );
}

export interface DigitalScorebookSheetProps {
  model: CompiledScorebookSheetModel;
  matchMeta: ScorebookMatchHeaderMeta;
  rules: ScorebookSymbolRules;
  notationMode: ScorebookNotationMode;
  svgRef?: React.Ref<SVGSVGElement>;
  className?: string;
}

export function DigitalScorebookSheet({
  model,
  matchMeta,
  rules,
  notationMode,
  svgRef,
  className,
}: DigitalScorebookSheetProps) {
  const PAD = 16;
  const HEADER_H = 74;
  const HEADER_GAP = 10;
  const COL_HEAD_H = 30;

  // 左側ラインナップ列幅
  const ORD_W = 26;
  const POS_W = 36;
  const NUM_W = 30;
  const NAME_W = 138;
  const LINEUP_TOTAL_W = ORD_W + POS_W + NUM_W + NAME_W; // 230

  // 右端集計欄（8列: 打席・打数・安打・打点・得点・四死・三振・盗塁）
  const STAT_COLS = [
    { key: "pa", label: "打席", w: 24 },
    { key: "ab", label: "打数", w: 24 },
    { key: "h", label: "安打", w: 24 },
    { key: "rbi", label: "打点", w: 24 },
    { key: "r", label: "得点", w: 24 },
    { key: "bb", label: "四死", w: 24 },
    { key: "so", label: "三振", w: 24 },
    { key: "sb", label: "盗塁", w: 24 },
  ] as const;
  const STATS_TOTAL_W = STAT_COLS.reduce((s, c) => s + c.w, 0); // 192

  const gridColsCount = model.columns.length;
  const GRID_TOTAL_W = gridColsCount * CELL_W;

  const SUMMARY_ROW_H = 22;
  const SUMMARY_ROWS_COUNT = 4; // 安打 / 四死・失 / 残塁 / 得点
  const SUMMARY_TOTAL_H = SUMMARY_ROW_H * SUMMARY_ROWS_COUNT;

  const PITCHER_GAP = 12;
  const PITCHER_HEAD_H = 22;
  const PITCHER_ROW_H = 22;
  const pitcherRowsCount = Math.max(1, model.pitcherRows.length);
  const PITCHER_TOTAL_H = PITCHER_HEAD_H + pitcherRowsCount * PITCHER_ROW_H;

  const FOOTER_H = 20;

  const battersCount = model.batterRows.length;
  const BATTERS_TOTAL_H = battersCount * CELL_H;

  const totalWidth = PAD * 2 + LINEUP_TOTAL_W + GRID_TOTAL_W + STATS_TOTAL_W;
  const tableTopY = PAD + HEADER_H + HEADER_GAP;
  const gridBodyTopY = tableTopY + COL_HEAD_H;
  const summaryTopY = gridBodyTopY + BATTERS_TOTAL_H;
  const pitcherTopY = summaryTopY + SUMMARY_TOTAL_H + PITCHER_GAP;
  const totalHeight = pitcherTopY + PITCHER_TOTAL_H + FOOTER_H + PAD;

  const lineupX = PAD;
  const gridStartX = PAD + LINEUP_TOTAL_W;
  const statsStartX = gridStartX + GRID_TOTAL_W;

  // イニング見出し結合用グループ
  const inningGroups: Array<{
    inning: number;
    startColIdx: number;
    colSpan: number;
  }> = [];
  model.columns.forEach((col, idx) => {
    const last = inningGroups[inningGroups.length - 1];
    if (last && last.inning === col.inning) {
      last.colSpan += 1;
    } else {
      inningGroups.push({ inning: col.inning, startColIdx: idx, colSpan: 1 });
    }
  });

  // 上部ミニスコアボード列数
  const sbInningsCount = Math.max(
    matchMeta.scheduledInnings || 7,
    matchMeta.topInningScores.length,
    matchMeta.bottomInningScores.length,
    7
  );
  const sbColW = 20;
  const sbTeamW = 112;
  const sbRheW = 24;
  const sbTotalW = sbTeamW + sbInningsCount * sbColW + sbRheW * 3;
  const sbX = totalWidth - PAD - sbTotalW;
  const sbY = PAD + 6;
  const sbRowH = 20;

  const modeBadgeLabel =
    notationMode === "team"
      ? "表記: チーム記号ルール"
      : "表記: 標準（早稲田・成美堂式）";

  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${totalWidth} ${totalHeight}`}
      width={totalWidth}
      height={totalHeight}
      className={className}
      style={{
        fontFamily: FONT_SANS,
        backgroundColor: COLOR_PAPER,
        userSelect: "none",
      }}
    >
      {/* 用紙全体背景 */}
      <rect
        x={0}
        y={0}
        width={totalWidth}
        height={totalHeight}
        fill={COLOR_PAPER}
      />

      {/* ━━━ 1. 上部ヘッダー領域 ━━━ */}
      <g>
        {/* 先攻/後攻ピルバッジ */}
        <rect
          x={PAD}
          y={PAD + 4}
          width={86}
          height={22}
          rx={5}
          fill={model.isTop ? COLOR_INK : COLOR_RED}
        />
        <text
          x={PAD + 43}
          y={PAD + 19}
          fontSize={11}
          fontWeight={900}
          textAnchor="middle"
          fill="#ffffff"
        >
          {model.isTop ? "先攻（表）" : "後攻（裏）"}
        </text>

        {/* 攻撃チーム名 */}
        <text
          x={PAD + 96}
          y={PAD + 21}
          fontSize={18}
          fontWeight={900}
          fill={COLOR_INK}
        >
          {model.battingTeamName}
        </text>

        {/* 試合メタ情報（日時・大会・会場・相手） */}
        <text
          x={PAD}
          y={PAD + 43}
          fontSize={10.5}
          fontWeight={700}
          fill={COLOR_MUTED}
        >
          {[
            matchMeta.date,
            matchMeta.startTime ? `${matchMeta.startTime}〜` : "",
            `[${matchMeta.matchTypeLabel}]`,
            matchMeta.tournamentName || "",
            matchMeta.venueName ? `＠${matchMeta.venueName}` : "",
          ]
            .filter(Boolean)
            .join("  ")}
        </text>

        <text
          x={PAD}
          y={PAD + 61}
          fontSize={10}
          fontWeight={800}
          fill={COLOR_BLUE}
        >
          {`相手（守備）: ${model.fieldingTeamName}   ｜   ${modeBadgeLabel}${
            notationMode === "team" && rules.customNote
              ? `（${rules.customNote}）`
              : ""
          }`}
        </text>

        {/* 右上：ミニ・イニングスコアボード */}
        <g>
          <rect
            x={sbX}
            y={sbY}
            width={sbTotalW}
            height={sbRowH * 3}
            fill="#ffffff"
            stroke={COLOR_FRAME}
            strokeWidth={1.4}
          />
          <rect
            x={sbX}
            y={sbY}
            width={sbTotalW}
            height={sbRowH}
            fill={COLOR_PAPER_SUB}
          />
          <line
            x1={sbX}
            y1={sbY + sbRowH}
            x2={sbX + sbTotalW}
            y2={sbY + sbRowH}
            stroke={COLOR_FRAME}
            strokeWidth={1}
          />
          <line
            x1={sbX}
            y1={sbY + sbRowH * 2}
            x2={sbX + sbTotalW}
            y2={sbY + sbRowH * 2}
            stroke={COLOR_GRID_LIGHT}
            strokeWidth={0.9}
          />

          <text
            x={sbX + 8}
            y={sbY + 13.5}
            fontSize={8.5}
            fontWeight={900}
            fill={COLOR_MUTED}
            fontFamily={FONT_MONO}
          >
            TEAM
          </text>
          <text
            x={sbX + 8}
            y={sbY + sbRowH + 14}
            fontSize={9.5}
            fontWeight={model.isTop ? 900 : 700}
            fill={model.isTop ? COLOR_INK : COLOR_MUTED}
          >
            {matchMeta.topTeamName.slice(0, 10)}
          </text>
          <text
            x={sbX + 8}
            y={sbY + sbRowH * 2 + 14}
            fontSize={9.5}
            fontWeight={!model.isTop ? 900 : 700}
            fill={!model.isTop ? COLOR_INK : COLOR_MUTED}
          >
            {matchMeta.bottomTeamName.slice(0, 10)}
          </text>

          {Array.from({ length: sbInningsCount }).map((_, idx) => {
            const cx = sbX + sbTeamW + idx * sbColW;
            const topVal = matchMeta.topInningScores[idx];
            const botVal = matchMeta.bottomInningScores[idx];
            const isLastScheduled = idx === sbInningsCount - 1;
            const isWalkOffOrX =
              isLastScheduled &&
              botVal === undefined &&
              topVal !== undefined &&
              matchMeta.bottomTotalRuns > matchMeta.topTotalRuns;

            return (
              <g key={`sb-inn-${idx}`}>
                <line
                  x1={cx}
                  y1={sbY}
                  x2={cx}
                  y2={sbY + sbRowH * 3}
                  stroke={COLOR_GRID_LIGHT}
                  strokeWidth={0.8}
                />
                <text
                  x={cx + sbColW / 2}
                  y={sbY + 13.5}
                  fontSize={8.5}
                  fontWeight={800}
                  textAnchor="middle"
                  fill={COLOR_MUTED}
                  fontFamily={FONT_MONO}
                >
                  {idx + 1}
                </text>
                <text
                  x={cx + sbColW / 2}
                  y={sbY + sbRowH + 14}
                  fontSize={9.5}
                  fontWeight={800}
                  textAnchor="middle"
                  fill={COLOR_INK}
                  fontFamily={FONT_MONO}
                >
                  {typeof topVal === "number" ? topVal : "-"}
                </text>
                <text
                  x={cx + sbColW / 2}
                  y={sbY + sbRowH * 2 + 14}
                  fontSize={9.5}
                  fontWeight={800}
                  textAnchor="middle"
                  fill={COLOR_INK}
                  fontFamily={FONT_MONO}
                >
                  {typeof botVal === "number"
                    ? botVal
                    : isWalkOffOrX
                    ? "x"
                    : "-"}
                </text>
              </g>
            );
          })}

          {(
            [
              {
                label: "R",
                top: matchMeta.topTotalRuns,
                bot: matchMeta.bottomTotalRuns,
                highlight: true,
              },
              {
                label: "H",
                top: matchMeta.topTotalHits,
                bot: matchMeta.bottomTotalHits,
                highlight: false,
              },
              {
                label: "E",
                top: matchMeta.topTotalErrors,
                bot: matchMeta.bottomTotalErrors,
                highlight: false,
              },
            ] as const
          ).map((col, rIdx) => {
            const rx =
              sbX + sbTeamW + sbInningsCount * sbColW + rIdx * sbRheW;
            return (
              <g key={col.label}>
                {col.highlight && (
                  <rect
                    x={rx}
                    y={sbY}
                    width={sbRheW}
                    height={sbRowH * 3}
                    fill={COLOR_RED_SOFT}
                  />
                )}
                <line
                  x1={rx}
                  y1={sbY}
                  x2={rx}
                  y2={sbY + sbRowH * 3}
                  stroke={rIdx === 0 ? COLOR_FRAME : COLOR_GRID_LIGHT}
                  strokeWidth={rIdx === 0 ? 1.2 : 0.8}
                />
                <text
                  x={rx + sbRheW / 2}
                  y={sbY + 13.5}
                  fontSize={8.5}
                  fontWeight={900}
                  textAnchor="middle"
                  fill={col.highlight ? COLOR_RED : COLOR_MUTED}
                  fontFamily={FONT_MONO}
                >
                  {col.label}
                </text>
                <text
                  x={rx + sbRheW / 2}
                  y={sbY + sbRowH + 14}
                  fontSize={10}
                  fontWeight={900}
                  textAnchor="middle"
                  fill={col.highlight ? COLOR_RED : COLOR_INK}
                  fontFamily={FONT_MONO}
                >
                  {col.top}
                </text>
                <text
                  x={rx + sbRheW / 2}
                  y={sbY + sbRowH * 2 + 14}
                  fontSize={10}
                  fontWeight={900}
                  textAnchor="middle"
                  fill={col.highlight ? COLOR_RED : COLOR_INK}
                  fontFamily={FONT_MONO}
                >
                  {col.bot}
                </text>
              </g>
            );
          })}
        </g>
      </g>

      {/* ━━━ 2. メイングリッドヘッダー行 ━━━ */}
      <g>
        <rect
          x={lineupX}
          y={tableTopY}
          width={LINEUP_TOTAL_W + GRID_TOTAL_W + STATS_TOTAL_W}
          height={COL_HEAD_H}
          fill={COLOR_PAPER_SUB}
          stroke={COLOR_FRAME}
          strokeWidth={1.5}
        />

        {/* 左側見出し：打順 / 守備 / 背番 / 選手名 */}
        {(
          [
            { x: lineupX, w: ORD_W, label: "順" },
            { x: lineupX + ORD_W, w: POS_W, label: "守備" },
            { x: lineupX + ORD_W + POS_W, w: NUM_W, label: "背番" },
            {
              x: lineupX + ORD_W + POS_W + NUM_W,
              w: NAME_W,
              label: "選手名（途中交代）",
            },
          ] as const
        ).map((h, idx) => (
          <g key={h.label}>
            {idx > 0 && (
              <line
                x1={h.x}
                y1={tableTopY}
                x2={h.x}
                y2={summaryTopY + SUMMARY_TOTAL_H}
                stroke={COLOR_GRID}
                strokeWidth={0.9}
              />
            )}
            <text
              x={h.x + h.w / 2}
              y={tableTopY + 19}
              fontSize={9.5}
              fontWeight={900}
              textAnchor="middle"
              fill={COLOR_INK}
            >
              {h.label}
            </text>
          </g>
        ))}

        {/* イニング列見出し */}
        {inningGroups.map((grp) => {
          const gx = gridStartX + grp.startColIdx * CELL_W;
          const gw = grp.colSpan * CELL_W;
          return (
            <g key={`head-inn-${grp.inning}`}>
              <line
                x1={gx}
                y1={tableTopY}
                x2={gx}
                y2={summaryTopY + SUMMARY_TOTAL_H}
                stroke={COLOR_FRAME}
                strokeWidth={1.25}
              />
              <text
                x={gx + gw / 2}
                y={tableTopY + (grp.colSpan > 1 ? 14 : 19.5)}
                fontSize={11}
                fontWeight={900}
                textAnchor="middle"
                fill={COLOR_INK}
              >
                {`${grp.inning}回`}
              </text>
              {grp.colSpan > 1 &&
                Array.from({ length: grp.colSpan }).map((_, subIdx) => (
                  <text
                    key={subIdx}
                    x={gx + subIdx * CELL_W + CELL_W / 2}
                    y={tableTopY + 26}
                    fontSize={7.5}
                    fontWeight={800}
                    textAnchor="middle"
                    fill={COLOR_BLUE}
                  >
                    {`${subIdx + 1}巡目`}
                  </text>
                ))}
            </g>
          );
        })}

        {/* 右端個人成績列見出し */}
        {STAT_COLS.map((sc, idx) => {
          const sx = statsStartX + idx * 24;
          return (
            <g key={sc.key}>
              <line
                x1={sx}
                y1={tableTopY}
                x2={sx}
                y2={summaryTopY + SUMMARY_TOTAL_H}
                stroke={idx === 0 ? COLOR_FRAME : COLOR_GRID}
                strokeWidth={idx === 0 ? 1.5 : 0.85}
              />
              <text
                x={sx + sc.w / 2}
                y={tableTopY + 19}
                fontSize={8.5}
                fontWeight={900}
                textAnchor="middle"
                fill={COLOR_INK}
              >
                {sc.label}
              </text>
            </g>
          );
        })}
      </g>

      {/* ━━━ 3. 打順行（1番〜9番+）＆ 打席グリッド ＆ 右端個人集計 ━━━ */}
      {model.batterRows.map((bRow, rowIdx) => {
        const ry = gridBodyTopY + rowIdx * CELL_H;
        const subs = bRow.slot.substitutions.filter(
          (s) => s.name.trim() !== ""
        );
        const hasSubs = subs.length > 0;
        const starterPos = formatPositionByRules(bRow.slot.position, rules);

        return (
          <g key={`batter-row-${bRow.battingOrder}`}>
            {/* 左ラインナップ枠背景 */}
            <rect
              x={lineupX}
              y={ry}
              width={LINEUP_TOTAL_W}
              height={CELL_H}
              fill={COLOR_PAPER}
              stroke={COLOR_GRID}
              strokeWidth={0.9}
            />
            <line
              x1={lineupX + ORD_W}
              y1={ry}
              x2={lineupX + ORD_W}
              y2={ry + CELL_H}
              stroke={COLOR_GRID}
              strokeWidth={0.8}
            />
            <line
              x1={lineupX + ORD_W + POS_W}
              y1={ry}
              x2={lineupX + ORD_W + POS_W}
              y2={ry + CELL_H}
              stroke={COLOR_GRID}
              strokeWidth={0.8}
            />
            <line
              x1={lineupX + ORD_W + POS_W + NUM_W}
              y1={ry}
              x2={lineupX + ORD_W + POS_W + NUM_W}
              y2={ry + CELL_H}
              stroke={COLOR_GRID}
              strokeWidth={0.8}
            />

            {/* 打順番号 */}
            <text
              x={lineupX + ORD_W / 2}
              y={ry + CELL_H / 2 + 4.5}
              fontSize={12.5}
              fontWeight={900}
              textAnchor="middle"
              fill={COLOR_INK}
              fontFamily={FONT_MONO}
            >
              {bRow.battingOrder}
            </text>

            {!hasSubs ? (
              <>
                <text
                  x={lineupX + ORD_W + POS_W / 2}
                  y={ry + CELL_H / 2 + 4}
                  fontSize={11}
                  fontWeight={800}
                  textAnchor="middle"
                  fill={COLOR_INK}
                >
                  {starterPos}
                </text>
                <text
                  x={lineupX + ORD_W + POS_W + NUM_W / 2}
                  y={ry + CELL_H / 2 + 4}
                  fontSize={10.5}
                  fontWeight={800}
                  textAnchor="middle"
                  fill={COLOR_MUTED}
                  fontFamily={FONT_MONO}
                >
                  {bRow.slot.uniformNumber || "-"}
                </text>
                <text
                  x={lineupX + ORD_W + POS_W + NUM_W + 8}
                  y={ry + CELL_H / 2 + 4.5}
                  fontSize={12}
                  fontWeight={900}
                  fill={COLOR_INK}
                >
                  {(bRow.slot.name || `打者 ${bRow.battingOrder}`).slice(0, 10)}
                </text>
              </>
            ) : (
              // 途中交代あり：上段スタメン＋下段交代選手（点線区切り）
              <>
                <line
                  x1={lineupX + ORD_W}
                  y1={ry + 30}
                  x2={lineupX + LINEUP_TOTAL_W}
                  y2={ry + 30}
                  stroke={COLOR_GRID_LIGHT}
                  strokeWidth={0.85}
                  strokeDasharray="2,2"
                />
                <text
                  x={lineupX + ORD_W + POS_W / 2}
                  y={ry + 19}
                  fontSize={10}
                  fontWeight={800}
                  textAnchor="middle"
                  fill={COLOR_INK}
                >
                  {starterPos}
                </text>
                <text
                  x={lineupX + ORD_W + POS_W + NUM_W / 2}
                  y={ry + 19}
                  fontSize={9.5}
                  fontWeight={800}
                  textAnchor="middle"
                  fill={COLOR_MUTED}
                  fontFamily={FONT_MONO}
                >
                  {bRow.slot.uniformNumber || "-"}
                </text>
                <text
                  x={lineupX + ORD_W + POS_W + NUM_W + 7}
                  y={ry + 19.5}
                  fontSize={10.8}
                  fontWeight={900}
                  fill={COLOR_INK}
                >
                  {(bRow.slot.name || `打者 ${bRow.battingOrder}`).slice(0, 10)}
                </text>

                {subs.slice(0, 2).map((sub, sIdx) => {
                  const sy =
                    subs.length === 1 ? ry + 54 : ry + 45 + sIdx * 18;
                  const subPosText = sub.position
                    ? formatPositionByRules(sub.position, rules)
                    : formatSubstitutionRoleShort(sub);
                  return (
                    <g key={sub.id || sIdx}>
                      <text
                        x={lineupX + ORD_W + POS_W / 2}
                        y={sy}
                        fontSize={8.8}
                        fontWeight={800}
                        textAnchor="middle"
                        fill={COLOR_BLUE}
                      >
                        {subPosText}
                      </text>
                      <text
                        x={lineupX + ORD_W + POS_W + NUM_W / 2}
                        y={sy}
                        fontSize={8.8}
                        fontWeight={800}
                        textAnchor="middle"
                        fill={COLOR_BLUE}
                        fontFamily={FONT_MONO}
                      >
                        {sub.uniformNumber || "-"}
                      </text>
                      <text
                        x={lineupX + ORD_W + POS_W + NUM_W + 6}
                        y={sy}
                        fontSize={9.2}
                        fontWeight={800}
                        fill={COLOR_BLUE}
                      >
                        {`(${sub.inningEntered}${formatSubstitutionRoleShort(
                          sub
                        )}) ${sub.name.slice(0, 6)}`}
                      </text>
                    </g>
                  );
                })}
              </>
            )}

            {/* 各イニング列の打席ダイヤモンドマス */}
            {model.columns.map((col, colIdx) => {
              const cx = gridStartX + colIdx * CELL_W;
              const cellKey = `${col.inning}-${col.columnIndex}-${bRow.battingOrder}`;
              const cell = model.cellsByKey[cellKey];
              return (
                <React.Fragment key={cellKey}>
                  {renderSingleScorebookCellSvg(cell, rules, cx, ry)}
                </React.Fragment>
              );
            })}

            {/* イニング境界線の強調再描画 */}
            {inningGroups.map((grp) => {
              const gx = gridStartX + grp.startColIdx * CELL_W;
              return (
                <line
                  key={`bline-${grp.inning}`}
                  x1={gx}
                  y1={ry}
                  x2={gx}
                  y2={ry + CELL_H}
                  stroke={COLOR_FRAME}
                  strokeWidth={1.25}
                />
              );
            })}

            {/* 右端打順別成績セル */}
            {(
              [
                bRow.plateAppearances,
                bRow.atBats,
                bRow.hits,
                bRow.rbi,
                bRow.runs,
                bRow.walksHbp,
                bRow.strikeouts,
                bRow.stolenBases,
              ] as const
            ).map((val, sIdx) => {
              const sx = statsStartX + sIdx * 24;
              const isHighlight = sIdx === 2 || sIdx === 4; // 安打・得点
              return (
                <g key={`st-${sIdx}`}>
                  <rect
                    x={sx}
                    y={ry}
                    width={24}
                    height={CELL_H}
                    fill={isHighlight && val > 0 ? COLOR_RED_SOFT : COLOR_PAPER}
                    stroke={COLOR_GRID}
                    strokeWidth={0.85}
                  />
                  <text
                    x={sx + 12}
                    y={ry + CELL_H / 2 + 4}
                    fontSize={11}
                    fontWeight={val > 0 ? 900 : 600}
                    textAnchor="middle"
                    fill={
                      isHighlight && val > 0
                        ? COLOR_RED
                        : val > 0
                        ? COLOR_INK
                        : "#94a3b8"
                    }
                    fontFamily={FONT_MONO}
                  >
                    {val}
                  </text>
                </g>
              );
            })}
            <line
              x1={statsStartX}
              y1={ry}
              x2={statsStartX}
              y2={ry + CELL_H}
              stroke={COLOR_FRAME}
              strokeWidth={1.5}
            />
          </g>
        );
      })}

      {/* ━━━ 4. グリッド下段：各イニング集計行（安打・四死/失・残塁・得点）＋ チーム合計 ━━━ */}
      {(
        [
          {
            label: "安打 (H)",
            getInningVal: (s: CompiledScorebookSheetModel["inningSummaries"][number]) =>
              s.hasData ? String(s.hits) : "-",
            highlight: false,
          },
          {
            label: "四死球 / 敵失",
            getInningVal: (s: CompiledScorebookSheetModel["inningSummaries"][number]) =>
              s.hasData ? `${s.walksHbp}/${s.errors}` : "-",
            highlight: false,
          },
          {
            label: "残塁 (LOB)",
            getInningVal: (s: CompiledScorebookSheetModel["inningSummaries"][number]) =>
              s.hasData ? String(s.leftOnBase) : "-",
            highlight: false,
          },
          {
            label: "得点 (R)",
            getInningVal: (s: CompiledScorebookSheetModel["inningSummaries"][number]) =>
              s.hasData ? String(s.runs) : "-",
            highlight: true,
          },
        ] as const
      ).map((sumRow, rIdx) => {
        const sy = summaryTopY + rIdx * SUMMARY_ROW_H;
        return (
          <g key={sumRow.label}>
            <rect
              x={lineupX}
              y={sy}
              width={LINEUP_TOTAL_W}
              height={SUMMARY_ROW_H}
              fill={sumRow.highlight ? COLOR_RED_SOFT : COLOR_PAPER_SUB}
              stroke={COLOR_GRID}
              strokeWidth={0.9}
            />
            <text
              x={lineupX + LINEUP_TOTAL_W - 10}
              y={sy + 15}
              fontSize={9.5}
              fontWeight={900}
              textAnchor="end"
              fill={sumRow.highlight ? COLOR_RED : COLOR_INK}
            >
              {sumRow.label}
            </text>

            {inningGroups.map((grp) => {
              const gx = gridStartX + grp.startColIdx * CELL_W;
              const gw = grp.colSpan * CELL_W;
              const summary = model.inningSummaries.find(
                (item) => item.inning === grp.inning
              );
              return (
                <g key={`sum-${rIdx}-${grp.inning}`}>
                  <rect
                    x={gx}
                    y={sy}
                    width={gw}
                    height={SUMMARY_ROW_H}
                    fill={sumRow.highlight ? COLOR_RED_SOFT : "#ffffff"}
                    stroke={COLOR_GRID}
                    strokeWidth={0.9}
                  />
                  <line
                    x1={gx}
                    y1={sy}
                    x2={gx}
                    y2={sy + SUMMARY_ROW_H}
                    stroke={COLOR_FRAME}
                    strokeWidth={1.25}
                  />
                  <text
                    x={gx + gw / 2}
                    y={sy + 15}
                    fontSize={10.5}
                    fontWeight={900}
                    textAnchor="middle"
                    fill={sumRow.highlight ? COLOR_RED : COLOR_INK}
                    fontFamily={FONT_MONO}
                  >
                    {summary ? sumRow.getInningVal(summary) : "-"}
                  </text>
                </g>
              );
            })}

            {/* 右端：4行目の「得点(R)」行にチーム総合計を表示、1〜3行目は補助集計 */}
            {rIdx < 3 ? (
              <g>
                <rect
                  x={statsStartX}
                  y={sy}
                  width={STATS_TOTAL_W}
                  height={SUMMARY_ROW_H}
                  fill={COLOR_PAPER_SUB}
                  stroke={COLOR_GRID}
                  strokeWidth={0.9}
                />
                <text
                  x={statsStartX + 10}
                  y={sy + 14.5}
                  fontSize={9}
                  fontWeight={800}
                  fill={COLOR_MUTED}
                >
                  {rIdx === 0
                    ? `計 安打: ${model.totals.hits}本`
                    : rIdx === 1
                    ? `計 四死球: ${model.totals.walksHbp} / 敵失: ${model.totals.errors}`
                    : `計 残塁: ${model.totals.leftOnBase} （三者均衡確認済）`}
                </text>
              </g>
            ) : (
              (
                [
                  model.totals.plateAppearances,
                  model.totals.atBats,
                  model.totals.hits,
                  model.totals.rbi,
                  model.totals.runs,
                  model.totals.walksHbp,
                  model.totals.strikeouts,
                  model.totals.stolenBases,
                ] as const
              ).map((totVal, tIdx) => {
                const tx = statsStartX + tIdx * 24;
                return (
                  <g key={`tot-${tIdx}`}>
                    <rect
                      x={tx}
                      y={sy}
                      width={24}
                      height={SUMMARY_ROW_H}
                      fill={COLOR_RED_SOFT}
                      stroke={COLOR_GRID}
                      strokeWidth={0.9}
                    />
                    <text
                      x={tx + 12}
                      y={sy + 15}
                      fontSize={10}
                      fontWeight={900}
                      textAnchor="middle"
                      fill={tIdx === 2 || tIdx === 4 ? COLOR_RED : COLOR_INK}
                      fontFamily={FONT_MONO}
                    >
                      {totVal}
                    </text>
                  </g>
                );
              })
            )}
          </g>
        );
      })}

      {/* メインテーブル外周太枠 */}
      <rect
        x={lineupX}
        y={tableTopY}
        width={LINEUP_TOTAL_W + GRID_TOTAL_W + STATS_TOTAL_W}
        height={COL_HEAD_H + BATTERS_TOTAL_H + SUMMARY_TOTAL_H}
        fill="none"
        stroke={COLOR_FRAME}
        strokeWidth={1.8}
      />
      <line
        x1={lineupX}
        y1={summaryTopY}
        x2={lineupX + LINEUP_TOTAL_W + GRID_TOTAL_W + STATS_TOTAL_W}
        y2={summaryTopY}
        stroke={COLOR_FRAME}
        strokeWidth={1.5}
      />

      {/* ━━━ 5. 下部：相手（守備側）登板投手成績テーブル ━━━ */}
      <g>
        <rect
          x={lineupX}
          y={pitcherTopY}
          width={Math.min(760, totalWidth - PAD * 2)}
          height={PITCHER_TOTAL_H}
          fill="#ffffff"
          stroke={COLOR_FRAME}
          strokeWidth={1.4}
        />
        <rect
          x={lineupX}
          y={pitcherTopY}
          width={Math.min(760, totalWidth - PAD * 2)}
          height={PITCHER_HEAD_H}
          fill={COLOR_BLUE_SOFT}
        />
        <line
          x1={lineupX}
          y1={pitcherTopY + PITCHER_HEAD_H}
          x2={lineupX + Math.min(760, totalWidth - PAD * 2)}
          y2={pitcherTopY + PITCHER_HEAD_H}
          stroke={COLOR_FRAME}
          strokeWidth={1}
        />

        {(
          [
            { x: 0, w: 54, label: "登板順" },
            { x: 54, w: 42, label: "背番" },
            { x: 96, w: 154, label: `投手名（${model.fieldingTeamName}）` },
            { x: 250, w: 72, label: "担当回" },
            { x: 322, w: 62, label: "投球回" },
            { x: 384, w: 58, label: "打者" },
            { x: 442, w: 58, label: "球数" },
            { x: 500, w: 58, label: "被安打" },
            { x: 558, w: 58, label: "奪三振" },
            { x: 616, w: 58, label: "四死球" },
            { x: 674, w: 86, label: "失点 (R)" },
          ] as const
        ).map((pc, idx) => (
          <g key={pc.label}>
            {idx > 0 && (
              <line
                x1={lineupX + pc.x}
                y1={pitcherTopY}
                x2={lineupX + pc.x}
                y2={pitcherTopY + PITCHER_TOTAL_H}
                stroke={COLOR_GRID_LIGHT}
                strokeWidth={0.85}
              />
            )}
            <text
              x={lineupX + pc.x + pc.w / 2}
              y={pitcherTopY + 15}
              fontSize={8.8}
              fontWeight={900}
              textAnchor="middle"
              fill={COLOR_INK}
            >
              {pc.label}
            </text>
          </g>
        ))}

        {model.pitcherRows.map((pRow, pIdx) => {
          const py = pitcherTopY + PITCHER_HEAD_H + pIdx * PITCHER_ROW_H;
          const cells = [
            { x: 0, w: 54, val: pRow.order === 1 ? "先発" : `${pRow.order}番手` },
            { x: 54, w: 42, val: pRow.uniformNumber ? `#${pRow.uniformNumber}` : "-" },
            { x: 96, w: 154, val: pRow.name },
            {
              x: 250,
              w: 72,
              val:
                pRow.fromInning === pRow.toInning
                  ? `${pRow.fromInning}回`
                  : `${pRow.fromInning}〜${pRow.toInning}回`,
            },
            { x: 322, w: 62, val: pRow.ipDisplay },
            { x: 384, w: 58, val: String(pRow.battersFaced) },
            { x: 442, w: 58, val: String(pRow.pitchesCount) },
            { x: 500, w: 58, val: String(pRow.hitsAllowed) },
            { x: 558, w: 58, val: String(pRow.strikeouts) },
            { x: 616, w: 58, val: String(pRow.walksHbp) },
            { x: 674, w: 86, val: String(pRow.runsAllowed) },
          ];
          return (
            <g key={`prow-${pIdx}`}>
              {pIdx > 0 && (
                <line
                  x1={lineupX}
                  y1={py}
                  x2={lineupX + 760}
                  y2={py}
                  stroke={COLOR_GRID_LIGHT}
                  strokeWidth={0.8}
                />
              )}
              {cells.map((c, cIdx) => (
                <text
                  key={cIdx}
                  x={cIdx === 2 ? lineupX + c.x + 10 : lineupX + c.x + c.w / 2}
                  y={py + 15}
                  fontSize={9.8}
                  fontWeight={cIdx === 2 || cIdx === 10 ? 900 : 700}
                  textAnchor={cIdx === 2 ? "start" : "middle"}
                  fill={cIdx === 10 && pRow.runsAllowed > 0 ? COLOR_RED : COLOR_INK}
                  fontFamily={cIdx >= 4 ? FONT_MONO : FONT_SANS}
                >
                  {c.val}
                </text>
              ))}
            </g>
          );
        })}

        {/* 右下クレジット */}
        <text
          x={totalWidth - PAD}
          y={pitcherTopY + PITCHER_TOTAL_H - 4}
          fontSize={8.5}
          fontWeight={800}
          textAnchor="end"
          fill="#94a3b8"
        >
          {`Generated by iScoreCloud  •  ${modeBadgeLabel}`}
        </text>
      </g>
    </svg>
  );
}

/**
 * スコア設定ページや切替ヘルプ用の「3マス・リアルタイム記号プレビュー」コンポーネント
 */
export function ScorebookSymbolSamplePreview({
  rules,
}: {
  rules: ScorebookSymbolRules;
}) {
  const sampleCells: Array<{ title: string; cell: CompiledScorebookCell }> = [
    {
      title: "二塁打＋盗塁＋生還",
      cell: {
        cellKey: "s-1",
        inning: 1,
        columnIndex: 1,
        battingOrder: 1,
        atBat: {
          id: "s-ab-1",
          inning: 1,
          isTop: true,
          columnIndex: 1,
          battingOrder: 1,
          batterName: "サンプル1",
          batterPlayerId: null,
          pitcherName: "投手",
          pitcherPlayerId: null,
          resultCode: "double",
          resultLabel: "左中間二塁打",
          battedDirection: "78",
          rbi: 1,
          outsInPlay: 0,
          endingOuts: 0,
          runsInPlay: 1,
          balls: 1,
          strikes: 1,
          pitches: ["ball", "strike", "hit"],
          advances: [],
          confidence: "high",
        },
        isTiebreakRunnerOnly: false,
        segments: {
          1: {
            segment: 1,
            status: "safe",
            isBatterHit: true,
            hitBases: 2,
            method: "hit",
            isPrePlay: false,
          },
          2: {
            segment: 2,
            status: "safe",
            isBatterHit: true,
            hitBases: 2,
            method: "hit",
            isPrePlay: false,
          },
          3: {
            segment: 3,
            status: "safe",
            isBatterHit: false,
            hitBases: 0,
            method: "steal",
            isPrePlay: true,
          },
          4: {
            segment: 4,
            status: "safe",
            isBatterHit: false,
            hitBases: 0,
            method: "hit",
            drivingBatterOrder: 3,
            isPrePlay: false,
          },
        },
        outNumber: null,
        runScored: true,
        isResidual: false,
        isInningEndCell: false,
        hasPitcherChangeBefore: false,
      },
    },
    {
      title: "見逃し三振（1死）",
      cell: {
        cellKey: "s-2",
        inning: 1,
        columnIndex: 1,
        battingOrder: 2,
        atBat: {
          id: "s-ab-2",
          inning: 1,
          isTop: true,
          columnIndex: 1,
          battingOrder: 2,
          batterName: "サンプル2",
          batterPlayerId: null,
          pitcherName: "投手",
          pitcherPlayerId: null,
          resultCode: "strikeout",
          resultLabel: "見逃し三振",
          battedDirection: "",
          rbi: 0,
          outsInPlay: 1,
          endingOuts: 1,
          runsInPlay: 0,
          balls: 1,
          strikes: 3,
          pitches: ["swinging_strike", "ball", "foul", "strike"],
          advances: [],
          confidence: "high",
        },
        isTiebreakRunnerOnly: false,
        segments: { 1: null, 2: null, 3: null, 4: null },
        outNumber: 1,
        runScored: false,
        isResidual: false,
        isInningEndCell: false,
        hasPitcherChangeBefore: false,
      },
    },
    {
      title: "中飛（2死）",
      cell: {
        cellKey: "s-3",
        inning: 1,
        columnIndex: 1,
        battingOrder: 3,
        atBat: {
          id: "s-ab-3",
          inning: 1,
          isTop: true,
          columnIndex: 1,
          battingOrder: 3,
          batterName: "サンプル3",
          batterPlayerId: null,
          pitcherName: "投手",
          pitcherPlayerId: null,
          resultCode: "flyout",
          resultLabel: "中飛",
          battedDirection: "8",
          rbi: 0,
          outsInPlay: 1,
          endingOuts: 2,
          runsInPlay: 0,
          balls: 1,
          strikes: 0,
          pitches: ["ball", "in_play"],
          advances: [],
          confidence: "high",
        },
        isTiebreakRunnerOnly: false,
        segments: { 1: null, 2: null, 3: null, 4: null },
        outNumber: 2,
        runScored: false,
        isResidual: false,
        isInningEndCell: false,
        hasPitcherChangeBefore: false,
      },
    },
    {
      title: "四球＋残塁",
      cell: {
        cellKey: "s-4",
        inning: 1,
        columnIndex: 1,
        battingOrder: 4,
        atBat: {
          id: "s-ab-4",
          inning: 1,
          isTop: true,
          columnIndex: 1,
          battingOrder: 4,
          batterName: "サンプル4",
          batterPlayerId: null,
          pitcherName: "投手",
          pitcherPlayerId: null,
          resultCode: "walk",
          resultLabel: "四球",
          battedDirection: "",
          rbi: 0,
          outsInPlay: 0,
          endingOuts: 3,
          runsInPlay: 0,
          balls: 4,
          strikes: 1,
          pitches: ["ball", "strike", "ball", "ball", "ball"],
          advances: [],
          confidence: "high",
        },
        isTiebreakRunnerOnly: false,
        segments: {
          1: {
            segment: 1,
            status: "safe",
            isBatterHit: false,
            hitBases: 0,
            method: "walk",
            isPrePlay: false,
          },
          2: null,
          3: null,
          4: null,
        },
        outNumber: null,
        runScored: false,
        isResidual: true,
        isInningEndCell: true,
        hasPitcherChangeBefore: false,
      },
    },
  ];

  const gap = 8;
  const headerH = 18;
  const totalW = sampleCells.length * CELL_W + (sampleCells.length - 1) * gap + 12;
  const totalH = headerH + CELL_H + 10;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${totalW} ${totalH}`}
      className="w-full h-auto rounded-xl border border-slate-300 bg-[#fffefb]"
      style={{ fontFamily: FONT_SANS }}
    >
      <rect x={0} y={0} width={totalW} height={totalH} fill={COLOR_PAPER} />
      {sampleCells.map((item, idx) => {
        const ox = 6 + idx * (CELL_W + gap);
        return (
          <g key={item.title}>
            <text
              x={ox + CELL_W / 2}
              y={13}
              fontSize={7.8}
              fontWeight={900}
              textAnchor="middle"
              fill={COLOR_MUTED}
            >
              {item.title}
            </text>
            {renderSingleScorebookCellSvg(item.cell, rules, ox, headerH + 2)}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * 1枚または2枚（先攻＋後攻）のSVG要素を高解像度PNG Blobへ変換する
 */
export async function exportScorebookSvgElementsToPngBlob(
  svgElements: SVGSVGElement[],
  scale = 2.4
): Promise<Blob> {
  if (svgElements.length === 0) {
    throw new Error("出力対象のスコアブックシートがありません");
  }

  const serializer = new XMLSerializer();
  const loadedImages: Array<{
    img: HTMLImageElement;
    w: number;
    h: number;
  }> = [];

  for (const svgEl of svgElements) {
    const vb = svgEl.viewBox.baseVal;
    const w = vb && vb.width > 0 ? vb.width : Number(svgEl.getAttribute("width")) || 1100;
    const h = vb && vb.height > 0 ? vb.height : Number(svgEl.getAttribute("height")) || 860;
    let xml = serializer.serializeToString(svgEl);
    if (!xml.includes("xmlns=")) {
      xml = xml.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    const svgBlob = new Blob([xml], {
      type: "image/svg+xml;charset=utf-8",
    });
    const objUrl = URL.createObjectURL(svgBlob);

    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () =>
          reject(new Error("スコアブック画像のラスタライズに失敗しました"));
        image.src = objUrl;
      });
      loadedImages.push({ img, w, h });
    } finally {
      URL.revokeObjectURL(objUrl);
    }
  }

  const sheetGap = loadedImages.length > 1 ? 24 : 0;
  const maxW = Math.max(...loadedImages.map((i) => i.w));
  const sumH =
    loadedImages.reduce((acc, i) => acc + i.h, 0) +
    sheetGap * (loadedImages.length - 1);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(maxW * scale);
  canvas.height = Math.round(sumH * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvasコンテキストの初期化に失敗しました");
  }

  ctx.fillStyle = COLOR_PAPER;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let curY = 0;
  for (const item of loadedImages) {
    ctx.drawImage(
      item.img,
      0,
      Math.round(curY * scale),
      Math.round(item.w * scale),
      Math.round(item.h * scale)
    );
    curY += item.h + sheetGap;
  }

  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("PNGデータの生成に失敗しました"));
      },
      "image/png",
      1.0
    );
  });

  return pngBlob;
}

/**
 * ページ遷移（window.location変更）を一切起こさず、非表示iframe経由でA4横向き印刷 / PDF保存ダイアログを起動する
 */
export function printScorebookSvgElements(
  svgElements: SVGSVGElement[],
  documentTitle: string
): void {
  if (typeof document === "undefined" || svgElements.length === 0) return;

  const serializer = new XMLSerializer();
  const pagesHtml = svgElements
    .map((el) => {
      let xml = serializer.serializeToString(el);
      if (!xml.includes("xmlns=")) {
        xml = xml.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      return `<div class="sheet-page">${xml}</div>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>${documentTitle.replace(/[<>&"]/g, "")}</title>
<style>
  @page { size: A4 landscape; margin: 6mm; }
  html, body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet-page {
    width: 100%;
    page-break-after: always;
    break-after: page;
    display: flex;
    justify-content: center;
    align-items: flex-start;
  }
  .sheet-page:last-child {
    page-break-after: auto;
    break-after: auto;
  }
  .sheet-page svg {
    width: 100%;
    height: auto;
    max-height: 196mm;
  }
</style>
</head>
<body>${pagesHtml}</body>
</html>`;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc || !iframe.contentWindow) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const trigger = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 3000);
    }
  };

  setTimeout(trigger, 250);
}
