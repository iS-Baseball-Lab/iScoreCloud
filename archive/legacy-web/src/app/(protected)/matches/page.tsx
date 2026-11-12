// src/app/(protected)/matches/page.tsx
"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2, Calendar, Activity, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MatchList } from "@/components/matches/match-list";
import { toast } from "sonner";
import { Match, MatchStatus } from "@/types/match";
import { SectionHeader } from "@/components/layout/SectionHeader";

// ステータスを推論・補完する関数（古いデータ対応）
const getMatchStatus = (m: Match): MatchStatus => {
  if (m.status === "live") return "live";
  if (m.status === "finished") return "finished";
  if (m.status === "rainout") return "rainout";
  
  // DBにステータスがない・不完全な場合のフォールバック
  const isFuture = new Date(m.date) > new Date();
  return isFuture ? "scheduled" : "finished";
};

export default function AllMatchesPage() {
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
        }
      } catch (error) {
        toast.error("データの読み込みに失敗しました");
      } finally {
        setIsLoading(false);
      }
    };
    fetchMatches();
  }, []);

  const handleDeleteMatch = (deletedId: string) => {
    setMatches(prev => prev.filter(m => m.id !== deletedId));
  };

  // 1. 進行中 (live) の試合: 降順 (直近が上)
  const liveMatches = useMemo(() => {
    return matches
      .filter(m => getMatchStatus(m) === "live")
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [matches]);

  // 2. 予定されている試合 (scheduled): 昇順 (近い未来から順に表示)
  const scheduledMatches = useMemo(() => {
    return matches
      .filter(m => getMatchStatus(m) === "scheduled")
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [matches]);

  // 3. 終了・中止した試合 (finished / rainout): 降順 (直近過去が上)
  const finishedMatches = useMemo(() => {
    return matches
      .filter(m => getMatchStatus(m) === "finished" || getMatchStatus(m) === "rainout")
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [matches]);

  const hasMatches = matches.length > 0;

  return (
    <div className="min-h-screen bg-transparent p-4 sm:p-6 max-w-4xl mx-auto pb-24">
      {/* ━━ トップ：戻るボタン & SectionHeader ━━ */}
      <div className="space-y-4 mb-8">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => router.back()}
          className="h-10 px-4 rounded-[var(--radius-xl)] font-black gap-2 shadow-sm border-border bg-card text-foreground hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" />
          戻る
        </Button>
        <SectionHeader title="試合一覧" subtitle="ALL MATCHES" showPulse={false} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin h-8 w-8 text-primary" />
        </div>
      ) : !hasMatches ? (
        <div className="text-center py-20 text-muted-foreground font-medium">
          登録されている試合はありません
        </div>
      ) : (
        <div className="space-y-12">
          {/* 1. 進行中の試合 */}
          {liveMatches.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-rose-500/10 pb-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600"></span>
                </span>
                <h3 className="text-xs font-black text-rose-600 dark:text-rose-400 tracking-widest uppercase flex items-center gap-1.5">
                  <Activity className="w-4 h-4" /> 進行中の試合
                </h3>
              </div>
              <MatchList matches={liveMatches} isLoading={isLoading} onDelete={handleDeleteMatch} />
            </div>
          )}

          {/* 2. 試合予定 */}
          {scheduledMatches.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-amber-500/10 pb-2">
                <h3 className="text-xs font-black text-amber-600 dark:text-amber-400 tracking-widest uppercase flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" /> 試合予定
                </h3>
              </div>
              <MatchList matches={scheduledMatches} isLoading={isLoading} onDelete={handleDeleteMatch} />
            </div>
          )}

          {/* 3. 試合結果 */}
          {finishedMatches.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-primary/10 pb-2">
                <h3 className="text-xs font-black text-primary tracking-widest uppercase flex items-center gap-1.5">
                  <Trophy className="w-4 h-4" /> 試合結果
                </h3>
              </div>
              <MatchList matches={finishedMatches} isLoading={isLoading} onDelete={handleDeleteMatch} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}