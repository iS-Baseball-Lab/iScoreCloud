// src/lib/auth-client.ts
import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";

/**
 * 💡 Client SDK Instance
 * ブラウザ上での認証操作（ログイン、サインアップ、セッション監視）を行うためのクライアント。
 */
export const authClient = createAuthClient({
  // baseURL は環境変数 NEXT_PUBLIC_BETTER_AUTH_URL から自動取得される想定
  // 空（未定義）の場合は Better Auth が自動的に現在のドメイン（window.location.origin）をベースにします
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL || undefined,
  plugins: [
    adminClient() // 💡 管理者向け操作をクライアントでも有効化
  ]
});

export const { signIn, signUp, signOut, useSession } = authClient;
