"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { format, differenceInSeconds, intervalToDuration } from "date-fns";
import { Edit2, Calendar, MapPin, Trophy, Trash2, ChevronDown, ChevronUp, Swords, BookOpen, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Match } from "@/types/match";
import { EmptyState } from "@/components/layout/EmptyState";
import { Button } from "@/components/ui/button";

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

// カウントダウン用サブコンポーネント
function MatchCountdown({ date }: { date: string }) {
  const [timeLeft, setTimeLeft] = useState("");

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
      setTimeLeft(
        `${duration.days ? duration.days + 'd ' : ''}${String(duration.hours).padStart(2, '0')}:${String(duration.minutes).padStart(2, '0')}:${String(duration.seconds).padStart(2, '0')}`
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [date]);

  return <span className="font-mono text-xs font-black text-primary">{timeLeft}</span>;
}

export function MatchList({ matches, isLoading, onDelete }: MatchListProps) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [teamFullName, setTeamFullName] = useState("");

  const [swipeId, setSwipeId] = useState<string | null>(null);
  const [offsetX, setOffsetX] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const startOffsetX = useRef<number>(0);
  const isVerticalScroll = useRef(false);

  const ACTION_WIDTH = 75;

  useEffect(() => {
    const fetchTeamName = async () => {
      const teamId = localStorage.getItem("iscore_selectedTeamId");
      if (!teamId) return;
      const teamRes = await fetch("/api/auth/me");
      if (teamRes.ok) {
        const res = (await teamRes.json()) as { data: { memberships: { teamId: string; organizationName?: string; teamName: string }[] } };
        const currentMembership = res.data.memberships.find(m => m.teamId === teamId);
        if (currentMembership) {
          setTeamFullName(`${currentMembership.organizationName ?? ""} ${currentMembership.teamName}`.trim());
        }
      }
    };
    fetchTeamName();
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-3 px-1">
        {[1, 2, 3].map((i) => <div key={i} className="h-28 w-full rounded-2xl bg-muted/50 animate-pulse" />)}
      </div>
    );
  }

  if (!matches || matches.length === 0) {
    return <EmptyState icon={Swords} title="試合データがありません" description="No match data recorded yet" />;
  }

  // ━━ ハンドラ類 ━━
  const handleTouchStart = (e: React.TouchEvent, id: string) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setSwipeId(id);
    startOffsetX.current = swipeId === id ? offsetX : 0;
    isVerticalScroll.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || isVerticalScroll.current) return;
    const diffX = e.touches[0].clientX - touchStartX.current;
    if (Math.abs(e.touches[0].clientY - (touchStartY.current || 0)) > 10) { isVerticalScroll.current = true; return; }
    setOffsetX(Math.max(Math.min(startOffsetX.current + diffX, ACTION_WIDTH), -ACTION_WIDTH));
  };

  const handleTouchEnd = () => {
    if (Math.abs(offsetX) > ACTION_WIDTH / 2) setOffsetX(offsetX > 0 ? ACTION_WIDTH : -ACTION_WIDTH);
    else { setOffsetX(0); setSwipeId(null); }
  };

  return (
    <div className="space-y-3 overflow-x-hidden px-1 pb-1">
      {matches.map((match) => {
        const isFuture = new Date(match.date) > new Date();
        const isExpanded = expandedId === match.id;
        const isSwiping = swipeId === match.id;
        const firstScore = match.battingOrder === 'first' ? match.myScore : match.opponentScore;
        const secondScore = match.battingOrder === 'second' ? match.myScore : match.opponentScore;
        const topScores = match.battingOrder === 'first' ? (match.myInningScores || []) : (match.opponentInningScores || []);
        const bottomScores = match.battingOrder === 'second' ? (match.myInningScores || []) : (match.opponentInningScores || []);

        return (
          <div key={match.id} className={cn("group relative overflow-hidden rounded-[20px] border", isExpanded ? "border-primary/40" : "border-border/50")}>
            <div className={cn("absolute inset-0 z-0 flex transition-opacity", isSwiping && Math.abs(offsetX) > 0 ? "opacity-100" : "opacity-0 pointer-events-none")}>
              <button onClick={() => router.push(`/matches/edit?id=${match.id}`)} className="w-[75px] bg-blue-500 text-white flex flex-col items-center justify-center">
                <Edit2 className="h-5 w-5 mb-1" /><span className="text-[10px] font-black">編集</span>
              </button>
              <button onClick={() => { if(confirm("削除しますか？")) onDelete?.(match.id); }} className="ml-auto w-[75px] bg-rose-500 text-white flex flex-col items-center justify-center">
                <Trash2 className="h-5 w-5 mb-1" /><span className="text-[10px] font-black">削除</span>
              </button>
            </div>

            <div
              onTouchStart={(e) => handleTouchStart(e, match.id)}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              style={{ transform: `translateX(${isSwiping ? offsetX : 0}px)` }}
              className={cn("relative z-10 transition-transform duration-200", isExpanded ? "bg-primary/5" : "bg-card")}
            >
              <div className="p-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : match.id)}>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={cn("text-[10px] font-black px-1.5 py-0.5 rounded", match.matchType === 'official' ? "bg-amber-500/10 text-amber-600" : "bg-emerald-500/10 text-emerald-600")}>
                        {match.matchType === 'official' ? '公式戦' : '練習試合'}
                      </span>
                      <span className="text-xs font-bold text-muted-foreground">{match.date}</span>
                    </div>
                    <h3 className="text-lg font-black truncate">vs {match.opponent}</h3>
                  </div>

                  <div className="flex flex-col items-center gap-1.5 shrink-0">
                    {!isFuture && (
                       <div className="w-14 text-center">
                         {match.myScore > match.opponentScore && <span className="block w-full bg-blue-600 text-white text-[10px] font-black py-0.5 rounded">WIN</span>}
                         {match.myScore < match.opponentScore && <span className="block w-full bg-rose-600 text-white text-[10px] font-black py-0.5 rounded">LOSE</span>}
                       </div>
                    )}
                    
                    {isFuture ? (
                      <div className="px-3 py-1.5 bg-primary/10 rounded-xl border border-primary/20 text-center min-w-[80px]">
                        <p className="text-[9px] font-black text-primary/70 uppercase">Starts in</p>
                        <MatchCountdown date={match.date} />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/5 rounded-xl border border-primary/20">
                        <span className="text-xl font-black">{firstScore} - {secondScore}</span>
                      </div>
                    )}
                  </div>
                </div>

                {isExpanded && !isFuture && (
                  <div className="mt-4 pt-2 border-t border-border/20">
                     <div className="text-xs font-bold text-center text-muted-foreground pb-2">スコア詳細エリア</div>
                     <div className="flex gap-2">
                        <Button onClick={(e) => { e.stopPropagation(); router.push(`/matches/${match.id}/scorebook`); }} variant="outline" className="flex-1 h-10 text-xs font-black"><BookOpen className="h-4 w-4 mr-2" />スコアブック</Button>
                        <Button onClick={(e) => { e.stopPropagation(); router.push(`/matches/${match.id}`); }} className="flex-1 h-10 text-xs font-black"><ClipboardList className="h-4 w-4 mr-2" />詳細</Button>
                     </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
