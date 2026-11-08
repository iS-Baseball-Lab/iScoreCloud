// filepath: src/components/layout/protected-client-layout.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";

interface AuthMembershipItem {
  teamId: string;
  teamName: string;
  role: string;
  status: string;
  isMainTeam: boolean;
}

interface AuthMeCheckResponse {
  success?: boolean;
  data?: {
    id: string;
    role?: string;
    systemRole?: string;
    memberships?: AuthMembershipItem[];
  };
}

function clearUnauthorizedWebTeamStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("iscore_auth_cache_active");
    localStorage.removeItem("iscore_selectedTeamId");
    localStorage.removeItem("iscore_selectedTeamName");
    localStorage.removeItem("iscore_selectedTeamCategory");
    localStorage.removeItem("iscore_selectedTeamLogo");
    localStorage.removeItem("iscore_selectedTeamLegend");
    localStorage.removeItem("iscore_teams_json");
    localStorage.removeItem("iscore_teams_v2_json");
    localStorage.removeItem("iscore_currentTeam_json");
    localStorage.removeItem("iscore_currentTeam_v2_json");
  } catch {
    // ignore storage errors
  }
}

export function ProtectedClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // 💡 検問のステータス（最初は「確認中」なので false）
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });

        // 💡 サーバーが明示的に未認証（401等）を返した場合はログイン画面へ
        if (res.status === 401) {
          clearUnauthorizedWebTeamStorage();
          router.replace("/login");
          return;
        }

        const json = (await res.json()) as AuthMeCheckResponse;

        // 1. 未ログインならログイン画面へ弾く
        if (!json.success || !json.data) {
          clearUnauthorizedWebTeamStorage();
          router.replace("/login");
          return;
        }

        const isSystemAdmin =
          json.data.systemRole === "SYSTEM_ADMIN" ||
          json.data.role === "SYSTEM_ADMIN";
        const memberships = json.data.memberships || [];
        const hasActive = memberships.some((m) => m.status === "active");

        // 🌟 2. 承認済みのチームがなく SYSTEM_ADMIN でもない場合は承認待ち・招待コード入力画面へ強制遷移
        if (!hasActive && !isSystemAdmin) {
          clearUnauthorizedWebTeamStorage();
          router.replace("/pending-approval");
          return;
        }

        // 💡 3. 承認済みチームが確認できたユーザーのみオフライン救済キャッシュを保存し、描画を許可
        if (typeof window !== "undefined") {
          localStorage.setItem("iscore_auth_cache_active", "true");
        }
        setIsAuthorized(true);
      } catch (error) {
        console.error("認証チェックエラー (電波不良・オフラインの可能性あり):", error);

        // 💡 現場至上主義：電波不良やオフラインによる通信エラー時、
        // 過去に承認済みログイン実績（localStorage）がある、またはオフライン状態であればスルーさせて入力を継続！
        if (typeof window !== "undefined") {
          const hasAuthCache = localStorage.getItem("iscore_auth_cache_active") === "true";
          const isOffline = !navigator.onLine;

          if (hasAuthCache && isOffline) {
            console.warn("ネットワーク切断を検知したため、オフライン・キャッシュ認証を適用して動作を継続します。");
            setIsAuthorized(true);
            return;
          }
        }

        router.replace("/login");
      }
    };

    void checkAuth();
  }, [router, pathname]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🚨 検問をクリアするまでは、絶対に AppShell や children を描画しない！
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] animate-pulse">
            Authenticating...
          </p>
        </div>
      </div>
    );
  }

  // 検問クリアで初めて中身を描画
  return <>{children}</>;
}
