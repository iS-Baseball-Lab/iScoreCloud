// filepath: src/components/score/Scoreboard.tsx
"use client";

import { useState, useRef } from "react";
import { useScore } from "@/contexts/ScoreContext";
import { cn } from "@/lib/utils";
import { Users } from "lucide-react";

export function Scoreboard() {
  // 💡 Contextから最新の状態と関数を取得
  const { state, updateMatchSettings } = useScore();
  const [offsetX, setOffsetX] = useState(0);
  const startX = useRef(0);

  // 💡 maxInningsがない場合のフォールバック（型定義に合わせて安全に参照）
  const displayInningsCount = Math.max(state.maxInnings || 7, state.inning);
  const innings = Array.from({ length: displayInningsCount }, (_, i) => i + 1);

  // 試合開始前判定（設定変更を許可する条件：1回表、0対0、無死無走者）
  const isPreGame = state.inning === 1 && state.isTop &&
    state.myScore === 0 && state.opponentScore === 0 &&
    state.outs === 0 && state.balls === 0 && state.strikes === 0;

  // 🌟 自チームが攻撃中かどうかの判定（isGuestFirst を使用）
  // 表(isTop) かつ 先攻(isGuestFirst) ＝ 攻撃
  // 裏(!isTop) かつ 後攻(!isGuestFirst) ＝ 攻撃
  const isMyAttack = (state.isTop && state.isGuestFirst) || (!state.isTop && !state.isGuestFirst);
  const attackStatusText = isMyAttack ? "攻撃" : "守備";

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!state.isScorer || !isPreGame) return; // 🌟 編集権限がある場合のみスワイプを許可
    startX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!state.isScorer || !isPreGame) return;
    const move = e.touches[0].clientX - startX.current;
    if (move > 0) {
      // 🌟 最大スライド幅を 80px に制限
      setOffsetX(Math.min(move, 80));
    }
  };

  const handleTouchEnd = () => {
    if (!state.isScorer || !isPreGame) {
      setOffsetX(0);
      return;
    }
    // 🌟 60px以上スライドして離したら「先攻・後攻」を切り替えて確定
    if (offsetX >= 60) {
      updateMatchSettings({ isGuestFirst: !state.isGuestFirst });
      // フィードバックとしてスマホを振動させる（任意）
      if ("vibrate" in navigator) navigator.vibrate(50);
    }
    setOffsetX(0);
  };

  const numberStyle = "font-black tabular-nums tracking-tighter";

  // 🌟 先攻（上段）と後攻（下段）のスコアマッピング
  const guestInningScores = state.isGuestFirst ? state.myInningScores : state.opponentInningScores;
  const homeInningScores = state.isGuestFirst ? state.opponentInningScores : state.myInningScores;
  const guestScore = state.isGuestFirst ? state.myScore : state.opponentScore;
  const homeScore = state.isGuestFirst ? state.opponentScore : state.myScore;
  const guestHits = state.isGuestFirst ? state.myHits : state.opponentHits;
  const homeHits = state.isGuestFirst ? state.opponentHits : state.myHits;
  const guestErrors = state.isGuestFirst ? state.myErrors : state.opponentErrors;
  const homeErrors = state.isGuestFirst ? state.opponentErrors : state.myErrors;

  return (
    <div className="w-full bg-background select-none font-sans p-1">
      <div className="flex flex-col rounded-lg overflow-hidden border border-zinc-300 dark:border-zinc-700 shadow-sm">

        {/* 🚀 ヘッダー：大会名・対戦相手・球場 */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-300 dark:border-zinc-700 bg-muted/40">
          {/* 左側：大会名・球場（2段コンパクト表示） */}
          <div className="flex-1 flex flex-col items-start overflow-hidden pr-2">
            <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest truncate w-full">
              {state.tournamentName || (state.matchType === 'practice' ? '練習試合' : '大会未設定')}
            </span>
            <span className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400 truncate w-full leading-tight">
              {state.venueName || "球場未設定"}
            </span>
          </div>
          
          {/* 中央：対戦相手 */}
          <div className="flex-none px-2 text-sm md:text-base font-black text-foreground tracking-widest whitespace-nowrap">
            <span className="text-xs text-muted-foreground mr-1 font-bold">vs</span>
            {state.opponentTeamName || "相手チーム"}
          </div>
          
          {/* 右側：スタメン設定ボタン */}
          <div className="flex-1 flex justify-end items-center pl-2">
            <button 
              onClick={() => window.location.href = `/matches/lineup?id=${state.matchId}`}
              className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-full hover:bg-primary/20 transition-colors shadow-sm"
              title="スタメン設定"
            >
              <Users className="w-3.5 h-3.5" strokeWidth={2.5} />
              <span className="text-[9px] font-black inline">スタメン</span>
            </button>
          </div>
        </div>

        {/* 🚀 メイン掲示板 */}
        <div className="relative overflow-hidden bg-card border-b border-zinc-300 dark:border-zinc-700">

          {/* 🌟 攻守切替幕 (背面：スライドしたときだけ見える) */}
          <div
            className="absolute left-0 top-0 bottom-0 bg-primary z-10 flex items-center justify-center transition-opacity"
            style={{
              width: `${offsetX}px`,
              opacity: offsetX > 0 ? 1 : 0
            }}
          >
            <span className="font-black text-white text-[12px] tracking-widest whitespace-nowrap">
              先後切替
            </span>
          </div>

          {/* 🌟 スコアボード本体 (前面) */}
          <div
            className="relative z-20 bg-card transition-transform duration-300 cubic-bezier(0.2, 0.8, 0.2, 1) shadow-[-2px_0_8px_rgba(0,0,0,0.1)]"
            style={{ transform: `translateX(${offsetX}px)` }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <table className="w-full border-collapse text-card-foreground min-w-[340px]">
              <thead>
                <tr className="bg-muted/30 border-b border-border text-muted-foreground/60">
                  <th className="w-12 py-1 text-center">
                    <div className="flex flex-col items-center leading-none py-1">
                      <span className="relative flex h-2 w-2 mb-0.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600"></span>
                      </span>
                      <span className="text-[8px] font-black text-rose-600 tracking-tighter">LIVE</span>
                    </div>
                  </th>
                  {innings.map(i => (
                    <th key={i} className={cn("py-2 text-base px-1", numberStyle, state.inning === i ? "bg-primary text-primary-foreground" : "")}>{i}</th>
                  ))}
                  <th className={cn("w-8 bg-muted/50 text-center text-base", numberStyle)}>R</th>
                  <th className={cn("w-8 bg-muted/20 text-center text-xs opacity-50", numberStyle)}>H</th>
                  <th className={cn("w-8 bg-muted/20 text-center text-xs opacity-50", numberStyle)}>E</th>
                </tr>
              </thead>
              <tbody>
                {/* 先攻行 (Guest) */}
                <tr className={cn("border-b border-border/50 h-6", state.isTop ? "bg-primary/5" : "")}>
                  <td className="text-center font-black text-[12px]">
                    <span className={state.isTop ? "text-primary" : "text-foreground/40"}>先</span>
                  </td>
                  {innings.map(i => (
                    <td key={i} className={cn("text-center text-lg px-0.5", numberStyle, state.inning === i && state.isTop ? "text-primary font-bold underline underline-offset-4" : "text-foreground/80")}>
                      {guestInningScores[i - 1] ?? (i <= state.inning && (state.isTop || i < state.inning) ? "0" : "-")}
                    </td>
                  ))}
                  <td className={cn("text-center text-xl font-black tabular-nums tracking-tighter", state.isTop ? "bg-primary/10 text-primary" : "bg-muted/40 text-foreground")}>
                    {guestScore}
                  </td>
                  <td className="text-center text-sm text-muted-foreground/40 font-bold">{guestHits ?? 0}</td>
                  <td className="text-center text-sm text-muted-foreground/40 font-bold">{guestErrors ?? 0}</td>
                </tr>
                {/* 後攻行 (Home) */}
                <tr className={cn("h-6", !state.isTop ? "bg-primary/5" : "")}>
                  <td className="text-center font-black text-[12px]">
                    <span className={!state.isTop ? "text-primary" : "text-foreground/40"}>後</span>
                  </td>
                  {innings.map(i => (
                    <td key={i} className={cn("text-center text-lg px-0.5", numberStyle, state.inning === i && !state.isTop ? "text-primary font-bold underline underline-offset-4" : "text-foreground/80")}>
                      {homeInningScores[i - 1] ?? (i <= state.inning && (!state.isTop || i < state.inning) ? "0" : "-")}
                    </td>
                  ))}
                  <td className={cn("text-center text-xl font-black tabular-nums tracking-tighter", !state.isTop ? "bg-primary/10 text-primary" : "bg-muted/40 text-foreground")}>
                    {homeScore}
                  </td>
                  <td className="text-center text-sm text-muted-foreground/40 font-bold">{homeHits ?? 0}</td>
                  <td className="text-center text-sm text-muted-foreground/40 font-bold">{homeErrors ?? 0}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 🚀 下段 (回数・攻守・BSOカウント) */}
        <div className="flex items-center justify-between px-3 h-10 bg-muted/5">
          <div className="flex items-center text-primary h-full">
            <div className="flex items-end pb-1">
              <span className={cn("text-3xl leading-none", numberStyle)}>{state.inning}</span>
              <div className="flex items-center gap-1 ml-2 mb-[2px]">
                <span className="text-[14px] font-black leading-none">回</span>
                <span className="text-[14px] font-black leading-none">{state.isTop ? "表" : "裏"}</span>
              </div>
            </div>
            <div className="mx-4 h-5 w-[1px] bg-muted-foreground/20" />

            <div className="flex items-center h-full">
              <span className={cn(
                "text-[14px] font-black px-3 py-1.5 rounded-md shadow-sm min-w-[65px] text-center tracking-widest leading-none flex items-center justify-center",
                isMyAttack ? "bg-primary text-primary-foreground" : "bg-zinc-800 text-zinc-100"
              )}>
                {attackStatusText}
              </span>
            </div>
          </div>

          <div className="flex gap-4 h-full items-center">
            {[
              { label: 'B', color: 'bg-emerald-500 shadow-[0_0_12px_#10b981]', count: state.balls, max: 3, textColor: 'text-emerald-600' },
              { label: 'S', color: 'bg-amber-400 shadow-[0_0_12px_#fbbf24]', count: state.strikes, max: 2, textColor: 'text-amber-600' },
              { label: 'O', color: 'bg-rose-500 shadow-[0_0_12px_#f43f5e]', count: state.outs, max: 2, textColor: 'text-rose-600' }
            ].map(type => (
              <div key={type.label} className="flex flex-row items-center gap-1.5">
                <span className={cn("text-sm font-black leading-none", type.textColor)}>{type.label}</span>
                <div className="flex gap-1.5">
                  {Array.from({ length: type.max }).map((_, i) => (
                    <div key={i} className={cn("w-3.5 h-3.5 rounded-full border transition-all duration-300", i < type.count ? type.color + " border-transparent" : "bg-zinc-900 border-zinc-800 shadow-inner")} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
