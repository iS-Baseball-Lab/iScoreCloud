// filepath: src/components/features/team/event-card.tsx
"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Edit2, MapPin, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CalendarMatch } from "./TeamCalendar";

interface EventCardProps {
  event: CalendarMatch;
  teamId: string;
  enableSwipe?: boolean;
  onDelete?: (id: string) => void;
}

export function EventCard({
  event,
  teamId,
  enableSwipe = false,
  onDelete,
}: EventCardProps) {
  const router = useRouter();

  // ━━ スワイプ操作の状態管理 ━━
  const [offsetX, setOffsetX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const startOffsetX = useRef<number>(0);
  const isVerticalScroll = useRef(false);

  const ACTION_WIDTH = 75;

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!enableSwipe) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    
    startOffsetX.current = offsetX;
    setIsSwiping(true);
    isVerticalScroll.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!enableSwipe) return;
    if (touchStartX.current === null || touchStartY.current === null || isVerticalScroll.current) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - touchStartX.current;
    const diffY = currentY - touchStartY.current;

    // 縦スクロール優先判定
    if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 5) {
      isVerticalScroll.current = true;
      setOffsetX(0);
      setIsSwiping(false);
      return;
    }

    let newOffsetX = startOffsetX.current + diffX;
    if (newOffsetX > ACTION_WIDTH) newOffsetX = ACTION_WIDTH;
    if (newOffsetX < -ACTION_WIDTH) newOffsetX = -ACTION_WIDTH;

    setOffsetX(newOffsetX);
  };

  const handleTouchEnd = () => {
    if (!enableSwipe) return;
    touchStartX.current = null;
    touchStartY.current = null;

    if (offsetX > ACTION_WIDTH / 2) {
      setOffsetX(ACTION_WIDTH);
    } else if (offsetX < -ACTION_WIDTH / 2) {
      setOffsetX(-ACTION_WIDTH);
    } else {
      setOffsetX(0);
      setIsSwiping(false);
    }
  };

  const handleCardClick = () => {
    if (enableSwipe && offsetX !== 0) {
      setOffsetX(0);
      setTimeout(() => setIsSwiping(false), 200);
    }
  };

  const handleDelete = async () => {
    if (!confirm("この予定を削除しますか？\n（関連するメンバーの出欠記録も削除されます）")) return;
    try {
      const res = await fetch(`/api/events/${teamId}/${event.id}`, { method: 'DELETE' });
      if (res.ok) {
        const json = await res.json() as { success: boolean; error?: string };
        if (json.success) {
          toast.success("予定を削除しました");
          if (onDelete) onDelete(event.id);
        } else {
          throw new Error(json.error);
        }
      } else {
        throw new Error();
      }
    } catch (error) {
      toast.error("削除エラーが発生しました");
    }
  };

  const currentOffset = enableSwipe && isSwiping ? offsetX : 0;

  return (
    <div className={cn(
      "group relative overflow-hidden transition-all duration-200 ease-out",
      "rounded-[var(--radius-2xl)] border border-border/50 shadow-sm"
    )}>
      
      {/* スワイプ時のみ背面の編集・削除アクションを表示 */}
      {enableSwipe && (
        <div className={cn(
          "absolute inset-0 z-0 transition-opacity duration-150 bg-transparent",
          (isSwiping && Math.abs(offsetX) > 0) ? "opacity-100" : "opacity-0 pointer-events-none"
        )}>
          <div className="absolute top-0 left-0 h-full w-[75px]">
            <button
              onClick={(e) => { e.stopPropagation(); router.push(`/attendance?editEventId=${event.id}`); }}
              className="flex flex-col items-center justify-center w-full h-full bg-blue-500 text-white active:bg-blue-600 transition-colors"
            >
              <Edit2 className="h-5 w-5 mb-1" />
              <span className="text-[10px] font-black uppercase tracking-wider">編集</span>
            </button>
          </div>

          <div className="absolute top-0 right-0 h-full w-[75px]">
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(); setOffsetX(0); }}
              className="flex flex-col items-center justify-center w-full h-full bg-rose-500 text-white active:bg-rose-600 transition-colors"
            >
              <Trash2 className="h-5 w-5 mb-1" />
              <span className="text-[10px] font-black uppercase tracking-wider">削除</span>
            </button>
          </div>
        </div>
      )}

      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ transform: `translateX(${currentOffset}px)`, touchAction: enableSwipe ? "pan-y" : "auto" }}
        className={cn(
          "relative z-10 h-full transition-transform duration-200 ease-out bg-card",
          event.status === 'rainout' && "border border-blue-500/20"
        )}
        onClick={handleCardClick}
      >
        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs hover:border-primary/30 transition-all">
          <div className="space-y-1.5 flex-1 min-w-0 pointer-events-none">
            <div className="flex items-center gap-2 flex-wrap">
              {/* イベント種別バッジ */}
              <span
                className={cn(
                  "text-[9px] font-black tracking-wider px-2 py-0.5 rounded-sm uppercase",
                  event.type === "practice"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : event.type === "meeting"
                      ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                      : event.type === "camp"
                        ? "bg-orange-500/10 text-orange-600 dark:text-orange-400"
                        : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400"
                )}
              >
                {event.type === "practice" ? "練習" : event.type === "meeting" ? "会議" : event.type === "camp" ? "合宿" : "その他予定"}
              </span>

              {event.status === 'rainout' && (
                <span className="text-[9px] font-black tracking-wider px-2 py-0.5 rounded-sm uppercase bg-blue-500/10 text-blue-600 dark:text-blue-400 animate-pulse">
                  ☔ 雨天中止
                </span>
              )}

              {event.dutyGroup && (
                <span className="text-[8px] font-extrabold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded-xs">
                  当番: {event.dutyGroup}
                </span>
              )}
            </div>

            <h5 className="font-black text-sm text-foreground truncate" title={event.title}>
              {event.title}
            </h5>

            <div className="flex items-center gap-3 text-[10px] font-bold text-muted-foreground flex-wrap">
              {event.venueName && (
                <div className="flex items-center gap-1" title={event.venueName}>
                  <MapPin className="h-3 w-3 text-muted-foreground/60" /> 
                  <span>午前: {event.venueShortName || event.venueName}</span>
                  {event.mapUrl && (
                    <a
                      href={event.mapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 text-[9px] text-blue-500 hover:text-blue-600 hover:underline font-black pointer-events-auto"
                    >
                      [地図]
                    </a>
                  )}
                </div>
              )}
              {event.pmLocation && (
                <div className="flex items-center gap-1" title={event.pmLocation}>
                  <MapPin className="h-3 w-3 text-muted-foreground/60" /> 
                  <span>午後: {event.pmLocation}</span>
                  {event.pmMapUrl && (
                    <a
                      href={event.pmMapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 text-[9px] text-blue-500 hover:text-blue-600 hover:underline font-black pointer-events-auto"
                    >
                      [地図]
                    </a>
                  )}
                </div>
              )}
            </div>

            {event.description && (
              <p className="text-[10px] text-muted-foreground font-medium line-clamp-2 mt-1 whitespace-pre-line">
                {event.description}
              </p>
            )}
          </div>

          {/* ボタンアクション */}
          <div className="flex items-center justify-between sm:justify-end gap-2 border-t sm:border-t-0 pt-3 sm:pt-0 border-border/30 shrink-0">
            {/* 📅 Googleカレンダー登録リンク */}
            <a
              href={`https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title || "チーム予定")}&dates=${event.date.replace(/-/g, "")}/${event.date.replace(/-/g, "")}&location=${encodeURIComponent(event.venueName || "")}&details=${encodeURIComponent(event.description || "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="h-9 px-3 rounded-xl border border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center text-[10px] font-bold transition-colors"
              title="Googleカレンダーに登録"
            >
              カレンダー登録
            </a>

            {/* 🚗 合宿用の配車管理ボタン */}
            {event.type === "camp" && (
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/attendance/carpool?eventId=${event.id}`);
                }}
                variant="outline"
                size="sm"
                className="h-9 font-black rounded-xl px-3 text-xs border-primary text-primary hover:bg-primary/5 cursor-pointer"
              >
                配車管理
              </Button>
            )}

            <Button
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/attendance`);
              }}
              size="sm"
              className="h-9 font-black rounded-xl px-4 text-xs"
            >
              出欠確認
            </Button>
          </div>
        </div>
      </div>

    </div>
  );
}
