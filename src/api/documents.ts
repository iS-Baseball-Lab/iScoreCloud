// filepath: src/api/documents.ts
import { Hono } from "hono";
import type { WorkerEnv } from "@/types/api";

const app = new Hono<{ Bindings: WorkerEnv }>();

/**
 * 📄 資料ファイルアップロード API (POST /api/documents/upload)
 */
app.post("/upload", async (c) => {
  try {
    let file: File | null = null;
    let teamId = "general";

    try {
      const formData = await c.req.formData();
      file = formData.get("file") as File | null;
      const t = formData.get("teamId");
      if (typeof t === "string" && t) teamId = t;
    } catch {
      // フォールバック
      const body = await c.req.parseBody();
      file = (body["file"] as File) || null;
      if (typeof body["teamId"] === "string" && body["teamId"]) {
        teamId = body["teamId"];
      }
    }

    if (!file || typeof file === "string" || !file.name) {
      return c.json({ success: false, error: "ファイルが選択されていません" }, 400);
    }

    // 拡張子とファイル種別を判定
    const originalName = file.name || "document.pdf";
    const ext = originalName.split(".").pop()?.toLowerCase() || "pdf";
    
    let fileType = "PDF";
    if (["xls", "xlsx", "csv"].includes(ext)) fileType = "XLSX";
    else if (["doc", "docx"].includes(ext)) fileType = "DOCX";
    else if (["png", "jpg", "jpeg", "webp"].includes(ext)) fileType = "IMG";
    else if (["ppt", "pptx"].includes(ext)) fileType = "PPTX";

    // ファイルサイズを人間が読みやすい形式に変換
    const sizeBytes = file.size || 0;
    let fileSizeStr = `${(sizeBytes / 1024).toFixed(0)} KB`;
    if (sizeBytes >= 1024 * 1024) {
      fileSizeStr = `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    // R2バケットが使える場合
    if (c.env.BUCKET) {
      const safeExt = ext.replace(/[^a-z0-9]/gi, "");
      const filename = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${safeExt}`;
      const r2Key = `documents/${teamId}/${filename}`;

      const mimeType = file.type || (ext === "pdf" ? "application/pdf" : "application/octet-stream");

      const arrayBuffer = await file.arrayBuffer();

      await c.env.BUCKET.put(r2Key, arrayBuffer, {
        httpMetadata: {
          contentType: mimeType,
          contentDisposition: `inline; filename="${encodeURIComponent(originalName)}"`,
        },
        customMetadata: {
          originalName: encodeURIComponent(originalName),
          teamId,
        },
      });

      const fileUrl = `/api/documents/files/${teamId}/${filename}`;

      return c.json({
        success: true,
        fileUrl,
        fileName: originalName,
        fileType,
        fileSize: fileSizeStr,
      });
    }

    return c.json({
      success: false,
      error: "ストレージバケットが設定されていません",
    }, 500);
  } catch (error: any) {
    console.error("Document upload error:", error);
    return c.json({ success: false, error: error?.message || "アップロードに失敗しました" }, 500);
  }
});

/**
 * 📄 資料ファイル配信 API (GET /api/documents/files/:teamId/:filename)
 */
app.get("/files/:teamId/:filename", async (c) => {
  const teamId = c.req.param("teamId");
  const filename = c.req.param("filename");
  const path = `documents/${teamId}/${filename}`;

  if (!c.env.BUCKET) {
    return c.text("Bucket not configured", 500);
  }

  const object = await c.env.BUCKET.get(path);
  if (!object) {
    return c.text("File not found", 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  
  if (!headers.has("content-disposition")) {
    headers.set("content-disposition", `inline; filename="${filename}"`);
  }
  
  headers.set("cache-control", "public, max-age=604800, immutable");

  return new Response(object.body as any, {
    headers,
  });
});

export default app;
