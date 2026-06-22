// filepath: src/api/venues.ts
import { Hono } from 'hono'
import { getAuth } from "@/lib/auth"
import { drizzle } from 'drizzle-orm/d1'
import { venues } from '@/db/schema/match'
import { eq, desc } from 'drizzle-orm'
import type { WorkerEnv } from '@/types/api'

const app = new Hono<{ Bindings: WorkerEnv }>()

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🗺️ 球場・グラウンド 基本CRUD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 球場一覧の取得 */
app.get('/', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers as any })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const db = drizzle(c.env.DB)
  try {
    const list = await db.select().from(venues).orderBy(desc(venues.createdAt))
    return c.json({ success: true, data: list })
  } catch (e: any) {
    return c.json({ success: false, error: '球場一覧の取得に失敗しました', details: e.message }, 500)
  }
})

/** 新規球場の追加 */
app.post('/', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers as any })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const body = await c.req.json<{
    name: string
    shortName?: string
    address?: string
    mapUrl?: string
    surfaceType?: string
    dimensions?: string
    notes?: string
  }>()

  if (!body.name || !body.name.trim()) {
    return c.json({ error: '球場名は必須です' }, 400)
  }

  const db = drizzle(c.env.DB)
  const newId = crypto.randomUUID()
  try {
    await db.insert(venues).values({
      id: newId,
      name: body.name.trim(),
      shortName: body.shortName?.trim() || null,
      address: body.address?.trim() || null,
      mapUrl: body.mapUrl?.trim() || null,
      surfaceType: body.surfaceType || 'dirt',
      dimensions: body.dimensions?.trim() || null,
      notes: body.notes?.trim() || null,
    })
    return c.json({ success: true, id: newId })
  } catch (e: any) {
    return c.json({ success: false, error: '球場の登録に失敗しました', details: e.message }, 500)
  }
})

/** 球場情報の更新 */
app.patch('/:id', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers as any })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const id = c.req.param('id')!
  const body = await c.req.json<{
    name?: string | null
    shortName?: string | null
    address?: string | null
    mapUrl?: string | null
    surfaceType?: string | null
    dimensions?: string | null
    notes?: string | null
  }>()

  const db = drizzle(c.env.DB)
  try {
    // 💡 安全にトリムし、空文字やnullならnullにするヘルパー
    const s = (val: string | null | undefined) => (val && typeof val === 'string') ? val.trim() : null;

    const updateData = {
      name: body.name !== undefined ? (body.name?.trim() || undefined) : undefined,
      shortName: body.shortName !== undefined ? s(body.shortName) : undefined,
      address: body.address !== undefined ? s(body.address) : undefined,
      mapUrl: body.mapUrl !== undefined ? s(body.mapUrl) : undefined,
      surfaceType: body.surfaceType !== undefined ? body.surfaceType : undefined,
      dimensions: body.dimensions !== undefined ? s(body.dimensions) : undefined,
      notes: body.notes !== undefined ? s(body.notes) : undefined,
    };

    // 💡 Drizzle のエラーを防ぐため undefined のキーはクエリから除外する
    Object.keys(updateData).forEach(key => {
      if ((updateData as any)[key] === undefined) {
        delete (updateData as any)[key];
      }
    });

    await db.update(venues)
      .set(updateData)
      .where(eq(venues.id, id))
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ success: false, error: '球場の更新に失敗しました', details: e.message }, 500)
  }
})

/** 球場の削除 */
app.delete('/:id', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers as any })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const id = c.req.param('id')!
  const db = drizzle(c.env.DB)
  try {
    await db.delete(venues).where(eq(venues.id, id))
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ success: false, error: '球場の削除に失敗しました', details: e.message }, 500)
  }
})

export default app
