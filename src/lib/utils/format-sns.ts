// filepath: src/lib/utils/format-sns.ts
/* 💡 iScoreCloud 規約: 
   1. サヨナラ勝ちの判定ロジックを内包し、野球の不文律（x表示）を自動化する。
   2. 9回以降（または設定された最終回）の裏で勝ち越した瞬間に「x」を付与する。 */

/**
 * 💡 サヨナラ判定付きスコアフォーマット
 */
export function formatScoreWithX(
  homeScore: number,
  awayScore: number,
  inning: number,
  isBottom: boolean,
  status: 'live' | 'finished',
  config: { scheduledInnings: number } = { scheduledInnings: 9 }
): { home: string; away: string } {
  
  // 🌟 サヨナラ勝ちの条件チェック
  // 1. 試合終了している or 現在進行中の最終回裏
  // 2. 最終回以降の裏の攻撃である
  // 3. ホームチーム（後攻）がリードしている
  const isWalkOff = 
    (status === 'finished' || (status === 'live' && inning >= config.scheduledInnings && isBottom)) &&
    isBottom && 
    homeScore > awayScore;

  return {
    home: isWalkOff ? `${homeScore}x` : `${homeScore}`,
    away: `${awayScore}`
  };
}

/**
 * 💡 実戦用 LINE レポート生成（アップグレード版）
 */
export function formatMatchLineReport(
  homeTeamName: string,
  awayTeamName: string,
  scores: { home: number; away: number },
  inningDetail: { number: number; isBottom: boolean }, // 例: { number: 9, isBottom: true }
  action: string,
  status: 'live' | 'finished'
): string {
  // 🌟 自動でサヨナラ判定を実行
  const scoreStr = formatScoreWithX(
    scores.home,
    scores.away,
    inningDetail.number,
    inningDetail.isBottom,
    status
  );
  
  const title = status === 'finished' ? "【iScoreCloud 試合終了】" : "【iScoreCloud 速報】";
  const emoji = status === 'finished' ? "⏹️" : "⚾️";
  const inningText = `${inningDetail.number}回${inningDetail.isBottom ? '裏' : '表'}`;

  return (
    `${title}\n` +
    `${emoji} ${homeTeamName} ${scoreStr.home} - ${scoreStr.away} ${awayTeamName}\n` +
    `------------------\n` +
    `状況: ${inningText}\n` +
    `${action}\n\n` +
    `#iScoreCloud #Matches`
  );
}

/**
 * 💡 LINE レポート生成用（簡易文字列インプット版、URIエンコード済み）
 */
export function formatMatchLineLog(
  homeTeamName: string,
  awayTeamName: string,
  scores: { home: number; away: number },
  inning: string,
  action: string,
  isWalkOff: boolean = false
): string {
  const homeScoreStr = isWalkOff ? `${scores.home}x` : `${scores.home}`;
  const awayScoreStr = `${scores.away}`;
  const isFinished = action.includes("試合終了") || inning.includes("試合終了");
  const title = isFinished ? "【iScoreCloud 試合終了】" : "【iScoreCloud 速報】";
  const emoji = isFinished ? "⏹️" : "⚾️";

  return encodeURIComponent(
    `${title}\n` +
    `${emoji} ${homeTeamName} ${homeScoreStr} - ${awayScoreStr} ${awayTeamName}\n` +
    `------------------\n` +
    `状況: ${inning}\n` +
    `${action}\n\n` +
    `#iScoreCloud #Matches`
  );
}
