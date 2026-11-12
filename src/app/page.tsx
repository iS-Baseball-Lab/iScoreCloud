// filepath: src/app/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  ArrowRight,
  Check,
  FileSpreadsheet,
  Moon,
  Monitor,
  Smartphone,
  Sun,
  Users,
} from "lucide-react";
import { OpenLineMiniAppButton } from "@/components/common/OpenLineMiniAppButton";
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
      "ベンチでの片手タップ入力や紙スコアブックのカメラ撮影から、美しい早稲田式の清書シート（PDF・画像）と22項目の個人成績を自動生成します。",
    icon: <FileSpreadsheet className="w-4 h-4 text-sky-400" />,
  },
  {
    number: "02",
    accentClass: "border-teal-500",
    badgeText: "TEAM OPERATIONS",
    title: "出欠・配車・当日運営を一元化",
    description:
      "選手・保護者のグループ別出欠表、遠征の配車編成＆隊列ライブマップ、審判・スコア担当の割当から前日LINE連絡文まで二重入力ゼロで連携します。",
    icon: <Users className="w-4 h-4 text-teal-400" />,
  },
  {
    number: "03",
    accentClass: "border-[#06C755]",
    badgeText: "LINE MINI APP",
    title: "いつものLINEで、全員すぐ使える",
    description:
      "専用アプリのインストールや新たなパスワード管理は不要。チームのグループLINEに招待リンクを送るだけで、指導者も保護者もその日から参加できます。",
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

/**
 * ヒーロー右カラム：iScoreCloud の本質（公式イニングスコア × 早稲田式清書ベクター × LINE運営統合）を示すソリッド標本ボード
 */
function ScorebookSpecimenBoard() {
  const innings = ["1", "2", "3", "4", "5", "6", "7"];
  const visitorScores = ["0", "1", "0", "0", "2", "0", "0"];
  const homeScores = ["1", "0", "0", "2", "0", "0", "1x"];

  return (
    <div
      aria-label="iScoreCloud デジタルスコアブック プレビュー"
      className="w-full rounded-2xl border border-border bg-card shadow-sm overflow-hidden select-none"
    >
      {/* 上帯ダークキャップ（A-3規格 × 公式LINEグリーン下線） */}
      <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-[#06C755] p-4 sm:p-5 space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-block w-2 h-2 rounded-full bg-[#06C755] shrink-0" />
            <span className="text-[11px] font-black tracking-[0.16em] uppercase text-slate-200 truncate">
              OFFICIAL SCOREBOOK &amp; LIVE HUB
            </span>
          </div>
          <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono font-black text-slate-200 tracking-wider shrink-0">
            FINAL / 7回サヨナラ
          </span>
        </div>

        {/* ソリッド・イニングスコアボード */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/90 overflow-hidden">
          <table className="w-full text-center border-collapse font-mono text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] text-slate-400 font-bold">
                <th className="py-1.5 px-2.5 text-left font-sans tracking-wider">
                  TEAM
                </th>
                {innings.map((inn) => (
                  <th key={inn} className="py-1.5 w-6">
                    {inn}
                  </th>
                ))}
                <th className="py-1.5 w-7 border-l border-slate-800 text-slate-200">
                  R
                </th>
                <th className="py-1.5 w-7 text-slate-400">H</th>
                <th className="py-1.5 w-7 text-slate-400">E</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/90 font-black">
              <tr className="text-slate-300">
                <td className="py-2 px-2.5 text-left font-sans text-[11px] tracking-tight">
                  VISITOR
                </td>
                {visitorScores.map((s, idx) => (
                  <td key={idx} className="py-2">
                    {s}
                  </td>
                ))}
                <td className="py-2 border-l border-slate-800 text-white text-sm">
                  3
                </td>
                <td className="py-2 text-slate-400">6</td>
                <td className="py-2 text-slate-400">1</td>
              </tr>
              <tr className="text-white bg-slate-900/70">
                <td className="py-2 px-2.5 text-left font-sans text-[11px] tracking-tight text-sky-300">
                  HOME
                </td>
                {homeScores.map((s, idx) => (
                  <td
                    key={idx}
                    className={cn(
                      "py-2",
                      s === "1x" && "text-[#06C755] font-black"
                    )}
                  >
                    {s}
                  </td>
                ))}
                <td className="py-2 border-l border-slate-800 text-[#06C755] text-sm">
                  4
                </td>
                <td className="py-2 text-slate-300">8</td>
                <td className="py-2 text-slate-300">0</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 中段：早稲田式スコアブック清書ベクター標本ストリップ */}
      <div className="p-4 sm:p-5 bg-card divide-y divide-border space-y-4">
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-black text-foreground tracking-tight">
              早稲田式 清書スコアシート自動描画
            </span>
            <span className="font-mono font-bold text-muted-foreground">
              7回裏 決勝シーン
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {/* 1番打者：中前安打＋生還 */}
            <div className="rounded-xl border border-[#d6d0c4] bg-[#fdfcf7] p-2 text-[#1e293b]">
              <div className="flex items-center justify-between text-[9px] font-bold text-slate-500 mb-1">
                <span>1番 遊</span>
                <span className="font-mono text-rose-600 font-black">中安</span>
              </div>
              <svg
                viewBox="0 0 80 80"
                className="w-full aspect-square"
                aria-hidden="true"
              >
                <rect
                  x="2"
                  y="2"
                  width="76"
                  height="76"
                  fill="#fdfcf7"
                  stroke="#94a3b8"
                  strokeWidth="1.5"
                />
                <line
                  x1="2"
                  y1="26"
                  x2="26"
                  y2="26"
                  stroke="#cbd5e1"
                  strokeWidth="1"
                />
                <line
                  x1="26"
                  y1="2"
                  x2="26"
                  y2="78"
                  stroke="#cbd5e1"
                  strokeWidth="1"
                />
                {/* ダイヤモンド基準線 */}
                <polygon
                  points="48,14 70,40 48,66 26,40"
                  fill="none"
                  stroke="#cbd5e1"
                  strokeWidth="1"
                />
                {/* 全周進塁線（本塁生還） */}
                <polygon
                  points="48,14 70,40 48,66 26,40"
                  fill="none"
                  stroke="#dc2626"
                  strokeWidth="2.4"
                />
                {/* 自責点黒丸（中央） */}
                <circle cx="48" cy="40" r="6.5" fill="#dc2626" />
                {/* 投球記号 */}
                <circle
                  cx="14"
                  cy="12"
                  r="3.2"
                  fill="none"
                  stroke="#334155"
                  strokeWidth="1.4"
                />
                <line
                  x1="10"
                  y1="20"
                  x2="18"
                  y2="20"
                  stroke="#334155"
                  strokeWidth="1.4"
                />
                {/* 右下打球記録: 中前安打 */}
                <line
                  x1="57"
                  y1="67"
                  x2="69"
                  y2="55"
                  stroke="#dc2626"
                  strokeWidth="2"
                />
                <text
                  x="64"
                  y="73"
                  fontSize="11"
                  fontWeight="900"
                  fill="#dc2626"
                  textAnchor="middle"
                >
                  8
                </text>
              </svg>
            </div>

            {/* 2番打者：犠打 */}
            <div className="rounded-xl border border-[#d6d0c4] bg-[#fdfcf7] p-2 text-[#1e293b]">
              <div className="flex items-center justify-between text-[9px] font-bold text-slate-500 mb-1">
                <span>2番 二</span>
                <span className="font-mono text-slate-700 font-black">投犠</span>
              </div>
              <svg
                viewBox="0 0 80 80"
                className="w-full aspect-square"
                aria-hidden="true"
              >
                <rect
                  x="2"
                  y="2"
                  width="76"
                  height="76"
                  fill="#fdfcf7"
                  stroke="#94a3b8"
                  strokeWidth="1.5"
                />
                <line
                  x1="2"
                  y1="26"
                  x2="26"
                  y2="26"
                  stroke="#cbd5e1"
                  strokeWidth="1"
                />
                <line
                  x1="26"
                  y1="2"
                  x2="26"
                  y2="78"
                  stroke="#cbd5e1"
                  strokeWidth="1"
                />
                <polygon
                  points="48,14 70,40 48,66 26,40"
                  fill="none"
                  stroke="#cbd5e1"
                  strokeWidth="1"
                />
                {/* Iアウト中央 */}
                <text
                  x="48"
                  y="44"
                  fontSize="13"
                  fontWeight="900"
                  fill="#0f172a"
                  textAnchor="middle"
                >
                  I
                </text>
                {/* 犠打四角囲み 1-3 */}
                <rect
                  x="51"
                  y="54"
                  width="23"
                  height="18"
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth="1.5"
                />
                <text
                  x="62.5"
                  y="66.5"
                  fontSize="9.5"
                  fontWeight="900"
                  fill="#0f172a"
                  textAnchor="middle"
                >
                  1-3
                </text>
              </svg>
            </div>

            {/* 3番打者：サヨナラ右中間二塁打 */}
            <div className="rounded-xl border border-[#d6d0c4] bg-[#fdfcf7] p-2 text-[#1e293b]">
              <div className="flex items-center justify-between text-[9px] font-bold text-slate-500 mb-1">
                <span>3番 中</span>
                <span className="font-mono text-rose-600 font-black">右二</span>
              </div>
              <svg
                viewBox="0 0 80 80"
                className="w-full aspect-square"
                aria-hidden="true"
              >
                <rect
                  x="2"
                  y="2"
                  width="76"
                  height="76"
                  fill="#fdfcf7"
                  stroke="#94a3b8"
                  strokeWidth="1.5"
                />
                <line
                  x1="2"
                  y1="26"
                  x2="26"
                  y2="26"
                  stroke="#cbd5e1"
                  strokeWidth="1"
                />
                <line
                  x1="26"
                  y1="2"
                  x2="26"
                  y2="78"
                  stroke="#cbd5e1"
                  strokeWidth="1"
                />
                <polygon
                  points="48,14 70,40 48,66 26,40"
                  fill="none"
                  stroke="#cbd5e1"
                  strokeWidth="1"
                />
                {/* 二塁までの赤進塁線 */}
                <polyline
                  points="48,66 70,40 48,14"
                  fill="none"
                  stroke="#dc2626"
                  strokeWidth="2.6"
                />
                {/* 二塁打二本線 */}
                <line
                  x1="55"
                  y1="67"
                  x2="68"
                  y2="54"
                  stroke="#dc2626"
                  strokeWidth="1.8"
                />
                <line
                  x1="59"
                  y1="70"
                  x2="72"
                  y2="57"
                  stroke="#dc2626"
                  strokeWidth="1.8"
                />
                <text
                  x="67"
                  y="74"
                  fontSize="10.5"
                  fontWeight="900"
                  fill="#dc2626"
                  textAnchor="middle"
                >
                  9
                </text>
                {/* 打点① */}
                <text
                  x="36"
                  y="25"
                  fontSize="10"
                  fontWeight="900"
                  fill="#0f172a"
                  textAnchor="middle"
                >
                  ①
                </text>
              </svg>
            </div>
          </div>
        </div>

        {/* 下段：LINEミニアプリ連携タグ行 */}
        <div className="pt-3.5 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-muted-foreground">
          <span>PDF / PNG 清書出力</span>
          <span className="text-border">•</span>
          <span>LINE 1球速報連動</span>
          <span className="text-border">•</span>
          <span>個人・投手成績自動集計</span>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeTheme = mounted ? theme ?? "system" : null;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary/20">
      <LegacyDeviceCompatibilityBanner />

      {/* 固定ソリッドヘッダー（透過ブラー・グラデーション完全排除） */}
      <header className="sticky top-0 z-40 w-full bg-card border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
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

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* テーマ切替（Light / System / Dark） */}
            <div
              role="group"
              aria-label="表示テーマ切替"
              className="flex items-center p-0.5 rounded-full border border-border bg-muted"
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
                <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
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
                <Monitor className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
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
                <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>

            <OpenLineMiniAppButton variant="header" showQrTrigger />
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ヒーローセクション */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-14 sm:pt-16 sm:pb-20 lg:pt-20 lg:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            {/* 左カラム：メッセージ & LINEミニアプリ起動導線 */}
            <div className="lg:col-span-7 space-y-6 sm:space-y-7">
              <div className="inline-flex items-center gap-2.5">
                <span className="w-1 h-4 bg-[#06C755] rounded-full" />
                <span className="text-xs font-black tracking-[0.18em] uppercase text-muted-foreground">
                  iScoreCloud LINEミニアプリ
                </span>
              </div>

              <h1 className="text-3xl sm:text-5xl lg:text-[3.25rem] font-black tracking-tight leading-[1.15] text-foreground">
                野球の記録も、チーム運営も。
                <span className="block mt-1.5 text-primary">
                  LINEひとつで、美しく完結。
                </span>
              </h1>

              <p className="text-sm sm:text-base font-medium leading-relaxed text-muted-foreground max-w-2xl">
                スマホ片手のベンチ入力や紙スコアのAI読取から、伝統的な早稲田式スコアブックの清書出力、出欠・配車・1球速報まで。専用アプリのインストール不要で、いつものLINEからチーム全員がすぐに使えます。
              </p>

              {/* メインアクション（公式LINEミニアプリ起動 ＋ 体験デモ） */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                <OpenLineMiniAppButton
                  variant="hero"
                  showQrTrigger
                  className="w-full sm:w-auto [&>a]:flex-1 sm:[&>a]:flex-initial"
                />

                <Link
                  href="/liff"
                  id="hero-demo-link"
                  className="h-14 px-6 rounded-2xl border border-border bg-card hover:bg-muted text-foreground font-black text-sm flex items-center justify-center gap-2 shadow-xs active:scale-[0.98] transition-all"
                >
                  <span>ブラウザで体験デモを見る</span>
                  <ArrowRight className="w-4 h-4 text-primary" />
                </Link>
              </div>

              {/* 補足ファクト */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-xs font-bold text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-[#06C755] shrink-0" />
                  アプリDL・新規ID作成不要
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-[#06C755] shrink-0" />
                  早稲田式清書（PDF・画像出力）
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-[#06C755] shrink-0" />
                  学童・中学・草野球チーム対応
                </span>
              </div>
            </div>

            {/* 右カラム：ソリッドスコアブック標本ボード */}
            <div className="lg:col-span-5">
              <ScorebookSpecimenBoard />
            </div>
          </div>
        </section>

        {/* 3つのコア機能紹介セクション */}
        <section
          id="features"
          className="border-t border-border bg-background py-14 sm:py-20"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-8 sm:space-y-10">
            <div className="space-y-2 max-w-2xl">
              <p className="text-xs font-black tracking-[0.2em] uppercase text-primary">
                CORE CAPABILITIES
              </p>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
                グラウンドと保護者を繋ぐ、3つの柱
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

                  <div className="p-5 sm:p-6 space-y-2.5 flex-1">
                    <h3 className="text-base sm:text-lg font-black tracking-tight text-foreground">
                      {item.title}
                    </h3>
                    <p className="text-xs sm:text-sm font-medium leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </article>
              ))}
            </div>

            {/* 下部ダイレクト起動パネル（A-3 ソリッド規格） */}
            <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-[#06C755] px-5 py-3.5 flex items-center justify-between gap-3">
                <span className="text-xs sm:text-sm font-black tracking-tight">
                  READY TO PLAY BALL
                </span>
                <span className="px-2 py-0.5 rounded bg-[#06C755] text-white text-[10px] font-black tracking-wider uppercase">
                  LINE MINI APP
                </span>
              </div>
              <div className="p-5 sm:p-7 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
                <div className="space-y-1.5 max-w-xl">
                  <h3 className="text-lg sm:text-xl font-black tracking-tight text-foreground">
                    iScoreCloud LINEミニアプリで始める
                  </h3>
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground leading-relaxed">
                    スマートフォンからはLINEアプリで直接起動、PCからはQRコード表示またはブラウザ上の体験デモをすぐにご覧いただけます。
                  </p>
                </div>
                <OpenLineMiniAppButton
                  variant="hero"
                  showQrTrigger
                  className="w-full md:w-auto [&>a]:flex-1 md:[&>a]:flex-initial shrink-0"
                />
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ミニマル・ソリッドフッター */}
      <footer className="border-t border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
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
              href="/liff"
              id="footer-miniapp-link"
              className="hover:text-foreground transition-colors"
            >
              LINEミニアプリ
            </Link>
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