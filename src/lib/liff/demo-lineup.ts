// filepath: src/lib/liff/demo-lineup.ts
import type { Match, MatchDayOps } from "@/types/match";
import {
  resolveEffectivePlayerConditionOnDate,
  type PlayerConditionPeriod,
  type PlayerConditionStatus,
  type ResolvedPlayerCondition,
} from "@/lib/liff/player-condition";
import {
  DEMO_SCHEDULED_MATCH_CARPOOL_SYNC,
  type LiffMatchScheduleSyncInfo,
} from "@/lib/liff/match-day-ops";

export interface LineupPositionDef {
  id: string;
  label: string;
  shortLabel: string;
  color: string;
}

export const LINEUP_POSITIONS: LineupPositionDef[] = [
  { id: "1", label: "1 投", shortLabel: "投", color: "bg-red-500" },
  { id: "2", label: "2 捕", shortLabel: "捕", color: "bg-blue-500" },
  { id: "3", label: "3 一", shortLabel: "一", color: "bg-orange-500" },
  { id: "4", label: "4 二", shortLabel: "二", color: "bg-emerald-500" },
  { id: "5", label: "5 三", shortLabel: "三", color: "bg-amber-500" },
  { id: "6", label: "6 遊", shortLabel: "遊", color: "bg-purple-500" },
  { id: "7", label: "7 左", shortLabel: "左", color: "bg-lime-500" },
  { id: "8", label: "8 中", shortLabel: "中", color: "bg-teal-500" },
  { id: "9", label: "9 右", shortLabel: "右", color: "bg-cyan-500" },
  { id: "DH", label: "DH 指", shortLabel: "指", color: "bg-zinc-500" },
];

export function getPositionBadgeInfo(positionId: string | undefined | null): LineupPositionDef | null {
  if (!positionId) return null;
  return LINEUP_POSITIONS.find((p) => p.id === positionId) || null;
}

/**
 * Safari / iOS WKWebView (LINE内ブラウザ) でも確実にパースできる安全な日付変換
 * 例: "2026-11-08 09:00", "2026/11/08 09:30", "2026/08/23(日)", "2026-08-23" すべてに対応
 */
export function parseSafeMatchDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const cleaned = dateStr.trim().replace(/[（(][日月火水木金土][)）]/g, "").trim();
  if (!cleaned) return null;

  // タイムゾーン付きISO文字列の場合
  if (/[Zz]$|[+\-]\d{2}:?\d{2}$/.test(cleaned)) {
    const isoDate = new Date(cleaned);
    return isNaN(isoDate.getTime()) ? null : isoDate;
  }

  // YYYY-MM-DD / YYYY/MM/DD (+ 任意の時刻 HH:mm[:ss]) をローカル時刻として数値生成
  const m = cleaned.match(
    /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]) - 1;
    const day = Number(m[3]);
    const hour = m[4] !== undefined ? Number(m[4]) : 0;
    const minute = m[5] !== undefined ? Number(m[5]) : 0;
    const second = m[6] !== undefined ? Number(m[6]) : 0;
    const d = new Date(year, month, day, hour, minute, second);
    return isNaN(d.getTime()) ? null : d;
  }

  const fallback = new Date(cleaned.replace(/\//g, "-").replace(/\s+/, "T"));
  return isNaN(fallback.getTime()) ? null : fallback;
}

export function hasMatchTime(dateStr: string | null | undefined): boolean {
  if (!dateStr || typeof dateStr !== "string") return false;
  return /\d{1,2}:\d{2}/.test(dateStr);
}

export interface LineupPlayer {
  id: string;
  name: string;
  uniformNumber: string | null;
  isActive?: number | boolean;
  conditionStatus?: PlayerConditionStatus;
  conditionNote?: string | null;
  conditionPeriods?: PlayerConditionPeriod[];
  activeConditionPeriod?: PlayerConditionPeriod | null;
  joinedAt?: number | string | null;
  createdAt?: number | string | null;
}

export interface MyLineupSlot {
  order: number;
  position: string;
  playerId: string;
  name: string;
  uniformNumber: string;
}

export interface OpponentLineupSlot {
  order: number;
  position: string;
  name: string;
  uniformNumber: string;
}

export interface OpponentBenchPlayer {
  id?: string;
  name: string;
  uniformNumber: string;
  position?: string;
}

export type PlayerMatchAttendanceStatus = "bench" | "absent" | "excluded";
export type PlayerMatchAttendanceMap = Record<string, PlayerMatchAttendanceStatus>;

export interface MatchLineupsPayload {
  myLineup: MyLineupSlot[];
  opponentLineup: OpponentLineupSlot[];
  opponentBench?: OpponentBenchPlayer[];
  myAttendance: PlayerMatchAttendanceMap;
}

export interface MatchRosterFilterContext {
  matchDate?: string | null;
  matchStatus?: string | null;
  matchCreatedAt?: number | string | Date | null;
}

function formatDateToIsoKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function toMatchCalendarKey(dateStr: string | null | undefined): string | null {
  const parsed = parseSafeMatchDate(dateStr);
  return parsed ? formatDateToIsoKey(parsed) : null;
}

export function toTimestampCalendarKey(
  val: number | string | Date | null | undefined
): string | null {
  if (val === null || val === undefined || val === "") return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : formatDateToIsoKey(val);
  }
  if (typeof val === "number") {
    if (!Number.isFinite(val) || val <= 0) return null;
    const ms = val < 10_000_000_000 ? val * 1000 : val;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : formatDateToIsoKey(d);
  }
  const trimmed = val.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num <= 0) return null;
    const ms = num < 10_000_000_000 ? num * 1000 : num;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : formatDateToIsoKey(d);
  }
  const safeParsed = parseSafeMatchDate(trimmed);
  if (safeParsed) return formatDateToIsoKey(safeParsed);
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : formatDateToIsoKey(d);
}

export function formatPlayerJoinedShortDate(
  joinedAt: number | string | Date | null | undefined
): string | null {
  const key = toTimestampCalendarKey(joinedAt);
  if (!key) return null;
  const parts = key.split("-");
  if (parts.length !== 3) return null;
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

export function isPlayerJoinedAfterMatch(
  player: Pick<LineupPlayer, "joinedAt" | "createdAt">,
  ctx: MatchRosterFilterContext
): boolean {
  const matchKey = toMatchCalendarKey(ctx.matchDate);
  if (!matchKey) return false;

  // 1. 入団日（joinedAt）が明示設定されている場合は試合日と直接比較
  const joinedKey = toTimestampCalendarKey(player.joinedAt);
  if (joinedKey) {
    return joinedKey > matchKey;
  }

  // 2. 入団日未設定時：終了済み・過去日の試合に対してのみ、DB登録日（createdAt）から途中入団を自動判定
  const todayKey = formatDateToIsoKey(new Date());
  const isPastOrFinished =
    ctx.matchStatus === "finished" ||
    ctx.matchStatus === "rainout" ||
    matchKey < todayKey;
  if (!isPastOrFinished) return false;

  const playerCreatedKey = toTimestampCalendarKey(player.createdAt);
  if (!playerCreatedKey || playerCreatedKey <= matchKey) return false;

  // 初期セットアップ後に過去試合を遡及インポートしたケース（選手登録日 <= 試合レコード作成日）は在籍中として保護し、
  // 既に記録済みだった過去試合より後に追加登録された選手（選手登録日 > 試合日 かつ 選手登録日 > 試合レコード作成日）を入団前と判定
  const matchCreatedKey = toTimestampCalendarKey(ctx.matchCreatedAt);
  if (matchCreatedKey) {
    return playerCreatedKey > matchCreatedKey;
  }

  return true;
}

export function resolveLineupPlayerConditionForMatch(
  player: Pick<LineupPlayer, "conditionStatus" | "conditionNote" | "conditionPeriods">,
  matchDate?: string | null
): ResolvedPlayerCondition {
  const matchKey = toMatchCalendarKey(matchDate);
  return resolveEffectivePlayerConditionOnDate({
    conditionPeriods: player.conditionPeriods,
    fallbackStatus: player.conditionStatus,
    fallbackNote: player.conditionNote,
    dateKey: matchKey,
  });
}

export function resolvePlayerMatchAttendanceStatus(
  player: LineupPlayer,
  savedAttendance: Record<string, string | undefined> | null | undefined,
  ctx: MatchRosterFilterContext
): PlayerMatchAttendanceStatus {
  const map = savedAttendance || {};
  const explicit = map[player.id];

  if (explicit === "excluded") return "excluded";
  if (explicit === "absent") return "absent";
  if (explicit === "bench") return "bench";

  const effectiveCondition = resolveLineupPlayerConditionForMatch(player, ctx.matchDate);
  if (effectiveCondition.status === "on_leave") {
    return "excluded";
  }

  if (isPlayerJoinedAfterMatch(player, ctx)) {
    return "excluded";
  }

  const matchKey = toMatchCalendarKey(ctx.matchDate);
  const todayKey = formatDateToIsoKey(new Date());
  const isPastOrFinished =
    ctx.matchStatus === "finished" ||
    (matchKey !== null && matchKey < todayKey);
  const hasSavedSnapshot = Object.keys(map).length > 0;
  const playerCreatedKey = toTimestampCalendarKey(player.createdAt);

  if (
    isPastOrFinished &&
    hasSavedSnapshot &&
    !(player.id in map) &&
    matchKey !== null &&
    playerCreatedKey !== null &&
    playerCreatedKey > matchKey
  ) {
    return "excluded";
  }

  return "bench";
}

export interface LineupTemplateItem {
  id: string;
  teamId?: string;
  name: string;
  lineupData: string | MyLineupSlot[];
}

export interface DemoMatchCardItem {
  id: string;
  opponent: string;
  date: string;
  status: string;
  myScore: number;
  opponentScore: number;
  matchType?: string;
  youtubeUrl?: string | null;
  venueName?: string | null;
  venueShortName?: string | null;
  venueParkingInfo?: string | null;
  surfaceDetails?: string | null;
  tournamentName?: string | null;
  battingOrder?: "first" | "second";
  innings?: number;
  myInningScores?: number[];
  opponentInningScores?: number[];
  hasLineup?: boolean;
  hasScorebook?: boolean;
  matchDayOps?: MatchDayOps | null;
  scheduleSync?: LiffMatchScheduleSyncInfo | null;
}

export const DEMO_LINEUP_PLAYERS: LineupPlayer[] = [
  { id: "demo-p-1", name: "鈴木 蓮", uniformNumber: "1", isActive: 1 },
  { id: "demo-p-2", name: "伊藤 蒼", uniformNumber: "2", isActive: 1 },
  { id: "demo-p-3", name: "高橋 陸", uniformNumber: "3", isActive: 1 },
  { id: "demo-p-4", name: "渡辺 陽向", uniformNumber: "4", isActive: 1 },
  { id: "demo-p-5", name: "山本 大翔", uniformNumber: "5", isActive: 1 },
  { id: "demo-p-6", name: "田中 健太", uniformNumber: "6", isActive: 1 },
  { id: "demo-p-7", name: "中村 颯", uniformNumber: "7", isActive: 1 },
  { id: "demo-p-8", name: "山下 颯太", uniformNumber: "8", isActive: 1 },
  {
    id: "demo-p-9",
    name: "小林 樹",
    uniformNumber: "9",
    isActive: 1,
    conditionStatus: "restricted",
    conditionNote: "右肘ケアのため投球球数制限（打撃・外野守備は可）",
  },
  { id: "demo-p-10", name: "山田 翔太", uniformNumber: "10", isActive: 1 },
  { id: "demo-p-11", name: "佐藤 陽太", uniformNumber: "11", isActive: 1 },
  { id: "demo-p-12", name: "加藤 湊", uniformNumber: "12", isActive: 1 },
];

export const DEMO_MATCH_MAP: Record<string, Match> = {
  "demo-match-1": {
    id: "demo-match-1",
    opponent: "横浜ベイブルース",
    tournamentName: "川崎市秋季大会 1回戦",
    date: "2026/08/23",
    status: "finished",
    myScore: 7,
    opponentScore: 4,
    youtubeUrl: "https://www.youtube.com/watch?v=qkRUcYHJ1JI",
    matchType: "official",
    battingOrder: "first",
    benchSide: "1B",
    venueName: "川崎市富士見球場",
    venueShortName: "市民第2",
    venueAddress: "神奈川県川崎市川崎区富士見2-1-9",
    venueMapUrl: "https://maps.google.com/?q=川崎市富士見球場",
    venueParkingInfo: "有料コインパーキング（上限あり）・1チーム5台まで",
    venueSpikeRule: "ポイントスパイク推奨（金属歯は一部制限あり）",
    venueNotes: "試合開始45分前よりアップスペース利用可",
    matchDayOps: {
      staffRoles: [
        { roleKey: "umpire", roleLabel: "審判", assignees: ["小西 父", "中島 父"], note: "球審・塁審（当日割振）" },
        { roleKey: "scorer", roleLabel: "スコアラー", assignees: ["佐藤 ママ"], note: "公式本部席" },
        { roleKey: "bso_board", roleLabel: "BSO・得点板", assignees: ["高橋 父"] },
        { roleKey: "line_live", roleLabel: "LINE速報", assignees: ["鈴木 パパ"] },
        { roleKey: "video_camera", roleLabel: "動画撮影", assignees: ["山本 父"], note: "バックネット裏" },
      ],
    },
    innings: 7,
    myInningScores: [2, 0, 1, 3, 0, 1, 0],
    opponentInningScores: [0, 1, 0, 0, 2, 1, 0],
    myHits: 9,
    opponentHits: 6,
    myErrors: 1,
    opponentErrors: 2,
  },
  "demo-match-2": {
    id: "demo-match-2",
    opponent: "ブルーサンダース",
    tournamentName: "練習試合",
    date: "2026/08/09",
    status: "finished",
    myScore: 4,
    opponentScore: 5,
    youtubeUrl: "https://www.youtube.com/watch?v=L25-Iw6kJ7w",
    matchType: "practice",
    battingOrder: "second",
    benchSide: "3B",
    venueName: "川崎市等々力球場",
    venueShortName: "等々力球場",
    venueAddress: "神奈川県川崎市中原区等々力1-1",
    venueMapUrl: "https://maps.google.com/?q=川崎市等々力球場",
    innings: 7,
    myInningScores: [0, 1, 0, 2, 0, 1, 0],
    opponentInningScores: [1, 0, 2, 0, 1, 1, 0],
    myHits: 7,
    opponentHits: 8,
    myErrors: 1,
    opponentErrors: 1,
  },
  "demo-match-3": {
    id: "demo-match-3",
    opponent: "レッドソックス",
    tournamentName: "秋季大会 2回戦",
    date: "2026/11/08 09:30",
    status: "scheduled",
    myScore: 0,
    opponentScore: 0,
    youtubeUrl: null,
    matchType: "official",
    battingOrder: "first",
    benchSide: "1B",
    venueName: "多摩川緑地野球場",
    surfaceDetails: "1面",
    venueShortName: "多摩川緑地",
    venueAddress: "神奈川県川崎市高津区二子地先",
    venueMapUrl: "https://maps.google.com/?q=多摩川緑地野球場",
    venueParkingInfo: "河川敷駐車場あり（1チーム最大5台まで・駐車証をダッシュボードに掲示）",
    venueSpikeRule: "金属スパイク禁止（ポイントスパイク・トレシューのみ可）",
    venueNotes: "河川敷は日陰がないためタープ必須。強風時のペグ固定注意。",
    matchDayOps: {
      gatherTime: "07:45 集合 / 08:00 出発",
      gatherPlace: "桜本小学校 正門前（乗り合い出発）",
      uniform: "公式戦ユニフォーム",
      meal: "lunch_and_snack",
      mealNote: "保冷剤入りクーラーバッグ持参",
      belongingsNote: "水筒2L以上・氷嚢・替えアンダーシャツ持参",
      carpoolMode: "away_carpool",
      carLimitNote: "1チーム最大5台まで（駐車証3枚＋予備）",
      cargoCarMember: "山下 監督（ハイエース）",
      carpoolSummaryNote: "高速代・ガソリン代は1家族約600円で後日精算",
      staffRoles: [
        { roleKey: "umpire", roleLabel: "審判", assignees: ["田中 パパ", "小西 父", "中島 父"], note: "審判服着用（球審・塁審は当日決定）" },
        { roleKey: "scorer", roleLabel: "スコアラー", assignees: ["佐藤 ママ"], note: "公式本部席" },
        { roleKey: "bso_board", roleLabel: "BSO・得点板", assignees: ["高橋 父"], note: "ベンチ横カウント操作" },
        { roleKey: "line_live", roleLabel: "LINE速報", assignees: ["鈴木 パパ"], note: "グループLINE実況" },
        { roleKey: "buzzer", roleLabel: "ブザー", assignees: ["山田 母"], note: "放送室ブザー操作" },
        { roleKey: "video_camera", roleLabel: "動画撮影", assignees: ["山本 父"], note: "バックネット裏三脚" },
      ],
    },
    innings: 7,
    myInningScores: [],
    opponentInningScores: [],
  },
  "sample-match": {
    id: "sample-match",
    opponent: "横浜ベイブルース",
    tournamentName: "川崎市秋季大会 1回戦",
    date: "2026/08/23",
    status: "finished",
    myScore: 7,
    opponentScore: 4,
    youtubeUrl: "https://www.youtube.com/watch?v=qkRUcYHJ1JI",
    matchType: "official",
    battingOrder: "first",
    benchSide: "1B",
    venueName: "川崎市富士見球場",
    venueShortName: "市民第2",
    venueAddress: "神奈川県川崎市川崎区富士見2-1-9",
    venueMapUrl: "https://maps.google.com/?q=川崎市富士見球場",
    venueParkingInfo: "有料コインパーキング（上限あり）・1チーム5台まで",
    venueSpikeRule: "ポイントスパイク推奨（金属歯は一部制限あり）",
    venueNotes: "試合開始45分前よりアップスペース利用可",
    matchDayOps: {
      staffRoles: [
        { roleKey: "umpire", roleLabel: "審判", assignees: ["小西 父", "中島 父"], note: "球審・塁審（当日割振）" },
        { roleKey: "scorer", roleLabel: "スコアラー", assignees: ["佐藤 ママ"], note: "公式本部席" },
        { roleKey: "bso_board", roleLabel: "BSO・得点板", assignees: ["高橋 父"] },
        { roleKey: "line_live", roleLabel: "LINE速報", assignees: ["鈴木 パパ"] },
        { roleKey: "video_camera", roleLabel: "動画撮影", assignees: ["山本 父"], note: "バックネット裏" },
      ],
    },
    innings: 7,
    myInningScores: [2, 0, 1, 3, 0, 1, 0],
    opponentInningScores: [0, 1, 0, 0, 2, 1, 0],
    myHits: 9,
    opponentHits: 6,
    myErrors: 1,
    opponentErrors: 2,
  },
};

export const DEMO_MATCH_CARDS: DemoMatchCardItem[] = [
  {
    id: "demo-match-3",
    opponent: "レッドソックス",
    tournamentName: "秋季大会 2回戦",
    date: "2026/11/08 09:30",
    status: "scheduled",
    myScore: 0,
    opponentScore: 0,
    youtubeUrl: null,
    matchType: "official",
    battingOrder: "first",
    venueName: "多摩川緑地野球場 (1面)",
    venueShortName: "多摩川緑地",
    venueParkingInfo: "河川敷駐車場利用（可能な限り乗り合い必須）",
    innings: 7,
    myInningScores: [],
    opponentInningScores: [],
    hasLineup: false,
    hasScorebook: false,
    matchDayOps: DEMO_MATCH_MAP["demo-match-3"]?.matchDayOps ?? null,
    scheduleSync: DEMO_SCHEDULED_MATCH_CARPOOL_SYNC,
  },
  {
    id: "demo-match-1",
    opponent: "横浜ベイブルース",
    tournamentName: "川崎市秋季大会 1回戦",
    date: "2026/08/23",
    status: "finished",
    myScore: 7,
    opponentScore: 4,
    youtubeUrl: "https://www.youtube.com/watch?v=qkRUcYHJ1JI",
    matchType: "official",
    battingOrder: "first",
    venueName: "市民第2球場",
    venueShortName: "市民第2",
    innings: 7,
    myInningScores: [2, 0, 1, 3, 0, 1, 0],
    opponentInningScores: [0, 1, 0, 0, 2, 1, 0],
    hasLineup: true,
    hasScorebook: true,
    matchDayOps: DEMO_MATCH_MAP["demo-match-1"]?.matchDayOps ?? null,
  },
  {
    id: "demo-match-2",
    opponent: "ブルーサンダース",
    tournamentName: "練習試合",
    date: "2026/08/09",
    status: "finished",
    myScore: 4,
    opponentScore: 5,
    youtubeUrl: "https://www.youtube.com/watch?v=L25-Iw6kJ7w",
    matchType: "practice",
    battingOrder: "second",
    venueName: "等々力球場",
    venueShortName: "等々力",
    innings: 7,
    myInningScores: [0, 1, 0, 2, 0, 1, 0],
    opponentInningScores: [1, 0, 2, 0, 1, 1, 0],
    hasLineup: true,
    hasScorebook: true,
    matchDayOps: DEMO_MATCH_MAP["demo-match-2"]?.matchDayOps ?? null,
  },
];

export const DEFAULT_DEMO_STARTERS: MyLineupSlot[] = [
  { order: 1, position: "6", playerId: "demo-p-6", name: "田中 健太", uniformNumber: "6" },
  { order: 2, position: "4", playerId: "demo-p-4", name: "渡辺 陽向", uniformNumber: "4" },
  { order: 3, position: "8", playerId: "demo-p-8", name: "山下 颯太", uniformNumber: "8" },
  { order: 4, position: "2", playerId: "demo-p-10", name: "山田 翔太", uniformNumber: "10" },
  { order: 5, position: "1", playerId: "demo-p-1", name: "鈴木 蓮", uniformNumber: "1" },
  { order: 6, position: "3", playerId: "demo-p-3", name: "高橋 陸", uniformNumber: "3" },
  { order: 7, position: "5", playerId: "demo-p-5", name: "山本 大翔", uniformNumber: "5" },
  { order: 8, position: "7", playerId: "demo-p-7", name: "中村 颯", uniformNumber: "7" },
  { order: 9, position: "9", playerId: "demo-p-9", name: "小林 樹", uniformNumber: "9" },
];

export function isDemoMatchId(matchId?: string | null): boolean {
  return Boolean(matchId && (matchId.startsWith("demo-") || matchId === "sample-match"));
}

export function isDemoTeamId(teamId?: string | null): boolean {
  return teamId === "demo-team";
}

export function isDemoMatchOrTeam(matchId?: string | null, teamId?: string | null): boolean {
  return isDemoMatchId(matchId) || isDemoTeamId(teamId);
}

const CUSTOM_DEMO_MATCHES_KEY = "iscore_demo_custom_matches";
const DELETED_DEMO_MATCH_IDS_KEY = "iscore_demo_deleted_match_ids";

export function loadDeletedDemoMatchIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(DELETED_DEMO_MATCH_IDS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

export function loadCustomDemoMatches(): Match[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_DEMO_MATCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Match[];
    const deletedSet = loadDeletedDemoMatchIds();
    return Array.isArray(parsed) ? parsed.filter((m) => !deletedSet.has(m.id)) : [];
  } catch {
    return [];
  }
}

export function saveCustomDemoMatch(match: Match): void {
  DEMO_MATCH_MAP[match.id] = match;
  if (typeof window === "undefined") return;
  try {
    const deletedSet = loadDeletedDemoMatchIds();
    if (deletedSet.has(match.id)) {
      deletedSet.delete(match.id);
      localStorage.setItem(DELETED_DEMO_MATCH_IDS_KEY, JSON.stringify([...deletedSet]));
    }
    const existing = loadCustomDemoMatches().filter((m) => m.id !== match.id);
    localStorage.setItem(CUSTOM_DEMO_MATCHES_KEY, JSON.stringify([match, ...existing]));
  } catch {}
}

export function deleteDemoMatch(matchId: string): void {
  delete DEMO_MATCH_MAP[matchId];
  if (typeof window === "undefined") return;
  try {
    const remainingCustom = loadCustomDemoMatches().filter((m) => m.id !== matchId);
    localStorage.setItem(CUSTOM_DEMO_MATCHES_KEY, JSON.stringify(remainingCustom));
    const deletedSet = loadDeletedDemoMatchIds();
    deletedSet.add(matchId);
    localStorage.setItem(DELETED_DEMO_MATCH_IDS_KEY, JSON.stringify([...deletedSet]));
    localStorage.removeItem(`iscore_demo_lineups_${matchId}`);
  } catch {}
}

export function getDemoMatchById(matchId: string): Match | null {
  const deletedSet = loadDeletedDemoMatchIds();
  if (deletedSet.has(matchId)) return null;
  const custom = loadCustomDemoMatches().find((m) => m.id === matchId);
  if (custom) {
    DEMO_MATCH_MAP[matchId] = custom;
    return custom;
  }
  if (DEMO_MATCH_MAP[matchId]) return DEMO_MATCH_MAP[matchId];
  return null;
}

export function getHydratedDemoMatchCards(baseList?: DemoMatchCardItem[]): DemoMatchCardItem[] {
  const deletedSet = loadDeletedDemoMatchIds();
  const customMatches = loadCustomDemoMatches();
  const customById = new Map(customMatches.map((m) => [m.id, m]));
  const base = (baseList && baseList.length > 0 ? baseList : DEMO_MATCH_CARDS).filter(
    (m) => !deletedSet.has(m.id)
  );
  const existingIds = new Set(base.map((m) => m.id));

  const customCards: DemoMatchCardItem[] = customMatches
    .filter((m) => !existingIds.has(m.id))
    .map((m) => ({
      id: m.id,
      opponent: m.opponent,
      date: m.date,
      status: m.status,
      myScore: m.myScore,
      opponentScore: m.opponentScore,
      matchType: m.matchType,
      tournamentName: m.tournamentName || null,
      venueName: m.venueName || m.surfaceDetails || null,
      venueShortName: m.venueShortName || null,
      surfaceDetails: m.surfaceDetails || null,
      battingOrder: m.battingOrder === "second" ? "second" : "first",
      innings: m.innings || 7,
      myInningScores: Array.isArray(m.myInningScores)
        ? m.myInningScores.filter((v): v is number => typeof v === "number")
        : [],
      opponentInningScores: Array.isArray(m.opponentInningScores)
        ? m.opponentInningScores.filter((v): v is number => typeof v === "number")
        : [],
      matchDayOps: m.matchDayOps ?? null,
    }));

  return [...customCards, ...base].map((m) => {
    const demoPayload = loadDemoMatchLineups(m.id);
    const hasSavedStarters = demoPayload.myLineup.some((s) => Boolean(s.playerId || s.name));
    const customOverride = customById.get(m.id);
    return {
      ...m,
      hasLineup: hasSavedStarters,
      matchDayOps:
        customOverride?.matchDayOps ??
        m.matchDayOps ??
        DEMO_MATCH_MAP[m.id]?.matchDayOps ??
        null,
    };
  });
}

export interface AdjacentMatchSummary {
  id: string;
  opponent: string;
  date: string;
}

export function getDemoAdjacentMatches(matchId: string): {
  prevMatch: AdjacentMatchSummary | null;
  nextMatch: AdjacentMatchSummary | null;
  matchOrderNumber: number | null;
  totalMatches: number;
} {
  const targetId = matchId === "sample-match" ? "demo-match-1" : matchId;
  const sorted = [...getHydratedDemoMatchCards()].sort((a, b) =>
    b.date.replace(/\//g, "-").localeCompare(a.date.replace(/\//g, "-"))
  );
  const totalMatches = sorted.length;
  const idx = sorted.findIndex((m) => m.id === targetId);
  if (idx === -1) {
    return {
      prevMatch: null,
      nextMatch: null,
      matchOrderNumber: null,
      totalMatches,
    };
  }
  const prev = idx < totalMatches - 1 ? sorted[idx + 1] : null;
  const next = idx > 0 ? sorted[idx - 1] : null;
  return {
    prevMatch: prev ? { id: prev.id, opponent: prev.opponent, date: prev.date } : null,
    nextMatch: next ? { id: next.id, opponent: next.opponent, date: next.date } : null,
    matchOrderNumber: totalMatches - idx,
    totalMatches,
  };
}

export function loadDemoMatchLineups(matchId: string): MatchLineupsPayload {
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem(`iscore_demo_lineups_${matchId}`);
      if (saved) {
        return JSON.parse(saved) as MatchLineupsPayload;
      }
    } catch {}
  }

  // 未試合のデモ（demo-match-3 や新規作成デモ）は初期空欄にして体験しやすく、過去試合デモは初期スタメン入りにする
  if (matchId === "demo-match-3" || matchId.startsWith("demo-custom-")) {
    return {
      myLineup: Array.from({ length: 9 }, (_, i) => ({
        order: i + 1,
        position: "",
        playerId: "",
        name: "",
        uniformNumber: "",
      })),
      opponentLineup: Array.from({ length: 9 }, (_, i) => ({
        order: i + 1,
        position: "",
        name: "",
        uniformNumber: "",
      })),
      opponentBench: [],
      myAttendance: {
        "demo-p-12": "absent",
      },
    };
  }

  return {
    myLineup: DEFAULT_DEMO_STARTERS,
    opponentLineup: Array.from({ length: 9 }, (_, i) => ({
      order: i + 1,
      position: String(i + 1),
      name: `相手打者 ${i + 1}`,
      uniformNumber: String(i + 1),
    })),
    opponentBench: [
      { id: "opp-b-1", uniformNumber: "10", name: "相手控え 1", position: "1" },
      { id: "opp-b-2", uniformNumber: "12", name: "相手控え 2", position: "2" },
    ],
    myAttendance: {
      "demo-p-2": "bench",
      "demo-p-11": "bench",
      "demo-p-12": "absent",
    },
  };
}

export function saveDemoMatchLineups(matchId: string, payload: MatchLineupsPayload): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`iscore_demo_lineups_${matchId}`, JSON.stringify(payload));
  } catch {}
}

export function formatLineupShareText(
  opponent: string,
  dateStr: string,
  myLineup: MyLineupSlot[],
  remainingPlayers: LineupPlayer[],
  attendance: PlayerMatchAttendanceMap
): string {
  const filledStarters = myLineup.filter((p) => p.playerId || p.name);
  const starterLines = filledStarters.map((p) => {
    const posInfo = getPositionBadgeInfo(p.position);
    const posText = posInfo ? `[${posInfo.shortLabel}]` : "[未]";
    const numText = p.uniformNumber ? `#${p.uniformNumber} ` : "";
    return `${p.order}番 ${posText} ${numText}${p.name}`;
  });

  const benchPlayers = remainingPlayers.filter(
    (p) => (attendance[p.id] ?? "bench") === "bench"
  );
  const absentPlayers = remainingPlayers.filter((p) => attendance[p.id] === "absent");

  const lines: string[] = [
    `【出場メンバー】vs ${opponent}${dateStr ? ` (${dateStr})` : ""}`,
  ];

  if (starterLines.length > 0) {
    lines.push("", "⚾ スタメン", ...starterLines);
  }
  if (benchPlayers.length > 0) {
    lines.push(
      "",
      `🟢 控え (${benchPlayers.length}名): ${benchPlayers.map((p) => p.name).join("、")}`
    );
  }
  if (absentPlayers.length > 0) {
    lines.push(
      `🔴 欠席 (${absentPlayers.length}名): ${absentPlayers.map((p) => p.name).join("、")}`
    );
  }

  return lines.join("\n");
}
