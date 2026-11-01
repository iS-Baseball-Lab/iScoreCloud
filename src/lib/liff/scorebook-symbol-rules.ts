// filepath: src/lib/liff/scorebook-symbol-rules.ts
import type {
  AdvanceMethodCode,
  CanonicalAtBatResult,
  CanonicalPitchResult,
  ScorebookV2AtBat,
} from "@/types/scorebook-v2";

export type ScorebookNotationMode = "standard" | "team";

export type OutMarkStyle = "roman" | "circled";
export type StrikeoutMarkStyle =
  | "k_called_reverse"
  | "k_called_circle"
  | "k_only"
  | "so";
export type WalkHbpMarkStyle = "b_db" | "bb_hbp" | "kanji";
export type HitLineStyle = "red_slash" | "parallel_bars" | "mono_bold";
export type RunMarkStyle = "red_dot" | "double_circle" | "kanji_toku";
export type PitchMarkStyle = "waseda_symbols" | "slash_swing" | "numbered_bs";
export type FlyLinerMarkStyle = "umbrella" | "paren" | "alphabet";
export type AdvanceErrorMarkStyle = "english" | "kanji";
export type PositionLabelStyle = "kanji" | "number" | "english";

export interface ScorebookSymbolRules {
  outMark: OutMarkStyle;
  strikeout: StrikeoutMarkStyle;
  walkHbp: WalkHbpMarkStyle;
  hitLine: HitLineStyle;
  runMark: RunMarkStyle;
  pitchMark: PitchMarkStyle;
  flyLiner: FlyLinerMarkStyle;
  advanceError: AdvanceErrorMarkStyle;
  positionLabel: PositionLabelStyle;
  customNote?: string;
}

/**
 * 標準（早稲田・成美堂出版式）のスコアブック記号ルール
 */
export const STANDARD_SCOREBOOK_SYMBOL_RULES: ScorebookSymbolRules = {
  outMark: "roman",
  strikeout: "k_called_reverse",
  walkHbp: "b_db",
  hitLine: "red_slash",
  runMark: "red_dot",
  pitchMark: "waseda_symbols",
  flyLiner: "umbrella",
  advanceError: "english",
  positionLabel: "kanji",
  customNote: "",
};

/**
 * チーム記号ルール未設定時の初期テンプレート（少年野球・中学硬式・草野球で人気の丸数字＋丸Kベース）
 * ※ ユーザーがスコア設定でいつでも自由に変更可能
 */
export const DEFAULT_TEAM_SCOREBOOK_SYMBOL_RULES: ScorebookSymbolRules = {
  outMark: "circled",
  strikeout: "k_called_circle",
  walkHbp: "b_db",
  hitLine: "red_slash",
  runMark: "red_dot",
  pitchMark: "waseda_symbols",
  flyLiner: "umbrella",
  advanceError: "english",
  positionLabel: "kanji",
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
    description: "ⅠⅡⅢ・反転K・B/DB・傘フライ・赤太線",
    rules: { ...STANDARD_SCOREBOOK_SYMBOL_RULES },
  },
  {
    id: "youth_senior",
    label: "少年・シニア 丸数字式",
    description: "①②③・見逃しⓀ・(8)フライ・B/DB",
    rules: {
      outMark: "circled",
      strikeout: "k_called_circle",
      walkHbp: "b_db",
      hitLine: "red_slash",
      runMark: "red_dot",
      pitchMark: "waseda_symbols",
      flyLiner: "paren",
      advanceError: "kanji",
      positionLabel: "kanji",
      customNote: "",
    },
  },
  {
    id: "numbered_modern",
    label: "球数番号・英字式",
    description: "球数番号BS・BB/HBP・8F/8L・守備英字",
    rules: {
      outMark: "circled",
      strikeout: "k_called_reverse",
      walkHbp: "bb_hbp",
      hitLine: "parallel_bars",
      runMark: "double_circle",
      pitchMark: "numbered_bs",
      flyLiner: "alphabet",
      advanceError: "english",
      positionLabel: "english",
      customNote: "",
    },
  },
  {
    id: "mono_print",
    label: "白黒印刷くっきり式",
    description: "黒太線ヒット・◎得点・コピーでも判別容易",
    rules: {
      outMark: "roman",
      strikeout: "k_called_circle",
      walkHbp: "kanji",
      hitLine: "mono_bold",
      runMark: "kanji_toku",
      pitchMark: "slash_swing",
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
    title: "安打ライン・長打記号",
    options: [
      { value: "red_slash", label: "赤太線＋斜線（標準）", sample: "赤線 ／・〃・彡" },
      { value: "parallel_bars", label: "赤太線＋塁打数バー", sample: "1〜4本バー" },
      { value: "mono_bold", label: "黒太線（白黒印刷向き）", sample: "黒太線＋斜線" },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<HitLineStyle>>,
  },
  runMark: {
    title: "本塁生還（得点）マーク",
    options: [
      { value: "red_dot", label: "中央赤丸（標準）", sample: "●" },
      { value: "double_circle", label: "二重丸", sample: "◎" },
      { value: "kanji_toku", label: "丸得マーク", sample: "㋣（得）" },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<RunMarkStyle>>,
  },
  pitchMark: {
    title: "投球（BSO）記録方式",
    options: [
      { value: "waseda_symbols", label: "早稲田記号式", sample: "○見逃 ●空振 ーB △F" },
      { value: "slash_swing", label: "斜線空振り式", sample: "○見逃 ／空振 ・B △F" },
      { value: "numbered_bs", label: "球数番号式", sample: "B/S枠に 1,2,3..." },
    ] satisfies ReadonlyArray<SymbolRuleFieldOption<PitchMarkStyle>>,
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
    title: "メンバー欄の守備位置",
    options: [
      { value: "kanji", label: "漢字（標準）", sample: "投・捕・一・遊・中" },
      { value: "number", label: "守備番号", sample: "1・2・3・6・8" },
      { value: "english", label: "英字略称", sample: "P・C・1B・SS・CF" },
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
    outMark: isOneOf(obj.outMark, ["roman", "circled"], fallback.outMark),
    strikeout: isOneOf(
      obj.strikeout,
      ["k_called_reverse", "k_called_circle", "k_only", "so"],
      fallback.strikeout
    ),
    walkHbp: isOneOf(obj.walkHbp, ["b_db", "bb_hbp", "kanji"], fallback.walkHbp),
    hitLine: isOneOf(
      obj.hitLine,
      ["red_slash", "parallel_bars", "mono_bold"],
      fallback.hitLine
    ),
    runMark: isOneOf(
      obj.runMark,
      ["red_dot", "double_circle", "kanji_toku"],
      fallback.runMark
    ),
    pitchMark: isOneOf(
      obj.pitchMark,
      ["waseda_symbols", "slash_swing", "numbered_bs"],
      fallback.pitchMark
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
  badges.push(rules.outMark === "circled" ? "①②③アウト" : "ⅠⅡⅢアウト");
  if (rules.strikeout === "k_called_reverse") badges.push("見逃し反転K");
  else if (rules.strikeout === "k_called_circle") badges.push("見逃しⓀ");
  else if (rules.strikeout === "so") badges.push("三振SO");
  else badges.push("三振K統一");

  if (rules.walkHbp === "bb_hbp") badges.push("BB/HBP");
  else if (rules.walkHbp === "kanji") badges.push("四/死");
  else badges.push("B/DB");

  if (rules.flyLiner === "paren") badges.push("(8)フライ");
  else if (rules.flyLiner === "alphabet") badges.push("8F/8L");
  else badges.push("傘フライ");

  if (rules.pitchMark === "numbered_bs") badges.push("球数番号BS");
  else if (rules.pitchMark === "slash_swing") badges.push("／空振り");

  if (rules.hitLine === "mono_bold") badges.push("白黒太線");
  else if (rules.hitLine === "parallel_bars") badges.push("塁打バー");

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
    case "hit":
    case "sac":
    case "walk":
    case "out_on_base":
    case "other":
    default:
      if (drivingBatterOrder && drivingBatterOrder > 0) {
        return `(${drivingBatterOrder})`;
      }
      return "";
  }
}

export interface FormattedPlayNotation {
  /** メイン文字列（例: "6-3", "8", "K", "B", "6E"） */
  mainText: string;
  /** サブ添字（例: 振り逃げ時の "2-3" や "WP"、3バント失敗の "3B" など） */
  subText?: string;
  /** 視覚装飾種別（SVG側で傘・直線・犠打ダイヤ・反転K・丸Kを精密描画） */
  decorator:
    | "none"
    | "umbrella"
    | "overline"
    | "sac_diamond"
    | "sac_fly_umbrella"
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

  for (const [pattern, code] of KANJI_DIR_TO_NUM) {
    if (pattern.test(dir) || pattern.test(label)) {
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
  const useRed = rules.hitLine !== "mono_bold";

  // 1. 安打系
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
        isRedInk: useRed,
      };
    }
    return {
      mainText: fielder || (rc === "single" ? "H" : rc === "double" ? "2B" : "3B"),
      decorator: "hit",
      isRedInk: useRed,
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
    const main = token.includes("-") ? token : `${token}-3`;
    return {
      mainText: main,
      decorator: "sac_diamond",
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
      return {
        mainText: f,
        subText: isIf ? "IF" : isFoulFly ? "F" : undefined,
        decorator: liner ? "overline" : "umbrella",
        isRedInk: false,
      };
    }
    if (rules.flyLiner === "paren") {
      return {
        mainText: liner ? `[${f}]` : `(${f})`,
        subText: isIf ? "IF" : isFoulFly ? "F" : undefined,
        decorator: "none",
        isRedInk: false,
      };
    }
    return {
      mainText: liner ? `${f}L` : isFoulFly ? `${f}FF` : `${f}F`,
      subText: isIf ? "IF" : undefined,
      decorator: "none",
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
    return {
      mainText: chain || fcTag,
      subText: chain ? fcTag : undefined,
      decorator: "none",
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
      mainText: main,
      subText:
        rc === "double_play"
          ? "DP"
          : rc === "triple_play"
          ? "TP"
          : undefined,
      decorator: "none",
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

