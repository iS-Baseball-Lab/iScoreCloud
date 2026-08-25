// filepath: src/components/liff/LiffPageHeader.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Share2 } from "lucide-react";
import { useLiff } from "./LiffProvider";
import { shareTargetPicker } from "@/lib/liff/liff-client";

interface LiffPageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  showBack?: boolean;
  rightElement?: React.ReactNode;
  shareData?: {
    title: string;
    text: string;
    url?: string;
  };
}

export function LiffPageHeader({
  title,
  subtitle,
  icon,
  showBack = true,
  rightElement,
  shareData,
}: LiffPageHeaderProps) {
  const router = useRouter();
  const { isInClient } = useLiff();

  const handleShare = async () => {
    if (!shareData) return;

    if (isInClient) {
      const messages = [
        {
          type: "text",
          text: `⚾ ${shareData.title}\n${shareData.text}${shareData.url ? `\n\n👉 詳細はこちら:\n${shareData.url}` : ""}`,
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
    <div className="flex items-center justify-between gap-3 pb-2 border-b border-border/40">
      <div className="flex items-center gap-2 min-w-0">
        {showBack && (
          <button
            type="button"
            onClick={() => router.back()}
            className="p-2 -ml-1 rounded-2xl bg-card border border-border text-foreground hover:bg-muted active:scale-95 transition-all shadow-xs shrink-0"
            aria-label="戻る"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        <div className="flex items-center gap-2 min-w-0">
          {icon && <div className="shrink-0">{icon}</div>}
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-black tracking-tight text-foreground truncate">
              {title}
            </h1>
            {subtitle && (
              <p className="text-[11px] font-bold text-muted-foreground truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {rightElement}
        {shareData && (
          <button
            type="button"
            onClick={handleShare}
            className="p-2 rounded-2xl bg-card border border-border text-foreground hover:bg-muted active:scale-95 transition-all shadow-xs"
            aria-label="LINEで共有"
            title="LINEで共有"
          >
            <Share2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </button>
        )}
      </div>
    </div>
  );
}
