// filepath: src/components/liff/LiffHeader.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { 
  ChevronDown, 
  Share2, 
  Sun, 
  Moon, 
  Monitor, 
  ExternalLink, 
  Check, 
  ShieldCheck, 
  User,
  Users,
  Square,
  AppWindow,
  Circle,
  Smartphone,
  Maximize,
  Shrink,
} from "lucide-react";
import { useLiff, type LiffTeamItem } from "./LiffProvider";
import { shareTargetPicker } from "@/lib/liff/liff-client";
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
import { useDensity, type Density } from "@/components/providers/density-provider";
import { cn } from "@/lib/utils";

const THEMES = [
  { id: "blue", color: "#0284c7", label: "Blue" },
  { id: "red", color: "#e11d48", label: "Red" },
  { id: "green", color: "#16a34a", label: "Green" },
  { id: "orange", color: "#ea580c", label: "Orange" },
  { id: "teal", color: "#0d9488", label: "Teal" },
  { id: "purple", color: "#7c3aed", label: "Purple" },
  { id: "indigo", color: "#4338ca", label: "Indigo" },
];

const DESIGNS = [
  { id: "sharp", icon: Square, label: "Sharp" },
  { id: "modern", icon: AppWindow, label: "Modern" },
  { id: "rounded", icon: Circle, label: "Rounded" },
];

const DENSITIES = [
  { id: "ultra", icon: Shrink, label: "Ultra" },
  { id: "compact", icon: Smartphone, label: "Compact" },
  { id: "standard", icon: Monitor, label: "Standard" },
  { id: "comfortable", icon: Maximize, label: "Comfort" },
];

const APPEARANCES = [
  { id: "light", icon: Sun, label: "Light" },
  { id: "dark", icon: Moon, label: "Dark" },
  { id: "system", icon: Monitor, label: "System" },
];

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
  const { profile, isInClient, isLoggedIn, login, teams, currentTeam, selectTeam, isDemo, refreshTeams } = useLiff();
  const { theme, setTheme } = useTheme();
  const { density, setDensity } = useDensity();
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);

  const [activeThemeColor, setActiveThemeColor] = useState<string>("blue");
  const [activeDesign, setActiveDesign] = useState<string>("modern");

  useEffect(() => {
    const savedColor = localStorage.getItem("iscore-color-theme") || "blue";
    const savedDesign = localStorage.getItem("iscore-design-theme") || "modern";

    setActiveThemeColor(savedColor);
    setActiveDesign(savedDesign);

    const root = document.documentElement;

    THEMES.forEach((t) => root.classList.remove(`theme-${t.id}`));
    root.classList.add(`theme-${savedColor}`);

    DESIGNS.forEach((d) => root.classList.remove(`design-${d.id}`));
    root.classList.add(`design-${savedDesign}`);
  }, []);

  const applyColorTheme = (themeId: string) => {
    const root = document.documentElement;
    THEMES.forEach((t) => root.classList.remove(`theme-${t.id}`));
    root.classList.add(`theme-${themeId}`);
    localStorage.setItem("iscore-color-theme", themeId);
    setActiveThemeColor(themeId);
  };

  const applyDesignTheme = (designId: string) => {
    const root = document.documentElement;
    DESIGNS.forEach((d) => root.classList.remove(`design-${d.id}`));
    root.classList.add(`design-${designId}`);
    localStorage.setItem("iscore-design-theme", designId);
    setActiveDesign(designId);
  };

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
    : (currentTeam?.teamName || currentTeam?.shortName || "チームHUB");

  const displayName = profile?.displayName || "メンバー";
  const userInitial = displayName.slice(0, 1).toUpperCase();

  return (
    <header className="sticky top-0 z-40 w-full bg-white dark:bg-black backdrop-blur-xl border-b border-border/40 shadow-xs transition-colors duration-200">
      <div className="flex h-14 sm:h-16 items-center justify-between px-3 sm:px-4 gap-2 sm:gap-3">
        
        {/* 🌟 1. 左側: ロゴ & ブランド (LINEミニアプリ: iScoreMini) */}
        <Link
          href="/liff"
          className="flex items-center gap-2 shrink-0 group outline-hidden"
          title="チームHUBトップへ"
        >
          <img
            src="/logo.webp"
            alt="iScore Logo"
            className="h-8 w-8 sm:h-9 sm:w-9 object-contain group-hover:scale-105 transition-transform duration-300"
          />
          <div className="flex items-center gap-1.5">
            <h1 className="text-base sm:text-xl font-black italic tracking-tighter text-foreground leading-none group-hover:text-primary transition-colors">
              iScore<span className="text-primary">Mini</span>
            </h1>
          </div>
        </Link>

        {/* 🌟 2. 右側: TeamSwitcher & UserProfileMenu */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 justify-end flex-1">
          
          {/* チーム切り替えバッジ (TeamSwitcher) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div
                className={`flex items-center gap-1.5 sm:gap-2 pl-1 pr-2.5 py-1.5 rounded-full backdrop-blur-md border text-foreground shadow-xs hover:opacity-90 transition-all cursor-pointer flex-1 max-w-[190px] min-[400px]:max-w-[220px] sm:max-w-[280px] outline-hidden select-none ${
                  isDemo 
                    ? "bg-amber-500/10 border-amber-500/40 text-amber-950 dark:text-amber-100" 
                    : "bg-primary/10 border-primary/40"
                }`}
                title={`${orgDisplayName} (${teamDisplayName})`}
              >
                <Avatar className="h-7 w-7 border border-primary/30 bg-background shrink-0 overflow-hidden">
                  {currentTeam?.logoImageUrl ? (
                    <img src={currentTeam.logoImageUrl} alt="Team Logo" className="h-full w-full object-contain" />
                  ) : (
                    <AvatarFallback className={`w-full h-full flex items-center justify-center font-black text-[11px] select-none bg-background ${
                      isDemo ? "text-amber-600" : "text-primary"
                    }`}>
                      {orgDisplayName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  )}
                </Avatar>
                <div className="flex flex-col justify-center overflow-hidden min-w-0 flex-1">
                  {/* 1行目: 組織名 / チーム名 */}
                  <span className="text-[11px] sm:text-xs font-black tracking-tight text-foreground truncate leading-tight">
                    {orgDisplayName}
                  </span>
                  {/* 2行目: 編成名 */}
                  <span className={`text-[9px] font-black uppercase truncate leading-none mt-0.5 ${
                    isDemo ? "text-amber-600 dark:text-amber-400 font-black" : "text-muted-foreground font-bold"
                  }`}>
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
                    <Avatar className="h-6 w-6 border border-border shrink-0">
                      {t.logoImageUrl ? (
                        <AvatarImage src={t.logoImageUrl} alt={t.name} />
                      ) : (
                        <AvatarFallback className="text-[9px] font-black">
                          {(t.orgName || t.name || "チーム").slice(0, 2)}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{t.orgName || t.name}</span>
                      <span className="text-[9px] text-muted-foreground font-medium">{t.teamName}</span>
                    </div>
                  </div>
                  {currentTeam?.id === t.id && <Check className="w-4 h-4 text-primary shrink-0" />}
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

          {/* 🌟 ユーザープロフィールメニュー (本家と完全同等のテーマ・UIカスタマイザー搭載) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="relative flex items-center justify-center rounded-full ring-2 ring-primary/30 hover:ring-primary transition-all p-0.5 outline-hidden shrink-0 active:scale-95"
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

            <DropdownMenuContent align="end" className="w-72 sm:w-80 rounded-2xl border-border/50 bg-white/95 dark:bg-background/95 backdrop-blur-xl p-2.5 shadow-2xl space-y-3 max-h-[85vh] overflow-y-auto">
              {/* ユーザー情報ヘッダー */}
              <div className="flex items-center gap-2.5 p-2 rounded-xl bg-muted/50">
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
                    <span className={`w-2 h-2 rounded-full shrink-0 ${isLoggedIn ? "bg-emerald-500" : "bg-amber-500"}`} />
                    <span className="text-[10px] font-bold text-muted-foreground">
                      {isLoggedIn ? "LINEミニアプリ連携中" : "LINE未連携"}
                    </span>
                  </div>
                </div>
              </div>

              {!isLoggedIn && (
                <DropdownMenuItem
                  onClick={login}
                  className="flex items-center gap-2 p-2.5 cursor-pointer font-black text-xs text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl my-1"
                >
                  <User className="w-4 h-4" />
                  <span>LINEでログインして名前を表示</span>
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator className="bg-border/50" />

              {/* 🎨 1. カラーテーマ (Color) */}
              <div>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2 pl-1">
                  Color (アクセントカラー)
                </p>
                <div className="flex items-center justify-between px-1">
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      onClick={(e) => { e.preventDefault(); applyColorTheme(t.id); }}
                      className={cn(
                        "h-6 w-6 rounded-full transition-all hover:scale-125 active:scale-90 relative",
                        activeThemeColor === t.id && "ring-2 ring-offset-2 ring-offset-background ring-primary scale-110"
                      )}
                      style={{ backgroundColor: t.color }}
                      title={t.label}
                    >
                      {activeThemeColor === t.id && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="h-2 w-2 rounded-full bg-white shadow-xs" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* 📐 2. スタイル (Style / 角丸) */}
              <div>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2 pl-1">
                  Style (デザインスタイル)
                </p>
                <div className="flex gap-1.5 px-0.5">
                  {DESIGNS.map((d) => {
                    const Icon = d.icon;
                    const isActive = activeDesign === d.id;
                    return (
                      <button
                        key={d.id}
                        onClick={(e) => { e.preventDefault(); applyDesignTheme(d.id); }}
                        className={cn(
                          "flex-1 flex flex-col items-center justify-center py-2 gap-1 rounded-xl border transition-all active:scale-95",
                          isActive 
                            ? "bg-primary/10 border-primary/40 text-primary font-black shadow-xs" 
                            : "bg-muted/40 border-transparent text-muted-foreground hover:bg-muted hover:text-foreground font-bold"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="text-[10px] leading-tight">{d.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 📏 3. 表示サイズ (Density / 密度) */}
              <div>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2 pl-1">
                  Density (画面サイズ・密度)
                </p>
                <div className="flex gap-1.5 px-0.5">
                  {DENSITIES.map((d) => {
                    const Icon = d.icon;
                    const isActive = density === d.id;
                    return (
                      <button
                        key={d.id}
                        onClick={(e) => { e.preventDefault(); setDensity(d.id as Density); }}
                        className={cn(
                          "flex-1 flex flex-col items-center justify-center py-2 gap-1 rounded-xl border transition-all active:scale-95",
                          isActive 
                            ? "bg-primary/10 border-primary/40 text-primary font-black shadow-xs" 
                            : "bg-muted/40 border-transparent text-muted-foreground hover:bg-muted hover:text-foreground font-bold"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="text-[10px] leading-tight">{d.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 🌓 4. 外観 (Appearance / Light・Dark) */}
              <div>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2 pl-1">
                  Appearance (明暗モード)
                </p>
                <div className="flex gap-1.5 px-0.5">
                  {APPEARANCES.map((a) => {
                    const Icon = a.icon;
                    const isActive = theme === a.id;
                    return (
                      <button
                        key={a.id}
                        onClick={(e) => { e.preventDefault(); setTheme(a.id); }}
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

              <DropdownMenuSeparator className="bg-border/50" />

              {/* LINEシェア */}
              {shareData && (
                <DropdownMenuItem
                  onClick={handleShare}
                  className="flex items-center gap-2 p-2 cursor-pointer font-bold text-xs rounded-xl"
                >
                  <Share2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>LINEでチームに共有</span>
                </DropdownMenuItem>
              )}

              {/* Web版 iScoreCloud を開く */}
              <DropdownMenuItem
                onClick={() => window.open("/dashboard", "_blank")}
                className="flex items-center gap-2 p-2 cursor-pointer font-bold text-xs text-primary rounded-xl"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Web版 iScoreCloud を開く</span>
              </DropdownMenuItem>
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
