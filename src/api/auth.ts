// filepath: src/api/auth.ts
import { Hono } from 'hono'
import { ensureAuthSchema, getAuth } from "@/lib/auth"
import { drizzle } from 'drizzle-orm/d1'
import { eq, or, inArray } from 'drizzle-orm'
import { teams, teamMembers, organizations } from '@/db/schema/team'
import { account, user as authUserTable } from '@/db/schema/auth'
import type { WorkerEnv, Membership, AuthUser } from '@/types/api'

const app = new Hono<{ Bindings: WorkerEnv }>()

app.use('*', async (c, next) => {
  await ensureAuthSchema(c.env.DB)
  await next()
})

function buildCanonicalNames(raw: string | null | undefined): Set<string> {
  const set = new Set<string>();
  if (!raw) return set;
  const trimmed = raw.trim();
  if (!trimmed) return set;
  const direct = trimmed.replace(/[\s　()（）【】［］\[\]]+/g, "");
  if (direct.length >= 2) set.add(direct);
  const tokens = trimmed.split(/[\s　]+/).filter(Boolean);
  if (tokens.length === 2) {
    const ab = (tokens[0] + tokens[1]).replace(/[\s　()（）【】［］\[\]]+/g, "");
    const ba = (tokens[1] + tokens[0]).replace(/[\s　()（）【】［］\[\]]+/g, "");
    if (ab.length >= 2) set.add(ab);
    if (ba.length >= 2) set.add(ba);
  }
  return set;
}

function extractStem(rawName: string): string {
  return rawName
    .replace(/[\s　()（）【】［］\[\]]*(?:お父さん|お母さん|保護者|パパ|ママ|父|母|夫|妻)[\s　()（）【】［］\[\]]*$/g, "")
    .replace(/[\s　()（）【】［］\[\]]+/g, "")
    .trim();
}

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
  const linkedUserIdsSet = new Set<string>([user.id]);

  try {
    const linkedAccounts = await db
      .select({ accountId: account.accountId, userId: account.userId })
      .from(account)
      .where(or(eq(account.userId, user.id), eq(account.accountId, user.id)))
      .all();
    const extraUserIds: string[] = [];
    for (const acc of linkedAccounts) {
      if (acc.accountId) linkedUserIdsSet.add(acc.accountId);
      if (acc.userId && !linkedUserIdsSet.has(acc.userId)) {
        linkedUserIdsSet.add(acc.userId);
        extraUserIds.push(acc.userId);
      }
    }
    if (extraUserIds.length > 0) {
      const hopAccounts = await db
        .select({ accountId: account.accountId })
        .from(account)
        .where(inArray(account.userId, extraUserIds))
        .all();
      for (const h of hopAccounts) {
        if (h.accountId) linkedUserIdsSet.add(h.accountId);
      }
    }

    let candidateUserIds = Array.from(linkedUserIdsSet);
    let userTeams = await db
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
      .where(or(...candidateUserIds.map((uid) => eq(teamMembers.userId, uid))));

    // 別プロバイダ（例：Google/Microsoftのサブアカウント）でログインした場合の実名・家族名補完
    if (userTeams.length === 0 && user.name) {
      const myCanon = buildCanonicalNames(user.name);
      const normMyName = user.name.replace(/[\s　()（）【】［］\[\]]+/g, "").trim();
      if (myCanon.size > 0 || normMyName.length >= 2) {
        const allActiveWithUser = await db
          .select({
            memberUserId: teamMembers.userId,
            memberName: teamMembers.name,
            linkedUserName: authUserTable.name,
          })
          .from(teamMembers)
          .leftJoin(authUserTable, eq(teamMembers.userId, authUserTable.id))
          .where(eq(teamMembers.status, "active"))
          .all();

        const matchedUids = new Set<string>();
        for (const row of allActiveWithUser) {
          if (!row.memberUserId) continue;
          const rowCanon = buildCanonicalNames(row.linkedUserName);
          let hit = false;
          for (const cn of rowCanon) {
            if (myCanon.has(cn)) {
              hit = true;
              break;
            }
          }
          if (!hit && row.memberName && normMyName.length >= 2) {
            const stem = extractStem(row.memberName);
            if (stem.length >= 2 && normMyName.startsWith(stem)) {
              hit = true;
            }
          }
          if (hit) matchedUids.add(row.memberUserId);
        }

        if (matchedUids.size === 1) {
          const matchedUid = Array.from(matchedUids)[0];
          linkedUserIdsSet.add(matchedUid);
          candidateUserIds = Array.from(linkedUserIdsSet);
          userTeams = await db
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
            .where(or(...candidateUserIds.map((uid) => eq(teamMembers.userId, uid))));
        }
      }
    }

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
  } catch (error) {
    console.error("[iScore Error]", error);
  }

  return c.json({
    success: true,
    data: {
      id: user.id,
      linkedUserIds: Array.from(linkedUserIdsSet),
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
