// filepath: src/api/images.ts
import { Hono, type Context } from "hono";
import { serveR2WithEdgeCache } from "@/lib/r2-edge-cache";
import { resolveCallerTeamAccess } from "@/lib/team-access";
import type { WorkerEnv } from "@/types/api";

const app = new Hono<{ Bindings: WorkerEnv }>();

const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_MIMES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const ALLOWED_SERVE_FOLDERS = new Set([
  "avatars",
  "teams",
  "players",
  "rules",
  "links",
]);
const SAFE_SEGMENT_RE = /^[a-zA-Z0-9._-]{1,180}$/;

function resolveSafeServeMimeType(path: string, storedMime: string): {
  contentType: string;
  forceAttachment: boolean;
} {
  const lowerPath = path.toLowerCase();
  if (lowerPath.endsWith(".jpg") || lowerPath.endsWith(".jpeg")) {
    return { contentType: "image/jpeg", forceAttachment: false };
  }
  if (lowerPath.endsWith(".png")) {
    return { contentType: "image/png", forceAttachment: false };
  }
  if (lowerPath.endsWith(".webp")) {
    return { contentType: "image/webp", forceAttachment: false };
  }
  if (lowerPath.endsWith(".gif")) {
    return { contentType: "image/gif", forceAttachment: false };
  }
  if (lowerPath.endsWith(".pdf")) {
    return { contentType: "application/pdf", forceAttachment: false };
  }
  const cleanMime = storedMime.toLowerCase().split(";")[0].trim();
  if (cleanMime in ALLOWED_IMAGE_MIMES) {
    return { contentType: cleanMime, forceAttachment: false };
  }
  return { contentType: "application/octet-stream", forceAttachment: true };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 💡 1. 画像アップロード API (POST /api/images/upload)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.post("/upload", async (c) => {
  const access = await resolveCallerTeamAccess(c);
  if (!access.isAuthenticated || !access.primaryUserId) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }
  if (!c.env.BUCKET) {
    return c.json({ success: false, error: "Storage unavailable" }, 503);
  }

  const formData = await c.req.parseBody();
  const rawFile = formData["file"];
  if (!(rawFile instanceof File)) {
    return c.json({ success: false, error: "File is required" }, 400);
  }

  if (rawFile.size <= 0 || rawFile.size > MAX_IMAGE_UPLOAD_BYTES) {
    return c.json(
      { success: false, error: "画像サイズは10MB以下にしてください" },
      413
    );
  }

  const cleanMime = (rawFile.type || "").toLowerCase().split(";")[0].trim();
  const safeExt = ALLOWED_IMAGE_MIMES[cleanMime];
  if (!safeExt) {
    return c.json(
      {
        success: false,
        error: "JPEG / PNG / WebP / GIF 形式の画像のみアップロード可能です",
      },
      400
    );
  }

  const uploadType = c.req.query("type") || "avatar";
  const folder = uploadType === "team" ? "teams" : "avatars";
  const safeUid = access.primaryUserId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "u";
  const randomSuffix = crypto.randomUUID().replace(/-/g, "");
  const fileName = `${folder}/${safeUid}-${Date.now()}-${randomSuffix}.${safeExt}`;

  try {
    await c.env.BUCKET.put(fileName, await rawFile.arrayBuffer(), {
      httpMetadata: { contentType: cleanMime },
    });

    const imageUrl = `/api/images/${fileName}`;
    return c.json({ success: true, imageUrl });
  } catch (e) {
    console.error("画像アップロードエラー:", e);
    return c.json({ success: false, error: "Upload failed" }, 500);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 💡 2. 画像・添付ファイル配信 API（認証通過後 Edge Cache ＋ ETag 304 対応）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function serveImage(
  c: Context<{ Bindings: WorkerEnv }>,
  folder: string,
  segments: string[]
) {
  if (!c.env.BUCKET) return c.text("Not found", 404);
  if (!ALLOWED_SERVE_FOLDERS.has(folder)) {
    return c.text("Not found", 404);
  }
  for (const seg of segments) {
    if (!seg || seg.includes("..") || !SAFE_SEGMENT_RE.test(seg)) {
      return c.text("Not found", 404);
    }
  }

  const path = `${folder}/${segments.join("/")}`;
  let execCtx: ExecutionContext | null = null;
  try {
    execCtx = c.executionCtx;
  } catch {
    execCtx = null;
  }

  const res = await serveR2WithEdgeCache({
    bucket: c.env.BUCKET,
    r2Key: path,
    requestHeaders: c.req.raw.headers,
    executionCtx: execCtx,
    edgeTtlSeconds: 86400,
    buildResponseHeaders: ({ httpEtag, storedContentType }) => {
      const { contentType, forceAttachment } = resolveSafeServeMimeType(
        path,
        storedContentType
      );
      const headers = new Headers();
      if (httpEtag) headers.set("ETag", httpEtag);
      headers.set("Content-Type", contentType);
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Content-Security-Policy", "sandbox");
      if (forceAttachment) {
        headers.set("Content-Disposition", "attachment");
      } else if (contentType === "application/pdf") {
        headers.set("Content-Disposition", "inline");
      }
      headers.set("Cache-Control", "private, max-age=86400");
      return headers;
    },
  });

  if (!res) return c.text("Not found", 404);
  return res;
}

app.get("/:folder/:filename", async (c) => {
  return serveImage(c, c.req.param("folder"), [c.req.param("filename")]);
});

app.get("/:folder/:subfolder/:filename", async (c) => {
  return serveImage(c, c.req.param("folder"), [
    c.req.param("subfolder"),
    c.req.param("filename"),
  ]);
});

export default app;