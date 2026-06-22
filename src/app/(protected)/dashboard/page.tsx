// filepath: `src/app/(protected)/dashboard/page.tsx`
"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Activity,
  Clock,
  CloudSun,
  Navigation,
  Wind,
  MapPin,
  CalendarDays,
  CalendarPlus,
  PlayCircle,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MatchList } from "@/components/matches/match-list";
import { ScoreTypeSelector } from "@/components/features/dashboard/ScoreTypeSelector";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { EmptyState } from "@/components/layout/EmptyState";
import { useTeam } from "@/contexts/TeamContext"; // 💡 TeamContextを使用
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Match } from "@/types/match";
import { getWindDirectionLabel, getWMOWeatherText, reverseGeocode, type OpenMeteoResponse } from "@/lib/weather";
import { cn } from "@/lib/utils";
import { TeamCalendar, CalendarMatch } from "@/components/features/team/TeamCalendar";

interface WeatherData {
  temp: number;
  weatherCode: number;
  windDir: number;
  windSpd: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const { currentTeam } = useTeam(); // 💡 Contextから取得
  const [matches, setMatches] = useState<Match[]>([]);
  const [calendarMatches, setCalendarMatches] = useState<CalendarMatch[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [mounted, setMounted] = useState(false);
  const [isWeatherLoading, setIsWeatherLoading] = useState(false);

  // 自チーム名の取得
  const myTeamName = useMemo(() => {
    return currentTeam?.name || (typeof window !== "undefined" ? localStorage.getItem("iscore_selectedTeamName") : null) || "自チーム";
  }, [currentTeam?.name]);

  // 1. マウント管理 & 時計タイマー
  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. 認証・管理者チェック
  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const { data: session } = await authClient.getSession();
        if (session?.user?.role === "SYSTEM_ADMIN") {
          router.replace("/admin");
        }
      } catch (err) { console.warn("Auth check deferred."); }
    };
    checkAdmin();
  }, [router]);

  // 3. 天気・位置情報取得 (キャッシュ機構付き ＋ 手動更新対応)
  const refreshWeather = useCallback((force = false) => {
    const CACHE_KEY = "iscore_weather_cache";
    const CACHE_DURATION = 30 * 60 * 1000; // 30分

    if (!force) {
      // まずキャッシュを確認
      const cachedData = localStorage.getItem(CACHE_KEY);
      if (cachedData) {
        try {
          const parsed = JSON.parse(cachedData);
          if (Date.now() - parsed.cachedAt < CACHE_DURATION) {
            // キャッシュが有効ならそれを使う
            setWeather(parsed.weather);
            setLocationName(parsed.locationName);
            return; // APIコールとGPS起動を完全にスキップ
          }
        } catch (e) {
          console.error("Cache parse error", e);
        }
      }
    }

    if ("geolocation" in navigator) {
      setIsWeatherLoading(true);
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            const res = await fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m`
            );
            let newWeather = null;
            if (res.ok) {
              const data = (await res.json()) as OpenMeteoResponse;
              newWeather = {
                temp: Math.round(data.current.temperature_2m),
                weatherCode: data.current.weather_code,
                windDir: data.current.wind_direction_10m,
                windSpd: Math.round(data.current.wind_speed_10m),
              };
              setWeather(newWeather);
            }
            const newLocationName = await reverseGeocode(lat, lon);
            setLocationName(newLocationName);

            // キャッシュに保存
            if (newWeather && newLocationName) {
              localStorage.setItem(CACHE_KEY, JSON.stringify({
                weather: newWeather,
                locationName: newLocationName,
                cachedAt: Date.now()
              }));
            }
          } catch (e) {
            console.error("Weather error", e);
          } finally {
            setIsWeatherLoading(false);
          }
        },
        () => {
          console.warn("Geolocation access denied");
          setIsWeatherLoading(false);
        }
      );
    }
  }, []);

  useEffect(() => {
    refreshWeather(false);
  }, [refreshWeather]);

  // 4. 試合データ取得 (iscore_selectedTeamId 対応)
  useEffect(() => {
    const fetchDashboardData = async () => {
      setIsLoading(true);
      try {
        const teamId = typeof window !== "undefined" ? localStorage.getItem("iscore_selectedTeamId") : null;
        if (!teamId) {
          setIsLoading(false);
          return;
        }

        const matchRes = await fetch(`/api/matches?teamId=${teamId}`);
        if (matchRes.ok) {
          const result = await matchRes.json() as any;
          let matchArray: Match[] = [];
          if (Array.isArray(result)) {
            matchArray = result;
          } else if (result && Array.isArray(result.data)) {
            matchArray = result.data;
          }
          if (matchArray.length > 0) {
            const sorted = matchArray.sort((a, b) => b.date.localeCompare(a.date));
            setMatches(sorted);
          }
        }

        // カレンダーデータの取得
        const calendarRes = await fetch(`/api/teams/${teamId}/calendar-matches`);
        if (calendarRes.ok) {
          const calendarData = await calendarRes.json() as CalendarMatch[];
          setCalendarMatches(calendarData);
        }

        // 管理者権限の判定
        const teamsRes = await fetch("/api/teams", { cache: "no-store" });
        if (teamsRes.ok) {
          const teamsData = await teamsRes.json() as any[];
          const myTeamInfo = teamsData.find(t => t.id === teamId);
          if (myTeamInfo) {
            const userRole = myTeamInfo.myRole ? String(myTeamInfo.myRole).toUpperCase() : "";
            const isFounder = myTeamInfo.isFounder === true || myTeamInfo.isFounder === 1;
            setCanManage((userRole === 'ADMIN' || userRole === 'MANAGER' || isFounder) === true);
          }
        }
      } catch (error) {
        console.error("Match fetch error:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchDashboardData();
  }, [currentTeam?.id]); // 💡 チームが切り替わったら再取得

  // 💡 削除完了時のコールバック（ローカルStateから除外して即時反映させる）
  const handleDeleteMatch = useCallback((deletedId: string) => {
    setMatches(prev => prev.filter(m => m.id !== deletedId));
    setCalendarMatches(prev => prev.filter(m => m.id !== deletedId));
  }, []);

  // 💡 1. 進行中の試合 (LIVE) だけを HERO 用に抽出
  const liveMatch = useMemo(() => {
    return matches.find(m => m.status === 'live');
  }, [matches]);

  // 💡 2. 予定されている試合 (SCHEDULED) を抽出し、昇順（近い未来が上）でソート
  const upcomingMatches = useMemo(() => {
    return matches
      .filter(m => m.status === 'scheduled')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [matches]);

  // 💡 3. 完了した試合 (FINISHED) を抽出、降順（最新の過去が上）でソートし、最新3件を取得
  const finishedMatches = useMemo(() => {
    return matches
      .filter(m => m.status === 'finished')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 3);
  }, [matches]);

  // 💡 4. 統計計算 (完了した試合のみ)
  const stats = useMemo(() => {
    const s = { win: 0, loss: 0, draw: 0 };
    matches.filter(m => m.status === 'finished').forEach(m => {
      if (m.myScore > m.opponentScore) s.win++;
      else if (m.myScore < m.opponentScore) s.loss++;
      else s.draw++;
    });
    const total = s.win + s.loss + s.draw;
    const rate = total > 0 ? (s.win / total).toFixed(3).replace(/^0/, '') : ".000";
    return { ...s, total, rate };
  }, [matches]);

  if (!mounted) return null;

  const timeString = currentTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateString = currentTime.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' });

  return (
    <div className="w-full animate-in fade-in duration-500 bg-transparent min-h-screen pb-24">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 space-y-16">

        {/* --- 1. タイトルエリア (巨大Dashboard) --- */}
      <section className="text-center space-y-3 pt-2">
        
        {/* 
          💡 解決策:
          1. text-primary -> text-foreground に変更してカメレオン同化を完全に防ぐ！
          2. アイコン（Activity）だけ text-primary にしてブランド感をシャープに維持。
          3. drop-shadow-[0_0_16px_hsl(var(--background))] を追加。
             -> 文字の背後に「背景色（ライトモードなら白、ダークなら黒）の柔らかなオーラ」を展開し、
                背後のメッシュグラデーションを優しく弾いて視認性を100%確保します！
        */}
        <h2 className="text-3xl sm:text-4xl font-black text-foreground uppercase tracking-[0.5em] flex items-center justify-center gap-4 drop-shadow-[0_0_16px_hsl(var(--background))]">
          <Activity className="h-8 w-8 sm:h-10 sm:w-10 text-primary drop-shadow-md" /> 
          {/* 💡 ワンポイント：trackingを入れると右側に余白ができて全体が左にズレるため、マイナスマージンで相殺して完璧なド真ん中（シンメトリー）を作ります */}
          <span className="mr-[-0.5em]">Dashboard</span>
        </h2>
        
        <h1 className="text-[9px] sm:text-[11px] font-bold text-muted-foreground uppercase tracking-[0.4em] drop-shadow-[0_0_12px_hsl(var(--background))]">
          <span className="mr-[-0.4em]">Match Management & Live Recording</span>
        </h1>
        
      </section>

        {/* --- 2. 環境ステータスボード (統合ウィジェット) --- */}
        <section className="bg-card dark:bg-zinc-900 border border-border/40 shadow-sm rounded-3xl p-6 sm:p-8 space-y-6">
          {/* 上部ヘッダー：現在地と手動更新ボタン */}
          <div className="flex items-center justify-between pb-4 border-b border-border/40">
            <div className="flex items-center gap-2 text-primary">
              <MapPin className={cn("h-4 w-4", isWeatherLoading && "animate-pulse")} />
              <span className="text-xs sm:text-sm font-black tracking-tight">
                現在地：{locationName || (isWeatherLoading ? "位置情報を取得中..." : "未取得")}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refreshWeather(true)}
              disabled={isWeatherLoading}
              className="h-8 w-8 rounded-full hover:bg-primary/10 text-primary shrink-0"
              title="天気と位置情報を手動更新"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isWeatherLoading && "animate-spin")} />
            </Button>
          </div>

          {/* メイングリッド：時間・天気・風向・風速 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8 text-center sm:text-left">
            {/* 時間 */}
            <div className="flex items-center gap-3 justify-center sm:justify-start">
              <div className="p-2 sm:p-2.5 bg-primary/10 rounded-xl text-primary shrink-0"><Clock className="h-5 w-5 sm:h-6 sm:w-6" /></div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase">{dateString}</p>
                <p className="text-base sm:text-lg font-black text-foreground tabular-nums leading-none mt-1">{timeString}</p>
              </div>
            </div>
            
            {/* 天気 */}
            <div className="flex items-center gap-3 justify-center sm:justify-start">
              <div className="p-2 sm:p-2.5 bg-amber-500/10 rounded-xl text-amber-500 shrink-0"><CloudSun className="h-5 w-5 sm:h-6 sm:w-6" /></div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Weather</p>
                <p className="text-sm sm:text-base font-black text-foreground leading-none mt-1">
                  {weather ? (
                    <>{getWMOWeatherText(weather.weatherCode)} <span className="text-muted-foreground text-xs ml-0.5">{weather.temp}°C</span></>
                  ) : "---"}
                </p>
              </div>
            </div>

            {/* 風向 */}
            <div className="flex items-center gap-3 justify-center sm:justify-start">
              <div className="p-2 sm:p-2.5 bg-blue-500/10 rounded-xl text-blue-500 shrink-0">
                <Navigation
                  className="h-5 w-5 sm:h-6 sm:w-6 transition-transform duration-700"
                  style={{ transform: `rotate(${weather ? weather.windDir : 45}deg)` }}
                />
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Wind Dir</p>
                <p className="text-sm sm:text-base font-black text-foreground leading-none mt-1">
                  {weather ? getWindDirectionLabel(weather.windDir) : "---"}
                </p>
              </div>
            </div>

            {/* 風速 */}
            <div className="flex items-center gap-3 justify-center sm:justify-start">
              <div className="p-2 sm:p-2.5 bg-teal-500/10 rounded-xl text-teal-500 shrink-0"><Wind className="h-5 w-5 sm:h-6 sm:w-6" /></div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Wind Spd</p>
                <p className="text-sm sm:text-base font-black text-foreground leading-none mt-1 tabular-nums">
                  {weather ? weather.windSpd : "--"} <span className="text-muted-foreground text-xs font-bold">m/s</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* --- 4.5. 試合カレンダー (CALENDAR) --- */}
        <section className="space-y-6">
          <SectionHeader title="チームスケジュール" subtitle="Team Schedule" showPulse />
          <TeamCalendar 
            matches={calendarMatches} 
            canManage={canManage} 
            teamId={currentTeam?.id || ""} 
          />
        </section>

        {/* --- 🚀 進行中の試合 (LIVE HERO SECTION) --- */}
        {liveMatch && (
          <section className="animate-bounce-in">
            <div
              onClick={() => router.push(`/matches/score?id=${liveMatch.id}`)}
              className="group relative overflow-hidden bg-card dark:bg-zinc-900 border-2 border-primary rounded-3xl p-8 shadow-2xl shadow-primary/20 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              {/* 背景の装飾 */}
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                <PlayCircle className="h-32 w-32 text-primary" />
              </div>

              <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                <div className="flex items-center gap-4">
                  <span className="flex h-3 w-3 rounded-full bg-primary animate-ping" />
                  <span className="text-primary font-black tracking-widest text-sm uppercase">Live Now Scoring</span>
                </div>

                <div className="flex items-center gap-8 sm:gap-12 lg:gap-16">
                  <div className="text-center min-w-[80px] max-w-[150px] sm:max-w-[200px]">
                    <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">My Team</p>
                    <p className="text-sm sm:text-base font-black text-foreground truncate mb-2" title={myTeamName}>
                      {myTeamName}
                    </p>
                    <p className="text-5xl font-black text-foreground tabular-nums">{liveMatch.myScore}</p>
                  </div>
                  <div className="flex flex-col items-center shrink-0">
                    <span className="text-zinc-400 dark:text-zinc-600 font-black text-xl tracking-widest">VS</span>
                    <span className="bg-primary/20 text-primary text-[10px] font-black px-3 py-1.5 rounded-full mt-2 uppercase tracking-tighter flex items-center gap-1 shadow-sm">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                      {liveMatch.currentInning}回{liveMatch.isBottom ? "裏" : "表"}
                    </span>
                  </div>
                  <div className="text-center min-w-[80px] max-w-[150px] sm:max-w-[200px]">
                    <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">Opponent</p>
                    <p className="text-sm sm:text-base font-black text-foreground truncate mb-2" title={liveMatch.opponent}>
                      {liveMatch.opponent || "相手チーム"}
                    </p>
                    <p className="text-5xl font-black text-foreground tabular-nums">{liveMatch.opponentScore}</p>
                  </div>
                </div>

                <Button className="rounded-3xl px-8 h-14 font-black bg-primary text-primary-foreground group-hover:shadow-[0_0_20px_rgba(var(--primary),0.4)]">
                  スコア入力に戻る
                  <ChevronRight className="ml-2 h-5 w-5" />
                </Button>
              </div>

              <div className="mt-6 pt-6 border-t border-border/40 flex justify-between items-center text-zinc-500">
                <span className="text-sm font-bold">{liveMatch.tournamentName || liveMatch.tournament || "公式戦"}</span>
                <span className="text-sm font-bold flex items-center gap-2">
                  <MapPin className="h-3 w-3" /> {liveMatch.venueShortName || liveMatch.venueName || liveMatch.venue || liveMatch.surfaceDetails || "球場未設定"}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* --- 3. スコア入力選択 (Real / Quick) --- */}
        <section>
          <ScoreTypeSelector liveMatchId={liveMatch?.id} />
        </section>

        {/* --- 4. チーム成績 (SEASON STANDINGS) --- */}
        <section className="space-y-6">
          <SectionHeader title="チーム成績" subtitle="Season Standings" showPulse />
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-1 bg-primary text-primary-foreground rounded-3xl p-6 flex flex-col items-center justify-center shadow-sm shadow-primary/20">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Win Rate</p>
              <p className="text-4xl font-black tabular-nums mt-1">{stats.rate}</p>
            </div>
            <div className="sm:col-span-3 grid grid-cols-3 gap-4">
              <div className="bg-card/50 border-2 border-border/40 rounded-3xl p-6 flex flex-col items-center justify-center shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 bg-blue-500 rounded-full" />
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Wins</p>
                </div>
                <p className="text-3xl font-black text-blue-600 tabular-nums">{stats.win}</p>
              </div>
              <div className="bg-card/50 border-2 border-border/40 rounded-3xl p-6 flex flex-col items-center justify-center shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 bg-rose-500 rounded-full" />
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Losses</p>
                </div>
                <p className="text-3xl font-black text-rose-600 tabular-nums">{stats.loss}</p>
              </div>
              <div className="bg-card/50 border-2 border-border/40 rounded-3xl p-6 flex flex-col items-center justify-center shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 bg-zinc-400 rounded-full" />
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Draws</p>
                </div>
                <p className="text-3xl font-black text-muted-foreground tabular-nums">{stats.draw}</p>
              </div>
            </div>
          </div>
          <div className="flex justify-center">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.3em]">
              Total: {stats.total} Matches Played
            </p>
          </div>
        </section>

        {/* --- 5. 試合予定 (UPCOMING MATCHES) --- */}
        <section className="space-y-10">
          <SectionHeader title="試合予定" subtitle="Upcoming Matches" showPulse />
          {/* 🌟 scheduled の試合があるかどうかで表示を切り替え */}
          {upcomingMatches.length > 0 ? (
            <div className="min-h-[100px]">
              <MatchList matches={upcomingMatches} isLoading={isLoading} onDelete={handleDeleteMatch} />
            </div>
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="現在、予定されている試合はありません"
              description="Next match scheduling coming soon"
            />
          )}
          {/* 🌟 追加：試合予定作成ボタン（現場の指に優しい特大サイズ） */}
          <div className="flex justify-center pt-6">
              <Button
                onClick={() => router.push('/matches/create?mode=real')}
                className="bg-white/50 dark:bg-zinc-800/50 hover:bg-primary/10 text-primary border-2 border-primary/20 rounded-3xl px-12 h-16 font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 group shadow-sm"
              >
                新しい試合予定を作成
                <ChevronRight className="ml-2 h-6 w-6 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
        </section>

        {/* --- 6. 試合結果 (LATEST MATCHES) --- */}
        <section className="space-y-10">
          <SectionHeader title="試合結果" subtitle="Latest 3 Matches" showPulse />
          <div className="min-h-[100px]">
            {/* 🌟 finishedMatches (完了済み) だけを表示 */}
            <MatchList matches={finishedMatches} isLoading={isLoading} onDelete={handleDeleteMatch} />
          </div>
          {!isLoading && matches.length > 0 && (
            <div className="flex justify-center pt-6">
              <Button
                onClick={() => router.push('/matches')}
                className="bg-white/50 dark:bg-zinc-800/50 hover:bg-primary/10 text-primary border-2 border-primary/20 rounded-3xl px-12 h-16 font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 group shadow-sm"
              >
                全ての試合結果を表示
                <ChevronRight className="ml-2 h-6 w-6 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
