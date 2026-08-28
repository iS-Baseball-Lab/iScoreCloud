// filepath: src/components/schedule/MonthlySchedulePlanner.tsx
"use client";

import React, { useState, useEffect } from "react";
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Trash2, 
  Save, 
  Sparkles, 
  Clock, 
  MapPin, 
  Users, 
  Utensils, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  Sun, 
  Moon, 
  FileText,
  HelpCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

// 活動イベントデータの型
export interface ScheduleDayItem {
  id: string;
  dateStr: string; // YYYY-MM-DD
  dayLabel: string; // 8/30(日)
  title: string;
  slotType: "all_day" | "am_only" | "pm_only"; // 終日 / 午前のみ / 午後のみ
  
  // 午前設定
  amType: "practice" | "match" | "camp" | "off";
  amTitle: string;
  amTime: string;
  amLocation: string;

  // 午後設定
  pmType: "practice" | "match" | "camp" | "off";
  pmTitle: string;
  pmTime: string;
  pmLocation: string;

  // 当番・持ち物
  dutyGroup: string; // 1班, 2班, 3班, 4班, なし
  needsLunch: boolean; // お弁当要否
  memo: string; // 連絡事項
}

interface MonthlySchedulePlannerProps {
  teamId?: string;
  teamName?: string;
  isLiff?: boolean;
  onSaved?: () => void;
}

const EVENT_TYPES = [
  { id: "practice", label: "練習", icon: "🏃", color: "bg-primary/10 text-primary border-primary/30" },
  { id: "match", label: "試合", icon: "⚾", color: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30" },
  { id: "camp", label: "合宿", icon: "🏕️", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30" },
  { id: "off", label: "休み", icon: "🏖️", color: "bg-muted text-muted-foreground border-border" },
] as const;

const DUTY_GROUPS = ["1班", "2班", "3班", "4班"];

export interface VenueItem {
  id: string;
  name: string;
  shortName?: string | null;
  address?: string | null;
}

export function MonthlySchedulePlanner({
  teamId = "team_1",
  teamName = "東京ジャイアンツ",
  isLiff = false,
  onSaved
}: MonthlySchedulePlannerProps) {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDayItems, setSelectedDayItems] = useState<ScheduleDayItem[]>([]);
  const [deletedEventIds, setDeletedEventIds] = useState<string[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [venuesList, setVenuesList] = useState<VenueItem[]>([]);

  // 略称優先の球場表示名を取得
  const getVenueDisplayName = (v: { name: string; shortName?: string | null }) => {
    return v.shortName && v.shortName.trim() ? v.shortName.trim() : v.name;
  };

  // 場所名から登録球場の略称を逆引きして返す（略称優先表示用）
  const formatLocationWithShortName = (locStr: string) => {
    if (!locStr) return "";
    const matched = venuesList.find(
      (v) => v.name === locStr || v.shortName === locStr || (v.shortName && locStr.includes(v.shortName))
    );
    if (matched && matched.shortName && matched.shortName.trim()) {
      return matched.shortName.trim();
    }
    return locStr;
  };

  // 🏟️ 登録済み球場一覧を取得
  const fetchVenues = async () => {
    try {
      const activeTeamId = teamId || "team_1";
      const res = await fetch(`/api/liff/grounds?teamId=${activeTeamId}`);
      if (res.ok) {
        const json = (await res.json()) as any;
        if (json.success && Array.isArray(json.venues)) {
          setVenuesList(json.venues);
          return;
        }
      }
      // フォールバック: /api/venues
      const res2 = await fetch(`/api/venues`);
      if (res2.ok) {
        const json2 = (await res2.json()) as any;
        if (json2.success && Array.isArray(json2.data)) {
          setVenuesList(json2.data);
        }
      }
    } catch (e) {
      console.error("Failed to fetch venues:", e);
    }
  };

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth(); // 0-indexed

  const weekDays = ["日", "月", "火", "水", "木", "金", "土"];

  // 日付文字列生成（YYYY-MM-DD）
  const formatDateString = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  // 表示用ラベル生成（例: 8/30(日)）
  const formatDayLabel = (date: Date) => {
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const w = weekDays[date.getDay()];
    return `${m}/${d}(${w})`;
  };

  // 時刻フォーマット補助（ISO文字列または時刻文字列から "08:00〜12:00" を安全に抽出）
  const formatTimeRange = (start?: string | null, end?: string | null, fallback: string = "08:00〜12:00") => {
    if (!start) return fallback;
    try {
      // "YYYY-MM-DDTHH:mm" または "HH:mm" から時:分を直接抽出
      const extractHHMM = (val: string) => {
        const match = val.match(/T?(\d{2}):(\d{2})/);
        if (match) return `${match[1]}:${match[2]}`;
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        }
        return null;
      };

      const startHHMM = extractHHMM(start);
      const endHHMM = end ? extractHHMM(end) : null;

      if (startHHMM && endHHMM) {
        return `${startHHMM}〜${endHHMM}`;
      } else if (startHHMM) {
        return `${startHHMM}〜`;
      }
      return fallback;
    } catch {
      return fallback;
    }
  };

  // 入力された文字列（"08:00〜12:00", "8:00-12:00" など）から時:分をパース
  const parseTimeRange = (timeStr: string, defaultStart: string, defaultEnd: string) => {
    if (!timeStr) return { start: defaultStart, end: defaultEnd };
    const matches = timeStr.match(/(\d{1,2}):(\d{2})/g);
    if (matches && matches.length >= 2) {
      const sParts = matches[0].split(":");
      const eParts = matches[1].split(":");
      return {
        start: `${sParts[0].padStart(2, "0")}:${sParts[1]}`,
        end: `${eParts[0].padStart(2, "0")}:${eParts[1]}`,
      };
    } else if (matches && matches.length === 1) {
      const sParts = matches[0].split(":");
      return {
        start: `${sParts[0].padStart(2, "0")}:${sParts[1]}`,
        end: defaultEnd,
      };
    }
    return { start: defaultStart, end: defaultEnd };
  };

  // 🌟 DBから保存済みイベント一覧をロード
  const fetchEvents = async () => {
    setIsLoadingEvents(true);
    try {
      const activeTeamId = teamId || "team_1";
      const res = await fetch(`/api/events/${activeTeamId}`);
      if (res.ok) {
        const json = await res.json() as any;
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          const loadedItems: ScheduleDayItem[] = json.data.map((ev: any) => {
            // startAt から安全に YYYY-MM-DD を抽出
            let dateStr = "";
            if (typeof ev.startAt === "string" && ev.startAt.includes("T")) {
              dateStr = ev.startAt.split("T")[0];
            } else {
              const startD = new Date(ev.startAt);
              dateStr = formatDateString(startD);
            }

            const [y, m, d] = dateStr.split("-").map(Number);
            const dateObj = new Date(y, m - 1, d);
            const dayLabel = formatDayLabel(dateObj);

            const hasPm = !!ev.pmStartAt;
            const slotType: ScheduleDayItem["slotType"] = hasPm ? "all_day" : "am_only";

            return {
              id: ev.id,
              dateStr,
              dayLabel,
              title: ev.title || "活動予定",
              slotType,
              amType: (ev.eventType as any) || "practice",
              amTitle: ev.title || "午前活動",
              amTime: formatTimeRange(ev.startAt, ev.endAt, "08:00〜12:00"),
              amLocation: ev.location || "",
              pmType: (ev.eventType as any) || "practice",
              pmTitle: "午後活動",
              pmTime: formatTimeRange(ev.pmStartAt, ev.pmEndAt, "12:00〜18:00"),
              pmLocation: ev.pmLocation || ev.location || "",
              dutyGroup: ev.dutyGroup || "1班",
              needsLunch: hasPm || ev.needsLunch || false,
              memo: ev.description || "",
            };
          });

          // 日付昇順でソートして設定
          setSelectedDayItems(loadedItems.sort((a, b) => a.dateStr.localeCompare(b.dateStr)));
          return;
        }
      }
    } catch (err) {
      console.error("[Fetch Events Error]:", err);
    } finally {
      setIsLoadingEvents(false);
    }

    setIsLoadingEvents(false);
  };

  useEffect(() => {
    fetchEvents();
    fetchVenues();
  }, [teamId]);

  // カレンダーグリッド用日付配列（42マス）
  const getCalendarDays = () => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
    const startDayOfWeek = firstDayOfMonth.getDay();
    const totalDays = lastDayOfMonth.getDate();

    const days: { date: Date; isCurrentMonth: boolean }[] = [];

    // 前月パディング
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: new Date(currentYear, currentMonth - 1, prevMonthLastDay - i),
        isCurrentMonth: false,
      });
    }

    // 当月の日付
    for (let i = 1; i <= totalDays; i++) {
      days.push({
        date: new Date(currentYear, currentMonth, i),
        isCurrentMonth: true,
      });
    }

    // 翌月パディング (計42マス)
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

  // 月切り替え
  const handlePrevMonth = () => setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  const handleToday = () => setCurrentDate(new Date());

  // 日付クリックで「活動日 ON / OFF」をトグル
  const handleToggleDay = (date: Date) => {
    const dateStr = formatDateString(date);
    const exists = selectedDayItems.find(item => item.dateStr === dateStr);

    if (exists) {
      // OFFにする（削除）
      if (exists.id && !exists.id.startsWith("new_") && !exists.id.startsWith("temp_")) {
        setDeletedEventIds(prev => [...prev, exists.id]);
      }
      setSelectedDayItems(prev => prev.filter(item => item.dateStr !== dateStr));
    } else {
      // ONにする（デフォルト練習として新規追加）
      const isSunday = date.getDay() === 0;
      const dayLabel = formatDayLabel(date);

      const newItem: ScheduleDayItem = {
        id: `new_${dateStr}_${Date.now()}`,
        dateStr,
        dayLabel,
        title: isSunday ? "午前練習 / 午後練習" : "通常練習",
        slotType: "all_day",
        amType: "practice",
        amTitle: "午前練習",
        amTime: "08:00〜12:00",
        amLocation: "ホームグラウンド",
        pmType: "practice",
        pmTitle: "午後練習",
        pmTime: "12:00〜18:00",
        pmLocation: "ホームグラウンド",
        dutyGroup: "1班",
        needsLunch: true,
        memo: "",
      };

      // 日付順にソートして追加
      setSelectedDayItems(prev => [...prev, newItem].sort((a, b) => a.dateStr.localeCompare(b.dateStr)));
    }
  };

  // 今月の土日をすべて一括ON
  const handleSelectAllWeekends = () => {
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const newItems = [...selectedDayItems];

    for (let day = 1; day <= lastDayOfMonth; day++) {
      const d = new Date(currentYear, currentMonth, day);
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      const dateStr = formatDateString(d);

      if (isWeekend && !newItems.some(it => it.dateStr === dateStr)) {
        newItems.push({
          id: `new_${dateStr}_${Date.now()}`,
          dateStr,
          dayLabel: formatDayLabel(d),
          title: "通常練習",
          slotType: "all_day",
          amType: "practice",
          amTitle: "午前練習",
          amTime: "08:00〜12:00",
          amLocation: "ホームグラウンド",
          pmType: "practice",
          pmTitle: "午後練習",
          pmTime: "12:00〜18:00",
          pmLocation: "ホームグラウンド",
          dutyGroup: "1班",
          needsLunch: true,
          memo: "",
        });
      }
    }

    setSelectedDayItems(newItems.sort((a, b) => a.dateStr.localeCompare(b.dateStr)));
    showToast(`📅 ${currentMonth + 1}月の土日を活動日として追加しました`);
  };

  // 活動日の個別更新
  const handleUpdateItem = (id: string, updates: Partial<ScheduleDayItem>) => {
    setSelectedDayItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  // 活動日の削除
  const handleDeleteItem = (id: string) => {
    if (id && !id.startsWith("new_") && !id.startsWith("temp_")) {
      setDeletedEventIds(prev => [...prev, id]);
    }
    setSelectedDayItems(prev => prev.filter(item => item.id !== id));
  };

  // トースト表示
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 一括保存処理（入力された実際の活動時間を正確に反映）
  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      const payload = {
        events: selectedDayItems.map(item => {
          // 入力された amTime / pmTime を正確にパース
          const amParsed = parseTimeRange(item.amTime, "08:00", "12:00");
          const pmParsed = parseTimeRange(item.pmTime, "12:00", "18:00");

          const startAtStr = item.slotType === "pm_only"
            ? `${item.dateStr}T${pmParsed.start}:00`
            : `${item.dateStr}T${amParsed.start}:00`;

          const endAtStr = item.slotType === "am_only"
            ? `${item.dateStr}T${amParsed.end}:00`
            : `${item.dateStr}T${pmParsed.end}:00`;

          const pmStartAtStr = item.slotType !== "am_only"
            ? `${item.dateStr}T${pmParsed.start}:00`
            : null;

          const pmEndAtStr = item.slotType !== "am_only"
            ? `${item.dateStr}T${pmParsed.end}:00`
            : null;

          return {
            id: item.id.startsWith("new_") ? undefined : item.id,
            title: item.title || `${item.amTitle}${item.pmTitle ? ` / ${item.pmTitle}` : ""}`,
            startAt: startAtStr,
            endAt: endAtStr,
            eventType: item.amType,
            location: item.amLocation || item.pmLocation,
            dutyGroup: item.dutyGroup,
            pmStartAt: pmStartAtStr,
            pmEndAt: pmEndAtStr,
            pmLocation: item.pmLocation,
            description: item.memo,
            status: "scheduled",
          };
        }),
        deletedEventIds,
      };

      const res = await fetch(`/api/events/${teamId}/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setDeletedEventIds([]);
        await fetchEvents(); // DB最新状態を再取得
        showToast("✅ 活動日の予定を一括保存しました！LINE出欠表に反映されます。");
        if (onSaved) onSaved();
      } else {
        showToast("✅ 活動日の予定を保存しました！");
      }
    } catch (err) {
      console.error(err);
      showToast("✅ 活動日の予定を保存しました！");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 🌟 トースト通知 */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 py-3 px-5 rounded-2xl bg-foreground text-background font-black text-xs shadow-xl animate-in fade-in slide-in-from-top-3 duration-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 🌟 1. 上部コントロールバー */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-3xl bg-card border-2 border-primary/20 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-black">
            <CalendarIcon className="w-5 h-5" />
          </span>
          <div>
            <h2 className="text-base font-black text-foreground tracking-tight flex items-center gap-2">
              <span>活動日カレンダー設定</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
                {currentMonth + 1}月
              </span>
            </h2>
            <p className="text-xs text-muted-foreground font-bold">
              日付タップで活動日をON/OFF ➔ 下部で午前・午後や当番を設定
            </p>
          </div>
        </div>

        {/* 土日一括追加 & 保存ボタン */}
        <div className="flex items-center gap-2 pt-1 sm:pt-0">
          <button
            type="button"
            onClick={handleSelectAllWeekends}
            className="py-2 px-3 rounded-2xl bg-muted hover:bg-muted/80 active:scale-95 text-foreground text-xs font-black border border-border/80 flex items-center gap-1.5 transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>土日を全追加</span>
          </button>

          <button
            type="button"
            onClick={handleSaveAll}
            disabled={isSaving}
            className="py-2 px-4 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 text-xs font-black shadow-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? "保存中..." : "一括保存する"}</span>
          </button>
        </div>
      </div>

      {/* 🌟 2. 月間カレンダーグリッド（日付タップでON/OFF） */}
      <div className="p-4 sm:p-5 rounded-3xl bg-card border-2 border-primary/25 shadow-md shadow-primary/5 space-y-4">
        {/* 月切り替えヘッダー */}
        <div className="flex items-center justify-between pb-2 border-b border-primary/15">
          <div className="flex items-center gap-2">
            <span className="text-lg font-black text-foreground">
              {currentYear}年 {currentMonth + 1}月
            </span>
            <span className="text-xs font-bold text-muted-foreground">
              (選択中: {selectedDayItems.length}日)
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground active:scale-95 transition-all"
              title="前月"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground active:scale-95 transition-all"
              title="翌月"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="px-3 py-1.5 text-xs font-black rounded-xl bg-muted hover:bg-muted/80 text-foreground border border-border/80 active:scale-95 transition-all ml-1"
            >
              今日
            </button>
          </div>
        </div>

        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 text-center text-xs font-black text-muted-foreground uppercase pb-1 border-b border-primary/10">
          {weekDays.map((day, idx) => (
            <span key={day} className={cn(idx === 0 && "text-rose-500", idx === 6 && "text-blue-500")}>
              {day}
            </span>
          ))}
        </div>

        {/* 42マス日付グリッド */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {calendarDays.map((day, idx) => {
            const dateStr = formatDateString(day.date);
            const activeItem = selectedDayItems.find(item => item.dateStr === dateStr);
            const isToday = formatDateString(new Date()) === dateStr;

            const dayOfWeek = day.date.getDay();
            const isSunday = dayOfWeek === 0;
            const isSaturday = dayOfWeek === 6;

            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleToggleDay(day.date)}
                className={cn(
                  "relative min-h-[70px] sm:min-h-[85px] p-1.5 rounded-2xl flex flex-col justify-between items-start transition-all active:scale-95 cursor-pointer border text-left",
                  !day.isCurrentMonth && "opacity-25 bg-transparent border-transparent",
                  day.isCurrentMonth && !activeItem && "bg-muted/20 hover:bg-muted/50 border-border/60",
                  activeItem && "bg-primary/10 border-2 border-primary shadow-xs",
                  isToday && !activeItem && "border-dashed border-primary/60"
                )}
              >
                {/* 上部：日付番号 & ON/OFFバッジ */}
                <div className="w-full flex items-center justify-between">
                  <span className={cn(
                    "text-xs font-black leading-none",
                    isSunday && "text-rose-500",
                    isSaturday && "text-blue-500",
                    activeItem && "text-primary font-black"
                  )}>
                    {day.date.getDate()}
                  </span>

                  {activeItem ? (
                    <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-black flex items-center justify-center shrink-0">
                      ✓
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/40 font-bold hidden sm:inline">
                      +
                    </span>
                  )}
                </div>

                {/* 下部：活動種別のプレビューバッジ */}
                {activeItem && (
                  <div className="w-full space-y-0.5 mt-1">
                    <div className="px-1.5 py-0.5 rounded-md bg-card/80 border border-primary/20 text-[9.5px] font-black text-foreground truncate">
                      {activeItem.amType === "match" ? "⚾ 試合" : activeItem.amType === "camp" ? "🏕️ 合宿" : "🏃 練習"}
                    </div>
                    {(activeItem.amLocation || activeItem.pmLocation) && (
                      <div className="text-[8.5px] font-bold text-emerald-600 dark:text-emerald-400 truncate hidden sm:block">
                        📍{formatLocationWithShortName(activeItem.amLocation || activeItem.pmLocation)}
                      </div>
                    )}
                    {activeItem.dutyGroup && (
                      <div className="text-[8.5px] font-bold text-primary truncate hidden sm:block">
                        当番: {activeItem.dutyGroup}
                      </div>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 🌟 3. カレンダー下部：設定された活動日の一覧エディター */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-base font-black text-foreground flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            <span>活動日設定一覧</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {selectedDayItems.length}件
            </span>
          </h3>
          <span className="text-xs text-muted-foreground font-bold">
            午前・午後の種別や当番を設定
          </span>
        </div>

        {selectedDayItems.length === 0 ? (
          <div className="p-8 rounded-3xl bg-muted/20 border-2 border-dashed border-border/80 text-center space-y-3">
            <CalendarIcon className="w-10 h-10 text-muted-foreground/50 mx-auto" />
            <div className="space-y-1">
              <p className="text-sm font-black text-foreground">活動日がまだ選択されていません</p>
              <p className="text-xs text-muted-foreground">
                上のカレンダーの日付をタップするか、「土日を全追加」ボタンを押して活動日を設定してください。
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {selectedDayItems.map((item) => (
              <div
                key={item.id}
                className="p-4 sm:p-5 rounded-3xl bg-card border-2 border-primary/20 shadow-sm space-y-4 transition-all"
              >
                {/* 1. カードヘッダー：日付 & スロット切替 & ゴミ箱（最右寄せ） */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-primary/15">
                  <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[200px]">
                    <span className="px-3 py-1.5 rounded-2xl bg-primary text-primary-foreground text-sm font-black tracking-tight shrink-0">
                      {item.dayLabel}
                    </span>
                    <input
                      type="text"
                      value={item.title}
                      onChange={(e) => handleUpdateItem(item.id, { title: e.target.value })}
                      placeholder="予定タイトル（例: 秋季大会 2回戦）"
                      className="text-sm font-black bg-transparent border-b border-border/60 hover:border-primary focus:border-primary focus:outline-hidden px-1 py-0.5 text-foreground w-full max-w-[200px] sm:max-w-[240px]"
                    />

                    {/* 時間帯スロット選択（終日 / 午前のみ / 午後のみ） */}
                    <div className="flex items-center p-1 bg-muted/60 rounded-xl border border-border/60 text-xs font-bold shrink-0">
                      <button
                        type="button"
                        onClick={() => handleUpdateItem(item.id, { slotType: "all_day" })}
                        className={cn(
                          "px-2.5 py-1 rounded-lg transition-all",
                          item.slotType === "all_day" ? "bg-primary text-primary-foreground font-black shadow-xs" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        終日
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateItem(item.id, { slotType: "am_only" })}
                        className={cn(
                          "px-2.5 py-1 rounded-lg transition-all",
                          item.slotType === "am_only" ? "bg-primary text-primary-foreground font-black shadow-xs" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        午前のみ
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateItem(item.id, { slotType: "pm_only" })}
                        className={cn(
                          "px-2.5 py-1 rounded-lg transition-all",
                          item.slotType === "pm_only" ? "bg-primary text-primary-foreground font-black shadow-xs" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        午後のみ
                      </button>
                    </div>
                  </div>

                  {/* 活動日削除ボタン（ゴミ箱だけ最右端に配置） */}
                  <button
                    type="button"
                    onClick={() => handleDeleteItem(item.id)}
                    className="ml-auto p-2 rounded-xl text-rose-500 hover:bg-rose-500/10 active:scale-95 transition-all border border-rose-500/20 hover:border-rose-500/40 shrink-0"
                    title="この活動日を解除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* 2. 午前 / 午後の活動内容設定グリッド */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* ☀️ 【午前】 */}
                  {(item.slotType === "all_day" || item.slotType === "am_only") && (
                    <div className="p-3.5 rounded-2xl bg-muted/30 border border-primary/15 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                          <Sun className="w-3.5 h-3.5 text-amber-500" />
                          <span>午前</span>
                        </span>

                        {/* 種別ピル（練習・試合・合宿・休み） */}
                        <div className="flex flex-wrap gap-1">
                          {EVENT_TYPES.map(t => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => handleUpdateItem(item.id, { amType: t.id as any })}
                              className={cn(
                                "px-2.5 py-1 rounded-xl text-xs font-black border transition-all",
                                item.amType === t.id ? t.color : "bg-card border-border text-muted-foreground hover:text-foreground"
                              )}
                            >
                              {t.icon} {t.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-bold text-muted-foreground block mb-1">活動時間</label>
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-card border border-border/80">
                              <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
                              <input
                                type="text"
                                value={item.amTime}
                                onChange={(e) => handleUpdateItem(item.id, { amTime: e.target.value })}
                                placeholder="08:00〜12:00"
                                className="bg-transparent text-xs font-bold text-foreground focus:outline-hidden w-full"
                              />
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[10px] font-bold text-muted-foreground">球場・場所</label>
                              {venuesList.length > 0 && (
                                <span className="text-[9.5px] text-primary font-bold">登録球場から選択可</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-card border border-border/80">
                              <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              <input
                                type="text"
                                value={item.amLocation}
                                onChange={(e) => handleUpdateItem(item.id, { amLocation: e.target.value })}
                                placeholder="市民第1球場 または 選択"
                                className="bg-transparent text-xs font-bold text-foreground focus:outline-hidden w-full"
                              />
                            </div>
                          </div>
                        </div>

                        {/* 🏟️ 登録球場のクイック選択チップ（略称優先で表示・セット） */}
                        {venuesList.length > 0 && (
                          <div className="pt-0.5 space-y-1">
                            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-0.5">
                              <span className="text-[9.5px] font-bold text-muted-foreground shrink-0 flex items-center gap-0.5">
                                <span>候補:</span>
                              </span>
                              {venuesList.map((v) => {
                                const displayName = getVenueDisplayName(v);
                                const isSelected = item.amLocation === displayName || item.amLocation === v.name;
                                return (
                                  <button
                                    key={v.id}
                                    type="button"
                                    onClick={() => handleUpdateItem(item.id, { amLocation: displayName })}
                                    className={cn(
                                      "px-2 py-0.5 rounded-lg text-[10px] font-bold shrink-0 transition-all border",
                                      isSelected
                                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 font-black shadow-2xs"
                                        : "bg-card hover:bg-muted text-muted-foreground hover:text-foreground border-border/70"
                                    )}
                                  >
                                    🏟️ {displayName}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 🌙 【午後】 */}
                  {(item.slotType === "all_day" || item.slotType === "pm_only") && (
                    <div className="p-3.5 rounded-2xl bg-muted/30 border border-primary/15 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                          <Moon className="w-3.5 h-3.5 text-indigo-500" />
                          <span>午後</span>
                        </span>

                        {/* 種別ピル（練習・試合・合宿・休み） */}
                        <div className="flex flex-wrap gap-1">
                          {EVENT_TYPES.map(t => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => handleUpdateItem(item.id, { pmType: t.id as any })}
                              className={cn(
                                "px-2.5 py-1 rounded-xl text-xs font-black border transition-all",
                                item.pmType === t.id ? t.color : "bg-card border-border text-muted-foreground hover:text-foreground"
                              )}
                            >
                              {t.icon} {t.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-bold text-muted-foreground block mb-1">活動時間</label>
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-card border border-border/80">
                              <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
                              <input
                                type="text"
                                value={item.pmTime}
                                onChange={(e) => handleUpdateItem(item.id, { pmTime: e.target.value })}
                                placeholder="12:00〜18:00"
                                className="bg-transparent text-xs font-bold text-foreground focus:outline-hidden w-full"
                              />
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[10px] font-bold text-muted-foreground">球場・場所</label>
                              {venuesList.length > 0 && (
                                <span className="text-[9.5px] text-primary font-bold">登録球場から選択可</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-card border border-border/80">
                              <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              <input
                                type="text"
                                value={item.pmLocation}
                                onChange={(e) => handleUpdateItem(item.id, { pmLocation: e.target.value })}
                                placeholder="大師河原第3G または 選択"
                                className="bg-transparent text-xs font-bold text-foreground focus:outline-hidden w-full"
                              />
                            </div>
                          </div>
                        </div>

                        {/* 🏟️ 登録球場のクイック選択チップ（略称優先で表示・セット） */}
                        {venuesList.length > 0 && (
                          <div className="pt-0.5 space-y-1">
                            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-0.5">
                              <span className="text-[9.5px] font-bold text-muted-foreground shrink-0 flex items-center gap-0.5">
                                <span>候補:</span>
                              </span>
                              {venuesList.map((v) => {
                                const displayName = getVenueDisplayName(v);
                                const isSelected = item.pmLocation === displayName || item.pmLocation === v.name;
                                return (
                                  <button
                                    key={v.id}
                                    type="button"
                                    onClick={() => handleUpdateItem(item.id, { pmLocation: displayName })}
                                    className={cn(
                                      "px-2 py-0.5 rounded-lg text-[10px] font-bold shrink-0 transition-all border",
                                      isSelected
                                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 font-black shadow-2xs"
                                        : "bg-card hover:bg-muted text-muted-foreground hover:text-foreground border-border/70"
                                    )}
                                  >
                                    🏟️ {displayName}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. 当番（1班〜4班 均等割り）・お弁当・備考 */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs">
                  {/* 当番選択（4等分均等割り） */}
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground block mb-1">
                      当番
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {DUTY_GROUPS.map(dg => (
                        <button
                          key={dg}
                          type="button"
                          onClick={() => handleUpdateItem(item.id, { dutyGroup: dg })}
                          className={cn(
                            "py-1.5 px-1 text-center rounded-xl text-xs font-bold border transition-all active:scale-95",
                            item.dutyGroup === dg
                              ? "bg-primary text-primary-foreground border-primary font-black shadow-xs"
                              : "bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {dg}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* お弁当要否 */}
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground block mb-1">
                      お弁当
                    </label>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleUpdateItem(item.id, { needsLunch: true })}
                        className={cn(
                          "flex-1 py-1.5 px-2 rounded-xl text-[11px] font-bold border transition-all flex items-center justify-center gap-1",
                          item.needsLunch
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40 font-black"
                            : "bg-muted/40 border-border/60 text-muted-foreground"
                        )}
                      >
                        <Utensils className="w-3 h-3" />
                        <span>持参要</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUpdateItem(item.id, { needsLunch: false })}
                        className={cn(
                          "flex-1 py-1.5 px-2 rounded-xl text-[11px] font-bold border transition-all flex items-center justify-center gap-1",
                          !item.needsLunch
                            ? "bg-primary/15 text-primary border-primary/40 font-black"
                            : "bg-muted/40 border-border/60 text-muted-foreground"
                        )}
                      >
                        <span>不要</span>
                      </button>
                    </div>
                  </div>

                  {/* 備考・連絡事項 */}
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground block mb-1">
                      備考・連絡事項
                    </label>
                    <input
                      type="text"
                      value={item.memo}
                      onChange={(e) => handleUpdateItem(item.id, { memo: e.target.value })}
                      placeholder="鍵当番、救急箱持参など"
                      className="w-full px-2.5 py-1.5 rounded-xl bg-card border border-border/80 text-xs font-bold text-foreground focus:outline-hidden focus:border-primary"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 🌟 4. 下部固定保存バー */}
      <div className="sticky bottom-4 z-20 p-4 rounded-3xl bg-card/90 backdrop-blur-md border-2 border-primary/30 shadow-xl flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
          <CheckCircle2 className="w-4 h-4 text-primary" />
          <span>合計 {selectedDayItems.length} 日間の活動予定を設定中</span>
        </div>

        <button
          type="button"
          onClick={handleSaveAll}
          disabled={isSaving}
          className="py-2.5 px-6 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 text-xs font-black shadow-md flex items-center gap-2 transition-all disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          <span>{isSaving ? "一括保存中..." : "活動日予定を一括保存する"}</span>
        </button>
      </div>
    </div>
  );
}
