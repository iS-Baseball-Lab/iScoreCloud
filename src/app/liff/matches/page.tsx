// filepath: src/app/liff/matches/page.tsx
"use client";

import React, { useState, useEffect, Suspense, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { YouTubePlayer } from "@/components/liff/YouTubePlayer";
import { MatchScoreCard, type MatchCardData } from "@/components/liff/MatchScoreCard";
import { Match } from "@/types/match";
import { useLiff } from "@/components/liff/LiffProvider";
import { Calendar, MapPin, Trophy, Users, Shield, Loader2, Video, Filter } from "lucide-react";
import { EmptyState } from "@/components/layout/EmptyState";
import { extractYouTubeVideoId } from "@/lib/youtube";

function MatchesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const matchId = searchParams.get("id");
  const { currentTeam, isLoadingTeam } = useLiff();

  // 単一試合詳細用ステート
  const [match, setMatch] = useState<Match | null>(null);
  const [lineup, setLineup] = useState<any[]>([]);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // 試合一覧用ステート
  const [matchesList, setMatchesList] = useState<MatchCardData[]>([]);
  const [isListLoading, setIsListLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "video" | "official">("all");

  // 1. 試合詳細のロード (matchId がある場合)
  useEffect(() => {
    if (!matchId) return;

    async function loadMatch() {
      try {
        setIsDetailLoading(true);
        const res = await fetch(`/api/matches/${matchId}`);
        if (!res.ok) {
          throw new Error("試合データの取得に失敗しました");
        }
        const data = (await res.json()) as { success?: boolean; match?: Match & { lineups?: any[] }; error?: string };
        if (data.match) {
          setMatch(data.match);
          if (data.match.lineups) {
            setLineup(data.match.lineups);
          }
        } else {
          throw new Error(data.error || "試合が見つかりませんでした");
        }
      } catch (err: any) {
        console.error("Error loading match detail:", err);
        setDetailError(err.message || "エラーが発生しました");
      } finally {
        setIsDetailLoading(false);
      }
    }

    loadMatch();
  }, [matchId]);

  // 2. 試合一覧のロード (matchId がない場合、選択中チームに応じてフェッチ)
  const loadMatchesList = useCallback(async () => {
    if (matchId) return;
    if (isLoadingTeam && !currentTeam?.id) return;

    try {
      setIsListLoading(true);
      const teamParam = currentTeam?.id ? `?teamId=${currentTeam.id}` : "";
      const res = await fetch(`/api/liff/matches${teamParam}`);
      if (res.ok) {
        const data = (await res.json()) as { success?: boolean; matches?: MatchCardData[] };
        if (Array.isArray(data.matches)) {
          setMatchesList(data.matches);
        } else {
          setMatchesList([]);
        }
      }
    } catch (err) {
      console.error("Error loading matches list:", err);
    } finally {
      setIsListLoading(false);
    }
  }, [matchId, currentTeam?.id, isLoadingTeam]);

  useEffect(() => {
    loadMatchesList();
  }, [loadMatchesList]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🅰️ 試合詳細画面 (matchId が指定されている場合)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (matchId) {
    if (isDetailLoading) {
      return (
        <div className="flex flex-col min-h-screen">
          <LiffHeader />
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted-foreground gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm font-bold">試合データを読み込み中...</p>
          </div>
        </div>
      );
    }

    if (detailError || !match) {
      return (
        <div className="flex flex-col min-h-screen">
          <LiffHeader />
          <div className="p-6 space-y-4">
            <LiffPageHeader title="試合情報" showBack />
            <EmptyState
              icon={Shield}
              title="試合が見つかりませんでした"
              description={detailError || "指定された試合が存在しないか、削除された可能性があります"}
            />
          </div>
        </div>
      );
    }

    // スコアボード用のイニング配列
    const inningsCount = match.innings || 7;
    const inningsArray = Array.from({ length: inningsCount }, (_, i) => i + 1);

    const parseScores = (raw: any): (number | null)[] => {
      if (Array.isArray(raw)) return raw;
      if (typeof raw === "string") {
        try {
          return JSON.parse(raw);
        } catch {
          return [];
        }
      }
      return [];
    };

    const myInningScores = parseScores(match.myInningScores);
    const opponentInningScores = parseScores(match.opponentInningScores);

    const isFinished = match.status === "finished";
    const isWin = isFinished && match.myScore > match.opponentScore;
    const isLose = isFinished && match.myScore < match.opponentScore;

    const shareText = `【試合結果】\nvs ${match.opponent}\n${match.myScore} - ${match.opponentScore} (${isWin ? "勝利 🏆" : isLose ? "敗戦" : "引分"})\n📅 ${match.date}${match.venueName ? `\n📍 ${match.venueName}` : ""}`;

    return (
      <div className="flex flex-col min-h-screen">
        <LiffHeader />

        <div className="p-4 space-y-5">
          {/* ページ内ヘッダー */}
          <LiffPageHeader
            title={`vs ${match.opponent}`}
            subtitle={`${match.date} ${match.venueName ? `• ${match.venueName}` : ""}`}
            icon={
              <span className="w-8 h-8 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center font-black">
                <Video className="w-4 h-4" />
              </span>
            }
            showBack
            shareData={{
              title: `vs ${match.opponent} 試合情報 & 動画`,
              text: shareText,
            }}
          />

          {/* 📹 試合動画（YouTube 限定公開プレイヤー） */}
          {match.youtubeUrl ? (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-1.5 text-xs font-black text-foreground">
                  <Video className="w-4 h-4 text-red-500" />
                  <span>試合映像 (YouTube限定公開)</span>
                </h2>
              </div>

              <YouTubePlayer
                url={match.youtubeUrl}
                title={`vs ${match.opponent} (${match.date}) 試合動画`}
              />
            </section>
          ) : (
            <div className="p-4 rounded-2xl bg-muted/40 border border-border text-center text-xs font-bold text-muted-foreground">
              📹 この試合には動画リンクが設定されていません
            </div>
          )}

          {/* ⚾️ スコアボード */}
          <section className="bg-card border border-border rounded-3xl p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black text-foreground tracking-tight">
                スコアボード
              </h2>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                isWin
                  ? "bg-emerald-500/10 text-emerald-600"
                  : isLose
                  ? "bg-rose-500/10 text-rose-600"
                  : "bg-muted text-muted-foreground"
              }`}>
                {isFinished ? (isWin ? "勝利" : isLose ? "敗戦" : "引分") : "試合中"}
              </span>
            </div>

            <div className="overflow-x-auto -mx-2 px-2 scrollbar-none">
              <table className="w-full text-center border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border/60 text-muted-foreground font-black text-[11px]">
                    <th className="py-2 text-left px-2 min-w-[90px]">チーム</th>
                    {inningsArray.map((i) => (
                      <th key={i} className="py-2 px-2 min-w-[24px]">
                        {i}
                      </th>
                    ))}
                    <th className="py-2 px-2 font-black text-foreground border-l border-border/40 min-w-[28px]">
                      計
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 font-bold">
                  {/* 自チーム */}
                  <tr>
                    <td className="py-2.5 text-left px-2 font-black text-foreground truncate max-w-[110px]">
                      {currentTeam?.shortName || "自チーム"}
                    </td>
                    {inningsArray.map((_, i) => (
                      <td key={i} className="py-2.5 px-2 text-muted-foreground">
                        {myInningScores[i] !== undefined && myInningScores[i] !== null
                          ? myInningScores[i]
                          : "-"}
                      </td>
                    ))}
                    <td className="py-2.5 px-2 font-black text-base text-primary border-l border-border/40">
                      {match.myScore}
                    </td>
                  </tr>

                  {/* 相手チーム */}
                  <tr>
                    <td className="py-2.5 text-left px-2 font-black text-foreground truncate max-w-[110px]">
                      {match.opponent}
                    </td>
                    {inningsArray.map((_, i) => (
                      <td key={i} className="py-2.5 px-2 text-muted-foreground">
                        {opponentInningScores[i] !== undefined && opponentInningScores[i] !== null
                          ? opponentInningScores[i]
                          : "-"}
                      </td>
                    ))}
                    <td className="py-2.5 px-2 font-black text-base text-foreground border-l border-border/40">
                      {match.opponentScore}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🅱️ 試合一覧画面 (matchId がない場合)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const filteredMatches = matchesList.filter((m) => {
    if (filter === "video") return !!extractYouTubeVideoId(m.youtubeUrl);
    if (filter === "official") return m.matchType === "official" || m.matchType === "tournament";
    return true;
  });

  const videoMatchesCount = matchesList.filter((m) => !!extractYouTubeVideoId(m.youtubeUrl)).length;

  return (
    <div className="flex flex-col min-h-screen">
      <LiffHeader />

      <div className="p-4 space-y-5">
        {/* ページ内ヘッダー */}
        <LiffPageHeader
          title="試合情報"
          subtitle="ハイライト動画 & スコアボード"
          icon={
            <span className="w-8 h-8 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center font-black">
              <Video className="w-4 h-4" />
            </span>
          }
          showBack
          shareData={{
            title: `【試合情報】${currentTeam?.name || "チーム"} 試合一覧`,
            text: `試合ハイライト動画・スコアボードはこちらから確認できます！`,
          }}
        />

        {/* フィルタータブ */}
        <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-2xl border border-border">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`flex-1 py-1.5 rounded-xl text-xs font-black transition-all ${
              filter === "all"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            すべて ({matchesList.length})
          </button>

          <button
            type="button"
            onClick={() => setFilter("video")}
            className={`flex-1 py-1.5 rounded-xl text-xs font-black transition-all ${
              filter === "video"
                ? "bg-card text-red-600 dark:text-red-400 shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            📹 動画あり ({videoMatchesCount})
          </button>

          <button
            type="button"
            onClick={() => setFilter("official")}
            className={`flex-1 py-1.5 rounded-xl text-xs font-black transition-all ${
              filter === "official"
                ? "bg-card text-primary shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            🏆 公式戦
          </button>
        </div>

        {/* 試合カード一覧 */}
        {isListLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-xs font-bold">試合データを読み込み中...</p>
          </div>
        ) : filteredMatches.length === 0 ? (
          <div className="py-12">
            <EmptyState
              icon={Shield}
              title="試合データがありません"
              description="該当する試合がまだ登録されていないか、フィルター条件に一致しません"
            />
          </div>
        ) : (
          <div className="space-y-3.5">
            {filteredMatches.map((m) => (
              <MatchScoreCard key={m.id} match={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function LiffMatchesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col min-h-screen">
          <LiffHeader />
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted-foreground gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm font-bold">読み込み中...</p>
          </div>
        </div>
      }
    >
      <MatchesContent />
    </Suspense>
  );
}
