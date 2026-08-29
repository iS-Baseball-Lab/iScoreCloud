// filepath: src/components/liff/HubHeroSection.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
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
  Info,
  Sun,
  Moon,
  FileText,
  Users
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MatchCardData } from "@/components/liff/MatchScoreCard";
import { MatchScoreCard } from "@/components/liff/MatchScoreCard";

interface HubHeroSectionProps {
  teamName?: string;
  isDemo?: boolean;
  userId?: string;
  userName?: string;
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
  eventsList?: any[];
  latestMatch?: MatchCardData | null;
  isLoading?: boolean;
}

export function HubHeroSection({
  teamName = "チーム",
  isDemo = false,
  userId,
  userName,
  nextEvent,
  eventsList = [],
  latestMatch,
  isLoading = false,
}: HubHeroSectionProps) {
  const [activeTab, setActiveTab] = useState<"next" | "calendar" | "score">("next");

  // ユーザーの立場とお子様リスト
  const [userRole, setUserRole] = useState<"parent" | "coach" | "player" | "staff">("parent");
  const [children, setChildren] = useState<Array<{ id: string; name: string; uniformNumber?: string; parentName?: string }>>([]);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [memberName, setMemberName] = useState<string | null>(null);

  // 出欠ステート（保護者本人 & お子様）
  const [attendanceMap, setAttendanceMap] = useState<Record<string, "present" | "absent" | "pending" | "late">>({});
  const [childAttendanceMap, setChildAttendanceMap] = useState<Record<string, Record<string, "present" | "absent" | "pending" | "late">>>({});
  const [carStatusMap, setCarStatusMap] = useState<Record<string, "can_drive" | "need_ride" | "not_needed">>({});

  // 👨‍👦 DBの親子関係・お子様データおよび出欠の自動取得
  const fetchFamilyData = async () => {
    try {
      const tid = localStorage.getItem("iscore_selectedTeamId") || "demo-team";
      const uid = userId || (typeof window !== "undefined" ? (localStorage.getItem("iscore_user_id") || localStorage.getItem("iscore_userId") || "") : "");
      const uName = userName || (typeof window !== "undefined" ? (localStorage.getItem("iscore_user_name") || "") : "");

      const res = await fetch(`/api/liff/my-family?teamId=${tid}&userId=${uid}&userName=${encodeURIComponent(uName)}`);
      if (res.ok) {
        const json = await res.json() as any;
        if (json.success) {
          if (json.memberId) setMemberId(json.memberId);
          if (json.memberName) setMemberName(json.memberName);

          if (Array.isArray(json.children) && json.children.length > 0) {
            // 重複排除
            const uniqueChildren: typeof json.children = [];
            const seen = new Set<string>();
            for (const c of json.children) {
              if (!seen.has(c.id)) {
                seen.add(c.id);
                uniqueChildren.push(c);
              }
            }
            setChildren(uniqueChildren);
          } else if (isDemo || tid === "demo-team") {
            setChildren([{ id: "demo-player-1", name: "山田 翔太", uniformNumber: "#10" }]);
          } else {
            setChildren([]);
          }

          if (json.attendances) {
            setChildAttendanceMap(prev => ({ ...json.attendances, ...prev }));
          }

          // 自分の出欠（親の出欠）をDBから復元
          if (json.parentAttendances && Object.keys(json.parentAttendances).length > 0) {
            setAttendanceMap(prev => ({ ...json.parentAttendances, ...prev }));
          }
        }
      }
    } catch (err) {
      console.error("Failed to load family data:", err);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    fetchFamilyData();
  }, [isDemo, teamName, userId, userName]);

  // eventsListから初期出欠ステータスを読み込む (有効な回答のみを安全にマージ)
  useEffect(() => {
    if (Array.isArray(eventsList) && eventsList.length > 0) {
      const initialMap: Record<string, "present" | "absent" | "pending" | "late"> = {};
      for (const ev of eventsList) {
        if (ev.id && ev.myStatus && ev.myStatus !== "pending") {
          initialMap[ev.id] = ev.myStatus;
        }
      }
      if (Object.keys(initialMap).length > 0) {
        setAttendanceMap(prev => ({ ...initialMap, ...prev }));
      }
    }
  }, [eventsList]);

  const getEventAttendance = (id: string) => {
    if (attendanceMap[id] && attendanceMap[id] !== "pending") {
      return attendanceMap[id];
    }
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem(`iscore_my_att_${id}`);
      if (cached && (cached === "present" || cached === "absent" || cached === "late")) {
        return cached as any;
      }
    }
    return attendanceMap[id] || "pending";
  };

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

  const getEventCarStatus = (id: string) => carStatusMap[id] || "need_ride";

  // 保護者本人の出欠変更（DB保存 & 即時反映）
  const setEventAttendance = async (id: string, status: "present" | "absent" | "pending" | "late") => {
    setAttendanceMap(prev => ({ ...prev, [id]: status }));
    if (typeof window !== "undefined") {
      localStorage.setItem(`iscore_my_att_${id}`, status);
    }
    try {
      const uid = typeof window !== "undefined" 
        ? (localStorage.getItem("iscore_user_id") || localStorage.getItem("iscore_userId") || "") 
        : "";
      await fetch("/api/liff/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: id,
          userId: uid,
          memberId: memberId || undefined,
          status,
          hasCar: carStatusMap[id] === "can_drive",
        }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  // お子様（選手）の出欠変更（DB保存）
  const setChildAttendance = async (eventId: string, childId: string, status: "present" | "absent" | "pending" | "late") => {
    setChildAttendanceMap(prev => ({
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
    } catch (e) {
      console.error(e);
    }
  };

  const setEventCarStatus = (id: string, carStatus: "can_drive" | "need_ride" | "not_needed") => {
    setCarStatusMap(prev => ({ ...prev, [id]: carStatus }));
    const currentAtt = attendanceMap[id];
    if (currentAtt) {
      setEventAttendance(id, currentAtt);
    }
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 📅 直近の土曜日〜金曜日の活動予定を算出 (useMemoでメモ化しチラつき防止)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const { periodLabel: weeklyPeriodLabel, events: weeklyEvents } = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0(日) - 6(土)
    
    // 土曜日までの日数（日曜日なら昨日(土)から、それ以外は今週土曜〜来週金曜）
    let offsetToSat = (6 - dayOfWeek + 7) % 7;
    if (dayOfWeek === 0) {
      offsetToSat = -1;
    }
    
    const satDate = new Date(now);
    satDate.setDate(now.getDate() + offsetToSat);
    satDate.setHours(0, 0, 0, 0);

    const friDate = new Date(satDate);
    friDate.setDate(satDate.getDate() + 6);
    friDate.setHours(23, 59, 59, 999);

    const satStr = `${satDate.getMonth() + 1}/${satDate.getDate()}`;
    const friStr = `${friDate.getMonth() + 1}/${friDate.getDate()}`;
    const periodLabel = `${satStr}(土)〜${friStr}(金)`;

    const extractTime = (val: any) => {
      if (!val) return null;
      if (typeof val === "string") {
        const match = val.match(/T?(\d{2}):(\d{2})/);
        if (match) return `${match[1]}:${match[2]}`;
      }
      try {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        }
      } catch {}
      return null;
    };

    if (eventsList && eventsList.length > 0) {
      const filtered = eventsList.filter(ev => {
        const d = new Date(ev.startAt || ev.dateStr);
        return d >= satDate && d <= friDate;
      });

      const mapEventData = (ev: any) => {
        const hasPm = ev.hasPm !== undefined ? ev.hasPm : (!!ev.pmStartAt || !!ev.pmLocation || !!ev.pmTime);
        
        // 午前時間の算出
        let amTime = ev.amTime;
        if (!amTime) {
          const sHHMM = extractTime(ev.startAt) || "08:00";
          const eHHMM = extractTime(ev.endAt);
          const pmSHHMM = extractTime(ev.pmStartAt);
          amTime = hasPm
            ? (eHHMM && pmSHHMM && eHHMM <= pmSHHMM ? `${sHHMM}〜${eHHMM}` : `${sHHMM}〜12:00`)
            : (eHHMM ? `${sHHMM}〜${eHHMM}` : `${sHHMM}〜12:00`);
        }

        // 午後時間の算出
        let pmTime = ev.pmTime;
        if (!pmTime && hasPm) {
          const pmSHHMM = extractTime(ev.pmStartAt) || "13:00";
          const pmEHHMM = extractTime(ev.pmEndAt) || extractTime(ev.endAt) || "17:00";
          pmTime = `${pmSHHMM}〜${pmEHHMM}`;
        }

        const amLocation = ev.amLocation || ev.location || "グラウンド";
        const pmLocation = ev.pmLocation || (hasPm && ev.pmLocation !== null ? (ev.pmLocation || "") : "");

        // 🚗 配車は練習の場合は無し（試合・合宿または明示的な配車のみ）
        const isMatchOrCamp = ev.eventType === "match" || ev.eventType === "camp" || ev.amType === "match" || ev.pmType === "match";
        let carInfo = "";
        if (isMatchOrCamp) {
          carInfo = ev.carInfo || "配車調整中";
        } else if (ev.carInfo && ev.carInfo !== "配車調整中" && ev.carInfo !== "配車なし") {
          carInfo = ev.carInfo;
        }

        return {
          id: ev.id,
          title: ev.title || "活動予定",
          date: ev.date || `${new Date(ev.startAt || ev.dateStr).getMonth() + 1}/${new Date(ev.startAt || ev.dateStr).getDate()}(${["日", "月", "火", "水", "木", "金", "土"][new Date(ev.startAt || ev.dateStr).getDay()]})`,
          hasPm,
          eventType: (ev.amType || ev.eventType || "practice") as "match" | "practice" | "camp" | "off",
          time: amTime,
          location: amLocation,
          amType: (ev.amType || ev.eventType || "practice") as "match" | "practice" | "camp" | "off",
          amTime,
          amLocation,
          pmType: (ev.pmType || (hasPm ? (ev.eventType || "practice") : "off")) as "match" | "practice" | "camp" | "off",
          pmTime: hasPm ? (pmTime || "13:00〜17:00") : "",
          pmLocation: hasPm ? (pmLocation || amLocation) : "",
          targetGroup: ev.targetGroup || (ev.title?.match(/\[(.*?)\]/)?.[1] || "全体"),
          dutyGroup: ev.dutyGroup || "1班",
          carInfo,
          needsLunch: ev.needsLunch !== undefined ? ev.needsLunch : (hasPm || isMatchOrCamp),
          needsSnack: ev.needsSnack !== undefined ? ev.needsSnack : false,
          memo: ev.memo || ev.description || "",
        };
      };

      if (filtered.length > 0) {
        return {
          periodLabel,
          events: filtered.map(mapEventData)
        };
      }

      // 実チームで期間内の予定がない場合、直近の直近イベントを表示
      return {
        periodLabel,
        events: eventsList.slice(0, 3).map(mapEventData)
      };
    }

    // 実チームで予定がない場合は空配列を返す（デモ予定は出さない）
    if (!isDemo) {
      return { periodLabel, events: [] };
    }

    // デモチームの場合のみデフォルト活動を表示
    const defaultEvents = [
      {
        id: "ev-sat-1",
        title: "秋季大会 2回戦 vs レッドソックス",
        date: `${satStr}(土)`,
        hasPm: false,
        eventType: "match" as const,
        time: "08:00〜12:00",
        location: "市民第1球場",
        amType: "match" as const,
        amTime: "08:00〜12:00",
        amLocation: "市民第1球場",
        pmType: "off" as const,
        pmTime: "",
        pmLocation: "",
        targetGroup: "Aチーム",
        dutyGroup: "1班",
        carInfo: "鈴木号・佐藤号",
        needsLunch: false,
        needsSnack: true,
        memo: "ユニフォーム正装・スパイク着用。雨天時は7:00にLINE連絡します。",
      },
      {
        id: "ev-sun-2",
        title: "全日通常練習 & 守備連携・走塁強化",
        date: `${new Date(satDate.getTime() + 86400000).getMonth() + 1}/${new Date(satDate.getTime() + 86400000).getDate()}(日)`,
        hasPm: true,
        eventType: "practice" as const,
        time: "08:00〜17:00",
        location: "大師河原第3G",
        amType: "practice" as const,
        amTime: "08:00〜12:00",
        amLocation: "大師河原第3G",
        pmType: "practice" as const,
        pmTime: "13:00〜17:00",
        pmLocation: "大師河原第3G",
        targetGroup: "全体",
        dutyGroup: "2班",
        carInfo: "", // 練習時は配車なし
        needsLunch: true,
        needsSnack: false,
        memo: "水分補給のドリンク多めに持参してください。",
      },
    ];

    return { periodLabel, events: defaultEvents };
  }, [eventsList, isDemo]);

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
          needsLunch: ev.needsLunch !== undefined ? Boolean(ev.needsLunch) : isMatch,
          needsSnack: ev.needsSnack !== undefined ? Boolean(ev.needsSnack) : false,
          memo: ev.description || ev.memo || "",
          carInfo: ev.carInfo,
        };
      });
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
  }, [eventsList]);

  // 当日予定と今後の予定の切り分け
  const todayCalendarEvents = allParsedEvents.filter(e => e.dateStr === todayStr);
  const futureCalendarEvents = allParsedEvents.filter(e => e.dateStr !== todayStr && e.dateStr >= todayStr).slice(0, 5);
  // もし未来の予定がなければ直近の全件
  const upcomingEvents = futureCalendarEvents.length > 0 ? futureCalendarEvents : allParsedEvents.slice(0, 5);

  // 日付ごとのイベント状態
  const getDateEvent = (dStr: string) => {
    return allParsedEvents.find(e => e.dateStr === dStr);
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
      {/* 🌟 1. 上部セグメントタブ（カラーテーマ完全連動） */}
      <div className="flex items-center p-1 bg-primary/10 dark:bg-primary/15 backdrop-blur-md rounded-2xl border border-primary/20 dark:border-primary/25 shadow-xs">
        <button
          type="button"
          onClick={() => setActiveTab("next")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs font-black transition-all active:scale-95 ${
            activeTab === "next"
              ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25 font-black ring-1 ring-primary/30"
              : "text-foreground/75 hover:text-primary hover:bg-primary/10 font-bold"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>直近の活動 ({weeklyEvents.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("calendar")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs font-black transition-all active:scale-95 ${
            activeTab === "calendar"
              ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25 font-black ring-1 ring-primary/30"
              : "text-foreground/75 hover:text-primary hover:bg-primary/10 font-bold"
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
              ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25 font-black ring-1 ring-primary/30"
              : "text-foreground/75 hover:text-primary hover:bg-primary/10 font-bold"
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          <span>試合速報</span>
        </button>
      </div>

      {/* 🌟 2. タブごとのカードコンテンツ */}

      {/* 🅰️ 【直近の活動日カルーセル】 */}
      {activeTab === "next" && (
        <div className="space-y-2 animate-in fade-in duration-200">
          {/* カルーセル期間ヘッダー & スワイプ案内 */}
          <div className="flex items-center justify-between px-1 text-xs">
            <span className="font-extrabold text-muted-foreground flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-primary" />
              <span>対象期間: <strong className="text-foreground">{weeklyPeriodLabel}</strong></span>
            </span>
            {weeklyEvents.length > 1 && (
              <span className="text-[11px] font-black text-primary flex items-center gap-0.5">
                <span>横スライドで確認 ({weeklyEvents.length}件)</span>
                <ChevronRight className="w-3.5 h-3.5 animate-pulse" />
              </span>
            )}
          </div>

          {/* 🌟 スケルトンローディング中表示 */}
          {isLoading ? (
            <div className="flex overflow-x-auto gap-3 -mx-4 px-4 pb-1 pt-0.5">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="w-[88vw] max-w-[360px] shrink-0 rounded-3xl bg-white dark:bg-slate-900 border-2 border-slate-200/80 dark:border-slate-800 p-4 space-y-4 animate-pulse shadow-md ring-1 ring-black/5"
                >
                  <div className="flex justify-between items-center">
                    <div className="h-5 w-20 bg-slate-200 dark:bg-slate-800 rounded-full" />
                    <div className="h-4 w-12 bg-slate-200 dark:bg-slate-800 rounded" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-6 w-32 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                    <div className="h-4 w-48 bg-slate-200 dark:bg-slate-800 rounded" />
                  </div>
                  <div className="h-20 bg-slate-100 dark:bg-slate-800/60 rounded-2xl" />
                  <div className="h-24 bg-slate-100 dark:bg-slate-800/60 rounded-2xl" />
                </div>
              ))}
            </div>
          ) : weeklyEvents.length === 0 ? (
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm text-center space-y-2 ring-1 ring-black/5">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center">
                <Calendar className="w-5 h-5" />
              </div>
              <p className="text-sm font-black text-slate-800 dark:text-slate-200">この期間の活動予定はありません</p>
              <p className="text-xs text-slate-500 font-bold">予定が登録されるとここに表示されます</p>
              <div className="pt-2">
                <Link
                  href="/liff/schedule"
                  className="inline-flex items-center gap-1 px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-black shadow-xs active:scale-95"
                >
                  <span>全予定カレンダーを見る</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ) : (
            /* 横スクロール カルーセルコンテナ */
            <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none gap-3 -mx-4 px-4 pb-1 pt-0.5">
              {weeklyEvents.map((ev, idx) => {
                const pStatus = getEventAttendance(ev.id);
                const cStatus = getEventCarStatus(ev.id);

                return (
                  <div
                    key={ev.id}
                    className="w-[88vw] max-w-[360px] shrink-0 snap-center rounded-3xl bg-white dark:bg-slate-900 border-2 border-slate-200/90 dark:border-slate-800 shadow-md shadow-black/5 p-4 space-y-3.5 flex flex-col justify-between ring-1 ring-black/5"
                  >
                  <div className="space-y-3">
                    {/* 上部ヘッダー：日程・日付 & 対象チーム & 全予定リンク */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-black text-foreground tracking-tight">
                          {ev.date}
                        </span>

                        {/* 🎯 対象チーム・グループバッジ（Aチーム/Bチーム/全体など） */}
                        {ev.targetGroup && ev.targetGroup !== "全体" && (
                          <span className="px-2 py-0.5 rounded-lg bg-primary/15 text-primary text-[10.5px] font-black border border-primary/30 shrink-0">
                            🏷️ {ev.targetGroup}
                          </span>
                        )}

                        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold">
                          {idx + 1} / {weeklyEvents.length}
                        </span>
                      </div>

                      <Link href="/liff/schedule" className="text-xs font-black text-primary hover:underline flex items-center gap-0.5">
                        <span>全予定</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>

                    {/* タイトル（大会名や練習内容） */}
                    <h3 className="text-sm font-black text-foreground line-clamp-1">
                      {ev.title}
                    </h3>

                    {/* ☀️ 午前（左） ＆ 🌙 午後（右）の2カラム表示 */}
                    <div className="grid grid-cols-2 gap-2">
                      {/* ☀️ 【午前】（左） */}
                      <div className="p-2.5 rounded-2xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 flex flex-col justify-between space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-amber-700 dark:text-amber-300 flex items-center gap-1">
                            <Sun className="w-3 h-3 text-amber-500" />
                            <span>午前</span>
                          </span>

                          {/* ① 活動内容バッジ */}
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                            ev.amType === "match"
                              ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                              : ev.amType === "camp"
                              ? "bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30"
                              : "bg-primary/15 text-primary border border-primary/30"
                          }`}>
                            {ev.amType === "match" ? "⚾ 試合" : ev.amType === "camp" ? "🏕️ 合宿" : "🏃 練習"}
                          </span>
                        </div>

                        {/* ② 活動時間 */}
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1 text-xs font-black text-foreground">
                            <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                            <span>{ev.amTime || "08:00〜12:00"}</span>
                          </div>

                          {/* ③ 場所 */}
                          <div className="flex items-center gap-1 text-[11px] font-bold text-foreground/90 truncate">
                            <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
                            <span className="truncate">{ev.amLocation || "グラウンド"}</span>
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

                          {/* ① 活動内容バッジ */}
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

                        {/* ② 活動時間 */}
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1 text-xs font-black text-foreground">
                            <Clock className="w-3 h-3 text-indigo-500 shrink-0" />
                            <span>{ev.hasPm && ev.pmTime ? ev.pmTime : "解散・なし"}</span>
                          </div>

                          {/* ③ 場所 */}
                          <div className="flex items-center gap-1 text-[11px] font-bold text-foreground/90 truncate">
                            <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
                            <span className="truncate">{ev.hasPm && ev.pmLocation ? ev.pmLocation : (ev.hasPm ? ev.amLocation : "—")}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 📋 その他の詳細情報ブロック（上から：お弁当・補食、連絡事項、配車、当番） */}
                    <div className="p-3 rounded-2xl bg-muted/40 border border-border/80 space-y-2 text-xs">
                      {/* 1. お弁当 & 補食 */}
                      <div className="grid grid-cols-2 gap-2 font-bold">
                        {/* お弁当 */}
                        <div className="flex items-center justify-between p-1.5 rounded-xl bg-background/50 border border-border/40">
                          <span className="text-muted-foreground flex items-center gap-1 text-[10.5px]">
                            <Utensils className="w-3 h-3 text-amber-500" />
                            <span>お弁当</span>
                          </span>
                          <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-black ${
                            ev.needsLunch
                              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                              : "text-muted-foreground"
                          }`}>
                            {ev.needsLunch ? "🍙 要" : "不要"}
                          </span>
                        </div>

                        {/* 補食 */}
                        <div className="flex items-center justify-between p-1.5 rounded-xl bg-background/50 border border-border/40">
                          <span className="text-muted-foreground flex items-center gap-1 text-[10.5px]">
                            <span className="text-xs leading-none">🍌</span>
                            <span>補食</span>
                          </span>
                          <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-black ${
                            ev.needsSnack
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                              : "text-muted-foreground"
                          }`}>
                            {ev.needsSnack ? "🍌 要" : "不要"}
                          </span>
                        </div>
                      </div>

                      {/* 2. 連絡事項・メモ（常に表示、ない場合は「特になし」） */}
                      <div className="pt-1.5 border-t border-border/60 space-y-0.5">
                        <span className="text-[10px] font-black text-muted-foreground flex items-center gap-1">
                          <FileText className="w-3 h-3 text-primary" />
                          <span>連絡事項</span>
                        </span>
                        <p className={`text-[11px] font-bold p-2 rounded-xl border border-border/50 ${
                          ev.memo ? "text-foreground/90 bg-background/60" : "text-muted-foreground bg-muted/20"
                        }`}>
                          {ev.memo || "特になし"}
                        </p>
                      </div>

                      {/* 3. 配車（練習の場合は無し、試合・合宿の場合は配車情報 ＆ 配車表リンク） */}
                      <div className="pt-1.5 border-t border-border/60 flex items-center justify-between font-bold">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Car className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="text-muted-foreground shrink-0">配車:</span>
                          <span className="text-foreground truncate font-black text-[11px]">
                            {ev.carInfo ? ev.carInfo : "なし（現地集合）"}
                          </span>
                        </div>

                        {ev.carInfo ? (
                          <Link
                            href="/liff/carpool"
                            className="text-[10.5px] font-black text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5 shrink-0 ml-2"
                          >
                            <span>配車表へ</span>
                            <ChevronRight className="w-3 h-3" />
                          </Link>
                        ) : null}
                      </div>

                      {/* 4. 一番下に当番 */}
                      {ev.dutyGroup && (
                        <div className="pt-1.5 border-t border-border/60 flex items-center justify-between text-[11px] font-bold">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-primary" />
                            <span>当番</span>
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/25 font-black">
                            👥 {ev.dutyGroup}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 出欠回答エリア (○, △, ×, ？) */}
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
                              onClick={() => setChildAttendance(ev.id, child.id, "present")}
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
                              onClick={() => setChildAttendance(ev.id, child.id, "late")}
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
                              onClick={() => setChildAttendance(ev.id, child.id, "absent")}
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
                              onClick={() => setChildAttendance(ev.id, child.id, "pending")}
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
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-black text-foreground">
                          {userRole === "parent" ? "👨 保護者（自分）の参加・当番" : "あなたの出欠回答"}
                        </span>
                        <span className="text-[11px] font-bold">
                          {pStatus === "present" && <span className="text-emerald-600 dark:text-emerald-400 font-black">○ {userRole === "parent" ? "参加・当番可" : "出席"}</span>}
                          {pStatus === "late" && <span className="text-amber-600 dark:text-amber-400 font-black">△ 調整</span>}
                          {pStatus === "absent" && <span className="text-rose-600 dark:text-rose-400 font-black">× 欠席</span>}
                          {pStatus === "pending" && <span className="text-muted-foreground font-black">？ 未定</span>}
                        </span>
                      </div>

                      {/* ○, △, ×, ？ の4等分グリッド */}
                      <div className="grid grid-cols-4 gap-1.5">
                        {/* ○ 出席 */}
                        <button
                          type="button"
                          onClick={() => setEventAttendance(ev.id, "present")}
                          className={`flex flex-col items-center justify-center py-2 rounded-2xl text-xs font-black transition-all active:scale-95 ${
                            pStatus === "present"
                              ? "bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-500/50"
                              : "bg-muted/70 hover:bg-muted text-muted-foreground"
                          }`}
                        >
                          <span className="text-base leading-none mb-0.5">○</span>
                          <span className="text-[10px]">{userRole === "parent" ? "参加/当番" : "出席"}</span>
                        </button>

                        {/* △ 調整 / 遅刻 */}
                        <button
                          type="button"
                          onClick={() => setEventAttendance(ev.id, "late")}
                          className={`flex flex-col items-center justify-center py-2 rounded-2xl text-xs font-black transition-all active:scale-95 ${
                            pStatus === "late"
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
                          onClick={() => setEventAttendance(ev.id, "absent")}
                          className={`flex flex-col items-center justify-center py-2 rounded-2xl text-xs font-black transition-all active:scale-95 ${
                            pStatus === "absent"
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
                          onClick={() => setEventAttendance(ev.id, "pending")}
                          className={`flex flex-col items-center justify-center py-2 rounded-2xl text-xs font-black transition-all active:scale-95 ${
                            pStatus === "pending"
                              ? "bg-slate-700 text-white dark:bg-slate-300 dark:text-slate-900 shadow-xs ring-2 ring-slate-500/50"
                              : "bg-muted/70 hover:bg-muted text-muted-foreground"
                          }`}
                        >
                          <span className="text-base leading-none mb-0.5">？</span>
                          <span className="text-[10px]">未定</span>
                        </button>
                      </div>
                    </div>

                    {/* 参加時の配車アンケート (※試合・遠征時のみ表示) */}
                    {(ev.eventType === "match" || (ev.title && (ev.title.includes("試合") || ev.title.includes("遠征") || ev.title.includes("大会") || ev.title.includes("vs")))) && (pStatus === "present" || pStatus === "late") && (
                      <div className="p-2.5 rounded-2xl bg-primary/5 border border-primary/20 space-y-1.5 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between text-[11px] font-bold text-foreground">
                          <span className="flex items-center gap-1">
                            <Car className="w-3 h-3 text-primary" />
                            <span>配車・移動手段 (試合・遠征)</span>
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEventCarStatus(ev.id, "can_drive")}
                            className={`py-1.5 px-1 rounded-xl text-[10px] font-bold border transition-all ${
                              cStatus === "can_drive"
                                ? "bg-primary text-primary-foreground border-primary shadow-xs font-black"
                                : "bg-card border-border/80 text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            🚗 車出し可
                          </button>

                          <button
                            type="button"
                            onClick={() => setEventCarStatus(ev.id, "need_ride")}
                            className={`py-1.5 px-1 rounded-xl text-[10px] font-bold border transition-all ${
                              cStatus === "need_ride"
                                ? "bg-primary text-primary-foreground border-primary shadow-xs font-black"
                                : "bg-card border-border/80 text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            🙋 送迎希望
                          </button>

                          <button
                            type="button"
                            onClick={() => setEventCarStatus(ev.id, "not_needed")}
                            className={`py-1.5 px-1 rounded-xl text-[10px] font-bold border transition-all ${
                              cStatus === "not_needed"
                                ? "bg-primary text-primary-foreground border-primary shadow-xs font-black"
                                : "bg-card border-border/80 text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            🚶 自走・不要
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>
      )}

      {/* 🅱️ 【チームカレンダー】カード（月間カレンダー ＋ 当日＆直近の日程一覧） */}
      {activeTab === "calendar" && (
        <div className="relative overflow-hidden rounded-3xl bg-card border-2 border-primary/25 dark:border-primary/30 shadow-md shadow-primary/5 p-3.5 space-y-3 animate-in fade-in duration-200">
          
          {/* ━━ 1. カレンダーヘッダー（年月切り替え & 今日ボタン） ━━ */}
          <div className="flex items-center justify-between pb-1 border-b border-primary/15">
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
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground active:scale-95 transition-all"
                title="前月"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground active:scale-95 transition-all"
                title="翌月"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleToday}
                className="px-2 py-0.5 text-[10px] font-black rounded-lg bg-muted hover:bg-muted/80 text-foreground border border-border/60 active:scale-95 transition-all ml-1"
              >
                今日
              </button>
            </div>
          </div>

          {/* ━━ 2. 曜日ヘッダー ━━ */}
          <div className="grid grid-cols-7 text-center text-[10px] font-black text-muted-foreground uppercase pb-0.5 border-b border-primary/10">
            {weekDays.map((day, idx) => (
              <span key={day} className={cn(idx === 0 && "text-rose-500", idx === 6 && "text-blue-500")}>
                {day}
              </span>
            ))}
          </div>

          {/* ━━ 3. 日付グリッド (42マス・高さをスリム化) ━━ */}
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
                    !day.isCurrentMonth && "text-muted-foreground/25",
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

          {/* ━━ 4. 予定一覧（当日の予定 ＆ 直近の予定切り分け） ━━ */}
          <div className="pt-2.5 border-t border-primary/15 space-y-3">
            
            {/* 🔴 【当日の活動予定】（今日予定がある場合に大きく切り分け表示） */}
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
                      className="block p-2.5 rounded-2xl bg-rose-500/5 dark:bg-rose-500/10 border-2 border-rose-500/30 hover:border-rose-500/50 transition-all group"
                    >
                      <div className="flex items-start gap-2.5">
                        {/* 均一幅（58px固定）の日付・種別バッジ */}
                        <div className="w-[58px] min-w-[58px] max-w-[58px] shrink-0 px-1 py-1 rounded-xl bg-rose-500 text-white flex flex-col items-center justify-center shadow-xs">
                          <span className="text-[11px] font-black leading-tight">本日</span>
                          <span className="text-[9px] font-bold mt-0.5 opacity-90">
                            {ev.type === "match" ? "⚾ 試合" : "🏃 練習"}
                          </span>
                        </div>

                        {/* タイトル & 午前午後（時間・場所） */}
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

                          {/* 午前・午後の時間と場所 */}
                          <div className="space-y-1 text-[10.5px]">
                            {/* 午前 */}
                            <div className="flex items-center gap-2 font-bold text-foreground/90">
                              <span className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[9.5px] font-black shrink-0">
                                ☀️ 午前
                              </span>
                              <span className="flex items-center gap-1 shrink-0 text-muted-foreground">
                                <Clock className="w-3 h-3 text-amber-500" />
                                <span>{ev.amTime}</span>
                              </span>
                              <span className="flex items-center gap-1 truncate text-foreground">
                                <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
                                <span className="truncate">{ev.amLocation}</span>
                              </span>
                            </div>

                            {/* 午後（設定がある場合） */}
                            {ev.hasPm && (
                              <div className="flex items-center gap-2 font-bold text-foreground/90">
                                <span className="px-1.5 py-0.2 rounded bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[9.5px] font-black shrink-0">
                                  🌙 午後
                                </span>
                                <span className="flex items-center gap-1 shrink-0 text-muted-foreground">
                                  <Clock className="w-3 h-3 text-indigo-500" />
                                  <span>{ev.pmTime || "13:00〜17:00"}</span>
                                </span>
                                <span className="flex items-center gap-1 truncate text-foreground">
                                  <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
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
                    className="block p-2.5 rounded-2xl bg-muted/40 hover:bg-muted/70 border border-primary/15 transition-all group"
                  >
                    <div className="flex items-start gap-2.5">
                      {/* 均一幅（58px固定）の日付・種別バッジ */}
                      <div className={`w-[58px] min-w-[58px] max-w-[58px] shrink-0 px-1 py-1 rounded-xl flex flex-col items-center justify-center ${
                        ev.type === "match" 
                          ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/25" 
                          : "bg-primary/10 text-primary border border-primary/25"
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
                            <span className="px-1 py-0.2 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[9px] font-black shrink-0">
                              ☀️ 午前
                            </span>
                            <span className="flex items-center gap-0.5 shrink-0 text-muted-foreground">
                              <Clock className="w-2.5 h-2.5 text-amber-500" />
                              <span>{ev.amTime}</span>
                            </span>
                            <span className="flex items-center gap-0.5 truncate text-foreground">
                              <MapPin className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                              <span className="truncate">{ev.amLocation}</span>
                            </span>
                          </div>

                          {/* 午後（設定がある場合） */}
                          {ev.hasPm && (
                            <div className="flex items-center gap-1.5 font-bold text-foreground/90">
                              <span className="px-1 py-0.2 rounded bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-[9px] font-black shrink-0">
                                🌙 午後
                              </span>
                              <span className="flex items-center gap-0.5 shrink-0 text-muted-foreground">
                                <Clock className="w-2.5 h-2.5 text-indigo-500" />
                                <span>{ev.pmTime || "13:00〜17:00"}</span>
                              </span>
                              <span className="flex items-center gap-0.5 truncate text-foreground">
                                <MapPin className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
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
      )}

      {/* 🅲 【試合速報】カード（本家同様のMatchScoreCard） */}
      {activeTab === "score" && (
        <div className="space-y-2 animate-in fade-in duration-200">
          <div className="flex items-center justify-between px-1 text-xs">
            <span className="font-extrabold text-muted-foreground flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-primary" />
              <span>最新の試合速報</span>
            </span>
            <Link
              href="/liff/matches"
              className="text-[11px] font-black text-primary hover:underline flex items-center gap-0.5"
            >
              <span>試合一覧・動画</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <MatchScoreCard match={recentMatch as any} teamName={teamName} initialExpanded={true} />
        </div>
      )}
    </div>
  );
}
