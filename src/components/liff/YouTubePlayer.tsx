// filepath: src/components/liff/YouTubePlayer.tsx
"use client";

import React from "react";
import { getYouTubeEmbedUrl, extractYouTubeVideoId } from "@/lib/youtube";
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
  const embedUrl = getYouTubeEmbedUrl(url, { autoplay });

  if (!videoId || !embedUrl) {
    return (
      <div className={`relative w-full aspect-video bg-muted/80 rounded-2xl flex flex-col items-center justify-center border border-border p-6 text-center text-muted-foreground ${className}`}>
        <VideoOff className="w-10 h-10 mb-2 opacity-50" />
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
      {/* 16:9 レスポンシブ動画プレイヤー */}
      <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-md border border-border">
        <iframe
          src={embedUrl}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute top-0 left-0 w-full h-full border-0"
        />
      </div>

      {/* 動画アクション（YouTubeアプリで開く） */}
      <div className="flex items-center justify-between gap-2 px-1 text-xs">
        <span className="flex items-center gap-1 text-muted-foreground font-medium truncate">
          <Play className="w-3.5 h-3.5 text-red-500 fill-red-500 shrink-0" />
          <span className="truncate">{title}</span>
        </span>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href={directWatchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-black transition-colors shadow-sm"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>YouTubeで開く</span>
          </a>
        </div>
      </div>
    </div>
  );
}
