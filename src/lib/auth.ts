// src/lib/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/d1"; // D1用drizzle
import * as schema from "@/db/schema"; // schema全体をインポート

/** getAuth に渡す env の最小インターフェイス（c.env と互換） */
interface AuthEnv {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  LINE_CLIENT_ID?: string;
  LINE_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  MICROSOFT_TENANT_ID?: string;
  BETTER_AUTH_URL?: string; // 💡 追加：エッジ環境での OAuth 安定化のため
}

let authCache: ReturnType<typeof betterAuth> | null = null;
let lastD1: D1Database | null = null;

export const getAuth = (d1: D1Database, env?: AuthEnv) => {
  // 💡 パフォーマンス最適化: ID が同じならキャッシュを返す (CPU 制限対策)
  if (authCache && lastD1 === d1) {
    return authCache;
  }

  const db = drizzle(d1);
  authCache = betterAuth({
    baseURL: env?.BETTER_AUTH_URL, // 💡 追加：Cloudflare 環境での baseURL ズレ防止
    trustedHeaders: ["x-forwarded-host", "x-forwarded-proto"], // 💡 追加：プロキシ背後での State 整合性を保証
    user: {
      additionalFields: {
        role: {
          type: "string",
          defaultValue: "GUEST",
          input: false,
        },
      },
    },
    // 🔥 databaseHooks は adminプラグインと競合するため完全に削除しました！

    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: schema,
    }),
    session: {
      expiresIn: 60 * 60 * 24 * 180,
      updateAge: 60 * 60 * 24,
    },
    plugins: [
      admin({
        // 🔥 公式の機能を使って、管理者ロール名とデフォルトロールを設定！
        adminRole: "SYSTEM_ADMIN",
        defaultRole: "GUEST",
      }),
    ],
    socialProviders: {
      ...(env?.GOOGLE_CLIENT_ID ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET || "",
        },
      } : {}),
      ...(env?.LINE_CLIENT_ID ? {
        line: {
          clientId: env.LINE_CLIENT_ID,
          clientSecret: env.LINE_CLIENT_SECRET || "",
        },
      } : {}),
      ...(env?.MICROSOFT_CLIENT_ID ? {
        microsoft: {
          clientId: env.MICROSOFT_CLIENT_ID,
          clientSecret: env.MICROSOFT_CLIENT_SECRET || "",
          tenantId: env.MICROSOFT_TENANT_ID || "common",
        },
      } : {}),
    },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google", "line", "microsoft"], // 信頼するプロバイダを指定
      },
    },
  });

  lastD1 = d1;
  return authCache;
};
