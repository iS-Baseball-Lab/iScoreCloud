// filepath: src/components/liff/LiffHeader.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
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
  } = useLiff();
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
          text: `⚾ ${shareData.title}\n${shareData.text}${
            shareData.url ? `\n\n👉 試合動画・予定の確認はこちら:\n${shareData.url}` : ""
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

  return (
    <header className="sticky top-0 z-40 w-full bg-white dark:bg-black backdrop-blur-xl border-b border-border/40 shadow-xs transition-colors duration-200">
      <div className="flex h-14 sm:h-16 items-center justify-between px-3 sm:px-4 gap-2 sm:gap-3">
        {/* 🌟 1. 左側: ロゴ & ブランド (iScore for LINEミニアプリ) */}
        <Link
          href="/liff"
          className="flex items-center gap-2 shrink-0 group outline-hidden"
          title="チームHUBトップへ"
        >
          <img
            src="/liff-logo.webp"
            alt="iScore Logo"
            className="h-9 w-9 sm:h-9.5 sm:w-9.5 rounded-[22%] shadow-xs object-contain group-hover:scale-105 transition-transform duration-300"
          />
          <div className="flex flex-col justify-center">
            <h1 className="text-base sm:text-lg font-black italic tracking-tighter text-foreground leading-none group-hover:text-primary transition-colors">
              iScore
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
                className={`flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full backdrop-blur-md border text-foreground shadow-xs hover:opacity-90 transition-all cursor-pointer flex-1 max-w-[200px] min-[400px]:max-w-[230px] sm:max-w-[290px] outline-hidden select-none ${
                  isDemo
                    ? "bg-amber-500/10 border-amber-500/40 text-amber-950 dark:text-amber-100"
                    : "bg-primary/10 border-primary/40"
                }`}
                title={`${orgDisplayName} (${teamDisplayName})`}
              >
                <Avatar className="h-8 w-8 sm:h-8.5 sm:w-8.5 border border-primary/30 bg-background shrink-0 overflow-hidden">
                  {currentTeam?.logoImageUrl ? (
                    <img
                      src={currentTeam.logoImageUrl}
                      alt="Team Logo"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <AvatarFallback
                      className={`w-full h-full flex items-center justify-center font-black text-xs select-none bg-background ${
                        isDemo ? "text-amber-600" : "text-primary"
                      }`}
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
                    className={`text-[9.5px] font-black uppercase truncate leading-none mt-0.5 ${
                      isDemo
                        ? "text-amber-600 dark:text-amber-400 font-black"
                        : "text-muted-foreground font-bold"
                    }`}
                  >
                    {teamDisplayName}
                  </span>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-primary/80 shrink-0 ml-0.5" />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 p-1.5 space-y-1">
              <DropdownMenuLabel className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1">
                チーム切り替え
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {teams.map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  onClick={() => selectTeam(t.id)}
                  className={`flex items-center justify-between p-2 cursor-pointer rounded-xl font-black text-xs ${
                    currentTeam?.id === t.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar className="h-7 w-7 border border-border shrink-0">
                      {t.logoImageUrl ? (
                        <AvatarImage src={t.logoImageUrl} alt={t.name} />
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
              className="w-68 sm:w-72 rounded-2xl border-border/60 bg-card p-2.5 shadow-2xl space-y-2"
            >
              {/* ユーザー情報ヘッダー */}
              <div className="flex items-center gap-2.5 p-2 rounded-xl bg-muted/60">
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
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isLoggedIn ? "bg-emerald-500" : "bg-amber-500"
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
                  className="flex items-center gap-2 p-2.5 cursor-pointer font-black text-xs text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl"
                >
                  <User className="w-4 h-4" />
                  <span>LINEでログインして名前を表示</span>
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator className="bg-border/60" />

              {/* 👤 プロフィール & ⚙️ アプリ設定へのダイレクトリンク */}
              <div className="space-y-1">
                <DropdownMenuItem asChild>
                  <Link
                    href="/liff/profile"
                    className="flex items-center justify-between p-2 cursor-pointer rounded-xl hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-8 h-8 rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
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
                      <span className="w-8 h-8 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
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
                      <span className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                        <Settings className="w-4 h-4" />
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-black text-foreground">アプリ設定</span>
                        <span className="text-[10px] font-bold text-muted-foreground truncate">
                          カラー・デザイン・表示サイズ
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </Link>
                </DropdownMenuItem>
              </div>

              <DropdownMenuSeparator className="bg-border/60" />

              {/* 🌓 外観モード (クイック切替) */}
              <div className="pt-0.5">
                <p className="text-[10px] font-black text-muted-foreground mb-1.5 pl-1">
                  外観モード
                </p>
                <div className="flex gap-1.5">
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
                          "flex-1 flex flex-col items-center justify-center py-2 gap-1 rounded-xl border transition-all active:scale-95",
                          isActive
                            ? "bg-primary/10 border-primary/40 text-primary font-black shadow-xs"
                            : "bg-muted/40 border-transparent text-muted-foreground hover:bg-muted hover:text-foreground font-bold"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="text-[10px] leading-tight">{a.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* LINEシェア */}
              {shareData && (
                <>
                  <DropdownMenuSeparator className="bg-border/60" />
                  <DropdownMenuItem
                    onClick={handleShare}
                    className="flex items-center gap-2 p-2 cursor-pointer font-bold text-xs rounded-xl"
                  >
                    <Share2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>LINEでチームに共有</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 🌟 iScore シグネチャーのグラデーションライン */}
      <div className="h-[1px] sm:h-[1.5px] w-full bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      {/* チーム参加申請モーダル */}
      <JoinTeamModal
        isOpen={isJoinModalOpen}
        onClose={() => setIsJoinModalOpen(false)}
        onSuccess={() => {
          setIsJoinModalOpen(false);
          refreshTeams();
        }}
      />
    </header>
  );
}
