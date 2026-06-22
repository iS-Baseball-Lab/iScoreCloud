// filepath: src/lib/utils/format-match.ts
import { Match } from "@/types/match";

/**
 * 💡 現場仕様スコア表示
 * サヨナラ勝ちの「x」や、未プレイの「-」を正確にレンダリングします。
 */
export function formatScoreDisplay(score: number | null | undefined, isWalkOff: boolean = false): string {
  if (score === null || score === undefined) return "-";
  return isWalkOff ? `${score}x` : `${score.toString()}`;
}

/**
 * 💡 LINE Messaging API 送信用テキスト生成
 * Workers 内でも使用可能な純粋関数。
 */
export function generateMatchReport(match: Match): string {
  const resultEmoji = match.status === 'finished' 
    ? (match.myScore > match.opponentScore ? "🏆【勝利】" : "⚾️【試合終了】")
    : "🔥【試合速報】";

  const myScoreStr = formatScoreDisplay(match.myScore, match.isWalkOff);
  const oppScoreStr = formatScoreDisplay(match.opponentScore);

  return (
    `${resultEmoji}\n` +
    `vs ${match.opponent}\n` +
    `スコア: ${myScoreStr} - ${oppScoreStr}\n` +
    `種別: ${match.matchType === 'official' ? '公式戦' : match.matchType === 'exchange' ? '交流戦' : 'OP戦'}\n` +
    `#iScoreCloud #野球速報`
  );
}
