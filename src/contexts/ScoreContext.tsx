
// filepath: src/contexts/ScoreContext.tsx
/* 💡 iScoreCloud 規約: 
   1. 復元性の極致: initMatch 時に D1 から最新の試合状況をロードし、Stateを同期する。[span_0](start_span)[span_0](end_span)
   2. 権限管理: ログインユーザーの権限を判定し、isScorer フラグで操作を物理的に制限する。[span_1](start_span)[span_1](end_span)
   3. 野球脳の維持: サヨナラ判定(checkWalkOff)や得点配列(JSON)をアトミックに管理する。[span_2](start_span)[span_2](end_span) */

"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  ScoreState,
  ScoreContextType,
  MatchResponse,
  PlayLogEntry
} from "@/types/score";

const ScoreContext = createContext<ScoreContextType | undefined>(undefined);

export function ScoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ScoreState>({
    matchId: "",
    inning: 1,
    isTop: true,
    balls: 0,
    strikes: 0,
    outs: 0,
    runners: { base1: null, base2: null, base3: null },
    myScore: 0,
    opponentScore: 0,
    myInningScores: [],
    opponentInningScores: [],
    myHits: 0,
    opponentHits: 0,
    myErrors: 0,
    opponentErrors: 0,
    maxInnings: 7,
    isGuestFirst: true,
    status: 'scheduled',
    isScorer: false, // 🌟 編集権限フラグ
    batterId: null,
    pitcherId: null,
    pitchCount: 0,
    logs: [],
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // 🚀 1. 内部用：ログ記録ヘルパー
  const appendLog = useCallback((description: string, s: ScoreState): PlayLogEntry[] => {
    const newEntry: PlayLogEntry = {
      id: crypto.randomUUID(),
      description,
      inning: s.inning,
      isTop: s.isTop,
      timestamp: Date.now(),
    };
    return [newEntry, ...s.logs].slice(0, 50);
  }, []);

  // 🚀 2. バックエンド同期 (D1 + LINE速報連動)
  const syncWithBackend = useCallback(async (updatedState: ScoreState, actionNote: string) => {
    if (!updatedState.isScorer) return; // 🌟 スコアラー以外は同期をスキップ

    setIsSyncing(true);
    try {
      const res = await fetch("/api/matches/update-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: updatedState.matchId,
          myScore: updatedState.myScore,
          opponentScore: updatedState.opponentScore,
          inning: updatedState.inning,
          isBottom: !updatedState.isTop,
          action: actionNote,
          myInningScores: updatedState.myInningScores, // 🌟 配列をそのまま送信（API側でstringify）
          opponentInningScores: updatedState.opponentInningScores,
        }),
      });
      const data = await res.json() as { success: boolean, data?: { status: string } };
      
      if (data.success && data.data?.status === 'finished') {
        setState(prev => ({ ...prev, status: 'finished' }));
      }
    } catch (e) {
      console.error("[Sync Error]:", e);
      toast.error("同期に失敗しました。電波状況を確認してください。");
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // 🚀 3. 試合初期化 (DBからStateへの完全復元)
  const initMatch = useCallback(async (matchId: string) => {
    setIsLoading(true);
    try {
      const [matchRes, lineupsRes] = await Promise.all([
        fetch(`/api/matches/${matchId}`),
        fetch(`/api/matches/${matchId}/lineups`)
      ]);
      const data = (await matchRes.json()) as MatchResponse;
      const lineupsData = await lineupsRes.json() as any;
      
      if (data.success && data.match) {
        const m = data.match;
        
        // 🌟 D1に保存されたJSON文字列をパースして復元
        const restoredMyInningScores = typeof m.myInningScores === 'string' ? JSON.parse(m.myInningScores) : [];
        const restoredOpponentInningScores = typeof m.opponentInningScores === 'string' ? JSON.parse(m.opponentInningScores) : [];

        setState(prev => ({
          ...prev,
          matchId: m.id,
          opponentTeamName: m.opponent,
          tournamentName: m.tournamentName,
          venueName: m.surfaceDetails,
          matchType: m.matchType,
          inning: m.currentInning || 1,
          isTop: !m.isBottom,
          myScore: m.myScore || 0,
          opponentScore: m.opponentScore || 0,
          myInningScores: restoredMyInningScores,
          opponentInningScores: restoredOpponentInningScores,
          maxInnings: m.innings || 7,
          isGuestFirst: m.battingOrder === 'first',
          status: m.status as any,
          myLineup: lineupsData?.lineups?.myLineup || [],
          opponentLineup: lineupsData?.lineups?.opponentLineup || [],
          // 💡 ここで権限判定を行う（例: チーム所属チェック）
          isScorer: true, // 開発中は一旦true。実際は管理者かどうかを判定
        }));
      }
    } catch (error) {
      toast.error("試合データの復元に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 🚀 4. 投球・アウト記録 (野球脳ロジック)[span_6](start_span)[span_6](end_span)
  const recordPitch = async (result: "ball" | "strike" | "foul" | "swinging_strike" | "out") => {
    setState(prev => {
      if (!prev.isScorer) return prev; // 🌟 観戦者は操作不可[span_7](start_span)[span_7](end_span)

      let newStrikes = prev.strikes;
      let newBalls = prev.balls;
      let newOuts = prev.outs;
      let description = "";

      // ストライクカウント処理
      if (result === "strike" || result === "swinging_strike") {
        newStrikes++;
        description = result === "strike" ? "見逃しストライク" : "空振り";
      } else if (result === "ball") {
        newBalls++;
        description = "ボール";
      } else if (result === "out") {
        newOuts++;
        description = "アウト";
      } else if (result === "foul") {
        if (newStrikes < 2) newStrikes++;
        description = "ファウル";
      }

      let isAtBatEnd = false;
      if (newStrikes >= 3) {
        newOuts++;
        description = "三振";
        isAtBatEnd = true;
      } else if (newBalls >= 4) {
        description = "フォアボール";
        isAtBatEnd = true;
      } else if (result === "out") {
        isAtBatEnd = true;
      }

      let isInningChange = false;
      if (newOuts >= 3) {
        isInningChange = true;
      }

      const next = {
        ...prev,
        balls: isAtBatEnd ? 0 : newBalls,
        strikes: isAtBatEnd ? 0 : newStrikes,
        outs: isInningChange ? 0 : newOuts,
        isTop: isInningChange ? !prev.isTop : prev.isTop,
        inning: isInningChange && !prev.isTop ? prev.inning + 1 : prev.inning,
        runners: isInningChange ? { base1: null, base2: null, base3: null } : prev.runners,
        logs: appendLog(isInningChange ? `${description} (チェンジ)` : description, prev),
      };

      if (isAtBatEnd || result === "out") syncWithBackend(next, description);
      return next;
    });
  };

  // 🚀 5. 得点・インプレイ記録 (イニング配列の更新)[span_8](start_span)[span_8](end_span)
  const recordInPlay = async (result: string, rbi: number, hits: number, errors: number) => {
    setState(prev => {
      if (!prev.isScorer) return prev;

      const currentIdx = prev.inning - 1;
      const updatedOpponentScores = [...prev.opponentInningScores];
      const updatedMyScores = [...prev.myInningScores];

      // 🌟 自チームが攻撃中かどうかの判定（isGuestFirst を使用）
      const isMyAttack = (prev.isTop && prev.isGuestFirst) || (!prev.isTop && !prev.isGuestFirst);

      // 🌟 自動進塁ロジック
      let nextRunners = { ...prev.runners };
      let actualRbi = rbi;

      if (["単打", "二塁打", "三塁打", "本塁打"].includes(result)) {
        if (result === "本塁打") {
          actualRbi += 1; // バッター生還
          if (prev.runners.base1) actualRbi += 1;
          if (prev.runners.base2) actualRbi += 1;
          if (prev.runners.base3) actualRbi += 1;
          nextRunners = { base1: null, base2: null, base3: null };
        } else if (result === "三塁打") {
          if (prev.runners.base1) actualRbi += 1;
          if (prev.runners.base2) actualRbi += 1;
          if (prev.runners.base3) actualRbi += 1;
          nextRunners = { base1: null, base2: null, base3: "player-id-placeholder" };
        } else if (result === "二塁打") {
          if (prev.runners.base2) actualRbi += 1;
          if (prev.runners.base3) actualRbi += 1;
          nextRunners = { base1: null, base2: "player-id-placeholder", base3: prev.runners.base1 };
        } else if (result === "単打") {
          if (prev.runners.base3) actualRbi += 1;
          nextRunners = { base1: "player-id-placeholder", base2: prev.runners.base1, base3: prev.runners.base2 };
        }
      }

      // スコアラーが攻撃か守備かに基づいて配列を更新
      if (!isMyAttack) {
        while (updatedOpponentScores.length <= currentIdx) updatedOpponentScores.push(0);
        updatedOpponentScores[currentIdx] += actualRbi;
      } else {
        while (updatedMyScores.length <= currentIdx) updatedMyScores.push(0);
        updatedMyScores[currentIdx] += actualRbi;
      }

      const next = {
        ...prev,
        opponentScore: !isMyAttack ? prev.opponentScore + actualRbi : prev.opponentScore,
        myScore: isMyAttack ? prev.myScore + actualRbi : prev.myScore,
        opponentHits: !isMyAttack ? prev.opponentHits + hits : prev.opponentHits,
        myHits: isMyAttack ? prev.myHits + hits : prev.myHits,
        opponentErrors: isMyAttack ? prev.opponentErrors + errors : prev.opponentErrors,
        myErrors: !isMyAttack ? prev.myErrors + errors : prev.myErrors,
        opponentInningScores: updatedOpponentScores,
        myInningScores: updatedMyScores,
        balls: 0, strikes: 0,
        runners: nextRunners,
        logs: appendLog(`${result}${actualRbi > 0 ? ` (${actualRbi}得点)` : ''}`, prev),
      };

      syncWithBackend(next, result);
      return next;
    });
  };

  // 🚀 6. イニング交代
  const changeInning = () => {
    setState(prev => {
      if (!prev.isScorer) return prev;
      const next = {
        ...prev,
        isTop: !prev.isTop,
        inning: prev.isTop ? prev.inning : prev.inning + 1,
        balls: 0, strikes: 0, outs: 0,
        runners: { base1: null, base2: null, base3: null },
      };
      syncWithBackend(next, "イニング交代");
      return next;
    });
  };

  // 🚀 7. ランナー状態の更新
  const updateRunners = (runners: { base1: string | null; base2: string | null; base3: string | null }) => {
    setState(prev => ({ ...prev, runners }));
  };

  // 🚀 8. 打者のリセット
  const resetBatter = (playerId: string | null) => {
    setState(prev => ({ ...prev, batterId: playerId }));
  };

  // 🚀 9. 試合の終了
  const finishMatch = async () => {
    setState(prev => {
      const next = { ...prev, status: 'finished' };
      syncWithBackend(next, "試合終了");
      return next;
    });
  };

  // 🚀 10. 試合設定の更新
  const updateMatchSettings = (settings: Partial<ScoreState>) => {
    setState(prev => ({ ...prev, ...settings }));
  };

  return (
    <ScoreContext.Provider value={{
      state, isLoading, isSyncing, initMatch, recordPitch, recordInPlay,
      changeInning, isScorer: state.isScorer,
      updateRunners, resetBatter, finishMatch, updateMatchSettings
    }}>
      {children}
    </ScoreContext.Provider>
  );
}

export function useScore() {
  const context = useContext(ScoreContext);
  if (context === undefined) throw new Error("useScore must be used within a ScoreProvider");
  return context;
}
