// filepath: src/components/liff/MatchStatsSection.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Award,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Flame,
  ScanLine,
  Target,
  Zap,
} from "lucide-react";
import { EmptyState } from "@/components/layout/EmptyState";
import { getPositionBadgeInfo } from "@/lib/liff/demo-lineup";
import { cn } from "@/lib/utils";

export interface LiffBatterStatItem {
  id: string;
  name: string;
  number: string;
  battingOrder?: number;
  position?: string;
  isSub?: boolean;
  plateAppearances: number;
  atBats: number;
  singles?: number;
  doubles?: number;
  triples?: number;
  homeRuns?: number;
  hits: number;
  walks: number;
  hitByPitch?: number;
  runs: number;
  rbi: number;
  stolenBases?: number;
  caughtStealing?: number;
  strikeouts: number;
  sacBunts?: number;
  sacFlies?: number;
  leftOnBase?: number;
  errors?: number;
  doublePlays?: number;
  assists?: number;
  putouts?: number;
  avg: string;
}

export interface LiffPitcherStatItem {
  id: string;
  name: string;
  number: string;
  outs: number;
  ip: string;
  pitches: number;
  battersFaced: number;
  hits: number;
  homeRuns: number;
  sacBunts: number;
  sacFlies: number;
  strikeouts: number;
  walks: number;
  hitByPitch: number;
  wildPitches: number;
  balks: number;
  runs: number;
  earnedRuns: number;
  era: string;
}

export interface LiffMatchGameDetails {
  double: string[];
  triple: string[];
  homeRun: string[];
  sacrificeBunt: string[];
  sacrificeFly: string[];
  stolenBase: string[];
  doublePlay: string[];
}

export interface LiffRawPlayLogItem {
  id: string;
  description: string;
  resultType?: string;
  inning: number;
  isTop: boolean;
  timestamp: number;
  validationMessage?: string | null;
}

export interface LiffBoxscoreAtBatItem {
  id: string;
  inning: number;
  isTop: boolean;
  result: string | null;
  batterId: string | null;
  batterName: string;
  batterNumber: string;
  pitcherId: string | null;
  pitcherName: string;
}

interface HighlightHeroItem {
  type: "hit" | "rbi" | "pitch";
  label: string;
  value: string;
  description: string;
}

interface ParsedTimelineEntry {
  id: string;
  inning: number;
  isTop: boolean;
  orderLabel: string;
  batterName: string;
  pitcherName: string;
  mainResult: string;
  runnerNote: string;
  rbiTag: string;
  balls: number;
  strikes: number;
  outs: number;
  hasBso: boolean;
  pitchesList: string[];
  badgeTone: "hr" | "hit" | "walk" | "sac" | "score" | "out";
}

interface MatchStatsSectionProps {
  matchId: string;
  isMyTeamTop: boolean;
  myTeamName: string;
  opponentName: string;
  isFutureOrScheduled: boolean;
  isRainout: boolean;
  isDemoMatch: boolean;
  stats: LiffBatterStatItem[];
  pitcherStats: LiffPitcherStatItem[];
  gameDetails: LiffMatchGameDetails | null;
  playLogs: LiffRawPlayLogItem[];
  boxscoreAtBats: LiffBoxscoreAtBatItem[];
  isLoadingStats: boolean;
}

const CANONICAL_RESULT_JA: Record<string, string> = {
  single: "安打",
  "1B": "安打",
  double: "二塁打",
  "2B": "二塁打",
  triple: "三塁打",
  "3B": "三塁打",
  home_run: "本塁打",
  HR: "本塁打",
  walk: "四球",
  intentional_walk: "敬遠四球",
  hit_by_pitch: "死球",
  sac_bunt: "犠打",
  sac_fly: "犠飛",
  strikeout: "三振",
  dropped_third_strike: "振逃",
  dropped_third_strike_out: "三振",
  groundout: "ゴロ",
  flyout: "フライ",
  lineout: "ライナー",
  infield_fly: "インフィールドフライ",
  double_play: "併殺打",
  triple_play: "三重殺",
  fc: "野選",
  error: "敵失",
  interference: "打撃妨害",
  interference_out: "守備妨害",
  runner_out: "走塁死",
};

/**
 * Web版（matches/result/page.tsx）と完全同一の注目選手（本日のヒーロー）自動抽出ロジック
 */
function extractHighlightHeroes(
  stats: LiffBatterStatItem[],
  pitcherStats: LiffPitcherStatItem[]
): HighlightHeroItem[] {
  const highlights: HighlightHeroItem[] = [];

  const multiHits = stats.filter((p) => (Number(p.hits) || 0) >= 3);
  multiHits.forEach((p) => {
    highlights.push({
      type: "hit",
      label: "猛打賞 🔥",
      value: `${p.name}${p.number && p.number !== "-" ? ` (#${p.number})` : ""}`,
      description: `勝負強い打撃で ${p.hits}安打の大暴れ！`,
    });
  });

  if (multiHits.length === 0) {
    const doubleHits = stats.filter((p) => (Number(p.hits) || 0) === 2);
    doubleHits.slice(0, 2).forEach((p) => {
      highlights.push({
        type: "hit",
        label: "マルチ安打 ⚡",
        value: `${p.name}${p.number && p.number !== "-" ? ` (#${p.number})` : ""}`,
        description: "きっちり複数安打をマークし貢献！",
      });
    });
  }

  const maxRbi = Math.max(...stats.map((p) => Number(p.rbi) || 0), 0);
  if (maxRbi >= 2) {
    const rbiLeaders = stats.filter((p) => (Number(p.rbi) || 0) === maxRbi);
    rbiLeaders.slice(0, 2).forEach((p) => {
      highlights.push({
        type: "rbi",
        label: "勝負強さ A 🎯",
        value: `${p.name}${p.number && p.number !== "-" ? ` (#${p.number})` : ""}`,
        description: `チャンスで快打を放ち ${p.rbi}打点をマーク！`,
      });
    });
  }

  const maxSo = Math.max(...pitcherStats.map((p) => Number(p.strikeouts) || 0), 0);
  if (maxSo >= 3) {
    const soLeaders = pitcherStats.filter(
      (p) => (Number(p.strikeouts) || 0) === maxSo
    );
    soLeaders.forEach((p) => {
      highlights.push({
        type: "pitch",
        label: "ドクターK 🌪️",
        value: `${p.name}${p.number && p.number !== "-" ? ` (#${p.number})` : ""}`,
        description: `キレのある球で ${p.strikeouts}個の三振を奪う好投！`,
      });
    });
  }

  pitcherStats.forEach((p) => {
    const outs = Number(p.outs) || 0;
    const runs = Number(p.runs) || 0;
    if (outs >= 9 && runs <= 2) {
      highlights.push({
        type: "pitch",
        label: "ゲームメイク 🛡️",
        value: `${p.name}${p.number && p.number !== "-" ? ` (#${p.number})` : ""}`,
        description: `${p.ip}イニングを自責点 ${p.earnedRuns} に抑える安定感！`,
      });
    }
  });

  return highlights;
}

/**
 * Web版と同一の打撃・走塁詳細フォールバック抽出
 */
function buildFallbackGameDetails(
  boxscoreAtBats: LiffBoxscoreAtBatItem[],
  isMyTeamTop: boolean
): LiffMatchGameDetails {
  const details: LiffMatchGameDetails = {
    double: [],
    triple: [],
    homeRun: [],
    sacrificeBunt: [],
    sacrificeFly: [],
    stolenBase: [],
    doublePlay: [],
  };

  boxscoreAtBats.forEach((ab) => {
    if (ab.isTop !== isMyTeamTop || !ab.result) return;
    const res = ab.result;
    const name = ab.batterName || "不明";
    const inningText = `${ab.inning}回`;

    if (
      res === "double" ||
      res.includes("2B") ||
      res.includes("二塁打") ||
      res.includes("２塁打")
    ) {
      details.double.push(`${name} (${inningText})`);
    } else if (
      res === "triple" ||
      res.includes("3B") ||
      res.includes("三塁打") ||
      res.includes("３塁打")
    ) {
      details.triple.push(`${name} (${inningText})`);
    } else if (res === "home_run" || res.includes("HR") || res.includes("本塁打")) {
      details.homeRun.push(`${name} (${inningText})`);
    }

    if (
      res === "sac_bunt" ||
      res.includes("SH") ||
      res.includes("犠打") ||
      (res.includes("犠") && !res.includes("飛"))
    ) {
      details.sacrificeBunt.push(`${name} (${inningText})`);
    } else if (res === "sac_fly" || res.includes("SF") || res.includes("犠飛")) {
      details.sacrificeFly.push(`${name} (${inningText})`);
    }

    if (res.includes("盗塁") || res.includes("SB")) {
      details.stolenBase.push(`${name} (${inningText})`);
    }

    if (
      res === "double_play" ||
      res === "triple_play" ||
      res.includes("併殺") ||
      res.includes("三重殺") ||
      res.includes("DP") ||
      res.includes("TP")
    ) {
      details.doublePlay.push(`${name} (${inningText})`);
    }
  });

  return details;
}

function classifyResultTone(
  text: string,
  resultType?: string
): ParsedTimelineEntry["badgeTone"] {
  if (text.includes("本塁打") || text.includes("本") || text.includes("HR")) {
    return "hr";
  }
  if (
    resultType === "hit" ||
    text.includes("安") ||
    text.includes("二塁打") ||
    text.includes("三塁打") ||
    text.includes("二") ||
    text.includes("三") && !text.includes("三振") && !text.includes("三ゴ") && !text.includes("三飛") && !text.includes("三直") && !text.includes("三邪") && !text.includes("三重殺")
  ) {
    return "hit";
  }
  if (text.includes("四球") || text.includes("死球") || text.includes("敬遠")) {
    return "walk";
  }
  if (text.includes("犠打") || text.includes("犠飛")) {
    return "sac";
  }
  if (resultType === "score" || text.includes("打点") || text.includes("生還")) {
    return "score";
  }
  return "out";
}

function parseTimelineEntries(
  rawLogs: LiffRawPlayLogItem[],
  boxscoreAtBats: LiffBoxscoreAtBatItem[]
): ParsedTimelineEntry[] {
  if (rawLogs.length > 0) {
    const boxQueueByInnSide = new Map<string, LiffBoxscoreAtBatItem[]>();
    for (const b of boxscoreAtBats) {
      const k = `${b.inning}:${b.isTop ? 1 : 0}`;
      const list = boxQueueByInnSide.get(k) || [];
      list.push(b);
      boxQueueByInnSide.set(k, list);
    }
    const offsets = new Map<string, number>();

    return rawLogs.map((log) => {
      const sideKey = `${log.inning}:${log.isTop ? 1 : 0}`;
      const idx = offsets.get(sideKey) || 0;
      offsets.set(sideKey, idx + 1);
      const matchedBox = boxQueueByInnSide.get(sideKey)?.[idx];

      let working = (log.description || "").trim();
      let balls = 0;
      let strikes = 0;
      let outs = 0;
      let hasBso = false;

      const bsoMatch = working.match(/\s*\[B:(\d+),\s*S:(\d+),\s*O:(\d+)\]\s*$/);
      if (bsoMatch) {
        balls = Number(bsoMatch[1]) || 0;
        strikes = Number(bsoMatch[2]) || 0;
        outs = Number(bsoMatch[3]) || 0;
        hasBso = true;
        working = working.replace(/\s*\[B:\d+,\s*S:\d+,\s*O:\d+\]\s*$/, "").trim();
      }

      let pitchesList: string[] = [];
      if (working.includes("===PITCHES===")) {
        const parts = working.split("===PITCHES===");
        working = (parts[0] || "").trim();
        pitchesList = (parts[1] || "")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
      }

      let orderLabel = "";
      let batterName = matchedBox?.batterName || "打者";
      let bodyText = working;

      const headerMatch = working.match(/^(?:(\d+)番\s*)?([^:：]+)[：:]\s*([\s\S]*)$/);
      if (headerMatch) {
        orderLabel = headerMatch[1] || "";
        batterName = headerMatch[2].trim() || batterName;
        bodyText = headerMatch[3].trim();
      }

      let runnerNote = "";
      const runnerBracketMatch = bodyText.match(/［([^］]+)］/);
      if (runnerBracketMatch) {
        runnerNote = runnerBracketMatch[1].trim();
        bodyText = bodyText.replace(/\s*［[^］]+］/, "").trim();
      }

      let rbiTag = "";
      const rbiParenMatch = bodyText.match(/（((?:打点|得点)[^）]+)）/);
      if (rbiParenMatch) {
        rbiTag = rbiParenMatch[1].trim();
        bodyText = bodyText.replace(/\s*（(?:打点|得点)[^）]+）/, "").trim();
      }

      const mainResult = bodyText || "打席完了";

      return {
        id: log.id,
        inning: log.inning,
        isTop: log.isTop,
        orderLabel,
        batterName,
        pitcherName: matchedBox?.pitcherName || "",
        mainResult,
        runnerNote,
        rbiTag,
        balls,
        strikes,
        outs,
        hasBso,
        pitchesList,
        badgeTone: classifyResultTone(mainResult, log.resultType),
      };
    });
  }

  return boxscoreAtBats.map((ab) => {
    const rawRes = ab.result || "";
    const displayRes = CANONICAL_RESULT_JA[rawRes] || rawRes || "打席完了";
    return {
      id: ab.id,
      inning: ab.inning,
      isTop: ab.isTop,
      orderLabel: "",
      batterName: ab.batterName || "打者",
      pitcherName: ab.pitcherName || "",
      mainResult: displayRes,
      runnerNote: "",
      rbiTag: "",
      balls: 0,
      strikes: 0,
      outs: 0,
      hasBso: false,
      pitchesList: [],
      badgeTone: classifyResultTone(displayRes),
    };
  });
}

function getMiniPosBadge(pos: string | undefined) {
  if (!pos) return null;
  if (pos === "P") {
    return { label: "打", className: "bg-primary text-primary-foreground" };
  }
  if (pos === "R") {
    return { label: "走", className: "bg-primary text-primary-foreground" };
  }
  if (pos === "TR") {
    return { label: "臨", className: "bg-primary text-primary-foreground" };
  }
  const info = getPositionBadgeInfo(pos);
  if (info) {
    return { label: info.shortLabel, className: cn(info.color, "text-white") };
  }
  return null;
}

export function MatchStatsSection({
  matchId,
  isMyTeamTop,
  myTeamName,
  opponentName,
  isFutureOrScheduled,
  isRainout,
  isDemoMatch,
  stats,
  pitcherStats,
  gameDetails,
  playLogs,
  boxscoreAtBats,
  isLoadingStats,
}: MatchStatsSectionProps) {
  const [batterColumnMode, setBatterColumnMode] = useState<"full" | "compact">("full");
  const [selectedTimelineInning, setSelectedTimelineInning] = useState<number | "all">(
    "all"
  );
  const [onlyMyAttackLogs, setOnlyMyAttackLogs] = useState<boolean>(false);
  const [showAllTimeline, setShowAllTimeline] = useState<boolean>(false);
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>({});

  // SKILL.md 規約5: 試合切替（コンテキスト変化）時に内部の展開・フィルタ状態を自動リセット
  useEffect(() => {
    setSelectedTimelineInning("all");
    setOnlyMyAttackLogs(false);
    setShowAllTimeline(false);
    setExpandedLogIds({});
  }, [matchId]);

  const highlightHeroes = useMemo(
    () => extractHighlightHeroes(stats, pitcherStats),
    [stats, pitcherStats]
  );

  const resolvedGameDetails = useMemo(
    () => gameDetails || buildFallbackGameDetails(boxscoreAtBats, isMyTeamTop),
    [gameDetails, boxscoreAtBats, isMyTeamTop]
  );

  const hasGameDetails = useMemo(
    () => Object.values(resolvedGameDetails).some((arr) => arr.length > 0),
    [resolvedGameDetails]
  );

  // 打撃成績合計（Web版と同一の20項目＋安打＋チーム打率）
  const batterTotal = useMemo(
    () =>
      stats.reduce(
        (acc, cur) => {
          acc.plateAppearances += cur.plateAppearances || 0;
          acc.atBats += cur.atBats || 0;
          acc.hits += cur.hits || 0;
          acc.singles += cur.singles || 0;
          acc.doubles += cur.doubles || 0;
          acc.triples += cur.triples || 0;
          acc.homeRuns += cur.homeRuns || 0;
          acc.rbi += cur.rbi || 0;
          acc.runs += cur.runs || 0;
          acc.walks += cur.walks || 0;
          acc.hitByPitch += cur.hitByPitch || 0;
          acc.strikeouts += cur.strikeouts || 0;
          acc.sacBunts += cur.sacBunts || 0;
          acc.sacFlies += cur.sacFlies || 0;
          acc.stolenBases += cur.stolenBases || 0;
          acc.caughtStealing += cur.caughtStealing || 0;
          acc.leftOnBase += cur.leftOnBase || 0;
          acc.doublePlays += cur.doublePlays || 0;
          acc.errors += cur.errors || 0;
          acc.assists += cur.assists || 0;
          acc.putouts += cur.putouts || 0;
          return acc;
        },
        {
          plateAppearances: 0,
          atBats: 0,
          hits: 0,
          singles: 0,
          doubles: 0,
          triples: 0,
          homeRuns: 0,
          rbi: 0,
          runs: 0,
          walks: 0,
          hitByPitch: 0,
          strikeouts: 0,
          sacBunts: 0,
          sacFlies: 0,
          stolenBases: 0,
          caughtStealing: 0,
          leftOnBase: 0,
          doublePlays: 0,
          errors: 0,
          assists: 0,
          putouts: 0,
        }
      ),
    [stats]
  );

  const teamAvgStr = useMemo(() => {
    if (batterTotal.atBats === 0) return ".000";
    const val = batterTotal.hits / batterTotal.atBats;
    const raw = val.toFixed(3);
    if (raw.startsWith("0.")) return raw.slice(1);
    if (raw === "1.000") return "1.00";
    return raw;
  }, [batterTotal.atBats, batterTotal.hits]);

  // 投手成績合計（Web版と同一の全項目＋チーム投球回＋チーム防御率）
  const pitcherTotal = useMemo(
    () =>
      pitcherStats.reduce(
        (acc, cur) => {
          acc.outs += cur.outs || 0;
          acc.pitches += cur.pitches || 0;
          acc.battersFaced += cur.battersFaced || 0;
          acc.hits += cur.hits || 0;
          acc.homeRuns += cur.homeRuns || 0;
          acc.sacBunts += cur.sacBunts || 0;
          acc.sacFlies += cur.sacFlies || 0;
          acc.strikeouts += cur.strikeouts || 0;
          acc.walks += cur.walks || 0;
          acc.hitByPitch += cur.hitByPitch || 0;
          acc.wildPitches += cur.wildPitches || 0;
          acc.balks += cur.balks || 0;
          acc.runs += cur.runs || 0;
          acc.earnedRuns += cur.earnedRuns || 0;
          return acc;
        },
        {
          outs: 0,
          pitches: 0,
          battersFaced: 0,
          hits: 0,
          homeRuns: 0,
          sacBunts: 0,
          sacFlies: 0,
          strikeouts: 0,
          walks: 0,
          hitByPitch: 0,
          wildPitches: 0,
          balks: 0,
          runs: 0,
          earnedRuns: 0,
        }
      ),
    [pitcherStats]
  );

  const teamIpStr = useMemo(() => {
    const innInt = Math.floor(pitcherTotal.outs / 3);
    const innFrac = pitcherTotal.outs % 3;
    return innFrac > 0 ? `${innInt}.${innFrac}` : `${innInt}.0`;
  }, [pitcherTotal.outs]);

  const teamEraStr = useMemo(() => {
    if (pitcherTotal.outs <= 0) return "0.00";
    return ((pitcherTotal.earnedRuns * 7 * 3) / pitcherTotal.outs).toFixed(2);
  }, [pitcherTotal.earnedRuns, pitcherTotal.outs]);

  const timelineEntries = useMemo(
    () => parseTimelineEntries(playLogs, boxscoreAtBats),
    [playLogs, boxscoreAtBats]
  );

  const timelineInnings = useMemo(
    () =>
      Array.from(new Set(timelineEntries.map((e) => e.inning))).sort(
        (a, b) => a - b
      ),
    [timelineEntries]
  );

  const filteredTimelineEntries = useMemo(
    () =>
      timelineEntries.filter((entry) => {
        if (
          selectedTimelineInning !== "all" &&
          entry.inning !== selectedTimelineInning
        ) {
          return false;
        }
        if (onlyMyAttackLogs && entry.isTop !== isMyTeamTop) {
          return false;
        }
        return true;
      }),
    [timelineEntries, selectedTimelineInning, onlyMyAttackLogs, isMyTeamTop]
  );

  const visibleTimelineEntries = useMemo(() => {
    if (selectedTimelineInning !== "all" || showAllTimeline) {
      return filteredTimelineEntries;
    }
    return filteredTimelineEntries.slice(0, 8);
  }, [filteredTimelineEntries, selectedTimelineInning, showAllTimeline]);

  const hasAnyImportedData =
    stats.length > 0 || pitcherStats.length > 0 || timelineEntries.length > 0;

  if (isRainout) {
    return null;
  }

  if (isFutureOrScheduled && !hasAnyImportedData) {
    return null;
  }

  if (isLoadingStats) {
    return (
      <section className="space-y-2" aria-label="個人成績読み込み中">
        <div className="flex items-center justify-between px-1">
          <h2 className="flex items-center gap-1.5 text-xs font-black text-foreground">
            <Target className="w-4 h-4 text-primary shrink-0" />
            <span>個人成績・打席経過</span>
          </h2>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-xs flex items-center justify-center gap-2 text-xs font-bold text-muted-foreground">
          <span className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span>成績データを集計中...</span>
        </div>
      </section>
    );
  }

  if (!hasAnyImportedData) {
    return (
      <section className="space-y-2" aria-label="個人成績未登録">
        <div className="flex items-center justify-between px-1">
          <h2 className="flex items-center gap-1.5 text-xs font-black text-foreground">
            <Target className="w-4 h-4 text-primary shrink-0" />
            <span>個人成績・打席経過</span>
          </h2>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-xs space-y-3">
          <EmptyState
            icon={Target}
            title="個人成績データがまだありません"
            description="紙スコアブックをAIで取り込むと、打撃・走塁・守備20項目、投手成績、各回の打席経過がここに自動表示されます"
          />
          {!isDemoMatch && (
            <div className="flex justify-center pb-1">
              <Link
                href={`/liff/tools/scorebook-import?matchId=${encodeURIComponent(
                  matchId
                )}`}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black shadow-2xs active:scale-95 transition-all"
              >
                <ScanLine className="w-3.5 h-3.5" />
                <span>紙スコアブックを取り込む</span>
              </Link>
            </div>
          )}
        </div>
      </section>
    );
  }

  const renderNumberCell = (
    value: number | undefined,
    emphasis?: "hit" | "hr" | "rbi" | "sb" | "err"
  ) => {
    const n = Number(value) || 0;
    if (n === 0) {
      return (
        <td className="px-1.5 py-2 text-center font-mono tabular-nums text-[11px] font-semibold text-muted-foreground/40">
          0
        </td>
      );
    }
    const toneClass =
      emphasis === "hr"
        ? "text-primary font-black"
        : emphasis === "hit" && n >= 2
        ? "text-primary font-black"
        : emphasis === "hit"
        ? "text-foreground font-black"
        : emphasis === "rbi"
        ? "text-primary font-black"
        : emphasis === "sb"
        ? "text-primary font-black"
        : emphasis === "err"
        ? "text-foreground font-bold"
        : "text-foreground font-bold";

    return (
      <td
        className={cn(
          "px-1.5 py-2 text-center font-mono tabular-nums text-xs",
          toneClass
        )}
      >
        {n}
      </td>
    );
  };

  const toggleExpandPitchLog = (id: string) => {
    setExpandedLogIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <div className="space-y-5">
      {/* 🌟 1. 本日の注目選手（Web版 HighlightHero と同一ロジック） */}
      {highlightHeroes.length > 0 && (
        <section className="space-y-2" aria-label="本日の注目選手">
          <div className="flex items-center justify-between gap-2 px-1">
            <h2 className="flex items-center gap-1.5 text-xs font-black text-foreground">
              <Award className="w-4 h-4 text-primary shrink-0" />
              <span>本日の注目選手</span>
            </h2>
            <span className="text-[10px] font-black text-muted-foreground">
              KEY PLAYERS
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {highlightHeroes.map((hero, idx) => {
              const heroAccentClass =
                hero.type === "hit"
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                  : hero.type === "rbi"
                  ? idx === 0
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                    : "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30"
                  : "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30";

              return (
                <div
                  key={`${hero.label}-${hero.value}-${idx}`}
                  className="rounded-2xl border border-border/60 bg-card p-3 shadow-xs flex items-start gap-2.5"
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border",
                      heroAccentClass
                    )}
                  >
                    {hero.type === "hit" ? (
                      <Flame className="w-4 h-4" />
                    ) : hero.type === "rbi" ? (
                      <Target className="w-4 h-4" />
                    ) : (
                      <Award className="w-4 h-4" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={cn(
                          "inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-black leading-none border",
                          heroAccentClass
                        )}
                      >
                        {hero.label}
                      </span>
                      <span className="text-xs font-black text-foreground truncate">
                        {hero.value}
                      </span>
                    </div>
                    <p className="text-[11px] font-bold text-muted-foreground leading-snug">
                      {hero.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 🎯 2. 打撃・走塁・守備成績（Web版と同一の全22項目＋打率＋チーム合計） */}
      <section className="space-y-2" aria-label="打撃・走塁・守備成績">
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="flex items-center gap-1.5 text-xs font-black text-foreground min-w-0">
            <Target className="w-4 h-4 text-primary shrink-0" />
            <span className="truncate">打撃・走塁・守備成績</span>
          </h2>

          <div className="inline-flex items-center gap-0.5 bg-muted/80 dark:bg-muted/50 p-1 rounded-2xl border border-border/60 shrink-0">
            <button
              type="button"
              onClick={() => setBatterColumnMode("full")}
              className={cn(
                "px-2.5 py-0.5 rounded-xl text-[10px] transition-all cursor-pointer",
                batterColumnMode === "full"
                  ? "bg-card text-foreground shadow-sm border border-border/50 font-black"
                  : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
              )}
            >
              <span className={batterColumnMode === "full" ? "text-primary" : ""}>全項目</span>
            </button>
            <button
              type="button"
              onClick={() => setBatterColumnMode("compact")}
              className={cn(
                "px-2.5 py-0.5 rounded-xl text-[10px] transition-all cursor-pointer",
                batterColumnMode === "compact"
                  ? "bg-card text-foreground shadow-sm border border-border/50 font-black"
                  : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
              )}
            >
              <span className={batterColumnMode === "compact" ? "text-primary" : ""}>主要のみ</span>
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card shadow-xs overflow-hidden">
          {/* サマリー帯（チーム打率・安打・打点・盗塁をひと目で把握） */}
          <div className="px-3.5 py-2.5 bg-primary/[0.04] dark:bg-primary/[0.07] border-b border-border/50 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-[11px] font-black text-foreground">
              <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/25 font-mono tabular-nums">
                チーム打率 {teamAvgStr}
              </span>
              <span className="text-muted-foreground font-mono tabular-nums">
                {batterTotal.atBats}打数 {batterTotal.hits}安打 {batterTotal.rbi}打点
              </span>
            </div>
            {batterColumnMode === "full" && (
              <span className="text-[10px] font-bold text-muted-foreground select-none">
                ← 横スワイプで全項目 →
              </span>
            )}
          </div>

          {stats.length === 0 ? (
            <div className="p-6 text-center text-xs font-bold text-muted-foreground">
              打撃データがありません
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table
                className={cn(
                  "w-full border-collapse text-xs whitespace-nowrap",
                  batterColumnMode === "full" ? "min-w-[920px]" : "min-w-[420px]"
                )}
              >
                <thead>
                  <tr className="bg-muted border-b border-border/60 text-[10px] font-black text-muted-foreground">
                    <th className="sticky left-0 z-10 bg-muted border-r border-border/60 py-2 pl-2.5 pr-2 text-left min-w-[126px]">
                      選手
                    </th>
                    {batterColumnMode === "full" && (
                      <th className="px-1.5 py-2 text-center min-w-[34px]">打席</th>
                    )}
                    <th className="px-1.5 py-2 text-center min-w-[34px]">打数</th>
                    <th className="px-1.5 py-2 text-center min-w-[34px] text-foreground">
                      安打
                    </th>
                    {batterColumnMode === "full" && (
                      <>
                        <th className="px-1.5 py-2 text-center min-w-[34px]">単打</th>
                        <th className="px-1.5 py-2 text-center min-w-[38px]">二塁打</th>
                        <th className="px-1.5 py-2 text-center min-w-[38px]">三塁打</th>
                      </>
                    )}
                    <th className="px-1.5 py-2 text-center min-w-[38px]">本塁打</th>
                    <th className="px-1.5 py-2 text-center min-w-[34px] text-foreground">
                      打点
                    </th>
                    <th className="px-1.5 py-2 text-center min-w-[34px]">得点</th>
                    <th className="px-1.5 py-2 text-center min-w-[34px]">四球</th>
                    {batterColumnMode === "full" && (
                      <th className="px-1.5 py-2 text-center min-w-[34px]">死球</th>
                    )}
                    <th className="px-1.5 py-2 text-center min-w-[34px]">三振</th>
                    {batterColumnMode === "full" && (
                      <>
                        <th className="px-1.5 py-2 text-center min-w-[34px]">犠打</th>
                        <th className="px-1.5 py-2 text-center min-w-[34px]">犠飛</th>
                      </>
                    )}
                    <th className="px-1.5 py-2 text-center min-w-[34px]">盗塁</th>
                    {batterColumnMode === "full" && (
                      <>
                        <th className="px-1.5 py-2 text-center min-w-[38px]">盗塁刺</th>
                        <th className="px-1.5 py-2 text-center min-w-[34px]">残塁</th>
                        <th className="px-1.5 py-2 text-center min-w-[34px]">併殺</th>
                        <th className="px-1.5 py-2 text-center min-w-[34px]">失策</th>
                        <th className="px-1.5 py-2 text-center min-w-[34px]">捕殺</th>
                        <th className="px-1.5 py-2 text-center min-w-[34px]">刺殺</th>
                      </>
                    )}
                    <th className="px-2 py-2 pr-2.5 text-right min-w-[48px] text-primary border-l border-border/60">
                      打率
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border/60">
                  {stats.map((player) => {
                    const posBadge = getMiniPosBadge(player.position);

                    return (
                      <tr key={player.id} className="bg-card hover:bg-muted/35 transition-colors">
                        <td className="sticky left-0 z-10 bg-card border-r border-border/60 py-2 pl-2.5 pr-2 max-w-[144px]">
                          <div className="flex items-center gap-1 min-w-0">
                            {player.battingOrder ? (
                              <span
                                className={cn(
                                  "w-4 h-4 rounded text-[9px] font-mono tabular-nums font-black inline-flex items-center justify-center shrink-0",
                                  player.isSub
                                    ? "bg-primary/15 text-primary"
                                    : "bg-primary/10 text-primary"
                                )}
                              >
                                {player.battingOrder}
                              </span>
                            ) : null}

                            {posBadge && (
                              <span
                                className={cn(
                                  "w-4 h-4 rounded text-[9px] font-black inline-flex items-center justify-center shrink-0 leading-none",
                                  posBadge.className
                                )}
                              >
                                {posBadge.label}
                              </span>
                            )}

                            <span className="font-black text-xs text-foreground truncate">
                              {player.name}
                            </span>

                            {player.number && player.number !== "-" && (
                              <span className="text-[10px] font-mono tabular-nums font-bold text-muted-foreground shrink-0">
                                #{player.number}
                              </span>
                            )}
                          </div>
                        </td>

                        {batterColumnMode === "full" &&
                          renderNumberCell(player.plateAppearances)}
                        {renderNumberCell(player.atBats)}
                        {renderNumberCell(player.hits, "hit")}
                        {batterColumnMode === "full" && (
                          <>
                            {renderNumberCell(player.singles)}
                            {renderNumberCell(player.doubles, "hit")}
                            {renderNumberCell(player.triples, "hit")}
                          </>
                        )}
                        {renderNumberCell(player.homeRuns, "hr")}
                        {renderNumberCell(player.rbi, "rbi")}
                        {renderNumberCell(player.runs)}
                        {renderNumberCell(
                          batterColumnMode === "compact"
                            ? (player.walks || 0) + (player.hitByPitch || 0)
                            : player.walks
                        )}
                        {batterColumnMode === "full" &&
                          renderNumberCell(player.hitByPitch)}
                        {renderNumberCell(player.strikeouts)}
                        {batterColumnMode === "full" && (
                          <>
                            {renderNumberCell(player.sacBunts)}
                            {renderNumberCell(player.sacFlies)}
                          </>
                        )}
                        {renderNumberCell(player.stolenBases, "sb")}
                        {batterColumnMode === "full" && (
                          <>
                            {renderNumberCell(player.caughtStealing)}
                            {renderNumberCell(player.leftOnBase)}
                            {renderNumberCell(player.doublePlays)}
                            {renderNumberCell(player.errors, "err")}
                            {renderNumberCell(player.assists)}
                            {renderNumberCell(player.putouts)}
                          </>
                        )}
                        <td className="px-2 py-2 pr-2.5 text-right font-mono tabular-nums text-xs font-black text-primary border-l border-border/60">
                          {player.avg}
                        </td>
                      </tr>
                    );
                  })}

                  {/* TEAM TOTAL 行 */}
                  <tr className="bg-muted border-t border-border/60 font-black text-xs">
                    <td className="sticky left-0 z-10 bg-muted border-r border-border/60 py-2.5 pl-2.5 pr-2 text-[10px] font-black tracking-wider text-foreground">
                      TOTAL
                    </td>
                    {batterColumnMode === "full" && (
                      <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-muted-foreground">
                        {batterTotal.plateAppearances}
                      </td>
                    )}
                    <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-muted-foreground">
                      {batterTotal.atBats}
                    </td>
                    <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-foreground">
                      {batterTotal.hits}
                    </td>
                    {batterColumnMode === "full" && (
                      <>
                        <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-muted-foreground">
                          {batterTotal.singles}
                        </td>
                        <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-muted-foreground">
                          {batterTotal.doubles}
                        </td>
                        <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-muted-foreground">
                          {batterTotal.triples}
                        </td>
                      </>
                    )}
                    <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-primary">
                      {batterTotal.homeRuns}
                    </td>
                    <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-primary">
                      {batterTotal.rbi}
                    </td>
                    <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-foreground">
                      {batterTotal.runs}
                    </td>
                    <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-muted-foreground">
                      {batterColumnMode === "compact"
                        ? batterTotal.walks + batterTotal.hitByPitch
                        : batterTotal.walks}
                    </td>
                    {batterColumnMode === "full" && (
                      <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-muted-foreground">
                        {batterTotal.hitByPitch}
                      </td>
                    )}
                    <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-muted-foreground">
                      {batterTotal.strikeouts}
                    </td>
                    {batterColumnMode === "full" && (
                      <>
                        <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-muted-foreground">
                          {batterTotal.sacBunts}
                        </td>
                        <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-muted-foreground">
                          {batterTotal.sacFlies}
                        </td>
                      </>
                    )}
                    <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-primary">
                      {batterTotal.stolenBases}
                    </td>
                    {batterColumnMode === "full" && (
                      <>
                        <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-muted-foreground">
                          {batterTotal.caughtStealing}
                        </td>
                        <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-muted-foreground">
                          {batterTotal.leftOnBase}
                        </td>
                        <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-muted-foreground">
                          {batterTotal.doublePlays}
                        </td>
                        <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-muted-foreground">
                          {batterTotal.errors}
                        </td>
                        <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-muted-foreground">
                          {batterTotal.assists}
                        </td>
                        <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-muted-foreground">
                          {batterTotal.putouts}
                        </td>
                      </>
                    )}
                    <td className="px-2 py-2.5 pr-2.5 text-right font-mono tabular-nums text-primary border-l border-border/60">
                      {teamAvgStr}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* 📝 打撃・走塁詳細（新聞・プロ仕様詳細：本塁打・三塁打・二塁打・盗塁・犠打・犠飛・併殺打） */}
          {hasGameDetails && (
            <div className="border-t border-border/60 bg-muted/35 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] font-black text-primary">
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span>打撃・走塁詳細</span>
              </div>

              <div className="space-y-1.5 text-xs font-bold">
                {(
                  [
                    {
                      key: "homeRun",
                      label: "本塁打",
                      items: resolvedGameDetails.homeRun,
                      badgeClass:
                        "bg-primary/12 text-primary border-primary/25",
                    },
                    {
                      key: "triple",
                      label: "三塁打",
                      items: resolvedGameDetails.triple,
                      badgeClass:
                        "bg-primary/10 text-primary border-primary/25",
                    },
                    {
                      key: "double",
                      label: "二塁打",
                      items: resolvedGameDetails.double,
                      badgeClass:
                        "bg-primary/10 text-primary border-primary/25",
                    },
                    {
                      key: "stolenBase",
                      label: "盗塁",
                      items: resolvedGameDetails.stolenBase,
                      badgeClass:
                        "bg-primary/10 text-primary border-primary/25",
                    },
                    {
                      key: "sacrificeBunt",
                      label: "犠打",
                      items: resolvedGameDetails.sacrificeBunt,
                      badgeClass:
                        "bg-muted/50 text-muted-foreground border-border/60",
                    },
                    {
                      key: "sacrificeFly",
                      label: "犠飛",
                      items: resolvedGameDetails.sacrificeFly,
                      badgeClass:
                        "bg-muted/50 text-muted-foreground border-border/60",
                    },
                    {
                      key: "doublePlay",
                      label: "併殺打",
                      items: resolvedGameDetails.doublePlay,
                      badgeClass:
                        "bg-muted/50 text-muted-foreground border-border/60",
                    },
                  ] as const
                )
                  .filter((row) => row.items.length > 0)
                  .map((row) => (
                    <div
                      key={row.key}
                      className="flex items-start gap-2 leading-snug"
                    >
                      <span
                        className={cn(
                          "inline-flex items-center justify-center min-w-[46px] px-1.5 py-0.5 rounded-md border text-[10px] font-black leading-tight shrink-0 mt-0.5",
                          row.badgeClass
                        )}
                      >
                        {row.label}
                      </span>
                      <span className="text-foreground break-words">
                        {row.items.join("、")}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ⚡ 3. 投手成績（Web版と同一の全項目＋防御率＋TEAM TOTAL） */}
      <section className="space-y-2" aria-label="投手成績">
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="flex items-center gap-1.5 text-xs font-black text-foreground">
            <Zap className="w-4 h-4 text-primary shrink-0" />
            <span>投手成績</span>
          </h2>
          {pitcherStats.length > 0 && (
            <span className="text-[10px] font-black font-mono tabular-nums text-muted-foreground">
              防御率 {teamEraStr}（7回制換算）
            </span>
          )}
        </div>

        <div className="rounded-2xl border border-border/60 bg-card shadow-xs overflow-hidden">
          {pitcherStats.length === 0 ? (
            <div className="p-6 text-center text-xs font-bold text-muted-foreground">
              投手データがありません
            </div>
          ) : (
            <>
              {/* 投手サマリー帯 */}
              <div className="px-3.5 py-2.5 bg-primary/[0.04] dark:bg-primary/[0.07] border-b border-border/50 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-[11px] font-black text-foreground">
                  <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/25 font-mono tabular-nums">
                    チーム防御率 {teamEraStr}
                  </span>
                  <span className="text-muted-foreground font-mono tabular-nums">
                    {teamIpStr}回 {pitcherTotal.strikeouts}奪三振 自責{pitcherTotal.earnedRuns}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-muted-foreground select-none">
                  ← 横スワイプで全項目 →
                </span>
              </div>

              <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-xs whitespace-nowrap">
                <thead>
                  <tr className="bg-muted border-b border-border/60 text-[10px] font-black text-muted-foreground">
                    <th className="sticky left-0 z-10 bg-muted border-r border-border/60 py-2 pl-2.5 pr-2 text-left min-w-[116px]">
                      投手
                    </th>
                    <th className="px-1.5 py-2 text-center min-w-[44px] text-foreground">
                      投球回
                    </th>
                    <th className="px-1.5 py-2 text-center min-w-[42px]">投球数</th>
                    <th className="px-1.5 py-2 text-center min-w-[36px]">打者</th>
                    <th className="px-1.5 py-2 text-center min-w-[36px]">安打</th>
                    <th className="px-1.5 py-2 text-center min-w-[40px]">本塁打</th>
                    <th className="px-1.5 py-2 text-center min-w-[36px]">犠打</th>
                    <th className="px-1.5 py-2 text-center min-w-[36px]">犠飛</th>
                    <th className="px-1.5 py-2 text-center min-w-[36px] text-foreground">
                      三振
                    </th>
                    <th className="px-1.5 py-2 text-center min-w-[36px]">四球</th>
                    <th className="px-1.5 py-2 text-center min-w-[36px]">死球</th>
                    <th className="px-1.5 py-2 text-center min-w-[36px]">暴投</th>
                    <th className="px-1.5 py-2 text-center min-w-[40px]">ボーク</th>
                    <th className="px-1.5 py-2 text-center min-w-[36px]">失点</th>
                    <th className="px-1.5 py-2 text-center min-w-[40px]">自責点</th>
                    <th className="px-2 py-2 pr-2.5 text-right min-w-[48px] text-primary border-l border-border/60">
                      防御率
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border/60">
                  {pitcherStats.map((pitcher) => {
                    const so = Number(pitcher.strikeouts) || 0;
                    const er = Number(pitcher.earnedRuns) || 0;
                    const pitcherPosInfo = getPositionBadgeInfo("1");

                    return (
                      <tr key={pitcher.id} className="bg-card hover:bg-muted/35 transition-colors">
                        <td className="sticky left-0 z-10 bg-card border-r border-border/60 py-2 pl-2.5 pr-2 max-w-[138px]">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={cn(
                                "w-4 h-4 rounded text-white text-[9px] font-black inline-flex items-center justify-center shrink-0 leading-none",
                                pitcherPosInfo?.color || "bg-primary"
                              )}
                            >
                              投
                            </span>
                            <span className="font-black text-xs text-foreground truncate">
                              {pitcher.name}
                            </span>
                            {pitcher.number && pitcher.number !== "-" && (
                              <span className="text-[10px] font-mono tabular-nums font-bold text-muted-foreground shrink-0">
                                #{pitcher.number}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-1.5 py-2 text-center font-mono tabular-nums text-xs font-black text-foreground">
                          {pitcher.ip}
                        </td>
                        {renderNumberCell(pitcher.pitches)}
                        {renderNumberCell(pitcher.battersFaced)}
                        {renderNumberCell(pitcher.hits)}
                        {renderNumberCell(pitcher.homeRuns, "hr")}
                        {renderNumberCell(pitcher.sacBunts)}
                        {renderNumberCell(pitcher.sacFlies)}
                        <td
                          className={cn(
                            "px-1.5 py-2 text-center font-mono tabular-nums text-xs",
                            so >= 3
                              ? "text-primary font-black"
                              : so > 0
                              ? "text-foreground font-black"
                              : "text-muted-foreground/40 font-semibold"
                          )}
                        >
                          {so}
                        </td>
                        {renderNumberCell(pitcher.walks)}
                        {renderNumberCell(pitcher.hitByPitch)}
                        {renderNumberCell(pitcher.wildPitches)}
                        {renderNumberCell(pitcher.balks)}
                        {renderNumberCell(pitcher.runs, "err")}
                        <td
                          className={cn(
                            "px-1.5 py-2 text-center font-mono tabular-nums text-xs font-black",
                            er > 0
                              ? "text-foreground"
                              : "text-primary"
                          )}
                        >
                          {er}
                        </td>
                        <td className="px-2 py-2 pr-2.5 text-right font-mono tabular-nums text-xs font-black text-primary border-l border-border/60">
                          {pitcher.era}
                        </td>
                      </tr>
                    );
                  })}

                  {/* PITCHING TEAM TOTAL 行 */}
                  <tr className="bg-muted border-t border-border/60 font-black text-xs">
                    <td className="sticky left-0 z-10 bg-muted border-r border-border/60 py-2.5 pl-2.5 pr-2 text-[10px] font-black tracking-wider text-foreground">
                      TEAM TOTAL
                    </td>
                    <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-foreground">
                      {teamIpStr}
                    </td>
                    <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-muted-foreground">
                      {pitcherTotal.pitches}
                    </td>
                    <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-muted-foreground">
                      {pitcherTotal.battersFaced}
                    </td>
                    <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-muted-foreground">
                      {pitcherTotal.hits}
                    </td>
                    <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-muted-foreground">
                      {pitcherTotal.homeRuns}
                    </td>
                    <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-muted-foreground">
                      {pitcherTotal.sacBunts}
                    </td>
                    <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-muted-foreground">
                      {pitcherTotal.sacFlies}
                    </td>
                    <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-foreground">
                      {pitcherTotal.strikeouts}
                    </td>
                    <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-muted-foreground">
                      {pitcherTotal.walks}
                    </td>
                    <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-muted-foreground">
                      {pitcherTotal.hitByPitch}
                    </td>
                    <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-muted-foreground">
                      {pitcherTotal.wildPitches}
                    </td>
                    <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-muted-foreground">
                      {pitcherTotal.balks}
                    </td>
                    <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-muted-foreground">
                      {pitcherTotal.runs}
                    </td>
                    <td className="px-1.5 py-2.5 text-center font-mono tabular-nums text-foreground">
                      {pitcherTotal.earnedRuns}
                    </td>
                    <td className="px-2 py-2.5 pr-2.5 text-right font-mono tabular-nums text-primary border-l border-border/60">
                      {teamEraStr}
                    </td>
                  </tr>
                </tbody>
              </table>
              </div>
            </>
          )}
        </div>
      </section>

      {/* 📈 4. タイムライン（各回の打席・一球経過） */}
      {timelineEntries.length > 0 && (
        <section className="space-y-2" aria-label="タイムライン">
          <div className="flex items-center justify-between gap-2 px-1">
            <h2 className="flex items-center gap-1.5 text-xs font-black text-foreground">
              <Activity className="w-4 h-4 text-primary shrink-0" />
              <span>タイムライン（打席・一球経過）</span>
            </h2>
            <button
              type="button"
              onClick={() => setOnlyMyAttackLogs((prev) => !prev)}
              className={cn(
                "px-2.5 py-1 rounded-full text-[10px] transition-all cursor-pointer",
                onlyMyAttackLogs
                  ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                  : "bg-card text-muted-foreground border border-border/60 hover:text-foreground hover:bg-muted/50 font-bold"
              )}
            >
              {onlyMyAttackLogs ? "自チーム攻撃のみ表示中" : "自チーム攻撃のみ"}
            </button>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card shadow-xs overflow-hidden">
            {/* カードヘッダー帯 ＆ イニング絞り込みチップ */}
            <div className="px-3.5 py-2.5 bg-primary/[0.04] dark:bg-primary/[0.07] border-b border-border/50 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
              {timelineInnings.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setSelectedTimelineInning("all")}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-[11px] shrink-0 transition-all cursor-pointer tabular-nums",
                      selectedTimelineInning === "all"
                        ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                        : "bg-card text-muted-foreground border border-border/60 hover:text-foreground hover:bg-muted/50 font-bold"
                    )}
                  >
                    すべて ({filteredTimelineEntries.length})
                  </button>
                  {timelineInnings.map((inn) => (
                    <button
                      key={inn}
                      type="button"
                      onClick={() => setSelectedTimelineInning(inn)}
                      className={cn(
                        "px-2.5 py-1 rounded-full text-[11px] font-mono tabular-nums shrink-0 transition-all cursor-pointer",
                        selectedTimelineInning === inn
                          ? "bg-primary/12 text-primary border border-primary/35 font-black shadow-2xs"
                          : "bg-card text-muted-foreground border border-border/60 hover:text-foreground hover:bg-muted/50 font-bold"
                      )}
                    >
                      {inn}回
                    </button>
                  ))}
                </>
              ) : (
                <span className="text-[11px] font-black text-foreground">
                  打席経過ログ（全{filteredTimelineEntries.length}打席）
                </span>
              )}
            </div>

            {visibleTimelineEntries.length === 0 ? (
              <div className="p-6 text-center text-xs font-bold text-muted-foreground">
                該当するイニングの打席ログがありません
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {visibleTimelineEntries.map((entry, idx) => {
                  const prev = idx > 0 ? visibleTimelineEntries[idx - 1] : null;
                  const showHalfHeader =
                    !prev ||
                    prev.inning !== entry.inning ||
                    prev.isTop !== entry.isTop;
                  const isMyOffense = entry.isTop === isMyTeamTop;
                  const isExpanded = Boolean(expandedLogIds[entry.id]);
                  const canExpand = entry.pitchesList.length > 0;

                  const badgeStyle =
                    entry.badgeTone === "hr"
                      ? "bg-primary text-primary-foreground border-primary"
                      : entry.badgeTone === "hit"
                      ? "bg-primary/12 text-primary border-primary/25"
                      : entry.badgeTone === "walk"
                      ? "bg-primary/10 text-primary border-primary/20"
                      : entry.badgeTone === "sac"
                      ? "bg-primary/10 text-primary border-primary/20"
                      : entry.badgeTone === "score"
                      ? "bg-primary/12 text-primary border-primary/25"
                      : "bg-muted/50 text-muted-foreground border-border/60";

                  return (
                    <React.Fragment key={entry.id}>
                      {showHalfHeader && (
                        <div
                          className={cn(
                            "px-3 py-1.5 flex items-center justify-between text-[11px] font-black border-b border-border/60",
                            isMyOffense
                              ? "bg-primary/[0.08] text-primary"
                              : "bg-muted/50 text-muted-foreground"
                          )}
                        >
                          <span>
                            {entry.inning}回{entry.isTop ? "表" : "裏"}・
                            {isMyOffense ? myTeamName : opponentName}の攻撃
                          </span>
                          {isMyOffense && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                              自チーム
                            </span>
                          )}
                        </div>
                      )}

                      <div className="px-3 py-2.5 bg-card space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {entry.orderLabel && (
                                <span className="w-5 h-5 rounded-md bg-muted text-foreground font-mono tabular-nums text-[10px] font-black inline-flex items-center justify-center shrink-0">
                                  {entry.orderLabel}
                                </span>
                              )}
                              <span className="text-xs font-black text-foreground truncate">
                                {entry.batterName}
                              </span>
                              {entry.pitcherName && (
                                <span className="text-[10px] font-bold text-muted-foreground truncate">
                                  vs {entry.pitcherName}
                                </span>
                              )}
                            </div>

                            {(entry.rbiTag || entry.runnerNote) && (
                              <div className="mt-1 flex items-center flex-wrap gap-1">
                                {entry.rbiTag && (
                                  <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/25 text-[10px] font-black">
                                    {entry.rbiTag}
                                  </span>
                                )}
                                {entry.runnerNote && (
                                  <span className="text-[10px] font-bold text-muted-foreground leading-snug">
                                    {entry.runnerNote}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span
                              className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded-lg border text-[11px] font-black leading-tight",
                                badgeStyle
                              )}
                            >
                              {entry.mainResult}
                            </span>

                            <div className="flex items-center gap-1.5 text-[10px] font-mono tabular-nums font-bold text-muted-foreground">
                              {entry.hasBso && (
                                <span>
                                  B{entry.balls}-S{entry.strikes}
                                </span>
                              )}
                              {canExpand && (
                                <button
                                  type="button"
                                  onClick={() => toggleExpandPitchLog(entry.id)}
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-foreground font-black cursor-pointer"
                                >
                                  <span>{entry.pitchesList.length}球</span>
                                  {isExpanded ? (
                                    <ChevronUp className="w-3 h-3" />
                                  ) : (
                                    <ChevronDown className="w-3 h-3" />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {canExpand && isExpanded && (
                          <div className="pt-1.5 border-t border-border/60 flex flex-wrap gap-1">
                            {entry.pitchesList.map((pLine, pIdx) => (
                              <span
                                key={`${entry.id}-pt-${pIdx}`}
                                className="px-2 py-0.5 rounded-md bg-muted/50 border border-border/60 text-[10px] font-bold text-foreground font-mono"
                              >
                                {pLine}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            )}

            {/* 折りたたみ解除ボタン */}
            {selectedTimelineInning === "all" &&
              filteredTimelineEntries.length > 8 && (
                <div className="p-2.5 bg-muted/35 border-t border-border/60">
                  <button
                    type="button"
                    onClick={() => setShowAllTimeline((prev) => !prev)}
                    className="w-full h-9 rounded-xl bg-card hover:bg-muted border border-border/60 text-xs font-black text-foreground flex items-center justify-center gap-1.5 shadow-2xs active:scale-[0.99] transition-all cursor-pointer"
                  >
                    {showAllTimeline ? (
                      <>
                        <ChevronUp className="w-4 h-4 text-primary" />
                        <span>表示を折りたたむ</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4 text-primary" />
                        <span>
                          すべての打席経過を表示（全{filteredTimelineEntries.length}打席）
                        </span>
                      </>
                    )}
                  </button>
                </div>
              )}
          </div>
        </section>
      )}
    </div>
  );
}

