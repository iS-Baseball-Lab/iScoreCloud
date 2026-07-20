// src/services/match.service.ts
import { eq, desc, sql } from "drizzle-orm";
import { matches, tournaments, venues, matchLineups } from "@/db/schema/match";
import { playLogs, atBats, baseAdvances, matchUndoHistories } from "@/db/schema/score";
import { players } from "@/db/schema/team";
import type {
  DrizzleDB,
  CreateMatchBody,
  UpdateMatchBody,
  FinishMatchBody,
  MatchRow,
  InningRow,
  AtBatEvent,
  ValidationMessage,
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
      venueName: venues.name,
      venueShortName: venues.shortName,
      innings: matches.innings,
      myInningScores: matches.myInningScores,
      opponentInningScores: matches.opponentInningScores,
      currentInning: matches.currentInning,
      isBottom: matches.isBottom,
      isTiebreaker: matches.isTiebreaker,
      isColdGame: matches.isColdGame,
      venueId: matches.venueId,
      weather: matches.weather,
      youtubeUrl: matches.youtubeUrl,
      liveMyScore: matches.liveMyScore,
      liveOpponentScore: matches.liveOpponentScore,
      liveMyInningScores: matches.liveMyInningScores,
      liveOpponentInningScores: matches.liveOpponentInningScores,
      liveStatus: matches.liveStatus,
      lockedByUserName: matches.lockedByUserName,
      venueAddress: venues.address,
      venueMapUrl: venues.mapUrl,
    })
      .from(matches)
      .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
      .leftJoin(venues, eq(matches.venueId, venues.id))
      .where(eq(matches.teamId, teamId))
      .orderBy(desc(matches.date))
      .all();

    // DBのJSON文字列を配列に変換してフロントエンドに返す
    return rows.map((r) => ({
      ...r,
      // status / matchType / battingOrder はスキーマ上 string だがアプリ内では限定値のみ使用
      status: r.status as "scheduled" | "live" | "finished" | "rainout",
      matchType: r.matchType as "official" | "practice" | "exchange",
      battingOrder: r.battingOrder as "first" | "second",
      myInningScores: JSON.parse(r.myInningScores ?? "[]") as number[],
      opponentInningScores: JSON.parse(r.opponentInningScores ?? "[]") as number[],
      liveMyInningScores: JSON.parse(r.liveMyInningScores ?? "[]") as number[],
      liveOpponentInningScores: JSON.parse(r.liveOpponentInningScores ?? "[]") as number[],
      liveStatus: r.liveStatus as "none" | "draft" | "completed",
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
      venueName: venues.name,
      venueShortName: venues.shortName,
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
      venueId: matches.venueId,
      youtubeUrl: matches.youtubeUrl,
      liveMyScore: matches.liveMyScore,
      liveOpponentScore: matches.liveOpponentScore,
      liveMyInningScores: matches.liveMyInningScores,
      liveOpponentInningScores: matches.liveOpponentInningScores,
      liveStatus: matches.liveStatus,
      lockedByUserName: matches.lockedByUserName,
      lockedByUserId: matches.lockedByUserId,
      venueAddress: venues.address,
      venueMapUrl: venues.mapUrl,
    })
      .from(matches)
      .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
      .leftJoin(venues, eq(matches.venueId, venues.id))
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
    if ((matchType !== "official" && matchType !== "exchange") || !tournamentName) return null;

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
      venueId: body.venueId || null,
      innings: body.innings,
      status: "scheduled",
    });
    return matchId;
  },

  // 6. 試合情報の更新
  async updateMatch(db: DrizzleDB, matchId: string, body: UpdateMatchBody): Promise<void> {
    const tournamentId = await this._resolveTournament(db, body.matchType, body.tournamentName);

    const updateData: any = {
      opponent: body.opponent,
      tournamentId,
      date: body.date,
      matchType: body.matchType,
      battingOrder: body.battingOrder,
      surfaceDetails: body.location,
      venueId: body.venueId !== undefined ? (body.venueId || null) : undefined,
      innings: body.innings,
      status: body.status,
      myScore: body.myScore,
      opponentScore: body.opponentScore,
      myInningScores: body.myInningScores ? JSON.stringify(body.myInningScores) : undefined,
      opponentInningScores: body.opponentInningScores ? JSON.stringify(body.opponentInningScores) : undefined,
      youtubeUrl: body.youtubeUrl,
      liveStatus: body.myInningScores ? "none" : undefined, // 🌟 簡易スコア更新時はライブ下書きを無効化
    };

    // undefined のキーを除外
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    await db.update(matches).set(updateData).where(eq(matches.id, matchId));
  },

  // 6.5 スタメン情報の取得と保存
  async getMatchLineups(db: DrizzleDB, matchId: string) {
    const match = await db.select({
      myLineup: matches.myLineup,
      opponentLineup: matches.opponentLineup,
      myAttendance: matches.myAttendance
    }).from(matches).where(eq(matches.id, matchId)).get();

    const safeParse = (str: string | null | undefined, fallback: any) => {
      if (!str || typeof str !== 'string') return fallback;
      const trimmed = str.trim();
      if (!trimmed || trimmed === '""' || trimmed === "''") return fallback;
      try {
        return JSON.parse(trimmed);
      } catch (e) {
        console.error(`Failed to parse JSON string: "${str}". Fallback to:`, fallback, e);
        return fallback;
      }
    };
    
    return {
      myLineup: safeParse(match?.myLineup, []),
      opponentLineup: safeParse(match?.opponentLineup, []),
      myAttendance: safeParse(match?.myAttendance, {})
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
    // 💡 db.run(sql`...`) はPromiseを返しバッチ処理に入らないため、事前に実行してD1/Drizzleのエラーを回避します
    await db.run(sql`DELETE FROM pitches WHERE at_bat_id IN (SELECT id FROM at_bats WHERE match_id = ${matchId})`);

    await db.batch([
      db.delete(baseAdvances).where(eq(baseAdvances.matchId, matchId)) as any,
      db.delete(atBats).where(eq(atBats.matchId, matchId)) as any,
      db.delete(playLogs).where(eq(playLogs.matchId, matchId)) as any,
      db.delete(matchUndoHistories).where(eq(matchUndoHistories.matchId, matchId)) as any,
      db.delete(matchLineups).where(eq(matchLineups.matchId, matchId)) as any,
      db.delete(matches).where(eq(matches.id, matchId)) as any,
    ]);
  },

  // 8. プレイログの取得
  async getPlayLogs(db: DrizzleDB, matchId: string) {
    const logs = await db.select()
      .from(playLogs)
      .where(eq(playLogs.matchId, matchId))
      .orderBy(desc(playLogs.createdAt), sql`rowid DESC`)
      .all();
    
    // PlayLogEntry 型に合わせる
    return logs.map(log => ({
      id: log.id,
      description: log.description,
      inning: parseInt(log.inningText) || 1,
      isTop: log.inningText.includes("表"),
      timestamp: log.createdAt.getTime(),
      validationMessage: log.validationMessage,
    }));
  },

  // 9. スコアブックの画像解析結果を一括流し込み（保存）
  async saveScorebookImport(db: DrizzleDB, matchId: string, events: AtBatEvent[], validationMessages: ValidationMessage[] = []) {
    // A. pitches テーブルのクリア（at_bats に紐づくため事前に削除）
    await db.run(sql`DELETE FROM pitches WHERE at_bat_id IN (SELECT id FROM at_bats WHERE match_id = ${matchId})`);

    // C. 試合のチームIDを取得
    const match = await db.select({ teamId: matches.teamId, opponent: matches.opponent, battingOrder: matches.battingOrder }).from(matches).where(eq(matches.id, matchId)).get();
    if (!match) throw new Error("Match not found");
    const teamId = match.teamId;

    // D. チームの選手一覧を取得し、名前マッピング辞書を作成
    const existingPlayers = await db.select().from(players).where(eq(players.teamId, teamId)).all();
    const playerMap = new Map<string, string>(); // name -> id
    existingPlayers.forEach(p => playerMap.set(p.name, p.id));

    const normalize = (s: string) => s.replace(/[\s　]+/g, '').toLowerCase();

    // 選手解決ヘルパー (存在しなければ null を返す)
    const resolvePlayerId = async (name: string): Promise<string | null> => {
      const cleanName = name.trim();
      if (!cleanName) return null;
      if (playerMap.has(cleanName)) return playerMap.get(cleanName)!;

      const normClean = normalize(cleanName);

      // 1. スペース抜き・小文字化で完全一致をチェック
      const exactMatch = existingPlayers.find(p => normalize(p.name) === normClean);
      if (exactMatch) return exactMatch.id;

      // 2. 前方一致（苗字のみ記載されている場合など）をチェック
      const partialMatches = existingPlayers.filter(p => normalize(p.name).startsWith(normClean));
      if (partialMatches.length === 1) {
        return partialMatches[0].id; // 1人に絞れた場合のみ
      }

      // 自動追加（仮登録）は行わず、見つからない場合は null を返す
      return null;
    };

    // D1 トランザクションの代わりに Batch を使用するためのクエリ配列
    const batchQueries: any[] = [];

    // B. 既存の試合データを削除し、バリデーションメッセージを更新
    batchQueries.push(db.delete(baseAdvances).where(eq(baseAdvances.matchId, matchId)));
    batchQueries.push(db.delete(atBats).where(eq(atBats.matchId, matchId)));
    batchQueries.push(db.delete(playLogs).where(eq(playLogs.matchId, matchId)));

    // E. 各打席イベントをインサート
    let eventIndex = 0;
    const baseTime = Date.now();
    for (const e of events) {
      eventIndex++;
      const atBatId = crypto.randomUUID();
      const batterId = await resolvePlayerId(e.batterName);
      const pitcherId = await resolvePlayerId(e.pitcherName);

      // A. at_bats レコードの挿入
      batchQueries.push(db.insert(atBats).values({
        id: atBatId,
        matchId,
        inning: e.inning,
        isTop: e.isTop,
        batterId: batterId || null,
        pitcherId: pitcherId || null,
        result: e.result,
      }));

      // B. base_advances レコードの挿入
      for (const adv of e.advances) {
        const runnerId = await resolvePlayerId(adv.runnerName);
        if (!runnerId) continue;

        const mapBase = (b?: string): number => {
          if (b === '1B') return 1;
          if (b === '2B') return 2;
          if (b === '3B') return 3;
          if (b === 'HP') return 4;
          return 0;
        };

        batchQueries.push(db.insert(baseAdvances).values({
          id: crypto.randomUUID(),
          matchId,
          atBatId,
          runnerId,
          fromBase: mapBase(adv.from),
          toBase: mapBase(adv.to),
          reason: adv.method || 'hit',
          isOut: false,
        }));
      }

      // C. play_logs レコードの挿入
      const inningText = `${e.inning}回${e.isTop ? '表' : '裏'}`;
      const descText = `${e.battingOrder}番 ${e.batterName}: ${e.result}`;
      
      let resultType = 'out';
      if (e.result.includes('H') || e.result.match(/^[789]$/) || e.result.includes('安')) resultType = 'hit';
      else if (e.runsInThisPlay > 0) resultType = 'score';

      // 該当打席のバリデーションメッセージを探す
      const msg = validationMessages.find(v => v.inning === e.inning && v.isTop === e.isTop && v.battingOrder === e.battingOrder);

      batchQueries.push(db.insert(playLogs).values({
        id: crypto.randomUUID(),
        matchId,
        atBatId, // 🌟 成績データ（at_bats）とのリンク用
        inningText,
        resultType,
        description: descText,
        validationMessage: msg ? JSON.stringify(msg) : null,
        createdAt: new Date(baseTime + eventIndex * 1000), // ミリ秒単位で連番を付与して厳密な時系列ソートを実現
      }));
    }

    // F. 試合全体のスコア・イニングスコアを再計算して `matches` に反映
    const myInningScores: (number | null)[] = [];
    const opponentInningScores: (number | null)[] = [];

    let maxInning = 1;
    events.forEach(e => {
      if (e.inning > maxInning) maxInning = e.inning;
    });

    for (let i = 1; i <= maxInning; i++) {
      const isMyTeamTop = match.battingOrder === 'first';
      const topRuns = events.filter(e => e.inning === i && e.isTop).reduce((sum, e) => sum + e.runsInThisPlay, 0);
      const bottomRuns = events.filter(e => e.inning === i && !e.isTop).reduce((sum, e) => sum + e.runsInThisPlay, 0);

      if (isMyTeamTop) {
        myInningScores.push(topRuns);
        opponentInningScores.push(bottomRuns);
      } else {
        myInningScores.push(bottomRuns);
        opponentInningScores.push(topRuns);
      }
    }

    const totalMyScore = myInningScores.reduce((sum: number, r) => sum + (r || 0), 0);
    const totalOpponentScore = opponentInningScores.reduce((sum: number, r) => sum + (r || 0), 0);

    batchQueries.push(db.update(matches).set({
      myScore: totalMyScore,
      opponentScore: totalOpponentScore,
      myInningScores: JSON.stringify(myInningScores),
      opponentInningScores: JSON.stringify(opponentInningScores),
      currentInning: maxInning,
      isBottom: false,
      status: "finished",
    }).where(eq(matches.id, matchId)));

    // バッチ実行 (D1は1回に100クエリまでの制限があるためチャンク分割)
    if (batchQueries.length > 0) {
      const chunkSize = 80;
      for (let i = 0; i < batchQueries.length; i += chunkSize) {
        const chunk = batchQueries.slice(i, i + chunkSize);
        await db.batch(chunk as [any, ...any[]]);
      }
    }
  }
};
