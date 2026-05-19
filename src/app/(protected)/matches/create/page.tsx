// filepath: src/app/(protected)/matches/create/page.tsx
"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CalendarPlus, PlayCircle, ClipboardList, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTeam } from "@/contexts/TeamContext";
import { toast } from "sonner";
import { MatchBasicForm } from "@/components/features/matches/match-basic-form";
import { QuickScoreForm } from "@/components/features/matches/match-score-board";
import { SectionHeader } from "@/components/layout/SectionHeader";

// ━━━ 型定義 ━━━
interface CreateMatchResponse {
  success: boolean;
  matchId?: string;
  error?: string;
}

function CreateMatchContent() {
  const router = useRouter();
  const { currentTeam } = useTeam();
  const searchParams = useSearchParams();
  const mode = (searchParams.get("mode") || "real") as "real" | "live" | "quick";

  const getPageInfo = () => {
    switch (mode) {
      case "live": return { ja: "試合記録開始", en: "START LIVE", icon: <PlayCircle className="h-5 w-5" />, btn: "スタメン登録へ進む" };
      case "quick": return { ja: "クイックスコア", en: "QUICK SCORE", icon: <ClipboardList className="h-5 w-5" />, btn: "スコアを保存" };
      default: return { ja: "試合予定作成", en: "NEW SCHEDULE", icon: <CalendarPlus className="h-5 w-5" />, btn: "予定を登録" };
    }
  };

  const pageInfo = getPageInfo();

  // 統合フォームステート
  const [formState, setFormState] = useState({
    opponent: "",
    date: new Date().toISOString().split("T")[0],
    time: "",
    venue: "",
    matchType: 'practice' as 'official' | 'practice',
    tournamentName: "",
    battingOrder: 'unknown' as 'unknown' | 'first' | 'second',
    benchSide: 'unknown' as 'unknown' | '1B' | '3B',
    inningCount: 7 as 6 | 7 | 9,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [isNewTournament, setIsNewTournament] = useState(false);

  // スコア用ステート (Quickモード専用)
  const [myScore, setMyScore] = useState("");
  const [opponentScore, setOpponentScore] = useState("");
  const [myInnings, setMyInnings] = useState<string[]>(Array(7).fill(""));
  const [opponentInnings, setOpponentInnings] = useState<string[]>(Array(7).fill(""));

  useEffect(() => {
    const fetchTournaments = async () => {
      try {
        const categoryParam = currentTeam?.organizationCategory ? `?category=${currentTeam.organizationCategory}` : '';
        const res = await fetch(`/api/tournaments${categoryParam}`);
        const data = await res.json();
        if (Array.isArray(data)) setTournaments(data as any[]);
      } catch (error) {
        console.error("Failed to fetch tournaments:", error);
      }
    };
    if (currentTeam !== undefined) {
      fetchTournaments();
    }
  }, [currentTeam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.opponent) { toast.error("対戦相手を入力してください"); return; }
    if (!currentTeam?.id) { toast.error("操作するチームを選択してください"); return; }

    setIsLoading(true);
    try {
      const statusMap = { real: "scheduled", live: "started", quick: "finished" };

      const res = await fetch("/api/matches/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formState,
          date: formState.time ? `${formState.date} ${formState.time}` : formState.date,
          surfaceDetails: formState.venue,
          teamId: currentTeam.id,
          status: statusMap[mode],
          myScore: myScore ? Number(myScore) : 0,
          opponentScore: opponentScore ? Number(opponentScore) : 0,
          myInningScores: myInnings.map(v => v ? Number(v) : 0),
          opponentInningScores: opponentInnings.map(v => v ? Number(v) : 0),
        }),
      });

      const result = (await res.json()) as CreateMatchResponse;
      if (!result.success) throw new Error(result.error || "保存に失敗しました");

      toast.success(`${pageInfo.ja}を完了しました！`);
      mode === "live" ? router.push(`/matches/lineup?id=${result.matchId}&teamId=${currentTeam.id}`) : router.push("/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存エラー");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 flex flex-col animate-in fade-in duration-300 max-w-lg mx-auto pb-32">
      {/* ━━ トップ：戻るボタン & SectionHeader ━━ */}
      <div className="space-y-4 mb-6">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.back()}
          className="h-10 px-4 rounded-[var(--radius-xl)] font-black gap-2 shadow-sm border-border bg-card text-foreground hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
          戻る
        </Button>
        <SectionHeader title={pageInfo.ja} subtitle={pageInfo.en} showPulse={false} />
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="rounded-3xl border border-border bg-card shadow-sm">
          <CardContent className="p-5">
            <MatchBasicForm
              state={formState}
              setState={setFormState}
              tournaments={tournaments}
              isNewTournament={isNewTournament}
              setIsNewTournament={setIsNewTournament}
            />
          </CardContent>
        </Card>

        {mode === "quick" && (
          <QuickScoreForm
            inningCount={formState.inningCount}
            myScore={myScore} setMyScore={setMyScore}
            opponentScore={opponentScore} setOpponentScore={setOpponentScore}
            myInnings={myInnings} setMyInnings={setMyInnings}
            opponentInnings={opponentInnings} setOpponentInnings={setOpponentInnings}
          />
        )}

        <Button type="submit" disabled={isLoading} className="w-full h-14 rounded-2xl text-sm font-black uppercase flex items-center justify-center gap-2 shadow-md">
          {isLoading ? <Loader2 className="animate-spin h-5 w-5" /> : pageInfo.icon}
          {isLoading ? "処理中..." : pageInfo.btn}
        </Button>
      </form>
    </div>
  );
}

export default function CreateMatchPage() {
  return <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="animate-spin h-8 w-8 text-primary/50" /></div>}><CreateMatchContent /></Suspense>;
}
