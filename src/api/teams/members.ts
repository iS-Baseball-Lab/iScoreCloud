// filepath: src/api/teams/members.ts
import { Hono } from 'hono'
import { getAuth } from "@/lib/auth"
import { drizzle } from 'drizzle-orm/d1'
import { teams, teamMembers, teamRoleSettings } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { canManageTeam, ROLES } from '@/lib/roles'
import type { AuthUser } from '@/types/api'
import { ulid } from 'ulid'

const app = new Hono<{ Bindings: { DB: D1Database, ASSETS: Fetcher } }>()

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 招待・申請関連（固定ルート）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 🌟 チーム参加申請 (招待コード＝チームIDを入力するフロントと完全合致) */
app.post('/join', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session || !session.user) return c.json({ success: false, error: 'Unauthorized' }, 401)

  const body = await c.req.json().catch(() => null)
  if (!body || !body.inviteCode) {
    return c.json({ success: false, error: '招待コードが入力されていません' }, 400)
  }

  const targetTeamId = body.inviteCode.trim()
  const db = drizzle(c.env.DB)

  try {
    const team = await db.select().from(teams).where(eq(teams.id, targetTeamId)).get()
    if (!team) return c.json({ success: false, error: '無効な招待コードです' }, 444)

    const existing = await db.select().from(teamMembers).where(and(eq(teamMembers.teamId, targetTeamId), eq(teamMembers.userId, session.user.id))).get()
    if (existing) {
      if (existing.status === 'pending') return c.json({ success: false, error: 'すでに参加申請を送信済みです。承認をお待ちください。' }, 400)
      return c.json({ success: false, error: 'すでにこのチームに参加しています。' }, 400)
    }

    await db.insert(teamMembers).values({
      id: crypto.randomUUID(),
      teamId: targetTeamId,
      userId: session.user.id,
      role: ROLES.PENDING,
      status: 'pending',
      joinedAt: Math.floor(Date.now() / 1000)
    })

    return c.json({ success: true, message: '参加申請を送信しました！' })
  } catch (e) { return c.json({ success: false, error: '申請処理に失敗しました' }, 500) }
})

/** チーム検索（IDからチームの基本情報を特定する） */
app.get('/search/:id', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)
  const teamId = c.req.param('id')
  const db = drizzle(c.env.DB)

  try {
    const teamData = await db.select({ id: teams.id, name: teams.name, year: teams.year, tier: teams.tier })
      .from(teams).where(eq(teams.id, teamId)).get()
    if (!teamData) return c.json({ success: false, error: '指定されたチームが見つかりません' }, 404)
    return c.json({ success: true, team: teamData })
  } catch (e) { return c.json({ success: false, error: '検索に失敗しました' }, 500) }
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メンバー管理 ＆ 役割呼称設定 (動的ルート)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 🌟 チームメンバー一覧取得（カスタム呼称マスタと招待コード＝チームIDの返却） */
app.get('/:id/members', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const teamId = c.req.param('id')
  const db = drizzle(c.env.DB)

  try {
    const myMembership = await db.select().from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, session.user.id))).get()
    if (!myMembership) return c.json({ error: '権限がありません' }, 403)

    const roleSettings = await db.select().from(teamRoleSettings).where(eq(teamRoleSettings.teamId, teamId))
  
    const { results } = await c.env.DB.prepare(`
      SELECT
        tm.id        AS memberId,
        tm.user_id   AS userId,
        tm.role,
        tm.status,
        tm.joined_at AS joinedAt,
        u.name,
        u.email,
        u.image      AS avatarUrl
      FROM team_members tm
      JOIN user u ON tm.user_id = u.id
      WHERE tm.team_id = ?
      ORDER BY
        CASE tm.status WHEN 'pending' THEN 0 ELSE 1 END,
        tm.joined_at ASC
    `).bind(teamId).all()

    return c.json({ success: true, members: results, inviteCode: teamId, roleSettings })
  } catch (e) {
    return c.json({ success: false, error: 'メンバー一覧の取得に失敗しました' }, 500)
  }
})

/** 🌟 役割呼称カスタマイズの保存・更新 (Upsert) */
app.put('/:id/roles/settings', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const teamId = c.req.param('id')
  const { settings } = await c.req.json<{ settings: Array<{ role: string, customLabel: string }> }>()
  const db = drizzle(c.env.DB)

  try {
    const myMembership = await db.select().from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, session.user.id))).get()
    if (!myMembership || !canManageTeam(myMembership.role)) return c.json({ error: '権限がありません' }, 403)

    await c.env.DB.prepare(`DELETE FROM team_role_settings WHERE team_id = ?`).bind(teamId).run()

    for (const item of settings) {
      if (!item.customLabel.trim()) continue
      await db.insert(teamRoleSettings).values({
        id: ulid(),
        teamId,
        role: item.role.toLowerCase(),
        customLabel: item.customLabel.trim()
      })
    }

    return c.json({ success: true })
  } catch (e) { return c.json({ success: false, error: '呼称設定の保存に失敗しました' }, 500) }
})

/** メンバーのロール変更 */
app.patch('/:id/members/:memberId', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const teamId   = c.req.param('id')
  const memberId = c.req.param('memberId')
  const { role } = await c.req.json<{ role: string }>()
  const db = drizzle(c.env.DB)

  try {
    const myMembership = await db.select().from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, session.user.id))).get()
    const isAdmin = (session.user as AuthUser).role === 'SYSTEM_ADMIN'
    if (!isAdmin && (!myMembership || !canManageTeam(myMembership.role))) {
      return c.json({ error: '権限がありません' }, 403)
    }

    await db.update(teamMembers)
      .set({ role: role.toLowerCase() })
      .where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, teamId)))

    return c.json({ success: true })
  } catch (e) { return c.json({ success: false, error: 'Failed' }, 500) }
})

/** メンバーを除名 */
app.delete('/:id/members/:memberId', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const teamId   = c.req.param('id')
  const memberId = c.req.param('memberId')
  const db = drizzle(c.env.DB)

  try {
    const myMembership = await db.select().from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, session.user.id))).get()
    const isAdmin = (session.user as AuthUser).role === 'SYSTEM_ADMIN'
    if (!isAdmin && (!myMembership || !canManageTeam(myMembership.role))) {
      return c.json({ error: '権限がありません' }, 403)
    }

    const target = await db.select().from(teamMembers).where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, teamId))).get()
    if (target?.userId === session.user.id) return c.json({ error: '自分自身を除名することはできません' }, 400)

    await db.delete(teamMembers).where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, teamId)))
    return c.json({ success: true })
  } catch (e) { return c.json({ success: false, error: 'Failed' }, 500) }
})

/** 承認待ち申請一覧取得 */
app.get('/:id/requests', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)
  const teamId = c.req.param('id')
  const db = drizzle(c.env.DB)

  try {
    const myMembership = await db.select().from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, session.user.id))).get()
    if (!myMembership || !canManageTeam(myMembership.role)) return c.json({ error: '権限がありません' }, 403)

    const { results } = await c.env.DB.prepare(`
      SELECT tm.id AS memberId, tm.user_id AS userId, tm.role, tm.status, tm.joined_at AS joinedAt, u.name, u.email, u.image AS avatarUrl
      FROM team_members tm
      JOIN user u ON tm.user_id = u.id
      WHERE tm.team_id = ? AND tm.status = 'pending'
      ORDER BY tm.joined_at ASC
    `).bind(teamId).all()

    return c.json({ success: true, requests: results })
  } catch (e) { return c.json({ success: false, error: 'Failed' }, 500) }
})

/** 参加申請の承認・拒否 */
app.patch('/:id/requests/:memberId', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)
  const teamId = c.req.param('id')
  const memberId = c.req.param('memberId')
  const body = await c.req.json()
  const db = drizzle(c.env.DB)

  try {
    const myMembership = await db.select().from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, session.user.id))).get()
    if (!myMembership || !canManageTeam(myMembership.role)) return c.json({ error: '権限がありません' }, 403)

    if (body.action === 'approve') {
      await db.update(teamMembers).set({ status: 'active', role: 'player' }).where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, teamId)))
      return c.json({ success: true, message: '参加を承認しました' })
    } else if (body.action === 'reject') {
      await db.delete(teamMembers).where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, teamId)))
      return c.json({ success: true, message: '参加申請を拒否しました' })
    }
    return c.json({ success: false, error: 'Invalid action' }, 400)
  } catch (e) { return c.json({ success: false, error: 'Failed' }, 500) }
})

export default app
