"use client";

import React, { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Target, Activity, Trophy, Edit2, Trash2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tournament } from "@/types/tournament";
import { getTournamentStatus, getPeriodLabel } from "./utils";

interface TournamentCardProps {
    t: Tournament;
    onEdit: (t: Tournament) => void;
    onDelete: (t: Tournament) => void;
}

export function TournamentCard({ t, onEdit, onDelete }: TournamentCardProps) {
    const status = getTournamentStatus(t);
    const period = getPeriodLabel(t);

    const [offsetX, setOffsetX] = useState(0);
    const touchStartX = useRef<number | null>(null);
    const touchStartY = useRef<number | null>(null);
    const startOffsetX = useRef<number>(0);
    const isVerticalScroll = useRef<boolean>(false);
    const ACTION_WIDTH = 75; // Edit & Delete each take 75px on opposite sides

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
        isVerticalScroll.current = false;
        startOffsetX.current = offsetX;
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

    const statusConfig = {
        ongoing:  { label: "参戦中",  icon: <Activity className="h-5 w-5 animate-pulse" />, accent: "bg-primary text-primary-foreground" },
        upcoming: { label: "待機中",  icon: <Calendar className="h-5 w-5 opacity-50" />,    accent: "bg-muted/60 text-muted-foreground" },
        finished: { label: "終了",    icon: <Trophy className="h-5 w-5 opacity-40" />,       accent: "bg-muted/40 text-muted-foreground" },
    };
    const sc = statusConfig[status];

    return (
        <Card className={cn(
            "group relative overflow-hidden transition-all duration-200 ease-out",
            "rounded-[var(--radius-2xl)] border border-border/50 shadow-sm",
            status === "ongoing" && "ring-1 ring-primary/20"
        )}>
            {/* 🌟 スワイプ背面のアクションボタン群 (試合一覧と同じ仕様) */}
            <div className={cn(
                "absolute inset-0 z-0 transition-opacity duration-150 bg-transparent",
                Math.abs(offsetX) > 0 ? "opacity-100" : "opacity-0 pointer-events-none"
            )}>
                {/* 編集ボタン (左スワイプで出現) */}
                <div className="absolute top-0 left-0 h-full w-[75px]">
                    <button
                        onClick={() => { setOffsetX(0); onEdit(t); }}
                        className="flex flex-col items-center justify-center w-full h-full bg-blue-500 text-white active:bg-blue-600 transition-colors"
                    >
                        <Edit2 className="h-5 w-5 mb-1" />
                        <span className="text-[10px] font-black uppercase tracking-wider">編集</span>
                    </button>
                </div>

                {/* 削除ボタン (右スワイプで出現) */}
                <div className="absolute top-0 right-0 h-full w-[75px]">
                    <button
                        onClick={() => { setOffsetX(0); onDelete(t); }}
                        className="flex flex-col items-center justify-center w-full h-full bg-rose-500 text-white active:bg-rose-600 transition-colors"
                    >
                        <Trash2 className="h-5 w-5 mb-1" />
                        <span className="text-[10px] font-black uppercase tracking-wider">削除</span>
                    </button>
                </div>
            </div>

            {/* 🌟 フォアグラウンド（カード本体） */}
            <div
                className={cn(
                    "relative z-10 h-full transition-transform duration-200 ease-out bg-card",
                )}
                style={{ transform: `translateX(${offsetX}px)`, touchAction: "pan-y" }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <CardContent className="p-0">
                    <div className="flex items-stretch cursor-pointer">
                        <div className={cn("w-16 shrink-0 flex flex-col items-center justify-center gap-1.5 py-4", sc.accent)}>
                            {sc.icon}
                            <span className="text-[8px] font-black tracking-widest uppercase leading-none" style={{ writingMode: "vertical-rl" }}>
                                {sc.label}
                            </span>
                        </div>

                        <div className="flex-1 px-5 py-4 min-w-0 space-y-1.5 pointer-events-none">
                            <div className="flex items-center gap-2 flex-wrap">
                                <Badge className="bg-muted text-muted-foreground border-none text-[9px] font-black px-2 py-0.5 rounded-md">
                                    {t.season}年度
                                </Badge>
                                {t.organizer && <span className="text-[10px] font-bold text-muted-foreground">{t.organizer}</span>}
                            </div>

                            <h3 className="text-base font-black tracking-tight text-card-foreground leading-snug line-clamp-2">
                                {t.name}
                            </h3>

                            <div className="flex flex-wrap items-center gap-3">
                                <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />{period}
                                </span>
                                {t.timeLimit && (
                                    <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                                        <Target className="h-3 w-3" />{t.timeLimit}
                                    </span>
                                )}
                            </div>

                            {(t.coldGameRule || t.tiebreakerRule) && (
                                <div className="flex flex-wrap gap-1.5 pt-0.5">
                                    {t.coldGameRule && <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground border border-border/50">コールド: {t.coldGameRule}</span>}
                                    {t.tiebreakerRule && <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground border border-border/50">TB: {t.tiebreakerRule}</span>}
                                </div>
                            )}
                        </div>

                        {/* 🌟 組み合わせ表リンクのみ前面に残す（PC操作用にも） */}
                        {t.bracketUrl && (
                            <div className="flex flex-col items-center justify-center gap-0.5 px-3 py-3 border-l border-border/40 shrink-0 bg-muted/10">
                                <a 
                                    href={t.bracketUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="w-10 h-10 flex items-center justify-center rounded-[var(--radius-lg)] text-muted-foreground hover:text-card-foreground hover:bg-muted active:scale-90 transition-all pointer-events-auto" 
                                    title="組み合わせ表"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <ChevronRight className="h-5 w-5" strokeWidth={2.5} />
                                </a>
                            </div>
                        )}
                    </div>
                </CardContent>
            </div>
        </Card>
    );
}
