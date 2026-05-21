// filepath: `src/components/score/PlayArea.tsx`
"use client";

import React, { useState, useEffect } from "react";
import { useScore } from "@/contexts/ScoreContext";
import { cn } from "@/lib/utils";
import { RunnerActionModal } from "./RunnerActionModal";
import { X, UserPlus, Check, User } from "lucide-react";

export function PlayArea() {
  const { state, updateRunners, recordInPlay, recordRunnerAction, substitutePlayer } = useScore();
  const { runners } = state;

  // モーダル・アサイン用状態管理
  const [selectedBase, setSelectedBase] = useState<1 | 2 | 3 | null>(null);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [benchPlayers, setBenchPlayers] = useState<any[]>([]);
  const [customPlayerName, setCustomPlayerName] = useState("");

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
        {/* ランナー名の表示（ベースの上部または横に重ねる） */}
        {isRunner && (
          <div className="absolute -top-7 bg-zinc-950 dark:bg-black border border-primary/40 dark:border-primary/50 text-[10px] font-black px-1.5 py-0.5 rounded shadow-md z-30 whitespace-nowrap animate-in fade-in slide-in-from-bottom-1 text-primary">
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
                ? "bg-primary border-primary shadow-[0_0_20px_rgba(var(--primary),0.6)] scale-110"
                : "bg-background dark:bg-zinc-900 border-muted-foreground/30 dark:border-white/10 opacity-80"
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

      {/* 🚀 バッター情報 (ダイヤモンドの上部に通常フローで配置) */}
      <div className="w-full max-w-[340px] px-2 text-center z-50 mb-6">
        {(() => {
          const index = isMyAttack ? state.myBattingIndex : state.opponentBattingIndex;
          const batter = offenseLineup && offenseLineup.length > index ? offenseLineup[index] : null;
          const batterName = batter ? (batter.playerName || batter.name || "名称未設定") : "(未設定)";
          
          const searchPrefix = `${index + 1}番`;
          const previousLogs = state.logs.filter((l) => l.description.startsWith(searchPrefix) && l.isTop === state.isTop);
          let prevResult = "データなし";
          if (previousLogs.length > 0) {
            const desc = previousLogs[0].description;
            const parts = desc.split(/[:：]/);
            prevResult = parts.length > 1 ? parts[1].trim() : desc;
          }

          const nextIndex = (index + 1) % (offenseLineup?.length || 9);
          const nextBatter = offenseLineup && offenseLineup.length > nextIndex ? offenseLineup[nextIndex] : null;
          const nextBatterName = nextBatter ? (nextBatter.playerName || nextBatter.name || "未設定") : "(未設定)";

          return (
            <div className="flex items-center justify-center w-full gap-1">
              {/* 前打席 */}
              <div className="flex-1 flex justify-end min-w-0">
                <span className="text-[9px] font-bold text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-full truncate max-w-full border border-border/50">
                  前: {prevResult}
                </span>
              </div>

              {/* 現在のバッター */}
              <div className="shrink-0 flex items-center gap-1.5 bg-primary px-3 py-1.5 rounded-full shadow-lg shadow-primary/20">
                <span className="text-[10px] font-black text-primary-foreground/80 uppercase tracking-wider">Bat</span>
                <span className="text-[13px] font-black text-primary-foreground">
                  {`${index + 1}番 ${batterName}`}
                </span>
                {state.isScorer && (
                  <button
                    type="button"
                    className="pointer-events-auto ml-1 bg-white/20 hover:bg-white/30 text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors"
                    onClick={() => {
                      const newName = window.prompt("代打の選手名を入力してください");
                      if (newName) {
                        const newId = `sub-${Date.now()}`;
                        substitutePlayer?.(isMyAttack ? 'my' : 'opponent', index, newId, newName);
                      }
                    }}
                  >
                    代打
                  </button>
                )}
              </div>

              {/* NEXTバッター */}
              <div className="flex-1 flex justify-start min-w-0">
                <span className="text-[9px] font-bold text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-full truncate max-w-full border border-border/50">
                  次: {nextBatterName}
                </span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* 🚀 ダイヤモンドエリア */}
      <div className="relative w-full max-w-[250px] aspect-square mx-auto mt-12 mb-4">
        {/* 🏟 ダイヤモンド（土のライン） */}
        <div className="absolute inset-4 border-[3px] border-dashed border-primary/20 dark:border-white/10 rotate-45 rounded-sm shadow-inner" />

        {/* 各ベース（インタラクティブ） */}
        <Base baseNum={1} isRunner={!!runners.base1} />
        <Base baseNum={2} isRunner={!!runners.base2} />
        <Base baseNum={3} isRunner={!!runners.base3} />

        {/* 🏠 ホームベース（戻り値：得点への意志） */}
        <button 
          onClick={() => {
            recordInPlay("得点", 1, 0, 0);
            if (runners.base3) {
              recordRunnerAction(3, "clear");
            }
            if (window.navigator.vibrate) window.navigator.vibrate(20);
          }}
          className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-12 h-12 flex flex-col items-center group active:scale-90 transition-transform cursor-pointer outline-none z-20"
        >
          <div className="w-9 h-6 bg-white dark:bg-zinc-100 border-2 border-muted-foreground/30 shadow-[0_0_15px_rgba(255,255,255,0.3)]" />
          <div className="w-0 h-0 border-l-[18px] border-l-transparent border-r-[18px] border-r-transparent border-t-[14px] border-t-white dark:border-t-zinc-100 relative -mt-[2px]" />
        </button>

        {/* 守備位置の表示 */}
        <div className="absolute inset-0 pointer-events-none">
          {(() => {
            const defenseLineup = state.isTop 
              ? (state.isGuestFirst ? state.opponentLineup : state.myLineup)
              : (state.isGuestFirst ? state.myLineup : state.opponentLineup);
            
            if (!defenseLineup) return null;

            // ポジション番号と座標のマッピング
            const positions: Record<string, { label: string, posClass: string }> = {
              "1": { label: "P", posClass: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" },
              "2": { label: "C", posClass: "bottom-[-5px] left-1/2 -translate-x-1/2" },
              "3": { label: "1B", posClass: "top-[60%] right-[-10px]" },
              "4": { label: "2B", posClass: "top-[25%] right-[20%]" },
              "5": { label: "3B", posClass: "top-[60%] left-[-10px]" },
              "6": { label: "SS", posClass: "top-[25%] left-[20%]" },
              "7": { label: "LF", posClass: "top-[-5%] left-[-10%]" },
              "8": { label: "CF", posClass: "top-[-20%] left-1/2 -translate-x-1/2" },
              "9": { label: "RF", posClass: "top-[-5%] right-[-10%]" },
            };

            return Object.entries(positions).map(([posNum, { label, posClass }]) => {
              const player = defenseLineup.find((p) => p.position === posNum);

              // 野手の表示
              return (
                <div key={posNum} className={`absolute ${posClass} flex flex-col items-center z-10`}>
                  <div className="bg-white border border-black/10 dark:border-white/20 rounded-md px-1.5 py-0.5 flex flex-col items-center min-w-[36px] shadow-sm">
                    <span className="text-[6px] font-bold text-black/60">{label}</span>
                    <span className="text-[8px] font-bold text-black truncate max-w-[48px]">
                      {player?.playerName || player?.name || "-"}
                    </span>
                  </div>
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
      {isAssignModalOpen && selectedBase && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)]">
            
            {/* ヘッダー */}
            <div className="bg-zinc-900 px-5 py-4 flex items-center justify-between border-b border-zinc-800">
              <div>
                <span className="text-xs font-black text-primary uppercase tracking-widest">Assign Base Runner</span>
                <h3 className="text-base font-black text-white mt-0.5">
                  {selectedBase}塁に走者をアサイン
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsAssignModalOpen(false);
                  setSelectedBase(null);
                }}
                className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* コンテンツ */}
            <div className="p-5 max-h-[60vh] overflow-y-auto space-y-4">
              
              {/* 1. 手動自由入力 */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">自由入力 (即席走者/ゲスト)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customPlayerName}
                    onChange={(e) => setCustomPlayerName(e.target.value)}
                    placeholder="走者名を入力 (例: 佐藤)"
                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-primary transition-colors"
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

              <div className="border-t border-zinc-800 my-4" />

              {/* 2. スタメンから選択 */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">スタメン選手から選択</label>
                <div className="grid grid-cols-2 gap-2">
                  {offenseLineup?.map((player) => (
                    <button
                      key={player.playerId || player.id}
                      onClick={() => handleAssignRunner(player.playerId || player.id)}
                      className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-white rounded-xl px-3 py-2.5 text-xs font-bold text-left flex flex-col justify-center transition-all active:scale-[0.98]"
                    >
                      <span className="text-[9px] text-zinc-500">{player.battingOrder}番 ({player.position})</span>
                      <span className="truncate mt-0.5">{player.playerName || player.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. ベンチメンバーから選択 (代走用) */}
              {benchPlayers.length > 0 && (
                <div className="space-y-2 pt-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">ベンチメンバー (代走) から選択</label>
                  <div className="grid grid-cols-2 gap-2">
                    {benchPlayers.map((player) => (
                      <button
                        key={player.id}
                        onClick={() => handleAssignRunner(player.id)}
                        className="bg-primary/10 hover:bg-primary/20 border border-primary/20 hover:border-primary/30 text-white rounded-xl px-3 py-2.5 text-xs font-bold text-left flex flex-col justify-center transition-all active:scale-[0.98]"
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
            <div className="bg-zinc-900 px-4 py-3 flex justify-end border-t border-zinc-800">
              <button
                onClick={() => {
                  setIsAssignModalOpen(false);
                  setSelectedBase(null);
                }}
                className="px-5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-black tracking-wider transition-colors active:scale-95"
              >
                キャンセル
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
