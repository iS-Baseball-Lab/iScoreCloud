// filepath: src/app/(protected)/matches/edit/page.tsx
"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Save, MapPin, Calendar, Users, Trophy, Loader2, Clock, Trash2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TournamentSelector } from "@/components/features/matches/tournament-selector";
import { FinishedScoreBoard } from "@/components/features/matches/match-score-board";

interface Tournament { id: string; name: string; season: string; organizer: string | null; }

interface DeleteConfirmModalProps { isDeleting: boolean; onConfirm: () => void; onCancel: () => void; }

function DeleteConfirmModal({ isDeleting, onConfirm, onCancel }: DeleteConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-card rounded-3xl border border-border/50 shadow-2xl p-6 space-y-5 animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-red-500/10 flex items-center justify-center shrink-0"><AlertCircle className="h-6 w-6 text-red-500" /></div>
          <div><h3 className="font-black text-base text-foreground">この試合を削除しますか？</h3><p className="text-xs text-muted-foreground mt-0.5">この操作は取り消せません</p></div>
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="outline" onClick={onCancel} disabled={isDeleting} className="flex-1 rounded-2xl font-bold">キャンセル</Button>
          <Button onClick={onConfirm} disabled={isDeleting} className="flex-1 rounded-2xl font-black bg-red-500 hover:bg-red-600 text-white border-0">{isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "削除する"}</Button>
        </div>
      </div>
    </div>
  );
}

function MatchEditContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const matchId = searchParams.get("id");

  const [opponent, setOpponent] = useState("");
  const [tournamentName, setTournamentName] = useState("");
  const [isNewTournament, setIsNewTournament] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [matchType, setMatchType] = useState<'official' | 'practice'>("practice");
  const [battingOrder, setBattingOrder] = useState<'first' | 'second'>("first");
  const [venue, setVenue] = useState("");
  const [matchStatus, setMatchStatus] = useState<string>("scheduled");

  const [inningCount, setInningCount] = useState(7);
  const [myInnings, setMyInnings] = useState<string[]>([]);
  const [opponentInnings, setOpponentInnings] = useState<string[]>([]);

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [teamName, setTeamName] = useState("自チーム");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!matchId) { router.push("/dashboard"); return; }

    const fetchAllData = async () => {
      try {
        const res = await fetch(`/api/matches/${matchId}`);
        const data = await res.json() as any;

        if (data.success && data.match) {
          const m = data.match;
          setOpponent(m.opponent || "");
          setTournamentName(m.tournamentName || "");
          setMatchType(m.matchType || "practice");
          setBattingOrder(m.battingOrder || "first");
          setVenue(m.surfaceDetails || "");
          setInningCount(m.innings || 7);
          setMatchStatus(m.status || "scheduled");

          if (m.date) {
            // 🌟 時刻クリアバグ対策: 秒数をカットして正確に「HH:mm」にする
            const parts = m.date.trim().split(/[ T]/);
            setDate(parts[0] || "");
            setTime(parts[1] ? parts[1].slice(0, 5) : "");
          }

          const inningsRes = await fetch(`/api/matches/${matchId}/innings`);
          if (inningsRes.ok) {
            const inningsData = await inningsRes.json() as any[];
            const myScores = Array(m.innings || 7).fill("");
            const oppScores = Array(m.innings || 7).fill("");
            inningsData.forEach(inv => {
              if (inv.teamType === 'home' && m.battingOrder === 'second') myScores[inv.inningNumber - 1] = inv.runs.toString();
              else if (inv.teamType === 'away' && m.battingOrder === 'first') myScores[inv.inningNumber - 1] = inv.runs.toString();
              else if (inv.teamType === 'home' && m.battingOrder === 'first') oppScores[inv.inningNumber - 1] = inv.runs.toString();
              else oppScores[inv.inningNumber - 1] = inv.runs.toString();
            });
            setMyInnings(myScores);
            setOpponentInnings(oppScores);
          }
        }

        const activeTeamId = localStorage.getItem("iscore_selectedTeamId");
        if (activeTeamId) {
          const teamsRes = await fetch("/api/teams");
          const teamsData = await teamsRes.json() as any[];
          const current = teamsData.find(t => t.id === activeTeamId);
          if (current) setTeamName(current.name);
        }

        const tRes = await fetch("/api/tournaments");
        const tData = await tRes.json();
        if (Array.isArray(tData)) setTournaments(tData as Tournament[]);

      } catch { toast.error("データの読み込みに失敗しました"); }
      finally { setIsLoading(false); }
    };
    fetchAllData();
  }, [matchId, router]);

  const myTotalScore = myInnings.reduce((sum, val) => sum + (parseInt(val) || 0), 0);
  const opponentTotalScore = opponentInnings.reduce((sum, val) => sum + (parseInt(val) || 0), 0);

  const handleUpdate = async () => {
    if (!opponent) { toast.error("対戦相手を入力してください"); return; }
    if (matchType === 'official' && !tournamentName) { toast.error("大会名を選択または入力してください"); return; }
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opponent,
          tournamentName: matchType === 'official' ? tournamentName : "",
          date: time ? `${date} ${time}` : date,
          matchType,
          battingOrder,
          location: venue,
          innings: inningCount,
        }),
      });
      const data = await res.json() as any;
      if (!data.success) throw new Error(data.error);

      // 🌟 状態維持バグ修正: 完了済みの試合の時だけスコアボードを保存
      if (matchStatus === 'finished') {
        await fetch(`/api/matches/${matchId}/finish`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            myScore: myTotalScore,
            opponentScore: opponentTotalScore,
            myInningScores: myInnings.map(val => parseInt(val) || 0),
            opponentInningScores: opponentInnings.map(val => parseInt(val) || 0),
          }),
        });
      }

      toast.success("試合情報を更新しました！");
      router.back();
    } catch (error: any) { toast.error(error.message || "更新に失敗しました"); }
    finally { setIsSubmitting(false); }
  };

  if (isLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;

  return (
    <div className="min-h-screen bg-transparent p-4 sm:p-6 space-y-6 flex flex-col animate-in fade-in duration-300 max-w-lg mx-auto pb-32">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-10 w-10 rounded-full bg-white/50 dark:bg-zinc-900/50 border shadow-sm"><ChevronLeft className="h-5 w-5" /></Button>
        <h1 className="text-xl font-black tracking-tight">Edit Match</h1>
      </div>

      <Card className="rounded-3xl border-border/40 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md shadow-sm">
        <CardContent className="p-5 space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Opponent</label>
            <Input value={opponent} onChange={e => setOpponent(e.target.value)} className="h-11 rounded-2xl text-sm font-bold bg-background border-border/50" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Date</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-11 rounded-2xl text-sm font-bold bg-background border-border/50" /></div>
            <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Time</label>
              <Input type="time" value={time} onChange={e => setTime(e.target.value)} className="h-11 rounded-2xl text-sm font-bold bg-background border-border/50" /></div>
            <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Venue</label>
              <Input value={venue} onChange={e => setVenue(e.target.value)} className="h-11 rounded-2xl text-sm font-bold bg-background border-border/50" /></div>
            <div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5" /> Type</label>
              <div className="flex gap-1.5">
                <Button type="button" variant={matchType === 'official' ? 'default' : 'outline'} onClick={() => setMatchType('official')} className={cn("flex-1 h-11 px-0 rounded-2xl text-[10px] font-bold", matchType === 'official' && "bg-amber-600/90")}>公式</Button>
                <Button type="button" variant={matchType === 'practice' ? 'default' : 'outline'} onClick={() => setMatchType('practice')} className={cn("flex-1 h-11 px-0 rounded-2xl text-[10px] font-bold", matchType === 'practice' && "bg-emerald-600/90")}>練習</Button>
              </div>
            </div>
          </div>

          {matchType === 'official' && (
            <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
              <label className="text-[10px] font-black uppercase text-amber-600 flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5" /> Tournament</label>
              <TournamentSelector tournaments={tournaments} value={tournamentName} isNew={isNewTournament} onSelect={(name, createNew) => { setTournamentName(name); setIsNewTournament(createNew); }} />
              {isNewTournament && <div className="animate-in slide-in-from-top-1 duration-200"><Input autoFocus value={tournamentName} onChange={e => setTournamentName(e.target.value)} placeholder="大会名を入力" className="h-11 rounded-2xl text-sm font-bold bg-amber-500/5 border-amber-500/30" /></div>}
            </div>
          )}

          <div className="pt-2">
            <div className="flex items-center p-1 bg-muted/50 rounded-2xl border border-border/50">
              <button onClick={() => setBattingOrder('first')} className={cn("flex-1 h-9 text-[10px] sm:text-xs font-black rounded-xl transition-all", battingOrder === 'first' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}>先攻 (Top)</button>
              <button onClick={() => setBattingOrder('second')} className={cn("flex-1 h-9 text-[10px] sm:text-xs font-black rounded-xl transition-all", battingOrder === 'second' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}>後攻 (Bottom)</button>
            </div>
          </div>
        </CardContent>
      </Card>

      {matchStatus === 'finished' && (
        <FinishedScoreBoard
          inningCount={inningCount} battingOrder={battingOrder} teamName={teamName} opponentName={opponent}
          myInnings={myInnings} setMyInnings={setMyInnings} opponentInnings={opponentInnings} setOpponentInnings={setOpponentInnings}
          myTotalScore={myTotalScore} opponentTotalScore={opponentTotalScore}
          onAddInning={() => { setInningCount(p => p + 1); setMyInnings(p => [...p, ""]); setOpponentInnings(p => [...p, ""]); }}
          onRemoveInning={() => { if (inningCount <= 1) return; setInningCount(p => p - 1); setMyInnings(p => p.slice(0, -1)); setOpponentInnings(p => p.slice(0, -1)); }}
        />
      )}

      <div className="space-y-3 pt-2">
        <Button onClick={handleUpdate} disabled={isSubmitting} className="w-full h-14 rounded-2xl text-sm font-black uppercase flex items-center justify-center gap-2 shadow-md shadow-primary/10">{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}試合情報を更新</Button>
        <Button variant="ghost" onClick={() => setShowDeleteModal(true)} className="w-full h-12 rounded-2xl text-xs font-bold text-destructive hover:bg-destructive/5 flex items-center justify-center gap-2"><Trash2 className="h-4 w-4" />この試合を削除する</Button>
      </div>

      {showDeleteModal && <DeleteConfirmModal isDeleting={isDeleting} onConfirm={async () => { if (!matchId) return; setIsDeleting(true); try { const res = await fetch(`/api/matches/${matchId}`, { method: "DELETE" }); const d = await res.json() as any; if (!d.success) throw new Error(d.error); toast.success("試合を削除しました"); router.push("/dashboard"); } catch (e: any) { toast.error(e.message || "削除に失敗しました"); } finally { setIsDeleting(false); setShowDeleteModal(false); } }} onCancel={() => setShowDeleteModal(false)} />}
    </div>
  );
}

export default function MatchEditPage() {
  return <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin h-8 w-8 text-primary/50" /></div>}><MatchEditContent /></Suspense>;
}
