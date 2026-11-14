// filepath: src/app/liff/tools/news-generator/_components/LiveAtBatPadCard.tsx
"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Undo2,
  UserPlus,
  Flag,
  SlidersHorizontal,
  X,
  Footprints,
  Sparkles,
  Copy,
  Check,
  Share2,
  FileText,
  Clock,
  RotateCcw,
  Pencil,
  Eye,
  ArrowRightLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LiffSelect } from "@/components/liff/LiffSelect";
import {
  FlickPadButton,
  type FlickSubOption,
} from "./FlickPadButton";
import {
  POSITION_OPTIONS,
  buildBattedPlayCandidates,
  computeHalfInningSituation,
  computeScoreboardSummary,
  findActiveDefenderByDirection,
  formatLiveReportText,
  formatPlayerReportName,
  formatRunnersLabel,
  formatSinglePlayEntryLine,
  getCurrentHmText,
  isMyTeamBattingHalf,
  normalizeReportPositionCode,
  normalizeRunnersList,
  resolveActiveLineupAtInning,
  simulateDirectOutcome,
  simulateQuickBaserunningPlay,
  type BattedOutcomeCode,
  type BattedPlayVariant,
  type DirectOutcomeCode,
  type DirectPlayVariant,
  type QuickBaserunningCode,
  type SimulatedPlayCandidate,
} from "@/lib/liff/live-report-v2";
import type {
  LiveReportBaseNum,
  LiveReportHalfInning,
  LiveReportOutputMode,
  LiveReportPlayEntry,
  LiveReportRosterPlayer,
  LiveReportSubType,
  LiveReportV2Document,
} from "@/types/live-report-v2";

interface LiveAtBatPadCardProps {
  doc: LiveReportV2Document;
  onChangeDoc: (
    updater: (prev: LiveReportV2Document) => LiveReportV2Document
  ) => void;
  rosterPlayers: ReadonlyArray<LiveReportRosterPlayer>;
  activeContextKey: string;
  outputMode?: LiveReportOutputMode;
  onChangeOutputMode?: (mode: LiveReportOutputMode) => void;
  onCopyText?: () => void;
  onShareLine?: () => void;
  copied?: boolean;
  onOpenFullPreview?: () => void;
  /** 担当外メンバーの閲覧モード（入力パッド非表示・ドキュメント変更0） */
  readOnly?: boolean;
  editorDisplayName?: string | null;
  viewerHalfOverride?: { inning: number; isBottom: boolean } | null;
  onChangeViewerHalfOverride?: (
    override: { inning: number; isBottom: boolean } | null
  ) => void;
  onRequestTakeover?: () => void;
}

const INFIELD_DIRECTIONS = ["投", "捕", "一", "二", "三", "遊"] as const;
const OUTFIELD_DIRECTIONS = ["左", "左中", "中", "右中", "右"] as const;

const DIRECTION_FLICK_OPTIONS: Record<
  string,
  ReadonlyArray<FlickSubOption<string>>
> = {
  投: [
    { id: "p_std", label: "投（標準）", value: "投" },
    { id: "p_hard", label: "投強襲", sublabel: "ピッチャー強襲", value: "投強襲" },
    { id: "p_front", label: "投前", sublabel: "ピッチャー前", value: "投前" },
    { id: "p_1b", label: "一塁側", sublabel: "投手一塁側", value: "投一側" },
    { id: "p_3b", label: "三塁側", sublabel: "投手三塁側", value: "投三側" },
  ],
  捕: [
    { id: "c_std", label: "捕（標準）", value: "捕" },
    { id: "c_front", label: "捕前", sublabel: "ホーム前", value: "捕前" },
    { id: "c_foul", label: "捕邪", sublabel: "キャッチャーファウル", value: "捕邪" },
  ],
  一: [
    { id: "1b_std", label: "一（標準）", value: "一" },
    { id: "1b_line", label: "一線（ライン際）", sublabel: "一塁線", value: "一線" },
    { id: "1b_12", label: "一二間", sublabel: "一二塁間", value: "一二間" },
    { id: "1b_hard", label: "一強襲", sublabel: "ファースト強襲", value: "一強襲" },
    { id: "1b_foul", label: "一邪", sublabel: "一塁ファウル側", value: "一邪" },
  ],
  二: [
    { id: "2b_std", label: "二（標準）", value: "二" },
    { id: "2b_12", label: "一二間", sublabel: "一二塁間", value: "一二間" },
    { id: "2b_26", label: "二遊間", sublabel: "センター抜け方向", value: "二遊間" },
    { id: "2b_back", label: "二後方", sublabel: "セカンド後方", value: "二後方" },
    { id: "2b_hard", label: "二強襲", sublabel: "セカンド強襲", value: "二強襲" },
  ],
  三: [
    { id: "3b_std", label: "三（標準）", value: "三" },
    { id: "3b_line", label: "三線（ライン際）", sublabel: "三塁線", value: "三線" },
    { id: "3b_56", label: "三遊間", sublabel: "三遊間方向", value: "三遊間" },
    { id: "3b_front", label: "三前", sublabel: "サード前", value: "三前" },
    { id: "3b_hard", label: "三強襲", sublabel: "サード強襲", value: "三強襲" },
    { id: "3b_foul", label: "三邪", sublabel: "三塁ファウル側", value: "三邪" },
  ],
  遊: [
    { id: "ss_std", label: "遊（標準）", value: "遊" },
    { id: "ss_56", label: "三遊間", sublabel: "三遊間方向", value: "三遊間" },
    { id: "ss_26", label: "二遊間", sublabel: "二遊間方向", value: "二遊間" },
    { id: "ss_back", label: "遊後方", sublabel: "ショート後方", value: "遊後方" },
    { id: "ss_hard", label: "遊強襲", sublabel: "ショート強襲", value: "遊強襲" },
  ],
  左: [
    { id: "lf_front", label: "左前（手前）", sublabel: "レフト前", value: "左前" },
    { id: "lf_line", label: "左線（ライン際）", sublabel: "レフト線", value: "左線" },
    { id: "lf_over", label: "左越（オーバー）", sublabel: "レフト越え", value: "左越" },
    { id: "lf_shallow", label: "左浅（浅め）", sublabel: "ポテン・浅飛球", value: "左浅" },
    { id: "lf_deep", label: "左深（後方）", sublabel: "深い当たり", value: "左深" },
    { id: "lf_std", label: "左（標準）", value: "左" },
  ],
  左中: [
    { id: "lcf_std", label: "左中間（標準）", value: "左中" },
    { id: "lcf_break", label: "左中間破る", sublabel: "長打コース", value: "左中間破る" },
    { id: "lcf_shallow", label: "左中間浅め", value: "左中浅" },
    { id: "lcf_deep", label: "左中間深め", value: "左中深" },
  ],
  中: [
    { id: "cf_front", label: "中前（手前）", sublabel: "センター前", value: "中前" },
    { id: "cf_over", label: "中越（オーバー）", sublabel: "センター越え", value: "中越" },
    { id: "cf_shallow", label: "中浅（浅め）", sublabel: "ポテン・浅飛球", value: "中浅" },
    { id: "cf_deep", label: "中深（後方）", sublabel: "バックスクリーン方向", value: "中深" },
    { id: "cf_std", label: "中（標準）", value: "中" },
  ],
  右中: [
    { id: "rcf_std", label: "右中間（標準）", value: "右中" },
    { id: "rcf_break", label: "右中間破る", sublabel: "長打コース", value: "右中間破る" },
    { id: "rcf_shallow", label: "右中間浅め", value: "右中浅" },
    { id: "rcf_deep", label: "右中間深め", value: "右中深" },
  ],
  右: [
    { id: "rf_front", label: "右前（手前）", sublabel: "ライト前", value: "右前" },
    { id: "rf_line", label: "右線（ライン際）", sublabel: "ライト線", value: "右線" },
    { id: "rf_over", label: "右越（オーバー）", sublabel: "ライト越え", value: "右越" },
    { id: "rf_shallow", label: "右浅（浅め）", sublabel: "ポテン・浅飛球", value: "右浅" },
    { id: "rf_deep", label: "右深（後方）", sublabel: "深い当たり", value: "右深" },
    { id: "rf_std", label: "右（標準）", value: "右" },
  ],
};

interface BattedFlickPayload {
  code: BattedOutcomeCode;
  variant: BattedPlayVariant | null;
  activeChip?: string;
}

const BATTED_FLICK_OPTIONS: Partial<
  Record<BattedOutcomeCode, ReadonlyArray<FlickSubOption<BattedFlickPayload>>>
> = {
  groundout: [
    {
      id: "go_std",
      label: "通常ゴロ",
      value: { code: "groundout", variant: null },
    },
    {
      id: "go_bote",
      label: "ボテボテゴロ",
      shortActiveLabel: "ボテゴロ",
      value: { code: "groundout", variant: "ground_botebote", activeChip: "ボテゴロ" },
    },
    {
      id: "go_high",
      label: "高いバウンド",
      shortActiveLabel: "高バウンド",
      value: { code: "groundout", variant: "ground_high_bound", activeChip: "高バウンド" },
    },
    {
      id: "go_fc2",
      label: "二塁封殺",
      shortActiveLabel: "二封ゴロ",
      value: { code: "groundout", variant: "ground_force_2b", activeChip: "二封ゴロ" },
    },
    {
      id: "go_fch",
      label: "本塁封殺",
      shortActiveLabel: "本封ゴロ",
      value: { code: "groundout", variant: "ground_force_home", activeChip: "本封ゴロ" },
    },
    {
      id: "go_tag",
      label: "タッチアウト",
      shortActiveLabel: "タッチ死",
      value: { code: "groundout", variant: "ground_tag_out", activeChip: "タッチ死" },
    },
  ],
  flyout: [
    {
      id: "fly_std",
      label: "通常フライ",
      value: { code: "flyout", variant: null },
    },
    {
      id: "fly_shallow",
      label: "浅いフライ",
      shortActiveLabel: "浅フライ",
      value: { code: "flyout", variant: "fly_shallow", activeChip: "浅フライ" },
    },
    {
      id: "fly_deep",
      label: "深い大飛球",
      shortActiveLabel: "深フライ",
      value: { code: "flyout", variant: "fly_deep", activeChip: "深フライ" },
    },
    {
      id: "fly_iff",
      label: "インフィールド飛",
      shortActiveLabel: "IFフライ",
      value: { code: "flyout", variant: "infield_fly", activeChip: "IFフライ" },
    },
  ],
  double_play: [
    {
      id: "dp_ground",
      label: "ゴロ併殺",
      value: { code: "double_play", variant: null },
    },
    {
      id: "dp_liner",
      label: "ライナー併殺",
      shortActiveLabel: "直併殺",
      value: { code: "double_play", variant: "dp_liner", activeChip: "直併殺" },
    },
    {
      id: "dp_fly",
      label: "フライ併殺",
      shortActiveLabel: "飛併殺",
      value: { code: "double_play", variant: "dp_fly_tag", activeChip: "飛併殺" },
    },
    {
      id: "dp_k_cs",
      label: "三振＋盗塁死併殺",
      shortActiveLabel: "三振併殺",
      value: { code: "double_play", variant: "dp_strikeout_cs", activeChip: "三振併殺" },
    },
  ],
  front_hit: [
    {
      id: "fh_std",
      label: "前ヒット（手前）",
      sublabel: "左前・中前・右前",
      value: { code: "front_hit", variant: "hit_front" },
    },
    {
      id: "fh_poten",
      label: "ポテンヒット",
      sublabel: "手前に落ちる安打",
      shortActiveLabel: "ポテンH",
      value: { code: "front_hit", variant: "hit_poten", activeChip: "ポテンH" },
    },
    {
      id: "fh_clean",
      label: "クリーンヒット",
      shortActiveLabel: "クリーンH",
      value: { code: "front_hit", variant: "hit_clean", activeChip: "クリーンH" },
    },
    {
      id: "fh_liner",
      label: "ライナーヒット",
      shortActiveLabel: "ライナーH",
      value: { code: "front_hit", variant: "hit_liner", activeChip: "ライナーH" },
    },
  ],
  hit: [
    {
      id: "h_front",
      label: "手前（前ヒット）",
      sublabel: "外野手前へ抜ける安打",
      shortActiveLabel: "前ヒット",
      value: { code: "hit", variant: "hit_front", activeChip: "前ヒット" },
    },
    {
      id: "h_poten",
      label: "ポテン（手前落ち）",
      sublabel: "浅い位置に落ちる安打",
      shortActiveLabel: "ポテンH",
      value: { code: "hit", variant: "hit_poten", activeChip: "ポテンH" },
    },
    {
      id: "h_line",
      label: "ライン際（線ヒット）",
      sublabel: "左線・右線・一線・三線",
      shortActiveLabel: "線ヒット",
      value: { code: "hit", variant: "hit_line", activeChip: "線ヒット" },
    },
    {
      id: "h_gap",
      label: "外野の間",
      sublabel: "左中間・右中間",
      shortActiveLabel: "間ヒット",
      value: { code: "hit", variant: "hit_gap", activeChip: "間ヒット" },
    },
    {
      id: "h_hard",
      label: "強襲ヒット",
      shortActiveLabel: "強襲H",
      value: { code: "hit", variant: "hit_hard", activeChip: "強襲H" },
    },
    {
      id: "h_liner",
      label: "ライナーヒット",
      shortActiveLabel: "ライナーH",
      value: { code: "hit", variant: "hit_liner", activeChip: "ライナーH" },
    },
  ],
  infield_hit: [
    {
      id: "ih_std",
      label: "内野安打（標準）",
      value: { code: "infield_hit", variant: null },
    },
    {
      id: "ih_bote",
      label: "ボテボテ内野安打",
      shortActiveLabel: "ボテ安打",
      value: { code: "infield_hit", variant: "infield_botebote", activeChip: "ボテ安打" },
    },
    {
      id: "ih_bunt",
      label: "バント安打",
      shortActiveLabel: "バント安",
      value: { code: "infield_hit", variant: "bunt_hit", activeChip: "バント安" },
    },
    {
      id: "ih_safety",
      label: "セーフティバント安",
      shortActiveLabel: "セーフティ",
      value: { code: "infield_hit", variant: "safety_bunt_hit", activeChip: "セーフティ" },
    },
    {
      id: "ih_hard",
      label: "強襲内野安打",
      shortActiveLabel: "強襲内安",
      value: { code: "infield_hit", variant: "hit_hard", activeChip: "強襲内安" },
    },
  ],
  double: [
    {
      id: "2b_over",
      label: "越え（オーバー）",
      sublabel: "左越・中越・右越",
      shortActiveLabel: "越二塁打",
      value: { code: "double", variant: "hit_over", activeChip: "越二塁打" },
    },
    {
      id: "2b_line",
      label: "ライン際（線二塁打）",
      sublabel: "左線・右線・三線・一線",
      shortActiveLabel: "線二塁打",
      value: { code: "double", variant: "hit_line", activeChip: "線二塁打" },
    },
    {
      id: "2b_gap",
      label: "間破る二塁打",
      sublabel: "左中間・右中間破る",
      shortActiveLabel: "間二塁打",
      value: { code: "double", variant: "hit_gap", activeChip: "間二塁打" },
    },
    {
      id: "2b_poten",
      label: "手前ポテン二塁打",
      shortActiveLabel: "ポテン二",
      value: { code: "double", variant: "hit_poten", activeChip: "ポテン二" },
    },
    {
      id: "2b_entitle",
      label: "エンタイトル二塁打",
      shortActiveLabel: "エンタイトル",
      value: { code: "double", variant: "entitle_double", activeChip: "エンタイトル" },
    },
  ],
  triple: [
    {
      id: "3b_over",
      label: "越え三塁打",
      value: { code: "triple", variant: null },
    },
    {
      id: "3b_line",
      label: "ライン際三塁打",
      shortActiveLabel: "線三塁打",
      value: { code: "triple", variant: "hit_line", activeChip: "線三塁打" },
    },
    {
      id: "3b_gap",
      label: "間破る三塁打",
      shortActiveLabel: "間三塁打",
      value: { code: "triple", variant: "hit_gap", activeChip: "間三塁打" },
    },
  ],
  homerun: [
    {
      id: "hr_over",
      label: "柵越え本塁打",
      value: { code: "homerun", variant: null },
    },
    {
      id: "hr_line",
      label: "ポール・ライン際",
      shortActiveLabel: "線本塁打",
      value: { code: "homerun", variant: "hit_line", activeChip: "線本塁打" },
    },
    {
      id: "hr_inside",
      label: "ランニング本塁打",
      shortActiveLabel: "走本塁打",
      value: { code: "homerun", variant: "inside_park_hr", activeChip: "走本塁打" },
    },
  ],
  sac_bunt: [
    {
      id: "sb_std",
      label: "送りバント成功",
      value: { code: "sac_bunt", variant: null },
    },
    {
      id: "sb_sq",
      label: "スクイズ成功",
      badge: "+1点",
      shortActiveLabel: "スクイズ",
      value: { code: "sac_bunt", variant: "squeeze_score", activeChip: "スクイズ" },
    },
    {
      id: "sb_ssq",
      label: "セーフティスクイズ",
      badge: "+1点",
      shortActiveLabel: "Sスクイズ",
      value: { code: "sac_bunt", variant: "safety_squeeze", activeChip: "Sスクイズ" },
    },
    {
      id: "sb_fc",
      label: "バント失敗（封殺）",
      shortActiveLabel: "バント封殺",
      value: { code: "sac_bunt", variant: "bunt_fc_out", activeChip: "バント封殺" },
    },
    {
      id: "sb_pop",
      label: "バント小飛球死",
      shortActiveLabel: "バント飛",
      value: { code: "sac_bunt", variant: "bunt_popup_out", activeChip: "バント飛" },
    },
    {
      id: "sb_sq_fail",
      label: "スクイズ失敗",
      shortActiveLabel: "スクイズ死",
      value: { code: "sac_bunt", variant: "squeeze_fail_out", activeChip: "スクイズ死" },
    },
  ],
  error: [
    {
      id: "err_std",
      label: "エラー（標準）",
      value: { code: "error", variant: null },
    },
    {
      id: "err_catch",
      label: "捕球エラー",
      shortActiveLabel: "捕球E",
      value: { code: "error", variant: "error_catch", activeChip: "捕球E" },
    },
    {
      id: "err_throw",
      label: "悪送球エラー",
      shortActiveLabel: "悪送球E",
      value: { code: "error", variant: "error_throw", activeChip: "悪送球E" },
    },
    {
      id: "err_drop",
      label: "落球エラー",
      shortActiveLabel: "落球E",
      value: { code: "error", variant: "error_drop", activeChip: "落球E" },
    },
    {
      id: "err_pass2",
      label: "後逸エラー（2塁へ）",
      shortActiveLabel: "後逸2塁",
      value: { code: "error", variant: "error_pass_2b", activeChip: "後逸2塁" },
    },
  ],
  fc: [
    {
      id: "fc_std",
      label: "野選（標準）",
      value: { code: "fc", variant: null },
    },
    {
      id: "fc_home",
      label: "本塁野選",
      shortActiveLabel: "本塁野選",
      value: { code: "fc", variant: "fc_home_safe", activeChip: "本塁野選" },
    },
    {
      id: "fc_bunt",
      label: "バント野選",
      shortActiveLabel: "バント野選",
      value: { code: "fc", variant: "fc_bunt_safe", activeChip: "バント野選" },
    },
  ],
};

interface DirectFlickPayload {
  code: DirectOutcomeCode;
  variant: DirectPlayVariant | null;
  activeChip?: string;
}

const DIRECT_FLICK_OPTIONS: Partial<
  Record<DirectOutcomeCode, ReadonlyArray<FlickSubOption<DirectFlickPayload>>>
> = {
  strikeout_swing: [
    {
      id: "so_std",
      label: "空振り三振",
      value: { code: "strikeout_swing", variant: null },
    },
    {
      id: "so_tip",
      label: "ファウルチップ三振",
      shortActiveLabel: "チップ三振",
      value: { code: "strikeout_swing", variant: "so_foul_tip", activeChip: "チップ三振" },
    },
  ],
  walk: [
    {
      id: "bb_std",
      label: "四球（標準）",
      value: { code: "walk", variant: null },
    },
    {
      id: "bb_4p",
      label: "ストレート四球",
      shortActiveLabel: "スト四球",
      value: { code: "walk", variant: "walk_four_pitch", activeChip: "スト四球" },
    },
    {
      id: "bb_full",
      label: "粘って四球",
      shortActiveLabel: "粘り四球",
      value: { code: "walk", variant: "walk_full_count", activeChip: "粘り四球" },
    },
    {
      id: "bb_wp2",
      label: "四球＋暴投二進",
      shortActiveLabel: "四球二進",
      value: { code: "walk", variant: "walk_wp_2b", activeChip: "四球二進" },
    },
  ],
  dropped_3rd_safe: [
    {
      id: "dts_std",
      label: "振逃出塁",
      value: { code: "dropped_3rd_safe", variant: null },
    },
    {
      id: "dts_wp",
      label: "暴投振逃出塁",
      shortActiveLabel: "暴投振逃",
      value: { code: "dropped_3rd_safe", variant: "dts_wp_safe", activeChip: "暴投振逃" },
    },
  ],
};

const QUICK_BASERUNNING_OPTIONS: ReadonlyArray<
  FlickSubOption<QuickBaserunningCode>
> = [
  {
    id: "br_double_steal",
    label: "ダブルスチール（重盗）",
    badge: "重盗",
    sublabel: "1・2塁➔2・3塁 / 1・3塁➔+1点",
    value: "double_steal",
  },
  {
    id: "br_steal_2b",
    label: "二盗成功",
    sublabel: "1塁走者 ➔ 2塁へ",
    value: "steal_2b",
  },
  {
    id: "br_steal_3b",
    label: "三盗成功",
    sublabel: "2塁走者 ➔ 3塁へ",
    value: "steal_3b",
  },
  {
    id: "br_home_steal",
    label: "本盗（ホームスチール）",
    badge: "+1点",
    sublabel: "3塁走者 ➔ 本塁生還",
    value: "home_steal",
  },
  {
    id: "br_wp",
    label: "暴投進塁",
    sublabel: "ワイルドピッチ",
    value: "wp_advance",
  },
  {
    id: "br_pb",
    label: "捕逸進塁",
    sublabel: "パスボール",
    value: "pb_advance",
  },
  {
    id: "br_delayed",
    label: "ディレードスチール",
    value: "delayed_steal",
  },
  {
    id: "br_balk",
    label: "ボーク進塁",
    value: "balk_advance",
  },
  {
    id: "br_cs",
    label: "盗塁死",
    badge: "+1死",
    value: "caught_stealing",
  },
  {
    id: "br_pickoff",
    label: "牽制死",
    badge: "+1死",
    value: "pickoff_out",
  },
  {
    id: "br_rundown",
    label: "飛び出し挟殺アウト",
    badge: "+1死",
    value: "rundown_out",
  },
];

const DIRECT_OUTCOMES: ReadonlyArray<{
  code: DirectOutcomeCode;
  label: string;
  tone: "out" | "reach";
}> = [
  { code: "strikeout_swing", label: "空三振", tone: "out" },
  { code: "strikeout_look", label: "見三振", tone: "out" },
  { code: "walk", label: "四球", tone: "reach" },
  { code: "hbp", label: "死球", tone: "reach" },
  { code: "ibb", label: "敬遠", tone: "reach" },
  { code: "dropped_3rd_out", label: "振逃死", tone: "out" },
  { code: "dropped_3rd_safe", label: "振逃生", tone: "reach" },
];

const OUT_BATTED_OUTCOMES: ReadonlyArray<{
  code: BattedOutcomeCode;
  label: string;
}> = [
  { code: "groundout", label: "ゴロ" },
  { code: "hard_groundout", label: "強襲ゴロ" },
  { code: "flyout", label: "フライ" },
  { code: "liner", label: "ライナー" },
  { code: "foul_fly", label: "邪飛" },
  { code: "double_play", label: "併殺" },
];

const HIT_BATTED_OUTCOMES: ReadonlyArray<{
  code: BattedOutcomeCode;
  label: string;
}> = [
  { code: "front_hit", label: "前ヒット" },
  { code: "hit", label: "ヒット" },
  { code: "infield_hit", label: "内野安打" },
  { code: "double", label: "二塁打" },
  { code: "triple", label: "三塁打" },
  { code: "homerun", label: "本塁打" },
];

const OTHER_BATTED_OUTCOMES: ReadonlyArray<{
  code: BattedOutcomeCode;
  label: string;
  group: "sac" | "hit" | "err";
}> = [
  { code: "sac_bunt", label: "送りバント", group: "sac" },
  { code: "sac_fly", label: "犠飛", group: "sac" },
  { code: "rh_homerun", label: "走本塁打", group: "hit" },
  { code: "error", label: "エラー", group: "err" },
  { code: "fc", label: "野選", group: "err" },
];

const REACTION_PRESETS = [
  "❗️",
  "‼️",
  "‼️ナイスバッティング‼️",
  "ナイスキャッチ❗️",
  "好守備❗️",
  "惜しい❗️",
] as const;

export function LiveAtBatPadCard({
  doc,
  onChangeDoc,
  rosterPlayers,
  activeContextKey,
  outputMode = "full",
  onChangeOutputMode,
  onCopyText,
  onShareLine,
  copied = false,
  onOpenFullPreview,
  readOnly = false,
  editorDisplayName,
  viewerHalfOverride = null,
  onChangeViewerHalfOverride,
  onRequestTakeover,
}: LiveAtBatPadCardProps) {
  const [mounted, setMounted] = useState(false);
  const [monitorMode, setMonitorMode] = useState<"inning" | "full">("inning");
  const monitorScrollRef = useRef<HTMLDivElement | null>(null);
  const [quickBrFeedback, setQuickBrFeedback] = useState<string | null>(null);

  // 状況の手動一時変更（タイブレーク無死1・2塁など）
  const [manualStartOuts, setManualStartOuts] = useState<number | null>(null);
  const [manualStartRunners, setManualStartRunners] = useState<
    LiveReportBaseNum[] | null
  >(null);

  // 打席選択状態（通常タップ＋長押しフリック詳細バリエーション）
  const [selectedDirect, setSelectedDirect] =
    useState<DirectOutcomeCode | null>(null);
  const [selectedDirectVariant, setSelectedDirectVariant] =
    useState<DirectPlayVariant | null>(null);
  const [selectedDirectActiveChip, setSelectedDirectActiveChip] = useState<
    string | null
  >(null);
  const [selectedDirection, setSelectedDirection] = useState<string>("");
  const [selectedDirectionAnchor, setSelectedDirectionAnchor] =
    useState<string>("");
  const [selectedBatted, setSelectedBatted] =
    useState<BattedOutcomeCode | null>(null);
  const [selectedBattedVariant, setSelectedBattedVariant] =
    useState<BattedPlayVariant | null>(null);
  const [selectedBattedActiveChip, setSelectedBattedActiveChip] = useState<
    string | null
  >(null);
  const [selectedCandidateIdx, setSelectedCandidateIdx] = useState<number>(0);
  const [reactionText, setReactionText] = useState<string>("");

  // 詳細手動微調整モーダル
  const [showCustomOverride, setShowCustomOverride] = useState(false);
  const [customPlayText, setCustomPlayText] = useState("");
  const [customOutsAfter, setCustomOutsAfter] = useState<number | null>(null);
  const [customRunnersAfter, setCustomRunnersAfter] = useState<
    LiveReportBaseNum[] | null
  >(null);
  const [customRunsScored, setCustomRunsScored] = useState<number | null>(null);

  // 選手交代・イベントモーダル
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [subType, setSubType] = useState<LiveReportSubType | "NOTE">("P");
  const [subSlotOrder, setSubSlotOrder] = useState<number>(1);
  const [subPlayerId, setSubPlayerId] = useState<string>("");
  const [subNewName, setSubNewName] = useState<string>("");
  const [subNewPos, setSubNewPos] = useState<string>("1");
  const [subCustomNote, setSubCustomNote] = useState<string>("");

  // 直前走塁追記モーダル
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const [followUpMode, setFollowUpMode] = useState<"inline" | "chained">(
    "chained"
  );
  const [followUpText, setFollowUpText] = useState<string>("");
  const [followUpOuts, setFollowUpOuts] = useState<number>(0);
  const [followUpRunners, setFollowUpRunners] = useState<LiveReportBaseNum[]>(
    []
  );
  const [followUpAddRuns, setFollowUpAddRuns] = useState<number>(0);

  // ゲームセット設定モーダル
  const [isGameSetPanelOpen, setIsGameSetPanelOpen] = useState(false);

  // 現在打者のクイック設定モーダル（ボトム固定ドックの高さを崩さず、iOSズームも防ぐ）
  const [isBatterQuickModalOpen, setIsBatterQuickModalOpen] = useState(false);
  const [quickBatterPlayerId, setQuickBatterPlayerId] = useState<string>("");
  const [quickBatterName, setQuickBatterName] = useState<string>("");
  const [quickBatterPos, setQuickBatterPos] = useState<string>("打");

  useEffect(() => {
    setMounted(true);
  }, []);

  const resetPadSelection = () => {
    setSelectedDirect(null);
    setSelectedDirectVariant(null);
    setSelectedDirectActiveChip(null);
    setSelectedDirection("");
    setSelectedDirectionAnchor("");
    setSelectedBatted(null);
    setSelectedBattedVariant(null);
    setSelectedBattedActiveChip(null);
    setSelectedCandidateIdx(0);
    setReactionText("");
    setCustomPlayText("");
    setCustomOutsAfter(null);
    setCustomRunnersAfter(null);
    setCustomRunsScored(null);
  };

  // SKILL.md 規約5: 対象試合やイニング切替時にオーバーレイと一時状態を安全にリセット
  useEffect(() => {
    setIsSubModalOpen(false);
    setIsFollowUpModalOpen(false);
    setShowCustomOverride(false);
    setIsGameSetPanelOpen(false);
    setIsBatterQuickModalOpen(false);
    setManualStartOuts(null);
    setManualStartRunners(null);
    setQuickBrFeedback(null);
    resetPadSelection();
  }, [activeContextKey, doc.activeInning, doc.activeIsBottom, readOnly]);

  const viewedInning =
    readOnly && viewerHalfOverride ? viewerHalfOverride.inning : doc.activeInning;
  const viewedIsBottom =
    readOnly && viewerHalfOverride
      ? viewerHalfOverride.isBottom
      : doc.activeIsBottom;

  const currentHalf = useMemo(
    () =>
      doc.halfInnings.find(
        (h) => h.inning === viewedInning && h.isBottom === viewedIsBottom
      ),
    [doc.halfInnings, viewedInning, viewedIsBottom]
  );

  const autoSituation = useMemo(
    () => computeHalfInningSituation(currentHalf),
    [currentHalf]
  );

  const effectiveOutsBefore =
    manualStartOuts !== null ? manualStartOuts : autoSituation.outs;
  const effectiveRunnersBefore =
    manualStartRunners !== null ? manualStartRunners : autoSituation.runners;

  const isMyAttack = isMyTeamBattingHalf(doc.battingOrder, viewedIsBottom);
  const activeLineup = useMemo(
    () =>
      resolveActiveLineupAtInning(doc.lineup, viewedInning, viewedIsBottom),
    [doc.lineup, viewedInning, viewedIsBottom]
  );

  const currentOrder = isMyAttack ? doc.nextMyOrder : doc.nextOpponentOrder;
  const activeBatterSlot = isMyAttack
    ? activeLineup.find((s) => s.order === currentOrder) || activeLineup[0]
    : null;

  const activeDefenderSurname = useMemo(() => {
    if (isMyAttack || !selectedDirection) return "";
    return findActiveDefenderByDirection(
      doc.lineup,
      doc.activeInning,
      doc.activeIsBottom,
      selectedDirection,
      doc.showSurnameOnly
    );
  }, [
    isMyAttack,
    selectedDirection,
    doc.lineup,
    doc.activeInning,
    doc.activeIsBottom,
    doc.showSurnameOnly,
  ]);

  const candidates: SimulatedPlayCandidate[] = useMemo(() => {
    const startOuts = effectiveOutsBefore >= 3 ? 0 : effectiveOutsBefore;
    if (selectedDirect) {
      return [
        simulateDirectOutcome(
          selectedDirect,
          startOuts,
          effectiveRunnersBefore,
          selectedDirectVariant
        ),
      ];
    }
    if (selectedBatted) {
      return buildBattedPlayCandidates(
        selectedDirection,
        selectedBatted,
        startOuts,
        effectiveRunnersBefore,
        selectedBattedVariant
      );
    }
    return [];
  }, [
    selectedDirect,
    selectedDirectVariant,
    selectedDirection,
    selectedBatted,
    selectedBattedVariant,
    effectiveOutsBefore,
    effectiveRunnersBefore,
  ]);

  const activeCandidate =
    candidates[
      Math.min(selectedCandidateIdx, Math.max(0, candidates.length - 1))
    ] || null;

  const hasCustomOverride =
    customPlayText.trim().length > 0 ||
    customOutsAfter !== null ||
    customRunnersAfter !== null ||
    customRunsScored !== null;

  const finalPlayText =
    customPlayText.trim() || activeCandidate?.playText || "";
  const finalOutsAfter =
    customOutsAfter !== null
      ? customOutsAfter
      : activeCandidate?.outsAfter ?? Math.min(3, effectiveOutsBefore);
  const finalRunnersAfter =
    finalOutsAfter >= 3
      ? []
      : customRunnersAfter !== null
      ? customRunnersAfter
      : activeCandidate?.runnersAfter ?? effectiveRunnersBefore;
  const finalRunsScored =
    customRunsScored !== null
      ? customRunsScored
      : activeCandidate?.runsScored ?? 0;

  const previewEntry: LiveReportPlayEntry | null =
    !readOnly && finalPlayText
      ? {
          id: "preview",
          entryType: "batter",
          battingOrder: currentOrder,
          batterName: isMyAttack ? activeBatterSlot?.playerName || "" : "",
          playText: finalPlayText,
          reactionText,
          outsAfter: finalOutsAfter,
          runnersAfter: finalRunnersAfter,
          runsScored: finalRunsScored,
          chainedPlays: [],
          eventText: "",
        }
      : null;

  const previewLine = previewEntry
    ? formatSinglePlayEntryLine(previewEntry, isMyAttack, doc.showSurnameOnly)
    : "";

  const scoreboardSummary = useMemo(() => computeScoreboardSummary(doc), [doc]);

  const handleStepHalfInning = (delta: -1 | 1) => {
    if (readOnly) {
      if (!onChangeViewerHalfOverride) return;
      if (delta === 1) {
        const next = !viewedIsBottom
          ? { inning: viewedInning, isBottom: true }
          : { inning: viewedInning + 1, isBottom: false };
        if (
          next.inning === doc.activeInning &&
          next.isBottom === doc.activeIsBottom
        ) {
          onChangeViewerHalfOverride(null);
        } else {
          onChangeViewerHalfOverride(next);
        }
        return;
      }
      if (viewedIsBottom) {
        const prev = { inning: viewedInning, isBottom: false };
        onChangeViewerHalfOverride(
          prev.inning === doc.activeInning &&
            prev.isBottom === doc.activeIsBottom
            ? null
            : prev
        );
      } else if (viewedInning > 1) {
        const prev = { inning: viewedInning - 1, isBottom: true };
        onChangeViewerHalfOverride(
          prev.inning === doc.activeInning &&
            prev.isBottom === doc.activeIsBottom
            ? null
            : prev
        );
      }
      return;
    }

    onChangeDoc((prev) => {
      if (delta === 1) {
        if (!prev.activeIsBottom) {
          return { ...prev, activeIsBottom: true };
        }
        return {
          ...prev,
          activeInning: prev.activeInning + 1,
          activeIsBottom: false,
        };
      }
      if (prev.activeIsBottom) {
        return { ...prev, activeIsBottom: false };
      }
      if (prev.activeInning > 1) {
        return {
          ...prev,
          activeInning: prev.activeInning - 1,
          activeIsBottom: true,
        };
      }
      return prev;
    });
  };

  const handleShiftOrder = (delta: -1 | 1) => {
    if (readOnly) return;
    onChangeDoc((prev) => {
      if (isMyAttack) {
        const limit = Math.max(9, prev.lineup.length);
        const next = ((prev.nextMyOrder - 1 + delta + limit) % limit) + 1;
        return { ...prev, nextMyOrder: next };
      }
      const next = ((prev.nextOpponentOrder - 1 + delta + 9) % 9) + 1;
      return { ...prev, nextOpponentOrder: next };
    });
  };

  const handleRecordAtBat = () => {
    if (readOnly || !finalPlayText) return;
    const newEntry: LiveReportPlayEntry = {
      id: `ab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      entryType: "batter",
      battingOrder: currentOrder,
      batterName: isMyAttack ? activeBatterSlot?.playerName || "" : "",
      playText: finalPlayText,
      reactionText: reactionText.trim(),
      outsAfter: finalOutsAfter,
      runnersAfter: finalRunnersAfter,
      runsScored: finalRunsScored,
      chainedPlays: [],
      eventText: "",
    };

    onChangeDoc((prev) => {
      const halves = [...prev.halfInnings];
      const idx = halves.findIndex(
        (h) =>
          h.inning === prev.activeInning && h.isBottom === prev.activeIsBottom
      );
      if (idx >= 0) {
        halves[idx] = {
          ...halves[idx],
          entries: [...halves[idx].entries, newEntry],
        };
      } else {
        const created: LiveReportHalfInning = {
          inning: prev.activeInning,
          isBottom: prev.activeIsBottom,
          entries: [newEntry],
          manualRunsOverride: null,
        };
        halves.push(created);
      }

      const limitMy = Math.max(9, prev.lineup.length);
      return {
        ...prev,
        halfInnings: halves,
        nextMyOrder: isMyAttack
          ? (prev.nextMyOrder % limitMy) + 1
          : prev.nextMyOrder,
        nextOpponentOrder: !isMyAttack
          ? (prev.nextOpponentOrder % 9) + 1
          : prev.nextOpponentOrder,
      };
    });

    setShowCustomOverride(false);
    setManualStartOuts(null);
    setManualStartRunners(null);
    resetPadSelection();
  };

  const handleUndoLastEntry = () => {
    if (readOnly || !currentHalf || currentHalf.entries.length === 0) return;
    const lastEntry = currentHalf.entries[currentHalf.entries.length - 1];

    onChangeDoc((prev) => {
      const halves = prev.halfInnings.map((h) => {
        if (
          h.inning === prev.activeInning &&
          h.isBottom === prev.activeIsBottom
        ) {
          return {
            ...h,
            entries: h.entries.slice(0, -1),
          };
        }
        return h;
      });

      if (lastEntry.entryType === "batter") {
        return {
          ...prev,
          halfInnings: halves,
          nextMyOrder: isMyAttack ? lastEntry.battingOrder : prev.nextMyOrder,
          nextOpponentOrder: !isMyAttack
            ? lastEntry.battingOrder
            : prev.nextOpponentOrder,
        };
      }
      return { ...prev, halfInnings: halves };
    });
  };

  // 現在打者のクイック設定モーダルを開く
  const openBatterQuickModal = () => {
    if (readOnly || !isMyAttack) return;
    setQuickBatterPlayerId(activeBatterSlot?.playerId || "");
    setQuickBatterName(activeBatterSlot?.playerName || "");
    setQuickBatterPos(
      normalizeReportPositionCode(activeBatterSlot?.position || "打")
    );
    setIsBatterQuickModalOpen(true);
  };

  const handleSaveQuickBatter = () => {
    if (readOnly) return;
    const trimmedName = quickBatterName.trim();
    const normPos = normalizeReportPositionCode(quickBatterPos || "打");

    onChangeDoc((prev) => ({
      ...prev,
      lineup: prev.lineup.map((s) => {
        if (s.order !== currentOrder) return s;
        if (s.substitutions.length > 0) {
          const nextSubs = [...s.substitutions];
          const lastIdx = nextSubs.length - 1;
          nextSubs[lastIdx] = {
            ...nextSubs[lastIdx],
            newName: trimmedName,
            newPosition: normPos,
            playerId: quickBatterPlayerId || null,
          };
          return { ...s, substitutions: nextSubs };
        }
        return {
          ...s,
          playerName: trimmedName,
          position: normPos,
          playerId: quickBatterPlayerId || null,
        };
      }),
    }));
    setIsBatterQuickModalOpen(false);
  };

  // 直前打席への走塁追記モーダルを開く
  const lastBatterEntry = useMemo(() => {
    if (!currentHalf) return null;
    for (let i = currentHalf.entries.length - 1; i >= 0; i--) {
      if (currentHalf.entries[i].entryType === "batter") {
        return currentHalf.entries[i];
      }
    }
    return null;
  }, [currentHalf]);

  const handleQuickBaserunningFlick = (code: QuickBaserunningCode) => {
    if (readOnly) return;
    const startOuts = effectiveOutsBefore >= 3 ? 0 : effectiveOutsBefore;
    const sim = simulateQuickBaserunningPlay(
      code,
      startOuts,
      effectiveRunnersBefore
    );

    if (lastBatterEntry) {
      onChangeDoc((prev) => {
        const halves = prev.halfInnings.map((h) => {
          if (
            h.inning !== prev.activeInning ||
            h.isBottom !== prev.activeIsBottom
          ) {
            return h;
          }
          const entries = h.entries.map((e) => {
            if (e.id !== lastBatterEntry.id) return e;
            return {
              ...e,
              runsScored: e.runsScored + sim.runsScored,
              chainedPlays: [
                ...e.chainedPlays,
                {
                  id: `cp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                  playText: sim.playText,
                  outsAfter: sim.outsAfter,
                  runnersAfter: sim.outsAfter >= 3 ? [] : sim.runnersAfter,
                  runsScored: sim.runsScored,
                },
              ],
            };
          });
          return { ...h, entries };
        });
        return { ...prev, halfInnings: halves };
      });
      setManualStartOuts(null);
      setManualStartRunners(null);
    } else {
      // タイブレーク開始直後などイニング初球前に走塁が起きた場合
      const situStr = formatRunnersLabel(sim.runnersAfter, sim.outsAfter);
      const noteText = situStr
        ? `${sim.playText}　${situStr}`
        : sim.playText;
      const noteEntry: LiveReportPlayEntry = {
        id: `br-${Date.now()}`,
        entryType: "note",
        battingOrder: 0,
        batterName: "",
        playText: "",
        reactionText: "",
        outsAfter: sim.outsAfter,
        runnersAfter: sim.runnersAfter,
        runsScored: sim.runsScored,
        chainedPlays: [],
        eventText: noteText,
      };
      onChangeDoc((prev) => {
        const halves = [...prev.halfInnings];
        const idx = halves.findIndex(
          (h) =>
            h.inning === prev.activeInning && h.isBottom === prev.activeIsBottom
        );
        if (idx >= 0) {
          halves[idx] = {
            ...halves[idx],
            entries: [...halves[idx].entries, noteEntry],
          };
        } else {
          halves.push({
            inning: prev.activeInning,
            isBottom: prev.activeIsBottom,
            entries: [noteEntry],
            manualRunsOverride: null,
          });
        }
        return { ...prev, halfInnings: halves };
      });
      setManualStartOuts(sim.outsAfter);
      setManualStartRunners(sim.outsAfter >= 3 ? [] : sim.runnersAfter);
    }

    setQuickBrFeedback(`🏃‍♂️「${sim.playText}」を記録しました`);
    setTimeout(() => {
      setQuickBrFeedback((cur) =>
        cur === `🏃‍♂️「${sim.playText}」を記録しました` ? null : cur
      );
    }, 2200);
  };

  const openFollowUpModal = () => {
    if (readOnly || !lastBatterEntry) return;
    const lastChain =
      lastBatterEntry.chainedPlays[lastBatterEntry.chainedPlays.length - 1];
    const curOuts = lastChain ? lastChain.outsAfter : lastBatterEntry.outsAfter;
    const curRunners = lastChain
      ? lastChain.runnersAfter
      : lastBatterEntry.runnersAfter;
    setFollowUpMode("chained");
    setFollowUpText("");
    setFollowUpOuts(curOuts);
    setFollowUpRunners(curRunners);
    setFollowUpAddRuns(0);
    setIsFollowUpModalOpen(true);
  };

  const applyFollowUpPreset = (preset: {
    mode: "inline" | "chained";
    text: string;
    outDelta: number;
    advanceAll: boolean;
    clearOutBase?: LiveReportBaseNum;
  }) => {
    if (!lastBatterEntry) return;
    const lastChain =
      lastBatterEntry.chainedPlays[lastBatterEntry.chainedPlays.length - 1];
    const baseOuts = lastChain
      ? lastChain.outsAfter
      : lastBatterEntry.outsAfter;
    const baseRunners = lastChain
      ? lastChain.runnersAfter
      : lastBatterEntry.runnersAfter;

    setFollowUpMode(preset.mode);
    setFollowUpText(preset.text);

    const nextOuts = Math.min(3, baseOuts + preset.outDelta);
    setFollowUpOuts(nextOuts);

    if (nextOuts >= 3) {
      setFollowUpRunners([]);
      setFollowUpAddRuns(0);
      return;
    }

    if (preset.advanceAll) {
      const nextR: LiveReportBaseNum[] = [];
      let scored = 0;
      for (const r of baseRunners) {
        if (r === 3) scored += 1;
        else nextR.push((r + 1) as LiveReportBaseNum);
      }
      setFollowUpRunners(normalizeRunnersList(nextR));
      setFollowUpAddRuns(scored);
    } else if (preset.clearOutBase) {
      setFollowUpRunners(baseRunners.filter((r) => r !== preset.clearOutBase));
      setFollowUpAddRuns(0);
    } else {
      setFollowUpRunners(baseRunners);
      setFollowUpAddRuns(0);
    }
  };

  const handleCommitFollowUp = () => {
    if (readOnly || !lastBatterEntry || !followUpText.trim()) return;
    const cleanText = followUpText.trim();

    onChangeDoc((prev) => {
      const halves = prev.halfInnings.map((h) => {
        if (
          h.inning !== prev.activeInning ||
          h.isBottom !== prev.activeIsBottom
        ) {
          return h;
        }
        const entries = h.entries.map((e) => {
          if (e.id !== lastBatterEntry.id) return e;
          if (followUpMode === "inline") {
            return {
              ...e,
              playText: `${e.playText}${cleanText}`,
              outsAfter: followUpOuts,
              runnersAfter: followUpOuts >= 3 ? [] : followUpRunners,
              runsScored: e.runsScored + followUpAddRuns,
            };
          }
          return {
            ...e,
            runsScored: e.runsScored + followUpAddRuns,
            chainedPlays: [
              ...e.chainedPlays,
              {
                id: `cp-${Date.now()}`,
                playText: cleanText,
                outsAfter: followUpOuts,
                runnersAfter: followUpOuts >= 3 ? [] : followUpRunners,
                runsScored: followUpAddRuns,
              },
            ],
          };
        });
        return { ...h, entries };
      });
      return { ...prev, halfInnings: halves };
    });

    setIsFollowUpModalOpen(false);
  };

  // 選手交代モーダルを開く
  const openSubstitutionModal = () => {
    if (readOnly) return;
    if (isMyAttack) {
      setSubType("PH");
      setSubSlotOrder(currentOrder);
      const slot = activeLineup.find((s) => s.order === currentOrder);
      setSubNewPos(slot?.position || "打");
    } else {
      setSubType("P");
      const pitcherSlot =
        activeLineup.find(
          (s) => normalizeReportPositionCode(s.position) === "1"
        ) || activeLineup[0];
      setSubSlotOrder(pitcherSlot?.order || 1);
      setSubNewPos("1");
    }
    setSubPlayerId("");
    setSubNewName("");
    setSubCustomNote("");
    setIsSubModalOpen(true);
  };

  const handleCommitSubstitution = () => {
    if (readOnly) return;
    if (subType === "NOTE") {
      if (!subCustomNote.trim()) return;
      const noteEntry: LiveReportPlayEntry = {
        id: `note-${Date.now()}`,
        entryType: "note",
        battingOrder: 0,
        batterName: "",
        playText: "",
        reactionText: "",
        outsAfter: 0,
        runnersAfter: [],
        runsScored: 0,
        chainedPlays: [],
        eventText: subCustomNote.trim(),
      };
      onChangeDoc((prev) => {
        const halves = [...prev.halfInnings];
        const idx = halves.findIndex(
          (h) =>
            h.inning === prev.activeInning && h.isBottom === prev.activeIsBottom
        );
        if (idx >= 0) {
          halves[idx] = {
            ...halves[idx],
            entries: [...halves[idx].entries, noteEntry],
          };
        } else {
          halves.push({
            inning: prev.activeInning,
            isBottom: prev.activeIsBottom,
            entries: [noteEntry],
            manualRunsOverride: null,
          });
        }
        return { ...prev, halfInnings: halves };
      });
      setIsSubModalOpen(false);
      return;
    }

    if (!subNewName.trim()) return;
    const targetActiveSlot = activeLineup.find((s) => s.order === subSlotOrder);
    const oldDisplay = formatPlayerReportName(
      targetActiveSlot?.playerName || "",
      doc.showSurnameOnly
    );
    const newDisplay = formatPlayerReportName(subNewName, doc.showSurnameOnly);

    const typeLabel =
      subType === "P"
        ? "投手交代"
        : subType === "PH"
        ? "代打"
        : subType === "PR"
        ? "代走"
        : "守備交代";
    const eventText = oldDisplay
      ? `${typeLabel} ${oldDisplay}→${newDisplay}`
      : `${typeLabel} ${newDisplay}`;

    const subEntry: LiveReportPlayEntry = {
      id: `sub-${Date.now()}`,
      entryType: "substitution",
      battingOrder: 0,
      batterName: "",
      playText: "",
      reactionText: "",
      outsAfter: 0,
      runnersAfter: [],
      runsScored: 0,
      chainedPlays: [],
      eventText,
    };

    onChangeDoc((prev) => {
      const nextLineup = prev.lineup.map((slot) => {
        if (slot.order !== subSlotOrder) return slot;
        return {
          ...slot,
          substitutions: [
            ...slot.substitutions,
            {
              id: `lsub-${Date.now()}`,
              inning: prev.activeInning,
              isBottom: prev.activeIsBottom,
              subType,
              oldName: targetActiveSlot?.playerName || slot.playerName,
              newName: subNewName.trim(),
              newPosition: normalizeReportPositionCode(
                subType === "P" ? "1" : subNewPos || slot.position
              ),
              playerId: subPlayerId || null,
            },
          ],
        };
      });

      const halves = [...prev.halfInnings];
      const idx = halves.findIndex(
        (h) =>
          h.inning === prev.activeInning && h.isBottom === prev.activeIsBottom
      );
      if (idx >= 0) {
        halves[idx] = {
          ...halves[idx],
          entries: [...halves[idx].entries, subEntry],
        };
      } else {
        halves.push({
          inning: prev.activeInning,
          isBottom: prev.activeIsBottom,
          entries: [subEntry],
          manualRunsOverride: null,
        });
      }

      return {
        ...prev,
        lineup: nextLineup,
        halfInnings: halves,
      };
    });

    setIsSubModalOpen(false);
  };

  const nextHalfLabel = doc.activeIsBottom
    ? `${doc.activeInning + 1}回表`
    : `${doc.activeInning}回裏`;

  const currentInningLines = useMemo(() => {
    if (!currentHalf || currentHalf.entries.length === 0) return [];
    return currentHalf.entries
      .map((e) => ({
        id: e.id,
        text: formatSinglePlayEntryLine(e, isMyAttack, doc.showSurnameOnly),
      }))
      .filter((item) => item.text.length > 0);
  }, [currentHalf, isMyAttack, doc.showSurnameOnly]);

  const fullFormattedText = useMemo(
    () => formatLiveReportText(doc, outputMode),
    [doc, outputMode]
  );

  const liveFirstTotal =
    scoreboardSummary.firstTotal +
    (!readOnly && !doc.activeIsBottom ? finalRunsScored : 0);
  const liveSecondTotal =
    scoreboardSummary.secondTotal +
    (!readOnly && doc.activeIsBottom ? finalRunsScored : 0);

  useEffect(() => {
    if (monitorMode === "inning" && monitorScrollRef.current) {
      monitorScrollRef.current.scrollTop =
        monitorScrollRef.current.scrollHeight;
    }
  }, [
    monitorMode,
    currentInningLines.length,
    previewLine,
    viewedInning,
    viewedIsBottom,
  ]);

  const selectDirection = (anchorDir: string, exactDir?: string) => {
    const targetDir = exactDir ?? anchorDir;
    if (!exactDir && selectedDirection === targetDir) {
      setSelectedDirection("");
      setSelectedDirectionAnchor("");
    } else {
      setSelectedDirection(targetDir);
      setSelectedDirectionAnchor(anchorDir);
    }
    setSelectedDirect(null);
    setSelectedDirectVariant(null);
    setSelectedDirectActiveChip(null);
    setSelectedCandidateIdx(0);
  };

  const selectBattedOutcome = (
    code: BattedOutcomeCode,
    variant: BattedPlayVariant | null = null,
    activeChip: string | null = null,
    forceSelect = false
  ) => {
    if (
      !forceSelect &&
      selectedBatted === code &&
      selectedBattedVariant === null &&
      variant === null
    ) {
      setSelectedBatted(null);
      setSelectedBattedVariant(null);
      setSelectedBattedActiveChip(null);
    } else {
      setSelectedBatted(code);
      setSelectedBattedVariant(variant);
      setSelectedBattedActiveChip(activeChip);
    }
    setSelectedDirect(null);
    setSelectedDirectVariant(null);
    setSelectedDirectActiveChip(null);
    setSelectedCandidateIdx(0);
    setCustomPlayText("");
    setCustomOutsAfter(null);
    setCustomRunnersAfter(null);
    setCustomRunsScored(null);
  };

  const selectDirectOutcome = (
    code: DirectOutcomeCode,
    variant: DirectPlayVariant | null = null,
    activeChip: string | null = null,
    forceSelect = false
  ) => {
    if (
      !forceSelect &&
      selectedDirect === code &&
      selectedDirectVariant === null &&
      variant === null
    ) {
      setSelectedDirect(null);
      setSelectedDirectVariant(null);
      setSelectedDirectActiveChip(null);
    } else {
      setSelectedDirect(code);
      setSelectedDirectVariant(variant);
      setSelectedDirectActiveChip(activeChip);
    }
    setSelectedBatted(null);
    setSelectedBattedVariant(null);
    setSelectedBattedActiveChip(null);
    setSelectedCandidateIdx(0);
    setCustomPlayText("");
    setCustomOutsAfter(null);
    setCustomRunnersAfter(null);
    setCustomRunsScored(null);
  };

  const padContextKey = `${activeContextKey}-${doc.activeInning}-${
    doc.activeIsBottom ? "b" : "t"
  }`;

  // ════════════════════════════════════════════════════════════════
  // 👀 閲覧モード（担当以外のメンバー向けライブ速報ビューア — 入力パッド完全非表示・書き込み0）
  // ════════════════════════════════════════════════════════════════
  if (readOnly) {
    const isFollowingLive = viewerHalfOverride === null;
    const reporterLabel =
      editorDisplayName?.trim() || doc.reporterNames.trim() || "速報担当";

    return (
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 flex flex-col bg-slate-900 text-slate-100 overflow-hidden">
          {/* 閲覧モニター上部バー */}
          <div className="shrink-0 px-2.5 py-1.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1 min-w-0">
              <button
                type="button"
                onClick={() => handleStepHalfInning(-1)}
                disabled={viewedInning === 1 && !viewedIsBottom}
                className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-35 text-slate-200 flex items-center justify-center shrink-0 cursor-pointer"
                title="前のイニングを見る"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setMonitorMode("inning")}
                className={cn(
                  "px-2 py-0.5 rounded-md text-[11px] font-black transition-all cursor-pointer shrink-0",
                  monitorMode === "inning"
                    ? "bg-primary text-white"
                    : "bg-slate-800 text-slate-300 hover:text-white"
                )}
              >
                {viewedInning}回{viewedIsBottom ? "裏" : "表"}
              </button>
              <button
                type="button"
                onClick={() => handleStepHalfInning(1)}
                className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center shrink-0 cursor-pointer"
                title="次のイニングを見る"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setMonitorMode("full")}
                className={cn(
                  "px-2 py-0.5 rounded-md text-[11px] font-black transition-all cursor-pointer shrink-0",
                  monitorMode === "full"
                    ? "bg-primary text-white"
                    : "bg-slate-800 text-slate-300 hover:text-white"
                )}
              >
                全文表示
              </button>

              {!isFollowingLive && onChangeViewerHalfOverride && (
                <button
                  type="button"
                  onClick={() => {
                    onChangeViewerHalfOverride(null);
                    setMonitorMode("inning");
                  }}
                  className="px-2 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black shrink-0 cursor-pointer"
                >
                  最新({doc.activeInning}回{doc.activeIsBottom ? "裏" : "表"})へ
                </button>
              )}

              {monitorMode === "full" && onChangeOutputMode && (
                <div className="flex items-center gap-0.5 ml-0.5 bg-slate-900 rounded-md p-0.5 border border-slate-800 shrink-0">
                  {(
                    [
                      { id: "full", label: "全文" },
                      { id: "latest_inning", label: "直近" },
                      { id: "lineup", label: "スタメン" },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onChangeOutputMode(m.id)}
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[9.5px] font-black cursor-pointer",
                        outputMode === m.id
                          ? "bg-amber-400 text-slate-950"
                          : "text-slate-400 hover:text-white"
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {onOpenFullPreview && (
                <button
                  type="button"
                  onClick={onOpenFullPreview}
                  title="出力形式を選択して確認"
                  className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
                >
                  <FileText className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* ライブ状況サマリー帯（アウト・走者・現在打席） */}
          <div className="shrink-0 px-3 py-1.5 bg-slate-900/95 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 font-black text-slate-100 shrink-0">
                <span>
                  {autoSituation.outs >= 3
                    ? "3死チェンジ"
                    : `${autoSituation.outs}死`}
                </span>
                <span className="text-amber-300">
                  {autoSituation.outs >= 3
                    ? ""
                    : autoSituation.runners.length > 0
                    ? `${autoSituation.runners.join("・")}塁`
                    : "走者なし"}
                </span>
              </span>

              {isFollowingLive && autoSituation.outs < 3 && (
                <span className="font-bold text-slate-300 truncate">
                  {isMyAttack ? (
                    <>
                      打席: {currentOrder}番{" "}
                      {activeBatterSlot?.playerName
                        ? formatPlayerReportName(
                            activeBatterSlot.playerName,
                            doc.showSurnameOnly
                          )
                        : ""}
                    </>
                  ) : (
                    <>相手攻撃: {currentOrder}番</>
                  )}
                </span>
              )}
            </div>

            <span className="text-[10.5px] font-bold text-sky-300 shrink-0">
              入力担当: {reporterLabel}
            </span>
          </div>

          {/* 速報本文（画面いっぱいにゆったり表示） */}
          <div
            ref={monitorScrollRef}
            className="flex-1 min-h-0 overflow-y-auto px-3.5 py-2.5"
          >
            {monitorMode === "inning" ? (
              <div className="space-y-1 font-sans text-xs leading-relaxed">
                <div className="flex items-center justify-between gap-2 text-[11px] font-black text-slate-400 pb-1 border-b border-slate-800/80">
                  <span>
                    {viewedInning}回{viewedIsBottom ? "裏" : "表"}（
                    {isMyAttack ? "自チーム攻撃" : "相手攻撃"}）｜ この回{" "}
                    {autoSituation.runs}点
                  </span>
                  {doc.isGameFinished && (
                    <span className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-black">
                      試合終了
                    </span>
                  )}
                </div>

                {currentInningLines.length === 0 ? (
                  <div className="py-6 text-center space-y-2">
                    <p className="text-xs font-black text-slate-300">
                      このイニングの速報はまだ入力されていません
                    </p>
                    <p className="text-[11px] font-bold text-slate-400">
                      担当者が入力すると自動で画面に反映されます（上のスコアボードの回をタップして過去の回も確認できます）
                    </p>
                    <button
                      type="button"
                      onClick={() => setMonitorMode("full")}
                      className="mt-1 inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 text-[11px] font-black cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>ここまでの全文速報を見る</span>
                    </button>
                  </div>
                ) : (
                  currentInningLines.map((line) => (
                    <p
                      key={line.id}
                      className="py-0.5 text-[12.5px] font-bold text-slate-100 break-all"
                    >
                      {line.text}
                    </p>
                  ))
                )}
              </div>
            ) : (
              <div className="font-sans text-xs leading-relaxed text-slate-100 whitespace-pre-wrap">
                {fullFormattedText}
              </div>
            )}
          </div>
        </div>

        {/* 閲覧モード専用ボトムバー（入力キーパッドなし・コピー＆LINE共有＋必要時のみ担当引継） */}
        <div className="shrink-0 bg-card border-t-2 border-[#0f172a] px-3 pt-2 pb-[max(env(safe-area-inset-bottom),10px)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-500/12 text-sky-700 dark:text-sky-300 border border-sky-500/30 text-[10.5px] font-black shrink-0">
              <Eye className="w-3.5 h-3.5" />
              <span>閲覧モード（参照専用）</span>
            </span>
            {onRequestTakeover && (
              <button
                type="button"
                onClick={onRequestTakeover}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border bg-muted hover:bg-accent text-[10.5px] font-black text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                title="担当者交代時などに自分が入力担当を引き継ぎます"
              >
                <ArrowRightLeft className="w-3 h-3" />
                <span>担当引継</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onCopyText && (
              <button
                type="button"
                onClick={onCopyText}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-xs font-black cursor-pointer active:scale-95"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span>コピー済</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-primary" />
                    <span>全文コピー</span>
                  </>
                )}
              </button>
            )}
            {onShareLine && (
              <button
                type="button"
                onClick={onShareLine}
                className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white text-xs font-black cursor-pointer active:scale-95"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>LINE共有</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* ════════════════════════════════════════════════════════════════
            CENTER ZONE: 可変伸縮する速報ライブモニター（余白をフル活用・外枠スクロール0）
           ════════════════════════════════════════════════════════════════ */}
        <div className="flex-1 min-h-0 flex flex-col bg-slate-900 text-slate-100 overflow-hidden">
          {/* モニター上部固定バー: 表示切替 ＆ ワンタップコピー・LINE送信 */}
          <div className="shrink-0 px-2.5 py-1 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1 min-w-0">
              <button
                type="button"
                onClick={() => setMonitorMode("inning")}
                className={cn(
                  "px-2 py-0.5 rounded-md text-[10.5px] font-black transition-all cursor-pointer shrink-0",
                  monitorMode === "inning"
                    ? "bg-primary text-white"
                    : "bg-slate-800 text-slate-300 hover:text-white"
                )}
              >
                {doc.activeInning}回{doc.activeIsBottom ? "裏" : "表"}
              </button>
              <button
                type="button"
                onClick={() => setMonitorMode("full")}
                className={cn(
                  "px-2 py-0.5 rounded-md text-[10.5px] font-black transition-all cursor-pointer shrink-0",
                  monitorMode === "full"
                    ? "bg-primary text-white"
                    : "bg-slate-800 text-slate-300 hover:text-white"
                )}
              >
                全文
              </button>

              {monitorMode === "inning" ? (
                <span className="ml-1 font-mono text-[10.5px] font-black text-amber-300 truncate">
                  得点{autoSituation.runs + (previewLine ? finalRunsScored : 0)}{" "}
                  ｜ {liveFirstTotal}-{liveSecondTotal}
                </span>
              ) : (
                onChangeOutputMode && (
                  <div className="flex items-center gap-0.5 ml-0.5 bg-slate-900 rounded-md p-0.5 border border-slate-800 shrink-0">
                    {(
                      [
                        { id: "full", label: "全文" },
                        { id: "latest_inning", label: "直近" },
                        { id: "lineup", label: "スタメン" },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onChangeOutputMode(m.id)}
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[9.5px] font-black cursor-pointer",
                          outputMode === m.id
                            ? "bg-amber-400 text-slate-950"
                            : "text-slate-400 hover:text-white"
                        )}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                )
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {onCopyText && (
                <button
                  type="button"
                  onClick={onCopyText}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-[10px] font-black cursor-pointer active:scale-95"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-300">コピー済</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-sky-400" />
                      <span>コピー</span>
                    </>
                  )}
                </button>
              )}
              {onShareLine && (
                <button
                  type="button"
                  onClick={onShareLine}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#06C755] hover:bg-[#05b34c] text-white text-[10px] font-black cursor-pointer active:scale-95"
                >
                  <Share2 className="w-3 h-3" />
                  <span>LINE送信</span>
                </button>
              )}
              {onOpenFullPreview && (
                <button
                  type="button"
                  onClick={onOpenFullPreview}
                  title="全文・出力形式の手直し画面を開く"
                  className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
                >
                  <FileText className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* モニター本文（自動で残り縦幅いっぱいに伸縮し、長くなったらここだけスクロール） */}
          <div
            ref={monitorScrollRef}
            className="flex-1 min-h-0 overflow-y-auto px-3 py-1.5"
          >
            {monitorMode === "inning" ? (
              <div className="space-y-0.5 font-sans text-[11.5px] leading-snug">
                <div className="flex items-center justify-between gap-2 text-[10px] font-black text-slate-400 pb-0.5">
                  <span>
                    {doc.activeInning}回{doc.activeIsBottom ? "裏" : "表"}（
                    {isMyAttack ? "自チーム攻撃" : "相手攻撃"}）
                  </span>
                  {doc.isGameFinished && (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9.5px] font-black">
                      試合終了出力ON
                    </span>
                  )}
                </div>

                {currentInningLines.length === 0 && !previewLine ? (
                  <p className="text-[11px] font-bold text-slate-400 py-1">
                    下のボタンを選択（長押し・スライドで重盗や手前/ライン際等も選択可）➔「記録確定」
                  </p>
                ) : (
                  currentInningLines.map((line) => (
                    <p
                      key={line.id}
                      className="text-[11.5px] font-bold text-slate-100 break-all"
                    >
                      {line.text}
                    </p>
                  ))
                )}

                {quickBrFeedback && (
                  <div className="mt-1 px-2 py-0.5 rounded-md bg-teal-500/20 border border-teal-400/50 text-[10.5px] font-black text-teal-200">
                    {quickBrFeedback}
                  </div>
                )}

                {previewLine && (
                  <div className="mt-1 px-2 py-1 rounded-md bg-amber-400/15 border border-amber-400/60 flex items-center justify-between gap-2">
                    <p className="text-[11.5px] font-black text-amber-300 break-all">
                      ➕ {previewLine}
                    </p>
                    <span className="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[9.5px] font-black shrink-0">
                      確定待ち
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="font-sans text-[11px] leading-relaxed text-slate-100 whitespace-pre-wrap">
                {fullFormattedText}
              </div>
            )}
          </div>

          {/* 3アウト到達時のワンタップ次イニング誘導バー */}
          {autoSituation.outs >= 3 && manualStartOuts === null && (
            <div className="shrink-0 px-2.5 py-1.5 bg-slate-950 border-t border-slate-800">
              <button
                type="button"
                onClick={() => handleStepHalfInning(1)}
                className="w-full py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-2xs transition-all active:scale-98 cursor-pointer"
              >
                <span>⚾️ 3アウトチェンジ！ 次の「{nextHalfLabel}」へ進む</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* ════════════════════════════════════════════════════════════════
            BOTTOM DOCK: ボトムナビの代わりに最下部へ固定配置する片手操作パッド
           ════════════════════════════════════════════════════════════════ */}
        <div className="shrink-0 bg-card border-t-2 border-[#0f172a] shadow-[0_-4px_12px_rgba(15,23,42,0.08)] px-2 pt-1.5 pb-[max(env(safe-area-inset-bottom),8px)] space-y-1 select-none">
          {/* ① 状況・打者・サブ操作コンパクトボックス */}
          <div className="rounded-xl border border-border bg-muted/50 px-2 py-1 space-y-1">
            {/* 上段: 回送り ＋ アウト ＋ 走者 ＋ 走塁追記(長押し重盗対応)/戻す */}
            <div className="flex items-center justify-between gap-1">
              <div className="inline-flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleStepHalfInning(-1)}
                  disabled={doc.activeInning === 1 && !doc.activeIsBottom}
                  className="w-6 h-6 rounded-lg border border-border bg-card hover:bg-accent disabled:opacity-40 flex items-center justify-center text-foreground cursor-pointer"
                  title="前の回へ"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-1.5 py-0.5 rounded-md bg-[#0f172a] text-white text-[10.5px] font-black">
                  {doc.activeInning}回{doc.activeIsBottom ? "裏" : "表"}
                </span>
                <button
                  type="button"
                  onClick={() => handleStepHalfInning(1)}
                  className="w-6 h-6 rounded-lg border border-border bg-card hover:bg-accent flex items-center justify-center text-foreground cursor-pointer"
                  title="次の回へ"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* アウト数（タップ切替） */}
              <div className="inline-flex items-center gap-1 bg-card border border-border rounded-lg px-1.5 h-6 shrink-0">
                {[0, 1, 2].map((o) => {
                  const active =
                    o < (effectiveOutsBefore >= 3 ? 3 : effectiveOutsBefore);
                  return (
                    <button
                      key={o}
                      type="button"
                      onClick={() => {
                        const target =
                          o + 1 === effectiveOutsBefore ? o : o + 1;
                        setManualStartOuts(target);
                      }}
                      className={cn(
                        "w-3.5 h-3.5 rounded-full border transition-all cursor-pointer",
                        active
                          ? "bg-slate-900 border-slate-900"
                          : "bg-muted border-slate-300"
                      )}
                      title={`${o + 1}アウトに切替`}
                    />
                  );
                })}
                <span className="text-[10px] font-black font-mono text-foreground">
                  {effectiveOutsBefore >= 3 ? "3死" : `${effectiveOutsBefore}死`}
                </span>
              </div>

              {/* 走者ピル（タップで手動ON/OFF可） */}
              <div className="inline-flex items-center gap-0.5 shrink-0">
                {([1, 2, 3] as const).map((b) => {
                  const onBase = effectiveRunnersBefore.includes(b);
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => {
                        const next = onBase
                          ? effectiveRunnersBefore.filter((x) => x !== b)
                          : normalizeRunnersList([
                              ...effectiveRunnersBefore,
                              b,
                            ]);
                        setManualStartRunners(next);
                      }}
                      className={cn(
                        "px-1.5 h-6 rounded-lg text-[10px] font-black border transition-all cursor-pointer",
                        onBase
                          ? "bg-amber-400 text-slate-950 border-amber-500"
                          : "bg-card text-muted-foreground border-border hover:text-foreground"
                      )}
                    >
                      {b}塁
                    </button>
                  );
                })}
              </div>

              {/* 直前走塁追記（短押し＝モーダル / 長押しスライド＝重盗・二盗・三盗・暴投等を即記録！） ＆ 1つ戻す */}
              <div className="inline-flex items-center gap-1 ml-auto shrink-0">
                <FlickPadButton
                  label="走塁"
                  disabled={
                    !lastBatterEntry && effectiveRunnersBefore.length === 0
                  }
                  title="タップで走塁追記モーダル / 長押しスライドで重盗・二盗・暴投などを即記録"
                  popupTitle="走塁プレー（スライドして離すと即記録）"
                  options={QUICK_BASERUNNING_OPTIONS}
                  onShortTap={() => {
                    if (lastBatterEntry) {
                      openFollowUpModal();
                    }
                  }}
                  onSelectOption={(opt) =>
                    handleQuickBaserunningFlick(opt.value)
                  }
                  contextKey={padContextKey}
                  leadingIcon={
                    <Footprints className="w-3 h-3 text-teal-600 shrink-0" />
                  }
                  className="px-1.5 pr-2.5 h-6 rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-40 text-[10px] font-black text-foreground inline-flex items-center gap-0.5 cursor-pointer active:scale-95"
                />
                <button
                  type="button"
                  disabled={!currentHalf || currentHalf.entries.length === 0}
                  onClick={handleUndoLastEntry}
                  className="px-1.5 h-6 rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-40 text-[10px] font-black text-foreground inline-flex items-center gap-0.5 cursor-pointer active:scale-95"
                  title="直前の1行を取り消す"
                >
                  <Undo2 className="w-3 h-3 text-slate-600 shrink-0" />
                  <span>戻す</span>
                </button>
              </div>
            </div>

            {/* 下段: 現在の打者 ＆ 選手交代・微調整・試合終了 */}
            <div className="flex items-center justify-between gap-1 pt-1 border-t border-border/70">
              <div className="flex items-center gap-1 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => handleShiftOrder(-1)}
                  className="w-6 h-6 rounded-lg bg-card border border-border text-xs font-black text-foreground flex items-center justify-center shrink-0 cursor-pointer active:scale-95"
                >
                  -
                </button>
                <span className="px-1.5 py-0.5 rounded-lg bg-[#0f172a] text-white font-mono text-[10.5px] font-black shrink-0">
                  {currentOrder}番
                </span>
                <button
                  type="button"
                  onClick={() => handleShiftOrder(1)}
                  className="w-6 h-6 rounded-lg bg-card border border-border text-xs font-black text-foreground flex items-center justify-center shrink-0 cursor-pointer active:scale-95"
                >
                  +
                </button>

                {isMyAttack ? (
                  <button
                    type="button"
                    onClick={openBatterQuickModal}
                    className={cn(
                      "min-w-0 ml-0.5 px-2 h-6 rounded-lg border text-left inline-flex items-center gap-1 transition-all cursor-pointer active:scale-95",
                      activeBatterSlot?.playerName
                        ? "bg-card border-border hover:border-primary/40 text-foreground"
                        : "bg-amber-500/15 border-amber-500/45 text-amber-800 dark:text-amber-300"
                    )}
                    title="タップして打者の選手名・守備位置を設定"
                  >
                    {activeBatterSlot?.playerName ? (
                      <>
                        <span className="text-xs font-black truncate">
                          {formatPlayerReportName(
                            activeBatterSlot.playerName,
                            doc.showSurnameOnly
                          )}
                        </span>
                        <span className="text-[9.5px] font-bold text-muted-foreground shrink-0">
                          ({normalizeReportPositionCode(activeBatterSlot.position)})
                        </span>
                        <Pencil className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                      </>
                    ) : (
                      <span className="text-[10.5px] font-black truncate">
                        ＋{currentOrder}番を設定
                      </span>
                    )}
                  </button>
                ) : (
                  <span className="text-[10.5px] font-bold text-muted-foreground ml-1 truncate">
                    相手打者（番号のみ）
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={openSubstitutionModal}
                  className="inline-flex items-center gap-0.5 px-1.5 h-6 rounded-lg bg-card border border-border hover:bg-muted text-[10px] font-black text-primary cursor-pointer active:scale-95"
                >
                  <UserPlus className="w-3 h-3" />
                  <span>{isMyAttack ? "代打/走" : "交代"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowCustomOverride(true)}
                  className={cn(
                    "inline-flex items-center gap-0.5 px-1.5 h-6 rounded-lg border text-[10px] font-black cursor-pointer active:scale-95",
                    hasCustomOverride
                      ? "bg-amber-400 text-slate-950 border-amber-500"
                      : "bg-card text-foreground border-border hover:bg-muted"
                  )}
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  <span>微調整</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsGameSetPanelOpen(true)}
                  className={cn(
                    "inline-flex items-center gap-0.5 px-1.5 h-6 rounded-lg border text-[10px] font-black cursor-pointer active:scale-95",
                    doc.isGameFinished
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-card text-foreground border-border hover:bg-muted"
                  )}
                >
                  <Flag
                    className={cn(
                      "w-3 h-3",
                      doc.isGameFinished ? "text-white" : "text-amber-500"
                    )}
                  />
                  <span>{doc.isGameFinished ? "終了ON" : "終了"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* ② プレビュー ＆ 記録確定バー */}
          <div
            className={cn(
              "rounded-xl border px-2 py-1 transition-all space-y-1",
              finalPlayText
                ? "border-primary bg-primary/8 shadow-2xs"
                : "border-border bg-muted/40"
            )}
          >
            {/* 走者がいる場合の自動進塁パターン切替ピル */}
            {candidates.length > 1 && (
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
                <span className="text-[10px] font-black text-primary shrink-0">
                  走者:
                </span>
                {candidates.map((cand, idx) => {
                  const active = idx === selectedCandidateIdx;
                  return (
                    <button
                      key={cand.id}
                      type="button"
                      onClick={() => {
                        setSelectedCandidateIdx(idx);
                        setCustomPlayText("");
                        setCustomOutsAfter(null);
                        setCustomRunnersAfter(null);
                        setCustomRunsScored(null);
                      }}
                      className={cn(
                        "px-2 py-0.5 rounded-lg border text-[10px] font-black whitespace-nowrap transition-all cursor-pointer",
                        active
                          ? "bg-primary text-primary-foreground border-primary shadow-2xs"
                          : "bg-card text-foreground border-border hover:bg-muted"
                      )}
                    >
                      {cand.chipLabel}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between gap-1.5">
              <div className="min-w-0 flex-1 flex items-center gap-1.5">
                {previewLine ? (
                  <>
                    {finalRunsScored > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-black shrink-0">
                        +{finalRunsScored}点
                      </span>
                    )}
                    <p className="text-xs font-black text-foreground truncate">
                      {previewLine}
                    </p>
                  </>
                ) : (
                  <p className="text-[10.5px] font-bold text-muted-foreground truncate">
                    {selectedDirection
                      ? `方向「${selectedDirection}」選択中 ➔ 結果を選択（長押しで詳細）`
                      : "ボタン選択（長押しスライドで詳細打球・重盗）➔「記録確定」"}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {(selectedDirection ||
                  selectedBatted ||
                  selectedDirect ||
                  hasCustomOverride) && (
                  <button
                    type="button"
                    onClick={resetPadSelection}
                    className="w-7 h-8 rounded-xl border border-border bg-card hover:bg-muted text-muted-foreground flex items-center justify-center cursor-pointer"
                    title="選択をクリア"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  disabled={!finalPlayText}
                  onClick={handleRecordAtBat}
                  className="h-8 px-3.5 rounded-xl bg-primary hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground text-primary-foreground text-xs font-black inline-flex items-center justify-center gap-1 shadow-xs transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>記録確定</span>
                </button>
              </div>
            </div>
          </div>

          {/* ③ 片手親指キーパッド（全主要ボタンで長押しフリック選択に対応！） */}
          <div className="space-y-1">
            {/* 打球方向（内野6列 ＋ 外野5列） */}
            <div className="grid grid-cols-6 gap-1">
              {INFIELD_DIRECTIONS.map((dir) => {
                const isSelected =
                  selectedDirection !== "" &&
                  (selectedDirectionAnchor
                    ? selectedDirectionAnchor === dir
                    : selectedDirection === dir);
                return (
                  <FlickPadButton
                    key={dir}
                    label={dir}
                    activeLabel={isSelected ? selectedDirection : null}
                    isSelected={isSelected}
                    popupTitle={`打球方向「${dir}」の詳細（前・線・間・強襲）`}
                    options={DIRECTION_FLICK_OPTIONS[dir] || []}
                    onShortTap={() => selectDirection(dir)}
                    onSelectOption={(opt) => selectDirection(dir, opt.value)}
                    contextKey={padContextKey}
                    className={cn(
                      "h-[30px] px-0.5 rounded-lg border text-xs font-black transition-all cursor-pointer active:scale-95 flex items-center justify-center",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-2xs"
                        : "bg-muted/65 text-foreground border-border hover:bg-muted"
                    )}
                  />
                );
              })}
            </div>
            <div className="grid grid-cols-5 gap-1">
              {OUTFIELD_DIRECTIONS.map((dir) => {
                const isSelected =
                  selectedDirection !== "" &&
                  (selectedDirectionAnchor
                    ? selectedDirectionAnchor === dir
                    : selectedDirection === dir);
                return (
                  <FlickPadButton
                    key={dir}
                    label={dir}
                    activeLabel={isSelected ? selectedDirection : null}
                    isSelected={isSelected}
                    popupTitle={`外野方向「${dir}」の詳細（手前・ライン際・越え）`}
                    options={DIRECTION_FLICK_OPTIONS[dir] || []}
                    onShortTap={() => selectDirection(dir)}
                    onSelectOption={(opt) => selectDirection(dir, opt.value)}
                    contextKey={padContextKey}
                    className={cn(
                      "h-[30px] px-0.5 rounded-lg border text-xs font-black transition-all cursor-pointer active:scale-95 flex items-center justify-center",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-2xs"
                        : "bg-muted/65 text-foreground border-border hover:bg-muted"
                    )}
                  />
                );
              })}
            </div>

            {/* Row A: アウト系（6列） */}
            <div className="grid grid-cols-6 gap-1">
              {OUT_BATTED_OUTCOMES.map((item) => {
                const isSelected = selectedBatted === item.code;
                return (
                  <FlickPadButton
                    key={item.code}
                    label={item.label}
                    activeLabel={isSelected ? selectedBattedActiveChip : null}
                    isSelected={isSelected}
                    popupTitle={`「${item.label}」の詳細選択`}
                    options={BATTED_FLICK_OPTIONS[item.code] || []}
                    onShortTap={() => selectBattedOutcome(item.code)}
                    onSelectOption={(opt) =>
                      selectBattedOutcome(
                        opt.value.code,
                        opt.value.variant,
                        opt.value.activeChip ?? opt.shortActiveLabel ?? null,
                        true
                      )
                    }
                    contextKey={padContextKey}
                    className={cn(
                      "h-[30px] px-0.5 rounded-lg border text-[11px] font-black transition-all cursor-pointer active:scale-95 flex items-center justify-center",
                      isSelected
                        ? "bg-[#0f172a] text-white border-[#0f172a] shadow-2xs"
                        : "bg-card text-foreground border-border hover:bg-muted"
                    )}
                  />
                );
              })}
            </div>

            {/* Row B: 安打系（6列 — 手前・ポテン・ライン際・越え・バント安打など長押し対応） */}
            <div className="grid grid-cols-6 gap-1">
              {HIT_BATTED_OUTCOMES.map((item) => {
                const isSelected = selectedBatted === item.code;
                return (
                  <FlickPadButton
                    key={item.code}
                    label={item.label}
                    activeLabel={isSelected ? selectedBattedActiveChip : null}
                    isSelected={isSelected}
                    popupTitle={`「${item.label}」の打球ニュアンス選択`}
                    options={BATTED_FLICK_OPTIONS[item.code] || []}
                    onShortTap={() => selectBattedOutcome(item.code)}
                    onSelectOption={(opt) =>
                      selectBattedOutcome(
                        opt.value.code,
                        opt.value.variant,
                        opt.value.activeChip ?? opt.shortActiveLabel ?? null,
                        true
                      )
                    }
                    contextKey={padContextKey}
                    className={cn(
                      "h-[30px] px-0.5 rounded-lg border text-[11px] font-black transition-all cursor-pointer active:scale-95 flex items-center justify-center",
                      isSelected
                        ? "bg-[#0f172a] text-white border-[#0f172a] shadow-2xs"
                        : "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30 hover:bg-rose-500/15"
                    )}
                  />
                );
              })}
            </div>

            {/* Row C: 犠打・走本・エラー・野選（5列 — スクイズ・捕球/悪送球Eなど長押し対応） */}
            <div className="grid grid-cols-5 gap-1">
              {OTHER_BATTED_OUTCOMES.map((item) => {
                const isSelected = selectedBatted === item.code;
                const toneClass =
                  item.group === "sac"
                    ? "bg-amber-500/12 text-amber-800 dark:text-amber-300 border-amber-500/35 hover:bg-amber-500/20"
                    : item.group === "hit"
                    ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30 hover:bg-rose-500/15"
                    : "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30 hover:bg-purple-500/15";
                return (
                  <FlickPadButton
                    key={item.code}
                    label={item.label}
                    activeLabel={isSelected ? selectedBattedActiveChip : null}
                    isSelected={isSelected}
                    popupTitle={`「${item.label}」の詳細選択`}
                    options={BATTED_FLICK_OPTIONS[item.code] || []}
                    onShortTap={() => selectBattedOutcome(item.code)}
                    onSelectOption={(opt) =>
                      selectBattedOutcome(
                        opt.value.code,
                        opt.value.variant,
                        opt.value.activeChip ?? opt.shortActiveLabel ?? null,
                        true
                      )
                    }
                    contextKey={padContextKey}
                    className={cn(
                      "h-[30px] px-0.5 rounded-lg border text-[11px] font-black transition-all cursor-pointer active:scale-95 flex items-center justify-center",
                      isSelected
                        ? "bg-[#0f172a] text-white border-[#0f172a] shadow-2xs"
                        : toneClass
                    )}
                  />
                );
              })}
            </div>

            {/* Row D: 1タップ三振・四死球（7列 — ストレート四球・四球暴投二進など長押し対応） */}
            <div className="grid grid-cols-7 gap-1">
              {DIRECT_OUTCOMES.map((item) => {
                const isSelected = selectedDirect === item.code;
                return (
                  <FlickPadButton
                    key={item.code}
                    label={item.label}
                    activeLabel={isSelected ? selectedDirectActiveChip : null}
                    isSelected={isSelected}
                    popupTitle={`「${item.label}」の詳細選択`}
                    options={DIRECT_FLICK_OPTIONS[item.code] || []}
                    onShortTap={() => selectDirectOutcome(item.code)}
                    onSelectOption={(opt) =>
                      selectDirectOutcome(
                        opt.value.code,
                        opt.value.variant,
                        opt.value.activeChip ?? opt.shortActiveLabel ?? null,
                        true
                      )
                    }
                    contextKey={padContextKey}
                    className={cn(
                      "h-[30px] px-0.5 rounded-lg border text-[10.5px] font-black transition-all cursor-pointer active:scale-95 flex items-center justify-center",
                      isSelected
                        ? "bg-[#0f172a] text-white border-[#0f172a] shadow-2xs"
                        : item.tone === "reach"
                        ? "bg-sky-500/10 text-sky-800 dark:text-sky-300 border-sky-500/30 hover:bg-sky-500/15"
                        : "bg-slate-100 dark:bg-slate-800 text-foreground border-border hover:bg-muted"
                    )}
                  />
                );
              })}
            </div>

            {/* 一言リアクション・好守備ワンタップ付与（横スクロール1行） */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pt-0.5">
              <span className="text-[10px] font-black text-muted-foreground flex items-center gap-0.5 shrink-0 mr-0.5">
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>一言:</span>
              </span>

              {activeDefenderSurname && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setReactionText((prev) =>
                        prev === `${activeDefenderSurname}ナイスキャッチ❗️`
                          ? ""
                          : `${activeDefenderSurname}ナイスキャッチ❗️`
                      )
                    }
                    className={cn(
                      "px-2 h-[26px] rounded-lg border text-[10px] font-black whitespace-nowrap transition-all cursor-pointer shrink-0",
                      reactionText === `${activeDefenderSurname}ナイスキャッチ❗️`
                        ? "bg-amber-400 text-slate-950 border-amber-500"
                        : "bg-amber-500/12 text-amber-900 dark:text-amber-300 border-amber-500/35"
                    )}
                  >
                    ＋{activeDefenderSurname}ナイスキャッチ❗️
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setReactionText((prev) =>
                        prev === `${activeDefenderSurname}好守備❗️`
                          ? ""
                          : `${activeDefenderSurname}好守備❗️`
                      )
                    }
                    className={cn(
                      "px-2 h-[26px] rounded-lg border text-[10px] font-black whitespace-nowrap transition-all cursor-pointer shrink-0",
                      reactionText === `${activeDefenderSurname}好守備❗️`
                        ? "bg-amber-400 text-slate-950 border-amber-500"
                        : "bg-amber-500/12 text-amber-900 dark:text-amber-300 border-amber-500/35"
                    )}
                  >
                    ＋{activeDefenderSurname}好守備❗️
                  </button>
                </>
              )}

              {REACTION_PRESETS.map((chip) => {
                const isSelected = reactionText === chip;
                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setReactionText(isSelected ? "" : chip)}
                    className={cn(
                      "px-2 h-[26px] rounded-lg border text-[10px] font-black whitespace-nowrap transition-all cursor-pointer shrink-0",
                      isSelected
                        ? "bg-amber-400 text-slate-950 border-amber-500"
                        : "bg-muted/60 text-foreground border-border hover:bg-muted"
                    )}
                  >
                    {chip}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* モーダル1: 現在打者のクイック設定モーダル（createPortal + z-[9999]） */}
      {mounted &&
        isBatterQuickModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            onClick={() => setIsBatterQuickModalOpen(false)}
          >
            <div
              className="w-full sm:max-w-md max-h-[88dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between shrink-0">
                <h3 className="text-sm font-black text-white">
                  {currentOrder}番打者の設定
                </h3>
                <button
                  type="button"
                  onClick={() => setIsBatterQuickModalOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto space-y-3 flex-1">
                {rosterPlayers.length > 0 && (
                  <div className="space-y-1">
                    <label className="block text-xs font-black text-muted-foreground">
                      チーム名簿から1タップ選択
                    </label>
                    <LiffSelect
                      value={quickBatterPlayerId}
                      onChange={(pid) => {
                        setQuickBatterPlayerId(pid);
                        const matched = rosterPlayers.find(
                          (rp) => rp.id === pid
                        );
                        if (matched) {
                          setQuickBatterName(matched.name);
                        }
                      }}
                      options={[
                        {
                          value: "",
                          label: "手入力する（名簿未選択）",
                        },
                        ...rosterPlayers.map((rp) => ({
                          value: rp.id,
                          label: `${
                            rp.uniformNumber ? `#${rp.uniformNumber} ` : ""
                          }${rp.name}`,
                          badge: rp.mainPosition || undefined,
                          badgeTone: "slate" as const,
                          keywords: `${rp.uniformNumber || ""} ${rp.name}`,
                        })),
                      ]}
                      title={`${currentOrder}番打者を名簿から選択`}
                      size="md"
                      searchable={true}
                      searchPlaceholder="選手名・背番号で検索..."
                      className="w-full"
                    />
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="block text-xs font-black text-muted-foreground">
                      守備位置
                    </label>
                    <LiffSelect
                      value={normalizeReportPositionCode(quickBatterPos)}
                      onChange={(val) => setQuickBatterPos(val)}
                      options={[
                        ...POSITION_OPTIONS.map((p) => ({
                          value: p.code,
                          label: p.shortLabel,
                        })),
                        { value: "打", label: "打" },
                      ]}
                      title="守備位置を選択"
                      size="md"
                      searchable={false}
                      className="w-full"
                    />
                  </div>

                  <div className="col-span-2 space-y-1">
                    <label className="block text-xs font-black text-muted-foreground">
                      選手名（自由入力も可）
                    </label>
                    <input
                      type="text"
                      value={quickBatterName}
                      onChange={(e) => setQuickBatterName(e.target.value)}
                      placeholder="例: 山田 太郎"
                      className="w-full h-10 rounded-xl border border-border bg-card px-3 text-base sm:text-xs font-black text-foreground outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-border bg-muted/40 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsBatterQuickModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-border bg-card text-xs font-black text-foreground cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleSaveQuickBatter}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black cursor-pointer active:scale-95"
                >
                  設定する
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* モーダル2: 打席結果の手動微調整モーダル（createPortal + z-[9999]） */}
      {mounted &&
        showCustomOverride &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            onClick={() => setShowCustomOverride(false)}
          >
            <div
              className="w-full sm:max-w-md max-h-[88dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 px-4 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-black text-white">
                    打席結果・走者・得点の微調整
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCustomOverride(false)}
                  className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto space-y-3.5 flex-1">
                {previewLine && (
                  <div className="rounded-xl border border-primary/35 bg-primary/8 px-3 py-2 text-xs font-black text-foreground">
                    プレビュー: {previewLine}
                  </div>
                )}

                <div className="space-y-1">
                  <label className="block text-xs font-black text-muted-foreground">
                    プレー結果テキスト（自由入力・上書き可）
                  </label>
                  <input
                    type="text"
                    value={customPlayText || activeCandidate?.playText || ""}
                    onChange={(e) => setCustomPlayText(e.target.value)}
                    placeholder="例: 中前ヒット中暴投 / 振り逃げセーフ"
                    className="w-full h-10 rounded-xl border border-border bg-card px-3 text-base sm:text-xs font-black text-foreground outline-none focus:border-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-black text-muted-foreground">
                    一言コメント・リアクション（自由入力）
                  </label>
                  <input
                    type="text"
                    value={reactionText}
                    onChange={(e) => setReactionText(e.target.value)}
                    placeholder="例: ナイスラン❗️"
                    className="w-full h-10 rounded-xl border border-border bg-card px-3 text-base sm:text-xs font-black text-foreground outline-none focus:border-primary"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-black text-muted-foreground">
                      後アウト:
                    </span>
                    {[0, 1, 2, 3].map((o) => (
                      <button
                        key={o}
                        type="button"
                        onClick={() => setCustomOutsAfter(o)}
                        className={cn(
                          "w-8 h-8 rounded-lg border text-xs font-black cursor-pointer",
                          finalOutsAfter === o
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-card text-foreground border-border"
                        )}
                      >
                        {o}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="text-xs font-black text-muted-foreground">
                      後走者:
                    </span>
                    {([1, 2, 3] as const).map((b) => {
                      const onB = finalRunnersAfter.includes(b);
                      return (
                        <button
                          key={b}
                          type="button"
                          disabled={finalOutsAfter >= 3}
                          onClick={() => {
                            const next = onB
                              ? finalRunnersAfter.filter((x) => x !== b)
                              : normalizeRunnersList([...finalRunnersAfter, b]);
                            setCustomRunnersAfter(next);
                          }}
                          className={cn(
                            "px-2.5 h-8 rounded-lg border text-xs font-black cursor-pointer disabled:opacity-40",
                            onB
                              ? "bg-amber-400 text-slate-950 border-amber-500"
                              : "bg-card text-foreground border-border"
                          )}
                        >
                          {b}塁
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="text-xs font-black text-muted-foreground">
                      得点:
                    </span>
                    {[0, 1, 2, 3, 4].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setCustomRunsScored(r)}
                        className={cn(
                          "w-7 h-8 rounded-lg border text-xs font-black cursor-pointer",
                          finalRunsScored === r
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card text-foreground border-border"
                        )}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-border bg-muted/40 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 flex items-center justify-between gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setCustomPlayText("");
                    setCustomOutsAfter(null);
                    setCustomRunnersAfter(null);
                    setCustomRunsScored(null);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-2.5 rounded-xl border border-border bg-card text-xs font-black text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>リセット</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCustomOverride(false)}
                    className="px-4 py-2.5 rounded-xl border border-border bg-card text-xs font-black text-foreground cursor-pointer"
                  >
                    適用して戻る
                  </button>
                  <button
                    type="button"
                    disabled={!finalPlayText}
                    onClick={handleRecordAtBat}
                    className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground disabled:opacity-40 text-xs font-black inline-flex items-center gap-1 cursor-pointer active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>記録確定</span>
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* モーダル3: 試合終了（ゲームセット）設定モーダル（createPortal + z-[9999]） */}
      {mounted &&
        isGameSetPanelOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            onClick={() => setIsGameSetPanelOpen(false)}
          >
            <div
              className="w-full sm:max-w-md max-h-[88dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Flag className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-black text-white">
                    ゲームセット（試合終了行）の設定
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsGameSetPanelOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto space-y-3.5 flex-1">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/45 p-3">
                  <div>
                    <p className="text-xs font-black text-foreground">
                      速報末尾に「試合終了」行を出力する
                    </p>
                    <p className="text-[10.5px] font-bold text-muted-foreground">
                      ONにすると最終スコアと結びコメントが付与されます
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeDoc((p) => ({
                        ...p,
                        isGameFinished: !p.isGameFinished,
                        endTime:
                          !p.isGameFinished && !p.endTime.trim()
                            ? getCurrentHmText()
                            : p.endTime,
                      }))
                    }
                    className={cn(
                      "px-3.5 py-2 rounded-xl text-xs font-black shrink-0 cursor-pointer transition-all active:scale-95",
                      doc.isGameFinished
                        ? "bg-emerald-600 text-white"
                        : "bg-card border border-border text-foreground"
                    )}
                  >
                    {doc.isGameFinished ? "試合終了ON" : "試合終了にする"}
                  </button>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-black text-muted-foreground">
                    試合終了時刻
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 rounded-xl border border-border bg-card px-3 h-10">
                      <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                      <input
                        type="text"
                        value={doc.endTime}
                        onChange={(e) =>
                          onChangeDoc((p) => ({
                            ...p,
                            endTime: e.target.value,
                          }))
                        }
                        placeholder="例: 13:17"
                        className="w-full bg-transparent text-base sm:text-xs font-mono font-black text-foreground outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onChangeDoc((p) => ({
                          ...p,
                          endTime: getCurrentHmText(),
                        }))
                      }
                      className="h-10 px-3 rounded-xl border border-border bg-muted hover:bg-accent text-xs font-black text-primary shrink-0 cursor-pointer active:scale-95"
                    >
                      現在時刻
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-black text-muted-foreground">
                    結びコメント（タップで自動セット＆試合終了ON）
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      "勝利❗️応援ありがとうございました🙌",
                      "快勝‼️",
                      "惜敗。。",
                      "引き分け",
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() =>
                          onChangeDoc((p) => ({
                            ...p,
                            isGameFinished: true,
                            endTime: p.endTime.trim()
                              ? p.endTime
                              : getCurrentHmText(),
                            closingComment: preset,
                          }))
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-card border border-border hover:bg-muted text-[11px] font-black text-foreground cursor-pointer"
                      >
                        ＋{preset}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={doc.closingComment}
                    onChange={(e) =>
                      onChangeDoc((p) => ({
                        ...p,
                        closingComment: e.target.value,
                      }))
                    }
                    placeholder="結びコメント（例: 惜敗。。 / 見事勝利❗️）"
                    className="w-full h-10 rounded-xl border border-border bg-card px-3 text-base sm:text-xs font-bold text-foreground outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="border-t border-border bg-muted/40 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsGameSetPanelOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-border bg-card text-xs font-black text-foreground cursor-pointer"
                >
                  閉じる
                </button>
                {onShareLine && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsGameSetPanelOpen(false);
                      onShareLine();
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white text-xs font-black inline-flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>LINEで速報送信</span>
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* モーダル4: 選手交代・自由メモモーダル（createPortal + z-[9999]） */}
      {mounted &&
        isSubModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            onClick={() => setIsSubModalOpen(false)}
          >
            <div
              className="w-full sm:max-w-md max-h-[88dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-sky-400" />
                  <h3 className="text-sm font-black text-white">
                    選手交代・イベント行を追加（{doc.activeInning}回
                    {doc.activeIsBottom ? "裏" : "表"}）
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSubModalOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto space-y-3.5 flex-1">
                <div className="grid grid-cols-5 gap-1 bg-muted p-1 rounded-xl border border-border">
                  {(
                    [
                      { id: "P", label: "投手交代" },
                      { id: "PH", label: "代打" },
                      { id: "PR", label: "代走" },
                      { id: "DEF", label: "守備交代" },
                      { id: "NOTE", label: "自由行" },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setSubType(t.id);
                        if (t.id === "P") setSubNewPos("1");
                      }}
                      className={cn(
                        "py-1.5 rounded-lg text-[11px] font-black cursor-pointer",
                        subType === t.id
                          ? "bg-card text-foreground shadow-2xs border border-border"
                          : "text-muted-foreground"
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {subType === "NOTE" ? (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-black text-muted-foreground">
                      イニング内に挿入するテキスト
                    </label>
                    <input
                      type="text"
                      value={subCustomNote}
                      onChange={(e) => setSubCustomNote(e.target.value)}
                      placeholder="例: タイブレーク無死1・2塁から開始"
                      className="w-full h-10 rounded-xl border border-border bg-card px-3 text-base sm:text-xs font-bold text-foreground outline-none focus:border-primary"
                    />
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-black text-muted-foreground">
                        交代する打順枠（以降の打席も自動で新選手名に更新されます）
                      </label>
                      <LiffSelect
                        value={String(subSlotOrder)}
                        onChange={(val) => {
                          const ord = Number(val) || 1;
                          setSubSlotOrder(ord);
                          const found = activeLineup.find(
                            (s) => s.order === ord
                          );
                          if (found && subType !== "P") {
                            setSubNewPos(found.position);
                          }
                        }}
                        options={activeLineup.map((s) => ({
                          value: String(s.order),
                          label: `${s.order}番（現在: ${normalizeReportPositionCode(
                            s.position
                          )} ${s.playerName || "未登録"}）`,
                        }))}
                        title="交代する打順枠を選択"
                        size="md"
                        searchable={false}
                        className="w-full"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <label className="block text-[11px] font-black text-muted-foreground">
                          守備位置
                        </label>
                        <LiffSelect
                          value={normalizeReportPositionCode(subNewPos)}
                          onChange={(val) => setSubNewPos(val)}
                          options={[
                            ...POSITION_OPTIONS.map((p) => ({
                              value: p.code,
                              label: p.shortLabel,
                            })),
                            { value: "打", label: "打" },
                          ]}
                          title="交代後の守備位置を選択"
                          size="md"
                          searchable={false}
                          className="w-full"
                        />
                      </div>

                      <div className="col-span-2 space-y-1">
                        <label className="block text-[11px] font-black text-muted-foreground">
                          交代で入る選手（名簿選択 or 手入力）
                        </label>
                        {rosterPlayers.length > 0 && (
                          <LiffSelect
                            value={subPlayerId}
                            onChange={(pid) => {
                              setSubPlayerId(pid);
                              const matched = rosterPlayers.find(
                                (r) => r.id === pid
                              );
                              if (matched) setSubNewName(matched.name);
                            }}
                            options={[
                              {
                                value: "",
                                label: "チーム名簿から選ぶ...",
                                sublabel: "手入力する場合は未選択のままでOKです",
                              },
                              ...rosterPlayers.map((rp) => ({
                                value: rp.id,
                                label: `${
                                  rp.uniformNumber ? `#${rp.uniformNumber} ` : ""
                                }${rp.name}`,
                                badge: rp.mainPosition || undefined,
                                badgeTone: "slate" as const,
                                keywords: `${rp.uniformNumber || ""} ${rp.name}`,
                              })),
                            ]}
                            placeholder="チーム名簿から選ぶ..."
                            title="交代で入る選手を選択"
                            size="sm"
                            searchable={true}
                            searchPlaceholder="選手名・背番号で検索..."
                            className="w-full h-9 mb-1.5 bg-muted/50"
                          />
                        )}
                        <input
                          type="text"
                          value={subNewName}
                          onChange={(e) => setSubNewName(e.target.value)}
                          placeholder="新しい選手名を入力"
                          className="w-full h-10 rounded-xl border border-border bg-card px-3 text-base sm:text-xs font-black text-foreground outline-none focus:border-primary"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="border-t border-border bg-muted/40 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsSubModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-border bg-card text-xs font-black text-foreground cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleCommitSubstitution}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black cursor-pointer active:scale-95"
                >
                  反映する
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* モーダル5: 直前の打席への走塁追記モーダル（暴投・盗塁・飛び出し封殺等） */}
      {mounted &&
        isFollowUpModalOpen &&
        lastBatterEntry &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            onClick={() => setIsFollowUpModalOpen(false)}
          >
            <div
              className="w-full sm:max-w-md max-h-[88dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 px-4 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Footprints className="w-4 h-4 text-teal-400" />
                  <h3 className="text-sm font-black text-white">
                    直前の打席行に走塁プレーを追記
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFollowUpModalOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto space-y-3.5 flex-1">
                <div className="rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs font-bold text-foreground">
                  対象:{" "}
                  {formatSinglePlayEntryLine(
                    lastBatterEntry,
                    isMyAttack,
                    doc.showSurnameOnly
                  )}
                </div>

                <div className="space-y-1.5">
                  <span className="block text-[11px] font-black text-muted-foreground">
                    1タップ定型プリセット（走塁ボタンの長押しスライドでも即記録できます）:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      {
                        label: "ダブルスチール（重盗）",
                        mode: "chained" as const,
                        text: "重盗",
                        outDelta: 0,
                        advanceAll: true,
                      },
                      {
                        label: "二盗成功",
                        mode: "chained" as const,
                        text: "二盗",
                        outDelta: 0,
                        advanceAll: true,
                      },
                      {
                        label: "三盗成功",
                        mode: "chained" as const,
                        text: "三盗",
                        outDelta: 0,
                        advanceAll: true,
                      },
                      {
                        label: "本盗（ホームスチール）",
                        mode: "chained" as const,
                        text: "本盗",
                        outDelta: 0,
                        advanceAll: true,
                      },
                      {
                        label: "中暴投（進塁）",
                        mode: "inline" as const,
                        text: "中暴投",
                        outDelta: 0,
                        advanceAll: true,
                      },
                      {
                        label: "暴投（進塁）",
                        mode: "chained" as const,
                        text: "暴投進塁",
                        outDelta: 0,
                        advanceAll: true,
                      },
                      {
                        label: "捕逸（進塁）",
                        mode: "chained" as const,
                        text: "捕逸進塁",
                        outDelta: 0,
                        advanceAll: true,
                      },
                      {
                        label: "ボーク（進塁）",
                        mode: "chained" as const,
                        text: "ボーク進塁",
                        outDelta: 0,
                        advanceAll: true,
                      },
                      {
                        label: "二塁走者飛び出し封殺",
                        mode: "chained" as const,
                        text: "二塁走者飛び出し封殺",
                        outDelta: 1,
                        advanceAll: false,
                        clearOutBase: 2 as LiveReportBaseNum,
                      },
                      {
                        label: "一塁走者飛び出し封殺",
                        mode: "chained" as const,
                        text: "一塁走者飛び出し封殺",
                        outDelta: 1,
                        advanceAll: false,
                        clearOutBase: 1 as LiveReportBaseNum,
                      },
                      {
                        label: "盗塁死",
                        mode: "chained" as const,
                        text: "盗塁死",
                        outDelta: 1,
                        advanceAll: false,
                        clearOutBase: 1 as LiveReportBaseNum,
                      },
                      {
                        label: "牽制死",
                        mode: "chained" as const,
                        text: "牽制死",
                        outDelta: 1,
                        advanceAll: false,
                        clearOutBase: 1 as LiveReportBaseNum,
                      },
                    ].map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => applyFollowUpPreset(p)}
                        className="px-2.5 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-[11px] font-black text-foreground cursor-pointer"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5 bg-muted p-1 rounded-xl border border-border">
                  <button
                    type="button"
                    onClick={() => setFollowUpMode("chained")}
                    className={cn(
                      "py-1.5 rounded-lg text-[11px] font-black cursor-pointer",
                      followUpMode === "chained"
                        ? "bg-card text-foreground shadow-2xs"
                        : "text-muted-foreground"
                    )}
                  >
                    後ろに連結（⚫️2塁　〇〇　⚫️⚫️⚫️）
                  </button>
                  <button
                    type="button"
                    onClick={() => setFollowUpMode("inline")}
                    className={cn(
                      "py-1.5 rounded-lg text-[11px] font-black cursor-pointer",
                      followUpMode === "inline"
                        ? "bg-card text-foreground shadow-2xs"
                        : "text-muted-foreground"
                    )}
                  >
                    結果に直結（中前ヒット中暴投　⚫️2塁）
                  </button>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-black text-muted-foreground">
                    追記テキスト
                  </label>
                  <input
                    type="text"
                    value={followUpText}
                    onChange={(e) => setFollowUpText(e.target.value)}
                    placeholder="例: 二塁走者飛び出し封殺 / 盗塁"
                    className="w-full h-10 rounded-xl border border-border bg-card px-3 text-base sm:text-xs font-black text-foreground outline-none focus:border-primary"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] font-black text-muted-foreground">
                      後アウト:
                    </span>
                    {[0, 1, 2, 3].map((o) => (
                      <button
                        key={o}
                        type="button"
                        onClick={() => setFollowUpOuts(o)}
                        className={cn(
                          "w-7 h-7 rounded-lg border text-xs font-black cursor-pointer",
                          followUpOuts === o
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-card text-foreground border-border"
                        )}
                      >
                        {o}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="text-[11px] font-black text-muted-foreground">
                      後走者:
                    </span>
                    {([1, 2, 3] as const).map((b) => {
                      const active = followUpRunners.includes(b);
                      return (
                        <button
                          key={b}
                          type="button"
                          disabled={followUpOuts >= 3}
                          onClick={() =>
                            setFollowUpRunners(
                              active
                                ? followUpRunners.filter((x) => x !== b)
                                : normalizeRunnersList([...followUpRunners, b])
                            )
                          }
                          className={cn(
                            "px-2 h-7 rounded-lg border text-[11px] font-black cursor-pointer disabled:opacity-40",
                            active
                              ? "bg-amber-400 text-slate-950 border-amber-500"
                              : "bg-card text-foreground border-border"
                          )}
                        >
                          {b}塁
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="text-[11px] font-black text-muted-foreground">
                      追加得点:
                    </span>
                    {[0, 1, 2].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setFollowUpAddRuns(r)}
                        className={cn(
                          "w-7 h-7 rounded-lg border text-xs font-black cursor-pointer",
                          followUpAddRuns === r
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card text-foreground border-border"
                        )}
                      >
                        +{r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-border bg-muted/40 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsFollowUpModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-border bg-card text-xs font-black text-foreground cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={!followUpText.trim()}
                  onClick={handleCommitFollowUp}
                  className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-xs font-black cursor-pointer active:scale-95"
                >
                  この打席行に追記する
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
