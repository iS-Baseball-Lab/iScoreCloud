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
  isFirstPitch?: boolean;
  isFinalPitch?: boolean;
  pitchText?: string;
  finalResultText?: string;
  batterOrder?: string;
  batterNameClean?: string;
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

  const batterMatch = cleanDesc.match(/^(\d+)番\s*([^:]+):\s*([\s\S]*)$/);
  
  let batterName = "打者";
  let result = "打席完了";
  let detailDesc = cleanDesc;
  let pitchesDesc = "";

  if (batterMatch) {
    batterName = `${batterMatch[1]}番 ${batterMatch[2]}`;
    result = batterMatch[3].trim();
  } else if (cleanDesc.startsWith("選手交代")) {
    batterName = "選手交代";
    result = "交代";
  } else if (cleanDesc === "試合終了") {
    batterName = "試合終了";
    result = "ゲームセット";
  }

  if (result.includes("===PITCHES===")) {
    const parts = result.split("===PITCHES===");
    result = parts[0].trim();
    pitchesDesc = parts[1].trim();
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
    description: pitchesDesc,
    createdAt: formattedDate,
    validationMessage: d1Log.validationMessage,
    hasBso,
  };
}

interface PlayLogCardProps {
  log: PlayLog;
  isLast?: boolean;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
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
    
    // アクションがどちらも未設定ならスワイプを無効化
    if (!onEdit && !onDelete) return;

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
    if (log.description) {
      setIsExpanded(!isExpanded);
    }
  };

  const getDotColorClass = (type: string) => {
    switch (type) {
      case 'hit': return "bg-primary border-background ring-primary/30";
      case 'score': return "bg-amber-500 border-background ring-amber-500/30";
      case 'out': return "bg-muted-foreground/30 border-background ring-muted/30";
      case 'sub': return "bg-blue-400 border-background ring-blue-400/30";
      case 'pitch': return "bg-muted border-border ring-transparent";
      default: return "bg-muted-foreground/30 border-background";
    }
  };

  return (
    <div className="relative pl-10 sm:pl-14 group/timeline">
      {/* タイムラインの縦線（背骨） */}
      {!isLast && (
        <div className="absolute left-[20px] sm:left-[28px] top-4 bottom-[-8px] w-0.5 bg-border/30 group-hover/timeline:bg-primary/20 transition-colors z-0" />
      )}
      
      {/* タイムラインのドット（結果インジケーター） */}
      <div className={cn(
        "absolute left-[16px] sm:left-[24px] z-10 transition-transform group-hover/timeline:scale-125 rounded-full border shadow-2xs",
        log.isFirstPitch ? "top-3.5 w-2.5 h-2.5 bg-primary border-background" : "top-2.5 w-2 h-2 bg-muted-foreground/30 border-background",
        log.isFinalPitch && log.resultType === 'hit' && "bg-emerald-500 border-background ring-2 ring-emerald-500/20",
        log.isFinalPitch && log.resultType === 'score' && "bg-amber-500 border-background ring-2 ring-amber-500/20"
      )} />

      {/* 💡 打者ヘッダー (打席の初球のときのみ表示) */}
      {log.isFirstPitch && (
        <div className="flex items-center gap-2 pt-2 pb-1 mb-0.5 border-b border-border/20 text-xs font-black text-foreground">
          {log.batterOrder && (
            <span className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-black shrink-0">
              {log.batterOrder}
            </span>
          )}
          <span className="text-xs sm:text-sm font-black tracking-tight text-foreground">
            {log.batterNameClean || log.batterName}
          </span>
          {log.pitcherName && log.pitcherName !== "投手" && (
            <span className="text-[10px] font-medium text-muted-foreground/75 ml-0.5">
              (投手: {log.pitcherName})
            </span>
          )}
        </div>
      )}

      {/* 💡 外側ラッパー */}
      <div className={cn(
        "group relative overflow-hidden transition-all duration-150 ease-out border-b border-border/10 bg-transparent py-0.5",
        isExpanded && "border-primary/30 bg-primary/[0.02]"
      )}>
        
        {/* ━━ 背面アクションボタン ━━ */}
        <div className={cn(
          "absolute inset-0 z-0 transition-opacity duration-150 bg-transparent flex justify-end",
          (offsetX !== 0) ? "opacity-100" : "opacity-0 pointer-events-none"
        )}>
          {/* 編集ボタン */}
          {onEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(log.id);
                setOffsetX(0);
              }}
              className="h-full w-[65px] flex flex-col items-center justify-center gap-0.5 bg-blue-500 text-white active:bg-blue-600 transition-colors"
            >
              <Edit2 className="h-3.5 w-3.5" strokeWidth={2.5} />
              <span className="text-[9px] font-black uppercase tracking-wider">編集</span>
            </button>
          )}

          {/* 削除ボタン */}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(log.id);
                setOffsetX(0);
              }}
              className="h-full w-[65px] flex flex-col items-center justify-center gap-0.5 bg-rose-500 text-white active:bg-rose-600 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2.5} />
              <span className="text-[9px] font-black uppercase tracking-wider">削除</span>
            </button>
          )}
        </div>

        {/* ━━ 前面カード本体 ━━ */}
        <div
          style={{ transform: `translateX(${offsetX}px)`, touchAction: "pan-y" }}
          className="relative z-10 flex flex-col h-full transition-transform duration-200 ease-out bg-inherit"
        >
          {/* カードメイン領域（タップ・スワイプ領域） */}
          <div
            className="cursor-pointer py-1 px-1.5 sm:px-2"
            onClick={handleCardClick}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="flex flex-row justify-between items-center w-full pointer-events-none text-xs gap-2 py-0.5">
              {/* 左側: 投球結果テキスト ＆ 打席最終結果バッジ */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-foreground/90 text-[12px] tracking-tight">
                  {log.pitchText || log.result}
                </span>
                
                {/* 打席の最終球であれば、最終結果バッジを強調表示 */}
                {log.isFinalPitch && log.finalResultText && (
                  <span className={cn(
                    "font-black text-[10px] sm:text-[11px] px-2 py-0.5 rounded-md shadow-2xs border ml-1 shrink-0",
                    log.resultType === 'hit' ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400 font-bold' :
                    log.resultType === 'score' ? 'bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400 font-bold' :
                    'bg-muted/70 text-muted-foreground border-border/40'
                  )}>
                    {log.finalResultText}
                  </span>
                )}
              </div>

              {/* 右側: BSOカウント */}
              {log.hasBso && (
                <div className="flex items-center gap-2 bg-muted/20 px-2 py-0.5 rounded border border-border/10 shrink-0 origin-right">
                  <div className="flex items-center gap-0.5">
                    <span className="text-[9px] font-black w-2 text-emerald-500">B</span>
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className={cn("w-1.5 h-1.5 rounded-full", i < log.balls ? "bg-emerald-500 shadow-[0_0_2px_rgba(16,185,129,0.5)]" : "bg-neutral-200 dark:bg-neutral-700")} />
                    ))}
                  </div>
                  <div className="flex items-center gap-0.5">
                    <span className="text-[9px] font-black w-2 text-amber-500">S</span>
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className={cn("w-1.5 h-1.5 rounded-full", i < log.strikes ? "bg-amber-500 shadow-[0_0_2px_rgba(245,158,11,0.5)]" : "bg-neutral-200 dark:bg-neutral-700")} />
                    ))}
                  </div>
                  <div className="flex items-center gap-0.5">
                    <span className="text-[9px] font-black w-2 text-rose-500">O</span>
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className={cn("w-1.5 h-1.5 rounded-full", i < log.outs ? "bg-rose-500 shadow-[0_0_2px_rgba(244,63,94,0.5)]" : "bg-neutral-200 dark:bg-neutral-700")} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 投球履歴の表示 (展開時のみ) */}
            {isExpanded && log.description && (
              <div className="mt-4 pt-3 border-t border-border/50 animate-in slide-in-from-top-2 fade-in duration-200">
                <div className="text-[10px] font-black text-muted-foreground/60 mb-2 uppercase tracking-wider">Pitches</div>
                <div className="space-y-1.5">
                  {log.description.split('\n').map((pitch, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs font-medium text-foreground bg-muted/20 px-2 py-1.5 rounded">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0" />
                      {pitch}
                    </div>
                  ))}
                </div>
              </div>
            )}
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
                {onEdit && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(log.id);
                    }}
                    className="px-3 py-1.5 bg-primary/10 text-primary text-[10px] font-black rounded-lg active:scale-95 transition-transform"
                  >
                    編集して修正
                  </button>
                )}
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

