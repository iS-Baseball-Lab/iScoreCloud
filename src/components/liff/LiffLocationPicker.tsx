// filepath: src/components/liff/LiffLocationPicker.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Building2,
  Check,
  ChevronDown,
  Dumbbell,
  ExternalLink,
  Home,
  MapPin,
  PenLine,
  School,
  Search,
  Trophy,
  X,
} from "lucide-react";
import { peekLiffApiCache } from "@/lib/liff/api-cache";
import { cn } from "@/lib/utils";

export interface LiffGroundItem {
  id: string;
  name: string;
  shortName?: string | null;
  category?: string;
  categoryLabel?: string;
  address?: string;
  mapUrl?: string;
  surface?: string;
  spikeRule?: string;
  parkingInfo?: string;
  notes?: string;
}

export function getGroundDisplayLabel(v: Pick<LiffGroundItem, "name" | "shortName">): string {
  return v.shortName && v.shortName.trim() ? v.shortName.trim() : v.name.trim();
}

export function useTeamGrounds(teamId?: string | null) {
  const resolvedTeamId = useMemo(() => {
    if (teamId) return teamId;
    if (typeof window !== "undefined") {
      return localStorage.getItem("iscore_selectedTeamId") || "demo-team";
    }
    return "demo-team";
  }, [teamId]);

  const initialCached = useMemo(() => {
    if (typeof window === "undefined") return null;
    return peekLiffApiCache<{ success: boolean; venues?: LiffGroundItem[] }>(
      `/api/liff/grounds?teamId=${resolvedTeamId}`
    );
  }, [resolvedTeamId]);

  const [grounds, setGrounds] = useState<LiffGroundItem[]>(
    () => initialCached?.venues ?? []
  );

  const reloadGrounds = useCallback(async () => {
    try {
      const url = `/api/liff/grounds?teamId=${encodeURIComponent(resolvedTeamId)}`;
      const cached = peekLiffApiCache<{ success: boolean; venues?: LiffGroundItem[] }>(url);
      if (cached?.venues && cached.venues.length > 0) {
        setGrounds(cached.venues);
      }
      const res = await fetch(url);
      if (res.ok) {
        const json = (await res.json()) as { success: boolean; venues?: LiffGroundItem[] };
        if (json.success && Array.isArray(json.venues)) {
          setGrounds(json.venues);
        }
      }
    } catch (err) {
      console.error("Failed to load team grounds:", err);
    }
  }, [resolvedTeamId]);

  useEffect(() => {
    void reloadGrounds();
  }, [reloadGrounds]);

  return { grounds, reloadGrounds };
}

const CATEGORY_TABS = [
  { id: "all", label: "すべて", icon: Building2 },
  { id: "home", label: "本拠地", icon: Home },
  { id: "stadium", label: "球場・公営", icon: Trophy },
  { id: "school", label: "学校・地域", icon: School },
  { id: "indoor", label: "室内", icon: Dumbbell },
] as const;

const STATUS_PRESETS = ["確認中", "未定", "現地調整"] as const;

export interface LiffLocationPickerProps {
  value: string;
  onChange: (nextLocation: string) => void;
  grounds: ReadonlyArray<LiffGroundItem>;
  recentLocations?: ReadonlyArray<string>;
  sameAsAmLocation?: string;
  title?: string;
  placeholder?: string;
  size?: "xs" | "sm" | "md";
  showQuickChips?: boolean;
  className?: string;
}

export function LiffLocationPicker({
  value,
  onChange,
  grounds,
  recentLocations = [],
  sameAsAmLocation,
  title = "球場・活動場所を選択",
  placeholder = "一覧から場所を選択",
  size = "sm",
  showQuickChips = false,
  className,
}: LiffLocationPickerProps) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [customInput, setCustomInput] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setCustomInput(value || "");
      setSearchQuery("");
      setSelectedCategory("all");
    }
  }, [open, value]);

  const filteredGrounds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return grounds.filter((g) => {
      if (selectedCategory !== "all" && (g.category || "stadium") !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      const hay = `${g.name} ${g.shortName || ""} ${g.address || ""} ${g.categoryLabel || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [grounds, selectedCategory, searchQuery]);

  const extraRecentLocations = useMemo(() => {
    const knownSet = new Set<string>(STATUS_PRESETS);
    for (const g of grounds) {
      knownSet.add(g.name.trim());
      if (g.shortName?.trim()) knownSet.add(g.shortName.trim());
    }
    const q = searchQuery.trim().toLowerCase();
    const out: string[] = [];
    for (const loc of recentLocations) {
      const trimmed = loc.trim();
      if (!trimmed || knownSet.has(trimmed)) continue;
      if (q && !trimmed.toLowerCase().includes(q)) continue;
      knownSet.add(trimmed);
      out.push(trimmed);
    }
    return out;
  }, [grounds, recentLocations, searchQuery]);

  const handlePick = (loc: string) => {
    onChange(loc);
    setOpen(false);
  };

  const sizeClass =
    size === "xs"
      ? "min-h-[28px] px-2 py-0.5 rounded-lg text-[10.5px]"
      : size === "sm"
      ? "min-h-[36px] px-2.5 py-1.5 rounded-xl text-xs"
      : "min-h-[42px] px-3 py-2 rounded-xl text-xs";

  return (
    <div className={cn("space-y-1.5", className)}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "w-full flex items-center justify-between gap-1.5 border border-border bg-card hover:border-teal-500/50 hover:bg-muted/35 active:scale-[0.99] transition-all text-left shadow-2xs cursor-pointer",
          sizeClass
        )}
      >
        <span className="flex items-center gap-1.5 min-w-0 flex-1">
          <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
          <span
            className={cn(
              "truncate",
              value ? "font-black text-foreground" : "font-bold text-muted-foreground"
            )}
          >
            {value || placeholder}
          </span>
        </span>
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-teal-500/12 text-teal-700 dark:text-teal-300 border border-teal-500/25 text-[9.5px] font-black shrink-0 leading-none">
          <span>一覧</span>
          <ChevronDown className="w-2.5 h-2.5" />
        </span>
      </button>

      {showQuickChips && (
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pt-0.5">
          <span className="text-[9.5px] font-bold text-muted-foreground shrink-0">候補:</span>
          {sameAsAmLocation && sameAsAmLocation !== value && (
            <button
              type="button"
              onClick={() => onChange(sameAsAmLocation)}
              className="px-2 py-0.5 rounded-md text-[9.5px] font-black bg-teal-500/12 border border-teal-500/30 text-teal-700 dark:text-teal-300 shrink-0 cursor-pointer active:scale-95"
            >
              ☀️ 午前と同じ ({sameAsAmLocation})
            </button>
          )}
          <button
            type="button"
            onClick={() => onChange("確認中")}
            className={cn(
              "px-2 py-0.5 rounded-md text-[9.5px] font-black border shrink-0 cursor-pointer active:scale-95",
              value === "確認中"
                ? "bg-amber-500/15 border-amber-500/40 text-amber-800 dark:text-amber-300"
                : "bg-card border-border text-muted-foreground hover:text-foreground"
            )}
          >
            確認中
          </button>
          {grounds.slice(0, 6).map((g) => {
            const label = getGroundDisplayLabel(g);
            const active = value === label || value === g.name;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => onChange(label)}
                className={cn(
                  "px-2 py-0.5 rounded-md text-[9.5px] font-black border shrink-0 cursor-pointer active:scale-95",
                  active
                    ? "bg-teal-500/15 border-teal-500/40 text-teal-700 dark:text-teal-300"
                    : "bg-card border-border text-muted-foreground hover:text-foreground"
                )}
              >
                🏟️ {label}
              </button>
            );
          })}
        </div>
      )}

      {mounted &&
        open &&
        createPortal(
          <div
            className="fixed inset-0 z-[10200] bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
            onClick={() => setOpen(false)}
          >
            <div
              className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden max-h-[88dvh] flex flex-col animate-in slide-in-from-bottom-4 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* A-3 上帯ダークキャップ */}
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 px-4 py-3 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-7 h-7 rounded-lg bg-teal-500/20 text-teal-300 border border-teal-400/30 flex items-center justify-center shrink-0">
                    <MapPin className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-white truncate">{title}</h3>
                    <p className="text-[10px] font-bold text-slate-300 truncate">
                      登録済みグラウンド一覧・過去の場所・自由入力に対応
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white flex items-center justify-center shrink-0 active:scale-95 transition-all cursor-pointer"
                  aria-label="閉じる"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 検索 ＆ カテゴリ絞り込み */}
              <div className="p-3 bg-card border-b border-border space-y-2 shrink-0">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/40 border border-border focus-within:border-teal-500">
                  <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="球場名・略称・住所で検索..."
                    className="w-full bg-transparent text-xs font-bold text-foreground placeholder:text-muted-foreground focus:outline-hidden"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
                  {CATEGORY_TABS.map((cat) => {
                    const Icon = cat.icon;
                    const isSel = selectedCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategory(cat.id)}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-[11px] font-black border flex items-center gap-1 shrink-0 transition-all cursor-pointer active:scale-95",
                          isSel
                            ? "bg-[#0f172a] text-white border-[#0f172a]"
                            : "bg-card text-muted-foreground border-border hover:text-foreground"
                        )}
                      >
                        <Icon className="w-3 h-3" />
                        <span>{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 一覧リスト本体 */}
              <div className="p-3 overflow-y-auto space-y-3 bg-[#eef2f6] dark:bg-slate-900/60 flex-1">
                {/* 1. 定型ステータス・午前コピー */}
                <div className="space-y-1.5">
                  <div className="text-[10.5px] font-black text-muted-foreground px-1">
                    クイック指定
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {sameAsAmLocation && (
                      <button
                        type="button"
                        onClick={() => handlePick(sameAsAmLocation)}
                        className={cn(
                          "px-3 py-2 rounded-xl text-xs font-black border transition-all cursor-pointer active:scale-95",
                          value === sameAsAmLocation
                            ? "bg-card border-2 border-teal-600 text-teal-700 dark:text-teal-300 shadow-2xs"
                            : "bg-card border-border text-foreground hover:border-teal-500/40"
                        )}
                      >
                        ☀️ 午前と同じ（{sameAsAmLocation}）
                      </button>
                    )}
                    {STATUS_PRESETS.map((preset) => {
                      const isSel = value === preset;
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => handlePick(preset)}
                          className={cn(
                            "px-3 py-2 rounded-xl text-xs font-black border transition-all cursor-pointer active:scale-95",
                            isSel
                              ? "bg-card border-2 border-amber-500 text-amber-700 dark:text-amber-300 shadow-2xs"
                              : "bg-card border-border text-foreground hover:border-amber-500/40"
                          )}
                        >
                          {preset}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. 球場・グラウンドマスタ登録一覧 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[10.5px] font-black text-muted-foreground">
                      登録済みグラウンド・球場（{filteredGrounds.length}件）
                    </span>
                    <Link
                      href="/liff/grounds"
                      onClick={() => setOpen(false)}
                      className="text-[10.5px] font-black text-teal-700 dark:text-teal-300 hover:underline inline-flex items-center gap-0.5"
                    >
                      <span>球場マスタ管理</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </Link>
                  </div>

                  {filteredGrounds.length === 0 ? (
                    <div className="p-4 rounded-xl bg-card border border-border text-center">
                      <p className="text-xs font-bold text-muted-foreground">
                        条件に一致する登録グラウンドがありません
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {filteredGrounds.map((g) => {
                        const displayLabel = getGroundDisplayLabel(g);
                        const isSelected = value === displayLabel || value === g.name;
                        return (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => handlePick(displayLabel)}
                            className={cn(
                              "w-full p-3 rounded-xl text-left transition-all flex items-center justify-between gap-2.5 cursor-pointer",
                              isSelected
                                ? "bg-card border-2 border-teal-600 shadow-xs"
                                : "bg-card border border-border hover:border-teal-500/45 active:scale-[0.99]"
                            )}
                          >
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className={cn(
                                    "text-xs font-black",
                                    isSelected
                                      ? "text-teal-700 dark:text-teal-300"
                                      : "text-foreground"
                                  )}
                                >
                                  🏟️ {displayLabel}
                                </span>
                                {g.categoryLabel && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-slate-500/12 text-slate-700 dark:text-slate-300 border border-slate-500/25 text-[9.5px] font-black leading-none">
                                    {g.categoryLabel}
                                  </span>
                                )}
                              </div>
                              {g.shortName && g.shortName.trim() !== g.name.trim() && (
                                <p className="text-[10.5px] font-bold text-muted-foreground truncate">
                                  正式名称: {g.name}
                                </p>
                              )}
                              {(g.address || g.parkingInfo) && (
                                <p className="text-[10px] font-bold text-muted-foreground truncate">
                                  {g.address ? `📍 ${g.address}` : ""}
                                  {g.address && g.parkingInfo ? " / " : ""}
                                  {g.parkingInfo ? `🅿️ ${g.parkingInfo}` : ""}
                                </p>
                              )}
                            </div>

                            <span
                              className={cn(
                                "w-5 h-5 rounded-full flex items-center justify-center shrink-0 border",
                                isSelected
                                  ? "bg-teal-600 border-teal-600 text-white"
                                  : "border-border bg-muted/40 text-transparent"
                              )}
                            >
                              <Check className="w-3 h-3 stroke-[3]" />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 3. 最近の予定で使用した場所 */}
                {extraRecentLocations.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[10.5px] font-black text-muted-foreground px-1">
                      他の予定で使用されている場所
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {extraRecentLocations.map((loc) => {
                        const isSel = value === loc;
                        return (
                          <button
                            key={loc}
                            type="button"
                            onClick={() => handlePick(loc)}
                            className={cn(
                              "px-2.5 py-1.5 rounded-xl text-xs font-black border transition-all cursor-pointer active:scale-95",
                              isSel
                                ? "bg-card border-2 border-teal-600 text-teal-700 dark:text-teal-300"
                                : "bg-card border-border text-foreground hover:border-teal-500/40"
                            )}
                          >
                            📍 {loc}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 4. 一覧にない場所の自由入力 */}
                <div className="p-3 rounded-xl bg-card border border-border space-y-2">
                  <label className="text-[10.5px] font-black text-foreground flex items-center gap-1">
                    <PenLine className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                    <span>一覧にない場所・遠征先を直接入力</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={customInput}
                      onChange={(e) => setCustomInput(e.target.value)}
                      placeholder="例: 〇〇河川敷グラウンド A面"
                      className="flex-1 px-3 py-2 rounded-xl bg-muted/35 border border-border text-xs font-black text-foreground focus:outline-hidden focus:border-teal-600"
                    />
                    <button
                      type="button"
                      onClick={() => handlePick(customInput.trim())}
                      disabled={!customInput.trim()}
                      className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black shadow-2xs active:scale-95 transition-all disabled:opacity-45 shrink-0 cursor-pointer"
                    >
                      この場所で決定
                    </button>
                  </div>
                </div>
              </div>

              {/* フッター（Safe Area対応） */}
              <div className="px-4 py-2.5 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3 border-t border-border bg-card flex items-center justify-between shrink-0">
                {value ? (
                  <button
                    type="button"
                    onClick={() => handlePick("")}
                    className="px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-500/10 transition-all cursor-pointer"
                  >
                    場所をクリア
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 rounded-xl border border-border bg-card hover:bg-muted text-xs font-black text-muted-foreground hover:text-foreground active:scale-95 transition-all cursor-pointer"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
