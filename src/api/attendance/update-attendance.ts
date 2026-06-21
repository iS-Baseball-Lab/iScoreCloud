// filepath: src/api/attendance/update-attendance.ts
/* 💡 iScoreCloud 規約: 
   1. 統一されたDBアクセス: drizzle(c.env.DB) を使用。
   2. 選手(playerId)またはスタッフ等のメンバー(memberId)に応じた動的な衝突判定を Upsert (onConflictDoUpdate) で実現。 */

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { attendances } from '@/db/schema/attendance';
import type { WorkerEnv } from '@/types/api';

const app = new Hono<{ Bindings: WorkerEnv }>();

/**
 * 📋 出欠情報 登録・更新ハンドラ
 */
app.post('/update', async (c) => {
  const db = drizzle(c.env.DB);

  try {
    const body = await c.req.json();
    const {
      eventId,
      playerId,
      memberId,
      userId,
      status,
      roleInEvent,
      hasCar,
      carId,
      comment
    } = body;

    // 💡 バリデーション: eventId と (playerId または memberId) が必要
    if (!eventId || (!playerId && !memberId)) {
      return c.json({ success: false, error: "イベントID、および選手IDまたはメンバーIDが不足しています。" }, 400);
    }

    const attendanceId = `attend_${crypto.randomUUID().replace(/-/g, '')}`;
    let result;

    // 💡 1. 選手(playerId)に対する出欠登録・更新
    if (playerId) {
      result = await db.insert(attendances)
        .values({
          id: attendanceId,
          eventId,
          playerId,
          memberId: null,
          userId: userId || null,
          status: status || 'pending',
          roleInEvent: roleInEvent || 'player',
          hasCar: !!hasCar,
          carId: carId || null,
          comment: comment || '',
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [attendances.eventId, attendances.playerId],
          set: {
            userId: userId || null,
            status: status || 'pending',
            roleInEvent: roleInEvent || 'player',
            hasCar: !!hasCar,
            carId: carId || null,
            comment: comment || '',
            updatedAt: new Date(),
          }
        })
        .returning();
    } 
    // 💡 2. その他指導者・保護者メンバー(memberId)に対する出欠登録・更新
    else {
      result = await db.insert(attendances)
        .values({
          id: attendanceId,
          eventId,
          playerId: null,
          memberId,
          userId: userId || null,
          status: status || 'pending',
          roleInEvent: roleInEvent || 'player',
          hasCar: !!hasCar,
          carId: carId || null,
          comment: comment || '',
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [attendances.eventId, attendances.memberId],
          set: {
            userId: userId || null,
            status: status || 'pending',
            roleInEvent: roleInEvent || 'player',
            hasCar: !!hasCar,
            carId: carId || null,
            comment: comment || '',
            updatedAt: new Date(),
          }
        })
        .returning();
    }

    return c.json({
      success: true,
      data: result[0]
    });

  } catch (err: unknown) {
    console.error(`[Update Attendance Error]:`, err);
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    return c.json({ success: false, error: errorMsg }, 500);
  }
});

export default app;