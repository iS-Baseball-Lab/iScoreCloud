// filepath: src/components/liff/LiffPageHeader.tsx
"use client";

import React, { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { useLiff } from "./LiffProvider";
import { shareLiffPageViaLine } from "@/lib/liff/liff-client";
import { canGoBackInLiff, navigateToLiffRoot } from "@/lib/liff/navigation";

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
  const pathname = usePathname();
  const { liff, currentTeam } = useLiff();
  const [isSharing, setIsSharing] = useState(false);

  const handleShare = async () => {
    if (!shareData || isSharing) return;
    setIsSharing(true);
    try {
      const outcome = await shareLiffPageViaLine({
        title: shareData.title,
        text: shareData.text,
        url: shareData.url,
        pathname,
        teamId: currentTeam?.id || null,
        teamName: currentTeam?.orgName || currentTeam?.name || null,
        liff,
      });
      if (outcome === "shared") {
        toast.success("LINEでページを共有しました！");
      }
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-border">
      <div className="flex items-center gap-2 min-w-0">
        {showBack && (
          <button
            type="button"
            onClick={() => {
              if (canGoBackInLiff()) {
                router.back();
              } else {
                navigateToLiffRoot(router, pathname);
              }
            }}
            className="p-2 -ml-1 rounded-2xl bg-card border border-border text-foreground hover:bg-muted active:scale-95 transition-all shadow-xs shrink-0 cursor-pointer"
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
            disabled={isSharing}
            onClick={() => void handleShare()}
            className="p-2 rounded-2xl bg-card border border-border text-foreground hover:bg-muted hover:border-[#06C755]/40 active:scale-95 transition-all shadow-xs cursor-pointer disabled:opacity-60"
            aria-label="LINEで共有"
            title="LINEで送信先を選択して共有"
          >
            {isSharing ? (
              <Loader2 className="w-4 h-4 text-[#06C755] animate-spin" />
            ) : (
              <Share2 className="w-4 h-4 text-[#06C755]" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
