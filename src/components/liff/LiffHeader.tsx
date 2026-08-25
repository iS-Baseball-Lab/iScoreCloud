// filepath: src/components/liff/LiffHeader.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Share2, Users } from "lucide-react";
import { useLiff } from "./LiffProvider";
import { shareTargetPicker } from "@/lib/liff/liff-client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface LiffHeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  rightElement?: React.ReactNode;
  shareData?: {
    title: string;
    text: string;
    url?: string;
  };
}

export function LiffHeader({
  title = "チーム",
  subtitle = "チームHUB",
  showBack = false,
  rightElement,
  shareData,
}: LiffHeaderProps) {
  const router = useRouter();
  const { isInClient } = useLiff();

  const handleShare = async () => {
    if (!shareData) return;

    if (isInClient) {
      const messages = [
        {
          type: "text",
          text: `⚾ ${shareData.title}\n${shareData.text}${shareData.url ? `\n\n👉 試合動画・予定の確認はこちら:\n${shareData.url}` : ""}`,
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
    <header className="sticky top-0 z-40 w-full bg-white/95 dark:bg-background/90 backdrop-blur-xl border-b border-border/40 transition-colors duration-200">
      <div className="flex h-14 sm:h-16 items-center justify-between px-3 sm:px-6 gap-2">
        {/* 🌟 左側: ロゴ & ブランド or 戻るボタン */}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          {showBack ? (
            <button
              type="button"
              onClick={() => router.back()}
              className="p-1.5 rounded-xl bg-card border border-border text-foreground hover:bg-muted active:scale-95 transition-all shadow-xs"
              aria-label="戻る"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : (
            <Link
              href="/liff"
              className="flex items-center gap-2 shrink-0 group outline-hidden"
              title="チームHUBトップ"
            >
              <img
                src="/logo.webp"
                alt="iScore Logo"
                className="h-8 w-8 object-contain group-hover:scale-105 transition-transform duration-300"
              />
              <div className="flex items-center gap-1.5">
                <span className="text-base sm:text-lg font-black italic tracking-tighter text-foreground leading-none">
                  iScore<span className="text-primary">Cloud</span>
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-black text-[9px] uppercase tracking-wider border border-primary/20">
                  HUB
                </span>
              </div>
            </Link>
          )}
        </div>

        {/* 🌟 右側: iScoreCloudスタイルのチームバッジ & コントロール */}
        <div className="flex items-center gap-2 min-w-0 justify-end flex-1">
          {/* チーム表示バッジ（本家 TeamSwitcher 風デザイン） */}
          <div
            className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-primary/10 backdrop-blur-md border border-primary/40 text-foreground shadow-xs min-w-0 max-w-[160px] sm:max-w-[220px]"
            title={title}
          >
            <Avatar className="h-6 w-6 border border-primary/30 bg-background shrink-0 overflow-hidden">
              <AvatarFallback className="w-full h-full flex items-center justify-center text-primary font-black text-[10px] whitespace-nowrap leading-none tracking-tighter select-none bg-background">
                {(title || "T").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col justify-center overflow-hidden min-w-0 flex-1">
              <span className="text-[11px] sm:text-xs font-black tracking-tight text-foreground truncate leading-tight">
                {title}
              </span>
              <span className="text-[8px] sm:text-[9px] font-bold text-muted-foreground uppercase truncate leading-none mt-0.5">
                {subtitle}
              </span>
            </div>
          </div>

          {/* 右側要素（選手/保護者切替スイッチ等） */}
          {rightElement && (
            <div className="shrink-0">
              {rightElement}
            </div>
          )}

          {/* LINEシェアボタン */}
          {shareData && (
            <button
              type="button"
              onClick={handleShare}
              className="p-2 rounded-xl bg-card border border-border text-foreground hover:bg-muted active:scale-95 transition-all shadow-xs shrink-0"
              aria-label="LINEで共有"
              title="LINEで共有"
            >
              <Share2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </button>
          )}
        </div>
      </div>

      {/* 🌟 iScoreCloud シグネチャーのグラデーションライン */}
      <div className="h-[1.5px] w-full bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
    </header>
  );
}
