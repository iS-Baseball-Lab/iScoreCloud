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
  resultType: string;
  description: string;
  createdAt: string;
  validationMessage?: string | null;
  hasBso: boolean;
}

export function parseD1PlayLog(
  d1Log: {
    id: string;
    description: string;
    resultType?: string;
    inning: number;
    isTop: boolean;
    timestamp: number;
    validationMessage?: string | null;
  },
  gameTitle: string
): PlayLog {
  const desc = d1Log.description || "";
  
  const bsoMatch = desc.match(/\s\[B:(\d+),\s*S:(\d+),\s*O:(\d+)\]$/);
  let balls = 0;
  let strikes = 0;
  let outs = 0;
  let cleanDesc = desc;
  let hasBso = false;
  if (bsoMatch) {
    balls = parseInt(bsoMatch[1], 10);
    strikes = parseInt(bsoMatch[2], 10);
    outs = parseInt(bsoMatch[3], 10);
    cleanDesc = desc.replace(/\s\[B:\d+,\s*S:\d+,\s*O:\d+\]$/, "");
    hasBso = true;
  }

  const batterMatch = cleanDesc.match(/^(\d+)番\s*([^:]+):\s*(.*)$/);
  
  let batterName = "打者";
  let result = "打席完了";
  let detailDesc = cleanDesc;

  if (batterMatch) {
    const order = batterMatch[1];
    const name = batterMatch[2];
    const playResult = batterMatch[3];
    batterName = `${order}番 ${name}`;
    result = playResult;
    detailDesc = playResult;
  } else if (cleanDesc.startsWith("選手交代")) {
    batterName = "選手交代";
    result = "交代";
    detailDesc = cleanDesc;
  } else if (cleanDesc === "試合終了") {
    batterName = "試合終了";
    result = "ゲームセット";
    detailDesc = cleanDesc;
  }

  const dateObj = new Date(d1Log.timestamp);
  const formattedDate = isNaN(dateObj.getTime())
    ? ""
    : `${String(dateObj.getHours()).padStart(2, "0")}:${String(dateObj.getMinutes()).padStart(2, "0")}`;

  return {
    id: d1Log.id,
    gameId: "",
    gameTitle: gameTitle,
    inning: d1Log.inning,
    topBottom: d1Log.isTop ? "top" : "bottom",
    batterName: batterName,
    pitcherName: "投手",
    balls: balls,
    strikes: strikes,
    outs: outs,
    result: result,
    resultType: d1Log.resultType || "out",
    description: detailDesc,
    createdAt: formattedDate,
    validationMessage: d1Log.validationMessage,
    hasBso,
  };
}

interface PlayLogCardProps {
  log: PlayLog;
  isLast?: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onResolve?: (id: string) => void;
}

export function PlayLogCard({ log, isLast = false, onEdit, onDelete, onResolve }: PlayLogCardProps) {
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

    if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 5) {
      isVerticalScroll.current = true;
      setOffsetX(0);
      return;
    }

    if (isExpanded) {
      return;
    }

    let newOffsetX = startOffsetX.current + diffX;
    if (newOffsetX > 0) newOffsetX = 0;
    const maxPull = -(ACTION_WIDTH * 2);
    if (newOffsetX < maxPull) newOffsetX = maxPull;

    setOffsetX(newOffsetX);
  };

  const handleTouchEnd = () => {
    touchStartX.current = null;
    touchStartY.current = null;

    const targetWidth = ACTION_WIDTH * 2;
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

  const getDotColorClass = (type: string) => {
    switch (type) {
      case 'hit': return "bg-primary border-background ring-primary/30";
      case 'score': return "bg-amber-500 border-background ring-amber-500/30";
      case 'out': return "bg-muted-foreground/30 border-background ring-muted/30";
      case 'sub': return "bg-blue-400 border-background ring-blue-400/30";
      default: return "bg-muted-foreground/30 border-background";
    }
  };

  return (
    <div className="relative pl-12 sm:pl-16 py-1 group/timeline">
      {/* タイムラインの縦線（背骨） */}
      {!isLast && (
        <div className="absolute left-[24px] sm:left-[32px] top-8 bottom-[-16px] w-0.5 bg-border/40 group-hover/timeline:bg-primary/20 transition-colors z-0" />
      )}
      
      {/* タイムラインのドット（結果インジケーター） */}
      <div className={cn(
        "absolute left-[18px] sm:left-[26px] top-5 w-[14px] h-[14px] rounded-full border-2 shadow-sm z-10 transition-transform group-hover/timeline:scale-125 ring-2",
        getDotColorClass(log.resultType)
      )} />

      {/* 💡 外側ラッパーによる角丸くり抜き (Outer Masking) */}
      <div className={cn(
        "group relative overflow-hidden transition-all duration-200 ease-out",
        "rounded-2xl border",
        isExpanded ? "border-primary/30 bg-primary/[0.02] shadow-sm" : "border-border/30 bg-card/60 backdrop-blur-sm shadow-sm hover:border-border/60 hover:bg-card/80"
      )}>
        
        {/* ━━ 背面アクションボタン ━━ */}
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
          className="relative z-10 flex flex-col h-full transition-transform duration-200 ease-out bg-inherit"
        >
          {/* カードメイン領域（タップ・スワイプ領域） */}
          <div
            className="p-3 sm:p-4 cursor-pointer"
            onClick={handleCardClick}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="flex justify-between items-start pointer-events-none">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0 shadow-sm">
                  <span className="text-primary font-black text-sm">{log.batterName.charAt(0) || "-"}</span>
                </div>
                <div>
                  <div className="text-[15px] font-black text-foreground leading-tight tracking-tight">
                    {log.batterName.replace(/番\s*/, '番 ')}
                  </div>
                  {log.pitcherName !== "投手" && (
                    <div className="text-[10px] font-bold text-muted-foreground/80 mt-0.5">vs {log.pitcherName}</div>
                  )}
                </div>
              </div>
              <div className="text-right flex flex-col items-end justify-between min-h-[2.5rem]">
                <div className={cn(
                  "text-xs font-black px-2.5 py-1 rounded-md shadow-sm border",
                  log.resultType === 'hit' ? 'bg-primary/10 text-primary border-primary/20' : 
                  log.resultType === 'score' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' :
                  'bg-muted/50 text-muted-foreground border-transparent'
                )}>
                  {log.result}
                </div>
                <div className="text-[9px] text-muted-foreground/50 font-mono mt-1">{log.createdAt}</div>
              </div>
            </div>

            {/* BSO・フラット表示 & 展開インジケーター */}
            <div className={cn("flex items-center mt-3 pt-1", log.hasBso ? "justify-between" : "justify-end")}>
              {log.hasBso && (
                <div className="flex items-center gap-2.5 bg-muted/30 dark:bg-zinc-800/20 px-2.5 py-1 rounded border border-border/20 pointer-events-none">
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] font-black w-2 text-yellow-500">B</span>
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className={cn("w-1.5 h-1.5 rounded-full", i < log.balls ? "bg-yellow-500" : "bg-neutral-200 dark:bg-neutral-700")} />
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] font-black w-2 text-red-500">S</span>
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className={cn("w-1.5 h-1.5 rounded-full", i < log.strikes ? "bg-red-500 shadow-[0_0_2px_rgba(239,68,68,0.5)]" : "bg-neutral-200 dark:bg-neutral-700")} />
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] font-black w-2 text-blue-500">O</span>
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className={cn("w-1.5 h-1.5 rounded-full", i < log.outs ? "bg-blue-500" : "bg-neutral-200 dark:bg-neutral-700")} />
                    ))}
                  </div>
                </div>
              )}
              
              <div className="flex items-center justify-center shrink-0 text-muted-foreground/40 transition-transform">
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-primary animate-pulse" strokeWidth={2.5} />
                ) : (
                  <ChevronDown className="h-4 w-4" strokeWidth={2} />
                )}
              </div>
            </div>
          </div>

          {/* 🌟 バリデーションエラーがある場合の表示 */}
          {log.validationMessage && (
            <div className="bg-destructive/5 border-t border-destructive/10 p-3 flex flex-col gap-2">
              <div className="flex items-start gap-2 text-destructive">
                <MessageSquare className="w-4 h-4 mt-0.5 shrink-0" />
                <p className="text-xs font-bold leading-snug">
                  {(() => {
                    try {
                      const parsed = JSON.parse(log.validationMessage);
                      return parsed.message || log.validationMessage;
                    } catch {
                      return log.validationMessage;
                    }
                  })()}
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onResolve?.(log.id);
                  }}
                  className="px-3 py-1.5 bg-destructive text-destructive-foreground text-[10px] font-black rounded-lg shadow-sm active:scale-95 transition-transform"
                >
                  問題なし
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(log.id);
                  }}
                  className="px-3 py-1.5 bg-primary/10 text-primary text-[10px] font-black rounded-lg active:scale-95 transition-transform"
                >
                  編集して修正
                </button>
              </div>
            </div>
          )}

          {/* ━━ 展開時の詳細情報エリア ━━ */}
          {isExpanded && (
            <div className="border-t border-border/30 bg-transparent">
              <div className="p-3 sm:p-4 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="rounded-xl bg-background/50 dark:bg-zinc-950/30 border border-dashed border-primary/20 p-3 sm:p-4">
                  <div className="flex items-center gap-2 mb-2 text-primary/80">
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-black uppercase tracking-widest">打席メモ・詳細説明</span>
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-foreground/80 leading-relaxed whitespace-pre-wrap">
                    {log.description || "詳細なメモはありません。"}
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

