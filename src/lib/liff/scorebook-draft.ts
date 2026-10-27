// filepath: src/lib/liff/scorebook-draft.ts
import type { PreprocessedScorebookImage } from "@/lib/liff/scorebook-image";
import type {
  ImportScopeMode,
  ScorebookSheetStructure,
  ScorebookV2AtBat,
} from "@/types/scorebook-v2";

const DB_NAME = "iscorecloud_scorebook_draft_db";
const DB_VERSION = 1;
const STORE_NAME = "scorebook_import_drafts";
/** 下書き有効期限: 14日間 */
const MAX_DRAFT_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export interface SavedSheetImageDraft {
  fileName: string;
  enhancePencil: boolean;
  processed: PreprocessedScorebookImage | null;
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
}

function getDraftKey(teamId: string): string {
  return `scorebook_v2_draft_${teamId || "default"}`;
}

function openDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB is not supported"));
      return;
    }

    const req = window.indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error || new Error("Failed to open IndexedDB"));
  });
}

/**
 * スコアブック取込の途中状態（画像・Step2骨格・Step3打席/1球編集）を端末のIndexedDBに保存する
 * （IndexedDBが使えない環境では画像以外の軽量データをlocalStorageにフォールバック保存）
 */
export async function saveScorebookDraft(
  teamId: string,
  draft: Omit<ScorebookImportDraft, "key" | "savedAt">
): Promise<number> {
  const key = getDraftKey(teamId);
  const savedAt = Date.now();
  const record: ScorebookImportDraft = {
    ...draft,
    key,
    savedAt,
  };

  try {
    const db = await openDraftDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(record);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error("Failed to write draft"));
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

/**
 * 保存済みの下書きを読み込む（期限切れの場合は自動削除して null を返す）
 */
export async function loadScorebookDraft(
  teamId: string
): Promise<ScorebookImportDraft | null> {
  const key = getDraftKey(teamId);

  try {
    const db = await openDraftDb();
    const result = await new Promise<ScorebookImportDraft | null>(
      (resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const getReq = store.get(key);
        getReq.onsuccess = () => {
          db.close();
          resolve((getReq.result as ScorebookImportDraft | undefined) || null);
        };
        getReq.onerror = () => {
          db.close();
          reject(getReq.error || new Error("Failed to read draft"));
        };
      }
    );

    if (result) {
      if (Date.now() - result.savedAt > MAX_DRAFT_AGE_MS) {
        await clearScorebookDraft(teamId);
        return null;
      }
      return result;
    }
  } catch {
    // fallback to localStorage
  }

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ScorebookImportDraft;
      if (Date.now() - parsed.savedAt > MAX_DRAFT_AGE_MS) {
        window.localStorage.removeItem(key);
        return null;
      }
      return parsed;
    }
  } catch {
    // ignore parse error
  }

  return null;
}

/**
 * 保存済みの下書きを完全に削除する（D1保存完了時や「最初からやり直す」押下時）
 */
export async function clearScorebookDraft(teamId: string): Promise<void> {
  const key = getDraftKey(teamId);

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }

  try {
    const db = await openDraftDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // ignore
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

