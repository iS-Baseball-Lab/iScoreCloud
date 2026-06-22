// filepath: src/types/match.ts
/* 💡 iScoreCloud 規約: 
   1. Match型を Matches 構造に同期。
   2. LINE Webhook からの groupId 取得および Push 送信用の型を完備。 */

/** 試合種別、攻守、ステータス */
export type MatchType = 'official' | 'practice' | 'exchange' | 'other';
export type BattingOrder = 'first' | 'second';
export type MatchStatus = 'scheduled' | 'live' | 'finished';

/** 💡 チーム・LINE連携用の定義 */
export interface Team {
  id: string;
  name: string;
  lineGroupId?: string;
  isAutoReportEnabled: boolean;
  reportPlayballEnabled: boolean;
  reportInningEnabled: boolean;
  reportGameSetEnabled: boolean;
}

export interface Match {
  id: string;
  opponent: string;
  date: string;
  myScore: number;
  opponentScore: number;

  // 🌟 ライブ情報を追加
  currentInning?: number;   // 現在の回 (1, 2, 3...)
  isBottom?: boolean;      // 裏かどうか (false: 表, true: 裏)
  venue?: string;          // 球場
  tournament?: string;     // 大会名

  status: MatchStatus;
  matchType: MatchType;
  battingOrder: BattingOrder;
  surfaceDetails?: string;
  tournamentName?: string;
  venueName?: string;
  venueShortName?: string | null;
  innings?: number;
  myInningScores?: (number | null)[];
  opponentInningScores?: (number | null)[];
  isWalkOff?: boolean; // 💡 サヨナラ勝ちの「x」表示用
}

/** 💡 LINE Messaging API 用レスポンス型 */
export interface LinePostResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

/** 💡 LINE Webhook イベント（groupId 取得用） */
export interface LineWebhookEvent {
  type: string;
  source: {
    type: 'user' | 'group' | 'room';
    userId?: string;
    groupId?: string;
    roomId?: string;
  };
  message?: {
    type: string;
    text: string;
  };
  replyToken: string;
  timestamp: number;
}

export interface LineWebhookRequest {
  destination: string;
  events: LineWebhookEvent[];
}
