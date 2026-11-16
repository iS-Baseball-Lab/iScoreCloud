// filepath: src/api/equipments/index.ts
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import { teamEquipments, eventEquipments } from '@/db/schema/equipment';
import { teamMembers } from '@/db/schema/team';
import { events } from '@/db/schema/attendance';
import { eventCarpools } from '@/db/schema/carpool';
import { resolveCallerTeamAccess } from '@/lib/team-access';
import type { WorkerEnv } from '@/types/api';

const app = new Hono<{ Bindings: WorkerEnv }>();

/**
 * 🎒 チームの道具マスタ一覧を取得
 * GET /api/equipments?teamId=xxx
 */
app.get('/', async (c) => {
  const teamId = c.req.query('teamId');
  if (!teamId) {
    return c.json({ success: false, error: "teamId が必要です。" }, 400);
  }

  const db = drizzle(c.env.DB);

  try {
    const list = await db.select()
      .from(teamEquipments)
      .where(eq(teamEquipments.teamId, teamId));

    return c.json({ success: true, data: list });
  } catch (err: unknown) {
    console.error(`[Fetch Team Equipments Error]:`, err);
    return c.json({ success: false, error: "道具マスタの取得に失敗しました。" }, 500);
  }
});

/**
 * 🎒 道具マスタの追加・編集
 * POST /api/equipments
 */
app.post('/', async (c) => {
  const db = drizzle(c.env.DB);

  try {
    const body = await c.req.json<{
      id?: string;
      teamId?: string;
      name?: string;
      description?: string | null;
      isHeavy?: boolean;
      quantity?: number;
    }>();
    const { id, teamId, name, description, isHeavy, quantity } = body;

    if (!teamId || !name) {
      return c.json({ success: false, error: "teamId と name は必須です。" }, 400);
    }

    const access = await resolveCallerTeamAccess(c);
    if (!access.canMutateTeamData(teamId)) {
      return c.json({ success: false, error: "このチームの道具マスタを編集する権限がありません。" }, 403);
    }

    const qty = quantity != null ? Number(quantity) : 1;

    if (id) {
      // 編集（更新）— teamId 一致を必須化
      await db.update(teamEquipments)
        .set({
          name,
          description: description || null,
          isHeavy: !!isHeavy,
          quantity: qty
        })
        .where(and(eq(teamEquipments.id, id), eq(teamEquipments.teamId, teamId)));

      return c.json({ success: true, data: { id, teamId, name, description, isHeavy, quantity: qty } });
    } else {
      // 新規登録
      const newId = `eq_${crypto.randomUUID().replace(/-/g, '')}`;
      await db.insert(teamEquipments)
        .values({
          id: newId,
          teamId,
          name,
          description: description || null,
          isHeavy: !!isHeavy,
          quantity: qty
        });

      return c.json({ success: true, data: { id: newId, teamId, name, description, isHeavy, quantity: qty } });
    }

  } catch (err: unknown) {
    console.error(`[Save Team Equipment Error]:`, err);
    return c.json({ success: false, error: "道具マスタの保存に失敗しました。" }, 500);
  }
});

/**
 * 🎒 道具マスタの削除
 * DELETE /api/equipments/:id
 */
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const db = drizzle(c.env.DB);

  try {
    const existing = await db.select({ id: teamEquipments.id, teamId: teamEquipments.teamId })
      .from(teamEquipments)
      .where(eq(teamEquipments.id, id))
      .get();
    if (!existing) {
      return c.json({ success: true });
    }

    const access = await resolveCallerTeamAccess(c);
    if (!access.canMutateTeamData(existing.teamId)) {
      return c.json({ success: false, error: "このチームの道具マスタを削除する権限がありません。" }, 403);
    }

    await db.delete(teamEquipments)
      .where(and(eq(teamEquipments.id, id), eq(teamEquipments.teamId, existing.teamId)));

    return c.json({ success: true });
  } catch (err: unknown) {
    console.error(`[Delete Team Equipment Error]:`, err);
    return c.json({ success: false, error: "道具マスタの削除に失敗しました。" }, 500);
  }
});

/**
 * 📦 イベント別の道具積載・担当状況を取得
 * GET /api/equipments/events/:eventId
 */
app.get('/events/:eventId', async (c) => {
  const eventId = c.req.param('eventId');
  const teamId = c.req.query('teamId');
  if (!teamId) {
    return c.json({ success: false, error: "teamId が必要です。" }, 400);
  }

  const db = drizzle(c.env.DB);

  try {
    // 1. チームの道具マスタをすべて取得
    const masterList = await db.select()
      .from(teamEquipments)
      .where(eq(teamEquipments.teamId, teamId));

    // 2. イベントで登録されている積載アサインを取得
    const assignedList = await db.select()
      .from(eventEquipments)
      .where(eq(eventEquipments.eventId, eventId));

    // マスタ全アイテムに対し、アサイン情報をマージして返す
    const data = masterList.map(master => {
      const assigned = assignedList.find(a => a.equipmentId === master.id);
      return {
        equipmentId: master.id,
        name: master.name,
        description: master.description,
        isHeavy: master.isHeavy,
        quantity: master.quantity || 1,
        carpoolId: assigned ? assigned.carpoolId : null,
        responsibleMemberId: assigned ? assigned.responsibleMemberId : null,
        status: assigned ? assigned.status : "pending"
      };
    });

    return c.json({ success: true, data });
  } catch (err: unknown) {
    console.error(`[Fetch Event Equipments Error]:`, err);
    return c.json({ success: false, error: "イベント道具状況の取得に失敗しました。" }, 500);
  }
});

/**
 * 📦 イベント別の道具積載状況を一括保存
 * POST /api/equipments/events/:eventId/save
 */
app.post('/events/:eventId/save', async (c) => {
  const eventId = c.req.param('eventId');
  const db = drizzle(c.env.DB);

  try {
    const eventRow = await db.select({ id: events.id, teamId: events.teamId })
      .from(events)
      .where(eq(events.id, eventId))
      .get();
    if (!eventRow) {
      return c.json({ success: false, error: "対象のイベントが見つかりません。" }, 404);
    }

    const access = await resolveCallerTeamAccess(c);
    if (!access.canMutateTeamData(eventRow.teamId)) {
      return c.json({ success: false, error: "このイベントの道具割当を保存する権限がありません。" }, 403);
    }

    const body = await c.req.json<{
      equipments?: Array<{
        equipmentId: string;
        carpoolId?: string | null;
        responsibleMemberId?: string | null;
        status?: "pending" | "loaded" | "returned";
      }>;
    }>();
    const { equipments } = body;

    if (!Array.isArray(equipments)) {
      return c.json({ success: false, error: "equipments 配列が必要です。" }, 400);
    }

    // 1. 既存のこのイベントの日程別道具割当を削除
    await db.delete(eventEquipments)
      .where(eq(eventEquipments.eventId, eventId));

    // 2. 同一イベント・同一チーム内の有効IDのみを取得（クロステナント紐付け防止）
    const [validCarpools, validMembers, validMasterEquipments] = await Promise.all([
      db.select({ id: eventCarpools.id })
        .from(eventCarpools)
        .where(eq(eventCarpools.eventId, eventId)),
      db.select({ id: teamMembers.id })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, eventRow.teamId)),
      db.select({ id: teamEquipments.id })
        .from(teamEquipments)
        .where(eq(teamEquipments.teamId, eventRow.teamId)),
    ]);
    const validCarpoolIds = new Set(validCarpools.map(cp => cp.id));
    const validMemberIds = new Set(validMembers.map(m => m.id));
    const validEquipmentIds = new Set(validMasterEquipments.map(eqItem => eqItem.id));

    // 3. 新たなアサインをインサート
    for (const eqData of equipments) {
      if (!eqData.equipmentId || !validEquipmentIds.has(eqData.equipmentId)) {
        continue;
      }
      const carpoolId = (eqData.carpoolId && validCarpoolIds.has(eqData.carpoolId)) ? eqData.carpoolId : null;
      const responsibleMemberId = (eqData.responsibleMemberId && validMemberIds.has(eqData.responsibleMemberId)) ? eqData.responsibleMemberId : null;

      const id = `eveq_${crypto.randomUUID().replace(/-/g, '')}`;
      await db.insert(eventEquipments)
        .values({
          id,
          eventId,
          equipmentId: eqData.equipmentId,
          carpoolId,
          responsibleMemberId,
          status: eqData.status || "pending"
        });
    }

    return c.json({ success: true });

  } catch (err: unknown) {
    console.error(`[Save Event Equipments Error]:`, err);
    return c.json({ success: false, error: "イベント道具割当の保存に失敗しました。" }, 500);
  }
});

export default app;
