// filepath: src/app/(protected)/matches/score/page.tsx
/* 💡 i-score 現場至上主義ルール:
   1. 100dvhの厳格運用: モバイルブラウザのアドレスバーに左右されず、ボタン位置を固定。[span_1](start_span)[span_1](end_span)
   2. 視認性優先: スコアボードと操作パネルは高コントラストなソリッド背景を採用。[span_2](start_span)[span_2](end_span)
   3. 状態の復元: initMatch により、画面を離れて戻ってもD1から最新状況を完全復旧。[span_3](start_span)[span_3](end_span) */

"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ScoreProvider, useScore } from "@/contexts/ScoreContext";
import { Scoreboard } from "@/components/score/Scoreboard";
import { ControlPanel } from "@/components/score/ControlPanel";
import { PlayArea } from "@/components/score/PlayArea";
import { PlayLog } from "@/components/score/PlayLog";
import { cn } from "@/lib/utils";
import { Loader2, ChevronUp, History, Zap } from "lucide-react";

function ScorePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const matchId = searchParams.get("id");
  const { initMatch, state, isLoading, isScorer } = useScore(); // Contextから権限と状態を取得[span_4](start_span)[span_4](end_span)
  const [isReady, setIsReady] = useState(false);
  const [isLogExpanded, setIsLogExpanded] = useState(false);

  // 🚀 現場復元ロジック
  useEffect(() => {
    if (matchId) {
      initMatch(matchId); // D1から試合状況を復元[span_5](start_span)[span_5](end_span)
    }
    
    // 現場仕様：スクロールによる誤操作を防ぐため、ボディのスクロールをロック
    document.body.style.overflow = "hidden";
    
    // 入場アニメーション用のタイマー
    const timer = setTimeout(() => setIsReady(true), 100);
    
    return () => {
      document.body.style.overflow = "unset";
      clearTimeout(timer);
    };
  }, [matchId, initMatch]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-sm font-bold animate-pulse">試合データを復元中...</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background h-[100dvh] w-full flex flex-col overflow-hidden select-none">
      
      {/* 1. 【上部：スコアボード】(約18%) 
          直射日光下でもスコアがハッキリ見えるよう、背景はソリッドに。 */}
      <header className={cn(
        "shrink-0 z-30 transition-transform duration-700 bg-card border-b border-border/50",
        isReady ? "translate-y-0" : "-translate-y-full"
      )}>
        <Scoreboard />
      </header>

      {/* 2. 【中央：プレイ表示エリア】(約50%) */}
      <main className={cn(
        "flex-1 relative flex flex-col items-center justify-between pt-1 pb-0 transition-all duration-1000",
        isLogExpanded ? "z-50" : "z-10",
        isReady ? "opacity-100 scale-100" : "opacity-0 scale-95"
      )}>
        {/* 野球盤（ランナー状況）：上寄せに配置 */}
        <div className="w-full flex-1 flex flex-col items-center justify-start pt-2 min-h-0">
          <div className="w-full">
            <PlayArea />
          </div>
        </div>

        {/* 最近のプレイログ：操作パネルとの視覚的な繋ぎ / 引き出し式シート */}
        {/* 最近のプレイログ：操作パネルとの視覚的な繋ぎ / 引き出し式シート */}
        <div className={cn(
          "absolute bottom-0 w-full px-2 transition-all duration-300",
          isLogExpanded ? "h-[90%] z-50" : (!isScorer ? "h-[180px] z-30" : "h-[100px] [@media(max-height:700px)]:h-[36px] z-30")
        )}>
          <div 
            className="h-full bg-white/10 dark:bg-black/10 backdrop-blur-[3px] rounded-t-3xl border border-zinc-300/60 dark:border-zinc-800/60 border-b-0 pt-2 px-2 pb-0 shadow-[0_-8px_30px_rgba(0,0,0,0.06)] flex flex-col"
          >
            {/* ハンドル部分（タップで開閉） */}
            <div 
              className="flex justify-between items-center mb-1 px-2 py-0.5 cursor-pointer"
              onClick={() => setIsLogExpanded(!isLogExpanded)}
            >
              <div className="flex items-center gap-1.5">
                <History className="w-4 h-4 text-primary shrink-0" />
                <span className="text-[13.5px] font-black tracking-widest text-foreground">プレイログ</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-sm font-black text-muted-foreground hover:text-foreground transition-colors">{isLogExpanded ? "閉じる" : "すべて見る"}</span>
                <ChevronUp className={cn("w-4.5 h-4.5 text-muted-foreground transition-transform", isLogExpanded && "rotate-180")} />
              </div>
            </div>
            <div className={cn("flex-1", isLogExpanded ? "overflow-y-auto pr-1 pb-0" : "overflow-hidden")}>
              <PlayLog limit={isLogExpanded ? 100 : (!isScorer ? 6 : 3)} />
            </div>
          </div>
        </div>
      </main>

      {/* 3. 【下部：操作パネル or 観戦通知】🌟 ここがスコアラーの主戦場 🌟
          脱・グラスモーフィズム：操作ミスを防ぐため透過を抑え、ボタンのコントラストを最大化。 */}
      <footer className={cn(
        "shrink-0 z-[60] bg-card border-t border-border px-2 pt-2 pb-2 shadow-[0_-15px_50px_rgba(0,0,0,0.2)]",
        isScorer ? "h-[22dvh] min-h-[160px] [@media(max-height:700px)]:min-h-[135px] [@media(max-height:600px)]:min-h-[120px]" : "h-[10dvh] min-h-[80px]",
        isReady ? "translate-y-0" : "translate-y-full transition-none",
        "transition-all duration-700 ease-out",
        isLogExpanded && "opacity-95"
      )}>
        <div className="max-w-md mx-auto h-full w-full flex flex-col justify-center">
          {isScorer ? (
            <ControlPanel /> // スコアラーには特大の入力ボタンを提供
          ) : (
            // 観戦者（ReadOnly）向け：操作パネルの代わりにコンパクトな速報モードとジェネレーターへの導線を表示
            <div className="py-2 px-4 bg-primary/5 rounded-2xl border border-primary/20 flex items-center justify-between gap-3 w-full animate-in fade-in zoom-in duration-500">
              <div className="flex items-center gap-2 min-w-0">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                </span>
                <span className="text-xs font-black text-foreground tracking-wider uppercase truncate">ライブ観戦中</span>
              </div>
              
              <button
                onClick={() => {
                  if (matchId) {
                    router.push(`/news-generator?matchId=${matchId}`);
                  }
                }}
                className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-[10px] font-black rounded-xl transition-all shadow-md shrink-0 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" />
                速報を作成
              </button>
            </div>
          )}
        </div>
      </footer>

      {/* 4. 【ゲームセット演出】 */}
      {state.status === 'finished' && (
        <div className="absolute inset-0 z-[200] bg-background/95 backdrop-blur-md flex items-center justify-center animate-in fade-in duration-700">
          <div className="text-center">
            <h2 className="text-5xl font-black text-foreground mb-4">
              試合終了
            </h2>
            <p className="text-xl font-bold text-muted-foreground mb-12">
              お疲れさまでした
            </p>
            <button 
              onClick={() => router.push('/dashboard')}
              className="px-8 py-3 bg-primary text-primary-foreground rounded-full font-bold text-sm shadow-sm"
            >
              ダッシュボードへ戻る
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Suspenseでラップしてクエリパラメータ取得を安全に行う
 */
export default function ScorePage() {
  return (
    <Suspense fallback={
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <ScoreProvider>
        <ScorePageContent />
      </ScoreProvider>
    </Suspense>
  );
}
