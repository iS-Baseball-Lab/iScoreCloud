// filepath: src/app/liff/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { MatchScoreCard, type MatchCardData } from "@/components/liff/MatchScoreCard";
import { YouTubePlayer } from "@/components/liff/YouTubePlayer";
import { extractYouTubeVideoId } from "@/lib/youtube";
import { Swords, Video, Trophy, Filter, Loader2, Sparkles } from "lucide-react";
import { EmptyState } from "@/components/layout/EmptyState";

export default function LiffHomePage() {
  const [matches, setMatches] = useState<MatchCardData[]>([]);
  const [teamName, setTeamName] = useState<string>("チーム試合情報");
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "video" | "win">("all");

  useEffect(() => {
    async function loadMatches() {
      try {
        setIsLoading(true);
        // チームIDの取得（URLクエリパラメータ、localStorage、または最新チームから）
        const urlParams = new URLSearchParams(window.location.search);
        let targetTeamId = urlParams.get("teamId") || localStorage.getItem("iscore_selectedTeamId");

        if (!targetTeamId) {
          // チーム一覧または認証情報から取得を試みる
          const meRes = await fetch("/api/auth/me");
          if (meRes.ok) {
            const meData = (await meRes.json()) as { data?: { memberships?: { teamId: string; teamName: string }[] } };
            const firstTeam = meData.data?.memberships?.[0];
            if (firstTeam) {
              targetTeamId = firstTeam.teamId;
              setTeamName(firstTeam.teamName);
            }
          }
        }

        if (targetTeamId) {
          const res = await fetch(`/api/matches?teamId=${targetTeamId}`);
          if (res.ok) {
            const data = (await res.json()) as MatchCardData[];
            setMatches(Array.isArray(data) ? data : []);
          }
        }
      } catch (error) {
        console.error("Failed to load LIFF matches:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadMatches();
  }, []);

  // フィルタリング
  const filteredMatches = matches.filter((m) => {
    if (filter === "video") {
      return !!extractYouTubeVideoId(m.youtubeUrl);
    }
    if (filter === "win") {
      return m.status === "finished" && m.myScore > m.opponentScore;
    }
    return true;
  });

  // 最新の動画付き試合をピックアップ
  const latestVideoMatch = matches.find((m) => !!extractYouTubeVideoId(m.youtubeUrl));

  return (
    <div className="flex flex-col min-h-screen">
      <LiffHeader
        title={teamName}
        subtitle="試合一覧・動画アーカイブ"
        shareData={{
          title: `${teamName} の試合情報・動画アーカイブ`,
          text: `最新の試合結果や限定公開YouTube動画をチェックしよう！`,
        }}
      />

      <div className="p-4 space-y-5">
        {/* 🌟 ピックアップ動画（最新の動画付き試合） */}
        {!isLoading && latestVideoMatch && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-black text-foreground">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-600 text-white text-[10px]">
                  ▶
                </span>
                <span>最新の試合動画</span>
              </div>
              <span className="text-[11px] font-bold text-muted-foreground">
                vs {latestVideoMatch.opponent} ({latestVideoMatch.date})
              </span>
            </div>

            <YouTubePlayer
              url={latestVideoMatch.youtubeUrl}
              title={`vs ${latestVideoMatch.opponent} (${latestVideoMatch.date})`}
            />
          </section>
        )}

        {/* フィルタータブ */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
          <div className="flex items-center gap-1.5 p-1 bg-muted/50 rounded-xl border border-border/60">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                filter === "all"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              全試合 ({matches.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("video")}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                filter === "video"
                  ? "bg-card text-red-600 dark:text-red-400 shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>動画あり</span>
            </button>
            <button
              type="button"
              onClick={() => setFilter("win")}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                filter === "win"
                  ? "bg-card text-emerald-600 dark:text-emerald-400 shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>勝利試合</span>
            </button>
          </div>
        </div>

        {/* 試合カードリスト */}
        <section className="space-y-3">
          {isLoading ? (
            <div className="space-y-3 py-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 w-full rounded-2xl bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : filteredMatches.length === 0 ? (
            <div className="py-8">
              <EmptyState
                icon={Swords}
                title="該当する試合がありません"
                description={filter === "video" ? "動画が登録されている試合はまだありません" : "No matches found"}
              />
            </div>
          ) : (
            filteredMatches.map((match) => (
              <MatchScoreCard key={match.id} match={match} />
            ))
          )}
        </section>
      </div>
    </div>
  );
}
