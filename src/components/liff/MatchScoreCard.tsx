// filepath: src/components/liff/MatchScoreCard.tsx
"use client";

import React from "react";
import Link from "next/navigation";
import { Play, Calendar, MapPin, Trophy, Video } from "lucide-react";
import { getYouTubeThumbnailUrl, extractYouTubeVideoId } from "@/lib/youtube";

export interface MatchCardData {
  id: string;
  opponent: string;
  date: string;
  status: string; // 'scheduled' | 'live' | 'finished' | 'rainout'
  myScore: number;
  opponentScore: number;
  matchType?: string;
  youtubeUrl?: string | null;
  venueName?: string | null;
  tournamentName?: string | null;
}

interface MatchScoreCardProps {
  match: MatchCardData;
}

export function MatchScoreCard({ match }: MatchScoreCardProps) {
  const hasVideo = !!extractYouTubeVideoId(match.youtubeUrl);
  const thumbnailUrl = hasVideo ? getYouTubeThumbnailUrl(match.youtubeUrl, "hq") : null;

  // 勝敗判定
  const isFinished = match.status === "finished";
  const isLive = match.status === "live";
  const isRainout = match.status === "rainout";
  const isWin = isFinished && match.myScore > match.opponentScore;
  const isLose = isFinished && match.myScore < match.opponentScore;
  const isDraw = isFinished && match.myScore === match.opponentScore;

  return (
    <a
      href={`/liff/matches?id=${match.id}`}
      className="block group bg-card border border-border rounded-2xl p-4 shadow-xs hover:border-primary/50 hover:shadow-md transition-all active:scale-[0.99] overflow-hidden"
    >
      <div className="flex flex-col gap-3">
        {/* 日付・大会・ステータスヘッダー */}
        <div className="flex items-center justify-between text-xs font-bold text-muted-foreground gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span>{match.date}</span>
            {match.tournamentName && (
              <span className="truncate text-muted-foreground/80 before:content-['•'] before:mr-1">
                {match.tournamentName}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {hasVideo && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 text-[10px] font-black border border-red-500/20">
                <Video className="w-3 h-3" />
                動画
              </span>
            )}

            {isLive ? (
              <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-black animate-pulse">
                LIVE
              </span>
            ) : isRainout ? (
              <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-black">
                雨天中止
              </span>
            ) : isWin ? (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-black border border-emerald-500/30">
                WIN
              </span>
            ) : isLose ? (
              <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 text-[10px] font-black border border-rose-500/30">
                LOSE
              </span>
            ) : isDraw ? (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-black border border-amber-500/30">
                DRAW
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-black">
                試合前
              </span>
            )}
          </div>
        </div>

        {/* スコア・対戦相手エリア */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col min-w-0">
            <span className="text-xs text-muted-foreground font-bold">vs</span>
            <h3 className="text-lg font-black text-foreground truncate tracking-tight">
              {match.opponent}
            </h3>
            {match.venueName && (
              <span className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground/80 mt-0.5 truncate">
                <MapPin className="w-3 h-3 shrink-0" />
                {match.venueName}
              </span>
            )}
          </div>

          <div className="flex items-baseline gap-2 shrink-0 bg-muted/40 px-3.5 py-1.5 rounded-xl border border-border/50">
            <span className="text-2xl font-black tabular-nums text-foreground">
              {match.myScore}
            </span>
            <span className="text-sm font-bold text-muted-foreground">-</span>
            <span className="text-2xl font-black tabular-nums text-muted-foreground">
              {match.opponentScore}
            </span>
          </div>
        </div>

        {/* YouTube動画サムネイルプレビュー（動画がある場合） */}
        {hasVideo && thumbnailUrl && (
          <div className="relative w-full aspect-[21/9] rounded-xl overflow-hidden bg-black/80 mt-1 border border-border">
            <img
              src={thumbnailUrl}
              alt="試合動画サムネイル"
              className="w-full h-full object-cover opacity-85 group-hover:opacity-100 group-hover:scale-105 transition-all duration-300"
            />
            <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent flex items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <Play className="w-5 h-5 fill-white translate-x-0.5" />
              </div>
            </div>
            <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-xs text-[10px] font-black text-white">
              YouTube再生
            </div>
          </div>
        )}
      </div>
    </a>
  );
}
