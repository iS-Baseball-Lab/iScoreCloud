// filepath: src/lib/line/weekend-reminder.ts
import { drizzle } from "drizzle-orm/d1";
import { and, asc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { ensureAllSchemasOnce } from "@/lib/db-helper";
import { resolveEffectivePlayerConditionOnDate } from "@/lib/liff/player-condition";
import { sendLinePushMessage } from "@/lib/line/push";
import { loadTeamPlayerConditionPeriodsMap } from "@/lib/player-roster-cleanup";
import type { WorkerEnv } from "@/types/api";

const { teams, organizations, events, attendances, players, eventCarpools } = schema;

/**
 * 📣 週末予定 ＆ 出欠・配車自動リマインド設定
 * - ユーザー要望により初期値は完全オフ (`enabled: false`)
 */
export interface WeekendReminderSettings {
  /** 自動送信の有効・無効（初期値: false = 完全オフ） */
  enabled: boolean;
  /** 配信曜日（JST: 3=水曜, 4=木曜, 5=金曜） */
  sendDayOfWeek: 3 | 4 | 5;
  /** 配信時刻（JST 24時間表記: 18〜21時） */
  sendHourJst: 18 | 19 | 20 | 21;
  /** 週末予定一覧を含めるか */
  includeSchedule: boolean;
  /** 出欠未回答の選手一覧を含めるか */
  includeUnanswered: boolean;
  /** 配車台数・当番班サマリーを含めるか */
  includeOpsSummary: boolean;
  /** LIFFスケジュール回答URLを末尾に付与するか */
  includeScheduleUrl: boolean;
  /** 週末予定が0件の週は送信を自動スキップするか */
  skipWhenNoEvents: boolean;
  /** 二重送信防止用の直近送信済み週末キー（土曜日 YYYY-MM-DD） */
  lastSentWeekKey: string | null;
  /** 直近送信日時（ISO 8601） */
  lastSentAt: string | null;
}

export const DEFAULT_WEEKEND_REMINDER_SETTINGS: WeekendReminderSettings = {
  enabled: false,
  sendDayOfWeek: 4,
  sendHourJst: 20,
  includeSchedule: true,
  includeUnanswered: true,
  includeOpsSummary: true,
  includeScheduleUrl: true,
  skipWhenNoEvents: true,
  lastSentWeekKey: null,
  lastSentAt: null,
};

export interface WeekendEventDigestItem {
  id: string;
  dateLabel: string;
  timeLabel: string;
  title: string;
  location: string | null;
  targetGroup: string | null;
  dutyGroup: string | null;
  needsLunch: boolean;
  presentPlayerCount: number;
  absentPlayerCount: number;
  unansweredPlayerNames: string[];
  carCount: number;
  carOfferCount: number;
}

export interface WeekendReminderDigest {
  teamName: string;
  weekendKey: string;
  weekendRangeLabel: string;
  events: WeekendEventDigestItem[];
  scheduleUrl: string;
}

const JST_OFFSET_MS = 9 * 3600_000;
const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

export function parseWeekendReminderSettingsJson(
  raw: unknown
): WeekendReminderSettings {
  if (!raw) {
    return { ...DEFAULT_WEEKEND_REMINDER_SETTINGS };
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
    return { ...DEFAULT_WEEKEND_REMINDER_SETTINGS };
  }

  const rawDay = Number(obj.sendDayOfWeek);
  const sendDayOfWeek: 3 | 4 | 5 =
    rawDay === 3 || rawDay === 4 || rawDay === 5 ? rawDay : 4;

  const rawHour = Number(obj.sendHourJst);
  const sendHourJst: 18 | 19 | 20 | 21 =
    rawHour === 18 || rawHour === 19 || rawHour === 20 || rawHour === 21
      ? rawHour
      : 20;

  return {
    // 明示的に true が保存されている場合のみ ON（それ以外は必ず OFF）
    enabled: obj.enabled === true,
    sendDayOfWeek,
    sendHourJst,
    includeSchedule:
      typeof obj.includeSchedule === "boolean" ? obj.includeSchedule : true,
    includeUnanswered:
      typeof obj.includeUnanswered === "boolean" ? obj.includeUnanswered : true,
    includeOpsSummary:
      typeof obj.includeOpsSummary === "boolean" ? obj.includeOpsSummary : true,
    includeScheduleUrl:
      typeof obj.includeScheduleUrl === "boolean"
        ? obj.includeScheduleUrl
        : true,
    skipWhenNoEvents:
      typeof obj.skipWhenNoEvents === "boolean" ? obj.skipWhenNoEvents : true,
    lastSentWeekKey:
      typeof obj.lastSentWeekKey === "string" && obj.lastSentWeekKey.trim()
        ? obj.lastSentWeekKey.trim()
        : null,
    lastSentAt:
      typeof obj.lastSentAt === "string" && obj.lastSentAt.trim()
        ? obj.lastSentAt.trim()
        : null,
  };
}

export function isValidLineGroupTargetId(
  lineGroupId: string | null | undefined
): boolean {
  if (!lineGroupId) return false;
  const clean = lineGroupId.trim();
  // LINE Messaging API の groupId (C...) または roomId (R...) 形式（通常33文字）
  return /^[CR][0-9a-fA-F]{16,64}$/.test(clean);
}

export function resolveJstClockParts(now: Date): {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number;
  hour: number;
  isoDate: string;
} {
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  const year = jst.getUTCFullYear();
  const month = jst.getUTCMonth() + 1;
  const day = jst.getUTCDate();
  const dayOfWeek = jst.getUTCDay();
  const hour = jst.getUTCHours();
  const isoDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { year, month, day, dayOfWeek, hour, isoDate };
}

/**
 * 基準日時（JST）から直近の週末（土曜日 00:00 JST 〜 月曜日 00:00 JST）ウィンドウを算出
 */
export function resolveUpcomingWeekendWindowJst(now: Date): {
  weekendKey: string;
  weekendRangeLabel: string;
  startUtc: Date;
  endUtc: Date;
} {
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  const dow = jst.getUTCDay(); // 0=Sun .. 6=Sat
  // 日曜日の場合は前日土曜〜当日日曜を対象週末とし、月〜土は今週土曜〜日曜を対象とする
  const daysUntilSaturday = dow === 0 ? -1 : 6 - dow;

  const satUtcBaseMs =
    Date.UTC(
      jst.getUTCFullYear(),
      jst.getUTCMonth(),
      jst.getUTCDate() + daysUntilSaturday,
      0,
      0,
      0
    ) - JST_OFFSET_MS;
  const monUtcBaseMs = satUtcBaseMs + 2 * 86_400_000;

  const satJst = new Date(satUtcBaseMs + JST_OFFSET_MS);
  const sunJst = new Date(satUtcBaseMs + 86_400_000 + JST_OFFSET_MS);
  const satY = satJst.getUTCFullYear();
  const satM = satJst.getUTCMonth() + 1;
  const satD = satJst.getUTCDate();
  const sunM = sunJst.getUTCMonth() + 1;
  const sunD = sunJst.getUTCDate();

  const weekendKey = `${satY}-${String(satM).padStart(2, "0")}-${String(satD).padStart(2, "0")}`;
  const weekendRangeLabel = `${satM}/${satD}(土)〜${sunM}/${sunD}(日)`;

  return {
    weekendKey,
    weekendRangeLabel,
    startUtc: new Date(satUtcBaseMs),
    endUtc: new Date(monUtcBaseMs),
  };
}

export function shouldTriggerWeekendReminderNow(params: {
  settings: WeekendReminderSettings;
  lineGroupId: string | null | undefined;
  now: Date;
}): { shouldSend: boolean; weekendKey: string; reason: string } {
  const { settings, lineGroupId, now } = params;
  const window = resolveUpcomingWeekendWindowJst(now);

  if (!settings.enabled) {
    return {
      shouldSend: false,
      weekendKey: window.weekendKey,
      reason: "disabled",
    };
  }
  if (!isValidLineGroupTargetId(lineGroupId)) {
    return {
      shouldSend: false,
      weekendKey: window.weekendKey,
      reason: "missing_or_invalid_group_id",
    };
  }
  if (settings.lastSentWeekKey === window.weekendKey) {
    return {
      shouldSend: false,
      weekendKey: window.weekendKey,
      reason: "already_sent_this_week",
    };
  }

  const clock = resolveJstClockParts(now);
  if (clock.dayOfWeek !== settings.sendDayOfWeek) {
    return {
      shouldSend: false,
      weekendKey: window.weekendKey,
      reason: "day_mismatch",
    };
  }
  if (clock.hour !== settings.sendHourJst) {
    return {
      shouldSend: false,
      weekendKey: window.weekendKey,
      reason: "hour_mismatch",
    };
  }

  return {
    shouldSend: true,
    weekendKey: window.weekendKey,
    reason: "matched",
  };
}

export function formatJstEventDateTimeLabels(
  startAt: Date,
  endAt?: Date | null
): { dateLabel: string; timeLabel: string; isoDate: string } {
  const sJst = new Date(startAt.getTime() + JST_OFFSET_MS);
  const y = sJst.getUTCFullYear();
  const m = sJst.getUTCMonth() + 1;
  const d = sJst.getUTCDate();
  const wd = WEEKDAY_JA[sJst.getUTCDay()] || "";
  const sh = String(sJst.getUTCHours()).padStart(2, "0");
  const sm = String(sJst.getUTCMinutes()).padStart(2, "0");
  let timeLabel = `${sh}:${sm}〜`;
  if (endAt && !Number.isNaN(endAt.getTime())) {
    const eJst = new Date(endAt.getTime() + JST_OFFSET_MS);
    const eh = String(eJst.getUTCHours()).padStart(2, "0");
    const em = String(eJst.getUTCMinutes()).padStart(2, "0");
    timeLabel = `${sh}:${sm}〜${eh}:${em}`;
  }
  return {
    dateLabel: `${m}/${d}(${wd})`,
    timeLabel,
    isoDate: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
  };
}

export function buildWeekendReminderMessage(
  digest: WeekendReminderDigest,
  settings: Pick<
    WeekendReminderSettings,
    | "includeSchedule"
    | "includeUnanswered"
    | "includeOpsSummary"
    | "includeScheduleUrl"
  >,
  options?: { isTest?: boolean }
): string {
  const lines: string[] = [];
  const prefix = options?.isTest ? "🧪【テスト配信】" : "📣";
  lines.push(
    `${prefix}【週末予定＆出欠リマインド】\n${digest.teamName}（${digest.weekendRangeLabel}）`
  );

  if (digest.events.length === 0) {
    lines.push("");
    lines.push("今週末に登録されているチーム予定はありません。");
  } else {
    for (const ev of digest.events) {
      lines.push("");
      const targetTag =
        ev.targetGroup && ev.targetGroup !== "全体" ? ` [${ev.targetGroup}]` : "";
      lines.push(`━━━━━━━━━━━━━━`);
      lines.push(`📅 ${ev.dateLabel} ${ev.title}${targetTag}`);

      if (settings.includeSchedule) {
        const loc = ev.location?.trim() || "場所未定";
        const lunchTag = ev.needsLunch ? " / 🍙弁当あり" : "";
        lines.push(`🕒 ${ev.timeLabel} ＠${loc}${lunchTag}`);
      }

      lines.push(
        `👥 選手出欠：参加 ${ev.presentPlayerCount}名 / 欠席 ${ev.absentPlayerCount}名 / 未回答 ${ev.unansweredPlayerNames.length}名`
      );

      if (settings.includeOpsSummary) {
        const opsParts: string[] = [];
        if (ev.dutyGroup && ev.dutyGroup !== "なし") {
          opsParts.push(`当番:${ev.dutyGroup}`);
        }
        if (ev.carCount > 0) {
          opsParts.push(`配車確定:${ev.carCount}台`);
        } else if (ev.carOfferCount > 0) {
          opsParts.push(`車出し可:${ev.carOfferCount}台`);
        }
        if (opsParts.length > 0) {
          lines.push(`🚗 ${opsParts.join(" / ")}`);
        }
      }

      if (settings.includeUnanswered) {
        if (ev.unansweredPlayerNames.length === 0) {
          lines.push(`✅ 全選手回答済みです！ありがとうございます！`);
        } else {
          const previewNames = ev.unansweredPlayerNames.slice(0, 12);
          const extra =
            ev.unansweredPlayerNames.length > 12
              ? ` ほか${ev.unansweredPlayerNames.length - 12}名`
              : "";
          lines.push(`⏳ 未回答：${previewNames.join("・")}${extra}`);
        }
      }
    }
    lines.push(`━━━━━━━━━━━━━━`);
  }

  if (settings.includeScheduleUrl && digest.scheduleUrl) {
    lines.push("");
    lines.push(`▼ 出欠・車出し回答はこちら`);
    lines.push(digest.scheduleUrl);
  }

  return lines.join("\n");
}

export async function loadTeamWeekendReminderDigest(
  d1: D1Database,
  teamId: string,
  now: Date,
  appBaseUrl: string
): Promise<WeekendReminderDigest | null> {
  const db = drizzle(d1, { schema });
  const teamRow = await db
    .select({
      id: teams.id,
      name: teams.name,
      orgName: organizations.name,
    })
    .from(teams)
    .leftJoin(organizations, eq(teams.organizationId, organizations.id))
    .where(eq(teams.id, teamId))
    .get();

  if (!teamRow) return null;

  const window = resolveUpcomingWeekendWindowJst(now);
  const cleanOrigin = (appBaseUrl || "https://iscorecloud.com")
    .trim()
    .replace(/\/+$/, "");

  const [weekendEvents, rosterPlayers, periodsByPlayerId] = await Promise.all([
    db
      .select()
      .from(events)
      .where(
        and(
          eq(events.teamId, teamId),
          gte(events.startAt, window.startUtc),
          lt(events.startAt, window.endUtc)
        )
      )
      .orderBy(asc(events.startAt))
      .all(),
    db
      .select({
        id: players.id,
        name: players.name,
        isActive: players.isActive,
        conditionStatus: players.conditionStatus,
      })
      .from(players)
      .where(eq(players.teamId, teamId))
      .all(),
    loadTeamPlayerConditionPeriodsMap(d1, teamId),
  ]);

  const activeWeekendEvents = weekendEvents.filter(
    (ev) => ev.status !== "rainout"
  );
  const eventIds = activeWeekendEvents.map((ev) => ev.id);

  const [attRows, carCountRows] =
    eventIds.length > 0
      ? await Promise.all([
          db
            .select({
              eventId: attendances.eventId,
              playerId: attendances.playerId,
              memberId: attendances.memberId,
              status: attendances.status,
              hasCar: attendances.hasCar,
            })
            .from(attendances)
            .where(inArray(attendances.eventId, eventIds))
            .all(),
          db
            .select({
              eventId: eventCarpools.eventId,
              count: sql<number>`count(*)`,
            })
            .from(eventCarpools)
            .where(inArray(eventCarpools.eventId, eventIds))
            .groupBy(eventCarpools.eventId)
            .all(),
        ])
      : [[], []];

  const carCountByEvent = new Map<string, number>();
  for (const r of carCountRows) {
    carCountByEvent.set(r.eventId, Number(r.count) || 0);
  }

  const todayClock = resolveJstClockParts(now);
  const activeRoster = rosterPlayers.filter((p) => p.isActive !== false);

  const digestItems: WeekendEventDigestItem[] = activeWeekendEvents.map((ev) => {
    const dtLabels = formatJstEventDateTimeLabels(
      new Date(ev.startAt),
      ev.endAt ? new Date(ev.endAt) : null
    );
    const evAtts = attRows.filter((a) => a.eventId === ev.id);
    const playerStatusMap = new Map<string, string>();
    let carOfferCount = 0;

    for (const a of evAtts) {
      if (a.playerId && a.status) {
        playerStatusMap.set(a.playerId, a.status);
      }
      if (!a.playerId && a.hasCar && a.status !== "absent") {
        carOfferCount += 1;
      }
    }

    let presentPlayerCount = 0;
    let absentPlayerCount = 0;
    const unansweredPlayerNames: string[] = [];

    for (const p of activeRoster) {
      const cond = resolveEffectivePlayerConditionOnDate({
        conditionPeriods: periodsByPlayerId.get(p.id) || [],
        fallbackStatus: p.conditionStatus,
        dateKey: dtLabels.isoDate,
        todayKey: todayClock.isoDate,
      });
      // 休部中（on_leave）の選手は未回答督促対象から除外
      if (cond.status === "on_leave") continue;

      const st = playerStatusMap.get(p.id) || "pending";
      if (st === "absent") {
        absentPlayerCount += 1;
      } else if (st === "pending") {
        unansweredPlayerNames.push(p.name || "選手");
      } else {
        presentPlayerCount += 1;
      }
    }

    return {
      id: ev.id,
      dateLabel: dtLabels.dateLabel,
      timeLabel: dtLabels.timeLabel,
      title: ev.title,
      location: ev.location || null,
      targetGroup: ev.targetGroup || null,
      dutyGroup: ev.dutyGroup || null,
      needsLunch: Boolean(ev.needsLunch),
      presentPlayerCount,
      absentPlayerCount,
      unansweredPlayerNames,
      carCount: carCountByEvent.get(ev.id) || 0,
      carOfferCount,
    };
  });

  const resolvedTeamName = teamRow.orgName
    ? `${teamRow.orgName}（${teamRow.name}）`
    : teamRow.name;

  return {
    teamName: resolvedTeamName,
    weekendKey: window.weekendKey,
    weekendRangeLabel: window.weekendRangeLabel,
    events: digestItems,
    scheduleUrl: `${cleanOrigin}/liff/schedule`,
  };
}

export async function runScheduledWeekendReminders(
  env: WorkerEnv,
  now: Date = new Date()
): Promise<{
  checkedTeams: number;
  sentTeams: number;
  skippedTeams: number;
}> {
  const accessToken = (env.LINE_CHANNEL_ACCESS_TOKEN || "").trim();
  if (!accessToken) {
    return { checkedTeams: 0, sentTeams: 0, skippedTeams: 0 };
  }

  await ensureAllSchemasOnce(env.DB);
  const db = drizzle(env.DB, { schema });

  // line_group_id と weekend_reminder_settings の両方が設定されているチームのみ抽出（D1読取最小化）
  const candidateTeams = await db
    .select({
      id: teams.id,
      lineGroupId: teams.lineGroupId,
      weekendReminderSettings: teams.weekendReminderSettings,
    })
    .from(teams)
    .where(
      and(
        isNotNull(teams.lineGroupId),
        isNotNull(teams.weekendReminderSettings)
      )
    )
    .all();

  let sentTeams = 0;
  let skippedTeams = 0;
  const appBaseUrl =
    env.NEXT_PUBLIC_API_URL || env.BETTER_AUTH_URL || "https://iscorecloud.com";

  for (const t of candidateTeams) {
    if (!t.id || t.id === "demo-team") continue;
    const settings = parseWeekendReminderSettingsJson(t.weekendReminderSettings);
    const decision = shouldTriggerWeekendReminderNow({
      settings,
      lineGroupId: t.lineGroupId,
      now,
    });
    if (!decision.shouldSend || !t.lineGroupId) {
      skippedTeams += 1;
      continue;
    }

    const digest = await loadTeamWeekendReminderDigest(
      env.DB,
      t.id,
      now,
      appBaseUrl
    );
    if (!digest) {
      skippedTeams += 1;
      continue;
    }
    if (digest.events.length === 0 && settings.skipWhenNoEvents) {
      skippedTeams += 1;
      continue;
    }

    const message = buildWeekendReminderMessage(digest, settings);
    const pushRes = await sendLinePushMessage(
      t.lineGroupId.trim(),
      message,
      accessToken
    );

    if (pushRes.success) {
      const updatedSettings: WeekendReminderSettings = {
        ...settings,
        lastSentWeekKey: decision.weekendKey,
        lastSentAt: now.toISOString(),
      };
      await db
        .update(teams)
        .set({
          weekendReminderSettings: JSON.stringify(updatedSettings),
        })
        .where(eq(teams.id, t.id));
      sentTeams += 1;
    } else {
      skippedTeams += 1;
    }
  }

  return {
    checkedTeams: candidateTeams.length,
    sentTeams,
    skippedTeams,
  };
}
