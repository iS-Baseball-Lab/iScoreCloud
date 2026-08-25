// filepath: src/app/liff/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { HubHeroCard, type LiffViewMode } from "@/components/liff/HubHeroCard";
import { HubQuickNav } from "@/components/liff/HubQuickNav";
import { MatchScoreCard, type MatchCardData } from "@/components/liff/MatchScoreCard";
import { extractYouTubeVideoId } from "@/lib/youtube";
import { useLiff } from "@/components/liff/LiffProvider";
import { Video, ChevronRight, User, Users2 } from "lucide-react";

export default function LiffHubPage() {
  const { profile } = useLiff();
  const [viewMode, setViewMode] = useState<LiffViewMode>("player");
  const [userName, setUserName] = useState<string>("メンバー");
  const [teamName, setTeamName] = useState<string>("i-Score チーム");
  const [matches, setMatches] = useState<MatchCardData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // ローカルストレージまたは初期ロールからモードを復元
  useEffect(() => {
    const savedMode = localStorage.getItem("iscore_liff_view_mode") as LiffViewMode;
    if (savedMode === "player" || savedMode === "parent") {
      setViewMode(savedMode);
    }
  }, []);

  const handleModeChange = (mode: LiffViewMode) => {
    setViewMode(mode);
    localStorage.setItem("iscore_liff_view_mode", mode);
  };

  useEffect(() => {
    // 1. プロフィール名が取得できた場合は優先反映
    if (profile?.displayName) {
      setUserName(profile.displayName);
    }
  }, [profile]);

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        const urlParams = new URLSearchParams(window.location.search);
        let targetTeamId = urlParams.get("teamId") || localStorage.getItem("iscore_selectedTeamId");
        const queryTeamName = urlParams.get("teamName");

        if (queryTeamName) {
          setTeamName(decodeURIComponent(queryTeamName));
        }

        // ユーザー認証・チーム情報の取得
        const meRes = await fetch("/api/auth/me");
        if (meRes.ok) {
          const meData = (await meRes.json()) as {
            data?: {
              user?: { name?: string };
              memberships?: { teamId: string; teamName: string; memberType?: string }[];
            };
          };

          // ユーザー名の反映（LIFFプロフィールがまだない場合）
          if (meData.data?.user?.name && !profile?.displayName) {
            setUserName(meData.data.user.name);
          }

          const firstTeam = meData.data?.memberships?.[0];
          if (firstTeam) {
            if (!targetTeamId) {
              targetTeamId = firstTeam.teamId;
            }
            if (!queryTeamName) {
              setTeamName(firstTeam.teamName);
            }
            // memberType が parent なら初期表示を保護者モードに
            if (firstTeam.memberType === "parent" && !localStorage.getItem("iscore_liff_view_mode")) {
              setViewMode("parent");
            }
          }
        }

        // 試合一覧データの取得
        if (targetTeamId) {
          const res = await fetch(`/api/matches?teamId=${targetTeamId}`);
          if (res.ok) {
            const data = (await res.json()) as MatchCardData[];
            setMatches(Array.isArray(data) ? data : []);
          }
        }
      } catch (error) {
        console.error("Failed to load hub data:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [profile]);

  // 最新の動画付き試合
  const latestVideoMatch = matches.find((m) => !!extractYouTubeVideoId(m.youtubeUrl));

  // モード切り替えスイッチ
  const ModeSwitch = (
    <div className="flex items-center p-0.5 bg-muted/80 rounded-xl border border-border">
      <button
        type="button"
        onClick={() => handleModeChange("player")}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black transition-all ${
          viewMode === "player"
            ? "bg-card text-foreground shadow-xs"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <User className="w-3 h-3" />
        <span>選手</span>
      </button>
      <button
        type="button"
        onClick={() => handleModeChange("parent")}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black transition-all ${
          viewMode === "parent"
            ? "bg-card text-blue-600 dark:text-blue-400 shadow-xs"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Users2 className="w-3 h-3" />
        <span>保護者</span>
      </button>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen">
      <LiffHeader
        title={teamName}
        subtitle="チームHUB"
        rightElement={ModeSwitch}
        shareData={{
          title: `${teamName} チームHUB`,
          text: `出欠回答、予定確認、試合動画の閲覧はこちらから！`,
        }}
      />

      <div className="p-4 space-y-6">
        {/* 👋 ユーザー挨拶 & 役割ステータス */}
        <div className="flex items-center justify-between px-1">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-muted-foreground">
              {viewMode === "parent" ? "保護者モード表示中" : "選手モード表示中"}
            </span>
            <h2 className="text-lg font-black text-foreground tracking-tight">
              こんにちは、{userName} さん 👋
            </h2>
          </div>
        </div>

        {/* 🌟 ヒーローセクション：次回予定 & 出欠（選手・保護者で内容分岐） */}
        <section>
          <HubHeroCard
            viewMode={viewMode}
            teamName={teamName}
          />
        </section>

        {/* 🚀 クイックメニュー（2x2タイル） */}
        <section>
          <HubQuickNav viewMode={viewMode} />
        </section>

        {/* 🎬 最新の試合動画ハイライト */}
        {latestVideoMatch && (
          <section className="space-y-3 pt-1 border-t border-border/50">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5 text-xs font-black text-foreground">
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
    </div>
  );
}
