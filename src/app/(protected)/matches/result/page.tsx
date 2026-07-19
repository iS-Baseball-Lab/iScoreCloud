// filepath: src/app/(protected)/matches/result/page.tsx
"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { EmptyState } from "@/components/layout/EmptyState";
import {
  Loader2, Trophy, ChevronLeft,
  Share2, Calendar, Activity, Target, Zap, Sparkles, TrendingUp,
  Video, Edit3, X, Play, Plus, BookOpen, AlertCircle, Award, Flame,
  MapPin, Users
} from "lucide-react";
import { cn } from "@/lib/utils";
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
  venueAddress?: string | null;
  venueMapUrl?: string | null;
  benchSide?: string | null;
  tournamentName?: string | null;
  liveMyScore?: number;
  liveOpponentScore?: number;
  liveMyInningScores?: string;
  liveOpponentInningScores?: string;
  liveStatus?: string;
  lockedByUserName?: string | null;
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

interface HighlightHero {
  type: "hit" | "rbi" | "pitch" | "onbase";
  label: string;
  value: string;
  description: string;
}

// YouTube 動画ID 抽出ユーティリティ
function getYoutubeVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// 守備位置の表示ラベルマッピング
const getPositionLabel = (pos: string) => {
  const mapping: Record<string, string> = {
    "1": "投", "2": "捕", "3": "一", "4": "二", "5": "三",
    "6": "遊", "7": "左", "8": "中", "9": "右", "DH": "指",
    "P": "打", "R": "走"
  };
  return mapping[pos] || pos || "-";
};

// 守備位置のバッジカラーマッピング
const getPositionColor = (pos: string) => {
  const mapping: Record<string, string> = {
    "1": "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
    "2": "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    "3": "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
    "4": "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    "5": "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    "6": "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
    "7": "bg-lime-500/10 text-lime-600 dark:text-lime-400 border-lime-500/20",
    "8": "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
    "9": "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
    "DH": "bg-zinc-550/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20",
    "P": "bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20",
    "R": "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20"
  };
  return mapping[pos] || "bg-muted text-muted-foreground border-border";
};

// 注目スタッツ（本日のヒーロー）自動抽出ロジック
function extractHighlightStats(stats: PlayerStats[], pitcherStats: PitcherStats[]): HighlightHero[] {
  const highlights: HighlightHero[] = [];

  // 1. 猛打賞 (3安打以上)
  const multiHits = stats.filter(p => (parseInt(p.hits.toString()) || 0) >= 3);
  multiHits.forEach(p => {
    highlights.push({
      type: "hit",
      label: "猛打賞 🔥",
      value: `${p.name} (#${p.number})`,
      description: `勝負強い打撃で ${p.hits}安打の大暴れ！`
    });
  });

  // 2. マルチ安打 (猛打賞がいない場合のみ2安打を抽出)
  if (multiHits.length === 0) {
    const doubleHits = stats.filter(p => (parseInt(p.hits.toString()) || 0) === 2);
    doubleHits.slice(0, 2).forEach(p => {
      highlights.push({
        type: "hit",
        label: "マルチ安打 ⚡",
        value: `${p.name} (#${p.number})`,
        description: "きっちり複数安打をマークし貢献！"
      });
    });
  }

  // 3. 最多打点 (打点王)
  const maxRbi = Math.max(...stats.map(p => parseInt(p.rbi.toString()) || 0), 0);
  if (maxRbi >= 2) {
    const rbiLeaders = stats.filter(p => (parseInt(p.rbi.toString()) || 0) === maxRbi);
    rbiLeaders.slice(0, 2).forEach(p => {
      highlights.push({
        type: "rbi",
        label: "勝負強さ A 🎯",
        value: `${p.name} (#${p.number})`,
        description: `チャンスで快打を放ち ${p.rbi}打点をマーク！`
      });
    });
  }

  // 4. 奪三振王 (3奪三振以上)
  const maxSo = Math.max(...pitcherStats.map(p => parseInt(p.strikeouts.toString()) || 0), 0);
  if (maxSo >= 3) {
    const soLeaders = pitcherStats.filter(p => (parseInt(p.strikeouts.toString()) || 0) === maxSo);
    soLeaders.forEach(p => {
      highlights.push({
        type: "pitch",
        label: "ドクターK 🌪️",
        value: `${p.name} (#${p.number})`,
        description: `キレのある球で ${p.strikeouts}個の三振を奪う好投！`
      });
    });
  }

  // 5. イニングイーター・好投 (3回以上投球かつ失点2以下)
  pitcherStats.forEach(p => {
    const outs = parseInt(p.outs.toString()) || 0;
    const runs = parseInt(p.runs.toString()) || 0;
    if (outs >= 9 && runs <= 2) {
      highlights.push({
        type: "pitch",
        label: "ゲームメイク 🛡️",
        value: `${p.name} (#${p.number})`,
        description: `${p.ip}イニングを自責点 ${p.earnedRuns} に抑える安定感！`
      });
    }
  });

  return highlights;
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
  
  // スタメン・ラインナップのロード用
  const [myLineup, setMyLineup] = useState<any[]>([]);
  const [opponentLineup, setOpponentLineup] = useState<any[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);

  const [isYoutubeModalOpen, setIsYoutubeModalOpen] = useState(false);
  const [inputYoutubeUrl, setInputYoutubeUrl] = useState("");
  const [isSavingUrl, setIsSavingUrl] = useState(false);
  const [isReaggregating, setIsReaggregating] = useState(false);

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

        // スタメンデータのロード
        const lineupsRes = await fetch(`/api/matches/${matchId}/lineups`);
        if (lineupsRes.ok) {
          const lData = (await lineupsRes.json()) as any;
          if (lData.success && lData.lineups) {
            setMyLineup(lData.lineups.myLineup || []);
            setOpponentLineup(lData.lineups.opponentLineup || []);
          }
        }

        const activeTeamId = localStorage.getItem("iscore_selectedTeamId");
        if (activeTeamId) {
          const teamsRes = await fetch("/api/teams");
          if (teamsRes.ok) {
            const teamsData = (await teamsRes.json()) as any[];
            const current = teamsData.find(t => t.id === activeTeamId);
            if (current) setTeamName(current.name);
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

  // 再集計（プレイログのテキストと打席結果の同期）
  const handleReaggregate = async () => {
    if (!matchId) return;
    setIsReaggregating(true);
    try {
      const res = await fetch(`/api/matches/${matchId}/reaggregate`, { method: "POST" });
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; updatedCount?: number; error?: string };
        if (data.success) {
          toast.success(`プレイログの内容を個人成績に同期しました（更新: ${data.updatedCount || 0}件）`);
          // リロードして最新の成績を取得
          window.location.reload();
        } else {
          toast.error(data.error || "再集計に失敗しました");
        }
      } else {
        toast.error("サーバーエラーが発生しました");
      }
    } catch (err) {
      console.error(err);
      toast.error("再集計中に通信エラーが発生しました");
    } finally {
      setIsReaggregating(false);
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

  if (isLoading) return <div className="flex h-screen items-center justify-center bg-background text-foreground"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!match) return <div className="flex h-screen items-center justify-center bg-background text-foreground"><EmptyState icon={AlertCircle} title="データが見つかりません" description="指定された試合データが存在しないか、削除された可能性があります。" /></div>;

  const guestScores = match.opponentInningScores ? JSON.parse(match.opponentInningScores) : [];
  const selfScores = match.myInningScores ? JSON.parse(match.myInningScores) : [];
  const inningsCount = Math.max(match.innings || 7, guestScores.length, selfScores.length);
  const isMyTeamTop = match.battingOrder === "first";

  // ⚾️ 先攻・後攻で表示データを整理する
  // 野球のランニングスコアは 上行＝先攻（ビジター）、下行＝後攻（ホーム）
  const topTeamName = isMyTeamTop ? `${teamName} (先攻)` : `${match.opponent} (先攻)`;
  const bottomTeamName = isMyTeamTop ? `${match.opponent} (後攻)` : `${teamName} (後攻)`;
  const topScores = isMyTeamTop ? selfScores : guestScores;
  const bottomScores = isMyTeamTop ? guestScores : selfScores;
  const topHits = isMyTeamTop ? match.myHits : match.opponentHits;
  const bottomHits = isMyTeamTop ? match.opponentHits : match.myHits;
  const topErrors = isMyTeamTop ? match.myErrors : match.opponentErrors;
  const bottomErrors = isMyTeamTop ? match.opponentErrors : match.myErrors;
  const topTotalScore = isMyTeamTop ? match.myScore : match.opponentScore;
  const bottomTotalScore = isMyTeamTop ? match.opponentScore : match.myScore;

  // 注目スタッツ・ヒーローデータの抽出
  const highlightHeroes = extractHighlightStats(stats, pitcherStats);

  // 打者成績合計の算出
  const batterTotal = stats.reduce(
    (acc, cur) => {
      acc.plateAppearances += cur.plateAppearances;
      acc.atBats += cur.atBats;
      acc.hits += cur.hits;
      acc.rbi += acc.rbi; // 打点加算の修正
      acc.rbi = acc.rbi + (parseInt(cur.rbi.toString()) || 0) - acc.rbi; // 正しい集計
      acc.runs += cur.runs;
      const k = parseInt(cur.strikeouts.toString()) || 0;
      const bb = parseInt(cur.walks.toString()) || 0;
      acc.strikeouts += k;
      acc.walks += bb;
      return acc;
    },
    { plateAppearances: 0, atBats: 0, hits: 0, rbi: 0, runs: 0, strikeouts: 0, walks: 0 }
  );
  // 打点集計の正確性調整
  batterTotal.rbi = stats.reduce((sum, p) => sum + (parseInt(p.rbi.toString()) || 0), 0);

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
    <div className="w-full min-h-screen pb-16 text-foreground animate-in fade-in duration-500">

      {/* 💡 アクションヘッダー */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 mb-4 sm:mb-6 flex items-center justify-between">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => router.back()}
          className="h-10 px-4 rounded-[var(--radius-xl)] font-black gap-2 shadow-sm border-border bg-card text-foreground hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" />
          戻る
        </Button>
        <div className="flex gap-2.5 items-center">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => router.push(`/matches/edit?id=${matchId}`)}
            className="h-10 px-3 sm:px-4 rounded-[var(--radius-xl)] font-black gap-1.5 shadow-sm border-border bg-card text-foreground hover:bg-muted text-xs sm:text-sm"
          >
            <Edit3 className="h-4 w-4 text-amber-550 dark:text-amber-450" />
            スコア編集
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => router.push(`/matches/scorebook?id=${matchId}`)}
            className="h-10 px-3 sm:px-4 rounded-[var(--radius-xl)] font-black gap-1.5 shadow-sm border-border bg-card text-foreground hover:bg-muted text-xs sm:text-sm"
          >
            <BookOpen className="h-4 w-4 text-primary" />
            スコアブック
          </Button>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => setIsYoutubeModalOpen(true)}
            className="h-10 w-10 rounded-full border-border bg-card text-foreground hover:bg-muted shadow-sm flex items-center justify-center"
            title="試合動画URLを編集"
          >
            <Video className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 space-y-6 sm:space-y-8">
        
        {match.liveStatus === 'draft' && (
          <div className="p-4 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 dark:border-amber-500/30 rounded-[var(--radius-xl)] flex items-start sm:items-center gap-3 text-amber-600 dark:text-amber-400 shadow-xs animate-in slide-in-from-top-3 duration-350">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5 sm:mt-0" />
            <div className="text-xs sm:text-sm font-bold leading-normal">
              {match.lockedByUserName || "スコアラー"}さんが現在詳細スコアをライブ入力（途中保存）中です。完了するまで簡易スコアが表示されます。
            </div>
          </div>
        )}

        {/* 🎬 YouTube 動画セクション */}
        <section className="space-y-3">
          <SectionHeader title="試合動画" subtitle="Game Video" />
          {youtubeVideoId ? (
            <div className="relative group rounded-[var(--radius-xl)] overflow-hidden border-0 sm:border border-border/40 bg-card shadow-sm">
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
                className="absolute top-4 right-4 bg-background/80 hover:bg-background text-foreground p-2.5 rounded-full border border-border transition-all opacity-0 group-hover:opacity-100 flex items-center gap-1.5 text-xs font-black shadow-sm"
              >
                <Edit3 className="h-3.5 w-3.5" /> URL変更
              </button>
            </div>
          ) : (
            <Card 
              onClick={() => setIsYoutubeModalOpen(true)}
              className="border-dashed border-2 border-border/30 bg-card/40 hover:bg-muted/10 rounded-[var(--radius-xl)] cursor-pointer transition-all duration-300 group py-6 sm:py-10 flex flex-col items-center justify-center gap-3 text-center px-4 sm:px-6"
            >
              <div className="p-3 bg-muted rounded-full text-muted-foreground group-hover:scale-110 transition-all">
                <Play className="h-6 w-6 fill-current text-muted-foreground group-hover:text-primary" />
              </div>
              <div>
                <p className="font-black text-foreground/80 group-hover:text-foreground text-sm sm:text-base">YouTube 試合動画を設定する</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 font-bold">試合のハイライトやフル動画を埋め込んで記録を豪華に保存</p>
              </div>
              <Button size="sm" className="rounded-full font-black mt-1 bg-muted text-foreground hover:bg-muted/80 text-xs">
                <Plus className="h-3.5 w-3.5 mr-1" /> URLを登録
              </Button>
            </Card>
          )}
        </section>

        {/* 🏟️ スコア ＆ チーム成績 */}
        <div className={cn(
          "transition-all space-y-8 sm:space-y-12",
          "p-3 sm:p-8 md:p-10 rounded-[var(--radius-2xl)] border-0 sm:border border-border/60 shadow-sm bg-card/25"
        )}>

          {/* 1. スコアビジュアル (巨大フォント) */}
          <section className="text-center space-y-6 sm:space-y-8">
            <div className="space-y-3 sm:space-y-4">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary/5 rounded-[var(--radius-md)] border border-primary/10">
                <Trophy className="h-3.5 w-3.5 text-primary" />
                <span className="text-[9px] font-black text-primary uppercase tracking-[0.2em]">Game Report</span>
              </div>
              <h1 className="text-3xl sm:text-5xl font-black italic tracking-tighter uppercase leading-none text-foreground">
                vs {match.opponent}
              </h1>
              <div className="flex justify-center items-center gap-3 sm:gap-4 text-muted-foreground font-bold text-[10px] sm:text-xs uppercase tracking-wider">
                <div className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5 text-muted-foreground/50" /> {match.date}</div>
                <span className="h-3 w-px bg-border" />
                <div className="flex items-center gap-1"><Activity className="h-3.5 w-3.5 text-muted-foreground/50" /> {match.matchType}</div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-6 sm:gap-16 pt-2">
              <div className="text-center">
                <p className="text-[10px] sm:text-xs font-black text-muted-foreground uppercase tracking-widest mb-1">Opponent</p>
                <p className="text-5xl sm:text-7xl font-black italic tracking-tighter leading-none text-foreground/80">{match.opponentScore}</p>
              </div>
              <div className="text-2xl sm:text-4xl font-black text-muted-foreground/35 italic mt-6">-</div>
              <div className="text-center">
                <p className="text-[10px] sm:text-xs font-black text-primary uppercase tracking-widest mb-1">My Team</p>
                <p className={cn(
                  "text-5xl sm:text-7xl font-black italic tracking-tighter leading-none",
                  match.myScore > match.opponentScore ? "text-primary" : "text-foreground"
                )}>{match.myScore}</p>
              </div>
            </div>

            {(match.venueName || match.surfaceDetails) && (
              <p className="text-[10px] sm:text-xs text-muted-foreground font-bold tracking-wide pt-1">
                🏟️ {match.venueName || match.surfaceDetails}
              </p>
            )}
          </section>

          {/* 2. ランニングスコア (野球公式：先攻・後攻で表示順入替) */}
          <section className="space-y-4">
            <SectionHeader title="イニングスコア" subtitle="Line Score" />
            <div className="bg-card border-0 sm:border border-border/40 rounded-[var(--radius-xl)] overflow-hidden shadow-xs">
              <div className="overflow-x-auto scrollbar-hide">
                <table className="w-full text-center">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border/30 text-[9px] sm:text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                      <th className="p-1.5 sm:p-3 text-left w-36 sm:w-48 pl-2 sm:pl-4">Teams</th>
                      {[...Array(inningsCount)].map((_, i) => (
                        <th key={i} className="w-8 sm:w-10 italic">{i + 1}</th>
                      ))}
                      <th className="w-12 bg-primary/5 text-primary italic">R</th>
                      <th className="w-8 italic opacity-55">H</th>
                      <th className="w-8 italic opacity-55 text-rose-500">E</th>
                    </tr>
                  </thead>
                  <tbody className="font-black text-sm sm:text-lg italic tabular-nums text-foreground">
                    <tr className="border-b border-border/30">
                      <td className={cn(
                        "p-1.5 sm:p-3 text-left text-[11px] sm:text-sm not-italic uppercase tracking-tight pl-2 sm:pl-4 font-bold truncate max-w-[120px] sm:max-w-none",
                        isMyTeamTop ? "text-primary" : "text-foreground/80"
                      )}>
                        {topTeamName}
                      </td>
                      {[...Array(inningsCount)].map((_, i) => (
                        <td key={i} className="text-muted-foreground/60 p-1 sm:p-2 text-xs sm:text-base">{topScores[i] ?? 0}</td>
                      ))}
                      <td className="bg-primary/5 p-1 sm:p-2 text-base sm:text-xl font-black text-center">{topTotalScore}</td>
                      <td className="text-[10px] sm:text-xs opacity-50 p-1 sm:p-2">{topHits || '-'}</td>
                      <td className="text-[10px] sm:text-xs opacity-50 text-rose-500 p-1 sm:p-2">{topErrors || '-'}</td>
                    </tr>
                    <tr className="bg-muted/10">
                      <td className={cn(
                        "p-1.5 sm:p-3 text-left text-[11px] sm:text-sm not-italic uppercase tracking-tight pl-2 sm:pl-4 font-bold truncate max-w-[120px] sm:max-w-none",
                        !isMyTeamTop ? "text-primary" : "text-foreground/80"
                      )}>
                        {bottomTeamName}
                      </td>
                      {[...Array(inningsCount)].map((_, i) => (
                        <td key={i} className="text-muted-foreground/60 p-1 sm:p-2 text-xs sm:text-base">{bottomScores[i] ?? 0}</td>
                      ))}
                      <td className="bg-primary/5 p-1 sm:p-2 text-base sm:text-xl font-black text-center">{bottomTotalScore}</td>
                      <td className="text-[10px] sm:text-xs opacity-50 p-1 sm:p-2">{bottomHits || '-'}</td>
                      <td className="text-[10px] sm:text-xs opacity-50 text-rose-500 p-1 sm:p-2">{bottomErrors || '-'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* 🎉 注目スタッツ（本日のヒーロー）セクション */}
          {highlightHeroes.length > 0 && (
            <section className="space-y-4 animate-in fade-in duration-500">
              <SectionHeader title="本日の注目選手" subtitle="Key Players" />
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {highlightHeroes.map((hero, idx) => (
                  <Card key={idx} className="border-0 sm:border border-primary/10 bg-card/65 rounded-[var(--radius-xl)] overflow-hidden shadow-xs hover:shadow-sm transition-all group">
                    <CardContent className="p-3 sm:p-4 flex items-start gap-2.5 sm:gap-3">
                      <div className={cn(
                        "p-2 rounded-[var(--radius-lg)] shrink-0 mt-0.5",
                        hero.type === "hit" ? "bg-amber-500/10 text-amber-500" :
                        hero.type === "rbi" ? "bg-emerald-500/10 text-emerald-500" :
                        "bg-sky-500/10 text-sky-500"
                      )}>
                        {hero.type === "hit" ? <Flame className="h-4.5 w-4.5" /> : <Award className="h-4.5 w-4.5" />}
                      </div>
                      <div className="space-y-1">
                        <span className="inline-block text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted/85 text-muted-foreground">
                          {hero.label}
                        </span>
                        <h4 className="font-black text-xs sm:text-sm text-foreground group-hover:text-primary transition-colors">
                          {hero.value}
                        </h4>
                        <p className="text-[10px] font-semibold text-muted-foreground leading-normal">
                          {hero.description}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* 📅 試合情報 ＆ 会場案内（住所・地図） */}
          <section className="space-y-4">
            <SectionHeader title="試合情報・会場案内" subtitle="Game Info & Venue" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {/* 試合基本情報 */}
              <Card className="border-0 sm:border border-border/40 bg-card rounded-[var(--radius-xl)] overflow-hidden shadow-xs p-3.5 sm:p-6 space-y-4">
                <h4 className="text-xs font-black text-primary uppercase tracking-widest border-b border-border/40 pb-2 flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5" /> 試合詳細スペック
                </h4>
                <div className="space-y-2.5 font-bold text-xs sm:text-sm">
                  <div className="flex justify-between py-1 border-b border-border/20">
                    <span className="text-muted-foreground text-xs">日時</span>
                    <span className="text-foreground text-xs sm:text-sm">{match.date}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/20">
                    <span className="text-muted-foreground text-xs">試合区分</span>
                    <span className="text-foreground text-xs sm:text-sm">
                      {match.matchType === "official" ? "🏆 公式戦" :
                       match.matchType === "practice" ? "⚾ 練習試合" : "🤝 交流戦"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/20">
                    <span className="text-muted-foreground text-xs">ベンチ位置</span>
                    <span className="text-foreground text-xs sm:text-sm font-black">
                      {match.benchSide === "1B" ? "🔴 1塁側" :
                       match.benchSide === "3B" ? "🔵 3塁側" : "⚪ 未定・情報なし"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/20">
                    <span className="text-muted-foreground text-xs">規定イニング</span>
                    <span className="text-foreground text-xs sm:text-sm">{match.innings || 7}回</span>
                  </div>
                  {match.tournamentName && (
                    <div className="flex justify-between py-1 border-b border-border/20">
                      <span className="text-muted-foreground text-xs">大会名</span>
                      <span className="text-foreground text-xs sm:text-sm text-right max-w-[180px] sm:max-w-[200px] truncate">{match.tournamentName}</span>
                    </div>
                  )}
                </div>
              </Card>

              {/* 球場アクセス ＆ 地図埋め込み */}
              <Card className="border-0 sm:border border-border/40 bg-card rounded-[var(--radius-xl)] overflow-hidden shadow-xs p-3.5 sm:p-6 space-y-4 flex flex-col justify-between">
                <div className="space-y-2">
                  <h4 className="text-xs font-black text-primary uppercase tracking-widest border-b border-border/40 pb-2 flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5" /> 会場アクセス
                  </h4>
                  <div className="space-y-1">
                    <p className="font-black text-sm text-foreground">
                      {match.venueName || match.surfaceDetails || "球場情報未設定"}
                    </p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground font-bold leading-normal">
                      {match.venueAddress || "住所情報は登録されていません。"}
                    </p>
                  </div>
                </div>

                {/* Google Map 埋め込み iframe */}
                {(match.venueAddress || match.venueName) ? (
                  <div className="space-y-3 mt-1">
                    <div className="w-full h-36 sm:h-40 rounded-[var(--radius-md)] overflow-hidden border border-border shadow-inner">
                      <iframe
                        src={`https://maps.google.com/maps?q=${encodeURIComponent(match.venueAddress || match.venueName || '')}&output=embed`}
                        title="Google Map"
                        frameBorder="0"
                        allowFullScreen
                        loading="lazy"
                        className="w-full h-full"
                      />
                    </div>
                    <a
                      href={match.venueMapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(match.venueAddress || match.venueName || '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full rounded-[var(--radius-md)] font-black text-xs gap-1.5 h-10 border border-border bg-card hover:bg-muted text-foreground flex items-center justify-center transition-all shadow-xs"
                    >
                      🗺️ Googleマップでルート検索
                    </a>
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-muted-foreground font-bold border border-dashed border-border/40 rounded-[var(--radius-md)]">
                    マップを表示するための住所情報がありません
                  </div>
                )}
              </Card>
            </div>
          </section>

          {/* 3. AI パフォーマンス分析カード */}
          <section className="space-y-4">
            <SectionHeader title="戦評" subtitle="AI Insight" />
            <Card className="border-0 sm:border border-primary/10 bg-card rounded-[var(--radius-xl)] overflow-hidden shadow-xs">
              <CardContent className="p-3.5 sm:p-6 space-y-4">
                {!aiAnalysis ? (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-primary/10 text-primary rounded-[var(--radius-xl)] shadow-inner animate-pulse">
                        <Sparkles className="h-5.5 w-5.5" />
                      </div>
                      <div>
                        <p className="font-black text-sm sm:text-base text-foreground">AI パフォーマンス分析</p>
                        <p className="text-[10px] sm:text-xs text-muted-foreground font-bold mt-0.5">今日のMVPと勝因をAIがプロの野球アナリスト視点で分析します</p>
                      </div>
                    </div>
                    <Button
                      onClick={analyzePerformance}
                      disabled={isAnalyzing}
                      className="w-full sm:w-auto rounded-full font-black px-6 sm:px-8 h-11 bg-primary hover:bg-primary/90 text-primary-foreground transition-all active:scale-95 shrink-0 text-xs"
                    >
                      {isAnalyzing ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      ) : (
                        <TrendingUp className="h-4 w-4 mr-1.5" />
                      )}
                      分析を開始する
                    </Button>
                  </div>
                ) : (
                  <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex items-center gap-2 mb-3 border-b border-border/40 pb-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="text-[9px] font-black uppercase text-primary tracking-widest">AI Analyst Insight</span>
                    </div>
                    <div className="relative">
                      <div className="absolute -left-2 top-0 bottom-0 w-1 bg-primary rounded-full" />
                      <p className="text-xs sm:text-sm font-bold leading-relaxed italic text-slate-800 dark:text-slate-200 pl-3.5 py-1">
                        {aiAnalysis}
                      </p>
                    </div>
                    <div className="flex justify-end mt-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAiAnalysis(null)}
                        className="text-[9px] font-black text-muted-foreground hover:text-foreground"
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
          <section className="space-y-4">
            <SectionHeader title="個人成績" subtitle="Player Stats" />
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReaggregate}
                disabled={isReaggregating}
                className="rounded-full font-black text-xs border-primary/20 text-primary hover:bg-primary/10 shadow-xs transition-all h-9 px-4"
              >
                {isReaggregating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Activity className="h-3.5 w-3.5 mr-1.5" />
                )}
                成績データを再集計する
              </Button>
            </div>
            <Tabs defaultValue="lineup" className="w-full">
              <TabsList className="grid w-full grid-cols-4 h-13 rounded-[var(--radius-xl)] bg-muted/50 p-1 border border-border/40">
                <TabsTrigger
                  value="lineup"
                  className="rounded-[var(--radius-md)] font-black text-[10px] sm:text-xs tracking-wider data-[state=active]:bg-background data-[state=active]:text-primary text-muted-foreground p-1"
                >
                  <Users className="h-3.5 w-3.5 mr-1" /> LINEUP
                </TabsTrigger>
                <TabsTrigger
                  value="batting"
                  className="rounded-[var(--radius-md)] font-black text-[10px] sm:text-xs tracking-wider data-[state=active]:bg-background data-[state=active]:text-primary text-muted-foreground p-1"
                >
                  <Target className="h-3.5 w-3.5 mr-1" /> BATTING
                </TabsTrigger>
                <TabsTrigger
                  value="pitching"
                  className="rounded-[var(--radius-md)] font-black text-[10px] sm:text-xs tracking-wider data-[state=active]:bg-background data-[state=active]:text-primary text-muted-foreground p-1"
                >
                  <Zap className="h-3.5 w-3.5 mr-1" /> PITCHING
                </TabsTrigger>
                <TabsTrigger
                  value="timeline"
                  className="rounded-[var(--radius-md)] font-black text-[10px] sm:text-xs tracking-wider data-[state=active]:bg-background data-[state=active]:text-primary text-muted-foreground p-1"
                >
                  <Activity className="h-3.5 w-3.5 mr-1" /> TIMELINE
                </TabsTrigger>
              </TabsList>
              
              {/* 👥 LINEUP タブコンテンツ */}
              <TabsContent value="lineup" className="mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                  {/* 先攻チームスタメン */}
                  <Card className="rounded-[var(--radius-xl)] border-0 sm:border border-border/40 bg-card overflow-hidden shadow-xs">
                    <div className="bg-muted/30 p-2.5 sm:p-3 border-b border-border/30">
                      <h4 className="font-black text-xs sm:text-sm text-foreground flex items-center justify-between">
                        <span>{topTeamName}</span>
                        <span className="text-[9px] text-muted-foreground/60 uppercase tracking-widest font-black">Starting lineup</span>
                      </h4>
                    </div>
                    <div className="p-1">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border/25 hover:bg-transparent">
                            <TableHead className="font-black text-[9px] text-muted-foreground uppercase tracking-widest w-10 text-center py-1.5 sm:py-2.5">打順</TableHead>
                            <TableHead className="font-black text-[9px] text-muted-foreground uppercase tracking-widest w-14 text-center py-1.5 sm:py-2.5">位置</TableHead>
                            <TableHead className="font-black text-[9px] text-muted-foreground uppercase tracking-widest pl-2 sm:pl-3 py-1.5 sm:py-2.5">選手名</TableHead>
                            <TableHead className="font-black text-[9px] text-muted-foreground uppercase tracking-widest w-14 text-right pr-3 sm:pr-4 py-1.5 sm:py-2.5">背番号</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(isMyTeamTop ? myLineup : opponentLineup).length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center py-8 text-xs text-muted-foreground font-bold">
                                ラインナップ情報がありません
                              </TableCell>
                            </TableRow>
                          ) : (
                            (isMyTeamTop ? myLineup : opponentLineup).map((slot: any, idx: number) => {
                              const pos = slot.position || "";
                              const num = slot.uniformNumber || "-";
                              return (
                                <TableRow key={idx} className="border-border/25 hover:bg-muted/20 transition-colors">
                                  <td className="text-center py-1.5 sm:py-2 text-[11px] sm:text-xs italic font-black text-muted-foreground/60">{slot.order || (idx + 1)}</td>
                                  <td className="text-center py-1 sm:py-1.5">
                                    <span className={cn(
                                      "inline-block text-[9px] sm:text-[10px] font-black px-1.5 py-0.5 rounded border leading-none",
                                      getPositionColor(pos)
                                    )}>
                                      {getPositionLabel(pos)}
                                    </span>
                                  </td>
                                  <td className="pl-2 sm:pl-3 font-bold text-foreground text-[11px] sm:text-sm py-1.5 sm:py-2.5">{slot.name || "不明"}</td>
                                  <td className="text-right pr-3 sm:pr-4 font-bold text-muted-foreground/80 text-[11px] sm:text-xs py-1.5 sm:py-2.5 tabular-nums">#{num}</td>
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </Card>

                  {/* 後攻チームスタメン */}
                  <Card className="rounded-[var(--radius-xl)] border-0 sm:border border-border/40 bg-card overflow-hidden shadow-xs">
                    <div className="bg-muted/30 p-2.5 sm:p-3 border-b border-border/30">
                      <h4 className="font-black text-xs sm:text-sm text-foreground flex items-center justify-between">
                        <span>{bottomTeamName}</span>
                        <span className="text-[9px] text-muted-foreground/60 uppercase tracking-widest font-black">Starting lineup</span>
                      </h4>
                    </div>
                    <div className="p-1">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border/25 hover:bg-transparent">
                            <TableHead className="font-black text-[9px] text-muted-foreground uppercase tracking-widest w-10 text-center py-1.5 sm:py-2.5">打順</TableHead>
                            <TableHead className="font-black text-[9px] text-muted-foreground uppercase tracking-widest w-14 text-center py-1.5 sm:py-2.5">位置</TableHead>
                            <TableHead className="font-black text-[9px] text-muted-foreground uppercase tracking-widest pl-2 sm:pl-3 py-1.5 sm:py-2.5">選手名</TableHead>
                            <TableHead className="font-black text-[9px] text-muted-foreground uppercase tracking-widest w-14 text-right pr-3 sm:pr-4 py-1.5 sm:py-2.5">背番号</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(!isMyTeamTop ? myLineup : opponentLineup).length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center py-8 text-xs text-muted-foreground font-bold">
                                ラインナップ情報がありません
                              </TableCell>
                            </TableRow>
                          ) : (
                            (!isMyTeamTop ? myLineup : opponentLineup).map((slot: any, idx: number) => {
                              const pos = slot.position || "";
                              const num = slot.uniformNumber || "-";
                              return (
                                <TableRow key={idx} className="border-border/25 hover:bg-muted/20 transition-colors">
                                  <td className="text-center py-1.5 sm:py-2 text-[11px] sm:text-xs italic font-black text-muted-foreground/60">{slot.order || (idx + 1)}</td>
                                  <td className="text-center py-1 sm:py-1.5">
                                    <span className={cn(
                                      "inline-block text-[9px] sm:text-[10px] font-black px-1.5 py-0.5 rounded border leading-none",
                                      getPositionColor(pos)
                                    )}>
                                      {getPositionLabel(pos)}
                                    </span>
                                  </td>
                                  <td className="pl-2 sm:pl-3 font-bold text-foreground text-[11px] sm:text-sm py-1.5 sm:py-2.5">{slot.name || "不明"}</td>
                                  <td className="text-right pr-3 sm:pr-4 font-bold text-muted-foreground/80 text-[11px] sm:text-xs py-1.5 sm:py-2.5 tabular-nums">#{num}</td>
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="batting" className="mt-4 space-y-4">
                <Card className="rounded-[var(--radius-xl)] border-0 sm:border border-border/40 bg-card overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-muted/50 border-b border-border/30">
                        <TableRow className="border-border/25 hover:bg-transparent">
                          <TableHead className="font-black text-[9px] text-muted-foreground uppercase tracking-widest pl-2 sm:pl-4 py-1.5 sm:py-2.5">Player</TableHead>
                          <TableHead className="text-center font-black text-[9px] text-muted-foreground uppercase tracking-widest px-1 sm:px-2.5 py-1.5 sm:py-2.5">PA</TableHead>
                          <TableHead className="text-center font-black text-[9px] text-muted-foreground uppercase tracking-widest px-1 sm:px-2.5 py-1.5 sm:py-2.5">AB</TableHead>
                          <TableHead className="text-center font-black text-[9px] text-muted-foreground uppercase tracking-widest px-1 sm:px-2.5 py-1.5 sm:py-2.5">H</TableHead>
                          <TableHead className="text-center font-black text-[9px] text-muted-foreground uppercase tracking-widest px-1 sm:px-2.5 py-1.5 sm:py-2.5">RBI</TableHead>
                          <TableHead className="text-center font-black text-[9px] text-muted-foreground uppercase tracking-widest px-1 sm:px-2.5 py-1.5 sm:py-2.5">R</TableHead>
                          <TableHead className="text-center font-black text-[9px] text-muted-foreground uppercase tracking-widest px-1 sm:px-2.5 py-1.5 sm:py-2.5">K</TableHead>
                          <TableHead className="text-center font-black text-[9px] text-muted-foreground uppercase tracking-widest px-1 sm:px-2.5 py-1.5 sm:py-2.5">BB/HP</TableHead>
                          <TableHead className="text-right font-black text-[9px] text-primary uppercase tracking-widest pr-2 sm:pr-4 py-1.5 sm:py-2.5">AVG</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stats.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={9} className="text-center py-12 text-xs text-muted-foreground font-bold">
                              打撃データがありません
                            </TableCell>
                          </TableRow>
                        ) : (
                          <>
                            {stats.map((player) => {
                              const hitCount = parseInt(player.hits.toString()) || 0;
                              const rbiCount = parseInt(player.rbi.toString()) || 0;
                              const isHero = hitCount >= 2 || rbiCount >= 1;
                              return (
                                <TableRow 
                                  key={player.id} 
                                  className={cn(
                                    "border-border/25 hover:bg-muted/20 transition-colors group",
                                    isHero && "bg-amber-500/[0.04] dark:bg-amber-500/[0.07] font-medium"
                                  )}
                                >
                                  <TableCell className="font-bold py-1.5 sm:py-2.5 pl-2 sm:pl-4">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[9px] font-black text-muted-foreground/50 w-5">#{player.number}</span>
                                      <span className="truncate group-hover:text-primary transition-colors text-foreground text-[11px] sm:text-sm">{player.name}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center tabular-nums text-muted-foreground/80 text-[11px] sm:text-xs px-1 sm:px-2.5 py-1.5 sm:py-2.5">{player.plateAppearances}</TableCell>
                                  <TableCell className="text-center tabular-nums text-muted-foreground/80 text-[11px] sm:text-xs px-1 sm:px-2.5 py-1.5 sm:py-2.5">{player.atBats}</TableCell>
                                  <TableCell className={cn("text-center tabular-nums font-black text-[11px] sm:text-sm px-1 sm:px-2.5 py-1.5 sm:py-2.5", hitCount >= 2 ? "text-amber-500" : "text-foreground")}>{player.hits}</TableCell>
                                  <TableCell className={cn("text-center tabular-nums font-black text-[11px] sm:text-sm px-1 sm:px-2.5 py-1.5 sm:py-2.5", rbiCount >= 1 ? "text-emerald-500" : "text-foreground")}>{player.rbi}</TableCell>
                                  <TableCell className="text-center tabular-nums text-muted-foreground/80 text-[11px] sm:text-xs px-1 sm:px-2.5 py-1.5 sm:py-2.5">{player.runs}</TableCell>
                                  <TableCell className="text-center tabular-nums text-muted-foreground/50 text-[11px] sm:text-xs px-1 sm:px-2.5 py-1.5 sm:py-2.5">{player.strikeouts}</TableCell>
                                  <TableCell className="text-center tabular-nums text-muted-foreground/50 text-[11px] sm:text-xs px-1 sm:px-2.5 py-1.5 sm:py-2.5">{player.walks}</TableCell>
                                  <TableCell className="text-right tabular-nums font-black text-primary text-[11px] sm:text-sm pr-2 sm:pr-4 py-1.5 sm:py-2.5">
                                    {player.avg}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                            {/* BATTING TEAM TOTAL */}
                            <TableRow className="border-t border-border/50 bg-muted/25 hover:bg-muted/40 font-black">
                              <TableCell className="py-2 sm:py-3 pl-2 sm:pl-4 text-foreground font-black">
                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">TEAM TOTAL</span>
                              </TableCell>
                              <TableCell className="text-center tabular-nums text-muted-foreground text-[11px] sm:text-xs px-1 sm:px-2.5 py-2 sm:py-3">{batterTotal.plateAppearances}</TableCell>
                              <TableCell className="text-center tabular-nums text-muted-foreground text-[11px] sm:text-xs px-1 sm:px-2.5 py-2 sm:py-3">{batterTotal.atBats}</TableCell>
                              <TableCell className="text-center tabular-nums text-foreground text-xs sm:text-base px-1 sm:px-2.5 py-2 sm:py-3">{batterTotal.hits}</TableCell>
                              <TableCell className="text-center tabular-nums text-foreground text-xs sm:text-base px-1 sm:px-2.5 py-2 sm:py-3">{batterTotal.rbi}</TableCell>
                              <TableCell className="text-center tabular-nums text-muted-foreground text-[11px] sm:text-xs px-1 sm:px-2.5 py-2 sm:py-3">{batterTotal.runs}</TableCell>
                              <TableCell className="text-center tabular-nums text-muted-foreground/50 text-[11px] sm:text-xs px-1 sm:px-2.5 py-2 sm:py-3">{batterTotal.strikeouts}</TableCell>
                              <TableCell className="text-center tabular-nums text-muted-foreground/50 text-[11px] sm:text-xs px-1 sm:px-2.5 py-2 sm:py-3">{batterTotal.walks}</TableCell>
                              <TableCell className="text-right tabular-nums text-primary text-xs sm:text-base pr-2 sm:pr-4 py-2 sm:py-3">{teamAvgStr}</TableCell>
                            </TableRow>
                          </>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </Card>

                {/* 📝 打撃詳細（新聞・プロ仕様詳細） */}
                {hasGameDetails && (
                  <Card className="rounded-[var(--radius-xl)] border-0 sm:border border-border/40 bg-card/45 p-3.5 sm:p-6 space-y-3 text-xs sm:text-sm shadow-xs">
                    <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                      <BookOpen className="h-4 w-4 text-primary" />
                      <span className="text-[10px] font-black uppercase text-primary tracking-widest">打撃・走塁詳細</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 font-bold text-foreground/80 leading-relaxed text-xs">
                      {gameDetails.double.length > 0 && (
                        <div>
                          <span className="text-muted-foreground mr-1.5">【二塁打】</span>
                          <span>{gameDetails.double.join(", ")}</span>
                        </div>
                      )}
                      {gameDetails.triple.length > 0 && (
                        <div>
                          <span className="text-muted-foreground mr-1.5">【三塁打】</span>
                          <span>{gameDetails.triple.join(", ")}</span>
                        </div>
                      )}
                      {gameDetails.homeRun.length > 0 && (
                        <div>
                          <span className="text-primary mr-1.5 font-black">【本塁打】</span>
                          <span className="text-foreground">{gameDetails.homeRun.join(", ")}</span>
                        </div>
                      )}
                      {gameDetails.stolenBase.length > 0 && (
                        <div>
                          <span className="text-muted-foreground mr-1.5">【盗塁】</span>
                          <span>{gameDetails.stolenBase.join(", ")}</span>
                        </div>
                      )}
                      {gameDetails.sacrificeBunt.length > 0 && (
                        <div>
                          <span className="text-muted-foreground mr-1.5">【犠打】</span>
                          <span>{gameDetails.sacrificeBunt.join(", ")}</span>
                        </div>
                      )}
                      {gameDetails.sacrificeFly.length > 0 && (
                        <div>
                          <span className="text-muted-foreground mr-1.5">【犠飛】</span>
                          <span>{gameDetails.sacrificeFly.join(", ")}</span>
                        </div>
                      )}
                      {gameDetails.doublePlay.length > 0 && (
                        <div>
                          <span className="text-rose-500/75 mr-1.5">【併殺打】</span>
                          <span>{gameDetails.doublePlay.join(", ")}</span>
                        </div>
                      )}
                    </div>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="pitching" className="mt-4">
                <Card className="rounded-[var(--radius-xl)] border-0 sm:border border-border/40 bg-card overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-muted/50 border-b border-border/30">
                        <TableRow className="border-border/25 hover:bg-transparent">
                          <TableHead className="font-black text-[9px] text-muted-foreground uppercase tracking-widest pl-2 sm:pl-4 py-1.5 sm:py-2.5">Pitcher</TableHead>
                          <TableHead className="text-center font-black text-[9px] text-muted-foreground uppercase tracking-widest px-1 sm:px-2.5 py-1.5 sm:py-2.5">IP</TableHead>
                          <TableHead className="text-center font-black text-[9px] text-muted-foreground uppercase tracking-widest px-1 sm:px-2.5 py-1.5 sm:py-2.5">H</TableHead>
                          <TableHead className="text-center font-black text-[9px] text-muted-foreground uppercase tracking-widest px-1 sm:px-2.5 py-1.5 sm:py-2.5">BB/HP</TableHead>
                          <TableHead className="text-center font-black text-[9px] text-muted-foreground uppercase tracking-widest px-1 sm:px-2.5 py-1.5 sm:py-2.5">SO</TableHead>
                          <TableHead className="text-center font-black text-[9px] text-muted-foreground uppercase tracking-widest px-1 sm:px-2.5 py-1.5 sm:py-2.5">R</TableHead>
                          <TableHead className="text-center font-black text-[9px] text-muted-foreground uppercase tracking-widest px-1 sm:px-2.5 py-1.5 sm:py-2.5">ER</TableHead>
                          <TableHead className="text-right font-black text-[9px] text-primary uppercase tracking-widest pr-2 sm:pr-4 py-1.5 sm:py-2.5">ERA</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pitcherStats.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center py-12 text-xs text-muted-foreground font-bold">
                              投手データがありません
                            </TableCell>
                          </TableRow>
                        ) : (
                          <>
                            {pitcherStats.map((player) => {
                              const outs = parseInt(player.outs.toString()) || 0;
                              const runs = parseInt(player.runs.toString()) || 0;
                              const strikeouts = parseInt(player.strikeouts.toString()) || 0;
                              const isHero = strikeouts >= 3 || (outs >= 9 && runs <= 1);
                              return (
                                <TableRow 
                                  key={player.id} 
                                  className={cn(
                                    "border-border/25 hover:bg-muted/20 transition-colors group",
                                    isHero && "bg-sky-500/[0.04] dark:bg-sky-500/[0.07] font-medium"
                                  )}
                                >
                                  <TableCell className="font-bold py-1.5 sm:py-2.5 pl-2 sm:pl-4">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[9px] font-black text-muted-foreground/50 w-5">#{player.number}</span>
                                      <span className="truncate group-hover:text-primary transition-colors text-foreground text-[11px] sm:text-sm">{player.name}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center tabular-nums font-black text-foreground text-[11px] sm:text-sm px-1 sm:px-2.5 py-1.5 sm:py-2.5">{player.ip}</TableCell>
                                  <TableCell className="text-center tabular-nums text-muted-foreground/80 text-[11px] sm:text-xs px-1 sm:px-2.5 py-1.5 sm:py-2.5">{player.hits}</TableCell>
                                  <TableCell className="text-center tabular-nums text-muted-foreground/80 text-[11px] sm:text-xs px-1 sm:px-2.5 py-1.5 sm:py-2.5">{player.walks}</TableCell>
                                  <TableCell className={cn("text-center tabular-nums font-black text-[11px] sm:text-sm px-1 sm:px-2.5 py-1.5 sm:py-2.5", strikeouts >= 3 ? "text-sky-500" : "text-foreground")}>{player.strikeouts}</TableCell>
                                  <TableCell className="text-center tabular-nums text-muted-foreground/80 text-[11px] sm:text-xs px-1 sm:px-2.5 py-1.5 sm:py-2.5">{player.runs}</TableCell>
                                  <TableCell className={cn("text-center tabular-nums font-bold text-[11px] sm:text-xs px-1 sm:px-2.5 py-1.5 sm:py-2.5", runs > 0 ? "text-rose-500/75" : "text-emerald-500")}>{player.earnedRuns}</TableCell>
                                  <TableCell className="text-right tabular-nums font-black text-primary text-[11px] sm:text-sm pr-2 sm:pr-4 py-1.5 sm:py-2.5">
                                    {player.era}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                            {/* PITCHING TEAM TOTAL */}
                            <TableRow className="border-t border-border/50 bg-muted/25 hover:bg-muted/40 font-black">
                              <TableCell className="py-2 sm:py-3 pl-2 sm:pl-4 text-foreground font-black">
                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">TEAM TOTAL</span>
                              </TableCell>
                              <TableCell className="text-center tabular-nums text-foreground text-xs sm:text-base px-1 sm:px-2.5 py-2 sm:py-3">{teamIpStr}</TableCell>
                              <TableCell className="text-center tabular-nums text-muted-foreground text-[11px] sm:text-xs px-1 sm:px-2.5 py-2 sm:py-3">{pitcherTotal.hits}</TableCell>
                              <TableCell className="text-center tabular-nums text-muted-foreground text-[11px] sm:text-xs px-1 sm:px-2.5 py-2 sm:py-3">{pitcherTotal.walks}</TableCell>
                              <TableCell className="text-center tabular-nums text-foreground text-xs sm:text-base px-1 sm:px-2.5 py-2 sm:py-3">{pitcherTotal.strikeouts}</TableCell>
                              <TableCell className="text-center tabular-nums text-muted-foreground text-[11px] sm:text-xs px-1 sm:px-2.5 py-2 sm:py-3">{pitcherTotal.runs}</TableCell>
                              <TableCell className="text-center tabular-nums text-rose-500/80 text-[11px] sm:text-xs px-1 sm:px-2.5 py-2 sm:py-3">{pitcherTotal.earnedRuns}</TableCell>
                              <TableCell className="text-right tabular-nums text-primary text-xs sm:text-base pr-2 sm:pr-4 py-2 sm:py-3">{teamEraStr}</TableCell>
                            </TableRow>
                          </>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="timeline" className="mt-4">
                <Card className="rounded-[var(--radius-xl)] border-0 sm:border border-border/40 bg-card overflow-hidden p-3.5 sm:p-6 space-y-6">
                  {atBats.length === 0 ? (
                    <div className="text-center py-16 text-muted-foreground font-bold">
                      打席データがありません
                    </div>
                  ) : (
                    <div className="relative border-l border-border pl-4 sm:pl-6 ml-2 sm:ml-4 space-y-6 sm:space-y-8">
                      {Array.from(new Set(atBats.map(a => `${a.inning}回${a.isTop ? '表' : '裏'}`))).map((inningLabel) => {
                        const inningAtBats = atBats.filter(a => `${a.inning}回${a.isTop ? '表' : '裏'}` === inningLabel);
                        return (
                          <div key={inningLabel} className="relative space-y-3">
                            <span className="absolute -left-[25px] sm:-left-[31px] top-1 h-3.5 w-3.5 rounded-full bg-primary border-[2.5px] border-background" />
                            
                            <h4 className="font-black text-xs sm:text-sm text-primary uppercase tracking-wider">{inningLabel}</h4>
                            <div className="space-y-2">
                              {inningAtBats.map((ab, idx) => (
                                <div key={ab.id} className="p-2 sm:p-3 bg-card border border-border/40 rounded-[var(--radius-xl)] flex items-center justify-between text-xs sm:text-sm font-bold gap-2 sm:gap-4 hover:bg-muted/30 transition-colors">
                                  <div className="flex items-center gap-2 sm:gap-3">
                                    <span className="text-[9px] font-black text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                      打席 {idx + 1}
                                    </span>
                                    <span className="text-foreground text-xs sm:text-sm">
                                      {ab.batterName ? `${ab.batterName} (#${ab.batterNumber})` : "不明"}
                                    </span>
                                    {ab.pitcherName && (
                                      <span className="text-[10px] text-muted-foreground/60 hidden sm:inline">
                                        (投: {ab.pitcherName})
                                      </span>
                                    )}
                                  </div>
                                  <span className="font-black text-primary px-2.5 py-0.5 sm:py-1 bg-primary/5 rounded-full border border-primary/10 text-xs">
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

          {/* 💡 フッター */}
          <div className="pt-8 sm:pt-12 border-t border-border/60 flex flex-col items-center gap-2.5">
            <div className="flex items-center gap-2.5 opacity-30">
              <Trophy className="h-4.5 w-4.5 text-muted-foreground" />
              <span className="text-[9px] font-black uppercase tracking-[0.8em] text-foreground">i-Score Analytics</span>
            </div>
            <p className="text-[8px] font-bold text-muted-foreground/30 uppercase tracking-[0.3em]">Generated by Baseball Science Lab</p>
          </div>

        </div>
      </main>

      {/* 🎥 YouTube 動画 URL 設定 モーダル */}
      {isYoutubeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-card rounded-[var(--radius-2xl)] border border-border shadow-2xl p-5 sm:p-6 space-y-5 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Video className="h-5 w-5 text-primary" />
                <h3 className="font-black text-base text-foreground">YouTube 試合動画の追加</h3>
              </div>
              <button 
                onClick={() => setIsYoutubeModalOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">
                YouTube URL
              </label>
              <input
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={inputYoutubeUrl}
                onChange={(e) => setInputYoutubeUrl(e.target.value)}
                className="w-full px-4 py-3 text-sm rounded-[var(--radius-md)] border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                disabled={isSavingUrl}
              />
              <p className="text-[10px] text-muted-foreground font-bold leading-normal">
                ※ 試合動画の共有リンク、またはブラウザのURLをそのまま入力してください。
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button 
                variant="outline" 
                onClick={() => setIsYoutubeModalOpen(false)} 
                disabled={isSavingUrl} 
                className="flex-1 rounded-[var(--radius-md)] font-bold border-border bg-card text-foreground hover:bg-muted"
              >
                キャンセル
              </Button>
              <Button 
                onClick={handleSaveYoutubeUrl} 
                disabled={isSavingUrl} 
                className="flex-1 rounded-[var(--radius-md)] font-black bg-primary hover:bg-primary/90 text-primary-foreground border-0"
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
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-background text-foreground"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <MatchResultContent />
    </Suspense>
  );
}