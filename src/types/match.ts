// filepath: src/types/match.ts
/* 💡 iScoreCloud 規約: 
   1. Match型を Matches 構造に同期。
   2. LINE Webhook からの groupId 取得および Push 送信用の型を完備。 */

/** 試合種別、攻守、ベンチ位置、ステータス */
export type MatchType = 'official' | 'practice' | 'exchange' | 'other';
export type BattingOrder = 'first' | 'second';
export type BenchSide = '1B' | '3B' | 'unknown';
export type MatchStatus = 'scheduled' | 'live' | 'finished' | 'rainout';

/** 🧢 試合当日の保護者・スタッフ役割担当1枠 */
export interface MatchStaffRoleAssignment {
  roleKey: string;
  roleLabel: string;
  assignees: string[];
  note?: string;
}

export type MatchMealOption =
  | 'none'
  | 'lunch_and_snack'
  | 'lunch_only'
  | 'snack_only'
  | 'no_meal';

export type MatchCarpoolMode =
  | 'auto'
  | 'away_carpool'
  | 'local_gather'
  | 'no_carpool'
  | 'none';

/** 🎒 試合当日のしおり・役割担当・遠征配車メモ（matches.match_day_ops JSON） */
export interface MatchDayOps {
  gatherTime?: string;
  gatherPlace?: string;
  uniform?: string;
  meal?: MatchMealOption;
  mealNote?: string;
  belongingsNote?: string;
  carpoolMode?: MatchCarpoolMode;
  linkedEventId?: string | null;
  carLimitNote?: string;
  cargoCarMember?: string;
  carpoolSummaryNote?: string;
  staffRoles?: MatchStaffRoleAssignment[];
}

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
  benchSide?: BenchSide | null;
  venueId?: string | null;
  surfaceDetails?: string;
  tournamentName?: string;
  venueName?: string;
  venueShortName?: string | null;
  venueAddress?: string | null;
  venueMapUrl?: string | null;
  venueEmbedMapUrl?: string | null;
  venueCategory?: string | null;
  venueSurfaceType?: string | null;
  venueParkingInfo?: string | null;
  venueSpikeRule?: string | null;
  venueNotes?: string | null;
  matchDayOps?: MatchDayOps | null;
  innings?: number;
  myInningScores?: (number | null)[];
  opponentInningScores?: (number | null)[];
  myHits?: number | null;
  opponentHits?: number | null;
  myErrors?: number | null;
  opponentErrors?: number | null;
  liveMyScore?: number;
  liveOpponentScore?: number;
  liveMyInningScores?: (number | null)[];
  liveOpponentInningScores?: (number | null)[];
  liveStatus?: 'none' | 'draft' | 'completed';
  lockedByUserName?: string | null;
  isWalkOff?: boolean; // 💡 サヨナラ勝ちの「x」表示用
  youtubeUrl?: string | null;
  hasScorebook?: boolean; // 💡 スコアブック（打席・個人成績データ）取込済み判定
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
