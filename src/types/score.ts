// filepath: src/types/score.ts

/** ⚾️ ベース進塁情報 */
export interface BaseAdvance {
  runnerId: string;
  fromBase: 0 | 1 | 2 | 3;
  toBase: 1 | 2 | 3 | 4;
}

/** 📝 プレイログ entry */
export interface PlayLogEntry {
  id: string;
  description: string;
  inning: number;
  isTop: boolean;
  timestamp: number;
  coordinate?: { x: number; y: number }; // 🌟 将来のスプレーチャート用座標
}

/** 🏟️ 試合の全状態（State） */
export interface ScoreState {
  matchId: string;
  teamId?: string; // 🌟 Added
  tournamentName?: string;
  venueName?: string;
  opponentTeamName?: string;
  matchType?: string;

  // カウント・状況
  inning: number;
  isTop: boolean;
  balls: number;
  strikes: number;
  outs: number;
  runners: {
    base1: string | null;
    base2: string | null;
    base3: string | null
  };

  // スコア関連
  myScore: number;
  opponentScore: number;
  myInningScores: number[];
  opponentInningScores: number[];
  myHits: number;
  opponentHits: number;
  myErrors: number;
  opponentErrors: number;

  // 設定
  maxInnings: number;
  isGuestFirst: boolean;

  // スタメン情報
  myLineup?: any[];
  opponentLineup?: any[];

  // 選手情報
  batterId: string | null;
  pitcherId: string | null;
  pitchCount: number;
  myBattingIndex: number;
  opponentBattingIndex: number;

  status: string;
  isScorer: boolean;

  // ログ・履歴
  logs: PlayLogEntry[];
  history?: ScoreState[];
  lockedBy?: { userId: string; userName: string } | null;
}

/** 🔌 API レスポンス用 */
export interface MatchResponse {
  success: boolean;
  match?: {
    id: string;
    teamId?: string; // 🌟 Added
    status: string;
    myScore: number;
    opponentScore: number;
    myInningScores: string;
    opponentInningScores: string;
    battingOrder: 'first' | 'second';
    currentInning: number;
    isBottom: boolean;
    innings: number;
    opponent: string;
    surfaceDetails?: string;
    tournamentName?: string;
    matchType?: string;
    balls?: number;
    strikes?: number;
    outs?: number;
    runners?: any;
    myHits?: number;
    opponentHits?: number;
    myErrors?: number;
    opponentErrors?: number;
    locked_by_user_id?: string | null;
    locked_by_user_name?: string | null;
    locked_at?: number | null;
    lock_expires_at?: number | null;
  };
}

/** 🌟 ScoreContext が提供する機能の型定義 */
export interface ScoreContextType {
  state: ScoreState;
  isLoading: boolean;
  isSyncing: boolean;
  isScorer: boolean;
  initMatch: (matchId: string) => Promise<void>;
  recordPitch: (result: "ball" | "strike" | "foul" | "swinging_strike" | "out" | "hbp") => Promise<void>;
  recordInPlay: (
    result: string,
    rbi: number,
    hits: number,
    errors: number,
    advances?: BaseAdvance[],
    coordinate?: { x: number; y: number } // 🌟 将来のスプレーチャート用座標
  ) => Promise<void>;
  recordRunnerAction: (
    baseNum: 1 | 2 | 3,
    action: "steal_success" | "steal_out" | "pickoff_out" | "pickoff_safe" | "wp_advance" | "pb_advance" | "balk_advance" | "error_advance" | "hit_advance" | "clear",
    assignPlayerId?: string,
    targetBase?: 2 | 3 | 4
  ) => Promise<void>;
  changeInning: () => void;
  updateRunners: (runners: { base1: string | null; base2: string | null; base3: string | null }) => void;
  resetBatter: (playerId: string | null) => void;
  undo: () => void;
  finishMatch: () => Promise<void>;
  resetMatch: () => Promise<boolean>; // 🌟 追加
  updateMatchSettings: (settings: Partial<ScoreState>) => void;
  substitutePlayer: (
    team: 'my' | 'opponent',
    orderIndex: number,
    newPlayerId: string,
    newPlayerName: string,
    uniformNumber?: string,
    position?: string
  ) => void;
  acquireLock: () => Promise<boolean>;
  releaseLock: () => Promise<void>;
  forceAcquireLock: () => Promise<void>;
  refreshMatch: (matchId: string) => Promise<void>;
}