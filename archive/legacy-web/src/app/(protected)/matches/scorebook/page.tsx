"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { ChevronLeft, Construction, BookOpen } from "lucide-react";

export default function ScorebookPage() {
  const searchParams = useSearchParams();
  const matchId = searchParams.get("id");
  const router = useRouter();

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-6 text-center select-none">
      <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6 relative">
        <BookOpen className="w-10 h-10 text-primary relative z-10" />
        <Construction className="w-6 h-6 text-primary absolute -bottom-2 -right-2 bg-background rounded-full p-0.5 animate-bounce" />
      </div>
      
      <h1 className="text-3xl font-black text-foreground mb-4 tracking-tight">
        スコアブック機能
        <br />
        絶賛開発中！
      </h1>
      
      <p className="text-muted-foreground mb-10 font-bold text-sm leading-relaxed max-w-xs mx-auto">
        試合の全打席結果がプロ仕様の<br />
        スコアブック形式で確認できるように<br />
        なる予定です。お楽しみに！
      </p>
      
      <button 
        onClick={() => router.back()} 
        className="flex items-center gap-2 bg-secondary text-secondary-foreground px-8 py-3 rounded-full font-bold shadow-sm hover:scale-105 active:scale-95 transition-all"
      >
        <ChevronLeft className="w-5 h-5" strokeWidth={2.5} />
        一覧へ戻る
      </button>
    </div>
  );
}
