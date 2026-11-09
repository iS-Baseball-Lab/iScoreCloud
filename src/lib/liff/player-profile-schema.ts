// filepath: src/lib/liff/player-profile-schema.ts

export type PlayStyleTagId =
  | "speed"
  | "power"
  | "contact"
  | "eye"
  | "defense"
  | "arm"
  | "bunt"
  | "clutch"
  | "control"
  | "strikeout"
  | "brain"
  | "mood";

export interface PlayStyleTagMeta {
  id: PlayStyleTagId;
  emoji: string;
  label: string;
  shortLabel: string;
}

export const MAX_PLAY_STYLE_TAGS = 3;

export const PLAY_STYLE_TAGS: readonly PlayStyleTagMeta[] = [
  { id: "speed", emoji: "⚡", label: "俊足・盗塁", shortLabel: "俊足" },
  { id: "power", emoji: "💪", label: "長打力", shortLabel: "長打力" },
  { id: "contact", emoji: "🎯", label: "巧打・ミート", shortLabel: "巧打" },
  { id: "eye", emoji: "👁️", label: "選球眼・出塁", shortLabel: "選球眼" },
  { id: "defense", emoji: "🧱", label: "鉄壁守備", shortLabel: "好守" },
  { id: "arm", emoji: "🚀", label: "強肩レーザー", shortLabel: "強肩" },
  { id: "bunt", emoji: "🛠", label: "バント・小技", shortLabel: "小技職人" },
  { id: "clutch", emoji: "🔥", label: "勝負強さ", shortLabel: "勝負強さ" },
  { id: "control", emoji: "🧭", label: "精密制球", shortLabel: "制球力" },
  { id: "strikeout", emoji: "🌪️", label: "奪三振・変化球", shortLabel: "奪三振" },
  { id: "brain", emoji: "🧠", label: "頭脳派リード", shortLabel: "頭脳派" },
  { id: "mood", emoji: "📣", label: "ムードメーカー", shortLabel: "声出し" },
] as const;

export const PLAY_STYLE_TAG_MAP: Record<PlayStyleTagId, PlayStyleTagMeta> =
  PLAY_STYLE_TAGS.reduce(
    (acc, item) => {
      acc[item.id] = item;
      return acc;
    },
    {} as Record<PlayStyleTagId, PlayStyleTagMeta>
  );

export function isPlayStyleTagId(val: string): val is PlayStyleTagId {
  return Object.prototype.hasOwnProperty.call(PLAY_STYLE_TAG_MAP, val);
}

export interface DefensivePositionOption {
  code: "P" | "C" | "1B" | "2B" | "3B" | "SS" | "LF" | "CF" | "RF" | "DH";
  shortLabel: string;
  fullLabel: string;
  group: "バッテリー" | "内野手" | "外野手" | "指名打者";
}

export const DEFENSIVE_POSITION_OPTIONS: readonly DefensivePositionOption[] = [
  { code: "P", shortLabel: "投手", fullLabel: "投手 (P)", group: "バッテリー" },
  { code: "C", shortLabel: "捕手", fullLabel: "捕手 (C)", group: "バッテリー" },
  { code: "1B", shortLabel: "一塁手", fullLabel: "一塁手 (1B)", group: "内野手" },
  { code: "2B", shortLabel: "二塁手", fullLabel: "二塁手 (2B)", group: "内野手" },
  { code: "3B", shortLabel: "三塁手", fullLabel: "三塁手 (3B)", group: "内野手" },
  { code: "SS", shortLabel: "遊撃手", fullLabel: "遊撃手 (SS)", group: "内野手" },
  { code: "LF", shortLabel: "左翼手", fullLabel: "左翼手 (LF)", group: "外野手" },
  { code: "CF", shortLabel: "中堅手", fullLabel: "中堅手 (CF)", group: "外野手" },
  { code: "RF", shortLabel: "右翼手", fullLabel: "右翼手 (RF)", group: "外野手" },
  { code: "DH", shortLabel: "指名打者", fullLabel: "指名打者 (DH)", group: "指名打者" },
] as const;

const POSITION_ALIAS_TO_CODE: Record<string, DefensivePositionOption["code"]> = {
  P: "P",
  "1": "P",
  投手: "P",
  ピッチャー: "P",
  C: "C",
  "2": "C",
  捕手: "C",
  キャッチャー: "C",
  "1B": "1B",
  "3": "1B",
  一塁: "1B",
  一塁手: "1B",
  "2B": "2B",
  "4": "2B",
  二塁: "2B",
  二塁手: "2B",
  "3B": "3B",
  "5": "3B",
  三塁: "3B",
  三塁手: "3B",
  SS: "SS",
  "6": "SS",
  遊撃: "SS",
  遊撃手: "SS",
  LF: "LF",
  "7": "LF",
  左翼: "LF",
  左翼手: "LF",
  CF: "CF",
  "8": "CF",
  中堅: "CF",
  中堅手: "CF",
  RF: "RF",
  "9": "RF",
  右翼: "RF",
  右翼手: "RF",
  DH: "DH",
  指名打者: "DH",
};

export function normalizeCanonicalPositionCode(
  raw: string | null | undefined
): DefensivePositionOption["code"] | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return (
    POSITION_ALIAS_TO_CODE[trimmed] ||
    POSITION_ALIAS_TO_CODE[trimmed.toUpperCase()] ||
    null
  );
}

export const GRADE_AGE_PRESETS_YOUTH: readonly string[] = [
  "小1",
  "小2",
  "小3",
  "小4",
  "小5",
  "小6",
  "中1",
  "中2",
  "中3",
  "高1",
  "高2",
  "高3",
] as const;

export const GRADE_AGE_PRESETS_ADULT: readonly string[] = [
  "大学生",
  "10代",
  "20代前半",
  "20代後半",
  "30代",
  "40代",
  "50代",
  "60代+",
] as const;

export interface FavoriteTeamPreset {
  value: string;
  label: string;
  group: string;
}

export const FAVORITE_PRO_TEAM_PRESETS: readonly FavoriteTeamPreset[] = [
  { value: "阪神タイガース", label: "阪神タイガース", group: "セ・リーグ" },
  { value: "読売ジャイアンツ", label: "読売ジャイアンツ", group: "セ・リーグ" },
  { value: "横浜DeNAベイスターズ", label: "横浜DeNAベイスターズ", group: "セ・リーグ" },
  { value: "広島東洋カープ", label: "広島東洋カープ", group: "セ・リーグ" },
  { value: "東京ヤクルトスワローズ", label: "東京ヤクルトスワローズ", group: "セ・リーグ" },
  { value: "中日ドラゴンズ", label: "中日ドラゴンズ", group: "セ・リーグ" },
  { value: "福岡ソフトバンクホークス", label: "福岡ソフトバンクホークス", group: "パ・リーグ" },
  { value: "北海道日本ハムファイターズ", label: "北海道日本ハムファイターズ", group: "パ・リーグ" },
  { value: "千葉ロッテマリーンズ", label: "千葉ロッテマリーンズ", group: "パ・リーグ" },
  { value: "東北楽天ゴールデンイーグルス", label: "東北楽天ゴールデンイーグルス", group: "パ・リーグ" },
  { value: "オリックス・バファローズ", label: "オリックス・バファローズ", group: "パ・リーグ" },
  { value: "埼玉西武ライオンズ", label: "埼玉西武ライオンズ", group: "パ・リーグ" },
  { value: "MLB（メジャーリーグ）", label: "MLB（メジャーリーグ）", group: "その他" },
  { value: "高校・大学・社会人野球", label: "高校・大学・社会人野球", group: "その他" },
  { value: "箱推し（野球全般）", label: "箱推し（野球全般）", group: "その他" },
] as const;

export interface PlayerProfileDetails {
  seasonGoal: string | null;
  playStyleTags: PlayStyleTagId[];
  gradeOrAge: string | null;
  baseballHistory: string | null;
  admiredPlayer: string | null;
  favoriteTeam: string | null;
  gloveGear: string | null;
  batGear: string | null;
  walkUpSong: string | null;
  maxVelocityKmh: number | null;
  dash50mSec: string | null;
  longTossM: number | null;
  hideWeight: boolean;
  actionImageUrl: string | null;
}

export const EMPTY_PLAYER_PROFILE_DETAILS: PlayerProfileDetails = {
  seasonGoal: null,
  playStyleTags: [],
  gradeOrAge: null,
  baseballHistory: null,
  admiredPlayer: null,
  favoriteTeam: null,
  gloveGear: null,
  batGear: null,
  walkUpSong: null,
  maxVelocityKmh: null,
  dash50mSec: null,
  longTossM: null,
  hideWeight: false,
  actionImageUrl: null,
};

function sanitizeOptionalImageUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/api/images/")) {
    return trimmed.slice(0, 500);
  }
  if (trimmed.startsWith("data:image/")) {
    return trimmed.length <= 450_000 ? trimmed : null;
  }
  return null;
}

function sanitizeTrimmedText(raw: unknown, maxLen: number): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function sanitizeOptionalInt(
  raw: unknown,
  min: number,
  max: number
): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const num = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(num)) return null;
  const rounded = Math.round(num);
  if (rounded < min || rounded > max) return null;
  return rounded;
}

function sanitizeDash50m(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const text = String(raw)
    .trim()
    .replace(/秒$/u, "")
    .replace(/s$/iu, "")
    .trim();
  if (!text) return null;
  const num = Number(text);
  if (!Number.isFinite(num) || num < 4.5 || num > 20) return null;
  return text.slice(0, 6);
}

export function parsePlayerProfileDetails(raw: unknown): PlayerProfileDetails {
  if (!raw) return { ...EMPTY_PLAYER_PROFILE_DETAILS, playStyleTags: [] };

  let obj: Record<string, unknown> | null = null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return { ...EMPTY_PLAYER_PROFILE_DETAILS, playStyleTags: [] };
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        obj = parsed as Record<string, unknown>;
      }
    } catch {
      return { ...EMPTY_PLAYER_PROFILE_DETAILS, playStyleTags: [] };
    }
  } else if (typeof raw === "object" && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>;
  }

  if (!obj) return { ...EMPTY_PLAYER_PROFILE_DETAILS, playStyleTags: [] };

  const tagsRaw = Array.isArray(obj.playStyleTags) ? obj.playStyleTags : [];
  const seenTags = new Set<PlayStyleTagId>();
  const playStyleTags: PlayStyleTagId[] = [];
  for (const item of tagsRaw) {
    if (typeof item === "string" && isPlayStyleTagId(item) && !seenTags.has(item)) {
      seenTags.add(item);
      playStyleTags.push(item);
      if (playStyleTags.length >= MAX_PLAY_STYLE_TAGS) break;
    }
  }

  return {
    seasonGoal: sanitizeTrimmedText(obj.seasonGoal, 80),
    playStyleTags,
    gradeOrAge: sanitizeTrimmedText(obj.gradeOrAge, 24),
    baseballHistory: sanitizeTrimmedText(obj.baseballHistory, 60),
    admiredPlayer: sanitizeTrimmedText(obj.admiredPlayer, 40),
    favoriteTeam: sanitizeTrimmedText(obj.favoriteTeam, 40),
    gloveGear: sanitizeTrimmedText(obj.gloveGear, 50),
    batGear: sanitizeTrimmedText(obj.batGear, 50),
    walkUpSong: sanitizeTrimmedText(obj.walkUpSong, 60),
    maxVelocityKmh: sanitizeOptionalInt(obj.maxVelocityKmh, 40, 175),
    dash50mSec: sanitizeDash50m(obj.dash50mSec),
    longTossM: sanitizeOptionalInt(obj.longTossM, 10, 150),
    hideWeight: Boolean(obj.hideWeight),
    actionImageUrl: sanitizeOptionalImageUrl(obj.actionImageUrl),
  };
}

export interface DemoPlayerProfileOverride {
  name?: string;
  nameKana?: string | null;
  uniformNumber?: string;
  nickname?: string | null;
  registeredPrimaryPosition?: string | null;
  registeredSubPositions?: string[];
  throws?: string | null;
  bats?: string | null;
  height?: number | null;
  weight?: number | null;
  editableWeight?: number | null;
  profileImageUrl?: string | null;
  notes?: string | null;
  isCaptain?: boolean;
  joinedAt?: number | null;
  profileDetails?: PlayerProfileDetails;
}

/**
 * Unix秒 / ミリ秒 / Date / 日付文字列を日本時間(JST: UTC+9)基準の「YYYY-MM-DD」へ変換する
 */
export function formatUnixTimestampToDateInput(
  val: number | string | Date | null | undefined
): string {
  if (val === null || val === undefined || val === "") return "";
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return "";
    const ymdMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (ymdMatch && !trimmed.includes("T")) {
      return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, "0")}-${ymdMatch[3].padStart(2, "0")}`;
    }
    if (/^\d+$/.test(trimmed)) {
      return formatUnixTimestampToDateInput(Number(trimmed));
    }
    const parsed = new Date(trimmed);
    if (isNaN(parsed.getTime())) return "";
    return formatMsToJstDateKey(parsed.getTime());
  }
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? "" : formatMsToJstDateKey(val.getTime());
  }
  if (typeof val === "number") {
    if (!Number.isFinite(val) || val <= 0) return "";
    const ms = val < 10_000_000_000 ? val * 1000 : val;
    return formatMsToJstDateKey(ms);
  }
  return "";
}

function formatMsToJstDateKey(ms: number): string {
  const jstDate = new Date(ms + 9 * 60 * 60 * 1000);
  if (isNaN(jstDate.getTime())) return "";
  const y = jstDate.getUTCFullYear();
  const m = String(jstDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(jstDate.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * <input type="date"> 等の入力値（YYYY-MM-DD / Unix秒）をタイムゾーンずれのない JST正午 Unix秒と YYYY-MM-DD キーへ変換する
 */
export function parseDateInputToUnixSeconds(raw: unknown): {
  unixSeconds: number | null;
  dateKey: string | null;
} {
  if (raw === null || raw === undefined || raw === "") {
    return { unixSeconds: null, dateKey: null };
  }
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0) {
      return { unixSeconds: null, dateKey: null };
    }
    const unixSeconds =
      raw < 10_000_000_000 ? Math.floor(raw) : Math.floor(raw / 1000);
    const dateKey = formatMsToJstDateKey(unixSeconds * 1000) || null;
    return { unixSeconds, dateKey };
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return { unixSeconds: null, dateKey: null };
    const m = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) {
      const year = Number(m[1]);
      const month = Number(m[2]);
      const day = Number(m[3]);
      if (year >= 1990 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const dateKey = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const jstNoon = new Date(`${dateKey}T12:00:00+09:00`);
        if (!isNaN(jstNoon.getTime())) {
          return {
            unixSeconds: Math.floor(jstNoon.getTime() / 1000),
            dateKey,
          };
        }
      }
    }
    const fallback = new Date(trimmed);
    if (!isNaN(fallback.getTime())) {
      const unixSeconds = Math.floor(fallback.getTime() / 1000);
      const dateKey = formatMsToJstDateKey(fallback.getTime()) || null;
      return { unixSeconds, dateKey };
    }
  }
  return { unixSeconds: null, dateKey: null };
}

const DEMO_PROFILE_STORAGE_KEY = "iscore_demo_player_profiles_v1";

export function loadDemoPlayerProfileOverrides(): Record<
  string,
  DemoPlayerProfileOverride
> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(DEMO_PROFILE_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, DemoPlayerProfileOverride>;
    }
  } catch {
    // ignore storage parse error
  }
  return {};
}

export function saveDemoPlayerProfileOverride(
  playerId: string,
  override: DemoPlayerProfileOverride
): void {
  if (typeof window === "undefined") return;
  try {
    const current = loadDemoPlayerProfileOverrides();
    current[playerId] = {
      ...(current[playerId] || {}),
      ...override,
    };
    localStorage.setItem(DEMO_PROFILE_STORAGE_KEY, JSON.stringify(current));
  } catch {
    // ignore storage quota error
  }
}

