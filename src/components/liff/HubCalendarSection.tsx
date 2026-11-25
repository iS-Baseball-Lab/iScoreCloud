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
  PartyPopper,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { warmupLiffEndpointForHref } from "@/lib/liff/api-cache";
import { buildCalendarMonthGridDays } from "@/lib/liff/calendar-month-bg";
import { CalendarMonthPhotoMelt } from "@/components/liff/CalendarMonthPhotoMelt";
import { CalendarSwipeSurface } from "@/components/liff/CalendarSwipeSurface";
import { ImportantNoticeBanner } from "@/components/liff/ImportantNoticeBanner";
import {
  buildDemoSpecialEventsBundle,
  formatSpecialEventCompactDeadline,
  getSpecialEventCategoryMeta,
  resolveSpecialEventSortDateKey,
  type HubSpecialEventSummary,
} from "@/lib/liff/special-events-schema";

export interface HubCalendarEventInput {
  id: string;
  title?: string;
  dateStr?: string;
  startAt?: string;
  pmStartAt?: string | null;
  hasPm?: boolean;
  eventType?: string;
  amType?: string;
  amTime?: string;
  amLocation?: string;
  pmType?: string;
  pmTime?: string;
  pmLocation?: string | null;
  location?: string;
  targetGroup?: string;
  dutyGroup?: string | null;
  needsLunch?: boolean | number | string;
  needsSnack?: boolean | number | string;
  description?: string;
  memo?: string;
  importantNotice?: string;
  carInfo?: string;
}

interface HubCalendarSectionProps {
  eventsList?: HubCalendarEventInput[];
  specialEvents?: HubSpecialEventSummary[];
  isDemo?: boolean;
}

interface ParsedCalendarItem {
  id: string;
  title: string;
  date: string;
  dateStr: string;
  type: "match" | "practice" | "special";
  specialBadgeLabel?: string;
  href: string;
  targetGroup: string | null;
  amTime: string;
  amLocation: string;
  pmTime: string;
  pmLocation: string;
  hasPm: boolean;
  duty?: string;
  needsLunch?: boolean;
  needsSnack?: boolean;
  memo?: string;
  importantNotice?: string;
  carInfo?: string;
  specialHeadcount?: number;
}

export function HubCalendarSection({
  eventsList = [],
  specialEvents = [],
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

  const weekDays = ["日", "月", "火", "水", "木", "金", "土"];

  // チームの全予定リスト（午前・午後データ＋確定済みの特別行事含む）
  const allParsedEvents = useMemo<ParsedCalendarItem[]>(() => {
    const baseEvents: ParsedCalendarItem[] =
      eventsList && eventsList.length > 0
        ? eventsList.map((ev) => {
            const d = new Date(ev.startAt || ev.dateStr || "");
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            const dateStr = ev.dateStr || `${y}-${m}-${day}`;
            const wStr = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
            const dateLabel = `${d.getMonth() + 1}/${d.getDate()}(${wStr})`;

            const hasPm =
              ev.hasPm !== undefined
                ? ev.hasPm
                : Boolean(ev.pmStartAt || ev.pmLocation || ev.pmTime);
            const isMatch =
              ev.eventType === "match" ||
              ev.amType === "match" ||
              ev.pmType === "match";
            const targetGroup =
              ev.targetGroup || ev.title?.match(/\[(.*?)\]/)?.[1] || null;

            return {
              id: ev.id,
              title: ev.title || (isMatch ? "公式戦・練習試合" : "通常練習"),
              date: dateLabel,
              dateStr,
              type: isMatch ? "match" : "practice",
              href: "/liff/schedule",
              targetGroup,
              amTime: ev.amTime || "08:00〜12:00",
              amLocation: ev.amLocation || ev.location || "グラウンド",
              pmTime: hasPm ? ev.pmTime || "13:00〜17:00" : "",
              pmLocation: hasPm
                ? ev.pmLocation || ev.amLocation || ev.location || ""
                : "",
              hasPm,
              duty: ev.dutyGroup && ev.dutyGroup !== "なし" ? ev.dutyGroup : "",
              needsLunch:
                ev.needsLunch === true ||
                ev.needsLunch === 1 ||
                ev.needsLunch === "1" ||
                ev.needsLunch === "true",
              needsSnack:
                ev.needsSnack === true ||
                ev.needsSnack === 1 ||
                ev.needsSnack === "1" ||
                ev.needsSnack === "true",
              memo: ev.description || ev.memo || "",
              importantNotice: ev.importantNotice || "",
              carInfo: ev.carInfo,
            };
          })
        : isDemo
        ? [
            {
              id: "demo-today",
              title: "秋季大会 2回戦 vs レッドソックス",
              date: "8/29(土)",
              dateStr: "2026-08-29",
              type: "match",
              href: "/liff/schedule",
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
              importantNotice: "球場駐車場は各チーム4台までの制限あり（乗り合わせ厳守・金属スパイク禁止）",
              carInfo: "7:30 集合・配車調整済",
            },
            {
              id: "demo-next",
              title: "全日通常練習 & 守備連携強化",
              date: "8/30(日)",
              dateStr: "2026-08-30",
              type: "practice",
              href: "/liff/schedule",
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
              href: "/liff/schedule",
              targetGroup: "Aチーム",
              amTime: "09:00〜13:00",
              amLocation: "等々力球場",
              pmTime: "14:00〜17:00",
              pmLocation: "等々力第2G",
              hasPm: true,
              duty: "3班",
            },
          ]
        : [];

    const effectiveSpecialForDots =
      specialEvents && specialEvents.length > 0
        ? specialEvents
        : isDemo
        ? buildDemoSpecialEventsBundle().hubSummaries
        : [];

    const specialParsed: ParsedCalendarItem[] = effectiveSpecialForDots
      .filter((sp) => sp.mode === "rsvp" && sp.eventDate && sp.status !== "archived")
      .map((sp) => {
        const cat = getSpecialEventCategoryMeta(sp.category);
        return {
          id: `spev_${sp.id}`,
          title: sp.title,
          date: sp.eventDateLabel || sp.eventDate!,
          dateStr: sp.eventDate!,
          type: "special" as const,
          specialBadgeLabel: `${cat.icon} ${cat.shortLabel}`,
          href: `/liff/events?id=${encodeURIComponent(sp.id)}`,
          targetGroup: null,
          amTime: sp.timeRangeLabel,
          amLocation: sp.location || "会場調整中",
          pmTime: "",
          pmLocation: "",
          hasPm: false,
          importantNotice: sp.importantNotice || "",
          specialHeadcount: sp.totalHeadcount,
        };
      });

    return [...baseEvents, ...specialParsed].sort((a, b) =>
      a.dateStr.localeCompare(b.dateStr)
    );
  }, [eventsList, specialEvents, isDemo]);

  // 当日予定と選択日予定（カレンダー日付タップ時は通常予定＋確定済行事を両方表示）
  const todayCalendarEvents = allParsedEvents.filter((e) => e.dateStr === todayStr);
  const selectedDateEvents =
    selectedDateStr !== todayStr
      ? allParsedEvents.filter((e) => e.dateStr === selectedDateStr)
      : [];

  // 📅 今後の活動予定（通常の練習・試合等のみで最大5件）
  const regularOnlyEvents = useMemo(
    () => allParsedEvents.filter((e) => e.type !== "special"),
    [allParsedEvents]
  );
  const futureCalendarEvents = regularOnlyEvents
    .filter((e) => e.dateStr !== todayStr && e.dateStr >= todayStr)
    .slice(0, 5);
  const upcomingEvents =
    futureCalendarEvents.length > 0
      ? futureCalendarEvents
      : regularOnlyEvents.slice(0, 5);

  // 🎉 行事・アンケート（今後の活動予定とは別枠で最大5件）
  const upcomingSpecialEvents = useMemo<HubSpecialEventSummary[]>(() => {
    const source =
      specialEvents && specialEvents.length > 0
        ? specialEvents
        : isDemo
        ? buildDemoSpecialEventsBundle().hubSummaries
        : [];

    const active = source.filter((sp) => {
      if (sp.status === "archived") return false;
      if (sp.mode === "rsvp" && sp.eventDate && sp.eventDate < todayStr && sp.status !== "open") {
        return false;
      }
      return true;
    });

    return [...active]
      .sort((a, b) => {
        const statusDiff = (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1);
        if (statusDiff !== 0) return statusDiff;
        const aDate = resolveSpecialEventSortDateKey(a);
        const bDate = resolveSpecialEventSortDateKey(b);
        return aDate.localeCompare(bDate);
      })
      .slice(0, 5);
  }, [isDemo, specialEvents, todayStr]);

  const getDateFlags = (dStr: string) => {
    const items = allParsedEvents.filter((e) => e.dateStr === dStr);
    return {
      hasRegular: items.some((i) => i.type !== "special"),
      hasSpecial: items.some((i) => i.type === "special"),
    };
  };

  return (
    <div className="space-y-2.5">
      {/* セクションヘッダー */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-black text-foreground flex items-center gap-1.5">
          <span className="w-5 h-5 rounded-md bg-teal-500/12 text-teal-600 dark:text-teal-400 flex items-center justify-center">
            <CalendarDays className="w-3.5 h-3.5" />
          </span>
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

      {/* カレンダー本体カード（A-3 上帯ダークキャップ × 純白グリッド） */}
      <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
        {/* ━━ 1. A-3 カレンダーダークヘッダー（年月切り替え & 今日ボタン） ━━ */}
        <div className="px-3.5 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-teal-500 text-slate-950 flex items-center justify-center font-black">
              <Calendar className="w-3.5 h-3.5" />
            </span>
            <span className="text-xs sm:text-sm font-black text-white tabular-nums">
              {currentYear}年 {currentMonth + 1}月
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white active:scale-95 transition-all cursor-pointer"
              title="前月"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white active:scale-95 transition-all cursor-pointer"
              title="翌月"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="px-2.5 py-0.5 text-[10px] font-black rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 active:scale-95 transition-all ml-0.5 cursor-pointer"
            >
              今日
            </button>
          </div>
        </div>

        <CalendarSwipeSurface
          year={currentYear}
          monthIndex={currentMonth}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
        >
          {(pane) => {
            const paneDays = buildCalendarMonthGridDays(
              pane.year,
              pane.monthIndex
            );
            return (
              <>
                <CalendarMonthPhotoMelt
                  month={pane.monthNumber}
                  variant="default"
                  eager
                />

                <div className="relative z-10 px-3.5 pb-2.5 pt-[47.5%] space-y-2.5">
                  {/* ━━ 2. 曜日ヘッダー ━━ */}
                  <div className="grid grid-cols-7 text-center text-[10px] font-black text-foreground uppercase pb-0.5 border-b border-border/60">
                    {weekDays.map((day, idx) => (
                      <span
                        key={day}
                        className={cn(
                          idx === 0 && "text-red-600 dark:text-red-400",
                          idx === 6 && "text-blue-600 dark:text-blue-400"
                        )}
                      >
                        {day}
                      </span>
                    ))}
                  </div>

                  {/* ━━ 3. 日付グリッド (42マス) ━━ */}
                  <div className="grid grid-cols-7 gap-0.5">
                    {paneDays.map((day, idx) => {
                      const dayStr = day.dateStr;
                      const isSelected = selectedDateStr === dayStr;
                      const isToday = todayStr === dayStr;
                      const flags = getDateFlags(dayStr);

                      const dayOfWeek = day.date.getDay();
                      const isRedDay = dayOfWeek === 0 || day.isHoliday;
                      const isBlueDay = !isRedDay && dayOfWeek === 6;

                      return (
                        <button
                          key={idx}
                          type="button"
                          title={day.holidayName || undefined}
                          onClick={() => setSelectedDate(day.date)}
                          className={cn(
                            "relative h-7 sm:h-8 flex flex-col items-center justify-center rounded-lg transition-all active:scale-95 cursor-pointer border border-transparent select-none py-0.5",
                            !day.isCurrentMonth && "text-muted-foreground/30",
                            day.isCurrentMonth && "hover:bg-muted/60",
                            day.isCurrentMonth && isRedDay && "text-red-500",
                            day.isCurrentMonth && isBlueDay && "text-blue-500",
                            isToday &&
                              !isSelected &&
                              cn(
                                "bg-primary/10 border-primary/30 font-black",
                                isRedDay
                                  ? "text-red-500"
                                  : isBlueDay
                                  ? "text-blue-500"
                                  : "text-primary"
                              ),
                            isSelected &&
                              "bg-primary text-primary-foreground hover:bg-primary border-primary font-black shadow-xs"
                          )}
                        >
                          <span className="text-[11px] font-black tabular-nums leading-none">
                            {day.date.getDate()}
                          </span>

                          {/* 試合・練習・特別行事のインジケータードット */}
                          {(flags.hasRegular || flags.hasSpecial) && (
                            <span className="absolute bottom-0.5 flex items-center gap-0.5 justify-center">
                              {flags.hasRegular && (
                                <span
                                  className={cn(
                                    "h-1 w-1 rounded-full",
                                    isSelected
                                      ? "bg-primary-foreground"
                                      : "bg-primary"
                                  )}
                                />
                              )}
                              {flags.hasSpecial && (
                                <span
                                  className={cn(
                                    "h-1.5 w-1.5 rounded-full",
                                    isSelected
                                      ? "bg-amber-300"
                                      : "bg-amber-500"
                                  )}
                                />
                              )}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            );
          }}
        </CalendarSwipeSurface>

        {/* ━━ 4. 予定一覧（当日の予定 ＆ 直近の予定） ━━ */}
        <div className="px-3.5 pb-3.5 bg-card">
        <div className="pt-2 border-t border-border/60 space-y-3">
          
          {/* 🔴 【当日の活動予定】 */}
          {todayCalendarEvents.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary ring-2 ring-primary/25 shrink-0" />
                <span className="text-xs font-black text-primary flex items-center gap-1">
                  <span>本日（{todayCalendarEvents[0].date}）の活動予定</span>
                </span>
              </div>

              <div className="space-y-1.5">
                {todayCalendarEvents.map((ev) => (
                  <Link
                    key={ev.id}
                    href={ev.href}
                    className={cn(
                      "block p-2.5 rounded-2xl border border-l-4 transition-all group",
                      ev.type === "special"
                        ? "bg-amber-500/5 border-amber-500/30 border-l-amber-500 hover:border-amber-500/50"
                        : "bg-primary/5 border-primary/25 border-l-primary hover:border-primary/40"
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={cn(
                          "w-[58px] min-w-[58px] max-w-[58px] shrink-0 px-1 py-1 rounded-xl flex flex-col items-center justify-center border",
                          ev.type === "special"
                            ? "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/35"
                            : ev.type === "match"
                            ? "bg-primary/12 text-primary border-primary/25"
                            : "bg-teal-500/12 text-teal-700 dark:text-teal-300 border-teal-500/25"
                        )}
                      >
                        <span className="text-[11px] font-black leading-tight">本日</span>
                        <span className="text-[9px] font-bold mt-0.5 opacity-90 truncate max-w-full">
                          {ev.type === "special"
                            ? ev.specialBadgeLabel || "🎉 行事"
                            : ev.type === "match"
                            ? "⚾ 試合"
                            : "🏃 練習"}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center gap-1.5 truncate">
                          {ev.targetGroup && ev.targetGroup !== "全体" && (
                            <span className="px-1.5 py-0.2 rounded-md bg-primary/12 text-primary text-[9.5px] font-black shrink-0 border border-primary/25">
                              🏷️ {ev.targetGroup}
                            </span>
                          )}
                          <h4 className="text-xs font-black text-foreground group-hover:text-primary transition-colors truncate">
                            {ev.title}
                          </h4>
                        </div>

                        <div className="space-y-1 text-[10.5px]">
                          <div className="flex items-center gap-2 font-bold text-foreground/90">
                            <span
                              className={cn(
                                "w-[48px] min-w-[48px] max-w-[48px] py-0.5 rounded text-[9.5px] font-black shrink-0 border flex items-center justify-center",
                                ev.type === "special"
                                  ? "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/35"
                                  : "bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/25"
                              )}
                            >
                              {ev.type === "special" ? "🎉 行事" : "☀️ 午前"}
                            </span>
                            <span className="w-[88px] min-w-[88px] max-w-[88px] flex items-center gap-1 shrink-0 text-muted-foreground tabular-nums text-[10px]">
                              <Clock className="w-3 h-3 text-sky-600 dark:text-sky-400 shrink-0" />
                              <span className="truncate">{ev.amTime}</span>
                            </span>
                            <span className="flex items-center gap-1 truncate text-foreground min-w-0 flex-1 text-[10px]">
                              <MapPin className="w-3 h-3 text-teal-600 dark:text-teal-400 shrink-0" />
                              <span className="truncate">{ev.amLocation}</span>
                            </span>
                          </div>

                          {ev.hasPm && (
                            <div className="flex items-center gap-2 font-bold text-foreground/90">
                              <span className="w-[48px] min-w-[48px] max-w-[48px] py-0.5 rounded bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 text-[9.5px] font-black shrink-0 border border-indigo-500/25 flex items-center justify-center">
                                🌙 午後
                              </span>
                              <span className="w-[88px] min-w-[88px] max-w-[88px] flex items-center gap-1 shrink-0 text-muted-foreground tabular-nums text-[10px]">
                                <Clock className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
                                <span className="truncate">{ev.pmTime || "13:00〜17:00"}</span>
                              </span>
                              <span className="flex items-center gap-1 truncate text-foreground min-w-0 flex-1 text-[10px]">
                                <MapPin className="w-3 h-3 text-teal-600 dark:text-teal-400 shrink-0" />
                                <span className="truncate">{ev.pmLocation || ev.amLocation}</span>
                              </span>
                            </div>
                          )}
                        </div>

                        <ImportantNoticeBanner notice={ev.importantNotice} compact />
                      </div>

                      <ChevronRight className="w-4 h-4 text-primary group-hover:translate-x-0.5 transition-all shrink-0 mt-2" />
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
                    href={ev.href}
                    className={cn(
                      "block p-2.5 rounded-2xl border border-l-4 transition-all group",
                      ev.type === "special"
                        ? "bg-amber-500/5 border-amber-500/30 border-l-amber-500 hover:border-amber-500/50"
                        : "bg-primary/5 border-primary/25 border-l-primary hover:border-primary/40"
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={cn(
                          "w-[58px] min-w-[58px] max-w-[58px] shrink-0 px-1 py-1 rounded-xl flex flex-col items-center justify-center border",
                          ev.type === "special"
                            ? "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/35"
                            : ev.type === "match"
                            ? "bg-primary/12 text-primary border-primary/25"
                            : "bg-teal-500/12 text-teal-700 dark:text-teal-300 border-teal-500/25"
                        )}
                      >
                        <span className="text-[11px] font-black leading-tight">{ev.date}</span>
                        <span className="text-[9px] font-bold mt-0.5 opacity-90 truncate max-w-full">
                          {ev.type === "special"
                            ? ev.specialBadgeLabel || "🎉 行事"
                            : ev.type === "match"
                            ? "⚾ 試合"
                            : "🏃 練習"}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-1.5 truncate">
                          {ev.targetGroup && ev.targetGroup !== "全体" && (
                            <span className="px-1.5 py-0.2 rounded-md bg-primary/12 text-primary text-[9.5px] font-black shrink-0 border border-primary/25">
                              🏷️ {ev.targetGroup}
                            </span>
                          )}
                          <h4 className="text-xs font-black text-foreground group-hover:text-primary transition-colors truncate">
                            {ev.title}
                          </h4>
                        </div>

                        <div className="space-y-0.5 text-[10px]">
                          <div className="flex items-center gap-1.5 font-bold text-foreground/90">
                            <span
                              className={cn(
                                "w-[46px] min-w-[46px] max-w-[46px] py-0.2 rounded text-[9px] font-black shrink-0 border flex items-center justify-center",
                                ev.type === "special"
                                  ? "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/35"
                                  : "bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/25"
                              )}
                            >
                              {ev.type === "special" ? "🎉 行事" : "☀️ 午前"}
                            </span>
                            <span className="w-[84px] min-w-[84px] max-w-[84px] flex items-center gap-0.5 shrink-0 text-muted-foreground tabular-nums">
                              <Clock className="w-2.5 h-2.5 text-sky-600 dark:text-sky-400 shrink-0" />
                              <span className="truncate">{ev.amTime}</span>
                            </span>
                            <span className="flex items-center gap-0.5 truncate text-foreground min-w-0 flex-1">
                              <MapPin className="w-2.5 h-2.5 text-teal-600 dark:text-teal-400 shrink-0" />
                              <span className="truncate">{ev.amLocation}</span>
                            </span>
                          </div>

                          {ev.hasPm && (
                            <div className="flex items-center gap-1.5 font-bold text-foreground/90">
                              <span className="w-[46px] min-w-[46px] max-w-[46px] py-0.2 rounded bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 text-[9px] font-black shrink-0 border border-indigo-500/25 flex items-center justify-center">
                                🌙 午後
                              </span>
                              <span className="w-[84px] min-w-[84px] max-w-[84px] flex items-center gap-0.5 shrink-0 text-muted-foreground tabular-nums">
                                <Clock className="w-2.5 h-2.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                                <span className="truncate">{ev.pmTime || "13:00〜17:00"}</span>
                              </span>
                              <span className="flex items-center gap-0.5 truncate text-foreground min-w-0 flex-1">
                                <MapPin className="w-2.5 h-2.5 text-teal-600 dark:text-teal-400 shrink-0" />
                                <span className="truncate">{ev.pmLocation || ev.amLocation}</span>
                              </span>
                            </div>
                          )}
                        </div>

                        <ImportantNoticeBanner notice={ev.importantNotice} compact />
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
                <CalendarDays className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
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
                  href={ev.href}
                  className={cn(
                    "block p-2.5 rounded-2xl border transition-all group",
                    ev.type === "special"
                      ? "bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/30 hover:border-amber-500/50"
                      : "bg-muted/35 hover:bg-muted/60 border-border/60 hover:border-primary/40"
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    {/* 均一幅（58px固定）の日付・種別バッジ */}
                    <div
                      className={cn(
                        "w-[58px] min-w-[58px] max-w-[58px] shrink-0 px-1 py-1 rounded-xl flex flex-col items-center justify-center border",
                        ev.type === "special"
                          ? "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/35"
                          : ev.type === "match"
                          ? "bg-primary/12 text-primary border-primary/25 shadow-2xs"
                          : "bg-teal-500/12 text-teal-700 dark:text-teal-300 border-teal-500/25"
                      )}
                    >
                      <span className="text-[11px] font-black leading-tight tracking-tight">{ev.date}</span>
                      <span className="text-[9px] font-bold mt-0.5 opacity-90 truncate max-w-full">
                        {ev.type === "special"
                          ? ev.specialBadgeLabel || "🎉 行事"
                          : ev.type === "match"
                          ? "⚾ 試合"
                          : "🏃 練習"}
                      </span>
                    </div>

                    {/* 予定詳細（タイトル & 午前午後の時間・場所） */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5 truncate">
                        {ev.targetGroup && ev.targetGroup !== "全体" && (
                          <span className="px-1.5 py-0.2 rounded-md bg-primary/12 text-primary text-[9.5px] font-black shrink-0 border border-primary/25">
                            🏷️ {ev.targetGroup}
                          </span>
                        )}
                        <h4 className="text-xs font-black text-foreground group-hover:text-primary transition-colors truncate">
                          {ev.title}
                        </h4>
                      </div>

                      {/* 午前・午後の時間と場所の表示 */}
                      <div className="space-y-0.5 text-[10px]">
                        {/* 午前 / 特別行事 */}
                        <div className="flex items-center gap-1.5 font-bold text-foreground/90">
                          <span
                            className={cn(
                              "w-[46px] min-w-[46px] max-w-[46px] py-0.2 rounded text-[9px] font-black shrink-0 border flex items-center justify-center",
                              ev.type === "special"
                                ? "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/35"
                                : "bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/25"
                            )}
                          >
                            {ev.type === "special" ? "🎉 行事" : "☀️ 午前"}
                          </span>
                          <span className="w-[84px] min-w-[84px] max-w-[84px] flex items-center gap-0.5 shrink-0 text-muted-foreground tabular-nums">
                            <Clock className="w-2.5 h-2.5 text-sky-600 dark:text-sky-400 shrink-0" />
                            <span className="truncate">{ev.amTime}</span>
                          </span>
                          <span className="flex items-center gap-0.5 truncate text-foreground min-w-0 flex-1">
                            <MapPin className="w-2.5 h-2.5 text-teal-600 dark:text-teal-400 shrink-0" />
                            <span className="truncate">{ev.amLocation}</span>
                          </span>
                        </div>

                        {/* 午後（設定がある場合） */}
                        {ev.hasPm && (
                          <div className="flex items-center gap-1.5 font-bold text-foreground/90">
                            <span className="w-[46px] min-w-[46px] max-w-[46px] py-0.2 rounded bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 text-[9px] font-black shrink-0 border border-indigo-500/25 flex items-center justify-center">
                              🌙 午後
                            </span>
                            <span className="w-[84px] min-w-[84px] max-w-[84px] flex items-center gap-0.5 shrink-0 text-muted-foreground tabular-nums">
                              <Clock className="w-2.5 h-2.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                              <span className="truncate">{ev.pmTime || "13:00〜17:00"}</span>
                            </span>
                            <span className="flex items-center gap-0.5 truncate text-foreground min-w-0 flex-1">
                              <MapPin className="w-2.5 h-2.5 text-teal-600 dark:text-teal-400 shrink-0" />
                              <span className="truncate">{ev.pmLocation || ev.amLocation}</span>
                            </span>
                          </div>
                        )}
                      </div>

                      <ImportantNoticeBanner notice={ev.importantNotice} compact />
                    </div>

                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 mt-2" />
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* 🎉 【行事・アンケート（別枠・最大5件）】 */}
          <div className="pt-2.5 border-t border-border/60 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                <PartyPopper className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>行事・アンケート</span>
              </span>
              <Link
                href="/liff/events"
                onPointerDown={() => warmupLiffEndpointForHref("/liff/events")}
                className="text-[11px] font-black text-primary hover:underline flex items-center gap-0.5"
              >
                <span>行事・アンケート一覧</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {upcomingSpecialEvents.length === 0 ? (
              <Link
                href="/liff/events"
                onPointerDown={() => warmupLiffEndpointForHref("/liff/events")}
                className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-muted/30 hover:bg-muted/55 border border-border/60 hover:border-amber-500/40 transition-all"
              >
                <span className="text-[11px] font-bold text-muted-foreground truncate">
                  忘年会・卒団式・親子レク・日程調整の作成・確認はこちら
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </Link>
            ) : (
              <div className="space-y-2">
                {upcomingSpecialEvents.map((sp) => {
                  const cat = getSpecialEventCategoryMeta(sp.category);
                  const isPoll = sp.mode === "date_poll";

                  return (
                    <Link
                      key={sp.id}
                      href={`/liff/events?id=${encodeURIComponent(sp.id)}`}
                      onPointerDown={() =>
                        warmupLiffEndpointForHref("/liff/events")
                      }
                      className="block p-2.5 rounded-2xl bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/30 hover:border-amber-500/50 transition-all group"
                    >
                      <div className="flex items-start gap-2.5">
                        {/* 均一幅（58px固定）の日付・種別バッジ */}
                        <div className="w-[58px] min-w-[58px] max-w-[58px] shrink-0 px-1 py-1 rounded-xl flex flex-col items-center justify-center border bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/35">
                          <span className="text-[10.5px] font-black leading-tight tracking-tight truncate max-w-full">
                            {isPoll
                              ? "日程調整"
                              : sp.eventDateLabel || "日程未定"}
                          </span>
                          <span className="text-[9px] font-bold mt-0.5 opacity-90 truncate max-w-full">
                            {cat.icon} {isPoll ? "アンケート" : cat.shortLabel}
                          </span>
                        </div>

                        {/* 行事・アンケート詳細 */}
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center justify-between gap-1.5">
                            <h4 className="text-xs font-black text-foreground group-hover:text-primary transition-colors truncate">
                              {sp.title}
                            </h4>
                            <span
                              className={cn(
                                "px-1.5 py-0.5 rounded-full text-[9.5px] font-black shrink-0 border",
                                sp.status !== "open" ||
                                  sp.isMyHouseholdTarget === false
                                  ? "bg-muted text-muted-foreground border-border"
                                  : !sp.myResponded
                                  ? "bg-amber-500 text-slate-950 border-amber-400"
                                  : sp.myOverallState === "attending"
                                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/35"
                                  : "bg-muted text-muted-foreground border-border"
                              )}
                            >
                              {sp.status !== "open"
                                ? "締切済"
                                : sp.isMyHouseholdTarget === false
                                ? "ご家庭対象"
                                : !sp.myResponded
                                ? "未回答"
                                : sp.myOverallState === "attending"
                                ? isPoll
                                  ? "回答済"
                                  : `出席 ${sp.myHeadcount}名`
                                : "欠席"}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-bold text-foreground/90 text-[10px] min-w-0">
                            {isPoll ? (
                              <>
                                <span className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[9px] font-black shrink-0 border border-amber-500/35">
                                  🗳️ 候補日
                                </span>
                                <span className="flex items-center gap-0.5 text-muted-foreground truncate min-w-0 flex-1 tabular-nums">
                                  <Users className="w-2.5 h-2.5 text-teal-600 dark:text-teal-400 shrink-0" />
                                  <span className="truncate">
                                    回答 {sp.respondedHouseholdCount}/
                                    {sp.activeTargetHouseholdCount}世帯
                                  </span>
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="flex items-center gap-0.5 shrink-0 text-muted-foreground tabular-nums">
                                  <Clock className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                  <span>{sp.timeRangeLabel}</span>
                                </span>
                                <span className="flex items-center gap-0.5 truncate text-foreground min-w-0 flex-1">
                                  <MapPin className="w-2.5 h-2.5 text-teal-600 dark:text-teal-400 shrink-0" />
                                  <span className="truncate">
                                    {sp.location || "会場調整中"}
                                  </span>
                                </span>
                                <span className="shrink-0 text-teal-700 dark:text-teal-300 font-black tabular-nums">
                                  計{sp.totalHeadcount}名
                                </span>
                              </>
                            )}
                            {formatSpecialEventCompactDeadline(sp) && (
                              <span className="shrink-0 text-amber-700 dark:text-amber-300 font-black tabular-nums">
                                {formatSpecialEventCompactDeadline(sp)}
                              </span>
                            )}
                          </div>

                          <ImportantNoticeBanner notice={sp.importantNotice} compact />
                        </div>

                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 mt-2" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
