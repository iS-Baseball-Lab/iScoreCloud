// src/api/orgs.ts
import { Hono } from 'hono'
import { getAuth } from "@/lib/auth"
import { drizzle } from 'drizzle-orm/d1'
import { organizations, organizationMembers, teams } from '@/db/schema'
import type { AuthUser } from '@/types/api'
import { desc, eq, and } from 'drizzle-orm'

import type { WorkerEnv } from '@/types/api'

const app = new Hono<{ Bindings: WorkerEnv }>()

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 💡 1. クラブ一覧取得 (カテゴリも取得するように修正！)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.get('/', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const db = drizzle(c.env.DB)
  const myOrgs = await db.select({
    id: organizations.id,
    name: organizations.name,
    category: organizations.category, // 💡 これがないとフロントのタブ絞り込みが効きません
    myRole: organizationMembers.role,
  })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(eq(organizationMembers.userId, session.user.id))
    .orderBy(desc(organizations.createdAt))

  return c.json(myOrgs)
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 💡 2. 新規クラブ作成 (重複チェック ＆ 外部クラブ判定！)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.post('/', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  // 💡 body から isExternal と category を受け取る
  const body = await c.req.json()
  const { name, isExternal, category } = body
  const db = drizzle(c.env.DB)

  try {
    // 💡 究極化：自分が既に同じ名前のクラブを登録していないかチェック！
    // （他人が作った同名クラブは関係なく、自分のリストの中だけで重複を弾きます）
    const existingOrgs = await db.select({ id: organizations.id })
      .from(organizations)
      .innerJoin(organizationMembers, eq(organizations.id, organizationMembers.organizationId))
      .where(
        and(
          eq(organizations.name, name),
          eq(organizationMembers.userId, session.user.id)
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
      userId: session.user.id,
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
// 💡 3. チーム一覧取得
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.get('/:orgId/teams', async (c) => {
  const orgId = c.req.param('orgId')
  const db = drizzle(c.env.DB)

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
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const orgId = c.req.param('orgId')
  const db = drizzle(c.env.DB)

  try {
    const member = await db.select().from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, session.user.id))).get()

    // 対戦相手（OPPONENT_MANAGER）も削除できるように条件追加
    if ((session.user as AuthUser).role !== 'SYSTEM_ADMIN' && (!member || (member.role !== 'OWNER' && member.role !== 'OPPONENT_MANAGER'))) {
      return c.json({ error: '権限がありません' }, 403)
    }

    const orgTeams = await db.select({ id: teams.id }).from(teams).where(eq(teams.organizationId, orgId))

    for (const t of orgTeams) {
      const teamId = t.id;
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
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const orgId = c.req.param('orgId')
  const body = await c.req.json()
  const db = drizzle(c.env.DB)

  try {
    const member = await db.select().from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, session.user.id))).get()

    if ((session.user as AuthUser).role !== 'SYSTEM_ADMIN' && (!member || (member.role !== 'OWNER' && member.role !== 'OPPONENT_MANAGER'))) {
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