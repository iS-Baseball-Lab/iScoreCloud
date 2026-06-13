// filepath: src/types/api.ts
/* 💡 iScoreCloud 規約: 
   1. Drizzle スキーマの拡張（currentInning, isBottom 等）を即座に型定義に反映する。
   2. 試合状況の型を 'scheduled' | 'live' | 'finished' と厳格に定義し、UI分岐を容易にする。 */

import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "@/db/schema";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cloudflare Workers / Hono 環境型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** wrangler.toml で定義した Worker バインディング */
export interface WorkerEnv {
  DB: D1Database;
  ASSETS: Fetcher;
  BUCKET?: R2Bucket;
  BETTER_AUTH_URL?: string;
  NEXT_PUBLIC_API_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  LINE_CLIENT_ID?: string;
  LINE_CLIENT_SECRET?: string;
  /** 🌟 修正: Messaging API 送信用のトークンを定義 */
  LINE_CHANNEL_ACCESS_TOKEN: string;
  GEMINI_API_KEY?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Drizzle DB 型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Drizzle ORM の D1 インスタンス型（スキーマ付き） */
export type DrizzleDB = DrizzleD1Database<typeof schema>;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// better-auth ユーザー拡張型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** better-auth の user オブジェクトに additionalFields で追加した role を含む型 */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** admin プラグインが追加するロールフィールド */
  role?: string | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// チームメンバーシップ型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** /api/auth/me が返すメンバーシップ 1 件 */
export interface Membership {
  teamId: string;
  teamName: string;
  organizationName: string;
  organizationCategory?: string;
  organizationId?: string;
  role: string;
  roleLabel: string;
  status: string;
  isMainTeam: boolean;
}

/** /api/auth/me レスポンス全体 */
export interface MeResponse {
  success: boolean;
  data: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string;
    role: string;
    systemRole: string;
    memberships: Membership[];
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// match.service.ts 用リクエスト型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface CreateMatchBody {
  teamId: string;
  opponent: string;
  date: string;
  matchType: "official" | "practice";
  battingOrder: "first" | "second";
  location?: string;
  innings?: number;
  tournamentName?: string;
}

export interface UpdateMatchBody {
  opponent: string;
  date: string;
  matchType: "official" | "practice";
  battingOrder: "first" | "second";
  location?: string;
  innings?: number;
  tournamentName?: string;
}

export interface FinishMatchBody {
  myScore: number;
  opponentScore: number;
  myInningScores?: number[];
  opponentInningScores?: number[];
}

/** 🌟 修正: スコア速報に必要な詳細情報を追加 */
export interface UpdateScoreBody {
  matchId: string;
  homeScore: number;
  awayScore: number;
  inning: number;
  isBottom: boolean;
  action: string;
}

/** 🌟 修正: LINE 速報のレスポンス型 */
export interface LineReportResponse {
  success: boolean;
  error?: string;
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// getMatchesByTeam の戻り値型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 🌟 拡張：試合一覧や詳細で扱う試合データの型
 */
export interface MatchRow {
  id: string;
  teamId: string;
  opponent: string;
  date: string;
  matchType: "official" | "practice";
  battingOrder: "first" | "second";

  // 🏟️ 現場状況（追加カラム）
  currentInning: number;
  isBottom: boolean;
  isTiebreaker: boolean;
  isColdGame: boolean;

  venueId: string | null;
  surfaceDetails: string | null;
  innings: number; // 規定イニング (7 or 9)

  status: 'scheduled' | 'live' | 'finished';

  myScore: number;
  opponentScore: number;
  myInningScores: number[]; // JSON.parse 後の配列として定義
  opponentInningScores: number[]; // JSON.parse 後の配列として定義

  weather: string | null;
  tournamentName?: string | null;
  venueName?: string | null;
}

/**
 * 🌟 追加：イニング更新用のペイロード型
 */
export interface UpdateInningPayload {
  matchId: string;
  currentInning: number;
  isBottom: boolean;
  myScore: number;
  opponentScore: number;
  action: string; // 速報用テキスト
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⚾️ スコア表示・速報用ユーティリティ型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface InningDetail {
  number: number;
  isBottom: boolean;
}

export interface InningRow {
  teamType: "home" | "away";
  inningNumber: number;
  runs: number;
}

export interface ScoreSet {
  home: number;
  away: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Player 統計型（team/page.tsx など）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface PlayerStatRow {
  playerId?: string;
  atBats?: number;
  hits?: number;
  homeRuns?: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// lineup/page.tsx 用型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface LineupPlayer {
  id: string;
  name: string;
  uniformNumber: string;
  primaryPosition: string | null;
}

export interface LineupSlot {
  playerId: string | null;
  position: string | null;
}
