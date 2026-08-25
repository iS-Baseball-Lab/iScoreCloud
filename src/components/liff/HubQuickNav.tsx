// filepath: src/components/liff/HubQuickNav.tsx
"use client";

import React from "react";
import { Video, Calendar, Trophy, MapPin, Car, ClipboardList, FileText, HelpCircle } from "lucide-react";

export function HubQuickNav() {
  return (
    <div className="space-y-2.5">
      <h3 className="text-xs font-black text-foreground px-1 tracking-tight">
        クイックメニュー
      </h3>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
              試合動画・スコア
            </p>
          </div>
        </a>

        {/* 📅 予定 & お当番表 */}
        <a
          href="/liff/schedule"
          className="flex flex-col justify-between p-4 rounded-2xl bg-card border border-border shadow-xs hover:border-primary/50 hover:shadow-md transition-all active:scale-[0.98] group"
        >
          <div className="flex items-center justify-between">
            <span className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black">
              <ClipboardList className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </span>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600">
              予定
            </span>
          </div>
          <div className="mt-3">
            <h4 className="text-sm font-black text-foreground tracking-tight">
              予定 & お当番表
            </h4>
            <p className="text-[11px] font-bold text-muted-foreground mt-0.5">
              出欠・当番の確認
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
              アクセス・駐車場ルール
            </p>
          </div>
        </a>

        {/* ❓ よくある質問 (Q&A) */}
        <a
          href="/liff/faq"
          className="flex flex-col justify-between p-4 rounded-2xl bg-card border border-border shadow-xs hover:border-primary/50 hover:shadow-md transition-all active:scale-[0.98] group"
        >
          <div className="flex items-center justify-between">
            <span className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center font-black">
              <HelpCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </span>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600">
              FAQ
            </span>
          </div>
          <div className="mt-3">
            <h4 className="text-sm font-black text-foreground tracking-tight">
              よくある質問 (Q&A)
            </h4>
            <p className="text-[11px] font-bold text-muted-foreground mt-0.5">
              雨天連絡・当番の疑問
            </p>
          </div>
        </a>

        {/* 📄 資料ダウンロード */}
        <a
          href="/liff/documents"
          className="flex flex-col justify-between p-4 rounded-2xl bg-card border border-border shadow-xs hover:border-primary/50 hover:shadow-md transition-all active:scale-[0.98] group"
        >
          <div className="flex items-center justify-between">
            <span className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-black">
              <FileText className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </span>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600">
              書類
            </span>
          </div>
          <div className="mt-3">
            <h4 className="text-sm font-black text-foreground tracking-tight">
              資料ダウンロード
            </h4>
            <p className="text-[11px] font-bold text-muted-foreground mt-0.5">
              規約・配車マニュアル
            </p>
          </div>
        </a>
      </div>
    </div>
  );
}
