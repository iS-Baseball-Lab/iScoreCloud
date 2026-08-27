// filepath: src/components/liff/HubHeroSection.tsx
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { 
  Calendar, 
  MapPin, 
  Car, 
  Utensils, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ChevronRight, 
  Trophy, 
  Flame, 
  Video,
  Sparkles,
  CalendarDays
} from "lucide-react";
import type { MatchCardData } from "@/components/liff/MatchScoreCard";

interface HubHeroSectionProps {
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
  latestMatch?: MatchCardData | null;
}

export function HubHeroSection({
  teamName = "チーム",
  nextEvent,
  latestMatch,
}: HubHeroSectionProps) {
  const [activeTab, setActiveTab] = useState<"next" | "calendar" | "score">("next");

  // 出欠ステート
  const [playerStatus, setPlayerStatus] = useState<"present" | "absent" | "pending">("pending");
  const [carStatus, setCarStatus] = useState<"can_drive" | "need_ride" | "not_needed">("need_ride");

  // デフォルト次回予定
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

  // サンプル直近予定リスト（チームカレンダー用）
  const upcomingEvents = [
    {
      id: "ev-1",
      date: "8/30(日)",
      type: "match",
      title: "秋季大会 2回戦 vs レッドソックス",
      time: "08:30 集合 (09:30 PB)",
      location: "市民第1球場",
    },
    {
      id: "ev-2",
      date: "9/05(土)",
      type: "practice",
      title: "午後通常練習 & 守備連携強化",
      time: "13:00〜17:00",
      location: "大師河原第3グラウンド",
    },
    {
      id: "ev-3",
      date: "9/06(日)",
      type: "match",
      title: "練習試合 vs グリーンライオンズ (Wヘッダー)",
      time: "09:00 集合",
      location: "等々力球場",
    },
  ];

  // 直近の試合速報データ
  const recentMatch = latestMatch || {
    id: "sample-match",
    date: "2026/08/23(日)",
    matchType: "official",
    tournamentName: "川崎市秋季大会 1回戦",
    opponent: "横浜ベイブルース",
    venueName: "市民第2球場",
    myScore: 7,
    opponentScore: 4,
    status: "finished",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  };

  const isWin = recentMatch.status === "finished" && recentMatch.myScore > recentMatch.opponentScore;
  const isLose = recentMatch.status === "finished" && recentMatch.myScore < recentMatch.opponentScore;

  return (
    <div className="space-y-2.5">
      {/* 🌟 1. 上部セグメントタブ（次回予定 / カレンダー / 試合速報） */}
      <div className="flex items-center p-1 bg-background/80 dark:bg-muted/40 backdrop-blur-md rounded-2xl border border-border/80 shadow-xs">
        <button
          type="button"
          onClick={() => setActiveTab("next")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs font-black transition-all active:scale-95 ${
            activeTab === "next"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>次回予定</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("calendar")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs font-black transition-all active:scale-95 ${
            activeTab === "calendar"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <CalendarDays className="w-3.5 h-3.5" />
          <span>カレンダー</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("score")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs font-black transition-all active:scale-95 ${
            activeTab === "score"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          <span>試合速報</span>
        </button>
      </div>

      {/* 🌟 2. タブごとのカードコンテンツ */}

      {/* 🅰️ 【次回予定】カード（出欠・配車・お当番） */}
      {activeTab === "next" && (
        <div className="relative overflow-hidden rounded-3xl bg-card border-2 border-border/80 shadow-md p-4 space-y-4 animate-in fade-in duration-200">
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

            {/* 参加 / 欠席 / 未定 */}
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
                <span>未定</span>
              </button>
            </div>

            {/* 参加時の配車アンケート */}
            {playerStatus === "present" && (
              <div className="p-3 rounded-2xl bg-primary/5 border border-primary/20 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="flex items-center justify-between text-xs font-bold text-foreground">
                  <span className="flex items-center gap-1.5">
                    <Car className="w-3.5 h-3.5 text-primary" />
                    <span>当日の配車・移動手段</span>
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCarStatus("can_drive")}
                    className={`py-1.5 px-1 rounded-xl text-[11px] font-bold border transition-all ${
                      carStatus === "can_drive"
                        ? "bg-primary text-primary-foreground border-primary shadow-xs font-black"
                        : "bg-card border-border/80 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    🚗 車出し可
                  </button>

                  <button
                    type="button"
                    onClick={() => setCarStatus("need_ride")}
                    className={`py-1.5 px-1 rounded-xl text-[11px] font-bold border transition-all ${
                      carStatus === "need_ride"
                        ? "bg-primary text-primary-foreground border-primary shadow-xs font-black"
                        : "bg-card border-border/80 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    🙋 乗車希望
                  </button>

                  <button
                    type="button"
                    onClick={() => setCarStatus("not_needed")}
                    className={`py-1.5 px-1 rounded-xl text-[11px] font-bold border transition-all ${
                      carStatus === "not_needed"
                        ? "bg-primary text-primary-foreground border-primary shadow-xs font-black"
                        : "bg-card border-border/80 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    🚲 現地直行
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 🅱️ 【チームカレンダー】カード（月間・週間直近スケジュール一覧） */}
      {activeTab === "calendar" && (
        <div className="relative overflow-hidden rounded-3xl bg-card border-2 border-border/80 shadow-md p-4 space-y-3.5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center font-black">
                <Calendar className="w-3.5 h-3.5" />
              </span>
              <span className="text-xs font-black text-foreground">直近のスケジュール</span>
            </div>
            <Link
              href="/liff/schedule"
              className="text-xs font-black text-primary hover:underline flex items-center gap-0.5"
            >
              <span>予定表を開く</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* 直近の予定リスト */}
          <div className="space-y-2">
            {upcomingEvents.map((ev, idx) => (
              <Link
                key={ev.id}
                href="/liff/schedule"
                className="flex items-start gap-3 p-2.5 rounded-2xl bg-muted/40 hover:bg-muted/70 border border-border/60 transition-all group"
              >
                {/* 日付バッジ */}
                <div className={`px-2 py-1 rounded-xl flex flex-col items-center justify-center shrink-0 min-w-[50px] ${
                  ev.type === "match" 
                    ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20" 
                    : "bg-primary/10 text-primary border border-primary/20"
                }`}>
                  <span className="text-[11px] font-black leading-tight">{ev.date}</span>
                  <span className="text-[9px] font-bold mt-0.5 opacity-90">{ev.type === "match" ? "試合" : "練習"}</span>
                </div>

                {/* 予定詳細 */}
                <div className="min-w-0 flex-1 space-y-0.5">
                  <h4 className="text-xs font-black text-foreground group-hover:text-primary transition-colors truncate">
                    {ev.title}
                  </h4>
                  <div className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-primary/80" />
                      <span>{ev.time}</span>
                    </span>
                    <span className="flex items-center gap-1 truncate">
                      <MapPin className="w-3 h-3 text-emerald-500" />
                      <span className="truncate">{ev.location}</span>
                    </span>
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 mt-2" />
              </Link>
            ))}
          </div>

          {/* 出欠確認ボタンへの誘導 */}
          <Link
            href="/liff/schedule"
            className="w-full py-2.5 rounded-2xl bg-muted/60 hover:bg-muted text-foreground text-xs font-black flex items-center justify-center gap-1.5 transition-all border border-border/60"
          >
            <CalendarDays className="w-4 h-4 text-primary" />
            <span>すべての月間予定 & 出欠状況を確認</span>
          </Link>
        </div>
      )}

      {/* 🅲 【試合速報】カード（直近の試合結果・スコア・ハイライト） */}
      {activeTab === "score" && (
        <div className="relative overflow-hidden rounded-3xl bg-card border-2 border-border/80 shadow-md p-4 space-y-3.5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black tracking-tight ${
              isWin
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                : isLose
                ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                : "bg-muted text-muted-foreground border border-border"
            }`}>
              {isWin ? "🏆 WIN 勝利！" : isLose ? "敗戦" : "⚾ 試合結果"}
            </span>

            <span className="text-xs font-black text-muted-foreground">
              {recentMatch.date}
            </span>
          </div>

          {/* 大会名 & 会場 */}
          {recentMatch.tournamentName && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
              <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="truncate">{recentMatch.tournamentName}</span>
            </div>
          )}

          {/* 対戦スコアボード */}
          <div className="p-3 rounded-2xl bg-muted/40 border border-border/60 flex items-center justify-between">
            <div className="text-center flex-1 min-w-0 pr-2">
              <span className="text-[10px] font-black text-primary block truncate">{teamName}</span>
              <span className="text-2xl font-black text-foreground">{recentMatch.myScore ?? "-"}</span>
            </div>

            <div className="px-2.5 py-1 rounded-xl bg-card border border-border/80 text-center shrink-0">
              <span className="text-[9px] font-black text-muted-foreground uppercase block">VS</span>
              <span className="text-xs font-black text-foreground">終了</span>
            </div>

            <div className="text-center flex-1 min-w-0 pl-2">
              <span className="text-[10px] font-black text-muted-foreground block truncate">{recentMatch.opponent}</span>
              <span className="text-2xl font-black text-foreground">{recentMatch.opponentScore ?? "-"}</span>
            </div>
          </div>

          {/* 会場情報 */}
          {recentMatch.venueName && (
            <div className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground px-1">
              <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="truncate">{recentMatch.venueName}</span>
            </div>
          )}

          {/* アクションボタン */}
          <div className="flex items-center gap-2 pt-1">
            <Link
              href={`/liff/matches?id=${recentMatch.id}`}
              className="flex-1 py-2.5 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-black flex items-center justify-center gap-1.5 transition-all shadow-xs"
            >
              <Trophy className="w-4 h-4" />
              <span>スコア詳細</span>
            </Link>

            <Link
              href="/liff/matches"
              className="py-2.5 px-3 rounded-2xl bg-muted hover:bg-muted/80 text-foreground text-xs font-black flex items-center justify-center gap-1 transition-all border border-border/60"
            >
              <Video className="w-4 h-4 text-red-500" />
              <span>試合一覧</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
