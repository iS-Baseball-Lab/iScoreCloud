// filepath: src/components/matches/match-card.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { format, differenceInSeconds, intervalToDuration } from "date-fns";
import { ja } from "date-fns/locale";
import { Edit2, Calendar, MapPin, Trash2, ChevronDown, ChevronUp, PlayCircle, Users, BookOpen, ClipboardList, Clock, Play, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Match } from "@/types/match";
import { Button } from "@/components/ui/button";

interface MatchCardProps {
  match: Match;
  isExpanded: boolean;
  onToggleExpand: () => void;
  enableSwipe?: boolean;
  onDelete?: (id: string) => void;
  teamFullName?: string;
}

// 現場仕様：スコアのフォーマット関数
interface FormatScoreProps {
  score: number | null | undefined;
  isBottom: boolean;
  isInningFinal: boolean;
  isHomeWinning: boolean;
}

const formatScoreDisplay = ({ score, isBottom, isInningFinal, isHomeWinning }: FormatScoreProps) => {
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
  return (match && match[2].length === 11) ? match[2] : null;
}

// 🌟 カウントダウン用サブコンポーネント（幅固定＆tabular-nums）
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
      
      // 日数がある場合は「1d 00:00:00」のように表示
      const d = duration.days ? `${duration.days}日 ` : "";
      const h = String(duration.hours || 0).padStart(2, '0');
      const m = String(duration.minutes || 0).padStart(2, '0');
      const s = String(duration.seconds || 0).padStart(2, '0');
      
      setTimeLeft(`${d}${h}:${m}:${s}`);
    };
    
    update(); // 初回実行
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [date]);

  return (
    // 💡 tabular-nums で数字の幅を固定し、ガタつきを防止
    <span className="font-mono text-xs sm:text-sm font-black text-primary tabular-nums tracking-tight">
      {timeLeft}
    </span>
  );
}

export function MatchCard({
  match,
  isExpanded,
  onToggleExpand,
  enableSwipe = false,
  onDelete,
  teamFullName = "",
}: MatchCardProps) {
  const router = useRouter();
  const youtubeVideoId = getYoutubeVideoId(match.youtubeUrl);
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);

  // ━━ スワイプ操作の状態管理 ━━
  const [offsetX, setOffsetX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const startOffsetX = useRef<number>(0);
  const isVerticalScroll = useRef(false);

  const ACTION_WIDTH = 75;

  // アコーディオン展開時はスワイプをリセットする
  useEffect(() => {
    if (isExpanded) {
      setOffsetX(0);
      setIsSwiping(false);
    }
  }, [isExpanded]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!enableSwipe) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    
    startOffsetX.current = offsetX;
    setIsSwiping(true);
    isVerticalScroll.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!enableSwipe) return;
    if (touchStartX.current === null || touchStartY.current === null || isVerticalScroll.current) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - touchStartX.current;
    const diffY = currentY - touchStartY.current;

    // 縦スクロール優先判定
    if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 5) {
      isVerticalScroll.current = true;
      setOffsetX(0);
      setIsSwiping(false);
      return;
    }

    if (isExpanded) {
      return; // 展開時はスワイプさせない
    }

    let newOffsetX = startOffsetX.current + diffX;
    if (newOffsetX > ACTION_WIDTH) newOffsetX = ACTION_WIDTH;
    if (newOffsetX < -ACTION_WIDTH) newOffsetX = -ACTION_WIDTH;

    setOffsetX(newOffsetX);
  };

  const handleTouchEnd = () => {
    if (!enableSwipe) return;
    touchStartX.current = null;
    touchStartY.current = null;

    if (offsetX > ACTION_WIDTH / 2) {
      setOffsetX(ACTION_WIDTH);
    } else if (offsetX < -ACTION_WIDTH / 2) {
      setOffsetX(-ACTION_WIDTH);
    } else {
      setOffsetX(0);
      setIsSwiping(false);
    }
  };

  const handleCardClick = () => {
    if (enableSwipe && offsetX !== 0) {
      setOffsetX(0);
      setTimeout(() => setIsSwiping(false), 200);
      return;
    }
    onToggleExpand();
  };

  const handleDelete = async () => {
    if (!confirm("本当にこの試合を削除しますか？")) return;
    try {
      const res = await fetch(`/api/matches/${match.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success("試合を削除しました");
        if (onDelete) onDelete(match.id);
      } else {
        throw new Error();
      }
    } catch (error) {
      toast.error("削除エラーが発生しました");
    }
  };

  const isFuture = new Date(match.date) > new Date();
  const isWin = match.myScore > match.opponentScore;
  const isLoss = match.myScore < match.opponentScore;
  const isDraw = match.myScore === match.opponentScore;
  const currentOffset = enableSwipe && isSwiping ? offsetX : 0;

  const firstScore = match.battingOrder === 'first' ? match.myScore : match.opponentScore;
  const secondScore = match.battingOrder === 'first' ? match.opponentScore : match.myScore;
  const inningCount = match.innings || 7;

  const myScores = match.myInningScores || [];
  const oppScores = match.opponentInningScores || [];

  const topScores = match.battingOrder === 'first' ? myScores : oppScores;
  const bottomScores = match.battingOrder === 'second' ? myScores : oppScores;
  const isHomeWinning = !isFuture && secondScore > firstScore;
  const isMyFirst = match.battingOrder === 'first';
  const isLive = match.status === 'live';

  return (
    <div className={cn(
      "group relative rounded-2xl border border-border bg-card shadow-xs overflow-hidden transition-all duration-200 ease-out",
      isExpanded && "border-primary/50 shadow-sm"
    )}>
      
      {/* スワイプ時のみ背面の編集・削除アクションを表示 */}
      {enableSwipe && (
        <div className={cn(
          "absolute inset-0 z-0 transition-opacity duration-150 bg-transparent",
          (isSwiping && Math.abs(offsetX) > 0) ? "opacity-100" : "opacity-0 pointer-events-none"
        )}>
          <div className="absolute top-0 left-0 h-full w-[75px]">
            <button
              onClick={(e) => { e.stopPropagation(); router.push(`/matches/edit?id=${match.id}`); }}
              className="flex flex-col items-center justify-center w-full h-full bg-primary text-primary-foreground active:bg-primary/90 transition-colors"
            >
              <Edit2 className="h-5 w-5 mb-1" />
              <span className="text-[10px] font-black uppercase tracking-wider">編集</span>
            </button>
          </div>

          <div className="absolute top-0 right-0 h-full w-[75px]">
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(); setOffsetX(0); }}
              className="flex flex-col items-center justify-center w-full h-full bg-rose-600 text-white active:bg-rose-700 transition-colors"
            >
              <Trash2 className="h-5 w-5 mb-1" />
              <span className="text-[10px] font-black uppercase tracking-wider">削除</span>
            </button>
          </div>
        </div>
      )}

      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ transform: `translateX(${currentOffset}px)`, touchAction: enableSwipe ? "pan-y" : "auto" }}
        className={cn(
          "relative z-10 h-full bg-card transition-transform duration-200 ease-out"
        )}
      >
        {/* 🌟 試合動画がある場合、カード上部に埋め込む（カスタムサムネイル表記でYouTubeタイトルのオーバーレイを完全消去） */}
        {youtubeVideoId && (
          <div 
            className="w-full aspect-video border-b border-border overflow-hidden bg-black relative group/video"
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
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
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPlayingVideo(true);
                }}
                className="relative w-full h-full cursor-pointer overflow-hidden group/thumb"
              >
                {/* 1. 高画質YouTubeサムネイル画像 */}
                <img
                  src={`https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`}
                  alt="Game Video Thumbnail"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover/thumb:scale-105"
                />
                
                {/* 2. ソリッドスクリム（グラデーションゼロ） */}
                <div className="absolute inset-0 bg-black/30 group-hover/thumb:bg-black/40 transition-colors" />

                {/* 3. 洗練されたカスタム再生ボタン */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg group-hover/thumb:scale-110 transition-all duration-300 ring-4 ring-white/25">
                    <Play className="w-7 h-7 sm:w-8 sm:h-8 fill-current translate-x-0.5" />
                  </div>
                </div>

                {/* 4. アプリ標準のクリーンな再生ガイドラベル */}
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[11px] font-bold text-white pointer-events-none">
                  <span className="flex items-center gap-1.5 bg-slate-950/85 px-3 py-1 rounded-full border border-white/20">
                    <Play className="w-3.5 h-3.5 fill-current text-primary" />
                    タップして試合動画を再生
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        <div
          className="cursor-pointer"
          onClick={handleCardClick}
        >
          {/* 🌟 A-3 上帯ダークキャップ（種別・大会名・取込状況・勝敗ステータス） */}
          <div className="px-4 py-2 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary flex items-center justify-between gap-2 pointer-events-none">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className={cn(
                "text-center text-[10px] sm:text-xs font-black px-2 py-0.5 rounded shrink-0",
                match.matchType === 'official' ? "bg-amber-400 text-slate-950" :
                match.matchType === 'exchange' ? "bg-sky-400 text-slate-950" :
                "bg-slate-700 text-slate-100"
              )}>
                {match.matchType === 'official' ? '公式戦' : match.matchType === 'exchange' ? '交流戦' : 'OP戦'}
              </span>

              <span className="text-xs sm:text-sm font-bold text-slate-100 truncate min-w-0">
                {match.tournamentName && match.tournamentName !== "公式戦" && match.tournamentName !== "OP戦"
                  ? match.tournamentName
                  : match.matchType === 'official'
                  ? "大会名未登録"
                  : match.matchType === 'exchange'
                  ? "交流戦"
                  : "OP戦"}
              </span>

              {!isFuture && match.status !== 'rainout' && match.status !== 'scheduled' && (
                match.hasScorebook ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950 shrink-0">
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                    <span>取込済</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 shrink-0">
                    未取込
                  </span>
                )
              )}
            </div>

            <div className="shrink-0 flex items-center gap-1.5">
              {isLive ? (
                <span className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] sm:text-[11px] font-black animate-pulse">LIVE</span>
              ) : match.status === 'rainout' ? (
                <span className="px-2 py-0.5 rounded bg-sky-600 text-white text-[10px] sm:text-[11px] font-black">雨天中止</span>
              ) : isFuture || match.status === 'scheduled' ? (
                <span className="px-2 py-0.5 rounded bg-slate-700 text-slate-200 text-[10px] sm:text-[11px] font-black">予定</span>
              ) : isWin ? (
                <span className="px-2.5 py-0.5 rounded bg-primary text-primary-foreground text-[11px] font-black tabular-nums">WIN</span>
              ) : isLoss ? (
                <span className="px-2.5 py-0.5 rounded bg-rose-600 text-white text-[11px] font-black tabular-nums">LOSE</span>
              ) : isDraw ? (
                <span className="px-2.5 py-0.5 rounded bg-slate-600 text-white text-[11px] font-black tabular-nums">DRAW</span>
              ) : null}
            </div>
          </div>

          {/* 🌟 純白カードボディ（対戦相手・日時球場・中継スコアボックス） */}
          <div className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-4 pointer-events-none">
              <div className="flex-1 min-w-0">
                <h3 className="text-lg sm:text-xl font-black truncate text-foreground tracking-tight">
                  vs {match.opponent}
                </h3>
                
                <p className="text-[11px] sm:text-xs font-bold text-muted-foreground flex items-center gap-1.5 mt-1 truncate">
                  <Calendar className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>{formatSafeDate(match.date, "MM/dd(E) HH:mm")}</span>
                  <span className="text-border">|</span>
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
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

              <div className="flex items-center gap-2 shrink-0">
                {match.status === 'rainout' ? (
                  <div className="px-3 py-1.5 bg-muted rounded-xl border border-border text-center min-w-[85px] flex flex-col items-center justify-center">
                    <p className="text-[11px] font-black text-muted-foreground leading-none">☔ 中止</p>
                  </div>
                ) : isFuture ? (
                  <div className="px-2.5 py-1.5 bg-muted rounded-xl border border-border text-center min-w-[88px] flex flex-col items-center justify-center">
                    <p className="text-[8px] font-black text-muted-foreground uppercase leading-none mb-0.5">START IN</p>
                    <MatchCountdown date={match.date} />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-xl border border-border">
                    <div className="text-center min-w-[28px]">
                      <p className="text-[9px] font-black text-muted-foreground uppercase leading-none mb-0.5">先</p>
                      <span className={cn(
                        "text-xl sm:text-2xl font-black tabular-nums leading-none",
                        isMyFirst && isWin ? "text-primary" : "text-foreground"
                      )}>{firstScore}</span>
                    </div>
                    <span className="text-xs font-black text-muted-foreground">-</span>
                    <div className="text-center min-w-[28px]">
                      <p className="text-[9px] font-black text-muted-foreground uppercase leading-none mb-0.5">後</p>
                      <span className={cn(
                        "text-xl sm:text-2xl font-black tabular-nums leading-none",
                        !isMyFirst && isWin ? "text-primary" : "text-foreground"
                      )}>{secondScore}</span>
                    </div>
                  </div>
                )}
                {isExpanded ? <ChevronUp className="h-4 w-4 text-primary shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
              </div>
            </div>

            {isExpanded && (
              <div className="mt-4 pt-3 border-t border-border animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="w-full overflow-hidden rounded-xl border border-border bg-card shadow-xs flex flex-col pointer-events-auto">
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-center whitespace-nowrap">
                      <thead className="bg-[#0f172a] text-slate-200 border-b-2 border-primary">
                        <tr>
                          <th className="py-2 px-3 text-left font-black text-slate-300 text-xs w-20 md:w-32">TEAM</th>
                          {Array.from({ length: inningCount }).map((_, i) => (
                            <th key={i} className="py-2 px-1.5 sm:px-2 text-xs md:text-sm font-black tabular-nums text-slate-200">{i + 1}</th>
                          ))}
                          <th className="py-2 px-3 text-xs md:text-sm font-black bg-primary text-primary-foreground border-l border-slate-700 tabular-nums">R</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border text-xs sm:text-sm font-bold tabular-nums">
                        <tr>
                          <td className="py-2 px-3 text-left font-black text-foreground">
                            <div className="w-16 truncate md:w-auto md:whitespace-normal">
                              {match.battingOrder === 'first' ? (teamFullName || "自チーム") : (match.opponent || "相手")}
                            </div>
                          </td>
                          {Array.from({ length: inningCount }).map((_, i) => {
                            const val = formatScoreDisplay({ score: topScores[i], isBottom: false, isInningFinal: i === inningCount - 1, isHomeWinning });
                            const scored = typeof topScores[i] === "number" && (topScores[i] as number) > 0;
                            return (
                              <td key={`top-${i}`} className="py-2">
                                {scored && isMyFirst ? (
                                  <span className="inline-block min-w-5 px-1 py-0.5 rounded bg-primary text-primary-foreground font-black leading-none">{val}</span>
                                ) : (
                                  <span className={scored ? "text-foreground font-black" : "text-muted-foreground"}>{val}</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="py-2 px-3 font-black text-primary border-l border-border bg-muted/60 text-sm sm:text-base">{isFuture ? "-" : firstScore}</td>
                        </tr>
                        <tr>
                          <td className="py-2 px-3 text-left font-black text-foreground">
                            <div className="w-16 truncate md:w-auto md:whitespace-normal">
                              {match.battingOrder === 'second' ? (teamFullName || "自チーム") : (match.opponent || "相手")}
                            </div>
                          </td>
                          {Array.from({ length: inningCount }).map((_, i) => {
                            const val = formatScoreDisplay({ score: bottomScores[i], isBottom: true, isInningFinal: i === inningCount - 1, isHomeWinning });
                            const scored = typeof bottomScores[i] === "number" && (bottomScores[i] as number) > 0;
                            return (
                              <td key={`bottom-${i}`} className="py-2">
                                {scored && !isMyFirst ? (
                                  <span className="inline-block min-w-5 px-1 py-0.5 rounded bg-primary text-primary-foreground font-black leading-none">{val}</span>
                                ) : (
                                  <span className={scored ? "text-foreground font-black" : "text-muted-foreground"}>{val}</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="py-2 px-3 font-black text-primary border-l border-border bg-muted/60 text-sm sm:text-base">{isFuture ? "-" : secondScore}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  
                  <div className="p-3 border-t border-border bg-muted/60 flex gap-2">
                  {match.status === 'live' ? (
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/matches/score?id=${match.id}`);
                      }}
                      className="flex-1 h-11 rounded-[var(--radius-lg)] font-black gap-1.5 shadow-xs text-xs sm:text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      <PlayCircle className="h-4 w-4" strokeWidth={2.5} />
                      ライブスコアへ進む
                    </Button>
                  ) : match.status === 'scheduled' ? (
                    <>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/matches/lineup?id=${match.id}`);
                        }}
                        variant="outline"
                        className="flex-1 h-11 rounded-[var(--radius-lg)] font-black gap-1.5 shadow-xs text-[10px] sm:text-xs bg-card text-foreground border border-border/60 hover:bg-muted transition-colors"
                      >
                        <Users className="h-4 w-4 text-primary" strokeWidth={2.5} />
                        スタメン
                      </Button>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/matches/score?id=${match.id}`);
                        }}
                        className="flex-1 h-11 rounded-[var(--radius-lg)] font-black gap-1.5 shadow-xs text-[10px] sm:text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        <PlayCircle className="h-4 w-4" strokeWidth={2.5} />
                        ライブ入力
                      </Button>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/matches/result?id=${match.id}`);
                        }}
                        variant="outline"
                        className="flex-1 h-11 rounded-[var(--radius-lg)] font-black gap-1.5 shadow-xs text-[10px] sm:text-xs bg-card text-foreground border border-border/60 hover:bg-muted transition-colors"
                      >
                        <ClipboardList className="h-4 w-4 text-primary" strokeWidth={2.5} />
                        試合明細
                      </Button>
                    </>
                  ) : match.status === 'rainout' ? (
                    <>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/matches/edit?id=${match.id}`);
                        }}
                        variant="outline"
                        className="flex-1 h-11 rounded-[var(--radius-lg)] font-black gap-1.5 shadow-xs text-[10px] sm:text-xs bg-card text-foreground border border-border/60 hover:bg-muted transition-colors"
                      >
                        <Edit2 className="h-4 w-4 text-primary" strokeWidth={2.5} />
                        試合編集
                      </Button>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/matches/result?id=${match.id}`);
                        }}
                        variant="outline"
                        className="flex-1 h-11 rounded-[var(--radius-lg)] font-black gap-1.5 shadow-xs text-[10px] sm:text-xs bg-card text-foreground border border-border/60 hover:bg-muted transition-colors"
                      >
                        <ClipboardList className="h-4 w-4 text-primary" strokeWidth={2.5} />
                        試合明細
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/matches/scorebook?id=${match.id}`);
                        }}
                        variant="outline"
                        className="flex-1 h-11 rounded-[var(--radius-lg)] font-black gap-1.5 shadow-xs text-[10px] sm:text-xs bg-card text-foreground border border-border/60 hover:bg-muted transition-colors"
                      >
                        <BookOpen className="h-4 w-4 text-primary" strokeWidth={2.5} />
                        スコアブック
                      </Button>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/matches/score?id=${match.id}`);
                        }}
                        className="flex-1 h-11 rounded-[var(--radius-lg)] font-black gap-1.5 shadow-xs text-[10px] sm:text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        <PlayCircle className="h-4 w-4" strokeWidth={2.5} />
                        ライブスコア
                      </Button>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/matches/result?id=${match.id}`);
                        }}
                        variant="outline"
                        className="flex-1 h-11 rounded-[var(--radius-lg)] font-black gap-1.5 shadow-xs text-[10px] sm:text-xs bg-card text-foreground border border-border/60 hover:bg-muted transition-colors"
                      >
                        <ClipboardList className="h-4 w-4 text-primary" strokeWidth={2.5} />
                        試合明細
                      </Button>
                    </>
                  )}
                </div>

              </div>
            </div>
          )}
          </div>
        </div>
      </div>

    </div>
  );
}
