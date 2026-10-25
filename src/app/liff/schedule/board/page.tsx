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
  Eye,
  EyeOff,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  FileText,
  GripVertical,
  SlidersHorizontal,
  ClipboardCheck,
  Tag,
} from "lucide-react";
import { Reorder, useDragControls } from "motion/react";
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

type GroupTabType = "all" | "player" | "parent" | "mother" | "father" | "staff";
type SortGroupKey = "player" | "mother" | "father" | "staff";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🏷️ グループ別 出欠ステータス設定定義
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface StatusSettingItem {
  id: AttendanceMarkType;
  mark: string;
  label: string;
  enabled: boolean;
  bgClass: string;
}

type GroupStatusConfigMap = Record<SortGroupKey, StatusSettingItem[]>;

const DEFAULT_GROUP_STATUS_CONFIG: GroupStatusConfigMap = {
  player: [
    { id: "duty", mark: "◎", label: "出席", enabled: true, bgClass: "bg-red-500" },
    { id: "help", mark: "○", label: "ヘルプ", enabled: false, bgClass: "bg-blue-600" },
    { id: "setup", mark: "▲", label: "設営撤収", enabled: false, bgClass: "bg-amber-500" },
    { id: "game", mark: "△", label: "試合のみ", enabled: true, bgClass: "bg-emerald-600" },
    { id: "absent", mark: "×", label: "欠席", enabled: true, bgClass: "bg-slate-400" },
  ],
  mother: [
    { id: "duty", mark: "◎", label: "当番", enabled: true, bgClass: "bg-red-500" },
    { id: "help", mark: "○", label: "ヘルプ", enabled: true, bgClass: "bg-blue-600" },
    { id: "setup", mark: "▲", label: "設営撤収", enabled: true, bgClass: "bg-amber-500" },
    { id: "game", mark: "△", label: "試合のみ", enabled: true, bgClass: "bg-emerald-600" },
    { id: "absent", mark: "×", label: "欠席", enabled: true, bgClass: "bg-slate-400" },
  ],
  father: [
    { id: "duty", mark: "◎", label: "当番", enabled: true, bgClass: "bg-red-500" },
    { id: "help", mark: "○", label: "ヘルプ", enabled: true, bgClass: "bg-blue-600" },
    { id: "setup", mark: "▲", label: "設営撤収", enabled: true, bgClass: "bg-amber-500" },
    { id: "game", mark: "△", label: "試合のみ", enabled: true, bgClass: "bg-emerald-600" },
    { id: "absent", mark: "×", label: "欠席", enabled: true, bgClass: "bg-slate-400" },
  ],
  staff: [
    { id: "duty", mark: "◎", label: "当番", enabled: true, bgClass: "bg-red-500" },
    { id: "help", mark: "○", label: "指導参加", enabled: true, bgClass: "bg-blue-600" },
    { id: "setup", mark: "▲", label: "設営撤収", enabled: true, bgClass: "bg-amber-500" },
    { id: "game", mark: "△", label: "試合のみ", enabled: true, bgClass: "bg-emerald-600" },
    { id: "absent", mark: "×", label: "欠席", enabled: true, bgClass: "bg-slate-400" },
  ],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 型定義
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface EventItem {
  id: string;
  title: string;
  description?: string;
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

type MemberSortOrderMap = {
  player?: string[];
  mother?: string[];
  father?: string[];
  staff?: string[];
};

function getTodayJST(): string {
  const d = new Date();
  const jstFormatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = jstFormatter.formatToParts(d);
  const y = parts.find(p => p.type === "year")?.value || String(d.getFullYear());
  const m = parts.find(p => p.type === "month")?.value || String(d.getMonth() + 1).padStart(2, "0");
  const day = parts.find(p => p.type === "day")?.value || String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔀 並び替え可能なメンバー行コンポーネント (Drag & Drop + ボタン)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function SortableMemberRow({
  person,
  index,
  total,
  onMoveUp,
  onMoveDown,
}: {
  person: MemberPerson;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      as="div"
      value={person}
      id={person.id}
      dragListener={false}
      dragControls={controls}
      className="flex items-center justify-between p-1.5 rounded-xl bg-card border border-border/70 hover:border-primary/40 shadow-xs transition-colors select-none"
      whileDrag={{
        scale: 1.02,
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.2)",
        borderColor: "var(--primary)",
        backgroundColor: "var(--card)",
        zIndex: 50,
      }}
    >
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {/* ドラッグハンドル */}
        <div
          onPointerDown={(e) => controls.start(e)}
          className="p-1 -ml-0.5 text-muted-foreground/60 hover:text-foreground active:text-primary cursor-grab active:cursor-grabbing touch-none shrink-0 rounded-md hover:bg-muted"
          title="ドラッグして並び替え"
        >
          <GripVertical className="w-4 h-4" />
        </div>

        <span className="w-4 h-4 rounded-full bg-black/10 dark:bg-white/10 text-[9px] font-black flex items-center justify-center text-muted-foreground shrink-0">
          {index + 1}
        </span>
        {person.uniformNumber && (
          <span className="text-[9px] font-black text-primary px-1 py-0.2 rounded bg-primary/10 shrink-0">
            #{person.uniformNumber}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black text-foreground truncate">{person.name}</p>
          {person.subText && (
            <p className="text-[8.5px] text-muted-foreground truncate leading-none">{person.subText}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-0.5 shrink-0 ml-1">
        <button
          type="button"
          disabled={index === 0}
          onClick={onMoveUp}
          className="p-1 rounded-md bg-muted/50 hover:bg-muted disabled:opacity-20 disabled:pointer-events-none border border-border/60 text-foreground active:scale-95 transition-all"
          title="1つ上へ"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          disabled={index === total - 1}
          onClick={onMoveDown}
          className="p-1 rounded-md bg-muted/50 hover:bg-muted disabled:opacity-20 disabled:pointer-events-none border border-border/60 text-foreground active:scale-95 transition-all"
          title="1つ下へ"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
    </Reorder.Item>
  );
}

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
  const [selectedGroupTab, setSelectedGroupTab] = useState<GroupTabType | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isManagerOverrideMode, setIsManagerOverrideMode] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [showPastDates, setShowPastDates] = useState<boolean>(false);

  // メンバー並び順状態
  const [memberSortOrder, setMemberSortOrder] = useState<MemberSortOrderMap>({});
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [orderModalGroup, setOrderModalGroup] = useState<SortGroupKey>("player");
  const [tempOrders, setTempOrders] = useState<Record<SortGroupKey, MemberPerson[]>>({
    player: [],
    mother: [],
    father: [],
    staff: [],
  });
  const [isSavingOrder, setIsSavingOrder] = useState(false);

  // グループ別ステータス設定状態
  const [groupStatusConfig, setGroupStatusConfig] = useState<GroupStatusConfigMap>(DEFAULT_GROUP_STATUS_CONFIG);
  const [isStatusConfigModalOpen, setIsStatusConfigModalOpen] = useState(false);
  const [statusModalGroup, setStatusModalGroup] = useState<SortGroupKey>("player");
  const [tempStatusConfig, setTempStatusConfig] = useState<GroupStatusConfigMap>(DEFAULT_GROUP_STATUS_CONFIG);
  const [isSavingStatusConfig, setIsSavingStatusConfig] = useState(false);

  // 🏷️ メンバーサブラベル（班・役職等）状態
  const [memberSubLabels, setMemberSubLabels] = useState<Record<string, string>>({});
  const [isSubLabelsModalOpen, setIsSubLabelsModalOpen] = useState(false);
  const [subLabelsModalGroup, setSubLabelsModalGroup] = useState<SortGroupKey>("player");
  const [tempSubLabels, setTempSubLabels] = useState<Record<string, string>>({});
  const [isSavingSubLabels, setIsSavingSubLabels] = useState(false);

  // 単一メンバーのサブラベル即時編集モーダル
  const [editingSingleSubLabel, setEditingSingleSubLabel] = useState<{
    person: MemberPerson;
    label: string;
  } | null>(null);
  const [isSavingSingleSubLabel, setIsSavingSingleSubLabel] = useState(false);

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

  // 日別メモ編集状態
  const [editingDayNote, setEditingDayNote] = useState<{
    eventId: string;
    eventTitle: string;
    eventDate: string;
    description: string;
  } | null>(null);
  const [isSavingDayNote, setIsSavingDayNote] = useState(false);

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

        // 🌟 1. 自分が所属するグループの初期選択 (父・母・スタッフ・選手)
        const myId = data.myInfo?.memberId;
        const myGroupType = data.myInfo?.groupType;

        if (myGroupType === "father") {
          setSelectedGroupTab("father");
        } else if (myGroupType === "mother") {
          setSelectedGroupTab("mother");
        } else if (myGroupType === "staff") {
          setSelectedGroupTab("staff");
        } else if (myId) {
          if (fathers.some((f: MemberPerson) => f.id === myId)) {
            setSelectedGroupTab("father");
          } else if (mothers.some((m: MemberPerson) => m.id === myId)) {
            setSelectedGroupTab("mother");
          } else if ((g.staff || []).some((s: MemberPerson) => s.id === myId)) {
            setSelectedGroupTab("staff");
          } else if (parents.some((p: MemberPerson) => p.id === myId)) {
            setSelectedGroupTab("father");
          } else if ((g.players || []).some((p: MemberPerson) => p.id === myId)) {
            setSelectedGroupTab("player");
          }
        }

        // 🌟 2. グループ別ステータス設定の復元（LocalStorage ＆ サーバー設定）
        let effectiveStatusConfig: GroupStatusConfigMap = DEFAULT_GROUP_STATUS_CONFIG;
        try {
          const localKey = `iscore_matrix_status_config_${teamId}`;
          const localSaved = localStorage.getItem(localKey);
          if (localSaved) {
            const parsed = JSON.parse(localSaved);
            effectiveStatusConfig = { ...effectiveStatusConfig, ...parsed };
          }
        } catch {}

        if (data.attendanceStatusConfig) {
          effectiveStatusConfig = { ...effectiveStatusConfig, ...data.attendanceStatusConfig };
        }
        setGroupStatusConfig(effectiveStatusConfig);

        // メンバー並び順の復元（LocalStorage ＆ サーバー設定）
        let effectiveOrder: MemberSortOrderMap = {};
        try {
          const localKey = `iscore_matrix_order_${teamId}`;
          const localSaved = localStorage.getItem(localKey);
          if (localSaved) effectiveOrder = JSON.parse(localSaved);
        } catch {}

        if (data.memberSortOrder && Object.keys(data.memberSortOrder).length > 0) {
          effectiveOrder = { ...effectiveOrder, ...data.memberSortOrder };
        }
        setMemberSortOrder(effectiveOrder);

        // 🏷️ メンバーサブラベル（班・役職等）の復元（LocalStorage ＆ サーバー設定）
        let effectiveSubLabels: Record<string, string> = {};
        try {
          const localKey = `iscore_matrix_sublabels_${teamId}`;
          const localSaved = localStorage.getItem(localKey);
          if (localSaved) effectiveSubLabels = JSON.parse(localSaved);
        } catch {}

        if (data.memberSubLabels && Object.keys(data.memberSubLabels).length > 0) {
          effectiveSubLabels = { ...effectiveSubLabels, ...data.memberSubLabels };
        }
        setMemberSubLabels(effectiveSubLabels);
      }
    } catch (err) {
      console.error("Matrix load error:", err);
      toast.error("出欠一覧表データの読み込みに失敗しました");
    } finally {
      setSelectedGroupTab(prev => prev ?? "father");
      setIsLoading(false);
    }
  }, [currentTeam?.id, profile?.userId, profile?.displayName]);

  useEffect(() => {
    loadMatrixData();
  }, [loadMatrixData]);

  const todayStr = useMemo(() => getTodayJST(), []);
  const currentMonthStr = useMemo(() => todayStr.slice(0, 7), [todayStr]);

  // 利用可能な月リスト（イベント一覧からユニーク抽出）
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    if (currentMonthStr) set.add(currentMonthStr);
    for (const ev of events) {
      if (ev.dateStr && ev.dateStr.length >= 7) {
        set.add(ev.dateStr.slice(0, 7));
      }
    }
    return Array.from(set).sort();
  }, [events, currentMonthStr]);

  // 絞り込み済みイベントリスト（月選択 ＆ 過去日表示トグル反映）
  const filteredEvents = useMemo(() => {
    let list = events;

    // 1. 月フィルター
    if (selectedMonth !== "all") {
      list = list.filter(ev => ev.dateStr.startsWith(selectedMonth));
    }

    // 2. 過去日フィルター
    if (!showPastDates) {
      const isSpecificPastMonth = selectedMonth !== "all" && selectedMonth < currentMonthStr;
      if (!isSpecificPastMonth) {
        list = list.filter(ev => ev.dateStr >= todayStr);
      }
    }

    return list;
  }, [events, selectedMonth, showPastDates, todayStr, currentMonthStr]);

  // メンバー並び替えヘルパー関数
  const sortMembersByCustomOrder = useCallback((members: MemberPerson[], orderIds?: string[]) => {
    if (!orderIds || orderIds.length === 0) return members;
    const orderMap = new Map<string, number>();
    orderIds.forEach((id, idx) => orderMap.set(id, idx));

    return [...members].sort((a, b) => {
      const idxA = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
      const idxB = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
      if (idxA !== idxB) return idxA - idxB;
      return a.name.localeCompare(b.name, "ja");
    });
  }, []);

  // 選択されたタブに応じたメンバー一覧（カスタム並び順適用）
  const currentMembers = useMemo(() => {
    let list: MemberPerson[] = [];

    const sortedPlayers = sortMembersByCustomOrder(groups.players, memberSortOrder.player);
    const sortedMothers = sortMembersByCustomOrder(groups.mothers, memberSortOrder.mother);
    const sortedFathers = sortMembersByCustomOrder(groups.fathers, memberSortOrder.father);
    const sortedStaff = sortMembersByCustomOrder(groups.staff, memberSortOrder.staff);
    const otherParents = groups.parents.filter(
      p => !groups.mothers.some(m => m.id === p.id) && !groups.fathers.some(f => f.id === p.id)
    );

    if (selectedGroupTab === "all") {
      const combined = [
        ...sortedPlayers,
        ...sortedMothers,
        ...sortedFathers,
        ...sortedStaff,
        ...otherParents,
      ];
      const seen = new Set<string>();
      list = combined.filter(m => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
    } else if (selectedGroupTab === "player") {
      list = sortedPlayers;
    } else if (selectedGroupTab === "mother") {
      list = sortedMothers;
    } else if (selectedGroupTab === "father") {
      list = sortedFathers;
    } else if (selectedGroupTab === "staff") {
      list = sortedStaff;
    } else if (selectedGroupTab === "parent") {
      list = [...sortedMothers, ...sortedFathers, ...otherParents];
    }

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(m => 
      m.name.toLowerCase().includes(q) ||
      (m.subText && m.subText.toLowerCase().includes(q)) ||
      (memberSubLabels[m.id] && memberSubLabels[m.id].toLowerCase().includes(q))
    );
  }, [selectedGroupTab, groups, memberSortOrder, sortMembersByCustomOrder, searchQuery, memberSubLabels]);

  // モーダルを開く処理
  const handleOpenOrderModal = () => {
    setOrderModalGroup(
      !selectedGroupTab || selectedGroupTab === "all" || selectedGroupTab === "parent" ? "player" : selectedGroupTab
    );
    setTempOrders({
      player: sortMembersByCustomOrder(groups.players, memberSortOrder.player),
      mother: sortMembersByCustomOrder(groups.mothers, memberSortOrder.mother),
      father: sortMembersByCustomOrder(groups.fathers, memberSortOrder.father),
      staff: sortMembersByCustomOrder(groups.staff, memberSortOrder.staff),
    });
    setIsOrderModalOpen(true);
  };

  // アイテムの上下移動処理
  const handleMoveItem = (fromIndex: number, direction: -1 | 1) => {
    const toIndex = fromIndex + direction;
    const currentList = tempOrders[orderModalGroup];
    if (toIndex < 0 || toIndex >= currentList.length) return;

    const newList = [...currentList];
    const [moved] = newList.splice(fromIndex, 1);
    newList.splice(toIndex, 0, moved);

    setTempOrders(prev => ({
      ...prev,
      [orderModalGroup]: newList,
    }));
  };

  // プリセット整列処理
  const handlePresetSort = (type: "number" | "name" | "reset") => {
    let original = groups.players;
    if (orderModalGroup === "mother") original = groups.mothers;
    else if (orderModalGroup === "father") original = groups.fathers;
    else if (orderModalGroup === "staff") original = groups.staff;

    let sorted = [...original];
    if (type === "number") {
      sorted.sort((a, b) => {
        const numA = parseInt(a.uniformNumber?.replace(/\D/g, "") || "999", 10);
        const numB = parseInt(b.uniformNumber?.replace(/\D/g, "") || "999", 10);
        return numA - numB;
      });
    } else if (type === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name, "ja"));
    }

    setTempOrders(prev => ({
      ...prev,
      [orderModalGroup]: sorted,
    }));
  };

  // 並び順の保存処理
  const handleSaveOrder = async () => {
    setIsSavingOrder(true);
    const newOrder: MemberSortOrderMap = {
      player: tempOrders.player.map(p => p.id),
      mother: tempOrders.mother.map(p => p.id),
      father: tempOrders.father.map(p => p.id),
      staff: tempOrders.staff.map(p => p.id),
    };

    setMemberSortOrder(newOrder);

    const teamId = currentTeam?.id || "demo-team";
    try {
      localStorage.setItem(`iscore_matrix_order_${teamId}`, JSON.stringify(newOrder));
    } catch {}

    try {
      if (teamId && teamId !== "demo-team") {
        await fetch("/api/liff/attendance-matrix/member-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId, memberSortOrder: newOrder }),
        });
      }
      toast.success("メンバー列の並び順を保存しました！");
      setIsOrderModalOpen(false);
    } catch (err: any) {
      console.error("Order save error:", err);
      toast.success("並び順を端末に保存しました");
      setIsOrderModalOpen(false);
    } finally {
      setIsSavingOrder(false);
    }
  };

  // 🏷️ ステータス設定モーダルを開く
  const handleOpenStatusConfigModal = () => {
    setStatusModalGroup(
      !selectedGroupTab || selectedGroupTab === "all" || selectedGroupTab === "parent" ? "player" : selectedGroupTab
    );
    setTempStatusConfig(JSON.parse(JSON.stringify(groupStatusConfig)));
    setIsStatusConfigModalOpen(true);
  };

  // ステータスの有効/無効トグル
  const handleToggleStatus = (statusId: AttendanceMarkType) => {
    setTempStatusConfig(prev => {
      const list = prev[statusModalGroup] || [];
      const updated = list.map(item => 
        item.id === statusId ? { ...item, enabled: !item.enabled } : item
      );
      return {
        ...prev,
        [statusModalGroup]: updated,
      };
    });
  };

  // ステータスの名称変更
  const handleChangeStatusLabel = (statusId: AttendanceMarkType, newLabel: string) => {
    setTempStatusConfig(prev => {
      const list = prev[statusModalGroup] || [];
      const updated = list.map(item => 
        item.id === statusId ? { ...item, label: newLabel } : item
      );
      return {
        ...prev,
        [statusModalGroup]: updated,
      };
    });
  };

  // グループのステータス設定をデフォルトにリセット
  const handleResetStatusGroup = () => {
    setTempStatusConfig(prev => ({
      ...prev,
      [statusModalGroup]: JSON.parse(JSON.stringify(DEFAULT_GROUP_STATUS_CONFIG[statusModalGroup])),
    }));
    toast.info(`${statusModalGroup === "player" ? "選手" : statusModalGroup === "mother" ? "母" : statusModalGroup === "father" ? "父" : "スタッフ"}のステータス設定を初期値に戻しました`);
  };

  // ステータス設定の保存
  const handleSaveStatusConfig = async () => {
    setIsSavingStatusConfig(true);
    setGroupStatusConfig(tempStatusConfig);

    const teamId = currentTeam?.id || "demo-team";
    try {
      localStorage.setItem(`iscore_matrix_status_config_${teamId}`, JSON.stringify(tempStatusConfig));
    } catch {}

    try {
      if (teamId && teamId !== "demo-team") {
        await fetch("/api/liff/attendance-matrix/status-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId, statusConfig: tempStatusConfig }),
        });
      }
      toast.success("ステータス設定を保存しました");
      setIsStatusConfigModalOpen(false);
    } catch (err: any) {
      console.error("Failed to save status config:", err);
      toast.error("ステータス設定の保存に失敗しました");
    } finally {
      setIsSavingStatusConfig(false);
    }
  };

  // 🏷️ メンバーサブラベル（班・役職等）一括編集モーダルを開く
  const handleOpenSubLabelsModal = () => {
    setSubLabelsModalGroup(
      !selectedGroupTab || selectedGroupTab === "all" || selectedGroupTab === "parent" ? "player" : selectedGroupTab
    );
    setTempSubLabels({ ...memberSubLabels });
    setIsSubLabelsModalOpen(true);
  };

  // メンバーサブラベルの一括保存処理
  const handleSaveSubLabels = async () => {
    setIsSavingSubLabels(true);
    setMemberSubLabels(tempSubLabels);

    const teamId = currentTeam?.id || "demo-team";
    try {
      localStorage.setItem(`iscore_matrix_sublabels_${teamId}`, JSON.stringify(tempSubLabels));
    } catch {}

    try {
      if (teamId && teamId !== "demo-team") {
        await fetch("/api/liff/attendance-matrix/sub-labels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId, memberSubLabels: tempSubLabels }),
        });
      }
      toast.success("班・サブラベル設定を保存しました！");
      setIsSubLabelsModalOpen(false);
    } catch (err: any) {
      console.error("SubLabels save error:", err);
      toast.success("班・サブラベルを端末に保存しました");
      setIsSubLabelsModalOpen(false);
    } finally {
      setIsSavingSubLabels(false);
    }
  };

  // 単一メンバーのサブラベル編集モーダルを開く
  const handleOpenSingleSubLabelModal = (person: MemberPerson) => {
    setEditingSingleSubLabel({
      person,
      label: memberSubLabels[person.id] || "",
    });
  };

  // 単一メンバーのサブラベル保存処理
  const handleSaveSingleSubLabel = async (newLabel: string) => {
    if (!editingSingleSubLabel) return;
    setIsSavingSingleSubLabel(true);
    const personId = editingSingleSubLabel.person.id;
    const cleanLabel = newLabel.trim();

    const updated = { ...memberSubLabels };
    if (cleanLabel) {
      updated[personId] = cleanLabel;
    } else {
      delete updated[personId];
    }

    setMemberSubLabels(updated);

    const teamId = currentTeam?.id || "demo-team";
    try {
      localStorage.setItem(`iscore_matrix_sublabels_${teamId}`, JSON.stringify(updated));
    } catch {}

    try {
      if (teamId && teamId !== "demo-team") {
        await fetch("/api/liff/attendance-matrix/sub-labels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId, memberSubLabels: updated }),
        });
      }
      toast.success(`${editingSingleSubLabel.person.name} さんのラベルを更新しました`);
      setEditingSingleSubLabel(null);
    } catch (err: any) {
      console.error("Single SubLabel save error:", err);
      toast.success("ラベルを端末に保存しました");
      setEditingSingleSubLabel(null);
    } finally {
      setIsSavingSingleSubLabel(false);
    }
  };

  // 凡例に表示するアイテム（グループ別に有効なもの）
  const activeLegendItems = useMemo(() => {
    if (!selectedGroupTab) return [];
    if (selectedGroupTab === "all" || selectedGroupTab === "parent") {
      const map = new Map<AttendanceMarkType, StatusSettingItem>();
      Object.values(groupStatusConfig).forEach(list => {
        list.forEach(item => {
          if (item.enabled && !map.has(item.id)) {
            map.set(item.id, item);
          }
        });
      });
      return Array.from(map.values());
    }
    return (groupStatusConfig[selectedGroupTab] || []).filter(item => item.enabled);
  }, [selectedGroupTab, groupStatusConfig]);

  // 📊 一覧表の出欠集計列に表示するステータス一覧（項目設定で有効なものに連動・非表示設定の列は除外）
  const activeSummaryStatuses = useMemo(() => {
    const ORDER: AttendanceMarkType[] = ["duty", "help", "setup", "game", "absent"];
    const enabledSet = new Set<AttendanceMarkType>();

    if (!selectedGroupTab || selectedGroupTab === "all" || selectedGroupTab === "parent") {
      Object.values(groupStatusConfig).forEach(list => {
        list.forEach(item => {
          if (item.enabled) enabledSet.add(item.id);
        });
      });
    } else if (selectedGroupTab in groupStatusConfig) {
      const list = groupStatusConfig[selectedGroupTab as SortGroupKey] || [];
      list.forEach(item => {
        if (item.enabled) enabledSet.add(item.id);
      });
    }

    return ORDER.filter(id => enabledSet.has(id)).map(id => {
      const def = ATTENDANCE_STATUSES[id];
      let customLabel = def?.label || id;
      if (selectedGroupTab && selectedGroupTab in groupStatusConfig) {
        const item = groupStatusConfig[selectedGroupTab as SortGroupKey]?.find(i => i.id === id);
        if (item?.label) customLabel = item.label;
      }

      return {
        id,
        mark: def?.mark || "",
        label: customLabel,
        headerBgClass:
          id === "duty" ? "bg-[#fee2e2] dark:bg-[#450a0a] text-red-700 dark:text-red-300" :
          id === "help" ? "bg-[#dbeafe] dark:bg-[#172554] text-blue-700 dark:text-blue-300" :
          id === "setup" ? "bg-[#fef3c7] dark:bg-[#451a03] text-amber-700 dark:text-amber-300" :
          id === "game" ? "bg-[#d1fae5] dark:bg-[#064e3b] text-emerald-700 dark:text-emerald-300" :
          "bg-[#e2e8f0] dark:bg-[#1e293b] text-slate-700 dark:text-slate-300",
        cellTextClass:
          id === "duty" ? "text-red-700 dark:text-red-300 bg-red-50/90 dark:bg-red-950/40 font-black" :
          id === "help" ? "text-blue-700 dark:text-blue-300 bg-blue-50/90 dark:bg-blue-950/40 font-black" :
          id === "setup" ? "text-amber-700 dark:text-amber-300 bg-amber-50/90 dark:bg-amber-950/40 font-black" :
          id === "game" ? "text-emerald-700 dark:text-emerald-300 bg-emerald-50/90 dark:bg-emerald-950/40 font-black" :
          "text-slate-700 dark:text-slate-300 bg-slate-100/80 dark:bg-slate-800/50 font-black",
        cellMutedClass:
          id === "duty" ? "text-red-400/40 dark:text-red-400/25 bg-red-50/40 dark:bg-red-950/20 font-medium" :
          id === "help" ? "text-blue-400/40 dark:text-blue-400/25 bg-blue-50/40 dark:bg-blue-950/20 font-medium" :
          id === "setup" ? "text-amber-400/40 dark:text-amber-400/25 bg-amber-50/40 dark:bg-amber-950/20 font-medium" :
          id === "game" ? "text-emerald-400/40 dark:text-emerald-400/25 bg-emerald-50/40 dark:bg-emerald-950/20 font-medium" :
          "text-slate-400/40 dark:text-slate-400/25 bg-slate-50/40 dark:bg-slate-900/20 font-medium",
      };
    });
  }, [selectedGroupTab, groupStatusConfig]);

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
    const enabledSet = new Set<AttendanceMarkType>(activeSummaryStatuses.map(s => s.id));

    const lines = [
      `【出欠集計】${event.date}(${event.dayOfWeek}) ${event.dutyGroup !== "なし" ? `[${event.dutyGroup}]` : ""}`,
      `📌 ${event.title}`,
      `📍 ${event.location}`,
      ...(event.description ? [`📝 備考: ${event.description}`] : []),
      `━━━━━━━━━━━━━━`,
      `👥 出席計: ${totalCount}名`,
      ...(enabledSet.has("duty") || dutyNames.length > 0 ? [`◎ 当番 (${dutyNames.length}): ${dutyNames.join(", ") || "なし"}`] : []),
      ...(enabledSet.has("help") || helpNames.length > 0 ? [`○ ヘルプ (${helpNames.length}): ${helpNames.join(", ") || "なし"}`] : []),
      ...(enabledSet.has("setup") || setupNames.length > 0 ? [`▲ 設営・撤収 (${setupNames.length}): ${setupNames.join(", ") || "なし"}`] : []),
      ...(enabledSet.has("game") || gameNames.length > 0 ? [`△ 試合のみ (${gameNames.length}): ${gameNames.join(", ") || "なし"}`] : []),
      ...(enabledSet.has("absent") || absentNames.length > 0 ? [`× 欠席 (${absentNames.length}): ${absentNames.join(", ") || "なし"}`] : []),
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

  // 日別メモモーダルを開く
  const handleOpenDayNoteModal = (ev: EventItem) => {
    setEditingDayNote({
      eventId: ev.id,
      eventTitle: ev.title,
      eventDate: `${ev.date}(${ev.dayOfWeek})`,
      description: ev.description || "",
    });
  };

  // 日別メモ保存処理
  const handleSaveDayNote = async (newDescription: string) => {
    if (!editingDayNote) return;
    setIsSavingDayNote(true);
    const { eventId } = editingDayNote;

    // 楽観的更新
    setEvents(prev => prev.map(ev => ev.id === eventId ? { ...ev, description: newDescription } : ev));

    try {
      const teamId = currentTeam?.id || "demo-team";
      if (teamId !== "demo-team") {
        await fetch("/api/liff/attendance-matrix/event-note", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId, description: newDescription }),
        });
      }
      toast.success("日別メモを保存しました");
      setEditingDayNote(null);
    } catch (err: any) {
      console.error("Save day note error:", err);
      toast.error("日別メモの保存に失敗しました");
    } finally {
      setIsSavingDayNote(false);
    }
  };

  return (
    <div className="flex flex-col flex-1">
      {/* ヘッダー */}
      <LiffHeader />

      <div className="p-4 space-y-4 max-w-lg mx-auto w-full">
        {/* ページ内ヘッダー */}
        <LiffPageHeader
          title="出欠一覧表"
          subtitle="当番集計・出欠確認"
          icon={
            <span className="w-8 h-8 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black">
              <ClipboardCheck className="w-4 h-4" />
            </span>
          }
          showBack
          shareData={{
            title: `【出欠一覧表】${currentTeam?.name || "チーム"} 出欠・当番状況`,
            text: `月別の活動予定と出欠一覧・当番集計はこちらから確認できます`,
          }}
        />

        {/* ① 👥 グループ切り分けタブ（上段・横幅いっぱいに均等配置） */}
        <div className="grid grid-cols-5 gap-1.5 w-full bg-muted/40 p-1.5 rounded-2xl border border-border/70 shadow-2xs">
          {[
            { id: "player", label: "選手", count: groups.players.length, activeClass: "bg-emerald-600 text-white font-black shadow-xs" },
            { id: "mother", label: "母", count: groups.mothers.length, activeClass: "bg-rose-500 text-white font-black shadow-xs" },
            { id: "father", label: "父", count: groups.fathers.length, activeClass: "bg-blue-600 text-white font-black shadow-xs" },
            { id: "staff", label: "スタッフ", count: groups.staff.length, activeClass: "bg-purple-600 text-white font-black shadow-xs" },
            { id: "all", label: "全員", count: new Set([...groups.players, ...(groups.parents.length > 0 ? groups.parents : [...groups.mothers, ...groups.fathers]), ...groups.staff].map(m => m.id)).size, activeClass: "bg-primary text-primary-foreground font-black shadow-xs shadow-primary/20" },
          ].map(tab => {
            const isTabActive = !isLoading && selectedGroupTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedGroupTab(tab.id as any)}
                className={`flex items-center justify-center gap-1 py-1.5 px-0.5 rounded-xl text-[10.5px] font-black transition-all active:scale-95 ${
                  isTabActive
                    ? tab.activeClass
                    : "bg-card hover:bg-muted text-muted-foreground border border-border/60"
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-[8.5px] px-1 py-0 rounded-full font-bold leading-none ${
                  isTabActive ? "bg-white/20 text-white" : "bg-black/5 dark:bg-white/10 text-muted-foreground"
                }`}>
                  {isLoading ? "-" : tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ② 🏷️ 凡例 ＆ アクション操作バー（グループ別の凡例を横幅いっぱいに均等配置） */}
        <div className="bg-card rounded-2xl px-3 py-2 border border-border/80 shadow-2xs space-y-2">
          <div className="flex items-center justify-between gap-1 text-[9.5px]">
            <div className="flex items-center gap-1.5 font-black text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span>
                凡例（{isLoading ? "読み込み中..." : selectedGroupTab === "player" ? "選手" : selectedGroupTab === "mother" ? "母" : selectedGroupTab === "father" ? "父" : selectedGroupTab === "staff" ? "スタッフ" : selectedGroupTab === "all" ? "全員" : "未選択"}）:
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {/* ステータス設定ボタン */}
              <button
                type="button"
                onClick={handleOpenStatusConfigModal}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9.5px] font-bold bg-muted hover:bg-muted/80 text-foreground border border-border/70 active:scale-95 transition-all shrink-0"
                title="グループ別のステータス表示有無と名称を設定"
              >
                <SlidersHorizontal className="w-3 h-3 text-primary" />
                <span>項目設定</span>
              </button>

              {/* メンバー並び順設定ボタン */}
              <button
                type="button"
                onClick={handleOpenOrderModal}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9.5px] font-bold bg-muted hover:bg-muted/80 text-foreground border border-border/70 active:scale-95 transition-all shrink-0"
                title="グループ内のメンバー列の並び順を設定"
              >
                <ArrowUpDown className="w-3 h-3 text-primary" />
                <span>並び順設定</span>
              </button>

              {/* 🏷️ メンバー班・サブラベル設定ボタン */}
              {myInfo.isManager && (
                <button
                  type="button"
                  onClick={handleOpenSubLabelsModal}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9.5px] font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/40 active:scale-95 transition-all shrink-0"
                  title="メンバーの班（1班・2班等）やサブラベルを一括設定"
                >
                  <Tag className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  <span>班・ラベル</span>
                </button>
              )}

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
          </div>

          {/* 凡例アイコン（グループで有効なステータスのみ・横幅いっぱいに均等配置） */}
          <div className="flex items-center gap-1 text-[9.5px] pt-1 border-t border-border/50 overflow-x-auto no-scrollbar">
            {activeLegendItems.length === 0 ? (
              <span className="text-[9px] text-muted-foreground py-1 px-2">有効なステータスがありません</span>
            ) : (
              activeLegendItems.map((item) => (
                <div
                  key={item.id}
                  className="flex-1 min-w-[50px] flex items-center justify-center gap-1 font-bold py-1 px-0.5 rounded-lg bg-muted/40 border border-border/40 text-center"
                >
                  <span className={`w-3.5 h-3.5 rounded-full ${item.bgClass} text-white flex items-center justify-center text-[9px] font-black shrink-0`}>
                    {item.mark}
                  </span>
                  <span className="truncate text-foreground text-[9px]">{item.label}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ③ 📅 月単位選択 ＆ 過去日表示切替 ＆ 検索バー (コンパクト統合) */}
        <div className="bg-card rounded-2xl p-2 sm:p-2.5 border border-border/80 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 text-[9.5px]">
          {/* 月選択ピル */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
            <span className="font-black text-muted-foreground shrink-0 flex items-center gap-0.5 mr-0.5">
              <CalendarIcon className="w-3 h-3 text-primary" />
              <span>月:</span>
            </span>

            <button
              type="button"
              onClick={() => setSelectedMonth("all")}
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap transition-all active:scale-95 shrink-0 ${
                selectedMonth === "all"
                  ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 font-black shadow-xs"
                  : "bg-muted/70 hover:bg-muted text-muted-foreground border border-border/60"
              }`}
            >
              全期間
            </button>

            {availableMonths.map(m => {
              const parts = m.split("-");
              const mNum = parseInt(parts[1], 10);
              const label = `${mNum}月`;
              const isCurrent = m === currentMonthStr;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSelectedMonth(m)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap transition-all active:scale-95 shrink-0 ${
                    selectedMonth === m
                      ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 font-black shadow-xs"
                      : "bg-muted/70 hover:bg-muted text-muted-foreground border border-border/60"
                  }`}
                >
                  {label}{isCurrent ? "(今月)" : ""}
                </button>
              );
            })}
          </div>

          {/* 過去日トグル ＆ メンバー名検索 */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* 過去日 表示・非表示トグル */}
            <button
              type="button"
              onClick={() => setShowPastDates(prev => !prev)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9.5px] font-bold transition-all active:scale-95 border shrink-0 ${
                showPastDates
                  ? "bg-primary/15 text-primary border-primary/40 font-black"
                  : "bg-muted text-muted-foreground border-border/60 hover:text-foreground"
              }`}
            >
              {showPastDates ? (
                <>
                  <Eye className="w-3 h-3" />
                  <span>過去日: 表示中</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-3 h-3" />
                  <span>過去日: 非表示</span>
                </>
              )}
            </button>

            {/* 氏名検索インプット */}
            <div className="relative shrink-0 flex-1 sm:w-36">
              <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="メンバー名検索..."
                className="w-full pl-6 pr-5 py-0.5 text-[10px] rounded-lg bg-card border border-border/80 focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground h-6"
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
        </div>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            📊 出欠マトリクス表（スプレッドシート型UI・余白極小・不透明完全固定）
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {isLoading ? (
          <div className="p-8 flex flex-col items-center justify-center gap-2 bg-card rounded-xl border border-border">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <p className="text-[11px] text-muted-foreground font-bold">出欠一覧表を読み込み中...</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="p-6 text-center bg-card rounded-xl border border-border">
            <AlertCircle className="w-6 h-6 text-muted-foreground mx-auto mb-1.5" />
            <p className="text-xs font-black text-foreground">表示する予定・イベントがありません</p>
            {events.length > 0 && !showPastDates ? (
              <div className="mt-2 space-y-1">
                <p className="text-[10px] text-muted-foreground">過去の予定が非表示になっている可能性があります。</p>
                <button
                  type="button"
                  onClick={() => setShowPastDates(true)}
                  className="px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-black transition-all"
                >
                  過去日の予定を表示する
                </button>
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground mt-0.5">「活動予定の一括登録」から予定を追加してください。</p>
            )}
          </div>
        ) : (
          <div className="relative bg-card rounded-2xl border border-border shadow-xs overflow-hidden">
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
                          {filteredEvents.length}日
                        </span>
                      </div>
                    </th>

                    {/* 📊 出欠集計列 (各記号ごとの専用タイトル列・幅25px・項目設定で有効なもののみ動的表示) */}
                    {activeSummaryStatuses.map((st) => (
                      <th
                        key={st.id}
                        className={`w-6 min-w-[25px] max-w-[25px] p-0.5 text-center border-b-2 border-r border-border font-black text-[11px] align-middle ${st.headerBgClass}`}
                        title={`${st.mark} ${st.label}`}
                      >
                        {st.mark}
                      </th>
                    ))}

                    {/* メンバー列 (超コンパクト・幅35px) */}
                    {currentMembers.map((person) => {
                      const isMe = person.id === myInfo.memberId || myInfo.playerIds.includes(person.id);
                      const subLabel = memberSubLabels[person.id];
                      return (
                        <th
                          key={person.id}
                          onClick={myInfo.isManager ? () => handleOpenSingleSubLabelModal(person) : undefined}
                          className={`w-9 min-w-[35px] max-w-[35px] p-0.5 text-center border-b-2 border-r border-border align-middle transition-colors select-none ${
                            myInfo.isManager ? "cursor-pointer hover:brightness-95" : ""
                          } ${
                            isMe
                              ? "bg-blue-200 dark:bg-blue-900 text-blue-950 dark:text-blue-100 ring-1 ring-inset ring-blue-500 font-black"
                              : "bg-slate-100 dark:bg-zinc-800 text-foreground"
                          }`}
                          title={myInfo.isManager ? `${person.name}: タップして班・ラベルを変更` : person.name}
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
                            {/* 3行目: 班・サブラベル (班バッジ風スタイル) */}
                            <div className="min-h-[14px] flex items-center justify-center mt-0.5">
                              {subLabel ? (
                                <span
                                  className="text-[8px] font-black px-1 py-0.2 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 truncate max-w-[33px] whitespace-nowrap leading-tight"
                                  title={subLabel}
                                >
                                  {subLabel}
                                </span>
                              ) : myInfo.isManager ? (
                                <span
                                  className="text-[7.5px] font-bold text-muted-foreground/50 hover:text-amber-600 dark:hover:text-amber-400 px-0.5 py-0.2 rounded hover:bg-amber-500/15 leading-tight transition-colors"
                                  title="タップして班・ラベルを設定"
                                >
                                  +班
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                {/* 📌 ボディ行 (イベントごと) */}
                <tbody>
                  {filteredEvents.map((ev) => {
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
                                <span className="w-[28px] min-w-[28px] max-w-[28px] text-center inline-flex items-center justify-center text-[8.5px] font-black py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 whitespace-nowrap shrink-0">
                                  {ev.dutyGroup}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-0.5 shrink-0">
                              {/* 日別メモ・備考ボタン */}
                              <button
                                type="button"
                                onClick={() => handleOpenDayNoteModal(ev)}
                                title={ev.description ? `備考: ${ev.description} (タップして編集)` : "日別の備考・メモを入力"}
                                className={`p-0.5 rounded transition-all cursor-pointer ${
                                  ev.description
                                    ? "text-amber-600 dark:text-amber-400 bg-amber-500/15 hover:bg-amber-500/25"
                                    : "text-muted-foreground/60 hover:text-foreground hover:bg-muted"
                                }`}
                              >
                                <FileText className="w-2.5 h-2.5" />
                              </button>

                              {/* LINE集計コピーボタン */}
                              <button
                                type="button"
                                onClick={() => handleCopyLineSummary(ev)}
                                title="LINE連絡用に集計コピー"
                                className="p-0.5 text-muted-foreground hover:text-primary rounded hover:bg-muted active:scale-90 transition-all cursor-pointer"
                              >
                                <ClipboardCopy className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          </div>

                          <p className="text-[9.5px] font-black text-foreground truncate max-w-[115px] mt-0.5 leading-tight" title={ev.title}>
                            {ev.title}
                          </p>

                          {/* 💬 日別メモ・備考の表示 */}
                          {ev.description && (
                            <p
                              onClick={() => handleOpenDayNoteModal(ev)}
                              className="text-[8.5px] text-amber-700 dark:text-amber-300 font-bold truncate max-w-[115px] mt-0.5 cursor-pointer hover:underline flex items-center gap-0.5 leading-tight bg-amber-500/10 px-1 py-0.5 rounded border border-amber-500/20"
                              title={`備考: ${ev.description} (タップして編集)`}
                            >
                              <MessageSquare className="w-2 h-2 shrink-0 text-amber-600 dark:text-amber-400" />
                              <span className="truncate">{ev.description}</span>
                            </p>
                          )}
                        </td>

                        {/* ② 出欠集計 各記号ごとの集計値セル (項目設定で有効なもののみ動的表示) */}
                        {activeSummaryStatuses.map((st) => {
                          const count = summary[st.id as keyof typeof summary] || 0;
                          return (
                            <td
                              key={st.id}
                              className={`w-6 min-w-[25px] max-w-[25px] p-0.5 text-center border-b border-r border-border font-black text-[10.5px] ${
                                count > 0 ? st.cellTextClass : st.cellMutedClass
                              }`}
                            >
                              {count}
                            </td>
                          );
                        })}

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

        {/* 🌟 最下部マージン（ボトムナビに被らず快適にタップできる適度な余白） */}
        <div className="h-8 w-full shrink-0 pointer-events-none select-none" aria-hidden="true" />

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ✏️ セルタップ時の出欠変更モーダル (ボトムナビと重ならない中央フロート配置)
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {editingCell && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-3.5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
            <div
              className="absolute inset-0"
              onClick={() => !isSavingCell && setEditingCell(null)}
            />

            <div className="relative w-full max-w-md bg-card rounded-2xl border border-border shadow-2xl p-4 sm:p-5 space-y-3.5 max-h-[85vh] overflow-y-auto no-scrollbar">
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

              {/* ステータス選択ボタン一覧 (グループ別設定に準拠) */}
              <div className="space-y-2">
                <label className="text-xs font-black text-foreground">
                  出欠ステータスを選択:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(() => {
                    const personGroup: SortGroupKey = 
                      editingCell.person.groupType === "father" ? "father" :
                      editingCell.person.groupType === "mother" ? "mother" :
                      editingCell.person.groupType === "staff" ? "staff" : "player";

                    const groupSettings = groupStatusConfig[personGroup] || DEFAULT_GROUP_STATUS_CONFIG[personGroup];
                    const groupSettingsMap = new Map(groupSettings.map(s => [s.id, s]));

                    return (Object.keys(ATTENDANCE_STATUSES) as AttendanceMarkType[]).filter(key => {
                      if (key === "pending") return true;
                      const setting = groupSettingsMap.get(key);
                      return setting ? (setting.enabled || editingCell.currentStatus === key) : true;
                    }).map((key) => {
                      const baseItem = ATTENDANCE_STATUSES[key];
                      const setting = groupSettingsMap.get(key);
                      const customLabel = setting?.label || baseItem.label;
                      const isSelected = editingCell.currentStatus === key;

                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => handleSaveCell(key, editingCell.comment)}
                          disabled={isSavingCell}
                          className={`flex items-center gap-2 p-2.5 rounded-2xl border text-left transition-all ${baseItem.buttonClass} ${
                            isSelected ? "ring-2 ring-primary ring-offset-2 font-black shadow-xs scale-[1.02]" : "opacity-80"
                          }`}
                        >
                          <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs shrink-0 ${baseItem.badgeClass}`}>
                            {baseItem.mark}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-black truncate">{customLabel}</p>
                            <p className="text-[9px] text-muted-foreground truncate">{baseItem.shortLabel}</p>
                          </div>
                        </button>
                      );
                    });
                  })()}
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

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            📝 日別メモ・備考入力モーダル
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {editingDayNote && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-3.5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div
              className="absolute inset-0"
              onClick={() => !isSavingDayNote && setEditingDayNote(null)}
            />

            <div className="relative w-full max-w-md bg-card rounded-2xl border border-border shadow-2xl p-4 sm:p-5 space-y-3.5 max-h-[85vh] overflow-y-auto no-scrollbar">
              <div className="flex items-start justify-between pb-2 border-b border-border/60">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black shrink-0">
                    <FileText className="w-3.5 h-3.5" />
                  </span>
                  <div>
                    <h3 className="text-xs font-black text-foreground">日別の備考・メモ</h3>
                    <p className="text-[9.5px] text-muted-foreground">
                      📅 {editingDayNote.eventDate} : {editingDayNote.eventTitle}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isSavingDayNote}
                  onClick={() => setEditingDayNote(null)}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* クイック入力タグ */}
              <div className="space-y-1">
                <p className="text-[9.5px] font-bold text-muted-foreground">よく使う定型文・タグ:</p>
                <div className="flex flex-wrap gap-1">
                  {[
                    "持ち物: お弁当・水筒多め",
                    "雨天時は7時までにLINE連絡",
                    "白ユニフォーム着用",
                    "現地8:30集合",
                    "配車3台必要",
                    "アナウンス当番あり",
                  ].map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setEditingDayNote(prev => prev ? {
                        ...prev,
                        description: prev.description ? `${prev.description} / ${tag}` : tag
                      } : null)}
                      className="px-2 py-0.5 rounded-md bg-muted hover:bg-muted/80 text-[9.5px] font-bold text-foreground border border-border/70 active:scale-95 transition-all"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* メモ本文入力欄 */}
              <div className="space-y-1">
                <label className="text-xs font-black text-foreground flex items-center justify-between">
                  <span>備考・メモ内容:</span>
                  <span className="text-[9.5px] text-muted-foreground font-normal">
                    LINE集計コピーにも自動反映されます
                  </span>
                </label>
                <textarea
                  rows={3}
                  value={editingDayNote.description}
                  onChange={(e) => setEditingDayNote(prev => prev ? { ...prev, description: e.target.value } : null)}
                  placeholder="例: 雨天時は7時にLINE連絡。持ち物は多めの水分とお弁当..."
                  className="w-full px-3 py-2 text-xs rounded-xl bg-muted/50 border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground resize-none leading-relaxed"
                />
              </div>

              {/* フッター操作ボタン */}
              <div className="flex items-center justify-end gap-2 pt-1 border-t border-border">
                <button
                  type="button"
                  onClick={() => setEditingDayNote(null)}
                  className="px-3 py-1.5 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted active:scale-95 transition-all"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={isSavingDayNote}
                  onClick={() => handleSaveDayNote(editingDayNote.description)}
                  className="px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-black hover:brightness-110 active:scale-95 transition-all flex items-center gap-1"
                >
                  {isSavingDayNote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>備考を保存</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            ⚙️ メンバー並び順設定モーダル
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {isOrderModalOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-card rounded-2xl border border-border shadow-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-black shrink-0">
                    <ArrowUpDown className="w-3.5 h-3.5" />
                  </span>
                  <div>
                    <h3 className="text-xs font-black text-foreground">メンバー表示順の設定</h3>
                    <p className="text-[9.5px] text-muted-foreground">グループ内での列の並び順を変更できます</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOrderModalOpen(false)}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* グループ切り替えタブ */}
              <div className="flex items-center gap-1 border-b border-border/60 pb-1.5">
                {[
                  { key: "player" as const, label: "選手", count: groups.players.length },
                  { key: "mother" as const, label: "母", count: groups.mothers.length },
                  { key: "father" as const, label: "父", count: groups.fathers.length },
                  { key: "staff" as const, label: "スタッフ", count: groups.staff.length },
                ].map(tab => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setOrderModalGroup(tab.key)}
                    className={`flex-1 py-1 text-center rounded-lg text-[10.5px] font-bold transition-all ${
                      orderModalGroup === tab.key
                        ? "bg-primary text-primary-foreground font-black shadow-xs"
                        : "bg-muted/50 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab.label} ({tab.count})
                  </button>
                ))}
              </div>

              {/* プリセット並び替えボタン */}
              <div className="flex items-center justify-between gap-1 text-[9.5px]">
                <span className="text-muted-foreground font-bold">自動整列:</span>
                <div className="flex items-center gap-1">
                  {orderModalGroup === "player" && (
                    <button
                      type="button"
                      onClick={() => handlePresetSort("number")}
                      className="px-2 py-0.5 rounded-md bg-muted hover:bg-muted/80 text-foreground border border-border/70 font-bold"
                    >
                      背番号順
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handlePresetSort("name")}
                    className="px-2 py-0.5 rounded-md bg-muted hover:bg-muted/80 text-foreground border border-border/70 font-bold"
                  >
                    五十音順
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePresetSort("reset")}
                    className="px-2 py-0.5 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground border border-border/70"
                  >
                    初期順
                  </button>
                </div>
              </div>

              {/* 操作ガイド */}
              <div className="flex items-center gap-1.5 text-[9.5px] text-muted-foreground bg-muted/40 px-2.5 py-1.5 rounded-lg border border-border/50">
                <GripVertical className="w-3.5 h-3.5 shrink-0 text-muted-foreground/70" />
                <span>左側のハンドル（⋮⋮）をつかんでドラッグ＆ドロップで並び替えできます</span>
              </div>

              {/* メンバー並び順リスト (Drag & Drop対応) */}
              <div className="max-h-[45vh] overflow-y-auto pr-0.5 no-scrollbar">
                {(tempOrders[orderModalGroup] || []).length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    このグループに所属するメンバーはいません
                  </div>
                ) : (
                  <Reorder.Group
                    as="div"
                    axis="y"
                    values={tempOrders[orderModalGroup] || []}
                    onReorder={(newList) => {
                      setTempOrders((prev) => ({
                        ...prev,
                        [orderModalGroup]: newList,
                      }));
                    }}
                    className="space-y-1.5"
                  >
                    {(tempOrders[orderModalGroup] || []).map((person, index, arr) => (
                      <SortableMemberRow
                        key={person.id}
                        person={person}
                        index={index}
                        total={arr.length}
                        onMoveUp={() => handleMoveItem(index, -1)}
                        onMoveDown={() => handleMoveItem(index, 1)}
                      />
                    ))}
                  </Reorder.Group>
                )}
              </div>

              {/* フッター操作ボタン */}
              <div className="flex items-center justify-end gap-2 pt-1 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsOrderModalOpen(false)}
                  className="px-3 py-1.5 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted active:scale-95 transition-all"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={isSavingOrder}
                  onClick={handleSaveOrder}
                  className="px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-black hover:brightness-110 active:scale-95 transition-all flex items-center gap-1"
                >
                  {isSavingOrder ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>並び順を保存</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            🏷️ グループ別ステータス設定モーダル
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {isStatusConfigModalOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-card rounded-2xl border border-border shadow-2xl p-4 sm:p-5 space-y-4 max-h-[85vh] overflow-y-auto no-scrollbar">
              {/* ヘッダー */}
              <div className="flex items-start justify-between border-b border-border pb-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-7 h-7 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black shrink-0">
                    <SlidersHorizontal className="w-4 h-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-black text-foreground">出欠ステータス設定</h3>
                    <p className="text-[10px] text-muted-foreground">グループごとに表示する記号・名称をカスタマイズ</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsStatusConfigModalOpen(false)}
                  className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground active:scale-90"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* グループ切り替えタブ */}
              <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border border-border/60">
                {[
                  { key: "player" as const, label: "選手" },
                  { key: "mother" as const, label: "母" },
                  { key: "father" as const, label: "父" },
                  { key: "staff" as const, label: "スタッフ" },
                ].map(tab => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setStatusModalGroup(tab.key)}
                    className={`flex-1 py-1.5 text-center rounded-lg text-xs font-bold transition-all ${
                      statusModalGroup === tab.key
                        ? "bg-primary text-primary-foreground font-black shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* ステータス設定リスト */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground px-1">
                  <span>ステータス記号と名称</span>
                  <span>使用有無</span>
                </div>

                <div className="space-y-1.5">
                  {(tempStatusConfig[statusModalGroup] || []).map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between p-2 rounded-xl border transition-all ${
                        item.enabled
                          ? "bg-card border-border shadow-2xs"
                          : "bg-muted/30 border-border/50 opacity-60"
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
                        <span className={`w-6 h-6 rounded-lg ${item.bgClass} text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs`}>
                          {item.mark}
                        </span>
                        <input
                          type="text"
                          value={item.label}
                          disabled={!item.enabled}
                          onChange={(e) => handleChangeStatusLabel(item.id, e.target.value)}
                          placeholder="名称を入力..."
                          className="flex-1 min-w-0 px-2 py-1 text-xs font-bold rounded-lg bg-muted/50 border border-border/70 focus:outline-none focus:ring-1 focus:ring-primary text-foreground disabled:opacity-40"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleStatus(item.id)}
                        className={`px-2.5 py-1 rounded-lg text-[10.5px] font-black transition-all shrink-0 active:scale-95 border ${
                          item.enabled
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40"
                            : "bg-muted text-muted-foreground border-border/60 hover:text-foreground"
                        }`}
                      >
                        {item.enabled ? "使用中" : "非表示"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* フッター操作ボタン */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={handleResetStatusGroup}
                  className="px-2.5 py-1.5 rounded-xl border border-border text-[11px] font-bold text-muted-foreground hover:bg-muted active:scale-95 transition-all"
                >
                  初期値に戻す
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsStatusConfigModalOpen(false)}
                    className="px-3 py-1.5 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted active:scale-95 transition-all"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    disabled={isSavingStatusConfig}
                    onClick={handleSaveStatusConfig}
                    className="px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-black hover:brightness-110 active:scale-95 transition-all flex items-center gap-1"
                  >
                    {isSavingStatusConfig ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    <span>設定を保存</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            🏷️ メンバー班・サブラベル一括設定モーダル
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {isSubLabelsModalOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-card rounded-2xl border border-border shadow-2xl p-4 sm:p-5 space-y-3.5 max-h-[88vh] overflow-y-auto no-scrollbar">
              {/* ヘッダー */}
              <div className="flex items-start justify-between border-b border-border pb-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-7 h-7 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center justify-center font-black shrink-0 border border-amber-500/30">
                    <Tag className="w-4 h-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-black text-foreground">メンバー班・サブラベル設定</h3>
                    <p className="text-[10px] text-muted-foreground">出欠表の氏名の下に表示する班番号（1班等）や役割を設定</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSubLabelsModalOpen(false)}
                  className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground active:scale-90"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* グループ切り替えタブ */}
              <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border border-border/60">
                {[
                  { key: "player" as const, label: "選手", count: groups.players.length },
                  { key: "mother" as const, label: "母", count: groups.mothers.length },
                  { key: "father" as const, label: "父", count: groups.fathers.length },
                  { key: "staff" as const, label: "スタッフ", count: groups.staff.length },
                ].map(tab => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setSubLabelsModalGroup(tab.key)}
                    className={`flex-1 py-1 text-center rounded-lg text-[10.5px] font-bold transition-all ${
                      subLabelsModalGroup === tab.key
                        ? "bg-primary text-primary-foreground font-black shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab.label} ({tab.count})
                  </button>
                ))}
              </div>

              {/* クイック入力ガイド */}
              <div className="flex items-center justify-between text-[9.5px] text-muted-foreground px-1 bg-muted/30 py-1.5 rounded-lg border border-border/40">
                <span className="font-bold flex items-center gap-1">
                  <Info className="w-3 h-3 text-amber-500" />
                  各行の [1班]〜[4班] タップで簡単入力
                </span>
                <span>全角・半角どちらもOK</span>
              </div>

              {/* メンバー一覧リスト */}
              <div className="space-y-1.5 max-h-[46vh] overflow-y-auto pr-0.5 no-scrollbar">
                {((subLabelsModalGroup === "player"
                  ? groups.players
                  : subLabelsModalGroup === "mother"
                  ? groups.mothers
                  : subLabelsModalGroup === "father"
                  ? groups.fathers
                  : groups.staff) || []).length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    このグループに登録されているメンバーはいません
                  </div>
                ) : (
                  (subLabelsModalGroup === "player"
                    ? groups.players
                    : subLabelsModalGroup === "mother"
                    ? groups.mothers
                    : subLabelsModalGroup === "father"
                    ? groups.fathers
                    : groups.staff
                  ).map((person) => {
                    const currentVal = tempSubLabels[person.id] || "";
                    return (
                      <div
                        key={person.id}
                        className="flex items-center justify-between gap-1.5 p-2 rounded-xl border border-border/80 bg-card hover:border-amber-500/30 transition-all"
                      >
                        {/* メンバー表示（番号/区分 ＋ 氏名） */}
                        <div className="flex items-center gap-1.5 min-w-[75px] max-w-[95px] shrink-0">
                          {person.uniformNumber ? (
                            <span className="text-[9px] font-black text-primary px-1 py-0.2 rounded bg-primary/10 shrink-0">
                              #{person.uniformNumber}
                            </span>
                          ) : person.groupType === "mother" ? (
                            <span className="text-[9px] font-black text-rose-600 dark:text-rose-400 shrink-0">母</span>
                          ) : person.groupType === "father" ? (
                            <span className="text-[9px] font-black text-blue-600 dark:text-blue-400 shrink-0">父</span>
                          ) : person.groupType === "staff" ? (
                            <span className="text-[9px] font-black text-purple-600 dark:text-purple-400 shrink-0">指導</span>
                          ) : (
                            <span className="text-[9px] font-black text-amber-600 dark:text-amber-400 shrink-0">保護</span>
                          )}
                          <span className="text-xs font-black text-foreground truncate" title={person.name}>
                            {person.name}
                          </span>
                        </div>

                        {/* クイック選択チップ (1班, 2班, 3班, 4班) */}
                        <div className="flex items-center gap-1 shrink-0">
                          {["1班", "2班", "3班", "4班"].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => {
                                setTempSubLabels(prev => ({
                                  ...prev,
                                  [person.id]: prev[person.id] === preset ? "" : preset,
                                }));
                              }}
                              className={`px-1.5 py-0.5 rounded text-[9.5px] font-black transition-all active:scale-95 border ${
                                currentVal === preset
                                  ? "bg-amber-500 text-white border-amber-600 shadow-xs"
                                  : "bg-muted/60 hover:bg-muted text-muted-foreground border-border/70 hover:text-foreground"
                              }`}
                            >
                              {preset}
                            </button>
                          ))}
                        </div>

                        {/* 自由入力欄 ＆ クリア */}
                        <div className="relative flex-1 min-w-[60px] max-w-[90px]">
                          <input
                            type="text"
                            value={currentVal}
                            maxLength={8}
                            onChange={(e) => {
                              const val = e.target.value;
                              setTempSubLabels(prev => ({
                                ...prev,
                                [person.id]: val,
                              }));
                            }}
                            placeholder="自由入力"
                            className="w-full px-2 py-0.5 text-[10.5px] font-bold rounded-lg bg-muted/40 border border-border/70 focus:outline-none focus:ring-1 focus:ring-amber-500 text-foreground text-center"
                          />
                          {currentVal && (
                            <button
                              type="button"
                              onClick={() => {
                                setTempSubLabels(prev => {
                                  const next = { ...prev };
                                  delete next[person.id];
                                  return next;
                                });
                              }}
                              className="absolute -right-1 -top-1 w-3.5 h-3.5 rounded-full bg-muted-foreground/30 text-white flex items-center justify-center hover:bg-muted-foreground/60 transition-colors"
                              title="クリア"
                            >
                              <X className="w-2 h-2" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* フッター操作ボタン */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("選択中グループのラベルをすべてクリアしますか？")) {
                      const targetGroup = subLabelsModalGroup === "player"
                        ? groups.players
                        : subLabelsModalGroup === "mother"
                        ? groups.mothers
                        : subLabelsModalGroup === "father"
                        ? groups.fathers
                        : groups.staff;
                      setTempSubLabels(prev => {
                        const next = { ...prev };
                        targetGroup.forEach(p => delete next[p.id]);
                        return next;
                      });
                    }
                  }}
                  className="px-2.5 py-1.5 rounded-xl border border-border text-[10.5px] font-bold text-muted-foreground hover:bg-muted active:scale-95 transition-all"
                >
                  グループ一括クリア
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsSubLabelsModalOpen(false)}
                    className="px-3 py-1.5 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted active:scale-95 transition-all"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    disabled={isSavingSubLabels}
                    onClick={handleSaveSubLabels}
                    className="px-4 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-black hover:bg-amber-700 active:scale-95 transition-all flex items-center gap-1 shadow-xs"
                  >
                    {isSavingSubLabels ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    <span>設定を保存</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            🏷️ 単一メンバーのクイック表示ラベル設定ポップアップ
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {editingSingleSubLabel && (
          <div className="fixed inset-0 z-[75] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="w-full max-w-xs bg-card rounded-2xl border border-border shadow-2xl p-4 space-y-3">
              {/* ヘッダー */}
              <div className="flex items-start justify-between border-b border-border pb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center justify-center font-black shrink-0 border border-amber-500/30">
                    <Tag className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-xs font-black text-foreground truncate">
                      {editingSingleSubLabel.person.name}
                    </h3>
                    <p className="text-[9.5px] text-muted-foreground">名前の下に表示する班・役割</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingSingleSubLabel(null)}
                  className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* クイック選択候補 */}
              <div className="space-y-1">
                <span className="text-[9.5px] font-bold text-muted-foreground">候補をワンタップ選択:</span>
                <div className="flex flex-wrap gap-1">
                  {["1班", "2班", "3班", "4班", "配車", "審判", "主将", "副将"].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setEditingSingleSubLabel(prev => prev ? { ...prev, label: preset } : null)}
                      className={`px-2 py-0.5 rounded text-[10px] font-black transition-all active:scale-95 border ${
                        editingSingleSubLabel.label === preset
                          ? "bg-amber-500 text-white border-amber-600 shadow-xs"
                          : "bg-muted/70 hover:bg-muted text-foreground border-border/80"
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setEditingSingleSubLabel(prev => prev ? { ...prev, label: "" } : null)}
                    className="px-2 py-0.5 rounded text-[10px] font-bold bg-muted/40 hover:bg-muted text-muted-foreground border border-border/60"
                  >
                    クリア
                  </button>
                </div>
              </div>

              {/* 自由入力フォーム */}
              <div className="space-y-1 pt-1">
                <span className="text-[9.5px] font-bold text-muted-foreground">直接入力（最大8文字）:</span>
                <input
                  type="text"
                  maxLength={8}
                  value={editingSingleSubLabel.label}
                  onChange={(e) => setEditingSingleSubLabel(prev => prev ? { ...prev, label: e.target.value } : null)}
                  placeholder="例: 1班, 審判, 配車..."
                  autoFocus
                  className="w-full px-2.5 py-1 text-xs font-black rounded-lg bg-muted/50 border border-border focus:outline-none focus:ring-1 focus:ring-amber-500 text-foreground"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSaveSingleSubLabel(editingSingleSubLabel.label);
                    }
                  }}
                />
              </div>

              {/* フッター */}
              <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setEditingSingleSubLabel(null)}
                  className="px-3 py-1 rounded-lg border border-border text-[11px] font-bold text-muted-foreground hover:bg-muted transition-all"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={isSavingSingleSubLabel}
                  onClick={() => handleSaveSingleSubLabel(editingSingleSubLabel.label)}
                  className="px-3.5 py-1 rounded-lg bg-amber-600 text-white text-[11px] font-black hover:bg-amber-700 active:scale-95 transition-all flex items-center gap-1 shadow-xs"
                >
                  {isSavingSingleSubLabel ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  <span>保存</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
