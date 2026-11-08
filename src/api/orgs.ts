// filepath: src/api/orgs.ts
import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { organizations, organizationMembers, teams } from '@/db/schema'
import { resolveCallerTeamAccess } from '@/lib/team-access'
import type { WorkerEnv } from '@/types/api'
import { desc, eq, and, inArray } from 'drizzle-orm'

const app = new Hono<{ Bindings: WorkerEnv }>()

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 💡 1. クラブ一覧取得 (カテゴリも取得するように修正！)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.get('/', async (c) => {
  const access = await resolveCallerTeamAccess(c)
  if (!access.sessionUser) return c.json({ error: 'Unauthorized' }, 401)

  const db = drizzle(c.env.DB)
  if (access.isSystemAdmin) {
    const allOrgs = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        category: organizations.category,
      })
      .from(organizations)
      .orderBy(desc(organizations.createdAt))
      .all()
    return c.json(allOrgs.map((o) => ({ ...o, myRole: 'OWNER' })))
  }

  const candidateIds = access.candidateUserIds.length > 0
    ? access.candidateUserIds
    : [access.sessionUser.id]

  const myOrgs = await db.select({
    id: organizations.id,
    name: organizations.name,
    category: organizations.category, // 💡 これがないとフロントのタブ絞り込みが効きません
    myRole: organizationMembers.role,
  })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(inArray(organizationMembers.userId, candidateIds))
    .orderBy(desc(organizations.createdAt))

  return c.json(myOrgs)
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 💡 2. 新規クラブ作成 (重複チェック ＆ 外部クラブ判定！)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.post('/', async (c) => {
  const access = await resolveCallerTeamAccess(c)
  if (!access.sessionUser) return c.json({ error: 'Unauthorized' }, 401)

  // 💡 body から isExternal と category を受け取る
  const body = await c.req.json<{ name: string; isExternal?: boolean; category?: string }>()
  const { name, isExternal, category } = body
  const db = drizzle(c.env.DB)
  const candidateIds = access.candidateUserIds.length > 0
    ? access.candidateUserIds
    : [access.sessionUser.id]

  try {
    // 💡 究極化：自分が既に同じ名前のクラブを登録していないかチェック！
    // （他人が作った同名クラブは関係なく、自分のリストの中だけで重複を弾きます）
    const existingOrgs = await db.select({ id: organizations.id })
      .from(organizations)
      .innerJoin(organizationMembers, eq(organizations.id, organizationMembers.organizationId))
      .where(
        and(
          eq(organizations.name, name),
          inArray(organizationMembers.userId, candidateIds)
        )
      ).limit(1)

    if (existingOrgs.length > 0) {
      return c.json({ success: false, error: `「${name}」は既に登録されています。` }, 400)
    }

    const orgId = crypto.randomUUID()

    // 1. クラブの作成（カテゴリも保存）
    await db.insert(organizations).values({
      id: orgId,
      name: name,
      category: category || 'other',
      createdAt: new Date(),
    })

    // 2. メンバー登録（💡 対戦相手なら OPPONENT_MANAGER、自チームなら OWNER！）
    const role = isExternal ? 'OPPONENT_MANAGER' : 'OWNER'

    await db.insert(organizationMembers).values({
      id: crypto.randomUUID(),
      organizationId: orgId,
      userId: access.sessionUser.id,
      role: role,
      createdAt: new Date(),
    })

    return c.json({ success: true, orgId })
  } catch (e) {
    console.error("組織作成エラー:", e)
    return c.json({ success: false, error: 'Failed to create organization' }, 500)
  }
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 💡 3. チーム一覧取得（所属クラブ・承認済みチームのみ返却）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.get('/:orgId/teams', async (c) => {
  const access = await resolveCallerTeamAccess(c)
  if (!access.sessionUser) return c.json({ error: 'Unauthorized' }, 401)

  const orgId = c.req.param('orgId')
  const db = drizzle(c.env.DB)

  if (!access.isSystemAdmin) {
    const candidateIds = access.candidateUserIds.length > 0
      ? access.candidateUserIds
      : [access.sessionUser.id]

    const orgMembership = await db
      .select({
        role: organizationMembers.role,
        status: organizationMembers.status,
      })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          inArray(organizationMembers.userId, candidateIds)
        )
      )
      .get()

    const hasActiveOrgMembership = Boolean(
      orgMembership && (orgMembership.status || 'active').toLowerCase() === 'active'
    )

    if (!hasActiveOrgMembership && !access.canAccessOrganization(orgId)) {
      return c.json({ error: '権限がありません' }, 403)
    }

    const orgTeams = await db.select()
      .from(teams)
      .where(eq(teams.organizationId, orgId))
      .orderBy(desc(teams.createdAt))

    const roleUpper = (orgMembership?.role || '').toUpperCase()
    const canSeeAllOrgTeams =
      hasActiveOrgMembership &&
      (roleUpper === 'OWNER' ||
        roleUpper === 'ADMIN' ||
        roleUpper === 'MANAGER' ||
        roleUpper === 'IT_ADMIN' ||
        roleUpper === 'OPPONENT_MANAGER')

    if (canSeeAllOrgTeams) {
      return c.json(orgTeams)
    }

    return c.json(orgTeams.filter((t) => access.canAccessTeam(t.id)))
  }

  const orgTeams = await db.select()
    .from(teams)
    .where(eq(teams.organizationId, orgId))
    .orderBy(desc(teams.createdAt))

  return c.json(orgTeams)
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 💡 4. クラブの削除
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.delete('/:orgId', async (c) => {
  const access = await resolveCallerTeamAccess(c)
  if (!access.sessionUser) return c.json({ error: 'Unauthorized' }, 401)

  const orgId = c.req.param('orgId')
  const db = drizzle(c.env.DB)
  const candidateIds = access.candidateUserIds.length > 0
    ? access.candidateUserIds
    : [access.sessionUser.id]

  try {
    const member = await db.select().from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, orgId), inArray(organizationMembers.userId, candidateIds))).get()

    // 対戦相手（OPPONENT_MANAGER）も削除できるように条件追加
    if (!access.isSystemAdmin && (!member || (member.role !== 'OWNER' && member.role !== 'OPPONENT_MANAGER'))) {
      return c.json({ error: '権限がありません' }, 403)
    }

    const orgTeams = await db.select({ id: teams.id }).from(teams).where(eq(teams.organizationId, orgId))

    for (const t of orgTeams) {
      const teamId = t.id
      await c.env.DB.prepare(`DELETE FROM match_lineups WHERE match_id IN (SELECT id FROM matches WHERE team_id = ?)`).bind(teamId).run()
      await c.env.DB.prepare(`DELETE FROM pitches WHERE at_bat_id IN (SELECT id FROM at_bats WHERE match_id IN (SELECT id FROM matches WHERE team_id = ?))`).bind(teamId).run()
      await c.env.DB.prepare(`DELETE FROM at_bats WHERE match_id IN (SELECT id FROM matches WHERE team_id = ?)`).bind(teamId).run()
      await c.env.DB.prepare(`DELETE FROM matches WHERE team_id = ?`).bind(teamId).run()
      await c.env.DB.prepare(`DELETE FROM players WHERE team_id = ?`).bind(teamId).run()
      await c.env.DB.prepare(`DELETE FROM lineup_templates WHERE team_id = ?`).bind(teamId).run()
      await c.env.DB.prepare(`DELETE FROM team_members WHERE team_id = ?`).bind(teamId).run()
    }

    await c.env.DB.prepare(`DELETE FROM teams WHERE organization_id = ?`).bind(orgId).run()
    await c.env.DB.prepare(`DELETE FROM organization_members WHERE organization_id = ?`).bind(orgId).run()
    await c.env.DB.prepare(`DELETE FROM organizations WHERE id = ?`).bind(orgId).run()

    return c.json({ success: true })
  } catch (e) {
    console.error("クラブ削除エラー:", e)
    return c.json({ success: false, error: 'Failed to delete organization' }, 500)
  }
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 💡 5. クラブ（組織）の更新 (カテゴリ変更に対応！)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.patch('/:orgId', async (c) => {
  const access = await resolveCallerTeamAccess(c)
  if (!access.sessionUser) return c.json({ error: 'Unauthorized' }, 401)

  const orgId = c.req.param('orgId')
  const body = await c.req.json<{ name: string; category?: string }>()
  const db = drizzle(c.env.DB)
  const candidateIds = access.candidateUserIds.length > 0
    ? access.candidateUserIds
    : [access.sessionUser.id]

  try {
    const member = await db.select().from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, orgId), inArray(organizationMembers.userId, candidateIds))).get()

    if (!access.isSystemAdmin && (!member || (member.role !== 'OWNER' && member.role !== 'OPPONENT_MANAGER'))) {
      return c.json({ error: '権限がありません' }, 403)
    }

    // 💡 category が送られてきた場合は一緒に更新
    if (body.category) {
      await c.env.DB.prepare(`UPDATE organizations SET name = ?, category = ? WHERE id = ?`)
        .bind(body.name, body.category, orgId).run()
    } else {
      await c.env.DB.prepare(`UPDATE organizations SET name = ? WHERE id = ?`)
        .bind(body.name, orgId).run()
    }

    return c.json({ success: true })
  } catch (e) {
    console.error("クラブ更新エラー:", e)
    return c.json({ success: false, error: 'Failed to update organization' }, 500)
  }
})

export default app
