// filepath: src/components/liff/HubQuickNav.tsx
"use client";

import React from "react";
import Link from "next/link";
import { 
  FileText, 
  HelpCircle, 
  Car, 
  AlertTriangle,
  Calendar,
  Sparkles,
  Link2,
} from "lucide-react";

export function HubQuickNav() {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-black text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span>チーム情報 & ガイド</span>
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* ⚠️ ルール & 注意事項 */}
        <Link
          href="/liff/rules"
          className="flex flex-col justify-between p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-amber-500/50 transition-all active:scale-[0.98] group ring-1 ring-black/5 dark:ring-white/5"
        >
          <div className="flex items-center justify-between">
            <span className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black shadow-2xs">
              <AlertTriangle className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </span>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 font-mono">
              規程
            </span>
          </div>
          <div className="mt-3.5 space-y-0.5">
            <h4 className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight">
              ルール & 注意事項
            </h4>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
              試合・配車・活動心得
            </p>
          </div>
        </Link>

        {/* ❓ よくある質問 */}
        <Link
          href="/liff/faq"
          className="flex flex-col justify-between p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-teal-500/50 transition-all active:scale-[0.98] group ring-1 ring-black/5 dark:ring-white/5"
        >
          <div className="flex items-center justify-between">
            <span className="w-10 h-10 rounded-xl bg-teal-500/15 text-teal-600 dark:text-teal-400 flex items-center justify-center font-black shadow-2xs">
              <HelpCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </span>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-700 dark:text-teal-300 font-mono">
              FAQ
            </span>
          </div>
          <div className="mt-3.5 space-y-0.5">
            <h4 className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight">
              よくある質問
            </h4>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
              雨天連絡・当番の疑問
            </p>
          </div>
        </Link>

        {/* 📄 資料ダウンロード */}
        <Link
          href="/liff/documents"
          className="flex flex-col justify-between p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-purple-500/50 transition-all active:scale-[0.98] group ring-1 ring-black/5 dark:ring-white/5"
        >
          <div className="flex items-center justify-between">
            <span className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center font-black shadow-2xs">
              <FileText className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </span>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-700 dark:text-purple-300 font-mono">
              書類
            </span>
          </div>
          <div className="mt-3.5 space-y-0.5">
            <h4 className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight">
              資料ダウンロード
            </h4>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
              規約・配車マニュアル
            </p>
          </div>
        </Link>

        {/* 🔗 関連リンク集 */}
        <Link
          href="/liff/links"
          className="flex flex-col justify-between p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-sky-500/50 transition-all active:scale-[0.98] group ring-1 ring-black/5 dark:ring-white/5"
        >
          <div className="flex items-center justify-between">
            <span className="w-10 h-10 rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center font-black shadow-2xs">
              <Link2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </span>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-300 font-mono">
              リンク
            </span>
          </div>
          <div className="mt-3.5 space-y-0.5">
            <h4 className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight">
              関連リンク集
            </h4>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
              連盟・大会速報・SNS
            </p>
          </div>
        </Link>

        {/* 📅 予定 & 出欠 */}
        <Link
          href="/liff/schedule"
          className="flex flex-col justify-between p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-amber-500/50 transition-all active:scale-[0.98] group ring-1 ring-black/5 dark:ring-white/5"
        >
          <div className="flex items-center justify-between">
            <span className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black shadow-2xs">
              <Calendar className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </span>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 font-mono">
              予定
            </span>
          </div>
          <div className="mt-3.5 space-y-0.5">
            <h4 className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight">
              予定 & 出欠
            </h4>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
              当番・出欠の確認
            </p>
          </div>
        </Link>

        {/* 🚗 配車表 */}
        <Link
          href="/liff/carpool"
          className="flex flex-col justify-between p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-blue-500/50 transition-all active:scale-[0.98] group ring-1 ring-black/5 dark:ring-white/5"
        >
          <div className="flex items-center justify-between">
            <span className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black shadow-2xs">
              <Car className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </span>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-300 font-mono">
              送迎
            </span>
          </div>
          <div className="mt-3.5 space-y-0.5">
            <h4 className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight">
              配車表
            </h4>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
              乗車割り・集合場所
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
