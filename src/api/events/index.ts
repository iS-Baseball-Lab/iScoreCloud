// filepath: src/api/events/index.ts
/* 💡 iScoreCloud 規約: 
   1. 統一されたDBアクセス: drizzle(c.env.DB, { schema }) を使用。
   2. CRUD 処理を適切に実装し、ULIDまたはUUIDでイベントIDを採番する。 */

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, desc } from 'drizzle-orm';
import { events } from '@/db/schema/attendance';
import type { WorkerEnv } from '@/types/api';

const app = new Hono<{ Bindings: WorkerEnv }>();

/**
 * 📅 チーム別イベント一覧取得
 */
app.get('/:teamId', async (c) => {
  const teamId = c.req.param('teamId');
  const db = drizzle(c.env.DB);

  try {
    // 直近の予定を降順（新しい日付が上）または昇順（近い未来が上）で取得
    // 伝助出欠表などでは日付が左から右に並ぶため、日付の昇順で並べるのが適切
    const results = await db.select()
      .from(events)
      .where(eq(events.teamId, teamId))
      .orderBy(events.startAt);

    return c.json({
      success: true,
      data: results
    });
  } catch (err: unknown) {
    console.error(`[Fetch Events Error]:`, err);
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    return c.json({ success: false, error: errorMsg }, 500);
  }
});

/**
 * 📅 イベント新規登録
 */
app.post('/:teamId', async (c) => {
  const teamId = c.req.param('teamId');
  const db = drizzle(c.env.DB);

  try {
    const body = await c.req.json();
    const { title, startAt, endAt, eventType, description, location } = body;

    if (!title || !startAt) {
      return c.json({ success: false, error: "タイトルと開始日時は必須です。" }, 400);
    }

    const eventId = `event_${crypto.randomUUID().replace(/-/g, '')}`;

    const result = await db.insert(events)
      .values({
        id: eventId,
        teamId,
        title,
        startAt: new Date(startAt),
        endAt: endAt ? new Date(endAt) : null,
        eventType: eventType || 'practice',
        description: description || '',
        location: location || '',
      })
      .returning();

    return c.json({
      success: true,
      data: result[0]
    });
  } catch (err: unknown) {
    console.error(`[Create Event Error]:`, err);
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    return c.json({ success: false, error: errorMsg }, 500);
  }
});

/**
 * 📅 イベント編集
 */
app.patch('/:teamId/:eventId', async (c) => {
  const teamId = c.req.param('teamId');
  const eventId = c.req.param('eventId');
  const db = drizzle(c.env.DB);

  try {
    const body = await c.req.json();
    const { title, startAt, endAt, eventType, description, location } = body;

    const updateFields: Partial<typeof events.$inferInsert> = {};
    if (title !== undefined) updateFields.title = title;
    if (startAt !== undefined) updateFields.startAt = new Date(startAt);
    if (endAt !== undefined) updateFields.endAt = endAt ? new Date(endAt) : null;
    if (eventType !== undefined) updateFields.eventType = eventType;
    if (description !== undefined) updateFields.description = description;
    if (location !== undefined) updateFields.location = location;

    const result = await db.update(events)
      .set(updateFields)
      .where(and(eq(events.id, eventId), eq(events.teamId, teamId)))
      .returning();

    if (result.length === 0) {
      return c.json({ success: false, error: "指定されたイベントが見つかりません。" }, 404);
    }

    return c.json({
      success: true,
      data: result[0]
    });
  } catch (err: unknown) {
    console.error(`[Update Event Error]:`, err);
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    return c.json({ success: false, error: errorMsg }, 500);
  }
});

/**
 * 📅 イベント削除
 */
app.delete('/:teamId/:eventId', async (c) => {
  const teamId = c.req.param('teamId');
  const eventId = c.req.param('eventId');
  const db = drizzle(c.env.DB);

  try {
    const result = await db.delete(events)
      .where(and(eq(events.id, eventId), eq(events.teamId, teamId)))
      .returning();

    if (result.length === 0) {
      return c.json({ success: false, error: "指定されたイベントが見つかりません。" }, 404);
    }

    return c.json({
      success: true,
      message: "イベントを削除しました。"
    });
  } catch (err: unknown) {
    console.error(`[Delete Event Error]:`, err);
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    return c.json({ success: false, error: errorMsg }, 500);
  }
});

export default app;
