// filepath: src/components/features/team/TeamCalendar.tsx
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Calendar, Plus, MapPin, Trophy, Activity, Info, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
}

export const TeamCalendar: React.FC<TeamCalendarProps> = ({ matches, canManage, teamId }) => {
  const router = useRouter();
  
  // 現在表示しているカレンダーの年月
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  // 選択している日付 (初期値は今日)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

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
    return matches.filter(m => m.date === dateStr);
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
    <div className="bg-white/50 dark:bg-zinc-900/50 backdrop-blur-xl border border-border/40 rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all p-5 sm:p-7 space-y-6">
      
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
                !day.isCurrentMonth && "opacity-35 text-muted-foreground/50",
                day.isCurrentMonth && "hover:bg-zinc-100/70 dark:hover:bg-zinc-800/50",
                day.isCurrentMonth && isSunday && "text-rose-500",
                day.isCurrentMonth && isSaturday && "text-blue-500",
                isToday && "bg-primary/5 border-primary/20 text-primary font-black",
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
                return (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-zinc-50/70 dark:bg-zinc-900/40 border border-border/20 gap-3 shadow-xs hover:border-primary/20 transition-all"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* 試合タイプバッジ */}
                        <span
                          className={cn(
                            "text-[9px] font-black tracking-wider px-2 py-0.5 rounded-sm uppercase",
                            item.matchType === "official"
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          )}
                        >
                          {item.matchType === "official" ? "公式戦" : "練習試合"}
                        </span>

                        {/* ステータスバッジ */}
                        {item.status === "live" ? (
                          <span className="text-[9px] font-black bg-rose-500 text-white px-2 py-0.5 rounded-sm flex items-center gap-0.5 animate-pulse">
                            <Activity className="h-2.5 w-2.5" /> LIVE
                          </span>
                        ) : item.status === "finished" ? (
                          renderMatchResultText(item)
                        ) : (
                          <span className="text-[9px] font-bold bg-zinc-200/60 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-2 py-0.5 rounded-sm">
                            試合前
                          </span>
                        )}
                      </div>

                      <h5 className="font-black text-sm text-foreground">
                        vs {item.opponent || "対戦相手未定"}
                      </h5>

                      <div className="flex items-center gap-3 text-[10px] font-bold text-muted-foreground">
                        {item.venueName && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-primary/60" /> {item.venueName}
                          </span>
                        )}
                        {item.battingOrder && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-primary/60" /> {item.battingOrder === "first" ? "先攻" : "後攻"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* スコア・ボタンアクション */}
                    <div className="flex items-center justify-between sm:justify-end gap-2 border-t sm:border-t-0 pt-3 sm:pt-0 border-border/30">
                      {item.status === "finished" && (
                        <div className="text-right sm:mr-2">
                          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Score</p>
                          <p className="text-lg font-black text-foreground tabular-nums leading-none mt-1">
                            {item.myScore} - {item.opponentScore}
                          </p>
                        </div>
                      )}

                      {/* 📅 Googleカレンダー登録リンク */}
                      <a
                        href={`https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(item.title || `試合: vs ${item.opponent || "対戦相手未定"}`)}&dates=${item.date.replace(/-/g, "")}/${item.date.replace(/-/g, "")}&location=${encodeURIComponent(item.venueName || "")}&details=${encodeURIComponent(item.description || "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-9 px-3 rounded-xl border border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center text-[10px] font-bold transition-colors"
                        title="Googleカレンダーに登録"
                      >
                        カレンダー登録
                      </a>

                      {/* 🚗 試合用の配車管理ボタン (試合終了前) */}
                      {item.status !== "finished" && (
                        <Button
                          onClick={() => router.push(`/attendance/carpool?eventId=${item.id}`)}
                          variant="outline"
                          size="sm"
                          className="h-9 font-black rounded-xl px-3 text-xs border-primary text-primary hover:bg-primary/5 cursor-pointer"
                        >
                          配車管理
                        </Button>
                      )}

                      <Button
                        onClick={() => handleActionClick(item)}
                        size="sm"
                        className="h-9 font-black rounded-xl px-4 text-xs"
                      >
                        {item.status === "finished" ? "試合結果" : item.status === "live" ? "スコア入力" : "メンバー編成"}
                      </Button>
                    </div>
                  </div>
                );
              } else {
                // 練習、会議、その他の日程 (events) カード
                return (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-zinc-50/70 dark:bg-zinc-900/40 border border-border/20 gap-3 shadow-xs hover:border-primary/20 transition-all"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* イベント種別バッジ */}
                        <span
                          className={cn(
                            "text-[9px] font-black tracking-wider px-2 py-0.5 rounded-sm uppercase",
                            item.type === "practice"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : item.type === "meeting"
                                ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                                : item.type === "camp"
                                  ? "bg-orange-500/10 text-orange-600 dark:text-orange-400"
                                  : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400"
                          )}
                        >
                          {item.type === "practice" ? "練習" : item.type === "meeting" ? "会議" : item.type === "camp" ? "合宿" : "その他予定"}
                        </span>

                        {item.dutyGroup && (
                          <span className="text-[8px] font-extrabold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded-xs">
                            当番: {item.dutyGroup}
                          </span>
                        )}
                      </div>

                      <h5 className="font-black text-sm text-foreground truncate" title={item.title}>
                        {item.title}
                      </h5>

                      <div className="flex items-center gap-3 text-[10px] font-bold text-muted-foreground flex-wrap">
                        {item.venueName && (
                          <span className="flex items-center gap-1" title={item.venueName}>
                            <MapPin className="h-3 w-3 text-primary/60" /> {item.venueName}
                          </span>
                        )}
                        {item.pmLocation && (
                          <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400" title={item.pmLocation}>
                            <MapPin className="h-3 w-3 text-blue-500/60" /> 午後: {item.pmLocation}
                          </span>
                        )}
                      </div>

                      {item.description && (
                        <p className="text-[10px] text-muted-foreground font-medium line-clamp-2 mt-1 whitespace-pre-line">
                          {item.description}
                        </p>
                      )}
                    </div>

                    {/* ボタンアクション */}
                    <div className="flex items-center justify-between sm:justify-end gap-2 border-t sm:border-t-0 pt-3 sm:pt-0 border-border/30 shrink-0">
                      {/* 📅 Googleカレンダー登録リンク */}
                      <a
                        href={`https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(item.title || "チーム予定")}&dates=${item.date.replace(/-/g, "")}/${item.date.replace(/-/g, "")}&location=${encodeURIComponent(item.venueName || "")}&details=${encodeURIComponent(item.description || "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-9 px-3 rounded-xl border border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center text-[10px] font-bold transition-colors"
                        title="Googleカレンダーに登録"
                      >
                        カレンダー登録
                      </a>

                      {/* 🚗 合宿用の配車管理ボタン */}
                      {item.type === "camp" && (
                        <Button
                          onClick={() => router.push(`/attendance/carpool?eventId=${item.id}`)}
                          variant="outline"
                          size="sm"
                          className="h-9 font-black rounded-xl px-3 text-xs border-primary text-primary hover:bg-primary/5 cursor-pointer"
                        >
                          配車管理
                        </Button>
                      )}

                      <Button
                        onClick={() => router.push(`/attendance`)}
                        size="sm"
                        className="h-9 font-black rounded-xl px-4 text-xs"
                      >
                        出欠確認
                      </Button>
                    </div>
                  </div>
                );
              }
            })}
          </div>
        )}
      </div>
    </div>
  );
};
