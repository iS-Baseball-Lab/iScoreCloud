// filepath: `src/components/score/PlayArea.tsx`
"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useScore } from "@/contexts/ScoreContext";
import { cn } from "@/lib/utils";
import { RunnerActionModal } from "./RunnerActionModal";
import { SubstitutionModal } from "./SubstitutionModal";
import { X, UserPlus, Check, User, ChevronDown } from "lucide-react";

export function PlayArea() {
  const { state, updateRunners, recordInPlay, recordRunnerAction, substitutePlayer, forceAcquireLock } = useScore();
  const { runners } = state;

  // モーダル・アサイン用状態管理
  const [selectedBase, setSelectedBase] = useState<1 | 2 | 3 | null>(null);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [benchPlayers, setBenchPlayers] = useState<any[]>([]);
  const [customPlayerName, setCustomPlayerName] = useState("");
  const [mounted, setMounted] = useState(false);

  // 選手交代モーダル状態管理
  const [subOpen, setSubOpen] = useState(false);
  const [subInitialTab, setSubInitialTab] = useState<'my' | 'opponent'>('my');
  const [subInitialSlot, setSubInitialSlot] = useState<number | null>(null);

  // 打席履歴トグル用 ('current' | 'next' | null)
  const [activeHistory, setActiveHistory] = useState<'current' | 'next' | null>(null);

  // 投手投球数ポップアップ
  const [showPitcherInningCounts, setShowPitcherInningCounts] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const isMyAttack = (state.isTop && state.isGuestFirst) || (!state.isTop && !state.isGuestFirst);
  const offenseLineup = isMyAttack ? state.myLineup : state.opponentLineup;

  // 攻撃チームのベンチメンバーをロードする（代走選定用）
  useEffect(() => {
    if (!state.teamId || !isMyAttack) {
      setBenchPlayers([]);
      return;
    }
    fetch(`/api/teams/${state.teamId}/players`)
      .then((res) => res.json())
      .then((data: any) => {
        if (data.success && Array.isArray(data.players)) {
          // すでにスタメンにいる選手を除外
          const activeIds = offenseLineup?.map((p) => p.playerId || p.id) || [];
          const inactive = data.players.filter((p: any) => !activeIds.includes(p.id));
          setBenchPlayers(inactive);
        }
      })
      .catch((err) => console.error("Error loading roster in PlayArea:", err));
  }, [state.teamId, isMyAttack, offenseLineup]);

  const getRunnerName = (runnerId: string | null) => {
    if (!runnerId) return "";
    if (runnerId.startsWith("custom-")) {
      return runnerId.split("-")[1];
    }
    const player = offenseLineup?.find((p) => p.playerId === runnerId || p.id === runnerId);
    return player?.playerName || player?.name || "走者";
  };

  const getPitcherCount = () => {
    const defenseLineup = state.isTop 
      ? (state.isGuestFirst ? state.opponentLineup : state.myLineup)
      : (state.isGuestFirst ? state.myLineup : state.opponentLineup);
    
    if (!defenseLineup) return 0;
    
    const pitcherSlot = defenseLineup.findIndex((p) => p.position === "1");
    const isMyDefense = defenseLineup === state.myLineup;
    const defendingTeamLabel = isMyDefense ? "自チーム" : "相手チーム";
    
    let count = 0;
    for (const log of state.logs) {
      // 投手交代のログがあれば、それ以前の投球はカウントしない
      if (pitcherSlot !== -1) {
        if (
          log.description.includes("選手交代") &&
          log.description.includes(defendingTeamLabel) &&
          log.description.includes(`${pitcherSlot + 1}番`)
        ) {
          break;
        }
      }
      
      // 現在のイニング表裏と同じ（＝同じチームが守備している時のログ）
      if (log.isTop === state.isTop) {
        const desc = log.description;
        // 打席のプレイ（投球・打球）を表すログかどうか判定
        // 「X番 」で始まり、盗塁・進塁・選手交代を含まないもの
        if (
          /^\d+番\s/.test(desc) &&
          !desc.includes("盗塁") &&
          !desc.includes("進塁") &&
          !desc.includes("選手交代")
        ) {
          count++;
        }
      }
    }
    return count;
  };

  const getPitcherInningCounts = () => {
    const defenseLineup = state.isTop 
      ? (state.isGuestFirst ? state.opponentLineup : state.myLineup)
      : (state.isGuestFirst ? state.myLineup : state.opponentLineup);
    
    const result: { inning: number; count: number }[] = [];
    if (!defenseLineup) return result;
    
    const pitcherSlot = defenseLineup.findIndex((p) => p.position === "1");
    const isMyDefense = defenseLineup === state.myLineup;
    const defendingTeamLabel = isMyDefense ? "自チーム" : "相手チーム";
    
    const countsMap: Record<number, number> = {};
    
    for (const log of state.logs) {
      // 投手交代のログがあれば、それ以前の投球はカウントしない
      if (pitcherSlot !== -1) {
        if (
          log.description.includes("選手交代") &&
          log.description.includes(defendingTeamLabel) &&
          log.description.includes(`${pitcherSlot + 1}番`)
        ) {
          break;
        }
      }
      
      // 該当ピッチャーが投げるイニング（表/裏が一致するログ）
      if (log.isTop === state.isTop) {
        const desc = log.description;
        if (
          /^\d+番\s/.test(desc) &&
          !desc.includes("盗塁") &&
          !desc.includes("進塁") &&
          !desc.includes("選手交代")
        ) {
          countsMap[log.inning] = (countsMap[log.inning] || 0) + 1;
        }
      }
    }
    
    return Object.entries(countsMap)
      .map(([inn, cnt]) => ({ inning: parseInt(inn, 10), count: cnt }))
      .sort((a, b) => a.inning - b.inning);
  };

  const handleBaseClick = (baseNum: 1 | 2 | 3) => {
    if (!state.isScorer) return;

    const key = `base${baseNum}` as keyof typeof runners;
    const isCurrentlyRunner = !!runners[key];
    
    setSelectedBase(baseNum);
    if (isCurrentlyRunner) {
      setIsActionModalOpen(true);
    } else {
      setIsAssignModalOpen(true);
      setCustomPlayerName("");
    }
    
    if (window.navigator.vibrate) window.navigator.vibrate(10);
  };

  const handleFielderClick = (posNum: string) => {
    if (!state.isScorer) return;

    // 1. 守備チームの特定
    const defenseLineup = state.isTop 
      ? (state.isGuestFirst ? state.opponentLineup : state.myLineup)
      : (state.isGuestFirst ? state.myLineup : state.opponentLineup);
    
    if (!defenseLineup) return;

    // 2. 自チームか相手チームか
    const isMyDefense = defenseLineup === state.myLineup;
    const team = isMyDefense ? 'my' : 'opponent';

    // 3. このポジションの選手が lineup 配列のどのインデックス（0〜8）にいるか探す
    const slotIndex = defenseLineup.findIndex(p => p.position === posNum);

    // 4. モーダルを開く
    setSubInitialTab(team);
    setSubInitialSlot(slotIndex !== -1 ? slotIndex : null);
    setSubOpen(true);
    
    if (window.navigator.vibrate) window.navigator.vibrate(10);
  };

  const handleAssignRunner = async (playerId: string) => {
    if (!selectedBase) return;
    await recordRunnerAction(selectedBase, "steal_success", playerId);
    setIsAssignModalOpen(false);
  };

  const handleCustomAssignRunner = async () => {
    if (!selectedBase || !customPlayerName.trim()) return;
    const customId = `custom-${customPlayerName.trim()}`;
    await recordRunnerAction(selectedBase, "steal_success", customId);
    setIsAssignModalOpen(false);
  };

  const Base = ({ baseNum, isRunner }: { baseNum: 1 | 2 | 3; isRunner: boolean }) => {
    const positions = {
      1: "right-0 top-1/2 -translate-y-1/2 translate-x-1/2",
      2: "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2",
      3: "left-0 top-1/2 -translate-y-1/2 -translate-x-1/2",
    };

    const runnerId = runners[`base${baseNum}` as keyof typeof runners];
    const name = getRunnerName(runnerId);

    return (
      <div className={cn("absolute z-20 flex flex-col items-center", positions[baseNum])}>
        {/* ランナー名の表示（ベースの上部または下部に重ねる） */}
        {isRunner && (
          <div className={cn(
            "absolute text-[10px] font-black px-1.5 py-0.5 rounded shadow-md z-30 whitespace-nowrap animate-in fade-in transition-all duration-300",
            "bg-white text-primary border border-primary",
            "dark:bg-black dark:border-primary/50 dark:text-primary",
            baseNum === 2
              ? "top-8 slide-in-from-top-1" // 2塁は下側に下げてベース下角と重ねる
              : "-top-3.5 slide-in-from-bottom-1" // 1・3塁は少し下げてベース上角と重ねる
          )}>
            {name}
          </div>
        )}

        <button
          onClick={() => handleBaseClick(baseNum)}
          className="w-12 h-12 sm:w-14 sm:h-14 transition-all duration-300 flex items-center justify-center outline-none"
        >
          {/* ランナーがいる時の波紋エフェクト */}
          {isRunner && (
            <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
          )}

          <div
            className={cn(
              "w-8 h-8 sm:w-10 sm:h-10 rotate-45 rounded-sm border-2 transition-all duration-500",
              isRunner
                ? "bg-primary border-primary shadow-[0_0_20px_color-mix(in_srgb,var(--primary)_40%,transparent)] scale-110 dark:bg-primary dark:border-primary dark:shadow-[0_0_20px_color-mix(in_srgb,var(--primary)_60%,transparent)]"
                : "bg-white dark:bg-zinc-900 border-zinc-300 dark:border-white/10 opacity-90"
            )}
          >
            {/* ベース内部のデザイン */}
            <div className="absolute inset-[2px] border border-black/5 dark:border-white/10 rounded-sm" />
            
            {/* ランナーがいる時だけ表示される背番号風ドット */}
            {isRunner && (
              <div className="-rotate-45 h-full w-full flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              </div>
            )}
          </div>
        </button>
      </div>
    );
  };

  return (
    <div className="w-full flex flex-col items-center justify-center">

      {/* 🔒 閲覧専用モード警告バナー */}
      {!state.isScorer && state.lockedBy && (
        <div className="w-full max-w-[480px] sm:max-w-[520px] mb-4 px-2 select-none animate-in fade-in slide-in-from-top-3 duration-300 z-50">
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 rounded-2xl shadow-lg backdrop-blur-md">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-2.5 w-2.5 relative shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
              </span>
              <span className="text-xs font-black text-amber-700 dark:text-amber-300 truncate">
                {state.lockedBy.userName}さんが入力中 (閲覧専用)
              </span>
            </div>
            <button
              onClick={forceAcquireLock}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-[10px] font-black rounded-lg transition-all shadow-md shrink-0 cursor-pointer"
            >
              編集権限を取得
            </button>
          </div>
        </div>
      )}

      {/* 🚀 バッター情報 (ダイヤモンドの上部に通常フローで配置) */}
      <div className="w-full max-w-[480px] sm:max-w-[520px] px-2 text-center z-50 mb-6">
        {(() => {
          const index = isMyAttack ? state.myBattingIndex : state.opponentBattingIndex;
          const batter = offenseLineup && offenseLineup.length > index ? offenseLineup[index] : null;
          const batterName = batter ? (batter.playerName || batter.name || "名称未設定") : "(未設定)";
          
          const searchPrefix = `${index + 1}番`;
          const previousLogs = state.logs.filter((l) => l.description.startsWith(searchPrefix) && l.isTop === state.isTop);

          const nextIndex = (index + 1) % (offenseLineup?.length || 9);
          const nextBatter = offenseLineup && offenseLineup.length > nextIndex ? offenseLineup[nextIndex] : null;
          const nextBatterName = nextBatter ? (nextBatter.playerName || nextBatter.name || "未設定") : "(未設定)";

          const nextSearchPrefix = `${nextIndex + 1}番`;
          const nextPreviousLogs = state.logs.filter((l) => l.description.startsWith(nextSearchPrefix) && l.isTop === state.isTop);

          return (
            <div className="grid grid-cols-2 gap-3 w-full max-w-[480px] sm:max-w-[520px] mx-auto select-none">
              
              {/* 1. 現在のバッター */}
              <div className="relative w-full">
                <div 
                  onClick={() => setActiveHistory(activeHistory === 'current' ? null : 'current')}
                  className={cn(
                    "w-full flex flex-row items-center justify-between px-3 bg-primary text-primary-foreground rounded-2xl shadow-md border border-primary/10 cursor-pointer hover:bg-primary/95 transition-all select-none h-12 relative",
                    activeHistory === 'current' && "ring-2 ring-primary-foreground/30"
                  )}
                >
                  {/* 左: Bat ラベル */}
                  <span className="text-[8px] font-black text-primary-foreground/80 uppercase tracking-widest bg-white/15 px-1.5 py-0.5 rounded leading-none shrink-0">
                    Bat
                  </span>

                  {/* 中央: 打者情報 */}
                  <div className="flex items-center gap-1 min-w-0 justify-center flex-1 mx-2">
                    <span className="text-[12px] sm:text-[13px] font-black truncate">
                      {`${index + 1}番 ${batterName}`}
                    </span>
                    <ChevronDown className={cn("w-3.5 h-3.5 text-primary-foreground/80 transition-transform duration-300 shrink-0", activeHistory === 'current' && "rotate-180")} />
                  </div>

                  {/* 右: 代打ボタン */}
                  <div className="shrink-0 w-8 flex justify-end">
                    {state.isScorer && (
                      <button
                        type="button"
                        className="pointer-events-auto bg-white/20 hover:bg-white/30 text-primary-foreground text-[8.5px] font-black px-1.5 py-1 rounded transition-colors leading-none"
                        onClick={(e) => {
                          e.stopPropagation(); // ドロップダウンを開くのを防ぐ
                          setSubInitialTab(isMyAttack ? 'my' : 'opponent');
                          setSubInitialSlot(index);
                          setSubOpen(true);
                        }}
                      >
                        代打
                      </button>
                    )}
                  </div>
                </div>

                {/* ドロップダウン履歴 (現在のバッター用) */}
                {activeHistory === 'current' && (
                  <>
                    {/* Click outside shield */}
                    <div 
                      className="fixed inset-0 z-50 cursor-default" 
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveHistory(null);
                      }}
                    />
                    <div className="absolute top-full left-0 mt-2 w-64 bg-zinc-950/95 dark:bg-black/95 border border-primary/30 rounded-2xl shadow-xl z-[60] p-3 text-left backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="flex items-center justify-between border-b border-primary/20 pb-2 mb-2">
                        <span className="text-[10px] font-black text-primary uppercase tracking-wider">
                          {batterName}の打席履歴 ({previousLogs.length}打席)
                        </span>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveHistory(null);
                          }}
                          className="text-zinc-400 hover:text-white p-0.5 rounded-full hover:bg-white/10"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      
                      {previousLogs.length > 0 ? (
                        <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                          {previousLogs.map((log, logIdx) => {
                            const parts = log.description.split(/[:：]/);
                            const rawResult = parts.length > 1 ? parts[1].trim() : log.description;
                            const cleanResult = rawResult.replace(/\s*\[B:\d+,\s*S:\d+,\s*O:\d+\]\s*$/, "");
                            
                            return (
                              <div 
                                key={log.id} 
                                className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-white/5 dark:bg-zinc-900/50 border border-white/5 text-[11px] font-medium text-zinc-300 hover:bg-white/10 dark:hover:bg-zinc-900/80 transition-colors"
                              >
                                <span className="font-bold text-primary/80 shrink-0 mr-2">{log.inning}回{log.isTop ? "表" : "裏"}</span>
                                <span className="truncate text-zinc-100 font-semibold flex-1">{cleanResult}</span>
                                <span className="text-[9px] text-zinc-500 font-bold shrink-0 ml-2">
                                  第{previousLogs.length - logIdx}打席
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="py-4 text-center text-zinc-500 text-[11px]">
                          今試合の打席履歴はありません
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* 2. ネクストバッター */}
              <div className="relative w-full">
                <div 
                  onClick={() => setActiveHistory(activeHistory === 'next' ? null : 'next')}
                  className={cn(
                    "w-full flex flex-row items-center justify-between px-3 bg-zinc-100 dark:bg-zinc-900 border border-primary/30 dark:border-primary/45 text-zinc-800 dark:text-zinc-100 rounded-2xl shadow-sm cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-800/80 transition-all select-none h-12 relative",
                    activeHistory === 'next' && "ring-2 ring-primary/30"
                  )}
                >
                  {/* 左: Next ラベル */}
                  <span className="text-[8px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest bg-zinc-200/50 dark:bg-zinc-800/50 px-1.5 py-0.5 rounded leading-none border border-zinc-300/30 dark:border-zinc-700/30 shrink-0">
                    Next
                  </span>

                  {/* 中央: 打者情報 */}
                  <div className="flex items-center gap-1 min-w-0 justify-center flex-1 mx-2">
                    <span className="text-[12px] sm:text-[13px] font-black truncate">
                      {`${nextIndex + 1}番 ${nextBatterName}`}
                    </span>
                    <ChevronDown className={cn("w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 transition-transform duration-300 shrink-0", activeHistory === 'next' && "rotate-180")} />
                  </div>

                  {/* 右: レイアウト調整用スペーサー */}
                  <div className="w-8 shrink-0" />
                </div>

                {/* ドロップダウン履歴 (ネクストバッター用) */}
                {activeHistory === 'next' && (
                  <>
                    {/* Click outside shield */}
                    <div 
                      className="fixed inset-0 z-50 cursor-default" 
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveHistory(null);
                      }}
                    />
                    <div className="absolute top-full right-0 mt-2 w-64 bg-zinc-950/95 dark:bg-black/95 border border-primary/30 rounded-2xl shadow-xl z-[60] p-3 text-left backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="flex items-center justify-between border-b border-primary/20 pb-2 mb-2">
                        <span className="text-[10px] font-black text-primary uppercase tracking-wider">
                          {nextBatterName}の打席履歴 ({nextPreviousLogs.length}打席)
                        </span>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveHistory(null);
                          }}
                          className="text-zinc-400 hover:text-white p-0.5 rounded-full hover:bg-white/10"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      
                      {nextPreviousLogs.length > 0 ? (
                        <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                          {nextPreviousLogs.map((log, logIdx) => {
                            const parts = log.description.split(/[:：]/);
                            const rawResult = parts.length > 1 ? parts[1].trim() : log.description;
                            const cleanResult = rawResult.replace(/\s*\[B:\d+,\s*S:\d+,\s*O:\d+\]\s*$/, "");
                            
                            return (
                              <div 
                                key={log.id} 
                                className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-white/5 dark:bg-zinc-900/50 border border-white/5 text-[11px] font-medium text-zinc-300 hover:bg-white/10 dark:hover:bg-zinc-900/80 transition-colors"
                              >
                                <span className="font-bold text-primary/80 shrink-0 mr-2">{log.inning}回{log.isTop ? "表" : "裏"}</span>
                                <span className="truncate text-zinc-100 font-semibold flex-1">{cleanResult}</span>
                                <span className="text-[9px] text-zinc-500 font-bold shrink-0 ml-2">
                                  第{nextPreviousLogs.length - logIdx}打席
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="py-4 text-center text-zinc-500 text-[11px]">
                          今試合の打席履歴はありません
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

            </div>
          );
        })()}
      </div>

      {/* 🚀 ダイヤモンドエリア */}
      <div className="relative w-full max-w-[250px] aspect-square mx-auto mt-12 mb-6">
        {/* 🏟 ダイヤモンド（土のライン） */}
        <div className="absolute inset-4 border-[3px] border-dashed border-primary/20 dark:border-white/10 rotate-45 rounded-sm shadow-inner" />

        {/* 各ベース（インタラクティブ） */}
        <Base baseNum={1} isRunner={!!runners.base1} />
        <Base baseNum={2} isRunner={!!runners.base2} />
        <Base baseNum={3} isRunner={!!runners.base3} />

        {/* 🏠 ホームベース（静的装飾 / 完璧なSVG五角形リアル比率） */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-10 h-10 flex items-center justify-center pointer-events-none z-5">
          <svg viewBox="0 0 100 100" className="w-8 h-8 drop-shadow-[0_2px_6px_rgba(0,0,0,0.15)] dark:drop-shadow-[0_2px_6px_rgba(255,255,255,0.1)]">
            <polygon
              points="0,0 100,0 100,50 50,100 0,50"
              className="fill-white dark:fill-zinc-100 stroke-zinc-400 dark:stroke-zinc-600 stroke-[6]"
            />
          </svg>
        </div>

        {/* 守備位置の表示 */}
        <div className={cn("absolute inset-0 pointer-events-none", showPitcherInningCounts ? "z-40" : "z-10")}>
          {(() => {
            const defenseLineup = state.isTop 
              ? (state.isGuestFirst ? state.opponentLineup : state.myLineup)
              : (state.isGuestFirst ? state.myLineup : state.opponentLineup);
            
            if (!defenseLineup) return null;

            // ポジション番号と座標のマッピング
            const positions: Record<string, { label: string, posClass: string }> = {
              "1": { label: "P", posClass: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" },
              "2": { label: "C", posClass: "bottom-[22px] left-1/2 -translate-x-1/2" },
              "3": { label: "1B", posClass: "top-[65%] right-0 translate-x-1/2" }, // 1塁ベースの真下
              "4": { label: "2B", posClass: "top-[18%] right-[16%]" },
              "5": { label: "3B", posClass: "top-[65%] left-0 -translate-x-1/2" }, // 3塁ベースの真下
              "6": { label: "SS", posClass: "top-[18%] left-[16%]" },
              "7": { label: "LF", posClass: "top-[-5%] left-[-10%]" },
              "8": { label: "CF", posClass: "top-[-20%] left-1/2 -translate-x-1/2" },
              "9": { label: "RF", posClass: "top-[-5%] right-[-10%]" },
            };

            const pitchCount = getPitcherCount();

            return Object.entries(positions).map(([posNum, { label, posClass }]) => {
              const player = defenseLineup.find((p) => p.position === posNum);
              const isPitcher = posNum === "1";

              // 野手の表示（ボタン化して pointer-events-auto を設定しタップ可能にする）
              return (
                <div
                  key={posNum}
                  className={cn(
                    `absolute ${posClass} flex flex-col items-center text-center select-none`,
                    isPitcher && showPitcherInningCounts ? "z-50" : "z-10"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => handleFielderClick(posNum)}
                    disabled={!state.isScorer}
                    className={cn(
                      "pointer-events-auto text-center select-none outline-none",
                      "bg-white dark:bg-zinc-950 border border-black/10 dark:border-white/20 rounded-md px-2 py-0.5 min-w-[44px] shadow-sm",
                      state.isScorer && "hover:bg-zinc-100 dark:hover:bg-zinc-900 active:scale-95 cursor-pointer transition-all"
                    )}
                  >
                    <span className="text-[7.5px] font-black text-black/60 dark:text-zinc-400 leading-tight block">
                      {label}
                    </span>
                    <span className="text-[9.5px] font-black text-black dark:text-white max-w-[58px] truncate leading-tight block">
                      {player?.playerName || player?.name || "-"}
                    </span>
                  </button>

                  {/* 投球数は枠（ボタン）の外側に綺麗に表示する */}
                  {isPitcher && (
                    <div className="relative mt-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowPitcherInningCounts(!showPitcherInningCounts);
                        }}
                        className="pointer-events-auto text-[11.5px] font-black text-primary bg-primary/15 dark:bg-primary/25 hover:bg-primary/30 dark:hover:bg-primary/35 px-2.5 py-1 rounded-full leading-none shrink-0 border border-primary/30 dark:border-primary/40 shadow-sm active:scale-95 transition-all select-none whitespace-nowrap cursor-pointer animate-in fade-in slide-in-from-top-1"
                      >
                        {pitchCount}球
                      </button>

                      {/* イニング毎の投球数ポップアップ */}
                      {showPitcherInningCounts && (
                        <>
                          {/* 背景クリック保護シールド */}
                          <div 
                            className="fixed inset-0 z-50 cursor-default" 
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowPitcherInningCounts(false);
                            }}
                          />
                          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-[220px] bg-zinc-950/95 dark:bg-black/95 border border-primary/30 rounded-2xl shadow-xl z-[60] p-3 text-left backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-auto">
                            <div className="flex items-center justify-between border-b border-primary/20 pb-1.5 mb-1.5">
                              <span className="text-[9px] font-black text-primary uppercase tracking-wider">
                                イニング別投球数
                              </span>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowPitcherInningCounts(false);
                                }}
                                className="text-zinc-400 hover:text-white p-0.5 rounded-full hover:bg-white/10"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                            
                            {/* イニング別投球数一覧 */}
                            {getPitcherInningCounts().length > 0 ? (
                              <div className="flex flex-col gap-2">
                                <div className="flex flex-row flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                                  {getPitcherInningCounts().map(({ inning, count }) => (
                                    <div 
                                      key={inning} 
                                      className="flex items-center gap-1.5 py-1 px-2 rounded-lg bg-white/5 dark:bg-zinc-900/50 border border-white/5 text-[10px] font-bold text-zinc-300 whitespace-nowrap"
                                    >
                                      <span className="text-primary">{inning}回</span>
                                      <span className="text-zinc-100 font-extrabold">{count}球</span>
                                    </div>
                                  ))}
                                </div>
                                {/* 合計表示 */}
                                <div className="flex items-center justify-between py-1 px-2.5 rounded-lg bg-primary/10 dark:bg-primary/20 border border-primary/20 text-[10px] font-black text-primary/90 mt-0.5">
                                  <span>合計</span>
                                  <span className="text-primary font-black">{pitchCount}球</span>
                                </div>
                              </div>
                            ) : (
                              <div className="py-2 text-center text-zinc-500 text-[10px]">
                                投球データがありません
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>

      </div>

      {/* 🚀 走者アクションモーダル */}
      {selectedBase && (
        <RunnerActionModal
          isOpen={isActionModalOpen}
          onClose={() => {
            setIsActionModalOpen(false);
            setSelectedBase(null);
          }}
          baseNum={selectedBase}
          playerName={getRunnerName(runners[`base${selectedBase}` as keyof typeof runners])}
          onSelectAction={(action) => {
            recordRunnerAction(selectedBase, action);
          }}
        />
      )}

      {/* 🚀 走者配置（代走アサイン）モーダル */}
      {isAssignModalOpen && selectedBase && mounted && createPortal(
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 flex items-center justify-center p-4 z-[200] animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-[0_10px_50px_rgba(0,0,0,0.1)] dark:shadow-[0_10px_50px_rgba(0,0,0,0.5)]">
            
            {/* ヘッダー */}
            <div className="bg-zinc-50 dark:bg-zinc-900 px-5 py-4 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <span className="text-xs font-black text-primary uppercase tracking-widest">Assign Base Runner</span>
                <h3 className="text-base font-black text-zinc-900 dark:text-white mt-0.5">
                  {selectedBase}塁に走者をアサイン
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsAssignModalOpen(false);
                  setSelectedBase(null);
                }}
                className="p-1.5 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* コンテンツ */}
            <div className="p-5 max-h-[60vh] overflow-y-auto space-y-4">
              
              {/* 1. 手動自由入力 */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">自由入力 (即席走者/ゲスト)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customPlayerName}
                    onChange={(e) => setCustomPlayerName(e.target.value)}
                    placeholder="走者名を入力 (例: 佐藤)"
                    className="flex-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-primary transition-colors"
                  />
                  <button
                    onClick={handleCustomAssignRunner}
                    disabled={!customPlayerName.trim()}
                    className="px-4 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:hover:bg-primary text-primary-foreground rounded-xl flex items-center justify-center font-black active:scale-95 transition-all text-xs"
                  >
                    配置
                  </button>
                </div>
              </div>

              <div className="border-t border-zinc-100 dark:border-zinc-800 my-4" />

              {/* 2. スタメンから選択 */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">スタメン選手から選択</label>
                <div className="grid grid-cols-2 gap-2">
                  {offenseLineup?.map((player) => (
                    <button
                      key={player.playerId || player.id}
                      onClick={() => handleAssignRunner(player.playerId || player.id)}
                      className="bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-900 dark:text-white rounded-xl px-3 py-2.5 text-xs font-bold text-left flex flex-col justify-center transition-all active:scale-[0.98]"
                    >
                      <span className="text-[9px] text-zinc-400 dark:text-zinc-500">{player.battingOrder}番 ({player.position})</span>
                      <span className="truncate mt-0.5">{player.playerName || player.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. ベンチメンバーから選択 (代走用) */}
              {benchPlayers.length > 0 && (
                <div className="space-y-2 pt-2">
                  <label className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">ベンチメンバー (代走) から選択</label>
                  <div className="grid grid-cols-2 gap-2">
                    {benchPlayers.map((player) => (
                      <button
                        key={player.id}
                        onClick={() => handleAssignRunner(player.id)}
                        className="bg-primary/5 dark:bg-primary/10 hover:bg-primary/10 dark:hover:bg-primary/20 border border-primary/10 dark:border-primary/20 hover:border-primary/20 dark:hover:border-primary/30 text-primary dark:text-white rounded-xl px-3 py-2.5 text-xs font-bold text-left flex flex-col justify-center transition-all active:scale-[0.98]"
                      >
                        <span className="text-[9px] text-primary/80">背番号 #{player.uniformNumber || "-"}</span>
                        <span className="truncate mt-0.5">{player.name || player.playerName}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* フッター */}
            <div className="bg-zinc-50 dark:bg-zinc-900 px-4 py-3 flex justify-end border-t border-zinc-100 dark:border-zinc-800">
              <button
                onClick={() => {
                  setIsAssignModalOpen(false);
                  setSelectedBase(null);
                }}
                className="px-5 py-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white text-xs font-black tracking-wider transition-colors active:scale-95"
              >
                キャンセル
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}

      {/* 🚀 選手交代モーダル (野手タップからプリセット起動) */}
      {subOpen && mounted && (
        <SubstitutionModal
          open={subOpen}
          onOpenChange={setSubOpen}
          initialTab={subInitialTab}
          initialSlotIndex={subInitialSlot}
        />
      )}

    </div>
  );
}
