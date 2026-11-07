// filepath: src/lib/liff/group-attendance.ts
import { normalizePlayerConditionStatus } from "@/lib/liff/player-condition";

export type AttendanceGroupKey = "player" | "mother" | "father" | "staff";
export type NormalizedAttendanceBucket =
  | "duty"
  | "help"
  | "setup"
  | "game"
  | "absent"
  | "pending";

export interface GroupAttendanceCounts {
  total: number;
  present: number;
  absent: number;
  pending: number;
  duty: number;
  help: number;
  setup: number;
  game: number;
  onLeave?: number;
}

export interface EventGroupAttendanceMap {
  player: GroupAttendanceCounts;
  mother: GroupAttendanceCounts;
  father: GroupAttendanceCounts;
  staff: GroupAttendanceCounts;
}

export interface GroupStatusLabelItem {
  id: "duty" | "help" | "setup" | "game" | "absent";
  mark: string;
  label: string;
  enabled: boolean;
}

export type GroupStatusConfigSummary = Record<AttendanceGroupKey, GroupStatusLabelItem[]>;

export const ATTENDANCE_GROUP_ORDER: readonly AttendanceGroupKey[] = [
  "player",
  "mother",
  "father",
  "staff",
] as const;

export const ATTENDANCE_GROUP_META: Record<
  AttendanceGroupKey,
  {
    label: string;
    shortLabel: string;
    icon: string;
    accentDotClass: string;
    badgeBgClass: string;
  }
> = {
  player: {
    label: "選手",
    shortLabel: "選手",
    icon: "⚾",
    accentDotClass: "bg-primary",
    badgeBgClass: "bg-primary/12 text-primary border-primary/25",
  },
  mother: {
    label: "母",
    shortLabel: "母",
    icon: "👩",
    accentDotClass: "bg-rose-500",
    badgeBgClass: "bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/25",
  },
  father: {
    label: "父",
    shortLabel: "父",
    icon: "👨",
    accentDotClass: "bg-sky-600",
    badgeBgClass: "bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/25",
  },
  staff: {
    label: "スタッフ",
    shortLabel: "スタッフ",
    icon: "🧢",
    accentDotClass: "bg-teal-600",
    badgeBgClass: "bg-teal-500/12 text-teal-700 dark:text-teal-300 border-teal-500/25",
  },
};

export const DEFAULT_GROUP_STATUS_SUMMARY_CONFIG: GroupStatusConfigSummary = {
  player: [
    { id: "duty", mark: "◎", label: "出席", enabled: true },
    { id: "help", mark: "○", label: "ヘルプ", enabled: false },
    { id: "setup", mark: "▲", label: "設営撤収", enabled: false },
    { id: "game", mark: "△", label: "試合のみ", enabled: true },
    { id: "absent", mark: "×", label: "欠席", enabled: true },
  ],
  mother: [
    { id: "duty", mark: "◎", label: "当番", enabled: true },
    { id: "help", mark: "○", label: "ヘルプ", enabled: true },
    { id: "setup", mark: "▲", label: "設営撤収", enabled: true },
    { id: "game", mark: "△", label: "試合のみ", enabled: true },
    { id: "absent", mark: "×", label: "欠席", enabled: true },
  ],
  father: [
    { id: "duty", mark: "◎", label: "当番", enabled: true },
    { id: "help", mark: "○", label: "ヘルプ", enabled: true },
    { id: "setup", mark: "▲", label: "設営撤収", enabled: true },
    { id: "game", mark: "△", label: "試合のみ", enabled: true },
    { id: "absent", mark: "×", label: "欠席", enabled: true },
  ],
  staff: [
    { id: "duty", mark: "◎", label: "当番", enabled: true },
    { id: "help", mark: "○", label: "指導参加", enabled: true },
    { id: "setup", mark: "▲", label: "設営撤収", enabled: true },
    { id: "game", mark: "△", label: "試合のみ", enabled: true },
    { id: "absent", mark: "×", label: "欠席", enabled: true },
  ],
};

export function normalizeGroupStatusSummaryConfig(
  raw: unknown
): GroupStatusConfigSummary {
  let parsed: Record<string, unknown> | null = null;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const candidate = JSON.parse(raw) as unknown;
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
        parsed = candidate as Record<string, unknown>;
      }
    } catch {
      parsed = null;
    }
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    parsed = raw as Record<string, unknown>;
  }

  if (!parsed) {
    return DEFAULT_GROUP_STATUS_SUMMARY_CONFIG;
  }

  const result: GroupStatusConfigSummary = {
    player: DEFAULT_GROUP_STATUS_SUMMARY_CONFIG.player,
    mother: DEFAULT_GROUP_STATUS_SUMMARY_CONFIG.mother,
    father: DEFAULT_GROUP_STATUS_SUMMARY_CONFIG.father,
    staff: DEFAULT_GROUP_STATUS_SUMMARY_CONFIG.staff,
  };

  for (const key of ATTENDANCE_GROUP_ORDER) {
    const rawItems = parsed[key];
    if (!Array.isArray(rawItems)) continue;
    const mapped: GroupStatusLabelItem[] = [];
    for (const def of DEFAULT_GROUP_STATUS_SUMMARY_CONFIG[key]) {
      const found = rawItems.find(
        (it): it is Record<string, unknown> =>
          Boolean(it && typeof it === "object" && (it as Record<string, unknown>).id === def.id)
      );
      mapped.push({
        id: def.id,
        mark: typeof found?.mark === "string" && found.mark ? found.mark : def.mark,
        label: typeof found?.label === "string" && found.label ? found.label : def.label,
        enabled: typeof found?.enabled === "boolean" ? found.enabled : def.enabled,
      });
    }
    result[key] = mapped;
  }

  return result;
}

export interface RosterPlayerRow {
  id: string;
  userId?: string | null;
  isActive?: boolean | number | null;
  conditionStatus?: string | null;
}

export interface RosterTeamMemberRow {
  id: string;
  userId?: string | null;
  name?: string | null;
  memberType?: string | null;
  role?: string | null;
  subRoles?: string | null;
  status?: string | null;
}

export interface RosterParentChildRow {
  parentId: string | null;
  childId: string | null;
}

export interface ClassifiedTeamAttendanceRosters {
  playerIds: string[];
  motherIds: string[];
  fatherIds: string[];
  staffIds: string[];
  uniqueAllIds: string[];
  onLeavePlayerIds: Set<string>;
  memberIdByUserId: Map<string, string>;
  playerIdByUserId: Map<string, string>;
}

/**
 * 出欠一覧表（`/api/liff/attendance-matrix`）と100%同一ルールで
 * チーム在籍メンバーを「選手 / 母 / 父 / スタッフ」に分類する（O(N)・DBクエリゼロ）
 */
export function classifyTeamAttendanceRosters(params: {
  players: RosterPlayerRow[];
  teamMembers: RosterTeamMemberRow[];
  relations: RosterParentChildRow[];
}): ClassifiedTeamAttendanceRosters {
  const onLeavePlayerIds = new Set<string>();
  const activePlayerAllIds = new Set<string>();
  const playerIds: string[] = [];
  const playerIdByUserId = new Map<string, string>();

  for (const p of params.players) {
    if (p.isActive === false || p.isActive === 0) continue;
    activePlayerAllIds.add(p.id);
    const cond = normalizePlayerConditionStatus(p.conditionStatus);
    if (cond === "on_leave") {
      onLeavePlayerIds.add(p.id);
      continue;
    }
    playerIds.push(p.id);
    if (p.userId) {
      playerIdByUserId.set(p.userId, p.id);
    }
  }

  const parentsWithKidsSet = new Set<string>();
  for (const rel of params.relations) {
    if (rel.parentId && rel.childId && activePlayerAllIds.has(rel.childId)) {
      parentsWithKidsSet.add(rel.parentId);
    }
  }

  const activeAdults = params.teamMembers.filter(
    (m) => (m.status === "active" || !m.status) && m.memberType !== "player"
  );

  const memberIdByUserId = new Map<string, string>();
  for (const m of activeAdults) {
    if (!m.userId) continue;
    const existing = memberIdByUserId.get(m.userId);
    // 正規UUID（非 tm_）があれば優先
    if (!existing || (existing.startsWith("tm_") && !m.id.startsWith("tm_"))) {
      memberIdByUserId.set(m.userId, m.id);
    }
  }

  const motherIds: string[] = [];
  const fatherIds: string[] = [];
  const staffIds: string[] = [];

  for (const m of activeAdults) {
    const name = m.name || "";
    const hasKids = parentsWithKidsSet.has(m.id);
    const hasMotherKeyword =
      name.includes("母") ||
      name.includes("ママ") ||
      name.includes("妻") ||
      name.includes("お母さん");

    const isManagerOrAdmin = m.role === "manager" || m.role === "admin";
    const isScorerOrCoach = m.role === "coach" || m.role === "scorer";
    const isStaffKeyword =
      name.includes("監督") || name.includes("コーチ") || name.includes("代表");
    const isStaffExplicit = m.memberType === "staff" || isStaffKeyword;
    const isParentExplicit = m.memberType === "parent" || hasKids;

    const shouldIncludeInStaff = isStaffExplicit || isScorerOrCoach || isManagerOrAdmin;
    const shouldIncludeInParent = isParentExplicit || (!isStaffKeyword && !isScorerOrCoach);

    if (shouldIncludeInStaff) {
      staffIds.push(m.id);
    }

    if (shouldIncludeInParent) {
      const isMother =
        m.memberType === "mother" ||
        m.role === "mother" ||
        (typeof m.subRoles === "string" && m.subRoles.toLowerCase().includes("mother")) ||
        hasMotherKeyword;

      if (isMother) {
        motherIds.push(m.id);
      } else {
        fatherIds.push(m.id);
      }
    }
  }

  const uniqueAllIds = Array.from(
    new Set<string>([...playerIds, ...motherIds, ...fatherIds, ...staffIds])
  );

  return {
    playerIds,
    motherIds,
    fatherIds,
    staffIds,
    uniqueAllIds,
    onLeavePlayerIds,
    memberIdByUserId,
    playerIdByUserId,
  };
}

export interface EventAttendanceRowInput {
  status: string | null;
  playerId?: string | null;
  memberId?: string | null;
  userId?: string | null;
}

function normalizeAttendanceStatus(raw: string | null | undefined): NormalizedAttendanceBucket {
  switch (raw) {
    case "duty":
      return "duty";
    case "help":
    case "present":
      return "help";
    case "setup":
    case "late":
    case "partial":
      return "setup";
    case "game":
      return "game";
    case "absent":
      return "absent";
    default:
      return "pending";
  }
}

function summarizeIds(
  ids: readonly string[],
  statusByEntityId: ReadonlyMap<string, NormalizedAttendanceBucket>
): GroupAttendanceCounts {
  let duty = 0;
  let help = 0;
  let setup = 0;
  let game = 0;
  let absent = 0;
  let pending = 0;

  for (const id of ids) {
    const st = statusByEntityId.get(id) || "pending";
    if (st === "duty") duty++;
    else if (st === "help") help++;
    else if (st === "setup") setup++;
    else if (st === "game") game++;
    else if (st === "absent") absent++;
    else pending++;
  }

  const present = duty + help + setup + game;
  return {
    total: ids.length,
    present,
    absent,
    pending,
    duty,
    help,
    setup,
    game,
  };
}

export function computeEventGroupAttendance(
  rosters: ClassifiedTeamAttendanceRosters,
  attRows: readonly EventAttendanceRowInput[]
): {
  attendCount: GroupAttendanceCounts;
  groupAttendCount: EventGroupAttendanceMap;
} {
  const statusByEntityId = new Map<string, NormalizedAttendanceBucket>();

  for (const row of attRows) {
    if (row.playerId && rosters.onLeavePlayerIds.has(row.playerId)) continue;
    const entityId =
      row.playerId ||
      row.memberId ||
      (row.userId
        ? rosters.memberIdByUserId.get(row.userId) ||
          rosters.playerIdByUserId.get(row.userId) ||
          null
        : null);
    if (!entityId) continue;

    const normalized = normalizeAttendanceStatus(row.status);
    const prev = statusByEntityId.get(entityId);
    if (!prev || prev === "pending" || normalized !== "pending") {
      statusByEntityId.set(entityId, normalized);
    }
  }

  const groupAttendCount: EventGroupAttendanceMap = {
    player: {
      ...summarizeIds(rosters.playerIds, statusByEntityId),
      onLeave: rosters.onLeavePlayerIds.size,
    },
    mother: summarizeIds(rosters.motherIds, statusByEntityId),
    father: summarizeIds(rosters.fatherIds, statusByEntityId),
    staff: summarizeIds(rosters.staffIds, statusByEntityId),
  };

  const attendCount = summarizeIds(rosters.uniqueAllIds, statusByEntityId);

  return {
    attendCount,
    groupAttendCount,
  };
}

export const DEMO_GROUP_ATTEND_COUNT_LIST: readonly EventGroupAttendanceMap[] = [
  {
    player: { total: 6, present: 5, absent: 1, pending: 0, duty: 0, help: 0, setup: 0, game: 5 },
    mother: { total: 5, present: 4, absent: 1, pending: 0, duty: 2, help: 2, setup: 0, game: 0 },
    father: { total: 4, present: 3, absent: 1, pending: 0, duty: 0, help: 1, setup: 2, game: 0 },
    staff: { total: 3, present: 3, absent: 0, pending: 0, duty: 2, help: 1, setup: 0, game: 0 },
  },
  {
    player: { total: 6, present: 5, absent: 1, pending: 0, duty: 4, help: 0, setup: 0, game: 1 },
    mother: { total: 5, present: 3, absent: 1, pending: 1, duty: 1, help: 2, setup: 0, game: 0 },
    father: { total: 4, present: 2, absent: 1, pending: 1, duty: 1, help: 0, setup: 1, game: 0 },
    staff: { total: 3, present: 3, absent: 0, pending: 0, duty: 2, help: 1, setup: 0, game: 0 },
  },
  {
    player: { total: 6, present: 6, absent: 0, pending: 0, duty: 0, help: 0, setup: 0, game: 6 },
    mother: { total: 5, present: 4, absent: 0, pending: 1, duty: 2, help: 2, setup: 0, game: 0 },
    father: { total: 4, present: 3, absent: 0, pending: 1, duty: 0, help: 2, setup: 1, game: 0 },
    staff: { total: 3, present: 3, absent: 0, pending: 0, duty: 3, help: 0, setup: 0, game: 0 },
  },
] as const;

