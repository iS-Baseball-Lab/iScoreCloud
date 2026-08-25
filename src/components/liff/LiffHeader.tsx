// filepath: src/components/liff/LiffHeader.tsx
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme } from "next-themes";
import { 
  ChevronLeft, 
  ChevronDown, 
  Share2, 
  Sun, 
  Moon, 
  Monitor, 
  ExternalLink, 
  Check, 
  ShieldCheck, 
  User,
  Users
} from "lucide-react";
import { useLiff } from "./LiffProvider";
import { shareTargetPicker } from "@/lib/liff/liff-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TeamItem {
  id: string;
  name: string;
  orgName?: string;
  roleLabel?: string;
  logoImageUrl?: string;
}

interface LiffHeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  teams?: TeamItem[];
  currentTeamId?: string;
  onSelectTeam?: (teamId: string) => void;
  shareData?: {
    title: string;
    text: string;
    url?: string;
  };
}

export function LiffHeader({
  title = "チーム",
  subtitle = "チームHUB",
  showBack = false,
  teams = [],
  currentTeamId,
  onSelectTeam,
  shareData,
}: LiffHeaderProps) {
  const router = useRouter();
  const { profile, isInClient } = useLiff();
  const { theme, setTheme } = useTheme();

  const handleShare = async () => {
    if (!shareData) return;

    if (isInClient) {
      const messages = [
        {
          type: "text",
          text: `⚾ ${shareData.title}\n${shareData.text}${shareData.url ? `\n\n👉 試合動画・予定の確認はこちら:\n${shareData.url}` : ""}`,
        },
      ];
      const shared = await shareTargetPicker(messages);
      if (shared) return;
    }

    // Web Share API フォールバック
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

  const displayName = profile?.displayName || "メンバー";
  const userInitial = displayName.slice(0, 1).toUpperCase();

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 dark:bg-background/90 backdrop-blur-xl border-b border-border/40 transition-colors duration-200">
      <div className="flex h-14 sm:h-16 items-center justify-between px-3 sm:px-6 gap-2">
        
        {/* 🌟 1. 左側: ロゴ & ブランド (本家と完全同一) */}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          {showBack && (
            <button
              type="button"
              onClick={() => router.back()}
              className="p-1.5 -ml-1 rounded-xl bg-card border border-border text-foreground hover:bg-muted active:scale-95 transition-all shadow-xs"
              aria-label="戻る"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          <Link
            href="/liff"
            className="flex items-center gap-2 shrink-0 group outline-hidden"
            title="チームHUBトップ"
          >
            <img
              src="/logo.webp"
              alt="iScore Logo"
              className="h-8 w-8 sm:h-9 sm:w-9 object-contain group-hover:scale-105 transition-transform duration-300"
            />
            <div className="flex items-center gap-1.5">
              <span className="text-base sm:text-xl font-black italic tracking-tighter text-foreground leading-none group-hover:text-primary transition-colors">
                iScore<span className="text-primary">Cloud</span>
              </span>
            </div>
          </Link>
        </div>

        {/* 🌟 2. 右側: TeamSwitcher & UserProfileMenu (本家と完全同一の構成) */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 justify-end flex-1">
          
          {/* チーム表示 & 切り替えバッジ (TeamSwitcher) */}
          {teams.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full bg-primary/10 backdrop-blur-md border border-primary/40 text-foreground shadow-xs hover:bg-primary/20 transition-all cursor-pointer min-w-0 max-w-[150px] sm:max-w-[200px] outline-hidden text-left"
                >
                  <Avatar className="h-6 w-6 border border-primary/30 bg-background shrink-0 overflow-hidden">
                    <AvatarFallback className="w-full h-full flex items-center justify-center text-primary font-black text-[10px] select-none bg-background">
                      {(title || "T").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col justify-center overflow-hidden min-w-0 flex-1">
                    <span className="text-[11px] sm:text-xs font-black tracking-tight text-foreground truncate leading-tight">
                      {title}
                    </span>
                    <span className="text-[8px] font-bold text-muted-foreground uppercase truncate leading-none mt-0.5">
                      {subtitle}
                    </span>
                  </div>
                  <ChevronDown className="h-3 w-3 text-primary/80 shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-1.5">
                <DropdownMenuLabel className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1">
                  所属チーム切り替え
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {teams.map((t) => (
                  <DropdownMenuItem
                    key={t.id}
                    onClick={() => onSelectTeam?.(t.id)}
                    className="flex items-center justify-between p-2 cursor-pointer font-bold text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Avatar className="h-5 w-5 border border-border">
                        <AvatarFallback className="text-[9px] font-black">
                          {t.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">{t.name}</span>
                    </div>
                    {t.id === currentTeamId && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div
              className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-primary/10 backdrop-blur-md border border-primary/40 text-foreground shadow-xs min-w-0 max-w-[150px] sm:max-w-[200px]"
              title={title}
            >
              <Avatar className="h-6 w-6 border border-primary/30 bg-background shrink-0 overflow-hidden">
                <AvatarFallback className="w-full h-full flex items-center justify-center text-primary font-black text-[10px] select-none bg-background">
                  {(title || "T").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col justify-center overflow-hidden min-w-0 flex-1">
                <span className="text-[11px] sm:text-xs font-black tracking-tight text-foreground truncate leading-tight">
                  {title}
                </span>
                <span className="text-[8px] font-bold text-muted-foreground uppercase truncate leading-none mt-0.5">
                  {subtitle}
                </span>
              </div>
            </div>
          )}

          {/* ユーザープロフィールメニュー (UserProfileMenu) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="relative flex items-center justify-center rounded-full ring-2 ring-primary/30 hover:ring-primary transition-all p-0.5 outline-hidden"
                aria-label="ユーザーメニュー"
              >
                <Avatar className="h-7 w-7 sm:h-8 sm:w-8 border border-border">
                  {profile?.pictureUrl && (
                    <AvatarImage src={profile.pictureUrl} alt={displayName} />
                  )}
                  <AvatarFallback className="bg-primary/20 text-primary font-black text-xs">
                    {userInitial}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-60 p-2 space-y-1">
              {/* ユーザー情報ヘッダー */}
              <div className="flex items-center gap-2.5 p-2 rounded-xl bg-muted/50">
                <Avatar className="h-9 w-9 border border-border">
                  {profile?.pictureUrl && (
                    <AvatarImage src={profile.pictureUrl} alt={displayName} />
                  )}
                  <AvatarFallback className="bg-primary text-primary-foreground font-black text-sm">
                    {userInitial}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs font-black text-foreground truncate">
                    {displayName}
                  </span>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    <span className="text-[10px] font-bold text-muted-foreground">
                      LINEミニアプリ連携中
                    </span>
                  </div>
                </div>
              </div>

              <DropdownMenuSeparator />

              {/* テーマ切り替え */}
              <DropdownMenuLabel className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1">
                外観モード
              </DropdownMenuLabel>
              <div className="grid grid-cols-3 gap-1 px-1 py-1">
                <button
                  type="button"
                  onClick={() => setTheme("light")}
                  className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    theme === "light"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-card border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Sun className="w-3 h-3" />
                  <span>Light</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTheme("dark")}
                  className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    theme === "dark"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-card border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Moon className="w-3 h-3" />
                  <span>Dark</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTheme("system")}
                  className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    theme === "system"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-card border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Monitor className="w-3 h-3" />
                  <span>Auto</span>
                </button>
              </div>

              <DropdownMenuSeparator />

              {/* LINEシェア */}
              {shareData && (
                <DropdownMenuItem
                  onClick={handleShare}
                  className="flex items-center gap-2 p-2 cursor-pointer font-bold text-xs"
                >
                  <Share2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>LINEでチームに共有</span>
                </DropdownMenuItem>
              )}

              {/* Web版 iScoreCloud を開く */}
              <DropdownMenuItem
                onClick={() => window.open("/dashboard", "_blank")}
                className="flex items-center gap-2 p-2 cursor-pointer font-bold text-xs text-primary"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Web版 iScoreCloud を開く</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 🌟 iScoreCloud シグネチャーのグラデーションライン (本家と完全同一) */}
      <div className="h-[1px] sm:h-[1.5px] w-full bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
    </header>
  );
}
