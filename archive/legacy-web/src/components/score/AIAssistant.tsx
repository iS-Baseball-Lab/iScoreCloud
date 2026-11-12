"use client";

import { useState } from "react";
// 💡 エラー修正: プロジェクト標準のエイリアスパス (@/) を使用
import { useScore } from "@/contexts/ScoreContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Loader2, MessageSquareQuote, X } from "lucide-react";
import { toast } from "sonner";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⚾️ Gemini API レスポンスの型定義（unknown回避用）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface GeminiResponse {
    candidates?: {
        content?: {
            parts?: {
                text?: string;
            }[];
        };
    }[];
    error?: {
        message: string;
    };
}

/**
 * ⚾️ AIアシスタント・コンポーネント
 * Gemini APIを使用して、現在の戦況に基づいたアドバイスを提供します。
 */
export function AIAssistant() {
    const { state } = useScore();
    const [advice, setAdvice] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // 💡 Gemini APIを呼び出してアドバイスを取得
    const getAIAdvice = async () => {
        setIsLoading(true);
        setAdvice(null);

        const runnersText = [
            state.runners.base1 ? "1塁" : "",
            state.runners.base2 ? "2塁" : "",
            state.runners.base3 ? "3塁" : "",
        ].filter(Boolean).join("・") || "なし";

        const systemPrompt = "あなたはプロ野球の熟練ベンチコーチです。現在の状況を分析し、監督へ簡潔で鋭い戦略アドバイスを1〜2文で提供してください。";
        const userQuery = `
      状況: ${state.inning}回${state.isTop ? "表" : "裏"}
      スコア: 自チーム ${state.myScore} - 相手 ${state.opponentScore}
      アウト: ${state.outs}
      カウント: ${state.balls}ボール ${state.strikes}ストライク
      ランナー: ${runnersText}
      
      この状況で、攻撃側（または守備側）が取るべきベストな戦略を1つ教えてください。
    `;

        try {
            const apiKey = ""; // Canvas環境では空文字にすると自動的にキーが提供されます
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: userQuery }] }],
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                })
            });

            // 💡 修正ポイント: キャストを行うことで 'unknown' エラーを防止
            const result = (await response.json()) as GeminiResponse;

            if (result.error) {
                throw new Error(result.error.message);
            }

            const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

            if (text) {
                setAdvice(text.trim());
            } else {
                throw new Error("アドバイスの生成に失敗しました");
            }
        } catch (error) {
            console.error(error);
            toast.error("AIコーチが通信エラーでベンチに戻れませんでした...");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="mt-4 space-y-3">
            {!advice ? (
                <Button
                    onClick={getAIAdvice}
                    disabled={isLoading}
                    variant="outline"
                    className="w-full h-12 rounded-2xl border-primary/30 bg-primary/5 text-primary font-black hover:bg-primary/10 transition-all shadow-sm"
                >
                    {isLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    ) : (
                        <Sparkles className="h-5 w-5 mr-2" />
                    )}
                    {isLoading ? "AIコーチ思考中..." : "✨ AIコーチに戦略を聞く"}
                </Button>
            ) : (
                <Card className="bg-primary/10 border-primary/20 rounded-2xl overflow-hidden animate-in zoom-in-95 duration-300 relative">
                    <button
                        onClick={() => setAdvice(null)}
                        className="absolute top-2 right-2 text-primary/50 hover:text-primary transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                    <CardContent className="p-4 flex gap-3">
                        <div className="p-2 h-fit bg-primary/20 rounded-full text-primary">
                            <MessageSquareQuote className="h-5 w-5" />
                        </div>
                        <div className="space-y-1">
                            <p className="text-[10px] font-black text-primary/60 uppercase tracking-widest">Coach Advice</p>
                            <p className="text-sm font-bold text-foreground leading-relaxed">
                                {advice}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}