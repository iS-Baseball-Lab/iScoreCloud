// filepath: src/app/liff/schedule/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { useLiff, usePracticeMatchLabel } from "@/components/liff/LiffProvider";
import { peekLiffApiCache } from "@/lib/liff/api-cache";
import { cn } from "@/lib/utils";
import { MonthlySchedulePlanner } from "@/components/schedule/MonthlySchedulePlanner";
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
  ChevronDown,
  ChevronUp,
  Sparkles,
  Layers,
  Check,
  Flame,
  Plus,
  ArrowRightLeft,
  Settings2,
  X,
  RotateCcw,
  Eye,
  EyeOff,
} from "lucide-react";

const TARGET_GROUPS = ["全体", "Aチーム", "Bチーム", "高学年", "低学年", "試合組", "練習組"];
const DUTY_GROUPS = ["1班", "2班", "3班", "4班", "なし"];
const EVENT_TYPES = [
  { id: "practice", label: "練習", icon: "🏃", color: "border-teal-500/35 bg-teal-500/12 text-teal-700 dark:text-teal-300" },
  { id: "match", label: "試合", icon: "⚾", color: "border-primary/35 bg-primary/12 text-primary" },
  { id: "camp", label: "合宿", icon: "🏕️", color: "border-amber-500/35 bg-amber-500/12 text-amber-700 dark:text-amber-300" },
  { id: "meeting", label: "ミーティング", icon: "📋", color: "border-indigo-500/35 bg-indigo-500/12 text-indigo-700 dark:text-indigo-300" },
];

export interface ActivityGroup {
  id: string;
  name: string;
  targetGroup?: string;
  hasAm?: boolean;
  amType?: "match" | "practice" | "meeting" | "camp" | "off";
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
  hasAm?: boolean;
  amTime?: string;
  amLocation?: string;
  pmTime?: string;
  pmLocation?: string;
  hasPm?: boolean;
  eventType: "match" | "practice" | "meeting" | "camp";
  amType?: "match" | "practice" | "meeting" | "camp" | "off";
  pmType?: "match" | "practice" | "meeting" | "camp" | "off";
  targetGroup?: string;
  dutyGroup?: string;
  needsLunch?: boolean;
  needsSnack?: boolean;
  memo?: string;
  carInfo?: string;
  activityGroups?: ActivityGroup[];
  groupCounts?: Record<string, number>;
  myStatus: AttendanceMarkType | string;
  mySelectedGroupId?: string | null;
  attendCount: {
    present: number;
    absent: number;
    pending: number;
    duty?: number;
    help?: number;
    setup?: number;
    game?: number;
  };
}

export type AttendanceMarkType = "duty" | "help" | "setup" | "game" | "absent" | "pending" | "present" | "late" | "partial";

const ATTENDANCE_BUTTONS: Array<{
  id: "duty" | "help" | "setup" | "game" | "absent" | "pending";
  mark: string;
  label: string;
  activeClass: string;
}> = [
  { id: "duty", mark: "◎", label: "当番", activeClass: "bg-red-500 text-white shadow-xs" },
  { id: "help", mark: "○", label: "ヘルプ", activeClass: "bg-blue-600 text-white shadow-xs" },
  { id: "setup", mark: "▲", label: "設営撤収", activeClass: "bg-amber-500 text-white shadow-xs" },
  { id: "game", mark: "△", label: "試合のみ", activeClass: "bg-emerald-600 text-white shadow-xs" },
  { id: "absent", mark: "×", label: "欠席", activeClass: "bg-slate-600 dark:bg-slate-500 text-white shadow-xs" },
  { id: "pending", mark: "？", label: "未定", activeClass: "bg-muted text-foreground shadow-xs" },
];

const getAttendanceBadgeInfo = (st: string | undefined) => {
  switch (st) {
    case "duty":
      return {
        mark: "◎",
        label: "当番",
        badgeClass: "bg-red-500 text-white font-black shadow-xs",
        bgLight: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300 border-red-200 dark:border-red-900/50",
      };
    case "help":
      return {
        mark: "○",
        label: "ヘルプ",
        badgeClass: "bg-blue-600 text-white font-black shadow-xs",
        bgLight: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 dark:border-blue-900/50",
      };
    case "present":
      return {
        mark: "○",
        label: "出席",
        badgeClass: "bg-emerald-600 text-white font-black shadow-xs",
        bgLight: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50",
      };
    case "setup":
      return {
        mark: "▲",
        label: "設営撤収",
        badgeClass: "bg-amber-500 text-white font-black shadow-xs",
        bgLight: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-900/50",
      };
    case "game":
      return {
        mark: "△",
        label: "試合のみ",
        badgeClass: "bg-emerald-600 text-white font-black shadow-xs",
        bgLight: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/50",
      };
    case "late":
    case "partial":
      return {
        mark: "△",
        label: "調整",
        badgeClass: "bg-amber-500 text-white font-black shadow-xs",
        bgLight: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800/50",
      };
    case "absent":
      return {
        mark: "×",
        label: "欠席",
        badgeClass: "bg-slate-600 dark:bg-slate-500 text-white font-black shadow-xs",
        bgLight: "bg-slate-500/12 text-slate-700 dark:text-slate-300 border-slate-500/25",
      };
    default:
      return {
        mark: "？",
        label: "未定",
        badgeClass: "bg-muted text-muted-foreground",
        bgLight: "bg-muted text-muted-foreground border-border",
      };
  }
};

export default function LiffSchedulePage() {
  const { currentTeam, profile } = useLiff();
  const practiceMatchLabel = usePracticeMatchLabel();
  const [mounted, setMounted] = useState(false);
  const [filter, setFilter] = useState<"all" | "match" | "practice">("all");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [showPastDates, setShowPastDates] = useState<boolean>(false);
  const initialCachedSchedule = useMemo(() => {
    if (typeof window === "undefined") return null;
    const tid =
      currentTeam?.id ||
      localStorage.getItem("iscore_selectedTeamId") ||
      "demo-team";
    const rawUid =
      profile?.userId ||
      localStorage.getItem("iscore_user_id") ||
      localStorage.getItem("iscore_userId") ||
      "";
    const uid = rawUid === "cached-user" ? "" : rawUid;
    const uName = profile?.displayName || localStorage.getItem("iscore_user_name") || "";
    const cachedMid = localStorage.getItem(`iscore_member_id_${tid}`) || "";
    const schedParams = new URLSearchParams({
      teamId: tid,
      userId: uid,
      userName: uName,
    });
    if (cachedMid) schedParams.set("memberId", cachedMid);
    const hit = peekLiffApiCache<{ success: boolean; events?: ScheduleEvent[] }>(
      `/api/liff/schedule?${schedParams.toString()}`
    );
    if (!hit?.events) return null;
    return hit.events.map((ev) => {
      const isAmOff = ev.hasAm === false || ev.amType === "off";
      return {
        ...ev,
        hasAm: !isAmOff,
        amType: isAmOff ? ("off" as const) : (ev.amType || ev.eventType || "practice"),
        needsLunch:
          ev.needsLunch === true ||
          (ev.needsLunch as unknown) === 1 ||
          (ev.needsLunch as unknown) === "1" ||
          (ev.needsLunch as unknown) === "true",
        needsSnack:
          ev.needsSnack === true ||
          (ev.needsSnack as unknown) === 1 ||
          (ev.needsSnack as unknown) === "1" ||
          (ev.needsSnack as unknown) === "true",
      };
    });
  }, [currentTeam?.id, profile?.userId, profile?.displayName]);

  const [events, setEvents] = useState<ScheduleEvent[]>(
    () => initialCachedSchedule ?? []
  );

  // 本日の日付文字列 (YYYY-MM-DD)
  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }, []);
  const [isLoading, setIsLoading] = useState<boolean>(
    () => initialCachedSchedule === null
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  // 🔀 タブ切り替え（予定一覧 / スケジューラー）
  const [activeTab, setActiveTab] = useState<"list" | "planner">("list");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tab") === "planner") {
        setActiveTab("planner");
      }
    }
  }, []);

  const handleTabChange = (tab: "list" | "planner") => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (tab === "planner") {
        url.searchParams.set("tab", "planner");
      } else {
        url.searchParams.delete("tab");
      }
      window.history.replaceState({}, "", url.toString());
    }
  };

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
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceMarkType | string>>({});
  const [parentGroupMap, setParentGroupMap] = useState<Record<string, string>>({});
  const [childAttendanceMap, setChildAttendanceMap] = useState<Record<string, Record<string, AttendanceMarkType | string>>>({});
  const [childGroupMap, setChildGroupMap] = useState<Record<string, Record<string, string>>>({});

  // 📝 連絡事項のアコーディオン展開ステート (eventId -> boolean)
  const [expandedMemos, setExpandedMemos] = useState<Record<string, boolean>>({});
  const toggleMemo = (eventId: string) => {
    setExpandedMemos(prev => ({
      ...prev,
      [eventId]: !prev[eventId]
    }));
  };

  // 📋 出欠欄の開閉ステート (デフォルト開いた状態にするため、閉じられたeventIdを記録)
  const [collapsedAttendance, setCollapsedAttendance] = useState<Record<string, boolean>>({});
  const toggleAttendance = (eventId: string) => {
    setCollapsedAttendance(prev => ({
      ...prev,
      [eventId]: !prev[eventId]
    }));
  };

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
      const rawUid = profile?.userId || (typeof window !== "undefined" ? (localStorage.getItem("iscore_user_id") || localStorage.getItem("iscore_userId") || "") : "");
      const uid = rawUid === "cached-user" ? "" : rawUid;
      const uName = profile?.displayName || (typeof window !== "undefined" ? (localStorage.getItem("iscore_user_name") || "") : "");

      if (tid !== "demo-team" && !currentTeam?.isDemo) {
        setChildren([]);
      }

      const res = await fetch(`/api/liff/my-family?teamId=${tid}&userId=${encodeURIComponent(uid)}&userName=${encodeURIComponent(uName)}`);
      if (res.ok) {
        const json = (await res.json()) as {
          success: boolean;
          memberId?: string | null;
          children?: Array<{ id: string; name: string; uniformNumber?: string; parentName?: string }>;
          attendances?: Record<string, Record<string, AttendanceMarkType | string>>;
          childGroupMap?: Record<string, Record<string, string>>;
          parentAttendances?: Record<string, AttendanceMarkType | string>;
          parentGroupMap?: Record<string, string>;
        };
        if (json.success) {
          if (json.memberId) {
            setMemberId(json.memberId);
            if (typeof window !== "undefined" && tid !== "demo-team" && !currentTeam?.isDemo) {
              localStorage.setItem(`iscore_member_id_${tid}`, json.memberId);
            }
          }

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
          const parentAtts = json.parentAttendances;
          if (parentAtts && Object.keys(parentAtts).length > 0) {
            setAttendanceMap(prev => ({ ...parentAtts, ...prev }));
            setEvents(prev => prev.map(ev => ({
              ...ev,
              myStatus: parentAtts[ev.id] || ev.myStatus
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

  const VALID_ATTENDANCE_STATUSES = ["duty", "help", "setup", "game", "present", "late", "partial", "absent"];

  const getChildAttendance = (eventId: string, childId: string) => {
    if (childAttendanceMap[eventId]?.[childId] && childAttendanceMap[eventId][childId] !== "pending") {
      return childAttendanceMap[eventId][childId];
    }
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem(`iscore_child_att_${eventId}_${childId}`);
      if (cached && VALID_ATTENDANCE_STATUSES.includes(cached)) {
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
      if (cached && VALID_ATTENDANCE_STATUSES.includes(cached)) {
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
    status: AttendanceMarkType | string,
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
      const isAttending = status !== "absent" && status !== "pending";
      await fetch("/api/liff/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          playerId: childId,
          status,
          selectedGroupId: isAttending ? (selectedGroupId || childGroupMap[eventId]?.[childId]) : null,
        }),
      });
    } catch (err) {
      console.error("Failed to save child attendance:", err);
    }
  };

  // 保護者本人の出欠変更ハンドラー（グループ選択対応）
  const handleStatusChange = async (
    eventId: string,
    status: AttendanceMarkType | string,
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
      const isAttending = status !== "absent" && status !== "pending";
      await fetch("/api/liff/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          userId: uid,
          memberId: memberId || undefined,
          status,
          selectedGroupId: isAttending ? (selectedGroupId || parentGroupMap[eventId]) : null,
        }),
      });
    } catch (err) {
      console.error("Failed to save attendance:", err);
    }
  };

  const loadSchedule = useCallback(async () => {
    try {
      const teamId = currentTeam?.id || (typeof window !== "undefined" ? localStorage.getItem("iscore_selectedTeamId") || "demo-team" : "demo-team");
      const rawUserId = profile?.userId || (typeof window !== "undefined" ? (localStorage.getItem("iscore_user_id") || localStorage.getItem("iscore_userId") || "") : "");
      const userId = rawUserId === "cached-user" ? "" : rawUserId;
      const uName = profile?.displayName || (typeof window !== "undefined" ? (localStorage.getItem("iscore_user_name") || "") : "");
      const cachedMid = typeof window !== "undefined" ? (localStorage.getItem(`iscore_member_id_${teamId}`) || "") : "";
      const schedParams = new URLSearchParams({
        teamId,
        userId,
        userName: uName,
      });
      if (cachedMid) schedParams.set("memberId", cachedMid);
      const url = `/api/liff/schedule?${schedParams.toString()}`;
      const syncCached = peekLiffApiCache<{ success: boolean; events?: ScheduleEvent[] }>(url);
      if (syncCached?.events) {
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json() as { success: boolean; events?: ScheduleEvent[] };
        if (data.events) {
          const normalizedEvents = data.events.map(ev => {
            const isAmOff = ev.hasAm === false || ev.amType === "off";
            return {
              ...ev,
              hasAm: !isAmOff,
              amType: isAmOff ? ("off" as const) : (ev.amType || ev.eventType || "practice"),
              needsLunch: ev.needsLunch === true || (ev.needsLunch as any) === 1 || (ev.needsLunch as any) === "1" || (ev.needsLunch as any) === "true",
              needsSnack: ev.needsSnack === true || (ev.needsSnack as any) === 1 || (ev.needsSnack as any) === "1" || (ev.needsSnack as any) === "true",
            };
          });

          const map: Record<string, AttendanceMarkType | string> = {};
          const pGrpMap: Record<string, string> = {};
          for (const ev of normalizedEvents) {
            if (ev.id && ev.myStatus && ev.myStatus !== "pending") {
              map[ev.id] = ev.myStatus;
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
      finalEvent.title = (editingEvent.title && editingEvent.title.trim()) || "通常練習";

      // グループがある場合の親データ同期（2グループ以上で複数グループとして同期・保存）
      if (finalEvent.activityGroups && finalEvent.activityGroups.length > 1) {
        const firstGrp = finalEvent.activityGroups[0];
        if (firstGrp.targetGroup) {
          finalEvent.targetGroup = firstGrp.targetGroup;
        }
        finalEvent.hasAm = firstGrp.hasAm !== false && firstGrp.amType !== "off";
        finalEvent.amType = firstGrp.amType || "practice";
        finalEvent.amTime = firstGrp.amTime || "08:00〜12:00";
        finalEvent.amLocation = firstGrp.amLocation || "";

        finalEvent.hasPm = Boolean(firstGrp.hasPm && firstGrp.pmType !== "off");
        finalEvent.pmType = firstGrp.pmType || "practice";
        finalEvent.pmTime = firstGrp.pmTime || "13:00〜17:00";
        finalEvent.pmLocation = firstGrp.pmLocation || firstGrp.amLocation || "";

        const resolvedType = finalEvent.hasAm 
          ? (firstGrp.amType && firstGrp.amType !== "off" ? firstGrp.amType : "practice")
          : (firstGrp.pmType && firstGrp.pmType !== "off" ? firstGrp.pmType : "practice");
        finalEvent.eventType = resolvedType;
        finalEvent.location = finalEvent.hasAm ? (firstGrp.amLocation || "") : (firstGrp.pmLocation || "");

        if (finalEvent.hasAm && finalEvent.hasPm) {
          finalEvent.time = `${finalEvent.amTime} / ${finalEvent.pmTime}`;
        } else if (finalEvent.hasAm) {
          finalEvent.time = finalEvent.amTime || "08:00〜12:00";
        } else if (finalEvent.hasPm) {
          finalEvent.time = finalEvent.pmTime || "13:00〜17:00";
        } else {
          finalEvent.time = "時間調整中";
        }
      } else {
        // 単一グループの場合（1グループだけ残っている場合はその値を親に復元・反映）
        if (finalEvent.activityGroups && finalEvent.activityGroups.length === 1) {
          const singleGrp = finalEvent.activityGroups[0];
          if (singleGrp.targetGroup) finalEvent.targetGroup = singleGrp.targetGroup;
          finalEvent.hasAm = singleGrp.hasAm !== false && singleGrp.amType !== "off";
          finalEvent.amType = singleGrp.amType || "practice";
          finalEvent.amTime = singleGrp.amTime || "08:00〜12:00";
          finalEvent.amLocation = singleGrp.amLocation || "";
          finalEvent.hasPm = Boolean(singleGrp.hasPm && singleGrp.pmType !== "off");
          finalEvent.pmType = singleGrp.pmType || "practice";
          finalEvent.pmTime = singleGrp.pmTime || "13:00〜17:00";
          finalEvent.pmLocation = singleGrp.pmLocation || "";
          finalEvent.dutyGroup = singleGrp.dutyGroup || "1班";
          finalEvent.carInfo = singleGrp.carInfo || "";
        }
        finalEvent.activityGroups = undefined;

        const isAmActive = editingEvent.hasAm !== false && editingEvent.amType !== "off";
        const isPmActive = editingEvent.hasPm && editingEvent.pmType !== "off";

        finalEvent.hasAm = isAmActive;
        finalEvent.hasPm = isPmActive;
        const resolvedSingleType = isAmActive 
          ? (editingEvent.amType && editingEvent.amType !== "off" ? editingEvent.amType : "practice")
          : (editingEvent.pmType && editingEvent.pmType !== "off" ? editingEvent.pmType : "practice");
        finalEvent.eventType = resolvedSingleType;
        finalEvent.location = isAmActive ? (editingEvent.amLocation || editingEvent.location || "") : (editingEvent.pmLocation || "");

        if (isAmActive && isPmActive) {
          finalEvent.time = `${editingEvent.amTime || "08:00〜12:00"} / ${editingEvent.pmTime || "13:00〜17:00"}`;
        } else if (isAmActive) {
          finalEvent.time = editingEvent.amTime || "08:00〜12:00";
        } else if (isPmActive) {
          finalEvent.time = editingEvent.pmTime || "13:00〜17:00";
        } else {
          finalEvent.time = "時間調整中";
        }
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
          amType: finalEvent.hasAm ? finalEvent.amType : "off",
          amTime: finalEvent.hasAm ? finalEvent.amTime : null,
          amLocation: finalEvent.hasAm ? finalEvent.amLocation : null,
          pmType: finalEvent.hasPm ? finalEvent.pmType : "off",
          pmTime: finalEvent.hasPm ? finalEvent.pmTime : null,
          pmLocation: finalEvent.hasPm ? finalEvent.pmLocation : null,
          activityGroups: finalEvent.activityGroups && finalEvent.activityGroups.length > 1 ? JSON.stringify(finalEvent.activityGroups) : null,
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
    let list = eventsInCurrentMonth.filter((ev) => {
      if (selectedDateStr && ev.dateStr !== selectedDateStr) return false;
      if (filter === "all") return true;
      if (filter === "match") return ev.eventType === "match" || ev.amType === "match" || ev.pmType === "match" || ev.activityGroups?.some(g => g.eventType === "match");
      if (filter === "practice") return ev.eventType === "practice" || ev.amType === "practice" || ev.pmType === "practice" || ev.activityGroups?.some(g => g.eventType === "practice");
      return true;
    });

    // 🌟 過去日フィルター (出欠一覧表と同様の挙動)
    // showPastDates が false の場合:
    // カレンダーで過去の月を選択している場合、または特定の日付を選択している場合を除き、
    // 本日以降の予定（ev.dateStr >= todayStr）のみに絞り込む
    if (!showPastDates && !selectedDateStr) {
      const isPastMonth = currentMonthPrefix < todayStr.slice(0, 7);
      if (!isPastMonth) {
        list = list.filter((ev) => !ev.dateStr || ev.dateStr >= todayStr);
      }
    }

    // 昇順（直近・古い日付から順に）または降順でソート
    return list.sort((a, b) => {
      const keyA = a.dateStr || a.date || "";
      const keyB = b.dateStr || b.date || "";
      return sortOrder === "asc" ? keyA.localeCompare(keyB) : keyB.localeCompare(keyA);
    });
  }, [eventsInCurrentMonth, filter, selectedDateStr, sortOrder, showPastDates, currentMonthPrefix, todayStr]);

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="p-4 space-y-4">
        {/* ページ内ヘッダー */}
        <LiffPageHeader
          title="活動予定"
          subtitle="活動日程・球場・集合時間・お当番"
          icon={
            <span className="w-8 h-8 rounded-xl bg-teal-500/12 text-teal-600 dark:text-teal-400 flex items-center justify-center font-black">
              <CalendarIcon className="w-4 h-4" />
            </span>
          }
          showBack
          shareData={{
            title: `【活動予定】${currentTeam?.name || "チーム"} 活動スケジュール`,
            text: `今月の活動予定・球場・集合時間・お当番はこちらから確認できます`,
          }}
        />

        {/* 🔀 タブ切り替え（予定一覧 / スケジューラー） */}
        <div className="flex bg-muted p-1 rounded-2xl border border-border gap-1">
          <button
            type="button"
            onClick={() => handleTabChange("list")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs transition-all cursor-pointer",
              activeTab === "list"
                ? "bg-card text-foreground shadow-sm border border-border font-black"
                : "text-muted-foreground hover:text-foreground font-bold border border-transparent active:scale-95"
            )}
          >
            <CalendarIcon className={cn("w-3.5 h-3.5", activeTab === "list" ? "text-primary" : "text-muted-foreground")} />
            <span>予定一覧・カレンダー</span>
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("planner")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs transition-all cursor-pointer",
              activeTab === "planner"
                ? "bg-card text-foreground shadow-sm border border-border font-black"
                : "text-muted-foreground hover:text-foreground font-bold border border-transparent active:scale-95"
            )}
          >
            <Sparkles className={cn("w-3.5 h-3.5", activeTab === "planner" ? "text-primary" : "text-muted-foreground")} />
            <span>予定スケジューラー</span>
          </button>
        </div>

        {activeTab === "planner" ? (
          <MonthlySchedulePlanner
            teamId={currentTeam?.id || "team_1"}
            teamName={currentTeam?.name || "チーム"}
            isLiff={true}
            onSaved={() => {
              loadSchedule();
            }}
          />
        ) : (
          <>
            {/* 📅 月間ミニカレンダー (A-3 上帯ダークキャップ × 純白グリッド) */}
        <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="px-3.5 py-2 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs sm:text-sm font-black text-white tabular-nums">
                {currentYear}年 {currentMonth + 1}月
              </span>
              {selectedDateStr && (
                <button
                  type="button"
                  onClick={() => setSelectedDateStr(null)}
                  className="px-2 py-0.5 text-[10px] font-black rounded bg-primary text-primary-foreground active:scale-95 cursor-pointer"
                >
                  絞込解除
                </button>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={handleToday}
                className="px-2 py-0.5 text-[10.5px] font-black rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 transition-all active:scale-95 cursor-pointer"
              >
                今日
              </button>
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="p-2.5 sm:p-3 space-y-1.5">
          {/* 曜日ヘッダー */}
          <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-black pb-0.5">
            {weekDays.map((w, idx) => (
              <span
                key={w}
                className={idx === 0 ? "text-red-500" : idx === 6 ? "text-blue-500" : "text-muted-foreground"}
              >
                {w}
              </span>
            ))}
          </div>

          {/* 日付グリッド */}
          <div className="grid grid-cols-7 gap-0.5">
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
                  className={`flex flex-col items-center justify-center py-1 px-0.5 rounded-lg min-h-[30px] sm:min-h-[32px] transition-all relative cursor-pointer ${
                    isSelected
                      ? "bg-primary text-primary-foreground font-black shadow-xs"
                      : isToday
                      ? "bg-primary/10 border border-primary/40 font-black text-foreground"
                      : d.isCurrentMonth
                      ? "hover:bg-muted/60 text-foreground font-bold"
                      : "text-muted-foreground/35 font-normal"
                  }`}
                >
                  <span
                    className={`text-[11px] leading-tight ${
                      isSelected
                        ? "text-primary-foreground font-black"
                        : isSun
                        ? "text-red-500"
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
                          isSelected
                            ? "bg-primary-foreground"
                            : hasMatch
                            ? "bg-primary"
                            : "bg-primary/60"
                        }`}
                      />
                      {hasGroups && (
                        <span
                          className={`w-1 h-1 rounded-full ${
                            isSelected ? "bg-primary-foreground/80" : "bg-primary/40"
                          }`}
                          title="複数グループ活動あり"
                        />
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          </div>
        </div>

        {/* フィルター切り替え ＆ 過去日トグル ＆ 昇順/降順ソート */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex-1 flex items-center gap-1 p-1 bg-muted rounded-2xl border border-border">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-1 rounded-xl text-xs transition-all cursor-pointer ${
                filter === "all"
                  ? "bg-card text-foreground shadow-sm border border-border font-black"
                  : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
              }`}
            >
              <span>すべて</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black leading-none ${
                filter === "all" ? "bg-primary/12 text-primary" : "bg-card text-muted-foreground"
              }`}>
                {eventsInCurrentMonth.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setFilter("match")}
              className={`flex-1 py-1.5 rounded-xl text-xs transition-all cursor-pointer ${
                filter === "match"
                  ? "bg-card text-foreground shadow-sm border border-border font-black"
                  : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
              }`}
            >
              ⚾ 試合のみ
            </button>
            <button
              type="button"
              onClick={() => setFilter("practice")}
              className={`flex-1 py-1.5 rounded-xl text-xs transition-all cursor-pointer ${
                filter === "practice"
                  ? "bg-card text-foreground shadow-sm border border-border font-black"
                  : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
              }`}
            >
              🏃 練習のみ
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* 過去日 表示・非表示トグル */}
            <button
              type="button"
              onClick={() => setShowPastDates(prev => !prev)}
              className={`flex items-center gap-1 px-2.5 py-2 rounded-2xl text-xs transition-all active:scale-95 cursor-pointer ${
                showPastDates
                  ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                  : "bg-card text-muted-foreground border border-border hover:text-foreground hover:bg-muted font-bold"
              }`}
              title={showPastDates ? "過去日を表示中（クリックで非表示）" : "過去日を非表示中（クリックで表示）"}
            >
              {showPastDates ? (
                <>
                  <Eye className="w-3.5 h-3.5" />
                  <span>過去日: 表示中</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>過去日: 非表示</span>
                </>
              )}
            </button>

            {/* 昇順 / 降順 切り替えボタン */}
            <button
              type="button"
              onClick={() => setSortOrder(prev => prev === "asc" ? "desc" : "asc")}
              className="py-2 px-2.5 rounded-2xl bg-card hover:bg-muted text-foreground text-xs font-black border border-border shadow-2xs transition-all active:scale-95 flex items-center gap-1 shrink-0 cursor-pointer"
              title={sortOrder === "asc" ? "現在：昇順（直近から）" : "現在：降順（未来から）"}
            >
              <span>{sortOrder === "asc" ? "↑ 昇順" : "↓ 降順"}</span>
            </button>
          </div>
        </div>

        {/* ローディング */}
        {isLoading ? (
          <div className="space-y-3.5 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden p-4 space-y-3"
              >
                <div className="flex justify-between items-center">
                  <div className="h-5 w-24 bg-muted rounded-full" />
                  <div className="h-4 w-12 bg-muted rounded" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-6 w-40 bg-muted rounded-lg" />
                  <div className="h-4 w-56 bg-muted rounded" />
                </div>
                <div className="h-20 bg-muted rounded-2xl" />
                <div className="h-24 bg-muted rounded-2xl" />
              </div>
            ))}
          </div>
        ) : filteredEvents.length === 0 ? (
          /* 空ステート */
          <div className="flex flex-col items-center justify-center py-12 text-center rounded-2xl border border-border bg-card shadow-xs overflow-hidden p-6 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-teal-500/12 flex items-center justify-center text-teal-600 dark:text-teal-400">
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
              {!showPastDates && eventsInCurrentMonth.length > 0 && !selectedDateStr && (
                <p className="text-xs text-primary font-bold mt-2">
                  ※ 過去日の予定が非表示になっています。「過去日: 非表示」ボタンをタップすると表示できます。
                </p>
              )}
            </div>
            {selectedDateStr && (
              <button
                type="button"
                onClick={() => setSelectedDateStr(null)}
                className="py-1.5 px-4 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-black shadow-xs active:scale-95 transition-all cursor-pointer"
              >
                {currentMonth + 1}月のすべての予定を表示
              </button>
            )}
          </div>
        ) : (
          /* 🌟 予定カード一覧（トップページの予定カードレイアウトと完全統一 ＆ 出欠欄デフォルト展開） */
          <div className="space-y-4">
            {filteredEvents.map((ev, idx) => {
              const hasActivityGroups = Boolean(ev.activityGroups && ev.activityGroups.length > 1);
              const activityGroups = ev.activityGroups || [];
              const activeGroupId = activeGroupTabMap[ev.id] || (activityGroups[0]?.id || "default");
              const currentGroup = activityGroups.find(g => g.id === activeGroupId) || activityGroups[0];

              const isMatch = ev.eventType === "match" || ev.amType === "match" || ev.pmType === "match" || activityGroups.some(g => g.eventType === "match");
              const isOfficial = isMatch && Boolean(ev.title && (ev.title.includes("大会") || ev.title.includes("公式")));
              const displayDutyGroup = (hasActivityGroups && currentGroup?.dutyGroup) ? currentGroup.dutyGroup : ev.dutyGroup;
              const displayCarInfo = (hasActivityGroups && currentGroup?.carInfo) ? currentGroup.carInfo : ev.carInfo;
              const displayTargetGroup = (hasActivityGroups && currentGroup?.targetGroup) ? currentGroup.targetGroup : ev.targetGroup;

              // 🗓️ 日付の曜日パース（土=青、日=赤の明確なカレンダー色分け）
              const dateMatch = ev.date?.match(/^(.*?)(?:\((.)\))?$/);
              const dateText = dateMatch ? dateMatch[1] : ev.date;
              const dayOfWeek = dateMatch ? dateMatch[2] : "";
              const isSat = dayOfWeek === "土";
              const isSun = dayOfWeek === "日";

              const totalResponses =
                (ev.attendCount?.present || 0) +
                (ev.attendCount?.absent || 0) +
                (ev.attendCount?.pending || 0);
              const attendPct =
                totalResponses > 0
                  ? Math.round(((ev.attendCount?.present || 0) / totalResponses) * 100)
                  : 0;

              return (
                <div
                  key={ev.id}
                  className={`rounded-2xl border border-border bg-card shadow-xs overflow-hidden transition-all ${
                    idx >= 4 ? "[content-visibility:auto] [contain-intrinsic-size:auto_280px]" : ""
                  }`}
                >
                  {/* A-3 上帯ダークキャップ（日程・曜日・区分・対象・編集ボタン・タイトル） */}
                  <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary space-y-1">
                    {/* ① 上部ヘッダー：日程・日付 & 曜日バッジ & 対象チーム & ✏️ 編集ボタン */}
                    <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* 日付 ＋ 曜日バッジ */}
                        <div className="flex items-center gap-1">
                          <span className="text-lg sm:text-xl font-black text-white tracking-tight tabular-nums">
                            {dateText}
                          </span>
                          {dayOfWeek && (
                            <span className={`px-1.5 py-0.5 rounded text-xs font-black ${
                              isSat
                                ? "bg-sky-500 text-slate-950"
                                : isSun
                                ? "bg-rose-500 text-white"
                                : "bg-slate-700 text-slate-100"
                            }`}>
                              {dayOfWeek}
                            </span>
                          )}
                        </div>

                        {/* ⚾ 試合 / 🏃 練習 区分バッジ */}
                        <span className={`px-2 py-0.5 rounded text-[10.5px] font-black shrink-0 ${
                          isOfficial
                            ? "bg-amber-400 text-slate-950"
                            : isMatch
                            ? "bg-primary text-primary-foreground"
                            : "bg-teal-500 text-slate-950"
                        }`}>
                          {isOfficial ? "🏆 公式戦" : isMatch ? "⚾ 試合" : "🏃 練習"}
                        </span>

                        {/* 🎯 対象チーム・グループバッジ（Aチーム/Bチーム/全体など） */}
                        {displayTargetGroup && displayTargetGroup !== "全体" && (
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-100 text-[10.5px] font-black border border-slate-700 shrink-0">
                            🏷️ {displayTargetGroup}
                          </span>
                        )}

                        {hasActivityGroups && (
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-sky-300 text-[10px] font-black border border-slate-700 flex items-center gap-1 shrink-0">
                            <Layers className="w-3 h-3 text-sky-300" />
                            <span>{activityGroups.length}班</span>
                          </span>
                        )}

                        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-bold tabular-nums">
                          {idx + 1} / {filteredEvents.length}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-auto">
                        {/* ✏️ 編集ボタン */}
                        <button
                          type="button"
                          onClick={() => {
                            let grps: ActivityGroup[] | undefined = undefined;
                            if (Array.isArray(ev.activityGroups) && ev.activityGroups.length > 1) {
                              grps = ev.activityGroups;
                            } else if (typeof ev.activityGroups === "string") {
                              try {
                                const parsed = JSON.parse(ev.activityGroups);
                                if (Array.isArray(parsed) && parsed.length > 1) {
                                  grps = parsed;
                                }
                              } catch {}
                            }

                            if (grps && grps.length > 1) {
                              setActiveEditGroupId(grps[0].id);
                            } else {
                              setActiveEditGroupId("main");
                            }

                            const isAmOff = ev.hasAm === false || ev.amType === "off";

                            setEditingEvent({ 
                              ...ev, 
                              title: (ev.title && ev.title.trim()) ? ev.title : "通常練習",
                              needsLunch: Boolean(ev.needsLunch), 
                              needsSnack: Boolean(ev.needsSnack),
                              memo: ev.memo || "",
                              hasAm: !isAmOff,
                              amType: isAmOff ? "off" : (ev.amType || ev.eventType || "practice"),
                              amTime: isAmOff ? "" : (ev.amTime || ev.time || "08:00〜12:00"),
                              amLocation: isAmOff ? "" : (ev.amLocation || ev.location || ""),
                              pmType: ev.pmType || "practice",
                              pmTime: ev.pmTime || "13:00〜17:00",
                              pmLocation: ev.pmLocation || ev.amLocation || ev.location || "",
                              hasPm: ev.hasPm !== undefined ? ev.hasPm : true,
                              dutyGroup: ev.dutyGroup || "1班",
                              activityGroups: grps,
                            });
                          }}
                          className="py-1 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-black border border-slate-700 active:scale-95 transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-sky-300" />
                          <span>編集</span>
                        </button>
                      </div>
                    </div>

                    {/* ② タイトル */}
                    <h3 className="text-sm sm:text-base font-black text-white tracking-tight line-clamp-1">
                      {ev.title || (isMatch ? "公式戦・練習試合" : "通常練習")}
                    </h3>
                  </div>

                  <div className="p-4 pt-3.5 space-y-3.5">
                    {/* ③ 活動スケジュール表示（午前・午後 ＆ グループ切り替え） */}
                    {hasActivityGroups ? (
                      <div className="space-y-2.5">
                        {/* グループ切り替えチップ */}
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
                          {activityGroups.map((grp) => {
                            const isSel = (activeGroupId === grp.id);
                            return (
                              <button
                                key={grp.id}
                                type="button"
                                onClick={() => setActiveGroupTabMap(prev => ({ ...prev, [ev.id]: grp.id }))}
                                className={`px-3 py-1.5 rounded-xl text-xs shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
                                  isSel
                                    ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                                    : "bg-card text-muted-foreground border border-border hover:text-foreground hover:bg-muted font-bold"
                                }`}
                              >
                                <span>{grp.amType === "match" || grp.eventType === "match" ? "⚾" : "🏃"}</span>
                                <span>{grp.name}</span>
                                {grp.targetGroup && grp.targetGroup !== "全体" && (
                                  <span className={`px-1.5 py-0.2 rounded-md text-[9.5px] font-bold ${
                                    isSel ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                                  }`}>
                                    {grp.targetGroup}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {/* 選択中グループの 午前・午後 スケジュール */}
                        {currentGroup && (
                          (currentGroup.hasPm && currentGroup.pmTime) || (currentGroup.hasAm && currentGroup.hasPm) || currentGroup.hasPm || currentGroup.amType === "off" || currentGroup.hasAm === false ? (
                            <div className="grid grid-cols-2 gap-2">
                              {/* ☀️ 午前 */}
                              {currentGroup.hasAm !== false && currentGroup.amType !== "off" ? (
                                <div className="p-3 rounded-2xl bg-muted/35 border border-border flex flex-col justify-between space-y-2">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="px-2 py-0.5 rounded-md bg-sky-500/12 text-sky-700 dark:text-sky-300 border border-sky-500/25 text-[10.5px] font-black flex items-center gap-1 shrink-0">
                                      <span>☀️ 午前</span>
                                    </span>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border shrink-0 ${
                                      currentGroup.amType === "match"
                                        ? "bg-primary/12 text-primary border-primary/25"
                                        : "bg-teal-500/12 text-teal-700 dark:text-teal-300 border-teal-500/25"
                                    }`}>
                                      {currentGroup.amType === "match" ? "⚾ 試合" : "🏃 練習"}
                                    </span>
                                  </div>
                                  <div className="p-2 rounded-xl bg-card border border-border space-y-1">
                                    <div className="flex items-center gap-1.5 text-xs font-black text-foreground">
                                      <Clock className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                                      <span className="truncate">{currentGroup.amTime || currentGroup.time || "08:00〜12:00"}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-foreground/90 truncate">
                                      <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                                      <span className="truncate">{currentGroup.amLocation || currentGroup.location || "グラウンド"}</span>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="p-3 rounded-2xl bg-muted/20 border border-dashed border-border flex flex-col justify-between space-y-2 opacity-75">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border text-[10.5px] font-bold flex items-center gap-1 shrink-0">
                                      <span>☀️ 午前</span>
                                    </span>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground border border-border">
                                      🏖️ なし
                                    </span>
                                  </div>
                                  <div className="p-2 rounded-xl bg-card border border-border space-y-1">
                                    <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                                      <Clock className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                                      <span>なし (午後集合)</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                                      <MapPin className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                                      <span>—</span>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* 🌙 午後 */}
                              {currentGroup.hasPm && currentGroup.pmType !== "off" ? (
                                <div className="p-3 rounded-2xl bg-muted/35 border border-border flex flex-col justify-between space-y-2">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="px-2 py-0.5 rounded-md bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25 text-[10.5px] font-black flex items-center gap-1 shrink-0">
                                      <span>🌙 午後</span>
                                    </span>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border shrink-0 ${
                                      currentGroup.pmType === "match"
                                        ? "bg-primary/12 text-primary border-primary/25"
                                        : "bg-teal-500/12 text-teal-700 dark:text-teal-300 border-teal-500/25"
                                    }`}>
                                      {currentGroup.pmType === "match" ? "⚾ 試合" : "🏃 練習"}
                                    </span>
                                  </div>
                                  <div className="p-2 rounded-xl bg-card border border-border space-y-1">
                                    <div className="flex items-center gap-1.5 text-xs font-black text-foreground">
                                      <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                                      <span className="truncate">{currentGroup.pmTime ? currentGroup.pmTime : "解散・なし"}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-foreground/90 truncate">
                                      <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                                      <span className="truncate">{currentGroup.pmLocation || currentGroup.amLocation || "グラウンド"}</span>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="p-3 rounded-2xl bg-muted/20 border border-dashed border-border flex flex-col justify-between space-y-2 opacity-75">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border text-[10.5px] font-bold flex items-center gap-1 shrink-0">
                                      <span>🌙 午後</span>
                                    </span>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground border border-border">
                                      🏖️ なし
                                    </span>
                                  </div>
                                  <div className="p-2 rounded-xl bg-card border border-border space-y-1">
                                    <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                                      <Clock className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                                      <span>解散・なし</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                                      <MapPin className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                                      <span>—</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            /* 単一活動表示 */
                            <div className="p-3 rounded-2xl bg-muted/35 border border-border space-y-2">
                              <div className="flex items-center justify-between gap-1.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="px-2 py-0.5 rounded-md bg-sky-500/12 text-sky-700 dark:text-sky-300 border border-sky-500/25 text-[10px] font-black">
                                    ☀️ 午前
                                  </span>
                                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                                    currentGroup.eventType === "match" || currentGroup.amType === "match"
                                      ? "bg-primary/12 text-primary border-primary/25"
                                      : "bg-teal-500/12 text-teal-700 dark:text-teal-300 border-teal-500/25"
                                  }`}>
                                    {currentGroup.eventType === "match" || currentGroup.amType === "match" ? "⚾ 試合" : "🏃 練習"}
                                  </span>
                                </div>
                                {currentGroup.dutyGroup && (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-500/12 text-amber-700 dark:text-amber-300 border border-amber-500/25 text-[10px] font-black flex items-center gap-1">
                                    📋 {currentGroup.dutyGroup}
                                  </span>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                                <div className="flex items-center gap-1.5 text-foreground bg-card p-2 rounded-xl border border-border">
                                  <Clock className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                                  <span className="truncate font-black">{currentGroup.time || currentGroup.amTime || "時間調整中"}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-foreground bg-card p-2 rounded-xl border border-border">
                                  <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                                  <span className="truncate font-black">{currentGroup.location || currentGroup.amLocation || "グラウンド"}</span>
                                </div>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    ) : (
                      /* ☀️🌙 午前/午後分割スケジュール（全体） */
                      (ev.hasPm && ev.pmTime) || (ev.hasAm && ev.hasPm) || ev.hasPm || ev.amType === "off" || ev.hasAm === false ? (
                        <div className="grid grid-cols-2 gap-2">
                          {/* ☀️ 【午前】 */}
                          {ev.hasAm !== false && ev.amType !== "off" ? (
                            <div className="p-3 rounded-2xl bg-muted/35 border border-border flex flex-col justify-between space-y-2">
                              <div className="flex items-center justify-between gap-1">
                                <span className="px-2 py-0.5 rounded-md bg-sky-500/12 text-sky-700 dark:text-sky-300 border border-sky-500/25 text-[10.5px] font-black flex items-center gap-1 shrink-0">
                                  <span>☀️ 午前</span>
                                </span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border shrink-0 ${
                                  ev.amType === "match"
                                    ? "bg-primary/12 text-primary border-primary/25"
                                    : "bg-teal-500/12 text-teal-700 dark:text-teal-300 border-teal-500/25"
                                }`}>
                                  {ev.amType === "match" ? "⚾ 試合" : "🏃 練習"}
                                </span>
                              </div>
                              <div className="p-2 rounded-xl bg-card border border-border space-y-1">
                                <div className="flex items-center gap-1.5 text-xs font-black text-foreground">
                                  <Clock className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                                  <span className="truncate">{ev.amTime || ev.time || "08:00〜12:00"}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] font-bold text-foreground/90 truncate">
                                  <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                                  <span className="truncate">{ev.amLocation || ev.location || "グラウンド"}</span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="p-3 rounded-2xl bg-muted/20 border border-dashed border-border flex flex-col justify-between space-y-2 opacity-75">
                              <div className="flex items-center justify-between gap-1">
                                <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border text-[10.5px] font-bold flex items-center gap-1 shrink-0">
                                  <span>☀️ 午前</span>
                                </span>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground border border-border">
                                  🏖️ なし
                                </span>
                              </div>
                              <div className="p-2 rounded-xl bg-card border border-border space-y-1">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                                  <Clock className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                                  <span>なし (午後集合)</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                                  <MapPin className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                                  <span>—</span>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 🌙 【午後】 */}
                          {ev.hasPm && ev.pmType !== "off" ? (
                            <div className="p-3 rounded-2xl bg-muted/35 border border-border flex flex-col justify-between space-y-2">
                              <div className="flex items-center justify-between gap-1">
                                <span className="px-2 py-0.5 rounded-md bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25 text-[10.5px] font-black flex items-center gap-1 shrink-0">
                                  <span>🌙 午後</span>
                                </span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border shrink-0 ${
                                  ev.pmType === "match"
                                    ? "bg-primary/12 text-primary border-primary/25"
                                    : "bg-teal-500/12 text-teal-700 dark:text-teal-300 border-teal-500/25"
                                }`}>
                                  {ev.pmType === "match" ? "⚾ 試合" : "🏃 練習"}
                                </span>
                              </div>
                              <div className="p-2 rounded-xl bg-card border border-border space-y-1">
                                <div className="flex items-center gap-1.5 text-xs font-black text-foreground">
                                  <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                                  <span className="truncate">{ev.pmTime ? ev.pmTime : "解散・なし"}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] font-bold text-foreground/90 truncate">
                                  <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                                  <span className="truncate">{ev.pmLocation || ev.amLocation || "グラウンド"}</span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="p-3 rounded-2xl bg-muted/20 border border-dashed border-border flex flex-col justify-between space-y-2 opacity-75">
                              <div className="flex items-center justify-between gap-1">
                                <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border text-[10.5px] font-bold flex items-center gap-1 shrink-0">
                                  <span>🌙 午後</span>
                                </span>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground border border-border">
                                  🏖️ なし
                                </span>
                              </div>
                              <div className="p-2 rounded-xl bg-card border border-border space-y-1">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                                  <Clock className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                                  <span>解散・なし</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                                  <MapPin className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                                  <span>—</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* 単一活動表示 */
                        <div className="p-3 rounded-2xl bg-muted/35 border border-border space-y-2">
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-md bg-sky-500/12 text-sky-700 dark:text-sky-300 border border-sky-500/25 text-[10px] font-black">
                                ☀️ 午前
                              </span>
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                                ev.eventType === "match"
                                  ? "bg-primary/12 text-primary border-primary/25"
                                  : "bg-teal-500/12 text-teal-700 dark:text-teal-300 border-teal-500/25"
                              }`}>
                                {ev.eventType === "match" ? "⚾ 試合" : "🏃 練習"}
                              </span>
                            </div>
                            {ev.dutyGroup && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/12 text-amber-700 dark:text-amber-300 border border-amber-500/25 text-[10px] font-black flex items-center gap-1">
                                📋 {ev.dutyGroup}
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                            <div className="flex items-center gap-1.5 text-foreground bg-card p-2 rounded-xl border border-border">
                              <Clock className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                              <span className="truncate font-black">{ev.time || "時間調整中"}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-foreground bg-card p-2 rounded-xl border border-border">
                              <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                              <span className="truncate font-black">{ev.location || "グラウンド"}</span>
                            </div>
                          </div>
                        </div>
                      )
                    )}

                    {/* ④ 📋 その他の詳細情報ブロック（上から：お弁当・補食、連絡事項、配車、当番） */}
                    <div className="p-3 rounded-2xl bg-muted/35 border border-border space-y-2.5 text-xs">
                      {/* 1. お弁当 & 補食 */}
                      <div className="grid grid-cols-2 gap-2 font-bold">
                        {/* お弁当 */}
                        <div className="flex items-center justify-between p-2 rounded-xl bg-card border border-border">
                          <span className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
                            <Utensils className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            <span>お弁当</span>
                          </span>
                          <span className={`px-2 py-0.5 rounded-md text-[10.5px] font-black ${
                            ev.needsLunch
                              ? "bg-amber-500/12 text-amber-700 dark:text-amber-300 border border-amber-500/25"
                              : "text-muted-foreground/60"
                          }`}>
                            {ev.needsLunch ? "🍙 要" : "不要"}
                          </span>
                        </div>

                        {/* 補食 */}
                        <div className="flex items-center justify-between p-2 rounded-xl bg-card border border-border">
                          <span className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
                            <span className="text-xs leading-none">🍌</span>
                            <span>補食</span>
                          </span>
                          <span className={`px-2 py-0.5 rounded-md text-[10.5px] font-black ${
                            ev.needsSnack
                              ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25"
                              : "text-muted-foreground/60"
                          }`}>
                            {ev.needsSnack ? "🍌 要" : "不要"}
                          </span>
                        </div>
                      </div>

                      {/* 2. 連絡事項・メモ（アコーディオン展開対応・左アクセントバー） */}
                      {(() => {
                        const hasMemo = !!ev.memo && ev.memo.trim() !== "";
                        const isExpanded = !!expandedMemos[ev.id];

                        if (!hasMemo) {
                          return (
                            <div className="pt-2 border-t border-border flex items-center justify-between text-[11px]">
                              <span className="text-muted-foreground flex items-center gap-1.5">
                                <FileText className="w-3.5 h-3.5 text-muted-foreground/60" />
                                <span>連絡事項</span>
                              </span>
                              <span className="text-muted-foreground/60 font-bold">特になし</span>
                            </div>
                          );
                        }

                        return (
                          <div className="pt-2 border-t border-border space-y-1.5">
                            {/* アコーディオンヘッダー・開閉トグルボタン */}
                            <button
                              type="button"
                              onClick={() => toggleMemo(ev.id)}
                              className="w-full flex items-center justify-between p-2 rounded-xl bg-card border border-border border-l-4 border-l-amber-500 hover:bg-muted active:scale-[0.99] transition-all cursor-pointer select-none shadow-2xs"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                <span className="text-[11px] font-black text-foreground">連絡事項</span>
                                <span className="px-1.5 py-0.2 rounded-md bg-amber-500/12 text-amber-700 dark:text-amber-300 border border-amber-500/25 text-[9.5px] font-black shrink-0">
                                  {isExpanded ? "表示中" : "タップで確認"}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-[10px] font-bold shrink-0">
                                <span>{isExpanded ? "閉じる" : "開く"}</span>
                                {isExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 transition-transform duration-200" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground transition-transform duration-200" />
                                )}
                              </div>
                            </button>

                            {/* アコーディオン本文 */}
                            {isExpanded && (
                              <div className="animate-in fade-in slide-in-from-top-1 duration-150 p-2.5 rounded-xl bg-card border border-border border-l-4 border-l-amber-500 text-foreground leading-relaxed text-[11px] font-bold whitespace-pre-wrap shadow-2xs">
                                {ev.memo}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* 3. 配車 */}
                      <div className="pt-2 border-t border-border flex items-center justify-between font-bold">
                        <div className="flex items-center gap-2 min-w-0">
                          <Car className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                          <span className="text-muted-foreground text-[11px] shrink-0">配車:</span>
                          <span className="text-foreground truncate font-black text-[11px]">
                            {displayCarInfo ? displayCarInfo : "なし（現地集合）"}
                          </span>
                        </div>

                        {displayCarInfo ? (
                          <Link
                            href="/liff/carpool"
                            className="text-[10.5px] font-black text-primary hover:underline flex items-center gap-0.5 shrink-0 ml-2"
                          >
                            <span>配車表へ</span>
                            <ChevronRight className="w-3 h-3" />
                          </Link>
                        ) : null}
                      </div>

                      {/* 4. 一番下に当番（左アクセントバー） */}
                      {displayDutyGroup && (
                        <div className="p-2 rounded-xl bg-card border border-border border-l-4 border-l-amber-500 flex items-center justify-between text-[11px] font-bold shadow-2xs">
                          <span className="text-foreground font-black flex items-center gap-1.5">
                            <ClipboardList className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            <span>お当番</span>
                          </span>
                          <span className="px-2.5 py-0.5 rounded bg-amber-500/12 text-amber-700 dark:text-amber-300 border border-amber-500/25 font-black flex items-center gap-1">
                            <span>📋</span>
                            <span>{displayDutyGroup}</span>
                          </span>
                        </div>
                      )}
                    </div>

                    {/* ⑤ リアルタイム出欠サマリー ＆ 3色ソリッドゲージバー */}
                    {totalResponses > 0 && (
                      <div className="p-3 rounded-2xl bg-card border border-border space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-2 font-black text-foreground">
                            <Users className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span>出欠状況</span>
                            <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-black tabular-nums">
                              参加 {ev.attendCount.present}
                            </span>
                            <span className="text-muted-foreground font-bold tabular-nums">
                              未定 {ev.attendCount.pending} ・ 欠席 {ev.attendCount.absent}
                            </span>
                          </div>
                          <Link
                            href="/liff/schedule/board"
                            className="inline-flex items-center gap-0.5 text-[11px] font-black text-primary hover:underline shrink-0 tabular-nums"
                          >
                            <span>参加率 {attendPct}%</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                        <div className="flex gap-1 h-2 w-full rounded-xs overflow-hidden bg-muted">
                          {ev.attendCount.present > 0 && (
                            <div
                              className="h-full rounded-xs bg-emerald-600"
                              style={{ width: `${(ev.attendCount.present / totalResponses) * 100}%` }}
                            />
                          )}
                          {ev.attendCount.pending > 0 && (
                            <div
                              className="h-full rounded-xs bg-amber-500"
                              style={{ width: `${(ev.attendCount.pending / totalResponses) * 100}%` }}
                            />
                          )}
                          {ev.attendCount.absent > 0 && (
                            <div
                              className="h-full rounded-xs bg-slate-500"
                              style={{ width: `${(ev.attendCount.absent / totalResponses) * 100}%` }}
                            />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* 過去日非表示の案内 */}
            {!showPastDates && !selectedDateStr && eventsInCurrentMonth.some(ev => ev.dateStr && ev.dateStr < todayStr) && (
              <div className="text-center py-2 pb-4">
                <button
                  type="button"
                  onClick={() => setShowPastDates(true)}
                  className="text-xs font-bold text-muted-foreground hover:text-primary transition-colors underline underline-offset-4 cursor-pointer"
                >
                  ※ 本日より前の過去日は非表示です（タップして表示）
                </button>
              </div>
            )}
          </div>
        )}
          </>
        )}

        {/* 🌟 最下部マージン（ボトムナビに被らず快適にタップできる適度な余白） */}
        <div className="h-8 w-full shrink-0 pointer-events-none select-none" aria-hidden="true" />
      </div>

      {/* 🌟 予定の個別詳細編集モーダル（広々レイアウト ＆ 午前午後常に設定 ＆ 横並び入力） */}
      {mounted && editingEvent && createPortal(
        (() => {
        const hasGroups = Boolean(editingEvent.activityGroups && editingEvent.activityGroups.length > 0);
        const groups = editingEvent.activityGroups || [];

        // 現在編集中のグループまたはメインデータ
        const currentEditGroup = hasGroups
          ? (groups.find(g => g.id === activeEditGroupId) || groups[0])
          : null;

        const curHasAm = currentEditGroup
          ? (currentEditGroup.hasAm !== false && currentEditGroup.amType !== "off")
          : (editingEvent.hasAm !== false && editingEvent.amType !== "off");
        const curAmType = currentEditGroup ? (currentEditGroup.amType || "practice") : (editingEvent.amType || editingEvent.eventType || "practice");
        const curAmTime = currentEditGroup ? (currentEditGroup.amTime || "08:00〜12:00") : (editingEvent.amTime || editingEvent.time || "08:00〜12:00");
        const curAmLocation = currentEditGroup ? (currentEditGroup.amLocation || "") : (editingEvent.amLocation || editingEvent.location || "");
        
        const curHasPm = currentEditGroup
          ? (currentEditGroup.hasPm !== undefined ? currentEditGroup.hasPm : (currentEditGroup.pmType !== "off"))
          : (editingEvent.hasPm !== undefined ? editingEvent.hasPm : true);
        const curPmType = currentEditGroup ? (currentEditGroup.pmType || "practice") : (editingEvent.pmType || "practice");
        const curPmTime = currentEditGroup ? (currentEditGroup.pmTime || "13:00〜17:00") : (editingEvent.pmTime || "13:00〜17:00");
        const curPmLocation = currentEditGroup ? (currentEditGroup.pmLocation || currentEditGroup.amLocation || "") : (editingEvent.pmLocation || editingEvent.amLocation || "");
        const curDutyGroup = currentEditGroup ? (currentEditGroup.dutyGroup || "1班") : (editingEvent.dutyGroup || "1班");
        const curCarInfo = currentEditGroup ? (currentEditGroup.carInfo || "") : (editingEvent.carInfo || "");
        const curTargetGroup = currentEditGroup ? (currentEditGroup.targetGroup || "全体") : (editingEvent.targetGroup || "全体");

        // 編集ハンドラー（グループまたはメインを更新）
        const updateCurrentActivity = (updates: Partial<{
          targetGroup: string;
          hasAm: boolean;
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
              ...(updates.targetGroup && currentEditGroup.id === groups[0].id ? { targetGroup: updates.targetGroup } : {}),
            });
          } else {
            setEditingEvent({
              ...editingEvent,
              ...updates,
            });
          }
        };

        return (
          <div className="fixed inset-0 z-[9999] bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150">
            <div
              className="w-full max-w-2xl rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden max-h-[90vh] flex flex-col animate-in slide-in-from-bottom-4 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* モーダルヘッダー: A-3 上帯ダークキャップ */}
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 px-4 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <span className="px-2.5 py-1 rounded-xl bg-teal-500/20 text-teal-300 border border-teal-400/30 text-xs font-black shrink-0 tabular-nums">
                    {editingEvent.date}
                  </span>
                  <h3 className="text-sm font-black text-white">
                    予定の詳細編集
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingEvent(null)}
                  className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white active:scale-95 transition-all cursor-pointer"
                >
                  <span className="text-base font-black leading-none">✕</span>
                </button>
              </div>

              {/* モーダル本文 */}
              <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
                {/* 1. 予定タイトル（デフォルト: 通常練習 ＆ クイック選択） */}
                <div className="space-y-2.5 p-3.5 rounded-2xl bg-muted/35 border border-border">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-black text-foreground">予定タイトル</label>
                      <span className="text-[10px] text-muted-foreground font-bold">デフォルト: 通常練習</span>
                    </div>
                    <input
                      type="text"
                      value={editingEvent.title}
                      onChange={(e) => setEditingEvent({ ...editingEvent, title: e.target.value })}
                      placeholder="通常練習"
                      className="w-full px-3 py-2 rounded-xl bg-card border border-border text-xs font-black text-foreground focus:outline-hidden focus:border-primary"
                    />
                  </div>

                  {/* タイトルの定型プリセットボタン */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    <span className="text-[10px] font-bold text-muted-foreground shrink-0">定型:</span>
                    {[
                      "通常練習",
                      "公式戦・大会",
                      practiceMatchLabel,
                      "合宿・遠征",
                      "ミーティング",
                      "グラウンド整備",
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setEditingEvent({ ...editingEvent, title: preset })}
                        className={`px-2 py-0.5 rounded-lg text-[10.5px] transition-all active:scale-95 cursor-pointer ${
                          (editingEvent.title || "通常練習") === preset
                            ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                            : "bg-card text-muted-foreground border border-border hover:text-foreground hover:bg-muted font-bold"
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 🌟 2. グループ分けタブ ＆ グループ追加 ＆ 活動グループ内での対象チーム選択 */}
                <div className="space-y-3 p-3.5 rounded-2xl bg-muted/35 border border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-[11px] font-black text-foreground flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-primary" />
                        <span>活動グループ（班分け）</span>
                      </label>
                      <p className="text-[10px] font-bold text-muted-foreground">
                        別動隊がある場合はグループを追加し、タブで切り替えて対象チーム・午前午後を設定
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {hasGroups && (
                        <button
                          type="button"
                          onClick={() => {
                            const base = currentEditGroup || groups[0];
                            setEditingEvent({
                              ...editingEvent,
                              targetGroup: base?.targetGroup || editingEvent.targetGroup || "全体",
                              hasAm: base ? (base.hasAm !== false && base.amType !== "off") : editingEvent.hasAm,
                              amType: base?.amType || editingEvent.amType || "practice",
                              amTime: base?.amTime || editingEvent.amTime || "08:00〜12:00",
                              amLocation: base?.amLocation || editingEvent.amLocation || "",
                              hasPm: base ? Boolean(base.hasPm && base.pmType !== "off") : editingEvent.hasPm,
                              pmType: base?.pmType || editingEvent.pmType || "practice",
                              pmTime: base?.pmTime || editingEvent.pmTime || "13:00〜17:00",
                              pmLocation: base?.pmLocation || editingEvent.pmLocation || "",
                              dutyGroup: base?.dutyGroup || editingEvent.dutyGroup || "1班",
                              carInfo: base?.carInfo || editingEvent.carInfo || "",
                              activityGroups: undefined,
                            });
                            setActiveEditGroupId("main");
                          }}
                          className="py-1 px-2.5 rounded-xl bg-card hover:bg-rose-500/10 text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 text-[10.5px] font-bold border border-border active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
                          title="グループ分けを解除して単一活動に戻す"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>単一活動に戻す</span>
                        </button>
                      )}

                      {/* ＋ グループ追加ボタン */}
                      <button
                        type="button"
                        onClick={() => {
                          if (!hasGroups) {
                            // 単一から複数グループへ昇格（グループ1, グループ2）
                            const grp1: ActivityGroup = {
                              id: `grp_${Date.now()}_1`,
                              name: "グループ1",
                              targetGroup: editingEvent.targetGroup || "全体",
                              hasAm: editingEvent.hasAm !== false && editingEvent.amType !== "off",
                              amType: editingEvent.amType || "match",
                              amTime: editingEvent.amTime || "08:00〜12:00",
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
                              name: "グループ2",
                              targetGroup: "Bチーム",
                              hasAm: true,
                              amType: "practice",
                              amTime: "09:00〜12:00",
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
                            // 既存グループに追加（グループN）
                            const nextNum = groups.length + 1;
                            const newGrp: ActivityGroup = {
                              id: `grp_${Date.now()}_${nextNum}`,
                              name: `グループ${nextNum}`,
                              targetGroup: "全体",
                              hasAm: true,
                              amType: "practice",
                              amTime: "09:00〜12:00",
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
                        className="py-1 px-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-[10.5px] font-black shadow-xs active:scale-95 transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>＋ グループ追加</span>
                      </button>
                    </div>
                  </div>

                  {/* グループタブバー */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    {!hasGroups ? (
                      <div className="px-3 py-1.5 rounded-xl bg-primary/12 text-primary border border-primary/35 text-xs font-black shadow-2xs flex items-center gap-1.5 shrink-0">
                        <span>🏷️ 単一活動（全体）</span>
                        {curTargetGroup && curTargetGroup !== "全体" && (
                          <span className="bg-primary/15 px-1.5 py-0.2 rounded-md text-[10px]">
                            {curTargetGroup}
                          </span>
                        )}
                      </div>
                    ) : (
                      groups.map((grp) => {
                        const isSel = (currentEditGroup?.id === grp.id);
                        return (
                          <div
                            key={grp.id}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs shrink-0 transition-all ${
                              isSel
                                ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                                : "bg-card text-muted-foreground border border-border hover:text-foreground hover:bg-muted font-bold"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setActiveEditGroupId(grp.id)}
                              className="flex items-center gap-1 cursor-pointer"
                            >
                              <span>{grp.amType === "match" ? "⚾" : "🏃"}</span>
                              <span>{grp.name}</span>
                              {grp.targetGroup && grp.targetGroup !== "全体" && (
                                <span className={`px-1.5 py-0.2 rounded-md text-[9.5px] font-bold ${
                                  isSel ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                                }`}>
                                  {grp.targetGroup}
                                </span>
                              )}
                            </button>

                            {/* グループ削除ボタン */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const nextGroups = groups.filter(g => g.id !== grp.id);
                                if (nextGroups.length <= 1) {
                                  // 残り1グループ以下になった場合は自動的に単一活動に復帰
                                  const remaining = nextGroups[0];
                                  setEditingEvent({
                                    ...editingEvent,
                                    targetGroup: remaining?.targetGroup || grp.targetGroup || editingEvent.targetGroup || "全体",
                                    hasAm: remaining ? (remaining.hasAm !== false && remaining.amType !== "off") : (grp.hasAm !== false && grp.amType !== "off"),
                                    amType: remaining?.amType || grp.amType || "practice",
                                    amTime: remaining?.amTime || grp.amTime || "08:00〜12:00",
                                    amLocation: remaining?.amLocation || grp.amLocation || "",
                                    hasPm: remaining ? Boolean(remaining.hasPm && remaining.pmType !== "off") : Boolean(grp.hasPm && grp.pmType !== "off"),
                                    pmType: remaining?.pmType || grp.pmType || "practice",
                                    pmTime: remaining?.pmTime || grp.pmTime || "13:00〜17:00",
                                    pmLocation: remaining?.pmLocation || grp.pmLocation || "",
                                    dutyGroup: remaining?.dutyGroup || grp.dutyGroup || "1班",
                                    carInfo: remaining?.carInfo || grp.carInfo || "",
                                    activityGroups: undefined,
                                  });
                                  setActiveEditGroupId("main");
                                } else {
                                  setEditingEvent({
                                    ...editingEvent,
                                    activityGroups: nextGroups,
                                  });
                                  if (activeEditGroupId === grp.id) {
                                    setActiveEditGroupId(nextGroups[0].id);
                                  }
                                }
                              }}
                              className="ml-1 text-current opacity-70 hover:opacity-100 hover:text-rose-500 cursor-pointer p-0.5 rounded-full hover:bg-muted/30 transition-all"
                              title={groups.length <= 2 ? "このグループを削除して単一活動に戻す" : "グループ削除"}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* 🎯 対象チーム・グループ選択（活動グループの内側で選択！） */}
                  <div className="pt-2 border-t border-border space-y-2">
                    {hasGroups && currentEditGroup && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10.5px] font-bold text-muted-foreground shrink-0">グループ表示名:</span>
                        <input
                          type="text"
                          value={currentEditGroup.name}
                          onChange={(e) => {
                            const updated = groups.map(g => g.id === currentEditGroup.id ? { ...g, name: e.target.value } : g);
                            setEditingEvent({ ...editingEvent, activityGroups: updated });
                          }}
                          placeholder="グループ名（例: Aチーム（試合組）/ Bチーム（練習組））"
                          className="font-black text-xs text-foreground bg-card border border-border px-3 py-1.5 rounded-xl w-full focus:outline-hidden focus:border-primary"
                        />
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10.5px] font-bold text-muted-foreground flex items-center gap-1">
                          <span>🎯</span>
                          <span>{hasGroups && currentEditGroup ? `「${currentEditGroup.name}」の対象チーム・グループ` : "対象チーム・グループ"}</span>
                        </label>
                        <span className="text-[10px] font-black text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/25">
                          選択中: {curTargetGroup}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {TARGET_GROUPS.map((tg) => {
                          const isSel = curTargetGroup === tg;
                          return (
                            <button
                              key={tg}
                              type="button"
                              onClick={() => {
                                updateCurrentActivity({ targetGroup: tg });
                                if (hasGroups && currentEditGroup && currentEditGroup.name.startsWith("グループ")) {
                                  const updated = groups.map(g => g.id === currentEditGroup.id ? { ...g, targetGroup: tg, name: tg !== "全体" ? `${tg}組` : g.name } : g);
                                  setEditingEvent({ ...editingEvent, activityGroups: updated });
                                }
                              }}
                              className={`px-2.5 py-1 rounded-xl text-xs transition-all active:scale-95 cursor-pointer ${
                                isSel
                                  ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                                  : "bg-card hover:bg-muted text-muted-foreground hover:text-foreground border border-border font-bold"
                              }`}
                            >
                              {tg}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 🌟 3. 午前・午後の設定エリア（タイトルを別行にし、活動種別・時間帯・場所をすっきり配置） */}
                <div className="space-y-3.5 p-4 rounded-2xl bg-card border border-border shadow-xs">
                  {/* ☀️ 午前ブロック */}
                  <div className={`p-3.5 rounded-2xl border space-y-2.5 transition-all ${
                    curHasAm
                      ? "bg-muted/35 border-border"
                      : "bg-muted/20 border-border opacity-80"
                  }`}>
                    {/* 1行目: 午前の活動タイトル & ON/OFF 切替スイッチ */}
                    <div className="flex items-center justify-between pb-2 border-b border-border">
                      <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                        <Sun className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                        <span>午前の活動</span>
                      </span>

                      {/* 午前の活動 ON/OFF 切替スイッチ */}
                      <button
                        type="button"
                        onClick={() => {
                          const nextHasAm = !curHasAm;
                          updateCurrentActivity({
                            hasAm: nextHasAm,
                            amType: nextHasAm ? (curAmType === "off" ? "practice" : curAmType || "practice") : "off",
                            amTime: nextHasAm ? (curAmTime || "08:00〜12:00") : "",
                            amLocation: nextHasAm ? (curAmLocation || "") : "",
                          });
                        }}
                        className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-black border transition-all cursor-pointer ${
                          curHasAm
                            ? "bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/35 shadow-2xs"
                            : "bg-muted text-muted-foreground border-border"
                        }`}
                      >
                        {curHasAm ? "✓ 午前あり" : "🏖️ なし (午後集合)"}
                      </button>
                    </div>

                    {/* 2行目: 午前活動種別の選択（別行でゆったり選択） */}
                    {curHasAm && (
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <span className="text-[10.5px] font-bold text-muted-foreground shrink-0">活動種別:</span>
                        <div className="flex items-center gap-1 flex-wrap">
                          {EVENT_TYPES.slice(0, 3).map((t) => {
                            const isSel = curAmType === t.id;
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => updateCurrentActivity({ amType: t.id as any })}
                                className={`px-2.5 py-1 rounded-xl text-xs font-black border transition-all active:scale-95 cursor-pointer ${
                                  isSel ? t.color + " shadow-xs font-black" : "bg-card border-border text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                {t.icon} {t.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {curHasAm ? (
                      <div className="space-y-2">
                        {/* 🌟 時間帯と場所の横並び配置 */}
                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="text-[10px] font-bold text-muted-foreground block mb-0.5">時間帯</label>
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-card border border-border">
                              <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
                              <input
                                type="text"
                                value={curAmTime}
                                onChange={(e) => updateCurrentActivity({ amTime: e.target.value })}
                                placeholder="08:00〜12:00"
                                className="bg-transparent text-xs font-bold text-foreground focus:outline-hidden w-full"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-muted-foreground block mb-0.5">球場・場所</label>
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-card border border-border">
                              <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                              <input
                                type="text"
                                value={curAmLocation}
                                onChange={(e) => updateCurrentActivity({ amLocation: e.target.value })}
                                placeholder="市民球場 / 選択"
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
                                  className="px-1.5 py-0.5 rounded-md text-[9.5px] font-bold bg-card border border-border text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
                                >
                                  🏟️ {displayName}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] font-bold text-muted-foreground py-0.5">
                        午前は予定なし（午後からの集合・活動開始）
                      </p>
                    )}
                  </div>

                  {/* 🌙 午後ブロック */}
                  <div className={`p-3.5 rounded-2xl border space-y-2.5 transition-all ${
                    curHasPm && curPmType !== "off"
                      ? "bg-muted/35 border-border"
                      : "bg-muted/20 border-border opacity-80"
                  }`}>
                    {/* 1行目: 午後の活動タイトル & ON/OFF 切替スイッチ */}
                    <div className="flex items-center justify-between pb-2 border-b border-border">
                      <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                        <Moon className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
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
                        className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-black border transition-all cursor-pointer ${
                          curHasPm && curPmType !== "off"
                            ? "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 border-indigo-500/35 shadow-2xs"
                            : "bg-muted text-muted-foreground border-border"
                        }`}
                      >
                        {curHasPm && curPmType !== "off" ? "✓ 午後あり" : "🏖️ なし (午前解散)"}
                      </button>
                    </div>

                    {/* 2行目: 午後活動種別の選択（別行でゆったり選択） */}
                    {curHasPm && curPmType !== "off" && (
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <span className="text-[10.5px] font-bold text-muted-foreground shrink-0">活動種別:</span>
                        <div className="flex items-center gap-1 flex-wrap">
                          {EVENT_TYPES.slice(0, 3).map((t) => {
                            const isSel = curPmType === t.id;
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => updateCurrentActivity({ pmType: t.id as any })}
                                className={`px-2.5 py-1 rounded-xl text-xs font-black border transition-all active:scale-95 cursor-pointer ${
                                  isSel ? t.color + " shadow-xs font-black" : "bg-card border-border text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                {t.icon} {t.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {curHasPm && curPmType !== "off" ? (
                      <div className="space-y-2">
                        {/* 🌟 時間帯と場所の横並び配置 */}
                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="text-[10px] font-bold text-muted-foreground block mb-0.5">時間帯</label>
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-card border border-border">
                              <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
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
                              <label className="text-[10px] font-bold text-muted-foreground block">球場・場所</label>
                              {curAmLocation && curPmLocation !== curAmLocation && (
                                <button
                                  type="button"
                                  onClick={() => updateCurrentActivity({ pmLocation: curAmLocation })}
                                  className="text-[9.5px] font-bold text-primary hover:underline cursor-pointer"
                                >
                                  午前と同じ
                                </button>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-card border border-border">
                              <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                              <input
                                type="text"
                                value={curPmLocation}
                                onChange={(e) => updateCurrentActivity({ pmLocation: e.target.value })}
                                placeholder="球場名 / 選択"
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
                                  className="px-1.5 py-0.5 rounded-md text-[9.5px] font-bold bg-card border border-border text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
                                >
                                  🏟️ {displayName}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] font-bold text-muted-foreground py-0.5">
                        午後は予定なし（午前中のみで活動終了・解散）
                      </p>
                    )}
                  </div>

                  {/* グループ固有の当番・配車（複数グループ時） */}
                  {hasGroups && currentEditGroup && (
                    <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-border">
                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground block mb-0.5">このグループのお当番</label>
                        <input
                          type="text"
                          value={curDutyGroup}
                          onChange={(e) => updateCurrentActivity({ dutyGroup: e.target.value })}
                          placeholder="例: 1班"
                          className="w-full px-2.5 py-1.5 rounded-xl bg-muted/35 border border-border text-xs font-bold text-foreground focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground block mb-0.5">このグループの配車</label>
                        <input
                          type="text"
                          value={curCarInfo}
                          onChange={(e) => updateCurrentActivity({ carInfo: e.target.value })}
                          placeholder="例: 3台/現地集合"
                          className="w-full px-2.5 py-1.5 rounded-xl bg-muted/35 border border-border text-xs font-bold text-foreground focus:outline-hidden"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 📋 4. 全体共通情報（当番・お弁当・補食・連絡事項） */}
                <div className="space-y-3 p-3.5 rounded-2xl bg-muted/35 border border-border">
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
                            className={`py-1 text-center rounded-lg text-[11px] transition-all active:scale-95 cursor-pointer ${
                              editingEvent.dutyGroup === dg
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/35 font-black shadow-2xs"
                                : "bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted font-bold"
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
                              ? "border-amber-500/35 bg-amber-500/12 text-amber-700 dark:text-amber-300 font-black shadow-2xs"
                              : "bg-card border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Utensils className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                          <span>持参要</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingEvent({ ...editingEvent, needsLunch: false })}
                          className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                            editingEvent.needsLunch !== true
                              ? "border-primary/35 bg-primary/12 text-primary font-black shadow-2xs"
                              : "bg-card border-border text-muted-foreground hover:text-foreground"
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
                              ? "border-emerald-500/35 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 font-black shadow-2xs"
                              : "bg-card border-border text-muted-foreground hover:text-foreground"
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
                              ? "border-primary/35 bg-primary/12 text-primary font-black shadow-2xs"
                              : "bg-card border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <span>不要</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 連絡事項 */}
                  <div className="space-y-1 pt-2 border-t border-border">
                    <label className="text-[10.5px] font-black text-foreground">連絡事項・持ち物</label>
                    <textarea
                      rows={2}
                      value={editingEvent.memo || ""}
                      onChange={(e) => setEditingEvent({ ...editingEvent, memo: e.target.value })}
                      placeholder="ユニフォーム正装、スパイク持参、雨天時は7:00連絡など"
                      className="w-full px-3 py-2 rounded-xl bg-card border border-border text-xs font-bold text-foreground focus:outline-hidden focus:border-primary resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* モーダルフッター */}
              <div className="px-5 py-3.5 pb-[max(env(safe-area-inset-bottom),24px)] sm:pb-3.5 border-t border-border flex items-center justify-between bg-card shrink-0 gap-3">
                <button
                  type="button"
                  onClick={() => setEditingEvent(null)}
                  className="py-2.5 px-4 rounded-xl text-xs font-bold border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all cursor-pointer"
                >
                  キャンセル
                </button>

                <button
                  type="button"
                  onClick={handleSaveEventEdit}
                  disabled={isSavingEdit}
                  className="py-2.5 px-6 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-black shadow-xs transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSavingEdit ? "保存中..." : "予定を更新する"}</span>
                </button>
              </div>
            </div>
          </div>
        );
      })(),
      document.body
    )}
    </div>
  );
}
