// filepath: src/lib/liff/demo-lineup.ts
import type { Match } from "@/types/match";

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

export type PlayerMatchAttendanceMap = Record<string, "bench" | "absent">;

export interface MatchLineupsPayload {
  myLineup: MyLineupSlot[];
  opponentLineup: OpponentLineupSlot[];
  myAttendance: PlayerMatchAttendanceMap;
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
  surfaceDetails?: string | null;
  tournamentName?: string | null;
  battingOrder?: "first" | "second";
  innings?: number;
  myInningScores?: number[];
  opponentInningScores?: number[];
  hasLineup?: boolean;
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
  { id: "demo-p-9", name: "小林 樹", uniformNumber: "9", isActive: 1 },
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
    venueName: "市民第2球場",
    venueShortName: "市民第2",
    innings: 7,
    myInningScores: [2, 0, 1, 3, 0, 1, 0],
    opponentInningScores: [0, 1, 0, 0, 2, 1, 0],
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
    venueName: "等々力球場",
    venueShortName: "等々力",
    innings: 7,
    myInningScores: [0, 1, 0, 2, 0, 1, 0],
    opponentInningScores: [1, 0, 2, 0, 1, 1, 0],
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
    venueName: "多摩川緑地野球場 (1面)",
    venueShortName: "多摩川緑地",
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
    venueName: "市民第2球場",
    venueShortName: "市民第2",
    innings: 7,
    myInningScores: [2, 0, 1, 3, 0, 1, 0],
    opponentInningScores: [0, 1, 0, 0, 2, 1, 0],
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
    innings: 7,
    myInningScores: [],
    opponentInningScores: [],
    hasLineup: false,
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

export function loadCustomDemoMatches(): Match[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_DEMO_MATCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Match[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomDemoMatch(match: Match): void {
  DEMO_MATCH_MAP[match.id] = match;
  if (typeof window === "undefined") return;
  try {
    const existing = loadCustomDemoMatches().filter((m) => m.id !== match.id);
    localStorage.setItem(CUSTOM_DEMO_MATCHES_KEY, JSON.stringify([match, ...existing]));
  } catch {}
}

export function getDemoMatchById(matchId: string): Match | null {
  if (DEMO_MATCH_MAP[matchId]) return DEMO_MATCH_MAP[matchId];
  const custom = loadCustomDemoMatches().find((m) => m.id === matchId);
  if (custom) {
    DEMO_MATCH_MAP[matchId] = custom;
    return custom;
  }
  return null;
}

export function getHydratedDemoMatchCards(baseList?: DemoMatchCardItem[]): DemoMatchCardItem[] {
  const customMatches = loadCustomDemoMatches();
  const base = baseList && baseList.length > 0 ? baseList : DEMO_MATCH_CARDS;
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
    }));

  return [...customCards, ...base].map((m) => {
    const demoPayload = loadDemoMatchLineups(m.id);
    const hasSavedStarters = demoPayload.myLineup.some((s) => Boolean(s.playerId || s.name));
    return { ...m, hasLineup: hasSavedStarters };
  });
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
      uniformNumber: "",
    })),
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

  const benchPlayers = remainingPlayers.filter((p) => attendance[p.id] !== "absent");
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
