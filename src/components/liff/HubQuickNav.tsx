// filepath: src/components/liff/HubQuickNav.tsx
"use client";

import React from "react";
import { Video, Calendar, BarChart3, MapPin, Car, Users, ClipboardList, Trophy } from "lucide-react";
import { LiffViewMode } from "./HubHeroCard";

interface HubQuickNavProps {
  viewMode: LiffViewMode;
}

export function HubQuickNav({ viewMode }: HubQuickNavProps) {
  if (viewMode === "parent") {
    // 👨‍👩‍👧 保護者向けクイックメニュー
    return (
      <div className="space-y-2">
        <h3 className="text-xs font-black text-foreground px-1 tracking-tight">
          保護者メニュー
        </h3>

        <div className="grid grid-cols-2 gap-3">
          {/* 🚗 配車表・集合案内 */}
          <a
            href="/liff/carpool"
            className="flex flex-col justify-between p-4 rounded-2xl bg-card border border-border shadow-xs hover:border-primary/50 hover:shadow-md transition-all active:scale-[0.98] group"
          >
            <div className="flex items-center justify-between">
              <span className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black">
                <Car className="w-5 h-5 group-hover:scale-110 transition-transform" />
              </span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600">
                送迎
              </span>
            </div>
            <div className="mt-3">
              <h4 className="text-sm font-black text-foreground tracking-tight">
                配車表 & 集合案内
              </h4>
              <p className="text-[11px] font-bold text-muted-foreground mt-0.5">
                乗車割り・集合時間
              </p>
            </div>
          </a>

          {/* 📹 試合動画 & スコア */}
          <a
            href="/liff/matches"
            className="flex flex-col justify-between p-4 rounded-2xl bg-card border border-border shadow-xs hover:border-primary/50 hover:shadow-md transition-all active:scale-[0.98] group"
          >
            <div className="flex items-center justify-between">
              <span className="w-10 h-10 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center font-black">
                <Video className="w-5 h-5 group-hover:scale-110 transition-transform" />
              </span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-500/10 text-red-600">
                動画
              </span>
            </div>
            <div className="mt-3">
              <h4 className="text-sm font-black text-foreground tracking-tight">
                試合動画 & スコア
              </h4>
              <p className="text-[11px] font-bold text-muted-foreground mt-0.5">
                我が子の活躍・試合結果
              </p>
            </div>
          </a>

          {/* 📅 予定 & 当番表 */}
          <a
            href="/liff/schedule"
            className="flex flex-col justify-between p-4 rounded-2xl bg-card border border-border shadow-xs hover:border-primary/50 hover:shadow-md transition-all active:scale-[0.98] group"
          >
            <div className="flex items-center justify-between">
              <span className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black">
                <ClipboardList className="w-5 h-5 group-hover:scale-110 transition-transform" />
              </span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600">
                出欠
              </span>
            </div>
            <div className="mt-3">
              <h4 className="text-sm font-black text-foreground tracking-tight">
                予定 & お当番表
              </h4>
              <p className="text-[11px] font-bold text-muted-foreground mt-0.5">
                出欠一覧・当番の確認
              </p>
            </div>
          </a>

          {/* 🗺️ 球場 & 駐車場MAP */}
          <a
            href="/liff/grounds"
            className="flex flex-col justify-between p-4 rounded-2xl bg-card border border-border shadow-xs hover:border-primary/50 hover:shadow-md transition-all active:scale-[0.98] group"
          >
            <div className="flex items-center justify-between">
              <span className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black">
                <MapPin className="w-5 h-5 group-hover:scale-110 transition-transform" />
              </span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">
                MAP
              </span>
            </div>
            <div className="mt-3">
              <h4 className="text-sm font-black text-foreground tracking-tight">
                駐車場 & 球場案内
              </h4>
              <p className="text-[11px] font-bold text-muted-foreground mt-0.5">
                アクセス・グラウンド情報
              </p>
            </div>
          </a>
        </div>
      </div>
    );
  }

  // 👦 選手向けクイックメニュー
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-black text-foreground px-1 tracking-tight">
        選手メニュー
      </h3>

      <div className="grid grid-cols-2 gap-3">
        {/* 📹 試合動画 & スコア */}
        <a
          href="/liff/matches"
          className="flex flex-col justify-between p-4 rounded-2xl bg-card border border-border shadow-xs hover:border-primary/50 hover:shadow-md transition-all active:scale-[0.98] group"
        >
          <div className="flex items-center justify-between">
            <span className="w-10 h-10 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center font-black">
              <Video className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </span>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-500/10 text-red-600">
              動画
            </span>
          </div>
          <div className="mt-3">
            <h4 className="text-sm font-black text-foreground tracking-tight">
              試合動画 & スコア
            </h4>
            <p className="text-[11px] font-bold text-muted-foreground mt-0.5">
              試合ハイライト・結果
            </p>
          </div>
        </a>

        {/* 📅 予定 & 出欠 */}
        <a
          href="/liff/schedule"
          className="flex flex-col justify-between p-4 rounded-2xl bg-card border border-border shadow-xs hover:border-primary/50 hover:shadow-md transition-all active:scale-[0.98] group"
        >
          <div className="flex items-center justify-between">
            <span className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black">
              <Calendar className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </span>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              日程
            </span>
          </div>
          <div className="mt-3">
            <h4 className="text-sm font-black text-foreground tracking-tight">
              予定 & 出欠管理
            </h4>
            <p className="text-[11px] font-bold text-muted-foreground mt-0.5">
              試合・練習スケジュール
            </p>
          </div>
        </a>

        {/* 📊 成績 & ランキング */}
        <a
          href="/liff/stats"
          className="flex flex-col justify-between p-4 rounded-2xl bg-card border border-border shadow-xs hover:border-primary/50 hover:shadow-md transition-all active:scale-[0.98] group"
        >
          <div className="flex items-center justify-between">
            <span className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black">
              <Trophy className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </span>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600">
              成績
            </span>
          </div>
          <div className="mt-3">
            <h4 className="text-sm font-black text-foreground tracking-tight">
              成績 & ランキング
            </h4>
            <p className="text-[11px] font-bold text-muted-foreground mt-0.5">
              チーム勝率・個人成績
            </p>
          </div>
        </a>

        {/* 🗺️ 球場マップ */}
        <a
          href="/liff/grounds"
          className="flex flex-col justify-between p-4 rounded-2xl bg-card border border-border shadow-xs hover:border-primary/50 hover:shadow-md transition-all active:scale-[0.98] group"
        >
          <div className="flex items-center justify-between">
            <span className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black">
              <MapPin className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </span>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">
              MAP
            </span>
          </div>
          <div className="mt-3">
            <h4 className="text-sm font-black text-foreground tracking-tight">
              球場グラウンド案内
            </h4>
            <p className="text-[11px] font-bold text-muted-foreground mt-0.5">
              集合場所・アクセス
            </p>
          </div>
        </a>
      </div>
    </div>
  );
}
