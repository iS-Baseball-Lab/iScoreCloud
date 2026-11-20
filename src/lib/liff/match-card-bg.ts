// filepath: src/lib/liff/match-card-bg.ts

export interface MatchCardPhotoMeltAsset {
  src: string;
  objectPosition: string;
}

/**
 * 予定の試合（scheduled / 未開始）用の固定スコアブック背景
 */
export const SCHEDULED_MATCH_PHOTO_MELT_ASSET: MatchCardPhotoMeltAsset = {
  src: "/feature-bg-scorebook.webp",
  objectPosition: "object-[center_82%]",
};

/**
 * 終了試合・進行中試合用の専用野球風景WebPプール（全5種・960×640）
 * 特定の背番号・人物・文字を含まない汎用グラウンド情景で構成
 */
export const MATCH_RESULT_PHOTO_MELT_POOL: readonly MatchCardPhotoMeltAsset[] = [
  {
    src: "/match-bg-afterglow.webp",
    objectPosition: "object-[center_48%]",
  },
  {
    src: "/match-bg-gear.webp",
    objectPosition: "object-[center_62%]",
  },
  {
    src: "/match-bg-sunset.webp",
    objectPosition: "object-[center_54%]",
  },
  {
    src: "/match-bg-mound.webp",
    objectPosition: "object-[center_68%]",
  },
  {
    src: "/match-bg-homeplate.webp",
    objectPosition: "object-[center_58%]",
  },
] as const;

/**
 * 試合IDから決定論的にプール内のインデックスを算出する（FNV-1a 32bit ＋ MurmurHash3 fmix32）
 * - 同一試合IDであれば再描画・アコーディオン開閉・画面遷移でも常に同じ画像を返す（チラつきゼロ）
 * - 連番ID（match-1, match-2 等）でも偏りなくプール全体へ分散する
 */
export function pickDeterministicMatchBgIndex(
  matchId: string,
  poolSize: number
): number {
  if (poolSize <= 1) return 0;
  const seed = matchId || "default-match";
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) % poolSize;
}

export interface ResolveMatchCardPhotoMeltParams {
  matchId: string;
  isScheduledMatch: boolean;
  isRainout: boolean;
}

/**
 * 試合カード（MatchScoreCard）の上部フォト染み込み背景を解決する（動画の有無にかかわらず統一適用）
 * - 雨天中止時は null（コンパクト表示を維持）
 * - 予定の試合（isScheduledMatch）は常に `/feature-bg-scorebook.webp` 固定
 * - 終了試合・進行中試合は 5種の専用野球風景WebPから試合ID固定ランダムで選択
 */
export function resolveMatchCardPhotoMelt({
  matchId,
  isScheduledMatch,
  isRainout,
}: ResolveMatchCardPhotoMeltParams): MatchCardPhotoMeltAsset | null {
  if (isRainout) {
    return null;
  }
  if (isScheduledMatch) {
    return SCHEDULED_MATCH_PHOTO_MELT_ASSET;
  }
  const idx = pickDeterministicMatchBgIndex(
    matchId,
    MATCH_RESULT_PHOTO_MELT_POOL.length
  );
  return MATCH_RESULT_PHOTO_MELT_POOL[idx] ?? MATCH_RESULT_PHOTO_MELT_POOL[0];
}
