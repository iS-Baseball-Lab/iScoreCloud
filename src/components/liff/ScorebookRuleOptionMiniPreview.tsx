// filepath: src/components/liff/ScorebookRuleOptionMiniPreview.tsx
"use client";

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import type {
  AdvanceMethodCode,
  CanonicalAtBatResult,
  CanonicalPitchResult,
  ScorebookBatterSlot,
  ScorebookV2AtBat,
} from "@/types/scorebook-v2";
import type {
  BaseSegmentIndex,
  CompiledDiamondSegment,
  CompiledScorebookCell,
} from "@/lib/liff/scorebook-renderer-model";
import type { ScorebookSymbolRules } from "@/lib/liff/scorebook-symbol-rules";
import {
  SCOREBOOK_CELL_H,
  SCOREBOOK_CELL_W,
  getLineupTotalWidth,
  renderBatterLineupRowSvg,
  renderCellSubstitutionsOverlaySvg,
  renderDoublePlayVerticalSpanOverlaySvg,
  renderLineupHeaderSvg,
  renderSingleScorebookCellSvg,
} from "@/components/liff/DigitalScorebookSheet";

export type SymbolRulePreviewFieldKey = Exclude<
  keyof ScorebookSymbolRules,
  "customNote"
>;

export interface ScorebookRuleOptionMiniPreviewProps {
  fieldKey: SymbolRulePreviewFieldKey;
  optionValue: string;
  baseRules: ScorebookSymbolRules;
  className?: string;
}

const PAPER_BG = "#fffefb";
const HEADER_BG = "#f8fafc";
const COLOR_FRAME = "#1e293b";
const COLOR_GRID = "#64748b";
const COLOR_MUTED = "#64748b";
const DIAMOND_CROP_X = 19;
const DIAMOND_CROP_W = SCOREBOOK_CELL_W - DIAMOND_CROP_X; // 69

const FONT_SANS =
  "'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Meiryo', system-ui, -apple-system, sans-serif";

interface SampleAtBatSeed {
  resultCode: CanonicalAtBatResult;
  resultLabel?: string;
  battedDirection?: string;
  pitches?: CanonicalPitchResult[];
  outsInPlay?: number;
  rbi?: number;
}

function makeEmptySegments(): Record<
  BaseSegmentIndex,
  CompiledDiamondSegment | null
> {
  return {
    1: null,
    2: null,
    3: null,
    4: null,
  };
}

function makeHitSegments(
  bases: 1 | 2 | 3 | 4
): Record<BaseSegmentIndex, CompiledDiamondSegment | null> {
  const segs = makeEmptySegments();
  for (let b = 1; b <= bases; b++) {
    const idx = b as BaseSegmentIndex;
    segs[idx] = {
      segment: idx,
      status: "safe",
      isBatterHit: true,
      hitBases: bases,
      method: "hit",
      isPrePlay: false,
    };
  }
  return segs;
}

function makeSegment(
  segment: BaseSegmentIndex,
  status: "safe" | "out",
  method: AdvanceMethodCode,
  extra: Partial<CompiledDiamondSegment> = {}
): CompiledDiamondSegment {
  return {
    segment,
    status,
    isBatterHit: false,
    hitBases: 0,
    method,
    isPrePlay:
      method === "steal" ||
      method === "caught_stealing" ||
      method === "pickoff_out" ||
      method === "wp" ||
      method === "pb" ||
      method === "balk",
    ...extra,
  };
}

function makeSampleAtBat(id: string, seed: SampleAtBatSeed): ScorebookV2AtBat {
  return {
    id,
    inning: 1,
    isTop: true,
    columnIndex: 0,
    battingOrder: 1,
    batterName: "山田",
    batterPlayerId: null,
    pitcherName: "佐藤",
    pitcherPlayerId: null,
    resultCode: seed.resultCode,
    resultLabel: seed.resultLabel || "",
    battedDirection: seed.battedDirection || "",
    rbi: seed.rbi ?? 0,
    outsInPlay: seed.outsInPlay ?? 0,
    endingOuts: 0,
    runsInPlay: 0,
    balls: 0,
    strikes: 0,
    pitches: seed.pitches ?? [],
    advances: [],
    confidence: "high",
  };
}

function makeSampleCell(
  key: string,
  overrides: Partial<CompiledScorebookCell> & {
    atBatSeed?: SampleAtBatSeed;
  } = {}
): CompiledScorebookCell {
  const { atBatSeed, ...rest } = overrides;
  return {
    cellKey: key,
    inning: 1,
    columnIndex: 0,
    battingOrder: 1,
    atBat: atBatSeed ? makeSampleAtBat(`ab-${key}`, atBatSeed) : null,
    isTiebreakRunnerOnly: false,
    segments: makeEmptySegments(),
    outNumber: null,
    runScored: false,
    isResidual: false,
    isInningEndCell: false,
    hasPitcherChangeBefore: false,
    ...rest,
  };
}

const SAMPLE_LINEUP_SLOT: ScorebookBatterSlot = {
  battingOrder: 1,
  name: "山田 太郎",
  uniformNumber: "8",
  position: "8",
  playerId: "sample-p1",
  bats: "L",
  substitutions: [
    {
      id: "sample-sub-ph",
      inningEntered: 5,
      subType: "PH",
      name: "中島 健",
      uniformNumber: "15",
      position: "",
      playerId: "sample-p2",
      bats: "R",
    },
    {
      id: "sample-sub-def",
      inningEntered: 5,
      subType: "DEF",
      name: "佐藤 翼",
      uniformNumber: "24",
      position: "3",
      playerId: "sample-p3",
      bats: "L",
    },
  ],
};

function renderDiamondStripSvg(
  cells: CompiledScorebookCell[],
  rules: ScorebookSymbolRules,
  captionLabels?: string[]
): React.ReactNode {
  const count = cells.length;
  const captionH = captionLabels && captionLabels.length > 0 ? 13 : 0;
  const totalW = count * DIAMOND_CROP_W;
  const totalH = SCOREBOOK_CELL_H + captionH;

  return (
    <svg
      viewBox={`0 0 ${totalW} ${totalH}`}
      className={
        captionH > 0
          ? "h-[64px] sm:h-[70px] w-auto max-w-full mx-auto block select-none"
          : "h-[55px] sm:h-[60px] w-auto max-w-full mx-auto block select-none"
      }
      style={{ fontFamily: FONT_SANS, backgroundColor: PAPER_BG }}
      aria-hidden="true"
    >
      <rect x={0} y={0} width={totalW} height={totalH} fill={PAPER_BG} />
      {captionH > 0 && (
        <rect
          x={0}
          y={0}
          width={totalW}
          height={captionH}
          fill={HEADER_BG}
        />
      )}
      {cells.map((c, idx) => {
        const dx = idx * DIAMOND_CROP_W;
        return (
          <g key={c.cellKey}>
            {captionH > 0 && captionLabels?.[idx] && (
              <text
                x={dx + DIAMOND_CROP_W / 2}
                y={9.8}
                fontSize={8.0}
                fontWeight={900}
                textAnchor="middle"
                fill={COLOR_MUTED}
              >
                {captionLabels[idx]}
              </text>
            )}
            <svg
              x={dx}
              y={captionH}
              width={DIAMOND_CROP_W}
              height={SCOREBOOK_CELL_H}
              viewBox={`${DIAMOND_CROP_X} 0 ${DIAMOND_CROP_W} ${SCOREBOOK_CELL_H}`}
            >
              {renderSingleScorebookCellSvg(c, rules, 0, 0)}
            </svg>
            {idx > 0 && (
              <line
                x1={dx}
                y1={0}
                x2={dx}
                y2={totalH}
                stroke={COLOR_GRID}
                strokeWidth={0.95}
              />
            )}
          </g>
        );
      })}
      {captionH > 0 && (
        <line
          x1={0}
          y1={captionH}
          x2={totalW}
          y2={captionH}
          stroke={COLOR_GRID}
          strokeWidth={0.85}
        />
      )}
      <rect
        x={0.45}
        y={0.45}
        width={totalW - 0.9}
        height={totalH - 0.9}
        fill="none"
        stroke={COLOR_GRID}
        strokeWidth={0.9}
      />
    </svg>
  );
}

function buildEffectivePreviewRules(
  fieldKey: SymbolRulePreviewFieldKey,
  optionValue: string,
  baseRules: ScorebookSymbolRules
): ScorebookSymbolRules {
  const next: ScorebookSymbolRules = {
    ...baseRules,
    [fieldKey]: optionValue,
  } as ScorebookSymbolRules;

  // 他の設定値によってプレビュー対象の記号が非表示化・同色化されるのを防ぎ、差分を確実に可視化する
  if (
    (fieldKey === "cellStyle" ||
      fieldKey === "buntPitchMark" ||
      fieldKey === "pickoffMark") &&
    next.pitchMark === "numbered_bs"
  ) {
    next.pitchMark = "cross_swing";
  }
  if (
    (fieldKey === "rbiMark" || fieldKey === "inningEndMark") &&
    next.hitLine === "mono_bold"
  ) {
    next.hitLine = "red_edge_infield_arc";
  }
  return next;
}

export const ScorebookRuleOptionMiniPreview = React.memo(
  function ScorebookRuleOptionMiniPreview({
    fieldKey,
    optionValue,
    baseRules,
    className,
  }: ScorebookRuleOptionMiniPreviewProps) {
    const previewRules = useMemo(
      () => buildEffectivePreviewRules(fieldKey, optionValue, baseRules),
      [fieldKey, optionValue, baseRules]
    );

    const content = useMemo((): React.ReactNode => {
      switch (fieldKey) {
        case "cellStyle": {
          const cell = makeSampleCell("opt-cell-style", {
            segments: makeHitSegments(1),
            atBatSeed: {
              resultCode: "single",
              battedDirection: "8",
              pitches: ["strike", "ball", "foul"],
            },
          });
          return (
            <svg
              viewBox={`0 0 ${SCOREBOOK_CELL_W} ${SCOREBOOK_CELL_H}`}
              className="h-[55px] sm:h-[60px] w-auto max-w-full mx-auto block select-none"
              style={{ fontFamily: FONT_SANS, backgroundColor: PAPER_BG }}
              aria-hidden="true"
            >
              {renderSingleScorebookCellSvg(cell, previewRules, 0, 0)}
            </svg>
          );
        }

        case "lineupStyle": {
          const lineupW = getLineupTotalWidth(previewRules);
          const headH = 28;
          const totalH = headH + SCOREBOOK_CELL_H;
          return (
            <svg
              viewBox={`0 0 ${lineupW} ${totalH}`}
              className="h-[68px] sm:h-[74px] w-auto max-w-full mx-auto block select-none"
              style={{ fontFamily: FONT_SANS, backgroundColor: PAPER_BG }}
              aria-hidden="true"
            >
              <rect x={0} y={0} width={lineupW} height={totalH} fill={PAPER_BG} />
              <rect
                x={0}
                y={0}
                width={lineupW}
                height={headH}
                fill={HEADER_BG}
              />
              {renderLineupHeaderSvg(0, 0, headH, previewRules)}
              <line
                x1={0}
                y1={headH}
                x2={lineupW}
                y2={headH}
                stroke={COLOR_FRAME}
                strokeWidth={1.1}
              />
              {renderBatterLineupRowSvg({
                slot: SAMPLE_LINEUP_SLOT,
                battingOrder: 1,
                hasActivePlateAppearances: true,
                isTop: true,
                rules: previewRules,
                lineupX: 0,
                ry: headH,
              })}
              <rect
                x={0.5}
                y={0.5}
                width={lineupW - 1}
                height={totalH - 1}
                fill="none"
                stroke={COLOR_FRAME}
                strokeWidth={1.1}
              />
            </svg>
          );
        }

        case "positionLabel": {
          const isCompact = previewRules.lineupStyle === "compact_order_first";
          const cropW = isCompact ? 92 : 86;
          const headH = 28;
          const totalH = headH + SCOREBOOK_CELL_H;
          return (
            <svg
              viewBox={`0 0 ${cropW} ${totalH}`}
              className="h-[68px] sm:h-[74px] w-auto max-w-full mx-auto block select-none"
              style={{ fontFamily: FONT_SANS, backgroundColor: PAPER_BG }}
              aria-hidden="true"
            >
              <rect x={0} y={0} width={cropW} height={totalH} fill={PAPER_BG} />
              <rect x={0} y={0} width={cropW} height={headH} fill={HEADER_BG} />
              <svg
                x={0}
                y={0}
                width={cropW}
                height={totalH}
                viewBox={`0 0 ${cropW} ${totalH}`}
              >
                {renderLineupHeaderSvg(0, 0, headH, previewRules)}
                <line
                  x1={0}
                  y1={headH}
                  x2={cropW}
                  y2={headH}
                  stroke={COLOR_FRAME}
                  strokeWidth={1.05}
                />
                {renderBatterLineupRowSvg({
                  slot: SAMPLE_LINEUP_SLOT,
                  battingOrder: 1,
                  hasActivePlateAppearances: true,
                  isTop: true,
                  rules: previewRules,
                  lineupX: 0,
                  ry: headH,
                })}
              </svg>
              <rect
                x={0.5}
                y={0.5}
                width={cropW - 1}
                height={totalH - 1}
                fill="none"
                stroke={COLOR_GRID}
                strokeWidth={0.95}
              />
            </svg>
          );
        }

        case "pinchHitterMark": {
          const phCell = makeSampleCell("opt-ph", {
            segments: makeHitSegments(1),
            leftOutsideSub: {
              name: "山田",
              subType: "PH",
            },
            atBatSeed: {
              resultCode: "single",
              battedDirection: "7",
            },
          });
          const prSegs = makeEmptySegments();
          prSegs[1] = makeSegment(1, "safe", "walk");
          prSegs[2] = makeSegment(2, "safe", "steal", {
            pinchRunnerName: "佐藤",
          });
          const prCell = makeSampleCell("opt-pr", {
            segments: prSegs,
            rightInsideSub: {
              name: "佐藤",
              subType: "PR",
            },
            atBatSeed: {
              resultCode: "walk",
              resultLabel: "四球",
            },
          });

          const leftPad = 18;
          const totalW = leftPad + SCOREBOOK_CELL_W * 2;
          const captionH = 13;
          const totalH = SCOREBOOK_CELL_H + captionH;
          const hasRightSub = previewRules.pinchHitterMark !== "lineup_only";

          return (
            <svg
              viewBox={`0 0 ${totalW} ${totalH}`}
              className="h-[64px] sm:h-[70px] w-auto max-w-full mx-auto block select-none"
              style={{ fontFamily: FONT_SANS, backgroundColor: PAPER_BG }}
              aria-hidden="true"
            >
              <rect x={0} y={0} width={totalW} height={totalH} fill={PAPER_BG} />
              <rect
                x={leftPad}
                y={0}
                width={SCOREBOOK_CELL_W * 2}
                height={captionH}
                fill={HEADER_BG}
                stroke={COLOR_GRID}
                strokeWidth={0.8}
              />
              <text
                x={leftPad + SCOREBOOK_CELL_W / 2}
                y={9.8}
                fontSize={8.0}
                fontWeight={900}
                textAnchor="middle"
                fill={COLOR_MUTED}
              >
                代打
              </text>
              <text
                x={leftPad + SCOREBOOK_CELL_W + SCOREBOOK_CELL_W / 2}
                y={9.8}
                fontSize={8.0}
                fontWeight={900}
                textAnchor="middle"
                fill={COLOR_MUTED}
              >
                代走・守備
              </text>
              {renderSingleScorebookCellSvg(
                phCell,
                previewRules,
                leftPad,
                captionH
              )}
              {renderSingleScorebookCellSvg(
                prCell,
                previewRules,
                leftPad + SCOREBOOK_CELL_W,
                captionH,
                hasRightSub
              )}
              {renderCellSubstitutionsOverlaySvg(
                phCell,
                previewRules,
                leftPad,
                captionH,
                0,
                false
              )}
              {renderCellSubstitutionsOverlaySvg(
                prCell,
                previewRules,
                leftPad + SCOREBOOK_CELL_W,
                captionH,
                1,
                false
              )}
              {previewRules.pinchHitterMark === "lineup_only" && (
                <text
                  x={leftPad + SCOREBOOK_CELL_W}
                  y={captionH + 10.5}
                  fontSize={6.8}
                  fontWeight={900}
                  textAnchor="middle"
                  fill={COLOR_MUTED}
                >
                  ※マス内波線なし
                </text>
              )}
            </svg>
          );
        }

        case "outMark": {
          const out1 = makeSampleCell("opt-out1", {
            outNumber: 1,
            atBatSeed: { resultCode: "flyout", battedDirection: "8" },
          });
          const out2 = makeSampleCell("opt-out2", {
            outNumber: 2,
            atBatSeed: { resultCode: "groundout", battedDirection: "6-3" },
          });
          return renderDiamondStripSvg([out1, out2], previewRules, [
            "一死",
            "二死",
          ]);
        }

        case "strikeout": {
          const calledCell = makeSampleCell("opt-k-called", {
            outNumber: 1,
            atBatSeed: {
              resultCode: "strikeout",
              resultLabel: "見逃し三振",
              pitches: ["strike", "foul", "strike"],
            },
          });
          const swingCell = makeSampleCell("opt-k-swing", {
            outNumber: 2,
            atBatSeed: {
              resultCode: "strikeout",
              resultLabel: "空振り三振",
              pitches: ["strike", "swinging_strike", "swinging_strike"],
            },
          });
          const dtsCell = makeSampleCell("opt-k-dts", {
            outNumber: 3,
            atBatSeed: {
              resultCode: "dropped_third_strike_out",
              resultLabel: "振り逃げ",
              battedDirection: "2-3",
            },
          });
          return renderDiamondStripSvg(
            [calledCell, swingCell, dtsCell],
            previewRules,
            ["見逃", "空振", "振逃"]
          );
        }

        case "walkHbp": {
          const walkSegs = makeEmptySegments();
          walkSegs[1] = makeSegment(1, "safe", "walk");
          const hbpSegs = makeEmptySegments();
          hbpSegs[1] = makeSegment(1, "safe", "walk");

          const walkCell = makeSampleCell("opt-walk", {
            segments: walkSegs,
            atBatSeed: { resultCode: "walk", resultLabel: "四球" },
          });
          const hbpCell = makeSampleCell("opt-hbp", {
            segments: hbpSegs,
            atBatSeed: { resultCode: "hit_by_pitch", resultLabel: "死球" },
          });
          return renderDiamondStripSvg([walkCell, hbpCell], previewRules, [
            "四球",
            "死球",
          ]);
        }

        case "flyLiner": {
          const foulFlyCell = makeSampleCell("opt-ff", {
            outNumber: 1,
            atBatSeed: {
              resultCode: "flyout",
              resultLabel: "左邪飛",
              battedDirection: "F7",
            },
          });
          const linerCell = makeSampleCell("opt-liner", {
            outNumber: 2,
            atBatSeed: {
              resultCode: "flyout",
              resultLabel: "遊直",
              battedDirection: "6",
            },
          });
          const groundCell = makeSampleCell("opt-ground", {
            outNumber: 3,
            atBatSeed: {
              resultCode: "groundout",
              resultLabel: "遊ゴロ",
              battedDirection: "6",
            },
          });
          return renderDiamondStripSvg(
            [foulFlyCell, linerCell, groundCell],
            previewRules,
            ["邪飛", "ライナー", "ゴロ"]
          );
        }

        case "buntMark": {
          const sacBuntCell = makeSampleCell("opt-sac-bunt", {
            outNumber: 1,
            atBatSeed: {
              resultCode: "sac_bunt",
              resultLabel: "投犠打",
              battedDirection: "1-3",
            },
          });
          const buntOutCell = makeSampleCell("opt-bunt-out", {
            outNumber: 2,
            atBatSeed: {
              resultCode: "groundout",
              resultLabel: "三バントゴロ",
              battedDirection: "5-3",
            },
          });
          const sacFlyCell = makeSampleCell("opt-sac-fly", {
            outNumber: 2,
            atBatSeed: {
              resultCode: "sac_fly",
              resultLabel: "中犠飛",
              battedDirection: "8",
            },
          });
          return renderDiamondStripSvg(
            [sacBuntCell, buntOutCell, sacFlyCell],
            previewRules,
            ["犠打", "バント凡", "犠飛"]
          );
        }

        case "doublePlayMark": {
          const topDpCell = makeSampleCell("opt-dp-top", {
            outNumber: 1,
            atBatSeed: {
              resultCode: "other",
              battedDirection: "7",
            },
          });
          const bottomDpCell = makeSampleCell("opt-dp-bottom", {
            outNumber: 2,
            atBatSeed: {
              resultCode: "double_play",
              outsInPlay: 2,
              battedDirection: "6-4-3",
            },
          });
          const labelColW = 36;
          const totalW = labelColW + SCOREBOOK_CELL_W;
          const totalH = SCOREBOOK_CELL_H * 2;

          return (
            <svg
              viewBox={`0 0 ${totalW} ${totalH}`}
              className="h-[98px] sm:h-[106px] w-auto max-w-full mx-auto block select-none"
              style={{ fontFamily: FONT_SANS, backgroundColor: PAPER_BG }}
              aria-hidden="true"
            >
              <rect x={0} y={0} width={totalW} height={totalH} fill={PAPER_BG} />
              <rect
                x={0}
                y={0}
                width={labelColW}
                height={totalH}
                fill={HEADER_BG}
              />
              <line
                x1={0}
                y1={SCOREBOOK_CELL_H}
                x2={labelColW}
                y2={SCOREBOOK_CELL_H}
                stroke={COLOR_GRID}
                strokeWidth={0.75}
                strokeDasharray="2,2"
              />
              <text
                x={labelColW / 2}
                y={SCOREBOOK_CELL_H / 2 + 2.8}
                fontSize={7.8}
                fontWeight={900}
                textAnchor="middle"
                fill={COLOR_MUTED}
              >
                1マス目
              </text>
              <text
                x={labelColW / 2}
                y={SCOREBOOK_CELL_H + SCOREBOOK_CELL_H / 2 + 2.8}
                fontSize={7.8}
                fontWeight={900}
                textAnchor="middle"
                fill={COLOR_MUTED}
              >
                2マス目
              </text>
              {renderSingleScorebookCellSvg(
                topDpCell,
                previewRules,
                labelColW,
                0
              )}
              {renderSingleScorebookCellSvg(
                bottomDpCell,
                previewRules,
                labelColW,
                SCOREBOOK_CELL_H
              )}
              {renderDoublePlayVerticalSpanOverlaySvg({
                cellX: labelColW,
                topCellY: 0,
                spanRows: 2,
                rules: previewRules,
              })}
              <rect
                x={0.5}
                y={0.5}
                width={totalW - 1}
                height={totalH - 1}
                fill="none"
                stroke={COLOR_GRID}
                strokeWidth={0.95}
              />
            </svg>
          );
        }

        case "hitLine": {
          const buntHitCell = makeSampleCell("opt-hit-bh", {
            segments: makeHitSegments(1),
            atBatSeed: {
              resultCode: "single",
              resultLabel: "三バント安打",
              battedDirection: "BH5",
            },
          });
          const doubleHitCell = makeSampleCell("opt-hit-2b", {
            segments: makeHitSegments(2),
            atBatSeed: {
              resultCode: "double",
              resultLabel: "中二塁打",
              battedDirection: "8",
            },
          });
          return renderDiamondStripSvg(
            [buntHitCell, doubleHitCell],
            previewRules,
            ["内野安打", "二塁打"]
          );
        }

        case "runnerLine": {
          const advSegs = makeEmptySegments();
          advSegs[1] = makeSegment(1, "safe", "walk");
          advSegs[2] = makeSegment(2, "safe", "hit", { drivingBatterOrder: 2 });
          advSegs[3] = makeSegment(3, "safe", "hit", { drivingBatterOrder: 3 });

          const advCell = makeSampleCell("opt-runner-line", {
            segments: advSegs,
            isResidual: true,
            residualBase: "3B",
            atBatSeed: { resultCode: "walk", resultLabel: "四球" },
          });
          return (
            <svg
              viewBox={`${DIAMOND_CROP_X} 0 ${DIAMOND_CROP_W} ${SCOREBOOK_CELL_H}`}
              className="h-[55px] sm:h-[60px] w-auto max-w-full mx-auto block select-none"
              style={{ fontFamily: FONT_SANS, backgroundColor: PAPER_BG }}
              aria-hidden="true"
            >
              {renderSingleScorebookCellSvg(advCell, previewRules, 0, 0)}
              <rect
                x={DIAMOND_CROP_X + 0.45}
                y={0.45}
                width={DIAMOND_CROP_W - 0.9}
                height={SCOREBOOK_CELL_H - 0.9}
                fill="none"
                stroke={COLOR_GRID}
                strokeWidth={0.9}
              />
            </svg>
          );
        }

        case "runnerOutLine": {
          const outSegs = makeEmptySegments();
          outSegs[1] = makeSegment(1, "safe", "walk");
          outSegs[2] = makeSegment(2, "out", "caught_stealing");
          const outCell = makeSampleCell("opt-runner-out", {
            outNumber: 2,
            segments: outSegs,
            atBatSeed: { resultCode: "walk", resultLabel: "四球" },
          });
          return (
            <svg
              viewBox={`${DIAMOND_CROP_X} 0 ${DIAMOND_CROP_W} ${SCOREBOOK_CELL_H}`}
              className="h-[55px] sm:h-[60px] w-auto max-w-full mx-auto block select-none"
              style={{ fontFamily: FONT_SANS, backgroundColor: PAPER_BG }}
              aria-hidden="true"
            >
              {renderSingleScorebookCellSvg(outCell, previewRules, 0, 0)}
              <rect
                x={DIAMOND_CROP_X + 0.45}
                y={0.45}
                width={DIAMOND_CROP_W - 0.9}
                height={SCOREBOOK_CELL_H - 0.9}
                fill="none"
                stroke={COLOR_GRID}
                strokeWidth={0.9}
              />
            </svg>
          );
        }

        case "forceOutMark": {
          const forceSegs = makeEmptySegments();
          forceSegs[1] = makeSegment(1, "safe", "walk");
          forceSegs[2] = makeSegment(2, "out", "fc", {
            drivingBatterOrder: 2,
            isForceOut: true,
            throwChain: "6",
          });
          const forceCell = makeSampleCell("opt-force-2b", {
            outNumber: 1,
            segments: forceSegs,
            atBatSeed: { resultCode: "walk", resultLabel: "四球" },
          });

          const tagSegs = makeEmptySegments();
          tagSegs[1] = makeSegment(1, "out", "out_on_base", {
            isForceOut: false,
            throwChain: "3",
          });
          const tagCell = makeSampleCell("opt-tag-1b", {
            outNumber: 2,
            isInningEndCell: false,
            segments: tagSegs,
          });

          return renderDiamondStripSvg(
            [forceCell, tagCell],
            previewRules,
            ["2塁封殺", "触球アウト"]
          );
        }

        case "inningEndMark": {
          const endBatterCell = makeSampleCell("opt-inning-end-1", {
            outNumber: 3,
            isInningEndCell: true,
            atBatSeed: {
              resultCode: "groundout",
              resultLabel: "遊ゴロ",
              battedDirection: "6-3",
            },
          });
          const fcEndSegs = makeEmptySegments();
          fcEndSegs[1] = makeSegment(1, "safe", "fc");
          const endFcCell = makeSampleCell("opt-inning-end-2", {
            isResidual: true,
            residualBase: "1B",
            isInningEndCell: true,
            segments: fcEndSegs,
            atBatSeed: {
              resultCode: "fc",
              battedDirection: "6-",
            },
          });

          return renderDiamondStripSvg(
            [endBatterCell, endFcCell],
            previewRules,
            ["打者3死終了", "封殺チェンジ"]
          );
        }

        case "runMark": {
          const earnedSegs = makeHitSegments(4);
          const earnedCell = makeSampleCell("opt-run-earned", {
            runScored: true,
            isUnearnedRun: false,
            segments: earnedSegs,
            atBatSeed: { resultCode: "home_run", battedDirection: "8" },
          });

          const unearnedSegs = makeEmptySegments();
          unearnedSegs[1] = makeSegment(1, "safe", "error");
          unearnedSegs[2] = makeSegment(2, "safe", "wp");
          unearnedSegs[3] = makeSegment(3, "safe", "pb");
          unearnedSegs[4] = makeSegment(4, "safe", "hit", {
            drivingBatterOrder: 2,
          });
          const unearnedCell = makeSampleCell("opt-run-unearned", {
            runScored: true,
            isUnearnedRun: true,
            segments: unearnedSegs,
            atBatSeed: {
              resultCode: "error",
              resultLabel: "遊捕球失策",
              battedDirection: "6",
            },
          });

          return renderDiamondStripSvg(
            [earnedCell, unearnedCell],
            previewRules,
            ["自責点", "非自責点"]
          );
        }

        case "rbiMark": {
          const rbiCell = makeSampleCell("opt-rbi", {
            segments: makeHitSegments(2),
            atBatSeed: {
              resultCode: "double",
              battedDirection: "9",
              rbi: 2,
            },
          });
          return (
            <svg
              viewBox={`${DIAMOND_CROP_X} 0 ${DIAMOND_CROP_W} ${SCOREBOOK_CELL_H}`}
              className="h-[55px] sm:h-[60px] w-auto max-w-full mx-auto block select-none"
              style={{ fontFamily: FONT_SANS, backgroundColor: PAPER_BG }}
              aria-hidden="true"
            >
              {renderSingleScorebookCellSvg(rbiCell, previewRules, 0, 0)}
              <rect
                x={DIAMOND_CROP_X + 0.45}
                y={0.45}
                width={DIAMOND_CROP_W - 0.9}
                height={SCOREBOOK_CELL_H - 0.9}
                fill="none"
                stroke={COLOR_GRID}
                strokeWidth={0.9}
              />
            </svg>
          );
        }

        case "pitchMark": {
          const pitchCell = makeSampleCell("opt-pitch", {
            outNumber: 1,
            atBatSeed: {
              resultCode: "strikeout",
              resultLabel: "空振り三振",
              pitches: ["strike", "swinging_strike", "ball", "foul"],
            },
          });
          const viewW = 66;
          return (
            <svg
              viewBox={`0 0 ${viewW} ${SCOREBOOK_CELL_H}`}
              className="h-[55px] sm:h-[60px] w-auto max-w-full mx-auto block select-none"
              style={{ fontFamily: FONT_SANS, backgroundColor: PAPER_BG }}
              aria-hidden="true"
            >
              <svg
                x={0}
                y={0}
                width={viewW}
                height={SCOREBOOK_CELL_H}
                viewBox={`0 0 ${viewW} ${SCOREBOOK_CELL_H}`}
              >
                {renderSingleScorebookCellSvg(pitchCell, previewRules, 0, 0)}
              </svg>
              <rect
                x={0.45}
                y={0.45}
                width={viewW - 0.9}
                height={SCOREBOOK_CELL_H - 0.9}
                fill="none"
                stroke={COLOR_GRID}
                strokeWidth={0.9}
              />
            </svg>
          );
        }

        case "buntPitchMark": {
          const buntPitchCell = makeSampleCell("opt-bunt-pitch", {
            atBatSeed: {
              resultCode: "sac_bunt",
              battedDirection: "1-3",
              pitches: ["bunt_foul", "bunt_swinging", "ball"],
            },
          });
          const viewW = 74;
          const viewH = 52;
          return (
            <svg
              viewBox={`0 0 ${viewW} ${viewH}`}
              className="h-[52px] sm:h-[56px] w-auto max-w-full mx-auto block select-none"
              style={{ fontFamily: FONT_SANS, backgroundColor: PAPER_BG }}
              aria-hidden="true"
            >
              <svg x={0} y={0} width={19} height={viewH} viewBox={`0 0 19 ${viewH}`}>
                {renderSingleScorebookCellSvg(
                  buntPitchCell,
                  previewRules,
                  0,
                  0
                )}
              </svg>
              <rect
                x={19}
                y={0}
                width={viewW - 19}
                height={viewH}
                fill={PAPER_BG}
              />
              <line
                x1={19}
                y1={0}
                x2={19}
                y2={viewH}
                stroke={COLOR_GRID}
                strokeWidth={0.85}
              />
              <text
                x={22.5}
                y={12.8}
                fontSize={7.2}
                fontWeight={900}
                fill={COLOR_MUTED}
              >
                ←Bファウル
              </text>
              <text
                x={22.5}
                y={21.6}
                fontSize={7.2}
                fontWeight={900}
                fill={COLOR_MUTED}
              >
                ←B空振り
              </text>
              <text
                x={22.5}
                y={30.4}
                fontSize={7.0}
                fontWeight={800}
                fill="#94a3b8"
              >
                ←ボール
              </text>
              <rect
                x={0.45}
                y={0.45}
                width={viewW - 0.9}
                height={viewH - 0.9}
                fill="none"
                stroke={COLOR_GRID}
                strokeWidth={0.9}
              />
            </svg>
          );
        }

        case "pickoffMark": {
          const pickoffCell = makeSampleCell("opt-pickoff", {
            atBatSeed: {
              resultCode: "other",
              pitches: ["pickoff_1b", "pickoff_2b", "pickoff_3b", "strike"],
            },
          });
          const viewW = 70;
          const viewH = 52;
          return (
            <svg
              viewBox={`0 0 ${viewW} ${viewH}`}
              className="h-[52px] sm:h-[56px] w-auto max-w-full mx-auto block select-none"
              style={{ fontFamily: FONT_SANS, backgroundColor: PAPER_BG }}
              aria-hidden="true"
            >
              <svg x={0} y={0} width={19} height={viewH} viewBox={`0 0 19 ${viewH}`}>
                {renderSingleScorebookCellSvg(pickoffCell, previewRules, 0, 0)}
              </svg>
              <rect
                x={19}
                y={0}
                width={viewW - 19}
                height={viewH}
                fill={PAPER_BG}
              />
              <line
                x1={19}
                y1={0}
                x2={19}
                y2={viewH}
                stroke={COLOR_GRID}
                strokeWidth={0.85}
              />
              {previewRules.pickoffMark === "hidden" ? (
                <text
                  x={22}
                  y={27}
                  fontSize={7.4}
                  fontWeight={900}
                  fill={COLOR_MUTED}
                >
                  牽制省略
                </text>
              ) : (
                <>
                  <text
                    x={22.5}
                    y={12.8}
                    fontSize={7.2}
                    fontWeight={900}
                    fill={COLOR_MUTED}
                  >
                    ←1塁牽制
                  </text>
                  <text
                    x={22.5}
                    y={21.6}
                    fontSize={7.2}
                    fontWeight={900}
                    fill={COLOR_MUTED}
                  >
                    ←2塁牽制
                  </text>
                  <text
                    x={22.5}
                    y={30.4}
                    fontSize={7.2}
                    fontWeight={900}
                    fill={COLOR_MUTED}
                  >
                    ←3塁牽制
                  </text>
                </>
              )}
              <rect
                x={0.45}
                y={0.45}
                width={viewW - 0.9}
                height={viewH - 0.9}
                fill="none"
                stroke={COLOR_GRID}
                strokeWidth={0.9}
              />
            </svg>
          );
        }

        case "advanceError": {
          const errSegs = makeEmptySegments();
          errSegs[1] = makeSegment(1, "safe", "error");
          const errCell = makeSampleCell("opt-adv-err", {
            segments: errSegs,
            atBatSeed: {
              resultCode: "error",
              resultLabel: "遊捕球失策",
              battedDirection: "6",
            },
          });

          const fcSegs = makeEmptySegments();
          fcSegs[1] = makeSegment(1, "safe", "fc");
          const fcCell = makeSampleCell("opt-adv-fc", {
            segments: fcSegs,
            atBatSeed: {
              resultCode: "fc",
              resultLabel: "二野選",
              battedDirection: "4",
            },
          });

          const stealSegs = makeEmptySegments();
          stealSegs[2] = makeSegment(2, "safe", "steal");
          const stealCell = makeSampleCell("opt-adv-steal", {
            segments: stealSegs,
          });

          return renderDiamondStripSvg(
            [errCell, fcCell, stealCell],
            previewRules,
            ["捕球失策", "野選", "盗塁"]
          );
        }

        default: {
          const exhaustiveCheck: never = fieldKey;
          return exhaustiveCheck;
        }
      }
    }, [fieldKey, previewRules]);

    return (
      <div
        className={cn(
          "w-full rounded-lg border border-slate-300/90 bg-[#fffefb] p-1 overflow-hidden flex items-center justify-center",
          className
        )}
      >
        {content}
      </div>
    );
  }
);

