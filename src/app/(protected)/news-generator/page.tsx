// filepath: src/app/(protected)/news-generator/page.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { ChevronRight, Activity } from "lucide-react";
import { toast } from "sonner";
import { SectionHeader } from "@/components/layout/SectionHeader";

// 新しいカスタムフックと分割したコンポーネントをインポート
import { useNewsText } from "@/components/features/news-generator/useNewsText";
import { NewsParameterPanel } from "@/components/features/news-generator/NewsParameterPanel";
import { NewsPreviewCard } from "@/components/features/news-generator/NewsPreviewCard";

export default function NewsGeneratorPage() {
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

  // 手動追記・カスタマイズフィールド
  const [matchName, setMatchName] = useState("OP戦");
  const [venueName, setVenueName] = useState("");
  const [opponentName, setOpponentName] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reporterName, setReporterName] = useState("");

  const [lineupComment, setLineupComment] = useState("");
  const [selectedInningIndex, setSelectedInningIndex] = useState<number>(0);
  const [inningComment, setInningComment] = useState("");
  const [heroPlayer, setHeroPlayer] = useState("");
  const [summaryText, setSummaryText] = useState("");
  const [isParamExpanded, setIsParamExpanded] = useState<boolean>(true);

  // 🏟️ スコアボード表示用チーム名の手動調整用
  const [firstTeamDisp, setFirstTeamDisp] = useState("");
  const [secondTeamDisp, setSecondTeamDisp] = useState("");

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // チーム情報と試合一覧のロード
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  useEffect(() => {
    const storedId = localStorage.getItem("iscore_selectedTeamId");
    const storedName = localStorage.getItem("iscore_selectedTeamName");
    if (storedId) setTeamId(storedId);
    if (storedName) setTeamName(storedName);

    const storedReporter = localStorage.getItem("iscore_reporterName");
    if (storedReporter) setReporterName(storedReporter);
  }, []);

  const handleReporterChange = (name: string) => {
    setReporterName(name);
    localStorage.setItem("iscore_reporterName", name);
  };

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

  // チーム名のスコアボード用初期整形ヘルパー (例: 逗子S -> 逗子 -> 逗　子)
  const getInitialDispName = (nameStr: string) => {
    let formatted = nameStr.trim();
    // 末尾の特定の余分な文字をトリムする (S, シニア, クラブ, A, B など、野球チーム名の典型的な末尾)
    formatted = formatted.replace(/(S|シニア|クラブ|ジュニア|A|B|C)$/i, "").trim();
    if (formatted.length === 2) {
      formatted = `${formatted[0]}　${formatted[1]}`;
    }
    return formatted;
  };

  // 試合ロード時に初期パラメータをセット
  useEffect(() => {
    if (matchDetail) {
      setOpponentName(matchDetail.opponent || "");
      setVenueName(matchDetail.surfaceDetails || matchDetail.venueName || "");
      
      const type = matchDetail.matchType === "official" ? "公式戦" : "OP戦";
      const tournament = matchDetail.tournamentName ? `（${matchDetail.tournamentName}）` : "";
      setMatchName(`${type}${tournament}`);
      
      setStartTime(matchDetail.startTime || "");
      setEndTime(matchDetail.endTime || "");

      // スコアボード用表示名の初期設定
      const isFirst = matchDetail.battingOrder === "first";
      const fName = isFirst ? teamName : (matchDetail.opponent || "");
      const sName = isFirst ? (matchDetail.opponent || "") : teamName;
      setFirstTeamDisp(getInitialDispName(fName));
      setSecondTeamDisp(getInitialDispName(sName));
    }
  }, [matchDetail, teamName]);

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

  const selectedInningOption = useMemo(() => {
    return inningOptions[selectedInningIndex] || null;
  }, [inningOptions, selectedInningIndex]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 速報テキストの自動生成 (カスタムフックの呼び出し)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const { generatedText } = useNewsText({
    matchDetail,
    lineups,
    playLogs,
    newsType,
    teamName,
    matchName,
    venueName,
    opponentName,
    startTime,
    endTime,
    reporterName,
    lineupComment,
    inningComment,
    selectedInningOption,
    heroPlayer,
    summaryText,
    firstTeamDisp,
    secondTeamDisp
  });

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
    <div className="min-h-screen p-4 sm:p-6 pt-8 pb-32 animate-in fade-in duration-400 bg-transparent text-zinc-900 dark:text-zinc-100 relative overflow-hidden">
      {/* 🔮 背景のオーブ */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/5 dark:bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto space-y-6 relative z-10">
        
        {/* ヘッダー */}
        <div className="flex flex-col items-center justify-center text-center gap-3">
          <SectionHeader title="試合速報ジェネレーター" subtitle="NEWS GENERATOR" showPulse={false} />
        </div>

        {/* 1. 試合の選択エリア (最上部) */}
        <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-white/5 p-5 rounded-2xl shadow-md dark:shadow-2xl transition-all">
          <label className="block text-[11px] font-black text-primary dark:text-primary tracking-widest uppercase mb-2.5">
            🏟️ 試合の選択（予定試合を除く・進行中を優先）
          </label>
          {loadingMatches ? (
            <div className="h-12 bg-zinc-200/50 dark:bg-white/5 animate-pulse rounded-xl" />
          ) : sortedMatches.length === 0 ? (
            <div className="text-center py-8 text-sm font-bold text-zinc-400 dark:text-muted-foreground border border-dashed border-zinc-200 dark:border-white/10 rounded-xl bg-zinc-50/50 dark:bg-transparent">
              速報可能な試合（進行中・終了）が見つかりません。
            </div>
          ) : (
            <div className="relative">
              <select
                value={selectedMatchId}
                onChange={(e) => setSelectedMatchId(e.target.value)}
                className="w-full h-12 bg-white dark:bg-black/40 border border-zinc-200 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/20 focus:border-primary dark:focus:border-primary/50 focus:ring-2 focus:ring-primary/10 text-zinc-900 dark:text-white font-bold text-sm px-4 rounded-xl outline-none transition-all cursor-pointer appearance-none shadow-sm"
              >
                <option value="" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">-- 速報を作成する試合を選択してください --</option>
                {sortedMatches.map((m) => {
                  const dateStr = new Date(m.date).toLocaleDateString("ja-JP", {
                    month: "2-digit",
                    day: "2-digit"
                  });
                  const isLive = m.status === "live";
                  const statusLabel = isLive ? "🔴 [進行中]" : "🟢 [終了]";
                  
                  return (
                    <option key={m.id} value={m.id} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">
                      {statusLabel} {dateStr} vs {m.opponent} ({m.myScore} - {m.opponentScore})
                    </option>
                  );
                })}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400 dark:text-zinc-500">
                <ChevronRight className="h-4 w-4 rotate-90" />
              </div>
            </div>
          )}
        </div>

        {/* 試合未選択時のプレースホルダー */}
        {!selectedMatchId && (
          <div className="bg-white border border-zinc-200 dark:bg-zinc-900/40 dark:border-white/5 backdrop-blur-md rounded-[var(--radius-xl)] p-12 text-center flex flex-col items-center justify-center space-y-4 shadow-md dark:shadow-none">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Activity className="h-8 w-8 text-primary animate-pulse" />
            </div>
            <h3 className="text-base font-black text-zinc-900 dark:text-white">速報を作成する試合を選択してください</h3>
            <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 max-w-sm">
              上部の試合セレクターから、現在進行中の試合、または過去に終了した試合を選択すると、スタメン・イニング・終了速報の作成が行えます。
            </p>
          </div>
        )}

        {/* 試合選択後の編集エリア */}
        {selectedMatchId && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-in fade-in duration-300">
            
            {/* 👈 左カラム: 速報設定 & 手動補足 */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* 試合概要カード */}
              {loadingDetails ? (
                <div className="bg-white/80 dark:bg-zinc-900/60 p-6 rounded-[var(--radius-xl)] border border-zinc-200/80 dark:border-white/5 animate-pulse space-y-4">
                  <div className="h-6 bg-zinc-200/50 dark:bg-white/5 w-1/2 rounded" />
                  <div className="h-4 bg-zinc-200/50 dark:bg-white/5 w-3/4 rounded" />
                </div>
              ) : matchDetail ? (
                <div className="bg-white border border-zinc-200 dark:bg-zinc-900/60 dark:border-white/5 p-5 rounded-[var(--radius-xl)] shadow-md dark:shadow-none relative overflow-hidden">
                  {matchDetail.status === "live" && (
                    <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 text-red-500 text-[10px] font-black tracking-wider px-2 py-0.5 rounded-full">
                      <span className="h-1.5 w-1.5 bg-red-500 rounded-full animate-ping" />
                      LIVE 進行中
                    </div>
                  )}
                  <h3 className="text-xs font-black text-primary tracking-widest mb-1.5">SELECTED MATCH</h3>
                  <div className="text-base font-black text-zinc-900 dark:text-white flex items-center gap-2">
                    {teamName} <span className="text-zinc-400 dark:text-zinc-500">vs</span> {opponentName}
                  </div>
                  <div className="mt-2 text-xs font-bold text-zinc-500 dark:text-zinc-400 flex flex-wrap gap-x-4 gap-y-1">
                    <span>📅 {new Date(matchDetail.date).toLocaleDateString("ja-JP")}</span>
                    <span>🏟️ {venueName || "グラウンド未設定"}</span>
                    <span>⚾️ {matchDetail.matchType === "official" ? "公式戦" : "練習試合"}</span>
                  </div>
                </div>
              ) : null}

              {/* 速報パラメータパネル (折りたたみ式 & 速報タイプ切り替え内包) */}
              <NewsParameterPanel
                newsType={newsType}
                setNewsType={setNewsType}
                isParamExpanded={isParamExpanded}
                setIsParamExpanded={setIsParamExpanded}
                matchName={matchName}
                setMatchName={setMatchName}
                venueName={venueName}
                setVenueName={setVenueName}
                opponentName={opponentName}
                setOpponentName={setOpponentName}
                reporterName={reporterName}
                handleReporterChange={handleReporterChange}
                startTime={startTime}
                setStartTime={setStartTime}
                endTime={endTime}
                setEndTime={setEndTime}
                firstTeamDisp={firstTeamDisp}
                setFirstTeamDisp={setFirstTeamDisp}
                secondTeamDisp={secondTeamDisp}
                setSecondTeamDisp={setSecondTeamDisp}
                lineupComment={lineupComment}
                setLineupComment={setLineupComment}
                inningOptions={inningOptions}
                selectedInningIndex={selectedInningIndex}
                setSelectedInningIndex={setSelectedInningIndex}
                inningComment={inningComment}
                setInningComment={setInningComment}
                heroPlayer={heroPlayer}
                setHeroPlayer={setHeroPlayer}
                summaryText={summaryText}
                setSummaryText={setSummaryText}
              />
            </div>

            {/* 👉 右カラム: テキストエディタ ＆ アクション */}
            <div className="lg:col-span-7 space-y-6">
              <NewsPreviewCard
                editedText={editedText}
                setEditedText={setEditedText}
                loadingDetails={loadingDetails}
                handleResetText={handleResetText}
                handleCopy={handleCopy}
                handleLineShare={handleLineShare}
                copied={copied}
              />
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
