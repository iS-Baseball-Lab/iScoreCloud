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
import { Loader2, ChevronUp } from "lucide-react";

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
        "flex-1 relative flex flex-col items-center justify-between py-1 transition-all duration-1000",
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
        <div className={cn(
          "absolute bottom-0 w-full px-4 transition-all duration-300",
          isLogExpanded ? "h-[90%] z-50" : "h-[100px] z-30"
        )}>
          <div 
            className="h-full bg-background/20 dark:bg-background/20 backdrop-blur-[2px] rounded-t-3xl border border-border/30 border-b-0 p-2 shadow-[0_-5px_20px_rgba(0,0,0,0.1)] flex flex-col"
          >
            {/* ハンドル部分（タップで開閉） */}
            <div 
              className="flex justify-between items-center mb-1 px-2 py-1 cursor-pointer"
              onClick={() => setIsLogExpanded(!isLogExpanded)}
            >
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span className="text-[12px] font-black tracking-widest text-foreground">プレイログ</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-bold text-muted-foreground">{isLogExpanded ? "閉じる" : "すべて見る"}</span>
                <ChevronUp className={cn("w-4 h-4 text-muted-foreground transition-transform", isLogExpanded && "rotate-180")} />
              </div>
            </div>
            <div className={cn("flex-1", isLogExpanded ? "overflow-y-auto pr-1 pb-2" : "overflow-hidden")}>
              <PlayLog limit={isLogExpanded ? 100 : 3} />
            </div>
          </div>
        </div>
      </main>

      {/* 3. 【下部：操作パネル or 観戦通知】(約32%) 🌟 ここがスコアラーの主戦場 🌟
          脱・グラスモーフィズム：操作ミスを防ぐため透過を抑え、ボタンのコントラストを最大化。[span_7](start_span)[span_7](end_span) */}
      <footer className={cn(
        "shrink-0 z-40 bg-card border-t border-border px-2 pt-2 pb-2 shadow-[0_-15px_50px_rgba(0,0,0,0.2)]",
        "h-[22dvh] min-h-[160px]",
        isReady ? "translate-y-0" : "translate-y-full transition-none",
        "transition-all duration-700 ease-out",
        isLogExpanded && "pointer-events-none opacity-20 scale-95 origin-bottom"
      )}>
        <div className="max-w-md mx-auto h-full w-full flex flex-col justify-center">
          {isScorer ? (
            <ControlPanel /> // スコアラーには特大の入力ボタンを提供[span_8](start_span)[span_8](end_span)
          ) : (
            // 観戦者（ReadOnly）向け：操作パネルの代わりに速報モードを表示[span_9](start_span)[span_9](end_span)
            <div className="p-6 bg-primary/5 rounded-[32px] border border-primary/20 text-center animate-in fade-in zoom-in duration-500">
              <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-tighter mb-3">
                Live Spectating
              </div>
              <p className="text-xl font-black text-foreground italic">リアルタイム速報を配信中</p>
              <p className="text-xs text-muted-foreground mt-2 font-bold opacity-70">
                スコアラーが入力すると自動的に更新されます
              </p>
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
