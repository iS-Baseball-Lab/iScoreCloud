// filepath: src/lib/liff/gallery-client.ts

export interface GalleryAlbumSummary {
  id: string;
  teamId: string;
  matchId: string | null;
  matchOpponent: string | null;
  matchScoreLabel: string | null;
  matchTournamentName: string | null;
  title: string;
  albumDate: string;
  category: string;
  notes: string;
  photoCount: number;
  webTotalBytes: number;
  activeRawTotalBytes: number;
  activeRawPhotoCount: number;
  earliestRawExpiresAt: number | null;
  coverThumbUrl: string | null;
  previewThumbUrls: string[];
  createdByUserId: string | null;
  createdByName: string;
  canManage: boolean;
}

export interface GalleryPhotoItem {
  id: string;
  albumId: string;
  fileName: string;
  thumbUrl: string;
  webUrl: string;
  webBytes: number;
  width: number;
  height: number;
  hasOriginal: boolean;
  originalUrl: string | null;
  originalBytes: number;
  originalMimeType: string | null;
  originalExpiresAt: number | null;
  uploadedByName: string;
  canDelete: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface GalleryStorageInfo {
  webBytes: number;
  rawBytes: number;
  totalBytes: number;
  freeTierLimitBytes: number;
  albumCount: number;
  photoCount: number;
}

export interface GalleryMatchCandidate {
  id: string;
  date: string;
  opponent: string;
  tournamentName: string | null;
  myScore: number;
  opponentScore: number;
  status: string;
  existingAlbumId: string | null;
}

export interface GalleryListResponse {
  success: boolean;
  isDemo?: boolean;
  albums: GalleryAlbumSummary[];
  matchedAlbumId: string | null;
  storage: GalleryStorageInfo;
  recentMatches: GalleryMatchCandidate[];
  error?: string;
}

export interface GalleryAlbumDetailResponse {
  success: boolean;
  isDemo?: boolean;
  album: GalleryAlbumSummary;
  photos: GalleryPhotoItem[];
  canManageAlbum: boolean;
  error?: string;
}

export function formatFileBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  const kb = 1024;
  const mb = kb * 1024;
  const gb = mb * 1024;
  if (bytes >= gb) {
    return `${(bytes / gb).toFixed(2)} GB`;
  }
  if (bytes >= mb) {
    const val = bytes / mb;
    return `${val >= 100 ? Math.round(val) : val.toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / kb))} KB`;
}

export function formatRemainingExpiresLabel(
  expiresAtSec: number | null
): string {
  if (!expiresAtSec) return "";
  const diffSec = expiresAtSec - Math.floor(Date.now() / 1000);
  if (diffSec <= 0) return "期限切れ";
  const days = Math.floor(diffSec / 86400);
  if (days >= 1) {
    return `残り${days}日`;
  }
  const hours = Math.max(1, Math.floor(diffSec / 3600));
  return `残り${hours}時間`;
}

export function sanitizeZipSafeName(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/[\\/:*?"<>|\r\n\t]+/g, "_")
    .replace(/\s+/g, "_");
  return cleaned || "photos";
}

// ==========================================
// 🖼️ 1. 端末内での自動リサイズ・JPEG最適化（R2 10GB無料枠を約35倍長持ちさせる）
// ==========================================
export interface OptimizedGalleryBlobs {
  thumbBlob: Blob;
  webBlob: Blob;
  width: number;
  height: number;
}

async function decodeImageElementFallback(
  file: File
): Promise<{ img: HTMLImageElement; revoke: () => void }> {
  const objectUrl = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      resolve({
        img,
        revoke: () => URL.revokeObjectURL(objectUrl),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`画像の読み込みに失敗しました: ${file.name}`));
    };
    img.src = objectUrl;
  });
}

function renderSourceToJpegBlob(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number,
  maxEdge: number,
  quality: number
): Promise<{ blob: Blob; width: number; height: number }> {
  const longest = Math.max(srcWidth, srcHeight, 1);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  const targetW = Math.max(1, Math.round(srcWidth * scale));
  const targetH = Math.max(1, Math.round(srcHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D コンテキストを初期化できませんでした");
  }
  // 白背景を敷いて透過PNG等も綺麗なJPEGに変換
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, targetW, targetH);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        // モバイルSafariのCanvasメモリ解放
        canvas.width = 1;
        canvas.height = 1;
        if (!blob) {
          reject(new Error("JPEG変換に失敗しました"));
          return;
        }
        resolve({ blob, width: targetW, height: targetH });
      },
      "image/jpeg",
      quality
    );
  });
}

export async function optimizeImageForGallery(
  file: File
): Promise<OptimizedGalleryBlobs> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      try {
        const srcW = bitmap.width;
        const srcH = bitmap.height;
        const web = await renderSourceToJpegBlob(bitmap, srcW, srcH, 2048, 0.85);
        const thumb = await renderSourceToJpegBlob(
          bitmap,
          srcW,
          srcH,
          420,
          0.78
        );
        return {
          thumbBlob: thumb.blob,
          webBlob: web.blob,
          width: web.width,
          height: web.height,
        };
      } finally {
        bitmap.close();
      }
    } catch {
      // HTMLImageElement フォールバックへ進む
    }
  }

  const { img, revoke } = await decodeImageElementFallback(file);
  try {
    const srcW = img.naturalWidth || img.width || 1200;
    const srcH = img.naturalHeight || img.height || 900;
    const web = await renderSourceToJpegBlob(img, srcW, srcH, 2048, 0.85);
    const thumb = await renderSourceToJpegBlob(img, srcW, srcH, 420, 0.78);
    return {
      thumbBlob: thumb.blob,
      webBlob: web.blob,
      width: web.width,
      height: web.height,
    };
  } finally {
    revoke();
  }
}

// ==========================================
// 📤 2. 並列バッチアップロード（標準高画質 ＋ 任意の7日間元画質ストリーム）
// ==========================================
export interface BatchUploadProgress {
  completed: number;
  total: number;
  failed: number;
  currentFileName: string;
  savedWebBytes: number;
  savedOriginalBytes: number;
  originalInputBytes: number;
}

export interface BatchUploadResult {
  uploadedPhotos: GalleryPhotoItem[];
  failedFiles: string[];
  savedWebBytes: number;
  savedOriginalBytes: number;
  originalInputBytes: number;
}

export async function uploadGalleryPhotosBatch(params: {
  teamId: string;
  albumId: string;
  files: File[];
  keepOriginal: boolean;
  startSortOrder: number;
  userName?: string;
  signal?: AbortSignal;
  onProgress?: (progress: BatchUploadProgress) => void;
}): Promise<BatchUploadResult> {
  const {
    teamId,
    albumId,
    files,
    keepOriginal,
    startSortOrder,
    userName,
    signal,
    onProgress,
  } = params;

  const total = files.length;
  let completed = 0;
  let failed = 0;
  let savedWebBytes = 0;
  let savedOriginalBytes = 0;
  let originalInputBytes = 0;
  const uploadedPhotos: GalleryPhotoItem[] = [];
  const failedFiles: string[] = [];

  let cursor = 0;
  const CONCURRENCY = Math.min(3, Math.max(1, total));

  const report = (currentFileName: string) => {
    onProgress?.({
      completed,
      total,
      failed,
      currentFileName,
      savedWebBytes,
      savedOriginalBytes,
      originalInputBytes,
    });
  };

  const worker = async () => {
    while (cursor < total) {
      if (signal?.aborted) break;
      const index = cursor;
      cursor += 1;
      const file = files[index];
      if (!file) continue;

      report(file.name);

      try {
        const optimized = await optimizeImageForGallery(file);
        if (signal?.aborted) break;

        const formData = new FormData();
        formData.append("thumb", optimized.thumbBlob, "thumb.jpg");
        formData.append("web", optimized.webBlob, "web.jpg");
        formData.append("fileName", file.name);
        formData.append("width", String(optimized.width));
        formData.append("height", String(optimized.height));
        formData.append("sortOrder", String(startSortOrder + index));
        if (userName) {
          formData.append("userName", userName);
        }

        const postRes = await fetch(
          `/api/liff/gallery/albums/${encodeURIComponent(albumId)}/photos?teamId=${encodeURIComponent(teamId)}`,
          {
            method: "POST",
            body: formData,
            signal,
          }
        );

        const postJson = (await postRes.json().catch(() => ({}))) as {
          success?: boolean;
          photo?: GalleryPhotoItem;
          error?: string;
        };

        if (!postRes.ok || !postJson.success || !postJson.photo) {
          throw new Error(postJson.error || `HTTP ${postRes.status}`);
        }

        let finalPhoto = postJson.photo;
        originalInputBytes += file.size;
        savedWebBytes +=
          optimized.thumbBlob.size + optimized.webBlob.size;

        if (keepOriginal && !signal?.aborted) {
          const extPart = file.name.includes(".")
            ? file.name.split(".").pop() || "jpg"
            : "jpg";
          const putUrl = `/api/liff/gallery/photos/${encodeURIComponent(
            finalPhoto.id
          )}/original?teamId=${encodeURIComponent(
            teamId
          )}&ext=${encodeURIComponent(extPart)}&size=${encodeURIComponent(
            String(file.size)
          )}`;

          const putRes = await fetch(putUrl, {
            method: "PUT",
            headers: {
              "Content-Type": file.type || "image/jpeg",
            },
            body: file,
            signal,
          });

          const putJson = (await putRes.json().catch(() => ({}))) as {
            success?: boolean;
            originalUrl?: string;
            originalBytes?: number;
            originalExpiresAt?: number;
          };

          if (putRes.ok && putJson.success) {
            const rawBytes = putJson.originalBytes || file.size;
            savedOriginalBytes += rawBytes;
            finalPhoto = {
              ...finalPhoto,
              hasOriginal: true,
              originalUrl: putJson.originalUrl || null,
              originalBytes: rawBytes,
              originalMimeType: file.type || "image/jpeg",
              originalExpiresAt: putJson.originalExpiresAt || null,
            };
          }
        }

        uploadedPhotos.push(finalPhoto);
      } catch (err) {
        if (signal?.aborted) break;
        console.warn("Photo upload error:", file.name, err);
        failed += 1;
        failedFiles.push(file.name);
      } finally {
        if (!signal?.aborted) {
          completed += 1;
          report(file.name);
        }
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  uploadedPhotos.sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    uploadedPhotos,
    failedFiles,
    savedWebBytes,
    savedOriginalBytes,
    originalInputBytes,
  };
}

// ==========================================
// 🗜️ 3. ゼロ再圧縮（ZIP STORE method=0）一括ZIP生成エンジン
// JPEG等は既に圧縮済みのため、無圧縮STORE方式＋Blob参照結合により
// 数百枚・数GBでもスマホ/PCのCPU・メモリ負荷を最小化して一瞬でZIP化する
// ==========================================
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

async function computeBlobCrc32(blob: Blob): Promise<number> {
  let crc = 0xffffffff;
  if (typeof blob.stream === "function") {
    const reader = blob.stream().getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        for (let i = 0; i < value.length; i++) {
          crc = CRC32_TABLE[(crc ^ value[i]) & 0xff] ^ (crc >>> 8);
        }
      }
    }
  } else {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    for (let i = 0; i < bytes.length; i++) {
      crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(date: Date): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, date.getFullYear());
  const dosDate =
    ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  return { dosTime, dosDate };
}

function extractExtensionFromUrlOrName(
  url: string,
  fallbackFileName: string
): string {
  const cleanUrl = url.split("?")[0] || "";
  const urlExt = cleanUrl.includes(".")
    ? (cleanUrl.split(".").pop() || "").toLowerCase()
    : "";
  if (
    urlExt === "jpg" ||
    urlExt === "jpeg" ||
    urlExt === "png" ||
    urlExt === "webp" ||
    urlExt === "heic" ||
    urlExt === "svg"
  ) {
    return urlExt;
  }
  const nameExt = fallbackFileName.includes(".")
    ? (fallbackFileName.split(".").pop() || "").toLowerCase()
    : "";
  if (nameExt && nameExt.length <= 5) return nameExt;
  return "jpg";
}

export interface ZipDownloadProgress {
  completed: number;
  total: number;
  phase: "fetching" | "packaging" | "done";
}

export interface BuiltZipArchive {
  zipBlob: Blob;
  zipFileName: string;
  includedCount: number;
  totalBytes: number;
}

export async function buildPhotosZipArchive(params: {
  photos: GalleryPhotoItem[];
  quality: "web" | "original";
  albumDate: string;
  albumTitle: string;
  signal?: AbortSignal;
  onProgress?: (progress: ZipDownloadProgress) => void;
}): Promise<BuiltZipArchive> {
  const { photos, quality, albumDate, albumTitle, signal, onProgress } = params;
  const total = photos.length;
  const dateCompact = (albumDate || "").replace(/-/g, "") || "photos";
  const safeTitle = sanitizeZipSafeName(albumTitle).slice(0, 40);
  const filePrefix = `${dateCompact}_${safeTitle}`;
  const zipFileName =
    quality === "original"
      ? `${filePrefix}_元画質(${total}枚).zip`
      : `${filePrefix}_一括DL(${total}枚).zip`;

  interface FetchedEntry {
    index: number;
    entryName: string;
    blob: Blob;
    crc32: number;
  }

  const fetchedEntries: FetchedEntry[] = [];
  let completed = 0;
  let cursor = 0;
  const CONCURRENCY = Math.min(4, Math.max(1, total));

  onProgress?.({ completed: 0, total, phase: "fetching" });

  const worker = async () => {
    while (cursor < total) {
      if (signal?.aborted) break;
      const idx = cursor;
      cursor += 1;
      const photo = photos[idx];
      if (!photo) continue;

      const targetUrl =
        quality === "original" && photo.hasOriginal && photo.originalUrl
          ? photo.originalUrl
          : photo.webUrl;

      const res = await fetch(targetUrl, { signal });
      if (!res.ok) {
        throw new Error(`写真の取得に失敗しました (${res.status})`);
      }
      const blob = await res.blob();
      const crc32 = await computeBlobCrc32(blob);
      const ext = extractExtensionFromUrlOrName(targetUrl, photo.fileName);
      const seq = String(idx + 1).padStart(3, "0");
      const entryName = `${filePrefix}_${seq}.${ext}`;

      fetchedEntries.push({
        index: idx,
        entryName,
        blob,
        crc32,
      });

      completed += 1;
      onProgress?.({ completed, total, phase: "fetching" });
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  if (signal?.aborted) {
    throw new Error("キャンセルされました");
  }

  onProgress?.({ completed: total, total, phase: "packaging" });
  fetchedEntries.sort((a, b) => a.index - b.index);

  const encoder = new TextEncoder();
  const { dosTime, dosDate } = getDosDateTime(new Date());
  const blobParts: BlobPart[] = [];
  const centralRecords: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  let centralByteLength = 0;

  for (const item of fetchedEntries) {
    const nameBytes = encoder.encode(item.entryName);
    const size = item.blob.size;

    // Local File Header (30 + filename)
    const localHeader = new Uint8Array(new ArrayBuffer(30 + nameBytes.length));
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 filename bit
    lv.setUint16(8, 0, true); // STORE (method 0)
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, item.crc32, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    // Central Directory Header (46 + filename)
    const centralHeader = new Uint8Array(
      new ArrayBuffer(46 + nameBytes.length)
    );
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, item.crc32, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    blobParts.push(localHeader);
    blobParts.push(item.blob);
    centralRecords.push(centralHeader);

    offset += localHeader.byteLength + size;
    centralByteLength += centralHeader.byteLength;
  }

  const centralStartOffset = offset;
  for (const rec of centralRecords) {
    blobParts.push(rec);
  }

  // End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(new ArrayBuffer(22));
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, fetchedEntries.length, true);
  ev.setUint16(10, fetchedEntries.length, true);
  ev.setUint32(12, centralByteLength, true);
  ev.setUint32(16, centralStartOffset, true);
  ev.setUint16(20, 0, true);
  blobParts.push(eocd);

  const zipBlob = new Blob(blobParts, { type: "application/zip" });
  onProgress?.({ completed: total, total, phase: "done" });

  return {
    zipBlob,
    zipFileName,
    includedCount: fetchedEntries.length,
    totalBytes: zipBlob.size,
  };
}

export function canShareZipFile(archive: BuiltZipArchive): boolean {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.canShare !== "function" ||
    typeof File === "undefined"
  ) {
    return false;
  }
  try {
    const probe = new File([new Uint8Array(1)], archive.zipFileName, {
      type: "application/zip",
    });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export async function shareBuiltZipFile(
  archive: BuiltZipArchive
): Promise<boolean> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false;
  }
  const zipFile = new File([archive.zipBlob], archive.zipFileName, {
    type: "application/zip",
  });
  await navigator.share({
    files: [zipFile],
    title: archive.zipFileName,
  });
  return true;
}

export function triggerAnchorBlobDownload(
  blob: Blob,
  fileName: string
): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}

