
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
  const appendLog = useCallback((
    description: string,
    s: ScoreState,
    overrideBso?: { balls: number; strikes: number; outs: number }
  ): PlayLogEntry[] => {
    const bso = overrideBso || { balls: s.balls, strikes: s.strikes, outs: s.outs };
    const bsoSuffix = ` [B:${bso.balls}, S:${bso.strikes}, O:${bso.outs}]`;
    const fullDesc = description.includes("[B:") ? description : `${description}${bsoSuffix}`;
    const newEntry: PlayLogEntry = {
      id: crypto.randomUUID(),
      description: fullDesc,
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
  const syncWithBackend = useCallback(async (updatedState: ScoreState, actionNote: string, skipLineReport = false) => {
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
          skipLineReport, // 🌟 追加
          myInningScores: updatedState.myInningScores, // 🌟 配列をそのまま送信（API側でstringify）
          opponentInningScores: updatedState.opponentInningScores,
          status: updatedState.status,
          balls: updatedState.balls,
          strikes: updatedState.strikes,
          outs: updatedState.outs,
          runners: updatedState.runners,
          myHits: updatedState.myHits,
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
            inningText: updatedState.logs[0]
              ? `${updatedState.logs[0].inning}回${updatedState.logs[0].isTop ? "表" : "裏"}`
              : `${updatedState.inning}回${updatedState.isTop ? "表" : "裏"}`,
            resultType: "play",
            description: updatedState.logs[0]?.description || actionNote,
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
      const [matchRes, lineupsRes, logsRes] = await Promise.all([
        fetch(`/api/matches/${matchId}`),
        fetch(`/api/matches/${matchId}/lineups`),
        fetch(`/api/matches/${matchId}/logs`)
      ]);
      const data = (await matchRes.json()) as MatchResponse;
      const lineupsData = await lineupsRes.json() as any;
      const logsData = await logsRes.json() as any;
      
      if (data.success && data.match) {
        const m = data.match;
        
        // 🌟 D1に保存されたJSON文字列をパースして復元
        const restoredMyInningScores = typeof m.myInningScores === 'string' ? JSON.parse(m.myInningScores) : [];
        const restoredOpponentInningScores = typeof m.opponentInningScores === 'string' ? JSON.parse(m.opponentInningScores) : [];
        
        // ログの復元
        const restoredLogs = logsData?.success && Array.isArray(logsData.logs) ? logsData.logs : [];

        // 🌟 プレイログを解析して打順（myBattingIndex, opponentBattingIndex）を復元
        let myBattingIndex = 0;
        let opponentBattingIndex = 0;
        let foundMy = false;
        let foundOpponent = false;

        const isGuestFirst = m.battingOrder === 'first';
        const myLineup = lineupsData?.lineups?.myLineup || [];
        const opponentLineup = lineupsData?.lineups?.opponentLineup || [];

        // 打席完了の判定用正規表現（安打、四死球、アウト、エラー、犠打飛、併殺などの完了系キーワード）
        const atBatEndRegex = /三振|フォアボール|デッドボール|アウト|単打|二塁打|三塁打|本塁打|安|二|三|本|ゴロ|飛|直|犠|失|エラー|併殺|1B|2B|3B|HR|GO|FO|LO|SO|E|FC|DP|SH|SF|ERR|OUT|SAC/;

        for (const log of restoredLogs) {
          if (foundMy && foundOpponent) break;

          const matchObj = log.description.match(/^(\d+)番/);
          if (!matchObj) continue;

          const batterOrder = parseInt(matchObj[1], 10);
          const isAtBatEnd = atBatEndRegex.test(log.description);
          
          // log.isTop が true で isGuestFirst が true ➔ 表で先攻なので自チームの攻撃
          // log.isTop が false で isGuestFirst が false ➔ 裏で後攻なので自チームの攻撃
          const isMyAttackLog = log.isTop === isGuestFirst;

          if (isMyAttackLog && !foundMy) {
            const lineupLength = myLineup.length || 9;
            const maxIndex = Math.max(9, lineupLength);
            if (isAtBatEnd) {
              myBattingIndex = (batterOrder) % maxIndex;
            } else {
              myBattingIndex = (batterOrder - 1) % maxIndex;
            }
            foundMy = true;
          } else if (!isMyAttackLog && !foundOpponent) {
            const lineupLength = opponentLineup.length || 9;
            const maxIndex = Math.max(9, lineupLength);
            if (isAtBatEnd) {
              opponentBattingIndex = (batterOrder) % maxIndex;
            } else {
              opponentBattingIndex = (batterOrder - 1) % maxIndex;
            }
            foundOpponent = true;
          }
        }

        // 現在のバッターIDを解決
        const isTop = !m.isBottom;
        const isMyAttack = (isTop && isGuestFirst) || (!isTop && !isGuestFirst);
        const currentLineup = isMyAttack ? myLineup : opponentLineup;
        const currentIndex = isMyAttack ? myBattingIndex : opponentBattingIndex;
        const batterId = currentLineup && currentLineup.length > currentIndex
          ? currentLineup[currentIndex]?.playerId || currentLineup[currentIndex]?.id || null
          : null;

        setState(prev => ({
          ...prev,
          matchId: m.id,
          teamId: m.teamId,
          opponentTeamName: m.opponent,
          tournamentName: m.tournamentName,
          venueName: m.surfaceDetails,
          matchType: m.matchType,
          inning: m.currentInning || 1,
          isTop,
          myScore: m.myScore || 0,
          opponentScore: m.opponentScore || 0,
          myInningScores: restoredMyInningScores,
          opponentInningScores: restoredOpponentInningScores,
          maxInnings: m.innings || 7,
          isGuestFirst,
          status: m.status as any,
          myLineup,
          opponentLineup,
          balls: m.balls ?? 0,
          strikes: m.strikes ?? 0,
          outs: m.outs ?? 0,
          runners: typeof m.runners === 'string' ? JSON.parse(m.runners) : (m.runners || { base1: null, base2: null, base3: null }),
          myHits: m.myHits ?? 0,
          opponentHits: m.opponentHits ?? 0,
          myErrors: m.myErrors ?? 0,
          opponentErrors: m.opponentErrors ?? 0,
          myBattingIndex,
          opponentBattingIndex,
          batterId,
          logs: restoredLogs, // 🌟 プレイログを復元
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

  // 🚀 4. 投球・アウト記録 (野球脳ロジック)
  const recordPitch = async (result: "ball" | "strike" | "foul" | "swinging_strike" | "out" | "hbp") => {
    setState(prev => {
      if (!prev.isScorer) return prev; // 🌟 観戦者は操作不可

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
      } else if (result === "hbp") {
        description = "デッドボール";
      }

      let isAtBatEnd = false;
      if (result === "hbp") {
        isAtBatEnd = true;
      } else if (newStrikes >= 3) {
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

      const isMyAttack = (prev.isTop && prev.isGuestFirst) || (!prev.isTop && !prev.isGuestFirst);

      // 四死球時の自動進塁＆押し出しロジック
      let nextRunners = { ...prev.runners };
      let actualRbi = 0;
      const batter = isMyAttack ? prev.myLineup?.[prev.myBattingIndex] : prev.opponentLineup?.[prev.opponentBattingIndex];
      const batterId = batter?.playerId || batter?.id || "player-id-placeholder";

      if (isAtBatEnd && (result === "hbp" || newBalls >= 4)) {
        if (!prev.runners.base1) {
          nextRunners.base1 = batterId;
        } else if (!prev.runners.base2) {
          nextRunners.base2 = prev.runners.base1;
          nextRunners.base1 = batterId;
        } else if (!prev.runners.base3) {
          nextRunners.base3 = prev.runners.base2;
          nextRunners.base2 = prev.runners.base1;
          nextRunners.base1 = batterId;
        } else {
          // 満塁押し出し！
          actualRbi = 1;
          nextRunners.base3 = prev.runners.base2;
          nextRunners.base2 = prev.runners.base1;
          nextRunners.base1 = batterId;
        }
      }

      // 得点計算
      const newMyScore = isMyAttack ? prev.myScore + actualRbi : prev.myScore;
      const newOpponentScore = !isMyAttack ? prev.opponentScore + actualRbi : prev.opponentScore;
      const updatedMyScores = [...prev.myInningScores];
      const updatedOpponentScores = [...prev.opponentInningScores];
      const currentIdx = prev.inning - 1;

      if (actualRbi > 0) {
        if (!isMyAttack) {
          while (updatedOpponentScores.length <= currentIdx) updatedOpponentScores.push(0);
          updatedOpponentScores[currentIdx] += actualRbi;
        } else {
          while (updatedMyScores.length <= currentIdx) updatedMyScores.push(0);
          updatedMyScores[currentIdx] += actualRbi;
        }
      }

      // 打席完了時に打順を進める
      let newMyBattingIndex = prev.myBattingIndex;
      let newOpponentBattingIndex = prev.opponentBattingIndex;
      
      if (isAtBatEnd) {
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

      // 💡 プレイログ用のテキスト整形（打順と打者名を prepending）
      const batterName = batter ? (batter.playerName || batter.name || "打者") : "打者";
      const batterOrder = isMyAttack ? prev.myBattingIndex + 1 : prev.opponentBattingIndex + 1;
      const batterPrefix = `${batterOrder}番 ${batterName}: `;

      const logText = isInningChange ? `${description} (チェンジ)` : description;
      const fullLogText = `${batterPrefix}${logText}`;

      const next = pushHistory(prev, {
        myScore: newMyScore,
        opponentScore: newOpponentScore,
        myInningScores: updatedMyScores,
        opponentInningScores: updatedOpponentScores,
        balls: isAtBatEnd ? 0 : newBalls,
        strikes: isAtBatEnd ? 0 : newStrikes,
        outs: isInningChange ? 0 : newOuts,
        isTop: isInningChange ? !prev.isTop : prev.isTop,
        inning: isInningChange && !prev.isTop ? prev.inning + 1 : prev.inning,
        runners: isInningChange ? { base1: null, base2: null, base3: null } : nextRunners,
        myBattingIndex: newMyBattingIndex,
        opponentBattingIndex: newOpponentBattingIndex,
        batterId: nextBatterId,
        logs: appendLog(fullLogText, prev, { balls: newBalls, strikes: newStrikes, outs: newOuts }),
      });

      // 毎球同期する！ (打席未完了なら skipLineReport = true)
      syncWithBackend(next, fullLogText, !isAtBatEnd);
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

      const batter = isMyAttack ? prev.myLineup?.[prev.myBattingIndex] : prev.opponentLineup?.[prev.opponentBattingIndex];
      const batterId = batter?.playerId || batter?.id || "player-id-placeholder";

      // 💡 クイックボタンと詳細打球記録の分岐
      if (["単打", "二塁打", "三塁打", "本塁打"].includes(result)) {
        actualRbi = 0; // 自動算出のためリセット
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
          nextRunners = { base1: null, base2: null, base3: batterId };
        } else if (result === "二塁打") {
          if (prev.runners.base2) actualRbi += 1;
          if (prev.runners.base3) actualRbi += 1;
          nextRunners = { base1: null, base2: batterId, base3: prev.runners.base1 };
        } else if (result === "単打") {
          if (prev.runners.base3) actualRbi += 1;
          nextRunners = { base1: batterId, base2: prev.runners.base1, base3: prev.runners.base2 };
        }
      } else {
        // 詳細記録 (例: "右安", "左二", "遊ゴロ" 等)
        // actualRbi はモーダルから渡されたものをそのまま使用
        const isHR = result.endsWith("本");
        const is3B = result.endsWith("三");
        const is2B = result.endsWith("二");
        const is1B = result.endsWith("安");

        if (isHR) {
          nextRunners = { base1: null, base2: null, base3: null };
        } else if (is3B) {
          nextRunners = { base1: null, base2: null, base3: batterId };
        } else if (is2B) {
          nextRunners = { base1: null, base2: batterId, base3: prev.runners.base1 };
        } else if (is1B) {
          nextRunners = { base1: batterId, base2: prev.runners.base1, base3: prev.runners.base2 };
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

      // 💡 得点や盗塁など、打席完了ではない非打席プレイの判定
      const isNotAtBat = ["得点", "盗塁", "暴投", "ボーク", "守備交代", "走者状況変更"].includes(result);
      const isAtBatEnd = !isNotAtBat;

      const newOuts = prev.outs + (isAtBatEnd && (result.includes("アウト") || result.includes("犠") || result.includes("ゴロ") || result.includes("飛") || result.includes("直") || result.includes("併殺")) ? 1 : 0);
      const isInningChange = newOuts >= 3;

      let newMyBattingIndex = prev.myBattingIndex;
      let newOpponentBattingIndex = prev.opponentBattingIndex;
      
      if (isAtBatEnd) {
        if (isMyAttack) {
          newMyBattingIndex = (prev.myBattingIndex + 1) % Math.max(9, prev.myLineup?.length || 9);
        } else {
          newOpponentBattingIndex = (prev.opponentBattingIndex + 1) % Math.max(9, prev.opponentLineup?.length || 9);
        }
      }

      const nextIsMyAttack = (isInningChange ? !prev.isTop : prev.isTop) === prev.isGuestFirst ? false : true;
      const currentLineup = nextIsMyAttack ? prev.myLineup : prev.opponentLineup;
      const currentIndex = nextIsMyAttack ? newMyBattingIndex : newOpponentBattingIndex;
      const nextBatterId = currentLineup && currentLineup.length > currentIndex ? currentLineup[currentIndex]?.playerId || null : null;

      // 💡 プレイログ用のテキスト整形（打順と打者名を prepending）
      const batterName = batter ? (batter.playerName || batter.name || "打者") : "打者";
      const batterOrder = isMyAttack ? prev.myBattingIndex + 1 : prev.opponentBattingIndex + 1;
      const batterPrefix = isNotAtBat ? "" : `${batterOrder}番 ${batterName}: `;

      const logText = isInningChange ? `${result} (チェンジ)` : result;
      const fullLogText = `${batterPrefix}${logText}`;

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
        logs: appendLog(fullLogText, prev, { balls: prev.balls, strikes: prev.strikes, outs: newOuts }),
      });

      syncWithBackend(next, fullLogText);
      return next;
    });
  };

  // 🚀 5.5 走者個別アクション（盗塁、牽制死、進塁など）の記録
  const recordRunnerAction = async (
    baseNum: 1 | 2 | 3,
    action: "steal_success" | "steal_out" | "pickoff_out" | "wp_advance" | "pb_advance" | "balk_advance" | "error_advance" | "clear",
    assignPlayerId?: string
  ) => {
    setState(prev => {
      if (!prev.isScorer) return prev;

      const key = `base${baseNum}` as keyof typeof prev.runners;
      const runnerId = prev.runners[key];

      // ランナーがいないのにアクションを起こした（配置する場合）
      if (!runnerId && assignPlayerId) {
        const nextRunners = { ...prev.runners, [key]: assignPlayerId };
        
        // 選手名を取得
        const isMyAttack = (prev.isTop && prev.isGuestFirst) || (!prev.isTop && !prev.isGuestFirst);
        const offenseLineup = isMyAttack ? prev.myLineup : prev.opponentLineup;
        const player = offenseLineup?.find(p => p.playerId === assignPlayerId || p.id === assignPlayerId);
        let playerName = player?.playerName || player?.name || "走者";
        if (!player && assignPlayerId && assignPlayerId.startsWith("custom-")) {
          playerName = assignPlayerId.split("-")[1];
        }

        const logText = `${baseNum}塁走者として ${playerName} を配置`;
        const next = pushHistory(prev, {
          runners: nextRunners,
          logs: appendLog(logText, prev)
        });
        syncWithBackend(next, logText, true);
        return next;
      }

      if (!runnerId) return prev; // ランナーがいない場合は何もしない

      // 選手名を取得
      const isMyAttack = (prev.isTop && prev.isGuestFirst) || (!prev.isTop && !prev.isGuestFirst);
      const offenseLineup = isMyAttack ? prev.myLineup : prev.opponentLineup;
      const player = offenseLineup?.find(p => p.playerId === runnerId || p.id === runnerId);
      let playerName = player?.playerName || player?.name || "走者";
      if (!player && runnerId && runnerId.startsWith("custom-")) {
        playerName = runnerId.split("-")[1];
      }

      let nextRunners = { ...prev.runners };
      let newOuts = prev.outs;
      let actualRbi = 0;
      let logText = "";

      if (action === "clear") {
        nextRunners[key] = null;
        const next = pushHistory(prev, { runners: nextRunners });
        syncWithBackend(next, `${baseNum}塁走者解除`, true);
        return next;
      }

      // 各アクションの処理
      if (action === "steal_success") {
        nextRunners[key] = null;
        if (baseNum === 3) {
          actualRbi = 1;
          logText = `${baseNum}塁走者 ${playerName}: 盗塁成功により本塁生還`;
        } else {
          const nextKey = `base${baseNum + 1}` as keyof typeof prev.runners;
          nextRunners[nextKey] = runnerId;
          logText = `${baseNum}塁走者 ${playerName}: 盗塁成功`;
        }
      } else if (action === "steal_out") {
        nextRunners[key] = null;
        newOuts++;
        logText = `${baseNum}塁走者 ${playerName}: 盗塁死`;
      } else if (action === "pickoff_out") {
        nextRunners[key] = null;
        newOuts++;
        logText = `${baseNum}塁走者 ${playerName}: 牽制死`;
      } else if (action === "wp_advance") {
        nextRunners[key] = null;
        if (baseNum === 3) {
          actualRbi = 1;
          logText = `${baseNum}塁走者 ${playerName}: 暴投により本塁生還`;
        } else {
          const nextKey = `base${baseNum + 1}` as keyof typeof prev.runners;
          nextRunners[nextKey] = runnerId;
          logText = `${baseNum}塁走者 ${playerName}: 暴投で進塁`;
        }
      } else if (action === "pb_advance") {
        nextRunners[key] = null;
        if (baseNum === 3) {
          actualRbi = 1;
          logText = `${baseNum}塁走者 ${playerName}: 捕逸により本塁生還`;
        } else {
          const nextKey = `base${baseNum + 1}` as keyof typeof prev.runners;
          nextRunners[nextKey] = runnerId;
          logText = `${baseNum}塁走者 ${playerName}: 捕逸で進塁`;
        }
      } else if (action === "balk_advance") {
        nextRunners[key] = null;
        if (baseNum === 3) {
          actualRbi = 1;
          logText = `${baseNum}塁走者 ${playerName}: ボークにより本塁生還`;
        } else {
          const nextKey = `base${baseNum + 1}` as keyof typeof prev.runners;
          nextRunners[nextKey] = runnerId;
          logText = `${baseNum}塁走者 ${playerName}: ボークで進塁`;
        }
      } else if (action === "error_advance") {
        nextRunners[key] = null;
        if (baseNum === 3) {
          actualRbi = 1;
          logText = `${baseNum}塁走者 ${playerName}: エラーにより本塁生還`;
        } else {
          const nextKey = `base${baseNum + 1}` as keyof typeof prev.runners;
          nextRunners[nextKey] = runnerId;
          logText = `${baseNum}塁走者 ${playerName}: エラーで進塁`;
        }
      }

      // アウト数によるチェンジ判定
      const isInningChange = newOuts >= 3;

      // 得点計算
      const newMyScore = isMyAttack ? prev.myScore + actualRbi : prev.myScore;
      const newOpponentScore = !isMyAttack ? prev.opponentScore + actualRbi : prev.opponentScore;
      const updatedMyScores = [...prev.myInningScores];
      const updatedOpponentScores = [...prev.opponentInningScores];
      const currentIdx = prev.inning - 1;

      if (actualRbi > 0) {
        if (!isMyAttack) {
          while (updatedOpponentScores.length <= currentIdx) updatedOpponentScores.push(0);
          updatedOpponentScores[currentIdx] += actualRbi;
        } else {
          while (updatedMyScores.length <= currentIdx) updatedMyScores.push(0);
          updatedMyScores[currentIdx] += actualRbi;
        }
      }

      const logFinalText = isInningChange ? `${logText} (チェンジ)` : logText;

      const next = pushHistory(prev, {
        myScore: newMyScore,
        opponentScore: newOpponentScore,
        myInningScores: updatedMyScores,
        opponentInningScores: updatedOpponentScores,
        outs: isInningChange ? 0 : newOuts,
        runners: isInningChange ? { base1: null, base2: null, base3: null } : nextRunners,
        isTop: isInningChange ? !prev.isTop : prev.isTop,
        inning: isInningChange && !prev.isTop ? prev.inning + 1 : prev.inning,
        logs: appendLog(logFinalText, prev, { balls: prev.balls, strikes: prev.strikes, outs: newOuts })
      });

      syncWithBackend(next, logFinalText);
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
    setState(prev => {
      if (!prev.isScorer) return prev;
      const next = pushHistory(prev, { runners });
      syncWithBackend(next, "走者状況変更", true);
      return next;
    });
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

  const substitutePlayer = useCallback((
    team: 'my' | 'opponent',
    orderIndex: number,
    newPlayerId: string,
    newPlayerName: string,
    uniformNumber?: string,
    position?: string
  ) => {
    setState(prev => {
      if (!prev.isScorer) return prev;
      
      const isMyTeam = team === 'my';
      const lineup = isMyTeam ? [...(prev.myLineup || [])] : [...(prev.opponentLineup || [])];
      
      const oldPlayerName = lineup[orderIndex]?.playerName || lineup[orderIndex]?.name || "未設定";

      if (lineup[orderIndex]) {
        lineup[orderIndex] = {
          ...lineup[orderIndex],
          playerId: newPlayerId,
          playerName: newPlayerName,
          name: newPlayerName, // backup name field
          uniformNumber: uniformNumber !== undefined ? uniformNumber : lineup[orderIndex].uniformNumber,
          position: position !== undefined ? position : lineup[orderIndex].position,
        };
      } else {
        lineup[orderIndex] = {
          playerId: newPlayerId,
          playerName: newPlayerName,
          name: newPlayerName,
          battingOrder: orderIndex + 1,
          uniformNumber: uniformNumber || "",
          position: position || "",
        };
      }

      // Check if substituted player is the active batter
      const isMyAttack = (prev.isTop && prev.isGuestFirst) || (!prev.isTop && !prev.isGuestFirst);
      let nextBatterId = prev.batterId;
      if (isMyTeam === isMyAttack && orderIndex === (isMyTeam ? prev.myBattingIndex : prev.opponentBattingIndex)) {
        nextBatterId = newPlayerId;
      }

      const teamLabel = isMyTeam ? "自チーム" : "相手チーム";
      const logText = `選手交代[${teamLabel}]: ${orderIndex + 1}番 ${oldPlayerName} ➔ ${newPlayerName}`;
      const updatedLogs = appendLog(logText, prev);

      const next = {
        ...prev,
        myLineup: isMyTeam ? lineup : prev.myLineup,
        opponentLineup: !isMyTeam ? lineup : prev.opponentLineup,
        batterId: nextBatterId,
        logs: updatedLogs,
      };

      // Sync updated lineups to database!
      if (prev.matchId) {
        fetch(`/api/matches/${prev.matchId}/lineups`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            myLineup: next.myLineup,
            opponentLineup: next.opponentLineup,
            myAttendance: {}
          }),
        }).catch(err => console.error("Error syncing lineups:", err));

        // Sync to update score state history/D1 logs
        syncWithBackend(next, logText);
      }

      return next;
    });
  }, [appendLog, syncWithBackend]);

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
      recordRunnerAction,
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
