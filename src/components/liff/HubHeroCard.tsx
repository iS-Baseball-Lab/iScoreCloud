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
    <div className="relative overflow-hidden rounded-3xl bg-card border-2 border-border/80 shadow-md p-4 space-y-4">
      {/* 上部タグ & 日時 */}
      <div className="flex items-center justify-between">
        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black tracking-tight ${
          event.eventType === "match"
            ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
            : "bg-primary/15 text-primary border border-primary/30"
        }`}>
          {event.eventType === "match" ? "⚾ 次回公式戦" : "🏃 次回練習"}
        </span>

        <span className="text-xs font-black text-primary flex items-center gap-0.5">
          {event.date}
        </span>
      </div>

      {/* メイン予定タイトル & 時間・球場 */}
      <div className="space-y-2">
        <h2 className="text-base font-black text-foreground tracking-tight line-clamp-2">
          {event.title}
        </h2>

        <div className="grid grid-cols-1 gap-1.5 text-xs font-bold text-muted-foreground pt-0.5">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-foreground">{event.time}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="truncate">{event.location}</span>
          </div>
        </div>
      </div>

      {/* 連絡事項：配車・お当番・お弁当インフォメーション */}
      <div className="p-3 rounded-2xl bg-muted/40 border border-border/60 space-y-2 text-xs">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5 font-bold">
            <Car className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] text-muted-foreground block">配車担当</span>
              <span className="text-foreground truncate block">{event.carInfo || "配車調整中"}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 font-bold">
            <Utensils className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] text-muted-foreground block">お弁当</span>
              <span className="text-foreground truncate block">
                {event.needsLunch ? "持参要 (各自)" : "不要 (半日)"}
              </span>
            </div>
          </div>
        </div>

        {event.dutyGroup && (
          <div className="pt-1.5 border-t border-border/40 flex items-center justify-between text-[11px] font-bold">
            <span className="text-muted-foreground">お当番</span>
            <span className="text-primary font-black">{event.dutyGroup}</span>
          </div>
        )}
      </div>

      {/* ワンタップ出欠回答エリア */}
      <div className="pt-2 border-t border-border/60 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-foreground">あなたの出欠回答</span>
          <span className="text-[10px] font-bold text-muted-foreground">タップして変更</span>
        </div>

        {/* 参加 / 不参加 / 未定 */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setPlayerStatus("present")}
            className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-2xl text-xs font-black transition-all active:scale-95 ${
              playerStatus === "present"
                ? "bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-500/50"
                : "bg-muted hover:bg-muted/80 text-muted-foreground"
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>参加</span>
          </button>

          <button
            type="button"
            onClick={() => setPlayerStatus("absent")}
            className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-2xl text-xs font-black transition-all active:scale-95 ${
              playerStatus === "absent"
                ? "bg-rose-600 text-white shadow-sm ring-2 ring-rose-500/50"
                : "bg-muted hover:bg-muted/80 text-muted-foreground"
            }`}
          >
            <XCircle className="w-4 h-4 shrink-0" />
            <span>欠席</span>
          </button>

          <button
            type="button"
            onClick={() => setPlayerStatus("pending")}
            className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-2xl text-xs font-black transition-all active:scale-95 ${
              playerStatus === "pending"
                ? "bg-amber-600 text-white shadow-sm ring-2 ring-amber-500/50"
                : "bg-muted hover:bg-muted/80 text-muted-foreground"
            }`}
          >
            <HelpCircle className="w-4 h-4 shrink-0" />
            <span>未定</span>
          </button>
        </div>

        {/* 車出し可能かどうかのセレクト（参加時のみ） */}
        {playerStatus === "present" && (
          <div className="pt-2 flex items-center justify-between gap-2 text-xs bg-blue-500/5 p-2 rounded-xl border border-blue-500/20 animate-in fade-in slide-in-from-top-1">
            <span className="font-bold text-foreground text-[11px] shrink-0">車出し</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCarStatus("can_drive")}
                className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all ${
                  carStatus === "can_drive"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-card border border-border text-muted-foreground"
                }`}
              >
                出せる (乗車可)
              </button>
              <button
                type="button"
                onClick={() => setCarStatus("need_ride")}
                className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all ${
                  carStatus === "need_ride"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-card border border-border text-muted-foreground"
                }`}
              >
                乗せてほしい
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
