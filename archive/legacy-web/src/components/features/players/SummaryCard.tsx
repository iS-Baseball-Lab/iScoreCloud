// src/components/features/players/SummaryCard.tsx
"use client";
/* 💡 カテゴリサマリーカード */

import React from "react";
import { cn } from "@/lib/utils";
import { PosCategory } from "@/types/player";
import { POSITION_COLOR } from "./constants";

interface SummaryCardProps {
  cat: PosCategory;
  count: number;
  isActive: boolean;
  onClick: () => void;
}

export function SummaryCard({ cat, count, isActive, onClick }: SummaryCardProps) {
  const colors = POSITION_COLOR[cat];
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-[var(--radius-xl)] p-3 border text-center transition-all duration-150 active:scale-95",
        isActive ? colors.filter : "bg-card border-border hover:border-primary/30 hover:bg-muted/40",
      )}
    >
      <div className={cn("w-2 h-2 rounded-full mx-auto mb-1.5", colors.dot)} />
      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest leading-none mb-1">{cat}</p>
      <p className="text-2xl font-black tabular-nums text-card-foreground leading-none">{count}</p>
    </button>
  );
}
