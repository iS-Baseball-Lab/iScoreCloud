// filepath: src/lib/liff/related-teams-schema.ts
import { normalizeHttpUrlInput } from "@/lib/liff/team-links-schema";
import { validateSafeHttpUrl } from "@/lib/utils";

export const MAX_LINKS_PER_RELATED_TEAM = 12;
export const MAX_RELATED_TEAM_NAME_LENGTH = 100;
export const MAX_RELATED_TEAM_SHORT_NAME_LENGTH = 40;
export const MAX_RELATED_TEAM_LEAGUE_LENGTH = 80;
export const MAX_RELATED_TEAM_AREA_LENGTH = 100;
export const MAX_RELATED_TEAM_GROUND_LENGTH = 120;
export const MAX_RELATED_TEAM_DESC_LENGTH = 600;
export const MAX_RELATED_TEAM_LINK_LABEL_LENGTH = 80;

export type RelatedTeamLinkKind =
  | "official"
  | "instagram"
  | "youtube"
  | "x"
  | "line"
  | "facebook"
  | "blog"
  | "map"
  | "other";

export type RelatedTeamRelationType =
  | "league_member"
  | "tournament_opponent"
  | "practice_partner"
  | "upper_lower"
  | "other";

export interface RelatedTeamLinkItem {
  id: string;
  kind: RelatedTeamLinkKind;
  label: string;
  url: string;
}

export interface RelatedTeamLinkDraft {
  id: string;
  kind: RelatedTeamLinkKind;
  label: string;
  url: string;
}

export interface RelatedTeamMatchStats {
  totalFinished: number;
  wins: number;
  losses: number;
  draws: number;
  scheduledCount: number;
  lastMatchDate: string | null;
  lastScoreSummary: string | null;
}

export interface RelatedTeamItem {
  id: string;
  name: string;
  shortName: string;
  leagueName: string;
  relationType: RelatedTeamRelationType;
  relationLabel: string;
  teamCategory: string;
  area: string;
  homeGround: string;
  websiteUrl: string;
  links: RelatedTeamLinkItem[];
  description: string;
  scope: "organization" | "team";
  scopeLabel: string;
  isFavorite: boolean;
  priority: number;
  matchStats: RelatedTeamMatchStats | null;
}

export interface UnregisteredOpponentItem {
  opponentName: string;
  totalFinished: number;
  wins: number;
  losses: number;
  draws: number;
  scheduledCount: number;
  lastMatchDate: string | null;
}

export interface RelatedTeamAiSourceLink {
  title: string;
  url: string;
}

export interface AiDiscoveredTeamCandidate {
  tempId: string;
  name: string;
  shortName: string;
  leagueName: string;
  relationType: RelatedTeamRelationType;
  area: string;
  homeGround: string;
  description: string;
  websiteUrl: string;
  links: RelatedTeamLinkItem[];
  confidence: "high" | "medium" | "low";
  alreadyRegistered: boolean;
}

export interface RelatedTeamAiLookupResult {
  name: string;
  shortName: string;
  leagueName: string;
  area: string;
  homeGround: string;
  description: string;
  websiteUrl: string;
  links: RelatedTeamLinkItem[];
  confidence: "high" | "medium" | "low";
  summaryNote: string;
  sources: RelatedTeamAiSourceLink[];
}

export const RELATED_TEAM_RELATION_OPTIONS: ReadonlyArray<{
  value: RelatedTeamRelationType;
  label: string;
  shortLabel: string;
}> = [
  {
    value: "league_member",
    label: "🏟️ 所属連盟・協会の加盟チーム",
    shortLabel: "同連盟・協会",
  },
  {
    value: "tournament_opponent",
    label: "🏆 公式戦・大会の対戦チーム",
    shortLabel: "大会対戦",
  },
  {
    value: "practice_partner",
    label: "🤝 練習試合・定期交流チーム",
    shortLabel: "練習試合・交流",
  },
  {
    value: "upper_lower",
    label: "🌱 進路・上部/下部・姉妹チーム",
    shortLabel: "進路・連携",
  },
  {
    value: "other",
    label: "⚾ その他関連チーム・団体",
    shortLabel: "その他",
  },
] as const;

export const RELATED_TEAM_LINK_KIND_OPTIONS: ReadonlyArray<{
  value: RelatedTeamLinkKind;
  label: string;
  defaultButtonLabel: string;
}> = [
  {
    value: "instagram",
    label: "📸 Instagram",
    defaultButtonLabel: "Instagram",
  },
  {
    value: "official",
    label: "🌐 公式サイト・HP",
    defaultButtonLabel: "公式サイト",
  },
  {
    value: "youtube",
    label: "▶️ YouTube",
    defaultButtonLabel: "YouTube",
  },
  {
    value: "x",
    label: "𝕏 X (旧Twitter)",
    defaultButtonLabel: "X (旧Twitter)",
  },
  {
    value: "line",
    label: "💬 LINE公式アカウント",
    defaultButtonLabel: "LINE公式",
  },
  {
    value: "facebook",
    label: "📘 Facebook",
    defaultButtonLabel: "Facebook",
  },
  {
    value: "blog",
    label: "📝 ブログ・チーム紹介・募集",
    defaultButtonLabel: "紹介・ブログ",
  },
  {
    value: "map",
    label: "📍 活動拠点マップ",
    defaultButtonLabel: "拠点マップ",
  },
  {
    value: "other",
    label: "🔗 その他リンク",
    defaultButtonLabel: "リンクを開く",
  },
] as const;

const VALID_LINK_KINDS = new Set<RelatedTeamLinkKind>([
  "official",
  "instagram",
  "youtube",
  "x",
  "line",
  "facebook",
  "blog",
  "map",
  "other",
]);

const VALID_RELATION_TYPES = new Set<RelatedTeamRelationType>([
  "league_member",
  "tournament_opponent",
  "practice_partner",
  "upper_lower",
  "other",
]);

export function normalizeRelationType(
  raw: unknown,
  fallback: RelatedTeamRelationType = "league_member"
): RelatedTeamRelationType {
  if (typeof raw === "string" && VALID_RELATION_TYPES.has(raw as RelatedTeamRelationType)) {
    return raw as RelatedTeamRelationType;
  }
  return fallback;
}

export function getRelationShortLabel(type: RelatedTeamRelationType): string {
  const found = RELATED_TEAM_RELATION_OPTIONS.find((opt) => opt.value === type);
  return found ? found.shortLabel : "関連チーム";
}

export function createRelatedTeamLinkId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `rtlink_${crypto.randomUUID().slice(0, 12)}`;
  }
  return `rtlink_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getRelatedTeamLinkKindDefaultLabel(
  kind: RelatedTeamLinkKind
): string {
  const found = RELATED_TEAM_LINK_KIND_OPTIONS.find((opt) => opt.value === kind);
  return found ? found.defaultButtonLabel : "リンク";
}

export function inferRelatedTeamLinkKind(
  rawUrl: string,
  labelHint?: string
): RelatedTeamLinkKind {
  const lowerUrl = rawUrl.trim().toLowerCase();
  const lowerLabel = (labelHint || "").trim().toLowerCase();

  if (lowerUrl.includes("instagram.com") || lowerUrl.includes("instagr.am")) {
    return "instagram";
  }
  if (lowerUrl.includes("youtube.com") || lowerUrl.includes("youtu.be")) {
    return "youtube";
  }
  if (
    lowerUrl.includes("://x.com/") ||
    lowerUrl.includes(".x.com/") ||
    lowerUrl.includes("twitter.com/")
  ) {
    return "x";
  }
  if (lowerUrl.includes("line.me") || lowerUrl.includes("lin.ee")) {
    return "line";
  }
  if (lowerUrl.includes("facebook.com") || lowerUrl.includes("fb.com")) {
    return "facebook";
  }
  if (
    lowerUrl.includes("google.com/maps") ||
    lowerUrl.includes("maps.google") ||
    lowerUrl.includes("maps.app.goo.gl") ||
    lowerUrl.includes("goo.gl/maps")
  ) {
    return "map";
  }
  if (
    lowerUrl.includes("ameblo.jp") ||
    lowerUrl.includes("note.com") ||
    lowerUrl.includes("hatenablog") ||
    lowerUrl.includes("livedoor.jp") ||
    lowerUrl.includes("fc2.com") ||
    lowerUrl.includes("sposuru.com") ||
    lowerUrl.includes("teams.one") ||
    lowerUrl.includes("ikz.jp") ||
    lowerUrl.includes("89dream.jp") ||
    lowerUrl.includes("pop.co.jp") ||
    lowerLabel.includes("ブログ") ||
    lowerLabel.includes("部員募集") ||
    lowerLabel.includes("体験") ||
    lowerLabel.includes("紹介")
  ) {
    return "blog";
  }
  if (
    lowerLabel.includes("公式") ||
    lowerLabel.includes("ホームページ") ||
    lowerLabel.includes("hp")
  ) {
    return "official";
  }
  return "other";
}

export function createEmptyRelatedTeamLinkDraft(
  kind: RelatedTeamLinkKind = "instagram"
): RelatedTeamLinkDraft {
  return {
    id: createRelatedTeamLinkId(),
    kind,
    label: getRelatedTeamLinkKindDefaultLabel(kind),
    url: "",
  };
}

export function toRelatedTeamLinkDrafts(
  links: ReadonlyArray<RelatedTeamLinkItem> | null | undefined
): RelatedTeamLinkDraft[] {
  if (!links || links.length === 0) return [];
  return links.map((item) => ({
    id: item.id || createRelatedTeamLinkId(),
    kind: VALID_LINK_KINDS.has(item.kind)
      ? item.kind
      : inferRelatedTeamLinkKind(item.url, item.label),
    label: item.label || getRelatedTeamLinkKindDefaultLabel(item.kind),
    url: item.url || "",
  }));
}

export function parseRelatedTeamLinksJson(
  raw: string | null | undefined
): RelatedTeamLinkItem[] {
  if (!raw || typeof raw !== "string") return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return [];

    const result: RelatedTeamLinkItem[] = [];
    const seenIds = new Set<string>();
    const seenUrls = new Set<string>();

    for (let i = 0; i < parsed.length; i += 1) {
      if (result.length >= MAX_LINKS_PER_RELATED_TEAM) break;
      const entry = parsed[i];
      if (!entry || typeof entry !== "object") continue;

      const record = entry as Record<string, unknown>;
      const rawUrl = typeof record.url === "string" ? record.url.trim() : "";
      if (!rawUrl) continue;

      const urlCheck = validateSafeHttpUrl(rawUrl, { allowEmpty: false });
      if (!urlCheck.ok || !urlCheck.url) continue;

      const urlKey = urlCheck.url.toLowerCase();
      if (seenUrls.has(urlKey)) continue;
      seenUrls.add(urlKey);

      const rawLabel =
        typeof record.label === "string"
          ? record.label.trim().slice(0, MAX_RELATED_TEAM_LINK_LABEL_LENGTH)
          : "";
      const rawKind = typeof record.kind === "string" ? record.kind.trim() : "";
      const resolvedKind: RelatedTeamLinkKind = VALID_LINK_KINDS.has(
        rawKind as RelatedTeamLinkKind
      )
        ? (rawKind as RelatedTeamLinkKind)
        : inferRelatedTeamLinkKind(urlCheck.url, rawLabel);

      const label =
        rawLabel || getRelatedTeamLinkKindDefaultLabel(resolvedKind);

      const rawId =
        typeof record.id === "string" ? record.id.trim().slice(0, 64) : "";
      const id =
        rawId && !seenIds.has(rawId)
          ? rawId
          : `rtlink_${i + 1}_${result.length + 1}`;
      seenIds.add(id);

      result.push({
        id,
        kind: resolvedKind,
        label,
        url: urlCheck.url,
      });
    }

    return result;
  } catch {
    return [];
  }
}

export function validateAndNormalizeRelatedTeamLinks(
  input: unknown
):
  | { ok: true; links: RelatedTeamLinkItem[] }
  | { ok: false; error: string } {
  if (input === undefined || input === null) {
    return { ok: true, links: [] };
  }
  if (!Array.isArray(input)) {
    return { ok: false, error: "SNS・関連リンクのデータ形式が正しくありません" };
  }

  const nonEmptyRows: Array<{
    rawId: string;
    rawKind: string;
    label: string;
    rawUrl: string;
  }> = [];

  for (const item of input) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "SNS・関連リンクの項目データが不正です" };
    }
    const record = item as Record<string, unknown>;
    const rawId =
      typeof record.id === "string" ? record.id.trim().slice(0, 64) : "";
    const rawKind =
      typeof record.kind === "string" ? record.kind.trim() : "";
    const label =
      typeof record.label === "string"
        ? record.label.trim().slice(0, MAX_RELATED_TEAM_LINK_LABEL_LENGTH)
        : "";
    const rawUrl = typeof record.url === "string" ? record.url.trim() : "";

    // URLが空欄の未入力枠は自動スキップ
    if (!rawUrl) {
      continue;
    }
    nonEmptyRows.push({ rawId, rawKind, label, rawUrl });
  }

  if (nonEmptyRows.length > MAX_LINKS_PER_RELATED_TEAM) {
    return {
      ok: false,
      error: `SNS・サブリンクは1チームにつき最大${MAX_LINKS_PER_RELATED_TEAM}件まで登録できます`,
    };
  }

  const normalized: RelatedTeamLinkItem[] = [];
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();

  for (let i = 0; i < nonEmptyRows.length; i += 1) {
    const row = nonEmptyRows[i];
    const candidateUrl = normalizeHttpUrlInput(row.rawUrl);
    const urlCheck = validateSafeHttpUrl(candidateUrl, { allowEmpty: false });

    const inferredKind = inferRelatedTeamLinkKind(candidateUrl, row.label);
    const kind: RelatedTeamLinkKind = VALID_LINK_KINDS.has(
      row.rawKind as RelatedTeamLinkKind
    )
      ? row.rawKind === "other" && inferredKind !== "other"
        ? inferredKind
        : (row.rawKind as RelatedTeamLinkKind)
      : inferredKind;

    const effectiveLabel =
      row.label || getRelatedTeamLinkKindDefaultLabel(kind);

    if (!urlCheck.ok || !urlCheck.url) {
      return {
        ok: false,
        error: `リンク「${effectiveLabel}」: ${
          urlCheck.ok ? "URLを入力してください" : urlCheck.error
        }`,
      };
    }

    const urlKey = urlCheck.url.toLowerCase();
    if (seenUrls.has(urlKey)) {
      continue;
    }
    seenUrls.add(urlKey);

    const id =
      row.rawId && !seenIds.has(row.rawId)
        ? row.rawId
        : createRelatedTeamLinkId();
    seenIds.add(id);

    normalized.push({
      id,
      kind,
      label: effectiveLabel,
      url: urlCheck.url,
    });
  }

  return { ok: true, links: normalized };
}

export function serializeRelatedTeamLinksJson(
  links: ReadonlyArray<RelatedTeamLinkItem>
): string | null {
  if (!links || links.length === 0) return null;
  return JSON.stringify(links);
}

/**
 * 試合結果の対戦相手名と関連チーム名を突合するための正規化キー生成
 */
export function normalizeOpponentMatchKey(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "";
  let s = raw
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
    )
    .replace(/\u3000/g, " ")
    .trim();

  // 先頭の「vs」「VS.」「対 」などを除去
  s = s.replace(/^(?:vs\.?|対)\s+/i, "").trim();
  // 末尾の敬称「様」「さん」を除去
  s = s.replace(/(?:様|さん)$/, "").trim();
  // 空白を完全除去して小文字化
  return s.replace(/\s+/g, "").toLowerCase();
}

/**
 * 「〇〇ベアーズ A」「〇〇ベアーズ(B)」「〇〇シニア 1軍」等の編成サフィックスを除いたベースクラブ名キー
 */
export function stripSquadSuffixFromMatchKey(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "";
  let s = raw
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
    )
    .replace(/\u3000/g, " ")
    .trim();

  s = s.replace(/^(?:vs\.?|対)\s+/i, "").trim();
  s = s.replace(/(?:様|さん)$/, "").trim();

  // 括弧付きまたは空白区切りの編成表記を末尾から除去
  s = s
    .replace(
      /(?:[\s　]+|[（(])(?:[ABabＣｃ123一二三]チーム|[ABab123]編成|[123一二三]軍|レギュラー|ジュニア|スーパージュニア|キッズ|[456四五六]年生?|[ABab])(?:[)）])?$/u,
      ""
    )
    .trim();

  const key = s.replace(/\s+/g, "").toLowerCase();
  // 短すぎるキー（2文字以下）での誤マッチ防止
  return key.length >= 3 ? key : "";
}

export function extractOpponentMatchKeys(
  name: string | null | undefined,
  shortName?: string | null
): string[] {
  const keys = new Set<string>();
  const primary = normalizeOpponentMatchKey(name);
  if (primary) keys.add(primary);

  const strippedPrimary = stripSquadSuffixFromMatchKey(name);
  if (strippedPrimary) keys.add(strippedPrimary);

  const shortKey = normalizeOpponentMatchKey(shortName);
  if (shortKey && shortKey.length >= 3) {
    keys.add(shortKey);
  }
  return Array.from(keys);
}

const PLACEHOLDER_OPPONENT_PATTERNS = new Set([
  "",
  "-",
  "ー",
  "未定",
  "対戦相手未定",
  "相手未定",
  "調整中",
  "tbd",
  "紅白戦",
  "自チーム",
  "合同練習",
]);

export function isPlaceholderOpponentName(raw: string | null | undefined): boolean {
  const key = normalizeOpponentMatchKey(raw);
  if (!key || key.length < 2) return true;
  return PLACEHOLDER_OPPONENT_PATTERNS.has(key);
}

/**
 * AI一括収集で連盟ページURLをサーバー側から取得する際の SSRF 防止バリデータ
 * - http / https のみ許可
 * - localhost / ローカルドメイン / IPv6リテラル / プライベート・ループバック・リンクローカル IPv4 / 認証情報付きURL / 非標準ポートを遮断
 */
export function isSafePublicFetchUrl(rawUrl: string): {
  ok: boolean;
  url?: string;
  error?: string;
} {
  const normalizedInput = normalizeHttpUrlInput(rawUrl);
  const basicCheck = validateSafeHttpUrl(normalizedInput, { allowEmpty: false });
  if (!basicCheck.ok || !basicCheck.url) {
    return {
      ok: false,
      error: basicCheck.ok ? "URLを入力してください" : basicCheck.error,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(basicCheck.url);
  } catch {
    return { ok: false, error: "有効なURL形式で入力してください" };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, error: "認証情報を含むURLは指定できません" };
  }

  if (parsed.port && parsed.port !== "80" && parsed.port !== "443") {
    return { ok: false, error: "標準ポート（80/443）以外のURLは指定できません" };
  }

  const host = parsed.hostname.toLowerCase();
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".arpa") ||
    host.startsWith("[") ||
    host.includes(":") ||
    !host.includes(".")
  ) {
    return { ok: false, error: "公開WebサイトのURLを指定してください" };
  }

  // 純粋な数値ホスト名（10進整数IP表現など）を拒否
  if (/^\d+$/.test(host)) {
    return { ok: false, error: "公開WebサイトのドメインURLを指定してください" };
  }

  // IPv4 リテラルの場合はプライベート・予約済みレンジを厳格遮断
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = [
      Number(ipv4Match[1]),
      Number(ipv4Match[2]),
      Number(ipv4Match[3]),
      Number(ipv4Match[4]),
    ];
    if (octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
      return { ok: false, error: "不正なIPアドレスです" };
    }
    const [a, b] = octets;
    const isPrivateOrReserved =
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224;
    if (isPrivateOrReserved) {
      return { ok: false, error: "ローカル・内部ネットワークのURLは指定できません" };
    }
  }

  return { ok: true, url: parsed.toString() };
}
