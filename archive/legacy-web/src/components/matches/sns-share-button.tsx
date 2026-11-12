// filepath: src/components/matches/sns-share-button.tsx
/* 💡 iScoreCloud 規約: 現場視認性向上のためソリッドなLINEカラーを採用。
   Web Share API を優先し、直接投稿を実現。 */
"use client";

import React from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMatchLineLog } from "@/lib/utils/format-sns";
import { cn } from "@/lib/utils";

interface SnsShareButtonProps {
  homeTeamName: string;
  awayTeamName: string;
  scores: { home: number; away: number };
  inning: string;
  lastAction: string;
  isWalkOff?: boolean;
  className?: string;
}

export function SnsShareButton({
  homeTeamName,
  awayTeamName,
  scores,
  inning,
  lastAction,
  isWalkOff = false,
  className,
}: SnsShareButtonProps) {
  
  const handleLineShare = () => {
    const message = formatMatchLineLog(
      homeTeamName,
      awayTeamName,
      scores,
      inning,
      lastAction,
      isWalkOff
    );
    
    // 💡 LINEアプリを直接呼び出すURLスキーム
    const lineUrl = `https://line.me/R/msg/text/?${message}`;

    if (navigator.share) {
      // 📱 モバイル端末のネイティブ共有を優先
      navigator.share({
        title: "iScoreCloud Match速報",
        text: decodeURIComponent(message),
      }).catch((err: unknown) => {
        if ((err as Error).name !== 'AbortError') {
          window.open(lineUrl, "_blank");
        }
      });
    } else {
      // 💻 PCや非対応環境では直接LINEを開く
      window.open(lineUrl, "_blank");
    }
  };

  return (
    <Button
      onClick={handleLineShare}
      className={cn(
        "w-full h-14 rounded-[20px] bg-[#06C755] hover:bg-[#05b34c] text-white font-black italic gap-3 shadow-lg shadow-green-500/20 active:scale-95 transition-all",
        className
      )}
    >
      {/* 💡 ログインページと同じLINEブランドアイコン（SVGまたはLucide） */}
      <MessageCircle className="w-6 h-6 fill-white" />
      LINEで直接速報を投稿
    </Button>
  );
}
