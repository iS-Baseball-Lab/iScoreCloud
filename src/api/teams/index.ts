import { Hono } from 'hono'
import { getAuth } from "@/lib/auth"
import { drizzle } from 'drizzle-orm/d1'
import { teams, teamMembers, organizations } from '@/db/schema'
import { desc, eq, and, ne } from 'drizzle-orm'
import { canManageTeam } from '@/lib/roles'
import type { AuthUser } from '@/types/api'

// 🔥 子ルーターのインポート
import playersApp from './players'
import statsApp from './stats'
import lineupsApp from './lineups'

const app = new Hono<{ Bindings: { DB: D1Database, ASSETS: Fetcher } }>()

// 🔥 子ルーターをマウント（URLは元のまま完全に動作します）
app.route('/', playersApp)
app.route('/', statsApp)
app.route('/', lineupsApp)

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// チーム基本CRUD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.get('/', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const db = drizzle(c.env.DB)
  const myTeams = await db.select({
    id: teams.id,
    name: teams.name,
    orgName: organizations.name,
    description: organizations.description,
    category: organizations.category,
    homeGround: teams.homeGround,
    managerName: teams.managerName,
    year: teams.year,
    tier: teams.tier,
    teamType: teams.teamType,
    myRole: teamMembers.role,
    isFounder: eq(teams.createdBy, session.user.id)
  })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .leftJoin(organizations, eq(teams.organizationId, organizations.id))
    .where(eq(teamMembers.userId, session.user.id))
    .orderBy(desc(teams.createdAt))

  return c.json(myTeams)
})

app.post('/', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const { name, role, organizationId, year, tier, teamType } = await c.req.json()
  const db = drizzle(c.env.DB)

  try {
    const teamId = crypto.randomUUID()
    await db.insert(teams).values({
      id: teamId, organizationId, name, year: year || new Date().getFullYear(),
      tier: tier || null, teamType: teamType || 'regular', createdBy: session.user.id,
    })
    await db.insert(teamMembers).values({ id: crypto.randomUUID(), teamId, userId: session.user.id, role })
    return c.json({ success: true, teamId })
  } catch (e) { return c.json({ success: false, error: 'Failed to create team' }, 500) }
})

app.patch('/:id', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const userRole = (session.user as AuthUser).role;
  const teamId = c.req.param('id')
  const body = await c.req.json()
  const db = drizzle(c.env.DB)

  try {
    const member = await db.select().from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, session.user.id))).get()
    if (userRole !== 'SYSTEM_ADMIN' && (!member || !canManageTeam(member.role))) return c.json({ error: '権限がありません' }, 403)

    await db.update(teams).set({ name: body.name, year: body.year, tier: body.tier, teamType: body.teamType }).where(eq(teams.id, teamId))
    return c.json({ success: true })
  } catch (e) { return c.json({ success: false, error: 'Failed to update team' }, 500) }
})

app.delete('/:id', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)
  const teamId = c.req.param('id')

  try {
    await c.env.DB.prepare(`DELETE FROM play_logs WHERE match_id IN (SELECT id FROM matches WHERE team_id = ?)`).bind(teamId).run()
    await c.env.DB.prepare(`DELETE FROM base_advances WHERE match_id IN (SELECT id FROM matches WHERE team_id = ?)`).bind(teamId).run()
    await c.env.DB.prepare(`DELETE FROM match_lineups WHERE match_id IN (SELECT id FROM matches WHERE team_id = ?)`).bind(teamId).run()
    await c.env.DB.prepare(`DELETE FROM pitches WHERE at_bat_id IN (SELECT id FROM at_bats WHERE match_id IN (SELECT id FROM matches WHERE team_id = ?))`).bind(teamId).run()
    await c.env.DB.prepare(`DELETE FROM at_bats WHERE match_id IN (SELECT id FROM matches WHERE team_id = ?)`).bind(teamId).run()
    await c.env.DB.prepare(`DELETE FROM matches WHERE team_id = ?`).bind(teamId).run()
    await c.env.DB.prepare(`DELETE FROM players WHERE team_id = ?`).bind(teamId).run()
    await c.env.DB.prepare(`DELETE FROM team_members WHERE team_id = ?`).bind(teamId).run()
    await c.env.DB.prepare(`DELETE FROM teams WHERE id = ?`).bind(teamId).run()
    return c.json({ success: true })
  } catch (e) { return c.json({ success: false, error: 'Failed to delete team' }, 500) }
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メンバー管理（MANAGER権限で操作可能）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** チームメンバー一覧取得（active のみ） */
app.get('/:id/members', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const teamId = c.req.param('id')
  const db = drizzle(c.env.DB)

  try {
    // 操作者自身がチームメンバーかを確認
    const myMembership = await db.select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, session.user.id)))
      .get()
    if (!myMembership) return c.json({ error: '権限がありません' }, 403)

    // チームテーブル等から invite_code をクエリして取得する処理が必要！
    const teamData = await db.select().from(teams).where(eq(teams.id, teamId)).get();
  
    // active メンバー一覧を user テーブルと JOIN して返す
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
        CASE tm.status WHEN 'active' THEN 0 ELSE 1 END,
        tm.joined_at ASC
    `).bind(teamId).all()

    return c.json({ success: true, members: results, inviteCode: teamData?.inviteCode ?? "CODE1234", })
  } catch (e) {
    return c.json({ success: false, error: 'メンバー一覧の取得に失敗しました' }, 500)
  }
})

/** メンバーのロール変更（MANAGER 以上のみ） */
app.patch('/:id/members/:memberId', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const teamId   = c.req.param('id')
  const memberId = c.req.param('memberId')
  const { role } = await c.req.json<{ role: string }>()
  const db = drizzle(c.env.DB)

  try {
    // 操作者の権限確認
    const myMembership = await db.select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, session.user.id)))
      .get()
    const isAdmin = (session.user as AuthUser).role === 'SYSTEM_ADMIN'
    if (!isAdmin && (!myMembership || !canManageTeam(myMembership.role))) {
      return c.json({ error: '権限がありません（MANAGER以上が必要です）' }, 403)
    }

    await db.update(teamMembers)
      .set({ role })
      .where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, teamId)))

    return c.json({ success: true })
  } catch (e) {
    return c.json({ success: false, error: 'ロールの変更に失敗しました' }, 500)
  }
})

/** メンバーをチームから除名（MANAGER 以上のみ） */
app.delete('/:id/members/:memberId', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const teamId   = c.req.param('id')
  const memberId = c.req.param('memberId')
  const db = drizzle(c.env.DB)

  try {
    // 操作者の権限確認
    const myMembership = await db.select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, session.user.id)))
      .get()
    const isAdmin = (session.user as AuthUser).role === 'SYSTEM_ADMIN'
    if (!isAdmin && (!myMembership || !canManageTeam(myMembership.role))) {
      return c.json({ error: '権限がありません（MANAGER以上が必要です）' }, 403)
    }

    // 自分自身は除名不可
    const target = await db.select()
      .from(teamMembers)
      .where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, teamId)))
      .get()
    if (target?.userId === session.user.id) {
      return c.json({ error: '自分自身を除名することはできません' }, 400)
    }

    await db.delete(teamMembers)
      .where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, teamId)))

    return c.json({ success: true })
  } catch (e) {
    return c.json({ success: false, error: '除名処理に失敗しました' }, 500)
  }
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 招待・申請関連
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.get('/search/:id', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)
  const teamId = c.req.param('id')
  const db = drizzle(c.env.DB)

  try {
    const teamData = await db.select({ id: teams.id, name: teams.name, year: teams.year, tier: teams.tier, orgName: organizations.name })
      .from(teams).leftJoin(organizations, eq(teams.organizationId, organizations.id)).where(eq(teams.id, teamId)).get();
    if (!teamData) return c.json({ success: false, error: '指定されたIDのチームが見つかりません' }, 404);
    return c.json({ success: true, team: teamData });
  } catch (e) { return c.json({ success: false, error: '検索に失敗しました' }, 500); }
})

app.post('/:id/join', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)
  const teamId = c.req.param('id')
  const db = drizzle(c.env.DB)

  try {
    const existing = await db.select().from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, session.user.id))).get();
    if (existing) {
      if (existing.status === 'pending') return c.json({ success: false, error: 'すでに参加申請を送信済みです。監督の承認をお待ちください。' }, 400);
      return c.json({ success: false, error: 'すでにこのチームに参加しています。' }, 400);
    }
    await db.insert(teamMembers).values({ id: crypto.randomUUID(), teamId, userId: session.user.id, role: 'player', status: 'pending' });
    return c.json({ success: true, message: '参加申請を送信しました！' });
  } catch (e) { return c.json({ success: false, error: '申請処理に失敗しました' }, 500); }
})

app.get('/:id/requests', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)
  const teamId = c.req.param('id')

  try {
    // 操作者がチームメンバーかを確認
    const db = drizzle(c.env.DB)
    const myMembership = await db.select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, session.user.id)))
      .get()
    if (!myMembership) return c.json({ error: '権限がありません' }, 403)

    // user テーブルと JOIN して申請者の名前・メールも返す
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
        AND tm.status  = 'pending'
      ORDER BY tm.joined_at ASC
    `).bind(teamId).all()

    return c.json({ success: true, requests: results });
  } catch (e) { return c.json({ success: false, error: '申請一覧の取得に失敗しました' }, 500); }
})

app.patch('/:id/requests/:memberId', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)
  const teamId = c.req.param('id')
  const memberId = c.req.param('memberId')
  const body = await c.req.json()
  const db = drizzle(c.env.DB)

  try {
    if (body.action === 'approve') {
      await db.update(teamMembers).set({ status: 'active' }).where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, teamId)));
      return c.json({ success: true, message: '参加を承認しました' });
    } else if (body.action === 'reject') {
      await db.delete(teamMembers).where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, teamId)));
      return c.json({ success: true, message: '参加申請を拒否しました' });
    }
    return c.json({ success: false, error: '無効なアクションです' }, 400);
  } catch (e) { return c.json({ success: false, error: '処理に失敗しました' }, 500); }
})

export default app
