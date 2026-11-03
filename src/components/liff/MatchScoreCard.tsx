// filepath: src/components/liff/MatchScoreCard.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { format, differenceInSeconds, intervalToDuration } from "date-fns";
import { ja } from "date-fns/locale";
import { 
  Calendar, 
  MapPin, 
  ChevronDown, 
  ChevronUp, 
  Play, 
  Trophy, 
  Users,
  Video,
  FileText,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseSafeMatchDate, hasMatchTime } from "@/lib/liff/demo-lineup";

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
  hasLineup?: boolean;
  hasScorebook?: boolean;
}

interface MatchScoreCardProps {
  match?: MatchCardData | null;
  teamName?: string;
  initialExpanded?: boolean;
  isLoading?: boolean;
}

// 🌟 試合カード用スケルトンローダー（動画エリア含む）
export function MatchScoreCardSkeleton({ hasVideo = true }: { hasVideo?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs animate-pulse">
      {/* 📹 試合動画プレースホルダー（スケルトン表示） */}
      {hasVideo && (
        <div className="w-full aspect-video bg-muted relative flex flex-col items-center justify-center border-b border-border">
          <div className="w-12 h-12 rounded-full bg-card flex items-center justify-center shadow-xs">
            <Video className="w-6 h-6 text-muted-foreground/40 animate-pulse" />
          </div>
          <div className="mt-2.5 h-2.5 w-28 bg-border rounded-full" />
        </div>
      )}

      {/* A-3 ダークヘッダーキャップ（スケルトン） */}
      <div className="px-3.5 py-2 bg-[#0f172a] border-b-[3px] border-primary flex items-center justify-between">
        <div className="h-4 w-36 bg-slate-700 rounded" />
        <div className="h-4 w-12 bg-slate-700 rounded" />
      </div>

      {/* カードボディ */}
      <div className="p-3.5 space-y-3">
        {/* スコア対戦エリア */}
        <div className="flex items-center justify-between py-1">
          <div className="space-y-1.5 flex-1">
            <div className="h-5 w-32 bg-muted rounded" />
            <div className="h-3.5 w-40 bg-muted rounded" />
          </div>
          <div className="h-10 w-20 bg-muted rounded-xl border border-border" />
        </div>

        {/* 下部情報 */}
        <div className="flex items-center justify-between pt-2.5 border-t border-border/60 gap-2">
          <div className="h-3.5 w-12 bg-muted rounded" />
          <div className="flex items-center gap-1.5">
            <div className="h-7 w-24 bg-muted rounded-lg" />
            <div className="h-7 w-24 bg-muted rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
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

// 安全に日付をフォーマットするヘルパー（日本語曜日・Safari/iOS LINE内ブラウザ対応）
const formatSafeDate = (dateStr: string, fmt: string) => {
  try {
    const d = parseSafeMatchDate(dateStr);
    if (!d || isNaN(d.getTime())) return dateStr;
    const effectiveFmt = fmt === "MM/dd(E) HH:mm" && !hasMatchTime(dateStr) ? "MM/dd(E)" : fmt;
    return format(d, effectiveFmt, { locale: ja });
  } catch (e) {
    return dateStr;
  }
};

// イニング配列を安全に取り出すヘルパー
const normalizeInningScores = (raw: unknown): number[] => {
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as number[]) : [];
    } catch {
      return [];
    }
  }
  return [];
};

// YouTube 動画ID 抽出ユーティリティ
function getYoutubeVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

// 🌟 カウントダウン用サブコンポーネント（不正日付によるRangeErrorクラッシュを完全防止）
function MatchCountdown({ date }: { date: string }) {
  const [timeLeft, setTimeLeft] = useState("00:00:00");

  useEffect(() => {
    const update = () => {
      try {
        const target = parseSafeMatchDate(date);
        if (!target || isNaN(target.getTime())) {
          setTimeLeft("--:--:--");
          return;
        }
        const now = new Date();
        const diff = differenceInSeconds(target, now);

        if (isNaN(diff) || diff <= 0) {
          setTimeLeft("START");
          return;
        }

        const duration = intervalToDuration({ start: now, end: target });
        const d = duration.days ? `${duration.days}日 ` : "";
        const h = String(duration.hours || 0).padStart(2, "0");
        const m = String(duration.minutes || 0).padStart(2, "0");
        const s = String(duration.seconds || 0).padStart(2, "0");

        setTimeLeft(`${d}${h}:${m}:${s}`);
      } catch {
        setTimeLeft("--:--:--");
      }
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

export function MatchScoreCard({ match, teamName = "自チーム", initialExpanded = false, isLoading = false }: MatchScoreCardProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const [isThumbLoaded, setIsThumbLoaded] = useState(false);

  if (isLoading || !match) {
    return <MatchScoreCardSkeleton />;
  }

  const youtubeVideoId = getYoutubeVideoId(match.youtubeUrl);

  const parsedMatchDate = parseSafeMatchDate(match.date);
  const isFuture = Boolean(
    parsedMatchDate && parsedMatchDate.getTime() > Date.now() && match.status !== "finished"
  );
  const isLive = match.status === "live";
  const isRainout = match.status === "rainout";
  const isWin = match.status === "finished" && match.myScore > match.opponentScore;
  const isLoss = match.status === "finished" && match.myScore < match.opponentScore;
  const isDraw = match.status === "finished" && match.myScore === match.opponentScore;

  const firstScore = match.battingOrder === "second" ? match.opponentScore : match.myScore;
  const secondScore = match.battingOrder === "second" ? match.myScore : match.opponentScore;
  const isHomeWinning = !isFuture && match.status !== "scheduled" && secondScore > firstScore;

  const myScores = normalizeInningScores(match.myInningScores);
  const oppScores = normalizeInningScores(match.opponentInningScores);
  const topScores = match.battingOrder === "second" ? oppScores : myScores;
  const bottomScores = match.battingOrder === "second" ? myScores : oppScores;

  const topTeamName = match.battingOrder === "second" ? match.opponent : teamName;
  const bottomTeamName = match.battingOrder === "second" ? teamName : match.opponent;
  const isMyFirst = match.battingOrder !== "second";

  const inningCount = Math.max(match.innings || 7, topScores.length, bottomScores.length, 7);

  return (
    <div
      className={cn(
        "group relative overflow-hidden transition-all duration-200 ease-out",
        "rounded-2xl border border-border bg-card shadow-xs",
        isExpanded && "border-primary/50 shadow-sm"
      )}
    >
      {/* 🌟 1. YouTube 試合動画（本家同様の美しいサムネイル＆インライン埋め込み） */}
      {youtubeVideoId && (
        <div className="w-full aspect-video border-b border-border overflow-hidden bg-black relative group/video">
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
              className="relative w-full h-full cursor-pointer overflow-hidden group/thumb bg-muted"
            >
              {/* 🌟 サムネイル読み込み中スケルトン */}
              {!isThumbLoaded && (
                <div className="absolute inset-0 bg-muted animate-pulse flex flex-col items-center justify-center z-0">
                  <div className="w-12 h-12 rounded-full bg-card flex items-center justify-center shadow-xs">
                    <Video className="w-6 h-6 text-muted-foreground/40 animate-pulse" />
                  </div>
                </div>
              )}

              {/* サムネイル画像 */}
              <img
                src={`https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`}
                alt="Game Video Thumbnail"
                loading="lazy"
                decoding="async"
                onLoad={() => setIsThumbLoaded(true)}
                className={cn(
                  "w-full h-full object-cover transition-transform duration-500 group-hover/thumb:scale-105",
                  !isThumbLoaded && "opacity-0"
                )}
              />

              {/* ソリッドスクリム（グラデーションゼロ） */}
              <div className="absolute inset-0 bg-black/30 group-hover/thumb:bg-black/40 transition-colors" />

              {/* 再生ボタン */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg group-hover/thumb:scale-110 transition-all duration-300 ring-4 ring-white/25">
                  <Play className="w-6 h-6 sm:w-7 sm:h-7 fill-current translate-x-0.5" />
                </div>
              </div>

              {/* ガイドラベル */}
              <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between text-[10px] sm:text-[11px] font-bold text-white pointer-events-none">
                <span className="flex items-center gap-1.5 bg-slate-950/85 px-2.5 py-1 rounded-full border border-white/20">
                  <Play className="w-3 h-3 fill-current text-primary" />
                  タップして試合動画を再生
                </span>
                <span className="bg-primary text-primary-foreground px-2 py-0.5 rounded-md font-black">
                  YouTube
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 🌟 2. A-3 上帯ダークキャップ ＆ 純白スコアサマリー */}
      <div
        className="cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* A-3 上帯ダークキャップ（種別・大会名・スコア取込・勝敗ステータス） */}
        <div className="px-3.5 py-2 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span
              className={cn(
                "text-center text-[10px] font-black px-1.5 py-0.5 rounded shrink-0",
                match.matchType === "official"
                  ? "bg-amber-400 text-slate-950"
                  : match.matchType === "exchange"
                  ? "bg-sky-400 text-slate-950"
                  : "bg-slate-700 text-slate-100"
              )}
            >
              {match.matchType === "official" ? "公式戦" : match.matchType === "exchange" ? "交流戦" : "OP戦"}
            </span>

            <span className="text-[11px] sm:text-xs font-bold text-slate-100 truncate min-w-0">
              {match.tournamentName && match.tournamentName !== "公式戦" && match.tournamentName !== "OP戦"
                ? match.tournamentName
                : match.matchType === "official"
                ? "大会名未登録"
                : match.matchType === "exchange"
                ? "交流戦"
                : "練習試合"}
            </span>

            {!isFuture && match.status !== "scheduled" && !isRainout && (
              match.hasScorebook ? (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950 shrink-0">
                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                  <span>取込済</span>
                </span>
              ) : (
                <span className="inline-flex items-center text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 shrink-0">
                  未取込
                </span>
              )
            )}
          </div>

          <div className="shrink-0 flex items-center gap-1">
            {isLive ? (
              <span className="px-2 py-0.5 bg-rose-600 text-white text-[10px] font-black rounded animate-pulse">
                LIVE
              </span>
            ) : isRainout ? (
              <span className="px-2 py-0.5 bg-sky-600 text-white text-[10px] font-black rounded">
                雨天中止
              </span>
            ) : isWin ? (
              <span className="px-2 py-0.5 bg-primary text-primary-foreground text-[10px] font-black rounded tabular-nums">
                WIN
              </span>
            ) : isLoss ? (
              <span className="px-2 py-0.5 bg-rose-600 text-white text-[10px] font-black rounded tabular-nums">
                LOSE
              </span>
            ) : isDraw ? (
              <span className="px-2 py-0.5 bg-slate-600 text-white text-[10px] font-black rounded tabular-nums">
                DRAW
              </span>
            ) : (
              <span className="px-2 py-0.5 bg-slate-700 text-slate-200 text-[10px] font-black rounded">
                予定
              </span>
            )}
          </div>
        </div>

        {/* 純白ボディ：対戦相手・日時球場・中継スコアボックス */}
        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-3">
            {/* 左側：対戦相手・日時球場 */}
            <div className="flex-1 min-w-0">
              <h3 className="text-base sm:text-lg font-black truncate text-foreground tracking-tight">
                vs {match.opponent}
              </h3>

              <p className="text-[10.5px] sm:text-[11.5px] font-bold text-muted-foreground flex items-center gap-1.5 mt-1 truncate">
                <Calendar className="h-3 w-3 shrink-0 text-primary" />
                <span>{formatSafeDate(match.date, "MM/dd(E) HH:mm")}</span>
                <span className="text-border">|</span>
                <MapPin className="h-3 w-3 shrink-0 text-primary" />
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

            {/* 右側：スコアボックス・アコーディオンアイコン */}
            <div className="flex items-center gap-2 shrink-0">
              {isRainout ? (
                <div className="px-2.5 py-1.5 bg-muted rounded-xl border border-border text-center min-w-[76px]">
                  <p className="text-[10px] font-black text-muted-foreground">☔ 中止</p>
                </div>
              ) : isFuture ? (
                <div className="px-2 py-1.5 bg-muted rounded-xl border border-border text-center min-w-[82px]">
                  <p className="text-[8px] font-black text-muted-foreground uppercase leading-none mb-0.5">START IN</p>
                  <MatchCountdown date={match.date} />
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-xl border border-border">
                  <div className="text-center min-w-[24px]">
                    <p className="text-[8px] font-black text-muted-foreground uppercase leading-none mb-0.5">先</p>
                    <span
                      className={cn(
                        "text-lg sm:text-xl font-black tabular-nums leading-none",
                        isMyFirst && isWin ? "text-primary" : "text-foreground"
                      )}
                    >
                      {firstScore}
                    </span>
                  </div>
                  <span className="text-xs font-black text-muted-foreground">-</span>
                  <div className="text-center min-w-[24px]">
                    <p className="text-[8px] font-black text-muted-foreground uppercase leading-none mb-0.5">後</p>
                    <span
                      className={cn(
                        "text-lg sm:text-xl font-black tabular-nums leading-none",
                        !isMyFirst && isWin ? "text-primary" : "text-foreground"
                      )}
                    >
                      {secondScore}
                    </span>
                  </div>
                </div>
              )}

              <div className="text-muted-foreground">
                {isExpanded ? <ChevronUp className="h-4 w-4 text-primary" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </div>
          </div>

          {/* 🌟 2.5 折りたたみ時のワンタップ・クイックアクション（展開後フッターとデザイン・文言を完全統一） */}
          {!isExpanded && (
            <div
              className="mt-3 pt-2.5 border-t border-border/70 flex items-center justify-between gap-2 flex-wrap"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-[10px] font-bold text-muted-foreground pl-0.5">
                {match.status === "finished"
                  ? "試合終了"
                  : isLive
                  ? "試合中"
                  : isRainout
                  ? "雨天中止"
                  : "予定"}
              </span>
              <div className="flex items-center gap-1.5">
                {!isRainout && (
                  <Link
                    href={`/liff/matches/lineup?id=${match.id}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-card border border-border text-primary hover:border-primary/40 hover:bg-muted/50 text-xs font-black transition-all active:scale-95 shadow-2xs"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>{match.hasLineup ? "スタメン編集" : "スタメン登録"}</span>
                  </Link>
                )}
                <Link
                  href={`/liff/matches?id=${match.id}`}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-black transition-all active:scale-95 shadow-2xs"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>スコア・詳細</span>
                </Link>
              </div>
            </div>
          )}

          {/* 🌟 3. アコーディオン展開：本家同等のイニングスコアボード（A-3中継盤スタイル） */}
          {isExpanded && (
            <div className="mt-3 pt-3 border-t border-border animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="w-full overflow-hidden rounded-xl border border-border bg-card shadow-xs flex flex-col">
                <div className="overflow-x-auto scrollbar-none">
                  <table className="w-full text-center whitespace-nowrap text-xs">
                    <thead>
                      <tr className="border-b-2 border-primary bg-[#0f172a] text-[10px] text-slate-200 font-black">
                        <th className="p-1.5 text-left pl-2.5 min-w-[90px] text-slate-300">TEAM</th>
                        {Array.from({ length: inningCount }).map((_, i) => (
                          <th key={i} className="w-6 p-1.5 font-mono tabular-nums">{i + 1}</th>
                        ))}
                        <th className="w-8 p-1.5 bg-primary text-primary-foreground font-black border-l border-slate-700 font-mono tabular-nums">R</th>
                        <th className="w-6 p-1.5 font-mono tabular-nums">H</th>
                        <th className="w-6 p-1.5 pr-2.5 font-mono tabular-nums">E</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-xs font-black">
                      {/* 先攻チーム */}
                      <tr className="hover:bg-muted/40">
                        <td className="p-1.5 text-left pl-2.5 font-black truncate max-w-[100px] text-foreground">
                          {topTeamName}
                        </td>
                        {Array.from({ length: inningCount }).map((_, i) => {
                          const disp = formatScoreDisplay(topScores[i], false, false, false);
                          const scored = typeof topScores[i] === "number" && (topScores[i] as number) > 0;
                          return (
                            <td key={i} className="p-1.5 font-mono tabular-nums">
                              {scored && isMyFirst ? (
                                <span className="inline-block min-w-5 px-1 py-0.5 rounded bg-primary text-primary-foreground font-black leading-none">
                                  {disp}
                                </span>
                              ) : (
                                <span className={scored ? "text-foreground font-black" : "text-muted-foreground font-bold"}>
                                  {disp}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="p-1.5 font-mono tabular-nums bg-muted/60 text-primary font-black border-l border-border text-sm">
                          {isFuture ? "-" : firstScore}
                        </td>
                        <td className="p-1.5 font-mono tabular-nums text-foreground text-[11px] font-bold">
                          {isFuture ? "-" : (match.battingOrder === "second" ? match.opponentHits ?? "-" : match.myHits ?? "-")}
                        </td>
                        <td className="p-1.5 pr-2.5 font-mono tabular-nums text-muted-foreground text-[11px] font-bold">
                          {isFuture ? "-" : (match.battingOrder === "second" ? match.opponentErrors ?? "-" : match.myErrors ?? "-")}
                        </td>
                      </tr>

                      {/* 後攻チーム */}
                      <tr className="hover:bg-muted/40">
                        <td className="p-1.5 text-left pl-2.5 font-black truncate max-w-[100px] text-foreground">
                          {bottomTeamName}
                        </td>
                        {Array.from({ length: inningCount }).map((_, i) => {
                          const disp = formatScoreDisplay(bottomScores[i], true, i === inningCount - 1, isHomeWinning);
                          const scored = typeof bottomScores[i] === "number" && (bottomScores[i] as number) > 0;
                          return (
                            <td key={i} className="p-1.5 font-mono tabular-nums">
                              {scored && !isMyFirst ? (
                                <span className="inline-block min-w-5 px-1 py-0.5 rounded bg-primary text-primary-foreground font-black leading-none">
                                  {disp}
                                </span>
                              ) : (
                                <span className={scored ? "text-foreground font-black" : "text-muted-foreground font-bold"}>
                                  {disp}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="p-1.5 font-mono tabular-nums bg-muted/60 text-primary font-black border-l border-border text-sm">
                          {isFuture ? "-" : secondScore}
                        </td>
                        <td className="p-1.5 font-mono tabular-nums text-foreground text-[11px] font-bold">
                          {isFuture ? "-" : (match.battingOrder === "second" ? match.myHits ?? "-" : match.opponentHits ?? "-")}
                        </td>
                        <td className="p-1.5 pr-2.5 font-mono tabular-nums text-muted-foreground text-[11px] font-bold">
                          {isFuture ? "-" : (match.battingOrder === "second" ? match.myErrors ?? "-" : match.opponentErrors ?? "-")}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* フッターアクション：スタメン登録 ＆ 詳細スコアブックへの遷移 */}
                <div
                  className="p-2 bg-muted/60 border-t border-border flex items-center justify-between gap-2 flex-wrap"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-[10px] font-bold text-muted-foreground pl-1">
                    {match.status === "finished"
                      ? "試合終了"
                      : isLive
                      ? "試合中"
                      : isRainout
                      ? "雨天中止"
                      : "予定"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {!isRainout && (
                      <Link
                        href={`/liff/matches/lineup?id=${match.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-card border border-border text-primary hover:border-primary/40 hover:bg-muted/50 text-xs font-black transition-all active:scale-95 shadow-2xs"
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>{match.hasLineup ? "スタメン編集" : "スタメン登録"}</span>
                      </Link>
                    )}
                    <Link
                      href={`/liff/matches?id=${match.id}`}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-black transition-all active:scale-95 shadow-2xs"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>スコア・詳細</span>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
