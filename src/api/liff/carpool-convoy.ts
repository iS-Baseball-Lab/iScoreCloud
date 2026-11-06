// filepath: src/api/liff/carpool-convoy.ts
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import * as schema from "@/db/schema";
import { ensureAllSchemasOnce } from "@/lib/db-helper";
import { getAuth } from "@/lib/auth";
import { canManageTeam } from "@/lib/roles";
import { parseMatchDayOpsJson } from "@/lib/liff/match-day-ops";
import {
  expandGoogleMapsShortUrl,
  extractDirectionsTargetFromUrl,
  extractLatLngFromGoogleMapsUrl,
} from "@/lib/google-maps";
import type { AuthUser, WorkerEnv } from "@/types/api";
import type {
  ConvoyDirection,
  ConvoyLocationUpdatePayload,
  ConvoySnapshotResponse,
  ConvoyTargetLocationInfo,
  ConvoyVehicleLiveState,
  ConvoyVehicleStatus,
} from "@/types/carpool-convoy";

const liffCarpoolConvoyRouter = new Hono<{ Bindings: WorkerEnv }>();

const {
  organizations,
  organizationMembers,
  teams,
  teamMembers,
  players,
  account,
  events,
  matches,
  venues,
  eventCarpools,
  eventCarpoolRiders,
  carpoolLiveLocations,
  parentChildRelations,
} = schema;

/** 6時間を超えた古い位置レコードは自動失効扱いとする（自宅・翌日以降の意図せぬ残存を完全遮断） */
const LIVE_LOCATION_TTL_MS = 6 * 60 * 60 * 1000;

const IGNORED_MOCK_USER_IDS = new Set(["cached-user", "mock-user-12345"]);

const VALID_DIRECTIONS = new Set<ConvoyDirection>(["outbound", "return"]);
const VALID_STATUSES = new Set<ConvoyVehicleStatus>([
  "moving",
  "jam",
  "rest",
  "arrived",
]);

function normalizeDirection(raw: string | null | undefined): ConvoyDirection {
  return raw === "return" ? "return" : "outbound";
}

function normalizeStatus(raw: string | null | undefined): ConvoyVehicleStatus {
  if (raw && VALID_STATUSES.has(raw as ConvoyVehicleStatus)) {
    return raw as ConvoyVehicleStatus;
  }
  return "moving";
}

function normalizePersonName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/[\s\u3000]+/g, "")
    .replace(/（.*?）|\(.*?\)/g, "")
    .trim()
    .toLowerCase();
}

function toJstDateKey(dateObj: Date): string {
  const jst = new Date(dateObj.getTime() + 9 * 3600_000);
  return jst.toISOString().slice(0, 10);
}

function clampFiniteNumber(
  val: unknown,
  min: number,
  max: number
): number | null {
  if (typeof val !== "number" || !Number.isFinite(val)) return null;
  if (val < min || val > max) return null;
  return val;
}

async function expandCandidateUserIds(
  db: ReturnType<typeof drizzle>,
  rawIds: Array<string | null | undefined>
): Promise<string[]> {
  const idSet = new Set<string>();
  for (const raw of rawIds) {
    const trimmed = raw?.trim();
    if (trimmed && !IGNORED_MOCK_USER_IDS.has(trimmed)) {
      idSet.add(trimmed);
    }
  }
  if (idSet.size === 0) return [];

  try {
    const initialIds = Array.from(idSet);
    const linkedRows = await db
      .select({ userId: account.userId, accountId: account.accountId })
      .from(account)
      .where(
        or(
          inArray(account.accountId, initialIds),
          inArray(account.userId, initialIds)
        )
      )
      .all();

    for (const row of linkedRows) {
      if (row.userId && !IGNORED_MOCK_USER_IDS.has(row.userId)) {
        idSet.add(row.userId);
      }
      if (row.accountId && !IGNORED_MOCK_USER_IDS.has(row.accountId)) {
        idSet.add(row.accountId);
      }
    }
  } catch {
    // ignore account lookup errors
  }

  return Array.from(idSet);
}

function resolveEnvGoogleMapsKey(env: WorkerEnv): string | null {
  const fromServer = (env.GOOGLE_MAPS_API_KEY || "").trim();
  if (fromServer) return fromServer;
  const fromPublic = (env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "").trim();
  if (fromPublic) return fromPublic;
  return null;
}

function buildDemoSnapshot(
  env: WorkerEnv,
  direction: ConvoyDirection
): ConvoySnapshotResponse {
  const now = Date.now();
  // デモ用：緩やかに進行する1〜3号車（多摩川緑地野球場周辺）
  const phase = ((now / 1000) % 120) / 120; // 0.0 -> 1.0 over 2 min
  const envKey = resolveEnvGoogleMapsKey(env);

  const stadium: ConvoyTargetLocationInfo = {
    name: "多摩川緑地野球場 第1駐車場",
    address: "神奈川県川崎市幸区小向仲野町",
    mapUrl: "https://www.google.com/maps/search/?api=1&query=35.5458,139.6895",
    directionsTarget: "35.5458,139.6895",
    latitude: 35.5458,
    longitude: 139.6895,
    parkingInfo: "河川敷第1駐車場（普通車5台まで駐車可）",
  };

  const school: ConvoyTargetLocationInfo = {
    name: "桜本小学校 正門前",
    address: "神奈川県川崎市川崎区桜本",
    mapUrl: "https://www.google.com/maps/search/?api=1&query=35.5182,139.7218",
    directionsTarget: "35.5182,139.7218",
    latitude: 35.5182,
    longitude: 139.7218,
    parkingInfo: null,
  };

  const fromPt = direction === "outbound" ? school : stadium;
  const toPt = direction === "outbound" ? stadium : school;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  const t1 = Math.min(0.92, 0.62 + phase * 0.25);
  const t2 = Math.min(0.82, 0.38 + phase * 0.22);

  const states: Record<string, ConvoyVehicleLiveState> = {
    "demo-cp-1": {
      carpoolId: "demo-cp-1",
      direction,
      isSharing: true,
      status: "moving",
      latitude: lerp(fromPt.latitude || 35.5182, toPt.latitude || 35.5458, t1),
      longitude: lerp(fromPt.longitude || 139.7218, toPt.longitude || 139.6895, t1),
      heading: 315,
      speedKmh: 38,
      accuracyM: 12,
      senderName: "佐藤 ママ",
      updatedAt: now - 3000,
    },
    "demo-cp-2": {
      carpoolId: "demo-cp-2",
      direction,
      isSharing: true,
      status: "jam",
      latitude: lerp(fromPt.latitude || 35.5182, toPt.latitude || 35.5458, t2),
      longitude: lerp(fromPt.longitude || 139.7218, toPt.longitude || 139.6895, t2) + 0.0022,
      heading: 310,
      speedKmh: 11,
      accuracyM: 15,
      senderName: "渡辺 パパ",
      updatedAt: now - 4000,
    },
    "demo-cp-3": {
      carpoolId: "demo-cp-3",
      direction,
      isSharing: false,
      status: "arrived",
      latitude: toPt.latitude,
      longitude: toPt.longitude,
      heading: null,
      speedKmh: 0,
      accuracyM: 10,
      senderName: "山下 監督",
      updatedAt: now - 180_000,
    },
  };

  return {
    success: true,
    isDemo: true,
    eventId: "demo-event-carpool",
    direction,
    serverTime: now,
    googleMapsApiKey: envKey,
    googleMapsKeySource: envKey ? "env" : "none",
    canConfigureMapsKey: false,
    myAssignedCarpoolId: "demo-cp-1",
    myDisplayName: "鈴木 パパ",
    destination: toPt,
    gatherPoint: fromPt,
    states,
  };
}

async function resolveTargetLocationFromVenueOrText(
  fallbackName: string,
  matchedVenue: {
    name: string;
    address: string | null;
    mapUrl: string | null;
    parkingInfo: string | null;
  } | null
): Promise<ConvoyTargetLocationInfo> {
  const displayName = (matchedVenue?.name || fallbackName || "目的地").trim();
  const rawMapUrl = matchedVenue?.mapUrl?.trim() || null;

  let expandedUrl: string | null = rawMapUrl;
  if (rawMapUrl) {
    expandedUrl = await expandGoogleMapsShortUrl(rawMapUrl);
  }

  const coords = expandedUrl ? extractLatLngFromGoogleMapsUrl(expandedUrl) : null;
  const targetFromUrl = expandedUrl ? extractDirectionsTargetFromUrl(expandedUrl) : "";
  const directionsTarget =
    targetFromUrl ||
    (coords ? `${coords.lat},${coords.lng}` : "") ||
    matchedVenue?.address?.trim() ||
    displayName;

  return {
    name: displayName,
    address: matchedVenue?.address || null,
    mapUrl: rawMapUrl,
    directionsTarget,
    latitude: coords?.lat ?? null,
    longitude: coords?.lng ?? null,
    parkingInfo: matchedVenue?.parkingInfo || null,
  };
}

/**
 * GET /api/liff/carpool-convoy
 * 遠征・隊列ライブマップの状態スナップショット取得（0書き込みロック・並列クエリ）
 */
liffCarpoolConvoyRouter.get("/", async (c) => {
  const teamId = (c.req.query("teamId") || "").trim();
  const eventIdParam = (c.req.query("eventId") || "").trim();
  const direction = normalizeDirection(c.req.query("direction"));
  const rawUserId = (c.req.query("userId") || "").trim();
  const rawUserName = (c.req.query("userName") || "").trim();

  if (!teamId || teamId === "demo-team" || eventIdParam === "demo-event-carpool") {
    return c.json(buildDemoSnapshot(c.env, direction));
  }

  try {
    await ensureAllSchemasOnce(c.env.DB);
    const db = drizzle(c.env.DB);
    const now = Date.now();

    const [
      teamRow,
      eventRows,
      allMembers,
      familyRows,
      allVenues,
      authSession,
    ] = await Promise.all([
      db
        .select({
          id: teams.id,
          organizationId: teams.organizationId,
          homeGround: teams.homeGround,
          orgGoogleMapsApiKey: organizations.googleMapsApiKey,
        })
        .from(teams)
        .leftJoin(organizations, eq(teams.organizationId, organizations.id))
        .where(eq(teams.id, teamId))
        .get(),
      eventIdParam
        ? db
            .select()
            .from(events)
            .where(and(eq(events.id, eventIdParam), eq(events.teamId, teamId)))
            .all()
        : db
            .select()
            .from(events)
            .where(eq(events.teamId, teamId))
            .orderBy(desc(events.startAt))
            .limit(15)
            .all(),
      db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId)).all(),
      db
        .select({
          parentId: parentChildRelations.parentId,
          childId: parentChildRelations.childId,
        })
        .from(parentChildRelations)
        .where(eq(parentChildRelations.teamId, teamId))
        .all()
        .catch(() => [] as Array<{ parentId: string; childId: string }>),
      db.select().from(venues).all().catch(() => []),
      getAuth(c.env.DB, c.env)
        .api.getSession({ headers: c.req.raw.headers })
        .catch(() => null),
    ]);

    if (!teamRow) {
      return c.json({ success: false, error: "Team not found" }, 404);
    }

    const targetEvent = eventRows[0] || null;
    const envKey = resolveEnvGoogleMapsKey(c.env);
    const orgKey = (teamRow.orgGoogleMapsApiKey || "").trim() || null;
    const effectiveMapsKey = envKey || orgKey;
    const mapsKeySource: "env" | "org" | "none" = envKey
      ? "env"
      : orgKey
      ? "org"
      : "none";

    // 本人照合 & 管理権限判定
    const sessionUser = authSession?.user as AuthUser | undefined;
    const expandedIds = await expandCandidateUserIds(db, [
      rawUserId,
      sessionUser?.id,
    ]);
    const candidateIdSet = new Set<string>(expandedIds);

    let matchedMember =
      allMembers.find(
        (m) => Boolean(m.userId && candidateIdSet.has(m.userId))
      ) || null;

    if (!matchedMember && (rawUserName || sessionUser?.name)) {
      const targetNormNames = [rawUserName, sessionUser?.name]
        .map((n) => normalizePersonName(n))
        .filter(Boolean);
      if (targetNormNames.length > 0) {
        matchedMember =
          allMembers.find((m) =>
            targetNormNames.includes(normalizePersonName(m.name))
          ) || null;
      }
    }

    let hasOrgAdminRole = false;
    if (teamRow.organizationId && expandedIds.length > 0) {
      const orgMemberRow = await db
        .select({ role: organizationMembers.role })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, teamRow.organizationId),
            inArray(organizationMembers.userId, expandedIds)
          )
        )
        .get()
        .catch(() => null);
      if (
        orgMemberRow?.role === "owner" ||
        orgMemberRow?.role === "admin" ||
        orgMemberRow?.role === "manager"
      ) {
        hasOrgAdminRole = true;
      }
    }

    const memberRole = (matchedMember?.role || "").toLowerCase();
    const canConfigureMapsKey =
      sessionUser?.role === "admin" ||
      hasOrgAdminRole ||
      canManageTeam(memberRole) ||
      memberRole === "owner" ||
      memberRole === "coach";

    const myDisplayName =
      matchedMember?.name?.trim() ||
      rawUserName ||
      sessionUser?.name?.trim() ||
      null;

    if (!targetEvent) {
      const emptyRes: ConvoySnapshotResponse = {
        success: true,
        isDemo: false,
        eventId: null,
        direction,
        serverTime: now,
        googleMapsApiKey: effectiveMapsKey,
        googleMapsKeySource: mapsKeySource,
        canConfigureMapsKey,
        myAssignedCarpoolId: null,
        myDisplayName,
        destination: null,
        gatherPoint: null,
        states: {},
      };
      return c.json(emptyRes);
    }

    const eventDateKey = toJstDateKey(new Date(targetEvent.startAt));

    const [carpoolsList, liveRows, sameDayMatches] = await Promise.all([
      db
        .select({
          id: eventCarpools.id,
          driverId: eventCarpools.driverId,
        })
        .from(eventCarpools)
        .where(eq(eventCarpools.eventId, targetEvent.id))
        .all(),
      db
        .select()
        .from(carpoolLiveLocations)
        .where(
          and(
            eq(carpoolLiveLocations.eventId, targetEvent.id),
            eq(carpoolLiveLocations.direction, direction)
          )
        )
        .all(),
      db
        .select({
          id: matches.id,
          venueId: matches.venueId,
          matchDayOps: matches.matchDayOps,
        })
        .from(matches)
        .where(and(eq(matches.teamId, teamId), eq(matches.date, eventDateKey)))
        .all()
        .catch(() => []),
    ]);

    const carpoolIds = carpoolsList.map((cp) => cp.id);
    const riderRows =
      carpoolIds.length > 0
        ? await db
            .select({
              carpoolId: eventCarpoolRiders.carpoolId,
              playerId: eventCarpoolRiders.playerId,
              memberId: eventCarpoolRiders.memberId,
            })
            .from(eventCarpoolRiders)
            .where(inArray(eventCarpoolRiders.carpoolId, carpoolIds))
            .all()
        : [];

    // 自分の乗車号車を自動推定（1: 運転手本人 -> 2: 同乗大人本人 -> 3: 子供が乗車している号車）
    let myAssignedCarpoolId: string | null = null;
    if (matchedMember) {
      const asDriver = carpoolsList.find(
        (cp) => cp.driverId === matchedMember.id
      );
      if (asDriver) {
        myAssignedCarpoolId = asDriver.id;
      } else {
        const asAdultRider = riderRows.find(
          (r) => r.memberId === matchedMember.id
        );
        if (asAdultRider) {
          myAssignedCarpoolId = asAdultRider.carpoolId;
        } else {
          const myChildIds = new Set(
            familyRows
              .filter((f) => f.parentId === matchedMember.id)
              .map((f) => f.childId)
          );
          if (myChildIds.size > 0) {
            const childRider = riderRows.find(
              (r) => Boolean(r.playerId && myChildIds.has(r.playerId))
            );
            if (childRider) {
              myAssignedCarpoolId = childRider.carpoolId;
            }
          }
        }
      }
    }

    // 球場・集合場所の位置解決（同日試合の venueId または名称一致）
    const primaryMatch = sameDayMatches[0] || null;
    const matchOps = primaryMatch
      ? parseMatchDayOpsJson(primaryMatch.matchDayOps)
      : null;

    const findVenueByName = (rawName: string | null | undefined) => {
      const trimmed = (rawName || "").trim();
      if (!trimmed) return null;
      const lower = trimmed.toLowerCase();
      return (
        allVenues.find(
          (v) =>
            v.name.trim().toLowerCase() === lower ||
            (v.shortName && v.shortName.trim().toLowerCase() === lower)
        ) ||
        allVenues.find(
          (v) =>
            lower.includes(v.name.trim().toLowerCase()) ||
            v.name.trim().toLowerCase().includes(lower)
        ) ||
        null
      );
    };

    const stadiumVenue =
      (primaryMatch?.venueId
        ? allVenues.find((v) => v.id === primaryMatch.venueId) || null
        : null) || findVenueByName(targetEvent.location);

    const rawGatherPlace =
      matchOps?.gatherPlace?.trim() ||
      teamRow.homeGround?.trim() ||
      targetEvent.location?.trim() ||
      "集合場所";
    const gatherVenue = findVenueByName(rawGatherPlace);

    const [stadiumTarget, gatherTarget] = await Promise.all([
      resolveTargetLocationFromVenueOrText(
        targetEvent.location || stadiumVenue?.name || "球場",
        stadiumVenue
      ),
      resolveTargetLocationFromVenueOrText(rawGatherPlace, gatherVenue),
    ]);

    const destination =
      direction === "outbound" ? stadiumTarget : gatherTarget;
    const gatherPoint =
      direction === "outbound" ? gatherTarget : stadiumTarget;

    // 有効な位置状態のみ返却（6時間超は自動失効、共有OFFかつ未到着は座標を完全マスク）
    const validCarpoolIdSet = new Set(carpoolIds);
    const states: Record<string, ConvoyVehicleLiveState> = {};

    for (const row of liveRows) {
      if (!validCarpoolIdSet.has(row.carpoolId)) continue;
      if (now - row.updatedAt > LIVE_LOCATION_TTL_MS) continue;

      const status = normalizeStatus(row.status);
      const isSharing = Boolean(row.isSharing) && status !== "arrived";
      const exposeCoords = isSharing || status === "arrived";

      states[row.carpoolId] = {
        carpoolId: row.carpoolId,
        direction,
        isSharing,
        status,
        latitude: exposeCoords ? row.latitude ?? null : null,
        longitude: exposeCoords ? row.longitude ?? null : null,
        heading: isSharing ? row.heading ?? null : null,
        speedKmh: isSharing ? row.speedKmh ?? null : null,
        accuracyM: exposeCoords ? row.accuracyM ?? null : null,
        senderName: row.senderName || null,
        updatedAt: row.updatedAt,
      };
    }

    const responsePayload: ConvoySnapshotResponse = {
      success: true,
      isDemo: false,
      eventId: targetEvent.id,
      direction,
      serverTime: now,
      googleMapsApiKey: effectiveMapsKey,
      googleMapsKeySource: mapsKeySource,
      canConfigureMapsKey,
      myAssignedCarpoolId,
      myDisplayName,
      destination,
      gatherPoint,
      states,
    };

    return c.json(responsePayload);
  } catch (error) {
    console.error("[GET /api/liff/carpool-convoy] Error:", error);
    return c.json(
      { success: false, error: "隊列マップ情報の取得に失敗しました" },
      500
    );
  }
});

/**
 * PUT /api/liff/carpool-convoy/location
 * 号車の現在地・ワンタップ状況スタンプ・位置共有ON/OFFのリアルタイム更新
 */
liffCarpoolConvoyRouter.put("/location", async (c) => {
  try {
    const body = (await c.req.json()) as Partial<ConvoyLocationUpdatePayload>;
    const teamId = (body.teamId || "").trim();
    const eventId = (body.eventId || "").trim();
    const carpoolId = (body.carpoolId || "").trim();
    const direction: ConvoyDirection =
      body.direction && VALID_DIRECTIONS.has(body.direction)
        ? body.direction
        : "outbound";
    const status = normalizeStatus(body.status);

    if (!teamId || !eventId || !carpoolId) {
      return c.json({ success: false, error: "必須パラメータが不足しています" }, 400);
    }

    if (teamId === "demo-team" || eventId === "demo-event-carpool") {
      const now = Date.now();
      const effectiveSharing = Boolean(body.isSharing) && status !== "arrived";
      const demoState: ConvoyVehicleLiveState = {
        carpoolId,
        direction,
        isSharing: effectiveSharing,
        status,
        latitude:
          body.clearLocation || (!effectiveSharing && status !== "arrived")
            ? null
            : clampFiniteNumber(body.latitude, -90, 90),
        longitude:
          body.clearLocation || (!effectiveSharing && status !== "arrived")
            ? null
            : clampFiniteNumber(body.longitude, -180, 180),
        heading: clampFiniteNumber(body.heading, 0, 360),
        speedKmh: clampFiniteNumber(body.speedKmh, 0, 300),
        accuracyM: clampFiniteNumber(body.accuracyM, 0, 10000),
        senderName: (body.userName || "デモメンバー").trim(),
        updatedAt: now,
      };
      return c.json({ success: true, state: demoState, serverTime: now });
    }

    await ensureAllSchemasOnce(c.env.DB);
    const db = drizzle(c.env.DB);

    const rowId = `${carpoolId}:${direction}`;

    // イベント＆配車枠が指定チームに属していることを厳密に検証
    const [carpoolCheck, existingRow] = await Promise.all([
      db
        .select({
          carpoolId: eventCarpools.id,
          eventTeamId: events.teamId,
        })
        .from(eventCarpools)
        .innerJoin(events, eq(eventCarpools.eventId, events.id))
        .where(
          and(
            eq(eventCarpools.id, carpoolId),
            eq(eventCarpools.eventId, eventId),
            eq(events.teamId, teamId)
          )
        )
        .get(),
      db
        .select()
        .from(carpoolLiveLocations)
        .where(eq(carpoolLiveLocations.id, rowId))
        .get(),
    ]);

    if (!carpoolCheck) {
      return c.json({ success: false, error: "対象の配車枠が見つかりません" }, 404);
    }

    const now = Math.max(Date.now(), (existingRow?.updatedAt ?? 0) + 1);
    const effectiveSharing = Boolean(body.isSharing) && status !== "arrived";
    const shouldWipeCoords =
      Boolean(body.clearLocation) || (!effectiveSharing && status !== "arrived");

    const incomingLat = clampFiniteNumber(body.latitude, -90, 90);
    const incomingLng = clampFiniteNumber(body.longitude, -180, 180);

    const nextLat = shouldWipeCoords
      ? null
      : incomingLat ?? existingRow?.latitude ?? null;
    const nextLng = shouldWipeCoords
      ? null
      : incomingLng ?? existingRow?.longitude ?? null;
    const nextHeading = shouldWipeCoords
      ? null
      : clampFiniteNumber(body.heading, 0, 360) ?? existingRow?.heading ?? null;
    const nextSpeed = shouldWipeCoords
      ? null
      : clampFiniteNumber(body.speedKmh, 0, 300) ?? existingRow?.speedKmh ?? null;
    const nextAccuracy = shouldWipeCoords
      ? null
      : clampFiniteNumber(body.accuracyM, 0, 10000) ??
        existingRow?.accuracyM ??
        null;

    const senderName =
      (body.userName || "").trim().slice(0, 40) ||
      existingRow?.senderName ||
      null;
    const senderUserId =
      (body.userId || "").trim().slice(0, 80) ||
      existingRow?.senderUserId ||
      null;

    await db
      .insert(carpoolLiveLocations)
      .values({
        id: rowId,
        teamId,
        eventId,
        carpoolId,
        direction,
        isSharing: effectiveSharing,
        status,
        latitude: nextLat,
        longitude: nextLng,
        heading: nextHeading,
        speedKmh: nextSpeed,
        accuracyM: nextAccuracy,
        senderUserId,
        senderName,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: carpoolLiveLocations.id,
        set: {
          isSharing: effectiveSharing,
          status,
          latitude: nextLat,
          longitude: nextLng,
          heading: nextHeading,
          speedKmh: nextSpeed,
          accuracyM: nextAccuracy,
          senderUserId,
          senderName,
          updatedAt: now,
        },
      });

    const savedState: ConvoyVehicleLiveState = {
      carpoolId,
      direction,
      isSharing: effectiveSharing,
      status,
      latitude: nextLat,
      longitude: nextLng,
      heading: effectiveSharing ? nextHeading : null,
      speedKmh: effectiveSharing ? nextSpeed : null,
      accuracyM: nextAccuracy,
      senderName,
      updatedAt: now,
    };

    return c.json({
      success: true,
      state: savedState,
      serverTime: now,
    });
  } catch (error) {
    console.error("[PUT /api/liff/carpool-convoy/location] Error:", error);
    return c.json(
      { success: false, error: "位置情報の更新に失敗しました" },
      500
    );
  }
});

/**
 * PUT /api/liff/carpool-convoy/maps-key
 * クラブ共通 Google Maps JavaScript API キーの保存・解除（管理者・指導者のみ）
 */
liffCarpoolConvoyRouter.put("/maps-key", async (c) => {
  try {
    const body = (await c.req.json()) as {
      teamId?: string;
      apiKey?: string;
      userId?: string | null;
    };
    const teamId = (body.teamId || "").trim();
    const cleanedKey = (body.apiKey || "").trim();
    const rawUserId = (body.userId || "").trim();

    if (!teamId || teamId === "demo-team") {
      return c.json(
        { success: false, error: "デモチームではAPIキーを保存できません" },
        400
      );
    }

    if (cleanedKey && !/^AIza[0-9A-Za-z_-]{25,70}$/.test(cleanedKey)) {
      return c.json(
        {
          success: false,
          error:
            "Google Maps APIキーの形式が正しくありません（「AIza」から始まるキーを入力してください）",
        },
        400
      );
    }

    await ensureAllSchemasOnce(c.env.DB);
    const db = drizzle(c.env.DB);

    const [teamRow, allMembers, authSession] = await Promise.all([
      db
        .select({
          id: teams.id,
          organizationId: teams.organizationId,
        })
        .from(teams)
        .where(eq(teams.id, teamId))
        .get(),
      db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId)).all(),
      getAuth(c.env.DB, c.env)
        .api.getSession({ headers: c.req.raw.headers })
        .catch(() => null),
    ]);

    if (!teamRow || !teamRow.organizationId) {
      return c.json({ success: false, error: "チーム組織が見つかりません" }, 404);
    }

    const sessionUser = authSession?.user as AuthUser | undefined;
    const expandedIds = await expandCandidateUserIds(db, [
      rawUserId,
      sessionUser?.id,
    ]);
    const candidateIdSet = new Set<string>(expandedIds);

    const matchedMember =
      allMembers.find(
        (m) => Boolean(m.userId && candidateIdSet.has(m.userId))
      ) || null;

    let hasOrgAdminRole = false;
    if (expandedIds.length > 0) {
      const orgMemberRow = await db
        .select({ role: organizationMembers.role })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, teamRow.organizationId),
            inArray(organizationMembers.userId, expandedIds)
          )
        )
        .get()
        .catch(() => null);
      if (
        orgMemberRow?.role === "owner" ||
        orgMemberRow?.role === "admin" ||
        orgMemberRow?.role === "manager"
      ) {
        hasOrgAdminRole = true;
      }
    }

    const memberRole = (matchedMember?.role || "").toLowerCase();
    const allowed =
      sessionUser?.role === "admin" ||
      hasOrgAdminRole ||
      canManageTeam(memberRole) ||
      memberRole === "owner" ||
      memberRole === "coach";

    if (!allowed) {
      return c.json(
        { success: false, error: "APIキーの設定には管理者・指導者権限が必要です" },
        403
      );
    }

    await db
      .update(organizations)
      .set({ googleMapsApiKey: cleanedKey || null })
      .where(eq(organizations.id, teamRow.organizationId));

    const envKey = resolveEnvGoogleMapsKey(c.env);
    return c.json({
      success: true,
      googleMapsApiKey: envKey || cleanedKey || null,
      googleMapsKeySource: envKey ? "env" : cleanedKey ? "org" : "none",
    });
  } catch (error) {
    console.error("[PUT /api/liff/carpool-convoy/maps-key] Error:", error);
    return c.json(
      { success: false, error: "APIキーの保存に失敗しました" },
      500
    );
  }
});

export default liffCarpoolConvoyRouter;

