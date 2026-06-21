import { Hono } from 'hono'
import { getAuth } from "@/lib/auth"
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { teams, teamMembers, organizations } from '@/db/schema/team'
import type { WorkerEnv, Membership, AuthUser } from '@/types/api'

const app = new Hono<{ Bindings: WorkerEnv }>()

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
  const auth = getAuth(c.env.DB, c.env) // 🌟 ここでインスタンスを取得！
  const session = await auth.api.getSession({ request: c.req.raw })

  if (!session || !session.user) {
    return c.json({ success: false, error: 'Unauthorized' }, 401)
  }

  const user = session.user as AuthUser;
  const db = drizzle(c.env.DB);
  const memberships: Membership[] = [];

  try {
    const userTeams = await db
      .select({
        teamId: teams.id,
        teamName: teams.name,
        organizationName: organizations.name,
        organizationCategory: organizations.category,
        role: teamMembers.role,
        status: teamMembers.status,
      })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .leftJoin(organizations, eq(teams.organizationId, organizations.id))
      .where(eq(teamMembers.userId, user.id));

    userTeams.forEach((t, index) => {
      memberships.push({
        teamId: t.teamId,
        teamName: t.teamName,
        organizationName: t.organizationName ?? t.teamName,
        organizationCategory: t.organizationCategory ?? 'other',
        role: t.role,
        roleLabel: getRoleLabel(t.role),
        status: t.status,
        isMainTeam: index === 0,
      });
    });
  } catch (error) {
    console.error("[iScore Error]", error);
  }

  return c.json({
    success: true,
    data: {
      id: user.id,
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
