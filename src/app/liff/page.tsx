// filepath: src/app/liff/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { HubHeroSection } from "@/components/liff/HubHeroSection";
import { HubQuickNav } from "@/components/liff/HubQuickNav";
import { HubCalendarSection } from "@/components/liff/HubCalendarSection";
import { LiffDataLoadErrorCard } from "@/components/liff/LiffDataLoadErrorCard";
import type { MatchCardData } from "@/components/liff/MatchScoreCard";
import {
  canManageCurrentTeam,
  useLiff,
  useScoreTeamDisplayName,
} from "@/components/liff/LiffProvider";
import {
  LIFF_CACHE_INVALIDATED_EVENT,
  buildLiffHubUrl,
  fetchLiffJsonSWR,
  getLastLiffCacheInvalidatedAt,
  peekLiffApiCache,
} from "@/lib/liff/api-cache";
import { LIFF_WEBVIEW_RESUMED_EVENT } from "@/lib/liff/runtime-recovery";
import {
  normalizeGroupStatusSummaryConfig,
  type GroupStatusConfigSummary,
} from "@/lib/liff/group-attendance";
import type { HubSpecialEventSummary } from "@/lib/liff/special-events-schema";
import type { HubEventInputItem } from "@/components/liff/HubHeroSection";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  UserPlus,
  ShieldCheck,
  Check,
  ChevronRight,
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

  return (
    <div className="flex flex-col flex-1">
      {/* 🌟 本家 iScoreCloud と完全統一されたヘッダー（選択チームは全画面で自動維持） */}
      <LiffHeader
        shareData={{
          title: `${teamName} チームHUB`,
          text: `出欠回答、配車表、予定確認、試合動画の閲覧はこちらから！`,
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
