// filepath: src/app/liff/players/growth/page.tsx
"use client";

import React, { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
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
  Camera,
  Edit3,
  Volume2,
  Users,
  Lock,
  HeartPulse,
} from "lucide-react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { LiffSelect } from "@/components/liff/LiffSelect";
import { useLiff, usePracticeMatchLabel } from "@/components/liff/LiffProvider";
import { invalidateLiffApiCache, peekLiffApiCache } from "@/lib/liff/api-cache";
import type { PlayerPhotoKind } from "@/components/liff/PlayerPhotoCaptureModal";
import {
  formatConditionPeriodRange,
  getTodayJstDateKey,
  normalizePlayerConditionStatus,
  PLAYER_CONDITION_META,
  loadDemoPlayerConditionOverrides,
  resolveEffectivePlayerConditionOnDate,
} from "@/lib/liff/player-condition";
import {
  EMPTY_PLAYER_PROFILE_DETAILS,
  parsePlayerProfileDetails,
  loadDemoPlayerProfileOverrides,
  saveDemoPlayerProfileOverride,
  type PlayerProfileDetails,
} from "@/lib/liff/player-profile-schema";

const PlayerPhotoCaptureModal = dynamic(
  () => import("@/components/liff/PlayerPhotoCaptureModal").then((m) => m.PlayerPhotoCaptureModal),
  { ssr: false }
);
import { EmptyState } from "@/components/layout/EmptyState";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  enrichSectionWithConditionPeriods,
  type GrowthFilterKey,
  type PlayerBattingTrendItem,
  type PlayerGrowthResponse,
  type PlayerPitchingTrendItem,
  type TeamMatchBriefForGrowth,
} from "@/lib/liff/player-positions-and-growth";

interface PositionLabelMeta {
  shortLabel: string;
  fullLabel: string;
  code: string;
  pillClass: string;
  barClass: string;
  ringClass: string;
  codeTextClass: string;
}

const POSITION_SHORT_LABELS: Record<
  string,
  { shortLabel: string; code: string; group: "P" | "C" | "IF" | "OF" | "DH" }
> = {
  P: { shortLabel: "投手", code: "P", group: "P" },
  "1": { shortLabel: "投手", code: "P", group: "P" },
  投手: { shortLabel: "投手", code: "P", group: "P" },
  C: { shortLabel: "捕手", code: "C", group: "C" },
  "2": { shortLabel: "捕手", code: "C", group: "C" },
  捕手: { shortLabel: "捕手", code: "C", group: "C" },
  "1B": { shortLabel: "一塁手", code: "1B", group: "IF" },
  "3": { shortLabel: "一塁手", code: "1B", group: "IF" },
  一塁手: { shortLabel: "一塁手", code: "1B", group: "IF" },
  "2B": { shortLabel: "二塁手", code: "2B", group: "IF" },
  "4": { shortLabel: "二塁手", code: "2B", group: "IF" },
  二塁手: { shortLabel: "二塁手", code: "2B", group: "IF" },
  "3B": { shortLabel: "三塁手", code: "3B", group: "IF" },
  "5": { shortLabel: "三塁手", code: "3B", group: "IF" },
  三塁手: { shortLabel: "三塁手", code: "3B", group: "IF" },
  SS: { shortLabel: "遊撃手", code: "SS", group: "IF" },
  "6": { shortLabel: "遊撃手", code: "SS", group: "IF" },
  遊撃手: { shortLabel: "遊撃手", code: "SS", group: "IF" },
  LF: { shortLabel: "左翼手", code: "LF", group: "OF" },
  "7": { shortLabel: "左翼手", code: "LF", group: "OF" },
  左翼手: { shortLabel: "左翼手", code: "LF", group: "OF" },
  CF: { shortLabel: "中堅手", code: "CF", group: "OF" },
  "8": { shortLabel: "中堅手", code: "CF", group: "OF" },
  中堅手: { shortLabel: "中堅手", code: "CF", group: "OF" },
  RF: { shortLabel: "右翼手", code: "RF", group: "OF" },
  "9": { shortLabel: "右翼手", code: "RF", group: "OF" },
  右翼手: { shortLabel: "右翼手", code: "RF", group: "OF" },
  DH: { shortLabel: "指名打者", code: "DH", group: "DH" },
  指名打者: { shortLabel: "指名打者", code: "DH", group: "DH" },
};

function getGroupStyle(group: "P" | "C" | "IF" | "OF" | "DH"): {
  pillClass: string;
  barClass: string;
  ringClass: string;
  codeTextClass: string;
} {
  switch (group) {
    case "P":
      return {
        pillClass:
          "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30",
        barClass: "bg-rose-500",
        ringClass: "ring-rose-500/25",
        codeTextClass: "text-rose-600/85 dark:text-rose-300/85",
      };
    case "C":
      return {
        pillClass:
          "bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30",
        barClass: "bg-sky-500",
        ringClass: "ring-sky-500/25",
        codeTextClass: "text-sky-600/85 dark:text-sky-300/85",
      };
    case "IF":
      return {
        pillClass:
          "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30",
        barClass: "bg-amber-500",
        ringClass: "ring-amber-500/25",
        codeTextClass: "text-amber-700/85 dark:text-amber-300/85",
      };
    case "OF":
      return {
        pillClass:
          "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30",
        barClass: "bg-emerald-500",
        ringClass: "ring-emerald-500/25",
        codeTextClass: "text-emerald-700/85 dark:text-emerald-300/85",
      };
    case "DH":
      return {
        pillClass:
          "bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30",
        barClass: "bg-purple-500",
        ringClass: "ring-purple-500/25",
        codeTextClass: "text-purple-700/85 dark:text-purple-300/85",
      };
  }
}

function getPosMeta(raw: string | null | undefined): PositionLabelMeta {
  if (!raw) {
    return {
      shortLabel: "未設定",
      fullLabel: "ポジション未設定",
      code: "-",
      pillClass: "bg-muted text-muted-foreground border border-border",
      barClass: "bg-muted-foreground/40",
      ringClass: "ring-border",
      codeTextClass: "text-muted-foreground",
    };
  }
  const clean = raw.trim();
  const key = clean.toUpperCase();
  const known = POSITION_SHORT_LABELS[clean] || POSITION_SHORT_LABELS[key];
  if (known) {
    const gs = getGroupStyle(known.group);
    return {
      shortLabel: known.shortLabel,
      fullLabel: `${known.shortLabel} (${known.code})`,
      code: known.code,
      ...gs,
    };
  }
  if (clean.includes("投")) {
    const gs = getGroupStyle("P");
    return { shortLabel: clean, fullLabel: clean, code: "P", ...gs };
  }
  if (clean.includes("捕")) {
    const gs = getGroupStyle("C");
    return { shortLabel: clean, fullLabel: clean, code: "C", ...gs };
  }
  if (clean.includes("一") || clean.includes("二") || clean.includes("三") || clean.includes("遊") || clean.includes("内")) {
    const gs = getGroupStyle("IF");
    return { shortLabel: clean, fullLabel: clean, code: "IF", ...gs };
  }
  if (clean.includes("左") || clean.includes("中") || clean.includes("右") || clean.includes("外")) {
    const gs = getGroupStyle("OF");
    return { shortLabel: clean, fullLabel: clean, code: "OF", ...gs };
  }
  return {
    shortLabel: clean,
    fullLabel: clean,
    code: key,
    pillClass: "bg-muted text-muted-foreground border border-border",
    barClass: "bg-muted-foreground/40",
    ringClass: "ring-border",
    codeTextClass: "text-muted-foreground",
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
    cls: "bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/30",
  },
  exchange: {
    label: "交流戦",
    cls: "bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/25",
  },
  practice: {
    label: "OP戦",
    cls: "bg-muted text-muted-foreground border-border",
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
      <div className="rounded-2xl bg-muted/35 border border-border p-2">
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
                {/* 復帰初戦の縦区切りガイドライン */}
                {item.isReturnMatch && idx > 0 && (
                  <g>
                    <line
                      x1={(getX(idx - 1) + cx) / 2}
                      y1={padT}
                      x2={(getX(idx - 1) + cx) / 2}
                      y2={padT + plotH}
                      stroke="currentColor"
                      className="text-emerald-600 dark:text-emerald-400"
                      strokeWidth={1.3}
                      strokeDasharray="3 2"
                    />
                    <rect
                      x={(getX(idx - 1) + cx) / 2 - 11}
                      y={padT - 1}
                      width={22}
                      height={11}
                      rx={3}
                      className="fill-emerald-600"
                    />
                    <text
                      x={(getX(idx - 1) + cx) / 2}
                      y={padT + 7}
                      textAnchor="middle"
                      className="text-[7.5px] font-black fill-white"
                    >
                      復帰
                    </text>
                  </g>
                )}

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

                {/* 打率メインドット（復帰初戦・一部制限中はアクセントリング表示） */}
                {item.isReturnMatch && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isSel ? 8.5 : 6.5}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    className="text-emerald-600"
                  />
                )}
                {!item.isReturnMatch && item.conditionDuringMatch === "restricted" && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isSel ? 8 : 6}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    className="text-amber-500"
                  />
                )}
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
        <div className="rounded-2xl bg-card border border-border border-l-4 border-l-primary p-3 shadow-2xs flex items-center justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
              <span className="font-black text-foreground tabular-nums">
                第{selectedIndex + 1}戦 ({formatShortDate(activeItem.date)})
              </span>
              <span className="font-black text-foreground truncate">
                vs {activeItem.opponent}
              </span>
              {activeItem.isReturnMatch && (
                <span className="px-1.5 py-0.2 rounded bg-emerald-600 text-white text-[9.5px] font-black">
                  ✨ 復帰戦
                </span>
              )}
              {activeItem.conditionDuringMatch === "restricted" && (
                <span className="px-1.5 py-0.2 rounded bg-amber-400 text-slate-950 text-[9.5px] font-black">
                  ⚠️ 一部制限中
                </span>
              )}
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
              className="px-2.5 py-1.5 rounded-xl bg-card hover:bg-muted border border-border text-[10px] font-black text-foreground shrink-0 flex items-center gap-0.5 shadow-2xs active:scale-95 transition-all"
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

      <div className="rounded-2xl bg-muted/35 border border-border p-2">
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
        <div className="rounded-2xl bg-card border border-border border-l-4 border-l-primary p-3 shadow-2xs flex items-center justify-between gap-2">
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
              className="px-2.5 py-1.5 rounded-xl bg-card hover:bg-muted border border-border text-[10px] font-black text-foreground shrink-0 flex items-center gap-0.5 shadow-2xs active:scale-95 transition-all"
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

function applyDemoGrowthOverrides(
  data: PlayerGrowthResponse | null
): PlayerGrowthResponse | null {
  if (!data?.success) return data;
  if (!data.isDemo && data.team?.id !== "demo-team") return data;

  const profileOverrides = loadDemoPlayerProfileOverrides();
  const condOverrides = loadDemoPlayerConditionOverrides();

  const nextRoster = data.roster?.map((rp) => {
    const po = profileOverrides[rp.id];
    const co = condOverrides[rp.id];
    return {
      ...rp,
      ...(po?.name ? { name: po.name } : {}),
      ...(po?.nameKana !== undefined ? { nameKana: po.nameKana } : {}),
      ...(po?.uniformNumber ? { uniformNumber: po.uniformNumber } : {}),
      ...(po?.profileImageUrl !== undefined
        ? { profileImageUrl: po.profileImageUrl }
        : {}),
      ...(po?.profileDetails?.actionImageUrl !== undefined
        ? { actionImageUrl: po.profileDetails.actionImageUrl }
        : {}),
      ...(typeof po?.isCaptain === "boolean" ? { isCaptain: po.isCaptain } : {}),
      conditionStatus: co
        ? co.conditionStatus
        : normalizePlayerConditionStatus(rp.conditionStatus),
    };
  });

  if (!data.player) {
    return { ...data, roster: nextRoster };
  }

  const p = data.player;
  const po = profileOverrides[p.id];
  const co = condOverrides[p.id];
  const mergedDetails: PlayerProfileDetails = po?.profileDetails
    ? parsePlayerProfileDetails({
        ...(p.profileDetails || EMPTY_PLAYER_PROFILE_DETAILS),
        ...po.profileDetails,
      })
    : p.profileDetails
    ? parsePlayerProfileDetails(p.profileDetails)
    : { ...EMPTY_PLAYER_PROFILE_DETAILS, playStyleTags: [] };

  const rawWeight =
    po?.weight !== undefined
      ? po.weight
      : po?.editableWeight !== undefined
      ? po.editableWeight
      : p.weight;

  const demoPeriods = co ? co.conditionPeriods : p.conditionPeriods || [];
  const todayKey = getTodayJstDateKey();
  const demoEffToday = resolveEffectivePlayerConditionOnDate({
    conditionPeriods: demoPeriods,
    fallbackStatus: co ? co.conditionStatus : p.conditionStatus,
    fallbackNote: co ? co.conditionNote : p.conditionNote,
    dateKey: todayKey,
    todayKey,
  });

  let nextSections = data.sectionsByFilter;
  if (nextSections && demoPeriods.length > 0) {
    const inferredMatches: TeamMatchBriefForGrowth[] = (
      nextSections.all?.battingTrend || []
    ).map((bt) => ({
      id: bt.matchId,
      date: bt.date,
      opponent: bt.opponent,
      matchType: bt.matchType,
    }));
    const filterKeys: GrowthFilterKey[] = ["all", "official", "exchange", "practice"];
    const computed = {} as Record<GrowthFilterKey, typeof nextSections.all>;
    for (const fk of filterKeys) {
      const fMatches =
        fk === "all"
          ? inferredMatches
          : inferredMatches.filter((m) => m.matchType === fk);
      computed[fk] = enrichSectionWithConditionPeriods(nextSections[fk], {
        conditionPeriods: demoPeriods,
        teamMatches: fMatches,
        todayKey,
      });
    }
    nextSections = computed;
  }

  return {
    ...data,
    roster: nextRoster,
    sectionsByFilter: nextSections,
    player: {
      ...p,
      ...(po?.name ? { name: po.name } : {}),
      ...(po?.nameKana !== undefined ? { nameKana: po.nameKana } : {}),
      ...(po?.uniformNumber ? { uniformNumber: po.uniformNumber } : {}),
      ...(po?.nickname !== undefined ? { nickname: po.nickname } : {}),
      ...(po?.throws !== undefined ? { throws: po.throws } : {}),
      ...(po?.bats !== undefined ? { bats: po.bats } : {}),
      ...(po?.height !== undefined ? { height: po.height } : {}),
      weight: mergedDetails.hideWeight ? null : rawWeight,
      ...(po?.profileImageUrl !== undefined
        ? { profileImageUrl: po.profileImageUrl }
        : {}),
      ...(po?.notes !== undefined ? { notes: po.notes } : {}),
      ...(typeof po?.isCaptain === "boolean" ? { isCaptain: po.isCaptain } : {}),
      conditionStatus: demoEffToday.status,
      conditionNote: demoEffToday.note ?? (co ? co.conditionNote : p.conditionNote),
      conditionPeriods: demoPeriods,
      activeConditionPeriod: demoEffToday.period,
      profileDetails: mergedDetails,
      canEditProfile: true,
      canManagePlayers: true,
    },
  };
}

function PlayerGrowthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentTeam, profile, isDemo: providerDemo } = useLiff();
  const practiceMatchLabel = usePracticeMatchLabel();
  const matchTypeBadges = useMemo(
    () => ({
      ...MATCH_TYPE_BADGES,
      practice: {
        ...MATCH_TYPE_BADGES.practice,
        label: practiceMatchLabel,
      },
    }),
    [practiceMatchLabel]
  );

  const queryPlayerId = searchParams.get("id");

  const initialCachedGrowth = useMemo(() => {
    if (typeof window === "undefined") return null;
    const tid =
      currentTeam?.id || localStorage.getItem("iscore_selectedTeamId") || "demo-team";
    const pidParam = queryPlayerId
      ? `&playerId=${encodeURIComponent(queryPlayerId)}`
      : "";
    return applyDemoGrowthOverrides(
      peekLiffApiCache<PlayerGrowthResponse>(
        `/api/liff/players/growth?teamId=${encodeURIComponent(tid)}${pidParam}`
      )
    );
  }, [currentTeam?.id, queryPlayerId]);

  const [isLoading, setIsLoading] = useState<boolean>(() => !initialCachedGrowth);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [growthData, setGrowthData] = useState<PlayerGrowthResponse | null>(
    () => initialCachedGrowth
  );

  const [filter, setFilter] = useState<GrowthFilterKey>("all");
  const [logSortOrder, setLogSortOrder] = useState<"desc" | "asc">("desc");
  const [selectedBatGameIdx, setSelectedBatGameIdx] = useState<number>(0);
  const [selectedPitchGameIdx, setSelectedPitchGameIdx] = useState<number>(0);
  const [photoModalKind, setPhotoModalKind] = useState<PlayerPhotoKind | null>(null);

  const activeTeamId =
    growthData?.team?.id ||
    currentTeam?.id ||
    (typeof window !== "undefined"
      ? localStorage.getItem("iscore_selectedTeamId")
      : "") ||
    "demo-team";

  const effectiveUserId =
    profile?.userId ||
    (typeof window !== "undefined"
      ? localStorage.getItem("iscore_user_id") ||
        localStorage.getItem("iscore_userId") ||
        ""
      : "");
  const effectiveUserName =
    profile?.displayName ||
    (typeof window !== "undefined"
      ? localStorage.getItem("iscore_user_name") || ""
      : "");

  // チーム切替時に写真撮影モーダルを自動リセット（規約5遵守）
  useEffect(() => {
    setPhotoModalKind(null);
  }, [currentTeam?.id]);

  const handlePhotoUpdated = useCallback(
    (
      targetPlayerId: string,
      newImageUrl: string | null,
      kind: PlayerPhotoKind = "portrait"
    ) => {
      const isDemoFlag = Boolean(
        growthData?.isDemo || providerDemo || activeTeamId === "demo-team"
      );

      setGrowthData((prev) => {
        if (!prev) return prev;

        if (kind === "action") {
          const nextRoster = prev.roster?.map((r) =>
            r.id === targetPlayerId ? { ...r, actionImageUrl: newImageUrl } : r
          );
          const nextPlayer =
            prev.player && prev.player.id === targetPlayerId
              ? (() => {
                  const nextDetails: PlayerProfileDetails = {
                    ...(prev.player.profileDetails ||
                      EMPTY_PLAYER_PROFILE_DETAILS),
                    actionImageUrl: newImageUrl,
                  };
                  if (isDemoFlag) {
                    saveDemoPlayerProfileOverride(targetPlayerId, {
                      profileImageUrl: prev.player.profileImageUrl,
                      profileDetails: nextDetails,
                    });
                  }
                  return {
                    ...prev.player,
                    profileDetails: nextDetails,
                  };
                })()
              : prev.player;

          if (isDemoFlag && (!prev.player || prev.player.id !== targetPlayerId)) {
            const existingOverrides = loadDemoPlayerProfileOverrides();
            const existingDetails =
              existingOverrides[targetPlayerId]?.profileDetails ||
              EMPTY_PLAYER_PROFILE_DETAILS;
            saveDemoPlayerProfileOverride(targetPlayerId, {
              profileDetails: {
                ...existingDetails,
                actionImageUrl: newImageUrl,
              },
            });
          }

          return {
            ...prev,
            roster: nextRoster,
            player: nextPlayer,
          };
        }

        const nextRoster = prev.roster?.map((r) =>
          r.id === targetPlayerId ? { ...r, profileImageUrl: newImageUrl } : r
        );
        const nextPlayer =
          prev.player && prev.player.id === targetPlayerId
            ? (() => {
                if (isDemoFlag) {
                  saveDemoPlayerProfileOverride(targetPlayerId, {
                    profileImageUrl: newImageUrl,
                    profileDetails: prev.player.profileDetails,
                  });
                }
                return {
                  ...prev.player,
                  profileImageUrl: newImageUrl,
                };
              })()
            : prev.player;

        if (isDemoFlag && (!prev.player || prev.player.id !== targetPlayerId)) {
          saveDemoPlayerProfileOverride(targetPlayerId, {
            profileImageUrl: newImageUrl,
          });
        }

        return {
          ...prev,
          roster: nextRoster,
          player: nextPlayer,
        };
      });

      invalidateLiffApiCache("/api/liff/players");
    },
    [activeTeamId, growthData?.isDemo, providerDemo]
  );

  const loadGrowth = useCallback(async () => {
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
      const url = `/api/liff/players/growth?teamId=${encodeURIComponent(tid)}${pidParam}`;
      const cached = peekLiffApiCache<PlayerGrowthResponse>(url);
      if (cached?.success) {
        setGrowthData(applyDemoGrowthOverrides(cached));
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }
      const needsFreshProfileFields = Boolean(
        cached?.success && cached.player && cached.player.profileDetails === undefined
      );
      const res = await fetch(
        url,
        needsFreshProfileFields ? { cache: "no-store" } : undefined
      );
      const json = (await res.json()) as PlayerGrowthResponse;
      if (!res.ok || !json.success) {
        setErrorMsg(json.error || "成長データの取得に失敗しました");
        setGrowthData(null);
      } else {
        setGrowthData(applyDemoGrowthOverrides(json));
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
            <span className="w-8 h-8 rounded-xl bg-primary/12 text-primary flex items-center justify-center font-black">
              <TrendingUp className="w-4.5 h-4.5" />
            </span>
          }
          showBack
          rightElement={
            <Link
              href="/liff/players"
              className="px-2.5 py-1.5 rounded-xl bg-card border border-border hover:bg-muted text-[11px] font-black text-foreground flex items-center gap-1 active:scale-95 transition-all shadow-2xs"
            >
              <IdCard className="w-3.5 h-3.5 text-primary" />
              <span>選手名鑑</span>
            </Link>
          }
          shareData={sharePayload}
        />

        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-12 flex flex-col items-center justify-center gap-2.5 shadow-xs">
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
            {/* ━━━ 🏟️ 選手ヒーローヘッダー（案B：選手詳細モーダル統一 境界オーバーラップ型 × 薄めソリッドスクリム） ━━━ */}
            {(() => {
              const mainMeta = getPosMeta(player.primaryPosition);
              const numStr = cleanUniform(player.uniformNumber);
              const initial = player.name.replace(/\s+/g, "").slice(0, 1) || "選";
              const subLabels = player.subPositions.map(
                (sp) => getPosMeta(sp).shortLabel
              );
              const details = player.profileDetails
                ? parsePlayerProfileDetails(player.profileDetails)
                : { ...EMPTY_PLAYER_PROFILE_DETAILS, playStyleTags: [] };
              const condStatus = normalizePlayerConditionStatus(
                player.conditionStatus
              );
              const condMeta = PLAYER_CONDITION_META[condStatus];
              const isOnLeave = condStatus === "on_leave";
              const isDemoFlag = Boolean(
                growthData.isDemo || providerDemo || activeTeamId === "demo-team"
              );
              const canEditThisPlayer = Boolean(
                player.canEditProfile || isDemoFlag
              );

              return (
                <section className="relative overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-xs">
                  {/* 上部ワイドステージ（選手詳細モーダルと統一：プレー写真を邪魔しないよう上角ピルのみ配置） */}
                  <div
                    className={cn(
                      "relative h-36 sm:h-44 w-full p-3.5 bg-[#0f172a] text-slate-50 border-b-[3px] overflow-hidden",
                      condStatus === "on_leave"
                        ? "border-slate-400"
                        : condStatus === "rehab"
                        ? "border-rose-500"
                        : condStatus === "restricted"
                        ? "border-amber-500"
                        : "border-primary"
                    )}
                  >
                    {details.actionImageUrl ? (
                      <>
                        <img
                          src={details.actionImageUrl}
                          alt=""
                          decoding="async"
                          className={cn(
                            "pointer-events-none select-none absolute inset-0 w-full h-full object-cover object-center",
                            isOnLeave && "grayscale-[45%] opacity-75"
                          )}
                        />
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-0 bg-slate-950/20"
                        />
                      </>
                    ) : (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none select-none absolute right-2.5 -bottom-4 text-[104px] font-black tracking-tighter leading-none text-slate-800 tabular-nums"
                      >
                        {numStr}
                      </span>
                    )}

                    {/* 最上段のみ：左に前後切替ピル、右に選手検索セレクターピル */}
                    {roster.length > 1 && (
                      <div className="relative z-10 flex items-center justify-between gap-2">
                        <div className="inline-flex items-center rounded-full bg-[#0f172a] border border-slate-700 p-0.5 shadow-2xs">
                          <button
                            type="button"
                            disabled={!prevRosterPlayer}
                            onClick={() =>
                              prevRosterPlayer &&
                              handleSwitchPlayer(prevRosterPlayer.id)
                            }
                            className="w-7 h-7 rounded-full flex items-center justify-center text-slate-100 disabled:opacity-30 hover:bg-slate-800 active:scale-90 transition-all cursor-pointer"
                            aria-label="前の選手へ切替"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="px-2 text-[11px] font-black tabular-nums text-white">
                            {(currentRosterIdx >= 0 ? currentRosterIdx : 0) + 1}/
                            {roster.length}
                          </span>
                          <button
                            type="button"
                            disabled={!nextRosterPlayer}
                            onClick={() =>
                              nextRosterPlayer &&
                              handleSwitchPlayer(nextRosterPlayer.id)
                            }
                            className="w-7 h-7 rounded-full flex items-center justify-center text-slate-100 disabled:opacity-30 hover:bg-slate-800 active:scale-90 transition-all cursor-pointer"
                            aria-label="次の選手へ切替"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>

                        <LiffSelect
                          value={player.id}
                          onChange={(val) => handleSwitchPlayer(val)}
                          options={roster.map((rp) => {
                            const pMeta = getPosMeta(rp.primaryPosition);
                            const rCond = normalizePlayerConditionStatus(
                              rp.conditionStatus
                            );
                            return {
                              value: rp.id,
                              label: `#${cleanUniform(rp.uniformNumber)} ${rp.name}`,
                              sublabel:
                                rCond !== "active"
                                  ? PLAYER_CONDITION_META[rCond].compactBadgeText
                                  : undefined,
                              badge: pMeta.shortLabel,
                              badgeTone: "primary" as const,
                              keywords: `${rp.uniformNumber || ""} ${rp.name} ${
                                rp.nameKana || ""
                              } ${pMeta.shortLabel}`,
                            };
                          })}
                          title="表示する選手を選択"
                          ariaLabel="表示する選手を選択"
                          variant="dark"
                          size="xs"
                          searchable={true}
                          searchPlaceholder="選手名・背番号・守備位置で検索..."
                          displayValueOverride="選手切替"
                          triggerPrefix={
                            <Users className="w-3.5 h-3.5 text-slate-300" />
                          }
                          className="rounded-full bg-[#0f172a] hover:bg-slate-800 border-slate-700 px-3 h-[34px] shadow-2xs shrink-0"
                        />
                      </div>
                    )}
                  </div>

                  {/* 下部純白アイデンティティ帯（丸枠正面写真 境界オーバーラップ ＋ 操作ボタン ＋ 選手名・属性） */}
                  <div className="px-4 pb-3.5 pt-1.5 bg-card space-y-2.5">
                    <div className="relative z-20 flex items-end justify-between gap-2 -mt-10">
                      {canEditThisPlayer ? (
                        <button
                          type="button"
                          onClick={() => setPhotoModalKind("portrait")}
                          className="relative group/avatar shrink-0 cursor-pointer active:scale-95 transition-transform focus:outline-hidden"
                          title="正面写真を撮影・変更"
                        >
                          <Avatar
                            className={cn(
                              "h-20 w-20 border-4 border-card bg-card shadow-sm ring-2",
                              isOnLeave
                                ? "ring-slate-400/40 grayscale-[35%]"
                                : mainMeta.ringClass
                            )}
                          >
                            {player.profileImageUrl && (
                              <AvatarImage
                                src={player.profileImageUrl}
                                alt={player.name}
                                className="object-cover"
                              />
                            )}
                            <AvatarFallback
                              className={cn(
                                "font-black text-2xl",
                                isOnLeave
                                  ? "bg-slate-500 text-white"
                                  : "bg-primary text-primary-foreground"
                              )}
                            >
                              {initial}
                            </AvatarFallback>
                          </Avatar>
                          <span className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full bg-primary text-primary-foreground border-2 border-card flex items-center justify-center shadow-xs group-hover/avatar:scale-110 transition-transform">
                            <Camera className="w-3.5 h-3.5" />
                          </span>
                        </button>
                      ) : (
                        <div className="relative shrink-0">
                          <Avatar
                            className={cn(
                              "h-20 w-20 border-4 border-card bg-card shadow-sm ring-2",
                              isOnLeave
                                ? "ring-slate-400/40 grayscale-[35%]"
                                : mainMeta.ringClass
                            )}
                          >
                            {player.profileImageUrl && (
                              <AvatarImage
                                src={player.profileImageUrl}
                                alt={player.name}
                                className="object-cover"
                              />
                            )}
                            <AvatarFallback
                              className={cn(
                                "font-black text-2xl",
                                isOnLeave
                                  ? "bg-slate-500 text-white"
                                  : "bg-primary text-primary-foreground"
                              )}
                            >
                              {initial}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                      )}

                      {canEditThisPlayer ? (
                        <div className="flex items-center gap-1 flex-wrap justify-end pb-0.5">
                          <button
                            type="button"
                            onClick={() => setPhotoModalKind("portrait")}
                            className="px-2 py-1 rounded-xl bg-muted hover:bg-muted/80 border border-border text-[10.5px] font-black text-foreground flex items-center gap-1 shrink-0 active:scale-95 transition-all cursor-pointer"
                          >
                            <Camera className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                            <span>正面</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setPhotoModalKind("action")}
                            className="px-2 py-1 rounded-xl bg-muted hover:bg-muted/80 border border-border text-[10.5px] font-black text-foreground flex items-center gap-1 shrink-0 active:scale-95 transition-all cursor-pointer"
                          >
                            <Sparkles className="w-3 h-3 text-amber-500" />
                            <span>
                              {details.actionImageUrl ? "背景変更" : "背景写真"}
                            </span>
                          </button>
                          <Link
                            href={`/liff/players?playerId=${encodeURIComponent(
                              player.id
                            )}&edit=1`}
                            className="px-2.5 py-1 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-[10.5px] font-black flex items-center gap-1 shrink-0 active:scale-95 transition-all shadow-2xs"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>名鑑編集</span>
                          </Link>
                        </div>
                      ) : (
                        <span
                          className={cn(
                            "text-[10.5px] font-black tracking-wider uppercase pb-1",
                            mainMeta.codeTextClass
                          )}
                        >
                          {mainMeta.fullLabel}
                        </span>
                      )}
                    </div>

                    {/* 純白カード上の整理された属性バッジ＆氏名（選手詳細モーダルと完全共通） */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded bg-primary text-primary-foreground text-xs font-black tabular-nums shadow-2xs">
                          #{numStr}
                        </span>
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-md text-[11px] font-black",
                            mainMeta.pillClass
                          )}
                        >
                          {mainMeta.shortLabel}
                        </span>
                        {details.gradeOrAge && (
                          <span className="px-2 py-0.5 rounded-md bg-muted border border-border text-foreground text-[10.5px] font-black">
                            {details.gradeOrAge}
                          </span>
                        )}
                        {player.isCaptain && (
                          <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-black flex items-center gap-1 shadow-2xs">
                            <Crown className="w-3 h-3 fill-current" />
                            <span>CAPTAIN</span>
                          </span>
                        )}
                        {condStatus !== "active" && (
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded text-[10.5px] font-black shadow-2xs",
                              condMeta.solidBadgeClass
                            )}
                          >
                            {condMeta.badgeText}
                          </span>
                        )}
                        {condStatus !== "active" && player.activeConditionPeriod && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted border border-border text-[10px] font-black text-foreground tabular-nums">
                            <Calendar className="w-3 h-3 text-primary shrink-0" />
                            <span>
                              {formatConditionPeriodRange(
                                player.activeConditionPeriod.startDate,
                                player.activeConditionPeriod.endDate
                              )}
                            </span>
                          </span>
                        )}
                        {isDemoFlag && (
                          <span className="px-2 py-0.5 rounded bg-muted border border-border text-muted-foreground text-[10px] font-black">
                            DEMO
                          </span>
                        )}
                      </div>

                      <div className="min-w-0">
                        <h2 className="text-xl font-black tracking-tight text-foreground leading-snug truncate">
                          {player.name}
                        </h2>
                        {(player.nameKana || player.nickname) && (
                          <div className="flex items-center gap-2 flex-wrap mt-0.5">
                            {player.nameKana && (
                              <p className="text-[10.5px] font-bold text-muted-foreground tracking-wider">
                                {player.nameKana}
                              </p>
                            )}
                            {player.nickname && (
                              <span className="px-2 py-0.5 rounded-md bg-amber-500/12 border border-amber-500/30 text-[10.5px] font-black text-amber-700 dark:text-amber-300 flex items-center gap-1">
                                <Volume2 className="w-3 h-3" />
                                <span>コール: {player.nickname}</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 投打・体格・実戦守備集計・サブ守備位置フッター */}
                    <div className="pt-2 border-t border-border space-y-2">
                      <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-muted-foreground flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>
                            {formatThrowsBats(player.throws, player.bats)}
                          </span>
                          {player.height && (
                            <span className="tabular-nums">
                              {player.height}cm
                              {player.weight ? ` / ${player.weight}kg` : ""}
                            </span>
                          )}
                        </div>
                        {player.positionSource === "match_data" && (
                          <span className="text-[10px] font-bold text-primary tabular-nums">
                            実戦 {player.totalPositionGames}試合集計
                          </span>
                        )}
                      </div>

                      {subLabels.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                          <span className="font-bold text-muted-foreground shrink-0">
                            サブ守備位置:
                          </span>
                          {subLabels.map((lbl, idx) => (
                            <span
                              key={`${lbl}-${idx}`}
                              className="px-2 py-0.5 rounded-md bg-muted/50 border border-border text-foreground font-black text-[10.5px]"
                            >
                              {lbl}
                            </span>
                          ))}
                        </div>
                      )}

                      {player.canManagePlayers && player.conditionNote && (
                        <div className="p-2.5 rounded-xl bg-muted/45 border border-border flex items-start gap-1.5 text-xs">
                          <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <span className="text-[10px] font-black text-muted-foreground block">
                              指導者・管理者限定メモ（一般保護者には非公開）
                            </span>
                            <span className="font-black text-foreground leading-snug">
                              {player.conditionNote}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              );
            })()}

            {/* ━━━ 試合種別フィルターチップ ━━━ */}
            <div className="grid grid-cols-4 gap-1.5">
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
                    label: `⚾ ${practiceMatchLabel}`,
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
                      "py-1.5 px-1 rounded-xl text-[11px] transition-all truncate tabular-nums",
                      active
                        ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                        : "bg-card text-muted-foreground border border-border hover:text-foreground hover:bg-muted/50 font-bold"
                    )}
                  >
                    {item.label} ({item.count})
                  </button>
                );
              })}
            </div>

            {/* ━━━ 🩹 コンディション・休養／復帰タイムライン（期間登録がある選手のみ表示） ━━━ */}
            {(activeSection.conditionTimeline?.length ?? 0) > 0 && (
              <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
                <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-rose-500 flex items-center justify-between gap-2">
                  <h3 className="text-xs font-black text-white flex items-center gap-1.5">
                    <HeartPulse className="w-4 h-4 text-rose-400" />
                    <span>コンディション・休養／復帰タイムライン</span>
                  </h3>
                  <span className="text-[10px] font-bold text-slate-300 tabular-nums">
                    全{activeSection.conditionTimeline?.length ?? 0}期間
                  </span>
                </div>

                <div className="p-4 space-y-3">
                  {/* 出場・休養コンテキスト集計バー */}
                  {activeSection.participationSummary && (
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 rounded-xl bg-muted/45 border border-border">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          出場 / 在籍対象
                        </span>
                        <span className="text-sm font-black text-foreground tabular-nums">
                          {activeSection.participationSummary.playedMatches}
                          <span className="text-[10px] font-bold text-muted-foreground">
                            {" "}
                            / {activeSection.participationSummary.eligibleTeamMatches}試合
                          </span>
                        </span>
                      </div>

                      <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/25">
                        <span className="text-[9.5px] font-bold text-rose-700 dark:text-rose-300 block">
                          故障・調整見送り
                        </span>
                        <span className="text-sm font-black text-rose-700 dark:text-rose-300 tabular-nums">
                          {activeSection.participationSummary.rehabMissedMatches}
                          <span className="text-[10px] font-bold"> 試合</span>
                        </span>
                      </div>

                      <div className="p-2 rounded-xl bg-slate-500/10 border border-slate-500/25">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          {activeSection.participationSummary.onLeaveMatches > 0
                            ? "休部期間中"
                            : "制限ケア出場"}
                        </span>
                        <span className="text-sm font-black text-foreground tabular-nums">
                          {activeSection.participationSummary.onLeaveMatches > 0
                            ? activeSection.participationSummary.onLeaveMatches
                            : activeSection.participationSummary.restrictedPlayedMatches}
                          <span className="text-[10px] font-bold text-muted-foreground">
                            {" "}
                            試合
                          </span>
                        </span>
                      </div>
                    </div>
                  )}

                  {/* 各期間カード */}
                  <div className="space-y-2">
                    {[...(activeSection.conditionTimeline || [])]
                      .reverse()
                      .map((tl) => {
                        const tlMeta = PLAYER_CONDITION_META[tl.status];
                        return (
                          <div
                            key={tl.id}
                            className="p-3 rounded-2xl bg-muted/30 border border-border space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className={cn(
                                    "px-2 py-0.5 rounded text-[10px] font-black",
                                    tlMeta.solidBadgeClass
                                  )}
                                >
                                  {tlMeta.badgeText}
                                </span>
                                <span className="text-xs font-black text-foreground tabular-nums">
                                  {formatConditionPeriodRange(tl.startDate, tl.endDate)}
                                </span>
                              </div>

                              <span
                                className={cn(
                                  "px-2 py-0.5 rounded-full text-[9.5px] font-black border tabular-nums",
                                  tl.isOngoing
                                    ? "bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/30"
                                    : tl.isFuture
                                    ? "bg-amber-500/12 text-amber-800 dark:text-amber-300 border-amber-500/30"
                                    : "bg-card text-muted-foreground border-border"
                                )}
                              >
                                {tl.isOngoing
                                  ? `継続中（${tl.days}日目）`
                                  : tl.isFuture
                                  ? "今後の予定"
                                  : `計${tl.days}日間`}
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-2 flex-wrap text-[11px]">
                              <span className="font-bold text-muted-foreground tabular-nums">
                                {tl.status === "restricted"
                                  ? `一部制限ケア中の出場: ${tl.playedMatchesDuringPeriod}試合`
                                  : tl.teamMatchesDuringPeriod > 0
                                  ? `期間中のチーム試合: ${tl.teamMatchesDuringPeriod}試合（休養見送り ${tl.missedMatchesDuringPeriod}試合）`
                                  : "期間中のチーム試合なし"}
                              </span>

                              {tl.returnMatch && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-black">
                                  <span>
                                    🔥 復帰戦: {formatShortDate(tl.returnMatch.date)} vs{" "}
                                    {tl.returnMatch.opponent}
                                  </span>
                                </span>
                              )}
                            </div>

                            {player?.canManagePlayers && tl.privateNote && (
                              <div className="px-2.5 py-1.5 rounded-xl bg-card border border-border flex items-center gap-1.5 text-[10.5px] font-bold text-foreground">
                                <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                                <span>{tl.privateNote}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              </section>
            )}

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
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-card border border-border text-foreground text-xs font-black shadow-xs active:scale-95 transition-all"
                  >
                    <span>試合情報を見る</span>
                  </Link>
                </div>
              </div>
            ) : (
              <>
                {/* ━━━ 🔥 Section 1: 成長ハイライト（直近フォーム vs 通算比較 & 記録バッジ） ━━━ */}
                {activeSection.battingSummary.pa > 0 && (
                  <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
                    <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary flex items-center justify-between gap-2 flex-wrap">
                      <h3 className="text-xs font-black text-white flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-amber-400" />
                        <span>
                          成長ハイライト（直近
                          {activeSection.recentForm.sampleGames}
                          試合の調子）
                        </span>
                      </h3>
                      <span className="text-[10px] font-bold text-slate-300">
                        通算成績との比較
                      </span>
                    </div>

                    <div className="p-4 space-y-3">
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
                      <div className="p-2.5 rounded-2xl bg-muted/35 border border-border space-y-1">
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
                      <div className="p-2.5 rounded-2xl bg-muted/35 border border-border space-y-1">
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
                      <div className="p-2.5 rounded-2xl bg-muted/35 border border-border space-y-1">
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
                    </div>
                  </section>
                )}

                {/* ━━━ 📈 Section 2: 打撃成績サマリー & 推移グラフ ━━━ */}
                {activeSection.battingSummary.games > 0 && (
                  <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
                    <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary flex items-center justify-between gap-2">
                      <h3 className="text-xs font-black text-white flex items-center gap-1.5">
                        <Flame className="w-4 h-4 text-amber-400" />
                        <span>打撃成長チャート & 通算指標</span>
                      </h3>
                      <span className="text-[10px] font-bold text-slate-300 tabular-nums">
                        {activeSection.battingSummary.games}試合・
                        {activeSection.battingSummary.pa}打席
                      </span>
                    </div>

                    <div className="p-4 space-y-4">
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
                      <div className="p-2 rounded-2xl bg-muted/50 border border-border">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          出塁率
                        </span>
                        <span className="text-sm sm:text-base font-black text-primary tabular-nums">
                          {activeSection.battingSummary.obp}
                        </span>
                      </div>
                      <div className="p-2 rounded-2xl bg-muted/50 border border-border">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          OPS
                        </span>
                        <span className="text-sm sm:text-base font-black text-foreground tabular-nums">
                          {activeSection.battingSummary.ops}
                        </span>
                      </div>
                      <div className="p-2 rounded-2xl bg-muted/50 border border-border">
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

                      <div className="p-2 rounded-2xl bg-muted/50 border border-border">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          打点 / 得点
                        </span>
                        <span className="text-xs font-black text-foreground tabular-nums">
                          {activeSection.battingSummary.rbi} /{" "}
                          {activeSection.battingSummary.runs}
                        </span>
                      </div>
                      <div className="p-2 rounded-2xl bg-muted/50 border border-border">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          盗塁
                        </span>
                        <span className="text-xs font-black text-primary tabular-nums">
                          {activeSection.battingSummary.sb}
                        </span>
                      </div>
                      <div className="p-2 rounded-2xl bg-muted/50 border border-border">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          四死球率
                        </span>
                        <span className="text-xs font-black text-foreground tabular-nums">
                          {activeSection.battingSummary.bbRatePercent}%
                        </span>
                      </div>
                      <div className="p-2 rounded-2xl bg-muted/50 border border-border">
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
                      <div className="pt-2 border-t border-border space-y-2">
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
                          {activeSection.monthlyBatting.map((m) => {
                            const mConds = m.conditionStatuses || [];
                            const isZeroGameRestMonth = m.games === 0 && mConds.length > 0;
                            return (
                              <div
                                key={m.month}
                                className={cn(
                                  "px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-xs",
                                  isZeroGameRestMonth
                                    ? "bg-slate-100/80 dark:bg-slate-900/60 border-border"
                                    : "bg-muted/35 border-border"
                                )}
                              >
                                <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                                  <span className="font-black text-foreground">
                                    {m.monthLabel}
                                  </span>
                                  {!isZeroGameRestMonth && (
                                    <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
                                      ({m.games}試合 {m.ab}打数{m.hits}安打)
                                    </span>
                                  )}
                                  {mConds.map((cs) => (
                                    <span
                                      key={`${m.month}-${cs}`}
                                      className={cn(
                                        "px-1.5 py-0.2 rounded text-[9.5px] font-black",
                                        PLAYER_CONDITION_META[cs].softBadgeClass
                                      )}
                                    >
                                      {PLAYER_CONDITION_META[cs].compactBadgeText}
                                    </span>
                                  ))}
                                </div>

                                {isZeroGameRestMonth ? (
                                  <span className="text-[10.5px] font-black text-muted-foreground shrink-0">
                                    {mConds.includes("on_leave")
                                      ? "休部期間（出場なし）"
                                      : "調整・休養期間（出場なし）"}
                                  </span>
                                ) : (
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
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    </div>
                  </section>
                )}

                {/* ━━━ 🎯 Section 3: 打球方向バランス（広角打法チェック） ━━━ */}
                {activeSection.battedDirection.total > 0 && (
                  <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
                    <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary flex items-center justify-between gap-2">
                      <h3 className="text-xs font-black text-white flex items-center gap-1.5">
                        <Target className="w-4 h-4 text-sky-400" />
                        <span>打球方向バランス（左・中・右）</span>
                      </h3>
                      <span className="text-[10px] font-bold text-slate-300 tabular-nums">
                        集計 {activeSection.battedDirection.total}打球
                      </span>
                    </div>

                    <div className="p-4 space-y-3">
                    {/* 3方向比率プログレスバー */}
                    <div className="h-3.5 w-full rounded-xs overflow-hidden flex border border-border bg-muted">
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
                          className="h-full bg-teal-600"
                          style={{
                            width: `${activeSection.battedDirection.centerPercent}%`,
                          }}
                        />
                      )}
                      {activeSection.battedDirection.rightPercent > 0 && (
                        <div
                          className="h-full bg-amber-500"
                          style={{
                            width: `${activeSection.battedDirection.rightPercent}%`,
                          }}
                        />
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2.5 rounded-2xl bg-muted border border-border">
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

                      <div className="p-2.5 rounded-2xl bg-muted border border-border">
                        <span className="text-[10px] font-black text-teal-600 dark:text-teal-400 block">
                          センター方向
                        </span>
                        <span className="text-base font-black text-foreground tabular-nums block mt-0.5">
                          {activeSection.battedDirection.centerPercent}%
                        </span>
                        <span className="text-[9.5px] font-bold text-muted-foreground tabular-nums block">
                          {activeSection.battedDirection.center}打球 (投・中)
                        </span>
                      </div>

                      <div className="p-2.5 rounded-2xl bg-muted border border-border">
                        <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 block">
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
                    </div>
                  </section>
                )}

                {/* ━━━ ⚾ Section 4: 投手成長レポート（登板実績がある選手に自動表示） ━━━ */}
                {activeSection.pitchingSummary && (
                  <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
                    <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary flex items-center justify-between gap-2">
                      <h3 className="text-xs font-black text-white flex items-center gap-1.5">
                        <Activity className="w-4 h-4 text-sky-400" />
                        <span>投手成長レポート（制球力・防御率推移）</span>
                      </h3>
                      <span className="text-[10px] font-bold text-slate-300 tabular-nums">
                        {activeSection.pitchingSummary.games}登板・7回制換算
                      </span>
                    </div>

                    <div className="p-4 space-y-4">
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="p-2 rounded-2xl bg-primary/10 border border-primary/25">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          防御率
                        </span>
                        <span className="text-sm sm:text-base font-black text-primary tabular-nums">
                          {activeSection.pitchingSummary.era}
                        </span>
                      </div>
                      <div className="p-2 rounded-2xl bg-muted/50 border border-border">
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
                      <div className="p-2 rounded-2xl bg-muted/50 border border-border">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          投球回
                        </span>
                        <span className="text-sm sm:text-base font-black text-foreground tabular-nums">
                          {activeSection.pitchingSummary.ip}
                        </span>
                      </div>
                      <div className="p-2 rounded-2xl bg-muted/50 border border-border">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          WHIP
                        </span>
                        <span className="text-sm sm:text-base font-black text-foreground tabular-nums">
                          {activeSection.pitchingSummary.whip}
                        </span>
                      </div>

                      <div className="p-2 rounded-2xl bg-muted/50 border border-border">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          奪三振
                        </span>
                        <span className="text-xs font-black text-foreground tabular-nums">
                          {activeSection.pitchingSummary.strikeouts}
                        </span>
                      </div>
                      <div className="p-2 rounded-2xl bg-muted/50 border border-border">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          与四死球
                        </span>
                        <span className="text-xs font-black text-foreground tabular-nums">
                          {activeSection.pitchingSummary.walks +
                            activeSection.pitchingSummary.hbp}
                        </span>
                      </div>
                      <div className="p-2 rounded-2xl bg-muted/50 border border-border">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">
                          K/BB
                        </span>
                        <span className="text-xs font-black text-foreground tabular-nums">
                          {activeSection.pitchingSummary.kBbRatio}
                        </span>
                      </div>
                      <div className="p-2 rounded-2xl bg-muted/50 border border-border">
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
                    </div>
                  </section>
                )}

                {/* ━━━ 🧤 Section 5: 実戦守備位置（メイン＆サブ集計）＆ 打順経験マップ ━━━ */}
                {(player.positionCounts.length > 0 ||
                  player.battingOrderCounts.length > 0) && (
                  <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
                    <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary flex items-center justify-between gap-2">
                      <h3 className="text-xs font-black text-white flex items-center gap-1.5">
                        <Shield className="w-4 h-4 text-emerald-400" />
                        <span>守備位置・打順の実戦経験マップ</span>
                      </h3>
                      {player.totalPositionGames > 0 && (
                        <span className="text-[10px] font-bold text-slate-300 tabular-nums">
                          全{player.totalPositionGames}試合の守備記録
                        </span>
                      )}
                    </div>

                    <div className="p-4 space-y-4">
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
                                className="px-3 py-2 rounded-xl bg-muted/35 border border-border flex items-center justify-between gap-3 text-xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className={cn(
                                      "px-1.5 py-0.5 rounded-md text-[9.5px] font-black shrink-0",
                                      isMain
                                        ? meta.pillClass
                                        : "bg-muted text-muted-foreground border border-border"
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
                      <div className="pt-2 border-t border-border space-y-2">
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
                                  : "bg-muted/50 border-border text-foreground"
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
                    </div>
                  </section>
                )}

                {/* ━━━ 📋 Section 6: 試合別 成長ログ（全打席チップ ＆ 投手成績） ━━━ */}
                <section className="space-y-2.5">
                  <div className="flex items-center justify-between px-1 gap-2">
                    <h3 className="text-xs font-black text-foreground">
                      試合別 個人成績ログ（{orderedGameLogs.length}試合）
                    </h3>
                    <div className="inline-flex items-center gap-1 bg-muted p-1 rounded-2xl border border-border">
                      <button
                        type="button"
                        onClick={() => setLogSortOrder("desc")}
                        className={cn(
                          "px-2.5 py-1 rounded-xl text-[10px] transition-all",
                          logSortOrder === "desc"
                            ? "bg-card text-foreground shadow-sm border border-border font-black"
                            : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                        )}
                      >
                        <span className={cn(logSortOrder === "desc" && "text-primary")}>
                          新しい順
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setLogSortOrder("asc")}
                        className={cn(
                          "px-2.5 py-1 rounded-xl text-[10px] transition-all",
                          logSortOrder === "asc"
                            ? "bg-card text-foreground shadow-sm border border-border font-black"
                            : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                        )}
                      >
                        <span className={cn(logSortOrder === "asc" && "text-primary")}>
                          古い順
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {orderedGameLogs.map((g) => {
                      const typeBadge = matchTypeBadges[g.matchType];
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
                          className="rounded-2xl border border-border bg-card p-3.5 shadow-xs space-y-2.5"
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
                                  <span className="px-1.5 py-0.2 rounded bg-muted/50 border border-border text-[9.5px] font-black text-foreground">
                                    {roleLabel}
                                  </span>
                                )}
                                {g.isReturnMatch && (
                                  <span className="px-1.5 py-0.2 rounded bg-emerald-600 text-white text-[9.5px] font-black">
                                    ✨ 復帰戦
                                  </span>
                                )}
                                {g.conditionDuringMatch === "restricted" && (
                                  <span className="px-1.5 py-0.2 rounded bg-amber-400 text-slate-950 text-[9.5px] font-black">
                                    ⚠️ 一部制限中
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
                                  className="p-1.5 rounded-lg bg-muted/50 hover:bg-muted border border-border text-foreground transition-colors"
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
                                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/35"
                                    : chip.kind === "hit"
                                    ? "bg-primary/12 text-primary border-primary/30"
                                    : chip.kind === "walk" || chip.kind === "sac"
                                    ? "bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/25"
                                    : "bg-muted/50 text-muted-foreground border-border";

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
                          <div className="flex items-center justify-between pt-1.5 border-t border-border text-[11px] tabular-nums">
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

            <div
              className="h-8 w-full shrink-0 pointer-events-none select-none"
              aria-hidden="true"
            />
          </>
        )}
      </div>

      {player && photoModalKind && (
        <PlayerPhotoCaptureModal
          isOpen={Boolean(photoModalKind)}
          teamId={activeTeamId}
          initialPlayerId={player.id}
          initialPhotoKind={photoModalKind}
          enableActionPhoto={true}
          userId={effectiveUserId || null}
          userName={effectiveUserName || null}
          rosterPlayers={
            roster.length > 0
              ? roster.map((rp) => ({
                  id: rp.id,
                  name: rp.name,
                  uniformNumber: rp.uniformNumber,
                  primaryPosition: rp.primaryPosition,
                  profileImageUrl: rp.profileImageUrl,
                  actionImageUrl:
                    rp.id === player.id
                      ? player.profileDetails?.actionImageUrl ??
                        rp.actionImageUrl ??
                        null
                      : rp.actionImageUrl ?? null,
                }))
              : [
                  {
                    id: player.id,
                    name: player.name,
                    uniformNumber: player.uniformNumber,
                    primaryPosition: player.primaryPosition,
                    profileImageUrl: player.profileImageUrl,
                    actionImageUrl:
                      player.profileDetails?.actionImageUrl ?? null,
                  },
                ]
          }
          onClose={() => setPhotoModalKind(null)}
          onPhotoUpdated={handlePhotoUpdated}
        />
      )}
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

