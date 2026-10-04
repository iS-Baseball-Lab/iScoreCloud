// filepath: src/app/liff/grounds/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { useLiff } from "@/components/liff/LiffProvider";
import {
  MapPin,
  Navigation,
  Car,
  AlertTriangle,
  Info,
  ExternalLink,
  Loader2,
  Building2,
  Home,
  Trophy,
  School,
  Dumbbell,
  Search,
  X,
  Copy,
  Check,
  Compass,
} from "lucide-react";
import { toast } from "sonner";

interface VenueInfo {
  id: string;
  name: string;
  shortName: string;
  category?: string;
  categoryLabel?: string;
  address: string;
  mapUrl: string;
  surface: string;
  spikeRule: string;
  parkingInfo: string;
  notes: string;
}

const CATEGORIES = [
  { id: "all", label: "すべて", icon: Building2 },
  { id: "home", label: "本拠地・ホーム", icon: Home },
  { id: "stadium", label: "球場・公営", icon: Trophy },
  { id: "school", label: "学校・地域", icon: School },
  { id: "indoor", label: "室内・練習場", icon: Dumbbell },
] as const;

export default function LiffGroundsPage() {
  const { currentTeam } = useLiff();
  const [venues, setVenues] = useState<VenueInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadGrounds = useCallback(async () => {
    try {
      setIsLoading(true);
      const teamId = currentTeam?.id || "demo-team";
      const res = await fetch(`/api/liff/grounds?teamId=${teamId}`);
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; venues?: VenueInfo[] };
        if (data.venues && data.venues.length > 0) {
          setVenues(data.venues);
        }
      }
    } catch (err) {
      console.error("Failed to fetch grounds:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentTeam?.id]);

  useEffect(() => {
    loadGrounds();
  }, [loadGrounds]);

  // 住所のクリップボードコピー
  const handleCopyAddress = (id: string, address: string) => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopiedId(id);
    toast.success("住所をコピーしました");
    setTimeout(() => {
      setCopiedId((prev) => (prev === id ? null : prev));
    }, 2000);
  };

  // 各カテゴリの件数集計
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: venues.length };
    venues.forEach((v) => {
      const cat = v.category || "stadium";
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [venues]);

  // フィルタリング処理
  const filteredVenues = useMemo(() => {
    return venues.filter((venue) => {
      // 1. カテゴリ絞り込み
      if (selectedCategory !== "all") {
        const venueCat = venue.category || "stadium";
        if (venueCat !== selectedCategory) return false;
      }
      // 2. 検索キーワード絞り込み
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const target = `${venue.name} ${venue.shortName} ${venue.address} ${venue.surface} ${venue.parkingInfo} ${venue.notes}`.toLowerCase();
        if (!target.includes(q)) return false;
      }
      return true;
    });
  }, [venues, selectedCategory, searchQuery]);

  // カテゴリごとのバッジスタイル取得
  const getCategoryBadgeStyle = (category?: string) => {
    switch (category) {
      case "home":
        return {
          icon: Home,
          label: "本拠地・ホーム",
          className: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
        };
      case "stadium":
        return {
          icon: Trophy,
          label: "球場・公営",
          className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
        };
      case "school":
        return {
          icon: School,
          label: "学校・地域",
          className: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
        };
      case "indoor":
        return {
          icon: Dumbbell,
          label: "室内・練習場",
          className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
        };
      default:
        return {
          icon: Building2,
          label: "球場・施設",
          className: "bg-primary/10 text-primary border-primary/20",
        };
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <LiffHeader />

      <div className="p-4 space-y-4 max-w-lg mx-auto w-full">
        {/* ページ内ヘッダー */}
        <LiffPageHeader
          title="球場 & 施設"
          subtitle="グラウンド情報・アクセス・駐車場ルール"
          icon={
            <span className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black">
              <MapPin className="w-4 h-4" />
            </span>
          }
          showBack
          shareData={{
            title: `【球場 & 施設】チーム利用グラウンド・施設一覧`,
            text: `球場アクセス・駐車場ルール・スパイク指定の確認用です`,
          }}
        />

        {/* 🔍 検索バー */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="球場名・住所・ルールで検索..."
            className="w-full pl-9.5 pr-8 py-2.5 rounded-2xl bg-card border border-border text-xs placeholder:text-muted-foreground/70 focus:outline-hidden focus:ring-2 focus:ring-primary/40 transition-all shadow-2xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 🏷️ 分類（カテゴリ）タブフィルター */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isSelected = selectedCategory === cat.id;
            const count = categoryCounts[cat.id] || 0;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-xs scale-[1.02]"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{cat.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isSelected
                      ? "bg-white/20 text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* 🏟️ 球場 & 施設一覧 */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs font-bold">球場・施設情報を読み込み中...</span>
          </div>
        ) : filteredVenues.length === 0 ? (
          <div className="bg-card border border-border/80 rounded-3xl p-8 text-center space-y-3 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto text-muted-foreground">
              <MapPin className="w-6 h-6" />
            </div>
            <p className="text-sm font-black text-foreground">
              該当する球場・施設がありません
            </p>
            <p className="text-xs text-muted-foreground">
              条件を変更するか、キーワードをリセットしてお試しください。
            </p>
            {(selectedCategory !== "all" || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory("all");
                  setSearchQuery("");
                }}
                className="px-4 py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 text-xs font-black transition-colors"
              >
                すべての施設を表示
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3.5">
            {filteredVenues.map((venue) => {
              const catBadge = getCategoryBadgeStyle(venue.category);
              const CatIcon = catBadge.icon;
              const isCopied = copiedId === venue.id;

              return (
                <div
                  key={venue.id}
                  className="bg-card border border-border rounded-3xl p-4 shadow-xs space-y-3 transition-all hover:border-border/80"
                >
                  {/* ヘッダー: 分類バッジ・サーフェス・球場名 */}
                  <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-border/60">
                    <div className="space-y-1.5 min-w-0 flex-1">
                      {/* バッジ群（分類 & サーフェス） */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-black border flex items-center gap-1 ${catBadge.className}`}
                        >
                          <CatIcon className="w-3 h-3" />
                          <span>{venue.categoryLabel || catBadge.label}</span>
                        </span>

                        <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-[10px] font-black">
                          {venue.surface}
                        </span>
                      </div>

                      {/* 球場名 */}
                      <h3 className="text-sm sm:text-base font-black text-foreground leading-snug">
                        {venue.name}
                      </h3>

                      {/* 住所 ＆ コピーボタン */}
                      <div className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
                        <MapPin className="w-3 h-3 shrink-0 text-muted-foreground/80" />
                        <span className="truncate">{venue.address}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyAddress(venue.id, venue.address)}
                          className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                          title="住所をコピー"
                        >
                          {isCopied ? (
                            <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* ナビ・地図アクションボタン群 */}
                    <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 shrink-0">
                      <a
                        href={venue.mapUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-black shrink-0 active:scale-95 shadow-xs transition-all"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        <span>Map</span>
                      </a>
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                          venue.address || venue.name
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-black shrink-0 active:scale-95 transition-all"
                        title="ルート案内を開始"
                      >
                        <Compass className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">ルート</span>
                      </a>
                    </div>
                  </div>

                  {/* 🅿️ 駐車場情報 */}
                  <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 space-y-1 text-xs">
                    <div className="flex items-center gap-1.5 font-black text-blue-700 dark:text-blue-400 text-[11px]">
                      <Car className="w-3.5 h-3.5 shrink-0" />
                      <span>駐車場ルール & 台数</span>
                    </div>
                    <p className="text-foreground font-medium text-[11px] leading-relaxed">
                      {venue.parkingInfo || "駐車場ルールは管理者にお問い合わせください。"}
                    </p>
                  </div>

                  {/* ⚠️ スパイク規定 & ℹ️ 諸注意 */}
                  <div className="space-y-1.5 text-xs pt-0.5">
                    {venue.spikeRule && (
                      <div className="flex items-start gap-1.5 text-amber-600 dark:text-amber-400 font-bold">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span className="text-[11px] leading-relaxed">{venue.spikeRule}</span>
                      </div>
                    )}

                    {venue.notes && (
                      <div className="flex items-start gap-1.5 text-muted-foreground font-medium">
                        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span className="text-[11px] leading-relaxed">{venue.notes}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
