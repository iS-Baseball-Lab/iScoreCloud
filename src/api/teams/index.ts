// filepath: src/api/teams/index.ts
import { Hono } from 'hono'
import { getAuth } from "@/lib/auth"
import { drizzle } from 'drizzle-orm/d1'
import { teams, teamMembers, organizations } from '@/db/schema'
import { desc, eq, and } from 'drizzle-orm'
import { canManageTeam } from '@/lib/roles'
import type { AuthUser } from '@/types/api'

// 🌟 members.ts から各ハンドラー関数をインポート
import { 
  handleJoinTeam, 
  handleSearchTeam, 
  handleGetMembers, 
  handlePutRoleSettings, 
  handlePatchMemberRole, 
  handleRemoveMember 
} from './members'

// 他の子ルーターのインポート
import playersApp from './players'
import statsApp from './stats'
import lineupsApp from './lineups'

const app = new Hono<{ Bindings: { DB: D1Database, ASSETS: Fetcher } }>()

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🌟 メンバー・申請関連のルーティングテーブル (Honoが100%誤認しない登録方式)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.post('/join', handleJoinTeam)
app.get('/search/:id', handleSearchTeam)
app.get('/:id/members', handleGetMembers)
  app.put('/:id/roles/settings', handlePutRoleSettings)
app.patch('/:id/members/:memberId', handlePatchMemberRole)
app.delete('/:id/members/:memberId', handleRemoveMember)

// 既存の子ルーターをマウント
app.route('/', playersApp)
app.route('/', statsApp)
app.route('/', lineupsApp)

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// チーム本体の基本CRUD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 所属チーム一覧取得 */
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

/** 新規チーム作成 */
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

/** チーム基本情報の更新 */
app.patch('/:id', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const userRole = (session.user as AuthUser).role
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

/** チーム全体の完全削除（解散） */
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
    await c.env.DB.prepare(`DELETE FROM team_role_settings WHERE team_id = ?`).bind(teamId).run()
    await c.env.DB.prepare(`DELETE FROM team_members WHERE team_id = ?`).bind(teamId).run()
    await db.delete(teams).where(eq(teams.id, teamId))
    return c.json({ success: true })
  } catch (e) { return c.json({ success: false, error: 'Failed to delete team' }, 500) }
})

export default app
