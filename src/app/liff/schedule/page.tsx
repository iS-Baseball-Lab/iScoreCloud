// filepath: src/app/liff/schedule/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { useLiff } from "@/components/liff/LiffProvider";
import { Calendar, Clock, MapPin, Users, CheckCircle2, XCircle, HelpCircle, Utensils, Shield, Filter, Loader2 } from "lucide-react";

interface ScheduleEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  eventType: "match" | "practice" | "meeting" | "camp";
  targetGroup?: string;
  dutyGroup?: string;
  needsLunch?: boolean;
  myStatus: "present" | "absent" | "pending" | "late" | "partial";
  attendCount: { present: number; absent: number; pending: number };
}

export default function LiffSchedulePage() {
  const { currentTeam, profile, isLoadingTeam } = useLiff();
  const [filter, setFilter] = useState<"all" | "match" | "practice">("all");
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

      // チーム変更時は一旦クリア
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
          const map: Record<string, "present" | "absent" | "pending" | "late"> = {};
          for (const ev of data.events) {
            if (ev.id && ev.myStatus && ev.myStatus !== "pending") {
              map[ev.id] = ev.myStatus === "partial" ? "late" : (ev.myStatus as "present" | "absent" | "late");
            }
          }
          if (Object.keys(map).length > 0) {
            setAttendanceMap(prev => ({ ...map, ...prev }));
          }
          setEvents(data.events);
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
    // 楽観的更新
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

  const filteredEvents = events.filter((ev) => {
    if (filter === "match") return ev.eventType === "match";
    if (filter === "practice") return ev.eventType === "practice";
    return true;
  });

  return (
    <div className="flex flex-col min-h-screen">
      <LiffHeader />

      <div className="p-4 space-y-5">
        {/* ページ内ヘッダー */}
        <LiffPageHeader
          title="予定 & お当番表"
          subtitle="今後のスケジュール・出欠・当番確認"
          icon={
            <span className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black">
              <Calendar className="w-4 h-4" />
            </span>
          }
          showBack
          shareData={{
            title: `【スケジュール】今後のチーム予定一覧`,
            text: `出欠未回答の方は確認とご登録をお願いします！`,
          }}
        />

        {/* 🌟 管理者向け：活動予定スケジューラーへの導線 */}
        <div className="flex items-center justify-between p-3 rounded-2xl bg-primary/10 border border-primary/20">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-black shrink-0">
              <Calendar className="w-4 h-4" />
            </span>
            <div>
              <p className="text-xs font-black text-foreground">活動日スケジューラー</p>
              <p className="text-[10px] font-bold text-muted-foreground">カレンダーで予定・午前午後・当番を一括設定</p>
            </div>
          </div>
          <a
            href="/liff/schedule/admin"
            className="py-1.5 px-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 text-xs font-black shadow-xs transition-all shrink-0"
          >
            予定を設定
          </a>
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

        {/* ローディング（美しいスケルトンカード3枚） */}
        {isLoading ? (
          <div className="space-y-3.5 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-4 shadow-sm space-y-3 ring-1 ring-black/5"
              >
                <div className="flex justify-between items-center">
                  <div className="h-5 w-24 bg-slate-200 dark:bg-slate-800 rounded-full" />
                  <div className="h-4 w-12 bg-slate-200 dark:bg-slate-800 rounded" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-6 w-40 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                  <div className="h-4 w-56 bg-slate-200 dark:bg-slate-800 rounded" />
                </div>
                <div className="h-16 bg-slate-100 dark:bg-slate-800/60 rounded-2xl" />
                <div className="h-20 bg-slate-100 dark:bg-slate-800/60 rounded-2xl" />
              </div>
            ))}
          </div>
        ) : filteredEvents.length === 0 ? (
          /* 空ステート */
          <div className="flex flex-col items-center justify-center py-16 text-center bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-6 space-y-3 ring-1 ring-black/5 shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <Calendar className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-black text-foreground">登録されている予定はありません</h4>
              <p className="text-xs font-bold text-muted-foreground">
                管理者がWeb版から新しい予定を登録すると、ここに自動反映されます。
              </p>
            </div>
          </div>
        ) : (
          /* 予定カード一覧 */
          <div className="space-y-4">
            {filteredEvents.map((ev) => (
            <div
              key={ev.id}
              className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-4 shadow-sm space-y-3 ring-1 ring-black/5"
            >
              {/* 日時 & 種別バッジ */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                      ev.eventType === "match"
                        ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                        : "bg-primary/15 text-primary border border-primary/30"
                    }`}
                  >
                    {ev.eventType === "match" ? "⚾ 試合" : "🏃 練習"}
                  </span>

                  {/* 🎯 対象チーム・グループバッジ */}
                  {ev.targetGroup && ev.targetGroup !== "全体" && (
                    <span className="px-2 py-0.5 rounded-md bg-primary/15 text-primary text-[10px] font-black border border-primary/25 shrink-0">
                      🏷️ {ev.targetGroup}
                    </span>
                  )}

                  <span className="text-xs font-black text-foreground">{ev.date}</span>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] font-black text-muted-foreground">
                  <span className="text-emerald-600">出 {ev.attendCount.present}</span>
                  <span>/</span>
                  <span className="text-rose-600">欠 {ev.attendCount.absent}</span>
                  <span>/</span>
                  <span className="text-amber-600">未 {ev.attendCount.pending}</span>
                </div>
              </div>

              {/* タイトル */}
              <h3 className="text-sm font-black text-foreground tracking-tight">
                {ev.title}
              </h3>

              {/* 時間・場所・当番詳細 */}
              <div className="p-3 rounded-2xl bg-muted/40 border border-border/50 space-y-1.5 text-xs font-bold">
                <div className="flex items-center gap-2 text-foreground">
                  <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span>{ev.time}</span>
                </div>

                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="truncate">{ev.location}</span>
                </div>

                {ev.dutyGroup && (
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 pt-0.5">
                    <Shield className="w-3.5 h-3.5 shrink-0" />
                    <span>当番: {ev.dutyGroup}</span>
                  </div>
                )}

                {ev.needsLunch && (
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                    <Utensils className="w-3.5 h-3.5 shrink-0" />
                    <span>🍙 お弁当持参</span>
                  </div>
                )}
              </div>

              {/* 出欠回答セクション (○, △, ×, ？) */}
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
                        {/* ○ 出席 */}
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

                        {/* △ 調整 / 遅刻 */}
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

                        {/* × 欠席 */}
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

                        {/* ？ 未定 */}
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
