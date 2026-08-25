// filepath: src/api/liff.ts
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc, gte, and, sql } from "drizzle-orm";
import { teams, organizations, matches, events, venues } from "@/db/schema";
import type { WorkerEnv } from "@/types/api";

const app = new Hono<{ Bindings: WorkerEnv }>();

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
 * チームHUB用総合データ取得API
 * LINEから開かれた際、DBに登録されている実際のチーム情報・次回予定・試合動画を即座に返却する
 */
app.get("/hub", async (c) => {
  const db = drizzle(c.env.DB);
  const requestedTeamId = c.req.query("teamId");

  try {
    // 1. チーム情報の取得
    let targetTeam: any = null;

    if (requestedTeamId) {
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

    // teamId 指定がない場合、DB内の最初のチームを取得
    if (!targetTeam) {
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
        .orderBy(desc(teams.createdAt))
        .get();
    }

    const teamId = targetTeam?.id;
    const fullTeamName = targetTeam
      ? `${targetTeam.orgName ? `${targetTeam.orgName} ` : ""}${targetTeam.name}`.trim()
      : "チームHUB";

    // 2. 次回予定（events）の取得
    let nextEvent: any = null;
    if (teamId) {
      const now = new Date();
      nextEvent = await db
        .select()
        .from(events)
        .where(eq(events.teamId, teamId))
        .orderBy(desc(events.startAt))
        .get();
    }

    // 3. 試合一覧（matches）の取得
    let matchesList: any[] = [];
    if (teamId) {
      matchesList = await db
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
    }

    // 登録されている全チーム一覧の取得 (TeamSwitcher用)
    const allTeams = await db
      .select({
        id: teams.id,
        name: teams.name,
        orgName: organizations.name,
        logoImageUrl: organizations.logoImageUrl,
      })
      .from(teams)
      .leftJoin(organizations, eq(teams.organizationId, organizations.id))
      .orderBy(desc(teams.createdAt))
      .all();

    const teamList = (allTeams || []).map((t) => ({
      id: t.id,
      name: t.orgName ? `${t.orgName} ${t.name}` : t.name,
      shortName: t.name,
      logoImageUrl: t.logoImageUrl || undefined,
    }));

    const liffId = c.env.NEXT_PUBLIC_LIFF_ID || c.env.LIFF_ID || "";

    return c.json({
      success: true,
      liffId,
      team: {
        id: targetTeam?.id || null,
        name: fullTeamName,
        shortName: targetTeam?.name || "チーム",
        homeGround: targetTeam?.homeGround || null,
      },
      teams: teamList,
      nextEvent: nextEvent
        ? {
            id: nextEvent.id,
            title: nextEvent.title,
            date: new Date(nextEvent.startAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" }),
            time: new Date(nextEvent.startAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
            location: nextEvent.location || targetTeam?.homeGround || "グラウンド",
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
      success: false,
      liffId: c.env.NEXT_PUBLIC_LIFF_ID || c.env.LIFF_ID || "",
      team: { name: "チームHUB" },
      teams: [],
      matches: [],
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
    if (!teamId) {
      const firstTeam = await db.select({ id: teams.id }).from(teams).orderBy(desc(teams.createdAt)).get();
      teamId = firstTeam?.id;
    }

    if (!teamId) {
      return c.json({ success: true, matches: [] });
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
      matches: matchesList || [],
    });
  } catch (error: any) {
    console.error("Failed to load liff matches:", error);
    return c.json({ success: false, matches: [] });
  }
});

export default app;
