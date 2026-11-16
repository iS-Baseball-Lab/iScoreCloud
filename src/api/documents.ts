// filepath: src/api/documents.ts
import { Hono } from "hono";
import { resolveCallerTeamAccess } from "@/lib/team-access";
import type { WorkerEnv } from "@/types/api";

const app = new Hono<{ Bindings: WorkerEnv }>();

const MAX_DOCUMENT_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB
const SAFE_TEAM_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const SAFE_FILENAME_RE = /^[a-zA-Z0-9._-]{1,180}$/;

const ALLOWED_DOC_EXTENSIONS: Record<
  string,
  { fileType: string; mimeType: string; inlineAllowed: boolean }
> = {
  pdf: {
    fileType: "PDF",
    mimeType: "application/pdf",
    inlineAllowed: true,
  },
  png: {
    fileType: "IMG",
    mimeType: "image/png",
    inlineAllowed: true,
  },
  jpg: {
    fileType: "IMG",
    mimeType: "image/jpeg",
    inlineAllowed: true,
  },
  jpeg: {
    fileType: "IMG",
    mimeType: "image/jpeg",
    inlineAllowed: true,
  },
  webp: {
    fileType: "IMG",
    mimeType: "image/webp",
    inlineAllowed: true,
  },
  xls: {
    fileType: "XLSX",
    mimeType: "application/vnd.ms-excel",
    inlineAllowed: false,
  },
  xlsx: {
    fileType: "XLSX",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    inlineAllowed: false,
  },
  csv: {
    fileType: "XLSX",
    mimeType: "text/csv; charset=utf-8",
    inlineAllowed: false,
  },
  doc: {
    fileType: "DOCX",
    mimeType: "application/msword",
    inlineAllowed: false,
  },
  docx: {
    fileType: "DOCX",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    inlineAllowed: false,
  },
  ppt: {
    fileType: "PPTX",
    mimeType: "application/vnd.ms-powerpoint",
    inlineAllowed: false,
  },
  pptx: {
    fileType: "PPTX",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    inlineAllowed: false,
  },
};

/**
 * 📄 資料ファイルアップロード API (POST /api/documents/upload)
 */
app.post("/upload", async (c) => {
  try {
    const access = await resolveCallerTeamAccess(c);
    if (!access.isAuthenticated) {
      return c.json({ success: false, error: "認証が必要です" }, 401);
    }

    let file: File | null = null;
    let teamId = "general";

    try {
      const formData = await c.req.formData();
      const rawFile = formData.get("file");
      if (rawFile instanceof File) file = rawFile;
      const t = formData.get("teamId");
      if (typeof t === "string" && t.trim()) teamId = t.trim();
    } catch {
      const body = await c.req.parseBody();
      const rawFile = body["file"];
      if (rawFile instanceof File) file = rawFile;
      if (typeof body["teamId"] === "string" && body["teamId"].trim()) {
        teamId = body["teamId"].trim();
      }
    }

    if (!SAFE_TEAM_ID_RE.test(teamId) || teamId === "demo-team") {
      return c.json(
        { success: false, error: "有効な保存先チームが指定されていません" },
        400
      );
    }

    if (teamId === "general") {
      if (!access.isSystemAdmin && access.playerManageableTeamIds.size === 0) {
        return c.json(
          { success: false, error: "資料アップロード権限がありません" },
          403
        );
      }
    } else if (!access.canManagePlayersForTeam(teamId)) {
      return c.json(
        { success: false, error: "このチームへの資料アップロード権限がありません" },
        403
      );
    }

    if (!file || !file.name) {
      return c.json(
        { success: false, error: "ファイルが選択されていません" },
        400
      );
    }

    const sizeBytes = file.size || 0;
    if (sizeBytes <= 0 || sizeBytes > MAX_DOCUMENT_UPLOAD_BYTES) {
      return c.json(
        { success: false, error: "資料ファイルは20MB以下にしてください" },
        413
      );
    }

    const originalName = file.name.trim() || "document.pdf";
    const ext = originalName.split(".").pop()?.toLowerCase() || "";
    const spec = ALLOWED_DOC_EXTENSIONS[ext];
    if (!spec) {
      return c.json(
        {
          success: false,
          error:
            "対応していないファイル形式です（PDF / 画像 / Word / Excel / PowerPoint / CSV のみ可能）",
        },
        400
      );
    }

    let fileSizeStr = `${(sizeBytes / 1024).toFixed(0)} KB`;
    if (sizeBytes >= 1024 * 1024) {
      fileSizeStr = `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    if (!c.env.BUCKET) {
      return c.json(
        { success: false, error: "ストレージバケットが設定されていません" },
        500
      );
    }

    const randomToken = crypto.randomUUID().replace(/-/g, "");
    const filename = `${Date.now()}-${randomToken}.${ext}`;
    const r2Key = `documents/${teamId}/${filename}`;
    const safeDispositionName = encodeURIComponent(
      originalName.replace(/[\r\n"]/g, "_")
    );
    const dispositionMode = spec.inlineAllowed ? "inline" : "attachment";

    const arrayBuffer = await file.arrayBuffer();

    await c.env.BUCKET.put(r2Key, arrayBuffer, {
      httpMetadata: {
        contentType: spec.mimeType,
        contentDisposition: `${dispositionMode}; filename*=UTF-8''${safeDispositionName}`,
      },
      customMetadata: {
        originalName: safeDispositionName,
        teamId,
      },
    });

    const fileUrl = `/api/documents/files/${teamId}/${filename}`;

    return c.json({
      success: true,
      fileUrl,
      fileName: originalName,
      fileType: spec.fileType,
      fileSize: fileSizeStr,
    });
  } catch (error: unknown) {
    console.error("Document upload error:", error);
    return c.json(
      { success: false, error: "アップロードに失敗しました" },
      500
    );
  }
});

/**
 * 📄 資料ファイル配信 API (GET /api/documents/files/:teamId/:filename)
 */
app.get("/files/:teamId/:filename", async (c) => {
  const teamId = (c.req.param("teamId") || "").trim();
  const filename = (c.req.param("filename") || "").trim();

  if (
    !SAFE_TEAM_ID_RE.test(teamId) ||
    !SAFE_FILENAME_RE.test(filename) ||
    filename.includes("..")
  ) {
    return c.text("File not found", 404);
  }

  if (!c.env.BUCKET) {
    return c.text("Bucket not configured", 500);
  }

  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const spec = ALLOWED_DOC_EXTENSIONS[ext];
  if (!spec) {
    return c.text("Forbidden file type", 403);
  }

  const path = `documents/${teamId}/${filename}`;
  const object = await c.env.BUCKET.get(path);
  if (!object) {
    return c.text("File not found", 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Content-Type", spec.mimeType);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Security-Policy", "sandbox");

  const dispMode = spec.inlineAllowed ? "inline" : "attachment";
  const safeName = filename.replace(/[\r\n"]/g, "_");
  if (!headers.has("content-disposition") || !spec.inlineAllowed) {
    headers.set("Content-Disposition", `${dispMode}; filename="${safeName}"`);
  }

  headers.set("Cache-Control", "private, max-age=86400");

  return new Response(object.body, {
    status: 200,
    headers,
  });
});

export default app;
