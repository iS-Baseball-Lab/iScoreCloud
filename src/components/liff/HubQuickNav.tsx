// filepath: src/components/liff/HubQuickNav.tsx
"use client";

import React from "react";
import Link from "next/link";
import { Calendar, Car, FileText, HelpCircle, LayoutGrid } from "lucide-react";

export function HubQuickNav() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 px-1">
        <LayoutGrid className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-black text-foreground tracking-tight">
          クイックメニュー
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* ❓ よくある質問 */}
        <Link
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
          <div className="mt-3.5 space-y-0.5">
            <h4 className="text-base font-black text-foreground tracking-tight">
              よくある質問
            </h4>
            <p className="text-xs font-bold text-muted-foreground">
              雨天連絡・当番の疑問
            </p>
          </div>
        </Link>

        {/* 📄 資料ダウンロード */}
        <Link
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
          <div className="mt-3.5 space-y-0.5">
            <h4 className="text-base font-black text-foreground tracking-tight">
              資料ダウンロード
            </h4>
            <p className="text-xs font-bold text-muted-foreground">
              規約・配車マニュアル
            </p>
          </div>
        </Link>

        {/* 📅 予定 & 欠席 (出欠) */}
        <Link
          href="/liff/schedule"
          className="flex flex-col justify-between p-4 rounded-2xl bg-card border border-border shadow-xs hover:border-primary/50 hover:shadow-md transition-all active:scale-[0.98] group"
        >
          <div className="flex items-center justify-between">
            <span className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black">
              <Calendar className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </span>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600">
              予定
            </span>
          </div>
          <div className="mt-3.5 space-y-0.5">
            <h4 className="text-base font-black text-foreground tracking-tight">
              予定 & 欠席
            </h4>
            <p className="text-xs font-bold text-muted-foreground">
              当番・出欠の確認
            </p>
          </div>
        </Link>

        {/* 🚗 配車表 */}
        <Link
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
          <div className="mt-3.5 space-y-0.5">
            <h4 className="text-base font-black text-foreground tracking-tight">
              配車表
            </h4>
            <p className="text-xs font-bold text-muted-foreground">
              乗車割り・集合時間
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
