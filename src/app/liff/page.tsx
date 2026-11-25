// filepath: src/app/liff/page.tsx
"use client";

import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { HubTopNewsTicker } from "@/components/liff/HubTopNewsTicker";
import { HubHeroSection } from "@/components/liff/HubHeroSection";
import { HubQuickNav } from "@/components/liff/HubQuickNav";
import { HubCalendarSection } from "@/components/liff/HubCalendarSection";
import { LiffDataLoadErrorCard } from "@/components/liff/LiffDataLoadErrorCard";
import type { MatchCardData } from "@/components/liff/MatchScoreCard";
import {
  canManageCurrentTeam,
  useLiff,
  usePracticeMatchLabel,
  useScoreTeamDisplayName,
} from "@/components/liff/LiffProvider";
import {
  LIFF_CACHE_INVALIDATED_EVENT,
  buildLiffHubUrl,
  fetchLiffJsonSWR,
  getLastLiffCacheInvalidatedAt,
  peekLiffApiCache,
  warmupLiffEndpointForHref,
} from "@/lib/liff/api-cache";
import {
  scheduleScrollLiffWindowToTop,
  scrollLiffWindowToTop,
} from "@/lib/liff/navigation";
import { LIFF_WEBVIEW_RESUMED_EVENT } from "@/lib/liff/runtime-recovery";
import {
  normalizeGroupStatusSummaryConfig,
  type GroupStatusConfigSummary,
} from "@/lib/liff/group-attendance";
import {
  DEMO_HUB_TICKER_SERVER_CONTEXT,
  DEFAULT_HUB_TICKER_CONFIG,
  loadDemoHubTickerConfig,
  parseHubTickerConfigJson,
  type HubTickerConfig,
  type HubTickerServerContext,
} from "@/lib/liff/hub-ticker";
import {
  buildDemoSpecialEventsBundle,
  formatSpecialEventCompactDeadline,
  getSpecialEventCategoryMeta,
  resolveSpecialEventSortDateKey,
  type HubSpecialEventSummary,
} from "@/lib/liff/special-events-schema";
import type { HubEventInputItem } from "@/components/liff/HubHeroSection";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  UserPlus,
  ShieldCheck,
  Check,
  ChevronRight,
  PartyPopper,
  Sparkles,
  X,
} from "lucide-react";
import { DemoBanner } from "@/components/liff/DemoBanner";

const JoinTeamModal = dynamic(
  () => import("@/components/liff/JoinTeamModal").then((m) => m.JoinTeamModal),
  { ssr: false }
);

interface HubOnboardingSummary {
  activePlayerCount: number;
  activeMemberCount: number;
  venueCount: number;
  hasActivity: boolean;
}

interface HubDataResponse {
  success: boolean;
  isDemo?: boolean;
  liffId?: string;
  team?: {
    id: string | null;
    name: string;
    shortName: string;
    homeGround?: string | null;
  };
  nextEvent?: unknown;
  events?: HubEventInputItem[];
  specialEvents?: HubSpecialEventSummary[];
  matches?: MatchCardData[];
  attendanceStatusConfig?: unknown;
  hubTickerConfig?: unknown;
  hubTickerContext?: HubTickerServerContext | null;
  onboardingSummary?: HubOnboardingSummary | null;
}

function resolveInitialHubCache(): HubDataResponse | null {
  if (typeof window === "undefined") return null;
  const tid = localStorage.getItem("iscore_selectedTeamId");
  const uid = localStorage.getItem("iscore_user_id") || localStorage.getItem("iscore_userId") || "";
  const uName = localStorage.getItem("iscore_user_name") || "";
  if (tid) {
    const exact = peekLiffApiCache<HubDataResponse>(
      buildLiffHubUrl({ teamId: tid, userId: uid, userName: uName })
    );
    if (exact) return exact;
  }
  return peekLiffApiCache<HubDataResponse>(
    buildLiffHubUrl({ teamId: null, userId: uid, userName: uName })
  );
}

export default function LiffHubPage() {
  const {
    profile,
    currentTeam,
    isLoadingTeam,
    isLoggedIn,
    login,
    isDemo,
    refreshTeams,
    pendingTeams,
    shouldOpenJoinModal,
    clearPendingJoinCode,
  } = useLiff();
  const { scoreTeamName } = useScoreTeamDisplayName("チーム");
  const practiceMatchLabel = usePracticeMatchLabel();
  const [userName, setUserName] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("iscore_user_name") || "メンバー";
    }
    return "メンバー";
  });

  const initialCached = resolveInitialHubCache();
  const [nextEvent, setNextEvent] = useState<unknown>(initialCached?.nextEvent ?? null);
  const [events, setEvents] = useState<HubEventInputItem[]>(
    Array.isArray(initialCached?.events) ? initialCached!.events! : []
  );
  const [specialEvents, setSpecialEvents] = useState<HubSpecialEventSummary[]>(
    Array.isArray(initialCached?.specialEvents)
      ? initialCached!.specialEvents!
      : []
  );
  const [matches, setMatches] = useState<MatchCardData[]>(
    Array.isArray(initialCached?.matches) ? initialCached!.matches! : []
  );
  const [attendanceStatusConfig, setAttendanceStatusConfig] = useState<GroupStatusConfigSummary>(() =>
    normalizeGroupStatusSummaryConfig(initialCached?.attendanceStatusConfig)
  );
  const [hubTickerConfig, setHubTickerConfig] = useState<HubTickerConfig>(() =>
    initialCached?.isDemo
      ? loadDemoHubTickerConfig()
      : parseHubTickerConfigJson(initialCached?.hubTickerConfig)
  );
  const [hubTickerContext, setHubTickerContext] =
    useState<HubTickerServerContext | null>(
      () => initialCached?.hubTickerContext ?? null
    );
  const [onboardingSummary, setOnboardingSummary] = useState<HubOnboardingSummary | null>(
    initialCached?.onboardingSummary ?? null
  );
  const [isOnboardingDismissed, setIsOnboardingDismissed] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(!initialCached);
  const [hasLoaded, setHasLoaded] = useState<boolean>(Boolean(initialCached));
  const [loadError, setLoadError] = useState<boolean>(false);

  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [joinModalInitialMode, setJoinModalInitialMode] = useState<"join" | "create">("join");

  const hasLoadedRef = useRef<boolean>(Boolean(initialCached));
  const hubLoadFailedRef = useRef<boolean>(false);
  const lastAppliedAtRef = useRef<number>(initialCached ? Date.now() : 0);
  const prevTeamIdRef = useRef<string | undefined>(currentTeam?.id);
  const userScrolledManuallyRef = useRef<boolean>(false);
  const mountedAtRef = useRef<number>(0);

  // トップページ起動時・リロード（更新）時・BFCache復帰時に微妙なスクロールずれで最上部が欠けるのを完全防止
  const useIsomorphicLayoutEffect =
    typeof window !== "undefined" ? useLayoutEffect : useEffect;

  useIsomorphicLayoutEffect(() => {
    if (typeof window === "undefined") return;
    userScrolledManuallyRef.current = false;
    mountedAtRef.current = Date.now();

    const prevRestoration =
      "scrollRestoration" in window.history
        ? window.history.scrollRestoration
        : null;
    if ("scrollRestoration" in window.history) {
      try {
        window.history.scrollRestoration = "manual";
      } catch {
        // ignore restricted WebViews
      }
    }

    scheduleScrollLiffWindowToTop();

    const markUserInteracted = () => {
      userScrolledManuallyRef.current = true;
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "ArrowDown" ||
        e.key === "ArrowUp" ||
        e.key === "PageDown" ||
        e.key === "PageUp" ||
        e.key === " "
      ) {
        userScrolledManuallyRef.current = true;
      }
    };
    // 初期マウント〜データ描画完了（900ms以内）にブラウザ自動復元等でユーザーが触っていないのに scrollY が動いた場合は即座に 0px へ戻す
    const handleUnexpectedInitialScroll = () => {
      if (userScrolledManuallyRef.current) return;
      if (Date.now() - mountedAtRef.current > 900) return;
      if (window.scrollY > 0) {
        scrollLiffWindowToTop();
      }
    };
    const handlePageShowTop = (e: PageTransitionEvent) => {
      if (e.persisted) {
        userScrolledManuallyRef.current = false;
        mountedAtRef.current = Date.now();
        scheduleScrollLiffWindowToTop();
      }
    };

    window.addEventListener("touchstart", markUserInteracted, { passive: true });
    window.addEventListener("wheel", markUserInteracted, { passive: true });
    window.addEventListener("keydown", handleKeyDown, { passive: true });
    window.addEventListener("scroll", handleUnexpectedInitialScroll, {
      passive: true,
    });
    window.addEventListener("pageshow", handlePageShowTop);

    const settleCleanupTimer = setTimeout(() => {
      window.removeEventListener("scroll", handleUnexpectedInitialScroll);
    }, 950);

    return () => {
      clearTimeout(settleCleanupTimer);
      window.removeEventListener("touchstart", markUserInteracted);
      window.removeEventListener("wheel", markUserInteracted);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleUnexpectedInitialScroll);
      window.removeEventListener("pageshow", handlePageShowTop);
      if (prevRestoration && "scrollRestoration" in window.history) {
        try {
          window.history.scrollRestoration = prevRestoration;
        } catch {
          // ignore
        }
      }
    };
  }, []);

  // 初回HUBデータ反映直後にも、ユーザーがまだ指でスクロールしていなければ最上部（0px）を保証
  useEffect(() => {
    if (!hasLoaded || userScrolledManuallyRef.current) return;
    if (Date.now() - mountedAtRef.current <= 1500 && window.scrollY > 0) {
      scheduleScrollLiffWindowToTop();
    }
  }, [hasLoaded]);

  // LINEプロフィール取得時の名前反映
  useEffect(() => {
    if (profile?.displayName) {
      setUserName(profile.displayName);
    }
  }, [profile?.displayName]);

  // 招待URL（?join=...）からアクセスした際、未所属・未申請ユーザーのみ参加申請モーダルを自動で開く
  useEffect(() => {
    if (shouldOpenJoinModal) {
      setJoinModalInitialMode("join");
      setIsJoinModalOpen(true);
    }
  }, [shouldOpenJoinModal]);

  // チームごとの初期セットアップチェックリスト非表示状態を同期
  useEffect(() => {
    const tid = currentTeam?.id;
    if (!tid || tid === "demo-team" || typeof window === "undefined") {
      setIsOnboardingDismissed(false);
      return;
    }
    try {
      setIsOnboardingDismissed(
        localStorage.getItem(`iscore_onboarding_dismissed_${tid}`) === "1"
      );
    } catch {
      setIsOnboardingDismissed(false);
    }
  }, [currentTeam?.id]);

  const applyHubData = useCallback((data: HubDataResponse) => {
    if (!data || data.success === false) {
      hubLoadFailedRef.current = true;
      if (!hasLoadedRef.current) {
        setLoadError(true);
      }
      setIsLoading(false);
      return;
    }
    hubLoadFailedRef.current = false;
    setLoadError(false);
    setNextEvent(data.nextEvent ?? null);
    setEvents(Array.isArray(data.events) ? data.events : []);
    setSpecialEvents(Array.isArray(data.specialEvents) ? data.specialEvents : []);
    setMatches(Array.isArray(data.matches) ? data.matches : []);
    setAttendanceStatusConfig(normalizeGroupStatusSummaryConfig(data.attendanceStatusConfig));
    const isDemoPayload =
      Boolean(data.isDemo) || data.team?.id === "demo-team";
    setHubTickerConfig(
      isDemoPayload
        ? loadDemoHubTickerConfig()
        : parseHubTickerConfigJson(data.hubTickerConfig)
    );
    setHubTickerContext(
      isDemoPayload
        ? data.hubTickerContext ?? DEMO_HUB_TICKER_SERVER_CONTEXT
        : data.hubTickerContext ?? null
    );
    setOnboardingSummary(data.onboardingSummary ?? null);
    hasLoadedRef.current = true;
    setHasLoaded(true);
    lastAppliedAtRef.current = Date.now();
    setIsLoading(false);
  }, []);

  // DBからチーム情報・次回予定・試合一覧を取得（SWR + LiffProviderとのリクエスト完全統合）
  const loadHubData = useCallback(
    async (teamId?: string, forceRefresh = false) => {
      if (isLoadingTeam && !currentTeam?.id && !teamId) return;

      const targetTeamId =
        teamId ||
        currentTeam?.id ||
        (typeof window !== "undefined" ? localStorage.getItem("iscore_selectedTeamId") : null) ||
        null;
      const uid =
        profile?.userId ||
        (typeof window !== "undefined"
          ? localStorage.getItem("iscore_user_id") || localStorage.getItem("iscore_userId") || ""
          : "");
      const uName =
        profile?.displayName ||
        (typeof window !== "undefined" ? localStorage.getItem("iscore_user_name") || "" : "");

      const endpoint = buildLiffHubUrl({
        teamId: targetTeamId,
        userId: uid,
        userName: uName,
      });

      const cached = !forceRefresh ? peekLiffApiCache<HubDataResponse>(endpoint) : null;
      if (cached && cached.success !== false) {
        applyHubData(cached);
      } else if (!hasLoadedRef.current) {
        setIsLoading(true);
      }

      try {
        const data = await fetchLiffJsonSWR<HubDataResponse>(endpoint, {
          forceRefresh,
          onRevalidate: (fresh) => applyHubData(fresh),
        });
        applyHubData(data);
      } catch (error) {
        hubLoadFailedRef.current = true;
        if (!hasLoadedRef.current) {
          setLoadError(true);
        }
        console.error("Failed to load hub data:", error);
        setIsLoading(false);
      }
    },
    [applyHubData, currentTeam?.id, isLoadingTeam, profile?.displayName, profile?.userId]
  );

  useEffect(() => {
    const currentId = currentTeam?.id;
    // 別のチームへ明示的に切り替えた場合のみキャッシュがない時にクリアする
    if (prevTeamIdRef.current && currentId && prevTeamIdRef.current !== currentId) {
      const uid =
        profile?.userId ||
        (typeof window !== "undefined"
          ? localStorage.getItem("iscore_user_id") || localStorage.getItem("iscore_userId") || ""
          : "");
      const uName =
        profile?.displayName ||
        (typeof window !== "undefined" ? localStorage.getItem("iscore_user_name") || "" : "");
      const nextCached = peekLiffApiCache<HubDataResponse>(
        buildLiffHubUrl({ teamId: currentId, userId: uid, userName: uName })
      );
      if (!nextCached) {
        setEvents([]);
        setSpecialEvents([]);
        setMatches([]);
        setNextEvent(null);
        setHubTickerConfig(
          currentId === "demo-team"
            ? loadDemoHubTickerConfig()
            : DEFAULT_HUB_TICKER_CONFIG
        );
        setHubTickerContext(
          currentId === "demo-team" ? DEMO_HUB_TICKER_SERVER_CONTEXT : null
        );
        setOnboardingSummary(null);
        setLoadError(false);
        hasLoadedRef.current = false;
        setHasLoaded(false);
      }
    }
    prevTeamIdRef.current = currentId;
    const needsForce = getLastLiffCacheInvalidatedAt() > lastAppliedAtRef.current;
    void loadHubData(currentId, needsForce);
  }, [currentTeam?.id, loadHubData, profile?.displayName, profile?.userId]);

  // 試合詳細・予定編集・出欠登録など下層画面で保存して「戻る」で復帰した際や通信回復時にも即時最新データを反映
  useEffect(() => {
    const handleInvalidated = () => {
      void loadHubData(currentTeam?.id, true);
    };
    const handleBackOrResume = () => {
      if (
        hubLoadFailedRef.current ||
        !hasLoadedRef.current ||
        getLastLiffCacheInvalidatedAt() > lastAppliedAtRef.current
      ) {
        void loadHubData(currentTeam?.id, true);
      }
    };
    const handleVisibility = () => {
      if (
        document.visibilityState === "visible" &&
        (hubLoadFailedRef.current ||
          !hasLoadedRef.current ||
          getLastLiffCacheInvalidatedAt() > lastAppliedAtRef.current)
      ) {
        void loadHubData(currentTeam?.id, true);
      }
    };

    window.addEventListener(LIFF_CACHE_INVALIDATED_EVENT, handleInvalidated);
    window.addEventListener("popstate", handleBackOrResume);
    window.addEventListener("pageshow", handleBackOrResume);
    window.addEventListener("online", handleBackOrResume);
    window.addEventListener(LIFF_WEBVIEW_RESUMED_EVENT, handleBackOrResume);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener(LIFF_CACHE_INVALIDATED_EVENT, handleInvalidated);
      window.removeEventListener("popstate", handleBackOrResume);
      window.removeEventListener("pageshow", handleBackOrResume);
      window.removeEventListener("online", handleBackOrResume);
      window.removeEventListener(LIFF_WEBVIEW_RESUMED_EVENT, handleBackOrResume);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [currentTeam?.id, loadHubData]);

  const teamName = currentTeam?.name || "チーム";
  const canManageRealTeam = !isDemo && canManageCurrentTeam(currentTeam, false);

  const onboardingSteps = onboardingSummary
    ? [
        {
          id: "players",
          title: "1. 在籍選手を登録する",
          subtitle: "1名ずつ・名簿テキスト一括登録に対応",
          done: onboardingSummary.activePlayerCount > 0,
          href: "/liff/players?add=1",
        },
        {
          id: "grounds",
          title: "2. 活動グラウンドを登録する",
          subtitle: "AI自動取得で駐車場・スパイク規定も設定",
          done: onboardingSummary.venueCount > 0,
          href: "/liff/grounds",
        },
        {
          id: "invite",
          title: "3. LINE招待リンクを共有する",
          subtitle: "保護者・選手・スタッフをチームへ招待",
          done: onboardingSummary.activeMemberCount > 1,
          href: "/liff/admin",
        },
        {
          id: "schedule",
          title: "4. 最初の予定・試合を作成する",
          subtitle: "練習・遠征予定や試合日程を登録",
          done:
            onboardingSummary.hasActivity ||
            events.length > 0 ||
            matches.length > 0,
          href: "/liff/schedule",
        },
      ]
    : [];

  const completedStepCount = onboardingSteps.filter((s) => s.done).length;
  const shouldShowOnboardingCard =
    canManageRealTeam &&
    !isOnboardingDismissed &&
    onboardingSteps.length === 4 &&
    completedStepCount < 4;

  const handleDismissOnboarding = () => {
    setIsOnboardingDismissed(true);
    if (currentTeam?.id && typeof window !== "undefined") {
      try {
        localStorage.setItem(
          `iscore_onboarding_dismissed_${currentTeam.id}`,
          "1"
        );
      } catch {
        // ignore storage errors
      }
    }
  };

  const topSpecialEvents = useMemo<HubSpecialEventSummary[]>(() => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(now.getDate()).padStart(2, "0")}`;

    const source =
      specialEvents.length > 0
        ? specialEvents
        : isDemo && (!isLoadingTeam || currentTeam?.id === "demo-team")
        ? buildDemoSpecialEventsBundle().hubSummaries
        : [];

    const active = source.filter((sp) => {
      if (sp.status === "archived") return false;
      if (
        sp.mode === "rsvp" &&
        sp.eventDate &&
        sp.eventDate < todayStr &&
        sp.status !== "open"
      ) {
        return false;
      }
      return true;
    });

    return [...active]
      .sort((a, b) => {
        const aUnans =
          a.status === "open" && a.isMyHouseholdTarget !== false && !a.myResponded;
        const bUnans =
          b.status === "open" && b.isMyHouseholdTarget !== false && !b.myResponded;
        const aRank = a.status === "open" ? (aUnans ? 0 : 1) : 2;
        const bRank = b.status === "open" ? (bUnans ? 0 : 1) : 2;
        if (aRank !== bRank) return aRank - bRank;
        const aDate = resolveSpecialEventSortDateKey(a);
        const bDate = resolveSpecialEventSortDateKey(b);
        return aDate.localeCompare(bDate);
      })
      .slice(0, 5);
  }, [currentTeam?.id, isDemo, isLoadingTeam, specialEvents]);

  const unansweredSpecialCount = useMemo(
    () =>
      topSpecialEvents.filter(
        (sp) =>
          sp.status === "open" &&
          sp.isMyHouseholdTarget !== false &&
          !sp.myResponded
      ).length,
    [topSpecialEvents]
  );

  const tickerEvents = useMemo<HubEventInputItem[]>(() => {
    if (events.length > 0) return events;
    if (nextEvent && typeof nextEvent === "object") {
      return [nextEvent as HubEventInputItem];
    }
    return [];
  }, [events, nextEvent]);

  return (
    <div className="flex flex-col flex-1">
      {/* 🌟 本家 iScoreCloud と完全統一されたヘッダー（選択チームは全画面で自動維持） */}
      <LiffHeader
        shareData={{
          title: `${teamName} チームHUB`,
          text: `出欠回答、配車表、予定確認、試合動画の閲覧はこちらから！`,
        }}
      />

      {/* 📣 トップページ最上部：流れるチーム状況・案内ティッカー（C案ハイブリッド） */}
      <HubTopNewsTicker
        teamId={currentTeam?.id}
        isDemo={isDemo}
        canManage={canManageCurrentTeam(currentTeam, isDemo)}
        userName={userName}
        practiceMatchLabel={practiceMatchLabel}
        config={hubTickerConfig}
        serverContext={
          isDemo && !hubTickerContext
            ? DEMO_HUB_TICKER_SERVER_CONTEXT
            : hubTickerContext
        }
        events={tickerEvents}
        specialEvents={topSpecialEvents}
        matches={matches}
        onConfigSaved={(nextConfig) => {
          setHubTickerConfig(nextConfig);
          void loadHubData(currentTeam?.id, true);
        }}
      />

      {/* 🌟 上部〜ヒーローセクション */}
      <div className="pb-2">
        <div className="p-4 space-y-5">
          {/* 🌟 デモ体験モード・参加承認待ち時の案内バナー */}
          {isDemo && (
            <section>
              <DemoBanner
                onOpenJoinModal={() => {
                  setJoinModalInitialMode("join");
                  setIsJoinModalOpen(true);
                }}
                onOpenCreateClubModal={() => {
                  setJoinModalInitialMode("create");
                  setIsJoinModalOpen(true);
                }}
                pendingTeams={pendingTeams}
                onRefreshStatus={async () => {
                  await refreshTeams();
                  await loadHubData(undefined, true);
                }}
              />
            </section>
          )}

          {/* 👋 ユーザー挨拶 */}
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xl font-black text-foreground tracking-tight">
              こんにちは、{userName} さん 👋
            </h2>

            <div className="flex items-center gap-1.5">
              {canManageCurrentTeam(currentTeam, isDemo) && (
                <Link
                  href="/liff/admin"
                  className="px-3 py-1.5 rounded-full bg-slate-500/12 hover:bg-slate-500/20 text-slate-700 dark:text-slate-300 border border-slate-500/25 active:scale-95 font-black text-[11px] shadow-2xs transition-all flex items-center gap-1 shrink-0"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>チーム管理</span>
                </Link>
              )}

              {isDemo && (
                <button
                  type="button"
                  onClick={() => {
                    setJoinModalInitialMode("join");
                    setIsJoinModalOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-full bg-primary hover:bg-primary/90 active:scale-95 text-primary-foreground font-black text-[11px] shadow-xs transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>参加・作成</span>
                </button>
              )}

              {!isLoggedIn && (
                <button
                  type="button"
                  onClick={login}
                  className="px-3 py-1.5 rounded-full bg-[#06C755] hover:bg-[#05b34c] active:scale-95 text-white font-black text-[11px] shadow-xs transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <span>LINE連携</span>
                </button>
              )}
            </div>
          </div>

          {/* 🎉 行事・アンケート（登録がある場合のみ「こんにちは、〇〇さん」の直下にコンパクト表示） */}
          {topSpecialEvents.length > 0 && (
            <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
              {/* スリム A-3 ダークキャップ */}
              <div className="px-3 py-1.5 bg-[#0f172a] text-slate-50 border-b-2 border-amber-500 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <PartyPopper className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <h3 className="text-[11px] font-black text-white truncate">
                    行事・アンケート
                  </h3>
                  {unansweredSpecialCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 text-[9.5px] font-black shrink-0">
                      未回答 {unansweredSpecialCount}
                    </span>
                  )}
                </div>

                <Link
                  href="/liff/events"
                  onPointerDown={() => warmupLiffEndpointForHref("/liff/events")}
                  className="text-[10px] font-black text-amber-300 hover:text-white inline-flex items-center gap-0.5 shrink-0"
                >
                  <span>一覧・作成</span>
                  <ChevronRight className="w-3 h-3" />
                </Link>
              </div>

              {/* コンパクト divide-y リスト */}
              <div className="divide-y divide-border bg-card">
                {topSpecialEvents.slice(0, 3).map((sp) => {
                  const cat = getSpecialEventCategoryMeta(sp.category);
                  const isPoll = sp.mode === "date_poll";
                  const compactDeadline = formatSpecialEventCompactDeadline(sp);
                  const nonZeroTiers = (sp.tierTotals || []).filter(
                    (t) => t.totalCount > 0
                  );
                  const compactTierText = nonZeroTiers
                    .map((t) => {
                      const shortName =
                        t.tierId === "adult"
                          ? "大人"
                          : t.tierId === "player"
                          ? "選手"
                          : t.tierId === "junior_high"
                          ? "中高生"
                          : t.tierId === "elementary"
                          ? "小学生"
                          : t.tierId === "preschool_meal"
                          ? "未就学"
                          : t.tierId === "infant_free"
                          ? "乳幼児"
                          : t.label
                              .replace(/（.*?）|\(.*?\)/g, "")
                              .replace(/^兄弟・家族/, "")
                              .trim() || t.label.slice(0, 4);
                      return `${shortName}${t.totalCount}`;
                    })
                    .join("・");

                  return (
                    <Link
                      key={sp.id}
                      href={`/liff/events?id=${encodeURIComponent(sp.id)}`}
                      onPointerDown={() =>
                        warmupLiffEndpointForHref("/liff/events")
                      }
                      className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/45 active:bg-muted/70 transition-colors group"
                    >
                      {/* 左: 50px コンパクト日付・種別ピル */}
                      <div className="w-[50px] min-w-[50px] max-w-[50px] shrink-0 py-1 px-1 rounded-lg flex flex-col items-center justify-center border bg-amber-500/12 text-amber-800 dark:text-amber-300 border-amber-500/30">
                        <span className="text-[10px] font-black leading-tight tracking-tight truncate max-w-full tabular-nums">
                          {isPoll
                            ? "日程調整"
                            : sp.eventDateLabel || "日程未定"}
                        </span>
                        <span className="text-[8.5px] font-bold leading-tight mt-0.5 opacity-90 truncate max-w-full">
                          {cat.icon} {isPoll ? "投票" : cat.shortLabel}
                        </span>
                      </div>

                      {/* 中央: タイトル＋回答状態（1行目）＆ 内訳・期限（2行目） */}
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <h4 className="text-xs font-black text-foreground group-hover:text-primary transition-colors truncate">
                            {sp.title}
                          </h4>
                          <span
                            className={`px-1.5 py-0.2 rounded-full text-[9px] font-black shrink-0 border ${
                              sp.status !== "open" ||
                              sp.isMyHouseholdTarget === false
                                ? "bg-muted text-muted-foreground border-border"
                                : !sp.myResponded
                                ? "bg-amber-500 text-slate-950 border-amber-400"
                                : sp.myOverallState === "attending"
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/35"
                                : "bg-muted text-muted-foreground border-border"
                            }`}
                          >
                            {sp.status !== "open"
                              ? "締切済"
                              : sp.isMyHouseholdTarget === false
                              ? "ご家庭対象"
                              : !sp.myResponded
                              ? "未回答"
                              : sp.myOverallState === "attending"
                              ? isPoll
                                ? "回答済"
                                : `出席${sp.myHeadcount}名`
                              : "欠席"}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-bold text-muted-foreground leading-tight">
                          {isPoll ? (
                            <span className="truncate max-w-full tabular-nums">
                              {sp.topCandidateSummary
                                ? `👑最多 ${sp.topCandidateSummary.dateLabel}（◯${sp.topCandidateSummary.okCount}・約${sp.topCandidateSummary.estimatedHeadcount}名）`
                                : "候補日アンケート受付中"}
                            </span>
                          ) : (
                            <span className="truncate max-w-full tabular-nums">
                              {compactTierText
                                ? `${compactTierText}（${sp.respondedHouseholdCount}/${sp.activeTargetHouseholdCount}世帯）`
                                : `回答 ${sp.respondedHouseholdCount}/${sp.activeTargetHouseholdCount}世帯${
                                    sp.location ? ` ・ ${sp.location}` : ""
                                  }`}
                            </span>
                          )}
                          {compactDeadline && (
                            <span className="shrink-0 text-amber-700 dark:text-amber-300 font-black tabular-nums">
                              {compactDeadline}
                            </span>
                          )}
                        </div>

                        {sp.importantNotice?.trim() && (
                          <p className="text-[9.5px] font-black text-rose-600 dark:text-rose-400 truncate">
                            ⚠️ {sp.importantNotice.trim().replace(/\s+/g, " ")}
                          </p>
                        )}
                      </div>

                      {/* 右: 一目で人数が飛び込むコンパクト人数バッジ */}
                      <div className="flex items-center gap-1 shrink-0">
                        {isPoll ? (
                          <div className="min-w-[54px] px-2 py-1 rounded-xl bg-amber-500/12 border border-amber-500/35 flex flex-col items-center justify-center">
                            <span className="text-[8.5px] font-black text-amber-800 dark:text-amber-300 leading-none">
                              回答世帯
                            </span>
                            <span className="text-sm font-black text-amber-800 dark:text-amber-300 tabular-nums leading-tight mt-0.5">
                              {sp.respondedHouseholdCount}
                              <span className="text-[9.5px] font-bold opacity-80">
                                /{sp.activeTargetHouseholdCount}
                              </span>
                            </span>
                          </div>
                        ) : (
                          <div className="min-w-[54px] px-2 py-1 rounded-xl bg-teal-500/12 border border-teal-500/35 flex flex-col items-center justify-center">
                            <span className="text-[8.5px] font-black text-teal-700 dark:text-teal-300 leading-none">
                              参加予定
                            </span>
                            <span className="text-base font-black text-teal-700 dark:text-teal-300 tabular-nums leading-tight">
                              {sp.totalHeadcount}
                              <span className="text-[9.5px] ml-0.5">名</span>
                            </span>
                          </div>
                        )}
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* 🚀 新規立ち上げチーム向け：初期セットアップ4ステップ（A-3 ソリッド規格） */}
          {shouldShowOnboardingCard && (
            <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
              <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-7 h-7 rounded-xl bg-slate-800 border border-slate-700 text-teal-400 flex items-center justify-center shrink-0">
                    <Sparkles className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-xs font-black text-white truncate">
                      チーム初期セットアップ（{completedStepCount}/4 完了）
                    </h3>
                    <p className="text-[10px] font-bold text-slate-300 truncate">
                      上から順に進めるだけですぐにチーム運用を開始できます
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDismissOnboarding}
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-black inline-flex items-center gap-0.5 shrink-0 cursor-pointer"
                  aria-label="セットアップ案内を閉じる"
                >
                  <X className="w-3 h-3" />
                  <span>閉じる</span>
                </button>
              </div>

              <div className="px-4 pt-3 pb-1 bg-card">
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden border border-border">
                  <div
                    className="h-full bg-teal-500 transition-all duration-300"
                    style={{ width: `${Math.max(8, (completedStepCount / 4) * 100)}%` }}
                  />
                </div>
              </div>

              <div className="p-3 space-y-2 bg-card">
                {onboardingSteps.map((step) => (
                  <Link
                    key={step.id}
                    href={step.href}
                    className={`p-2.5 rounded-xl border flex items-center justify-between gap-2.5 transition-all active:scale-[0.99] ${
                      step.done
                        ? "bg-muted/40 border-border opacity-75"
                        : "bg-card border-border hover:border-primary/40 shadow-2xs"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black shrink-0 ${
                          step.done
                            ? "bg-teal-600 text-white"
                            : "bg-primary/12 text-primary border border-primary/30"
                        }`}
                      >
                        {step.done ? <Check className="w-3.5 h-3.5" /> : "●"}
                      </span>
                      <div className="min-w-0">
                        <span
                          className={`text-xs font-black block truncate ${
                            step.done ? "line-through text-muted-foreground" : "text-foreground"
                          }`}
                        >
                          {step.title}
                        </span>
                        <span className="text-[10.5px] font-bold text-muted-foreground block truncate">
                          {step.subtitle}
                        </span>
                      </div>
                    </div>

                    <span className="shrink-0 flex items-center gap-1 text-[11px] font-black text-primary">
                      <span>{step.done ? "完了" : "設定へ"}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* 🌟 ヒーローセクション または 初期読込エラーカード */}
          <section>
            {!hasLoaded && loadError ? (
              <LiffDataLoadErrorCard
                title="ホームデータを読み込めませんでした"
                onRetry={() => void loadHubData(currentTeam?.id, true)}
                isRetrying={isLoading}
              />
            ) : (
              <HubHeroSection
                teamName={scoreTeamName}
                isDemo={isDemo}
                userId={profile?.userId || undefined}
                userName={userName || undefined}
                nextEvent={nextEvent as never}
                eventsList={events}
                latestMatch={matches[0] || null}
                isLoading={isLoading && !hasLoaded}
                attendanceStatusConfig={attendanceStatusConfig}
                onRefreshHub={() => void loadHubData(currentTeam?.id, true)}
              />
            )}
          </section>
        </div>
      </div>

      {/* 🚀 メインコンテンツエリア */}
      <div className="p-4 pt-1 space-y-6">
        {/* 🚀 クイックメニュー（配車・動画・予定・MAP・書類・Q&A） */}
        <section>
          <HubQuickNav />
        </section>

        {/* 📅 チームカレンダー（月間カレンダー ＆ 直近スケジュール一覧） */}
        <section>
          <HubCalendarSection
            eventsList={events}
            specialEvents={specialEvents}
            isDemo={isDemo}
          />
        </section>

        <div
          className="h-8 w-full shrink-0 pointer-events-none select-none"
          aria-hidden="true"
        />
      </div>

      {/* チーム参加申請・新規チーム作成モーダル */}
      {isJoinModalOpen && (
        <JoinTeamModal
          isOpen={isJoinModalOpen}
          initialMode={joinModalInitialMode}
          onClose={() => {
            clearPendingJoinCode();
            setIsJoinModalOpen(false);
          }}
          onSuccess={({ status, teamId }) => {
            clearPendingJoinCode();
            void refreshTeams();
            if (status === "active") {
              setIsJoinModalOpen(false);
              void loadHubData(teamId || currentTeam?.id, true);
            }
          }}
        />
      )}
    </div>
  );
}
