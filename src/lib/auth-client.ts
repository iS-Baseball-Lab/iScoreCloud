// src/lib/auth-client.ts
import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";

/**
 * 💡 Client SDK Instance
 * ブラウザ上での認証操作（ログイン、サインアップ、セッション監視）を行うためのクライアント。
 */
export const authClient = createAuthClient({
  // ブラウザ上では常に現在開いている同一オリジン（workers.dev / カスタムドメイン / localhost）を使用し、
  // 別オリジンへの不要なクロスオリジン通信・タイムアウトを完全に防止する
  baseURL: typeof window !== "undefined" ? window.location.origin : (process.env.NEXT_PUBLIC_BETTER_AUTH_URL || undefined),
  plugins: [
    adminClient() // 💡 管理者向け操作をクライアントでも有効化
  ]
});

export const { signIn, signUp, signOut, useSession } = authClient;
