// filepath: src/components/features/matches/match-score-board.tsx
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";

// ━━ ① QUICK SCORE 用（新規登録時の特大スコア入力） ━━
interface QuickScoreFormProps {
  inningCount: number;
  myScore: string;
  setMyScore: (v: string) => void;
  opponentScore: string;
  setOpponentScore: (v: string) => void;
  myInnings: string[];
  setMyInnings: (v: string[]) => void;
  opponentInnings: string[];
  setOpponentInnings: (v: string[]) => void;
}

export function QuickScoreForm({
  inningCount,
  myScore,
  setMyScore,
  opponentScore,
  setOpponentScore,
  myInnings,
  setMyInnings,
  opponentInnings,
  setOpponentInnings
}: QuickScoreFormProps) {
  return (
    <Card className="rounded-3xl border-border/40 bg-background shadow-xl overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
      <div className="bg-zinc-900 text-zinc-100 p-3 flex items-center justify-between">
        <h2 className="text-xs font-black italic tracking-wider">RESULT SCORE</h2>
      </div>
      <CardContent className="p-6 space-y-8">
        {/* 合計スコア（巨大） */}
        <div className="flex items-center justify-around gap-4 py-2">
          <div className="text-center space-y-2">
            <p className="text-[10px] font-black text-muted-foreground uppercase">自チーム</p>
            <Input
              type="number" placeholder="0"
              className="w-20 h-20 text-center text-3xl font-black rounded-2xl bg-primary/5 border-primary/20 text-primary"
              value={myScore} onChange={(e) => setMyScore(e.target.value)}
            />
          </div>
          <span className="text-2xl font-black text-muted-foreground/30 mt-6">-</span>
          <div className="text-center space-y-2">
            <p className="text-[10px] font-black text-muted-foreground uppercase">相手</p>
            <Input
              type="number" placeholder="0"
              className="w-20 h-20 text-center text-3xl font-black rounded-2xl bg-background border-border/40"
              value={opponentScore} onChange={(e) => setOpponentScore(e.target.value)}
            />
          </div>
        </div>

        {/* イニングスコア（オプショナル） */}
        <div className="space-y-4">
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Inning Scores (Optional)</p>
          <div className="overflow-x-auto pb-2 -mx-2 px-2">
            <div className="flex gap-3">
              {Array.from({ length: inningCount }).map((_, i) => (
                <div key={i} className="flex flex-col gap-2 shrink-0">
                  <span className="text-[10px] font-black text-center text-muted-foreground/50">{i + 1}</span>
                  <Input
                    type="text" placeholder="-"
                    className="w-10 h-10 p-0 text-center font-bold bg-primary/5 border-primary/10 rounded-lg"
                    value={myInnings[i] || ""}
                    onChange={(e) => {
                      const next = [...myInnings]; next[i] = e.target.value; setMyInnings(next);
                    }}
                  />
                  <Input
                    type="text" placeholder="-"
                    className="w-10 h-10 p-0 text-center font-bold bg-background border-border/40 rounded-lg"
                    value={opponentInnings[i] || ""}
                    onChange={(e) => {
                      const next = [...opponentInnings]; next[i] = e.target.value; setOpponentInnings(next);
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ━━ ② FINISHED SCORE 用（編集時の野球風ランニングスコアボード） ━━
interface FinishedScoreBoardProps {
  inningCount: number;
  battingOrder: "first" | "second";
  teamName: string;
  opponentName: string;
  myInnings: string[];
  setMyInnings: (v: string[]) => void;
  opponentInnings: string[];
  setOpponentInnings: (v: string[]) => void;
  myTotalScore: number;
  opponentTotalScore: number;
  onAddInning: () => void;
  onRemoveInning: () => void;
}

export function FinishedScoreBoard({
  inningCount,
  battingOrder,
  teamName,
  opponentName,
  myInnings,
  setMyInnings,
  opponentInnings,
  setOpponentInnings,
  myTotalScore,
  opponentTotalScore,
  onAddInning,
  onRemoveInning
}: FinishedScoreBoardProps) {
  return (
    <Card className="rounded-3xl border-border/40 bg-background shadow-xl overflow-hidden animate-in fade-in duration-300">
      <div className="bg-zinc-900 text-zinc-100 p-4 flex items-center justify-between">
        <h2 className="text-xs font-black italic tracking-wider">SCOREBOARD</h2>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon" onClick={onRemoveInning} disabled={inningCount <= 1}
            className="h-7 w-7 rounded-full bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white">
            <X className="h-3 w-3" />
          </Button>
          <span className="text-[10px] font-bold text-zinc-400 tabular-nums w-12 text-center">{inningCount} INN</span>
          <Button type="button" variant="outline" size="icon" onClick={onAddInning}
            className="h-7 w-7 rounded-full bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white">
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <CardContent className="p-4 overflow-x-auto">
        <div className="min-w-[340px] space-y-3">
          {/* 先攻の行 */}
          <div className="flex items-center gap-2">
            <div className="w-20 font-black text-xs truncate text-muted-foreground">
              {battingOrder === 'first' ? teamName : opponentName}
            </div>
            <div className="flex-1 flex gap-1.5">
              {Array.from({ length: inningCount }).map((_, i) => (
                <Input
                  key={`top-${i}`} type="text" placeholder="-"
                  value={battingOrder === 'first' ? (myInnings[i] || "") : (opponentInnings[i] || "")}
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

          {/* 後攻の行 */}
          <div className="flex items-center gap-2">
            <div className="w-20 font-black text-xs truncate text-muted-foreground">
              {battingOrder === 'second' ? teamName : opponentName}
            </div>
            <div className="flex-1 flex gap-1.5">
              {Array.from({ length: inningCount }).map((_, i) => (
                <Input
                  key={`bottom-${i}`} type="text" placeholder="-"
                  value={battingOrder === 'second' ? (myInnings[i] || "") : (opponentInnings[i] || "")}
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
  );
}
