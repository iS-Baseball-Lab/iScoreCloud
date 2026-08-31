// filepath: src/components/liff/MatchScoreCard.tsx
"use client";

import React, { useState, useEffect } from "react";
import { format, differenceInSeconds, intervalToDuration } from "date-fns";
import { ja } from "date-fns/locale";
import { 
  Calendar, 
  MapPin, 
  ChevronDown, 
  ChevronUp, 
  Play, 
  Trophy, 
  ExternalLink,
  Users,
  Video,
  FileText
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  venueShortName?: string | null;
  surfaceDetails?: string | null;
  tournamentName?: string | null;
  battingOrder?: "first" | "second";
  innings?: number;
  myInningScores?: number[];
  opponentInningScores?: number[];
  myHits?: number;
  opponentHits?: number;
  myErrors?: number;
  opponentErrors?: number;
}

interface MatchScoreCardProps {
  match: MatchCardData;
  teamName?: string;
  initialExpanded?: boolean;
}

// 現場仕様：スコアのフォーマット関数
const formatScoreDisplay = (score: number | null | undefined, isBottom: boolean, isInningFinal: boolean, isHomeWinning: boolean) => {
  if (isBottom && isInningFinal && isHomeWinning && (score === null || score === undefined)) {
    return "x";
  }
  if (score === null || score === undefined) {
    return "-";
  }
  return score;
};

// 安全に日付をフォーマットするヘルパー（日本語曜日対応）
const formatSafeDate = (dateStr: string, fmt: string) => {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return format(d, fmt, { locale: ja });
  } catch (e) {
    return dateStr;
  }
};

// YouTube 動画ID 抽出ユーティリティ
function getYoutubeVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

// 🌟 カウントダウン用サブコンポーネント
function MatchCountdown({ date }: { date: string }) {
  const [timeLeft, setTimeLeft] = useState("00:00:00");

  useEffect(() => {
    const update = () => {
      const target = new Date(date);
      const now = new Date();
      const diff = differenceInSeconds(target, now);

      if (diff <= 0) {
        setTimeLeft("START");
        return;
      }

      const duration = intervalToDuration({ start: now, end: target });
      const d = duration.days ? `${duration.days}日 ` : "";
      const h = String(duration.hours || 0).padStart(2, "0");
      const m = String(duration.minutes || 0).padStart(2, "0");
      const s = String(duration.seconds || 0).padStart(2, "0");

      setTimeLeft(`${d}${h}:${m}:${s}`);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [date]);

  return (
    <span className="font-mono text-xs font-black text-primary tabular-nums tracking-tight">
      {timeLeft}
    </span>
  );
}

export function MatchScoreCard({ match, teamName = "自チーム", initialExpanded = false }: MatchScoreCardProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const youtubeVideoId = getYoutubeVideoId(match.youtubeUrl);

  const isFuture = new Date(match.date) > new Date() && match.status !== "finished";
  const isLive = match.status === "live";
  const isRainout = match.status === "rainout";
  const isWin = match.status === "finished" && match.myScore > match.opponentScore;
  const isLoss = match.status === "finished" && match.myScore < match.opponentScore;
  const isDraw = match.status === "finished" && match.myScore === match.opponentScore;

  const firstScore = match.battingOrder === "second" ? match.opponentScore : match.myScore;
  const secondScore = match.battingOrder === "second" ? match.myScore : match.opponentScore;
  const isHomeWinning = secondScore > firstScore;

  const myScores = match.myInningScores || [];
  const oppScores = match.opponentInningScores || [];
  const topScores = match.battingOrder === "second" ? oppScores : myScores;
  const bottomScores = match.battingOrder === "second" ? myScores : oppScores;

  const topTeamName = match.battingOrder === "second" ? match.opponent : teamName;
  const bottomTeamName = match.battingOrder === "second" ? teamName : match.opponent;

  const inningCount = Math.max(match.innings || 7, topScores.length, bottomScores.length, 7);

  return (
    <div
      className={cn(
        "group relative overflow-hidden transition-all duration-200 ease-out",
        "rounded-3xl border-2 border-primary/30 dark:border-primary/40 bg-card shadow-md shadow-primary/5 hover:border-primary/50"
      )}
    >
      {/* 🌟 1. YouTube 試合動画（本家同様の美しいサムネイル＆インライン埋め込み） */}
      {youtubeVideoId && (
        <div className="w-full aspect-video border-b border-border/50 overflow-hidden bg-black relative group/video">
          {isPlayingVideo ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${youtubeVideoId}?autoplay=1&rel=0&modestbranding=1`}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="w-full h-full"
            />
          ) : (
            <div
              onClick={() => setIsPlayingVideo(true)}
              className="relative w-full h-full cursor-pointer overflow-hidden group/thumb"
            >
              {/* サムネイル画像 */}
              <img
                src={`https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`}
                alt="Game Video Thumbnail"
                className="w-full h-full object-cover transition-transform duration-500 group-hover/thumb:scale-105"
              />

              {/* グラデーションオーバーレイ */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent group-hover/thumb:from-black/80 transition-colors" />

              {/* 再生ボタン */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-rose-600/90 text-white flex items-center justify-center shadow-lg group-hover/thumb:scale-110 group-hover/thumb:bg-rose-600 transition-all duration-300 ring-4 ring-white/20">
                  <Play className="w-6 h-6 sm:w-7 sm:h-7 fill-current translate-x-0.5" />
                </div>
              </div>

              {/* ガイドラベル */}
              <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between text-[10px] sm:text-[11px] font-bold text-white/90 drop-shadow-sm pointer-events-none">
                <span className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/15">
                  <Play className="w-3 h-3 fill-current text-rose-500" />
                  タップして試合動画を再生
                </span>
                <span className="bg-rose-600/90 text-white px-2 py-0.5 rounded-md font-black">
                  YouTube
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 🌟 2. 試合ヘッダー＆スコアサマリー */}
      <div
        className="p-3.5 sm:p-4 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between gap-3">
          {/* 左側：大会・種別・対戦相手・日時球場 */}
          <div className="flex-1 min-w-0">
            {/* 大会バッジ ＆ 大会名 */}
            <div className="flex items-center gap-1.5 mb-1">
              <span
                className={cn(
                  "text-center text-[10px] font-black px-1.5 py-0.5 rounded shadow-2xs",
                  match.matchType === "official"
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25"
                    : match.matchType === "exchange"
                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25"
                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25"
                )}
              >
                {match.matchType === "official" ? "公式戦" : match.matchType === "exchange" ? "交流戦" : "OP戦"}
              </span>
              <span className="text-[11px] sm:text-xs font-bold text-muted-foreground truncate">
                {match.tournamentName || (match.matchType === "official" ? "公式戦" : match.matchType === "exchange" ? "交流戦" : "練習試合")}
              </span>
            </div>

            {/* 対戦相手 */}
            <h3 className="text-base sm:text-lg font-black truncate text-foreground tracking-tight">
              vs {match.opponent}
            </h3>

            {/* 日時 ＆ 球場 (略称優先) */}
            <p className="text-[10px] sm:text-[11px] font-bold text-muted-foreground flex items-center gap-1.5 mt-0.5 truncate">
              <Calendar className="h-3 w-3 shrink-0" />
              <span>{formatSafeDate(match.date, "MM/dd(E) HH:mm")}</span>
              <span className="text-border">|</span>
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {(match.venueShortName && match.venueShortName.trim() !== "")
                  ? match.venueShortName.trim()
                  : (match.venueName && match.venueName.trim() !== "")
                  ? match.venueName.trim()
                  : (match.surfaceDetails && match.surfaceDetails.trim() !== "")
                  ? match.surfaceDetails.trim()
                  : "球場未設定"}
              </span>
            </p>
          </div>

          {/* 右側：勝敗バッジ・スコアボックス・アコーディオン */}
          <div className="flex flex-col items-center gap-1 shrink-0">
            {/* 勝敗 / ライブ / 中止 バッジ */}
            {isLive ? (
              <span className="w-14 text-center bg-rose-600 text-white text-[10px] font-black py-0.5 rounded shadow-xs animate-pulse">
                LIVE
              </span>
            ) : isRainout ? (
              <span className="w-14 text-center bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30 text-[10px] font-black py-0.5 rounded shadow-xs">
                雨天中止
              </span>
            ) : isWin ? (
              <span className="w-14 text-center bg-blue-600 text-white text-[10px] font-black py-0.5 rounded shadow-xs">
                WIN
              </span>
            ) : isLoss ? (
              <span className="w-14 text-center bg-rose-600 text-white text-[10px] font-black py-0.5 rounded shadow-xs">
                LOSE
              </span>
            ) : isDraw ? (
              <span className="w-14 text-center bg-zinc-500 text-white text-[10px] font-black py-0.5 rounded shadow-xs">
                DRAW
              </span>
            ) : null}

            {/* スコアボックス / カウントダウン */}
            {isRainout ? (
              <div className="px-2.5 py-1 bg-blue-500/5 dark:bg-blue-500/10 rounded-xl border border-blue-500/20 text-center min-w-[76px]">
                <p className="text-[10px] font-black text-blue-600 dark:text-blue-400">☔ 中止</p>
              </div>
            ) : isFuture ? (
              <div className="px-1 py-1 bg-primary/10 rounded-xl border border-primary/20 text-center min-w-[76px]">
                <p className="text-[8px] font-black text-primary/70 uppercase leading-none mb-0.5">START IN</p>
                <MatchCountdown date={match.date} />
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/5 dark:bg-primary/10 rounded-xl border border-primary/20">
                <div className="text-center w-6">
                  <p className="text-[8px] font-black text-primary/70 uppercase leading-none">先</p>
                  <span className="text-base font-black tabular-nums leading-none text-foreground">{firstScore}</span>
                </div>
                <span className="text-xs font-black text-primary/30">-</span>
                <div className="text-center w-6">
                  <p className="text-[8px] font-black text-primary/70 uppercase leading-none">後</p>
                  <span className="text-base font-black tabular-nums leading-none text-foreground">{secondScore}</span>
                </div>
              </div>
            )}

            {/* 開閉アイコン */}
            <div className="text-primary/70">
              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </div>
          </div>
        </div>

        {/* 🌟 3. アコーディオン展開：本家同等のイニングスコアボード */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-border/60 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="w-full overflow-hidden rounded-xl border border-border bg-card shadow-xs flex flex-col">
              {!isFuture && (
                <div className="overflow-x-auto scrollbar-none">
                  <table className="w-full text-center whitespace-nowrap text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-[10px] text-muted-foreground font-black">
                        <th className="p-1.5 text-left pl-2.5 min-w-[90px]">TEAM</th>
                        {Array.from({ length: inningCount }).map((_, i) => (
                          <th key={i} className="w-6 p-1.5 font-mono">{i + 1}</th>
                        ))}
                        <th className="w-8 p-1.5 bg-primary/10 text-primary font-black border-l border-border font-mono">R</th>
                        <th className="w-6 p-1.5 font-mono">H</th>
                        <th className="w-6 p-1.5 pr-2.5 font-mono">E</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-xs font-black">
                      {/* 先攻チーム */}
                      <tr className="hover:bg-muted/20">
                        <td className="p-1.5 text-left pl-2.5 font-bold truncate max-w-[100px] text-foreground">
                          {topTeamName}
                        </td>
                        {Array.from({ length: inningCount }).map((_, i) => (
                          <td key={i} className="p-1.5 font-mono font-bold text-muted-foreground">
                            {formatScoreDisplay(topScores[i], false, false, false)}
                          </td>
                        ))}
                        <td className="p-1.5 font-mono bg-primary/10 text-primary font-black border-l border-border text-sm">
                          {firstScore}
                        </td>
                        <td className="p-1.5 font-mono text-muted-foreground text-[11px]">
                          {match.battingOrder === "second" ? match.opponentHits ?? "-" : match.myHits ?? "-"}
                        </td>
                        <td className="p-1.5 pr-2.5 font-mono text-muted-foreground text-[11px]">
                          {match.battingOrder === "second" ? match.opponentErrors ?? "-" : match.myErrors ?? "-"}
                        </td>
                      </tr>

                      {/* 後攻チーム */}
                      <tr className="hover:bg-muted/20">
                        <td className="p-1.5 text-left pl-2.5 font-bold truncate max-w-[100px] text-foreground">
                          {bottomTeamName}
                        </td>
                        {Array.from({ length: inningCount }).map((_, i) => (
                          <td key={i} className="p-1.5 font-mono font-bold text-muted-foreground">
                            {formatScoreDisplay(bottomScores[i], true, i === inningCount - 1, isHomeWinning)}
                          </td>
                        ))}
                        <td className="p-1.5 font-mono bg-primary/10 text-primary font-black border-l border-border text-sm">
                          {secondScore}
                        </td>
                        <td className="p-1.5 font-mono text-muted-foreground text-[11px]">
                          {match.battingOrder === "second" ? match.myHits ?? "-" : match.opponentHits ?? "-"}
                        </td>
                        <td className="p-1.5 pr-2.5 font-mono text-muted-foreground text-[11px]">
                          {match.battingOrder === "second" ? match.myErrors ?? "-" : match.opponentErrors ?? "-"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* フッターアクション：詳細スコアブックへの遷移 */}
              <div className="p-2 bg-muted/30 border-t border-border flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold text-muted-foreground pl-1">
                  {match.status === "finished" ? "試合終了" : isLive ? "試合中" : "予定"}
                </span>
                <a
                  href={`/liff/matches?id=${match.id}`}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-black transition-all active:scale-95 shadow-2xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>スコアブック・詳細</span>
                  <ExternalLink className="w-3 h-3 ml-0.5 opacity-70" />
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
