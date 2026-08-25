// filepath: src/api/liff.ts
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc, gte, and, sql } from "drizzle-orm";
import { teams, organizations, matches, events, venues, teamMembers, user } from "@/db/schema";
import type { WorkerEnv } from "@/types/api";

const app = new Hono<{ Bindings: WorkerEnv }>();

/**
 * デモチーム（体験用サンプルデータ）
 */
const DEMO_TEAM = {
  id: "demo-team",
  name: "iScore ドリームス",
  shortName: "ドリームス",
  managerName: "山田 監督",
  homeGround: "多摩川緑地野球場 (1面)",
  year: 2026,
  isDemo: true,
};

const DEMO_NEXT_EVENT = {
  id: "demo-ev-1",
  title: "秋季大会 2回戦 vs レッドソックス",
  date: "8月30日(日)",
  time: "08:30 集合 (09:30 PB)",
  location: "多摩川緑地野球場 (1面)",
  eventType: "match",
  dutyGroup: "B班 (鍵・救急)",
  carInfo: "配車 4台 / 18名乗車",
  needsLunch: true,
};

const DEMO_MATCHES = [
  {
    id: "demo-match-1",
    opponent: "レッドソックス",
    date: "2026/08/23",
    status: "finished",
    myScore: 7,
    opponentScore: 3,
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    matchType: "official",
    venueName: "多摩川緑地野球場",
    innings: 7,
    myInningScores: [2, 0, 1, 3, 0, 1, 0],
    opponentInningScores: [0, 1, 0, 0, 2, 0, 0],
  },
  {
    id: "demo-match-2",
    opponent: "ブルーサンダース",
    date: "2026/08/09",
    status: "finished",
    myScore: 4,
    opponentScore: 5,
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    matchType: "practice",
    venueName: "等々力球場",
    innings: 7,
    myInningScores: [0, 1, 0, 2, 0, 1, 0],
    opponentInningScores: [1, 0, 2, 0, 1, 1, 0],
  },
];

/**
 * LIFF設定情報（LIFF ID）の取得
 */
app.get("/config", (c) => {
  const liffId = c.env.NEXT_PUBLIC_LIFF_ID || c.env.LIFF_ID || "";
  return c.json({
    success: true,
    liffId: liffId,
  });
});

/**
 * ユーザーの所属チームおよび参加申請ステータス取得API
 */
app.get("/my-status", async (c) => {
  const db = drizzle(c.env.DB);
  const userId = c.req.query("userId");

  if (!userId) {
    return c.json({
      success: true,
      activeTeams: [],
      pendingTeams: [],
      isDemo: true,
    });
  }

  try {
    const memberships = await db
      .select({
        memberId: teamMembers.id,
        teamId: teamMembers.teamId,
        role: teamMembers.role,
        status: teamMembers.status,
        teamName: teams.name,
        managerName: teams.managerName,
        orgName: organizations.name,
        logoImageUrl: organizations.logoImageUrl,
      })
      .from(teamMembers)
      .leftJoin(teams, eq(teamMembers.teamId, teams.id))
      .leftJoin(organizations, eq(teams.organizationId, organizations.id))
      .where(eq(teamMembers.userId, userId))
      .all();

    const activeTeams = memberships
      .filter((m) => m.status === "active" && m.teamId)
      .map((m) => ({
        id: m.teamId,
        name: `${m.orgName ? `${m.orgName} ` : ""}${m.teamName || "チーム"}`.trim(),
        shortName: m.teamName || "チーム",
        logoImageUrl: m.logoImageUrl || undefined,
        role: m.role,
      }));

    const pendingTeams = memberships
      .filter((m) => m.status === "pending" && m.teamId)
      .map((m) => ({
        id: m.teamId,
        name: `${m.orgName ? `${m.orgName} ` : ""}${m.teamName || "チーム"}`.trim(),
        shortName: m.teamName || "チーム",
        logoImageUrl: m.logoImageUrl || undefined,
      }));

    return c.json({
      success: true,
      activeTeams,
      pendingTeams,
      isDemo: activeTeams.length === 0,
    });
  } catch (error: any) {
    console.error("Failed to load user my-status:", error);
    return c.json({
      success: false,
      activeTeams: [],
      pendingTeams: [],
      isDemo: true,
    });
  }
});

/**
 * チーム参加申請API (招待コードまたはチームIDでの申請)
 */
app.post("/join", async (c) => {
  const db = drizzle(c.env.DB);
  try {
    const body = await c.req.json();
    const { teamId, inviteCode, userId, userName, memberType = "parent", phone } = body;

    let targetTeamId = teamId;

    if (!targetTeamId && inviteCode) {
      const code = inviteCode.trim();
      const foundTeam = await db
        .select({ id: teams.id })
        .from(teams)
        .where(eq(teams.id, code))
        .get();
      
      if (foundTeam) {
        targetTeamId = foundTeam.id;
      }
    }

    if (!targetTeamId) {
      return c.json({ success: false, error: "指定されたチームが見つかりませんでした。招待コードを確認してください。" }, 404);
    }

    const existing = await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, targetTeamId), eq(teamMembers.userId, userId || "")))
      .get();

    if (existing) {
      if (existing.status === "active") {
        return c.json({ success: true, message: "すでにこのチームのメンバーとして登録されています", status: "active", teamId: targetTeamId });
      }
      return c.json({ success: true, message: "参加申請はすでに送信済みです。管理者の承認をお待ちください", status: "pending", teamId: targetTeamId });
    }

    const newMemberId = `tm_${crypto.randomUUID()}`;
    await db.insert(teamMembers).values({
      id: newMemberId,
      teamId: targetTeamId,
      userId: userId || null,
      name: userName || "新規メンバー",
      memberType: memberType || "parent",
      phone: phone || null,
      role: "player",
      status: "pending",
    });

    return c.json({
      success: true,
      message: "チーム参加申請を受け付けました！管理者の承認をお待ちください。",
      status: "pending",
      teamId: targetTeamId,
    });
  } catch (error: any) {
    console.error("Failed to submit join request:", error);
    return c.json({ success: false, error: error?.message || "参加申請の送信に失敗しました" }, 500);
  }
});

/**
 * チームHUB用総合データ取得API
 */
app.get("/hub", async (c) => {
  const db = drizzle(c.env.DB);
  const requestedTeamId = c.req.query("teamId");

  try {
    let targetTeam: any = null;

    if (requestedTeamId && requestedTeamId !== "demo-team") {
      targetTeam = await db
        .select({
          id: teams.id,
          name: teams.name,
          managerName: teams.managerName,
          homeGround: teams.homeGround,
          year: teams.year,
          orgName: organizations.name,
          logoImageUrl: organizations.logoImageUrl,
        })
        .from(teams)
        .leftJoin(organizations, eq(teams.organizationId, organizations.id))
        .where(eq(teams.id, requestedTeamId))
        .get();
    }

    if (!targetTeam) {
      const liffId = c.env.NEXT_PUBLIC_LIFF_ID || c.env.LIFF_ID || "";
      return c.json({
        success: true,
        liffId,
        isDemo: true,
        team: DEMO_TEAM,
        teams: [DEMO_TEAM],
        nextEvent: DEMO_NEXT_EVENT,
        matches: DEMO_MATCHES,
      });
    }

    const teamId = targetTeam.id;
    const fullTeamName = `${targetTeam.orgName ? `${targetTeam.orgName} ` : ""}${targetTeam.name}`.trim();

    const nextEvent = await db
      .select()
      .from(events)
      .where(eq(events.teamId, teamId))
      .orderBy(desc(events.startAt))
      .get();

    const matchesList = await db
      .select({
        id: matches.id,
        opponent: matches.opponent,
        date: matches.date,
        status: matches.status,
        myScore: matches.myScore,
        opponentScore: matches.opponentScore,
        youtubeUrl: matches.youtubeUrl,
        matchType: matches.matchType,
      })
      .from(matches)
      .where(eq(matches.teamId, teamId))
      .orderBy(desc(matches.date), desc(matches.createdAt))
      .limit(10)
      .all();

    const allTeams = await db
      .select({
        id: teams.id,
        name: teams.name,
        shortName: teams.name,
        orgName: organizations.name,
        logoImageUrl: organizations.logoImageUrl,
      })
      .from(teams)
      .leftJoin(organizations, eq(teams.organizationId, organizations.id))
      .orderBy(desc(teams.createdAt))
      .all();

    const teamList = allTeams.map((t) => ({
      id: t.id,
      name: `${t.orgName ? `${t.orgName} ` : ""}${t.name}`.trim(),
      shortName: t.shortName,
      logoImageUrl: t.logoImageUrl || undefined,
    }));

    const liffId = c.env.NEXT_PUBLIC_LIFF_ID || c.env.LIFF_ID || "";

    return c.json({
      success: true,
      liffId,
      isDemo: false,
      team: {
        id: targetTeam.id,
        name: fullTeamName,
        shortName: targetTeam.name,
        homeGround: targetTeam.homeGround || null,
        logoImageUrl: targetTeam.logoImageUrl || undefined,
      },
      teams: teamList,
      nextEvent: nextEvent
        ? {
            id: nextEvent.id,
            title: nextEvent.title,
            date: new Date(nextEvent.startAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" }),
            time: new Date(nextEvent.startAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
            location: nextEvent.location || targetTeam.homeGround || "グラウンド",
            eventType: nextEvent.eventType || "match",
            dutyGroup: nextEvent.dutyGroup || "A班",
            carInfo: "配車調整中",
            needsLunch: true,
          }
        : null,
      matches: matchesList,
    });
  } catch (error: any) {
    console.error("Failed to load liff hub data:", error);
    return c.json({
      success: true,
      liffId: c.env.NEXT_PUBLIC_LIFF_ID || c.env.LIFF_ID || "",
      isDemo: true,
      team: DEMO_TEAM,
      teams: [DEMO_TEAM],
      nextEvent: DEMO_NEXT_EVENT,
      matches: DEMO_MATCHES,
    });
  }
});

/**
 * チームの試合一覧取得API (動画付き試合含む)
 */
app.get("/matches", async (c) => {
  const db = drizzle(c.env.DB);
  let teamId = c.req.query("teamId");

  try {
    if (!teamId || teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        matches: DEMO_MATCHES,
      });
    }

    const matchesList = await db
      .select({
        id: matches.id,
        opponent: matches.opponent,
        date: matches.date,
        status: matches.status,
        myScore: matches.myScore,
        opponentScore: matches.opponentScore,
        youtubeUrl: matches.youtubeUrl,
        matchType: matches.matchType,
        venueName: venues.name,
        innings: matches.innings,
        myInningScores: matches.myInningScores,
        opponentInningScores: matches.opponentInningScores,
      })
      .from(matches)
      .leftJoin(venues, eq(matches.venueId, venues.id))
      .where(eq(matches.teamId, teamId))
      .orderBy(desc(matches.date), desc(matches.createdAt))
      .all();

    return c.json({
      success: true,
      isDemo: false,
      matches: matchesList || [],
    });
  } catch (error: any) {
    console.error("Failed to load liff matches:", error);
    return c.json({ success: false, matches: [] });
  }
});

export default app;
