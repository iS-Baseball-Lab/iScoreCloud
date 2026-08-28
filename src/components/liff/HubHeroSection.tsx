// filepath: src/components/liff/HubHeroSection.tsx
"use client";

import React, { useState, useEffect } from "react";
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
  eventsList?: any[];
  latestMatch?: MatchCardData | null;
}

export function HubHeroSection({
  teamName = "チーム",
  nextEvent,
  eventsList = [],
  latestMatch,
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
      const uid = localStorage.getItem("iscore_user_id") || localStorage.getItem("iscore_userId") || "";
      const uName = localStorage.getItem("iscore_user_name") || "";

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
          } else {
            setChildren([{ id: "demo-player-1", name: "山田 翔太", uniformNumber: "#10" }]);
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
  }, []);

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
  // 📅 直近の土曜日〜金曜日の活動予定を算出
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const getWeeklyEvents = () => {
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

    if (eventsList && eventsList.length > 0) {
      const filtered = eventsList.filter(ev => {
        const d = new Date(ev.startAt || ev.dateStr);
        return d >= satDate && d <= friDate;
      });

      if (filtered.length > 0) {
        return {
          periodLabel,
          events: filtered.map(ev => ({
            id: ev.id,
            title: ev.title || "活動予定",
            date: ev.date || `${new Date(ev.startAt).getMonth() + 1}/${new Date(ev.startAt).getDate()}(${["日", "月", "火", "水", "木", "金", "土"][new Date(ev.startAt).getDay()]})`,
            time: ev.time || (ev.pmStartAt ? "08:00〜18:00" : "08:00〜12:00"),
            location: ev.location || "ホームグラウンド",
            eventType: (ev.eventType as any) || "practice",
            dutyGroup: ev.dutyGroup || "1班",
            carInfo: ev.carInfo || "配車調整中",
            needsLunch: ev.needsLunch !== undefined ? ev.needsLunch : !!ev.pmStartAt,
          }))
        };
      }
    }

    // デモまたはデータ未登録時のデフォルト直近土日活動
    const defaultEvents = [
      {
        id: "ev-sat-1",
        title: "秋季大会 2回戦 vs レッドソックス",
        date: `${satStr}(土)`,
        time: "08:00〜12:00",
        location: "市民第1球場",
        eventType: "match" as const,
        dutyGroup: "1班",
        carInfo: "鈴木号・佐藤号",
        needsLunch: false,
      },
      {
        id: "ev-sun-2",
        title: "全日通常練習 & 守備連携・走塁強化",
        date: `${new Date(satDate.getTime() + 86400000).getMonth() + 1}/${new Date(satDate.getTime() + 86400000).getDate()}(日)`,
        time: "08:00〜18:00",
        location: "大師河原第3G",
        eventType: "practice" as const,
        dutyGroup: "2班",
        carInfo: "配車調整中",
        needsLunch: true,
      },
    ];

    return { periodLabel, events: defaultEvents };
  };

  const { periodLabel: weeklyPeriodLabel, events: weeklyEvents } = getWeeklyEvents();

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

  // チームの直近予定リスト（カレンダー下部に表示）
  const upcomingEvents = eventsList.length > 0 ? eventsList.slice(0, 5) : [
    {
      id: "ev-1",
      date: "8/30(日)",
      dateStr: "2026-08-30",
      type: "match",
      title: "秋季大会 2回戦 vs レッドソックス",
      time: "08:00〜12:00",
      location: "市民第1球場",
      duty: "1班",
    },
    {
      id: "ev-2",
      date: "9/05(土)",
      dateStr: "2026-09-05",
      type: "practice",
      title: "午後通常練習 & 守備連携強化",
      time: "12:00〜18:00",
      location: "大師河原第3グラウンド",
      duty: "2班",
    },
  ];

  // 日付ごとのイベント状態
  const getDateEvent = (dStr: string) => {
    return upcomingEvents.find(e => (e.dateStr === dStr || e.startAt?.startsWith(dStr)));
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
      {/* 🌟 1. 上部セグメントタブ（活動予定 / カレンダー / 試合速報） */}
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
          <span>直近の活動 ({weeklyEvents.length})</span>
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

      {/* 🅰️ 【直近の活動日カルーセル】（次の土曜日〜金曜日の全活動予定を横スライド表示） */}
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

          {/* 横スクロール カルーセルコンテナ */}
          <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none gap-3 -mx-4 px-4 pb-1 pt-0.5">
            {weeklyEvents.map((ev, idx) => {
              const pStatus = getEventAttendance(ev.id);
              const cStatus = getEventCarStatus(ev.id);

              return (
                <div
                  key={ev.id}
                  className="w-[88vw] max-w-[360px] shrink-0 snap-center rounded-3xl bg-card border-2 border-primary/25 dark:border-primary/30 shadow-md shadow-primary/5 p-4 space-y-3.5 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    {/* 上部タグ & 日程番号 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black tracking-tight ${
                          ev.eventType === "match"
                            ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                            : ev.eventType === "camp"
                            ? "bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30"
                            : "bg-primary/15 text-primary border border-primary/30"
                        }`}>
                          {ev.eventType === "match" ? "⚾ 試合" : ev.eventType === "camp" ? "🏕️ 合宿" : "🏃 練習"}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold">
                          {idx + 1} / {weeklyEvents.length}
                        </span>
                      </div>

                      <span className="text-xs font-black text-primary flex items-center gap-0.5">
                        <Link href="/liff/schedule" className="hover:underline flex items-center">
                          <span>全予定</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                      </span>
                    </div>

                    {/* 日時 ＆ タイトル */}
                    <div className="space-y-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl font-black text-foreground tracking-tight">
                          {ev.date}
                        </span>
                        <span className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3 text-primary" />
                          <span>{ev.time}</span>
                        </span>
                      </div>
                      <h3 className="text-sm font-black text-foreground line-clamp-1">
                        {ev.title}
                      </h3>
                    </div>

                    {/* 詳細情報グリッド（球場・配車・お弁当・当番） */}
                    <div className="p-3 rounded-2xl bg-muted/40 border border-primary/15 space-y-2 text-xs">
                      <div className="flex items-center gap-2 font-bold">
                        <MapPin className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span className="text-foreground truncate">{ev.location}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-primary/15">
                        <div className="flex items-center gap-1.5 font-bold">
                          <Car className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <div className="min-w-0">
                            <span className="text-[10px] text-muted-foreground block">配車担当</span>
                            <span className="text-foreground truncate block">{ev.carInfo || "配車調整中"}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 font-bold">
                          <Utensils className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <div className="min-w-0">
                            <span className="text-[10px] text-muted-foreground block">お弁当</span>
                            <span className="text-foreground truncate block">
                              {ev.needsLunch ? "持参要" : "不要"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {ev.dutyGroup && (
                        <div className="pt-1.5 border-t border-primary/15 flex items-center justify-between text-[11px] font-bold">
                          <span className="text-muted-foreground">当番</span>
                          <span className="text-primary font-black">{ev.dutyGroup}</span>
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
