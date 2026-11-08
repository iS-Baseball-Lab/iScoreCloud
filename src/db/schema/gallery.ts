// filepath: src/db/schema/gallery.ts
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { teams } from "./team";

// ==========================================
// 📸 チームフォトギャラリー：アルバムテーブル
// 試合（matchId連動）や合宿・イベントごとの写真アルバム
// ==========================================
export const galleryAlbums = sqliteTable(
  "gallery_albums",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    matchId: text("match_id"),
    title: text("title").notNull(),
    albumDate: text("album_date").notNull(), // 'YYYY-MM-DD'
    category: text("category").notNull().default("match"), // 'match' | 'practice' | 'event' | 'other'
    notes: text("notes"),
    photoCount: integer("photo_count").notNull().default(0),
    webTotalBytes: integer("web_total_bytes").notNull().default(0),
    rawTotalBytes: integer("raw_total_bytes").notNull().default(0),
    coverThumbUrl: text("cover_thumb_url"),
    createdByUserId: text("created_by_user_id"),
    createdByName: text("created_by_name"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(strftime('%s', 'now'))`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(strftime('%s', 'now'))`),
  },
  (table) => [
    index("idx_gallery_albums_team_date").on(table.teamId, table.albumDate),
    index("idx_gallery_albums_team_match").on(table.teamId, table.matchId),
  ]
);

// ==========================================
// 🖼️ チームフォトギャラリー：写真テーブル
// 常設の軽量Web高画質（長辺2048px）＋ 任意の7日間限定・無圧縮オリジナルデータ
// ==========================================
export const galleryPhotos = sqliteTable(
  "gallery_photos",
  {
    id: text("id").primaryKey(),
    albumId: text("album_id")
      .notNull()
      .references(() => galleryAlbums.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    thumbKey: text("thumb_key").notNull(),
    thumbBytes: integer("thumb_bytes").notNull().default(0),
    webKey: text("web_key").notNull(),
    webBytes: integer("web_bytes").notNull().default(0),
    width: integer("width").notNull().default(0),
    height: integer("height").notNull().default(0),
    originalKey: text("original_key"),
    originalBytes: integer("original_bytes").notNull().default(0),
    originalMimeType: text("original_mime_type"),
    originalExpiresAt: integer("original_expires_at"), // Unix秒（7日経過後にR2から自動パージ）
    uploadedByUserId: text("uploaded_by_user_id"),
    uploadedByName: text("uploaded_by_name"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(strftime('%s', 'now'))`),
  },
  (table) => [
    index("idx_gallery_photos_album_sort").on(
      table.albumId,
      table.sortOrder,
      table.createdAt
    ),
    index("idx_gallery_photos_team_exp").on(
      table.teamId,
      table.originalExpiresAt
    ),
  ]
);

