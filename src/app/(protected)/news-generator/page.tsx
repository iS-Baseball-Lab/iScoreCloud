"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { 
  ArrowLeft, Copy, Check, Send, Sparkles, RotateCcw, 
  Calendar, Users, Trophy, ChevronRight, Volume2, Gamepad2, FileText, Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/layout/SectionHeader";

// ⚾️ ポジションマッピング
const getPositionLabel = (posId: string) => {
  const mapping: Record<string, string> = {
    "1": "投",
    "2": "捕",
    "3": "一",
    "4": "二",
    "5": "三",
    "6": "遊",
    "7": "左",
    "8": "中",
    "9": "右",
    "DH": "指"
  };
  return mapping[posId] || "打";
};

export default function NewsGeneratorPage() {
  const router = useRouter();

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 状態管理
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string>("自チーム");
  const [matches, setMatches] = useState<any[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>("");
  
  const [matchDetail, setMatchDetail] = useState<any>(null);
  const [lineups, setLineups] = useState<any>(null);
  const [playLogs, setPlayLogs] = useState<any[]>([]);
  
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // 速報パラメータ
  const [newsType, setNewsType] = useState<"lineup" | "inning" | "end">("lineup");
  const [editedText, setEditedText] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // 手動追記フィールド
  const [lineupComment, setLineupComment] = useState("");
  const [selectedInningIndex, setSelectedInningIndex] = useState<number>(0);
  const [inningComment, setInningComment] = useState("");
  const [heroPlayer, setHeroPlayer] = useState("");
  const [summaryText, setSummaryText] = useState("");

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // チーム情報と試合一覧のロード
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  useEffect(() => {
    const storedId = localStorage.getItem("iscore_selectedTeamId");
    const storedName = localStorage.getItem("iscore_selectedTeamName");
    if (storedId) setTeamId(storedId);
    if (storedName) setTeamName(storedName);
  }, []);

  useEffect(() => {
    if (!teamId) return;
    const fetchMatches = async () => {
      try {
        setLoadingMatches(true);
        const res = await fetch(`/api/matches?teamId=${teamId}`, { cache: "no-store" });
        if (!res.ok) throw new Error("試合一覧の取得に失敗しました");
        const data = await res.json() as any[];
        setMatches(data || []);
      } catch (e) {
        console.error(e);
        toast.error("試合情報の取得に失敗しました");
      } finally {
        setLoadingMatches(false);
      }
    };
    fetchMatches();
  }, [teamId]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 選択した試合の詳細・スタメン・ログの取得
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  useEffect(() => {
    if (!selectedMatchId) {
      setMatchDetail(null);
      setLineups(null);
      setPlayLogs([]);
      return;
    }

    const fetchDetails = async () => {
      try {
        setLoadingDetails(true);
        const [detailRes, lineupsRes, logsRes] = await Promise.all([
          fetch(`/api/matches/${selectedMatchId}`, { cache: "no-store" }),
          fetch(`/api/matches/${selectedMatchId}/lineups`, { cache: "no-store" }),
          fetch(`/api/matches/${selectedMatchId}/logs`, { cache: "no-store" })
        ]);

        if (!detailRes.ok || !lineupsRes.ok || !logsRes.ok) {
          throw new Error("詳細データの取得に失敗しました");
        }

        const detailData = await detailRes.json() as any;
        const lineupsData = await lineupsRes.json() as any;
        const logsData = await logsRes.json() as any;

        if (detailData.success && detailData.match) {
          const match = detailData.match;
          const formattedMatch = {
            ...match,
            myInningScores: typeof match.myInningScores === "string" ? JSON.parse(match.myInningScores) : (match.myInningScores || []),
            opponentInningScores: typeof match.opponentInningScores === "string" ? JSON.parse(match.opponentInningScores) : (match.opponentInningScores || [])
          };
          setMatchDetail(formattedMatch);

          // 試合終了（finished）であれば「試合終了速報」を初期選択にする
          if (formattedMatch.status === "finished") {
            setNewsType("end");
          } else {
            // それ以外はスタメン速報を初期選択
            setNewsType("lineup");
          }
        }

        if (lineupsData.success && lineupsData.lineups) {
          setLineups(lineupsData.lineups);
        }

        if (logsData.success && logsData.logs) {
          setPlayLogs(logsData.logs || []);
        }
      } catch (e) {
        console.error(e);
        toast.error("試合詳細データの読み込みに失敗しました");
      } finally {
        setLoadingDetails(false);
      }
    };

    fetchDetails();
  }, [selectedMatchId]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 試合のソート・フィルタリング（予定試合は除外、進行中優先）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const sortedMatches = useMemo(() => {
    return [...matches]
      .filter(m => m.status !== "scheduled")
      .sort((a, b) => {
        // status === "live" を最優先
        if (a.status === "live" && b.status !== "live") return -1;
        if (a.status !== "live" && b.status === "live") return 1;
        // 次に日付降順
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
  }, [matches]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // イニング選択肢のリストアップ
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const inningOptions = useMemo(() => {
    if (!matchDetail) return [];
    const myScores = matchDetail.myInningScores || [];
    const oppScores = matchDetail.opponentInningScores || [];
    const battingOrder = matchDetail.battingOrder; // 'first' or 'second'
    
    const options: { label: string; inning: number; isBottom: boolean }[] = [];
    const maxInning = Math.max(myScores.length, oppScores.length, 1);
    
    for (let i = 0; i < maxInning; i++) {
      // 表
      if (battingOrder === "first") {
        if (i < myScores.length) {
          options.push({ label: `${i + 1}回表`, inning: i + 1, isBottom: false });
        }
      } else {
        if (i < oppScores.length) {
          options.push({ label: `${i + 1}回表`, inning: i + 1, isBottom: false });
        }
      }
      
      // 裏
      if (battingOrder === "first") {
        if (i < oppScores.length) {
          options.push({ label: `${i + 1}回裏`, inning: i + 1, isBottom: true });
        }
      } else {
        if (i < myScores.length) {
          options.push({ label: `${i + 1}回裏`, inning: i + 1, isBottom: true });
        }
      }
    }
    return options;
  }, [matchDetail]);

  // イニング選択のデフォルトを最新イニングにセット
  useEffect(() => {
    if (inningOptions.length > 0) {
      setSelectedInningIndex(inningOptions.length - 1);
    }
  }, [inningOptions]);

  const selectedInningOption = inningOptions[selectedInningIndex];

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // スコアボードテキストの動的生成
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const generateScoreTableText = (
    inningLimit: number,
    isBottomLimit: boolean,
    match: any,
    name: string
  ) => {
    const isFirst = match.battingOrder === "first";
    const firstTeamName = isFirst ? name : match.opponent;
    const secondTeamName = isFirst ? match.opponent : name;
    
    const firstScores = isFirst ? match.myInningScores : match.opponentInningScores;
    const secondScores = isFirst ? match.opponentInningScores : match.myInningScores;
    
    // 表示用の文字幅調整
    const maxLen = Math.max(firstTeamName.length, secondTeamName.length);
    const padName = (str: string) => str.padEnd(maxLen + 2, ' ');
    
    let firstTeamLine = `${padName(firstTeamName)} |`;
    let secondTeamLine = `${padName(secondTeamName)} |`;
    
    let firstTotal = 0;
    let secondTotal = 0;
    
    for (let i = 1; i <= inningLimit; i++) {
      // 先攻のi回得点
      const score1 = firstScores[i - 1];
      if (score1 !== undefined) {
        firstTeamLine += ` ${score1}`;
        firstTotal += score1;
      } else {
        firstTeamLine += " -";
      }
      
      // 後攻のi回得点
      if (i === inningLimit && !isBottomLimit) {
        secondTeamLine += " -";
      } else {
        const score2 = secondScores[i - 1];
        if (score2 !== undefined) {
          secondTeamLine += ` ${score2}`;
          secondTotal += score2;
        } else {
          secondTeamLine += " -";
        }
      }
    }
    
    firstTeamLine += ` | 計 ${firstTotal}`;
    secondTeamLine += ` | 計 ${secondTotal}`;
    
    return `${firstTeamLine}\n${secondTeamLine}`;
  };

  const generateFinalScoreTableText = (match: any, name: string) => {
    const isFirst = match.battingOrder === "first";
    const firstTeamName = isFirst ? name : match.opponent;
    const secondTeamName = isFirst ? match.opponent : name;
    
    const firstScores = isFirst ? match.myInningScores : match.opponentInningScores;
    const secondScores = isFirst ? match.opponentInningScores : match.myInningScores;
    
    const maxLen = Math.max(firstTeamName.length, secondTeamName.length);
    const padName = (str: string) => str.padEnd(maxLen + 2, ' ');
    
    const inningCount = Math.max(firstScores.length, secondScores.length, 1);
    
    let firstTeamLine = `${padName(firstTeamName)} |`;
    let secondTeamLine = `${padName(secondTeamName)} |`;
    
    let firstTotal = 0;
    let secondTotal = 0;
    
    if (isFirst) {
      firstTotal = match.myScore;
      secondTotal = match.opponentScore;
    } else {
      firstTotal = match.opponentScore;
      secondTotal = match.myScore;
    }

    for (let i = 1; i <= inningCount; i++) {
      const score1 = firstScores[i - 1];
      firstTeamLine += score1 !== undefined ? ` ${score1}` : " -";
      
      const score2 = secondScores[i - 1];
      secondTeamLine += score2 !== undefined ? ` ${score2}` : " -";
    }
    
    firstTeamLine += ` | 計 ${firstTotal}`;
    secondTeamLine += ` | 計 ${secondTotal}`;
    
    return `${firstTeamLine}\n${secondTeamLine}`;
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // スタメン・プレイログ整形
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const generateLineupText = (lineup: any[]) => {
    if (!lineup || lineup.length === 0) return "（スタメン未登録）";
    
    return lineup.map((player, index) => {
      const order = index + 1;
      const posLabel = getPositionLabel(player.position);
      const uniform = player.uniformNumber ? ` #${player.uniformNumber}` : "";
      const name = player.name || "（未登録）";
      return `${order}.(${posLabel}) ${name}${uniform}`;
    }).join("\n");
  };

  const getResultLabel = (match: any) => {
    const my = match.myScore;
    const opp = match.opponentScore;
    if (my > opp) return "勝利 🎉";
    if (my < opp) return "惜敗";
    return "引き分け";
  };

  const getKeyEvents = (logs: any[]) => {
    const keyKeywords = ["得点", "先制", "追加", "タイムリー", "適時打", "ホームラン", "本塁打", "ヒット", "安打", "三塁打", "二塁打", "スクイズ", "押し出し", "エラー", "失策"];
    return logs
      .filter(log => keyKeywords.some(keyword => log.description.includes(keyword)))
      .map(log => `・${log.inning}回${log.isTop ? "表" : "裏"}：${log.description}`);
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 速報テキストの自動生成
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const generatedText = useMemo(() => {
    if (!matchDetail) return "";

    const dateStr = new Date(matchDetail.date).toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short"
    });

    if (newsType === "lineup") {
      const isFirst = matchDetail.battingOrder === "first";
      const myAttackLabel = isFirst ? "先攻" : "後攻";
      const opponentAttackLabel = isFirst ? "後攻" : "先攻";
      
      const myLineupText = generateLineupText(lineups?.myLineup);
      const oppLineupText = generateLineupText(lineups?.opponentLineup);
      
      return `【スタメン発表】
本日行われる vs ${matchDetail.opponent} のスターティングラインナップです！
試合開始に向けて気合十分！熱いご声援をよろしくお願いいたします！🔥

📅 試合日: ${dateStr}

◆ ${teamName}（${myAttackLabel}）
${myLineupText}

◆ ${matchDetail.opponent}（${opponentAttackLabel}）
${oppLineupText}
${lineupComment ? `\n💬 コメント:\n${lineupComment}\n` : ""}
#草野球 #スタメン発表 #iScoreCloud`;
    }

    if (newsType === "inning") {
      if (!selectedInningOption) return "表示するイニングがありません。試合のプレイデータを入力してください。";
      const { inning, isBottom } = selectedInningOption;
      const scoreTable = generateScoreTableText(inning, isBottom, matchDetail, teamName);
      
      // イニング制限に基づいてログをフィルタリング
      const sortedLogs = [...playLogs]
        .filter(log => {
          if (log.inning < inning) return true;
          if (log.inning === inning) {
            if (!isBottom) return log.isTop;
            return true;
          }
          return false;
        })
        .sort((a, b) => a.timestamp - b.timestamp);

      const keyEvents = getKeyEvents(sortedLogs);
      const keyEventsText = keyEvents.length > 0 
        ? keyEvents.join("\n") 
        : "・緊迫した展開が続いています！";

      return `【経過速報】vs ${matchDetail.opponent}
${inning}回${isBottom ? "裏" : "表"}終了時点の途中経過をお知らせします！

📅 試合日: ${dateStr}

◆ スコア
${scoreTable}

◆ 試合経過
${keyEventsText}
${inningComment ? `\n💬 戦況解説:\n${inningComment}\n` : ""}
#草野球 #試合速報 #途中経過 #iScoreCloud`;
    }

    if (newsType === "end") {
      const scoreTable = generateFinalScoreTableText(matchDetail, teamName);
      const resultLabel = getResultLabel(matchDetail);

      return `【試合終了】vs ${matchDetail.opponent}
本日の試合は ${matchDetail.myScore} - ${matchDetail.opponentScore} で【${resultLabel}】となりました！

📅 試合日: ${dateStr}

◆ スコアボード
${scoreTable}
${heroPlayer ? `\n🏅 本日のヒーロー:\n${heroPlayer}\n` : ""}${summaryText ? `\n📝 戦評・総括:\n${summaryText}\n` : ""}
本日も選手への温かいご声援をいただき、本当にありがとうございました！

#草野球 #試合終了 #ゲームセット #iScoreCloud`;
    }

    return "";
  }, [matchDetail, lineups, playLogs, newsType, lineupComment, selectedInningOption, inningComment, heroPlayer, summaryText, teamName]);

  // generatedTextが変わったとき、editedTextに反映
  useEffect(() => {
    setEditedText(generatedText);
  }, [generatedText]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // コピー・共有アクション
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(editedText);
      setCopied(true);
      toast.success("クリップボードにコピーしました！");
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      toast.error("コピーに失敗しました");
    }
  };

  const handleLineShare = () => {
    const url = `https://line.me/R/msg/text/?${encodeURIComponent(editedText)}`;
    window.open(url, "_blank");
  };

  const handleResetText = () => {
    setEditedText(generatedText);
    toast.success("自動生成されたテキストを復元しました");
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 pt-8 pb-32 animate-in fade-in duration-400 bg-zinc-950 text-foreground relative overflow-hidden">
      {/* 🔮 背景の美しいすりガラスグラデーションオーブ */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto space-y-6 relative z-10">
        
        {/* ヘッダーエリア */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              onClick={() => router.back()}
              variant="outline"
              size="icon"
              className="rounded-full bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/20 active:scale-95"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <SectionHeader title="試合速報ジェネレーター" subtitle="NEWS GENERATOR" showPulse={false} />
          </div>
          
          {/* 自チーム表示 */}
          <div className="px-4 py-1.5 rounded-full bg-primary/15 border border-primary/20 backdrop-blur-md self-start sm:self-center">
            <span className="text-xs font-black text-primary tracking-wider">
              🏟️ ACTIVE TEAM: {teamName}
            </span>
          </div>
        </div>

        {/* 1. 試合の選択エリア (最上部) */}
        <div className="bg-zinc-900/60 dark:bg-black/40 backdrop-blur-md border border-white/5 p-4 rounded-[var(--radius-xl)] shadow-lg">
          <label className="block text-xs font-black text-primary tracking-widest uppercase mb-2">
            試合の選択（予定試合を除く・進行中を優先）
          </label>
          {loadingMatches ? (
            <div className="h-12 bg-white/5 animate-pulse rounded-xl" />
          ) : sortedMatches.length === 0 ? (
            <div className="text-center py-4 text-sm font-bold text-muted-foreground border border-dashed border-white/10 rounded-xl">
              速報可能な試合（進行中・終了）が見つかりません。
            </div>
          ) : (
            <div className="relative">
              <select
                value={selectedMatchId}
                onChange={(e) => setSelectedMatchId(e.target.value)}
                className="w-full h-12 bg-black/40 border border-white/10 hover:border-white/20 focus:border-primary/50 text-white font-bold text-sm px-4 rounded-xl outline-none transition-all cursor-pointer appearance-none"
              >
                <option value="">-- 速報を作成する試合を選択してください --</option>
                {sortedMatches.map((m) => {
                  const dateStr = new Date(m.date).toLocaleDateString("ja-JP", {
                    month: "2-digit",
                    day: "2-digit"
                  });
                  const isLive = m.status === "live";
                  const statusLabel = isLive ? "🔴 [進行中]" : "🟢 [終了]";
                  
                  return (
                    <option key={m.id} value={m.id}>
                      {statusLabel} {dateStr} vs {m.opponent} ({m.myScore} - {m.opponentScore})
                    </option>
                  );
                })}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                <ChevronRight className="h-4 w-4 rotate-90" />
              </div>
            </div>
          )}
        </div>

        {/* 試合未選択時のプレースホルダー */}
        {!selectedMatchId && (
          <div className="bg-zinc-900/40 border border-white/5 backdrop-blur-md rounded-[var(--radius-xl)] p-12 text-center flex flex-col items-center justify-center space-y-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Activity className="h-8 w-8 text-primary animate-pulse" />
            </div>
            <h3 className="text-base font-black text-white">速報を作成する試合を選択してください</h3>
            <p className="text-xs font-bold text-zinc-400 max-w-sm">
              上部の試合セレクターから、現在進行中の試合、または過去に終了した試合を選択すると、スタメン・イニング・終了速報の作成が行えます。
            </p>
          </div>
        )}

        {/* 試合選択後の編集エリア */}
        {selectedMatchId && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* 👈 左カラム: 速報設定 & 手動補足 */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* 試合概要カード */}
              {loadingDetails ? (
                <div className="bg-zinc-900/60 p-6 rounded-[var(--radius-xl)] animate-pulse space-y-4">
                  <div className="h-6 bg-white/5 w-1/2 rounded" />
                  <div className="h-4 bg-white/5 w-3/4 rounded" />
                </div>
              ) : matchDetail ? (
                <div className="bg-zinc-900/60 backdrop-blur-md border border-white/5 p-5 rounded-[var(--radius-xl)] relative overflow-hidden">
                  {matchDetail.status === "live" && (
                    <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 text-red-500 text-[10px] font-black tracking-wider px-2 py-0.5 rounded-full">
                      <span className="h-1.5 w-1.5 bg-red-500 rounded-full animate-ping" />
                      LIVE 進行中
                    </div>
                  )}
                  <h3 className="text-xs font-black text-primary tracking-widest mb-1.5">SELECTED MATCH</h3>
                  <div className="text-base font-black text-white flex items-center gap-2">
                    {teamName} <span className="text-zinc-500">vs</span> {matchDetail.opponent}
                  </div>
                  <div className="mt-2 text-xs font-bold text-zinc-400 flex flex-wrap gap-x-4 gap-y-1">
                    <span>📅 {new Date(matchDetail.date).toLocaleDateString("ja-JP")}</span>
                    <span>🏟️ {matchDetail.surfaceDetails || "グラウンド未設定"}</span>
                    <span>⚾️ {matchDetail.matchType === "official" ? "公式戦" : "練習試合"}</span>
                  </div>
                </div>
              ) : null}

              {/* 速報タイプのタブ切り替え */}
              <div className="bg-zinc-900/60 backdrop-blur-md border border-white/5 p-2 rounded-[var(--radius-xl)] flex gap-1">
                {[
                  { id: "lineup", label: "スタメン速報", icon: Users },
                  { id: "inning", label: "イニング速報", icon: Activity },
                  { id: "end", label: "試合終了速報", icon: Trophy }
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = newsType === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setNewsType(tab.id as any)}
                      className={cn(
                        "flex-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 py-3 sm:py-2.5 rounded-xl font-black text-[11px] sm:text-xs transition-all duration-300",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-100"
                          : "text-zinc-400 hover:text-white hover:bg-white/5 active:scale-95"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* 手動補足・パラメータ入力エリア */}
              <div className="bg-zinc-900/60 backdrop-blur-md border border-white/5 p-5 rounded-[var(--radius-xl)] space-y-4">
                <div className="flex items-center gap-2 border-b border-white/5 pb-2.5 mb-2">
                  <Sparkles className="h-4 w-4 text-primary animate-pulse" />
                  <h4 className="text-xs font-black text-white tracking-wider">速報テキストのカスタマイズ</h4>
                </div>

                {/* --- A. スタメン速報用の設定 --- */}
                {newsType === "lineup" && (
                  <div className="space-y-3 animate-in fade-in duration-300">
                    <div>
                      <label className="block text-[10px] font-black text-zinc-400 tracking-wider uppercase mb-1.5">
                        監督コメント・意気込みなどの一言 (自由に入力)
                      </label>
                      <textarea
                        value={lineupComment}
                        onChange={(e) => setLineupComment(e.target.value)}
                        placeholder="例：新戦力の山田を1番に抜擢！打線のつながりで勝利を目指します。"
                        className="w-full min-h-[80px] bg-black/40 border border-white/10 focus:border-primary/50 text-white text-xs p-3 rounded-xl outline-none resize-none transition-all placeholder:text-zinc-600"
                      />
                    </div>
                  </div>
                )}

                {/* --- B. イニング速報用の設定 --- */}
                {newsType === "inning" && (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <div>
                      <label className="block text-[10px] font-black text-zinc-400 tracking-wider uppercase mb-1.5">
                        速報に含めるイニングの選択
                      </label>
                      {inningOptions.length === 0 ? (
                        <div className="text-xs font-bold text-zinc-500 py-2">
                          進行中のイニングデータが存在しません。イニングスコアを入力してください。
                        </div>
                      ) : (
                        <div className="relative">
                          <select
                            value={selectedInningIndex}
                            onChange={(e) => setSelectedInningIndex(Number(e.target.value))}
                            className="w-full h-11 bg-black/40 border border-white/10 hover:border-white/20 focus:border-primary/50 text-white font-bold text-xs px-4 rounded-xl outline-none transition-all cursor-pointer appearance-none"
                          >
                            {inningOptions.map((opt, idx) => (
                              <option key={idx} value={idx}>
                                {opt.label}まで表示する
                              </option>
                            ))}
                          </select>
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                            <ChevronRight className="h-4 w-4 rotate-90" />
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-zinc-400 tracking-wider uppercase mb-1.5">
                        戦況解説・追加コメント (自由に入力)
                      </label>
                      <textarea
                        value={inningComment}
                        onChange={(e) => setInningComment(e.target.value)}
                        placeholder="例：山田が先制の2ランを放ちリードする展開。先発佐藤も要所を締め好投中。"
                        className="w-full min-h-[80px] bg-black/40 border border-white/10 focus:border-primary/50 text-white text-xs p-3 rounded-xl outline-none resize-none transition-all placeholder:text-zinc-600"
                      />
                    </div>
                  </div>
                )}

                {/* --- C. 試合終了速報用の設定 --- */}
                {newsType === "end" && (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <div>
                      <label className="block text-[10px] font-black text-zinc-400 tracking-wider uppercase mb-1.5">
                        本日のヒーロー・活躍した選手
                      </label>
                      <input
                        type="text"
                        value={heroPlayer}
                        onChange={(e) => setHeroPlayer(e.target.value)}
                        placeholder="例：山田選手 (先制の2ランを含む3打点の大活躍！)"
                        className="w-full h-11 bg-black/40 border border-white/10 focus:border-primary/50 text-white text-xs px-4 rounded-xl outline-none transition-all placeholder:text-zinc-600"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-zinc-400 tracking-wider uppercase mb-1.5">
                        戦評・総括
                      </label>
                      <textarea
                        value={summaryText}
                        onChange={(e) => setSummaryText(e.target.value)}
                        placeholder="例：初回、3番山田の右越え2ランで先制。中盤に追いつかれるも、5回に相手の失策の間に勝ち越しに成功。投げては先発佐藤が7回2失点の力投で見事完投勝利を飾った。"
                        className="w-full min-h-[120px] bg-black/40 border border-white/10 focus:border-primary/50 text-white text-xs p-3 rounded-xl outline-none resize-none transition-all placeholder:text-zinc-600"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 👉 右カラム: テキストエディタ ＆ アクション */}
            <div className="lg:col-span-7 space-y-6">
              
              <div className="bg-zinc-900/60 backdrop-blur-md border border-white/5 p-5 rounded-[var(--radius-xl)] space-y-4 relative">
                
                {/* ツールバー */}
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <h4 className="text-xs font-black text-white tracking-wider">速報テキスト（編集・手直し可能）</h4>
                  </div>
                  
                  <button
                    onClick={handleResetText}
                    title="自動生成されたテキストにリセットする"
                    className="flex items-center gap-1 text-[10px] font-black text-zinc-400 hover:text-white transition-colors px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 active:scale-95"
                  >
                    <RotateCcw className="h-3 w-3" />
                    自動生成から復元
                  </button>
                </div>

                {/* エディターエリア */}
                {loadingDetails ? (
                  <div className="w-full h-[360px] bg-black/20 animate-pulse rounded-2xl" />
                ) : (
                  <textarea
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    className="w-full min-h-[380px] bg-black/40 border border-white/5 focus:border-primary/30 text-white text-sm p-4 rounded-2xl outline-none font-mono resize-y leading-relaxed transition-all focus:ring-1 focus:ring-primary/20"
                    placeholder="試合を選択すると、ここに自動生成された速報テキストが表示され、自由に手直し・編集ができます。"
                  />
                )}

                {/* アクションボタン群 */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Button
                    onClick={handleCopy}
                    className="flex-1 rounded-full font-black text-xs h-11 gap-2 active:scale-95 transition-transform"
                    variant="outline"
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                    {copied ? "コピーしました！" : "クリップボードにコピー"}
                  </Button>

                  <Button
                    onClick={handleLineShare}
                    className="flex-1 rounded-full font-black text-xs h-11 gap-2 bg-[#06C755] hover:bg-[#05b34c] text-white active:scale-95 transition-transform shadow-lg shadow-emerald-950/20"
                  >
                    <Send className="h-4 w-4" />
                    LINEで共有・転送
                  </Button>
                </div>

                {/* フットノート */}
                <p className="text-[10px] font-bold text-zinc-500 text-center">
                  ※ LINE共有ボタンを押すと、LINEアプリが開き、編集したテキストをフレンドやグループへ直接送信できます。
                </p>
              </div>

            </div>

          </div>
        )}

      </div>
    </div>
  );
}
