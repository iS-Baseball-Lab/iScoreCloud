// filepath: src/components/layout/header.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Zap, Crown } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { UserSession, UserTeamMembership } from "@/types/auth"; // 💡 必要に応じて型をインポート
import { TeamSwitcher } from "@/components/layout/team-switcher";
import { UserProfileMenu } from "@/components/layout/user-profile-menu";
import { useTeam } from "@/contexts/TeamContext";

interface AuthResponse {
  success: boolean;
  data: UserSession;
}

// 💡 TeamSwitcher が期待する Membership 型の定義（もし他で定義されていればそちらを参照）
interface Membership extends UserTeamMembership {
  organizationName: string;
  role: string;
  status: string;
}

export function Header() {
  const router = useRouter();
  const { currentTeam, selectTeam } = useTeam();
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache"
          }
        });

        if (!response.ok) throw new Error("Failed to fetch user");
        const json = await response.json() as AuthResponse;

        if (json.success) {
          setUser(json.data);

          // 💡 初期ロード時に Context が空なら、ユーザーの優先チームをセット
          if (!currentTeam && json.data.memberships && json.data.memberships.length > 0) {
            const mainTeam = json.data.memberships.find(m => m.isMainTeam) || json.data.memberships[0];
            selectTeam({ id: mainTeam.teamId, name: mainTeam.teamName, organizationCategory: mainTeam.organizationCategory });
          }
        }
      } catch (error) {
        console.error("User fetch error:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchUser();
  }, [currentTeam, selectTeam]);

  const handleLogout = async () => router.push("/login");

  const handleTeamSwitch = (teamId: string, orgId?: string) => {
    const target = user?.memberships?.find(m => m.teamId === teamId);
    if (target) {
      selectTeam({ id: target.teamId, name: target.teamName, organizationCategory: target.organizationCategory });
    }
    if (orgId) localStorage.setItem("iscore_selectedOrgId", orgId);

    // 💡 チーム切り替え時は状態をリセットするためリロードを伴う遷移
    window.location.href = "/dashboard";
  };

  // 🌟 型の不整合を解消するマッピングロジック
  // API の UserTeamMembership を TeamSwitcher の Membership 型に変換
  const membershipsForSwitcher: Membership[] = (user?.memberships || []).map(m => ({
    ...m,
    organizationName: (m as any).organizationName || "個人チーム", // 💡 プロパティがない場合はデフォルト値を補完
    role: (m as any).role || "MEMBER",
    status: (m as any).status || "active",
  }));

  // 🌟 変換後のリストからアクティブなチームを抽出
  const activeTeam = membershipsForSwitcher.find(m => m.teamId === currentTeam?.id)
    || membershipsForSwitcher[0];

  const isAdmin = user?.systemRole === 'SYSTEM_ADMIN';

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 dark:bg-background/60 backdrop-blur-xl border-b border-border/40 transition-colors duration-200">
      <div className="flex h-16 sm:h-20 items-center justify-between px-3 sm:px-8">

        {/* 🌟 ロゴ & タイトル */}
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 sm:gap-4 shrink-0 group outline-none"
          title="ダッシュボードへ戻る"
        >
          <img
            src="/logo.webp"
            alt="iScore Logo"
            className="h-10 w-10 sm:h-12 sm:w-12 object-contain group-hover:scale-105 transition-transform duration-300"
          />
          <div className="flex flex-col justify-center">
            <h1 className="text-xl sm:text-3xl font-black italic tracking-tighter text-foreground leading-none group-hover:text-primary transition-colors duration-300">
              iScore<span className="text-primary">Cloud</span>
            </h1>
          </div>
        </Link>

        {/* 右側: ツールエリア */}
        <div className="flex items-center gap-2 sm:gap-3 pl-2 w-full justify-end">

          {isAdmin && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 shadow-sm">
              <Avatar className="h-6 w-6 sm:h-7 sm:w-7 border border-amber-500/30 bg-amber-500/20 flex items-center justify-center">
                <Crown className="h-3 w-3 sm:h-4 sm:w-4" />
              </Avatar>
              <div className="flex flex-col justify-center">
                <span className="text-[8px] sm:text-[10px] font-black tracking-widest uppercase leading-tight">SYS ADMIN</span>
              </div>
            </div>
          )}

          {/* 🌟 変換済みの memberships と activeTeam を渡す */}
          <TeamSwitcher
            activeTeam={activeTeam}
            memberships={membershipsForSwitcher}
            onTeamSwitch={handleTeamSwitch}
          />

          <UserProfileMenu
            user={user}
            isLoading={isLoading}
            onLogout={handleLogout}
          />
        </div>
      </div>
      <div className="h-[1px] sm:h-[2px] w-full bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
    </header>
  );
}