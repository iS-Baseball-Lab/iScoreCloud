// filepath: src/app/liff/settings/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  Settings,
  UserCircle,
  Palette,
  Sun,
  Moon,
  Laptop,
  RefreshCw,
  ChevronRight,
  HelpCircle,
  FileText,
  ShieldCheck,
  AlertTriangle,
  Layers,
  Link2,
  Square,
  RectangleHorizontal,
  AppWindow,
  Circle,
  Shrink,
  Smartphone,
  Monitor,
  Maximize,
  Check,
  BookOpen,
} from "lucide-react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { QuickMenuSettingsSection } from "@/components/liff/QuickMenuSettingsSection";
import { BottomNavSettingsSection } from "@/components/liff/BottomNavSettingsSection";
import { useDensity, type Density } from "@/components/providers/density-provider";
import {
  LIFF_COLOR_THEMES,
  LIFF_DESIGN_STYLES,
  LIFF_THEME_CHANGE_EVENT,
  applyLiffColorTheme,
  applyLiffDesignStyle,
  syncLiffThemeClasses,
  type LiffColorThemeId,
  type LiffDesignStyleId,
} from "@/lib/liff/theme-settings";
import { toast } from "sonner";

const DESIGN_ICONS: Record<LiffDesignStyleId, React.ComponentType<{ className?: string }>> = {
  sharp: Square,
  sleek: RectangleHorizontal,
  modern: AppWindow,
  rounded: Circle,
};

const DENSITY_OPTIONS: ReadonlyArray<{
  id: Density;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "ultra", label: "高密度", desc: "情報量重視", icon: Shrink },
  { id: "compact", label: "コンパクト", desc: "やや小さめ", icon: Smartphone },
  { id: "standard", label: "標準", desc: "おすすめ", icon: Monitor },
  { id: "comfortable", label: "大きめ", desc: "屋外で見やすい", icon: Maximize },
];

export default function LiffSettingsPage() {
  const { theme, setTheme } = useTheme();
  const { density, setDensity } = useDensity();

  const [activeColor, setActiveColor] = useState<LiffColorThemeId>("blue");
  const [activeDesign, setActiveDesign] = useState<LiffDesignStyleId>("modern");

  useEffect(() => {
    const sync = () => {
      const current = syncLiffThemeClasses();
      setActiveColor(current.color);
      setActiveDesign(current.design);
    };
    sync();
    window.addEventListener(LIFF_THEME_CHANGE_EVENT, sync);
    return () => window.removeEventListener(LIFF_THEME_CHANGE_EVENT, sync);
  }, []);

  // キャッシュクリア処理
  const handleClearCache = () => {
    if (typeof window === "undefined") return;
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith("iscore_temp_") ||
            key === "iscore_setting_default_tab" ||
            key === "iscore_setting_font_scale" ||
            key === "iscore_setting_haptics" ||
            key === "iscore_setting_theme_color" ||
            key === "iscore_setting_children")
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
      toast.success("一時キャッシュをクリアしました");
    } catch {
      toast.error("キャッシュのクリアに失敗しました");
    }
  };

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader
        shareData={{
          title: "画面・メニュー設定 - iScoreCloud LINEミニアプリ",
          text: "クイックメニュー・下部ナビ・カラーテーマ・表示サイズのカスタマイズ設定",
        }}
      />

      <div className="p-4 space-y-4 max-w-lg mx-auto w-full">
        <LiffPageHeader
          title="画面・メニュー設定"
          subtitle="ホーム・下部ナビ・カラー・表示サイズ"
          icon={
            <span className="w-8 h-8 rounded-xl bg-slate-500/12 text-slate-700 dark:text-slate-300 flex items-center justify-center font-black">
              <Settings className="w-4 h-4" />
            </span>
          }
          showBack
          shareData={{
            title: "画面・メニュー設定 - iScoreCloud LINEミニアプリ",
            text: "クイックメニュー・下部ナビ・カラーテーマ・表示サイズのカスタマイズ設定",
          }}
        />

        {/* ━━━ ショートカット: 👤 マイプロフィールはこちら ━━━ */}
        <Link
          href="/liff/profile"
          className="p-4 rounded-2xl border border-border bg-card shadow-xs hover:border-primary/40 transition-all flex items-center justify-between group active:scale-[0.99]"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-2xl bg-slate-500/12 text-slate-700 dark:text-slate-300 flex items-center justify-center font-black shrink-0 group-hover:scale-105 transition-transform">
              <UserCircle className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-black text-foreground truncate">
                マイプロフィールはこちら
              </p>
              <p className="text-[10px] text-muted-foreground font-bold truncate">
                表示名・お子様紐付け・マイカー登録
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0" />
        </Link>

        {/* ━━━ セクション 1: 🚀 クイックメニュー設定 ━━━ */}
        <QuickMenuSettingsSection />

        {/* ━━━ セクション 2: 📱 ボトムナビ設定 ━━━ */}
        <BottomNavSettingsSection />

        {/* ━━━ セクション 3: 🎨 表示・デザイン設定 ━━━ */}
        <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-primary/20 text-blue-300 border border-primary/40 flex items-center justify-center shrink-0">
              <Palette className="w-4 h-4" />
            </span>
            <h2 className="text-sm font-black text-white">表示・デザイン設定</h2>
          </div>

          <div className="p-4 space-y-5">
            {/* 1. アクセントカラー */}
            <div className="space-y-2">
              <label className="text-xs font-black text-foreground block">
                アクセントカラー
              </label>
              <div className="grid grid-cols-7 gap-1.5 pt-0.5">
                {LIFF_COLOR_THEMES.map((item) => {
                  const isActive = activeColor === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        applyLiffColorTheme(item.id);
                        setActiveColor(item.id);
                        toast.success(`カラーを「${item.label}」に変更しました`);
                      }}
                      className="flex flex-col items-center gap-1 group focus:outline-hidden"
                      title={item.label}
                    >
                      <span
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform active:scale-90 ${
                          isActive
                            ? "ring-2 ring-offset-2 ring-offset-card ring-primary scale-110 shadow-sm"
                            : "opacity-85 hover:opacity-100 hover:scale-105"
                        }`}
                        style={{ backgroundColor: item.color }}
                      >
                        {isActive && <Check className="w-4 h-4 text-white stroke-[3]" />}
                      </span>
                      <span
                        className={`text-[9.5px] leading-none truncate max-w-full ${
                          isActive ? "font-black text-foreground" : "font-bold text-muted-foreground"
                        }`}
                      >
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. デザインスタイル (角丸・枠) */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-foreground block">
                デザインスタイル
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {LIFF_DESIGN_STYLES.map((style) => {
                  const Icon = DESIGN_ICONS[style.id];
                  const isActive = activeDesign === style.id;
                  return (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => {
                        applyLiffDesignStyle(style.id);
                        setActiveDesign(style.id);
                        toast.success(`スタイルを「${style.description}」に変更しました`);
                      }}
                      className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-2xl border transition-all active:scale-95 gap-1 ${
                        isActive
                          ? "bg-primary/12 text-primary border-primary shadow-2xs font-black"
                          : "bg-muted/50 border-border text-muted-foreground hover:text-foreground font-bold"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-[11px] leading-tight">{style.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. 画面サイズ・情報密度 */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-foreground block">
                表示サイズ・情報密度（グラウンド視認性）
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {DENSITY_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isActive = density === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setDensity(opt.id);
                        toast.success(`表示サイズを「${opt.label}」に変更しました`);
                      }}
                      className={`flex flex-col items-center justify-center py-2.5 px-2 rounded-2xl border transition-all active:scale-95 gap-0.5 ${
                        isActive
                          ? "bg-primary/12 text-primary border-primary shadow-2xs font-black"
                          : "bg-muted/50 border-border text-muted-foreground hover:text-foreground font-bold"
                      }`}
                    >
                      <Icon className="w-4 h-4 mb-0.5" />
                      <span className="text-xs leading-tight">{opt.label}</span>
                      <span
                        className={`text-[9.5px] leading-tight ${
                          isActive ? "text-primary/80" : "text-muted-foreground"
                        }`}
                      >
                        {opt.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. 外観モード (ライト / ダーク / 端末連動) */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-foreground block">外観モード</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "light", label: "ライト", icon: Sun },
                  { id: "dark", label: "ダーク", icon: Moon },
                  { id: "system", label: "端末連動", icon: Laptop },
                ].map((mode) => {
                  const Icon = mode.icon;
                  const isActive = theme === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => {
                        setTheme(mode.id);
                        toast.success(`外観を「${mode.label}」に変更しました`);
                      }}
                      className={`flex flex-col items-center justify-center py-2.5 rounded-2xl border transition-all active:scale-95 ${
                        isActive
                          ? "bg-primary/12 text-primary border-primary shadow-2xs font-black"
                          : "bg-muted/50 border-border text-muted-foreground hover:text-foreground font-bold"
                      }`}
                    >
                      <Icon className="w-4 h-4 mb-1" />
                      <span className="text-xs">{mode.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ━━━ セクション 2: 運用・規定（チーム表示・予定設定 / スコア・試合規定）へのショートカット案内 ━━━ */}
        <Link
          href="/liff/settings/team"
          className="p-4 rounded-2xl border border-border bg-card shadow-xs hover:border-primary/40 transition-all flex items-center justify-between group active:scale-[0.99]"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-2xl bg-slate-500/12 text-slate-700 dark:text-slate-300 flex items-center justify-center font-black group-hover:scale-105 transition-transform shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-black text-foreground truncate">
                チーム表示・予定設定はこちら
              </p>
              <p className="text-[10px] text-muted-foreground font-bold truncate">
                ロゴ・背景写真・練習試合呼称・予定の標準時間
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0" />
        </Link>

        <Link
          href="/liff/settings/score"
          className="p-4 rounded-2xl border border-border bg-card shadow-xs hover:border-primary/40 transition-all flex items-center justify-between group active:scale-[0.99]"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-2xl bg-slate-500/12 text-slate-700 dark:text-slate-300 flex items-center justify-center font-black group-hover:scale-105 transition-transform shrink-0">
              <BookOpen className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-black text-foreground truncate">
                スコア・試合規定はこちら
              </p>
              <p className="text-[10px] text-muted-foreground font-bold truncate">
                規定回数・コールド・守備表記・スコア記号早見表の登録
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0" />
        </Link>

        {/* ━━━ セクション 3: 💾 システム・キャッシュ管理 ━━━ */}
        <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-slate-500 px-4 py-3 flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-slate-800 text-slate-200 border border-slate-700 flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4" />
            </span>
            <h2 className="text-sm font-black text-white">システム & データ管理</h2>
          </div>

          <div className="p-4 space-y-3.5">
            <div className="flex items-center justify-between py-1 gap-3">
              <div className="space-y-0.5">
                <span className="text-xs font-black text-foreground block">一時キャッシュのクリア</span>
                <span className="text-[10px] text-muted-foreground font-bold block">
                  表示の不具合や不要な一時データを解消します
                </span>
              </div>

              <button
                type="button"
                onClick={handleClearCache}
                className="py-2 px-3 rounded-2xl bg-card hover:bg-muted active:scale-95 text-xs font-black text-foreground border border-border transition-all flex items-center gap-1 shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>クリア</span>
              </button>
            </div>

            <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
              <span className="font-bold text-muted-foreground">アプリバージョン</span>
              <span className="font-black text-foreground">iScoreCloud LINEミニアプリ v2.6.0</span>
            </div>
          </div>
        </section>

        {/* ━━━ セクション 4: 📜 法務・ヘルプ ━━━ */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center text-xs">
          <Link
            href="/liff/rules"
            className="p-3 rounded-2xl border border-border bg-card shadow-xs hover:border-primary/40 font-bold text-muted-foreground hover:text-foreground transition-all flex flex-col items-center gap-1.5"
          >
            <span className="w-8 h-8 rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </span>
            <span>チームルール・心得</span>
          </Link>

          <Link
            href="/liff/faq"
            className="p-3 rounded-2xl border border-border bg-card shadow-xs hover:border-primary/40 font-bold text-muted-foreground hover:text-foreground transition-all flex flex-col items-center gap-1.5"
          >
            <span className="w-8 h-8 rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <HelpCircle className="w-4 h-4" />
            </span>
            <span>よくある質問</span>
          </Link>

          <Link
            href="/liff/links"
            className="p-3 rounded-2xl border border-border bg-card shadow-xs hover:border-primary/40 font-bold text-muted-foreground hover:text-foreground transition-all flex flex-col items-center gap-1.5"
          >
            <span className="w-8 h-8 rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Link2 className="w-4 h-4" />
            </span>
            <span>関連リンク集</span>
          </Link>

          <Link
            href="/liff/terms"
            className="p-3 rounded-2xl border border-border bg-card shadow-xs hover:border-primary/40 font-bold text-muted-foreground hover:text-foreground transition-all flex flex-col items-center gap-1.5"
          >
            <span className="w-8 h-8 rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </span>
            <span>サービス利用規約</span>
          </Link>

          <Link
            href="/liff/privacy"
            className="p-3 rounded-2xl border border-border bg-card shadow-xs hover:border-primary/40 font-bold text-muted-foreground hover:text-foreground transition-all flex flex-col items-center gap-1.5"
          >
            <span className="w-8 h-8 rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </span>
            <span>プライバシー</span>
          </Link>
        </div>

        <div className="h-8 w-full shrink-0" aria-hidden="true" />
      </div>
    </div>
  );
}
