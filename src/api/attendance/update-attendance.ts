// filepath: src/api/attendance/update-attendance.ts
/* 💡 iScoreCloud 規約: 
   1. 統一されたDBアクセス: drizzle(c.env.DB) を使用。
   2. 選手(playerId)またはスタッフ等のメンバー(memberId)に応じた動的な衝突判定を Upsert (onConflictDoUpdate) で実現。 */

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, eq } from 'drizzle-orm';
import { attendances, events } from '@/db/schema/attendance';
import { players, teamMembers } from '@/db/schema/team';
import { user } from '@/db/schema';
import { resolveCallerTeamAccess } from '@/lib/team-access';
import type { WorkerEnv } from '@/types/api';

const app = new Hono<{ Bindings: WorkerEnv }>();

type AttendanceStatus =
  | 'present'
  | 'absent'
  | 'pending'
  | 'late'
  | 'partial'
  | 'duty'
  | 'help'
  | 'setup'
  | 'game';

const VALID_ATTENDANCE_STATUSES = new Set<AttendanceStatus>([
  'present',
  'absent',
  'pending',
  'late',
  'partial',
  'duty',
  'help',
  'setup',
  'game',
]);

function normalizeAttendanceStatus(raw: string | undefined): AttendanceStatus {
  const clean = (raw || '').trim() as AttendanceStatus;
  return VALID_ATTENDANCE_STATUSES.has(clean) ? clean : 'pending';
}

interface UpdateAttendanceBody {
  eventId?: string;
  playerId?: string;
  memberId?: string;
  userId?: string;
  status?: string;
  roleInEvent?: string;
  hasCar?: boolean;
  carId?: string | null;
  comment?: string;
}

/**
 * 📋 出欠情報 登録・更新ハンドラ
 */
app.post('/update', async (c) => {
  const db = drizzle(c.env.DB);

  try {
    const body = (await c.req.json()) as UpdateAttendanceBody;
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
    const normalizedStatus = normalizeAttendanceStatus(status);

    // 💡 バリデーション: eventId と (playerId または memberId) が必要
    if (!eventId || (!playerId && !memberId)) {
      return c.json({ success: false, error: "イベントID、および選手IDまたはメンバーIDが不足しています。" }, 400);
    }

    if (eventId.startsWith('demo-')) {
      return c.json({
        success: true,
        isDemo: true,
        data: {
          id: `demo_attend_${Date.now()}`,
          eventId,
          playerId: playerId || null,
          memberId: memberId || null,
          status: normalizedStatus,
          hasCar: !!hasCar,
          carId: carId || null,
          comment: comment || '',
        },
      });
    }

    const eventRow = await db
      .select({ id: events.id, teamId: events.teamId })
      .from(events)
      .where(eq(events.id, eventId))
      .get();
    if (!eventRow) {
      return c.json({ success: false, error: "指定された予定が見つかりません。" }, 404);
    }

    const access = await resolveCallerTeamAccess(c);
    if (eventRow.teamId !== 'demo-team' && !access.canAccessTeam(eventRow.teamId)) {
      return c.json({ success: false, error: "このチームの出欠を更新する権限がありません。" }, 403);
    }

    // 💡 外部キー整合性チェック (userId は user.id を参照するため、存在確認を行う)
    const candidateUid = (access.primaryUserId || userId || '').trim();
    let validUserId: string | null = null;
    if (candidateUid) {
      try {
        const u = await db.select({ id: user.id }).from(user).where(eq(user.id, candidateUid)).get();
        if (u) validUserId = u.id;
      } catch (err) {
        console.warn("Could not check userId in user table:", err);
      }
    }

    const attendanceId = `attend_${crypto.randomUUID().replace(/-/g, '')}`;
    let result;

    // 💡 1. 選手(playerId)に対する出欠登録・更新
    if (playerId) {
      const targetPlayer = await db
        .select({ id: players.id })
        .from(players)
        .where(and(eq(players.id, playerId), eq(players.teamId, eventRow.teamId)))
        .get();
      if (!targetPlayer) {
        return c.json({ success: false, error: "指定された選手はこのチームに所属していません。" }, 400);
      }

      result = await db.insert(attendances)
        .values({
          id: attendanceId,
          eventId,
          playerId,
          memberId: null,
          userId: validUserId,
          status: normalizedStatus,
          roleInEvent: roleInEvent || 'player',
          hasCar: !!hasCar,
          carId: carId || null,
          comment: comment || '',
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [attendances.eventId, attendances.playerId],
          set: {
            userId: validUserId,
            status: normalizedStatus,
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
    else if (memberId) {
      const targetMember = await db
        .select({ id: teamMembers.id, role: teamMembers.role })
        .from(teamMembers)
        .where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, eventRow.teamId)))
        .get();
      if (!targetMember) {
        return c.json({ success: false, error: "指定されたメンバーはこのチームに所属していません。" }, 400);
      }
      const resolvedRoleInEvent =
        roleInEvent || (targetMember.role === 'parent' ? 'parent' : 'staff');

      result = await db.insert(attendances)
        .values({
          id: attendanceId,
          eventId,
          playerId: null,
          memberId,
          userId: validUserId,
          status: normalizedStatus,
          roleInEvent: resolvedRoleInEvent,
          hasCar: !!hasCar,
          carId: carId || null,
          comment: comment || '',
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [attendances.eventId, attendances.memberId],
          set: {
            userId: validUserId,
            status: normalizedStatus,
            roleInEvent: resolvedRoleInEvent,
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
      data: result?.[0] ?? null
    });

  } catch (err: unknown) {
    console.error(`[Update Attendance Error]:`, err);
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    return c.json({ success: false, error: errorMsg }, 500);
  }
});

export default app;