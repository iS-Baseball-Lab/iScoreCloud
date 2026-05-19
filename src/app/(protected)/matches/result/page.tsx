// src/app/(protected)/matches/result/page.tsx
"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/layout/SectionHeader";
import {
  Loader2, Trophy, Download, ChevronLeft,
  Share2, Calendar, Hash, Activity, Target, Zap, Sparkles, TrendingUp
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as htmlToImage from 'html-to-image';
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";

interface Match {
  id: string; opponent: string; date: string; season: string; status: string;
  matchType: string;
  myScore: number; opponentScore: number;
  myInningScores: string; opponentInningScores: string;
  innings?: number;
  myHits?: number; opponentHits?: number;
  myErrors?: number; opponentErrors?: number;
}

interface AtBat {
  inning: number; isTop: number; batterName: string; result: string | null;
}

interface PlayerStats {
  id: string;
  name: string;
  number: string;
  atBats: number;
  runs: number;
  hits: number;
  rbi: number;
  strikeouts: number;
  walks: number;
  avg: string;
}

interface GeminiAnalysisResponse {
  candidates?: {
    content?: {
      parts?: {
        text?: string;
      }[];
    };
  }[];
}

function MatchResultContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const matchId = searchParams.get("id");

  const [match, setMatch] = useState<any | null>(null);
  const [atBats, setAtBats] = useState<any[]>([]);
  const [stats, setStats] = useState<PlayerStats[]>([]);
  const [teamName, setTeamName] = useState<string>("自チーム");
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  // データ取得ロジック (既存)
  useEffect(() => {
    if (!matchId) return;
    const fetchData = async () => {
      try {
        const matchRes = await fetch(`/api/matches/${matchId}`);
        if (matchRes.ok) setMatch(await matchRes.json());
        
        const boxscoreRes = await fetch(`/api/matches/${matchId}/boxscore`);
        if (boxscoreRes.ok) setAtBats(await boxscoreRes.json());

        const statsRes = await fetch(`/api/matches/${matchId}/stats`);
        if (statsRes.ok) {
          const statsData = (await statsRes.json()) as { success: boolean, stats: PlayerStats[] };
          if (statsData.success && statsData.stats) setStats(statsData.stats);
        }
      } catch (error) { console.error(error); }
      finally { setIsLoading(false); }
    };
    fetchData();
  }, [matchId]);

  const analyzePerformance = async () => {
    if (stats.length === 0) return;

    setIsAnalyzing(true);
    setAiAnalysis(null);

    try {
      const statsSummary = stats.map(p => `${p.name}(#${p.number}): ${p.hits}安打 ${p.rbi}打点`).join(", ");
      const prompt = `
        以下の野球の試合結果（個人成績）を分析し、今日のMVP候補を1人選び、その理由とチーム全体への総評を短くドラマチックに述べてください。
        対戦相手: ${match?.opponent || "不明"}
        成績: ${statsSummary}
      `;

      const apiKey = ""; // Canvasで自動提供
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: {
            parts: [{ text: "あなたはプロ野球の敏腕アナリストです。情熱的かつ的確に分析してください。レスポンスは日本語で行ってください。" }]
          }
        })
      });

      const result = (await res.json()) as GeminiAnalysisResponse;
      const analysisText = result.candidates?.[0]?.content?.parts?.[0]?.text;

      if (analysisText) {
        setAiAnalysis(analysisText.trim());
      } else {
        throw new Error("Analysis text not found");
      }
    } catch (e) {
      console.error("AI Analysis error:", e);
      toast.error("AI分析中にエラーが発生しました");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDownloadImage = async () => {
    if (!captureRef.current || !match) return;
    setIsDownloading(true);
    const toastId = toast.loading("画像を生成しています...");
    try {
      const dataUrl = await htmlToImage.toPng(captureRef.current, {
        backgroundColor: '#f8fafc',
        pixelRatio: 3,
      });
      const link = document.createElement("a");
      link.download = `iScore_${match.opponent}_${match.date}.png`;
      link.href = dataUrl;
      link.click();
      toast.success("保存完了！", { id: toastId });
    } catch (error) {
      toast.error("失敗しました", { id: toastId });
    } finally {
      setIsDownloading(false);
    }
  };

  if (isLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!match) return <div className="flex h-screen items-center justify-center font-black">NO DATA</div>;

  const guestScores = match.opponentInningScores ? JSON.parse(match.opponentInningScores) : [];
  const selfScores = match.myInningScores ? JSON.parse(match.myInningScores) : [];
  const inningsCount = Math.max(match.innings || 7, guestScores.length, selfScores.length);

  return (
    <div className="w-full min-h-screen pb-24 animate-in fade-in duration-500">

      {/* 💡 アクションヘッダー */}
      <div className="max-w-4xl mx-auto px-6 pt-8 mb-8 flex items-center justify-between">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => router.back()}
          className="h-10 px-4 rounded-[var(--radius-xl)] font-black gap-2 shadow-sm border-border bg-card text-foreground hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" />
          戻る
        </Button>
        <div className="flex gap-3">
          <Button variant="outline" size="icon" className="rounded-full border-2 border-border/40"><Share2 className="h-4 w-4" /></Button>
          <Button onClick={handleDownloadImage} className="rounded-full font-black px-8 bg-primary shadow-sm active:scale-95 transition-all">
            <Download className="mr-2 h-4 w-4" /> DOWNLOAD
          </Button>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4">
        <div ref={captureRef} className={cn(
          "bg-background transition-all p-8 sm:p-12",
          isDownloading ? "w-[850px] border-none shadow-none" : "rounded-[40px] border-2 border-border/40 shadow-sm"
        )}>

          {/* 1. スコアビジュアル (巨大フォント) */}
          <section className="text-center space-y-10 mb-20">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-4 py-1 bg-primary/10 rounded-full border border-primary/20">
                <span className="text-[10px] font-black text-primary uppercase tracking-[0.3em]">Game Report</span>
              </div>
              <h1 className="text-5xl sm:text-7xl font-black italic tracking-tighter uppercase leading-none">
                vs {match.opponent}
              </h1>
              <div className="flex justify-center items-center gap-4 text-muted-foreground font-black text-[10px] uppercase tracking-widest opacity-60">
                <Calendar className="h-3.5 w-3.5" /> {match.date}
                <span className="h-3 w-px bg-border" />
                <Activity className="h-3.5 w-3.5" /> {match.matchType}
              </div>
            </div>

            <div className="flex items-center justify-center gap-10 sm:gap-20">
              <div className="text-center">
                <p className="text-[10px] font-black text-muted-foreground uppercase mb-2">Opponent</p>
                <p className="text-8xl sm:text-9xl font-black italic tracking-tighter leading-none">{match.opponentScore}</p>
              </div>
              <div className="text-3xl font-black text-muted-foreground/10 italic mt-12">-</div>
              <div className="text-center">
                <p className="text-[10px] font-black text-primary uppercase mb-2">My Team</p>
                <p className={cn(
                  "text-8xl sm:text-9xl font-black italic tracking-tighter leading-none",
                  match.myScore > match.opponentScore ? "text-primary" : "text-foreground"
                )}>{match.myScore}</p>
              </div>
            </div>
          </section>

          {/* 2. ランニングスコア (プロ中継風) */}
          <section className="space-y-6 mb-20">
            <SectionHeader title="イニングスコア" subtitle="Line Score" />
            <div className="bg-card/40 border-2 border-border/40 rounded-[32px] overflow-hidden shadow-xs">
              <div className="overflow-x-auto scrollbar-hide">
                <table className="w-full text-center">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border/40 text-[10px] font-black text-muted-foreground/60 uppercase">
                      <th className="p-5 text-left w-32 tracking-widest">Teams</th>
                      {[...Array(inningsCount)].map((_, i) => (
                        <th key={i} className="w-10 italic">{i + 1}</th>
                      ))}
                      <th className="w-14 bg-primary/5 text-primary italic">R</th>
                      <th className="w-10 italic opacity-30">H</th>
                      <th className="w-10 italic opacity-30 text-rose-500">E</th>
                    </tr>
                  </thead>
                  <tbody className="font-black text-xl italic tabular-nums">
                    <tr className="border-b border-border/20">
                      <td className="p-5 text-left text-sm not-italic uppercase tracking-tight">{match.opponent}</td>
                      {[...Array(inningsCount)].map((_, i) => (
                        <td key={i} className="text-muted-foreground/40">{guestScores[i] ?? 0}</td>
                      ))}
                      <td className="bg-primary/5 p-4 text-3xl">{match.opponentScore}</td>
                      <td className="text-sm opacity-30">{match.opponentHits || '-'}</td>
                      <td className="text-sm opacity-30 text-rose-500">{match.opponentErrors || '-'}</td>
                    </tr>
                    <tr>
                      <td className="p-5 text-left text-sm not-italic uppercase tracking-tight text-primary">{teamName}</td>
                      {[...Array(inningsCount)].map((_, i) => (
                        <td key={i} className="text-muted-foreground/40">{selfScores[i] ?? 0}</td>
                      ))}
                      <td className="bg-primary/5 p-4 text-3xl text-primary">{match.myScore}</td>
                      <td className="text-sm opacity-30">{match.myHits || '-'}</td>
                      <td className="text-sm opacity-30 text-rose-500">{match.myErrors || '-'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* 3. AI パフォーマンス分析カード */}
          <section className="space-y-6 mb-20">
            <SectionHeader title="戦評" subtitle="AI Insight" />
            <Card className="border-primary/20 bg-card rounded-[32px] overflow-hidden shadow-sm">
              <CardContent className="p-6 space-y-4">
                {!aiAnalysis ? (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className="p-4 bg-primary/20 rounded-2xl text-primary animate-pulse shadow-sm">
                        <Sparkles className="h-7 w-7" />
                      </div>
                      <div>
                        <p className="font-black text-lg text-foreground">AI パフォーマンス分析</p>
                        <p className="text-xs text-muted-foreground font-bold">今日のMVPと勝因をAIがプロ視点で分析します</p>
                      </div>
                    </div>
                    <Button
                      onClick={analyzePerformance}
                      disabled={isAnalyzing}
                      className="w-full sm:w-auto rounded-full font-black px-10 h-14 bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-95"
                    >
                      {isAnalyzing ? (
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      ) : (
                        <TrendingUp className="h-5 w-5 mr-2" />
                      )}
                      分析を開始する
                    </Button>
                  </div>
                ) : (
                  <div className="animate-in fade-in slide-in-from-top-4 duration-700">
                    <div className="flex items-center gap-2 mb-4 border-b border-border/50 pb-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="text-[10px] font-black uppercase text-primary tracking-widest">AI Analyst Insight</span>
                    </div>
                    <div className="relative">
                      <div className="absolute -left-2 top-0 bottom-0 w-1 bg-primary rounded-full" />
                      <p className="text-base font-bold leading-relaxed italic text-foreground pl-4 py-2">
                        {aiAnalysis}
                      </p>
                    </div>
                    <div className="flex justify-end mt-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAiAnalysis(null)}
                        className="text-[10px] font-black text-muted-foreground hover:text-foreground"
                      >
                        分析結果を閉じる
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {/* 4. 成績データタブ */}
          <section className="space-y-6 mb-20">
            <SectionHeader title="個人成績" subtitle="Player Stats" />
            <Tabs defaultValue="batting" className="w-full">
              <TabsList className="grid w-full grid-cols-2 h-14 rounded-2xl bg-muted/50 p-1.5 border border-border">
                <TabsTrigger
                  value="batting"
                  className="rounded-xl font-black text-xs tracking-widest data-[state=active]:bg-background data-[state=active]:text-primary"
                >
                  <Target className="h-4 w-4 mr-2" /> BATTING
                </TabsTrigger>
                <TabsTrigger
                  value="pitching"
                  className="rounded-xl font-black text-xs tracking-widest data-[state=active]:bg-background data-[state=active]:text-primary"
                >
                  <Zap className="h-4 w-4 mr-2" /> PITCHING
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="batting" className="mt-6">
                <Card className="rounded-[32px] border-border bg-card overflow-hidden">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow className="border-border">
                          <TableHead className="font-black text-[10px] text-muted-foreground uppercase tracking-widest pl-6">Player</TableHead>
                          <TableHead className="text-center font-black text-[10px] text-muted-foreground uppercase tracking-widest">AB</TableHead>
                          <TableHead className="text-center font-black text-[10px] text-muted-foreground uppercase tracking-widest">H</TableHead>
                          <TableHead className="text-center font-black text-[10px] text-muted-foreground uppercase tracking-widest">RBI</TableHead>
                          <TableHead className="text-center font-black text-[10px] text-muted-foreground uppercase tracking-widest">R</TableHead>
                          <TableHead className="text-center font-black text-[10px] text-muted-foreground uppercase tracking-widest">K/BB</TableHead>
                          <TableHead className="text-right font-black text-[10px] text-primary uppercase tracking-widest pr-6">AVG</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stats.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-20 text-muted-foreground font-bold">
                              データがありません
                            </TableCell>
                          </TableRow>
                        ) : (
                          stats.map((player) => (
                            <TableRow key={player.id} className="border-border hover:bg-muted/30 transition-colors group">
                              <TableCell className="font-bold py-4 pl-6">
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] font-black text-muted-foreground w-6">#{player.number}</span>
                                  <span className="truncate group-hover:text-primary transition-colors text-foreground">{player.name}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-center tabular-nums text-muted-foreground font-bold">{player.atBats}</TableCell>
                              <TableCell className="text-center tabular-nums font-black text-foreground">{player.hits}</TableCell>
                              <TableCell className="text-center tabular-nums font-black text-foreground">{player.rbi}</TableCell>
                              <TableCell className="text-center tabular-nums text-muted-foreground font-bold">{player.runs}</TableCell>
                              <TableCell className="text-center text-[10px] text-muted-foreground font-bold tabular-nums">
                                {player.strikeouts} / {player.walks}
                              </TableCell>
                              <TableCell className="text-right tabular-nums font-black text-primary text-base pr-6">
                                {player.avg}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="pitching" className="mt-6">
                <Card className="rounded-[32px] border-border bg-card overflow-hidden py-20">
                  <div className="flex flex-col items-center space-y-4 opacity-50">
                    <Zap className="h-16 w-12 text-muted-foreground" />
                    <p className="font-black tracking-widest uppercase text-sm text-foreground">No Pitching Data Recorded</p>
                  </div>
                </Card>
              </TabsContent>
            </Tabs>
          </section>

          {/* 💡 フッター：透かしロゴ風 */}
          <div className="pt-12 border-t border-border/40 flex flex-col items-center gap-3">
            <div className="flex items-center gap-3 opacity-20">
              <Trophy className="h-5 w-5" />
              <span className="text-[10px] font-black uppercase tracking-[0.8em]">i-Score Analytics</span>
            </div>
            <p className="text-[8px] font-bold text-muted-foreground/20 uppercase tracking-[0.3em]">Generated by Baseball Science Lab</p>
          </div>

        </div>
      </main>
    </div>
  );
}

export default function MatchResultPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <MatchResultContent />
    </Suspense>
  );
}