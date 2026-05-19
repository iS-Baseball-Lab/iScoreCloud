// filepath: src/api/matches/update-score.ts
/* 💡 iScoreCloud 規約: 
   1. アトミックな更新: D1へのスコア保存とLINE速報を1つのリクエストで完結させる。
   2. 野球脳の搭載: checkWalkOff ロジックを用いて「サヨナラ勝ち」を自動判定しステータスを制御。
   3. 非同期の追求: waitUntil を活用し、LINE送信の待ち時間をユーザーに感じさせない。 */

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { matches } from '@/db/schema/match'; // 🌟 スキーマインポート
import { teams } from '@/db/schema/team';
import { eq } from 'drizzle-orm';
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
      status: requestedStatus
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
    // 入力されたスコアと、DBにある規定回数（innings）を照合
    const isWalkOff = checkWalkOff({
      myScore,
      opponentScore,
      currentInning: inning,
      isBottom: !!isBottom,
      innings: currentMatch.innings,
      battingOrder: currentMatch.battingOrder as 'first' | 'second'
    });

    // 🌟 判定結果に基づき status を決定
    const newStatus = (requestedStatus === 'finished' || isWalkOff) ? 'finished' : 'live';

    // 4. D1 データベースの更新
    await db.update(matches)
      .set({
        myScore,
        opponentScore,
        currentInning: inning,
        isBottom: !!isBottom,
        status: newStatus,
        // 必要に応じてイニング得点（JSON）の更新ロジックをここに追加
      })
      .where(eq(matches.id, matchId));

    // 5. LINE速報の射出（設定が有効な場合のみ）
    const teamData = await db.select()
      .from(teams)
      .where(eq(teams.id, currentMatch.teamId))
      .get();

    if (teamData?.lineGroupId && teamData.isAutoReportEnabled) {
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