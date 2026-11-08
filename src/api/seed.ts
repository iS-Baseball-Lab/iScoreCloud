// filepath: src/api/seed.ts
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import {
  organizations, organizationMembers, teams, teamMembers, players, matches
} from '../db/schema';
import { resolveCallerTeamAccess } from '../lib/team-access';
import type { WorkerEnv } from '../types/api';

const app = new Hono<{ Bindings: WorkerEnv }>();

app.post('/', async (c) => {
  const access = await resolveCallerTeamAccess(c);
  if (!access.sessionUser) return c.json({ error: 'Unauthorized' }, 401);
  if (!access.isSystemAdmin) return c.json({ error: 'Forbidden' }, 403);

  const db = drizzle(c.env.DB);
  const userId = access.sessionUser.id;

  try {
    // ----------------------------------------------------
    // 1. クラブの作成
    // ----------------------------------------------------
    const myOrg1_id = crypto.randomUUID();
    const myOrg2_id = crypto.randomUUID();
    const oppOrg1_id = crypto.randomUUID();
    const oppOrg2_id = crypto.randomUUID();

    await db.insert(organizations).values([
      { id: myOrg1_id, name: 'サンプル中央シニア', category: 'junior', createdAt: new Date() },
      { id: myOrg2_id, name: 'サンプルフレンズ', category: 'gakudo', createdAt: new Date() },
      { id: oppOrg1_id, name: '対戦相手Aシニア', category: 'junior', createdAt: new Date() },
      { id: oppOrg2_id, name: '対戦相手Bシニア', category: 'junior', createdAt: new Date() },
    ]);

    await db.insert(organizationMembers).values([
      { id: crypto.randomUUID(), organizationId: myOrg1_id, userId, role: 'OWNER', createdAt: new Date() },
      { id: crypto.randomUUID(), organizationId: myOrg2_id, userId, role: 'OWNER', createdAt: new Date() },
      { id: crypto.randomUUID(), organizationId: oppOrg1_id, userId, role: 'OPPONENT_MANAGER', createdAt: new Date() },
      { id: crypto.randomUUID(), organizationId: oppOrg2_id, userId, role: 'OPPONENT_MANAGER', createdAt: new Date() },
    ]);

    // ----------------------------------------------------
    // 2. チームの作成
    // ----------------------------------------------------
    const myTeam1_id = crypto.randomUUID();
    const myTeam2_id = crypto.randomUUID();
    const oppTeam1_id = crypto.randomUUID();

    await db.insert(teams).values([
      { id: myTeam1_id, organizationId: myOrg1_id, name: '1年生チーム', year: 2026, tier: '1年生', createdBy: userId, createdAt: new Date() },
      { id: myTeam2_id, organizationId: myOrg2_id, name: 'Aチーム', year: 2025, tier: 'A', createdBy: userId, createdAt: new Date() },
      { id: oppTeam1_id, organizationId: oppOrg1_id, name: '1年生チーム', year: 2026, tier: '1年生', createdBy: userId, createdAt: new Date() },
    ]);

    // 自分のチームにスコアラーとして所属
    await db.insert(teamMembers).values([
      { id: crypto.randomUUID(), teamId: myTeam1_id, userId, role: 'SCORER', status: 'active', joinedAt: new Date() },
      { id: crypto.randomUUID(), teamId: myTeam2_id, userId, role: 'SCORER', status: 'active', joinedAt: new Date() },
    ]);

    // ----------------------------------------------------
    // 3. 選手データの作成
    // ----------------------------------------------------
    const dummyPlayers = [
      { id: crypto.randomUUID(), teamId: myTeam1_id, name: '山田 太郎', uniformNumber: '1', primaryPosition: '1', throws: 'R', bats: 'R', createdAt: new Date() },
      { id: crypto.randomUUID(), teamId: myTeam1_id, name: '佐藤 次郎', uniformNumber: '2', primaryPosition: '2', throws: 'R', bats: 'R', createdAt: new Date() },
      { id: crypto.randomUUID(), teamId: myTeam1_id, name: '鈴木 三郎', uniformNumber: '3', primaryPosition: '3', throws: 'R', bats: 'L', createdAt: new Date() },
      { id: crypto.randomUUID(), teamId: myTeam1_id, name: '高橋 健太', uniformNumber: '4', primaryPosition: '4', throws: 'R', bats: 'R', createdAt: new Date() },
      { id: crypto.randomUUID(), teamId: myTeam1_id, name: '田中 翔太', uniformNumber: '5', primaryPosition: '5', throws: 'R', bats: 'R', createdAt: new Date() },
      { id: crypto.randomUUID(), teamId: myTeam1_id, name: '伊藤 翼', uniformNumber: '6', primaryPosition: '6', throws: 'R', bats: 'L', createdAt: new Date() },
      { id: crypto.randomUUID(), teamId: myTeam1_id, name: '渡辺 陸', uniformNumber: '7', primaryPosition: '7', throws: 'R', bats: 'R', createdAt: new Date() },
      { id: crypto.randomUUID(), teamId: myTeam1_id, name: '山本 海', uniformNumber: '8', primaryPosition: '8', throws: 'L', bats: 'L', createdAt: new Date() },
      { id: crypto.randomUUID(), teamId: myTeam1_id, name: '中村 空', uniformNumber: '9', primaryPosition: '9', throws: 'R', bats: 'R', createdAt: new Date() },
    ];
    await db.insert(players).values(dummyPlayers);

    // ----------------------------------------------------
    // 4. 試合データの作成
    // ----------------------------------------------------
    await db.insert(matches).values([
      {
        id: crypto.randomUUID(),
        teamId: myTeam1_id,
        opponent: '対戦相手Aシニア',
        date: '2026-03-10',
        surfaceDetails: '河川敷グラウンド',
        matchType: 'practice',
        battingOrder: 'first',
        innings: 7,
        status: 'finished',
        myScore: 5,
        opponentScore: 3,
        myInningScores: JSON.stringify([1, 0, 2, 0, 0, 0, 2]),
        opponentInningScores: JSON.stringify([0, 1, 0, 0, 2, 0, 0]),
        createdAt: new Date(),
      }
    ]);

    return c.json({ success: true, message: 'テストデータの生成に成功しました！' });

  } catch (error) {
    console.error('シードデータの生成に失敗:', error);
    return c.json({ success: false, error: 'Internal Server Error' }, 500);
  }
});

export default app;
