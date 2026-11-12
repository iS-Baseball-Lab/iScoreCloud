// src/components/layout/theme-switcher.tsx
"use client";

import * as React from "react";
/**
 * 💡 カラーテーマ・スイッチャー (究極UI版)
 * 1. 役割: globals.css で定義された .theme-blue などのクラスを <html> に適用。
 * 2. 意匠: 影なし、0.5px境界線、OKLCHカラーの鮮やかさを活かした円形UI。
 * 3. 永続化: 選択したテーマは localStorage に保存し、リロード後も維持。
 */
import { Check, Palette } from "lucide-react";
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

export function ThemeSwitcher({ variant = "grid" }: { variant?: "grid" | "dropdown" }) {
  const [activeTheme, setActiveTheme] = React.useState<string>("blue");
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    const saved = localStorage.getItem("iscore-color-theme") || "blue";
    setActiveTheme(saved);
    applyTheme(saved);
    setMounted(true);
  }, []);

  const applyTheme = (themeId: string) => {
    const root = document.documentElement;
    // 既存のテーマクラスを削除
    THEMES.forEach((t) => root.classList.remove(`theme-${t.id}`));
    // 新しいテーマクラスを追加
    root.classList.add(`theme-${themeId}`);
    localStorage.setItem("iscore-color-theme", themeId);
    setActiveTheme(themeId);
  };

  if (!mounted) return null;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 📱 モバイル版: グリッド表示 (Drawer用)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (variant === "grid") {
    return (
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-3 w-full bg-muted/10 p-4 rounded-[24px] border border-border/40 backdrop-blur-md">
        {THEMES.map((t) => (
          <button
            key={t.id}
            onClick={() => applyTheme(t.id)}
            className="flex flex-col items-center gap-2 group outline-none"
          >
            <div
              className={cn(
                "h-10 w-10 rounded-full flex items-center justify-center transition-all active:scale-90 border-2",
                activeTheme === t.id
                  ? "border-primary ring-4 ring-primary/20 scale-110"
                  : "border-transparent hover:border-border"
              )}
              style={{ backgroundColor: t.color }}
            >
              {activeTheme === t.id && <Check className="h-5 w-5 text-white stroke-[3px]" />}
            </div>
            <span className={cn(
              "text-[8px] font-black uppercase tracking-widest leading-none",
              activeTheme === t.id ? "text-primary" : "text-muted-foreground opacity-40"
            )}>
              {t.label}
            </span>
          </button>
        ))}
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 💻 PC版: インライン・セレクター (Header用)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/20 rounded-full border border-border/40">
      <Palette className="h-3.5 w-3.5 text-muted-foreground mr-1 opacity-40" />
      {THEMES.map((t) => (
        <button
          key={t.id}
          onClick={() => applyTheme(t.id)}
          className={cn(
            "h-5 w-5 rounded-full transition-all hover:scale-125 active:scale-90 relative",
            activeTheme === t.id && "ring-2 ring-offset-2 ring-offset-background ring-primary"
          )}
          style={{ backgroundColor: t.color }}
          title={t.label}
        >
          {activeTheme === t.id && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-1.5 w-1.5 rounded-full bg-white shadow-sm" />
            </div>
          )}
        </button>
      ))}
    </div>
  );
}