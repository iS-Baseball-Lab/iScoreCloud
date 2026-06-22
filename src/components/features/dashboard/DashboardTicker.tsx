// filepath: src/components/features/dashboard/DashboardTicker.tsx
"use client";

import React from "react";
import { Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardTickerProps {
  messages: string[];
  className?: string;
}

export function DashboardTicker({ messages, className }: DashboardTickerProps) {
  if (!messages || messages.length === 0) return null;

  // メッセージ同士を繋ぐセパレーター（電光掲示板風のスペース）
  const separator = "　　⚡　　";
  // すべてのメッセージを結合して、スクロールするテキストを作る
  const joinedText = messages.join(separator);

  // 無限スクロールのためのCSSキーフレーム
  const keyframes = `
    @keyframes marquee-scroll {
      0% { transform: translateX(0); }
      100% { transform: translateX(-50%); }
    }
    .animate-marquee-infinite {
      display: flex;
      width: max-content;
      animation: marquee-scroll 45s linear infinite;
    }
    .animate-marquee-infinite:hover {
      animation-play-state: paused;
    }
  `;

  return (
    <div
      className={cn(
        "relative w-full h-11 border-b border-border/40 bg-zinc-50/80 dark:bg-zinc-950/80 backdrop-blur-md overflow-hidden flex items-center select-none shadow-xs group",
        className
      )}
    >
      {/* CSSのキーフレームを動的挿入 */}
      <style dangerouslySetInnerHTML={{ __html: keyframes }} />

      {/* 左端固定：ニュースヘッダーバッジ（電光掲示板の案内灯イメージ） */}
      <div className="z-20 h-full flex items-center gap-2 px-4 bg-primary text-primary-foreground font-black text-xs tracking-wider uppercase shadow-[6px_0_12px_rgba(0,0,0,0.15)] border-r border-primary/20 shrink-0">
        <Megaphone className="h-3.5 w-3.5 animate-pulse" />
        <span>NEWS</span>
      </div>

      {/* 流れるコンテンツエリア */}
      <div className="relative flex-1 overflow-hidden h-full flex items-center">
        {/*
          無限スクロールを実現するために、全く同じテキストの塊を2つ並べて、
          全体幅の50%（つまり1塊分）左にスクロールした時点でリセットしてループさせる
        */}
        <div className="animate-marquee-infinite whitespace-nowrap text-xs sm:text-sm font-bold text-foreground/90 dark:text-zinc-200">
          {/* 1塊目 */}
          <div className="px-6 flex items-center">
            <span>{joinedText}</span>
            <span className="opacity-40">{separator}</span>
          </div>
          {/* 2塊目 (ループ接続用) */}
          <div className="px-6 flex items-center" aria-hidden="true">
            <span>{joinedText}</span>
            <span className="opacity-40">{separator}</span>
          </div>
        </div>

        {/* 左右のフェードマスク効果（文字が端でふわっと消えるプレミアムなグラデーション） */}
        <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-zinc-50/80 to-transparent dark:from-zinc-950/80 pointer-events-none z-10" />
        <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-zinc-50/80 to-transparent dark:from-zinc-950/80 pointer-events-none z-10" />
      </div>
    </div>
  );
}
