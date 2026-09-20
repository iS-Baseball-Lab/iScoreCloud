// filepath: src/components/liff/HubCalendarSection.tsx
"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { 
  Calendar, 
  MapPin, 
  Clock, 
  ChevronRight, 
  ChevronLeft,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface HubCalendarSectionProps {
  eventsList?: any[];
  isDemo?: boolean;
}

export function HubCalendarSection({
  eventsList = [],
  isDemo = false,
}: HubCalendarSectionProps) {
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
  const calendarDays = useMemo(() => {
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
  }, [currentYear, currentMonth]);

  const weekDays = ["日", "月", "火", "水", "木", "金", "土"];

  // チームの全予定リスト（午前・午後データ含む）
  const allParsedEvents = useMemo(() => {
    if (eventsList && eventsList.length > 0) {
      return eventsList.map(ev => {
        const d = new Date(ev.startAt || ev.dateStr);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const dateStr = ev.dateStr || `${y}-${m}-${day}`;
        const wStr = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
        const dateLabel = `${d.getMonth() + 1}/${d.getDate()}(${wStr})`;

        const hasPm = ev.hasPm !== undefined ? ev.hasPm : (!!ev.pmStartAt || !!ev.pmLocation || !!ev.pmTime);
        const isMatch = ev.eventType === "match" || ev.amType === "match" || ev.pmType === "match";
        const targetGroup = ev.targetGroup || (ev.title?.match(/\[(.*?)\]/)?.[1] || null);

        return {
          id: ev.id,
          title: ev.title || (isMatch ? "公式戦・練習試合" : "通常練習"),
          date: dateLabel,
          dateStr,
          type: isMatch ? "match" : "practice",
          targetGroup,
          amTime: ev.amTime || "08:00〜12:00",
          amLocation: ev.amLocation || ev.location || "グラウンド",
          pmTime: hasPm ? (ev.pmTime || "13:00〜17:00") : "",
          pmLocation: hasPm ? (ev.pmLocation || ev.amLocation || ev.location || "") : "",
          hasPm,
          duty: ev.dutyGroup || "1班",
          needsLunch: ev.needsLunch === true || ev.needsLunch === 1 || ev.needsLunch === "1" || ev.needsLunch === "true",
          needsSnack: ev.needsSnack === true || ev.needsSnack === 1 || ev.needsSnack === "1" || ev.needsSnack === "true",
          memo: ev.description || ev.memo || "",
          carInfo: ev.carInfo,
        };
      });
    }

    if (!isDemo) {
      return [];
    }

    return [
      {
        id: "demo-today",
        title: "秋季大会 2回戦 vs レッドソックス",
        date: "8/29(土)",
        dateStr: "2026-08-29",
        type: "match",
        targetGroup: "Aチーム",
        amTime: "08:00〜12:00",
        amLocation: "市民第1球場",
        pmTime: "",
        pmLocation: "",
        hasPm: false,
        duty: "1班",
        needsLunch: true,
        needsSnack: true,
        memo: "公式戦ユニフォーム持参、8:00グラウンド集合",
        carInfo: "7:30 集合・配車調整済",
      },
      {
        id: "demo-next",
        title: "全日通常練習 & 守備連携強化",
        date: "8/30(日)",
        dateStr: "2026-08-30",
        type: "practice",
        targetGroup: "全体",
        amTime: "08:00〜12:00",
        amLocation: "大師河原第3G",
        pmTime: "13:00〜17:00",
        pmLocation: "大師河原第3G",
        hasPm: true,
        duty: "2班",
        needsLunch: true,
        needsSnack: false,
        memo: "終日練習のためお弁当持参。水分多めに持参してください。",
        carInfo: undefined,
      },
      {
        id: "demo-future",
        title: "練習試合 vs ブルースターズ",
        date: "9/5(土)",
        dateStr: "2026-09-05",
        type: "match",
        targetGroup: "Aチーム",
        amTime: "09:00〜13:00",
        amLocation: "等々力球場",
        pmTime: "14:00〜17:00",
        pmLocation: "等々力第2G",
        hasPm: true,
        duty: "3班",
      },
    ];
  }, [eventsList, isDemo]);

  // 当日予定と選択日予定・今後の予定の切り分け
  const todayCalendarEvents = allParsedEvents.filter(e => e.dateStr === todayStr);
  const selectedDateEvents = selectedDateStr !== todayStr ? allParsedEvents.filter(e => e.dateStr === selectedDateStr) : [];
  const futureCalendarEvents = allParsedEvents.filter(e => e.dateStr !== todayStr && e.dateStr >= todayStr).slice(0, 5);
  const upcomingEvents = futureCalendarEvents.length > 0 ? futureCalendarEvents : allParsedEvents.slice(0, 5);

  const getDateEvent = (dStr: string) => {
    return allParsedEvents.find(e => e.dateStr === dStr);
  };

  return (
    <div className="space-y-2.5">
      {/* セクションヘッダー */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-black text-foreground flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5 text-primary" />
          <span>チームカレンダー</span>
        </h3>
        <Link
          href="/liff/schedule"
          className="text-[11px] font-black text-primary hover:underline flex items-center gap-0.5"
        >
          <span>全予定を見る</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* カレンダー本体カード */}
      <div className="rounded-3xl bg-card border border-border/90 dark:border-border/70 shadow-xs p-3.5 space-y-3">
        {/* ━━ 1. カレンダーヘッダー（年月切り替え & 今日ボタン） ━━ */}
        <div className="flex items-center justify-between pb-1 border-b border-border/60">
          <div className="flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-black">
              <Calendar className="w-3.5 h-3.5" />
            </span>
            <span className="text-xs font-black text-foreground">
              {currentYear}年 {currentMonth + 1}月
            </span>
          </div>

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground active:scale-95 transition-all cursor-pointer"
              title="前月"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground active:scale-95 transition-all cursor-pointer"
              title="翌月"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="px-2 py-0.5 text-[10px] font-black rounded-lg bg-muted hover:bg-muted/80 text-foreground border border-border/60 active:scale-95 transition-all ml-1 cursor-pointer"
            >
              今日
            </button>
          </div>
        </div>

        {/* ━━ 2. 曜日ヘッダー ━━ */}
        <div className="grid grid-cols-7 text-center text-[10px] font-black text-muted-foreground uppercase pb-0.5 border-b border-border/50">
          {weekDays.map((day, idx) => (
            <span key={day} className={cn(idx === 0 && "text-rose-500", idx === 6 && "text-blue-500")}>
              {day}
            </span>
          ))}
        </div>

        {/* ━━ 3. 日付グリッド (42マス) ━━ */}
        <div className="grid grid-cols-7 gap-0.5">
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
                  "relative h-7 sm:h-8 flex flex-col items-center justify-center rounded-lg transition-all active:scale-95 cursor-pointer border border-transparent select-none py-0.5",
                  !day.isCurrentMonth && "text-muted-foreground/30",
                  day.isCurrentMonth && "hover:bg-muted/60",
                  day.isCurrentMonth && isSunday && "text-rose-500",
                  day.isCurrentMonth && isSaturday && "text-blue-500",
                  isToday && !isSelected && "bg-primary/10 border-primary/30 text-primary font-black",
                  isSelected && "bg-primary text-primary-foreground hover:bg-primary border-primary font-black shadow-xs"
                )}
              >
                <span className="text-[11px] font-black tabular-nums leading-none">
                  {day.date.getDate()}
                </span>

                {/* 試合・練習有無のインジケータードット */}
                {hasEvent && (
                  <span className="absolute bottom-0.5 flex h-1 w-1 justify-center">
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

        {/* ━━ 4. 予定一覧（当日の予定 ＆ 直近の予定） ━━ */}
        <div className="pt-2 border-t border-border/60 space-y-3">
          
          {/* 🔴 【当日の活動予定】 */}
          {todayCalendarEvents.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                <span className="text-xs font-black text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <span>本日（{todayCalendarEvents[0].date}）の活動予定</span>
                </span>
              </div>

              <div className="space-y-1.5">
                {todayCalendarEvents.map((ev) => (
                  <Link
                    key={ev.id}
                    href="/liff/schedule"
                    className="block p-2.5 rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 hover:border-rose-300 transition-all group"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="w-[58px] min-w-[58px] max-w-[58px] shrink-0 px-1 py-1 rounded-xl bg-rose-500 text-white flex flex-col items-center justify-center shadow-xs">
                        <span className="text-[11px] font-black leading-tight">本日</span>
                        <span className="text-[9px] font-bold mt-0.5 opacity-90">
                          {ev.type === "match" ? "⚾ 試合" : "🏃 練習"}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center gap-1.5 truncate">
                          {ev.targetGroup && ev.targetGroup !== "全体" && (
                            <span className="px-1.5 py-0.2 rounded-md bg-rose-500/20 text-rose-700 dark:text-rose-300 text-[9.5px] font-black shrink-0 border border-rose-500/30">
                              🏷️ {ev.targetGroup}
                            </span>
                          )}
                          <h4 className="text-xs font-black text-foreground group-hover:text-rose-600 transition-colors truncate">
                            {ev.title}
                          </h4>
                        </div>

                        <div className="space-y-1 text-[10.5px]">
                          <div className="flex items-center gap-2 font-bold text-foreground/90">
                            <span className="px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 text-[9.5px] font-black shrink-0 border border-amber-200 dark:border-amber-900/40">
                              ☀️ 午前
                            </span>
                            <span className="flex items-center gap-1 shrink-0 text-muted-foreground">
                              <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                              <span>{ev.amTime}</span>
                            </span>
                            <span className="flex items-center gap-1 truncate text-foreground">
                              <MapPin className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span className="truncate">{ev.amLocation}</span>
                            </span>
                          </div>

                          {ev.hasPm && (
                            <div className="flex items-center gap-2 font-bold text-foreground/90">
                              <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 text-[9.5px] font-black shrink-0 border border-indigo-200 dark:border-indigo-900/40">
                                🌙 午後
                              </span>
                              <span className="flex items-center gap-1 shrink-0 text-muted-foreground">
                                <Clock className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                                <span>{ev.pmTime || "13:00〜17:00"}</span>
                              </span>
                              <span className="flex items-center gap-1 truncate text-foreground">
                                <MapPin className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                <span className="truncate">{ev.pmLocation || ev.amLocation}</span>
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <ChevronRight className="w-4 h-4 text-rose-400 group-hover:translate-x-0.5 transition-all shrink-0 mt-2" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 🔍 【選択した日の活動予定】（本日以外の日付をタップした場合に表示） */}
          {selectedDateEvents.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs font-black text-primary flex items-center gap-1">
                <span>{selectedDate.getMonth() + 1}月{selectedDate.getDate()}日の予定</span>
              </span>

              <div className="space-y-1.5">
                {selectedDateEvents.map((ev) => (
                  <Link
                    key={ev.id}
                    href="/liff/schedule"
                    className="block p-2.5 rounded-2xl bg-primary/5 border border-primary/20 hover:border-primary/40 transition-all group"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="w-[58px] min-w-[58px] max-w-[58px] shrink-0 px-1 py-1 rounded-xl bg-primary text-primary-foreground flex flex-col items-center justify-center shadow-xs">
                        <span className="text-[11px] font-black leading-tight">{ev.date}</span>
                        <span className="text-[9px] font-bold mt-0.5 opacity-90">
                          {ev.type === "match" ? "⚾ 試合" : "🏃 練習"}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-1.5 truncate">
                          {ev.targetGroup && ev.targetGroup !== "全体" && (
                            <span className="px-1.5 py-0.2 rounded-md bg-primary/15 text-primary text-[9.5px] font-black shrink-0 border border-primary/25">
                              🏷️ {ev.targetGroup}
                            </span>
                          )}
                          <h4 className="text-xs font-black text-foreground group-hover:text-primary transition-colors truncate">
                            {ev.title}
                          </h4>
                        </div>

                        <div className="space-y-0.5 text-[10px]">
                          <div className="flex items-center gap-1.5 font-bold text-foreground/90">
                            <span className="px-1 py-0.2 rounded bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 text-[9px] font-black shrink-0 border border-amber-200 dark:border-amber-900/40">
                              ☀️ 午前
                            </span>
                            <span className="flex items-center gap-0.5 shrink-0 text-muted-foreground">
                              <Clock className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                              <span>{ev.amTime}</span>
                            </span>
                            <span className="flex items-center gap-0.5 truncate text-foreground">
                              <MapPin className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                              <span className="truncate">{ev.amLocation}</span>
                            </span>
                          </div>

                          {ev.hasPm && (
                            <div className="flex items-center gap-1.5 font-bold text-foreground/90">
                              <span className="px-1 py-0.2 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 text-[9px] font-black shrink-0 border border-indigo-200 dark:border-indigo-900/40">
                                🌙 午後
                              </span>
                              <span className="flex items-center gap-0.5 shrink-0 text-muted-foreground">
                                <Clock className="w-2.5 h-2.5 text-indigo-600 dark:text-indigo-400" />
                                <span>{ev.pmTime || "13:00〜17:00"}</span>
                              </span>
                              <span className="flex items-center gap-0.5 truncate text-foreground">
                                <MapPin className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                                <span className="truncate">{ev.pmLocation || ev.amLocation}</span>
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 mt-2" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 📅 【直近の今後の予定】 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-primary" />
                <span>{todayCalendarEvents.length > 0 ? "今後の活動予定" : "直近の活動予定"}</span>
              </span>
              <Link
                href="/liff/schedule"
                className="text-[11px] font-black text-primary hover:underline flex items-center gap-0.5"
              >
                <span>全予定カレンダー</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* 直近予定リスト */}
            <div className="space-y-2">
              {upcomingEvents.map((ev) => (
                <Link
                  key={ev.id}
                  href="/liff/schedule"
                  className="block p-2.5 rounded-2xl bg-muted/40 hover:bg-muted/70 border border-border/70 transition-all group"
                >
                  <div className="flex items-start gap-2.5">
                    {/* 均一幅（58px固定）の日付・種別バッジ */}
                    <div className={`w-[58px] min-w-[58px] max-w-[58px] shrink-0 px-1 py-1 rounded-xl flex flex-col items-center justify-center ${
                      ev.type === "match" 
                        ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900/40" 
                        : "bg-primary/10 text-primary border border-primary/20"
                    }`}>
                      <span className="text-[11px] font-black leading-tight tracking-tight">{ev.date}</span>
                      <span className="text-[9px] font-bold mt-0.5 opacity-90">
                        {ev.type === "match" ? "⚾ 試合" : "🏃 練習"}
                      </span>
                    </div>

                    {/* 予定詳細（タイトル & 午前午後の時間・場所） */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5 truncate">
                        {ev.targetGroup && ev.targetGroup !== "全体" && (
                          <span className="px-1.5 py-0.2 rounded-md bg-primary/15 text-primary text-[9.5px] font-black shrink-0 border border-primary/25">
                            🏷️ {ev.targetGroup}
                          </span>
                        )}
                        <h4 className="text-xs font-black text-foreground group-hover:text-primary transition-colors truncate">
                          {ev.title}
                        </h4>
                      </div>

                      {/* 午前・午後の時間と場所の表示 */}
                      <div className="space-y-0.5 text-[10px]">
                        {/* 午前 */}
                        <div className="flex items-center gap-1.5 font-bold text-foreground/90">
                          <span className="px-1 py-0.2 rounded bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 text-[9px] font-black shrink-0 border border-amber-200 dark:border-amber-900/40">
                            ☀️ 午前
                          </span>
                          <span className="flex items-center gap-0.5 shrink-0 text-muted-foreground">
                            <Clock className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                            <span>{ev.amTime}</span>
                          </span>
                          <span className="flex items-center gap-0.5 truncate text-foreground">
                            <MapPin className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                            <span className="truncate">{ev.amLocation}</span>
                          </span>
                        </div>

                        {/* 午後（設定がある場合） */}
                        {ev.hasPm && (
                          <div className="flex items-center gap-1.5 font-bold text-foreground/90">
                            <span className="px-1 py-0.2 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 text-[9px] font-black shrink-0 border border-indigo-200 dark:border-indigo-900/40">
                              🌙 午後
                            </span>
                            <span className="flex items-center gap-0.5 shrink-0 text-muted-foreground">
                              <Clock className="w-2.5 h-2.5 text-indigo-600 dark:text-indigo-400" />
                              <span>{ev.pmTime || "13:00〜17:00"}</span>
                            </span>
                            <span className="flex items-center gap-0.5 truncate text-foreground">
                              <MapPin className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                              <span className="truncate">{ev.pmLocation || ev.amLocation}</span>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 mt-2" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
