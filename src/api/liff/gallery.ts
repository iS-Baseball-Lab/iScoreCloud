// filepath: src/api/liff/gallery.ts
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { and, asc, desc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import {
  galleryAlbums,
  galleryPhotos,
  matches,
  tournaments,
} from "@/db/schema";
import {
  extractHeaderUserName,
  resolveCallerTeamAccess,
} from "@/lib/team-access";
import type { WorkerEnv } from "@/types/api";

const app = new Hono<{ Bindings: WorkerEnv }>();

const RAW_RETENTION_SECONDS = 7 * 24 * 60 * 60; // 7日間自動保持
const R2_FREE_TIER_BYTES = 10 * 1024 * 1024 * 1024; // 10 GiB (Cloudflare R2 無料枠目安)
const MEDIA_FILENAME_PATTERN =
  /^[a-zA-Z0-9-]+_[0-9a-f]{24}_(thumb|web|orig)\.[a-z0-9]{2,5}$/;

let gallerySchemaVerified = false;
const lastCleanupByTeam = new Map<string, number>();

async function ensureGallerySchema(dbRaw: D1Database): Promise<void> {
  if (gallerySchemaVerified) return;
  try {
    const check = await dbRaw
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('gallery_albums', 'gallery_photos')"
      )
      .all<{ name: string }>();
    const names = new Set((check.results || []).map((r) => r.name));
    if (names.has("gallery_albums") && names.has("gallery_photos")) {
      gallerySchemaVerified = true;
      return;
    }

    await dbRaw.batch([
      dbRaw.prepare(`
        CREATE TABLE IF NOT EXISTS gallery_albums (
          id TEXT PRIMARY KEY NOT NULL,
          team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
          match_id TEXT,
          title TEXT NOT NULL,
          album_date TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT 'match',
          notes TEXT,
          photo_count INTEGER NOT NULL DEFAULT 0,
          web_total_bytes INTEGER NOT NULL DEFAULT 0,
          raw_total_bytes INTEGER NOT NULL DEFAULT 0,
          cover_thumb_url TEXT,
          created_by_user_id TEXT,
          created_by_name TEXT,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        )
      `),
      dbRaw.prepare(
        "CREATE INDEX IF NOT EXISTS idx_gallery_albums_team_date ON gallery_albums(team_id, album_date)"
      ),
      dbRaw.prepare(
        "CREATE INDEX IF NOT EXISTS idx_gallery_albums_team_match ON gallery_albums(team_id, match_id)"
      ),
      dbRaw.prepare(`
        CREATE TABLE IF NOT EXISTS gallery_photos (
          id TEXT PRIMARY KEY NOT NULL,
          album_id TEXT NOT NULL REFERENCES gallery_albums(id) ON DELETE CASCADE,
          team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
          file_name TEXT NOT NULL,
          thumb_key TEXT NOT NULL,
          thumb_bytes INTEGER NOT NULL DEFAULT 0,
          web_key TEXT NOT NULL,
          web_bytes INTEGER NOT NULL DEFAULT 0,
          width INTEGER NOT NULL DEFAULT 0,
          height INTEGER NOT NULL DEFAULT 0,
          original_key TEXT,
          original_bytes INTEGER NOT NULL DEFAULT 0,
          original_mime_type TEXT,
          original_expires_at INTEGER,
          uploaded_by_user_id TEXT,
          uploaded_by_name TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        )
      `),
      dbRaw.prepare(
        "CREATE INDEX IF NOT EXISTS idx_gallery_photos_album_sort ON gallery_photos(album_id, sort_order, created_at)"
      ),
      dbRaw.prepare(
        "CREATE INDEX IF NOT EXISTS idx_gallery_photos_team_exp ON gallery_photos(team_id, original_expires_at)"
      ),
    ]);
    gallerySchemaVerified = true;
  } catch (err) {
    console.warn("ensureGallerySchema warning:", err);
  }
}

function generateHexSecret(byteLength = 12): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

function buildMediaUrl(
  teamId: string,
  albumId: string,
  r2Key: string
): string {
  const slashIdx = r2Key.lastIndexOf("/");
  const filePart = slashIdx >= 0 ? r2Key.slice(slashIdx + 1) : r2Key;
  return `/api/liff/gallery/media/${encodeURIComponent(teamId)}/${encodeURIComponent(albumId)}/${encodeURIComponent(filePart)}`;
}

function sanitizeFileExtension(
  rawExt: string | null | undefined,
  mimeType: string | null | undefined
): string {
  const clean = (rawExt || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 5);
  if (
    clean === "jpg" ||
    clean === "jpeg" ||
    clean === "png" ||
    clean === "webp" ||
    clean === "heic" ||
    clean === "heif"
  ) {
    return clean;
  }
  const mime = (mimeType || "").toLowerCase();
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("heic")) return "heic";
  if (mime.includes("heif")) return "heif";
  return "jpg";
}

async function deleteR2KeysInChunks(
  bucket: R2Bucket | undefined,
  keys: string[]
): Promise<void> {
  if (!bucket || keys.length === 0) return;
  const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
  const CHUNK_SIZE = 500;
  for (let i = 0; i < uniqueKeys.length; i += CHUNK_SIZE) {
    const slice = uniqueKeys.slice(i, i + CHUNK_SIZE);
    await bucket.delete(slice);
  }
}

async function recalculateAlbumCounters(
  db: ReturnType<typeof drizzle>,
  albumId: string
): Promise<void> {
  const nowSec = Math.floor(Date.now() / 1000);
  const rows = await db
    .select({
      id: galleryPhotos.id,
      thumbKey: galleryPhotos.thumbKey,
      teamId: galleryPhotos.teamId,
      thumbBytes: galleryPhotos.thumbBytes,
      webBytes: galleryPhotos.webBytes,
      originalKey: galleryPhotos.originalKey,
      originalBytes: galleryPhotos.originalBytes,
      originalExpiresAt: galleryPhotos.originalExpiresAt,
    })
    .from(galleryPhotos)
    .where(eq(galleryPhotos.albumId, albumId))
    .orderBy(asc(galleryPhotos.sortOrder), asc(galleryPhotos.createdAt))
    .all();

  let webTotalBytes = 0;
  let rawTotalBytes = 0;
  for (const r of rows) {
    webTotalBytes += (r.thumbBytes || 0) + (r.webBytes || 0);
    if (
      r.originalKey &&
      r.originalExpiresAt &&
      r.originalExpiresAt > nowSec
    ) {
      rawTotalBytes += r.originalBytes || 0;
    }
  }

  const first = rows[0];
  const coverThumbUrl = first
    ? buildMediaUrl(first.teamId, albumId, first.thumbKey)
    : null;

  await db
    .update(galleryAlbums)
    .set({
      photoCount: rows.length,
      webTotalBytes,
      rawTotalBytes,
      coverThumbUrl,
      updatedAt: new Date(),
    })
    .where(eq(galleryAlbums.id, albumId));
}

async function purgeExpiredOriginalsForTeam(
  env: WorkerEnv,
  teamId: string
): Promise<void> {
  const nowMs = Date.now();
  const prevMs = lastCleanupByTeam.get(teamId) || 0;
  if (nowMs - prevMs < 5 * 60_000) return;
  lastCleanupByTeam.set(teamId, nowMs);

  const db = drizzle(env.DB);
  const nowSec = Math.floor(nowMs / 1000);
  const expiredRows = await db
    .select({
      id: galleryPhotos.id,
      albumId: galleryPhotos.albumId,
      originalKey: galleryPhotos.originalKey,
    })
    .from(galleryPhotos)
    .where(
      and(
        eq(galleryPhotos.teamId, teamId),
        isNotNull(galleryPhotos.originalKey),
        isNotNull(galleryPhotos.originalExpiresAt),
        lte(galleryPhotos.originalExpiresAt, nowSec)
      )
    )
    .limit(250)
    .all();

  if (expiredRows.length === 0) return;

  const keysToDelete = expiredRows
    .map((r) => r.originalKey || "")
    .filter(Boolean);
  await deleteR2KeysInChunks(env.BUCKET, keysToDelete);

  const expiredIds = expiredRows.map((r) => r.id);
  await db
    .update(galleryPhotos)
    .set({
      originalKey: null,
      originalBytes: 0,
      originalMimeType: null,
      originalExpiresAt: null,
    })
    .where(inArray(galleryPhotos.id, expiredIds));

  const affectedAlbumIds = Array.from(
    new Set(expiredRows.map((r) => r.albumId))
  );
  for (const aid of affectedAlbumIds) {
    await recalculateAlbumCounters(db, aid);
  }
}

// ==========================================
// 🎨 デモチーム（demo-team）用の体験データ・SVG画像生成
// ==========================================
interface DemoPhotoSeed {
  id: string;
  albumId: string;
  fileName: string;
  caption: string;
  bgHex: string;
  accentHex: string;
  badgeText: string;
  webBytes: number;
  originalBytes: number;
  hasOriginal: boolean;
}

const DEMO_PHOTO_SEEDS: readonly DemoPhotoSeed[] = [
  {
    id: "demo-photo-1",
    albumId: "demo-album-match-1",
    fileName: "IMG_0101.svg",
    caption: "初回・先頭打者のレフト前クリーンヒット",
    bgHex: "#0f172a",
    accentHex: "#2563eb",
    badgeText: "1回表 先頭出塁",
    webBytes: 284_000,
    originalBytes: 8_420_000,
    hasOriginal: true,
  },
  {
    id: "demo-photo-2",
    albumId: "demo-album-match-1",
    fileName: "IMG_0102.svg",
    caption: "力投する先発マウンド・渾身のストレート",
    bgHex: "#1e293b",
    accentHex: "#0d9488",
    badgeText: "先発マウンド",
    webBytes: 312_000,
    originalBytes: 9_150_000,
    hasOriginal: true,
  },
  {
    id: "demo-photo-3",
    albumId: "demo-album-match-1",
    fileName: "IMG_0103.svg",
    caption: "二遊間の華麗なダブルプレー成立の瞬間",
    bgHex: "#0f172a",
    accentHex: "#d97706",
    badgeText: "4-6-3 併殺",
    webBytes: 298_000,
    originalBytes: 8_890_000,
    hasOriginal: true,
  },
  {
    id: "demo-photo-4",
    albumId: "demo-album-match-1",
    fileName: "IMG_0104.svg",
    caption: "ベンチ一丸！タイムリー直後のハイタッチ",
    bgHex: "#172554",
    accentHex: "#e11d48",
    badgeText: "勝ち越し適時打",
    webBytes: 334_000,
    originalBytes: 9_640_000,
    hasOriginal: true,
  },
  {
    id: "demo-photo-5",
    albumId: "demo-album-match-1",
    fileName: "IMG_0105.svg",
    caption: "最終回・ホーム生還のガッツポーズ",
    bgHex: "#0f172a",
    accentHex: "#16a34a",
    badgeText: "決勝ホームイン",
    webBytes: 305_000,
    originalBytes: 8_730_000,
    hasOriginal: true,
  },
  {
    id: "demo-photo-6",
    albumId: "demo-album-match-1",
    fileName: "IMG_0106.svg",
    caption: "試合終了後の整列・応援席への挨拶",
    bgHex: "#1e293b",
    accentHex: "#2563eb",
    badgeText: "試合終了 5-3",
    webBytes: 290_000,
    originalBytes: 8_510_000,
    hasOriginal: true,
  },
  {
    id: "demo-photo-7",
    albumId: "demo-album-event-1",
    fileName: "CAMP_0201.svg",
    caption: "朝のグラウンド整備・全員での声出しアップ",
    bgHex: "#134e4a",
    accentHex: "#0d9488",
    badgeText: "朝練アップ",
    webBytes: 265_000,
    originalBytes: 0,
    hasOriginal: false,
  },
  {
    id: "demo-photo-8",
    albumId: "demo-album-event-1",
    fileName: "CAMP_0202.svg",
    caption: "シートノック・内外野連携プレー確認",
    bgHex: "#0f172a",
    accentHex: "#0284c7",
    badgeText: "守備連携",
    webBytes: 278_000,
    originalBytes: 0,
    hasOriginal: false,
  },
  {
    id: "demo-photo-9",
    albumId: "demo-album-event-1",
    fileName: "CAMP_0203.svg",
    caption: "昼食タイム・保護者差し入れタイム",
    bgHex: "#1e293b",
    accentHex: "#d97706",
    badgeText: "昼食休憩",
    webBytes: 254_000,
    originalBytes: 0,
    hasOriginal: false,
  },
  {
    id: "demo-photo-10",
    albumId: "demo-album-event-1",
    fileName: "CAMP_0204.svg",
    caption: "合宿締めくくりの全員集合記念ショット",
    bgHex: "#172554",
    accentHex: "#2563eb",
    badgeText: "全員集合写真",
    webBytes: 318_000,
    originalBytes: 0,
    hasOriginal: false,
  },
];

function renderDemoSvg(seed: DemoPhotoSeed, isThumb: boolean): string {
  const w = isThumb ? 480 : 1600;
  const h = isThumb ? 360 : 1200;
  const titleSize = isThumb ? 22 : 64;
  const badgeSize = isThumb ? 15 : 40;
  const subSize = isThumb ? 13 : 34;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${seed.bgHex}" />
  <rect x="0" y="0" width="${w}" height="${Math.round(h * 0.045)}" fill="${seed.accentHex}" />
  <circle cx="${Math.round(w * 0.82)}" cy="${Math.round(h * 0.28)}" r="${Math.round(h * 0.19)}" fill="#ffffff" fill-opacity="0.07" />
  <path d="M ${Math.round(w * 0.5)} ${Math.round(h * 0.22)} L ${Math.round(w * 0.64)} ${Math.round(h * 0.4)} L ${Math.round(w * 0.5)} ${Math.round(h * 0.58)} L ${Math.round(w * 0.36)} ${Math.round(h * 0.4)} Z" fill="none" stroke="#ffffff" stroke-opacity="0.24" stroke-width="${isThumb ? 4 : 10}" />
  <rect x="${Math.round(w * 0.06)}" y="${Math.round(h * 0.1)}" width="${Math.round(w * 0.34)}" height="${Math.round(h * 0.1)}" rx="${isThumb ? 8 : 20}" fill="${seed.accentHex}" />
  <text x="${Math.round(w * 0.23)}" y="${Math.round(h * 0.165)}" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-weight="900" font-size="${badgeSize}">${seed.badgeText}</text>
  <text x="${Math.round(w * 0.06)}" y="${Math.round(h * 0.78)}" fill="#f8fafc" font-family="sans-serif" font-weight="900" font-size="${titleSize}">${seed.caption}</text>
  <text x="${Math.round(w * 0.06)}" y="${Math.round(h * 0.88)}" fill="#94a3b8" font-family="sans-serif" font-weight="700" font-size="${subSize}">iScore ドリームス (体験デモ)  |  ${seed.fileName}</text>
</svg>`;
}

function buildDemoGalleryResponse(filterMatchId: string) {
  const nowSec = Math.floor(Date.now() / 1000);
  const demoExpiresAt = nowSec + 5 * 86400;

  const albums = [
    {
      id: "demo-album-match-1",
      teamId: "demo-team",
      matchId: "demo-match-1",
      matchOpponent: "青葉台ジャガーズ",
      matchScoreLabel: "5 - 3 WIN",
      matchTournamentName: "春季市民大会 準々決勝",
      title: "vs 青葉台ジャガーズ",
      albumDate: "2026-05-10",
      category: "match",
      notes:
        "公式サイト掲載用のハイライト写真一式です。選択してZIP一括ダウンロードをお試しいただけます。",
      photoCount: 6,
      webTotalBytes: 1_823_000,
      activeRawTotalBytes: 53_340_000,
      activeRawPhotoCount: 6,
      earliestRawExpiresAt: demoExpiresAt,
      coverThumbUrl:
        "/api/liff/gallery/media/demo-team/demo-album-match-1/demo-photo-1_thumb.svg",
      previewThumbUrls: [
        "/api/liff/gallery/media/demo-team/demo-album-match-1/demo-photo-1_thumb.svg",
        "/api/liff/gallery/media/demo-team/demo-album-match-1/demo-photo-2_thumb.svg",
        "/api/liff/gallery/media/demo-team/demo-album-match-1/demo-photo-3_thumb.svg",
        "/api/liff/gallery/media/demo-team/demo-album-match-1/demo-photo-4_thumb.svg",
      ],
      createdByUserId: "demo-user",
      createdByName: "広報・撮影担当（デモ）",
      canManage: true,
    },
    {
      id: "demo-album-event-1",
      teamId: "demo-team",
      matchId: null,
      matchOpponent: null,
      matchScoreLabel: null,
      matchTournamentName: null,
      title: "GW強化練習・集合スナップ",
      albumDate: "2026-05-04",
      category: "event",
      notes: "グラウンド練習と全員集合写真です（標準高画質モード）。",
      photoCount: 4,
      webTotalBytes: 1_115_000,
      activeRawTotalBytes: 0,
      activeRawPhotoCount: 0,
      earliestRawExpiresAt: null,
      coverThumbUrl:
        "/api/liff/gallery/media/demo-team/demo-album-event-1/demo-photo-7_thumb.svg",
      previewThumbUrls: [
        "/api/liff/gallery/media/demo-team/demo-album-event-1/demo-photo-7_thumb.svg",
        "/api/liff/gallery/media/demo-team/demo-album-event-1/demo-photo-8_thumb.svg",
        "/api/liff/gallery/media/demo-team/demo-album-event-1/demo-photo-9_thumb.svg",
        "/api/liff/gallery/media/demo-team/demo-album-event-1/demo-photo-10_thumb.svg",
      ],
      createdByUserId: "demo-user",
      createdByName: "保護者カメラマン（デモ）",
      canManage: true,
    },
  ];

  const matched = filterMatchId
    ? albums.find((a) => a.matchId === filterMatchId)
    : undefined;

  return {
    success: true,
    isDemo: true,
    albums,
    matchedAlbumId: matched?.id || null,
    storage: {
      webBytes: 2_938_000,
      rawBytes: 53_340_000,
      totalBytes: 56_278_000,
      freeTierLimitBytes: R2_FREE_TIER_BYTES,
      albumCount: albums.length,
      photoCount: 10,
    },
    recentMatches: [
      {
        id: "demo-match-1",
        date: "2026-05-10",
        opponent: "青葉台ジャガーズ",
        tournamentName: "春季市民大会 準々決勝",
        myScore: 5,
        opponentScore: 3,
        status: "finished",
        existingAlbumId: "demo-album-match-1",
      },
    ],
  };
}

// ==========================================
// 🖼️ 1. 画像・元画質ファイル高速ストリーム配信
// GET /api/liff/gallery/media/:teamId/:albumId/:filename
// ==========================================
app.get("/media/:teamId/:albumId/:filename", async (c) => {
  const teamId = (c.req.param("teamId") || "").trim();
  const albumId = (c.req.param("albumId") || "").trim();
  const filename = (c.req.param("filename") || "").trim();

  if (!teamId || !albumId || !filename) {
    return c.text("Not found", 404);
  }

  // デモチームのイラストSVG配信
  if (teamId === "demo-team") {
    const cleanId = filename.replace(/_(thumb|web|orig)\.svg$/i, "");
    const seed =
      DEMO_PHOTO_SEEDS.find((s) => s.id === cleanId) || DEMO_PHOTO_SEEDS[0];
    const isThumb = filename.includes("_thumb.");
    const svg = renderDemoSvg(seed, isThumb);
    return new Response(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  // 24文字のランダム16進シークレットを含むキーのみ許可（推測アクセス完全遮断・D1クエリゼロ）
  if (!MEDIA_FILENAME_PATTERN.test(filename)) {
    return c.text("Not found", 404);
  }

  if (!c.env.BUCKET) {
    return c.text("Storage unavailable", 503);
  }

  const isOrig = filename.includes("_orig.");
  const r2Key = isOrig
    ? `gallery-raw/${teamId}/${albumId}/${filename}`
    : `gallery/${teamId}/${albumId}/${filename}`;

  const object = await c.env.BUCKET.get(r2Key);
  if (!object) {
    return c.text("Not found", 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  if (!headers.has("content-type")) {
    headers.set("content-type", "image/jpeg");
  }

  const wantDownload = c.req.query("download") === "1";
  const dlName = (c.req.query("dlName") || "").trim();
  if (wantDownload) {
    const safeName = (dlName || filename).replace(/[\r\n"]/g, "_");
    headers.set(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`
    );
  }

  headers.set(
    "Cache-Control",
    isOrig
      ? "private, max-age=604800"
      : "private, max-age=31536000, immutable"
  );

  return new Response(object.body, { status: 200, headers });
});

// ==========================================
// 📂 2. アルバム一覧・容量メーター・試合候補取得
// GET /api/liff/gallery?teamId=...&matchId=...
// ==========================================
app.get("/", async (c) => {
  const teamId = (c.req.query("teamId") || "").trim();
  const filterMatchId = (c.req.query("matchId") || "").trim();

  if (!teamId) {
    return c.json({ success: false, error: "teamId が必要です" }, 400);
  }

  if (teamId === "demo-team") {
    return c.json(buildDemoGalleryResponse(filterMatchId));
  }

  const access = await resolveCallerTeamAccess(c);
  if (!access.canAccessTeam(teamId)) {
    return c.json(
      { success: false, error: "このチームへのアクセス権限がありません" },
      403
    );
  }

  await ensureGallerySchema(c.env.DB);

  // 7日経過した元画質データのR2自動クリーンアップを非同期実行
  if (c.executionCtx && typeof c.executionCtx.waitUntil === "function") {
    c.executionCtx.waitUntil(
      purgeExpiredOriginalsForTeam(c.env, teamId).catch((err) =>
        console.warn("purgeExpiredOriginalsForTeam background error:", err)
      )
    );
  }

  const db = drizzle(c.env.DB);
  const nowSec = Math.floor(Date.now() / 1000);

  const [albumRows, photoRows, matchRows, tournamentRows] = await Promise.all([
    db
      .select()
      .from(galleryAlbums)
      .where(eq(galleryAlbums.teamId, teamId))
      .orderBy(desc(galleryAlbums.albumDate), desc(galleryAlbums.createdAt))
      .all(),
    db
      .select({
        id: galleryPhotos.id,
        albumId: galleryPhotos.albumId,
        thumbKey: galleryPhotos.thumbKey,
        thumbBytes: galleryPhotos.thumbBytes,
        webBytes: galleryPhotos.webBytes,
        originalKey: galleryPhotos.originalKey,
        originalBytes: galleryPhotos.originalBytes,
        originalExpiresAt: galleryPhotos.originalExpiresAt,
      })
      .from(galleryPhotos)
      .where(eq(galleryPhotos.teamId, teamId))
      .orderBy(asc(galleryPhotos.sortOrder), asc(galleryPhotos.createdAt))
      .all(),
    db
      .select({
        id: matches.id,
        date: matches.date,
        opponent: matches.opponent,
        tournamentId: matches.tournamentId,
        myScore: matches.myScore,
        opponentScore: matches.opponentScore,
        status: matches.status,
      })
      .from(matches)
      .where(eq(matches.teamId, teamId))
      .orderBy(desc(matches.date))
      .limit(60)
      .all(),
    db
      .select({
        id: tournaments.id,
        name: tournaments.name,
      })
      .from(tournaments)
      .all(),
  ]);

  const tournamentNameMap = new Map<string, string>();
  for (const t of tournamentRows) {
    tournamentNameMap.set(t.id, t.name);
  }

  const matchMap = new Map<
    string,
    {
      opponent: string;
      scoreLabel: string | null;
      tournamentName: string | null;
      date: string;
    }
  >();
  for (const m of matchRows) {
    const tName = m.tournamentId
      ? tournamentNameMap.get(m.tournamentId) || null
      : null;
    let scoreLabel: string | null = null;
    if (m.status === "finished" || m.status === "live") {
      const my = m.myScore ?? 0;
      const opp = m.opponentScore ?? 0;
      const suffix =
        m.status === "live"
          ? "LIVE"
          : my > opp
            ? "WIN"
            : my < opp
              ? "LOSE"
              : "DRAW";
      scoreLabel = `${my} - ${opp} ${suffix}`;
    }
    matchMap.set(m.id, {
      opponent: m.opponent,
      scoreLabel,
      tournamentName: tName,
      date: (m.date || "").slice(0, 10),
    });
  }

  interface AlbumPhotoAgg {
    count: number;
    webBytes: number;
    rawBytes: number;
    rawCount: number;
    earliestExp: number | null;
    previews: string[];
  }
  const aggByAlbum = new Map<string, AlbumPhotoAgg>();
  let teamWebBytes = 0;
  let teamRawBytes = 0;
  let teamPhotoCount = 0;

  for (const p of photoRows) {
    teamPhotoCount += 1;
    const pWeb = (p.thumbBytes || 0) + (p.webBytes || 0);
    teamWebBytes += pWeb;

    const isRawActive = Boolean(
      p.originalKey && p.originalExpiresAt && p.originalExpiresAt > nowSec
    );
    const pRaw = isRawActive ? p.originalBytes || 0 : 0;
    teamRawBytes += pRaw;

    let agg = aggByAlbum.get(p.albumId);
    if (!agg) {
      agg = {
        count: 0,
        webBytes: 0,
        rawBytes: 0,
        rawCount: 0,
        earliestExp: null,
        previews: [],
      };
      aggByAlbum.set(p.albumId, agg);
    }
    agg.count += 1;
    agg.webBytes += pWeb;
    if (isRawActive && p.originalExpiresAt) {
      agg.rawBytes += pRaw;
      agg.rawCount += 1;
      if (agg.earliestExp === null || p.originalExpiresAt < agg.earliestExp) {
        agg.earliestExp = p.originalExpiresAt;
      }
    }
    if (agg.previews.length < 4) {
      agg.previews.push(buildMediaUrl(teamId, p.albumId, p.thumbKey));
    }
  }

  const candidateSet = new Set(access.candidateUserIds);
  const isTeamAdmin = access.canManageTeamId(teamId);
  const existingAlbumByMatchId = new Map<string, string>();

  const albums = albumRows.map((a) => {
    if (a.matchId && !existingAlbumByMatchId.has(a.matchId)) {
      existingAlbumByMatchId.set(a.matchId, a.id);
    }
    const agg = aggByAlbum.get(a.id);
    const mInfo = a.matchId ? matchMap.get(a.matchId) : undefined;
    const canManage =
      isTeamAdmin ||
      Boolean(a.createdByUserId && candidateSet.has(a.createdByUserId));

    return {
      id: a.id,
      teamId: a.teamId,
      matchId: a.matchId,
      matchOpponent: mInfo?.opponent || null,
      matchScoreLabel: mInfo?.scoreLabel || null,
      matchTournamentName: mInfo?.tournamentName || null,
      title: a.title,
      albumDate: a.albumDate,
      category: a.category,
      notes: a.notes || "",
      photoCount: agg ? agg.count : a.photoCount,
      webTotalBytes: agg ? agg.webBytes : a.webTotalBytes,
      activeRawTotalBytes: agg ? agg.rawBytes : 0,
      activeRawPhotoCount: agg ? agg.rawCount : 0,
      earliestRawExpiresAt: agg ? agg.earliestExp : null,
      coverThumbUrl: agg?.previews[0] || a.coverThumbUrl || null,
      previewThumbUrls: agg?.previews || [],
      createdByUserId: a.createdByUserId,
      createdByName: a.createdByName || "チームメンバー",
      canManage,
    };
  });

  const recentMatches = matchRows.map((m) => {
    const tName = m.tournamentId
      ? tournamentNameMap.get(m.tournamentId) || null
      : null;
    return {
      id: m.id,
      date: (m.date || "").slice(0, 10),
      opponent: m.opponent,
      tournamentName: tName,
      myScore: m.myScore ?? 0,
      opponentScore: m.opponentScore ?? 0,
      status: m.status,
      existingAlbumId: existingAlbumByMatchId.get(m.id) || null,
    };
  });

  return c.json({
    success: true,
    isDemo: false,
    albums,
    matchedAlbumId: filterMatchId
      ? existingAlbumByMatchId.get(filterMatchId) || null
      : null,
    storage: {
      webBytes: teamWebBytes,
      rawBytes: teamRawBytes,
      totalBytes: teamWebBytes + teamRawBytes,
      freeTierLimitBytes: R2_FREE_TIER_BYTES,
      albumCount: albums.length,
      photoCount: teamPhotoCount,
    },
    recentMatches,
  });
});

// ==========================================
// 📸 3. アルバム詳細・写真一覧取得
// GET /api/liff/gallery/albums/:albumId?teamId=...
// ==========================================
app.get("/albums/:albumId", async (c) => {
  const albumId = (c.req.param("albumId") || "").trim();
  const teamId = (c.req.query("teamId") || "").trim();

  if (!albumId || !teamId) {
    return c.json(
      { success: false, error: "albumId と teamId が必要です" },
      400
    );
  }

  if (teamId === "demo-team" || albumId.startsWith("demo-album-")) {
    const demoData = buildDemoGalleryResponse("");
    const targetAlbum =
      demoData.albums.find((a) => a.id === albumId) || demoData.albums[0];
    const nowSec = Math.floor(Date.now() / 1000);
    const demoExpiresAt = nowSec + 5 * 86400;
    const seeds = DEMO_PHOTO_SEEDS.filter((s) => s.albumId === targetAlbum.id);
    const photos = seeds.map((s, idx) => ({
      id: s.id,
      albumId: targetAlbum.id,
      fileName: s.fileName,
      thumbUrl: `/api/liff/gallery/media/demo-team/${targetAlbum.id}/${s.id}_thumb.svg`,
      webUrl: `/api/liff/gallery/media/demo-team/${targetAlbum.id}/${s.id}_web.svg`,
      webBytes: s.webBytes,
      width: 1600,
      height: 1200,
      hasOriginal: s.hasOriginal,
      originalUrl: s.hasOriginal
        ? `/api/liff/gallery/media/demo-team/${targetAlbum.id}/${s.id}_orig.svg`
        : null,
      originalBytes: s.originalBytes,
      originalMimeType: "image/svg+xml",
      originalExpiresAt: s.hasOriginal ? demoExpiresAt : null,
      uploadedByName: targetAlbum.createdByName,
      canDelete: false,
      sortOrder: idx,
      createdAt: new Date("2026-05-10T16:00:00+09:00").toISOString(),
    }));

    return c.json({
      success: true,
      isDemo: true,
      album: targetAlbum,
      photos,
      canManageAlbum: false,
    });
  }

  const access = await resolveCallerTeamAccess(c);
  if (!access.canAccessTeam(teamId)) {
    return c.json(
      { success: false, error: "このチームへのアクセス権限がありません" },
      403
    );
  }

  await ensureGallerySchema(c.env.DB);
  const db = drizzle(c.env.DB);
  const nowSec = Math.floor(Date.now() / 1000);

  const albumRow = await db
    .select()
    .from(galleryAlbums)
    .where(
      and(eq(galleryAlbums.id, albumId), eq(galleryAlbums.teamId, teamId))
    )
    .get();

  if (!albumRow) {
    return c.json({ success: false, error: "アルバムが見つかりません" }, 404);
  }

  const [photoRows, matchRow] = await Promise.all([
    db
      .select()
      .from(galleryPhotos)
      .where(
        and(
          eq(galleryPhotos.albumId, albumId),
          eq(galleryPhotos.teamId, teamId)
        )
      )
      .orderBy(asc(galleryPhotos.sortOrder), asc(galleryPhotos.createdAt))
      .all(),
    albumRow.matchId
      ? db
          .select({
            id: matches.id,
            opponent: matches.opponent,
            tournamentId: matches.tournamentId,
            myScore: matches.myScore,
            opponentScore: matches.opponentScore,
            status: matches.status,
          })
          .from(matches)
          .where(eq(matches.id, albumRow.matchId))
          .get()
      : Promise.resolve(undefined),
  ]);

  let linkedTournamentName: string | null = null;
  if (matchRow?.tournamentId) {
    const tRow = await db
      .select({ name: tournaments.name })
      .from(tournaments)
      .where(eq(tournaments.id, matchRow.tournamentId))
      .get();
    linkedTournamentName = tRow?.name || null;
  }

  const candidateSet = new Set(access.candidateUserIds);
  const isTeamAdmin = access.canManageTeamId(teamId);
  const canManageAlbum =
    isTeamAdmin ||
    Boolean(
      albumRow.createdByUserId && candidateSet.has(albumRow.createdByUserId)
    );

  let activeRawTotalBytes = 0;
  let activeRawPhotoCount = 0;
  let earliestRawExpiresAt: number | null = null;
  let webTotalBytes = 0;

  const photos = photoRows.map((p) => {
    const pWebBytes = (p.thumbBytes || 0) + (p.webBytes || 0);
    webTotalBytes += pWebBytes;

    const hasOriginal = Boolean(
      p.originalKey && p.originalExpiresAt && p.originalExpiresAt > nowSec
    );
    if (hasOriginal && p.originalExpiresAt) {
      activeRawTotalBytes += p.originalBytes || 0;
      activeRawPhotoCount += 1;
      if (
        earliestRawExpiresAt === null ||
        p.originalExpiresAt < earliestRawExpiresAt
      ) {
        earliestRawExpiresAt = p.originalExpiresAt;
      }
    }

    const canDelete =
      canManageAlbum ||
      Boolean(
        p.uploadedByUserId && candidateSet.has(p.uploadedByUserId)
      );

    return {
      id: p.id,
      albumId: p.albumId,
      fileName: p.fileName,
      thumbUrl: buildMediaUrl(teamId, albumId, p.thumbKey),
      webUrl: buildMediaUrl(teamId, albumId, p.webKey),
      webBytes: p.webBytes || 0,
      width: p.width || 0,
      height: p.height || 0,
      hasOriginal,
      originalUrl:
        hasOriginal && p.originalKey
          ? buildMediaUrl(teamId, albumId, p.originalKey)
          : null,
      originalBytes: hasOriginal ? p.originalBytes || 0 : 0,
      originalMimeType: hasOriginal ? p.originalMimeType : null,
      originalExpiresAt: hasOriginal ? p.originalExpiresAt : null,
      uploadedByName: p.uploadedByName || "メンバー",
      canDelete,
      sortOrder: p.sortOrder,
      createdAt:
        p.createdAt instanceof Date
          ? p.createdAt.toISOString()
          : new Date().toISOString(),
    };
  });

  let matchScoreLabel: string | null = null;
  if (
    matchRow &&
    (matchRow.status === "finished" || matchRow.status === "live")
  ) {
    const my = matchRow.myScore ?? 0;
    const opp = matchRow.opponentScore ?? 0;
    const suffix =
      matchRow.status === "live"
        ? "LIVE"
        : my > opp
          ? "WIN"
          : my < opp
            ? "LOSE"
            : "DRAW";
    matchScoreLabel = `${my} - ${opp} ${suffix}`;
  }

  return c.json({
    success: true,
    isDemo: false,
    album: {
      id: albumRow.id,
      teamId: albumRow.teamId,
      matchId: albumRow.matchId,
      matchOpponent: matchRow?.opponent || null,
      matchScoreLabel,
      matchTournamentName: linkedTournamentName,
      title: albumRow.title,
      albumDate: albumRow.albumDate,
      category: albumRow.category,
      notes: albumRow.notes || "",
      photoCount: photos.length,
      webTotalBytes,
      activeRawTotalBytes,
      activeRawPhotoCount,
      earliestRawExpiresAt,
      coverThumbUrl: photos[0]?.thumbUrl || albumRow.coverThumbUrl || null,
      previewThumbUrls: photos.slice(0, 4).map((p) => p.thumbUrl),
      createdByUserId: albumRow.createdByUserId,
      createdByName: albumRow.createdByName || "チームメンバー",
      canManage: canManageAlbum,
    },
    photos,
    canManageAlbum,
  });
});

// ==========================================
// ➕ 4. アルバム新規作成（試合連動時は既存アルバム再利用も可）
// POST /api/liff/gallery/albums?teamId=...
// ==========================================
interface CreateAlbumPayload {
  teamId?: string;
  matchId?: string | null;
  title?: string;
  albumDate?: string;
  category?: string;
  notes?: string;
  reuseExistingMatchAlbum?: boolean;
  userName?: string;
}

app.post("/albums", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as CreateAlbumPayload;
  const teamId = (c.req.query("teamId") || body.teamId || "").trim();

  if (!teamId || teamId === "demo-team") {
    return c.json(
      {
        success: false,
        error: "体験デモチームではアルバムの新規保存はできません",
      },
      403
    );
  }

  const access = await resolveCallerTeamAccess(c);
  if (!access.canAccessTeam(teamId)) {
    return c.json({ success: false, error: "権限がありません" }, 403);
  }

  await ensureGallerySchema(c.env.DB);
  const db = drizzle(c.env.DB);

  const matchId = body.matchId ? body.matchId.trim() : null;
  if (matchId && body.reuseExistingMatchAlbum !== false) {
    const existing = await db
      .select()
      .from(galleryAlbums)
      .where(
        and(
          eq(galleryAlbums.teamId, teamId),
          eq(galleryAlbums.matchId, matchId)
        )
      )
      .get();
    if (existing) {
      return c.json({
        success: true,
        reused: true,
        albumId: existing.id,
      });
    }
  }

  const title = (body.title || "").trim();
  if (!title) {
    return c.json(
      { success: false, error: "アルバムタイトルを入力してください" },
      400
    );
  }

  const todayStr = new Date(Date.now() + 9 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  const albumDate = /^\d{4}-\d{2}-\d{2}$/.test(body.albumDate || "")
    ? (body.albumDate as string)
    : todayStr;
  const category = ["match", "practice", "event", "other"].includes(
    body.category || ""
  )
    ? (body.category as string)
    : matchId
      ? "match"
      : "event";
  const notes = (body.notes || "").trim() || null;

  const creatorId =
    access.sessionUser?.id ||
    access.headerUserId ||
    access.candidateUserIds[0] ||
    null;
  const creatorName =
    (body.userName || "").trim() ||
    access.sessionUser?.name ||
    extractHeaderUserName(c) ||
    "チームメンバー";

  const albumId = crypto.randomUUID();
  const now = new Date();

  await db.insert(galleryAlbums).values({
    id: albumId,
    teamId,
    matchId,
    title,
    albumDate,
    category,
    notes,
    photoCount: 0,
    webTotalBytes: 0,
    rawTotalBytes: 0,
    coverThumbUrl: null,
    createdByUserId: creatorId,
    createdByName: creatorName,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({
    success: true,
    reused: false,
    albumId,
  });
});

// ==========================================
// ✏️ 5. アルバム情報編集
// PATCH /api/liff/gallery/albums/:albumId?teamId=...
// ==========================================
interface UpdateAlbumPayload {
  teamId?: string;
  title?: string;
  albumDate?: string;
  category?: string;
  notes?: string;
  matchId?: string | null;
}

app.patch("/albums/:albumId", async (c) => {
  const albumId = (c.req.param("albumId") || "").trim();
  const body = (await c.req.json().catch(() => ({}))) as UpdateAlbumPayload;
  const teamId = (c.req.query("teamId") || body.teamId || "").trim();

  if (!albumId || !teamId || teamId === "demo-team") {
    return c.json({ success: false, error: "変更できません" }, 400);
  }

  const access = await resolveCallerTeamAccess(c);
  if (!access.canAccessTeam(teamId)) {
    return c.json({ success: false, error: "権限がありません" }, 403);
  }

  await ensureGallerySchema(c.env.DB);
  const db = drizzle(c.env.DB);

  const album = await db
    .select()
    .from(galleryAlbums)
    .where(
      and(eq(galleryAlbums.id, albumId), eq(galleryAlbums.teamId, teamId))
    )
    .get();
  if (!album) {
    return c.json({ success: false, error: "アルバムが見つかりません" }, 404);
  }

  const candidateSet = new Set(access.candidateUserIds);
  const canManage =
    access.canManageTeamId(teamId) ||
    Boolean(album.createdByUserId && candidateSet.has(album.createdByUserId));
  if (!canManage) {
    return c.json(
      {
        success: false,
        error: "アルバム作成者またはチーム管理者のみ編集できます",
      },
      403
    );
  }

  const nextTitle =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : album.title;
  const nextDate =
    typeof body.albumDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(body.albumDate)
      ? body.albumDate
      : album.albumDate;
  const nextCategory =
    typeof body.category === "string" &&
    ["match", "practice", "event", "other"].includes(body.category)
      ? body.category
      : album.category;
  const nextNotes =
    body.notes !== undefined ? body.notes.trim() || null : album.notes;
  const nextMatchId =
    body.matchId !== undefined
      ? body.matchId
        ? body.matchId.trim()
        : null
      : album.matchId;

  await db
    .update(galleryAlbums)
    .set({
      title: nextTitle,
      albumDate: nextDate,
      category: nextCategory,
      notes: nextNotes,
      matchId: nextMatchId,
      updatedAt: new Date(),
    })
    .where(eq(galleryAlbums.id, albumId));

  return c.json({ success: true });
});

// ==========================================
// 🗑️ 6. アルバム完全削除（R2内の全画像・元データも一括削除）
// DELETE /api/liff/gallery/albums/:albumId?teamId=...
// ==========================================
app.delete("/albums/:albumId", async (c) => {
  const albumId = (c.req.param("albumId") || "").trim();
  const teamId = (c.req.query("teamId") || "").trim();

  if (!albumId || !teamId || teamId === "demo-team") {
    return c.json({ success: false, error: "削除できません" }, 400);
  }

  const access = await resolveCallerTeamAccess(c);
  if (!access.canAccessTeam(teamId)) {
    return c.json({ success: false, error: "権限がありません" }, 403);
  }

  await ensureGallerySchema(c.env.DB);
  const db = drizzle(c.env.DB);

  const album = await db
    .select()
    .from(galleryAlbums)
    .where(
      and(eq(galleryAlbums.id, albumId), eq(galleryAlbums.teamId, teamId))
    )
    .get();
  if (!album) {
    return c.json({ success: false, error: "アルバムが見つかりません" }, 404);
  }

  const candidateSet = new Set(access.candidateUserIds);
  const canManage =
    access.canManageTeamId(teamId) ||
    Boolean(album.createdByUserId && candidateSet.has(album.createdByUserId));
  if (!canManage) {
    return c.json(
      {
        success: false,
        error: "アルバム作成者またはチーム管理者のみ削除できます",
      },
      403
    );
  }

  const photos = await db
    .select({
      thumbKey: galleryPhotos.thumbKey,
      webKey: galleryPhotos.webKey,
      originalKey: galleryPhotos.originalKey,
    })
    .from(galleryPhotos)
    .where(eq(galleryPhotos.albumId, albumId))
    .all();

  const keysToDelete: string[] = [];
  for (const p of photos) {
    if (p.thumbKey) keysToDelete.push(p.thumbKey);
    if (p.webKey) keysToDelete.push(p.webKey);
    if (p.originalKey) keysToDelete.push(p.originalKey);
  }
  await deleteR2KeysInChunks(c.env.BUCKET, keysToDelete);

  await db.delete(galleryAlbums).where(eq(galleryAlbums.id, albumId));

  return c.json({ success: true, deletedPhotos: photos.length });
});

// ==========================================
// 📤 7. 最適化済み写真（サムネイル＋Web高画質）の1枚アップロード
// POST /api/liff/gallery/albums/:albumId/photos?teamId=...
// ==========================================
app.post("/albums/:albumId/photos", async (c) => {
  const albumId = (c.req.param("albumId") || "").trim();
  const teamId = (c.req.query("teamId") || "").trim();

  if (!albumId || !teamId || teamId === "demo-team") {
    return c.json(
      {
        success: false,
        error: "体験デモチームでは写真をアップロードできません",
      },
      403
    );
  }

  if (!c.env.BUCKET) {
    return c.json(
      { success: false, error: "R2ストレージが構成されていません" },
      500
    );
  }

  const access = await resolveCallerTeamAccess(c);
  if (!access.canAccessTeam(teamId)) {
    return c.json({ success: false, error: "権限がありません" }, 403);
  }

  await ensureGallerySchema(c.env.DB);
  const db = drizzle(c.env.DB);

  const album = await db
    .select({ id: galleryAlbums.id, teamId: galleryAlbums.teamId })
    .from(galleryAlbums)
    .where(
      and(eq(galleryAlbums.id, albumId), eq(galleryAlbums.teamId, teamId))
    )
    .get();
  if (!album) {
    return c.json({ success: false, error: "アルバムが見つかりません" }, 404);
  }

  const formData = await c.req.parseBody();
  const thumbFile = formData["thumb"];
  const webFile = formData["web"];

  if (!(thumbFile instanceof File) || !(webFile instanceof File)) {
    return c.json(
      { success: false, error: "画像データが不足しています" },
      400
    );
  }

  const rawFileName =
    typeof formData["fileName"] === "string" && formData["fileName"].trim()
      ? formData["fileName"].trim()
      : webFile.name || "photo.jpg";
  const width = Number(formData["width"] || 0) || 0;
  const height = Number(formData["height"] || 0) || 0;
  const sortOrder = Number(formData["sortOrder"] || 0) || 0;
  const uploaderNameField =
    typeof formData["userName"] === "string" ? formData["userName"].trim() : "";

  const photoId = crypto.randomUUID();
  const secret = generateHexSecret(12); // 24 hex chars
  const thumbKey = `gallery/${teamId}/${albumId}/${photoId}_${secret}_thumb.jpg`;
  const webKey = `gallery/${teamId}/${albumId}/${photoId}_${secret}_web.jpg`;

  const [thumbBuf, webBuf] = await Promise.all([
    thumbFile.arrayBuffer(),
    webFile.arrayBuffer(),
  ]);

  await Promise.all([
    c.env.BUCKET.put(thumbKey, thumbBuf, {
      httpMetadata: { contentType: thumbFile.type || "image/jpeg" },
    }),
    c.env.BUCKET.put(webKey, webBuf, {
      httpMetadata: { contentType: webFile.type || "image/jpeg" },
    }),
  ]);

  const uploaderId =
    access.sessionUser?.id ||
    access.headerUserId ||
    access.candidateUserIds[0] ||
    null;
  const uploaderName =
    uploaderNameField ||
    access.sessionUser?.name ||
    extractHeaderUserName(c) ||
    "メンバー";

  const thumbBytes = thumbBuf.byteLength;
  const webBytes = webBuf.byteLength;
  const addedBytes = thumbBytes + webBytes;
  const thumbUrl = buildMediaUrl(teamId, albumId, thumbKey);
  const webUrl = buildMediaUrl(teamId, albumId, webKey);
  const now = new Date();

  await db.insert(galleryPhotos).values({
    id: photoId,
    albumId,
    teamId,
    fileName: rawFileName,
    thumbKey,
    thumbBytes,
    webKey,
    webBytes,
    width,
    height,
    originalKey: null,
    originalBytes: 0,
    originalMimeType: null,
    originalExpiresAt: null,
    uploadedByUserId: uploaderId,
    uploadedByName: uploaderName,
    sortOrder,
    createdAt: now,
  });

  await db
    .update(galleryAlbums)
    .set({
      photoCount: sql`${galleryAlbums.photoCount} + 1`,
      webTotalBytes: sql`${galleryAlbums.webTotalBytes} + ${addedBytes}`,
      coverThumbUrl: sql`COALESCE(${galleryAlbums.coverThumbUrl}, ${thumbUrl})`,
      updatedAt: now,
    })
    .where(eq(galleryAlbums.id, albumId));

  return c.json({
    success: true,
    photo: {
      id: photoId,
      albumId,
      fileName: rawFileName,
      thumbUrl,
      webUrl,
      webBytes,
      width,
      height,
      hasOriginal: false,
      originalUrl: null,
      originalBytes: 0,
      originalMimeType: null,
      originalExpiresAt: null,
      uploadedByName: uploaderName,
      canDelete: true,
      sortOrder,
      createdAt: now.toISOString(),
    },
  });
});

// ==========================================
// 📦 8. 7日間限定の無圧縮オリジナルデータ・ダイレクトストリーム保存
// PUT /api/liff/gallery/photos/:photoId/original?teamId=...&ext=...&size=...
// Workerメモリを圧迫せず c.req.raw.body を直接 R2 へストリーミング保存
// ==========================================
app.put("/photos/:photoId/original", async (c) => {
  const photoId = (c.req.param("photoId") || "").trim();
  const teamId = (c.req.query("teamId") || "").trim();

  if (!photoId || !teamId || teamId === "demo-team") {
    return c.json({ success: false, error: "保存できません" }, 400);
  }

  if (!c.env.BUCKET) {
    return c.json(
      { success: false, error: "R2ストレージが構成されていません" },
      500
    );
  }

  const access = await resolveCallerTeamAccess(c);
  if (!access.canAccessTeam(teamId)) {
    return c.json({ success: false, error: "権限がありません" }, 403);
  }

  await ensureGallerySchema(c.env.DB);
  const db = drizzle(c.env.DB);

  const photo = await db
    .select({
      id: galleryPhotos.id,
      albumId: galleryPhotos.albumId,
      teamId: galleryPhotos.teamId,
      originalKey: galleryPhotos.originalKey,
    })
    .from(galleryPhotos)
    .where(
      and(eq(galleryPhotos.id, photoId), eq(galleryPhotos.teamId, teamId))
    )
    .get();

  if (!photo) {
    return c.json({ success: false, error: "対象の写真が見つかりません" }, 404);
  }

  const contentType = c.req.header("content-type") || "image/jpeg";
  const ext = sanitizeFileExtension(c.req.query("ext"), contentType);
  const rawSecret = generateHexSecret(12);
  const originalKey = `gallery-raw/${teamId}/${photo.albumId}/${photo.id}_${rawSecret}_orig.${ext}`;

  const contentLengthHeader = Number(c.req.header("content-length") || 0);
  const querySize = Number(c.req.query("size") || 0);
  let storedBytes = 0;

  if (c.req.raw.body && contentLengthHeader > 0) {
    await c.env.BUCKET.put(originalKey, c.req.raw.body, {
      httpMetadata: { contentType },
    });
    storedBytes = contentLengthHeader;
  } else {
    const rawBuf = await c.req.arrayBuffer();
    await c.env.BUCKET.put(originalKey, rawBuf, {
      httpMetadata: { contentType },
    });
    storedBytes = rawBuf.byteLength || querySize;
  }

  if (photo.originalKey) {
    await deleteR2KeysInChunks(c.env.BUCKET, [photo.originalKey]);
  }

  const expiresAtSec = Math.floor(Date.now() / 1000) + RAW_RETENTION_SECONDS;

  await db
    .update(galleryPhotos)
    .set({
      originalKey,
      originalBytes: storedBytes,
      originalMimeType: contentType,
      originalExpiresAt: expiresAtSec,
    })
    .where(eq(galleryPhotos.id, photo.id));

  await recalculateAlbumCounters(db, photo.albumId);

  return c.json({
    success: true,
    originalUrl: buildMediaUrl(teamId, photo.albumId, originalKey),
    originalBytes: storedBytes,
    originalExpiresAt: expiresAtSec,
  });
});

// ==========================================
// 🧹 9. アルバム内の元画質（一時大容量データ）のみ今すぐ削除して容量解放
// POST /api/liff/gallery/albums/:albumId/purge-originals?teamId=...
// ==========================================
app.post("/albums/:albumId/purge-originals", async (c) => {
  const albumId = (c.req.param("albumId") || "").trim();
  const teamId = (c.req.query("teamId") || "").trim();

  if (!albumId || !teamId || teamId === "demo-team") {
    return c.json({ success: false, error: "実行できません" }, 400);
  }

  const access = await resolveCallerTeamAccess(c);
  if (!access.canAccessTeam(teamId)) {
    return c.json({ success: false, error: "権限がありません" }, 403);
  }

  await ensureGallerySchema(c.env.DB);
  const db = drizzle(c.env.DB);

  const album = await db
    .select()
    .from(galleryAlbums)
    .where(
      and(eq(galleryAlbums.id, albumId), eq(galleryAlbums.teamId, teamId))
    )
    .get();
  if (!album) {
    return c.json({ success: false, error: "アルバムが見つかりません" }, 404);
  }

  const candidateSet = new Set(access.candidateUserIds);
  const canManage =
    access.canManageTeamId(teamId) ||
    Boolean(album.createdByUserId && candidateSet.has(album.createdByUserId));
  if (!canManage) {
    return c.json(
      {
        success: false,
        error: "アルバム作成者またはチーム管理者のみ実行できます",
      },
      403
    );
  }

  const rawPhotos = await db
    .select({
      id: galleryPhotos.id,
      originalKey: galleryPhotos.originalKey,
      originalBytes: galleryPhotos.originalBytes,
    })
    .from(galleryPhotos)
    .where(
      and(
        eq(galleryPhotos.albumId, albumId),
        isNotNull(galleryPhotos.originalKey)
      )
    )
    .all();

  let freedBytes = 0;
  const keys: string[] = [];
  const ids: string[] = [];
  for (const p of rawPhotos) {
    if (p.originalKey) {
      keys.push(p.originalKey);
      ids.push(p.id);
      freedBytes += p.originalBytes || 0;
    }
  }

  if (keys.length > 0) {
    await deleteR2KeysInChunks(c.env.BUCKET, keys);
    await db
      .update(galleryPhotos)
      .set({
        originalKey: null,
        originalBytes: 0,
        originalMimeType: null,
        originalExpiresAt: null,
      })
      .where(inArray(galleryPhotos.id, ids));
  }

  await recalculateAlbumCounters(db, albumId);

  return c.json({
    success: true,
    purgedCount: ids.length,
    freedBytes,
  });
});

// ==========================================
// 🗑️ 10. 選択した写真の一括削除
// POST /api/liff/gallery/photos/delete?teamId=...
// ==========================================
interface DeletePhotosPayload {
  teamId?: string;
  albumId?: string;
  photoIds?: string[];
}

app.post("/photos/delete", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as DeletePhotosPayload;
  const teamId = (c.req.query("teamId") || body.teamId || "").trim();
  const albumId = (body.albumId || "").trim();
  const photoIds = Array.isArray(body.photoIds)
    ? body.photoIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
    : [];

  if (!teamId || teamId === "demo-team" || !albumId || photoIds.length === 0) {
    return c.json({ success: false, error: "削除対象が指定されていません" }, 400);
  }

  const access = await resolveCallerTeamAccess(c);
  if (!access.canAccessTeam(teamId)) {
    return c.json({ success: false, error: "権限がありません" }, 403);
  }

  await ensureGallerySchema(c.env.DB);
  const db = drizzle(c.env.DB);

  const album = await db
    .select()
    .from(galleryAlbums)
    .where(
      and(eq(galleryAlbums.id, albumId), eq(galleryAlbums.teamId, teamId))
    )
    .get();
  if (!album) {
    return c.json({ success: false, error: "アルバムが見つかりません" }, 404);
  }

  const candidateSet = new Set(access.candidateUserIds);
  const canManageAll =
    access.canManageTeamId(teamId) ||
    Boolean(album.createdByUserId && candidateSet.has(album.createdByUserId));

  const targetRows = await db
    .select({
      id: galleryPhotos.id,
      thumbKey: galleryPhotos.thumbKey,
      webKey: galleryPhotos.webKey,
      originalKey: galleryPhotos.originalKey,
      uploadedByUserId: galleryPhotos.uploadedByUserId,
    })
    .from(galleryPhotos)
    .where(
      and(
        eq(galleryPhotos.albumId, albumId),
        eq(galleryPhotos.teamId, teamId),
        inArray(galleryPhotos.id, photoIds)
      )
    )
    .all();

  const deletableRows = targetRows.filter(
    (r) =>
      canManageAll ||
      Boolean(r.uploadedByUserId && candidateSet.has(r.uploadedByUserId))
  );

  if (deletableRows.length === 0) {
    return c.json(
      { success: false, error: "選択した写真を削除する権限がありません" },
      403
    );
  }

  const keys: string[] = [];
  const deletableIds: string[] = [];
  for (const r of deletableRows) {
    deletableIds.push(r.id);
    if (r.thumbKey) keys.push(r.thumbKey);
    if (r.webKey) keys.push(r.webKey);
    if (r.originalKey) keys.push(r.originalKey);
  }

  await deleteR2KeysInChunks(c.env.BUCKET, keys);
  await db
    .delete(galleryPhotos)
    .where(inArray(galleryPhotos.id, deletableIds));
  await recalculateAlbumCounters(db, albumId);

  return c.json({
    success: true,
    deletedCount: deletableIds.length,
  });
});

export default app;
