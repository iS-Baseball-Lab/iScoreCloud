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
  Layers,
  Check,
  Flame,
  Plus,
  ArrowRightLeft,
  Settings2,
  X,
} from "lucide-react";

const TARGET_GROUPS = ["全体", "Aチーム", "Bチーム", "高学年", "低学年", "試合組", "練習組"];
const DUTY_GROUPS = ["1班", "2班", "3班", "4班", "なし"];
const EVENT_TYPES = [
  { id: "practice", label: "練習", icon: "🏃", color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  { id: "match", label: "試合", icon: "⚾", color: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30" },
  { id: "camp", label: "合宿", icon: "🏕️", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  { id: "meeting", label: "ミーティング", icon: "📋", color: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
];

export interface ActivityGroup {
  id: string;
  name: string;
  amType?: "match" | "practice" | "meeting" | "camp";
  amTime?: string;
  amLocation?: string;
  hasPm?: boolean;
  pmType?: "match" | "practice" | "meeting" | "camp" | "off";
  pmTime?: string;
  pmLocation?: string;
  dutyGroup?: string;
  carInfo?: string;
  // 互換用
  time?: string;
  location?: string;
  eventType?: "match" | "practice" | "meeting" | "camp";
}

export interface ScheduleEvent {
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
  activityGroups?: ActivityGroup[];
  groupCounts?: Record<string, number>;
  myStatus: "present" | "absent" | "pending" | "late" | "partial";
  mySelectedGroupId?: string | null;
  attendCount: { present: number; absent: number; pending: number };
}

export default function LiffSchedulePage() {
  const { currentTeam, profile } = useLiff();
  const [filter, setFilter] = useState<"all" | "match" | "practice">("all");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 📅 月間カレンダー用ステート
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);

  // ✏️ 個別編集モーダル用ステート
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);
  const [activeEditGroupId, setActiveEditGroupId] = useState<string>("main");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [venuesList, setVenuesList] = useState<Array<{ id: string; name: string; shortName?: string | null }>>([]);

  // 👥 各カードでアクティブなグループタブ
  const [activeGroupTabMap, setActiveGroupTabMap] = useState<Record<string, string>>({});

  // ユーザーの立場とお子様リスト
  const [userRole, setUserRole] = useState<"parent" | "coach" | "player" | "staff">("parent");
  const [children, setChildren] = useState<Array<{ id: string; name: string; uniformNumber?: string; parentName?: string }>>([]);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, "present" | "absent" | "pending" | "late">>({});
  const [parentGroupMap, setParentGroupMap] = useState<Record<string, string>>({});
  const [childAttendanceMap, setChildAttendanceMap] = useState<Record<string, Record<string, "present" | "absent" | "pending" | "late">>>({});
  const [childGroupMap, setChildGroupMap] = useState<Record<string, Record<string, string>>>({});

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
          if (json.childGroupMap) {
            setChildGroupMap(prev => ({ ...json.childGroupMap, ...prev }));
          }

          // 自分の出欠・選択グループを復元
          if (json.parentAttendances && Object.keys(json.parentAttendances).length > 0) {
            setAttendanceMap(prev => ({ ...json.parentAttendances, ...prev }));
            setEvents(prev => prev.map(ev => ({
              ...ev,
              myStatus: json.parentAttendances[ev.id] || ev.myStatus
            })));
          }
          if (json.parentGroupMap) {
            setParentGroupMap(prev => ({ ...json.parentGroupMap, ...prev }));
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

  const getChildSelectedGroup = (eventId: string, childId: string, defaultGroupId?: string) => {
    return childGroupMap[eventId]?.[childId] || defaultGroupId || "";
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

  const getParentSelectedGroup = (eventId: string, defaultGroupId?: string) => {
    return parentGroupMap[eventId] || defaultGroupId || "";
  };

  // お子様の出欠変更ハンドラー（グループ選択対応）
  const handleChildStatusChange = async (
    eventId: string,
    childId: string,
    status: "present" | "absent" | "pending" | "late",
    selectedGroupId?: string
  ) => {
    setChildAttendanceMap((prev) => ({
      ...prev,
      [eventId]: {
        ...(prev[eventId] || {}),
        [childId]: status,
      }
    }));

    if (selectedGroupId !== undefined) {
      setChildGroupMap((prev) => ({
        ...prev,
        [eventId]: {
          ...(prev[eventId] || {}),
          [childId]: selectedGroupId,
        }
      }));
    }

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
          selectedGroupId: status === "present" ? (selectedGroupId || childGroupMap[eventId]?.[childId]) : null,
        }),
      });
    } catch (err) {
      console.error("Failed to save child attendance:", err);
    }
  };

  // 保護者本人の出欠変更ハンドラー（グループ選択対応）
  const handleStatusChange = async (
    eventId: string,
    status: "present" | "absent" | "pending" | "late",
    selectedGroupId?: string
  ) => {
    setAttendanceMap(prev => ({ ...prev, [eventId]: status }));
    if (selectedGroupId !== undefined) {
      setParentGroupMap(prev => ({ ...prev, [eventId]: selectedGroupId }));
    }

    if (typeof window !== "undefined") {
      localStorage.setItem(`iscore_my_att_${eventId}`, status);
    }
    setEvents((prev) =>
      prev.map((ev) => (ev.id === eventId ? {
        ...ev,
        myStatus: status,
        mySelectedGroupId: selectedGroupId || ev.mySelectedGroupId,
      } : ev))
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
          selectedGroupId: status === "present" ? (selectedGroupId || parentGroupMap[eventId]) : null,
        }),
      });
    } catch (err) {
      console.error("Failed to save attendance:", err);
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
          const pGrpMap: Record<string, string> = {};
          for (const ev of normalizedEvents) {
            if (ev.id && ev.myStatus && ev.myStatus !== "pending") {
              map[ev.id] = ev.myStatus === "partial" ? "late" : (ev.myStatus as "present" | "absent" | "late");
            }
            if (ev.mySelectedGroupId) {
              pGrpMap[ev.id] = ev.mySelectedGroupId;
            }
          }
          if (Object.keys(map).length > 0) {
            setAttendanceMap(prev => ({ ...map, ...prev }));
          }
          if (Object.keys(pGrpMap).length > 0) {
            setParentGroupMap(prev => ({ ...pGrpMap, ...prev }));
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

  // ✏️ 個別予定の保存ハンドラー
  const handleSaveEventEdit = async () => {
    if (!editingEvent) return;

    try {
      setIsSavingEdit(true);
      const teamId = currentTeam?.id || "demo-team";

      let finalEvent = { ...editingEvent };

      // グループがある場合の親データ同期
      if (finalEvent.activityGroups && finalEvent.activityGroups.length > 0) {
        const firstGrp = finalEvent.activityGroups[0];
        finalEvent.amType = firstGrp.amType || "practice";
        finalEvent.amTime = firstGrp.amTime || "08:00〜12:00";
        finalEvent.amLocation = firstGrp.amLocation || "";
        finalEvent.hasPm = Boolean(firstGrp.hasPm && firstGrp.pmType !== "off");
        finalEvent.pmType = firstGrp.pmType || "practice";
        finalEvent.pmTime = firstGrp.pmTime || "13:00〜17:00";
        finalEvent.pmLocation = firstGrp.pmLocation || firstGrp.amLocation || "";
        finalEvent.eventType = firstGrp.amType || "practice";
        finalEvent.location = firstGrp.amLocation || "";
        finalEvent.time = finalEvent.hasPm
          ? `${finalEvent.amTime} / ${finalEvent.pmTime}`
          : (finalEvent.amTime || "08:00〜12:00");
      } else {
        // 単一グループの場合
        const isPmActive = editingEvent.hasPm && editingEvent.pmType !== "off";
        finalEvent.eventType = editingEvent.amType || editingEvent.eventType || "practice";
        finalEvent.location = editingEvent.amLocation || editingEvent.location || "";
        finalEvent.time = isPmActive
          ? `${editingEvent.amTime || "08:00〜12:00"} / ${editingEvent.pmTime || "13:00〜17:00"}`
          : (editingEvent.amTime || "08:00〜12:00");
      }

      setEvents((prev) =>
        prev.map((ev) => (ev.id === finalEvent.id ? { ...finalEvent } : ev))
      );

      const res = await fetch(`/api/events/${teamId}/${editingEvent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: finalEvent.title,
          eventType: finalEvent.eventType,
          location: finalEvent.location,
          targetGroup: finalEvent.targetGroup || "全体",
          dutyGroup: finalEvent.dutyGroup === "なし" ? null : finalEvent.dutyGroup || null,
          description: finalEvent.memo || "",
          needsLunch: Boolean(finalEvent.needsLunch),
          needsSnack: Boolean(finalEvent.needsSnack),
          amType: finalEvent.amType,
          amTime: finalEvent.amTime,
          amLocation: finalEvent.amLocation,
          pmType: finalEvent.hasPm ? finalEvent.pmType : "off",
          pmTime: finalEvent.hasPm ? finalEvent.pmTime : null,
          pmLocation: finalEvent.hasPm ? finalEvent.pmLocation : null,
          activityGroups: finalEvent.activityGroups && finalEvent.activityGroups.length > 0 ? JSON.stringify(finalEvent.activityGroups) : null,
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
    setSelectedDateStr(null);
  };
  const handleNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
    setSelectedDateStr(null);
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
      if (ev.dateStr) {
        const list = map.get(ev.dateStr) || [];
        list.push(ev);
        map.set(ev.dateStr, list);
      }
    }
    return map;
  }, [events]);

  // 現在カレンダーで表示中の月プレフィックス（YYYY-MM）
  const currentMonthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;

  // 現在表示月の全イベント
  const eventsInCurrentMonth = useMemo(() => {
    return events.filter((ev) => {
      if (!ev.dateStr) return true;
      return ev.dateStr.startsWith(currentMonthPrefix);
    });
  }, [events, currentMonthPrefix]);

  const filteredEvents = useMemo(() => {
    const list = eventsInCurrentMonth.filter((ev) => {
      if (selectedDateStr && ev.dateStr !== selectedDateStr) return false;
      if (filter === "all") return true;
      if (filter === "match") return ev.eventType === "match" || ev.amType === "match" || ev.pmType === "match" || ev.activityGroups?.some(g => g.eventType === "match");
      if (filter === "practice") return ev.eventType === "practice" || ev.amType === "practice" || ev.pmType === "practice" || ev.activityGroups?.some(g => g.eventType === "practice");
      return true;
    });

    // 昇順（直近・古い日付から順に）または降順でソート
    return list.sort((a, b) => {
      const keyA = a.dateStr || a.date || "";
      const keyB = b.dateStr || b.date || "";
      return sortOrder === "asc" ? keyA.localeCompare(keyB) : keyB.localeCompare(keyA);
    });
  }, [eventsInCurrentMonth, filter, selectedDateStr, sortOrder]);

  return (
    <div className="flex flex-col min-h-screen">
      <LiffHeader />

      <div className="p-4 space-y-4">
        {/* ページ内ヘッダー */}
        <LiffPageHeader
          title="予定 & 出欠"
          subtitle="活動日程・球場・集合時間・お当番・出欠回答"
          icon={
            <span className="w-8 h-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-black">
              <CalendarIcon className="w-4 h-4" />
            </span>
          }
          showBack
          shareData={{
            title: `【予定 & 出欠】${currentTeam?.name || "チーム"} 活動スケジュール`,
            text: `今月の活動予定・球場・集合時間・出欠回答はこちらから確認できます`,
          }}
        />

        {/* 🛠️ 活動予定の一括登録・編集（スケジューラー導線） */}
        <Link
          href="/liff/schedule/admin"
          className="flex items-center justify-between p-2.5 px-3.5 rounded-2xl bg-card hover:bg-primary/5 border border-primary/25 hover:border-primary/45 shadow-2xs active:scale-[0.99] transition-all group"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black shrink-0">
              <Sparkles className="w-3.5 h-3.5" />
            </span>
            <span className="text-xs font-black text-foreground">
              活動予定の一括登録・編集
            </span>
          </div>

          <div className="flex items-center gap-1 text-xs font-black text-primary shrink-0">
            <span>開く</span>
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>

        {/* 📅 月間ミニカレンダー */}
        <div className="p-3.5 bg-card rounded-3xl border border-border/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-foreground">
                {currentYear}年 {currentMonth + 1}月
              </span>
              {selectedDateStr && (
                <button
                  type="button"
                  onClick={() => setSelectedDateStr(null)}
                  className="px-2 py-0.5 text-[10px] font-bold rounded-lg bg-primary/15 text-primary border border-primary/30 active:scale-95"
                >
                  絞り込み解除
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleToday}
                className="px-2.5 py-1 text-[11px] font-black rounded-xl bg-muted hover:bg-muted/80 text-foreground transition-all active:scale-95 cursor-pointer"
              >
                今日
              </button>
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1 text-muted-foreground hover:text-foreground rounded-lg transition-all cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1 text-muted-foreground hover:text-foreground rounded-lg transition-all cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 曜日ヘッダー */}
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-black">
            {weekDays.map((w, idx) => (
              <span
                key={w}
                className={idx === 0 ? "text-rose-500" : idx === 6 ? "text-blue-500" : "text-muted-foreground"}
              >
                {w}
              </span>
            ))}
          </div>

          {/* 日付グリッド */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((d, idx) => {
              const hasEvents = eventsByDate.has(d.dateStr);
              const dayEvents = eventsByDate.get(d.dateStr) || [];
              const isSelected = selectedDateStr === d.dateStr;
              const isToday = d.dateStr === new Date().toISOString().split("T")[0];
              const isSun = d.date.getDay() === 0;
              const isSat = d.date.getDay() === 6;

              const hasMatch = dayEvents.some((e) => e.eventType === "match" || e.amType === "match" || e.pmType === "match" || e.activityGroups?.some(g => g.eventType === "match"));
              const hasGroups = dayEvents.some((e) => e.activityGroups && e.activityGroups.length > 1);

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      setSelectedDateStr(null);
                    } else {
                      setSelectedDateStr(d.dateStr);
                    }
                  }}
                  className={`flex flex-col items-center justify-center p-1 rounded-xl min-h-[38px] transition-all relative cursor-pointer ${
                    isSelected
                      ? "bg-primary text-primary-foreground font-black shadow-xs ring-2 ring-primary/40"
                      : isToday
                      ? "bg-primary/10 border border-primary/40 font-black text-foreground"
                      : d.isCurrentMonth
                      ? "hover:bg-muted/60 text-foreground font-bold"
                      : "text-muted-foreground/40 font-normal"
                  }`}
                >
                  <span
                    className={`text-xs ${
                      isSelected
                        ? "text-primary-foreground font-black"
                        : isSun
                        ? "text-rose-500"
                        : isSat
                        ? "text-blue-500"
                        : ""
                    }`}
                  >
                    {d.date.getDate()}
                  </span>

                  {/* 予定マーカー */}
                  {hasEvents && (
                    <div className="flex items-center gap-0.5 mt-0.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          hasMatch ? "bg-rose-500" : "bg-emerald-500"
                        }`}
                      />
                      {hasGroups && (
                        <span className="w-1 h-1 rounded-full bg-amber-500" title="複数グループ活動あり" />
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* フィルター切り替え ＆ 昇順/降順ソート切り替えタブ */}
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-1 p-1 bg-muted/60 rounded-2xl border border-border">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`flex-1 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                filter === "all"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              すべて ({eventsInCurrentMonth.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("match")}
              className={`flex-1 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
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
              className={`flex-1 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                filter === "practice"
                  ? "bg-card text-primary shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              🏃 練習のみ
            </button>
          </div>

          {/* 昇順 / 降順 切り替えボタン */}
          <button
            type="button"
            onClick={() => setSortOrder(prev => prev === "asc" ? "desc" : "asc")}
            className="py-2 px-2.5 rounded-2xl bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-black border border-border transition-all active:scale-95 flex items-center gap-1 shrink-0 cursor-pointer"
            title={sortOrder === "asc" ? "現在：昇順（直近から）" : "現在：降順（未来から）"}
          >
            <span>{sortOrder === "asc" ? "↑ 昇順" : "↓ 降順"}</span>
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
                {selectedDateStr
                  ? "選択された日の予定はありません"
                  : `${currentYear}年${currentMonth + 1}月の予定はありません`}
              </h4>
              <p className="text-xs font-bold text-muted-foreground">
                {selectedDateStr
                  ? "カレンダーの他の日付を選択するか「すべての予定を表示」を押してください。"
                  : "上のカレンダーで別の月を選択するか、スケジューラーから予定を登録してください。"}
              </p>
            </div>
            {selectedDateStr && (
              <button
                type="button"
                onClick={() => setSelectedDateStr(null)}
                className="py-1.5 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-black shadow-xs active:scale-95 transition-all cursor-pointer"
              >
                {currentMonth + 1}月のすべての予定を表示
              </button>
            )}
          </div>
        ) : (
          /* 🌟 予定カード一覧（1日1カード化 ＆ 複数グループ選択 ＆ 午前午後表示） */
          <div className="space-y-4">
            {filteredEvents.map((ev, idx) => {
              const hasActivityGroups = Boolean(ev.activityGroups && ev.activityGroups.length > 0);
              const activityGroups = ev.activityGroups || [];
              const activeGroupId = activeGroupTabMap[ev.id] || (activityGroups[0]?.id || "default");
              const currentGroup = activityGroups.find(g => g.id === activeGroupId) || activityGroups[0];

              const isMatch = ev.eventType === "match" || ev.amType === "match" || ev.pmType === "match" || activityGroups.some(g => g.eventType === "match");

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

                      {hasActivityGroups && (
                        <span className="px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-black border border-amber-500/30 flex items-center gap-1 shrink-0">
                          <Layers className="w-3 h-3 text-amber-500" />
                          <span>{activityGroups.length}グループ活動</span>
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
                        onClick={() => {
                          let grps: ActivityGroup[] | undefined = undefined;
                          if (Array.isArray(ev.activityGroups) && ev.activityGroups.length > 0) {
                            grps = ev.activityGroups;
                          } else if (typeof ev.activityGroups === "string") {
                            try {
                              grps = JSON.parse(ev.activityGroups);
                            } catch {}
                          }

                          if (grps && grps.length > 0) {
                            setActiveEditGroupId(grps[0].id);
                          } else {
                            setActiveEditGroupId("main");
                          }

                          setEditingEvent({ 
                            ...ev, 
                            needsLunch: Boolean(ev.needsLunch), 
                            needsSnack: Boolean(ev.needsSnack),
                            memo: ev.memo || "",
                            amType: ev.amType || ev.eventType || "practice",
                            amTime: ev.amTime || ev.time || "08:00〜12:00",
                            amLocation: ev.amLocation || ev.location || "",
                            pmType: ev.pmType || "practice",
                            pmTime: ev.pmTime || "13:00〜17:00",
                            pmLocation: ev.pmLocation || ev.amLocation || ev.location || "",
                            hasPm: ev.hasPm !== undefined ? ev.hasPm : true,
                            dutyGroup: ev.dutyGroup || "1班",
                            activityGroups: grps,
                          });
                        }}
                        className="py-1 px-2.5 rounded-xl bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground text-xs font-black border border-primary/25 active:scale-95 transition-all flex items-center gap-1 shrink-0 cursor-pointer"
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

                  {/* ③ 活動スケジュール表示（午前・午後 ＆ グループ切り替え） */}
                  {hasActivityGroups ? (
                    /* 👥 複数グループがある場合 */
                    <div className="space-y-2.5">
                      {/* グループ切り替えタブ */}
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
                        {activityGroups.map((grp) => {
                          const isSel = (activeGroupId === grp.id);
                          const gCount = ev.groupCounts?.[grp.id] || 0;
                          return (
                            <button
                              key={grp.id}
                              type="button"
                              onClick={() => setActiveGroupTabMap(prev => ({ ...prev, [ev.id]: grp.id }))}
                              className={`px-3 py-1.5 rounded-xl text-xs font-black shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
                                isSel
                                  ? "bg-primary text-primary-foreground shadow-xs ring-1 ring-primary"
                                  : "bg-muted/70 text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              <span>{grp.amType === "match" || grp.eventType === "match" ? "⚾" : "🏃"}</span>
                              <span>{grp.name}</span>
                              {gCount > 0 && (
                                <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-mono ${
                                  isSel ? "bg-white/25 text-white" : "bg-muted text-foreground"
                                }`}>
                                  {gCount}名
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* 選択中グループの 午前・午後 スケジュール詳細カード */}
                      {currentGroup && (
                        <div className="space-y-2">
                          {currentGroup.hasPm && currentGroup.pmType !== "off" && currentGroup.pmTime ? (
                            /* 午前・午後の2分割表示 */
                            <div className="grid grid-cols-2 gap-2">
                              {/* 午前 */}
                              <div className="p-2.5 rounded-2xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 flex flex-col justify-between space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-black text-amber-700 dark:text-amber-300 flex items-center gap-1">
                                    <Sun className="w-3 h-3 text-amber-500" />
                                    <span>午前</span>
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                    currentGroup.amType === "match"
                                      ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                                      : "bg-primary/15 text-primary border border-primary/30"
                                  }`}>
                                    {currentGroup.amType === "match" ? "⚾ 試合" : "🏃 練習"}
                                  </span>
                                </div>
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1 text-xs font-black text-foreground">
                                    <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                                    <span>{currentGroup.amTime || currentGroup.time || "08:00〜12:00"}</span>
                                  </div>
                                  <div className="flex items-center gap-1 text-[11px] font-bold text-foreground/90 truncate">
                                    <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
                                    <span className="truncate">{currentGroup.amLocation || currentGroup.location || "グラウンド"}</span>
                                  </div>
                                </div>
                              </div>

                              {/* 午後 */}
                              <div className="p-2.5 rounded-2xl bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/20 flex flex-col justify-between space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-black text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
                                    <Moon className="w-3 h-3 text-indigo-500" />
                                    <span>午後</span>
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                    currentGroup.pmType === "match"
                                      ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                                      : "bg-primary/15 text-primary border border-primary/30"
                                  }`}>
                                    {currentGroup.pmType === "match" ? "⚾ 試合" : "🏃 練習"}
                                  </span>
                                </div>
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1 text-xs font-black text-foreground">
                                    <Clock className="w-3 h-3 text-indigo-500 shrink-0" />
                                    <span>{currentGroup.pmTime}</span>
                                  </div>
                                  <div className="flex items-center gap-1 text-[11px] font-bold text-foreground/90 truncate">
                                    <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
                                    <span className="truncate">{currentGroup.pmLocation || currentGroup.amLocation || "グラウンド"}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            /* 午前のみ/単一枠 */
                            <div className="p-3 rounded-2xl bg-muted/40 border border-border/80 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-black ${
                                  currentGroup.amType === "match" || currentGroup.eventType === "match"
                                    ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                                    : "bg-primary/15 text-primary border border-primary/30"
                                }`}>
                                  {currentGroup.amType === "match" || currentGroup.eventType === "match" ? "⚾ 試合" : "🏃 練習"}
                                </span>

                                {currentGroup.dutyGroup && (
                                  <span className="text-[10px] font-black text-primary px-2.5 py-0.5 rounded-lg bg-primary/10 border border-primary/20">
                                    📋 {currentGroup.dutyGroup}
                                  </span>
                                )}
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-bold">
                                <div className="flex items-center gap-1.5 text-foreground bg-card p-2 rounded-xl border border-border/60">
                                  <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                  <span>{currentGroup.amTime || currentGroup.time || "08:00〜12:00"}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-foreground bg-card p-2 rounded-xl border border-border/60">
                                  <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                  <span className="truncate">{currentGroup.amLocation || currentGroup.location || "グラウンド"}</span>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* グループ配車 */}
                          {currentGroup.carInfo && (
                            <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground px-2">
                              <Car className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              <span>配車: {currentGroup.carInfo}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : ev.hasPm && ev.pmType !== "off" && ev.pmTime ? (
                    /* ☀️🌙 午前/午後分割スケジュール（全体） */
                    <div className="grid grid-cols-2 gap-2">
                      {/* ☀️ 【午前】 */}
                      <div className="p-2.5 rounded-2xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 flex flex-col justify-between space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-amber-700 dark:text-amber-300 flex items-center gap-1">
                            <Sun className="w-3 h-3 text-amber-500" />
                            <span>午前</span>
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                            ev.amType === "match"
                              ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                              : "bg-primary/15 text-primary border border-primary/30"
                          }`}>
                            {ev.amType === "match" ? "⚾ 試合" : "🏃 練習"}
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1 text-xs font-black text-foreground">
                            <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                            <span>{ev.amTime || "08:00〜12:00"}</span>
                          </div>
                          <div className="flex items-center gap-1 text-[11px] font-bold text-foreground/90 truncate">
                            <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
                            <span className="truncate">{ev.amLocation || ev.location || "グラウンド"}</span>
                          </div>
                        </div>
                      </div>

                      {/* 🌙 【午後】 */}
                      <div className="p-2.5 rounded-2xl bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/20 flex flex-col justify-between space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
                            <Moon className="w-3 h-3 text-indigo-500" />
                            <span>午後</span>
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                            ev.pmType === "match"
                              ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                              : "bg-primary/15 text-primary border border-primary/30"
                          }`}>
                            {ev.pmType === "match" ? "⚾ 試合" : "🏃 練習"}
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1 text-xs font-black text-foreground">
                            <Clock className="w-3 h-3 text-indigo-500 shrink-0" />
                            <span>{ev.pmTime}</span>
                          </div>
                          <div className="flex items-center gap-1 text-[11px] font-bold text-foreground/90 truncate">
                            <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
                            <span className="truncate">{ev.pmLocation || ev.amLocation || "グラウンド"}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* 🏃 単一活動スケジュール（午前のみなど） */
                    <div className="p-3 rounded-2xl bg-muted/40 border border-border/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-black ${
                          ev.eventType === "match"
                            ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                            : ev.eventType === "camp"
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                            : "bg-primary/15 text-primary border border-primary/30"
                        }`}>
                          {ev.eventType === "match" ? "⚾ 試合" : ev.eventType === "camp" ? "🏕️ 合宿" : "🏃 練習"}
                        </span>

                        {ev.dutyGroup && ev.dutyGroup !== "なし" && (
                          <span className="text-[10px] font-black text-primary px-2.5 py-0.5 rounded-lg bg-primary/10 border border-primary/20">
                            📋 {ev.dutyGroup}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-bold">
                        <div className="flex items-center gap-1.5 text-foreground bg-card p-2 rounded-xl border border-border/60">
                          <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span>{ev.amTime || ev.time || "時間調整中"}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-foreground bg-card p-2 rounded-xl border border-border/60">
                          <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span className="truncate">{ev.amLocation || ev.location || "グラウンド"}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ④ 📋 詳細情報ブロック（お弁当、補食、連絡事項、配車） */}
                  <div className="p-3.5 rounded-2xl bg-muted/30 border border-border/70 space-y-2 text-xs font-bold">
                    {/* お弁当 & 補食 */}
                    <div className="grid grid-cols-2 gap-2">
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

                    {/* 連絡事項・持ち物 */}
                    {ev.memo && (
                      <div className="pt-2 border-t border-border/60 space-y-1">
                        <span className="text-[10px] font-black text-muted-foreground flex items-center gap-1">
                          <FileText className="w-3 h-3 text-primary" />
                          <span>連絡事項・持ち物</span>
                        </span>
                        <div className="text-xs font-bold p-2.5 rounded-xl border border-border/50 whitespace-pre-wrap leading-relaxed text-foreground bg-background/80">
                          {ev.memo}
                        </div>
                      </div>
                    )}

                    {/* 配車 */}
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
                  </div>

                  {/* ⑤ 出欠回答セクション (○, △, ×, ？ ＋ 参加グループ選択) */}
                  <div className="pt-2 border-t border-primary/15 space-y-3">
                    {/* 👦 1. 保護者の場合: お子様（選手）の出欠回答 */}
                    {userRole === "parent" && children.map((child) => {
                      const childStatus = getChildAttendance(ev.id, child.id);
                      const selectedChildGroup = getChildSelectedGroup(ev.id, child.id, activityGroups[0]?.id);

                      return (
                        <div key={child.id} className="p-2.5 rounded-2xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 space-y-2">
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
                              onClick={() => handleChildStatusChange(ev.id, child.id, "present", selectedChildGroup || activityGroups[0]?.id)}
                              className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer ${
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
                              onClick={() => handleChildStatusChange(ev.id, child.id, "late", selectedChildGroup || activityGroups[0]?.id)}
                              className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer ${
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
                              className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer ${
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
                              className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer ${
                                childStatus === "pending"
                                  ? "bg-slate-700 text-white dark:bg-slate-300 dark:text-slate-900 shadow-xs ring-2 ring-slate-500/50"
                                  : "bg-background/80 hover:bg-background text-muted-foreground border border-border/60"
                              }`}
                            >
                              <span className="text-sm leading-none">？</span>
                              <span className="text-[9px]">未定</span>
                            </button>
                          </div>

                          {/* 👥 参加時: 参加グループ選択チップ */}
                          {(childStatus === "present" || childStatus === "late") && hasActivityGroups && (
                            <div className="pt-1.5 border-t border-amber-500/20 space-y-1">
                              <span className="text-[10px] font-black text-muted-foreground flex items-center gap-1">
                                <Layers className="w-3 h-3 text-amber-500" />
                                <span>参加グループを選択:</span>
                              </span>
                              <div className="grid grid-cols-2 gap-1.5">
                                {activityGroups.map((grp) => {
                                  const isSel = (selectedChildGroup === grp.id) || (!selectedChildGroup && grp.id === activityGroups[0].id);
                                  return (
                                    <button
                                      key={grp.id}
                                      type="button"
                                      onClick={() => handleChildStatusChange(ev.id, child.id, childStatus, grp.id)}
                                      className={`py-1.5 px-2 rounded-xl text-[11px] font-black border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                                        isSel
                                          ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                                          : "bg-background text-muted-foreground border-border hover:bg-muted"
                                      }`}
                                    >
                                      {isSel && <Check className="w-3 h-3 shrink-0" />}
                                      <span className="truncate">{grp.name}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* 👨 2. 保護者本人（または選手本人）の出欠回答 */}
                    {(() => {
                      const pStatus = getEventAttendance(ev.id, ev.myStatus);
                      const selectedParentGroup = getParentSelectedGroup(ev.id, ev.mySelectedGroupId || activityGroups[0]?.id);

                      return (
                        <div className="space-y-2 p-2.5 rounded-2xl bg-muted/40 border border-border/80">
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
                              onClick={() => handleStatusChange(ev.id, "present", selectedParentGroup || activityGroups[0]?.id)}
                              className={`flex flex-col items-center justify-center py-2 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer ${
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
                              onClick={() => handleStatusChange(ev.id, "late", selectedParentGroup || activityGroups[0]?.id)}
                              className={`flex flex-col items-center justify-center py-2 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer ${
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
                              className={`flex flex-col items-center justify-center py-2 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer ${
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
                              className={`flex flex-col items-center justify-center py-2 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer ${
                                pStatus === "pending" || !pStatus
                                  ? "bg-slate-700 text-white dark:bg-slate-300 dark:text-slate-900 shadow-xs ring-2 ring-slate-500/50"
                                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
                              }`}
                            >
                              <span className="text-sm leading-none mb-0.5">？</span>
                              <span className="text-[10px]">未定</span>
                            </button>
                          </div>

                          {/* 👥 参加時: 参加グループ選択チップ */}
                          {(pStatus === "present" || pStatus === "late" || pStatus === "partial") && hasActivityGroups && (
                            <div className="pt-1.5 border-t border-border/60 space-y-1">
                              <span className="text-[10px] font-black text-muted-foreground flex items-center gap-1">
                                <Layers className="w-3 h-3 text-primary" />
                                <span>あなたの参加先グループ:</span>
                              </span>
                              <div className="grid grid-cols-2 gap-1.5">
                                {activityGroups.map((grp) => {
                                  const isSel = (selectedParentGroup === grp.id) || (!selectedParentGroup && grp.id === activityGroups[0].id);
                                  return (
                                    <button
                                      key={grp.id}
                                      type="button"
                                      onClick={() => handleStatusChange(ev.id, pStatus, grp.id)}
                                      className={`py-1.5 px-2 rounded-xl text-[11px] font-black border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                                        isSel
                                          ? "bg-primary text-primary-foreground border-primary shadow-2xs"
                                          : "bg-card text-muted-foreground border-border hover:bg-muted"
                                      }`}
                                    >
                                      {isSel && <Check className="w-3 h-3 shrink-0" />}
                                      <span className="truncate">{grp.name}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
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

      {/* 🌟 予定の個別詳細編集モーダル（午前午後は常に基本 ＆ グループ切り替えで午前午後を設定） */}
      {editingEvent && (() => {
        const hasGroups = Boolean(editingEvent.activityGroups && editingEvent.activityGroups.length > 0);
        const groups = editingEvent.activityGroups || [];

        // 現在編集中のグループまたはメインデータ
        const currentEditGroup = hasGroups
          ? (groups.find(g => g.id === activeEditGroupId) || groups[0])
          : null;

        const curAmType = currentEditGroup ? (currentEditGroup.amType || "practice") : (editingEvent.amType || editingEvent.eventType || "practice");
        const curAmTime = currentEditGroup ? (currentEditGroup.amTime || "08:00〜12:00") : (editingEvent.amTime || editingEvent.time || "08:00〜12:00");
        const curAmLocation = currentEditGroup ? (currentEditGroup.amLocation || "") : (editingEvent.amLocation || editingEvent.location || "");
        
        const curHasPm = currentEditGroup ? (currentEditGroup.hasPm !== undefined ? currentEditGroup.hasPm : (currentEditGroup.pmType !== "off")) : (editingEvent.hasPm !== undefined ? editingEvent.hasPm : true);
        const curPmType = currentEditGroup ? (currentEditGroup.pmType || "practice") : (editingEvent.pmType || "practice");
        const curPmTime = currentEditGroup ? (currentEditGroup.pmTime || "13:00〜17:00") : (editingEvent.pmTime || "13:00〜17:00");
        const curPmLocation = currentEditGroup ? (currentEditGroup.pmLocation || currentEditGroup.amLocation || "") : (editingEvent.pmLocation || editingEvent.amLocation || "");
        const curDutyGroup = currentEditGroup ? (currentEditGroup.dutyGroup || "1班") : (editingEvent.dutyGroup || "1班");
        const curCarInfo = currentEditGroup ? (currentEditGroup.carInfo || "") : (editingEvent.carInfo || "");

        // 編集ハンドラー（グループまたはメインを更新）
        const updateCurrentActivity = (updates: Partial<{
          amType: any;
          amTime: string;
          amLocation: string;
          hasPm: boolean;
          pmType: any;
          pmTime: string;
          pmLocation: string;
          dutyGroup: string;
          carInfo: string;
        }>) => {
          if (hasGroups && currentEditGroup) {
            const updatedGroups = groups.map(g => g.id === currentEditGroup.id ? { ...g, ...updates } : g);
            setEditingEvent({
              ...editingEvent,
              activityGroups: updatedGroups,
            });
          } else {
            setEditingEvent({
              ...editingEvent,
              ...updates,
            });
          }
        };

        return (
          <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150">
            <div
              className="bg-card w-full max-w-xl rounded-t-3xl sm:rounded-3xl border-2 border-primary/30 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in slide-in-from-bottom-4 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* モーダルヘッダー */}
              <div className="px-5 py-3.5 border-b border-border/80 flex items-center justify-between bg-muted/30 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-xl bg-primary text-primary-foreground text-xs font-black shrink-0">
                    {editingEvent.date}
                  </span>
                  <h3 className="text-sm font-black text-foreground">
                    予定の詳細編集
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingEvent(null)}
                  className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground active:scale-95 transition-all cursor-pointer"
                >
                  <span className="text-base font-black leading-none">✕</span>
                </button>
              </div>

              {/* モーダル本文 */}
              <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
                {/* 1. タイトル & 対象チーム */}
                <div className="space-y-3 p-3 rounded-2xl bg-card border border-border/80">
                  <div className="space-y-1">
                    <label className="text-[11px] font-black text-foreground">予定タイトル</label>
                    <input
                      type="text"
                      value={editingEvent.title}
                      onChange={(e) => setEditingEvent({ ...editingEvent, title: e.target.value })}
                      placeholder="予定タイトル（例: 秋季大会 2回戦 ＆ 午後練習）"
                      className="w-full px-3 py-2 rounded-xl bg-muted/30 border border-border/80 text-xs font-black text-foreground focus:outline-hidden focus:border-primary"
                    />
                  </div>

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
                            className={`px-2.5 py-1 rounded-xl text-xs font-bold border transition-all active:scale-95 cursor-pointer ${
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
                </div>

                {/* 🌟 2. グループ分けタブ ＆ グループ追加 */}
                <div className="space-y-2 p-3.5 rounded-2xl bg-muted/40 border border-border/80">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black text-foreground flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-primary" />
                      <span>活動グループ設定（班分け）</span>
                    </label>

                    {/* ＋ グループ追加ボタン */}
                    <button
                      type="button"
                      onClick={() => {
                        if (!hasGroups) {
                          // 単一から複数グループへ昇格
                          const grp1: ActivityGroup = {
                            id: `grp_${Date.now()}_1`,
                            name: "Aチーム（試合組）",
                            amType: editingEvent.amType || "match",
                            amTime: editingEvent.amTime || "08:00 集合",
                            amLocation: editingEvent.amLocation || "",
                            hasPm: editingEvent.hasPm !== undefined ? editingEvent.hasPm : true,
                            pmType: editingEvent.pmType || "practice",
                            pmTime: editingEvent.pmTime || "13:00〜17:00",
                            pmLocation: editingEvent.pmLocation || "",
                            dutyGroup: editingEvent.dutyGroup || "1班",
                            carInfo: editingEvent.carInfo || "",
                          };
                          const grp2: ActivityGroup = {
                            id: `grp_${Date.now()}_2`,
                            name: "Bチーム（練習組）",
                            amType: "practice",
                            amTime: "09:00 〜 12:00",
                            amLocation: "学校グラウンド",
                            hasPm: false,
                            pmType: "off",
                            pmTime: "13:00〜17:00",
                            pmLocation: "",
                            dutyGroup: "2班",
                            carInfo: "",
                          };
                          setEditingEvent({
                            ...editingEvent,
                            activityGroups: [grp1, grp2],
                          });
                          setActiveEditGroupId(grp1.id);
                        } else {
                          // 既存グループに追加
                          const newGrp: ActivityGroup = {
                            id: `grp_${Date.now()}_${groups.length + 1}`,
                            name: `グループ ${groups.length + 1}`,
                            amType: "practice",
                            amTime: "09:00 〜 12:00",
                            amLocation: "学校グラウンド",
                            hasPm: false,
                            pmType: "off",
                            pmTime: "13:00〜17:00",
                            pmLocation: "",
                            dutyGroup: "2班",
                            carInfo: "",
                          };
                          setEditingEvent({
                            ...editingEvent,
                            activityGroups: [...groups, newGrp],
                          });
                          setActiveEditGroupId(newGrp.id);
                        }
                      }}
                      className="py-1 px-2.5 rounded-xl bg-primary text-primary-foreground text-[10.5px] font-black shadow-xs active:scale-95 transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>＋ グループ追加</span>
                    </button>
                  </div>

                  {/* グループタブバー */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    {!hasGroups ? (
                      <div className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-black shadow-xs flex items-center gap-1 shrink-0">
                        <span>🏷️ 全体（単一活動）</span>
                      </div>
                    ) : (
                      groups.map((grp, idx) => {
                        const isSel = (currentEditGroup?.id === grp.id);
                        return (
                          <div
                            key={grp.id}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-black shrink-0 transition-all border ${
                              isSel
                                ? "bg-primary text-primary-foreground border-primary shadow-xs ring-1 ring-primary"
                                : "bg-card text-muted-foreground border-border hover:text-foreground"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setActiveEditGroupId(grp.id)}
                              className="flex items-center gap-1 cursor-pointer"
                            >
                              <span>{grp.amType === "match" ? "⚾" : "🏃"}</span>
                              <span>{grp.name}</span>
                            </button>

                            {/* グループ削除（2つ以上ある場合） */}
                            {groups.length > 1 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const nextGroups = groups.filter(g => g.id !== grp.id);
                                  setEditingEvent({
                                    ...editingEvent,
                                    activityGroups: nextGroups.length > 0 ? nextGroups : undefined,
                                  });
                                  if (nextGroups.length > 0) {
                                    setActiveEditGroupId(nextGroups[0].id);
                                  } else {
                                    setActiveEditGroupId("main");
                                  }
                                }}
                                className="ml-1 text-primary-foreground/70 hover:text-white dark:hover:text-rose-400 cursor-pointer"
                                title="グループ削除"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* 選択中グループの名前編集（複数グループ時） */}
                  {hasGroups && currentEditGroup && (
                    <div className="pt-2 border-t border-border/60 flex items-center gap-2">
                      <span className="text-[10px] font-bold text-muted-foreground shrink-0">グループ名:</span>
                      <input
                        type="text"
                        value={currentEditGroup.name}
                        onChange={(e) => {
                          const updated = groups.map(g => g.id === currentEditGroup.id ? { ...g, name: e.target.value } : g);
                          setEditingEvent({ ...editingEvent, activityGroups: updated });
                        }}
                        placeholder="グループ名（例: Aチーム試合組 / Bチーム練習組）"
                        className="font-black text-xs text-foreground bg-card border border-border/80 px-2.5 py-1 rounded-xl w-full focus:outline-hidden focus:border-primary"
                      />
                    </div>
                  )}
                </div>

                {/* 🌟 3. 常に「☀️ 午前」＆「🌙 午後」の設定エリア（選択中グループまたは全体に連動） */}
                <div className="space-y-3 p-3.5 rounded-2xl bg-card border border-border/80 shadow-xs">
                  {/* ☀️ 午前ブロック */}
                  <div className="p-3 rounded-2xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/25 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-amber-700 dark:text-amber-300 flex items-center gap-1">
                        <Sun className="w-3.5 h-3.5 text-amber-500" />
                        <span>午前の活動</span>
                      </span>

                      {/* 午前種別 */}
                      <div className="flex items-center gap-1">
                        {EVENT_TYPES.slice(0, 3).map((t) => {
                          const isSel = curAmType === t.id;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => updateCurrentActivity({ amType: t.id as any })}
                              className={`px-2 py-0.5 rounded-lg text-[10.5px] font-black border transition-all cursor-pointer ${
                                isSel ? t.color + " shadow-2xs" : "bg-card border-border/70 text-muted-foreground"
                              }`}
                            >
                              {t.icon} {t.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground block mb-0.5">午前の時間帯</label>
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-card border border-border/70">
                          <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                          <input
                            type="text"
                            value={curAmTime}
                            onChange={(e) => updateCurrentActivity({ amTime: e.target.value })}
                            placeholder="08:00〜12:00 または 08:00集合"
                            className="bg-transparent text-xs font-bold text-foreground focus:outline-hidden w-full"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground block mb-0.5">午前の球場・場所</label>
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-card border border-border/70">
                          <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
                          <input
                            type="text"
                            value={curAmLocation}
                            onChange={(e) => updateCurrentActivity({ amLocation: e.target.value })}
                            placeholder="市民第1球場 または 選択"
                            className="bg-transparent text-xs font-bold text-foreground focus:outline-hidden w-full"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 球場クイック選択候補 */}
                    {venuesList.length > 0 && (
                      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pt-0.5">
                        <span className="text-[9px] font-bold text-muted-foreground shrink-0">候補:</span>
                        {venuesList.slice(0, 6).map((v) => {
                          const displayName = getVenueDisplayName(v);
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => updateCurrentActivity({ amLocation: displayName })}
                              className="px-1.5 py-0.5 rounded-md text-[9.5px] font-bold bg-card border border-border/60 text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
                            >
                              🏟️ {displayName}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 🌙 午後ブロック */}
                  <div className={`p-3 rounded-2xl border space-y-2.5 transition-all ${
                    curHasPm && curPmType !== "off"
                      ? "bg-indigo-500/5 dark:bg-indigo-500/10 border-indigo-500/25"
                      : "bg-muted/20 border-border/60 opacity-80"
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
                          <Moon className="w-3.5 h-3.5 text-indigo-500" />
                          <span>午後の活動</span>
                        </span>

                        {/* 午後の活動 ON/OFF 切替スイッチ */}
                        <button
                          type="button"
                          onClick={() => {
                            const nextHasPm = !curHasPm || curPmType === "off";
                            updateCurrentActivity({
                              hasPm: nextHasPm,
                              pmType: nextHasPm ? (curPmType === "off" ? "practice" : curPmType || "practice") : "off",
                              pmTime: nextHasPm ? (curPmTime || "13:00〜17:00") : "",
                              pmLocation: nextHasPm ? (curPmLocation || curAmLocation || "") : "",
                            });
                          }}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black border transition-all cursor-pointer ${
                            curHasPm && curPmType !== "off"
                              ? "bg-indigo-500 text-white border-indigo-500"
                              : "bg-muted text-muted-foreground border-border"
                          }`}
                        >
                          {curHasPm && curPmType !== "off" ? "✓ 午後あり" : "🏖️ なし (午前解散)"}
                        </button>
                      </div>

                      {/* 午後種別 */}
                      {curHasPm && curPmType !== "off" && (
                        <div className="flex items-center gap-1">
                          {EVENT_TYPES.slice(0, 3).map((t) => {
                            const isSel = curPmType === t.id;
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => updateCurrentActivity({ pmType: t.id as any })}
                                className={`px-2 py-0.5 rounded-lg text-[10.5px] font-black border transition-all cursor-pointer ${
                                  isSel ? t.color + " shadow-2xs" : "bg-card border-border/70 text-muted-foreground"
                                }`}
                              >
                                {t.icon} {t.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {curHasPm && curPmType !== "off" ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-bold text-muted-foreground block mb-0.5">午後の時間帯</label>
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-card border border-border/70">
                              <Clock className="w-3 h-3 text-indigo-500 shrink-0" />
                              <input
                                type="text"
                                value={curPmTime}
                                onChange={(e) => updateCurrentActivity({ pmTime: e.target.value })}
                                placeholder="13:00〜17:00"
                                className="bg-transparent text-xs font-bold text-foreground focus:outline-hidden w-full"
                              />
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-0.5">
                              <label className="text-[10px] font-bold text-muted-foreground block">午後の球場・場所</label>
                              {curAmLocation && curPmLocation !== curAmLocation && (
                                <button
                                  type="button"
                                  onClick={() => updateCurrentActivity({ pmLocation: curAmLocation })}
                                  className="text-[9.5px] font-bold text-primary hover:underline cursor-pointer"
                                >
                                  午前と同じ場所
                                </button>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-card border border-border/70">
                              <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
                              <input
                                type="text"
                                value={curPmLocation}
                                onChange={(e) => updateCurrentActivity({ pmLocation: e.target.value })}
                                placeholder="午後の球場・グラウンド"
                                className="bg-transparent text-xs font-bold text-foreground focus:outline-hidden w-full"
                              />
                            </div>
                          </div>
                        </div>

                        {/* 球場クイック選択候補 */}
                        {venuesList.length > 0 && (
                          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pt-0.5">
                            <span className="text-[9px] font-bold text-muted-foreground shrink-0">候補:</span>
                            {venuesList.slice(0, 6).map((v) => {
                              const displayName = getVenueDisplayName(v);
                              return (
                                <button
                                  key={v.id}
                                  type="button"
                                  onClick={() => updateCurrentActivity({ pmLocation: displayName })}
                                  className="px-1.5 py-0.5 rounded-md text-[9.5px] font-bold bg-card border border-border/60 text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
                                >
                                  🏟️ {displayName}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] font-bold text-muted-foreground py-1">
                        午後は予定なし（午前中のみで活動終了・解散）
                      </p>
                    )}
                  </div>

                  {/* グループ固有の当番・配車（複数グループ時） */}
                  {hasGroups && currentEditGroup && (
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/60">
                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground block mb-0.5">このグループのお当番</label>
                        <input
                          type="text"
                          value={curDutyGroup}
                          onChange={(e) => updateCurrentActivity({ dutyGroup: e.target.value })}
                          placeholder="例: 1班"
                          className="w-full px-2.5 py-1.5 rounded-xl bg-muted/40 border border-border/70 text-xs font-bold text-foreground focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground block mb-0.5">このグループの配車</label>
                        <input
                          type="text"
                          value={curCarInfo}
                          onChange={(e) => updateCurrentActivity({ carInfo: e.target.value })}
                          placeholder="例: 3台/現地集合"
                          className="w-full px-2.5 py-1.5 rounded-xl bg-muted/40 border border-border/70 text-xs font-bold text-foreground focus:outline-hidden"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 📋 4. 全体共通情報（当番・お弁当・補食・連絡事項） */}
                <div className="space-y-3 p-3.5 rounded-2xl bg-card border border-border/80">
                  {/* お当番（グループ分けなし時） */}
                  {!hasGroups && (
                    <div>
                      <label className="text-[10px] font-bold text-muted-foreground block mb-1">お当番班</label>
                      <div className="grid grid-cols-5 gap-1">
                        {DUTY_GROUPS.map((dg) => (
                          <button
                            key={dg}
                            type="button"
                            onClick={() => setEditingEvent({ ...editingEvent, dutyGroup: dg })}
                            className={`py-1 text-center rounded-lg text-[11px] font-bold border transition-all active:scale-95 cursor-pointer ${
                              editingEvent.dutyGroup === dg
                                ? "bg-primary text-primary-foreground border-primary font-black shadow-xs"
                                : "bg-muted/40 border-border/70 text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {dg}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* お弁当 & 補食 */}
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    {/* お弁当 */}
                    <div>
                      <label className="text-[10px] font-bold text-muted-foreground block mb-1">お弁当</label>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingEvent({ ...editingEvent, needsLunch: true })}
                          className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                            editingEvent.needsLunch === true
                              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40 font-black"
                              : "bg-muted/30 border-border/70 text-muted-foreground"
                          }`}
                        >
                          <Utensils className="w-3 h-3" />
                          <span>持参要</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingEvent({ ...editingEvent, needsLunch: false })}
                          className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                            editingEvent.needsLunch !== true
                              ? "bg-primary/15 text-primary border-primary/40 font-black"
                              : "bg-muted/30 border-border/70 text-muted-foreground"
                          }`}
                        >
                          <span>不要</span>
                        </button>
                      </div>
                    </div>

                    {/* 補食 */}
                    <div>
                      <label className="text-[10px] font-bold text-muted-foreground block mb-1">補食（捕食）</label>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingEvent({ ...editingEvent, needsSnack: true })}
                          className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                            editingEvent.needsSnack === true
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 font-black"
                              : "bg-muted/30 border-border/70 text-muted-foreground"
                          }`}
                        >
                          <span className="text-xs leading-none">🍌</span>
                          <span>持参要</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingEvent({ ...editingEvent, needsSnack: false })}
                          className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                            editingEvent.needsSnack !== true
                              ? "bg-primary/15 text-primary border-primary/40 font-black"
                              : "bg-muted/30 border-border/70 text-muted-foreground"
                          }`}
                        >
                          <span>不要</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 連絡事項 */}
                  <div className="space-y-1 pt-2 border-t border-border/60">
                    <label className="text-[10.5px] font-black text-foreground">連絡事項・持ち物</label>
                    <textarea
                      rows={2}
                      value={editingEvent.memo || ""}
                      onChange={(e) => setEditingEvent({ ...editingEvent, memo: e.target.value })}
                      placeholder="ユニフォーム正装、スパイク持参、雨天時は7:00連絡など"
                      className="w-full px-3 py-2 rounded-xl bg-muted/30 border border-border/80 text-xs font-bold text-foreground focus:outline-hidden focus:border-primary resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* モーダルフッター */}
              <div className="px-5 py-3.5 pb-8 sm:pb-3.5 border-t border-border/80 flex items-center justify-between bg-muted/20 shrink-0 gap-3">
                <button
                  type="button"
                  onClick={() => setEditingEvent(null)}
                  className="py-2.5 px-4 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all cursor-pointer"
                >
                  キャンセル
                </button>

                <button
                  type="button"
                  onClick={handleSaveEventEdit}
                  disabled={isSavingEdit}
                  className="py-2.5 px-6 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-black shadow-md transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSavingEdit ? "保存中..." : "予定を更新する"}</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
