// filepath: src/api/liff/carpool-simple.ts
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { ensureAllSchemasOnce } from "@/lib/db-helper";
import {
  comparePlayersByConditionAndUniform,
  getTodayJstDateKey,
  resolveEffectivePlayerConditionOnDate,
} from "@/lib/liff/player-condition";
import { buildParentToChildrenMap } from "@/lib/liff/group-attendance";
import { loadTeamPlayerConditionPeriodsMap } from "@/lib/player-roster-cleanup";
import type { WorkerEnv } from "@/types/api";

const liffCarpoolSimpleRouter = new Hono<{ Bindings: WorkerEnv }>();

const {
  teams,
  teamMembers,
  players,
  parentChildRelations,
  events,
  attendances,
  venues,
  memberCars,
  eventCarpools,
  eventCarpoolRiders,
  eventCarpoolSettings,
} = schema;

export interface SimpleCarpoolEventOption {
  id: string;
  title: string;
  dateKey: string;
  dateLabel: string;
  timeLabel: string;
  location: string;
  notes: string;
  carCount: number;
}

export interface SimpleCarpoolDriverCandidate {
  memberId: string;
  name: string;
  roleLabel: string;
  hasCarOffer: boolean;
  offeredCarId: string | null;
  attendanceStatus: string | null;
  cars: Array<{
    carId: string;
    name: string;
    color: string | null;
    numberPlate: string | null;
    capacity: number;
    isCargo: boolean;
    isBus?: boolean;
  }>;
}

export interface SimpleCarpoolSharedCarItem {
  carId: string;
  name: string;
  color: string | null;
  numberPlate: string | null;
  capacity: number;
  isCargo: boolean;
  isBus: boolean;
}

export interface SimpleCarpoolPlayerCandidate {
  playerId: string;
  name: string;
  uniformNumber: string;
  attendanceStatus: string | null;
  isAttending: boolean;
}

export interface SimpleCarpoolExistingCar {
  id: string;
  driverMemberId: string;
  driverName: string;
  carId: string | null;
  carName: string;
  plate: string;
  capacity: number;
  isCargo: boolean;
  isBus?: boolean;
  riders: Array<{
    type: "player" | "adult";
    id: string;
    name: string;
  }>;
}

export interface SimpleCarpoolVenueOption {
  id: string;
  name: string;
}

export interface SimpleCarpoolContextResponse {
  success: boolean;
  isDemo: boolean;
  selectedEventId: string | null;
  events: SimpleCarpoolEventOption[];
  drivers: SimpleCarpoolDriverCandidate[];
  sharedCars?: SimpleCarpoolSharedCarItem[];
  players: SimpleCarpoolPlayerCandidate[];
  venues: SimpleCarpoolVenueOption[];
  homeGround: string;
  existingCars: SimpleCarpoolExistingCar[];
}

export interface SimpleCarpoolSavePayload {
  teamId: string;
  eventId: string; // 既存 events.id または "__new__"
  newEvent?: {
    title: string;
    date: string; // YYYY-MM-DD
    gatherTime: string; // HH:MM
    destination: string;
    notes?: string;
  };
  eventPatch?: {
    destination?: string;
    notes?: string;
  };
  cars: Array<{
    id?: string;
    driverMemberId: string; // tm_... または "__custom__"
    customDriverName?: string;
    carId?: string | null;
    customCarName?: string;
    plate?: string;
    capacity: number;
    isCargo: boolean;
    isBus?: boolean;
    riders: Array<{
      type: "player" | "adult";
      id: string;
    }>;
  }>;
}

function toJstDateParts(d: Date): {
  dateKey: string;
  dateLabel: string;
  timeLabel: string;
} {
  const jst = new Date(d.getTime() + 9 * 3600_000);
  const yyyy = jst.getUTCFullYear();
  const mm = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(jst.getUTCDate()).padStart(2, "0");
  const hh = String(jst.getUTCHours()).padStart(2, "0");
  const min = String(jst.getUTCMinutes()).padStart(2, "0");
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const wd = weekdays[jst.getUTCDay()] || "";
  return {
    dateKey: `${yyyy}-${mm}-${dd}`,
    dateLabel: `${Number(mm)}/${Number(dd)}(${wd})`,
    timeLabel: `${hh}:${min}`,
  };
}

function parseJstDateTimeToDate(dateStr: string, timeStr: string): Date {
  const mDate = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const mTime = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
  const nowJst = new Date(Date.now() + 9 * 3600_000);
  const year = mDate ? Number(mDate[1]) : nowJst.getUTCFullYear();
  const month = mDate ? Number(mDate[2]) - 1 : nowJst.getUTCMonth();
  const day = mDate ? Number(mDate[3]) : nowJst.getUTCDate();
  const hour = mTime ? Math.min(23, Math.max(0, Number(mTime[1]))) : 8;
  const minute = mTime ? Math.min(59, Math.max(0, Number(mTime[2]))) : 0;

  const utcMs = Date.UTC(year, month, day, hour, minute, 0) - 9 * 3600_000;
  return new Date(utcMs);
}

function normalizeNameKey(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/[\s\u3000]+/g, "").trim().toLowerCase();
}

const ATTENDING_STATUS_SET = new Set([
  "present",
  "late",
  "partial",
  "duty",
  "help",
  "setup",
  "game",
]);

function buildDemoContext(): SimpleCarpoolContextResponse {
  return {
    success: true,
    isDemo: true,
    selectedEventId: "demo-event-carpool",
    homeGround: "ホームグラウンド",
    events: [
      {
        id: "demo-event-carpool",
        title: "練習試合 遠征",
        dateKey: "2026-08-30",
        dateLabel: "8/30(日)",
        timeLabel: "07:45",
        location: "〇〇市民球場 第1駐車場",
        notes: "道具車はボールケース・テントを積載",
        carCount: 3,
      },
    ],
    drivers: [
      {
        memberId: "demo-m-1",
        name: "鈴木 パパ",
        roleLabel: "保護者",
        hasCarOffer: true,
        offeredCarId: "demo-car-1",
        attendanceStatus: "present",
        cars: [
          {
            carId: "demo-car-1",
            name: "セレナ",
            color: "白",
            numberPlate: "・12-34",
            capacity: 6,
            isCargo: false,
          },
        ],
      },
      {
        memberId: "demo-m-2",
        name: "田中 パパ",
        roleLabel: "コーチ",
        hasCarOffer: true,
        offeredCarId: "demo-car-2",
        attendanceStatus: "present",
        cars: [
          {
            carId: "demo-car-2",
            name: "アルファード",
            color: "黒",
            numberPlate: "・・88",
            capacity: 5,
            isCargo: false,
          },
        ],
      },
      {
        memberId: "demo-m-3",
        name: "山下 監督",
        roleLabel: "指導者",
        hasCarOffer: true,
        offeredCarId: "demo-car-3",
        attendanceStatus: "present",
        cars: [
          {
            carId: "demo-car-3",
            name: "ハイエース",
            color: "銀",
            numberPlate: "・56-78",
            capacity: 3,
            isCargo: true,
          },
        ],
      },
      {
        memberId: "demo-m-4",
        name: "佐藤 ママ",
        roleLabel: "保護者",
        hasCarOffer: false,
        offeredCarId: null,
        attendanceStatus: "present",
        cars: [],
      },
    ],
    sharedCars: [
      {
        carId: "demo-bus-1",
        name: "チーム マイクロバス 1号",
        color: "ホワイト×ネイビー",
        numberPlate: "・・29",
        capacity: 24,
        isCargo: false,
        isBus: true,
      },
    ],
    players: [
      { playerId: "demo-p-1", name: "鈴木 翔太", uniformNumber: "1", attendanceStatus: "present", isAttending: true },
      { playerId: "demo-p-2", name: "佐藤 蓮", uniformNumber: "2", attendanceStatus: "present", isAttending: true },
      { playerId: "demo-p-3", name: "高橋 陸", uniformNumber: "6", attendanceStatus: "present", isAttending: true },
      { playerId: "demo-p-4", name: "田中 颯太", uniformNumber: "10", attendanceStatus: "present", isAttending: true },
      { playerId: "demo-p-5", name: "伊藤 悠斗", uniformNumber: "8", attendanceStatus: "present", isAttending: true },
    ],
    venues: [
      { id: "demo-v-1", name: "〇〇市民球場 第1駐車場" },
    ],
    existingCars: [
      {
        id: "demo-cp-1",
        driverMemberId: "demo-m-1",
        driverName: "鈴木 パパ",
        carId: "demo-car-1",
        carName: "セレナ",
        plate: "・12-34",
        capacity: 6,
        isCargo: false,
        riders: [
          { type: "player", id: "demo-p-1", name: "鈴木 翔太" },
          { type: "player", id: "demo-p-2", name: "佐藤 蓮" },
          { type: "adult", id: "demo-m-4", name: "佐藤 ママ" },
        ],
      },
    ],
  };
}

/**
 * GET /api/liff/carpool-simple/context
 * 簡易配車エディタ用の予定・車出し候補・参加選手・既存配車データ一括取得
 */
liffCarpoolSimpleRouter.get("/context", async (c) => {
  const teamId = (c.req.query("teamId") || "").trim();
  const requestedEventId = (c.req.query("eventId") || "").trim();

  if (!teamId || teamId === "demo-team") {
    return c.json(buildDemoContext());
  }

  try {
    await ensureAllSchemasOnce(c.env.DB);
    const db = drizzle(c.env.DB);

    const [
      teamRow,
      teamEvents,
      allMembers,
      allPlayers,
      allCars,
      allVenues,
      allRelations,
      periodsByPlayerId,
    ] = await Promise.all([
      db
        .select({ id: teams.id, homeGround: teams.homeGround })
        .from(teams)
        .where(eq(teams.id, teamId))
        .get(),
      db
        .select()
        .from(events)
        .where(eq(events.teamId, teamId))
        .orderBy(desc(events.startAt))
        .limit(40)
        .all(),
      db
        .select()
        .from(teamMembers)
        .where(eq(teamMembers.teamId, teamId))
        .all(),
      db.select().from(players).where(eq(players.teamId, teamId)).all(),
      db
        .select()
        .from(memberCars)
        .where(eq(memberCars.teamId, teamId))
        .all(),
      db.select({ id: venues.id, name: venues.name }).from(venues).all().catch(() => []),
      db
        .select({
          parentId: parentChildRelations.parentId,
          childId: parentChildRelations.childId,
        })
        .from(parentChildRelations)
        .where(eq(parentChildRelations.teamId, teamId))
        .all()
        .catch(() => []),
      loadTeamPlayerConditionPeriodsMap(c.env.DB, teamId),
    ]);

    if (!teamRow) {
      return c.json({ success: false, error: "チームが見つかりません" }, 404);
    }

    const eventIds = teamEvents.map((ev) => ev.id);
    const carCountRows =
      eventIds.length > 0
        ? await db
            .select({
              eventId: eventCarpools.eventId,
              count: sql<number>`count(*)`,
            })
            .from(eventCarpools)
            .where(inArray(eventCarpools.eventId, eventIds))
            .groupBy(eventCarpools.eventId)
            .all()
        : [];

    const countByEventId = new Map<string, number>();
    for (const r of carCountRows) {
      countByEventId.set(r.eventId, Number(r.count) || 0);
    }

    // 当日0:00(JST)以降の予定を近い順に先頭へ、過去予定を新しい順に後ろへ並べる
    const jstNow = new Date(Date.now() + 9 * 3600_000);
    const jstTodayStartMs =
      Date.UTC(
        jstNow.getUTCFullYear(),
        jstNow.getUTCMonth(),
        jstNow.getUTCDate()
      ) -
      9 * 3600_000;

    const upcomingAsc = teamEvents
      .filter((ev) => new Date(ev.startAt).getTime() >= jstTodayStartMs)
      .sort(
        (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
      );
    const pastDesc = teamEvents
      .filter((ev) => new Date(ev.startAt).getTime() < jstTodayStartMs)
      .sort(
        (a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime()
      );
    const orderedEvents = [...upcomingAsc, ...pastDesc].slice(0, 25);

    const eventOptions: SimpleCarpoolEventOption[] = orderedEvents.map((ev) => {
      const parts = toJstDateParts(new Date(ev.startAt));
      return {
        id: ev.id,
        title: ev.title,
        dateKey: parts.dateKey,
        dateLabel: parts.dateLabel,
        timeLabel: parts.timeLabel,
        location: ev.location || "",
        notes: ev.description || "",
        carCount: countByEventId.get(ev.id) || 0,
      };
    });

    let selectedEvent: (typeof orderedEvents)[number] | null = null;
    if (requestedEventId && requestedEventId !== "convoy-test") {
      selectedEvent =
        orderedEvents.find((e) => e.id === requestedEventId) ||
        teamEvents.find((e) => e.id === requestedEventId) ||
        null;
    }
    if (!selectedEvent) {
      selectedEvent =
        upcomingAsc.find((e) => (countByEventId.get(e.id) || 0) > 0) ||
        upcomingAsc[0] ||
        pastDesc.find((e) => (countByEventId.get(e.id) || 0) > 0) ||
        orderedEvents[0] ||
        null;
    }

    const [eventAttendanceRows, existingCarpoolRows] = selectedEvent
      ? await Promise.all([
          db
            .select()
            .from(attendances)
            .where(eq(attendances.eventId, selectedEvent.id))
            .all(),
          db
            .select({
              id: eventCarpools.id,
              driverId: eventCarpools.driverId,
              driverName: teamMembers.name,
              carId: eventCarpools.carId,
              carName: memberCars.name,
              numberPlate: memberCars.numberPlate,
              capacity: eventCarpools.capacity,
              carType: eventCarpools.carType,
            })
            .from(eventCarpools)
            .leftJoin(teamMembers, eq(eventCarpools.driverId, teamMembers.id))
            .leftJoin(memberCars, eq(eventCarpools.carId, memberCars.id))
            .where(eq(eventCarpools.eventId, selectedEvent.id))
            .all(),
        ])
      : [[], []];

    const cpIds = existingCarpoolRows.map((cp) => cp.id);
    const existingRiderRows =
      cpIds.length > 0
        ? await db
            .select({
              carpoolId: eventCarpoolRiders.carpoolId,
              playerId: eventCarpoolRiders.playerId,
              playerName: players.name,
              memberId: eventCarpoolRiders.memberId,
              memberName: teamMembers.name,
            })
            .from(eventCarpoolRiders)
            .leftJoin(players, eq(eventCarpoolRiders.playerId, players.id))
            .leftJoin(teamMembers, eq(eventCarpoolRiders.memberId, teamMembers.id))
            .where(inArray(eventCarpoolRiders.carpoolId, cpIds))
            .all()
        : [];

    // 大人メンバー（保護者・指導者）と車両・車出し回答のマッピング
    const memberAttendanceById = new Map<
      string,
      { status: string; hasCar: boolean; carId: string | null }
    >();
    const playerAttendanceById = new Map<string, string>();
    for (const att of eventAttendanceRows) {
      if (att.memberId) {
        memberAttendanceById.set(att.memberId, {
          status: att.status || "pending",
          hasCar: Boolean(att.hasCar),
          carId: att.carId || null,
        });
      }
      if (att.playerId) {
        playerAttendanceById.set(att.playerId, att.status || "pending");
      }
    }

    const carsByOwnerId = new Map<
      string,
      SimpleCarpoolDriverCandidate["cars"]
    >();
    const sharedCars: SimpleCarpoolSharedCarItem[] = [];
    for (const car of allCars) {
      const isBus = car.carType === "bus";
      const isCargo = car.carType === "cargo";
      const carItem = {
        carId: car.id,
        name: car.name,
        color: car.color || null,
        numberPlate: car.numberPlate || null,
        capacity: car.capacity || (isBus ? 20 : 4),
        isCargo,
        isBus,
      };
      if (isBus || (!car.ownerId && !car.ownerId2)) {
        sharedCars.push(carItem);
      }
      for (const ownerId of [car.ownerId, car.ownerId2]) {
        if (!ownerId) continue;
        const list = carsByOwnerId.get(ownerId) || [];
        list.push(carItem);
        carsByOwnerId.set(ownerId, list);
      }
    }

    const targetEventDateKey = selectedEvent
      ? toJstDateParts(new Date(selectedEvent.startAt)).dateKey
      : getTodayJstDateKey();
    const todayKey = getTodayJstDateKey();

    const onLeavePlayerIdsOnEvent = new Set<string>();
    const playersWithResolvedCondition = allPlayers
      .filter((p) => p.isActive !== false)
      .map((p) => {
        const eff = resolveEffectivePlayerConditionOnDate({
          conditionPeriods: periodsByPlayerId.get(p.id) || [],
          fallbackStatus: p.conditionStatus,
          dateKey: targetEventDateKey,
          todayKey,
        });
        if (eff.status === "on_leave") {
          onLeavePlayerIdsOnEvent.add(p.id);
        }
        return {
          ...p,
          resolvedConditionStatus: eff.status,
        };
      });

    const parentToChildIdsMap = buildParentToChildrenMap({
      players: allPlayers.map((p) => ({
        id: p.id,
        name: p.name,
        userId: p.userId,
        isActive: p.isActive,
        conditionStatus: p.conditionStatus,
        conditionPeriods: periodsByPlayerId.get(p.id) || [],
      })),
      teamMembers: allMembers,
      relations: allRelations,
    });
    const existingDriverIds = new Set(
      existingCarpoolRows.map((cp) => cp.driverId).filter((id): id is string => Boolean(id))
    );

    const adultMembers = allMembers.filter((m) => {
      if (m.memberType === "player" || m.status === "rejected") return false;
      if (!m.name || !m.name.trim()) return false;
      const isStaff =
        m.memberType === "staff" ||
        m.role === "manager" ||
        m.role === "coach" ||
        m.role === "owner";
      if (isStaff || existingDriverIds.has(m.id)) return true;
      const att = memberAttendanceById.get(m.id);
      if (att?.hasCar) return true;
      const linkedKids = parentToChildIdsMap.get(m.id) || [];
      if (
        linkedKids.length > 0 &&
        linkedKids.every((cid) => onLeavePlayerIdsOnEvent.has(cid))
      ) {
        return false;
      }
      return true;
    });

    const drivers: SimpleCarpoolDriverCandidate[] = adultMembers
      .map((m) => {
        const att = memberAttendanceById.get(m.id);
        const ownedCars = carsByOwnerId.get(m.id) || [];
        const isStaff =
          m.memberType === "staff" ||
          m.role === "manager" ||
          m.role === "coach" ||
          m.role === "owner";
        return {
          memberId: m.id,
          name: (m.name || "").trim(),
          roleLabel: isStaff ? "指導者" : "保護者",
          hasCarOffer: Boolean(att?.hasCar),
          offeredCarId: att?.carId || null,
          attendanceStatus: att?.status || null,
          cars: ownedCars,
        };
      })
      .sort((a, b) => {
        if (a.hasCarOffer !== b.hasCarOffer) {
          return a.hasCarOffer ? -1 : 1;
        }
        const aHasCar = a.cars.length > 0;
        const bHasCar = b.cars.length > 0;
        if (aHasCar !== bHasCar) {
          return aHasCar ? -1 : 1;
        }
        return a.name.localeCompare(b.name, "ja");
      });

    // 対象イベント日時点で休部中(on_leave)の選手のみを除外して一覧を構築
    const activePlayers = playersWithResolvedCondition
      .filter((p) => p.resolvedConditionStatus !== "on_leave")
      .sort((a, b) =>
        comparePlayersByConditionAndUniform(
          {
            conditionStatus: a.resolvedConditionStatus,
            uniformNumber: a.uniformNumber,
            name: a.name,
          },
          {
            conditionStatus: b.resolvedConditionStatus,
            uniformNumber: b.uniformNumber,
            name: b.name,
          }
        )
      );

    const playerCandidates: SimpleCarpoolPlayerCandidate[] = activePlayers.map(
      (p) => {
        const st = playerAttendanceById.get(p.id) || null;
        return {
          playerId: p.id,
          name: p.name,
          uniformNumber: p.uniformNumber || "",
          attendanceStatus: st,
          isAttending: st ? ATTENDING_STATUS_SET.has(st) : false,
        };
      }
    );

    const ridersMap = new Map<string, SimpleCarpoolExistingCar["riders"]>();
    for (const r of existingRiderRows) {
      const list = ridersMap.get(r.carpoolId) || [];
      if (r.playerId && r.playerName) {
        list.push({ type: "player", id: r.playerId, name: r.playerName });
      } else if (r.memberId && r.memberName) {
        list.push({ type: "adult", id: r.memberId, name: r.memberName });
      }
      ridersMap.set(r.carpoolId, list);
    }

    const existingCars: SimpleCarpoolExistingCar[] = existingCarpoolRows.map(
      (cp) => ({
        id: cp.id,
        driverMemberId: cp.driverId,
        driverName: cp.driverName || "ドライバー",
        carId: cp.carId || null,
        carName: cp.carName || "",
        plate: cp.numberPlate || "",
        capacity: cp.capacity || 4,
        isCargo: cp.carType === "cargo",
        isBus: cp.carType === "bus",
        riders: ridersMap.get(cp.id) || [],
      })
    );

    const resPayload: SimpleCarpoolContextResponse = {
      success: true,
      isDemo: false,
      selectedEventId: selectedEvent?.id || null,
      events: eventOptions,
      drivers,
      sharedCars,
      players: playerCandidates,
      venues: allVenues,
      homeGround: teamRow.homeGround || "",
      existingCars,
    };

    return c.json(resPayload);
  } catch (error) {
    console.error("[GET /api/liff/carpool-simple/context] Error:", error);
    return c.json(
      { success: false, error: "配車編集データの読み込みに失敗しました" },
      500
    );
  }
});

/**
 * POST /api/liff/carpool-simple/save
 * 簡易配車の保存（新規予定の即時作成・手入力運転手/マイカーの自動補完・既存号車ID維持によるライブ位置保護）
 */
liffCarpoolSimpleRouter.post("/save", async (c) => {
  try {
    const body = (await c.req.json()) as Partial<SimpleCarpoolSavePayload>;
    const teamId = (body.teamId || "").trim();
    const rawEventId = (body.eventId || "").trim();
    const rawCars = Array.isArray(body.cars) ? body.cars : [];

    if (!teamId) {
      return c.json({ success: false, error: "チームIDが必要です" }, 400);
    }

    if (teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        eventId: "demo-event-carpool",
        savedCount: rawCars.length,
      });
    }

    await ensureAllSchemasOnce(c.env.DB);
    const db = drizzle(c.env.DB);

    const teamRow = await db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.id, teamId))
      .get();
    if (!teamRow) {
      return c.json({ success: false, error: "チームが見つかりません" }, 404);
    }

    // 1. 対象イベントの解決（既存イベント更新 または 新規イベント即時作成）
    let targetEventId = rawEventId;
    if (rawEventId === "__new__" || !rawEventId) {
      const newEv = body.newEvent;
      const title = (newEv?.title || "遠征・試合").trim();
      const dateStr = (newEv?.date || "").trim();
      const timeStr = (newEv?.gatherTime || "08:00").trim();
      const destination = (newEv?.destination || "グラウンド").trim();
      const notes = (newEv?.notes || "").trim();

      targetEventId = `ev_${crypto.randomUUID().replace(/-/g, "")}`;
      const startAtDate = parseJstDateTimeToDate(dateStr, timeStr);

      await db.insert(events).values({
        id: targetEventId,
        teamId,
        title,
        startAt: startAtDate,
        eventType: "match",
        location: destination,
        description: notes || null,
        status: "scheduled",
      });
    } else {
      const evCheck = await db
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.id, rawEventId), eq(events.teamId, teamId)))
        .get();
      if (!evCheck) {
        return c.json(
          { success: false, error: "指定された予定が見つかりません" },
          404
        );
      }

      if (body.eventPatch) {
        const updateFields: { location?: string; description?: string | null } = {};
        if (typeof body.eventPatch.destination === "string" && body.eventPatch.destination.trim()) {
          updateFields.location = body.eventPatch.destination.trim();
        }
        if (typeof body.eventPatch.notes === "string") {
          updateFields.description = body.eventPatch.notes.trim() || null;
        }
        if (Object.keys(updateFields).length > 0) {
          await db
            .update(events)
            .set(updateFields)
            .where(eq(events.id, targetEventId));
        }
      }
    }

    // 2. マスタ情報の並列取得
    const [existingMembers, existingCarsMaster, existingPlayers, currentCarpools, existingSettings] =
      await Promise.all([
        db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId)).all(),
        db.select().from(memberCars).where(eq(memberCars.teamId, teamId)).all(),
        db.select({ id: players.id }).from(players).where(eq(players.teamId, teamId)).all(),
        db
          .select({ id: eventCarpools.id })
          .from(eventCarpools)
          .where(eq(eventCarpools.eventId, targetEventId))
          .all(),
        db
          .select({ id: eventCarpoolSettings.id })
          .from(eventCarpoolSettings)
          .where(eq(eventCarpoolSettings.eventId, targetEventId))
          .get(),
      ]);

    if (!existingSettings) {
      await db.insert(eventCarpoolSettings).values({
        id: `ecs_${crypto.randomUUID().replace(/-/g, "")}`,
        eventId: targetEventId,
        distanceKm: 0,
        gasolinePrice: 170,
        splitMethod: "by_team",
        noParentChild: false,
      });
    }

    const validMemberById = new Map(existingMembers.map((m) => [m.id, m]));
    const memberByNormName = new Map(
      existingMembers.map((m) => [normalizeNameKey(m.name), m])
    );
    const validCarById = new Map(existingCarsMaster.map((mc) => [mc.id, mc]));
    const validPlayerIdSet = new Set(existingPlayers.map((p) => p.id));
    const currentCarpoolIdSet = new Set(currentCarpools.map((cp) => cp.id));

    // 3. 排他制御（同一運転手の重複登録防止・同一乗客の複数号車重複防止）
    const usedDriverIds = new Set<string>();
    const usedPlayerRiderIds = new Set<string>();
    const usedAdultRiderIds = new Set<string>();

    const resolvedCarsToSave: Array<{
      carpoolId: string;
      isUpdate: boolean;
      driverId: string;
      carId: string | null;
      capacity: number;
      carType: "normal" | "cargo" | "bus";
      riders: Array<{ playerId: string | null; memberId: string | null }>;
    }> = [];

    for (const rawCar of rawCars) {
      let resolvedDriverId = (rawCar.driverMemberId || "").trim();

      if (resolvedDriverId === "__custom__" || !validMemberById.has(resolvedDriverId)) {
        const customName = (rawCar.customDriverName || "").trim();
        if (!customName) continue;
        const norm = normalizeNameKey(customName);
        const existingMatch = memberByNormName.get(norm);
        if (existingMatch) {
          resolvedDriverId = existingMatch.id;
        } else {
          const newMemberId = `tm_${crypto.randomUUID().replace(/-/g, "")}`;
          await db.insert(teamMembers).values({
            id: newMemberId,
            teamId,
            name: customName,
            role: "parent",
            memberType: "parent",
            status: "active",
          });
          const createdObj: typeof existingMembers[number] = {
            id: newMemberId,
            teamId,
            userId: null,
            name: customName,
            nameKana: null,
            memberType: "parent",
            phone: null,
            email: null,
            avatarUrl: null,
            role: "parent",
            subRoles: null,
            status: "active",
            joinedAt: new Date(),
          };
          validMemberById.set(newMemberId, createdObj);
          memberByNormName.set(norm, createdObj);
          resolvedDriverId = newMemberId;
        }
      }

      if (usedDriverIds.has(resolvedDriverId)) {
        continue;
      }
      usedDriverIds.add(resolvedDriverId);

      const capacity = Math.min(60, Math.max(1, Number(rawCar.capacity) || 4));
      const matchedMasterCar =
        rawCar.carId && validCarById.has(rawCar.carId)
          ? validCarById.get(rawCar.carId)
          : undefined;
      const carType: "normal" | "cargo" | "bus" =
        rawCar.isBus || matchedMasterCar?.carType === "bus"
          ? "bus"
          : rawCar.isCargo
          ? "cargo"
          : "normal";

      // 車両マスタの解決または手入力車両の自動登録
      let resolvedCarId: string | null =
        rawCar.carId && validCarById.has(rawCar.carId) ? rawCar.carId : null;
      const customCarName = (rawCar.customCarName || "").trim();
      const customPlate = (rawCar.plate || "").trim();

      if (!resolvedCarId && customCarName) {
        const newCarId = `car_${crypto.randomUUID().replace(/-/g, "")}`;
        await db.insert(memberCars).values({
          id: newCarId,
          teamId,
          ownerId: resolvedDriverId,
          name: customCarName,
          numberPlate: customPlate || null,
          capacity,
          carType,
        });
        resolvedCarId = newCarId;
      } else if (resolvedCarId) {
        const existingCar = validCarById.get(resolvedCarId);
        if (
          existingCar &&
          customPlate &&
          customPlate !== (existingCar.numberPlate || "")
        ) {
          await db
            .update(memberCars)
            .set({ numberPlate: customPlate })
            .where(eq(memberCars.id, resolvedCarId));
        }
      }

      const requestedId = (rawCar.id || "").trim();
      const isExistingForEvent = Boolean(
        requestedId && currentCarpoolIdSet.has(requestedId)
      );
      const carpoolId = isExistingForEvent
        ? requestedId
        : `cp_${crypto.randomUUID().replace(/-/g, "")}`;

      const sanitizedRiders: Array<{
        playerId: string | null;
        memberId: string | null;
      }> = [];

      if (Array.isArray(rawCar.riders)) {
        for (const r of rawCar.riders) {
          if (r.type === "player" && validPlayerIdSet.has(r.id)) {
            if (usedPlayerRiderIds.has(r.id)) continue;
            usedPlayerRiderIds.add(r.id);
            sanitizedRiders.push({ playerId: r.id, memberId: null });
          } else if (
            r.type === "adult" &&
            validMemberById.has(r.id) &&
            r.id !== resolvedDriverId
          ) {
            if (usedAdultRiderIds.has(r.id)) continue;
            usedAdultRiderIds.add(r.id);
            sanitizedRiders.push({ playerId: null, memberId: r.id });
          }
        }
      }

      resolvedCarsToSave.push({
        carpoolId,
        isUpdate: isExistingForEvent,
        driverId: resolvedDriverId,
        carId: resolvedCarId,
        capacity,
        carType,
        riders: sanitizedRiders,
      });
    }

    // 自分が他号車の運転手になった場合は同乗者リストからも除外
    for (const car of resolvedCarsToSave) {
      car.riders = car.riders.filter(
        (r) => !(r.memberId && usedDriverIds.has(r.memberId))
      );
    }

    // 4. 削除された号車のみを DELETE（維持された号車IDは UPDATE して carpool_live_locations の位置共有を保護！）
    const retainedIdSet = new Set(resolvedCarsToSave.map((c) => c.carpoolId));
    const removedIds = Array.from(currentCarpoolIdSet).filter(
      (id) => !retainedIdSet.has(id)
    );

    if (removedIds.length > 0) {
      await db
        .delete(eventCarpoolRiders)
        .where(inArray(eventCarpoolRiders.carpoolId, removedIds));
      await db
        .delete(eventCarpools)
        .where(inArray(eventCarpools.id, removedIds));
    }

    // 維持・新規の全号車の既存 riders を一括クリアしてから再インサート
    const retainedExistingIds = resolvedCarsToSave
      .filter((c) => c.isUpdate)
      .map((c) => c.carpoolId);
    if (retainedExistingIds.length > 0) {
      await db
        .delete(eventCarpoolRiders)
        .where(inArray(eventCarpoolRiders.carpoolId, retainedExistingIds));
    }

    for (const car of resolvedCarsToSave) {
      if (car.isUpdate) {
        await db
          .update(eventCarpools)
          .set({
            driverId: car.driverId,
            carId: car.carId,
            capacity: car.capacity,
            carType: car.carType,
          })
          .where(eq(eventCarpools.id, car.carpoolId));
      } else {
        await db.insert(eventCarpools).values({
          id: car.carpoolId,
          eventId: targetEventId,
          driverId: car.driverId,
          carId: car.carId,
          capacity: car.capacity,
          carType: car.carType,
          highwayFee: 0,
          parkingFee: 0,
        });
      }
    }

    const allRiderValues = resolvedCarsToSave.flatMap((car) =>
      car.riders.map((r) => ({
        id: `cpr_${crypto.randomUUID().replace(/-/g, "")}`,
        carpoolId: car.carpoolId,
        playerId: r.playerId,
        memberId: r.memberId,
      }))
    );

    // D1のバインド変数上限（100個）を超えないよう20件ずつバッチ挿入
    for (let i = 0; i < allRiderValues.length; i += 20) {
      const chunk = allRiderValues.slice(i, i + 20);
      await db.insert(eventCarpoolRiders).values(chunk);
    }

    return c.json({
      success: true,
      isDemo: false,
      eventId: targetEventId,
      savedCount: resolvedCarsToSave.length,
    });
  } catch (error) {
    console.error("[POST /api/liff/carpool-simple/save] Error:", error);
    return c.json(
      { success: false, error: "簡易配車の保存に失敗しました" },
      500
    );
  }
});

export default liffCarpoolSimpleRouter;
