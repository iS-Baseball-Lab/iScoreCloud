// filepath: src/lib/liff/player-positions-and-growth.ts
import type { ScorebookSheetStructure } from "@/types/scorebook-v2";
import {
  countConditionPeriodDays,
  getTodayJstDateKey,
  isNonActiveConditionStatus,
  normalizeIsoDateKey,
  resolveEffectivePlayerConditionOnDate,
  sortPlayerConditionPeriods,
  type NonActiveConditionStatus,
  type PlayerConditionPeriod,
  type PlayerConditionStatus,
} from "@/lib/liff/player-condition";
import type { PlayerProfileDetails } from "@/lib/liff/player-profile-schema";

export type CanonicalDefensivePosition =
  | "P"
  | "C"
  | "1B"
  | "2B"
  | "3B"
  | "SS"
  | "LF"
  | "CF"
  | "RF"
  | "DH";

export type GrowthFilterKey = "all" | "official" | "exchange" | "practice";

export interface PlayerPositionCountItem {
  position: CanonicalDefensivePosition;
  games: number;
  sharePercent: number;
}

export interface PlayerBattingOrderCountItem {
  order: number;
  games: number;
}

export interface AggregatedPlayerPositions {
  primaryPosition: string | null;
  subPositions: string[];
  registeredPrimaryPosition: string | null;
  registeredSubPositions: string[];
  positionCounts: PlayerPositionCountItem[];
  battingOrderCounts: PlayerBattingOrderCountItem[];
  totalPositionGames: number;
  positionSource: "match_data" | "profile";
}

export interface GrowthAtBatChip {
  inning: number;
  label: string;
  kind: "hit" | "hr" | "walk" | "sac" | "out" | "error";
  rbi: number;
}

export interface PlayerBattingTrendItem {
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
  hits: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  runs: number;
  walks: number;
  hbp: number;
  strikeouts: number;
  sb: number;
  pitchesSeen: number;
  atBatChips: GrowthAtBatChip[];
  gameAvg: string;
  cumAvg: string;
  cumAvgNum: number;
  cumObp: string;
  cumObpNum: number;
  cumOps: string;
  cumOpsNum: number;
  conditionDuringMatch?: NonActiveConditionStatus | null;
  isReturnMatch?: boolean;
  returnedFromStatus?: NonActiveConditionStatus | null;
}

export interface PlayerMonthlyBattingItem {
  month: string;
  monthLabel: string;
  games: number;
  pa: number;
  ab: number;
  hits: number;
  hr: number;
  rbi: number;
  runs: number;
  walksAndHbp: number;
  strikeouts: number;
  sb: number;
  avg: string;
  avgNum: number;
  obp: string;
  ops: string;
  kRatePercent: number;
  bbRatePercent: number;
  conditionStatuses?: NonActiveConditionStatus[];
}

export interface PlayerBattedDirectionSplit {
  left: number;
  center: number;
  right: number;
  total: number;
  leftPercent: number;
  centerPercent: number;
  rightPercent: number;
}

export interface PlayerRecentFormComparison {
  sampleGames: number;
  recentPa: number;
  recentAb: number;
  recentHits: number;
  recentAvg: string;
  overallAvg: string;
  avgDiffPoints: number;
  avgDiffText: string;
  recentObp: string;
  overallObp: string;
  obpDiffPoints: number;
  obpDiffText: string;
  recentOps: string;
  overallOps: string;
  opsDiffPoints: number;
  opsDiffText: string;
  recentKRatePercent: number;
  overallKRatePercent: number;
  kRateDiffPercent: number;
  multiHitGames: number;
  currentHitStreak: number;
  maxHitStreak: number;
  currentOnBaseStreak: number;
  maxOnBaseStreak: number;
}

export interface PlayerGrowthBattingSummary {
  games: number;
  pa: number;
  ab: number;
  hits: number;
  singles: number;
  doubles: number;
  triples: number;
  hr: number;
  totalBases: number;
  rbi: number;
  runs: number;
  walks: number;
  hbp: number;
  strikeouts: number;
  sb: number;
  sacBunts: number;
  sacFlies: number;
  pitchesSeen: number;
  pitchesPerPa: string | null;
  avg: string;
  obp: string;
  slg: string;
  ops: string;
  bbRatePercent: number;
  kRatePercent: number;
}

export interface PlayerGrowthPitchingSummary {
  games: number;
  outs: number;
  ip: string;
  battersFaced: number;
  pitchesThrown: number;
  strikesThrown: number;
  strikeRatePercent: number | null;
  hitsAllowed: number;
  hrAllowed: number;
  strikeouts: number;
  walks: number;
  hbp: number;
  runs: number;
  earnedRuns: number;
  era: string;
  whip: string;
  kPer7: string;
  kBbRatio: string;
}

export interface PlayerPitchingTrendItem {
  matchId: string;
  date: string;
  opponent: string;
  matchType: "official" | "exchange" | "practice";
  tournamentName: string | null;
  result: "win" | "loss" | "draw";
  myScore: number;
  opponentScore: number;
  outs: number;
  ip: string;
  battersFaced: number;
  pitchesThrown: number;
  strikesThrown: number;
  strikeRatePercent: number | null;
  hitsAllowed: number;
  strikeouts: number;
  walksAndHbp: number;
  runs: number;
  earnedRuns: number;
  cumEra: string;
  cumEraNum: number;
  cumWhip: string;
  cumWhipNum: number;
  conditionDuringMatch?: NonActiveConditionStatus | null;
  isReturnMatch?: boolean;
  returnedFromStatus?: NonActiveConditionStatus | null;
}

export interface PlayerGrowthConditionTimelineItem {
  id: string;
  status: NonActiveConditionStatus;
  startDate: string;
  endDate: string | null;
  days: number;
  isOngoing: boolean;
  isFuture: boolean;
  privateNote: string | null;
  teamMatchesDuringPeriod: number;
  playedMatchesDuringPeriod: number;
  missedMatchesDuringPeriod: number;
  returnMatch: {
    matchId: string;
    date: string;
    opponent: string;
  } | null;
}

export interface PlayerGrowthParticipationSummary {
  totalTeamMatches: number;
  eligibleTeamMatches: number;
  playedMatches: number;
  rehabMissedMatches: number;
  onLeaveMatches: number;
  restrictedPlayedMatches: number;
}

export interface PlayerGrowthSectionPayload {
  matchCount: number;
  battingSummary: PlayerGrowthBattingSummary;
  battingTrend: PlayerBattingTrendItem[];
  monthlyBatting: PlayerMonthlyBattingItem[];
  battedDirection: PlayerBattedDirectionSplit;
  recentForm: PlayerRecentFormComparison;
  pitchingSummary: PlayerGrowthPitchingSummary | null;
  pitchingTrend: PlayerPitchingTrendItem[];
  conditionTimeline?: PlayerGrowthConditionTimelineItem[];
  participationSummary?: PlayerGrowthParticipationSummary;
}

export interface PlayerGrowthRosterItem {
  id: string;
  name: string;
  nameKana: string | null;
  uniformNumber: string;
  primaryPosition: string | null;
  subPositions: string[];
  positionSource: "match_data" | "profile";
  profileImageUrl: string | null;
  actionImageUrl?: string | null;
  conditionStatus?: PlayerConditionStatus;
  isCaptain: boolean;
}

export interface PlayerGrowthResponse {
  success: boolean;
  isDemo?: boolean;
  error?: string;
  team?: {
    id: string;
    name: string;
    orgName: string;
    teamName: string;
    logoImageUrl?: string | null;
    year: number;
  };
  roster?: PlayerGrowthRosterItem[];
  player?: {
    id: string;
    name: string;
    nameKana: string | null;
    uniformNumber: string;
    nickname?: string | null;
    throws: string | null;
    bats: string | null;
    height: number | null;
    weight: number | null;
    profileImageUrl: string | null;
    notes: string | null;
    isCaptain: boolean;
    conditionStatus?: PlayerConditionStatus;
    conditionNote?: string | null;
    conditionPeriods?: PlayerConditionPeriod[];
    activeConditionPeriod?: PlayerConditionPeriod | null;
    profileDetails?: PlayerProfileDetails;
    canEditProfile?: boolean;
    canManagePlayers?: boolean;
    primaryPosition: string | null;
    subPositions: string[];
    registeredPrimaryPosition: string | null;
    registeredSubPositions: string[];
    positionCounts: PlayerPositionCountItem[];
    battingOrderCounts: PlayerBattingOrderCountItem[];
    totalPositionGames: number;
    positionSource: "match_data" | "profile";
  };
  sectionsByFilter?: Record<GrowthFilterKey, PlayerGrowthSectionPayload>;
}

const POSITION_SPECTRUM_PRIORITY: Record<CanonicalDefensivePosition, number> = {
  P: 1,
  C: 2,
  SS: 3,
  "2B": 4,
  "3B": 5,
  "1B": 6,
  CF: 7,
  LF: 8,
  RF: 9,
  DH: 10,
};

function toHalfWidthAscii(input: string): string {
  return input.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  );
}

/**
 * 単一の守備位置トークンを標準コード（P/C/1B/2B/3B/SS/LF/CF/RF/DH）に正規化する。
 * 代打(PH)・代走(PR)・臨時代走(TR)などの非守備コードは null を返す。
 */
export function normalizeSingleDefensivePosition(
  raw: string | null | undefined
): CanonicalDefensivePosition | null {
  if (!raw) return null;
  const cleaned = toHalfWidthAscii(raw)
    .trim()
    .replace(/[()（）[\]【】]/g, "")
    .toUpperCase();

  if (!cleaned || cleaned === "-") return null;

  // 非守備の交代記号は除外
  if (
    cleaned === "PH" ||
    cleaned === "PR" ||
    cleaned === "TR" ||
    cleaned === "R" ||
    cleaned === "H" ||
    cleaned === "代打" ||
    cleaned === "代走" ||
    cleaned === "臨代" ||
    cleaned === "打" ||
    cleaned === "走" ||
    cleaned === "EH" ||
    cleaned === "ベンチ" ||
    cleaned === "BENCH"
  ) {
    return null;
  }

  if (
    cleaned === "1" ||
    cleaned === "P" ||
    cleaned === "投" ||
    cleaned === "投手" ||
    cleaned === "ピッチャー"
  ) {
    return "P";
  }
  if (
    cleaned === "2" ||
    cleaned === "C" ||
    cleaned === "捕" ||
    cleaned === "捕手" ||
    cleaned === "キャッチャー"
  ) {
    return "C";
  }
  if (
    cleaned === "3" ||
    cleaned === "1B" ||
    cleaned === "一" ||
    cleaned === "一塁" ||
    cleaned === "一塁手" ||
    cleaned === "ファースト"
  ) {
    return "1B";
  }
  if (
    cleaned === "4" ||
    cleaned === "2B" ||
    cleaned === "二" ||
    cleaned === "二塁" ||
    cleaned === "二塁手" ||
    cleaned === "セカンド"
  ) {
    return "2B";
  }
  if (
    cleaned === "5" ||
    cleaned === "3B" ||
    cleaned === "三" ||
    cleaned === "三塁" ||
    cleaned === "三塁手" ||
    cleaned === "サード"
  ) {
    return "3B";
  }
  if (
    cleaned === "6" ||
    cleaned === "SS" ||
    cleaned === "遊" ||
    cleaned === "遊撃" ||
    cleaned === "遊撃手" ||
    cleaned === "ショート"
  ) {
    return "SS";
  }
  if (
    cleaned === "7" ||
    cleaned === "LF" ||
    cleaned === "左" ||
    cleaned === "左翼" ||
    cleaned === "左翼手" ||
    cleaned === "レフト"
  ) {
    return "LF";
  }
  if (
    cleaned === "8" ||
    cleaned === "CF" ||
    cleaned === "中" ||
    cleaned === "中堅" ||
    cleaned === "中堅手" ||
    cleaned === "センター"
  ) {
    return "CF";
  }
  if (
    cleaned === "9" ||
    cleaned === "RF" ||
    cleaned === "右" ||
    cleaned === "右翼" ||
    cleaned === "右翼手" ||
    cleaned === "ライト"
  ) {
    return "RF";
  }
  if (
    cleaned === "D" ||
    cleaned === "DH" ||
    cleaned === "DP" ||
    cleaned === "指" ||
    cleaned === "指名" ||
    cleaned === "指名打者"
  ) {
    return "DH";
  }

  return null;
}

/**
 * 「6→1」「中・投」「CF/P」のような複数ポジション併記テキストからも漏れなく正規化コードを抽出する
 */
export function extractDefensivePositionsFromRaw(
  raw: string | null | undefined
): CanonicalDefensivePosition[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const direct = normalizeSingleDefensivePosition(trimmed);
  if (direct) return [direct];

  const tokens = trimmed.split(/(?:->|→|⇒|\/|・|,|、|\s)+/).filter(Boolean);
  const out: CanonicalDefensivePosition[] = [];
  for (const tok of tokens) {
    const norm = normalizeSingleDefensivePosition(tok);
    if (norm && !out.includes(norm)) {
      out.push(norm);
    }
  }
  return out;
}

export function parseProfileSubPositions(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((v): v is string => typeof v === "string" && v.trim() !== "");
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (v): v is string => typeof v === "string" && v.trim() !== ""
        );
      }
    } catch {
      return raw
        .split(/[,、/・\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

export interface RosterPlayerProfileForPos {
  id: string;
  name: string;
  uniformNumber: string | null;
  primaryPosition: string | null;
  subPositions: unknown;
}

interface RawMatchRowForPos {
  id: string;
  status: string | null;
  battingOrder: string | null;
  myLineup: string | null;
}

interface RawMatchLineupRowForPos {
  matchId: string;
  playerId: string;
  battingOrder: number;
  position: string;
  isStarting: number | boolean;
}

interface RawSnapshotRowForPos {
  matchId: string;
  topStructureJson: string | null;
  bottomStructureJson: string | null;
}

interface RawAtBatPresenceRow {
  matchId: string;
  pitcherId: string | null;
  batterId: string | null;
  isTop: number | boolean;
}

interface ParsedMyLineupItem {
  order?: number;
  battingOrder?: number;
  playerId?: string | null;
  name?: string;
  uniformNumber?: string;
  position?: string;
}

export function normalizePlayerNameKey(raw: string | null | undefined): string {
  return (raw || "").replace(/[\s　]+/g, "").trim();
}

function cleanUniformKey(raw: string | null | undefined): string {
  return (raw || "").trim().replace(/^#/, "");
}

/**
 * チームの実戦試合データ（スナップショット構造・スタメンJSON・match_lineups・投手打席履歴）から
 * 各選手の守備位置出場試合数・打順出場試合数を一括集計し、
 * 最も出場が多い守備位置を primaryPosition（メイン）、それ以外を subPositions（サブ）として返す。
 */
export async function aggregateTeamPlayerPositions(
  d1: D1Database,
  teamId: string,
  rosterPlayers: RosterPlayerProfileForPos[]
): Promise<{
  byPlayerId: Map<string, AggregatedPlayerPositions>;
  perMatchPlayerPositions: Map<string, Map<string, CanonicalDefensivePosition[]>>;
  perMatchPlayerOrders: Map<string, Map<string, number[]>>;
}> {
  const byPlayerId = new Map<string, AggregatedPlayerPositions>();
  const perMatchPlayerPositions = new Map<
    string,
    Map<string, CanonicalDefensivePosition[]>
  >();
  const perMatchPlayerOrders = new Map<string, Map<string, number[]>>();

  const rosterIdSet = new Set<string>();
  const playerIdByNameAndNum = new Map<string, string>();
  const playerIdByCleanName = new Map<string, string>();

  for (const rp of rosterPlayers) {
    rosterIdSet.add(rp.id);
    const cn = normalizePlayerNameKey(rp.name);
    const un = cleanUniformKey(rp.uniformNumber);
    if (cn && un) {
      playerIdByNameAndNum.set(`${cn}#${un}`, rp.id);
    }
    if (cn && !playerIdByCleanName.has(cn)) {
      playerIdByCleanName.set(cn, rp.id);
    }
  }

  const resolveRosterPlayerId = (
    explicitId: string | null | undefined,
    rawName?: string | null,
    rawUniform?: string | null
  ): string | null => {
    if (explicitId && rosterIdSet.has(explicitId)) return explicitId;
    const cn = normalizePlayerNameKey(rawName);
    if (!cn) return null;
    const un = cleanUniformKey(rawUniform);
    if (un) {
      const exact = playerIdByNameAndNum.get(`${cn}#${un}`);
      if (exact) return exact;
    }
    return playerIdByCleanName.get(cn) || null;
  };

  let matchRows: RawMatchRowForPos[] = [];
  try {
    const res = await d1
      .prepare(
        `SELECT id, status, batting_order AS battingOrder, my_lineup AS myLineup
         FROM matches
         WHERE team_id = ?`
      )
      .bind(teamId)
      .all<RawMatchRowForPos>();
    matchRows = res.results || [];
  } catch (err) {
    console.warn("aggregateTeamPlayerPositions: failed to load matches:", err);
  }

  const allMatchIds = matchRows.map((m) => m.id);
  const lineupByMatch = new Map<string, RawMatchLineupRowForPos[]>();
  const snapshotByMatch = new Map<string, RawSnapshotRowForPos>();
  const matchesWithAtBats = new Set<string>();
  const pitchersByMatch = new Map<string, Set<string>>();

  const matchMetaById = new Map<string, RawMatchRowForPos>();
  for (const m of matchRows) {
    matchMetaById.set(m.id, m);
  }

  if (allMatchIds.length > 0) {
    const chunkSize = 50;
    for (let i = 0; i < allMatchIds.length; i += chunkSize) {
      const slice = allMatchIds.slice(i, i + chunkSize);
      const placeholders = slice.map(() => "?").join(",");

      try {
        const [luRes, snapRes, abRes] = await Promise.all([
          d1
            .prepare(
              `SELECT match_id AS matchId, player_id AS playerId, batting_order AS battingOrder, position, is_starting AS isStarting
               FROM match_lineups
               WHERE match_id IN (${placeholders})`
            )
            .bind(...slice)
            .all<RawMatchLineupRowForPos>(),
          d1
            .prepare(
              `SELECT match_id AS matchId, top_structure_json AS topStructureJson, bottom_structure_json AS bottomStructureJson
               FROM match_scorebook_snapshots
               WHERE match_id IN (${placeholders})`
            )
            .bind(...slice)
            .all<RawSnapshotRowForPos>(),
          d1
            .prepare(
              `SELECT DISTINCT match_id AS matchId, pitcher_id AS pitcherId, batter_id AS batterId, is_top AS isTop
               FROM at_bats
               WHERE match_id IN (${placeholders})`
            )
            .bind(...slice)
            .all<RawAtBatPresenceRow>(),
        ]);

        for (const lu of luRes.results || []) {
          const list = lineupByMatch.get(lu.matchId) || [];
          list.push(lu);
          lineupByMatch.set(lu.matchId, list);
        }

        for (const sn of snapRes.results || []) {
          snapshotByMatch.set(sn.matchId, sn);
        }

        for (const ab of abRes.results || []) {
          matchesWithAtBats.add(ab.matchId);
          const mRow = matchMetaById.get(ab.matchId);
          const isMyTop = mRow?.battingOrder === "first";
          const abIsTop = ab.isTop === true || ab.isTop === 1;
          // 自チーム守備イニングの pitcher_id を投手出場として確定記録
          if (abIsTop !== isMyTop && ab.pitcherId && rosterIdSet.has(ab.pitcherId)) {
            const pSet = pitchersByMatch.get(ab.matchId) || new Set<string>();
            pSet.add(ab.pitcherId);
            pitchersByMatch.set(ab.matchId, pSet);
          }
        }
      } catch (chunkErr) {
        console.warn("aggregateTeamPlayerPositions chunk query warning:", chunkErr);
      }
    }
  }

  // 選手ごとの「ポジション -> 出場試合IDセット」「打順 -> 出場試合IDセット」
  const posMatchSetsByPlayer = new Map<
    string,
    Map<CanonicalDefensivePosition, Set<string>>
  >();
  const posAnyMatchSetByPlayer = new Map<string, Set<string>>();
  const orderMatchSetsByPlayer = new Map<string, Map<number, Set<string>>>();

  const recordPosForMatch = (
    matchId: string,
    playerId: string,
    pos: CanonicalDefensivePosition
  ) => {
    let pMap = posMatchSetsByPlayer.get(playerId);
    if (!pMap) {
      pMap = new Map<CanonicalDefensivePosition, Set<string>>();
      posMatchSetsByPlayer.set(playerId, pMap);
    }
    let mSet = pMap.get(pos);
    if (!mSet) {
      mSet = new Set<string>();
      pMap.set(pos, mSet);
    }
    mSet.add(matchId);

    let anySet = posAnyMatchSetByPlayer.get(playerId);
    if (!anySet) {
      anySet = new Set<string>();
      posAnyMatchSetByPlayer.set(playerId, anySet);
    }
    anySet.add(matchId);

    let perMatchMap = perMatchPlayerPositions.get(matchId);
    if (!perMatchMap) {
      perMatchMap = new Map<string, CanonicalDefensivePosition[]>();
      perMatchPlayerPositions.set(matchId, perMatchMap);
    }
    const arr = perMatchMap.get(playerId) || [];
    if (!arr.includes(pos)) {
      arr.push(pos);
      perMatchMap.set(playerId, arr);
    }
  };

  const recordOrderForMatch = (
    matchId: string,
    playerId: string,
    order: number
  ) => {
    if (!Number.isFinite(order) || order < 1 || order > 15) return;
    let oMap = orderMatchSetsByPlayer.get(playerId);
    if (!oMap) {
      oMap = new Map<number, Set<string>>();
      orderMatchSetsByPlayer.set(playerId, oMap);
    }
    let mSet = oMap.get(order);
    if (!mSet) {
      mSet = new Set<string>();
      oMap.set(order, mSet);
    }
    mSet.add(matchId);

    let perMatchOrders = perMatchPlayerOrders.get(matchId);
    if (!perMatchOrders) {
      perMatchOrders = new Map<string, number[]>();
      perMatchPlayerOrders.set(matchId, perMatchOrders);
    }
    const arr = perMatchOrders.get(playerId) || [];
    if (!arr.includes(order)) {
      arr.push(order);
      perMatchOrders.set(playerId, arr);
    }
  };

  for (const m of matchRows) {
    const isPlayed = m.status === "finished" || matchesWithAtBats.has(m.id);
    if (!isPlayed) continue;

    const isMyTop = m.battingOrder === "first";
    const snap = snapshotByMatch.get(m.id);
    let parsedMyStruct: ScorebookSheetStructure | null = null;
    let parsedOppStruct: ScorebookSheetStructure | null = null;

    if (snap) {
      const myJson = isMyTop ? snap.topStructureJson : snap.bottomStructureJson;
      const oppJson = isMyTop ? snap.bottomStructureJson : snap.topStructureJson;
      if (myJson) {
        try {
          parsedMyStruct = JSON.parse(myJson) as ScorebookSheetStructure;
        } catch {}
      }
      if (oppJson) {
        try {
          parsedOppStruct = JSON.parse(oppJson) as ScorebookSheetStructure;
        } catch {}
      }
    }

    // 1. スナップショットの自チーム打順・途中交代構造（subTypeが明確なため最優先）
    if (parsedMyStruct && Array.isArray(parsedMyStruct.batters)) {
      for (const slot of parsedMyStruct.batters) {
        const pid = resolveRosterPlayerId(
          slot.playerId,
          slot.name,
          slot.uniformNumber
        );
        if (pid) {
          recordOrderForMatch(m.id, pid, Number(slot.battingOrder) || 0);
          for (const pos of extractDefensivePositionsFromRaw(slot.position)) {
            recordPosForMatch(m.id, pid, pos);
          }
        }
        for (const sub of slot.substitutions || []) {
          const subPid = resolveRosterPlayerId(
            sub.playerId,
            sub.name,
            sub.uniformNumber
          );
          if (subPid) {
            recordOrderForMatch(m.id, subPid, Number(slot.battingOrder) || 0);
            for (const pos of extractDefensivePositionsFromRaw(sub.position)) {
              recordPosForMatch(m.id, subPid, pos);
            }
          }
        }
      }
    } else {
      // 2. スナップショットが無い試合は matches.myLineup と match_lineups から集計
      if (m.myLineup) {
        try {
          const parsedLineup = JSON.parse(m.myLineup) as unknown;
          if (Array.isArray(parsedLineup)) {
            for (const rawSlot of parsedLineup as ParsedMyLineupItem[]) {
              const pid = resolveRosterPlayerId(
                rawSlot.playerId,
                rawSlot.name,
                rawSlot.uniformNumber
              );
              if (!pid) continue;
              const ord = Number(rawSlot.order ?? rawSlot.battingOrder) || 0;
              if (ord > 0) recordOrderForMatch(m.id, pid, ord);
              for (const pos of extractDefensivePositionsFromRaw(rawSlot.position)) {
                recordPosForMatch(m.id, pid, pos);
              }
            }
          }
        } catch {}
      }

      const matchLus = lineupByMatch.get(m.id) || [];
      const matchPitchers = pitchersByMatch.get(m.id);
      for (const lu of matchLus) {
        if (!rosterIdSet.has(lu.playerId)) continue;
        if (lu.battingOrder > 0) {
          recordOrderForMatch(m.id, lu.playerId, lu.battingOrder);
        }
        const isStarter = lu.isStarting === true || lu.isStarting === 1;
        const rawPosTrim = (lu.position || "").trim().toUpperCase();
        // 旧データで途中出場(isStarting=false)かつ position='P' は代打(PH)として保存されていたため、実際に登板していない限り除外
        if (!isStarter && rawPosTrim === "P" && !matchPitchers?.has(lu.playerId)) {
          continue;
        }
        for (const pos of extractDefensivePositionsFromRaw(lu.position)) {
          recordPosForMatch(m.id, lu.playerId, pos);
        }
      }
    }

    // 3. 相手攻撃シートの投手一覧（oppStructure.pitchers）から自チーム登板投手を補完
    if (parsedOppStruct && Array.isArray(parsedOppStruct.pitchers)) {
      for (const stint of parsedOppStruct.pitchers) {
        const pid = resolveRosterPlayerId(
          stint.playerId,
          stint.name,
          stint.uniformNumber
        );
        if (pid) {
          recordPosForMatch(m.id, pid, "P");
        }
      }
    }

    // 4. at_bats.pitcher_id から実際の登板投手を確実に反映
    const matchPitchers = pitchersByMatch.get(m.id);
    if (matchPitchers) {
      for (const pid of matchPitchers) {
        recordPosForMatch(m.id, pid, "P");
      }
    }
  }

  // 各選手の最終メイン・サブ守備位置を決定
  for (const rp of rosterPlayers) {
    const regPrimaryNorm = normalizeSingleDefensivePosition(rp.primaryPosition);
    const rawSubs = parseProfileSubPositions(rp.subPositions);
    const regSubsNorm: string[] = [];
    for (const s of rawSubs) {
      const n = normalizeSingleDefensivePosition(s) || s.trim();
      if (n && n !== (regPrimaryNorm || rp.primaryPosition) && !regSubsNorm.includes(n)) {
        regSubsNorm.push(n);
      }
    }

    const pMap = posMatchSetsByPlayer.get(rp.id);
    const totalPositionGames = posAnyMatchSetByPlayer.get(rp.id)?.size || 0;

    const orderMap = orderMatchSetsByPlayer.get(rp.id);
    const battingOrderCounts: PlayerBattingOrderCountItem[] = orderMap
      ? Array.from(orderMap.entries())
          .map(([order, set]) => ({ order, games: set.size }))
          .filter((x) => x.games > 0)
          .sort((a, b) => b.games - a.games || a.order - b.order)
      : [];

    if (pMap && pMap.size > 0 && totalPositionGames > 0) {
      const sortedEntries = Array.from(pMap.entries())
        .map(([position, set]) => ({
          position,
          games: set.size,
          sharePercent: Math.round((set.size / totalPositionGames) * 100),
        }))
        .filter((x) => x.games > 0)
        .sort((a, b) => {
          if (b.games !== a.games) return b.games - a.games;
          // 同数の場合はプロフィール登録メイン守備位置を優先
          if (regPrimaryNorm) {
            if (a.position === regPrimaryNorm && b.position !== regPrimaryNorm) return -1;
            if (b.position === regPrimaryNorm && a.position !== regPrimaryNorm) return 1;
          }
          // 次にプロフィール登録サブ守備位置を優先
          const aInSub = regSubsNorm.includes(a.position);
          const bInSub = regSubsNorm.includes(b.position);
          if (aInSub && !bInSub) return -1;
          if (bInSub && !aInSub) return 1;
          // 最後に守備負担スペクトラム順
          return (
            POSITION_SPECTRUM_PRIORITY[a.position] -
            POSITION_SPECTRUM_PRIORITY[b.position]
          );
        });

      byPlayerId.set(rp.id, {
        primaryPosition: sortedEntries[0].position,
        subPositions: sortedEntries.slice(1).map((e) => e.position),
        registeredPrimaryPosition: regPrimaryNorm || rp.primaryPosition || null,
        registeredSubPositions: regSubsNorm,
        positionCounts: sortedEntries,
        battingOrderCounts,
        totalPositionGames,
        positionSource: "match_data",
      });
    } else {
      byPlayerId.set(rp.id, {
        primaryPosition: regPrimaryNorm || rp.primaryPosition || null,
        subPositions: regSubsNorm,
        registeredPrimaryPosition: regPrimaryNorm || rp.primaryPosition || null,
        registeredSubPositions: regSubsNorm,
        positionCounts: [],
        battingOrderCounts,
        totalPositionGames: 0,
        positionSource: "profile",
      });
    }
  }

  return {
    byPlayerId,
    perMatchPlayerPositions,
    perMatchPlayerOrders,
  };
}

/**
 * 打球方向（battedDirection / resultLabel / playLog description）から
 * レフト方向(left)・センター方向(center)・ライト方向(right)を分類する
 */
export function classifyBattedBallDirection(
  battedDirection: string | null | undefined,
  resultLabel: string | null | undefined,
  rawResultCode: string | null | undefined,
  playLogDesc?: string | null
): "left" | "center" | "right" | null {
  const dir = toHalfWidthAscii(battedDirection || "").trim();
  const lbl = toHalfWidthAscii(resultLabel || "").trim();
  const res = toHalfWidthAscii(rawResultCode || "").trim();

  // 三振・四死球・妨害はインプレー打球ではないため除外
  const nonBattedCodes = new Set([
    "walk",
    "intentional_walk",
    "hit_by_pitch",
    "interference",
    "strikeout",
    "dropped_third_strike",
    "dropped_third_strike_out",
    "other",
    "BB",
    "HBP",
    "K",
    "SO",
  ]);
  if (nonBattedCodes.has(res)) return null;
  if (
    lbl.includes("三振") ||
    lbl.includes("振逃") ||
    lbl.includes("四球") ||
    lbl.includes("死球") ||
    lbl.includes("敬遠") ||
    lbl.includes("妨害")
  ) {
    return null;
  }

  // 1. 明示的な方向文字列（左中間・右中間はセンター寄りまたは広角判定、左/三/遊=左、中/投/捕=中、右/一/二=右）
  const checkText = `${dir} ${lbl}`;
  if (checkText.includes("左中間") || checkText.includes("右中間") || checkText.includes("二遊")) {
    return "center";
  }
  if (
    checkText.includes("左") ||
    checkText.includes("レフト") ||
    checkText.includes("三遊") ||
    checkText.includes("三塁線")
  ) {
    return "left";
  }
  if (checkText.includes("中") || checkText.includes("センター")) {
    return "center";
  }
  if (
    checkText.includes("右") ||
    checkText.includes("ライト") ||
    checkText.includes("一二") ||
    checkText.includes("一塁線")
  ) {
    return "right";
  }

  // 2. 守備番号の先頭数字（5=三, 6=遊, 7=左 => left / 1=投, 2=捕, 8=中 => center / 3=一, 4=二, 9=右 => right）
  const numSource = dir || res;
  const firstDigitMatch = numSource.match(/^([1-9])/);
  if (firstDigitMatch) {
    const d = firstDigitMatch[1];
    if (d === "5" || d === "6" || d === "7") return "left";
    if (d === "1" || d === "2" || d === "8") return "center";
    if (d === "3" || d === "4" || d === "9") return "right";
  }

  // 3. 日本語守備位置頭文字（遊ゴロ、二飛、一ゴロ、三直、投ゴロ 等）
  if (/^[三遊]/.test(lbl)) return "left";
  if (/^[投捕]/.test(lbl)) return "center";
  if (/^[一二]/.test(lbl)) return "right";

  // 4. プレイログの括弧内打球情報 `(打球:7)` 等からのフォールバック
  if (playLogDesc) {
    const logDir = playLogDesc.match(/打球[:：]\s*([1-9左中右])/);
    if (logDir) {
      const token = logDir[1];
      if (token === "5" || token === "6" || token === "7" || token === "左") return "left";
      if (token === "1" || token === "2" || token === "8" || token === "中") return "center";
      if (token === "3" || token === "4" || token === "9" || token === "右") return "right";
    }
  }

  return null;
}

export function formatAvgRate(num: number): string {
  if (!Number.isFinite(num) || num <= 0) return ".000";
  if (num >= 1) return num.toFixed(3);
  return num.toFixed(3).replace(/^0/, "");
}

export function formatInningsPitched(outs: number): string {
  const full = Math.floor(outs / 3);
  const rem = outs % 3;
  return `${full}.${rem}`;
}

export interface TeamMatchBriefForGrowth {
  id: string;
  date: string;
  opponent: string;
  matchType: "official" | "exchange" | "practice";
}

function enumerateYearMonthsBetween(startYm: string, endYm: string): string[] {
  const sm = startYm.match(/^(\d{4})-(\d{2})$/);
  const em = endYm.match(/^(\d{4})-(\d{2})$/);
  if (!sm || !em) return [];
  let y = Number.parseInt(sm[1], 10);
  let m = Number.parseInt(sm[2], 10);
  const ey = Number.parseInt(em[1], 10);
  const emNum = Number.parseInt(em[2], 10);
  const list: string[] = [];
  let guard = 0;
  while ((y < ey || (y === ey && m <= emNum)) && guard < 48) {
    list.push(`${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    guard += 1;
  }
  return list;
}

function formatMonthLabelForGrowth(yyyyMm: string): string {
  const m = yyyyMm.match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return yyyyMm;
  return `${m[1]}年${Number(m[2])}月`;
}

/**
 * 個人成長レポートのセクションデータに対して、選手の休部・故障・制限期間（`conditionPeriods`）を反映する。
 * - 各出場試合の `conditionDuringMatch`（一部制限中の出場等）および `isReturnMatch`（故障・休部明け復帰初戦）を付与
 * - 月別推移（`monthlyBatting`）に期間バッジおよび故障・休部による0試合月を補完
 * - 期間ごとのチーム見送り試合数・復帰戦を含む `conditionTimeline` ＆ `participationSummary` を算出
 */
export function enrichSectionWithConditionPeriods(
  section: PlayerGrowthSectionPayload,
  params: {
    conditionPeriods: readonly PlayerConditionPeriod[];
    teamMatches: readonly TeamMatchBriefForGrowth[];
    joinedDateKey?: string | null;
    todayKey?: string;
  }
): PlayerGrowthSectionPayload {
  const todayKey = normalizeIsoDateKey(params.todayKey) || getTodayJstDateKey();
  const sortedPeriods = sortPlayerConditionPeriods(
    (params.conditionPeriods || []).filter((p) => isNonActiveConditionStatus(p.status))
  );

  const playedMatchIds = new Set<string>();
  const playedMatchesChrono: Array<{
    matchId: string;
    date: string;
    dateKey: string;
    opponent: string;
  }> = [];

  for (const bt of section.battingTrend) {
    playedMatchIds.add(bt.matchId);
    const dk = normalizeIsoDateKey(bt.date);
    if (dk) {
      playedMatchesChrono.push({
        matchId: bt.matchId,
        date: bt.date,
        dateKey: dk,
        opponent: bt.opponent,
      });
    }
  }
  for (const pt of section.pitchingTrend) {
    if (!playedMatchIds.has(pt.matchId)) {
      playedMatchIds.add(pt.matchId);
      const dk = normalizeIsoDateKey(pt.date);
      if (dk) {
        playedMatchesChrono.push({
          matchId: pt.matchId,
          date: pt.date,
          dateKey: dk,
          opponent: pt.opponent,
        });
      }
    }
  }
  playedMatchesChrono.sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  if (sortedPeriods.length === 0) {
    const joinedKey = normalizeIsoDateKey(params.joinedDateKey);
    const eligibleCount = params.teamMatches.filter((tm) => {
      const dk = normalizeIsoDateKey(tm.date);
      if (!dk) return true;
      return !joinedKey || dk >= joinedKey;
    }).length;

    return {
      ...section,
      conditionTimeline: [],
      participationSummary: {
        totalTeamMatches: params.teamMatches.length,
        eligibleTeamMatches: eligibleCount,
        playedMatches: playedMatchIds.size,
        rehabMissedMatches: 0,
        onLeaveMatches: 0,
        restrictedPlayedMatches: 0,
      },
    };
  }

  // 1. 復帰初戦（rehab / on_leave 終了後の最初の出場試合）を特定
  const returnMatchMap = new Map<string, NonActiveConditionStatus>();
  const conditionTimeline: PlayerGrowthConditionTimelineItem[] = sortedPeriods.map((period) => {
    const { days, isOngoing, isFuture } = countConditionPeriodDays(
      period.startDate,
      period.endDate,
      todayKey
    );
    const matchesInPeriod = params.teamMatches.filter((tm) => {
      const dk = normalizeIsoDateKey(tm.date);
      if (!dk) return false;
      if (dk < period.startDate) return false;
      if (period.endDate && dk > period.endDate) return false;
      return true;
    });
    const playedInPeriod = matchesInPeriod.filter((tm) => playedMatchIds.has(tm.id)).length;
    const missedInPeriod = Math.max(0, matchesInPeriod.length - playedInPeriod);

    let returnMatch: PlayerGrowthConditionTimelineItem["returnMatch"] = null;
    if (
      (period.status === "rehab" || period.status === "on_leave") &&
      period.endDate &&
      period.endDate <= todayKey
    ) {
      const firstAfter = playedMatchesChrono.find((pm) => pm.dateKey > period.endDate!);
      if (firstAfter) {
        returnMatch = {
          matchId: firstAfter.matchId,
          date: firstAfter.date,
          opponent: firstAfter.opponent,
        };
        if (!returnMatchMap.has(firstAfter.matchId)) {
          returnMatchMap.set(firstAfter.matchId, period.status);
        }
      }
    }

    return {
      id: period.id,
      status: period.status,
      startDate: period.startDate,
      endDate: period.endDate ?? null,
      days,
      isOngoing,
      isFuture,
      privateNote: period.privateNote || null,
      teamMatchesDuringPeriod: matchesInPeriod.length,
      playedMatchesDuringPeriod: playedInPeriod,
      missedMatchesDuringPeriod: missedInPeriod,
      returnMatch,
    };
  });

  // 2. 打撃・投手トレンドへの期間アノテーション付与
  let restrictedPlayedMatchesSet = new Set<string>();

  const nextBattingTrend: PlayerBattingTrendItem[] = section.battingTrend.map((bt) => {
    const dk = normalizeIsoDateKey(bt.date);
    const eff = dk
      ? resolveEffectivePlayerConditionOnDate({
          conditionPeriods: sortedPeriods,
          dateKey: dk,
          todayKey,
        })
      : { status: "active" as const };
    const condDuring = isNonActiveConditionStatus(eff.status) ? eff.status : null;
    if (condDuring === "restricted") {
      restrictedPlayedMatchesSet.add(bt.matchId);
    }
    const retFrom = returnMatchMap.get(bt.matchId) || null;
    return {
      ...bt,
      conditionDuringMatch: condDuring,
      isReturnMatch: Boolean(retFrom),
      returnedFromStatus: retFrom,
    };
  });

  const nextPitchingTrend: PlayerPitchingTrendItem[] = section.pitchingTrend.map((pt) => {
    const dk = normalizeIsoDateKey(pt.date);
    const eff = dk
      ? resolveEffectivePlayerConditionOnDate({
          conditionPeriods: sortedPeriods,
          dateKey: dk,
          todayKey,
        })
      : { status: "active" as const };
    const condDuring = isNonActiveConditionStatus(eff.status) ? eff.status : null;
    if (condDuring === "restricted") {
      restrictedPlayedMatchesSet.add(pt.matchId);
    }
    const retFrom = returnMatchMap.get(pt.matchId) || null;
    return {
      ...pt,
      conditionDuringMatch: condDuring,
      isReturnMatch: Boolean(retFrom),
      returnedFromStatus: retFrom,
    };
  });

  // 3. 月別ステップアップ推移への期間バッジ＆休養0試合月の補完
  const existingMonthMap = new Map<string, PlayerMonthlyBattingItem>();
  for (const mb of section.monthlyBatting) {
    existingMonthMap.set(mb.month, { ...mb });
  }

  const allSeasonMonths = new Set<string>(existingMonthMap.keys());
  const firstPlayedMonth =
    section.monthlyBatting.length > 0 ? section.monthlyBatting[0].month : null;
  const todayYm = todayKey.slice(0, 7);

  for (const period of sortedPeriods) {
    if (period.startDate > todayKey) continue;
    const pStartYm = period.startDate.slice(0, 7);
    const rawEndKey = period.endDate && period.endDate < todayKey ? period.endDate : todayKey;
    const pEndYm = rawEndKey.slice(0, 7);
    for (const ym of enumerateYearMonthsBetween(pStartYm, pEndYm)) {
      if (!firstPlayedMonth || ym >= firstPlayedMonth || existingMonthMap.size === 0) {
        if (ym <= todayYm) {
          allSeasonMonths.add(ym);
        }
      }
    }
  }

  const nextMonthlyBatting: PlayerMonthlyBattingItem[] = Array.from(allSeasonMonths)
    .sort((a, b) => a.localeCompare(b))
    .map((ym) => {
      const monthStart = `${ym}-01`;
      const monthEnd = `${ym}-31`;
      const overlappingStatuses = Array.from(
        new Set<NonActiveConditionStatus>(
          sortedPeriods
            .filter((p) => {
              const pEnd = p.endDate || "9999-12-31";
              return p.startDate <= monthEnd && pEnd >= monthStart;
            })
            .map((p) => p.status)
        )
      );
      const base = existingMonthMap.get(ym);
      if (base) {
        return {
          ...base,
          conditionStatuses: overlappingStatuses.length > 0 ? overlappingStatuses : undefined,
        };
      }
      return {
        month: ym,
        monthLabel: formatMonthLabelForGrowth(ym),
        games: 0,
        pa: 0,
        ab: 0,
        hits: 0,
        hr: 0,
        rbi: 0,
        runs: 0,
        walksAndHbp: 0,
        strikeouts: 0,
        sb: 0,
        avg: "---",
        avgNum: 0,
        obp: "---",
        ops: "---",
        kRatePercent: 0,
        bbRatePercent: 0,
        conditionStatuses: overlappingStatuses.length > 0 ? overlappingStatuses : undefined,
      };
    })
    .filter((mb) => mb.games > 0 || (mb.conditionStatuses && mb.conditionStatuses.length > 0));

  // 4. 在籍・休養・出場サマリー算出
  const joinedKey = normalizeIsoDateKey(params.joinedDateKey);
  let eligibleTeamMatches = 0;
  let rehabMissedMatches = 0;
  let onLeaveMatches = 0;

  for (const tm of params.teamMatches) {
    const dk = normalizeIsoDateKey(tm.date);
    if (dk && joinedKey && dk < joinedKey) {
      continue;
    }
    const eff = dk
      ? resolveEffectivePlayerConditionOnDate({
          conditionPeriods: sortedPeriods,
          dateKey: dk,
          todayKey,
        })
      : { status: "active" as const };
    const played = playedMatchIds.has(tm.id);

    if (eff.status === "on_leave" && !played) {
      onLeaveMatches += 1;
      continue;
    }

    eligibleTeamMatches += 1;
    if (eff.status === "rehab" && !played) {
      rehabMissedMatches += 1;
    }
  }

  return {
    ...section,
    battingTrend: nextBattingTrend,
    pitchingTrend: nextPitchingTrend,
    monthlyBatting: nextMonthlyBatting,
    conditionTimeline,
    participationSummary: {
      totalTeamMatches: params.teamMatches.length,
      eligibleTeamMatches,
      playedMatches: playedMatchIds.size,
      rehabMissedMatches,
      onLeaveMatches,
      restrictedPlayedMatches: restrictedPlayedMatchesSet.size,
    },
  };
}

