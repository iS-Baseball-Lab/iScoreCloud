// filepath: src/components/liff/ScorebookSymbolChartSheetModal.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Maximize2,
  Minimize2,
  Printer,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type {
  AdvanceMethodCode,
  CanonicalAtBatResult,
  CanonicalPitchResult,
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
  exportScorebookSvgElementsToPngBlob,
  printScorebookSvgElements,
  renderCellSubstitutionsOverlaySvg,
  renderDoublePlayVerticalSpanOverlaySvg,
  renderSingleScorebookCellSvg,
} from "@/components/liff/DigitalScorebookSheet";

const CHART_FONT_SANS =
  "'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Meiryo', system-ui, -apple-system, sans-serif";

const COLOR_PAPER = "#fffefb";
const COLOR_LABEL_BG = "#f8fafc";
const COLOR_HEADER_BG = "#fde68a";
const COLOR_FRAME = "#1e293b";
const COLOR_GRID = "#64748b";
const COLOR_GRID_SOFT = "#cbd5e1";
const COLOR_INK = "#0f172a";
const COLOR_SUB_INK = "#475569";

const TOTAL_ROWS = 16;
const COL_LABEL_W = 96;
const COL_TOTAL_W = COL_LABEL_W + SCOREBOOK_CELL_W; // 184
const SHEET_MARGIN_X = 18;
const SHEET_TOP_TITLE_H = 42;
const COL_HEADER_H = 26;
const SHEET_BOTTOM_PAD = 16;

const SVG_WIDTH = SHEET_MARGIN_X * 2 + COL_TOTAL_W * 5; // 956
const SVG_HEIGHT =
  SHEET_TOP_TITLE_H +
  COL_HEADER_H +
  TOTAL_ROWS * SCOREBOOK_CELL_H +
  SHEET_BOTTOM_PAD; // 1268 (A4縦比率 1:1.33〜1.41 に最適)

interface SampleAtBatSeed {
  resultCode: CanonicalAtBatResult;
  resultLabel?: string;
  battedDirection?: string;
  pitches?: CanonicalPitchResult[];
  outsInPlay?: number;
  rbi?: number;
}

interface SampleChartRowItem {
  lines: string[];
  noteLines?: string[];
  cell?: CompiledScorebookCell;
  /** 下の行とラベル枠を結合して2段ペアで見せる場合（例: ダブルプレイ、盗塁＋次打者） */
  labelRowSpan?: 1 | 2;
  /** 上の行の labelRowSpan=2 に吸収される行か */
  hiddenByRowSpanAbove?: boolean;
  /** 2段ペアの下段ラベル（盗塁 → 次打者→ のように同一枠内の下段に表示する場合） */
  pairedSubLabel?: string;
  /** ダブルプレイの上段セル（7 + DP 等）のカスタム補助描画 */
  dpLinkRole?: "top" | "bottom";
}

interface SampleChartColumn {
  header: string;
  rows: Array<SampleChartRowItem | null>;
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

function makeAtBat(id: string, seed: SampleAtBatSeed): ScorebookV2AtBat {
  return {
    id,
    inning: 1,
    isTop: true,
    columnIndex: 0,
    battingOrder: 1,
    batterName: "見本",
    batterPlayerId: null,
    pitcherName: "投手",
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

function makeCell(
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
    atBat: atBatSeed ? makeAtBat(`ab-${key}`, atBatSeed) : null,
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

function buildChartColumns(
  rules: ScorebookSymbolRules,
  samplePlayerSurname: string
): SampleChartColumn[] {
  const isKanjiAdv = rules.advanceError === "kanji";
  const walkSegs = makeEmptySegments();
  walkSegs[1] = makeSegment(1, "safe", "walk");

  const errorSegs = makeEmptySegments();
  errorSegs[1] = makeSegment(1, "safe", "error");

  // ── ① ボール・カウント ──
  const col1Rows: Array<SampleChartRowItem | null> = [
    {
      lines: ["ストライク"],
      cell: makeCell("c1-0", {
        atBatSeed: { resultCode: "other", pitches: ["strike"] },
      }),
    },
    {
      lines: ["ストライク", "(空振り)"],
      cell: makeCell("c1-1", {
        atBatSeed: { resultCode: "other", pitches: ["swinging_strike"] },
      }),
    },
    {
      lines: ["ボール"],
      cell: makeCell("c1-2", {
        atBatSeed: { resultCode: "other", pitches: ["ball"] },
      }),
    },
    {
      lines: ["ファール"],
      cell: makeCell("c1-3", {
        atBatSeed: { resultCode: "other", pitches: ["foul"] },
      }),
    },
    {
      lines: ["四球", "(フォアボール)"],
      cell: makeCell("c1-4", {
        segments: walkSegs,
        atBatSeed: { resultCode: "walk", resultLabel: "四球" },
      }),
    },
    {
      lines: ["死球", "(デッドボール)"],
      cell: makeCell("c1-5", {
        segments: walkSegs,
        atBatSeed: { resultCode: "hit_by_pitch", resultLabel: "死球" },
      }),
    },
    {
      lines: ["三振", "(見逃し)"],
      cell: makeCell("c1-6", {
        atBatSeed: {
          resultCode: "strikeout",
          resultLabel: "見逃し三振",
        },
      }),
    },
    {
      lines: ["三振", "(空振り)"],
      cell: makeCell("c1-7", {
        atBatSeed: {
          resultCode: "strikeout",
          resultLabel: "空振り三振",
        },
      }),
    },
    {
      lines: ["三振", "(振逃げ)"],
      cell: makeCell("c1-8", {
        segments: walkSegs,
        atBatSeed: {
          resultCode: "dropped_third_strike",
          resultLabel: "振逃げ",
        },
      }),
    },
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ];

  // ── ② アウトカウント、得点、残塁 ──
  const force1bSegs = makeEmptySegments();
  force1bSegs[1] = makeSegment(1, "out", "out_on_base", {
    isForceOut: true,
    throwChain: "1",
  });
  const force2bSegs = makeEmptySegments();
  force2bSegs[2] = makeSegment(2, "out", "fc", {
    isForceOut: true,
    throwChain: "6",
  });
  const force3bSegs = makeEmptySegments();
  force3bSegs[3] = makeSegment(3, "out", "fc", {
    isForceOut: true,
    throwChain: "5",
  });
  const forceHpSegs = makeEmptySegments();
  forceHpSegs[4] = makeSegment(4, "out", "fc", {
    isForceOut: true,
    throwChain: "2",
  });
  const tagOut1bSegs = makeEmptySegments();
  tagOut1bSegs[1] = makeSegment(1, "out", "out_on_base", {
    isForceOut: false,
    throwChain: "3",
  });

  const col2Rows: Array<SampleChartRowItem | null> = [
    {
      lines: ["一死"],
      cell: makeCell("c2-0", { outNumber: 1 }),
    },
    {
      lines: ["二死"],
      cell: makeCell("c2-1", { outNumber: 2 }),
    },
    {
      lines: ["三死"],
      cell: makeCell("c2-2", { outNumber: 3 }),
    },
    {
      lines: ["得点", "(自責点)"],
      cell: makeCell("c2-3", { runScored: true, isUnearnedRun: false }),
    },
    {
      lines: [
        "得点",
        rules.runMark === "earned_filled_unearned_open"
          ? "(非自責点)"
          : "(非自責・共通)",
      ],
      cell: makeCell("c2-4", { runScored: true, isUnearnedRun: true }),
    },
    {
      lines: ["残塁"],
      cell: makeCell("c2-5", { isResidual: true, residualBase: "1B" }),
    },
    {
      lines: ["ベースアウト", "(ファースト)"],
      noteLines: ["※ピッチャー"],
      cell: makeCell("c2-6", { segments: force1bSegs }),
    },
    {
      lines: ["ベースアウト", "(セカンド)"],
      noteLines: ["※ショート"],
      cell: makeCell("c2-7", { segments: force2bSegs }),
    },
    {
      lines: ["ベースアウト", "(サード)"],
      noteLines: ["※サード"],
      cell: makeCell("c2-8", { segments: force3bSegs }),
    },
    {
      lines: ["ベースアウト", "(ホーム)"],
      noteLines: ["※キャッチャー"],
      cell: makeCell("c2-9", { segments: forceHpSegs }),
    },
    {
      lines: ["タッチアウト"],
      noteLines: ["※ファースト", "タッチアウト"],
      cell: makeCell("c2-10", { segments: tagOut1bSegs }),
    },
    null,
    null,
    null,
    null,
    null,
  ];

  // ── ③ 打球（全16行） ──
  const col3Rows: Array<SampleChartRowItem | null> = [
    {
      lines: ["フライ"],
      noteLines: ["例)レフトフライ"],
      cell: makeCell("c3-0", {
        outNumber: 1,
        atBatSeed: {
          resultCode: "flyout",
          resultLabel: "左飛",
          battedDirection: "7",
        },
      }),
    },
    {
      lines: ["ファールフライ"],
      cell: makeCell("c3-1", {
        atBatSeed: {
          resultCode: "flyout",
          resultLabel: "左邪飛",
          battedDirection: "7F",
        },
      }),
    },
    {
      lines: ["ゴロ"],
      noteLines: ["例)ショートゴロ"],
      cell: makeCell("c3-2", {
        atBatSeed: {
          resultCode: "groundout",
          resultLabel: "遊ゴロ",
          battedDirection: "6",
        },
      }),
    },
    {
      lines: ["ライナー"],
      noteLines: ["例)ショートライナー"],
      cell: makeCell("c3-3", {
        atBatSeed: {
          resultCode: "flyout",
          resultLabel: "遊直",
          battedDirection: "6L",
        },
      }),
    },
    {
      lines: ["バント", "(犠打)"],
      cell: makeCell("c3-4", {
        outNumber: 1,
        atBatSeed: {
          resultCode: "sac_bunt",
          resultLabel: "投犠打",
          battedDirection: "1-3",
        },
      }),
    },
    {
      lines: ["バント", "(ファール)"],
      cell: makeCell("c3-5", {
        atBatSeed: {
          resultCode: "other",
          pitches: ["bunt_foul"],
        },
      }),
    },
    {
      lines: ["バント", "(空振り)"],
      cell: makeCell("c3-6", {
        atBatSeed: {
          resultCode: "other",
          pitches: ["bunt_swinging"],
        },
      }),
    },
    {
      lines: ["内野安打", "(バントヒット)"],
      cell: makeCell("c3-7", {
        segments: makeHitSegments(1),
        atBatSeed: {
          resultCode: "single",
          resultLabel: "三バント安打",
          battedDirection: "BH5",
        },
      }),
    },
    {
      lines: ["内野安打", "(ショート)"],
      cell: makeCell("c3-8", {
        segments: makeHitSegments(1),
        atBatSeed: {
          resultCode: "single",
          resultLabel: "遊内野安打",
          battedDirection: "6",
        },
      }),
    },
    {
      lines: ["ヒット", "(1ベース)"],
      cell: makeCell("c3-9", {
        segments: makeHitSegments(1),
        atBatSeed: {
          resultCode: "single",
          resultLabel: "左前ゴロ安打",
          battedDirection: "7",
        },
      }),
    },
    {
      lines: ["ヒット", "(2ベース)"],
      cell: makeCell("c3-10", {
        segments: makeHitSegments(2),
        atBatSeed: {
          resultCode: "double",
          resultLabel: "右中間二塁打",
          battedDirection: "8・9",
        },
      }),
    },
    {
      lines: ["ヒット", "(3ベース)"],
      cell: makeCell("c3-11", {
        segments: makeHitSegments(3),
        atBatSeed: {
          resultCode: "triple",
          resultLabel: "右線三塁打",
          battedDirection: "9",
        },
      }),
    },
    {
      lines: ["ホームラン"],
      cell: makeCell("c3-12", {
        runScored: true,
        segments: makeHitSegments(4),
        atBatSeed: {
          resultCode: "home_run",
          resultLabel: "中本塁打",
          battedDirection: "8",
          rbi: 1,
        },
      }),
    },
    {
      lines: ["ランニング", "ホームラン(RH)"],
      cell: makeCell("c3-13", {
        runScored: true,
        segments: makeHitSegments(4),
        atBatSeed: {
          resultCode: "home_run",
          resultLabel: "右ランニング本塁打",
          battedDirection: "RH9",
          rbi: 1,
        },
      }),
    },
    {
      lines: ["ポテンヒット"],
      cell: makeCell("c3-14", {
        segments: makeHitSegments(1),
        atBatSeed: {
          resultCode: "single",
          resultLabel: "右ポテンヒット",
          battedDirection: "T9",
        },
      }),
    },
    {
      lines: ["犠飛"],
      cell: makeCell("c3-15", {
        atBatSeed: {
          resultCode: "sac_fly",
          resultLabel: "中犠飛",
          battedDirection: "8",
          rbi: 1,
        },
      }),
    },
  ];

  // ── ④ エラー・妨害・併殺 ──
  const obsSegs = makeEmptySegments();
  obsSegs[3] = makeSegment(3, "safe", "obstruction", {
    throwChain: "6",
  });

  const walkForce2bOutSegs = makeEmptySegments();
  walkForce2bOutSegs[1] = makeSegment(1, "safe", "walk");
  walkForce2bOutSegs[2] = makeSegment(2, "out", "fc", {
    isForceOut: true,
    throwChain: "6-4",
  });

  const fcResidualSegs = makeEmptySegments();
  fcResidualSegs[1] = makeSegment(1, "safe", "fc");

  const col4Rows: Array<SampleChartRowItem | null> = [
    {
      lines: ["エラー", "(捕球)"],
      cell: makeCell("c4-0", {
        segments: errorSegs,
        atBatSeed: {
          resultCode: "error",
          resultLabel: "遊捕球エラー",
          battedDirection: "6",
        },
      }),
    },
    {
      lines: ["エラー", "(送球)"],
      cell: makeCell("c4-1", {
        segments: errorSegs,
        atBatSeed: {
          resultCode: "error",
          resultLabel: "遊送球エラー",
          battedDirection: "6",
        },
      }),
    },
    {
      lines: ["フィルダーズ", "チョイス"],
      cell: makeCell("c4-2", {
        segments: fcResidualSegs,
        atBatSeed: {
          resultCode: "fc",
          resultLabel: "二野選",
          battedDirection: "4",
        },
      }),
    },
    {
      lines: ["打撃妨害", "(インターフェア)"],
      cell: makeCell("c4-3", {
        segments: walkSegs,
        atBatSeed: {
          resultCode: "interference",
          resultLabel: "捕打撃妨害",
          battedDirection: "2",
        },
      }),
    },
    {
      lines: ["走塁妨害", "(オブストラクション)"],
      cell: makeCell("c4-4", {
        segments: obsSegs,
      }),
    },
    {
      lines: ["守備妨害", "(インターフェア)"],
      noteLines: ["※インタープレイ"],
      cell: makeCell("c4-5", {
        atBatSeed: {
          resultCode: "interference_out",
          resultLabel: "守備妨害",
        },
      }),
    },
    {
      lines: ["ボーク"],
      cell: makeCell("c4-6", {
        atBatSeed: {
          resultCode: "other",
          battedDirection: isKanjiAdv ? "ボ" : "BK",
        },
      }),
    },
    {
      lines: ["暴投", "(ピッチャーのエラー)"],
      noteLines: ["※ワイルドピッチ"],
      cell: makeCell("c4-7", {
        atBatSeed: {
          resultCode: "other",
          battedDirection: isKanjiAdv ? "暴" : "WP",
        },
      }),
    },
    {
      lines: ["捕逸", "(キャッチャーのエラー)"],
      noteLines: ["※パスボール"],
      cell: makeCell("c4-8", {
        atBatSeed: {
          resultCode: "other",
          battedDirection: isKanjiAdv ? "捕" : "PB",
        },
      }),
    },
    null,
    {
      lines: ["ダブルプレイ"],
      labelRowSpan: 2,
      dpLinkRole: "top",
      cell: makeCell("c4-10", {
        outNumber: 1,
        atBatSeed: {
          resultCode: "other",
          battedDirection: "7",
        },
      }),
    },
    {
      lines: [],
      hiddenByRowSpanAbove: true,
      dpLinkRole: "bottom",
      cell: makeCell("c4-11", {
        outNumber: 2,
        atBatSeed: {
          resultCode: "double_play",
          outsInPlay: 2,
          battedDirection: "6-4-3",
        },
      }),
    },
    null,
    {
      lines: ["フォアボールで出塁", "セカンドで封殺"],
      cell: makeCell("c4-13", {
        outNumber: 3,
        segments: walkForce2bOutSegs,
        atBatSeed: {
          resultCode: "walk",
          resultLabel: "四球",
        },
      }),
    },
    {
      lines: ["ショートゴロ 6-4Bで", "チェンジした場合"],
      cell: makeCell("c4-14", {
        isResidual: true,
        residualBase: "1B",
        isInningEndCell: true,
        segments: fcResidualSegs,
        atBatSeed: {
          resultCode: "fc",
          battedDirection: "6-",
        },
      }),
    },
    null,
  ];

  // ── ⑤ その他（盗塁・牽制・選手交代・投手交代） ──
  const steal2bSegs = makeEmptySegments();
  steal2bSegs[2] = makeSegment(2, "safe", "steal");

  const doubleStealSegs = makeEmptySegments();
  doubleStealSegs[2] = makeSegment(2, "safe", "steal", {
    isDoubleSteal: true,
  });

  const cs2bSegs = makeEmptySegments();
  cs2bSegs[2] = makeSegment(2, "out", "caught_stealing");

  const pickoff1bOutSegs = makeEmptySegments();
  pickoff1bOutSegs[2] = makeSegment(2, "out", "pickoff_out", {
    throwChain: "1-3",
  });

  const pickoff2bSegs = makeEmptySegments();
  pickoff2bSegs[1] = makeSegment(1, "safe", "walk");
  pickoff2bSegs[2] = makeSegment(2, "safe", "steal");

  const pickoff3bSegs = makeEmptySegments();
  pickoff3bSegs[1] = makeSegment(1, "safe", "walk");
  pickoff3bSegs[2] = makeSegment(2, "safe", "other", {
    customLabelOverride: "(ー)",
  });
  pickoff3bSegs[3] = makeSegment(3, "safe", "steal");

  const wasedaPrSegs = makeEmptySegments();
  if (rules.pinchHitterMark === "waseda_diamond_pr") {
    wasedaPrSegs[2] = makeSegment(2, "safe", "other", {
      pinchRunnerName: samplePlayerSurname,
    });
  }

  const col5Rows: Array<SampleChartRowItem | null> = [
    {
      lines: ["盗塁"],
      labelRowSpan: 2,
      pairedSubLabel: "次打者→",
      cell: makeCell("c5-0", {
        segments: steal2bSegs,
      }),
    },
    {
      lines: [],
      hiddenByRowSpanAbove: true,
      cell: makeCell("c5-1", {
        stealPitchIndices: [0],
        atBatSeed: {
          resultCode: "other",
          pitches: ["strike"],
        },
      }),
    },
    {
      lines: ["ダブルスチール"],
      labelRowSpan: 2,
      pairedSubLabel: "次打者→",
      cell: makeCell("c5-2", {
        segments: doubleStealSegs,
      }),
    },
    {
      lines: [],
      hiddenByRowSpanAbove: true,
      cell: makeCell("c5-3", {
        stealPitchIndices: [0],
        atBatSeed: {
          resultCode: "other",
          pitches: ["strike"],
        },
      }),
    },
    {
      lines: ["盗塁失敗"],
      cell: makeCell("c5-4", {
        segments: cs2bSegs,
      }),
    },
    null,
    {
      lines: ["けん制", "(ファースト)"],
      cell: makeCell("c5-6", {
        segments: pickoff1bOutSegs,
        atBatSeed: {
          resultCode: "other",
          pitches: ["pickoff_1b"],
        },
      }),
    },
    {
      lines: ["けん制", "(セカンド)"],
      cell: makeCell("c5-7", {
        segments: pickoff2bSegs,
        atBatSeed: {
          resultCode: "walk",
          resultLabel: "四球",
          pitches: ["pickoff_2b"],
        },
      }),
    },
    {
      lines: ["けん制", "(サード)"],
      cell: makeCell("c5-8", {
        segments: pickoff3bSegs,
        atBatSeed: {
          resultCode: "walk",
          resultLabel: "四球",
          pitches: ["pickoff_3b"],
        },
      }),
    },
    null,
    {
      lines: ["代打"],
      cell: makeCell("c5-10", {
        leftOutsideSub: {
          name: samplePlayerSurname,
          subType: "PH",
        },
      }),
    },
    {
      lines: ["代走・守備交代"],
      noteLines: ["選手がそのまま打席"],
      cell: makeCell("c5-11", {
        segments: wasedaPrSegs,
        rightInsideSub: {
          name: samplePlayerSurname,
          subType: "DEF",
        },
      }),
    },
    null,
    null,
    {
      lines: ["ピッチャー交代"],
      cell: makeCell("c5-14", {
        hasPitcherChangeBefore: true,
        newPitcherName: samplePlayerSurname,
      }),
    },
    {
      lines: ["ピッチャー", "イニング途中交代"],
      cell: makeCell("c5-15", {
        hasPitcherChangeBefore: true,
        newPitcherName: samplePlayerSurname,
        pitcherChangeAtPitchIndex: 2,
        atBatSeed: {
          resultCode: "other",
          pitches: ["strike", "ball", "swinging_strike"],
        },
      }),
    },
  ];

  return [
    { header: "①ボール・カウント", rows: col1Rows },
    { header: "②アウトカウント、得点、残塁", rows: col2Rows },
    { header: "③打球", rows: col3Rows },
    { header: "④エラー", rows: col4Rows },
    { header: "⑤その他", rows: col5Rows },
  ];
}

export interface ScorebookSymbolChartSheetSvgProps {
  rules: ScorebookSymbolRules;
  chartTitle: string;
  samplePlayerSurname: string;
  showBlankDiamonds: boolean;
  svgRef?: React.Ref<SVGSVGElement>;
}

export function ScorebookSymbolChartSheetSvg({
  rules,
  chartTitle,
  samplePlayerSurname,
  showBlankDiamonds,
  svgRef,
}: ScorebookSymbolChartSheetSvgProps) {
  const columns = useMemo(
    () => buildChartColumns(rules, samplePlayerSurname || "山田"),
    [rules, samplePlayerSurname]
  );

  const tableOriginX = SHEET_MARGIN_X;
  const tableOriginY = SHEET_TOP_TITLE_H;
  const rowsOriginY = tableOriginY + COL_HEADER_H;
  const tableW = COL_TOTAL_W * 5;
  const tableH = COL_HEADER_H + TOTAL_ROWS * SCOREBOOK_CELL_H;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
      width="100%"
      className="block select-none"
      style={{
        fontFamily: CHART_FONT_SANS,
        backgroundColor: COLOR_PAPER,
      }}
    >
      {/* シート紙面ベース */}
      <rect
        x={0}
        y={0}
        width={SVG_WIDTH}
        height={SVG_HEIGHT}
        fill={COLOR_PAPER}
      />

      {/* タイトル行 */}
      <text
        x={tableOriginX + 2}
        y={28}
        fontSize={19}
        fontWeight={900}
        fill={COLOR_INK}
        letterSpacing="0.02em"
      >
        {chartTitle.trim() || "スコア記号 早見表"}
      </text>
      {rules.customNote && rules.customNote.trim() && (
        <text
          x={tableOriginX + tableW - 2}
          y={27}
          fontSize={10.5}
          fontWeight={800}
          textAnchor="end"
          fill={COLOR_SUB_INK}
        >
          ※ {rules.customNote.trim()}
        </text>
      )}

      {/* 5列ヘッダー帯 */}
      <rect
        x={tableOriginX}
        y={tableOriginY}
        width={tableW}
        height={COL_HEADER_H}
        fill={COLOR_HEADER_BG}
        stroke={COLOR_FRAME}
        strokeWidth={1.4}
      />
      {columns.map((col, colIdx) => {
        const colX = tableOriginX + colIdx * COL_TOTAL_W;
        return (
          <g key={col.header}>
            <text
              x={colX + COL_TOTAL_W / 2}
              y={tableOriginY + 17.8}
              fontSize={11.0}
              fontWeight={900}
              textAnchor="middle"
              fill={COLOR_INK}
            >
              {col.header}
            </text>
          </g>
        );
      })}

      {/* 各列 × 16行セル描画 */}
      {columns.map((col, colIdx) => {
        const colX = tableOriginX + colIdx * COL_TOTAL_W;
        const cellX = colX + COL_LABEL_W;

        return (
          <g key={`col-${colIdx}`}>
            {Array.from({ length: TOTAL_ROWS }).map((_, rowIdx) => {
              const item = col.rows[rowIdx] ?? null;
              const rowY = rowsOriginY + rowIdx * SCOREBOOK_CELL_H;
              const spanRows = item?.labelRowSpan ?? 1;
              const labelBoxH = SCOREBOOK_CELL_H * spanRows;
              const hasLeftOutsideWave = Boolean(item?.cell?.leftOutsideSub);

              // 1. 左側の項目名セル（2行結合時は上段でまとめて描画）
              const labelNode = item?.hiddenByRowSpanAbove ? null : (
                <g>
                  <rect
                    x={colX}
                    y={rowY}
                    width={COL_LABEL_W}
                    height={labelBoxH}
                    fill={item ? COLOR_LABEL_BG : COLOR_PAPER}
                    stroke={COLOR_GRID_SOFT}
                    strokeWidth={0.85}
                  />
                  {item &&
                    (() => {
                      const mainLines = item.lines;
                      const notes = item.noteLines ?? [];
                      const labelCenterX =
                        colX +
                        COL_LABEL_W / 2 -
                        (hasLeftOutsideWave &&
                        rules.pinchHitterMark !== "lineup_only"
                          ? 6
                          : 0);

                      if (item.pairedSubLabel && spanRows === 2) {
                        return (
                          <g>
                            <text
                              x={labelCenterX}
                              y={rowY + SCOREBOOK_CELL_H / 2 + 3.6}
                              fontSize={10.0}
                              fontWeight={900}
                              textAnchor="middle"
                              fill={COLOR_INK}
                            >
                              {mainLines[0] || ""}
                            </text>
                            <text
                              x={labelCenterX}
                              y={
                                rowY +
                                SCOREBOOK_CELL_H +
                                SCOREBOOK_CELL_H / 2 +
                                3.6
                              }
                              fontSize={9.2}
                              fontWeight={800}
                              textAnchor="middle"
                              fill={COLOR_SUB_INK}
                            >
                              {item.pairedSubLabel}
                            </text>
                          </g>
                        );
                      }

                      const totalLines = mainLines.length + notes.length;
                      const lineGap = totalLines >= 3 ? 12.6 : 13.8;
                      const blockCenterY = rowY + labelBoxH / 2;
                      const firstLineY =
                        blockCenterY - ((totalLines - 1) * lineGap) / 2 + 3.5;

                      return (
                        <g>
                          {mainLines.map((ln, lIdx) => {
                            const isCompact = ln.length >= 9;
                            return (
                              <text
                                key={`m-${lIdx}`}
                                x={labelCenterX}
                                y={firstLineY + lIdx * lineGap}
                                fontSize={isCompact ? 8.7 : 9.8}
                                fontWeight={900}
                                textAnchor="middle"
                                fill={COLOR_INK}
                              >
                                {ln}
                              </text>
                            );
                          })}
                          {notes.map((nt, nIdx) => {
                            const idxAll = mainLines.length + nIdx;
                            return (
                              <text
                                key={`n-${nIdx}`}
                                x={labelCenterX}
                                y={firstLineY + idxAll * lineGap}
                                fontSize={8.4}
                                fontWeight={800}
                                textAnchor="middle"
                                fill={COLOR_SUB_INK}
                              >
                                {nt}
                              </text>
                            );
                          })}
                        </g>
                      );
                    })()}
                </g>
              );

              // 2. 右側のスコアブック1マス
              const shouldDrawScoreCell = Boolean(item?.cell) || showBlankDiamonds;

              return (
                <g key={`r-${rowIdx}`}>
                  {labelNode}
                  {shouldDrawScoreCell ? (
                    renderSingleScorebookCellSvg(
                      item?.cell,
                      rules,
                      cellX,
                      rowY,
                      Boolean(
                        item?.cell?.rightInsideSub &&
                          rules.pinchHitterMark !== "lineup_only"
                      )
                    )
                  ) : (
                    <rect
                      x={cellX}
                      y={rowY}
                      width={SCOREBOOK_CELL_W}
                      height={SCOREBOOK_CELL_H}
                      fill={COLOR_PAPER}
                      stroke={COLOR_GRID_SOFT}
                      strokeWidth={0.85}
                    />
                  )}

                  {/* ダブルプレイ縦2マス（上下2セル描画後に右内上部〜下部括弧＋1・2マス間DPを重ね描画） */}
                  {item?.dpLinkRole === "bottom" &&
                    renderDoublePlayVerticalSpanOverlaySvg({
                      cellX,
                      topCellY: rowY - SCOREBOOK_CELL_H,
                      spanRows: 2,
                      rules,
                    })}

                  {/* 代打（左赤波線＋縦書き氏名）・代走/守備交代（右内赤波線＋縦書き氏名）オーバーレイ */}
                  {item?.cell &&
                    renderCellSubstitutionsOverlaySvg(
                      item.cell,
                      rules,
                      cellX,
                      rowY,
                      0,
                      false
                    )}
                </g>
              );
            })}
          </g>
        );
      })}

      {/* 5つの大列を明確に区切る縦太罫線 ＆ 表外枠 */}
      {[1, 2, 3, 4].map((cIdx) => {
        const vx = tableOriginX + cIdx * COL_TOTAL_W;
        return (
          <line
            key={`div-${cIdx}`}
            x1={vx}
            y1={tableOriginY}
            x2={vx}
            y2={tableOriginY + tableH}
            stroke={COLOR_FRAME}
            strokeWidth={1.45}
          />
        );
      })}
      <rect
        x={tableOriginX}
        y={tableOriginY}
        width={tableW}
        height={tableH}
        fill="none"
        stroke={COLOR_FRAME}
        strokeWidth={1.7}
      />
      {/* サブ列（項目名｜BSO+ダイヤ）の境界縦線 */}
      {[0, 1, 2, 3, 4].map((cIdx) => {
        const subVx = tableOriginX + cIdx * COL_TOTAL_W + COL_LABEL_W;
        return (
          <line
            key={`subdiv-${cIdx}`}
            x1={subVx}
            y1={rowsOriginY}
            x2={subVx}
            y2={tableOriginY + tableH}
            stroke={COLOR_GRID}
            strokeWidth={1.0}
          />
        );
      })}
    </svg>
  );
}

export interface ScorebookSymbolChartSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamName: string;
  rules: ScorebookSymbolRules;
  onRegisterLegendToCloud?: (file: File) => Promise<void>;
}

export function ScorebookSymbolChartSheetModal({
  isOpen,
  onClose,
  teamName,
  rules,
  onRegisterLegendToCloud,
}: ScorebookSymbolChartSheetModalProps) {
  const [mounted, setMounted] = useState(false);
  const defaultTitle = useMemo(() => {
    const clean = (teamName || "").trim();
    return clean ? `${clean} スコア記号 早見表` : "スコア記号 早見表";
  }, [teamName]);

  const defaultSampleSurname = useMemo(() => {
    const clean = (teamName || "").trim();
    if (
      !clean ||
      clean === "マイチーム" ||
      clean === "チーム" ||
      clean === "体験デモチーム"
    ) {
      return "山田";
    }
    const jpMatch = clean.match(/^[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]{2,}/);
    return jpMatch ? jpMatch[0].slice(0, 2) : "山田";
  }, [teamName]);

  const [chartTitle, setChartTitle] = useState(defaultTitle);
  const [sampleSurname, setSampleSurname] = useState(defaultSampleSurname);
  const [showBlankDiamonds, setShowBlankDiamonds] = useState(false);
  const [printOrientation, setPrintOrientation] = useState<
    "portrait" | "landscape"
  >("portrait");
  const [isZoomed, setIsZoomed] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [isRegisteringCloud, setIsRegisteringCloud] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setChartTitle(defaultTitle);
  }, [defaultTitle]);

  useEffect(() => {
    setSampleSurname(defaultSampleSurname);
  }, [defaultSampleSurname]);

  if (!mounted || !isOpen) return null;

  const handlePrintPdf = () => {
    if (!svgRef.current) return;
    printScorebookSvgElements(
      [svgRef.current],
      chartTitle || "スコア記号早見表",
      printOrientation
    );
  };

  const handleDownloadPng = async () => {
    if (!svgRef.current || isExportingPng) return;
    try {
      setIsExportingPng(true);
      const blob = await exportScorebookSvgElementsToPngBlob(
        [svgRef.current],
        2.5
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeName =
        (chartTitle || "scorebook-symbol-chart")
          .replace(/[\\/:*?"<>|\s]+/g, "_")
          .slice(0, 50) || "scorebook-symbol-chart";
      a.href = url;
      a.download = `${safeName}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast.success("早見表の高画質PNG画像を保存しました");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "PNG画像の書き出しに失敗しました";
      toast.error(msg);
    } finally {
      setIsExportingPng(false);
    }
  };

  const handleRegisterToTeamCloud = async () => {
    if (!svgRef.current || !onRegisterLegendToCloud || isRegisteringCloud) {
      return;
    }
    try {
      setIsRegisteringCloud(true);
      const blob = await exportScorebookSvgElementsToPngBlob(
        [svgRef.current],
        2.4
      );
      const file = new File([blob], "team-scorebook-symbol-chart.png", {
        type: "image/png",
      });
      await onRegisterLegendToCloud(file);
      onClose();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "チーム早見表としての保存に失敗しました";
      toast.error(msg);
    } finally {
      setIsRegisteringCloud(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-slate-950/75 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-4xl max-h-[90dvh] rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xs overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* A-3 ソリッドダークヘッダー（ルール・資料系 border-amber-500） */}
        <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 px-4 py-3 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-7 h-7 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-400/40 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-black text-white truncate">
                清書マス版「スコア記号 早見表」作成・出力
              </h3>
              <p className="text-[10px] font-bold text-slate-300 truncate">
                選択中のチーム記号ルールと本物のスコアブックマス目で自動生成
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 上部カスタマイズバー */}
        <div className="px-3.5 py-2.5 bg-muted/45 border-b border-border space-y-2 shrink-0">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <div className="sm:col-span-6 flex items-center gap-1.5">
              <label className="text-[10px] font-black text-muted-foreground shrink-0">
                表題
              </label>
              <input
                type="text"
                maxLength={40}
                value={chartTitle}
                onChange={(e) => setChartTitle(e.target.value)}
                placeholder="例: チーム名 スコア記号 早見表"
                className="flex-1 h-8 px-2.5 rounded-xl bg-card border border-border text-xs font-black text-foreground focus:outline-hidden focus:border-primary"
              />
            </div>

            <div className="sm:col-span-3 flex items-center gap-1.5">
              <label className="text-[10px] font-black text-muted-foreground shrink-0">
                見本名
              </label>
              <input
                type="text"
                maxLength={4}
                value={sampleSurname}
                onChange={(e) => setSampleSurname(e.target.value)}
                placeholder="山田"
                className="w-full h-8 px-2.5 rounded-xl bg-card border border-border text-xs font-black text-foreground focus:outline-hidden focus:border-primary"
              />
            </div>

            <div className="sm:col-span-3 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowBlankDiamonds((v) => !v)}
                className={cn(
                  "flex-1 h-8 px-2 rounded-xl border text-[10px] font-black transition-all cursor-pointer flex items-center justify-center gap-1",
                  showBlankDiamonds
                    ? "bg-primary/12 text-primary border-primary"
                    : "bg-card text-foreground border-border hover:bg-muted"
                )}
              >
                <Sparkles className="w-3 h-3 shrink-0" />
                <span>
                  {showBlankDiamonds ? "余白: 追記マスあり" : "余白: すっきり"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setIsZoomed((v) => !v)}
                className="h-8 px-2.5 rounded-xl bg-card hover:bg-muted border border-border text-[10px] font-black text-foreground flex items-center gap-1 shrink-0 cursor-pointer"
              >
                {isZoomed ? (
                  <>
                    <Minimize2 className="w-3.5 h-3.5 text-primary" />
                    <span>全体</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5 text-primary" />
                    <span>拡大</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* シートプレビュー領域 */}
        <div className="flex-1 overflow-auto bg-[#e2e8f0] p-2.5 sm:p-4">
          <div
            className={cn(
              "mx-auto rounded-xl border border-slate-300 bg-[#fffefb] shadow-xs overflow-hidden",
              isZoomed ? "w-[920px]" : "w-full max-w-[780px]"
            )}
          >
            <ScorebookSymbolChartSheetSvg
              svgRef={svgRef}
              rules={rules}
              chartTitle={chartTitle}
              samplePlayerSurname={sampleSurname}
              showBlankDiamonds={showBlankDiamonds}
            />
          </div>
        </div>

        {/* 下部アクションバー（Safe Area 完全対応） */}
        <div className="px-3.5 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 bg-card border-t border-border space-y-2 shrink-0">
          {onRegisterLegendToCloud && (
            <button
              type="button"
              disabled={isRegisteringCloud || isExportingPng}
              onClick={() => void handleRegisterToTeamCloud()}
              className="w-full py-2.5 px-3.5 rounded-2xl bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-xs font-black shadow-xs flex items-center justify-center gap-1.5 active:scale-[0.99] transition-all cursor-pointer"
            >
              {isRegisteringCloud ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>チームの公式早見表としてクラウド登録中...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4 shrink-0" />
                  <span>
                    このままチームの公式「スコア記号早見表」として登録する
                  </span>
                </>
              )}
            </button>
          )}

          <div className="flex items-center gap-2">
            {/* A4向き切替 */}
            <div className="flex rounded-xl border border-border bg-muted/50 p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setPrintOrientation("portrait")}
                className={cn(
                  "px-2 py-1.5 rounded-lg text-[10px] font-black transition-colors cursor-pointer",
                  printOrientation === "portrait"
                    ? "bg-card text-primary shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                A4縦
              </button>
              <button
                type="button"
                onClick={() => setPrintOrientation("landscape")}
                className={cn(
                  "px-2 py-1.5 rounded-lg text-[10px] font-black transition-colors cursor-pointer",
                  printOrientation === "landscape"
                    ? "bg-card text-primary shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                A4横
              </button>
            </div>

            <button
              type="button"
              onClick={handlePrintPdf}
              className="flex-1 py-2.5 px-3 rounded-xl bg-card hover:bg-muted border border-border text-xs font-black text-foreground flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4 text-primary shrink-0" />
              <span>A4印刷 / PDF</span>
            </button>

            <button
              type="button"
              disabled={isExportingPng || isRegisteringCloud}
              onClick={() => void handleDownloadPng()}
              className="flex-1 py-2.5 px-3 rounded-xl bg-card hover:bg-muted border border-border text-xs font-black text-foreground flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              {isExportingPng ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                  <span>生成中...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 text-primary shrink-0" />
                  <span>PNG画像保存</span>
                </>
              )}
            </button>
          </div>

          <p className="text-[10px] font-bold text-muted-foreground text-center flex items-center justify-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
            <span>
              スコア設定で記号ルールを切り替えると、この早見表の全マスも自動連動します
            </span>
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
