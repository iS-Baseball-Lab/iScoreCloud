// filepath: src/components/score/PlayLog.tsx
/* 💡 Contextのstate.logsを直接参照し、入力の瞬間(0秒)でフィードバックを返す。 */

"use client";

import React, { useMemo } from "react";
import { useScore } from "@/contexts/ScoreContext";
import { History, Trophy, ArrowUpRight, Circle, ChevronDown, ChevronUp, XCircle, Activity, Edit2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlayLogProps {
  limit?: number;
}

export function PlayLog({ limit = 3 }: PlayLogProps) {
  const { state, updatePlayLogDescription } = useScore();

  // イニング境界の区切りを含めた、表示用アイテムの配列を生成する
  const displayItems = useMemo(() => {
    const list: any[] = [];
    if (state.logs.length === 0) return list;

    // 表示するログをスライス
    const targetLogs = limit ? state.logs.slice(0, limit) : state.logs;

    for (let i = 0; i < targetLogs.length; i++) {
      const currentLog = targetLogs[i];
      const nextLog = targetLogs[i + 1]; // 時系列では古い方（logsは降順）

      // 1. まずそのログ自体を追加
      list.push({
        type: "log",
        data: currentLog,
      });

      // 2. イニングの区切りを判定
      // logs は降順（最新が先頭）なので、currentLog から nextLog に移る時、
      // イニングが戻る（＝古いイニングになる）タイミングでセパレーターを挟む。
      if (nextLog && (currentLog.inning !== nextLog.inning || currentLog.isTop !== nextLog.isTop)) {
        list.push({
          type: "separator",
          id: `sep-${currentLog.id}`,
          label: `${currentLog.inning}回${currentLog.isTop ? "表" : "裏"}`,
        });
      }
    }

    // 3. 一番古いログ（配列の最後）の下に、「プレイボール」と「最初のイニング」の区切りを挿入する
    if (!limit || targetLogs.length < limit || (targetLogs[targetLogs.length - 1]?.inning === 1 && targetLogs[targetLogs.length - 1]?.isTop)) {
      const lastLog = targetLogs[targetLogs.length - 1];
      if (lastLog) {
        // 最初のイニング（1回表）のセパレーター
        list.push({
          type: "separator",
          id: `sep-start-${lastLog.id}`,
          label: `${lastLog.inning}回${lastLog.isTop ? "表" : "裏"}`,
        });
        // プレイボール
        list.push({
          type: "separator",
          id: "sep-playball",
          label: "プレイボール",
        });
      }
    }

    // 4. 最新ログが「試合終了」でなく、ステータスが finished の場合は、一番上に「試合終了」を表示したい
    if (state.status === "finished" && (!limit || limit > 3)) {
      const hasGameSetLog = targetLogs.some(l => l.description.includes("試合終了"));
      if (!hasGameSetLog) {
        list.unshift({
          type: "separator",
          id: "sep-gameset",
          label: "試合終了",
        });
      }
    }

    return list;
  }, [state.logs, limit, state.status]);

  const isSeparatorText = (text: string) => {
    const clean = text.trim();
    return clean === "プレイボール" || clean === "試合終了" || clean === "ゲームセット" || clean === "コールドゲーム" || clean === "ノーゲーム" || clean === "イニング交代";
  };

  const parseLogDescription = (desc: string) => {
    const bsoMatch = desc.match(/\s\[B:(\d+),\s*S:(\d+),\s*O:(\d+)\]$/);
    if (bsoMatch) {
      const balls = parseInt(bsoMatch[1], 10);
      const strikes = parseInt(bsoMatch[2], 10);
      const outs = parseInt(bsoMatch[3], 10);
      const cleanDesc = desc.replace(/\s\[B:\d+,\s*S:\d+,\s*O:\d+\]$/, "");
      return { cleanDesc, bso: { balls, strikes, outs } };
    }
    return { cleanDesc: desc, bso: null };
  };

  if (displayItems.length === 0) {
    return (
      <div className="h-full flex items-center justify-center opacity-30">
        <div className="text-center">
          <History className="h-6 w-6 mx-auto mb-1 stroke-[1px]" />
          <p className="text-[8px] font-black uppercase tracking-widest">Ready</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 h-full overflow-y-auto pb-0.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      {displayItems.map((item) => {
        if (item.type === "separator") {
          return (
            <div
              key={item.id}
              className="w-full flex items-center justify-center py-2 animate-playlog-slide-in"
            >
              <div className="flex items-center gap-3 w-full max-w-xs justify-center px-4">
                <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-zinc-500/20" />
                <span className="text-[10px] font-black tracking-widest text-zinc-500 dark:text-zinc-400 uppercase select-none shrink-0">
                  {item.label}
                </span>
                <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-zinc-500/20" />
              </div>
            </div>
          );
        }

        // type === "log" の場合
        const log = item.data;
        const { cleanDesc, bso } = parseLogDescription(log.description);

        // ログエントリ自体がセパレーターにふさわしいテキストの場合
        if (isSeparatorText(cleanDesc)) {
          return (
            <div
              key={log.id}
              className="w-full flex items-center justify-center py-2 animate-playlog-slide-in"
            >
              <div className="flex items-center gap-3 w-full max-w-xs justify-center px-4">
                <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-zinc-500/20" />
                <span className="text-[10px] font-black tracking-widest text-zinc-500 dark:text-zinc-400 uppercase select-none shrink-0">
                  {cleanDesc}
                </span>
                <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-zinc-500/20" />
              </div>
            </div>
          );
        }

        const isLatest = state.logs[0]?.id === log.id;
        const isScore = cleanDesc.includes("得点") || cleanDesc.includes("SCORE");
        const isOut = cleanDesc.includes("三振") || cleanDesc.includes("アウト");
        const isHit = cleanDesc.includes("安打") || cleanDesc.includes("塁打") || cleanDesc.includes("単打") || cleanDesc.includes("HIT");

        return (
          <div
            key={log.id}
            className={cn(
              "relative flex items-center gap-3 transition-all duration-300",
              isLatest 
                ? "bg-primary/15 dark:bg-primary/25 text-black dark:text-white px-2.5 py-1 rounded-lg border border-primary/40 dark:border-primary/50 shadow-sm animate-playlog-slide-in z-10" 
                : "bg-primary/5 dark:bg-primary/10 text-zinc-800 dark:text-zinc-200 px-2.5 py-0.5 rounded-lg border border-primary/10 dark:border-primary/15 opacity-90 hover:opacity-100 hover:scale-[1.002]"
            )}
          >
            {/* イニング */}
            <div className={cn(
              "flex items-center justify-center min-w-[28px] h-5 rounded-full text-[9px] font-black shrink-0",
              isLatest ? "bg-primary text-primary-foreground shadow-sm" : "bg-primary/10 dark:bg-primary/20 text-primary"
            )}>
              {log.inning}{log.isTop ? "T" : "B"}
            </div>

            {/* 説明 */}
            <div className="flex-1 min-w-0 flex items-center gap-2">
              {/* 文字列の左に、そのプレイ内容に応じたアイコンを表示 */}
              {isScore ? (
                <Trophy className="h-4 w-4 text-yellow-500 shrink-0" />
              ) : isHit ? (
                <ArrowUpRight className="h-4 w-4 text-blue-500 dark:text-blue-400 shrink-0 stroke-[2.5]" />
              ) : isOut ? (
                <XCircle className="h-4 w-4 text-rose-500 shrink-0 stroke-[2.5]" />
              ) : (
                <Activity className="h-4 w-4 text-zinc-400 dark:text-zinc-500 shrink-0 stroke-[2]" />
              )}

              <span className={cn(
                "font-bold tracking-tight truncate",
                isLatest ? "text-black dark:text-white" : "text-zinc-700 dark:text-zinc-300",
                limit === 1 ? "text-[14px]" : "text-[13px]"
              )}>
                {cleanDesc}
              </span>

              {state.isScorer && !isSeparatorText(cleanDesc) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const newText = window.prompt("実況メモを修正してください:", cleanDesc);
                    if (newText !== null && newText.trim() !== "") {
                      const bsoSuffix = log.description.match(/\s\[B:\d+,\s*S:\d+,\s*O:\d+\]$/)?.[0] || "";
                      updatePlayLogDescription(log.id, `${newText.trim()}${bsoSuffix}`);
                    }
                  }}
                  className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded text-zinc-400 hover:text-foreground active:scale-95 transition-all shrink-0 cursor-pointer"
                  title="ログを直接編集"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* BSO */}
            {bso ? (
              <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-black tracking-tighter select-none">
                {/* Ball */}
                <div className="flex gap-0.5 items-center">
                  <span className="text-emerald-500 font-black text-[9px] mr-0.5">B</span>
                  <div className="flex gap-[2px]">
                    {[1, 2, 3].map((num) => (
                      <div
                        key={num}
                        className={cn(
                          "w-1.5 h-1.5 rounded-full transition-all duration-300",
                          num <= bso.balls 
                            ? "bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.5)]" 
                            : "bg-emerald-950/20 dark:bg-emerald-900/30"
                        )}
                      />
                    ))}
                  </div>
                </div>

                {/* Divider */}
                <span className="opacity-20 text-[8px] font-light text-zinc-500 px-0.5">|</span>

                {/* Strike */}
                <div className="flex gap-0.5 items-center">
                  <span className="text-amber-400 font-black text-[9px] mr-0.5">S</span>
                  <div className="flex gap-[2px]">
                    {[1, 2].map((num) => (
                      <div
                        key={num}
                        className={cn(
                          "w-1.5 h-1.5 rounded-full transition-all duration-300",
                          num <= bso.strikes 
                            ? "bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.5)]" 
                            : "bg-amber-950/20 dark:bg-amber-900/30"
                        )}
                      />
                    ))}
                  </div>
                </div>

                {/* Divider */}
                <span className="opacity-20 text-[8px] font-light text-zinc-500 px-0.5">|</span>

                {/* Out */}
                <div className="flex gap-0.5 items-center">
                  <span className="text-rose-500 font-black text-[9px] mr-0.5">O</span>
                  <div className="flex gap-[2px]">
                    {[1, 2].map((num) => (
                      <div
                        key={num}
                        className={cn(
                          "w-1.5 h-1.5 rounded-full transition-all duration-300",
                          num <= bso.outs 
                            ? "bg-rose-500 shadow-[0_0_4px_rgba(239,68,68,0.5)]" 
                            : "bg-rose-950/20 dark:bg-rose-900/30"
                        )}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <span className={cn(
                "text-[9px] font-mono shrink-0",
                isLatest ? "text-black/60 dark:text-white/60" : "text-zinc-500/80 dark:text-zinc-400/80"
              )}>
                {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
