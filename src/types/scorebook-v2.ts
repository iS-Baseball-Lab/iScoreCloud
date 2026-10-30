// filepath: src/types/scorebook-v2.ts

export type CanonicalAtBatResult =
  | "single"
  | "double"
  | "triple"
  | "home_run"
  | "walk"
  | "intentional_walk"
  | "hit_by_pitch"
  | "interference"
  | "sac_bunt"
  | "sac_fly"
  | "groundout"
  | "flyout"
  | "infield_fly"
  | "strikeout"
  | "dropped_third_strike_out"
  | "dropped_third_strike"
  | "double_play"
  | "triple_play"
  | "interference_out"
  | "error"
  | "fc"
  | "other";

export type CanonicalPitchResult =
  | "ball"
  | "strike"
  | "swinging_strike"
  | "bunt_swinging"
  | "foul"
  | "bunt_foul"
  | "pickoff_1b"
  | "pickoff_2b"
  | "pickoff_3b"
  | "pickoff"
  | "balk"
  | "in_play"
  | "hit"
  | "hbp";

export function isPickoffPitch(code: CanonicalPitchResult): boolean {
  return (
    code === "pickoff_1b" ||
    code === "pickoff_2b" ||
    code === "pickoff_3b" ||
    code === "pickoff"
  );
}

/** 牽制球・ボークなど「投手の正式投球数（球数）およびB/Sカウントに含めない」マウンドイベントか判定 */
export function isNonPitchMoundEvent(code: CanonicalPitchResult): boolean {
  return isPickoffPitch(code) || code === "balk";
}

export type BaseCode = "BAT" | "1B" | "2B" | "3B" | "HP";

export type AdvanceMethodCode =
  | "hit"
  | "walk"
  | "error"
  | "fc"
  | "sac"
  | "throw_advance"
  | "steal"
  | "caught_stealing"
  | "pickoff_out"
  | "pickoff_error"
  | "wp"
  | "pb"
  | "balk"
  | "obstruction"
  | "interference_out"
  | "appeal_out"
  | "tiebreak"
  | "out_on_base"
  | "other";

/** Gemini 2D 正規化座標 [ymin, xmin, ymax, xmax] (0〜1000) */
export type NormalizedBox = [number, number, number, number];

/** シート上の正規化2D点座標 [x, y] (0〜1000) */
export type NormalizedPoint = [number, number];

/** 斜め撮影・台形歪みにも対応する打席グリッド4隅座標 (0〜1000) */
export interface ScorebookGridCorners {
  /** 1回左端 × 1番打者上端 [x, y] */
  tl: NormalizedPoint;
  /** 最終回右端 × 1番打者上端 [x, y] */
  tr: NormalizedPoint;
  /** 最終回右端 × 最終打者下端 [x, y] */
  br: NormalizedPoint;
  /** 1回左端 × 最終打者下端 [x, y] */
  bl: NormalizedPoint;
}

export type ImportScopeMode = "both" | "top_only" | "bottom_only";

export type ConfidenceLevel = "high" | "medium" | "low";

export interface ScorebookSubstitution {
  id: string;
  inningEntered: number;
  subType: "PH" | "PR" | "TR" | "DEF";
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
  /** シート全体画像上での該当打順行の上下座標 [ymin, xmin, ymax, xmax] (0〜1000) */
  rowBox?: NormalizedBox;
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
  /** 打順・選手名欄と1回列の境界X座標 (0〜1000) */
  lineupRightX?: number;
  /** 斜め・台形歪みに追従する打席グリッド（1回〜最終回 × 1番〜最終打順）の4隅座標 */
  gridCorners?: ScorebookGridCorners;
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
  id: string;
  code: CanonicalAtBatResult;
  shortLabel: string;
  defaultLabel: string;
  group: "hit" | "walk_sac" | "out" | "reach";
  defaultOuts: number;
}

export const AT_BAT_RESULT_PRESETS: AtBatResultPreset[] = [
  { id: "single", code: "single", shortLabel: "単打", defaultLabel: "安打", group: "hit", defaultOuts: 0 },
  { id: "double", code: "double", shortLabel: "二塁打", defaultLabel: "二塁打", group: "hit", defaultOuts: 0 },
  { id: "triple", code: "triple", shortLabel: "三塁打", defaultLabel: "三塁打", group: "hit", defaultOuts: 0 },
  { id: "home_run", code: "home_run", shortLabel: "本塁打", defaultLabel: "本塁打", group: "hit", defaultOuts: 0 },
  { id: "walk", code: "walk", shortLabel: "四球", defaultLabel: "四球", group: "walk_sac", defaultOuts: 0 },
  { id: "intentional_walk", code: "intentional_walk", shortLabel: "敬遠四球", defaultLabel: "申告敬遠", group: "walk_sac", defaultOuts: 0 },
  { id: "hit_by_pitch", code: "hit_by_pitch", shortLabel: "死球", defaultLabel: "死球", group: "walk_sac", defaultOuts: 0 },
  { id: "interference", code: "interference", shortLabel: "打撃妨害", defaultLabel: "打撃妨害 (INT)", group: "walk_sac", defaultOuts: 0 },
  { id: "sac_bunt", code: "sac_bunt", shortLabel: "犠打", defaultLabel: "犠打", group: "walk_sac", defaultOuts: 1 },
  { id: "sac_fly", code: "sac_fly", shortLabel: "犠飛", defaultLabel: "犠飛", group: "walk_sac", defaultOuts: 1 },
  { id: "groundout", code: "groundout", shortLabel: "ゴロ/封殺", defaultLabel: "内ゴロ", group: "out", defaultOuts: 1 },
  { id: "flyout", code: "flyout", shortLabel: "フライ/邪飛", defaultLabel: "飛球", group: "out", defaultOuts: 1 },
  { id: "lineout", code: "flyout", shortLabel: "ライナー", defaultLabel: "直（ライナー）", group: "out", defaultOuts: 1 },
  { id: "infield_fly", code: "infield_fly", shortLabel: "インフィールドF", defaultLabel: "インフィールドフライ", group: "out", defaultOuts: 1 },
  { id: "so_swing", code: "strikeout", shortLabel: "空振り三振", defaultLabel: "空振り三振", group: "out", defaultOuts: 1 },
  { id: "so_look", code: "strikeout", shortLabel: "見逃し三振", defaultLabel: "見逃し三振", group: "out", defaultOuts: 1 },
  { id: "so_3bunt", code: "strikeout", shortLabel: "3バント失敗", defaultLabel: "スリーバント失敗", group: "out", defaultOuts: 1 },
  { id: "dropped_third_strike_out", code: "dropped_third_strike_out", shortLabel: "振逃アウト", defaultLabel: "振り逃げアウト (K 2-3)", group: "out", defaultOuts: 1 },
  { id: "dropped_third_strike", code: "dropped_third_strike", shortLabel: "振逃セーフ", defaultLabel: "振り逃げ出塁", group: "reach", defaultOuts: 0 },
  { id: "double_play", code: "double_play", shortLabel: "併殺打", defaultLabel: "併殺打", group: "out", defaultOuts: 2 },
  { id: "triple_play", code: "triple_play", shortLabel: "三重殺", defaultLabel: "三重殺 (TP)", group: "out", defaultOuts: 3 },
  { id: "interference_out", code: "interference_out", shortLabel: "守備妨害", defaultLabel: "守備妨害アウト (INT)", group: "out", defaultOuts: 1 },
  { id: "error", code: "error", shortLabel: "失策出塁", defaultLabel: "失策出塁", group: "reach", defaultOuts: 0 },
  { id: "fc", code: "fc", shortLabel: "野選出塁", defaultLabel: "野選", group: "reach", defaultOuts: 0 },
  { id: "other", code: "other", shortLabel: "途中断/他", defaultLabel: "打席途中断（走塁死チェンジ）", group: "reach", defaultOuts: 0 },
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
    code: "bunt_foul",
    shortLabel: "バントF",
    badgeLabel: "BF バントファウル",
    toneClass: "bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/30",
  },
  {
    code: "bunt_swinging",
    shortLabel: "バント空S",
    badgeLabel: "BS バント空振り",
    toneClass: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30",
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
  {
    code: "pickoff_1b",
    shortLabel: "1塁牽制",
    badgeLabel: "牽1 1塁牽制",
    toneClass: "bg-slate-500/15 text-slate-700 dark:text-slate-200 border-slate-500/35",
  },
  {
    code: "pickoff_2b",
    shortLabel: "2塁牽制",
    badgeLabel: "牽2 2塁牽制",
    toneClass: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/35",
  },
  {
    code: "pickoff_3b",
    shortLabel: "3塁牽制",
    badgeLabel: "牽3 3塁牽制",
    toneClass: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/35",
  },
  {
    code: "balk",
    shortLabel: "ボーク",
    badgeLabel: "BK ボーク",
    toneClass: "bg-amber-600/15 text-amber-800 dark:text-amber-200 border-amber-600/35",
  },
];

export const LEGACY_PICKOFF_PRESET: PitchResultPreset = {
  code: "pickoff",
  shortLabel: "牽制",
  badgeLabel: "牽 牽制（塁未指定）",
  toneClass: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
};

export const ADVANCE_METHOD_LABELS: Record<AdvanceMethodCode, string> = {
  hit: "安打・打撃進塁",
  walk: "四死球・妨害押出",
  error: "失策・悪送球 (E)",
  fc: "野手選択 (FC/OB)",
  sac: "犠打・犠飛・タッチアップ",
  throw_advance: "送球間進塁 (T)",
  steal: "盗塁 (S)",
  caught_stealing: "盗塁死 (CS)",
  pickoff_out: "牽制死 (PO)",
  pickoff_error: "牽制悪送球",
  wp: "暴投 (WP)",
  pb: "捕逸 (PB)",
  balk: "ボーク進塁 (BK)",
  obstruction: "走塁妨害 (OBS)",
  interference_out: "守備妨害死 (INT)",
  appeal_out: "アピール・離塁死",
  tiebreak: "タイブレーク走者",
  out_on_base: "走塁死・封殺・挟殺",
  other: "その他進塁",
};

/** 骨格スキャン・各イニング解析の所要時間レコード */
export interface ScorebookTimingEntry {
  key: string;
  isTop: boolean;
  innings: number[];
  label: string;
  durationMs: number;
  fromCache?: boolean;
  status?: "success" | "error";
  errorDetail?: string;
}

/** スコアブックAI解析のトータル秒数・イニング別秒数サマリー */
export interface ScorebookAnalysisTimingSummary {
  structureTotalMs?: number;
  structureEntries?: ScorebookTimingEntry[];
  deepTotalMs: number;
  inningEntries: ScorebookTimingEntry[];
}

/** ミリ秒を「8.4秒」のような小数1桁秒表記へフォーマットする */
export function formatElapsedSeconds(ms: number): string {
  const safeMs = Math.max(0, ms);
  return `${(safeMs / 1000).toFixed(1)}秒`;
}

/** トータルミリ秒を「74.2秒（1分14秒）」のように秒数メイン＋分秒併記へフォーマットする */
export function formatTotalElapsedSeconds(ms: number): string {
  const safeMs = Math.max(0, ms);
  const secStr = `${(safeMs / 1000).toFixed(1)}秒`;
  if (safeMs < 60000) {
    return secStr;
  }
  const totalWholeSec = Math.round(safeMs / 1000);
  const mins = Math.floor(totalWholeSec / 60);
  const remSec = totalWholeSec % 60;
  return `${secStr}（${mins}分${remSec}秒）`;
}

/** 打順の抜け・飛び自動補正で比較対象とする候補マス指定 */
export interface MissingOrderCandidateSpec {
  inning: number;
  columnIndex: number;
  role: "single_inning" | "prev_inning_tail" | "next_inning_head";
}

/** 確定済み打順の循環則から検出された「抜けている打順（例: 1回4番終了→2回6番開始の間の5番）」の定義 */
export interface MissingOrderGapSpec {
  gapId: string;
  battingOrder: number;
  batterName: string;
  kind: "lead_off_1st" | "intra_inning" | "inter_inning";
  /** intra_inning / lead_off_1st の挿入先イニング */
  targetInning?: number;
  /** intra_inning で直前に存在する打席ID（その直後へ挿入） */
  insertAfterAtBatId?: string;
  /** inter_inning の前イニング番号（例: 1） */
  prevInning?: number;
  /** inter_inning の次イニング番号（例: 2） */
  nextInning?: number;
  candidates: MissingOrderCandidateSpec[];
  contextHint: string;
}

export interface ResolvedMissingAtBatItem {
  gapId: string;
  atBat: ScorebookV2AtBat;
}

/** 1イニングが3アウトを超過している（4アウト・5アウト等）イニングの再検算用打席項目 */
export interface ExcessOutBatterItemSpec {
  slotKey: string;
  atBatId: string;
  columnIndex: number;
  battingOrder: number;
  batterName: string;
  currentResultCode: CanonicalAtBatResult;
  currentResultLabel: string;
  currentDirection: string;
  currentOutsInPlay: number;
  currentEndingOuts: number;
}

/** 1イニング合計アウトが3アウトを超過しているイニングのピンポイント視覚再検算仕様 */
export interface ExcessOutInningSpec {
  inning: number;
  confirmedRuns: number;
  currentTotalOuts: number;
  expectedLeadOffOrder: number;
  nextInningLeadOffOrder?: number;
  batters: ExcessOutBatterItemSpec[];
}




