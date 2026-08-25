// filepath: src/app/liff/schedule/page.tsx
"use client";

import React, { useState } from "react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { Calendar, Clock, MapPin, Users, CheckCircle2, XCircle, HelpCircle, Utensils, Shield, Filter } from "lucide-react";

interface ScheduleEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  eventType: "match" | "practice" | "meeting" | "camp";
  dutyGroup?: string;
  needsLunch?: boolean;
  myStatus: "present" | "absent" | "pending";
  attendCount: { present: number; absent: number; pending: number };
}

export default function LiffSchedulePage() {
  const [filter, setFilter] = useState<"all" | "match" | "practice">("all");

  const [events, setEvents] = useState<ScheduleEvent[]>([
    {
      id: "ev-1",
      title: "秋季大会 2回戦 vs レッドソックス",
      date: "8月30日(日)",
      time: "08:30 集合 (09:30 PB)",
      location: "市民第1球場 (1面)",
      eventType: "match",
      dutyGroup: "B班 (鍵・救急)",
      needsLunch: true,
      myStatus: "present",
      attendCount: { present: 14, absent: 2, pending: 1 },
    },
    {
      id: "ev-2",
      title: "午後 強化守備・走塁練習",
      date: "9月5日(土)",
      time: "13:00 〜 17:00",
      location: "桜本小学校 グラウンド",
      eventType: "practice",
      dutyGroup: "C班 (グラウンド整備)",
      needsLunch: false,
      myStatus: "pending",
      attendCount: { present: 11, absent: 3, pending: 3 },
    },
    {
      id: "ev-3",
      title: "練習試合 vs グリーンライオンズ (ダブルヘッダー)",
      date: "9月6日(日)",
      time: "08:00 集合 (第1試合 09:00 / 第2試合 11:30)",
      location: "緑地運動公園 野球場B",
      eventType: "match",
      dutyGroup: "A班 (審判割当・配車)",
      needsLunch: true,
      myStatus: "pending",
      attendCount: { present: 12, absent: 1, pending: 4 },
    },
  ]);

  const handleStatusChange = (eventId: string, status: "present" | "absent" | "pending") => {
    setEvents((prev) =>
      prev.map((ev) => (ev.id === eventId ? { ...ev, myStatus: status } : ev))
    );
  };

  const filteredEvents = events.filter((ev) => {
    if (filter === "match") return ev.eventType === "match";
    if (filter === "practice") return ev.eventType === "practice";
    return true;
  });

  return (
    <div className="flex flex-col min-h-screen">
      <LiffHeader
        title="予定 & 出欠管理"
        subtitle="今後のスケジュール・当番表"
        showBack
        shareData={{
          title: `【スケジュール】今後のチーム予定一覧`,
          text: `出欠未回答の方は確認とご登録をお願いします！`,
        }}
      />

      <div className="p-4 space-y-5">
        {/* フィルタータブ */}
        <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-2xl border border-border">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`flex-1 py-1.5 rounded-xl text-xs font-black transition-all ${
              filter === "all"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            すべて ({events.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("match")}
            className={`flex-1 py-1.5 rounded-xl text-xs font-black transition-all ${
              filter === "match"
                ? "bg-card text-rose-600 dark:text-rose-400 shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            ⚾ 試合のみ
          </button>
          <button
            type="button"
            onClick={() => setFilter("practice")}
            className={`flex-1 py-1.5 rounded-xl text-xs font-black transition-all ${
              filter === "practice"
                ? "bg-card text-primary shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            🏃 練習のみ
          </button>
        </div>

        {/* 予定カード一覧 */}
        <div className="space-y-4">
          {filteredEvents.map((ev) => (
            <div
              key={ev.id}
              className="bg-card border border-border rounded-3xl p-4 shadow-xs space-y-3"
            >
              {/* 日時 & 種別バッジ */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                      ev.eventType === "match"
                        ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                        : "bg-primary/15 text-primary border border-primary/30"
                    }`}
                  >
                    {ev.eventType === "match" ? "⚾ 試合" : "🏃 練習"}
                  </span>
                  <span className="text-xs font-black text-foreground">{ev.date}</span>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] font-black text-muted-foreground">
                  <span className="text-emerald-600">出 {ev.attendCount.present}</span>
                  <span>/</span>
                  <span className="text-rose-600">欠 {ev.attendCount.absent}</span>
                  <span>/</span>
                  <span className="text-amber-600">未 {ev.attendCount.pending}</span>
                </div>
              </div>

              {/* タイトル */}
              <h3 className="text-sm font-black text-foreground tracking-tight">
                {ev.title}
              </h3>

              {/* 時間・場所・当番詳細 */}
              <div className="p-3 rounded-2xl bg-muted/40 border border-border/50 space-y-1.5 text-xs font-bold">
                <div className="flex items-center gap-2 text-foreground">
                  <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span>{ev.time}</span>
                </div>

                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="truncate">{ev.location}</span>
                </div>

                {ev.dutyGroup && (
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 pt-0.5">
                    <Shield className="w-3.5 h-3.5 shrink-0" />
                    <span>当番: {ev.dutyGroup}</span>
                  </div>
                )}

                {ev.needsLunch && (
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                    <Utensils className="w-3.5 h-3.5 shrink-0" />
                    <span>🍙 お弁当持参</span>
                  </div>
                )}
              </div>

              {/* 出欠回答ボタングループ */}
              <div className="pt-1 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-black text-muted-foreground px-1">
                  <span>出欠回答</span>
                  <span
                    className={
                      ev.myStatus === "present"
                        ? "text-emerald-600 font-black"
                        : ev.myStatus === "absent"
                        ? "text-rose-600 font-black"
                        : "text-amber-600 font-black"
                    }
                  >
                    {ev.myStatus === "present"
                      ? "● 出席"
                      : ev.myStatus === "absent"
                      ? "● 欠席"
                      : "○ 未回答"}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleStatusChange(ev.id, "present")}
                    className={`flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-black transition-all ${
                      ev.myStatus === "present"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "bg-muted/60 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>出席</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStatusChange(ev.id, "absent")}
                    className={`flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-black transition-all ${
                      ev.myStatus === "absent"
                        ? "bg-rose-600 text-white shadow-xs"
                        : "bg-muted/60 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>欠席</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStatusChange(ev.id, "pending")}
                    className={`flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-black transition-all ${
                      ev.myStatus === "pending"
                        ? "bg-amber-500 text-white shadow-xs"
                        : "bg-muted/60 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>未定</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
