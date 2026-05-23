// filepath: src/api/matches/lock.ts
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { matches } from '@/db/schema/match';
import type { WorkerEnv } from '@/types/api';

const app = new Hono<{ Bindings: WorkerEnv }>();

interface LockRequest {
  userId: string;
  userName: string;
}

interface HeartbeatRequest {
  userId: string;
}

interface ReleaseLockRequest {
  userId: string;
}

// ━━━ 1. ロックの取得 (POST /:id/lock) ━━━
app.post('/:id/lock', async (c) => {
  const db = drizzle(c.env.DB);
  const matchId = c.req.param('id');

  try {
    const body = (await c.req.json()) as LockRequest;
    const { userId, userName } = body;

    if (!userId || !userName) {
      return c.json({ success: false, error: "userId と userName は必須です" }, 400);
    }

    // 試合の現在のロック情報を取得
    const [match] = await db
      .select({
        id: matches.id,
        lockedByUserId: matches.lockedByUserId,
        lockedByUserName: matches.lockedByUserName,
        lockExpiresAt: matches.lockExpiresAt,
      })
      .from(matches)
      .where(eq(matches.id, matchId));

    if (!match) {
      return c.json({ success: false, error: "試合が見つかりません" }, 404);
    }

    const now = new Date();
    const isLocked = match.lockedByUserId && match.lockExpiresAt && new Date(match.lockExpiresAt) > now;

    if (isLocked) {
      // 既に自分がロックしている場合は延長処理
      if (match.lockedByUserId === userId) {
        const newExpiresAt = new Date(Date.now() + 30000); // 30秒後
        await db
          .update(matches)
          .set({ lockExpiresAt: newExpiresAt })
          .where(eq(matches.id, matchId));

        return c.json({
          success: true,
          lockedBy: { userId, userName },
          expiresAt: newExpiresAt.toISOString()
        });
      }

      // 他のユーザーがロック中の場合
      return c.json({
        success: false,
        error: "別のスコアラーが入力中です",
        lockedBy: {
          userId: match.lockedByUserId,
          userName: match.lockedByUserName
        }
      });
    }

    // ロックされていない、または期限切れの場合はロックを取得
    const expiresAt = new Date(Date.now() + 30000); // 30秒後
    await db
      .update(matches)
      .set({
        lockedByUserId: userId,
        lockedByUserName: userName,
        lockedAt: now,
        lockExpiresAt: expiresAt,
      })
      .where(eq(matches.id, matchId));

    return c.json({
      success: true,
      lockedBy: { userId, userName },
      expiresAt: expiresAt.toISOString()
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "ロック取得に失敗しました";
    console.error("Lock Match Error:", msg);
    return c.json({ success: false, error: msg }, 500);
  }
});

// ━━━ 2. ハートビートによるロック延長 (POST /:id/lock/heartbeat) ━━━
app.post('/:id/lock/heartbeat', async (c) => {
  const db = drizzle(c.env.DB);
  const matchId = c.req.param('id');

  try {
    const body = (await c.req.json()) as HeartbeatRequest;
    const { userId } = body;

    if (!userId) {
      return c.json({ success: false, error: "userId は必須です" }, 400);
    }

    const [match] = await db
      .select({
        id: matches.id,
        lockedByUserId: matches.lockedByUserId,
        lockExpiresAt: matches.lockExpiresAt,
      })
      .from(matches)
      .where(eq(matches.id, matchId));

    if (!match) {
      return c.json({ success: false, error: "試合が見つかりません" }, 404);
    }

    const now = new Date();
    // 自分がロック中であり、かつ期限が切れていない（もしくはバッファを含めて直近）
    const isOwner = match.lockedByUserId === userId;
    const isAlive = match.lockExpiresAt && new Date(match.lockExpiresAt) > now;

    if (isOwner && isAlive) {
      const expiresAt = new Date(Date.now() + 30000); // 30秒後に延長
      await db
        .update(matches)
        .set({ lockExpiresAt: expiresAt })
        .where(eq(matches.id, matchId));

      return c.json({ success: true, expiresAt: expiresAt.toISOString() });
    }

    return c.json({ success: false, error: "ロックを保持していません" }, 403);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "ハートビートに失敗しました";
    console.error("Lock Heartbeat Error:", msg);
    return c.json({ success: false, error: msg }, 500);
  }
});

// ━━━ 3. ロックの解放 (DELETE /:id/lock) ━━━
app.delete('/:id/lock', async (c) => {
  const db = drizzle(c.env.DB);
  const matchId = c.req.param('id');

  try {
    const body = (await c.req.json()) as ReleaseLockRequest;
    const { userId } = body;

    if (!userId) {
      return c.json({ success: false, error: "userId は必須です" }, 400);
    }

    const [match] = await db
      .select({
        id: matches.id,
        lockedByUserId: matches.lockedByUserId,
      })
      .from(matches)
      .where(eq(matches.id, matchId));

    if (!match) {
      return c.json({ success: false, error: "試合が見つかりません" }, 404);
    }

    // 自分がロックしている場合のみ解放
    if (match.lockedByUserId === userId) {
      await db
        .update(matches)
        .set({
          lockedByUserId: null,
          lockedByUserName: null,
          lockedAt: null,
          lockExpiresAt: null,
        })
        .where(eq(matches.id, matchId));

      return c.json({ success: true, message: "ロックを解放しました" });
    }

    return c.json({ success: true, message: "自分が保持するロックはありませんでした" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "ロック解放に失敗しました";
    console.error("Lock Release Error:", msg);
    return c.json({ success: false, error: msg }, 500);
  }
});

// ━━━ 4. 強制ロック解除・取得 (POST /:id/lock/force) ━━━
app.post('/:id/lock/force', async (c) => {
  const db = drizzle(c.env.DB);
  const matchId = c.req.param('id');

  try {
    const body = (await c.req.json()) as LockRequest;
    const { userId, userName } = body;

    if (!userId || !userName) {
      return c.json({ success: false, error: "userId と userName は必須です" }, 400);
    }

    const expiresAt = new Date(Date.now() + 30000); // 30秒後
    await db
      .update(matches)
      .set({
        lockedByUserId: userId,
        lockedByUserName: userName,
        lockedAt: new Date(),
        lockExpiresAt: expiresAt,
      })
      .where(eq(matches.id, matchId));

    return c.json({
      success: true,
      lockedBy: { userId, userName },
      expiresAt: expiresAt.toISOString()
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "強制ロック取得に失敗しました";
    console.error("Lock Force Error:", msg);
    return c.json({ success: false, error: msg }, 500);
  }
});

export default app;
