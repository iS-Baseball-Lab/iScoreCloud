// filepath: src/lib/liff/scorebook-symbol-rules.ts
import type {
  AdvanceMethodCode,
  CanonicalAtBatResult,
  CanonicalPitchResult,
  ScorebookV2AtBat,
} from "@/types/scorebook-v2";

export type ScorebookNotationMode = "standard" | "team";

export type CellGridStyle = "quadrant" | "quadrant_bso_grid" | "simple_diamond";
export type LineupColumnStyle = "classic_three_row" | "compact_order_first";
export type OutMarkStyle = "roman" | "circled";
export type StrikeoutMarkStyle =
  | "k_called_reverse"
  | "k_called_circle"
  | "k_only"
  | "so";
export type WalkHbpMarkStyle = "b_db" | "bb_hbp" | "kanji";
export type HitLineStyle =
  | "quadrant_slash_hr_diamond"
  | "red_plain"
  | "red_slash"
  | "parallel_bars"
  | "mono_bold";
export type RunnerLineStyle = "dotted_only" | "solid_trace";
export type RunnerOutLineStyle = "dotted_only" | "quadrant_arrow" | "t_stop";
export type RunMarkStyle = "red_dot" | "double_circle" | "kanji_toku";
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
  | "square_all_bh"
  | "square_sac"
  | "diamond_sac"
  | "b_prefix";
export type BuntPitchMarkStyle =
  | "v_dot_circle_dot"
  | "filled_triangle"
  | "inv_triangle_diamond"
  | "same_as_normal";
export type FlyLinerMarkStyle = "umbrella" | "paren" | "alphabet";
export type AdvanceErrorMarkStyle = "english" | "kanji";
export type PositionLabelStyle = "kanji" | "number" | "english";

export interface ScorebookSymbolRules {
  cellStyle: CellGridStyle;
  lineupStyle: LineupColumnStyle;
  outMark: OutMarkStyle;
  strikeout: StrikeoutMarkStyle;
  walkHbp: WalkHbpMarkStyle;
  hitLine: HitLineStyle;
  runnerLine: RunnerLineStyle;
  runnerOutLine: RunnerOutLineStyle;
  runMark: RunMarkStyle;
  rbiMark: RbiMarkStyle;
  pitchMark: PitchMarkStyle;
  buntPitchMark: BuntPitchMarkStyle;
  pickoffMark: PickoffMarkStyle;
  buntMark: BuntMarkStyle;
  flyLiner: FlyLinerMarkStyle;
  advanceError: AdvanceErrorMarkStyle;
  positionLabel: PositionLabelStyle;
  customNote?: string;
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
  runMark: "red_dot",
  rbiMark: "red_dots",
  pitchMark: "waseda_symbols",
  buntPitchMark: "filled_triangle",
  pickoffMark: "chevron_arrow",
  buntMark: "diamond_sac",
  flyLiner: "umbrella",
  advanceError: "english",
  positionLabel: "number",
  customNote: "",
};

/**
 * チーム記号ルール未設定時の初期テンプレート（少年野球・中学硬式・草野球で人気の丸数字＋丸Kベース）
 * ※ ユーザーがスコア設定でいつでも自由に変更可能
 */
export const DEFAULT_TEAM_SCOREBOOK_SYMBOL_RULES: ScorebookSymbolRules = {
  cellStyle: "quadrant",
  lineupStyle: "classic_three_row",
  outMark: "circled",
  strikeout: "k_called_circle",
  walkHbp: "b_db",
  hitLine: "quadrant_slash_hr_diamond",
  runnerLine: "dotted_only",
  runnerOutLine: "dotted_only",
  runMark: "red_dot",
  rbiMark: "hidden",
  pitchMark: "waseda_symbols",
  buntPitchMark: "v_dot_circle_dot",
  pickoffMark: "chevron_arrow",
  buntMark: "square_all_bh",
  flyLiner: "umbrella",
  advanceError: "english",
  positionLabel: "number",
  customNote: "",
};

export interface ScorebookSymbolPreset {
  id: string;
  label: string;
  description: string;
  rules: ScorebookSymbolRules;
}

export const SCOREBOOK_SYMBOL_PRESETS: readonly ScorebookSymbolPreset[] = [
  {
    id: "waseda_standard",
    label: "早稲田・成美堂 標準",
    description: "3段メンバー欄・ⅠⅡⅢ・反転K・◇犠打・傘フライ",
    rules: {
      ...STANDARD_SCOREBOOK_SYMBOL_RULES,
      pickoffMark: "full_arrow",
      positionLabel: "number",
    },
  },
  {
    id: "youth_senior",
    label: "少年・シニア 丸数字式",
    description: "①②③・進塁点線維持・右下赤斜線／・×空振り・□バント/BH",
    rules: {
      cellStyle: "quadrant",
      lineupStyle: "classic_three_row",
      outMark: "circled",
      strikeout: "k_called_circle",
      walkHbp: "b_db",
      hitLine: "quadrant_slash_hr_diamond",
      runnerLine: "dotted_only",
      runnerOutLine: "dotted_only",
      runMark: "red_dot",
      rbiMark: "hidden",
      pitchMark: "cross_swing",
      buntPitchMark: "v_dot_circle_dot",
      pickoffMark: "chevron_arrow",
      buntMark: "square_all_bh",
      flyLiner: "paren",
      advanceError: "kanji",
      positionLabel: "number",
      customNote: "",
    },
  },
  {
    id: "numbered_modern",
    label: "球数番号・英字式",
    description: "球数番号BS・BB/HBP・B添字/BH・8F/8L",
    rules: {
      cellStyle: "quadrant",
      lineupStyle: "compact_order_first",
      outMark: "circled",
      strikeout: "k_called_reverse",
      walkHbp: "bb_hbp",
      hitLine: "parallel_bars",
      runnerLine: "solid_trace",
      runnerOutLine: "t_stop",
      runMark: "double_circle",
      rbiMark: "red_dots",
      pitchMark: "numbered_bs",
      buntPitchMark: "inv_triangle_diamond",
      pickoffMark: "kanji_num",
      buntMark: "b_prefix",
      flyLiner: "alphabet",
      advanceError: "english",
      positionLabel: "english",
      customNote: "",
    },
  },
  {
    id: "mono_print",
    label: "白黒印刷くっきり式",
    description: "3段メンバー欄・黒太線ヒット・□犠打・コピー判別容易",
    rules: {
      cellStyle: "quadrant",
      lineupStyle: "classic_three_row",
      outMark: "roman",
      strikeout: "k_called_circle",
      walkHbp: "kanji",
      hitLine: "mono_bold",
      runnerLine: "solid_trace",
      runnerOutLine: "t_stop",
      runMark: "kanji_toku",
      rbiMark: "black_dots",
      pitchMark: "slash_swing",
      buntPitchMark: "filled_triangle",
      pickoffMark: "chevron_arrow",
      buntMark: "square_sac",
      flyLiner: "umbrella",
      advanceError: "kanji",
      positionLabel: "kanji",
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
      { value: "quadrant", label: "十字4分割（標準）", sample: "4部屋・BSO空欄" },
      { value: "quadrant_bso_grid", label: "十字4分割＋横枠", sample: "4部屋・BSO線入" },
      { value: "simple_diamond", label: "大ダイヤ単独型", sample: "十字なしシンプル" },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<CellGridStyle>>,
  },
  lineupStyle: {
    title: "メンバー欄（守備・打順・氏名・背番）の様式",
    options: [
      {
        value: "classic_three_row",
        label: "3段フル様式（標準）",
        sample: "先発・守備｜打順(1/11/21)｜左○｜氏名｜背番",
      },
      {
        value: "compact_order_first",
        label: "打順先頭シンプル式",
        sample: "順｜守備｜背番｜選手名",
      },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<LineupColumnStyle>>,
  },
  outMark: {
    title: "アウトカウント表記",
    options: [
      { value: "roman", label: "ローマ数字", sample: "Ⅰ・Ⅱ・Ⅲ" },
      { value: "circled", label: "丸数字", sample: "①・②・③" },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<OutMarkStyle>>,
  },
  strikeout: {
    title: "三振（空振り / 見逃し）",
    options: [
      { value: "k_called_reverse", label: "反転K式（早稲田）", sample: "K / 反転K" },
      { value: "k_called_circle", label: "丸囲みK式", sample: "K / Ⓚ" },
      { value: "k_only", label: "K統一", sample: "すべて K" },
      { value: "so", label: "SO表記", sample: "SO" },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<StrikeoutMarkStyle>>,
  },
  walkHbp: {
    title: "四球・死球・敬遠",
    options: [
      { value: "b_db", label: "B / DB（標準）", sample: "B・DB・IB" },
      { value: "bb_hbp", label: "BB / HBP", sample: "BB・HBP・IBB" },
      { value: "kanji", label: "漢字1文字", sample: "四・死・敬" },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<WalkHbpMarkStyle>>,
  },
  hitLine: {
    title: "安打の赤線・長打表記パターン",
    options: [
      {
        value: "quadrant_slash_hr_diamond",
        label: "右下赤斜線＋HR1周赤",
        sample: "右下 ／・／／・／／／ / HRダイヤ赤囲み",
      },
      {
        value: "red_plain",
        label: "進塁辺を赤実線のみ",
        sample: "到達塁まで赤線（チョン線なし）",
      },
      {
        value: "red_slash",
        label: "進塁赤線＋直交線（早稲田）",
        sample: "赤進塁線＋1塁線に1〜4本",
      },
      {
        value: "parallel_bars",
        label: "進塁赤線＋1塁平行重線",
        sample: "単1本・二2重・三3重・HR二重枠",
      },
      {
        value: "mono_bold",
        label: "黒太線（白黒印刷向き）",
        sample: "黒太線＋直交線（守備も黒）",
      },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<HitLineStyle>>,
  },
  runnerLine: {
    title: "出塁・進塁時のひし形ライン（黒実線）",
    options: [
      {
        value: "dotted_only",
        label: "なぞらない（点線のまま）",
        sample: "ひし形は点線維持・進塁記号のみ",
      },
      {
        value: "solid_trace",
        label: "黒実線でなぞる（早稲田式）",
        sample: "進んだ塁間を黒実線でなぞる",
      },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<RunnerLineStyle>>,
  },
  runnerOutLine: {
    title: "走塁死・封殺時のひし形ライン（ストップ線）",
    options: [
      {
        value: "dotted_only",
        label: "線なし（点線のまま・記号のみ）",
        sample: "ひし形は点線維持・中央アウト＋記号",
      },
      {
        value: "quadrant_arrow",
        label: "外側に矢印 ＋ 記号（点線維持）",
        sample: "ひし形外側に進行矢印＋T.O/CS等",
      },
      {
        value: "t_stop",
        label: "T字ストップ線 ━━┫（早稲田式）",
        sample: "塁間途中で切って垂直の止め線を描く",
      },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<RunnerOutLineStyle>>,
  },
  runMark: {
    title: "本塁生還（得点）マーク",
    options: [
      { value: "red_dot", label: "中央赤丸（標準）", sample: "●" },
      { value: "double_circle", label: "二重丸", sample: "◎" },
      { value: "kanji_toku", label: "丸得マーク", sample: "㋣（得）" },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<RunMarkStyle>>,
  },
  rbiMark: {
    title: "打点（RBI）マーク表記",
    options: [
      {
        value: "hidden",
        label: "記載しない（なし）",
        sample: "生還走者の (打順) 等で判別",
      },
      {
        value: "red_dots",
        label: "右上に赤点（早稲田式）",
        sample: "打点数分の赤丸（●・●●…）",
      },
      {
        value: "black_dots",
        label: "右上に黒点（鉛筆・白黒式）",
        sample: "打点数分の黒丸（・ / ・・…）",
      },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<RbiMarkStyle>>,
  },
  pitchMark: {
    title: "投球（BSO）記録方式",
    options: [
      { value: "waseda_symbols", label: "早稲田記号式", sample: "○見逃 ●空振 ーB △F" },
      { value: "cross_swing", label: "×空振り式（横棒B）", sample: "○見逃 ×空振 ーB △F" },
      { value: "cross_dot_swing", label: "×空振り式（点・B）", sample: "○見逃 ×空振 ・B △F" },
      { value: "slash_swing", label: "斜線空振り式", sample: "○見逃 ／空振 ・B △F" },
      { value: "numbered_bs", label: "球数番号式", sample: "B/S枠に 1,2,3..." },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<PitchMarkStyle>>,
  },
  buntPitchMark: {
    title: "投球（BSO）欄のバント記号（ファウル / 空振り）",
    options: [
      {
        value: "v_dot_circle_dot",
        label: "Vに点・丸に点式",
        sample: "BF＝Vの中に・ / 空振＝○の中に・",
      },
      {
        value: "filled_triangle",
        label: "黒塗り三角式（早稲田）",
        sample: "BF＝▲ / 空振＝通常空振",
      },
      {
        value: "inv_triangle_diamond",
        label: "逆三角・ひし形式",
        sample: "BF＝▽ / 空振＝◇",
      },
      {
        value: "same_as_normal",
        label: "通常記号と区別しない",
        sample: "BF＝△ / 空振＝通常空振",
      },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<BuntPitchMarkStyle>>,
  },
  pickoffMark: {
    title: "牽制球（1塁 / 2塁 / 3塁）表記",
    options: [
      {
        value: "chevron_arrow",
        label: "矢先のみ（塗無）",
        sample: "1塁＞  2塁∧  3塁＜",
      },
      {
        value: "full_arrow",
        label: "軸付き矢印",
        sample: "1塁→  2塁↑  3塁←",
      },
      {
        value: "kanji_num",
        label: "塁番号＋牽",
        sample: "1牽・2牽・3牽",
      },
      {
        value: "hidden",
        label: "BSO欄に記載しない",
        sample: "投球記号のみ表示",
      },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<PickoffMarkStyle>>,
  },
  buntMark: {
    title: "バント打球（犠打・バント凡退・バント安打）表記",
    options: [
      {
        value: "square_all_bh",
        label: "四角囲み □（全バント）＋ BH",
        sample: "犠・凡 □[5-3] / 安 BH5",
      },
      {
        value: "square_sac",
        label: "四角囲み □（犠打のみ）＋ BH",
        sample: "犠 □[1-3] / 安 BH5",
      },
      {
        value: "diamond_sac",
        label: "ひし形 ◇（早稲田標準）",
        sample: "犠 ◇1-3 / 凡・安は通常",
      },
      {
        value: "b_prefix",
        label: "◇犠打 ＋ B添字・BH式",
        sample: "犠 ◇1-3 / 凡 B5-3 / 安 BH5",
      },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<BuntMarkStyle>>,
  },
  flyLiner: {
    title: "フライ・ライナー表記",
    options: [
      { value: "umbrella", label: "傘・直線記号（標準）", sample: "︵8 / ￣8" },
      { value: "paren", label: "カッコ囲み式", sample: "(8) / [8]" },
      { value: "alphabet", label: "F / L 添字式", sample: "8F / 8L" },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<FlyLinerMarkStyle>>,
  },
  advanceError: {
    title: "盗塁・暴投・失策などの略号",
    options: [
      { value: "english", label: "英字略号（標準）", sample: "S・WP・PB・6E・FC" },
      { value: "kanji", label: "漢字略号", sample: "盗・暴・捕・6失・野" },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<AdvanceErrorMarkStyle>>,
  },
  positionLabel: {
    title: "メンバー欄の守備位置表記",
    options: [
      { value: "number", label: "守備番号（1〜9）", sample: "1・2・3・6・8" },
      { value: "kanji", label: "漢字（投〜右）", sample: "投・捕・一・遊・中" },
      { value: "english", label: "英字略称（P〜RF）", sample: "P・C・1B・SS・CF" },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<PositionLabelStyle>>,
  },
} as const;

const LOCAL_TEAM_RULES_KEY = "iscore_team_scorebook_symbol_rules_v1";
const LOCAL_NOTATION_MODE_KEY = "iscore_scorebook_notation_mode_v1";

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
    return { ...fallback };
  }
  const obj = raw as Record<string, unknown>;
  const note =
    typeof obj.customNote === "string"
      ? obj.customNote.trim().slice(0, 160)
      : fallback.customNote || "";

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
      ["k_called_reverse", "k_called_circle", "k_only", "so"],
      fallback.strikeout
    ),
    walkHbp: isOneOf(obj.walkHbp, ["b_db", "bb_hbp", "kanji"], fallback.walkHbp),
    hitLine: isOneOf(
      obj.hitLine,
      [
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
    runMark: isOneOf(
      obj.runMark,
      ["red_dot", "double_circle", "kanji_toku"],
      fallback.runMark
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
      ["square_all_bh", "square_sac", "diamond_sac", "b_prefix"],
      fallback.buntMark
    ),
    flyLiner: isOneOf(
      obj.flyLiner,
      ["umbrella", "paren", "alphabet"],
      fallback.flyLiner
    ),
    advanceError: isOneOf(
      obj.advanceError,
      ["english", "kanji"],
      fallback.advanceError
    ),
    positionLabel: isOneOf(
      obj.positionLabel,
      ["kanji", "number", "english"],
      fallback.positionLabel
    ),
    customNote: note,
  };
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

export function loadCachedTeamSymbolRules(): ScorebookSymbolRules | null {
  if (typeof window === "undefined") return null;
  try {
    return parseScorebookSymbolRulesJson(
      localStorage.getItem(LOCAL_TEAM_RULES_KEY)
    );
  } catch {
    return null;
  }
}

export function saveCachedTeamSymbolRules(
  rules: ScorebookSymbolRules | null
): void {
  if (typeof window === "undefined") return;
  try {
    if (!rules) {
      localStorage.removeItem(LOCAL_TEAM_RULES_KEY);
    } else {
      localStorage.setItem(LOCAL_TEAM_RULES_KEY, JSON.stringify(rules));
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
  if (rules.strikeout === "k_called_reverse") badges.push("見逃し反転K");
  else if (rules.strikeout === "k_called_circle") badges.push("見逃しⓀ");
  else if (rules.strikeout === "so") badges.push("三振SO");
  else badges.push("三振K統一");

  if (rules.walkHbp === "bb_hbp") badges.push("BB/HBP");
  else if (rules.walkHbp === "kanji") badges.push("四/死");
  else badges.push("B/DB");

  if (rules.buntMark === "square_all_bh") badges.push("□バント＋BH");
  else if (rules.buntMark === "square_sac") badges.push("□犠打＋BH");
  else if (rules.buntMark === "b_prefix") badges.push("◇犠打＋B/BH");
  else badges.push("◇犠打");

  if (rules.flyLiner === "paren") badges.push("(8)フライ");
  else if (rules.flyLiner === "alphabet") badges.push("8F/8L");
  else badges.push("傘フライ");

  if (rules.pitchMark === "numbered_bs") badges.push("球数番号BS");
  else if (
    rules.pitchMark === "cross_swing" ||
    rules.pitchMark === "cross_dot_swing"
  ) {
    badges.push("×空振り");
  } else if (rules.pitchMark === "slash_swing") {
    badges.push("／空振り");
  }

  if (rules.buntPitchMark === "v_dot_circle_dot") badges.push("V・/○・バント球");
  else if (rules.buntPitchMark === "inv_triangle_diamond") badges.push("▽/◇バント球");

  if (rules.pickoffMark === "chevron_arrow") badges.push("＞∧＜牽制");
  else if (rules.pickoffMark === "full_arrow") badges.push("→↑←牽制");
  else if (rules.pickoffMark === "kanji_num") badges.push("1牽・2牽");

  if (rules.hitLine === "quadrant_slash_hr_diamond") {
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

export function formatAdvanceMethodByRules(
  method: AdvanceMethodCode,
  rules: ScorebookSymbolRules,
  drivingBatterOrder?: number
): string {
  const isKanji = rules.advanceError === "kanji";
  switch (method) {
    case "steal":
      return isKanji ? "盗" : "S";
    case "caught_stealing":
      return isKanji ? "盗死" : "CS";
    case "pickoff_out":
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
      return isKanji ? "失" : "E";
    case "fc":
      return drivingBatterOrder && drivingBatterOrder > 0
        ? `(${drivingBatterOrder})`
        : isKanji
        ? "野"
        : "FC";
    case "obstruction":
      return isKanji ? "妨" : "OBS";
    case "interference_out":
      return isKanji ? "守妨" : "INT";
    case "appeal_out":
      return isKanji ? "離死" : "AP";
    case "tiebreak":
      return "TB";
    case "throw_advance":
      return drivingBatterOrder && drivingBatterOrder > 0
        ? `(${drivingBatterOrder})`
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
        return `(${drivingBatterOrder})`;
      }
      return "";
  }
}

export interface FormattedPlayNotation {
  /** メイン文字列（例: "6-3", "8", "K", "B", "6E", "BH5"） */
  mainText: string;
  /** サブ添字（例: 振り逃げ時の "2-3" や "WP"、3バント失敗の "3B" など） */
  subText?: string;
  /** 視覚装飾種別（SVG側で傘・直線・犠打ダイヤ・四角枠・反転K・丸Kを精密描画） */
  decorator:
    | "none"
    | "umbrella"
    | "overline"
    | "sac_diamond"
    | "sac_square"
    | "sac_fly_umbrella"
    | "bunt_fly_square_umbrella"
    | "reverse_k"
    | "circle_k"
    | "hit";
  /** 安打・出塁系の赤インク表示か */
  isRedInk: boolean;
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
  if (/見逃/.test(label) || /Ⓚ|ꓘ/.test(label)) return true;
  if (/空振|バント|振逃|振り逃げ/.test(label)) return false;
  for (let i = ab.pitches.length - 1; i >= 0; i--) {
    const p: CanonicalPitchResult = ab.pitches[i];
    if (p === "strike") return true;
    if (p === "swinging_strike" || p === "bunt_swinging" || p === "bunt_foul") {
      return false;
    }
  }
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

/**
 * 1打席の結果・打球方向・投球履歴を、指定された記号ルール（標準 or チームルール）の表記へ変換する
 */
export function formatAtBatPlayNotation(
  ab: ScorebookV2AtBat,
  rules: ScorebookSymbolRules
): FormattedPlayNotation {
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
    if (rc === "home_run") {
      return {
        mainText: fielder ? `HR(${fielder})` : "HR",
        decorator: "hit",
        isRedInk: false,
      };
    }
    if (isBuntPlay && rules.buntMark !== "diamond_sac") {
      return {
        mainText: fielder ? `BH${fielder}` : "BH",
        decorator: "hit",
        isRedInk: false,
      };
    }
    return {
      mainText: fielder || (rc === "single" ? "H" : rc === "double" ? "2B" : "3B"),
      decorator: "hit",
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

    if (rules.strikeout === "so") {
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
    const token = inferFielderToken(dir, label, "1-3");
    const main = token.includes("-") || token === "3" ? token : `${token}-3`;
    const sacDecorator =
      rules.buntMark === "square_all_bh" || rules.buntMark === "square_sac"
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
    if (rules.flyLiner === "umbrella") {
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
    const f = inferFielderToken(dir, label, "8").slice(0, 2);
    const isFoulFly = /邪/.test(label) || /F$/i.test(dir);
    const isIf = rc === "infield_fly";
    const liner = !isIf && isLinerPlay(ab);

    if (rules.flyLiner === "umbrella") {
      if (isBuntPlay && rules.buntMark === "square_all_bh" && !liner) {
        return {
          mainText: f,
          subText: isIf ? "IF" : isFoulFly ? "F" : undefined,
          decorator: "bunt_fly_square_umbrella",
          isRedInk: false,
        };
      }
      return {
        mainText: f,
        subText: isIf
          ? "IF"
          : isBuntPlay && rules.buntMark === "b_prefix"
          ? isFoulFly
            ? "BF"
            : "B"
          : isFoulFly
          ? "F"
          : undefined,
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
        subText: isIf ? "IF" : isFoulFly ? "F" : undefined,
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
      subText: isIf ? "IF" : undefined,
      decorator:
        isBuntPlay && rules.buntMark === "square_all_bh"
          ? "sac_square"
          : "none",
      isRedInk: false,
    };
  }

  // 7. 失策出塁
  if (rc === "error") {
    const f = inferFielderToken(dir, label, "").replace(/-/g, "");
    const errSuffix = rules.advanceError === "kanji" ? "失" : "E";
    return {
      mainText: f ? `${f}${errSuffix}` : errSuffix,
      decorator: "none",
      isRedInk: false,
    };
  }

  // 8. 野手選択 (FC)
  if (rc === "fc") {
    const chain = inferFielderToken(dir, label, "");
    const fcTag = rules.advanceError === "kanji" ? "野" : "FC";
    const fcMain = chain || fcTag;
    return {
      mainText:
        isBuntPlay && rules.buntMark === "b_prefix" ? `B${fcMain}` : fcMain,
      subText: chain ? fcTag : undefined,
      decorator:
        isBuntPlay && rules.buntMark === "square_all_bh"
          ? "sac_square"
          : "none",
      isRedInk: false,
    };
  }

  // 9. ゴロ・併殺打・三重殺・守備妨害・途中断
  if (rc === "groundout" || rc === "double_play" || rc === "triple_play") {
    const rawChain = inferFielderToken(dir, label, "");
    let main = rawChain;
    if (!main) {
      main = rc === "double_play" ? "6-4-3" : "6-3";
    } else if (/^[1-9]$/.test(main) && main !== "3") {
      main = `${main}-3`;
    }
    return {
      mainText:
        isBuntPlay && rules.buntMark === "b_prefix" ? `B${main}` : main,
      subText:
        rc === "double_play"
          ? "DP"
          : rc === "triple_play"
          ? "TP"
          : undefined,
      decorator:
        isBuntPlay && rules.buntMark === "square_all_bh"
          ? "sac_square"
          : "none",
      isRedInk: false,
    };
  }

  if (rc === "interference_out") {
    return {
      mainText: rules.advanceError === "kanji" ? "守妨" : "INT",
      decorator: "none",
      isRedInk: false,
    };
  }

  // other（走塁死による打席途中断など）
  return {
    mainText: "",
    decorator: "none",
    isRedInk: false,
  };
}

