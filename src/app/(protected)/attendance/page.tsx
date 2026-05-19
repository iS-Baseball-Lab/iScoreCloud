// filepath: src/app/(protected)/attendance/page.tsx
"use client";

import React, { useState } from "react";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { RoleAttendanceForm } from "@/components/features/attendance/RoleAttendanceForm";
import { AttendanceCard } from "@/components/features/attendance/AttendanceCard";
import { Calendar, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

// モックデータ: 確認用
const MOCK_ATTENDANCES = [
  { id: "1", status: "present" as const, userName: "山田 太郎", hasCar: true, comment: "直接行きます" },
  { id: "2", status: "present" as const, userName: "佐藤 悠真", hasCar: false },
  { id: "3", status: "late" as const, userName: "鈴木 一郎", hasCar: true, comment: "10分ほど遅れます" },
  { id: "4", status: "absent" as const, userName: "高橋 健太", hasCar: false, comment: "仕事のため欠席" },
  { id: "5", status: "pending" as const, userName: "田中 大輔", hasCar: false },
];

export default function AttendancePage() {
  return (
    <div className="flex flex-col min-h-screen text-foreground pb-24">
      <main className="flex-1 px-4 sm:px-6 max-w-5xl mx-auto w-full space-y-6 mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        <SectionHeader title="出欠管理" subtitle="ATTENDANCE" showPulse={true} />

        <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 flex items-center gap-3">
          <div className="p-3 bg-primary/20 rounded-xl text-primary">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-bold text-lg">次回のイベント</h2>
            <p className="text-sm text-muted-foreground">第10回 練習試合 vs タイガース (3/10 13:00~)</p>
          </div>
        </div>

        {/* 自分の出欠入力フォーム */}
        <div className="space-y-2">
          <h3 className="font-black text-sm uppercase tracking-wider text-muted-foreground pl-1">
            あなたの出欠を登録
          </h3>
          <RoleAttendanceForm />
        </div>

        <Separator className="my-6 opacity-50" />

        {/* 他メンバーの出欠状況一覧 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between pl-1">
            <h3 className="font-black text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" />
              メンバーの回答状況
            </h3>
            <span className="text-xs font-bold bg-secondary px-2 py-1 rounded-md">
              回答率 80%
            </span>
          </div>
          
          <Card className="rounded-[24px] border-border/50 bg-card overflow-hidden">
            <CardContent className="p-2 sm:p-4 bg-muted/20">
              {MOCK_ATTENDANCES.map((a) => (
                <AttendanceCard 
                  key={a.id}
                  status={a.status}
                  userName={a.userName}
                  hasCar={a.hasCar}
                  comment={a.comment}
                />
              ))}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
