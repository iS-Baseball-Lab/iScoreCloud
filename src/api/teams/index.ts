// filepath: src/api/teams/index.ts
import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { teams, teamMembers, organizations, organizationMembers } from '@/db/schema'
import { desc, eq, and, inArray } from 'drizzle-orm'
import { resolveCallerTeamAccess } from '@/lib/team-access'
import type { WorkerEnv } from '@/types/api'

// 🌟 members.ts から各ハンドラー関数をインポート
import { 
  handleJoinTeam, 
  handleSearchTeam, 
  handleGetMembers, 
  handlePutRoleSettings, 
  handlePatchMemberRole, 
  handleRemoveMember,
  handleCreateMember,
  handleUpdateMemberInfo,
  handleMergeMembers,
  handleGetJoinRequests,
  handleActionJoinRequest
} from './members'

// 他の子ルーターのインポート
import playersApp from './players'
import statsApp from './stats'
import lineupsApp from './lineups'
import groupsApp from './groups' // 👥 新規：親子グループ管理ルート

const app = new Hono<{ Bindings: WorkerEnv }>()

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🌟 メンバー・申請関連のルーティングテーブル (Honoが100%誤認しない登録方式)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.post('/join', handleJoinTeam)
app.get('/search/:id', handleSearchTeam)
app.get('/:id/requests', handleGetJoinRequests) // 📩 参加申請一覧取得
app.patch('/:id/requests/:memberId', handleActionJoinRequest) // 📩 参加申請の承認・却下
app.get('/:id/members', handleGetMembers)
app.post('/:id/members/merge', handleMergeMembers) // 🔗 メンバー統合（マージ）
app.post('/:id/members', handleCreateMember) // 💡 新規：アカウントなしメンバー登録
app.patch('/:id/members/:memberId/info', handleUpdateMemberInfo) // 💡 新規：メンバー情報更新 & アカウント紐付け
app.put('/:id/roles/settings', handlePutRoleSettings)
app.patch('/:id/members/:memberId', handlePatchMemberRole)
app.delete('/:id/members/:memberId', handleRemoveMember)

// 既存の子ルーターをマウント
app.route('/', playersApp)
app.route('/', statsApp)
app.route('/', lineupsApp)
app.route('/', groupsApp) // 👥 新規マウント：親子グループ管理ルート

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// チーム本体の基本CRUD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 所属チーム一覧取得（承認済みメンバー・創設者・組織OWNER・SYSTEM_ADMINのみ） */
app.get('/', async (c) => {
  const access = await resolveCallerTeamAccess(c)
  if (!access.sessionUser) return c.json({ error: 'Unauthorized' }, 401)

  const db = drizzle(c.env.DB)
  const allTeamRows = await db.select({
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
    createdBy: teams.createdBy,
    logoImageUrl: organizations.logoImageUrl,
    scorebookLegendUrl: teams.scorebookLegendUrl,
  })
    .from(teams)
    .leftJoin(organizations, eq(teams.organizationId, organizations.id))
    .orderBy(desc(teams.createdAt))
    .all()

  const candidateSet = new Set(access.candidateUserIds)
  const authorized = allTeamRows
    .filter((t) => access.isSystemAdmin || access.activeTeamIds.has(t.id))
    .map((t) => {
      const grant = access.teamRoles.get(t.id)
      const isFounder = Boolean(t.createdBy && candidateSet.has(t.createdBy))
      return {
        id: t.id,
        name: t.name,
        orgName: t.orgName,
        description: t.description,
        category: t.category,
        homeGround: t.homeGround,
        managerName: t.managerName,
        year: t.year,
        tier: t.tier,
        teamType: t.teamType,
        myRole: grant?.role || (access.canManageTeamId(t.id) ? 'manager' : 'member'),
        isFounder,
        logoImageUrl: t.logoImageUrl,
        scorebookLegendUrl: t.scorebookLegendUrl,
      }
    })

  return c.json(authorized)
})

/** 新規チーム作成（指定された organizationId の管理権限を厳格検証） */
app.post('/', async (c) => {
  const access = await resolveCallerTeamAccess(c)
  if (!access.sessionUser) return c.json({ error: 'Unauthorized' }, 401)

  const body = await c.req.json<{
    name?: string
    role?: string
    organizationId?: string | null
    year?: number
    tier?: string | null
    teamType?: 'regular' | 'practice'
  }>()
  const teamName = (body.name || '').trim()
  if (!teamName) {
    return c.json({ success: false, error: 'チーム名は必須です' }, 400)
  }

  const db = drizzle(c.env.DB)

  try {
    let targetOrgId = body.organizationId ? body.organizationId.trim() : null
    if (targetOrgId && !access.isSystemAdmin) {
      const candidateIds = access.candidateUserIds.length > 0 ? access.candidateUserIds : [access.sessionUser.id]
      const [orgMember, managedSquadInOrg] = await Promise.all([
        db.select({ role: organizationMembers.role })
          .from(organizationMembers)
          .where(and(
            eq(organizationMembers.organizationId, targetOrgId),
            inArray(organizationMembers.userId, candidateIds)
          ))
          .get(),
        db.select({ id: teams.id })
          .from(teams)
          .where(eq(teams.organizationId, targetOrgId))
          .all(),
      ])
      const orgRole = (orgMember?.role || '').toUpperCase()
      const isOrgAdmin = orgRole === 'OWNER' || orgRole === 'ADMIN'
      const managesExistingSquad = managedSquadInOrg.some((sq) => access.canManageTeamId(sq.id))
      if (!isOrgAdmin && !managesExistingSquad) {
        return c.json({ success: false, error: '指定されたクラブにチームを追加する権限がありません' }, 403)
      }
    }

    if (!targetOrgId) {
      targetOrgId = crypto.randomUUID()
      await db.insert(organizations).values({
        id: targetOrgId,
        name: teamName,
        category: 'other',
      })
      await db.insert(organizationMembers).values({
        id: crypto.randomUUID(),
        organizationId: targetOrgId,
        userId: access.sessionUser.id,
        role: 'OWNER',
        status: 'active',
      })
    }

    const ALLOWED_INITIAL_ROLES = new Set(['admin', 'manager', 'coach', 'scorer', 'staff'])
    const initialRole = body.role && ALLOWED_INITIAL_ROLES.has(body.role) ? body.role : 'manager'
    const teamId = crypto.randomUUID()
    await db.insert(teams).values({
      id: teamId,
      organizationId: targetOrgId,
      name: teamName,
      year: body.year || new Date().getFullYear(),
      tier: body.tier || null,
      teamType: body.teamType === 'practice' ? 'practice' : 'regular',
      createdBy: access.sessionUser.id,
    })
    await db.insert(teamMembers).values({
      id: crypto.randomUUID(),
      teamId,
      userId: access.sessionUser.id,
      role: initialRole,
      status: 'active',
    })
    return c.json({ success: true, teamId })
  } catch {
    return c.json({ success: false, error: 'Failed to create team' }, 500)
  }
})

/** チーム基本情報の更新 */
app.patch('/:id', async (c) => {
  const access = await resolveCallerTeamAccess(c)
  if (!access.sessionUser) return c.json({ error: 'Unauthorized' }, 401)

  const teamId = c.req.param('id')
  const body = await c.req.json<{
    name?: string
    year?: number
    tier?: string | null
    teamType?: 'regular' | 'practice'
    managerName?: string | null
    homeGround?: string | null
    scorebookLegendUrl?: string | null
    logoImageUrl?: string | null
    description?: string | null
  }>()
  const db = drizzle(c.env.DB)

  try {
    if (!access.canManageTeamId(teamId)) return c.json({ error: '権限がありません' }, 403)

    const updatePayload: Partial<typeof teams.$inferInsert> = {};
    if (body.name !== undefined) updatePayload.name = body.name;
    if (body.year !== undefined) updatePayload.year = body.year;
    if (body.tier !== undefined) updatePayload.tier = body.tier;
    if (body.teamType !== undefined) updatePayload.teamType = body.teamType;
    if (body.managerName !== undefined) updatePayload.managerName = body.managerName;
    if (body.homeGround !== undefined) updatePayload.homeGround = body.homeGround;
    if (body.scorebookLegendUrl !== undefined) updatePayload.scorebookLegendUrl = body.scorebookLegendUrl;

    if (Object.keys(updatePayload).length > 0) {
      await db.update(teams).set(updatePayload).where(eq(teams.id, teamId));
    }

    if (body.logoImageUrl !== undefined || body.description !== undefined) {
      const teamObj = await db.select({ organizationId: teams.organizationId, name: teams.name }).from(teams).where(eq(teams.id, teamId)).get()
      if (teamObj) {
        let orgId = teamObj.organizationId;
        
        // 🌟 組織情報がない場合は、その場で自動生成して紐付ける
        if (!orgId) {
          orgId = crypto.randomUUID();
          await db.insert(organizations).values({
            id: orgId,
            name: teamObj.name,
            category: 'other',
          });
          await db.update(teams).set({ organizationId: orgId }).where(eq(teams.id, teamId));
        }

        await db.update(organizations).set({
          logoImageUrl: body.logoImageUrl !== undefined ? body.logoImageUrl : undefined,
          description: body.description !== undefined ? body.description : undefined
        }).where(eq(organizations.id, orgId))
      }
    }

    return c.json({ success: true })
  } catch { return c.json({ success: false, error: 'Failed to update team' }, 500) }
})

/** チーム全体の完全削除（解散） */
app.delete('/:id', async (c) => {
  const access = await resolveCallerTeamAccess(c)
  if (!access.sessionUser) return c.json({ error: 'Unauthorized' }, 401)
  const teamId = c.req.param('id')
  if (!access.canManageTeamId(teamId)) return c.json({ error: '権限がありません' }, 403)
  const db = drizzle(c.env.DB)

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
