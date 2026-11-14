// filepath: src/types/live-report-v2.ts

export type LiveReportOutputMode = "full" | "latest_inning" | "lineup" | "game_set";

export type LiveReportBaseNum = 1 | 2 | 3;

export type LiveReportSubType = "P" | "PH" | "PR" | "DEF";

export interface LiveReportLineupSubRecord {
  id: string;
  inning: number;
  isBottom: boolean;
  subType: LiveReportSubType;
  oldName: string;
  newName: string;
  newPosition: string;
  playerId: string | null;
}

export interface LiveReportLineupSlot {
  order: number;
  position: string; // "1"〜"9", "D" (DH), "打"
  playerId: string | null;
  playerName: string;
  substitutions: LiveReportLineupSubRecord[];
}

/**
 * 同一打者行の後ろに連結される走塁イベント（例: 「三送りバント　⚫️⚫️2塁　二塁走者飛び出し封殺　⚫️⚫️⚫️」）
 */
export interface LiveReportChainedPlay {
  id: string;
  playText: string;
  outsAfter: number;
  runnersAfter: LiveReportBaseNum[];
  runsScored: number;
}

export interface LiveReportPlayEntry {
  id: string;
  entryType: "batter" | "substitution" | "note";
  /** 打者行の場合の打順 (1〜) */
  battingOrder: number;
  /** 打者氏名（自チーム攻撃回で使用。相手攻撃回は出力時に省略） */
  batterName: string;
  /** 打撃・走塁結果本文（例: "空三振", "右前適時ヒット1点", "中前ヒット中暴投", "遊内野安打"） */
  playText: string;
  /** 応援・好守備リアクション追記（例: "❗️", "赤羽ナイスキャッチ❗️", "‼️ナイスバッティング‼️"） */
  reactionText: string;
  /** このプレー直後のアウトカウント (0〜3) */
  outsAfter: number;
  /** このプレー直後の残塁状況（3アウト時は出力時に自動非表示） */
  runnersAfter: LiveReportBaseNum[];
  /** この打席（連結走塁含む）で入った合計得点 */
  runsScored: number;
  /** 同一打者行に続けて起きた走塁死・進塁などの連結セグメント */
  chainedPlays: LiveReportChainedPlay[];
  /** 選手交代・自由メモ行のテキスト（entryType !== "batter" 時） */
  eventText: string;
}

export interface LiveReportHalfInning {
  inning: number;
  isBottom: boolean;
  entries: LiveReportPlayEntry[];
  /** null の場合は entries の runsScored 合計を自動採用。数値指定時はその得点を優先 */
  manualRunsOverride: number | null;
}

export interface LiveReportV2Document {
  version: 2;
  matchId: string | null;
  dateText: string;
  tournamentText: string;
  opponentName: string;
  venueName: string;
  startTime: string;
  endTime: string;
  /** 自チームの先攻("first"=表攻撃) / 後攻("second"=裏攻撃) */
  battingOrder: "first" | "second";
  regulationInnings: number;
  firstTeamShortName: string;
  secondTeamShortName: string;
  /** 選手名を苗字のみで出力するか */
  showSurnameOnly: boolean;
  /** 上部スタメン欄にも途中交代（→〇〇）を併記するか */
  appendSubsToTopLineup: boolean;
  /** 最終回裏の攻撃省略時に "x" を表示するか（false=サンプル通り空白） */
  showWalkoffX: boolean;
  lineup: LiveReportLineupSlot[];
  halfInnings: LiveReportHalfInning[];
  activeInning: number;
  activeIsBottom: boolean;
  nextMyOrder: number;
  nextOpponentOrder: number;
  isGameFinished: boolean;
  closingComment: string;
  reporterNames: string;
}

export interface LiveReportMatchOption {
  id: string;
  date: string;
  opponent: string;
  matchType: string;
  status: string;
  battingOrder: "first" | "second";
  innings: number;
  myScore: number;
  opponentScore: number;
  myInningScores: number[];
  opponentInningScores: number[];
  tournamentName: string | null;
  venueName: string | null;
  venueShortName: string | null;
  hasScorebook: boolean;
  hasLineup: boolean;
  lineLiveAssignees: string[];
  isMyLineLiveAssigned?: boolean;
  editorOwnerKey?: string | null;
  editorName?: string | null;
  editorUpdatedAt?: number | null;
}

export interface LiveReportRosterPlayer {
  id: string;
  name: string;
  uniformNumber: string;
  mainPosition: string | null;
}


