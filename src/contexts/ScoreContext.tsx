
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
    myBattingIndex: 0,
    opponentBattingIndex: 0,
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

  // 🚀 1.5 履歴管理ラッパー
  const pushHistory = useCallback((prev: ScoreState, nextPartial: Partial<ScoreState>): ScoreState => {
    const { history, ...stateWithoutHistory } = prev;
    const newHistory = [...(history || []), stateWithoutHistory as ScoreState].slice(-30);
    return { ...prev, ...nextPartial, history: newHistory } as ScoreState;
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
          status: updatedState.status,
          balls: updatedState.balls,
          strikes: updatedState.strikes,
          outs: updatedState.outs,
          runners: updatedState.runners,
          myHits: updatedState.myHits,
          opponentHits: updatedState.opponentHits,
          opponentHits: updatedState.opponentHits,
          myErrors: updatedState.myErrors,
          opponentErrors: updatedState.opponentErrors,
          newAtBat: actionNote.includes("チェンジ") || actionNote.includes("三振") || actionNote.includes("フォアボール") || actionNote.includes("アウト") || actionNote.includes("安") || actionNote.includes("打") || actionNote.includes("エラー") || actionNote.includes("犠") ? {
            inning: updatedState.inning,
            isTop: updatedState.isTop,
            batterId: updatedState.batterId,
            pitcherId: updatedState.pitcherId,
            result: actionNote
          } : null,
          newPlayLog: {
            inningText: `${updatedState.inning}回${updatedState.isTop ? "表" : "裏"}`,
            resultType: "play",
            description: actionNote,
          }
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
          balls: m.balls ?? 0,
          strikes: m.strikes ?? 0,
          outs: m.outs ?? 0,
          runners: typeof m.runners === 'string' ? JSON.parse(m.runners) : (m.runners || { base1: null, base2: null, base3: null }),
          myHits: m.myHits ?? 0,
          opponentHits: m.opponentHits ?? 0,
          myErrors: m.myErrors ?? 0,
          opponentErrors: m.opponentErrors ?? 0,
          myBattingIndex: 0,
          opponentBattingIndex: 0,
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

      // 打席完了時に打順を進める
      let newMyBattingIndex = prev.myBattingIndex;
      let newOpponentBattingIndex = prev.opponentBattingIndex;
      
      if (isAtBatEnd) {
        const isMyAttack = (prev.isTop && prev.isGuestFirst) || (!prev.isTop && !prev.isGuestFirst);
        if (isMyAttack) {
          newMyBattingIndex = (prev.myBattingIndex + 1) % Math.max(9, prev.myLineup?.length || 9);
        } else {
          newOpponentBattingIndex = (prev.opponentBattingIndex + 1) % Math.max(9, prev.opponentLineup?.length || 9);
        }
      }

      // 現在のバッターIDを解決
      const isNextMyAttack = (isInningChange ? !prev.isTop : prev.isTop) === prev.isGuestFirst ? false : true;
      const currentLineup = isNextMyAttack ? prev.myLineup : prev.opponentLineup;
      const currentIndex = isNextMyAttack ? newMyBattingIndex : newOpponentBattingIndex;
      const nextBatterId = currentLineup && currentLineup.length > currentIndex ? currentLineup[currentIndex]?.playerId || null : null;

      const next = pushHistory(prev, {
        balls: isAtBatEnd ? 0 : newBalls,
        strikes: isAtBatEnd ? 0 : newStrikes,
        outs: isInningChange ? 0 : newOuts,
        isTop: isInningChange ? !prev.isTop : prev.isTop,
        inning: isInningChange && !prev.isTop ? prev.inning + 1 : prev.inning,
        runners: isInningChange ? { base1: null, base2: null, base3: null } : prev.runners,
        myBattingIndex: newMyBattingIndex,
        opponentBattingIndex: newOpponentBattingIndex,
        batterId: nextBatterId,
        logs: appendLog(isInningChange ? `${description} (チェンジ)` : description, prev),
      });

      if (isAtBatEnd || result === "out") syncWithBackend(next, description);
      return next;
    });
  };

  // 🚀 5. 得点・インプレイ記録 (イニング配列の更新)
  const recordInPlay = async (result: string, rbi: number, hits: number, errors: number) => {
    setState(prev => {
      if (!prev.isScorer) return prev;

      const currentIdx = prev.inning - 1;
      const isMyAttack = (prev.isTop && prev.isGuestFirst) || (!prev.isTop && !prev.isGuestFirst);
      
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

      const newMyScore = isMyAttack ? prev.myScore + actualRbi : prev.myScore;
      const newOpponentScore = !isMyAttack ? prev.opponentScore + actualRbi : prev.opponentScore;
      const newMyHits = isMyAttack ? prev.myHits + hits : prev.myHits;
      const newOpponentHits = !isMyAttack ? prev.opponentHits + hits : prev.opponentHits;
      const newMyErrors = !isMyAttack ? prev.myErrors + errors : prev.myErrors;
      const newOpponentErrors = isMyAttack ? prev.opponentErrors + errors : prev.opponentErrors;
      
      const updatedMyScores = [...prev.myInningScores];
      const updatedOpponentScores = [...prev.opponentInningScores];

      if (!isMyAttack) {
        while (updatedOpponentScores.length <= currentIdx) updatedOpponentScores.push(0);
        updatedOpponentScores[currentIdx] += actualRbi;
      } else {
        while (updatedMyScores.length <= currentIdx) updatedMyScores.push(0);
        updatedMyScores[currentIdx] += actualRbi;
      }

      const newOuts = prev.outs + (result.includes("アウト") || result.includes("犠") || result.includes("ゴロ") || result.includes("飛") || result.includes("直") || result.includes("併殺") ? 1 : 0);
      const isAtBatEnd = true;
      const isInningChange = newOuts >= 3;

      let newMyBattingIndex = prev.myBattingIndex;
      let newOpponentBattingIndex = prev.opponentBattingIndex;
      if (isMyAttack) {
        newMyBattingIndex = (prev.myBattingIndex + 1) % Math.max(9, prev.myLineup?.length || 9);
      } else {
        newOpponentBattingIndex = (prev.opponentBattingIndex + 1) % Math.max(9, prev.opponentLineup?.length || 9);
      }

      const nextIsMyAttack = (isInningChange ? !prev.isTop : prev.isTop) === prev.isGuestFirst ? false : true;
      const currentLineup = nextIsMyAttack ? prev.myLineup : prev.opponentLineup;
      const currentIndex = nextIsMyAttack ? newMyBattingIndex : newOpponentBattingIndex;
      const nextBatterId = currentLineup && currentLineup.length > currentIndex ? currentLineup[currentIndex]?.playerId || null : null;

      const next = pushHistory(prev, {
        myScore: newMyScore,
        opponentScore: newOpponentScore,
        myInningScores: updatedMyScores,
        opponentInningScores: updatedOpponentScores,
        myHits: newMyHits,
        opponentHits: newOpponentHits,
        myErrors: newMyErrors,
        opponentErrors: newOpponentErrors,
        balls: 0,
        strikes: 0,
        outs: isInningChange ? 0 : newOuts,
        runners: isInningChange ? { base1: null, base2: null, base3: null } : nextRunners,
        isTop: isInningChange ? !prev.isTop : prev.isTop,
        inning: isInningChange && !prev.isTop ? prev.inning + 1 : prev.inning,
        myBattingIndex: newMyBattingIndex,
        opponentBattingIndex: newOpponentBattingIndex,
        batterId: nextBatterId,
        logs: appendLog(isInningChange ? `${result} (チェンジ)` : result, prev),
      });

      syncWithBackend(next, result);
      return next;
    });
  };

  // 🚀 6. イニング交代
  const changeInning = () => {
    setState(prev => {
      if (!prev.isScorer) return prev;
      const next = pushHistory(prev, {
        isTop: !prev.isTop,
        inning: prev.isTop ? prev.inning : prev.inning + 1,
        balls: 0, strikes: 0, outs: 0,
        runners: { base1: null, base2: null, base3: null },
      });
      syncWithBackend(next, "イニング交代");
      return next;
    });
  };
  // 🚀 6.5 操作の取り消し (UNDO)
  const undo = useCallback(() => {
    setState(prev => {
      if (!prev.isScorer || !prev.history || prev.history.length === 0) return prev;
      
      const newHistory = [...prev.history];
      const previousState = newHistory.pop()!;
      const next = { ...previousState, history: newHistory };
      
      syncWithBackend(next, "操作取消 (UNDO)");
      return next;
    });
  }, [syncWithBackend]);
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
      const next = pushHistory(prev, { status: "finished", logs: appendLog("試合終了", prev) });
      syncWithBackend(next, "試合終了");
      return next;
    });
  };

  const substitutePlayer = useCallback((team: 'my' | 'opponent', orderIndex: number, newPlayerId: string, newPlayerName: string) => {
    setState(prev => {
      if (!prev.isScorer) return prev;
      
      const isMyTeam = team === 'my';
      const lineup = isMyTeam ? [...(prev.myLineup || [])] : [...(prev.opponentLineup || [])];
      
      if (lineup[orderIndex]) {
        lineup[orderIndex] = { ...lineup[orderIndex], playerId: newPlayerId, playerName: newPlayerName };
      } else {
        lineup[orderIndex] = { playerId: newPlayerId, playerName: newPlayerName, battingOrder: orderIndex + 1 };
      }

      return {
        ...prev,
        myLineup: isMyTeam ? lineup : prev.myLineup,
        opponentLineup: !isMyTeam ? lineup : prev.opponentLineup,
      };
    });
  }, []);

  // 🚀 10. 試合設定の更新
  const updateMatchSettings = (settings: Partial<ScoreState>) => {
    setState(prev => ({ ...prev, ...settings }));
  };

  return (
    <ScoreContext.Provider value={{
      state,
      isLoading,
      isSyncing,
      isScorer: state.isScorer,
      initMatch,
      recordPitch,
      recordInPlay,
      changeInning,
      updateRunners,
      resetBatter,
      undo,
      finishMatch,
      updateMatchSettings,
      substitutePlayer
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
