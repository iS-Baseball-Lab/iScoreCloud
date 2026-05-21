// filepath: `src/components/score/TestDataGenerator.tsx`
"use client";

import { Button } from "@/components/ui/button";
import { DatabaseZap, Loader2 } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

export function TestDataGenerator() {
  const [isGenerating, setIsGenerating] = useState(false);
  const searchParams = useSearchParams();
  const matchId = searchParams.get("id");

  const generateScenario = async () => {
    if (!matchId) {
      toast.error("IDが見つかりません");
      return;
    }

    setIsGenerating(true);
    const loadingToast = toast.loading("データを注入中...");

    try {
      // 💡 1. 試合の基本ステータスを更新
      const res = await fetch(`/api/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // 数値データ
          inning: 7,
          isTop: false,
          myScore: 3,
          opponentScore: 5,
          balls: 3,
          strikes: 2,
          outs: 2,
          // 💡 イニングスコア（配列がそのままDBに入らない場合は文字列化を試す）
          myInningScores: [0, 1, 0, 0, 2, 0, 0],
          opponentInningScores: [2, 0, 0, 3, 0, 0, 0],
          // 💡 走者（Contextが期待する { base1: { name: "..." } } の形式）
          runners: {
            base1: { id: "p1", name: "鈴木", position: "1B" },
            base2: { id: "p2", name: "佐藤", position: "2B" },
            base3: { id: "p3", name: "田中", position: "3B" },
          },
          status: "IN_PROGRESS" // 試合中ステータスを確実にする
        }),
      });

      if (!res.ok) {
        const errorData = (await res.json()) as any;
        throw new Error(errorData.message || "更新に失敗しました");
      }

      // 💡 2. ログを1件追加（これが表示されればAPIは生きています）
      await fetch(`/api/matches/${matchId}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inningText: "7回裏",
          resultType: "info",
          description: "【テスト】2死満塁、逆転のチャンス！",
        }),
      });

      toast.dismiss(loadingToast);
      toast.success("注入成功！再読み込みします...");
      
      // 💡 3. 少し長めに待ってからリロード
      setTimeout(() => {
        window.location.href = `/matches/score?id=${matchId}&t=${Date.now()}`; // キャッシュ回避
      }, 1000);
      
    } catch (e: any) {
      console.error("DEBUG ERROR:", e);
      toast.dismiss(loadingToast);
      toast.error(`エラー: ${e.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button 
      onClick={generateScenario}
      disabled={isGenerating}
      variant="destructive"
      className="h-10 px-4 rounded-xl shadow-xl border border-white/20 bg-red-600 text-white font-black italic gap-2 animate-pulse"
    >
      {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseZap className="h-4 w-4" />}
      FILL DATA
    </Button>
  );
}
