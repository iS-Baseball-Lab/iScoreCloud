// filepath: src/components/features/news-generator/useNewsText.ts
import { useMemo } from "react";
import type { PlayLogEntry } from "@/types/score";

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

interface UseNewsTextProps {
  matchDetail: any;
  lineups: any;
  playLogs: PlayLogEntry[];
  newsType: "lineup" | "inning" | "end";
  teamName: string;
  matchName: string;
  venueName: string;
  opponentName: string;
  startTime: string;
  endTime: string;
  reporterName: string;
  lineupComment: string;
  inningComment: string;
  selectedInningOption: { label: string; inning: number; isBottom: boolean } | null;
  heroPlayer: string;
  summaryText: string;
  firstTeamDisp: string;
  secondTeamDisp: string;
  showSurnameOnly: boolean; // 🌟 苗字のみ出力オプション
}

export function useNewsText({
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
  secondTeamDisp,
  showSurnameOnly
}: UseNewsTextProps) {

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

  // 📋 スタメン選手・交代の追記追跡ロジック
  const generateLineupListText = (lineup: any[], teamLabel: "my" | "opponent", isFirst: boolean) => {
    if (!lineup || lineup.length === 0) return "（スタメン未登録）";
    
    // 各打順スロットの選手名初期値
    const slotPlayers = lineup.map(p => p.name || p.playerName || "（未登録）");

    // ログから選手交代を走査してマージ
    const sortedLogs = [...playLogs].sort((a, b) => a.timestamp - b.timestamp);
    
    sortedLogs.forEach(log => {
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
      const rawName = slotPlayers[index];
      
      // 🌟 苗字のみ出力オプション対応
      const formattedFullName = rawName.split("→").map((nPart: string) => {
        const innMatch = nPart.match(/\((.+?)\)/);
        let nameOnly = nPart.replace(/\((.+?)\)/, "");
        if (showSurnameOnly) {
          nameOnly = nameOnly.split(/[\s　]+/)[0];
        }
        return innMatch ? `${nameOnly}${innMatch[0]}` : nameOnly;
      }).join("→");

      return `${order}.${posLabel} ${formattedFullName}`;
    }).join("\n");
  };

  // 📝 プレイログのパース ＆ アウト数「●」自動整形ロジック
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
              
              const isMyTeamSubstitute = team === "自チーム";
              
              // 🌟 相手チームの選手交代・選手名は出力しない
              if (!isMyTeamSubstitute) {
                return;
              }

              // 投手交代かどうかチェック
              const isPitcherSub = log.description.includes("投手") || 
                lineups?.myLineup?.find((p: any) => (p.name === oldName || p.playerName === oldName) && p.position === "1") ||
                lineups?.opponentLineup?.find((p: any) => (p.name === oldName || p.playerName === oldName) && p.position === "1");
              
              const subLabel = isPitcherSub ? "投手交代" : "選手交代";
              
              // 🌟 苗字のみ出力オプション対応
              const formattedOld = showSurnameOnly ? oldName.split(/[\s　]+/)[0] : oldName;
              const formattedNew = showSurnameOnly ? newName.split(/[\s　]+/)[0] : newName;
              const subText = `${subLabel} ${formattedOld}→${formattedNew}`;

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

          // 💡 途中経過の投球（ボール、空振り、ストライク、ファウル）であるか判定
          const isPitch = (
            play === "ボール" || 
            play === "空振り" || 
            play === "見逃しストライク" || 
            play === "ファウル"
          );

          // すでに同じ打者の打席が直前にあれば使い回す、なければ新規作成
          const lastAtBat = atBats.length > 0 ? atBats[atBats.length - 1] : null;
          if (lastAtBat && !lastAtBat.isEvent && lastAtBat.batterOrder === order) {
            currentAtBat = lastAtBat;
            if (!isPitch) {
              currentAtBat.plays.push(play);
              currentAtBat.outsAtPlay.push(inningOuts);
              currentAtBat.isOutsInc.push(isOut);
            }
          } else {
            currentAtBat = {
              isEvent: false,
              batterOrder: order,
              batterName: name,
              plays: isPitch ? [] : [play],
              outsAtPlay: isPitch ? [] : [inningOuts],
              isOutsInc: isPitch ? [] : [isOut]
            };
            atBats.push(currentAtBat);
          }
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

            // 💡 走者アクションの冗長な「〇塁走者 選手名: 」をトリムし、進塁先を推測してスマートに埋め込む
            const runnerActionMatch = playText.match(/^(\d+)塁走者\s*[^:]+?\s*:\s*(.+)$/);
            if (runnerActionMatch) {
              const startBase = parseInt(runnerActionMatch[1], 10);
              const actionContent = runnerActionMatch[2].trim();
              
              let cleanAction = actionContent
                .replace("盗塁成功", "盗塁")
                .replace("暴投", "投暴投")
                .replace("パスボール", "捕逸")
                .replace("ボーク", "ボーク")
                .replace("エラー", "失策進塁")
                .replace("で進塁", "")
                .replace("により本塁生還", "")
                .trim();
              
              const destBase = startBase + 1;
              if (destBase <= 3) {
                if (!cleanAction.includes("塁")) {
                  cleanAction += `${destBase}塁`;
                }
              } else {
                if (!cleanAction.includes("本塁") && !cleanAction.includes("1点") && !cleanAction.includes("得点")) {
                  cleanAction += " 本塁生還";
                }
              }
              playText = cleanAction;
            } else {
              playText = playText.replace("盗塁成功", "盗塁");
              playText = playText.replace("暴投", "投暴投");
              playText = playText.replace("パスボール", "捕逸");
            }

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
          
          // 🌟 苗字のみ出力オプション対応
          if (isMyTeamAttack && ab.batterName && ab.batterName !== "打者") {
            const formattedName = showSurnameOnly ? ab.batterName.split(/[\s　]+/)[0] : ab.batterName;
            line += `${formattedName} `;
          }

          const formattedPlays = ab.plays.map((play: string, idx: number) => {
            let p = play;
            const outs = ab.outsAtPlay[idx];
            const outDots = "●".repeat(outs);
            
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

            let baseInfo = "";
            const baseMatch = p.match(/(1|2|3)塁|1•2|2•3|1•3|満塁/);
            if (baseMatch) {
              baseInfo = baseMatch[0].includes("塁") ? baseMatch[0] : `${baseMatch[0]}塁`;
              p = p.replace(baseMatch[0], "").replace("塁", "").trim();
            } else {
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

            let runInfo = "";
            const rbiMatch = p.match(/(\d+)点/);
            if (rbiMatch) {
              runInfo = ` ${rbiMatch[1]}点`;
              p = p.replace(rbiMatch[0], "").trim();
            }

            const isMiddleAction = idx < ab.plays.length - 1 && !isOutPlay && !baseInfo;
            if (isMiddleAction) {
              return `${p}${runInfo}`;
            }

            const isRunnerAction = p.includes("盗塁") || p.includes("投暴投") || p.includes("捕逸") || p.includes("牽制");

            if (isRunnerAction) {
              return `${p}${runInfo}${outDots}${baseInfo}`;
            }

            if (baseInfo) {
              return `${p}${runInfo} ${outDots}${baseInfo}`;
            } else {
              if (isOutPlay) {
                return `${p}${runInfo}${outDots}`;
              } else {
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

  const generatedText = useMemo(() => {
    if (!matchDetail) return "";

    const dateObj = new Date(matchDetail.date);
    const month = dateObj.getMonth() + 1;
    const date = dateObj.getDate();
    const weekday = ["日", "月", "火", "水", "木", "金", "土"][dateObj.getDay()];
    const dateHeader = `${month}月${date}日（${weekday}）`;

    const matchHeader = `⚾️${matchName}\n対 ${opponentName} @${venueName}`;
    
    const timeHeader = [
      startTime ? `開始時間　${startTime}` : "",
      endTime ? `終了時間    ${endTime}` : ""
    ].filter(Boolean).join("\n");

    const isFirst = matchDetail.battingOrder === "first";
    const myAttackLabel = isFirst ? "先攻" : "後攻";
    
    const myLineupText = lineups?.myLineup ? generateLineupListText(lineups.myLineup, "my", isFirst) : "";
    
    // A. スタメン速報 (自チームのみ出力するように変更)
    if (newsType === "lineup") {
      return `${dateHeader}
${matchHeader}
${timeHeader ? `${timeHeader}\n` : ""}
◆ ${teamName} スタメン（${myAttackLabel}）
${myLineupText}
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
    firstTeamDisp, secondTeamDisp, showSurnameOnly
  ]);

  return {
    generatedText
  };
}
