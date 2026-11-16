// filepath: src/lib/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/d1"; // D1用drizzle
import * as schema from "@/db/schema"; // schema全体をインポート

let authSchemaEnsuredD1: D1Database | null = null;
let authSchemaPromise: Promise<void> | null = null;

/**
 * Better-Auth 1.7+ admin プラグイン必須の `session.impersonated_by` カラムを
 * PRAGMA 読取＋Isolateキャッシュで安全に保証する（既存環境での書き込みDDLゼロ）
 */
export async function ensureAuthSchema(d1: D1Database): Promise<void> {
  if (authSchemaEnsuredD1 === d1) return;
  if (!authSchemaPromise) {
    authSchemaPromise = (async () => {
      try {
        const info = await d1
          .prepare("PRAGMA table_info(session)")
          .all<{ name: string }>();
        const cols = new Set((info.results || []).map((r) => r.name));
        if (cols.size > 0 && !cols.has("impersonated_by")) {
          await d1
            .prepare("ALTER TABLE session ADD COLUMN impersonated_by text")
            .run();
        }
        authSchemaEnsuredD1 = d1;
      } catch (err) {
        console.warn("[ensureAuthSchema] skipped:", err);
      } finally {
        authSchemaPromise = null;
      }
    })();
  }
  await authSchemaPromise;
}

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

let authCache: ReturnType<typeof createAuthInstance> | null = null;
let lastD1: D1Database | null = null;

function createAuthInstance(d1: D1Database, env?: AuthEnv) {
  const db = drizzle(d1);
  const configuredBaseUrl = (env?.BETTER_AUTH_URL || "").trim();
  const trustedOrigins = Array.from(
    new Set(
      [
        configuredBaseUrl,
        "https://iscorecloud.com",
        "https://www.iscorecloud.com",
        "https://liff.line.me",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
      ].filter(Boolean)
    )
  );

  return betterAuth({
    baseURL: configuredBaseUrl || undefined,
    trustedOrigins,
    ...(configuredBaseUrl
      ? {}
      : { trustedHeaders: ["x-forwarded-host", "x-forwarded-proto"] }),
    advanced: {
      database: {
        validateSchema: false,
      },
    },
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
          overrideUserInfoOnSignIn: true,
        },
      } : {}),
      ...(env?.LINE_CLIENT_ID ? {
        line: {
          clientId: env.LINE_CLIENT_ID,
          clientSecret: env.LINE_CLIENT_SECRET || "",
          overrideUserInfoOnSignIn: true,
        },
      } : {}),
      ...(env?.MICROSOFT_CLIENT_ID ? {
        microsoft: {
          clientId: env.MICROSOFT_CLIENT_ID,
          clientSecret: env.MICROSOFT_CLIENT_SECRET || "",
          tenantId: env.MICROSOFT_TENANT_ID || "common",
          overrideUserInfoOnSignIn: true,
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
}

export const getAuth = (d1: D1Database, env?: AuthEnv) => {
  if (authCache && lastD1 === d1) {
    return authCache;
  }
  const auth = createAuthInstance(d1, env);
  authCache = auth;
  lastD1 = d1;
  return auth;
};

