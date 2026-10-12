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
  groupType: "player" | "parent" | "mother" | "father" | "staff";
}

type GroupTabType = "all" | "player" | "parent" | "mother" | "father" | "staff";

export default function AttendanceMatrixBoardPage() {
  const { profile, currentTeam, isDemo } = useLiff();

  const [isLoading, setIsLoading] = useState(true);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [groups, setGroups] = useState<{
    players: MemberPerson[];
    parents: MemberPerson[];
    mothers: MemberPerson[];
    fathers: MemberPerson[];
    staff: MemberPerson[];
  }>({
    players: [],
    parents: [],
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
        const g = data.groups || {};
        const mothers = g.mothers || [];
        const fathers = g.fathers || [];
        const parents = g.parents || [...mothers, ...fathers];
        setGroups({
          players: g.players || [],
          parents: parents,
          mothers: mothers,
          fathers: fathers,
          staff: g.staff || [],
        });
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
    const allParents = groups.parents.length > 0 ? groups.parents : [...groups.mothers, ...groups.fathers];

    if (selectedGroupTab === "all") {
      const combined = [
        ...groups.players,
        ...allParents,
        ...groups.staff,
      ];
      const seen = new Set<string>();
      list = combined.filter(m => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
    } else if (selectedGroupTab === "player") {
      list = groups.players;
    } else if (selectedGroupTab === "parent") {
      list = allParents;
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
    if (myInfo.isManager) return true; // 🌟 管理者は全員の出欠を自由にメンテ・登録可能！
    if (myInfo.memberId && myInfo.memberId === personId) return true;
    if (myInfo.playerIds && myInfo.playerIds.includes(personId)) return true;
    return false;
  }, [isDemo, myInfo]);

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

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as any;
        throw new Error(data.error || "更新に失敗しました");
      }
      toast.success(`${person.name} さんの出欠を更新しました`);
      setEditingCell(null);
    } catch (err: any) {
      console.error("Save error:", err);
      toast.error(err?.message || "出欠の保存に失敗しました");
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
    const allParents = groups.parents.length > 0 ? groups.parents : [...groups.mothers, ...groups.fathers];
    const allMembersMap = new Map<string, string>();
    [...groups.players, ...allParents, ...groups.staff].forEach(m => {
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

      <main className="max-w-7xl mx-auto px-1 sm:px-2 pt-1.5 space-y-1.5">
        {/* ページタイトル & 戻る導線 (極限までコンパクト化) */}
        <div className="flex items-center justify-between gap-1.5 px-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-6 h-6 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black shrink-0">
              <Users className="w-3.5 h-3.5" />
            </span>
            <h1 className="text-xs sm:text-sm font-black text-foreground truncate">
              出欠一覧表（マトリクス）
            </h1>
          </div>

          <Link
            href="/liff/schedule"
            className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-card hover:bg-muted border border-border/80 text-[10.5px] font-black text-foreground shadow-2xs active:scale-95 transition-all shrink-0"
          >
            <CalendarIcon className="w-3 h-3 text-primary" />
            <span>予定へ戻る</span>
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          </Link>
        </div>

        {/* 凡例 & 管理者モードトグル (1行・超薄型コンパクト) */}
        <div className="bg-card rounded-xl px-2 py-1 border border-border/80 shadow-2xs flex flex-wrap items-center justify-between gap-1 text-[9.5px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-black text-muted-foreground">凡例:</span>
            <span className="inline-flex items-center gap-0.5 font-bold">
              <span className="w-3.5 h-3.5 rounded-full bg-red-500 text-white flex items-center justify-center text-[9px] font-black">◎</span>
              <span>当番</span>
            </span>
            <span className="inline-flex items-center gap-0.5 font-bold">
              <span className="w-3.5 h-3.5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[9px] font-black">○</span>
              <span>ヘルプ</span>
            </span>
            <span className="inline-flex items-center gap-0.5 font-bold">
              <span className="w-3.5 h-3.5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[9px] font-black">▲</span>
              <span>設営撤収</span>
            </span>
            <span className="inline-flex items-center gap-0.5 font-bold">
              <span className="w-3.5 h-3.5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[9px] font-black">△</span>
              <span>試合のみ</span>
            </span>
            <span className="inline-flex items-center gap-0.5 font-bold">
              <span className="w-3.5 h-3.5 rounded-full bg-slate-400 text-white flex items-center justify-center text-[9px] font-bold">×</span>
              <span>欠席</span>
            </span>
          </div>

          {myInfo.isManager && (
            <button
              type="button"
              onClick={() => setIsManagerOverrideMode(prev => !prev)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9.5px] font-black transition-all active:scale-95 border ${
                isManagerOverrideMode
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40 shadow-xs"
                  : "bg-muted text-muted-foreground border-border/60 hover:text-foreground"
              }`}
            >
              {isManagerOverrideMode ? (
                <>
                  <Unlock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  <span>代理入力ON</span>
                </>
              ) : (
                <>
                  <Lock className="w-3 h-3" />
                  <span>通常入力</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* 👥 グループ切り分けタブ ＆ 検索バー (超スリム化) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-1">
          {/* グループタブ */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 -mx-0.5 px-0.5">
            {[
              { id: "all", label: "全員", count: new Set([...groups.players, ...(groups.parents.length > 0 ? groups.parents : [...groups.mothers, ...groups.fathers]), ...groups.staff].map(m => m.id)).size, activeClass: "bg-primary text-primary-foreground font-black shadow-xs shadow-primary/20" },
              { id: "player", label: "選手", count: groups.players.length, activeClass: "bg-emerald-600 text-white font-black shadow-xs" },
              { id: "parent", label: "保護者", count: groups.parents.length > 0 ? groups.parents.length : groups.mothers.length + groups.fathers.length, activeClass: "bg-amber-600 text-white font-black shadow-xs" },
              { id: "mother", label: "母", count: groups.mothers.length, activeClass: "bg-rose-500 text-white font-black shadow-xs" },
              { id: "father", label: "父", count: groups.fathers.length, activeClass: "bg-blue-600 text-white font-black shadow-xs" },
              { id: "staff", label: "指導・スタッフ", count: groups.staff.length, activeClass: "bg-purple-600 text-white font-black shadow-xs" },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedGroupTab(tab.id as any)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap transition-all active:scale-95 shrink-0 ${
                  selectedGroupTab === tab.id
                    ? tab.activeClass
                    : "bg-card hover:bg-muted text-muted-foreground border border-border/60"
                }`}
              >
                <span>{tab.label}</span>
                <span className="text-[9px] px-1 py-0 rounded-full bg-black/10 dark:bg-white/10">
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* 氏名検索インプット */}
          <div className="relative shrink-0 sm:w-36">
            <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="メンバー名検索..."
              className="w-full pl-6 pr-2 py-0.5 text-[10px] rounded-lg bg-card border border-border/80 focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground h-6"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        </div>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            📊 出欠マトリクス表（スプレッドシート型UI・余白極小・不透明完全固定）
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {isLoading ? (
          <div className="p-8 flex flex-col items-center justify-center gap-2 bg-card rounded-xl border border-border">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <p className="text-[11px] text-muted-foreground font-bold">出欠一覧表を読み込み中...</p>
          </div>
        ) : events.length === 0 ? (
          <div className="p-6 text-center bg-card rounded-xl border border-border">
            <AlertCircle className="w-6 h-6 text-muted-foreground mx-auto mb-1.5" />
            <p className="text-xs font-black text-foreground">表示する予定・イベントがありません</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">「活動予定の一括登録」から予定を追加してください。</p>
          </div>
        ) : (
          <div className="relative bg-card rounded-xl border border-border shadow-xs overflow-hidden">
            <div className="overflow-x-auto relative" style={{ WebkitOverflowScrolling: "touch" }}>
              <table className="w-max min-w-full text-left border-separate border-spacing-0 select-none" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                {/* 📌 ヘッダー行 (メンバー一覧 & 出欠記号別集計ヘッダー: 縦固定化なし) */}
                <thead>
                  <tr className="h-9">
                    {/* 左側固定セル: イベント情報列 (横スクロール時のみ左固定・完全固定幅124px) */}
                    <th
                      className="sticky left-0 z-20 bg-slate-100 dark:bg-zinc-800 border-b-2 border-r border-border w-[124px] min-w-[124px] max-w-[124px] p-1 text-[11px] font-black text-foreground shadow-xs align-middle"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-black truncate">日付 / 班 / イベント</span>
                        <span className="text-[9px] text-muted-foreground font-bold shrink-0">
                          {events.length}日
                        </span>
                      </div>
                    </th>

                    {/* 📊 出欠集計列 (各記号ごとの専用タイトル列・幅25px) */}
                    <th
                      className="w-6 min-w-[25px] max-w-[25px] p-0.5 text-center border-b-2 border-r border-border bg-[#fee2e2] dark:bg-[#450a0a] text-red-700 dark:text-red-300 font-black text-[11px] align-middle"
                      title="◎ 出席（当番）"
                    >
                      ◎
                    </th>
                    <th
                      className="w-6 min-w-[25px] max-w-[25px] p-0.5 text-center border-b-2 border-r border-border bg-[#dbeafe] dark:bg-[#172554] text-blue-700 dark:text-blue-300 font-black text-[11px] align-middle"
                      title="○ 出席（ヘルプ）"
                    >
                      ○
                    </th>
                    <th
                      className="w-6 min-w-[25px] max-w-[25px] p-0.5 text-center border-b-2 border-r border-border bg-[#fef3c7] dark:bg-[#451a03] text-amber-700 dark:text-amber-300 font-black text-[11px] align-middle"
                      title="▲ 出席（設営・撤収のみ）"
                    >
                      ▲
                    </th>
                    <th
                      className="w-6 min-w-[25px] max-w-[25px] p-0.5 text-center border-b-2 border-r border-border bg-[#d1fae5] dark:bg-[#064e3b] text-emerald-700 dark:text-emerald-300 font-black text-[11px] align-middle"
                      title="△ 出席（試合のみ）"
                    >
                      △
                    </th>
                    <th
                      className="w-6 min-w-[25px] max-w-[25px] p-0.5 text-center border-b-2 border-r border-border bg-[#e2e8f0] dark:bg-[#1e293b] text-slate-700 dark:text-slate-300 font-black text-[11px] align-middle"
                      title="× 欠席"
                    >
                      ×
                    </th>

                    {/* メンバー列 (超コンパクト・幅35px) */}
                    {currentMembers.map((person) => {
                      const isMe = person.id === myInfo.memberId || myInfo.playerIds.includes(person.id);
                      return (
                        <th
                          key={person.id}
                          className={`w-9 min-w-[35px] max-w-[35px] p-0.5 text-center border-b-2 border-r border-border align-middle transition-colors ${
                            isMe
                              ? "bg-blue-200 dark:bg-blue-900 text-blue-950 dark:text-blue-100 ring-1 ring-inset ring-blue-500 font-black"
                              : "bg-slate-100 dark:bg-zinc-800 text-foreground"
                          }`}
                        >
                          <div className="flex flex-col items-center justify-center leading-none py-0.5">
                            {person.uniformNumber ? (
                              <span className="text-[8.5px] font-black text-primary px-0.5 py-0.1 rounded bg-primary/10">
                                #{person.uniformNumber}
                              </span>
                            ) : person.groupType === "mother" ? (
                              <span className="text-[8.5px] font-black text-rose-600 dark:text-rose-400">母</span>
                            ) : person.groupType === "father" ? (
                              <span className="text-[8.5px] font-black text-blue-600 dark:text-blue-400">父</span>
                            ) : person.groupType === "staff" ? (
                              <span className="text-[8.5px] font-black text-purple-600 dark:text-purple-400">指導</span>
                            ) : (
                              <span className="text-[8.5px] font-black text-amber-600 dark:text-amber-400">保護</span>
                            )}
                            <span className={`text-[9.5px] font-black truncate max-w-[33px] mt-0.5 ${isMe ? "text-blue-950 dark:text-blue-100 font-black" : "text-foreground"}`}>
                              {person.name.length > 3 ? person.name.slice(0, 3) : person.name}
                            </span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                {/* 📌 ボディ行 (イベントごと) */}
                <tbody>
                  {events.map((ev) => {
                    const isSaturday = ev.dayOfWeek === "土";
                    const isSunday = ev.dayOfWeek === "日";

                    // 🌟 表示中メンバー(currentMembers)に基づいた動的集計を算出
                    let duty = 0;
                    let help = 0;
                    let setup = 0;
                    let game = 0;
                    let absent = 0;
                    const evMatrix = matrix[ev.id] || {};
                    for (const p of currentMembers) {
                      const st = evMatrix[p.id]?.status;
                      if (st === "duty") duty++;
                      else if (st === "help") help++;
                      else if (st === "setup") setup++;
                      else if (st === "game") game++;
                      else if (st === "absent") absent++;
                    }
                    const summary = {
                      duty,
                      help,
                      setup,
                      game,
                      absent,
                      totalPresent: duty + help + setup + game,
                    };

                    return (
                      <tr key={ev.id} className="hover:bg-muted/30 transition-colors group">
                        {/* ① 左側固定セル: 日付・班・イベント (完全不透明bg-white/zinc-900・幅124px・日付幅52px完全統一) */}
                        <td
                          className="sticky left-0 z-10 bg-white dark:bg-zinc-900 border-b border-r border-border w-[124px] min-w-[124px] max-w-[124px] p-1 shadow-xs"
                        >
                          <div className="flex items-center justify-between gap-0.5 leading-tight">
                            <div className="flex items-center gap-1 min-w-0">
                              {/* 統一幅の日付バッジ (幅52px固定) */}
                              <span
                                className={`w-[52px] min-w-[52px] max-w-[52px] text-center inline-block tabular-nums font-bold text-[10px] py-0.5 px-0.5 rounded shrink-0 ${
                                  isSunday
                                    ? "bg-red-500/15 text-red-600 dark:text-red-400"
                                    : isSaturday
                                    ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                                    : "bg-muted text-foreground"
                                }`}
                              >
                                {ev.date}({ev.dayOfWeek})
                              </span>
                              {ev.dutyGroup && ev.dutyGroup !== "なし" && (
                                <span className="text-[8.5px] font-black px-1 py-0.2 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 whitespace-nowrap shrink-0">
                                  {ev.dutyGroup}
                                </span>
                              )}
                            </div>

                            {/* LINE集計コピーボタン */}
                            <button
                              type="button"
                              onClick={() => handleCopyLineSummary(ev)}
                              title="LINE連絡用に集計コピー"
                              className="p-0.5 text-muted-foreground hover:text-primary rounded hover:bg-muted active:scale-90 transition-all cursor-pointer shrink-0"
                            >
                              <ClipboardCopy className="w-2.5 h-2.5" />
                            </button>
                          </div>

                          <p className="text-[9.5px] font-black text-foreground truncate max-w-[115px] mt-0.5 leading-tight" title={ev.title}>
                            {ev.title}
                          </p>
                        </td>

                        {/* ② 出欠集計 各記号ごとの集計値セル (計列削除・幅25px・完全不透明) */}
                        {/* ◎ 当番 */}
                        <td className={`w-6 min-w-[25px] max-w-[25px] p-0.5 text-center border-b border-r border-border font-black text-[10.5px] ${
                          summary.duty > 0 ? "text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-950 font-black" : "text-muted-foreground/30 bg-white dark:bg-zinc-900"
                        }`}>
                          {summary.duty}
                        </td>

                        {/* ○ ヘルプ */}
                        <td className={`w-6 min-w-[25px] max-w-[25px] p-0.5 text-center border-b border-r border-border font-black text-[10.5px] ${
                          summary.help > 0 ? "text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-950 font-black" : "text-muted-foreground/30 bg-white dark:bg-zinc-900"
                        }`}>
                          {summary.help}
                        </td>

                        {/* ▲ 設営撤収 */}
                        <td className={`w-6 min-w-[25px] max-w-[25px] p-0.5 text-center border-b border-r border-border font-black text-[10.5px] ${
                          summary.setup > 0 ? "text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-950 font-black" : "text-muted-foreground/30 bg-white dark:bg-zinc-900"
                        }`}>
                          {summary.setup}
                        </td>

                        {/* △ 試合のみ */}
                        <td className={`w-6 min-w-[25px] max-w-[25px] p-0.5 text-center border-b border-r border-border font-black text-[10.5px] ${
                          summary.game > 0 ? "text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950 font-black" : "text-muted-foreground/30 bg-white dark:bg-zinc-900"
                        }`}>
                          {summary.game}
                        </td>

                        {/* × 欠席 */}
                        <td className={`w-6 min-w-[25px] max-w-[25px] p-0.5 text-center border-b border-r border-border font-bold text-[10.5px] ${
                          summary.absent > 0 ? "text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-800" : "text-muted-foreground/30 bg-white dark:bg-zinc-900"
                        }`}>
                          {summary.absent}
                        </td>

                        {/* ③ メンバー別 出欠セル (超コンパクト・幅35px・完全不透明背景・記号w-5 h-5) */}
                        {currentMembers.map((person) => {
                          const att = matrix[ev.id]?.[person.id] || { status: "pending", comment: "" };
                          const statusConfig = ATTENDANCE_STATUSES[att.status as AttendanceMarkType] || ATTENDANCE_STATUSES.pending;
                          const isEditable = canEditPerson(person.id, person.groupType);
                          const isMe = person.id === myInfo.memberId || myInfo.playerIds.includes(person.id);

                          return (
                            <td
                              key={person.id}
                              onClick={() => handleCellClick(ev, person)}
                              className={`w-9 min-w-[35px] max-w-[35px] p-0.5 text-center border-b border-r border-border/50 bg-white dark:bg-zinc-900 transition-all overflow-hidden ${
                                isEditable
                                  ? "cursor-pointer hover:bg-primary/10 active:scale-90"
                                  : "opacity-90"
                              } ${isMe ? "bg-blue-50/50 dark:bg-blue-950/30" : ""}`}
                            >
                              <div className="relative z-0 inline-flex items-center justify-center">
                                <span
                                  className={`w-5 h-5 rounded-md flex items-center justify-center text-[10.5px] font-black transition-transform ${statusConfig.badgeClass} ${
                                    isEditable ? "group-hover:scale-105" : ""
                                  }`}
                                >
                                  {statusConfig.mark}
                                </span>

                                {/* コメント/メモがある場合のドットインジケータ */}
                                {att.comment && (
                                  <span
                                    className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 border border-card ring-1 ring-black/20"
                                    title={att.comment}
                                  />
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
