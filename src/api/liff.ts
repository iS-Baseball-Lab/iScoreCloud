// filepath: src/api/liff.ts
import { Hono } from "hono";
import type { WorkerEnv } from "@/types/api";

const app = new Hono<{ Bindings: WorkerEnv }>();

/**
 * LIFF設定情報（LIFF ID）の取得
 * Cloudflare Workersの環境変数・シークレットから安全に取得してクライアントへ提供
 */
app.get("/config", (c) => {
  const liffId = c.env.NEXT_PUBLIC_LIFF_ID || c.env.LIFF_ID || "";
  return c.json({
    success: true,
    liffId: liffId,
  });
});

export default app;
