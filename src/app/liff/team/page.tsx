// filepath: src/app/liff/team/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { SiInstagram, SiLine, SiYoutube } from "react-icons/si";
import {
  Award,
  BarChart3,
  Building2,
  CalendarClock,
  ChevronRight,
  CornerDownRight,
  Crown,
  ExternalLink,
  Globe,
  IdCard,
  ImagePlus,
  Link2,
  MapPin,
  Pencil,
  Plus,
  Shield,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { LiffDataLoadErrorCard } from "@/components/liff/LiffDataLoadErrorCard";
import {
  canManageCurrentTeam,
  canManagePlayersCurrentTeam,
  useLiff,
} from "@/components/liff/LiffProvider";
import type { TeamInfoEditTab } from "@/components/liff/TeamInfoEditModal";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  fetchLiffJsonSWR,
  invalidateLiffApiCache,
  LIFF_CACHE_INVALIDATED_EVENT,
  peekLiffApiCache,
  warmupLiffEndpointForHref,
} from "@/lib/liff/api-cache";
import { LIFF_WEBVIEW_RESUMED_EVENT } from "@/lib/liff/runtime-recovery";
import {
  resolveTeamCategoryOption,
  type TeamGroundSummaryItem,
  type TeamInfoResponse,
  type TeamInfoUpdateRequest,
  type TeamLinkSummaryItem,
} from "@/lib/liff/team-profile-schema";
import { cn, sanitizeSafeExternalHref } from "@/lib/utils";

const TeamCoverPhotoModal = dynamic(
  () =>
    import("@/components/liff/TeamCoverPhotoModal").then(
      (m) => m.TeamCoverPhotoModal
    ),
  { ssr: false }
);

const TeamInfoEditModal = dynamic(
  () =>
    import("@/components/liff/TeamInfoEditModal").then(
      (m) => m.TeamInfoEditModal
    ),
  { ssr: false }
);

function buildTeamInfoEndpoint(teamId: string): string {
  return `/api/liff/team-info?teamId=${encodeURIComponent(teamId)}`;
}

function resolveSurfaceLabel(raw: string | null): string | null {
  if (!raw) return null;
  if (raw === "dirt") return "土グラウンド";
  if (raw === "turf") return "人工芝";
  if (raw === "grass") return "天然芝";
  return raw;
}

function resolveGroundMapHref(ground: TeamGroundSummaryItem): string | null {
  if (ground.mapUrl && ground.mapUrl.trim()) {
    return ground.mapUrl.trim();
  }
  const query = (ground.address || ground.name || "").trim();
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    query
  )}`;
}

function renderOfficialLinkBadge(link: TeamLinkSummaryItem) {
  const lowerUrl = link.url.toLowerCase();
  const lowerTitle = link.title.toLowerCase();
  if (lowerUrl.includes("instagram.com") || lowerTitle.includes("instagram") || lowerTitle.includes("インスタ")) {
    return (
      <span className="w-8 h-8 rounded-xl bg-[#E1306C] text-white flex items-center justify-center shrink-0">
        <SiInstagram className="w-4 h-4" />
      </span>
    );
  }
  if (
    lowerUrl.includes("youtube.com") ||
    lowerUrl.includes("youtu.be") ||
    lowerTitle.includes("youtube")
  ) {
    return (
      <span className="w-8 h-8 rounded-xl bg-[#FF0000] text-white flex items-center justify-center shrink-0">
        <SiYoutube className="w-4 h-4" />
      </span>
    );
  }
  if (lowerUrl.includes("line.me") || lowerTitle.includes("line")) {
    return (
      <span className="w-8 h-8 rounded-xl bg-[#06C755] text-white flex items-center justify-center shrink-0">
        <SiLine className="w-4 h-4" />
      </span>
    );
  }
  if (lowerUrl.includes("google.com/maps") || lowerUrl.includes("maps.app.goo.gl")) {
    return (
      <span className="w-8 h-8 rounded-xl bg-[#1A73E8] text-white flex items-center justify-center shrink-0">
        <MapPin className="w-4 h-4" />
      </span>
    );
  }
  return (
    <span className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center justify-center shrink-0">
      <Globe className="w-4 h-4" />
    </span>
  );
}

export default function LiffTeamInfoPage() {
  const {
    currentTeam,
    isLoadingTeam,
    isDemo: providerDemo,
    profile,
    updateCurrentTeamCover,
    refreshTeams,
  } = useLiff();

  const activeTeamId = useMemo(() => {
    if (currentTeam?.id) return currentTeam.id;
    if (typeof window !== "undefined") {
      return localStorage.getItem("iscore_selectedTeamId") || "demo-team";
    }
    return "demo-team";
  }, [currentTeam?.id]);

  const endpointUrl = useMemo(
    () => buildTeamInfoEndpoint(activeTeamId),
    [activeTeamId]
  );

  const initialCached = useMemo(() => {
    if (typeof window === "undefined") return null;
    return peekLiffApiCache<TeamInfoResponse>(endpointUrl);
  }, [endpointUrl]);

  const [data, setData] = useState<TeamInfoResponse | null>(initialCached);
  const [isLoading, setIsLoading] = useState<boolean>(!initialCached);
  const [loadError, setLoadError] = useState<boolean>(false);

  const [isCoverModalOpen, setIsCoverModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editInitialTab, setEditInitialTab] =
    useState<TeamInfoEditTab>("overview");

  const hasDataRef = useRef<boolean>(Boolean(initialCached));
  useEffect(() => {
    hasDataRef.current = Boolean(data);
  }, [data]);

  const loadTeamInfo = useCallback(
    async (forceRefresh = false) => {
      if (isLoadingTeam && !currentTeam?.id) return;

      const cached = !forceRefresh
        ? peekLiffApiCache<TeamInfoResponse>(endpointUrl)
        : null;
      if (cached && cached.success) {
        setData(cached);
        setLoadError(false);
        setIsLoading(false);
      } else if (!hasDataRef.current) {
        setIsLoading(true);
      }

      try {
        const fresh = await fetchLiffJsonSWR<TeamInfoResponse>(endpointUrl, {
          forceRefresh,
          onRevalidate: (revalidated) => {
            if (revalidated && revalidated.success) {
              setData(revalidated);
              setLoadError(false);
            }
          },
        });
        if (!fresh || !fresh.success) {
          throw new Error(fresh?.error || "取得失敗");
        }
        setData(fresh);
        setLoadError(false);
      } catch (err) {
        console.error("[LiffTeamInfoPage] load error:", err);
        if (!hasDataRef.current) {
          setLoadError(true);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [currentTeam?.id, endpointUrl, isLoadingTeam]
  );

  useEffect(() => {
    const nextCached = peekLiffApiCache<TeamInfoResponse>(endpointUrl);
    if (nextCached && nextCached.success) {
      setData(nextCached);
      setLoadError(false);
      setIsLoading(false);
    } else {
      setData(null);
      hasDataRef.current = false;
      setIsLoading(true);
    }
    void loadTeamInfo(false);
  }, [endpointUrl, loadTeamInfo]);

  useEffect(() => {
    const handleResumeOrOnline = () => {
      if (loadError || !hasDataRef.current) {
        void loadTeamInfo(true);
      }
    };
    const handleCacheInvalidated = () => {
      void loadTeamInfo(true);
    };
    window.addEventListener(LIFF_WEBVIEW_RESUMED_EVENT, handleResumeOrOnline);
    window.addEventListener("online", handleResumeOrOnline);
    window.addEventListener(
      LIFF_CACHE_INVALIDATED_EVENT,
      handleCacheInvalidated
    );
    return () => {
      window.removeEventListener(
        LIFF_WEBVIEW_RESUMED_EVENT,
        handleResumeOrOnline
      );
      window.removeEventListener("online", handleResumeOrOnline);
      window.removeEventListener(
        LIFF_CACHE_INVALIDATED_EVENT,
        handleCacheInvalidated
      );
    };
  }, [loadError, loadTeamInfo]);

  const openEditModal = useCallback((tab: TeamInfoEditTab) => {
    setEditInitialTab(tab);
    setIsEditModalOpen(true);
  }, []);

  const isDemoMode = Boolean(
    providerDemo || data?.isDemo || activeTeamId === "demo-team"
  );
  const canEdit = Boolean(
    data?.canEdit ?? canManagePlayersCurrentTeam(currentTeam, isDemoMode)
  );
  const canManage = Boolean(
    data?.canManage ?? canManageCurrentTeam(currentTeam, isDemoMode)
  );

  const effectiveLogoUrl =
    data?.organization.logoImageUrl || currentTeam?.logoImageUrl || null;
  const effectiveCoverUrl =
    data?.organization.coverImageUrl ?? currentTeam?.coverImageUrl ?? null;

  const orgHeadline =
    data?.organization.name ||
    currentTeam?.orgName ||
    currentTeam?.name ||
    "チーム";
  const squadSubname =
    data?.currentSquad.name || currentTeam?.teamName || "";
  const teamInitials = orgHeadline.slice(0, 2).toUpperCase();

  const categoryOption = useMemo(
    () => resolveTeamCategoryOption(data?.organization.category),
    [data?.organization.category]
  );

  const foundedHistoryLabel = useMemo(() => {
    const fy = data?.organization.foundedYear;
    if (!fy) return null;
    const currentYr = new Date().getFullYear();
    const diff = currentYr - fy + 1;
    if (diff > 0 && diff <= 150) {
      return `${fy}年創設（${diff}年目）`;
    }
    return `${fy}年創設`;
  }, [data?.organization.foundedYear]);

  const sharePayload = useMemo(
    () => ({
      title: `${orgHeadline}｜チーム情報`,
      text: `${orgHeadline}のチーム情報（概要・体制・活動拠点・主な戦績）`,
    }),
    [orgHeadline]
  );

  const effectiveUserId =
    profile?.userId ||
    (typeof window !== "undefined"
      ? localStorage.getItem("iscore_user_id") || ""
      : "");
  const effectiveUserName =
    profile?.displayName ||
    (typeof window !== "undefined"
      ? localStorage.getItem("iscore_user_name") || ""
      : "");

  const handleSavedFromModal = useCallback(
    (updatedDraft: TeamInfoUpdateRequest) => {
      setIsEditModalOpen(false);

      // 画面へ即時反映（体験デモ時もそのままプレビュー可能）
      setData((prev) => {
        if (!prev) return prev;
        const matchedCap = updatedDraft.captainId
          ? prev.playerOptions.find((p) => p.id === updatedDraft.captainId) ||
            null
          : null;
        return {
          ...prev,
          organization: {
            ...prev.organization,
            name: updatedDraft.orgName,
            shortName: updatedDraft.orgShortName,
            category: updatedDraft.category,
            foundedYear: updatedDraft.foundedYear,
            description: updatedDraft.description,
            profile: updatedDraft.profile,
          },
          currentSquad: {
            ...prev.currentSquad,
            managerName: updatedDraft.managerName,
            captainId: updatedDraft.captainId,
            captainName: matchedCap ? matchedCap.name : null,
            captainUniformNumber: matchedCap
              ? matchedCap.uniformNumber || null
              : null,
            homeGround: updatedDraft.homeGround,
          },
        };
      });

      if (!isDemoMode) {
        invalidateLiffApiCache();
        void loadTeamInfo(true);
        void refreshTeams();
      }
    },
    [isDemoMode, loadTeamInfo, refreshTeams]
  );

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader shareData={sharePayload} />

      <div className="p-4 space-y-4 max-w-lg mx-auto w-full">
        <LiffPageHeader
          title="チーム情報"
          subtitle="クラブ概要・指導体制・拠点・戦績"
          icon={
            <span className="w-8 h-8 rounded-xl bg-primary/12 text-primary flex items-center justify-center font-black">
              <Shield className="w-4 h-4" />
            </span>
          }
          showBack
          rightElement={
            canEdit && data ? (
              <button
                type="button"
                onClick={() => openEditModal("overview")}
                className="px-2.5 py-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-[11px] font-black flex items-center gap-1 active:scale-95 transition-all shadow-2xs cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>情報編集</span>
              </button>
            ) : (
              <Link
                href="/liff/players"
                onPointerDown={() =>
                  warmupLiffEndpointForHref("/liff/players", activeTeamId)
                }
                className="px-2.5 py-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-[11px] font-black flex items-center gap-1 active:scale-95 transition-all shadow-2xs"
              >
                <IdCard className="w-3.5 h-3.5" />
                <span>選手名鑑</span>
              </Link>
            )
          }
          shareData={sharePayload}
        />

        {isLoading && !data ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
              <div className="h-36 bg-slate-800 animate-pulse" />
              <div className="p-4 space-y-3">
                <div className="h-5 w-48 rounded bg-muted animate-pulse" />
                <div className="h-3.5 w-full rounded bg-muted animate-pulse" />
                <div className="h-3.5 w-2/3 rounded bg-muted animate-pulse" />
              </div>
            </div>
            <div className="h-40 rounded-2xl border border-border bg-card animate-pulse" />
            <div className="h-44 rounded-2xl border border-border bg-card animate-pulse" />
          </div>
        ) : loadError && !data ? (
          <LiffDataLoadErrorCard
            title="チーム情報を読み込めませんでした"
            description="通信環境をご確認のうえ、もう一度お試しください。"
            onRetry={() => void loadTeamInfo(true)}
          />
        ) : data ? (
          <>
            {/* ━━━ 🏟️ ヒーローヘッダー（選手名鑑・チーム成績と完全統一：境界オーバーラップ丸ロゴ × 背景カバー写真） ━━━ */}
            <section className="relative overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-xs">
              <div className="relative h-36 sm:h-40 w-full p-3.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary overflow-hidden">
                {effectiveCoverUrl ? (
                  <>
                    <img
                      src={effectiveCoverUrl}
                      alt=""
                      decoding="async"
                      className="pointer-events-none select-none absolute inset-0 w-full h-full object-cover object-center"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 bg-slate-950/20"
                    />
                  </>
                ) : (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 160 160"
                    className="pointer-events-none absolute -right-6 -top-6 w-40 h-40 text-slate-800"
                    fill="none"
                  >
                    <rect
                      x="80"
                      y="14"
                      width="92"
                      height="92"
                      rx="10"
                      transform="rotate(45 80 14)"
                      stroke="currentColor"
                      strokeWidth="8"
                    />
                    <circle
                      cx="80"
                      cy="80"
                      r="16"
                      stroke="currentColor"
                      strokeWidth="6"
                    />
                  </svg>
                )}

                <div className="relative z-10 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-2 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-black tracking-wider shadow-2xs">
                      {data.currentSquad.year}年度
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#0f172a]/90 text-slate-100 border border-slate-700 text-[10px] font-black shadow-2xs">
                      {categoryOption.shortLabel}
                    </span>
                    {data.organization.foundedYear && (
                      <span className="px-2 py-0.5 rounded bg-[#0f172a]/90 text-amber-300 border border-slate-700 text-[10px] font-black shadow-2xs">
                        Since {data.organization.foundedYear}
                      </span>
                    )}
                    {isDemoMode && (
                      <span className="px-2 py-0.5 rounded bg-[#0f172a] text-slate-200 border border-slate-700 text-[10px] font-black shadow-2xs">
                        DEMO
                      </span>
                    )}
                  </div>

                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setIsCoverModalOpen(true)}
                      className="px-2.5 py-1 rounded-xl bg-[#0f172a] hover:bg-slate-800 text-slate-100 border border-slate-700 text-[10.5px] font-black flex items-center gap-1 shadow-2xs active:scale-95 transition-all cursor-pointer shrink-0"
                    >
                      <ImagePlus className="w-3 h-3 text-teal-400 shrink-0" />
                      <span>{effectiveCoverUrl ? "背景変更" : "背景写真"}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 下部純白ボディ */}
              <div className="px-3.5 pb-4 pt-2 bg-card space-y-3">
                {/* 境界オーバーラップ行：円形チームロゴ ＋ 在籍サマリーバッジ */}
                <div className="relative z-20 flex items-end justify-between gap-2.5 -mt-9">
                  <div className="w-16 h-16 rounded-full border-[3px] border-card bg-card shadow-sm ring-2 ring-primary/20 overflow-hidden flex items-center justify-center shrink-0">
                    {effectiveLogoUrl ? (
                      <img
                        src={effectiveLogoUrl}
                        alt={orgHeadline}
                        width={64}
                        height={64}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="w-full h-full bg-primary/10 text-primary flex items-center justify-center font-black text-base select-none">
                        {teamInitials}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap justify-end pb-0.5">
                    <div className="px-2.5 py-1 rounded-xl bg-muted border border-border flex items-baseline gap-1 shadow-2xs">
                      <span className="text-[10px] font-black text-muted-foreground">
                        在籍選手
                      </span>
                      <span className="text-base font-black italic tracking-tight tabular-nums text-foreground leading-none pr-0.5">
                        {data.rosterSummary.activePlayerCount}
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground">
                        名
                      </span>
                    </div>
                    <div className="px-2.5 py-1 rounded-xl bg-muted border border-border flex items-baseline gap-1 shadow-2xs">
                      <span className="text-[10px] font-black text-muted-foreground">
                        スタッフ
                      </span>
                      <span className="text-base font-black italic tracking-tight tabular-nums text-foreground leading-none pr-0.5">
                        {data.rosterSummary.staffCount}
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground">
                        名
                      </span>
                    </div>
                  </div>
                </div>

                {/* チーム名・構成名 */}
                <div className="space-y-1">
                  <h2 className="text-lg sm:text-xl font-black tracking-tight text-foreground leading-snug">
                    {orgHeadline}
                  </h2>
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground flex-wrap">
                    {squadSubname && squadSubname !== orgHeadline && (
                      <span className="px-2 py-0.5 rounded-md bg-muted border border-border text-foreground text-[10.5px] font-black">
                        {squadSubname}
                      </span>
                    )}
                    {data.organization.shortName &&
                      data.organization.shortName !== orgHeadline && (
                        <span>略称: {data.organization.shortName}</span>
                      )}
                  </div>
                </div>

                {/* スローガン ＆ チーム紹介文 */}
                {data.organization.profile.slogan && (
                  <div className="rounded-xl border border-primary/25 bg-primary/6 px-3 py-2.5 flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <p className="text-xs sm:text-sm font-black tracking-tight text-foreground leading-snug">
                      「{data.organization.profile.slogan}」
                    </p>
                  </div>
                )}

                {data.organization.description ? (
                  <p className="text-xs leading-relaxed font-medium text-muted-foreground whitespace-pre-line">
                    {data.organization.description}
                  </p>
                ) : (
                  canEdit && (
                    <button
                      type="button"
                      onClick={() => openEditModal("overview")}
                      className="w-full py-2 px-3 rounded-xl border border-dashed border-border hover:border-primary/50 text-xs font-bold text-muted-foreground hover:text-primary flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>チームスローガン・紹介文を入力する</span>
                    </button>
                  )
                )}
              </div>
            </section>

            {/* ━━━ 1. クラブ概要・指導方針 ━━━ */}
            <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 className="w-4 h-4 text-sky-400 shrink-0" />
                  <h3 className="text-xs sm:text-sm font-black tracking-tight truncate">
                    クラブ概要・指導方針
                  </h3>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => openEditModal("overview")}
                    className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[10.5px] font-black flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                  >
                    <Pencil className="w-3 h-3 text-sky-400" />
                    <span>編集</span>
                  </button>
                )}
              </div>

              <div className="p-3.5 sm:p-4 space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="rounded-xl border border-border bg-muted/45 px-3 py-2.5 space-y-0.5">
                    <span className="text-[10px] font-black text-muted-foreground block">
                      競技区分
                    </span>
                    <p className="text-xs font-black text-foreground">
                      {categoryOption.label}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border bg-muted/45 px-3 py-2.5 space-y-0.5">
                    <span className="text-[10px] font-black text-muted-foreground block">
                      創設・歴史
                    </span>
                    <p className="text-xs font-black text-foreground">
                      {foundedHistoryLabel || "未設定"}
                    </p>
                  </div>

                  {data.organization.profile.activityArea && (
                    <div className="rounded-xl border border-border bg-muted/45 px-3 py-2.5 space-y-0.5">
                      <span className="text-[10px] font-black text-muted-foreground flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                        <span>主な活動エリア</span>
                      </span>
                      <p className="text-xs font-bold text-foreground">
                        {data.organization.profile.activityArea}
                      </p>
                    </div>
                  )}

                  {data.organization.profile.activityDays && (
                    <div className="rounded-xl border border-border bg-muted/45 px-3 py-2.5 space-y-0.5">
                      <span className="text-[10px] font-black text-muted-foreground flex items-center gap-1">
                        <CalendarClock className="w-3 h-3 text-primary" />
                        <span>活動曜日・時間帯の目安</span>
                      </span>
                      <p className="text-xs font-bold text-foreground">
                        {data.organization.profile.activityDays}
                      </p>
                    </div>
                  )}
                </div>

                {data.organization.profile.philosophy ? (
                  <div className="rounded-xl border border-border bg-background p-3 space-y-1.5">
                    <p className="text-[11px] font-black text-primary">
                      指導方針・チーム理念
                    </p>
                    <p className="text-xs leading-relaxed font-medium text-foreground whitespace-pre-line">
                      {data.organization.profile.philosophy}
                    </p>
                  </div>
                ) : (
                  canEdit && (
                    <button
                      type="button"
                      onClick={() => openEditModal("overview")}
                      className="w-full py-2 px-3 rounded-xl border border-dashed border-border hover:border-primary/50 text-[11px] font-bold text-muted-foreground hover:text-primary flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>指導方針・活動曜日を設定する</span>
                    </button>
                  )
                )}
              </div>
            </section>

            {/* ━━━ 2. 指導体制・スタッフ・在籍サマリー ━━━ */}
            <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Users className="w-4 h-4 text-sky-400 shrink-0" />
                  <h3 className="text-xs sm:text-sm font-black tracking-tight truncate">
                    指導体制・在籍構成
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => openEditModal("structure")}
                      className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[10.5px] font-black flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Pencil className="w-3 h-3 text-sky-400" />
                      <span>編集</span>
                    </button>
                  )}
                  <Link
                    href="/liff/players"
                    onPointerDown={() =>
                      warmupLiffEndpointForHref("/liff/players", activeTeamId)
                    }
                    className="px-2 py-0.5 rounded-lg bg-primary text-primary-foreground text-[10.5px] font-black inline-flex items-center gap-0.5 hover:opacity-90 transition-opacity"
                  >
                    <span>選手名鑑</span>
                    <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>

              <div className="p-3.5 sm:p-4 space-y-3.5">
                {/* 代表・監督・主将キーカード */}
                {(Boolean(data.organization.profile.representativeName) ||
                  Boolean(data.currentSquad.managerName) ||
                  Boolean(data.currentSquad.captainName)) && (
                  <div className="flex flex-wrap gap-2">
                    {data.organization.profile.representativeName && (
                      <div className="px-3 py-1.5 rounded-xl border border-border bg-muted/50 flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-[#0f172a] text-slate-100 text-[9.5px] font-black">
                          代表
                        </span>
                        <span className="text-xs font-black text-foreground">
                          {data.organization.profile.representativeName}
                        </span>
                      </div>
                    )}
                    {data.currentSquad.managerName && (
                      <div className="px-3 py-1.5 rounded-xl border border-border bg-muted/50 flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[9.5px] font-black">
                          監督
                        </span>
                        <span className="text-xs font-black text-foreground">
                          {data.currentSquad.managerName}
                        </span>
                      </div>
                    )}
                    {data.currentSquad.captainName && (
                      <div className="px-3 py-1.5 rounded-xl border border-amber-500/35 bg-amber-500/10 flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-amber-500 text-white text-[9.5px] font-black inline-flex items-center gap-0.5">
                          <Crown className="w-2.5 h-2.5" />
                          <span>主将</span>
                        </span>
                        <span className="text-xs font-black text-foreground">
                          {data.currentSquad.captainUniformNumber
                            ? `#${data.currentSquad.captainUniformNumber} `
                            : ""}
                          {data.currentSquad.captainName}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* 指導者・スタッフ陣一覧 */}
                {data.staffMembers.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-black text-muted-foreground">
                      指導者・スタッフ一覧（{data.staffMembers.length}名）
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {data.staffMembers.map((st) => (
                        <div
                          key={st.id}
                          className="flex items-center gap-2.5 p-2 rounded-xl border border-border bg-background"
                        >
                          <Avatar className="w-8 h-8 border border-border shrink-0">
                            {st.avatarUrl && (
                              <AvatarImage src={st.avatarUrl} alt={st.name} />
                            )}
                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-black">
                              {st.name.slice(0, 1)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-black text-foreground truncate">
                              {st.name}
                            </p>
                            <div className="flex items-center gap-1 flex-wrap mt-0.5">
                              <span className="px-1.5 py-0.2 rounded bg-primary/12 text-primary text-[9.5px] font-black">
                                {st.roleLabel}
                              </span>
                              {st.subRoleLabels.map((sub) => (
                                <span
                                  key={sub}
                                  className="px-1.5 py-0.2 rounded bg-muted text-muted-foreground text-[9.5px] font-bold"
                                >
                                  {sub}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 在籍選手・学年（年代）別内訳 */}
                <div className="rounded-xl border border-border bg-muted/45 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] font-black text-foreground">
                      在籍選手内訳（計 {data.rosterSummary.activePlayerCount}名）
                    </span>
                    {data.rosterSummary.onLeavePlayerCount > 0 && (
                      <span className="text-[10px] font-bold text-muted-foreground">
                        うち休部中 {data.rosterSummary.onLeavePlayerCount}名
                      </span>
                    )}
                  </div>

                  {data.rosterSummary.gradeBreakdown.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {data.rosterSummary.gradeBreakdown.map((g) => (
                        <span
                          key={g.label}
                          className="inline-flex items-baseline gap-1 px-2.5 py-1 rounded-lg bg-card border border-border shadow-2xs"
                        >
                          <span className="text-[11px] font-black text-foreground">
                            {g.label}
                          </span>
                          <span className="text-xs font-black text-primary tabular-nums">
                            {g.count}
                          </span>
                          <span className="text-[10px] font-bold text-muted-foreground">
                            名
                          </span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] font-medium text-muted-foreground">
                      選手名鑑で各選手の学年・年代を登録すると自動集計されます
                    </p>
                  )}
                </div>

                {/* 同一クラブ内の編成一覧（複数編成がある場合） */}
                {data.squads.length > 1 && (
                  <div className="space-y-2 pt-1 border-t border-border">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-black text-muted-foreground">
                        クラブ内の編成一覧（{data.squads.length}編成）
                      </span>
                      {canManage && (
                        <Link
                          href="/liff/admin/teams"
                          className="text-[10.5px] font-black text-primary hover:underline inline-flex items-center gap-0.5"
                        >
                          <span>編成管理</span>
                          <ChevronRight className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {data.squads.map((sq) => (
                        <div
                          key={sq.id}
                          className={cn(
                            "flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs",
                            sq.isCurrent
                              ? "border-primary/40 bg-primary/6"
                              : "border-border bg-background"
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-black text-foreground truncate">
                                {sq.name}
                              </span>
                              {sq.isCurrent && (
                                <span className="px-1.5 py-0.2 rounded bg-primary text-primary-foreground text-[9.5px] font-black">
                                  表示中
                                </span>
                              )}
                            </div>
                            {sq.managerName && (
                              <p className="text-[10.5px] font-bold text-muted-foreground mt-0.5">
                                監督: {sq.managerName}
                              </p>
                            )}
                          </div>
                          <span className="px-2 py-0.5 rounded-lg bg-card border border-border text-[11px] font-black text-foreground tabular-nums shrink-0">
                            {sq.playerCount}名
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* ━━━ 3. ホームグラウンド・加盟連盟・公式SNS ━━━ */}
            <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 px-4 py-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin className="w-4 h-4 text-teal-400 shrink-0" />
                  <h3 className="text-xs sm:text-sm font-black tracking-tight truncate">
                    活動拠点・連盟・公式リンク
                  </h3>
                </div>
                <Link
                  href="/liff/grounds"
                  onPointerDown={() =>
                    warmupLiffEndpointForHref("/liff/grounds", activeTeamId)
                  }
                  className="px-2 py-0.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-[10.5px] font-black inline-flex items-center gap-0.5 transition-colors shrink-0"
                >
                  <span>球場マップ</span>
                  <ChevronRight className="w-3 h-3" />
                </Link>
              </div>

              <div className="p-3.5 sm:p-4 space-y-4">
                {/* 主な活動拠点 */}
                <div className="space-y-2">
                  <p className="text-[11px] font-black text-muted-foreground">
                    主な活動拠点・グラウンド
                  </p>

                  {data.grounds.length > 0 ? (
                    <div className="space-y-2">
                      {data.grounds.map((g) => {
                        const mapHref = resolveGroundMapHref(g);
                        const surfaceText = resolveSurfaceLabel(g.surfaceType);
                        return (
                          <div
                            key={g.id}
                            className="rounded-xl border border-border bg-background p-3 space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {g.isPrimaryHome && (
                                    <span className="px-1.5 py-0.5 rounded bg-teal-600 text-white text-[9.5px] font-black">
                                      本拠地
                                    </span>
                                  )}
                                  <h4 className="text-xs sm:text-sm font-black text-foreground">
                                    {g.name}
                                  </h4>
                                </div>
                                {g.address && (
                                  <p className="text-[11px] font-medium text-muted-foreground">
                                    {g.address}
                                  </p>
                                )}
                              </div>

                              {mapHref && (
                                <a
                                  href={mapHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2.5 py-1.5 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] text-white text-[10.5px] font-black inline-flex items-center gap-1 shrink-0 shadow-2xs transition-colors"
                                >
                                  <MapPin className="w-3 h-3" />
                                  <span>地図</span>
                                </a>
                              )}
                            </div>

                            {(surfaceText ||
                              g.dimensions ||
                              g.parkingInfo ||
                              g.spikeRule) && (
                              <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border text-[10.5px] font-bold text-muted-foreground">
                                {surfaceText && (
                                  <span className="px-2 py-0.5 rounded bg-muted text-foreground">
                                    {surfaceText}
                                  </span>
                                )}
                                {g.dimensions && (
                                  <span className="px-2 py-0.5 rounded bg-muted text-foreground">
                                    {g.dimensions}
                                  </span>
                                )}
                                {g.parkingInfo && (
                                  <span className="px-2 py-0.5 rounded bg-muted text-foreground">
                                    🅿️ {g.parkingInfo}
                                  </span>
                                )}
                                {g.spikeRule && (
                                  <span className="px-2 py-0.5 rounded bg-muted text-foreground">
                                    👟 {g.spikeRule}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : data.currentSquad.homeGround ? (
                    <div className="rounded-xl border border-border bg-background px-3 py-2.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="px-1.5 py-0.5 rounded bg-teal-600 text-white text-[9.5px] font-black shrink-0">
                          本拠地
                        </span>
                        <span className="text-xs font-black text-foreground truncate">
                          {data.currentSquad.homeGround}
                        </span>
                      </div>
                      <Link
                        href="/liff/grounds"
                        className="text-[11px] font-black text-teal-600 dark:text-teal-400 shrink-0 hover:underline"
                      >
                        詳細登録
                      </Link>
                    </div>
                  ) : (
                    <Link
                      href="/liff/grounds"
                      className="w-full py-2.5 px-3 rounded-xl border border-dashed border-border hover:border-teal-500/50 text-xs font-bold text-muted-foreground hover:text-teal-600 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>球場・施設マップで活動拠点を登録する</span>
                    </Link>
                  )}
                </div>

                {/* 加盟連盟・所属リーグ */}
                {(data.organization.profile.affiliatedLeagues.length > 0 ||
                  canEdit) && (
                  <div className="space-y-2 pt-3 border-t border-border">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-black text-muted-foreground">
                        加盟連盟・所属リーグ
                      </p>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => openEditModal("structure")}
                          className="text-[10.5px] font-black text-primary hover:underline cursor-pointer"
                        >
                          連盟を編集
                        </button>
                      )}
                    </div>

                    {data.organization.profile.affiliatedLeagues.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {data.organization.profile.affiliatedLeagues.map(
                          (league) => (
                            <span
                              key={league}
                              className="px-2.5 py-1 rounded-lg bg-muted border border-border text-xs font-bold text-foreground"
                            >
                              {league}
                            </span>
                          )
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] font-medium text-muted-foreground">
                        所属している連盟・リーグ名を登録できます
                      </p>
                    )}
                  </div>
                )}

                {/* 公式リンク・SNS（関連リンク集連携） */}
                <div className="space-y-2 pt-3 border-t border-border">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-black text-muted-foreground flex items-center gap-1">
                      <Link2 className="w-3.5 h-3.5 text-amber-500" />
                      <span>公式リンク・連盟サイト・SNS</span>
                    </p>
                    <Link
                      href="/liff/links"
                      onPointerDown={() =>
                        warmupLiffEndpointForHref("/liff/links", activeTeamId)
                      }
                      className="text-[10.5px] font-black text-primary hover:underline inline-flex items-center gap-0.5"
                    >
                      <span>関連リンク集へ</span>
                      <ChevronRight className="w-3 h-3" />
                    </Link>
                  </div>

                  {data.officialLinks.length > 0 ? (
                    <div className="space-y-2">
                      {data.officialLinks.map((lnk) => {
                        const subLinks = lnk.subLinks ?? [];
                        return (
                          <div
                            key={lnk.id}
                            className="rounded-xl border border-border bg-background overflow-hidden"
                          >
                            <a
                              href={sanitizeSafeExternalHref(lnk.url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2.5 p-2.5 hover:bg-muted/40 transition-colors group"
                            >
                              {renderOfficialLinkBadge(lnk)}
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-black text-foreground truncate group-hover:text-primary transition-colors">
                                  {lnk.title}
                                </p>
                                {lnk.description && (
                                  <p className="text-[10.5px] font-medium text-muted-foreground truncate">
                                    {lnk.description}
                                  </p>
                                )}
                              </div>
                              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            </a>

                            {subLinks.length > 0 && (
                              <div className="border-t border-border bg-muted/25 px-2.5 py-2 space-y-1">
                                {subLinks.map((sub) => (
                                  <a
                                    key={sub.id}
                                    href={sanitizeSafeExternalHref(sub.url)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border bg-card hover:border-primary/40 transition-colors group"
                                  >
                                    <CornerDownRight className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[11px] font-black text-foreground truncate group-hover:text-primary transition-colors">
                                        {sub.title}
                                      </p>
                                      {sub.note && (
                                        <p className="text-[10px] font-bold text-muted-foreground truncate">
                                          {sub.note}
                                        </p>
                                      )}
                                    </div>
                                    <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <Link
                      href="/liff/links"
                      className="w-full py-2 px-3 rounded-xl border border-dashed border-border hover:border-amber-500/50 text-[11px] font-bold text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>連盟HPや公式SNSを「関連リンク集」に登録する</span>
                    </Link>
                  )}
                </div>
              </div>
            </section>

            {/* ━━━ 4. 主な戦績・大会入賞歴 ━━━ */}
            <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 px-4 py-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
                  <h3 className="text-xs sm:text-sm font-black tracking-tight truncate">
                    主な戦績・大会入賞歴
                  </h3>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => openEditModal("honors")}
                    className="px-2.5 py-0.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10.5px] font-black flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                  >
                    <Plus className="w-3 h-3 stroke-[2.5]" />
                    <span>戦績追加</span>
                  </button>
                )}
              </div>

              <div className="p-3.5 sm:p-4 space-y-3.5">
                {data.organization.profile.honors.length > 0 ? (
                  <div className="space-y-2">
                    {data.organization.profile.honors.map((h) => (
                      <div
                        key={h.id}
                        className="flex items-center justify-between gap-2.5 p-2.5 rounded-xl border border-border bg-background"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span className="px-2 py-1 rounded-lg bg-muted border border-border text-[10.5px] font-black font-mono text-foreground shrink-0">
                            {h.year}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-black text-foreground leading-snug">
                              {h.tournament}
                            </p>
                            {h.squadLabel && (
                              <span className="text-[10.5px] font-bold text-muted-foreground">
                                {h.squadLabel}
                              </span>
                            )}
                          </div>
                        </div>

                        <span
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-[11px] font-black border shrink-0 inline-flex items-center gap-1",
                            h.badgeTone === "gold" &&
                              "bg-amber-500/18 text-amber-800 dark:text-amber-300 border-amber-500/40",
                            h.badgeTone === "silver" &&
                              "bg-slate-500/15 text-slate-700 dark:text-slate-200 border-slate-500/35",
                            h.badgeTone === "bronze" &&
                              "bg-orange-500/15 text-orange-800 dark:text-orange-300 border-orange-500/35",
                            h.badgeTone === "blue" &&
                              "bg-primary/12 text-primary border-primary/30"
                          )}
                        >
                          <Award className="w-3 h-3 shrink-0" />
                          <span>{h.result}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-4 px-3 rounded-xl border border-dashed border-border text-center space-y-2">
                    <p className="text-xs font-bold text-muted-foreground">
                      大会の優勝・入賞・上部大会出場などの戦績はまだ登録されていません
                    </p>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => openEditModal("honors")}
                        className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-black inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>最初の戦績を登録する</span>
                      </button>
                    )}
                  </div>
                )}

                {/* 今季試合成績ショートカット */}
                <Link
                  href="/liff/stats"
                  onPointerDown={() =>
                    warmupLiffEndpointForHref("/liff/stats", activeTeamId)
                  }
                  className="flex items-center justify-between gap-2 p-3 rounded-xl border border-border bg-muted/55 hover:border-primary/40 transition-colors group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-8 h-8 rounded-xl bg-primary/12 text-primary flex items-center justify-center shrink-0">
                      <BarChart3 className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-black text-foreground group-hover:text-primary transition-colors">
                        チーム成績・個人ランキングを見る
                      </p>
                      <p className="text-[10.5px] font-bold text-muted-foreground truncate">
                        {data.seasonRecord.totalMatches > 0
                          ? `${data.currentSquad.year}年度 試合記録: ${data.seasonRecord.wins}勝 ${data.seasonRecord.losses}敗${
                              data.seasonRecord.draws > 0
                                ? ` ${data.seasonRecord.draws}分`
                                : ""
                            }（全${data.seasonRecord.totalMatches}試合）`
                          : "勝敗・得失点・打撃/投手ランキングを集計表示"}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0" />
                </Link>
              </div>
            </section>
          </>
        ) : null}

        <div
          className="h-8 w-full shrink-0 pointer-events-none select-none"
          aria-hidden="true"
        />
      </div>

      {/* 🏟️ カバー背景画像設定モーダル */}
      {isCoverModalOpen && data && (
        <TeamCoverPhotoModal
          isOpen={isCoverModalOpen}
          teamId={activeTeamId}
          teamName={orgHeadline}
          logoImageUrl={effectiveLogoUrl}
          currentCoverUrl={effectiveCoverUrl}
          userId={effectiveUserId || null}
          userName={effectiveUserName || null}
          onClose={() => setIsCoverModalOpen(false)}
          onCoverUpdated={(nextCoverUrl) => {
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    organization: {
                      ...prev.organization,
                      coverImageUrl: nextCoverUrl,
                    },
                  }
                : prev
            );
            updateCurrentTeamCover(nextCoverUrl || undefined);
            if (!isDemoMode) {
              void refreshTeams();
            }
          }}
        />
      )}

      {/* ✏️ チーム情報編集モーダル */}
      {isEditModalOpen && data && (
        <TeamInfoEditModal
          isOpen={isEditModalOpen}
          initialTab={editInitialTab}
          teamId={activeTeamId}
          info={data}
          onClose={() => setIsEditModalOpen(false)}
          onSaved={handleSavedFromModal}
        />
      )}
    </div>
  );
}
