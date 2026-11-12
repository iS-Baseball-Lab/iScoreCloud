// src/components/layout/theme-toggle.tsx
"use client";

import * as React from "react";
/**
 * 💡 テーマトグル・コンポーネント (Tailwind v4 決定版)
 * 1. 修正: toggleTheme 関数を、現在の実際の状態 (resolvedTheme) に基づくように修正。
 * 2. 修正: マウント完了まで何も表示しないことで、SSRとの不整合 (NG原因) を排除。
 * 3. 意匠: 監督の globals.css にある光彩背景が切り替わる瞬間を演出します。
 */
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

export function ThemeToggle({ variant = "icon" }: { variant?: "icon" | "segmented" }) {
  // 💡 resolvedTheme は「システム設定」を含めた現在の実際の色（light or dark）を返します
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  // クライアントサイドでのマウントを待機 (Hydrationエラー防止の鉄則)
  React.useEffect(() => {
    setMounted(true);
  }, []);

  // マウント前はレイアウトシフトを防ぐために透明な領域を確保
  if (!mounted) {
    return <div className={variant === "icon" ? "h-10 w-10" : "h-14 w-full"} />;
  }

  /**
   * 💡 テーマ切り替えロジック
   * 実際の見た目 (resolvedTheme) が dark なら次は light へ。
   * それ以外（light）なら次は dark へ。
   */
  const toggleTheme = () => {
    const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 💻 PC版: アイコン循環トグル
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (variant === "icon") {
    return (
      <button
        onClick={toggleTheme}
        className="relative h-10 w-10 flex items-center justify-center rounded-full hover:bg-muted/50 text-muted-foreground transition-all active:scale-90 group outline-none"
        aria-label="テーマ切り替え"
      >
        {/* 💡 v4 の dark: モディファイアが効くよう、クラス名で制御 */}
        <Sun className="h-5 w-5 transition-all rotate-0 scale-100 dark:-rotate-90 dark:scale-0 group-hover:text-primary" />
        <Moon className="absolute h-5 w-5 transition-all rotate-90 scale-0 dark:rotate-0 dark:scale-100 group-hover:text-primary" />
      </button>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 📱 モバイル版: セグメント・コントロール
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  return (
    <div className="flex p-1 bg-muted/20 rounded-2xl border border-border/40 w-full backdrop-blur-sm shadow-none">
      {[
        { id: "light", icon: Sun, label: "Light" },
        { id: "dark", icon: Moon, label: "Dark" },
        { id: "system", icon: Monitor, label: "Auto" },
      ].map((item) => {
        // 設定値 (theme) と一致しているボタンを強調
        const isActive = theme === item.id;

        return (
          <button
            key={item.id}
            onClick={() => setTheme(item.id)}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl transition-all duration-300",
              isActive
                ? "bg-background text-primary ring-1 ring-border/10 shadow-sm"
                : "text-muted-foreground opacity-40 hover:opacity-100"
            )}
          >
            <item.icon className={cn(
              "h-4 w-4 transition-all",
              isActive && "animate-in zoom-in-75 duration-300 text-primary"
            )} />
            <span className="text-[9px] font-black uppercase tracking-[0.15em] leading-none">
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}