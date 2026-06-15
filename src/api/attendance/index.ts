// filepath: src/api/attendance/index.ts
/* 💡 iScoreCloud 規約: 
   1. 統一されたDBアクセス: drizzle(c.env.DB) を使用。
   2. リレーションシップを leftJoin で安全にJOINし、伝助マトリックス向けの一括取得と個別取得に対応。 */

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, inArray } from 'drizzle-orm';
import { events, attendances } from '@/db/schema/attendance';
import { players, teamMembers } from '@/db/schema/team';
import { user } from '@/db/schema/auth';
import type { WorkerEnv } from '@/types/api';

const app = new Hono<{ Bindings: WorkerEnv }>();

/**
 * 📋 チーム全体の出欠統合データ（イベント、選手、メンバー、出欠レコード）の一括取得
 * GET /api/attendance?teamId=xxx
 */
app.get('/', async (c) => {
  const teamId = c.req.query('teamId');
  if (!teamId) {
    return c.json({ success: false, error: "teamId が必要です。" }, 400);
  }

  const db = drizzle(c.env.DB);

  try {
    // 1. チームのイベント（日程）一覧を取得 (日付順)
    const teamEvents = await db.select()
      .from(events)
      .where(eq(events.teamId, teamId))
      .orderBy(events.startAt);

    // 2. チームの選手一覧を取得
    const teamPlayers = await db.select()
      .from(players)
      .where(eq(players.teamId, teamId));

    // 3. チームの指導者・スタッフ・保護者メンバー一覧を取得 (active のみ)
    const membersList = await db.select()
      .from(teamMembers)
      .leftJoin(user, eq(teamMembers.userId, user.id))
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.status, "active")));

    const formattedMembers = membersList.map(item => ({
      ...item.team_members,
      avatarUrl: item.user?.image || null,
      authProviders: []
    }));

    // 4. 全イベントIDのリスト
    const eventIds = teamEvents.map(e => e.id);

    let attendanceRecords: any[] = [];
    if (eventIds.length > 0) {
      // 5. チームのイベント群に紐づく出欠データを一括取得
      attendanceRecords = await db.select({
        id: attendances.id,
        eventId: attendances.eventId,
        playerId: attendances.playerId,
        memberId: attendances.memberId,
        userId: attendances.userId,
        status: attendances.status,
        roleInEvent: attendances.roleInEvent,
        hasCar: attendances.hasCar,
        comment: attendances.comment,
        updatedAt: attendances.updatedAt,
      })
      .from(attendances)
      .where(inArray(attendances.eventId, eventIds));
    }

    return c.json({
      success: true,
      data: {
        events: teamEvents,
        players: teamPlayers,
        members: formattedMembers,
        attendances: attendanceRecords
      }
    });

  } catch (err: unknown) {
    console.error(`[Fetch Team Attendance Error]:`, err);
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    return c.json({ success: false, error: errorMsg }, 500);
  }
});

/**
 * 📋 イベント単体の出欠一覧取得（後方互換性用）
 * GET /api/attendance/:eventId
 */
app.get('/:eventId', async (c) => {
  const eventId = c.req.param('eventId');
  const db = drizzle(c.env.DB);

  try {
    const results = await db.select({
      id: attendances.id,
      eventId: attendances.eventId,
      playerId: attendances.playerId,
      memberId: attendances.memberId,
      userId: attendances.userId,
      status: attendances.status,
      roleInEvent: attendances.roleInEvent,
      hasCar: attendances.hasCar,
      comment: attendances.comment,
      updatedAt: attendances.updatedAt,
      userName: user.name,
      userImage: user.image
    })
    .from(attendances)
    .leftJoin(user, eq(attendances.userId, user.id))
    .where(eq(attendances.eventId, eventId));

    return c.json({
      success: true,
      data: results
    });
  } catch (err: unknown) {
    console.error(`[Fetch Event Attendance Error]:`, err);
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    return c.json({ success: false, error: errorMsg }, 500);
  }
});

export default app;