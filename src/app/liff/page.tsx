// filepath: src/app/liff/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { HubHeroSection } from "@/components/liff/HubHeroSection";
import { HubQuickNav } from "@/components/liff/HubQuickNav";
import { HubCalendarSection } from "@/components/liff/HubCalendarSection";
import type { MatchCardData } from "@/components/liff/MatchScoreCard";
import { useLiff, useScoreTeamDisplayName } from "@/components/liff/LiffProvider";
import {
  LIFF_CACHE_INVALIDATED_EVENT,
  buildLiffHubUrl,
  fetchLiffJsonSWR,
  getLastLiffCacheInvalidatedAt,
  peekLiffApiCache,
} from "@/lib/liff/api-cache";
import {
  normalizeGroupStatusSummaryConfig,
  type GroupStatusConfigSummary,
} from "@/lib/liff/group-attendance";
import type { HubEventInputItem } from "@/components/liff/HubHeroSection";
import Link from "next/link";
import dynamic from "next/dynamic";
import { UserPlus, ShieldCheck } from "lucide-react";
import { DemoBanner } from "@/components/liff/DemoBanner";

const JoinTeamModal = dynamic(
  () => import("@/components/liff/JoinTeamModal").then((m) => m.JoinTeamModal),
  { ssr: false }
);

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
  matches?: MatchCardData[];
  attendanceStatusConfig?: unknown;
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
  const [matches, setMatches] = useState<MatchCardData[]>(
    Array.isArray(initialCached?.matches) ? initialCached!.matches! : []
  );
  const [attendanceStatusConfig, setAttendanceStatusConfig] = useState<GroupStatusConfigSummary>(() =>
    normalizeGroupStatusSummaryConfig(initialCached?.attendanceStatusConfig)
  );
  const [isLoading, setIsLoading] = useState<boolean>(!initialCached);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const hasLoadedRef = useRef<boolean>(Boolean(initialCached));
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
      setIsJoinModalOpen(true);
    }
  }, [shouldOpenJoinModal]);

  const applyHubData = useCallback((data: HubDataResponse) => {
    setNextEvent(data.nextEvent ?? null);
    setEvents(Array.isArray(data.events) ? data.events : []);
    setMatches(Array.isArray(data.matches) ? data.matches : []);
    setAttendanceStatusConfig(normalizeGroupStatusSummaryConfig(data.attendanceStatusConfig));
    hasLoadedRef.current = true;
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
      if (cached) {
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
        setMatches([]);
        setNextEvent(null);
        hasLoadedRef.current = false;
      }
    }
    prevTeamIdRef.current = currentId;
    const needsForce = getLastLiffCacheInvalidatedAt() > lastAppliedAtRef.current;
    void loadHubData(currentId, needsForce);
  }, [currentTeam?.id, loadHubData, profile?.displayName, profile?.userId]);

  // 試合詳細・予定編集・出欠登録など下層画面で保存して「戻る」で復帰した際も即時最新データを反映
  useEffect(() => {
    const handleInvalidated = () => {
      void loadHubData(currentTeam?.id, true);
    };
    const handleBackOrShow = () => {
      if (getLastLiffCacheInvalidatedAt() > lastAppliedAtRef.current) {
        void loadHubData(currentTeam?.id, true);
      }
    };
    const handleVisibility = () => {
      if (
        document.visibilityState === "visible" &&
        getLastLiffCacheInvalidatedAt() > lastAppliedAtRef.current
      ) {
        void loadHubData(currentTeam?.id, true);
      }
    };

    window.addEventListener(LIFF_CACHE_INVALIDATED_EVENT, handleInvalidated);
    window.addEventListener("popstate", handleBackOrShow);
    window.addEventListener("pageshow", handleBackOrShow);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener(LIFF_CACHE_INVALIDATED_EVENT, handleInvalidated);
      window.removeEventListener("popstate", handleBackOrShow);
      window.removeEventListener("pageshow", handleBackOrShow);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [currentTeam?.id, loadHubData]);

  const teamName = currentTeam?.name || "チーム";

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
                onOpenJoinModal={() => setIsJoinModalOpen(true)}
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
              <Link
                href="/liff/admin"
                className="px-3 py-1.5 rounded-full bg-slate-500/12 hover:bg-slate-500/20 text-slate-700 dark:text-slate-300 border border-slate-500/25 active:scale-95 font-black text-[11px] shadow-2xs transition-all flex items-center gap-1 shrink-0"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>IT管理</span>
              </Link>

              {isDemo && (
                <button
                  type="button"
                  onClick={() => setIsJoinModalOpen(true)}
                  className="px-3 py-1.5 rounded-full bg-primary hover:bg-primary/90 active:scale-95 text-primary-foreground font-black text-[11px] shadow-xs transition-all flex items-center gap-1 shrink-0"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>参加申請</span>
                </button>
              )}

              {!isLoggedIn && (
                <button
                  type="button"
                  onClick={login}
                  className="px-3 py-1.5 rounded-full bg-[#06C755] hover:bg-[#05b34c] active:scale-95 text-white font-black text-[11px] shadow-xs transition-all flex items-center gap-1 shrink-0"
                >
                  <span>LINE連携</span>
                </button>
              )}
            </div>
          </div>

          {/* 🌟 ヒーローセクション：タブ切り替え（直近の試合 / 直近の予定） */}
          <section>
            <HubHeroSection
              teamName={scoreTeamName}
              isDemo={isDemo}
              userId={profile?.userId || undefined}
              userName={userName || undefined}
              nextEvent={nextEvent as never}
              eventsList={events}
              latestMatch={matches[0] || null}
              isLoading={isLoading && !hasLoadedRef.current}
              attendanceStatusConfig={attendanceStatusConfig}
              onRefreshHub={() => void loadHubData(currentTeam?.id, true)}
            />
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
          <HubCalendarSection eventsList={events} isDemo={isDemo} />
        </section>

        <div className="h-8 w-full shrink-0" aria-hidden="true" />
      </div>

      {/* チーム参加申請モーダル */}
      {isJoinModalOpen && (
        <JoinTeamModal
          isOpen={isJoinModalOpen}
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
