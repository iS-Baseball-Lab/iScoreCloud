// filepath: src/components/common/PublicWebShell.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { ArrowUp, Monitor, Moon, Sun } from "lucide-react";
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
 * - A-3 ダークネイビー（`#0f172a` × `#090f1d`）2層ソリッド設計
 */
export function PublicWebFooter() {
  const pathname = usePathname();

  const handleScrollTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <footer className="bg-[#0f172a] text-slate-200 border-t-[3px] border-primary">
      {/* 上段：ブランド情報 ＆ ナビゲーション */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-10 pb-8 sm:pt-12 sm:pb-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 sm:gap-10 items-start">
          {/* 左カラム：ブランドロックアップ・概要・公式バッジ */}
          <div className="md:col-span-7 space-y-4">
            <Link
              href="/"
              className="inline-flex items-center gap-3 hover:opacity-90 transition-opacity"
            >
              <PublicBrandLogoImg
                size={40}
                className="w-10 h-10 border border-slate-700/80 shadow-xs"
              />
              <div className="flex flex-col justify-center">
                <span className="inline-block pr-1.5 text-xl sm:text-[22px] font-black italic tracking-tighter leading-none text-white">
                  iScore<span className="text-sky-400">Cloud</span>
                </span>
                <span className="text-[11px] font-bold tracking-tight leading-none text-slate-400 mt-1 select-none">
                  野球スコア＆チーム運営クラウド
                </span>
              </div>
            </Link>

            <p className="text-xs leading-relaxed font-medium text-slate-400 max-w-md">
              早稲田式デジタルスコア清書・AI読取・LINE試合速報から、出欠・遠征配車・選手名鑑まで。学童野球から中学・草野球の現場をひとつにつなぐオールインワン運営基盤。
            </p>

            <div className="pt-1 flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center px-3.5 py-2 rounded-lg bg-[#090f1d] border border-slate-800">
                <LineMiniAppWordmarkImg variant="white" heightPx={16} />
              </span>
              <span className="inline-flex items-center px-3 py-2 rounded-lg bg-[#090f1d] border border-slate-800 text-[11px] font-bold text-slate-300">
                Runs on Cloudflare Workers® platform
              </span>
            </div>
          </div>

          {/* 右カラム：2列ナビゲーション ＋ トップへ戻る */}
          <div className="md:col-span-5 grid grid-cols-2 gap-6 sm:flex sm:flex-row md:justify-end sm:gap-12">
            <div>
              <p className="text-[10px] font-black tracking-[0.2em] uppercase text-sky-400 mb-3">
                SERVICE
              </p>
              <ul className="space-y-2.5 text-xs font-bold text-slate-300">
                <li>
                  <Link
                    href="/"
                    className={cn(
                      "hover:text-white transition-colors inline-flex items-center gap-1.5",
                      pathname === "/" && "text-white font-black"
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        pathname === "/" ? "bg-sky-400" : "bg-slate-600"
                      )}
                    />
                    <span>トップページ</span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/#features"
                    className="hover:text-white transition-colors inline-flex items-center gap-1.5"
                  >
                    <span
                      aria-hidden="true"
                      className="w-1.5 h-1.5 rounded-full bg-slate-600"
                    />
                    <span>主な機能</span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/#onboarding"
                    className="hover:text-white transition-colors inline-flex items-center gap-1.5"
                  >
                    <span
                      aria-hidden="true"
                      className="w-1.5 h-1.5 rounded-full bg-slate-600"
                    />
                    <span>導入ステップ</span>
                  </Link>
                </li>
              </ul>
            </div>

            <div className="space-y-4">
              <nav aria-label="フッターナビゲーション">
                <p className="text-[10px] font-black tracking-[0.2em] uppercase text-sky-400 mb-3">
                  LEGAL
                </p>
                <ul className="space-y-2.5 text-xs font-bold text-slate-300">
                  <li>
                    <Link
                      href="/terms"
                      id="footer-terms-link"
                      className={cn(
                        "hover:text-white transition-colors inline-flex items-center gap-1.5",
                        pathname === "/terms" && "text-sky-400 font-black"
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          pathname === "/terms" ? "bg-sky-400" : "bg-slate-600"
                        )}
                      />
                      <span>サービス利用規約</span>
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/privacy"
                      id="footer-privacy-link"
                      className={cn(
                        "hover:text-white transition-colors inline-flex items-center gap-1.5",
                        pathname === "/privacy" && "text-sky-400 font-black"
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          pathname === "/privacy"
                            ? "bg-sky-400"
                            : "bg-slate-600"
                        )}
                      />
                      <span>プライバシーポリシー</span>
                    </Link>
                  </li>
                </ul>
              </nav>

              <button
                type="button"
                onClick={handleScrollTop}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-black text-slate-200 transition-colors cursor-pointer"
              >
                <ArrowUp className="w-3.5 h-3.5 text-sky-400" />
                <span>ページ上部へ</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 下段：コピーライト ＆ 商標表記バー */}
      <div className="bg-[#090f1d] border-t border-slate-800/90">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 space-y-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
            <p className="text-xs font-bold text-slate-300">
              © {new Date().getFullYear()} iS Baseball Lab. All rights reserved.
            </p>
            <p className="font-mono text-[10px] font-black tracking-[0.18em] uppercase text-slate-500">
              BASEBALL SCOREBOOK &amp; TEAM MANAGEMENT
            </p>
          </div>

          <div className="pt-2.5 border-t border-slate-800/80 text-left overflow-hidden">
            <div className="space-y-1 max-sm:w-[138.89%] max-sm:origin-top-left max-sm:scale-[0.72] max-sm:-mb-2.5">
              <p className="text-[10px] sm:text-[11px] font-medium text-slate-400 leading-snug sm:leading-relaxed">
                {LINE_TRADEMARK_NOTICE}
              </p>
              <p className="text-[10px] sm:text-[11px] font-medium text-slate-400 leading-snug sm:leading-relaxed">
                {CLOUDFLARE_TRADEMARK_NOTICE}
              </p>
            </div>
          </div>
        </div>
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
