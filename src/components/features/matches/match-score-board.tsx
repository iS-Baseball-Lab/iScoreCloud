// filepath: src/components/features/matches/match-score-board.tsx
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

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
  onAddInning?: () => void;
  onRemoveInning?: () => void;
}

export function QuickScoreForm({
  inningCount,
  myScore,
  opponentScore,
  myInnings,
  setMyInnings,
  opponentInnings,
  setOpponentInnings,
  onAddInning,
  onRemoveInning
}: QuickScoreFormProps) {
  // 自チームの合計得点
  const myTotal = myInnings.reduce((sum, val) => sum + (parseInt(val) || 0), 0);
  // 相手チームの合計得点
  const oppTotal = opponentInnings.reduce((sum, val) => sum + (parseInt(val) || 0), 0);

  return (
    <Card className="rounded-3xl border border-border/60 bg-gradient-to-br from-card to-background shadow-xl overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
      <div className="bg-zinc-950 text-zinc-100 p-4 flex items-center justify-between border-b border-border/40">
        <div>
          <h2 className="text-xs font-black italic tracking-widest text-primary">QUICK SCORE BOARD</h2>
          <p className="text-[9px] text-zinc-400 mt-0.5">イニング得点を入力すると合計が自動計算されます</p>
        </div>
        
        {/* イニング増減コントロール */}
        {onAddInning && onRemoveInning && (
          <div className="flex items-center gap-2 bg-zinc-900 px-2 py-1 rounded-xl border border-zinc-800">
            <button
              type="button"
              onClick={onRemoveInning}
              disabled={inningCount <= 1}
              className="h-6 w-6 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 disabled:opacity-30 disabled:hover:bg-zinc-800 flex items-center justify-center transition-all"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="text-[10px] font-black text-zinc-300 min-w-[36px] text-center tabular-nums">{inningCount}回</span>
            <button
              type="button"
              onClick={onAddInning}
              className="h-6 w-6 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 flex items-center justify-center transition-all"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      <CardContent className="p-6 space-y-6">
        {/* 合計スコアディスプレイ (巨大・読み取り専用) */}
        <div className="relative flex items-center justify-center gap-10 py-6 bg-zinc-950/40 rounded-2xl border border-border/30 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-transparent pointer-events-none" />
          
          <div className="text-center space-y-1 z-10">
            <p className="text-[10px] font-black text-primary tracking-widest uppercase">自チーム</p>
            <div className="w-24 h-20 flex items-center justify-center text-5xl font-black rounded-2xl bg-primary/5 border border-primary/20 text-primary shadow-inner tabular-nums">
              {myTotal}
            </div>
          </div>
          
          <div className="text-center mt-4 z-10">
            <span className="text-3xl font-black text-muted-foreground/30">-</span>
          </div>
          
          <div className="text-center space-y-1 z-10">
            <p className="text-[10px] font-black text-muted-foreground tracking-widest uppercase">相手チーム</p>
            <div className="w-24 h-20 flex items-center justify-center text-5xl font-black rounded-2xl bg-zinc-900 border border-border/40 text-foreground shadow-inner tabular-nums">
              {oppTotal}
            </div>
          </div>
        </div>

        {/* イニングスコア入力 (野球のスコアボード風) */}
        <div className="space-y-3">
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Inning Scores</p>
          
          <div className="overflow-x-auto pb-2 -mx-2 px-2">
            <div className="min-w-[340px] border border-border/30 rounded-2xl overflow-hidden bg-zinc-950/20 divide-y divide-border/20">
              {/* ヘッダー行 (イニング番号) */}
              <div className="flex items-center h-8 bg-zinc-950/50">
                <div className="w-16 shrink-0 text-[10px] font-black text-muted-foreground text-center border-r border-border/20">TEAM</div>
                <div className="flex-1 flex divide-x divide-border/10">
                  {Array.from({ length: inningCount }).map((_, i) => (
                    <div key={i} className="flex-1 text-[10px] font-black text-muted-foreground/60 text-center py-1">
                      {i + 1}
                    </div>
                  ))}
                </div>
              </div>

              {/* 自チーム得点行 */}
              <div className="flex items-center h-12">
                <div className="w-16 shrink-0 text-[10px] font-black text-primary text-center border-r border-border/20 bg-primary/5">自チーム</div>
                <div className="flex-1 flex divide-x divide-border/10">
                  {Array.from({ length: inningCount }).map((_, i) => (
                    <div key={i} className="flex-1 p-1 flex items-center justify-center">
                      <Input
                        type="tel"
                        pattern="[0-9]*"
                        placeholder="-"
                        className="w-9 h-9 p-0 text-center font-black text-sm bg-primary/5 border-0 focus-visible:ring-1 focus-visible:ring-primary text-primary rounded-lg transition-all"
                        value={myInnings[i] || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "" || /^[0-9]*$/.test(val)) {
                            const next = [...myInnings];
                            next[i] = val;
                            setMyInnings(next);
                          }
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* 相手チーム得点行 */}
              <div className="flex items-center h-12">
                <div className="w-16 shrink-0 text-[10px] font-black text-muted-foreground text-center border-r border-border/20 bg-zinc-900/30">相手</div>
                <div className="flex-1 flex divide-x divide-border/10">
                  {Array.from({ length: inningCount }).map((_, i) => (
                    <div key={i} className="flex-1 p-1 flex items-center justify-center">
                      <Input
                        type="tel"
                        pattern="[0-9]*"
                        placeholder="-"
                        className="w-9 h-9 p-0 text-center font-black text-sm bg-background border-0 focus-visible:ring-1 focus-visible:ring-zinc-400 rounded-lg transition-all"
                        value={opponentInnings[i] || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "" || /^[0-9]*$/.test(val)) {
                            const next = [...opponentInnings];
                            next[i] = val;
                            setOpponentInnings(next);
                          }
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
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
  battingOrder: "unknown" | "first" | "second";
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
  // 先攻・後攻での表示名
  const topTeamName = battingOrder === 'second' ? opponentName : teamName;
  const bottomTeamName = battingOrder === 'second' ? teamName : opponentName;

  return (
    <Card className="rounded-3xl border border-border/60 bg-gradient-to-br from-card to-background shadow-xl overflow-hidden animate-in fade-in duration-300">
      <div className="bg-zinc-950 text-zinc-100 p-4 flex items-center justify-between border-b border-border/40">
        <div>
          <h2 className="text-xs font-black italic tracking-widest text-primary">RUNNING SCOREBOARD</h2>
          <p className="text-[9px] text-zinc-400 mt-0.5">各イニングの得点を入力してください</p>
        </div>
        <div className="flex items-center gap-2 bg-zinc-900 px-2 py-1 rounded-xl border border-zinc-800">
          <button
            type="button"
            onClick={onRemoveInning}
            disabled={inningCount <= 1}
            className="h-6 w-6 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 disabled:opacity-30 disabled:hover:bg-zinc-800 flex items-center justify-center transition-all"
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="text-[10px] font-black text-zinc-300 min-w-[36px] text-center tabular-nums">{inningCount}回</span>
          <button
            type="button"
            onClick={onAddInning}
            className="h-6 w-6 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 flex items-center justify-center transition-all"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>

      <CardContent className="p-4 overflow-x-auto">
        <div className="min-w-[340px] border border-border/30 rounded-2xl overflow-hidden bg-zinc-950/20 divide-y divide-border/20">
          {/* ヘッダー行 (イニング番号とR) */}
          <div className="flex items-center h-8 bg-zinc-950/50">
            <div className="w-24 shrink-0 text-[10px] font-black text-muted-foreground pl-4 border-r border-border/20">TEAM</div>
            <div className="flex-1 flex divide-x divide-border/10">
              {Array.from({ length: inningCount }).map((_, i) => (
                <div key={i} className="flex-1 text-[10px] font-black text-muted-foreground/60 text-center py-1">
                  {i + 1}
                </div>
              ))}
            </div>
            <div className="w-12 shrink-0 text-[10px] font-black text-primary text-center bg-primary/5">R</div>
          </div>

          {/* 先攻の行 */}
          <div className="flex items-center h-12">
            <div className="w-24 shrink-0 text-xs font-black truncate text-foreground pl-4 border-r border-border/20">
              {topTeamName}
            </div>
            <div className="flex-1 flex divide-x divide-border/10">
              {Array.from({ length: inningCount }).map((_, i) => (
                <div key={`top-${i}`} className="flex-1 p-1 flex items-center justify-center">
                  <Input
                    type="tel"
                    pattern="[0-9]*"
                    placeholder="-"
                    value={battingOrder === 'second' ? (opponentInnings[i] || "") : (myInnings[i] || "")}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "" || /^[0-9]*$/.test(val)) {
                        if (battingOrder === 'second') {
                          const next = [...opponentInnings]; next[i] = val; setOpponentInnings(next);
                        } else {
                          const next = [...myInnings]; next[i] = val; setMyInnings(next);
                        }
                      }
                    }}
                    className={cn(
                      "w-8 h-8 p-0 text-center font-black text-xs border-0 rounded-lg transition-all bg-background",
                      ((battingOrder === 'second' && opponentInnings[i]) || (battingOrder !== 'second' && myInnings[i])) && "font-black text-primary"
                    )}
                  />
                </div>
              ))}
            </div>
            <div className="w-12 shrink-0 text-center font-black text-sm text-primary bg-primary/5 tabular-nums">
              {battingOrder === 'second' ? opponentTotalScore : myTotalScore}
            </div>
          </div>

          {/* 後攻の行 */}
          <div className="flex items-center h-12">
            <div className="w-24 shrink-0 text-xs font-black truncate text-foreground pl-4 border-r border-border/20">
              {bottomTeamName}
            </div>
            <div className="flex-1 flex divide-x divide-border/10">
              {Array.from({ length: inningCount }).map((_, i) => (
                <div key={`bottom-${i}`} className="flex-1 p-1 flex items-center justify-center">
                  <Input
                    type="tel"
                    pattern="[0-9]*"
                    placeholder="-"
                    value={battingOrder === 'second' ? (myInnings[i] || "") : (opponentInnings[i] || "")}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "" || /^[0-9]*$/.test(val)) {
                        if (battingOrder === 'second') {
                          const next = [...myInnings]; next[i] = val; setMyInnings(next);
                        } else {
                          const next = [...opponentInnings]; next[i] = val; setOpponentInnings(next);
                        }
                      }
                    }}
                    className={cn(
                      "w-8 h-8 p-0 text-center font-black text-xs border-0 rounded-lg transition-all bg-background",
                      ((battingOrder === 'second' && myInnings[i]) || (battingOrder !== 'second' && opponentInnings[i])) && "font-black text-primary"
                    )}
                  />
                </div>
              ))}
            </div>
            <div className="w-12 shrink-0 text-center font-black text-sm text-primary bg-primary/5 tabular-nums">
              {battingOrder === 'second' ? myTotalScore : opponentTotalScore}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
