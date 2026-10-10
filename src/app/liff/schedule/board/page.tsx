// filepath: src/app/liff/schedule/board/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { useLiff } from "@/components/liff/LiffProvider";
import {
  Calendar as CalendarIcon,
  Users,
  ChevronLeft,
  ChevronRight,
  Filter,
  Check,
  X,
  MessageSquare,
  Sparkles,
  ClipboardCopy,
  Lock,
  Unlock,
  ShieldAlert,
  Loader2,
  RefreshCw,
  Search,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  Info,
} from "lucide-react";
import { toast } from "sonner";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🏷️ 出欠ステータス定義 (ユーザー要望の5種＋未回答)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
type AttendanceMarkType = "duty" | "help" | "setup" | "game" | "absent" | "pending";

interface AttendanceStatusConfig {
  id: AttendanceMarkType;
  mark: string;
  label: string;
  shortLabel: string;
  badgeClass: string;
  buttonClass: string;
  description: string;
}

const ATTENDANCE_STATUSES: Record<AttendanceMarkType, AttendanceStatusConfig> = {
  duty: {
    id: "duty",
    mark: "◎",
    label: "出席（当番）",
    shortLabel: "当番",
    badgeClass: "bg-red-500 text-white font-black shadow-xs",
    buttonClass: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 active:scale-95",
    description: "お茶当番・鍵当番・救急当番など",
  },
  help: {
    id: "help",
    mark: "○",
    label: "出席（ヘルプ）",
    shortLabel: "ヘルプ",
    badgeClass: "bg-blue-600 text-white font-black shadow-xs",
    buttonClass: "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 active:scale-95",
    description: "通常の練習・試合参加、車出し手伝いなど",
  },
  setup: {
    id: "setup",
    mark: "▲",
    label: "出席（設営・撤収のみ）",
    shortLabel: "設営撤収",
    badgeClass: "bg-amber-500 text-white font-black shadow-xs",
    buttonClass: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 active:scale-95",
    description: "朝のグラウンド作り、または夕方の片付けのみ",
  },
  game: {
    id: "game",
    mark: "△",
    label: "出席（試合のみ）",
    shortLabel: "試合のみ",
    badgeClass: "bg-emerald-600 text-white font-black shadow-xs",
    buttonClass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 active:scale-95",
    description: "公式戦・練習試合の時間帯のみ参加",
  },
  absent: {
    id: "absent",
    mark: "×",
    label: "欠席",
    shortLabel: "欠席",
    badgeClass: "bg-slate-400 text-white font-bold",
    buttonClass: "border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-400 hover:bg-slate-500/20 active:scale-95",
    description: "終日不参加",
  },
  pending: {
    id: "pending",
    mark: "－",
    label: "未定・未回答",
    shortLabel: "未回答",
    badgeClass: "bg-muted text-muted-foreground font-medium border border-border/50",
    buttonClass: "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted/70 active:scale-95",
    description: "調整中または回答前",
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 型定義
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface EventItem {
  id: string;
  title: string;
  dateStr: string;
  date: string;
  dayOfWeek: string;
  dutyGroup: string;
  location: string;
  eventType: string;
  statusSummary: {
    duty: number;
    help: number;
    setup: number;
    game: number;
    absent: number;
    totalPresent: number;
  };
}

interface MemberPerson {
  id: string;
  name: string;
  uniformNumber?: string;
  subText?: string;
  groupType: "player" | "mother" | "father" | "staff";
}

type GroupTabType = "all" | "player" | "mother" | "father" | "staff";

export default function AttendanceMatrixBoardPage() {
  const { profile, currentTeam, isDemo } = useLiff();

  const [isLoading, setIsLoading] = useState(true);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [groups, setGroups] = useState<{
    players: MemberPerson[];
    mothers: MemberPerson[];
    fathers: MemberPerson[];
    staff: MemberPerson[];
  }>({
    players: [],
    mothers: [],
    fathers: [],
    staff: [],
  });
  const [matrix, setMatrix] = useState<Record<string, Record<string, { status: AttendanceMarkType; comment: string }>>>({});
  const [myInfo, setMyInfo] = useState<{
    memberId: string | null;
    playerIds: string[];
    isManager: boolean;
    name: string;
  }>({
    memberId: null,
    playerIds: [],
    isManager: false,
    name: "",
  });

  // UI状態
  const [selectedGroupTab, setSelectedGroupTab] = useState<GroupTabType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isManagerOverrideMode, setIsManagerOverrideMode] = useState(false);

  // 編集モーダル状態
  const [editingCell, setEditingCell] = useState<{
    eventId: string;
    eventTitle: string;
    eventDate: string;
    person: MemberPerson;
    currentStatus: AttendanceMarkType;
    comment: string;
  } | null>(null);
  const [isSavingCell, setIsSavingCell] = useState(false);

  // データ取得
  const loadMatrixData = useCallback(async () => {
    setIsLoading(true);
    try {
      const teamId = currentTeam?.id || "demo-team";
      const params = new URLSearchParams({
        teamId,
        userId: profile?.userId || "",
        userName: profile?.displayName || "",
      });

      const res = await fetch(`/api/liff/attendance-matrix?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load matrix");

      const data = (await res.json()) as any;
      if (data.success) {
        setEvents(data.events || []);
        setGroups(data.groups || { players: [], mothers: [], fathers: [], staff: [] });
        setMatrix(data.matrix || {});
        if (data.myInfo) {
          setMyInfo(data.myInfo);
          // 管理者ならデフォルトで管理モードをオンにできる
          if (data.myInfo.isManager) {
            setIsManagerOverrideMode(true);
          }
        }
      }
    } catch (err) {
      console.error("Matrix load error:", err);
      toast.error("出欠一覧表データの読み込みに失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, [currentTeam?.id, profile?.userId, profile?.displayName]);

  useEffect(() => {
    loadMatrixData();
  }, [loadMatrixData]);

  // 選択されたタブに応じたメンバー一覧
  const currentMembers = useMemo(() => {
    let list: MemberPerson[] = [];
    if (selectedGroupTab === "all") {
      list = [
        ...groups.players,
        ...groups.mothers,
        ...groups.fathers,
        ...groups.staff,
      ];
    } else if (selectedGroupTab === "player") {
      list = groups.players;
    } else if (selectedGroupTab === "mother") {
      list = groups.mothers;
    } else if (selectedGroupTab === "father") {
      list = groups.fathers;
    } else if (selectedGroupTab === "staff") {
      list = groups.staff;
    }

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(m => 
      m.name.toLowerCase().includes(q) ||
      (m.subText && m.subText.toLowerCase().includes(q))
    );
  }, [selectedGroupTab, groups, searchQuery]);

  // 編集権限チェック
  const canEditPerson = useCallback((personId: string, groupType: string) => {
    if (isDemo) return true; // デモ時は自由に操作可能
    if (myInfo.isManager && isManagerOverrideMode) return true;
    if (myInfo.memberId && myInfo.memberId === personId) return true;
    if (myInfo.playerIds && myInfo.playerIds.includes(personId)) return true;
    return false;
  }, [isDemo, myInfo, isManagerOverrideMode]);

  // セルクリック時の処理
  const handleCellClick = (event: EventItem, person: MemberPerson) => {
    const isAllowed = canEditPerson(person.id, person.groupType);
    const currentAtt = matrix[event.id]?.[person.id] || { status: "pending", comment: "" };

    if (!isAllowed) {
      toast.info(`${person.name} さんの出欠変更権限がありません（本人または管理者のみ編集可能）`);
      return;
    }

    setEditingCell({
      eventId: event.id,
      eventTitle: event.title,
      eventDate: `${event.date}(${event.dayOfWeek})`,
      person,
      currentStatus: currentAtt.status as AttendanceMarkType,
      comment: currentAtt.comment || "",
    });
  };

  // セル保存処理
  const handleSaveCell = async (newStatus: AttendanceMarkType, newComment: string) => {
    if (!editingCell) return;
    setIsSavingCell(true);

    const { eventId, person } = editingCell;
    const prevCell = matrix[eventId]?.[person.id];

    // 楽観的UI更新
    setMatrix(prev => ({
      ...prev,
      [eventId]: {
        ...prev[eventId],
        [person.id]: {
          status: newStatus,
          comment: newComment,
        },
      },
    }));

    try {
      const res = await fetch("/api/liff/attendance-matrix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          personId: person.id,
          personType: person.groupType === "player" ? "player" : "member",
          status: newStatus,
          comment: newComment,
          userId: profile?.userId || "",
        }),
      });

      if (!res.ok) throw new Error("Save error");
      toast.success(`${person.name} さんの出欠を更新しました`);
      setEditingCell(null);
    } catch (err) {
      console.error("Save error:", err);
      toast.error("出欠の保存に失敗しました");
      // ロールバック
      if (prevCell) {
        setMatrix(prev => ({
          ...prev,
          [eventId]: {
            ...prev[eventId],
            [person.id]: prevCell,
          },
        }));
      }
    } finally {
      setIsSavingCell(false);
    }
  };

  // 📋 LINE連絡用テキストコピー
  const handleCopyLineSummary = (event: EventItem) => {
    const evMatrix = matrix[event.id] || {};
    const dutyNames: string[] = [];
    const helpNames: string[] = [];
    const setupNames: string[] = [];
    const gameNames: string[] = [];
    const absentNames: string[] = [];

    // メンバー名を取得
    const allMembersMap = new Map<string, string>();
    [...groups.players, ...groups.mothers, ...groups.fathers, ...groups.staff].forEach(m => {
      allMembersMap.set(m.id, m.name);
    });

    Object.entries(evMatrix).forEach(([pid, data]) => {
      const name = allMembersMap.get(pid);
      if (!name) return;
      const cellData = data as { status: AttendanceMarkType; comment: string };
      const note = cellData.comment ? `(${cellData.comment})` : "";
      const display = `${name}${note}`;

      if (cellData.status === "duty") dutyNames.push(display);
      else if (cellData.status === "help") helpNames.push(display);
      else if (cellData.status === "setup") setupNames.push(display);
      else if (cellData.status === "game") gameNames.push(display);
      else if (cellData.status === "absent") absentNames.push(display);
    });

    const totalCount = dutyNames.length + helpNames.length + setupNames.length + gameNames.length;

    const lines = [
      `【出欠集計】${event.date}(${event.dayOfWeek}) ${event.dutyGroup !== "なし" ? `[${event.dutyGroup}]` : ""}`,
      `📌 ${event.title}`,
      `📍 ${event.location}`,
      `━━━━━━━━━━━━━━`,
      `👥 出席計: ${totalCount}名`,
      `◎ 当番 (${dutyNames.length}): ${dutyNames.join(", ") || "なし"}`,
      `○ ヘルプ (${helpNames.length}): ${helpNames.join(", ") || "なし"}`,
      `▲ 設営・撤収 (${setupNames.length}): ${setupNames.join(", ") || "なし"}`,
      `△ 試合のみ (${gameNames.length}): ${gameNames.join(", ") || "なし"}`,
      `× 欠席 (${absentNames.length}): ${absentNames.join(", ") || "なし"}`,
      `━━━━━━━━━━━━━━`,
      `#iScoreCloud`,
    ];

    const text = lines.join("\n");
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      toast.success("LINE連絡用の集計テキストをクリップボードにコピーしました！");
    } else {
      toast.error("クリップボードへのアクセスに失敗しました");
    }
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* ヘッダー */}
      <LiffHeader />

      <main className="max-w-7xl mx-auto px-2 sm:px-4 pt-3 space-y-3">
        {/* ページタイトル & 戻る導線 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-1">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black shrink-0">
              <Users className="w-4 h-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-foreground tracking-tight">
                  出欠一覧表（マトリクス）
                </h1>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  簡易集計
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground font-bold">
                日付・班・イベントと各メンバーの出欠を一覧で確認・登録
              </p>
            </div>
          </div>

          {/* 📅 通常のカレンダー予定表示への切り替えボタン */}
          <Link
            href="/liff/schedule"
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-card hover:bg-muted border border-border/80 text-xs font-black text-foreground shadow-2xs active:scale-95 transition-all self-start sm:self-auto"
          >
            <CalendarIcon className="w-3.5 h-3.5 text-primary" />
            <span>カレンダー表示に戻る</span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          </Link>
        </div>

        {/* 凡例 & 管理者モードトグル */}
        <div className="bg-card rounded-2xl p-3 border border-border/80 shadow-2xs space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* 凡例ラベル */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-black text-muted-foreground flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-primary" /> 記号凡例:
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold">
                <span className="w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] font-black">◎</span>
                <span>当番</span>
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold">
                <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-black">○</span>
                <span>ヘルプ</span>
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold">
                <span className="w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-black">▲</span>
                <span>設営・撤収</span>
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold">
                <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-black">△</span>
                <span>試合のみ</span>
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold">
                <span className="w-4 h-4 rounded-full bg-slate-400 text-white flex items-center justify-center text-[10px] font-bold">×</span>
                <span>欠席</span>
              </span>
            </div>

            {/* 管理者代理入力トグル */}
            {myInfo.isManager && (
              <button
                type="button"
                onClick={() => setIsManagerOverrideMode(prev => !prev)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-black transition-all active:scale-95 border ${
                  isManagerOverrideMode
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40 shadow-xs"
                    : "bg-muted text-muted-foreground border-border/60 hover:text-foreground"
                }`}
              >
                {isManagerOverrideMode ? (
                  <>
                    <Unlock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    <span>管理者代理入力ON（全編集可）</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>本人・家族のみ編集</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* 👥 グループ切り分けタブ ＆ 検索バー */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
          {/* グループタブ */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 -mx-1 px-1">
            <button
              type="button"
              onClick={() => setSelectedGroupTab("all")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all active:scale-95 shrink-0 ${
                selectedGroupTab === "all"
                  ? "bg-primary text-primary-foreground font-black shadow-xs shadow-primary/20"
                  : "bg-card hover:bg-muted text-muted-foreground border border-border/60"
              }`}
            >
              <span>👥 全員</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/10 dark:bg-white/10">
                {groups.players.length + groups.mothers.length + groups.fathers.length + groups.staff.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedGroupTab("player")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all active:scale-95 shrink-0 ${
                selectedGroupTab === "player"
                  ? "bg-emerald-600 text-white font-black shadow-xs"
                  : "bg-card hover:bg-muted text-muted-foreground border border-border/60"
              }`}
            >
              <span>⚾ 選手</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/10 dark:bg-white/10">
                {groups.players.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedGroupTab("mother")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all active:scale-95 shrink-0 ${
                selectedGroupTab === "mother"
                  ? "bg-rose-500 text-white font-black shadow-xs"
                  : "bg-card hover:bg-muted text-muted-foreground border border-border/60"
              }`}
            >
              <span>👩 保護者（母）</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/10 dark:bg-white/10">
                {groups.mothers.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedGroupTab("father")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all active:scale-95 shrink-0 ${
                selectedGroupTab === "father"
                  ? "bg-blue-600 text-white font-black shadow-xs"
                  : "bg-card hover:bg-muted text-muted-foreground border border-border/60"
              }`}
            >
              <span>👨 保護者（父）</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/10 dark:bg-white/10">
                {groups.fathers.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedGroupTab("staff")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all active:scale-95 shrink-0 ${
                selectedGroupTab === "staff"
                  ? "bg-purple-600 text-white font-black shadow-xs"
                  : "bg-card hover:bg-muted text-muted-foreground border border-border/60"
              }`}
            >
              <span>👔 指導者・スタッフ</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/10 dark:bg-white/10">
                {groups.staff.length}
              </span>
            </button>
          </div>

          {/* 氏名検索インプット */}
          <div className="relative shrink-0 sm:w-48">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="メンバー名検索..."
              className="w-full pl-8 pr-3 py-1 text-xs rounded-xl bg-card border border-border/80 focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            📊 出欠マトリクス表（スプレッドシート型UI）
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-2 bg-card rounded-2xl border border-border">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground font-bold">出欠一覧表を読み込み中...</p>
          </div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center bg-card rounded-2xl border border-border">
            <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-black text-foreground">表示する予定・イベントがありません</p>
            <p className="text-xs text-muted-foreground mt-1">「活動予定の一括登録」から予定を追加してください。</p>
          </div>
        ) : (
          <div className="relative bg-card rounded-2xl border border-border shadow-xs overflow-hidden">
            <div className="overflow-x-auto max-h-[75vh] relative no-scrollbar">
              <table className="w-full text-left border-collapse select-none">
                {/* 📌 ヘッダー行 (メンバー一覧) */}
                <thead className="sticky top-0 z-30 bg-muted/95 backdrop-blur-md border-b border-border shadow-2xs">
                  <tr>
                    {/* 左上固定セル: イベント情報列 */}
                    <th className="sticky left-0 z-40 bg-muted/95 min-w-[200px] sm:min-w-[240px] max-w-[260px] p-2.5 text-xs font-black text-foreground border-r border-border shadow-xs">
                      <div className="flex items-center justify-between">
                        <span>日付 / 班 / イベント</span>
                        <span className="text-[10px] text-muted-foreground font-bold">
                          {events.length}日程
                        </span>
                      </div>
                    </th>

                    {/* 集計固定列 */}
                    <th className="min-w-[130px] p-2 text-center text-xs font-black text-foreground border-r border-border bg-muted/80">
                      出席集計 (名)
                    </th>

                    {/* メンバー列 */}
                    {currentMembers.map((person) => {
                      const isMe = person.id === myInfo.memberId || myInfo.playerIds.includes(person.id);
                      return (
                        <th
                          key={person.id}
                          className={`min-w-[76px] max-w-[90px] p-2 text-center border-r border-border/60 transition-colors ${
                            isMe ? "bg-primary/10" : ""
                          }`}
                        >
                          <div className="flex flex-col items-center justify-center">
                            <span className={`text-[11px] font-black truncate max-w-[80px] ${isMe ? "text-primary font-black" : "text-foreground"}`}>
                              {person.name}
                            </span>
                            {person.subText && (
                              <span className="text-[9px] text-muted-foreground font-bold truncate max-w-[80px]">
                                {person.subText}
                              </span>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                {/* 📌 ボディ行 (イベントごと) */}
                <tbody className="divide-y divide-border/60">
                  {events.map((ev) => {
                    const isSaturday = ev.dayOfWeek === "土";
                    const isSunday = ev.dayOfWeek === "日";
                    const summary = ev.statusSummary;

                    return (
                      <tr key={ev.id} className="hover:bg-muted/30 transition-colors group">
                        {/* ① 左側固定セル: 日付・班・イベント */}
                        <td className="sticky left-0 z-20 bg-card group-hover:bg-card/95 border-r border-border p-2.5 shadow-xs">
                          <div className="space-y-1">
                            {/* 日付 ＆ 班 */}
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`text-xs font-black px-1.5 py-0.5 rounded-md ${
                                  isSunday
                                    ? "bg-red-500/15 text-red-600 dark:text-red-400 font-black"
                                    : isSaturday
                                    ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 font-black"
                                    : "bg-muted text-foreground font-bold"
                                }`}
                              >
                                {ev.date} ({ev.dayOfWeek})
                              </span>

                              {ev.dutyGroup && ev.dutyGroup !== "なし" && (
                                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                                  {ev.dutyGroup}
                                </span>
                              )}

                              {/* LINE集計コピーボタン */}
                              <button
                                type="button"
                                onClick={() => handleCopyLineSummary(ev)}
                                title="LINE連絡用に集計コピー"
                                className="ml-auto p-1 text-muted-foreground hover:text-primary rounded-md hover:bg-muted active:scale-90 transition-all cursor-pointer"
                              >
                                <ClipboardCopy className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* イベント名 & 場所 */}
                            <p className="text-[11px] font-black text-foreground truncate max-w-[210px]" title={ev.title}>
                              {ev.title}
                            </p>
                            <p className="text-[10px] text-muted-foreground font-bold truncate max-w-[210px]">
                              📍 {ev.location}
                            </p>
                          </div>
                        </td>

                        {/* ② 行単位の出欠集計列 */}
                        <td className="p-2 border-r border-border text-center bg-muted/20">
                          <div className="flex flex-col items-center justify-center gap-1">
                            <div className="flex items-center gap-1 text-[11px] font-black">
                              <span className="text-muted-foreground">出席計:</span>
                              <span className="text-primary font-black text-xs">{summary.totalPresent}名</span>
                            </div>
                            <div className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground">
                              <span title="当番" className="text-red-600 dark:text-red-400">◎{summary.duty}</span>
                              <span title="ヘルプ" className="text-blue-600 dark:text-blue-400">○{summary.help}</span>
                              <span title="設営撤収" className="text-amber-600 dark:text-amber-400">▲{summary.setup}</span>
                              <span title="試合のみ" className="text-emerald-600 dark:text-emerald-400">△{summary.game}</span>
                              <span title="欠席" className="text-slate-400">×{summary.absent}</span>
                            </div>
                          </div>
                        </td>

                        {/* ③ メンバー別 出欠セル */}
                        {currentMembers.map((person) => {
                          const att = matrix[ev.id]?.[person.id] || { status: "pending", comment: "" };
                          const statusConfig = ATTENDANCE_STATUSES[att.status as AttendanceMarkType] || ATTENDANCE_STATUSES.pending;
                          const isEditable = canEditPerson(person.id, person.groupType);
                          const isMe = person.id === myInfo.memberId || myInfo.playerIds.includes(person.id);

                          return (
                            <td
                              key={person.id}
                              onClick={() => handleCellClick(ev, person)}
                              className={`p-1.5 text-center border-r border-border/60 transition-all ${
                                isEditable
                                  ? "cursor-pointer hover:bg-primary/5 active:scale-95"
                                  : "opacity-90"
                              } ${isMe ? "bg-primary/5" : ""}`}
                            >
                              <div className="flex flex-col items-center justify-center gap-0.5">
                                <span
                                  className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs transition-transform ${statusConfig.badgeClass} ${
                                    isEditable ? "group-hover:scale-105" : ""
                                  }`}
                                >
                                  {statusConfig.mark}
                                </span>

                                {/* コメント/メモのプレビュー表示 */}
                                {att.comment ? (
                                  <span
                                    className="text-[9px] text-muted-foreground font-bold truncate max-w-[65px] px-1 rounded bg-muted/60"
                                    title={att.comment}
                                  >
                                    💬 {att.comment}
                                  </span>
                                ) : (
                                  <span className="text-[9px] opacity-0">－</span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ✏️ セルタップ時の出欠変更モーダル
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {editingCell && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-150">
            <div
              className="absolute inset-0"
              onClick={() => !isSavingCell && setEditingCell(null)}
            />

            <div className="relative w-full max-w-md bg-card rounded-t-3xl sm:rounded-3xl border border-border shadow-2xl p-5 space-y-4 animate-in slide-in-from-bottom duration-200">
              {/* モーダルヘッダー */}
              <div className="flex items-start justify-between pb-2 border-b border-border/60">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-foreground">
                      {editingCell.person.name} さんの出欠登録
                    </h3>
                    {editingCell.person.subText && (
                      <span className="text-[10px] text-muted-foreground font-bold px-1.5 py-0.5 rounded bg-muted">
                        {editingCell.person.subText}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground font-bold mt-0.5">
                    📅 {editingCell.eventDate} : {editingCell.eventTitle}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isSavingCell}
                  onClick={() => setEditingCell(null)}
                  className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground active:scale-90"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* ステータス選択ボタン一覧 (5択＋未定) */}
              <div className="space-y-2">
                <label className="text-xs font-black text-foreground">
                  出欠ステータスを選択:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(ATTENDANCE_STATUSES) as AttendanceMarkType[]).map((key) => {
                    const item = ATTENDANCE_STATUSES[key];
                    const isSelected = editingCell.currentStatus === key;

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleSaveCell(key, editingCell.comment)}
                        disabled={isSavingCell}
                        className={`flex items-center gap-2 p-2.5 rounded-2xl border text-left transition-all ${item.buttonClass} ${
                          isSelected ? "ring-2 ring-primary ring-offset-2 font-black shadow-xs scale-[1.02]" : "opacity-80"
                        }`}
                      >
                        <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs shrink-0 ${item.badgeClass}`}>
                          {item.mark}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-black truncate">{item.label}</p>
                          <p className="text-[9px] text-muted-foreground truncate">{item.shortLabel}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* メモ・備考入力欄 */}
              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-black text-foreground flex items-center justify-between">
                  <span>メモ・備考（任意）:</span>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    例: 11時早退、車出し3名可、遅刻など
                  </span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editingCell.comment}
                    onChange={(e) => setEditingCell(prev => prev ? { ...prev, comment: e.target.value } : null)}
                    placeholder="早退や車出し可など..."
                    className="flex-1 px-3 py-2 text-xs rounded-xl bg-muted/50 border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
                  />
                  <button
                    type="button"
                    disabled={isSavingCell}
                    onClick={() => handleSaveCell(editingCell.currentStatus, editingCell.comment)}
                    className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-black hover:brightness-110 active:scale-95 transition-all shrink-0"
                  >
                    {isSavingCell ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "メモ保存"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
