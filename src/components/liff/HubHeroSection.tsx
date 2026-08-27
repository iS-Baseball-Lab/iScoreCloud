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
  ChevronLeft,
  Trophy, 
  Flame, 
  Video,
  Sparkles,
  CalendarDays,
  Info
} from "lucide-react";
import { cn } from "@/lib/utils";
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
  const [playerStatus, setPlayerStatus] = useState<"present" | "absent" | "pending" | "late">("pending");
  const [carStatus, setCarStatus] = useState<"can_drive" | "need_ride" | "not_needed">("need_ride");

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 📅 月間カレンダー用ステート & 算出ロジック
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const currentYear = calendarMonth.getFullYear();
  const currentMonth = calendarMonth.getMonth(); // 0-11

  const handlePrevMonth = () => {
    setCalendarMonth(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setCalendarMonth(new Date(currentYear, currentMonth + 1, 1));
  };

  const handleToday = () => {
    const today = new Date();
    setCalendarMonth(today);
    setSelectedDate(today);
  };

  const formatDateString = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const selectedDateStr = formatDateString(selectedDate);
  const todayStr = formatDateString(new Date());

  // 42マスのカレンダーグリッド日付算出
  const getCalendarDays = () => {
    const days = [];
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const startDayOfWeek = firstDayOfMonth.getDay(); // 0(日) - 6(土)

    const prevMonthLastDate = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: new Date(currentYear, currentMonth - 1, prevMonthLastDate - i),
        isCurrentMonth: false,
      });
    }

    const currentMonthLastDate = new Date(currentYear, currentMonth + 1, 0).getDate();
    for (let i = 1; i <= currentMonthLastDate; i++) {
      days.push({
        date: new Date(currentYear, currentMonth, i),
        isCurrentMonth: true,
      });
    }

    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: new Date(currentYear, currentMonth + 1, i),
        isCurrentMonth: false,
      });
    }

    return days;
  };

  const calendarDays = getCalendarDays();
  const weekDays = ["日", "月", "火", "水", "木", "金", "土"];

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

  // チームの直近予定リスト（カレンダー下部に表示）
  const upcomingEvents = [
    {
      id: "ev-1",
      date: "8/30(日)",
      dateStr: "2026-08-30",
      type: "match",
      title: "秋季大会 2回戦 vs レッドソックス",
      time: "08:30 集合 (09:30 PB)",
      location: "市民第1球場",
      duty: "B班 (鍵当番・救急)",
    },
    {
      id: "ev-2",
      date: "9/05(土)",
      dateStr: "2026-09-05",
      type: "practice",
      title: "午後通常練習 & 守備連携強化",
      time: "13:00〜17:00",
      location: "大師河原第3グラウンド",
      duty: "A班",
    },
    {
      id: "ev-3",
      date: "9/06(日)",
      dateStr: "2026-09-06",
      type: "match",
      title: "練習試合 vs グリーンライオンズ (Wヘッダー)",
      time: "09:00 集合",
      location: "等々力球場",
      duty: "C班",
    },
  ];

  // 日付ごとのイベント状態
  const getDateEvent = (dStr: string) => {
    return upcomingEvents.find(e => e.dateStr === dStr);
  };

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
      <div className="flex items-center p-1 bg-background/80 dark:bg-muted/40 backdrop-blur-md rounded-2xl border border-primary/20 dark:border-primary/25 shadow-xs">
        <button
          type="button"
          onClick={() => setActiveTab("next")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs font-black transition-all active:scale-95 ${
            activeTab === "next"
              ? "bg-primary text-primary-foreground shadow-xs font-black"
              : "text-muted-foreground hover:text-foreground font-bold"
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
              ? "bg-primary text-primary-foreground shadow-xs font-black"
              : "text-muted-foreground hover:text-foreground font-bold"
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
              ? "bg-primary text-primary-foreground shadow-xs font-black"
              : "text-muted-foreground hover:text-foreground font-bold"
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          <span>試合速報</span>
        </button>
      </div>

      {/* 🌟 2. タブごとのカードコンテンツ */}

      {/* 🅰️ 【次回予定】カード（出欠・配車・お当番） */}
      {activeTab === "next" && (
        <div className="relative overflow-hidden rounded-3xl bg-card border-2 border-primary/25 dark:border-primary/30 shadow-md shadow-primary/5 p-4 space-y-4 animate-in fade-in duration-200">
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
          <div className="p-3 rounded-2xl bg-muted/40 border border-primary/15 space-y-2 text-xs">
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
              <div className="pt-1.5 border-t border-primary/15 flex items-center justify-between text-[11px] font-bold">
                <span className="text-muted-foreground">お当番</span>
                <span className="text-primary font-black">{event.dutyGroup}</span>
              </div>
            )}
          </div>

          {/* ワンタップ出欠回答エリア (○, △, ×, ？) */}
          <div className="pt-2 border-t border-primary/15 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-black text-foreground">あなたの出欠回答</span>
              <span className="text-[11px] font-bold">
                {playerStatus === "present" && <span className="text-emerald-600 dark:text-emerald-400 font-black">○ 出席で回答中</span>}
                {playerStatus === "late" && <span className="text-amber-600 dark:text-amber-400 font-black">△ 調整・遅刻で回答中</span>}
                {playerStatus === "absent" && <span className="text-rose-600 dark:text-rose-400 font-black">× 欠席で回答中</span>}
                {playerStatus === "pending" && <span className="text-muted-foreground font-black">？ 未定・未回答</span>}
              </span>
            </div>

            {/* ○, △, ×, ？ の4等分グリッド */}
            <div className="grid grid-cols-4 gap-1.5">
              {/* ○ 出席 */}
              <button
                type="button"
                onClick={() => setPlayerStatus("present")}
                className={`flex flex-col items-center justify-center py-2 rounded-2xl text-xs font-black transition-all active:scale-95 ${
                  playerStatus === "present"
                    ? "bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-500/50"
                    : "bg-muted/70 hover:bg-muted text-muted-foreground"
                }`}
              >
                <span className="text-base leading-none mb-0.5">○</span>
                <span className="text-[10px]">出席</span>
              </button>

              {/* △ 調整 / 遅刻 */}
              <button
                type="button"
                onClick={() => setPlayerStatus("late")}
                className={`flex flex-col items-center justify-center py-2 rounded-2xl text-xs font-black transition-all active:scale-95 ${
                  playerStatus === "late"
                    ? "bg-amber-500 text-white shadow-xs ring-2 ring-amber-500/50"
                    : "bg-muted/70 hover:bg-muted text-muted-foreground"
                }`}
              >
                <span className="text-base leading-none mb-0.5">△</span>
                <span className="text-[10px]">調整</span>
              </button>

              {/* × 欠席 */}
              <button
                type="button"
                onClick={() => setPlayerStatus("absent")}
                className={`flex flex-col items-center justify-center py-2 rounded-2xl text-xs font-black transition-all active:scale-95 ${
                  playerStatus === "absent"
                    ? "bg-rose-600 text-white shadow-xs ring-2 ring-rose-500/50"
                    : "bg-muted/70 hover:bg-muted text-muted-foreground"
                }`}
              >
                <span className="text-base leading-none mb-0.5">×</span>
                <span className="text-[10px]">欠席</span>
              </button>

              {/* ？ 未定 */}
              <button
                type="button"
                onClick={() => setPlayerStatus("pending")}
                className={`flex flex-col items-center justify-center py-2 rounded-2xl text-xs font-black transition-all active:scale-95 ${
                  playerStatus === "pending"
                    ? "bg-slate-700 text-white dark:bg-slate-300 dark:text-slate-900 shadow-xs ring-2 ring-slate-500/50"
                    : "bg-muted/70 hover:bg-muted text-muted-foreground"
                }`}
              >
                <span className="text-base leading-none mb-0.5">？</span>
                <span className="text-[10px]">未定</span>
              </button>
            </div>

            {/* 参加時の配車アンケート */}
            {(playerStatus === "present" || playerStatus === "late") && (
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

      {/* 🅱️ 【チームカレンダー】カード（本家ダッシュボード同等の月間カレンダー ＋ 直近の日程一覧） */}
      {activeTab === "calendar" && (
        <div className="relative overflow-hidden rounded-3xl bg-card border-2 border-primary/25 dark:border-primary/30 shadow-md shadow-primary/5 p-4 space-y-4 animate-in fade-in duration-200">
          
          {/* ━━ 1. カレンダーヘッダー（年月切り替え & 今日ボタン） ━━ */}
          <div className="flex items-center justify-between pb-1 border-b border-primary/15">
            <div className="flex items-center gap-1.5">
              <span className="w-7 h-7 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black">
                <Calendar className="w-4 h-4" />
              </span>
              <span className="text-sm font-black text-foreground">
                {currentYear}年 {currentMonth + 1}月
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground active:scale-95 transition-all"
                title="前月"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground active:scale-95 transition-all"
                title="翌月"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleToday}
                className="px-2.5 py-1 text-[10px] font-black rounded-lg bg-muted hover:bg-muted/80 text-foreground border border-border/60 active:scale-95 transition-all ml-1"
              >
                今日
              </button>
            </div>
          </div>

          {/* ━━ 2. 曜日ヘッダー ━━ */}
          <div className="grid grid-cols-7 text-center text-[10px] font-black text-muted-foreground uppercase pb-1 border-b border-primary/10">
            {weekDays.map((day, idx) => (
              <span key={day} className={cn(idx === 0 && "text-rose-500", idx === 6 && "text-blue-500")}>
                {day}
              </span>
            ))}
          </div>

          {/* ━━ 3. 日付グリッド (42マス) ━━ */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, idx) => {
              const dayStr = formatDateString(day.date);
              const isSelected = selectedDateStr === dayStr;
              const isToday = todayStr === dayStr;
              const hasEvent = getDateEvent(dayStr);
              
              const dayOfWeek = day.date.getDay();
              const isSunday = dayOfWeek === 0;
              const isSaturday = dayOfWeek === 6;

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedDate(day.date)}
                  className={cn(
                    "relative aspect-square flex flex-col items-center justify-center rounded-xl transition-all active:scale-95 cursor-pointer border border-transparent select-none p-1",
                    !day.isCurrentMonth && "text-muted-foreground/25",
                    day.isCurrentMonth && "hover:bg-muted/60",
                    day.isCurrentMonth && isSunday && "text-rose-500",
                    day.isCurrentMonth && isSaturday && "text-blue-500",
                    isToday && !isSelected && "bg-primary/10 border-primary/30 text-primary font-black",
                    isSelected && "bg-primary text-primary-foreground hover:bg-primary border-primary font-black shadow-xs"
                  )}
                >
                  <span className="text-xs font-black tabular-nums">
                    {day.date.getDate()}
                  </span>

                  {/* 試合・練習有無のインジケータードット */}
                  {hasEvent && (
                    <span className="absolute bottom-1 flex h-1 w-1 justify-center">
                      <span
                        className={cn(
                          "h-1 w-1 rounded-full",
                          isSelected ? "bg-white" : 
                          hasEvent.type === "match" ? "bg-rose-500" : "bg-primary"
                        )}
                      />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ━━ 4. 選択日 / 直近の日程リスト ━━ */}
          <div className="pt-3 border-t border-primary/15 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-primary" />
                <span>直近の予定一覧</span>
              </span>
              <Link
                href="/liff/schedule"
                className="text-[11px] font-black text-primary hover:underline flex items-center gap-0.5"
              >
                <span>予定表詳細</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* 直近予定リスト */}
            <div className="space-y-2">
              {upcomingEvents.map((ev) => (
                <Link
                  key={ev.id}
                  href="/liff/schedule"
                  className="flex items-start gap-2.5 p-2.5 rounded-2xl bg-muted/40 hover:bg-muted/70 border border-primary/15 transition-all group"
                >
                  {/* 日付バッジ */}
                  <div className={`px-2 py-1 rounded-xl flex flex-col items-center justify-center shrink-0 min-w-[48px] ${
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
                    <div className="flex items-center gap-2 text-[10.5px] font-bold text-muted-foreground">
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

                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 mt-1.5" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 🅲 【試合速報】カード（直近の試合結果・スコア・ハイライト） */}
      {activeTab === "score" && (
        <div className="relative overflow-hidden rounded-3xl bg-card border-2 border-primary/25 dark:border-primary/30 shadow-md shadow-primary/5 p-4 space-y-3.5 animate-in fade-in duration-200">
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
          <div className="p-3 rounded-2xl bg-muted/40 border border-primary/15 flex items-center justify-between">
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
