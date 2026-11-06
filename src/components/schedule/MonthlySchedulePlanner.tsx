// filepath: src/components/schedule/MonthlySchedulePlanner.tsx
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Trash2, 
  Save, 
  Sparkles, 
  Layers, 
  X,
  Check,
  RotateCw,
  Clock,
  Settings,
} from "lucide-react";
import { LiffSelect, type LiffSelectOption } from "@/components/liff/LiffSelect";
import { LiffLocationPicker, useTeamGrounds } from "@/components/liff/LiffLocationPicker";
import { invalidateLiffApiCache } from "@/lib/liff/api-cache";
import {
  extractRawTimeHHMM,
  formatMonthSetLabel,
  getWinterMonths,
  loadCachedTeamScheduleDefaultTimes,
  normalizeTeamScheduleDefaultTimes,
  parseTimeRangeLabel,
  resolveDefaultScheduleTimesForDate,
  saveCachedTeamScheduleDefaultTimes,
  type TeamScheduleDefaultTimes,
} from "@/lib/liff/schedule-default-times";
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
  activityGroups?: unknown;
}

interface RawEventRecord {
  id: string;
  title?: string | null;
  targetGroup?: string | null;
  eventType?: "practice" | "match" | "camp" | "meeting" | string | null;
  amType?: "practice" | "match" | "camp" | "off" | string | null;
  pmType?: "practice" | "match" | "camp" | "off" | string | null;
  startAt: string | Date;
  endAt?: string | Date | null;
  pmStartAt?: string | Date | null;
  pmEndAt?: string | Date | null;
  location?: string | null;
  pmLocation?: string | null;
  dutyGroup?: string | null;
  needsLunch?: boolean | number | string | null;
  needsSnack?: boolean | number | string | null;
  description?: string | null;
  activityGroups?: unknown;
}

interface EventsListApiResponse {
  success: boolean;
  data?: RawEventRecord[];
}

interface ScheduleDefaultTimesApiResponse {
  success: boolean;
  scheduleDefaultTimes?: unknown;
}

const EVENT_TYPE_SELECT_OPTIONS: LiffSelectOption[] = [
  { value: "practice", label: "🏃 通常練習" },
  { value: "match", label: "⚾ 公式戦・試合" },
  { value: "camp", label: "🏕️ 合宿・遠征" },
];

const EXTRA_DUTY_SELECT_OPTIONS: LiffSelectOption[] = [
  { value: "5班", label: "5班" },
  { value: "6班", label: "6班" },
  { value: "A班", label: "A班" },
  { value: "B班", label: "B班" },
  { value: "C班", label: "C班" },
  { value: "役員当番", label: "役員当番" },
  { value: "鍵当番", label: "鍵当番" },
  { value: "救急当番", label: "救急当番" },
];

interface MonthlySchedulePlannerProps {
  teamId?: string;
  teamName?: string;
  isLiff?: boolean;
  onSaved?: () => void;
}

export function MonthlySchedulePlanner({
  teamId = "team_1",
  teamName: _teamName = "チーム",
  isLiff: _isLiff = false,
  onSaved
}: MonthlySchedulePlannerProps) {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDayItems, setSelectedDayItems] = useState<ScheduleDayItem[]>([]);
  const [deletedEventIds, setDeletedEventIds] = useState<string[]>([]);
  const [, setIsLoadingEvents] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [scheduleDefaults, setScheduleDefaults] = useState<TeamScheduleDefaultTimes>(() =>
    loadCachedTeamScheduleDefaultTimes(teamId)
  );
  const { grounds } = useTeamGrounds(teamId);

  const recentLocations = useMemo(() => {
    const list: string[] = [];
    for (const it of selectedDayItems) {
      if (it.location) list.push(it.location);
      if (it.amLocation) list.push(it.amLocation);
      if (it.pmLocation) list.push(it.pmLocation);
    }
    return list;
  }, [selectedDayItems]);

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

  // 🌟 DBから保存済みイベント一覧 ＆ チーム初期時間設定をロード
  const fetchEvents = useCallback(async (defaultsForLoad?: TeamScheduleDefaultTimes) => {
    setIsLoadingEvents(true);
    try {
      const activeTeamId = teamId || "team_1";
      const effectiveDefaults = defaultsForLoad || loadCachedTeamScheduleDefaultTimes(activeTeamId);

      const res = await fetch(`/api/events/${activeTeamId}`);
      if (res.ok) {
        const json = (await res.json()) as EventsListApiResponse;
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          const loadedItems: ScheduleDayItem[] = json.data.map((ev) => {
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

            const dateDefaults = resolveDefaultScheduleTimesForDate(effectiveDefaults, dateStr);
            const rawStart = extractRawTimeHHMM(ev.startAt) || dateDefaults.amStart;
            const rawEnd = extractRawTimeHHMM(ev.endAt);
            const rawPmStart = extractRawTimeHHMM(ev.pmStartAt);
            const rawPmEnd = extractRawTimeHHMM(ev.pmEndAt);
            const hasPm = Boolean(
              ev.pmStartAt || ev.pmEndAt || (ev.pmType && ev.pmType !== "off")
            );

            const amEnd = hasPm
              ? rawEnd && (!rawPmStart || rawEnd <= rawPmStart)
                ? rawEnd
                : dateDefaults.amEnd
              : rawEnd || dateDefaults.amEnd;

            const pmStart = rawPmStart || dateDefaults.pmStart;
            const pmEnd = hasPm
              ? rawPmEnd || (rawEnd && rawEnd > pmStart ? rawEnd : dateDefaults.pmEnd)
              : dateDefaults.pmEnd;

            const resolvedEventType = (
              ev.eventType === "match" ||
              ev.eventType === "camp" ||
              ev.eventType === "meeting"
                ? ev.eventType
                : "practice"
            ) as "practice" | "match" | "camp" | "meeting";

            const resolvedAmType = (
              ev.amType === "match" ||
              ev.amType === "camp" ||
              ev.amType === "off"
                ? ev.amType
                : resolvedEventType === "meeting"
                ? "practice"
                : resolvedEventType
            ) as "practice" | "match" | "camp" | "off";

            const resolvedPmType = (
              ev.pmType === "match" ||
              ev.pmType === "camp" ||
              ev.pmType === "practice" ||
              ev.pmType === "off"
                ? ev.pmType
                : hasPm
                ? resolvedAmType === "off"
                  ? "practice"
                  : resolvedAmType
                : "off"
            ) as "practice" | "match" | "camp" | "off";

            return {
              id: ev.id,
              dateStr,
              dayLabel,
              title: ev.title || "活動予定",
              targetGroup: ev.targetGroup || "全体",
              eventType: resolvedEventType,
              location: ev.location || "確認中",
              amType: resolvedAmType,
              amTime: `${rawStart}〜${amEnd}`,
              amLocation: ev.location || "確認中",
              pmType: resolvedPmType,
              pmTime: `${pmStart}〜${pmEnd}`,
              pmLocation: ev.pmLocation || ev.location || "確認中",
              dutyGroup: ev.dutyGroup || "1班",
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
              memo: ev.description || "",
              activityGroups: ev.activityGroups,
            };
          });

          setSelectedDayItems(loadedItems.sort((a, b) => a.dateStr.localeCompare(b.dateStr)));
          return;
        }
        setSelectedDayItems([]);
      }
    } catch (err) {
      console.error("[Fetch Events Error]:", err);
    } finally {
      setIsLoadingEvents(false);
    }
  }, [teamId]);

  useEffect(() => {
    const activeTeamId = teamId || "team_1";
    const cachedDefaults = loadCachedTeamScheduleDefaultTimes(activeTeamId);
    setScheduleDefaults(cachedDefaults);

    let cancelled = false;
    void (async () => {
      let latestDefaults = cachedDefaults;
      if (activeTeamId !== "demo-team") {
        try {
          const cfgRes = await fetch(
            `/api/liff/schedule-default-times?teamId=${encodeURIComponent(activeTeamId)}`
          );
          if (cfgRes.ok) {
            const cfgJson = (await cfgRes.json()) as ScheduleDefaultTimesApiResponse;
            if (cfgJson.success && cfgJson.scheduleDefaultTimes) {
              latestDefaults = normalizeTeamScheduleDefaultTimes(cfgJson.scheduleDefaultTimes);
              if (!cancelled) {
                setScheduleDefaults(latestDefaults);
                saveCachedTeamScheduleDefaultTimes(activeTeamId, latestDefaults);
              }
            }
          }
        } catch (err) {
          console.error("Failed to fetch schedule default times in planner:", err);
        }
      }
      if (!cancelled) {
        await fetchEvents(latestDefaults);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [teamId, fetchEvents]);

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
      // 追加 (ON) - チーム設定の初期時間（午前・午後／月別）を自動適用
      const resolvedTimes = resolveDefaultScheduleTimesForDate(scheduleDefaults, dateStr);
      const newItem: ScheduleDayItem = {
        id: `new_${dateStr}_${Date.now()}`,
        dateStr,
        dayLabel,
        title: "通常練習",
        targetGroup: "全体",
        eventType: "practice",
        location: "確認中",
        amType: "practice",
        amTime: resolvedTimes.amTimeLabel,
        amLocation: "確認中",
        pmType: "practice",
        pmTime: resolvedTimes.pmTimeLabel,
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
        const resolvedTimes = resolveDefaultScheduleTimesForDate(scheduleDefaults, dateStr);
        newItems.push({
          id: `new_${dateStr}_${Date.now()}_${day}`,
          dateStr,
          dayLabel: formatDayLabel(d),
          title: "通常練習",
          targetGroup: "全体",
          eventType: "practice",
          location: "確認中",
          amType: "practice",
          amTime: resolvedTimes.amTimeLabel,
          amLocation: "確認中",
          pmType: "practice",
          pmTime: resolvedTimes.pmTimeLabel,
          pmLocation: "確認中",
          dutyGroup: "1班",
          needsLunch: true,
          needsSnack: false,
          memo: "",
        });
      }
    }

    const sampleMonthTimes = resolveDefaultScheduleTimesForDate(
      scheduleDefaults,
      `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`
    );
    setSelectedDayItems(newItems.sort((a, b) => a.dateStr.localeCompare(b.dateStr)));
    showToast(
      `📅 ${currentMonth + 1}月の土日を追加しました（☀️${sampleMonthTimes.amTimeLabel} / 🌙${sampleMonthTimes.pmTimeLabel}）`
    );
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

  // 📍 場所変更ハンドラー（一覧選択・自由入力）
  const handleUpdateLocation = (dateStr: string, nextLocation: string) => {
    const safeLoc = nextLocation.trim() || "確認中";
    setSelectedDayItems((prev) =>
      prev.map((item) => {
        if (item.dateStr !== dateStr) return item;
        const shouldSyncPm =
          !item.pmLocation ||
          item.pmLocation === "確認中" ||
          item.pmLocation === item.location ||
          item.pmLocation === item.amLocation;
        return {
          ...item,
          location: safeLoc,
          amLocation: safeLoc,
          pmLocation: shouldSyncPm ? safeLoc : item.pmLocation,
        };
      })
    );
  };

  // 一括保存処理
  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      const payload = {
        events: selectedDayItems.map((item) => {
          const resolved = resolveDefaultScheduleTimesForDate(
            scheduleDefaults,
            item.dateStr
          );
          const am = parseTimeRangeLabel(
            item.amTime,
            resolved.amStart,
            resolved.amEnd
          );
          const pm = parseTimeRangeLabel(
            item.pmTime,
            resolved.pmStart,
            resolved.pmEnd
          );
          const hasPm = item.pmType !== "off";
          const amLoc = item.amLocation || item.location || "確認中";

          return {
            id: item.id.startsWith("new_") ? undefined : item.id,
            title: item.title || "通常練習",
            targetGroup: item.targetGroup || "全体",
            startAt: `${item.dateStr}T${am.start}:00`,
            endAt: `${item.dateStr}T${am.end}:00`,
            eventType: item.eventType || item.amType || "practice",
            amType: item.amType || item.eventType || "practice",
            location: amLoc,
            dutyGroup: item.dutyGroup || "1班",
            pmStartAt: hasPm ? `${item.dateStr}T${pm.start}:00` : null,
            pmEndAt: hasPm ? `${item.dateStr}T${pm.end}:00` : null,
            pmLocation: hasPm ? item.pmLocation || amLoc : null,
            needsLunch: Boolean(item.needsLunch),
            needsSnack: Boolean(item.needsSnack),
            description: item.memo || "",
            activityGroups: item.activityGroups,
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
        invalidateLiffApiCache();
        setDeletedEventIds([]);
        await fetchEvents(scheduleDefaults);
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
      <div className="p-4 rounded-2xl border border-border bg-card shadow-xs overflow-hidden space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* 月移動 */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground border border-border transition-all active:scale-95 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-lg font-black text-foreground min-w-[120px] text-center tracking-tight">
              {currentYear}年 {currentMonth + 1}月
            </span>

            <button
              type="button"
              onClick={handleNextMonth}
              className="p-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground border border-border transition-all active:scale-95 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleToday}
              className="px-3 py-1.5 rounded-xl bg-card hover:bg-muted border border-border text-xs font-black text-foreground transition-all active:scale-95 cursor-pointer"
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
              className="py-2 px-2.5 rounded-xl bg-card hover:bg-rose-500/10 border border-border text-muted-foreground hover:text-rose-600 text-xs font-bold transition-all active:scale-95 cursor-pointer"
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

        {/* 案内テキスト ＆ 現在の初期時間設定バー */}
        <div className="space-y-2">
          <p className="text-[11.5px] font-bold text-muted-foreground">
            💡 カレンダーの日付をタップして<strong className="text-foreground">活動日を選択（ON/OFF）</strong>するだけで登録できます。場所の選択や当番割当もその場で行えます。
          </p>

          {(() => {
            const curMonthTimes = resolveDefaultScheduleTimesForDate(
              scheduleDefaults,
              `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`
            );
            const winterMonths = getWinterMonths(scheduleDefaults.summerMonths);
            return (
              <div className="p-2.5 rounded-xl bg-muted/40 border border-border flex flex-wrap items-center justify-between gap-2 text-[10.5px]">
                <div className="flex flex-wrap items-center gap-1.5 font-black text-foreground">
                  <Clock className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                  <span>{currentMonth + 1}月の初期時間:</span>
                  <span className="px-1.5 py-0.5 rounded bg-card border border-border tabular-nums">
                    ☀️ {curMonthTimes.amTimeLabel}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-card border border-border tabular-nums">
                    🌙 {curMonthTimes.pmTimeLabel}
                  </span>
                  <span className="text-[10px] font-bold text-muted-foreground">
                    （夏 {formatMonthSetLabel(scheduleDefaults.summerMonths)} / 冬 {formatMonthSetLabel(winterMonths)}）
                  </span>
                </div>

                <Link
                  href="/liff/settings/team"
                  className="inline-flex items-center gap-1 text-[10.5px] font-black text-teal-700 dark:text-teal-300 hover:underline shrink-0"
                >
                  <Settings className="w-3 h-3" />
                  <span>時間設定を変更</span>
                </Link>
              </div>
            );
          })()}
        </div>
      </div>

      {/* 🌟 2. 月間カレンダーグリッド */}
      <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
        {/* A-3 上帯ダークキャップ（月ナビゲーション） */}
        <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-6 h-6 rounded-lg bg-teal-500/20 text-teal-300 border border-teal-400/30 flex items-center justify-center shrink-0">
              <CalendarIcon className="w-3.5 h-3.5" />
            </span>
            <span className="text-sm font-black text-white tracking-tight tabular-nums">
              {currentYear}年 {currentMonth + 1}月 カレンダー
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleToday}
              className="px-2.5 py-1 text-[11px] font-black rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 transition-all active:scale-95 cursor-pointer"
            >
              今月
            </button>
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
              title="前月"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
              title="翌月"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-3.5 space-y-2">
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
                      ? "bg-muted/35 hover:bg-muted/60 text-foreground border border-border"
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
      </div>

      {/* 🌟 3. 現在表示中の月の活動日 ＆ 当番一覧リスト */}
      {(() => {
        const currentMonthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
        const currentMonthItems = selectedDayItems.filter(it => it.dateStr.startsWith(currentMonthPrefix));

        return (
          <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
            {/* ヘッダー: A-3 上帯ダークキャップ */}
            <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-white flex items-center gap-1.5">
                  <span className="w-6 h-6 rounded-lg bg-teal-500/20 text-teal-300 border border-teal-400/30 flex items-center justify-center">
                    <Layers className="w-3.5 h-3.5" />
                  </span>
                  <span>{currentMonth + 1}月の活動日 & 当番一覧</span>
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-200 border border-slate-700 text-xs font-black tabular-nums">
                  {currentMonthItems.length}日
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {currentMonthItems.length > 0 && (
                  <button
                    type="button"
                    onClick={handleAutoRotateDuties}
                    className="py-1 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-black border border-slate-700 flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                    title="1班〜4班を日付順に均等に割り当てます"
                  >
                    <RotateCw className="w-3 h-3 text-amber-400" />
                    <span>当番を1〜4班で順繰り割当</span>
                  </button>
                )}

                <Link
                  href="/liff/schedule"
                  className="text-xs font-black text-teal-300 hover:text-teal-200 hover:underline flex items-center gap-0.5 ml-auto sm:ml-0"
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
                          "p-3 sm:p-3.5 rounded-2xl bg-muted/35 hover:bg-muted/50 border border-border border-l-4 hover:border-primary/40 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3",
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
                                : "bg-card text-foreground border-border"
                            )}
                          >
                            <span className="text-[10px] opacity-75">{m}/{d}</span>
                            <span className="text-xs font-black">{weekDays[dObj.getDay()]}</span>
                          </div>

                          {/* 予定詳細 */}
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-black text-foreground">
                                {it.title || "通常練習"}
                              </span>

                              {/* 予定タイプ切替（カスタム選択UI） */}
                              <LiffSelect
                                value={
                                  it.eventType === "match" || it.eventType === "camp"
                                    ? it.eventType
                                    : "practice"
                                }
                                onChange={(val) =>
                                  handleUpdateEventType(
                                    it.dateStr,
                                    val as "practice" | "match" | "camp"
                                  )
                                }
                                options={EVENT_TYPE_SELECT_OPTIONS}
                                title={`${it.dayLabel} の予定種別を選択`}
                                accent="teal"
                                size="xs"
                                searchable={false}
                              />

                              <span className="px-1.5 py-0.5 rounded-md bg-card border border-border text-[10px] font-black text-foreground tabular-nums">
                                ☀️ {it.amTime}
                                {it.pmType !== "off" ? ` / 🌙 ${it.pmTime}` : ""}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 text-[10.5px] font-bold text-muted-foreground flex-wrap">
                              {/* 弁当トグル */}
                              <button
                                type="button"
                                onClick={() => handleToggleLunch(it.dateStr)}
                                className={cn(
                                  "px-2 py-0.5 rounded-md text-[10px] font-black transition-all flex items-center gap-1 cursor-pointer shrink-0",
                                  it.needsLunch
                                    ? "bg-amber-500/12 text-amber-700 dark:text-amber-300 border border-amber-500/25"
                                    : "bg-card text-muted-foreground border border-border hover:text-foreground line-through opacity-65"
                                )}
                              >
                                <span>🍙</span>
                                <span>{it.needsLunch ? "弁当：要" : "弁当なし"}</span>
                              </button>

                              {/* 📍 場所（一覧選択・自由入力ピッカー） */}
                              <LiffLocationPicker
                                size="xs"
                                value={it.location || "確認中"}
                                onChange={(loc) => handleUpdateLocation(it.dateStr, loc || "確認中")}
                                grounds={grounds}
                                recentLocations={recentLocations}
                                title={`${it.dayLabel} の活動場所を選択`}
                                placeholder="場所を選択"
                                className="min-w-[140px] max-w-[220px]"
                              />
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
                        <div className="flex items-center justify-between md:justify-end gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-border">
                          <div className="flex items-center gap-1 bg-muted p-1 rounded-xl border border-border overflow-x-auto scrollbar-none">
                            <span className="text-[10px] font-black text-amber-700 dark:text-amber-300 pl-1.5 pr-0.5 shrink-0 flex items-center gap-0.5">
                              <span>📋</span>
                              <span>当番班:</span>
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
                                        ? "bg-card text-foreground shadow-sm border border-border font-black"
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

                            <LiffSelect
                              value={
                                ["1班", "2班", "3班", "4班", "なし"].includes(it.dutyGroup)
                                  ? ""
                                  : it.dutyGroup
                              }
                              onChange={(val) => {
                                if (val) handleUpdateDuty(it.dateStr, val);
                              }}
                              options={EXTRA_DUTY_SELECT_OPTIONS}
                              title={`${it.dayLabel} のその他の当番を選択`}
                              accent="amber"
                              size="xs"
                              searchable={false}
                              displayValueOverride="他"
                              className="shrink-0"
                            />
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
                <div className="pt-2 border-t border-border flex justify-end">
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
