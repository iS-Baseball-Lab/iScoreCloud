// filepath: src/app/liff/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { HubHeroCard } from "@/components/liff/HubHeroCard";
import { HubQuickNav } from "@/components/liff/HubQuickNav";
import { MatchScoreCard, type MatchCardData } from "@/components/liff/MatchScoreCard";
import { extractYouTubeVideoId } from "@/lib/youtube";
import { useLiff } from "@/components/liff/LiffProvider";
import { Video, ChevronRight, UserPlus } from "lucide-react";
import { DemoBanner } from "@/components/liff/DemoBanner";
import { JoinTeamModal } from "@/components/liff/JoinTeamModal";

interface HubDataResponse {
  success: boolean;
  liffId?: string;
  team?: {
    id: string | null;
    name: string;
    shortName: string;
    homeGround?: string | null;
  };
  nextEvent?: any;
  matches?: MatchCardData[];
}

export default function LiffHubPage() {
  const { profile, currentTeam, selectTeam, isLoadingTeam, isLoggedIn, login, isDemo, refreshTeams } = useLiff();
  const [userName, setUserName] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("iscore_user_name") || "メンバー";
    }
    return "メンバー";
  });
  const [nextEvent, setNextEvent] = useState<any>(null);
  const [matches, setMatches] = useState<MatchCardData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);

  // LINEプロフィール取得時の名前反映
  useEffect(() => {
    if (profile?.displayName) {
      setUserName(profile.displayName);
    }
  }, [profile?.displayName]);

  // DBからチーム情報・次回予定・試合一覧を完全自動取得（currentTeam.id に応じて連動）
  const loadHubData = useCallback(async (teamId?: string) => {
    if (isLoadingTeam && !currentTeam?.id) return;

    try {
      setIsLoading(true);
      const targetTeamId = teamId || currentTeam?.id;
      const endpoint = targetTeamId ? `/api/liff/hub?teamId=${targetTeamId}` : `/api/liff/hub`;
      const res = await fetch(endpoint);

      if (res.ok) {
        const data = (await res.json()) as HubDataResponse;
        if (data.nextEvent) {
          setNextEvent(data.nextEvent);
        } else {
          setNextEvent(null);
        }
        if (Array.isArray(data.matches)) {
          setMatches(data.matches);
        } else {
          setMatches([]);
        }
      }
    } catch (error) {
      console.error("Failed to load hub data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTeam?.id, isLoadingTeam]);

  useEffect(() => {
    loadHubData();
  }, [loadHubData]);

  const teamName = currentTeam?.name || "チーム";

  // 最新の動画付き試合
  const latestVideoMatch = matches.find((m) => !!extractYouTubeVideoId(m.youtubeUrl));

  return (
    <div className="flex flex-col min-h-screen">
      {/* 🌟 本家 iScoreCloud と完全統一されたヘッダー（選択チームは全画面で自動維持） */}
      <LiffHeader
        shareData={{
          title: `${teamName} チームHUB`,
          text: `出欠回答、配車表、予定確認、試合動画の閲覧はこちらから！`,
        }}
      />

      {/* 🌟 上部〜ヒーローセクション：薄いプライマリーカラー背景ゾーン */}
      <div className="bg-gradient-to-b from-primary/12 via-primary/6 to-transparent pb-2">
        <div className="p-4 space-y-5">
          {/* 🌟 デモ体験モード時の案内バナー */}
          {isDemo && (
            <section>
              <DemoBanner onOpenJoinModal={() => setIsJoinModalOpen(true)} />
            </section>
          )}

          {/* 👋 ユーザー挨拶 */}
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xl font-black text-foreground tracking-tight">
              こんにちは、{userName} さん 👋
            </h2>

            <div className="flex items-center gap-1.5">
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
                  className="px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-[11px] shadow-xs transition-all flex items-center gap-1 shrink-0"
                >
                  <span>LINE連携</span>
                </button>
              )}
            </div>
          </div>

          {/* 🌟 ヒーローセクション：次回予定 & ワンタップ出欠 */}
          <section>
            <HubHeroCard
              teamName={teamName}
              nextEvent={nextEvent}
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

        {/* 🎬 最新の試合動画ハイライト */}
        {latestVideoMatch && (
          <section className="space-y-3 pt-2 border-t border-border/50">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5 text-sm font-black text-foreground">
                <Video className="w-4 h-4 text-red-500" />
                <span>最新の試合動画</span>
              </div>

              <a
                href="/liff/matches"
                className="flex items-center gap-0.5 text-xs font-black text-primary hover:underline"
              >
                <span>一覧を見る</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </a>
            </div>

            <MatchScoreCard match={latestVideoMatch} />
          </section>
        )}
      </div>

      {/* チーム参加申請モーダル */}
      <JoinTeamModal
        isOpen={isJoinModalOpen}
        onClose={() => setIsJoinModalOpen(false)}
        onSuccess={() => {
          setIsJoinModalOpen(false);
          refreshTeams();
          loadHubData();
        }}
      />
    </div>
  );
}
