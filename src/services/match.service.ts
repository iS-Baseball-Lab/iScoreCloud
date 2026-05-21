// src/services/match.service.ts
import { eq, desc } from "drizzle-orm";
import { matches, tournaments } from "@/db/schema/match";
import { playLogs } from "@/db/schema/score";
import type {
  DrizzleDB,
  CreateMatchBody,
  UpdateMatchBody,
  FinishMatchBody,
  MatchRow,
  InningRow,
} from "@/types/api";

// 💡 データベース操作（ビジネスロジック）だけを担当する「サービス層」
export const MatchService = {

  // 1. 試合一覧の取得
  async getMatchesByTeam(db: DrizzleDB, teamId: string): Promise<MatchRow[]> {
    const rows = await db.select({
      id: matches.id,
      teamId: matches.teamId,
      opponent: matches.opponent,
      date: matches.date,
      myScore: matches.myScore,
      opponentScore: matches.opponentScore,
      status: matches.status,
      matchType: matches.matchType,
      battingOrder: matches.battingOrder,
      surfaceDetails: matches.surfaceDetails,
      tournamentName: tournaments.name,
      innings: matches.innings,
      myInningScores: matches.myInningScores,
      opponentInningScores: matches.opponentInningScores,
      currentInning: matches.currentInning,
      isBottom: matches.isBottom,
      isTiebreaker: matches.isTiebreaker,
      isColdGame: matches.isColdGame,
      venueId: matches.venueId,
      weather: matches.weather,
    })
      .from(matches)
      .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
      .where(eq(matches.teamId, teamId))
      .orderBy(desc(matches.date))
      .all();

    // DBのJSON文字列を配列に変換してフロントエンドに返す
    return rows.map((r) => ({
      ...r,
      // status / matchType / battingOrder はスキーマ上 string だがアプリ内では限定値のみ使用
      status: r.status as "scheduled" | "live" | "finished",
      matchType: r.matchType as "official" | "practice",
      battingOrder: r.battingOrder as "first" | "second",
      myInningScores: JSON.parse(r.myInningScores ?? "[]") as number[],
      opponentInningScores: JSON.parse(r.opponentInningScores ?? "[]") as number[],
    }));
  },

  // 2. 特定の試合の取得
  async getMatchById(db: DrizzleDB, matchId: string) {
    return await db.select({
      id: matches.id,
      teamId: matches.teamId,
      opponent: matches.opponent,
      date: matches.date,
      matchType: matches.matchType,
      battingOrder: matches.battingOrder,
      benchSide: matches.benchSide,
      status: matches.status,
      surfaceDetails: matches.surfaceDetails,
      innings: matches.innings,
      tournamentName: tournaments.name,
      myScore: matches.myScore,
      opponentScore: matches.opponentScore,
      myInningScores: matches.myInningScores,
      opponentInningScores: matches.opponentInningScores,
      currentInning: matches.currentInning,
      isBottom: matches.isBottom,
      balls: matches.balls,
      strikes: matches.strikes,
      outs: matches.outs,
      runners: matches.runners,
      myHits: matches.myHits,
      opponentHits: matches.opponentHits,
      myErrors: matches.myErrors,
      opponentErrors: matches.opponentErrors,
    })
      .from(matches)
      .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
      .where(eq(matches.id, matchId))
      .get();
  },

  // 3. イニングスコアの取得と整形
  async getMatchInnings(db: DrizzleDB, matchId: string): Promise<InningRow[]> {
    const matchData = await db.select({
      myInningScores: matches.myInningScores,
      opponentInningScores: matches.opponentInningScores,
      battingOrder: matches.battingOrder,
    }).from(matches).where(eq(matches.id, matchId)).get();

    if (!matchData) return [];

    const myScores = JSON.parse(matchData.myInningScores ?? "[]") as number[];
    const oppScores = JSON.parse(matchData.opponentInningScores ?? "[]") as number[];

    const results: InningRow[] = [];
    const myTeamType: "home" | "away" = matchData.battingOrder === "first" ? "away" : "home";
    const oppTeamType: "home" | "away" = matchData.battingOrder === "first" ? "home" : "away";

    myScores.forEach((runs, i) => results.push({ teamType: myTeamType, inningNumber: i + 1, runs }));
    oppScores.forEach((runs, i) => results.push({ teamType: oppTeamType, inningNumber: i + 1, runs }));

    return results;
  },

  // 4. 大会（Tournament）の検索・作成（内部ヘルパー）
  async _resolveTournament(db: DrizzleDB, matchType: string, tournamentName?: string): Promise<string | null> {
    if (matchType !== "official" || !tournamentName) return null;

    const existingTournament = await db.select().from(tournaments)
      .where(eq(tournaments.name, tournamentName)).get();

    if (existingTournament) return existingTournament.id;

    const newId = crypto.randomUUID();
    await db.insert(tournaments).values({
      id: newId,
      name: tournamentName,
      season: new Date().getFullYear().toString(),
    });
    return newId;
  },

  // 5. 新規試合の作成
  async createMatch(db: DrizzleDB, body: CreateMatchBody): Promise<string> {
    const tournamentId = await this._resolveTournament(db, body.matchType, body.tournamentName);
    const matchId = crypto.randomUUID();

    await db.insert(matches).values({
      id: matchId,
      teamId: body.teamId,
      tournamentId,
      opponent: body.opponent,
      date: body.date,
      matchType: body.matchType,
      battingOrder: body.battingOrder,
      surfaceDetails: body.location,
      innings: body.innings,
      status: "scheduled",
    });
    return matchId;
  },

  // 6. 試合情報の更新
  async updateMatch(db: DrizzleDB, matchId: string, body: UpdateMatchBody): Promise<void> {
    const tournamentId = await this._resolveTournament(db, body.matchType, body.tournamentName);

    await db.update(matches).set({
      opponent: body.opponent,
      tournamentId,
      date: body.date,
      matchType: body.matchType,
      battingOrder: body.battingOrder,
      surfaceDetails: body.location,
      innings: body.innings,
    }).where(eq(matches.id, matchId));
  },

  // 6.5 スタメン情報の取得と保存
  async getMatchLineups(db: DrizzleDB, matchId: string) {
    const match = await db.select({
      myLineup: matches.myLineup,
      opponentLineup: matches.opponentLineup,
      myAttendance: matches.myAttendance
    }).from(matches).where(eq(matches.id, matchId)).get();
    
    return {
      myLineup: JSON.parse(match?.myLineup || '[]'),
      opponentLineup: JSON.parse(match?.opponentLineup || '[]'),
      myAttendance: JSON.parse(match?.myAttendance || '{}')
    };
  },

  async saveMatchLineups(db: DrizzleDB, matchId: string, myLineup: any[], opponentLineup: any[], myAttendance: any = {}) {
    await db.update(matches).set({
      myLineup: JSON.stringify(myLineup),
      opponentLineup: JSON.stringify(opponentLineup),
      myAttendance: JSON.stringify(myAttendance)
    }).where(eq(matches.id, matchId));
  },

  // 7. スコア結果の保存
  async finishMatch(db: DrizzleDB, matchId: string, body: FinishMatchBody): Promise<void> {
    await db.update(matches).set({
      myScore: body.myScore,
      opponentScore: body.opponentScore,
      myInningScores: JSON.stringify(body.myInningScores ?? []),
      opponentInningScores: JSON.stringify(body.opponentInningScores ?? []),
      status: "finished",
    }).where(eq(matches.id, matchId));
  },

  // 7. 試合削除
  async deleteMatch(db: DrizzleDB, matchId: string) {
    await db.delete(matches).where(eq(matches.id, matchId));
  },

  // 8. プレイログの取得
  async getPlayLogs(db: DrizzleDB, matchId: string) {
    const logs = await db.select()
      .from(playLogs)
      .where(eq(playLogs.matchId, matchId))
      .orderBy(desc(playLogs.createdAt))
      .limit(50)
      .all();
    
    // PlayLogEntry 型に合わせる
    return logs.map(log => ({
      id: log.id,
      description: log.description,
      inning: parseInt(log.inningText) || 1,
      isTop: log.inningText.includes("表"),
      timestamp: log.createdAt.getTime(),
    }));
  }
};
