// filepath: src/api/carpools/index.ts
/* 💡 iScoreCloud 規約: 
   1. 統一されたDBアクセス: drizzle(c.env.DB) を使用。
   2. 配車管理（マイカー情報、親子関係）のCRUDを提供。 */

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import { memberCars, parentChildRelations } from '@/db/schema/carpool';
import { teamMembers, players } from '@/db/schema/team';
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

export default app;
