// filepath: src/lib/liff/team-links-schema.ts
import { validateSafeHttpUrl } from "@/lib/utils";

export const MAX_SUB_LINKS_PER_LINK = 15;
export const MAX_SUB_LINK_TITLE_LENGTH = 100;
export const MAX_SUB_LINK_NOTE_LENGTH = 200;

export interface TeamSubLinkItem {
  id: string;
  title: string;
  url: string;
  note?: string | null;
}

export interface TeamSubLinkDraft {
  id: string;
  title: string;
  url: string;
  note: string;
}

export function createSubLinkId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `sub_${crypto.randomUUID().slice(0, 12)}`;
  }
  return `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptySubLinkDraft(): TeamSubLinkDraft {
  return {
    id: createSubLinkId(),
    title: "",
    url: "",
    note: "",
  };
}

export function toSubLinkDrafts(
  subLinks: ReadonlyArray<TeamSubLinkItem> | null | undefined
): TeamSubLinkDraft[] {
  if (!subLinks || subLinks.length === 0) return [];
  return subLinks.map((item) => ({
    id: item.id || createSubLinkId(),
    title: item.title || "",
    url: item.url || "",
    note: item.note || "",
  }));
}

/**
 * スキーム省略時（例: `example.com/bracket`）に `https://` を自動付与する
 */
export function normalizeHttpUrlInput(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

/**
 * DB保存済み JSON 文字列から安全な TeamSubLinkItem[] を復元する
 */
export function parseSubLinksJson(
  raw: string | null | undefined
): TeamSubLinkItem[] {
  if (!raw || typeof raw !== "string") return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return [];

    const result: TeamSubLinkItem[] = [];
    const seenIds = new Set<string>();

    for (let i = 0; i < parsed.length; i += 1) {
      if (result.length >= MAX_SUB_LINKS_PER_LINK) break;
      const entry = parsed[i];
      if (!entry || typeof entry !== "object") continue;

      const record = entry as Record<string, unknown>;
      const title =
        typeof record.title === "string"
          ? record.title.trim().slice(0, MAX_SUB_LINK_TITLE_LENGTH)
          : "";
      const rawUrl = typeof record.url === "string" ? record.url.trim() : "";
      if (!title || !rawUrl) continue;

      const urlCheck = validateSafeHttpUrl(rawUrl, { allowEmpty: false });
      if (!urlCheck.ok || !urlCheck.url) continue;

      const rawId =
        typeof record.id === "string" ? record.id.trim().slice(0, 64) : "";
      const id =
        rawId && !seenIds.has(rawId) ? rawId : `sub_${i + 1}_${result.length + 1}`;
      seenIds.add(id);

      const rawNote =
        typeof record.note === "string"
          ? record.note.trim().slice(0, MAX_SUB_LINK_NOTE_LENGTH)
          : "";

      result.push({
        id,
        title,
        url: urlCheck.url,
        note: rawNote || null,
      });
    }

    return result;
  } catch {
    return [];
  }
}

/**
 * クライアント・サーバー共通のサブリンク入力バリデーション＆正規化
 * タイトル・URL・メモすべて空の未入力行は自動的にスキップする
 */
export function validateAndNormalizeSubLinksInput(
  input: unknown
):
  | { ok: true; subLinks: TeamSubLinkItem[] }
  | { ok: false; error: string } {
  if (input === undefined || input === null) {
    return { ok: true, subLinks: [] };
  }
  if (!Array.isArray(input)) {
    return { ok: false, error: "サブリンクのデータ形式が正しくありません" };
  }

  const nonEmptyEntries: Array<{
    rawId: string;
    title: string;
    rawUrl: string;
    note: string;
  }> = [];

  for (const item of input) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "サブリンクの項目データが不正です" };
    }
    const record = item as Record<string, unknown>;
    const rawId =
      typeof record.id === "string" ? record.id.trim().slice(0, 64) : "";
    const title =
      typeof record.title === "string"
        ? record.title.trim().slice(0, MAX_SUB_LINK_TITLE_LENGTH)
        : "";
    const rawUrl = typeof record.url === "string" ? record.url.trim() : "";
    const note =
      typeof record.note === "string"
        ? record.note.trim().slice(0, MAX_SUB_LINK_NOTE_LENGTH)
        : "";

    // 完全未入力の空枠は自動除外
    if (!title && !rawUrl && !note) {
      continue;
    }
    nonEmptyEntries.push({ rawId, title, rawUrl, note });
  }

  if (nonEmptyEntries.length > MAX_SUB_LINKS_PER_LINK) {
    return {
      ok: false,
      error: `サブリンクは1つのメインリンクにつき最大${MAX_SUB_LINKS_PER_LINK}件まで登録できます`,
    };
  }

  const normalized: TeamSubLinkItem[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < nonEmptyEntries.length; i += 1) {
    const row = nonEmptyEntries[i];
    const rowNumber = i + 1;

    if (!row.title) {
      return {
        ok: false,
        error: `サブリンク #${rowNumber} のリンク名を入力してください`,
      };
    }
    if (!row.rawUrl) {
      return {
        ok: false,
        error: `サブリンク「${row.title}」のURLを入力してください`,
      };
    }

    const candidateUrl = normalizeHttpUrlInput(row.rawUrl);
    const urlCheck = validateSafeHttpUrl(candidateUrl, { allowEmpty: false });
    if (!urlCheck.ok || !urlCheck.url) {
      return {
        ok: false,
        error: `サブリンク「${row.title}」: ${
          urlCheck.ok ? "URLを入力してください" : urlCheck.error
        }`,
      };
    }

    const id =
      row.rawId && !seenIds.has(row.rawId) ? row.rawId : createSubLinkId();
    seenIds.add(id);

    normalized.push({
      id,
      title: row.title,
      url: urlCheck.url,
      note: row.note || null,
    });
  }

  return { ok: true, subLinks: normalized };
}

export function serializeSubLinksJson(
  subLinks: ReadonlyArray<TeamSubLinkItem>
): string | null {
  if (!subLinks || subLinks.length === 0) return null;
  return JSON.stringify(subLinks);
}
