// filepath: src/components/layout/user-profile-menu.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
// 🌟 修正: ultra用に「縮小」を意味する Shrink アイコンを追加
import { BellRing, LogOut, Settings, Sun, Moon, Monitor, Square, AppWindow, Circle, Smartphone, Maximize, Shrink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserSession } from "@/types/auth";
import { useDensity } from "@/components/providers/density-provider";
import type { Density } from "@/components/providers/density-provider";

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

const APPEARANCES = [
  { id: "light", icon: Sun, label: "Light" },
  { id: "dark", icon: Moon, label: "Dark" },
  { id: "system", icon: Monitor, label: "System" },
];

// 🌟 修正: ultraを追加し、サイズが小さい順（高密度順）に並び替えて直感的な動線に
const DENSITIES = [
  { id: "ultra", icon: Shrink, label: "Ultra" },
  { id: "compact", icon: Smartphone, label: "Compact" },
  { id: "standard", icon: Monitor, label: "Standard" },
  { id: "comfortable", icon: Maximize, label: "Comfort" },
];

interface UserProfileMenuProps {
  user: UserSession | null;
  isLoading: boolean;
  onLogout: () => void;
}

export function UserProfileMenu({ user, isLoading, onLogout }: UserProfileMenuProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { density, setDensity } = useDensity();

  const [activeThemeColor, setActiveThemeColor] = useState<string>("blue");
  const [activeDesign, setActiveDesign] = useState<string>("modern");

  const unreadNotificationsCount = 3;

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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative flex items-center justify-center rounded-full outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:focus:ring-offset-background transition-transform active:scale-95 group">
          <Avatar className="h-10 w-10 sm:h-11 sm:w-11 border-2 border-border/50 shadow-sm group-hover:border-primary/50 transition-colors bg-background">
            {!isLoading && user ? (
              <><AvatarImage src={user.avatarUrl || ""} alt={user.name || "User"} className="object-cover" /><AvatarFallback className="bg-primary/10 text-primary font-black text-xs sm:text-sm">{(user.name || "U").slice(0, 2).toUpperCase()}</AvatarFallback></>
            ) : <AvatarFallback className="bg-muted text-muted-foreground font-bold">?</AvatarFallback>}
          </Avatar>
          {unreadNotificationsCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-red-500 border-[2.5px] border-white dark:border-background shadow-sm animate-pulse" />
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72 sm:w-80 rounded-2xl border-border/50 bg-white/95 dark:bg-background/95 backdrop-blur-xl p-2 shadow-2xl">
        {user && (
          <>
            <DropdownMenuLabel className="font-normal p-3">
              <div className="flex flex-col space-y-1">
                <p className="text-lg sm:text-base font-black leading-none">{user.name}</p>
                <p className="text-sm sm:text-xs leading-none text-muted-foreground mt-1.5">{user.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-border/50" />
          </>
        )}

        <div className="p-1 space-y-1">
          <DropdownMenuItem className="cursor-pointer flex items-center justify-between rounded-xl p-3 text-sm hover:bg-muted/80 transition-colors" onClick={() => console.log('通知画面へ')}>
            <div className="flex items-center gap-3">
              <div className="relative">
                <BellRing className="h-5 w-5 text-muted-foreground" />
                {unreadNotificationsCount > 0 && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 border-2 border-background" />}
              </div>
              <span className="font-bold text-base sm:text-sm">お知らせ</span>
            </div>
            {unreadNotificationsCount > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm">{unreadNotificationsCount}件</span>
            )}
          </DropdownMenuItem>

          <DropdownMenuItem className="cursor-pointer gap-3 rounded-xl p-3 text-sm hover:bg-muted/80 transition-colors" onClick={() => router.push("/profile")}>
            <Settings className="h-5 w-5 text-muted-foreground" />
            <span className="font-bold text-base sm:text-sm">アカウント設定</span>
          </DropdownMenuItem>
        </div>

        <DropdownMenuSeparator className="bg-border/50 my-1" />

        {/* テーマ・UI設定エリア */}
        <div className="px-2 py-3 space-y-6">

          {/* 🎨 カラーテーマ */}
          <div>
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 pl-1">Color</p>
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
                      <div className="h-2 w-2 rounded-full bg-white shadow-sm" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 📐 デザイン(角丸)テーマ */}
          <div>
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 pl-1">Style</p>
            <div className="flex gap-2 px-1">
              {DESIGNS.map((d) => {
                const Icon = d.icon;
                const isActive = activeDesign === d.id;
                return (
                  <button
                    key={d.id}
                    onClick={(e) => { e.preventDefault(); applyDesignTheme(d.id); }}
                    className={cn(
                      "flex-1 flex flex-col items-center justify-center py-2.5 gap-1.5 rounded-xl border transition-all active:scale-95",
                      isActive ? "bg-primary/10 border-primary/30 text-primary shadow-sm" : "bg-muted/40 border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-[10px] font-bold">{d.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 📏 表示サイズ (Density) テーマ */}
          <div>
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 pl-1">Density</p>
            <div className="flex gap-2 px-1">
              {DENSITIES.map((d) => {
                const Icon = d.icon;
                const isActive = density === d.id;
                return (
                  <button
                    key={d.id}
                    // 安全・確実: Asキャストを用いて厳格にDensity型としてハンドリング
                    onClick={(e) => { e.preventDefault(); setDensity(d.id as Density); }}
                    className={cn(
                      "flex-1 flex flex-col items-center justify-center py-2.5 gap-1.5 rounded-xl border transition-all active:scale-95",
                      isActive ? "bg-primary/10 border-primary/30 text-primary shadow-sm" : "bg-muted/40 border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-[10px] font-bold">{d.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 🌓 明暗（Light/Dark）モード */}
          <div>
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 pl-1">Appearance</p>
            <div className="flex gap-2 px-1">
              {APPEARANCES.map((a) => {
                const Icon = a.icon;
                const isActive = theme === a.id;
                return (
                  <button
                    key={a.id}
                    onClick={(e) => { e.preventDefault(); setTheme(a.id); }}
                    className={cn(
                      "flex-1 flex flex-col items-center justify-center py-2.5 gap-1.5 rounded-xl border transition-all active:scale-95",
                      isActive ? "bg-primary/10 border-primary/30 text-primary shadow-sm" : "bg-muted/40 border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-[10px] font-bold">{a.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        <DropdownMenuSeparator className="bg-border/50 my-1" />

        <div className="p-1">
          <DropdownMenuItem className="cursor-pointer gap-3 text-red-500 focus:text-red-500 rounded-xl p-3 text-sm hover:bg-red-500/10 transition-colors" onClick={onLogout}>
            <LogOut className="h-5 w-5" />
            <span className="font-bold text-base sm:text-sm">ログアウト</span>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
