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
          title: "アプリ設定 - iScore for LINEミニアプリ",
          text: "カラーテーマ・デザインスタイル・表示サイズのカスタマイズ設定",
        }}
      />

      <div className="p-4 space-y-4 max-w-lg mx-auto w-full">
        <LiffPageHeader
          title="アプリ設定"
          subtitle="カラー・デザイン・表示サイズ・システム管理"
          icon={
            <span className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black">
              <Settings className="w-4 h-4" />
            </span>
          }
          showBack
          shareData={{
            title: "アプリ設定 - iScore for LINEミニアプリ",
            text: "カラーテーマ・デザインスタイル・表示サイズのカスタマイズ設定",
          }}
        />

        {/* ━━━ ショートカット: 👤 プロフィール設定はこちら ━━━ */}
        <Link
          href="/liff/profile"
          className="p-4 rounded-3xl bg-card border-2 border-primary/30 hover:border-primary/60 transition-all flex items-center justify-between group active:scale-[0.99] shadow-sm"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-2xl bg-primary/15 text-primary flex items-center justify-center font-black shrink-0 group-hover:scale-105 transition-transform">
              <UserCircle className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-black text-foreground truncate">
                プロフィール・個人設定はこちら
              </p>
              <p className="text-[10px] text-muted-foreground font-bold truncate">
                チーム内表示名・役割・お子様紐付け・マイカー登録
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-primary group-hover:translate-x-1 transition-transform shrink-0" />
        </Link>

        {/* ━━━ セクション 1: 🎨 表示・デザイン設定 ━━━ */}
        <section className="rounded-3xl bg-card border-2 border-primary/20 p-4 space-y-5 shadow-sm">
          <div className="flex items-center gap-2 pb-2 border-b border-border/60">
            <Palette className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-black text-foreground">表示・デザイン設定</h2>
          </div>

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
                        ? "bg-primary text-primary-foreground border-primary shadow-xs font-black"
                        : "bg-muted/50 border-border/60 text-muted-foreground hover:text-foreground font-bold"
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
                        ? "bg-primary text-primary-foreground border-primary shadow-xs font-black"
                        : "bg-muted/50 border-border/60 text-muted-foreground hover:text-foreground font-bold"
                    }`}
                  >
                    <Icon className="w-4 h-4 mb-0.5" />
                    <span className="text-xs leading-tight">{opt.label}</span>
                    <span
                      className={`text-[9.5px] leading-tight ${
                        isActive ? "text-primary-foreground/85" : "text-muted-foreground"
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
                        ? "bg-primary text-primary-foreground border-primary shadow-xs font-black"
                        : "bg-muted/50 border-border/60 text-muted-foreground hover:text-foreground font-bold"
                    }`}
                  >
                    <Icon className="w-4 h-4 mb-1" />
                    <span className="text-xs">{mode.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ━━━ セクション 2: 📘 スコア設定・🛡️ チーム設定へのショートカット案内 ━━━ */}
        <Link
          href="/liff/settings/score"
          className="p-4 rounded-3xl bg-indigo-500/10 border-2 border-indigo-500/35 hover:border-indigo-500/60 transition-all flex items-center justify-between group active:scale-[0.99] shadow-xs"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black shadow-xs group-hover:scale-105 transition-transform shrink-0">
              <BookOpen className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-black text-foreground truncate">
                スコア設定はこちら
              </p>
              <p className="text-[10px] text-muted-foreground font-bold truncate">
                規定イニング・コールド・守備表記・スコア記号早見表の登録
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-indigo-600 dark:text-indigo-400 group-hover:translate-x-1 transition-transform shrink-0" />
        </Link>

        <Link
          href="/liff/settings/team"
          className="p-4 rounded-3xl bg-primary/10 border-2 border-primary/30 hover:border-primary/60 transition-all flex items-center justify-between group active:scale-[0.99] shadow-xs"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-black shadow-xs group-hover:scale-105 transition-transform shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-black text-foreground truncate">
                チーム設定はこちら
              </p>
              <p className="text-[10px] text-muted-foreground font-bold truncate">
                チーム基本情報・活動班・球場マスタ・LINE連携
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-primary group-hover:translate-x-1 transition-transform shrink-0" />
        </Link>

        {/* ━━━ セクション 3: 💾 システム・キャッシュ管理 ━━━ */}
        <section className="rounded-3xl bg-card border-2 border-primary/20 p-4 space-y-3.5 shadow-sm">
          <div className="flex items-center gap-2 pb-2 border-b border-border/60">
            <Layers className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-black text-foreground">システム & データ管理</h2>
          </div>

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
              className="py-2 px-3 rounded-2xl bg-muted hover:bg-muted/80 active:scale-95 text-xs font-black text-foreground border border-border transition-all flex items-center gap-1 shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>クリア</span>
            </button>
          </div>

          <div className="pt-2 border-t border-border/50 flex items-center justify-between text-xs">
            <span className="font-bold text-muted-foreground">アプリバージョン</span>
            <span className="font-black text-foreground">iScore for LINEミニアプリ v2.6.0</span>
          </div>
        </section>

        {/* ━━━ セクション 4: 📜 法務・ヘルプ ━━━ */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center text-xs">
          <Link
            href="/liff/rules"
            className="p-3 rounded-2xl bg-card border border-border/60 hover:border-amber-500/40 font-bold text-muted-foreground hover:text-foreground transition-all flex flex-col items-center gap-1 shadow-xs"
          >
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span>ルール & 注意事項</span>
          </Link>

          <Link
            href="/liff/faq"
            className="p-3 rounded-2xl bg-card border border-border/60 hover:border-primary/40 font-bold text-muted-foreground hover:text-foreground transition-all flex flex-col items-center gap-1 shadow-xs"
          >
            <HelpCircle className="w-4 h-4 text-primary" />
            <span>よくある質問</span>
          </Link>

          <Link
            href="/liff/links"
            className="p-3 rounded-2xl bg-card border border-border/60 hover:border-sky-500/40 font-bold text-muted-foreground hover:text-foreground transition-all flex flex-col items-center gap-1 shadow-xs"
          >
            <Link2 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <span>関連リンク集</span>
          </Link>

          <Link
            href="/liff/terms"
            className="p-3 rounded-2xl bg-card border border-border/60 hover:border-primary/40 font-bold text-muted-foreground hover:text-foreground transition-all flex flex-col items-center gap-1 shadow-xs"
          >
            <FileText className="w-4 h-4 text-primary" />
            <span>サービス利用規約</span>
          </Link>

          <Link
            href="/liff/privacy"
            className="p-3 rounded-2xl bg-card border border-border/60 hover:border-primary/40 font-bold text-muted-foreground hover:text-foreground transition-all flex flex-col items-center gap-1 shadow-xs"
          >
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span>プライバシー</span>
          </Link>
        </div>

        <div className="h-8 w-full shrink-0" aria-hidden="true" />
      </div>
    </div>
  );
}
