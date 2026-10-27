// filepath: src/types/scorebook-v2.ts

export type CanonicalAtBatResult =
  | "single"
  | "double"
  | "triple"
  | "home_run"
  | "walk"
  | "hit_by_pitch"
  | "strikeout"
  | "dropped_third_strike"
  | "groundout"
  | "flyout"
  | "double_play"
  | "sac_bunt"
  | "sac_fly"
  | "error"
  | "fc"
  | "other";

export type CanonicalPitchResult =
  | "ball"
  | "strike"
  | "swinging_strike"
  | "foul"
  | "in_play"
  | "hit"
  | "pickoff"
  | "hbp";

export type BaseCode = "BAT" | "1B" | "2B" | "3B" | "HP";

export type AdvanceMethodCode =
  | "hit"
  | "walk"
  | "error"
  | "fc"
  | "sac"
  | "steal"
  | "caught_stealing"
  | "pickoff_out"
  | "pickoff_error"
  | "wp"
  | "pb"
  | "balk"
  | "out_on_base"
  | "other";

/** Gemini 2D 正規化座標 [ymin, xmin, ymax, xmax] (0〜1000) */
export type NormalizedBox = [number, number, number, number];

export type ImportScopeMode = "both" | "top_only" | "bottom_only";

export type ConfidenceLevel = "high" | "medium" | "low";

export interface ScorebookSubstitution {
  id: string;
  inningEntered: number;
  subType: "PH" | "PR" | "DEF";
  name: string;
  uniformNumber: string;
  position: string;
  playerId: string | null;
}

export interface ScorebookBatterSlot {
  battingOrder: number;
  name: string;
  uniformNumber: string;
  position: string;
  playerId: string | null;
  substitutions: ScorebookSubstitution[];
}

export interface ScorebookPitcherStint {
  id: string;
  order: number;
  name: string;
  uniformNumber: string;
  playerId: string | null;
  fromInning: number;
  toInning: number;
}

export interface ScorebookInningMeta {
  inning: number;
  columnCount: number;
  runs: number;
  hits: number;
  columnBox?: NormalizedBox;
}

export interface ScorebookSheetStructure {
  isTop: boolean;
  isMyTeamBatting: boolean;
  batters: ScorebookBatterSlot[];
  pitchers: ScorebookPitcherStint[];
  innings: ScorebookInningMeta[];
  totalRuns: number;
  totalHits: number;
  totalErrors: number;
}

export interface ScorebookV2Advance {
  id: string;
  runnerName: string;
  from: "BAT" | "1B" | "2B" | "3B";
  to: "1B" | "2B" | "3B" | "HP";
  method: AdvanceMethodCode;
  isOut: boolean;
  pitchNumber?: number;
}

export interface ScorebookV2AtBat {
  id: string;
  inning: number;
  isTop: boolean;
  columnIndex: number;
  battingOrder: number;
  batterName: string;
  batterPlayerId: string | null;
  pitcherName: string;
  pitcherPlayerId: string | null;
  resultCode: CanonicalAtBatResult;
  resultLabel: string;
  battedDirection: string;
  rbi: number;
  outsInPlay: number;
  endingOuts: number;
  runsInPlay: number;
  balls: number;
  strikes: number;
  pitches: CanonicalPitchResult[];
  advances: ScorebookV2Advance[];
  confidence: ConfidenceLevel;
  confidenceReason?: string;
  cellBox?: NormalizedBox;
}

export interface ScorebookValidationIssue {
  id: string;
  severity: "error" | "warning";
  atBatId?: string;
  inning: number;
  isTop: boolean;
  battingOrder?: number;
  category: "outs" | "runs" | "order" | "runner" | "count" | "confidence";
  message: string;
  suggestion?: string;
}

export interface ScorebookRosterPlayer {
  id: string;
  name: string;
  nameKana: string | null;
  uniformNumber: string;
  primaryPosition: string | null;
}

export interface ScorebookMatchSummary {
  id: string;
  opponent: string;
  date: string;
  matchType: "official" | "practice" | "exchange";
  tournamentName: string | null;
  battingOrder: "first" | "second";
  innings: number;
  status: string;
  myScore: number;
  opponentScore: number;
  myInningScores: number[];
  opponentInningScores: number[];
  hasExistingAtBats: boolean;
}

export interface AtBatResultPreset {
  code: CanonicalAtBatResult;
  shortLabel: string;
  defaultLabel: string;
  group: "hit" | "walk_sac" | "out" | "reach";
  defaultOuts: number;
}

export const AT_BAT_RESULT_PRESETS: AtBatResultPreset[] = [
  { code: "single", shortLabel: "単打", defaultLabel: "安打", group: "hit", defaultOuts: 0 },
  { code: "double", shortLabel: "二塁打", defaultLabel: "二塁打", group: "hit", defaultOuts: 0 },
  { code: "triple", shortLabel: "三塁打", defaultLabel: "三塁打", group: "hit", defaultOuts: 0 },
  { code: "home_run", shortLabel: "本塁打", defaultLabel: "本塁打", group: "hit", defaultOuts: 0 },
  { code: "walk", shortLabel: "四球", defaultLabel: "四球", group: "walk_sac", defaultOuts: 0 },
  { code: "hit_by_pitch", shortLabel: "死球", defaultLabel: "死球", group: "walk_sac", defaultOuts: 0 },
  { code: "sac_bunt", shortLabel: "犠打", defaultLabel: "犠打", group: "walk_sac", defaultOuts: 1 },
  { code: "sac_fly", shortLabel: "犠飛", defaultLabel: "犠飛", group: "walk_sac", defaultOuts: 1 },
  { code: "groundout", shortLabel: "ゴロ", defaultLabel: "内ゴロ", group: "out", defaultOuts: 1 },
  { code: "flyout", shortLabel: "飛/直", defaultLabel: "飛球", group: "out", defaultOuts: 1 },
  { code: "strikeout", shortLabel: "三振", defaultLabel: "三振", group: "out", defaultOuts: 1 },
  { code: "double_play", shortLabel: "併殺打", defaultLabel: "併殺打", group: "out", defaultOuts: 2 },
  { code: "error", shortLabel: "失策", defaultLabel: "失策出塁", group: "reach", defaultOuts: 0 },
  { code: "fc", shortLabel: "野選", defaultLabel: "野選", group: "reach", defaultOuts: 0 },
  { code: "dropped_third_strike", shortLabel: "振り逃げ", defaultLabel: "振り逃げ", group: "reach", defaultOuts: 0 },
  { code: "other", shortLabel: "その他", defaultLabel: "その他", group: "reach", defaultOuts: 0 },
];

export interface PitchResultPreset {
  code: CanonicalPitchResult;
  shortLabel: string;
  badgeLabel: string;
  toneClass: string;
}

export const PITCH_RESULT_PRESETS: PitchResultPreset[] = [
  {
    code: "ball",
    shortLabel: "ボール",
    badgeLabel: "B ボール",
    toneClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  },
  {
    code: "strike",
    shortLabel: "見逃しS",
    badgeLabel: "S 見逃し",
    toneClass: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  },
  {
    code: "swinging_strike",
    shortLabel: "空振りS",
    badgeLabel: "S 空振り",
    toneClass: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
  },
  {
    code: "foul",
    shortLabel: "ファウル",
    badgeLabel: "F ファウル",
    toneClass: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  },
  {
    code: "pickoff",
    shortLabel: "牽制",
    badgeLabel: "牽 牽制球",
    toneClass: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
  },
  {
    code: "hit",
    shortLabel: "安打球",
    badgeLabel: "安 ヒット",
    toneClass: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  },
  {
    code: "in_play",
    shortLabel: "インプレー",
    badgeLabel: "打 インプレー",
    toneClass: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30",
  },
  {
    code: "hbp",
    shortLabel: "死球",
    badgeLabel: "死 デッドボール",
    toneClass: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
  },
];

export const ADVANCE_METHOD_LABELS: Record<AdvanceMethodCode, string> = {
  hit: "安打・打撃進塁",
  walk: "四死球押し出し",
  error: "失策・悪送球",
  fc: "野手選択",
  sac: "犠打・犠飛進塁",
  steal: "盗塁 (S)",
  caught_stealing: "盗塁死 (CS)",
  pickoff_out: "牽制死 (PO)",
  pickoff_error: "牽制悪送球",
  wp: "暴投 (WP)",
  pb: "捕逸 (PB)",
  balk: "ボーク (BK)",
  out_on_base: "走塁死・封殺",
  other: "その他進塁",
};

