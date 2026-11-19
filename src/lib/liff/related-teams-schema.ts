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
  hasExistingLinks?: boolean;
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

/**
 * 手入力やAI出力でよくある `@account_id` やドット無しハンドル名、`instagram.com/@handle` 等の表記揺れを
 * 正規の `https://...` URLへ自動補正する
 */
export function normalizeRelatedTeamLinkUrlInput(
  rawUrl: string,
  kind?: RelatedTeamLinkKind
): string {
  const trimmed = rawUrl.trim().replace(/^＠/u, "@");
  if (!trimmed) return "";

  // 1. `@handle` 形式（Instagram / X / YouTube / LINE公式 / Facebook）の自動URL展開
  if (trimmed.startsWith("@")) {
    const handle = trimmed
      .slice(1)
      .trim()
      .replace(/^\/+|\/+$/g, "");
    if (!handle || /\s/.test(handle)) {
      return normalizeHttpUrlInput(trimmed);
    }
    if (kind === "x") {
      return `https://x.com/${handle}`;
    }
    if (kind === "youtube") {
      return `https://www.youtube.com/@${handle}`;
    }
    if (kind === "line") {
      return `https://line.me/R/ti/p/@${handle}`;
    }
    if (kind === "facebook") {
      return `https://www.facebook.com/${handle}`;
    }
    return `https://www.instagram.com/${handle}/`;
  }

  // 2. スキームもドットもスラッシュも含まない純粋なアカウントID文字列がSNS種別欄に入力された場合
  if (
    !/[.:/\s]/.test(trimmed) &&
    /^[a-z0-9._-]{2,40}$/i.test(trimmed)
  ) {
    if (kind === "instagram") {
      return `https://www.instagram.com/${trimmed}/`;
    }
    if (kind === "x") {
      return `https://x.com/${trimmed}`;
    }
    if (kind === "youtube") {
      return `https://www.youtube.com/@${trimmed}`;
    }
    if (kind === "facebook") {
      return `https://www.facebook.com/${trimmed}`;
    }
    if (kind === "line") {
      return `https://line.me/R/ti/p/@${trimmed}`;
    }
  }

  const normalized = normalizeHttpUrlInput(trimmed);

  // 3. `instagram.com/@handle` や `x.com/@handle` の誤 `@` 付与を正規パスへ補正
  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    const segs = parsed.pathname.split("/").filter(Boolean);
    if (segs.length >= 1 && segs[0].startsWith("@") && segs[0].length > 1) {
      if (
        host === "instagram.com" ||
        host === "www.instagram.com" ||
        host === "m.instagram.com"
      ) {
        segs[0] = segs[0].slice(1);
        parsed.pathname = `/${segs.join("/")}/`;
        return parsed.toString();
      }
      if (
        host === "x.com" ||
        host === "www.x.com" ||
        host === "twitter.com" ||
        host === "www.twitter.com"
      ) {
        segs[0] = segs[0].slice(1);
        parsed.pathname = `/${segs.join("/")}`;
        return parsed.toString();
      }
    }
  } catch {
    // keep normalized as-is for downstream validator
  }

  return normalized;
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

      const rawLabel =
        typeof record.label === "string"
          ? record.label.trim().slice(0, MAX_RELATED_TEAM_LINK_LABEL_LENGTH)
          : "";
      const rawKind = typeof record.kind === "string" ? record.kind.trim() : "";
      const hintKind: RelatedTeamLinkKind | undefined = VALID_LINK_KINDS.has(
        rawKind as RelatedTeamLinkKind
      )
        ? (rawKind as RelatedTeamLinkKind)
        : undefined;

      const normalizedUrl = normalizeRelatedTeamLinkUrlInput(rawUrl, hintKind);
      const urlCheck = validateSafeHttpUrl(normalizedUrl, { allowEmpty: false });
      if (!urlCheck.ok || !urlCheck.url) continue;

      const urlKey = urlCheck.url.toLowerCase();
      if (seenUrls.has(urlKey)) continue;
      seenUrls.add(urlKey);

      const resolvedKind: RelatedTeamLinkKind = hintKind
        ? hintKind === "other"
          ? inferRelatedTeamLinkKind(urlCheck.url, rawLabel)
          : hintKind
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
    const hintKind: RelatedTeamLinkKind | undefined = VALID_LINK_KINDS.has(
      row.rawKind as RelatedTeamLinkKind
    )
      ? (row.rawKind as RelatedTeamLinkKind)
      : inferRelatedTeamLinkKind("", row.label) !== "other"
        ? inferRelatedTeamLinkKind("", row.label)
        : undefined;
    const candidateUrl = normalizeRelatedTeamLinkUrlInput(row.rawUrl, hintKind);
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

const BARE_MULTI_TENANT_PORTAL_HOSTS = new Set([
  "89dream.jp",
  "www.89dream.jp",
  "ikz.jp",
  "www.ikz.jp",
  "netto.jp",
  "www.netto.jp",
  "sposuru.com",
  "www.sposuru.com",
  "teams.one",
  "www.teams.one",
  "ameblo.jp",
  "www.ameblo.jp",
  "note.com",
  "www.note.com",
  "jimdofree.com",
  "www.jimdo.com",
  "jp.jimdo.com",
  "wix.com",
  "www.wix.com",
  "fc2.com",
  "web.fc2.com",
  "blog.fc2.com",
  "livedoor.jp",
  "blog.livedoor.jp",
  "hatenablog.com",
  "pop.co.jp",
  "www.pop.co.jp",
  "jsbb.or.jp",
  "www.jsbb.or.jp",
]);

const INSTAGRAM_RESERVED_SEGMENTS = new Set([
  "p",
  "reel",
  "reels",
  "stories",
  "explore",
  "accounts",
  "about",
  "legal",
  "developer",
  "press",
  "direct",
  "challenge",
]);

const X_RESERVED_SEGMENTS = new Set([
  "home",
  "explore",
  "search",
  "login",
  "logout",
  "i",
  "intent",
  "share",
  "settings",
  "tos",
  "privacy",
  "hashtag",
]);

/**
 * AI出力URLから「SNSやポータルのトップページのみ」「Google内部リダイレクトURL」「プレースホルダー」「エラーURL」を除外する判定
 */
export function isUselessAiTeamUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();

  if (
    lower.includes("example.com") ||
    lower.includes("example.jp") ||
    lower.includes("example.org") ||
    lower.includes("sample.jp") ||
    lower.includes("sample.com") ||
    lower.includes("xxxx") ||
    lower.includes("your-team") ||
    lower.includes("dummy") ||
    lower.includes("vertexaisearch.cloud.google.com")
  ) {
    return true;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return true;
  }

  const host = parsed.hostname.toLowerCase();
  const segments = parsed.pathname
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  const firstSeg = (segments[0] || "").toLowerCase();

  // 明らかなエラー・閉鎖パス
  if (
    firstSeg === "404" ||
    firstSeg === "404.html" ||
    firstSeg === "error" ||
    firstSeg === "error.html" ||
    firstSeg === "notfound" ||
    firstSeg === "not_found"
  ) {
    return true;
  }

  // Google 検索結果・リダイレクトページ自体はチーム公式URLではない
  if (
    (host === "www.google.com" ||
      host === "google.com" ||
      host === "www.google.co.jp" ||
      host === "search.yahoo.co.jp") &&
    firstSeg !== "maps"
  ) {
    return true;
  }

  // Instagram: アカウント識別子または個別投稿パスが必須
  if (
    host === "instagram.com" ||
    host === "www.instagram.com" ||
    host === "m.instagram.com" ||
    host === "instagr.am"
  ) {
    if (segments.length === 0) return true;
    if (
      firstSeg === "accounts" ||
      firstSeg === "explore" ||
      firstSeg === "about" ||
      firstSeg === "legal" ||
      firstSeg === "developer" ||
      firstSeg === "challenge"
    ) {
      return true;
    }
    if ((firstSeg === "p" || firstSeg === "reel" || firstSeg === "reels") && !segments[1]) {
      return true;
    }
    if (
      !INSTAGRAM_RESERVED_SEGMENTS.has(firstSeg) &&
      !/^[a-z0-9._]{2,30}$/i.test(segments[0])
    ) {
      return true;
    }
    return false;
  }

  // X (旧Twitter): ハンドルが必須
  if (
    host === "x.com" ||
    host === "www.x.com" ||
    host === "twitter.com" ||
    host === "www.twitter.com" ||
    host === "mobile.twitter.com"
  ) {
    if (segments.length === 0) return true;
    if (X_RESERVED_SEGMENTS.has(firstSeg)) return true;
    if (!/^[a-z0-9_]{1,15}$/i.test(segments[0])) return true;
    return false;
  }

  // YouTube: チャンネルまたは動画パスが必須
  if (
    host === "youtube.com" ||
    host === "www.youtube.com" ||
    host === "m.youtube.com"
  ) {
    if (segments.length === 0) return true;
    if (
      firstSeg === "results" ||
      firstSeg === "feed" ||
      firstSeg === "account" ||
      firstSeg === "about"
    ) {
      return true;
    }
    return false;
  }
  if (host === "youtu.be") {
    return segments.length === 0;
  }

  // Facebook: ページパスまたは profile.php?id=... が必須（シェアボタンURL除外）
  if (
    host === "facebook.com" ||
    host === "www.facebook.com" ||
    host === "m.facebook.com" ||
    host === "fb.com"
  ) {
    if (segments.length === 0) return true;
    if (
      firstSeg === "login" ||
      firstSeg === "login.php" ||
      firstSeg === "sharer" ||
      firstSeg === "sharer.php" ||
      firstSeg === "share.php" ||
      firstSeg === "dialog" ||
      firstSeg === "plugins" ||
      firstSeg === "help" ||
      firstSeg === "policies" ||
      firstSeg === "recover"
    ) {
      return true;
    }
    if (firstSeg === "profile.php" && !parsed.searchParams.get("id")) {
      return true;
    }
    return false;
  }

  // LINE シェアプラグイン・テキスト共有URLは公式アカウントではないため除外
  if (host === "social-plugins.line.me") {
    return true;
  }

  // LINE / Threads / TikTok: トップページ単体は不可
  if (
    host === "line.me" ||
    host === "page.line.me" ||
    host === "lin.ee" ||
    host === "threads.net" ||
    host === "www.threads.net" ||
    host === "tiktok.com" ||
    host === "www.tiktok.com"
  ) {
    if (segments.length === 0) return true;
    if (firstSeg === "ja" || firstSeg === "en" || firstSeg === "login") {
      return segments.length <= 1;
    }
    if (
      host === "line.me" &&
      firstSeg === "r" &&
      (segments[1] || "").toLowerCase() === "msg"
    ) {
      return true;
    }
    return false;
  }

  // ポータルサービス自体のルートトップ（削除済みチームの転送先を含む）は除外
  if (BARE_MULTI_TENANT_PORTAL_HOSTS.has(host) && segments.length === 0) {
    return true;
  }

  return false;
}

/**
 * SNSアカウントURLから正規化ハンドルID（例: "instagram:tama_bears", "x:tamabears"）を抽出する
 * 検索グラウンディング元URLや連盟ページ内リンクとの実在照合に使用
 */
export function extractCanonicalSnsIdentity(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const segments = parsed.pathname
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return null;
  const first = segments[0].toLowerCase();

  if (
    host === "instagram.com" ||
    host === "www.instagram.com" ||
    host === "m.instagram.com" ||
    host === "instagr.am"
  ) {
    if (INSTAGRAM_RESERVED_SEGMENTS.has(first)) {
      return segments[1] ? `instagram:${first}:${segments[1].toLowerCase()}` : null;
    }
    return `instagram:${first}`;
  }

  if (
    host === "x.com" ||
    host === "www.x.com" ||
    host === "twitter.com" ||
    host === "www.twitter.com" ||
    host === "mobile.twitter.com"
  ) {
    if (X_RESERVED_SEGMENTS.has(first)) return null;
    return `x:${first}`;
  }

  if (
    host === "facebook.com" ||
    host === "www.facebook.com" ||
    host === "m.facebook.com" ||
    host === "fb.com"
  ) {
    if (first === "profile.php") {
      const id = parsed.searchParams.get("id");
      return id ? `facebook:id:${id}` : null;
    }
    if (first === "people" && segments[1]) {
      return `facebook:people:${segments[1].toLowerCase()}`;
    }
    return `facebook:${first}`;
  }

  if (
    host === "youtube.com" ||
    host === "www.youtube.com" ||
    host === "m.youtube.com"
  ) {
    if (first.startsWith("@")) return `youtube:${first}`;
    if ((first === "channel" || first === "c" || first === "user") && segments[1]) {
      return `youtube:${first}:${segments[1].toLowerCase()}`;
    }
    return null;
  }

  if (host === "threads.net" || host === "www.threads.net") {
    return `threads:${first.replace(/^@/, "")}`;
  }

  if (host === "tiktok.com" || host === "www.tiktok.com") {
    return `tiktok:${first.replace(/^@/, "")}`;
  }

  if (host === "line.me" || host === "page.line.me" || host === "lin.ee") {
    return `line:${segments.join("/").toLowerCase()}`;
  }

  return null;
}

const SUSPICIOUS_GENERIC_SNS_HANDLES = new Set([
  "sample",
  "example",
  "dummy",
  "test",
  "official",
  "baseball",
  "youthbaseball",
  "juniorbaseball",
  "account",
  "username",
  "userid",
  "yourname",
  "your_account",
  "your_team",
  "teamname",
  "team_name",
  "instagram",
  "twitter",
  "facebook",
  "youtube",
  "line",
  "xxxx",
  "0000",
  "1234",
  "12345",
  "abc",
  "abcd",
]);

const PLATFORM_OFFICIAL_SNS_HANDLES = new Set([
  "ameba_official",
  "ameblo_official",
  "cyberagent",
  "sposuru",
  "sposuru_official",
  "89dream",
  "ikz",
  "teams_one",
  "wix",
  "wixjp",
  "jimdo",
  "jimdo_jp",
  "fc2info",
  "blog.fc2",
  "livedoorblog",
  "hatenablog",
  "note_com",
  "note_pr",
  "wordpress",
  "wordpressdotcom",
  "peraichi",
  "strikingly",
  "studio_inc",
  "studiodesignapp",
  "google",
  "googlejapan",
  "yahoojp",
]);

/**
 * AIがハルシネーションで埋めがちなプレースホルダーSNSハンドル（`sample`, `official` 単体, `team_name`, `xxxx` 等）を検出
 * ※実在チームの `xxx_official` や `baseball_xxx` 等は正常通過させる
 */
export function isSuspiciousGenericSnsHandle(rawUrl: string): boolean {
  const identity = extractCanonicalSnsIdentity(rawUrl);
  if (!identity) return false;

  const parts = identity.split(":");
  const handle = (parts[parts.length - 1] || "")
    .replace(/^@/, "")
    .trim()
    .toLowerCase();
  if (!handle) return true;

  if (SUSPICIOUS_GENERIC_SNS_HANDLES.has(handle)) {
    return true;
  }
  if (
    /^(?:sample|example|dummy)[_.-]/i.test(handle) ||
    /[_.-](?:sample|example|dummy)$/i.test(handle) ||
    /^x{3,}$/i.test(handle)
  ) {
    return true;
  }
  return false;
}

/**
 * ブログ・HP作成サービス自体（Ameba / Wix / Jimdo / スポスル / 89dream 等）の運営公式SNSアカウントかどうかを判定
 * チームHP内のフッターから運営会社SNSを誤抽出しないために使用
 */
export function isPlatformOfficialSnsAccount(rawUrl: string): boolean {
  const identity = extractCanonicalSnsIdentity(rawUrl);
  if (!identity) return false;
  const parts = identity.split(":");
  const handle = (parts[parts.length - 1] || "")
    .replace(/^@/, "")
    .trim()
    .toLowerCase();
  return Boolean(handle && PLATFORM_OFFICIAL_SNS_HANDLES.has(handle));
}

/**
 * HTTP 200 を返しつつ実際は「ページが見つかりません」「サービス終了」「中古ドメイン販売」になっているソフト404ページの判定
 */
export function hasSoft404HtmlSignature(htmlSnippet: string): boolean {
  if (!htmlSnippet) return false;

  const titleMatch = htmlSnippet.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const titleText = (titleMatch ? titleMatch[1] : "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  if (
    titleText.includes("404 not found") ||
    titleText === "404" ||
    titleText === "not found" ||
    titleText.includes("page not found") ||
    titleText.includes("ページが見つかりません") ||
    titleText.includes("お探しのページは") ||
    titleText.includes("ページを表示できません") ||
    titleText.includes("サイトが見つかりません") ||
    titleText.includes("ホームページが見つかりません") ||
    titleText.includes("公開されていません") ||
    titleText.includes("サービス終了") ||
    titleText.includes("domain for sale") ||
    titleText.includes("このドメインはお名前.com")
  ) {
    return true;
  }

  const bodyLower = htmlSnippet.slice(0, 8000).toLowerCase();
  if (
    bodyLower.includes("このホームページは公開されていません") ||
    bodyLower.includes("指定されたページ（url）は見つかりません") ||
    bodyLower.includes("指定されたページは存在しません") ||
    bodyLower.includes("お探しのページは見つかりませんでした") ||
    bodyLower.includes("このページはご利用いただけません") ||
    bodyLower.includes("sorry, this page isn't available") ||
    bodyLower.includes("this domain may be for sale") ||
    bodyLower.includes("parked free, courtesy of") ||
    bodyLower.includes("sedoparking.com") ||
    bodyLower.includes("hugedomains.com")
  ) {
    return true;
  }

  return false;
}

/**
 * 大規模連盟（40〜70チーム等）でAI出力トークンが末尾で途切れた場合でも、
 * 完成している全てのチームオブジェクト（`candidates` 配列要素）を欠損なく救出するパーサー
 */
export function parseOrSalvageAiJsonObject(
  rawText: string
): Record<string, unknown> | null {
  if (!rawText || typeof rawText !== "string") return null;

  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const cleanText = fenced ? fenced[1].trim() : rawText.trim();

  const firstBrace = cleanText.indexOf("{");
  if (firstBrace < 0) return null;

  // 1. まずは通常の完全なJSONパースを試行
  const lastBrace = cleanText.lastIndexOf("}");
  if (lastBrace > firstBrace) {
    try {
      const parsed: unknown = JSON.parse(
        cleanText.slice(firstBrace, lastBrace + 1)
      );
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // 途中切れの場合は下のサルベージ処理へ進む
    }
  }

  // 2. 出力トークン上限等で途中切断された `"candidates": [ ...` から完結済み `{...}` 要素をすべて救出
  const tail = cleanText.slice(firstBrace);
  const candidatesKeyMatch = /"candidates"\s*:\s*\[/.exec(tail);
  if (!candidatesKeyMatch) return null;

  const arrayOpenIdx =
    candidatesKeyMatch.index + candidatesKeyMatch[0].length;
  const salvagedItems: Record<string, unknown>[] = [];

  let inString = false;
  let escaped = false;
  let objDepth = 0;
  let objStart = -1;

  for (let i = arrayOpenIdx; i < tail.length; i += 1) {
    const ch = tail[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") {
      if (objDepth === 0) {
        objStart = i;
      }
      objDepth += 1;
    } else if (ch === "}") {
      if (objDepth > 0) {
        objDepth -= 1;
        if (objDepth === 0 && objStart >= 0) {
          const itemSlice = tail.slice(objStart, i + 1);
          try {
            const parsedItem: unknown = JSON.parse(itemSlice);
            if (
              parsedItem &&
              typeof parsedItem === "object" &&
              !Array.isArray(parsedItem)
            ) {
              salvagedItems.push(parsedItem as Record<string, unknown>);
            }
          } catch {
            // 不完全な要素はスキップ
          }
          objStart = -1;
        }
      }
    } else if (ch === "]" && objDepth === 0) {
      break;
    }
  }

  if (salvagedItems.length === 0) {
    return null;
  }

  const leagueTitleMatch = tail.match(/"leagueTitle"\s*:\s*"((?:\\.|[^"\\])*)"/);
  const summaryNoteMatch = tail.match(/"summaryNote"\s*:\s*"((?:\\.|[^"\\])*)"/);

  const decodeJsonStr = (raw: string | undefined): string => {
    if (!raw) return "";
    try {
      return JSON.parse(`"${raw}"`) as string;
    } catch {
      return raw;
    }
  };

  return {
    leagueTitle: decodeJsonStr(leagueTitleMatch?.[1]),
    summaryNote: decodeJsonStr(summaryNoteMatch?.[1]),
    candidates: salvagedItems,
  };
}

/**
 * キャッシュ（L1/L2/L3 localStorage）やAPIレスポンスから復元された関連チーム配列を安全に正規化し、
 * 旧スキーマや欠損フィールド（`leagueName: null` / `links: undefined` 等）によるレンダー時 TypeError を完全に防ぐ
 */
export function sanitizeRelatedTeamItems(raw: unknown): RelatedTeamItem[] {
  if (!Array.isArray(raw)) return [];
  const result: RelatedTeamItem[] = [];

  for (let idx = 0; idx < raw.length; idx += 1) {
    const entry = raw[idx];
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;

    const id =
      typeof rec.id === "string" && rec.id.trim()
        ? rec.id.trim()
        : `rt-fallback-${idx}`;
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    if (!name) continue;

    const relationType = normalizeRelationType(rec.relationType);
    const relationLabel =
      typeof rec.relationLabel === "string" && rec.relationLabel.trim()
        ? rec.relationLabel.trim()
        : getRelationShortLabel(relationType);

    const scope: "organization" | "team" =
      rec.scope === "team" ? "team" : "organization";
    const scopeLabel =
      typeof rec.scopeLabel === "string" && rec.scopeLabel.trim()
        ? rec.scopeLabel.trim()
        : scope === "team"
          ? "編成"
          : "チーム全体";

    const safeLinks: RelatedTeamLinkItem[] = [];
    if (Array.isArray(rec.links)) {
      for (let lIdx = 0; lIdx < rec.links.length; lIdx += 1) {
        const lk = rec.links[lIdx];
        if (!lk || typeof lk !== "object") continue;
        const lRec = lk as Record<string, unknown>;
        const url = typeof lRec.url === "string" ? lRec.url.trim() : "";
        if (!url) continue;
        const rawKind = typeof lRec.kind === "string" ? lRec.kind.trim() : "";
        const rawLabel =
          typeof lRec.label === "string" ? lRec.label.trim() : "";
        const kind: RelatedTeamLinkKind = VALID_LINK_KINDS.has(
          rawKind as RelatedTeamLinkKind
        )
          ? (rawKind as RelatedTeamLinkKind)
          : inferRelatedTeamLinkKind(url, rawLabel);
        safeLinks.push({
          id:
            typeof lRec.id === "string" && lRec.id.trim()
              ? lRec.id.trim()
              : `rtlink-safe-${idx}-${lIdx}`,
          kind,
          label: rawLabel || getRelatedTeamLinkKindDefaultLabel(kind),
          url,
        });
      }
    }

    let safeStats: RelatedTeamMatchStats | null = null;
    if (rec.matchStats && typeof rec.matchStats === "object") {
      const st = rec.matchStats as Record<string, unknown>;
      const totalFinished =
        typeof st.totalFinished === "number" && Number.isFinite(st.totalFinished)
          ? st.totalFinished
          : 0;
      const scheduledCount =
        typeof st.scheduledCount === "number" &&
        Number.isFinite(st.scheduledCount)
          ? st.scheduledCount
          : 0;
      if (totalFinished > 0 || scheduledCount > 0) {
        safeStats = {
          totalFinished,
          wins:
            typeof st.wins === "number" && Number.isFinite(st.wins)
              ? st.wins
              : 0,
          losses:
            typeof st.losses === "number" && Number.isFinite(st.losses)
              ? st.losses
              : 0,
          draws:
            typeof st.draws === "number" && Number.isFinite(st.draws)
              ? st.draws
              : 0,
          scheduledCount,
          lastMatchDate:
            typeof st.lastMatchDate === "string" && st.lastMatchDate.trim()
              ? st.lastMatchDate.trim()
              : null,
          lastScoreSummary:
            typeof st.lastScoreSummary === "string" &&
            st.lastScoreSummary.trim()
              ? st.lastScoreSummary.trim()
              : null,
        };
      }
    }

    result.push({
      id,
      name,
      shortName: typeof rec.shortName === "string" ? rec.shortName : "",
      leagueName: typeof rec.leagueName === "string" ? rec.leagueName : "",
      relationType,
      relationLabel,
      teamCategory:
        typeof rec.teamCategory === "string" ? rec.teamCategory : "",
      area: typeof rec.area === "string" ? rec.area : "",
      homeGround: typeof rec.homeGround === "string" ? rec.homeGround : "",
      websiteUrl: typeof rec.websiteUrl === "string" ? rec.websiteUrl : "",
      links: safeLinks,
      description: typeof rec.description === "string" ? rec.description : "",
      scope,
      scopeLabel,
      isFavorite: Boolean(rec.isFavorite),
      priority:
        typeof rec.priority === "number" && Number.isFinite(rec.priority)
          ? rec.priority
          : 0,
      matchStats: safeStats,
    });
  }

  return result;
}

export function sanitizeUnregisteredOpponents(
  raw: unknown
): UnregisteredOpponentItem[] {
  if (!Array.isArray(raw)) return [];
  const result: UnregisteredOpponentItem[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const opponentName =
      typeof rec.opponentName === "string" ? rec.opponentName.trim() : "";
    if (!opponentName) continue;
    result.push({
      opponentName,
      totalFinished:
        typeof rec.totalFinished === "number" &&
        Number.isFinite(rec.totalFinished)
          ? rec.totalFinished
          : 0,
      wins:
        typeof rec.wins === "number" && Number.isFinite(rec.wins)
          ? rec.wins
          : 0,
      losses:
        typeof rec.losses === "number" && Number.isFinite(rec.losses)
          ? rec.losses
          : 0,
      draws:
        typeof rec.draws === "number" && Number.isFinite(rec.draws)
          ? rec.draws
          : 0,
      scheduledCount:
        typeof rec.scheduledCount === "number" &&
        Number.isFinite(rec.scheduledCount)
          ? rec.scheduledCount
          : 0,
      lastMatchDate:
        typeof rec.lastMatchDate === "string" && rec.lastMatchDate.trim()
          ? rec.lastMatchDate.trim()
          : null,
    });
  }

  return result;
}


