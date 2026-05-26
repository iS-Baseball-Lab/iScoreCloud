// filepath: src/components/matches/PlayLogCard.tsx
"use client";

import React, { useState, useRef } from "react";
import { Edit2, Trash2, ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PlayLog {
  id: string;
  gameId: string;
  gameTitle: string;
  inning: number;
  topBottom: "top" | "bottom";
  batterName: string;
  pitcherName: string;
  balls: number;
  strikes: number;
  outs: number;
  result: string;
  description: string;
  createdAt: string;
}

interface PlayLogCardProps {
  log: PlayLog;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function PlayLogCard({ log, onEdit, onDelete }: PlayLogCardProps) {
  // ━━ 展開状態の管理 ━━
  const [isExpanded, setIsExpanded] = useState(false);

  // ━━ スワイプ操作の状態管理 ━━
  const [offsetX, setOffsetX] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const startOffsetX = useRef<number>(0);
  const isVerticalScroll = useRef(false);

  const ACTION_WIDTH = 75;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    startOffsetX.current = offsetX;
    isVerticalScroll.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null || isVerticalScroll.current) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - touchStartX.current;
    const diffY = currentY - touchStartY.current;

    // 💡 Smart Swipe Control: 縦スクロール判定時はスワイプを無効化して縦移動を優先
    if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 5) {
      isVerticalScroll.current = true;
      setOffsetX(0);
      return;
    }

    // 展開中は横スワイプを無効化
    if (isExpanded) {
      return;
    }

    let newOffsetX = startOffsetX.current + diffX;
    // 右スワイプ（プラス方向）は 0 で止める（左スワイプのみアクションを表示）
    if (newOffsetX > 0) newOffsetX = 0;
    // 左スワイプはアクション幅の2倍まで引っ張れるようにし、アクション表示幅（アクション幅×2）でロック
    const maxPull = -(ACTION_WIDTH * 2);
    if (newOffsetX < maxPull) newOffsetX = maxPull;

    setOffsetX(newOffsetX);
  };

  const handleTouchEnd = () => {
    touchStartX.current = null;
    touchStartY.current = null;

    const targetWidth = ACTION_WIDTH * 2; // 編集と削除の2つのボタン分
    if (offsetX < -targetWidth / 2) {
      setOffsetX(-targetWidth);
    } else {
      setOffsetX(0);
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (offsetX !== 0) {
      e.preventDefault();
      e.stopPropagation();
      setOffsetX(0);
      return;
    }
    setIsExpanded(!isExpanded);
  };

  return (
    // 💡 外側ラッパーによる角丸くり抜き (Outer Masking)
    <div className={cn(
      "group relative overflow-hidden transition-all duration-200 ease-out",
      "rounded-[var(--radius-2xl)] border bg-card",
      isExpanded ? "border-primary/40 shadow-sm shadow-primary/5" : "border-border/50 shadow-sm"
    )}>
      
      {/* ━━ 背面アクションボタン (Opacity Controlによる透け防止) ━━ */}
      <div className={cn(
        "absolute inset-0 z-0 transition-opacity duration-150 bg-transparent flex justify-end",
        (offsetX !== 0) ? "opacity-100" : "opacity-0 pointer-events-none"
      )}>
        {/* 編集ボタン */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(log.id);
            setOffsetX(0);
          }}
          className="h-full w-[75px] flex flex-col items-center justify-center gap-1 bg-blue-500 text-white active:bg-blue-600 transition-colors"
        >
          <Edit2 className="h-4 w-4" strokeWidth={2.5} />
          <span className="text-[10px] font-black uppercase tracking-wider">編集</span>
        </button>

        {/* 削除ボタン */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(log.id);
            setOffsetX(0);
          }}
          className="h-full w-[75px] flex flex-col items-center justify-center gap-1 bg-rose-500 text-white active:bg-rose-600 transition-colors"
        >
          <Trash2 className="h-4 w-4" strokeWidth={2.5} />
          <span className="text-[10px] font-black uppercase tracking-wider">削除</span>
        </button>
      </div>

      {/* ━━ 前面カード本体 ━━ */}
      <div
        style={{ transform: `translateX(${offsetX}px)`, touchAction: "pan-y" }}
        className={cn(
          "relative z-10 flex flex-col h-full transition-transform duration-200 ease-out",
          isExpanded ? "bg-primary/5 dark:bg-primary/10" : "bg-card"
        )}
      >
        {/* カードメイン領域（タップ・スワイプ領域） */}
        <div
          className="p-4 cursor-pointer"
          onClick={handleCardClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* 上部ヘッダー（イニング、試合名、日付） */}
          <div className="flex justify-between items-start mb-2 pointer-events-none">
            <div className="flex items-center gap-2">
              <span className="bg-foreground text-background font-black text-xs px-2 py-0.5 rounded-[var(--radius-sm)]">
                {log.inning}回{log.topBottom === "top" ? "表" : "裏"}
              </span>
              <span className="text-xs font-black text-muted-foreground">{log.gameTitle}</span>
            </div>
            <span className="text-[10px] text-muted-foreground font-bold font-mono">{log.createdAt}</span>
          </div>

          {/* 対戦内容と結果 */}
          <div className="flex justify-between items-center my-3 pointer-events-none">
            <div>
              <div className="text-[10px] font-bold text-muted-foreground/80">投手: {log.pitcherName} vs</div>
              <div className="text-base font-black text-foreground">{log.batterName}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold text-muted-foreground/80">打席結果</div>
              <div className="text-base font-black text-primary">{log.result}</div>
            </div>
          </div>

          {/* BSO・フラット表示 & 展開インジケーター */}
          <div className="flex items-center justify-between mt-3 gap-4">
            <div className="flex items-center gap-4 bg-muted/60 dark:bg-zinc-800/40 p-2 rounded-xl border border-border/40 pointer-events-none">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-black w-3 text-yellow-500">B</span>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className={cn("w-2 h-2 rounded-full", i < log.balls ? "bg-yellow-500" : "bg-neutral-300 dark:bg-neutral-700")} />
                ))}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-black w-3 text-red-500">S</span>
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className={cn("w-2 h-2 rounded-full", i < log.strikes ? "bg-red-500" : "bg-neutral-300 dark:bg-neutral-700")} />
                ))}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-black w-3 text-blue-500">O</span>
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className={cn("w-2 h-2 rounded-full", i < log.outs ? "bg-blue-500" : "bg-neutral-300 dark:bg-neutral-700")} />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-center shrink-0 text-muted-foreground/60 transition-transform">
              {isExpanded ? (
                <ChevronUp className="h-5 w-5 text-primary animate-pulse" strokeWidth={2.5} />
              ) : (
                <ChevronDown className="h-5 w-5" strokeWidth={2} />
              )}
            </div>
          </div>
        </div>

        {/* ━━ 💡 展開時の詳細情報エリア (背景をシームレス化) ━━ */}
        {isExpanded && (
          <div className="border-t border-border/40 bg-transparent">
            <div className="p-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="rounded-xl bg-background/60 dark:bg-zinc-950/40 border border-dashed border-primary/20 p-4">
                <div className="flex items-center gap-2 mb-2 text-primary">
                  <MessageSquare className="h-4 w-4" />
                  <span className="text-xs font-black uppercase tracking-wider">打席メモ・詳細説明</span>
                </div>
                <p className="text-sm font-bold text-foreground/80 leading-relaxed whitespace-pre-wrap">
                  {log.description || "詳細なメモはありません。"}
                </p>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
