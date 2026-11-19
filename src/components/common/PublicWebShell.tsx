// filepath: src/components/common/PublicWebShell.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { LegacyDeviceCompatibilityBanner } from "@/components/liff/LegacyDeviceCompatibilityBanner";
import { cn } from "@/lib/utils";

export function PublicBrandLogoImg({
  size = 40,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src="/liff-logo.webp?v=3"
      alt="iScoreCloud"
      width={size}
      height={size}
      onError={(e) => {
        const img = e.currentTarget;
        if (!img.src.includes("/liff-logo.png")) {
          img.src = "/liff-logo.png?v=3";
        }
      }}
      className={cn(
        "rounded-[22%] bg-white dark:border dark:border-slate-700/70 object-contain shrink-0",
        className
      )}
    />
  );
}

/**
 * 公開Webページ共通ヘッダー（`/`・`/terms`・`/privacy` 共通）
 * - ロゴ ＋ ブランド名 ＋ 外観テーマ切替（Light / System / Dark）のみのシンプルな構成
 */
export function PublicWebHeader() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeTheme = mounted ? theme ?? "system" : null;

  return (
    <header className="sticky top-0 z-40 w-full bg-card border-b border-border shadow-2xs">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <Link
          href="/"
          id="header-brand-link"
          className="flex items-center gap-2.5 hover:opacity-85 transition-opacity min-w-0"
        >
          <PublicBrandLogoImg size={40} className="w-10 h-10" />
          <div className="flex items-baseline gap-0.5 truncate">
            <span className="text-xl sm:text-2xl font-black italic tracking-tighter text-foreground">
              iScore
            </span>
            <span className="text-xl sm:text-2xl font-black italic tracking-tighter text-primary">
              Cloud
            </span>
          </div>
        </Link>

        {/* テーマ切替（Light / System / Dark） */}
        <div
          role="group"
          aria-label="表示テーマ切替"
          className="flex items-center p-0.5 rounded-full border border-border bg-muted shrink-0"
        >
          <button
            type="button"
            id="theme-light-btn"
            onClick={() => setTheme("light")}
            aria-label="ライトモード"
            className={cn(
              "p-1.5 rounded-full transition-colors cursor-pointer",
              activeTheme === "light"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Sun className="w-4 h-4" />
          </button>
          <button
            type="button"
            id="theme-system-btn"
            onClick={() => setTheme("system")}
            aria-label="端末設定に合わせる"
            className={cn(
              "p-1.5 rounded-full transition-colors cursor-pointer",
              activeTheme === "system"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Monitor className="w-4 h-4" />
          </button>
          <button
            type="button"
            id="theme-dark-btn"
            onClick={() => setTheme("dark")}
            aria-label="ダークモード"
            className={cn(
              "p-1.5 rounded-full transition-colors cursor-pointer",
              activeTheme === "dark"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Moon className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="h-[2px] w-full bg-primary" />
    </header>
  );
}

/**
 * 公開Webページ共通フッター（`/`・`/terms`・`/privacy` 共通）
 */
export function PublicWebFooter() {
  const pathname = usePathname();

  return (
    <footer className="border-t border-border bg-card">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-7 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Link
            href="/"
            className="flex items-center gap-2 hover:opacity-85 transition-opacity"
          >
            <PublicBrandLogoImg size={28} className="w-7 h-7" />
            <span className="text-sm font-black italic tracking-tight text-foreground">
              iScore<span className="text-primary">Cloud</span>
            </span>
          </Link>
          <span className="text-xs font-medium text-muted-foreground">
            © {new Date().getFullYear()} iS Baseball Lab
          </span>
        </div>

        <nav
          aria-label="フッターナビゲーション"
          className="flex flex-wrap items-center justify-center gap-5 text-xs font-bold text-muted-foreground"
        >
          <Link
            href="/"
            className={cn(
              "hover:text-foreground transition-colors",
              pathname === "/" && "text-foreground font-black"
            )}
          >
            トップページ
          </Link>
          <Link
            href="/terms"
            id="footer-terms-link"
            className={cn(
              "hover:text-foreground transition-colors",
              pathname === "/terms" && "text-primary font-black"
            )}
          >
            サービス利用規約
          </Link>
          <Link
            href="/privacy"
            id="footer-privacy-link"
            className={cn(
              "hover:text-foreground transition-colors",
              pathname === "/privacy" && "text-primary font-black"
            )}
          >
            プライバシーポリシー
          </Link>
        </nav>
      </div>
    </footer>
  );
}

export function PublicWebLayoutShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary/20">
      <LegacyDeviceCompatibilityBanner />
      <PublicWebHeader />
      <main className="flex-1">{children}</main>
      <PublicWebFooter />
    </div>
  );
}
