// filepath: src/app/liff/related-teams/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import {
  LiffDataLoadErrorCard,
  useLiffAutoRetryOnResume,
} from "@/components/liff/LiffDataLoadErrorCard";
import {
  BulkAiDiscoverModal,
  CreateOrEditRelatedTeamModal,
  GroupBulkDeleteModal,
  PastOpponentsImportModal,
  type RelatedTeamFormPayload,
} from "@/components/liff/RelatedTeamsModals";
import { useLiff, useLiffPermissions } from "@/components/liff/LiffProvider";
import {
  invalidateLiffApiCache,
  peekLiffApiCache,
  warmupLiffEndpointForHref,
} from "@/lib/liff/api-cache";
import {
  getRelationShortLabel,
  type AiDiscoveredTeamCandidate,
  type RelatedTeamItem,
  type RelatedTeamLinkKind,
  type RelatedTeamRelationType,
  type UnregisteredOpponentItem,
} from "@/lib/liff/related-teams-schema";
import { sanitizeSafeExternalHref } from "@/lib/utils";
import {
  BookmarkCheck,
  Building2,
  ChevronRight,
  ExternalLink,
  FileText,
  Globe,
  Handshake,
  Loader2,
  MapPin,
  MessageCircle,
  Pencil,
  Play,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  Trophy,
  Users2,
  X,
} from "lucide-react";

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

interface RelatedTeamsApiResponse {
  success: boolean;
  teams?: RelatedTeamItem[];
  unregisteredOpponents?: UnregisteredOpponentItem[];
  context?: {
    orgName?: string;
    squadName?: string;
    categoryLabel?: string;
    areaHint?: string;
    leagueSuggestions?: string[];
  };
  error?: string;
}

const UNGROUPED_LEAGUE_KEY = "__ungrouped__";
const UNGROUPED_LEAGUE_LABEL = "所属連盟・グループ未設定";

function getBrandLinkButtonStyle(kind: RelatedTeamLinkKind): {
  buttonClass: string;
  icon: React.ReactNode;
} {
  switch (kind) {
    case "instagram":
      return {
        buttonClass: "bg-[#E1306C] hover:bg-[#C1275C] text-white",
        icon: <InstagramIcon className="w-3.5 h-3.5 shrink-0" />,
      };
    case "youtube":
      return {
        buttonClass: "bg-[#FF0000] hover:bg-[#D90000] text-white",
        icon: <Play className="w-3.5 h-3.5 fill-current shrink-0" />,
      };
    case "line":
      return {
        buttonClass: "bg-[#06C755] hover:bg-[#05b34c] text-white",
        icon: <MessageCircle className="w-3.5 h-3.5 shrink-0" />,
      };
    case "x":
      return {
        buttonClass: "bg-[#0f172a] hover:bg-slate-800 text-white",
        icon: <Globe className="w-3.5 h-3.5 shrink-0" />,
      };
    case "facebook":
      return {
        buttonClass: "bg-[#1877F2] hover:bg-[#166FE5] text-white",
        icon: <Globe className="w-3.5 h-3.5 shrink-0" />,
      };
    case "map":
      return {
        buttonClass: "bg-[#1A73E8] hover:bg-[#1557B0] text-white",
        icon: <MapPin className="w-3.5 h-3.5 shrink-0" />,
      };
    case "blog":
      return {
        buttonClass: "bg-slate-700 hover:bg-slate-800 text-white",
        icon: <FileText className="w-3.5 h-3.5 shrink-0" />,
      };
    case "official":
      return {
        buttonClass: "bg-primary hover:bg-primary/90 text-primary-foreground",
        icon: <Globe className="w-3.5 h-3.5 shrink-0" />,
      };
    default:
      return {
        buttonClass:
          "bg-card hover:bg-muted text-foreground border border-border",
        icon: <ExternalLink className="w-3.5 h-3.5 shrink-0 text-primary" />,
      };
  }
}

export default function LiffRelatedTeamsPage() {
  const { currentTeam } = useLiff();
  const { canMutate, isDemoMode } = useLiffPermissions();
  const effectiveCanEdit = canMutate || isDemoMode;

  const activeTeamId =
    currentTeam?.id ||
    (typeof window !== "undefined"
      ? localStorage.getItem("iscore_selectedTeamId") || "demo-team"
      : "demo-team");

  const initialCached = useMemo(() => {
    if (typeof window === "undefined") return null;
    return peekLiffApiCache<RelatedTeamsApiResponse>(
      `/api/liff/related-teams?teamId=${encodeURIComponent(activeTeamId)}`
    );
  }, [activeTeamId]);

  const [teams, setTeams] = useState<RelatedTeamItem[]>(
    () => initialCached?.teams ?? []
  );
  const [unregisteredOpponents, setUnregisteredOpponents] = useState<
    UnregisteredOpponentItem[]
  >(() => initialCached?.unregisteredOpponents ?? []);
  const [categoryLabel, setCategoryLabel] = useState<string>(
    () => initialCached?.context?.categoryLabel ?? ""
  );

  const [isLoading, setIsLoading] = useState<boolean>(
    () => !initialCached?.teams
  );
  const [loadError, setLoadError] = useState<boolean>(false);

  // フィルター＆検索ステート
  const [selectedScope, setSelectedScope] = useState<
    "all" | "organization" | "team" | "favorite"
  >("all");
  const [selectedLeague, setSelectedLeague] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // モーダル制御ステート
  const [isCreateEditOpen, setIsCreateEditOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<RelatedTeamItem | null>(null);
  const [isAiDiscoverOpen, setIsAiDiscoverOpen] = useState(false);
  const [isImportOpponentsOpen, setIsImportOpponentsOpen] = useState(false);
  const [bulkDeletingGroup, setBulkDeletingGroup] = useState<{
    key: string;
    title: string;
    items: RelatedTeamItem[];
  } | null>(null);

  const squadLabel = currentTeam?.teamName || "編成";

  const loadRelatedTeams = useCallback(async () => {
    const tid = currentTeam?.id || "demo-team";
    try {
      setIsLoading(true);
      setLoadError(false);
      const res = await fetch(
        `/api/liff/related-teams?teamId=${encodeURIComponent(tid)}`
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as RelatedTeamsApiResponse;
      if (!data.success) {
        throw new Error(data.error || "取得失敗");
      }
      setTeams(data.teams || []);
      setUnregisteredOpponents(data.unregisteredOpponents || []);
      setCategoryLabel(data.context?.categoryLabel || "");
    } catch (err) {
      console.error("[LiffRelatedTeamsPage] load error:", err);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [currentTeam?.id]);

  useEffect(() => {
    void loadRelatedTeams();
  }, [loadRelatedTeams]);

  useLiffAutoRetryOnResume(loadError, loadRelatedTeams);

  const refreshAfterMutation = useCallback(async () => {
    invalidateLiffApiCache("/api/liff/related-teams");
    await loadRelatedTeams();
  }, [loadRelatedTeams]);

  // 連盟・グループ候補リスト（登録済み関連チームの連盟・グループ名のみ）
  const mergedLeagueSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const t of teams) {
      if (t.leagueName.trim()) set.add(t.leagueName.trim());
    }
    return Array.from(set);
  }, [teams]);

  // フィルターチップ用の連盟別件数集計
  const leagueFilterTabs = useMemo(() => {
    const counts = new Map<string, number>();
    let ungroupedCount = 0;
    for (const t of teams) {
      if (selectedScope === "organization" && t.scope !== "organization") {
        continue;
      }
      if (selectedScope === "team" && t.scope !== "team") {
        continue;
      }
      if (selectedScope === "favorite" && !t.isFavorite) {
        continue;
      }
      const lg = t.leagueName.trim();
      if (lg) {
        counts.set(lg, (counts.get(lg) || 0) + 1);
      } else {
        ungroupedCount += 1;
      }
    }

    const tabs: Array<{ key: string; label: string; count: number }> = [];
    for (const [lg, count] of Array.from(counts.entries())) {
      tabs.push({ key: lg, label: lg, count });
    }
    tabs.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ja"));
    if (ungroupedCount > 0) {
      tabs.push({
        key: UNGROUPED_LEAGUE_KEY,
        label: "未分類",
        count: ungroupedCount,
      });
    }
    return tabs;
  }, [teams, selectedScope]);

  // 検索・スコープ・連盟によるフィルタリング
  const filteredTeams = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return teams.filter((t) => {
      if (selectedScope === "organization" && t.scope !== "organization") {
        return false;
      }
      if (selectedScope === "team" && t.scope !== "team") {
        return false;
      }
      if (selectedScope === "favorite" && !t.isFavorite) {
        return false;
      }

      if (selectedLeague !== "all") {
        const lg = t.leagueName.trim();
        if (selectedLeague === UNGROUPED_LEAGUE_KEY) {
          if (lg !== "") return false;
        } else if (lg !== selectedLeague) {
          return false;
        }
      }

      if (!q) return true;

      const haystack = [
        t.name,
        t.shortName,
        t.leagueName,
        t.area,
        t.homeGround,
        t.description,
        ...t.links.map((l) => l.label),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [teams, selectedScope, selectedLeague, searchQuery]);

  // 連盟・団体ごとのグループ化（一覧表示の視認性を最大化）
  const groupedSections = useMemo(() => {
    const map = new Map<string, RelatedTeamItem[]>();
    for (const t of filteredTeams) {
      const key = t.leagueName.trim() || UNGROUPED_LEAGUE_KEY;
      let arr = map.get(key);
      if (!arr) {
        arr = [];
        map.set(key, arr);
      }
      arr.push(t);
    }

    const entries = Array.from(map.entries()).map(([key, items]) => ({
      key,
      title: key === UNGROUPED_LEAGUE_KEY ? UNGROUPED_LEAGUE_LABEL : key,
      items,
    }));

    entries.sort((a, b) => {
      if (a.key === UNGROUPED_LEAGUE_KEY) return 1;
      if (b.key === UNGROUPED_LEAGUE_KEY) return -1;
      return b.items.length - a.items.length || a.title.localeCompare(b.title, "ja");
    });

    return entries;
  }, [filteredTeams]);

  // 新規・編集保存ハンドラ
  const handleSaveTeam = async (payload: RelatedTeamFormPayload) => {
    const tid = currentTeam?.id || "demo-team";

    if (editingTeam) {
      const res = await fetch(
        `/api/liff/related-teams/${encodeURIComponent(editingTeam.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId: tid,
            ...payload,
          }),
        }
      );
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.error || "関連チームの更新に失敗しました");
      }

      if (tid === "demo-team" || editingTeam.id.startsWith("demo-")) {
        setTeams((prev) =>
          prev.map((item) =>
            item.id === editingTeam.id
              ? {
                  ...item,
                  ...payload,
                  relationLabel: getRelationShortLabel(payload.relationType),
                  scopeLabel:
                    payload.scope === "organization" ? "チーム全体" : squadLabel,
                }
              : item
          )
        );
      } else {
        await refreshAfterMutation();
      }
      toast.success(`「${payload.name}」を更新しました`);
    } else {
      const res = await fetch("/api/liff/related-teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: tid,
          ...payload,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        id?: string;
        error?: string;
      };
      if (!res.ok || !data.success) {
        throw new Error(data.error || "関連チームの登録に失敗しました");
      }

      if (tid === "demo-team") {
        const demoItem: RelatedTeamItem = {
          id: data.id || `demo-rt-${Date.now()}`,
          name: payload.name,
          shortName: payload.shortName,
          leagueName: payload.leagueName,
          relationType: payload.relationType,
          relationLabel: getRelationShortLabel(payload.relationType),
          teamCategory: categoryLabel,
          area: payload.area,
          homeGround: payload.homeGround,
          websiteUrl: payload.websiteUrl,
          links: payload.links,
          description: payload.description,
          scope: payload.scope,
          scopeLabel:
            payload.scope === "organization" ? "チーム全体" : squadLabel,
          isFavorite: payload.isFavorite,
          priority: 0,
          matchStats: null,
        };
        setTeams((prev) => [demoItem, ...prev]);
      } else {
        await refreshAfterMutation();
      }
      toast.success(`「${payload.name}」を追加しました`);
    }
  };

  // 削除ハンドラ
  const handleDeleteTeam = async (target: RelatedTeamItem) => {
    const tid = currentTeam?.id || "demo-team";
    const res = await fetch(
      `/api/liff/related-teams/${encodeURIComponent(target.id)}?teamId=${encodeURIComponent(tid)}`,
      { method: "DELETE" }
    );
    const data = (await res.json()) as { success: boolean; error?: string };
    if (!res.ok || !data.success) {
      throw new Error(data.error || "削除に失敗しました");
    }

    if (tid === "demo-team" || target.id.startsWith("demo-")) {
      setTeams((prev) => prev.filter((item) => item.id !== target.id));
    } else {
      await refreshAfterMutation();
    }
    toast.success(`「${target.name}」を削除しました`);
  };

  // グループ単位（またはグループ内の選択チーム）一括削除ハンドラ
  const handleBulkDeleteTeams = async (selectedIds: string[]) => {
    const tid = currentTeam?.id || "demo-team";
    const res = await fetch("/api/liff/related-teams/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamId: tid,
        ids: selectedIds,
      }),
    });
    const data = (await res.json()) as {
      success: boolean;
      deletedCount?: number;
      error?: string;
    };
    if (!res.ok || !data.success) {
      throw new Error(data.error || "一括削除に失敗しました");
    }

    const idSet = new Set(selectedIds);
    if (
      bulkDeletingGroup &&
      selectedLeague === bulkDeletingGroup.key &&
      selectedIds.length >= bulkDeletingGroup.items.length
    ) {
      setSelectedLeague("all");
    }

    if (
      tid === "demo-team" ||
      selectedIds.every((id) => id.startsWith("demo-"))
    ) {
      setTeams((prev) => prev.filter((item) => !idSet.has(item.id)));
    } else {
      await refreshAfterMutation();
    }

    toast.success(
      `${data.deletedCount ?? selectedIds.length}チームを一括削除しました`
    );
  };

  // お気に入りピン留めの1タップ切替
  const handleToggleFavorite = async (target: RelatedTeamItem) => {
    if (!effectiveCanEdit) return;
    const tid = currentTeam?.id || "demo-team";
    const nextFav = !target.isFavorite;

    // 楽観的UI反映
    setTeams((prev) =>
      prev.map((item) =>
        item.id === target.id ? { ...item, isFavorite: nextFav } : item
      )
    );

    if (tid === "demo-team" || target.id.startsWith("demo-")) {
      return;
    }

    try {
      const res = await fetch(
        `/api/liff/related-teams/${encodeURIComponent(target.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId: tid,
            isFavorite: nextFav,
          }),
        }
      );
      if (!res.ok) {
        throw new Error("更新失敗");
      }
      invalidateLiffApiCache("/api/liff/related-teams");
    } catch {
      // ロールバック
      setTeams((prev) =>
        prev.map((item) =>
          item.id === target.id ? { ...item, isFavorite: target.isFavorite } : item
        )
      );
      toast.error("ピン留め状態の更新に失敗しました");
    }
  };

  // AI一括収集からの一括登録ハンドラ
  const handleBulkRegisterFromAi = async (params: {
    scope: "organization" | "team";
    defaultLeagueName: string;
    defaultRelationType: RelatedTeamRelationType;
    items: AiDiscoveredTeamCandidate[];
  }) => {
    const tid = currentTeam?.id || "demo-team";
    const res = await fetch("/api/liff/related-teams/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamId: tid,
        scope: params.scope,
        defaultLeagueName: params.defaultLeagueName,
        defaultRelationType: params.defaultRelationType,
        items: params.items.map((c) => ({
          name: c.name,
          shortName: c.shortName,
          leagueName: c.leagueName,
          relationType: c.relationType,
          area: c.area,
          homeGround: c.homeGround,
          websiteUrl: c.websiteUrl,
          links: c.links,
          description: c.description,
        })),
      }),
    });
    const data = (await res.json()) as {
      success: boolean;
      createdCount?: number;
      skippedCount?: number;
      error?: string;
    };
    if (!res.ok || !data.success) {
      throw new Error(data.error || "一括登録に失敗しました");
    }

    await refreshAfterMutation();
    toast.success(
      `${data.createdCount ?? params.items.length}チームを一括登録しました！`
    );
  };

  // 過去の試合記録からの一括取込ハンドラ
  const handleImportPastOpponents = async (params: {
    scope: "organization" | "team";
    leagueName: string;
    relationType: RelatedTeamRelationType;
    selectedNames: string[];
  }) => {
    const tid = currentTeam?.id || "demo-team";
    const res = await fetch("/api/liff/related-teams/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamId: tid,
        scope: params.scope,
        defaultLeagueName: params.leagueName,
        defaultRelationType: params.relationType,
        items: params.selectedNames.map((opponentName) => ({
          name: opponentName,
          leagueName: params.leagueName,
          relationType: params.relationType,
        })),
      }),
    });
    const data = (await res.json()) as {
      success: boolean;
      createdCount?: number;
      error?: string;
    };
    if (!res.ok || !data.success) {
      throw new Error(data.error || "対戦相手の取り込みに失敗しました");
    }

    if (tid === "demo-team") {
      const selectedSet = new Set(params.selectedNames);
      const importedItems: RelatedTeamItem[] = params.selectedNames.map(
        (opponentName, idx) => {
          const oppStat = unregisteredOpponents.find(
            (u) => u.opponentName === opponentName
          );
          return {
            id: `demo-rt-imp-${Date.now()}-${idx}`,
            name: opponentName,
            shortName: "",
            leagueName: params.leagueName,
            relationType: params.relationType,
            relationLabel: getRelationShortLabel(params.relationType),
            teamCategory: categoryLabel,
            area: "",
            homeGround: "",
            websiteUrl: "",
            links: [],
            description: "",
            scope: params.scope,
            scopeLabel:
              params.scope === "organization" ? "チーム全体" : squadLabel,
            isFavorite: false,
            priority: 0,
            matchStats: oppStat
              ? {
                  totalFinished: oppStat.totalFinished,
                  wins: oppStat.wins,
                  losses: oppStat.losses,
                  draws: oppStat.draws,
                  scheduledCount: oppStat.scheduledCount,
                  lastMatchDate: oppStat.lastMatchDate,
                  lastScoreSummary: null,
                }
              : null,
          };
        }
      );
      setTeams((prev) => [...importedItems, ...prev]);
      setUnregisteredOpponents((prev) =>
        prev.filter((u) => !selectedSet.has(u.opponentName))
      );
    } else {
      await refreshAfterMutation();
    }

    toast.success(
      `${data.createdCount ?? params.selectedNames.length}チームを関連チームに取り込みました！`
    );
  };

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="p-4 space-y-4">
        <LiffPageHeader
          title="関連チーム"
          subtitle="所属連盟・対戦チームの公式HP・SNS・通算戦績"
          icon={
            <span className="w-8 h-8 rounded-xl bg-primary/12 text-primary flex items-center justify-center font-black">
              <Handshake className="w-4 h-4" />
            </span>
          }
          showBack
          shareData={{
            title: `【関連チーム一覧】${currentTeam?.name || "チーム"} 公式ポータル`,
            text: "所属連盟の加盟チームや対戦相手の公式サイト・SNS・通算対戦成績を確認できます",
          }}
        />

        {/* スコープ＆注目フィルタータブ */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 -mx-4 px-4 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedScope("all")}
            className={`px-3.5 py-1.5 rounded-xl text-xs shrink-0 transition-all cursor-pointer ${
              selectedScope === "all"
                ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                : "bg-card text-muted-foreground border border-border hover:text-foreground hover:bg-muted/50 font-bold"
            }`}
          >
            すべて ({teams.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedScope("favorite")}
            className={`px-3 py-1.5 rounded-xl text-xs shrink-0 transition-all flex items-center gap-1 cursor-pointer ${
              selectedScope === "favorite"
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40 font-black shadow-2xs"
                : "bg-card text-muted-foreground border border-border hover:text-foreground hover:bg-muted/50 font-bold"
            }`}
          >
            <Star
              className={`w-3.5 h-3.5 ${
                selectedScope === "favorite"
                  ? "fill-amber-500 text-amber-500"
                  : ""
              }`}
            />
            <span>注目</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedScope("organization")}
            className={`px-3.5 py-1.5 rounded-xl text-xs shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
              selectedScope === "organization"
                ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                : "bg-card text-muted-foreground border border-border hover:text-foreground hover:bg-muted/50 font-bold"
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>チーム全体</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedScope("team")}
            className={`px-3.5 py-1.5 rounded-xl text-xs shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
              selectedScope === "team"
                ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                : "bg-card text-muted-foreground border border-border hover:text-foreground hover:bg-muted/50 font-bold"
            }`}
          >
            <Users2 className="w-3.5 h-3.5" />
            <span>{squadLabel}</span>
          </button>
        </div>

        {/* 検索バー ＆ AI収集・追加アクションボタン */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="チーム名・連盟・地域・拠点で検索..."
              className="w-full pl-9.5 pr-8 py-2.5 rounded-2xl bg-card border border-border text-xs placeholder:text-muted-foreground/70 focus:outline-hidden focus:ring-2 focus:ring-primary/40 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                aria-label="検索条件をクリア"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {effectiveCanEdit && (
            <>
              <button
                type="button"
                onClick={() => setIsAiDiscoverOpen(true)}
                className="h-10 px-3 rounded-2xl bg-[#0f172a] text-amber-300 border border-slate-700 font-black text-xs shadow-xs hover:bg-slate-800 active:scale-95 transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                title="AIで所属連盟・大会からチームを一括収集"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI収集</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingTeam(null);
                  setIsCreateEditOpen(true);
                }}
                className="h-10 px-3.5 rounded-2xl bg-primary text-primary-foreground font-black text-xs shadow-xs hover:bg-primary/90 active:scale-95 transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                title="関連チームを手動追加"
              >
                <Plus className="w-4 h-4" />
                <span>追加</span>
              </button>
            </>
          )}
        </div>

        {/* 試合記録にある未登録の対戦相手サジェストバナー */}
        {effectiveCanEdit && unregisteredOpponents.length > 0 && (
          <div className="p-3 rounded-2xl border border-primary/30 bg-primary/5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <Trophy className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-black text-foreground truncate">
                  未登録の対戦相手が {unregisteredOpponents.length} チームあります
                </p>
                <p className="text-[10px] font-bold text-muted-foreground truncate">
                  過去の試合スコア記録からワンタップで関連チームへ登録できます
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsImportOpponentsOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-[11px] font-black shrink-0 hover:bg-primary/90 active:scale-95 transition-all cursor-pointer"
            >
              一括取込
            </button>
          </div>
        )}

        {/* 所属連盟・グループ別フィルターチップ */}
        {leagueFilterTabs.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedLeague("all")}
              className={`px-3 py-1.5 rounded-xl text-xs shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
                selectedLeague === "all"
                  ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                  : "bg-card text-muted-foreground border border-border hover:text-foreground hover:bg-muted/50 font-bold"
              }`}
            >
              <BookmarkCheck className="w-3.5 h-3.5" />
              <span>全グループ</span>
            </button>
            {leagueFilterTabs.map((tab) => {
              const isSelected = selectedLeague === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setSelectedLeague(tab.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                      : "bg-card text-muted-foreground border border-border hover:text-foreground hover:bg-muted/50 font-bold"
                  }`}
                >
                  <span className="truncate max-w-[180px]">{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                      isSelected
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* コンテンツ領域 */}
        {isLoading && teams.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-12 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs font-bold">関連チームを読み込み中...</span>
          </div>
        ) : loadError && teams.length === 0 ? (
          <LiffDataLoadErrorCard
            onRetry={loadRelatedTeams}
            isRetrying={isLoading}
          />
        ) : filteredTeams.length === 0 ? (
          <div className="p-8 rounded-2xl border border-border bg-card text-center space-y-3">
            <span className="w-12 h-12 rounded-2xl bg-primary/12 text-primary flex items-center justify-center mx-auto">
              <Handshake className="w-6 h-6" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-black text-foreground">
                {teams.length === 0
                  ? "関連チームがまだ登録されていません"
                  : "条件に一致する関連チームが見つかりませんでした"}
              </p>
              <p className="text-xs text-muted-foreground">
                {teams.length === 0
                  ? "所属連盟名からAIで加盟チームを一括収集するか、対戦相手を追加して公式HP・SNSをまとめましょう。"
                  : "検索ワードや連盟フィルターを変更して再度ご確認ください。"}
              </p>
            </div>

            {effectiveCanEdit && teams.length === 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAiDiscoverOpen(true)}
                  className="px-4 py-2.5 rounded-xl bg-[#0f172a] text-amber-300 border border-slate-700 text-xs font-black flex items-center gap-1.5 hover:bg-slate-800 active:scale-95 transition-all cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>AIで連盟チームを一括収集</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingTeam(null);
                    setIsCreateEditOpen(true);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black flex items-center gap-1.5 hover:bg-primary/90 active:scale-95 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>手動でチームを追加</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {groupedSections.map((section) => (
              <section
                key={section.key}
                className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden"
              >
                {/* A-3 Dark Solid Header Cap per League / Organization */}
                <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-7 h-7 rounded-xl bg-primary/20 text-sky-300 border border-sky-400/30 flex items-center justify-center shrink-0">
                      <Handshake className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-xs sm:text-sm font-black text-white truncate">
                        {section.title}
                      </h2>
                      <p className="text-[10px] font-bold text-slate-300 truncate">
                        加盟・関連チーム一覧（公式HP・SNS・対戦成績）
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 text-[11px] font-black">
                      {section.items.length}チーム
                    </span>
                    {effectiveCanEdit && (
                      <button
                        type="button"
                        onClick={() =>
                          setBulkDeletingGroup({
                            key: section.key,
                            title: section.title,
                            items: section.items,
                          })
                        }
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-950 text-rose-300 border border-rose-500/40 text-[11px] font-black flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                        title={`「${section.title}」のチームを一括削除`}
                      >
                        <Trash2 className="w-3 h-3 shrink-0" />
                        <span>一括削除</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-3.5 sm:p-4 space-y-3">
                  {section.items.map((team) => {
                    const safeWebsiteHref = sanitizeSafeExternalHref(
                      team.websiteUrl
                    );
                    const validSubLinks = team.links.filter((lk) =>
                      Boolean(sanitizeSafeExternalHref(lk.url))
                    );
                    const hasAnyLink =
                      Boolean(safeWebsiteHref) || validSubLinks.length > 0;
                    const stats = team.matchStats;

                    return (
                      <article
                        key={team.id}
                        className={`rounded-2xl border border-border bg-card shadow-2xs hover:border-primary/40 transition-all p-3.5 sm:p-4 space-y-3 ${
                          team.isFavorite
                            ? "border-l-4 border-l-amber-500"
                            : ""
                        }`}
                      >
                        {/* 上段: チーム名・バッジ・ピン留め・編集ボタン */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-black">
                                {team.relationLabel}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border text-[10px] font-bold">
                                {team.scopeLabel}
                              </span>
                              {team.shortName && (
                                <span className="px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground text-[10px] font-bold">
                                  略称: {team.shortName}
                                </span>
                              )}
                            </div>

                            <h3 className="text-sm sm:text-base font-black text-foreground leading-snug">
                              {team.name}
                            </h3>

                            {(team.area || team.homeGround) && (
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-muted-foreground pt-0.5">
                                {team.area && (
                                  <span className="inline-flex items-center gap-1">
                                    <MapPin className="w-3 h-3 text-teal-600 dark:text-teal-400 shrink-0" />
                                    <span>{team.area}</span>
                                  </span>
                                )}
                                {team.homeGround && (
                                  <span className="inline-flex items-center gap-1">
                                    <Building2 className="w-3 h-3 text-muted-foreground shrink-0" />
                                    <span>拠点: {team.homeGround}</span>
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {effectiveCanEdit && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => void handleToggleFavorite(team)}
                                className="p-2 rounded-xl border border-border bg-card hover:bg-muted transition-colors cursor-pointer"
                                aria-label="注目ピン留め切替"
                                title="注目チームとして上部ピン留め"
                              >
                                <Star
                                  className={`w-4 h-4 ${
                                    team.isFavorite
                                      ? "text-amber-500 fill-amber-500"
                                      : "text-muted-foreground"
                                  }`}
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingTeam(team);
                                  setIsCreateEditOpen(true);
                                }}
                                className="p-2 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                                aria-label={`${team.name}を編集`}
                                title="編集・リンク追加"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* 中段1: 試合記録との自動連携・通算対戦成績バー */}
                        {stats &&
                          (stats.totalFinished > 0 ||
                            stats.scheduledCount > 0) && (
                            <div className="rounded-xl bg-muted/45 border border-border px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                                <span className="inline-flex items-center gap-1 font-black text-foreground">
                                  <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                  {stats.totalFinished > 0 ? (
                                    <span>
                                      通算 {stats.totalFinished}戦 {stats.wins}勝
                                      {stats.losses}敗
                                      {stats.draws > 0 ? `${stats.draws}分` : ""}
                                    </span>
                                  ) : (
                                    <span>対戦予定あり</span>
                                  )}
                                </span>
                                {stats.lastMatchDate && (
                                  <span className="text-[11px] font-bold text-muted-foreground">
                                    直近 {stats.lastMatchDate}
                                    {stats.lastScoreSummary
                                      ? ` (${stats.lastScoreSummary})`
                                      : ""}
                                  </span>
                                )}
                                {stats.scheduledCount > 0 &&
                                  stats.totalFinished > 0 && (
                                    <span className="px-1.5 py-0.5 rounded-md bg-primary/12 text-primary text-[10px] font-black">
                                      予定+{stats.scheduledCount}
                                    </span>
                                  )}
                              </div>

                              <Link
                                href="/liff/matches"
                                onPointerDown={() =>
                                  warmupLiffEndpointForHref(
                                    "/liff/matches",
                                    currentTeam?.id
                                  )
                                }
                                className="inline-flex items-center gap-0.5 text-[11px] font-black text-primary hover:underline shrink-0"
                              >
                                <span>試合記録</span>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </Link>
                            </div>
                          )}

                        {/* 中段2: チーム紹介・メモ */}
                        {team.description && (
                          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                            {team.description}
                          </p>
                        )}

                        {/* 下段: 公式サイト ＆ SNSブランドリンクボタン群 */}
                        {hasAnyLink ? (
                          <div className="flex flex-wrap items-center gap-2 pt-0.5">
                            {safeWebsiteHref && (
                              <a
                                href={safeWebsiteHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black shadow-2xs active:scale-95 transition-all"
                              >
                                <Globe className="w-3.5 h-3.5 shrink-0" />
                                <span>公式サイト</span>
                                <ExternalLink className="w-3 h-3 opacity-80 shrink-0" />
                              </a>
                            )}

                            {validSubLinks.map((lk) => {
                              const href = sanitizeSafeExternalHref(lk.url);
                              if (!href) return null;
                              const style = getBrandLinkButtonStyle(lk.kind);
                              return (
                                <a
                                  key={lk.id}
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black shadow-2xs active:scale-95 transition-all ${style.buttonClass}`}
                                >
                                  {style.icon}
                                  <span className="truncate max-w-[160px]">
                                    {lk.label}
                                  </span>
                                  <ExternalLink className="w-3 h-3 opacity-80 shrink-0" />
                                </a>
                              );
                            })}
                          </div>
                        ) : (
                          effectiveCanEdit && (
                            <div className="pt-0.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingTeam(team);
                                  setIsCreateEditOpen(true);
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-border bg-muted/20 hover:border-primary/40 hover:text-primary text-[11px] font-bold text-muted-foreground transition-colors cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>公式HP・SNSリンクを登録（AI検索対応）</span>
                              </button>
                            </div>
                          )
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        <div
          className="h-8 w-full shrink-0 pointer-events-none select-none"
          aria-hidden="true"
        />
      </div>

      {/* 個別チーム追加・編集モーダル */}
      <CreateOrEditRelatedTeamModal
        isOpen={isCreateEditOpen}
        editingTeam={editingTeam}
        teamId={activeTeamId}
        squadName={squadLabel}
        isDemoMode={isDemoMode}
        defaultCategoryHint={categoryLabel}
        leagueSuggestions={mergedLeagueSuggestions}
        onClose={() => {
          setIsCreateEditOpen(false);
          setEditingTeam(null);
        }}
        onSave={handleSaveTeam}
        onDelete={handleDeleteTeam}
      />

      {/* AI一括チーム収集モーダル */}
      <BulkAiDiscoverModal
        isOpen={isAiDiscoverOpen}
        teamId={activeTeamId}
        squadName={squadLabel}
        isDemoMode={isDemoMode}
        defaultCategoryHint={categoryLabel}
        onClose={() => setIsAiDiscoverOpen(false)}
        onBulkRegister={handleBulkRegisterFromAi}
      />

      {/* 過去の試合相手一括取込モーダル */}
      <PastOpponentsImportModal
        isOpen={isImportOpponentsOpen}
        opponents={unregisteredOpponents}
        squadName={squadLabel}
        leagueSuggestions={mergedLeagueSuggestions}
        onClose={() => setIsImportOpponentsOpen(false)}
        onImport={handleImportPastOpponents}
      />

      {/* グループ単位一括削除モーダル */}
      <GroupBulkDeleteModal
        isOpen={Boolean(bulkDeletingGroup)}
        groupTitle={bulkDeletingGroup?.title || ""}
        teamsInGroup={bulkDeletingGroup?.items || []}
        onClose={() => setBulkDeletingGroup(null)}
        onConfirmDelete={handleBulkDeleteTeams}
      />
    </div>
  );
}
