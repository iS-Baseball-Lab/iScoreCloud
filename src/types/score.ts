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
}

/** 🏟️ 試合の全状態（State） */
export interface ScoreState {
  matchId: string;
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

  // 選手情報
  batterId: string | null;
  pitcherId: string | null;
  pitchCount: number;

  status: string;
  isScorer: boolean;

  logs: PlayLogEntry[];
}

/** 🔌 API レスポンス用 */
export interface MatchResponse {
  success: boolean;
  match?: {
    id: string;
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
  };
}

/** 🌟 ScoreContext が提供する機能の型定義 */
export interface ScoreContextType {
  state: ScoreState;
  isLoading: boolean;
  isSyncing: boolean;
  isScorer: boolean;
  initMatch: (matchId: string) => Promise<void>;
  recordPitch: (result: "ball" | "strike" | "foul" | "swinging_strike" | "out") => Promise<void>;
  recordInPlay: (
    result: string,
    rbi: number,
    hits: number,
    errors: number,
    advances?: BaseAdvance[]
  ) => Promise<void>;
  changeInning: () => void;
  updateRunners: (runners: { base1: string | null; base2: string | null; base3: string | null }) => void;
  resetBatter: (playerId: string | null) => void;
  finishMatch: () => Promise<void>;
  updateMatchSettings: (settings: Partial<ScoreState>) => void;
}