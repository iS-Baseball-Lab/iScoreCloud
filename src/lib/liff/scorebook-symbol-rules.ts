// filepath: src/lib/liff/scorebook-symbol-rules.ts
import { normalizeLegacyForceOutAtBat } from "@/lib/liff/scorebook-fielding";
import type {
  AdvanceMethodCode,
  CanonicalAtBatResult,
  CanonicalPitchResult,
  ScorebookV2AtBat,
} from "@/types/scorebook-v2";

export type ScorebookNotationMode = "standard" | "team";

/**
 * スコア表示における自チーム名の表記モード
 * ⚠️ 重要: 内部DBスキーマでは `organizations` = 「チーム名」、`teams` = 「構成名（編成名）」であるため絶対に逆転させないこと。
 * - `"organization"` (デフォルト): チーム名を使用 (`organizations.name` / `orgName`)
 * - `"squad"`: 構成名を使用 (`teams.name` / `teamName`)
 */
export type ScoreTeamNameDisplayMode = "organization" | "squad";

export type CellGridStyle = "quadrant" | "quadrant_bso_grid" | "simple_diamond";
export type LineupColumnStyle = "classic_three_row" | "compact_order_first";
export type OutMarkStyle = "roman" | "circled";
export type StrikeoutMarkStyle =
  | "k_called_reverse"
  | "k_called_so_swing"
  | "k_called_circle"
  | "k_only"
  | "so";
export type WalkHbpMarkStyle = "b_db" | "bb_hbp" | "kanji";
export type HitLineStyle =
  | "red_edge_infield_arc"
  | "quadrant_slash_hr_diamond"
  | "red_plain"
  | "red_slash"
  | "parallel_bars"
  | "mono_bold";
export type RunnerLineStyle = "dotted_only" | "solid_trace";
export type RunnerOutLineStyle = "dotted_only" | "quadrant_arrow" | "t_stop";
export type ForceOutMarkStyle = "standard_to" | "base_letter_abch";
export type RunMarkStyle =
  | "red_dot"
  | "earned_filled_unearned_open"
  | "double_circle"
  | "kanji_toku";
export type RbiMarkStyle = "hidden" | "red_dots" | "black_dots";
export type PitchMarkStyle =
  | "waseda_symbols"
  | "cross_swing"
  | "cross_dot_swing"
  | "slash_swing"
  | "numbered_bs";
export type PickoffMarkStyle =
  | "chevron_arrow"
  | "full_arrow"
  | "kanji_num"
  | "hidden";
export type BuntMarkStyle =
  | "square_sac_triangle_sf_bh"
  | "square_all_bh"
  | "square_sac"
  | "diamond_sac"
  | "b_prefix";
export type BuntPitchMarkStyle =
  | "v_dot_circle_dot"
  | "filled_triangle"
  | "inv_triangle_diamond"
  | "same_as_normal";
export type FlyLinerMarkStyle =
  | "umbrella_f_prefix_ground_arc"
  | "umbrella"
  | "paren"
  | "alphabet";
export type PinchHitterMarkStyle =
  | "red_wave_name"
  | "waseda_diamond_pr"
  | "left_wave_only"
  | "cell_badge"
  | "lineup_only";
export type DoublePlayMarkStyle =
  | "bracket_dp"
  | "dp_only"
  | "wavy_link"
  | "chain_only";
export type AdvanceErrorMarkStyle = "senior_chart" | "english" | "kanji";
export type DrivingOrderMarkStyle =
  | "paren"
  | "circled"
  | "home_circled_other_paren";
export type PositionLabelStyle = "kanji" | "number" | "english";
export type InningEndMarkStyle =
  | "red_double_slash"
  | "black_double_slash"
  | "single_slash"
  | "bottom_double_line"
  | "none";

export interface ScorebookSymbolRules {
  cellStyle: CellGridStyle;
  lineupStyle: LineupColumnStyle;
  outMark: OutMarkStyle;
  strikeout: StrikeoutMarkStyle;
  walkHbp: WalkHbpMarkStyle;
  hitLine: HitLineStyle;
  runnerLine: RunnerLineStyle;
  runnerOutLine: RunnerOutLineStyle;
  forceOutMark: ForceOutMarkStyle;
  runMark: RunMarkStyle;
  drivingOrderMark: DrivingOrderMarkStyle;
  rbiMark: RbiMarkStyle;
  pitchMark: PitchMarkStyle;
  buntPitchMark: BuntPitchMarkStyle;
  pickoffMark: PickoffMarkStyle;
  buntMark: BuntMarkStyle;
  pinchHitterMark: PinchHitterMarkStyle;
  doublePlayMark: DoublePlayMarkStyle;
  flyLiner: FlyLinerMarkStyle;
  advanceError: AdvanceErrorMarkStyle;
  positionLabel: PositionLabelStyle;
  inningEndMark: InningEndMarkStyle;
  scoreTeamNameMode?: ScoreTeamNameDisplayMode;
  practiceMatchLabel?: string;
  customNote?: string;
}

export const DEFAULT_PRACTICE_MATCH_LABEL = "練習試合";

export const PRACTICE_MATCH_LABEL_PRESETS = [
  "練習試合",
  "OP戦",
  "オープン戦",
  "親善試合",
  "TRM",
] as const;

export function sanitizePracticeMatchLabel(
  raw: unknown,
  fallback = DEFAULT_PRACTICE_MATCH_LABEL
): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim().slice(0, 16);
  return trimmed.length > 0 ? trimmed : fallback;
}

export function isGenericMatchTournamentName(
  rawName: string | null | undefined,
  customPracticeLabel?: string | null
): boolean {
  const trimmed = (rawName || "").trim();
  if (!trimmed) return true;
  const genericSet = new Set([
    "公式戦",
    "交流戦",
    "練習試合",
    "OP戦",
    "ＯＰ戦",
    "オープン戦",
    "親善試合",
    "練習戦",
    "TRM",
  ]);
  if (customPracticeLabel && customPracticeLabel.trim()) {
    genericSet.add(customPracticeLabel.trim());
  }
  return genericSet.has(trimmed);
}

/**
 * 標準（早稲田・成美堂出版式）のスコアブック記号ルール
 */
export const STANDARD_SCOREBOOK_SYMBOL_RULES: ScorebookSymbolRules = {
  cellStyle: "quadrant",
  lineupStyle: "classic_three_row",
  outMark: "roman",
  strikeout: "k_called_reverse",
  walkHbp: "b_db",
  hitLine: "red_slash",
  runnerLine: "solid_trace",
  runnerOutLine: "t_stop",
  forceOutMark: "standard_to",
  runMark: "red_dot",
  drivingOrderMark: "paren",
  rbiMark: "red_dots",
  pitchMark: "waseda_symbols",
  buntPitchMark: "filled_triangle",
  pickoffMark: "chevron_arrow",
  buntMark: "diamond_sac",
  pinchHitterMark: "waseda_diamond_pr",
  doublePlayMark: "wavy_link",
  flyLiner: "umbrella",
  advanceError: "english",
  positionLabel: "number",
  inningEndMark: "black_double_slash",
  scoreTeamNameMode: "organization",
  practiceMatchLabel: DEFAULT_PRACTICE_MATCH_LABEL,
  customNote: "",
};

/**
 * シニア・チーム早見表準拠テンプレート（中学硬式・現場早見表フル対応）
 */
export const SENIOR_CHART_SCOREBOOK_SYMBOL_RULES: ScorebookSymbolRules = {
  cellStyle: "quadrant",
  lineupStyle: "classic_three_row",
  outMark: "roman",
  strikeout: "k_called_so_swing",
  walkHbp: "b_db",
  hitLine: "red_edge_infield_arc",
  runnerLine: "dotted_only",
  runnerOutLine: "dotted_only",
  forceOutMark: "base_letter_abch",
  runMark: "earned_filled_unearned_open",
  drivingOrderMark: "paren",
  rbiMark: "hidden",
  pitchMark: "cross_swing",
  buntPitchMark: "v_dot_circle_dot",
  pickoffMark: "chevron_arrow",
  buntMark: "square_sac_triangle_sf_bh",
  pinchHitterMark: "red_wave_name",
  doublePlayMark: "bracket_dp",
  flyLiner: "umbrella_f_prefix_ground_arc",
  advanceError: "senior_chart",
  positionLabel: "number",
  inningEndMark: "red_double_slash",
  scoreTeamNameMode: "organization",
  practiceMatchLabel: DEFAULT_PRACTICE_MATCH_LABEL,
  customNote: "",
};

/**
 * チーム記号ルール未設定時の初期テンプレート（シニア・早見表準拠式ベース）
 * ※ ユーザーがスコア設定でいつでも自由に変更可能
 */
export const DEFAULT_TEAM_SCOREBOOK_SYMBOL_RULES: ScorebookSymbolRules = {
  ...SENIOR_CHART_SCOREBOOK_SYMBOL_RULES,
};

export interface ScorebookSymbolPreset {
  id: string;
  label: string;
  description: string;
  rules: ScorebookSymbolRules;
}

export const SCOREBOOK_SYMBOL_PRESETS: readonly ScorebookSymbolPreset[] = [
  {
    id: "senior_chart_style",
    label: "詳細記号・点線タイプ",
    description:
      "ⅠⅡⅢ・見逃K/空振SO・□犠打/△犠飛・内野安打赤弧・1A/6B・赤波線",
    rules: {
      ...SENIOR_CHART_SCOREBOOK_SYMBOL_RULES,
    },
  },
  {
    id: "waseda_standard",
    label: "実線なぞり・ひし形タイプ",
    description: "ⅠⅡⅢ・見逃反転K・●空振り・◇犠打・進塁黒実線・T字止め線",
    rules: {
      ...STANDARD_SCOREBOOK_SYMBOL_RULES,
      pickoffMark: "full_arrow",
      positionLabel: "number",
    },
  },
  {
    id: "youth_senior",
    label: "丸数字・赤斜線タイプ",
    description: "①②③・丸囲みK・右下赤斜線／・×空振り・□バント・漢字略号",
    rules: {
      cellStyle: "quadrant",
      lineupStyle: "classic_three_row",
      outMark: "circled",
      strikeout: "k_called_circle",
      walkHbp: "b_db",
      hitLine: "quadrant_slash_hr_diamond",
      runnerLine: "dotted_only",
      runnerOutLine: "dotted_only",
      forceOutMark: "standard_to",
      runMark: "red_dot",
      drivingOrderMark: "circled",
      rbiMark: "hidden",
      pitchMark: "cross_swing",
      buntPitchMark: "v_dot_circle_dot",
      pickoffMark: "chevron_arrow",
      buntMark: "square_all_bh",
      pinchHitterMark: "red_wave_name",
      doublePlayMark: "bracket_dp",
      flyLiner: "paren",
      advanceError: "kanji",
      positionLabel: "number",
      inningEndMark: "black_double_slash",
      customNote: "",
    },
  },
  {
    id: "numbered_modern",
    label: "球数番号・英字タイプ",
    description: "S/B球数番号・①②③・BB/HBP・B添字バント・8F/8L表記",
    rules: {
      cellStyle: "quadrant",
      lineupStyle: "compact_order_first",
      outMark: "circled",
      strikeout: "k_called_reverse",
      walkHbp: "bb_hbp",
      hitLine: "parallel_bars",
      runnerLine: "solid_trace",
      runnerOutLine: "t_stop",
      forceOutMark: "standard_to",
      runMark: "double_circle",
      drivingOrderMark: "paren",
      rbiMark: "red_dots",
      pitchMark: "numbered_bs",
      buntPitchMark: "inv_triangle_diamond",
      pickoffMark: "kanji_num",
      buntMark: "b_prefix",
      pinchHitterMark: "cell_badge",
      doublePlayMark: "dp_only",
      flyLiner: "alphabet",
      advanceError: "english",
      positionLabel: "english",
      inningEndMark: "single_slash",
      customNote: "",
    },
  },
  {
    id: "mono_print",
    label: "白黒コピーくっきりタイプ",
    description: "黒太線ヒット・丸得マーク・黒打点・モノクロ印刷でも判別容易",
    rules: {
      cellStyle: "quadrant",
      lineupStyle: "classic_three_row",
      outMark: "roman",
      strikeout: "k_called_circle",
      walkHbp: "kanji",
      hitLine: "mono_bold",
      runnerLine: "solid_trace",
      runnerOutLine: "t_stop",
      forceOutMark: "standard_to",
      runMark: "kanji_toku",
      drivingOrderMark: "paren",
      rbiMark: "black_dots",
      pitchMark: "slash_swing",
      buntPitchMark: "filled_triangle",
      pickoffMark: "chevron_arrow",
      buntMark: "square_sac",
      pinchHitterMark: "left_wave_only",
      doublePlayMark: "bracket_dp",
      flyLiner: "umbrella",
      advanceError: "kanji",
      positionLabel: "kanji",
      inningEndMark: "black_double_slash",
      customNote: "",
    },
  },
];

export interface SymbolRuleFieldOption<T extends string> {
  value: T;
  label: string;
  sample: string;
}

export const SYMBOL_RULE_FIELD_CONFIGS = {
  cellStyle: {
    title: "1打席マスの罫線デザイン",
    options: [
      {
        value: "quadrant",
        label: "十字点線・4分割",
        sample: "4象限点線・BSO欄は枠線なし",
      },
      {
        value: "quadrant_bso_grid",
        label: "十字点線＋BSO横罫線",
        sample: "4象限点線・BSO欄に横区切り線",
      },
      {
        value: "simple_diamond",
        label: "大ダイヤ単独（十字なし）",
        sample: "中央ダイヤのみ・ベース小四角付き",
      },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<CellGridStyle>>,
  },
  lineupStyle: {
    title: "メンバー欄（守備・打順・氏名・背番）の様式",
    options: [
      {
        value: "classic_three_row",
        label: "3段フル様式（先発＋交代2段）",
        sample: "守備｜打順(1/11/21)｜左○｜氏名｜背番",
      },
      {
        value: "compact_order_first",
        label: "1段シンプル様式（打順先頭）",
        sample: "順｜守備｜背番｜選手名",
      },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<LineupColumnStyle>>,
  },
  outMark: {
    title: "アウトカウント表記",
    options: [
      { value: "roman", label: "ローマ数字（Ⅰ・Ⅱ・Ⅲ）", sample: "Ⅰ・Ⅱ・Ⅲ" },
      { value: "circled", label: "丸数字（①・②・③）", sample: "①・②・③" },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<OutMarkStyle>>,
  },
  strikeout: {
    title: "三振（見逃し / 空振り / 振り逃げ）",
    options: [
      {
        value: "k_called_so_swing",
        label: "見逃K・空振SO・振逃は反転K",
        sample: "見逃 K / 空振 SO / 振逃 反転K",
      },
      {
        value: "k_called_reverse",
        label: "空振K・見逃は反転K",
        sample: "空振 K / 見逃 反転K",
      },
      {
        value: "k_called_circle",
        label: "空振K・見逃は丸囲みⓀ",
        sample: "空振 K / 見逃 Ⓚ",
      },
      { value: "k_only", label: "すべて K に統一", sample: "見逃・空振とも K" },
      { value: "so", label: "すべて SO に統一", sample: "見逃・空振とも SO" },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<StrikeoutMarkStyle>>,
  },
  walkHbp: {
    title: "四球・死球・敬遠",
    options: [
      { value: "b_db", label: "B / DB 表記", sample: "四球 B・死球 DB・敬遠 IB" },
      {
        value: "bb_hbp",
        label: "BB / HBP 表記",
        sample: "四球 BB・死球 HBP・敬遠 IBB",
      },
      { value: "kanji", label: "漢字1文字（四 / 死 / 敬）", sample: "四・死・敬" },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<WalkHbpMarkStyle>>,
  },
  hitLine: {
    title: "安打の赤線・長打・内野安打パターン",
    options: [
      {
        value: "red_edge_infield_arc",
        label: "到達塁まで赤実線＋内野安打は赤弧",
        sample: "1〜4辺赤線 / 内野安打(BH5・6)右下赤弧囲み",
      },
      {
        value: "quadrant_slash_hr_diamond",
        label: "右下に赤斜線（／）＋本塁打1周赤",
        sample: "右下 ／・／／・／／／ / HRダイヤ赤囲み",
      },
      {
        value: "red_plain",
        label: "到達塁まで赤実線のみ",
        sample: "到達塁まで赤線（弧・刻み線なし）",
      },
      {
        value: "red_slash",
        label: "到達塁まで赤実線＋1塁線に直交刻み",
        sample: "赤進塁線＋1塁線上に1〜4本の刻み線",
      },
      {
        value: "parallel_bars",
        label: "1塁線を平行重線（単1・二2・三3本）",
        sample: "単1本・二2重・三3重・HR二重枠",
      },
      {
        value: "mono_bold",
        label: "黒太線＋直交刻み（白黒印刷向き）",
        sample: "赤を使わず黒太線＋直交刻みで表現",
      },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<HitLineStyle>>,
  },
  runnerLine: {
    title: "四死球・進塁時のひし形ライン",
    options: [
      {
        value: "dotted_only",
        label: "なぞらない（点線のまま・記号のみ）",
        sample: "ひし形は点線維持・進塁記号のみ記載",
      },
      {
        value: "solid_trace",
        label: "進んだ塁間を黒実線でなぞる",
        sample: "四死球や進塁した辺を黒実線で結ぶ",
      },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<RunnerLineStyle>>,
  },
  runnerOutLine: {
    title: "走塁死・封殺時のひし形ライン",
    options: [
      {
        value: "dotted_only",
        label: "線なし（点線のまま・記号のみ）",
        sample: "ひし形は点線維持・アウト記号のみ記載",
      },
      {
        value: "quadrant_arrow",
        label: "ひし形外側に進行矢印＋記号",
        sample: "点線の外側に矢印とアウト記号を記載",
      },
      {
        value: "t_stop",
        label: "塁間途中でT字ストップ線（━━┫）",
        sample: "塁間の途中で実線を止め垂直線を描く",
      },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<RunnerOutLineStyle>>,
  },
  forceOutMark: {
    title: "封殺（フォースアウト）・タッチアウト表記",
    options: [
      {
        value: "base_letter_abch",
        label: "封殺は塁記号（A/B/C/H）・触球はTO",
        sample: "1A・6B・5C・2H / タッチアウト 3TO",
      },
      {
        value: "standard_to",
        label: "T.O / CS 表記（塁アルファベットなし）",
        sample: "走塁死 T.O・盗塁死 CS（A/B/C/H なし）",
      },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<ForceOutMarkStyle>>,
  },
  runMark: {
    title: "本塁生還（得点・自責 / 非自責）マーク",
    options: [
      {
        value: "earned_filled_unearned_open",
        label: "自責＝塗り丸 ● ／ 非自責＝白丸 ○",
        sample: "自責点 ● と 非自責点 ○ を使い分け",
      },
      {
        value: "red_dot",
        label: "すべて塗り赤丸 ● に統一",
        sample: "自責・非自責を区別せず中央 ●",
      },
      { value: "double_circle", label: "二重丸（◎）", sample: "中央に二重丸 ◎" },
      {
        value: "kanji_toku",
        label: "丸囲み「得」マーク",
        sample: "中央に丸得マーク",
      },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<RunMarkStyle>>,
  },
  drivingOrderMark: {
    title: "本塁生還・進塁時の打順番号表記（(1) / ①）",
    options: [
      {
        value: "paren",
        label: "カッコ数字（(1)・(2)・(3)）",
        sample: "本塁生還・進塁とも (1)・(2)・(3)",
      },
      {
        value: "circled",
        label: "丸数字（①・②・③）",
        sample: "本塁生還・進塁とも ①・②・③",
      },
      {
        value: "home_circled_other_paren",
        label: "本塁生還は丸数字（①②③）・進塁は(1)(2)",
        sample: "3塁→本塁生還は ①②③ ／ 2・3塁進塁は (1)(2)",
      },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<DrivingOrderMarkStyle>>,
  },
  rbiMark: {
    title: "打点（RBI）マーク表記",
    options: [
      {
        value: "hidden",
        label: "記載しない（なし）",
        sample: "生還走者マスの (打順) 等で判別",
      },
      {
        value: "red_dots",
        label: "マス右上に赤ドット（●）",
        sample: "打点数分の赤点を右上に打つ",
      },
      {
        value: "black_dots",
        label: "マス右上に黒ドット（・）",
        sample: "打点数分の黒点を右上に打つ",
      },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<RbiMarkStyle>>,
  },
  pitchMark: {
    title: "投球（BSO）記録記号",
    options: [
      {
        value: "cross_swing",
        label: "見逃○・空振×・ボール横棒（ー）",
        sample: "○見逃  ×空振  ーB  △ファウル",
      },
      {
        value: "waseda_symbols",
        label: "見逃○・空振●（黒丸）・ボール横棒（ー）",
        sample: "○見逃  ●空振  ーB  △ファウル",
      },
      {
        value: "cross_dot_swing",
        label: "見逃○・空振×・ボール黒点（・）",
        sample: "○見逃  ×空振  ・B  △ファウル",
      },
      {
        value: "slash_swing",
        label: "見逃○・空振斜線（／）・ボール黒点（・）",
        sample: "○見逃  ／空振  ・B  △ファウル",
      },
      {
        value: "numbered_bs",
        label: "S / B 枠に球数番号（1, 2, 3…）",
        sample: "投球順の数字をS欄・B欄に記入",
      },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<PitchMarkStyle>>,
  },
  buntPitchMark: {
    title: "投球（BSO）欄のバント記号（ファウル / 空振り）",
    options: [
      {
        value: "v_dot_circle_dot",
        label: "ファウル V̇（点付V）・空振 ⊙（丸に点）",
        sample: "バントF＝V̇ ／ バント空振＝⊙",
      },
      {
        value: "filled_triangle",
        label: "ファウル ▲（黒三角）・空振は通常記号",
        sample: "バントF＝▲ ／ バント空振＝×または●",
      },
      {
        value: "inv_triangle_diamond",
        label: "ファウル ▽（逆三角）・空振 ◇（ひし形）",
        sample: "バントF＝▽ ／ バント空振＝◇",
      },
      {
        value: "same_as_normal",
        label: "通常投球記号と同じ（区別しない）",
        sample: "バントF＝△ ／ バント空振＝通常空振",
      },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<BuntPitchMarkStyle>>,
  },
  pickoffMark: {
    title: "牽制球（1塁 / 2塁 / 3塁）表記",
    options: [
      {
        value: "chevron_arrow",
        label: "矢先記号のみ（＞・∧・＜）",
        sample: "1塁 ＞ ／ 2塁 ∧ ／ 3塁 ＜",
      },
      {
        value: "full_arrow",
        label: "軸付き矢印（→・↑・←）",
        sample: "1塁 → ／ 2塁 ↑ ／ 3塁 ←",
      },
      {
        value: "kanji_num",
        label: "塁番号＋牽（1牽・2牽・3牽）",
        sample: "1牽・2牽・3牽",
      },
      {
        value: "hidden",
        label: "BSO欄に記載しない",
        sample: "牽制球は省略し投球記号のみ表示",
      },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<PickoffMarkStyle>>,
  },
  buntMark: {
    title: "犠打・犠飛・バント打球表記",
    options: [
      {
        value: "square_sac_triangle_sf_bh",
        label: "□犠打 ＋ △犠飛 ＋ BH安打",
        sample: "犠打 □1-3 / 犠飛 △8 / 安打 BH5",
      },
      {
        value: "square_all_bh",
        label: "□全バント四角囲み ＋ BH安打",
        sample: "犠打・凡打とも □5-3 / 安打 BH5",
      },
      {
        value: "square_sac",
        label: "□犠打のみ四角囲み ＋ BH安打",
        sample: "犠打 □1-3 / 凡打 5-3 / 安打 BH5",
      },
      {
        value: "diamond_sac",
        label: "◇ひし形囲み（犠打・犠飛とも）",
        sample: "犠打 ◇1-3 / 犠飛 ◇︵8",
      },
      {
        value: "b_prefix",
        label: "◇犠打 ＋ 凡打はB添字・BH安打",
        sample: "犠打 ◇1-3 / 凡打 B5-3 / 安打 BH5",
      },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<BuntMarkStyle>>,
  },
  pinchHitterMark: {
    title: "選手交代（代打・代走・守備・継投）の表記",
    options: [
      {
        value: "red_wave_name",
        label: "赤縦波線 ＋ 縦書き氏名",
        sample: "代打＝左罫線・代走/守備＝右内・継投＝上辺波線",
      },
      {
        value: "waseda_diamond_pr",
        label: "赤波線 ＋ 代走は塁線上に波線",
        sample: "代打/守備＝縦赤波線・代走＝出塁辺に赤波線",
      },
      {
        value: "left_wave_only",
        label: "赤縦波線のみ（氏名はメンバー欄）",
        sample: "マス境界に赤波線のみ・マス内氏名なし",
      },
      {
        value: "cell_badge",
        label: "赤縦波線 ＋ PH / PR バッジ",
        sample: "赤波線の横に PH・PR・交 バッジを表示",
      },
      {
        value: "lineup_only",
        label: "メンバー欄のみに記載",
        sample: "イニングマスには波線・名前を書かない",
      },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<PinchHitterMarkStyle>>,
  },
  doublePlayMark: {
    title: "併殺打（ダブルプレー）の表記",
    options: [
      {
        value: "bracket_dp",
        label: "縦2マス右内「 ] 」括弧 ＋ 間にDP",
        sample: "上部〜下部を ] で括り1・2マス間にDP",
      },
      {
        value: "dp_only",
        label: "打者マスに送球番号 ＋ DP（括弧なし）",
        sample: "6-4-3 DP（縦括弧なし）",
      },
      {
        value: "wavy_link",
        label: "縦2マス右内 波線括り ＋ 間にDP",
        sample: "上部〜下部を波線で括り1・2マス間にDP",
      },
      {
        value: "chain_only",
        label: "送球番号のみ（DP・括弧なし）",
        sample: "6-4-3 のみ記載",
      },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<DoublePlayMarkStyle>>,
  },
  flyLiner: {
    title: "フライ・邪飛・ライナー・ゴロ表記",
    options: [
      {
        value: "umbrella_f_prefix_ground_arc",
        label: "飛球︵7・邪飛︵F7・ゴロ下弧6⏝",
        sample: "飛 ︵7 / 邪 ︵F7 / ゴロ 6⏝ / 直 ￣6",
      },
      {
        value: "umbrella",
        label: "飛球︵8・邪飛︵8F・ゴロ番号のみ",
        sample: "飛 ︵8 / 邪 ︵8F / ゴロ 6-3 / 直 ￣6",
      },
      {
        value: "paren",
        label: "カッコ囲み式（(8) / [6]）",
        sample: "飛 (8) / ライナー [6]",
      },
      {
        value: "alphabet",
        label: "英字添字式（8F / 6L）",
        sample: "飛 8F / 邪 7FF / ライナー 6L",
      },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<FlyLinerMarkStyle>>,
  },
  advanceError: {
    title: "失策・野選・盗塁・妨害などの略号",
    options: [
      {
        value: "senior_chart",
        label: "捕球E6 / 送球6E・4FC・盗塁S′",
        sample: "捕E6・送6E・4FC・2IF・OB6・IP・S′/DS",
      },
      {
        value: "english",
        label: "英字シンプル（6E・FC・盗塁S）",
        sample: "6E・FC・S・WP・PB・INT・OBS",
      },
      {
        value: "kanji",
        label: "漢字略号（6失・野・盗）",
        sample: "6失・野・盗・暴・捕・打妨・妨",
      },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<AdvanceErrorMarkStyle>>,
  },
  positionLabel: {
    title: "メンバー欄の守備位置表記",
    options: [
      { value: "number", label: "守備番号（1〜9）", sample: "1・2・3・6・8" },
      { value: "kanji", label: "漢字1文字（投〜右）", sample: "投・捕・一・遊・中" },
      { value: "english", label: "英字略称（P〜RF）", sample: "P・C・1B・SS・CF" },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<PositionLabelStyle>>,
  },
  inningEndMark: {
    title: "イニング終了（3アウトチェンジ）の記載方法",
    options: [
      {
        value: "red_double_slash",
        label: "マス右下角に赤の二重斜線（赤 ／／）",
        sample: "最終打者マスの右下角に赤2本線",
      },
      {
        value: "black_double_slash",
        label: "マス右下角に黒の二重斜線（黒 ／／）",
        sample: "最終打者マスの右下角に黒2本線",
      },
      {
        value: "single_slash",
        label: "マス右下角に黒の一重斜線（／）",
        sample: "最終打者マスの右下角に黒1本線",
      },
      {
        value: "bottom_double_line",
        label: "マス下辺に二重横線（＝＝）",
        sample: "最終打者マスの下枠に沿って二重横線",
      },
      {
        value: "none",
        label: "記載しない（アウト数字のみ）",
        sample: "区切り線を引かず Ⅲ / ③ のみ記載",
      },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<InningEndMarkStyle>>,
  },
} as const;

const LEGACY_GLOBAL_TEAM_RULES_KEY = "iscore_team_scorebook_symbol_rules_v1";
const TEAM_RULES_STORAGE_PREFIX = "iscore_team_scorebook_symbol_rules_v2:";
const LOCAL_NOTATION_MODE_KEY = "iscore_scorebook_notation_mode_v1";

function buildTeamRulesStorageKey(teamId?: string | null): string | null {
  const clean = (teamId || "").trim();
  if (!clean) return null;
  return `${TEAM_RULES_STORAGE_PREFIX}${clean}`;
}

/**
 * AI自動読取時に早見表タイトルから誤生成された定型文（例:「〇〇スコア記号早見表に基づく表記ルール。」）を除外し、
 * ユーザーが実際に設定した独自補足ルールのみを保持する
 */
function sanitizeCustomNote(rawNote: unknown, fallbackNote = ""): string {
  const candidate =
    typeof rawNote === "string"
      ? rawNote.trim().slice(0, 160)
      : fallbackNote.trim().slice(0, 160);
  if (!candidate) return "";
  if (/早見表に基づく(表記)?ルール[。.]?$/u.test(candidate)) {
    return "";
  }
  return candidate;
}

function isOneOf<T extends string>(
  val: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  return typeof val === "string" && (allowed as readonly string[]).includes(val)
    ? (val as T)
    : fallback;
}

export function sanitizeScorebookSymbolRules(
  raw: unknown,
  fallback: ScorebookSymbolRules = STANDARD_SCOREBOOK_SYMBOL_RULES
): ScorebookSymbolRules {
  if (!raw || typeof raw !== "object") {
    return {
      ...fallback,
      scoreTeamNameMode: fallback.scoreTeamNameMode ?? "organization",
      practiceMatchLabel: sanitizePracticeMatchLabel(
        fallback.practiceMatchLabel,
        DEFAULT_PRACTICE_MATCH_LABEL
      ),
      customNote: sanitizeCustomNote(fallback.customNote),
    };
  }
  const obj = raw as Record<string, unknown>;
  const note = sanitizeCustomNote(obj.customNote, fallback.customNote || "");

  return {
    cellStyle: isOneOf(
      obj.cellStyle,
      ["quadrant", "quadrant_bso_grid", "simple_diamond"],
      fallback.cellStyle
    ),
    lineupStyle: isOneOf(
      obj.lineupStyle,
      ["classic_three_row", "compact_order_first"],
      fallback.lineupStyle
    ),
    outMark: isOneOf(obj.outMark, ["roman", "circled"], fallback.outMark),
    strikeout: isOneOf(
      obj.strikeout,
      ["k_called_so_swing", "k_called_reverse", "k_called_circle", "k_only", "so"],
      fallback.strikeout
    ),
    walkHbp: isOneOf(obj.walkHbp, ["b_db", "bb_hbp", "kanji"], fallback.walkHbp),
    hitLine: isOneOf(
      obj.hitLine,
      [
        "red_edge_infield_arc",
        "quadrant_slash_hr_diamond",
        "red_plain",
        "red_slash",
        "parallel_bars",
        "mono_bold",
      ],
      fallback.hitLine
    ),
    runnerLine: isOneOf(
      obj.runnerLine,
      ["dotted_only", "solid_trace"],
      fallback.runnerLine
    ),
    runnerOutLine: isOneOf(
      obj.runnerOutLine,
      ["dotted_only", "quadrant_arrow", "t_stop"],
      fallback.runnerOutLine
    ),
    forceOutMark: isOneOf(
      obj.forceOutMark,
      ["base_letter_abch", "standard_to"],
      fallback.forceOutMark
    ),
    runMark: isOneOf(
      obj.runMark,
      ["earned_filled_unearned_open", "red_dot", "double_circle", "kanji_toku"],
      fallback.runMark
    ),
    drivingOrderMark: isOneOf(
      obj.drivingOrderMark,
      ["paren", "circled", "home_circled_other_paren"],
      fallback.drivingOrderMark ?? "paren"
    ),
    rbiMark: isOneOf(
      obj.rbiMark,
      ["hidden", "red_dots", "black_dots"],
      fallback.rbiMark
    ),
    pitchMark: isOneOf(
      obj.pitchMark,
      [
        "waseda_symbols",
        "cross_swing",
        "cross_dot_swing",
        "slash_swing",
        "numbered_bs",
      ],
      fallback.pitchMark
    ),
    buntPitchMark: isOneOf(
      obj.buntPitchMark,
      [
        "v_dot_circle_dot",
        "filled_triangle",
        "inv_triangle_diamond",
        "same_as_normal",
      ],
      fallback.buntPitchMark
    ),
    pickoffMark: isOneOf(
      obj.pickoffMark,
      ["chevron_arrow", "full_arrow", "kanji_num", "hidden"],
      fallback.pickoffMark
    ),
    buntMark: isOneOf(
      obj.buntMark,
      [
        "square_sac_triangle_sf_bh",
        "square_all_bh",
        "square_sac",
        "diamond_sac",
        "b_prefix",
      ],
      fallback.buntMark
    ),
    pinchHitterMark: isOneOf(
      obj.pinchHitterMark,
      [
        "red_wave_name",
        "waseda_diamond_pr",
        "left_wave_only",
        "cell_badge",
        "lineup_only",
      ],
      fallback.pinchHitterMark
    ),
    doublePlayMark: isOneOf(
      obj.doublePlayMark,
      ["bracket_dp", "dp_only", "wavy_link", "chain_only"],
      fallback.doublePlayMark
    ),
    flyLiner: isOneOf(
      obj.flyLiner,
      ["umbrella_f_prefix_ground_arc", "umbrella", "paren", "alphabet"],
      fallback.flyLiner
    ),
    advanceError: isOneOf(
      obj.advanceError,
      ["senior_chart", "english", "kanji"],
      fallback.advanceError
    ),
    positionLabel: isOneOf(
      obj.positionLabel,
      ["kanji", "number", "english"],
      fallback.positionLabel
    ),
    inningEndMark: isOneOf(
      obj.inningEndMark,
      [
        "red_double_slash",
        "black_double_slash",
        "single_slash",
        "bottom_double_line",
        "none",
      ],
      obj.hitLine === "mono_bold"
        ? "black_double_slash"
        : typeof obj.forceOutMark === "string"
        ? obj.forceOutMark === "base_letter_abch"
          ? "red_double_slash"
          : "black_double_slash"
        : fallback.inningEndMark
    ),
    scoreTeamNameMode: isOneOf<ScoreTeamNameDisplayMode>(
      obj.scoreTeamNameMode,
      ["organization", "squad"],
      fallback.scoreTeamNameMode ?? "organization"
    ),
    practiceMatchLabel: sanitizePracticeMatchLabel(
      obj.practiceMatchLabel,
      sanitizePracticeMatchLabel(
        fallback.practiceMatchLabel,
        DEFAULT_PRACTICE_MATCH_LABEL
      )
    ),
    customNote: note,
  };
}

/**
 * DB保存済みの `teams.scorebook_symbol_rules` JSON文字列からスコア自チーム名モードを軽量抽出する
 * （未設定・パース失敗時は常にデフォルト `"organization"` = チーム名 を返す）
 */
export function extractScoreTeamNameModeFromJson(
  jsonText: string | null | undefined
): ScoreTeamNameDisplayMode {
  if (!jsonText || typeof jsonText !== "string" || !jsonText.trim()) {
    return "organization";
  }
  try {
    const parsed: unknown = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== "object") return "organization";
    const mode = (parsed as Record<string, unknown>).scoreTeamNameMode;
    return mode === "squad" ? "squad" : "organization";
  } catch {
    return "organization";
  }
}

/**
 * DB保存済みの `teams.scorebook_symbol_rules` JSON文字列から練習試合の呼称を軽量抽出する
 * （未設定・パース失敗時はデフォルト `"練習試合"` を返す）
 */
export function extractPracticeMatchLabelFromJson(
  jsonText: string | null | undefined
): string {
  if (!jsonText || typeof jsonText !== "string" || !jsonText.trim()) {
    return DEFAULT_PRACTICE_MATCH_LABEL;
  }
  try {
    const parsed: unknown = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== "object") return DEFAULT_PRACTICE_MATCH_LABEL;
    return sanitizePracticeMatchLabel(
      (parsed as Record<string, unknown>).practiceMatchLabel,
      DEFAULT_PRACTICE_MATCH_LABEL
    );
  } catch {
    return DEFAULT_PRACTICE_MATCH_LABEL;
  }
}

export function parseScorebookSymbolRulesJson(
  jsonText: string | null | undefined
): ScorebookSymbolRules | null {
  if (!jsonText || typeof jsonText !== "string" || !jsonText.trim()) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== "object") return null;
    return sanitizeScorebookSymbolRules(parsed, DEFAULT_TEAM_SCOREBOOK_SYMBOL_RULES);
  } catch {
    return null;
  }
}

export function loadCachedTeamSymbolRules(
  teamId?: string | null
): ScorebookSymbolRules | null {
  if (typeof window === "undefined") return null;
  try {
    localStorage.removeItem(LEGACY_GLOBAL_TEAM_RULES_KEY);
    const key = buildTeamRulesStorageKey(teamId);
    if (!key) return null;
    return parseScorebookSymbolRulesJson(localStorage.getItem(key));
  } catch {
    return null;
  }
}

export function saveCachedTeamSymbolRules(
  rules: ScorebookSymbolRules | null,
  teamId?: string | null
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LEGACY_GLOBAL_TEAM_RULES_KEY);
    const key = buildTeamRulesStorageKey(teamId);
    if (!key) return;
    if (!rules) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(rules));
    }
  } catch {
    // ignore storage errors
  }
}

export function loadPreferredNotationMode(): ScorebookNotationMode {
  if (typeof window === "undefined") return "standard";
  try {
    const raw = localStorage.getItem(LOCAL_NOTATION_MODE_KEY);
    return raw === "team" ? "team" : "standard";
  } catch {
    return "standard";
  }
}

export function savePreferredNotationMode(mode: ScorebookNotationMode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_NOTATION_MODE_KEY, mode);
  } catch {
    // ignore storage errors
  }
}

export function summarizeSymbolRulesBadges(
  rules: ScorebookSymbolRules
): string[] {
  const badges: string[] = [];
  if (rules.cellStyle === "simple_diamond") badges.push("大ダイヤ単独マス");
  else if (rules.cellStyle === "quadrant_bso_grid") badges.push("十字4分割＋BSO線");
  else badges.push("十字4分割マス");
  badges.push(
    rules.lineupStyle === "compact_order_first"
      ? "シンプル選手欄"
      : "3段フル選手欄"
  );
  badges.push(rules.outMark === "circled" ? "①②③アウト" : "ⅠⅡⅢアウト");
  if (rules.strikeout === "k_called_so_swing") badges.push("見逃K・空振SO・振逃ꓘ");
  else if (rules.strikeout === "k_called_reverse") badges.push("見逃し反転K");
  else if (rules.strikeout === "k_called_circle") badges.push("見逃しⓀ");
  else if (rules.strikeout === "so") badges.push("三振SO");
  else badges.push("三振K統一");

  if (rules.walkHbp === "bb_hbp") badges.push("BB/HBP");
  else if (rules.walkHbp === "kanji") badges.push("四/死");
  else badges.push("B/DB");

  if (rules.buntMark === "square_sac_triangle_sf_bh") {
    badges.push("□犠打・△犠飛・BH");
  } else if (rules.buntMark === "square_all_bh") {
    badges.push("□バント＋BH");
  } else if (rules.buntMark === "square_sac") {
    badges.push("□犠打＋BH");
  } else if (rules.buntMark === "b_prefix") {
    badges.push("◇犠打＋B/BH");
  } else {
    badges.push("◇犠打");
  }

  if (rules.flyLiner === "umbrella_f_prefix_ground_arc") {
    badges.push("︵7・︵F7・6⏝");
  } else if (rules.flyLiner === "paren") {
    badges.push("(8)フライ");
  } else if (rules.flyLiner === "alphabet") {
    badges.push("8F/8L");
  } else {
    badges.push("傘フライ");
  }

  if (rules.pitchMark === "numbered_bs") badges.push("球数番号BS");
  else if (
    rules.pitchMark === "cross_swing" ||
    rules.pitchMark === "cross_dot_swing"
  ) {
    badges.push("×空振り");
  } else if (rules.pitchMark === "slash_swing") {
    badges.push("／空振り");
  }

  if (rules.buntPitchMark === "v_dot_circle_dot") badges.push("V̇/⊙バント球");
  else if (rules.buntPitchMark === "inv_triangle_diamond") badges.push("▽/◇バント球");

  if (rules.pickoffMark === "chevron_arrow") badges.push("＞∧＜牽制");
  else if (rules.pickoffMark === "full_arrow") badges.push("→↑←牽制");
  else if (rules.pickoffMark === "kanji_num") badges.push("1牽・2牽");

  if (rules.hitLine === "red_edge_infield_arc") {
    badges.push("赤進塁線＋内野安打赤弧");
  } else if (rules.hitLine === "quadrant_slash_hr_diamond") {
    badges.push("右下赤斜線＋HR赤枠");
  } else if (rules.hitLine === "red_plain") {
    badges.push("赤実線のみ");
  } else if (rules.hitLine === "parallel_bars") {
    badges.push("平行重線ヒット");
  } else if (rules.hitLine === "mono_bold") {
    badges.push("白黒太線");
  } else {
    badges.push("赤進塁線＋直交線");
  }

  if (rules.forceOutMark === "base_letter_abch") {
    badges.push("1A/6B/5C/2H封殺");
  }
  if (rules.runMark === "earned_filled_unearned_open") {
    badges.push("自責●/非自責○");
  }
  if (rules.drivingOrderMark === "circled") {
    badges.push("①②③進塁/生還打順");
  } else if (rules.drivingOrderMark === "home_circled_other_paren") {
    badges.push("①②③生還・(1)進塁");
  } else {
    badges.push("(1)(2)(3)進塁/生還");
  }
  if (rules.runnerLine === "dotted_only") {
    badges.push("進塁点線維持");
  }
  if (rules.runnerOutLine === "quadrant_arrow") {
    badges.push("走塁死矢印表記");
  } else if (rules.runnerOutLine === "t_stop") {
    badges.push("━━┫ストップ線");
  }
  if (rules.rbiMark === "red_dots") {
    badges.push("右上赤打点");
  } else if (rules.rbiMark === "black_dots") {
    badges.push("右上黒打点");
  }
  if (rules.pinchHitterMark === "red_wave_name") {
    badges.push("赤波線＋縦書き氏名");
  } else if (rules.pinchHitterMark === "waseda_diamond_pr") {
    badges.push("早稲田塁線代走");
  } else if (rules.pinchHitterMark === "cell_badge") {
    badges.push("赤波線＋PH/PR記号");
  }
  if (rules.doublePlayMark === "bracket_dp") {
    badges.push("]連結＋DP併殺");
  } else if (rules.doublePlayMark === "wavy_link") {
    badges.push("波線連結＋DP併殺");
  } else if (rules.doublePlayMark === "dp_only") {
    badges.push("DP添字併殺");
  }
  if (rules.advanceError === "senior_chart") {
    badges.push("E6/6E・4FC・S′");
  }
  if (rules.inningEndMark === "red_double_slash") {
    badges.push("赤／／イニング終了");
  } else if (rules.inningEndMark === "black_double_slash") {
    badges.push("黒／／イニング終了");
  } else if (rules.inningEndMark === "single_slash") {
    badges.push("／イニング終了");
  } else if (rules.inningEndMark === "bottom_double_line") {
    badges.push("＝＝下辺イニング終了");
  }

  return badges;
}

export function formatOutOrdinalText(
  outOrdinal: 1 | 2 | 3,
  rules: ScorebookSymbolRules
): string {
  if (rules.outMark === "circled") {
    return outOrdinal === 1 ? "①" : outOrdinal === 2 ? "②" : "③";
  }
  return outOrdinal === 1 ? "Ⅰ" : outOrdinal === 2 ? "Ⅱ" : "Ⅲ";
}

const POS_TO_NUMBER: Record<string, string> = {
  "1": "1",
  P: "1",
  投: "1",
  投手: "1",
  "2": "2",
  C: "2",
  捕: "2",
  捕手: "2",
  "3": "3",
  "1B": "3",
  一: "3",
  一塁: "3",
  "4": "4",
  "2B": "4",
  二: "4",
  二塁: "4",
  "5": "5",
  "3B": "5",
  三: "5",
  三塁: "5",
  "6": "6",
  SS: "6",
  遊: "6",
  遊撃: "6",
  "7": "7",
  LF: "7",
  左: "7",
  左翼: "7",
  "8": "8",
  CF: "8",
  中: "8",
  中堅: "8",
  "9": "9",
  RF: "9",
  右: "9",
  右翼: "9",
  DH: "DH",
  D: "DH",
  指: "DH",
  DP: "DH",
  PH: "PH",
  打: "PH",
  代打: "PH",
  PR: "PR",
  走: "PR",
  代走: "PR",
  TR: "TR",
  臨走: "TR",
};

const NUM_TO_KANJI: Record<string, string> = {
  "1": "投",
  "2": "捕",
  "3": "一",
  "4": "二",
  "5": "三",
  "6": "遊",
  "7": "左",
  "8": "中",
  "9": "右",
  DH: "指",
  PH: "打",
  PR: "走",
  TR: "臨",
};

const NUM_TO_ENGLISH: Record<string, string> = {
  "1": "P",
  "2": "C",
  "3": "1B",
  "4": "2B",
  "5": "3B",
  "6": "SS",
  "7": "LF",
  "8": "CF",
  "9": "RF",
  DH: "DH",
  PH: "PH",
  PR: "PR",
  TR: "TR",
};

export function formatPositionByRules(
  rawPosition: string | null | undefined,
  rules: ScorebookSymbolRules
): string {
  const clean = (rawPosition || "").trim().toUpperCase();
  if (!clean) return "-";
  const canonical = POS_TO_NUMBER[clean] || POS_TO_NUMBER[rawPosition?.trim() || ""] || clean;
  if (rules.positionLabel === "number") {
    return canonical;
  }
  if (rules.positionLabel === "english") {
    return NUM_TO_ENGLISH[canonical] || canonical;
  }
  return NUM_TO_KANJI[canonical] || (rawPosition || "-").trim().slice(0, 2);
}

const CIRCLED_NUMBERS_1_TO_20 = [
  "①",
  "②",
  "③",
  "④",
  "⑤",
  "⑥",
  "⑦",
  "⑧",
  "⑨",
  "⑩",
  "⑪",
  "⑫",
  "⑬",
  "⑭",
  "⑮",
  "⑯",
  "⑰",
  "⑱",
  "⑲",
  "⑳",
] as const;

export function formatDrivingBatterOrderByRules(
  drivingBatterOrder: number,
  rules: ScorebookSymbolRules,
  targetBase?: 1 | 2 | 3 | 4
): string {
  const n = Math.trunc(drivingBatterOrder);
  if (!Number.isFinite(n) || n <= 0) return "";
  const style: DrivingOrderMarkStyle = rules.drivingOrderMark ?? "paren";
  const useCircled =
    style === "circled" ||
    (style === "home_circled_other_paren" && targetBase === 4);
  if (useCircled && n >= 1 && n <= CIRCLED_NUMBERS_1_TO_20.length) {
    return CIRCLED_NUMBERS_1_TO_20[n - 1];
  }
  return `(${n})`;
}

export interface FormatAdvanceMethodExtraOptions {
  /** 到達（またはアウトになった）目標塁: 1=1塁(A), 2=2塁(B), 3=3塁(C), 4=本塁(H) */
  targetBase?: 1 | 2 | 3 | 4;
  /** フォースアウト（封殺）かタッチアウトか */
  isForceOut?: boolean;
  /** 送球経路（例: "6", "6-4", "1-3", "5", "2"） */
  throwChain?: string;
  /** ダブルスチール（重盗）か */
  isDoubleSteal?: boolean;
  /** この移動でアウトになったか */
  isOut?: boolean;
}

export function formatAdvanceMethodByRules(
  method: AdvanceMethodCode,
  rules: ScorebookSymbolRules,
  drivingBatterOrder?: number,
  extra?: FormatAdvanceMethodExtraOptions
): string {
  const isKanji = rules.advanceError === "kanji";
  const isSeniorChart = rules.advanceError === "senior_chart";
  const chain = (extra?.throwChain || "").trim();

  const isInPlayRunnerOut =
    method === "out_on_base" ||
    Boolean(
      extra?.isOut &&
        (method === "fc" ||
          method === "throw_advance" ||
          method === "hit" ||
          method === "sac" ||
          method === "other")
    );

  if (rules.forceOutMark === "base_letter_abch" && isInPlayRunnerOut) {
    const baseLetter =
      extra?.targetBase === 1
        ? "A"
        : extra?.targetBase === 2
        ? "B"
        : extra?.targetBase === 3
        ? "C"
        : extra?.targetBase === 4
        ? "H"
        : "";
    if (extra?.isForceOut && baseLetter) {
      return chain ? `${chain}${baseLetter}` : baseLetter;
    }
    return chain ? `${chain}TO` : "TO";
  }

  if (
    extra?.isOut &&
    (method === "throw_advance" ||
      method === "hit" ||
      method === "sac" ||
      method === "other")
  ) {
    return isKanji ? "走死" : "T.O";
  }

  switch (method) {
    case "steal":
      if (isSeniorChart) {
        return extra?.isDoubleSteal ? "DS" : "S′";
      }
      return isKanji ? "盗" : "S";
    case "caught_stealing":
      return isKanji ? "盗死" : "CS";
    case "pickoff_out":
      if (rules.forceOutMark === "base_letter_abch" && chain) {
        return `${chain}TO`;
      }
      return isKanji ? "牽死" : "PO";
    case "pickoff_error":
      return isKanji ? "牽失" : "POE";
    case "wp":
      return isKanji ? "暴" : "WP";
    case "pb":
      return isKanji ? "捕" : "PB";
    case "balk":
      return isKanji ? "ボ" : "BK";
    case "error":
      if (chain) {
        return isKanji ? `${chain}失` : `${chain}E`;
      }
      return isKanji ? "失" : "E";
    case "fc":
      return drivingBatterOrder && drivingBatterOrder > 0
        ? formatDrivingBatterOrderByRules(
            drivingBatterOrder,
            rules,
            extra?.targetBase
          )
        : isKanji
        ? "野"
        : "FC";
    case "obstruction":
      if (isSeniorChart) {
        return chain ? `OB${chain}` : "OB";
      }
      return isKanji ? "妨" : "OBS";
    case "interference_out":
      if (isSeniorChart) {
        return "IP";
      }
      return isKanji ? "守妨" : "INT";
    case "appeal_out":
      return isKanji ? "離死" : "AP";
    case "tiebreak":
      return "TB";
    case "throw_advance":
      return drivingBatterOrder && drivingBatterOrder > 0
        ? formatDrivingBatterOrderByRules(
            drivingBatterOrder,
            rules,
            extra?.targetBase
          )
        : isKanji
        ? "送"
        : "T";
    case "out_on_base":
      return isKanji ? "走死" : "T.O";
    case "hit":
    case "sac":
    case "walk":
    case "other":
    default:
      if (drivingBatterOrder && drivingBatterOrder > 0) {
        return formatDrivingBatterOrderByRules(
          drivingBatterOrder,
          rules,
          extra?.targetBase
        );
      }
      return "";
  }
}

export interface FormattedPlayNotation {
  /** メイン文字列（例: "6-3", "8", "K", "SO", "B", "6E", "E6", "BH5"） */
  mainText: string;
  /** サブ添字（例: 振り逃げ時の "2-3" や "WP"、3バント失敗の "3B" など） */
  subText?: string;
  /** 視覚装飾種別（SVG側で傘・下弧・直線・犠打ダイヤ・四角枠・三角枠・反転K・丸Kを精密描画） */
  decorator:
    | "none"
    | "umbrella"
    | "under_arc"
    | "overline"
    | "sac_diamond"
    | "sac_square"
    | "sac_triangle"
    | "sac_fly_umbrella"
    | "bunt_fly_square_umbrella"
    | "reverse_k"
    | "circle_k"
    | "hit";
  /** 安打・出塁系の赤インク表示か */
  isRedInk: boolean;
  /** 内野安打・バントヒット時の第4象限（右下）赤円弧囲み */
  infieldHitArc?: boolean;
  /** ランニングホームラン（RH）時の内側二重赤ダイヤモンド */
  isRunningHomeRun?: boolean;
}

const KANJI_DIR_TO_NUM: ReadonlyArray<[RegExp, string]> = [
  [/投/, "1"],
  [/捕/, "2"],
  [/一/, "3"],
  [/二/, "4"],
  [/三/, "5"],
  [/遊/, "6"],
  [/左中間/, "78"],
  [/右中間/, "89"],
  [/左/, "7"],
  [/中/, "8"],
  [/右/, "9"],
];

function inferFielderToken(
  battedDirection: string,
  resultLabel: string,
  fallback = ""
): string {
  const dir = (battedDirection || "").trim();
  if (/^[1-9](-[1-9])+$/.test(dir)) {
    return dir;
  }
  const dirDigits = dir.match(/[1-9]/g);
  if (dirDigits && dirDigits.length > 0) {
    if (dir.includes("-")) {
      return dir.replace(/[^1-9-]/g, "");
    }
    return dirDigits.join("");
  }

  const label = (resultLabel || "").trim();
  const labelChain = label.match(/[1-9](?:-[1-9])+/);
  if (labelChain) return labelChain[0];

  const cleanLabelForPos = label.replace(
    /二塁打|三塁打|三重殺|三振|二封|三封|一死|二死|三死|スリーバント/g,
    ""
  );
  for (const [pattern, code] of KANJI_DIR_TO_NUM) {
    if (pattern.test(dir) || pattern.test(cleanLabelForPos)) {
      return code;
    }
  }
  return fallback;
}

function isCalledStrikeout(ab: ScorebookV2AtBat): boolean {
  const label = (ab.resultLabel || "").trim();
  const dir = (ab.battedDirection || "").trim();
  if (/見逃/.test(label) || /Ⓚ|ꓘ/.test(label) || /Ⓚ|ꓘ/.test(dir)) return true;
  if (/空振|バント|振逃|振り逃げ/.test(label) || /^SO\b/i.test(dir)) {
    return false;
  }
  for (let i = ab.pitches.length - 1; i >= 0; i--) {
    const p: CanonicalPitchResult = ab.pitches[i];
    if (p === "strike") return true;
    if (p === "swinging_strike" || p === "bunt_swinging" || p === "bunt_foul") {
      return false;
    }
  }
  if (/^K$/i.test(dir)) return true;
  return false;
}

function isLinerPlay(ab: ScorebookV2AtBat): boolean {
  const combined = `${ab.battedDirection || ""} ${ab.resultLabel || ""}`;
  return /直|ライナー|[1-9]L\b|^L[1-9]/i.test(combined);
}

function isBuntAtBatPlay(ab: ScorebookV2AtBat): boolean {
  if (ab.resultCode === "sac_bunt") return true;
  const dir = (ab.battedDirection || "").trim();
  const label = (ab.resultLabel || "").trim();
  if (/3バント|スリーバント/.test(label)) return false;
  if (/バント/.test(label)) return true;
  if (
    /^BH(?:[1-9](?:-[1-9])?)?$/i.test(dir) ||
    /^[1-9]BH$/i.test(dir) ||
    /^B[1-9](?:-[1-9]|F|L)?$/i.test(dir)
  ) {
    return true;
  }
  if (/^□/.test(dir) || /^\[[1-9](?:-[1-9])+\]$/.test(dir)) return true;
  return false;
}

export interface FormatAtBatPlayNotationOptions {
  /** 1マス単独サムネイル表示時など、縦2マス連結オーバーレイがない場合に打者マス側にもDP/TP添字を出すか */
  standaloneSingleCell?: boolean;
}

/**
 * 1打席の結果・打球方向・投球履歴を、指定された記号ルール（標準 or チームルール）の表記へ変換する
 */
export function formatAtBatPlayNotation(
  rawAb: ScorebookV2AtBat,
  rules: ScorebookSymbolRules,
  options?: FormatAtBatPlayNotationOptions
): FormattedPlayNotation {
  const ab = normalizeLegacyForceOutAtBat(rawAb);
  const rc: CanonicalAtBatResult = ab.resultCode;
  const dir = (ab.battedDirection || "").trim();
  const label = (ab.resultLabel || "").trim();
  const isBuntPlay = isBuntAtBatPlay(ab);

  // 1. 安打系（右下の打球方向数字・BH5・HR表記は黒字とし、赤は安打斜線/ラインと中央●のみに使用）
  if (
    rc === "single" ||
    rc === "double" ||
    rc === "triple" ||
    rc === "home_run"
  ) {
    const fielder = inferFielderToken(dir, label, "");
    const isGroundArcMode = rules.flyLiner === "umbrella_f_prefix_ground_arc";

    if (rc === "home_run") {
      const isRunningHr =
        /^︵?RH/i.test(dir) || /ランニング|RH/i.test(label);
      if (isRunningHr) {
        const useUmbrella =
          rules.flyLiner === "umbrella" || isGroundArcMode;
        return {
          mainText: fielder ? `RH${fielder}` : "RH",
          decorator: useUmbrella ? "umbrella" : "hit",
          isRedInk: false,
          isRunningHomeRun: true,
        };
      }
      if (rules.hitLine === "red_edge_infield_arc") {
        return {
          mainText: fielder || "HR",
          decorator: "hit",
          isRedInk: false,
        };
      }
      return {
        mainText: fielder ? `HR(${fielder})` : "HR",
        decorator: "hit",
        isRedInk: false,
      };
    }

    // ポテンヒット（T9 等）
    const bloopMatch = dir.match(/^T([1-9])/i);
    if (bloopMatch || /ポテン/.test(label)) {
      const bf = bloopMatch?.[1] || fielder || "9";
      return {
        mainText: `T${bf}`,
        decorator: "hit",
        isRedInk: false,
      };
    }

    // バントヒット（BH5 等）
    if (isBuntPlay && rules.buntMark !== "diamond_sac") {
      return {
        mainText: fielder ? `BH${fielder}` : "BH",
        decorator: "hit",
        isRedInk: false,
        infieldHitArc:
          rules.hitLine === "red_edge_infield_arc" && rc === "single",
      };
    }

    // 内野安打判定（単打かつ内野手 1〜6 記録、または明示的な内野安打表記）
    const isExplicitInfieldHit = /内野安打|内安/.test(label);
    const isOutfieldTrajectory = /越|抜|ライナー|直/.test(label) && !isExplicitInfieldHit;
    const isInfieldSingle =
      rc === "single" &&
      rules.hitLine === "red_edge_infield_arc" &&
      (isExplicitInfieldHit ||
        (/^[1-6](?:-[1-9])?$/.test(fielder) && !isOutfieldTrajectory));

    if (isInfieldSingle) {
      return {
        mainText: fielder || "H",
        decorator: "hit",
        isRedInk: false,
        infieldHitArc: true,
      };
    }

    const formattedFielder =
      dir.includes("・") && /^[1-9]・[1-9]$/.test(dir)
        ? dir
        : isGroundArcMode && (fielder === "78" || fielder === "89")
        ? `${fielder[0]}・${fielder[1]}`
        : fielder;

    let hitDecorator: FormattedPlayNotation["decorator"] = "hit";
    if (isGroundArcMode && formattedFielder) {
      if (/ゴロ|⏝/.test(`${dir} ${label}`)) {
        hitDecorator = "under_arc";
      } else if (/飛|越|中間|︵/.test(`${dir} ${label}`)) {
        hitDecorator = "umbrella";
      }
    }

    return {
      mainText:
        formattedFielder ||
        (rc === "single" ? "H" : rc === "double" ? "2B" : "3B"),
      decorator: hitDecorator,
      isRedInk: false,
    };
  }

  // 2. 四死球・打撃妨害
  if (rc === "walk") {
    const text =
      rules.walkHbp === "bb_hbp"
        ? "BB"
        : rules.walkHbp === "kanji"
        ? "四"
        : "B";
    return { mainText: text, decorator: "none", isRedInk: false };
  }
  if (rc === "intentional_walk") {
    const text =
      rules.walkHbp === "bb_hbp"
        ? "IBB"
        : rules.walkHbp === "kanji"
        ? "敬"
        : "IB";
    return { mainText: text, decorator: "none", isRedInk: false };
  }
  if (rc === "hit_by_pitch") {
    const text =
      rules.walkHbp === "bb_hbp"
        ? "HBP"
        : rules.walkHbp === "kanji"
        ? "死"
        : "DB";
    return { mainText: text, decorator: "none", isRedInk: false };
  }
  if (rc === "interference") {
    if (rules.advanceError === "senior_chart") {
      const f = inferFielderToken(dir, label, "2") || "2";
      return {
        mainText: `${f}IF`,
        decorator: "none",
        isRedInk: false,
      };
    }
    return {
      mainText: rules.advanceError === "kanji" ? "打妨" : "INT",
      decorator: "none",
      isRedInk: false,
    };
  }

  // 3. 三振・振り逃げ
  if (
    rc === "strikeout" ||
    rc === "dropped_third_strike_out" ||
    rc === "dropped_third_strike"
  ) {
    const called = isCalledStrikeout(ab);
    const isThreeBunt = /3バント|スリーバント/.test(label);

    if (rules.strikeout === "k_called_so_swing") {
      if (
        rc === "dropped_third_strike" ||
        rc === "dropped_third_strike_out"
      ) {
        const throwSub =
          rc === "dropped_third_strike_out"
            ? inferFielderToken(dir, label, "") || undefined
            : undefined;
        return {
          mainText: "K",
          subText: throwSub,
          decorator: "reverse_k",
          isRedInk: false,
        };
      }
      return {
        mainText: called ? "K" : "SO",
        subText: isThreeBunt ? "3B" : undefined,
        decorator: "none",
        isRedInk: false,
      };
    }

    const dtsSub =
      rc === "dropped_third_strike_out"
        ? inferFielderToken(dir, label, "2-3")
        : rc === "dropped_third_strike"
        ? rules.advanceError === "kanji"
          ? "振逃"
          : "D3S"
        : isThreeBunt
        ? "3B"
        : undefined;

    if (
      rules.strikeout === "so" ||
      (rc === "strikeout" &&
        !called &&
        rules.strikeout !== "k_only" &&
        /^SO\b/i.test(dir))
    ) {
      return {
        mainText: "SO",
        subText: dtsSub,
        decorator: "none",
        isRedInk: false,
      };
    }
    if (called && rules.strikeout === "k_called_reverse") {
      return {
        mainText: "K",
        subText: dtsSub,
        decorator: "reverse_k",
        isRedInk: false,
      };
    }
    if (called && rules.strikeout === "k_called_circle") {
      return {
        mainText: "K",
        subText: dtsSub,
        decorator: "circle_k",
        isRedInk: false,
      };
    }
    return {
      mainText: "K",
      subText: dtsSub,
      decorator: "none",
      isRedInk: false,
    };
  }

  // 4. 犠打（送りバント）
  if (rc === "sac_bunt") {
    const explicitBaseStepSac = dir.match(
      /^([1-9](?:-[1-9])*(?:A|B|C|H|TO))$/i
    );
    const token = explicitBaseStepSac
      ? explicitBaseStepSac[1].toUpperCase()
      : inferFielderToken(dir, label, "1-3");
    const main =
      explicitBaseStepSac || token.includes("-") || token === "3"
        ? token
        : `${token}-3`;
    const sacDecorator =
      rules.buntMark === "square_sac_triangle_sf_bh" ||
      rules.buntMark === "square_all_bh" ||
      rules.buntMark === "square_sac"
        ? "sac_square"
        : "sac_diamond";
    return {
      mainText: main,
      decorator: sacDecorator,
      isRedInk: false,
    };
  }

  // 5. 犠飛（犠牲フライ）
  if (rc === "sac_fly") {
    const f = inferFielderToken(dir, label, "8").slice(0, 2);
    if (rules.buntMark === "square_sac_triangle_sf_bh") {
      return {
        mainText: f,
        decorator: "sac_triangle",
        isRedInk: false,
      };
    }
    if (
      rules.flyLiner === "umbrella" ||
      rules.flyLiner === "umbrella_f_prefix_ground_arc"
    ) {
      return {
        mainText: f,
        decorator: "sac_fly_umbrella",
        isRedInk: false,
      };
    }
    if (rules.flyLiner === "paren") {
      return {
        mainText: `(${f})`,
        decorator: "sac_diamond",
        isRedInk: false,
      };
    }
    return {
      mainText: `${f}SF`,
      decorator: "sac_diamond",
      isRedInk: false,
    };
  }

  // 6. フライ・ライナー・インフィールドフライ
  if (rc === "flyout" || rc === "infield_fly") {
    const isIf = rc === "infield_fly";
    const rawFielder = inferFielderToken(dir, label, "").slice(0, 2);
    const shouldEmbedAerialDp =
      ab.outsInPlay >= 2 &&
      (rules.doublePlayMark === "dp_only" ||
        (Boolean(options?.standaloneSingleCell) &&
          rules.doublePlayMark !== "chain_only"));
    const aerialDpSub = shouldEmbedAerialDp
      ? ab.outsInPlay >= 3
        ? "TP"
        : "DP"
      : undefined;

    if (isIf) {
      // インフィールドフライは内野手（1〜6）のみ有効とし、守備位置未指定時は勝手に "8"（中）を補完せず単独 "IF" を描画する
      const infielder = /^[1-6]$/.test(rawFielder.slice(0, 1))
        ? rawFielder.slice(0, 1)
        : "";
      if (!infielder) {
        if (
          rules.flyLiner === "umbrella_f_prefix_ground_arc" ||
          rules.flyLiner === "umbrella"
        ) {
          return {
            mainText: "IF",
            subText: aerialDpSub,
            decorator: "umbrella",
            isRedInk: false,
          };
        }
        if (rules.flyLiner === "paren") {
          return {
            mainText: "(IF)",
            subText: aerialDpSub,
            decorator: "none",
            isRedInk: false,
          };
        }
        return {
          mainText: "IF",
          subText: aerialDpSub,
          decorator: "none",
          isRedInk: false,
        };
      }

      if (
        rules.flyLiner === "umbrella_f_prefix_ground_arc" ||
        rules.flyLiner === "umbrella"
      ) {
        return {
          mainText: infielder,
          subText: "IF",
          decorator: "umbrella",
          isRedInk: false,
        };
      }
      if (rules.flyLiner === "paren") {
        return {
          mainText: `(${infielder})`,
          subText: "IF",
          decorator: "none",
          isRedInk: false,
        };
      }
      return {
        mainText: `${infielder}F`,
        subText: "IF",
        decorator: "none",
        isRedInk: false,
      };
    }

    const isFoulFly =
      /邪|ファール|ファウル/.test(label) ||
      /^F[1-9]|[1-9]F$|^FF[1-9]|[1-9]FF$/i.test(dir);
    const liner = isLinerPlay(ab);

    // 通常のフライ・ライナーで守備位置未入力の場合も "8"（中堅手）を捏造せず F / FF / L 記号で表現する
    if (!rawFielder) {
      const genericAerialToken = liner ? "L" : isFoulFly ? "FF" : "F";
      if (
        rules.flyLiner === "umbrella_f_prefix_ground_arc" ||
        rules.flyLiner === "umbrella"
      ) {
        if (isBuntPlay && rules.buntMark === "square_all_bh" && !liner) {
          return {
            mainText: isFoulFly ? "FF" : "F",
            subText: aerialDpSub,
            decorator: "bunt_fly_square_umbrella",
            isRedInk: false,
          };
        }
        return {
          mainText: genericAerialToken,
          subText:
            isBuntPlay && rules.buntMark === "b_prefix" ? "B" : aerialDpSub,
          decorator: liner ? "overline" : "umbrella",
          isRedInk: false,
        };
      }
      if (rules.flyLiner === "paren") {
        const baseText = liner ? "[L]" : isFoulFly ? "(FF)" : "(F)";
        return {
          mainText:
            isBuntPlay && rules.buntMark === "b_prefix"
              ? `B${baseText}`
              : baseText,
          subText: aerialDpSub,
          decorator:
            isBuntPlay && rules.buntMark === "square_all_bh"
              ? "sac_square"
              : "none",
          isRedInk: false,
        };
      }
      return {
        mainText:
          isBuntPlay && rules.buntMark === "b_prefix"
            ? `B${genericAerialToken}`
            : genericAerialToken,
        subText: aerialDpSub,
        decorator:
          isBuntPlay && rules.buntMark === "square_all_bh"
            ? "sac_square"
            : "none",
        isRedInk: false,
      };
    }

    const f = rawFielder;
    if (rules.flyLiner === "umbrella_f_prefix_ground_arc") {
      if (liner) {
        return {
          mainText: f,
          subText: aerialDpSub,
          decorator: "overline",
          isRedInk: false,
        };
      }
      if (isFoulFly) {
        return {
          mainText: `F${f}`,
          subText: aerialDpSub,
          decorator: "umbrella",
          isRedInk: false,
        };
      }
      return {
        mainText: f,
        subText: aerialDpSub,
        decorator: "umbrella",
        isRedInk: false,
      };
    }

    if (rules.flyLiner === "umbrella") {
      if (isBuntPlay && rules.buntMark === "square_all_bh" && !liner) {
        return {
          mainText: f,
          subText: isFoulFly ? "F" : aerialDpSub,
          decorator: "bunt_fly_square_umbrella",
          isRedInk: false,
        };
      }
      return {
        mainText: f,
        subText:
          isBuntPlay && rules.buntMark === "b_prefix"
            ? isFoulFly
              ? "BF"
              : "B"
            : isFoulFly
            ? "F"
            : aerialDpSub,
        decorator: liner ? "overline" : "umbrella",
        isRedInk: false,
      };
    }
    if (rules.flyLiner === "paren") {
      const baseText = liner ? `[${f}]` : `(${f})`;
      return {
        mainText:
          isBuntPlay && rules.buntMark === "b_prefix"
            ? `B${baseText}`
            : baseText,
        subText: isFoulFly ? "F" : aerialDpSub,
        decorator:
          isBuntPlay && rules.buntMark === "square_all_bh"
            ? "sac_square"
            : "none",
        isRedInk: false,
      };
    }
    const alphaText = liner ? `${f}L` : isFoulFly ? `${f}FF` : `${f}F`;
    return {
      mainText:
        isBuntPlay && rules.buntMark === "b_prefix"
          ? `B${alphaText}`
          : alphaText,
      subText: aerialDpSub,
      decorator:
        isBuntPlay && rules.buntMark === "square_all_bh"
          ? "sac_square"
          : "none",
      isRedInk: false,
    };
  }

  // 7. 失策出塁
  if (rc === "error") {
    if (/^E[1-9]$/i.test(dir)) {
      const f = dir.slice(1);
      return {
        mainText: rules.advanceError === "kanji" ? `${f}失` : `E${f}`,
        decorator: "none",
        isRedInk: false,
      };
    }
    if (/^[1-9](?:-[1-9])*E$/i.test(dir)) {
      const chainPart = dir.slice(0, -1);
      return {
        mainText:
          rules.advanceError === "kanji" ? `${chainPart}失` : `${chainPart}E`,
        decorator: "none",
        isRedInk: false,
      };
    }
    const f = inferFielderToken(dir, label, "");
    if (rules.advanceError === "senior_chart") {
      const isCatchErr = /捕球|落球|ファンブル|トンネル/.test(label);
      return {
        mainText: f ? (isCatchErr ? `E${f}` : `${f}E`) : "E",
        decorator: "none",
        isRedInk: false,
      };
    }
    const errSuffix = rules.advanceError === "kanji" ? "失" : "E";
    return {
      mainText: f ? `${f.replace(/-/g, "")}${errSuffix}` : errSuffix,
      decorator: "none",
      isRedInk: false,
    };
  }

  // 8. 野手選択 (FC) — 2個表記や極小2段添字を廃止し、1箇所に明瞭な単一行表記（例: 4FC / FC / 野）で統一
  if (rc === "fc") {
    if (/^[1-9]-$/.test(dir)) {
      return {
        mainText: dir,
        decorator: "none",
        isRedInk: false,
      };
    }
    const chain = inferFielderToken(dir, label, "");
    const fcMain =
      rules.advanceError === "senior_chart"
        ? chain
          ? `${chain}FC`
          : "FC"
        : rules.advanceError === "kanji"
        ? "野"
        : "FC";
    return {
      mainText:
        isBuntPlay && rules.buntMark === "b_prefix" ? `B${fcMain}` : fcMain,
      decorator:
        isBuntPlay && rules.buntMark === "square_all_bh"
          ? "sac_square"
          : "none",
      isRedInk: false,
    };
  }

  // 9. ゴロ・併殺打・三重殺・守備妨害・途中断
  if (rc === "groundout" || rc === "double_play" || rc === "triple_play") {
    if (/^[1-9]-$/.test(dir)) {
      return {
        mainText: dir,
        decorator: "none",
        isRedInk: false,
      };
    }
    const isDp =
      rc === "double_play" || (ab.outsInPlay === 2 && rc !== "triple_play");
    const isTp = rc === "triple_play" || ab.outsInPlay >= 3;
    const shouldEmbedDpInCell =
      rules.doublePlayMark === "dp_only" ||
      (Boolean(options?.standaloneSingleCell) &&
        rules.doublePlayMark !== "chain_only");
    const dpSub = !shouldEmbedDpInCell
      ? undefined
      : isTp
      ? "TP"
      : isDp
      ? "DP"
      : undefined;

    if (/^[1-9](?:-[1-9])*(?:A|B|C|H|TO)$/i.test(dir)) {
      return {
        mainText: dir.toUpperCase(),
        subText: dpSub,
        decorator: "none",
        isRedInk: false,
      };
    }

    // フライ併殺・ライナー併殺（例: 左飛併殺・遊直併殺）の場合は第1野手番号にフライ傘曲線・ライナー直線記号を付与
    const isLinerDp = (rc === "double_play" || rc === "triple_play") && isLinerPlay(ab);
    const isFlyDp =
      (rc === "double_play" || rc === "triple_play") &&
      !isLinerDp &&
      (/飛|フライ|[⌒︵]/.test(label) || /^[1-9]F(?:-[1-9])?$/i.test(dir));

    if (isLinerDp || isFlyDp) {
      const fDigits = (dir.match(/[1-9]/g) || [])[0] || inferFielderToken(dir, label, "6").slice(0, 1) || "6";
      if (
        rules.flyLiner === "umbrella_f_prefix_ground_arc" ||
        rules.flyLiner === "umbrella"
      ) {
        return {
          mainText: fDigits,
          subText: dpSub,
          decorator: isLinerDp ? "overline" : "umbrella",
          isRedInk: false,
        };
      }
      if (rules.flyLiner === "paren") {
        return {
          mainText: isLinerDp ? `[${fDigits}]` : `(${fDigits})`,
          subText: dpSub,
          decorator: "none",
          isRedInk: false,
        };
      }
      return {
        mainText: isLinerDp ? `${fDigits}L` : `${fDigits}F`,
        subText: dpSub,
        decorator: "none",
        isRedInk: false,
      };
    }

    const rawChain = inferFielderToken(dir, label, "");
    const isGroundArcMode = rules.flyLiner === "umbrella_f_prefix_ground_arc";
    let main = rawChain;
    if (!main) {
      main = rc === "double_play" ? "6-4-3" : isGroundArcMode ? "6" : "6-3";
    } else if (/^[1-9]$/.test(main) && main !== "3") {
      if (!(isGroundArcMode && /^[1-9]$/.test(dir))) {
        main = `${main}-3`;
      }
    }

    const groundDecorator: FormattedPlayNotation["decorator"] =
      isBuntPlay &&
      (rules.buntMark === "square_all_bh" ||
        rules.buntMark === "square_sac_triangle_sf_bh")
        ? "sac_square"
        : isGroundArcMode && !isDp && !isTp
        ? "under_arc"
        : "none";

    return {
      mainText:
        isBuntPlay && rules.buntMark === "b_prefix" ? `B${main}` : main,
      subText: dpSub,
      decorator: groundDecorator,
      isRedInk: false,
    };
  }

  if (rc === "interference_out") {
    return {
      mainText:
        rules.advanceError === "senior_chart"
          ? "IP"
          : rules.advanceError === "kanji"
          ? "守妨"
          : "INT",
      decorator: "none",
      isRedInk: false,
    };
  }

  // other（走塁死による打席途中断、またはボーク・暴投・捕逸等の単独記号表示）
  if (dir) {
    return {
      mainText: dir,
      decorator: "none",
      isRedInk: false,
    };
  }
  return {
    mainText: "",
    decorator: "none",
    isRedInk: false,
  };
}

