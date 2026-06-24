// filepath: src/components/features/team/TeamCalendar.tsx
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Calendar, Plus, MapPin, Trophy, Activity, Info, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MatchCard } from "@/components/matches/match-card";
import { Match, MatchStatus, MatchType, BattingOrder } from "@/types/match";
import { EventCard } from "./event-card";

export interface CalendarMatch {
  id: string;
  type?: 'match' | 'practice' | 'meeting' | 'camp' | 'event';
  date: string; // YYYY-MM-DD
  title?: string;
  opponent?: string;
  myScore?: number | null;
  opponentScore?: number | null;
  matchType?: string; // 'official' | 'practice'
  status?: string; // 'scheduled' | 'live' | 'finished'
  battingOrder?: string;
  venueName?: string | null;
  venueShortName?: string | null;
  description?: string | null;
  location?: string | null;
  dutyGroup?: string | null;
  pmStartAt?: string | number | null;
  pmEndAt?: string | number | null;
  pmLocation?: string | null;
}

interface TeamCalendarProps {
  matches: CalendarMatch[];
  canManage: boolean;
  teamId: string;
  onRefresh?: () => void;
}

export const TeamCalendar: React.FC<TeamCalendarProps> = ({ matches, canManage, teamId, onRefresh }) => {
  const router = useRouter();
  
  // 現在表示しているカレンダーの年月
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  // 選択している日付 (初期値は今日)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  // 試合カードの展開ステート
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  // 自チーム名
  const [teamFullName, setTeamFullName] = useState("");

  useEffect(() => {
    const fetchTeamName = async () => {
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
  }, [teamId]);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth(); // 0-11

  // 月切り替えハンドラー
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

  // カレンダーグリッドに表示する全日付を算出 (42マス)
  const getCalendarDays = () => {
    const days = [];
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const startDayOfWeek = firstDayOfMonth.getDay(); // 0(日) - 6(土)

    // 前月の末尾
    const prevMonthLastDate = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: new Date(currentYear, currentMonth - 1, prevMonthLastDate - i),
        isCurrentMonth: false,
      });
    }

    // 当月の日付
    const currentMonthLastDate = new Date(currentYear, currentMonth + 1, 0).getDate();
    for (let i = 1; i <= currentMonthLastDate; i++) {
      days.push({
        date: new Date(currentYear, currentMonth, i),
        isCurrentMonth: true,
      });
    }

    // 翌月の先頭 (42マスになるようにパディング)
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: new Date(currentYear, currentMonth + 1, i),
        isCurrentMonth: false,
      });
    }

    return days;
  };

  const calendarDays = getCalendarDays();
  const weekDays = ["日", "月", "火", "水", "木", "金", "土"];

  // 日付オブジェクトを YYYY-MM-DD 文字列に変換 (タイムゾーン考慮)
  const formatDateString = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const selectedDateStr = formatDateString(selectedDate);
  const todayStr = formatDateString(new Date());

  // 特定の日付の試合一覧を取得
  const getMatchesForDate = (dateStr: string) => {
    return matches.filter(m => m.date.startsWith(dateStr));
  };

  const selectedDayMatches = getMatchesForDate(selectedDateStr);

  // カレンダーセルに表示するための、特定の日付の簡易ステータス
  const getDateStatus = (dateStr: string) => {
    const dayEvents = getMatchesForDate(dateStr);
    if (dayEvents.length === 0) return null;
    
    // 進行中の試合があれば最優先
    if (dayEvents.some(e => e.status === "live")) return "live";
    // 公式戦が含まれるか
    if (dayEvents.some(e => (!e.type || e.type === "match") && e.matchType === "official")) return "official";
    // 練習試合が含まれるか
    if (dayEvents.some(e => !e.type || e.type === "match")) return "match_practice";
    // 練習
    if (dayEvents.some(e => e.type === "practice")) return "practice";
    // 合宿
    if (dayEvents.some(e => e.type === "camp")) return "camp";
    // 会議
    if (dayEvents.some(e => e.type === "meeting")) return "meeting";
    
    return "other";
  };

  // 試合結果に応じた勝利・敗戦・引き分けアイコン
  const renderMatchResultText = (match: CalendarMatch) => {
    if (match.status !== "finished") return null;
    const myScore = match.myScore ?? 0;
    const oppScore = match.opponentScore ?? 0;
    if (myScore > oppScore) {
      return <span className="text-xs font-black text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-sm">○ 勝ち</span>;
    } else if (myScore < oppScore) {
      return <span className="text-xs font-black text-rose-600 bg-rose-500/10 px-2 py-0.5 rounded-sm">● 負け</span>;
    } else {
      return <span className="text-xs font-black text-zinc-500 bg-zinc-500/10 px-2 py-0.5 rounded-sm">△ 引分</span>;
    }
  };

  // アクションボタンクリック時の遷移ハンドラー
  const handleActionClick = (match: CalendarMatch) => {
    if (match.status === "finished") {
      router.push(`/matches/result?matchId=${match.id}`);
    } else if (match.status === "live") {
      router.push(`/matches/score?matchId=${match.id}`);
    } else {
      router.push(`/matches/lineup?matchId=${match.id}`);
    }
  };

  return (
    <div className="bg-white dark:bg-black border border-border/60 rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all p-5 sm:p-7 space-y-6">
      
      {/* ━━ カレンダーヘッダー ━━ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-black text-foreground">試合カレンダー</h3>
            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">Match Schedule</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" onClick={handlePrevMonth}>
            <ChevronLeft className="h-5 w-5 text-muted-foreground" />
          </Button>
          <span className="text-base sm:text-lg font-black min-w-[110px] text-center tabular-nums text-foreground">
            {currentYear}年 {currentMonth + 1}月
          </span>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" onClick={handleNextMonth}>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs font-black border border-border/60 hover:bg-zinc-50 dark:hover:bg-zinc-900 rounded-lg px-2.5 ml-1" onClick={handleToday}>
            今日
          </Button>
        </div>
      </div>

      {/* ━━ 曜日ヘッダー ━━ */}
      <div className="grid grid-cols-7 text-center text-[11px] sm:text-xs font-black text-muted-foreground uppercase tracking-widest pb-2.5 border-b border-border/30">
        {weekDays.map((day, idx) => (
          <span key={day} className={cn(idx === 0 && "text-rose-500", idx === 6 && "text-blue-500")}>
            {day}
          </span>
        ))}
      </div>

      {/* ━━ 日付グリッド (42マス) ━━ */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day, idx) => {
          const dayStr = formatDateString(day.date);
          const isSelected = selectedDateStr === dayStr;
          const isToday = todayStr === dayStr;
          const status = getDateStatus(dayStr);
          
          // 日曜日または土曜日のカラーリング
          const dayOfWeek = day.date.getDay();
          const isSunday = dayOfWeek === 0;
          const isSaturday = dayOfWeek === 6;

          return (
            <button
              key={idx}
              onClick={() => setSelectedDate(day.date)}
              className={cn(
                "relative aspect-square flex flex-col items-center justify-center rounded-xl transition-all active:scale-95 cursor-pointer border border-transparent select-none",
                !day.isCurrentMonth && "text-muted-foreground/30",
                day.isCurrentMonth && "hover:bg-zinc-100 dark:hover:bg-zinc-900",
                day.isCurrentMonth && isSunday && "text-rose-500",
                day.isCurrentMonth && isSaturday && "text-blue-500",
                isToday && "bg-primary/10 dark:bg-primary/25 border-primary/30 text-primary font-black",
                isSelected && "bg-primary text-primary-foreground hover:bg-primary border-primary ring-2 ring-primary/20"
              )}
            >
              <span className="text-sm sm:text-base font-black tabular-nums">
                {day.date.getDate()}
              </span>

              {/* 試合有無のバッジドット */}
              {status && (
                <span className="absolute bottom-1 flex h-1.5 w-1.5 justify-center">
                  {status === "live" ? (
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        isSelected ? "bg-white" : 
                        status === "official" ? "bg-blue-500" : 
                        status === "match_practice" ? "bg-amber-500" :
                        status === "practice" ? "bg-emerald-500" :
                        status === "camp" ? "bg-orange-500" :
                        status === "meeting" ? "bg-purple-500" : "bg-zinc-400"
                      )}
                    />
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ━━ 選択された日付の試合予定カードエリア ━━ */}
      <div className="pt-4 border-t border-border/40 space-y-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs sm:text-sm font-black text-muted-foreground flex items-center gap-1.5">
            <Info className="h-4 w-4 text-primary/60" />
            {selectedDate.getFullYear()}年{selectedDate.getMonth() + 1}月{selectedDate.getDate()}日の予定
          </h4>

          {/* 管理者向け予定追加ボタン */}
          {canManage && selectedDayMatches.length === 0 && (
            <Button
              onClick={() => router.push(`/matches/create?date=${selectedDateStr}`)}
              variant="ghost"
              size="sm"
              className="h-7 text-[10px] font-black border border-dashed border-border/80 text-muted-foreground hover:text-foreground hover:bg-zinc-50 dark:hover:bg-zinc-900 rounded-lg px-2 gap-1"
            >
              <Plus className="h-3 w-3" />
              試合予定を追加
            </Button>
          )}
        </div>

        {selectedDayMatches.length === 0 ? (
          <div className="text-center py-8 bg-zinc-50/50 dark:bg-zinc-950/20 border border-dashed border-border/30 rounded-2xl">
            <p className="text-xs font-bold text-muted-foreground">この日の予定はありません</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {selectedDayMatches.map(item => {
              const isMatch = !item.type || item.type === "match";

              if (isMatch) {
                const mappedMatch: Match = {
                  id: item.id,
                  opponent: item.opponent || "対戦相手未定",
                  date: item.date,
                  myScore: item.myScore ?? 0,
                  opponentScore: item.opponentScore ?? 0,
                  status: (item.status as MatchStatus) || 'scheduled',
                  matchType: (item.matchType as MatchType) || 'practice',
                  battingOrder: (item.battingOrder as BattingOrder) || 'first',
                  venueName: item.venueName || "",
                  venueShortName: item.venueShortName || null,
                };

                return (
                  <MatchCard
                    key={item.id}
                    match={mappedMatch}
                    isExpanded={expandedMatchId === item.id}
                    onToggleExpand={() => setExpandedMatchId(expandedMatchId === item.id ? null : item.id)}
                    enableSwipe={canManage} // 管理者ならカレンダー下でもフリック編集・削除を有効化
                    onDelete={() => {
                      if (onRefresh) onRefresh();
                    }}
                    teamFullName={teamFullName}
                  />
                );
              } else {
                // 練習、会議、その他の日程 (events) カード
                return (
                  <EventCard
                    key={item.id}
                    event={item}
                    teamId={teamId}
                    enableSwipe={canManage} // 管理者の場合にフリック操作を有効化
                    onDelete={() => {
                      if (onRefresh) onRefresh();
                    }}
                  />
                );
              }
            })}
          </div>
        )}
      </div>
    </div>
  );
};
