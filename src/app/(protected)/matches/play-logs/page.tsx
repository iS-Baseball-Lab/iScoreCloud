// filepath: src/app/(protected)/matches/play-logs/page.tsx
"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, History, Loader2, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { EmptyState } from "@/components/layout/EmptyState";
import { PlayLogCard, PlayLog, parseD1PlayLog } from "@/components/matches/PlayLogCard";
import { toast } from "sonner";

interface MatchOption {
  id: string;
  opponent: string;
  date: string;
}

function PlayLogsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlMatchId = searchParams.get("matchId") || searchParams.get("id");

  const [matches, setMatches] = useState<MatchOption[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>("");
  const [logs, setLogs] = useState<PlayLog[]>([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState(true);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // 1. Fetch matches for the selected team
  useEffect(() => {
    const fetchMatches = async () => {
      try {
        const teamId = typeof window !== "undefined" ? localStorage.getItem("iscore_selectedTeamId") : null;
        if (!teamId) {
          setIsLoadingMatches(false);
          return;
        }

        const res = await fetch(`/api/matches?teamId=${teamId}`);
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data.map((m: any) => ({
            id: m.id,
            opponent: m.opponent || "対戦相手不明",
            date: m.date ? m.date.split("T")[0] : "",
          })) : [];

          setMatches(list);

          // Select default match: query param or the latest match
          if (urlMatchId && list.some((m: any) => m.id === urlMatchId)) {
            setSelectedMatchId(urlMatchId);
          } else if (list.length > 0) {
            setSelectedMatchId(list[0].id);
          }
        }
      } catch (error) {
        console.error("Failed to fetch matches:", error);
        toast.error("試合一覧の読み込みに失敗しました");
      } finally {
        setIsLoadingMatches(false);
      }
    };

    fetchMatches();
  }, [urlMatchId]);

  // 2. Fetch play logs when selected match changes
  useEffect(() => {
    if (!selectedMatchId) {
      setLogs([]);
      return;
    }

    const fetchLogs = async () => {
      setIsLoadingLogs(true);
      try {
        const res = await fetch(`/api/matches/${selectedMatchId}/logs`);
        if (res.ok) {
          const data = (await res.json()) as { success: boolean; logs: any[] };
          if (data.success && Array.isArray(data.logs)) {
            const selectedMatch = matches.find((m) => m.id === selectedMatchId);
            const gameTitle = selectedMatch
              ? `${selectedMatch.date} vs ${selectedMatch.opponent}`
              : "試合";

            // Parse D1 log entries dynamically (supports EDH/DH batter order correctly)
            const parsed = data.logs.map((log: any) => {
              const playLog = parseD1PlayLog(log, gameTitle);
              playLog.gameId = selectedMatchId;
              return playLog;
            });
            setLogs(parsed);
          } else {
            setLogs([]);
          }
        } else {
          setLogs([]);
        }
      } catch (error) {
        console.error("Failed to fetch logs:", error);
        toast.error("プレイログの取得に失敗しました");
      } finally {
        setIsLoadingLogs(false);
      }
    };

    fetchLogs();
  }, [selectedMatchId, matches]);

  const handleMatchChange = (matchId: string) => {
    setSelectedMatchId(matchId);
    // Sync the URL parameter
    router.replace(`/matches/play-logs?matchId=${matchId}`);
  };

  const handleEdit = (id: string) => {
    router.push(`/matches/play-logs/edit?id=${id}`);
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/matches/logs/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        const data = (await res.json()) as { success: boolean };
        if (data.success) {
          setLogs((prev) => prev.filter((log) => log.id !== id));
          toast.success("プレイログを削除しました");
        } else {
          toast.error("プレイログの削除に失敗しました");
        }
      } else {
        toast.error("通信エラーが発生しました");
      }
    } catch (err) {
      console.error("Delete error:", err);
      toast.error("削除処理に失敗しました");
    }
  };

  if (isLoadingMatches) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28 animate-in fade-in duration-400">
      <div className="max-w-md mx-auto px-4 pt-6 space-y-6">
        
        {/* ━━ 戻るボタン & セクションヘッダー ━━ */}
        <div className="space-y-4">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => router.back()}
            className="h-10 px-4 rounded-[var(--radius-xl)] font-black gap-2 shadow-sm border-border bg-card text-foreground hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
            戻る
          </Button>
          <SectionHeader 
            title="プレイログ" 
            subtitle="PLAY LOGS" 
            showPulse={false} 
          />
        </div>

        {/* ━━ 試合選択ドロップダウン ━━ */}
        {matches.length > 0 && (
          <div className="space-y-2">
            <label className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest pl-1">表示対象の試合を選択</label>
            <div className="relative">
              <select
                value={selectedMatchId}
                onChange={(e) => handleMatchChange(e.target.value)}
                className="w-full h-12 bg-card border-2 border-border/40 rounded-2xl px-4 text-xs font-black focus:outline-none appearance-none cursor-pointer hover:bg-muted/50 transition-colors"
              >
                {matches.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.date} vs {m.opponent}
                  </option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                <Calendar className="w-4 h-4" />
              </div>
            </div>
          </div>
        )}

        {/* ━━ ログカードリスト ━━ */}
        <div className="grid grid-cols-1 gap-3">
          {isLoadingLogs ? (
            <div className="p-12 text-center flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider animate-pulse">Loading play logs...</span>
            </div>
          ) : logs.length === 0 ? (
            <EmptyState 
              icon={History} 
              title="プレイログがありません" 
              description={matches.length === 0 ? "チームの試合データを登録してください" : "選択した試合にはまだプレイログが記録されていません"} 
              className="mt-4"
            />
          ) : (
            logs.map((log) => (
              <PlayLogCard 
                key={log.id} 
                log={log} 
                onEdit={handleEdit} 
                onDelete={handleDelete} 
              />
            ))
          )}
        </div>

      </div>
    </div>
  );
}

export default function PlayLogsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    }>
      <PlayLogsContent />
    </Suspense>
  );
}
