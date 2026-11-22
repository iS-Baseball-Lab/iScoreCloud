// filepath: src/api/liff/phase3-team-tools.ts
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import * as schema from "@/db/schema";
import { ensureAllSchemasOnce } from "@/lib/db-helper";
import { buildParentToChildrenMap } from "@/lib/liff/group-attendance";
import {
  comparePlayersByConditionAndUniform,
  getTodayJstDateKey,
  resolveEffectivePlayerConditionOnDate,
} from "@/lib/liff/player-condition";
import { parsePlayerProfileDetails } from "@/lib/liff/player-profile-schema";
import {
  DEFAULT_LIFF_SCORE_SETTINGS,
  parseLiffScoreSettingsJson,
  type LiffScoreSettings,
} from "@/lib/liff/score-settings";
import { loadTeamPlayerConditionPeriodsMap } from "@/lib/player-roster-cleanup";
import { sendLinePushMessage } from "@/lib/line/push";
import {
  DEFAULT_WEEKEND_REMINDER_SETTINGS,
  buildWeekendReminderMessage,
  isValidLineGroupTargetId,
  loadTeamWeekendReminderDigest,
  parseWeekendReminderSettingsJson,
  resolveUpcomingWeekendWindowJst,
  type WeekendReminderDigest,
  type WeekendReminderSettings,
} from "@/lib/line/weekend-reminder";
import {
  DEMO_DEFAULT_HUB_TICKER_CONFIG,
  parseHubTickerConfigJson,
  serializeHubTickerConfigJson,
  type HubTickerConfig,
} from "@/lib/liff/hub-ticker";
import { resolveCallerTeamAccess } from "@/lib/team-access";
import type { WorkerEnv } from "@/types/api";

const liffPhase3TeamToolsRouter = new Hono<{ Bindings: WorkerEnv }>();

const {
  organizations,
  teams,
  teamMembers,
  players,
  parentChildRelations,
  matches,
  matchLineups,
  lineupTemplates,
  tournaments,
} = schema;

export interface TeamScheduleSettingsPayload {
  targetGroups: string[];
  dutyGroups: string[];
  useDutyGroups: boolean;
}

export const DEFAULT_TEAM_TARGET_GROUPS: readonly string[] = [
  "全体",
  "Aチーム",
  "Bチーム",
  "低学年",
  "体験・見学",
];

function sanitizeStringList(
  raw: unknown,
  fallback: readonly string[],
  maxItems = 20,
  maxLen = 24
): string[] {
  if (!Array.isArray(raw)) return [...fallback];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const clean = item.trim().slice(0, maxLen);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function parseTeamScheduleSettingsJson(
  raw: unknown
): TeamScheduleSettingsPayload {
  if (!raw) {
    return {
      targetGroups: [...DEFAULT_TEAM_TARGET_GROUPS],
      dutyGroups: [],
      useDutyGroups: false,
    };
  }
  let obj: Record<string, unknown> | null = null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          obj = parsed as Record<string, unknown>;
        }
      } catch {
        obj = null;
      }
    }
  } else if (typeof raw === "object" && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>;
  }

  if (!obj) {
    return {
      targetGroups: [...DEFAULT_TEAM_TARGET_GROUPS],
      dutyGroups: [],
      useDutyGroups: false,
    };
  }

  const targetGroups = sanitizeStringList(
    obj.targetGroups,
    DEFAULT_TEAM_TARGET_GROUPS,
    20,
    24
  );
  const finalTargetGroups =
    targetGroups.length > 0 ? targetGroups : [...DEFAULT_TEAM_TARGET_GROUPS];
  const dutyGroups = sanitizeStringList(obj.dutyGroups, [], 20, 20);
  const useDutyGroups =
    typeof obj.useDutyGroups === "boolean"
      ? obj.useDutyGroups
      : dutyGroups.length > 0;

  return {
    targetGroups: finalTargetGroups,
    dutyGroups,
    useDutyGroups,
  };
}

export interface TeamCheerChantItem {
  id: string;
  title: string;
  category: "attack" | "chance" | "call";
  lyrics: string;
  youtubeUrl?: string | null;
}

const DEFAULT_TEAM_CHEER_CHANTS: readonly TeamCheerChantItem[] = [
  {
    id: "chant-attack-1",
    title: "先頭打者出塁テーマ",
    category: "attack",
    lyrics:
      "出塁だ！出塁だ！先頭バッター出塁だ！\n塁に出てかき回せ　いくぞ先制点！",
    youtubeUrl: null,
  },
  {
    id: "chant-chance-1",
    title: "チャンステーマ（得点圏）",
    category: "chance",
    lyrics:
      "レッツゴー！レッツゴー！（選手名）！\nここで決めろよ　勝利の一打！\nかっとばせー！（選手名）！",
    youtubeUrl: null,
  },
  {
    id: "chant-call-1",
    title: "守備盛り上げコール（2アウト）",
    category: "call",
    lyrics:
      "ツーアウト！ツーアウト！あとひとり！\nピッチャーナイスボール！バックも盛り上げていこう！",
    youtubeUrl: null,
  },
];

function sanitizeSafeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 300) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function parseTeamCheerChantsJson(raw: unknown): TeamCheerChantItem[] {
  if (!raw) return DEFAULT_TEAM_CHEER_CHANTS.map((c) => ({ ...c }));
  let arr: unknown[] | null = null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return DEFAULT_TEAM_CHEER_CHANTS.map((c) => ({ ...c }));
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        arr = parsed;
      }
    } catch {
      return DEFAULT_TEAM_CHEER_CHANTS.map((c) => ({ ...c }));
    }
  } else if (Array.isArray(raw)) {
    arr = raw;
  }
  if (!arr) return DEFAULT_TEAM_CHEER_CHANTS.map((c) => ({ ...c }));

  const out: TeamCheerChantItem[] = [];
  for (let i = 0; i < arr.length && out.length < 30; i++) {
    const item = arr[i];
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const title =
      typeof obj.title === "string" ? obj.title.trim().slice(0, 50) : "";
    const lyrics =
      typeof obj.lyrics === "string" ? obj.lyrics.trim().slice(0, 600) : "";
    if (!title || !lyrics) continue;
    const cat =
      obj.category === "attack" ||
      obj.category === "chance" ||
      obj.category === "call"
        ? obj.category
        : "attack";
    const id =
      typeof obj.id === "string" && obj.id.trim()
        ? obj.id.trim().slice(0, 64)
        : `chant-${i + 1}`;
    out.push({
      id,
      title,
      category: cat,
      lyrics,
      youtubeUrl: sanitizeSafeHttpUrl(obj.youtubeUrl),
    });
  }
  return out;
}

// =========================================================
// 1. 活動グループ・当番班設定 API (/api/liff/team-schedule-settings)
// =========================================================
liffPhase3TeamToolsRouter.get("/team-schedule-settings", async (c) => {
  const teamId = (c.req.query("teamId") || "").trim();
  if (!teamId || teamId === "demo-team") {
    return c.json({
      success: true,
      isDemo: true,
      canEdit: true,
      settings: {
        targetGroups: [...DEFAULT_TEAM_TARGET_GROUPS],
        dutyGroups: ["1班", "2班", "3班"],
        useDutyGroups: true,
      } satisfies TeamScheduleSettingsPayload,
    });
  }

  try {
    await ensureAllSchemasOnce(c.env.DB);
    const access = await resolveCallerTeamAccess(c);
    if (!access.canAccessTeam(teamId)) {
      return c.json({ success: false, error: "アクセス権限がありません" }, 403);
    }

    const db = drizzle(c.env.DB);
    const [teamRow, subLabelsRow] = await Promise.all([
      db
        .select({
          id: teams.id,
          scheduleSettings: teams.scheduleSettings,
        })
        .from(teams)
        .where(eq(teams.id, teamId))
        .get(),
      db
        .select({ memberSubLabels: teams.memberSubLabels })
        .from(teams)
        .where(eq(teams.id, teamId))
        .get(),
    ]);

    if (!teamRow) {
      return c.json({ success: false, error: "チームが見つかりません" }, 404);
    }

    const settings = parseTeamScheduleSettingsJson(teamRow.scheduleSettings);

    // 家族・当番班管理（member_sub_labels）で既に班が登録されている場合は候補に自動統合
    if (settings.dutyGroups.length === 0 && subLabelsRow?.memberSubLabels) {
      try {
        const parsedLabels = JSON.parse(subLabelsRow.memberSubLabels) as Record<
          string,
          unknown
        >;
        const discovered = new Set<string>();
        for (const val of Object.values(parsedLabels || {})) {
          if (typeof val === "string" && val.trim() && val.trim() !== "なし") {
            discovered.add(val.trim().slice(0, 20));
          }
        }
        if (discovered.size > 0) {
          settings.dutyGroups = Array.from(discovered).sort((a, b) =>
            a.localeCompare(b, "ja", { numeric: true })
          );
          settings.useDutyGroups = true;
        }
      } catch {
        // ignore invalid json
      }
    }

    return c.json({
      success: true,
      isDemo: false,
      canEdit: access.isAuthenticated && access.canMutateTeamData(teamId),
      settings,
    });
  } catch (err) {
    console.error("[GET /api/liff/team-schedule-settings] Error:", err);
    return c.json(
      { success: false, error: "予定グループ設定の取得に失敗しました" },
      500
    );
  }
});

liffPhase3TeamToolsRouter.post("/team-schedule-settings", async (c) => {
  try {
    const body = (await c.req.json()) as {
      teamId?: string;
      targetGroups?: unknown;
      dutyGroups?: unknown;
      useDutyGroups?: unknown;
    };
    const teamId = (body.teamId || "").trim();
    if (!teamId) {
      return c.json({ success: false, error: "teamId が必要です" }, 400);
    }

    const sanitized = parseTeamScheduleSettingsJson({
      targetGroups: body.targetGroups,
      dutyGroups: body.dutyGroups,
      useDutyGroups: body.useDutyGroups,
    });

    if (teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        settings: sanitized,
      });
    }

    await ensureAllSchemasOnce(c.env.DB);
    const access = await resolveCallerTeamAccess(c);
    if (!access.isAuthenticated || !access.canMutateTeamData(teamId)) {
      return c.json(
        { success: false, error: "設定を変更する権限がありません" },
        403
      );
    }

    const db = drizzle(c.env.DB);
    await db
      .update(teams)
      .set({ scheduleSettings: JSON.stringify(sanitized) })
      .where(eq(teams.id, teamId));

    return c.json({
      success: true,
      isDemo: false,
      settings: sanitized,
    });
  } catch (err) {
    console.error("[POST /api/liff/team-schedule-settings] Error:", err);
    return c.json(
      { success: false, error: "予定グループ設定の保存に失敗しました" },
      500
    );
  }
});

// =========================================================
// 2. スコア・試合規定設定 D1永続化 API (/api/liff/score-settings)
// =========================================================
liffPhase3TeamToolsRouter.get("/score-settings", async (c) => {
  const teamId = (c.req.query("teamId") || "").trim();
  if (!teamId || teamId === "demo-team") {
    return c.json({
      success: true,
      isDemo: true,
      canEdit: true,
      orgCategory: "gakudou",
      settings: {
        ...DEFAULT_LIFF_SCORE_SETTINGS,
        pitchCountLimit: 70,
      } satisfies LiffScoreSettings,
    });
  }

  try {
    await ensureAllSchemasOnce(c.env.DB);
    const access = await resolveCallerTeamAccess(c);
    if (!access.canAccessTeam(teamId)) {
      return c.json({ success: false, error: "アクセス権限がありません" }, 403);
    }

    const db = drizzle(c.env.DB);
    const row = await db
      .select({
        id: teams.id,
        scoreSettings: teams.scoreSettings,
        orgCategory: organizations.category,
      })
      .from(teams)
      .leftJoin(organizations, eq(teams.organizationId, organizations.id))
      .where(eq(teams.id, teamId))
      .get();

    if (!row) {
      return c.json({ success: false, error: "チームが見つかりません" }, 404);
    }

    const settings = parseLiffScoreSettingsJson(
      row.scoreSettings,
      DEFAULT_LIFF_SCORE_SETTINGS
    );

    return c.json({
      success: true,
      isDemo: false,
      canEdit:
        access.isAuthenticated &&
        (access.canEditScoreForTeam(teamId) ||
          access.canMutateTeamData(teamId)),
      orgCategory: row.orgCategory || "other",
      settings,
    });
  } catch (err) {
    console.error("[GET /api/liff/score-settings] Error:", err);
    return c.json(
      { success: false, error: "スコア設定の取得に失敗しました" },
      500
    );
  }
});

liffPhase3TeamToolsRouter.post("/score-settings", async (c) => {
  try {
    const body = (await c.req.json()) as {
      teamId?: string;
      settings?: Record<string, unknown>;
    };
    const teamId = (body.teamId || "").trim();
    if (!teamId) {
      return c.json({ success: false, error: "teamId が必要です" }, 400);
    }

    const sanitized = parseLiffScoreSettingsJson(
      body.settings || body,
      DEFAULT_LIFF_SCORE_SETTINGS
    );

    if (teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        settings: sanitized,
      });
    }

    await ensureAllSchemasOnce(c.env.DB);
    const access = await resolveCallerTeamAccess(c);
    if (
      !access.isAuthenticated ||
      (!access.canEditScoreForTeam(teamId) &&
        !access.canMutateTeamData(teamId))
    ) {
      return c.json(
        { success: false, error: "スコア設定を保存する権限がありません" },
        403
      );
    }

    const db = drizzle(c.env.DB);
    await db
      .update(teams)
      .set({ scoreSettings: JSON.stringify(sanitized) })
      .where(eq(teams.id, teamId));

    return c.json({
      success: true,
      isDemo: false,
      settings: sanitized,
    });
  } catch (err) {
    console.error("[POST /api/liff/score-settings] Error:", err);
    return c.json(
      { success: false, error: "スコア設定の保存に失敗しました" },
      500
    );
  }
});

// =========================================================
// 3. 応援歌・選手コール 実データ連動 API (/api/liff/cheer-songs)
// =========================================================
export interface CheerSongPlayerItem {
  id: string;
  name: string;
  nameKana: string | null;
  uniformNumber: string;
  nickname: string | null;
  primaryPosition: string | null;
  bats: string | null;
  walkUpSong: string | null;
  cheerCall: string | null;
  cheerLyrics: string | null;
  cheerYoutubeUrl: string | null;
  canEditCheer: boolean;
}

export interface CheerLineupSourceOption {
  id: string;
  sourceType: "match" | "template";
  label: string;
  subLabel: string;
  slots: Array<{
    order: number;
    position: string;
    playerId: string;
  }>;
}

liffPhase3TeamToolsRouter.get("/cheer-songs", async (c) => {
  const teamId = (c.req.query("teamId") || "").trim();

  if (!teamId || teamId === "demo-team") {
    const demoPlayers: CheerSongPlayerItem[] = [
      {
        id: "demo-p1",
        name: "佐藤 翔太",
        nameKana: "さとう しょうた",
        uniformNumber: "1",
        nickname: "ショウタ",
        primaryPosition: "P",
        bats: "R",
        walkUpSong: "紅 / X JAPAN",
        cheerCall: "かっとばせー！ショウタ！",
        cheerLyrics:
          "鋭いスイング見せろよ翔太　勝利へ導く一撃を\nかっとばせー！ショウタ！",
        cheerYoutubeUrl: null,
        canEditCheer: true,
      },
      {
        id: "demo-p2",
        name: "鈴木 健太",
        nameKana: "すずき けんた",
        uniformNumber: "2",
        nickname: "ケンタ",
        primaryPosition: "C",
        bats: "R",
        walkUpSong: "サウスポー / ピンク・レディー",
        cheerCall: "ゴーゴーレッツゴー！ケンタ！",
        cheerLyrics:
          "強肩強打の頼れる扇の要　今日もレフトへぶち込め健太！",
        cheerYoutubeUrl: null,
        canEditCheer: true,
      },
      {
        id: "demo-p6",
        name: "高橋 蓮",
        nameKana: "たかはし れん",
        uniformNumber: "6",
        nickname: "レン",
        primaryPosition: "SS",
        bats: "L",
        walkUpSong: "狙いうち / 山本リンダ",
        cheerCall: "走れ走れー！レン！",
        cheerLyrics:
          "俊足飛ばしてダイヤモンド駆け抜けろ　切り込み隊長　高橋蓮！",
        cheerYoutubeUrl: null,
        canEditCheer: true,
      },
      {
        id: "demo-p10",
        name: "田中 颯太",
        nameKana: "たなか そうた",
        uniformNumber: "10",
        nickname: "キャプテン颯太",
        primaryPosition: "CF",
        bats: "R",
        walkUpSong: "栄光の架橋 / ゆず",
        cheerCall: "頼むぞー！ソウタ！",
        cheerLyrics:
          "チームの誇り胸に秘め　アーチを描けよバックスクリーン！\nかっとばせー！ソウタ！",
        cheerYoutubeUrl: null,
        canEditCheer: true,
      },
    ];
    return c.json({
      success: true,
      isDemo: true,
      teamName: "iScore ドリームス",
      canManageTeamChants: true,
      teamChants: DEFAULT_TEAM_CHEER_CHANTS,
      players: demoPlayers,
      lineupSources: [
        {
          id: "demo-match-lineup",
          sourceType: "match",
          label: "直近試合スタメン (vs レッドソックス)",
          subLabel: "1番〜4番モデル表示",
          slots: [
            { order: 1, position: "6", playerId: "demo-p6" },
            { order: 2, position: "2", playerId: "demo-p2" },
            { order: 3, position: "1", playerId: "demo-p1" },
            { order: 4, position: "8", playerId: "demo-p10" },
          ],
        },
      ] satisfies CheerLineupSourceOption[],
    });
  }

  try {
    await ensureAllSchemasOnce(c.env.DB);
    const access = await resolveCallerTeamAccess(c);
    if (!access.canAccessTeam(teamId)) {
      return c.json({ success: false, error: "アクセス権限がありません" }, 403);
    }

    const db = drizzle(c.env.DB);
    const [
      teamRow,
      playerRows,
      memberRows,
      relationRows,
      recentMatches,
      templateRows,
      periodsByPlayerId,
    ] = await Promise.all([
      db
        .select({
          id: teams.id,
          teamName: teams.name,
          orgName: organizations.name,
          cheerSongsJson: teams.cheerSongsJson,
        })
        .from(teams)
        .leftJoin(organizations, eq(teams.organizationId, organizations.id))
        .where(eq(teams.id, teamId))
        .get(),
      db.select().from(players).where(eq(players.teamId, teamId)).all(),
      db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId)).all(),
      db
        .select({
          parentId: parentChildRelations.parentId,
          childId: parentChildRelations.childId,
        })
        .from(parentChildRelations)
        .where(eq(parentChildRelations.teamId, teamId))
        .all()
        .catch(() => []),
      db
        .select({
          id: matches.id,
          date: matches.date,
          opponent: matches.opponent,
          status: matches.status,
          myLineup: matches.myLineup,
          tournamentName: tournaments.name,
        })
        .from(matches)
        .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
        .where(eq(matches.teamId, teamId))
        .orderBy(desc(matches.date), desc(matches.createdAt))
        .limit(12)
        .all(),
      db
        .select()
        .from(lineupTemplates)
        .where(eq(lineupTemplates.teamId, teamId))
        .orderBy(desc(lineupTemplates.createdAt))
        .limit(10)
        .all()
        .catch(() => []),
      loadTeamPlayerConditionPeriodsMap(c.env.DB, teamId),
    ]);

    if (!teamRow) {
      return c.json({ success: false, error: "チームが見つかりません" }, 404);
    }

    const canManageTeam =
      access.isAuthenticated &&
      (access.canManageTeamId(teamId) || access.canMutateTeamData(teamId));

    const candidateUserIdSet = new Set(access.candidateUserIds);
    const grant = access.teamRoles.get(teamId);
    const myMemberIds = new Set<string>();
    if (grant?.memberId) myMemberIds.add(grant.memberId);
    for (const m of memberRows) {
      if (m.userId && candidateUserIdSet.has(m.userId)) {
        myMemberIds.add(m.id);
      }
    }

    const parentToChildren = buildParentToChildrenMap({
      players: playerRows.map((p) => ({
        id: p.id,
        name: p.name,
        userId: p.userId,
        isActive: p.isActive,
        conditionStatus: p.conditionStatus,
      })),
      teamMembers: memberRows,
      relations: relationRows,
    });
    const linkedChildIds = new Set<string>();
    for (const mid of myMemberIds) {
      for (const cid of parentToChildren.get(mid) || []) {
        linkedChildIds.add(cid);
      }
    }

    const todayKey = getTodayJstDateKey();
    const sortedPlayers = playerRows
      .filter((p) => p.isActive !== false)
      .map((p) => {
        const eff = resolveEffectivePlayerConditionOnDate({
          conditionPeriods: periodsByPlayerId.get(p.id) || [],
          fallbackStatus: p.conditionStatus,
          dateKey: todayKey,
          todayKey,
        });
        return { ...p, resolvedStatus: eff.status };
      })
      .sort((a, b) =>
        comparePlayersByConditionAndUniform(
          {
            conditionStatus: a.resolvedStatus,
            uniformNumber: a.uniformNumber,
            name: a.name,
          },
          {
            conditionStatus: b.resolvedStatus,
            uniformNumber: b.uniformNumber,
            name: b.name,
          }
        )
      );

    const formattedPlayers: CheerSongPlayerItem[] = sortedPlayers.map((p) => {
      const details = parsePlayerProfileDetails(p.profileDetails);
      const isSelf = Boolean(p.userId && candidateUserIdSet.has(p.userId));
      const isLinkedChild = linkedChildIds.has(p.id);
      return {
        id: p.id,
        name: p.name,
        nameKana: p.nameKana || null,
        uniformNumber: p.uniformNumber || "",
        nickname: p.nickname || null,
        primaryPosition: p.primaryPosition || null,
        bats: p.bats || null,
        walkUpSong: details.walkUpSong || null,
        cheerCall: details.cheerCall || null,
        cheerLyrics: details.cheerLyrics || null,
        cheerYoutubeUrl: details.cheerYoutubeUrl || null,
        canEditCheer:
          access.isAuthenticated &&
          (access.canManageTeamId(teamId) ||
            access.canMutateTeamData(teamId) ||
            isSelf ||
            isLinkedChild),
      };
    });

    const validPlayerIdSet = new Set(formattedPlayers.map((p) => p.id));
    const recentMatchIds = recentMatches.map((m) => m.id);
    const matchLineupRows =
      recentMatchIds.length > 0
        ? await db
            .select({
              matchId: matchLineups.matchId,
              battingOrder: matchLineups.battingOrder,
              position: matchLineups.position,
              playerId: matchLineups.playerId,
              isStarting: matchLineups.isStarting,
            })
            .from(matchLineups)
            .where(inArray(matchLineups.matchId, recentMatchIds))
            .orderBy(asc(matchLineups.battingOrder))
            .all()
            .catch(() => [])
        : [];

    const startersByMatchId = new Map<
      string,
      Array<{ order: number; position: string; playerId: string }>
    >();
    for (const r of matchLineupRows) {
      if (r.isStarting === false || !validPlayerIdSet.has(r.playerId)) continue;
      if (r.battingOrder <= 0) continue;
      const list = startersByMatchId.get(r.matchId) || [];
      if (!list.some((s) => s.order === r.battingOrder)) {
        list.push({
          order: r.battingOrder,
          position: r.position || "",
          playerId: r.playerId,
        });
        startersByMatchId.set(r.matchId, list);
      }
    }

    const lineupSources: CheerLineupSourceOption[] = [];
    // 進行中(live) -> 予定(scheduled) -> 直近終了(finished) 順でスタメン登録済みの試合を並べる
    const orderedMatches = [...recentMatches].sort((a, b) => {
      const rank = (st: string) =>
        st === "live" ? 0 : st === "scheduled" ? 1 : 2;
      const ra = rank(a.status);
      const rb = rank(b.status);
      if (ra !== rb) return ra - rb;
      return b.date.localeCompare(a.date);
    });

    for (const m of orderedMatches) {
      let slots = startersByMatchId.get(m.id) || [];
      if (slots.length === 0 && m.myLineup) {
        try {
          const parsed = JSON.parse(m.myLineup) as Array<
            Record<string, unknown>
          >;
          if (Array.isArray(parsed)) {
            slots = parsed
              .map((item, idx) => {
                const pid =
                  typeof item.playerId === "string" ? item.playerId : "";
                const ord =
                  typeof item.battingOrder === "number"
                    ? item.battingOrder
                    : typeof item.order === "number"
                    ? item.order
                    : idx + 1;
                const pos =
                  typeof item.position === "string" ? item.position : "";
                return { order: ord, position: pos, playerId: pid };
              })
              .filter(
                (s) => s.order >= 1 && s.playerId && validPlayerIdSet.has(s.playerId)
              );
          }
        } catch {
          // ignore
        }
      }
      if (slots.length > 0) {
        slots.sort((a, b) => a.order - b.order);
        const statusPrefix =
          m.status === "live"
            ? "🔴試合中 "
            : m.status === "scheduled"
            ? "📅予定 "
            : "";
        lineupSources.push({
          id: `match:${m.id}`,
          sourceType: "match",
          label: `${statusPrefix}${m.date} vs ${m.opponent}`,
          subLabel: m.tournamentName || `スタメン ${slots.length}名`,
          slots,
        });
      }
    }

    for (const tpl of templateRows) {
      try {
        const rawData: unknown =
          typeof tpl.lineupData === "string"
            ? JSON.parse(tpl.lineupData)
            : tpl.lineupData;
        const arr = Array.isArray(rawData)
          ? rawData
          : rawData &&
            typeof rawData === "object" &&
            Array.isArray((rawData as Record<string, unknown>).starters)
          ? ((rawData as Record<string, unknown>).starters as unknown[])
          : [];
        const slots = arr
          .map((item, idx) => {
            const obj = (item || {}) as Record<string, unknown>;
            const pid = typeof obj.playerId === "string" ? obj.playerId : "";
            const ord =
              typeof obj.battingOrder === "number"
                ? obj.battingOrder
                : typeof obj.order === "number"
                ? obj.order
                : idx + 1;
            const pos = typeof obj.position === "string" ? obj.position : "";
            return { order: ord, position: pos, playerId: pid };
          })
          .filter(
            (s) => s.order >= 1 && s.playerId && validPlayerIdSet.has(s.playerId)
          )
          .sort((a, b) => a.order - b.order);
        if (slots.length > 0) {
          lineupSources.push({
            id: `tpl:${tpl.id}`,
            sourceType: "template",
            label: `📋 テンプレ: ${tpl.name}`,
            subLabel: `登録オーダー ${slots.length}名`,
            slots,
          });
        }
      } catch {
        // ignore invalid template
      }
    }

    const teamChants = parseTeamCheerChantsJson(teamRow.cheerSongsJson);

    return c.json({
      success: true,
      isDemo: false,
      teamName: teamRow.orgName || teamRow.teamName,
      canManageTeamChants: canManageTeam,
      teamChants,
      players: formattedPlayers,
      lineupSources,
    });
  } catch (err) {
    console.error("[GET /api/liff/cheer-songs] Error:", err);
    return c.json(
      { success: false, error: "応援歌・コールデータの取得に失敗しました" },
      500
    );
  }
});

liffPhase3TeamToolsRouter.post("/cheer-songs/team", async (c) => {
  try {
    const body = (await c.req.json()) as {
      teamId?: string;
      teamChants?: unknown;
    };
    const teamId = (body.teamId || "").trim();
    if (!teamId) {
      return c.json({ success: false, error: "teamId が必要です" }, 400);
    }

    const sanitizedChants = parseTeamCheerChantsJson(body.teamChants);

    if (teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        teamChants: sanitizedChants,
      });
    }

    await ensureAllSchemasOnce(c.env.DB);
    const access = await resolveCallerTeamAccess(c);
    if (!access.isAuthenticated || !access.canMutateTeamData(teamId)) {
      return c.json(
        { success: false, error: "チーム応援歌を編集する権限がありません" },
        403
      );
    }

    const db = drizzle(c.env.DB);
    await db
      .update(teams)
      .set({ cheerSongsJson: JSON.stringify(sanitizedChants) })
      .where(eq(teams.id, teamId));

    return c.json({
      success: true,
      isDemo: false,
      teamChants: sanitizedChants,
    });
  } catch (err) {
    console.error("[POST /api/liff/cheer-songs/team] Error:", err);
    return c.json(
      { success: false, error: "チーム応援歌の保存に失敗しました" },
      500
    );
  }
});

liffPhase3TeamToolsRouter.post("/cheer-songs/player", async (c) => {
  try {
    const body = (await c.req.json()) as {
      teamId?: string;
      playerId?: string;
      nickname?: string | null;
      walkUpSong?: string | null;
      cheerCall?: string | null;
      cheerLyrics?: string | null;
      cheerYoutubeUrl?: string | null;
    };
    const teamId = (body.teamId || "").trim();
    const playerId = (body.playerId || "").trim();
    if (!teamId || !playerId) {
      return c.json(
        { success: false, error: "teamId と playerId が必要です" },
        400
      );
    }

    if (teamId === "demo-team") {
      return c.json({ success: true, isDemo: true });
    }

    await ensureAllSchemasOnce(c.env.DB);
    const access = await resolveCallerTeamAccess(c);
    if (!access.isAuthenticated || !access.canAccessTeam(teamId)) {
      return c.json({ success: false, error: "アクセス権限がありません" }, 403);
    }

    const db = drizzle(c.env.DB);
    const playerRow = await db
      .select()
      .from(players)
      .where(and(eq(players.id, playerId), eq(players.teamId, teamId)))
      .get();

    if (!playerRow) {
      return c.json({ success: false, error: "選手が見つかりません" }, 404);
    }

    let allowed =
      access.canManageTeamId(teamId) || access.canMutateTeamData(teamId);

    if (!allowed) {
      const candidateSet = new Set(access.candidateUserIds);
      if (playerRow.userId && candidateSet.has(playerRow.userId)) {
        allowed = true;
      } else {
        const [memberRows, relationRows] = await Promise.all([
          db
            .select()
            .from(teamMembers)
            .where(eq(teamMembers.teamId, teamId))
            .all(),
          db
            .select({
              parentId: parentChildRelations.parentId,
              childId: parentChildRelations.childId,
            })
            .from(parentChildRelations)
            .where(eq(parentChildRelations.teamId, teamId))
            .all()
            .catch(() => []),
        ]);
        const myMemberIds = new Set<string>();
        const grant = access.teamRoles.get(teamId);
        if (grant?.memberId) myMemberIds.add(grant.memberId);
        for (const m of memberRows) {
          if (m.userId && candidateSet.has(m.userId)) {
            myMemberIds.add(m.id);
          }
        }
        const parentMap = buildParentToChildrenMap({
          players: [
            {
              id: playerRow.id,
              name: playerRow.name,
              userId: playerRow.userId,
              isActive: playerRow.isActive,
              conditionStatus: playerRow.conditionStatus,
            },
          ],
          teamMembers: memberRows,
          relations: relationRows,
        });
        for (const mid of myMemberIds) {
          if ((parentMap.get(mid) || []).includes(playerRow.id)) {
            allowed = true;
            break;
          }
        }
      }
    }

    if (!allowed) {
      return c.json(
        { success: false, error: "この選手の応援歌を編集する権限がありません" },
        403
      );
    }

    const currentDetails = parsePlayerProfileDetails(playerRow.profileDetails);
    const mergedDetails = parsePlayerProfileDetails({
      ...currentDetails,
      walkUpSong:
        body.walkUpSong !== undefined
          ? body.walkUpSong
          : currentDetails.walkUpSong,
      cheerCall:
        body.cheerCall !== undefined
          ? body.cheerCall
          : currentDetails.cheerCall,
      cheerLyrics:
        body.cheerLyrics !== undefined
          ? body.cheerLyrics
          : currentDetails.cheerLyrics,
      cheerYoutubeUrl:
        body.cheerYoutubeUrl !== undefined
          ? body.cheerYoutubeUrl
          : currentDetails.cheerYoutubeUrl,
    });

    const nextNickname =
      body.nickname !== undefined
        ? (body.nickname || "").trim().slice(0, 30) || null
        : playerRow.nickname;

    await db
      .update(players)
      .set({
        nickname: nextNickname,
        profileDetails: JSON.stringify(mergedDetails),
      })
      .where(and(eq(players.id, playerId), eq(players.teamId, teamId)));

    return c.json({
      success: true,
      isDemo: false,
      player: {
        id: playerId,
        nickname: nextNickname,
        walkUpSong: mergedDetails.walkUpSong,
        cheerCall: mergedDetails.cheerCall || null,
        cheerLyrics: mergedDetails.cheerLyrics || null,
        cheerYoutubeUrl: mergedDetails.cheerYoutubeUrl || null,
      },
    });
  } catch (err) {
    console.error("[POST /api/liff/cheer-songs/player] Error:", err);
    return c.json(
      { success: false, error: "選手応援歌の保存に失敗しました" },
      500
    );
  }
});

// =========================================================================
// 💬 4. LINEグループ連携 ＆ 週末自動リマインド設定・プレビュー・テスト送信
// =========================================================================

function buildDemoWeekendReminderDigest(now: Date, appBaseUrl: string): WeekendReminderDigest {
  const window = resolveUpcomingWeekendWindowJst(now);
  const cleanOrigin = (appBaseUrl || "https://iscorecloud.com")
    .trim()
    .replace(/\/+$/, "");
  return {
    teamName: "iScore ドリームス（体験デモ）",
    weekendKey: window.weekendKey,
    weekendRangeLabel: window.weekendRangeLabel,
    events: [
      {
        id: "demo-ev-sat",
        dateLabel: window.weekendRangeLabel.split("〜")[0] || "土曜",
        timeLabel: "08:30〜12:30",
        title: "通常練習（A・B合同）",
        location: "第一市民グラウンド",
        targetGroup: "全体",
        dutyGroup: "1班",
        needsLunch: false,
        presentPlayerCount: 14,
        absentPlayerCount: 1,
        unansweredPlayerNames: ["高橋 翔太", "伊藤 大輝"],
        carCount: 0,
        carOfferCount: 4,
      },
      {
        id: "demo-ev-sun",
        dateLabel: window.weekendRangeLabel.split("〜")[1] || "日曜",
        timeLabel: "09:00〜16:00",
        title: "練習試合 vs 青葉スターズ",
        location: "緑ヶ丘運動公園野球場",
        targetGroup: "Aチーム",
        dutyGroup: "2班",
        needsLunch: true,
        presentPlayerCount: 12,
        absentPlayerCount: 0,
        unansweredPlayerNames: ["渡辺 蓮"],
        carCount: 4,
        carOfferCount: 5,
      },
    ],
    scheduleUrl: `${cleanOrigin}/liff/schedule`,
  };
}

function mergeIncomingReminderSettings(
  rawIncoming: unknown,
  existing: WeekendReminderSettings
): WeekendReminderSettings {
  const parsed = parseWeekendReminderSettingsJson(rawIncoming);
  const obj =
    rawIncoming && typeof rawIncoming === "object" && !Array.isArray(rawIncoming)
      ? (rawIncoming as Record<string, unknown>)
      : {};
  return {
    enabled:
      typeof obj.enabled === "boolean" ? obj.enabled : existing.enabled,
    sendDayOfWeek:
      obj.sendDayOfWeek !== undefined
        ? parsed.sendDayOfWeek
        : existing.sendDayOfWeek,
    sendHourJst:
      obj.sendHourJst !== undefined ? parsed.sendHourJst : existing.sendHourJst,
    includeSchedule:
      typeof obj.includeSchedule === "boolean"
        ? obj.includeSchedule
        : existing.includeSchedule,
    includeUnanswered:
      typeof obj.includeUnanswered === "boolean"
        ? obj.includeUnanswered
        : existing.includeUnanswered,
    includeOpsSummary:
      typeof obj.includeOpsSummary === "boolean"
        ? obj.includeOpsSummary
        : existing.includeOpsSummary,
    includeScheduleUrl:
      typeof obj.includeScheduleUrl === "boolean"
        ? obj.includeScheduleUrl
        : existing.includeScheduleUrl,
    skipWhenNoEvents:
      typeof obj.skipWhenNoEvents === "boolean"
        ? obj.skipWhenNoEvents
        : existing.skipWhenNoEvents,
    lastSentWeekKey: existing.lastSentWeekKey,
    lastSentAt: existing.lastSentAt,
  };
}

liffPhase3TeamToolsRouter.get("/line-reminder-settings", async (c) => {
  try {
    await ensureAllSchemasOnce(c.env.DB);
    const access = await resolveCallerTeamAccess(c);
    const requestedTeamId = (c.req.query("teamId") || "").trim();
    const hasBotToken = Boolean((c.env.LINE_CHANNEL_ACCESS_TOKEN || "").trim());

    if (!requestedTeamId || requestedTeamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        canManage: true,
        hasBotToken,
        hasLineGroupLinked: false,
        lineGroupId: "",
        isAutoReportEnabled: false,
        reportPlayballEnabled: true,
        reportInningEnabled: true,
        reportGameSetEnabled: true,
        reminderSettings: { ...DEFAULT_WEEKEND_REMINDER_SETTINGS },
      });
    }

    if (!access.canAccessTeam(requestedTeamId)) {
      return c.json(
        { success: false, error: "このチームの設定を閲覧する権限がありません" },
        403
      );
    }

    const db = drizzle(c.env.DB, { schema });
    const teamRow = await db
      .select({
        id: teams.id,
        lineGroupId: teams.lineGroupId,
        isAutoReportEnabled: teams.isAutoReportEnabled,
        reportPlayballEnabled: teams.reportPlayballEnabled,
        reportInningEnabled: teams.reportInningEnabled,
        reportGameSetEnabled: teams.reportGameSetEnabled,
        weekendReminderSettings: teams.weekendReminderSettings,
      })
      .from(teams)
      .where(eq(teams.id, requestedTeamId))
      .get();

    if (!teamRow) {
      return c.json({ success: false, error: "チームが見つかりません" }, 404);
    }

    const canManage = access.canManageTeamId(requestedTeamId);
    const cleanGroupId = (teamRow.lineGroupId || "").trim();
    const reminderSettings = parseWeekendReminderSettingsJson(
      teamRow.weekendReminderSettings
    );

    return c.json({
      success: true,
      isDemo: false,
      canManage,
      hasBotToken,
      hasLineGroupLinked: Boolean(cleanGroupId),
      lineGroupId: canManage ? cleanGroupId : "",
      isAutoReportEnabled: Boolean(teamRow.isAutoReportEnabled),
      reportPlayballEnabled: teamRow.reportPlayballEnabled !== false,
      reportInningEnabled: teamRow.reportInningEnabled !== false,
      reportGameSetEnabled: teamRow.reportGameSetEnabled !== false,
      reminderSettings,
    });
  } catch (err) {
    console.error("[GET /api/liff/line-reminder-settings] Error:", err);
    return c.json(
      { success: false, error: "LINE連携・リマインド設定の取得に失敗しました" },
      500
    );
  }
});

interface SaveLineReminderSettingsBody {
  teamId?: string;
  lineGroupId?: string | null;
  isAutoReportEnabled?: boolean;
  reportPlayballEnabled?: boolean;
  reportInningEnabled?: boolean;
  reportGameSetEnabled?: boolean;
  reminderSettings?: Partial<WeekendReminderSettings>;
}

liffPhase3TeamToolsRouter.post("/line-reminder-settings", async (c) => {
  try {
    await ensureAllSchemasOnce(c.env.DB);
    const access = await resolveCallerTeamAccess(c);
    const body = (await c.req.json()) as SaveLineReminderSettingsBody;
    const teamId = (body.teamId || "").trim();

    if (!teamId || teamId === "demo-team") {
      const mergedDemo = mergeIncomingReminderSettings(
        body.reminderSettings,
        DEFAULT_WEEKEND_REMINDER_SETTINGS
      );
      return c.json({
        success: true,
        isDemo: true,
        lineGroupId: (body.lineGroupId || "").trim(),
        hasLineGroupLinked: Boolean((body.lineGroupId || "").trim()),
        isAutoReportEnabled: Boolean(body.isAutoReportEnabled),
        reportPlayballEnabled: body.reportPlayballEnabled !== false,
        reportInningEnabled: body.reportInningEnabled !== false,
        reportGameSetEnabled: body.reportGameSetEnabled !== false,
        reminderSettings: mergedDemo,
      });
    }

    if (!access.canManageTeamId(teamId)) {
      return c.json(
        {
          success: false,
          error: "LINEグループ連携・自動リマインド設定の変更には管理者権限が必要です",
        },
        403
      );
    }

    const db = drizzle(c.env.DB, { schema });
    const teamRow = await db
      .select({
        id: teams.id,
        lineGroupId: teams.lineGroupId,
        isAutoReportEnabled: teams.isAutoReportEnabled,
        reportPlayballEnabled: teams.reportPlayballEnabled,
        reportInningEnabled: teams.reportInningEnabled,
        reportGameSetEnabled: teams.reportGameSetEnabled,
        weekendReminderSettings: teams.weekendReminderSettings,
      })
      .from(teams)
      .where(eq(teams.id, teamId))
      .get();

    if (!teamRow) {
      return c.json({ success: false, error: "チームが見つかりません" }, 404);
    }

    let nextLineGroupId = teamRow.lineGroupId;
    if (body.lineGroupId !== undefined) {
      const trimmed = (body.lineGroupId || "").trim();
      if (!trimmed) {
        nextLineGroupId = null;
      } else if (!isValidLineGroupTargetId(trimmed)) {
        return c.json(
          {
            success: false,
            error:
              "LINEグループIDの形式が正しくありません（C または R から始まるIDを入力してください）",
          },
          400
        );
      } else {
        nextLineGroupId = trimmed;
      }
    }

    const currentReminder = parseWeekendReminderSettingsJson(
      teamRow.weekendReminderSettings
    );
    const nextReminder = mergeIncomingReminderSettings(
      body.reminderSettings,
      currentReminder
    );

    if (nextReminder.enabled && !isValidLineGroupTargetId(nextLineGroupId)) {
      return c.json(
        {
          success: false,
          error:
            "週末自動リマインドをONにするには、先にLINEグループIDを登録してください",
        },
        400
      );
    }

    const nextIsAutoReport =
      typeof body.isAutoReportEnabled === "boolean"
        ? body.isAutoReportEnabled
        : Boolean(teamRow.isAutoReportEnabled);
    const nextPlayball =
      typeof body.reportPlayballEnabled === "boolean"
        ? body.reportPlayballEnabled
        : teamRow.reportPlayballEnabled !== false;
    const nextInning =
      typeof body.reportInningEnabled === "boolean"
        ? body.reportInningEnabled
        : teamRow.reportInningEnabled !== false;
    const nextGameSet =
      typeof body.reportGameSetEnabled === "boolean"
        ? body.reportGameSetEnabled
        : teamRow.reportGameSetEnabled !== false;

    await db
      .update(teams)
      .set({
        lineGroupId: nextLineGroupId,
        isAutoReportEnabled: nextIsAutoReport,
        reportPlayballEnabled: nextPlayball,
        reportInningEnabled: nextInning,
        reportGameSetEnabled: nextGameSet,
        weekendReminderSettings: JSON.stringify(nextReminder),
      })
      .where(eq(teams.id, teamId));

    return c.json({
      success: true,
      isDemo: false,
      lineGroupId: nextLineGroupId || "",
      hasLineGroupLinked: Boolean(nextLineGroupId),
      isAutoReportEnabled: nextIsAutoReport,
      reportPlayballEnabled: nextPlayball,
      reportInningEnabled: nextInning,
      reportGameSetEnabled: nextGameSet,
      reminderSettings: nextReminder,
    });
  } catch (err) {
    console.error("[POST /api/liff/line-reminder-settings] Error:", err);
    return c.json(
      { success: false, error: "LINE連携・リマインド設定の保存に失敗しました" },
      500
    );
  }
});

interface PreviewLineReminderBody {
  teamId?: string;
  reminderSettings?: Partial<WeekendReminderSettings>;
}

liffPhase3TeamToolsRouter.post("/line-reminder-preview", async (c) => {
  try {
    await ensureAllSchemasOnce(c.env.DB);
    const access = await resolveCallerTeamAccess(c);
    const body = (await c.req.json()) as PreviewLineReminderBody;
    const teamId = (body.teamId || "").trim();
    const now = new Date();
    const reqOrigin = new URL(c.req.url).origin;
    const appBaseUrl =
      c.env.NEXT_PUBLIC_API_URL || c.env.BETTER_AUTH_URL || reqOrigin;

    const previewSettings = mergeIncomingReminderSettings(
      body.reminderSettings,
      DEFAULT_WEEKEND_REMINDER_SETTINGS
    );

    if (!teamId || teamId === "demo-team") {
      const demoDigest = buildDemoWeekendReminderDigest(now, appBaseUrl);
      const message = buildWeekendReminderMessage(demoDigest, previewSettings);
      return c.json({
        success: true,
        isDemo: true,
        weekendRangeLabel: demoDigest.weekendRangeLabel,
        eventCount: demoDigest.events.length,
        message,
      });
    }

    if (!access.canAccessTeam(teamId)) {
      return c.json(
        { success: false, error: "このチームのプレビューを表示する権限がありません" },
        403
      );
    }

    const digest = await loadTeamWeekendReminderDigest(
      c.env.DB,
      teamId,
      now,
      appBaseUrl
    );
    if (!digest) {
      return c.json({ success: false, error: "チームが見つかりません" }, 404);
    }

    const message = buildWeekendReminderMessage(digest, previewSettings);
    return c.json({
      success: true,
      isDemo: false,
      weekendRangeLabel: digest.weekendRangeLabel,
      eventCount: digest.events.length,
      message,
    });
  } catch (err) {
    console.error("[POST /api/liff/line-reminder-preview] Error:", err);
    return c.json(
      { success: false, error: "リマインド文面プレビューの生成に失敗しました" },
      500
    );
  }
});

interface TestPushLineReminderBody {
  teamId?: string;
  lineGroupId?: string | null;
  reminderSettings?: Partial<WeekendReminderSettings>;
}

liffPhase3TeamToolsRouter.post("/line-reminder-test-push", async (c) => {
  try {
    await ensureAllSchemasOnce(c.env.DB);
    const access = await resolveCallerTeamAccess(c);
    const body = (await c.req.json()) as TestPushLineReminderBody;
    const teamId = (body.teamId || "").trim();

    if (!teamId || teamId === "demo-team") {
      return c.json(
        {
          success: false,
          error: "体験デモモードでは実際のLINEグループへのテスト送信は行えません",
        },
        400
      );
    }

    if (!access.canManageTeamId(teamId)) {
      return c.json(
        { success: false, error: "LINEテスト送信には管理者権限が必要です" },
        403
      );
    }

    const accessToken = (c.env.LINE_CHANNEL_ACCESS_TOKEN || "").trim();
    if (!accessToken) {
      return c.json(
        {
          success: false,
          error:
            "サーバーに LINE_CHANNEL_ACCESS_TOKEN が設定されていません。Cloudflare Workers のシークレット設定をご確認ください。",
        },
        503
      );
    }

    const db = drizzle(c.env.DB, { schema });
    const teamRow = await db
      .select({
        id: teams.id,
        lineGroupId: teams.lineGroupId,
        weekendReminderSettings: teams.weekendReminderSettings,
      })
      .from(teams)
      .where(eq(teams.id, teamId))
      .get();

    if (!teamRow) {
      return c.json({ success: false, error: "チームが見つかりません" }, 404);
    }

    const targetGroupId = (
      body.lineGroupId !== undefined ? body.lineGroupId || "" : teamRow.lineGroupId || ""
    ).trim();

    if (!isValidLineGroupTargetId(targetGroupId)) {
      return c.json(
        {
          success: false,
          error:
            "送信先のLINEグループID（C... または R...）を正しく入力してください",
        },
        400
      );
    }

    const savedSettings = parseWeekendReminderSettingsJson(
      teamRow.weekendReminderSettings
    );
    const effectiveSettings = mergeIncomingReminderSettings(
      body.reminderSettings,
      savedSettings
    );

    const now = new Date();
    const reqOrigin = new URL(c.req.url).origin;
    const appBaseUrl =
      c.env.NEXT_PUBLIC_API_URL || c.env.BETTER_AUTH_URL || reqOrigin;
    const digest = await loadTeamWeekendReminderDigest(
      c.env.DB,
      teamId,
      now,
      appBaseUrl
    );
    if (!digest) {
      return c.json({ success: false, error: "チームデータの取得に失敗しました" }, 404);
    }

    const message = buildWeekendReminderMessage(digest, effectiveSettings, {
      isTest: true,
    });
    const pushRes = await sendLinePushMessage(targetGroupId, message, accessToken);
    if (!pushRes.success) {
      return c.json(
        {
          success: false,
          error:
            "LINEへの送信に失敗しました。公式アカウントが該当グループに参加しているか、グループIDが正しいかご確認ください。",
        },
        502
      );
    }

    return c.json({
      success: true,
      message: "LINEグループへテスト配信を送信しました！",
      previewMessage: message,
    });
  } catch (err) {
    console.error("[POST /api/liff/line-reminder-test-push] Error:", err);
    return c.json(
      { success: false, error: "LINEテスト送信中にエラーが発生しました" },
      500
    );
  }
});

// =========================================================
// 📣 トップページ最上部ティッカー設定 ＆ 手動ピン留め連絡 API
// =========================================================

interface SaveHubTickerBody {
  teamId?: string;
  config?: Partial<HubTickerConfig>;
}

liffPhase3TeamToolsRouter.get("/hub-ticker", async (c) => {
  try {
    await ensureAllSchemasOnce(c.env.DB);
    const access = await resolveCallerTeamAccess(c);
    const teamId = (c.req.query("teamId") || "").trim();

    if (!teamId || teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        canManage: true,
        config: DEMO_DEFAULT_HUB_TICKER_CONFIG,
      });
    }

    if (!access.canAccessTeam(teamId)) {
      return c.json(
        { success: false, error: "このチームへのアクセス権限がありません" },
        403
      );
    }

    const db = drizzle(c.env.DB, { schema });
    const teamRow = await db
      .select({
        id: teams.id,
        hubTickerJson: teams.hubTickerJson,
      })
      .from(teams)
      .where(eq(teams.id, teamId))
      .get();

    if (!teamRow) {
      return c.json({ success: false, error: "チームが見つかりません" }, 404);
    }

    return c.json({
      success: true,
      isDemo: false,
      canManage: access.canManageTeamId(teamId),
      config: parseHubTickerConfigJson(teamRow.hubTickerJson),
    });
  } catch (err) {
    console.error("[GET /api/liff/hub-ticker] Error:", err);
    return c.json(
      { success: false, error: "ティッカー設定の取得に失敗しました" },
      500
    );
  }
});

liffPhase3TeamToolsRouter.post("/hub-ticker", async (c) => {
  try {
    await ensureAllSchemasOnce(c.env.DB);
    const access = await resolveCallerTeamAccess(c);
    const body = (await c.req.json()) as SaveHubTickerBody;
    const teamId = (body.teamId || "").trim();

    const normalizedInput = parseHubTickerConfigJson(body.config);
    const updaterName = (
      access.primaryUserName ||
      access.headerUserName ||
      access.sessionUser?.name ||
      "管理者"
    )
      .trim()
      .slice(0, 40);

    const stampedConfig: HubTickerConfig = {
      ...normalizedInput,
      manualItems: normalizedInput.manualItems.map((item) => ({
        ...item,
        updatedBy: item.updatedBy || updaterName,
      })),
    };

    if (!teamId || teamId === "demo-team") {
      return c.json({
        success: true,
        isDemo: true,
        config: stampedConfig,
      });
    }

    if (!access.canManageTeamId(teamId)) {
      return c.json(
        {
          success: false,
          error: "トップ案内メッセージ・設定の編集には監督・管理者権限が必要です",
        },
        403
      );
    }

    const db = drizzle(c.env.DB, { schema });
    const teamRow = await db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.id, teamId))
      .get();

    if (!teamRow) {
      return c.json({ success: false, error: "チームが見つかりません" }, 404);
    }

    await db
      .update(teams)
      .set({
        hubTickerJson: serializeHubTickerConfigJson(stampedConfig),
      })
      .where(eq(teams.id, teamId));

    return c.json({
      success: true,
      isDemo: false,
      config: stampedConfig,
    });
  } catch (err) {
    console.error("[POST /api/liff/hub-ticker] Error:", err);
    return c.json(
      { success: false, error: "トップ案内メッセージの保存に失敗しました" },
      500
    );
  }
});

export default liffPhase3TeamToolsRouter;

