// filepath: src/api/teams/members.ts
import type { Context } from 'hono'
import { getAuth } from "@/lib/auth"
import { drizzle } from 'drizzle-orm/d1'
import { teams, teamMembers, teamRoleSettings } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { canManageTeam, ROLES } from '@/lib/roles'
import type { AuthUser } from '@/types/api'

/** 🌟 チーム参加申請 */
export const handleJoinTeam = async (c: Context) => {
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
      role: 'pending',
      status: 'pending',
    })

    return c.json({ success: true, message: '参加申請を送信しました！' })
  } catch (e: any) { 
    console.error("[iScore API Error] チーム参加申請でエラー:", e.message);
    return c.json({ success: false, error: '申請処理に失敗しました', details: e.message }, 500) 
  }
}

/** チーム検索 */
export const handleSearchTeam = async (c: Context) => {
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
  } catch (e: any) { return c.json({ success: false, error: '検索に失敗しました', details: e.message }, 500) }
}

/** 🌟 チームメンバー一覧取得 */
export const handleGetMembers = async (c: Context) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const teamId = c.req.param('id')
  const db = drizzle(c.env.DB)

  try {
    const myMembership = await db.select().from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, session.user.id))).get()
    if (!myMembership) return c.json({ error: '権限がありません' }, 403)

    let roleSettings: any[] = []
    try {
      roleSettings = await db.select().from(teamRoleSettings).where(eq(teamRoleSettings.teamId, teamId))
    } catch (sqlError) {
      console.warn("[iScore Warning] team_role_settings テーブルが未作成です。")
    }
  
    const { results } = await c.env.DB.prepare(`
      SELECT
        tm.id        AS memberId,
        tm.user_id   AS userId,
        tm.role,
        tm.status,
        tm.joined_at AS joinedAt,
        u.name,
        u.image      AS avatarUrl,
        (SELECT GROUP_CONCAT(provider) FROM account WHERE userId = u.id) AS providers
      FROM team_members tm
      JOIN user u ON tm.user_id = u.id
      WHERE tm.team_id = ?
      ORDER BY
        CASE tm.status WHEN 'pending' THEN 0 ELSE 1 END,
        tm.joined_at ASC
    `).bind(teamId).all()

    const formattedMembers = results.map((row: any) => ({
      memberId: row.memberId,
      userId: row.userId,
      role: row.role,
      status: row.status,
      joinedAt: row.joinedAt,
      name: row.name,
      avatarUrl: row.avatarUrl,
      authProviders: row.providers ? row.providers.split(',') : [],
    }))

    return c.json({ success: true, members: formattedMembers, inviteCode: teamId, roleSettings })
  } catch (e: any) {
    return c.json({ success: false, error: 'メンバー一覧の取得に失敗しました', details: e.message }, 500)
  }
}

/** 🌟 役割呼称カスタマイズの保存・更新 */
export const handlePutRoleSettings = async (c: Context) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const teamId = c.req.param('id')
  const { settings } = await c.req.json<{ settings: Array<{ role: string, customLabel: string }> }>()
  const db = drizzle(c.env.DB)

  try {
    const myMembership = await db.select().from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, session.user.id))).get()
    if (!myMembership || !canManageTeam(myMembership.role)) return c.json({ error: '権限がありません' }, 403)

    try {
      await c.env.DB.prepare(`DELETE FROM team_role_settings WHERE team_id = ?`).bind(teamId).run()
      for (const item of settings) {
        if (!item.customLabel.trim()) continue
        await db.insert(teamRoleSettings).values({
          id: crypto.randomUUID(),
          teamId,
          role: item.role.toLowerCase(),
          customLabel: item.customLabel.trim()
        })
      }
    } catch (sqlError) {
      return c.json({ success: false, error: 'データベースの役割設定テーブルが存在しません。先にマイグレーションを実行してください。' }, 500)
    }

    return c.json({ success: true })
  } catch (e: any) { return c.json({ success: false, error: '呼称設定の保存に失敗しました', details: e.message }, 500) }
}

/** 🌟 メンバーのロール変更（＆承認待ちからの自動アクティブ昇格） */
export const handlePatchMemberRole = async (c: Context) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const teamId   = c.req.param('id')
  const memberId = c.req.param('memberId')
  const { role } = await c.req.json<{ role: string }>()
  const db = drizzle(c.env.DB)

  try {
    const myMembership = await db.select().from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, session.user.id))).get()
    const isAdmin = (session.user as AuthUser).role === 'SYSTEM_ADMIN' || (session.user as AuthUser).role === 'admin'
    if (!isAdmin && (!myMembership || !canManageTeam(myMembership.role))) {
      return c.json({ error: '権限がありません' }, 403)
    }

    // 💡 役割(role)の更新と一緒に、status を確実に 'active' へ書き換えて自動承認！
    await db.update(teamMembers)
      .set({ 
        role: role.toLowerCase(),
        status: 'active' 
      })
      .where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, teamId)))

    return c.json({ success: true })
  } catch (e: any) { 
    return c.json({ success: false, error: 'Failed', details: e.message }, 500) 
  }
}

/** メンバーを除名 */
export const handleRemoveMember = async (c: Context) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const teamId   = c.req.param('id')
  const memberId = c.req.param('memberId')
  const db = drizzle(c.env.DB)

  try {
    const myMembership = await db.select().from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, session.user.id))).get()
    const isAdmin = (session.user as AuthUser).role === 'SYSTEM_ADMIN' || (session.user as AuthUser).role === 'admin'
    if (!isAdmin && (!myMembership || !canManageTeam(myMembership.role))) {
      return c.json({ error: '権限がありません' }, 403)
    }

    const target = await db.select().from(teamMembers).where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, teamId))).get()
    if (target?.userId === session.user.id) return c.json({ error: '自分自身を除名することはできません' }, 400)

    await db.delete(teamMembers).where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, teamId)))
    return c.json({ success: true })
  } catch (e: any) { return c.json({ success: false, error: 'Failed', details: e.message }, 500) }
}
