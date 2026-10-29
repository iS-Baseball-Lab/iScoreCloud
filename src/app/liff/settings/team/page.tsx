// filepath: src/app/liff/settings/team/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { 
  Users, 
  ShieldCheck, 
  Sliders, 
  MapPin, 
  Car, 
  SendHorizontal, 
  Check, 
  Save, 
  ChevronRight, 
  Sparkles,
  Layers,
  Info,
  Calendar,
  Building,
  Bell,
  BookOpen
} from "lucide-react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { useLiff } from "@/components/liff/LiffProvider";
import { toast } from "sonner";

const ORGANIZATION_CATEGORIES = [
  { id: "gakudou", label: "学童・少年野球 (小学生)" },
  { id: "junior_high", label: "中学軟式・シニア・ボーイズ" },
  { id: "high_school", label: "高校・ユース" },
  { id: "general_rubber", label: "一般軟式・草野球" },
  { id: "general_hard", label: "一般硬式・大学・社会人" },
];

export default function LiffTeamSettingsPage() {
  const { currentTeam } = useLiff();

  // チーム基本情報ステート
  const [teamName, setTeamName] = useState(currentTeam?.name || "東京ジャイアンツ");
  const [category, setCategory] = useState("gakudou");

  // 活動区分・班設定
  const [targetGroups, setTargetGroups] = useState<string[]>(["全体", "Aチーム", "Bチーム", "高学年", "低学年"]);
  const [newGroupInput, setNewGroupInput] = useState("");

  // 初期ロード
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (currentTeam?.name) setTeamName(currentTeam.name);

    try {
      const savedGroups = localStorage.getItem(`iscore_team_target_groups_${currentTeam?.id || "default"}`);
      if (savedGroups) {
        const parsed = JSON.parse(savedGroups);
        if (Array.isArray(parsed) && parsed.length > 0) setTargetGroups(parsed);
      }

      const savedCategory = localStorage.getItem(`iscore_team_category_${currentTeam?.id || "default"}`);
      if (savedCategory) setCategory(savedCategory);
    } catch (e) {
      console.error("Failed to load team settings", e);
    }
  }, [currentTeam?.id, currentTeam?.name]);

  const saveSetting = (key: string, value: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(key, value);
    }
  };

  const handleSaveAll = () => {
    const tid = currentTeam?.id || "default";
    saveSetting(`iscore_team_name_${tid}`, teamName);
    saveSetting(`iscore_team_category_${tid}`, category);
    saveSetting(`iscore_team_target_groups_${tid}`, JSON.stringify(targetGroups));
    toast.success("チーム設定を保存しました");
  };

  const handleAddGroup = () => {
    const trimmed = newGroupInput.trim();
    if (!trimmed) return;
    if (targetGroups.includes(trimmed)) {
      toast.error("既に同じ名前のグループがあります");
      return;
    }
    const updated = [...targetGroups, trimmed];
    setTargetGroups(updated);
    setNewGroupInput("");
    saveSetting(`iscore_team_target_groups_${currentTeam?.id || "default"}`, JSON.stringify(updated));
    toast.success(`「${trimmed}」を追加しました`);
  };

  const handleRemoveGroup = (name: string) => {
    if (name === "全体") {
      toast.error("「全体」は削除できません");
      return;
    }
    const updated = targetGroups.filter((g) => g !== name);
    setTargetGroups(updated);
    saveSetting(`iscore_team_target_groups_${currentTeam?.id || "default"}`, JSON.stringify(updated));
    toast.success(`「${name}」を削除しました`);
  };

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader
        shareData={{
          title: "チーム設定 - iScore for LINEミニアプリ",
          text: "チーム基本情報・競技規定・各種マスタ設定",
        }}
      />

      <div className="p-4 space-y-4 max-w-lg mx-auto w-full">
        <LiffPageHeader
          title="チーム設定"
          subtitle="チーム情報・活動班・マスタ管理・LINE連携"
          icon={
            <span className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black">
              <ShieldCheck className="w-4 h-4" />
            </span>
          }
          showBack
        />

        {/* ━━━ セクション 1: 🛡️ チーム基本情報 ━━━ */}
        <section className="rounded-3xl bg-card border-2 border-primary/20 p-4 space-y-3.5 shadow-sm">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-black text-foreground">チーム基本情報</h2>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              ID: {currentTeam?.id || "team_1"}
            </span>
          </div>

          {/* チーム名 */}
          <div className="space-y-1">
            <label className="text-xs font-black text-foreground">チーム名称</label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="チーム名を入力"
              className="w-full px-3 py-2 rounded-xl bg-muted/30 border border-border/80 text-xs font-bold text-foreground focus:outline-hidden focus:border-primary"
            />
          </div>

          {/* 年代・所属カテゴリ */}
          <div className="space-y-1">
            <label className="text-xs font-black text-foreground">所属カテゴリー（年代区分）</label>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                // カテゴリに応じてスコア設定の規定イニング初期値を最適化
                const nextInnings =
                  e.target.value === "gakudou"
                    ? 6
                    : e.target.value === "high_school" ||
                      e.target.value === "general_hard"
                    ? 9
                    : 7;
                saveSetting("iscore_setting_default_innings", String(nextInnings));
              }}
              className="w-full px-3 py-2 rounded-xl bg-muted/30 border border-border/80 text-xs font-bold text-foreground focus:outline-hidden focus:border-primary"
            >
              {ORGANIZATION_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground font-bold">
              ※ 規定イニング・コールド・守備表記などの詳細な試合規定は「スコア設定」から変更できます
            </p>
          </div>
        </section>

        {/* ━━━ セクション 2: 👥 活動グループ（班分け） ━━━ */}
        <section className="rounded-3xl bg-card border-2 border-primary/20 p-4 space-y-3.5 shadow-sm">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-black text-foreground">活動グループ（チーム区分）</h2>
            </div>
            <span className="text-[10px] font-bold text-muted-foreground">予定作成時に選択可能</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {targetGroups.map((group) => (
              <span
                key={group}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-muted/60 border border-border/80 text-xs font-black text-foreground"
              >
                <span>{group}</span>
                {group !== "全体" && (
                  <button
                    type="button"
                    onClick={() => handleRemoveGroup(group)}
                    className="text-muted-foreground hover:text-rose-500 font-bold ml-0.5 cursor-pointer"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={newGroupInput}
              onChange={(e) => setNewGroupInput(e.target.value)}
              placeholder="新しい区分 (例: ジュニア組, Cチーム)"
              className="flex-1 px-3 py-1.5 rounded-xl bg-muted/30 border border-border/80 text-xs font-bold text-foreground focus:outline-hidden focus:border-primary"
            />
            <button
              type="button"
              onClick={handleAddGroup}
              className="py-1.5 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-black active:scale-95 transition-all cursor-pointer"
            >
              追加
            </button>
          </div>
        </section>

        {/* ━━━ セクション 4: 🏟️ 各種マスタ管理へのクイックアクセス ━━━ */}
        <section className="space-y-2.5">
          <p className="text-[11px] font-black text-muted-foreground uppercase tracking-widest pl-1">
            チームマスタ管理（専用画面）
          </p>

          <Link
            href="/liff/settings/score"
            className="p-3.5 rounded-2xl bg-card border-2 border-indigo-500/35 hover:border-indigo-500/60 shadow-xs flex items-center gap-3 group active:scale-98 transition-all"
          >
            <span className="w-10 h-10 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
              <BookOpen className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-foreground truncate">
                スコア設定（試合規定・記号早見表）
              </p>
              <p className="text-[10px] text-muted-foreground font-bold truncate">
                規定イニング・コールド・守備表記・AI読取の早見表登録
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          </Link>

          <div className="grid grid-cols-2 gap-2.5">
            <Link
              href="/liff/grounds"
              className="p-3.5 rounded-2xl bg-card border border-border/80 hover:border-emerald-500/50 shadow-xs flex items-center gap-3 group active:scale-95 transition-all"
            >
              <span className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                <MapPin className="w-5 h-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-foreground truncate">球場 & 施設</p>
                <p className="text-[10px] text-muted-foreground font-bold truncate">ホーム・練習場</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </Link>

            <Link
              href="/liff/carpool"
              className="p-3.5 rounded-2xl bg-card border border-border/80 hover:border-blue-500/50 shadow-xs flex items-center gap-3 group active:scale-95 transition-all"
            >
              <span className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                <Car className="w-5 h-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-foreground truncate">配車 & 登録車両</p>
                <p className="text-[10px] text-muted-foreground font-bold truncate">乗車割り・定員</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </Link>
          </div>
        </section>

        {/* ━━━ セクション 5: 🔔 LINE通知・連携ステータス ━━━ */}
        <section className="rounded-3xl bg-card border-2 border-primary/20 p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-sm font-black text-foreground">LINE速報配信・通知連携</h2>
            </div>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
              連携稼働中
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-muted/40 border border-border/60 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-muted-foreground">配信先LINEグループ</span>
              <span className="text-foreground font-black">チーム連絡網 (公式)</span>
            </div>
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-muted-foreground">試合速報自動配信</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-black">有効 (イニング毎)</span>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground font-bold">
            ※ LINEグループの変更やBot設定はWeb管理画面（ダッシュボード）から実施できます
          </p>
        </section>

        {/* 💾 一括保存ボタン */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleSaveAll}
            className="w-full py-3.5 px-4 rounded-2xl bg-primary text-primary-foreground font-black text-xs shadow-md shadow-primary/25 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>チーム設定を保存する</span>
          </button>
        </div>

        <div className="h-8 w-full shrink-0" aria-hidden="true" />
      </div>
    </div>
  );
}
