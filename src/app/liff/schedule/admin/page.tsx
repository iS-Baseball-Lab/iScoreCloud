// filepath: src/app/liff/schedule/admin/page.tsx
"use client";

import React from "react";
import Link from "next/link";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { MonthlySchedulePlanner } from "@/components/schedule/MonthlySchedulePlanner";
import { Calendar, ChevronLeft, ArrowLeft, Sparkles } from "lucide-react";
import { useLiff } from "@/components/liff/LiffProvider";

export default function LiffScheduleAdminPage() {
  const { currentTeam } = useLiff();
  const teamId = currentTeam?.id || "team_1";
  const teamName = currentTeam?.name || "東京ジャイアンツ";

  return (
    <div className="flex flex-col min-h-screen pb-24">
      <LiffHeader />

      <div className="p-4 space-y-5">
        {/* ページ内ヘッダー */}
        <LiffPageHeader
          title="活動予定スケジューラー"
          subtitle="月間カレンダーで活動日・午前午後・当番を一括設定"
          icon={
            <span className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black">
              <Calendar className="w-4 h-4" />
            </span>
          }
          showBack
        />

        {/* スケジューラー本体 */}
        <MonthlySchedulePlanner teamId={teamId} teamName={teamName} isLiff={true} />
      </div>
    </div>
  );
}
