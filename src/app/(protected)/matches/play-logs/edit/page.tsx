// filepath: src/app/matches/play-logs/edit/page.tsx
"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";

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
    setDescription("高めのストレートをジャストミート");
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
      <div className="p-6 bg-destructive/10 border border-destructive text-destructive font-black rounded-xl text-center">
        エラー: ログIDが指定されていません。
      </div>
    );
  }

  if (isLoading) return <div className="p-4 text-center font-black text-muted-foreground">Loading...</div>;

  return (
    <form onSubmit={handleSave} className="space-y-4 bg-card border border-border p-4 rounded-[var(--radius-xl)]">
      <div className="space-y-1">
        <label className="text-xs font-black text-muted-foreground">打席結果</label>
        <input
          type="text"
          value={result}
          onChange={(e) => setResult(e.target.value)}
          className="w-full h-12 px-4 rounded-xl border border-border bg-background text-foreground font-bold focus:outline-none focus:border-primary text-base"
          required
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-black text-muted-foreground">詳細・メモ</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full p-4 rounded-xl border border-border bg-background text-foreground font-bold focus:outline-none focus:border-primary text-base min-h-[100px]"
        />
      </div>

      <button
        type="submit"
        className="w-full h-14 bg-primary text-primary-foreground font-black rounded-[var(--radius-xl)] shadow-md flex items-center justify-center gap-2 text-lg active:scale-[0.98] transition-transform"
      >
        <Save className="w-5 h-5" />
        <span>ログを保存する</span>
      </button>
    </form>
  );
}

// ページコンポーネント全体（SuspenseでラップしてNext.jsのエラーを防止）
export default function PlayLogEditPage() {
  const router = useRouter();

  return (
    <div className="p-4 max-w-md mx-auto bg-background min-h-screen pb-24 space-y-4">
      {/* 戻るボタン */}
      <button
        onClick={() => router.back()}
        className="h-10 px-4 rounded-[var(--radius-xl)] font-black gap-2 shadow-sm border border-border bg-card text-foreground hover:bg-muted flex items-center"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>戻る</span>
      </button>

      {/* セクションヘッダー */}
      <div>
        <span className="text-xs font-black text-muted-foreground tracking-wider block uppercase">EDIT LOG</span>
        <h1 className="text-2xl font-black text-foreground">プレイログ編集</h1>
      </div>

      {/* useSearchParamsを使うためSuspenseでラップ 🔥 */}
      <Suspense fallback={<div className="p-4 text-center font-black text-muted-foreground">Loading...</div>}>
        <EditFormWrap />
      </Suspense>
    </div>
  );
}

// 命名のバッティングを避けるためのラッパー
function EditFormWrap() {
  return <EditLogForm />;
}
