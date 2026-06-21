// filepath: src/api/carpools/index.ts
/* 💡 iScoreCloud 規約: 
   1. 統一されたDBアクセス: drizzle(c.env.DB) を使用。
   2. 配車管理（マイカー情報、親子関係）のCRUDを提供。 */

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, inArray } from 'drizzle-orm';
import { 
  memberCars, parentChildRelations, eventCarpoolSettings, 
  eventCarpools, eventCarpoolRiders 
} from '@/db/schema/carpool';
import { teamMembers, players } from '@/db/schema/team';
import { events, attendances } from '@/db/schema/attendance';
import type { WorkerEnv } from '@/types/api';

const app = new Hono<{ Bindings: WorkerEnv }>();

// ==========================================
// 🚗 車両情報 (memberCars) API
// ==========================================

/**
 * 📋 特定メンバーの登録車両を取得
 * GET /api/carpools/cars?teamId=xxx&ownerId=xxx
 */
app.get('/cars', async (c) => {
  const teamId = c.req.query('teamId');
  const ownerId = c.req.query('ownerId');

  if (!teamId || !ownerId) {
    return c.json({ success: false, error: "teamId と ownerId が必要です。" }, 400);
  }

  const db = drizzle(c.env.DB);
  try {
    const cars = await db.select()
      .from(memberCars)
      .where(and(
        eq(memberCars.teamId, teamId),
        eq(memberCars.ownerId, ownerId)
      ));
    return c.json({ success: true, data: cars });
  } catch (err: unknown) {
    console.error(`[Fetch Member Cars Error]:`, err);
    return c.json({ success: false, error: err instanceof Error ? err.message : "Internal Server Error" }, 500);
  }
});

/**
 * 📋 チームの登録車両一覧を取得（所有者情報付き）
 * GET /api/carpools/cars/list?teamId=xxx
 */
app.get('/cars/list', async (c) => {
  const teamId = c.req.query('teamId');
  if (!teamId) {
    return c.json({ success: false, error: "teamId が必要です。" }, 400);
  }

  const db = drizzle(c.env.DB);
  try {
    const list = await db.select({
      id: memberCars.id,
      teamId: memberCars.teamId,
      ownerId: memberCars.ownerId,
      ownerName: teamMembers.name,
      name: memberCars.name,
      capacity: memberCars.capacity,
      fuelEfficiency: memberCars.fuelEfficiency,
      carType: memberCars.carType,
      createdAt: memberCars.createdAt
    })
    .from(memberCars)
    .leftJoin(teamMembers, eq(memberCars.ownerId, teamMembers.id))
    .where(eq(memberCars.teamId, teamId));

    return c.json({ success: true, data: list });
  } catch (err: unknown) {
    console.error(`[Fetch Cars List Error]:`, err);
    return c.json({ success: false, error: err instanceof Error ? err.message : "Internal Server Error" }, 500);
  }
});

/**
 * 📋 車両情報の登録・更新
 * POST /api/carpools/cars
 */
app.post('/cars', async (c) => {
  const db = drizzle(c.env.DB);
  try {
    const body = await c.req.json();
    const { id, teamId, ownerId, name, capacity, fuelEfficiency, carType } = body;

    if (!teamId || !ownerId || !name) {
      return c.json({ success: false, error: "必須項目 (teamId, ownerId, name) が不足しています。" }, 400);
    }

    const carId = id || `car_${crypto.randomUUID().replace(/-/g, '')}`;

    const values = {
      id: carId,
      teamId,
      ownerId,
      name: name.trim(),
      capacity: Number(capacity) || 4,
      fuelEfficiency: Number(fuelEfficiency) || 10,
      carType: carType || 'normal',
    };

    let result;
    if (id) {
      // 更新
      result = await db.update(memberCars)
        .set(values)
        .where(eq(memberCars.id, id))
        .returning();
    } else {
      // 新規登録
      result = await db.insert(memberCars)
        .values(values)
        .returning();
    }

    return c.json({ success: true, data: result[0] });
  } catch (err: unknown) {
    console.error(`[Save Car Error]:`, err);
    return c.json({ success: false, error: err instanceof Error ? err.message : "Internal Server Error" }, 500);
  }
});

/**
 * 📋 車両情報の削除
 * DELETE /api/carpools/cars/:carId
 */
app.delete('/cars/:carId', async (c) => {
  const carId = c.req.param('carId');
  const db = drizzle(c.env.DB);

  try {
    await db.delete(memberCars)
      .where(eq(memberCars.id, carId));
    return c.json({ success: true });
  } catch (err: unknown) {
    console.error(`[Delete Car Error]:`, err);
    return c.json({ success: false, error: err instanceof Error ? err.message : "Internal Server Error" }, 500);
  }
});


// ==========================================
// 🔗 親子関係 (parentChildRelations) API
// ==========================================

/**
 * 📋 チームの親子関係一覧を取得
 * GET /api/carpools/family?teamId=xxx
 */
app.get('/family', async (c) => {
  const teamId = c.req.query('teamId');
  if (!teamId) {
    return c.json({ success: false, error: "teamId が必要です。" }, 400);
  }

  const db = drizzle(c.env.DB);
  try {
    const relations = await db.select({
      id: parentChildRelations.id,
      teamId: parentChildRelations.teamId,
      parentId: parentChildRelations.parentId,
      parentName: teamMembers.name,
      parentType: teamMembers.memberType,
      childId: parentChildRelations.childId,
      childName: players.name,
      uniformNumber: players.uniformNumber,
      createdAt: parentChildRelations.createdAt
    })
    .from(parentChildRelations)
    .leftJoin(teamMembers, eq(parentChildRelations.parentId, teamMembers.id))
    .leftJoin(players, eq(parentChildRelations.childId, players.id))
    .where(eq(parentChildRelations.teamId, teamId));

    return c.json({ success: true, data: relations });
  } catch (err: unknown) {
    console.error(`[Fetch Family Relations Error]:`, err);
    return c.json({ success: false, error: err instanceof Error ? err.message : "Internal Server Error" }, 500);
  }
});

/**
 * 📋 親子関係の紐付け（作成・更新）
 * POST /api/carpools/family
 */
app.post('/family', async (c) => {
  const db = drizzle(c.env.DB);
  try {
    const body = await c.req.json();
    const { teamId, parentId, childId } = body;

    if (!teamId || !parentId || !childId) {
      return c.json({ success: false, error: "必須項目 (teamId, parentId, childId) が不足しています。" }, 400);
    }

    // 既に存在するか確認 (二重登録の防止)
    const existing = await db.select()
      .from(parentChildRelations)
      .where(and(
        eq(parentChildRelations.teamId, teamId),
        eq(parentChildRelations.parentId, parentId),
        eq(parentChildRelations.childId, childId)
      ));

    if (existing.length > 0) {
      return c.json({ success: true, data: existing[0] });
    }

    const relationId = `pc_${crypto.randomUUID().replace(/-/g, '')}`;
    const result = await db.insert(parentChildRelations)
      .values({
        id: relationId,
        teamId,
        parentId,
        childId,
      })
      .returning();

    return c.json({ success: true, data: result[0] });
  } catch (err: unknown) {
    console.error(`[Save Family Relation Error]:`, err);
    return c.json({ success: false, error: err instanceof Error ? err.message : "Internal Server Error" }, 500);
  }
});

/**
 * 📋 親子関係の解除
 * DELETE /api/carpools/family/:relationId
 */
app.delete('/family/:relationId', async (c) => {
  const relationId = c.req.param('relationId');
  const db = drizzle(c.env.DB);

  try {
    await db.delete(parentChildRelations)
      .where(eq(parentChildRelations.id, relationId));
    return c.json({ success: true });
  } catch (err: unknown) {
    console.error(`[Delete Family Relation Error]:`, err);
    return c.json({ success: false, error: err instanceof Error ? err.message : "Internal Server Error" }, 500);
  }
});

// ==========================================
// 📅 イベント別配車アサイン (eventCarpools / riders / settings) API
// ==========================================

/**
 * 📋 イベントの配車設定・アサイン情報を一括取得
 * GET /api/carpools/events/:eventId
 */
app.get('/events/:eventId', async (c) => {
  const eventId = c.req.param('eventId');
  const db = drizzle(c.env.DB);

  try {
    // 1. イベント詳細とチームIDを取得
    const eventDetail = await db.select({
      id: events.id,
      teamId: events.teamId,
      title: events.title,
      startAt: events.startAt
    })
    .from(events)
    .where(eq(events.id, eventId))
    .get();

    if (!eventDetail) {
      return c.json({ success: false, error: "指定されたイベントが見つかりません。" }, 404);
    }
    const teamId = eventDetail.teamId;

    // 2. 配車全体の設定を取得 (なければデフォルト値)
    let settings = await db.select()
      .from(eventCarpoolSettings)
      .where(eq(eventCarpoolSettings.eventId, eventId))
      .get();

    if (!settings) {
      settings = {
        id: "",
        eventId,
        distanceKm: 0,
        gasolinePrice: 170,
        splitMethod: "by_team" as const,
        noParentChild: true
      };
    }

    // 3. 親子関係を取得 (親子同乗警告のため)
    const familyRelations = await db.select()
      .from(parentChildRelations)
      .where(eq(parentChildRelations.teamId, teamId));

    // 4. 車両マスタを取得 (マイカー情報)
    const masterCars = await db.select()
      .from(memberCars)
      .where(eq(memberCars.teamId, teamId));

    // 5. 出席するメンバー（選手 ＆ 大人）の一覧と出欠ステータスを取得
    // 参加予定 (present, partial, late) のみ
    const attendees = await db.select({
      id: attendances.id,
      eventId: attendances.eventId,
      playerId: attendances.playerId,
      memberId: attendances.memberId,
      userId: attendances.userId,
      status: attendances.status,
      hasCar: attendances.hasCar,
      playerName: players.name,
      playerNumber: players.uniformNumber,
      memberName: teamMembers.name,
      memberType: teamMembers.memberType
    })
    .from(attendances)
    .leftJoin(players, eq(attendances.playerId, players.id))
    .leftJoin(teamMembers, eq(attendances.memberId, teamMembers.id))
    .where(and(
      eq(attendances.eventId, eventId),
      inArray(attendances.status, ['present', 'partial', 'late'])
    ));

    // 6. 登録済みの配車スロットを取得
    const carpools = await db.select({
      id: eventCarpools.id,
      eventId: eventCarpools.eventId,
      driverId: eventCarpools.driverId,
      driverName: teamMembers.name,
      carId: eventCarpools.carId,
      capacity: eventCarpools.capacity,
      carType: eventCarpools.carType,
      highwayFee: eventCarpools.highwayFee,
      parkingFee: eventCarpools.parkingFee
    })
    .from(eventCarpools)
    .leftJoin(teamMembers, eq(eventCarpools.driverId, teamMembers.id))
    .where(eq(eventCarpools.eventId, eventId));

    // 7. 同乗者（riders）を全配車スロットに対して取得
    const carpoolIds = carpools.map(cp => cp.id);
    let riders: any[] = [];
    if (carpoolIds.length > 0) {
      riders = await db.select({
        id: eventCarpoolRiders.id,
        carpoolId: eventCarpoolRiders.carpoolId,
        playerId: eventCarpoolRiders.playerId,
        playerName: players.name,
        playerNumber: players.uniformNumber,
        memberId: eventCarpoolRiders.memberId,
        memberName: teamMembers.name,
        memberType: teamMembers.memberType
      })
      .from(eventCarpoolRiders)
      .leftJoin(players, eq(eventCarpoolRiders.playerId, players.id))
      .leftJoin(teamMembers, eq(eventCarpoolRiders.memberId, teamMembers.id))
      .where(inArray(eventCarpoolRiders.carpoolId, carpoolIds));
    }

    // 配車スロットと同乗者をマージ
    const carpoolsWithRiders = carpools.map(cp => ({
      ...cp,
      riders: riders.filter(r => r.carpoolId === cp.id)
    }));

    return c.json({
      success: true,
      data: {
        event: eventDetail,
        settings,
        carpools: carpoolsWithRiders,
        attendees,
        familyRelations,
        masterCars
      }
    });

  } catch (err: unknown) {
    console.error(`[Fetch Event Carpools Error]:`, err);
    return c.json({ success: false, error: err instanceof Error ? err.message : "Internal Server Error" }, 500);
  }
});

/**
 * 📋 イベントの配車設定・アサイン情報を一括保存
 * POST /api/carpools/events/:eventId/save
 */
app.post('/events/:eventId/save', async (c) => {
  const eventId = c.req.param('eventId');
  const db = drizzle(c.env.DB);

  try {
    const body = await c.req.json();
    const { settings, carpools } = body;

    if (!settings) {
      return c.json({ success: false, error: "settings が必要です。" }, 400);
    }

    // トランザクション処理
    await db.transaction(async (tx) => {
      // 1. 設定の保存 (eventCarpoolSettings) - 一度削除してから挿入
      await tx.delete(eventCarpoolSettings)
        .where(eq(eventCarpoolSettings.eventId, eventId));

      const settingId = `ecs_${crypto.randomUUID().replace(/-/g, '')}`;
      await tx.insert(eventCarpoolSettings)
        .values({
          id: settingId,
          eventId,
          distanceKm: Number(settings.distanceKm) || 0,
          gasolinePrice: Number(settings.gasolinePrice) || 170,
          splitMethod: settings.splitMethod || 'by_team',
          noParentChild: !!settings.noParentChild
        });

      // 2. 既存 of このイベントの配車枠 (および同乗者) を一括削除
      const existingCarpools = await tx.select({ id: eventCarpools.id })
        .from(eventCarpools)
        .where(eq(eventCarpools.eventId, eventId));
      const existingCarpoolIds = existingCarpools.map(cp => cp.id);

      if (existingCarpoolIds.length > 0) {
        // 同乗者の削除
        await tx.delete(eventCarpoolRiders)
          .where(inArray(eventCarpoolRiders.carpoolId, existingCarpoolIds));
        // 配車枠の削除
        await tx.delete(eventCarpools)
          .where(eq(eventCarpools.eventId, eventId));
      }

      // 3. 新しい配車枠および同乗者のインサート
      if (Array.isArray(carpools) && carpools.length > 0) {
        for (const cp of carpools) {
          const carpoolId = `cp_${crypto.randomUUID().replace(/-/g, '')}`;

          // 配車枠のインサート
          await tx.insert(eventCarpools)
            .values({
              id: carpoolId,
              eventId,
              driverId: cp.driverId,
              carId: cp.carId || null,
              capacity: Number(cp.capacity) || 4,
              carType: cp.carType || 'normal',
              highwayFee: Number(cp.highwayFee) || 0,
              parkingFee: Number(cp.parkingFee) || 0
            });

          // 同乗者のインサート
          if (Array.isArray(cp.riders) && cp.riders.length > 0) {
            for (const rider of cp.riders) {
              const riderId = `cpr_${crypto.randomUUID().replace(/-/g, '')}`;
              await tx.insert(eventCarpoolRiders)
                .values({
                  id: riderId,
                  carpoolId,
                  playerId: rider.playerId || null,
                  memberId: rider.memberId || null
                });
            }
          }
        }
      }
    });

    return c.json({ success: true });

  } catch (err: unknown) {
    console.error(`[Save Event Carpools Error]:`, err);
    return c.json({ success: false, error: err instanceof Error ? err.message : "Internal Server Error" }, 500);
  }
});

export default app;
