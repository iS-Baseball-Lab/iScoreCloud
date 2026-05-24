// filepath: src/api/matches/update-score.ts
/* 💡 iScoreCloud 規約: 
   1. アトミックな更新: D1へのスコア保存とLINE速報を1つのリクエストで完結させる。
   2. 野球脳の搭載: checkWalkOff ロジックを用いて「サヨナラ勝ち」を自動判定しステータスを制御。
   3. 非同期の追求: waitUntil を活用し、LINE送信の待ち時間をユーザーに感じさせない。 */

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { matches } from '@/db/schema/match';
import { teams } from '@/db/schema/team';
import { atBats, playLogs } from '@/db/schema/score';
import { eq, sql } from 'drizzle-orm';
import { sendLinePushMessage } from '@/lib/line/push';
import { formatMatchLineReport } from '@/lib/utils/format-sns';
import { checkWalkOff } from '@/lib/utils/score-logic';
import type { WorkerEnv } from '@/types/api';

const matchesApi = new Hono<{ Bindings: WorkerEnv }>();

/**
 * 🌟 スコア更新 ＆ LINE速報連動ハンドラ
 */
matchesApi.post('/update-score', async (c) => {
  const db = drizzle(c.env.DB);

  try {
    // 1. リクエストボディの取得
    const body = await c.req.json();
    const {
      matchId,
      myScore,
      opponentScore,
      inning,
      isBottom,
      action,
      status: requestedStatus,
      myInningScores,
      opponentInningScores,
      balls,
      strikes,
      outs,
      runners,
      myHits,
      opponentHits,
      myErrors,
      opponentErrors,
      newAtBat,
      newPlayLog,
      skipLineReport,
      history,
      isUndo, // 🌟 追加
      isAtBatUndo // 🌟 追加
    } = body;

    // 2. 現在の試合状況をDBからロード（規定イニング数やチームIDを知るため）
    const currentMatch = await db.select()
      .from(matches)
      .where(eq(matches.id, matchId))
      .get();

    if (!currentMatch) {
      return c.json({ success: false, error: "試合データが見つかりません。" }, 404);
    }

    // 3. 【美学】サヨナラ勝ち判定
    const isWalkOff = checkWalkOff({
      myScore,
      opponentScore,
      currentInning: inning,
      isBottom: !!isBottom,
      innings: currentMatch.innings,
      battingOrder: currentMatch.battingOrder as 'first' | 'second'
    });

    const newStatus = (requestedStatus === 'finished' || isWalkOff) ? 'finished' : 'live';

    // 🌟 現場至上主義：UNDO履歴のデータベース保存処理（共同編集者間での完全共有）
    try {
      // 履歴用テーブルをオンデマンドで自動構築（マイグレーション不要）
      await db.run(sql`
        CREATE TABLE IF NOT EXISTS match_undo_histories (
          match_id TEXT PRIMARY KEY,
          history_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);

      if (history && Array.isArray(history)) {
        await db.run(sql`
          INSERT OR REPLACE INTO match_undo_histories (match_id, history_json, updated_at)
          VALUES (${matchId}, ${JSON.stringify(history)}, ${Date.now()});
        `);
      }
    } catch (historyErr) {
      console.error("Failed to save UNDO history in update-score:", historyErr);
    }

    // 4. トランザクション処理 (matches, at_bats, play_logs のアトミック更新/取り消し)
    const batchPromises = [
      db.update(matches)
        .set({
          myScore,
          opponentScore,
          currentInning: inning,
          isBottom: !!isBottom,
          status: newStatus,
          myInningScores: JSON.stringify(myInningScores || []),
          opponentInningScores: JSON.stringify(opponentInningScores || []),
          balls: balls ?? 0,
          strikes: strikes ?? 0,
          outs: outs ?? 0,
          runners: JSON.stringify(runners || { base1: null, base2: null, base3: null }),
          myHits: myHits ?? 0,
          opponentHits: opponentHits ?? 0,
          myErrors: myErrors ?? 0,
          opponentErrors: opponentErrors ?? 0
        })
        .where(eq(matches.id, matchId))
    ];

    if (isUndo) {
      // 🌟 UNDOの時は最新のプレイログを1件削除
      batchPromises.push(
        db.run(sql`
          DELETE FROM play_logs 
          WHERE id = (
            SELECT id FROM play_logs 
            WHERE match_id = ${matchId} 
            ORDER BY created_at DESC 
            LIMIT 1
          )
        `) as any
      );

      // 🌟 さらに打席の取り消しであれば、最新の打席も1件削除
      if (isAtBatUndo) {
        batchPromises.push(
          db.run(sql`
            DELETE FROM at_bats 
            WHERE id = (
              SELECT id FROM at_bats 
              WHERE match_id = ${matchId} 
              ORDER BY created_at DESC 
              LIMIT 1
            )
          `) as any
        );
      }
    } else {
      // 通常の更新時は新規ログ/打席を挿入
      if (newAtBat) {
        batchPromises.push(
          db.insert(atBats).values({
            id: crypto.randomUUID(),
            matchId,
            inning: newAtBat.inning,
            isTop: newAtBat.isTop,
            batterId: newAtBat.batterId,
            pitcherId: newAtBat.pitcherId,
            result: newAtBat.result
          }) as any
        );
      }
      if (newPlayLog) {
        batchPromises.push(
          db.insert(playLogs).values({
            id: crypto.randomUUID(),
            matchId,
            inningText: newPlayLog.inningText,
            resultType: newPlayLog.resultType,
            description: newPlayLog.description
          }) as any
        );
      }
    }

    await db.batch(batchPromises as any);

    // 5. LINE速報の射出（タイミングフィルタリングを実装）
    const teamData = await db.select()
      .from(teams)
      .where(eq(teams.id, currentMatch.teamId))
      .get();

    const isPlayball = currentMatch.status === 'scheduled' && newStatus === 'live';
    const isGameSet = currentMatch.status !== 'finished' && newStatus === 'finished';
    const isInningChange = (currentMatch.currentInning !== inning || currentMatch.isBottom !== !!isBottom) && !isPlayball && !isGameSet;

    let shouldNotify = false;
    if (teamData?.lineGroupId && teamData.isAutoReportEnabled && !skipLineReport) {
      if (isPlayball && teamData.reportPlayballEnabled) {
        shouldNotify = true;
      } else if (isGameSet && teamData.reportGameSetEnabled) {
        shouldNotify = true;
      } else if (isInningChange && teamData.reportInningEnabled) {
        shouldNotify = true;
      }
    }

    if (shouldNotify && teamData?.lineGroupId) {
      // LINE用のホーム/アウェイ スコア並び順を調整
      const isMyTeamHome = currentMatch.battingOrder === 'second';
      const scoresForLine = {
        home: isMyTeamHome ? myScore : opponentScore,
        away: isMyTeamHome ? opponentScore : myScore
      };

      // メッセージ生成
      const message = formatMatchLineReport(
        teamData.name,
        currentMatch.opponent,
        scoresForLine,
        { number: inning, isBottom: !!isBottom },
        isWalkOff ? `【劇的サヨナラ！】${action}` : action,
        newStatus
      );

      // 💡 Workerの waitUntil を使い、レスポンス後にバックグラウンドで送信
      c.executionCtx.waitUntil(
        sendLinePushMessage(
          teamData.lineGroupId,
          message,
          c.env.LINE_CHANNEL_ACCESS_TOKEN
        )
      );
    }

    // 6. フロントエンドへ結果を返却
    return c.json({
      success: true,
      data: {
        matchId,
        status: newStatus,
        isWalkOff
      }
    });

  } catch (err: unknown) {
    console.error(`[Update Score Error]:`, err);
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    return c.json({ success: false, error: errorMsg }, 500);
  }
});

export default matchesApi;