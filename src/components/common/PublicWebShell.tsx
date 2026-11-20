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
  alt = "iScoreCloud",
  className,
}: {
  size?: number;
  alt?: string;
  className?: string;
}) {
  return (
    <img
      src="/liff-logo.webp?v=3"
      alt={alt}
      aria-hidden={alt === "" ? true : undefined}
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

const LINE_MINI_APP_LOGO_ASPECT_RATIO = 811.55 / 121.89;

const LINE_MINI_APP_LOGO_SRC: Record<"green" | "white" | "black", string> = {
  green: "/line-mini-app-logo-green-jp.svg",
  white: "/line-mini-app-logo-white-jp.svg",
  black: "/line-mini-app-logo-black-jp.svg",
};

/**
 * LINEヤフー公式配布「LINE ミニアプリ」日本語ワードマーク（Version 2.2 正規SVG無加工表示）
 * - 縦横比（811.55 : 121.89）固定、最小サイズ規定（PC 15px以上）および周囲クリアスペース（「プ」1文字分以上）を遵守して配置すること
 */
export function LineMiniAppWordmarkImg({
  variant = "green",
  heightPx = 18,
  alt = "LINE ミニアプリ",
  className,
}: {
  variant?: "green" | "white" | "black";
  heightPx?: number;
  alt?: string;
  className?: string;
}) {
  const safeHeight = Math.max(15, Math.round(heightPx));
  const safeWidth = Math.round(safeHeight * LINE_MINI_APP_LOGO_ASPECT_RATIO);

  return (
    <img
      src={LINE_MINI_APP_LOGO_SRC[variant]}
      alt={alt}
      aria-hidden={alt === "" ? true : undefined}
      width={safeWidth}
      height={safeHeight}
      style={{ width: `${safeWidth}px`, height: `${safeHeight}px` }}
      className={cn("object-contain shrink-0 select-none", className)}
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
          className="flex items-center gap-2.5 shrink-0 hover:opacity-85 transition-opacity"
        >
          <PublicBrandLogoImg size={40} className="w-10 h-10" />
          <div className="flex flex-col justify-center">
            <span className="inline-block pr-1.5 text-[19px] sm:text-[22px] font-black italic tracking-tighter leading-none text-foreground">
              iScore<span className="text-primary">Cloud</span>
            </span>
            <span className="text-[10px] sm:text-[11px] font-bold tracking-tight leading-none text-muted-foreground mt-1 select-none whitespace-nowrap">
              野球スコア＆チーム運営クラウド
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

export const LINE_TRADEMARK_NOTICE =
  "※LINEおよびLINEミニアプリ、各種ロゴは、LINEヤフー株式会社の登録商標または商標です。";

export const CLOUDFLARE_TRADEMARK_NOTICE =
  "※米国およびその他の管轄区域において、CloudflareおよびCloudflare Workersは、Cloudflare, Inc.の商標および/または登録商標です。";

/**
 * 公開Webページ共通フッター（`/`・`/terms`・`/privacy` 共通）
 */
export function PublicWebFooter() {
  const pathname = usePathname();

  return (
    <footer className="border-t border-border bg-card">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-7 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-2.5 gap-y-1.5">
          <Link
            href="/"
            className="flex items-center gap-2 hover:opacity-85 transition-opacity"
          >
            <PublicBrandLogoImg size={28} className="w-7 h-7" />
            <span className="inline-block pr-1 text-sm font-black italic tracking-tight text-foreground">
              iScore<span className="text-primary">Cloud</span>
            </span>
          </Link>
          <span className="text-xs font-medium text-muted-foreground">
            © {new Date().getFullYear()} iS Baseball Lab
          </span>
          <span className="px-2 py-0.5 rounded-md border border-border bg-muted text-[10px] font-bold text-muted-foreground">
            Runs on Cloudflare Workers® platform
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
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-6 -mt-2 text-center sm:text-left space-y-1">
        <p className="text-[11px] font-medium text-muted-foreground leading-relaxed">
          {LINE_TRADEMARK_NOTICE}
        </p>
        <p className="text-[11px] font-medium text-muted-foreground leading-relaxed">
          {CLOUDFLARE_TRADEMARK_NOTICE}
        </p>
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
