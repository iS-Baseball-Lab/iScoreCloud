// filepath: src/api/liff.ts
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc, asc, gte, and, or, sql } from "drizzle-orm";
import {
  teams,
  organizations,
  matches,
  events,
  attendances,
  venues,
  teamMembers,
  players,
  user,
  eventCarpools,
  eventCarpoolRiders,
  memberCars,
  eventCarpoolSettings,
  teamDocuments,
  teamFaqs,
  parentChildRelations,
  tournaments,
} from "@/db/schema";
import { ensureEventColumns } from "@/lib/db-helper";
import type { WorkerEnv } from "@/types/api";

const app = new Hono<{ Bindings: WorkerEnv }>();

const toBoolean = (val: any, defaultVal = false): boolean => {
  if (val === true || val === 1 || val === "1" || val === "true") return true;
  if (val === false || val === 0 || val === "0" || val === "false") return false;
  return defaultVal;
};

/**
 * デモチーム（体験用サンプルデータ）
 */
const DEMO_TEAM = {
  id: "demo-team",
  name: "iScore ドリームス (体験デモ)",
  orgName: "iScore ドリームス",
  teamName: "体験デモチーム",
  shortName: "ドリームス",
  managerName: "山田 監督",
  homeGround: "多摩川緑地野球場 (1面)",
  logoImageUrl: undefined as string | undefined,
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
  await ensureEventColumns(c.env.DB);
  const db = drizzle(c.env.DB);
  const requestedTeamId = c.req.query("teamId");
  const userId = c.req.query("userId");
  const userName = c.req.query("userName");

  try {
    // 全チーム一覧の取得 (チームスイッチャー用)
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
      orgName: t.orgName || t.name,
      teamName: t.name,
      shortName: t.shortName,
      logoImageUrl: t.logoImageUrl || undefined,
      isDemo: false,
    }));

    // ログインメンバーもいつでも体験できるよう、末尾にデモチームを追加
    teamList.push(DEMO_TEAM);

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
        teams: teamList,
        nextEvent: DEMO_NEXT_EVENT,
        matches: DEMO_MATCHES,
      });
    }

    const teamId = targetTeam.id;
    const fullTeamName = `${targetTeam.orgName ? `${targetTeam.orgName} ` : ""}${targetTeam.name}`.trim();

    // チームのイベント一覧を取得（日付順）
    const allEventsList = await db
      .select()
      .from(events)
      .where(eq(events.teamId, teamId))
      .orderBy(asc(events.startAt))
      .all();

    // ログインユーザーの出欠リストを取得 (userIdおよびuserNameから照合)
    let userAttendances: Record<string, string> = {};
    let currentMemberId: string | null = null;

    if (userId) {
      const member = await db
        .select({ id: teamMembers.id })
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
        .get();
      if (member) currentMemberId = member.id;
    }

    if (!currentMemberId && userName) {
      const memberByName = await db
        .select({ id: teamMembers.id })
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.name, userName)))
        .get();
      if (memberByName) {
        currentMemberId = memberByName.id;
      } else {
        const teamMemberList = await db
          .select({ id: teamMembers.id, name: teamMembers.name })
          .from(teamMembers)
          .where(eq(teamMembers.teamId, teamId))
          .all();
        const matched = teamMemberList.find(m => 
          m.name && (m.name.includes(userName) || userName.includes(m.name))
        );
        if (matched) currentMemberId = matched.id;
      }
    }

    const attConditions = [];
    if (userId) attConditions.push(eq(attendances.userId, userId));
    if (currentMemberId) attConditions.push(eq(attendances.memberId, currentMemberId));

    if (attConditions.length > 0) {
      const atts = await db
        .select({
          eventId: attendances.eventId,
          status: attendances.status,
        })
        .from(attendances)
        .where(or(...attConditions))
        .all();
      
      for (const a of atts) {
        if (a.eventId && a.status) {
          userAttendances[a.eventId] = a.status;
        }
      }
    }

    // 登録球場一覧を取得（略称優先マッピング用）
    const teamVenues = await db.select({ name: venues.name, shortName: venues.shortName }).from(venues).all();
    const venueMap = new Map<string, string>();
    for (const v of teamVenues) {
      if (v.name && v.shortName && v.shortName.trim()) {
        venueMap.set(v.name.trim(), v.shortName.trim());
      }
    }

    const extractTime = (val: any) => {
      if (!val) return null;
      if (typeof val === "string") {
        const match = val.match(/T?(\d{2}):(\d{2})/);
        if (match) return `${match[1]}:${match[2]}`;
      }
      try {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        }
      } catch {}
      return null;
    };

    const formattedEventsList = allEventsList.map((ev) => {
      const d = new Date(ev.startAt);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const dateStr = `${y}-${m}-${day}`;

      const rawLocation = ev.location || targetTeam.homeGround || "グラウンド";
      const displayLocation = venueMap.get(rawLocation.trim()) || rawLocation;

      const rawPmLocation = ev.pmLocation ? ev.pmLocation.trim() : null;
      const displayPmLocation = rawPmLocation ? (venueMap.get(rawPmLocation) || rawPmLocation) : null;

      const hasPm = !!ev.pmStartAt || !!displayPmLocation;

      // 時間の安全抽出
      const startHHMM = extractTime(ev.startAt) || "08:00";
      const endHHMM = extractTime(ev.endAt);
      const pmStartHHMM = extractTime(ev.pmStartAt);
      const pmEndHHMM = extractTime(ev.pmEndAt);

      const amTime = hasPm
        ? (endHHMM && pmStartHHMM && endHHMM <= pmStartHHMM ? `${startHHMM}〜${endHHMM}` : `${startHHMM}〜12:00`)
        : (endHHMM ? `${startHHMM}〜${endHHMM}` : `${startHHMM}〜12:00`);

      const pmTime = hasPm
        ? `${pmStartHHMM || "13:00"}〜${pmEndHHMM || endHHMM || "17:00"}`
        : "";

      // 🚗 練習の場合は配車なし（試合または明示的な配車のみ）
      const isMatch = ev.eventType === "match" || ev.eventType === "camp";
      const carInfo = isMatch ? "配車調整中" : "";

      // 🎯 対象チーム・グループ（Aチーム/Bチーム/試合組/練習組/全体など）
      const extractedTarget = ev.targetGroup || (ev.title?.match(/\[(.*?)\]/)?.[1] || null);

      return {
        id: ev.id,
        title: ev.title,
        date: d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" }),
        dateStr,
        startAt: ev.startAt,
        endAt: ev.endAt,
        pmStartAt: ev.pmStartAt,
        pmEndAt: ev.pmEndAt,
        amTime,
        pmTime,
        location: displayLocation,
        amLocation: displayLocation,
        pmLocation: displayPmLocation,
        hasPm,
        targetGroup: extractedTarget,
        eventType: ev.eventType || "practice",
        dutyGroup: ev.dutyGroup || "1班",
        carInfo,
        needsLunch: toBoolean(ev.needsLunch, hasPm || isMatch),
        needsSnack: toBoolean(ev.needsSnack, false),
        memo: ev.description || "",
        myStatus: (userAttendances[ev.id] as any) || "pending",
      };
    });

    const nextEvent = formattedEventsList[0] || null;

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
        tournamentName: tournaments.name,
        venueName: venues.name,
        venueShortName: venues.shortName,
        surfaceDetails: matches.surfaceDetails,
        battingOrder: matches.battingOrder,
        innings: matches.innings,
        myInningScores: matches.myInningScores,
        opponentInningScores: matches.opponentInningScores,
        myHits: matches.myHits,
        opponentHits: matches.opponentHits,
        myErrors: matches.myErrors,
        opponentErrors: matches.opponentErrors,
      })
      .from(matches)
      .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
      .leftJoin(venues, eq(matches.venueId, venues.id))
      .where(eq(matches.teamId, teamId))
      .orderBy(desc(matches.date), desc(matches.createdAt))
      .limit(10)
      .all();

    const formattedMatches = matchesList.map(m => ({
      ...m,
      myInningScores: typeof m.myInningScores === "string" ? JSON.parse(m.myInningScores || "[]") : (m.myInningScores || []),
      opponentInningScores: typeof m.opponentInningScores === "string" ? JSON.parse(m.opponentInningScores || "[]") : (m.opponentInningScores || []),
    }));

    const liffId = c.env.NEXT_PUBLIC_LIFF_ID || c.env.LIFF_ID || "";

    return c.json({
      success: true,
      liffId,
      isDemo: false,
      team: {
        id: targetTeam.id,
        name: fullTeamName,
        orgName: targetTeam.orgName || targetTeam.name,
        teamName: targetTeam.name,
        shortName: targetTeam.name,
        homeGround: targetTeam.homeGround || null,
        logoImageUrl: targetTeam.logoImageUrl || undefined,
      },
      teams: teamList,
      nextEvent,
      events: formattedEventsList,
      matches: formattedMatches,
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
      events: [
        {
          id: "demo-ev-1",
          title: "秋季大会 2回戦 vs レッドソックス",
          date: "8/29(土)",
          dateStr: "2026-08-29",
          time: "08:00〜12:00",
          location: "市民第1球場",
          eventType: "match",
          dutyGroup: "1班",
          carInfo: "鈴木号・佐藤号",
          needsLunch: false,
          needsSnack: true,
        },
        {
          id: "demo-ev-2",
          title: "全日通常練習 & 守備連携・走塁強化",
          date: "8/30(日)",
          dateStr: "2026-08-30",
          time: "08:00〜18:00",
          location: "大師河原第3G",
          eventType: "practice",
          dutyGroup: "2班",
          carInfo: "配車調整中",
          needsLunch: true,
          needsSnack: false,
        },
      ],
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

    const rawMatches = await db
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

    const formattedMatches = rawMatches.map((m) => {
      let myInnings: number[] = [];
      let opponentInnings: number[] = [];

      try {
        if (typeof m.myInningScores === "string") {
          myInnings = JSON.parse(m.myInningScores);
        } else if (Array.isArray(m.myInningScores)) {
          myInnings = m.myInningScores;
        }
      } catch {}

      try {
        if (typeof m.opponentInningScores === "string") {
          opponentInnings = JSON.parse(m.opponentInningScores);
        } else if (Array.isArray(m.opponentInningScores)) {
          opponentInnings = m.opponentInningScores;
        }
      } catch {}

      return {
        ...m,
        myInningScores: myInnings,
        opponentInningScores: opponentInnings,
      };
    });

    return c.json({
      success: true,
      isDemo: false,
      matches: formattedMatches,
    });
  } catch (error: any) {
    console.error("Failed to load liff matches:", error);
    return c.json({ success: false, matches: [] });
  }
});

/**
 * チームの予定・スケジュール一覧取得API (出欠回答状況つき)
 */
app.get("/schedule", async (c) => {
  await ensureEventColumns(c.env.DB);
  const db = drizzle(c.env.DB);
  const teamId = c.req.query("teamId");
  const userId = c.req.query("userId");
  const userName = c.req.query("userName");

  try {
    if (!teamId || teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        events: [
          {
            id: "demo-ev-1",
            title: "秋季大会 2回戦 vs レッドソックス",
            date: "8月30日(日)",
            time: "08:30 集合 (09:30 PB)",
            location: "多摩川緑地野球場 (1面)",
            eventType: "match",
            dutyGroup: "B班 (鍵・救急)",
            needsLunch: true,
            needsSnack: true,
            myStatus: "present",
            attendCount: { present: 14, absent: 2, pending: 1 },
          },
          {
            id: "demo-ev-2",
            title: "午後 強化守備・走塁練習",
            date: "9月5日(土)",
            time: "13:00 〜 17:00",
            location: "桜本小学校 グラウンド",
            eventType: "practice",
            dutyGroup: "C班 (グラウンド整備)",
            needsLunch: false,
            needsSnack: false,
            myStatus: "pending",
            attendCount: { present: 11, absent: 3, pending: 3 },
          },
          {
            id: "demo-ev-3",
            title: "練習試合 vs グリーンライオンズ (ダブルヘッダー)",
            date: "9月6日(日)",
            time: "08:00 集合 (第1試合 09:00 / 第2試合 11:30)",
            location: "等々力球場",
            eventType: "match",
            dutyGroup: "A班 (審判割当・配車)",
            needsLunch: true,
            needsSnack: false,
            myStatus: "pending",
            attendCount: { present: 12, absent: 1, pending: 4 },
          },
        ],
      });
    }

    // 実チームのイベント一覧を取得
    const eventList = await db
      .select()
      .from(events)
      .where(eq(events.teamId, teamId))
      .orderBy(desc(events.startAt))
      .all();

    // ログインユーザーの memberId を特定
    let schedMemberId: string | null = null;
    if (userId) {
      const member = await db
        .select({ id: teamMembers.id })
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
        .get();
      if (member) schedMemberId = member.id;
    }

    if (!schedMemberId && userName) {
      const memberByName = await db
        .select({ id: teamMembers.id })
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.name, userName)))
        .get();
      if (memberByName) {
        schedMemberId = memberByName.id;
      } else {
        const teamMemberList = await db
          .select({ id: teamMembers.id, name: teamMembers.name })
          .from(teamMembers)
          .where(eq(teamMembers.teamId, teamId))
          .all();
        const matched = teamMemberList.find(m => 
          m.name && (m.name.includes(userName) || userName.includes(m.name))
        );
        if (matched) schedMemberId = matched.id;
      }
    }

    // 登録球場一覧を取得（略称優先マッピング用）
    const teamVenues = await db.select({ name: venues.name, shortName: venues.shortName }).from(venues).all();
    const venueMap = new Map<string, string>();
    for (const v of teamVenues) {
      if (v.name && v.shortName && v.shortName.trim()) {
        venueMap.set(v.name.trim(), v.shortName.trim());
      }
    }

    // 各イベントの出欠集計
    const formattedEvents = await Promise.all(
      eventList.map(async (ev) => {
        const attList = await db
          .select({
            status: attendances.status,
            userId: attendances.userId,
            memberId: attendances.memberId,
          })
          .from(attendances)
          .where(eq(attendances.eventId, ev.id))
          .all();

        const presentCount = attList.filter((a) => a.status === "present" || a.status === "late" || a.status === "partial").length;
        const absentCount = attList.filter((a) => a.status === "absent").length;
        const pendingCount = attList.filter((a) => a.status === "pending").length;

        let myStatus: "present" | "absent" | "pending" | "late" = "pending";
        if (userId || schedMemberId) {
          const myAtt = attList.find((a) => 
            (userId && a.userId === userId) || (schedMemberId && a.memberId === schedMemberId)
          );
          if (myAtt?.status) {
            myStatus = myAtt.status === "present"
              ? "present"
              : myAtt.status === "late" || myAtt.status === "partial"
              ? "late"
              : myAtt.status === "absent"
              ? "absent"
              : "pending";
          }
        }

        const startDate = new Date(ev.startAt);
        const y = startDate.getFullYear();
        const m = String(startDate.getMonth() + 1).padStart(2, "0");
        const d = String(startDate.getDate()).padStart(2, "0");
        const dateStr = `${y}-${m}-${d}`;
        const wStr = ["日", "月", "火", "水", "木", "金", "土"][startDate.getDay()];

        const startTimeStr = startDate.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
        const endTimeStr = ev.endAt ? new Date(ev.endAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "";
        const amTime = endTimeStr ? `${startTimeStr}〜${endTimeStr}` : `${startTimeStr}〜12:00`;

        const hasPm = !!ev.pmStartAt || !!ev.pmLocation;
        let pmTime = "";
        if (ev.pmStartAt) {
          const pmStartDate = new Date(ev.pmStartAt);
          const pmStartStr = pmStartDate.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
          const pmEndStr = ev.pmEndAt ? new Date(ev.pmEndAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "";
          pmTime = pmEndStr ? `${pmStartStr}〜${pmEndStr}` : `${pmStartStr}〜17:00`;
        } else if (hasPm) {
          pmTime = "13:00〜17:00";
        }

        const rawLocation = ev.location || "グラウンド";
        const displayLocation = venueMap.get(rawLocation.trim()) || rawLocation;
        const rawPmLocation = ev.pmLocation || rawLocation;
        const displayPmLocation = venueMap.get(rawPmLocation.trim()) || rawPmLocation;

        const extractedTarget = ev.targetGroup || (ev.title?.match(/\[(.*?)\]/)?.[1] || null);

        const isMatch = ev.eventType === "match";

        return {
          id: ev.id,
          title: ev.title,
          targetGroup: extractedTarget,
          date: `${startDate.getMonth() + 1}/${startDate.getDate()}(${wStr})`,
          dateStr,
          time: endTimeStr ? `${startTimeStr} 〜 ${endTimeStr}` : `${startTimeStr} 集合`,
          startAt: ev.startAt,
          endAt: ev.endAt,
          location: displayLocation,
          rawLocation,
          amTime,
          amLocation: displayLocation,
          pmTime,
          pmLocation: displayPmLocation,
          hasPm,
          eventType: ev.eventType || "practice",
          amType: ev.eventType || "practice",
          pmType: hasPm ? (ev.eventType || "practice") : "off",
          dutyGroup: ev.dutyGroup || undefined,
          needsLunch: toBoolean(ev.needsLunch, isMatch || (hasPm && amTime.includes("〜") && pmTime.length > 0)),
          needsSnack: toBoolean(ev.needsSnack, false),
          memo: ev.description || "",
          carInfo: isMatch ? "7:30 集合・配車調整済" : undefined,
          myStatus,
          attendCount: {
            present: presentCount,
            absent: absentCount,
            pending: pendingCount,
          },
        };
      })
    );

    return c.json({
      success: true,
      isDemo: false,
      events: formattedEvents,
    });
  } catch (error: any) {
    console.error("Failed to load liff schedule:", error);
    return c.json({ success: false, events: [] });
  }
});

/**
 * 👨‍👦 ログイン中保護者の親子関係・お子様一覧取得API
 * GET /api/liff/my-family?teamId=xxx&userId=xxx&userName=xxx&parentId=xxx
 */
app.get("/my-family", async (c) => {
  const db = drizzle(c.env.DB);
  const teamId = c.req.query("teamId");
  const userId = c.req.query("userId");
  const userName = c.req.query("userName");
  const targetParentId = c.req.query("parentId");

  try {
    if (!teamId || teamId === "demo-team") {
      return c.json({
        success: true,
        isParent: true,
        children: [
          { id: "demo-player-1", name: "山田 翔太", uniformNumber: "#10", memberType: "player" },
        ],
        allFamilyRelations: [
          { id: "demo-rel-1", parentId: "demo-parent-1", parentName: "山田 (保護者)", childId: "demo-player-1", childName: "山田 翔太", uniformNumber: "#10" }
        ],
        attendances: {},
      });
    }

    // 1. チーム全体の親子関係一覧を取得 (parentChildRelations + teamMembers + players)
    const allRelations = await db
      .select({
        id: parentChildRelations.id,
        parentId: parentChildRelations.parentId,
        parentName: teamMembers.name,
        childId: parentChildRelations.childId,
        childName: players.name,
        uniformNumber: players.uniformNumber,
      })
      .from(parentChildRelations)
      .leftJoin(teamMembers, eq(parentChildRelations.parentId, teamMembers.id))
      .leftJoin(players, eq(parentChildRelations.childId, players.id))
      .where(eq(parentChildRelations.teamId, teamId))
      .all();

    // 2. チームメンバーから保護者レコードを特定
    let member: any = null;
    if (targetParentId) {
      member = await db
        .select()
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.id, targetParentId)))
        .get();
    }
    if (!member && userId) {
      member = await db
        .select()
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
        .get();
    }
    if (!member && userName) {
      // 完全一致検索
      member = await db
        .select()
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.name, userName)))
        .get();

      // 部分一致検索 (LINE名が「山田」でメンバー名が「山田 (父)」等の場合)
      if (!member) {
        const teamMemberList = await db
          .select()
          .from(teamMembers)
          .where(eq(teamMembers.teamId, teamId))
          .all();
        
        member = teamMemberList.find(m => 
          m.name && (
            m.name.includes(userName) || 
            userName.includes(m.name) ||
            (m.name.replace(/\s+/g, "") === userName.replace(/\s+/g, ""))
          )
        );
      }
    }

    if (!member && allRelations.length > 0) {
      // チームに登録された親子関係から保護者を自動特定
      const firstParentId = allRelations[0].parentId;
      if (firstParentId) {
        member = await db
          .select()
          .from(teamMembers)
          .where(eq(teamMembers.id, firstParentId))
          .get();
      }
    }

    // 3. 親子関係から該当する保護者のお子様のみを抽出（重複排除）
    let childrenList: Array<{ id: string; name: string; uniformNumber?: string; parentId?: string; parentName?: string }> = [];

    if (member) {
      const myRelations = allRelations.filter(r => r.parentId === member.id && !!r.childId);
      const seen = new Set<string>();
      for (const rel of myRelations) {
        if (!seen.has(rel.childId)) {
          seen.add(rel.childId);
          childrenList.push({
            id: rel.childId,
            name: rel.childName || "選手",
            uniformNumber: rel.uniformNumber ? (rel.uniformNumber.startsWith("#") ? rel.uniformNumber : `#${rel.uniformNumber}`) : undefined,
            parentId: member.id,
            parentName: member.name,
          });
        }
      }
    }

    // 4. 子供たちの既存出欠一覧を取得
    const childIds = childrenList.map((c) => c.id);
    const childAttMap: Record<string, Record<string, "present" | "absent" | "pending" | "late">> = {};

    if (childIds.length > 0) {
      const attList = await db
        .select({
          eventId: attendances.eventId,
          playerId: attendances.playerId,
          status: attendances.status,
        })
        .from(attendances)
        .where(sql`${attendances.playerId} IN (${sql.join(childIds.map(id => sql`${id}`), sql`, `)})`)
        .all();

      for (const att of attList) {
        if (att.eventId && att.playerId && att.status) {
          if (!childAttMap[att.eventId]) {
            childAttMap[att.eventId] = {};
          }
          childAttMap[att.eventId][att.playerId] = (att.status as any) || "pending";
        }
      }
    }

    // 6. 保護者本人の既存出欠一覧を取得
    const parentAttMap: Record<string, "present" | "absent" | "pending" | "late"> = {};
    if (member?.id || userId) {
      const parentConditions = [];
      if (member?.id) parentConditions.push(eq(attendances.memberId, member.id));
      if (userId) parentConditions.push(eq(attendances.userId, userId));

      const parentAttList = await db
        .select({
          eventId: attendances.eventId,
          status: attendances.status,
        })
        .from(attendances)
        .where(or(...parentConditions))
        .all();

      for (const att of parentAttList) {
        if (att.eventId && att.status) {
          parentAttMap[att.eventId] = (att.status as any) || "pending";
        }
      }
    }

    return c.json({
      success: true,
      isParent: true,
      memberId: member?.id || null,
      memberName: member?.name || null,
      children: childrenList,
      attendances: childAttMap,
      parentAttendances: parentAttMap,
    });
  } catch (error: any) {
    console.error("Failed to load my-family:", error);
    return c.json({
      success: false,
      isParent: true,
      children: [],
      attendances: {},
      parentAttendances: {},
    });
  }
});

/**
 * 出欠回答送信API (保護者本人または選手個別の出欠を保存)
 */
app.post("/attendance", async (c) => {
  const db = drizzle(c.env.DB);
  try {
    const body = await c.req.json();
    const { eventId, userId, memberId, playerId, status, hasCar, comment } = body;

    if (!eventId || !status) {
      return c.json({ success: false, error: "eventId and status are required" }, 400);
    }

    if (eventId.startsWith("demo-")) {
      return c.json({ success: true, message: "出欠回答を記録しました（デモ）" });
    }

    // 👦 選手の出欠の場合 (playerId が指定されている場合)
    if (playerId) {
      const existing = await db
        .select()
        .from(attendances)
        .where(and(eq(attendances.eventId, eventId), eq(attendances.playerId, playerId)))
        .get();

      if (existing) {
        await db
          .update(attendances)
          .set({
            status: status,
            comment: comment || existing.comment,
            updatedAt: new Date(),
          })
          .where(eq(attendances.id, existing.id));
      } else {
        await db.insert(attendances).values({
          id: `att_${crypto.randomUUID()}`,
          eventId,
          playerId,
          status: status,
          roleInEvent: "player",
          comment: comment || null,
          updatedAt: new Date(),
        });
      }

      return c.json({ success: true, message: "お子様の出欠回答を保存しました" });
    }

    // 👨 保護者・メンバー本人の出欠の場合
    let effectiveMemberId = memberId;
    if (!effectiveMemberId && userId) {
      const tm = await db
        .select({ id: teamMembers.id })
        .from(teamMembers)
        .where(eq(teamMembers.userId, userId))
        .get();
      if (tm) effectiveMemberId = tm.id;
    }

    const conditions = [];
    if (effectiveMemberId) conditions.push(eq(attendances.memberId, effectiveMemberId));
    if (userId) conditions.push(eq(attendances.userId, userId));

    let existing = null;
    if (conditions.length > 0) {
      existing = await db
        .select()
        .from(attendances)
        .where(and(eq(attendances.eventId, eventId), or(...conditions)))
        .get();
    }

    if (existing) {
      await db
        .update(attendances)
        .set({
          status: status,
          userId: userId || existing.userId,
          memberId: effectiveMemberId || existing.memberId,
          hasCar: hasCar !== undefined ? hasCar : existing.hasCar,
          comment: comment || existing.comment,
          updatedAt: new Date(),
        })
        .where(eq(attendances.id, existing.id));
    } else {
      await db.insert(attendances).values({
        id: `att_${crypto.randomUUID()}`,
        eventId,
        userId: userId || null,
        memberId: effectiveMemberId || null,
        status: status,
        hasCar: !!hasCar,
        roleInEvent: "parent",
        comment: comment || null,
        updatedAt: new Date(),
      });
    }

    return c.json({ success: true, message: "出欠回答を保存しました" });
  } catch (error: any) {
    console.error("Failed to save attendance:", error);
    return c.json({ success: false, error: error?.message || "出欠回答の保存に失敗しました" }, 500);
  }
});

/**
 * 配車表取得API (実イベント配車またはデモ配車)
 */
app.get("/carpool", async (c) => {
  const db = drizzle(c.env.DB);
  const teamId = c.req.query("teamId");
  const eventId = c.req.query("eventId");

  const DEMO_CARPOOL = {
    eventTitle: "秋季大会 2回戦 vs レッドソックス",
    date: "2026年8月30日(日)",
    gatherTime: "07:45 集合 / 08:00 出発",
    gatherLocation: "桜本小学校 正門前",
    destination: "多摩川緑地野球場 第1駐車場",
    costShare: "1家族あたり 約 600 円 (高速・ガソリン代割り勘)",
    notes: "※道具車はボールケース・テント・救急箱を積載します。\n※各自水筒と氷の準備をお願いします。",
    cars: [
      {
        carNumber: 1,
        driverName: "鈴木 パパ",
        carModel: "セレナ (白)",
        plate: "・12-34",
        capacity: 6,
        passengers: [
          { name: "鈴木 翔太 (選手)", type: "player" },
          { name: "佐藤 蓮 (選手)", type: "player" },
          { name: "高橋 陸 (選手)", type: "player" },
          { name: "田中 健太 (選手)", type: "player" },
          { name: "佐藤 ママ (保護者)", type: "adult" },
        ],
      },
      {
        carNumber: 2,
        driverName: "田中 パパ (コーチ)",
        carModel: "アルファード (黒)",
        plate: "・・88",
        capacity: 5,
        passengers: [
          { name: "田中 颯太 (選手)", type: "player" },
          { name: "伊藤 悠斗 (選手)", type: "player" },
          { name: "渡辺 陽向 (選手)", type: "player" },
          { name: "渡辺 パパ (コーチ)", type: "adult" },
        ],
      },
      {
        carNumber: 3,
        driverName: "山下 監督",
        carModel: "ハイエース (道具車)",
        plate: "・56-78",
        capacity: 3,
        isCargo: true,
        passengers: [
          { name: "中村 湊 (選手)", type: "player" },
          { name: "小林 樹 (選手)", type: "player" },
        ],
      },
    ],
  };

  try {
    if (!teamId || teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        carpool: DEMO_CARPOOL,
      });
    }

    // 対象のイベントを取得（指定がなければ直近のイベント）
    let targetEvent: any = null;
    if (eventId) {
      targetEvent = await db.select().from(events).where(eq(events.id, eventId)).get();
    } else {
      targetEvent = await db
        .select()
        .from(events)
        .where(eq(events.teamId, teamId))
        .orderBy(desc(events.startAt))
        .get();
    }

    if (!targetEvent) {
      return c.json({
        success: true,
        isDemo: false,
        carpool: null,
      });
    }

    // 配車枠の取得
    const carpoolsList = await db
      .select({
        id: eventCarpools.id,
        driverId: eventCarpools.driverId,
        driverName: teamMembers.name,
        capacity: eventCarpools.capacity,
        carType: eventCarpools.carType,
        carName: memberCars.name,
        carColor: memberCars.color,
        numberPlate: memberCars.numberPlate,
      })
      .from(eventCarpools)
      .leftJoin(teamMembers, eq(eventCarpools.driverId, teamMembers.id))
      .leftJoin(memberCars, eq(eventCarpools.carId, memberCars.id))
      .where(eq(eventCarpools.eventId, targetEvent.id))
      .all();

    if (carpoolsList.length === 0) {
      return c.json({
        success: true,
        isDemo: false,
        carpool: {
          eventTitle: targetEvent.title,
          date: new Date(targetEvent.startAt).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" }),
          gatherTime: `${new Date(targetEvent.startAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })} 集合`,
          gatherLocation: targetEvent.location || "グラウンド",
          destination: targetEvent.location || "グラウンド",
          costShare: "配車割り当て調整中",
          notes: targetEvent.description || "",
          cars: [],
        },
      });
    }

    // 各車の乗車メンバー（riders）の取得
    const carsWithPassengers = await Promise.all(
      carpoolsList.map(async (car, index) => {
        const riders = await db
          .select({
            riderPlayerName: players.name,
            riderMemberName: teamMembers.name,
            riderMemberType: teamMembers.memberType,
          })
          .from(eventCarpoolRiders)
          .leftJoin(players, eq(eventCarpoolRiders.playerId, players.id))
          .leftJoin(teamMembers, eq(eventCarpoolRiders.memberId, teamMembers.id))
          .where(eq(eventCarpoolRiders.carpoolId, car.id))
          .all();

        const passengers = riders.map((r) => {
          if (r.riderPlayerName) {
            return { name: `${r.riderPlayerName} (選手)`, type: "player" as const };
          }
          return {
            name: `${r.riderMemberName || "メンバー"} (${r.riderMemberType === "staff" ? "指導者" : "保護者"})`,
            type: "adult" as const,
          };
        });

        return {
          carNumber: index + 1,
          driverName: car.driverName || "ドライバー",
          carModel: car.carName ? `${car.carName}${car.carColor ? ` (${car.carColor})` : ""}` : "登録車",
          plate: car.numberPlate || "未登録",
          capacity: car.capacity || 4,
          isCargo: car.carType === "cargo",
          passengers,
        };
      })
    );

    return c.json({
      success: true,
      isDemo: false,
      carpool: {
        eventTitle: targetEvent.title,
        date: new Date(targetEvent.startAt).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" }),
        gatherTime: `${new Date(targetEvent.startAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })} 集合`,
        gatherLocation: targetEvent.location || "グラウンド",
        destination: targetEvent.location || "グラウンド",
        costShare: "1家族あたり実費割り勘",
        notes: targetEvent.description || "",
        cars: carsWithPassengers,
      },
    });
  } catch (error: any) {
    console.error("Failed to load liff carpool:", error);
    return c.json({ success: false, carpool: null });
  }
});

/**
 * 球場・グラウンド一覧取得API
 */
app.get("/grounds", async (c) => {
  const db = drizzle(c.env.DB);
  const teamId = c.req.query("teamId");

  const DEMO_VENUES = [
    {
      id: "venue-1",
      name: "多摩川緑地野球場 (多摩川緑地広場)",
      shortName: "多摩川緑地 (1面・2面)",
      address: "神奈川県川崎市高津区二子地先",
      mapUrl: "https://maps.google.com/?q=多摩川緑地野球場",
      surface: "土 (内野) / 天然芝 (外野)",
      spikeRule: "金具スパイク可 / ポイント推奨",
      parkingInfo: "第1駐車場（土日祝は1台500円）。チーム枠4台まで。河川敷道路は徐行厳守。",
      notes: "水道あり・簡易トイレあり。自販機は土手上にあり。雨天後はグラウンド水はけ注意。",
    },
    {
      id: "venue-2",
      name: "川崎市等々力球場",
      shortName: "等々力球場",
      address: "神奈川県川崎市中原区等々力1-1",
      mapUrl: "https://maps.google.com/?q=等々力球場",
      surface: "人工芝 (全面)",
      spikeRule: "⚠️ 金具スパイク禁止 (ポイント・アップシューズのみ)",
      parkingInfo: "等々力緑地公園 東駐車場を利用（有料）。満車の可能性が高いため乗り合い必須。",
      notes: "屋根付きスタンドあり。更衣室・シャワー完備。敷地内全面禁煙。",
    },
    {
      id: "venue-3",
      name: "桜本小学校 グラウンド (ホーム)",
      shortName: "桜本小 (ホーム)",
      address: "神奈川県川崎市川崎区桜本1-10-1",
      mapUrl: "https://maps.google.com/?q=川崎市立桜本小学校",
      surface: "土 (クレー)",
      spikeRule: "ポイントスパイクまたはトレーニングシューズ",
      parkingInfo: "正門から入り体育館裏へ（事前登録車のみ3台まで駐車可）。近隣コインPあり。",
      notes: "学校敷地内です。近隣住宅へのボール飛び出し防止ネットの確認必須。ゴミは全て持ち帰り。",
    },
  ];

  try {
    if (!teamId || teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        venues: DEMO_VENUES,
      });
    }

    const venuesList = await db.select().from(venues).all();

    if (venuesList.length === 0) {
      return c.json({
        success: true,
        isDemo: false,
        venues: DEMO_VENUES,
      });
    }

    const formatted = venuesList.map((v) => ({
      id: v.id,
      name: v.name,
      shortName: v.shortName || v.name,
      address: v.address || "住所未登録",
      mapUrl: v.mapUrl || `https://maps.google.com/?q=${encodeURIComponent(v.name)}`,
      surface: v.surfaceType === "artificial_turf" ? "人工芝" : v.surfaceType === "natural_turf" ? "天然芝" : "土 (クレー)",
      spikeRule: "ポイントスパイクまたはトレーニングシューズ",
      parkingInfo: "駐車場ルールは管理者にお問い合わせください",
      notes: v.notes || "",
    }));

    return c.json({
      success: true,
      isDemo: false,
      venues: formatted,
    });
  } catch (error: any) {
    console.error("Failed to load liff grounds:", error);
    return c.json({ success: true, isDemo: true, venues: DEMO_VENUES });
  }
});

/**
 * チーム成績・スタッツ取得API
 */
app.get("/stats", async (c) => {
  const db = drizzle(c.env.DB);
  const teamId = c.req.query("teamId");

  try {
    if (!teamId || teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        stats: {
          totalMatches: 14,
          wins: 10,
          losses: 3,
          draws: 1,
          winRate: ".769",
          runsScored: 86,
          runsAllowed: 42,
          runDiff: "+44",
        },
      });
    }

    const teamMatches = await db
      .select({
        status: matches.status,
        myScore: matches.myScore,
        opponentScore: matches.opponentScore,
      })
      .from(matches)
      .where(eq(matches.teamId, teamId))
      .all();

    const finished = teamMatches.filter((m) => m.status === "finished" && m.myScore !== null && m.opponentScore !== null);
    const wins = finished.filter((m) => (m.myScore ?? 0) > (m.opponentScore ?? 0)).length;
    const losses = finished.filter((m) => (m.myScore ?? 0) < (m.opponentScore ?? 0)).length;
    const draws = finished.filter((m) => (m.myScore ?? 0) === (m.opponentScore ?? 0)).length;
    const total = wins + losses + draws;
    const winRate = total > 0 ? (wins / (wins + losses || 1)).toFixed(3).replace(/^0/, "") : ".000";

    const runsScored = finished.reduce((acc, m) => acc + (m.myScore || 0), 0);
    const runsAllowed = finished.reduce((acc, m) => acc + (m.opponentScore || 0), 0);
    const diff = runsScored - runsAllowed;
    const runDiff = diff > 0 ? `+${diff}` : `${diff}`;

    return c.json({
      success: true,
      isDemo: false,
      stats: {
        totalMatches: total,
        wins,
        losses,
        draws,
        winRate,
        runsScored,
        runsAllowed,
        runDiff,
      },
    });
  } catch (error: any) {
    console.error("Failed to load liff stats:", error);
    return c.json({ success: false, stats: null });
  }
});

/**
 * チーム資料一覧取得API (チーム全体共有 + この編成限定)
 */
app.get("/documents", async (c) => {
  const db = drizzle(c.env.DB);
  const teamId = c.req.query("teamId");

  const DEMO_DOCUMENTS = [
    {
      id: "demo-doc-1",
      title: "2026年度 チーム規約・父母会会則",
      category: "rules",
      categoryLabel: "規約・会則",
      fileType: "PDF",
      fileSize: "1.2 MB",
      updatedAt: "2026/04/01",
      description: "チームの理念、部費・活動方針、父母会の役割と運営規定に関する基本規約です。",
      fileUrl: "https://example.com/demo-rules.pdf",
      scope: "organization",
      scopeLabel: "チーム全体",
    },
    {
      id: "demo-doc-2",
      title: "配車・送迎マニュアル & 安全ガイドライン",
      category: "manual",
      categoryLabel: "配車・当番",
      fileType: "PDF",
      fileSize: "840 KB",
      updatedAt: "2026/05/15",
      description: "遠征時の集合場所、ジュニアシートの着用基準、高速代・ガソリン代の精算ルールです。",
      fileUrl: "https://example.com/demo-carpool.pdf",
      scope: "organization",
      scopeLabel: "チーム全体",
    },
    {
      id: "demo-doc-3",
      title: "29期 秋季遠征合宿のしおり・持ち物表",
      category: "trip",
      categoryLabel: "遠征・合宿",
      fileType: "PDF",
      fileSize: "1.8 MB",
      updatedAt: "2026/08/10",
      description: "29期専用の遠征合宿スケジュール、宿泊先案内、持ち物リスト、健康チェックシートです。",
      fileUrl: "https://example.com/demo-trip.pdf",
      scope: "team",
      scopeLabel: "29期",
    },
    {
      id: "demo-doc-4",
      title: "学童・少年野球 連盟指定用具・服装規定",
      category: "equipment",
      categoryLabel: "用具・服装",
      fileType: "PDF",
      fileSize: "2.1 MB",
      updatedAt: "2026/03/20",
      description: "公式戦で使用可能なバット(JSBBマーク)、ヘルメット、スパイク(金具禁止)、アンダーシャツの規定です。",
      fileUrl: "https://example.com/demo-equipment.pdf",
      scope: "organization",
      scopeLabel: "チーム全体",
    },
    {
      id: "demo-doc-5",
      title: "スポーツ安全保険 補償内容・事故時対応マニュアル",
      category: "insurance",
      categoryLabel: "保険・安全",
      fileType: "PDF",
      fileSize: "650 KB",
      updatedAt: "2026/04/01",
      description: "怪我や事故が発生した際の初期対応手順、病院受診時の連絡先、保険金請求の流れです。",
      fileUrl: "https://example.com/demo-insurance.pdf",
      scope: "organization",
      scopeLabel: "チーム全体",
    },
  ];

  try {
    if (!teamId || teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        documents: DEMO_DOCUMENTS,
      });
    }

    // チームと組織IDを取得
    const currentTeam = await db
      .select({
        id: teams.id,
        name: teams.name,
        organizationId: teams.organizationId,
      })
      .from(teams)
      .where(eq(teams.id, teamId))
      .get();

    if (!currentTeam) {
      return c.json({ success: true, isDemo: false, documents: [] });
    }

    // 組織全体資料 または この編成限定資料を取得
    const conditions = [eq(teamDocuments.teamId, teamId)];
    if (currentTeam.organizationId) {
      conditions.push(eq(teamDocuments.organizationId, currentTeam.organizationId));
    }

    const docs = await db
      .select()
      .from(teamDocuments)
      .where(or(...conditions))
      .orderBy(desc(teamDocuments.createdAt))
      .all();

    const categoryLabels: Record<string, string> = {
      rules: "規約・会則",
      manual: "配車・当番",
      equipment: "用具・服装",
      insurance: "保険・安全",
      form: "届出書類",
      trip: "遠征・合宿",
      other: "その他",
    };

    const formatted = docs.map((d) => ({
      id: d.id,
      title: d.title,
      category: d.category,
      categoryLabel: categoryLabels[d.category] || "その他",
      fileType: d.fileType || "PDF",
      fileSize: d.fileSize || "ファイル",
      updatedAt: new Date(d.createdAt).toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" }),
      description: d.description || "",
      fileUrl: d.fileUrl,
      scope: d.scope,
      scopeLabel: d.scope === "organization" ? "チーム全体" : (currentTeam.name || "編成"),
    }));

    return c.json({
      success: true,
      isDemo: false,
      documents: formatted,
    });
  } catch (error: any) {
    console.error("Failed to load liff documents:", error);
    return c.json({ success: false, documents: [] });
  }
});

/**
 * 📄 資料ファイルアップロード API (POST /api/liff/documents/upload)
 */
app.post("/documents/upload", async (c) => {
  try {
    let file: File | null = null;
    let teamId = "general";

    try {
      const formData = await c.req.formData();
      file = formData.get("file") as File | null;
      const t = formData.get("teamId");
      if (typeof t === "string" && t) teamId = t;
    } catch {
      const body = await c.req.parseBody();
      file = (body["file"] as File) || null;
      if (typeof body["teamId"] === "string" && body["teamId"]) {
        teamId = body["teamId"];
      }
    }

    if (!file || typeof file === "string" || !file.name) {
      return c.json({ success: false, error: "ファイルが選択されていません" }, 400);
    }

    const originalName = file.name || "document.pdf";
    const ext = originalName.split(".").pop()?.toLowerCase() || "pdf";

    let fileType = "PDF";
    if (["xls", "xlsx", "csv"].includes(ext)) fileType = "XLSX";
    else if (["doc", "docx"].includes(ext)) fileType = "DOCX";
    else if (["png", "jpg", "jpeg", "webp"].includes(ext)) fileType = "IMG";
    else if (["ppt", "pptx"].includes(ext)) fileType = "PPTX";

    const sizeBytes = file.size || 0;
    let fileSizeStr = `${(sizeBytes / 1024).toFixed(0)} KB`;
    if (sizeBytes >= 1024 * 1024) {
      fileSizeStr = `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    if (c.env.BUCKET) {
      const safeExt = ext.replace(/[^a-z0-9]/gi, "");
      const filename = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${safeExt}`;
      const r2Key = `documents/${teamId}/${filename}`;

      const mimeType = file.type || (ext === "pdf" ? "application/pdf" : "application/octet-stream");
      const arrayBuffer = await file.arrayBuffer();

      await c.env.BUCKET.put(r2Key, arrayBuffer, {
        httpMetadata: {
          contentType: mimeType,
          contentDisposition: `inline; filename="${encodeURIComponent(originalName)}"`,
        },
        customMetadata: {
          originalName: encodeURIComponent(originalName),
          teamId,
        },
      });

      const fileUrl = `/api/documents/files/${teamId}/${filename}`;

      return c.json({
        success: true,
        fileUrl,
        fileName: originalName,
        fileType,
        fileSize: fileSizeStr,
      });
    }

    return c.json({ success: false, error: "R2ストレージが設定されていません" }, 500);
  } catch (error: any) {
    console.error("Document upload in liff error:", error);
    return c.json({ success: false, error: error?.message || "アップロードに失敗しました" }, 500);
  }
});

/**
 * 資料登録API
 */
app.post("/documents", async (c) => {
  const db = drizzle(c.env.DB);
  try {
    const body = await c.req.json();
    const { teamId, title, category, fileUrl, fileType, fileSize, description, scope, userId } = body;

    if (!teamId || !title || !fileUrl) {
      return c.json({ success: false, error: "teamId, title, fileUrl are required" }, 400);
    }

    if (teamId === "demo-team") {
      return c.json({ success: true, message: "資料を登録しました（デモ）" });
    }

    // チーム情報を取得して organizationId を特定
    const currentTeam = await db
      .select({
        id: teams.id,
        organizationId: teams.organizationId,
      })
      .from(teams)
      .where(eq(teams.id, teamId))
      .get();

    const organizationId = currentTeam?.organizationId || null;
    const documentScope = scope === "organization" ? "organization" : "team";

    await db.insert(teamDocuments).values({
      id: `doc_${crypto.randomUUID()}`,
      organizationId: documentScope === "organization" ? organizationId : null,
      teamId: documentScope === "team" ? teamId : null,
      title,
      category: category || "other",
      fileUrl,
      fileType: fileType || "PDF",
      fileSize: fileSize || "WEB",
      description: description || null,
      scope: documentScope,
      createdById: userId || null,
      createdAt: new Date(),
    });

    return c.json({ success: true, message: "資料を登録しました" });
  } catch (error: any) {
    console.error("Failed to create document:", error);
    return c.json({ success: false, error: error?.message || "資料の登録に失敗しました" }, 500);
  }
});

/**
 * ❓ チーム・編成Q&A (FAQ) 一覧取得API
 */
app.get("/faqs", async (c) => {
  const db = drizzle(c.env.DB);
  const teamId = c.req.query("teamId");

  const DEMO_FAQS = [
    {
      id: "demo-faq-1",
      category: "rain",
      categoryLabel: "雨天・中止判断",
      question: "雨天時の練習・試合の中止判断はいつ、どこで連絡されますか？",
      answer: "原則として【当日の朝 6:30 まで】にLINEグループおよびチームHUBにて連絡します。グラウンド状態により現地判断となる場合もありますので、連絡があるまでは待機をお願いします。",
      scope: "organization",
      scopeLabel: "チーム全体",
    },
    {
      id: "demo-faq-2",
      category: "duty",
      categoryLabel: "当番・配車",
      question: "お当番の日に急用や体調不良で行けなくなった場合はどうすればいいですか？",
      answer: "まずは同じ班のメンバーにLINEで連絡し、交代可能かご相談ください。調整がつかない場合は、父母会長または学年幹事へ速やかにご連絡をお願いします。",
      scope: "organization",
      scopeLabel: "チーム全体",
    },
    {
      id: "demo-faq-3",
      category: "duty",
      categoryLabel: "当番・配車",
      question: "配車時の高速代やガソリン代の精算はどうなりますか？",
      answer: "遠征終了後、配車表に記載された目安金額を元に、同乗した各家庭から運転手の方へ直接現金またはPayPay等でお支払いいただきます（1家族あたり500〜800円程度が目安です）。",
      scope: "organization",
      scopeLabel: "チーム全体",
    },
    {
      id: "demo-faq-4",
      category: "trip",
      categoryLabel: "遠征・合宿",
      question: "29期の遠征合宿の集合時間とお小遣いの上限は？",
      answer: "集合は川崎駅西口 6:00 厳守です。お小遣いは2,000円以内（飲み物・お土産用）とし、名前を書いた封筒に入れて持たせてください。",
      scope: "team",
      scopeLabel: "29期",
    },
    {
      id: "demo-faq-5",
      category: "equipment",
      categoryLabel: "用具・持ち物",
      question: "バットやスパイクを新しく購入する際の注意点はありますか？",
      answer: "公式戦では全日本軟式野球連盟（JSBB）公認マークのバットが必要です。また、小学生（学童部）は金属刃のスパイクは禁止されており、ポイントスパイクまたはゴム底のみ使用可能です。購入前に監督・コーチにご相談いただくことをおすすめします。",
      scope: "organization",
      scopeLabel: "チーム全体",
    },
    {
      id: "demo-faq-6",
      category: "equipment",
      categoryLabel: "用具・持ち物",
      question: "夏場の活動時の持ち物や熱中症対策について教えてください。",
      answer: "水筒（2L以上推奨・スポーツドリンク推奨）、氷嚢（アイシング用）、塩分タブレット、着替え用アンダーシャツを必ずご持参ください。ベンチにはチーム用の大型クーラーボックスと氷を用意しています。",
      scope: "organization",
      scopeLabel: "チーム全体",
    },
    {
      id: "demo-faq-7",
      category: "cost",
      categoryLabel: "部費・保険",
      question: "部費の支払い方法と期限について教えてください。",
      answer: "部費は毎月25日までに指定口座へのお振込み、または父母会会計への手渡しとなります。半期・年間のまとめ払いも可能です。",
      scope: "organization",
      scopeLabel: "チーム全体",
    },
    {
      id: "demo-faq-8",
      category: "manner",
      categoryLabel: "試合観戦マナー",
      question: "試合の応援やベンチ裏での観戦ルールはありますか？",
      answer: "選手への過度な指示出し（審判へのアピールや暴言）は禁止されています。全力プレーを称える温かい声援と拍手をお願いします。また、球場ごとの指定応援席エリアのルールを遵守してください。",
      scope: "organization",
      scopeLabel: "チーム全体",
    },
  ];

  try {
    if (!teamId || teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        faqs: DEMO_FAQS,
      });
    }

    // チーム情報を取得して organizationId を特定
    const currentTeam = await db
      .select({
        id: teams.id,
        name: teams.name,
        organizationId: teams.organizationId,
      })
      .from(teams)
      .where(eq(teams.id, teamId))
      .get();

    if (!currentTeam) {
      return c.json({ success: true, isDemo: false, faqs: [] });
    }

    // 組織全体FAQ または この編成限定FAQを取得
    const conditions = [eq(teamFaqs.teamId, teamId)];
    if (currentTeam.organizationId) {
      conditions.push(eq(teamFaqs.organizationId, currentTeam.organizationId));
    }

    const rows = await db
      .select()
      .from(teamFaqs)
      .where(or(...conditions))
      .orderBy(desc(teamFaqs.createdAt))
      .all();

    const categoryLabels: Record<string, string> = {
      rain: "雨天・中止判断",
      duty: "当番・配車",
      equipment: "用具・持ち物",
      cost: "部費・保険",
      manner: "観戦マナー",
      trip: "遠征・合宿",
      general: "その他・全般",
    };

    const formatted = rows.map((f) => ({
      id: f.id,
      question: f.question,
      answer: f.answer,
      category: f.category,
      categoryLabel: categoryLabels[f.category] || "その他",
      scope: f.scope,
      scopeLabel: f.scope === "organization" ? "チーム全体" : (currentTeam.name || "編成"),
      createdAt: f.createdAt,
    }));

    return c.json({
      success: true,
      isDemo: false,
      faqs: formatted,
    });
  } catch (error: any) {
    console.error("Failed to load liff faqs:", error);
    return c.json({ success: false, faqs: [] });
  }
});

/**
 * ❓ Q&A (FAQ) 新規登録API
 */
app.post("/faqs", async (c) => {
  const db = drizzle(c.env.DB);
  try {
    const body = await c.req.json();
    const { teamId, question, answer, category, scope, userId } = body;

    if (!teamId || !question || !answer) {
      return c.json({ success: false, error: "teamId, question, answer are required" }, 400);
    }

    if (teamId === "demo-team") {
      return c.json({ success: true, message: "Q&Aを登録しました（デモ）" });
    }

    // チーム情報を取得して organizationId を特定
    const currentTeam = await db
      .select({
        id: teams.id,
        organizationId: teams.organizationId,
      })
      .from(teams)
      .where(eq(teams.id, teamId))
      .get();

    const organizationId = currentTeam?.organizationId || null;
    const faqScope = scope === "organization" ? "organization" : "team";

    await db.insert(teamFaqs).values({
      id: `faq_${crypto.randomUUID()}`,
      organizationId: faqScope === "organization" ? organizationId : null,
      teamId: faqScope === "team" ? teamId : null,
      question: question.trim(),
      answer: answer.trim(),
      category: category || "general",
      scope: faqScope,
      createdById: userId || null,
      createdAt: new Date(),
    });

    return c.json({ success: true, message: "Q&Aを登録しました" });
  } catch (error: any) {
    console.error("Failed to create faq:", error);
    return c.json({ success: false, error: error?.message || "Q&Aの登録に失敗しました" }, 500);
  }
});

/**
 * 📄 資料更新API (PUT /documents/:id)
 */
app.put("/documents/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");
  try {
    const body = await c.req.json();
    const { title, category, fileUrl, fileType, fileSize, description, scope, teamId } = body;

    if (id.startsWith("demo-")) {
      return c.json({ success: true, message: "資料を更新しました（デモ）" });
    }

    const currentDoc = await db.select().from(teamDocuments).where(eq(teamDocuments.id, id)).get();
    if (!currentDoc) {
      return c.json({ success: false, error: "指定された資料が見つかりません" }, 404);
    }

    // スコープの切り替え
    let organizationId = currentDoc.organizationId;
    let targetTeamId = currentDoc.teamId;

    if (scope === "organization" && !organizationId && targetTeamId) {
      const team = await db.select({ orgId: teams.organizationId }).from(teams).where(eq(teams.id, targetTeamId)).get();
      organizationId = team?.orgId || null;
      targetTeamId = null;
    } else if (scope === "team" && teamId) {
      targetTeamId = teamId;
      organizationId = null;
    }

    await db
      .update(teamDocuments)
      .set({
        title: title ? title.trim() : currentDoc.title,
        category: category || currentDoc.category,
        fileUrl: fileUrl ? fileUrl.trim() : currentDoc.fileUrl,
        fileType: fileType || currentDoc.fileType,
        fileSize: fileSize || currentDoc.fileSize,
        description: description !== undefined ? description.trim() : currentDoc.description,
        scope: scope || currentDoc.scope,
        organizationId: scope === "organization" ? organizationId : null,
        teamId: scope === "team" ? targetTeamId : null,
      })
      .where(eq(teamDocuments.id, id));

    return c.json({ success: true, message: "資料を更新しました" });
  } catch (error: any) {
    console.error("Failed to update document:", error);
    return c.json({ success: false, error: error?.message || "資料の更新に失敗しました" }, 500);
  }
});

/**
 * 📄 資料削除API (DELETE /documents/:id)
 */
app.delete("/documents/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");
  try {
    if (id.startsWith("demo-")) {
      return c.json({ success: true, message: "資料を削除しました（デモ）" });
    }

    await db.delete(teamDocuments).where(eq(teamDocuments.id, id));
    return c.json({ success: true, message: "資料を削除しました" });
  } catch (error: any) {
    console.error("Failed to delete document:", error);
    return c.json({ success: false, error: error?.message || "資料の削除に失敗しました" }, 500);
  }
});

/**
 * ❓ Q&A更新API (PUT /faqs/:id)
 */
app.put("/faqs/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");
  try {
    const body = await c.req.json();
    const { question, answer, category, scope, teamId } = body;

    if (id.startsWith("demo-")) {
      return c.json({ success: true, message: "Q&Aを更新しました（デモ）" });
    }

    const currentFaq = await db.select().from(teamFaqs).where(eq(teamFaqs.id, id)).get();
    if (!currentFaq) {
      return c.json({ success: false, error: "指定されたQ&Aが見つかりません" }, 404);
    }

    // スコープの切り替え
    let organizationId = currentFaq.organizationId;
    let targetTeamId = currentFaq.teamId;

    if (scope === "organization" && !organizationId && targetTeamId) {
      const team = await db.select({ orgId: teams.organizationId }).from(teams).where(eq(teams.id, targetTeamId)).get();
      organizationId = team?.orgId || null;
      targetTeamId = null;
    } else if (scope === "team" && teamId) {
      targetTeamId = teamId;
      organizationId = null;
    }

    await db
      .update(teamFaqs)
      .set({
        question: question ? question.trim() : currentFaq.question,
        answer: answer ? answer.trim() : currentFaq.answer,
        category: category || currentFaq.category,
        scope: scope || currentFaq.scope,
        organizationId: scope === "organization" ? organizationId : null,
        teamId: scope === "team" ? targetTeamId : null,
      })
      .where(eq(teamFaqs.id, id));

    return c.json({ success: true, message: "Q&Aを更新しました" });
  } catch (error: any) {
    console.error("Failed to update faq:", error);
    return c.json({ success: false, error: error?.message || "Q&Aの更新に失敗しました" }, 500);
  }
});

/**
 * ❓ Q&A削除API (DELETE /faqs/:id)
 */
app.delete("/faqs/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");
  try {
    if (id.startsWith("demo-")) {
      return c.json({ success: true, message: "Q&Aを削除しました（デモ）" });
    }

    await db.delete(teamFaqs).where(eq(teamFaqs.id, id));
    return c.json({ success: true, message: "Q&Aを削除しました" });
  } catch (error: any) {
    console.error("Failed to delete faq:", error);
    return c.json({ success: false, error: error?.message || "Q&Aの削除に失敗しました" }, 500);
  }
});

/**
 * ⚾ 試合一覧取得API (GET /matches?teamId=xxx)
 */
app.get("/matches", async (c) => {
  const db = drizzle(c.env.DB);
  const teamId = c.req.query("teamId");

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
        tournamentName: tournaments.name,
        venueName: venues.name,
        venueShortName: venues.shortName,
        surfaceDetails: matches.surfaceDetails,
        battingOrder: matches.battingOrder,
        innings: matches.innings,
        myInningScores: matches.myInningScores,
        opponentInningScores: matches.opponentInningScores,
        myHits: matches.myHits,
        opponentHits: matches.opponentHits,
        myErrors: matches.myErrors,
        opponentErrors: matches.opponentErrors,
      })
      .from(matches)
      .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
      .leftJoin(venues, eq(matches.venueId, venues.id))
      .where(eq(matches.teamId, teamId))
      .orderBy(desc(matches.date), desc(matches.createdAt))
      .all();

    const formattedMatches = matchesList.map(m => ({
      ...m,
      myInningScores: typeof m.myInningScores === "string" ? JSON.parse(m.myInningScores || "[]") : (m.myInningScores || []),
      opponentInningScores: typeof m.opponentInningScores === "string" ? JSON.parse(m.opponentInningScores || "[]") : (m.opponentInningScores || []),
    }));

    return c.json({
      success: true,
      isDemo: false,
      matches: formattedMatches,
    });
  } catch (error: any) {
    console.error("Failed to load liff matches:", error);
    return c.json({ success: false, error: error?.message || "試合一覧の取得に失敗しました", matches: [] }, 500);
  }
});

export default app;
