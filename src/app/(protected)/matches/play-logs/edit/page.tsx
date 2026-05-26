// filepath: src/app/(protected)/matches/play-logs/edit/page.tsx
"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/layout/SectionHeader";

// クエリパラメータを読み込むコアフォームコンポーネント
function EditLogForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // 🔥 クエリパラメータ '?id=xxx' から値を取得
  const logId = searchParams.get("id");

  const [result, setResult] = useState("");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!logId) return;

    // TODO: 本来はココで Workers API (D1) から logId を使って最新データを取得
    setResult("レフト前ヒット");
    setDescription("高めのストレートをジャストミートし、三遊間を鋭く抜けるレフト前安打。ランナー進塁。");
    setIsLoading(false);
  }, [logId]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Cloudflare Workers への PUT 送信処理
    alert(`プレイログ(ID: ${logId})を更新しました！🔥`);
    router.push("/matches/play-logs");
  };

  if (!logId) {
    return (
      <div className="p-6 bg-destructive/10 border border-destructive text-destructive font-black rounded-2xl text-center">
        エラー: ログIDが指定されていません。
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-12 text-center">
        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] animate-pulse">Loading...</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 bg-card border border-border/50 p-5 rounded-[var(--radius-2xl)] shadow-sm">
      
      {/* 打席結果入力 */}
      <div className="space-y-2">
        <label className="text-xs font-black text-muted-foreground tracking-wider uppercase pl-1">打席結果</label>
        <Input
          type="text"
          value={result}
          onChange={(e) => setResult(e.target.value)}
          placeholder="例：レフト前ヒット"
          className="rounded-[var(--radius-xl)]"
          required
        />
      </div>

      {/* 詳細・メモ入力 */}
      <div className="space-y-2">
        <label className="text-xs font-black text-muted-foreground tracking-wider uppercase pl-1">詳細・メモ</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="プレイの具体的な内容や状況などをメモできます"
          className="block w-full rounded-[var(--radius-xl)] border border-border/60 bg-muted/20 px-4 py-3 text-base font-bold shadow-xs transition-all duration-300 placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/20 focus-visible:bg-background focus-visible:shadow-md disabled:cursor-not-allowed disabled:opacity-50 min-h-[120px]"
        />
      </div>

      {/* 保存ボタン */}
      <Button
        type="submit"
        className="w-full h-14 bg-primary text-primary-foreground font-black rounded-[var(--radius-xl)] shadow-md flex items-center justify-center gap-2 text-base active:scale-[0.98] transition-transform"
      >
        <Save className="w-5 h-5" strokeWidth={2.5} />
        <span>ログを保存する</span>
      </Button>
    </form>
  );
}

// ページコンポーネント全体（SuspenseでラップしてNext.jsのエラーを防止）
export default function PlayLogEditPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen pb-28 animate-in fade-in duration-400">
      <div className="max-w-md mx-auto px-4 pt-6 space-y-6">
        
        {/* ━━ 戻るボタン & セクションヘッダー ━━ */}
        <div className="space-y-4">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => router.back()}
            className="h-10 px-4 rounded-[var(--radius-xl)] font-black gap-2 shadow-sm border-border bg-card text-foreground hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
            戻る
          </Button>
          <SectionHeader 
            title="プレイログ編集" 
            subtitle="EDIT PLAY LOG" 
            showPulse={false} 
          />
        </div>

        {/* useSearchParamsを使うためSuspenseでラップ 🔥 */}
        <Suspense fallback={
          <div className="p-12 text-center">
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] animate-pulse">Loading...</span>
          </div>
        }>
          <EditFormWrap />
        </Suspense>

      </div>
    </div>
  );
}

// 命名のバッティングを避けるためのラッパー
function EditFormWrap() {
  return <EditLogForm />;
}
