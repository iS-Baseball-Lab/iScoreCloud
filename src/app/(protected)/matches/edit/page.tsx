// filepath: src/app/(protected)/matches/edit/page.tsx
"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Save, Loader2, Trash2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { MatchBasicForm, MatchFormState } from "@/components/features/matches/match-basic-form";
import { FinishedScoreBoard } from "@/components/features/matches/match-score-board";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { useTeam } from "@/contexts/TeamContext";

// ━━━ 型定義 ━━━
interface Tournament {
  id: string;
  name: string;
  season: string;
  organizer: string | null;
}

interface MatchData {
  opponent?: string;
  tournamentName?: string;
  matchType?: 'official' | 'practice';
  battingOrder?: 'first' | 'second';
  benchSide?: '1B' | '3B' | 'unknown';
  surfaceDetails?: string;
  innings?: number;
  status?: string;
  date?: string;
}

interface MatchResponse {
  success: boolean;
  match?: MatchData;
  error?: string;
}

interface InningData {
  teamType: 'home' | 'away';
  inningNumber: number;
  runs: number;
}

interface TeamData {
  id: string;
  name: string;
}

interface DeleteResponse {
  success: boolean;
  error?: string;
}

// ━━━ 削除確認モーダル ━━━
interface DeleteConfirmModalProps {
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmModal({ isDeleting, onConfirm, onCancel }: DeleteConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-card rounded-3xl border border-border shadow-2xl p-6 space-y-5 animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-destructive/10 flex items-center justify-center shrink-0">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <h3 className="font-black text-base text-foreground">この試合を削除しますか？</h3>
            <p className="text-xs text-muted-foreground mt-0.5">この操作は取り消せません</p>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="outline" onClick={onCancel} disabled={isDeleting} className="flex-1 rounded-2xl font-bold">
            キャンセル
          </Button>
          <Button onClick={onConfirm} disabled={isDeleting} className="flex-1 rounded-2xl font-black bg-destructive hover:bg-destructive/90 text-destructive-foreground border-0">
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "削除する"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ━━━ メインコンテンツ ━━━
function MatchEditContent() {
  const router = useRouter();
  const { currentTeam } = useTeam();
  const searchParams = useSearchParams();
  const matchId = searchParams.get("id");

  // 統合フォームステート
  const [formState, setFormState] = useState<MatchFormState>({
    opponent: "",
    date: "",
    time: "",
    venue: "",
    matchType: 'practice',
    tournamentName: "",
    battingOrder: 'first',
    benchSide: 'unknown',
    inningCount: 7,
  });

  const [matchStatus, setMatchStatus] = useState<string>("scheduled");
  const [teamName, setTeamName] = useState("自チーム");
  const [myInnings, setMyInnings] = useState<string[]>([]);
  const [opponentInnings, setOpponentInnings] = useState<string[]>([]);

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [isNewTournament, setIsNewTournament] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!matchId) { router.push("/dashboard"); return; }

    const fetchAllData = async () => {
      try {
        const res = await fetch(`/api/matches/${matchId}`);
        const data = (await res.json()) as MatchResponse;

        if (data.success && data.match) {
          const m = data.match;

          let parsedDate = "";
          let parsedTime = "";
          if (m.date) {
            const parts = m.date.trim().split(/[ T]/);
            parsedDate = parts[0] || "";
            parsedTime = parts[1] ? parts[1].slice(0, 5) : "";
          }

          // DBのデータを安全にフォームステートへ流し込む
          setFormState({
            opponent: m.opponent || "",
            date: parsedDate,
            time: parsedTime,
            venue: m.surfaceDetails || "",
            matchType: m.matchType || 'practice',
            tournamentName: m.tournamentName || "",
            battingOrder: m.battingOrder || 'first',
            benchSide: m.benchSide || 'unknown',
            inningCount: (m.innings as 6 | 7 | 9) || 7,
          });

          setMatchStatus(m.status || "scheduled");

          // スコアボード用イニングデータの取得
          const inningsRes = await fetch(`/api/matches/${matchId}/innings`);
          if (inningsRes.ok) {
            const inningsData = (await inningsRes.json()) as InningData[];
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
          const teamsData = (await teamsRes.json()) as TeamData[];
          const current = teamsData.find(t => t.id === activeTeamId);
          if (current) setTeamName(current.name);
        }

        const categoryParam = currentTeam?.organizationCategory ? `?category=${currentTeam.organizationCategory}` : '';
        const tRes = await fetch(`/api/tournaments${categoryParam}`);
        const tData = await tRes.json();
        if (Array.isArray(tData)) setTournaments(tData as Tournament[]);

      } catch (error) {
        toast.error("データの読み込みに失敗しました");
      }
      finally { setIsLoading(false); }
    };
    fetchAllData();
  }, [matchId, router, currentTeam]);

  const myTotalScore = myInnings.reduce((sum, val) => sum + (parseInt(val) || 0), 0);
  const opponentTotalScore = opponentInnings.reduce((sum, val) => sum + (parseInt(val) || 0), 0);

  const handleUpdate = async () => {
    if (!formState.opponent) { toast.error("対戦相手を入力してください"); return; }
    if (formState.matchType === 'official' && !formState.tournamentName) { toast.error("大会名を選択または入力してください"); return; }
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formState,
          tournamentName: formState.matchType === 'official' ? formState.tournamentName : "",
          date: formState.time ? `${formState.date} ${formState.time}` : formState.date,
          location: formState.venue, // DBのスキーマに合わせてマッピング
          innings: formState.inningCount, // DBのスキーマに合わせてマッピング
        }),
      });
      const data = (await res.json()) as MatchResponse;
      if (!data.success) throw new Error(data.error || "試合の更新に失敗しました");

      // 完了済みの試合の時だけスコアボードを保存
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
    }
    finally { setIsSubmitting(false); }
  };

  if (isLoading) return <div className="flex h-screen items-center justify-center bg-background"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;

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
        <SectionHeader title="試合編集" subtitle="EDIT MATCH" showPulse={false} />
      </div>

      <div className="space-y-6">
        {/* 共通フォームの呼び出し */}
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

        {/* 試合完了時のみスコアボードを表示 */}
        {matchStatus === 'finished' && (
          <FinishedScoreBoard
            inningCount={formState.inningCount}
            battingOrder={formState.battingOrder}
            teamName={teamName}
            opponentName={formState.opponent}
            myInnings={myInnings} setMyInnings={setMyInnings}
            opponentInnings={opponentInnings} setOpponentInnings={setOpponentInnings}
            myTotalScore={myTotalScore} opponentTotalScore={opponentTotalScore}
            onAddInning={() => {
              setFormState(p => ({ ...p, inningCount: (p.inningCount + 1) as 6 | 7 | 9 }));
              setMyInnings(p => [...p, ""]); setOpponentInnings(p => [...p, ""]);
            }}
            onRemoveInning={() => {
              if (formState.inningCount <= 1) return;
              setFormState(p => ({ ...p, inningCount: (p.inningCount - 1) as 6 | 7 | 9 }));
              setMyInnings(p => p.slice(0, -1)); setOpponentInnings(p => p.slice(0, -1));
            }}
          />
        )}

        {/* アクションボタン */}
        <div className="space-y-3 pt-2">
          <Button onClick={handleUpdate} disabled={isSubmitting} className="w-full h-14 rounded-2xl text-sm font-black uppercase flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-shadow">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            試合情報を更新
          </Button>
          <Button variant="outline" onClick={() => setShowDeleteModal(true)} className="w-full h-12 rounded-2xl text-xs font-bold text-destructive border-destructive/20 hover:bg-destructive/10 flex items-center justify-center gap-2">
            <Trash2 className="h-4 w-4" />
            この試合を削除する
          </Button>
        </div>
      </div>

      {showDeleteModal && (
        <DeleteConfirmModal
          isDeleting={isDeleting}
          onConfirm={async () => {
            if (!matchId) return;
            setIsDeleting(true);
            try {
              const res = await fetch(`/api/matches/${matchId}`, { method: "DELETE" });
              const d = (await res.json()) as DeleteResponse;
              if (!d.success) throw new Error(d.error || "削除に失敗しました");
              toast.success("試合を削除しました");
              router.push("/dashboard");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "削除に失敗しました");
            } finally {
              setIsDeleting(false);
              setShowDeleteModal(false);
            }
          }}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  );
}

export default function MatchEditPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="animate-spin h-8 w-8 text-primary/50" /></div>}>
      <MatchEditContent />
    </Suspense>
  );
}
