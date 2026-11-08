// filepath: src/api/auth.ts
import { Hono } from 'hono'
import { ensureAuthSchema, getAuth } from "@/lib/auth"
import { drizzle } from 'drizzle-orm/d1'
import { eq, or, inArray } from 'drizzle-orm'
import { teams, teamMembers, organizations } from '@/db/schema/team'
import { expandLinkedUserIds } from '@/lib/team-access'
import type { WorkerEnv, Membership, AuthUser } from '@/types/api'

const app = new Hono<{ Bindings: WorkerEnv }>()

app.use('*', async (c, next) => {
  await ensureAuthSchema(c.env.DB)
  await next()
})

const getRoleLabel = (role: string) => {
  switch (role) {
    case 'manager': return '監督/代表者';
    case 'coach': return 'コーチ';
    case 'scorer': return 'スコアラー';
    case 'staff': return 'スタッフ';
    case 'player': return '選手';
    case 'parent': return '保護者';
    case 'pending': return '承認待ち';
    default: return 'メンバー';
  }
};

app.get('/me', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers as unknown as Headers })

  if (!session || !session.user) {
    return c.json({ success: false, error: 'Unauthorized' }, 401)
  }

  const user = session.user as AuthUser;
  const db = drizzle(c.env.DB);
  const memberships: Membership[] = [];
  let candidateUserIds: string[] = [user.id];

  try {
    // 🛡️ `account` テーブルで確定済みの連携IDのみを展開（表示名や苗字による横断推測は厳禁）
    candidateUserIds = await expandLinkedUserIds(db, [user.id]);
    if (candidateUserIds.length === 0) {
      candidateUserIds = [user.id];
    }

    const [userTeams, createdTeams] = await Promise.all([
      db
        .select({
          teamId: teams.id,
          teamName: teams.name,
          organizationName: organizations.name,
          organizationCategory: organizations.category,
          role: teamMembers.role,
          status: teamMembers.status,
          logoImageUrl: organizations.logoImageUrl,
        })
        .from(teamMembers)
        .innerJoin(teams, eq(teamMembers.teamId, teams.id))
        .leftJoin(organizations, eq(teams.organizationId, organizations.id))
        .where(inArray(teamMembers.userId, candidateUserIds))
        .all(),
      db
        .select({
          teamId: teams.id,
          teamName: teams.name,
          organizationName: organizations.name,
          organizationCategory: organizations.category,
          logoImageUrl: organizations.logoImageUrl,
        })
        .from(teams)
        .leftJoin(organizations, eq(teams.organizationId, organizations.id))
        .where(inArray(teams.createdBy, candidateUserIds))
        .all(),
    ]);

    const seenTeamIds = new Set<string>();
    userTeams.forEach((t) => {
      if (seenTeamIds.has(t.teamId)) return;
      seenTeamIds.add(t.teamId);
      memberships.push({
        teamId: t.teamId,
        teamName: t.teamName,
        organizationName: t.organizationName ?? t.teamName,
        organizationCategory: t.organizationCategory ?? 'other',
        role: t.role,
        roleLabel: getRoleLabel(t.role),
        status: t.status,
        isMainTeam: memberships.length === 0,
        logoImageUrl: t.logoImageUrl,
      });
    });

    createdTeams.forEach((t) => {
      if (seenTeamIds.has(t.teamId)) return;
      seenTeamIds.add(t.teamId);
      memberships.push({
        teamId: t.teamId,
        teamName: t.teamName,
        organizationName: t.organizationName ?? t.teamName,
        organizationCategory: t.organizationCategory ?? 'other',
        role: 'manager',
        roleLabel: getRoleLabel('manager'),
        status: 'active',
        isMainTeam: memberships.length === 0,
        logoImageUrl: t.logoImageUrl,
      });
    });
  } catch (error) {
    console.error("[iScore Error]", error);
  }

  return c.json({
    success: true,
    data: {
      id: user.id,
      linkedUserIds: candidateUserIds,
      name: user.name,
      email: user.email,
      avatarUrl: user.image || `/api/images/avatars/${user.id}.png`,
      role: user.role ?? 'USER',
      systemRole: user.role ?? 'USER',
      memberships: memberships,
    }
  })
})

app.all('/*', (c) => {
  const auth = getAuth(c.env.DB, c.env) // 🌟 ここでも取得してハンドリング
  return auth.handler(c.req.raw)
})

export default app
