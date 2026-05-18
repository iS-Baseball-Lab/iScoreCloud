// filepath: src/app/(protected)/matches/create/page.tsx
"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Users, Calendar, Clock, MapPin, Trophy, CalendarPlus, PlayCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useTeam } from "@/contexts/TeamContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TournamentSelector } from "@/components/features/matches/tournament-selector";
import { QuickScoreForm } from "@/components/features/matches/match-score-board";
import { SectionHeader } from "@/components/layout/SectionHeader";

// ━━━ 型定義 (APIレスポンスのany排除) ━━━
interface Tournament { 
  id: string; 
  name: string; 
  season: string; 
  organizer: string | null; 
}

interface CreateMatchResponse {
  success: boolean;
  matchId?: string;
  error?: string;
}

function CreateMatchContent() {
  const router = useRouter();
  const { currentTeam } = useTeam();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") || "real";

  const [isLoading, setIsLoading] = useState(false);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);

  // フォーム基本ステート
  const [opponent, setOpponent] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [time, setTime] = useState("");
  const [venue, setVenue] = useState("");
  const [matchType, setMatchType] = useState<'official' | 'practice'>("practice");
  const [tournamentName, setTournamentName] = useState("");
  const [isNewTournament, setIsNewTournament] = useState(false);
  const [battingOrder, setBattingOrder] = useState<'first' | 'second'>("first");
  
  // スコアステート
  const [inningCount, setInningCount] = useState(7);
  const [myScore, setMyScore] = useState("");
  const [opponentScore, setOpponentScore] = useState("");
  const [myInnings, setMyInnings] = useState<string[]>([]);
  const [opponentInnings, setOpponentInnings] = useState<string[]>([]);

  useEffect(() => {
    const fetchTournaments = async () => {
      try {
        const res = await fetch("/api/tournaments");
        const data = await res.json();
        if (Array.isArray(data)) setTournaments(data as Tournament[]);
      } catch (err) { 
        console.error("大会データの取得に失敗しました", err); 
      }
    };
    fetchTournaments();
  }, []);

  useEffect(() => {
    setMyInnings(Array(inningCount).fill(""));
    setOpponentInnings(Array(inningCount).fill(""));
  }, [inningCount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!opponent) { toast.error("対戦相手を入力してください"); return; }
    if (!currentTeam?.id) { toast.error("操作するチームを選択してください"); return; }
    if (matchType === 'official' && !tournamentName) { toast.error("大会名を選択または入力してください"); return; }

    setIsLoading(true);
    try {
      const res = await fetch("/api/matches/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: currentTeam.id,
          opponent,
          date: time ? `${date} ${time}` : date,
          matchType,
          tournamentName: matchType === 'official' ? tournamentName : "",
          battingOrder,
          innings: inningCount,
          surfaceDetails: venue,
          status: mode === "real" ? "scheduled" : "finished",
          myScore: myScore ? Number(myScore) : 0,
          opponentScore: opponentScore ? Number(opponentScore) : 0,
          myInningScores: myInnings.map(v => v ? Number(v) : 0),
          opponentInningScores: opponentInnings.map(v => v ? Number(v) : 0),
        }),
      });

      const result = (await res.json()) as CreateMatchResponse;
      if (!result.success) throw new Error(result.error || "試合の保存に失敗しました");

      toast.success(mode === "real" ? "試合予定を登録しました！" : "試合結果を保存しました");
      router.push("/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "接続エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 flex flex-col animate-in fade-in duration-300 max-w-lg mx-auto pb-32">
      
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
        <SectionHeader 
          title={mode === "real" ? "試合予定作成" : "クイックスコア登録"} 
          subtitle={mode === "real" ? "NEW SCHEDULE" : "QUICK SCORE"} 
          showPulse={false} 
        />
      </div>

      {/* ━━ フォームコンテンツ（ソリッド背景で視認性確保） ━━ */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="rounded-3xl border border-border bg-card shadow-sm">
          <CardContent className="p-5 space-y-5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Opponent</label>
              <Input placeholder="相手チーム名" value={opponent} onChange={e => setOpponent(e.target.value)} className="h-11 rounded-2xl text-sm font-bold bg-background border-border" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Date</label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-11 rounded-2xl text-sm font-bold bg-background border-border" /></div>
              <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Time</label>
                <Input type="time" value={time} onChange={e => setTime(e.target.value)} className="h-11 rounded-2xl text-sm font-bold bg-background border-border" /></div>
              <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Venue</label>
                <Input placeholder="球場名など" value={venue} onChange={e => setVenue(e.target.value)} className="h-11 rounded-2xl text-sm font-bold bg-background border-border" /></div>
              <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5" /> Type</label>
                <div className="flex gap-1.5">
                  <Button type="button" variant={matchType === 'official' ? 'default' : 'outline'} onClick={() => setMatchType('official')} className={cn("flex-1 h-11 px-0 rounded-2xl text-[10px] font-bold border-border bg-background hover:bg-muted", matchType === 'official' && "bg-amber-600 hover:bg-amber-700 text-white border-transparent")}>公式</Button>
                  <Button type="button" variant={matchType === 'practice' ? 'default' : 'outline'} onClick={() => setMatchType('practice')} className={cn("flex-1 h-11 px-0 rounded-2xl text-[10px] font-bold border-border bg-background hover:bg-muted", matchType === 'practice' && "bg-emerald-600 hover:bg-emerald-700 text-white border-transparent")}>練習</Button>
                </div>
              </div>
            </div>

            {matchType === 'official' && (
              <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                <label className="text-[10px] font-black uppercase text-amber-600 flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5" /> Tournament</label>
                <TournamentSelector 
                  tournaments={tournaments} 
                  value={tournamentName} 
                  isNew={isNewTournament} 
                  onSelect={(name, createNew) => { 
                    setTournamentName(name); 
                    setIsNewTournament(createNew); 
                  }} 
                />
                {isNewTournament && (
                  <div className="animate-in slide-in-from-top-1 duration-200">
                    <Input autoFocus value={tournamentName} onChange={e => setTournamentName(e.target.value)} placeholder="大会名を入力" className="h-11 rounded-2xl text-sm font-bold bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-100" />
                  </div>
                )}
              </div>
            )}

            <div className="pt-2">
              <div className="flex items-center p-1 bg-muted rounded-2xl border border-border">
                <button type="button" onClick={() => setBattingOrder('first')} className={cn("flex-1 h-9 text-[10px] sm:text-xs font-black rounded-xl transition-all", battingOrder === 'first' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>先攻 (Top)</button>
                <button type="button" onClick={() => setBattingOrder('second')} className={cn("flex-1 h-9 text-[10px] sm:text-xs font-black rounded-xl transition-all", battingOrder === 'second' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>後攻 (Bottom)</button>
              </div>
            </div>
          </CardContent>
        </Card>

        {mode === "quick" && (
          <QuickScoreForm
            inningCount={inningCount} myScore={myScore} setMyScore={setMyScore} opponentScore={opponentScore} setOpponentScore={setOpponentScore}
            myInnings={myInnings} setMyInnings={setMyInnings} opponentInnings={opponentInnings} setOpponentInnings={setOpponentInnings}
          />
        )}

        <div className="pt-2">
          <Button type="submit" disabled={isLoading} className="w-full h-14 rounded-2xl text-sm font-black uppercase flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-shadow">
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (mode === "real" ? <CalendarPlus className="h-5 w-5" /> : <PlayCircle className="h-5 w-5" />)}
            {isLoading ? "保存中..." : (mode === "real" ? "予定を登録する" : "試合結果を保存する")}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function CreateMatchPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="animate-spin h-8 w-8 text-primary/50" /></div>}>
      <CreateMatchContent />
    </Suspense>
  );
}
