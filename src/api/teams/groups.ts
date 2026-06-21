// src/api/teams/groups.ts
import { Hono } from 'hono'
import { getAuth } from "@/lib/auth"
import { drizzle } from 'drizzle-orm/d1'
import { teamGroups, teamGroupMembers, teamMembers, players } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { canManageTeam } from '@/lib/roles'
import type { AuthUser, WorkerEnv } from '@/types/api'

const app = new Hono<{ Bindings: WorkerEnv }>()

/** 👥 チーム内のグループ一覧取得 (所属メンバー & 役割付き) */
app.get('/:teamId/groups', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers as any })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const teamId = c.req.param('teamId')
  const db = drizzle(c.env.DB)

  try {
    // 自身の権限チェック (メンバーなら閲覧可)
    const myMembership = await db.select().from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, session.user.id))).get()
    if (!myMembership) return c.json({ error: '権限がありません' }, 403)

    // ① チームに属する全グループの取得
    const groups = await db.select().from(teamGroups)
      .where(eq(teamGroups.teamId, teamId))
      .orderBy(teamGroups.createdAt)

    // ② グループ所属メンバーの取得 (選手情報、あるいはスタッフ・保護者情報をLEFT JOINで綺麗に結合)
    const { results: members } = await c.env.DB.prepare(`
      SELECT
        tgm.id               AS relationId,
        tgm.group_id         AS groupId,
        tgm.player_id        AS playerId,
        tgm.team_member_id   AS teamMemberId,
        tgm.role             AS role,
        tgm.system_role      AS systemRole,
        -- 選手の場合の名前
        p.name               AS playerName,
        p.uniform_number     AS playerUniformNumber,
        -- 選手以外の場合の名前 (アカウント紐付けと名簿登録の双方に対応)
        COALESCE(tm.name, u.name) AS otherName,
        tm.member_type       AS otherMemberType
      FROM team_group_members tgm
      LEFT JOIN players p ON tgm.player_id = p.id
      LEFT JOIN team_members tm ON tgm.team_member_id = tm.id
      LEFT JOIN user u ON tm.user_id = u.id
      WHERE tgm.group_id IN (SELECT id FROM team_groups WHERE team_id = ?)
    `).bind(teamId).all()

    // ③ フロントエンドで扱いやすい形にフォーマット
    const formattedMembers = members.map((m: any) => {
      const isPlayer = !!m.playerId;
      return {
        relationId: m.relationId,
        groupId: m.groupId,
        playerId: m.playerId,
        teamMemberId: m.teamMemberId,
        role: m.role || "",
        systemRole: m.systemRole || "",
        name: isPlayer ? m.playerName : (m.otherName || "名前なし"),
        type: isPlayer ? "player" : (m.otherMemberType || "other"),
        uniformNumber: isPlayer ? m.playerUniformNumber : null,
      }
    })

    return c.json({ success: true, groups, members: formattedMembers })
  } catch (e: any) {
    return c.json({ success: false, error: 'グループ一覧の取得に失敗しました', details: e.message }, 500)
  }
})

/** 👥 新規グループ作成 (子グループとしての登録も parentId で対応) */
app.post('/:teamId/groups', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers as any })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const teamId = c.req.param('teamId')
  const { name, parentId } = await c.req.json<{ name: string; parentId?: string | null }>()
  const db = drizzle(c.env.DB)

  try {
    const myMembership = await db.select().from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, session.user.id))).get()
    const isAdmin = (session.user as AuthUser).role === 'SYSTEM_ADMIN' || (session.user as AuthUser).role === 'admin'
    if (!isAdmin && (!myMembership || !canManageTeam(myMembership.role))) {
      return c.json({ error: '権限がありません' }, 403)
    }

    if (!name || !name.trim()) {
      return c.json({ error: 'グループ名は必須です' }, 400)
    }

    const newGroupId = crypto.randomUUID()
    await db.insert(teamGroups).values({
      id: newGroupId,
      teamId,
      name: name.trim(),
      parentId: parentId || null
    })

    return c.json({ success: true, groupId: newGroupId })
  } catch (e: any) {
    return c.json({ success: false, error: 'グループの作成に失敗しました', details: e.message }, 500)
  }
})

/** 👥 グループ更新 (名前変更・親グループ付け替え) */
app.patch('/:teamId/groups/:groupId', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers as any })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const teamId = c.req.param('teamId')
  const groupId = c.req.param('groupId')
  const { name, parentId } = await c.req.json<{ name?: string; parentId?: string | null }>()
  const db = drizzle(c.env.DB)

  try {
    const myMembership = await db.select().from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, session.user.id))).get()
    const isAdmin = (session.user as AuthUser).role === 'SYSTEM_ADMIN' || (session.user as AuthUser).role === 'admin'
    if (!isAdmin && (!myMembership || !canManageTeam(myMembership.role))) {
      return c.json({ error: '権限がありません' }, 403)
    }

    // 循環参照チェック (自身を親に設定しようとしていないか)
    if (parentId === groupId) {
      return c.json({ error: '自分自身を親グループに指定することはできません' }, 400)
    }

    await db.update(teamGroups)
      .set({
        name: name !== undefined ? name.trim() : undefined,
        parentId: parentId !== undefined ? parentId : undefined
      })
      .where(and(eq(teamGroups.id, groupId), eq(teamGroups.teamId, teamId)))

    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ success: false, error: 'グループの更新に失敗しました', details: e.message }, 500)
  }
})

/** 👥 グループ削除 (配下の子やメンバー所属も cascade で自動削除) */
app.delete('/:teamId/groups/:groupId', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers as any })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const teamId = c.req.param('teamId')
  const groupId = c.req.param('groupId')
  const db = drizzle(c.env.DB)

  try {
    const myMembership = await db.select().from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, session.user.id))).get()
    const isAdmin = (session.user as AuthUser).role === 'SYSTEM_ADMIN' || (session.user as AuthUser).role === 'admin'
    if (!isAdmin && (!myMembership || !canManageTeam(myMembership.role))) {
      return c.json({ error: '権限がありません' }, 403)
    }

    await db.delete(teamGroups).where(and(eq(teamGroups.id, groupId), eq(teamGroups.teamId, teamId)))
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ success: false, error: 'グループの削除に失敗しました', details: e.message }, 500)
  }
})

/** 👥 グループへメンバー所属の追加 & 役割設定 */
app.post('/:teamId/groups/:groupId/members', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers as any })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const teamId = c.req.param('teamId')
  const groupId = c.req.param('groupId')
  const { playerId, teamMemberId, role, systemRole } = await c.req.json<{
    playerId?: string | null;
    teamMemberId?: string | null;
    role?: string | null;
    systemRole?: string | null;
  }>()
  const db = drizzle(c.env.DB)

  try {
    const myMembership = await db.select().from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, session.user.id))).get()
    const isAdmin = (session.user as AuthUser).role === 'SYSTEM_ADMIN' || (session.user as AuthUser).role === 'admin'
    if (!isAdmin && (!myMembership || !canManageTeam(myMembership.role))) {
      return c.json({ error: '権限がありません' }, 403)
    }

    if (!playerId && !teamMemberId) {
      return c.json({ error: '所属させるメンバーが指定されていません' }, 400)
    }

    // 重複所属の確認
    const existing = await db.select().from(teamGroupMembers)
      .where(
        and(
          eq(teamGroupMembers.groupId, groupId),
          playerId ? eq(teamGroupMembers.playerId, playerId) : eq(teamGroupMembers.teamMemberId, teamMemberId!)
        )
      ).get()
    if (existing) {
      return c.json({ error: 'このメンバーはすでにグループに登録されています' }, 400)
    }

    const relationId = crypto.randomUUID()
    await db.insert(teamGroupMembers).values({
      id: relationId,
      groupId,
      playerId: playerId || null,
      teamMemberId: teamMemberId || null,
      role: role?.trim() || null,
      systemRole: systemRole || null
    })

    // 💡 チームメンバーのシステムロールと連動同期 (選手以外のスタッフ・保護者のみ)
    if (teamMemberId && systemRole) {
      await db.update(teamMembers)
        .set({ role: systemRole })
        .where(eq(teamMembers.id, teamMemberId))
    }

    return c.json({ success: true, relationId })
  } catch (e: any) {
    return c.json({ success: false, error: 'メンバーの追加に失敗しました', details: e.message }, 500)
  }
})

/** 👥 グループ内メンバーの役割 (role) 編集 */
app.patch('/:teamId/groups/:groupId/members/:relationId', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers as any })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const teamId = c.req.param('teamId')
  const groupId = c.req.param('groupId')
  const relationId = c.req.param('relationId')
  const { role, systemRole } = await c.req.json<{ role: string | null; systemRole?: string | null }>()
  const db = drizzle(c.env.DB)

  try {
    const myMembership = await db.select().from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, session.user.id))).get()
    const isAdmin = (session.user as AuthUser).role === 'SYSTEM_ADMIN' || (session.user as AuthUser).role === 'admin'
    if (!isAdmin && (!myMembership || !canManageTeam(myMembership.role))) {
      return c.json({ error: '権限がありません' }, 403)
    }

    await db.update(teamGroupMembers)
      .set({ 
        role: role?.trim() || null,
        systemRole: systemRole !== undefined ? (systemRole || null) : undefined
      })
      .where(and(eq(teamGroupMembers.id, relationId), eq(teamGroupMembers.groupId, groupId)))

    // 💡 チームメンバーのシステムロールと連動同期
    if (systemRole) {
      const rel = await db.select().from(teamGroupMembers).where(eq(teamGroupMembers.id, relationId)).get()
      if (rel && rel.teamMemberId) {
        await db.update(teamMembers)
          .set({ role: systemRole })
          .where(eq(teamMembers.id, rel.teamMemberId))
      }
    }

    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ success: false, error: '役割の更新に失敗しました', details: e.message }, 500)
  }
})

/** 👥 グループからメンバーを除外 */
app.delete('/:teamId/groups/:groupId/members/:relationId', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers as any })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const teamId = c.req.param('teamId')
  const groupId = c.req.param('groupId')
  const relationId = c.req.param('relationId')
  const db = drizzle(c.env.DB)

  try {
    const myMembership = await db.select().from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, session.user.id))).get()
    const isAdmin = (session.user as AuthUser).role === 'SYSTEM_ADMIN' || (session.user as AuthUser).role === 'admin'
    if (!isAdmin && (!myMembership || !canManageTeam(myMembership.role))) {
      return c.json({ error: '権限がありません' }, 403)
    }

    await db.delete(teamGroupMembers)
      .where(and(eq(teamGroupMembers.id, relationId), eq(teamGroupMembers.groupId, groupId)))

    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ success: false, error: 'メンバーの除外に失敗しました', details: e.message }, 500)
  }
})

export default app
