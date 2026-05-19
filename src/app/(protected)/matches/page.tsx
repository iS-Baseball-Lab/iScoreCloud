// src/app/(protected)/matches/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Swords, Loader2, ChevronRight, Calendar, Activity, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MatchList } from "@/components/matches/match-list";
import { toast } from "sonner";
import { Match, MatchStatus } from "@/types/match";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/layout/SectionHeader";

// ステータスを推論・補完する関数（古いデータ対応）
const getMatchStatus = (m: Match): MatchStatus => {
  if (m.status === "live") return "live";
  if (m.status === "finished") return "finished";
  
  // DBにステータスがない・不完全な場合のフォールバック
  const isFuture = new Date(m.date) > new Date();
  return isFuture ? "scheduled" : "finished";
};

export default function AllMatchesPage() {
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<MatchStatus>("scheduled");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const handleTabChange = (tab: MatchStatus) => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  useEffect(() => {
    const fetchMatches = async () => {
      try {
        const teamId = localStorage.getItem("iscore_selectedTeamId");
        if (!teamId) return;

        const res = await fetch(`/api/matches?teamId=${teamId}`);
        if (res.ok) {
          const data = await res.json();
          const loadedMatches = Array.isArray(data) ? (data as Match[]).sort((a, b) => b.date.localeCompare(a.date)) : [];
          setMatches(loadedMatches);

          if (loadedMatches.length > 0) {
            if (loadedMatches.some(m => getMatchStatus(m) === "live")) {
              setActiveTab("live");
            } else if (loadedMatches.some(m => getMatchStatus(m) === "scheduled")) {
              setActiveTab("scheduled");
            } else {
              setActiveTab("finished");
            }
          }
        }
      } catch (error) {
        toast.error("データの読み込みに失敗しました");
      } finally {
        setIsLoading(false);
      }
    };
    fetchMatches();
  }, []);

  // getMatchStatus is now outside the component

  const filteredMatches = matches
    .filter(m => getMatchStatus(m) === activeTab)
    .sort((a, b) => {
      if (activeTab === "scheduled") {
        // 予定の場合は昇順（近い未来から先に表示）
        return a.date.localeCompare(b.date);
      }
      // それ以外は降順（直近の過去から先に表示）
      return b.date.localeCompare(a.date);
    });
  const totalPages = Math.ceil(filteredMatches.length / itemsPerPage);
  const paginatedMatches = filteredMatches.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="min-h-screen bg-transparent p-4 sm:p-6 max-w-4xl mx-auto pb-24">
      {/* ━━ トップ：戻るボタン & SectionHeader ━━ */}
      <div className="space-y-4 mb-6">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => router.back()}
          className="h-10 px-4 rounded-[var(--radius-xl)] font-black gap-2 shadow-sm border-border bg-card text-foreground hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" />
          戻る
        </Button>
        <SectionHeader title="試合一覧" subtitle="MATCH HISTORY" showPulse={false} />
      </div>

      {/* 🌟 3つのステータス切り替えタブ */}
      <div className="flex bg-muted/30 p-1.5 rounded-3xl border border-border/40 shadow-inner mb-6">
        <button
          onClick={() => handleTabChange("scheduled")}
          className={cn(
            "flex-1 py-3 text-sm sm:text-base font-black rounded-2xl transition-all flex items-center justify-center gap-2",
            activeTab === "scheduled" ? "bg-amber-500 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Calendar className="w-4 h-4 sm:w-5 sm:h-5" /> 予定
        </button>
        <button
          onClick={() => handleTabChange("live")}
          className={cn(
            "flex-1 py-3 text-sm sm:text-base font-black rounded-2xl transition-all flex items-center justify-center gap-2",
            activeTab === "live" ? "bg-rose-500 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Activity className="w-4 h-4 sm:w-5 sm:h-5" /> 進行中
        </button>
        <button
          onClick={() => handleTabChange("finished")}
          className={cn(
            "flex-1 py-3 text-sm sm:text-base font-black rounded-2xl transition-all flex items-center justify-center gap-2",
            activeTab === "finished" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Trophy className="w-4 h-4 sm:w-5 sm:h-5" /> 終了
        </button>
      </div>

      <MatchList matches={paginatedMatches} isLoading={isLoading} />

      {/* 🌟 ページングナビゲーション（背景色付きのフラットデザイン） */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-8">
          <Button
            variant="outline"
            size="icon"
            className="rounded-full h-11 w-11 bg-primary/10 hover:bg-primary/20 border-primary/20 text-primary shadow-sm"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => p - 1)}
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <span className="text-sm font-black tabular-nums bg-white/50 dark:bg-zinc-800/50 backdrop-blur-sm px-4 py-2 rounded-full border border-border/50 shadow-sm">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full h-11 w-11 bg-primary/10 hover:bg-primary/20 border-primary/20 text-primary shadow-sm"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(p => p + 1)}
          >
            <ChevronRight className="h-6 w-6" />
          </Button>
        </div>
      )}
    </div>
  );
}