// filepath: src/api/liff/player-growth.ts
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { asc, eq, inArray } from "drizzle-orm";
import * as schema from "@/db/schema";
import { ensurePlayerProfileColumns } from "@/lib/db-helper";
import {
  aggregateTeamPlayerPositions,
  classifyBattedBallDirection,
  formatAvgRate,
  formatInningsPitched,
  normalizePlayerNameKey,
  type CanonicalDefensivePosition,
  type GrowthAtBatChip,
  type GrowthFilterKey,
  type PlayerBattedDirectionSplit,
  type PlayerBattingTrendItem,
  type PlayerGrowthBattingSummary,
  type PlayerGrowthPitchingSummary,
  type PlayerGrowthResponse,
  type PlayerGrowthRosterItem,
  type PlayerGrowthSectionPayload,
  type PlayerMonthlyBattingItem,
  type PlayerPitchingTrendItem,
  type PlayerRecentFormComparison,
} from "@/lib/liff/player-positions-and-growth";
import {
  isNonPitchMoundEvent,
  type CanonicalPitchResult,
  type ScorebookSheetStructure,
  type ScorebookV2AtBat,
} from "@/types/scorebook-v2";
import type { WorkerEnv } from "@/types/api";

const liffPlayerGrowthRouter = new Hono<{ Bindings: WorkerEnv }>();

const {
  teams,
  organizations,
  players,
  matches,
  tournaments,
  atBats,
  baseAdvances,
  playLogs,
  matchScorebookSnapshots,
} = schema;

function normalizeMatchType(
  raw: string | null | undefined
): "official" | "exchange" | "practice" {
  const v = (raw || "").trim().toLowerCase();
  if (v === "official" || v === "tournament" || v.includes("公式")) {
    return "official";
  }
  if (v === "exchange" || v.includes("交流")) {
    return "exchange";
  }
  return "practice";
}

function classifyHitKind(res: string): {
  is1B: boolean;
  is2B: boolean;
  is3B: boolean;
  isHR: boolean;
  isHit: boolean;
} {
  const is2B =
    res === "double" ||
    res.includes("2B") ||
    res.includes("二塁打") ||
    res.includes("２塁打");
  const is3B =
    res === "triple" ||
    res.includes("3B") ||
    res.includes("三塁打") ||
    res.includes("３塁打");
  const isHR =
    res === "home_run" || res.includes("HR") || res.includes("本塁打");
  const is1B =
    res === "single" ||
    res.includes("1B") ||
    res.includes("単打") ||
    (res.includes("安") && !is2B && !is3B && !isHR);
  return { is1B, is2B, is3B, isHR, isHit: is1B || is2B || is3B || isHR };
}

function isErrorResult(res: string): boolean {
  return (
    res === "error" ||
    res === "E" ||
    res.includes("失策") ||
    res.includes("エラー")
  );
}

function isNonRbiAdvanceReason(rawReason: string | null | undefined): boolean {
  const r = (rawReason || "").trim().toLowerCase();
  return (
    r === "wp" ||
    r === "pb" ||
    r === "balk" ||
    r === "error" ||
    r === "pickoff_error" ||
    r === "steal" ||
    r === "obstruction" ||
    r === "tiebreak" ||
    r.includes("暴投") ||
    r.includes("捕逸") ||
    r.includes("ボーク") ||
    r.includes("失策") ||
    r.includes("エラー") ||
    r.includes("盗塁")
  );
}

function formatDiffRate(diffPoints: number): string {
  if (diffPoints === 0) return "±.000";
  const sign = diffPoints > 0 ? "+" : "-";
  const absVal = Math.abs(diffPoints) / 1000;
  return `${sign}${formatAvgRate(absVal)}`;
}

function translateAtBatChipLabel(
  rawRes: string,
  snapLabel: string | undefined,
  battedDir: string | undefined
): { label: string; kind: GrowthAtBatChip["kind"] } {
  const res = rawRes.trim();
  const cleanSnap = (snapLabel || "").trim();

  const { is1B, is2B, is3B, isHR } = classifyHitKind(res);
  const dirShort = (() => {
    const d = (battedDir || "").trim();
    if (d === "7" || d.startsWith("左")) return "左";
    if (d === "8" || d.startsWith("中")) return "中";
    if (d === "9" || d.startsWith("右")) return "右";
    if (d === "5" || d.startsWith("三")) return "三";
    if (d === "6" || d.startsWith("遊")) return "遊";
    if (d === "4" || d.startsWith("二")) return "二";
    if (d === "3" || d.startsWith("一")) return "一";
    if (d === "1" || d.startsWith("投")) return "投";
    if (d === "2" || d.startsWith("捕")) return "捕";
    return "";
  })();

  if (isHR) {
    return {
      label: cleanSnap || `${dirShort}本`,
      kind: "hr",
    };
  }
  if (is3B) {
    return {
      label: cleanSnap || (dirShort ? `${dirShort}三` : "三塁打"),
      kind: "hit",
    };
  }
  if (is2B) {
    return {
      label: cleanSnap || (dirShort ? `${dirShort}二` : "二塁打"),
      kind: "hit",
    };
  }
  if (is1B) {
    return {
      label: cleanSnap || (dirShort ? `${dirShort}安` : "安打"),
      kind: "hit",
    };
  }

  if (
    res === "walk" ||
    res === "intentional_walk" ||
    res.includes("BB") ||
    res.includes("四球") ||
    res.includes("敬遠")
  ) {
    return {
      label: cleanSnap || (res === "intentional_walk" ? "敬遠" : "四球"),
      kind: "walk",
    };
  }
  if (
    res === "hit_by_pitch" ||
    res.includes("HP") ||
    res.includes("DB") ||
    res.includes("死球")
  ) {
    return { label: cleanSnap || "死球", kind: "walk" };
  }
  if (
    res === "sac_bunt" ||
    res.includes("SH") ||
    res.includes("犠打") ||
    (res.includes("犠") && !res.includes("飛"))
  ) {
    return { label: cleanSnap || "犠打", kind: "sac" };
  }
  if (res === "sac_fly" || res.includes("SF") || res.includes("犠飛")) {
    return { label: cleanSnap || "犠飛", kind: "sac" };
  }
  if (isErrorResult(res)) {
    return {
      label: cleanSnap || (dirShort ? `${dirShort}失` : "敵失"),
      kind: "error",
    };
  }
  if (
    res === "strikeout" ||
    res === "dropped_third_strike" ||
    res === "dropped_third_strike_out" ||
    res.includes("K") ||
    res.includes("三振") ||
    res.includes("振逃")
  ) {
    return {
      label: cleanSnap || (res.includes("dropped") ? "振逃" : "三振"),
      kind: "out",
    };
  }
  if (
    res === "double_play" ||
    res === "triple_play" ||
    res.includes("DP") ||
    res.includes("併殺")
  ) {
    return { label: cleanSnap || "併殺打", kind: "out" };
  }
  if (res === "fc" || res.includes("FC") || res.includes("野選")) {
    return { label: cleanSnap || "野選", kind: "out" };
  }
  if (res === "groundout") {
    return {
      label: cleanSnap || (dirShort ? `${dirShort}ゴロ` : "ゴロ"),
      kind: "out",
    };
  }
  if (res === "flyout" || res === "infield_fly") {
    return {
      label: cleanSnap || (dirShort ? `${dirShort}飛` : "飛球"),
      kind: "out",
    };
  }

  return {
    label: cleanSnap || res || "凡打",
    kind: "out",
  };
}

function formatMonthLabel(yyyyMm: string): string {
  const m = yyyyMm.match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return yyyyMm;
  return `${m[1]}年${Number(m[2])}月`;
}

function extractYearMonth(dateStr: string): string {
  const clean = dateStr.trim().replace(/\//g, "-");
  const m = clean.match(/^(\d{4})-(\d{1,2})/);
  if (!m) return "2026-01";
  return `${m[1]}-${m[2].padStart(2, "0")}`;
}

interface DemoPlayerSeed {
  id: string;
  name: string;
  nameKana: string;
  uniformNumber: string;
  primaryPosition: CanonicalDefensivePosition;
  subPositions: CanonicalDefensivePosition[];
  positionCounts: Array<{
    position: CanonicalDefensivePosition;
    games: number;
    sharePercent: number;
  }>;
  battingOrders: Array<{ order: number; games: number }>;
  throws: "R" | "L";
  bats: "R" | "L" | "B";
  height: number;
  weight: number;
  notes: string;
  isCaptain: boolean;
  isPitcher: boolean;
}

const DEMO_ROSTER_SEEDS: DemoPlayerSeed[] = [
  {
    id: "demo-player-2",
    name: "佐藤 健太",
    nameKana: "サトウ ケンタ",
    uniformNumber: "1",
    primaryPosition: "P",
    subPositions: ["CF", "1B"],
    positionCounts: [
      { position: "P", games: 8, sharePercent: 67 },
      { position: "CF", games: 4, sharePercent: 33 },
      { position: "1B", games: 1, sharePercent: 8 },
    ],
    battingOrders: [
      { order: 4, games: 9 },
      { order: 5, games: 3 },
    ],
    throws: "R",
    bats: "R",
    height: 171,
    weight: 63,
    notes: "伸びのある直球と制球力が武器の大黒柱エース。後半戦に入りストライク率が大幅向上。",
    isCaptain: false,
    isPitcher: true,
  },
  {
    id: "demo-player-3",
    name: "鈴木 大輔",
    nameKana: "スズキ ダイスケ",
    uniformNumber: "2",
    primaryPosition: "C",
    subPositions: ["1B"],
    positionCounts: [
      { position: "C", games: 11, sharePercent: 92 },
      { position: "1B", games: 2, sharePercent: 17 },
    ],
    battingOrders: [
      { order: 5, games: 8 },
      { order: 6, games: 4 },
    ],
    throws: "R",
    bats: "R",
    height: 168,
    weight: 66,
    notes: "強肩と冷静なリードで投手陣を引っ張る扇の要。",
    isCaptain: false,
    isPitcher: false,
  },
  {
    id: "demo-player-5",
    name: "伊藤 蒼真",
    nameKana: "イトウ ソウマ",
    uniformNumber: "3",
    primaryPosition: "1B",
    subPositions: ["3B"],
    positionCounts: [
      { position: "1B", games: 10, sharePercent: 83 },
      { position: "3B", games: 2, sharePercent: 17 },
    ],
    battingOrders: [
      { order: 4, games: 3 },
      { order: 3, games: 9 },
    ],
    throws: "L",
    bats: "L",
    height: 174,
    weight: 68,
    notes: "広角に長打を放つ左のスラッガー。一塁守備も安定。",
    isCaptain: false,
    isPitcher: false,
  },
  {
    id: "demo-player-6",
    name: "渡辺 陽向",
    nameKana: "ワタナベ ヒナタ",
    uniformNumber: "4",
    primaryPosition: "2B",
    subPositions: ["SS"],
    positionCounts: [
      { position: "2B", games: 9, sharePercent: 75 },
      { position: "SS", games: 3, sharePercent: 25 },
    ],
    battingOrders: [
      { order: 1, games: 10 },
      { order: 2, games: 2 },
    ],
    throws: "R",
    bats: "L",
    height: 163,
    weight: 55,
    notes: "俊足巧打のチャンスメーカー。広い守備範囲が魅力。",
    isCaptain: false,
    isPitcher: false,
  },
  {
    id: "demo-player-7",
    name: "中村 颯",
    nameKana: "ナカムラ ハヤテ",
    uniformNumber: "5",
    primaryPosition: "3B",
    subPositions: ["2B"],
    positionCounts: [
      { position: "3B", games: 10, sharePercent: 91 },
      { position: "2B", games: 1, sharePercent: 9 },
    ],
    battingOrders: [{ order: 6, games: 11 }],
    throws: "R",
    bats: "R",
    height: 169,
    weight: 62,
    notes: "ホットコーナーを守る元気印。勝負強い打撃が光る。",
    isCaptain: false,
    isPitcher: false,
  },
  {
    id: "demo-player-8",
    name: "山本 蓮",
    nameKana: "ヤマモト レン",
    uniformNumber: "7",
    primaryPosition: "LF",
    subPositions: ["RF", "CF"],
    positionCounts: [
      { position: "LF", games: 8, sharePercent: 80 },
      { position: "RF", games: 2, sharePercent: 20 },
      { position: "CF", games: 1, sharePercent: 10 },
    ],
    battingOrders: [{ order: 7, games: 10 }],
    throws: "R",
    bats: "B",
    height: 166,
    weight: 58,
    notes: "スイッチヒッターのユーティリティ外野手。",
    isCaptain: false,
    isPitcher: false,
  },
  {
    id: "demo-player-4",
    name: "高橋 陸",
    nameKana: "タカハシ リク",
    uniformNumber: "8",
    primaryPosition: "CF",
    subPositions: ["P"],
    positionCounts: [
      { position: "CF", games: 9, sharePercent: 75 },
      { position: "P", games: 6, sharePercent: 50 },
    ],
    battingOrders: [{ order: 2, games: 12 }],
    throws: "L",
    bats: "L",
    height: 170,
    weight: 60,
    notes: "チームNo.1の俊足センター。リリーフ登板もこなす二刀流。",
    isCaptain: false,
    isPitcher: true,
  },
  {
    id: "demo-player-9",
    name: "松本 悠斗",
    nameKana: "マツモト ユウト",
    uniformNumber: "9",
    primaryPosition: "RF",
    subPositions: ["LF"],
    positionCounts: [
      { position: "RF", games: 9, sharePercent: 90 },
      { position: "LF", games: 1, sharePercent: 10 },
    ],
    battingOrders: [{ order: 8, games: 10 }],
    throws: "R",
    bats: "R",
    height: 172,
    weight: 64,
    notes: "レーザービーム送球が武器の強肩ライト。",
    isCaptain: false,
    isPitcher: false,
  },
  {
    id: "demo-player-1",
    name: "山田 翔太",
    nameKana: "ヤマダ ショウタ",
    uniformNumber: "10",
    primaryPosition: "SS",
    subPositions: ["2B", "P"],
    positionCounts: [
      { position: "SS", games: 10, sharePercent: 83 },
      { position: "2B", games: 3, sharePercent: 25 },
      { position: "P", games: 1, sharePercent: 8 },
    ],
    battingOrders: [
      { order: 3, games: 9 },
      { order: 1, games: 3 },
    ],
    throws: "R",
    bats: "R",
    height: 168,
    weight: 61,
    notes: "走攻守三拍子揃った頼れるキャプテン。秋に入り逆方向への長打と選球眼が大きく成長。",
    isCaptain: true,
    isPitcher: false,
  },
  {
    id: "demo-player-10",
    name: "小林 樹",
    nameKana: "コバヤシ イツキ",
    uniformNumber: "18",
    primaryPosition: "P",
    subPositions: ["RF"],
    positionCounts: [
      { position: "P", games: 5, sharePercent: 83 },
      { position: "RF", games: 2, sharePercent: 33 },
    ],
    battingOrders: [{ order: 9, games: 6 }],
    throws: "R",
    bats: "L",
    height: 173,
    weight: 64,
    notes: "キレ味鋭いスライダーで三振を奪う本格派右腕。",
    isCaptain: false,
    isPitcher: true,
  },
];

interface RawGameBattingLog {
  matchId: string;
  date: string;
  opponent: string;
  matchType: "official" | "exchange" | "practice";
  tournamentName: string | null;
  result: "win" | "loss" | "draw";
  myScore: number;
  opponentScore: number;
  battingOrders: number[];
  positions: string[];
  pa: number;
  ab: number;
  singles: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  runs: number;
  walks: number;
  hbp: number;
  sacBunts: number;
  sacFlies: number;
  strikeouts: number;
  sb: number;
  pitchesSeen: number;
  dirLeft: number;
  dirCenter: number;
  dirRight: number;
  atBatChips: GrowthAtBatChip[];
}

interface RawGamePitchingLog {
  matchId: string;
  date: string;
  opponent: string;
  matchType: "official" | "exchange" | "practice";
  tournamentName: string | null;
  result: "win" | "loss" | "draw";
  myScore: number;
  opponentScore: number;
  outs: number;
  battersFaced: number;
  pitchesThrown: number;
  strikesThrown: number;
  hitsAllowed: number;
  hrAllowed: number;
  strikeouts: number;
  walks: number;
  hbp: number;
  runs: number;
  earnedRuns: number;
}

function buildSectionFromGameLogs(
  battingLogs: RawGameBattingLog[],
  pitchingLogs: RawGamePitchingLog[],
  totalTeamMatchCount: number
): PlayerGrowthSectionPayload {
  let cumPa = 0;
  let cumAb = 0;
  let cumSingles = 0;
  let cumDoubles = 0;
  let cumTriples = 0;
  let cumHr = 0;
  let cumHits = 0;
  let cumRbi = 0;
  let cumRuns = 0;
  let cumWalks = 0;
  let cumHbp = 0;
  let cumSacBunts = 0;
  let cumSacFlies = 0;
  let cumStrikeouts = 0;
  let cumSb = 0;
  let cumPitchesSeen = 0;
  let dirLeft = 0;
  let dirCenter = 0;
  let dirRight = 0;

  const battingTrend: PlayerBattingTrendItem[] = [];
  const monthMap = new Map<
    string,
    {
      games: number;
      pa: number;
      ab: number;
      singles: number;
      doubles: number;
      triples: number;
      hr: number;
      rbi: number;
      runs: number;
      walks: number;
      hbp: number;
      sacFlies: number;
      strikeouts: number;
      sb: number;
    }
  >();

  let multiHitGames = 0;
  let currentHitStreak = 0;
  let maxHitStreak = 0;
  let currentOnBaseStreak = 0;
  let maxOnBaseStreak = 0;

  for (const g of battingLogs) {
    const gameHits = g.singles + g.doubles + g.triples + g.hr;
    cumPa += g.pa;
    cumAb += g.ab;
    cumSingles += g.singles;
    cumDoubles += g.doubles;
    cumTriples += g.triples;
    cumHr += g.hr;
    cumHits += gameHits;
    cumRbi += g.rbi;
    cumRuns += g.runs;
    cumWalks += g.walks;
    cumHbp += g.hbp;
    cumSacBunts += g.sacBunts;
    cumSacFlies += g.sacFlies;
    cumStrikeouts += g.strikeouts;
    cumSb += g.sb;
    cumPitchesSeen += g.pitchesSeen;
    dirLeft += g.dirLeft;
    dirCenter += g.dirCenter;
    dirRight += g.dirRight;

    if (gameHits >= 2) multiHitGames += 1;
    if (g.pa > 0) {
      if (gameHits > 0) {
        currentHitStreak += 1;
        if (currentHitStreak > maxHitStreak) maxHitStreak = currentHitStreak;
      } else {
        currentHitStreak = 0;
      }

      if (gameHits + g.walks + g.hbp > 0) {
        currentOnBaseStreak += 1;
        if (currentOnBaseStreak > maxOnBaseStreak) {
          maxOnBaseStreak = currentOnBaseStreak;
        }
      } else {
        currentOnBaseStreak = 0;
      }
    }

    const cumTb = cumSingles + cumDoubles * 2 + cumTriples * 3 + cumHr * 4;
    const cumAvgNum = cumAb > 0 ? cumHits / cumAb : 0;
    const obpDenom = cumAb + cumWalks + cumHbp + cumSacFlies;
    const cumObpNum = obpDenom > 0 ? (cumHits + cumWalks + cumHbp) / obpDenom : 0;
    const cumSlgNum = cumAb > 0 ? cumTb / cumAb : 0;
    const cumOpsNum = cumObpNum + cumSlgNum;

    battingTrend.push({
      matchId: g.matchId,
      date: g.date,
      opponent: g.opponent,
      matchType: g.matchType,
      tournamentName: g.tournamentName,
      result: g.result,
      myScore: g.myScore,
      opponentScore: g.opponentScore,
      battingOrders: g.battingOrders,
      positions: g.positions,
      pa: g.pa,
      ab: g.ab,
      hits: gameHits,
      doubles: g.doubles,
      triples: g.triples,
      hr: g.hr,
      rbi: g.rbi,
      runs: g.runs,
      walks: g.walks,
      hbp: g.hbp,
      strikeouts: g.strikeouts,
      sb: g.sb,
      pitchesSeen: g.pitchesSeen,
      atBatChips: g.atBatChips,
      gameAvg: g.ab > 0 ? formatAvgRate(gameHits / g.ab) : "---",
      cumAvg: formatAvgRate(cumAvgNum),
      cumAvgNum: Number(cumAvgNum.toFixed(3)),
      cumObp: formatAvgRate(cumObpNum),
      cumObpNum: Number(cumObpNum.toFixed(3)),
      cumOps: formatAvgRate(cumOpsNum),
      cumOpsNum: Number(cumOpsNum.toFixed(3)),
    });

    const ym = extractYearMonth(g.date);
    const mAcc = monthMap.get(ym) || {
      games: 0,
      pa: 0,
      ab: 0,
      singles: 0,
      doubles: 0,
      triples: 0,
      hr: 0,
      rbi: 0,
      runs: 0,
      walks: 0,
      hbp: 0,
      sacFlies: 0,
      strikeouts: 0,
      sb: 0,
    };
    mAcc.games += 1;
    mAcc.pa += g.pa;
    mAcc.ab += g.ab;
    mAcc.singles += g.singles;
    mAcc.doubles += g.doubles;
    mAcc.triples += g.triples;
    mAcc.hr += g.hr;
    mAcc.rbi += g.rbi;
    mAcc.runs += g.runs;
    mAcc.walks += g.walks;
    mAcc.hbp += g.hbp;
    mAcc.sacFlies += g.sacFlies;
    mAcc.strikeouts += g.strikeouts;
    mAcc.sb += g.sb;
    monthMap.set(ym, mAcc);
  }

  const totalBases = cumSingles + cumDoubles * 2 + cumTriples * 3 + cumHr * 4;
  const overallAvgNum = cumAb > 0 ? cumHits / cumAb : 0;
  const overallObpDenom = cumAb + cumWalks + cumHbp + cumSacFlies;
  const overallObpNum =
    overallObpDenom > 0 ? (cumHits + cumWalks + cumHbp) / overallObpDenom : 0;
  const overallSlgNum = cumAb > 0 ? totalBases / cumAb : 0;
  const overallOpsNum = overallObpNum + overallSlgNum;
  const overallBbRate =
    cumPa > 0 ? Math.round(((cumWalks + cumHbp) / cumPa) * 1000) / 10 : 0;
  const overallKRate =
    cumPa > 0 ? Math.round((cumStrikeouts / cumPa) * 1000) / 10 : 0;

  const battingSummary: PlayerGrowthBattingSummary = {
    games: battingLogs.length,
    pa: cumPa,
    ab: cumAb,
    hits: cumHits,
    singles: cumSingles,
    doubles: cumDoubles,
    triples: cumTriples,
    hr: cumHr,
    totalBases,
    rbi: cumRbi,
    runs: cumRuns,
    walks: cumWalks,
    hbp: cumHbp,
    strikeouts: cumStrikeouts,
    sb: cumSb,
    sacBunts: cumSacBunts,
    sacFlies: cumSacFlies,
    pitchesSeen: cumPitchesSeen,
    pitchesPerPa:
      cumPa > 0 && cumPitchesSeen > 0
        ? (cumPitchesSeen / cumPa).toFixed(2)
        : null,
    avg: formatAvgRate(overallAvgNum),
    obp: formatAvgRate(overallObpNum),
    slg: formatAvgRate(overallSlgNum),
    ops: formatAvgRate(overallOpsNum),
    bbRatePercent: overallBbRate,
    kRatePercent: overallKRate,
  };

  const monthlyBatting: PlayerMonthlyBattingItem[] = Array.from(
    monthMap.entries()
  )
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, m]) => {
      const mHits = m.singles + m.doubles + m.triples + m.hr;
      const mTb = m.singles + m.doubles * 2 + m.triples * 3 + m.hr * 4;
      const mAvg = m.ab > 0 ? mHits / m.ab : 0;
      const mObpDenom = m.ab + m.walks + m.hbp + m.sacFlies;
      const mObp = mObpDenom > 0 ? (mHits + m.walks + m.hbp) / mObpDenom : 0;
      const mSlg = m.ab > 0 ? mTb / m.ab : 0;
      const mOps = mObp + mSlg;
      return {
        month,
        monthLabel: formatMonthLabel(month),
        games: m.games,
        pa: m.pa,
        ab: m.ab,
        hits: mHits,
        hr: m.hr,
        rbi: m.rbi,
        runs: m.runs,
        walksAndHbp: m.walks + m.hbp,
        strikeouts: m.strikeouts,
        sb: m.sb,
        avg: formatAvgRate(mAvg),
        avgNum: Number(mAvg.toFixed(3)),
        obp: formatAvgRate(mObp),
        ops: formatAvgRate(mOps),
        kRatePercent:
          m.pa > 0 ? Math.round((m.strikeouts / m.pa) * 1000) / 10 : 0,
        bbRatePercent:
          m.pa > 0
            ? Math.round(((m.walks + m.hbp) / m.pa) * 1000) / 10
            : 0,
      };
    });

  const dirTotal = dirLeft + dirCenter + dirRight;
  const battedDirection: PlayerBattedDirectionSplit = {
    left: dirLeft,
    center: dirCenter,
    right: dirRight,
    total: dirTotal,
    leftPercent: dirTotal > 0 ? Math.round((dirLeft / dirTotal) * 100) : 0,
    centerPercent: dirTotal > 0 ? Math.round((dirCenter / dirTotal) * 100) : 0,
    rightPercent:
      dirTotal > 0
        ? Math.max(
            0,
            100 -
              Math.round((dirLeft / dirTotal) * 100) -
              Math.round((dirCenter / dirTotal) * 100)
          )
        : 0,
  };

  // 直近最大5試合のフォーム比較
  const gamesWithPa = battingLogs.filter((g) => g.pa > 0);
  const recentGames = gamesWithPa.slice(-5);
  let rPa = 0;
  let rAb = 0;
  let rSingles = 0;
  let rDoubles = 0;
  let rTriples = 0;
  let rHr = 0;
  let rWalks = 0;
  let rHbp = 0;
  let rSacFlies = 0;
  let rK = 0;
  for (const rg of recentGames) {
    rPa += rg.pa;
    rAb += rg.ab;
    rSingles += rg.singles;
    rDoubles += rg.doubles;
    rTriples += rg.triples;
    rHr += rg.hr;
    rWalks += rg.walks;
    rHbp += rg.hbp;
    rSacFlies += rg.sacFlies;
    rK += rg.strikeouts;
  }
  const rHits = rSingles + rDoubles + rTriples + rHr;
  const rTb = rSingles + rDoubles * 2 + rTriples * 3 + rHr * 4;
  const rAvgNum = rAb > 0 ? rHits / rAb : 0;
  const rObpDenom = rAb + rWalks + rHbp + rSacFlies;
  const rObpNum = rObpDenom > 0 ? (rHits + rWalks + rHbp) / rObpDenom : 0;
  const rSlgNum = rAb > 0 ? rTb / rAb : 0;
  const rOpsNum = rObpNum + rSlgNum;
  const rKRate = rPa > 0 ? Math.round((rK / rPa) * 1000) / 10 : 0;

  const avgDiffPts = Math.round((rAvgNum - overallAvgNum) * 1000);
  const obpDiffPts = Math.round((rObpNum - overallObpNum) * 1000);
  const opsDiffPts = Math.round((rOpsNum - overallOpsNum) * 1000);

  const recentForm: PlayerRecentFormComparison = {
    sampleGames: recentGames.length,
    recentPa: rPa,
    recentAb: rAb,
    recentHits: rHits,
    recentAvg: formatAvgRate(rAvgNum),
    overallAvg: formatAvgRate(overallAvgNum),
    avgDiffPoints: avgDiffPts,
    avgDiffText: formatDiffRate(avgDiffPts),
    recentObp: formatAvgRate(rObpNum),
    overallObp: formatAvgRate(overallObpNum),
    obpDiffPoints: obpDiffPts,
    obpDiffText: formatDiffRate(obpDiffPts),
    recentOps: formatAvgRate(rOpsNum),
    overallOps: formatAvgRate(overallOpsNum),
    opsDiffPoints: opsDiffPts,
    opsDiffText: formatDiffRate(opsDiffPts),
    recentKRatePercent: rKRate,
    overallKRatePercent: overallKRate,
    kRateDiffPercent: Math.round((rKRate - overallKRate) * 10) / 10,
    multiHitGames,
    currentHitStreak,
    maxHitStreak,
    currentOnBaseStreak,
    maxOnBaseStreak,
  };

  // 投手集計
  let pitchingSummary: PlayerGrowthPitchingSummary | null = null;
  const pitchingTrend: PlayerPitchingTrendItem[] = [];

  if (pitchingLogs.length > 0) {
    let pOuts = 0;
    let pBf = 0;
    let pPitches = 0;
    let pStrikes = 0;
    let pHits = 0;
    let pHr = 0;
    let pK = 0;
    let pBb = 0;
    let pHbp = 0;
    let pRuns = 0;
    let pEr = 0;

    for (const pg of pitchingLogs) {
      pOuts += pg.outs;
      pBf += pg.battersFaced;
      pPitches += pg.pitchesThrown;
      pStrikes += pg.strikesThrown;
      pHits += pg.hitsAllowed;
      pHr += pg.hrAllowed;
      pK += pg.strikeouts;
      pBb += pg.walks;
      pHbp += pg.hbp;
      pRuns += pg.runs;
      pEr += pg.earnedRuns;

      const cumEraVal = pOuts > 0 ? (pEr * 21) / pOuts : 0;
      const cumWhipVal = pOuts > 0 ? ((pHits + pBb + pHbp) * 3) / pOuts : 0;
      const gameStrikeRate =
        pg.pitchesThrown > 0
          ? Math.round((pg.strikesThrown / pg.pitchesThrown) * 1000) / 10
          : null;

      pitchingTrend.push({
        matchId: pg.matchId,
        date: pg.date,
        opponent: pg.opponent,
        matchType: pg.matchType,
        tournamentName: pg.tournamentName,
        result: pg.result,
        myScore: pg.myScore,
        opponentScore: pg.opponentScore,
        outs: pg.outs,
        ip: formatInningsPitched(pg.outs),
        battersFaced: pg.battersFaced,
        pitchesThrown: pg.pitchesThrown,
        strikesThrown: pg.strikesThrown,
        strikeRatePercent: gameStrikeRate,
        hitsAllowed: pg.hitsAllowed,
        strikeouts: pg.strikeouts,
        walksAndHbp: pg.walks + pg.hbp,
        runs: pg.runs,
        earnedRuns: pg.earnedRuns,
        cumEra: pOuts > 0 ? cumEraVal.toFixed(2) : "-.--",
        cumEraNum: Number(cumEraVal.toFixed(2)),
        cumWhip: pOuts > 0 ? cumWhipVal.toFixed(2) : "-.--",
        cumWhipNum: Number(cumWhipVal.toFixed(2)),
      });
    }

    const finalEra = pOuts > 0 ? ((pEr * 21) / pOuts).toFixed(2) : "-.--";
    const finalWhip =
      pOuts > 0 ? (((pHits + pBb + pHbp) * 3) / pOuts).toFixed(2) : "-.--";
    const finalK7 = pOuts > 0 ? ((pK * 21) / pOuts).toFixed(2) : "0.00";
    const finalKBb =
      pBb > 0 ? (pK / pBb).toFixed(2) : pK > 0 ? `${pK}.00` : "0.00";

    pitchingSummary = {
      games: pitchingLogs.length,
      outs: pOuts,
      ip: formatInningsPitched(pOuts),
      battersFaced: pBf,
      pitchesThrown: pPitches,
      strikesThrown: pStrikes,
      strikeRatePercent:
        pPitches > 0
          ? Math.round((pStrikes / pPitches) * 1000) / 10
          : null,
      hitsAllowed: pHits,
      hrAllowed: pHr,
      strikeouts: pK,
      walks: pBb,
      hbp: pHbp,
      runs: pRuns,
      earnedRuns: pEr,
      era: finalEra,
      whip: finalWhip,
      kPer7: finalK7,
      kBbRatio: finalKBb,
    };
  }

  return {
    matchCount: totalTeamMatchCount,
    battingSummary,
    battingTrend,
    monthlyBatting,
    battedDirection,
    recentForm,
    pitchingSummary,
    pitchingTrend,
  };
}

function buildDemoPlayerGrowthResponse(
  requestedPlayerId?: string | null
): PlayerGrowthResponse {
  const seed =
    DEMO_ROSTER_SEEDS.find((p) => p.id === requestedPlayerId) ||
    DEMO_ROSTER_SEEDS.find((p) => p.id === "demo-player-1") ||
    DEMO_ROSTER_SEEDS[0];

  const roster: PlayerGrowthRosterItem[] = DEMO_ROSTER_SEEDS.map((s) => ({
    id: s.id,
    name: s.name,
    nameKana: s.nameKana,
    uniformNumber: s.uniformNumber,
    primaryPosition: s.primaryPosition,
    subPositions: s.subPositions,
    positionSource: "match_data",
    profileImageUrl: null,
    isCaptain: s.isCaptain,
  }));

  const demoSchedule: Array<{
    matchId: string;
    date: string;
    opponent: string;
    matchType: "official" | "exchange" | "practice";
    tournamentName: string | null;
    result: "win" | "loss" | "draw";
    myScore: number;
    opponentScore: number;
    ab: number;
    singles: number;
    doubles: number;
    hr: number;
    walks: number;
    strikeouts: number;
    rbi: number;
    runs: number;
    sb: number;
    pitchesSeen: number;
    dirL: number;
    dirC: number;
    dirR: number;
    chips: GrowthAtBatChip[];
  }> = [
    {
      matchId: "demo-match-g1",
      date: "2026-07-19",
      opponent: "横浜ベイボーイズ",
      matchType: "practice",
      tournamentName: null,
      result: "loss",
      myScore: 3,
      opponentScore: 5,
      ab: 3,
      singles: 0,
      doubles: 0,
      hr: 0,
      walks: 1,
      strikeouts: 2,
      rbi: 0,
      runs: 0,
      sb: 0,
      pitchesSeen: 15,
      dirL: 1,
      dirC: 0,
      dirR: 0,
      chips: [
        { inning: 1, label: "三振", kind: "out", rbi: 0 },
        { inning: 3, label: "遊ゴロ", kind: "out", rbi: 0 },
        { inning: 5, label: "四球", kind: "walk", rbi: 0 },
        { inning: 7, label: "三振", kind: "out", rbi: 0 },
      ],
    },
    {
      matchId: "demo-match-g2",
      date: "2026-08-02",
      opponent: "多摩川サンダース",
      matchType: "exchange",
      tournamentName: "サマー親善交流戦",
      result: "win",
      myScore: 6,
      opponentScore: 2,
      ab: 4,
      singles: 1,
      doubles: 0,
      hr: 0,
      walks: 0,
      strikeouts: 1,
      rbi: 1,
      runs: 1,
      sb: 1,
      pitchesSeen: 16,
      dirL: 1,
      dirC: 1,
      dirR: 1,
      chips: [
        { inning: 1, label: "左安", kind: "hit", rbi: 1 },
        { inning: 3, label: "中飛", kind: "out", rbi: 0 },
        { inning: 5, label: "三振", kind: "out", rbi: 0 },
        { inning: 6, label: "二ゴロ", kind: "out", rbi: 0 },
      ],
    },
    {
      matchId: "demo-match-g3",
      date: "2026-08-23",
      opponent: "武蔵野ライオンズ",
      matchType: "practice",
      tournamentName: null,
      result: "win",
      myScore: 7,
      opponentScore: 4,
      ab: 3,
      singles: 1,
      doubles: 1,
      hr: 0,
      walks: 1,
      strikeouts: 0,
      rbi: 2,
      runs: 2,
      sb: 1,
      pitchesSeen: 17,
      dirL: 1,
      dirC: 1,
      dirR: 1,
      chips: [
        { inning: 1, label: "四球", kind: "walk", rbi: 0 },
        { inning: 2, label: "左二", kind: "hit", rbi: 2 },
        { inning: 4, label: "中安", kind: "hit", rbi: 0 },
        { inning: 6, label: "右飛", kind: "out", rbi: 0 },
      ],
    },
    {
      matchId: "demo-match-g4",
      date: "2026-09-06",
      opponent: "川崎イーグルス",
      matchType: "official",
      tournamentName: "秋季大会 1回戦",
      result: "win",
      myScore: 5,
      opponentScore: 1,
      ab: 3,
      singles: 1,
      doubles: 0,
      hr: 0,
      walks: 1,
      strikeouts: 1,
      rbi: 1,
      runs: 1,
      sb: 1,
      pitchesSeen: 18,
      dirL: 0,
      dirC: 1,
      dirR: 1,
      chips: [
        { inning: 1, label: "中安", kind: "hit", rbi: 1 },
        { inning: 3, label: "三振", kind: "out", rbi: 0 },
        { inning: 5, label: "四球", kind: "walk", rbi: 0 },
        { inning: 6, label: "一ゴロ", kind: "out", rbi: 0 },
      ],
    },
    {
      matchId: "demo-match-g5",
      date: "2026-09-20",
      opponent: "世田谷フェニックス",
      matchType: "official",
      tournamentName: "秋季大会 2回戦",
      result: "win",
      myScore: 4,
      opponentScore: 3,
      ab: 4,
      singles: 1,
      doubles: 1,
      hr: 0,
      walks: 0,
      strikeouts: 0,
      rbi: 1,
      runs: 1,
      sb: 0,
      pitchesSeen: 15,
      dirL: 1,
      dirC: 2,
      dirR: 1,
      chips: [
        { inning: 1, label: "遊ゴロ", kind: "out", rbi: 0 },
        { inning: 3, label: "中安", kind: "hit", rbi: 0 },
        { inning: 5, label: "中飛", kind: "out", rbi: 0 },
        { inning: 7, label: "右二", kind: "hit", rbi: 1 },
      ],
    },
    {
      matchId: "demo-match-g6",
      date: "2026-10-04",
      opponent: "港北スターズ",
      matchType: "exchange",
      tournamentName: "オータム交流リーグ",
      result: "draw",
      myScore: 4,
      opponentScore: 4,
      ab: 3,
      singles: 2,
      doubles: 0,
      hr: 0,
      walks: 1,
      strikeouts: 0,
      rbi: 1,
      runs: 2,
      sb: 2,
      pitchesSeen: 19,
      dirL: 1,
      dirC: 1,
      dirR: 1,
      chips: [
        { inning: 1, label: "左安", kind: "hit", rbi: 0 },
        { inning: 3, label: "四球", kind: "walk", rbi: 0 },
        { inning: 5, label: "右安", kind: "hit", rbi: 1 },
        { inning: 7, label: "中飛", kind: "out", rbi: 0 },
      ],
    },
    {
      matchId: "demo-match-g7",
      date: "2026-10-18",
      opponent: "湘南マリナーズ",
      matchType: "official",
      tournamentName: "秋季大会 準決勝",
      result: "win",
      myScore: 8,
      opponentScore: 2,
      ab: 4,
      singles: 1,
      doubles: 1,
      hr: 1,
      walks: 0,
      strikeouts: 0,
      rbi: 3,
      runs: 2,
      sb: 1,
      pitchesSeen: 16,
      dirL: 1,
      dirC: 2,
      dirR: 1,
      chips: [
        { inning: 1, label: "中二", kind: "hit", rbi: 1 },
        { inning: 2, label: "左本", kind: "hr", rbi: 2 },
        { inning: 4, label: "右安", kind: "hit", rbi: 0 },
        { inning: 6, label: "中飛", kind: "out", rbi: 0 },
      ],
    },
    {
      matchId: "demo-match-g8",
      date: "2026-10-25",
      opponent: "相模原西リトルシニア",
      matchType: "official",
      tournamentName: "秋季大会 決勝",
      result: "win",
      myScore: 6,
      opponentScore: 3,
      ab: 3,
      singles: 1,
      doubles: 1,
      hr: 0,
      walks: 1,
      strikeouts: 0,
      rbi: 2,
      runs: 2,
      sb: 1,
      pitchesSeen: 18,
      dirL: 0,
      dirC: 2,
      dirR: 1,
      chips: [
        { inning: 1, label: "四球", kind: "walk", rbi: 0 },
        { inning: 3, label: "中安", kind: "hit", rbi: 1 },
        { inning: 5, label: "右二", kind: "hit", rbi: 1 },
        { inning: 6, label: "中飛", kind: "out", rbi: 0 },
      ],
    },
  ];

  const mainOrder = seed.battingOrders[0]?.order || 3;
  const battingLogs: RawGameBattingLog[] = demoSchedule.map((d, idx) => ({
    matchId: d.matchId,
    date: d.date,
    opponent: d.opponent,
    matchType: d.matchType,
    tournamentName: d.tournamentName,
    result: d.result,
    myScore: d.myScore,
    opponentScore: d.opponentScore,
    battingOrders: [mainOrder],
    positions:
      idx === 2 || idx === 5
        ? [
            seed.primaryPosition,
            ...(seed.subPositions[0] ? [seed.subPositions[0]] : []),
          ]
        : [seed.primaryPosition],
    pa: d.ab + d.walks,
    ab: d.ab,
    singles: d.singles,
    doubles: d.doubles,
    triples: 0,
    hr: d.hr,
    rbi: d.rbi,
    runs: d.runs,
    walks: d.walks,
    hbp: 0,
    sacBunts: 0,
    sacFlies: 0,
    strikeouts: d.strikeouts,
    sb: d.sb,
    pitchesSeen: d.pitchesSeen,
    dirLeft: d.dirL,
    dirCenter: d.dirC,
    dirRight: d.dirR,
    atBatChips: d.chips,
  }));

  const pitchingLogs: RawGamePitchingLog[] = seed.isPitcher
    ? [
        {
          matchId: "demo-match-g1",
          date: "2026-07-19",
          opponent: "横浜ベイボーイズ",
          matchType: "practice",
          tournamentName: null,
          result: "loss",
          myScore: 3,
          opponentScore: 5,
          outs: 12,
          battersFaced: 19,
          pitchesThrown: 72,
          strikesThrown: 41,
          hitsAllowed: 5,
          hrAllowed: 0,
          strikeouts: 4,
          walks: 3,
          hbp: 0,
          runs: 3,
          earnedRuns: 3,
        },
        {
          matchId: "demo-match-g3",
          date: "2026-08-23",
          opponent: "武蔵野ライオンズ",
          matchType: "practice",
          tournamentName: null,
          result: "win",
          myScore: 7,
          opponentScore: 4,
          outs: 15,
          battersFaced: 21,
          pitchesThrown: 78,
          strikesThrown: 49,
          hitsAllowed: 4,
          hrAllowed: 0,
          strikeouts: 6,
          walks: 2,
          hbp: 0,
          runs: 2,
          earnedRuns: 2,
        },
        {
          matchId: "demo-match-g4",
          date: "2026-09-06",
          opponent: "川崎イーグルス",
          matchType: "official",
          tournamentName: "秋季大会 1回戦",
          result: "win",
          myScore: 5,
          opponentScore: 1,
          outs: 21,
          battersFaced: 26,
          pitchesThrown: 89,
          strikesThrown: 60,
          hitsAllowed: 3,
          hrAllowed: 0,
          strikeouts: 8,
          walks: 1,
          hbp: 0,
          runs: 1,
          earnedRuns: 1,
        },
        {
          matchId: "demo-match-g7",
          date: "2026-10-18",
          opponent: "湘南マリナーズ",
          matchType: "official",
          tournamentName: "秋季大会 準決勝",
          result: "win",
          myScore: 8,
          opponentScore: 2,
          outs: 18,
          battersFaced: 23,
          pitchesThrown: 82,
          strikesThrown: 58,
          hitsAllowed: 3,
          hrAllowed: 0,
          strikeouts: 7,
          walks: 1,
          hbp: 0,
          runs: 1,
          earnedRuns: 1,
        },
      ]
    : [];

  const filterKeys: GrowthFilterKey[] = [
    "all",
    "official",
    "exchange",
    "practice",
  ];
  const sectionsByFilter = {} as Record<
    GrowthFilterKey,
    PlayerGrowthSectionPayload
  >;
  for (const fk of filterKeys) {
    const fBat =
      fk === "all"
        ? battingLogs
        : battingLogs.filter((b) => b.matchType === fk);
    const fPit =
      fk === "all"
        ? pitchingLogs
        : pitchingLogs.filter((p) => p.matchType === fk);
    const fCount =
      fk === "all"
        ? demoSchedule.length
        : demoSchedule.filter((m) => m.matchType === fk).length;
    sectionsByFilter[fk] = buildSectionFromGameLogs(fBat, fPit, fCount);
  }

  return {
    success: true,
    isDemo: true,
    team: {
      id: "demo-team",
      name: "iScore ヒーローズ (Aチーム)",
      orgName: "iScore ヒーローズ",
      teamName: "Aチーム",
      year: 2026,
    },
    roster,
    player: {
      id: seed.id,
      name: seed.name,
      nameKana: seed.nameKana,
      uniformNumber: seed.uniformNumber,
      throws: seed.throws,
      bats: seed.bats,
      height: seed.height,
      weight: seed.weight,
      profileImageUrl: null,
      notes: seed.notes,
      isCaptain: seed.isCaptain,
      primaryPosition: seed.primaryPosition,
      subPositions: seed.subPositions,
      registeredPrimaryPosition: seed.primaryPosition,
      registeredSubPositions: seed.subPositions,
      positionCounts: seed.positionCounts,
      battingOrderCounts: seed.battingOrders,
      totalPositionGames: 12,
      positionSource: "match_data",
    },
    sectionsByFilter,
  };
}

liffPlayerGrowthRouter.get("/", async (c) => {
  await ensurePlayerProfileColumns(c.env.DB);
  const db = drizzle(c.env.DB);
  const teamId = c.req.query("teamId") || "demo-team";
  const requestedPlayerId = c.req.query("playerId") || null;

  if (teamId === "demo-team") {
    return c.json(buildDemoPlayerGrowthResponse(requestedPlayerId));
  }

  try {
    const teamRow = await db
      .select({
        id: teams.id,
        name: teams.name,
        year: teams.year,
        captainId: teams.captainId,
        orgName: organizations.name,
      })
      .from(teams)
      .leftJoin(organizations, eq(teams.organizationId, organizations.id))
      .where(eq(teams.id, teamId))
      .get();

    if (!teamRow) {
      return c.json(
        { success: false, error: "指定されたチームが見つかりません" },
        404
      );
    }

    const rawPlayers = await db
      .select({
        id: players.id,
        name: players.name,
        nameKana: players.nameKana,
        uniformNumber: players.uniformNumber,
        primaryPosition: players.primaryPosition,
        subPositions: players.subPositions,
        throws: players.throws,
        bats: players.bats,
        height: players.height,
        weight: players.weight,
        profileImageUrl: players.profileImageUrl,
        notes: players.notes,
        isActive: players.isActive,
      })
      .from(players)
      .where(eq(players.teamId, teamId))
      .all();

    if (rawPlayers.length === 0) {
      return c.json(
        { success: false, error: "このチームにはまだ選手が登録されていません" },
        404
      );
    }

    const {
      byPlayerId: aggregatedPosMap,
      perMatchPlayerPositions,
      perMatchPlayerOrders,
    } = await aggregateTeamPlayerPositions(
      c.env.DB,
      teamId,
      rawPlayers.map((rp) => ({
        id: rp.id,
        name: rp.name,
        uniformNumber: rp.uniformNumber,
        primaryPosition: rp.primaryPosition,
        subPositions: rp.subPositions,
      }))
    );

    const sortedActivePlayers = rawPlayers
      .filter((p) => p.isActive !== false)
      .sort((a, b) => {
        const strA = (a.uniformNumber || "").trim();
        const strB = (b.uniformNumber || "").trim();
        const numA = parseInt(strA.replace(/[^0-9]/g, ""), 10);
        const numB = parseInt(strB.replace(/[^0-9]/g, ""), 10);
        if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
          if (numA !== numB) return numA - numB;
          return strA.localeCompare(strB);
        }
        if (!Number.isNaN(numA)) return -1;
        if (!Number.isNaN(numB)) return 1;
        return (a.nameKana || a.name || "").localeCompare(
          b.nameKana || b.name || "",
          "ja"
        );
      });

    const targetPlayer =
      (requestedPlayerId
        ? rawPlayers.find((p) => p.id === requestedPlayerId)
        : null) ||
      (teamRow.captainId
        ? sortedActivePlayers.find((p) => p.id === teamRow.captainId)
        : null) ||
      sortedActivePlayers[0] ||
      rawPlayers[0];

    const rosterList: PlayerGrowthRosterItem[] = sortedActivePlayers.map(
      (p) => {
        const agg = aggregatedPosMap.get(p.id);
        return {
          id: p.id,
          name: p.name,
          nameKana: p.nameKana || null,
          uniformNumber: p.uniformNumber || "",
          primaryPosition: agg ? agg.primaryPosition : p.primaryPosition || null,
          subPositions: agg ? agg.subPositions : [],
          positionSource: agg ? agg.positionSource : "profile",
          profileImageUrl: p.profileImageUrl || null,
          isCaptain: Boolean(teamRow.captainId && teamRow.captainId === p.id),
        };
      }
    );

    if (!rosterList.some((r) => r.id === targetPlayer.id)) {
      const agg = aggregatedPosMap.get(targetPlayer.id);
      rosterList.unshift({
        id: targetPlayer.id,
        name: targetPlayer.name,
        nameKana: targetPlayer.nameKana || null,
        uniformNumber: targetPlayer.uniformNumber || "",
        primaryPosition: agg
          ? agg.primaryPosition
          : targetPlayer.primaryPosition || null,
        subPositions: agg ? agg.subPositions : [],
        positionSource: agg ? agg.positionSource : "profile",
        profileImageUrl: targetPlayer.profileImageUrl || null,
        isCaptain: Boolean(
          teamRow.captainId && teamRow.captainId === targetPlayer.id
        ),
      });
    }

    const playerIdByCleanName = new Map<string, string>();
    for (const rp of rawPlayers) {
      const cn = normalizePlayerNameKey(rp.name);
      if (cn && !playerIdByCleanName.has(cn)) {
        playerIdByCleanName.set(cn, rp.id);
      }
    }

    // チームの試合一覧を時系列順（古い順 -> 新しい順）で取得
    const rawMatches = await db
      .select({
        id: matches.id,
        date: matches.date,
        opponent: matches.opponent,
        matchType: matches.matchType,
        battingOrder: matches.battingOrder,
        status: matches.status,
        myScore: matches.myScore,
        opponentScore: matches.opponentScore,
        createdAt: matches.createdAt,
        tournamentName: tournaments.name,
      })
      .from(matches)
      .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
      .where(eq(matches.teamId, teamId))
      .orderBy(asc(matches.date), asc(matches.createdAt))
      .all();

    const finishedMatches = rawMatches
      .filter(
        (m) =>
          m.status === "finished" &&
          m.myScore !== null &&
          m.opponentScore !== null
      )
      .sort((a, b) =>
        a.date.replace(/\//g, "-").localeCompare(b.date.replace(/\//g, "-"))
      );

    const finishedIds = finishedMatches.map((m) => m.id);

    const allAtBats: Array<typeof atBats.$inferSelect> = [];
    const allAdvances: Array<typeof baseAdvances.$inferSelect> = [];
    const allPlayLogs: Array<{
      atBatId: string | null;
      matchId: string;
      description: string;
    }> = [];
    const allSnapshots: Array<typeof matchScorebookSnapshots.$inferSelect> = [];
    const pitchSummaryByAtBatId = new Map<
      string,
      { totalPitches: number; strikes: number }
    >();

    interface RawPitchAggRow {
      atBatId: string;
      totalPitches: number;
      strikes: number;
    }

    if (finishedIds.length > 0) {
      const chunkSize = 50;
      for (let i = 0; i < finishedIds.length; i += chunkSize) {
        const batch = finishedIds.slice(i, i + chunkSize);
        const placeholders = batch.map(() => "?").join(",");

        const [abRows, advRows, plRows, snapRows, pitchAggRes] =
          await Promise.all([
            db
              .select()
              .from(atBats)
              .where(inArray(atBats.matchId, batch))
              .orderBy(asc(atBats.inning), asc(atBats.createdAt))
              .all(),
            db
              .select()
              .from(baseAdvances)
              .where(inArray(baseAdvances.matchId, batch))
              .all(),
            db
              .select({
                atBatId: playLogs.atBatId,
                matchId: playLogs.matchId,
                description: playLogs.description,
              })
              .from(playLogs)
              .where(inArray(playLogs.matchId, batch))
              .all(),
            db
              .select()
              .from(matchScorebookSnapshots)
              .where(inArray(matchScorebookSnapshots.matchId, batch))
              .all(),
            c.env.DB.prepare(
              `SELECT
                 p.at_bat_id AS atBatId,
                 SUM(CASE WHEN p.result NOT IN ('pickoff_1b','pickoff_2b','pickoff_3b','pickoff','balk') THEN 1 ELSE 0 END) AS totalPitches,
                 SUM(CASE WHEN p.result IN ('strike','swinging_strike','bunt_swinging','foul','bunt_foul','in_play','hit') THEN 1 ELSE 0 END) AS strikes
               FROM pitches p
               JOIN at_bats ab ON p.at_bat_id = ab.id
               WHERE ab.match_id IN (${placeholders})
               GROUP BY p.at_bat_id`
            )
              .bind(...batch)
              .all<RawPitchAggRow>(),
          ]);

        allAtBats.push(...abRows);
        allAdvances.push(...advRows);
        allPlayLogs.push(...plRows);
        allSnapshots.push(...snapRows);

        for (const pr of pitchAggRes.results || []) {
          if (pr.atBatId) {
            pitchSummaryByAtBatId.set(pr.atBatId, {
              totalPitches: Number(pr.totalPitches) || 0,
              strikes: Number(pr.strikes) || 0,
            });
          }
        }
      }
    }

    const explicitRbiByAtBatId = new Map<string, number>();
    const playLogDescByAtBatId = new Map<string, string>();
    for (const pl of allPlayLogs) {
      if (!pl.atBatId || !pl.description) continue;
      playLogDescByAtBatId.set(pl.atBatId, pl.description);
      const rbiMatch = pl.description.match(/打点(\d+)/);
      if (rbiMatch) {
        explicitRbiByAtBatId.set(pl.atBatId, Number(rbiMatch[1]));
      }
    }

    const extractBatterFromLog = (descText: string | undefined): string => {
      if (!descText) return "";
      const m = descText.match(/^(?:\d+番\s*)?([^:：]+)[：:]/);
      return m ? m[1].trim() : "";
    };

    const snapByMatchId = new Map<
      string,
      typeof matchScorebookSnapshots.$inferSelect
    >();
    for (const sn of allSnapshots) {
      snapByMatchId.set(sn.matchId, sn);
    }

    const atBatsByMatchId = new Map<
      string,
      Array<typeof atBats.$inferSelect>
    >();
    for (const ab of allAtBats) {
      const list = atBatsByMatchId.get(ab.matchId) || [];
      list.push(ab);
      atBatsByMatchId.set(ab.matchId, list);
    }

    const advancesByAtBatId = new Map<
      string,
      Array<typeof baseAdvances.$inferSelect>
    >();
    for (const adv of allAdvances) {
      const list = advancesByAtBatId.get(adv.atBatId) || [];
      list.push(adv);
      advancesByAtBatId.set(adv.atBatId, list);
    }

    const snapMapByDbAtBatId = new Map<string, ScorebookV2AtBat>();
    const oppStructureByMatchId = new Map<string, ScorebookSheetStructure>();

    for (const m of finishedMatches) {
      const sn = snapByMatchId.get(m.id);
      if (!sn) continue;
      const isTop = m.battingOrder === "first";
      const myAtBatsJson = isTop ? sn.topAtBatsJson : sn.bottomAtBatsJson;
      const oppAtBatsJson = isTop ? sn.bottomAtBatsJson : sn.topAtBatsJson;
      const oppStructJson = isTop
        ? sn.bottomStructureJson
        : sn.topStructureJson;

      let mySnapAbs: ScorebookV2AtBat[] = [];
      let oppSnapAbs: ScorebookV2AtBat[] = [];
      try {
        if (myAtBatsJson) {
          mySnapAbs = JSON.parse(myAtBatsJson) as ScorebookV2AtBat[];
        }
      } catch {}
      try {
        if (oppAtBatsJson) {
          oppSnapAbs = JSON.parse(oppAtBatsJson) as ScorebookV2AtBat[];
        }
      } catch {}
      try {
        if (oppStructJson) {
          oppStructureByMatchId.set(
            m.id,
            JSON.parse(oppStructJson) as ScorebookSheetStructure
          );
        }
      } catch {}

      const myQueueByInn = new Map<number, ScorebookV2AtBat[]>();
      for (const sAb of mySnapAbs) {
        const q = myQueueByInn.get(sAb.inning) || [];
        q.push(sAb);
        myQueueByInn.set(sAb.inning, q);
      }
      const oppQueueByInn = new Map<number, ScorebookV2AtBat[]>();
      for (const sAb of oppSnapAbs) {
        const q = oppQueueByInn.get(sAb.inning) || [];
        q.push(sAb);
        oppQueueByInn.set(sAb.inning, q);
      }
      const myOffsets = new Map<number, number>();
      const oppOffsets = new Map<number, number>();
      for (const dbAb of atBatsByMatchId.get(m.id) || []) {
        if (dbAb.isTop === isTop) {
          const idx = myOffsets.get(dbAb.inning) || 0;
          myOffsets.set(dbAb.inning, idx + 1);
          const sAb = myQueueByInn.get(dbAb.inning)?.[idx];
          if (sAb) snapMapByDbAtBatId.set(dbAb.id, sAb);
        } else {
          const idx = oppOffsets.get(dbAb.inning) || 0;
          oppOffsets.set(dbAb.inning, idx + 1);
          const sAb = oppQueueByInn.get(dbAb.inning)?.[idx];
          if (sAb) snapMapByDbAtBatId.set(dbAb.id, sAb);
        }
      }
    }

    const resolvePitchCountForAtBat = (
      dbAbId: string,
      snapAb?: ScorebookV2AtBat
    ): { totalPitches: number; strikes: number } => {
      const fromDb = pitchSummaryByAtBatId.get(dbAbId);
      if (fromDb && fromDb.totalPitches > 0) return fromDb;
      if (snapAb && Array.isArray(snapAb.pitches) && snapAb.pitches.length > 0) {
        let total = 0;
        let strikes = 0;
        for (const p of snapAb.pitches as CanonicalPitchResult[]) {
          if (isNonPitchMoundEvent(p)) continue;
          total += 1;
          if (p !== "ball" && p !== "hbp") {
            strikes += 1;
          }
        }
        return { totalPitches: total, strikes };
      }
      return { totalPitches: 0, strikes: 0 };
    };

    const targetPid = targetPlayer.id;
    const allBattingLogs: RawGameBattingLog[] = [];
    const allPitchingLogs: RawGamePitchingLog[] = [];

    for (const m of finishedMatches) {
      const isMyTop = m.battingOrder === "first";
      const matchType = normalizeMatchType(m.matchType);
      const myScore = m.myScore ?? 0;
      const oppScore = m.opponentScore ?? 0;
      const result: "win" | "loss" | "draw" =
        myScore > oppScore ? "win" : myScore < oppScore ? "loss" : "draw";

      const mAbs = atBatsByMatchId.get(m.id) || [];
      const matchPositions =
        perMatchPlayerPositions.get(m.id)?.get(targetPid) || [];
      const matchOrders = perMatchPlayerOrders.get(m.id)?.get(targetPid) || [];

      let gPa = 0;
      let gAb = 0;
      let g1B = 0;
      let g2B = 0;
      let g3B = 0;
      let gHR = 0;
      let gRbi = 0;
      let gRuns = 0;
      let gWalks = 0;
      let gHbp = 0;
      let gSacBunt = 0;
      let gSacFly = 0;
      let gK = 0;
      let gSb = 0;
      let gPitchesSeen = 0;
      let gDirL = 0;
      let gDirC = 0;
      let gDirR = 0;
      const gChips: GrowthAtBatChip[] = [];
      const dynamicOrders = new Set<number>(matchOrders);

      let pAppeared = false;
      let pOuts = 0;
      let pBf = 0;
      let pPitches = 0;
      let pStrikes = 0;
      let pHits = 0;
      let pHr = 0;
      let pK = 0;
      let pWalks = 0;
      let pHbp = 0;
      let pRuns = 0;
      let pEr = 0;

      for (const ab of mAbs) {
        const isMyAttack = ab.isTop === isMyTop;
        const snapAb = snapMapByDbAtBatId.get(ab.id);
        const res = ab.result || "";
        const logDesc = playLogDescByAtBatId.get(ab.id);

        if (isMyAttack) {
          const fallbackName =
            snapAb?.batterName?.trim() || extractBatterFromLog(logDesc) || "";
          const cleanBatter = normalizePlayerNameKey(fallbackName);
          const batterKey =
            ab.batterId ||
            snapAb?.batterPlayerId ||
            (cleanBatter ? playerIdByCleanName.get(cleanBatter) || "" : "");

          if (
            batterKey === targetPid &&
            res !== "other" &&
            !res.includes("途中断")
          ) {
            gPa += 1;
            if (snapAb?.battingOrder && snapAb.battingOrder > 0) {
              dynamicOrders.add(snapAb.battingOrder);
            }

            const pitchCounts = resolvePitchCountForAtBat(ab.id, snapAb);
            gPitchesSeen += pitchCounts.totalPitches;

            const isWalk =
              res === "walk" ||
              res === "intentional_walk" ||
              res.includes("BB") ||
              res.includes("四球") ||
              res.includes("敬遠");
            const isHbp =
              res === "hit_by_pitch" ||
              res.includes("HP") ||
              res.includes("DB") ||
              res.includes("死球");
            const isSacBunt =
              res === "sac_bunt" ||
              res.includes("SH") ||
              res.includes("犠打") ||
              (res.includes("犠") && !res.includes("飛"));
            const isSacFly =
              res === "sac_fly" || res.includes("SF") || res.includes("犠飛");
            const isInterferenceReach =
              res === "interference" || res.includes("打撃妨害");

            if (isWalk) gWalks += 1;
            if (isHbp) gHbp += 1;
            if (isSacBunt) gSacBunt += 1;
            if (isSacFly) gSacFly += 1;

            if (
              !isWalk &&
              !isHbp &&
              !isSacBunt &&
              !isSacFly &&
              !isInterferenceReach
            ) {
              gAb += 1;
            }

            const { is1B, is2B, is3B, isHR } = classifyHitKind(res);
            if (isHR) gHR += 1;
            else if (is3B) g3B += 1;
            else if (is2B) g2B += 1;
            else if (is1B) g1B += 1;

            const isStrikeoutPlay =
              res === "strikeout" ||
              res === "dropped_third_strike" ||
              res === "dropped_third_strike_out" ||
              res.includes("K") ||
              res.includes("三振") ||
              res.includes("振逃");
            if (isStrikeoutPlay) gK += 1;

            const isDoublePlay =
              res === "double_play" ||
              res === "triple_play" ||
              res.includes("DP") ||
              res.includes("併殺") ||
              res.includes("三重殺") ||
              res.includes("ゲッツー");
            const isErr = isErrorResult(res);

            const abSafeRuns = (advancesByAtBatId.get(ab.id) || []).filter(
              (a) => a.toBase === 4 && !a.isOut
            );
            const snapSelfScored = Boolean(
              snapAb?.advances?.some(
                (a) => a.from === "BAT" && a.to === "HP" && !a.isOut
              )
            );
            const hasBatterSelfRunRow =
              abSafeRuns.some(
                (a) => a.runnerId === targetPid || a.fromBase === 0
              ) ||
              (abSafeRuns.length > 0 && snapSelfScored);

            if (isHR && !hasBatterSelfRunRow) {
              gRuns += 1;
            }

            const explicitRbi = explicitRbiByAtBatId.get(ab.id);
            const rbiCount =
              typeof explicitRbi === "number"
                ? explicitRbi
                : typeof snapAb?.rbi === "number"
                ? snapAb.rbi
                : isDoublePlay || isErr || isStrikeoutPlay
                ? 0
                : isWalk || isHbp || isInterferenceReach
                ? Math.min(
                    1,
                    abSafeRuns.filter((a) => !isNonRbiAdvanceReason(a.reason))
                      .length
                  )
                : abSafeRuns.filter((a) => !isNonRbiAdvanceReason(a.reason))
                    .length + (isHR && !hasBatterSelfRunRow ? 1 : 0);

            gRbi += rbiCount;

            const dir = classifyBattedBallDirection(
              snapAb?.battedDirection,
              snapAb?.resultLabel,
              res,
              logDesc
            );
            if (dir === "left") gDirL += 1;
            else if (dir === "center") gDirC += 1;
            else if (dir === "right") gDirR += 1;

            const chipMeta = translateAtBatChipLabel(
              res,
              snapAb?.resultLabel,
              snapAb?.battedDirection
            );
            gChips.push({
              inning: ab.inning,
              label: chipMeta.label,
              kind: chipMeta.kind,
              rbi: rbiCount,
            });
          }

          // 走塁（得点・盗塁）
          const abAdvances = advancesByAtBatId.get(ab.id) || [];
          abAdvances.forEach((adv, advIdx) => {
            const snapAdv = snapAb?.advances?.[advIdx];
            const fallbackRunner = snapAdv?.runnerName?.trim() || "";
            const cleanRunner = normalizePlayerNameKey(fallbackRunner);
            const runnerKey =
              adv.runnerId ||
              (cleanRunner ? playerIdByCleanName.get(cleanRunner) || "" : "");
            if (runnerKey !== targetPid) return;

            if (adv.toBase === 4 && !adv.isOut) {
              gRuns += 1;
            }
            const reasonStr = String(adv.reason || "");
            if (
              !adv.isOut &&
              (reasonStr === "steal" ||
                reasonStr.includes("stolen") ||
                reasonStr.includes("SB") ||
                reasonStr.includes("盗塁"))
            ) {
              gSb += 1;
            }
          });
        } else {
          // 自チーム守備イニング（投手成績）
          const oppSt = oppStructureByMatchId.get(m.id);
          const fallbackPitcher = snapAb?.pitcherName?.trim() || "";
          const cleanPitcher = normalizePlayerNameKey(fallbackPitcher);
          const matchedStint = oppSt?.pitchers?.find(
            (st) =>
              (ab.pitcherId && st.playerId === ab.pitcherId) ||
              (cleanPitcher && normalizePlayerNameKey(st.name) === cleanPitcher)
          );
          const pitcherKey =
            ab.pitcherId ||
            snapAb?.pitcherPlayerId ||
            matchedStint?.playerId ||
            (cleanPitcher &&
            cleanPitcher !== "相手投手" &&
            cleanPitcher !== "投手" &&
            cleanPitcher !== "不明"
              ? playerIdByCleanName.get(cleanPitcher) || ""
              : "");

          if (pitcherKey === targetPid) {
            pAppeared = true;
            if (res !== "other" && !res.includes("途中断")) {
              pBf += 1;
            }
            const pitchCounts = resolvePitchCountForAtBat(ab.id, snapAb);
            pPitches += pitchCounts.totalPitches;
            pStrikes += pitchCounts.strikes;

            const { isHit, isHR } = classifyHitKind(res);
            if (isHit) pHits += 1;
            if (isHR) pHr += 1;

            if (
              res === "strikeout" ||
              res === "dropped_third_strike" ||
              res === "dropped_third_strike_out" ||
              res.includes("K") ||
              res.includes("三振") ||
              res.includes("振逃")
            ) {
              pK += 1;
            }
            if (
              res === "walk" ||
              res === "intentional_walk" ||
              res.includes("BB") ||
              res.includes("四球") ||
              res.includes("敬遠")
            ) {
              pWalks += 1;
            }
            if (
              res === "hit_by_pitch" ||
              res.includes("HP") ||
              res.includes("DB") ||
              res.includes("死球")
            ) {
              pHbp += 1;
            }

            const isOut =
              res.includes("アウト") ||
              res.includes("K") ||
              res.includes("三振") ||
              res.includes("ゴロ") ||
              res.includes("フライ") ||
              res.includes("ライナー") ||
              res.includes("併殺") ||
              res.includes("犠") ||
              /^[1-9]-[1-9]$/.test(res) ||
              /^[1-9]F$/.test(res) ||
              /^[1-9]L$/.test(res) ||
              res === "groundout" ||
              res === "flyout" ||
              res === "lineout" ||
              res === "infield_fly" ||
              res === "strikeout" ||
              res === "dropped_third_strike_out" ||
              res === "sac_bunt" ||
              res === "sac_fly" ||
              res === "interference_out" ||
              res === "double_play" ||
              res === "triple_play" ||
              res.includes("DP") ||
              res.includes("TP");

            if (isOut) {
              if (
                res === "triple_play" ||
                res.includes("三重殺") ||
                res.includes("TP")
              ) {
                pOuts += 3;
              } else if (
                res === "double_play" ||
                res.includes("併殺") ||
                res.includes("DP")
              ) {
                pOuts += 2;
              } else {
                pOuts += 1;
              }
            }

            const defAdvances = advancesByAtBatId.get(ab.id) || [];
            for (const adv of defAdvances) {
              const rStr = String(adv.reason || "");
              if (
                adv.isOut &&
                adv.fromBase > 0 &&
                (rStr === "caught_stealing" ||
                  rStr === "pickoff_out" ||
                  rStr === "interference_out" ||
                  rStr === "appeal_out" ||
                  rStr === "out_on_base" ||
                  rStr.includes("盗塁") ||
                  rStr.includes("牽制"))
              ) {
                pOuts += 1;
              }
              if (adv.toBase === 4 && !adv.isOut) {
                pRuns += 1;
                const lowReason = rStr.toLowerCase();
                const lowAbRes = res.toLowerCase();
                const isUnearned =
                  lowReason === "error" ||
                  lowReason === "pb" ||
                  lowReason === "pickoff_error" ||
                  lowReason.includes("失策") ||
                  lowReason.includes("エラー") ||
                  lowReason.includes("捕逸") ||
                  lowAbRes === "error" ||
                  lowAbRes.includes("失策") ||
                  lowAbRes.includes("エラー");
                if (!isUnearned) {
                  pEr += 1;
                }
              }
            }
          }
        }
      }

      // スコアデータ取込済みの試合で出場記録（打席・走塁・守備ラインナップ）がある場合のみ試合ログへ追加
      const hasAtBatDataInMatch = mAbs.length > 0;
      const appearedInBattingOrFielding =
        gPa > 0 ||
        gRuns > 0 ||
        gSb > 0 ||
        (hasAtBatDataInMatch &&
          (matchPositions.length > 0 || dynamicOrders.size > 0));

      if (appearedInBattingOrFielding) {
        allBattingLogs.push({
          matchId: m.id,
          date: m.date,
          opponent: m.opponent,
          matchType,
          tournamentName: m.tournamentName || null,
          result,
          myScore,
          opponentScore: oppScore,
          battingOrders: Array.from(dynamicOrders).sort((a, b) => a - b),
          positions: matchPositions,
          pa: gPa,
          ab: gAb,
          singles: g1B,
          doubles: g2B,
          triples: g3B,
          hr: gHR,
          rbi: gRbi,
          runs: gRuns,
          walks: gWalks,
          hbp: gHbp,
          sacBunts: gSacBunt,
          sacFlies: gSacFly,
          strikeouts: gK,
          sb: gSb,
          pitchesSeen: gPitchesSeen,
          dirLeft: gDirL,
          dirCenter: gDirC,
          dirRight: gDirR,
          atBatChips: gChips,
        });
      }

      if (pAppeared && (pBf > 0 || pOuts > 0)) {
        allPitchingLogs.push({
          matchId: m.id,
          date: m.date,
          opponent: m.opponent,
          matchType,
          tournamentName: m.tournamentName || null,
          result,
          myScore,
          opponentScore: oppScore,
          outs: pOuts,
          battersFaced: pBf,
          pitchesThrown: pPitches,
          strikesThrown: pStrikes,
          hitsAllowed: pHits,
          hrAllowed: pHr,
          strikeouts: pK,
          walks: pWalks,
          hbp: pHbp,
          runs: pRuns,
          earnedRuns: pEr,
        });
      }
    }

    const filterKeys: GrowthFilterKey[] = [
      "all",
      "official",
      "exchange",
      "practice",
    ];
    const sectionsByFilter = {} as Record<
      GrowthFilterKey,
      PlayerGrowthSectionPayload
    >;
    for (const fk of filterKeys) {
      const fBat =
        fk === "all"
          ? allBattingLogs
          : allBattingLogs.filter((b) => b.matchType === fk);
      const fPit =
        fk === "all"
          ? allPitchingLogs
          : allPitchingLogs.filter((p) => p.matchType === fk);
      const fMatchCount =
        fk === "all"
          ? finishedMatches.length
          : finishedMatches.filter(
              (m) => normalizeMatchType(m.matchType) === fk
            ).length;
      sectionsByFilter[fk] = buildSectionFromGameLogs(
        fBat,
        fPit,
        fMatchCount
      );
    }

    const posAgg = aggregatedPosMap.get(targetPlayer.id);

    const payload: PlayerGrowthResponse = {
      success: true,
      isDemo: false,
      team: {
        id: teamRow.id,
        name: `${teamRow.orgName ? `${teamRow.orgName} ` : ""}${teamRow.name}`.trim(),
        orgName: teamRow.orgName || teamRow.name,
        teamName: teamRow.name,
        year: teamRow.year || 2026,
      },
      roster: rosterList,
      player: {
        id: targetPlayer.id,
        name: targetPlayer.name,
        nameKana: targetPlayer.nameKana || null,
        uniformNumber: targetPlayer.uniformNumber || "",
        throws: targetPlayer.throws || null,
        bats: targetPlayer.bats || null,
        height: targetPlayer.height ?? null,
        weight: targetPlayer.weight ?? null,
        profileImageUrl: targetPlayer.profileImageUrl || null,
        notes: targetPlayer.notes || null,
        isCaptain: Boolean(
          teamRow.captainId && teamRow.captainId === targetPlayer.id
        ),
        primaryPosition: posAgg
          ? posAgg.primaryPosition
          : targetPlayer.primaryPosition || null,
        subPositions: posAgg ? posAgg.subPositions : [],
        registeredPrimaryPosition: posAgg
          ? posAgg.registeredPrimaryPosition
          : targetPlayer.primaryPosition || null,
        registeredSubPositions: posAgg ? posAgg.registeredSubPositions : [],
        positionCounts: posAgg ? posAgg.positionCounts : [],
        battingOrderCounts: posAgg ? posAgg.battingOrderCounts : [],
        totalPositionGames: posAgg ? posAgg.totalPositionGames : 0,
        positionSource: posAgg ? posAgg.positionSource : "profile",
      },
      sectionsByFilter,
    };

    return c.json(payload);
  } catch (err: unknown) {
    console.error("Failed to fetch player growth report:", err);
    return c.json(
      {
        success: false,
        error:
          err instanceof Error
            ? err.message
            : "個人成長データの取得に失敗しました",
      },
      500
    );
  }
});

export default liffPlayerGrowthRouter;

