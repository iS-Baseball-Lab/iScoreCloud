// src/api/admin.ts
import { Hono } from 'hono'
import { getAuth } from "@/lib/auth"
import { drizzle } from 'drizzle-orm/d1'
import { teamMembers } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import type { WorkerEnv, AuthUser } from '@/types/api'

const app = new Hono<{ Bindings: WorkerEnv }>()

app.get('/users', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers as any })
  if ((session?.user as AuthUser)?.role !== 'SYSTEM_ADMIN') return c.json({ error: '権限がありません' }, 403)

  try {
    const { results } = await c.env.DB.prepare(`SELECT id, name, email, role, created_at as createdAt FROM user ORDER BY created_at DESC`).all()
    return c.json(results)
  } catch (e) { return c.json({ error: '取得に失敗しました' }, 500) }
})

app.patch('/users/:id/role', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers as any })
  if ((session?.user as AuthUser)?.role !== 'SYSTEM_ADMIN') return c.json({ error: '権限がありません' }, 403)

  const userId = c.req.param('id')
  const { role } = await c.req.json()
  try {
    await c.env.DB.prepare(`UPDATE user SET role = ? WHERE id = ?`).bind(role, userId).run()
    return c.json({ success: true })
  } catch (e) { return c.json({ error: '更新に失敗しました' }, 500) }
})

app.delete('/users/:id', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers as any })
  if ((session?.user as AuthUser)?.role !== 'SYSTEM_ADMIN') return c.json({ error: '権限がありません' }, 403)

  const userId = c.req.param('id')
  try {
    await c.env.DB.prepare(`DELETE FROM team_members WHERE user_id = ?`).bind(userId).run()
    await c.env.DB.prepare(`DELETE FROM user WHERE id = ?`).bind(userId).run()
    return c.json({ success: true })
  } catch (e) { return c.json({ error: '削除に失敗しました' }, 500) }
})

app.get('/teams', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers as any })
  if ((session?.user as AuthUser)?.role !== 'SYSTEM_ADMIN') return c.json({ error: '権限がありません' }, 403)

  try {
    const { results } = await c.env.DB.prepare(`
            SELECT t.id, t.name, t.created_at as createdAt, (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as memberCount
            FROM teams t ORDER BY t.created_at DESC
        `).all()
    return c.json(results)
  } catch (e) { return c.json({ error: 'チーム一覧の取得に失敗しました' }, 500) }
})

app.get('/teams/:id/members', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers as any })
  if ((session?.user as AuthUser)?.role !== 'SYSTEM_ADMIN') return c.json({ error: '権限がありません' }, 403)

  const teamId = c.req.param('id')
  try {
    const { results } = await c.env.DB.prepare(`SELECT u.id, u.name, u.email, tm.role FROM team_members tm JOIN user u ON tm.user_id = u.id WHERE tm.team_id = ?`).bind(teamId).all()
    return c.json(results)
  } catch (e) { return c.json({ error: 'メンバー取得に失敗しました' }, 500) }
})

app.post('/teams/:id/members', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers as any })
  if ((session?.user as AuthUser)?.role !== 'SYSTEM_ADMIN') return c.json({ error: '権限がありません' }, 403)

  const teamId = c.req.param('id')
  const { userId, role } = await c.req.json()
  const db = drizzle(c.env.DB)

  try {
    const existing = await db.select().from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId))).get()
    if (existing) {
      await db.update(teamMembers).set({ role }).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    } else {
      await db.insert(teamMembers).values({ id: crypto.randomUUID(), teamId: teamId, userId: userId, role: role, joinedAt: new Date() })
    }
    return c.json({ success: true })
  } catch (e) { return c.json({ error: 'メンバーの追加に失敗しました' }, 500) }
})

app.delete('/teams/:id/members/:userId', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers as any })
  if ((session?.user as AuthUser)?.role !== 'SYSTEM_ADMIN') return c.json({ error: '権限がありません' }, 403)

  const teamId = c.req.param('id')
  const userId = c.req.param('userId')
  try {
    await c.env.DB.prepare(`DELETE FROM team_members WHERE team_id = ? AND user_id = ?`).bind(teamId, userId).run()
    return c.json({ success: true })
  } catch (e) { return c.json({ error: 'メンバーの解除に失敗しました' }, 500) }
})

export default app