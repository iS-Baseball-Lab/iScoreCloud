// filepath: src/api/liff/baseball-board.ts
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import * as schema from "@/db/schema";
import { resolveCallerTeamAccess, type CallerTeamAccess } from "@/lib/team-access";
import {
  applyPlayOutcome,
  buildRotatedTeamLineupFromRoster,
  buildTeamLineupFromRoster,
  createInitialMatchState,
  type BaseballBoardMatchState,
  type BatterStance,
  type PitchCourse,
  type PitchSpec,
  type PitchSpeedPreset,
  type PitchType,
  type PlayOutcomeCode,
  type RawRosterPlayerCandidate,
} from "@/lib/liff/baseball-board-engine";
import type { WorkerEnv } from "@/types/api";
import type {
  OnlineBatterReplayContact,
  OnlineCurrentPitchPayload,
  OnlineLastPlayPayload,
  OnlineParticipantRole,
  OnlinePlayReplayData,
  OnlineResolvedPlayPayload,
  OnlineRoomDetail,
  OnlineRoomStatus,
  OnlineRoomSummary,
  OnlineTeamSide,
} from "@/types/baseball-board-online";

const liffBaseballBoardRouter = new Hono<{ Bindings: WorkerEnv }>();

const { baseballBoardRooms, players, teamMembers } = schema;

/** 古いルームの自動削除期限（12時間） */
const ROOM_EXPIRE_CLEANUP_MS = 12 * 60 * 60 * 1000;
/** 待機中ルームが一覧に表示される有効期限（45分） */
const WAITING_ROOM_VISIBLE_TTL_MS = 45 * 60 * 1000;
/** 対戦中ルームがマイ進行中一覧に表示される有効期限（3時間） */
const PLAYING_ROOM_VISIBLE_TTL_MS = 3 * 60 * 60 * 1000;
/** 相手のオンライン判定閾値（18秒） */
const ONLINE_PRESENCE_TTL_MS = 18_000;
/** ハートビートDB更新の間引き間隔（4.5秒） */
const HEARTBEAT_WRITE_THROTTLE_MS = 4_500;
/** 投球後に打者が無応答（アプリ閉じ等）の場合にやり直しを許可する秒数（25秒） */
const STUCK_PITCH_RETRY_MS = 25_000;

const VALID_INNINGS = new Set<number>([1, 3, 5, 7]);
const VALID_PITCH_TYPES = new Set<PitchType>([
  "straight",
  "curve",
  "shoot",
  "changeup",
  "vanish",
]);
const VALID_COURSES = new Set<PitchCourse>(["inside", "middle", "outside"]);
const VALID_SPEED_PRESETS = new Set<PitchSpeedPreset>([
  "slow",
  "normal",
  "fast",
  "monster",
]);
const VALID_STANCES = new Set<BatterStance>(["contact", "power", "bunt"]);
const VALID_OUTCOMES = new Set<PlayOutcomeCode>([
  "ball",
  "called_strike",
  "swinging_strike",
  "foul",
  "three_bunt_out",
  "walk",
  "strikeout",
  "ground_out",
  "fly_out",
  "sac_fly",
  "sac_bunt",
  "double_play",
  "single",
  "double",
  "triple",
  "homerun",
]);

type RoomRow = typeof baseballBoardRooms.$inferSelect;

function sanitizeDisplayName(raw: unknown, fallback = "メンバー"): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.replace(/[\r\n\t]+/g, " ").trim().slice(0, 18);
  return trimmed || fallback;
}

function formatSquadTitle(playerName: string): string {
  const clean = sanitizeDisplayName(playerName, "メンバー");
  if (
    clean.endsWith("ナイン") ||
    clean.endsWith("軍") ||
    clean.endsWith("チーム") ||
    clean.endsWith("ズ")
  ) {
    return clean;
  }
  return `${clean}ナイン`;
}

function parseJsonSafe<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function clampFinite(val: unknown, min: number, max: number, fallback: number): number {
  if (typeof val !== "number" || !Number.isFinite(val)) return fallback;
  return Math.min(max, Math.max(min, val));
}

function sanitizeReplayContact(raw: unknown): OnlineBatterReplayContact | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.vx !== "number" || typeof r.vy !== "number") return null;
  return {
    ballX: clampFinite(r.ballX, 0, 400, 200),
    ballY: clampFinite(r.ballY, 200, 420, 382),
    vx: clampFinite(r.vx, -900, 900, 0),
    vy: clampFinite(r.vy, -900, 900, -260),
    vz: clampFinite(r.vz, -400, 600, 0),
    peakZ: clampFinite(r.peakZ, 0, 250, 0),
    exitVelocityKmh: Math.round(clampFinite(r.exitVelocityKmh, 0, 220, 120)),
  };
}

function sanitizeReplayData(raw: unknown): OnlinePlayReplayData {
  if (!raw || typeof raw !== "object") {
    return {
      didSwing: false,
      swingTriggerY: 382,
      stance: "contact",
      contact: null,
    };
  }
  const r = raw as Record<string, unknown>;
  const rawStance = typeof r.stance === "string" ? (r.stance as BatterStance) : "contact";
  return {
    didSwing: r.didSwing === true,
    swingTriggerY: clampFinite(r.swingTriggerY, 220, 425, 382),
    stance: VALID_STANCES.has(rawStance) ? rawStance : "contact",
    whiffDetail:
      typeof r.whiffDetail === "string" ? r.whiffDetail.slice(0, 40) : undefined,
    contact: sanitizeReplayContact(r.contact),
  };
}

function sanitizeResolvedPlay(raw: unknown): OnlineResolvedPlayPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const outcome =
    typeof r.outcome === "string" ? (r.outcome as PlayOutcomeCode) : null;
  if (!outcome || !VALID_OUTCOMES.has(outcome)) return null;
  const detailLabel =
    typeof r.detailLabel === "string" && r.detailLabel.trim()
      ? r.detailLabel.trim().slice(0, 48)
      : outcome;
  return {
    outcome,
    detailLabel,
    usedVanishPitch: r.usedVanishPitch === true,
    pitchKmh: Math.round(clampFinite(r.pitchKmh, 40, 200, 115)),
    exitVelocityKmh: Math.round(clampFinite(r.exitVelocityKmh, 0, 230, 0)),
  };
}

async function resolveCallerDisplayNameInTeam(
  db: ReturnType<typeof drizzle>,
  teamId: string,
  access: CallerTeamAccess
): Promise<string> {
  const candidateIds = access.candidateUserIds;
  if (candidateIds.length > 0) {
    const [memberRow, playerRow] = await Promise.all([
      db
        .select({ name: teamMembers.name })
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, teamId),
            inArray(teamMembers.userId, candidateIds)
          )
        )
        .get(),
      db
        .select({ name: players.name })
        .from(players)
        .where(
          and(eq(players.teamId, teamId), inArray(players.userId, candidateIds))
        )
        .get(),
    ]);
    if (playerRow?.name?.trim()) return sanitizeDisplayName(playerRow.name);
    if (memberRow?.name?.trim()) return sanitizeDisplayName(memberRow.name);
  }
  return sanitizeDisplayName(
    access.primaryUserName || access.sessionUser?.name,
    "メンバー"
  );
}

async function loadTeamRosterCandidates(
  db: ReturnType<typeof drizzle>,
  teamId: string
): Promise<RawRosterPlayerCandidate[]> {
  const rows = await db
    .select({
      id: players.id,
      name: players.name,
      uniformNumber: players.uniformNumber,
      bats: players.bats,
      primaryPosition: players.primaryPosition,
      conditionStatus: players.conditionStatus,
      isActive: players.isActive,
    })
    .from(players)
    .where(eq(players.teamId, teamId))
    .all();
  return rows;
}

function resolveParticipantRole(
  row: RoomRow,
  access: CallerTeamAccess
): OnlineParticipantRole {
  const idSet = new Set(access.candidateUserIds);
  if (access.primaryUserId) idSet.add(access.primaryUserId);
  if (idSet.has(row.hostUserId)) return "host";
  if (row.guestUserId && idSet.has(row.guestUserId)) return "guest";
  return "spectator";
}

function buildRoomDetailForCaller(
  row: RoomRow,
  access: CallerTeamAccess,
  fallbackMyName: string,
  nowMs: number
): OnlineRoomDetail | null {
  const parsedMatch = parseJsonSafe<BaseballBoardMatchState>(row.matchStateJson);
  if (!parsedMatch) return null;

  const myRole = resolveParticipantRole(row, access);
  const hostSide: OnlineTeamSide = row.hostSide === "home" ? "home" : "away";
  const guestSide: OnlineTeamSide = hostSide === "away" ? "home" : "away";
  const mySide: OnlineTeamSide | null =
    myRole === "host" ? hostSide : myRole === "guest" ? guestSide : null;

  const adjustedMatchState: BaseballBoardMatchState = {
    ...parsedMatch,
    mode: "online",
    playerSide: mySide ?? hostSide,
  };

  const currentPitch =
    row.pitchSeq === row.turnSeq
      ? parseJsonSafe<OnlineCurrentPitchPayload>(row.currentPitchJson)
      : null;
  const lastPlay = parseJsonSafe<OnlineLastPlayPayload>(row.lastPlayJson);

  const opponentLastSeen =
    myRole === "host"
      ? row.guestLastSeenAt
      : myRole === "guest"
      ? row.hostLastSeenAt
      : Math.max(row.hostLastSeenAt, row.guestLastSeenAt ?? 0);

  const opponentOnline =
    typeof opponentLastSeen === "number" &&
    nowMs - opponentLastSeen <= ONLINE_PRESENCE_TTL_MS;

  const canRetryStuckPitch =
    row.status === "playing" &&
    row.pitchSeq === row.turnSeq &&
    currentPitch !== null &&
    nowMs - currentPitch.thrownAtMs >= STUCK_PITCH_RETRY_MS;

  const rematchReq =
    row.rematchRequestedBy === "host" || row.rematchRequestedBy === "guest"
      ? row.rematchRequestedBy
      : null;

  return {
    id: row.id,
    teamId: row.teamId,
    roomCode: row.roomCode,
    status: row.status as OnlineRoomStatus,
    totalInnings: row.totalInnings,
    hostName: row.hostName,
    hostSide,
    guestName: row.guestName ?? null,
    myRole,
    mySide,
    myDisplayName:
      myRole === "host"
        ? row.hostName
        : myRole === "guest"
        ? row.guestName || fallbackMyName
        : fallbackMyName,
    opponentName:
      myRole === "host"
        ? row.guestName ?? null
        : myRole === "guest"
        ? row.hostName
        : null,
    opponentOnline,
    turnSeq: row.turnSeq,
    pitchSeq: row.pitchSeq,
    canRetryStuckPitch,
    rematchRequestedBy: rematchReq,
    currentPitch,
    lastPlay,
    matchState: adjustedMatchState,
    updatedAt: row.updatedAt,
  };
}

function buildRoomSummaryForCaller(
  row: RoomRow,
  access: CallerTeamAccess
): OnlineRoomSummary | null {
  const parsedMatch = parseJsonSafe<BaseballBoardMatchState>(row.matchStateJson);
  if (!parsedMatch) return null;
  const myRole = resolveParticipantRole(row, access);
  const isMine = myRole === "host" || myRole === "guest";
  const hostSide: OnlineTeamSide = row.hostSide === "home" ? "home" : "away";
  return {
    id: row.id,
    teamId: row.teamId,
    roomCode: row.roomCode,
    status: row.status as OnlineRoomStatus,
    totalInnings: row.totalInnings,
    hostName: row.hostName,
    hostSide,
    guestName: row.guestName ?? null,
    awayScore: parsedMatch.awayScore,
    homeScore: parsedMatch.homeScore,
    inning: parsedMatch.inning,
    isTop: parsedMatch.isTop,
    isMine,
    canJoin: row.status === "waiting" && !row.guestUserId && myRole !== "host",
    updatedAt: row.updatedAt,
  };
}

async function generateUniqueRoomCode(
  db: ReturnType<typeof drizzle>,
  teamId: string
): Promise<string> {
  const activeRows = await db
    .select({ roomCode: baseballBoardRooms.roomCode })
    .from(baseballBoardRooms)
    .where(
      and(
        eq(baseballBoardRooms.teamId, teamId),
        inArray(baseballBoardRooms.status, ["waiting", "playing"])
      )
    )
    .all();
  const used = new Set(activeRows.map((r) => r.roomCode));
  for (let i = 0; i < 25; i++) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    if (!used.has(code)) return code;
  }
  return String(Math.floor(1000 + Math.random() * 9000));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. GET /rooms?teamId=... （チーム内ロビー一覧取得）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
liffBaseballBoardRouter.get("/rooms", async (c) => {
  try {
    const teamId = (c.req.query("teamId") || "").trim();
    const access = await resolveCallerTeamAccess(c);
    if (!access.primaryUserId) {
      return c.json(
        { success: false, error: "ログイン情報の確認が必要です" },
        401
      );
    }
    if (!teamId || teamId === "demo-team" || !access.canAccessTeam(teamId)) {
      return c.json(
        {
          success: false,
          error: "承認済みの所属チームでのみオンライン対戦を利用できます",
          isForbidden: true,
        },
        403
      );
    }

    const db = drizzle(c.env.DB);
    const nowMs = Date.now();

    // 古い終了・放置ルームの非同期クリーンアップ（レスポンスを一切ブロックしない）
    c.executionCtx.waitUntil(
      db
        .delete(baseballBoardRooms)
        .where(lt(baseballBoardRooms.updatedAt, nowMs - ROOM_EXPIRE_CLEANUP_MS))
        .run()
        .catch(() => {})
    );

    const [myDefaultName, roomRows] = await Promise.all([
      resolveCallerDisplayNameInTeam(db, teamId, access),
      db
        .select()
        .from(baseballBoardRooms)
        .where(
          and(
            eq(baseballBoardRooms.teamId, teamId),
            inArray(baseballBoardRooms.status, ["waiting", "playing"])
          )
        )
        .orderBy(desc(baseballBoardRooms.updatedAt))
        .limit(24)
        .all(),
    ]);

    const summaries: OnlineRoomSummary[] = [];
    for (const row of roomRows) {
      const summary = buildRoomSummaryForCaller(row, access);
      if (!summary) continue;
      const age = nowMs - row.updatedAt;
      if (row.status === "waiting" && age <= WAITING_ROOM_VISIBLE_TTL_MS) {
        summaries.push(summary);
      } else if (
        row.status === "playing" &&
        summary.isMine &&
        age <= PLAYING_ROOM_VISIBLE_TTL_MS
      ) {
        summaries.push(summary);
      }
    }

    return c.json({
      success: true,
      myDefaultName,
      rooms: summaries,
    });
  } catch (error: unknown) {
    console.error("[BaseballBoard GET /rooms Error]:", error);
    return c.json(
      { success: false, error: "対戦ロビーの取得に失敗しました" },
      500
    );
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. POST /rooms （対戦ルームの新規作成）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
liffBaseballBoardRouter.post("/rooms", async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const teamId = typeof body.teamId === "string" ? body.teamId.trim() : "";
    const access = await resolveCallerTeamAccess(c);
    if (!access.primaryUserId) {
      return c.json(
        { success: false, error: "ログイン情報の確認が必要です" },
        401
      );
    }
    if (!teamId || teamId === "demo-team" || !access.canAccessTeam(teamId)) {
      return c.json(
        {
          success: false,
          error: "このチームで対戦ルームを作成する権限がありません",
          isForbidden: true,
        },
        403
      );
    }

    const rawInnings =
      typeof body.totalInnings === "number" ? body.totalInnings : 3;
    const totalInnings = VALID_INNINGS.has(rawInnings) ? rawInnings : 3;
    const hostBatsFirst = body.hostBatsFirst !== false;
    const hostSide: OnlineTeamSide = hostBatsFirst ? "away" : "home";

    const db = drizzle(c.env.DB);
    const [defaultName, rosterCandidates, roomCode] = await Promise.all([
      resolveCallerDisplayNameInTeam(db, teamId, access),
      loadTeamRosterCandidates(db, teamId),
      generateUniqueRoomCode(db, teamId),
    ]);

    const hostName = sanitizeDisplayName(body.hostDisplayName, defaultName);

    // 自分が過去に作った未開始の古い waiting ルームがあればクローズして重複乱立を防止
    await db
      .update(baseballBoardRooms)
      .set({ status: "closed", updatedAt: Date.now() })
      .where(
        and(
          eq(baseballBoardRooms.teamId, teamId),
          eq(baseballBoardRooms.hostUserId, access.primaryUserId),
          eq(baseballBoardRooms.status, "waiting")
        )
      )
      .run();

    const hostLineup = buildTeamLineupFromRoster(rosterCandidates);
    const guestPlaceholderLineup = buildRotatedTeamLineupFromRoster(
      rosterCandidates,
      4
    );

    const initialState = createInitialMatchState({
      mode: "online",
      totalInnings,
      difficulty: "normal",
      myTeamName: formatSquadTitle(hostName),
      myLineup: hostLineup,
      oppTeamName: "対戦相手待ち…",
      oppLineup: guestPlaceholderLineup,
      playerIsHome: hostSide === "home",
    });
    initialState.lastCallout = `ルーム #${roomCode} 作成完了！チームメンバーの参加を待っています…`;

    const nowMs = Date.now();
    const roomId = crypto.randomUUID();
    const insertedRow: RoomRow = {
      id: roomId,
      teamId,
      roomCode,
      status: "waiting",
      totalInnings,
      hostUserId: access.primaryUserId,
      hostName,
      hostSide,
      guestUserId: null,
      guestName: null,
      turnSeq: 1,
      pitchSeq: 0,
      currentPitchJson: null,
      lastPlayJson: null,
      matchStateJson: JSON.stringify(initialState),
      rematchRequestedBy: null,
      hostLastSeenAt: nowMs,
      guestLastSeenAt: null,
      createdAt: nowMs,
      updatedAt: nowMs,
    };

    await db.insert(baseballBoardRooms).values(insertedRow).run();

    const detail = buildRoomDetailForCaller(
      insertedRow,
      access,
      hostName,
      nowMs
    );
    return c.json({ success: true, room: detail });
  } catch (error: unknown) {
    console.error("[BaseballBoard POST /rooms Error]:", error);
    return c.json(
      { success: false, error: "対戦ルームの作成に失敗しました" },
      500
    );
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. POST /rooms/join （ルームIDまたは4桁コードで参加）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
liffBaseballBoardRouter.post("/rooms/join", async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const explicitTeamId =
      typeof body.teamId === "string" ? body.teamId.trim() : "";
    const roomId = typeof body.roomId === "string" ? body.roomId.trim() : "";
    const roomCode =
      typeof body.roomCode === "string"
        ? body.roomCode.replace(/[^0-9]/g, "").trim()
        : "";

    const access = await resolveCallerTeamAccess(c);
    if (!access.primaryUserId) {
      return c.json(
        { success: false, error: "ログイン情報の確認が必要です" },
        401
      );
    }

    const db = drizzle(c.env.DB);
    let targetRoom: RoomRow | undefined;

    if (roomId) {
      targetRoom = await db
        .select()
        .from(baseballBoardRooms)
        .where(eq(baseballBoardRooms.id, roomId))
        .get();
    } else if (roomCode && explicitTeamId) {
      targetRoom = await db
        .select()
        .from(baseballBoardRooms)
        .where(
          and(
            eq(baseballBoardRooms.teamId, explicitTeamId),
            eq(baseballBoardRooms.roomCode, roomCode),
            inArray(baseballBoardRooms.status, ["waiting", "playing"])
          )
        )
        .orderBy(desc(baseballBoardRooms.updatedAt))
        .get();
    }

    if (!targetRoom) {
      return c.json(
        {
          success: false,
          error: roomCode
            ? `ルーム番号「${roomCode}」の募集中ルームが見つかりません`
            : "指定された対戦ルームは終了したか存在しません",
        },
        404
      );
    }

    // 厳格チーム境界検証：必ずそのルームの所属チームの承認済みメンバーであること
    if (
      targetRoom.teamId === "demo-team" ||
      !access.canAccessTeam(targetRoom.teamId)
    ) {
      return c.json(
        {
          success: false,
          error: "同じチームの承認済みメンバーのみ参加できます",
          isForbidden: true,
        },
        403
      );
    }

    const nowMs = Date.now();
    const defaultName = await resolveCallerDisplayNameInTeam(
      db,
      targetRoom.teamId,
      access
    );
    const callerName = sanitizeDisplayName(body.guestDisplayName, defaultName);
    const existingRole = resolveParticipantRole(targetRoom, access);

    // 既にホスト本人または参加済みゲスト本人の場合はそのまま再接続
    if (existingRole === "host" || existingRole === "guest") {
      if (existingRole === "host") {
        await db
          .update(baseballBoardRooms)
          .set({ hostLastSeenAt: nowMs })
          .where(eq(baseballBoardRooms.id, targetRoom.id))
          .run();
        targetRoom.hostLastSeenAt = nowMs;
      } else {
        await db
          .update(baseballBoardRooms)
          .set({ guestLastSeenAt: nowMs })
          .where(eq(baseballBoardRooms.id, targetRoom.id))
          .run();
        targetRoom.guestLastSeenAt = nowMs;
      }
      const detail = buildRoomDetailForCaller(
        targetRoom,
        access,
        callerName,
        nowMs
      );
      return c.json({ success: true, room: detail });
    }

    if (targetRoom.status !== "waiting" || targetRoom.guestUserId) {
      // 既に別メンバー同士で対戦中なら観戦モードとして返すことも可能だが、満員時は分かりやすく案内しつつルーム状態を返却
      const detail = buildRoomDetailForCaller(
        targetRoom,
        access,
        callerName,
        nowMs
      );
      if (targetRoom.status === "closed") {
        return c.json(
          { success: false, error: "この対戦ルームは既に閉じられています" },
          409
        );
      }
      return c.json({ success: true, room: detail });
    }

    // 新規ゲストとして参加確定 ➔ プレイボール！
    const rosterCandidates = await loadTeamRosterCandidates(
      db,
      targetRoom.teamId
    );
    const hostLineup = buildTeamLineupFromRoster(rosterCandidates);
    const guestLineup = buildRotatedTeamLineupFromRoster(rosterCandidates, 4);
    const hostIsHome = targetRoom.hostSide === "home";

    const matchState = createInitialMatchState({
      mode: "online",
      totalInnings: targetRoom.totalInnings,
      difficulty: "normal",
      myTeamName: formatSquadTitle(targetRoom.hostName),
      myLineup: hostLineup,
      oppTeamName: formatSquadTitle(callerName),
      oppLineup: guestLineup,
      playerIsHome: hostIsHome,
    });
    matchState.lastCallout = `🔥 ${targetRoom.hostName} vs ${callerName} プレイボール！！`;

    await db
      .update(baseballBoardRooms)
      .set({
        status: "playing",
        guestUserId: access.primaryUserId,
        guestName: callerName,
        guestLastSeenAt: nowMs,
        turnSeq: 1,
        pitchSeq: 0,
        currentPitchJson: null,
        lastPlayJson: null,
        rematchRequestedBy: null,
        matchStateJson: JSON.stringify(matchState),
        updatedAt: nowMs,
      })
      .where(
        and(
          eq(baseballBoardRooms.id, targetRoom.id),
          eq(baseballBoardRooms.status, "waiting")
        )
      )
      .run();

    const updatedRow = await db
      .select()
      .from(baseballBoardRooms)
      .where(eq(baseballBoardRooms.id, targetRoom.id))
      .get();

    if (!updatedRow) {
      return c.json(
        { success: false, error: "対戦ルームの開始処理に失敗しました" },
        500
      );
    }

    const detail = buildRoomDetailForCaller(
      updatedRow,
      access,
      callerName,
      nowMs
    );
    return c.json({ success: true, room: detail });
  } catch (error: unknown) {
    console.error("[BaseballBoard POST /rooms/join Error]:", error);
    return c.json(
      { success: false, error: "対戦ルームへの参加に失敗しました" },
      500
    );
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. GET /rooms/:roomId （状態ポーリング ＋ 省負荷ハートビート）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
liffBaseballBoardRouter.get("/rooms/:roomId", async (c) => {
  try {
    const roomId = (c.req.param("roomId") || "").trim();
    const access = await resolveCallerTeamAccess(c);
    if (!access.primaryUserId) {
      return c.json(
        { success: false, error: "ログイン情報の確認が必要です" },
        401
      );
    }

    const db = drizzle(c.env.DB);
    const row = await db
      .select()
      .from(baseballBoardRooms)
      .where(eq(baseballBoardRooms.id, roomId))
      .get();

    if (!row) {
      return c.json(
        { success: false, error: "対戦ルームは終了したか存在しません" },
        404
      );
    }

    if (row.teamId === "demo-team" || !access.canAccessTeam(row.teamId)) {
      return c.json(
        {
          success: false,
          error: "この対戦ルームへのアクセス権限がありません",
          isForbidden: true,
        },
        403
      );
    }

    const nowMs = Date.now();
    const role = resolveParticipantRole(row, access);
    if (
      role === "host" &&
      nowMs - row.hostLastSeenAt >= HEARTBEAT_WRITE_THROTTLE_MS
    ) {
      row.hostLastSeenAt = nowMs;
      c.executionCtx.waitUntil(
        db
          .update(baseballBoardRooms)
          .set({ hostLastSeenAt: nowMs })
          .where(eq(baseballBoardRooms.id, row.id))
          .run()
          .catch(() => {})
      );
    } else if (
      role === "guest" &&
      nowMs - (row.guestLastSeenAt ?? 0) >= HEARTBEAT_WRITE_THROTTLE_MS
    ) {
      row.guestLastSeenAt = nowMs;
      c.executionCtx.waitUntil(
        db
          .update(baseballBoardRooms)
          .set({ guestLastSeenAt: nowMs })
          .where(eq(baseballBoardRooms.id, row.id))
          .run()
          .catch(() => {})
      );
    }

    const detail = buildRoomDetailForCaller(
      row,
      access,
      sanitizeDisplayName(access.primaryUserName, "メンバー"),
      nowMs
    );
    if (!detail) {
      return c.json(
        { success: false, error: "対戦データの復元に失敗しました" },
        500
      );
    }

    return c.json({ success: true, room: detail });
  } catch (error: unknown) {
    console.error("[BaseballBoard GET /rooms/:roomId Error]:", error);
    return c.json(
      { success: false, error: "対戦状態の取得に失敗しました" },
      500
    );
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. POST /rooms/:roomId/pitch （守備側の投球送信）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
liffBaseballBoardRouter.post("/rooms/:roomId/pitch", async (c) => {
  try {
    const roomId = (c.req.param("roomId") || "").trim();
    const body = (await c.req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const access = await resolveCallerTeamAccess(c);
    if (!access.primaryUserId) {
      return c.json(
        { success: false, error: "ログイン情報の確認が必要です" },
        401
      );
    }

    const db = drizzle(c.env.DB);
    const row = await db
      .select()
      .from(baseballBoardRooms)
      .where(eq(baseballBoardRooms.id, roomId))
      .get();

    if (!row) {
      return c.json(
        { success: false, error: "対戦ルームが存在しません" },
        404
      );
    }
    if (!access.canAccessTeam(row.teamId)) {
      return c.json(
        {
          success: false,
          error: "アクセス権限がありません",
          isForbidden: true,
        },
        403
      );
    }
    if (row.status !== "playing") {
      return c.json(
        { success: false, error: "現在は投球できる状態ではありません" },
        409
      );
    }

    const matchState = parseJsonSafe<BaseballBoardMatchState>(
      row.matchStateJson
    );
    if (!matchState || matchState.isGameOver) {
      return c.json({ success: false, error: "試合は既に終了しています" }, 409);
    }

    const role = resolveParticipantRole(row, access);
    if (role !== "host" && role !== "guest") {
      return c.json(
        { success: false, error: "対戦プレイヤーのみ操作できます" },
        403
      );
    }

    const hostSide: OnlineTeamSide = row.hostSide === "home" ? "home" : "away";
    const mySide: OnlineTeamSide =
      role === "host" ? hostSide : hostSide === "away" ? "home" : "away";
    const expectedPitcherSide: OnlineTeamSide = matchState.isTop
      ? "home"
      : "away";

    if (mySide !== expectedPitcherSide) {
      return c.json(
        { success: false, error: "現在は相手ピッチャーの投球ターンです" },
        409
      );
    }

    const reqTurnSeq =
      typeof body.turnSeq === "number" ? body.turnSeq : row.turnSeq;
    if (reqTurnSeq !== row.turnSeq) {
      const detail = buildRoomDetailForCaller(row, access, "メンバー", Date.now());
      return c.json({ success: true, room: detail });
    }

    const nowMs = Date.now();
    const existingPitch = parseJsonSafe<OnlineCurrentPitchPayload>(
      row.currentPitchJson
    );
    const isStuckRetryAllowed =
      row.pitchSeq === row.turnSeq &&
      existingPitch !== null &&
      nowMs - existingPitch.thrownAtMs >= STUCK_PITCH_RETRY_MS;

    if (row.pitchSeq >= row.turnSeq && !isStuckRetryAllowed) {
      const detail = buildRoomDetailForCaller(row, access, "メンバー", nowMs);
      return c.json({ success: true, room: detail });
    }

    const rawPitch =
      body.pitch && typeof body.pitch === "object"
        ? (body.pitch as Record<string, unknown>)
        : {};
    const rawType =
      typeof rawPitch.type === "string"
        ? (rawPitch.type as PitchType)
        : "straight";
    const rawCourse =
      typeof rawPitch.course === "string"
        ? (rawPitch.course as PitchCourse)
        : "middle";
    const rawSpeed =
      typeof rawPitch.speedPreset === "string"
        ? (rawPitch.speedPreset as PitchSpeedPreset)
        : "normal";

    const pitchType: PitchType = VALID_PITCH_TYPES.has(rawType)
      ? rawType
      : "straight";
    const course: PitchCourse = VALID_COURSES.has(rawCourse)
      ? rawCourse
      : "middle";
    const speedPreset: PitchSpeedPreset = VALID_SPEED_PRESETS.has(rawSpeed)
      ? rawSpeed
      : "normal";

    const pitcherVanishLeft =
      expectedPitcherSide === "home"
        ? matchState.homeVanishLeft
        : matchState.awayVanishLeft;
    if (pitchType === "vanish" && pitcherVanishLeft <= 0) {
      return c.json(
        { success: false, error: "消える魔球の残り回数がありません" },
        400
      );
    }

    const sanitizedPitch: PitchSpec = {
      type: pitchType,
      course,
      speedPreset,
    };
    const pitchPayload: OnlineCurrentPitchPayload = {
      seq: row.turnSeq,
      pitch: sanitizedPitch,
      speedPreset,
      thrownAtMs: nowMs,
    };

    await db
      .update(baseballBoardRooms)
      .set({
        pitchSeq: row.turnSeq,
        currentPitchJson: JSON.stringify(pitchPayload),
        hostLastSeenAt: role === "host" ? nowMs : row.hostLastSeenAt,
        guestLastSeenAt: role === "guest" ? nowMs : row.guestLastSeenAt,
        updatedAt: nowMs,
      })
      .where(
        and(
          eq(baseballBoardRooms.id, row.id),
          eq(baseballBoardRooms.turnSeq, row.turnSeq)
        )
      )
      .run();

    const updatedRow = await db
      .select()
      .from(baseballBoardRooms)
      .where(eq(baseballBoardRooms.id, row.id))
      .get();

    const detail = updatedRow
      ? buildRoomDetailForCaller(updatedRow, access, "メンバー", nowMs)
      : null;
    return c.json({ success: true, room: detail });
  } catch (error: unknown) {
    console.error("[BaseballBoard POST /pitch Error]:", error);
    return c.json({ success: false, error: "投球の送信に失敗しました" }, 500);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. POST /rooms/:roomId/resolve （打者側のスイング・見送り結果確定）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
liffBaseballBoardRouter.post("/rooms/:roomId/resolve", async (c) => {
  try {
    const roomId = (c.req.param("roomId") || "").trim();
    const body = (await c.req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const access = await resolveCallerTeamAccess(c);
    if (!access.primaryUserId) {
      return c.json(
        { success: false, error: "ログイン情報の確認が必要です" },
        401
      );
    }

    const db = drizzle(c.env.DB);
    const row = await db
      .select()
      .from(baseballBoardRooms)
      .where(eq(baseballBoardRooms.id, roomId))
      .get();

    if (!row) {
      return c.json(
        { success: false, error: "対戦ルームが存在しません" },
        404
      );
    }
    if (!access.canAccessTeam(row.teamId)) {
      return c.json(
        {
          success: false,
          error: "アクセス権限がありません",
          isForbidden: true,
        },
        403
      );
    }

    const nowMs = Date.now();
    const reqTurnSeq = typeof body.turnSeq === "number" ? body.turnSeq : -1;

    // 冪等（リトライ）保護：既にこの turnSeq が反映済みなら正常レスポンスとして最新状態を返却
    if (reqTurnSeq > 0 && row.turnSeq > reqTurnSeq) {
      const detail = buildRoomDetailForCaller(row, access, "メンバー", nowMs);
      return c.json({ success: true, alreadyResolved: true, room: detail });
    }

    if (row.status !== "playing" || row.pitchSeq !== row.turnSeq) {
      const detail = buildRoomDetailForCaller(row, access, "メンバー", nowMs);
      return c.json({ success: true, room: detail });
    }

    const matchState = parseJsonSafe<BaseballBoardMatchState>(
      row.matchStateJson
    );
    const currentPitch = parseJsonSafe<OnlineCurrentPitchPayload>(
      row.currentPitchJson
    );
    if (!matchState || !currentPitch || matchState.isGameOver) {
      const detail = buildRoomDetailForCaller(row, access, "メンバー", nowMs);
      return c.json({ success: true, room: detail });
    }

    const role = resolveParticipantRole(row, access);
    if (role !== "host" && role !== "guest") {
      return c.json(
        { success: false, error: "対戦プレイヤーのみ操作できます" },
        403
      );
    }

    const hostSide: OnlineTeamSide = row.hostSide === "home" ? "home" : "away";
    const mySide: OnlineTeamSide =
      role === "host" ? hostSide : hostSide === "away" ? "home" : "away";
    const expectedBatterSide: OnlineTeamSide = matchState.isTop
      ? "away"
      : "home";

    if (mySide !== expectedBatterSide) {
      return c.json(
        { success: false, error: "現在は相手バッターの打席です" },
        409
      );
    }

    const resolvedPlay = sanitizeResolvedPlay(body.resolvedPlay);
    if (!resolvedPlay) {
      return c.json(
        { success: false, error: "打席結果データが不正です" },
        400
      );
    }
    const replayData = sanitizeReplayData(body.replayData);

    const usedVanish = currentPitch.pitch.type === "vanish";
    const applied = applyPlayOutcome(
      matchState,
      resolvedPlay.outcome,
      resolvedPlay.detailLabel,
      usedVanish
    );

    const lastPlayPayload: OnlineLastPlayPayload = {
      seq: row.turnSeq,
      pitch: currentPitch.pitch,
      speedPreset: currentPitch.speedPreset,
      replayData,
      resolvedPlay: {
        ...resolvedPlay,
        usedVanishPitch: usedVanish,
      },
      bannerTitle: applied.bannerTitle,
      bannerTone: applied.bannerTone,
      soundKind: applied.soundKind,
      resolvedAtMs: nowMs,
    };

    const nextStatus: OnlineRoomStatus = applied.nextState.isGameOver
      ? "finished"
      : "playing";

    await db
      .update(baseballBoardRooms)
      .set({
        status: nextStatus,
        turnSeq: row.turnSeq + 1,
        currentPitchJson: null,
        lastPlayJson: JSON.stringify(lastPlayPayload),
        matchStateJson: JSON.stringify(applied.nextState),
        hostLastSeenAt: role === "host" ? nowMs : row.hostLastSeenAt,
        guestLastSeenAt: role === "guest" ? nowMs : row.guestLastSeenAt,
        updatedAt: nowMs,
      })
      .where(
        and(
          eq(baseballBoardRooms.id, row.id),
          eq(baseballBoardRooms.turnSeq, row.turnSeq)
        )
      )
      .run();

    const updatedRow = await db
      .select()
      .from(baseballBoardRooms)
      .where(eq(baseballBoardRooms.id, row.id))
      .get();

    const detail = updatedRow
      ? buildRoomDetailForCaller(updatedRow, access, "メンバー", nowMs)
      : null;
    return c.json({ success: true, room: detail });
  } catch (error: unknown) {
    console.error("[BaseballBoard POST /resolve Error]:", error);
    return c.json(
      { success: false, error: "打席結果の反映に失敗しました" },
      500
    );
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. POST /rooms/:roomId/rematch （試合終了後のワンタップ再戦申込・成立）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
liffBaseballBoardRouter.post("/rooms/:roomId/rematch", async (c) => {
  try {
    const roomId = (c.req.param("roomId") || "").trim();
    const access = await resolveCallerTeamAccess(c);
    if (!access.primaryUserId) {
      return c.json(
        { success: false, error: "ログイン情報の確認が必要です" },
        401
      );
    }

    const db = drizzle(c.env.DB);
    const row = await db
      .select()
      .from(baseballBoardRooms)
      .where(eq(baseballBoardRooms.id, roomId))
      .get();

    if (!row) {
      return c.json(
        { success: false, error: "対戦ルームが存在しません" },
        404
      );
    }
    if (!access.canAccessTeam(row.teamId)) {
      return c.json(
        {
          success: false,
          error: "アクセス権限がありません",
          isForbidden: true,
        },
        403
      );
    }

    const role = resolveParticipantRole(row, access);
    if (role !== "host" && role !== "guest") {
      return c.json(
        { success: false, error: "対戦プレイヤーのみ再戦操作ができます" },
        403
      );
    }

    const nowMs = Date.now();

    // 既に再戦が始まっている場合は最新ルームをそのまま返却
    if (row.status === "playing") {
      const detail = buildRoomDetailForCaller(row, access, "メンバー", nowMs);
      return c.json({ success: true, room: detail });
    }

    if (row.status !== "finished" || !row.guestUserId || !row.guestName) {
      return c.json(
        { success: false, error: "このルームでは再戦を開始できません" },
        409
      );
    }

    const otherRole = role === "host" ? "guest" : "host";

    // 相手がまだ押していない場合 ➔ 再戦希望フラグを立てて相手へ通知
    if (row.rematchRequestedBy !== otherRole) {
      await db
        .update(baseballBoardRooms)
        .set({
          rematchRequestedBy: role,
          hostLastSeenAt: role === "host" ? nowMs : row.hostLastSeenAt,
          guestLastSeenAt: role === "guest" ? nowMs : row.guestLastSeenAt,
          updatedAt: nowMs,
        })
        .where(eq(baseballBoardRooms.id, row.id))
        .run();

      const updated = await db
        .select()
        .from(baseballBoardRooms)
        .where(eq(baseballBoardRooms.id, row.id))
        .get();
      const detail = updated
        ? buildRoomDetailForCaller(updated, access, "メンバー", nowMs)
        : null;
      return c.json({ success: true, room: detail });
    }

    // 双方が合意！ ➔ 先攻・後攻を入れ替えて即座に第2戦プレイボール！
    const nextHostSide: OnlineTeamSide =
      row.hostSide === "away" ? "home" : "away";
    const rosterCandidates = await loadTeamRosterCandidates(db, row.teamId);
    const hostLineup = buildTeamLineupFromRoster(rosterCandidates);
    const guestLineup = buildRotatedTeamLineupFromRoster(rosterCandidates, 4);

    const nextMatchState = createInitialMatchState({
      mode: "online",
      totalInnings: row.totalInnings,
      difficulty: "normal",
      myTeamName: formatSquadTitle(row.hostName),
      myLineup: hostLineup,
      oppTeamName: formatSquadTitle(row.guestName),
      oppLineup: guestLineup,
      playerIsHome: nextHostSide === "home",
    });
    nextMatchState.lastCallout = `🔥 再戦プレイボール！（先攻・後攻を入れ替えました）`;

    await db
      .update(baseballBoardRooms)
      .set({
        status: "playing",
        hostSide: nextHostSide,
        turnSeq: 1,
        pitchSeq: 0,
        currentPitchJson: null,
        lastPlayJson: null,
        rematchRequestedBy: null,
        matchStateJson: JSON.stringify(nextMatchState),
        hostLastSeenAt: role === "host" ? nowMs : row.hostLastSeenAt,
        guestLastSeenAt: role === "guest" ? nowMs : row.guestLastSeenAt,
        updatedAt: nowMs,
      })
      .where(eq(baseballBoardRooms.id, row.id))
      .run();

    const updated = await db
      .select()
      .from(baseballBoardRooms)
      .where(eq(baseballBoardRooms.id, row.id))
      .get();
    const detail = updated
      ? buildRoomDetailForCaller(updated, access, "メンバー", nowMs)
      : null;
    return c.json({ success: true, room: detail });
  } catch (error: unknown) {
    console.error("[BaseballBoard POST /rematch Error]:", error);
    return c.json({ success: false, error: "再戦の開始に失敗しました" }, 500);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. POST /rooms/:roomId/leave （ルーム退出・キャンセル）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
liffBaseballBoardRouter.post("/rooms/:roomId/leave", async (c) => {
  try {
    const roomId = (c.req.param("roomId") || "").trim();
    const access = await resolveCallerTeamAccess(c);
    if (!access.primaryUserId) {
      return c.json(
        { success: false, error: "ログイン情報の確認が必要です" },
        401
      );
    }

    const db = drizzle(c.env.DB);
    const row = await db
      .select()
      .from(baseballBoardRooms)
      .where(eq(baseballBoardRooms.id, roomId))
      .get();

    if (!row) {
      return c.json({ success: true });
    }
    if (!access.canAccessTeam(row.teamId)) {
      return c.json(
        {
          success: false,
          error: "アクセス権限がありません",
          isForbidden: true,
        },
        403
      );
    }

    const role = resolveParticipantRole(row, access);
    if (role === "spectator") {
      return c.json({ success: true });
    }

    const nowMs = Date.now();
    if (row.status === "waiting" && role === "host") {
      await db
        .update(baseballBoardRooms)
        .set({ status: "closed", updatedAt: nowMs })
        .where(eq(baseballBoardRooms.id, row.id))
        .run();
      return c.json({ success: true });
    }

    if (row.status === "playing") {
      const matchState = parseJsonSafe<BaseballBoardMatchState>(
        row.matchStateJson
      );
      if (matchState && !matchState.isGameOver) {
        const hostSide: OnlineTeamSide =
          row.hostSide === "home" ? "home" : "away";
        const leaverSide: OnlineTeamSide =
          role === "host" ? hostSide : hostSide === "away" ? "home" : "away";
        const winnerSide: OnlineTeamSide =
          leaverSide === "away" ? "home" : "away";
        const leaverName =
          role === "host" ? row.hostName : row.guestName || "相手";
        matchState.isGameOver = true;
        matchState.winner = winnerSide;
        matchState.lastCallout = `${leaverName}さんが退出したため試合終了となりました`;
        await db
          .update(baseballBoardRooms)
          .set({
            status: "finished",
            currentPitchJson: null,
            matchStateJson: JSON.stringify(matchState),
            updatedAt: nowMs,
          })
          .where(eq(baseballBoardRooms.id, row.id))
          .run();
      }
      return c.json({ success: true });
    }

    if (row.status === "finished") {
      await db
        .update(baseballBoardRooms)
        .set({ status: "closed", updatedAt: nowMs })
        .where(eq(baseballBoardRooms.id, row.id))
        .run();
    }

    return c.json({ success: true });
  } catch (error: unknown) {
    console.error("[BaseballBoard POST /leave Error]:", error);
    return c.json(
      { success: false, error: "ルーム退出処理に失敗しました" },
      500
    );
  }
});

export default liffBaseballBoardRouter;
