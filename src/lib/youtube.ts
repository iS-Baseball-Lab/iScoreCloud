// filepath: src/lib/youtube.ts

/**
 * 各種YouTube URLから動画ID（Video ID）を抽出する
 * 
 * 対応フォーマット:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://youtube.com/shorts/VIDEO_ID
 * - タイムスタンプパラメータ（?t=120, &t=1m20s 等）
 */
export function extractYouTubeVideoId(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;

  const trimmed = url.trim();
  if (!trimmed) return null;

  // youtu.be/VIDEO_ID
  const shortMatch = trimmed.match(/(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch && shortMatch[1]) {
    return shortMatch[1];
  }

  // youtube.com/watch?v=VIDEO_ID
  const watchMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch && watchMatch[1]) {
    return watchMatch[1];
  }

  // youtube.com/embed/VIDEO_ID
  const embedMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch && embedMatch[1]) {
    return embedMatch[1];
  }

  // youtube.com/shorts/VIDEO_ID
  const shortsMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch && shortsMatch[1]) {
    return shortsMatch[1];
  }

  // 単体の11文字IDが直接渡された場合
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * YouTubeの埋め込みプレイヤーURL（iframe src）を生成する
 */
export function getYouTubeEmbedUrl(urlOrId: string | null | undefined, options?: { autoplay?: boolean; start?: number }): string | null {
  const videoId = extractYouTubeVideoId(urlOrId);
  if (!videoId) return null;

  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    playsinline: '1', // iOS / LINE内ブラウザでインライン再生させる
  });

  if (options?.autoplay) {
    params.set('autoplay', '1');
  }

  if (options?.start && options.start > 0) {
    params.set('start', String(Math.floor(options.start)));
  }

  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

/**
 * YouTubeのサムネイル画像URLを取得する
 */
export function getYouTubeThumbnailUrl(urlOrId: string | null | undefined, quality: 'default' | 'hq' | 'maxres' = 'hq'): string | null {
  const videoId = extractYouTubeVideoId(urlOrId);
  if (!videoId) return null;

  switch (quality) {
    case 'maxres':
      return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    case 'default':
      return `https://img.youtube.com/vi/${videoId}/default.jpg`;
    case 'hq':
    default:
      return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  }
}
