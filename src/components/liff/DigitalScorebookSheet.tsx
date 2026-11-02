// filepath: src/components/liff/DigitalScorebookSheet.tsx
"use client";

import React from "react";
import {
  isNonPitchMoundEvent,
  isPickoffPitch,
  type CanonicalPitchResult,
  type ScorebookBatterSlot,
} from "@/types/scorebook-v2";
import {
  formatAdvanceMethodByRules,
  formatAtBatPlayNotation,
  formatOutOrdinalText,
  formatPositionByRules,
  type FormattedPlayNotation,
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
const COLOR_SAGE_HEAD = "#dfe9e2";
const COLOR_SAGE_BADGE = "#35634d";
const COLOR_SAGE_SUB_ORD = "#4b6358";

const CELL_W = 88;
const CELL_H = 74;
const BSO_W = 19;

// 3段フル様式（先発・守備位置｜打順(1/11/21)｜左○｜選手名｜背番号）の列幅定数
const CLASSIC_STARTER_POS_W = 19;
const CLASSIC_SUB_POS_COL_W = 15;
const CLASSIC_POS_TOTAL_W = CLASSIC_STARTER_POS_W + CLASSIC_SUB_POS_COL_W * 3; // 64
const CLASSIC_ORD_W = 22;
const CLASSIC_LEFTY_W = 17;
const CLASSIC_NAME_W = 132;
const CLASSIC_NUM_W = 23;
const CLASSIC_LINEUP_TOTAL_W =
  CLASSIC_POS_TOTAL_W +
  CLASSIC_ORD_W +
  CLASSIC_LEFTY_W +
  CLASSIC_NAME_W +
  CLASSIC_NUM_W; // 258

// シンプル式（順｜守備｜背番｜選手名）の列幅定数
const COMPACT_ORD_W = 26;
const COMPACT_POS_W = 36;
const COMPACT_NUM_W = 30;
const COMPACT_NAME_W = 138;
const COMPACT_LINEUP_TOTAL_W =
  COMPACT_ORD_W + COMPACT_POS_W + COMPACT_NUM_W + COMPACT_NAME_W; // 230

interface SegmentEndpointDef {
  from: { x: number; y: number };
  to: { x: number; y: number };
  labelPos: { x: number; y: number };
}

interface CellGeometry {
  ptHP: { x: number; y: number };
  pt1B: { x: number; y: number };
  pt2B: { x: number; y: number };
  pt3B: { x: number; y: number };
  ptCenter: { x: number; y: number };
  playNotationPos: { x: number; y: number };
  segments: Record<BaseSegmentIndex, SegmentEndpointDef>;
  hasQuadrantCrosshairs: boolean;
  hasBaseMiniSquares: boolean;
}

// ① 十字点線・4分割ダイヤ型（成美堂・早稲田・リトルシニア定番）
const QUADRANT_CELL_GEOMETRY: CellGeometry = {
  ptHP: { x: 53.5, y: 53.5 },
  pt1B: { x: 70, y: 37 },
  pt2B: { x: 53.5, y: 20.5 },
  pt3B: { x: 37, y: 37 },
  ptCenter: { x: 53.5, y: 37 },
  playNotationPos: { x: 72, y: 63 },
  segments: {
    1: { from: { x: 53.5, y: 53.5 }, to: { x: 70, y: 37 }, labelPos: { x: 72, y: 50 } },
    2: { from: { x: 70, y: 37 }, to: { x: 53.5, y: 20.5 }, labelPos: { x: 72.5, y: 20 } },
    3: { from: { x: 53.5, y: 20.5 }, to: { x: 37, y: 37 }, labelPos: { x: 34.5, y: 20 } },
    4: { from: { x: 37, y: 37 }, to: { x: 53.5, y: 53.5 }, labelPos: { x: 34.5, y: 58 } },
  },
  hasQuadrantCrosshairs: true,
  hasBaseMiniSquares: false,
};

// ② 大ダイヤ単独・ベース小四角型（シンプル型）
const SIMPLE_DIAMOND_CELL_GEOMETRY: CellGeometry = {
  ptHP: { x: 53.5, y: 55 },
  pt1B: { x: 74.5, y: 34 },
  pt2B: { x: 53.5, y: 13 },
  pt3B: { x: 32.5, y: 34 },
  ptCenter: { x: 53.5, y: 34 },
  playNotationPos: { x: 71.5, y: 64 },
  segments: {
    1: { from: { x: 53.5, y: 55 }, to: { x: 74.5, y: 34 }, labelPos: { x: 70, y: 49 } },
    2: { from: { x: 74.5, y: 34 }, to: { x: 53.5, y: 13 }, labelPos: { x: 71, y: 18 } },
    3: { from: { x: 53.5, y: 13 }, to: { x: 32.5, y: 34 }, labelPos: { x: 35, y: 18 } },
    4: { from: { x: 32.5, y: 34 }, to: { x: 53.5, y: 55 }, labelPos: { x: 34, y: 49 } },
  },
  hasQuadrantCrosshairs: false,
  hasBaseMiniSquares: true,
};

function getCellGeometry(rules: ScorebookSymbolRules): CellGeometry {
  if (rules.cellStyle === "simple_diamond") {
    return SIMPLE_DIAMOND_CELL_GEOMETRY;
  }
  return QUADRANT_CELL_GEOMETRY;
}

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
      } else if (p === "bunt_foul" && rules.buntPitchMark !== "same_as_normal") {
        strikeTokens.push(`${seq}BF`);
      } else if (p === "foul" || p === "bunt_foul") {
        strikeTokens.push(`${seq}F`);
      } else if (
        p === "bunt_swinging" &&
        (rules.buntPitchMark === "v_dot_circle_dot" ||
          rules.buntPitchMark === "inv_triangle_diamond")
      ) {
        strikeTokens.push(`${seq}BS`);
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
    (p) =>
      p !== "in_play" &&
      p !== "hit" &&
      p !== "hbp" &&
      !(rules.pickoffMark === "hidden" && isPickoffPitch(p))
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
        if (p === "bunt_swinging") {
          if (rules.buntPitchMark === "v_dot_circle_dot") {
            // バント空振り＝○の中に・（外周白抜き丸＋中心黒点）
            return (
              <g key={idx}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={2.85}
                  fill="none"
                  stroke={COLOR_INK}
                  strokeWidth={1.15}
                />
                <circle cx={cx} cy={cy} r={0.95} fill={COLOR_INK} />
              </g>
            );
          }
          if (rules.buntPitchMark === "inv_triangle_diamond") {
            return (
              <polygon
                key={idx}
                points={`${cx},${cy - 2.9} ${cx + 2.8},${cy} ${cx},${cy + 2.9} ${cx - 2.8},${cy}`}
                fill="none"
                stroke={COLOR_INK}
                strokeWidth={1.15}
              />
            );
          }
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
          if (rules.buntPitchMark === "v_dot_circle_dot") {
            // バントファウル＝Vの中に・（上向き開きのVシェブロン＋内側黒点）
            return (
              <g key={idx}>
                <polyline
                  points={`${cx - 2.9},${cy - 2.3} ${cx},${cy + 2.6} ${cx + 2.9},${cy - 2.3}`}
                  fill="none"
                  stroke={COLOR_INK}
                  strokeWidth={1.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx={cx} cy={cy - 0.85} r={0.95} fill={COLOR_INK} />
              </g>
            );
          }
          if (rules.buntPitchMark === "inv_triangle_diamond") {
            return (
              <polygon
                key={idx}
                points={`${cx},${cy + 2.7} ${cx - 3},${cy - 2.3} ${cx + 3},${cy - 2.3}`}
                fill="none"
                stroke={COLOR_INK}
                strokeWidth={1.15}
              />
            );
          }
          if (rules.buntPitchMark === "same_as_normal") {
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

        // 牽制球（1塁: pickoff_1b / pickoff, 2塁: pickoff_2b, 3塁: pickoff_3b）
        if (rules.pickoffMark === "chevron_arrow") {
          // 軸線なし・底辺なし・中塗りなしの矢先（シェブロン）記号: 1塁=＞, 2塁=∧, 3塁=＜
          if (p === "pickoff_2b") {
            return (
              <polyline
                key={idx}
                points={`${cx - 2.7},${cy + 2.1} ${cx},${cy - 2.3} ${cx + 2.7},${cy + 2.1}`}
                fill="none"
                stroke={COLOR_INK}
                strokeWidth={1.35}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          }
          if (p === "pickoff_3b") {
            return (
              <polyline
                key={idx}
                points={`${cx + 2.3},${cy - 2.5} ${cx - 2.3},${cy} ${cx + 2.3},${cy + 2.5}`}
                fill="none"
                stroke={COLOR_INK}
                strokeWidth={1.35}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          }
          // 1塁牽制（右矢先 ＞）
          return (
            <polyline
              key={idx}
              points={`${cx - 2.3},${cy - 2.5} ${cx + 2.3},${cy} ${cx - 2.3},${cy + 2.5}`}
              fill="none"
              stroke={COLOR_INK}
              strokeWidth={1.35}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        }

        if (rules.pickoffMark === "full_arrow") {
          // 軸線付き矢印（中塗りなし）: 1塁=→, 2塁=↑, 3塁=←
          if (p === "pickoff_2b") {
            return (
              <g
                key={idx}
                fill="none"
                stroke={COLOR_INK}
                strokeWidth={1.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1={cx} y1={cy + 2.7} x2={cx} y2={cy - 2.5} />
                <polyline
                  points={`${cx - 2.2},${cy - 0.3} ${cx},${cy - 2.7} ${cx + 2.2},${cy - 0.3}`}
                />
              </g>
            );
          }
          if (p === "pickoff_3b") {
            return (
              <g
                key={idx}
                fill="none"
                stroke={COLOR_INK}
                strokeWidth={1.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1={cx + 3.2} y1={cy} x2={cx - 2.8} y2={cy} />
                <polyline
                  points={`${cx - 0.4},${cy - 2.1} ${cx - 3.0},${cy} ${cx - 0.4},${cy + 2.1}`}
                />
              </g>
            );
          }
          return (
            <g
              key={idx}
              fill="none"
              stroke={COLOR_INK}
              strokeWidth={1.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1={cx - 3.2} y1={cy} x2={cx + 2.8} y2={cy} />
              <polyline
                points={`${cx + 0.4},${cy - 2.1} ${cx + 3.0},${cy} ${cx + 0.4},${cy + 2.1}`}
              />
            </g>
          );
        }

        // kanji_num: 1牽・2牽・3牽
        const pickoffLabel =
          p === "pickoff_1b"
            ? "1牽"
            : p === "pickoff_2b"
            ? "2牽"
            : p === "pickoff_3b"
            ? "3牽"
            : "牽";
        return (
          <text
            key={idx}
            x={cx}
            y={cy + 2}
            fontSize={5.4}
            fontWeight={800}
            textAnchor="middle"
            fill={COLOR_BLUE}
            fontFamily={FONT_SANS}
          >
            {pickoffLabel}
          </text>
        );
      })}
    </g>
  );
}

function getAtBatHitBases(
  rc: NonNullable<CompiledScorebookCell["atBat"]>["resultCode"] | undefined
): 0 | 1 | 2 | 3 | 4 {
  if (rc === "single") return 1;
  if (rc === "double") return 2;
  if (rc === "triple") return 3;
  if (rc === "home_run") return 4;
  return 0;
}

function renderHitHashMarks(
  hitBases: 1 | 2 | 3 | 4,
  rules: ScorebookSymbolRules,
  cellGeom: CellGeometry,
  ox: number,
  oy: number
): React.ReactNode {
  const color = rules.hitLine === "mono_bold" ? COLOR_INK : COLOR_RED;
  const mx = ox + (cellGeom.ptHP.x + cellGeom.pt1B.x) / 2;
  const my = oy + (cellGeom.ptHP.y + cellGeom.pt1B.y) / 2;
  const dx = cellGeom.pt1B.x - cellGeom.ptHP.x;
  const dy = cellGeom.pt1B.y - cellGeom.ptHP.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;

  const count = hitBases;
  const halfLen = 3.9;
  const spacing = cellGeom.hasQuadrantCrosshairs ? 3.2 : 3.6;
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
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
}

function renderQuadrantHitSlashes(
  hitBases: 1 | 2 | 3,
  cellGeom: CellGeometry,
  ox: number,
  oy: number
): React.ReactNode {
  const baseCx = ox + (cellGeom.hasQuadrantCrosshairs ? 65.0 : 67.2);
  const baseCy = oy + (cellGeom.hasQuadrantCrosshairs ? 51.4 : 52.0);
  const ux = Math.SQRT1_2;
  const uy = -Math.SQRT1_2;
  const nx = Math.SQRT1_2;
  const ny = Math.SQRT1_2;
  const halfSlash = hitBases === 3 ? 5.6 : 6.2;
  const step = hitBases === 3 ? 2.75 : 3.2;
  const strokeW = hitBases === 3 ? 1.55 : 1.8;

  const offsets: number[] = [];
  for (let i = 0; i < hitBases; i++) {
    offsets.push((i - (hitBases - 1) / 2) * step);
  }

  return (
    <g>
      {offsets.map((off, idx) => {
        const cx = baseCx + nx * off;
        const cy = baseCy + ny * off;
        return (
          <line
            key={idx}
            x1={cx - ux * halfSlash}
            y1={cy - uy * halfSlash}
            x2={cx + ux * halfSlash}
            y2={cy + uy * halfSlash}
            stroke={COLOR_RED}
            strokeWidth={strokeW}
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
}

function renderParallelHitInnerDiamond(
  cellGeom: CellGeometry,
  ox: number,
  oy: number
): React.ReactNode {
  const cx = ox + cellGeom.ptCenter.x;
  const cy = oy + cellGeom.ptCenter.y;
  const scale = 0.78;
  const pts = [cellGeom.ptHP, cellGeom.pt1B, cellGeom.pt2B, cellGeom.pt3B]
    .map((pt) => {
      const px = cx + (ox + pt.x - cx) * scale;
      const py = cy + (oy + pt.y - cy) * scale;
      return `${px.toFixed(2)},${py.toFixed(2)}`;
    })
    .join(" ");

  return (
    <polygon
      points={pts}
      fill="none"
      stroke={COLOR_RED}
      strokeWidth={1.3}
      strokeLinejoin="round"
    />
  );
}

function renderDiamondSegment(
  seg: CompiledDiamondSegment,
  rules: ScorebookSymbolRules,
  cellGeom: CellGeometry,
  ox: number,
  oy: number
): React.ReactNode {
  const geom = cellGeom.segments[seg.segment];
  const x1 = ox + geom.from.x;
  const y1 = oy + geom.from.y;
  const x2 = ox + geom.to.x;
  const y2 = oy + geom.to.y;

  const useRedStroke =
    rules.hitLine === "mono_bold"
      ? false
      : rules.hitLine === "quadrant_slash_hr_diamond"
      ? seg.isBatterHit && seg.hitBases === 4
      : seg.isBatterHit;

  const isExplicitHitStroke =
    seg.isBatterHit &&
    (rules.hitLine !== "quadrant_slash_hr_diamond" || seg.hitBases === 4);

  const shouldDrawSegmentLine =
    isExplicitHitStroke || rules.runnerLine === "solid_trace";

  const strokeColor = useRedStroke ? COLOR_RED : COLOR_INK;
  const strokeW =
    rules.hitLine === "mono_bold" && seg.isBatterHit
      ? 2.8
      : useRedStroke
      ? 2.4
      : 1.75;

  const advLabel = !seg.isBatterHit
    ? formatAdvanceMethodByRules(seg.method, rules, seg.drivingBatterOrder)
    : "";

  if (seg.status === "out") {
    if (rules.runnerOutLine === "dotted_only") {
      if (!advLabel) return null;
      return (
        <g key={`seg-${seg.segment}`}>
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
        </g>
      );
    }

    if (rules.runnerOutLine === "quadrant_arrow") {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const onx = -dy / len;
      const ony = dx / len;
      const outDist = cellGeom.hasQuadrantCrosshairs ? 5.6 : 4.8;
      const halfArrow = cellGeom.hasQuadrantCrosshairs ? 4.1 : 3.8;
      const mx = (x1 + x2) / 2 + onx * outDist;
      const my = (y1 + y2) / 2 + ony * outDist;
      const ax1 = mx - ux * halfArrow;
      const ay1 = my - uy * halfArrow;
      const ax2 = mx + ux * halfArrow;
      const ay2 = my + uy * halfArrow;
      const wingBack = 2.6;
      const wingHalfW = 2.05;
      const w1x = ax2 - ux * wingBack + onx * wingHalfW;
      const w1y = ay2 - uy * wingBack + ony * wingHalfW;
      const w2x = ax2 - ux * wingBack - onx * wingHalfW;
      const w2y = ay2 - uy * wingBack - ony * wingHalfW;

      const arrowLabelPos =
        seg.segment === 1
          ? { x: 76.5, y: 47.5 }
          : seg.segment === 2
          ? { x: 76.5, y: cellGeom.hasQuadrantCrosshairs ? 15.5 : 13.5 }
          : seg.segment === 3
          ? { x: 30.5, y: cellGeom.hasQuadrantCrosshairs ? 15.5 : 13.5 }
          : { x: 31.5, y: cellGeom.hasQuadrantCrosshairs ? 62.5 : 59.5 };

      return (
        <g key={`seg-${seg.segment}`}>
          <line
            x1={ax1}
            y1={ay1}
            x2={ax2}
            y2={ay2}
            stroke={COLOR_INK}
            strokeWidth={1.3}
            strokeLinecap="round"
          />
          <polyline
            points={`${w1x.toFixed(2)},${w1y.toFixed(2)} ${ax2.toFixed(2)},${ay2.toFixed(2)} ${w2x.toFixed(2)},${w2y.toFixed(2)}`}
            fill="none"
            stroke={COLOR_INK}
            strokeWidth={1.3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {advLabel && (
            <text
              x={ox + arrowLabelPos.x}
              y={oy + arrowLabelPos.y}
              fontSize={7.0}
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

    const ratio = 0.66;
    const stopX = x1 + (x2 - x1) * ratio;
    const stopY = y1 + (y2 - y1) * ratio;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * 4.0;
    const ny = (dx / len) * 4.0;

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

  // parallel_bars: 1塁線自体を二塁打＝二重赤線、三塁打＝三重赤線で描画
  if (
    rules.hitLine === "parallel_bars" &&
    seg.segment === 1 &&
    seg.isBatterHit &&
    (seg.hitBases === 2 || seg.hitBases === 3)
  ) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const pStep = seg.hitBases === 3 ? 2.25 : 1.45;
    const pWidth = seg.hitBases === 3 ? 1.35 : 1.65;
    const pOffsets =
      seg.hitBases === 3 ? [-pStep, 0, pStep] : [-pStep, pStep];

    return (
      <g key={`seg-${seg.segment}`}>
        {pOffsets.map((off, idx) => (
          <line
            key={idx}
            x1={x1 + nx * off}
            y1={y1 + ny * off}
            x2={x2 + nx * off}
            y2={y2 + ny * off}
            stroke={COLOR_RED}
            strokeWidth={pWidth}
            strokeLinecap="round"
          />
        ))}
      </g>
    );
  }

  if (!shouldDrawSegmentLine && !advLabel) {
    return null;
  }

  return (
    <g key={`seg-${seg.segment}`}>
      {shouldDrawSegmentLine && (
        <>
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
          {(rules.hitLine === "red_slash" || rules.hitLine === "mono_bold") &&
            seg.segment === 1 &&
            seg.isBatterHit &&
            seg.hitBases !== 0 &&
            renderHitHashMarks(seg.hitBases, rules, cellGeom, ox, oy)}
        </>
      )}
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
  cellGeom: CellGeometry,
  ox: number,
  oy: number
): React.ReactNode {
  const cx = ox + cellGeom.ptCenter.x;
  const cy = oy + cellGeom.ptCenter.y;
  const runColor = rules.hitLine === "mono_bold" ? COLOR_INK : COLOR_RED;
  const compact = cellGeom.hasQuadrantCrosshairs;

  if (cell.runScored) {
    if (rules.runMark === "double_circle") {
      return (
        <g>
          <circle
            cx={cx}
            cy={cy}
            r={compact ? 7.0 : 7.8}
            fill={COLOR_PAPER}
            stroke={runColor}
            strokeWidth={1.7}
          />
          <circle cx={cx} cy={cy} r={compact ? 3.7 : 4.2} fill={runColor} />
        </g>
      );
    }
    if (rules.runMark === "kanji_toku") {
      return (
        <g>
          <circle
            cx={cx}
            cy={cy}
            r={compact ? 7.4 : 8.2}
            fill={COLOR_PAPER}
            stroke={runColor}
            strokeWidth={1.55}
          />
          <text
            x={cx}
            y={cy + 3.2}
            fontSize={compact ? 8.8 : 9.5}
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
    return <circle cx={cx} cy={cy} r={compact ? 6.3 : 7.2} fill={runColor} />;
  }

  if (cell.outNumber) {
    const outText = formatOutOrdinalText(cell.outNumber, rules);
    return (
      <text
        x={cx}
        y={cy + 4.3}
        fontSize={compact ? 12.2 : 13}
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
        y={cy + 4.2}
        fontSize={compact ? 11.8 : 12.5}
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
  cellGeom: CellGeometry,
  ox: number,
  oy: number,
  hasQuadrantHitSlash = false
): React.ReactNode {
  if (!notation.mainText) return null;

  const px =
    ox +
    (hasQuadrantHitSlash
      ? cellGeom.hasQuadrantCrosshairs
        ? 75.5
        : 76.0
      : cellGeom.playNotationPos.x);
  const py =
    oy +
    (hasQuadrantHitSlash
      ? cellGeom.hasQuadrantCrosshairs
        ? 66.2
        : 66.8
      : cellGeom.playNotationPos.y);
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
    notation.decorator === "sac_fly_umbrella" ||
    notation.decorator === "bunt_fly_square_umbrella"
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
        {notation.decorator === "bunt_fly_square_umbrella" && (
          <rect
            x={px - 8.5}
            y={py - 13}
            width={17}
            height={16.5}
            fill="none"
            stroke={ink}
            strokeWidth={1.15}
          />
        )}
        <path
          d={`M ${px - 5.8} ${py - 8.2} Q ${px} ${py - 12.6} ${px + 5.8} ${py - 8.2}`}
          fill="none"
          stroke={ink}
          strokeWidth={1.35}
          strokeLinecap="round"
        />
        <text
          x={px}
          y={py + 0.5}
          fontSize={9.6}
          fontWeight={900}
          textAnchor="middle"
          fill={ink}
          fontFamily={FONT_MONO}
        >
          {notation.mainText}
        </text>
        {notation.subText && (
          <text
            x={
              notation.decorator === "bunt_fly_square_umbrella"
                ? px
                : px + 8.5
            }
            y={
              notation.decorator === "bunt_fly_square_umbrella"
                ? py + 9.2
                : py + 0.5
            }
            fontSize={6.2}
            fontWeight={800}
            textAnchor={
              notation.decorator === "bunt_fly_square_umbrella"
                ? "middle"
                : "start"
            }
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

  if (notation.decorator === "sac_square") {
    const boxW = notation.mainText.length >= 5 ? 21 : 19;
    const boxH = 12.2;
    const boxFontSize = notation.mainText.length >= 5 ? 6.8 : 8.1;
    return (
      <g>
        <rect
          x={px - boxW / 2}
          y={py - 9.5}
          width={boxW}
          height={boxH}
          fill="none"
          stroke={ink}
          strokeWidth={1.15}
        />
        <text
          x={px}
          y={py - 0.5}
          fontSize={boxFontSize}
          fontWeight={900}
          textAnchor="middle"
          fill={ink}
          fontFamily={FONT_MONO}
        >
          {notation.mainText}
        </text>
        {notation.subText && (
          <text
            x={px}
            y={py + 8.3}
            fontSize={5.8}
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
        {notation.subText && (
          <text
            x={px}
            y={py + 9.2}
            fontSize={5.8}
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

  const fontSize = hasQuadrantHitSlash
    ? notation.mainText.length >= 5
      ? 7.4
      : notation.mainText.length >= 4
      ? 8.0
      : 9.0
    : notation.mainText.length >= 5
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
  const cellGeom = getCellGeometry(rules);
  const playNotation = ab ? formatAtBatPlayNotation(ab, rules) : null;
  const abHitBases = getAtBatHitBases(ab?.resultCode);
  const hasQuadrantHitSlash =
    rules.hitLine === "quadrant_slash_hr_diamond" &&
    (abHitBases === 1 || abHitBases === 2 || abHitBases === 3);
  const rbiCount = Math.max(0, ab?.rbi || 0);
  const rbiColor = rules.hitLine === "mono_bold" ? COLOR_INK : COLOR_RED;
  const showBsoSubLines =
    rules.cellStyle === "quadrant_bso_grid" && rules.pitchMark !== "numbered_bs";

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

      {/* 左BSO縦区切り線（標準の「十字4分割＋BSO空欄」では中を完全白紙に保つ） */}
      <line
        x1={ox + BSO_W}
        y1={oy}
        x2={ox + BSO_W}
        y2={oy + CELL_H}
        stroke={COLOR_GRID}
        strokeWidth={0.85}
      />

      {/* BSO横仕切り線（「十字4分割＋横枠」選択時のみ描画） */}
      {showBsoSubLines && (
        <g>
          <line
            x1={ox}
            y1={oy + 24.5}
            x2={ox + BSO_W}
            y2={oy + 24.5}
            stroke={COLOR_GRID_LIGHT}
            strokeWidth={0.75}
            strokeDasharray="2,2"
          />
          <line
            x1={ox}
            y1={oy + 49.5}
            x2={ox + BSO_W}
            y2={oy + 49.5}
            stroke={COLOR_GRID_LIGHT}
            strokeWidth={0.75}
            strokeDasharray="2,2"
          />
        </g>
      )}

      {/* 事前印刷の点線ダイヤモンド ＆ 十字4分割ガイド点線 */}
      <polygon
        points={`${ox + cellGeom.ptHP.x},${oy + cellGeom.ptHP.y} ${ox + cellGeom.pt1B.x},${oy + cellGeom.pt1B.y} ${ox + cellGeom.pt2B.x},${oy + cellGeom.pt2B.y} ${ox + cellGeom.pt3B.x},${oy + cellGeom.pt3B.y}`}
        fill="none"
        stroke={cellGeom.hasQuadrantCrosshairs ? "#94a3b8" : "#cbd5e1"}
        strokeWidth={cellGeom.hasQuadrantCrosshairs ? 0.95 : 0.9}
        strokeDasharray={cellGeom.hasQuadrantCrosshairs ? "2.2,2.1" : "2,2"}
      />
      {cellGeom.hasQuadrantCrosshairs && (
        <g stroke="#94a3b8" strokeWidth={0.95} strokeDasharray="2.2,2.1">
          {/* 上辺 ➔ 二塁頂点 */}
          <line
            x1={ox + cellGeom.pt2B.x}
            y1={oy}
            x2={ox + cellGeom.pt2B.x}
            y2={oy + cellGeom.pt2B.y}
          />
          {/* 本塁頂点 ➔ 下辺 */}
          <line
            x1={ox + cellGeom.ptHP.x}
            y1={oy + cellGeom.ptHP.y}
            x2={ox + cellGeom.ptHP.x}
            y2={oy + CELL_H}
          />
          {/* BSO境界 ➔ 三塁頂点 */}
          <line
            x1={ox + BSO_W}
            y1={oy + cellGeom.pt3B.y}
            x2={ox + cellGeom.pt3B.x}
            y2={oy + cellGeom.pt3B.y}
          />
          {/* 一塁頂点 ➔ 右辺 */}
          <line
            x1={ox + cellGeom.pt1B.x}
            y1={oy + cellGeom.pt1B.y}
            x2={ox + CELL_W}
            y2={oy + cellGeom.pt1B.y}
          />
        </g>
      )}
      {cellGeom.hasBaseMiniSquares &&
        [cellGeom.ptHP, cellGeom.pt1B, cellGeom.pt2B, cellGeom.pt3B].map(
          (pt, bIdx) => (
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
          )
        )}

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
          return renderDiamondSegment(seg, rules, cellGeom, ox, oy);
        })}

      {/* parallel_bars 時の本塁打用：内側赤ダイヤ二重枠 */}
      {rules.hitLine === "parallel_bars" &&
        abHitBases === 4 &&
        renderParallelHitInnerDiamond(cellGeom, ox, oy)}

      {/* quadrant_slash_hr_diamond 時の単打・二塁打・三塁打用：右下赤斜線（／・／／・／／／） */}
      {hasQuadrantHitSlash &&
        renderQuadrantHitSlashes(
          abHitBases as 1 | 2 | 3,
          cellGeom,
          ox,
          oy
        )}

      {/* 中央ステータス（●得点 / ⅠⅡⅢ・①②③アウト / ℓ残塁） */}
      {cell && renderCenterStatus(cell, rules, cellGeom, ox, oy)}

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
      {playNotation &&
        renderPlayNotation(
          playNotation,
          cellGeom,
          ox,
          oy,
          hasQuadrantHitSlash
        )}

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

function getLineupTotalWidth(rules: ScorebookSymbolRules): number {
  return rules.lineupStyle === "compact_order_first"
    ? COMPACT_LINEUP_TOTAL_W
    : CLASSIC_LINEUP_TOTAL_W;
}

function normalizeBatsFlag(
  raw: string | null | undefined
): "R" | "L" | "B" | null {
  if (!raw) return null;
  const u = raw.trim().toUpperCase();
  if (u === "L" || u === "左" || u === "左打") return "L";
  if (u === "B" || u === "S" || u === "両" || u === "両打") return "B";
  if (u === "R" || u === "右" || u === "右打") return "R";
  return null;
}

interface ClassicLineupSubRow {
  name: string;
  uniformNumber: string;
  bats: "R" | "L" | "B" | null;
  entryTimingLabel: string;
}

interface ClassicBatterSlotModel {
  rows: [ClassicLineupSubRow, ClassicLineupSubRow, ClassicLineupSubRow];
  posGrid: [
    [string, string, string, string],
    [string, string, string, string],
    [string, string, string, string],
  ];
}

function isRolePlaceholderToken(tok: string): boolean {
  return (
    tok === "PH" ||
    tok === "PR" ||
    tok === "TR" ||
    tok === "打" ||
    tok === "走" ||
    tok === "臨"
  );
}

function buildClassicBatterSlotModel(
  slot: ScorebookBatterSlot,
  isTop: boolean,
  rules: ScorebookSymbolRules
): ClassicBatterSlotModel {
  const rows: [ClassicLineupSubRow, ClassicLineupSubRow, ClassicLineupSubRow] = [
    {
      name: slot.name.trim(),
      uniformNumber: slot.uniformNumber.trim(),
      bats: normalizeBatsFlag(slot.bats),
      entryTimingLabel: "",
    },
    { name: "", uniformNumber: "", bats: null, entryTimingLabel: "" },
    { name: "", uniformNumber: "", bats: null, entryTimingLabel: "" },
  ];

  const posGrid: ClassicBatterSlotModel["posGrid"] = [
    [
      slot.position.trim()
        ? formatPositionByRules(slot.position, rules)
        : "",
      "",
      "",
      "",
    ],
    ["", "", "", ""],
    ["", "", "", ""],
  ];

  let activeRowIdx: 0 | 1 | 2 = 0;
  let activePlayerId = slot.playerId || null;
  let activeCleanName = slot.name.replace(/\s+/g, "");
  let activeEnteredInning = 1;
  let nextChangeCol = 1;

  for (const sub of slot.substitutions) {
    const cleanSubName = sub.name.replace(/\s+/g, "");
    const cleanSubPos = sub.position.trim();
    const cleanSubNum = sub.uniformNumber.trim();
    if (!cleanSubName && !cleanSubPos && !cleanSubNum) {
      continue;
    }

    const posToken = cleanSubPos
      ? formatPositionByRules(cleanSubPos, rules)
      : rules.positionLabel === "kanji"
      ? sub.subType === "PR"
        ? "走"
        : sub.subType === "TR"
        ? "臨"
        : "打"
      : sub.subType;

    const isSamePlayer =
      (Boolean(sub.playerId) &&
        Boolean(activePlayerId) &&
        sub.playerId === activePlayerId) ||
      ((!sub.playerId || !activePlayerId) &&
        cleanSubName !== "" &&
        activeCleanName !== "" &&
        cleanSubName === activeCleanName) ||
      (cleanSubName === "" && sub.subType === "DEF");

    if (isSamePlayer) {
      let lastCol = -1;
      let lastTok = "";
      for (let c = 3; c >= 0; c--) {
        if (posGrid[activeRowIdx][c] !== "") {
          lastCol = c;
          lastTok = posGrid[activeRowIdx][c];
          break;
        }
      }

      if (posToken && posToken !== lastTok) {
        if (
          activeRowIdx > 0 &&
          lastCol >= 1 &&
          isRolePlaceholderToken(lastTok) &&
          sub.subType === "DEF" &&
          cleanSubPos !== "" &&
          sub.inningEntered === activeEnteredInning
        ) {
          // 同一回表裏の「代打→そのまま守備就位」は同じセルに守備位置を統合
          posGrid[activeRowIdx][lastCol] = posToken;
        } else {
          const targetCol = Math.min(3, Math.max(1, nextChangeCol));
          posGrid[activeRowIdx][targetCol] = posToken;
          nextChangeCol = Math.min(3, targetCol + 1);
        }
      }
      if (sub.bats && !rows[activeRowIdx].bats) {
        rows[activeRowIdx].bats = normalizeBatsFlag(sub.bats);
      }
      if (cleanSubNum && !rows[activeRowIdx].uniformNumber) {
        rows[activeRowIdx].uniformNumber = cleanSubNum;
      }
      continue;
    }

    const entryHalf =
      sub.subType === "DEF"
        ? isTop
          ? "裏"
          : "表"
        : isTop
        ? "表"
        : "裏";
    const timingLabel =
      sub.inningEntered > 0 ? `${sub.inningEntered}${entryHalf}` : "";

    if (activeRowIdx < 2) {
      activeRowIdx = (activeRowIdx + 1) as 1 | 2;
      rows[activeRowIdx] = {
        name: sub.name.trim(),
        uniformNumber: cleanSubNum,
        bats: normalizeBatsFlag(sub.bats),
        entryTimingLabel: timingLabel,
      };
    } else {
      rows[2] = {
        name: rows[2].name
          ? `${rows[2].name}/${sub.name.trim()}`
          : sub.name.trim(),
        uniformNumber: cleanSubNum || rows[2].uniformNumber,
        bats: normalizeBatsFlag(sub.bats) ?? rows[2].bats,
        entryTimingLabel: timingLabel || rows[2].entryTimingLabel,
      };
    }

    activePlayerId = sub.playerId || null;
    activeCleanName = cleanSubName;
    activeEnteredInning = sub.inningEntered || 1;

    if (posToken) {
      const targetCol = Math.min(3, Math.max(activeRowIdx, nextChangeCol));
      posGrid[activeRowIdx][targetCol] = posToken;
      nextChangeCol = Math.min(3, targetCol + 1);
    }
  }

  return { rows, posGrid };
}

function renderLineupHeaderSvg(
  lineupX: number,
  tableTopY: number,
  colHeadH: number,
  rules: ScorebookSymbolRules
): React.ReactNode {
  if (rules.lineupStyle === "compact_order_first") {
    return (
      <g>
        {(
          [
            { x: lineupX, w: COMPACT_ORD_W, label: "順" },
            { x: lineupX + COMPACT_ORD_W, w: COMPACT_POS_W, label: "守備" },
            {
              x: lineupX + COMPACT_ORD_W + COMPACT_POS_W,
              w: COMPACT_NUM_W,
              label: "背番",
            },
            {
              x: lineupX + COMPACT_ORD_W + COMPACT_POS_W + COMPACT_NUM_W,
              w: COMPACT_NAME_W,
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
                y2={tableTopY + colHeadH}
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
      </g>
    );
  }

  const starterPosX = lineupX;
  const subPosX = starterPosX + CLASSIC_STARTER_POS_W;
  const ordX = lineupX + CLASSIC_POS_TOTAL_W;
  const leftyX = ordX + CLASSIC_ORD_W;
  const nameX = leftyX + CLASSIC_LEFTY_W;
  const numX = nameX + CLASSIC_NAME_W;

  return (
    <g>
      {/* 先発 */}
      <text
        x={starterPosX + CLASSIC_STARTER_POS_W / 2}
        y={tableTopY + 19.2}
        fontSize={7.4}
        fontWeight={900}
        textAnchor="middle"
        fill={COLOR_INK}
      >
        先発
      </text>
      <line
        x1={subPosX}
        y1={tableTopY}
        x2={subPosX}
        y2={tableTopY + colHeadH}
        stroke={COLOR_GRID}
        strokeWidth={0.85}
      />

      {/* 守備位置 */}
      <text
        x={subPosX + (CLASSIC_SUB_POS_COL_W * 3) / 2}
        y={tableTopY + 19.2}
        fontSize={8.8}
        fontWeight={900}
        textAnchor="middle"
        fill={COLOR_INK}
      >
        守備位置
      </text>
      <line
        x1={ordX}
        y1={tableTopY}
        x2={ordX}
        y2={tableTopY + colHeadH}
        stroke={COLOR_GRID}
        strokeWidth={0.95}
      />

      {/* 打順（縦2段） */}
      <text
        x={ordX + CLASSIC_ORD_W / 2}
        y={tableTopY + 12.2}
        fontSize={8.2}
        fontWeight={900}
        textAnchor="middle"
        fill={COLOR_INK}
      >
        打
      </text>
      <text
        x={ordX + CLASSIC_ORD_W / 2}
        y={tableTopY + 24.4}
        fontSize={8.2}
        fontWeight={900}
        textAnchor="middle"
        fill={COLOR_INK}
      >
        順
      </text>
      <line
        x1={leftyX}
        y1={tableTopY}
        x2={leftyX}
        y2={tableTopY + colHeadH}
        stroke={COLOR_GRID}
        strokeWidth={0.85}
      />

      {/* 左○（左打者丸印欄） */}
      <text
        x={leftyX + CLASSIC_LEFTY_W / 2}
        y={tableTopY + 12.2}
        fontSize={8}
        fontWeight={900}
        textAnchor="middle"
        fill={COLOR_INK}
      >
        左
      </text>
      <circle
        cx={leftyX + CLASSIC_LEFTY_W / 2}
        cy={tableTopY + 22}
        r={3.7}
        fill="none"
        stroke={COLOR_INK}
        strokeWidth={1.15}
      />
      <line
        x1={nameX}
        y1={tableTopY}
        x2={nameX}
        y2={tableTopY + colHeadH}
        stroke={COLOR_GRID}
        strokeWidth={0.85}
      />

      {/* 選 手 名 */}
      <text
        x={nameX + CLASSIC_NAME_W / 2}
        y={tableTopY + 19.2}
        fontSize={9.8}
        fontWeight={900}
        textAnchor="middle"
        fill={COLOR_INK}
      >
        選　手　名
      </text>
      <line
        x1={numX}
        y1={tableTopY}
        x2={numX}
        y2={tableTopY + colHeadH}
        stroke={COLOR_GRID}
        strokeWidth={0.85}
      />

      {/* 背番号（縦3文字） */}
      <text
        x={numX + CLASSIC_NUM_W / 2}
        y={tableTopY + 9.6}
        fontSize={7.1}
        fontWeight={900}
        textAnchor="middle"
        fill={COLOR_INK}
      >
        背
      </text>
      <text
        x={numX + CLASSIC_NUM_W / 2}
        y={tableTopY + 18.6}
        fontSize={7.1}
        fontWeight={900}
        textAnchor="middle"
        fill={COLOR_INK}
      >
        番
      </text>
      <text
        x={numX + CLASSIC_NUM_W / 2}
        y={tableTopY + 27.4}
        fontSize={7.1}
        fontWeight={900}
        textAnchor="middle"
        fill={COLOR_INK}
      >
        号
      </text>
    </g>
  );
}

function renderBatterLineupRowSvg(params: {
  slot: ScorebookBatterSlot;
  battingOrder: number;
  hasActivePlateAppearances: boolean;
  isTop: boolean;
  rules: ScorebookSymbolRules;
  lineupX: number;
  ry: number;
}): React.ReactNode {
  const {
    slot,
    battingOrder,
    hasActivePlateAppearances,
    isTop,
    rules,
    lineupX,
    ry,
  } = params;

  if (rules.lineupStyle === "compact_order_first") {
    const subs = slot.substitutions.filter((s) => s.name.trim() !== "");
    const hasSubs = subs.length > 0;
    const starterPos = formatPositionByRules(slot.position, rules);

    return (
      <g>
        <rect
          x={lineupX}
          y={ry}
          width={COMPACT_LINEUP_TOTAL_W}
          height={CELL_H}
          fill={COLOR_PAPER}
          stroke={COLOR_GRID}
          strokeWidth={0.9}
        />
        <line
          x1={lineupX + COMPACT_ORD_W}
          y1={ry}
          x2={lineupX + COMPACT_ORD_W}
          y2={ry + CELL_H}
          stroke={COLOR_GRID}
          strokeWidth={0.8}
        />
        <line
          x1={lineupX + COMPACT_ORD_W + COMPACT_POS_W}
          y1={ry}
          x2={lineupX + COMPACT_ORD_W + COMPACT_POS_W}
          y2={ry + CELL_H}
          stroke={COLOR_GRID}
          strokeWidth={0.8}
        />
        <line
          x1={lineupX + COMPACT_ORD_W + COMPACT_POS_W + COMPACT_NUM_W}
          y1={ry}
          x2={lineupX + COMPACT_ORD_W + COMPACT_POS_W + COMPACT_NUM_W}
          y2={ry + CELL_H}
          stroke={COLOR_GRID}
          strokeWidth={0.8}
        />

        <text
          x={lineupX + COMPACT_ORD_W / 2}
          y={ry + CELL_H / 2 + 4.5}
          fontSize={12.5}
          fontWeight={900}
          textAnchor="middle"
          fill={COLOR_INK}
          fontFamily={FONT_MONO}
        >
          {battingOrder}
        </text>

        {!hasSubs ? (
          <>
            <text
              x={lineupX + COMPACT_ORD_W + COMPACT_POS_W / 2}
              y={ry + CELL_H / 2 + 4}
              fontSize={11}
              fontWeight={800}
              textAnchor="middle"
              fill={COLOR_INK}
            >
              {starterPos}
            </text>
            <text
              x={lineupX + COMPACT_ORD_W + COMPACT_POS_W + COMPACT_NUM_W / 2}
              y={ry + CELL_H / 2 + 4}
              fontSize={10.5}
              fontWeight={800}
              textAnchor="middle"
              fill={COLOR_MUTED}
              fontFamily={FONT_MONO}
            >
              {slot.uniformNumber || "-"}
            </text>
            <text
              x={lineupX + COMPACT_ORD_W + COMPACT_POS_W + COMPACT_NUM_W + 8}
              y={ry + CELL_H / 2 + 4.5}
              fontSize={12}
              fontWeight={900}
              fill={COLOR_INK}
            >
              {(slot.name || (hasActivePlateAppearances ? `打者 ${battingOrder}` : "")).slice(
                0,
                10
              )}
            </text>
          </>
        ) : (
          <>
            <line
              x1={lineupX + COMPACT_ORD_W}
              y1={ry + 30}
              x2={lineupX + COMPACT_LINEUP_TOTAL_W}
              y2={ry + 30}
              stroke={COLOR_GRID_LIGHT}
              strokeWidth={0.85}
              strokeDasharray="2,2"
            />
            <text
              x={lineupX + COMPACT_ORD_W + COMPACT_POS_W / 2}
              y={ry + 19}
              fontSize={10}
              fontWeight={800}
              textAnchor="middle"
              fill={COLOR_INK}
            >
              {starterPos}
            </text>
            <text
              x={lineupX + COMPACT_ORD_W + COMPACT_POS_W + COMPACT_NUM_W / 2}
              y={ry + 19}
              fontSize={9.5}
              fontWeight={800}
              textAnchor="middle"
              fill={COLOR_MUTED}
              fontFamily={FONT_MONO}
            >
              {slot.uniformNumber || "-"}
            </text>
            <text
              x={lineupX + COMPACT_ORD_W + COMPACT_POS_W + COMPACT_NUM_W + 7}
              y={ry + 19.5}
              fontSize={10.8}
              fontWeight={900}
              fill={COLOR_INK}
            >
              {(slot.name || (hasActivePlateAppearances ? `打者 ${battingOrder}` : "")).slice(
                0,
                10
              )}
            </text>

            {subs.slice(0, 2).map((sub, sIdx) => {
              const sy = subs.length === 1 ? ry + 54 : ry + 45 + sIdx * 18;
              const subPosText = sub.position
                ? formatPositionByRules(sub.position, rules)
                : formatSubstitutionRoleShort(sub);
              return (
                <g key={sub.id || sIdx}>
                  <text
                    x={lineupX + COMPACT_ORD_W + COMPACT_POS_W / 2}
                    y={sy}
                    fontSize={8.8}
                    fontWeight={800}
                    textAnchor="middle"
                    fill={COLOR_BLUE}
                  >
                    {subPosText}
                  </text>
                  <text
                    x={
                      lineupX +
                      COMPACT_ORD_W +
                      COMPACT_POS_W +
                      COMPACT_NUM_W / 2
                    }
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
                    x={
                      lineupX +
                      COMPACT_ORD_W +
                      COMPACT_POS_W +
                      COMPACT_NUM_W +
                      6
                    }
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
      </g>
    );
  }

  // === 3段フル様式（先発・守備位置[4小列]｜打順[1/11/21]｜左○｜選 手 名[出場回]｜背番号） ===
  const classic = buildClassicBatterSlotModel(slot, isTop, rules);
  const subH = CELL_H / 3;
  const isMono = rules.hitLine === "mono_bold";

  const subPosX = lineupX + CLASSIC_STARTER_POS_W;
  const ordX = lineupX + CLASSIC_POS_TOTAL_W;
  const leftyX = ordX + CLASSIC_ORD_W;
  const nameX = leftyX + CLASSIC_LEFTY_W;
  const numX = nameX + CLASSIC_NAME_W;

  const starterDisplayName =
    classic.rows[0].name ||
    (hasActivePlateAppearances ? `打者 ${battingOrder}` : "");

  return (
    <g>
      {/* 外枠背景 */}
      <rect
        x={lineupX}
        y={ry}
        width={CLASSIC_LINEUP_TOTAL_W}
        height={CELL_H}
        fill={COLOR_PAPER}
        stroke={COLOR_GRID}
        strokeWidth={0.9}
      />

      {/* 打順1段目の反転バッジセル */}
      <rect
        x={ordX}
        y={ry}
        width={CLASSIC_ORD_W}
        height={subH}
        fill={isMono ? COLOR_FRAME : COLOR_SAGE_BADGE}
      />

      {/* 3段水平罫線 */}
      <line
        x1={lineupX}
        y1={ry + subH}
        x2={lineupX + CLASSIC_LINEUP_TOTAL_W}
        y2={ry + subH}
        stroke={COLOR_GRID_LIGHT}
        strokeWidth={0.75}
      />
      <line
        x1={lineupX}
        y1={ry + subH * 2}
        x2={lineupX + CLASSIC_LINEUP_TOTAL_W}
        y2={ry + subH * 2}
        stroke={COLOR_GRID_LIGHT}
        strokeWidth={0.75}
      />

      {/* 縦仕切り線（先発 / 守備変更3小列 / 打順 / 左○ / 選手名 / 背番号） */}
      <line
        x1={subPosX}
        y1={ry}
        x2={subPosX}
        y2={ry + CELL_H}
        stroke={COLOR_GRID}
        strokeWidth={0.85}
      />
      <line
        x1={subPosX + CLASSIC_SUB_POS_COL_W}
        y1={ry}
        x2={subPosX + CLASSIC_SUB_POS_COL_W}
        y2={ry + CELL_H}
        stroke={COLOR_GRID_LIGHT}
        strokeWidth={0.7}
      />
      <line
        x1={subPosX + CLASSIC_SUB_POS_COL_W * 2}
        y1={ry}
        x2={subPosX + CLASSIC_SUB_POS_COL_W * 2}
        y2={ry + CELL_H}
        stroke={COLOR_GRID_LIGHT}
        strokeWidth={0.7}
      />
      <line
        x1={ordX}
        y1={ry}
        x2={ordX}
        y2={ry + CELL_H}
        stroke={COLOR_GRID}
        strokeWidth={0.9}
      />
      <line
        x1={leftyX}
        y1={ry}
        x2={leftyX}
        y2={ry + CELL_H}
        stroke={COLOR_GRID}
        strokeWidth={0.85}
      />
      <line
        x1={nameX}
        y1={ry}
        x2={nameX}
        y2={ry + CELL_H}
        stroke={COLOR_GRID}
        strokeWidth={0.85}
      />
      <line
        x1={numX}
        y1={ry}
        x2={numX}
        y2={ry + CELL_H}
        stroke={COLOR_GRID}
        strokeWidth={0.85}
      />

      {/* 1. 先発・守備位置（3段 × 4小列） */}
      {classic.posGrid.map((rowArr, rIdx) =>
        rowArr.map((tok, cIdx) => {
          if (!tok) return null;
          const cx =
            cIdx === 0
              ? lineupX + CLASSIC_STARTER_POS_W / 2
              : subPosX + (cIdx - 0.5) * CLASSIC_SUB_POS_COL_W;
          const cy = ry + (rIdx + 0.5) * subH;
          const fSize =
            cIdx === 0
              ? tok.length >= 2
                ? 8.2
                : 10.6
              : tok.length >= 2
              ? 7.2
              : 9.8;
          return (
            <text
              key={`pos-${rIdx}-${cIdx}`}
              x={cx}
              y={cy + 3.6}
              fontSize={fSize}
              fontWeight={800}
              textAnchor="middle"
              fill={COLOR_INK}
              fontFamily={FONT_SANS}
            >
              {tok}
            </text>
          );
        })
      )}

      {/* 2. 打順（1段目: 反転白抜き 1〜10、2段目: 11〜20、3段目: 21〜30） */}
      <text
        x={ordX + CLASSIC_ORD_W / 2}
        y={ry + 0.5 * subH + 3.9}
        fontSize={battingOrder >= 10 ? 9.6 : 11.2}
        fontWeight={900}
        textAnchor="middle"
        fill="#ffffff"
        fontFamily={FONT_SANS}
      >
        {battingOrder}
      </text>
      {battingOrder <= 10 && (
        <>
          <text
            x={ordX + CLASSIC_ORD_W / 2}
            y={ry + 1.5 * subH + 3.2}
            fontSize={8.5}
            fontWeight={700}
            textAnchor="middle"
            fill={isMono ? COLOR_MUTED : COLOR_SAGE_SUB_ORD}
            fontFamily={FONT_MONO}
          >
            {battingOrder + 10}
          </text>
          <text
            x={ordX + CLASSIC_ORD_W / 2}
            y={ry + 2.5 * subH + 3.2}
            fontSize={8.5}
            fontWeight={700}
            textAnchor="middle"
            fill={isMono ? COLOR_MUTED : COLOR_SAGE_SUB_ORD}
            fontFamily={FONT_MONO}
          >
            {battingOrder + 20}
          </text>
        </>
      )}

      {/* 3. 左○（左打者＝○、両打ち＝◎） */}
      {classic.rows.map((pRow, rIdx) => {
        if (!pRow.bats || pRow.bats === "R") return null;
        const cx = leftyX + CLASSIC_LEFTY_W / 2;
        const cy = ry + (rIdx + 0.5) * subH;
        if (pRow.bats === "B") {
          return (
            <g key={`bats-${rIdx}`}>
              <circle
                cx={cx}
                cy={cy}
                r={5.4}
                fill="none"
                stroke={COLOR_INK}
                strokeWidth={1.1}
              />
              <circle
                cx={cx}
                cy={cy}
                r={2.5}
                fill="none"
                stroke={COLOR_INK}
                strokeWidth={1.0}
              />
            </g>
          );
        }
        return (
          <circle
            key={`bats-${rIdx}`}
            cx={cx}
            cy={cy}
            r={5.1}
            fill="none"
            stroke={COLOR_INK}
            strokeWidth={1.25}
          />
        );
      })}

      {/* 4. 選 手 名（1段目: 先発、2〜3段目: 途中出場選手＋右端に出場イニング表裏） */}
      {starterDisplayName && (
        <text
          x={nameX + 6}
          y={ry + 0.5 * subH + 3.8}
          fontSize={11}
          fontWeight={900}
          fill={COLOR_INK}
        >
          {starterDisplayName.slice(0, 10)}
        </text>
      )}
      {([1, 2] as const).map((rIdx) => {
        const subRow = classic.rows[rIdx];
        if (!subRow.name && !subRow.entryTimingLabel) return null;
        const cy = ry + (rIdx + 0.5) * subH;
        return (
          <g key={`sub-name-${rIdx}`}>
            {subRow.name && (
              <text
                x={nameX + 6}
                y={cy + 3.6}
                fontSize={10.2}
                fontWeight={800}
                fill={COLOR_INK}
              >
                {subRow.name.slice(0, subRow.entryTimingLabel ? 8 : 10)}
              </text>
            )}
            {subRow.entryTimingLabel && (
              <text
                x={nameX + CLASSIC_NAME_W - 5}
                y={cy + 3.3}
                fontSize={8.6}
                fontWeight={800}
                textAnchor="end"
                fill={COLOR_MUTED}
              >
                {subRow.entryTimingLabel}
              </text>
            )}
          </g>
        );
      })}

      {/* 5. 背番号（空欄時はハイフンを出さず白紙のまま清潔に表示） */}
      {classic.rows.map((pRow, rIdx) => {
        if (!pRow.uniformNumber) return null;
        const cy = ry + (rIdx + 0.5) * subH;
        return (
          <text
            key={`uni-${rIdx}`}
            x={numX + CLASSIC_NUM_W / 2}
            y={cy + 3.5}
            fontSize={9.4}
            fontWeight={800}
            textAnchor="middle"
            fill={COLOR_INK}
            fontFamily={FONT_MONO}
          >
            {pRow.uniformNumber}
          </text>
        );
      })}
    </g>
  );
}

export interface DigitalScorebookSheetProps {
  model: CompiledScorebookSheetModel;
  matchMeta: ScorebookMatchHeaderMeta;
  rules: ScorebookSymbolRules;
  svgRef?: React.Ref<SVGSVGElement>;
  className?: string;
}

export function DigitalScorebookSheet({
  model,
  matchMeta,
  rules,
  svgRef,
  className,
}: DigitalScorebookSheetProps) {
  const PAD = 16;
  const HEADER_H = 74;
  const HEADER_GAP = 10;
  const COL_HEAD_H = 30;

  // 左側ラインナップ列幅（3段フル様式: 258px / シンプル式: 230px）
  const LINEUP_TOTAL_W = getLineupTotalWidth(rules);

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
          {`相手（守備）: ${model.fieldingTeamName}${
            rules.customNote ? `   ｜   ${rules.customNote}` : ""
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
          fill={
            rules.lineupStyle === "classic_three_row" &&
            rules.hitLine !== "mono_bold"
              ? COLOR_SAGE_HEAD
              : COLOR_PAPER_SUB
          }
          stroke={COLOR_FRAME}
          strokeWidth={1.5}
        />

        {/* 左側見出し（様式切替対応：先発・守備位置・打順・左○・選手名・背番号 / 順・守備・背番・選手名） */}
        {renderLineupHeaderSvg(lineupX, tableTopY, COL_HEAD_H, rules)}

        {/* イニング列見出し */}
        {inningGroups.map((grp, gIdx) => {
          const gx = gridStartX + grp.startColIdx * CELL_W;
          const gw = grp.colSpan * CELL_W;
          const isClassicHead = rules.lineupStyle === "classic_three_row";
          return (
            <g key={`head-inn-${grp.inning}`}>
              <line
                x1={gx}
                y1={tableTopY}
                x2={gx}
                y2={summaryTopY + SUMMARY_TOTAL_H}
                stroke={COLOR_FRAME}
                strokeWidth={gIdx === 0 ? 1.6 : 1.25}
              />
              <text
                x={gx + gw / 2}
                y={
                  tableTopY +
                  (grp.colSpan > 1 ? 14 : isClassicHead ? 20.5 : 19.5)
                }
                fontSize={isClassicHead && grp.colSpan === 1 ? 13.5 : 11}
                fontWeight={900}
                textAnchor="middle"
                fill={COLOR_INK}
              >
                {isClassicHead ? String(grp.inning) : `${grp.inning}回`}
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

        return (
          <g key={`batter-row-${bRow.battingOrder}`}>
            {/* 左ラインナップセル（3段フル様式 or シンプル式） */}
            {renderBatterLineupRowSvg({
              slot: bRow.slot,
              battingOrder: bRow.battingOrder,
              hasActivePlateAppearances: bRow.plateAppearances > 0,
              isTop: model.isTop,
              rules,
              lineupX,
              ry,
            })}

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
          Generated by iScoreCloud
        </text>
      </g>
    </svg>
  );
}

/**
 * スコア設定ページ用のリアルタイム記号プレビュー（上段：メンバー欄＋1・2回、下段：5パターンの打席サンプル）
 */
export function ScorebookSymbolSamplePreview({
  rules,
}: {
  rules: ScorebookSymbolRules;
}) {
  const topInning1Cell: CompiledScorebookCell = {
    cellKey: "top-1",
    inning: 1,
    columnIndex: 1,
    battingOrder: 1,
    atBat: {
      id: "top-ab-1",
      inning: 1,
      isTop: true,
      columnIndex: 1,
      battingOrder: 1,
      batterName: "丸山",
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
  };

  const topInning2BuntHitCell: CompiledScorebookCell = {
    cellKey: "top-2",
    inning: 2,
    columnIndex: 1,
    battingOrder: 1,
    atBat: {
      id: "top-ab-2",
      inning: 2,
      isTop: true,
      columnIndex: 1,
      battingOrder: 1,
      batterName: "丸山",
      batterPlayerId: null,
      pitcherName: "投手",
      pitcherPlayerId: null,
      resultCode: "single",
      resultLabel: "三バント安打 (BH5)",
      battedDirection: "BH5",
      rbi: 0,
      outsInPlay: 0,
      endingOuts: 0,
      runsInPlay: 0,
      balls: 1,
      strikes: 0,
      pitches: ["ball", "pickoff_1b", "hit"],
      advances: [],
      confidence: "high",
    },
    isTiebreakRunnerOnly: false,
    segments: {
      1: {
        segment: 1,
        status: "safe",
        isBatterHit: true,
        hitBases: 1,
        method: "hit",
        isPrePlay: false,
      },
      2: {
        segment: 2,
        status: "out",
        isBatterHit: false,
        hitBases: 0,
        method: "out_on_base",
        isPrePlay: false,
      },
      3: null,
      4: null,
    },
    outNumber: 1,
    runScored: false,
    isResidual: false,
    isInningEndCell: false,
    hasPitcherChangeBefore: false,
  };

  const topInning3HomeRunCell: CompiledScorebookCell = {
    cellKey: "top-inn-3",
    inning: 3,
    columnIndex: 1,
    battingOrder: 1,
    atBat: {
      id: "top-ab-3",
      inning: 3,
      isTop: true,
      columnIndex: 1,
      battingOrder: 1,
      batterName: "中島",
      batterPlayerId: null,
      pitcherName: "投手",
      pitcherPlayerId: null,
      resultCode: "home_run",
      resultLabel: "中越本塁打",
      battedDirection: "8",
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
        hitBases: 4,
        method: "hit",
        isPrePlay: false,
      },
      2: {
        segment: 2,
        status: "safe",
        isBatterHit: true,
        hitBases: 4,
        method: "hit",
        isPrePlay: false,
      },
      3: {
        segment: 3,
        status: "safe",
        isBatterHit: true,
        hitBases: 4,
        method: "hit",
        isPrePlay: false,
      },
      4: {
        segment: 4,
        status: "safe",
        isBatterHit: true,
        hitBases: 4,
        method: "hit",
        isPrePlay: false,
      },
    },
    outNumber: null,
    runScored: true,
    isResidual: false,
    isInningEndCell: false,
    hasPitcherChangeBefore: false,
  };

  const sampleCells: Array<{ title: string; cell: CompiledScorebookCell }> = [
    {
      title: "見逃三振(1死)",
      cell: {
        cellKey: "s-1",
        inning: 1,
        columnIndex: 1,
        battingOrder: 2,
        atBat: {
          id: "s-ab-1",
          inning: 1,
          isTop: true,
          columnIndex: 1,
          battingOrder: 2,
          batterName: "サンプル1",
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
          pitches: ["swinging_strike", "pickoff_2b", "ball", "foul", "strike"],
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
      title: "犠打・バント球",
      cell: {
        cellKey: "s-2",
        inning: 1,
        columnIndex: 1,
        battingOrder: 3,
        atBat: {
          id: "s-ab-2",
          inning: 1,
          isTop: true,
          columnIndex: 1,
          battingOrder: 3,
          batterName: "サンプル2",
          batterPlayerId: null,
          pitcherName: "投手",
          pitcherPlayerId: null,
          resultCode: "sac_bunt",
          resultLabel: "投犠打 (1-3)",
          battedDirection: "1-3",
          rbi: 0,
          outsInPlay: 1,
          endingOuts: 2,
          runsInPlay: 0,
          balls: 0,
          strikes: 2,
          pitches: ["bunt_swinging", "bunt_foul", "in_play"],
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
      title: "バントゴロ凡",
      cell: {
        cellKey: "s-3",
        inning: 1,
        columnIndex: 1,
        battingOrder: 4,
        atBat: {
          id: "s-ab-3",
          inning: 1,
          isTop: true,
          columnIndex: 1,
          battingOrder: 4,
          batterName: "サンプル3",
          batterPlayerId: null,
          pitcherName: "投手",
          pitcherPlayerId: null,
          resultCode: "groundout",
          resultLabel: "三バントゴロ (5-3)",
          battedDirection: "5-3",
          rbi: 0,
          outsInPlay: 1,
          endingOuts: 3,
          runsInPlay: 0,
          balls: 1,
          strikes: 1,
          pitches: ["ball", "bunt_foul", "in_play"],
          advances: [],
          confidence: "high",
        },
        isTiebreakRunnerOnly: false,
        segments: { 1: null, 2: null, 3: null, 4: null },
        outNumber: 3,
        runScored: false,
        isResidual: false,
        isInningEndCell: false,
        hasPitcherChangeBefore: false,
      },
    },
    {
      title: "中飛(2死)",
      cell: {
        cellKey: "s-4",
        inning: 1,
        columnIndex: 1,
        battingOrder: 5,
        atBat: {
          id: "s-ab-4",
          inning: 1,
          isTop: true,
          columnIndex: 1,
          battingOrder: 5,
          batterName: "サンプル4",
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
          pitches: ["pickoff_3b", "ball", "in_play"],
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
        cellKey: "s-5",
        inning: 1,
        columnIndex: 1,
        battingOrder: 6,
        atBat: {
          id: "s-ab-5",
          inning: 1,
          isTop: true,
          columnIndex: 1,
          battingOrder: 6,
          batterName: "サンプル5",
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
          pitches: ["ball", "pickoff_1b", "strike", "ball", "ball", "ball"],
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

  const sampleLineupSlot: ScorebookBatterSlot = {
    battingOrder: 1,
    name: "丸山",
    uniformNumber: "8",
    position: "8",
    playerId: "sample-p1",
    bats: "L",
    substitutions: [
      {
        id: "sample-sub1",
        inningEntered: 4,
        subType: "DEF",
        name: "中島",
        uniformNumber: "15",
        position: "3",
        playerId: "sample-p2",
        bats: "R",
      },
    ],
  };

  const gap = 5;
  const lineupW = getLineupTotalWidth(rules);
  const colHeadH = 30;
  const topPreviewW = lineupW + CELL_W * 3;
  const cellsRowW =
    sampleCells.length * CELL_W + (sampleCells.length - 1) * gap;
  const totalW = Math.max(topPreviewW, cellsRowW) + 12;
  const topOriginX = (totalW - topPreviewW) / 2;
  const topOriginY = 6;
  const cellsLabelY = topOriginY + colHeadH + CELL_H + 17;
  const cellsOriginY = cellsLabelY + 5;
  const totalH = cellsOriginY + CELL_H + 8;
  const isClassicHead = rules.lineupStyle === "classic_three_row";

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${totalW} ${totalH}`}
      className="w-full h-auto rounded-xl border border-slate-300 bg-[#fffefb]"
      style={{ fontFamily: FONT_SANS }}
    >
      <rect x={0} y={0} width={totalW} height={totalH} fill={COLOR_PAPER} />

      {/* 上段：メンバー欄＋1回（二塁打）・2回（バント単打）・3回（本塁打）マスのリアルプレビュー */}
      <g>
        <rect
          x={topOriginX}
          y={topOriginY}
          width={topPreviewW}
          height={colHeadH}
          fill={
            isClassicHead && rules.hitLine !== "mono_bold"
              ? COLOR_SAGE_HEAD
              : COLOR_PAPER_SUB
          }
          stroke={COLOR_FRAME}
          strokeWidth={1.3}
        />
        {renderLineupHeaderSvg(topOriginX, topOriginY, colHeadH, rules)}
        <line
          x1={topOriginX + lineupW}
          y1={topOriginY}
          x2={topOriginX + lineupW}
          y2={topOriginY + colHeadH + CELL_H}
          stroke={COLOR_FRAME}
          strokeWidth={1.5}
        />
        <line
          x1={topOriginX + lineupW + CELL_W}
          y1={topOriginY}
          x2={topOriginX + lineupW + CELL_W}
          y2={topOriginY + colHeadH + CELL_H}
          stroke={COLOR_GRID}
          strokeWidth={0.9}
        />
        <line
          x1={topOriginX + lineupW + CELL_W * 2}
          y1={topOriginY}
          x2={topOriginX + lineupW + CELL_W * 2}
          y2={topOriginY + colHeadH + CELL_H}
          stroke={COLOR_GRID}
          strokeWidth={0.9}
        />
        <text
          x={topOriginX + lineupW + CELL_W / 2}
          y={topOriginY + (isClassicHead ? 20.5 : 19.5)}
          fontSize={isClassicHead ? 13.5 : 11}
          fontWeight={900}
          textAnchor="middle"
          fill={COLOR_INK}
        >
          {isClassicHead ? "1" : "1回"}
        </text>
        <text
          x={topOriginX + lineupW + CELL_W + CELL_W / 2}
          y={topOriginY + (isClassicHead ? 20.5 : 19.5)}
          fontSize={isClassicHead ? 13.5 : 11}
          fontWeight={900}
          textAnchor="middle"
          fill={COLOR_INK}
        >
          {isClassicHead ? "2" : "2回"}
        </text>
        <text
          x={topOriginX + lineupW + CELL_W * 2 + CELL_W / 2}
          y={topOriginY + (isClassicHead ? 20.5 : 19.5)}
          fontSize={isClassicHead ? 13.5 : 11}
          fontWeight={900}
          textAnchor="middle"
          fill={COLOR_INK}
        >
          {isClassicHead ? "3" : "3回"}
        </text>

        {renderBatterLineupRowSvg({
          slot: sampleLineupSlot,
          battingOrder: 1,
          hasActivePlateAppearances: true,
          isTop: true,
          rules,
          lineupX: topOriginX,
          ry: topOriginY + colHeadH,
        })}
        {renderSingleScorebookCellSvg(
          topInning1Cell,
          rules,
          topOriginX + lineupW,
          topOriginY + colHeadH
        )}
        {renderSingleScorebookCellSvg(
          topInning2BuntHitCell,
          rules,
          topOriginX + lineupW + CELL_W,
          topOriginY + colHeadH
        )}
        {renderSingleScorebookCellSvg(
          topInning3HomeRunCell,
          rules,
          topOriginX + lineupW + CELL_W * 2,
          topOriginY + colHeadH
        )}
        <line
          x1={topOriginX + lineupW}
          y1={topOriginY + colHeadH}
          x2={topOriginX + lineupW}
          y2={topOriginY + colHeadH + CELL_H}
          stroke={COLOR_FRAME}
          strokeWidth={1.5}
        />
        <rect
          x={topOriginX}
          y={topOriginY}
          width={topPreviewW}
          height={colHeadH + CELL_H}
          fill="none"
          stroke={COLOR_FRAME}
          strokeWidth={1.4}
        />
      </g>

      {/* 下段：5パターンの打席・バント・走塁記号サンプル */}
      {sampleCells.map((item, idx) => {
        const ox = (totalW - cellsRowW) / 2 + idx * (CELL_W + gap);
        return (
          <g key={item.title}>
            <text
              x={ox + CELL_W / 2}
              y={cellsLabelY}
              fontSize={7.3}
              fontWeight={900}
              textAnchor="middle"
              fill={COLOR_MUTED}
            >
              {item.title}
            </text>
            {renderSingleScorebookCellSvg(item.cell, rules, ox, cellsOriginY)}
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
