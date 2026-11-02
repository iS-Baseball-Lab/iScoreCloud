// filepath: src/components/liff/HubHeroCard.tsx
"use client";

import React, { useState } from "react";
import { Calendar, MapPin, Car, Utensils, CheckCircle2, XCircle, HelpCircle, Clock, ChevronRight } from "lucide-react";

interface HubHeroCardProps {
  teamName?: string;
  nextEvent?: {
    id: string;
    title: string;
    date: string;
    time: string;
    location: string;
    eventType: "match" | "practice" | "meeting" | "camp";
    dutyGroup?: string; // お当番班
    carInfo?: string;   // 行き/帰りの配車
    needsLunch?: boolean; // お弁当要否
  } | null;
}

export function HubHeroCard({
  teamName = "チーム",
  nextEvent,
}: HubHeroCardProps) {
  const [playerStatus, setPlayerStatus] = useState<"present" | "absent" | "pending">("pending");
  const [carStatus, setCarStatus] = useState<"can_drive" | "need_ride" | "not_needed">("need_ride");

  // デフォルト予定
  const event = nextEvent || {
    id: "sample-1",
    title: "秋季大会 2回戦 vs レッドソックス",
    date: "8/30(日)",
    time: "08:30 集合 (09:30 PB)",
    location: "市民第1球場 (1面)",
    eventType: "match" as const,
    dutyGroup: "B班 (鍵当番・救急)",
    carInfo: "鈴木さん号 (セレナ)",
    needsLunch: true,
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
      {/* A-3 上帯ダークキャップ */}
      <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 space-y-2">
        {/* 上部タグ & 日時 */}
        <div className="flex items-center justify-between">
          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black tracking-tight border ${
            event.eventType === "match"
              ? "bg-amber-500/20 text-amber-300 border-amber-400/30"
              : "bg-teal-500/20 text-teal-300 border-teal-400/30"
          }`}>
            {event.eventType === "match" ? "⚾ 次回公式戦" : "🏃 次回練習"}
          </span>

          <span className="text-xs font-black text-teal-300 flex items-center gap-0.5">
            {event.date}
          </span>
        </div>

        {/* メイン予定タイトル */}
        <h2 className="text-base font-black text-white tracking-tight line-clamp-2">
          {event.title}
        </h2>
      </div>

      <div className="p-4 pt-3 space-y-3.5">
        {/* 時間・球場 */}
        <div className="grid grid-cols-1 gap-1.5 text-xs font-bold text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
            <span className="text-foreground">{event.time}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
            <span className="truncate">{event.location}</span>
          </div>
        </div>

        {/* 連絡事項：配車・お当番・お弁当インフォメーション */}
        <div className="p-3 rounded-2xl bg-muted border border-border space-y-2.5 text-xs">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5 font-bold">
              <Car className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
              <div className="min-w-0">
                <span className="text-[10px] text-muted-foreground block">配車担当</span>
                <span className="text-foreground truncate block">{event.carInfo || "配車調整中"}</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 font-bold">
              <Utensils className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="min-w-0">
                <span className="text-[10px] text-muted-foreground block">お弁当</span>
                {event.needsLunch ? (
                  <span className="inline-block px-2 py-0.5 rounded-md bg-amber-500/12 text-amber-700 dark:text-amber-300 border border-amber-500/25 text-[10.5px] font-black truncate">
                    🍙 お弁当：要
                  </span>
                ) : (
                  <span className="text-muted-foreground truncate block">不要 (半日)</span>
                )}
              </div>
            </div>
          </div>

          {event.dutyGroup && (
            <div className="p-2 rounded-xl bg-card border border-border border-l-4 border-l-amber-500 flex items-center justify-between text-[11px] font-bold shadow-2xs">
              <span className="text-foreground font-black">お当番</span>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/12 text-amber-700 dark:text-amber-300 border border-amber-500/25 font-black">
                📋 {event.dutyGroup}
              </span>
            </div>
          )}
        </div>

        {/* ワンタップ出欠回答エリア */}
        <div className="pt-2 border-t border-border space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-foreground">あなたの出欠回答</span>
            <span className="text-[10px] font-bold text-muted-foreground">タップして変更</span>
          </div>

          {/* 参加 / 不参加 / 未定 */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setPlayerStatus("present")}
              className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-2xl text-xs font-black border transition-all active:scale-95 ${
                playerStatus === "present"
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                  : "bg-card hover:bg-muted text-muted-foreground border-border"
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>○ 参加</span>
            </button>

            <button
              type="button"
              onClick={() => setPlayerStatus("absent")}
              className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-2xl text-xs font-black border transition-all active:scale-95 ${
                playerStatus === "absent"
                  ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                  : "bg-card hover:bg-muted text-muted-foreground border-border"
              }`}
            >
              <XCircle className="w-4 h-4 shrink-0" />
              <span>× 欠席</span>
            </button>

            <button
              type="button"
              onClick={() => setPlayerStatus("pending")}
              className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-2xl text-xs font-black border transition-all active:scale-95 ${
                playerStatus === "pending"
                  ? "bg-amber-500 text-white border-amber-500 shadow-xs"
                  : "bg-card hover:bg-muted text-muted-foreground border-border"
              }`}
            >
              <HelpCircle className="w-4 h-4 shrink-0" />
              <span>△ 未定</span>
            </button>
          </div>

          {/* 車出し可能かどうかのセレクト（参加時のみ） */}
          {playerStatus === "present" && (
            <div className="pt-2 flex items-center justify-between gap-2 text-xs bg-muted p-2.5 rounded-xl border border-border animate-in fade-in slide-in-from-top-1">
              <span className="font-bold text-foreground text-[11px] shrink-0">車出し</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCarStatus("can_drive")}
                  className={`px-2.5 py-1 rounded-lg text-[10px] transition-all ${
                    carStatus === "can_drive"
                      ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                      : "bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 font-bold"
                  }`}
                >
                  出せる (乗車可)
                </button>
                <button
                  type="button"
                  onClick={() => setCarStatus("need_ride")}
                  className={`px-2.5 py-1 rounded-lg text-[10px] transition-all ${
                    carStatus === "need_ride"
                      ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                      : "bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 font-bold"
                  }`}
                >
                  乗せてほしい
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
