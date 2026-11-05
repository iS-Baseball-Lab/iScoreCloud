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
import { ScorebookSingleCellThumbnail } from "@/components/liff/ScorebookCellGuideModal";
import { getPositionBadgeInfo } from "@/lib/liff/demo-lineup";
import {
  getChronologicalMergedGameCells,
  getChronologicalSheetCells,
  resolveCellBatterIdentity,
  type InspectedScorebookCellItem,
} from "@/lib/liff/scorebook-cell-guide";
import type {
  CompiledCellBasePresence,
  CompiledScorebookCell,
  CompiledScorebookSheetModel,
} from "@/lib/liff/scorebook-renderer-model";
import type { ScorebookSymbolRules } from "@/lib/liff/scorebook-symbol-rules";
import type { CanonicalAtBatResult } from "@/types/scorebook-v2";
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

type TimelineBadgeTone =
  | "hr"
  | "xbh"
  | "hit"
  | "walk"
  | "sac"
  | "reach"
  | "so"
  | "dp"
  | "out";

interface TimelineRunnerChip {
  text: string;
  kind: "score" | "advance" | "out";
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
  runnerChips: TimelineRunnerChip[];
  rbiTag: string;
  runsInPlay: number;
  balls: number;
  strikes: number;
  outs: number;
  hasBso: boolean;
  basesAfter: CompiledCellBasePresence;
  isInningOver: boolean;
  pitchesList: string[];
  badgeTone: TimelineBadgeTone;
  cellItem?: InspectedScorebookCellItem;
}

export type MatchStatsDisplayPart = "all" | "heroes" | "timeline" | "tables";

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
  displayPart?: MatchStatsDisplayPart;
  topScorebookModel?: CompiledScorebookSheetModel | null;
  bottomScorebookModel?: CompiledScorebookSheetModel | null;
  scorebookRules?: ScorebookSymbolRules;
  onInspectScorebookCell?: (
    item: InspectedScorebookCellItem,
    navigationItems: InspectedScorebookCellItem[]
  ) => void;
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

const EMPTY_BASES_PRESENCE: CompiledCellBasePresence = {
  "1B": false,
  "2B": false,
  "3B": false,
};

function classifyResultTone(
  text: string,
  resultType?: string,
  resultCode?: CanonicalAtBatResult
): TimelineBadgeTone {
  if (resultCode) {
    switch (resultCode) {
      case "home_run":
        return "hr";
      case "double":
      case "triple":
        return "xbh";
      case "single":
        return "hit";
      case "walk":
      case "intentional_walk":
      case "hit_by_pitch":
        return "walk";
      case "sac_bunt":
      case "sac_fly":
        return "sac";
      case "double_play":
      case "triple_play":
        return "dp";
      case "strikeout":
      case "dropped_third_strike_out":
        return "so";
      case "error":
      case "fc":
      case "dropped_third_strike":
      case "interference":
        return "reach";
      case "groundout":
      case "flyout":
      case "infield_fly":
      case "interference_out":
      case "other":
        return "out";
    }
  }

  const t = (text || "").trim();
  if (/本塁打|ホームラン|満塁本|[左中右]越本|[左中右]本|^HR$/i.test(t)) {
    return "hr";
  }
  if (
    /二塁打|２塁打|ツーベース|三塁打|３塁打|スリーベース|[投捕一二三遊左中右](?:前|中間|線|越)[二三](?:$|[^ゴ飛直邪失野併])|^2B$|^3B$/i.test(
      t
    )
  ) {
    return "xbh";
  }
  if (
    resultType === "hit" ||
    /安打|内野安|バント安|バントヒット|[投捕一二三遊左中右](?:前|中間|線|越)?安|^1B$|^H$/i.test(
      t
    )
  ) {
    return "hit";
  }
  if (/四球|死球|敬遠|フォアボール|デッドボール|^BB$|^IBB$|^HBP$|^DB$/i.test(t)) {
    return "walk";
  }
  if (/犠打|犠飛|送りバント|犠牲フライ|^SH$|^SF$/i.test(t)) {
    return "sac";
  }
  if (/併殺|ダブルプレー|ゲッツー|三重殺|トリプルプレー|\bDP\b|\bTP\b/i.test(t)) {
    return "dp";
  }
  if (
    !/振逃出塁|振り逃げ出塁/.test(t) &&
    /三振|空三振|見三振|振り逃げアウト|振逃アウト|^SO$|^K$/i.test(t)
  ) {
    return "so";
  }
  if (
    /敵失|失策|エラー|野選|野手選択|フィルダースチョイス|振逃|振り逃げ|打撃妨害|タイブレーク|^E[1-9]?$|^[1-9]E$|^FC$/i.test(
      t
    )
  ) {
    return "reach";
  }
  return "out";
}

function parseRunnerNoteToChips(runnerNote: string): TimelineRunnerChip[] {
  const clean = (runnerNote || "").trim();
  if (!clean) return [];
  return clean
    .split(/\s*(?:、|\/|／)\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((rawPart) => {
      const normalized = rawPart
        .replace(/[:：]/g, " ")
        .replace(/(?:一塁|二塁|三塁|1塁|2塁|3塁)→本塁生還/g, "生還")
        .replace(/\s+/g, " ")
        .trim();
      if (/生還|本進|ホームイン/.test(rawPart)) {
        return { text: normalized, kind: "score" as const };
      }
      if (/アウト|死|刺/.test(rawPart)) {
        return { text: normalized, kind: "out" as const };
      }
      return { text: normalized, kind: "advance" as const };
    });
}

function extractRunsFromTags(
  rbiTag: string,
  runnerChips: TimelineRunnerChip[],
  badgeTone: TimelineBadgeTone
): number {
  let tagRuns = 0;
  const rbiMatch = rbiTag.match(/(?:打点|得点)(\d+)/);
  if (rbiMatch) {
    tagRuns = Number(rbiMatch[1]) || 0;
  }
  const scoredRunners = runnerChips.filter((c) => c.kind === "score").length;
  const selfHr = badgeTone === "hr" ? 1 : 0;
  return Math.max(tagRuns, scoredRunners + selfHr);
}

function formatTimelineSituationLabel(
  outs: number,
  bases: CompiledCellBasePresence,
  isInningOver: boolean
): string {
  if (isInningOver || outs >= 3) {
    return "3死チェンジ";
  }
  const outsText = outs <= 0 ? "無死" : `${outs}死`;
  const b1 = bases["1B"];
  const b2 = bases["2B"];
  const b3 = bases["3B"];

  let baseText = "走者なし";
  if (b1 && b2 && b3) baseText = "満塁";
  else if (b2 && b3) baseText = "二・三塁";
  else if (b1 && b3) baseText = "一・三塁";
  else if (b1 && b2) baseText = "一・二塁";
  else if (b3) baseText = "三塁";
  else if (b2) baseText = "二塁";
  else if (b1) baseText = "一塁";

  return `${outsText} ${baseText}`;
}

/**
 * スコアブックモデルが無い試合（ライブ入力ログ・ボックススコアのみ等）でも
 * 各イニング表裏のアウト累積数・一〜三塁の進塁状態を時系列シミュレーションして補完する
 */
function enrichTimelineEntriesWithSituation(
  entries: ParsedTimelineEntry[]
): ParsedTimelineEntry[] {
  let currentSideKey = "";
  let runningOuts = 0;
  let runningBases: CompiledCellBasePresence = { ...EMPTY_BASES_PRESENCE };

  return entries.map((entry) => {
    const sideKey = `${entry.inning}:${entry.isTop ? 1 : 0}`;
    if (sideKey !== currentSideKey) {
      currentSideKey = sideKey;
      runningOuts = 0;
      runningBases = { ...EMPTY_BASES_PRESENCE };
    }

    const exactSit = entry.cellItem?.cell.situation;
    if (exactSit) {
      runningOuts = exactSit.isInningOver ? 0 : exactSit.outsAfter;
      runningBases = exactSit.isInningOver
        ? { ...EMPTY_BASES_PRESENCE }
        : { ...exactSit.basesAfterPlay };
      return {
        ...entry,
        outs: exactSit.outsAfter,
        basesAfter: exactSit.basesAfterPlay,
        isInningOver: exactSit.isInningOver,
        runsInPlay: Math.max(entry.runsInPlay, exactSit.runsInPlay),
      };
    }

    // フォールバック：打席結果・走者ノートから進塁状態と累積アウトを推定
    let nextOuts = runningOuts;
    let nextBases: CompiledCellBasePresence = { ...runningBases };
    const tone = entry.badgeTone;
    const text = entry.mainResult;

    // 1) 明示的な走者ノートがある場合は生還・アウト・進塁先を先に反映
    for (const chip of entry.runnerChips) {
      const ct = chip.text;
      const from1 =
        /一走|(?:一塁|1塁)→/.test(ct) ||
        (/(?:一塁|1塁)/.test(ct) && !/→(?:一塁|1塁)/.test(ct));
      const from2 =
        /二走|(?:二塁|2塁)→/.test(ct) ||
        (/(?:二塁|2塁)/.test(ct) && !/→(?:二塁|2塁)|二進|二塁盗塁/.test(ct));
      const from3 =
        /三走|(?:三塁|3塁)→/.test(ct) ||
        (/(?:三塁|3塁)/.test(ct) && !/→(?:三塁|3塁)|三進|三塁盗塁/.test(ct));

      if (from3) nextBases["3B"] = false;
      else if (from2) nextBases["2B"] = false;
      else if (from1) nextBases["1B"] = false;

      if (chip.kind === "out") {
        nextOuts = Math.min(3, nextOuts + 1);
      } else if (chip.kind === "advance") {
        if (/三進|→三塁|→3塁|三塁盗塁/.test(ct)) nextBases["3B"] = true;
        else if (/二進|→二塁|→2塁|二塁盗塁|盗塁/.test(ct)) nextBases["2B"] = true;
      }
    }

    const hadExplicitRunnerMoves = entry.runnerChips.length > 0;
    let estRuns = entry.runsInPlay;

    // 2) 打者自身の結果による進塁・アウト遷移
    if (/タイブレーク/.test(text)) {
      if (/一塁/.test(text)) nextBases["1B"] = true;
      else if (/三塁/.test(text)) nextBases["3B"] = true;
      else nextBases["2B"] = true;
    } else if (tone === "hr") {
      const runnersOn =
        (runningBases["1B"] ? 1 : 0) +
        (runningBases["2B"] ? 1 : 0) +
        (runningBases["3B"] ? 1 : 0);
      estRuns = Math.max(estRuns, runnersOn + 1);
      nextBases = { "1B": false, "2B": false, "3B": false };
    } else if (tone === "xbh") {
      const isTriple = /三塁打|３塁打|スリーベース|[左中右](?:中間|線|越)?三$|^3B$/i.test(
        text
      );
      if (isTriple) {
        nextBases = { "1B": false, "2B": false, "3B": true };
      } else {
        if (!hadExplicitRunnerMoves) {
          const keep3B = runningBases["1B"] && estRuns === 0;
          nextBases = { "1B": false, "2B": true, "3B": keep3B };
        } else {
          nextBases["1B"] = false;
          nextBases["2B"] = true;
        }
      }
    } else if (tone === "hit" || tone === "reach") {
      if (!hadExplicitRunnerMoves) {
        const next3B = estRuns > 0 ? false : runningBases["2B"] || runningBases["3B"];
        const next2B = runningBases["1B"];
        nextBases = { "1B": true, "2B": next2B, "3B": next3B };
      } else {
        nextBases["1B"] = true;
      }
    } else if (tone === "walk") {
      if (!hadExplicitRunnerMoves) {
        const next3B =
          (runningBases["1B"] && runningBases["2B"]) ||
          (runningBases["3B"] && !(runningBases["1B"] && runningBases["2B"]));
        const next2B =
          runningBases["1B"] || (runningBases["2B"] && !runningBases["1B"]);
        nextBases = { "1B": true, "2B": next2B, "3B": next3B };
      } else {
        nextBases["1B"] = true;
      }
    } else if (tone === "sac") {
      nextOuts = Math.min(3, runningOuts + 1);
      if (!hadExplicitRunnerMoves && nextOuts < 3) {
        if (/犠飛|犠牲フライ|SF/i.test(text)) {
          nextBases["3B"] = false;
        } else {
          nextBases = {
            "1B": false,
            "2B": runningBases["1B"],
            "3B": runningBases["2B"] || (runningBases["3B"] && estRuns === 0),
          };
        }
      }
    } else if (tone === "dp") {
      const outDelta = /三重殺|トリプルプレー|TP/i.test(text) ? 3 : 2;
      nextOuts = Math.min(3, runningOuts + outDelta);
      if (!hadExplicitRunnerMoves) {
        if (nextBases["1B"]) nextBases["1B"] = false;
        else if (nextBases["2B"]) nextBases["2B"] = false;
      }
    } else {
      // 三振・ゴロ・フライ等の通常アウト（走塁死単独ログの場合は二重加算しない）
      const runnerOnlyOut =
        hadExplicitRunnerMoves &&
        entry.runnerChips.some((c) => c.kind === "out") &&
        /盗塁死|牽制死|走塁死/.test(text);
      if (!runnerOnlyOut) {
        nextOuts = Math.min(3, runningOuts + 1);
      }
    }

    const isInningOver = nextOuts >= 3;
    const finalBases = isInningOver
      ? { ...EMPTY_BASES_PRESENCE }
      : { ...nextBases };

    runningOuts = isInningOver ? 0 : nextOuts;
    runningBases = { ...finalBases };

    return {
      ...entry,
      outs: nextOuts,
      basesAfter: nextBases,
      isInningOver,
      runsInPlay: estRuns,
    };
  });
}

function getTimelineBadgeAndRowStyle(
  tone: TimelineBadgeTone,
  hasRunsScored: boolean
): {
  badgeClass: string;
  rowAccentClass: string;
  rowBgClass: string;
} {
  switch (tone) {
    case "hr":
      return {
        badgeClass:
          "bg-rose-600 text-white border-rose-700 shadow-2xs",
        rowAccentClass: "border-l-rose-600",
        rowBgClass: "bg-[#fff1f2] dark:bg-rose-950",
      };
    case "xbh":
      return {
        badgeClass:
          "bg-orange-500 text-white border-orange-600 shadow-2xs",
        rowAccentClass: hasRunsScored ? "border-l-amber-500" : "border-l-orange-500",
        rowBgClass: hasRunsScored
          ? "bg-[#fffbeb] dark:bg-amber-950"
          : "bg-card",
      };
    case "hit":
      return {
        badgeClass:
          "bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800",
        rowAccentClass: hasRunsScored ? "border-l-amber-500" : "border-l-rose-500",
        rowBgClass: hasRunsScored
          ? "bg-[#fffbeb] dark:bg-amber-950"
          : "bg-card",
      };
    case "walk":
      return {
        badgeClass:
          "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800",
        rowAccentClass: hasRunsScored
          ? "border-l-amber-500"
          : "border-l-emerald-500",
        rowBgClass: hasRunsScored
          ? "bg-[#fffbeb] dark:bg-amber-950"
          : "bg-card",
      };
    case "sac":
      return {
        badgeClass:
          "bg-sky-50 text-sky-700 border-sky-300 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-800",
        rowAccentClass: hasRunsScored ? "border-l-amber-500" : "border-l-sky-500",
        rowBgClass: hasRunsScored
          ? "bg-[#fffbeb] dark:bg-amber-950"
          : "bg-card",
      };
    case "reach":
      return {
        badgeClass:
          "bg-amber-100 text-amber-900 border-amber-400 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-700",
        rowAccentClass: "border-l-amber-500",
        rowBgClass: hasRunsScored
          ? "bg-[#fffbeb] dark:bg-amber-950"
          : "bg-card",
      };
    case "so":
      return {
        badgeClass:
          "bg-indigo-50 text-indigo-700 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-200 dark:border-indigo-800",
        rowAccentClass: "border-l-indigo-400 dark:border-l-indigo-500",
        rowBgClass: "bg-card",
      };
    case "dp":
      return {
        badgeClass:
          "bg-slate-700 text-white border-slate-800 dark:bg-slate-600 dark:text-white dark:border-slate-500",
        rowAccentClass: "border-l-slate-600 dark:border-l-slate-500",
        rowBgClass: "bg-card",
      };
    case "out":
      return {
        badgeClass:
          "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
        rowAccentClass: hasRunsScored
          ? "border-l-amber-500"
          : "border-l-slate-300 dark:border-l-slate-700",
        rowBgClass: hasRunsScored
          ? "bg-[#fffbeb] dark:bg-amber-950"
          : "bg-card",
      };
  }
}

/**
 * 一塁・二塁・三塁の「3つのひし形」で現在の進塁状況を直感的に表すソリッドSVGアイコン
 */
function TimelineThreeBaseDiamond({
  bases,
  isInningOver,
}: {
  bases: CompiledCellBasePresence;
  isInningOver: boolean;
}) {
  const has1B = !isInningOver && bases["1B"];
  const has2B = !isInningOver && bases["2B"];
  const has3B = !isInningOver && bases["3B"];

  const emptyClass = isInningOver
    ? "fill-slate-200 dark:fill-slate-800 stroke-slate-300 dark:stroke-slate-700"
    : "fill-white dark:fill-slate-900 stroke-slate-400 dark:stroke-slate-500";

  return (
    <svg
      width={30}
      height={21}
      viewBox="0 0 36 25"
      aria-hidden="true"
      className="shrink-0"
    >
      {/* 二塁（上中央） */}
      <polygon
        points="18,1.4 23.8,7.2 18,13 12.2,7.2"
        fill={has2B ? "#f59e0b" : undefined}
        stroke={has2B ? "#b45309" : undefined}
        strokeWidth={has2B ? 1.65 : 1.45}
        className={has2B ? undefined : emptyClass}
      />
      {/* 三塁（左下） */}
      <polygon
        points="10.2,9.6 16,15.4 10.2,21.2 4.4,15.4"
        fill={has3B ? "#f59e0b" : undefined}
        stroke={has3B ? "#b45309" : undefined}
        strokeWidth={has3B ? 1.65 : 1.45}
        className={has3B ? undefined : emptyClass}
      />
      {/* 一塁（右下） */}
      <polygon
        points="25.8,9.6 31.6,15.4 25.8,21.2 20,15.4"
        fill={has1B ? "#f59e0b" : undefined}
        stroke={has1B ? "#b45309" : undefined}
        strokeWidth={has1B ? 1.65 : 1.45}
        className={has1B ? undefined : emptyClass}
      />
    </svg>
  );
}

/**
 * B（緑3灯）・S（黄2灯）・O（赤3灯）をスコアボードと同じ丸記号（●/○）で表示するインジケーター
 */
function TimelineBsoSymbolBar({
  balls,
  strikes,
  outs,
  hasPitchCount,
}: {
  balls: number;
  strikes: number;
  outs: number;
  hasPitchCount: boolean;
}) {
  const litB = Math.max(0, Math.min(3, balls));
  const litS = Math.max(0, Math.min(2, strikes));
  const litO = Math.max(0, Math.min(3, outs));

  const unlitDotClass =
    "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600";

  return (
    <div
      className="inline-flex items-center gap-1.5 shrink-0 select-none"
      aria-label={
        hasPitchCount
          ? `ボール${balls} ストライク${strikes} アウト${outs}`
          : `アウト${outs}`
      }
    >
      {hasPitchCount && (
        <>
          <span className="inline-flex items-center gap-[2px]">
            <span className="text-[9.5px] font-mono font-black text-emerald-700 dark:text-emerald-400 leading-none mr-[1px]">
              B
            </span>
            {[0, 1, 2].map((i) => (
              <span
                key={`b-${i}`}
                className={cn(
                  "w-[7px] h-[7px] rounded-full border",
                  i < litB
                    ? "bg-emerald-500 border-emerald-700"
                    : unlitDotClass
                )}
              />
            ))}
          </span>

          <span className="inline-flex items-center gap-[2px]">
            <span className="text-[9.5px] font-mono font-black text-amber-600 dark:text-amber-400 leading-none mr-[1px]">
              S
            </span>
            {[0, 1].map((i) => (
              <span
                key={`s-${i}`}
                className={cn(
                  "w-[7px] h-[7px] rounded-full border",
                  i < litS ? "bg-amber-400 border-amber-600" : unlitDotClass
                )}
              />
            ))}
          </span>
        </>
      )}

      <span className="inline-flex items-center gap-[2px]">
        <span className="text-[9.5px] font-mono font-black text-rose-600 dark:text-rose-400 leading-none mr-[1px]">
          O
        </span>
        {[0, 1, 2].map((i) => (
          <span
            key={`o-${i}`}
            className={cn(
              "w-[7px] h-[7px] rounded-full border",
              i < litO ? "bg-rose-500 border-rose-700" : unlitDotClass
            )}
          />
        ))}
      </span>
    </div>
  );
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
      const badgeTone = classifyResultTone(mainResult, log.resultType);
      const runnerChips = parseRunnerNoteToChips(runnerNote);
      const runsInPlay = extractRunsFromTags(rbiTag, runnerChips, badgeTone);

      return {
        id: log.id,
        inning: log.inning,
        isTop: log.isTop,
        orderLabel,
        batterName,
        pitcherName: matchedBox?.pitcherName || "",
        mainResult,
        runnerNote,
        runnerChips,
        rbiTag,
        runsInPlay,
        balls,
        strikes,
        outs,
        hasBso,
        basesAfter: { ...EMPTY_BASES_PRESENCE },
        isInningOver: false,
        pitchesList,
        badgeTone,
      };
    });
  }

  return boxscoreAtBats.map((ab) => {
    const rawRes = ab.result || "";
    const displayRes = CANONICAL_RESULT_JA[rawRes] || rawRes || "打席完了";
    const badgeTone = classifyResultTone(displayRes);
    return {
      id: ab.id,
      inning: ab.inning,
      isTop: ab.isTop,
      orderLabel: "",
      batterName: ab.batterName || "打者",
      pitcherName: ab.pitcherName || "",
      mainResult: displayRes,
      runnerNote: "",
      runnerChips: [],
      rbiTag: "",
      runsInPlay: badgeTone === "hr" ? 1 : 0,
      balls: 0,
      strikes: 0,
      outs: 0,
      hasBso: false,
      basesAfter: { ...EMPTY_BASES_PRESENCE },
      isInningOver: false,
      pitchesList: [],
      badgeTone,
    };
  });
}

const BASE_CODE_SHORT_JA: Record<string, string> = {
  BAT: "打席",
  "1B": "一塁",
  "2B": "二塁",
  "3B": "三塁",
  HP: "本塁",
};

function buildTimelineEntriesFromScorebookModels(
  topModel: CompiledScorebookSheetModel | null,
  bottomModel: CompiledScorebookSheetModel | null
): ParsedTimelineEntry[] {
  const merged = getChronologicalMergedGameCells(topModel, bottomModel);
  return merged
    .filter((item) => Boolean(item.cell.atBat || item.cell.isTiebreakRunnerOnly))
    .map((item) => {
      const { cell, model } = item;
      const ab = cell.atBat;
      const batterIdentity = resolveCellBatterIdentity(cell, model);

      if (!ab) {
        const startJa =
          cell.tiebreakStartBase === "1B"
            ? "一塁"
            : cell.tiebreakStartBase === "3B"
            ? "三塁"
            : "二塁";
        const tbBases: CompiledCellBasePresence = cell.situation?.basesAfterPlay ?? {
          "1B": cell.tiebreakStartBase === "1B",
          "2B": cell.tiebreakStartBase !== "1B" && cell.tiebreakStartBase !== "3B",
          "3B": cell.tiebreakStartBase === "3B",
        };
        return {
          id: `sb-${model.isTop ? "top" : "bot"}-${cell.cellKey}`,
          inning: cell.inning,
          isTop: model.isTop,
          orderLabel: String(cell.battingOrder),
          batterName: batterIdentity.name,
          pitcherName: "",
          mainResult: `タイブレーク${startJa}走者`,
          runnerNote: "",
          runnerChips: [],
          rbiTag: "",
          runsInPlay: 0,
          balls: 0,
          strikes: 0,
          outs: cell.situation?.outsAfter ?? 0,
          hasBso: false,
          basesAfter: tbBases,
          isInningOver: false,
          pitchesList: [],
          badgeTone: "reach",
          cellItem: item,
        };
      }

      const mainResult =
        (ab.resultLabel || "").trim() ||
        CANONICAL_RESULT_JA[ab.resultCode] ||
        "打席完了";

      const runnerNotes: string[] = [];
      const runnerChips: TimelineRunnerChip[] = [];
      for (const adv of ab.advances) {
        if (adv.from === "BAT") continue;
        const fromJa = BASE_CODE_SHORT_JA[adv.from] || adv.from;
        const toJa = BASE_CODE_SHORT_JA[adv.to] || adv.to;
        if (adv.isOut) {
          const t = `${adv.runnerName || "走者"} ${toJa}アウト`;
          runnerNotes.push(t);
          runnerChips.push({ text: t, kind: "out" });
        } else if (adv.method === "steal") {
          const t = `${adv.runnerName || "走者"} ${toJa}盗塁`;
          runnerNotes.push(t);
          runnerChips.push({ text: t, kind: "advance" });
        } else if (adv.to === "HP") {
          const t = `${adv.runnerName || "走者"} 生還`;
          runnerNotes.push(t);
          runnerChips.push({ text: t, kind: "score" });
        } else {
          const t = `${adv.runnerName || "走者"} ${fromJa}→${toJa}`;
          runnerNotes.push(t);
          runnerChips.push({ text: t, kind: "advance" });
        }
      }

      const runsInPlay =
        cell.situation?.runsInPlay ?? Math.max(ab.runsInPlay || 0, ab.rbi || 0);
      const rbiTag =
        ab.rbi > 0
          ? `打点${ab.rbi}`
          : runsInPlay > 0
          ? `得点${runsInPlay}`
          : "";
      const isHitCode =
        ab.resultCode === "single" ||
        ab.resultCode === "double" ||
        ab.resultCode === "triple" ||
        ab.resultCode === "home_run";

      return {
        id: `sb-${model.isTop ? "top" : "bot"}-${cell.cellKey}`,
        inning: cell.inning,
        isTop: model.isTop,
        orderLabel: String(cell.battingOrder),
        batterName: batterIdentity.name,
        pitcherName: ab.pitcherName || "",
        mainResult,
        runnerNote: runnerNotes.join(" / "),
        runnerChips,
        rbiTag,
        runsInPlay,
        balls: ab.balls || 0,
        strikes: Math.min(2, ab.strikes || 0),
        outs: cell.situation?.outsAfter ?? ab.endingOuts ?? 0,
        hasBso: true,
        basesAfter: cell.situation?.basesAfterPlay ?? { ...EMPTY_BASES_PRESENCE },
        isInningOver: cell.situation?.isInningOver ?? (ab.endingOuts || 0) >= 3,
        pitchesList: [],
        badgeTone: classifyResultTone(
          mainResult,
          isHitCode ? "hit" : runsInPlay > 0 ? "score" : undefined,
          ab.resultCode
        ),
        cellItem: item,
      };
    });
}

function attachScorebookCellsToTimelineEntries(
  entries: ParsedTimelineEntry[],
  topModel: CompiledScorebookSheetModel | null,
  bottomModel: CompiledScorebookSheetModel | null
): ParsedTimelineEntry[] {
  if (!topModel && !bottomModel) {
    return entries;
  }

  const buckets = new Map<
    string,
    { model: CompiledScorebookSheetModel; cells: CompiledScorebookCell[] }
  >();

  const registerModel = (model: CompiledScorebookSheetModel | null) => {
    if (!model) return;
    const ordered = getChronologicalSheetCells(model).filter((c) =>
      Boolean(c.atBat)
    );
    for (const c of ordered) {
      const key = `${c.inning}:${model.isTop ? 1 : 0}`;
      const existing = buckets.get(key);
      if (existing) {
        existing.cells.push(c);
      } else {
        buckets.set(key, { model, cells: [c] });
      }
    }
  };

  registerModel(topModel);
  registerModel(bottomModel);

  const cursors = new Map<string, number>();

  return entries.map((entry) => {
    const key = `${entry.inning}:${entry.isTop ? 1 : 0}`;
    const bucket = buckets.get(key);
    if (!bucket || bucket.cells.length === 0) {
      return entry;
    }

    const startCursor = cursors.get(key) ?? 0;
    if (startCursor >= bucket.cells.length) {
      return entry;
    }

    const parsedOrder = entry.orderLabel ? Number(entry.orderLabel) : 0;
    let matchedIdx = startCursor;

    if (parsedOrder > 0 && bucket.cells[startCursor]?.battingOrder !== parsedOrder) {
      for (let i = startCursor + 1; i < bucket.cells.length; i++) {
        if (bucket.cells[i]?.battingOrder === parsedOrder) {
          matchedIdx = i;
          break;
        }
      }
    }

    const matchedCell = bucket.cells[matchedIdx];
    cursors.set(key, matchedIdx + 1);

    if (!matchedCell) {
      return entry;
    }

    const ab = matchedCell.atBat;
    const sit = matchedCell.situation;
    const canonicalTone = ab
      ? classifyResultTone(entry.mainResult, undefined, ab.resultCode)
      : entry.badgeTone;

    let resolvedRunnerChips = entry.runnerChips;
    let resolvedRunnerNote = entry.runnerNote;
    if (resolvedRunnerChips.length === 0 && ab && ab.advances.length > 0) {
      const fbChips: TimelineRunnerChip[] = [];
      for (const adv of ab.advances) {
        if (adv.from === "BAT") continue;
        const fromJa = BASE_CODE_SHORT_JA[adv.from] || adv.from;
        const toJa = BASE_CODE_SHORT_JA[adv.to] || adv.to;
        if (adv.isOut) {
          fbChips.push({
            text: `${adv.runnerName || "走者"} ${toJa}アウト`,
            kind: "out",
          });
        } else if (adv.method === "steal") {
          fbChips.push({
            text: `${adv.runnerName || "走者"} ${toJa}盗塁`,
            kind: "advance",
          });
        } else if (adv.to === "HP") {
          fbChips.push({
            text: `${adv.runnerName || "走者"} 生還`,
            kind: "score",
          });
        } else if (adv.from !== adv.to) {
          fbChips.push({
            text: `${adv.runnerName || "走者"} ${fromJa}→${toJa}`,
            kind: "advance",
          });
        }
      }
      if (fbChips.length > 0) {
        resolvedRunnerChips = fbChips;
        resolvedRunnerNote = fbChips.map((c) => c.text).join(" / ");
      }
    }

    const resolvedRuns = Math.max(
      entry.runsInPlay,
      sit?.runsInPlay ?? ab?.runsInPlay ?? 0
    );
    const resolvedRbiTag =
      entry.rbiTag ||
      (ab && ab.rbi > 0
        ? `打点${ab.rbi}`
        : resolvedRuns > 0
        ? `得点${resolvedRuns}`
        : "");

    return {
      ...entry,
      orderLabel: entry.orderLabel || String(matchedCell.battingOrder),
      pitcherName: entry.pitcherName || ab?.pitcherName || "",
      runnerNote: resolvedRunnerNote,
      runnerChips: resolvedRunnerChips,
      rbiTag: resolvedRbiTag,
      balls: entry.hasBso ? entry.balls : ab?.balls || 0,
      strikes: entry.hasBso ? entry.strikes : ab?.strikes || 0,
      outs: sit?.outsAfter ?? ab?.endingOuts ?? entry.outs,
      hasBso: entry.hasBso || Boolean(ab),
      basesAfter: sit?.basesAfterPlay ?? entry.basesAfter,
      isInningOver: sit?.isInningOver ?? entry.isInningOver,
      runsInPlay: resolvedRuns,
      badgeTone: canonicalTone,
      cellItem: {
        cell: matchedCell,
        model: bucket.model,
      },
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
  displayPart = "all",
  topScorebookModel = null,
  bottomScorebookModel = null,
  scorebookRules,
  onInspectScorebookCell,
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

  const needHeroes = displayPart === "all" || displayPart === "heroes";
  const needTables = displayPart === "all" || displayPart === "tables";
  const needTimeline =
    displayPart === "all" ||
    displayPart === "timeline" ||
    (needTables && stats.length === 0 && pitcherStats.length === 0);

  const highlightHeroes = useMemo(
    () => (needHeroes ? extractHighlightHeroes(stats, pitcherStats) : []),
    [needHeroes, stats, pitcherStats]
  );

  const resolvedGameDetails = useMemo(
    () =>
      needTables
        ? gameDetails || buildFallbackGameDetails(boxscoreAtBats, isMyTeamTop)
        : {
            double: [],
            triple: [],
            homeRun: [],
            sacrificeBunt: [],
            sacrificeFly: [],
            stolenBase: [],
            doublePlay: [],
          },
    [needTables, gameDetails, boxscoreAtBats, isMyTeamTop]
  );

  const hasGameDetails = useMemo(
    () =>
      needTables &&
      Object.values(resolvedGameDetails).some((arr) => arr.length > 0),
    [needTables, resolvedGameDetails]
  );

  // 打撃成績合計（Web版と同一の20項目＋安打＋チーム打率）
  const batterTotal = useMemo(
    () =>
      (needTables ? stats : []).reduce(
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
    [needTables, stats]
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
      (needTables ? pitcherStats : []).reduce(
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
    [needTables, pitcherStats]
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

  const timelineEntries = useMemo(() => {
    if (!needTimeline) return [];
    const base = parseTimelineEntries(playLogs, boxscoreAtBats);
    if (
      (isDemoMatch || base.length === 0) &&
      (topScorebookModel || bottomScorebookModel)
    ) {
      return enrichTimelineEntriesWithSituation(
        buildTimelineEntriesFromScorebookModels(
          topScorebookModel,
          bottomScorebookModel
        )
      );
    }
    return enrichTimelineEntriesWithSituation(
      attachScorebookCellsToTimelineEntries(
        base,
        topScorebookModel,
        bottomScorebookModel
      )
    );
  }, [
    needTimeline,
    playLogs,
    boxscoreAtBats,
    isDemoMatch,
    topScorebookModel,
    bottomScorebookModel,
  ]);

  const halfInningRunsMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of timelineEntries) {
      const key = `${entry.inning}:${entry.isTop ? 1 : 0}`;
      map.set(key, (map.get(key) || 0) + (entry.runsInPlay || 0));
    }
    return map;
  }, [timelineEntries]);

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

  const filteredTimelineCellItems = useMemo(
    () =>
      filteredTimelineEntries
        .map((e) => e.cellItem)
        .filter((v): v is InspectedScorebookCellItem => Boolean(v)),
    [filteredTimelineEntries]
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
    if (displayPart !== "all" && displayPart !== "tables") {
      return null;
    }
    return (
      <section className="space-y-2" aria-label="個人成績読み込み中">
        <div className="flex items-center justify-between px-1">
          <h2 className="flex items-center gap-1.5 text-xs font-black text-foreground">
            <Target className="w-4 h-4 text-primary shrink-0" />
            <span>個人成績・打席経過</span>
          </h2>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xs flex items-center justify-center gap-2 text-xs font-bold text-muted-foreground">
          <span className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span>成績データを集計中...</span>
        </div>
      </section>
    );
  }

  if (!hasAnyImportedData) {
    if (displayPart !== "all" && displayPart !== "tables") {
      return null;
    }
    return (
      <section className="space-y-2" aria-label="個人成績未登録">
        <div className="flex items-center justify-between px-1">
          <h2 className="flex items-center gap-1.5 text-xs font-black text-foreground">
            <Target className="w-4 h-4 text-primary shrink-0" />
            <span>個人成績・打席経過</span>
          </h2>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
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

  const showHeroes = needHeroes && highlightHeroes.length > 0;
  const showTables = needTables;
  const showTimeline = needTimeline && (displayPart === "all" || displayPart === "timeline") && timelineEntries.length > 0;

  if (!showHeroes && !showTables && !showTimeline) {
    return null;
  }

  return (
    <div className="space-y-5">
      {/* 🌟 1. 本日の注目選手（Web版 HighlightHero と同一ロジック） */}
      {showHeroes && (
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
              const heroTopBarClass =
                hero.type === "hit"
                  ? "bg-amber-500"
                  : hero.type === "rbi"
                  ? "bg-primary"
                  : "bg-sky-500";

              return (
                <div
                  key={`${hero.label}-${hero.value}-${idx}`}
                  className="relative overflow-hidden rounded-2xl border border-border bg-card p-3 pt-3.5 shadow-xs flex items-start gap-2.5"
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-x-0 top-0 h-[3px] ${heroTopBarClass}`}
                  />
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

      {showTables && (
        <>
          {/* 🎯 2. 打撃・走塁・守備成績（Web版と同一の全22項目＋打率＋チーム合計） */}
          <section className="space-y-2" aria-label="打撃・走塁・守備成績">
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="flex items-center gap-1.5 text-xs font-black text-foreground min-w-0">
            <Target className="w-4 h-4 text-primary shrink-0" />
            <span className="truncate">打撃・走塁・守備成績</span>
          </h2>

          <div className="inline-flex items-center gap-0.5 bg-muted p-1 rounded-2xl border border-border shrink-0">
            <button
              type="button"
              onClick={() => setBatterColumnMode("full")}
              className={cn(
                "px-2.5 py-0.5 rounded-xl text-[10px] transition-all cursor-pointer",
                batterColumnMode === "full"
                  ? "bg-card text-foreground shadow-sm border border-border font-black"
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
                  ? "bg-card text-foreground shadow-sm border border-border font-black"
                  : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
              )}
            >
              <span className={batterColumnMode === "compact" ? "text-primary" : ""}>主要のみ</span>
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          {/* A-3 上帯ダークキャップ（チーム打率・安打・打点・盗塁をひと目で把握） */}
          <div className="px-3.5 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-[11px] font-black text-white">
              <span className="px-2 py-0.5 rounded bg-primary text-primary-foreground font-mono tabular-nums">
                チーム打率 {teamAvgStr}
              </span>
              <span className="text-slate-200 font-mono tabular-nums">
                {batterTotal.atBats}打数 {batterTotal.hits}安打 {batterTotal.rbi}打点
              </span>
            </div>
            {batterColumnMode === "full" && (
              <span className="text-[10px] font-bold text-slate-300 select-none">
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
                  <tr className="bg-muted border-b border-border text-[10px] font-black text-muted-foreground">
                    <th className="sticky left-0 z-10 bg-muted border-r border-border py-2 pl-2.5 pr-2 text-left min-w-[126px]">
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
                    <th className="px-2 py-2 pr-2.5 text-right min-w-[48px] text-primary border-l border-border">
                      打率
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border">
                  {stats.map((player) => {
                    const posBadge = getMiniPosBadge(player.position);

                    return (
                      <tr key={player.id} className="bg-card hover:bg-muted/35 transition-colors">
                        <td className="sticky left-0 z-10 bg-card border-r border-border py-2 pl-2.5 pr-2 max-w-[144px]">
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
                        <td className="px-2 py-2 pr-2.5 text-right font-mono tabular-nums text-xs font-black text-primary border-l border-border">
                          {player.avg}
                        </td>
                      </tr>
                    );
                  })}

                  {/* TEAM TOTAL 行 */}
                  <tr className="bg-muted border-t border-border font-black text-xs">
                    <td className="sticky left-0 z-10 bg-muted border-r border-border py-2.5 pl-2.5 pr-2 text-[10px] font-black tracking-wider text-foreground">
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
                    <td className="px-2 py-2.5 pr-2.5 text-right font-mono tabular-nums text-primary border-l border-border">
                      {teamAvgStr}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* 📝 打撃・走塁詳細（新聞・プロ仕様詳細：本塁打・三塁打・二塁打・盗塁・犠打・犠飛・併殺打） */}
          {hasGameDetails && (
            <div className="border-t border-border bg-muted/35 p-3 space-y-2">
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
                        "bg-muted/50 text-muted-foreground border-border",
                    },
                    {
                      key: "sacrificeFly",
                      label: "犠飛",
                      items: resolvedGameDetails.sacrificeFly,
                      badgeClass:
                        "bg-muted/50 text-muted-foreground border-border",
                    },
                    {
                      key: "doublePlay",
                      label: "併殺打",
                      items: resolvedGameDetails.doublePlay,
                      badgeClass:
                        "bg-muted/50 text-muted-foreground border-border",
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

        <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          {pitcherStats.length === 0 ? (
            <div className="p-6 text-center text-xs font-bold text-muted-foreground">
              投手データがありません
            </div>
          ) : (
            <>
              {/* A-3 上帯ダークキャップ（投手サマリー帯） */}
              <div className="px-3.5 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-[11px] font-black text-white">
                  <span className="px-2 py-0.5 rounded bg-primary text-primary-foreground font-mono tabular-nums">
                    チーム防御率 {teamEraStr}
                  </span>
                  <span className="text-slate-200 font-mono tabular-nums">
                    {teamIpStr}回 {pitcherTotal.strikeouts}奪三振 自責{pitcherTotal.earnedRuns}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-slate-300 select-none">
                  ← 横スワイプで全項目 →
                </span>
              </div>

              <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-xs whitespace-nowrap">
                <thead>
                  <tr className="bg-muted border-b border-border text-[10px] font-black text-muted-foreground">
                    <th className="sticky left-0 z-10 bg-muted border-r border-border py-2 pl-2.5 pr-2 text-left min-w-[116px]">
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
                    <th className="px-2 py-2 pr-2.5 text-right min-w-[48px] text-primary border-l border-border">
                      防御率
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border">
                  {pitcherStats.map((pitcher) => {
                    const so = Number(pitcher.strikeouts) || 0;
                    const er = Number(pitcher.earnedRuns) || 0;
                    const pitcherPosInfo = getPositionBadgeInfo("1");

                    return (
                      <tr key={pitcher.id} className="bg-card hover:bg-muted/35 transition-colors">
                        <td className="sticky left-0 z-10 bg-card border-r border-border py-2 pl-2.5 pr-2 max-w-[138px]">
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
                        <td className="px-2 py-2 pr-2.5 text-right font-mono tabular-nums text-xs font-black text-primary border-l border-border">
                          {pitcher.era}
                        </td>
                      </tr>
                    );
                  })}

                  {/* PITCHING TEAM TOTAL 行 */}
                  <tr className="bg-muted border-t border-border font-black text-xs">
                    <td className="sticky left-0 z-10 bg-muted border-r border-border py-2.5 pl-2.5 pr-2 text-[10px] font-black tracking-wider text-foreground">
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
                    <td className="px-2 py-2.5 pr-2.5 text-right font-mono tabular-nums text-primary border-l border-border">
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
        </>
      )}

      {/* 📈 4. タイムライン（各回の打席・一球経過） */}
      {showTimeline && (
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
                  : "bg-card text-muted-foreground border border-border hover:text-foreground hover:bg-muted/50 font-bold"
              )}
            >
              {onlyMyAttackLogs ? "自チーム攻撃のみ表示中" : "自チーム攻撃のみ"}
            </button>
          </div>

          <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
            {/* A-3 上帯ダークソリッドヘッダー ＆ イニング絞り込みチップ */}
            <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
              {timelineInnings.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setSelectedTimelineInning("all")}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-[11px] shrink-0 transition-all cursor-pointer tabular-nums",
                      selectedTimelineInning === "all"
                        ? "bg-primary text-primary-foreground border border-primary font-black shadow-2xs"
                        : "bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 hover:text-white font-bold"
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
                          ? "bg-primary text-primary-foreground border border-primary font-black shadow-2xs"
                          : "bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 hover:text-white font-bold"
                      )}
                    >
                      {inn}回
                    </button>
                  ))}
                </>
              ) : (
                <span className="text-[11px] font-black text-white">
                  打席経過ログ（全{filteredTimelineEntries.length}打席）
                </span>
              )}
            </div>

            {/* 打席結果 色分け凡例 ＆ 1マス解説案内バー（単色ソリッド） */}
            <div className="px-3 py-2 bg-[#f8fafc] dark:bg-slate-900 border-b border-border space-y-1.5">
              <div className="flex items-center flex-wrap gap-1 text-[9.5px] font-black leading-none">
                <span className="text-muted-foreground mr-0.5">結果色:</span>
                <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white border border-rose-700">
                  本塁打
                </span>
                <span className="px-1.5 py-0.5 rounded bg-orange-500 text-white border border-orange-600">
                  二・三塁打
                </span>
                <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-300 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800">
                  単打
                </span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800">
                  四死球
                </span>
                <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-300 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-800">
                  犠打・犠飛
                </span>
                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-400 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-700">
                  失策・野選
                </span>
                <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-300 dark:bg-indigo-950 dark:text-indigo-200 dark:border-indigo-800">
                  三振
                </span>
                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                  凡打
                </span>
              </div>

              {filteredTimelineCellItems.length > 0 && onInspectScorebookCell && (
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground pt-0.5">
                  <BookOpen className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span>
                    左のスコアマス（「記号解説」）をタップすると、配球記号や守備番号の意味を確認できます
                  </span>
                </div>
              )}
            </div>

            {visibleTimelineEntries.length === 0 ? (
              <div className="p-6 text-center text-xs font-bold text-muted-foreground">
                該当するイニングの打席ログがありません
              </div>
            ) : (
              <div className="divide-y divide-border">
                {visibleTimelineEntries.map((entry, idx) => {
                  const prev = idx > 0 ? visibleTimelineEntries[idx - 1] : null;
                  const showHalfHeader =
                    !prev ||
                    prev.inning !== entry.inning ||
                    prev.isTop !== entry.isTop;
                  const isMyOffense = entry.isTop === isMyTeamTop;
                  const isExpanded = Boolean(expandedLogIds[entry.id]);
                  const hasCellGuide = Boolean(
                    entry.cellItem && scorebookRules && onInspectScorebookCell
                  );
                  const canExpand = !hasCellGuide && entry.pitchesList.length > 0;

                  const halfKey = `${entry.inning}:${entry.isTop ? 1 : 0}`;
                  const halfInningRuns = halfInningRunsMap.get(halfKey) || 0;
                  const hasRunsOnPlay =
                    entry.runsInPlay > 0 || Boolean(entry.rbiTag);
                  const rowStyles = getTimelineBadgeAndRowStyle(
                    entry.badgeTone,
                    hasRunsOnPlay
                  );
                  const situationLabel = formatTimelineSituationLabel(
                    entry.outs,
                    entry.basesAfter,
                    entry.isInningOver
                  );
                  const isScoringPosition =
                    !entry.isInningOver &&
                    entry.outs < 3 &&
                    (entry.basesAfter["2B"] || entry.basesAfter["3B"]);

                  return (
                    <React.Fragment key={entry.id}>
                      {showHalfHeader && (
                        <div
                          className={cn(
                            "px-3 py-1.5 flex items-center justify-between gap-2 text-[11px] font-black border-b border-border border-l-4",
                            isMyOffense
                              ? "border-l-primary bg-[#eef2f6] dark:bg-slate-800 text-foreground"
                              : "border-l-slate-400 bg-[#f8fafc] dark:bg-slate-900 text-muted-foreground"
                          )}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={cn(
                                "px-1.5 py-0.5 rounded text-[10px] font-black tabular-nums shrink-0",
                                isMyOffense
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-slate-600 text-white"
                              )}
                            >
                              {entry.inning}回{entry.isTop ? "表" : "裏"}
                            </span>
                            <span className="truncate">
                              {isMyOffense ? myTeamName : opponentName}の攻撃
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {halfInningRuns > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500 text-white border border-amber-600 text-[10px] font-black tabular-nums">
                                +{halfInningRuns}点
                              </span>
                            )}
                            {isMyOffense && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-card text-primary border border-primary font-black">
                                自チーム
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      <div
                        className={cn(
                          "px-3 py-2.5 border-l-[3.5px] space-y-1.5 transition-colors",
                          rowStyles.rowAccentClass,
                          rowStyles.rowBgClass
                        )}
                      >
                        <div className="flex items-start gap-2.5">
                          {/* 左：1マス清書SVG＋記号解説一体型カード（タップで記号解説モーダルを起動） */}
                          {entry.cellItem && scorebookRules && (
                            hasCellGuide ? (
                              <button
                                type="button"
                                onClick={() =>
                                  onInspectScorebookCell?.(
                                    entry.cellItem!,
                                    filteredTimelineCellItems
                                  )
                                }
                                aria-label={`${entry.inning}回${
                                  entry.isTop ? "表" : "裏"
                                } ${entry.batterName} のスコアマス記号解説を開く`}
                                className="group flex flex-col items-center rounded-lg border border-slate-300 hover:border-primary bg-[#fffefb] overflow-hidden shadow-2xs active:scale-95 transition-all cursor-pointer shrink-0 w-[64px]"
                              >
                                <div className="p-0.5 bg-[#fffefb]">
                                  <ScorebookSingleCellThumbnail
                                    cell={entry.cellItem.cell}
                                    rules={scorebookRules}
                                    className="w-[60px] h-[50px]"
                                  />
                                </div>
                                <div className="w-full py-[2.5px] bg-[#eef2f6] group-hover:bg-primary border-t border-slate-300 group-hover:border-primary flex items-center justify-center gap-0.5 text-[9px] font-black text-slate-700 group-hover:text-primary-foreground leading-none transition-colors">
                                  <BookOpen className="w-2.5 h-2.5 shrink-0" />
                                  <span>記号解説</span>
                                </div>
                              </button>
                            ) : (
                              <div className="rounded-lg border border-slate-300 bg-[#fffefb] p-0.5 shadow-2xs shrink-0">
                                <ScorebookSingleCellThumbnail
                                  cell={entry.cellItem.cell}
                                  rules={scorebookRules}
                                  className="w-[60px] h-[50px]"
                                />
                              </div>
                            )
                          )}

                          {/* 右：打者・結果バッジ ＆ 3つのひし形進塁状態・BSO丸記号バー */}
                          <div className="min-w-0 flex-1 space-y-1.5">
                            {/* 上段：打順・打者名 vs 投手名 ｜ 結果カラーバッジ */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                                {entry.orderLabel && (
                                  <span className="w-5 h-5 rounded-md bg-slate-800 dark:bg-slate-700 text-white font-mono tabular-nums text-[10px] font-black inline-flex items-center justify-center shrink-0">
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

                              <span
                                className={cn(
                                  "inline-flex items-center px-2 py-0.5 rounded-lg border text-[11px] font-black leading-tight shrink-0",
                                  rowStyles.badgeClass
                                )}
                              >
                                {entry.mainResult}
                              </span>
                            </div>

                            {/* 中段：3つのひし形（進塁状態）＋死数・塁状況テキスト ｜ BSO記号インジケーター */}
                            <div className="rounded-lg bg-[#eef2f6] dark:bg-slate-800 border border-[#cbd5e1] dark:border-slate-700 px-2 py-1 flex items-center justify-between gap-x-2 gap-y-1 flex-wrap">
                              <div className="inline-flex items-center gap-1.5 min-w-0">
                                <TimelineThreeBaseDiamond
                                  bases={entry.basesAfter}
                                  isInningOver={entry.isInningOver}
                                />
                                <span
                                  className={cn(
                                    "text-[10px] font-black leading-none whitespace-nowrap",
                                    entry.isInningOver || entry.outs >= 3
                                      ? "text-slate-500 dark:text-slate-400"
                                      : isScoringPosition
                                      ? "text-amber-800 dark:text-amber-300"
                                      : "text-slate-700 dark:text-slate-200"
                                  )}
                                >
                                  {situationLabel}
                                </span>
                              </div>

                              <div className="inline-flex items-center gap-1.5 shrink-0 ml-auto">
                                <TimelineBsoSymbolBar
                                  balls={entry.balls}
                                  strikes={entry.strikes}
                                  outs={entry.outs}
                                  hasPitchCount={entry.hasBso}
                                />
                                {canExpand && (
                                  <button
                                    type="button"
                                    onClick={() => toggleExpandPitchLog(entry.id)}
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-card hover:bg-muted border border-border text-[10px] font-mono tabular-nums text-foreground font-black cursor-pointer"
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

                            {/* 下段：打点・得点ゴールドバッジ ＆ 走者進塁・生還・走塁死チップ */}
                            {(entry.rbiTag || entry.runnerChips.length > 0) && (
                              <div className="flex items-center flex-wrap gap-1 pt-0.5">
                                {entry.rbiTag && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-500 text-white border border-amber-600 text-[10px] font-black leading-tight shrink-0">
                                    {entry.rbiTag}
                                  </span>
                                )}
                                {entry.runnerChips.map((chip, cIdx) => (
                                  <span
                                    key={`${entry.id}-rc-${cIdx}`}
                                    className={cn(
                                      "px-1.5 py-0.5 rounded border text-[10px] font-bold leading-tight",
                                      chip.kind === "score"
                                        ? "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900 dark:text-amber-100 dark:border-amber-700 font-black"
                                        : chip.kind === "out"
                                        ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800"
                                        : "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700"
                                    )}
                                  >
                                    {chip.text}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {canExpand && isExpanded && (
                          <div className="pt-1.5 border-t border-border flex flex-wrap gap-1">
                            {entry.pitchesList.map((pLine, pIdx) => (
                              <span
                                key={`${entry.id}-pt-${pIdx}`}
                                className="px-2 py-0.5 rounded-md bg-[#eef2f6] dark:bg-slate-800 border border-border text-[10px] font-bold text-foreground font-mono"
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
                <div className="p-2.5 bg-[#eef2f6] dark:bg-slate-900 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setShowAllTimeline((prev) => !prev)}
                    className="w-full h-9 rounded-xl bg-card hover:bg-muted border border-border text-xs font-black text-foreground flex items-center justify-center gap-1.5 shadow-2xs active:scale-[0.99] transition-all cursor-pointer"
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

