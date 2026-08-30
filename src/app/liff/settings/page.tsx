// filepath: src/app/liff/settings/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { 
  Settings, 
  User, 
  Palette, 
  ShieldAlert, 
  Sliders, 
  Check, 
  Sun, 
  Moon, 
  Laptop, 
  Car, 
  Sparkles, 
  CalendarDays, 
  Flame, 
  Trash2, 
  RefreshCw, 
  CheckCircle2, 
  ChevronRight, 
  HelpCircle, 
  FileText, 
  ShieldCheck,
  AlertTriangle,
  Vibrate,
  Layers,
  Type
} from "lucide-react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { useLiff } from "@/components/liff/LiffProvider";
import { toast } from "sonner";

export default function LiffSettingsPage() {
  const { theme, setTheme } = useTheme();
  const { currentTeam } = useLiff();

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 💾 各種設定ステート（localStorage連動）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 1. 個人・利用設定
  const [userRole, setUserRole] = useState<"parent" | "coach" | "player" | "staff">("parent");
  const [children, setChildren] = useState<Array<{ id: string; name: string; uniformNumber?: string }>>([
    { id: "child-1", name: "翔太", uniformNumber: "#10" }
  ]);
  const [defaultCarStatus, setDefaultCarStatus] = useState<"can_drive" | "need_ride" | "not_needed">("need_ride");
  const [defaultTab, setDefaultTab] = useState<"next" | "calendar" | "score">("next");

  // 2. 表示・外観設定
  const [themeColor, setThemeColor] = useState<string>("emerald");
  const [fontSizeScale, setFontSizeScale] = useState<"normal" | "large">("normal");
  const [hapticsEnabled, setHapticsEnabled] = useState<boolean>(true);

  // 3. 試合・スコア入力デフォルト
  const [defaultInnings, setDefaultInnings] = useState<number>(7);
  const [mercyRule, setMercyRule] = useState<string>("standard"); // standard: 3回10点4回7点, loose: 4回10点5回7点, none: なし
  const [positionNotation, setPositionNotation] = useState<"kanji" | "number" | "english">("kanji");
  const [dhDefault, setDhDefault] = useState<boolean>(false);

  // 4. マウント時にローカルストレージから読み込み
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const savedRole = localStorage.getItem("iscore_setting_user_role");
      if (savedRole) setUserRole(savedRole as any);

      const savedChildren = localStorage.getItem("iscore_setting_children");
      if (savedChildren) {
        const parsed = JSON.parse(savedChildren);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setChildren(parsed);
        }
      }

      const savedCar = localStorage.getItem("iscore_setting_default_car");
      if (savedCar) setDefaultCarStatus(savedCar as any);

      const savedTab = localStorage.getItem("iscore_setting_default_tab");
      if (savedTab) setDefaultTab(savedTab as any);

      const savedColor = localStorage.getItem("iscore_setting_theme_color");
      if (savedColor) setThemeColor(savedColor);

      const savedFont = localStorage.getItem("iscore_setting_font_scale");
      if (savedFont) setFontSizeScale(savedFont as any);

      const savedHaptics = localStorage.getItem("iscore_setting_haptics");
      if (savedHaptics !== null) setHapticsEnabled(savedHaptics === "true");

      const savedInnings = localStorage.getItem("iscore_setting_default_innings");
      if (savedInnings) setDefaultInnings(Number(savedInnings));

      const savedMercy = localStorage.getItem("iscore_setting_mercy_rule");
      if (savedMercy) setMercyRule(savedMercy);

      const savedNotation = localStorage.getItem("iscore_setting_position_notation");
      if (savedNotation) setPositionNotation(savedNotation as any);

      const savedDh = localStorage.getItem("iscore_setting_dh_default");
      if (savedDh !== null) setDhDefault(savedDh === "true");
    } catch (e) {
      console.error("Failed to load settings from localStorage", e);
    }
  }, []);

  // 設定保存ヘルパー
  const saveSetting = (key: string, value: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(key, value);
    }
    toast.success("設定を更新しました");
  };

  // キャッシュクリア処理
  const handleClearCache = () => {
    if (typeof window === "undefined") return;
    try {
      // 重要なログイン情報以外の一時データをクリア
      const keysToKeep = ["iscore_user_name", "iscore_token", "iscore_current_team_id"];
      const allKeys = Object.keys(localStorage);
      allKeys.forEach((key) => {
        if (!keysToKeep.includes(key) && key.startsWith("iscore_temp_")) {
          localStorage.removeItem(key);
        }
      });
      toast.success("アプリキャッシュをクリアしました");
    } catch (e) {
      toast.error("キャッシュのクリアに失敗しました");
    }
  };

  const themeColors = [
    { id: "emerald", name: "エメラルド", bg: "bg-emerald-600", border: "border-emerald-500" },
    { id: "blue", name: "オーシャン", bg: "bg-blue-600", border: "border-blue-500" },
    { id: "orange", name: "オレンジ", bg: "bg-orange-600", border: "border-orange-500" },
    { id: "red", name: "クリムゾン", bg: "bg-rose-600", border: "border-rose-500" },
    { id: "purple", name: "バイオレット", bg: "bg-purple-600", border: "border-purple-500" },
  ];

  return (
    <div className="flex flex-col min-h-screen pb-32">
      {/* ヘッダー */}
      <LiffHeader
        shareData={{
          title: "アプリ設定 - iScoreCloud",
          text: "使いやすさ・表示・スコア入力のカスタマイズ設定",
        }}
      />

      <div className="p-4 space-y-6 max-w-lg mx-auto w-full">
        {/* ページタイトル */}
        <div className="flex items-center gap-2 px-1">
          <span className="w-8 h-8 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-black shadow-xs">
            <Settings className="w-4 h-4" />
          </span>
          <div>
            <h1 className="text-lg font-black text-foreground tracking-tight">アプリ設定</h1>
            <p className="text-[11px] font-bold text-muted-foreground">利用環境・表示・スコア入力の個別カスタマイズ</p>
          </div>
        </div>

        {/* ━━━ セクション 1: 👤 個人・利用設定 ━━━ */}
        <section className="rounded-3xl bg-card border-2 border-primary/20 p-4 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 pb-2 border-b border-border/60">
            <User className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-black text-foreground">個人・利用設定</h2>
          </div>

          {/* 立場・役割 */}
          <div className="space-y-1.5">
            <label className="text-xs font-black text-foreground">チームでの立場・役割</label>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { id: "parent", label: "保護者" },
                { id: "coach", label: "指導者" },
                { id: "player", label: "選手" },
                { id: "staff", label: "役員・他" },
              ].map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => {
                    setUserRole(role.id as any);
                    saveSetting("iscore_setting_user_role", role.id);
                  }}
                  className={`py-2 px-1 rounded-2xl text-xs font-bold transition-all active:scale-95 border ${
                    userRole === role.id
                      ? "bg-primary text-primary-foreground border-primary shadow-xs font-black"
                      : "bg-muted/50 border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {role.label}
                </button>
              ))}
            </div>
          </div>

          {/* 👦 保護者の場合: お子様（選手）の登録設定 */}
          {userRole === "parent" && (
            <div className="p-3 rounded-2xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/25 space-y-2.5 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
                  <span>👦</span>
                  <span>お子様（選手）の出欠設定</span>
                </span>
                <span className="text-[10px] font-bold text-amber-700/80 dark:text-amber-300/80">出欠カードに連動表示</span>
              </div>

              <div className="space-y-2">
                {children.map((child, index) => (
                  <div key={child.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={child.name}
                      onChange={(e) => {
                        const newName = e.target.value;
                        setChildren(prev => {
                          const updated = [...prev];
                          updated[index] = { ...updated[index], name: newName };
                          saveSetting("iscore_setting_children", JSON.stringify(updated));
                          return updated;
                        });
                      }}
                      placeholder="お子様のお名前"
                      className="flex-1 px-3 py-1.5 rounded-xl bg-card border border-border/80 text-xs font-bold text-foreground focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                    />
                    <input
                      type="text"
                      value={child.uniformNumber || ""}
                      onChange={(e) => {
                        const newNum = e.target.value;
                        setChildren(prev => {
                          const updated = [...prev];
                          updated[index] = { ...updated[index], uniformNumber: newNum };
                          saveSetting("iscore_setting_children", JSON.stringify(updated));
                          return updated;
                        });
                      }}
                      placeholder="背番号 (例: #10)"
                      className="w-24 px-2.5 py-1.5 rounded-xl bg-card border border-border/80 text-xs font-bold text-foreground focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* デフォルト配車希望 */}
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-black text-foreground">出席時のデフォルト配車希望</label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: "can_drive", label: "🚗 車出し可" },
                { id: "need_ride", label: "🙋 送迎希望" },
                { id: "not_needed", label: "🚶 自走・不要" },
              ].map((car) => (
                <button
                  key={car.id}
                  type="button"
                  onClick={() => {
                    setDefaultCarStatus(car.id as any);
                    saveSetting("iscore_setting_default_car", car.id);
                  }}
                  className={`py-2 px-1 rounded-2xl text-xs font-bold transition-all active:scale-95 border ${
                    defaultCarStatus === car.id
                      ? "bg-primary text-primary-foreground border-primary shadow-xs font-black"
                      : "bg-muted/50 border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {car.label}
                </button>
              ))}
            </div>
          </div>

          {/* トップ初期表示タブ */}
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-black text-foreground">トップページの初期表示タブ</label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: "next", label: "直近の活動", icon: Sparkles },
                { id: "calendar", label: "カレンダー", icon: CalendarDays },
                { id: "score", label: "試合速報", icon: Flame },
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setDefaultTab(tab.id as any);
                      saveSetting("iscore_setting_default_tab", tab.id);
                    }}
                    className={`py-2 px-1 rounded-2xl text-xs font-bold transition-all active:scale-95 border flex flex-col items-center gap-1 ${
                      defaultTab === tab.id
                        ? "bg-primary text-primary-foreground border-primary shadow-xs font-black"
                        : "bg-muted/50 border-border/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ━━━ セクション 2: 🎨 表示・テーマ設定 ━━━ */}
        <section className="rounded-3xl bg-card border-2 border-primary/20 p-4 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 pb-2 border-b border-border/60">
            <Palette className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-black text-foreground">表示・テーマ設定</h2>
          </div>

          {/* 外観テーマ (ライト / ダーク / システム) */}
          <div className="space-y-1.5">
            <label className="text-xs font-black text-foreground">外観モード</label>
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
                      toast.success(`外観を${mode.label}に変更しました`);
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

          {/* 文字サイズ・スケール */}
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-black text-foreground flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5 text-primary" />
              <span>文字サイズ（グラウンド視認性）</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "normal", label: "標準サイズ" },
                { id: "large", label: "大きめ (見やすい)" },
              ].map((scale) => (
                <button
                  key={scale.id}
                  type="button"
                  onClick={() => {
                    setFontSizeScale(scale.id as any);
                    saveSetting("iscore_setting_font_scale", scale.id);
                  }}
                  className={`py-2 px-2 rounded-2xl text-xs font-bold transition-all active:scale-95 border ${
                    fontSizeScale === scale.id
                      ? "bg-primary text-primary-foreground border-primary shadow-xs font-black"
                      : "bg-muted/50 border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {scale.label}
                </button>
              ))}
            </div>
          </div>

          {/* 操作時の振動 (ハプティクス) */}
          <div className="pt-1 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs font-black text-foreground flex items-center gap-1.5">
                <Vibrate className="w-3.5 h-3.5 text-primary" />
                <span>ボタンタップ時の微振動</span>
              </div>
              <p className="text-[10px] text-muted-foreground font-bold">出欠やスコア入力時の感触フィードバック</p>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = !hapticsEnabled;
                setHapticsEnabled(next);
                saveSetting("iscore_setting_haptics", String(next));
                if (next && typeof window !== "undefined" && window.navigator?.vibrate) {
                  window.navigator.vibrate(20);
                }
              }}
              className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
                hapticsEnabled ? "bg-primary" : "bg-muted border border-border"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  hapticsEnabled ? "translate-x-6 shadow-xs" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </section>

        {/* ━━━ セクション 3: ⚾ 試合・スコア入力初期値 ━━━ */}
        <section className="rounded-3xl bg-card border-2 border-primary/20 p-4 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 pb-2 border-b border-border/60">
            <Sliders className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-black text-foreground">試合ルール・スコア初期値</h2>
          </div>

          {/* 規定イニング */}
          <div className="space-y-1.5">
            <label className="text-xs font-black text-foreground">規定イニング数</label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { count: 6, label: "6回 (学童)" },
                { count: 7, label: "7回 (中学・一般)" },
                { count: 9, label: "9回 (高校・大学)" },
              ].map((item) => (
                <button
                  key={item.count}
                  type="button"
                  onClick={() => {
                    setDefaultInnings(item.count);
                    saveSetting("iscore_setting_default_innings", String(item.count));
                  }}
                  className={`py-2 px-1 rounded-2xl text-xs font-bold transition-all active:scale-95 border ${
                    defaultInnings === item.count
                      ? "bg-primary text-primary-foreground border-primary shadow-xs font-black"
                      : "bg-muted/50 border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* コールド規定 */}
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-black text-foreground">コールドゲーム規定</label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: "standard", label: "3回10/4回7点" },
                { id: "loose", label: "4回10/5回7点" },
                { id: "none", label: "コールドなし" },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setMercyRule(m.id);
                    saveSetting("iscore_setting_mercy_rule", m.id);
                  }}
                  className={`py-2 px-1 rounded-2xl text-xs font-bold transition-all active:scale-95 border ${
                    mercyRule === m.id
                      ? "bg-primary text-primary-foreground border-primary shadow-xs font-black"
                      : "bg-muted/50 border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* 守備位置の表示形式 */}
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-black text-foreground">守備位置の表記形式</label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: "kanji", label: "漢字 (投・捕・一)" },
                { id: "number", label: "守備番号 (1・2・3)" },
                { id: "english", label: "英語 (P・C・1B)" },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPositionNotation(p.id as any);
                    saveSetting("iscore_setting_position_notation", p.id);
                  }}
                  className={`py-2 px-1 rounded-2xl text-xs font-bold transition-all active:scale-95 border ${
                    positionNotation === p.id
                      ? "bg-primary text-primary-foreground border-primary shadow-xs font-black"
                      : "bg-muted/50 border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* DH制初期値 */}
          <div className="pt-1 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs font-black text-foreground">DH制（指名打者）初期値</div>
              <p className="text-[10px] text-muted-foreground font-bold">試合作成時にDH制をデフォルトで有効化</p>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = !dhDefault;
                setDhDefault(next);
                saveSetting("iscore_setting_dh_default", String(next));
              }}
              className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
                dhDefault ? "bg-primary" : "bg-muted border border-border"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  dhDefault ? "translate-x-6 shadow-xs" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </section>

        {/* ━━━ セクション 4: 💾 システム・キャッシュ管理 ━━━ */}
        <section className="rounded-3xl bg-card border-2 border-primary/20 p-4 space-y-3.5 shadow-sm">
          <div className="flex items-center gap-2 pb-2 border-b border-border/60">
            <Layers className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-black text-foreground">システム & データ管理</h2>
          </div>

          <div className="flex items-center justify-between py-1">
            <div className="space-y-0.5">
              <span className="text-xs font-black text-foreground block">一時キャッシュのクリア</span>
              <span className="text-[10px] text-muted-foreground font-bold block">
                表示の不具合やデータ同期の遅延を解消します
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
            <span className="font-black text-foreground">iScoreCloud v2.5.0</span>
          </div>
        </section>

        {/* ━━━ セクション 5: 📜 法務・ヘルプ ━━━ */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
          <Link
            href="/liff/rules"
            className="p-3 rounded-2xl bg-card border border-border/60 hover:border-amber-500/40 font-bold text-muted-foreground hover:text-foreground transition-all flex flex-col items-center gap-1 shadow-xs"
          >
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span>チーム注意事項</span>
          </Link>

          <Link
            href="/liff/faq"
            className="p-3 rounded-2xl bg-card border border-border/60 hover:border-primary/40 font-bold text-muted-foreground hover:text-foreground transition-all flex flex-col items-center gap-1 shadow-xs"
          >
            <HelpCircle className="w-4 h-4 text-primary" />
            <span>よくある質問</span>
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
      </div>
    </div>
  );
}
