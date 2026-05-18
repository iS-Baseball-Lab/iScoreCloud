// filepath: src/app/(protected)/matches/edit/page.tsx
"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft, Save, MapPin, Calendar, Users, Trophy,
  Loader2, Clock, Trash2, Plus, X, ChevronDown, Check,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 型定義
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface Tournament {
  id: string;
  name: string;
  season: string;
  organizer: string | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 大会選択ドロップダウン
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface TournamentSelectorProps {
  tournaments: Tournament[];
  value: string;
  isNew: boolean;
  onSelect: (name: string, isNew: boolean) => void;
}

function TournamentSelector({ tournaments, value, isNew, onSelect }: TournamentSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const displayLabel = isNew
    ? "＋ 新しい大会を作成"
    : value || "大会を選択してください";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className={cn(
          "w-full h-11 px-4 rounded-2xl border text-sm font-bold text-left flex items-center justify-between transition-all",
          "bg-amber-500/5 border-amber-500/20 hover:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/30",
          isNew && "text-amber-600 dark:text-amber-400",
          !value && !isNew && "text-muted-foreground",
        )}
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-amber-500 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 rounded-2xl border border-border/50 bg-card shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
            {tournaments.length > 0 ? (
              <div className="max-h-52 overflow-y-auto">
                {tournaments.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { onSelect(t.name, false); setIsOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
                  >
                    <Trophy className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{t.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {t.season}年度{t.organizer ? ` · ${t.organizer}` : ""}
                      </p>
                    </div>
                    {!isNew && value === t.name && (
                      <Check className="h-4 w-4 shrink-0 text-amber-500" />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-4 py-3 text-sm text-muted-foreground">
                登録済みの大会がありません
              </div>
            )}
            <div className="border-t border-border/40" />
            <button
              type="button"
              onClick={() => { onSelect("", true); setIsOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-amber-500/5 transition-colors text-amber-600 dark:text-amber-400"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span className="text-sm font-bold">＋ 新しい大会を作成する</span>
              {isNew && <Check className="h-4 w-4 shrink-0 ml-auto" />}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 削除確認モーダル
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface DeleteConfirmModalProps {
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmModal({ isDeleting, onConfirm, onCancel }: DeleteConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-card rounded-3xl border border-border/50 shadow-2xl p-6 space-y-5 animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-red-500/10 flex items-center justify-center shrink-0">
            <AlertCircle className="h-6 w-6 text-red-500" />
          </div>
          <div>
            <h3 className="font-black text-base text-foreground">この試合を削除しますか？</h3>
            <p className="text-xs text-muted-foreground mt-0.5">この操作は取り消せません</p>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="outline" onClick={onCancel} disabled={isDeleting}
            className="flex-1 rounded-2xl font-bold border-border/50">
            キャンセル
          </Button>
          <Button onClick={onConfirm} disabled={isDeleting}
            className="flex-1 rounded-2xl font-black bg-red-500 hover:bg-red-600 text-white border-0">
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "削除する"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メインコンテンツ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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

  // 🌟 状態維持バグ修正: 試合の現在のステータスを保持するStateを追加
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
        // 1. 試合基本情報
        const res = await fetch(`/api/matches/${matchId}`);
        const data = (await res.json()) as {
          success: boolean;
          match?: {
            id: string; opponent: string; tournamentName?: string;
            matchType: 'official' | 'practice'; battingOrder: 'first' | 'second';
            surfaceDetails?: string; innings?: number; date?: string;
            status?: string; // 🌟 statusの型を追加
          }
        };

        if (data.success && data.match) {
          const m = data.match;
          setOpponent(m.opponent || "");
          setTournamentName(m.tournamentName || "");
          setMatchType(m.matchType || "practice");
          setBattingOrder(m.battingOrder || "first");
          setVenue(m.surfaceDetails || "");
          setInningCount(m.innings || 7);
          
          // 🌟 状態維持バグ修正: 現在のステータスを退避
          setMatchStatus(m.status || "scheduled");

          if (m.date) {
            const [d, t] = m.date.split(" ");
            setDate(d || "");
            setTime(t || "");
          }

          // 2. イニングスコア取得
          const inningsRes = await fetch(`/api/matches/${matchId}/innings`);
          if (inningsRes.ok) {
            const inningsData = (await inningsRes.json()) as { teamType: string; inningNumber: number; runs: number }[];
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

        // 3. チーム名
        const activeTeamId = localStorage.getItem("iscore_selectedTeamId");
        if (activeTeamId) {
          const teamsRes = await fetch("/api/teams");
          const teamsData = (await teamsRes.json()) as { id: string; name: string }[];
          const current = teamsData.find(t => t.id === activeTeamId);
          if (current) setTeamName(current.name);
        }

        // 4. 大会一覧取得
        const tRes = await fetch("/api/tournaments");
        const tData = await tRes.json();
        if (Array.isArray(tData)) setTournaments(tData as Tournament[]);

      } catch {
        toast.error("データの読み込みに失敗しました");
      } finally {
        setIsLoading(false);
      }
    };
    fetchAllData();
  }, [matchId, router]);

  const handleTournamentSelect = (name: string, createNew: boolean) => {
    setTournamentName(name);
    setIsNewTournament(createNew);
  };

  const myTotalScore = myInnings.reduce((sum, val) => sum + (parseInt(val) || 0), 0);
  const opponentTotalScore = opponentInnings.reduce((sum, val) => sum + (parseInt(val) || 0), 0);

  const addInning = () => {
    setInningCount(prev => prev + 1);
    setMyInnings(prev => [...prev, ""]);
    setOpponentInnings(prev => [...prev, ""]);
  };

  const removeInning = () => {
    if (inningCount <= 1) return;
    setInningCount(prev => prev - 1);
    setMyInnings(prev => prev.slice(0, -1));
    setOpponentInnings(prev => prev.slice(0, -1));
  };

  const handleUpdate = async () => {
    if (!opponent) { toast.error("対戦相手を入力してください"); return; }
    if (matchType === 'official' && !tournamentName) {
      toast.error("大会名を選択または入力してください");
      return;
    }
    setIsSubmitting(true);

    try {
      // 1. 基本情報の更新（PATCH）
      const res = await fetch(`/api/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opponent,
          tournamentName: matchType === 'official' ? tournamentName : "",
          date: `${date} ${time}`,
          matchType,
          battingOrder,
          location: venue,
          innings: inningCount,
        }),
      });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) throw new Error(data.error);

      // 🌟 状態維持バグ修正: 既に終了している試合(finished)の場合のみスコア詳細を保存する
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!matchId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/matches/${matchId}`, { method: "DELETE" });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) throw new Error(data.error);
      toast.success("試合を削除しました");
      router.push("/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "削除に失敗しました");
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  if (isLoading) return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="animate-spin h-8 w-8 text-primary" />
    </div>
  );

  return (
    <div className="min-h-screen bg-transparent p-4 sm:p-6 space-y-6 flex flex-col animate-in fade-in duration-300 max-w-lg mx-auto pb-32">

      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}
          className="h-10 w-10 rounded-full bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm border border-border/40 hover:bg-white/80 dark:hover:bg-zinc-800/80 shadow-sm transition-all">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-black tracking-tight">Edit Match</h1>
      </div>

      {/* 基本情報入力カード */}
      <Card className="rounded-3xl border-border/40 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md shadow-sm">
        <CardContent className="p-5 space-y-5">

          {/* 対戦相手 */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Opponent
            </label>
            <Input value={opponent} onChange={e => setOpponent(e.target.value)}
              className="h-11 rounded-2xl text-sm font-bold bg-background border-border/50" />
          </div>

          {/* 日付・時刻・球場・試合種別 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> Date
              </label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="h-11 rounded-2xl text-sm font-bold bg-background border-border/50" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Time
              </label>
              <Input type="time" value={time} onChange={e => setTime(e.target.value)}
                className="h-11 rounded-2xl text-sm font-bold bg-background border-border/50" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> Venue
              </label>
              <Input value={venue} onChange={e => setVenue(e.target.value)}
                className="h-11 rounded-2xl text-sm font-bold bg-background border-border/50" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5" /> Type
              </label>
              <div className="flex gap-1.5">
                <Button variant={matchType === 'official' ? 'default' : 'outline'}
                  onClick={() => setMatchType('official')}
                  className={cn("flex-1 h-11 px-0 rounded-2xl text-[10px] font-bold",
                    matchType === 'official' && "bg-amber-600 hover:bg-amber-700")}>
                  公式
                </Button>
                <Button variant={matchType === 'practice' ? 'default' : 'outline'}
                  onClick={() => setMatchType('practice')}
                  className={cn("flex-1 h-11 px-0 rounded-2xl text-[10px] font-bold",
                    matchType === 'practice' && "bg-emerald-600 hover:bg-emerald-700")}>
                  練習
                </Button>
              </div>
            </div>
          </div>

          {/* 公式戦のみ：大会選択（選択式） */}
          {matchType === 'official' && (
            <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
              <label className="text-[10px] font-black uppercase tracking-widest text-amber-600 flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5" /> Tournament
              </label>
              <TournamentSelector
                tournaments={tournaments}
                value={tournamentName}
                isNew={isNewTournament}
                onSelect={handleTournamentSelect}
              />
              {isNewTournament && (
                <div className="animate-in slide-in-from-top-1 fade-in duration-200">
                  <Input
                    autoFocus
                    value={tournamentName}
                    onChange={e => setTournamentName(e.target.value)}
                    placeholder="大会名を入力 (例: 第15回 春季大会)"
                    className="h-11 rounded-2xl text-sm font-bold bg-amber-500/5 border-amber-500/30 focus:border-amber-500"
                  />
                  <p className="text-[10px] text-amber-600/70 mt-1.5 pl-1">
                    保存時に自動で大会が登録されます
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 先攻・後攻 */}
          <div className="pt-2">
            <div className="flex items-center p-1 bg-muted/50 rounded-2xl border border-border/50">
              <button onClick={() => setBattingOrder('first')}
                className={cn("flex-1 h-9 text-[10px] sm:text-xs font-black rounded-xl transition-all",
                  battingOrder === 'first' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
                先攻 (Top)
              </button>
              <button onClick={() => setBattingOrder('second')}
                className={cn("flex-1 h-9 text-[10px] sm:text-xs font-black rounded-xl transition-all",
                  battingOrder === 'second' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
                後攻 (Bottom)
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 🌟 復元＆完全補完：スコアボードセクション（Finishedの試合のみイニングスコア入力可能） */}
      {matchStatus === 'finished' && (
        <Card className="rounded-3xl border-border/40 bg-background shadow-xl overflow-hidden animate-in fade-in duration-300">
          <div className="bg-zinc-900 text-zinc-100 p-4 flex items-center justify-between">
            <h2 className="text-xs font-black italic tracking-wider">SCOREBOARD</h2>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" onClick={removeInning} disabled={inningCount <= 1}
                className="h-7 w-7 rounded-full bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white">
                <X className="h-3 w-3" />
              </Button>
              <span className="text-[10px] font-bold text-zinc-400 tabular-nums w-12 text-center">{inningCount} INN</span>
              <Button type="button" variant="outline" size="icon" onClick={addInning}
                className="h-7 w-7 rounded-full bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white">
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <CardContent className="p-4 overflow-x-auto">
            <div className="min-w-[340px] space-y-3">
              {/* 先攻チームのスコア行 */}
              <div className="flex items-center gap-2">
                <div className="w-20 font-black text-xs truncate text-muted-foreground">
                  {battingOrder === 'first' ? teamName : opponent}
                </div>
                <div className="flex-1 flex gap-1.5">
                  {Array.from({ length: inningCount }).map((_, i) => (
                    <Input
                      key={`first-${i}`}
                      type="text"
                      placeholder="-"
                      value={battingOrder === 'first' ? myInnings[i] : opponentInnings[i]}
                      onChange={(e) => {
                        if (battingOrder === 'first') {
                          const next = [...myInnings]; next[i] = e.target.value; setMyInnings(next);
                        } else {
                          const next = [...opponentInnings]; next[i] = e.target.value; setOpponentInnings(next);
                        }
                      }}
                      className="w-8 h-8 p-0 text-center font-bold text-xs rounded-lg bg-muted/40 border-0"
                    />
                  ))}
                </div>
                <div className="w-8 text-center font-black text-sm text-primary tabular-nums">
                  {battingOrder === 'first' ? myTotalScore : opponentTotalScore}
                </div>
              </div>

              {/* 後攻チームのスコア行 */}
              <div className="flex items-center gap-2">
                <div className="w-20 font-black text-xs truncate text-muted-foreground">
                  {battingOrder === 'second' ? teamName : opponent}
                </div>
                <div className="flex-1 flex gap-1.5">
                  {Array.from({ length: inningCount }).map((_, i) => (
                    <Input
                      key={`second-${i}`}
                      type="text"
                      placeholder="-"
                      value={battingOrder === 'second' ? myInnings[i] : opponentInnings[i]}
                      onChange={(e) => {
                        if (battingOrder === 'second') {
                          const next = [...myInnings]; next[i] = e.target.value; setMyInnings(next);
                        } else {
                          const next = [...opponentInnings]; next[i] = e.target.value; setOpponentInnings(next);
                        }
                      }}
                      className="w-8 h-8 p-0 text-center font-bold text-xs rounded-lg bg-muted/40 border-0"
                    />
                  ))}
                </div>
                <div className="w-8 text-center font-black text-sm text-primary tabular-nums">
                  {battingOrder === 'second' ? myTotalScore : opponentTotalScore}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 🌟 補完：保存・削除アクションボタン */}
      <div className="space-y-3 pt-2">
        <Button
          onClick={handleUpdate}
          disabled={isSubmitting}
          className="w-full h-14 rounded-2xl text-sm font-black uppercase tracking-[0.15em] shadow-md shadow-primary/10 flex items-center justify-center gap-2"
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          試合情報を更新
        </Button>

        <Button
          variant="ghost"
          onClick={() => setShowDeleteModal(true)}
          className="w-full h-12 rounded-2xl text-xs font-bold text-destructive hover:bg-destructive/5 flex items-center justify-center gap-2"
        >
          <Trash2 className="h-4 w-4" />
          この試合を削除する
        </Button>
      </div>

      {/* 削除モーダルコンポーネント */}
      {showDeleteModal && (
        <DeleteConfirmModal
          isDeleting={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  );
}

// 🌟 Suspenseで安全にラップしてエクスポート
export default function MatchEditPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8 text-primary/50" />
      </div>
    }>
      <MatchEditContent />
    </Suspense>
  );
}
