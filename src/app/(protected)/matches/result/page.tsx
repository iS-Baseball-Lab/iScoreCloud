// filepath: src/app/(protected)/matches/result/page.tsx
"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { EmptyState } from "@/components/layout/EmptyState";
import {
  Loader2, Trophy, Download, ChevronLeft,
  Share2, Calendar, Activity, Target, Zap, Sparkles, TrendingUp,
  Video, Edit3, X, Play, Plus, BookOpen, AlertCircle
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
  id: string;
  opponent: string;
  date: string;
  season: string;
  status: string;
  matchType: string;
  battingOrder: "first" | "second";
  myScore: number;
  opponentScore: number;
  myInningScores: string;
  opponentInningScores: string;
  innings?: number;
  myHits?: number;
  opponentHits?: number;
  myErrors?: number;
  opponentErrors?: number;
  youtubeUrl?: string | null;
  venueName?: string | null;
  surfaceDetails?: string | null;
}

interface AtBat {
  id: string;
  inning: number;
  isTop: number;
  result: string | null;
  batterId: string | null;
  batterName: string;
  batterNumber: string;
  pitcherId: string | null;
  pitcherName: string;
}

interface PlayerStats {
  id: string;
  name: string;
  number: string;
  plateAppearances: number;
  atBats: number;
  runs: number;
  hits: number;
  rbi: number;
  strikeouts: number;
  walks: number;
  avg: string;
}

interface PitcherStats {
  id: string;
  name: string;
  number: string;
  outs: number;
  ip: string;
  hits: number;
  walks: number;
  strikeouts: number;
  runs: number;
  earnedRuns: number;
  era: string;
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

// YouTube 動画ID 抽出ユーティリティ
function getYoutubeVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// 打撃・走塁詳細の抽出ロジック
function extractGameDetails(atBats: AtBat[], isMyTeamTop: boolean) {
  const details = {
    double: [] as string[],       // 二塁打
    triple: [] as string[],       // 三塁打
    homeRun: [] as string[],      // 本塁打
    sacrificeBunt: [] as string[], // 犠打
    sacrificeFly: [] as string[],  // 犠飛
    stolenBase: [] as string[],    // 盗塁
    doublePlay: [] as string[],    // 併殺打
  };

  atBats.forEach((ab) => {
    const isMyAttack = ab.isTop === (isMyTeamTop ? 1 : 0);
    if (!isMyAttack || !ab.result) return;

    const res = ab.result;
    const name = ab.batterName || "不明";
    const inningText = `${ab.inning}回`;

    if (res.includes("2B") || res.includes("二塁打") || res.includes("２塁打")) {
      details.double.push(`${name} (${inningText})`);
    } else if (res.includes("3B") || res.includes("三塁打") || res.includes("３塁打")) {
      details.triple.push(`${name} (${inningText})`);
    } else if (res.includes("HR") || res.includes("本塁打")) {
      details.homeRun.push(`${name} (${inningText})`);
    }

    if (res.includes("SH") || res.includes("犠打") || (res.includes("犠") && !res.includes("飛"))) {
      details.sacrificeBunt.push(`${name} (${inningText})`);
    } else if (res.includes("SF") || res.includes("犠飛")) {
      details.sacrificeFly.push(`${name} (${inningText})`);
    }

    if (res.includes("盗塁") || res.includes("SB")) {
      details.stolenBase.push(`${name} (${inningText})`);
    }

    if (res.includes("併殺") || res.includes("DP")) {
      details.doublePlay.push(`${name} (${inningText})`);
    }
  });

  return details;
}

function MatchResultContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const matchId = searchParams.get("id");

  const [match, setMatch] = useState<Match | null>(null);
  const [atBats, setAtBats] = useState<AtBat[]>([]);
  const [stats, setStats] = useState<PlayerStats[]>([]);
  const [pitcherStats, setPitcherStats] = useState<PitcherStats[]>([]);
  const [teamName, setTeamName] = useState<string>("自チーム");
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  // YouTube インプレース編集用モーダル状態
  const [isYoutubeModalOpen, setIsYoutubeModalOpen] = useState(false);
  const [inputYoutubeUrl, setInputYoutubeUrl] = useState("");
  const [isSavingUrl, setIsSavingUrl] = useState(false);

  // データ取得ロジック
  useEffect(() => {
    if (!matchId) return;
    const fetchData = async () => {
      try {
        const matchRes = await fetch(`/api/matches/${matchId}`);
        if (matchRes.ok) {
          const json = (await matchRes.json()) as any;
          if (json.success && json.match) {
            setMatch(json.match);
            setInputYoutubeUrl(json.match.youtubeUrl || "");
          }
        }
        
        const boxscoreRes = await fetch(`/api/matches/${matchId}/boxscore`);
        if (boxscoreRes.ok) setAtBats((await boxscoreRes.json()) as AtBat[]);

        const statsRes = await fetch(`/api/matches/${matchId}/stats`);
        if (statsRes.ok) {
          const statsData = (await statsRes.json()) as any;
          if (statsData.success) {
            setStats(statsData.stats || []);
            setPitcherStats(statsData.pitcherStats || []);
          }
        }
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [matchId]);

  // AI分析
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

      const apiKey = ""; // 自動提供
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

  // 画像保存
  const handleDownloadImage = async () => {
    if (!captureRef.current || !match) return;
    setIsDownloading(true);
    const toastId = toast.loading("画像を生成しています...");
    try {
      const dataUrl = await htmlToImage.toPng(captureRef.current, {
        backgroundColor: '#0f172a', // ダークな背景で出力
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

  // YouTube URL 保存処理
  const handleSaveYoutubeUrl = async () => {
    if (!matchId) return;
    setIsSavingUrl(true);
    try {
      const res = await fetch(`/api/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtubeUrl: inputYoutubeUrl || null }),
      });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) throw new Error(data.error || "動画URLの更新に失敗しました");

      toast.success("試合動画URLを更新しました！");
      setMatch(prev => prev ? { ...prev, youtubeUrl: inputYoutubeUrl || null } : null);
      setIsYoutubeModalOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存に失敗しました");
    } finally {
      setIsSavingUrl(false);
    }
  };

  if (isLoading) return <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-100"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!match) return <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-100"><EmptyState icon={AlertCircle} title="データが見つかりません" description="指定された試合データが存在しないか、削除された可能性があります。" /></div>;

  const guestScores = match.opponentInningScores ? JSON.parse(match.opponentInningScores) : [];
  const selfScores = match.myInningScores ? JSON.parse(match.myInningScores) : [];
  const inningsCount = Math.max(match.innings || 7, guestScores.length, selfScores.length);
  const isMyTeamTop = match.battingOrder === "first";

  // 打者成績合計の算出
  const batterTotal = stats.reduce(
    (acc, cur) => {
      acc.plateAppearances += cur.plateAppearances;
      acc.atBats += cur.atBats;
      acc.hits += cur.hits;
      acc.rbi += cur.rbi;
      acc.runs += cur.runs;
      const k = parseInt(cur.strikeouts.toString()) || 0;
      const bb = parseInt(cur.walks.toString()) || 0;
      acc.strikeouts += k;
      acc.walks += bb;
      return acc;
    },
    { plateAppearances: 0, atBats: 0, hits: 0, rbi: 0, runs: 0, strikeouts: 0, walks: 0 }
  );

  const teamAvgVal = batterTotal.atBats > 0 ? batterTotal.hits / batterTotal.atBats : 0;
  let teamAvgStr = teamAvgVal.toFixed(3);
  if (teamAvgStr.startsWith("0.")) {
    teamAvgStr = teamAvgStr.substring(1);
  } else if (teamAvgStr === "1.000") {
    teamAvgStr = "1.00";
  } else if (batterTotal.atBats === 0) {
    teamAvgStr = ".000";
  }

  // 投手成績合計の算出
  const pitcherTotal = pitcherStats.reduce(
    (acc, cur) => {
      acc.outs += cur.outs;
      acc.hits += cur.hits;
      acc.walks += cur.walks;
      acc.strikeouts += cur.strikeouts;
      acc.runs += cur.runs;
      acc.earnedRuns += cur.earnedRuns;
      return acc;
    },
    { outs: 0, hits: 0, walks: 0, strikeouts: 0, runs: 0, earnedRuns: 0 }
  );

  const totalInningsInt = Math.floor(pitcherTotal.outs / 3);
  const totalInningsFrac = pitcherTotal.outs % 3;
  const teamIpStr = totalInningsFrac > 0 ? `${totalInningsInt}.${totalInningsFrac}` : `${totalInningsInt}.0`;
  const teamEraVal = pitcherTotal.outs > 0 ? (pitcherTotal.earnedRuns * 7 * 3) / pitcherTotal.outs : 0;
  const teamEraStr = pitcherTotal.outs > 0 ? teamEraVal.toFixed(2) : "0.00";

  // 打撃・走塁詳細データの抽出
  const gameDetails = extractGameDetails(atBats, isMyTeamTop);
  const hasGameDetails = Object.values(gameDetails).some(arr => arr.length > 0);

  const youtubeVideoId = getYoutubeVideoId(match.youtubeUrl);

  return (
    <div className="w-full min-h-screen pb-24 bg-slate-950 text-slate-100 animate-in fade-in duration-500">

      {/* 💡 アクションヘッダー（iScoreCloud 戻るボタン規約準拠） */}
      <div className="max-w-4xl mx-auto px-6 pt-8 mb-8 flex items-center justify-between">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => router.back()}
          className="h-10 px-4 rounded-[var(--radius-xl)] font-black gap-2 shadow-sm border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
          戻る
        </Button>
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => setIsYoutubeModalOpen(true)}
            className="rounded-full border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white"
            title="試合動画URLを編集"
          >
            <Video className="h-4 w-4" />
          </Button>
          <Button onClick={handleDownloadImage} className="rounded-full font-black px-8 bg-emerald-600 hover:bg-emerald-500 text-white shadow-md active:scale-95 transition-all">
            <Download className="mr-2 h-4 w-4" /> DOWNLOAD
          </Button>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 space-y-8">
        
        {/* 🎬 YouTube 動画セクション */}
        <section className="space-y-4">
          <SectionHeader title="試合動画" subtitle="Game Video" />
          {youtubeVideoId ? (
            <div className="relative group rounded-[32px] overflow-hidden border border-slate-800 bg-slate-900 shadow-lg">
              <div className="aspect-video w-full">
                <iframe
                  src={`https://www.youtube.com/embed/${youtubeVideoId}`}
                  title="YouTube video player"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="w-full h-full"
                />
              </div>
              <button 
                onClick={() => setIsYoutubeModalOpen(true)}
                className="absolute top-4 right-4 bg-slate-950/80 hover:bg-slate-950 text-slate-200 p-2.5 rounded-full border border-slate-800 transition-all opacity-0 group-hover:opacity-100 flex items-center gap-1.5 text-xs font-black"
              >
                <Edit3 className="h-3.5 w-3.5" /> URL変更
              </button>
            </div>
          ) : (
            <Card 
              onClick={() => setIsYoutubeModalOpen(true)}
              className="border-dashed border-2 border-slate-800 bg-slate-900/40 hover:bg-slate-900/60 rounded-[32px] cursor-pointer transition-all duration-300 group py-12 flex flex-col items-center justify-center gap-4 text-center px-6"
            >
              <div className="p-5 bg-slate-800/80 rounded-full text-slate-400 group-hover:text-primary group-hover:scale-110 transition-all">
                <Play className="h-8 w-8 fill-current text-slate-400 group-hover:text-emerald-500" />
              </div>
              <div>
                <p className="font-black text-slate-200 group-hover:text-white text-base">YouTube 試合動画を設定する</p>
                <p className="text-xs text-slate-500 mt-1 font-bold">試合のハイライトやフル動画を埋め込んで記録を豪華に保存</p>
              </div>
              <Button size="sm" className="rounded-full font-black mt-2 bg-slate-800 text-slate-300 hover:bg-slate-700">
                <Plus className="h-4 w-4 mr-1" /> URLを登録
              </Button>
            </Card>
          )}
        </section>

        {/* 🏟️ スコア ＆ チーム成績（キャプチャエリア） */}
        <div ref={captureRef} className={cn(
          "bg-slate-950 transition-all space-y-12",
          isDownloading ? "w-[850px] p-12 border-none shadow-none text-slate-100" : "p-8 sm:p-12 rounded-[40px] border border-slate-800 shadow-2xl bg-slate-900/40"
        )}>

          {/* 1. スコアビジュアル (巨大フォント) */}
          <section className="text-center space-y-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-950/50 rounded-full border border-emerald-800/40">
                <Trophy className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em]">Game Report</span>
              </div>
              <h1 className="text-4xl sm:text-6xl font-black italic tracking-tighter uppercase leading-none text-white">
                vs {match.opponent}
              </h1>
              <div className="flex justify-center items-center gap-4 text-slate-400 font-bold text-xs uppercase tracking-wider">
                <div className="flex items-center gap-1.5"><Calendar className="h-4 w-4 text-slate-500" /> {match.date}</div>
                <span className="h-3 w-px bg-slate-800" />
                <div className="flex items-center gap-1.5"><Activity className="h-4 w-4 text-slate-500" /> {match.matchType}</div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-8 sm:gap-16 pt-4">
              <div className="text-center">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Opponent</p>
                <p className="text-7xl sm:text-8xl font-black italic tracking-tighter leading-none text-slate-300">{match.opponentScore}</p>
              </div>
              <div className="text-4xl font-black text-slate-700 italic mt-8">-</div>
              <div className="text-center">
                <p className="text-xs font-black text-emerald-500 uppercase tracking-widest mb-2">My Team</p>
                <p className={cn(
                  "text-7xl sm:text-8xl font-black italic tracking-tighter leading-none",
                  match.myScore > match.opponentScore ? "text-emerald-500" : "text-white"
                )}>{match.myScore}</p>
              </div>
            </div>

            {(match.venueName || match.surfaceDetails) && (
              <p className="text-xs text-slate-500 font-bold tracking-wide pt-2">
                🏟️ {match.venueName || match.surfaceDetails}
              </p>
            )}
          </section>

          {/* 2. ランニングスコア (プロ中継風) */}
          <section className="space-y-5">
            <SectionHeader title="イニングスコア" subtitle="Line Score" />
            <div className="bg-slate-900 border border-slate-800 rounded-[28px] overflow-hidden shadow-md">
              <div className="overflow-x-auto scrollbar-hide">
                <table className="w-full text-center">
                  <thead>
                    <tr className="bg-slate-850/80 border-b border-slate-800 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      <th className="p-4 text-left w-32 pl-6">Teams</th>
                      {[...Array(inningsCount)].map((_, i) => (
                        <th key={i} className="w-10 italic">{i + 1}</th>
                      ))}
                      <th className="w-14 bg-emerald-950/20 text-emerald-500 italic">R</th>
                      <th className="w-10 italic opacity-50">H</th>
                      <th className="w-10 italic opacity-50 text-rose-500">E</th>
                    </tr>
                  </thead>
                  <tbody className="font-black text-lg italic tabular-nums text-slate-200">
                    <tr className="border-b border-slate-800/60">
                      <td className="p-4 text-left text-sm not-italic uppercase tracking-tight text-slate-400 pl-6">{match.opponent}</td>
                      {[...Array(inningsCount)].map((_, i) => (
                        <td key={i} className="text-slate-500">{guestScores[i] ?? 0}</td>
                      ))}
                      <td className="bg-emerald-950/10 p-3 text-2xl text-slate-300">{match.opponentScore}</td>
                      <td className="text-xs opacity-50">{match.opponentHits || '-'}</td>
                      <td className="text-xs opacity-50 text-rose-500">{match.opponentErrors || '-'}</td>
                    </tr>
                    <tr className="bg-slate-900/50">
                      <td className="p-4 text-left text-sm not-italic uppercase tracking-tight text-emerald-500 pl-6">{teamName}</td>
                      {[...Array(inningsCount)].map((_, i) => (
                        <td key={i} className="text-slate-500">{selfScores[i] ?? 0}</td>
                      ))}
                      <td className="bg-emerald-950/10 p-3 text-2xl text-emerald-500">{match.myScore}</td>
                      <td className="text-xs opacity-50">{match.myHits || '-'}</td>
                      <td className="text-xs opacity-50 text-rose-500">{match.myErrors || '-'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* 3. AI パフォーマンス分析カード */}
          <section className="space-y-5">
            <SectionHeader title="戦評" subtitle="AI Insight" />
            <Card className="border-emerald-900/30 bg-slate-900 rounded-[28px] overflow-hidden shadow-md">
              <CardContent className="p-6 space-y-4">
                {!aiAnalysis ? (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className="p-4 bg-emerald-950 text-emerald-500 rounded-2xl shadow-inner animate-pulse">
                        <Sparkles className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="font-black text-base text-slate-100">AI パフォーマンス分析</p>
                        <p className="text-xs text-slate-400 font-bold mt-0.5">今日のMVPと勝因をAIがプロの野球アナリスト視点で分析します</p>
                      </div>
                    </div>
                    <Button
                      onClick={analyzePerformance}
                      disabled={isAnalyzing}
                      className="w-full sm:w-auto rounded-full font-black px-8 h-12 bg-emerald-600 hover:bg-emerald-500 text-white transition-all active:scale-95 shrink-0"
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
                  <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-2">
                      <Sparkles className="h-4 w-4 text-emerald-500" />
                      <span className="text-[10px] font-black uppercase text-emerald-500 tracking-widest">AI Analyst Insight</span>
                    </div>
                    <div className="relative">
                      <div className="absolute -left-2 top-0 bottom-0 w-1 bg-emerald-500 rounded-full" />
                      <p className="text-sm font-bold leading-relaxed italic text-slate-300 pl-4 py-1">
                        {aiAnalysis}
                      </p>
                    </div>
                    <div className="flex justify-end mt-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAiAnalysis(null)}
                        className="text-[10px] font-black text-slate-500 hover:text-slate-300"
                      >
                        分析結果を閉じる
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {/* 4. ボックススコア成績データタブ */}
          <section className="space-y-5">
            <SectionHeader title="個人成績・ボックススコア" subtitle="Player Stats & Box Score" />
            <Tabs defaultValue="batting" className="w-full">
              <TabsList className="grid w-full grid-cols-3 h-14 rounded-2xl bg-slate-900 p-1 border border-slate-800">
                <TabsTrigger
                  value="batting"
                  className="rounded-xl font-black text-xs tracking-widest data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-500 text-slate-400"
                >
                  <Target className="h-4 w-4 mr-2" /> BATTING
                </TabsTrigger>
                <TabsTrigger
                  value="pitching"
                  className="rounded-xl font-black text-xs tracking-widest data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-500 text-slate-400"
                >
                  <Zap className="h-4 w-4 mr-2" /> PITCHING
                </TabsTrigger>
                <TabsTrigger
                  value="timeline"
                  className="rounded-xl font-black text-xs tracking-widest data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-500 text-slate-400"
                >
                  <Activity className="h-4 w-4 mr-2" /> TIMELINE
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="batting" className="mt-4 space-y-4">
                <Card className="rounded-[28px] border-slate-800 bg-slate-900/60 overflow-hidden shadow-md">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-slate-900 border-b border-slate-800">
                        <TableRow className="border-slate-850 hover:bg-transparent">
                          <TableHead className="font-black text-[10px] text-slate-400 uppercase tracking-widest pl-6">Player</TableHead>
                          <TableHead className="text-center font-black text-[10px] text-slate-400 uppercase tracking-widest">PA</TableHead>
                          <TableHead className="text-center font-black text-[10px] text-slate-400 uppercase tracking-widest">AB</TableHead>
                          <TableHead className="text-center font-black text-[10px] text-slate-400 uppercase tracking-widest">H</TableHead>
                          <TableHead className="text-center font-black text-[10px] text-slate-400 uppercase tracking-widest">RBI</TableHead>
                          <TableHead className="text-center font-black text-[10px] text-slate-400 uppercase tracking-widest">R</TableHead>
                          <TableHead className="text-center font-black text-[10px] text-slate-400 uppercase tracking-widest">K</TableHead>
                          <TableHead className="text-center font-black text-[10px] text-slate-400 uppercase tracking-widest">BB/HP</TableHead>
                          <TableHead className="text-right font-black text-[10px] text-emerald-500 uppercase tracking-widest pr-6">AVG</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stats.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={9} className="text-center py-16 text-slate-500 font-bold">
                              打撃データがありません
                            </TableCell>
                          </TableRow>
                        ) : (
                          <>
                            {stats.map((player) => (
                              <TableRow key={player.id} className="border-slate-800 hover:bg-slate-800/30 transition-colors group">
                                <TableCell className="font-bold py-4 pl-6">
                                  <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black text-slate-600 w-6">#{player.number}</span>
                                    <span className="truncate group-hover:text-emerald-400 transition-colors text-slate-200">{player.name}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-center tabular-nums text-slate-400 font-bold">{player.plateAppearances}</TableCell>
                                <TableCell className="text-center tabular-nums text-slate-400 font-bold">{player.atBats}</TableCell>
                                <TableCell className="text-center tabular-nums font-black text-slate-200">{player.hits}</TableCell>
                                <TableCell className="text-center tabular-nums font-black text-slate-200">{player.rbi}</TableCell>
                                <TableCell className="text-center tabular-nums text-slate-400 font-bold">{player.runs}</TableCell>
                                <TableCell className="text-center tabular-nums text-slate-500 font-bold">{player.strikeouts}</TableCell>
                                <TableCell className="text-center tabular-nums text-slate-500 font-bold">{player.walks}</TableCell>
                                <TableCell className="text-right tabular-nums font-black text-emerald-500 text-sm pr-6">
                                  {player.avg}
                                </TableCell>
                              </TableRow>
                            ))}
                            {/* BATTING TEAM TOTAL */}
                            <TableRow className="border-t-2 border-slate-800 bg-slate-900/80 hover:bg-slate-900 font-black">
                              <TableCell className="py-4 pl-6 text-slate-200 font-black">
                                <span className="text-xs uppercase tracking-wider text-slate-400">TEAM TOTAL</span>
                              </TableCell>
                              <TableCell className="text-center tabular-nums text-slate-300">{batterTotal.plateAppearances}</TableCell>
                              <TableCell className="text-center tabular-nums text-slate-300">{batterTotal.atBats}</TableCell>
                              <TableCell className="text-center tabular-nums text-slate-200 text-base">{batterTotal.hits}</TableCell>
                              <TableCell className="text-center tabular-nums text-slate-200 text-base">{batterTotal.rbi}</TableCell>
                              <TableCell className="text-center tabular-nums text-slate-300">{batterTotal.runs}</TableCell>
                              <TableCell className="text-center tabular-nums text-slate-400">{batterTotal.strikeouts}</TableCell>
                              <TableCell className="text-center tabular-nums text-slate-400">{batterTotal.walks}</TableCell>
                              <TableCell className="text-right tabular-nums text-emerald-500 text-base pr-6">{teamAvgStr}</TableCell>
                            </TableRow>
                          </>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </Card>

                {/* 📝 打撃詳細（新聞・プロ仕様詳細） */}
                {hasGameDetails && (
                  <Card className="rounded-[28px] border-slate-800 bg-slate-900/40 p-6 space-y-4 text-xs sm:text-sm shadow-sm">
                    <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                      <BookOpen className="h-4 w-4 text-emerald-500" />
                      <span className="text-[10px] font-black uppercase text-emerald-500 tracking-widest">打撃・走塁詳細</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-bold text-slate-300 leading-relaxed">
                      {gameDetails.double.length > 0 && (
                        <div>
                          <span className="text-slate-500 mr-2">【二塁打】</span>
                          <span>{gameDetails.double.join(", ")}</span>
                        </div>
                      )}
                      {gameDetails.triple.length > 0 && (
                        <div>
                          <span className="text-slate-500 mr-2">【三塁打】</span>
                          <span>{gameDetails.triple.join(", ")}</span>
                        </div>
                      )}
                      {gameDetails.homeRun.length > 0 && (
                        <div>
                          <span className="text-emerald-500 mr-2 font-black">【本塁打】</span>
                          <span className="text-white">{gameDetails.homeRun.join(", ")}</span>
                        </div>
                      )}
                      {gameDetails.stolenBase.length > 0 && (
                        <div>
                          <span className="text-slate-500 mr-2">【盗塁】</span>
                          <span>{gameDetails.stolenBase.join(", ")}</span>
                        </div>
                      )}
                      {gameDetails.sacrificeBunt.length > 0 && (
                        <div>
                          <span className="text-slate-500 mr-2">【犠打】</span>
                          <span>{gameDetails.sacrificeBunt.join(", ")}</span>
                        </div>
                      )}
                      {gameDetails.sacrificeFly.length > 0 && (
                        <div>
                          <span className="text-slate-500 mr-2">【犠飛】</span>
                          <span>{gameDetails.sacrificeFly.join(", ")}</span>
                        </div>
                      )}
                      {gameDetails.doublePlay.length > 0 && (
                        <div>
                          <span className="text-rose-500/70 mr-2">【併殺打】</span>
                          <span>{gameDetails.doublePlay.join(", ")}</span>
                        </div>
                      )}
                    </div>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="pitching" className="mt-4">
                <Card className="rounded-[28px] border-slate-800 bg-slate-900/60 overflow-hidden shadow-md">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-slate-900 border-b border-slate-800">
                        <TableRow className="border-slate-850 hover:bg-transparent">
                          <TableHead className="font-black text-[10px] text-slate-400 uppercase tracking-widest pl-6">Pitcher</TableHead>
                          <TableHead className="text-center font-black text-[10px] text-slate-400 uppercase tracking-widest">IP</TableHead>
                          <TableHead className="text-center font-black text-[10px] text-slate-400 uppercase tracking-widest">H</TableHead>
                          <TableHead className="text-center font-black text-[10px] text-slate-400 uppercase tracking-widest">BB/HP</TableHead>
                          <TableHead className="text-center font-black text-[10px] text-slate-400 uppercase tracking-widest">SO</TableHead>
                          <TableHead className="text-center font-black text-[10px] text-slate-400 uppercase tracking-widest">R</TableHead>
                          <TableHead className="text-center font-black text-[10px] text-slate-400 uppercase tracking-widest">ER</TableHead>
                          <TableHead className="text-right font-black text-[10px] text-emerald-500 uppercase tracking-widest pr-6">ERA</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pitcherStats.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center py-16 text-slate-500 font-bold">
                              投手データがありません
                            </TableCell>
                          </TableRow>
                        ) : (
                          <>
                            {pitcherStats.map((player) => (
                              <TableRow key={player.id} className="border-slate-800 hover:bg-slate-800/30 transition-colors group">
                                <TableCell className="font-bold py-4 pl-6">
                                  <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black text-slate-600 w-6">#{player.number}</span>
                                    <span className="truncate group-hover:text-emerald-400 transition-colors text-slate-200">{player.name}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-center tabular-nums font-black text-slate-200">{player.ip}</TableCell>
                                <TableCell className="text-center tabular-nums text-slate-400 font-bold">{player.hits}</TableCell>
                                <TableCell className="text-center tabular-nums text-slate-400 font-bold">{player.walks}</TableCell>
                                <TableCell className="text-center tabular-nums font-black text-slate-200">{player.strikeouts}</TableCell>
                                <TableCell className="text-center tabular-nums text-slate-400 font-bold">{player.runs}</TableCell>
                                <TableCell className="text-center tabular-nums text-rose-500/70 font-bold">{player.earnedRuns}</TableCell>
                                <TableCell className="text-right tabular-nums font-black text-emerald-500 text-sm pr-6">
                                  {player.era}
                                </TableCell>
                              </TableRow>
                            ))}
                            {/* PITCHING TEAM TOTAL */}
                            <TableRow className="border-t-2 border-slate-800 bg-slate-900/80 hover:bg-slate-900 font-black">
                              <TableCell className="py-4 pl-6 text-slate-200 font-black">
                                <span className="text-xs uppercase tracking-wider text-slate-400">TEAM TOTAL</span>
                              </TableCell>
                              <TableCell className="text-center tabular-nums text-slate-200">{teamIpStr}</TableCell>
                              <TableCell className="text-center tabular-nums text-slate-300">{pitcherTotal.hits}</TableCell>
                              <TableCell className="text-center tabular-nums text-slate-300">{pitcherTotal.walks}</TableCell>
                              <TableCell className="text-center tabular-nums text-slate-200 text-base">{pitcherTotal.strikeouts}</TableCell>
                              <TableCell className="text-center tabular-nums text-slate-300">{pitcherTotal.runs}</TableCell>
                              <TableCell className="text-center tabular-nums text-rose-500/80">{pitcherTotal.earnedRuns}</TableCell>
                              <TableCell className="text-right tabular-nums text-emerald-500 text-base pr-6">{teamEraStr}</TableCell>
                            </TableRow>
                          </>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="timeline" className="mt-4">
                <Card className="rounded-[28px] border-slate-800 bg-slate-900/60 overflow-hidden p-6 space-y-6">
                  {atBats.length === 0 ? (
                    <div className="text-center py-16 text-slate-500 font-bold">
                      打席データがありません
                    </div>
                  ) : (
                    <div className="relative border-l border-slate-800 pl-6 ml-4 space-y-8">
                      {Array.from(new Set(atBats.map(a => `${a.inning}回${a.isTop ? '表' : '裏'}`))).map((inningLabel) => {
                        const inningAtBats = atBats.filter(a => `${a.inning}回${a.isTop ? '表' : '裏'}` === inningLabel);
                        return (
                          <div key={inningLabel} className="relative space-y-3">
                            <span className="absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full bg-emerald-600 border-[2.5px] border-slate-950" />
                            
                            <h4 className="font-black text-sm text-emerald-500 uppercase tracking-wider">{inningLabel}</h4>
                            <div className="space-y-2">
                              {inningAtBats.map((ab, idx) => (
                                <div key={ab.id} className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between text-xs sm:text-sm font-bold gap-4 hover:bg-slate-850/80 transition-colors">
                                  <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md">
                                      打席 {idx + 1}
                                    </span>
                                    <span className="text-slate-200">
                                      {ab.batterName ? `${ab.batterName} (#${ab.batterNumber})` : "不明"}
                                    </span>
                                    {ab.pitcherName && (
                                      <span className="text-[11px] text-slate-500">
                                        (投: {ab.pitcherName})
                                      </span>
                                    )}
                                  </div>
                                  <span className="font-black text-emerald-500 px-3 py-1 bg-emerald-950/20 rounded-full border border-emerald-900/30">
                                    {ab.result || "打席結果なし"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              </TabsContent>
            </Tabs>
          </section>

          {/* 💡 フッター：透かしロゴ風 */}
          <div className="pt-12 border-t border-slate-800/80 flex flex-col items-center gap-3">
            <div className="flex items-center gap-3 opacity-30">
              <Trophy className="h-5 w-5 text-slate-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.8em] text-slate-300">i-Score Analytics</span>
            </div>
            <p className="text-[8px] font-bold text-slate-600 uppercase tracking-[0.3em]">Generated by Baseball Science Lab</p>
          </div>

        </div>
      </main>

      {/* 🎥 YouTube 動画 URL 設定 モーダル */}
      {isYoutubeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl p-6 space-y-5 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Video className="h-5 w-5 text-emerald-500" />
                <h3 className="font-black text-base text-slate-200">YouTube 試合動画の追加</h3>
              </div>
              <button 
                onClick={() => setIsYoutubeModalOpen(false)}
                className="text-slate-500 hover:text-slate-300 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                YouTube URL
              </label>
              <input
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={inputYoutubeUrl}
                onChange={(e) => setInputYoutubeUrl(e.target.value)}
                className="w-full px-4 py-3 text-sm rounded-xl border border-slate-800 bg-slate-950 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                disabled={isSavingUrl}
              />
              <p className="text-[10px] text-slate-500 font-bold leading-normal">
                ※ 試合動画の共有リンク、またはブラウザのURLをそのまま入力してください。
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button 
                variant="outline" 
                onClick={() => setIsYoutubeModalOpen(false)} 
                disabled={isSavingUrl} 
                className="flex-1 rounded-xl font-bold border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                キャンセル
              </Button>
              <Button 
                onClick={handleSaveYoutubeUrl} 
                disabled={isSavingUrl} 
                className="flex-1 rounded-xl font-black bg-emerald-600 hover:bg-emerald-500 text-white border-0"
              >
                {isSavingUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存する"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MatchResultPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-slate-950 text-slate-100"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <MatchResultContent />
    </Suspense>
  );
}