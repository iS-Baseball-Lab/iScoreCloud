// filepath: src/app/liff/players/growth/page.tsx
"use client";

import React, { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Crown,
  Flame,
  Activity,
  Target,
  Shield,
  Award,
  Sparkles,
  Calendar,
  ArrowUpRight,
  ScanLine,
  IdCard,
  Loader2,
} from "lucide-react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { useLiff } from "@/components/liff/LiffProvider";
import { EmptyState } from "@/components/layout/EmptyState";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type {
  GrowthFilterKey,
  PlayerBattingTrendItem,
  PlayerGrowthResponse,
  PlayerPitchingTrendItem,
} from "@/lib/liff/player-positions-and-growth";

interface PositionLabelMeta {
  shortLabel: string;
  code: string;
  pillClass: string;
  barClass: string;
}

const POSITION_SHORT_LABELS: Record<string, { shortLabel: string; code: string }> = {
  P: { shortLabel: "投手", code: "P" },
  C: { shortLabel: "捕手", code: "C" },
  "1B": { shortLabel: "一塁手", code: "1B" },
  "2B": { shortLabel: "二塁手", code: "2B" },
  "3B": { shortLabel: "三塁手", code: "3B" },
  SS: { shortLabel: "遊撃手", code: "SS" },
  LF: { shortLabel: "左翼手", code: "LF" },
  CF: { shortLabel: "中堅手", code: "CF" },
  RF: { shortLabel: "右翼手", code: "RF" },
  DH: { shortLabel: "指名打者", code: "DH" },
};

function getPosMeta(raw: string | null | undefined): PositionLabelMeta {
  if (!raw) {
    return {
      shortLabel: "未設定",
      code: "-",
      pillClass: "bg-muted text-muted-foreground border border-border/60",
      barClass: "bg-muted-foreground/40",
    };
  }
  const key = raw.trim().toUpperCase();
  const known = POSITION_SHORT_LABELS[key];
  if (known) {
    return {
      shortLabel: known.shortLabel,
      code: known.code,
      pillClass: "bg-primary text-primary-foreground",
      barClass: "bg-primary",
    };
  }
  return {
    shortLabel: raw.trim(),
    code: key,
    pillClass: "bg-primary/10 text-primary border border-primary/25",
    barClass: "bg-primary",
  };
}

function cleanUniform(raw: string | null | undefined): string {
  if (!raw) return "--";
  const c = raw.trim().replace(/^#/, "");
  return c || "--";
}

function formatShortDate(raw: string): string {
  const clean = raw.trim().replace(/\//g, "-");
  const m = clean.match(/^\d{4}-(\d{1,2})-(\d{1,2})/);
  if (m) return `${Number(m[1])}/${Number(m[2])}`;
  return clean;
}

function formatThrowsBats(throws: string | null, bats: string | null): string {
  const t = throws === "R" ? "右投" : throws === "L" ? "左投" : throws || "";
  const b =
    bats === "R"
      ? "右打"
      : bats === "L"
      ? "左打"
      : bats === "B"
      ? "両打"
      : bats || "";
  return `${t}${b}`.trim() || "投打未設定";
}

const MATCH_TYPE_BADGES: Record<
  "official" | "exchange" | "practice",
  { label: string; cls: string }
> = {
  official: {
    label: "公式戦",
    cls: "bg-primary/12 text-primary border-primary/25",
  },
  exchange: {
    label: "交流戦",
    cls: "bg-primary/10 text-primary border-primary/20",
  },
  practice: {
    label: "OP戦",
    cls: "bg-muted/50 text-muted-foreground border-border/60",
  },
};

interface BattingGrowthChartProps {
  trend: PlayerBattingTrendItem[];
  selectedIndex: number;
  onSelectIndex: (idx: number) => void;
}

function BattingGrowthChart({
  trend,
  selectedIndex,
  onSelectIndex,
}: BattingGrowthChartProps) {
  if (trend.length === 0) return null;

  const width = 360;
  const height = 186;
  const padL = 36;
  const padR = 14;
  const padT = 18;
  const padB = 30;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxRate = Math.max(
    0.5,
    ...trend.map((t) => Math.max(t.cumAvgNum, t.cumObpNum))
  );
  const yCeiling = maxRate > 0.75 ? 1.0 : maxRate > 0.55 ? 0.8 : 0.6;
  const maxHits = Math.max(3, ...trend.map((t) => t.hits));

  const getX = (idx: number): number => {
    if (trend.length === 1) return padL + plotW / 2;
    return padL + (idx / (trend.length - 1)) * plotW;
  };

  const getY = (val: number): number => {
    const clamped = Math.max(0, Math.min(yCeiling, val));
    return padT + plotH - (clamped / yCeiling) * plotH;
  };

  const avgPoints = trend.map((t, i) => `${getX(i)},${getY(t.cumAvgNum)}`).join(" ");
  const obpPoints = trend.map((t, i) => `${getX(i)},${getY(t.cumObpNum)}`).join(" ");

  const yTicks = yCeiling === 1.0 ? [0, 0.3, 0.5, 1.0] : yCeiling === 0.8 ? [0, 0.3, 0.5, 0.8] : [0, 0.2, 0.3, 0.5];
  const barWidth = Math.max(6, Math.min(18, Math.floor(plotW / Math.max(trend.length * 1.8, 4))));

  const activeItem = trend[selectedIndex] || trend[trend.length - 1];

  return (
    <div className="space-y-2.5">
      {/* 凡例 */}
      <div className="flex items-center justify-between gap-2 flex-wrap text-[10px] font-bold text-muted-foreground px-0.5">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1 text-foreground font-black">
            <span className="w-2.5 h-2.5 rounded-full bg-primary inline-block" />
            累積打率
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-0.5 bg-primary/55 inline-block" />
            累積出塁率
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-xs bg-primary/25 inline-block" />
            試合安打数
          </span>
        </div>
        <span className="text-[9.5px] text-muted-foreground">
          点をタップして試合詳細を表示
        </span>
      </div>

      {/* SVG グラフ本体（ソリッド背景） */}
      <div className="rounded-2xl bg-muted/35 border border-border/60 p-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto select-none"
          role="img"
          aria-label="累積打率・出塁率推移グラフ"
        >
          {/* Y軸グリッド線 */}
          {yTicks.map((tick) => {
            const y = getY(tick);
            const isTarget300 = Math.abs(tick - 0.3) < 0.001;
            const label =
              tick === 0
                ? ".000"
                : tick >= 1
                ? "1.00"
                : tick.toFixed(3).replace(/^0/, "");
            return (
              <g key={`tick-${tick}`}>
                <line
                  x1={padL}
                  y1={y}
                  x2={width - padR}
                  y2={y}
                  stroke="currentColor"
                  className={
                    isTarget300
                      ? "text-primary/45"
                      : "text-border"
                  }
                  strokeWidth={isTarget300 ? 1.2 : 1}
                  strokeDasharray={isTarget300 ? "3 3" : undefined}
                />
                <text
                  x={padL - 5}
                  y={y + 3.5}
                  textAnchor="end"
                  className={cn(
                    "text-[9px] font-bold fill-current",
                    isTarget300
                      ? "text-primary font-black"
                      : "text-muted-foreground"
                  )}
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* 各試合の安打数バー（下部最大45%高さ） */}
          {trend.map((item, idx) => {
            const cx = getX(idx);
            const barMaxH = plotH * 0.42;
            const bh = item.hits > 0 ? (item.hits / maxHits) * barMaxH : 0;
            const isSel = idx === selectedIndex;
            return (
              <g key={`bar-${item.matchId}-${idx}`}>
                {bh > 0 && (
                  <rect
                    x={cx - barWidth / 2}
                    y={padT + plotH - bh}
                    width={barWidth}
                    height={bh}
                    rx={3}
                    className={
                      isSel
                        ? "fill-primary/50"
                        : "fill-primary/20"
                    }
                  />
                )}
              </g>
            );
          })}

          {/* 累積出塁率ライン */}
          {trend.length > 1 && (
            <polyline
              fill="none"
              stroke="currentColor"
              className="text-primary/55"
              strokeWidth={2}
              strokeDasharray="4 3"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={obpPoints}
            />
          )}

          {/* 累積打率ライン */}
          {trend.length > 1 && (
            <polyline
              fill="none"
              stroke="currentColor"
              className="text-primary"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              points={avgPoints}
            />
          )}

          {/* タップ判定＆データノード */}
          {trend.map((item, idx) => {
            const cx = getX(idx);
            const cy = getY(item.cumAvgNum);
            const isSel = idx === selectedIndex;
            const showDateLabel =
              trend.length <= 7 ||
              idx === 0 ||
              idx === trend.length - 1 ||
              idx === selectedIndex ||
              idx % Math.ceil(trend.length / 5) === 0;

            return (
              <g
                key={`node-${item.matchId}-${idx}`}
                className="cursor-pointer"
                onClick={() => onSelectIndex(idx)}
              >
                {/* 選択中の縦ガイドライン */}
                {isSel && (
                  <line
                    x1={cx}
                    y1={padT}
                    x2={cx}
                    y2={padT + plotH}
                    stroke="currentColor"
                    className="text-primary"
                    strokeWidth={1.2}
                    strokeDasharray="2 2"
                  />
                )}

                {/* 広い透明タップ領域 */}
                <rect
                  x={cx - Math.max(14, plotW / Math.max(trend.length, 2) / 2)}
                  y={padT}
                  width={Math.max(28, plotW / Math.max(trend.length, 2))}
                  height={plotH + padB}
                  fill="transparent"
                />

                {/* 出塁率小ドット */}
                <circle
                  cx={cx}
                  cy={getY(item.cumObpNum)}
                  r={isSel ? 3.5 : 2.5}
                  fill="currentColor"
                  className="text-primary/60"
                />

                {/* 打率メインドット */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={isSel ? 6 : 4}
                  fill="currentColor"
                  stroke="var(--card)"
                  strokeWidth={2}
                  className="text-primary"
                />

                {/* X軸日付ラベル */}
                {showDateLabel && (
                  <text
                    x={cx}
                    y={height - 9}
                    textAnchor="middle"
                    className={cn(
                      "text-[9px] fill-current tabular-nums",
                      isSel
                        ? "text-foreground font-black"
                        : "text-muted-foreground font-bold"
                    )}
                  >
                    {formatShortDate(item.date)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* 選択した試合のソリッド詳細コールアウト */}
      {activeItem && (
        <div className="rounded-2xl bg-muted/50 border border-border/60 p-3 flex items-center justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
              <span className="font-black text-foreground tabular-nums">
                第{selectedIndex + 1}戦 ({formatShortDate(activeItem.date)})
              </span>
              <span className="font-black text-foreground truncate">
                vs {activeItem.opponent}
              </span>
            </div>
            <p className="text-xs font-black text-foreground tabular-nums">
              この試合: {activeItem.ab}打数 {activeItem.hits}安打
              {activeItem.rbi > 0 ? ` ${activeItem.rbi}打点` : ""}
              {activeItem.walks + activeItem.hbp > 0
                ? ` ${activeItem.walks + activeItem.hbp}四死`
                : ""}
              {activeItem.sb > 0 ? ` ${activeItem.sb}盗塁` : ""}
            </p>
            <p className="text-[10.5px] font-bold text-muted-foreground tabular-nums">
              時点成績: 打率{" "}
              <strong className="text-primary">
                {activeItem.cumAvg}
              </strong>{" "}
              / 出塁率{" "}
              <strong className="text-primary">
                {activeItem.cumObp}
              </strong>{" "}
              / OPS <strong className="text-foreground">{activeItem.cumOps}</strong>
            </p>
          </div>

          {!activeItem.matchId.startsWith("demo-match-") && (
            <Link
              href={`/liff/matches?id=${encodeURIComponent(activeItem.matchId)}`}
              className="px-2.5 py-1.5 rounded-xl bg-card hover:bg-muted border border-border/60 text-[10px] font-black text-foreground shrink-0 flex items-center gap-0.5 shadow-2xs active:scale-95 transition-all"
            >
              <span>試合詳細</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

interface PitchingGrowthChartProps {
  trend: PlayerPitchingTrendItem[];
  selectedIndex: number;
  onSelectIndex: (idx: number) => void;
}

function PitchingGrowthChart({
  trend,
  selectedIndex,
  onSelectIndex,
}: PitchingGrowthChartProps) {
  if (trend.length === 0) return null;

  const width = 360;
  const height = 180;
  const padL = 34;
  const padR = 14;
  const padT = 18;
  const padB = 30;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxEra = Math.max(4.0, ...trend.map((t) => Math.min(12, t.cumEraNum)));
  const barWidth = Math.max(10, Math.min(24, Math.floor(plotW / Math.max(trend.length * 1.8, 3))));

  const getX = (idx: number): number => {
    if (trend.length === 1) return padL + plotW / 2;
    return padL + (idx / (trend.length - 1)) * plotW;
  };

  // ストライク率バー用 (0%〜100%)
  const getBarHeight = (sRate: number | null): number => {
    if (sRate === null || sRate <= 0) return 0;
    return (Math.min(100, sRate) / 100) * plotH;
  };

  // 累積防御率ライン用 (上が0.00＝優秀になるよう標準表示 or 数値どおり下0〜上maxEra)
  // 直感的に読みやすい下0.00〜上maxEraで描画し、低下＝改善を明示
  const getEraY = (eraVal: number): number => {
    const clamped = Math.max(0, Math.min(maxEra, eraVal));
    return padT + plotH - (clamped / maxEra) * plotH;
  };

  const eraPoints = trend
    .map((t, i) => `${getX(i)},${getEraY(t.cumEraNum)}`)
    .join(" ");

  const activeItem = trend[selectedIndex] || trend[trend.length - 1];

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2 flex-wrap text-[10px] font-bold text-muted-foreground px-0.5">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1 text-foreground font-black">
            <span className="w-2.5 h-2.5 rounded-full bg-primary inline-block" />
            累積防御率 (低いほど優秀)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-xs bg-primary/35 inline-block" />
            ストライク率 S%
          </span>
        </div>
      </div>

      <div className="rounded-2xl bg-muted/35 border border-border/60 p-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto select-none"
          role="img"
          aria-label="投手防御率・ストライク率推移グラフ"
        >
          {[0, Number((maxEra / 2).toFixed(1)), Number(maxEra.toFixed(1))].map(
            (tick) => {
              const y = getEraY(tick);
              return (
                <g key={`era-tick-${tick}`}>
                  <line
                    x1={padL}
                    y1={y}
                    x2={width - padR}
                    y2={y}
                    stroke="currentColor"
                    className="text-border"
                    strokeWidth={1}
                  />
                  <text
                    x={padL - 5}
                    y={y + 3.5}
                    textAnchor="end"
                    className="text-[9px] font-bold fill-current text-muted-foreground tabular-nums"
                  >
                    {tick.toFixed(1)}
                  </text>
                </g>
              );
            }
          )}

          {/* ストライク率バー */}
          {trend.map((item, idx) => {
            const cx = getX(idx);
            const bh = getBarHeight(item.strikeRatePercent);
            const isSel = idx === selectedIndex;
            return (
              <g key={`pbar-${item.matchId}-${idx}`}>
                {bh > 0 && (
                  <rect
                    x={cx - barWidth / 2}
                    y={padT + plotH - bh}
                    width={barWidth}
                    height={bh}
                    rx={4}
                    className={
                      isSel
                        ? "fill-primary/45"
                        : "fill-primary/20"
                    }
                  />
                )}
              </g>
            );
          })}

          {trend.length > 1 && (
            <polyline
              fill="none"
              stroke="currentColor"
              className="text-primary"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              points={eraPoints}
            />
          )}

          {trend.map((item, idx) => {
            const cx = getX(idx);
            const cy = getEraY(item.cumEraNum);
            const isSel = idx === selectedIndex;
            return (
              <g
                key={`pnode-${item.matchId}-${idx}`}
                className="cursor-pointer"
                onClick={() => onSelectIndex(idx)}
              >
                <rect
                  x={cx - Math.max(16, plotW / Math.max(trend.length, 2) / 2)}
                  y={padT}
                  width={Math.max(32, plotW / Math.max(trend.length, 2))}
                  height={plotH + padB}
                  fill="transparent"
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={isSel ? 6 : 4}
                  fill="currentColor"
                  stroke="var(--card)"
                  strokeWidth={2}
                  className="text-primary"
                />
                <text
                  x={cx}
                  y={height - 9}
                  textAnchor="middle"
                  className={cn(
                    "text-[9px] fill-current tabular-nums",
                    isSel
                      ? "text-foreground font-black"
                      : "text-muted-foreground font-bold"
                  )}
                >
                  {formatShortDate(item.date)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {activeItem && (
        <div className="rounded-2xl bg-muted/50 border border-border/60 p-3 flex items-center justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
              <span className="font-black text-foreground tabular-nums">
                {formatShortDate(activeItem.date)}
              </span>
              <span className="font-black text-foreground truncate">
                vs {activeItem.opponent}
              </span>
            </div>
            <p className="text-xs font-black text-foreground tabular-nums">
              {activeItem.ip}回 奪三振{activeItem.strikeouts} 四死
              {activeItem.walksAndHbp} 自責{activeItem.earnedRuns}
              {activeItem.pitchesThrown > 0
                ? `（${activeItem.pitchesThrown}球・S率${activeItem.strikeRatePercent}%）`
                : ""}
            </p>
            <p className="text-[10.5px] font-bold text-muted-foreground tabular-nums">
              時点防御率:{" "}
              <strong className="text-primary">
                {activeItem.cumEra}
              </strong>{" "}
              / WHIP <strong className="text-foreground">{activeItem.cumWhip}</strong>
            </p>
          </div>
          {!activeItem.matchId.startsWith("demo-match-") && (
            <Link
              href={`/liff/matches?id=${encodeURIComponent(activeItem.matchId)}`}
              className="px-2.5 py-1.5 rounded-xl bg-card hover:bg-muted border border-border/60 text-[10px] font-black text-foreground shrink-0 flex items-center gap-0.5 shadow-2xs active:scale-95 transition-all"
            >
              <span>試合詳細</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function PlayerGrowthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentTeam, isDemo: providerDemo } = useLiff();

  const queryPlayerId = searchParams.get("id");

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [growthData, setGrowthData] = useState<PlayerGrowthResponse | null>(null);

  const [filter, setFilter] = useState<GrowthFilterKey>("all");
  const [logSortOrder, setLogSortOrder] = useState<"desc" | "asc">("desc");
  const [selectedBatGameIdx, setSelectedBatGameIdx] = useState<number>(0);
  const [selectedPitchGameIdx, setSelectedPitchGameIdx] = useState<number>(0);

  const loadGrowth = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const tid =
        currentTeam?.id ||
        (typeof window !== "undefined"
          ? localStorage.getItem("iscore_selectedTeamId")
          : "") ||
        "demo-team";
      const pidParam = queryPlayerId
        ? `&playerId=${encodeURIComponent(queryPlayerId)}`
        : "";
      const res = await fetch(
        `/api/liff/players/growth?teamId=${encodeURIComponent(tid)}${pidParam}`,
        { cache: "no-store" }
      );
      const json = (await res.json()) as PlayerGrowthResponse;
      if (!res.ok || !json.success) {
        setErrorMsg(json.error || "成長データの取得に失敗しました");
        setGrowthData(null);
      } else {
        setGrowthData(json);
      }
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "ネットワークエラーが発生しました"
      );
    } finally {
      setIsLoading(false);
    }
  }, [currentTeam?.id, queryPlayerId]);

  useEffect(() => {
    void loadGrowth();
  }, [loadGrowth]);

  const activeSection = useMemo(() => {
    if (!growthData?.sectionsByFilter) return null;
    return growthData.sectionsByFilter[filter];
  }, [growthData, filter]);

  // 選手・チーム・フィルタ切替時にグラフ選択インデックスを最新試合へ自動リセット（規約5遵守）
  useEffect(() => {
    const batLen = activeSection?.battingTrend.length ?? 0;
    const pitLen = activeSection?.pitchingTrend.length ?? 0;
    setSelectedBatGameIdx(batLen > 0 ? batLen - 1 : 0);
    setSelectedPitchGameIdx(pitLen > 0 ? pitLen - 1 : 0);
  }, [growthData?.player?.id, currentTeam?.id, filter, activeSection]);

  const roster = growthData?.roster || [];
  const player = growthData?.player || null;

  const currentRosterIdx = useMemo(() => {
    if (!player) return -1;
    return roster.findIndex((r) => r.id === player.id);
  }, [roster, player]);

  const prevRosterPlayer =
    currentRosterIdx > 0 ? roster[currentRosterIdx - 1] : null;
  const nextRosterPlayer =
    currentRosterIdx >= 0 && currentRosterIdx < roster.length - 1
      ? roster[currentRosterIdx + 1]
      : null;

  const handleSwitchPlayer = (nextId: string) => {
    if (!nextId || nextId === player?.id) return;
    router.replace(`/liff/players/growth?id=${encodeURIComponent(nextId)}`);
  };

  const orderedGameLogs = useMemo(() => {
    if (!activeSection) return [];
    const copy = [...activeSection.battingTrend];
    return logSortOrder === "desc" ? copy.reverse() : copy;
  }, [activeSection, logSortOrder]);

  const pitchingByMatchId = useMemo(() => {
    const map = new Map<string, PlayerPitchingTrendItem>();
    for (const p of activeSection?.pitchingTrend || []) {
      map.set(p.matchId, p);
    }
    return map;
  }, [activeSection]);

  const sharePayload = player
    ? {
        title: `【個人成長レポート】#${cleanUniform(player.uniformNumber)} ${player.name}`,
        text: `${growthData?.team?.name || "チーム"} ${player.name}選手の打撃・守備・成長推移レポートをチェック！`,
      }
    : undefined;

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader shareData={sharePayload} />

      <div className="p-4 space-y-4 max-w-lg mx-auto w-full">
        <LiffPageHeader
          title="個人成長レポート"
          subtitle="PLAYER GROWTH & ANALYTICS"
          icon={
            <span className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black">
              <TrendingUp className="w-4.5 h-4.5" />
            </span>
          }
          showBack
          rightElement={
            <Link
              href="/liff/players"
              className="px-2.5 py-1.5 rounded-xl bg-card border border-border/60 hover:bg-muted text-[11px] font-black text-foreground flex items-center gap-1 active:scale-95 transition-all shadow-2xs"
            >
              <IdCard className="w-3.5 h-3.5 text-primary" />
              <span>選手名鑑</span>
            </Link>
          }
          shareData={sharePayload}
        />

        {isLoading ? (
          <div className="rounded-2xl border border-border/60 bg-card p-12 flex flex-col items-center justify-center gap-2.5 shadow-xs">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
            <p className="text-xs font-bold text-muted-foreground">
              選手の成長データを分析中...
            </p>
          </div>
        ) : errorMsg || !player || !activeSection || !growthData?.sectionsByFilter ? (
          <div className="space-y-4 py-6">
            <EmptyState
              icon={TrendingUp}
              title="選手データが見つかりません"
              description={errorMsg || "PLAYER DATA NOT FOUND"}
            />
            <div className="flex justify-center">
              <Link
                href="/liff/players"
                className="px-4 py-2.5 rounded-2xl bg-primary text-primary-foreground text-xs font-black shadow-xs"
              >
                選手名鑑へ戻る
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* ━━━ 🔄 選手クイック切替バー（前後ボタン＋セレクター） ━━━ */}
            {roster.length > 1 && (
              <div className="flex items-center gap-1.5 rounded-2xl border border-border/60 bg-card p-1.5 shadow-xs">
                <button
                  type="button"
                  disabled={!prevRosterPlayer}
                  onClick={() =>
                    prevRosterPlayer && handleSwitchPlayer(prevRosterPlayer.id)
                  }
                  className="h-9 w-9 rounded-xl border border-border/60 bg-muted/50 hover:bg-muted disabled:opacity-35 flex items-center justify-center text-foreground active:scale-95 transition-all shrink-0"
                  aria-label="前の選手へ切替"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <select
                  value={player.id}
                  onChange={(e) => handleSwitchPlayer(e.target.value)}
                  aria-label="表示する選手を選択"
                  className="flex-1 h-9 px-3 rounded-xl bg-muted/35 border border-border/60 text-xs font-black text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40 truncate"
                >
                  {roster.map((rp) => {
                    const pMeta = getPosMeta(rp.primaryPosition);
                    return (
                      <option key={rp.id} value={rp.id}>
                        #{cleanUniform(rp.uniformNumber)} {rp.name}（
                        {pMeta.shortLabel}）
                      </option>
                    );
                  })}
                </select>

                <button
                  type="button"
                  disabled={!nextRosterPlayer}
                  onClick={() =>
                    nextRosterPlayer && handleSwitchPlayer(nextRosterPlayer.id)
                  }
                  className="h-9 w-9 rounded-xl border border-border/60 bg-muted/50 hover:bg-muted disabled:opacity-35 flex items-center justify-center text-foreground active:scale-95 transition-all shrink-0"
                  aria-label="次の選手へ切替"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* ━━━ 🏟️ 選手ヒーロープロフィール ＆ 実戦守備位置サマリー ━━━ */}
            {(() => {
              const mainMeta = getPosMeta(player.primaryPosition);
              const numStr = cleanUniform(player.uniformNumber);
              const initial = player.name.replace(/\s+/g, "").slice(0, 1) || "選";
              const subLabels = player.subPositions.map(
                (sp) => getPosMeta(sp).shortLabel
              );

              return (
                <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-card text-foreground p-4 shadow-xs space-y-3">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none select-none absolute right-2 -bottom-5 text-[96px] font-black italic tracking-tighter leading-none text-primary/[0.08] tabular-nums"
                  >
                    {numStr}
                  </span>

                  <div className="relative z-10 flex items-center gap-3.5">
                    <Avatar className="h-16 w-16 border-2 border-primary/25 shadow-xs shrink-0">
                      {player.profileImageUrl && (
                        <AvatarImage
                          src={player.profileImageUrl}
                          alt={player.name}
                          className="object-cover"
                        />
                      )}
                      <AvatarFallback className="bg-primary/15 text-primary font-black text-xl">
                        {initial}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded-lg bg-primary/10 text-primary border border-primary/25 text-xs font-black italic tabular-nums">
                          #{numStr}
                        </span>
                        <span
                          className={cn(
                            "px-2.5 py-0.5 rounded-full text-[11px] font-black",
                            mainMeta.pillClass
                          )}
                        >
                          メイン: {mainMeta.shortLabel}
                        </span>
                        {player.isCaptain && (
                          <span className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-black flex items-center gap-0.5">
                            <Crown className="w-3 h-3 fill-current" />
                            <span>主将</span>
                          </span>
                        )}
                        {(growthData.isDemo || providerDemo) && (
                          <span className="px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground border border-border/60 text-[10px] font-black">
                            DEMO
                          </span>
                        )}
                      </div>

                      {player.nameKana && (
                        <p className="text-[10px] font-bold text-muted-foreground tracking-wider truncate">
                          {player.nameKana}
                        </p>
                      )}
                      <h2 className="text-lg sm:text-xl font-black tracking-tight text-foreground truncate">
                        {player.name}
                      </h2>

                      <div className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground flex-wrap">
                        <span>{formatThrowsBats(player.throws, player.bats)}</span>
                        {player.height && (
                          <span className="tabular-nums">
                            {player.height}cm
                            {player.weight ? ` / ${player.weight}kg` : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* サブ守備位置行 */}
                  {subLabels.length > 0 && (
                    <div className="relative z-10 flex items-center gap-1.5 flex-wrap pt-2 border-t border-border/60 text-[11px]">
                      <span className="font-bold text-muted-foreground shrink-0">
                        サブ守備位置:
                      </span>
                      {subLabels.map((lbl, idx) => (
                        <span
                          key={`${lbl}-${idx}`}
                          className="px-2 py-0.5 rounded-md bg-muted/50 border border-border/60 text-foreground font-black text-[10.5px]"
                        >
                          {lbl}
                        </span>
                      ))}
                      {player.positionSource === "match_data" && (
                        <span className="ml-auto text-[10px] font-bold text-primary tabular-nums">
                          実戦 {player.totalPositionGames}試合集計
                        </span>
                      )}
                    </div>
                  )}
                </section>
              );
            })()}

            {/* ━━━ 試合種別フィルタータブ ━━━ */}
            <div className="grid grid-cols-4 gap-1 p-1 bg-muted/50 rounded-2xl border border-border/60">
              {(
                [
                  {
                    key: "all" as const,
                    label: "すべて",
                    count: growthData.sectionsByFilter.all.battingSummary.games,
                  },
                  {
                    key: "official" as const,
                    label: "🏆 公式戦",
                    count:
                      growthData.sectionsByFilter.official.battingSummary.games,
                  },
                  {
                    key: "exchange" as const,
                    label: "🤝 交流戦",
                    count:
                      growthData.sectionsByFilter.exchange.battingSummary.games,
                  },
                  {
                    key: "practice" as const,
                    label: "⚾ OP戦",
                    count:
                      growthData.sectionsByFilter.practice.battingSummary.games,
                  },
                ] as const
              ).map((item) => {
                const active = filter === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setFilter(item.key)}
                    className={cn(
                      "py-1.5 px-1 rounded-xl text-[11px] font-black transition-all truncate tabular-nums",
                      active
                        ? "bg-card text-primary shadow-xs border border-border/60"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {item.label} ({item.count})
                  </button>
                );
              })}
            </div>

            {activeSection.battingTrend.length === 0 &&
            !activeSection.pitchingSummary ? (
              <div className="space-y-4 py-4">
                <EmptyState
                  icon={ScanLine}
                  title="この条件の試合記録がまだありません"
                  description="NO MATCH RECORDS IN THIS FILTER"
                />
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <Link
                    href="/liff/tools/scorebook-import"
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-primary text-primary-foreground text-xs font-black shadow-xs active:scale-95 transition-all"
                  >
                    <ScanLine className="w-4 h-4" />
                    <span>スコアブックを取り込む</span>
                  </Link>
                  <Link
                    href="/liff/matches"
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-card border border-border/60 text-foreground text-xs font-black shadow-xs active:scale-95 transition-all"
                  >
                    <span>試合情報を見る</span>
                  </Link>
                </div>
              </div>
            ) : (
              <>
                {/* ━━━ 🔥 Section 1: 成長ハイライト（直近フォーム vs 通算比較 & 記録バッジ） ━━━ */}
                {activeSection.battingSummary.pa > 0 && (
                  <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-xs space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <h3 className="text-xs font-black text-foreground flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-primary" />
                        <span>
                          成長ハイライト（直近
                          {activeSection.recentForm.sampleGames}
                          試合の調子）
                        </span>
                      </h3>
                      <span className="text-[10px] font-bold text-muted-foreground">
                        通算成績との比較
                      </span>
                    </div>

                    {/* 継続中ストリーク・達成バッジ */}
                    {(activeSection.recentForm.currentHitStreak >= 2 ||
                      activeSection.recentForm.currentOnBaseStreak >= 2 ||
                      activeSection.recentForm.multiHitGames >= 1) && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {activeSection.recentForm.currentHitStreak >= 2 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/25 text-[10.5px] font-black tabular-nums">
                            <Flame className="w-3 h-3" />
                            {activeSection.recentForm.currentHitStreak}
                            試合連続安打中！
                          </span>
                        )}
                        {activeSection.recentForm.currentOnBaseStreak >= 2 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/25 text-[10.5px] font-black tabular-nums">
                            <Award className="w-3 h-3" />
                            {activeSection.recentForm.currentOnBaseStreak}
                            試合連続出塁中！
                          </span>
                        )}
                        {activeSection.recentForm.multiHitGames >= 1 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/25 text-[10.5px] font-black tabular-nums">
                            マルチ安打 {activeSection.recentForm.multiHitGames}回
                          </span>
                        )}
                      </div>
                    )}

                    {/* 直近比較 3カラムカード */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      {/* 直近打率 */}
                      <div className="p-2.5 rounded-2xl bg-muted/35 border border-border/60 space-y-1">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          直近打率
                        </span>
                        <span className="text-base sm:text-lg font-black text-foreground tabular-nums block leading-none">
                          {activeSection.recentForm.recentAvg}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-0.5 text-[10px] font-black tabular-nums px-1.5 py-0.2 rounded-full",
                            activeSection.recentForm.avgDiffPoints > 0
                              ? "bg-primary/10 text-primary"
                              : activeSection.recentForm.avgDiffPoints < 0
                              ? "bg-muted text-muted-foreground"
                              : "bg-muted text-foreground"
                          )}
                        >
                          {activeSection.recentForm.avgDiffPoints > 0 && (
                            <ArrowUpRight className="w-2.5 h-2.5" />
                          )}
                          {activeSection.recentForm.avgDiffText}
                        </span>
                      </div>

                      {/* 直近出塁率 */}
                      <div className="p-2.5 rounded-2xl bg-muted/35 border border-border/60 space-y-1">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          直近出塁率
                        </span>
                        <span className="text-base sm:text-lg font-black text-foreground tabular-nums block leading-none">
                          {activeSection.recentForm.recentObp}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-0.5 text-[10px] font-black tabular-nums px-1.5 py-0.2 rounded-full",
                            activeSection.recentForm.obpDiffPoints > 0
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {activeSection.recentForm.obpDiffPoints > 0 && (
                            <ArrowUpRight className="w-2.5 h-2.5" />
                          )}
                          {activeSection.recentForm.obpDiffText}
                        </span>
                      </div>

                      {/* 直近三振率（低いほど良化） */}
                      <div className="p-2.5 rounded-2xl bg-muted/35 border border-border/60 space-y-1">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          直近三振率
                        </span>
                        <span className="text-base sm:text-lg font-black text-foreground tabular-nums block leading-none">
                          {activeSection.recentForm.recentKRatePercent}%
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-0.5 text-[10px] font-black tabular-nums px-1.5 py-0.2 rounded-full",
                            activeSection.recentForm.kRateDiffPercent <= 0
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {activeSection.recentForm.kRateDiffPercent < 0
                            ? `${activeSection.recentForm.kRateDiffPercent}% 改善`
                            : activeSection.recentForm.kRateDiffPercent === 0
                            ? "安定維持"
                            : `+${activeSection.recentForm.kRateDiffPercent}%`}
                        </span>
                      </div>
                    </div>
                  </section>
                )}

                {/* ━━━ 📈 Section 2: 打撃成績サマリー & 推移グラフ ━━━ */}
                {activeSection.battingSummary.games > 0 && (
                  <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-xs space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-black text-foreground flex items-center gap-1.5">
                        <Flame className="w-4 h-4 text-primary" />
                        <span>打撃成長チャート & 通算指標</span>
                      </h3>
                      <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
                        {activeSection.battingSummary.games}試合・
                        {activeSection.battingSummary.pa}打席
                      </span>
                    </div>

                    {/* 主要打撃 8指標グリッド */}
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="p-2 rounded-2xl bg-primary/10 border border-primary/25">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          打率
                        </span>
                        <span className="text-sm sm:text-base font-black text-primary tabular-nums">
                          {activeSection.battingSummary.avg}
                        </span>
                      </div>
                      <div className="p-2 rounded-2xl bg-muted/50 border border-border/60">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          出塁率
                        </span>
                        <span className="text-sm sm:text-base font-black text-primary tabular-nums">
                          {activeSection.battingSummary.obp}
                        </span>
                      </div>
                      <div className="p-2 rounded-2xl bg-muted/50 border border-border/60">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          OPS
                        </span>
                        <span className="text-sm sm:text-base font-black text-foreground tabular-nums">
                          {activeSection.battingSummary.ops}
                        </span>
                      </div>
                      <div className="p-2 rounded-2xl bg-muted/50 border border-border/60">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          安打 / 長打
                        </span>
                        <span className="text-sm font-black text-foreground tabular-nums">
                          {activeSection.battingSummary.hits}
                          <span className="text-[10px] text-muted-foreground font-bold">
                            /{activeSection.battingSummary.doubles +
                              activeSection.battingSummary.triples +
                              activeSection.battingSummary.hr}
                          </span>
                        </span>
                      </div>

                      <div className="p-2 rounded-2xl bg-muted/50 border border-border/60">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          打点 / 得点
                        </span>
                        <span className="text-xs font-black text-foreground tabular-nums">
                          {activeSection.battingSummary.rbi} /{" "}
                          {activeSection.battingSummary.runs}
                        </span>
                      </div>
                      <div className="p-2 rounded-2xl bg-muted/50 border border-border/60">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          盗塁
                        </span>
                        <span className="text-xs font-black text-primary tabular-nums">
                          {activeSection.battingSummary.sb}
                        </span>
                      </div>
                      <div className="p-2 rounded-2xl bg-muted/50 border border-border/60">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          四死球率
                        </span>
                        <span className="text-xs font-black text-foreground tabular-nums">
                          {activeSection.battingSummary.bbRatePercent}%
                        </span>
                      </div>
                      <div className="p-2 rounded-2xl bg-muted/50 border border-border/60">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          三振率
                        </span>
                        <span className="text-xs font-black text-foreground tabular-nums">
                          {activeSection.battingSummary.kRatePercent}%
                        </span>
                      </div>
                    </div>

                    {/* SVG 推移グラフ */}
                    <BattingGrowthChart
                      trend={activeSection.battingTrend}
                      selectedIndex={selectedBatGameIdx}
                      onSelectIndex={setSelectedBatGameIdx}
                    />

                    {/* 月別ステップアップ推移 */}
                    {activeSection.monthlyBatting.length > 0 && (
                      <div className="pt-2 border-t border-border/60 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black text-foreground flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-primary" />
                            <span>月別ステップアップ推移</span>
                          </span>
                          {activeSection.battingSummary.pitchesPerPa && (
                            <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
                              平均 {activeSection.battingSummary.pitchesPerPa} 球/打席
                            </span>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          {activeSection.monthlyBatting.map((m) => (
                            <div
                              key={m.month}
                              className="px-3 py-2 rounded-xl bg-muted/35 border border-border/60 flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="min-w-0">
                                <span className="font-black text-foreground">
                                  {m.monthLabel}
                                </span>
                                <span className="text-[10px] font-bold text-muted-foreground ml-1.5 tabular-nums">
                                  ({m.games}試合 {m.ab}打数{m.hits}安打)
                                </span>
                              </div>

                              <div className="flex items-center gap-2 shrink-0 tabular-nums">
                                <div className="w-14 h-1.5 rounded-full bg-muted overflow-hidden hidden min-[370px]:block">
                                  <div
                                    className="h-full bg-primary rounded-full"
                                    style={{
                                      width: `${Math.min(
                                        100,
                                        Math.round((m.avgNum / 0.5) * 100)
                                      )}%`,
                                    }}
                                  />
                                </div>
                                <span className="font-black text-primary">
                                  {m.avg}
                                </span>
                                <span className="text-[10px] font-bold text-muted-foreground">
                                  OPS {m.ops}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>
                )}

                {/* ━━━ 🎯 Section 3: 打球方向バランス（広角打法チェック） ━━━ */}
                {activeSection.battedDirection.total > 0 && (
                  <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-xs space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-black text-foreground flex items-center gap-1.5">
                        <Target className="w-4 h-4 text-primary" />
                        <span>打球方向バランス（左・中・右）</span>
                      </h3>
                      <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
                        集計 {activeSection.battedDirection.total}打球
                      </span>
                    </div>

                    {/* 3方向比率プログレスバー */}
                    <div className="h-3.5 w-full rounded-full overflow-hidden flex border border-border/60 bg-muted/40">
                      {activeSection.battedDirection.leftPercent > 0 && (
                        <div
                          className="h-full bg-primary"
                          style={{
                            width: `${activeSection.battedDirection.leftPercent}%`,
                          }}
                        />
                      )}
                      {activeSection.battedDirection.centerPercent > 0 && (
                        <div
                          className="h-full bg-primary/65"
                          style={{
                            width: `${activeSection.battedDirection.centerPercent}%`,
                          }}
                        />
                      )}
                      {activeSection.battedDirection.rightPercent > 0 && (
                        <div
                          className="h-full bg-primary/35"
                          style={{
                            width: `${activeSection.battedDirection.rightPercent}%`,
                          }}
                        />
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2.5 rounded-2xl bg-muted/35 border border-border/60">
                        <span className="text-[10px] font-black text-primary block">
                          レフト方向
                        </span>
                        <span className="text-base font-black text-foreground tabular-nums block mt-0.5">
                          {activeSection.battedDirection.leftPercent}%
                        </span>
                        <span className="text-[9.5px] font-bold text-muted-foreground tabular-nums block">
                          {activeSection.battedDirection.left}打球 (三・遊・左)
                        </span>
                      </div>

                      <div className="p-2.5 rounded-2xl bg-muted/35 border border-border/60">
                        <span className="text-[10px] font-black text-primary block">
                          センター方向
                        </span>
                        <span className="text-base font-black text-foreground tabular-nums block mt-0.5">
                          {activeSection.battedDirection.centerPercent}%
                        </span>
                        <span className="text-[9.5px] font-bold text-muted-foreground tabular-nums block">
                          {activeSection.battedDirection.center}打球 (投・中)
                        </span>
                      </div>

                      <div className="p-2.5 rounded-2xl bg-muted/35 border border-border/60">
                        <span className="text-[10px] font-black text-primary block">
                          ライト方向
                        </span>
                        <span className="text-base font-black text-foreground tabular-nums block mt-0.5">
                          {activeSection.battedDirection.rightPercent}%
                        </span>
                        <span className="text-[9.5px] font-bold text-muted-foreground tabular-nums block">
                          {activeSection.battedDirection.right}打球 (一・二・右)
                        </span>
                      </div>
                    </div>
                  </section>
                )}

                {/* ━━━ ⚾ Section 4: 投手成長レポート（登板実績がある選手に自動表示） ━━━ */}
                {activeSection.pitchingSummary && (
                  <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-xs space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-black text-foreground flex items-center gap-1.5">
                        <Activity className="w-4 h-4 text-primary" />
                        <span>投手成長レポート（制球力・防御率推移）</span>
                      </h3>
                      <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
                        {activeSection.pitchingSummary.games}登板・7回制換算
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="p-2 rounded-2xl bg-primary/10 border border-primary/25">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          防御率
                        </span>
                        <span className="text-sm sm:text-base font-black text-primary tabular-nums">
                          {activeSection.pitchingSummary.era}
                        </span>
                      </div>
                      <div className="p-2 rounded-2xl bg-muted/50 border border-border/60">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          ストライク率
                        </span>
                        <span className="text-sm sm:text-base font-black text-primary tabular-nums">
                          {activeSection.pitchingSummary.strikeRatePercent !==
                          null
                            ? `${activeSection.pitchingSummary.strikeRatePercent}%`
                            : "--"}
                        </span>
                      </div>
                      <div className="p-2 rounded-2xl bg-muted/50 border border-border/60">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          投球回
                        </span>
                        <span className="text-sm sm:text-base font-black text-foreground tabular-nums">
                          {activeSection.pitchingSummary.ip}
                        </span>
                      </div>
                      <div className="p-2 rounded-2xl bg-muted/50 border border-border/60">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          WHIP
                        </span>
                        <span className="text-sm sm:text-base font-black text-foreground tabular-nums">
                          {activeSection.pitchingSummary.whip}
                        </span>
                      </div>

                      <div className="p-2 rounded-2xl bg-muted/50 border border-border/60">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          奪三振
                        </span>
                        <span className="text-xs font-black text-foreground tabular-nums">
                          {activeSection.pitchingSummary.strikeouts}
                        </span>
                      </div>
                      <div className="p-2 rounded-2xl bg-muted/50 border border-border/60">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          与四死球
                        </span>
                        <span className="text-xs font-black text-foreground tabular-nums">
                          {activeSection.pitchingSummary.walks +
                            activeSection.pitchingSummary.hbp}
                        </span>
                      </div>
                      <div className="p-2 rounded-2xl bg-muted/50 border border-border/60">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          K/BB
                        </span>
                        <span className="text-xs font-black text-foreground tabular-nums">
                          {activeSection.pitchingSummary.kBbRatio}
                        </span>
                      </div>
                      <div className="p-2 rounded-2xl bg-muted/50 border border-border/60">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          総球数
                        </span>
                        <span className="text-xs font-black text-foreground tabular-nums">
                          {activeSection.pitchingSummary.pitchesThrown || "--"}
                        </span>
                      </div>
                    </div>

                    <PitchingGrowthChart
                      trend={activeSection.pitchingTrend}
                      selectedIndex={selectedPitchGameIdx}
                      onSelectIndex={setSelectedPitchGameIdx}
                    />
                  </section>
                )}

                {/* ━━━ 🧤 Section 5: 実戦守備位置（メイン＆サブ集計）＆ 打順経験マップ ━━━ */}
                {(player.positionCounts.length > 0 ||
                  player.battingOrderCounts.length > 0) && (
                  <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-xs space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-black text-foreground flex items-center gap-1.5">
                        <Shield className="w-4 h-4 text-primary" />
                        <span>守備位置・打順の実戦経験マップ</span>
                      </h3>
                      {player.totalPositionGames > 0 && (
                        <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
                          全{player.totalPositionGames}試合の守備記録
                        </span>
                      )}
                    </div>

                    {player.positionCounts.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10.5px] font-bold text-muted-foreground">
                          最多出場の守備位置をメイン、その他の出場ポジションをサブとして自動集計しています
                        </p>
                        <div className="space-y-1.5">
                          {player.positionCounts.map((pc, idx) => {
                            const isMain = idx === 0;
                            const meta = getPosMeta(pc.position);
                            return (
                              <div
                                key={pc.position}
                                className="px-3 py-2 rounded-xl bg-muted/35 border border-border/60 flex items-center justify-between gap-3 text-xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className={cn(
                                      "px-1.5 py-0.5 rounded-md text-[9.5px] font-black shrink-0",
                                      isMain
                                        ? meta.pillClass
                                        : "bg-muted text-muted-foreground border border-border/60"
                                    )}
                                  >
                                    {isMain ? "メイン" : "サブ"}
                                  </span>
                                  <span className="font-black text-foreground">
                                    {meta.shortLabel}
                                  </span>
                                  <span className="text-[10px] font-bold text-muted-foreground">
                                    ({meta.code})
                                  </span>
                                </div>

                                <div className="flex items-center gap-2.5 shrink-0">
                                  <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                                    <div
                                      className={cn(
                                        "h-full rounded-full",
                                        meta.barClass
                                      )}
                                      style={{
                                        width: `${Math.max(
                                          12,
                                          Math.min(100, pc.sharePercent)
                                        )}%`,
                                      }}
                                    />
                                  </div>
                                  <span className="font-black text-foreground tabular-nums w-12 text-right">
                                    {pc.games}試合
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {player.battingOrderCounts.length > 0 && (
                      <div className="pt-2 border-t border-border/60 space-y-2">
                        <span className="text-[11px] font-black text-foreground block">
                          出場打順の経験内訳
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {player.battingOrderCounts.map((bo, idx) => (
                            <span
                              key={bo.order}
                              className={cn(
                                "px-2.5 py-1 rounded-xl border text-xs font-black tabular-nums",
                                idx === 0
                                  ? "bg-primary/10 border-primary/25 text-primary"
                                  : "bg-muted/50 border-border/60 text-foreground"
                              )}
                            >
                              {bo.order}番{" "}
                              <span className="text-[10.5px] font-bold text-muted-foreground">
                                ({bo.games}試合)
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>
                )}

                {/* ━━━ 📋 Section 6: 試合別 成長ログ（全打席チップ ＆ 投手成績） ━━━ */}
                <section className="space-y-2.5">
                  <div className="flex items-center justify-between px-1 gap-2">
                    <h3 className="text-xs font-black text-foreground">
                      試合別 個人成績ログ（{orderedGameLogs.length}試合）
                    </h3>
                    <div className="inline-flex items-center gap-1 p-0.5 rounded-xl bg-muted/50 border border-border/60">
                      <button
                        type="button"
                        onClick={() => setLogSortOrder("desc")}
                        className={cn(
                          "px-2 py-0.5 rounded-lg text-[10px] font-black transition-all",
                          logSortOrder === "desc"
                            ? "bg-card text-primary shadow-2xs"
                            : "text-muted-foreground"
                        )}
                      >
                        新しい順
                      </button>
                      <button
                        type="button"
                        onClick={() => setLogSortOrder("asc")}
                        className={cn(
                          "px-2 py-0.5 rounded-lg text-[10px] font-black transition-all",
                          logSortOrder === "asc"
                            ? "bg-card text-primary shadow-2xs"
                            : "text-muted-foreground"
                        )}
                      >
                        古い順
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {orderedGameLogs.map((g) => {
                      const typeBadge = MATCH_TYPE_BADGES[g.matchType];
                      const pLine = pitchingByMatchId.get(g.matchId);
                      const resBadge =
                        g.result === "win"
                          ? { text: "勝", cls: "bg-emerald-600 text-white" }
                          : g.result === "loss"
                          ? { text: "負", cls: "bg-rose-600 text-white" }
                          : { text: "分", cls: "bg-zinc-500 text-white" };

                      const posText = g.positions
                        .map((pos) => getPosMeta(pos).shortLabel)
                        .join("→");
                      const orderText =
                        g.battingOrders.length > 0
                          ? `${g.battingOrders[0]}番`
                          : "";
                      const roleLabel = [orderText, posText]
                        .filter(Boolean)
                        .join("・");

                      return (
                        <div
                          key={g.matchId}
                          className="rounded-2xl border border-border/60 bg-card p-3.5 shadow-xs space-y-2.5"
                        >
                          {/* 上段：日付・種別・相手・チーム勝敗 */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[11px] font-bold text-muted-foreground tabular-nums">
                                  {formatShortDate(g.date)}
                                </span>
                                <span
                                  className={cn(
                                    "px-1.5 py-0.2 rounded border text-[9.5px] font-black",
                                    typeBadge.cls
                                  )}
                                >
                                  {typeBadge.label}
                                </span>
                                {roleLabel && (
                                  <span className="px-1.5 py-0.2 rounded bg-muted/50 border border-border/60 text-[9.5px] font-black text-foreground">
                                    {roleLabel}
                                  </span>
                                )}
                              </div>
                              {g.tournamentName && (
                                <p className="text-[10px] font-bold text-muted-foreground truncate">
                                  {g.tournamentName}
                                </p>
                              )}
                              <p className="text-xs sm:text-sm font-black text-foreground truncate">
                                vs {g.opponent}
                              </p>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className={cn(
                                  "px-1.5 py-0.5 rounded-md text-[10px] font-black",
                                  resBadge.cls
                                )}
                              >
                                {resBadge.text} {g.myScore}-{g.opponentScore}
                              </span>
                              {!g.matchId.startsWith("demo-match-") && (
                                <Link
                                  href={`/liff/matches?id=${encodeURIComponent(
                                    g.matchId
                                  )}`}
                                  className="p-1.5 rounded-lg bg-muted/50 hover:bg-muted border border-border/60 text-foreground transition-colors"
                                  aria-label="試合詳細を開く"
                                >
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </Link>
                              )}
                            </div>
                          </div>

                          {/* 打席結果チップ一覧 */}
                          {g.atBatChips.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {g.atBatChips.map((chip, cIdx) => {
                                const chipCls =
                                  chip.kind === "hr"
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : chip.kind === "hit"
                                    ? "bg-primary/15 text-primary border-primary/30"
                                    : chip.kind === "walk" || chip.kind === "sac"
                                    ? "bg-primary/10 text-primary border-primary/20"
                                    : "bg-muted/50 text-muted-foreground border-border/60";

                                return (
                                  <span
                                    key={`${g.matchId}-ab-${cIdx}`}
                                    className={cn(
                                      "px-2 py-0.5 rounded-lg border text-[10.5px] font-black tabular-nums",
                                      chipCls
                                    )}
                                  >
                                    <span className="opacity-70 text-[9px] mr-0.5">
                                      {chip.inning}回
                                    </span>
                                    {chip.label}
                                    {chip.rbi > 0 ? `(${chip.rbi})` : ""}
                                  </span>
                                );
                              })}
                            </div>
                          )}

                          {/* 1試合打撃スタッツ行 */}
                          <div className="flex items-center justify-between pt-1.5 border-t border-border/60 text-[11px] tabular-nums">
                            <span className="font-bold text-foreground">
                              {g.ab}打数{" "}
                              <strong className="text-primary">{g.hits}安打</strong>
                              {g.rbi > 0 ? `・${g.rbi}打点` : ""}
                              {g.runs > 0 ? `・${g.runs}得点` : ""}
                              {g.sb > 0 ? `・${g.sb}盗塁` : ""}
                              {g.walks + g.hbp > 0
                                ? `・${g.walks + g.hbp}四死`
                                : ""}
                            </span>
                            <span className="text-[10px] font-bold text-muted-foreground">
                              累積打率 {g.cumAvg}
                            </span>
                          </div>

                          {/* 登板がある試合は投手ラインも併記 */}
                          {pLine && (
                            <div className="px-2.5 py-1.5 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-between text-[11px] tabular-nums">
                              <span className="font-black text-primary">
                                ⚾ 登板: {pLine.ip}回 奪三振{pLine.strikeouts} 自責
                                {pLine.earnedRuns}
                                {pLine.strikeRatePercent !== null
                                  ? ` (S率${pLine.strikeRatePercent}%)`
                                  : ""}
                              </span>
                              <span className="text-[10px] font-bold text-muted-foreground">
                                防御率 {pLine.cumEra}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              </>
            )}

            <div className="h-8 w-full shrink-0" aria-hidden="true" />
          </>
        )}
      </div>
    </div>
  );
}

export default function LiffPlayerGrowthPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col flex-1">
          <LiffHeader />
          <div className="p-8 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
            <p className="text-xs font-bold text-muted-foreground">
              個人成長レポートを読み込み中...
            </p>
          </div>
        </div>
      }
    >
      <PlayerGrowthContent />
    </Suspense>
  );
}

