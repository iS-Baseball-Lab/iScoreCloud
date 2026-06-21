// filepath: src/app/(protected)/attendance/page.tsx
"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
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
  endAt?: string | number | Date | null;
  eventType: "match" | "practice" | "meeting" | "camp";
  description: string | null;
  location: string | null;
  dutyGroup?: string | null;
  pmStartAt?: string | number | Date | null;
  pmEndAt?: string | number | Date | null;
  pmLocation?: string | null;
}

interface Player {
  id: string;
  teamId: string;
  name: string;
  nameKana?: string;
  uniformNumber: string;
  isActive: boolean;
  userId?: string | null;
  profileImageUrl?: string | null;
}

interface Member {
  id: string; // memberId
  teamId: string;
  userId: string | null;
  name: string;
  nameKana?: string;
  memberType: 'staff' | 'parent' | 'other' | 'player';
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
  status: "present" | "absent" | "pending" | "late" | "partial";
  roleInEvent: string;
  hasCar: boolean;
  carId?: string | null;
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
  const router = useRouter();
  const [teamId, setTeamId] = useState<string>("");
  const [eventsData, setEventsData] = useState<Event[]>([]);
  const [playersData, setPlayersData] = useState<Player[]>([]);
  const [membersData, setMemberData] = useState<Member[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupRelations, setGroupRelations] = useState<GroupMemberRelation[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string>("");
  const [allCars, setAllCars] = useState<any[]>([]); // 🌟 車両マスタ用状態
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

  // 🎒 複数日程一括出欠登録モーダル状態
  const [isBatchModalOpen, setIsBatchModalOpen] = useState<boolean>(false);
  const [batchTargetRow, setBatchTargetRow] = useState<any | null>(null);
  const [batchAttendances, setBatchAttendances] = useState<any[]>([]); // Array of { eventId, title, startAt, eventType, status, hasCar, comment }

  // 過去予定の表示制御状態 (デフォルトはOFF＝今日以降を表示)
  const [showPastEvents, setShowPastEvents] = useState<boolean>(false);

  // 過去予定のフィルタリングロジック
  const filteredEvents = useMemo(() => {
    if (showPastEvents) return eventsData;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return eventsData.filter(e => new Date(e.startAt) >= today);
  }, [eventsData, showPastEvents]);

  // イベント入力用フォーム状態
  const [eventTitle, setEventTitle] = useState<string>("");
  const [eventStartAt, setEventStartAt] = useState<string>("");
  const [eventStartVal, setEventStartVal] = useState<string>(""); // 時間用 hh:mm
  const [eventEndVal, setEventEndVal] = useState<string>(""); // 終了時間用 hh:mm
  const [eventType, setEventType] = useState<"match" | "practice" | "meeting" | "camp">("practice");
  const [eventLocation, setEventLocation] = useState<string>("");
  const [eventDescription, setEventDescription] = useState<string>("");
  const [eventDutyGroup, setEventDutyGroup] = useState<string>(""); // 当番班
  const [hasPmSchedule, setHasPmSchedule] = useState<boolean>(false);
  const [eventPmStartVal, setEventPmStartVal] = useState<string>("");
  const [eventPmEndVal, setEventPmEndVal] = useState<string>("");
  const [eventPmLocation, setEventPmLocation] = useState<string>("");

  // 出欠入力用フォーム状態
  const [inputStatus, setInputStatus] = useState<"present" | "absent" | "pending" | "late" | "partial">("pending");
  const [inputComment, setInputComment] = useState<string>("");
  const [inputHasCar, setInputHasCar] = useState<boolean>(false);
  const [inputCarId, setInputCarId] = useState<string>("");
  const [inputRole, setInputRole] = useState<string>("player");

  // 🎒 複数日程一括編集モーダルの制御と保存処理
  const openBatchEditModal = (row: any) => {
    if (!row.canEdit) {
      toast.error("このメンバーの出欠を編集する権限がありません。");
      return;
    }
    setBatchTargetRow(row);
    
    // 表示されている全日程（filteredEvents）について、現在の出欠データをマッピング
    const list = filteredEvents.map(e => {
      const key = row.type === "player" 
        ? `event_${e.id}_player_${row.id}`
        : `event_${e.id}_member_${row.id}`;
      const record = attendanceMap[key];
      return {
        eventId: e.id,
        title: e.title,
        startAt: e.startAt,
        eventType: e.eventType,
        status: record?.status || "pending",
        hasCar: !!record?.hasCar,
        carId: record?.carId || "",
        comment: record?.comment || ""
      };
    });
    setBatchAttendances(list);
    setIsBatchModalOpen(true);
  };

  const updateBatchItem = (eventId: string, field: string, value: any) => {
    setBatchAttendances(prev => prev.map(item => {
      if (item.eventId !== eventId) return item;
      return {
        ...item,
        [field]: value
      };
    }));
  };

  const handleSaveBatchAttendance = async () => {
    if (!batchTargetRow || !teamId) return;
    setIsSubmitting(true);
    try {
      const promises = batchAttendances.map(item => {
        const body = {
          eventId: item.eventId,
          playerId: batchTargetRow.type === "player" ? batchTargetRow.id : null,
          memberId: batchTargetRow.type === "member" ? batchTargetRow.id : null,
          userId: batchTargetRow.userId || null,
          status: item.status,
          hasCar: item.hasCar,
          carId: item.hasCar ? (item.carId || null) : null,
          comment: item.comment,
        };
        return fetch("/api/attendance/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        }).then(r => r.json() as Promise<{ success: boolean; error?: string }>);
      });

      const results = await Promise.all(promises);
      const failed = results.filter(r => !r.success);
      if (failed.length > 0) {
        throw new Error(failed[0].error || "一部の日程の出欠保存に失敗しました。");
      }

      toast.success(`${batchTargetRow.name} の出欠スケジュールを一括保存しました！`);
      setIsBatchModalOpen(false);
      setBatchTargetRow(null);
      fetchInitialData(teamId);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "一括保存中にエラーが発生しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

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

      // 車両リストのフェッチ
      const carsRes = await fetch(`/api/carpools/cars/list?teamId=${tid}`);
      if (carsRes.ok) {
        const carsJson = await carsRes.json() as any;
        if (carsJson.success) {
          setAllCars(carsJson.data || []);
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
        const isMe = myUserId && p.userId === myUserId;
        rows.push({
          type: "player",
          id: p.id,
          name: p.name,
          uniformNumber: p.uniformNumber,
          avatarUrl: p.profileImageUrl,
          canEdit: canManage || !!isMe
        });
      });
    }

    // スタッフ・指導者・保護者（teamMembers）
    if (activeTab === "all" || activeTab === "staff") {
      membersData.forEach(m => {
        if (m.memberType === "player") return; // 🌟 選手は除外する
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
    const summaries: Record<string, { present: number; absent: number; late: number; pending: number; partial: number }> = {};
    
    filteredEvents.forEach(e => {
      summaries[e.id] = { present: 0, absent: 0, late: 0, pending: 0, partial: 0 };
    });

    displayRows.forEach(row => {
      filteredEvents.forEach(e => {
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
  }, [filteredEvents, displayRows, attendanceMap]);

  // 4. イベント管理アクション
  const openCreateEventModal = () => {
    setEventModalMode("create");
    setEventTitle("");
    setEventLocation("");
    setEventDescription("");
    setEventType("practice");
    setEventDutyGroup("");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const day = String(tomorrow.getDate()).padStart(2, "0");
    setEventStartAt(`${year}-${month}-${day}`);
    setEventStartVal("08:00");
    setEventEndVal("12:00");
    setHasPmSchedule(false);
    setEventPmStartVal("12:00");
    setEventPmEndVal("18:00");
    setEventPmLocation("");
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
    setEventDutyGroup(event.dutyGroup || "");
    
    const d = new Date(event.startAt);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;
    const timeStr = d.toTimeString().split(" ")[0].slice(0, 5);
    
    setEventStartAt(dateStr);
    setEventStartVal(timeStr);

    if (event.endAt) {
      const endD = new Date(event.endAt);
      setEventEndVal(endD.toTimeString().split(" ")[0].slice(0, 5));
    } else {
      setEventEndVal("");
    }

    if (event.pmStartAt) {
      setHasPmSchedule(true);
      const pmStartD = new Date(event.pmStartAt);
      setEventPmStartVal(pmStartD.toTimeString().split(" ")[0].slice(0, 5));
      if (event.pmEndAt) {
        const pmEndD = new Date(event.pmEndAt);
        setEventPmEndVal(pmEndD.toTimeString().split(" ")[0].slice(0, 5));
      } else {
        setEventPmEndVal("");
      }
      setEventPmLocation(event.pmLocation || "");
    } else {
      setHasPmSchedule(false);
      setEventPmStartVal("12:00");
      setEventPmEndVal("18:00");
      setEventPmLocation("");
    }

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
      const [year, month, day] = eventStartAt.split("-").map(Number);
      const [hour, minute] = eventStartVal.split(":").map(Number);
      const startDate = new Date(year, month - 1, day, hour, minute, 0);

      let endDate = null;
      if (eventEndVal) {
        const [endHour, endMinute] = eventEndVal.split(":").map(Number);
        endDate = new Date(year, month - 1, day, endHour, endMinute, 0);
      }

      let pmStartIso = null;
      let pmEndIso = null;
      if (hasPmSchedule && eventPmStartVal) {
        const [pmHour, pmMin] = eventPmStartVal.split(":").map(Number);
        const pmStartDate = new Date(year, month - 1, day, pmHour, pmMin, 0);
        pmStartIso = pmStartDate.toISOString();

        if (eventPmEndVal) {
          const [pmEndHour, pmEndMin] = eventPmEndVal.split(":").map(Number);
          const pmEndDate = new Date(year, month - 1, day, pmEndHour, pmEndMin, 0);
          pmEndIso = pmEndDate.toISOString();
        }
      }

      const payload = {
        title: eventTitle.trim(),
        startAt: startDate.toISOString(),
        endAt: endDate ? endDate.toISOString() : null,
        eventType,
        location: eventLocation.trim(),
        description: eventDescription.trim(),
        dutyGroup: eventDutyGroup.trim() || null,
        pmStartAt: pmStartIso,
        pmEndAt: pmEndIso,
        pmLocation: hasPmSchedule ? eventPmLocation.trim() || null : null
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
    setInputCarId(record?.carId || "");
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
        carId: inputHasCar ? (inputCarId || null) : null,
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
        return { label: "◎", bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" };
      case "partial":
        return { label: "○", bg: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20" };
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

          {/* 右側：グループフィルター & 過去予定トグル & 日程追加ボタン */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* 過去予定トグル */}
            <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground bg-muted/40 hover:bg-muted/70 px-3.5 py-2 rounded-2xl border border-border/40 cursor-pointer select-none transition-colors">
              <input
                type="checkbox"
                checked={showPastEvents}
                onChange={(e) => setShowPastEvents(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary accent-primary cursor-pointer"
              />
              <span>過去の予定を表示</span>
            </label>

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
        {filteredEvents.length === 0 ? (
          <EmptyState 
            icon={CalendarDays} 
            title="登録された予定はありません" 
            description={canManage ? "「日程を追加」ボタンから、練習や試合の日程を追加してください。" : "まだチームスケジュールがありません。"}
          />
        ) : (
          <div className="bg-card border border-border/40 rounded-3xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-250px)] md:max-h-[calc(100vh-290px)] scrollbar-thin">
              <table className="w-full border-collapse text-left table-fixed min-w-[420px]">
                <colgroup>
                  {/* メンバー列: スマホ 90px, PC 110px */}
                  <col className="w-[90px] sm:w-[110px]" />
                  {/* イベント列: 常に 96px */}
                  {filteredEvents.map(e => (
                    <col key={e.id} className="w-[96px]" />
                  ))}
                </colgroup>
                
                {/* ━ ヘッダー ━ */}
                <thead className="relative z-20">
                  <tr className="border-b border-border/50 bg-muted/20">
                    <th className="py-2.5 px-1.5 sm:py-4 sm:px-2.5 font-black text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground bg-card sticky left-0 top-0 z-35 shadow-[4px_0_8px_-3px_rgba(0,0,0,0.15)] dark:shadow-[4px_0_8px_-3px_rgba(0,0,0,0.5)] after:content-[''] after:absolute after:right-0 after:top-0 after:bottom-0 after:w-[1px] after:bg-border/80">
                      メンバー
                    </th>
                    
                    {/* 右側：イベント日程列 */}
                    {filteredEvents.map(e => (
                      <th key={e.id} className="p-2.5 border-r border-border/30 text-center align-top relative group sticky top-0 z-25 bg-card">
                        <div className="space-y-1">
                          
                          {/* 日程種別マーク & 操作ボタンのインライン化 */}
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className={cn(
                              "inline-block text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full border tracking-wider shrink-0",
                              e.eventType === 'match' ? 'bg-primary/10 text-primary border-primary/20' : 
                              e.eventType === 'meeting' ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20' : 
                              e.eventType === 'camp' ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20' : 
                              'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                            )}>
                              {e.eventType === 'match' ? '試合' : e.eventType === 'meeting' ? '会議' : e.eventType === 'camp' ? '合宿' : '練習'}
                            </span>

                            {/* 管理者向け日程編集ボタン (インライン配置で常に露出) */}
                            {canManage && (
                              <div className="flex items-center gap-0.5 shrink-0">
                                <button 
                                  onClick={(event) => openEditEventModal(e, event)}
                                  className="h-4.5 w-4.5 rounded bg-background border border-border shadow-xs hover:bg-muted text-foreground flex items-center justify-center cursor-pointer"
                                  title="編集"
                                >
                                  <Edit className="h-2 w-2" />
                                </button>
                                <button 
                                  onClick={() => handleDeleteEvent(e.id)}
                                  className="h-4.5 w-4.5 rounded bg-background border border-destructive/20 shadow-xs hover:bg-destructive/5 text-destructive flex items-center justify-center cursor-pointer"
                                  title="削除"
                                >
                                  <Trash2 className="h-2 w-2" />
                                </button>
                              </div>
                            )}
                          </div>

                          {/* タイトルと日付 */}
                          <h4 className="font-black text-xs text-foreground truncate max-w-[76px] mx-auto" title={e.title}>
                            {e.title}
                          </h4>
                          <p className="text-[9px] font-extrabold text-muted-foreground uppercase">
                            {new Date(e.startAt).toLocaleDateString("ja-JP", { month: "short", day: "numeric", weekday: "short" })}
                          </p>
                          
                           {/* ☀️ 午前の時間と場所 */}
                           <div className="text-[8px] font-bold text-muted-foreground/90 space-y-0.5 mt-1">
                             <p className="leading-none border-b border-border/20 pb-0.5 text-zinc-500 dark:text-zinc-400 font-extrabold">
                               ☀️ {(() => {
                                 const startD = new Date(e.startAt);
                                 const startTime = startD.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
                                 if (!e.endAt) return startTime;
                                 const endD = new Date(e.endAt);
                                 const endTime = endD.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
                                 return `${startTime}〜${endTime}`;
                               })()}
                             </p>
                             {e.location && (
                               <p className="text-[8px] font-extrabold text-blue-600 dark:text-blue-400 truncate max-w-[84px] mx-auto flex items-center justify-center gap-0.5" title={e.location}>
                                 <MapPin className="h-2 w-2 shrink-0 text-blue-500/70" /> {e.location}
                               </p>
                             )}
                           </div>
 
                           {/* 🌙 午後の時間と場所 (登録されている場合のみ表示) */}
                           {e.pmStartAt && (
                             <div className="text-[8px] font-bold text-muted-foreground/90 space-y-0.5 mt-1.5 pt-1.5 border-t border-dashed border-border/40">
                               <p className="leading-none border-b border-border/20 pb-0.5 text-zinc-500 dark:text-zinc-400 font-extrabold">
                                 🌙 {(() => {
                                   const pmStartD = new Date(e.pmStartAt!);
                                   const pmStartTime = pmStartD.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
                                   if (!e.pmEndAt) return pmStartTime;
                                   const pmEndD = new Date(e.pmEndAt);
                                   const pmEndTime = pmEndD.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
                                   return `${pmStartTime}〜${pmEndTime}`;
                                 })()}
                               </p>
                               {e.pmLocation && (
                                 <p className="text-[8px] font-extrabold text-blue-600 dark:text-blue-400 truncate max-w-[84px] mx-auto flex items-center justify-center gap-0.5" title={e.pmLocation}>
                                   <MapPin className="h-2 w-2 shrink-0 text-blue-500/70" /> {e.pmLocation}
                                 </p>
                               )}
                             </div>
                           )}
 
                           {/* 当番情報 */}
                           {e.dutyGroup && (
                             <div className="mt-1">
                               <span className="text-[8px] font-extrabold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded-xs inline-block truncate max-w-[84px]">
                                 当番: {e.dutyGroup}
                               </span>
                             </div>
                           )}

                          <Separator className="my-1.5 opacity-50" />

                          {/* 集計数 (伝助風) */}
                          <div className="flex items-center justify-center gap-1 text-[8px] font-extrabold tracking-tighter">
                            <span className="text-emerald-600 dark:text-emerald-400">◎{eventSummaries[e.id]?.present || 0}</span>
                            <span className="text-sky-600 dark:text-sky-400">○{eventSummaries[e.id]?.partial || 0}</span>
                            <span className="text-amber-600 dark:text-amber-400">△{eventSummaries[e.id]?.late || 0}</span>
                            <span className="text-rose-600 dark:text-rose-400">×{eventSummaries[e.id]?.absent || 0}</span>
                          </div>

                           {/* 🚗 配車・道具管理ボタン (試合・合宿のみ) - 一番下(カウントの下)に配置 */}
                           {(e.eventType === 'match' || e.eventType === 'camp') && (
                             <div className="pt-1.5 mt-1.5 border-t border-dashed border-border/20">
                               <button
                                 onClick={() => router.push(`/attendance/carpool?eventId=${e.id}`)}
                                 className="w-full py-1 rounded bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary flex items-center justify-center text-[8px] font-black cursor-pointer shadow-xs transition-colors"
                                 title="配車・道具管理"
                               >
                                 <Car className="h-2.5 w-2.5 mr-0.5" /> 配車・道具管理
                               </button>
                             </div>
                           )}

                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                
                {/* ━ ボディ ━ */}
                <tbody className="divide-y divide-border/40">
                  {displayRows.length === 0 ? (
                    <tr>
                      <td colSpan={filteredEvents.length + 1} className="p-8 text-center text-muted-foreground font-bold text-sm">
                        条件に一致するメンバーがいません
                      </td>
                    </tr>
                  ) : (
                    displayRows.map((row, idx) => {
                      const isEven = idx % 2 === 0;
                      // 奇数偶数行の背景色（不透明な色を指定して、stickyの背景が透けないようにする）
                      const rowBgClass = isEven ? "bg-muted" : "bg-card";
                      return (
                        <tr key={`${row.type}-${row.id}`} className={cn("hover:bg-muted/60 transition-colors", rowBgClass)}>
                          
                          {/* 左端：メンバー名列 */}
                          <td 
                            onClick={() => row.canEdit && openBatchEditModal(row)}
                            className={cn(
                              "py-2.5 px-1.5 sm:py-4 sm:px-2.5 font-bold sticky left-0 z-10 shadow-[4px_0_8px_-3px_rgba(0,0,0,0.15)] dark:shadow-[4px_0_8px_-3px_rgba(0,0,0,0.5)] transition-colors select-none group after:content-[''] after:absolute after:right-0 after:top-0 after:bottom-0 after:w-[1px] after:bg-border/80",
                              rowBgClass,
                              row.canEdit ? "cursor-pointer hover:bg-muted/80" : "cursor-default"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              {row.type === "player" ? (
                                row.avatarUrl ? (
                                  <img src={row.avatarUrl} alt={row.name} className="h-6 w-6 rounded-full object-cover shrink-0 border border-zinc-200 block" />
                                ) : (
                                  <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 font-black text-[8px]">
                                    {row.uniformNumber ? `#${row.uniformNumber}` : "選"}
                                  </div>
                                )
                              ) : (
                                row.avatarUrl ? (
                                  <img src={row.avatarUrl} alt={row.name} className="h-6 w-6 rounded-full object-cover shrink-0 border border-zinc-200 block" />
                                ) : (
                                  <div className="h-6 w-6 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 font-black text-[8px]">
                                    {row.memberType === "staff" ? "指" : row.memberType === "parent" ? "保" : row.memberType === "player" ? "選" : "他"}
                                  </div>
                                )
                              )}
                              <div className="min-w-0 flex-1 overflow-hidden">
                                <p className={cn(
                                  "truncate text-foreground font-black text-[9px] sm:text-xs block overflow-hidden text-ellipsis whitespace-nowrap",
                                  row.canEdit && "group-hover:underline decoration-primary decoration-2"
                                )} title={row.name}>
                                  {row.name}
                                </p>
                                <p className="text-[7px] text-muted-foreground leading-none font-bold uppercase mt-0.5 block">
                                  {row.type === "player" || row.memberType === "player" ? "PLAYER" : row.memberType === "staff" ? "STAFF" : row.memberType === "parent" ? "PARENT" : "OTHER"}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* 各イベントのステータスセル */}
                          {filteredEvents.map(e => {
                            const key = row.type === "player" 
                              ? `event_${e.id}_player_${row.id}`
                              : `event_${e.id}_member_${row.id}`;
                            const record = attendanceMap[key];
                            const conf = getCellConfig(record?.status || "pending");
                            
                            return (
                              <td key={e.id} className="p-0.5 sm:p-1 border-r border-border/30 text-center">
                                <div className="flex justify-center">
                                  <button
                                    onClick={() => row.canEdit && openAttendEditModal(e, row, record || null)}
                                    className={cn(
                                      "relative h-7 w-7 rounded-lg flex items-center justify-center font-black text-xs shadow-sm transition-transform active:scale-90",
                                      conf.bg,
                                      !row.canEdit && "cursor-default opacity-60"
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
                      );
                    })
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

              {/* 予定カテゴリ & 当番班 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">予定カテゴリ</label>
                  <Select value={eventType} onChange={(val: any) => setEventType(val.target.value)}>
                    <option value="practice">練習 (Practice)</option>
                    <option value="match">試合 (Match)</option>
                    <option value="meeting">会議 (Meeting)</option>
                    <option value="camp">合宿 (Camp)</option>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">当番班 (任意)</label>
                  <Input
                    value={eventDutyGroup}
                    onChange={e => setEventDutyGroup(e.target.value)}
                    placeholder="例: A班、お茶当番など"
                    className="h-11 rounded-xl font-bold"
                  />
                </div>
              </div>

              <Separator className="opacity-50 my-2" />

              {/* ☀️ 午前の予定セクション */}
              <div className="space-y-3 bg-muted/20 p-3 rounded-2xl border border-border/40">
                <h5 className="text-[10px] font-black text-primary flex items-center gap-1 uppercase tracking-wider">
                  ☀️ 午前の部
                </h5>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-zinc-500">開始時間 (必須)</label>
                    <Input
                      type="time"
                      value={eventStartVal}
                      onChange={e => setEventStartVal(e.target.value)}
                      required
                      className="h-10 rounded-xl font-bold text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-zinc-500">終了時間 (任意)</label>
                    <Input
                      type="time"
                      value={eventEndVal}
                      onChange={e => setEventEndVal(e.target.value)}
                      className="h-10 rounded-xl font-bold text-xs"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-zinc-500">場所</label>
                  <Input
                    value={eventLocation}
                    onChange={e => setEventLocation(e.target.value)}
                    placeholder="例: 河川敷グラウンドA"
                    className="h-10 rounded-xl font-bold text-xs"
                  />
                </div>
              </div>

              {/* 🌙 午後の予定有無のトグル */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/40 border border-border/40">
                <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                  🌙 午後の予定もある
                </span>
                <input
                  type="checkbox"
                  checked={hasPmSchedule}
                  onChange={(el) => setHasPmSchedule(el.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary accent-primary cursor-pointer"
                />
              </div>

              {/* 🌙 午後の予定セクション (トグルがONの時のみ表示) */}
              {hasPmSchedule && (
                <div className="space-y-3 bg-muted/30 p-3 rounded-2xl border border-border/40 animate-in fade-in slide-in-from-top-2 duration-300">
                  <h5 className="text-[10px] font-black text-indigo-500 flex items-center gap-1 uppercase tracking-wider">
                    🌙 午後の部
                  </h5>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-zinc-500">開始時間 (必須)</label>
                      <Input
                        type="time"
                        value={eventPmStartVal}
                        onChange={e => setEventPmStartVal(e.target.value)}
                        required={hasPmSchedule}
                        className="h-10 rounded-xl font-bold text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-zinc-500">終了時間 (任意)</label>
                      <Input
                        type="time"
                        value={eventPmEndVal}
                        onChange={e => setEventPmEndVal(e.target.value)}
                        className="h-10 rounded-xl font-bold text-xs"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-zinc-500">場所</label>
                    <Input
                      value={eventPmLocation}
                      onChange={e => setEventPmLocation(e.target.value)}
                      placeholder="例: 学校体育館"
                      className="h-10 rounded-xl font-bold text-xs"
                    />
                  </div>
                </div>
              )}

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

              <DialogFooter className="flex flex-col gap-2 w-full pt-2 sm:flex-col">
                <Button type="submit" disabled={isSubmitting} className="w-full h-12 rounded-xl font-black text-white text-sm">
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存する"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setIsEventModalOpen(false)} className="w-full h-12 rounded-xl font-bold text-sm">
                  キャンセル
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
                {activeCell?.event.dutyGroup && ` | 当番: ${activeCell.event.dutyGroup}`}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              
              {/* 出欠の四択ボタン */}
              <div className="grid grid-cols-4 gap-1">
                <button
                  onClick={() => setInputStatus("present")}
                  className={cn(
                    "py-2 px-0.5 rounded-xl border transition-all cursor-pointer flex flex-col items-center justify-center min-h-[52px]",
                    inputStatus === "present" ? "bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400" : "border-border hover:bg-muted"
                  )}
                >
                  <span className="text-[9px] font-black leading-none">当番参加</span>
                  <span className="text-sm font-black mt-1">◎</span>
                </button>
                <button
                  onClick={() => setInputStatus("partial")}
                  className={cn(
                    "py-2 px-0.5 rounded-xl border transition-all cursor-pointer flex flex-col items-center justify-center min-h-[52px]",
                    inputStatus === "partial" ? "bg-sky-500/10 border-sky-500 text-sky-600 dark:text-sky-400" : "border-border hover:bg-muted"
                  )}
                >
                  <span className="text-[9px] font-black leading-none">参加</span>
                  <span className="text-sm font-black mt-1">○</span>
                </button>
                <button
                  onClick={() => setInputStatus("late")}
                  className={cn(
                    "py-2 px-0.5 rounded-xl border transition-all cursor-pointer flex flex-col items-center justify-center min-h-[52px]",
                    inputStatus === "late" ? "bg-amber-500/10 border-amber-500 text-amber-600 dark:text-amber-400" : "border-border hover:bg-muted"
                  )}
                >
                  <span className="text-[8px] font-bold leading-none whitespace-nowrap">試合なら</span>
                  <span className="text-sm font-black mt-1">△</span>
                </button>
                <button
                  onClick={() => setInputStatus("absent")}
                  className={cn(
                    "py-2 px-0.5 rounded-xl border transition-all cursor-pointer flex flex-col items-center justify-center min-h-[52px]",
                    inputStatus === "absent" ? "bg-rose-500/10 border-rose-500 text-rose-600 dark:text-rose-400" : "border-border hover:bg-muted"
                  )}
                >
                  <span className="text-[9px] font-black leading-none">不参加</span>
                  <span className="text-sm font-black mt-1">×</span>
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
                  onChange={(el) => {
                    const checked = el.target.checked;
                    setInputHasCar(checked);
                    if (!checked) setInputCarId("");
                  }}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary accent-primary cursor-pointer"
                />
              </div>

              {/* 使用車両の選択 */}
              {inputHasCar && (
                <div className="space-y-1 animate-in fade-in duration-200">
                  <label className="text-[9px] font-black text-zinc-500 uppercase tracking-wider px-1">使用する車両</label>
                  <select
                    value={inputCarId}
                    onChange={(e) => setInputCarId(e.target.value)}
                    className="w-full h-10 rounded-xl border border-border bg-card px-3 text-xs font-bold shadow-xs focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 cursor-pointer"
                  >
                    <option value="">-- 車両を指定しない --</option>
                    {activeCell && allCars
                      .filter(car => car.ownerId === activeCell.row.id || car.ownerId2 === activeCell.row.id)
                      .map(car => (
                        <option key={car.id} value={car.id}>
                          {car.name} {car.numberPlate ? `[${car.numberPlate}]` : ""} (定員:{car.capacity}人)
                        </option>
                      ))
                    }
                  </select>
                </div>
              )}

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

            <DialogFooter className="flex flex-col gap-2 w-full pt-2 sm:flex-col">
              <Button onClick={handleSaveAttendance} disabled={isSubmitting} className="w-full h-12 rounded-xl font-black text-xs text-white">
                {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "登録する"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setIsAttendModalOpen(false)} className="w-full h-12 rounded-xl font-bold text-xs">
                キャンセル
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 🎒 複数日程一括編集ダイアログ */}
        <Dialog open={isBatchModalOpen} onOpenChange={setIsBatchModalOpen}>
          <DialogContent className="rounded-[var(--radius-2xl)] bg-card border-border sm:max-w-md max-h-[85vh] flex flex-col p-0 overflow-hidden" onInteractOutside={(el) => el.preventDefault()}>
            <DialogHeader className="p-6 pb-2">
              <DialogTitle className="font-black text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                {batchTargetRow?.name} の出欠スケジュール一括登録
              </DialogTitle>
              <DialogDescription className="text-xs font-bold text-muted-foreground">
                表示されているすべての日程の出欠を一括で設定・保存します。
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-6 py-2 space-y-4 divide-y divide-border/30">
              {batchAttendances.map((item, index) => {
                const dateStr = new Date(item.startAt).toLocaleDateString("ja-JP", { month: "short", day: "numeric", weekday: "short" });
                const timeStr = new Date(item.startAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
                // 大人メンバー（スタッフ・保護者）かどうかの判定。選手以外に車出しトグルを表示
                const isAdult = batchTargetRow?.type === "member" && batchTargetRow?.memberType !== "player";

                return (
                  <div key={item.eventId} className={cn("pt-4 space-y-3", index === 0 && "pt-0")}>
                    {/* 日程タイトルと日時 */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className={cn(
                            "inline-block text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full border tracking-wider",
                            item.eventType === 'match' ? 'bg-primary/10 text-primary border-primary/20' : 
                            item.eventType === 'meeting' ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20' : 
                            item.eventType === 'camp' ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20' : 
                            'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                          )}>
                            {item.eventType === 'match' ? '試合' : item.eventType === 'meeting' ? '会議' : item.eventType === 'camp' ? '合宿' : '練習'}
                          </span>
                          <h4 className="font-black text-sm text-foreground truncate max-w-[180px]" title={item.title}>
                            {item.title}
                          </h4>
                        </div>
                        <p className="text-[10px] font-extrabold text-muted-foreground">
                          {dateStr} {timeStr}
                        </p>
                      </div>
                    </div>

                    {/* 出欠の選択ボタン群 & 車出し（大人用） & コメント */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {/* 出欠の四択ボタン */}
                      <div className="grid grid-cols-4 gap-1">
                        <button
                          type="button"
                          onClick={() => updateBatchItem(item.eventId, "status", "present")}
                          className={cn(
                            "py-1.5 px-0.5 rounded-lg border transition-all cursor-pointer flex flex-col items-center justify-center min-h-[44px]",
                            item.status === "present" ? "bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400" : "border-border hover:bg-muted"
                          )}
                          title="当番参加"
                        >
                          <span className="text-[8px] font-black leading-none">当番</span>
                          <span className="text-xs font-black mt-0.5">◎</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => updateBatchItem(item.eventId, "status", "partial")}
                          className={cn(
                            "py-1.5 px-0.5 rounded-lg border transition-all cursor-pointer flex flex-col items-center justify-center min-h-[44px]",
                            item.status === "partial" ? "bg-sky-500/10 border-sky-500 text-sky-600 dark:text-sky-400" : "border-border hover:bg-muted"
                          )}
                          title="参加"
                        >
                          <span className="text-[8px] font-black leading-none">参加</span>
                          <span className="text-xs font-black mt-0.5">○</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => updateBatchItem(item.eventId, "status", "late")}
                          className={cn(
                            "py-1.5 px-0.5 rounded-lg border transition-all cursor-pointer flex flex-col items-center justify-center min-h-[44px]",
                            item.status === "late" ? "bg-amber-500/10 border-amber-500 text-amber-600 dark:text-amber-400" : "border-border hover:bg-muted"
                          )}
                          title="遅刻・試合なら"
                        >
                          <span className="text-[8px] font-black leading-none">試合なら</span>
                          <span className="text-xs font-black mt-0.5">△</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => updateBatchItem(item.eventId, "status", "absent")}
                          className={cn(
                            "py-1.5 px-0.5 rounded-lg border transition-all cursor-pointer flex flex-col items-center justify-center min-h-[44px]",
                            item.status === "absent" ? "bg-rose-500/10 border-rose-500 text-rose-600 dark:text-rose-400" : "border-border hover:bg-muted"
                          )}
                          title="不参加"
                        >
                          <span className="text-[8px] font-black leading-none">不参加</span>
                          <span className="text-xs font-black mt-0.5">×</span>
                        </button>
                      </div>

                      {/* コメント・車出し設定 */}
                      <div className="flex flex-col gap-1.5 justify-center">
                        <Input
                          value={item.comment}
                          onChange={(e) => updateBatchItem(item.eventId, "comment", e.target.value)}
                          placeholder="コメント（理由等）"
                          className="h-8 rounded-lg text-[11px] font-bold py-1"
                        />
                        {isAdult && (
                          <div className="space-y-1.5 w-full">
                            <label className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-muted/40 border border-border/40 text-[11px] font-bold cursor-pointer hover:bg-muted/70 transition-colors">
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <Car className="h-3 w-3" /> 車出しOK
                              </span>
                              <input
                                type="checkbox"
                                checked={item.hasCar}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  updateBatchItem(item.eventId, "hasCar", checked);
                                  if (!checked) updateBatchItem(item.eventId, "carId", "");
                                }}
                                className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary accent-primary cursor-pointer"
                              />
                            </label>
                            {item.hasCar && (
                              <select
                                value={item.carId || ""}
                                onChange={(e) => updateBatchItem(item.eventId, "carId", e.target.value)}
                                className="w-full h-8 rounded-lg border border-border bg-card px-2 text-[10px] font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                              >
                                <option value="">-- 車両を指定しない --</option>
                                {allCars
                                  .filter(car => car.ownerId === batchTargetRow?.id || car.ownerId2 === batchTargetRow?.id)
                                  .map(car => (
                                    <option key={car.id} value={car.id}>
                                      {car.name} {car.numberPlate ? `[${car.numberPlate}]` : ""}
                                    </option>
                                  ))
                                }
                              </select>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <DialogFooter className="p-6 bg-muted/20 border-t border-border/40 flex flex-col gap-2 w-full sm:flex-col shrink-0">
              <Button onClick={handleSaveBatchAttendance} disabled={isSubmitting} className="w-full h-11 rounded-xl font-black text-white text-sm">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "一括保存する"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setIsBatchModalOpen(false)} className="w-full h-11 rounded-xl font-bold text-sm">
                キャンセル
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </main>
    </div>
  );
}
