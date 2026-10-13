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
  Bell
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

  // 試合・競技規定ステート (localStorage保存)
  const [defaultInnings, setDefaultInnings] = useState<number>(7);
  const [mercyRule, setMercyRule] = useState<string>("standard");
  const [positionNotation, setPositionNotation] = useState<"kanji" | "number" | "english">("kanji");
  const [dhDefault, setDhDefault] = useState<boolean>(false);

  // 活動区分・班設定
  const [targetGroups, setTargetGroups] = useState<string[]>(["全体", "Aチーム", "Bチーム", "高学年", "低学年"]);
  const [newGroupInput, setNewGroupInput] = useState("");
  const [dutyGroups, setDutyGroups] = useState<string[]>(["1班", "2班", "3班", "4班", "なし"]);

  // LINE連携状態
  const [lineReportEnabled, setLineReportEnabled] = useState(true);

  // 初期ロード
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (currentTeam?.name) setTeamName(currentTeam.name);

    try {
      const savedInnings = localStorage.getItem("iscore_setting_default_innings");
      if (savedInnings) setDefaultInnings(Number(savedInnings));

      const savedMercy = localStorage.getItem("iscore_setting_mercy_rule");
      if (savedMercy) setMercyRule(savedMercy);

      const savedNotation = localStorage.getItem("iscore_setting_position_notation");
      if (savedNotation) setPositionNotation(savedNotation as any);

      const savedDh = localStorage.getItem("iscore_setting_dh_default");
      if (savedDh !== null) setDhDefault(savedDh === "true");

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
    saveSetting("iscore_setting_default_innings", String(defaultInnings));
    saveSetting("iscore_setting_mercy_rule", mercyRule);
    saveSetting("iscore_setting_position_notation", positionNotation);
    saveSetting("iscore_setting_dh_default", String(dhDefault));
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
    <div className="flex flex-col min-h-screen">
      <LiffHeader
        shareData={{
          title: "チーム設定 - iScoreCloud",
          text: "チーム基本情報・競技規定・各種マスタ設定",
        }}
      />

      <div className="p-4 space-y-4 max-w-lg mx-auto w-full">
        <LiffPageHeader
          title="チーム設定"
          subtitle="チーム情報・競技規定・活動班・マスタ管理"
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
                // カテゴリに応じて規定イニングの初期値を最適化
                if (e.target.value === "gakudou") setDefaultInnings(6);
                else if (e.target.value === "high_school" || e.target.value === "general_hard") setDefaultInnings(9);
                else setDefaultInnings(7);
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
              ※ カテゴリーを変更すると、規定イニング等の初期値が自動連動します
            </p>
          </div>
        </section>

        {/* ━━━ セクション 2: ⚾ 試合・競技規定（所属連盟ルール） ━━━ */}
        <section className="rounded-3xl bg-card border-2 border-primary/20 p-4 space-y-4 shadow-sm">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-black text-foreground">試合ルール・規定初期値</h2>
            </div>
            <span className="text-[10px] font-bold text-muted-foreground">試合作成時に反映</span>
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
                  className={`py-2 px-1 rounded-2xl text-xs font-bold transition-all active:scale-95 border cursor-pointer ${
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
                  className={`py-2 px-1 rounded-2xl text-xs font-bold transition-all active:scale-95 border cursor-pointer ${
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

          {/* 守備位置表記 */}
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
                  className={`py-2 px-1 rounded-2xl text-xs font-bold transition-all active:scale-95 border cursor-pointer ${
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
              <p className="text-[10px] text-muted-foreground font-bold">新規試合作成時にDH制をデフォルトでON</p>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = !dhDefault;
                setDhDefault(next);
                saveSetting("iscore_setting_dh_default", String(next));
              }}
              className={`w-12 h-6 rounded-full transition-colors relative p-0.5 cursor-pointer ${
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

        {/* ━━━ セクション 3: 👥 活動グループ（班分け） ━━━ */}
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
      </div>
    </div>
  );
}
