// src/app/api/user/index.ts
import { Hono } from 'hono'
import { getAuth } from "@/lib/auth" // 🌟 getAuth に変更！
import { drizzle } from 'drizzle-orm/d1'
import { account } from '@/db/schema' // ※パスは環境に合わせてください
import { eq } from 'drizzle-orm'

const app = new Hono<{ Bindings: { DB: D1Database } }>()

app.get('/accounts', async (c) => {
  const auth = getAuth(c.env.DB, c.env as any); // 🌟 ここで取得！
  const session = await auth.api.getSession({ request: c.req.raw });

  if (!session?.user) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(c.env.DB);

  try {
    const userAccounts = await db.select({
      providerId: account.providerId
    })
      .from(account)
      .where(eq(account.userId, session.user.id));

    const linkedProviders = userAccounts.map(a => a.providerId);

    return c.json({ success: true, providers: linkedProviders });
  } catch (error) {
    return c.json({ success: false, error: '連携情報の取得に失敗しました' }, 500);
  }
});

export default app;