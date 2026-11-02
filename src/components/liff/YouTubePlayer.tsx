// filepath: src/components/liff/YouTubePlayer.tsx
"use client";

import React, { useState, useEffect } from "react";
import { getYouTubeEmbedUrl, extractYouTubeVideoId, getYouTubeThumbnailUrl } from "@/lib/youtube";
import { Play, ExternalLink, VideoOff } from "lucide-react";

interface YouTubePlayerProps {
  url?: string | null;
  title?: string;
  className?: string;
  autoplay?: boolean;
}

export function YouTubePlayer({
  url,
  title = "試合動画",
  className = "",
  autoplay = false,
}: YouTubePlayerProps) {
  const videoId = extractYouTubeVideoId(url);
  const [isActivated, setIsActivated] = useState<boolean>(autoplay);

  // URLが別試合に切り替わった場合はファサード状態へリセットし、不要なiframe描画を防ぐ
  useEffect(() => {
    setIsActivated(autoplay);
  }, [url, autoplay]);

  const embedUrl = getYouTubeEmbedUrl(url, { autoplay: isActivated ? true : autoplay });
  const thumbnailUrl = getYouTubeThumbnailUrl(url, "hq");

  if (!videoId || !embedUrl) {
    return (
      <div className={`relative w-full aspect-video bg-card rounded-2xl flex flex-col items-center justify-center border border-border shadow-xs p-6 text-center text-muted-foreground ${className}`}>
        <VideoOff className="w-10 h-10 mb-2 text-primary/40" />
        <p className="text-sm font-semibold">動画は登録されていません</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          YouTubeの限定公開URLが設定されるとここに表示されます
        </p>
      </div>
    );
  }

  const directWatchUrl = `https://www.youtube.com/watch?v=${videoId}`;

  return (
    <div className={`flex flex-col gap-2 w-full ${className}`}>
      {/* 16:9 レスポンシブ動画プレイヤー（初回は超軽量サムネイルファサードを表示し、タップ時にのみYouTube iframeをロード） */}
      <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-[#0f172a] shadow-xs border border-border">
        {isActivated ? (
          <iframe
            src={embedUrl}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="absolute top-0 left-0 w-full h-full border-0"
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsActivated(true)}
            aria-label={`${title}を再生`}
            className="group relative w-full h-full block text-left cursor-pointer focus:outline-none"
          >
            {thumbnailUrl && (
              <img
                src={thumbnailUrl}
                alt={title}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              />
            )}
            {/* ソリッド暗幕（グラデーション不使用） */}
            <div className="absolute inset-0 bg-slate-950/35 group-hover:bg-slate-950/45 transition-colors flex items-center justify-center">
              <div className="w-15 h-15 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg border-2 border-white/90 group-hover:scale-105 active:scale-95 transition-transform">
                <Play className="w-7 h-7 fill-current ml-0.5" />
              </div>
            </div>
            <div className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-[#0f172a] text-white border border-slate-700 text-[11px] font-black flex items-center gap-1.5 shadow-sm">
              <Play className="w-3 h-3 text-primary fill-primary shrink-0" />
              <span>タップして動画を再生</span>
            </div>
          </button>
        )}
      </div>

      {/* 動画アクション（YouTubeアプリで開く） */}
      <div className="flex items-center justify-between gap-2 px-1 text-xs">
        <span className="flex items-center gap-1 text-muted-foreground font-bold truncate">
          <Play className="w-3.5 h-3.5 text-primary fill-primary shrink-0" />
          <span className="truncate">{title}</span>
        </span>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href={directWatchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-black transition-colors shadow-xs"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>YouTubeで開く</span>
          </a>
        </div>
      </div>
    </div>
  );
}
