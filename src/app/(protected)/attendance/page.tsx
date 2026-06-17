// filepath: src/app/(protected)/attendance/page.tsx
"use client";

import React, { useEffect, useState, useMemo } from "react";
import { 
  Calendar, Users, Plus, CheckCircle2, AlertCircle, HelpCircle, 
  Car, MessageSquare, Loader2, Edit, Trash2, CalendarDays, Filter, ChevronRight, MapPin
} from "lucide-react";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { EmptyState } from "@/components/layout/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 型定義
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface Event {
  id: string;
  teamId: string;
  title: string;
  startAt: string | number | Date;
  eventType: "match" | "practice" | "meeting";
  description: string | null;
  location: string | null;
}

interface Player {
  id: string;
  teamId: string;
  name: string;
  nameKana?: string;
  uniformNumber: string;
  isActive: boolean;
}

interface Member {
  id: string; // memberId
  teamId: string;
  userId: string | null;
  name: string;
  nameKana?: string;
  memberType: 'staff' | 'parent' | 'other';
  phone?: string;
  email?: string;
  role: string;
  status: string;
  avatarUrl?: string | null;
}

interface AttendanceRecord {
  id: string;
  eventId: string;
  playerId: string | null;
  memberId: string | null;
  userId: string | null;
  status: "present" | "absent" | "pending" | "late";
  roleInEvent: string;
  hasCar: boolean;
  comment: string;
  updatedAt: string | number;
}

interface Group {
  id: string;
  teamId: string;
  name: string;
  parentId: string | null;
}

interface GroupMemberRelation {
  id: string;
  groupId: string;
  playerId: string | null;
  teamMemberId: string | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// コンポーネント本体
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function AttendancePage() {
  const [teamId, setTeamId] = useState<string>("");
  const [eventsData, setEventsData] = useState<Event[]>([]);
  const [playersData, setPlayersData] = useState<Player[]>([]);
  const [membersData, setMemberData] = useState<Member[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupRelations, setGroupRelations] = useState<GroupMemberRelation[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string>("");

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // フィルター用ステータス
  const [activeTab, setActiveTab] = useState<"all" | "players" | "staff">("all");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("all");

  // 日程モーダル制御
  const [isEventModalOpen, setIsEventModalOpen] = useState<boolean>(false);
  const [eventModalMode, setEventModalMode] = useState<"create" | "edit">("create");
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);

  // 出欠変更モーダル状態 (伝助グリッド上のマスをクリックした時)
  const [isAttendModalOpen, setIsAttendModalOpen] = useState<boolean>(false);
  const [activeCell, setActiveCell] = useState<{
    event: Event;
    row: {
      type: "player" | "member";
      id: string;
      name: string;
      uniformNumber?: string;
    };
    record: AttendanceRecord | null;
  } | null>(null);

  // イベント入力用フォーム状態
  const [eventTitle, setEventTitle] = useState<string>("");
  const [eventStartAt, setEventStartAt] = useState<string>("");
  const [eventStartVal, setEventStartVal] = useState<string>(""); // 時間用 hh:mm
  const [eventType, setEventType] = useState<"match" | "practice" | "meeting">("practice");
  const [eventLocation, setEventLocation] = useState<string>("");
  const [eventDescription, setEventDescription] = useState<string>("");

  // 出欠入力用フォーム状態
  const [inputStatus, setInputStatus] = useState<"present" | "absent" | "pending" | "late">("pending");
  const [inputComment, setInputComment] = useState<string>("");
  const [inputHasCar, setInputHasCar] = useState<boolean>(false);
  const [inputRole, setInputRole] = useState<string>("player");

  // 1. 初期設定とデータ取得
  useEffect(() => {
    const tid = typeof window !== "undefined" ? localStorage.getItem("iscore_selectedTeamId") : null;
    if (tid) {
      setTeamId(tid);
      fetchInitialData(tid);
    } else {
      setIsLoading(false);
    }
  }, []);

  const fetchInitialData = async (tid: string) => {
    setIsLoading(true);
    try {
      // ユーザーのセッション情報取得
      const meRes = await fetch("/api/auth/me");
      if (meRes.ok) {
        const meJson = await meRes.json() as any;
        if (meJson.success && meJson.data) {
          setMyUserId(meJson.data.id);
          const membership = meJson.data.memberships?.find((m: any) => m.teamId === tid);
          if (membership) {
            setMyRole(membership.role || "");
          }
        }
      }

      // 統合出欠データのフェッチ
      const attendRes = await fetch(`/api/attendance?teamId=${tid}`);
      if (attendRes.ok) {
        const attendJson = await attendRes.json() as any;
        if (attendJson.success && attendJson.data) {
          setEventsData(attendJson.data.events || []);
          setPlayersData(attendJson.data.players || []);
          setMemberData(attendJson.data.members || []);
          setAttendanceRecords(attendJson.data.attendances || []);
        }
      }

      // グループ情報のフェッチ
      const groupRes = await fetch(`/api/teams/${tid}/groups`);
      if (groupRes.ok) {
        const groupJson = await groupRes.json() as any;
        if (groupJson.success) {
          setGroups(groupJson.data || []);
        }
      }

      // グループ所属メンバー関係のフェッチ
      const groupList = await fetch(`/api/teams/${tid}/groups`).then(r => r.json()).then(j => (j as any).data || []) as Group[];
      const relationsPromises = groupList.map(g => 
        fetch(`/api/teams/${tid}/groups/${g.id}/members`)
          .then(r => r.json())
          .then(j => {
            const res = j as any;
            return res.success && res.data ? res.data.map((m: any) => ({ ...m, groupId: g.id })) : [];
          })
      );
      const allRelations = await Promise.all(relationsPromises);
      setGroupRelations(allRelations.flat());

    } catch (e) {
      console.error(e);
      toast.error("データの読み込みに失敗しました。");
    } finally {
      setIsLoading(false);
    }
  };

  // 管理者権限判定
  const canManage = useMemo(() => {
    const roleUpper = myRole.toUpperCase();
    return roleUpper === "ADMIN" || roleUpper === "MANAGER" || roleUpper === "SYSTEM_ADMIN";
  }, [myRole]);

  // 2. 出欠表のグリッド向けデータ構成
  const filteredMemberIdsByGroup = useMemo(() => {
    if (selectedGroupId === "all") return null;
    const relations = groupRelations.filter(r => r.groupId === selectedGroupId);
    return {
      playerIds: new Set(relations.map(r => r.playerId).filter(Boolean)),
      memberIds: new Set(relations.map(r => r.teamMemberId).filter(Boolean))
    };
  }, [selectedGroupId, groupRelations]);

  // 表示するメンバー一覧の作成（縦軸）
  const displayRows = useMemo(() => {
    const rows: {
      type: "player" | "member";
      id: string;
      name: string;
      uniformNumber?: string;
      memberType?: string;
      avatarUrl?: string | null;
      canEdit: boolean;
    }[] = [];

    // 選手（players）
    if (activeTab === "all" || activeTab === "players") {
      playersData.forEach(p => {
        if (filteredMemberIdsByGroup && !filteredMemberIdsByGroup.playerIds.has(p.id)) return;
        rows.push({
          type: "player",
          id: p.id,
          name: p.name,
          uniformNumber: p.uniformNumber,
          canEdit: canManage
        });
      });
    }

    // スタッフ・指導者・保護者（teamMembers）
    if (activeTab === "all" || activeTab === "staff") {
      membersData.forEach(m => {
        if (filteredMemberIdsByGroup && !filteredMemberIdsByGroup.memberIds.has(m.id)) return;
        const isMe = myUserId && m.userId === myUserId;
        rows.push({
          type: "member",
          id: m.id,
          name: m.name,
          memberType: m.memberType,
          avatarUrl: m.avatarUrl,
          canEdit: canManage || !!isMe
        });
      });
    }

    return rows;
  }, [activeTab, playersData, membersData, filteredMemberIdsByGroup, myUserId, canManage]);

  // 3. 各マスの出欠ステータス検索マップ
  const attendanceMap = useMemo(() => {
    const map: Record<string, AttendanceRecord> = {};
    attendanceRecords.forEach(r => {
      const key = r.playerId 
        ? `event_${r.eventId}_player_${r.playerId}`
        : `event_${r.eventId}_member_${r.memberId}`;
      map[key] = r;
    });
    return map;
  }, [attendanceRecords]);

  // 各日程の出欠集計
  const eventSummaries = useMemo(() => {
    const summaries: Record<string, { present: number; absent: number; late: number; pending: number }> = {};
    
    eventsData.forEach(e => {
      summaries[e.id] = { present: 0, absent: 0, late: 0, pending: 0 };
    });

    displayRows.forEach(row => {
      eventsData.forEach(e => {
        const key = row.type === "player" 
          ? `event_${e.id}_player_${row.id}`
          : `event_${e.id}_member_${row.id}`;
        const record = attendanceMap[key];
        const status = record?.status || "pending";
        
        if (summaries[e.id]) {
          summaries[e.id][status]++;
        }
      });
    });

    return summaries;
  }, [eventsData, displayRows, attendanceMap]);

  // 4. イベント管理アクション
  const openCreateEventModal = () => {
    setEventModalMode("create");
    setEventTitle("");
    setEventLocation("");
    setEventDescription("");
    setEventType("practice");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setEventStartAt(tomorrow.toISOString().split("T")[0]);
    setEventStartVal("09:00");
    setEditingEvent(null);
    setIsEventModalOpen(true);
  };

  const openEditEventModal = (event: Event, e: React.MouseEvent) => {
    e.stopPropagation();
    setEventModalMode("edit");
    setEditingEvent(event);
    setEventTitle(event.title);
    setEventLocation(event.location || "");
    setEventDescription(event.description || "");
    setEventType(event.eventType);
    
    const d = new Date(event.startAt);
    const dateStr = d.toISOString().split("T")[0];
    const timeStr = d.toTimeString().split(" ")[0].slice(0, 5);
    
    setEventStartAt(dateStr);
    setEventStartVal(timeStr);
    setIsEventModalOpen(true);
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim() || !eventStartAt || !eventStartVal) {
      toast.error("タイトルと日時は必須です。");
      return;
    }

    setIsSubmitting(true);
    try {
      const combinedDateTime = `${eventStartAt}T${eventStartVal}:00`;
      const payload = {
        title: eventTitle.trim(),
        startAt: new Date(combinedDateTime).toISOString(),
        eventType,
        location: eventLocation.trim(),
        description: eventDescription.trim()
      };

      const url = eventModalMode === "create" 
        ? `/api/events/${teamId}`
        : `/api/events/${teamId}/${editingEvent?.id}`;

      const res = await fetch(url, {
        method: eventModalMode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const json = await res.json() as any;
      if (!json.success) throw new Error(json.error);

      toast.success(eventModalMode === "create" ? "日程を作成しました" : "日程を更新しました");
      setIsEventModalOpen(false);
      fetchInitialData(teamId);

    } catch (err) {
      console.error(err);
      toast.error("処理に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!window.confirm("このイベントの日程と、紐付いている全メンバーの出欠記録を完全に削除します。よろしいですか？")) {
      return;
    }

    try {
      const res = await fetch(`/api/events/${teamId}/${eventId}`, {
        method: "DELETE"
      });
      const json = await res.json() as any;
      if (!json.success) throw new Error(json.error);

      toast.success("イベント日程を削除しました");
      fetchInitialData(teamId);
    } catch (err) {
      console.error(err);
      toast.error("削除に失敗しました。");
    }
  };

  // 5. 出欠登録モーダル起動
  const openAttendEditModal = (event: Event, row: any, record: AttendanceRecord | null) => {
    setActiveCell({ event, row, record });
    setInputStatus(record?.status || "pending");
    setInputComment(record?.comment || "");
    setInputHasCar(record?.hasCar || false);
    setInputRole(record?.roleInEvent || "player");
    setIsAttendModalOpen(true);
  };

  const handleSaveAttendance = async () => {
    if (!activeCell) return;
    const { event, row } = activeCell;
    setIsSubmitting(true);

    try {
      const payload = {
        eventId: event.id,
        playerId: row.type === "player" ? row.id : null,
        memberId: row.type === "member" ? row.id : null,
        userId: myUserId,
        status: inputStatus,
        hasCar: inputHasCar,
        comment: inputComment.trim(),
        roleInEvent: inputRole
      };

      const res = await fetch("/api/attendance/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const json = await res.json() as any;
      if (!json.success) throw new Error(json.error);

      toast.success("出欠を保存しました");
      
      const updatedRecord = json.data as AttendanceRecord;
      setAttendanceRecords(prev => {
        const filtered = prev.filter(r => 
          !(r.eventId === event.id && 
            (row.type === "player" ? r.playerId === row.id : r.memberId === row.id))
        );
        return [...filtered, updatedRecord];
      });

      setIsAttendModalOpen(false);

    } catch (e) {
      console.error(e);
      toast.error("保存に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCellConfig = (status: AttendanceRecord["status"] = "pending") => {
    switch (status) {
      case "present":
        return { label: "○", bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" };
      case "late":
        return { label: "△", bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20" };
      case "absent":
        return { label: "×", bg: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20" };
      default:
        return { label: "？", bg: "bg-muted text-muted-foreground opacity-40" };
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest animate-pulse">Loading Attendance Board...</p>
        </div>
      </div>
    );
  }

  if (!teamId) {
    return <div className="p-20 text-center text-muted-foreground">チーム情報が選択されていません。</div>;
  }

  return (
    <div className="flex flex-col min-h-screen text-foreground pb-24">
      <main className="flex-1 px-3 sm:px-6 max-w-5xl mx-auto w-full space-y-6 mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        <SectionHeader title="出欠・スケジュール管理" subtitle="ATTENDANCE BOARD" showPulse={true} />

        {/* コントロール・フィルターバー */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card border border-border/40 p-4 rounded-3xl shadow-sm">
          
          {/* 左側：タブ切り替え */}
          <div className="flex items-center gap-1.5 p-1 bg-muted/50 rounded-2xl shrink-0 self-start md:self-auto">
            <button
              onClick={() => setActiveTab("all")}
              className={cn("px-4 py-2 rounded-xl text-xs font-black transition-all", activeTab === "all" ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              全員 ({playersData.length + membersData.length})
            </button>
            <button
              onClick={() => setActiveTab("players")}
              className={cn("px-4 py-2 rounded-xl text-xs font-black transition-all", activeTab === "players" ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              選手 ({playersData.length})
            </button>
            <button
              onClick={() => setActiveTab("staff")}
              className={cn("px-4 py-2 rounded-xl text-xs font-black transition-all", activeTab === "staff" ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              指導者・保護者 ({membersData.length})
            </button>
          </div>

          {/* 右側：グループフィルター & 日程追加ボタン */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            {/* グループ選択 */}
            <div className="flex items-center gap-2 flex-1 md:flex-initial">
              <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
              <Select value={selectedGroupId} onChange={(e: any) => setSelectedGroupId(e.target.value)}>
                <option value="all">すべてのグループ</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </Select>
            </div>

            {/* 管理者用：日程追加ボタン */}
            {canManage && (
              <Button onClick={openCreateEventModal} className="h-10 px-4 rounded-xl font-black shrink-0">
                <Plus className="h-4 w-4 mr-1.5" />
                日程を追加
              </Button>
            )}
          </div>
        </div>

        {/* 伝助風一括マトリックスボード */}
        {eventsData.length === 0 ? (
          <EmptyState 
            icon={CalendarDays} 
            title="登録された予定はありません" 
            description={canManage ? "「日程を追加」ボタンから、練習や試合の日程を追加してください。" : "まだチームスケジュールがありません。"}
          />
        ) : (
          <div className="bg-card border border-border/40 rounded-3xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left table-fixed min-w-[460px]">
                <colgroup>
                  {/* メンバー列: スマホ 85px, PC 180px */}
                  <col className="w-[85px] sm:w-[180px]" />
                  {/* イベント列: 常に 125px */}
                  {eventsData.map(e => (
                    <col key={e.id} className="w-[125px]" />
                  ))}
                </colgroup>
                
                {/* ━ ヘッダー ━ */}
                <thead>
                  <tr className="border-b border-border/50 bg-muted/20">
                    {/* 左端：メンバー枠 */}
                    <th className="p-2 sm:p-4 font-black text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground border-r border-border/40 bg-card sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                      メンバー
                    </th>
                    
                    {/* 右側：イベント日程列 */}
                    {eventsData.map(e => (
                      <th key={e.id} className="p-4 border-r border-border/30 w-[140px] text-center align-top relative group">
                        <div className="space-y-1">
                          
                          {/* 日程種別マーク & 操作ボタンのインライン化 */}
                          <div className="flex items-center justify-between gap-1 mb-1.5">
                            <span className={cn(
                              "inline-block text-[9px] font-black uppercase px-2 py-0.5 rounded-full border tracking-wider shrink-0",
                              e.eventType === 'match' ? 'bg-primary/10 text-primary border-primary/20' : 
                              e.eventType === 'meeting' ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20' : 
                              'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                            )}>
                              {e.eventType === 'match' ? '試合' : e.eventType === 'meeting' ? '会議' : '練習'}
                            </span>

                            {/* 管理者向け日程編集ボタン (インライン配置で常に露出) */}
                            {canManage && (
                              <div className="flex items-center gap-0.5 shrink-0 z-20">
                                <button 
                                  onClick={(event) => openEditEventModal(e, event)}
                                  className="h-5 w-5 rounded bg-background border border-border shadow-xs hover:bg-muted text-foreground flex items-center justify-center cursor-pointer"
                                  title="編集"
                                >
                                  <Edit className="h-2.5 w-2.5" />
                                </button>
                                <button 
                                  onClick={() => handleDeleteEvent(e.id)}
                                  className="h-5 w-5 rounded bg-background border border-destructive/20 shadow-xs hover:bg-destructive/5 text-destructive flex items-center justify-center cursor-pointer"
                                  title="削除"
                                >
                                  <Trash2 className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            )}
                          </div>

                          {/* タイトルと日付 */}
                          <h4 className="font-black text-sm text-foreground truncate max-w-[105px] mx-auto" title={e.title}>
                            {e.title}
                          </h4>
                          <p className="text-[10px] font-extrabold text-muted-foreground uppercase">
                            {new Date(e.startAt).toLocaleDateString("ja-JP", { month: "short", day: "numeric", weekday: "short" })}
                          </p>
                          <p className="text-[9px] font-bold text-muted-foreground/75 leading-none">
                            {new Date(e.startAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                          
                          {/* 場所情報 */}
                          {e.location && (
                            <p className="text-[9px] font-bold text-primary truncate max-w-[110px] mx-auto mt-1 flex items-center justify-center gap-0.5">
                              <MapPin className="h-2.5 w-2.5 shrink-0" /> {e.location}
                            </p>
                          )}

                          <Separator className="my-2 opacity-50" />

                          {/* 集計数 (伝助風) */}
                          <div className="flex items-center justify-center gap-1.5 text-[9px] font-extrabold tracking-tighter">
                            <span className="text-emerald-600 dark:text-emerald-400">○{eventSummaries[e.id]?.present || 0}</span>
                            <span className="text-amber-600 dark:text-amber-400">△{eventSummaries[e.id]?.late || 0}</span>
                            <span className="text-rose-600 dark:text-rose-400">×{eventSummaries[e.id]?.absent || 0}</span>
                          </div>

                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                
                {/* ━ ボディ ━ */}
                <tbody className="divide-y divide-border/40">
                  {displayRows.length === 0 ? (
                    <tr>
                      <td colSpan={eventsData.length + 1} className="p-8 text-center text-muted-foreground font-bold text-sm">
                        条件に一致するメンバーがいません
                      </td>
                    </tr>
                  ) : (
                    displayRows.map((row) => (
                      <tr key={`${row.type}-${row.id}`} className="hover:bg-muted/10 transition-colors">
                        
                        {/* 左端メンバー名列 */}
                        <td className="p-1.5 sm:p-4 font-bold text-sm border-r border-border/40 bg-card sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] h-full overflow-hidden whitespace-nowrap">
                          <div className="flex items-center gap-1 sm:gap-2.5 w-full overflow-hidden">
                            {row.type === "player" ? (
                              <div className="h-8 w-8 rounded-full bg-primary/10 text-primary hidden sm:flex items-center justify-center shrink-0 font-black text-[10px]">
                                {row.uniformNumber ? `#${row.uniformNumber}` : "選"}
                              </div>
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hidden sm:flex items-center justify-center shrink-0 font-black text-[10px]">
                                {row.memberType === "staff" ? "指" : row.memberType === "parent" ? "保" : "他"}
                              </div>
                            )}
                            <div className="min-w-0 flex-1 overflow-hidden">
                              <p className="truncate text-foreground font-black text-[10px] sm:text-sm block overflow-hidden text-ellipsis whitespace-nowrap" title={row.name}>
                                {row.name}
                              </p>
                              <p className="text-[8px] sm:text-[9px] text-muted-foreground leading-none font-bold uppercase mt-0.5 hidden sm:block">
                                {row.type === "player" ? "PLAYER" : row.memberType === "staff" ? "STAFF" : "PARENT"}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* 各日程の出欠セル */}
                        {eventsData.map(e => {
                          const key = row.type === "player" 
                            ? `event_${e.id}_player_${row.id}`
                            : `event_${e.id}_member_${row.id}`;
                          const record = attendanceMap[key];
                          const status = record?.status || "pending";
                          const conf = getCellConfig(status);

                          // 出欠マス
                          return (
                            <td key={e.id} className="p-3 border-r border-border/30 text-center">
                              <div className="flex items-center justify-center">
                                <button
                                  onClick={() => openAttendEditModal(e, row, record)}
                                  disabled={!row.canEdit}
                                  className={cn(
                                    "w-10 h-10 rounded-full flex items-center justify-center font-black text-sm relative transition-all shadow-inner select-none cursor-pointer",
                                    conf.bg,
                                    row.canEdit ? "hover:scale-105 active:scale-95" : "cursor-default disabled:opacity-100"
                                  )}
                                >
                                  {conf.label}
                                  
                                  {/* コメントや車のバッジ表示 */}
                                  {(record?.comment || record?.hasCar) && (
                                    <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-primary flex items-center justify-center text-[7px] text-primary-foreground border border-background shadow-sm">
                                      {record.hasCar ? <Car className="h-2 w-2" /> : <MessageSquare className="h-2 w-2" />}
                                    </span>
                                  )}
                                </button>
                              </div>
                            </td>
                          );
                        })}

                      </tr>
                    ))
                  )}
                </tbody>

              </table>
            </div>
          </div>
        )}

        {/* ━ 管理者用：日程追加・編集モーダル ━ */}
        <Dialog open={isEventModalOpen} onOpenChange={setIsEventModalOpen}>
          <DialogContent className="rounded-[var(--radius-2xl)] bg-card border-border sm:max-w-md" onInteractOutside={(el) => el.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="font-black text-xl">
                {eventModalMode === "create" ? "新しい日程の追加" : "日程の編集"}
              </DialogTitle>
              <DialogDescription className="text-xs font-bold text-muted-foreground">
                出欠確認を行うイベント予定を作成・変更します。
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveEvent} className="space-y-4 pt-2">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">イベント名 (必須)</label>
                <Input
                  value={eventTitle}
                  onChange={e => setEventTitle(e.target.value)}
                  required
                  placeholder="例: 第10回 練習試合 vs タイガース"
                  className="h-11 rounded-xl font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">日付 (必須)</label>
                  <Input
                    type="date"
                    value={eventStartAt}
                    onChange={e => setEventStartAt(e.target.value)}
                    required
                    className="h-11 rounded-xl font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">開始時間 (必須)</label>
                  <Input
                    type="time"
                    value={eventStartVal}
                    onChange={e => setEventStartVal(e.target.value)}
                    required
                    className="h-11 rounded-xl font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">予定カテゴリ</label>
                  <Select value={eventType} onChange={(val: any) => setEventType(val.target.value)}>
                    <option value="practice">練習 (Practice)</option>
                    <option value="match">試合 (Match)</option>
                    <option value="meeting">会議 (Meeting)</option>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">場所</label>
                  <Input
                    value={eventLocation}
                    onChange={e => setEventLocation(e.target.value)}
                    placeholder="例: 中央河川敷グラウンドA"
                    className="h-11 rounded-xl font-bold"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">詳細説明</label>
                <textarea
                  value={eventDescription}
                  onChange={e => setEventDescription(e.target.value)}
                  placeholder="持ち物や注意事項など"
                  rows={2}
                  className="w-full rounded-xl border border-border bg-muted/20 px-4 py-2.5 text-sm font-bold shadow-xs transition-all duration-300 focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/20 focus-visible:bg-background resize-none"
                />
              </div>

              <DialogFooter className="flex gap-3 pt-3 sm:justify-start">
                <Button type="button" variant="outline" onClick={() => setIsEventModalOpen(false)} className="flex-1 h-12 rounded-xl font-black">
                  キャンセル
                </Button>
                <Button type="submit" disabled={isSubmitting} className="flex-1 h-12 rounded-xl font-black text-white">
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存する"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* ━ 出欠編集ダイアログ (マスをタップした時にポップアップ) ━ */}
        <Dialog open={isAttendModalOpen} onOpenChange={setIsAttendModalOpen}>
          <DialogContent className="rounded-[var(--radius-2xl)] bg-card border-border sm:max-w-xs" onInteractOutside={(el) => el.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="font-black text-base">
                {activeCell?.row.name} の出欠登録
              </DialogTitle>
              <DialogDescription className="text-[10px] font-bold text-muted-foreground leading-snug">
                {activeCell?.event.title} <br />
                {activeCell?.event.startAt && new Date(activeCell.event.startAt).toLocaleString("ja-JP", { month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" })}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              
              {/* 出欠の三択ボタン */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setInputStatus("present")}
                  className={cn(
                    "py-3 px-1 rounded-xl text-xs font-black border transition-all cursor-pointer",
                    inputStatus === "present" ? "bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400" : "border-border hover:bg-muted"
                  )}
                >
                  出席 (○)
                </button>
                <button
                  onClick={() => setInputStatus("late")}
                  className={cn(
                    "py-3 px-1 rounded-xl text-xs font-black border transition-all cursor-pointer",
                    inputStatus === "late" ? "bg-amber-500/10 border-amber-500 text-amber-600 dark:text-amber-400" : "border-border hover:bg-muted"
                  )}
                >
                  遅刻/未定 (△)
                </button>
                <button
                  onClick={() => setInputStatus("absent")}
                  className={cn(
                    "py-3 px-1 rounded-xl text-xs font-black border transition-all cursor-pointer",
                    inputStatus === "absent" ? "bg-rose-500/10 border-rose-500 text-rose-600 dark:text-rose-400" : "border-border hover:bg-muted"
                  )}
                >
                  欠席 (×)
                </button>
              </div>

              {/* 配車スタッフ対応 */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30 border border-border/40">
                <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                  <Car className="h-3.5 w-3.5" /> 車出しOK
                </span>
                <input
                  type="checkbox"
                  checked={inputHasCar}
                  onChange={(el) => setInputHasCar(el.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary accent-primary cursor-pointer"
                />
              </div>

              {/* コメント入力 */}
              <div className="space-y-1">
                <label className="text-[9px] font-black text-zinc-500 uppercase tracking-wider px-1">コメント</label>
                <Input
                  value={inputComment}
                  onChange={(el) => setInputComment(el.target.value)}
                  placeholder="遅刻連絡、理由など"
                  className="h-10 rounded-xl text-xs font-bold"
                />
              </div>
            </div>

            <DialogFooter className="flex gap-2 pt-2 sm:justify-start">
              <Button type="button" variant="outline" onClick={() => setIsAttendModalOpen(false)} className="flex-1 h-10 rounded-xl font-bold text-xs">
                キャンセル
              </Button>
              <Button onClick={handleSaveAttendance} disabled={isSubmitting} className="flex-1 h-10 rounded-xl font-black text-xs text-white">
                {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "登録する"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </main>
    </div>
  );
}
