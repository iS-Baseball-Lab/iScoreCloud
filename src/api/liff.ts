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
} from "@/db/schema";
import type { WorkerEnv } from "@/types/api";

const app = new Hono<{ Bindings: WorkerEnv }>();

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
  const db = drizzle(c.env.DB);
  const requestedTeamId = c.req.query("teamId");

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
  const db = drizzle(c.env.DB);
  const teamId = c.req.query("teamId");
  const userId = c.req.query("userId");

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

    // 各イベントの出欠集計
    const formattedEvents = await Promise.all(
      eventList.map(async (ev) => {
        const attList = await db
          .select({
            status: attendances.status,
            userId: attendances.userId,
          })
          .from(attendances)
          .where(eq(attendances.eventId, ev.id))
          .all();

        const presentCount = attList.filter((a) => a.status === "present" || a.status === "late" || a.status === "partial").length;
        const absentCount = attList.filter((a) => a.status === "absent").length;
        const pendingCount = attList.filter((a) => a.status === "pending").length;

        let myStatus: "present" | "absent" | "pending" = "pending";
        if (userId) {
          const myAtt = attList.find((a) => a.userId === userId);
          if (myAtt?.status) {
            myStatus = myAtt.status === "present" || myAtt.status === "late" || myAtt.status === "partial"
              ? "present"
              : myAtt.status === "absent"
              ? "absent"
              : "pending";
          }
        }

        const startDate = new Date(ev.startAt);
        const startTimeStr = startDate.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
        const endTimeStr = ev.endAt ? new Date(ev.endAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "";

        return {
          id: ev.id,
          title: ev.title,
          date: startDate.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" }),
          time: endTimeStr ? `${startTimeStr} 〜 ${endTimeStr}` : `${startTimeStr} 集合`,
          location: ev.location || "グラウンド",
          eventType: ev.eventType || "practice",
          dutyGroup: ev.dutyGroup || undefined,
          needsLunch: ev.eventType === "match",
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
 * 出欠回答送信API
 */
app.post("/attendance", async (c) => {
  const db = drizzle(c.env.DB);
  try {
    const body = await c.req.json();
    const { eventId, userId, status, comment } = body;

    if (!eventId || !status) {
      return c.json({ success: false, error: "eventId and status are required" }, 400);
    }

    if (eventId.startsWith("demo-")) {
      return c.json({ success: true, message: "出欠回答を記録しました（デモ）" });
    }

    const existing = await db
      .select()
      .from(attendances)
      .where(and(eq(attendances.eventId, eventId), eq(attendances.userId, userId || "")))
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
        userId: userId || null,
        status: status,
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

export default app;
