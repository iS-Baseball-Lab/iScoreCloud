// src/components/features/matches/tournament-selector.tsx
import React, { useState, useEffect, useRef } from "react";
import { ChevronDown, Check, Plus, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

interface Tournament { id: string; name: string; season: string; organizer: string | null; }

export function TournamentSelector({ tournaments, value, isNew, onSelect }: { 
    tournaments: Tournament[], value: string, isNew: boolean, onSelect: (n: string, isN: boolean) => void 
}) {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false); };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    return (
        <div ref={ref} className="relative">
            <button type="button" onClick={() => setIsOpen(!isOpen)} className={cn("w-full h-11 px-4 rounded-2xl border text-sm font-bold text-left flex items-center justify-between transition-all bg-amber-500/5 border-amber-500/20")}>
                <span className="truncate">{isNew ? "＋ 新しい大会を作成" : (value || "大会を選択してください")}</span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-amber-500 transition-transform", isOpen && "rotate-180")} />
            </button>
            {isOpen && (
                <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 rounded-2xl border border-border/50 bg-card shadow-xl overflow-hidden">
                    {tournaments.map(t => (
                        <button key={t.id} type="button" onClick={() => { onSelect(t.name, false); setIsOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/60">
                            <Trophy className="h-3.5 w-3.5 text-amber-500" />
                            <div className="flex-1 min-w-0"><p className="text-sm font-bold truncate">{t.name}</p></div>
                            {!isNew && value === t.name && <Check className="h-4 w-4 text-amber-500" />}
                        </button>
                    ))}
                    <button type="button" onClick={() => { onSelect("", true); setIsOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-amber-500/5 text-amber-600">
                        <Plus className="h-3.5 w-3.5" /> <span className="text-sm font-bold">＋ 新しい大会を作成する</span>
                    </button>
                </div>
            )}
        </div>
    );
}
