// filepath: src/app/liff/schedule/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { useLiff } from "@/components/liff/LiffProvider";
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Users,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Utensils,
  ClipboardList,
  ClipboardCheck,
  Filter,
  Loader2,
  Edit3,
  Trash2,
  Save,
  Sun,
  Moon,
  Car,
  FileText,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";

const TARGET_GROUPS = ["全体", "Aチーム", "Bチーム", "高学年", "低学年", "試合組", "練習組"];
const DUTY_GROUPS = ["1班", "2班", "3班", "4班"];
const EVENT_TYPES = [
  { id: "practice", label: "練習", icon: "🏃", color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  { id: "match", label: "試合", icon: "⚾", color: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30" },
  { id: "camp", label: "合宿", icon: "🏕️", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  { id: "meeting", label: "ミーティング", icon: "📋", color: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
];

interface ScheduleEvent {
  id: string;
  title: string;
  date: string;
  dateStr?: string;
  time: string;
  startAt?: string;
  endAt?: string;
  location: string;
  rawLocation?: string;
  amTime?: string;
  amLocation?: string;
  pmTime?: string;
  pmLocation?: string;
  hasPm?: boolean;
  eventType: "match" | "practice" | "meeting" | "camp";
  amType?: "match" | "practice" | "meeting" | "camp";
  pmType?: "match" | "practice" | "meeting" | "camp" | "off";
  targetGroup?: string;
  dutyGroup?: string;
  needsLunch?: boolean;
  needsSnack?: boolean;
  memo?: string;
  carInfo?: string;
  myStatus: "present" | "absent" | "pending" | "late" | "partial";
  attendCount: { present: number; absent: number; pending: number };
}

export default function LiffSchedulePage() {
  const { currentTeam, profile, isLoadingTeam } = useLiff();
  const [filter, setFilter] = useState<"all" | "match" | "practice">("all");
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 📅 月間カレンダー用ステート
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);

  // ✏️ 個別編集モーダル用ステート
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [venuesList, setVenuesList] = useState<Array<{ id: string; name: string; shortName?: string | null }>>([]);

  // 球場一覧の取得
  useEffect(() => {
    const loadVenues = async () => {
      try {
        const tid = currentTeam?.id || "team_1";
        const res = await fetch(`/api/venues?teamId=${tid}`);
        if (res.ok) {
          const json = await res.json() as any;
          if (json.success && Array.isArray(json.data)) {
            setVenuesList(json.data);
          }
        }
      } catch (err) {
        console.error("Failed to load venues:", err);
      }
    };
    loadVenues();
  }, [currentTeam?.id]);

  // 略称優先の球場表示名を取得
  const getVenueDisplayName = (v: { name: string; shortName?: string | null }) => {
    return v.shortName && v.shortName.trim() ? v.shortName.trim() : v.name;
  };

  // ユーザーの立場とお子様リスト
  const [userRole, setUserRole] = useState<"parent" | "coach" | "player" | "staff">("parent");
  const [children, setChildren] = useState<Array<{ id: string; name: string; uniformNumber?: string; parentName?: string }>>([]);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, "present" | "absent" | "pending" | "late">>({});
  const [childAttendanceMap, setChildAttendanceMap] = useState<Record<string, Record<string, "present" | "absent" | "pending" | "late">>>({});

  // 👨‍👦 DBの親子関係・お子様データおよび出欠の自動取得
  const fetchFamilyData = async () => {
    try {
      const tid = currentTeam?.id || (typeof window !== "undefined" ? (localStorage.getItem("iscore_selectedTeamId") || "demo-team") : "demo-team");
      const uid = profile?.userId || (typeof window !== "undefined" ? (localStorage.getItem("iscore_user_id") || localStorage.getItem("iscore_userId") || "") : "");
      const uName = profile?.displayName || (typeof window !== "undefined" ? (localStorage.getItem("iscore_user_name") || "") : "");

      if (tid !== "demo-team" && !currentTeam?.isDemo) {
        setChildren([]);
      }

      const res = await fetch(`/api/liff/my-family?teamId=${tid}&userId=${uid}&userName=${encodeURIComponent(uName)}`);
      if (res.ok) {
        const json = await res.json() as any;
        if (json.success) {
          if (json.memberId) setMemberId(json.memberId);

          if (Array.isArray(json.children) && json.children.length > 0) {
            const uniqueChildren: typeof json.children = [];
            const seen = new Set<string>();
            for (const c of json.children) {
              if (!seen.has(c.id)) {
                seen.add(c.id);
                uniqueChildren.push(c);
              }
            }
            setChildren(uniqueChildren);
          } else if (tid === "demo-team" || currentTeam?.isDemo) {
            setChildren([{ id: "demo-player-1", name: "山田 翔太", uniformNumber: "#10" }]);
          } else {
            setChildren([]);
          }
          if (json.attendances) {
            setChildAttendanceMap(prev => ({ ...json.attendances, ...prev }));
          }

          // 自分の出欠を復元
          if (json.parentAttendances && Object.keys(json.parentAttendances).length > 0) {
            setAttendanceMap(prev => ({ ...json.parentAttendances, ...prev }));
            setEvents(prev => prev.map(ev => ({
              ...ev,
              myStatus: json.parentAttendances[ev.id] || ev.myStatus
            })));
          }
        }
      }
    } catch (err) {
      console.error("Failed to load family data:", err);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    setChildren([]);
    fetchFamilyData();
  }, [currentTeam?.id, profile?.displayName, profile?.userId]);

  const getChildAttendance = (eventId: string, childId: string) => {
    if (childAttendanceMap[eventId]?.[childId] && childAttendanceMap[eventId][childId] !== "pending") {
      return childAttendanceMap[eventId][childId];
    }
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem(`iscore_child_att_${eventId}_${childId}`);
      if (cached && (cached === "present" || cached === "absent" || cached === "late")) {
        return cached as any;
      }
    }
    return childAttendanceMap[eventId]?.[childId] || "pending";
  };

  const getEventAttendance = (eventId: string, defaultStatus?: string) => {
    if (attendanceMap[eventId] && attendanceMap[eventId] !== "pending") {
      return attendanceMap[eventId];
    }
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem(`iscore_my_att_${eventId}`);
      if (cached && (cached === "present" || cached === "absent" || cached === "late")) {
        return cached as any;
      }
    }
    return (attendanceMap[eventId] || defaultStatus || "pending") as any;
  };

  const handleChildStatusChange = async (eventId: string, childId: string, status: "present" | "absent" | "pending" | "late") => {
    setChildAttendanceMap((prev) => ({
      ...prev,
      [eventId]: {
        ...(prev[eventId] || {}),
        [childId]: status,
      }
    }));
    if (typeof window !== "undefined") {
      localStorage.setItem(`iscore_child_att_${eventId}_${childId}`, status);
    }

    try {
      await fetch("/api/liff/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          playerId: childId,
          status,
        }),
      });
    } catch (err) {
      console.error("Failed to save child attendance:", err);
    }
  };

  const loadSchedule = useCallback(async () => {
    try {
      setIsLoading(true);
      const teamId = currentTeam?.id || "demo-team";
      const userId = profile?.userId || (typeof window !== "undefined" ? (localStorage.getItem("iscore_user_id") || localStorage.getItem("iscore_userId") || "") : "");
      const uName = profile?.displayName || (typeof window !== "undefined" ? (localStorage.getItem("iscore_user_name") || "") : "");
      const res = await fetch(`/api/liff/schedule?teamId=${teamId}&userId=${userId}&userName=${encodeURIComponent(uName)}`);
      if (res.ok) {
        const data = await res.json() as { success: boolean; events?: ScheduleEvent[] };
        if (data.events) {
          const normalizedEvents = data.events.map(ev => ({
            ...ev,
            needsLunch: ev.needsLunch === true || (ev.needsLunch as any) === 1 || (ev.needsLunch as any) === "1" || (ev.needsLunch as any) === "true",
            needsSnack: ev.needsSnack === true || (ev.needsSnack as any) === 1 || (ev.needsSnack as any) === "1" || (ev.needsSnack as any) === "true",
          }));

          const map: Record<string, "present" | "absent" | "pending" | "late"> = {};
          for (const ev of normalizedEvents) {
            if (ev.id && ev.myStatus && ev.myStatus !== "pending") {
              map[ev.id] = ev.myStatus === "partial" ? "late" : (ev.myStatus as "present" | "absent" | "late");
            }
          }
          if (Object.keys(map).length > 0) {
            setAttendanceMap(prev => ({ ...map, ...prev }));
          }
          setEvents(normalizedEvents);
        }
      }
    } catch (err) {
      console.error("Failed to fetch schedule:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentTeam?.id, profile?.userId, profile?.displayName]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  const handleStatusChange = async (eventId: string, status: "present" | "absent" | "pending" | "late") => {
    setAttendanceMap(prev => ({ ...prev, [eventId]: status }));
    if (typeof window !== "undefined") {
      localStorage.setItem(`iscore_my_att_${eventId}`, status);
    }
    setEvents((prev) =>
      prev.map((ev) => (ev.id === eventId ? { ...ev, myStatus: status } : ev))
    );

    try {
      const uid = profile?.userId || (typeof window !== "undefined" ? (localStorage.getItem("iscore_user_id") || localStorage.getItem("iscore_userId") || "") : "");
      await fetch("/api/liff/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          userId: uid,
          memberId: memberId || undefined,
          status,
        }),
      });
    } catch (err) {
      console.error("Failed to save attendance:", err);
    }
  };

  // ✏️ 個別予定の保存ハンドラー
  const handleSaveEventEdit = async () => {
    if (!editingEvent) return;

    try {
      setIsSavingEdit(true);
      const teamId = currentTeam?.id || "demo-team";

      setEvents((prev) =>
        prev.map((ev) => (ev.id === editingEvent.id ? { ...editingEvent } : ev))
      );

      const res = await fetch(`/api/events/${teamId}/${editingEvent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editingEvent.title,
          eventType: editingEvent.eventType,
          location: editingEvent.location,
          targetGroup: editingEvent.targetGroup || "全体",
          dutyGroup: editingEvent.dutyGroup || null,
          description: editingEvent.memo || "",
          needsLunch: Boolean(editingEvent.needsLunch),
          needsSnack: Boolean(editingEvent.needsSnack),
        }),
      });

      if (!res.ok) {
        console.error("Failed to patch event");
      }

      setEditingEvent(null);
      await loadSchedule();
    } catch (err) {
      console.error("Error saving event edit:", err);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // 📅 月間カレンダー計算
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };
  const handleNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };
  const handleToday = () => {
    setCurrentDate(new Date());
    setSelectedDateStr(null);
  };

  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startingDay = firstDay.getDay();
    const totalDays = lastDay.getDate();

    const days: Array<{ date: Date; dateStr: string; isCurrentMonth: boolean }> = [];

    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = startingDay - 1; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - 1, prevMonthLastDay - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      days.push({
        date: d,
        dateStr: `${y}-${m}-${day}`,
        isCurrentMonth: false,
      });
    }

    for (let i = 1; i <= totalDays; i++) {
      const d = new Date(currentYear, currentMonth, i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      days.push({
        date: d,
        dateStr: `${y}-${m}-${day}`,
        isCurrentMonth: true,
      });
    }

    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      const d = new Date(currentYear, currentMonth + 1, i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      days.push({
        date: d,
        dateStr: `${y}-${m}-${day}`,
        isCurrentMonth: false,
      });
    }

    return days;
  }, [currentYear, currentMonth]);

  const weekDays = ["日", "月", "火", "水", "木", "金", "土"];

  // 日付ごとのイベントマップ
  const eventsByDate = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>();
    for (const ev of events) {
      const dStr = ev.dateStr || (ev.startAt ? new Date(ev.startAt).toISOString().split("T")[0] : "");
      if (dStr) {
        const list = map.get(dStr) || [];
        list.push(ev);
        map.set(dStr, list);
      }
    }
    return map;
  }, [events]);

  // フィルター & カレンダー選択によるイベント絞り込み
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      // 1. タイプフィルター
      if (filter === "match" && ev.eventType !== "match") return false;
      if (filter === "practice" && ev.eventType !== "practice") return false;

      // 2. カレンダー選択日付フィルター
      if (selectedDateStr) {
        const dStr = ev.dateStr || (ev.startAt ? new Date(ev.startAt).toISOString().split("T")[0] : "");
        if (dStr !== selectedDateStr) return false;
      }

      return true;
    });
  }, [events, filter, selectedDateStr]);

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <LiffHeader />

      <div className="p-4 space-y-4">
        {/* ページ内ヘッダー（メニュー名と統一: 予定 & 出欠） */}
        <LiffPageHeader
          title="予定 & 出欠"
          subtitle="チームの活動予定とお当番・出欠確認"
          icon={<CalendarIcon className="w-5 h-5" />}
          shareData={{
            title: `【スケジュール】今後のチーム予定一覧`,
            text: `出欠未回答の方は確認とご登録をお願いします！`,
          }}
        />

        {/* 🌟 管理者向け：活動予定スケジューラーへの導線 */}
        <div className="flex items-center justify-between p-3 rounded-2xl bg-primary/10 border border-primary/20">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-black shrink-0">
              <CalendarIcon className="w-4 h-4" />
            </span>
            <div>
              <p className="text-xs font-black text-foreground">活動日スケジューラー</p>
              <p className="text-[10px] font-bold text-muted-foreground">月全体の活動日をカレンダーで一括設定</p>
            </div>
          </div>
          <a
            href="/liff/schedule/admin"
            className="py-1.5 px-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 text-xs font-black shadow-xs transition-all shrink-0"
          >
            一括設定へ
          </a>
        </div>

        {/* 🌟 月間ミニカレンダー（日付選択で予定カードを絞り込み） */}
        <div className="p-3.5 sm:p-4 rounded-3xl bg-card border-2 border-primary/20 shadow-sm space-y-2.5">
          {/* 月切り替えヘッダー */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-foreground">
                {currentYear}年 {currentMonth + 1}月
              </span>
              {selectedDateStr && (
                <span className="text-[10.5px] font-black px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                  {selectedDateStr.split("-")[1]}/{selectedDateStr.split("-")[2]} 選択中
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground active:scale-95 transition-all"
                title="前月"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground active:scale-95 transition-all"
                title="翌月"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleToday}
                className="px-2 py-1 text-[10px] font-black rounded-lg bg-muted hover:bg-muted/80 text-foreground border border-border/80 active:scale-95 transition-all ml-0.5"
              >
                今月
              </button>
            </div>
          </div>

          {/* 曜日ヘッダー */}
          <div className="grid grid-cols-7 text-center text-[10px] font-black text-muted-foreground uppercase pb-1 border-b border-primary/10">
            {weekDays.map((day, idx) => (
              <span key={day} className={idx === 0 ? "text-rose-500" : idx === 6 ? "text-blue-500" : ""}>
                {day}
              </span>
            ))}
          </div>

          {/* 42マス日付グリッド（コンパクト） */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, idx) => {
              const dayEvents = eventsByDate.get(day.dateStr) || [];
              const hasEvents = dayEvents.length > 0;
              const isSelected = selectedDateStr === day.dateStr;
              const isToday = new Date().toISOString().split("T")[0] === day.dateStr;

              const dayOfWeek = day.date.getDay();
              const isSunday = dayOfWeek === 0;
              const isSaturday = dayOfWeek === 6;

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      setSelectedDateStr(null); // 解除
                    } else {
                      setSelectedDateStr(day.dateStr);
                    }
                  }}
                  className={`relative min-h-[38px] p-1 rounded-xl flex flex-col justify-between items-center transition-all border text-center ${
                    !day.isCurrentMonth
                      ? "opacity-25 bg-transparent border-transparent"
                      : isSelected
                      ? "bg-primary text-primary-foreground border-primary font-black shadow-xs ring-2 ring-primary/40"
                      : hasEvents
                      ? "bg-primary/10 hover:bg-primary/20 border-primary/30 text-foreground font-bold cursor-pointer"
                      : "bg-muted/20 hover:bg-muted/50 border-transparent text-muted-foreground cursor-pointer"
                  } ${isToday && !isSelected ? "ring-1 ring-primary/60 border-primary/40 font-black" : ""}`}
                >
                  <span className={`text-[11px] leading-none ${
                    isSelected
                      ? "text-primary-foreground"
                      : isSunday
                      ? "text-rose-500"
                      : isSaturday
                      ? "text-blue-500"
                      : ""
                  }`}>
                    {day.date.getDate()}
                  </span>

                  {/* 予定インジケーター（ドットまたはバッジ） */}
                  {hasEvents && (
                    <div className="flex items-center gap-0.5 mt-0.5">
                      {dayEvents.map((ev, i) => (
                        <span
                          key={i}
                          className={`w-1.5 h-1.5 rounded-full ${
                            isSelected
                              ? "bg-white"
                              : ev.eventType === "match"
                              ? "bg-rose-500"
                              : "bg-primary"
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* カレンダー絞り込み解除ボタン（選択中のみ表示） */}
          {selectedDateStr && (
            <div className="flex items-center justify-between pt-1 border-t border-border/60">
              <span className="text-[11px] font-bold text-muted-foreground">
                📅 {selectedDateStr} の予定を表示中
              </span>
              <button
                type="button"
                onClick={() => setSelectedDateStr(null)}
                className="text-[11px] font-black text-primary hover:underline"
              >
                すべての予定を表示 ({events.length}件)
              </button>
            </div>
          )}
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
          <div className="space-y-3.5 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-card border border-border rounded-3xl p-4 shadow-sm space-y-3"
              >
                <div className="flex justify-between items-center">
                  <div className="h-5 w-24 bg-muted rounded-full" />
                  <div className="h-4 w-12 bg-muted rounded" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-6 w-40 bg-muted rounded-lg" />
                  <div className="h-4 w-56 bg-muted rounded" />
                </div>
                <div className="h-20 bg-muted/60 rounded-2xl" />
                <div className="h-24 bg-muted/60 rounded-2xl" />
              </div>
            ))}
          </div>
        ) : filteredEvents.length === 0 ? (
          /* 空ステート */
          <div className="flex flex-col items-center justify-center py-12 text-center bg-card border border-border rounded-3xl p-6 space-y-3 shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <CalendarIcon className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-black text-foreground">
                {selectedDateStr ? "選択された日の予定はありません" : "登録されている予定はありません"}
              </h4>
              <p className="text-xs font-bold text-muted-foreground">
                {selectedDateStr ? "カレンダーの他の日付を選択するか「すべての予定を表示」を押してください。" : "管理者が活動予定スケジューラーから予定を登録すると、ここに反映されます。"}
              </p>
            </div>
            {selectedDateStr && (
              <button
                type="button"
                onClick={() => setSelectedDateStr(null)}
                className="py-1.5 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-black shadow-xs active:scale-95 transition-all"
              >
                すべての予定を表示
              </button>
            )}
          </div>
        ) : (
          /* 🌟 予定カード一覧（トップページ完全互換フォーマット ＋ 全文・詳細表示） */
          <div className="space-y-4">
            {filteredEvents.map((ev, idx) => {
              const isMatch = ev.eventType === "match" || ev.amType === "match" || ev.pmType === "match";
              const isCamp = ev.eventType === "camp" || ev.amType === "camp" || ev.pmType === "camp";

              return (
                <div
                  key={ev.id}
                  className="bg-card border-2 border-border/90 hover:border-primary/40 rounded-3xl p-4 shadow-sm space-y-3.5 transition-all"
                >
                  {/* ① 上部ヘッダー：日程・日付 & 対象チーム & 出欠カウント & ✏️ 編集ボタン */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg font-black text-foreground tracking-tight">
                        {ev.date}
                      </span>

                      {/* 🎯 対象チーム・グループバッジ */}
                      {ev.targetGroup && ev.targetGroup !== "全体" && (
                        <span className="px-2 py-0.5 rounded-lg bg-primary/15 text-primary text-[10.5px] font-black border border-primary/30 shrink-0">
                          🏷️ {ev.targetGroup}
                        </span>
                      )}

                      <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold">
                        {idx + 1} / {filteredEvents.length}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* 出欠カウンター */}
                      <div className="flex items-center gap-1 text-[11px] font-black text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-lg border border-border/60">
                        <span className="text-emerald-600 dark:text-emerald-400">出 {ev.attendCount.present}</span>
                        <span>/</span>
                        <span className="text-rose-600 dark:text-rose-400">欠 {ev.attendCount.absent}</span>
                        <span>/</span>
                        <span className="text-amber-600 dark:text-amber-400">未 {ev.attendCount.pending}</span>
                      </div>

                      {/* ✏️ 編集ボタン */}
                      <button
                        type="button"
                        onClick={() => setEditingEvent({ 
                          ...ev, 
                          needsLunch: Boolean(ev.needsLunch), 
                          needsSnack: Boolean(ev.needsSnack),
                          memo: ev.memo || ""
                        })}
                        className="py-1 px-2.5 rounded-xl bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground text-xs font-black border border-primary/25 active:scale-95 transition-all flex items-center gap-1 shrink-0"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>編集</span>
                      </button>
                    </div>
                  </div>

                  {/* ② タイトル */}
                  <h3 className="text-sm font-black text-foreground tracking-tight">
                    {ev.title}
                  </h3>

                  {/* ③ ☀️ 午前（左） ＆ 🌙 午後（右）の2カラム表示 */}
                  <div className="grid grid-cols-2 gap-2">
                    {/* ☀️ 【午前】（左） */}
                    <div className="p-2.5 rounded-2xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 flex flex-col justify-between space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-amber-700 dark:text-amber-300 flex items-center gap-1">
                          <Sun className="w-3 h-3 text-amber-500" />
                          <span>午前</span>
                        </span>

                        {/* 活動内容バッジ */}
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                          ev.amType === "match" || ev.eventType === "match"
                            ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                            : ev.amType === "camp" || ev.eventType === "camp"
                            ? "bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30"
                            : "bg-primary/15 text-primary border border-primary/30"
                        }`}>
                          {ev.amType === "match" || ev.eventType === "match" ? "⚾ 試合" : ev.amType === "camp" || ev.eventType === "camp" ? "🏕️ 合宿" : "🏃 練習"}
                        </span>
                      </div>

                      {/* 活動時間 & 場所 */}
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1 text-xs font-black text-foreground">
                          <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                          <span>{ev.amTime || ev.time || "08:00〜12:00"}</span>
                        </div>

                        <div className="flex items-center gap-1 text-[11px] font-bold text-foreground/90 truncate">
                          <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
                          <span className="truncate">{ev.amLocation || ev.location || "グラウンド"}</span>
                        </div>
                      </div>
                    </div>

                    {/* 🌙 【午後】（右） */}
                    <div className={`p-2.5 rounded-2xl border flex flex-col justify-between space-y-2 ${
                      ev.hasPm && ev.pmType !== "off"
                        ? "bg-indigo-500/5 dark:bg-indigo-500/10 border-indigo-500/20"
                        : "bg-muted/30 border-border/60 opacity-75"
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
                          <Moon className="w-3 h-3 text-indigo-500" />
                          <span>午後</span>
                        </span>

                        {/* 活動内容バッジ */}
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                          !ev.hasPm || ev.pmType === "off"
                            ? "bg-muted text-muted-foreground border border-border"
                            : ev.pmType === "match"
                            ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                            : ev.pmType === "camp"
                            ? "bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30"
                            : "bg-primary/15 text-primary border border-primary/30"
                        }`}>
                          {!ev.hasPm || ev.pmType === "off" ? "🏖️ なし" : ev.pmType === "match" ? "⚾ 試合" : ev.pmType === "camp" ? "🏕️ 合宿" : "🏃 練習"}
                        </span>
                      </div>

                      {/* 活動時間 & 場所 */}
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1 text-xs font-black text-foreground">
                          <Clock className="w-3 h-3 text-indigo-500 shrink-0" />
                          <span>{ev.hasPm && ev.pmTime ? ev.pmTime : "解散・なし"}</span>
                        </div>

                        <div className="flex items-center gap-1 text-[11px] font-bold text-foreground/90 truncate">
                          <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
                          <span className="truncate">{ev.hasPm && ev.pmLocation ? ev.pmLocation : (ev.hasPm ? ev.amLocation : "—")}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ④ 📋 詳細情報ブロック（お弁当、補食、連絡事項、配車、当番） */}
                  <div className="p-3.5 rounded-2xl bg-muted/40 border border-border/80 space-y-2.5 text-xs font-bold">
                    {/* 1. お弁当 & 補食 */}
                    <div className="grid grid-cols-2 gap-2">
                      {/* お弁当 */}
                      <div className="flex items-center justify-between p-2 rounded-xl bg-background/60 border border-border/50">
                        <span className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
                          <Utensils className="w-3.5 h-3.5 text-amber-500" />
                          <span>お弁当</span>
                        </span>
                        <span className={`px-2 py-0.5 rounded-md text-[10.5px] font-black ${
                          ev.needsLunch === true
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                            : "text-muted-foreground"
                        }`}>
                          {ev.needsLunch === true ? "🍙 持参要" : "不要"}
                        </span>
                      </div>

                      {/* 補食（捕食） */}
                      <div className="flex items-center justify-between p-2 rounded-xl bg-background/60 border border-border/50">
                        <span className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
                          <span className="text-sm leading-none">🍌</span>
                          <span>補食</span>
                        </span>
                        <span className={`px-2 py-0.5 rounded-md text-[10.5px] font-black ${
                          ev.needsSnack === true
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                            : "text-muted-foreground"
                        }`}>
                          {ev.needsSnack === true ? "🍌 持参要" : "不要"}
                        </span>
                      </div>
                    </div>

                    {/* 2. 連絡事項・持ち物（全文・改行表示） */}
                    <div className="pt-2 border-t border-border/60 space-y-1">
                      <span className="text-[10px] font-black text-muted-foreground flex items-center gap-1">
                        <FileText className="w-3 h-3 text-primary" />
                        <span>連絡事項・持ち物</span>
                      </span>
                      <div className={`text-xs font-bold p-2.5 rounded-xl border border-border/50 whitespace-pre-wrap leading-relaxed ${
                        ev.memo ? "text-foreground bg-background/80" : "text-muted-foreground bg-muted/20"
                      }`}>
                        {ev.memo || "特になし"}
                      </div>
                    </div>

                    {/* 3. 配車（配車情報 ＋ 配車表リンク） */}
                    <div className="pt-2 border-t border-border/60 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Car className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span className="text-muted-foreground shrink-0">配車:</span>
                        <span className="text-foreground truncate font-black text-xs">
                          {ev.carInfo ? ev.carInfo : (isMatch ? "配車あり" : "なし（現地集合）")}
                        </span>
                      </div>

                      <Link
                        href="/liff/carpool"
                        className="text-xs font-black text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5 shrink-0 ml-2"
                      >
                        <span>配車表へ</span>
                        <ChevronRight className="w-3 h-3" />
                      </Link>
                    </div>

                    {/* 4. 一番下に当番 */}
                    {ev.dutyGroup && (
                      <div className="pt-2 border-t border-border/60 flex items-center justify-between text-primary">
                        <span className="flex items-center gap-1.5 font-bold">
                          <ClipboardList className="w-3.5 h-3.5 text-primary" />
                          <span>お当番</span>
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-primary/15 border border-primary/30 text-primary font-black text-[11px] flex items-center gap-1">
                          <span>📋</span>
                          <span>{ev.dutyGroup}</span>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* ⑤ 出欠回答セクション (○, △, ×, ？) */}
                  <div className="pt-2 border-t border-primary/15 space-y-3">
                    {/* 👦 1. 保護者の場合: お子様（選手）の出欠回答 */}
                    {userRole === "parent" && children.map((child) => {
                      const childStatus = getChildAttendance(ev.id, child.id);
                      return (
                        <div key={child.id} className="p-2.5 rounded-2xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-black text-amber-700 dark:text-amber-300 flex items-center gap-1">
                              <span>👦</span>
                              <span>お子様（{child.name}{child.uniformNumber ? ` ${child.uniformNumber}` : ""}）の出欠</span>
                            </span>
                            <span className="text-[11px] font-bold">
                              {childStatus === "present" && <span className="text-emerald-600 dark:text-emerald-400 font-black">○ 参加</span>}
                              {childStatus === "late" && <span className="text-amber-600 dark:text-amber-400 font-black">△ 調整・遅刻</span>}
                              {childStatus === "absent" && <span className="text-rose-600 dark:text-rose-400 font-black">× 欠席</span>}
                              {childStatus === "pending" && <span className="text-muted-foreground font-black">？ 未定</span>}
                            </span>
                          </div>

                          <div className="grid grid-cols-4 gap-1">
                            <button
                              type="button"
                              onClick={() => handleChildStatusChange(ev.id, child.id, "present")}
                              className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 ${
                                childStatus === "present"
                                  ? "bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-500/50"
                                  : "bg-background/80 hover:bg-background text-muted-foreground border border-border/60"
                              }`}
                            >
                              <span className="text-sm leading-none">○</span>
                              <span className="text-[9px]">参加</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleChildStatusChange(ev.id, child.id, "late")}
                              className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 ${
                                childStatus === "late"
                                  ? "bg-amber-500 text-white shadow-xs ring-2 ring-amber-500/50"
                                  : "bg-background/80 hover:bg-background text-muted-foreground border border-border/60"
                              }`}
                            >
                              <span className="text-sm leading-none">△</span>
                              <span className="text-[9px]">調整</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleChildStatusChange(ev.id, child.id, "absent")}
                              className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 ${
                                childStatus === "absent"
                                  ? "bg-rose-600 text-white shadow-xs ring-2 ring-rose-500/50"
                                  : "bg-background/80 hover:bg-background text-muted-foreground border border-border/60"
                              }`}
                            >
                              <span className="text-sm leading-none">×</span>
                              <span className="text-[9px]">欠席</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleChildStatusChange(ev.id, child.id, "pending")}
                              className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 ${
                                childStatus === "pending"
                                  ? "bg-slate-700 text-white dark:bg-slate-300 dark:text-slate-900 shadow-xs ring-2 ring-slate-500/50"
                                  : "bg-background/80 hover:bg-background text-muted-foreground border border-border/60"
                              }`}
                            >
                              <span className="text-sm leading-none">？</span>
                              <span className="text-[9px]">未定</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* 👨 2. 保護者本人（または選手本人）の出欠回答 */}
                    {(() => {
                      const pStatus = getEventAttendance(ev.id, ev.myStatus);
                      return (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-black text-foreground">
                              {userRole === "parent" ? "👨 保護者（自分）の参加・当番" : "あなたの出欠回答"}
                            </span>
                            <span className="text-[11px] font-bold">
                              {pStatus === "present" && <span className="text-emerald-600 dark:text-emerald-400 font-black">○ {userRole === "parent" ? "参加・当番可" : "出席"}</span>}
                              {(pStatus === "late" || pStatus === "partial") && <span className="text-amber-600 dark:text-amber-400 font-black">△ 調整</span>}
                              {pStatus === "absent" && <span className="text-rose-600 dark:text-rose-400 font-black">× 欠席</span>}
                              {(pStatus === "pending" || !pStatus) && <span className="text-muted-foreground font-black">？ 未定</span>}
                            </span>
                          </div>

                          <div className="grid grid-cols-4 gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleStatusChange(ev.id, "present")}
                              className={`flex flex-col items-center justify-center py-2 rounded-xl text-xs font-black transition-all active:scale-95 ${
                                pStatus === "present"
                                  ? "bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-500/50"
                                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
                              }`}
                            >
                              <span className="text-sm leading-none mb-0.5">○</span>
                              <span className="text-[10px]">{userRole === "parent" ? "参加/当番" : "出席"}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleStatusChange(ev.id, "late")}
                              className={`flex flex-col items-center justify-center py-2 rounded-xl text-xs font-black transition-all active:scale-95 ${
                                pStatus === "late" || pStatus === "partial"
                                  ? "bg-amber-500 text-white shadow-xs ring-2 ring-amber-500/50"
                                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
                              }`}
                            >
                              <span className="text-sm leading-none mb-0.5">△</span>
                              <span className="text-[10px]">調整</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleStatusChange(ev.id, "absent")}
                              className={`flex flex-col items-center justify-center py-2 rounded-xl text-xs font-black transition-all active:scale-95 ${
                                pStatus === "absent"
                                  ? "bg-rose-600 text-white shadow-xs ring-2 ring-rose-500/50"
                                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
                              }`}
                            >
                              <span className="text-sm leading-none mb-0.5">×</span>
                              <span className="text-[10px]">欠席</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleStatusChange(ev.id, "pending")}
                              className={`flex flex-col items-center justify-center py-2 rounded-xl text-xs font-black transition-all active:scale-95 ${
                                pStatus === "pending" || !pStatus
                                  ? "bg-slate-700 text-white dark:bg-slate-300 dark:text-slate-900 shadow-xs ring-2 ring-slate-500/50"
                                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
                              }`}
                            >
                              <span className="text-sm leading-none mb-0.5">？</span>
                              <span className="text-[10px]">未定</span>
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 🌟 予定の個別編集モーダル */}
      {editingEvent && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150">
          <div
            className="bg-card w-full max-w-xl rounded-t-3xl sm:rounded-3xl border-2 border-primary/30 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in slide-in-from-bottom-4 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* モーダルヘッダー */}
            <div className="px-5 py-4 border-b border-border/80 flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-xl bg-primary text-primary-foreground text-xs font-black shrink-0">
                  {editingEvent.date}
                </span>
                <h3 className="text-sm font-black text-foreground">
                  予定の個別詳細編集
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingEvent(null)}
                className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground active:scale-95 transition-all"
              >
                <span className="text-base font-black leading-none">✕</span>
              </button>
            </div>

            {/* モーダル本文 */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* 1. タイトル */}
              <div className="space-y-1">
                <label className="text-[11px] font-black text-foreground">予定タイトル</label>
                <input
                  type="text"
                  value={editingEvent.title}
                  onChange={(e) => setEditingEvent({ ...editingEvent, title: e.target.value })}
                  placeholder="予定タイトル（例: 秋季大会 2回戦 vs レッドソックス）"
                  className="w-full px-3 py-2 rounded-xl bg-card border border-border/80 text-xs font-black text-foreground focus:outline-hidden focus:border-primary"
                />
              </div>

              {/* 2. 対象グループ */}
              <div className="space-y-1.5">
                <label className="text-[10.5px] font-bold text-muted-foreground">対象チーム・グループ</label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {TARGET_GROUPS.map((tg) => {
                    const isSel = (editingEvent.targetGroup || "全体") === tg;
                    return (
                      <button
                        key={tg}
                        type="button"
                        onClick={() => setEditingEvent({ ...editingEvent, targetGroup: tg })}
                        className={`px-2.5 py-1 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                          isSel
                            ? "bg-primary text-primary-foreground border-primary font-black shadow-xs"
                            : "bg-card hover:bg-muted text-muted-foreground hover:text-foreground border-border/80"
                        }`}
                      >
                        {tg}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. 種別 */}
              <div className="space-y-1.5">
                <label className="text-[10.5px] font-bold text-muted-foreground">活動種別</label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {EVENT_TYPES.map((t) => {
                    const isSel = editingEvent.eventType === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setEditingEvent({ ...editingEvent, eventType: t.id as any })}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                          isSel
                            ? t.color + " font-black shadow-2xs"
                            : "bg-card border-border/80 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {t.icon} {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4. 時間帯・球場場所 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground block mb-1">活動時間</label>
                  <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-card border border-border/80">
                    <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <input
                      type="text"
                      value={editingEvent.time}
                      onChange={(e) => setEditingEvent({ ...editingEvent, time: e.target.value })}
                      placeholder="08:00〜12:00"
                      className="bg-transparent text-xs font-bold text-foreground focus:outline-hidden w-full"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-muted-foreground block mb-1">球場・場所</label>
                  <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-card border border-border/80">
                    <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <input
                      type="text"
                      value={editingEvent.location}
                      onChange={(e) => setEditingEvent({ ...editingEvent, location: e.target.value })}
                      placeholder="市民第1球場 または 選択"
                      className="bg-transparent text-xs font-bold text-foreground focus:outline-hidden w-full"
                    />
                  </div>
                </div>
              </div>

              {/* 球場クイック選択候補 */}
              {venuesList.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-0.5">
                    <span className="text-[9.5px] font-bold text-muted-foreground shrink-0">候補:</span>
                    {venuesList.map((v) => {
                      const displayName = getVenueDisplayName(v);
                      const isSelected = editingEvent.location === displayName || editingEvent.location === v.name;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setEditingEvent({ ...editingEvent, location: displayName })}
                          className={`px-2 py-0.5 rounded-lg text-[9.5px] font-bold shrink-0 transition-all border ${
                            isSelected
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 font-black shadow-2xs"
                              : "bg-card hover:bg-muted text-muted-foreground hover:text-foreground border-border/70"
                          }`}
                        >
                          🏟️ {displayName}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 5. 当番・お弁当・補食 */}
              <div className="space-y-3 p-3.5 rounded-2xl bg-muted/30 border border-border/80">
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground block mb-1">当番</label>
                  <div className="grid grid-cols-4 gap-1">
                    {DUTY_GROUPS.map((dg) => (
                      <button
                        key={dg}
                        type="button"
                        onClick={() => setEditingEvent({ ...editingEvent, dutyGroup: dg })}
                        className={`py-1 text-center rounded-lg text-[11px] font-bold border transition-all active:scale-95 ${
                          editingEvent.dutyGroup === dg
                            ? "bg-primary text-primary-foreground border-primary font-black shadow-xs"
                            : "bg-card border-border/80 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {dg}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/60">
                  {/* お弁当 */}
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground block mb-1">お弁当</label>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingEvent({ ...editingEvent, needsLunch: true })}
                        className={`flex-1 py-1 rounded-lg text-[11px] font-bold border transition-all flex items-center justify-center gap-1 ${
                          editingEvent.needsLunch === true
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40 font-black"
                            : "bg-card border-border/80 text-muted-foreground"
                        }`}
                      >
                        <Utensils className="w-3 h-3" />
                        <span>持参要</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingEvent({ ...editingEvent, needsLunch: false })}
                        className={`flex-1 py-1 rounded-lg text-[11px] font-bold border transition-all flex items-center justify-center gap-1 ${
                          editingEvent.needsLunch !== true
                            ? "bg-primary/15 text-primary border-primary/40 font-black"
                            : "bg-card border-border/80 text-muted-foreground"
                        }`}
                      >
                        <span>不要</span>
                      </button>
                    </div>
                  </div>

                  {/* 補食（捕食） */}
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground block mb-1">補食（捕食）</label>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingEvent({ ...editingEvent, needsSnack: true })}
                        className={`flex-1 py-1 rounded-lg text-[11px] font-bold border transition-all flex items-center justify-center gap-1 ${
                          editingEvent.needsSnack === true
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 font-black"
                            : "bg-card border-border/80 text-muted-foreground"
                        }`}
                      >
                        <span className="text-xs leading-none">🍌</span>
                        <span>持参要</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingEvent({ ...editingEvent, needsSnack: false })}
                        className={`flex-1 py-1 rounded-lg text-[11px] font-bold border transition-all flex items-center justify-center gap-1 ${
                          editingEvent.needsSnack !== true
                            ? "bg-primary/15 text-primary border-primary/40 font-black"
                            : "bg-card border-border/80 text-muted-foreground"
                        }`}
                      >
                        <span>不要</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 6. 連絡事項 */}
              <div className="space-y-1">
                <label className="text-[11px] font-black text-foreground">連絡事項・持ち物</label>
                <textarea
                  rows={2}
                  value={editingEvent.memo || ""}
                  onChange={(e) => setEditingEvent({ ...editingEvent, memo: e.target.value })}
                  placeholder="ユニフォーム正装、スパイク持参、雨天時は7:00連絡など"
                  className="w-full px-3 py-2 rounded-xl bg-card border border-border/80 text-xs font-bold text-foreground focus:outline-hidden focus:border-primary resize-none"
                />
              </div>
            </div>

            {/* モーダルフッター */}
            <div className="px-5 py-3.5 border-t border-border/80 flex items-center justify-between bg-muted/20">
              <button
                type="button"
                onClick={() => setEditingEvent(null)}
                className="text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                キャンセル
              </button>

              <button
                type="button"
                onClick={handleSaveEventEdit}
                disabled={isSavingEdit}
                className="py-2 px-5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-black shadow-xs transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSavingEdit ? "保存中..." : "予定を更新する"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
