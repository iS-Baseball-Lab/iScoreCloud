// filepath: src/api/teams/test-push.ts
/* 💡 iScoreCloud 規約: 
   1. 実際に D1 から保存された lineGroupId を引き出し、テストメッセージを送信する。 */

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { teams } from '@/db/schema/team';
import { eq } from 'drizzle-orm';
import { sendLinePushMessage } from '@/lib/line/push';
import { formatMatchLineReport } from '@/lib/utils/format-sns';
import type { WorkerEnv } from '@/types/api';

const testPush = new Hono<{ Bindings: WorkerEnv }>();

testPush.post('/test-push', async (c) => {
  const db = drizzle(c.env.DB);
  const { teamId } = await c.req.json();

  try {
    // 1. D1 から保存されたグループIDを取得
    const team = await db.select().from(teams).where(eq(teams.id, teamId)).get();

    if (!team || !team.lineGroupId) {
      return c.json({ success: false, error: "LINE連携が設定されていません。" }, 400);
    }

    // 2. 以前作った formatMatchLineReport でメッセージ作成
    const message = formatMatchLineReport(
      team.name, // チーム名
      "テスト相手",
      { home: 3, away: 2 },
      { number: 5, isBottom: true },
      "iScoreCloud 疎通テスト送信です！⚾️",
      'live'
    );

    // 3. 実際に Push!
    const result = await sendLinePushMessage(
      team.lineGroupId,
      message,
      c.env.LINE_CHANNEL_ACCESS_TOKEN
    );

    return c.json(result);

  } catch (err: unknown) {
    return c.json({ success: false, error: "Push送信中にエラーが発生しました。" }, 500);
  }
});

export default testPush;
