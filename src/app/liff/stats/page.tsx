// filepath: src/app/liff/stats/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { useLiff } from "@/components/liff/LiffProvider";
import { EmptyState } from "@/components/layout/EmptyState";
import { cn } from "@/lib/utils";
import {
  Trophy,
  Flame,
  Activity,
  Loader2,
  Shield,
  ChevronRight,
  ScanLine,
  Target,
  TrendingUp,
  BarChart3,
  Plus,
  CheckCircle2,
  BookOpen,
} from "lucide-react";

type StatsFilterKey = "all" | "official" | "exchange" | "practice";
type StatsMainTab = "matches" | "batting" | "pitching";
type BatterSortKey = "hits" | "avg" | "rbi" | "runs";

interface TeamStatsSummary {
  totalMatches: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: string;
  winRatePercent: number;
  runsScored: number;
  runsAllowed: number;
  runDiff: string;
  avgRunsScored: string;
  avgRunsAllowed: string;
  maxRunsScored: number;
  shutouts: number;
  teamHits: number;
  opponentHits: number;
  teamErrors: number;
  opponentErrors: number;
  teamAvg: string;
  teamOps: string;
  teamHomeRuns: number;
  teamStolenBases: number;
  teamEra: string;
}

interface StatsMatchItem {
  id: string;
  date: string;
  opponent: string;
  matchType: "official" | "exchange" | "practice";
  tournamentName: string | null;
  venueName: string | null;
  battingOrder: "first" | "second";
  myScore: number;
  opponentScore: number;
  result: "win" | "loss" | "draw";
  myHits: number;
  opponentHits: number;
  myErrors: number;
  opponentErrors: number;
  isColdGame: boolean;
  isTiebreaker: boolean;
  hasScorebook?: boolean;
}

interface SeasonBatterStat {
  id: string;
  name: string;
  uniformNumber: string;
  games: number;
  plateAppearances: number;
  atBats: number;
  hits: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  totalBases: number;
  rbi: number;
  runs: number;
  walks: number;
  hitByPitch: number;
  strikeouts: number;
  sacBunts: number;
  sacFlies: number;
  stolenBases: number;
  avg: string;
  obp: string;
  ops: string;
}

interface SeasonPitcherStat {
  id: string;
  name: string;
  uniformNumber: string;
  games: number;
  outs: number;
  ip: string;
  battersFaced: number;
  hitsAllowed: number;
  homeRunsAllowed: number;
  strikeouts: number;
  walks: number;
  hitByPitch: number;
  runs: number;
  earnedRuns: number;
  era: string;
  whip: string;
}

interface StatsSectionData {
  summary: TeamStatsSummary;
  battingStats: SeasonBatterStat[];
  pitchingStats: SeasonPitcherStat[];
}

interface LiffStatsApiResponse {
  success: boolean;
  isDemo?: boolean;
  team?: {
    id: string;
    name: string;
    orgName: string;
    year: number;
  };
  stats?: TeamStatsSummary | null;
  sectionsByFilter?: Record<StatsFilterKey, StatsSectionData>;
  matches?: StatsMatchItem[];
  error?: string;
}

const EMPTY_SUMMARY: TeamStatsSummary = {
  totalMatches: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  winRate: ".000",
  winRatePercent: 0,
  runsScored: 0,
  runsAllowed: 0,
  runDiff: "0",
  avgRunsScored: "0.0",
  avgRunsAllowed: "0.0",
  maxRunsScored: 0,
  shutouts: 0,
  teamHits: 0,
  opponentHits: 0,
  teamErrors: 0,
  opponentErrors: 0,
  teamAvg: ".000",
  teamOps: ".000",
  teamHomeRuns: 0,
  teamStolenBases: 0,
  teamEra: "0.00",
};

const EMPTY_SECTION: StatsSectionData = {
  summary: EMPTY_SUMMARY,
  battingStats: [],
  pitchingStats: [],
};

const MATCH_TYPE_META: Record<
  "official" | "exchange" | "practice",
  { label: string; badgeClass: string }
> = {
  official: {
    label: "公式戦",
    badgeClass:
      "bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/30",
  },
  exchange: {
    label: "交流戦",
    badgeClass:
      "bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/25",
  },
  practice: {
    label: "OP戦",
    badgeClass:
      "bg-muted text-muted-foreground border-border/60",
  },
};

function getRankMedalClass(rank: number): string {
  if (rank === 1) {
    return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30";
  }
  if (rank === 2) {
    return "bg-slate-500/15 text-slate-600 dark:text-slate-300 border border-slate-500/30";
  }
  return "bg-orange-500/15 text-orange-700 dark:text-orange-400 border border-orange-500/30";
}

function formatCompactDate(raw: string): string {
  const trimmed = (raw || "").trim();
  const matched = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!matched) return trimmed;
  const [, yyyy, mm, dd] = matched;
  return `${yyyy}/${mm.padStart(2, "0")}/${dd.padStart(2, "0")}`;
}

function parseRateValue(rateText: string): number {
  if (!rateText) return 0;
  const normalized = rateText.startsWith(".") ? `0${rateText}` : rateText;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanUniform(raw: string): string {
  const t = (raw || "").replace(/^#/, "").trim();
  return t && t !== "-" ? t : "-";
}

export default function LiffStatsPage() {
  const { currentTeam, isLoadingTeam } = useLiff();
  const [filter, setFilter] = useState<StatsFilterKey>("all");
  const [tab, setTab] = useState<StatsMainTab>("matches");
  const [matchImportFilter, setMatchImportFilter] = useState<
    "all" | "imported" | "unimported"
  >("all");
  const [batterSort, setBatterSort] = useState<BatterSortKey>("hits");
  const [seasonYear, setSeasonYear] = useState<number>(() => new Date().getFullYear());
  const [sectionsByFilter, setSectionsByFilter] = useState<
    Record<StatsFilterKey, StatsSectionData>
  >({
    all: EMPTY_SECTION,
    official: EMPTY_SECTION,
    exchange: EMPTY_SECTION,
    practice: EMPTY_SECTION,
  });
  const [matchesList, setMatchesList] = useState<StatsMatchItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadStats = useCallback(async () => {
    if (isLoadingTeam && !currentTeam?.id) return;
    try {
      setIsLoading(true);
      const teamId =
        currentTeam?.id ||
        (typeof window !== "undefined"
          ? localStorage.getItem("iscore_selectedTeamId") || "demo-team"
          : "demo-team");
      const res = await fetch(`/api/liff/stats?teamId=${encodeURIComponent(teamId)}`);
      if (res.ok) {
        const data = (await res.json()) as LiffStatsApiResponse;
        if (data.team?.year) {
          setSeasonYear(data.team.year);
        }
        if (data.sectionsByFilter) {
          setSectionsByFilter(data.sectionsByFilter);
        } else if (data.stats) {
          const fallbackSection: StatsSectionData = {
            summary: { ...EMPTY_SUMMARY, ...data.stats },
            battingStats: [],
            pitchingStats: [],
          };
          setSectionsByFilter({
            all: fallbackSection,
            official: fallbackSection,
            exchange: fallbackSection,
            practice: fallbackSection,
          });
        }
        if (Array.isArray(data.matches)) {
          setMatchesList(data.matches);
        } else {
          setMatchesList([]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentTeam?.id, isLoadingTeam]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const activeSection = sectionsByFilter[filter] || EMPTY_SECTION;
  const summary = activeSection.summary;

  const filteredMatches = useMemo(() => {
    if (filter === "all") return matchesList;
    return matchesList.filter((m) => m.matchType === filter);
  }, [matchesList, filter]);

  const importedInFilterCount = useMemo(
    () => filteredMatches.filter((m) => Boolean(m.hasScorebook)).length,
    [filteredMatches]
  );
  const unimportedInFilterCount =
    filteredMatches.length - importedInFilterCount;

  const displayedMatches = useMemo(() => {
    if (matchImportFilter === "imported") {
      return filteredMatches.filter((m) => Boolean(m.hasScorebook));
    }
    if (matchImportFilter === "unimported") {
      return filteredMatches.filter((m) => !m.hasScorebook);
    }
    return filteredMatches;
  }, [filteredMatches, matchImportFilter]);

  const sortedBatters = useMemo(() => {
    const copy = [...activeSection.battingStats];
    copy.sort((a, b) => {
      if (batterSort === "avg") {
        const avgDiff = parseRateValue(b.avg) - parseRateValue(a.avg);
        if (avgDiff !== 0) return avgDiff;
        return b.hits - a.hits;
      }
      if (batterSort === "rbi") {
        if (b.rbi !== a.rbi) return b.rbi - a.rbi;
        return b.hits - a.hits;
      }
      if (batterSort === "runs") {
        if (b.runs !== a.runs) return b.runs - a.runs;
        return b.hits - a.hits;
      }
      if (b.hits !== a.hits) return b.hits - a.hits;
      if (b.rbi !== a.rbi) return b.rbi - a.rbi;
      return b.plateAppearances - a.plateAppearances;
    });
    return copy;
  }, [activeSection.battingStats, batterSort]);

  // 打撃リーダー TOP3（打率・打点・安打）
  const avgLeaders = useMemo(() => {
    const eligible = activeSection.battingStats.filter((b) => b.atBats >= 2);
    const pool =
      eligible.length >= 3
        ? eligible
        : activeSection.battingStats.filter((b) => b.atBats >= 1);
    return [...pool]
      .sort((a, b) => {
        const d = parseRateValue(b.avg) - parseRateValue(a.avg);
        if (d !== 0) return d;
        return b.hits - a.hits;
      })
      .slice(0, 3);
  }, [activeSection.battingStats]);

  const rbiLeaders = useMemo(() => {
    return [...activeSection.battingStats]
      .filter((b) => b.rbi > 0)
      .sort((a, b) => (b.rbi !== a.rbi ? b.rbi - a.rbi : b.hits - a.hits))
      .slice(0, 3);
  }, [activeSection.battingStats]);

  const hitLeaders = useMemo(() => {
    return [...activeSection.battingStats]
      .filter((b) => b.hits > 0)
      .sort((a, b) => (b.hits !== a.hits ? b.hits - a.hits : b.totalBases - a.totalBases))
      .slice(0, 3);
  }, [activeSection.battingStats]);

  // 投手リーダー TOP3（防御率・奪三振）
  const eraLeaders = useMemo(() => {
    const eligible = activeSection.pitchingStats.filter((p) => p.outs >= 3);
    const pool = eligible.length > 0 ? eligible : activeSection.pitchingStats;
    return [...pool]
      .sort((a, b) => {
        const d = Number(a.era) - Number(b.era);
        if (d !== 0) return d;
        return b.outs - a.outs;
      })
      .slice(0, 3);
  }, [activeSection.pitchingStats]);

  const soLeaders = useMemo(() => {
    return [...activeSection.pitchingStats]
      .filter((p) => p.strikeouts > 0)
      .sort((a, b) =>
        b.strikeouts !== a.strikeouts ? b.strikeouts - a.strikeouts : b.outs - a.outs
      )
      .slice(0, 3);
  }, [activeSection.pitchingStats]);

  const totalRunsFlow = summary.runsScored + summary.runsAllowed;
  const scoredBarPercent =
    totalRunsFlow > 0
      ? Math.max(8, Math.min(92, Math.round((summary.runsScored / totalRunsFlow) * 100)))
      : 50;

  const runDiffNum = summary.runsScored - summary.runsAllowed;
  const filterTitleLabel =
    filter === "official"
      ? "公式戦 成績"
      : filter === "exchange"
      ? "交流戦 成績"
      : filter === "practice"
      ? "OP戦 成績"
      : `${seasonYear}シーズン 通算成績`;

  const teamDisplayName = currentTeam?.name || "チーム";
  const sharePayload = {
    title: `【チーム成績】${teamDisplayName} ${summary.wins}勝${summary.losses}敗${
      summary.draws > 0 ? `${summary.draws}分` : ""
    } (勝率 ${summary.winRate})`,
    text: `総得点 ${summary.runsScored} (平均 ${summary.avgRunsScored}) / 総失点 ${summary.runsAllowed} (平均 ${summary.avgRunsAllowed}) / 得失点差 ${summary.runDiff}`,
  };

  const countAll = sectionsByFilter.all.summary.totalMatches;
  const countOfficial = sectionsByFilter.official.summary.totalMatches;
  const countExchange = sectionsByFilter.exchange.summary.totalMatches;
  const countPractice = sectionsByFilter.practice.summary.totalMatches;

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader shareData={sharePayload} />

      <div className="p-4 space-y-4">
        {/* ページ内ヘッダー（メニュー項目「チーム成績」と完全統一） */}
        <LiffPageHeader
          title="チーム成績"
          subtitle={`${seasonYear}年度 勝敗・得失点・個人成績`}
          icon={
            <span className="w-8 h-8 rounded-xl bg-primary/12 text-primary flex items-center justify-center font-black">
              <Trophy className="w-4 h-4" />
            </span>
          }
          showBack
          shareData={sharePayload}
        />

        {/* 試合種別フィルターチップ */}
        <div className="grid grid-cols-4 gap-1.5">
          {(
            [
              { key: "all" as const, label: "すべて", count: countAll },
              { key: "official" as const, label: "🏆 公式戦", count: countOfficial },
              { key: "exchange" as const, label: "🤝 交流戦", count: countExchange },
              { key: "practice" as const, label: "⚾ OP戦", count: countPractice },
            ] as const
          ).map((item) => {
            const active = filter === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                className={cn(
                  "py-1.5 px-1 rounded-xl text-[11px] transition-all truncate tabular-nums",
                  active
                    ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                    : "bg-card text-muted-foreground border border-border/60 hover:text-foreground hover:bg-muted/50 font-bold"
                )}
              >
                {item.label} ({item.count})
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <div className="rounded-2xl border border-border/60 bg-card p-12 flex flex-col items-center justify-center gap-2.5 shadow-xs">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
            <p className="text-xs font-bold text-muted-foreground">
              チーム成績を集計中...
            </p>
          </div>
        ) : (
          <>
            {/* 🏆 チーム勝敗 & 得点・失点サマリーカード（ソリッド高視認性設計） */}
            <section className="rounded-2xl border border-border/60 bg-card shadow-xs overflow-hidden">
              {/* ヘッダー行 */}
              <div className="px-4 py-3 bg-primary/[0.04] dark:bg-primary/[0.07] border-b border-border/50 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-black text-xs text-foreground">
                  <Trophy className="w-4 h-4 text-primary shrink-0" />
                  <span>{filterTitleLabel}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-primary/12 text-primary border border-primary/25 tabular-nums">
                    勝率 {summary.winRate} ({summary.winRatePercent}%)
                  </span>
                </div>
              </div>

              <div className="p-4 space-y-3.5">
              {/* 1段目：試合・勝利・敗戦・引分 */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="p-2.5 rounded-xl bg-muted/35 border border-border/60">
                  <span className="text-[10px] text-muted-foreground font-bold block">
                    試合
                  </span>
                  <span className="text-lg font-black text-foreground tabular-nums">
                    {summary.totalMatches}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/25">
                  <span className="text-[10px] text-primary font-bold block">
                    勝利
                  </span>
                  <span className="text-lg font-black text-primary tabular-nums">
                    {summary.wins}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-muted/50 border border-border/60">
                  <span className="text-[10px] text-muted-foreground font-bold block">
                    敗戦
                  </span>
                  <span className="text-lg font-black text-foreground tabular-nums">
                    {summary.losses}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-muted/35 border border-border/60">
                  <span className="text-[10px] text-muted-foreground font-bold block">
                    引分
                  </span>
                  <span className="text-lg font-black text-foreground tabular-nums">
                    {summary.draws}
                  </span>
                </div>
              </div>

              {/* 2段目：総得点・総失点・得失点差 ＆ バランスバー */}
              <div className="rounded-xl bg-muted/35 border border-border/60 p-3 space-y-2.5">
                <div className="grid grid-cols-3 gap-2 text-center">
                  {/* 総得点 */}
                  <div className="p-2 rounded-xl bg-card border border-primary/25">
                    <span className="text-[10px] font-black text-primary block">
                      総得点
                    </span>
                    <div className="flex items-baseline justify-center gap-0.5 mt-0.5">
                      <span className="text-xl font-black text-primary tabular-nums">
                        {summary.runsScored}
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground">
                        点
                      </span>
                    </div>
                    <span className="text-[9.5px] font-bold text-muted-foreground tabular-nums block mt-0.5">
                      平均 {summary.avgRunsScored} 点
                    </span>
                  </div>

                  {/* 総失点 */}
                  <div className="p-2 rounded-xl bg-card border border-border/60">
                    <span className="text-[10px] font-black text-muted-foreground block">
                      総失点
                    </span>
                    <div className="flex items-baseline justify-center gap-0.5 mt-0.5">
                      <span className="text-xl font-black text-foreground tabular-nums">
                        {summary.runsAllowed}
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground">
                        点
                      </span>
                    </div>
                    <span className="text-[9.5px] font-bold text-muted-foreground tabular-nums block mt-0.5">
                      平均 {summary.avgRunsAllowed} 点
                    </span>
                  </div>

                  {/* 得失点差 */}
                  <div className="p-2 rounded-xl bg-card border border-border/60">
                    <span className="text-[10px] font-black text-muted-foreground block">
                      得失点差
                    </span>
                    <div className="flex items-baseline justify-center gap-0.5 mt-0.5">
                      <span
                        className={cn(
                          "text-xl font-black tabular-nums",
                          runDiffNum > 0
                            ? "text-primary"
                            : "text-foreground"
                        )}
                      >
                        {summary.runDiff}
                      </span>
                    </div>
                    <span className="text-[9.5px] font-bold text-muted-foreground tabular-nums block mt-0.5">
                      最高{summary.maxRunsScored}点
                      {summary.shutouts > 0 ? `・完封${summary.shutouts}` : ""}
                    </span>
                  </div>
                </div>

                {/* 得点 vs 失点 比率バー */}
                {totalRunsFlow > 0 && (
                  <div className="space-y-1">
                    <div className="h-2.5 w-full rounded-full overflow-hidden flex bg-muted border border-border/60">
                      <div
                        className="h-full bg-primary transition-all duration-500"
                        style={{ width: `${scoredBarPercent}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground tabular-nums px-0.5">
                      <span>
                        チーム安打 <strong className="text-foreground">{summary.teamHits}</strong> / 失策{" "}
                        <strong className="text-foreground">{summary.teamErrors}</strong>
                      </span>
                      <span>
                        被安打 <strong className="text-foreground">{summary.opponentHits}</strong> / 相手失策{" "}
                        <strong className="text-foreground">{summary.opponentErrors}</strong>
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* 3段目：チーム打撃・投手4指標 */}
              <div className="grid grid-cols-4 gap-1.5 text-center pt-0.5">
                <div className="py-2 px-1 rounded-xl bg-muted/35 border border-border/60">
                  <span className="text-[9.5px] font-bold text-muted-foreground block">
                    チーム打率
                  </span>
                  <span className="text-xs font-black text-foreground tabular-nums mt-0.5 block">
                    {summary.teamAvg}
                  </span>
                </div>
                <div className="py-2 px-1 rounded-xl bg-muted/35 border border-border/60">
                  <span className="text-[9.5px] font-bold text-muted-foreground block">
                    チームOPS
                  </span>
                  <span className="text-xs font-black text-foreground tabular-nums mt-0.5 block">
                    {summary.teamOps}
                  </span>
                </div>
                <div className="py-2 px-1 rounded-xl bg-muted/35 border border-border/60">
                  <span className="text-[9.5px] font-bold text-muted-foreground block">
                    本塁打 / 盗塁
                  </span>
                  <span className="text-xs font-black text-foreground tabular-nums mt-0.5 block">
                    {summary.teamHomeRuns} / {summary.teamStolenBases}
                  </span>
                </div>
                <div className="py-2 px-1 rounded-xl bg-muted/35 border border-border/60">
                  <span className="text-[9.5px] font-bold text-muted-foreground block">
                    チーム防御率
                  </span>
                  <span className="text-xs font-black text-foreground tabular-nums mt-0.5 block">
                    {summary.teamEra}
                  </span>
                </div>
              </div>

              {/* 4段目：「すべて」表示時の試合種別ごとの勝敗・得失点内訳 */}
              {filter === "all" && summary.totalMatches > 0 && (
                <div className="pt-2 border-t border-border/60 space-y-1.5">
                  <p className="text-[10px] font-black text-muted-foreground px-0.5">
                    試合種別ごとの勝敗・得失点内訳（タップで絞り込み）
                  </p>
                  <div className="space-y-1">
                    {(
                      [
                        { key: "official" as const, meta: MATCH_TYPE_META.official },
                        { key: "exchange" as const, meta: MATCH_TYPE_META.exchange },
                        { key: "practice" as const, meta: MATCH_TYPE_META.practice },
                      ] as const
                    ).map(({ key, meta }) => {
                      const sub = sectionsByFilter[key].summary;
                      if (sub.totalMatches === 0) return null;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setFilter(key)}
                          className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl bg-muted/35 hover:bg-muted/60 border border-border/60 text-xs transition-colors active:scale-[0.99]"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={cn(
                                "px-1.5 py-0.5 rounded-md border text-[10px] font-black shrink-0",
                                meta.badgeClass
                              )}
                            >
                              {meta.label}
                            </span>
                            <span className="font-black text-foreground tabular-nums">
                              {sub.wins}勝{sub.losses}敗
                              {sub.draws > 0 ? `${sub.draws}分` : ""}
                            </span>
                            <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
                              ({sub.winRate})
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 tabular-nums text-[11px] font-bold">
                            <span className="text-primary font-black">
                              得{sub.runsScored}
                            </span>
                            <span className="text-muted-foreground">/</span>
                            <span className="text-foreground font-black">
                              失{sub.runsAllowed}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              ({sub.runDiff})
                            </span>
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              </div>
            </section>

            {/* メイン切り替えタブ（試合別スコア / 打撃成績 / 投手成績） */}
            <div className="grid grid-cols-3 gap-1 bg-muted/80 dark:bg-muted/50 p-1 rounded-2xl border border-border/60">
              <button
                type="button"
                onClick={() => setTab("matches")}
                className={cn(
                  "py-2 px-1.5 rounded-xl text-xs transition-all flex items-center justify-center gap-1",
                  tab === "matches"
                    ? "bg-card text-foreground shadow-sm border border-border/50 font-black"
                    : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                )}
              >
                <BarChart3
                  className={cn(
                    "w-3.5 h-3.5 shrink-0",
                    tab === "matches" ? "text-primary" : "text-muted-foreground"
                  )}
                />
                <span>試合別スコア</span>
              </button>
              <button
                type="button"
                onClick={() => setTab("batting")}
                className={cn(
                  "py-2 px-1.5 rounded-xl text-xs transition-all flex items-center justify-center gap-1",
                  tab === "batting"
                    ? "bg-card text-foreground shadow-sm border border-border/50 font-black"
                    : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                )}
              >
                <Flame
                  className={cn(
                    "w-3.5 h-3.5 shrink-0",
                    tab === "batting" ? "text-primary" : "text-muted-foreground"
                  )}
                />
                <span>打撃成績</span>
              </button>
              <button
                type="button"
                onClick={() => setTab("pitching")}
                className={cn(
                  "py-2 px-1.5 rounded-xl text-xs transition-all flex items-center justify-center gap-1",
                  tab === "pitching"
                    ? "bg-card text-foreground shadow-sm border border-border/50 font-black"
                    : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                )}
              >
                <Activity
                  className={cn(
                    "w-3.5 h-3.5 shrink-0",
                    tab === "pitching" ? "text-primary" : "text-muted-foreground"
                  )}
                />
                <span>投手成績</span>
              </button>
            </div>

            {/* ━━━ Tab 1: 試合別スコア（各試合の得点・失点一覧） ━━━ */}
            {tab === "matches" && (
              <section className="space-y-2.5">
                {filteredMatches.length === 0 ? (
                  <div className="py-6 space-y-4">
                    <EmptyState
                      icon={Shield}
                      title="確定済みの試合結果がありません"
                      description="試合結果が登録されると、試合ごとの勝敗・得点・失点がここに一覧表示されます"
                    />
                    <div className="flex justify-center">
                      <Link
                        href="/liff/matches"
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-primary text-primary-foreground text-xs font-black shadow-xs hover:bg-primary/90 active:scale-95 transition-all"
                      >
                        <Plus className="w-4 h-4" />
                        <span>試合情報ページを開く</span>
                      </Link>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between px-1 gap-2 flex-wrap">
                      <h3 className="text-xs font-black text-foreground flex items-center gap-1.5">
                        <BarChart3 className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span>試合ごとの得点・失点履歴 ({filteredMatches.length}試合)</span>
                      </h3>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25 text-[10px] font-black tabular-nums">
                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                        <span>
                          スコア取込済 {importedInFilterCount} / {filteredMatches.length}試合
                        </span>
                      </span>
                    </div>

                    {/* スコア取込状況フィルター */}
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          {
                            key: "all" as const,
                            label: `すべて (${filteredMatches.length})`,
                          },
                          {
                            key: "imported" as const,
                            label: `✓ 取込済 (${importedInFilterCount})`,
                          },
                          {
                            key: "unimported" as const,
                            label: `未取込 (${unimportedInFilterCount})`,
                          },
                        ] as const
                      ).map((item) => {
                        const active = matchImportFilter === item.key;
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => setMatchImportFilter(item.key)}
                            className={cn(
                              "py-1.5 px-2 rounded-xl text-[10.5px] transition-all truncate cursor-pointer tabular-nums",
                              active
                                ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                                : "bg-card text-muted-foreground border border-border/60 hover:text-foreground hover:bg-muted/50 font-bold"
                            )}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>

                    {displayedMatches.length === 0 ? (
                      <div className="py-6">
                        <EmptyState
                          icon={BookOpen}
                          title={
                            matchImportFilter === "imported"
                              ? "スコア取込済みの試合がありません"
                              : "未取込の試合はありません"
                          }
                          description="フィルターを切り替えると他の試合履歴を確認できます"
                        />
                      </div>
                    ) : (
                    <div className="space-y-2">
                      {displayedMatches.map((m) => {
                        const typeMeta = MATCH_TYPE_META[m.matchType];
                        const resultBadge =
                          m.result === "win"
                            ? {
                                text: "勝",
                                cls: "bg-emerald-600 text-white",
                                scoreCls: "text-primary",
                              }
                            : m.result === "loss"
                            ? {
                                text: "負",
                                cls: "bg-rose-600 text-white",
                                scoreCls: "text-foreground",
                              }
                            : {
                                text: "分",
                                cls: "bg-zinc-500 text-white",
                                scoreCls: "text-foreground",
                              };

                        const hasHitsOrErrors =
                          m.myHits > 0 ||
                          m.opponentHits > 0 ||
                          m.myErrors > 0 ||
                          m.opponentErrors > 0;

                        return (
                          <Link
                            key={m.id}
                            href={`/liff/matches?id=${encodeURIComponent(m.id)}`}
                            className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-border/60 bg-card hover:border-primary/40 shadow-xs transition-all active:scale-[0.99]"
                          >
                            {/* 左：勝敗バッジ ＋ 試合情報 */}
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <span
                                className={cn(
                                  "w-8 h-8 rounded-xl font-black text-xs flex items-center justify-center shrink-0 shadow-2xs",
                                  resultBadge.cls
                                )}
                              >
                                {resultBadge.text}
                              </span>

                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[11px] font-bold text-muted-foreground tabular-nums">
                                    {formatCompactDate(m.date)}
                                  </span>
                                  <span
                                    className={cn(
                                      "px-1.5 py-0.2 rounded border text-[9.5px] font-black",
                                      typeMeta.badgeClass
                                    )}
                                  >
                                    {typeMeta.label}
                                  </span>
                                  {m.hasScorebook ? (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded border border-emerald-500/25 bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 text-[9.5px] font-black">
                                      <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                                      取込済
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-1.5 py-0.2 rounded border border-border/60 bg-muted/50 text-muted-foreground text-[9.5px] font-bold">
                                      未取込
                                    </span>
                                  )}
                                  {m.isColdGame && (
                                    <span className="px-1.5 py-0.2 rounded border border-primary/20 bg-primary/10 text-primary text-[9.5px] font-black">
                                      コールド
                                    </span>
                                  )}
                                  {m.isTiebreaker && (
                                    <span className="px-1.5 py-0.2 rounded border border-primary/20 bg-primary/10 text-primary text-[9.5px] font-black">
                                      TB
                                    </span>
                                  )}
                                </div>

                                {m.tournamentName && (
                                  <p className="text-[10.5px] font-bold text-primary truncate">
                                    {m.tournamentName}
                                  </p>
                                )}

                                <p className="text-xs sm:text-sm font-black text-foreground truncate">
                                  vs {m.opponent}
                                </p>

                                {m.venueName && (
                                  <p className="text-[10px] font-bold text-muted-foreground truncate">
                                    ＠{m.venueName}（{m.battingOrder === "first" ? "先攻" : "後攻"}）
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* 右：得点 - 失点 スコア表示 */}
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="text-right">
                                <div className="flex items-baseline justify-end gap-1 tabular-nums">
                                  <span
                                    className={cn(
                                      "text-lg font-black leading-none",
                                      resultBadge.scoreCls
                                    )}
                                  >
                                    {m.myScore}
                                  </span>
                                  <span className="text-xs font-black text-muted-foreground">
                                    -
                                  </span>
                                  <span className="text-lg font-black text-foreground leading-none">
                                    {m.opponentScore}
                                  </span>
                                </div>
                                <p className="text-[9.5px] font-bold text-muted-foreground tabular-nums mt-1">
                                  得{m.myScore} / 失{m.opponentScore}
                                </p>
                                {hasHitsOrErrors && (
                                  <p className="text-[9px] font-bold text-muted-foreground/90 tabular-nums">
                                    安{m.myHits}・失策{m.myErrors}
                                  </p>
                                )}
                              </div>
                              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                    )}
                  </>
                )}
              </section>
            )}

            {/* ━━━ Tab 2: 打撃成績（実データ連動リーダー ＆ 一覧表） ━━━ */}
            {tab === "batting" && (
              <section className="space-y-4">
                {activeSection.battingStats.length === 0 ? (
                  <div className="py-6 space-y-4">
                    <EmptyState
                      icon={Flame}
                      title="打撃成績データがまだありません"
                      description="スコアブック取り込みまたはライブスコア入力を保存すると、個人打撃成績が自動集計されます"
                    />
                    <div className="flex justify-center">
                      <Link
                        href="/liff/tools/scorebook-import"
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-primary text-primary-foreground text-xs font-black shadow-xs hover:bg-primary/90 active:scale-95 transition-all"
                      >
                        <ScanLine className="w-4 h-4" />
                        <span>スコアブックを取り込む</span>
                      </Link>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* 打率リーダー TOP3 */}
                    {avgLeaders.length > 0 && (
                      <div className="rounded-2xl border border-border/60 bg-card shadow-xs overflow-hidden">
                        <div className="px-4 py-3 bg-primary/[0.04] dark:bg-primary/[0.07] border-b border-border/50 flex items-center justify-between">
                          <h3 className="text-xs font-black text-foreground flex items-center gap-1.5">
                            <Flame className="w-3.5 h-3.5 text-primary" />
                            <span>打率 リーダー TOP3</span>
                          </h3>
                          <span className="text-[10px] font-bold text-muted-foreground">
                            AVG
                          </span>
                        </div>

                        <div className="p-4 space-y-2">
                          {avgLeaders.map((item, idx) => {
                            const rank = idx + 1;
                            const uni = cleanUniform(item.uniformNumber);
                            const canLinkGrowth = !item.id.startsWith("name:");
                            const inner = (
                              <>
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span
                                    className={cn(
                                      "w-5 h-5 rounded-md font-black text-xs flex items-center justify-center shrink-0 tabular-nums",
                                      getRankMedalClass(rank)
                                    )}
                                  >
                                    {rank}
                                  </span>
                                  <div className="min-w-0">
                                    <span className="font-black text-foreground">
                                      {item.name}
                                    </span>
                                    {uni !== "-" && (
                                      <span className="text-[10px] text-muted-foreground ml-1.5 font-bold">
                                        #{uni}
                                      </span>
                                    )}
                                    <span className="text-[10px] text-muted-foreground block tabular-nums">
                                      {item.atBats}打数 {item.hits}安打（打点{item.rbi}・得点{item.runs}）
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-base font-black tabular-nums text-primary">
                                    {item.avg}
                                  </span>
                                  {canLinkGrowth && (
                                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                                  )}
                                </div>
                              </>
                            );

                            return canLinkGrowth ? (
                              <Link
                                key={`avg-${item.id}`}
                                href={`/liff/players/growth?id=${encodeURIComponent(item.id)}`}
                                className="flex items-center justify-between p-2.5 rounded-xl bg-muted/35 hover:bg-muted/60 hover:border-primary/40 border border-border/60 text-xs transition-all active:scale-[0.99]"
                              >
                                {inner}
                              </Link>
                            ) : (
                              <div
                                key={`avg-${item.id}`}
                                className="flex items-center justify-between p-2.5 rounded-xl bg-muted/35 border border-border/60 text-xs"
                              >
                                {inner}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 打点 ＆ 安打リーダー 2カラム */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {rbiLeaders.length > 0 && (
                        <div className="rounded-2xl border border-border/60 bg-card shadow-xs overflow-hidden">
                          <div className="px-3.5 py-2.5 bg-primary/[0.04] dark:bg-primary/[0.07] border-b border-border/50">
                            <h3 className="text-xs font-black text-foreground flex items-center gap-1.5">
                              <Target className="w-3.5 h-3.5 text-primary" />
                              <span>打点 TOP3</span>
                            </h3>
                          </div>
                          <div className="p-3.5 space-y-1.5">
                            {rbiLeaders.map((item, idx) => {
                              const rank = idx + 1;
                              return (
                                <div
                                  key={`rbi-${item.id}`}
                                  className="flex items-center justify-between px-2.5 py-2 rounded-xl bg-muted/35 border border-border/60 text-xs gap-2"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span
                                      className={cn(
                                        "w-5 h-5 rounded-md font-black text-[11px] flex items-center justify-center shrink-0 tabular-nums",
                                        getRankMedalClass(rank)
                                      )}
                                    >
                                      {rank}
                                    </span>
                                    <span className="font-bold text-foreground truncate">
                                      {item.name}
                                    </span>
                                  </div>
                                  <span className="font-black tabular-nums text-primary shrink-0">
                                    {item.rbi} 打点
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {hitLeaders.length > 0 && (
                        <div className="rounded-2xl border border-border/60 bg-card shadow-xs overflow-hidden">
                          <div className="px-3.5 py-2.5 bg-primary/[0.04] dark:bg-primary/[0.07] border-b border-border/50">
                            <h3 className="text-xs font-black text-foreground flex items-center gap-1.5">
                              <TrendingUp className="w-3.5 h-3.5 text-primary" />
                              <span>安打 TOP3</span>
                            </h3>
                          </div>
                          <div className="p-3.5 space-y-1.5">
                            {hitLeaders.map((item, idx) => {
                              const rank = idx + 1;
                              return (
                                <div
                                  key={`hit-${item.id}`}
                                  className="flex items-center justify-between px-2.5 py-2 rounded-xl bg-muted/35 border border-border/60 text-xs gap-2"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span
                                      className={cn(
                                        "w-5 h-5 rounded-md font-black text-[11px] flex items-center justify-center shrink-0 tabular-nums",
                                        getRankMedalClass(rank)
                                      )}
                                    >
                                      {rank}
                                    </span>
                                    <span className="font-bold text-foreground truncate">
                                      {item.name}
                                    </span>
                                  </div>
                                  <span className="font-black tabular-nums text-primary shrink-0">
                                    {item.hits} 安打
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 全選手 打撃成績一覧テーブル */}
                    <div className="rounded-2xl border border-border/60 bg-card shadow-xs overflow-hidden">
                      <div className="px-3.5 py-3 bg-primary/[0.04] dark:bg-primary/[0.07] border-b border-border/50 flex items-center justify-between gap-2 flex-wrap">
                        <h3 className="text-xs font-black text-foreground">
                          個人打撃成績一覧（{sortedBatters.length}名）
                        </h3>
                        <div className="flex items-center gap-0.5 bg-muted/80 dark:bg-muted/50 p-1 rounded-xl border border-border/60">
                          {(
                            [
                              { key: "hits" as const, label: "安打順" },
                              { key: "avg" as const, label: "打率順" },
                              { key: "rbi" as const, label: "打点順" },
                              { key: "runs" as const, label: "得点順" },
                            ] as const
                          ).map((s) => {
                            const activeSort = batterSort === s.key;
                            return (
                              <button
                                key={s.key}
                                type="button"
                                onClick={() => setBatterSort(s.key)}
                                className={cn(
                                  "px-2 py-0.5 rounded-lg text-[10px] transition-all",
                                  activeSort
                                    ? "bg-card text-foreground shadow-sm border border-border/50 font-black"
                                    : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                                )}
                              >
                                <span className={cn(activeSort && "text-primary")}>
                                  {s.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse whitespace-nowrap">
                          <thead>
                            <tr className="bg-muted text-muted-foreground border-b border-border/60 text-[10px] font-black">
                              <th className="sticky left-0 z-10 bg-muted text-left py-2 px-3 border-r border-border/60">
                                選手名
                              </th>
                              <th className="py-2 px-2 text-right">打率</th>
                              <th className="py-2 px-2 text-right">試合</th>
                              <th className="py-2 px-2 text-right">打席</th>
                              <th className="py-2 px-2 text-right">打数</th>
                              <th className="py-2 px-2 text-right">安打</th>
                              <th className="py-2 px-2 text-right">二塁</th>
                              <th className="py-2 px-2 text-right">三塁</th>
                              <th className="py-2 px-2 text-right">本塁</th>
                              <th className="py-2 px-2 text-right">打点</th>
                              <th className="py-2 px-2 text-right">得点</th>
                              <th className="py-2 px-2 text-right">盗塁</th>
                              <th className="py-2 px-2 text-right">四死</th>
                              <th className="py-2 px-2 text-right">三振</th>
                              <th className="py-2 px-2.5 text-right">OPS</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60 tabular-nums">
                            {sortedBatters.map((b) => {
                              const uni = cleanUniform(b.uniformNumber);
                              const canLinkGrowth = !b.id.startsWith("name:");
                              return (
                                <tr
                                  key={b.id}
                                  className="hover:bg-muted/30 transition-colors"
                                >
                                  <td className="sticky left-0 z-10 bg-card py-2.5 px-3 border-r border-border/60 font-black text-foreground">
                                    {canLinkGrowth ? (
                                      <Link
                                        href={`/liff/players/growth?id=${encodeURIComponent(b.id)}`}
                                        className="inline-flex items-center gap-1 hover:text-primary transition-colors"
                                      >
                                        <span className="underline decoration-border underline-offset-2">
                                          {b.name}
                                        </span>
                                        {uni !== "-" && (
                                          <span className="text-[10px] font-bold text-muted-foreground">
                                            #{uni}
                                          </span>
                                        )}
                                      </Link>
                                    ) : (
                                      <>
                                        <span>{b.name}</span>
                                        {uni !== "-" && (
                                          <span className="ml-1 text-[10px] font-bold text-muted-foreground">
                                            #{uni}
                                          </span>
                                        )}
                                      </>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-2 text-right font-black text-primary">
                                    {b.avg}
                                  </td>
                                  <td className="py-2.5 px-2 text-right font-bold">
                                    {b.games}
                                  </td>
                                  <td className="py-2.5 px-2 text-right font-bold">
                                    {b.plateAppearances}
                                  </td>
                                  <td className="py-2.5 px-2 text-right font-bold">
                                    {b.atBats}
                                  </td>
                                  <td
                                    className={cn(
                                      "py-2.5 px-2 text-right font-black",
                                      batterSort === "hits"
                                        ? "text-primary"
                                        : "text-foreground"
                                    )}
                                  >
                                    {b.hits}
                                  </td>
                                  <td className="py-2.5 px-2 text-right text-muted-foreground font-bold">
                                    {b.doubles}
                                  </td>
                                  <td className="py-2.5 px-2 text-right text-muted-foreground font-bold">
                                    {b.triples}
                                  </td>
                                  <td className="py-2.5 px-2 text-right font-bold">
                                    {b.homeRuns}
                                  </td>
                                  <td
                                    className={cn(
                                      "py-2.5 px-2 text-right font-black",
                                      batterSort === "rbi"
                                        ? "text-primary"
                                        : "text-foreground"
                                    )}
                                  >
                                    {b.rbi}
                                  </td>
                                  <td
                                    className={cn(
                                      "py-2.5 px-2 text-right font-black",
                                      batterSort === "runs"
                                        ? "text-primary"
                                        : "text-foreground"
                                    )}
                                  >
                                    {b.runs}
                                  </td>
                                  <td className="py-2.5 px-2 text-right font-bold">
                                    {b.stolenBases}
                                  </td>
                                  <td className="py-2.5 px-2 text-right text-muted-foreground font-bold">
                                    {b.walks + b.hitByPitch}
                                  </td>
                                  <td className="py-2.5 px-2 text-right text-muted-foreground font-bold">
                                    {b.strikeouts}
                                  </td>
                                  <td className="py-2.5 px-2.5 text-right font-black">
                                    {b.ops}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </section>
            )}

            {/* ━━━ Tab 3: 投手成績（実データ連動リーダー ＆ 一覧表） ━━━ */}
            {tab === "pitching" && (
              <section className="space-y-4">
                {activeSection.pitchingStats.length === 0 ? (
                  <div className="py-6 space-y-4">
                    <EmptyState
                      icon={Activity}
                      title="投手成績データがまだありません"
                      description="スコアブック取り込みまたはライブスコア入力を保存すると、投手の投球回・失点・防御率が自動集計されます"
                    />
                    <div className="flex justify-center">
                      <Link
                        href="/liff/tools/scorebook-import"
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-primary text-primary-foreground text-xs font-black shadow-xs hover:bg-primary/90 active:scale-95 transition-all"
                      >
                        <ScanLine className="w-4 h-4" />
                        <span>スコアブックを取り込む</span>
                      </Link>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* 防御率リーダー TOP3 */}
                    {eraLeaders.length > 0 && (
                      <div className="rounded-2xl border border-border/60 bg-card shadow-xs overflow-hidden">
                        <div className="px-4 py-3 bg-primary/[0.04] dark:bg-primary/[0.07] border-b border-border/50 flex items-center justify-between">
                          <h3 className="text-xs font-black text-foreground flex items-center gap-1.5">
                            <Activity className="w-3.5 h-3.5 text-primary" />
                            <span>防御率 リーダー TOP3</span>
                          </h3>
                          <span className="text-[10px] font-bold text-muted-foreground">
                            7回換算 ERA
                          </span>
                        </div>

                        <div className="p-4 space-y-2">
                          {eraLeaders.map((item, idx) => {
                            const rank = idx + 1;
                            const uni = cleanUniform(item.uniformNumber);
                            const canLinkGrowth = !item.id.startsWith("name:");
                            const inner = (
                              <>
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span
                                    className={cn(
                                      "w-5 h-5 rounded-md font-black text-xs flex items-center justify-center shrink-0 tabular-nums",
                                      getRankMedalClass(rank)
                                    )}
                                  >
                                    {rank}
                                  </span>
                                  <div className="min-w-0">
                                    <span className="font-black text-foreground">
                                      {item.name}
                                    </span>
                                    {uni !== "-" && (
                                      <span className="text-[10px] text-muted-foreground ml-1.5 font-bold">
                                        #{uni}
                                      </span>
                                    )}
                                    <span className="text-[10px] text-muted-foreground block tabular-nums">
                                      {item.games}登板 {item.ip}回 奪三振{item.strikeouts}（失点{item.runs}・自責{item.earnedRuns}）
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-base font-black tabular-nums text-primary">
                                    {item.era}
                                  </span>
                                  {canLinkGrowth && (
                                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                                  )}
                                </div>
                              </>
                            );

                            return canLinkGrowth ? (
                              <Link
                                key={`era-${item.id}`}
                                href={`/liff/players/growth?id=${encodeURIComponent(item.id)}`}
                                className="flex items-center justify-between p-2.5 rounded-xl bg-muted/35 hover:bg-muted/60 hover:border-primary/40 border border-border/60 text-xs transition-all active:scale-[0.99]"
                              >
                                {inner}
                              </Link>
                            ) : (
                              <div
                                key={`era-${item.id}`}
                                className="flex items-center justify-between p-2.5 rounded-xl bg-muted/35 border border-border/60 text-xs"
                              >
                                {inner}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 奪三振リーダー TOP3 */}
                    {soLeaders.length > 0 && (
                      <div className="rounded-2xl border border-border/60 bg-card shadow-xs overflow-hidden">
                        <div className="px-3.5 py-2.5 bg-primary/[0.04] dark:bg-primary/[0.07] border-b border-border/50">
                          <h3 className="text-xs font-black text-foreground flex items-center gap-1.5">
                            <Flame className="w-3.5 h-3.5 text-primary" />
                            <span>奪三振 TOP3</span>
                          </h3>
                        </div>
                        <div className="p-3.5 space-y-1.5">
                          {soLeaders.map((item, idx) => {
                            const rank = idx + 1;
                            return (
                              <div
                                key={`so-${item.id}`}
                                className="flex items-center justify-between px-2.5 py-2 rounded-xl bg-muted/35 border border-border/60 text-xs gap-2"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className={cn(
                                      "w-5 h-5 rounded-md font-black text-[11px] flex items-center justify-center shrink-0 tabular-nums",
                                      getRankMedalClass(rank)
                                    )}
                                  >
                                    {rank}
                                  </span>
                                  <span className="font-bold text-foreground truncate">
                                    {item.name}（{item.ip}回）
                                  </span>
                                </div>
                                <span className="font-black tabular-nums text-primary shrink-0">
                                  {item.strikeouts} 奪三振
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 全投手 成績一覧テーブル */}
                    <div className="rounded-2xl border border-border/60 bg-card shadow-xs overflow-hidden">
                      <div className="px-3.5 py-3 bg-primary/[0.04] dark:bg-primary/[0.07] border-b border-border/50 flex items-center justify-between">
                        <h3 className="text-xs font-black text-foreground">
                          個人投手成績一覧（{activeSection.pitchingStats.length}名）
                        </h3>
                        <span className="text-[10px] font-bold text-muted-foreground">
                          防御率は7回制換算
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse whitespace-nowrap">
                          <thead>
                            <tr className="bg-muted text-muted-foreground border-b border-border/60 text-[10px] font-black">
                              <th className="sticky left-0 z-10 bg-muted text-left py-2 px-3 border-r border-border/60">
                                投手名
                              </th>
                              <th className="py-2 px-2 text-right">防御率</th>
                              <th className="py-2 px-2 text-right">登板</th>
                              <th className="py-2 px-2 text-right">投球回</th>
                              <th className="py-2 px-2 text-right">失点</th>
                              <th className="py-2 px-2 text-right">自責</th>
                              <th className="py-2 px-2 text-right">奪三振</th>
                              <th className="py-2 px-2 text-right">被安打</th>
                              <th className="py-2 px-2 text-right">四死</th>
                              <th className="py-2 px-2 text-right">被本</th>
                              <th className="py-2 px-2.5 text-right">WHIP</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60 tabular-nums">
                            {activeSection.pitchingStats.map((p) => {
                              const uni = cleanUniform(p.uniformNumber);
                              const canLinkGrowth = !p.id.startsWith("name:");
                              return (
                                <tr
                                  key={p.id}
                                  className="hover:bg-muted/30 transition-colors"
                                >
                                  <td className="sticky left-0 z-10 bg-card py-2.5 px-3 border-r border-border/60 font-black text-foreground">
                                    {canLinkGrowth ? (
                                      <Link
                                        href={`/liff/players/growth?id=${encodeURIComponent(p.id)}`}
                                        className="inline-flex items-center gap-1 hover:text-primary transition-colors"
                                      >
                                        <span className="underline decoration-border underline-offset-2">
                                          {p.name}
                                        </span>
                                        {uni !== "-" && (
                                          <span className="text-[10px] font-bold text-muted-foreground">
                                            #{uni}
                                          </span>
                                        )}
                                      </Link>
                                    ) : (
                                      <>
                                        <span>{p.name}</span>
                                        {uni !== "-" && (
                                          <span className="ml-1 text-[10px] font-bold text-muted-foreground">
                                            #{uni}
                                          </span>
                                        )}
                                      </>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-2 text-right font-black text-primary">
                                    {p.era}
                                  </td>
                                  <td className="py-2.5 px-2 text-right font-bold">
                                    {p.games}
                                  </td>
                                  <td className="py-2.5 px-2 text-right font-black">
                                    {p.ip}
                                  </td>
                                  <td className="py-2.5 px-2 text-right font-black text-foreground">
                                    {p.runs}
                                  </td>
                                  <td className="py-2.5 px-2 text-right font-bold">
                                    {p.earnedRuns}
                                  </td>
                                  <td className="py-2.5 px-2 text-right font-black text-primary">
                                    {p.strikeouts}
                                  </td>
                                  <td className="py-2.5 px-2 text-right font-bold">
                                    {p.hitsAllowed}
                                  </td>
                                  <td className="py-2.5 px-2 text-right text-muted-foreground font-bold">
                                    {p.walks + p.hitByPitch}
                                  </td>
                                  <td className="py-2.5 px-2 text-right text-muted-foreground font-bold">
                                    {p.homeRunsAllowed}
                                  </td>
                                  <td className="py-2.5 px-2.5 text-right font-black">
                                    {p.whip}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </section>
            )}
          </>
        )}

        <div className="h-8 w-full shrink-0" aria-hidden="true" />
      </div>
    </div>
  );
}
