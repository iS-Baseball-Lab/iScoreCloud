// filepath: src/api/equipments/index.ts
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import { teamEquipments, eventEquipments } from '@/db/schema/equipment';
import { teamMembers } from '@/db/schema/team';
import { eventCarpools } from '@/db/schema/carpool';
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
    return c.json({ success: false, error: err instanceof Error ? err.message : "Internal Server Error" }, 500);
  }
});

/**
 * 🎒 道具マスタの追加・編集
 * POST /api/equipments
 */
app.post('/', async (c) => {
  const db = drizzle(c.env.DB);

  try {
    const body = await c.req.json();
    const { id, teamId, name, description, isHeavy } = body;

    if (!teamId || !name) {
      return c.json({ success: false, error: "teamId と name は必須です。" }, 400);
    }

    if (id) {
      // 編集（更新）
      await db.update(teamEquipments)
        .set({
          name,
          description: description || null,
          isHeavy: !!isHeavy
        })
        .where(eq(teamEquipments.id, id));

      return c.json({ success: true, data: { id, teamId, name, description, isHeavy } });
    } else {
      // 新規登録
      const newId = `eq_${crypto.randomUUID().replace(/-/g, '')}`;
      await db.insert(teamEquipments)
        .values({
          id: newId,
          teamId,
          name,
          description: description || null,
          isHeavy: !!isHeavy
        });

      return c.json({ success: true, data: { id: newId, teamId, name, description, isHeavy } });
    }

  } catch (err: unknown) {
    console.error(`[Save Team Equipment Error]:`, err);
    return c.json({ success: false, error: err instanceof Error ? err.message : "Internal Server Error" }, 500);
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
    await db.delete(teamEquipments)
      .where(eq(teamEquipments.id, id));

    return c.json({ success: true });
  } catch (err: unknown) {
    console.error(`[Delete Team Equipment Error]:`, err);
    return c.json({ success: false, error: err instanceof Error ? err.message : "Internal Server Error" }, 500);
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
        carpoolId: assigned ? assigned.carpoolId : null,
        responsibleMemberId: assigned ? assigned.responsibleMemberId : null,
        status: assigned ? assigned.status : "pending"
      };
    });

    return c.json({ success: true, data });
  } catch (err: unknown) {
    console.error(`[Fetch Event Equipments Error]:`, err);
    return c.json({ success: false, error: err instanceof Error ? err.message : "Internal Server Error" }, 500);
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
    const body = await c.req.json();
    const { equipments } = body; // Array of { equipmentId, carpoolId, responsibleMemberId, status }

    if (!Array.isArray(equipments)) {
      return c.json({ success: false, error: "equipments 配列が必要です。" }, 400);
    }

    // トランザクション処理
    await db.transaction(async (tx) => {
      // 1. 既存のこのイベントの日程別道具割当を削除
      await tx.delete(eventEquipments)
        .where(eq(eventEquipments.eventId, eventId));

      // 2. 有効な配車スロット ID (eventCarpools.id) リストを取得 (外部キー制約エラー防止)
      const validCarpools = await tx.select({ id: eventCarpools.id })
        .from(eventCarpools)
        .where(eq(eventCarpools.eventId, eventId));
      const validCarpoolIds = new Set(validCarpools.map(c => c.id));

      // 3. 有効なメンバー ID リストを取得 (外部キー制約エラー防止)
      const validMembers = await tx.select({ id: teamMembers.id })
        .from(teamMembers);
      const validMemberIds = new Set(validMembers.map(m => m.id));

      // 4. 新たなアサインをインサート
      for (const eqData of equipments) {
        // もし積載先が未設定(null)か、無効なID（フロント一時IDなど）の場合は null にフォールバック
        const carpoolId = (eqData.carpoolId && validCarpoolIds.has(eqData.carpoolId)) ? eqData.carpoolId : null;
        
        // 担当メンバーが無効なIDの場合は null にフォールバック
        const responsibleMemberId = (eqData.responsibleMemberId && validMemberIds.has(eqData.responsibleMemberId)) ? eqData.responsibleMemberId : null;

        const id = `eveq_${crypto.randomUUID().replace(/-/g, '')}`;
        await tx.insert(eventEquipments)
          .values({
            id,
            eventId,
            equipmentId: eqData.equipmentId,
            carpoolId,
            responsibleMemberId,
            status: eqData.status || "pending"
          });
      }
    });

    return c.json({ success: true });

  } catch (err: unknown) {
    console.error(`[Save Event Equipments Error]:`, err);
    return c.json({ success: false, error: err instanceof Error ? err.message : "Internal Server Error" }, 500);
  }
});

export default app;
