// filepath: src/components/liff/LiffHeader.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ChevronDown,
  ChevronRight,
  Share2,
  Sun,
  Moon,
  Monitor,
  Check,
  User,
  Users,
  UserCircle,
  Settings,
  BookOpen,
} from "lucide-react";
import { useLiff } from "./LiffProvider";
import { shareTargetPicker } from "@/lib/liff/liff-client";
import {
  handleLiffRootLinkClick,
  navigateToLiffRoot,
} from "@/lib/liff/navigation";
import {
  LIFF_THEME_CHANGE_EVENT,
  syncLiffThemeClasses,
} from "@/lib/liff/theme-settings";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { JoinTeamModal } from "./JoinTeamModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const APPEARANCES = [
  { id: "light", icon: Sun, label: "ライト" },
  { id: "dark", icon: Moon, label: "ダーク" },
  { id: "system", icon: Monitor, label: "端末連動" },
] as const;

interface LiffHeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  shareData?: {
    title: string;
    text: string;
    url?: string;
  };
}

export function LiffHeader({ shareData }: LiffHeaderProps) {
  const {
    profile,
    isInClient,
    isLoggedIn,
    login,
    teams,
    currentTeam,
    selectTeam,
    isDemo,
    refreshTeams,
    clearPendingJoinCode,
  } = useLiff();
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);

  // 保存されているアクセントカラー & デザインスタイルを全LIFF画面で自動復元
  useEffect(() => {
    syncLiffThemeClasses();
    const handleSync = () => {
      syncLiffThemeClasses();
    };
    window.addEventListener(LIFF_THEME_CHANGE_EVENT, handleSync);
    return () => window.removeEventListener(LIFF_THEME_CHANGE_EVENT, handleSync);
  }, []);

  const handleShare = async () => {
    if (!shareData) return;

    if (isInClient) {
      const messages = [
        {
          type: "text",
          text: `⚾ ${shareData.title}\n${shareData.text}${shareData.url ? `\n\n👉 試合動画・予定の確認はこちら:\n${shareData.url}` : ""
            }`,
        },
      ];
      const shared = await shareTargetPicker(messages);
      if (shared) return;
    }

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: shareData.title,
          text: shareData.text,
          url: shareData.url || (typeof window !== "undefined" ? window.location.href : ""),
        });
      } catch {
        // ignore share cancellation
      }
    }
  };

  const orgDisplayName = currentTeam?.orgName || currentTeam?.name || "チーム";
  const teamDisplayName = isDemo
    ? "🌟 体験デモチーム"
    : currentTeam?.teamName || currentTeam?.shortName || "チームHUB";

  const displayName = profile?.displayName || "メンバー";
  const userInitial = displayName.slice(0, 1).toUpperCase();
  const visibleTeams = teams.filter(
    (t) => Boolean(t.id === "demo-team" || t.isDemo || t.isMember)
  );

  return (
    <header className="sticky top-0 z-40 w-full bg-card border-b border-border shadow-xs transition-colors duration-200">
      <div className="flex h-14 sm:h-16 items-center justify-between px-3 sm:px-4 gap-2 sm:gap-3">
        {/* 🌟 1. 左側: ロゴ & ブランド (iScoreCloud for LINEミニアプリ) */}
        <Link
          href="/liff"
          onClick={(e) => handleLiffRootLinkClick(e, router, pathname)}
          className="flex items-center gap-2 shrink-0 group outline-hidden"
          title="チームHUBトップへ"
        >
          <img
            src="/liff-logo.webp"
            alt="iScoreCloud Logo"
            className="h-9 w-9 sm:h-9.5 sm:w-9.5 rounded-[22%] shadow-xs object-contain group-hover:scale-105 transition-transform duration-300"
          />
          <div className="flex flex-col justify-center">
            <h1 className="text-[15px] sm:text-lg font-black italic tracking-tighter text-foreground leading-none group-hover:text-primary transition-colors">
              iScore<span className="text-primary">Cloud</span>
            </h1>
            <span className="text-[9px] sm:text-[9.5px] font-bold text-muted-foreground tracking-tight leading-none mt-0.5 select-none">
              for LINEミニアプリ
            </span>
          </div>
        </Link>

        {/* 🌟 2. 右側: TeamSwitcher & UserProfileMenu */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 justify-end flex-1">
          {/* チーム切り替えバッジ (TeamSwitcher) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div
                className={`flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full border text-foreground shadow-xs hover:opacity-90 transition-all cursor-pointer flex-1 min-w-0 max-w-[190px] min-[400px]:max-w-[225px] sm:max-w-[285px] outline-hidden select-none ${isDemo
                    ? "bg-amber-50 dark:bg-slate-900 border-amber-500"
                    : "bg-muted border-border"
                  }`}
                title={`${orgDisplayName} (${teamDisplayName})`}
              >
                <Avatar className="h-8 w-8 sm:h-8.5 sm:w-8.5 border border-border bg-card shrink-0 overflow-hidden">
                  {currentTeam?.logoImageUrl ? (
                    <img
                      src={currentTeam.logoImageUrl}
                      alt="Team Logo"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <AvatarFallback
                      className="w-full h-full flex items-center justify-center font-black text-xs select-none bg-card text-primary"
                    >
                      {orgDisplayName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  )}
                </Avatar>
                <div className="flex flex-col justify-center overflow-hidden min-w-0 flex-1">
                  <span className="text-[11.5px] sm:text-xs font-black tracking-tight text-foreground truncate leading-tight">
                    {orgDisplayName}
                  </span>
                  <span
                    className={`text-[9.5px] font-black uppercase truncate leading-none mt-0.5 ${isDemo
                        ? "text-amber-600 dark:text-amber-400 font-black"
                        : "text-muted-foreground font-bold"
                      }`}
                  >
                    {teamDisplayName}
                  </span>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-primary shrink-0 ml-0.5" />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 rounded-2xl border border-border bg-card p-1.5 shadow-xl space-y-1">
              <DropdownMenuLabel className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1">
                チーム切り替え
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {visibleTeams.map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  onClick={() => {
                    const isTeamChanged = currentTeam?.id !== t.id;
                    selectTeam(t.id);
                    if (isTeamChanged) {
                      navigateToLiffRoot(router, pathname);
                    }
                  }}
                  className={`flex items-center justify-between p-2 cursor-pointer rounded-xl font-black text-xs ${currentTeam?.id === t.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
                    }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar className="h-7 w-7 border border-border bg-card shrink-0 overflow-hidden">
                      {t.logoImageUrl ? (
                        <img
                          src={t.logoImageUrl}
                          alt={t.name}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <AvatarFallback className="text-[10px] font-black">
                          {(t.orgName || t.name || "チーム").slice(0, 2)}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{t.orgName || t.name}</span>
                      <span className="text-[9px] text-muted-foreground font-medium">
                        {t.teamName}
                      </span>
                    </div>
                  </div>
                  {currentTeam?.id === t.id && (
                    <Check className="w-4 h-4 text-primary shrink-0" />
                  )}
                </DropdownMenuItem>
              ))}

              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setIsJoinModalOpen(true)}
                className="flex items-center gap-2 p-2 cursor-pointer font-black text-xs text-primary hover:bg-primary/10 rounded-xl"
              >
                <Users className="w-4 h-4" />
                <span>招待コードでチームに参加</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 🌟 ユーザープロフィールメニュー（スリム化版） */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="relative flex items-center justify-center rounded-full ring-2 ring-primary/40 hover:ring-primary transition-all p-0 outline-hidden shrink-0 active:scale-95 shadow-xs"
                aria-label="ユーザーメニュー"
              >
                <Avatar className="h-9 w-9 sm:h-9.5 sm:w-9.5 border-0">
                  {profile?.pictureUrl && (
                    <AvatarImage src={profile.pictureUrl} alt={displayName} />
                  )}
                  <AvatarFallback className="bg-primary/20 text-primary font-black text-sm">
                    {userInitial}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              className="w-68 sm:w-72 rounded-2xl border border-border bg-card p-2.5 shadow-2xl space-y-2"
            >
              {/* ユーザー情報ヘッダー */}
              <div className="flex items-center gap-2.5 p-2 rounded-xl bg-muted border border-border">
                <Avatar className="h-10 w-10 border border-border">
                  {profile?.pictureUrl && (
                    <AvatarImage src={profile.pictureUrl} alt={displayName} />
                  )}
                  <AvatarFallback className="bg-primary text-primary-foreground font-black text-sm">
                    {userInitial}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs sm:text-sm font-black text-foreground truncate">
                    {displayName}
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${isLoggedIn ? "bg-[#06C755]" : "bg-amber-500"
                        }`}
                    />
                    <span className="text-[10px] font-bold text-muted-foreground">
                      {isLoggedIn ? "LINEミニアプリ連携中" : "LINE未連携"}
                    </span>
                  </div>
                </div>
              </div>

              {!isLoggedIn && (
                <DropdownMenuItem
                  onClick={login}
                  className="flex items-center gap-2 p-2.5 cursor-pointer font-black text-xs text-white bg-[#06C755] hover:bg-[#05b34c] focus:bg-[#05b34c] focus:text-white rounded-xl"
                >
                  <User className="w-4 h-4" />
                  <span>LINEでログインして名前を表示</span>
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator className="bg-border" />

              {/* 👤 プロフィール & ⚙️ アプリ設定へのダイレクトリンク */}
              <div className="space-y-1">
                <DropdownMenuItem asChild>
                  <Link
                    href="/liff/profile"
                    className="flex items-center justify-between p-2 cursor-pointer rounded-xl hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-8 h-8 rounded-lg bg-slate-500/12 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
                        <UserCircle className="w-4.5 h-4.5" />
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-black text-foreground">プロフィール</span>
                        <span className="text-[10px] font-bold text-muted-foreground truncate">
                          表示名・お子様・マイカー設定
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <Link
                    href="/liff/settings/score"
                    className="flex items-center justify-between p-2 cursor-pointer rounded-xl hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-8 h-8 rounded-lg bg-slate-500/12 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
                        <BookOpen className="w-4 h-4" />
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-black text-foreground">スコア設定</span>
                        <span className="text-[10px] font-bold text-muted-foreground truncate">
                          記号早見表の登録・AI読取設定
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <Link
                    href="/liff/settings"
                    className="flex items-center justify-between p-2 cursor-pointer rounded-xl hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-8 h-8 rounded-lg bg-slate-500/12 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
                        <Settings className="w-4 h-4" />
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-black text-foreground">アプリ設定</span>
                        <span className="text-[10px] font-bold text-muted-foreground truncate">
                          クイックメニュー・カラー・表示設定
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </Link>
                </DropdownMenuItem>
              </div>

              <DropdownMenuSeparator className="bg-border" />

              {/* 🌓 外観モード (クイック切替) */}
              <div className="pt-0.5">
                <p className="text-[10px] font-black text-muted-foreground mb-1.5 pl-1">
                  外観モード
                </p>
                <div className="flex gap-1 p-1 rounded-2xl bg-muted border border-border">
                  {APPEARANCES.map((a) => {
                    const Icon = a.icon;
                    const isActive = theme === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setTheme(a.id);
                        }}
                        className={cn(
                          "flex-1 flex flex-col items-center justify-center py-1.5 gap-1 rounded-xl border transition-all active:scale-95",
                          isActive
                            ? "bg-card border-border text-foreground font-black shadow-xs"
                            : "border-transparent text-muted-foreground hover:text-foreground font-bold"
                        )}
                      >
                        <Icon className={cn("h-4 w-4", isActive && "text-primary")} />
                        <span className="text-[10px] leading-tight">{a.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* LINEシェア */}
              {shareData && (
                <>
                  <DropdownMenuSeparator className="bg-border" />
                  <DropdownMenuItem
                    onClick={handleShare}
                    className="flex items-center gap-2 p-2 cursor-pointer font-bold text-xs rounded-xl"
                  >
                    <Share2 className="w-4 h-4 text-[#06C755]" />
                    <span>LINEでチームに共有</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 🌟 iScore シグネチャーのソリッドテーマライン */}
      <div className="h-[2px] w-full bg-primary" />

      {/* チーム参加申請モーダル */}
      <JoinTeamModal
        isOpen={isJoinModalOpen}
        onClose={() => {
          clearPendingJoinCode();
          setIsJoinModalOpen(false);
        }}
        onSuccess={({ status }) => {
          clearPendingJoinCode();
          void refreshTeams();
          if (status === "active") {
            setIsJoinModalOpen(false);
            navigateToLiffRoot(router, pathname);
          }
        }}
      />
    </header>
  );
}
