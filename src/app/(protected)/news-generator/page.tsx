// filepath: src/app/(protected)/news-generator/page.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { 
  Copy, Check, Sparkles, RotateCcw, 
  Users, Trophy, ChevronRight, FileText, Activity, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/layout/SectionHeader";

// ⚾️ ポジションマッピング
const getPositionLabel = (posId: string) => {
  const mapping: Record<string, string> = {
    "1": "1", // 投 ➜ 番号表記に統一
    "2": "2", // 捕
    "3": "3", // 一
    "4": "4", // 二
    "5": "5", // 三
    "6": "6", // 遊
    "7": "7", // 左
    "8": "8", // 中
    "9": "9", // 右
    "DH": "D", // 指
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

  const selectedInningOption = inningOptions[selectedInningIndex];

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🏟️ スコアボードテキストの動的生成 (プロポーショナルフォント最適化仕様)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🏟️ スコアボードテキストの動的生成 (プロポーショナルフォント最適化仕様)
  const generateScoreTableText = (
    match: any,
    isFinal: boolean,
    inningLimit?: number,
    isBottomLimit?: boolean
  ) => {
    const isFirst = match.battingOrder === "first";
    const firstTeamRaw = firstTeamDisp || (isFirst ? teamName : match.opponent);
    const secondTeamRaw = secondTeamDisp || (isFirst ? match.opponent : teamName);
    
    const firstScores = isFirst ? match.myInningScores : match.opponentInningScores;
    const secondScores = isFirst ? match.opponentInningScores : match.myInningScores;
    
    // アマチュア・草野球の標準規定回（7回）を最低枠として確保
    const regulationInnings = 7;
    let inningCount = Math.max(firstScores.length, secondScores.length, regulationInnings);
    if (!isFinal && inningLimit) {
      inningCount = Math.max(inningLimit, regulationInnings);
    }
    
    // チーム名整形（全角2文字なら間に全角スペースを挟んで全角3文字相当にする）
    const formatTeamName = (teamName: string) => {
      let formatted = teamName.trim();
      if (formatted.length === 2) {
        formatted = `${formatted[0]}　${formatted[1]}`;
      }
      return formatted;
    };

    const firstTeamFormatted = formatTeamName(firstTeamRaw);
    const secondTeamFormatted = formatTeamName(secondTeamRaw);

    // ヘッダー作成 (左側は半角15スペース固定)
    let header = "               ";
    for (let i = 1; i <= inningCount; i++) {
      header += `${i} `;
    }
    // 末尾のスペースをカットして計を追加
    header = header.trimEnd() + " 計";

    // 得点行の作成 (チーム名の後ろは半角4スペース固定)
    let firstLine = firstTeamFormatted + "    ";
    let secondLine = secondTeamFormatted + "    ";
    
    let firstTotal = 0;
    let secondTotal = 0;
    
    let dispCount1 = 0;
    let dispCount2 = 0;

    for (let i = 1; i <= inningCount; i++) {
      // 先攻得点
      const score1 = firstScores[i - 1];
      const hasScore1 = score1 !== undefined && score1 !== null && (!inningLimit || i <= inningLimit);
      if (hasScore1) {
        firstLine += `${score1} `;
        firstTotal += score1;
        dispCount1++;
      } else {
        firstLine += "  ";
      }

      // 後攻得点
      const isCurrentInningUnfinishedBottom = !isFinal && inningLimit && i === inningLimit && !isBottomLimit;
      const score2 = secondScores[i - 1];
      const hasScore2 = score2 !== undefined && score2 !== null && (!inningLimit || i <= inningLimit) && !isCurrentInningUnfinishedBottom;
      if (hasScore2) {
        secondLine += `${score2} `;
        secondTotal += score2;
        dispCount2++;
      } else {
        secondLine += "  ";
      }
    }

    // 計の付与 (プロポーショナルフォント幅に合わせた動的スペース補正)
    const total1 = isFinal ? (isFirst ? match.myScore : match.opponentScore) : firstTotal;
    const total2 = isFinal ? (isFirst ? match.opponentScore : match.myScore) : secondTotal;

    // 実表示数に応じた最適なスペース補正数を計算
    const firstTotalSpCount = Math.max(1, 3 - (dispCount1 - 6) * 2);
    const secondTotalSpCount = Math.max(1, 6 - (dispCount2 - 6) * 2);

    firstLine = firstLine.trimEnd() + " ".repeat(firstTotalSpCount) + (total1 !== undefined && total1 !== null ? total1 : "0");
    secondLine = secondLine.trimEnd() + " ".repeat(secondTotalSpCount) + (total2 !== undefined && total2 !== null ? total2 : "0");

    return `${header}\n${firstLine}\n${secondLine}`;
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 📋 スタメン選手・交代の追記追跡ロジック
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const generateLineupListText = (lineup: any[], teamLabel: "my" | "opponent", isFirst: boolean) => {
    if (!lineup || lineup.length === 0) return "（スタメン未登録）";
    
    // 各打順スロットの選手名初期値
    const slotPlayers = lineup.map(p => p.name || p.playerName || "（未登録）");

    // ログから選手交代を走査してマージ
    const sortedLogs = [...playLogs].sort((a, b) => a.timestamp - b.timestamp);
    
    sortedLogs.forEach(log => {
      // 例: "選手交代[自チーム]: 6番 近藤 ➔ 石塚"
      if (log.description.includes("選手交代")) {
        const match = log.description.match(/選手交代\[(.+?)\]:\s*(\d+)番\s*(.+?)\s*➔\s*(.+)/);
        if (match) {
          const team = match[1];
          const order = parseInt(match[2], 10) - 1; // 0-indexed
          const newName = match[4].trim();
          
          const isMyTeamSubstitute = team === "自チーム";
          const isTargetTeam = teamLabel === "my" ? isMyTeamSubstitute : !isMyTeamSubstitute;
          
          if (isTargetTeam && order >= 0 && order < slotPlayers.length) {
            const innText = `(${log.inning}${log.isTop ? "表" : "裏"})`;
            slotPlayers[order] += `→${newName}${innText}`;
          }
        }
      }
    });

    return lineup.map((player, index) => {
      const order = index + 1;
      const posLabel = getPositionLabel(player.position);
      return `${order}.${posLabel} ${slotPlayers[index]}`;
    }).join("\n");
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 📝 プレイログのパース ＆ アウト数「●」自動整形ロジック
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const generateDetailPlayLogsText = (
    logs: any[], 
    isEnd: boolean, 
    limitInning?: number, 
    limitIsBottom?: boolean
  ) => {
    const isFirst = matchDetail.battingOrder === "first";
    
    // 時系列（古い順）にソート
    const sortedLogs = [...logs].sort((a, b) => a.timestamp - b.timestamp);
    
    // 範囲外のログをフィルター
    const targetLogs = sortedLogs.filter(log => {
      if (limitInning) {
        if (log.inning < limitInning) return true;
        if (log.inning === limitInning) {
          if (!limitIsBottom) return log.isTop;
          return true;
        }
        return false;
      }
      return true;
    });

    // イニングごとにグループ化
    const groups: Record<string, { inning: number; isTop: boolean; logs: any[] }> = {};
    const groupKeys: string[] = [];

    targetLogs.forEach(log => {
      const key = `${log.inning}-${log.isTop}`;
      if (!groups[key]) {
        groups[key] = { inning: log.inning, isTop: log.isTop, logs: [] };
        groupKeys.push(key);
      }
      groups[key].logs.push(log);
    });

    let outputText = "⚾️プレイボール⚾️\n";

    groupKeys.forEach(key => {
      const group = groups[key];
      const inningHeader = `${group.inning}回${group.isTop ? "表" : "裏"}`;
      outputText += `${inningHeader}\n`;

      let inningOuts = 0;
      let currentAtBat: any = null;
      const atBats: any[] = [];

      const isMyTeamAttack = group.isTop === isFirst;
      const inningScores = isMyTeamAttack ? matchDetail.myInningScores : matchDetail.opponentInningScores;
      const inningScore = inningScores[group.inning - 1] !== undefined ? inningScores[group.inning - 1] : 0;

      group.logs.forEach(log => {
        const desc = log.description;
        const cleanDesc = desc.replace(/\s*\[B:\d+,\s*S:\d+,\s*O:\d+\]$/, "").trim();

        // 交代系ログ
        if (
          cleanDesc.includes("選手交代") || 
          cleanDesc.includes("イニング交代") || 
          cleanDesc.includes("チェンジ") || 
          cleanDesc === "プレイボール" || 
          cleanDesc === "試合終了" || 
          cleanDesc === "ゲームセット"
        ) {
          if (cleanDesc.includes("選手交代")) {
            const matchSub = cleanDesc.match(/選手交代\[(.+?)\]:\s*(\d+)番\s*(.+?)\s*➔\s*(.+)/);
            if (matchSub) {
              const team = matchSub[1];
              const oldName = matchSub[3].trim();
              const newName = matchSub[4].trim();
              
              // 投手交代かどうかチェック
              const isPitcherSub = log.description.includes("投手") || 
                lineups?.myLineup?.find((p: any) => (p.name === oldName || p.playerName === oldName) && p.position === "1") ||
                lineups?.opponentLineup?.find((p: any) => (p.name === oldName || p.playerName === oldName) && p.position === "1");
              
              const subLabel = isPitcherSub ? "投手交代" : "選手交代";
              const subText = `${subLabel} ${oldName}→${newName}`;

              if (currentAtBat) {
                currentAtBat.plays.push(subText);
                currentAtBat.outsAtPlay.push(inningOuts);
                currentAtBat.isOutsInc.push(false);
              } else {
                atBats.push({ isEvent: true, text: subText });
              }
            }
          }
          return;
        }

        // 打席ログの開始（例: "1番 小松: 中飛" もしくは "1番 : 空三振"）
        const atBatMatch = cleanDesc.match(/^(\d+)番\s*([^:]+?)\s*:\s*(.+)$/);
        const atBatMatchNoName = cleanDesc.match(/^(\d+)番\s*:\s*(.+)$/);

        if (atBatMatch || atBatMatchNoName) {
          const order = parseInt(atBatMatch ? atBatMatch[1] : atBatMatchNoName![1], 10);
          const name = atBatMatch ? atBatMatch[2].trim() : "";
          const play = atBatMatch ? atBatMatch[3].trim() : atBatMatchNoName![2].trim();

          const isOut = (
            play.includes("アウト") || 
            play.includes("三振") || 
            play.includes("ゴロ") || 
            play.includes("飛") || 
            play.includes("直") || 
            play.includes("併殺") || 
            play.includes("犠") || 
            play.includes("封殺") || 
            (play.includes("死") && !play.includes("デッド") && !play.includes("死球"))
          );

          if (isOut) {
            inningOuts = Math.min(3, inningOuts + 1);
          }

          currentAtBat = {
            isEvent: false,
            batterOrder: order,
            batterName: name,
            plays: [play],
            outsAtPlay: [inningOuts],
            isOutsInc: [isOut]
          };
          atBats.push(currentAtBat);
        } else {
          // 走者アクション（打席ブロックに結合）
          if (currentAtBat) {
            let playText = cleanDesc;
            
            // 状態フラグ
            let isOutAction = false;
            if (playText.includes("盗塁死")) {
              isOutAction = true;
              inningOuts = Math.min(3, inningOuts + 1);
            }
            if (playText.includes("牽制死")) {
              isOutAction = true;
              inningOuts = Math.min(3, inningOuts + 1);
            }
            if (playText.includes("走塁死")) {
              isOutAction = true;
              inningOuts = Math.min(3, inningOuts + 1);
            }

            // 部分置換
            playText = playText.replace("盗塁成功", "盗塁");
            playText = playText.replace("暴投", "投暴投");
            playText = playText.replace("パスボール", "捕逸");

            currentAtBat.plays.push(playText);
            currentAtBat.outsAtPlay.push(inningOuts);
            currentAtBat.isOutsInc.push(isOutAction);
          }
        }
      });

      // 整形出力
      atBats.forEach(ab => {
        if (ab.isEvent) {
          outputText += `${ab.text}\n`;
        } else {
          let line = `${ab.batterOrder}.`;
          
          // 自チームの攻撃イニングのみ名前を表示する
          if (isMyTeamAttack && ab.batterName && ab.batterName !== "打者") {
            line += `${ab.batterName} `;
          }

          const formattedPlays = ab.plays.map((play: string, idx: number) => {
            let p = play;
            const outs = ab.outsAtPlay[idx];
            const outDots = "●".repeat(outs);
            
            // 表記のクリーンアップ（より詳細な野球用語の置換）
            p = p.replace("空振り三振", "空三振");
            p = p.replace("見逃し三振", "見三振");
            
            p = p.replace("ライト前安打", "右前安");
            p = p.replace("レフト前安打", "左前安");
            p = p.replace("センター前安打", "中前安");
            
            p = p.replace("ライト前適時安打", "右前適時安打");
            p = p.replace("レフト前適時安打", "左前適時安打");
            p = p.replace("センター前適時安打", "中前適時安打");
            
            p = p.replace("ライト前適時二塁打", "右前適時2塁打");
            p = p.replace("レフト前適時二塁打", "左前適時2塁打");
            p = p.replace("センター前適時二塁打", "中前適時2塁打");
            
            p = p.replace("ライト前適時三塁打", "右前適時3塁打");
            p = p.replace("レフト前適時三塁打", "左前適時3塁打");
            p = p.replace("センター前適時三塁打", "中前適時3塁打");

            p = p.replace("ライト線二塁打", "右線2塁打");
            p = p.replace("レフト線二塁打", "左線2塁打");
            
            p = p.replace("ライト中安", "右中安");
            p = p.replace("レフト中安", "左中安");
            p = p.replace("ライト前安", "右前安");
            p = p.replace("レフト前安", "左前安");
            p = p.replace("センター前安", "中前安");
            p = p.replace("ライト中二塁打", "右中2塁打");
            p = p.replace("レフト中二塁打", "左中2塁打");
            
            p = p.replace("二塁打", "2塁打");
            p = p.replace("三塁打", "3塁打");
            
            p = p.replace("タイムリー", "適時");
            p = p.replace("フォアボール", "四球");
            p = p.replace("デッドボール", "死球");

            const isOutPlay = (
              ab.isOutsInc[idx] || 
              p.includes("三振") || 
              p.includes("ゴロ") || 
              p.includes("飛") || 
              p.includes("直") || 
              p.includes("アウト") || 
              p.includes("封殺") || 
              p.includes("走塁死") || 
              p.includes("盗塁死") || 
              p.includes("牽制死") ||
              p.includes("併殺")
            );

            // 進塁情報の判定
            let baseInfo = "";
            const baseMatch = p.match(/(1|2|3)塁|1•2|2•3|1•3|満塁/);
            if (baseMatch) {
              baseInfo = baseMatch[0].includes("塁") ? baseMatch[0] : `${baseMatch[0]}塁`;
              p = p.replace(baseMatch[0], "").replace("塁", "").trim();
            } else {
              // 明示的な進塁先がない場合
              const isOnlyPlay = ab.plays.length === 1;
              if (idx === 0 && isOnlyPlay && !isOutPlay) {
                if (p.includes("安") || p.includes("単打") || p.includes("四球") || p.includes("死球") || p.includes("失") || p.includes("野選")) {
                  baseInfo = "1塁";
                } else if (p.includes("二塁打") || p.includes("二")) {
                  baseInfo = "2塁";
                } else if (p.includes("三塁打") || p.includes("三")) {
                  baseInfo = "3塁";
                }
              }
            }

            // RBI（打点）情報の抽出
            let runInfo = "";
            const rbiMatch = p.match(/(\d+)点/);
            if (rbiMatch) {
              runInfo = ` ${rbiMatch[1]}点`;
              p = p.replace(rbiMatch[0], "").trim();
            }

            // 最後のプレイではない、かつアウトでもなく、進塁情報もない中間的なプレイの場合
            const isMiddleAction = idx < ab.plays.length - 1 && !isOutPlay && !baseInfo;
            if (isMiddleAction) {
              return `${p}${runInfo}`;
            }

            // 通常のフォーマット出力
            // 走者アクション（盗塁、暴投、牽制など）かどうかの判定
            const isRunnerAction = p.includes("盗塁") || p.includes("投暴投") || p.includes("捕逸") || p.includes("牽制");

            if (isRunnerAction) {
              // 走者アクションの時は、直前のプレイ名とアウトドット・塁情報の間にスペースを入れない (例: 盗塁2塁, 投暴投●●2塁)
              return `${p}${runInfo}${outDots}${baseInfo}`;
            }

            // 通常の打者アクション
            if (baseInfo) {
              return `${p}${runInfo} ${outDots}${baseInfo}`;
            } else {
              if (isOutPlay) {
                // 単一のアウトプレイで塁情報がない場合（例: 中飛●、二ゴロ●●）はスペースなしで結合
                return `${p}${runInfo}${outDots}`;
              } else {
                // アウトでも進塁情報もないが、アウトドットがある場合はスペース付きで結合。なければそのまま。
                return outDots ? `${p}${runInfo} ${outDots}` : `${p}${runInfo}`;
              }
            }
          });

          line += formattedPlays.join(" ");
          outputText += `${line}\n`;
        }
      });

      outputText += `得点${inningScore}\n\n`;
    });

    return outputText;
  };

  const getResultLabel = (match: any) => {
    const my = match.myScore;
    const opp = match.opponentScore;
    if (my > opp) return "勝利";
    if (my < opp) return "惜敗";
    return "引き分け";
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 速報テキストの自動生成 (メモ化)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const generatedText = useMemo(() => {
    if (!matchDetail) return "";

    const dateObj = new Date(matchDetail.date);
    const month = dateObj.getMonth() + 1;
    const date = dateObj.getDate();
    const weekday = ["日", "月", "火", "水", "木", "金", "土"][dateObj.getDay()];
    const dateHeader = `${month}月${date}日（${weekday}）`;

    const matchHeader = `⚾️${matchName}\n対 ${opponentName} @${venueName}`;
    
    // 開始・終了時間の調整（未設定の場合はその行を出力しない）
    const timeHeader = [
      startTime ? `開始時間　${startTime}` : "",
      endTime ? `終了時間    ${endTime}` : ""
    ].filter(Boolean).join("\n");

    const isFirst = matchDetail.battingOrder === "first";
    const myAttackLabel = isFirst ? "先攻" : "後攻";
    const opponentAttackLabel = isFirst ? "後攻" : "先攻";
    
    const myLineupText = generateLineupListText(lineups?.myLineup, "my", isFirst);
    const oppLineupText = generateLineupListText(lineups?.opponentLineup, "opponent", !isFirst);
    
    // A. スタメン速報
    if (newsType === "lineup") {
      return `${dateHeader}
${matchHeader}
${timeHeader ? `${timeHeader}\n` : ""}
◆ ${teamName} スタメン（${myAttackLabel}）
${myLineupText}

◆ ${opponentName} スタメン（${opponentAttackLabel}）
${oppLineupText}
${lineupComment ? `\n💬 コメント:\n${lineupComment}\n` : ""}
#草野球 #スタメン発表 #iScoreCloud`;
    }

    // B. イニング速報 または C. 試合終了速報
    const isEnd = newsType === "end";
    const limitInning = isEnd ? undefined : selectedInningOption?.inning;
    const limitIsBottom = isEnd ? undefined : selectedInningOption?.isBottom;

    const scoreTable = generateScoreTableText(matchDetail, isEnd, limitInning, limitIsBottom);
    const detailLogs = generateDetailPlayLogsText(playLogs, isEnd, limitInning, limitIsBottom);
    
    const footer = reporterName ? `\n速報　${reporterName}` : "";
    const lineupSection = myLineupText ? `${myLineupText}\n` : "";

    if (newsType === "inning") {
      return `${dateHeader}
${matchHeader}
${timeHeader ? `${timeHeader}\n` : ""}${scoreTable}

${lineupSection}
${detailLogs}${inningComment ? `\n💬 戦況解説:\n${inningComment}\n` : ""}${footer}`;
    }

    if (newsType === "end") {
      return `${dateHeader}
${matchHeader}
${timeHeader ? `${timeHeader}\n` : ""}${scoreTable}

${lineupSection}
${detailLogs}${heroPlayer ? `\n🏅 本日のヒーロー:\n${heroPlayer}\n` : ""}${summaryText ? `\n📝 戦評・総括:\n${summaryText}\n` : ""}${footer}`;
    }

    return "";
  }, [
    matchDetail, lineups, playLogs, newsType, lineupComment,
    selectedInningOption, inningComment, heroPlayer, summaryText,
    teamName, matchName, venueName, opponentName, startTime, endTime, reporterName,
    firstTeamDisp, secondTeamDisp
  ]);

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
    <div className="min-h-screen p-4 sm:p-6 pt-8 pb-32 animate-in fade-in duration-400 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 relative overflow-hidden">
      {/* 🔮 背景のオーブ */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/5 dark:bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto space-y-6 relative z-10">
        
        {/* ヘッダー */}
        <div className="flex flex-col items-center justify-center text-center gap-3">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mb-1 shadow-sm">
            <Zap className="h-7 w-7 text-primary" />
          </div>
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

              {/* 速報タイプのタブ切り替え */}
              <div className="bg-white border border-zinc-200 dark:bg-zinc-900/60 dark:border-white/5 p-2 rounded-[var(--radius-xl)] shadow-md dark:shadow-none flex gap-1">
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
                          : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 active:scale-95"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* 手動補足・パラメータ入力エリア */}
              <div className="bg-white border border-zinc-200 dark:bg-zinc-900/60 dark:border-white/5 p-5 rounded-[var(--radius-xl)] shadow-md dark:shadow-none space-y-4 transition-all duration-300">
                <div 
                  onClick={() => setIsParamExpanded(!isParamExpanded)}
                  className="flex items-center justify-between gap-2 border-b border-zinc-100 dark:border-white/5 pb-2.5 mb-2 cursor-pointer group select-none"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary animate-pulse" />
                    <h4 className="text-xs font-black text-zinc-900 dark:text-white tracking-wider group-hover:text-primary transition-colors">速報パラメータの調整</h4>
                  </div>
                  <ChevronRight className={cn("h-4 w-4 text-zinc-400 dark:text-zinc-500 transition-transform duration-300", isParamExpanded && "rotate-90")} />
                </div>

                {isParamExpanded && (
                  <div className="space-y-4 animate-in fade-in duration-300">

                {/* 基本情報の手動調整 */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-[10.5px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">試合名/大会名</label>
                    <input
                      type="text"
                      value={matchName}
                      onChange={(e) => setMatchName(e.target.value)}
                      className="w-full h-10 bg-white dark:bg-black/40 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white text-xs px-3 rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all font-bold shadow-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10.5px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">球場名</label>
                    <input
                      type="text"
                      value={venueName}
                      onChange={(e) => setVenueName(e.target.value)}
                      className="w-full h-10 bg-white dark:bg-black/40 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white text-xs px-3 rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all font-bold shadow-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10.5px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">対戦相手</label>
                    <input
                      type="text"
                      value={opponentName}
                      onChange={(e) => setOpponentName(e.target.value)}
                      className="w-full h-10 bg-white dark:bg-black/40 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white text-xs px-3 rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all font-bold shadow-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10.5px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">速報担当者</label>
                    <input
                      type="text"
                      value={reporterName}
                      onChange={(e) => handleReporterChange(e.target.value)}
                      placeholder="例: 赤羽  橋本"
                      className="w-full h-10 bg-white dark:bg-black/40 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white text-xs px-3 rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600 font-bold shadow-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10.5px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">開始時間</label>
                    <input
                      type="text"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      placeholder="例: 15:20"
                      className="w-full h-10 bg-white dark:bg-black/40 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white text-xs px-3 rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600 font-bold shadow-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10.5px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">終了時間</label>
                    <input
                      type="text"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      placeholder="例: 17:01"
                      className="w-full h-10 bg-white dark:bg-black/40 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white text-xs px-3 rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600 font-bold shadow-sm"
                    />
                  </div>
                </div>

                {/* スコア用表示名の手動調整 (イニング・終了速報時のみ表示) */}
                {newsType !== "lineup" && (
                  <div className="space-y-3 pt-1 animate-in fade-in duration-300">
                    <div className="border-t border-zinc-100 dark:border-white/5 my-2" />
                    <label className="block text-[10.5px] font-black text-zinc-500 dark:text-zinc-400 tracking-wider uppercase">
                      🏟️ スコアボードチーム名（等幅スペース調整用）
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500">先攻表示名（全角2文字はスペース推奨）</span>
                        <input
                          type="text"
                          value={firstTeamDisp}
                          onChange={(e) => setFirstTeamDisp(e.target.value)}
                          placeholder="例: 逗　子"
                          className="w-full h-10 bg-white dark:bg-black/40 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white text-xs px-3 rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600 font-mono font-bold shadow-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500">後攻表示名（全角2文字はスペース推奨）</span>
                        <input
                          type="text"
                          value={secondTeamDisp}
                          onChange={(e) => setSecondTeamDisp(e.target.value)}
                          placeholder="例: 川　中"
                          className="w-full h-10 bg-white dark:bg-black/40 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white text-xs px-3 rounded-xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600 font-mono font-bold shadow-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* --- A. スタメン速報用の設定 --- */}
                {newsType === "lineup" && (
                  <div className="space-y-3 animate-in fade-in duration-300">
                    <div>
                      <label className="block text-[10.5px] font-black text-zinc-500 dark:text-zinc-400 tracking-wider uppercase mb-1.5">
                        💬 監督コメント・意気込みなどの一言 (自由に入力)
                      </label>
                      <textarea
                        value={lineupComment}
                        onChange={(e) => setLineupComment(e.target.value)}
                        placeholder="例：新戦力の山田を1番に抜擢！打線のつながりで勝利を目指します。"
                        className="w-full min-h-[90px] bg-white dark:bg-black/40 border border-zinc-200 dark:border-white/10 focus:border-primary focus:ring-2 focus:ring-primary/10 text-zinc-900 dark:text-white text-xs p-3 rounded-xl outline-none resize-none transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600 font-bold shadow-sm"
                      />
                    </div>
                  </div>
                )}

                {/* --- B. イニング速報用の設定 --- */}
                {newsType === "inning" && (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <div>
                      <label className="block text-[10.5px] font-black text-zinc-500 dark:text-zinc-400 tracking-wider uppercase mb-1.5">
                        ⚾️ 速報に含めるイニングの選択
                      </label>
                      {inningOptions.length === 0 ? (
                        <div className="text-xs font-bold text-zinc-400 py-2">
                          進行中のイニングデータが存在しません。イニングスコアを入力してください。
                        </div>
                      ) : (
                        <div className="relative">
                          <select
                            value={selectedInningIndex}
                            onChange={(e) => setSelectedInningIndex(Number(e.target.value))}
                            className="w-full h-11 bg-white dark:bg-black/40 border border-zinc-200 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/20 focus:border-primary focus:ring-2 focus:ring-primary/10 text-zinc-900 dark:text-white font-bold text-xs px-4 rounded-xl outline-none transition-all cursor-pointer appearance-none shadow-sm"
                          >
                            {inningOptions.map((opt, idx) => (
                              <option key={idx} value={idx} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">
                                {opt.label}まで表示する
                              </option>
                            ))}
                          </select>
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400 dark:text-zinc-500">
                            <ChevronRight className="h-4 w-4 rotate-90" />
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-[10.5px] font-black text-zinc-500 dark:text-zinc-400 tracking-wider uppercase mb-1.5">
                        💬 戦況解説・追加コメント (自由に入力)
                      </label>
                      <textarea
                        value={inningComment}
                        onChange={(e) => setInningComment(e.target.value)}
                        placeholder="例：山田が先制の2ランを放ちリードする展開。先発佐藤も要所を締め好投中。"
                        className="w-full min-h-[95px] bg-white dark:bg-black/40 border border-zinc-200 dark:border-white/10 focus:border-primary focus:ring-2 focus:ring-primary/10 text-zinc-900 dark:text-white text-xs p-3 rounded-xl outline-none resize-none transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600 font-bold shadow-sm"
                      />
                    </div>
                  </div>
                )}

                {/* --- C. 試合終了速報用の設定 --- */}
                {newsType === "end" && (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <div>
                      <label className="block text-[10.5px] font-black text-zinc-500 dark:text-zinc-400 tracking-wider uppercase mb-1.5">
                        🏅 本日のヒーロー・活躍した選手
                      </label>
                      <input
                        type="text"
                        value={heroPlayer}
                        onChange={(e) => setHeroPlayer(e.target.value)}
                        placeholder="例：山田選手 (先制の2ランを含む3打点の大活躍！)"
                        className="w-full h-11 bg-white dark:bg-black/40 border border-zinc-200 dark:border-white/10 focus:border-primary focus:ring-2 focus:ring-primary/10 text-zinc-900 dark:text-white text-xs px-4 rounded-xl outline-none transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600 font-bold shadow-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-[10.5px] font-black text-zinc-500 dark:text-zinc-400 tracking-wider uppercase mb-1.5">
                        📝 戦評・総括
                      </label>
                      <textarea
                        value={summaryText}
                        onChange={(e) => setSummaryText(e.target.value)}
                        placeholder="例：初回、3番山田の右越え2ランで先制。中盤に追いつかれるも、5回に相手の失策の間に勝ち越しに成功。投げては先発佐藤が7回2失点の力投で見事完投勝利を飾った。"
                        className="w-full min-h-[130px] bg-white dark:bg-black/40 border border-zinc-200 dark:border-white/10 focus:border-primary focus:ring-2 focus:ring-primary/10 text-zinc-900 dark:text-white text-xs p-3 rounded-xl outline-none resize-none transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600 font-bold shadow-sm"
                      />
                    </div>
                  </div>
                )}
                  </div>
                )}
              </div>
            </div>

            {/* 👉 右カラム: テキストエディタ ＆ アクション */}
            <div className="lg:col-span-7 space-y-6">
              
              <div className="bg-white border border-zinc-200 dark:bg-zinc-900/60 dark:border-white/5 p-5 rounded-2xl shadow-md dark:shadow-none space-y-4 relative">
                
                {/* ツールバー */}
                <div className="flex items-center justify-between border-b border-zinc-100 dark:border-white/5 pb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <h4 className="text-xs font-black text-zinc-900 dark:text-white tracking-wider">📝 速報テキスト（編集・手直し可能）</h4>
                  </div>
                  
                  <button
                    onClick={handleResetText}
                    title="自動生成されたテキストにリセットする"
                    className="flex items-center gap-1 text-[10px] font-black text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors px-2.5 py-1.5 rounded-full bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 border border-zinc-200 dark:border-white/5 active:scale-95 animate-in fade-in duration-300"
                  >
                    <RotateCcw className="h-3 w-3" />
                    自動生成から復元
                  </button>
                </div>

                {/* エディターエリア */}
                {loadingDetails ? (
                  <div className="w-full h-[360px] bg-zinc-100 dark:bg-black/20 animate-pulse rounded-2xl" />
                ) : (
                  <textarea
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    className="w-full min-h-[480px] bg-white dark:bg-black/40 border border-zinc-200 dark:border-white/10 focus:border-primary dark:focus:border-primary/50 focus:ring-2 focus:ring-primary/10 text-zinc-900 dark:text-white text-[13px] sm:text-sm p-4 rounded-2xl outline-none font-mono resize-y leading-relaxed transition-all focus:ring-1 focus:ring-primary/20 shadow-inner"
                    placeholder="試合を選択すると、ここに自動生成された速報テキストが表示され、自由に手直し・編集ができます。"
                  />
                )}

                {/* アクションボタン群 */}
                <div className="flex flex-col sm:flex-row gap-4 pt-2">
                  <Button
                    onClick={handleCopy}
                    className="flex-1 rounded-[24px] font-black text-sm sm:text-base h-16 gap-3 active:scale-95 transition-all bg-white hover:bg-zinc-50 dark:bg-zinc-950 border-2 border-zinc-300 dark:border-zinc-800 dark:hover:bg-zinc-900 text-zinc-900 dark:text-white shadow-md"
                    variant="outline"
                  >
                    {copied ? (
                      <Check className="h-6 w-6 text-emerald-500 shrink-0 animate-in zoom-in-50 duration-200" />
                    ) : (
                      <Copy className="h-6 w-6 shrink-0" />
                    )}
                    {copied ? "コピーしました！" : "クリップボードにコピー"}
                  </Button>

                  <Button
                    onClick={handleLineShare}
                    className="flex-1 rounded-[24px] font-black text-sm sm:text-base h-16 gap-3 bg-[#06C755] hover:bg-[#05b34c] hover:shadow-lg hover:shadow-emerald-500/20 text-white active:scale-95 transition-all shadow-md flex items-center justify-center"
                  >
                    <div className="relative h-10 w-10 shrink-0">
                      <Image src="/line-logo.png" alt="LINE" fill className="object-contain" />
                    </div>
                    LINEで共有・転送
                  </Button>
                </div>

                <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 text-center">
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
