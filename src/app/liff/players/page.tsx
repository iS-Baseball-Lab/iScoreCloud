// filepath: src/app/liff/players/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  IdCard,
  Search,
  LayoutGrid,
  List,
  X,
  Crown,
  ChevronLeft,
  ChevronRight,
  Trophy,
  Sparkles,
  Users,
  Flame,
  Activity,
  Loader2,
} from "lucide-react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { useLiff } from "@/components/liff/LiffProvider";
import { EmptyState } from "@/components/layout/EmptyState";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type RosterCategory = "投手" | "捕手" | "内野手" | "外野手" | "DH" | "未設定";
type FilterCategory = "すべて" | RosterCategory;

interface PlayerBattingStat {
  pa: number;
  ab: number;
  hits: number;
  hr: number;
  walks: number;
  avg: string;
}

interface PlayerPitchingStat {
  battersFaced: number;
  outs: number;
  inningsText: string;
  strikeouts: number;
  hitsAllowed: number;
  walks: number;
}

interface DirectoryPlayer {
  id: string;
  name: string;
  nameKana: string | null;
  uniformNumber: string;
  nickname?: string | null;
  primaryPosition: string | null;
  subPositions: string[];
  throws: string | null;
  bats: string | null;
  height: number | null;
  weight: number | null;
  profileImageUrl: string | null;
  notes: string | null;
  isCaptain: boolean;
  joinedAt: number | null;
  batting: PlayerBattingStat | null;
  pitching: PlayerPitchingStat | null;
}

interface DirectoryTeamInfo {
  id: string;
  name: string;
  orgName: string;
  teamName: string;
  managerName: string | null;
  logoImageUrl: string | null;
  year: number;
  captainId: string | null;
}

interface PlayersDirectoryResponse {
  success: boolean;
  isDemo?: boolean;
  error?: string;
  team?: DirectoryTeamInfo;
  players?: DirectoryPlayer[];
}

interface PositionMeta {
  category: RosterCategory;
  shortLabel: string;
  fullLabel: string;
  code: string;
}

const POSITION_MAP: Record<string, PositionMeta> = {
  P: { category: "投手", shortLabel: "投手", fullLabel: "投手 (PITCHER)", code: "P" },
  "1": { category: "投手", shortLabel: "投手", fullLabel: "投手 (PITCHER)", code: "P" },
  投手: { category: "投手", shortLabel: "投手", fullLabel: "投手 (PITCHER)", code: "P" },
  ピッチャー: { category: "投手", shortLabel: "投手", fullLabel: "投手 (PITCHER)", code: "P" },

  C: { category: "捕手", shortLabel: "捕手", fullLabel: "捕手 (CATCHER)", code: "C" },
  "2": { category: "捕手", shortLabel: "捕手", fullLabel: "捕手 (CATCHER)", code: "C" },
  捕手: { category: "捕手", shortLabel: "捕手", fullLabel: "捕手 (CATCHER)", code: "C" },
  キャッチャー: { category: "捕手", shortLabel: "捕手", fullLabel: "捕手 (CATCHER)", code: "C" },

  "1B": { category: "内野手", shortLabel: "一塁手", fullLabel: "一塁手 (1B)", code: "1B" },
  "3": { category: "内野手", shortLabel: "一塁手", fullLabel: "一塁手 (1B)", code: "1B" },
  一塁: { category: "内野手", shortLabel: "一塁手", fullLabel: "一塁手 (1B)", code: "1B" },
  一塁手: { category: "内野手", shortLabel: "一塁手", fullLabel: "一塁手 (1B)", code: "1B" },

  "2B": { category: "内野手", shortLabel: "二塁手", fullLabel: "二塁手 (2B)", code: "2B" },
  "4": { category: "内野手", shortLabel: "二塁手", fullLabel: "二塁手 (2B)", code: "2B" },
  二塁: { category: "内野手", shortLabel: "二塁手", fullLabel: "二塁手 (2B)", code: "2B" },
  二塁手: { category: "内野手", shortLabel: "二塁手", fullLabel: "二塁手 (2B)", code: "2B" },

  "3B": { category: "内野手", shortLabel: "三塁手", fullLabel: "三塁手 (3B)", code: "3B" },
  "5": { category: "内野手", shortLabel: "三塁手", fullLabel: "三塁手 (3B)", code: "3B" },
  三塁: { category: "内野手", shortLabel: "三塁手", fullLabel: "三塁手 (3B)", code: "3B" },
  三塁手: { category: "内野手", shortLabel: "三塁手", fullLabel: "三塁手 (3B)", code: "3B" },

  SS: { category: "内野手", shortLabel: "遊撃手", fullLabel: "遊撃手 (SS)", code: "SS" },
  "6": { category: "内野手", shortLabel: "遊撃手", fullLabel: "遊撃手 (SS)", code: "SS" },
  遊撃: { category: "内野手", shortLabel: "遊撃手", fullLabel: "遊撃手 (SS)", code: "SS" },
  遊撃手: { category: "内野手", shortLabel: "遊撃手", fullLabel: "遊撃手 (SS)", code: "SS" },
  内野: { category: "内野手", shortLabel: "内野手", fullLabel: "内野手 (INFIELDER)", code: "IF" },
  内野手: { category: "内野手", shortLabel: "内野手", fullLabel: "内野手 (INFIELDER)", code: "IF" },

  LF: { category: "外野手", shortLabel: "左翼手", fullLabel: "左翼手 (LF)", code: "LF" },
  "7": { category: "外野手", shortLabel: "左翼手", fullLabel: "左翼手 (LF)", code: "LF" },
  左翼: { category: "外野手", shortLabel: "左翼手", fullLabel: "左翼手 (LF)", code: "LF" },
  左翼手: { category: "外野手", shortLabel: "左翼手", fullLabel: "左翼手 (LF)", code: "LF" },

  CF: { category: "外野手", shortLabel: "中堅手", fullLabel: "中堅手 (CF)", code: "CF" },
  "8": { category: "外野手", shortLabel: "中堅手", fullLabel: "中堅手 (CF)", code: "CF" },
  中堅: { category: "外野手", shortLabel: "中堅手", fullLabel: "中堅手 (CF)", code: "CF" },
  中堅手: { category: "外野手", shortLabel: "中堅手", fullLabel: "中堅手 (CF)", code: "CF" },

  RF: { category: "外野手", shortLabel: "右翼手", fullLabel: "右翼手 (RF)", code: "RF" },
  "9": { category: "外野手", shortLabel: "右翼手", fullLabel: "右翼手 (RF)", code: "RF" },
  右翼: { category: "外野手", shortLabel: "右翼手", fullLabel: "右翼手 (RF)", code: "RF" },
  右翼手: { category: "外野手", shortLabel: "右翼手", fullLabel: "右翼手 (RF)", code: "RF" },
  外野: { category: "外野手", shortLabel: "外野手", fullLabel: "外野手 (OUTFIELDER)", code: "OF" },
  外野手: { category: "外野手", shortLabel: "外野手", fullLabel: "外野手 (OUTFIELDER)", code: "OF" },

  DH: { category: "DH", shortLabel: "指名打者", fullLabel: "指名打者 (DH)", code: "DH" },
  指名打者: { category: "DH", shortLabel: "指名打者", fullLabel: "指名打者 (DH)", code: "DH" },
};

function resolvePositionMeta(rawPos: string | null | undefined): PositionMeta {
  if (!rawPos) {
    return { category: "未設定", shortLabel: "選手", fullLabel: "ポジション未設定", code: "ROSTER" };
  }
  const clean = rawPos.trim();
  const exact = POSITION_MAP[clean] || POSITION_MAP[clean.toUpperCase()];
  if (exact) return exact;

  if (clean.includes("投")) return POSITION_MAP.P;
  if (clean.includes("捕")) return POSITION_MAP.C;
  if (clean.includes("一") || clean.includes("二") || clean.includes("三") || clean.includes("遊") || clean.includes("内")) {
    return { category: "内野手", shortLabel: clean, fullLabel: clean, code: "IF" };
  }
  if (clean.includes("左") || clean.includes("中") || clean.includes("右") || clean.includes("外")) {
    return { category: "外野手", shortLabel: clean, fullLabel: clean, code: "OF" };
  }

  return { category: "未設定", shortLabel: clean, fullLabel: clean, code: "ROSTER" };
}

interface CategoryStyleDef {
  stageBg: string;
  pillSolid: string;
  pillSoft: string;
  barSolid: string;
  dot: string;
  filterActive: string;
  ring: string;
}

const CATEGORY_STYLES: Record<RosterCategory, CategoryStyleDef> = {
  投手: {
    stageBg: "bg-gradient-to-br from-slate-900 via-sky-950 to-blue-900",
    pillSolid: "bg-sky-500 text-white",
    pillSoft: "bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/30",
    barSolid: "bg-sky-500",
    dot: "bg-sky-400",
    filterActive: "bg-sky-600 text-white border-sky-600 shadow-xs",
    ring: "ring-sky-400/60",
  },
  捕手: {
    stageBg: "bg-gradient-to-br from-slate-900 via-orange-950 to-rose-950",
    pillSolid: "bg-orange-500 text-white",
    pillSoft: "bg-orange-500/12 text-orange-700 dark:text-orange-300 border-orange-500/30",
    barSolid: "bg-orange-500",
    dot: "bg-orange-400",
    filterActive: "bg-orange-600 text-white border-orange-600 shadow-xs",
    ring: "ring-orange-400/60",
  },
  内野手: {
    stageBg: "bg-gradient-to-br from-slate-900 via-emerald-950 to-teal-950",
    pillSolid: "bg-emerald-500 text-white",
    pillSoft: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    barSolid: "bg-emerald-500",
    dot: "bg-emerald-400",
    filterActive: "bg-emerald-600 text-white border-emerald-600 shadow-xs",
    ring: "ring-emerald-400/60",
  },
  外野手: {
    stageBg: "bg-gradient-to-br from-slate-900 via-amber-950 to-yellow-950",
    pillSolid: "bg-amber-500 text-slate-950",
    pillSoft: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30",
    barSolid: "bg-amber-500",
    dot: "bg-amber-400",
    filterActive: "bg-amber-500 text-slate-950 border-amber-500 shadow-xs",
    ring: "ring-amber-400/60",
  },
  DH: {
    stageBg: "bg-gradient-to-br from-slate-900 via-purple-950 to-indigo-950",
    pillSolid: "bg-purple-500 text-white",
    pillSoft: "bg-purple-500/12 text-purple-700 dark:text-purple-300 border-purple-500/30",
    barSolid: "bg-purple-500",
    dot: "bg-purple-400",
    filterActive: "bg-purple-600 text-white border-purple-600 shadow-xs",
    ring: "ring-purple-400/60",
  },
  未設定: {
    stageBg: "bg-gradient-to-br from-slate-900 via-slate-800 to-zinc-900",
    pillSolid: "bg-slate-600 text-white",
    pillSoft: "bg-muted text-muted-foreground border-border",
    barSolid: "bg-slate-500",
    dot: "bg-slate-400",
    filterActive: "bg-slate-700 text-white border-slate-700 shadow-xs",
    ring: "ring-slate-400/50",
  },
};

function formatThrowsBats(throws: string | null, bats: string | null): string | null {
  const t = throws === "R" ? "右投" : throws === "L" ? "左投" : throws || "";
  const b =
    bats === "R"
      ? "右打"
      : bats === "L"
      ? "左打"
      : bats === "B"
      ? "両打"
      : bats || "";
  const joined = `${t}${b}`.trim();
  return joined || null;
}

function cleanUniformNumber(raw: string | null | undefined): string {
  if (!raw) return "--";
  const c = raw.trim().replace(/^#/, "");
  return c || "--";
}

export default function LiffPlayersDirectoryPage() {
  const { currentTeam, isDemo: providerDemo } = useLiff();

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [teamInfo, setTeamInfo] = useState<DirectoryTeamInfo | null>(null);
  const [players, setPlayers] = useState<DirectoryPlayer[]>([]);

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedCategory, setSelectedCategory] = useState<FilterCategory>("すべて");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  // 背景コンテキスト（選択チーム）変更時にオーバーレイを自動リセット（規約遵守）
  useEffect(() => {
    setSelectedPlayerId(null);
  }, [currentTeam?.id]);

  const loadPlayers = useCallback(async () => {
    setIsLoading(true);
    try {
      const tid =
        currentTeam?.id ||
        (typeof window !== "undefined" ? localStorage.getItem("iscore_selectedTeamId") : "") ||
        "demo-team";
      const res = await fetch(`/api/liff/players?teamId=${encodeURIComponent(tid)}`);
      if (res.ok) {
        const data = (await res.json()) as PlayersDirectoryResponse;
        if (data.success) {
          setIsDemoMode(Boolean(data.isDemo));
          setTeamInfo(data.team || null);
          setPlayers(data.players || []);
        }
      }
    } catch (err) {
      console.error("Failed to fetch players directory:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentTeam?.id]);

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  // カテゴリ別カウント
  const categoryCounts = useMemo(() => {
    const counts: Record<RosterCategory, number> = {
      投手: 0,
      捕手: 0,
      内野手: 0,
      外野手: 0,
      DH: 0,
      未設定: 0,
    };
    for (const p of players) {
      const meta = resolvePositionMeta(p.primaryPosition);
      counts[meta.category] += 1;
    }
    return counts;
  }, [players]);

  // 表示するフィルタチップ一覧
  const filterTabs = useMemo(() => {
    const base: FilterCategory[] = ["すべて", "投手", "捕手", "内野手", "外野手"];
    if (categoryCounts.DH > 0) base.push("DH");
    if (categoryCounts.未設定 > 0) base.push("未設定");
    return base;
  }, [categoryCounts]);

  // 絞り込み済み選手リスト
  const filteredPlayers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return players.filter((p) => {
      const meta = resolvePositionMeta(p.primaryPosition);
      if (selectedCategory !== "すべて" && meta.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      const num = cleanUniformNumber(p.uniformNumber).toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.nameKana || "").toLowerCase().includes(q) ||
        num.includes(q) ||
        meta.shortLabel.toLowerCase().includes(q)
      );
    });
  }, [players, selectedCategory, searchQuery]);

  // 詳細モーダル対象の選手 & 前後インデックス
  const selectedIndex = useMemo(() => {
    if (!selectedPlayerId) return -1;
    return filteredPlayers.findIndex((p) => p.id === selectedPlayerId);
  }, [filteredPlayers, selectedPlayerId]);

  const selectedPlayer = selectedIndex >= 0 ? filteredPlayers[selectedIndex] : null;
  const prevPlayer = selectedIndex > 0 ? filteredPlayers[selectedIndex - 1] : null;
  const nextPlayer =
    selectedIndex >= 0 && selectedIndex < filteredPlayers.length - 1
      ? filteredPlayers[selectedIndex + 1]
      : null;

  const teamHeadline = teamInfo?.orgName || currentTeam?.orgName || currentTeam?.name || "チーム";
  const teamSubname = teamInfo?.teamName || currentTeam?.teamName || "";
  const seasonYear = teamInfo?.year || 2026;

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader
        shareData={{
          title: `【選手名鑑】${teamHeadline} (${players.length}名)`,
          text: `${seasonYear}年度 オフィシャル選手名鑑・背番号一覧をチェック！`,
        }}
      />

      <div className="p-4 space-y-4 max-w-lg mx-auto w-full">
        <LiffPageHeader
          title="選手名鑑"
          subtitle={`${seasonYear} OFFICIAL ROSTER`}
          icon={
            <span className="w-8 h-8 rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 flex items-center justify-center font-black">
              <IdCard className="w-4.5 h-4.5" />
            </span>
          }
          showBack
          shareData={{
            title: `【選手名鑑】${teamHeadline} (${players.length}名)`,
            text: `${seasonYear}年度 オフィシャル選手名鑑・背番号一覧をチェック！`,
          }}
        />

        {/* ━━━ 🏟️ スタジアム風ロースターヒーローバナー ━━━ */}
        <section className="relative overflow-hidden rounded-3xl bg-slate-900 text-white border border-slate-800 p-4 shadow-md space-y-3.5">
          {/* アスレチック斜線 & ダイヤモンド装飾 */}
          <svg
            aria-hidden="true"
            viewBox="0 0 160 160"
            className="pointer-events-none absolute -right-6 -top-6 w-40 h-40 text-white/[0.05]"
            fill="none"
          >
            <rect
              x="80"
              y="14"
              width="92"
              height="92"
              rx="10"
              transform="rotate(45 80 14)"
              stroke="currentColor"
              strokeWidth="8"
            />
            <circle cx="80" cy="80" r="16" stroke="currentColor" strokeWidth="6" />
          </svg>

          <div className="relative z-10 flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded-full bg-cyan-400/20 text-cyan-300 border border-cyan-400/30 text-[10px] font-black tracking-widest uppercase">
                  {seasonYear} ROSTER
                </span>
                {(isDemoMode || providerDemo) && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[10px] font-black">
                    DEMO
                  </span>
                )}
              </div>

              <h2 className="text-lg sm:text-xl font-black tracking-tight text-white truncate">
                {teamHeadline}
              </h2>

              <div className="flex items-center gap-2 text-[11px] font-bold text-slate-300 flex-wrap">
                {teamSubname && teamSubname !== teamHeadline && <span>{teamSubname}</span>}
                {teamInfo?.managerName && (
                  <span className="px-2 py-0.5 rounded-md bg-white/10 text-white text-[10px] font-bold">
                    監督: {teamInfo.managerName}
                  </span>
                )}
              </div>
            </div>

            <div className="shrink-0 text-right bg-white/10 border border-white/15 rounded-2xl px-3 py-2">
              <span className="text-[9.5px] font-bold text-slate-300 block uppercase tracking-wider">
                PLAYERS
              </span>
              <span className="text-2xl font-black italic tracking-tighter tabular-nums text-white leading-none">
                {players.length}
              </span>
            </div>
          </div>

          {/* ポジション別サマリーバー（タップで即絞り込み連動） */}
          <div className="relative z-10 grid grid-cols-4 gap-1.5 pt-1">
            {(["投手", "捕手", "内野手", "外野手"] as const).map((cat) => {
              const active = selectedCategory === cat;
              const st = CATEGORY_STYLES[cat];
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(active ? "すべて" : cat)}
                  className={`py-2 px-2 rounded-2xl border text-left transition-all active:scale-95 ${
                    active
                      ? "bg-white text-slate-950 border-white shadow-sm"
                      : "bg-slate-800/90 hover:bg-slate-800 border-slate-700/80 text-white"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${st.dot}`} />
                    <span
                      className={`text-[10px] font-black truncate ${
                        active ? "text-slate-700" : "text-slate-300"
                      }`}
                    >
                      {cat}
                    </span>
                  </div>
                  <p className="text-sm font-black tabular-nums mt-0.5 pl-3.5">
                    {categoryCounts[cat]}
                    <span
                      className={`text-[10px] font-bold ml-0.5 ${
                        active ? "text-slate-600" : "text-slate-400"
                      }`}
                    >
                      名
                    </span>
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* ━━━ 🔍 検索・表示切替・ポジションフィルタ ━━━ */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            {/* 検索ボックス */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="背番号・選手名で検索..."
                className="w-full pl-9 pr-8 py-2.5 rounded-2xl bg-card border border-border text-xs font-bold text-foreground shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-primary/40"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-muted-foreground hover:text-foreground"
                  aria-label="検索クリア"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* 表示モード切替（カード / リスト） */}
            <div className="flex items-center p-1 rounded-2xl bg-card border border-border shadow-2xs shrink-0">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`p-2 rounded-xl transition-all active:scale-95 flex items-center gap-1 text-xs ${
                  viewMode === "grid"
                    ? "bg-primary text-primary-foreground font-black shadow-2xs"
                    : "text-muted-foreground hover:text-foreground font-bold"
                }`}
                title="カード表示"
              >
                <LayoutGrid className="w-4 h-4" />
                <span className="hidden min-[390px]:inline text-[11px]">カード</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`p-2 rounded-xl transition-all active:scale-95 flex items-center gap-1 text-xs ${
                  viewMode === "list"
                    ? "bg-primary text-primary-foreground font-black shadow-2xs"
                    : "text-muted-foreground hover:text-foreground font-bold"
                }`}
                title="リスト表示"
              >
                <List className="w-4 h-4" />
                <span className="hidden min-[390px]:inline text-[11px]">リスト</span>
              </button>
            </div>
          </div>

          {/* ポジションカテゴリピル */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            {filterTabs.map((tab) => {
              const isSelected = selectedCategory === tab;
              const count = tab === "すべて" ? players.length : categoryCounts[tab];
              const activeClass =
                tab === "すべて"
                  ? "bg-primary text-primary-foreground border-primary shadow-xs"
                  : CATEGORY_STYLES[tab].filterActive;

              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setSelectedCategory(tab)}
                  className={`px-3 py-1.5 rounded-full border text-xs whitespace-nowrap transition-all active:scale-95 flex items-center gap-1.5 shrink-0 ${
                    isSelected
                      ? `${activeClass} font-black`
                      : "bg-card border-border text-muted-foreground hover:text-foreground font-bold"
                  }`}
                >
                  <span>{tab}</span>
                  <span
                    className={`text-[10px] tabular-nums px-1.5 py-0.2 rounded-full ${
                      isSelected ? "bg-black/15 text-current" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ━━━ ⚾ 選手一覧エリア ━━━ */}
        {isLoading ? (
          <div className="rounded-3xl bg-card border border-border p-12 flex flex-col items-center justify-center gap-2.5 shadow-sm">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
            <p className="text-xs font-bold text-muted-foreground">選手名鑑を読み込み中...</p>
          </div>
        ) : filteredPlayers.length === 0 ? (
          <EmptyState
            icon={Users}
            title={players.length === 0 ? "登録選手がいません" : "該当する選手がいません"}
            description={
              players.length === 0
                ? "ROSTER IS EMPTY"
                : "TRY ANOTHER FILTER OR KEYWORD"
            }
          />
        ) : viewMode === "grid" ? (
          /* 🎴 モダン・トレーディングカード 2列グリッド */
          <div className="grid grid-cols-2 gap-3">
            {filteredPlayers.map((player) => {
              const posMeta = resolvePositionMeta(player.primaryPosition);
              const style = CATEGORY_STYLES[posMeta.category];
              const numStr = cleanUniformNumber(player.uniformNumber);
              const tbLabel = formatThrowsBats(player.throws, player.bats);
              const initial = player.name.replace(/\s+/g, "").slice(0, 1) || "選";

              return (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => setSelectedPlayerId(player.id)}
                  className="group relative rounded-3xl bg-card border border-border/90 hover:border-primary/60 shadow-sm overflow-hidden text-left flex flex-col transition-all active:scale-[0.98] focus:outline-hidden"
                >
                  {/* 上部ビジュアルステージ */}
                  <div className={`relative h-28 w-full p-2.5 flex flex-col justify-between overflow-hidden ${style.stageBg}`}>
                    {/* 巨大ウォーターマーク背番号 */}
                    <span
                      aria-hidden="true"
                      className="pointer-events-none select-none absolute -right-1 -bottom-3 text-[64px] font-black italic tracking-tighter leading-none text-white/[0.13] tabular-nums group-hover:scale-105 transition-transform duration-300"
                    >
                      {numStr}
                    </span>

                    {/* 上段バッジ列: 背番号 + 主将マーク / 守備位置 */}
                    <div className="relative z-10 flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        <span className="px-2 py-0.5 rounded-lg bg-white text-slate-950 text-xs font-black italic tracking-tight tabular-nums shadow-xs">
                          #{numStr}
                        </span>
                        {player.isCaptain && (
                          <span className="px-1.5 py-0.5 rounded-lg bg-amber-400 text-amber-950 text-[10px] font-black flex items-center gap-0.5 shadow-xs">
                            <Crown className="w-2.5 h-2.5 fill-amber-950" />
                            <span>C</span>
                          </span>
                        )}
                      </div>

                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black shadow-2xs ${style.pillSolid}`}>
                        {posMeta.shortLabel}
                      </span>
                    </div>

                    {/* 下段: 選手フォト / アスレチックモノグラム */}
                    <div className="relative z-10 flex items-end justify-between">
                      <Avatar className={`h-12 w-12 border-2 border-white/90 shadow-md ring-2 ${style.ring}`}>
                        {player.profileImageUrl && (
                          <AvatarImage
                            src={player.profileImageUrl}
                            alt={player.name}
                            className="object-cover"
                          />
                        )}
                        <AvatarFallback className="bg-slate-800 text-white font-black text-base">
                          {initial}
                        </AvatarFallback>
                      </Avatar>

                      <span className="text-[10px] font-black tracking-widest text-white/75 uppercase">
                        {posMeta.code}
                      </span>
                    </div>
                  </div>

                  {/* 下部ソリッド情報エリア（屋外高コントラスト） */}
                  <div className="p-3 bg-card flex-1 flex flex-col justify-between space-y-2">
                    <div className="min-w-0">
                      <p className="text-[9.5px] font-bold text-muted-foreground tracking-wider truncate min-h-[14px]">
                        {player.nameKana || "PLAYER"}
                      </p>
                      <h3 className="text-sm sm:text-[15px] font-black text-foreground tracking-tight truncate leading-snug">
                        {player.name}
                      </h3>
                    </div>

                    <div className="space-y-1.5 pt-1 border-t border-border/60">
                      <div className="flex items-center justify-between gap-1 text-[10px] font-bold text-muted-foreground">
                        <span>{tbLabel || "投打未設定"}</span>
                        {player.height ? (
                          <span className="tabular-nums">
                            {player.height}cm{player.weight ? `/${player.weight}kg` : ""}
                          </span>
                        ) : player.subPositions.length > 0 ? (
                          <span className="truncate">
                            +{ resolvePositionMeta(player.subPositions[0]).shortLabel }
                          </span>
                        ) : null}
                      </div>

                      {/* ミニ成績ハイライトバー */}
                      {posMeta.category === "投手" && player.pitching ? (
                        <div className="px-2 py-1 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-between text-[10px]">
                          <span className="font-bold text-sky-700 dark:text-sky-300">
                            {player.pitching.inningsText}回
                          </span>
                          <span className="font-black text-foreground tabular-nums">
                            奪三振 {player.pitching.strikeouts}
                          </span>
                        </div>
                      ) : player.batting ? (
                        <div className="px-2 py-1 rounded-xl bg-primary/8 border border-primary/20 flex items-center justify-between text-[10px]">
                          <span className="font-bold text-muted-foreground">打率</span>
                          <span className="font-black text-primary tabular-nums">
                            {player.batting.avg}
                            <span className="text-muted-foreground font-bold ml-1">
                              ({player.batting.hits}安)
                            </span>
                          </span>
                        </div>
                      ) : (
                        <div className="px-2 py-1 rounded-xl bg-muted/60 flex items-center justify-between text-[10px] text-muted-foreground font-bold">
                          <span>詳細プロフィール</span>
                          <ChevronRight className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          /* 📋 リスト表示（1列コンパクト名鑑） */
          <div className="space-y-2">
            {filteredPlayers.map((player) => {
              const posMeta = resolvePositionMeta(player.primaryPosition);
              const style = CATEGORY_STYLES[posMeta.category];
              const numStr = cleanUniformNumber(player.uniformNumber);
              const tbLabel = formatThrowsBats(player.throws, player.bats);
              const initial = player.name.replace(/\s+/g, "").slice(0, 1) || "選";

              return (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => setSelectedPlayerId(player.id)}
                  className="w-full rounded-2xl bg-card border border-border/90 hover:border-primary/50 shadow-2xs overflow-hidden flex items-stretch text-left transition-all active:scale-[0.99]"
                >
                  {/* ポジションカラー縦アクセントバー */}
                  <div className={`w-1.5 shrink-0 ${style.barSolid}`} />

                  <div className="flex-1 p-3 flex items-center justify-between gap-3 min-w-0">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* 背番号ボックス */}
                      <div className="w-11 text-center shrink-0">
                        <span className="text-lg font-black italic tracking-tighter tabular-nums text-foreground leading-none block">
                          #{numStr}
                        </span>
                        <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">
                          {posMeta.code}
                        </span>
                      </div>

                      <Avatar className="h-10 w-10 border border-border shrink-0">
                        {player.profileImageUrl && (
                          <AvatarImage
                            src={player.profileImageUrl}
                            alt={player.name}
                            className="object-cover"
                          />
                        )}
                        <AvatarFallback className="bg-muted text-foreground font-black text-sm">
                          {initial}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-black text-foreground truncate">
                            {player.name}
                          </span>
                          {player.isCaptain && (
                            <span className="px-1.5 py-0.2 rounded-md bg-amber-400 text-amber-950 text-[9.5px] font-black flex items-center gap-0.5">
                              <Crown className="w-2.5 h-2.5 fill-amber-950" />
                              <span>主将</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span
                            className={`px-2 py-0.2 rounded-full border text-[10px] font-black ${style.pillSoft}`}
                          >
                            {posMeta.shortLabel}
                          </span>
                          {tbLabel && (
                            <span className="text-[11px] font-bold text-muted-foreground">
                              {tbLabel}
                            </span>
                          )}
                          {player.height && (
                            <span className="text-[11px] font-bold text-muted-foreground tabular-nums">
                              {player.height}cm
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {posMeta.category === "投手" && player.pitching ? (
                        <div className="text-right">
                          <span className="text-[9.5px] font-bold text-muted-foreground block">
                            奪三振
                          </span>
                          <span className="text-xs font-black text-sky-600 dark:text-sky-400 tabular-nums">
                            {player.pitching.strikeouts}
                          </span>
                        </div>
                      ) : player.batting ? (
                        <div className="text-right">
                          <span className="text-[9.5px] font-bold text-muted-foreground block">
                            打率
                          </span>
                          <span className="text-xs font-black text-primary tabular-nums">
                            {player.batting.avg}
                          </span>
                        </div>
                      ) : null}
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="h-8 w-full shrink-0" aria-hidden="true" />
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          🌟 選手詳細スポットライトカード（モーダルシート）
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {selectedPlayer && (() => {
        const posMeta = resolvePositionMeta(selectedPlayer.primaryPosition);
        const style = CATEGORY_STYLES[posMeta.category];
        const numStr = cleanUniformNumber(selectedPlayer.uniformNumber);
        const tbLabel = formatThrowsBats(selectedPlayer.throws, selectedPlayer.bats) || "未設定";
        const initial = selectedPlayer.name.replace(/\s+/g, "").slice(0, 1) || "選";
        const subLabels = selectedPlayer.subPositions
          .map((sp) => resolvePositionMeta(sp).shortLabel)
          .filter(Boolean);

        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 p-0 sm:p-4 animate-in fade-in duration-150">
            {/* 背景タップで明示的クローズ */}
            <div
              className="absolute inset-0"
              onClick={() => setSelectedPlayerId(null)}
            />

            <div className="relative z-10 w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-card border border-border shadow-2xl overflow-hidden max-h-[88vh] flex flex-col animate-in slide-in-from-bottom duration-200">
              {/* 選手カードヒーローヘッダー */}
              <div className={`relative p-5 text-white overflow-hidden shrink-0 ${style.stageBg}`}>
                <span
                  aria-hidden="true"
                  className="pointer-events-none select-none absolute right-2 -bottom-5 text-[108px] font-black italic tracking-tighter leading-none text-white/[0.12] tabular-nums"
                >
                  {numStr}
                </span>

                {/* 上部バー: 前後の選手クイック切替ピル & 閉じるボタン */}
                <div className="relative z-10 flex items-center justify-between mb-4">
                  <div className="inline-flex items-center rounded-full bg-white/15 border border-white/20 p-0.5">
                    <button
                      type="button"
                      disabled={!prevPlayer}
                      onClick={() => prevPlayer && setSelectedPlayerId(prevPlayer.id)}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white disabled:opacity-30 hover:bg-white/15 active:scale-90 transition-all"
                      aria-label="前の選手"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="px-2 text-[11px] font-black tabular-nums text-white/95">
                      {selectedIndex + 1}/{filteredPlayers.length}
                    </span>
                    <button
                      type="button"
                      disabled={!nextPlayer}
                      onClick={() => nextPlayer && setSelectedPlayerId(nextPlayer.id)}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white disabled:opacity-30 hover:bg-white/15 active:scale-90 transition-all"
                      aria-label="次の選手"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedPlayerId(null)}
                    className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center active:scale-90 transition-all"
                    aria-label="閉じる"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* 選手メインプロフィール */}
                <div className="relative z-10 flex items-center gap-4">
                  <Avatar className={`h-18 w-18 border-3 border-white shadow-lg ring-4 ${style.ring} shrink-0`}>
                    {selectedPlayer.profileImageUrl && (
                      <AvatarImage
                        src={selectedPlayer.profileImageUrl}
                        alt={selectedPlayer.name}
                        className="object-cover"
                      />
                    )}
                    <AvatarFallback className="bg-slate-800 text-white font-black text-2xl">
                      {initial}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-lg bg-white text-slate-950 text-xs font-black italic tabular-nums">
                        #{numStr}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black ${style.pillSolid}`}>
                        {posMeta.shortLabel}
                      </span>
                      {selectedPlayer.isCaptain && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 text-[10px] font-black flex items-center gap-1">
                          <Crown className="w-3 h-3 fill-amber-950" />
                          <span>CAPTAIN</span>
                        </span>
                      )}
                    </div>

                    {selectedPlayer.nameKana && (
                      <p className="text-[10px] font-bold text-white/75 tracking-widest">
                        {selectedPlayer.nameKana}
                      </p>
                    )}
                    <h3 className="text-xl font-black tracking-tight text-white truncate">
                      {selectedPlayer.name}
                    </h3>
                  </div>
                </div>
              </div>

              {/* スクロール可能な詳細ボディ */}
              <div className="p-4 space-y-4 overflow-y-auto">
                {/* 基本スペック 4グリッド */}
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="p-2.5 rounded-2xl bg-muted/60 border border-border/70">
                    <span className="text-[9.5px] font-bold text-muted-foreground block">背番号</span>
                    <span className="text-sm font-black text-foreground tabular-nums mt-0.5 block">
                      #{numStr}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-muted/60 border border-border/70">
                    <span className="text-[9.5px] font-bold text-muted-foreground block">守備</span>
                    <span className="text-xs font-black text-foreground mt-0.5 block truncate">
                      {posMeta.shortLabel}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-muted/60 border border-border/70">
                    <span className="text-[9.5px] font-bold text-muted-foreground block">投打</span>
                    <span className="text-xs font-black text-foreground mt-0.5 block">
                      {tbLabel}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-muted/60 border border-border/70">
                    <span className="text-[9.5px] font-bold text-muted-foreground block">体格</span>
                    <span className="text-[11px] font-black text-foreground tabular-nums mt-0.5 block">
                      {selectedPlayer.height
                        ? `${selectedPlayer.height}cm`
                        : "--"}
                    </span>
                  </div>
                </div>

                {/* サブポジション表記 */}
                {subLabels.length > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-muted/40 border border-border/60 text-xs">
                    <span className="font-bold text-muted-foreground shrink-0">サブ守備位置:</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {subLabels.map((lbl, idx) => (
                        <span
                          key={`${lbl}-${idx}`}
                          className="px-2 py-0.5 rounded-lg bg-card border border-border text-[11px] font-black text-foreground"
                        >
                          {lbl}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 選手紹介メモ */}
                {selectedPlayer.notes && (
                  <div className="p-3.5 rounded-2xl bg-primary/6 border border-primary/20 space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-black text-primary">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>PLAYER NOTE</span>
                    </div>
                    <p className="text-xs font-bold text-foreground leading-relaxed">
                      {selectedPlayer.notes}
                    </p>
                  </div>
                )}

                {/* 今シーズン打撃成績 */}
                {selectedPlayer.batting && (
                  <div className="rounded-2xl bg-background border border-border p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                        <Flame className="w-3.5 h-3.5 text-rose-500" />
                        <span>今シーズン打撃成績</span>
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
                        {selectedPlayer.batting.pa}打席
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="p-2 rounded-xl bg-card border border-border">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">打率</span>
                        <span className="text-sm font-black text-primary tabular-nums">
                          {selectedPlayer.batting.avg}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-card border border-border">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">安打</span>
                        <span className="text-sm font-black text-foreground tabular-nums">
                          {selectedPlayer.batting.hits}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-card border border-border">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">本塁打</span>
                        <span className="text-sm font-black text-foreground tabular-nums">
                          {selectedPlayer.batting.hr}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-card border border-border">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">四死球</span>
                        <span className="text-sm font-black text-foreground tabular-nums">
                          {selectedPlayer.batting.walks}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 今シーズン投手成績 */}
                {selectedPlayer.pitching && (
                  <div className="rounded-2xl bg-background border border-border p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-sky-500" />
                        <span>今シーズン投手成績</span>
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
                        対戦 {selectedPlayer.pitching.battersFaced}打者
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="p-2 rounded-xl bg-card border border-border">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">投球回</span>
                        <span className="text-sm font-black text-sky-600 dark:text-sky-400 tabular-nums">
                          {selectedPlayer.pitching.inningsText}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-card border border-border">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">奪三振</span>
                        <span className="text-sm font-black text-foreground tabular-nums">
                          {selectedPlayer.pitching.strikeouts}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-card border border-border">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">被安打</span>
                        <span className="text-sm font-black text-foreground tabular-nums">
                          {selectedPlayer.pitching.hitsAllowed}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-card border border-border">
                        <span className="text-[9.5px] font-bold text-muted-foreground block">四死球</span>
                        <span className="text-sm font-black text-foreground tabular-nums">
                          {selectedPlayer.pitching.walks}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* チーム成績ページ導線 */}
                <Link
                  href="/liff/stats"
                  onClick={() => setSelectedPlayerId(null)}
                  className="w-full py-2.5 px-4 rounded-2xl bg-muted hover:bg-muted/80 border border-border text-xs font-black text-foreground transition-all flex items-center justify-center gap-2"
                >
                  <Trophy className="w-3.5 h-3.5 text-amber-500" />
                  <span>チーム成績・ランキングを見る</span>
                </Link>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

