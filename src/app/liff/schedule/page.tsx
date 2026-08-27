// filepath: src/app/liff/schedule/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { useLiff } from "@/components/liff/LiffProvider";
import { Calendar, Clock, MapPin, Users, CheckCircle2, XCircle, HelpCircle, Utensils, Shield, Filter, Loader2 } from "lucide-react";

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
  const { currentTeam, profile, isLoadingTeam } = useLiff();
  const [filter, setFilter] = useState<"all" | "match" | "practice">("all");
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadSchedule = useCallback(async () => {
    try {
      setIsLoading(true);
      const teamId = currentTeam?.id || "demo-team";
      const userId = profile?.userId || "";
      const res = await fetch(`/api/liff/schedule?teamId=${teamId}&userId=${userId}`);
      if (res.ok) {
        const data = await res.json() as { success: boolean; events?: ScheduleEvent[] };
        if (data.events) {
          setEvents(data.events);
        }
      }
    } catch (err) {
      console.error("Failed to fetch schedule:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentTeam?.id, profile?.userId]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  const handleStatusChange = async (eventId: string, status: "present" | "absent" | "pending") => {
    // 楽観的更新
    setEvents((prev) =>
      prev.map((ev) => (ev.id === eventId ? { ...ev, myStatus: status } : ev))
    );

    try {
      await fetch("/api/liff/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          userId: profile?.userId,
          status,
        }),
      });
    } catch (err) {
      console.error("Failed to save attendance:", err);
    }
  };

  const filteredEvents = events.filter((ev) => {
    if (filter === "match") return ev.eventType === "match";
    if (filter === "practice") return ev.eventType === "practice";
    return true;
  });

  return (
    <div className="flex flex-col min-h-screen">
      <LiffHeader />

      <div className="p-4 space-y-5">
        {/* ページ内ヘッダー */}
        <LiffPageHeader
          title="予定 & お当番表"
          subtitle="今後のスケジュール・出欠・当番確認"
          icon={
            <span className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black">
              <Calendar className="w-4 h-4" />
            </span>
          }
          showBack
          shareData={{
            title: `【スケジュール】今後のチーム予定一覧`,
            text: `出欠未回答の方は確認とご登録をお願いします！`,
          }}
        />

        {/* 🌟 管理者向け：活動予定スケジューラーへの導線 */}
        <div className="flex items-center justify-between p-3 rounded-2xl bg-primary/10 border border-primary/20">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-black shrink-0">
              <Calendar className="w-4 h-4" />
            </span>
            <div>
              <p className="text-xs font-black text-foreground">活動日スケジューラー</p>
              <p className="text-[10px] font-bold text-muted-foreground">カレンダーで予定・午前午後・当番を一括設定</p>
            </div>
          </div>
          <a
            href="/liff/schedule/admin"
            className="py-1.5 px-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 text-xs font-black shadow-xs transition-all shrink-0"
          >
            予定を設定
          </a>
        </div>

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

        {/* ローディング */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs font-bold">予定を読み込み中...</span>
          </div>
        ) : filteredEvents.length === 0 ? (
          /* 空ステート */
          <div className="flex flex-col items-center justify-center py-16 text-center bg-card border border-border rounded-3xl p-6 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground">
              <Calendar className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-black text-foreground">登録されている予定はありません</h4>
              <p className="text-xs font-bold text-muted-foreground">
                管理者がWeb版から新しい予定を登録すると、ここに自動反映されます。
              </p>
            </div>
          </div>
        ) : (
          /* 予定カード一覧 */
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
        )}
      </div>
    </div>
  );
}
