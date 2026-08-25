// filepath: src/app/liff/matches/page.tsx
"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { YouTubePlayer } from "@/components/liff/YouTubePlayer";
import { Match } from "@/types/match";
import { Calendar, MapPin, Trophy, Users, Shield, Loader2, Video } from "lucide-react";
import { EmptyState } from "@/components/layout/EmptyState";

function MatchDetailContent() {
  const searchParams = useSearchParams();
  const matchId = searchParams.get("id");

  const [match, setMatch] = useState<Match | null>(null);
  const [lineup, setLineup] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!matchId) {
      setError("試合IDが指定されていません");
      setIsLoading(false);
      return;
    }

    async function loadMatch() {
      try {
        setIsLoading(true);
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
        setError(err.message || "エラーが発生しました");
      } finally {
        setIsLoading(false);
      }
    }

    loadMatch();
  }, [matchId]);

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen">
        <LiffHeader title="試合情報" showBack />
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted-foreground gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm font-bold">試合データを読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error || !match) {
    return (
      <div className="flex flex-col min-h-screen">
        <LiffHeader title="試合情報" showBack />
        <div className="p-6">
          <EmptyState
            icon={Shield}
            title="試合が見つかりませんでした"
            description={error || "指定された試合が存在しないか、削除された可能性があります"}
          />
        </div>
      </div>
    );
  }

  // スコアボード用のイニング配列
  const inningsCount = match.innings || 7;
  const inningsArray = Array.from({ length: inningsCount }, (_, i) => i + 1);

  // 得点パース
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
  const isDraw = isFinished && match.myScore === match.opponentScore;

  const shareText = `【試合結果】\nvs ${match.opponent}\n${match.myScore} - ${match.opponentScore} (${isWin ? "勝利 🏆" : isLose ? "敗戦" : "引分"})\n📅 ${match.date}${match.venueName ? `\n📍 ${match.venueName}` : ""}`;

  return (
    <div className="flex flex-col min-h-screen">
      <LiffHeader
        title={`vs ${match.opponent}`}
        subtitle={`${match.date} ${match.venueName ? `• ${match.venueName}` : ""}`}
        showBack
        shareData={{
          title: `vs ${match.opponent} 試合情報 & 動画`,
          text: shareText,
        }}
      />

      <div className="p-4 space-y-5">
        {/* 📹 試合動画（YouTube 限定公開プレイヤー） */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-xs font-black text-foreground">
              <Video className="w-4 h-4 text-red-500" />
              <span>試合映像</span>
            </h2>
          </div>

          <YouTubePlayer
            url={match.youtubeUrl}
            title={`vs ${match.opponent} (${match.date}) 試合動画`}
          />
        </section>

        {/* ⚾️ スコアボード */}
        <section className="bg-card border border-border rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black text-foreground tracking-tight">
              スコアボード
            </h2>
            <div className="flex items-center gap-1.5">
              {isWin && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-black border border-emerald-500/30">
                  WIN
                </span>
              )}
              {isLose && (
                <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400 text-xs font-black border border-rose-500/30">
                  LOSE
                </span>
              )}
              {isDraw && (
                <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs font-black border border-amber-500/30">
                  DRAW
                </span>
              )}
            </div>
          </div>

          {/* スコアテーブル */}
          <div className="overflow-x-auto -mx-2 px-2 pb-1">
            <table className="w-full text-xs text-center border-collapse">
              <thead>
                <tr className="border-b border-border/80 text-muted-foreground font-black">
                  <th className="py-2 text-left px-2 font-bold">チーム</th>
                  {inningsArray.map((inn) => (
                    <th key={inn} className="py-2 px-2 min-w-[24px]">
                      {inn}
                    </th>
                  ))}
                  <th className="py-2 px-2.5 font-black text-foreground bg-muted/40 rounded-t-md">
                    計
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-bold">
                <tr className="hover:bg-muted/20">
                  <td className="py-2 px-2 text-left font-black text-foreground truncate max-w-[120px]">
                    {match.battingOrder === "first" ? "自チーム" : match.opponent}
                  </td>
                  {inningsArray.map((inn, idx) => {
                    const score = match.battingOrder === "first" ? myInningScores[idx] : opponentInningScores[idx];
                    return (
                      <td key={inn} className="py-2 px-2 tabular-nums">
                        {score !== null && score !== undefined ? score : "-"}
                      </td>
                    );
                  })}
                  <td className="py-2 px-2.5 font-black text-base tabular-nums bg-muted/40 text-foreground">
                    {match.battingOrder === "first" ? match.myScore : match.opponentScore}
                  </td>
                </tr>
                <tr className="hover:bg-muted/20">
                  <td className="py-2 px-2 text-left font-black text-foreground truncate max-w-[120px]">
                    {match.battingOrder === "second" ? "自チーム" : match.opponent}
                  </td>
                  {inningsArray.map((inn, idx) => {
                    const score = match.battingOrder === "second" ? myInningScores[idx] : opponentInningScores[idx];
                    return (
                      <td key={inn} className="py-2 px-2 tabular-nums">
                        {score !== null && score !== undefined ? score : "-"}
                      </td>
                    );
                  })}
                  <td className="py-2 px-2.5 font-black text-base tabular-nums bg-muted/40 text-foreground">
                    {match.battingOrder === "second" ? match.myScore : match.opponentScore}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 📋 試合情報サマリー */}
        <section className="bg-card border border-border rounded-2xl p-4 shadow-xs space-y-2.5 text-xs font-medium">
          <h2 className="text-xs font-black text-foreground mb-1">試合概要</h2>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="flex items-start gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] text-muted-foreground block font-bold">開催日</span>
                <span className="text-foreground font-black">{match.date}</span>
              </div>
            </div>

            {match.venueName && (
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <span className="text-[10px] text-muted-foreground block font-bold">球場</span>
                  <span className="text-foreground font-black truncate">{match.venueName}</span>
                </div>
              </div>
            )}

            {match.tournamentName && (
              <div className="flex items-start gap-2 col-span-2">
                <Trophy className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <span className="text-[10px] text-muted-foreground block font-bold">大会名</span>
                  <span className="text-foreground font-black">{match.tournamentName}</span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 👥 出場メンバー（もしあれば） */}
        {lineup.length > 0 && (
          <section className="bg-card border border-border rounded-2xl p-4 shadow-xs space-y-3">
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-primary" />
              <h2 className="text-xs font-black text-foreground">
                スターティングオーダー
              </h2>
            </div>

            <div className="space-y-1.5">
              {lineup.map((player, idx) => (
                <div
                  key={player.id || idx}
                  className="flex items-center justify-between px-3 py-2 rounded-xl bg-muted/40 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-primary/10 text-primary font-black flex items-center justify-center text-[11px]">
                      {player.battingOrder || idx + 1}
                    </span>
                    <span className="font-bold text-foreground">{player.playerName || player.name}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-card border border-border text-[10px] font-black text-muted-foreground">
                    {player.positionName || player.position || "守備"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export default function LiffMatchDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col min-h-screen">
          <LiffHeader title="試合情報" showBack />
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted-foreground gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm font-bold">読み込み中...</p>
          </div>
        </div>
      }
    >
      <MatchDetailContent />
    </Suspense>
  );
}
