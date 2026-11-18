// filepath: src/lib/liff/scorebook-draft.ts
import type { PreprocessedScorebookImage } from "@/lib/liff/scorebook-image";
import type {
  ImportScopeMode,
  ScorebookAnalysisTimingSummary,
  ScorebookSheetStructure,
  ScorebookV2AtBat,
} from "@/types/scorebook-v2";

const DB_NAME = "iscorecloud_scorebook_draft_db";
const DB_VERSION = 1;
const STORE_NAME = "scorebook_import_drafts";
/** 下書き有効期限: 14日間 */
const MAX_DRAFT_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const IDB_TIMEOUT_MS = 2500;

export interface SavedSheetImageDraft {
  fileName: string;
  enhancePencil: boolean;
  processed: PreprocessedScorebookImage | null;
}

export interface ScorebookDraftMeta {
  savedAt: number;
  step: 1 | 2 | 3;
  selectedMatchId: string;
  importScope: ImportScopeMode;
  hasImages: boolean;
  atBatCount: number;
}

export interface ScorebookImportDraft {
  key: string;
  savedAt: number;
  step: 1 | 2 | 3;
  selectedMatchId: string;
  importScope: ImportScopeMode;
  topImage: SavedSheetImageDraft;
  bottomImage: SavedSheetImageDraft;
  legendOverride: {
    dataUrl: string;
    base64: string;
    mimeType: string;
  } | null;
  topStructure: ScorebookSheetStructure | null;
  bottomStructure: ScorebookSheetStructure | null;
  topAtBats: ScorebookV2AtBat[];
  bottomAtBats: ScorebookV2AtBat[];
  timingSummary?: ScorebookAnalysisTimingSummary | null;
}

const UNSELECTED_MATCH_BUCKET = "__unselected__";

function normalizeDraftMatchBucket(matchId?: string | null): string {
  const trimmed = (matchId || "").trim();
  return trimmed ? trimmed : UNSELECTED_MATCH_BUCKET;
}

function getLegacyDraftKey(teamId: string): string {
  return `scorebook_v2_draft_${teamId || "default"}`;
}

function getLegacyDraftMetaKey(teamId: string): string {
  return `scorebook_v2_draft_meta_${teamId || "default"}`;
}

function getDraftIndexKey(teamId: string): string {
  return `scorebook_v2_draft_index_${teamId || "default"}`;
}

function getDraftKey(teamId: string, matchId?: string | null): string {
  const trimmed = (matchId || "").trim();
  if (!trimmed || trimmed === UNSELECTED_MATCH_BUCKET) {
    return getLegacyDraftKey(teamId);
  }
  return `scorebook_v2_draft_${teamId || "default"}__m_${trimmed}`;
}

function getDraftMetaKey(teamId: string, matchId?: string | null): string {
  const trimmed = (matchId || "").trim();
  if (!trimmed || trimmed === UNSELECTED_MATCH_BUCKET) {
    return getLegacyDraftMetaKey(teamId);
  }
  return `scorebook_v2_draft_meta_${teamId || "default"}__m_${trimmed}`;
}

function isDraftMetaValid(meta: ScorebookDraftMeta | null | undefined): meta is ScorebookDraftMeta {
  return Boolean(
    meta &&
      typeof meta.savedAt === "number" &&
      Date.now() - meta.savedAt <= MAX_DRAFT_AGE_MS
  );
}

function readDraftIndexMap(teamId: string): Record<string, ScorebookDraftMeta> {
  if (typeof window === "undefined" || !window.localStorage) return {};
  const indexKey = getDraftIndexKey(teamId);
  const result: Record<string, ScorebookDraftMeta> = {};
  let dirty = false;

  try {
    const raw = window.localStorage.getItem(indexKey);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, ScorebookDraftMeta>;
      if (parsed && typeof parsed === "object") {
        for (const [bucket, meta] of Object.entries(parsed)) {
          if (isDraftMetaValid(meta)) {
            result[bucket] = meta;
          } else {
            dirty = true;
          }
        }
      }
    }
  } catch {
    // ignore corrupt index
  }

  // 旧バージョンの単一メタキーがある場合は自動マイグレーション統合
  try {
    const legacyRaw = window.localStorage.getItem(getLegacyDraftMetaKey(teamId));
    if (legacyRaw) {
      const legacyMeta = JSON.parse(legacyRaw) as ScorebookDraftMeta;
      if (isDraftMetaValid(legacyMeta)) {
        const bucket = normalizeDraftMatchBucket(legacyMeta.selectedMatchId);
        const existing = result[bucket];
        if (!existing || legacyMeta.savedAt > existing.savedAt) {
          result[bucket] = legacyMeta;
          dirty = true;
        }
      } else {
        window.localStorage.removeItem(getLegacyDraftMetaKey(teamId));
      }
    }
  } catch {
    // ignore
  }

  if (dirty) {
    try {
      window.localStorage.setItem(indexKey, JSON.stringify(result));
    } catch {
      // ignore storage quota errors
    }
  }

  return result;
}

function writeDraftIndexMap(
  teamId: string,
  map: Record<string, ScorebookDraftMeta>
): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const entries = Object.values(map).filter(isDraftMetaValid);
    if (entries.length === 0) {
      window.localStorage.removeItem(getDraftIndexKey(teamId));
      window.localStorage.removeItem(getLegacyDraftMetaKey(teamId));
      return;
    }
    window.localStorage.setItem(getDraftIndexKey(teamId), JSON.stringify(map));
    entries.sort((a, b) => b.savedAt - a.savedAt);
    window.localStorage.setItem(
      getLegacyDraftMetaKey(teamId),
      JSON.stringify(entries[0])
    );
  } catch {
    // ignore storage quota errors
  }
}

/**
 * チーム内の有効な全スコアブック下書きメタ一覧を新しい順で返す（ダブルヘッダー等の複数試合下書き管理用）
 */
export function listScorebookDraftMetas(teamId: string): ScorebookDraftMeta[] {
  const map = readDraftIndexMap(teamId);
  return Object.values(map)
    .filter(isDraftMetaValid)
    .sort((a, b) => b.savedAt - a.savedAt);
}

/**
 * ページ初期表示時にIndexedDB（数MB〜数十MBの画像データ）を一切開かず、
 * 軽量メタ情報（約150B）のみで下書きの有無を即座に判定する。
 * matchId 指定時はその試合専用の下書きメタを返し、省略時は最新の下書きメタを返す。
 */
export function peekScorebookDraftMeta(
  teamId: string,
  matchId?: string
): ScorebookDraftMeta | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  if (matchId !== undefined) {
    const trimmed = matchId.trim();
    const bucket = normalizeDraftMatchBucket(trimmed);
    const map = readDraftIndexMap(teamId);
    if (map[bucket] && isDraftMetaValid(map[bucket])) {
      return map[bucket];
    }
    try {
      const perMatchRaw = window.localStorage.getItem(
        getDraftMetaKey(teamId, trimmed)
      );
      if (perMatchRaw) {
        const parsed = JSON.parse(perMatchRaw) as ScorebookDraftMeta;
        if (isDraftMetaValid(parsed)) {
          if (!trimmed || parsed.selectedMatchId === trimmed) {
            return parsed;
          }
        } else {
          window.localStorage.removeItem(getDraftMetaKey(teamId, trimmed));
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  const list = listScorebookDraftMetas(teamId);
  return list[0] || null;
}

function extractBase64FromDataUrl(dataUrl: string): string {
  const commaIdx = dataUrl.indexOf(",");
  return commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;
}

function compactProcessedForStorage(
  processed: PreprocessedScorebookImage | null
): PreprocessedScorebookImage | null {
  if (!processed) return null;
  // dataUrl 内に同一データが含まれるため、重複する巨大 base64 と中間プレビューを除外してIndexedDB負荷を最小化
  return {
    ...processed,
    base64: "",
    unwarpedPreviewDataUrl: undefined,
  };
}

function hydrateProcessedFromStorage(
  processed: PreprocessedScorebookImage | null
): PreprocessedScorebookImage | null {
  if (!processed || !processed.dataUrl) return null;
  return {
    ...processed,
    base64: processed.base64 || extractBase64FromDataUrl(processed.dataUrl),
  };
}

function hydrateDraftRecord(result: ScorebookImportDraft): ScorebookImportDraft {
  return {
    ...result,
    topImage: {
      ...result.topImage,
      processed: hydrateProcessedFromStorage(result.topImage.processed),
    },
    bottomImage: {
      ...result.bottomImage,
      processed: hydrateProcessedFromStorage(result.bottomImage.processed),
    },
    legendOverride:
      result.legendOverride && result.legendOverride.dataUrl
        ? {
            ...result.legendOverride,
            base64:
              result.legendOverride.base64 ||
              extractBase64FromDataUrl(result.legendOverride.dataUrl),
          }
        : null,
  };
}

function openDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB is not supported"));
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("IndexedDB open timed out"));
    }, IDB_TIMEOUT_MS);

    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };

      req.onblocked = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error("IndexedDB is blocked"));
      };

      req.onsuccess = () => {
        if (settled) {
          try {
            req.result.close();
          } catch {
            // ignore
          }
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(req.result);
      };

      req.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(req.error || new Error("Failed to open IndexedDB"));
      };
    } catch (err) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    }
  });
}

/**
 * スコアブック取込の途中状態（画像・Step2骨格・Step3打席/1球編集）を試合ID単位で端末のIndexedDBに保存する
 * （ダブルヘッダー等で1日2試合あっても別々のキーに分離保存される）
 */
export async function saveScorebookDraft(
  teamId: string,
  draft: Omit<ScorebookImportDraft, "key" | "savedAt">
): Promise<number> {
  const scopedMatchId = (draft.selectedMatchId || "").trim();
  const key = getDraftKey(teamId, scopedMatchId);
  const metaKey = getDraftMetaKey(teamId, scopedMatchId);
  const savedAt = Date.now();
  const meta: ScorebookDraftMeta = {
    savedAt,
    step: draft.step,
    selectedMatchId: scopedMatchId,
    importScope: draft.importScope,
    hasImages: Boolean(draft.topImage.processed || draft.bottomImage.processed),
    atBatCount: draft.topAtBats.length + draft.bottomAtBats.length,
  };

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(metaKey, JSON.stringify(meta));
      const indexMap = readDraftIndexMap(teamId);
      indexMap[normalizeDraftMatchBucket(scopedMatchId)] = meta;
      writeDraftIndexMap(teamId, indexMap);
    }
  } catch {
    // ignore storage quota errors
  }

  const record: ScorebookImportDraft = {
    ...draft,
    selectedMatchId: scopedMatchId,
    topImage: {
      ...draft.topImage,
      processed: compactProcessedForStorage(draft.topImage.processed),
    },
    bottomImage: {
      ...draft.bottomImage,
      processed: compactProcessedForStorage(draft.bottomImage.processed),
    },
    legendOverride: draft.legendOverride
      ? {
          ...draft.legendOverride,
          base64: "",
        }
      : null,
    key,
    savedAt,
  };

  try {
    const db = await openDraftDb();
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          db.close();
        } catch {
          // ignore
        }
        reject(new Error("Draft write timed out"));
      }, IDB_TIMEOUT_MS * 2);

      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(record);
      tx.oncomplete = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        db.close();
        resolve();
      };
      tx.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        db.close();
        reject(tx.error || new Error("Failed to write draft"));
      };
      tx.onabort = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        db.close();
        reject(tx.error || new Error("Draft write aborted"));
      };
    });
    return savedAt;
  } catch {
    // プライベートブラウズ等でIndexedDBがブロックされた場合の軽量フォールバック
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const lightweight: ScorebookImportDraft = {
          ...record,
          topImage: { ...record.topImage, processed: null },
          bottomImage: { ...record.bottomImage, processed: null },
          legendOverride: null,
        };
        window.localStorage.setItem(key, JSON.stringify(lightweight));
      }
    } catch {
      // ignore storage quota errors
    }
    return savedAt;
  }
}

async function readSingleKeyFromStorage(
  key: string
): Promise<ScorebookImportDraft | null> {
  try {
    const db = await openDraftDb();
    const result = await new Promise<ScorebookImportDraft | null>(
      (resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          try {
            db.close();
          } catch {
            // ignore
          }
          reject(new Error("Draft read timed out"));
        }, IDB_TIMEOUT_MS);

        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const getReq = store.get(key);
        getReq.onsuccess = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          db.close();
          resolve((getReq.result as ScorebookImportDraft | undefined) || null);
        };
        getReq.onerror = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          db.close();
          reject(getReq.error || new Error("Failed to read draft"));
        };
      }
    );
    if (result) return hydrateDraftRecord(result);
  } catch {
    // fallback to localStorage
  }

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ScorebookImportDraft;
      return hydrateDraftRecord(parsed);
    }
  } catch {
    // ignore parse error
  }
  return null;
}

/**
 * 保存済みの下書きを読み込む（期限切れの場合は自動削除して null を返す）。
 * matchId 指定時はその試合の下書きを読み込み、未指定時は最新の下書きを読み込む。
 */
export async function loadScorebookDraft(
  teamId: string,
  matchId?: string
): Promise<ScorebookImportDraft | null> {
  const candidateKeys: string[] = [];
  const trimmedMatchId = matchId?.trim();

  if (matchId !== undefined) {
    candidateKeys.push(getDraftKey(teamId, trimmedMatchId));
    if (trimmedMatchId) {
      candidateKeys.push(getLegacyDraftKey(teamId));
    }
  } else {
    const latestMeta = peekScorebookDraftMeta(teamId);
    if (latestMeta) {
      candidateKeys.push(getDraftKey(teamId, latestMeta.selectedMatchId));
    }
    const legacyKey = getLegacyDraftKey(teamId);
    if (!candidateKeys.includes(legacyKey)) {
      candidateKeys.push(legacyKey);
    }
  }

  for (const key of candidateKeys) {
    const record = await readSingleKeyFromStorage(key);
    if (!record) continue;
    if (Date.now() - record.savedAt > MAX_DRAFT_AGE_MS) {
      await clearScorebookDraft(teamId, record.selectedMatchId || "");
      continue;
    }
    if (
      trimmedMatchId &&
      key === getLegacyDraftKey(teamId) &&
      record.selectedMatchId !== trimmedMatchId
    ) {
      continue;
    }
    return record;
  }

  return null;
}

/**
 * 保存済みの下書きを削除する。
 * matchId 指定時は該当試合の下書きのみを削除し、他試合（ダブルヘッダー2試合目等）の下書きは保護する。
 */
export async function clearScorebookDraft(
  teamId: string,
  matchId?: string
): Promise<void> {
  const keysToDelete = new Set<string>();
  const metaKeysToDelete = new Set<string>();

  if (matchId !== undefined) {
    const trimmed = matchId.trim();
    keysToDelete.add(getDraftKey(teamId, trimmed));
    metaKeysToDelete.add(getDraftMetaKey(teamId, trimmed));

    const indexMap = readDraftIndexMap(teamId);
    const bucket = normalizeDraftMatchBucket(trimmed);
    delete indexMap[bucket];
    writeDraftIndexMap(teamId, indexMap);

    // 旧キーに同一試合が残っていた場合も合わせて掃除
    if (trimmed) {
      const legacyRecord = await readSingleKeyFromStorage(
        getLegacyDraftKey(teamId)
      );
      if (legacyRecord && legacyRecord.selectedMatchId === trimmed) {
        keysToDelete.add(getLegacyDraftKey(teamId));
      }
    }
  } else {
    const allMetas = listScorebookDraftMetas(teamId);
    for (const m of allMetas) {
      keysToDelete.add(getDraftKey(teamId, m.selectedMatchId));
      metaKeysToDelete.add(getDraftMetaKey(teamId, m.selectedMatchId));
    }
    keysToDelete.add(getLegacyDraftKey(teamId));
    metaKeysToDelete.add(getLegacyDraftMetaKey(teamId));
    metaKeysToDelete.add(getDraftIndexKey(teamId));
  }

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      for (const k of keysToDelete) window.localStorage.removeItem(k);
      for (const mk of metaKeysToDelete) window.localStorage.removeItem(mk);
    }
  } catch {
    // ignore
  }

  try {
    const db = await openDraftDb();
    await new Promise<void>((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          db.close();
        } catch {
          // ignore
        }
        resolve();
      }, IDB_TIMEOUT_MS);

      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      for (const k of keysToDelete) {
        store.delete(k);
      }
      tx.oncomplete = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        db.close();
        resolve();
      };
      tx.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        db.close();
        resolve();
      };
    });
  } catch {
    // ignore
  }
}

/**
 * 復元した DataURL からブラウザ操作用の File オブジェクトを非同期高速生成する
 */
export async function reconstructFileFromDataUrlAsync(
  dataUrl: string,
  fileName = "scorebook.jpg"
): Promise<File | null> {
  if (!dataUrl) return null;
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], fileName, { type: blob.type || "image/jpeg" });
  } catch {
    try {
      return reconstructFileFromDataUrl(dataUrl, fileName);
    } catch {
      return null;
    }
  }
}

/**
 * 復元した DataURL からブラウザ操作用の File オブジェクトを再生成する
 */
export function reconstructFileFromDataUrl(
  dataUrl: string,
  fileName = "scorebook.jpg"
): File {
  const commaIdx = dataUrl.indexOf(",");
  const header = commaIdx !== -1 ? dataUrl.slice(0, commaIdx) : "";
  const b64 = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  const mimeMatch = header.match(/data:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";

  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], fileName, { type: mimeType });
}

