// filepath: src/components/liff/LiffHeader.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Share2, Sparkles } from "lucide-react";
import { useLiff } from "./LiffProvider";
import { shareTargetPicker } from "@/lib/liff/liff-client";

interface LiffHeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  shareData?: {
    title: string;
    text: string;
    url?: string;
  };
}

export function LiffHeader({
  title = "i-Score Mini",
  subtitle,
  showBack = false,
  shareData,
}: LiffHeaderProps) {
  const router = useRouter();
  const { profile, isInClient } = useLiff();

  const handleShare = async () => {
    if (!shareData) return;

    if (isInClient) {
      const messages = [
        {
          type: "text",
          text: `⚾ ${shareData.title}\n${shareData.text}${shareData.url ? `\n\n👉 試合動画・スコアを見る:\n${shareData.url}` : ""}`,
        },
      ];
      const shared = await shareTargetPicker(messages);
      if (shared) return;
    }

    // Web Share API フォールバック
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: shareData.title,
          text: shareData.text,
          url: shareData.url || (typeof window !== "undefined" ? window.location.href : ""),
        });
      } catch {
        // ignore share cancellation
      }
    }
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-background/95 backdrop-blur border-b border-border shadow-xs">
      <div className="flex items-center gap-2 min-w-0">
        {showBack && (
          <button
            type="button"
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-xl bg-card border border-border text-foreground hover:bg-muted active:scale-95 transition-all shadow-xs"
            aria-label="戻る"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Sparkles className="w-3 h-3" />
            </span>
            <h1 className="text-base font-black tracking-tight text-foreground truncate">
              {title}
            </h1>
          </div>
          {subtitle && (
            <p className="text-[11px] font-bold text-muted-foreground truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {shareData && (
          <button
            type="button"
            onClick={handleShare}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-black transition-all shadow-xs"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>共有</span>
          </button>
        )}

        {profile && (
          <div className="flex items-center gap-1.5 pl-1">
            {profile.pictureUrl ? (
              <img
                src={profile.pictureUrl}
                alt={profile.displayName}
                className="w-7 h-7 rounded-full border border-border object-cover"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-black">
                {profile.displayName.slice(0, 1)}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
