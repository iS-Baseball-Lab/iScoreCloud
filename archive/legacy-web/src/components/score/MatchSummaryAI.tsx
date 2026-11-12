"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Loader2, Newspaper, Copy, Volume2, Square } from "lucide-react";
import { toast } from "sonner";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⚾️ 型定義（型安全プロトコル適用）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// テキスト生成レスポンス
interface GeminiTextResponse {
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

// 音声生成レスポンス
interface GeminiAudioResponse {
    candidates?: {
        content?: {
            parts?: {
                inlineData?: {
                    data: string;
                    mimeType: string;
                };
            }[];
        };
    }[];
    error?: {
        message: string;
    };
}

interface MatchLog {
    inningText: string;
    description: string;
    resultType: string;
}

interface MatchSummaryAIProps {
    matchId: string;
    finalScore: { my: number; opponent: number };
    logs: MatchLog[];
}

/**
 * ⚾️ AI試合戦評生成コンポーネント
 * 試合終了後、Geminiが実況ログを解析して戦評を作成し、TTSで読み上げます。
 */
export function MatchSummaryAI({ matchId, finalScore, logs }: MatchSummaryAIProps) {
    const [summary, setSummary] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isAudioLoading, setIsAudioLoading] = useState(false);

    const audioRef = useRef<HTMLAudioElement | null>(null);

    // 💡 テキスト戦評の生成
    const generateMatchSummary = async () => {
        if (logs.length === 0) {
            toast.error("実況ログが不足しているため、戦評を生成できません。");
            return;
        }

        setIsGenerating(true);
        try {
            const systemPrompt = `
        あなたは熱狂的なスポーツ新聞の記者です。
        提供された野球の試合ログと最終スコアに基づき、ドラマチックで読み応えのある戦評記事を書いてください。
        
        【構成案】
        1. 衝撃的な見出し（【】で囲む）
        2. 試合全体の流れと決定的なシーンの描写
        3. 今日のヒーローや特筆すべきプレイの称賛
        
        ※常体（だ・である）で執筆してください。音声で読み上げるため、難読漢字には適宜読みを補うか、平易な表現にしてください。
      `;

            const logText = logs.map(l => `[${l.inningText}] ${l.description}`).join("\n");
            const userQuery = `最終スコア: 自チーム ${finalScore.my} - 相手 ${finalScore.opponent}\n実況ログ:\n${logText}`;

            const apiKey = "";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: userQuery }] }],
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                })
            });

            const result = (await response.json()) as GeminiTextResponse;
            if (result.error) throw new Error(result.error.message);

            const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
                setSummary(text.trim());
                toast.success("AI戦評が完成しました！");
            }
        } catch (error) {
            console.error(error);
            toast.error("戦評の執筆に失敗しました");
        } finally {
            setIsGenerating(false);
        }
    };

    // 💡 音声（TTS）の生成と再生
    const playAudioReport = async () => {
        if (!summary) return;
        if (isPlaying) {
            audioRef.current?.pause();
            setIsPlaying(false);
            return;
        }

        setIsAudioLoading(true);
        try {
            const apiKey = "";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;

            // 実況者らしい声（Algenib: 渋い, Puck: 元気）を選択
            const payload = {
                contents: [{ parts: [{ text: `情熱的なスポーツ記者として、次の戦評を読み上げてください：\n${summary}` }] }],
                generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName: "Algenib" } // 渋いスポーツ記者風
                        }
                    }
                }
            };

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = (await response.json()) as GeminiAudioResponse;
            const audioData = result.candidates?.[0]?.content?.parts?.[0]?.inlineData;

            if (audioData?.data) {
                // PCM16をWAVに変換して再生
                const rawData = atob(audioData.data);
                const arrayBuffer = new ArrayBuffer(rawData.length);
                const uint8Array = new Uint8Array(arrayBuffer);
                for (let i = 0; i < rawData.length; i++) uint8Array[i] = rawData.charCodeAt(i);

                // ヘッダー解析からサンプリングレート取得（通常24000Hz）
                const sampleRate = parseInt(audioData.mimeType.match(/rate=(\d+)/)?.[1] || "24000", 10);
                const wavBlob = pcmToWav(new Int16Array(arrayBuffer), sampleRate);
                const url = URL.createObjectURL(wavBlob);

                if (audioRef.current) {
                    audioRef.current.src = url;
                    audioRef.current.play();
                    setIsPlaying(true);
                    audioRef.current.onended = () => setIsPlaying(false);
                }
            }
        } catch (error) {
            console.error(error);
            toast.error("音声の生成に失敗しました");
        } finally {
            setIsAudioLoading(false);
        }
    };

    // 💡 PCM16ビットデータをWAV形式のBlobに変換するヘルパー
    const pcmToWav = (pcmData: Int16Array, sampleRate: number): Blob => {
        const buffer = new ArrayBuffer(44 + pcmData.length * 2);
        const view = new DataView(buffer);
        const writeString = (offset: number, s: string) => {
            for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
        };
        writeString(0, 'RIFF');
        view.setUint32(4, 32 + pcmData.length * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // PCM
        view.setUint16(22, 1, true); // Mono
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, pcmData.length * 2, true);
        for (let i = 0; i < pcmData.length; i++) view.setInt16(44 + i * 2, pcmData[i], true);
        return new Blob([view], { type: 'audio/wav' });
    };

    const copyToClipboard = () => {
        if (!summary) return;
        navigator.clipboard.writeText(summary);
        toast.success("記事をクリップボードにコピーしました！");
    };

    return (
        <Card className="border-primary/20 bg-primary/5 shadow-xl rounded-[32px] overflow-hidden transition-all duration-500">
            <CardHeader className="bg-primary/10 border-b border-primary/10 py-6">
                <CardTitle className="flex items-center justify-between text-primary">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-primary/20 rounded-2xl"><Newspaper className="h-6 w-6" /></div>
                        <div className="flex flex-col">
                            <span className="text-sm font-black uppercase tracking-widest opacity-70">AI Match Reporter</span>
                            <span className="text-xl font-black">AI 試合戦評生成</span>
                        </div>
                    </div>
                    {summary && (
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={playAudioReport}
                            disabled={isAudioLoading}
                            className="h-12 w-12 rounded-full border-primary/30 text-primary hover:bg-primary/10"
                        >
                            {isAudioLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : isPlaying ? <Square className="h-5 w-5 fill-current" /> : <Volume2 className="h-5 w-5" />}
                        </Button>
                    )}
                </CardTitle>
            </CardHeader>

            <CardContent className="p-6 sm:p-8 space-y-6">
                {!summary ? (
                    <div className="text-center py-8 space-y-6">
                        <p className="text-sm font-bold text-muted-foreground leading-relaxed max-w-sm mx-auto">
                            実況ログから、この試合の興奮をスポーツ新聞のような記事にして再現します。完成後は音声で聴くことも可能です。
                        </p>
                        <Button
                            onClick={generateMatchSummary}
                            disabled={isGenerating}
                            className="w-full sm:w-auto h-14 px-10 rounded-full font-black text-lg bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all active:scale-95"
                        >
                            {isGenerating ? <Loader2 className="h-6 w-6 animate-spin mr-3" /> : <Sparkles className="h-6 w-6 mr-3" />}
                            {isGenerating ? "執筆中..." : "戦評を生成する"}
                        </Button>
                    </div>
                ) : (
                    <div className="animate-in fade-in slide-in-from-top-4 duration-700">
                        <div className="bg-background/80 backdrop-blur-sm rounded-3xl p-6 sm:p-8 border border-primary/10 shadow-inner relative group">
                            <div className="whitespace-pre-wrap font-serif text-lg leading-relaxed text-foreground/90 italic">
                                {summary}
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 pt-6">
                            <Button variant="outline" onClick={copyToClipboard} className="flex-1 h-12 rounded-2xl font-bold border-primary/20 text-primary">
                                <Copy className="h-4 w-4 mr-2" /> 記事をコピー
                            </Button>
                            <Button variant="outline" onClick={() => setSummary(null)} className="flex-1 h-12 rounded-2xl font-bold">
                                書き直す
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
            <audio ref={audioRef} className="hidden" />
        </Card>
    );
}