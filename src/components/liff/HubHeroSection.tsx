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
  ChevronDown,
  ChevronUp,
  Trophy, 
  Flame, 
  Video,
  Sparkles,
  CalendarDays,
  Info,
  Sun,
  Moon,
  FileText,
  Users,
  ClipboardList
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MatchCardData } from "@/components/liff/MatchScoreCard";
import { MatchScoreCard, MatchScoreCardSkeleton } from "@/components/liff/MatchScoreCard";
import { EventGroupAttendanceSummary } from "@/components/liff/EventGroupAttendanceSummary";
import { invalidateLiffApiCache } from "@/lib/liff/api-cache";
import {
  DEMO_GROUP_ATTEND_COUNT_LIST,
  type EventGroupAttendanceMap,
  type GroupAttendanceCounts,
  type GroupStatusConfigSummary,
} from "@/lib/liff/group-attendance";
import {
  PLAYER_CONDITION_META,
  loadDemoPlayerConditionOverrides,
  normalizePlayerConditionStatus,
  type PlayerConditionStatus,
} from "@/lib/liff/player-condition";

export interface HubEventInputItem {
  id: string;
  title?: string;
  date?: string;
  dateStr?: string;
  startAt?: string;
  endAt?: string;
  pmStartAt?: string | null;
  pmEndAt?: string | null;
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
  dutyGroup?: string;
  carInfo?: string;
  needsLunch?: boolean | number | string;
  needsSnack?: boolean | number | string;
  memo?: string;
  description?: string;
  myStatus?: "present" | "absent" | "pending" | "late";
  activityGroups?: Array<{
    id: string;
    name: string;
    time?: string;
    location?: string;
    eventType?: string;
    dutyGroup?: string;
  }>;
  attendCount?: Partial<GroupAttendanceCounts> | null;
  groupAttendCount?: EventGroupAttendanceMap | null;
}

interface FamilyChildItem {
  id: string;
  name: string;
  uniformNumber?: string;
  parentName?: string;
  conditionStatus?: PlayerConditionStatus;
}

interface MyFamilyApiResponse {
  success?: boolean;
  memberId?: string | null;
  memberName?: string | null;
  children?: FamilyChildItem[];
  attendances?: Record<string, Record<string, "present" | "absent" | "pending" | "late">>;
  parentAttendances?: Record<string, "present" | "absent" | "pending" | "late">;
}

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
  eventsList?: HubEventInputItem[];
  latestMatch?: MatchCardData | null;
  isLoading?: boolean;
  attendanceStatusConfig?: GroupStatusConfigSummary;
  onRefreshHub?: () => void;
}

export function HubHeroSection({
  teamName = "チーム",
  isDemo = false,
  userId,
  userName,
  nextEvent: _nextEvent,
  eventsList = [],
  latestMatch,
  isLoading = false,
  attendanceStatusConfig,
  onRefreshHub,
}: HubHeroSectionProps) {
  const [activeTab, setActiveTab] = useState<"score" | "next">("score");

  // ユーザーの立場とお子様リスト
  const [userRole, setUserRole] = useState<"parent" | "coach" | "player" | "staff">("parent");
  const [children, setChildren] = useState<FamilyChildItem[]>([]);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [memberName, setMemberName] = useState<string | null>(null);

  // 出欠ステート（保護者本人 & お子様）
  const [attendanceMap, setAttendanceMap] = useState<Record<string, "present" | "absent" | "pending" | "late">>({});
  const [childAttendanceMap, setChildAttendanceMap] = useState<Record<string, Record<string, "present" | "absent" | "pending" | "late">>>({});
  const [carStatusMap, setCarStatusMap] = useState<Record<string, "can_drive" | "need_ride" | "not_needed">>({});

  // 📝 連絡事項のアコーディオン展開ステート (eventId -> boolean)
  const [expandedMemos, setExpandedMemos] = useState<Record<string, boolean>>({});
  const toggleMemo = (eventId: string) => {
    setExpandedMemos(prev => ({
      ...prev,
      [eventId]: !prev[eventId]
    }));
  };

  // 📋 出欠欄のアコーディオン展開ステート (eventId -> boolean, デフォルト全閉じ)
  const [expandedAttendance, setExpandedAttendance] = useState<Record<string, boolean>>({});
  const toggleAttendance = (eventId: string) => {
    setExpandedAttendance(prev => ({
      ...prev,
      [eventId]: !prev[eventId]
    }));
  };

  // 👨‍👦 DBの親子関係・お子様データおよび出欠の自動取得
  const fetchFamilyData = async () => {
    try {
      const tid = localStorage.getItem("iscore_selectedTeamId") || "demo-team";
      const uid = userId || (typeof window !== "undefined" ? (localStorage.getItem("iscore_user_id") || localStorage.getItem("iscore_userId") || "") : "");
      const uName = userName || (typeof window !== "undefined" ? (localStorage.getItem("iscore_user_name") || "") : "");

      const res = await fetch(`/api/liff/my-family?teamId=${tid}&userId=${uid}&userName=${encodeURIComponent(uName)}`);
      if (res.ok) {
        const json = (await res.json()) as MyFamilyApiResponse;
        if (json.success) {
          if (json.memberId) setMemberId(json.memberId);
          if (json.memberName) setMemberName(json.memberName);

          const isDemoTeam = isDemo || tid === "demo-team";
          const demoOverrides = isDemoTeam ? loadDemoPlayerConditionOverrides() : {};

          if (Array.isArray(json.children) && json.children.length > 0) {
            // 重複排除 ＆ コンディション状態反映
            const uniqueChildren: FamilyChildItem[] = [];
            const seen = new Set<string>();
            for (const c of json.children) {
              if (!seen.has(c.id)) {
                seen.add(c.id);
                const override = demoOverrides[c.id];
                uniqueChildren.push({
                  ...c,
                  conditionStatus: override
                    ? override.conditionStatus
                    : normalizePlayerConditionStatus(c.conditionStatus),
                });
              }
            }
            setChildren(uniqueChildren);
          } else if (isDemoTeam) {
            const demoOverride = demoOverrides["demo-player-1"];
            setChildren([
              {
                id: "demo-player-1",
                name: "山田 翔太",
                uniformNumber: "#10",
                conditionStatus: demoOverride ? demoOverride.conditionStatus : "active",
              },
            ]);
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

  const getEventAttendance = (id: string): "present" | "absent" | "pending" | "late" => {
    if (attendanceMap[id] && attendanceMap[id] !== "pending") {
      return attendanceMap[id];
    }
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem(`iscore_my_att_${id}`);
      if (cached === "present" || cached === "absent" || cached === "late") {
        return cached;
      }
    }
    return attendanceMap[id] || "pending";
  };

  const getChildAttendance = (
    eventId: string,
    childId: string
  ): "present" | "absent" | "pending" | "late" => {
    if (childAttendanceMap[eventId]?.[childId] && childAttendanceMap[eventId][childId] !== "pending") {
      return childAttendanceMap[eventId][childId];
    }
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem(`iscore_child_att_${eventId}_${childId}`);
      if (cached === "present" || cached === "absent" || cached === "late") {
        return cached;
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
      const res = await fetch("/api/liff/attendance", {
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
      if (res.ok) {
        invalidateLiffApiCache();
        onRefreshHub?.();
      }
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
      const res = await fetch("/api/liff/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          playerId: childId,
          status,
        }),
      });
      if (res.ok) {
        invalidateLiffApiCache();
        onRefreshHub?.();
      }
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

    const extractTime = (val: unknown): string | null => {
      if (!val) return null;
      if (typeof val === "string") {
        const match = val.match(/T?(\d{2}):(\d{2})/);
        if (match) return `${match[1]}:${match[2]}`;
      }
      if (val instanceof Date && !isNaN(val.getTime())) {
        return `${String(val.getHours()).padStart(2, "0")}:${String(val.getMinutes()).padStart(2, "0")}`;
      }
      return null;
    };

    if (eventsList && eventsList.length > 0) {
      const filtered = eventsList.filter(ev => {
        const d = new Date(ev.startAt || ev.dateStr || "");
        return d >= satDate && d <= friDate;
      });

      const mapEventData = (ev: HubEventInputItem) => {
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
          const pmSHHMM = extractTime(ev.pmStartAt) || "12:00";
          const pmEHHMM = extractTime(ev.pmEndAt) || extractTime(ev.endAt) || "18:00";
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

        const fallbackDateObj = new Date(ev.startAt || ev.dateStr || "");
        const resolvedDateStr =
          ev.dateStr ||
          (typeof ev.startAt === "string" && ev.startAt.length >= 10
            ? ev.startAt.slice(0, 10)
            : undefined);

        return {
          id: ev.id,
          title: ev.title || "活動予定",
          dateStr: resolvedDateStr,
          date:
            ev.date ||
            `${fallbackDateObj.getMonth() + 1}/${fallbackDateObj.getDate()}(${["日", "月", "火", "水", "木", "金", "土"][fallbackDateObj.getDay()]})`,
          hasPm,
          eventType: (ev.amType || ev.eventType || "practice") as "match" | "practice" | "camp" | "off",
          time: amTime,
          location: amLocation,
          amType: (ev.amType || ev.eventType || "practice") as "match" | "practice" | "camp" | "off",
          amTime,
          amLocation,
          pmType: (ev.pmType || (hasPm ? (ev.eventType || "practice") : "off")) as "match" | "practice" | "camp" | "off",
          pmTime: hasPm ? (pmTime || "12:00〜18:00") : "",
          pmLocation: hasPm ? (pmLocation || amLocation) : "",
          targetGroup: ev.targetGroup || (ev.title?.match(/\[(.*?)\]/)?.[1] || "全体"),
          dutyGroup: ev.dutyGroup || undefined,
          carInfo,
          needsLunch: ev.needsLunch === true || ev.needsLunch === 1 || ev.needsLunch === "1" || ev.needsLunch === "true",
          needsSnack: ev.needsSnack === true || ev.needsSnack === 1 || ev.needsSnack === "1" || ev.needsSnack === "true",
          memo: ev.memo || ev.description || "",
          activityGroups: (ev.activityGroups && Array.isArray(ev.activityGroups)) ? ev.activityGroups : undefined,
          attendCount: ev.attendCount ?? null,
          groupAttendCount: ev.groupAttendCount ?? null,
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
    const satIso = `${satDate.getFullYear()}-${String(satDate.getMonth() + 1).padStart(2, "0")}-${String(satDate.getDate()).padStart(2, "0")}`;
    const sunDateObj = new Date(satDate.getTime() + 86400000);
    const sunIso = `${sunDateObj.getFullYear()}-${String(sunDateObj.getMonth() + 1).padStart(2, "0")}-${String(sunDateObj.getDate()).padStart(2, "0")}`;

    const defaultEvents = [
      {
        id: "ev-sat-1",
        title: "秋季大会 2回戦 vs レッドソックス",
        dateStr: satIso,
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
        activityGroups: undefined as Array<{ id: string; name: string; time?: string; location?: string; eventType?: string; dutyGroup?: string }> | undefined,
        attendCount: { present: 15, absent: 3, pending: 0, total: 18 },
        groupAttendCount: DEMO_GROUP_ATTEND_COUNT_LIST[0],
      },
      {
        id: "ev-sun-2",
        title: "全日通常練習 & 守備連携・走塁強化",
        dateStr: sunIso,
        date: `${sunDateObj.getMonth() + 1}/${sunDateObj.getDate()}(日)`,
        hasPm: true,
        eventType: "practice" as const,
        time: "08:00〜16:00",
        location: "大師河原第3G",
        amType: "practice" as const,
        amTime: "08:00〜12:00",
        amLocation: "大師河原第3G",
        pmType: "practice" as const,
        pmTime: "12:00〜16:00",
        pmLocation: "大師河原第3G",
        targetGroup: "全体",
        dutyGroup: "2班",
        carInfo: "", // 練習時は配車なし
        needsLunch: true,
        needsSnack: false,
        memo: "水分補給のドリンク多めに持参してください。",
        activityGroups: undefined as Array<{ id: string; name: string; time?: string; location?: string; eventType?: string; dutyGroup?: string }> | undefined,
        attendCount: { present: 13, absent: 3, pending: 2, total: 18 },
        groupAttendCount: DEMO_GROUP_ATTEND_COUNT_LIST[1],
      },
    ];

    return { periodLabel, events: defaultEvents };
  }, [eventsList, isDemo]);

  // 直近の試合速報データ（ローディング中や実環境ではサンプル動画付きダミーを表示せず、デモモード時のみフォールバック）
  const recentMatch = latestMatch ?? (isDemo ? {
    id: "sample-match",
    date: "2026/08/23(日)",
    matchType: "official",
    tournamentName: "川崎市秋季大会 1回戦",
    opponent: "横浜ベイブルース",
    venueName: "市民第2球場",
    myScore: 7,
    opponentScore: 4,
    status: "finished",
    youtubeUrl: "https://www.youtube.com/watch?v=qkRUcYHJ1JI", // 2023 WBC 決勝 日本代表 優勝ハイライト (MLB公式)
  } : null);

  return (
    <div className="space-y-2.5">
      {/* 🌟 1. 上部セグメントタブ（直近の試合 / 直近の予定） */}
      <div className="flex items-center gap-1 bg-muted/80 dark:bg-muted/50 p-1 rounded-2xl border border-border/60">
        <button
          type="button"
          onClick={() => setActiveTab("score")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs transition-all active:scale-95 cursor-pointer",
            activeTab === "score"
              ? "bg-card text-foreground shadow-sm border border-border/50 font-black"
              : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
          )}
        >
          <Trophy className={cn("w-3.5 h-3.5", activeTab === "score" ? "text-primary" : "text-muted-foreground")} />
          <span>直近の試合</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("next")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs transition-all active:scale-95 cursor-pointer",
            activeTab === "next"
              ? "bg-card text-foreground shadow-sm border border-border/50 font-black"
              : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
          )}
        >
          <Sparkles className={cn("w-3.5 h-3.5", activeTab === "next" ? "text-primary" : "text-muted-foreground")} />
          <span>直近の予定</span>
          <span
            className={cn(
              "px-1.5 py-0.2 rounded-full text-[10px] font-black leading-none",
              activeTab === "next"
                ? "bg-primary/12 text-primary"
                : "bg-background/70 text-muted-foreground"
            )}
          >
            {weeklyEvents.length}
          </span>
        </button>
      </div>

      {/* 🌟 2. タブごとのカードコンテンツ */}

      {/* 🅰️ 【直近の試合】カード（MatchScoreCard） */}
      {activeTab === "score" && (
        <div className="space-y-2 animate-in fade-in duration-200">
          <div className="flex items-center justify-between px-1 text-xs">
            <span className="font-extrabold text-muted-foreground flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-primary" />
              <span>
                {recentMatch && recentMatch.status === "scheduled"
                  ? "予定の試合・役割担当"
                  : "直近の試合結果"}
              </span>
            </span>
            <Link
              href="/liff/matches"
              className="text-[11px] font-black text-primary hover:underline flex items-center gap-0.5"
            >
              <span>試合一覧・詳細</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {isLoading ? (
            <MatchScoreCardSkeleton hasVideo={true} />
          ) : recentMatch ? (
            <MatchScoreCard match={recentMatch as MatchCardData} teamName={teamName} initialExpanded={true} />
          ) : (
            <div className="p-8 rounded-2xl border border-border/60 bg-card shadow-xs text-center space-y-2">
              <Trophy className="w-8 h-8 text-muted-foreground/40 mx-auto" />
              <p className="text-xs font-black text-foreground">直近の試合記録はありません</p>
              <p className="text-[11px] text-muted-foreground">新しい試合が行われるとここに速報が表示されます</p>
            </div>
          )}
        </div>
      )}

      {/* 🅱️ 【直近の予定】カルーセル */}
      {activeTab === "next" && (
        <div className="space-y-2 animate-in fade-in duration-200">
          {/* カルーセル期間ヘッダー & スワイプ案内 */}
          <div className="flex items-center justify-between px-1 text-xs">
            <span className="font-extrabold text-muted-foreground flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>対象期間: <strong className="text-foreground">{weeklyPeriodLabel}</strong></span>
            </span>
            {weeklyEvents.length > 1 && (
              <span className="text-[11px] font-black text-primary flex items-center gap-0.5">
                <span>横スライドで確認 ({weeklyEvents.length}件)</span>
                <ChevronRight className="w-3.5 h-3.5 animate-pulse" />
              </span>
            )}
          </div>

          {/* 🌟 スケルトンローディング中表示（実カードと高さを完全一致） */}
          {isLoading ? (
            <div className="flex overflow-x-auto gap-3 -mx-4 px-4 pb-1 pt-0.5 scrollbar-none">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="w-[88vw] max-w-[360px] shrink-0 rounded-2xl border border-border/60 bg-card shadow-xs p-4 space-y-3.5 animate-pulse flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    {/* 上部ヘッダー（日付、バッジ、リンク） */}
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-24 bg-muted rounded-lg" />
                        <div className="h-4 w-12 bg-muted/60 rounded-md" />
                      </div>
                      <div className="h-4 w-10 bg-muted/60 rounded" />
                    </div>

                    {/* タイトル */}
                    <div className="h-4 w-44 bg-muted rounded-md" />

                    {/* スケジュール（午前・午後） */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="h-[62px] bg-muted/50 rounded-2xl p-2 space-y-1.5 border border-border/60">
                        <div className="h-3 w-10 bg-muted rounded" />
                        <div className="h-3 w-20 bg-muted/70 rounded" />
                      </div>
                      <div className="h-[62px] bg-muted/50 rounded-2xl p-2 space-y-1.5 border border-border/60">
                        <div className="h-3 w-10 bg-muted rounded" />
                        <div className="h-3 w-20 bg-muted/70 rounded" />
                      </div>
                    </div>

                    {/* お弁当・配車・当番ブロック */}
                    <div className="p-3 rounded-2xl bg-muted/35 border border-border/60 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="h-6 bg-muted/50 rounded-xl" />
                        <div className="h-6 bg-muted/50 rounded-xl" />
                      </div>
                      <div className="h-4 bg-muted/40 rounded-xl w-3/4" />
                    </div>
                  </div>

                  {/* 出欠アコーディオンバー（閉じた状態の高さ） */}
                  <div className="pt-2 border-t border-border/60">
                    <div className="h-9 bg-muted/40 rounded-2xl border border-border/60 flex items-center justify-between px-3">
                      <div className="h-4 w-28 bg-muted rounded" />
                      <div className="h-3 w-8 bg-muted/60 rounded" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : weeklyEvents.length === 0 ? (
            <div className="p-6 rounded-2xl border border-border/60 bg-card shadow-xs text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-teal-500/12 text-teal-600 dark:text-teal-400 mx-auto flex items-center justify-center">
                <Calendar className="w-5 h-5" />
              </div>
              <p className="text-sm font-black text-foreground">この期間の活動予定はありません</p>
              <p className="text-xs text-muted-foreground font-bold">予定が登録されるとここに表示されます</p>
              <div className="pt-2">
                <Link
                  href="/liff/schedule"
                  className="inline-flex items-center gap-1 px-4 py-1.5 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black shadow-xs active:scale-95"
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
                const isMatch = ev.eventType === "match" || ev.amType === "match" || ev.pmType === "match" || (ev.title && (ev.title.includes("試合") || ev.title.includes("vs")));
                const isOfficial = isMatch && Boolean(ev.title && (ev.title.includes("大会") || ev.title.includes("公式")));
                const dateMatch = ev.date?.match(/^(.*?)(?:\((.)\))?$/);
                const dateText = dateMatch ? dateMatch[1] : ev.date;
                const dayOfWeek = dateMatch ? dateMatch[2] : "";
                const isSat = dayOfWeek === "土";
                const isSun = dayOfWeek === "日";
                const displayDutyGroup =
                  (ev.activityGroups && ev.activityGroups[0]?.dutyGroup) || ev.dutyGroup;

                return (
                  <div
                    key={ev.id}
                    className="w-[88vw] max-w-[360px] shrink-0 snap-center rounded-2xl border border-border bg-card shadow-xs overflow-hidden flex flex-col justify-between transition-all"
                  >
                    {/* A-3 上帯ダークキャップ（日付・曜日・区分・対象・タイトル・当番班） */}
                    <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* 日付 ＋ 曜日バッジ */}
                          <div className="flex items-center gap-1">
                            <span className="text-lg sm:text-xl font-black text-white tracking-tight tabular-nums">
                              {dateText}
                            </span>
                            {dayOfWeek && (
                              <span
                                className={cn(
                                  "px-1.5 py-0.5 rounded text-xs font-black",
                                  isSat
                                    ? "bg-sky-500 text-slate-950"
                                    : isSun
                                    ? "bg-rose-500 text-white"
                                    : "bg-slate-700 text-slate-100"
                                )}
                              >
                                {dayOfWeek}
                              </span>
                            )}
                          </div>

                          {/* ⚾ 試合 / 🏃 練習 区分バッジ */}
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded text-[10.5px] font-black shrink-0",
                              isOfficial
                                ? "bg-amber-400 text-slate-950"
                                : isMatch
                                ? "bg-primary text-primary-foreground"
                                : "bg-teal-500 text-slate-950"
                            )}
                          >
                            {isOfficial ? "🏆 公式戦" : isMatch ? "⚾ 試合" : "🏃 練習"}
                          </span>

                          {/* 🎯 対象チーム・グループバッジ（Aチーム/Bチーム/全体など） */}
                          {ev.targetGroup && ev.targetGroup !== "全体" && (
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-100 text-[10.5px] font-black border border-slate-700 shrink-0">
                              🏷️ {ev.targetGroup}
                            </span>
                          )}

                          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-bold tabular-nums">
                            {idx + 1} / {weeklyEvents.length}
                          </span>
                        </div>

                        <Link href="/liff/schedule" className="text-xs font-black text-sky-300 hover:text-white flex items-center gap-0.5 shrink-0 ml-1">
                          <span>全予定</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>

                      {/* タイトル（大会名や練習内容） ＆ 当番班バッジ */}
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm sm:text-base font-black text-white truncate min-w-0 flex-1">
                          {ev.title || (isMatch ? "公式戦・練習試合" : "通常練習")}
                        </h3>
                        {displayDutyGroup && displayDutyGroup !== "なし" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 text-amber-300 border border-amber-400/50 text-[10.5px] font-black shrink-0">
                            <ClipboardList className="w-3 h-3 text-amber-400 shrink-0" />
                            <span>当番班: {displayDutyGroup}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-4 pt-3 space-y-3.5 flex-1 flex flex-col justify-between">
                      <div className="space-y-3">
                        {/* 活動スケジュール表示 */}
                        {ev.activityGroups && ev.activityGroups.length > 0 ? (
                          <div className="space-y-1.5">
                            <div className="p-3 rounded-2xl bg-muted/35 border border-border/60 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                                  <span>{ev.activityGroups[0].eventType === "match" ? "⚾" : "🏃"}</span>
                                  <span>{ev.activityGroups[0].name}</span>
                                </span>
                                {ev.activityGroups.length > 1 && (
                                  <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-md border border-primary/25">
                                    ＋他{ev.activityGroups.length - 1}班
                                  </span>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                                <div className="flex items-center gap-1.5 text-foreground bg-card p-2 rounded-xl border border-border/60 shadow-2xs">
                                  <Clock className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                                  <span className="truncate font-black">{ev.activityGroups[0].time || ev.time}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-foreground bg-card p-2 rounded-xl border border-border/60 shadow-2xs">
                                  <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                                  <span className="truncate font-black">{ev.activityGroups[0].location || ev.location}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : ev.hasPm && ev.pmTime ? (
                          /* ☀️🌙 午前/午後分割表示（Sky vs Indigo コントラスト） */
                          <div className="grid grid-cols-2 gap-2">
                            {/* ☀️ 【午前】（左） */}
                            <div className="p-2.5 rounded-2xl bg-muted/35 border border-border/60 flex flex-col justify-between space-y-2">
                              <div className="flex items-center justify-between gap-1">
                                <span className="px-1.5 py-0.5 rounded-md bg-sky-500/12 text-sky-700 dark:text-sky-300 border border-sky-500/25 text-[10px] font-black flex items-center gap-1 shrink-0">
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
                              <div className="p-2 rounded-xl bg-card border border-border/60 space-y-1 shadow-2xs">
                                <div className="flex items-center gap-1.5 text-xs font-black text-foreground">
                                  <Clock className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                                  <span className="truncate">{ev.amTime || ev.time}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] font-bold text-foreground/90 truncate">
                                  <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                                  <span className="truncate">{ev.amLocation || ev.location || "グラウンド"}</span>
                                </div>
                              </div>
                            </div>

                            {/* 🌙 【午後】（右） */}
                            <div className={`p-2.5 rounded-2xl border flex flex-col justify-between space-y-2 ${
                              ev.hasPm && ev.pmType !== "off"
                                ? "bg-muted/35 border-border/60"
                                : "bg-muted/25 border-dashed border-border/60 opacity-75"
                            }`}>
                              <div className="flex items-center justify-between gap-1">
                                <span
                                  className={cn(
                                    "px-1.5 py-0.5 rounded-md text-[10px] font-black border flex items-center gap-1 shrink-0",
                                    ev.hasPm && ev.pmType !== "off"
                                      ? "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 border-indigo-500/25"
                                      : "bg-muted/50 text-muted-foreground border-border/60"
                                  )}
                                >
                                  <span>🌙 午後</span>
                                </span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border shrink-0 ${
                                  !ev.hasPm || ev.pmType === "off"
                                    ? "bg-muted/50 text-muted-foreground border-border/60"
                                    : ev.pmType === "match"
                                    ? "bg-primary/12 text-primary border-primary/25"
                                    : "bg-teal-500/12 text-teal-700 dark:text-teal-300 border-teal-500/25"
                                }`}>
                                  {!ev.hasPm || ev.pmType === "off" ? "🏖️ なし" : ev.pmType === "match" ? "⚾ 試合" : "🏃 練習"}
                                </span>
                              </div>
                              <div className="p-2 rounded-xl bg-card border border-border/60 space-y-1 shadow-2xs">
                                <div className="flex items-center gap-1.5 text-xs font-black text-foreground">
                                  <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                                  <span className="truncate">{ev.hasPm && ev.pmTime ? ev.pmTime : "解散・なし"}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] font-bold text-foreground/90 truncate">
                                  <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                                  <span className="truncate">{ev.hasPm && ev.pmLocation ? ev.pmLocation : (ev.hasPm ? ev.amLocation : "—")}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* 🏃 単一活動表示 */
                          <div className="p-3 rounded-2xl bg-muted/35 border border-border/60 space-y-2">
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="px-1.5 py-0.5 rounded-md bg-sky-500/12 text-sky-700 dark:text-sky-300 border border-sky-500/25 text-[10px] font-black">
                                  ☀️ 午前
                                </span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                                  ev.eventType === "match"
                                    ? "bg-primary/12 text-primary border-primary/25"
                                    : "bg-teal-500/12 text-teal-700 dark:text-teal-300 border-teal-500/25"
                                }`}>
                                  {ev.eventType === "match" ? "⚾ 試合" : "🏃 練習"}
                                </span>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                              <div className="flex items-center gap-1.5 text-foreground bg-card p-2 rounded-xl border border-border/60 shadow-2xs">
                                <Clock className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                                <span className="truncate font-black">{ev.time || "時間調整中"}</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-foreground bg-card p-2 rounded-xl border border-border/60 shadow-2xs">
                                <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                                <span className="truncate font-black">{ev.location || "グラウンド"}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 📋 その他の詳細情報ブロック（上から：弁当・補食、連絡事項、配車） */}
                        <div className="p-3 rounded-2xl bg-muted/35 border border-border/60 space-y-2.5 text-xs">
                          {/* 1. 弁当 & 補食 */}
                          <div className="grid grid-cols-2 gap-2 font-bold">
                            {/* 弁当 */}
                            <div className="flex items-center justify-between p-2 rounded-xl bg-card border border-border/60 shadow-2xs">
                              <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
                                <Utensils className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                <span>弁当</span>
                              </span>
                              <span className={`px-2 py-0.5 rounded-md text-[10.5px] font-black ${
                                ev.needsLunch
                                  ? "bg-amber-500/12 text-amber-700 dark:text-amber-300 border border-amber-500/25"
                                  : "text-muted-foreground/70"
                              }`}>
                                {ev.needsLunch ? "🍙 要" : "不要"}
                              </span>
                            </div>

                            {/* 補食 */}
                            <div className="flex items-center justify-between p-2 rounded-xl bg-card border border-border/60 shadow-2xs">
                              <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
                                <span className="text-xs leading-none">🍌</span>
                                <span>補食</span>
                              </span>
                              <span className={`px-2 py-0.5 rounded-md text-[10.5px] font-black ${
                                ev.needsSnack
                                  ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25"
                                  : "text-muted-foreground/70"
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
                                <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[11px]">
                                  <span className="text-muted-foreground flex items-center gap-1.5">
                                    <FileText className="w-3.5 h-3.5 text-muted-foreground/70" />
                                    <span>連絡事項</span>
                                  </span>
                                  <span className="text-muted-foreground/70 font-bold">特になし</span>
                                </div>
                              );
                            }

                            return (
                              <div className="pt-2 border-t border-border/60 space-y-1.5">
                                {/* アコーディオンヘッダー・開閉トグルボタン */}
                                <button
                                  type="button"
                                  onClick={() => toggleMemo(ev.id)}
                                  className="w-full flex items-center justify-between p-2 rounded-xl bg-card border border-border/60 border-l-4 border-l-amber-500 hover:bg-muted/50 active:scale-[0.99] transition-all cursor-pointer select-none shadow-2xs"
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
                                  <div className="animate-in fade-in slide-in-from-top-1 duration-150 p-2.5 rounded-xl bg-card border border-border/60 border-l-4 border-l-amber-500 shadow-2xs">
                                    <p className="text-[11px] font-bold text-foreground/90 whitespace-pre-wrap leading-relaxed">
                                      {ev.memo}
                                    </p>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* 3. 配車 */}
                          <div className="pt-2 border-t border-border/60 flex items-center justify-between font-bold">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-6 h-6 rounded-lg bg-teal-500/12 flex items-center justify-center shrink-0">
                                <Car className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                              </div>
                              <span className="text-muted-foreground text-[11px] shrink-0">配車:</span>
                              <span className="text-foreground truncate font-black text-[11px]">
                                {ev.carInfo ? ev.carInfo : "なし（現地集合）"}
                              </span>
                            </div>

                            {ev.carInfo ? (
                              <Link
                                href="/liff/carpool"
                                className="text-[10.5px] font-black text-primary hover:underline flex items-center gap-0.5 shrink-0 ml-2"
                              >
                                <span>配車表へ</span>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </Link>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {/* 🌟 グループ別出欠サマリー ＆ 出欠回答エリア (アコーディオン化・デフォルト閉じ) */}
                      <div className="pt-2 border-t border-border/60 space-y-2">
                        <EventGroupAttendanceSummary
                          compact
                          groupAttendCount={ev.groupAttendCount}
                          attendCount={ev.attendCount}
                          statusConfig={attendanceStatusConfig}
                          dateStr={ev.dateStr}
                        />

                        {/* アコーディオントグルボタン */}
                        <button
                          type="button"
                          onClick={() => toggleAttendance(ev.id)}
                          className="w-full flex items-center justify-between p-2.5 rounded-2xl bg-card border border-border/60 hover:border-primary/40 shadow-2xs transition-all cursor-pointer group select-none"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-7 h-7 rounded-xl bg-teal-500/12 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                              <Users className="w-4 h-4" />
                            </span>
                            <div className="flex items-center gap-2 text-xs font-black text-foreground">
                              <span>出欠を回答・確認</span>
                              {/* 現在のステータス要約バッジ */}
                              <span className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-black border ${
                                pStatus === "present"
                                  ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/25"
                                  : pStatus === "late"
                                  ? "bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/25"
                                  : pStatus === "absent"
                                  ? "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30"
                                  : "bg-muted/50 text-muted-foreground border-border/60"
                              }`}>
                                {pStatus === "present" ? "○ 出席" : pStatus === "late" ? "△ 調整" : pStatus === "absent" ? "× 欠席" : "？ 未定"}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground group-hover:text-foreground">
                            <span>{expandedAttendance[ev.id] ? "閉じる" : "開く"}</span>
                            {expandedAttendance[ev.id] ? (
                              <ChevronUp className="w-4 h-4 text-primary shrink-0" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0" />
                            )}
                          </div>
                        </button>

                        {/* 展開時の中身 */}
                        {expandedAttendance[ev.id] && (
                          <div className="space-y-3 pt-1 animate-in fade-in slide-in-from-top-1 duration-150">
                            {/* 👦 1. 保護者の場合: お子様（選手）の出欠回答 */}
                            {userRole === "parent" && children.map((child) => {
                              const childCond = normalizePlayerConditionStatus(child.conditionStatus);
                              const childCondMeta = PLAYER_CONDITION_META[childCond];

                              if (childCond === "on_leave") {
                                return (
                                  <div
                                    key={child.id}
                                    className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 space-y-1.5"
                                  >
                                    <div className="flex items-center justify-between gap-2 text-xs">
                                      <span className="font-black text-muted-foreground flex items-center gap-1.5 min-w-0">
                                        <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center text-xs shrink-0">
                                          👦
                                        </span>
                                        <span className="truncate">
                                          お子様（{child.name}
                                          {child.uniformNumber ? ` ${child.uniformNumber}` : ""}）
                                        </span>
                                      </span>
                                      <span
                                        className={`px-2 py-0.5 rounded text-[10px] font-black shrink-0 ${childCondMeta.solidBadgeClass}`}
                                      >
                                        {childCondMeta.badgeText}
                                      </span>
                                    </div>
                                    <p className="text-[11px] font-bold text-muted-foreground leading-relaxed pl-6">
                                      休部中のため出欠回答は不要です（出欠一覧表・未回答カウントからも自動除外されています）。
                                    </p>
                                  </div>
                                );
                              }

                              const childStatus = getChildAttendance(ev.id, child.id);
                              return (
                                <div key={child.id} className="p-3 rounded-2xl bg-muted/35 border border-border/60 space-y-2.5">
                                  <div className="flex items-center justify-between gap-1.5 text-xs flex-wrap">
                                    <span className="font-black text-foreground flex items-center gap-1.5 flex-wrap">
                                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs shrink-0">👦</span>
                                      <span>お子様（{child.name}{child.uniformNumber ? ` ${child.uniformNumber}` : ""}）の出欠</span>
                                      {childCond !== "active" && (
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${childCondMeta.solidBadgeClass}`}>
                                          {childCondMeta.compactBadgeText}
                                        </span>
                                      )}
                                    </span>
                                    <span className="text-[11px] font-bold">
                                      {childStatus === "present" && <span className="px-2 py-0.5 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 font-black">○ 参加</span>}
                                      {childStatus === "late" && <span className="px-2 py-0.5 rounded-full bg-amber-500/12 text-amber-700 dark:text-amber-300 border border-amber-500/25 font-black">△ 調整</span>}
                                      {childStatus === "absent" && <span className="px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30 font-black">× 欠席</span>}
                                      {childStatus === "pending" && <span className="px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground border border-border/60 font-black">？ 未定</span>}
                                    </span>
                                  </div>
                                  {childCond === "rehab" && (
                                    <p className="text-[10.5px] font-bold text-rose-700 dark:text-rose-300 leading-snug">
                                      ※ 別メニュー練習・ベンチ帯同・欠席などの予定をご回答ください。
                                    </p>
                                  )}

                                  <div className="grid grid-cols-4 gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setChildAttendance(ev.id, child.id, "present")}
                                      className={`flex flex-col items-center justify-center py-2 rounded-xl text-xs font-black border transition-all active:scale-95 cursor-pointer ${
                                        childStatus === "present"
                                          ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                                          : "bg-card hover:bg-muted text-muted-foreground border-border/60"
                                      }`}
                                    >
                                      <span className="text-base leading-none mb-0.5 font-black">○</span>
                                      <span className="text-[10px]">参加</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => setChildAttendance(ev.id, child.id, "late")}
                                      className={`flex flex-col items-center justify-center py-2 rounded-xl text-xs font-black border transition-all active:scale-95 cursor-pointer ${
                                        childStatus === "late"
                                          ? "bg-amber-500 text-white border-amber-500 shadow-xs"
                                          : "bg-card hover:bg-muted text-muted-foreground border-border/60"
                                      }`}
                                    >
                                      <span className="text-base leading-none mb-0.5 font-black">△</span>
                                      <span className="text-[10px]">調整</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => setChildAttendance(ev.id, child.id, "absent")}
                                      className={`flex flex-col items-center justify-center py-2 rounded-xl text-xs font-black border transition-all active:scale-95 cursor-pointer ${
                                        childStatus === "absent"
                                          ? "bg-slate-600 dark:bg-slate-500 text-white border-slate-600 dark:border-slate-500 shadow-xs"
                                          : "bg-card hover:bg-muted text-muted-foreground border-border/60"
                                      }`}
                                    >
                                      <span className="text-base leading-none mb-0.5 font-black">×</span>
                                      <span className="text-[10px]">欠席</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => setChildAttendance(ev.id, child.id, "pending")}
                                      className={`flex flex-col items-center justify-center py-2 rounded-xl text-xs font-black border transition-all active:scale-95 cursor-pointer ${
                                        childStatus === "pending"
                                          ? "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600 shadow-2xs"
                                          : "bg-card hover:bg-muted text-muted-foreground border-border/60"
                                      }`}
                                    >
                                      <span className="text-base leading-none mb-0.5 font-black">？</span>
                                      <span className="text-[10px]">未定</span>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}

                            {/* 👨 2. 保護者本人（または選手本人）の出欠回答 */}
                            <div className="space-y-2.5 p-3 rounded-2xl bg-muted/35 border border-border/60">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-black text-foreground flex items-center gap-1.5">
                                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs">
                                    {userRole === "parent" ? "👨" : "⚾"}
                                  </span>
                                  <span>{userRole === "parent" ? "保護者（自分）の参加・当番" : "あなたの出欠回答"}</span>
                                </span>
                                <span className="text-[11px] font-bold">
                                  {pStatus === "present" && <span className="px-2 py-0.5 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 font-black">○ {userRole === "parent" ? "参加・当番可" : "出席"}</span>}
                                  {pStatus === "late" && <span className="px-2 py-0.5 rounded-full bg-amber-500/12 text-amber-700 dark:text-amber-300 border border-amber-500/25 font-black">△ 調整</span>}
                                  {pStatus === "absent" && <span className="px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30 font-black">× 欠席</span>}
                                  {pStatus === "pending" && <span className="px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground border border-border/60 font-black">？ 未定</span>}
                                </span>
                              </div>

                              {/* ○, △, ×, ？ の4等分グリッド */}
                              <div className="grid grid-cols-4 gap-1.5">
                                {/* ○ 出席 */}
                                <button
                                  type="button"
                                  onClick={() => setEventAttendance(ev.id, "present")}
                                  className={`flex flex-col items-center justify-center py-2 rounded-xl text-xs font-black border transition-all active:scale-95 cursor-pointer ${
                                    pStatus === "present"
                                      ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                                      : "bg-card hover:bg-muted text-muted-foreground border-border/60"
                                  }`}
                                >
                                  <span className="text-base leading-none mb-0.5 font-black">○</span>
                                  <span className="text-[10px]">{userRole === "parent" ? "参加/当番" : "出席"}</span>
                                </button>

                                {/* △ 調整 / 遅刻 */}
                                <button
                                  type="button"
                                  onClick={() => setEventAttendance(ev.id, "late")}
                                  className={`flex flex-col items-center justify-center py-2 rounded-xl text-xs font-black border transition-all active:scale-95 cursor-pointer ${
                                    pStatus === "late"
                                      ? "bg-amber-500 text-white border-amber-500 shadow-xs"
                                      : "bg-card hover:bg-muted text-muted-foreground border-border/60"
                                  }`}
                                >
                                  <span className="text-base leading-none mb-0.5 font-black">△</span>
                                  <span className="text-[10px]">調整</span>
                                </button>

                                {/* × 欠席 */}
                                <button
                                  type="button"
                                  onClick={() => setEventAttendance(ev.id, "absent")}
                                  className={`flex flex-col items-center justify-center py-2 rounded-xl text-xs font-black border transition-all active:scale-95 cursor-pointer ${
                                    pStatus === "absent"
                                      ? "bg-slate-600 dark:bg-slate-500 text-white border-slate-600 dark:border-slate-500 shadow-xs"
                                      : "bg-card hover:bg-muted text-muted-foreground border-border/60"
                                  }`}
                                >
                                  <span className="text-base leading-none mb-0.5 font-black">×</span>
                                  <span className="text-[10px]">欠席</span>
                                </button>

                                {/* ？ 未定 */}
                                <button
                                  type="button"
                                  onClick={() => setEventAttendance(ev.id, "pending")}
                                  className={`flex flex-col items-center justify-center py-2 rounded-xl text-xs font-black border transition-all active:scale-95 cursor-pointer ${
                                    pStatus === "pending"
                                      ? "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600 shadow-2xs"
                                      : "bg-card hover:bg-muted text-muted-foreground border-border/60"
                                  }`}
                                >
                                  <span className="text-base leading-none mb-0.5 font-black">？</span>
                                  <span className="text-[10px]">未定</span>
                                </button>
                              </div>
                            </div>

                            {/* 参加時の配車アンケート (※試合・遠征時のみ表示) */}
                            {(ev.eventType === "match" || (ev.title && (ev.title.includes("試合") || ev.title.includes("遠征") || ev.title.includes("大会") || ev.title.includes("vs")))) && (pStatus === "present" || pStatus === "late") && (
                              <div className="p-3 rounded-2xl bg-muted/35 border border-border/60 space-y-2 animate-in fade-in duration-200">
                                <div className="flex items-center justify-between text-[11px] font-bold text-foreground">
                                  <span className="flex items-center gap-1.5 font-black text-foreground">
                                    <Car className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                                    <span>配車・移動手段 (試合・遠征)</span>
                                  </span>
                                </div>

                                <div className="grid grid-cols-3 gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setEventCarStatus(ev.id, "can_drive")}
                                    className={`py-1.5 px-1 rounded-xl text-[10.5px] transition-all cursor-pointer ${
                                      cStatus === "can_drive"
                                        ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                                        : "bg-card border border-border/60 text-muted-foreground hover:bg-muted/50 hover:text-foreground font-bold"
                                    }`}
                                  >
                                    🚗 車出し可
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setEventCarStatus(ev.id, "need_ride")}
                                    className={`py-1.5 px-1 rounded-xl text-[10.5px] transition-all cursor-pointer ${
                                      cStatus === "need_ride"
                                        ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                                        : "bg-card border border-border/60 text-muted-foreground hover:bg-muted/50 hover:text-foreground font-bold"
                                    }`}
                                  >
                                    🙋 送迎希望
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setEventCarStatus(ev.id, "not_needed")}
                                    className={`py-1.5 px-1 rounded-xl text-[10.5px] transition-all cursor-pointer ${
                                      cStatus === "not_needed"
                                        ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                                        : "bg-card border border-border/60 text-muted-foreground hover:bg-muted/50 hover:text-foreground font-bold"
                                    }`}
                                  >
                                    🚶 自走・不要
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
