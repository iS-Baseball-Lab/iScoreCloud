// filepath: src/app/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { SiLine } from "react-icons/si";
import {
  ArrowUpRight,
  Check,
  Copy,
  FileSpreadsheet,
  Monitor,
  Moon,
  Smartphone,
  Sun,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  buildLineMiniAppTargets,
  getCachedLineMiniAppConfig,
  resolveLineMiniAppConfig,
  type LineMiniAppConfig,
} from "@/lib/line-miniapp";
import { LegacyDeviceCompatibilityBanner } from "@/components/liff/LegacyDeviceCompatibilityBanner";
import { cn } from "@/lib/utils";

interface PillarItem {
  number: string;
  accentClass: string;
  badgeText: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const CORE_PILLARS: PillarItem[] = [
  {
    number: "01",
    accentClass: "border-primary",
    badgeText: "SCOREBOOK & AI",
    title: "伝統の早稲田式清書 ＆ AI読取",
    description:
      "ベンチでの片手タップ入力や紙スコアブックのカメラ撮影から、美しい早稲田式の清書シート（PDF・画像）と個人成績を自動生成します。",
    icon: <FileSpreadsheet className="w-4 h-4 text-sky-400" />,
  },
  {
    number: "02",
    accentClass: "border-teal-500",
    badgeText: "TEAM OPERATIONS",
    title: "出欠・配車・当日運営を一元化",
    description:
      "選手・保護者のグループ別出欠表、遠征の配車編成＆隊列ライブマップ、審判・スコア担当の割当から前日LINE連絡文までひとつに連携します。",
    icon: <Users className="w-4 h-4 text-teal-400" />,
  },
  {
    number: "03",
    accentClass: "border-[#06C755]",
    badgeText: "LINE MINI APP",
    title: "アプリDL不要、LINEで全員すぐ使える",
    description:
      "専用アプリのインストールや新たなパスワード管理は不要。チームのグループLINEに招待リンクを送るだけで、その日から運用できます。",
    icon: <Smartphone className="w-4 h-4 text-[#06C755]" />,
  },
];

function BrandLogoImg({
  size = 36,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src="/liff-logo.webp"
      alt="iScoreCloud"
      width={size}
      height={size}
      onError={(e) => {
        const img = e.currentTarget;
        if (!img.src.endsWith("/liff-logo.png")) {
          img.src = "/liff-logo.png";
        }
      }}
      className={cn(
        "rounded-[22%] bg-[#0f172a] border border-slate-700/80 object-contain shrink-0",
        className
      )}
    />
  );
}

export default function LandingPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [config, setConfig] = useState<LineMiniAppConfig>(() =>
    getCachedLineMiniAppConfig()
  );
  const [configResolved, setConfigResolved] = useState<boolean>(() => {
    const cached = getCachedLineMiniAppConfig();
    return Boolean(cached.liffId || cached.miniAppUrl);
  });
  const [qrLoadFailed, setQrLoadFailed] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    setMounted(true);
    let active = true;
    void resolveLineMiniAppConfig().then((resolved) => {
      if (!active) return;
      setConfig(resolved);
      setConfigResolved(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const targets = useMemo(
    () => buildLineMiniAppTargets({ config }),
    [config]
  );

  // LINEミニアプリ起動URL（LIFF ID / ミニアプリURL優先）
  const lineLaunchUrl = targets.externalLineUrl || targets.qrTargetUrl;

  const qrImageSrc = useMemo(() => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&ecc=M&data=${encodeURIComponent(
      targets.qrTargetUrl
    )}`;
  }, [targets.qrTargetUrl]);

  const handleCopyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(lineLaunchUrl);
      setIsCopied(true);
      toast.success("LINEミニアプリのURLをコピーしました");
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error("URLのコピーに失敗しました");
    }
  }, [lineLaunchUrl]);

  const activeTheme = mounted ? theme ?? "system" : null;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary/20">
      <LegacyDeviceCompatibilityBanner />

      {/* 固定ソリッドヘッダー（ロゴ ＋ テーマ切替のみ） */}
      <header className="sticky top-0 z-40 w-full bg-card border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Link
            href="/"
            id="header-brand-link"
            className="flex items-center gap-2.5 hover:opacity-85 transition-opacity min-w-0"
          >
            <BrandLogoImg size={36} className="w-9 h-9" />
            <div className="flex items-baseline gap-0.5 truncate">
              <span className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
                iScore
              </span>
              <span className="text-xl sm:text-2xl font-black tracking-tight text-primary">
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
                "p-1.5 rounded-full transition-colors",
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
                "p-1.5 rounded-full transition-colors",
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
                "p-1.5 rounded-full transition-colors",
                activeTheme === "dark"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Moon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* センターヒーロー：紹介 ＋ LINEミニアプリリンク ＆ 2次元コード */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-12 pb-14 sm:pt-16 sm:pb-20 text-center space-y-8 sm:space-y-10">
          <div className="space-y-4 sm:space-y-5">
            <p className="text-xs font-black tracking-[0.22em] uppercase text-primary">
              BASEBALL SCOREBOOK &amp; TEAM MANAGEMENT
            </p>

            <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-[1.18] text-foreground">
              野球の記録も、チーム運営も。
              <span className="block mt-1.5 text-primary">
                LINEひとつで、美しく完結。
              </span>
            </h1>

            <p className="text-sm sm:text-base font-medium leading-relaxed text-muted-foreground max-w-xl mx-auto">
              草野球・学童野球チームのための次世代スコアブック＆運営アプリ「iScoreCloud」。
              早稲田式スコア清書・AI読取・出欠・配車・1球速報まで、いつものLINEからすぐに使えます。
            </p>
          </div>

          {/* 中央メインカード：LINEミニアプリ起動ボタン ＋ 2次元コード（A-3 ソリッド規格） */}
          <div className="max-w-md mx-auto rounded-2xl border border-border bg-card shadow-sm overflow-hidden text-left">
            <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-[#06C755] px-5 py-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-[#06C755] text-white flex items-center justify-center shrink-0">
                  <SiLine className="w-4 h-4" />
                </span>
                <span className="text-sm font-black tracking-tight truncate">
                  iScoreCloud LINEミニアプリ
                </span>
              </div>
            </div>

            <div className="p-6 sm:p-7 flex flex-col items-center text-center space-y-6">
              {/* 1. LINEリンクボタン */}
              <div className="w-full space-y-2">
                <a
                  href={lineLaunchUrl}
                  id="launch-line-miniapp-btn"
                  className="w-full h-14 px-6 rounded-2xl bg-[#06C755] hover:bg-[#05b34c] text-white font-black text-base flex items-center justify-center gap-2.5 shadow-sm active:scale-[0.98] transition-all"
                >
                  <SiLine className="w-5 h-5 shrink-0" />
                  <span>LINEミニアプリを開く</span>
                  <ArrowUpRight className="w-4 h-4 shrink-0" />
                </a>
                <p className="text-[11px] font-bold text-muted-foreground">
                  スマートフォンからはボタンタップでLINEが起動します
                </p>
              </div>

              {/* 区切り線 */}
              <div className="w-full flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11px] font-black tracking-wider text-muted-foreground">
                  2次元コードで開く
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {/* 2. 中央2次元コード表示 */}
              <div className="flex flex-col items-center space-y-3 w-full">
                <div className="rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white p-3 shadow-xs flex items-center justify-center w-48 h-48">
                  {!configResolved ? (
                    <div className="w-full h-full rounded-xl bg-slate-100 animate-pulse" />
                  ) : !qrLoadFailed ? (
                    <img
                      src={qrImageSrc}
                      alt="iScoreCloud LINEミニアプリ 2次元コード"
                      width={164}
                      height={164}
                      className="w-[164px] h-[164px] object-contain"
                      onError={() => setQrLoadFailed(true)}
                    />
                  ) : (
                    <p className="text-[11px] font-bold text-slate-600 px-2 break-all">
                      {lineLaunchUrl}
                    </p>
                  )}
                </div>

                <p className="text-xs font-bold text-muted-foreground leading-relaxed">
                  スマホのカメラ または LINEのQRコードリーダーで
                  <br />
                  読み取るとLINEミニアプリが起動します
                </p>

                <button
                  type="button"
                  id="copy-miniapp-url-btn"
                  onClick={handleCopyUrl}
                  className="h-9 px-3.5 rounded-xl border border-border bg-muted hover:bg-muted/80 text-foreground font-bold text-xs inline-flex items-center gap-1.5 transition-colors"
                >
                  {isCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#06C755]" />
                      <span>URLをコピーしました</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>ミニアプリのリンクをコピー</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* シンプルな3つの特徴紹介セクション */}
        <section
          id="features"
          className="border-t border-border bg-background pb-16 pt-12 sm:pb-24 sm:pt-16"
        >
          <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-8">
            <div className="text-center space-y-1.5">
              <p className="text-xs font-black tracking-[0.2em] uppercase text-primary">
                FEATURES
              </p>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
                iScoreCloud の主な機能
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {CORE_PILLARS.map((item) => (
                <article
                  key={item.number}
                  className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden flex flex-col"
                >
                  <div
                    className={cn(
                      "bg-[#0f172a] text-slate-50 border-b-[3px] px-4 py-3 flex items-center justify-between gap-2",
                      item.accentClass
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {item.icon}
                      <span className="text-[11px] font-black tracking-wider uppercase text-slate-200">
                        {item.badgeText}
                      </span>
                    </div>
                    <span className="font-mono text-xs font-black text-slate-400">
                      {item.number}
                    </span>
                  </div>

                  <div className="p-5 sm:p-6 space-y-2 flex-1">
                    <h3 className="text-base font-black tracking-tight text-foreground">
                      {item.title}
                    </h3>
                    <p className="text-xs sm:text-sm font-medium leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* ミニマル・ソリッドフッター */}
      <footer className="border-t border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-7 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <BrandLogoImg size={28} className="w-7 h-7" />
            <span className="text-sm font-black tracking-tight text-foreground">
              iScoreCloud
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              © {new Date().getFullYear()} iS Baseball Lab
            </span>
          </div>

          <nav
            aria-label="フッターナビゲーション"
            className="flex flex-wrap items-center justify-center gap-5 text-xs font-bold text-muted-foreground"
          >
            <Link
              href="/liff/terms"
              id="footer-terms-link"
              className="hover:text-foreground transition-colors"
            >
              サービス利用規約
            </Link>
            <Link
              href="/liff/privacy"
              id="footer-privacy-link"
              className="hover:text-foreground transition-colors"
            >
              プライバシーポリシー
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}