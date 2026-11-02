// filepath: src/components/schedule/MonthlySchedulePlanner.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Trash2, 
  Save, 
  Sparkles, 
  CheckCircle2, 
  Layers, 
  X,
  Check,
  RotateCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

// 活動イベントデータの型
export interface ScheduleDayItem {
  id: string;
  dateStr: string; // YYYY-MM-DD
  dayLabel: string; // 8/30(日)
  title: string;
  targetGroup?: string;
  eventType?: "practice" | "match" | "camp" | "meeting";
  time?: string;
  location?: string;
  amType: "practice" | "match" | "camp" | "off";
  amTime: string;
  amLocation: string;
  pmType: "practice" | "match" | "camp" | "off";
  pmTime: string;
  pmLocation: string;
  dutyGroup: string;
  needsLunch: boolean;
  needsSnack?: boolean;
  memo: string;
}

interface MonthlySchedulePlannerProps {
  teamId?: string;
  teamName?: string;
  isLiff?: boolean;
  onSaved?: () => void;
}

export function MonthlySchedulePlanner({
  teamId = "team_1",
  teamName = "チーム",
  isLiff = false,
  onSaved
}: MonthlySchedulePlannerProps) {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDayItems, setSelectedDayItems] = useState<ScheduleDayItem[]>([]);
  const [deletedEventIds, setDeletedEventIds] = useState<string[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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

  // 曜日付きラベル生成（8/30(日)）
  const formatDayLabel = (date: Date) => {
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const w = weekDays[date.getDay()];
    return `${m}/${d}(${w})`;
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

            return {
              id: ev.id,
              dateStr,
              dayLabel,
              title: ev.title || "活動予定",
              targetGroup: ev.targetGroup || "全体",
              eventType: (ev.eventType as any) || "practice",
              location: ev.location || "確認中",
              amType: (ev.eventType as any) || "practice",
              amTime: "08:00〜12:00",
              amLocation: ev.location || "確認中",
              pmType: (ev.pmType as any) || (ev.pmStartAt ? "practice" : "off"),
              pmTime: "13:00〜17:00",
              pmLocation: ev.pmLocation || ev.location || "確認中",
              dutyGroup: ev.dutyGroup || "1班",
              needsLunch: ev.needsLunch === true || (ev.needsLunch as any) === 1 || (ev.needsLunch as any) === "1" || (ev.needsLunch as any) === "true",
              needsSnack: ev.needsSnack === true || (ev.needsSnack as any) === 1 || (ev.needsSnack as any) === "1" || (ev.needsSnack as any) === "true",
              memo: ev.description || "",
            };
          });

          setSelectedDayItems(loadedItems.sort((a, b) => a.dateStr.localeCompare(b.dateStr)));
          return;
        }
      }
    } catch (err) {
      console.error("[Fetch Events Error]:", err);
    } finally {
      setIsLoadingEvents(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [teamId]);

  // カレンダーグリッド用日付配列（42マス）
  const getCalendarDays = () => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
    const startDayOfWeek = firstDayOfMonth.getDay();
    const totalDays = lastDayOfMonth.getDate();

    const days: { date: Date; isCurrentMonth: boolean }[] = [];

    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: new Date(currentYear, currentMonth - 1, prevMonthLastDay - i),
        isCurrentMonth: false,
      });
    }

    for (let i = 1; i <= totalDays; i++) {
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

  // 月切り替え
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };
  const handleNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };
  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // 🖱️ カレンダーの日付セルをクリック（活動日 ON / OFF）
  const handleToggleDate = (date: Date) => {
    const dateStr = formatDateString(date);
    const dayLabel = formatDayLabel(date);
    const existingIndex = selectedDayItems.findIndex(it => it.dateStr === dateStr);

    if (existingIndex >= 0) {
      // 解除 (OFF)
      const targetItem = selectedDayItems[existingIndex];
      if (targetItem.id && !targetItem.id.startsWith("new_") && !targetItem.id.startsWith("temp_")) {
        setDeletedEventIds(prev => [...prev, targetItem.id]);
      }
      setSelectedDayItems(prev => prev.filter((_, idx) => idx !== existingIndex));
    } else {
      // 追加 (ON) - デフォルトの場所は「確認中」
      const newItem: ScheduleDayItem = {
        id: `new_${dateStr}_${Date.now()}`,
        dateStr,
        dayLabel,
        title: "通常練習",
        targetGroup: "全体",
        eventType: "practice",
        location: "確認中",
        amType: "practice",
        amTime: "08:00〜12:00",
        amLocation: "確認中",
        pmType: "practice",
        pmTime: "13:00〜17:00",
        pmLocation: "確認中",
        dutyGroup: "1班",
        needsLunch: true,
        needsSnack: false,
        memo: "",
      };

      setSelectedDayItems(prev => [...prev, newItem].sort((a, b) => a.dateStr.localeCompare(b.dateStr)));
    }
  };

  // 📅 今月の土日をすべて一括選択
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
          targetGroup: "全体",
          eventType: "practice",
          location: "確認中",
          amType: "practice",
          amTime: "08:00〜12:00",
          amLocation: "確認中",
          pmType: "practice",
          pmTime: "13:00〜17:00",
          pmLocation: "確認中",
          dutyGroup: "1班",
          needsLunch: true,
          needsSnack: false,
          memo: "",
        });
      }
    }

    setSelectedDayItems(newItems.sort((a, b) => a.dateStr.localeCompare(b.dateStr)));
    showToast(`📅 ${currentMonth + 1}月の土日を活動日として追加しました`);
  };

  // 🗑️ 今月の選択をすべてクリア
  const handleClearMonth = () => {
    const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
    const toRemove = selectedDayItems.filter(it => it.dateStr.startsWith(monthPrefix));
    
    for (const item of toRemove) {
      if (item.id && !item.id.startsWith("new_") && !item.id.startsWith("temp_")) {
        setDeletedEventIds(prev => [...prev, item.id]);
      }
    }

    setSelectedDayItems(prev => prev.filter(it => !it.dateStr.startsWith(monthPrefix)));
    showToast(`🗑️ ${currentMonth + 1}月の選択を解除しました`);
  };

  // 📋 お当番変更ハンドラー
  const handleUpdateDuty = (dateStr: string, duty: string) => {
    setSelectedDayItems(prev => prev.map(item => {
      if (item.dateStr === dateStr) {
        return { ...item, dutyGroup: duty };
      }
      return item;
    }));
  };

  // 🍱 お弁当変更ハンドラー
  const handleToggleLunch = (dateStr: string) => {
    setSelectedDayItems(prev => prev.map(item => {
      if (item.dateStr === dateStr) {
        return { ...item, needsLunch: !item.needsLunch };
      }
      return item;
    }));
  };

  // ⚾ 予定種別変更ハンドラー
  const handleUpdateEventType = (dateStr: string, type: "practice" | "match" | "camp") => {
    const titleMap: Record<string, string> = {
      practice: "通常練習",
      match: "公式戦・試合",
      camp: "合宿・遠征",
    };
    setSelectedDayItems(prev => prev.map(item => {
      if (item.dateStr === dateStr) {
        return { 
          ...item, 
          eventType: type,
          amType: type,
          title: (!item.title || ["通常練習", "公式戦・試合", "合宿・遠征"].includes(item.title)) 
            ? titleMap[type] 
            : item.title,
        };
      }
      return item;
    }));
  };

  // 🔄 当番自動ローテーション（1班〜4班を日付順に順番に割り当て）
  const handleAutoRotateDuties = () => {
    const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
    const dutyRotation = ["1班", "2班", "3班", "4班"];
    let rotationIndex = 0;

    setSelectedDayItems(prev => prev.map(item => {
      if (item.dateStr.startsWith(monthPrefix)) {
        const assignedDuty = dutyRotation[rotationIndex % dutyRotation.length];
        rotationIndex++;
        return { ...item, dutyGroup: assignedDuty };
      }
      return item;
    }));
    showToast(`🔄 ${currentMonth + 1}月の当番を1班〜4班のローテーションで自動割り当てしました`);
  };

  // トースト表示
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 一括保存処理
  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      const payload = {
        events: selectedDayItems.map(item => ({
          id: item.id.startsWith("new_") ? undefined : item.id,
          title: item.title || "通常練習",
          targetGroup: item.targetGroup || "全体",
          startAt: `${item.dateStr}T08:00:00`,
          endAt: `${item.dateStr}T17:00:00`,
          eventType: item.eventType || item.amType || 'practice',
          location: item.location || "確認中",
          dutyGroup: item.dutyGroup || "1班",
          pmStartAt: item.pmType !== "off" ? `${item.dateStr}T13:00:00` : null,
          pmEndAt: item.pmType !== "off" ? `${item.dateStr}T17:00:00` : null,
          pmLocation: item.pmLocation || item.location || "確認中",
          needsLunch: Boolean(item.needsLunch),
          needsSnack: Boolean(item.needsSnack),
          description: item.memo || "",
          status: "scheduled",
        })),
        deletedEventIds,
      };

      const res = await fetch(`/api/events/${teamId}/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setDeletedEventIds([]);
        await fetchEvents();
        showToast("✅ 活動日を一括保存しました！予定 & 出欠表に反映されます。");
        if (onSaved) onSaved();
      } else {
        showToast("❌ 保存に失敗しました");
      }
    } catch (err) {
      console.error("Save error:", err);
      showToast("❌ 保存エラーが発生しました");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 🔔 トースト通知 */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] px-4 py-2.5 rounded-2xl bg-foreground text-background text-xs font-black shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
          {toastMessage}
        </div>
      )}

      {/* 🌟 1. ヘッダー：月操作 ＆ アクションボタン */}
      <div className="p-4 rounded-2xl border border-border/60 bg-card shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* 月移動 */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-2 rounded-xl bg-muted/50 hover:bg-muted text-foreground border border-border/60 transition-all active:scale-95 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-lg font-black text-foreground min-w-[120px] text-center tracking-tight">
              {currentYear}年 {currentMonth + 1}月
            </span>

            <button
              type="button"
              onClick={handleNextMonth}
              className="p-2 rounded-xl bg-muted/50 hover:bg-muted text-foreground border border-border/60 transition-all active:scale-95 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleToday}
              className="px-3 py-1.5 rounded-xl bg-card hover:bg-muted border border-border/60 text-xs font-black text-foreground transition-all active:scale-95 cursor-pointer"
            >
              今月
            </button>
          </div>

          {/* クイック選択 ＆ 一括保存ボタン */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleSelectAllWeekends}
              className="py-2 px-3 rounded-xl bg-primary/12 hover:bg-primary/20 text-primary text-xs font-black border border-primary/35 shadow-2xs active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>土日を全選択</span>
            </button>

            <button
              type="button"
              onClick={handleClearMonth}
              className="py-2 px-2.5 rounded-xl bg-card hover:bg-rose-500/10 border border-border/60 text-muted-foreground hover:text-rose-600 text-xs font-bold transition-all active:scale-95 cursor-pointer"
              title="今月の選択をクリア"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isSaving}
              className="py-2 px-4 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-black shadow-xs active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? "保存中..." : "活動日を保存"}</span>
            </button>
          </div>
        </div>

        {/* 案内テキスト */}
        <p className="text-[11.5px] font-bold text-muted-foreground">
          💡 カレンダーの日付をタップして<strong className="text-foreground">活動日を選択（ON/OFF）</strong>するだけで登録できます。球場・時間・当番などの詳細は「予定 & 出欠」ページからいつでも個別編集できます（球場初期値: <span className="text-primary font-black">確認中</span>）。
        </p>
      </div>

      {/* 🌟 2. 月間カレンダーグリッド */}
      <div className="p-3.5 rounded-2xl border border-border/60 bg-card shadow-xs space-y-2">
        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-black">
          {weekDays.map((w, idx) => (
            <div
              key={w}
              className={cn(
                "py-1.5 rounded-lg",
                idx === 0 ? "text-red-500 bg-red-500/5" : idx === 6 ? "text-blue-500 bg-blue-500/5" : "text-muted-foreground"
              )}
            >
              {w}
            </div>
          ))}
        </div>

        {/* 日付セル一覧 */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((d, idx) => {
            const dateStr = formatDateString(d.date);
            const isSelected = selectedDayItems.some(it => it.dateStr === dateStr);
            const isToday = dateStr === formatDateString(new Date());
            const isSun = d.date.getDay() === 0;
            const isSat = d.date.getDay() === 6;

            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleToggleDate(d.date)}
                className={cn(
                  "flex flex-col items-center justify-center p-2 rounded-2xl min-h-[58px] sm:min-h-[64px] transition-all relative cursor-pointer active:scale-95",
                  isSelected
                    ? "bg-primary/12 text-foreground font-black shadow-2xs border border-primary/40"
                    : isToday
                    ? "bg-primary/10 border border-primary/40 text-foreground font-black"
                    : d.isCurrentMonth
                    ? "bg-muted/35 hover:bg-muted/60 text-foreground border border-border/60"
                    : "bg-muted/15 text-muted-foreground/30 border border-transparent"
                )}
              >
                {/* 日付数字 */}
                <span
                  className={cn(
                    "text-sm",
                    isSun
                      ? "text-red-500 font-black"
                      : isSat
                      ? "text-blue-500 font-black"
                      : isSelected
                      ? "text-primary font-black"
                      : "font-bold"
                  )}
                >
                  {d.date.getDate()}
                </span>

                {/* 選択状態ラベル */}
                {isSelected ? (
                  <span className="mt-1 px-1.5 py-0.2 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[9.5px] font-black tracking-tight leading-none flex items-center gap-0.5">
                    <Check className="w-2.5 h-2.5" />
                    <span>活動日</span>
                  </span>
                ) : (
                  isToday && (
                    <span className="mt-1 text-[9px] font-bold text-primary opacity-80 leading-none">
                      今日
                    </span>
                  )
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 🌟 3. 現在表示中の月の活動日 ＆ 当番一覧リスト */}
      {(() => {
        const currentMonthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
        const currentMonthItems = selectedDayItems.filter(it => it.dateStr.startsWith(currentMonthPrefix));

        return (
          <div className="rounded-2xl border border-border/60 bg-card shadow-xs overflow-hidden">
            {/* ヘッダー */}
            <div className="px-4 py-3 bg-primary/[0.04] dark:bg-primary/[0.07] border-b border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-foreground flex items-center gap-1.5">
                  <span className="w-6 h-6 rounded-lg bg-teal-500/12 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                    <Layers className="w-3.5 h-3.5" />
                  </span>
                  <span>{currentMonth + 1}月の活動日 & 当番一覧</span>
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-primary/12 text-primary border border-primary/25 text-xs font-black">
                  {currentMonthItems.length}日
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {currentMonthItems.length > 0 && (
                  <button
                    type="button"
                    onClick={handleAutoRotateDuties}
                    className="py-1 px-2.5 rounded-xl bg-card hover:bg-muted text-foreground text-xs font-black border border-border/60 flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-2xs"
                    title="1班〜4班を日付順に均等に割り当てます"
                  >
                    <RotateCw className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                    <span>当番を1〜4班で順繰り割当</span>
                  </button>
                )}

                <Link
                  href="/liff/schedule"
                  className="text-xs font-black text-primary hover:underline flex items-center gap-0.5 ml-auto sm:ml-0"
                >
                  <span>予定 & 出欠表へ</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {currentMonthItems.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <p className="text-xs font-bold text-muted-foreground">
                    {currentMonth + 1}月のカレンダーの日付をタップして活動日を選択してください。
                  </p>
                  <button
                    type="button"
                    onClick={handleSelectAllWeekends}
                    className="py-1.5 px-3 rounded-xl bg-primary/12 hover:bg-primary/20 text-primary text-xs font-black border border-primary/35 shadow-2xs active:scale-95 transition-all inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>今月の土日を全選択</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {currentMonthItems.map((it) => {
                    const [y, m, d] = it.dateStr.split("-").map(Number);
                    const dObj = new Date(y, m - 1, d);
                    const isSun = dObj.getDay() === 0;
                    const isSat = dObj.getDay() === 6;

                    return (
                      <div
                        key={it.id}
                        className={cn(
                          "p-3 sm:p-3.5 rounded-2xl bg-muted/35 hover:bg-muted/50 border border-border/60 border-l-4 hover:border-primary/40 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3",
                          it.eventType === "match"
                            ? "border-l-primary"
                            : it.eventType === "camp"
                            ? "border-l-amber-500"
                            : "border-l-teal-500"
                        )}
                      >
                        {/* 上段 / 左側: 日付 ＆ 予定情報 */}
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* 日付バッジ */}
                          <div
                            className={cn(
                              "w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 font-black leading-tight border",
                              isSun
                                ? "bg-red-500/10 text-red-500 border-red-500/20"
                                : isSat
                                ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                                : "bg-card text-foreground border-border/60"
                            )}
                          >
                            <span className="text-[10px] opacity-75">{m}/{d}</span>
                            <span className="text-xs font-black">{weekDays[dObj.getDay()]}</span>
                          </div>

                          {/* 予定詳細 */}
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-black text-foreground">
                                {it.title || "通常練習"}
                              </span>

                              {/* 予定タイプ切替 */}
                              <select
                                value={it.eventType || "practice"}
                                onChange={(e) => handleUpdateEventType(it.dateStr, e.target.value as "practice" | "match" | "camp")}
                                className="text-[10.5px] font-bold px-2 py-0.5 rounded-lg bg-card border border-border/60 text-foreground cursor-pointer focus:outline-hidden"
                              >
                                <option value="practice">🏃 通常練習</option>
                                <option value="match">⚾ 公式戦・試合</option>
                                <option value="camp">🏕️ 合宿・遠征</option>
                              </select>
                            </div>

                            <div className="flex items-center gap-2 text-[10.5px] font-bold text-muted-foreground flex-wrap">
                              {/* お弁当トグル */}
                              <button
                                type="button"
                                onClick={() => handleToggleLunch(it.dateStr)}
                                className={cn(
                                  "px-2 py-0.5 rounded-md text-[10px] font-black transition-all flex items-center gap-1 cursor-pointer",
                                  it.needsLunch
                                    ? "bg-amber-500/12 text-amber-700 dark:text-amber-300 border border-amber-500/25"
                                    : "bg-card text-muted-foreground border border-border/60 hover:text-foreground line-through opacity-65"
                                )}
                              >
                                <span>🍙</span>
                                <span>{it.needsLunch ? "お弁当：要" : "弁当なし"}</span>
                              </button>

                              <span>•</span>
                              <span className="truncate max-w-[140px] text-[10px]">
                                📍 {it.location || "球場確認中"}
                              </span>
                            </div>
                          </div>

                          {/* モバイル時の削除ボタン */}
                          <button
                            type="button"
                            onClick={() => handleToggleDate(dObj)}
                            className="md:hidden p-1.5 rounded-xl text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 transition-all cursor-pointer shrink-0 ml-auto"
                            title="活動日を解除"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {/* 下段 / 右側: 当番選択ボタン群 */}
                        <div className="flex items-center justify-between md:justify-end gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-border/60">
                          <div className="flex items-center gap-1 bg-muted/80 dark:bg-muted/50 p-1 rounded-xl border border-border/60 overflow-x-auto scrollbar-none">
                            <span className="text-[10px] font-black text-amber-700 dark:text-amber-300 pl-1.5 pr-0.5 shrink-0 flex items-center gap-0.5">
                              <span>📋</span>
                              <span>当番:</span>
                            </span>

                            {["1班", "2班", "3班", "4班", "なし"].map((dg) => {
                              const isCurDuty = (it.dutyGroup === dg) || (!it.dutyGroup && dg === "なし");
                              return (
                                <button
                                  key={dg}
                                  type="button"
                                  onClick={() => handleUpdateDuty(it.dateStr, dg)}
                                  className={cn(
                                    "px-2.5 py-1 rounded-lg text-xs transition-all active:scale-95 shrink-0 cursor-pointer",
                                    isCurDuty
                                      ? dg === "なし"
                                        ? "bg-card text-foreground shadow-sm border border-border/50 font-black"
                                        : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/35 shadow-2xs font-black"
                                      : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                                  )}
                                >
                                  {dg}
                                </button>
                              );
                            })}

                            {/* その他（5班・A班など）の場合の選択表示 */}
                            {it.dutyGroup && !["1班", "2班", "3班", "4班", "なし"].includes(it.dutyGroup) && (
                              <span className="px-2 py-1 rounded-lg text-xs font-black bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/35 shadow-2xs shrink-0">
                                {it.dutyGroup}
                              </span>
                            )}

                            <select
                              value={["1班", "2班", "3班", "4班", "なし"].includes(it.dutyGroup) ? "" : it.dutyGroup}
                              onChange={(e) => {
                                if (e.target.value) handleUpdateDuty(it.dateStr, e.target.value);
                              }}
                              className="text-[10px] font-bold px-1.5 py-1 rounded-lg bg-card border border-border/60 text-muted-foreground hover:text-foreground cursor-pointer focus:outline-hidden shrink-0"
                              title="その他の当番を選択"
                            >
                              <option value="" disabled>他</option>
                              <option value="5班">5班</option>
                              <option value="6班">6班</option>
                              <option value="A班">A班</option>
                              <option value="B班">B班</option>
                              <option value="C班">C班</option>
                              <option value="役員当番">役員当番</option>
                              <option value="鍵当番">鍵当番</option>
                              <option value="救急当番">救急当番</option>
                            </select>
                          </div>

                          {/* PC時の削除ボタン */}
                          <button
                            type="button"
                            onClick={() => handleToggleDate(dObj)}
                            className="hidden md:flex p-2 rounded-xl text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 transition-all cursor-pointer"
                            title="活動日を解除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 保存ボタン */}
              {currentMonthItems.length > 0 && (
                <div className="pt-2 border-t border-border/60 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveAll}
                    disabled={isSaving}
                    className="py-2.5 px-6 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-black shadow-xs active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSaving ? "保存中..." : `${currentMonth + 1}月の活動日 & 当番（${currentMonthItems.length}日）を一括保存`}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
