"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Target, Activity, Trophy, Pencil, Trash2, ChevronRight } from "lucide-react";
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

    const statusConfig = {
        ongoing:  { label: "参戦中",  icon: <Activity className="h-5 w-5 animate-pulse" />, accent: "bg-primary text-primary-foreground" },
        upcoming: { label: "待機中",  icon: <Calendar className="h-5 w-5 opacity-50" />,    accent: "bg-muted/60 text-muted-foreground" },
        finished: { label: "終了",    icon: <Trophy className="h-5 w-5 opacity-40" />,       accent: "bg-muted/40 text-muted-foreground" },
    };
    const sc = statusConfig[status];

    return (
        <Card className={cn(
            "bg-card border-border rounded-[var(--radius-2xl)] overflow-hidden",
            "transition-all duration-300 hover:border-primary/30 shadow-none",
            status === "ongoing" && "ring-1 ring-primary/20",
        )}>
            <CardContent className="p-0">
                <div className="flex items-stretch">
                    <div className={cn("w-16 shrink-0 flex flex-col items-center justify-center gap-1.5 py-4", sc.accent)}>
                        {sc.icon}
                        <span className="text-[8px] font-black tracking-widest uppercase leading-none" style={{ writingMode: "vertical-rl" }}>
                            {sc.label}
                        </span>
                    </div>

                    <div className="flex-1 px-5 py-4 min-w-0 space-y-1.5">
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

                    <div className="flex flex-col items-center justify-center gap-0.5 px-2 py-3 border-l border-border/40 shrink-0 bg-muted/10">
                        <button onClick={() => onEdit(t)} className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-lg)] text-muted-foreground hover:text-primary hover:bg-primary/10 active:scale-90 transition-all" title="編集">
                            <Pencil className="h-[15px] w-[15px]" strokeWidth={2.2} />
                        </button>
                        <button onClick={() => onDelete(t)} className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-lg)] text-muted-foreground hover:text-destructive hover:bg-destructive/10 active:scale-90 transition-all" title="削除">
                            <Trash2 className="h-[15px] w-[15px]" strokeWidth={2.2} />
                        </button>
                        {t.bracketUrl && (
                            <a href={t.bracketUrl} target="_blank" rel="noopener noreferrer" className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-lg)] text-muted-foreground hover:text-card-foreground hover:bg-muted active:scale-90 transition-all" title="組み合わせ表">
                                <ChevronRight className="h-[15px] w-[15px]" strokeWidth={2.5} />
                            </a>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
