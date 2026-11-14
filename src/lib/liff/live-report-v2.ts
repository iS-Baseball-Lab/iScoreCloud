// filepath: src/lib/liff/live-report-v2.ts

import type {
  LiveReportBaseNum,
  LiveReportChainedPlay,
  LiveReportHalfInning,
  LiveReportLineupSlot,
  LiveReportLineupSubRecord,
  LiveReportOutputMode,
  LiveReportPlayEntry,
  LiveReportSubType,
  LiveReportV2Document,
} from "@/types/live-report-v2";
import type {
  ScorebookSheetStructure,
  ScorebookV2AtBat,
} from "@/types/scorebook-v2";

// =========================================================
// 1. 日付・祝日フォーマット（iOS Safari安全パース ＆ 日本の祝日自動判定）
// =========================================================

function nthMondayOfMonth(year: number, month1Based: number, nth: number): number {
  const firstDay = new Date(year, month1Based - 1, 1).getDay();
  const firstMonday = firstDay <= 1 ? 2 - firstDay : 9 - firstDay;
  return firstMonday + (nth - 1) * 7;
}

function calcVernalEquinoxDay(year: number): number {
  return Math.floor(
    20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4)
  );
}

function calcAutumnalEquinoxDay(year: number): number {
  return Math.floor(
    23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4)
  );
}

function isBaseJapaneseHoliday(year: number, month: number, day: number): boolean {
  if (month === 1 && day === 1) return true; // 元日
  if (month === 1 && day === nthMondayOfMonth(year, 1, 2)) return true; // 成人の日
  if (month === 2 && day === 11) return true; // 建国記念の日
  if (month === 2 && day === 23 && year >= 2020) return true; // 天皇誕生日
  if (month === 3 && day === calcVernalEquinoxDay(year)) return true; // 春分の日
  if (month === 4 && day === 29) return true; // 昭和の日
  if (month === 5 && (day === 3 || day === 4 || day === 5)) return true; // 憲法・みどり・こども
  if (month === 7 && day === nthMondayOfMonth(year, 7, 3)) return true; // 海の日
  if (month === 8 && day === 11 && year >= 2016) return true; // 山の日
  if (month === 9 && day === nthMondayOfMonth(year, 9, 3)) return true; // 敬老の日
  if (month === 9 && day === calcAutumnalEquinoxDay(year)) return true; // 秋分の日
  if (month === 10 && day === nthMondayOfMonth(year, 10, 2)) return true; // スポーツの日
  if (month === 11 && day === 3) return true; // 文化の日
  if (month === 11 && day === 23) return true; // 勤労感謝の日
  return false;
}

export function isJapaneseHoliday(date: Date): boolean {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  if (isBaseJapaneseHoliday(y, m, d)) return true;

  // 振替休日判定（日曜が祝日の場合、以降の最初の平日が振替休日）
  const dow = date.getDay();
  if (dow !== 0) {
    const cursor = new Date(y, m - 1, d);
    while (true) {
      cursor.setDate(cursor.getDate() - 1);
      const cy = cursor.getFullYear();
      const cm = cursor.getMonth() + 1;
      const cd = cursor.getDate();
      if (!isBaseJapaneseHoliday(cy, cm, cd)) break;
      if (cursor.getDay() === 0) return true;
    }
  }

  // 国民の休日（前日と翌日がともに祝日の平日）
  if (dow !== 0) {
    const prev = new Date(y, m - 1, d - 1);
    const next = new Date(y, m - 1, d + 1);
    if (
      isBaseJapaneseHoliday(prev.getFullYear(), prev.getMonth() + 1, prev.getDate()) &&
      isBaseJapaneseHoliday(next.getFullYear(), next.getMonth() + 1, next.getDate())
    ) {
      return true;
    }
  }

  return false;
}

export function parseSafeJstDate(rawDate: string | null | undefined): Date | null {
  if (!rawDate) return null;
  const trimmed = rawDate.trim();
  if (!trimmed) return null;

  const ymdMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymdMatch) {
    const y = Number(ymdMatch[1]);
    const m = Number(ymdMatch[2]);
    const d = Number(ymdMatch[3]);
    const dt = new Date(y, m - 1, d, 12, 0, 0);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return null;
}

export function formatJapaneseMatchDateLabel(rawDate: string | null | undefined): string {
  const d = parseSafeJstDate(rawDate) ?? new Date();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const wd = weekdays[d.getDay()] || "";
  const holidaySuffix = isJapaneseHoliday(d) && d.getDay() !== 0 ? "祝" : "";
  return `${month}月${day}日(${wd}${holidaySuffix})`;
}

export function getCurrentHmText(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// =========================================================
// 2. チーム名・選手名・守備位置ユーティリティ
// =========================================================

export function deriveScoreboardShortName(rawName: string): string {
  const base = (rawName || "")
    .replace(/[\(（].*?[\)）]/g, "")
    .replace(
      /(リトルシニア|シニア|ボーイズ|ヤング|ポニー|リトル|ベースボールクラブ|クラブ|ジュニア|スピリッツ|スターズ|ドリームス|ファイターズ|ライオンズ|イーグルス|ホークス|タイガース|ジャイアンツ|ドラゴンズ|スワローズ|マリナーズ|S|B|Y)$/i,
      ""
    )
    .trim();

  const target = base || (rawName || "").trim() || "チーム";
  const chars = Array.from(target);
  if (chars.length === 2) {
    return `${chars[0]}　${chars[1]}`;
  }
  if (chars.length > 4) {
    return chars.slice(0, 4).join("");
  }
  return target;
}

export function formatPlayerReportName(
  fullName: string,
  showSurnameOnly: boolean
): string {
  const cleaned = (fullName || "").trim();
  if (!cleaned) return "";
  if (!showSurnameOnly) return cleaned;
  const parts = cleaned.split(/[\s　]+/);
  return parts[0] || cleaned;
}

export const POSITION_OPTIONS: ReadonlyArray<{
  code: string;
  shortLabel: string;
  dirLabel: string;
}> = [
  { code: "1", shortLabel: "1 (投)", dirLabel: "投" },
  { code: "2", shortLabel: "2 (捕)", dirLabel: "捕" },
  { code: "3", shortLabel: "3 (一)", dirLabel: "一" },
  { code: "4", shortLabel: "4 (二)", dirLabel: "二" },
  { code: "5", shortLabel: "5 (三)", dirLabel: "三" },
  { code: "6", shortLabel: "6 (遊)", dirLabel: "遊" },
  { code: "7", shortLabel: "7 (左)", dirLabel: "左" },
  { code: "8", shortLabel: "8 (中)", dirLabel: "中" },
  { code: "9", shortLabel: "9 (右)", dirLabel: "右" },
  { code: "D", shortLabel: "D (DH)", dirLabel: "" },
];

export function normalizeReportPositionCode(rawPos: string | null | undefined): string {
  const p = (rawPos || "").trim().toUpperCase();
  const map: Record<string, string> = {
    "1": "1",
    P: "1",
    投: "1",
    投手: "1",
    "2": "2",
    C: "2",
    捕: "2",
    捕手: "2",
    "3": "3",
    "1B": "3",
    一: "3",
    一塁: "3",
    "4": "4",
    "2B": "4",
    二: "4",
    二塁: "4",
    "5": "5",
    "3B": "5",
    三: "5",
    三塁: "5",
    "6": "6",
    SS: "6",
    遊: "6",
    遊撃: "6",
    "7": "7",
    LF: "7",
    左: "7",
    左翼: "7",
    "8": "8",
    CF: "8",
    中: "8",
    中堅: "8",
    "9": "9",
    RF: "9",
    右: "9",
    右翼: "9",
    DH: "D",
    D: "D",
    指: "D",
  };
  return map[p] || (p ? p.slice(0, 1) : "打");
}

export function createDefaultEmptyLineup(count = 9): LiveReportLineupSlot[] {
  return Array.from({ length: count }, (_, idx) => ({
    order: idx + 1,
    position: String(idx + 1 <= 9 ? idx + 1 : "D"),
    playerId: null,
    playerName: "",
    substitutions: [],
  }));
}

export function createInitialLiveReportDocument(params?: {
  matchId?: string | null;
  myTeamName?: string;
  opponentName?: string;
  date?: string;
  tournamentName?: string;
  venueName?: string;
  battingOrder?: "first" | "second";
  regulationInnings?: number;
  reporterNames?: string;
}): LiveReportV2Document {
  const myTeam = params?.myTeamName || "自チーム";
  const opp = params?.opponentName || "";
  const battingOrder = params?.battingOrder || "first";
  const myShort = deriveScoreboardShortName(myTeam);
  const oppShort = opp ? deriveScoreboardShortName(opp) : "相　手";

  return {
    version: 2,
    matchId: params?.matchId ?? null,
    dateText: formatJapaneseMatchDateLabel(params?.date),
    tournamentText: params?.tournamentName || "",
    opponentName: opp,
    venueName: params?.venueName || "",
    startTime: "",
    endTime: "",
    battingOrder,
    regulationInnings: params?.regulationInnings || 7,
    firstTeamShortName: battingOrder === "first" ? myShort : oppShort,
    secondTeamShortName: battingOrder === "first" ? oppShort : myShort,
    showSurnameOnly: true,
    appendSubsToTopLineup: false,
    showWalkoffX: false,
    lineup: createDefaultEmptyLineup(9),
    halfInnings: [],
    activeInning: 1,
    activeIsBottom: false,
    nextMyOrder: 1,
    nextOpponentOrder: 1,
    isGameFinished: false,
    closingComment: "",
    reporterNames: params?.reporterNames || "",
  };
}

// =========================================================
// 3. アクティブ打順・守備解決（途中交代反映）
// =========================================================

export function compareHalfInningOrder(
  aInning: number,
  aIsBottom: boolean,
  bInning: number,
  bIsBottom: boolean
): number {
  if (aInning !== bInning) return aInning - bInning;
  if (aIsBottom === bIsBottom) return 0;
  return aIsBottom ? 1 : -1;
}

export interface ActiveSlotSnapshot {
  order: number;
  position: string;
  playerId: string | null;
  playerName: string;
}

export function resolveActiveLineupAtInning(
  lineup: ReadonlyArray<LiveReportLineupSlot>,
  inning: number,
  isBottom: boolean
): ActiveSlotSnapshot[] {
  return lineup.map((slot) => {
    let currentName = slot.playerName;
    let currentPos = slot.position;
    let currentPlayerId = slot.playerId;

    for (const sub of slot.substitutions) {
      if (
        compareHalfInningOrder(sub.inning, sub.isBottom, inning, isBottom) <= 0
      ) {
        if (sub.newName) currentName = sub.newName;
        if (sub.newPosition) currentPos = sub.newPosition;
        if (sub.playerId !== undefined) currentPlayerId = sub.playerId;
      }
    }

    return {
      order: slot.order,
      position: currentPos,
      playerId: currentPlayerId,
      playerName: currentName,
    };
  });
}

const DIRECTION_TO_POS_CODE: Record<string, string> = {
  投: "1",
  捕: "2",
  一: "3",
  二: "4",
  三: "5",
  遊: "6",
  左: "7",
  中: "8",
  右: "9",
};

export function resolvePrimaryPosCodeFromDirection(direction: string): string {
  const trimmed = (direction || "").trim();
  if (!trimmed) return "";
  if (DIRECTION_TO_POS_CODE[trimmed]) return DIRECTION_TO_POS_CODE[trimmed];
  if (trimmed.startsWith("左中") || trimmed.startsWith("右中")) {
    return "8";
  }
  if (trimmed.startsWith("一二")) return "4";
  if (trimmed.startsWith("二遊") || trimmed.startsWith("三遊")) return "6";
  const head = trimmed.slice(0, 1);
  return DIRECTION_TO_POS_CODE[head] || "";
}

export function findActiveDefenderByDirection(
  lineup: ReadonlyArray<LiveReportLineupSlot>,
  inning: number,
  isBottom: boolean,
  direction: string,
  showSurnameOnly: boolean
): string {
  const posCode = resolvePrimaryPosCodeFromDirection(direction);
  if (!posCode) return "";
  const active = resolveActiveLineupAtInning(lineup, inning, isBottom);
  const matched = active.find(
    (s) => normalizeReportPositionCode(s.position) === posCode
  );
  if (!matched || !matched.playerName) return "";
  return formatPlayerReportName(matched.playerName, showSurnameOnly);
}

// =========================================================
// 4. イニング内状況計算（アウト・残塁・得点・累計スコア）
// =========================================================

export function normalizeRunnersList(
  runners: ReadonlyArray<number>
): LiveReportBaseNum[] {
  const set = new Set<LiveReportBaseNum>();
  for (const r of runners) {
    if (r === 1 || r === 2 || r === 3) set.add(r);
  }
  return Array.from(set).sort((a, b) => a - b);
}

export function formatRunnersLabel(
  runners: ReadonlyArray<LiveReportBaseNum>,
  outs: number
): string {
  if (outs >= 3) return "";
  const sorted = normalizeRunnersList(runners);
  if (sorted.length === 0) return "";
  if (sorted.length === 3) return "満塁";
  if (sorted.length === 2) return `${sorted[0]}.${sorted[1]}塁`;
  return `${sorted[0]}塁`;
}

export function formatOutsAndRunnersSuffix(
  outs: number,
  runners: ReadonlyArray<LiveReportBaseNum>
): string {
  const clampedOuts = Math.max(0, Math.min(3, outs));
  const dots = "⚫️".repeat(clampedOuts);
  const baseStr = formatRunnersLabel(runners, clampedOuts);
  return `${dots}${baseStr}`;
}

export function getHalfInningRuns(half: LiveReportHalfInning | undefined): number {
  if (!half) return 0;
  if (typeof half.manualRunsOverride === "number") {
    return Math.max(0, half.manualRunsOverride);
  }
  return half.entries.reduce((sum, e) => sum + (e.runsScored || 0), 0);
}

export interface HalfInningLiveSituation {
  outs: number;
  runners: LiveReportBaseNum[];
  runs: number;
}

export function computeHalfInningSituation(
  half: LiveReportHalfInning | undefined
): HalfInningLiveSituation {
  if (!half || half.entries.length === 0) {
    return {
      outs: 0,
      runners: [],
      runs: half?.manualRunsOverride ?? 0,
    };
  }

  let outs = 0;
  let runners: LiveReportBaseNum[] = [];
  for (const entry of half.entries) {
    if (entry.entryType !== "batter") continue;
    if (entry.chainedPlays && entry.chainedPlays.length > 0) {
      const lastChain = entry.chainedPlays[entry.chainedPlays.length - 1];
      outs = lastChain.outsAfter;
      runners = normalizeRunnersList(lastChain.runnersAfter);
    } else {
      outs = entry.outsAfter;
      runners = normalizeRunnersList(entry.runnersAfter);
    }
    if (outs >= 3) {
      outs = 3;
      runners = [];
    }
  }

  return {
    outs,
    runners,
    runs: getHalfInningRuns(half),
  };
}

export function isMyTeamBattingHalf(
  battingOrder: "first" | "second",
  isBottom: boolean
): boolean {
  return battingOrder === "first" ? !isBottom : isBottom;
}

export interface CumulativeScoreSummary {
  maxInning: number;
  firstInningScores: Array<number | null>;
  secondInningScores: Array<number | null>;
  firstTotal: number;
  secondTotal: number;
}

export function computeScoreboardSummary(
  doc: LiveReportV2Document,
  limitInning?: number,
  limitIsBottom?: boolean
): CumulativeScoreSummary {
  const recordedMax = doc.halfInnings.reduce(
    (mx, h) => Math.max(mx, h.inning),
    1
  );
  const maxInning = Math.max(
    doc.regulationInnings || 7,
    recordedMax,
    doc.activeInning || 1
  );

  const firstInningScores: Array<number | null> = [];
  const secondInningScores: Array<number | null> = [];
  let firstTotal = 0;
  let secondTotal = 0;

  for (let inn = 1; inn <= maxInning; inn++) {
    const topHalf = doc.halfInnings.find((h) => h.inning === inn && !h.isBottom);
    const botHalf = doc.halfInnings.find((h) => h.inning === inn && h.isBottom);

    const allowTop =
      limitInning === undefined ||
      compareHalfInningOrder(inn, false, limitInning, Boolean(limitIsBottom)) <= 0;
    const allowBot =
      limitInning === undefined ||
      compareHalfInningOrder(inn, true, limitInning, Boolean(limitIsBottom)) <= 0;

    const topPlayed =
      allowTop &&
      Boolean(
        topHalf &&
          (topHalf.entries.length > 0 || topHalf.manualRunsOverride !== null)
      );
    const botPlayed =
      allowBot &&
      Boolean(
        botHalf &&
          (botHalf.entries.length > 0 || botHalf.manualRunsOverride !== null)
      );

    if (topPlayed && topHalf) {
      const r = getHalfInningRuns(topHalf);
      firstInningScores.push(r);
      firstTotal += r;
    } else {
      firstInningScores.push(null);
    }

    if (botPlayed && botHalf) {
      const r = getHalfInningRuns(botHalf);
      secondInningScores.push(r);
      secondTotal += r;
    } else {
      secondInningScores.push(null);
    }
  }

  return {
    maxInning,
    firstInningScores,
    secondInningScores,
    firstTotal,
    secondTotal,
  };
}

// =========================================================
// 5. かんたん1打席シミュレーション（方向 × 打撃結果 → テキスト・アウト・残塁・得点）
// =========================================================

export type DirectOutcomeCode =
  | "strikeout_swing"
  | "strikeout_look"
  | "dropped_3rd_out"
  | "dropped_3rd_safe"
  | "walk"
  | "ibb"
  | "hbp";

export type DirectPlayVariant =
  | "so_foul_tip"
  | "walk_four_pitch"
  | "walk_full_count"
  | "walk_wp_2b"
  | "dts_wp_safe";

export type BattedOutcomeCode =
  | "groundout"
  | "hard_groundout"
  | "double_play"
  | "flyout"
  | "liner"
  | "foul_fly"
  | "sac_bunt"
  | "sac_fly"
  | "front_hit"
  | "hit"
  | "infield_hit"
  | "double"
  | "triple"
  | "homerun"
  | "rh_homerun"
  | "error"
  | "fc";

export type BattedPlayVariant =
  // ゴロ系
  | "ground_botebote"
  | "ground_high_bound"
  | "ground_force_2b"
  | "ground_force_home"
  | "ground_tag_out"
  // フライ・ライナー・併殺系
  | "fly_shallow"
  | "fly_deep"
  | "infield_fly"
  | "dp_liner"
  | "dp_fly_tag"
  | "dp_strikeout_cs"
  // 犠打・スクイズ系
  | "squeeze_score"
  | "safety_squeeze"
  | "bunt_fc_out"
  | "bunt_popup_out"
  | "squeeze_fail_out"
  // 安打・長打系
  | "hit_front"
  | "hit_poten"
  | "hit_clean"
  | "hit_line"
  | "hit_over"
  | "hit_gap"
  | "hit_liner"
  | "hit_hard"
  | "infield_botebote"
  | "bunt_hit"
  | "safety_bunt_hit"
  | "entitle_double"
  | "inside_park_hr"
  // エラー・野選系
  | "error_catch"
  | "error_throw"
  | "error_drop"
  | "error_pass_2b"
  | "fc_home_safe"
  | "fc_bunt_safe";

export type QuickBaserunningCode =
  | "steal_2b"
  | "steal_3b"
  | "double_steal"
  | "home_steal"
  | "delayed_steal"
  | "wp_advance"
  | "pb_advance"
  | "balk_advance"
  | "caught_stealing"
  | "pickoff_out"
  | "rundown_out";

export interface SimulatedPlayCandidate {
  id: string;
  chipLabel: string;
  playText: string;
  outsAfter: number;
  runnersAfter: LiveReportBaseNum[];
  runsScored: number;
}

export interface SimulatedBaserunningResult {
  mode: "inline" | "chained";
  playText: string;
  outsAfter: number;
  runnersAfter: LiveReportBaseNum[];
  runsScored: number;
}

function advanceForcedWalk(runnersBefore: ReadonlyArray<LiveReportBaseNum>): {
  runnersAfter: LiveReportBaseNum[];
  runs: number;
} {
  const has1 = runnersBefore.includes(1);
  const has2 = runnersBefore.includes(2);
  const has3 = runnersBefore.includes(3);

  if (!has1) {
    const next: LiveReportBaseNum[] = [1];
    if (has2) next.push(2);
    if (has3) next.push(3);
    return { runnersAfter: normalizeRunnersList(next), runs: 0 };
  }
  if (!has2) {
    const next: LiveReportBaseNum[] = [1, 2];
    if (has3) next.push(3);
    return { runnersAfter: normalizeRunnersList(next), runs: 0 };
  }
  if (!has3) {
    return { runnersAfter: [1, 2, 3], runs: 0 };
  }
  return { runnersAfter: [1, 2, 3], runs: 1 };
}

function hasDetailedDirSuffix(dir: string): boolean {
  return /(?:前|線|越|浅|深|間|強襲|後方|側|邪|破る)$/.test(dir);
}

function normalizeGapDirection(dir: string): string {
  if (dir === "左中") return "左中間";
  if (dir === "右中") return "右中間";
  return dir;
}

export function simulateDirectOutcome(
  code: DirectOutcomeCode,
  outsBefore: number,
  runnersBefore: ReadonlyArray<LiveReportBaseNum>,
  variant?: DirectPlayVariant | null
): SimulatedPlayCandidate {
  const runners = normalizeRunnersList(runnersBefore);

  if (code === "strikeout_swing") {
    const nextOuts = Math.min(3, outsBefore + 1);
    const label = variant === "so_foul_tip" ? "ファウルチップ三振" : "空三振";
    return {
      id: variant || "so_swing",
      chipLabel: label,
      playText: label,
      outsAfter: nextOuts,
      runnersAfter: nextOuts >= 3 ? [] : runners,
      runsScored: 0,
    };
  }
  if (code === "strikeout_look") {
    const nextOuts = Math.min(3, outsBefore + 1);
    return {
      id: "so_look",
      chipLabel: "見逃三振",
      playText: "見逃三振",
      outsAfter: nextOuts,
      runnersAfter: nextOuts >= 3 ? [] : runners,
      runsScored: 0,
    };
  }
  if (code === "dropped_3rd_out") {
    const nextOuts = Math.min(3, outsBefore + 1);
    return {
      id: "dts_out",
      chipLabel: "振逃アウト",
      playText: "振逃",
      outsAfter: nextOuts,
      runnersAfter: nextOuts >= 3 ? [] : runners,
      runsScored: 0,
    };
  }
  if (code === "dropped_3rd_safe") {
    if (variant === "dts_wp_safe") {
      const nextR: LiveReportBaseNum[] = [1];
      let scored = 0;
      for (const r of runners) {
        if (r === 3) scored += 1;
        else nextR.push((r + 1) as LiveReportBaseNum);
      }
      return {
        id: "dts_wp_safe",
        chipLabel: "暴投振逃出塁",
        playText: scored > 0 ? `暴投振逃${scored}点` : "暴投振逃",
        outsAfter: outsBefore,
        runnersAfter: normalizeRunnersList(nextR),
        runsScored: scored,
      };
    }
    const pushed = advanceForcedWalk(runners);
    return {
      id: "dts_safe",
      chipLabel: "振逃出塁",
      playText: pushed.runs > 0 ? `振逃${pushed.runs}点` : "振逃",
      outsAfter: outsBefore,
      runnersAfter: pushed.runnersAfter,
      runsScored: pushed.runs,
    };
  }

  if (code === "walk" && variant === "walk_wp_2b") {
    const nextR: LiveReportBaseNum[] = [2];
    let scored = 0;
    for (const r of runners) {
      if (r >= 2) scored += 1;
      else nextR.push(3);
    }
    return {
      id: "walk_wp_2b",
      chipLabel: "四球＋暴投二進",
      playText: scored > 0 ? `四球暴投${scored}点` : "四球暴投二進",
      outsAfter: outsBefore,
      runnersAfter: normalizeRunnersList(nextR),
      runsScored: scored,
    };
  }

  const labelMap: Record<"walk" | "ibb" | "hbp", string> = {
    walk:
      variant === "walk_four_pitch"
        ? "ストレート四球"
        : variant === "walk_full_count"
        ? "粘って四球"
        : "四球",
    ibb: "敬遠四球",
    hbp: "死球",
  };
  const baseLabel = labelMap[code];
  const pushed = advanceForcedWalk(runners);
  const text =
    pushed.runs > 0 ? `押し出し${baseLabel}${pushed.runs}点` : baseLabel;

  return {
    id: variant || code,
    chipLabel: baseLabel,
    playText: text,
    outsAfter: outsBefore,
    runnersAfter: pushed.runnersAfter,
    runsScored: pushed.runs,
  };
}

export function buildBattedPlayCandidates(
  direction: string,
  outcome: BattedOutcomeCode,
  outsBefore: number,
  runnersBefore: ReadonlyArray<LiveReportBaseNum>,
  variant?: BattedPlayVariant | null
): SimulatedPlayCandidate[] {
  const dir = (direction || "").trim();
  const normDir = normalizeGapDirection(dir);
  const runners = normalizeRunnersList(runnersBefore);
  const has1 = runners.includes(1);
  const has2 = runners.includes(2);
  const has3 = runners.includes(3);

  // 1. ゴロ・強襲ゴロ
  if (outcome === "groundout" || outcome === "hard_groundout") {
    const groundPrefix =
      outcome === "hard_groundout" || dir.endsWith("強襲")
        ? dir.endsWith("強襲")
          ? `${dir}ゴロ`
          : `${normDir}強襲ゴロ`
        : variant === "ground_botebote"
        ? `${normDir}ボテボテゴロ`
        : variant === "ground_high_bound"
        ? `${normDir}高いバウンドゴロ`
        : variant === "ground_tag_out"
        ? `${normDir}ゴロタッチアウト`
        : `${normDir}ゴロ`;

    const nextOuts = Math.min(3, outsBefore + 1);

    if (variant === "ground_force_home" && has3) {
      const rem: LiveReportBaseNum[] = [1];
      if (has1) rem.push(2);
      if (has2) rem.push(3);
      return [
        {
          id: "go_fc_home",
          chipLabel: "本塁封殺 (無得点)",
          playText: `${normDir}ゴロ本塁封殺`,
          outsAfter: nextOuts,
          runnersAfter: nextOuts >= 3 ? [] : normalizeRunnersList(rem),
          runsScored: 0,
        },
      ];
    }

    if (variant === "ground_force_2b") {
      const rem: LiveReportBaseNum[] = [1];
      if (has2) rem.push(3);
      return [
        {
          id: "go_fc_2b_var",
          chipLabel: "二塁封殺",
          playText: `${normDir}ゴロ二塁封殺`,
          outsAfter: nextOuts,
          runnersAfter:
            nextOuts >= 3
              ? []
              : normalizeRunnersList(
                  has3 && nextOuts < 3 ? rem : rem
                ),
          runsScored: has3 && nextOuts < 3 ? 1 : 0,
        },
      ];
    }

    if (nextOuts >= 3 || runners.length === 0) {
      return [
        {
          id: "go_std",
          chipLabel: "通常アウト",
          playText: groundPrefix,
          outsAfter: nextOuts,
          runnersAfter: [],
          runsScored: 0,
        },
      ];
    }

    const candidates: SimulatedPlayCandidate[] = [];

    // 進塁ゴロパターン（例: 三ゴロ一塁走者進塁 ⚫️2塁）
    if (has1 && !has2 && !has3) {
      candidates.push({
        id: "go_adv1",
        chipLabel: "一塁走者進塁 (2塁)",
        playText: `${groundPrefix}一塁走者進塁`,
        outsAfter: nextOuts,
        runnersAfter: [2],
        runsScored: 0,
      });
    } else if (!has1 && has2 && !has3) {
      candidates.push({
        id: "go_adv2",
        chipLabel: "二塁走者進塁 (3塁)",
        playText: `${groundPrefix}二塁走者進塁`,
        outsAfter: nextOuts,
        runnersAfter: [3],
        runsScored: 0,
      });
    } else if (has1 && has2 && !has3) {
      candidates.push({
        id: "go_adv12",
        chipLabel: "それぞれ進塁 (2.3塁)",
        playText: `${groundPrefix}走者進塁`,
        outsAfter: nextOuts,
        runnersAfter: [2, 3],
        runsScored: 0,
      });
    }

    // 3塁走者生還（ゴロの間1点）
    if (has3) {
      const rem: LiveReportBaseNum[] = [];
      if (has2) rem.push(3);
      if (has1) rem.push(2);
      candidates.push({
        id: "go_score",
        chipLabel: "3塁走者生還 (+1点)",
        playText: `${groundPrefix}の間1点`,
        outsAfter: nextOuts,
        runnersAfter: normalizeRunnersList(rem),
        runsScored: 1,
      });
    }

    // 走者そのまま（釘付け / フォースアウト入替で1塁残る等）
    candidates.push({
      id: "go_hold",
      chipLabel: `走者そのまま (${formatRunnersLabel(runners, nextOuts)})`,
      playText: groundPrefix,
      outsAfter: nextOuts,
      runnersAfter: runners,
      runsScored: 0,
    });

    // 封殺で1塁に残るケース（例: 2塁走者3塁アウトや2塁フォースアウト）
    if (has1 && has2) {
      candidates.push({
        id: "go_fc_2b",
        chipLabel: "二塁封殺 (1.3塁)",
        playText: `${groundPrefix}二塁封殺`,
        outsAfter: nextOuts,
        runnersAfter: [1, 3],
        runsScored: 0,
      });
    }

    // 併殺打パターン（2アウト未満）
    if (outsBefore <= 1 && has1) {
      const dpOuts = Math.min(3, outsBefore + 2);
      const dpRem: LiveReportBaseNum[] = [];
      if (dpOuts < 3 && has2) dpRem.push(3);
      candidates.push({
        id: "go_dp",
        chipLabel: "併殺 (ダブルプレー)",
        playText: `${groundPrefix}併殺`,
        outsAfter: dpOuts,
        runnersAfter: dpRem,
        runsScored: 0,
      });
    }

    return candidates;
  }

  // 2. 併殺（直接選択）
  if (outcome === "double_play") {
    const dpOuts = Math.min(3, outsBefore + 2);
    const dpRem: LiveReportBaseNum[] = [];
    if (dpOuts < 3 && has2 && !has3) dpRem.push(3);

    if (variant === "dp_strikeout_cs") {
      return [
        {
          id: "dp_k_cs",
          chipLabel: "三振＋盗塁死併殺",
          playText: "三振併殺",
          outsAfter: dpOuts,
          runnersAfter: dpRem,
          runsScored: 0,
        },
      ];
    }
    if (variant === "dp_liner") {
      return [
        {
          id: "dp_liner_var",
          chipLabel: `${normDir}ライナー併殺`,
          playText: `${normDir}ライナー併殺`,
          outsAfter: dpOuts,
          runnersAfter: dpRem,
          runsScored: 0,
        },
      ];
    }
    if (variant === "dp_fly_tag") {
      return [
        {
          id: "dp_fly_var",
          chipLabel: `${normDir}フライ併殺`,
          playText: `${normDir}フライ併殺`,
          outsAfter: dpOuts,
          runnersAfter: dpRem,
          runsScored: 0,
        },
      ];
    }

    return [
      {
        id: "dp_std",
        chipLabel: `${normDir}ゴロ併殺`,
        playText: `${normDir}ゴロ併殺`,
        outsAfter: dpOuts,
        runnersAfter: dpRem,
        runsScored: 0,
      },
      {
        id: "dp_liner",
        chipLabel: `${normDir}ライナー併殺`,
        playText: `${normDir}ライナー併殺`,
        outsAfter: dpOuts,
        runnersAfter: dpRem,
        runsScored: 0,
      },
    ];
  }

  // 3. フライ・ライナー・邪飛
  if (outcome === "flyout" || outcome === "liner" || outcome === "foul_fly") {
    let baseWord: string;
    if (outcome === "flyout") {
      if (variant === "infield_fly") {
        baseWord = `${normDir}インフィールドフライ`;
      } else if (variant === "fly_shallow" || dir.endsWith("浅")) {
        const cleanHead = dir.endsWith("浅") ? dir.slice(0, -1) : normDir;
        baseWord = `${cleanHead}浅いフライ`;
      } else if (variant === "fly_deep" || dir.endsWith("深")) {
        const cleanHead = dir.endsWith("深") ? dir.slice(0, -1) : normDir;
        baseWord = `${cleanHead}深いフライ`;
      } else {
        baseWord = `${normDir}フライ`;
      }
    } else if (outcome === "liner") {
      baseWord = `${normDir}ライナー`;
    } else {
      baseWord = dir.endsWith("邪")
        ? `${dir}飛`
        : `${normDir}邪飛`;
    }

    const nextOuts = Math.min(3, outsBefore + 1);

    const list: SimulatedPlayCandidate[] = [
      {
        id: "air_std",
        chipLabel: "通常アウト (走者そのまま)",
        playText: baseWord,
        outsAfter: nextOuts,
        runnersAfter: nextOuts >= 3 ? [] : runners,
        runsScored: 0,
      },
    ];

    if (
      nextOuts < 3 &&
      has3 &&
      outcome !== "liner" &&
      variant !== "infield_fly"
    ) {
      const rem = runners.filter((r) => r !== 3);
      list.push({
        id: "air_sf",
        chipLabel: "タッチアップ生還 (犠飛+1点)",
        playText: `${normDir}犠飛1点`,
        outsAfter: nextOuts,
        runnersAfter: rem,
        runsScored: 1,
      });
    }

    if (nextOuts < 3 && has2 && !has3 && variant !== "infield_fly") {
      const rem = normalizeRunnersList(
        runners.map((r) => (r === 2 ? 3 : r)) as LiveReportBaseNum[]
      );
      list.push({
        id: "air_tag3",
        chipLabel: "二塁走者タッチアップ (3塁へ)",
        playText: `${baseWord}二塁走者三進`,
        outsAfter: nextOuts,
        runnersAfter: rem,
        runsScored: 0,
      });
    }

    return list;
  }

  // 4. 送りバント・スクイズ・犠飛
  if (outcome === "sac_bunt") {
    const nextOuts = Math.min(3, outsBefore + 1);

    if (variant === "bunt_fc_out") {
      const fcRunners: LiveReportBaseNum[] = [1];
      if (has1 && has2 && !has3) fcRunners.push(2);
      return [
        {
          id: "bunt_fc_out",
          chipLabel: "バント失敗・先行走者封殺",
          playText: `${normDir}バント失敗封殺`,
          outsAfter: nextOuts,
          runnersAfter: nextOuts >= 3 ? [] : normalizeRunnersList(fcRunners),
          runsScored: 0,
        },
      ];
    }

    if (variant === "bunt_popup_out") {
      return [
        {
          id: "bunt_popup_out",
          chipLabel: "バント小飛球アウト",
          playText: `${normDir}バント飛球`,
          outsAfter: nextOuts,
          runnersAfter: nextOuts >= 3 ? [] : runners,
          runsScored: 0,
        },
      ];
    }

    if (variant === "squeeze_fail_out") {
      const rem: LiveReportBaseNum[] = [1];
      for (const r of runners) {
        if (r !== 3) rem.push(r);
      }
      return [
        {
          id: "squeeze_fail_out",
          chipLabel: "スクイズ失敗 (3塁走者アウト)",
          playText: `${normDir}スクイズ失敗`,
          outsAfter: nextOuts,
          runnersAfter: nextOuts >= 3 ? [] : normalizeRunnersList(rem),
          runsScored: 0,
        },
      ];
    }

    if (variant === "squeeze_score" || variant === "safety_squeeze") {
      const rem: LiveReportBaseNum[] = [];
      for (const r of runners) {
        if (r !== 3) rem.push((r + 1) as LiveReportBaseNum);
      }
      const sqWord =
        variant === "safety_squeeze" ? "セーフティスクイズ" : "スクイズ";
      const sqRuns = nextOuts >= 3 ? 0 : 1;
      return [
        {
          id: variant,
          chipLabel: `${sqWord}成功 (+1点)`,
          playText: `${normDir}${sqWord}${sqRuns > 0 ? "1点" : ""}`,
          outsAfter: nextOuts,
          runnersAfter: nextOuts >= 3 ? [] : normalizeRunnersList(rem),
          runsScored: sqRuns,
        },
      ];
    }

    const nextRunners: LiveReportBaseNum[] = [];
    let runs = 0;
    for (const r of runners) {
      if (r === 3) runs += 1;
      else nextRunners.push((r + 1) as LiveReportBaseNum);
    }
    const candidates: SimulatedPlayCandidate[] = [
      {
        id: "bunt_std",
        chipLabel: runs > 0 ? `スクイズ成功 (+${runs}点)` : "送りバント成功",
        playText:
          runs > 0 ? `${normDir}スクイズ${runs}点` : `${normDir}送りバント`,
        outsAfter: nextOuts,
        runnersAfter: nextOuts >= 3 ? [] : normalizeRunnersList(nextRunners),
        runsScored: nextOuts >= 3 ? 0 : runs,
      },
    ];
    if (runs > 0) {
      candidates.push({
        id: "bunt_hold3",
        chipLabel: "3塁ストップ (無得点)",
        playText: `${normDir}送りバント`,
        outsAfter: nextOuts,
        runnersAfter:
          nextOuts >= 3
            ? []
            : normalizeRunnersList([
                3,
                ...(has1 ? ([2] as LiveReportBaseNum[]) : []),
              ]),
        runsScored: 0,
      });
    }
    return candidates;
  }

  if (outcome === "sac_fly") {
    const nextOuts = Math.min(3, outsBefore + 1);
    const rem = runners.filter((r) => r !== 3);
    const scored = nextOuts < 3 && has3 ? 1 : 0;
    return [
      {
        id: "sf_std",
        chipLabel: "犠飛 (+1点)",
        playText: scored > 0 ? `${normDir}犠飛1点` : `${normDir}フライ`,
        outsAfter: nextOuts,
        runnersAfter: nextOuts >= 3 ? [] : rem,
        runsScored: scored,
      },
    ];
  }

  // 5. 単打系（前ヒット / ヒット / 内野安打 ＋ フリック詳細バリエーション）
  if (
    outcome === "front_hit" ||
    outcome === "hit" ||
    outcome === "infield_hit"
  ) {
    const isInfieldStyle =
      outcome === "infield_hit" ||
      variant === "infield_botebote" ||
      variant === "bunt_hit" ||
      variant === "safety_bunt_hit";

    const makeSingleText = (runs: number): string => {
      const timely = runs > 0 ? "適時" : "";
      const runStr = runs > 0 ? `${runs}点` : "";

      if (variant === "bunt_hit") {
        return `${normDir}${timely}バント安打${runStr}`;
      }
      if (variant === "safety_bunt_hit") {
        return `${normDir}${timely}セーフティバント安打${runStr}`;
      }
      if (variant === "infield_botebote") {
        return `${normDir}ボテボテ${timely}内野安打${runStr}`;
      }
      if (outcome === "infield_hit") {
        const hardMark =
          variant === "hit_hard" && !normDir.endsWith("強襲") ? "強襲" : "";
        return `${normDir}${hardMark}${timely}内野安打${runStr}`;
      }

      // 外野・一般安打のニュアンス組み立て
      if (variant === "hit_poten" || dir.endsWith("浅")) {
        const baseHead = dir.endsWith("浅")
          ? `${dir.slice(0, -1)}前`
          : !dir
          ? ""
          : hasDetailedDirSuffix(normDir)
          ? normDir
          : normDir === "左" || normDir === "中" || normDir === "右"
          ? `${normDir}前`
          : normDir;
        return `${baseHead}ポテン${timely}ヒット${runStr}`;
      }

      if (variant === "hit_line") {
        const lineHead = !dir
          ? "ライン際"
          : normDir.endsWith("線")
          ? normDir
          : normDir === "左" || normDir === "右" || normDir === "一" || normDir === "三"
          ? `${normDir}線`
          : `${normDir}ライン際`;
        return `${lineHead}${timely}ヒット${runStr}`;
      }

      if (variant === "hit_clean") {
        const cleanHead = !dir
          ? ""
          : hasDetailedDirSuffix(normDir)
          ? normDir
          : normDir === "左" || normDir === "中" || normDir === "右"
          ? `${normDir}前`
          : normDir;
        return `${cleanHead}クリーン${timely}ヒット${runStr}`;
      }

      if (variant === "hit_liner") {
        return `${normDir}ライナー${timely}ヒット${runStr}`;
      }

      if (variant === "hit_hard") {
        const hardHead = normDir.endsWith("強襲") ? normDir : `${normDir}強襲`;
        return `${hardHead}${timely}ヒット${runStr}`;
      }

      if (variant === "hit_over") {
        const overHead = !dir
          ? "外野越"
          : normDir.endsWith("越")
          ? normDir
          : `${normDir}越`;
        return `${overHead}${timely}ヒット${runStr}`;
      }

      if (variant === "hit_gap") {
        const gapHead =
          normDir === "左"
            ? "左中間"
            : normDir === "右"
            ? "右中間"
            : normDir || "外野間";
        return `${gapHead}${timely}ヒット${runStr}`;
      }

      if (outcome === "front_hit" || variant === "hit_front") {
        const frontHead = !dir
          ? ""
          : hasDetailedDirSuffix(normDir)
          ? normDir
          : `${normDir}前`;
        return `${frontHead}${timely}ヒット${runStr}`;
      }

      return `${normDir}${timely}ヒット${runStr}`;
    };

    if (runners.length === 0) {
      return [
        {
          id: "1b_empty",
          chipLabel: "1塁出塁",
          playText: makeSingleText(0),
          outsAfter: outsBefore,
          runnersAfter: [1],
          runsScored: 0,
        },
      ];
    }

    const candidates: SimulatedPlayCandidate[] = [];

    // 内野安打・バント安打時は1つずつ進塁を先頭に
    if (isInfieldStyle) {
      const oneBaseRunners: LiveReportBaseNum[] = [1];
      let oneBaseRuns = 0;
      if (has1) oneBaseRunners.push(2);
      if (has2) oneBaseRunners.push(3);
      if (has3) oneBaseRuns += 1;
      candidates.push({
        id: "1b_inf_one",
        chipLabel:
          oneBaseRuns > 0
            ? `1つずつ進塁 (+${oneBaseRuns}点・${formatRunnersLabel(oneBaseRunners, 0)})`
            : `1つずつ進塁 (${formatRunnersLabel(oneBaseRunners, 0)})`,
        playText: makeSingleText(oneBaseRuns),
        outsAfter: outsBefore,
        runnersAfter: normalizeRunnersList(oneBaseRunners),
        runsScored: oneBaseRuns,
      });
    }

    // 標準外野前ヒット: 2・3塁生還、1塁→2塁
    {
      const stdRunners: LiveReportBaseNum[] = [1];
      let stdRuns = 0;
      if (has1) stdRunners.push(2);
      if (has2) stdRuns += 1;
      if (has3) stdRuns += 1;
      candidates.push({
        id: "1b_std",
        chipLabel:
          stdRuns > 0
            ? `適時ヒット (+${stdRuns}点・${formatRunnersLabel(stdRunners, 0)})`
            : `1・2塁 (${formatRunnersLabel(stdRunners, 0)})`,
        playText: makeSingleText(stdRuns),
        outsAfter: outsBefore,
        runnersAfter: normalizeRunnersList(stdRunners),
        runsScored: stdRuns,
      });
    }

    // 1塁走者が3塁まで好走塁するパターン
    if (has1) {
      const aggrRunners: LiveReportBaseNum[] = [1, 3];
      const aggrRuns = (has2 ? 1 : 0) + (has3 ? 1 : 0);
      candidates.push({
        id: "1b_1to3",
        chipLabel:
          aggrRuns > 0
            ? `1塁走者も3塁へ (+${aggrRuns}点・1.3塁)`
            : "1塁走者3塁へ (1.3塁)",
        playText: makeSingleText(aggrRuns),
        outsAfter: outsBefore,
        runnersAfter: aggrRunners,
        runsScored: aggrRuns,
      });
    }

    // 2塁走者が3塁ストップするパターン（ポテンヒット等でもよく発生）
    if (has2 && !isInfieldStyle) {
      const holdRunners: LiveReportBaseNum[] = [1, 3];
      if (has1) holdRunners.push(2);
      const holdRuns = has3 ? 1 : 0;
      candidates.push({
        id: "1b_hold3",
        chipLabel:
          holdRuns > 0
            ? `2塁走者3塁ストップ (+${holdRuns}点・${formatRunnersLabel(holdRunners, 0)})`
            : `2塁走者3塁ストップ (${formatRunnersLabel(holdRunners, 0)})`,
        playText: makeSingleText(holdRuns),
        outsAfter: outsBefore,
        runnersAfter: normalizeRunnersList(holdRunners),
        runsScored: holdRuns,
      });
    }

    return candidates;
  }

  // 6. 二塁打
  if (outcome === "double") {
    const makeDoubleText = (runs: number): string => {
      const timely = runs > 0 ? "適時" : "";
      const runStr = runs > 0 ? `${runs}点` : "";

      if (variant === "entitle_double") {
        return `${normDir}${timely}エンタイトル二塁打${runStr}`;
      }
      if (variant === "hit_poten" || dir.endsWith("浅")) {
        const cleanHead = dir.endsWith("浅")
          ? `${dir.slice(0, -1)}前`
          : normDir === "左" || normDir === "中" || normDir === "右"
          ? `${normDir}前`
          : normDir;
        return `${cleanHead}ポテン${timely}二塁打${runStr}`;
      }
      if (variant === "hit_line") {
        const lineHead = !dir
          ? "ライン際"
          : normDir.endsWith("線")
          ? normDir
          : normDir === "左" || normDir === "右" || normDir === "一" || normDir === "三"
          ? `${normDir}線`
          : `${normDir}ライン際`;
        return `${lineHead}${timely}二塁打${runStr}`;
      }
      if (variant === "hit_gap") {
        const gapHead =
          normDir === "左"
            ? "左中間破る"
            : normDir === "右"
            ? "右中間破る"
            : normDir.endsWith("破る")
            ? normDir
            : `${normDir || "外野間"}破る`;
        return `${gapHead}${timely}二塁打${runStr}`;
      }
      if (variant === "hit_over") {
        const overHead = !dir
          ? "外野越"
          : normDir.endsWith("越")
          ? normDir
          : `${normDir}越`;
        return `${overHead}${timely}二塁打${runStr}`;
      }

      if (dir === "左中" || dir === "右中" || normDir === "左中間" || normDir === "右中間") {
        return `${normDir}${timely}二塁打${runStr}`;
      }
      if (dir.endsWith("深")) {
        return `${dir.slice(0, -1)}越${timely}二塁打${runStr}`;
      }
      if (hasDetailedDirSuffix(normDir)) {
        return `${normDir}${timely}二塁打${runStr}`;
      }
      const overMark = dir === "左" || dir === "中" || dir === "右" ? "越" : "";
      return `${normDir}${overMark}${timely}二塁打${runStr}`;
    };

    if (runners.length === 0) {
      return [
        {
          id: "2b_empty",
          chipLabel: "2塁到達",
          playText: makeDoubleText(0),
          outsAfter: outsBefore,
          runnersAfter: [2],
          runsScored: 0,
        },
      ];
    }

    const candidates: SimulatedPlayCandidate[] = [];
    // 標準: 2・3塁生還、1塁→3塁（エンタイトル二塁打はこの2ベース進塁に固定）
    const stdRuns = (has2 ? 1 : 0) + (has3 ? 1 : 0);
    const stdRunners: LiveReportBaseNum[] = has1 ? [2, 3] : [2];
    candidates.push({
      id: "2b_std",
      chipLabel:
        stdRuns > 0
          ? `標準 (+${stdRuns}点・${formatRunnersLabel(stdRunners, 0)})`
          : `2.3塁 (${formatRunnersLabel(stdRunners, 0)})`,
      playText: makeDoubleText(stdRuns),
      outsAfter: outsBefore,
      runnersAfter: stdRunners,
      runsScored: stdRuns,
    });

    // 1塁走者も一気に本塁生還（エンタイトル二塁打以外）
    if (has1 && variant !== "entitle_double") {
      const allRuns = runners.length;
      candidates.push({
        id: "2b_clear",
        chipLabel: `走者一掃 (+${allRuns}点・2塁)`,
        playText: makeDoubleText(allRuns),
        outsAfter: outsBefore,
        runnersAfter: [2],
        runsScored: allRuns,
      });
    }

    return candidates;
  }

  // 7. 三塁打
  if (outcome === "triple") {
    const runs = runners.length;
    const timely = runs > 0 ? "適時" : "";
    const runStr = runs > 0 ? `${runs}点` : "";
    let cleanDir: string;
    if (variant === "hit_line") {
      cleanDir = !dir
        ? "ライン際"
        : normDir.endsWith("線")
        ? normDir
        : `${normDir}線`;
    } else if (variant === "hit_gap") {
      cleanDir =
        normDir === "左"
          ? "左中間破る"
          : normDir === "右"
          ? "右中間破る"
          : normDir.endsWith("破る")
          ? normDir
          : `${normDir || "外野間"}破る`;
    } else if (hasDetailedDirSuffix(normDir)) {
      cleanDir = normDir;
    } else if (dir === "左" || dir === "中" || dir === "右") {
      cleanDir = `${dir}越`;
    } else {
      cleanDir = normDir;
    }

    return [
      {
        id: "3b_std",
        chipLabel: runs > 0 ? `+${runs}点・3塁` : "3塁到達",
        playText: `${cleanDir}${timely}三塁打${runStr}`,
        outsAfter: outsBefore,
        runnersAfter: [3],
        runsScored: runs,
      },
    ];
  }

  // 8. 本塁打 / ランニング本塁打
  if (outcome === "homerun" || outcome === "rh_homerun") {
    const isInsidePark =
      outcome === "rh_homerun" || variant === "inside_park_hr";
    const runs = runners.length + 1;
    const cleanDir =
      variant === "hit_line"
        ? !dir
          ? "ポール際"
          : normDir.endsWith("線")
          ? normDir
          : `${normDir}線`
        : hasDetailedDirSuffix(normDir)
        ? normDir
        : !isInsidePark && (dir === "左" || dir === "中" || dir === "右")
        ? `${dir}越`
        : normDir;
    const word = isInsidePark ? "ランニング本塁打" : "本塁打";
    return [
      {
        id: "hr_std",
        chipLabel: `${runs}点${word}`,
        playText: `${cleanDir}${word}${runs}点`,
        outsAfter: outsBefore,
        runnersAfter: [],
        runsScored: runs,
      },
    ];
  }

  // 9. エラー・野選
  if (outcome === "error" && variant === "error_pass_2b") {
    const nextR: LiveReportBaseNum[] = [2];
    let runs = 0;
    for (const r of runners) {
      if (r >= 2) runs += 1;
      else nextR.push(3);
    }
    const passWord = `${normDir}後逸エラー`;
    return [
      {
        id: "error_pass_2b",
        chipLabel:
          runs > 0
            ? `+${runs}点・${formatRunnersLabel(nextR, 0)}`
            : `${formatRunnersLabel(nextR, 0)}`,
        playText: runs > 0 ? `${passWord}${runs}点` : passWord,
        outsAfter: outsBefore,
        runnersAfter: normalizeRunnersList(nextR),
        runsScored: runs,
      },
    ];
  }

  const word =
    outcome === "error"
      ? variant === "error_catch"
        ? `${normDir}捕球エラー`
        : variant === "error_throw"
        ? `${normDir}悪送球エラー`
        : variant === "error_drop"
        ? `${normDir}落球エラー`
        : `${normDir}エラー`
      : variant === "fc_home_safe"
      ? `${normDir}本塁野選`
      : variant === "fc_bunt_safe"
      ? `${normDir}バント野選`
      : `${normDir}野選`;

  const nextRunners: LiveReportBaseNum[] = [1];
  let runs = 0;
  for (const r of runners) {
    if (r === 3) runs += 1;
    else nextRunners.push((r + 1) as LiveReportBaseNum);
  }
  if (outcome === "fc" && variant === "fc_home_safe" && runs === 0 && has3) {
    runs = 1;
  }
  return [
    {
      id: `${outcome}_${variant || "std"}`,
      chipLabel:
        runs > 0
          ? `+${runs}点・${formatRunnersLabel(nextRunners, 0)}`
          : `${formatRunnersLabel(nextRunners, 0)}`,
      playText: runs > 0 ? `${word}${runs}点` : word,
      outsAfter: outsBefore,
      runnersAfter: normalizeRunnersList(nextRunners),
      runsScored: runs,
    },
  ];
}

/**
 * 🏃‍♂️ 走塁ボタン長押しフリック用の即応シミュレーション（二盗・三盗・重盗［ダブルスチール］・本盗・暴投・走塁死）
 */
export function simulateQuickBaserunningPlay(
  code: QuickBaserunningCode,
  outsBefore: number,
  runnersBefore: ReadonlyArray<LiveReportBaseNum>
): SimulatedBaserunningResult {
  const runners = normalizeRunnersList(runnersBefore);
  const has1 = runners.includes(1);
  const has2 = runners.includes(2);
  const has3 = runners.includes(3);

  if (code === "steal_2b") {
    const nextR = has1
      ? normalizeRunnersList(
          runners.map((r) => (r === 1 ? 2 : r)) as LiveReportBaseNum[]
        )
      : normalizeRunnersList([2, ...runners]);
    return {
      mode: "chained",
      playText: "二盗",
      outsAfter: outsBefore,
      runnersAfter: outsBefore >= 3 ? [] : nextR,
      runsScored: 0,
    };
  }

  if (code === "steal_3b") {
    const nextR: LiveReportBaseNum[] = has2
      ? normalizeRunnersList(
          runners.map((r) => (r === 2 ? 3 : r)) as LiveReportBaseNum[]
        )
      : has1
      ? [3]
      : normalizeRunnersList([3, ...runners]);
    return {
      mode: "chained",
      playText: "三盗",
      outsAfter: outsBefore,
      runnersAfter: outsBefore >= 3 ? [] : nextR,
      runsScored: 0,
    };
  }

  if (code === "double_steal") {
    // ダブルスチール（重盗）：1・2塁➔2・3塁、1・3塁➔2塁＆1点生還、満塁➔2・3塁＆1点生還
    const nextR: LiveReportBaseNum[] = [];
    let runs = 0;
    if (runners.length === 0) {
      nextR.push(2, 3);
    } else if (runners.length === 1 && has1) {
      nextR.push(2, 3);
    } else {
      for (const r of runners) {
        if (r === 3) runs += 1;
        else nextR.push((r + 1) as LiveReportBaseNum);
      }
    }
    return {
      mode: "chained",
      playText: runs > 0 ? `重盗${runs}点` : "重盗",
      outsAfter: outsBefore,
      runnersAfter: outsBefore >= 3 ? [] : normalizeRunnersList(nextR),
      runsScored: outsBefore >= 3 ? 0 : runs,
    };
  }

  if (code === "home_steal") {
    const rem = runners.filter((r) => r !== 3);
    const scored = outsBefore >= 3 ? 0 : 1;
    return {
      mode: "chained",
      playText: scored > 0 ? "本盗1点" : "本盗",
      outsAfter: outsBefore,
      runnersAfter: outsBefore >= 3 ? [] : rem,
      runsScored: scored,
    };
  }

  if (
    code === "delayed_steal" ||
    code === "wp_advance" ||
    code === "pb_advance" ||
    code === "balk_advance"
  ) {
    const nextR: LiveReportBaseNum[] = [];
    let runs = 0;
    for (const r of runners) {
      if (r === 3) runs += 1;
      else nextR.push((r + 1) as LiveReportBaseNum);
    }
    const baseWord =
      code === "delayed_steal"
        ? "ディレードスチール"
        : code === "wp_advance"
        ? runs > 0
          ? "暴投"
          : "暴投進塁"
        : code === "pb_advance"
        ? runs > 0
          ? "捕逸"
          : "捕逸進塁"
        : runs > 0
        ? "ボーク"
        : "ボーク進塁";
    return {
      mode: "chained",
      playText: runs > 0 ? `${baseWord}${runs}点` : baseWord,
      outsAfter: outsBefore,
      runnersAfter: outsBefore >= 3 ? [] : normalizeRunnersList(nextR),
      runsScored: outsBefore >= 3 ? 0 : runs,
    };
  }

  // アウト系（盗塁死 / 牽制死 / 飛び出し挟殺アウト）
  const nextOuts = Math.min(3, outsBefore + 1);
  let targetOutBase: LiveReportBaseNum = 1;
  if (has3 && !has1 && !has2) targetOutBase = 3;
  else if (has2 && !has1) targetOutBase = 2;
  else if (code === "rundown_out" && has2) targetOutBase = 2;

  const rem =
    nextOuts >= 3 ? [] : runners.filter((r) => r !== targetOutBase);
  const outWord =
    code === "caught_stealing"
      ? "盗塁死"
      : code === "pickoff_out"
      ? "牽制死"
      : targetOutBase === 2
      ? "二塁走者飛び出し封殺"
      : targetOutBase === 3
      ? "三塁走者飛び出し封殺"
      : "一塁走者飛び出し封殺";

  return {
    mode: "chained",
    playText: outWord,
    outsAfter: nextOuts,
    runnersAfter: rem,
    runsScored: 0,
  };
}

// =========================================================
// 6. スコアブック取込v2 スナップショット ＆ プレイログからの自動変換
// =========================================================

function mapV2AtBatToReportPlayText(ab: ScorebookV2AtBat): string {
  const raw = (ab.resultLabel || "").trim();
  const runs = ab.runsInPlay || 0;
  const runSuffix =
    runs > 0 && !raw.includes("点") ? `${runs}点` : "";

  if (raw) {
    const normalized = raw
      .replace("空振り三振", "空三振")
      .replace("見逃し三振", "見逃三振")
      .replace("見三振", "見逃三振")
      .replace("フォアボール", "四球")
      .replace("デッドボール", "死球");
    if (
      runs > 0 &&
      (ab.resultCode === "single" ||
        ab.resultCode === "double" ||
        ab.resultCode === "triple") &&
      !normalized.includes("適時")
    ) {
      return `${normalized}${runSuffix}`;
    }
    return `${normalized}${runSuffix}`;
  }

  const codeFallback: Record<string, string> = {
    single: "ヒット",
    double: "二塁打",
    triple: "三塁打",
    home_run: "本塁打",
    walk: "四球",
    intentional_walk: "敬遠四球",
    hit_by_pitch: "死球",
    sac_bunt: "送りバント",
    sac_fly: "犠飛",
    groundout: "ゴロ",
    flyout: "フライ",
    infield_fly: "インフィールドフライ",
    strikeout: "三振",
    double_play: "併殺",
    error: "エラー",
    fc: "野選",
  };
  return `${codeFallback[ab.resultCode] || "プレー"}${runSuffix}`;
}

function buildHalfInningEntriesFromScorebookSheet(
  structure: ScorebookSheetStructure,
  atBats: ReadonlyArray<ScorebookV2AtBat>,
  inning: number,
  isBottom: boolean
): LiveReportPlayEntry[] {
  const inningAtBats = atBats
    .filter((ab) => ab.inning === inning && ab.isTop === !isBottom)
    .sort((a, b) => {
      if (a.columnIndex !== b.columnIndex) return a.columnIndex - b.columnIndex;
      return 0;
    });

  const entries: LiveReportPlayEntry[] = [];

  // 投手交代イベント（相手攻撃回＝自チーム守備時の投手交代を挿入）
  if (!structure.isMyTeamBatting && structure.pitchers.length > 1) {
    for (let i = 1; i < structure.pitchers.length; i++) {
      const prevP = structure.pitchers[i - 1];
      const nextP = structure.pitchers[i];
      if (nextP.fromInning === inning) {
        entries.push({
          id: `sub-p-${inning}-${i}`,
          entryType: "substitution",
          battingOrder: 0,
          batterName: "",
          playText: "",
          reactionText: "",
          outsAfter: 0,
          runnersAfter: [],
          runsScored: 0,
          chainedPlays: [],
          eventText: `投手交代 ${formatPlayerReportName(prevP.name, true)}→${formatPlayerReportName(nextP.name, true)}`,
        });
      }
    }
  }

  let base1 = false;
  let base2 = false;
  let base3 = false;

  for (const ab of inningAtBats) {
    // 進塁データの追跡
    const fromSet = new Set<string>();
    const toAlive: LiveReportBaseNum[] = [];

    for (const adv of ab.advances || []) {
      fromSet.add(adv.from);
      if (!adv.isOut) {
        if (adv.to === "1B") toAlive.push(1);
        else if (adv.to === "2B") toAlive.push(2);
        else if (adv.to === "3B") toAlive.push(3);
      }
    }

    if (fromSet.has("1B")) base1 = false;
    if (fromSet.has("2B")) base2 = false;
    if (fromSet.has("3B")) base3 = false;

    for (const dest of toAlive) {
      if (dest === 1) base1 = true;
      if (dest === 2) base2 = true;
      if (dest === 3) base3 = true;
    }

    // advances が空だった場合の安全なフォールバック推論
    if ((!ab.advances || ab.advances.length === 0) && ab.endingOuts < 3) {
      if (
        ab.resultCode === "single" ||
        ab.resultCode === "walk" ||
        ab.resultCode === "intentional_walk" ||
        ab.resultCode === "hit_by_pitch" ||
        ab.resultCode === "error" ||
        ab.resultCode === "fc"
      ) {
        base1 = true;
      } else if (ab.resultCode === "double") {
        base2 = true;
      } else if (ab.resultCode === "triple") {
        base3 = true;
      } else if (ab.resultCode === "home_run") {
        base1 = false;
        base2 = false;
        base3 = false;
      }
    }

    const outsAfter = Math.max(0, Math.min(3, ab.endingOuts || 0));
    if (outsAfter >= 3) {
      base1 = false;
      base2 = false;
      base3 = false;
    }

    const runnersAfter: LiveReportBaseNum[] = [];
    if (base1) runnersAfter.push(1);
    if (base2) runnersAfter.push(2);
    if (base3) runnersAfter.push(3);

    entries.push({
      id: ab.id || `ab-${inning}-${isBottom ? "b" : "t"}-${entries.length + 1}`,
      entryType: "batter",
      battingOrder: ab.battingOrder || 1,
      batterName: ab.batterName || "",
      playText: mapV2AtBatToReportPlayText(ab),
      reactionText: "",
      outsAfter,
      runnersAfter,
      runsScored: ab.runsInPlay || 0,
      chainedPlays: [],
      eventText: "",
    });
  }

  return entries;
}

export function hydrateLiveReportFromScorebookSnapshot(params: {
  baseDoc: LiveReportV2Document;
  topStructure: ScorebookSheetStructure | null;
  bottomStructure: ScorebookSheetStructure | null;
  topAtBats: ReadonlyArray<ScorebookV2AtBat>;
  bottomAtBats: ReadonlyArray<ScorebookV2AtBat>;
  matchStatus?: string;
}): LiveReportV2Document {
  const { baseDoc, topStructure, bottomStructure, topAtBats, bottomAtBats } = params;
  const isMyFirst = baseDoc.battingOrder === "first";
  const myStructure = isMyFirst ? topStructure : bottomStructure;

  // 自チームスタメンの復元
  let nextLineup = baseDoc.lineup;
  if (myStructure && myStructure.batters.length > 0) {
    nextLineup = myStructure.batters.map((b, idx) => ({
      order: b.battingOrder || idx + 1,
      position: normalizeReportPositionCode(b.position),
      playerId: b.playerId || null,
      playerName: b.name || "",
      substitutions: (b.substitutions || []).map((s, sIdx) => ({
        id: s.id || `sub-${idx}-${sIdx}`,
        inning: s.inningEntered || 1,
        isBottom: !isMyFirst,
        subType: (s.subType === "PH"
          ? "PH"
          : s.subType === "PR" || s.subType === "TR"
          ? "PR"
          : "DEF") as LiveReportSubType,
        oldName: b.name || "",
        newName: s.name || "",
        newPosition: normalizeReportPositionCode(s.position || b.position),
        playerId: s.playerId || null,
      })),
    }));
  }

  const maxTopInn = Math.max(
    0,
    ...(topStructure?.innings.map((i) => i.inning) || []),
    ...topAtBats.map((a) => a.inning)
  );
  const maxBotInn = Math.max(
    0,
    ...(bottomStructure?.innings.map((i) => i.inning) || []),
    ...bottomAtBats.map((a) => a.inning)
  );
  const maxInning = Math.max(maxTopInn, maxBotInn, 1);

  const halfInnings: LiveReportHalfInning[] = [];
  for (let inn = 1; inn <= maxInning; inn++) {
    if (topStructure) {
      const entries = buildHalfInningEntriesFromScorebookSheet(
        topStructure,
        topAtBats,
        inn,
        false
      );
      const metaRuns = topStructure.innings.find((m) => m.inning === inn)?.runs;
      if (entries.length > 0 || typeof metaRuns === "number") {
        const autoSum = entries.reduce((s, e) => s + e.runsScored, 0);
        halfInnings.push({
          inning: inn,
          isBottom: false,
          entries,
          manualRunsOverride:
            typeof metaRuns === "number" && metaRuns !== autoSum ? metaRuns : null,
        });
      }
    }
    if (bottomStructure) {
      const entries = buildHalfInningEntriesFromScorebookSheet(
        bottomStructure,
        bottomAtBats,
        inn,
        true
      );
      const metaRuns = bottomStructure.innings.find((m) => m.inning === inn)?.runs;
      if (entries.length > 0 || typeof metaRuns === "number") {
        const autoSum = entries.reduce((s, e) => s + e.runsScored, 0);
        halfInnings.push({
          inning: inn,
          isBottom: true,
          entries,
          manualRunsOverride:
            typeof metaRuns === "number" && metaRuns !== autoSum ? metaRuns : null,
        });
      }
    }
  }

  const lastHalf = halfInnings[halfInnings.length - 1];
  return {
    ...baseDoc,
    lineup: nextLineup,
    halfInnings,
    activeInning: lastHalf?.inning ?? 1,
    activeIsBottom: lastHalf?.isBottom ?? false,
    isGameFinished: params.matchStatus === "finished" || baseDoc.isGameFinished,
  };
}

// =========================================================
// 7. LINE速報テキスト生成エンジン（丸数字スペース式・ズレ完全ゼロ仕様）
// =========================================================

function toFullWidthAscii(str: string): string {
  let out = "";
  for (const ch of Array.from(str)) {
    const code = ch.codePointAt(0) || 0;
    if (code === 0x20) {
      out += "　";
    } else if (code >= 0x21 && code <= 0x7e) {
      out += String.fromCodePoint(code + 0xfee0);
    } else {
      out += ch;
    }
  }
  return out;
}

function toFullWidthDigits(num: number): string {
  return String(Math.max(0, Math.trunc(num))).replace(/[0-9]/g, (d) =>
    String.fromCodePoint(0xff10 + Number(d))
  );
}

function formatCircledInning(inn: number): string {
  if (inn >= 1 && inn <= 20) {
    return String.fromCodePoint(0x2460 + inn - 1);
  }
  return toFullWidthDigits(inn);
}

function padStartFullWidth(str: string, targetChars: number): string {
  const chars = Array.from(str);
  if (chars.length >= targetChars) return str;
  return `${"　".repeat(targetChars - chars.length)}${str}`;
}

function normalizeScoreboardTeamChars(raw: string, fallback: string): string[] {
  const cleaned = toFullWidthAscii((raw || "").trim() || fallback);
  const chars = Array.from(cleaned);
  if (chars.length === 1) {
    return ["　", chars[0], "　"];
  }
  if (chars.length === 2) {
    return [chars[0], "　", chars[1]];
  }
  return chars;
}

export function formatScoreboardBlock(
  doc: LiveReportV2Document,
  summary: CumulativeScoreSummary
): string {
  const fChars = normalizeScoreboardTeamChars(doc.firstTeamShortName, "先　攻");
  const sChars = normalizeScoreboardTeamChars(doc.secondTeamShortName, "後　攻");

  const labelWidth = Math.max(fChars.length, sChars.length, 3);
  const fPadded = `${fChars.join("")}${"　".repeat(
    Math.max(0, labelWidth - fChars.length)
  )}`;
  const sPadded = `${sChars.join("")}${"　".repeat(
    Math.max(0, labelWidth - sChars.length)
  )}`;
  const headerLabel = `回${"　".repeat(Math.max(1, labelWidth - 2))}数`;

  const inningHeaders: string[] = [];
  const fCells: string[] = [];
  const sCells: string[] = [];

  for (let i = 0; i < summary.maxInning; i++) {
    const inn = i + 1;
    const hRaw = formatCircledInning(inn);

    const fs = summary.firstInningScores[i];
    const ss = summary.secondInningScores[i];

    const fRaw = fs !== null && fs !== undefined ? toFullWidthDigits(fs) : "－";

    const isUnplayedFinalBottom =
      doc.isGameFinished &&
      inn >= doc.regulationInnings &&
      fs !== null &&
      ss === null &&
      summary.secondTotal > summary.firstTotal;

    const sRaw =
      ss !== null && ss !== undefined
        ? toFullWidthDigits(ss)
        : isUnplayedFinalBottom && doc.showWalkoffX
        ? "ｘ"
        : "－";

    const colWidth = Math.max(
      Array.from(hRaw).length,
      Array.from(fRaw).length,
      Array.from(sRaw).length
    );

    inningHeaders.push(padStartFullWidth(hRaw, colWidth));
    fCells.push(padStartFullWidth(fRaw, colWidth));
    sCells.push(padStartFullWidth(sRaw, colWidth));
  }

  const fTotalRaw = toFullWidthDigits(summary.firstTotal);
  const sTotalRaw = toFullWidthDigits(summary.secondTotal);
  const totalWidth = Math.max(
    Array.from(fTotalRaw).length,
    Array.from(sTotalRaw).length
  );
  const totalHeader =
    totalWidth <= 1 ? "計" : padStartFullWidth("合計", totalWidth);
  const fTotalPadded = padStartFullWidth(fTotalRaw, totalWidth);
  const sTotalPadded = padStartFullWidth(sTotalRaw, totalWidth);

  const headerLine = `${headerLabel}｜${inningHeaders.join(" ")}｜${totalHeader}`;
  const firstLine = `${fPadded}｜${fCells.join(" ")}｜${fTotalPadded}`;
  const secondLine = `${sPadded}｜${sCells.join(" ")}｜${sTotalPadded}`;

  return `${headerLine}\n${firstLine}\n${secondLine}`;
}

export function formatStartingLineupBlock(doc: LiveReportV2Document): string {
  const filledSlots = doc.lineup.filter(
    (s) => (s.playerName || "").trim().length > 0
  );
  if (filledSlots.length === 0) return "";

  return doc.lineup
    .map((slot) => {
      const pos = normalizeReportPositionCode(slot.position);
      const baseName = formatPlayerReportName(
        slot.playerName,
        doc.showSurnameOnly
      );
      if (!baseName) return `${slot.order}.${pos}`;

      if (!doc.appendSubsToTopLineup || slot.substitutions.length === 0) {
        return `${slot.order}.${pos} ${baseName}`;
      }

      const subTrail = slot.substitutions
        .filter((s) => s.newName.trim().length > 0)
        .map(
          (s) =>
            `→${formatPlayerReportName(s.newName, doc.showSurnameOnly)}(${
              s.inning
            }${s.isBottom ? "裏" : "表"})`
        )
        .join("");

      return `${slot.order}.${pos} ${baseName}${subTrail}`;
    })
    .join("\n");
}

export function formatSinglePlayEntryLine(
  entry: LiveReportPlayEntry,
  isMyTeamAttack: boolean,
  showSurnameOnly: boolean
): string {
  if (entry.entryType !== "batter") {
    return entry.eventText.trim();
  }

  const orderPrefix = `${entry.battingOrder}.`;
  const batterName = isMyTeamAttack
    ? formatPlayerReportName(entry.batterName, showSurnameOnly)
    : "";
  const nameSegment = batterName ? `${batterName}　` : "";

  const playCore = (entry.playText || "").trim();
  const reaction = (entry.reactionText || "").trim();
  const mainAction =
    reaction.length > 0
      ? /^[❗️‼️!！✨🔥⚾️]+/.test(reaction)
        ? `${playCore}${reaction}`
        : `${playCore}　${reaction}`
      : playCore;

  const stateSuffix = formatOutsAndRunnersSuffix(
    entry.outsAfter,
    entry.runnersAfter
  );

  let line = `${orderPrefix}${nameSegment}${mainAction}`;
  if (stateSuffix) {
    line += `　${stateSuffix}`;
  }

  if (entry.chainedPlays && entry.chainedPlays.length > 0) {
    for (const cp of entry.chainedPlays) {
      const cpState = formatOutsAndRunnersSuffix(cp.outsAfter, cp.runnersAfter);
      const cpPart = cpState ? `${cp.playText}　${cpState}` : cp.playText;
      line += `　${cpPart}`;
    }
  }

  return line;
}

export function formatHalfInningsPlayByPlay(
  doc: LiveReportV2Document,
  options?: {
    onlyInning?: number;
    onlyIsBottom?: boolean;
  }
): string {
  const sortedHalves = [...doc.halfInnings]
    .filter((h) => h.entries.length > 0 || h.manualRunsOverride !== null)
    .sort((a, b) =>
      compareHalfInningOrder(a.inning, a.isBottom, b.inning, b.isBottom)
    );

  if (sortedHalves.length === 0) return "";

  let runningFirst = 0;
  let runningSecond = 0;
  const blocks: string[] = [];

  for (const half of sortedHalves) {
    const runs = getHalfInningRuns(half);
    if (!half.isBottom) {
      runningFirst += runs;
    } else {
      runningSecond += runs;
    }

    const matchesFilter =
      options?.onlyInning === undefined
        ? true
        : half.inning === options.onlyInning &&
          (options.onlyIsBottom === undefined ||
            half.isBottom === options.onlyIsBottom);

    if (!matchesFilter) continue;

    const isMyAttack = isMyTeamBattingHalf(doc.battingOrder, half.isBottom);
    const header = `${half.inning}回${half.isBottom ? "裏" : "表"}`;
    const lines = half.entries
      .map((e) => formatSinglePlayEntryLine(e, isMyAttack, doc.showSurnameOnly))
      .filter((l) => l.length > 0);

    const body = lines.length > 0 ? `${lines.join("\n")}\n` : "";
    blocks.push(`${header}\n${body}得点${runs}\n${runningFirst}-${runningSecond}`);
  }

  return blocks.join("\n\n");
}

export function formatLiveReportText(
  doc: LiveReportV2Document,
  mode: LiveReportOutputMode
): string {
  const headerLines: string[] = [];
  if (doc.dateText.trim()) headerLines.push(doc.dateText.trim());
  if (doc.tournamentText.trim()) headerLines.push(doc.tournamentText.trim());

  const oppPart = doc.opponentName.trim() ? `対${doc.opponentName.trim()}` : "";
  const venuePart = doc.venueName.trim() ? `@${doc.venueName.trim()}` : "";
  if (oppPart || venuePart) {
    headerLines.push(`${oppPart}${venuePart}`);
  }

  const headerBlock = headerLines.join("\n");
  const isEndMode = mode === "game_set" || (mode === "full" && doc.isGameFinished);
  const timeBlock =
    mode === "lineup"
      ? doc.startTime.trim()
        ? `開始時間　${doc.startTime.trim()}`
        : ""
      : `開始時間　${doc.startTime.trim()}\n終了時間    ${
          isEndMode || doc.endTime.trim() ? doc.endTime.trim() : ""
        }`;

  const lineupBlock = formatStartingLineupBlock(doc);
  const reporterBlock = doc.reporterNames.trim()
    ? `速報　${doc.reporterNames.trim()}`
    : "";

  // ① スタメン発表モード
  if (mode === "lineup") {
    const sections = [
      headerBlock,
      timeBlock,
      lineupBlock,
      "プレイボール⚾️",
      reporterBlock,
    ].filter((s) => s.length > 0);
    return sections.join("\n\n");
  }

  // ② 直近イニングのみ切り出しモード
  if (mode === "latest_inning") {
    const nonEmpty = [...doc.halfInnings]
      .filter((h) => h.entries.length > 0 || h.manualRunsOverride !== null)
      .sort((a, b) =>
        compareHalfInningOrder(a.inning, a.isBottom, b.inning, b.isBottom)
      );
    const targetHalf =
      doc.halfInnings.find(
        (h) =>
          h.inning === doc.activeInning &&
          h.isBottom === doc.activeIsBottom &&
          (h.entries.length > 0 || h.manualRunsOverride !== null)
      ) || nonEmpty[nonEmpty.length - 1];

    if (!targetHalf) {
      return [headerBlock, "（まだイニング記録がありません）", reporterBlock]
        .filter(Boolean)
        .join("\n\n");
    }

    const summary = computeScoreboardSummary(
      doc,
      targetHalf.inning,
      targetHalf.isBottom
    );
    const playBlock = formatHalfInningsPlayByPlay(doc, {
      onlyInning: targetHalf.inning,
      onlyIsBottom: targetHalf.isBottom,
    });
    const miniTitle = `【${targetHalf.inning}回${
      targetHalf.isBottom ? "裏" : "表"
    }速報】${doc.firstTeamShortName.replace(/\s+/g, "")} ${
      summary.firstTotal
    }-${summary.secondTotal} ${doc.secondTeamShortName.replace(/\s+/g, "")}`;

    return [miniTitle, playBlock, reporterBlock].filter(Boolean).join("\n\n");
  }

  // ③ 全文積み上げモード / 試合終了全文モード（ユーザー提示サンプル完全準拠）
  const summary = computeScoreboardSummary(doc);
  const scoreboardBlock = formatScoreboardBlock(doc, summary);
  const playByPlayBlock = formatHalfInningsPlayByPlay(doc);

  const chunks: string[] = [];
  if (headerBlock) chunks.push(headerBlock);
  if (timeBlock) chunks.push(timeBlock);
  chunks.push(scoreboardBlock);
  if (lineupBlock) chunks.push(lineupBlock);
  chunks.push("\nプレイボール⚾️\n");
  if (playByPlayBlock) chunks.push(playByPlayBlock);

  if (isEndMode) {
    const scoreLine = `${summary.firstTotal}-${summary.secondTotal}${doc.closingComment.trim()}`;
    chunks.push(`\nゲームセット\n${scoreLine}\n`);
  }

  if (reporterBlock) {
    chunks.push(reporterBlock);
  }

  return chunks
    .join("\n\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

// =========================================================
// 8. 安全なJSON復元 ＆ 既存プレイログ・イニング得点からの補完
// =========================================================

export interface LegacyPlayLogRow {
  id: string;
  inningText: string;
  resultType: string;
  description: string;
}

export function hydrateLiveReportFromLegacyLogsAndScores(params: {
  baseDoc: LiveReportV2Document;
  playLogs: ReadonlyArray<LegacyPlayLogRow>;
  myInningScores: ReadonlyArray<number>;
  opponentInningScores: ReadonlyArray<number>;
  matchStatus?: string;
}): LiveReportV2Document {
  const {
    baseDoc,
    playLogs,
    myInningScores,
    opponentInningScores,
    matchStatus,
  } = params;

  const isMyFirst = baseDoc.battingOrder === "first";
  const firstScores = isMyFirst ? myInningScores : opponentInningScores;
  const secondScores = isMyFirst ? opponentInningScores : myInningScores;

  const halfMap = new Map<string, LiveReportHalfInning>();
  const ensureHalf = (inning: number, isBottom: boolean): LiveReportHalfInning => {
    const key = `${inning}-${isBottom ? "b" : "t"}`;
    const existing = halfMap.get(key);
    if (existing) return existing;
    const created: LiveReportHalfInning = {
      inning,
      isBottom,
      entries: [],
      manualRunsOverride: null,
    };
    halfMap.set(key, created);
    return created;
  };

  for (const log of playLogs) {
    const innMatch = (log.inningText || "").match(/(\d+)回(表|裏)/);
    if (!innMatch) continue;
    const inn = Number(innMatch[1]) || 1;
    const isBottom = innMatch[2] === "裏";
    const half = ensureHalf(inn, isBottom);

    const bsoMatch = (log.description || "").match(
      /\[B:\d+,\s*S:\d+,\s*O:(\d+)\]$/
    );
    const outsAfter = bsoMatch ? Math.min(3, Number(bsoMatch[1]) || 0) : 0;
    const cleanDesc = (log.description || "")
      .replace(/\s*\[B:\d+,\s*S:\d+,\s*O:\d+\]$/, "")
      .trim();

    if (
      !cleanDesc ||
      cleanDesc === "ボール" ||
      cleanDesc === "空振り" ||
      cleanDesc === "見逃しストライク" ||
      cleanDesc === "ファウル" ||
      cleanDesc.includes("イニング交代") ||
      cleanDesc === "プレイボール" ||
      cleanDesc === "試合終了" ||
      cleanDesc === "ゲームセット"
    ) {
      continue;
    }

    if (cleanDesc.includes("選手交代")) {
      const subMatch = cleanDesc.match(
        /選手交代\[(.+?)\]:\s*(\d+)番\s*(.+?)\s*➔\s*(.+)/
      );
      if (subMatch && subMatch[1] === "自チーム") {
        half.entries.push({
          id: log.id || `sub-${inn}-${half.entries.length}`,
          entryType: "substitution",
          battingOrder: 0,
          batterName: "",
          playText: "",
          reactionText: "",
          outsAfter,
          runnersAfter: [],
          runsScored: 0,
          chainedPlays: [],
          eventText: `選手交代 ${formatPlayerReportName(
            subMatch[3],
            true
          )}→${formatPlayerReportName(subMatch[4], true)}`,
        });
      }
      continue;
    }

    const abMatch = cleanDesc.match(/^(\d+)番\s*([^:]*?)\s*:\s*(.+)$/);
    if (abMatch) {
      const order = Number(abMatch[1]) || 1;
      const name = abMatch[2].trim();
      const rawPlay = abMatch[3]
        .trim()
        .replace("空振り三振", "空三振")
        .replace("見逃し三振", "見逃三振")
        .replace("フォアボール", "四球")
        .replace("デッドボール", "死球");

      if (
        rawPlay === "ボール" ||
        rawPlay === "空振り" ||
        rawPlay === "見逃しストライク" ||
        rawPlay === "ファウル"
      ) {
        continue;
      }

      const runnersAfter: LiveReportBaseNum[] = [];
      if (outsAfter < 3) {
        if (
          rawPlay.includes("安") ||
          rawPlay.includes("ヒット") ||
          rawPlay.includes("四球") ||
          rawPlay.includes("死球") ||
          rawPlay.includes("失") ||
          rawPlay.includes("エラー") ||
          rawPlay.includes("野選")
        ) {
          runnersAfter.push(1);
        } else if (rawPlay.includes("二塁打")) {
          runnersAfter.push(2);
        } else if (rawPlay.includes("三塁打")) {
          runnersAfter.push(3);
        }
      }

      const rbiMatch = rawPlay.match(/(\d+)点/);
      const runsScored = rbiMatch ? Number(rbiMatch[1]) || 0 : 0;

      half.entries.push({
        id: log.id || `lg-${inn}-${half.entries.length}`,
        entryType: "batter",
        battingOrder: order,
        batterName: name === "打者" ? "" : name,
        playText: rawPlay,
        reactionText: "",
        outsAfter,
        runnersAfter,
        runsScored,
        chainedPlays: [],
        eventText: "",
      });
    }
  }

  const maxScoreInn = Math.max(firstScores.length, secondScores.length);
  for (let i = 0; i < maxScoreInn; i++) {
    const inn = i + 1;
    if (typeof firstScores[i] === "number") {
      const th = ensureHalf(inn, false);
      const autoRuns = th.entries.reduce((s, e) => s + e.runsScored, 0);
      if (th.entries.length === 0 || autoRuns !== firstScores[i]) {
        th.manualRunsOverride = firstScores[i];
      }
    }
    if (typeof secondScores[i] === "number") {
      const bh = ensureHalf(inn, true);
      const autoRuns = bh.entries.reduce((s, e) => s + e.runsScored, 0);
      if (bh.entries.length === 0 || autoRuns !== secondScores[i]) {
        bh.manualRunsOverride = secondScores[i];
      }
    }
  }

  const halfInnings = Array.from(halfMap.values()).sort((a, b) =>
    compareHalfInningOrder(a.inning, a.isBottom, b.inning, b.isBottom)
  );
  const lastHalf = halfInnings[halfInnings.length - 1];

  return {
    ...baseDoc,
    halfInnings,
    activeInning: lastHalf?.inning ?? 1,
    activeIsBottom: lastHalf?.isBottom ?? false,
    isGameFinished: matchStatus === "finished" || baseDoc.isGameFinished,
  };
}

export function sanitizeLiveReportDocument(
  raw: unknown,
  fallbackTeamName = "自チーム"
): LiveReportV2Document | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 2) return null;

  const fallback = createInitialLiveReportDocument({
    myTeamName: fallbackTeamName,
  });

  const lineupRaw = Array.isArray(obj.lineup) ? obj.lineup : fallback.lineup;
  const lineup: LiveReportLineupSlot[] = lineupRaw.map((item, idx) => {
    const s = (item || {}) as Record<string, unknown>;
    const subsRaw = Array.isArray(s.substitutions) ? s.substitutions : [];
    return {
      order: typeof s.order === "number" ? s.order : idx + 1,
      position:
        typeof s.position === "string"
          ? normalizeReportPositionCode(s.position)
          : String(idx + 1 <= 9 ? idx + 1 : "D"),
      playerId: typeof s.playerId === "string" ? s.playerId : null,
      playerName: typeof s.playerName === "string" ? s.playerName : "",
      substitutions: subsRaw.map((sr, sIdx) => {
        const sub = (sr || {}) as Record<string, unknown>;
        const st = sub.subType;
        return {
          id: typeof sub.id === "string" ? sub.id : `sub-${idx}-${sIdx}`,
          inning: typeof sub.inning === "number" ? sub.inning : 1,
          isBottom: Boolean(sub.isBottom),
          subType:
            st === "P" || st === "PH" || st === "PR" || st === "DEF"
              ? st
              : "DEF",
          oldName: typeof sub.oldName === "string" ? sub.oldName : "",
          newName: typeof sub.newName === "string" ? sub.newName : "",
          newPosition:
            typeof sub.newPosition === "string" ? sub.newPosition : "",
          playerId: typeof sub.playerId === "string" ? sub.playerId : null,
        };
      }),
    };
  });

  const halvesRaw = Array.isArray(obj.halfInnings) ? obj.halfInnings : [];
  const halfInnings: LiveReportHalfInning[] = halvesRaw.map((hr) => {
    const h = (hr || {}) as Record<string, unknown>;
    const entriesRaw = Array.isArray(h.entries) ? h.entries : [];
    const entries: LiveReportPlayEntry[] = entriesRaw.map((er, eIdx) => {
      const e = (er || {}) as Record<string, unknown>;
      const et = e.entryType;
      const chainsRaw = Array.isArray(e.chainedPlays) ? e.chainedPlays : [];
      const chainedPlays: LiveReportChainedPlay[] = chainsRaw.map(
        (cr, cIdx) => {
          const c = (cr || {}) as Record<string, unknown>;
          return {
            id: typeof c.id === "string" ? c.id : `cp-${eIdx}-${cIdx}`,
            playText: typeof c.playText === "string" ? c.playText : "",
            outsAfter:
              typeof c.outsAfter === "number"
                ? Math.max(0, Math.min(3, c.outsAfter))
                : 0,
            runnersAfter: Array.isArray(c.runnersAfter)
              ? normalizeRunnersList(c.runnersAfter as number[])
              : [],
            runsScored: typeof c.runsScored === "number" ? c.runsScored : 0,
          };
        }
      );
      return {
        id: typeof e.id === "string" ? e.id : `ent-${eIdx}`,
        entryType:
          et === "batter" || et === "substitution" || et === "note"
            ? et
            : "batter",
        battingOrder: typeof e.battingOrder === "number" ? e.battingOrder : 1,
        batterName: typeof e.batterName === "string" ? e.batterName : "",
        playText: typeof e.playText === "string" ? e.playText : "",
        reactionText: typeof e.reactionText === "string" ? e.reactionText : "",
        outsAfter:
          typeof e.outsAfter === "number"
            ? Math.max(0, Math.min(3, e.outsAfter))
            : 0,
        runnersAfter: Array.isArray(e.runnersAfter)
          ? normalizeRunnersList(e.runnersAfter as number[])
          : [],
        runsScored: typeof e.runsScored === "number" ? e.runsScored : 0,
        chainedPlays,
        eventText: typeof e.eventText === "string" ? e.eventText : "",
      };
    });

    return {
      inning: typeof h.inning === "number" ? h.inning : 1,
      isBottom: Boolean(h.isBottom),
      entries,
      manualRunsOverride:
        typeof h.manualRunsOverride === "number" ? h.manualRunsOverride : null,
    };
  });

  return {
    version: 2,
    matchId: typeof obj.matchId === "string" ? obj.matchId : null,
    dateText:
      typeof obj.dateText === "string" ? obj.dateText : fallback.dateText,
    tournamentText:
      typeof obj.tournamentText === "string" ? obj.tournamentText : "",
    opponentName:
      typeof obj.opponentName === "string" ? obj.opponentName : "",
    venueName: typeof obj.venueName === "string" ? obj.venueName : "",
    startTime: typeof obj.startTime === "string" ? obj.startTime : "",
    endTime: typeof obj.endTime === "string" ? obj.endTime : "",
    battingOrder: obj.battingOrder === "second" ? "second" : "first",
    regulationInnings:
      typeof obj.regulationInnings === "number" ? obj.regulationInnings : 7,
    firstTeamShortName:
      typeof obj.firstTeamShortName === "string"
        ? obj.firstTeamShortName
        : fallback.firstTeamShortName,
    secondTeamShortName:
      typeof obj.secondTeamShortName === "string"
        ? obj.secondTeamShortName
        : fallback.secondTeamShortName,
    showSurnameOnly:
      typeof obj.showSurnameOnly === "boolean" ? obj.showSurnameOnly : true,
    appendSubsToTopLineup: Boolean(obj.appendSubsToTopLineup),
    showWalkoffX: Boolean(obj.showWalkoffX),
    lineup: lineup.length > 0 ? lineup : createDefaultEmptyLineup(9),
    halfInnings,
    activeInning: typeof obj.activeInning === "number" ? obj.activeInning : 1,
    activeIsBottom: Boolean(obj.activeIsBottom),
    nextMyOrder: typeof obj.nextMyOrder === "number" ? obj.nextMyOrder : 1,
    nextOpponentOrder:
      typeof obj.nextOpponentOrder === "number" ? obj.nextOpponentOrder : 1,
    isGameFinished: Boolean(obj.isGameFinished),
    closingComment:
      typeof obj.closingComment === "string" ? obj.closingComment : "",
    reporterNames:
      typeof obj.reporterNames === "string" ? obj.reporterNames : "",
  };
}

// =========================================================
// 8. 3-Way 共同編集マージエンジン（方式B：ロック不要・先祖返り防止）
// =========================================================

function isSameRunnersArray(
  a: ReadonlyArray<LiveReportBaseNum>,
  b: ReadonlyArray<LiveReportBaseNum>
): boolean {
  const na = normalizeRunnersList(a);
  const nb = normalizeRunnersList(b);
  if (na.length !== nb.length) return false;
  for (let i = 0; i < na.length; i++) {
    if (na[i] !== nb[i]) return false;
  }
  return true;
}

function isSameChainedPlay(
  a: LiveReportChainedPlay,
  b: LiveReportChainedPlay
): boolean {
  return (
    a.id === b.id &&
    a.playText === b.playText &&
    a.outsAfter === b.outsAfter &&
    a.runsScored === b.runsScored &&
    isSameRunnersArray(a.runnersAfter, b.runnersAfter)
  );
}

function isSamePlayEntry(
  a: LiveReportPlayEntry,
  b: LiveReportPlayEntry
): boolean {
  if (
    a.id !== b.id ||
    a.entryType !== b.entryType ||
    a.battingOrder !== b.battingOrder ||
    a.batterName !== b.batterName ||
    a.playText !== b.playText ||
    a.reactionText !== b.reactionText ||
    a.outsAfter !== b.outsAfter ||
    a.runsScored !== b.runsScored ||
    a.eventText !== b.eventText ||
    !isSameRunnersArray(a.runnersAfter, b.runnersAfter) ||
    a.chainedPlays.length !== b.chainedPlays.length
  ) {
    return false;
  }
  for (let i = 0; i < a.chainedPlays.length; i++) {
    if (!isSameChainedPlay(a.chainedPlays[i], b.chainedPlays[i])) {
      return false;
    }
  }
  return true;
}

function isSameSubRecord(
  a: LiveReportLineupSubRecord,
  b: LiveReportLineupSubRecord
): boolean {
  return (
    a.id === b.id &&
    a.inning === b.inning &&
    a.isBottom === b.isBottom &&
    a.subType === b.subType &&
    a.oldName === b.oldName &&
    a.newName === b.newName &&
    a.newPosition === b.newPosition &&
    a.playerId === b.playerId
  );
}

function isSameLineupSlot(
  a: LiveReportLineupSlot,
  b: LiveReportLineupSlot
): boolean {
  if (
    a.order !== b.order ||
    a.position !== b.position ||
    a.playerId !== b.playerId ||
    a.playerName !== b.playerName ||
    a.substitutions.length !== b.substitutions.length
  ) {
    return false;
  }
  for (let i = 0; i < a.substitutions.length; i++) {
    if (!isSameSubRecord(a.substitutions[i], b.substitutions[i])) {
      return false;
    }
  }
  return true;
}

function pickScalar3Way<T>(
  baseVal: T | undefined,
  remoteVal: T,
  localVal: T,
  hasBase: boolean
): T {
  if (hasBase && baseVal !== undefined) {
    return localVal !== baseVal ? localVal : remoteVal;
  }
  if (typeof remoteVal === "string" && typeof localVal === "string") {
    if (!remoteVal.trim() && localVal.trim()) {
      return localVal;
    }
    return remoteVal;
  }
  return remoteVal;
}

function mergeReporterNames3Way(
  baseVal: string | undefined,
  remoteVal: string,
  localVal: string,
  hasBase: boolean
): string {
  const splitNames = (raw: string): string[] =>
    raw
      .split(/[、,，／/\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

  if (hasBase && baseVal !== undefined) {
    const rChanged = remoteVal.trim() !== baseVal.trim();
    const lChanged = localVal.trim() !== baseVal.trim();
    if (lChanged && !rChanged) return localVal;
    if (!lChanged && rChanged) return remoteVal;
    if (lChanged && rChanged) {
      if (!localVal.trim()) return "";
      if (!remoteVal.trim()) return localVal;
      const merged = Array.from(
        new Set([...splitNames(remoteVal), ...splitNames(localVal)])
      );
      return merged.join("、");
    }
    return remoteVal;
  }

  if (!remoteVal.trim()) return localVal;
  if (!localVal.trim()) return remoteVal;
  if (remoteVal.trim() === localVal.trim()) return remoteVal;
  const merged = Array.from(
    new Set([...splitNames(remoteVal), ...splitNames(localVal)])
  );
  return merged.join("、");
}

function mergeSlotSubstitutions(
  baseSubs: ReadonlyArray<LiveReportLineupSubRecord> | null,
  remoteSubs: ReadonlyArray<LiveReportLineupSubRecord>,
  localSubs: ReadonlyArray<LiveReportLineupSubRecord>
): LiveReportLineupSubRecord[] {
  const bMap = new Map((baseSubs || []).map((s) => [s.id, s]));
  const rMap = new Map(remoteSubs.map((s) => [s.id, s]));
  const lMap = new Map(localSubs.map((s) => [s.id, s]));

  const merged: LiveReportLineupSubRecord[] = [];
  const remoteNewFingerprints = new Set<string>();

  const toFingerprint = (s: LiveReportLineupSubRecord): string =>
    `${s.inning}-${s.isBottom ? "B" : "T"}-${s.subType}-${s.newName.trim()}-${s.newPosition}`;

  for (const rSub of remoteSubs) {
    const bSub = bMap.get(rSub.id);
    const lSub = lMap.get(rSub.id);
    if (bSub && !lSub) {
      // ローカル側で削除された交代レコード（リモート未変更なら削除を反映）
      if (isSameSubRecord(bSub, rSub)) continue;
      merged.push(rSub);
    } else if (bSub && lSub) {
      merged.push(isSameSubRecord(bSub, lSub) ? rSub : lSub);
    } else if (!bSub && lSub) {
      merged.push(lSub);
    } else {
      merged.push(rSub);
      remoteNewFingerprints.add(toFingerprint(rSub));
    }
  }

  for (const lSub of localSubs) {
    if (bMap.has(lSub.id) || rMap.has(lSub.id)) continue;
    if (remoteNewFingerprints.has(toFingerprint(lSub))) continue;
    merged.push(lSub);
  }

  return merged.sort((a, b) =>
    compareHalfInningOrder(a.inning, a.isBottom, b.inning, b.isBottom)
  );
}

function mergeLineupSlots3Way(
  baseLineup: ReadonlyArray<LiveReportLineupSlot> | null,
  remoteLineup: ReadonlyArray<LiveReportLineupSlot>,
  localLineup: ReadonlyArray<LiveReportLineupSlot>,
  hasBase: boolean
): LiveReportLineupSlot[] {
  const bMap = new Map((baseLineup || []).map((s) => [s.order, s]));
  const rMap = new Map(remoteLineup.map((s) => [s.order, s]));
  const lMap = new Map(localLineup.map((s) => [s.order, s]));

  const orderSet = new Set<number>();
  for (const s of remoteLineup) orderSet.add(s.order);
  for (const s of localLineup) orderSet.add(s.order);
  for (let ord = 1; ord <= 9; ord++) orderSet.add(ord);

  const sortedOrders = Array.from(orderSet).sort((a, b) => a - b);
  const result: LiveReportLineupSlot[] = [];

  for (const order of sortedOrders) {
    const bSlot = bMap.get(order);
    const rSlot = rMap.get(order);
    const lSlot = lMap.get(order);

    // 10番以降（DH/全員打ち追加枠）の削除伝播
    if (order > 9 && hasBase) {
      if (bSlot && !lSlot && rSlot && isSameLineupSlot(bSlot, rSlot)) {
        continue;
      }
      if (bSlot && !rSlot && lSlot && isSameLineupSlot(bSlot, lSlot)) {
        continue;
      }
    }

    const fallbackPos = String(order <= 9 ? order : "D");
    let position = rSlot?.position ?? lSlot?.position ?? fallbackPos;
    let playerName = rSlot?.playerName ?? lSlot?.playerName ?? "";
    let playerId = rSlot?.playerId ?? lSlot?.playerId ?? null;

    if (hasBase && bSlot) {
      if (lSlot && lSlot.position !== bSlot.position) {
        position = lSlot.position;
      }
      const localChangedName = lSlot !== undefined && lSlot.playerName !== bSlot.playerName;
      const localChangedId = lSlot !== undefined && lSlot.playerId !== bSlot.playerId;
      if (localChangedName || localChangedId) {
        playerName = lSlot?.playerName ?? "";
        playerId = lSlot?.playerId ?? null;
      }
    } else if (!rSlot?.playerName.trim() && lSlot?.playerName.trim()) {
      position = lSlot.position;
      playerName = lSlot.playerName;
      playerId = lSlot.playerId;
    }

    const substitutions = mergeSlotSubstitutions(
      bSlot?.substitutions ?? null,
      rSlot?.substitutions ?? [],
      lSlot?.substitutions ?? []
    );

    result.push({
      order,
      position,
      playerId,
      playerName,
      substitutions,
    });
  }

  return result.length > 0 ? result : createDefaultEmptyLineup(9);
}

function mergeChainedPlays3Way(
  baseChains: ReadonlyArray<LiveReportChainedPlay> | null,
  remoteChains: ReadonlyArray<LiveReportChainedPlay>,
  localChains: ReadonlyArray<LiveReportChainedPlay>
): LiveReportChainedPlay[] {
  const bMap = new Map((baseChains || []).map((c) => [c.id, c]));
  const rMap = new Map(remoteChains.map((c) => [c.id, c]));
  const lMap = new Map(localChains.map((c) => [c.id, c]));

  const merged: LiveReportChainedPlay[] = [];
  const remoteNewKeys = new Set<string>();
  const toKey = (c: LiveReportChainedPlay) =>
    `${c.playText.trim()}__${c.outsAfter}__${c.runsScored}`;

  for (const rChain of remoteChains) {
    const bChain = bMap.get(rChain.id);
    const lChain = lMap.get(rChain.id);
    if (bChain && !lChain) {
      if (isSameChainedPlay(bChain, rChain)) continue;
      merged.push(rChain);
    } else if (bChain && lChain) {
      merged.push(isSameChainedPlay(bChain, lChain) ? rChain : lChain);
    } else if (!bChain && lChain) {
      merged.push(lChain);
    } else {
      merged.push(rChain);
      remoteNewKeys.add(toKey(rChain));
    }
  }

  for (const lChain of localChains) {
    if (bMap.has(lChain.id) || rMap.has(lChain.id)) continue;
    if (remoteNewKeys.has(toKey(lChain))) continue;
    merged.push(lChain);
  }

  return merged;
}

function mergeReactionText3Way(
  baseText: string | undefined,
  remoteText: string,
  localText: string,
  hasBase: boolean
): string {
  if (hasBase && baseText !== undefined) {
    const rChanged = remoteText !== baseText;
    const lChanged = localText !== baseText;
    if (lChanged && !rChanged) return localText;
    if (!lChanged && rChanged) return remoteText;
    if (lChanged && rChanged) {
      if (!localText.trim()) return "";
      if (!remoteText.trim()) return localText;
      if (localText.includes(remoteText)) return localText;
      if (remoteText.includes(localText)) return remoteText;
      return localText;
    }
    return remoteText;
  }
  if (!remoteText.trim()) return localText;
  if (!localText.trim()) return remoteText;
  if (localText.includes(remoteText)) return localText;
  if (remoteText.includes(localText)) return remoteText;
  return remoteText;
}

function mergeExistingPlayEntry3Way(
  baseEnt: LiveReportPlayEntry | null,
  remoteEnt: LiveReportPlayEntry,
  localEnt: LiveReportPlayEntry
): LiveReportPlayEntry {
  const hasBase = baseEnt !== null;

  const localChangedSituation = hasBase
    ? localEnt.outsAfter !== baseEnt.outsAfter ||
      localEnt.runsScored !== baseEnt.runsScored ||
      !isSameRunnersArray(localEnt.runnersAfter, baseEnt.runnersAfter)
    : false;

  const outsAfter = localChangedSituation
    ? localEnt.outsAfter
    : remoteEnt.outsAfter;
  const runnersAfter = localChangedSituation
    ? normalizeRunnersList(localEnt.runnersAfter)
    : normalizeRunnersList(remoteEnt.runnersAfter);
  const runsScored = localChangedSituation
    ? localEnt.runsScored
    : remoteEnt.runsScored;

  return {
    id: remoteEnt.id,
    entryType: pickScalar3Way(
      baseEnt?.entryType,
      remoteEnt.entryType,
      localEnt.entryType,
      hasBase
    ),
    battingOrder: pickScalar3Way(
      baseEnt?.battingOrder,
      remoteEnt.battingOrder,
      localEnt.battingOrder,
      hasBase
    ),
    batterName: pickScalar3Way(
      baseEnt?.batterName,
      remoteEnt.batterName,
      localEnt.batterName,
      hasBase
    ),
    playText: pickScalar3Way(
      baseEnt?.playText,
      remoteEnt.playText,
      localEnt.playText,
      hasBase
    ),
    reactionText: mergeReactionText3Way(
      baseEnt?.reactionText,
      remoteEnt.reactionText,
      localEnt.reactionText,
      hasBase
    ),
    outsAfter,
    runnersAfter,
    runsScored,
    chainedPlays: mergeChainedPlays3Way(
      baseEnt?.chainedPlays ?? null,
      remoteEnt.chainedPlays,
      localEnt.chainedPlays
    ),
    eventText: pickScalar3Way(
      baseEnt?.eventText,
      remoteEnt.eventText,
      localEnt.eventText,
      hasBase
    ),
  };
}

function collapseSimultaneousSameBatterEntry(
  remoteNewEnt: LiveReportPlayEntry,
  localNewEnt: LiveReportPlayEntry
): LiveReportPlayEntry {
  let mergedReaction = localNewEnt.reactionText || remoteNewEnt.reactionText;
  if (remoteNewEnt.reactionText && localNewEnt.reactionText) {
    if (localNewEnt.reactionText.includes(remoteNewEnt.reactionText)) {
      mergedReaction = localNewEnt.reactionText;
    } else if (remoteNewEnt.reactionText.includes(localNewEnt.reactionText)) {
      mergedReaction = remoteNewEnt.reactionText;
    } else {
      mergedReaction = `${remoteNewEnt.reactionText}${localNewEnt.reactionText}`;
    }
  }

  return {
    ...remoteNewEnt,
    batterName: localNewEnt.batterName || remoteNewEnt.batterName,
    playText: localNewEnt.playText || remoteNewEnt.playText,
    reactionText: mergedReaction,
    outsAfter: localNewEnt.outsAfter,
    runnersAfter: normalizeRunnersList(localNewEnt.runnersAfter),
    runsScored: localNewEnt.runsScored,
    chainedPlays: mergeChainedPlays3Way(
      [],
      remoteNewEnt.chainedPlays,
      localNewEnt.chainedPlays
    ),
  };
}

function mergeHalfInnings3Way(
  baseHalves: ReadonlyArray<LiveReportHalfInning> | null,
  remoteHalves: ReadonlyArray<LiveReportHalfInning>,
  localHalves: ReadonlyArray<LiveReportHalfInning>,
  lineupLength: number,
  hasBase: boolean
): LiveReportHalfInning[] {
  const toHalfKey = (inning: number, isBottom: boolean) =>
    `${inning}-${isBottom ? "B" : "T"}`;

  const bMap = new Map(
    (baseHalves || []).map((h) => [toHalfKey(h.inning, h.isBottom), h])
  );
  const rMap = new Map(
    remoteHalves.map((h) => [toHalfKey(h.inning, h.isBottom), h])
  );
  const lMap = new Map(
    localHalves.map((h) => [toHalfKey(h.inning, h.isBottom), h])
  );

  const halfCoords = new Map<string, { inning: number; isBottom: boolean }>();
  for (const h of remoteHalves) {
    halfCoords.set(toHalfKey(h.inning, h.isBottom), {
      inning: h.inning,
      isBottom: h.isBottom,
    });
  }
  for (const h of localHalves) {
    halfCoords.set(toHalfKey(h.inning, h.isBottom), {
      inning: h.inning,
      isBottom: h.isBottom,
    });
  }

  const sortedHalfSpecs = Array.from(halfCoords.entries())
    .map(([key, coord]) => ({ key, ...coord }))
    .sort((a, b) =>
      compareHalfInningOrder(a.inning, a.isBottom, b.inning, b.isBottom)
    );

  const mergedHalves: LiveReportHalfInning[] = [];
  const sameOrderWindow = Math.max(9, lineupLength);

  for (const spec of sortedHalfSpecs) {
    const bHalf = bMap.get(spec.key) ?? null;
    const rHalf = rMap.get(spec.key) ?? null;
    const lHalf = lMap.get(spec.key) ?? null;

    let manualRunsOverride: number | null = null;
    if (hasBase) {
      const bOverride = bHalf?.manualRunsOverride ?? null;
      const rOverride = rHalf?.manualRunsOverride ?? null;
      const lOverride = lHalf?.manualRunsOverride ?? null;
      manualRunsOverride = lOverride !== bOverride ? lOverride : rOverride;
    } else {
      manualRunsOverride =
        rHalf?.manualRunsOverride ?? lHalf?.manualRunsOverride ?? null;
    }

    const bEntries = bHalf?.entries ?? [];
    const rEntries = rHalf?.entries ?? [];
    const lEntries = lHalf?.entries ?? [];

    const bEntMap = new Map(bEntries.map((e) => [e.id, e]));
    const rEntMap = new Map(rEntries.map((e) => [e.id, e]));
    const lEntMap = new Map(lEntries.map((e) => [e.id, e]));

    const mergedEntries: LiveReportPlayEntry[] = [];
    const unconsumedRemoteNewIds = new Set<string>();

    // Step 1: リモート側の打席・イベント順序をベースに構築
    for (const rEnt of rEntries) {
      const bEnt = bEntMap.get(rEnt.id) ?? null;
      const lEnt = lEntMap.get(rEnt.id) ?? null;

      if (bEnt && !lEnt) {
        // ローカルで明示削除された行（リモート未編集なら削除を確定）
        if (isSamePlayEntry(bEnt, rEnt)) {
          continue;
        }
        mergedEntries.push(rEnt);
      } else if (lEnt) {
        mergedEntries.push(mergeExistingPlayEntry3Way(bEnt, rEnt, lEnt));
      } else {
        mergedEntries.push(rEnt);
        unconsumedRemoteNewIds.add(rEnt.id);
      }
    }

    // Step 2: ローカル側で新規追加された行をマージ（同一打者の同時二重タップは1打席に統合）
    for (let lIdx = 0; lIdx < lEntries.length; lIdx++) {
      const lEnt = lEntries[lIdx];
      if (bEntMap.has(lEnt.id) || rEntMap.has(lEnt.id)) continue;

      if (lEnt.entryType === "batter") {
        let collapsedIndex = -1;
        let battersSeenFromEnd = 0;

        for (let mIdx = mergedEntries.length - 1; mIdx >= 0; mIdx--) {
          const candidate = mergedEntries[mIdx];
          if (candidate.entryType !== "batter") continue;
          if (battersSeenFromEnd >= sameOrderWindow) break;

          if (
            unconsumedRemoteNewIds.has(candidate.id) &&
            candidate.battingOrder === lEnt.battingOrder
          ) {
            collapsedIndex = mIdx;
            break;
          }
          battersSeenFromEnd += 1;
        }

        if (collapsedIndex >= 0) {
          const target = mergedEntries[collapsedIndex];
          mergedEntries[collapsedIndex] = collapseSimultaneousSameBatterEntry(
            target,
            lEnt
          );
          unconsumedRemoteNewIds.delete(target.id);
        } else {
          mergedEntries.push(lEnt);
        }
      } else {
        // 選手交代・自由メモ行の重複排除＆直前行アンカー挿入
        const duplicateEvent = mergedEntries.some(
          (m) =>
            unconsumedRemoteNewIds.has(m.id) &&
            m.entryType === lEnt.entryType &&
            m.eventText.trim() === lEnt.eventText.trim()
        );
        if (duplicateEvent) continue;

        let insertAt = mergedEntries.length;
        for (let prevIdx = lIdx - 1; prevIdx >= 0; prevIdx--) {
          const anchorId = lEntries[prevIdx].id;
          const foundIdx = mergedEntries.findIndex((m) => m.id === anchorId);
          if (foundIdx >= 0) {
            insertAt = foundIdx + 1;
            break;
          }
        }
        if (lIdx === 0 && lEntries.length > 1) {
          const nextId = lEntries[1].id;
          const foundNextIdx = mergedEntries.findIndex((m) => m.id === nextId);
          if (foundNextIdx >= 0) {
            insertAt = foundNextIdx;
          }
        }
        mergedEntries.splice(insertAt, 0, lEnt);
      }
    }

    if (mergedEntries.length > 0 || manualRunsOverride !== null) {
      mergedHalves.push({
        inning: spec.inning,
        isBottom: spec.isBottom,
        entries: mergedEntries,
        manualRunsOverride,
      });
    }
  }

  return mergedHalves;
}

function getLastBatterSnapshotForSide(
  halfInnings: ReadonlyArray<LiveReportHalfInning>,
  battingOrder: "first" | "second",
  isMySide: boolean
): { entryId: string; battingOrder: number } | null {
  const sorted = [...halfInnings].sort((a, b) =>
    compareHalfInningOrder(a.inning, a.isBottom, b.inning, b.isBottom)
  );
  let last: { entryId: string; battingOrder: number } | null = null;
  for (const half of sorted) {
    if (isMyTeamBattingHalf(battingOrder, half.isBottom) !== isMySide) {
      continue;
    }
    for (const ent of half.entries) {
      if (ent.entryType === "batter") {
        last = { entryId: ent.id, battingOrder: ent.battingOrder };
      }
    }
  }
  return last;
}

function getFrontlinePlayedHalf(
  halfInnings: ReadonlyArray<LiveReportHalfInning>
): { inning: number; isBottom: boolean } | null {
  let latest: { inning: number; isBottom: boolean } | null = null;
  for (const h of halfInnings) {
    if (h.entries.length === 0 && h.manualRunsOverride === null) continue;
    if (
      !latest ||
      compareHalfInningOrder(h.inning, h.isBottom, latest.inning, latest.isBottom) > 0
    ) {
      latest = { inning: h.inning, isBottom: h.isBottom };
    }
  }
  return latest;
}

export interface MergeLiveReportDocumentsParams {
  base: LiveReportV2Document | null;
  remote: LiveReportV2Document;
  local: LiveReportV2Document;
  /**
   * クライアント側のバックグラウンド同期用：
   * ローカルユーザーが過去イニングを閲覧・編集中に別イニングへ強制ジャンプするのを防ぎ、
   * リモートがベースより先の回へ前進し、かつローカルがベースと同じ回にいた場合のみ自動追従させる。
   */
  clientSideCursorFollow?: boolean;
}

export function mergeLiveReportDocuments({
  base,
  remote,
  local,
  clientSideCursorFollow = false,
}: MergeLiveReportDocumentsParams): LiveReportV2Document {
  const hasBase = base !== null;

  const mergedBattingOrder = pickScalar3Way(
    base?.battingOrder,
    remote.battingOrder,
    local.battingOrder,
    hasBase
  );

  const mergedLineup = mergeLineupSlots3Way(
    base?.lineup ?? null,
    remote.lineup,
    local.lineup,
    hasBase
  );

  const mergedHalfInnings = mergeHalfInnings3Way(
    base?.halfInnings ?? null,
    remote.halfInnings,
    local.halfInnings,
    mergedLineup.length,
    hasBase
  );

  // 次打者カーソル（nextMyOrder / nextOpponentOrder）の再計算と手動シフト保護
  const limitMy = Math.max(9, mergedLineup.length);
  const mergedLastMy = getLastBatterSnapshotForSide(
    mergedHalfInnings,
    mergedBattingOrder,
    true
  );
  const baseLastMy = base
    ? getLastBatterSnapshotForSide(base.halfInnings, base.battingOrder, true)
    : null;
  const localLastMy = getLastBatterSnapshotForSide(
    local.halfInnings,
    local.battingOrder,
    true
  );
  const expectedLocalNextMy = localLastMy
    ? (localLastMy.battingOrder % Math.max(9, local.lineup.length)) + 1
    : 1;
  const localManuallyShiftedMy =
    hasBase &&
    base !== null &&
    local.nextMyOrder !== base.nextMyOrder &&
    local.nextMyOrder !== expectedLocalNextMy;

  let nextMyOrder: number;
  if (localManuallyShiftedMy && mergedLastMy?.entryId === localLastMy?.entryId) {
    nextMyOrder = local.nextMyOrder;
  } else if (mergedLastMy && mergedLastMy.entryId !== baseLastMy?.entryId) {
    nextMyOrder = (mergedLastMy.battingOrder % limitMy) + 1;
  } else {
    nextMyOrder = pickScalar3Way(
      base?.nextMyOrder,
      remote.nextMyOrder,
      local.nextMyOrder,
      hasBase
    );
  }

  const mergedLastOpp = getLastBatterSnapshotForSide(
    mergedHalfInnings,
    mergedBattingOrder,
    false
  );
  const baseLastOpp = base
    ? getLastBatterSnapshotForSide(base.halfInnings, base.battingOrder, false)
    : null;
  const localLastOpp = getLastBatterSnapshotForSide(
    local.halfInnings,
    local.battingOrder,
    false
  );
  const expectedLocalNextOpp = localLastOpp
    ? (localLastOpp.battingOrder % 9) + 1
    : 1;
  const localManuallyShiftedOpp =
    hasBase &&
    base !== null &&
    local.nextOpponentOrder !== base.nextOpponentOrder &&
    local.nextOpponentOrder !== expectedLocalNextOpp;

  let nextOpponentOrder: number;
  if (
    localManuallyShiftedOpp &&
    mergedLastOpp?.entryId === localLastOpp?.entryId
  ) {
    nextOpponentOrder = local.nextOpponentOrder;
  } else if (mergedLastOpp && mergedLastOpp.entryId !== baseLastOpp?.entryId) {
    nextOpponentOrder = (mergedLastOpp.battingOrder % 9) + 1;
  } else {
    nextOpponentOrder = pickScalar3Way(
      base?.nextOpponentOrder,
      remote.nextOpponentOrder,
      local.nextOpponentOrder,
      hasBase
    );
  }

  // アクティブイニング（activeInning / activeIsBottom）の決定
  let activeInning = remote.activeInning;
  let activeIsBottom = remote.activeIsBottom;

  if (clientSideCursorFollow && base) {
    const remoteAdvancedFromBase =
      compareHalfInningOrder(
        remote.activeInning,
        remote.activeIsBottom,
        base.activeInning,
        base.activeIsBottom
      ) > 0;
    const localStayedAtBase =
      local.activeInning === base.activeInning &&
      local.activeIsBottom === base.activeIsBottom;

    if (remoteAdvancedFromBase && localStayedAtBase) {
      activeInning = remote.activeInning;
      activeIsBottom = remote.activeIsBottom;
    } else {
      activeInning = local.activeInning;
      activeIsBottom = local.activeIsBottom;
    }
  } else if (hasBase && base) {
    const rChanged =
      remote.activeInning !== base.activeInning ||
      remote.activeIsBottom !== base.activeIsBottom;
    const lChanged =
      local.activeInning !== base.activeInning ||
      local.activeIsBottom !== base.activeIsBottom;

    if (lChanged && !rChanged) {
      const frontline = getFrontlinePlayedHalf(mergedHalfInnings);
      // 既に後ろのイニングに打席記録がある場合、サブ担当者の過去イニング閲覧でクラウド上の最前線カーソルを巻き戻さない
      if (
        frontline &&
        compareHalfInningOrder(
          local.activeInning,
          local.activeIsBottom,
          frontline.inning,
          frontline.isBottom
        ) < 0 &&
        compareHalfInningOrder(
          remote.activeInning,
          remote.activeIsBottom,
          frontline.inning,
          frontline.isBottom
        ) >= 0
      ) {
        activeInning = remote.activeInning;
        activeIsBottom = remote.activeIsBottom;
      } else {
        activeInning = local.activeInning;
        activeIsBottom = local.activeIsBottom;
      }
    } else if (!lChanged && rChanged) {
      activeInning = remote.activeInning;
      activeIsBottom = remote.activeIsBottom;
    } else if (lChanged && rChanged) {
      if (
        compareHalfInningOrder(
          local.activeInning,
          local.activeIsBottom,
          remote.activeInning,
          remote.activeIsBottom
        ) >= 0
      ) {
        activeInning = local.activeInning;
        activeIsBottom = local.activeIsBottom;
      } else {
        activeInning = remote.activeInning;
        activeIsBottom = remote.activeIsBottom;
      }
    }
  } else {
    if (
      compareHalfInningOrder(
        local.activeInning,
        local.activeIsBottom,
        remote.activeInning,
        remote.activeIsBottom
      ) > 0
    ) {
      activeInning = local.activeInning;
      activeIsBottom = local.activeIsBottom;
    }
  }

  const isGameFinished = hasBase
    ? pickScalar3Way(
        base?.isGameFinished,
        remote.isGameFinished,
        local.isGameFinished,
        true
      )
    : remote.isGameFinished || local.isGameFinished;

  return {
    version: 2,
    matchId: local.matchId ?? remote.matchId ?? null,
    dateText: pickScalar3Way(
      base?.dateText,
      remote.dateText,
      local.dateText,
      hasBase
    ),
    tournamentText: pickScalar3Way(
      base?.tournamentText,
      remote.tournamentText,
      local.tournamentText,
      hasBase
    ),
    opponentName: pickScalar3Way(
      base?.opponentName,
      remote.opponentName,
      local.opponentName,
      hasBase
    ),
    venueName: pickScalar3Way(
      base?.venueName,
      remote.venueName,
      local.venueName,
      hasBase
    ),
    startTime: pickScalar3Way(
      base?.startTime,
      remote.startTime,
      local.startTime,
      hasBase
    ),
    endTime: pickScalar3Way(
      base?.endTime,
      remote.endTime,
      local.endTime,
      hasBase
    ),
    battingOrder: mergedBattingOrder,
    regulationInnings: pickScalar3Way(
      base?.regulationInnings,
      remote.regulationInnings,
      local.regulationInnings,
      hasBase
    ),
    firstTeamShortName: pickScalar3Way(
      base?.firstTeamShortName,
      remote.firstTeamShortName,
      local.firstTeamShortName,
      hasBase
    ),
    secondTeamShortName: pickScalar3Way(
      base?.secondTeamShortName,
      remote.secondTeamShortName,
      local.secondTeamShortName,
      hasBase
    ),
    showSurnameOnly: pickScalar3Way(
      base?.showSurnameOnly,
      remote.showSurnameOnly,
      local.showSurnameOnly,
      hasBase
    ),
    appendSubsToTopLineup: pickScalar3Way(
      base?.appendSubsToTopLineup,
      remote.appendSubsToTopLineup,
      local.appendSubsToTopLineup,
      hasBase
    ),
    showWalkoffX: pickScalar3Way(
      base?.showWalkoffX,
      remote.showWalkoffX,
      local.showWalkoffX,
      hasBase
    ),
    lineup: mergedLineup,
    halfInnings: mergedHalfInnings,
    activeInning: Math.max(1, activeInning),
    activeIsBottom,
    nextMyOrder,
    nextOpponentOrder,
    isGameFinished,
    closingComment: pickScalar3Way(
      base?.closingComment,
      remote.closingComment,
      local.closingComment,
      hasBase
    ),
    reporterNames: mergeReporterNames3Way(
      base?.reporterNames,
      remote.reporterNames,
      local.reporterNames,
      hasBase
    ),
  };
}


