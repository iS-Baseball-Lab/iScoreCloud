// filepath: src/app/(protected)/team/schedule/page.tsx
"use client";

import React from "react";
import Link from "next/link";
import { MonthlySchedulePlanner } from "@/components/schedule/MonthlySchedulePlanner";
import { Calendar, ArrowLeft, Users, CheckSquare, Sparkles } from "lucide-react";

export default function TeamSchedulePlannerPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-6 p-4 md:p-8">
      {/* ページヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b-2 border-primary/20">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              href="/attendance"
              className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-all flex items-center gap-1 text-xs font-bold"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>出欠管理へ戻る</span>
            </Link>
          </div>
          <h1 className="text-2xl md:text-3xl font-black italic tracking-tighter text-foreground flex items-center gap-3">
            <Calendar className="w-7 h-7 text-primary" />
            <span>チーム活動予定スケジューラー</span>
          </h1>
          <p className="text-xs md:text-sm font-bold text-muted-foreground">
            月間カレンダーの日付をタップして活動日をON/OFF。午前・午後の活動内容、当番班、お弁当要否を一括設定できます。
          </p>
        </div>

        {/* サブリンク */}
        <div className="flex items-center gap-2">
          <Link
            href="/attendance"
            className="py-2.5 px-4 rounded-2xl bg-muted hover:bg-muted/80 text-foreground text-xs font-black border border-border/80 flex items-center gap-1.5 transition-all"
          >
            <CheckSquare className="w-4 h-4 text-emerald-500" />
            <span>伝助出欠表を見る</span>
          </Link>
          <Link
            href="/attendance/carpool"
            className="py-2.5 px-4 rounded-2xl bg-muted hover:bg-muted/80 text-foreground text-xs font-black border border-border/80 flex items-center gap-1.5 transition-all"
          >
            <Users className="w-4 h-4 text-blue-500" />
            <span>配車・当番表</span>
          </Link>
        </div>
      </div>

      {/* スケジューラー本体 */}
      <MonthlySchedulePlanner teamId="team_1" teamName="東京ジャイアンツ" />
    </div>
  );
}
