// filepath: src/components/matches/match-card.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { format, differenceInSeconds, intervalToDuration } from "date-fns";
import { Edit2, Calendar, MapPin, Trash2, ChevronDown, ChevronUp, PlayCircle, Users, BookOpen, ClipboardList, Clock } from "lucide-react";
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

// 安全に日付をフォーマットするヘルパー（パース失敗時は元の文字列を返す）
const formatSafeDate = (dateStr: string, fmt: string) => {
  try {
    return format(new Date(dateStr), fmt);
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
  const isHomeWinning = secondScore > firstScore;

  return (
    <div className={cn(
      "group relative overflow-hidden transition-all duration-200 ease-out",
      "rounded-[var(--radius-2xl)] border",
      isExpanded
        ? "border-primary/40 shadow-sm shadow-primary/5"
        : "border-border/50 shadow-sm"
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
              className="flex flex-col items-center justify-center w-full h-full bg-blue-500 text-white active:bg-blue-600 transition-colors"
            >
              <Edit2 className="h-5 w-5 mb-1" />
              <span className="text-[10px] font-black uppercase tracking-wider">編集</span>
            </button>
          </div>

          <div className="absolute top-0 right-0 h-full w-[75px]">
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(); setOffsetX(0); }}
              className="flex flex-col items-center justify-center w-full h-full bg-rose-500 text-white active:bg-rose-600 transition-colors"
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
          "relative z-10 h-full transition-transform duration-200 ease-out",
          isExpanded ? "bg-primary/5 dark:bg-primary/10" : "bg-card"
        )}
      >

        <div
          className="p-4 sm:p-5 cursor-pointer"
          onClick={handleCardClick}
        >
          <div className="flex items-center justify-between gap-4 pointer-events-none">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className={cn(
                  "w-16 text-center text-[10px] sm:text-xs font-black px-1.5 py-0.5 rounded shadow-sm",
                  match.matchType === 'official' ? "bg-amber-500/10 text-amber-600 border border-amber-500/20" :
                  match.matchType === 'exchange' ? "bg-blue-500/10 text-blue-600 border border-blue-500/20" :
                  "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                )}>
                  {match.matchType === 'official' ? '公式戦' : match.matchType === 'exchange' ? '交流戦' : 'OP戦'}
                </span>
                <span className="text-xs sm:text-sm font-bold text-muted-foreground truncate">
                  {match.tournamentName || (match.matchType === 'official' ? "大会名未登録" : match.matchType === 'exchange' ? "交流戦" : "OP戦")}
                </span>
              </div>

              <h3 className="text-lg sm:text-xl font-black truncate text-foreground mb-1">
                vs {match.opponent}
              </h3>
              
              <p className="text-[11px] sm:text-xs font-bold text-muted-foreground flex items-center gap-1.5 mt-1 truncate">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                <span>{formatSafeDate(match.date, "MM/dd HH:mm")}</span>
                <span className="text-border">|</span>
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{match.venueShortName || match.venueName || match.surfaceDetails || "球場未設定"}</span>
                {youtubeVideoId && (
                  <>
                    <span className="text-border mx-0.5">|</span>
                    <PlayCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                  </>
                )}
              </p>
            </div>

            <div className="flex flex-col items-center gap-1.5 shrink-0">
              {!isFuture && match.status !== 'rainout' && (
                <div className="w-14 text-center">
                  {isWin && <span className="block w-full bg-blue-600 text-white text-[11px] font-black py-0.5 rounded shadow-sm">WIN</span>}
                  {isLoss && <span className="block w-full bg-rose-600 text-white text-[11px] font-black py-0.5 rounded shadow-sm">LOSE</span>}
                  {isDraw && <span className="block w-full bg-zinc-500 text-white text-[11px] font-black py-0.5 rounded shadow-sm">DRAW</span>}
                </div>
              )}
              {match.status === 'rainout' && (
                <div className="w-16 text-center">
                  <span className="block w-full bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30 text-[10px] sm:text-[11px] font-black py-0.5 rounded shadow-sm">雨天中止</span>
                </div>
              )}
              
              {match.status === 'rainout' ? (
                <div className="px-2.5 py-1.5 bg-blue-500/5 dark:bg-blue-500/10 rounded-xl border border-blue-500/20 text-center min-w-[85px] flex flex-col items-center justify-center">
                  <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 leading-none">☔ 中止</p>
                </div>
              ) : isFuture ? (
                <div className="px-1 py-1.5 bg-primary/10 rounded-xl border border-primary/20 text-center min-w-[85px] flex flex-col items-center justify-center">
                  <p className="text-[8px] font-black text-primary/70 uppercase leading-none mb-0.5">START IN</p>
                  <MatchCountdown date={match.date} />
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/5 rounded-xl border border-primary/20">
                  <div className="text-center w-7">
                    <p className="text-[9px] font-black text-primary/70 uppercase leading-none">先</p>
                    <span className="text-xl font-black tabular-nums leading-none text-foreground">{firstScore}</span>
                  </div>
                  <span className="text-sm font-black text-primary/30">-</span>
                  <div className="text-center w-7">
                    <p className="text-[9px] font-black text-primary/70 uppercase leading-none">後</p>
                    <span className="text-xl font-black tabular-nums leading-none text-foreground">{secondScore}</span>
                  </div>
                </div>
              )}
              {isExpanded ? <ChevronUp className="h-4 w-4 text-primary mt-1" /> : <ChevronDown className="h-4 w-4 text-muted-foreground/50 mt-1" />}
            </div>
          </div>

          {isExpanded && (
            <div className="mt-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="w-full overflow-hidden rounded-xl border border-border bg-card shadow-sm flex flex-col pointer-events-auto">
                
                {!isFuture && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-center whitespace-nowrap">
                      <thead className="bg-primary/5 border-b border-border/50">
                        <tr>
                          <th className="py-2 px-3 text-left font-normal text-muted-foreground text-xs w-20 md:w-32">TEAM</th>
                          {Array.from({ length: inningCount }).map((_, i) => (
                            <th key={i} className="py-2 px-1 sm:px-2 text-sm md:text-base font-semibold text-foreground">{i + 1}</th>
                          ))}
                          <th className="py-2 px-3 text-sm md:text-base font-bold text-primary">R</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50 text-xs sm:text-sm font-medium tabular-nums">
                        <tr>
                          <td className="py-2 px-3 text-left">
                            <div className="w-16 truncate md:w-auto md:whitespace-normal">
                              {match.battingOrder === 'first' ? (teamFullName || "自チーム") : (match.opponent || "相手")}
                            </div>
                          </td>
                          {Array.from({ length: inningCount }).map((_, i) => (
                            <td key={`top-${i}`} className="py-2 text-muted-foreground">
                              {formatScoreDisplay({ score: topScores[i], isBottom: false, isInningFinal: i === inningCount - 1, isHomeWinning })}
                            </td>
                          ))}
                          <td className="py-2 px-3 font-bold text-primary">{firstScore}</td>
                        </tr>
                        <tr>
                          <td className="py-2 px-3 text-left">
                            <div className="w-16 truncate md:w-auto md:whitespace-normal">
                              {match.battingOrder === 'second' ? (teamFullName || "自チーム") : (match.opponent || "相手")}
                            </div>
                          </td>
                          {Array.from({ length: inningCount }).map((_, i) => (
                            <td key={`bottom-${i}`} className="py-2 text-foreground font-semibold">
                              {formatScoreDisplay({ score: bottomScores[i], isBottom: true, isInningFinal: i === inningCount - 1, isHomeWinning })}
                            </td>
                          ))}
                          <td className="py-2 px-3 font-bold text-primary">{secondScore}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
                
                <div className="p-3 border-t border-border/50 bg-muted/20 flex gap-2">
                  {match.status === 'live' ? (
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/matches/score?id=${match.id}`);
                      }}
                      className="flex-1 h-11 rounded-[var(--radius-lg)] font-black gap-1.5 shadow-sm text-xs sm:text-sm bg-primary text-primary-foreground hover:scale-[1.02] transition-transform shadow-[0_0_15px_rgba(var(--primary),0.2)]"
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
                        className="flex-1 h-11 rounded-[var(--radius-lg)] font-black gap-1.5 shadow-sm text-[10px] sm:text-xs bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 transition-colors"
                      >
                        <Users className="h-4 w-4" strokeWidth={2.5} />
                        スタメン
                      </Button>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/matches/score?id=${match.id}`);
                        }}
                        className="flex-1 h-11 rounded-[var(--radius-lg)] font-black gap-1.5 shadow-sm text-[10px] sm:text-xs bg-primary text-primary-foreground hover:scale-[1.02] transition-transform shadow-[0_0_15px_rgba(var(--primary),0.2)]"
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
                        className="flex-1 h-11 rounded-[var(--radius-lg)] font-black gap-1.5 shadow-sm text-[10px] sm:text-xs bg-card border-border hover:bg-primary/5 hover:text-primary transition-colors"
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
                        className="flex-1 h-11 rounded-[var(--radius-lg)] font-black gap-1.5 shadow-sm text-[10px] sm:text-xs bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 transition-colors"
                      >
                        <Edit2 className="h-4 w-4" strokeWidth={2.5} />
                        試合編集
                      </Button>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/matches/result?id=${match.id}`);
                        }}
                        variant="outline"
                        className="flex-1 h-11 rounded-[var(--radius-lg)] font-black gap-1.5 shadow-sm text-[10px] sm:text-xs bg-card border-border hover:bg-primary/5 hover:text-primary transition-colors"
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
                        className="flex-1 h-11 rounded-[var(--radius-lg)] font-black gap-1.5 shadow-sm text-[10px] sm:text-xs bg-card border-border hover:bg-primary/5 hover:text-primary transition-colors"
                      >
                        <BookOpen className="h-4 w-4 text-primary" strokeWidth={2.5} />
                        スコアブック
                      </Button>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/matches/score?id=${match.id}`);
                        }}
                        className="flex-1 h-11 rounded-[var(--radius-lg)] font-black gap-1.5 shadow-sm text-[10px] sm:text-xs bg-primary text-primary-foreground hover:scale-[1.02] transition-transform shadow-[0_0_15px_rgba(var(--primary),0.2)]"
                      >
                        <PlayCircle className="h-4 w-4" strokeWidth={2.5} />
                        ライブスコア
                      </Button>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/matches/result?id=${match.id}`);
                        }}
                        className="flex-1 h-11 rounded-[var(--radius-lg)] font-black gap-1.5 shadow-sm text-[10px] sm:text-xs bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 transition-colors"
                      >
                        <ClipboardList className="h-4 w-4" strokeWidth={2.5} />
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
  );
}
