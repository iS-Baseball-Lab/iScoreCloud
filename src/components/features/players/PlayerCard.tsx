// filepath: src/components/features/players/PlayerCard.tsx
"use client";
/* 💡 選手一覧のカードUIコンポーネント（左右独立スワイプ＆アコーディオン展開対応） */

import React, { useState, useRef } from "react";
import { Pencil, Trash2, ChevronDown, ChevronUp, User, BarChart2, Link } from "lucide-react";
import { cn } from "@/lib/utils";
import { Player, PositionKey } from "@/types/player";
import { getCategory, POSITION_COLOR, POSITION_LABELS } from "./constants";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface PlayerCardProps {
  player: Player;
  teamId: string;
  onEdit: (p: Player) => void;
  onDelete: (p: Player) => void;
  onDetail: (p: Player) => void;
  canManage?: boolean;
  onLink?: (p: Player) => void;
  onUnlink?: (p: Player) => void;
}

export function PlayerCard({ player, onEdit, onDelete, onDetail, canManage, onLink, onUnlink }: PlayerCardProps) {
  const category = getCategory(player.primaryPosition);
  const colors = POSITION_COLOR[category];
  const posLabel = player.primaryPosition
    ? POSITION_LABELS[player.primaryPosition as PositionKey] ?? player.primaryPosition
    : null;
  const isActive = player.isActive === 1 || player.isActive === true;

  const throwsLabel = player.throws === "R" ? "右" : player.throws === "L" ? "左" : null;
  const batsLabel = player.bats === "R" ? "右" : player.bats === "L" ? "左" : player.bats === "B" ? "両" : null;

  // ━━ 💡 展開状態の管理 ━━
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

    // 💡 Smart Swipe Control: 縦スクロールと判定したらスワイプをキャンセル
    if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 5) {
      isVerticalScroll.current = true;
      setOffsetX(0);
      return;
    }

    // 展開中は誤動作防止のため横スワイプを無効化
    if (isExpanded) {
      return;
    }

    let newOffsetX = startOffsetX.current + diffX;
    if (newOffsetX > ACTION_WIDTH) newOffsetX = ACTION_WIDTH;
    if (newOffsetX < -ACTION_WIDTH) newOffsetX = -ACTION_WIDTH;

    setOffsetX(newOffsetX);
  };

  const handleTouchEnd = () => {
    touchStartX.current = null;
    touchStartY.current = null;

    if (offsetX > ACTION_WIDTH / 2) {
      setOffsetX(ACTION_WIDTH);
    } else if (offsetX < -ACTION_WIDTH / 2) {
      setOffsetX(-ACTION_WIDTH);
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
    // 💡 外側ラッパーによる角丸くり抜き（Outer Masking）
    <div className={cn(
      "group relative overflow-hidden transition-all duration-200 ease-out",
      "rounded-[var(--radius-2xl)] border",
      isExpanded ? "border-primary/40 shadow-sm shadow-primary/5" : "border-border/50 shadow-sm",
      !isActive && "opacity-60"
    )}>
      
      {/* ━━ 背面ボタン（Opacity Controlによる透け防止） ━━ */}
      <div className={cn(
        "absolute inset-0 z-0 transition-opacity duration-150 bg-transparent",
        (offsetX !== 0) ? "opacity-100" : "opacity-0 pointer-events-none"
      )}>
        <div className="absolute top-0 left-0 h-full w-[75px]">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(player); setOffsetX(0); }}
            className="h-full w-full flex flex-col items-center justify-center gap-1 bg-blue-500 text-white active:bg-blue-600 transition-colors"
          >
            <Pencil className="h-5 w-5 mb-1" strokeWidth={2.5} />
            <span className="text-[10px] font-black uppercase tracking-wider">編集</span>
          </button>
        </div>
        <div className="absolute top-0 right-0 h-full w-[75px]">
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(player); setOffsetX(0); }}
            className="h-full w-full flex flex-col items-center justify-center gap-1 bg-rose-500 text-white active:bg-rose-600 transition-colors"
          >
            <Trash2 className="h-5 w-5 mb-1" strokeWidth={2.5} />
            <span className="text-[10px] font-black uppercase tracking-wider">削除</span>
          </button>
        </div>
      </div>

      {/* ━━ 前面カード本体 ━━ */}
      <div
        style={{ transform: `translateX(${offsetX}px)`, touchAction: "pan-y" }}
        className={cn(
          "relative z-10 flex flex-col h-full transition-transform duration-200 ease-out",
          isExpanded ? "bg-primary/5 dark:bg-primary/10" : "bg-card"
        )}
      >
        {/* カードヘッダー（タップ領域） */}
        <div
          className="flex items-stretch cursor-pointer"
          onClick={handleCardClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className={cn("flex flex-col items-center justify-center w-[4.5rem] shrink-0 py-4 gap-1", colors.accent)}>
            <span className={cn("text-3xl font-black italic tabular-nums leading-none tracking-tighter", colors.accentText)}>
              {player.uniformNumber}
            </span>
            {player.primaryPosition && (
              <span className={cn("text-[9px] font-black uppercase tracking-wider leading-none opacity-80", colors.accentText)}>
                {player.primaryPosition}
              </span>
            )}
          </div>

          {/* 👤 アバター表示 */}
          <div className="pl-3.5 flex items-center shrink-0">
            <Avatar className="h-10 w-10 border border-border shadow-sm bg-muted flex items-center justify-center">
              <AvatarImage src={player.profileImageUrl ?? ""} alt={player.name} className="object-cover" />
              <AvatarFallback className={cn("flex items-center justify-center", colors.accentText, colors.accent)}>
                <User className="h-5 w-5" strokeWidth={2.5} />
              </AvatarFallback>
            </Avatar>
          </div>

          <div className="flex-1 pl-3 pr-3.5 py-3 min-w-0 flex flex-col justify-center gap-0.5 pointer-events-none">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={cn("inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md border", colors.badge)}>
                <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", colors.dot)} />
                {posLabel ?? "未設定"}
              </span>
              {!isActive && (
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
                  非アクティブ
                </span>
              )}
            </div>
            <p className="text-[1.05rem] font-black tracking-tight text-foreground leading-none truncate mb-1 flex items-baseline">
              {player.name}
              {player.nameKana && (
                <span className="font-bold text-muted-foreground/80 ml-1">
                  （{player.nameKana}）
                </span>
              )}
            </p>
            {(throwsLabel || batsLabel) && (
              <p className="text-[10px] font-bold text-muted-foreground leading-none">
                {throwsLabel && `投：${throwsLabel}`}{throwsLabel && batsLabel && "　"}{batsLabel && `打：${batsLabel}`}
              </p>
            )}
          </div>

          <div className="flex items-center justify-center px-4 shrink-0 text-muted-foreground/50 border-l border-border/40 pointer-events-none">
            {isExpanded ? (
              <ChevronUp className="h-5 w-5 text-primary" strokeWidth={2.5} />
            ) : (
              <ChevronDown className="h-5 w-5" strokeWidth={2} />
            )}
          </div>
        </div>

        {/* ━━ 💡 展開時の詳細情報エリア (背景をシームレス化) ━━ */}
        {isExpanded && (
          <div className="border-t border-border/50 bg-transparent">
            <div className="p-4 animate-in fade-in slide-in-from-top-2 duration-300">
              
              <div className="rounded-xl bg-background/50 border border-dashed border-primary/20 p-4 text-center mb-4">
                <BarChart2 className="h-6 w-6 text-primary/40 mx-auto mb-2" strokeWidth={2} />
                <p className="text-sm font-black text-foreground/80">直近試合の成績がここに表示されます</p>
                <p className="text-[10px] font-bold text-muted-foreground/60 mt-1 tracking-wider uppercase">
                  ※今後のアップデートで実装予定🔥
                </p>
              </div>

              {/* URLパラメータ付きで明細ページへ遷移するためのフック */}
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  onDetail(player);
                }}
                className="w-full h-12 rounded-[var(--radius-lg)] font-black gap-2 shadow-sm text-sm"
              >
                <User className="h-4 w-4" strokeWidth={2.5} />
                選手の詳細情報を見る
              </Button>

              {/* アカウント紐付けボタン */}
              {canManage && (
                <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between text-xs gap-3">
                  {player.userId ? (
                    <>
                      <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                        <User className="h-4 w-4" />
                        <span>アカウント連携済</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUnlink?.(player);
                        }}
                        className="text-[10px] h-8 font-black text-rose-500 hover:text-rose-600 rounded-lg shrink-0"
                      >
                        連携解除
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="text-muted-foreground font-bold">アカウント未連携</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onLink?.(player);
                        }}
                        className="text-[10px] h-8 font-black rounded-lg shrink-0 gap-1"
                      >
                        <Link className="h-3 w-3" />
                        アカウント紐付け
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
