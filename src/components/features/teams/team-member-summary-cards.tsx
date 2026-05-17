// filepath: src/components/features/teams/team-member-summary-cards.tsx
"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface TeamMemberSummaryCardsProps {
  totalCount: number;
  pendingCount: number;
  managerCount: number;
  currentFilter: string;
  onFilterChange: (filter: string) => void;
}

export function TeamMemberSummaryCards({ 
  totalCount, 
  pendingCount, 
  managerCount,
  currentFilter,
  onFilterChange
}: TeamMemberSummaryCardsProps) {
  
  const items = [
    { id: "all", label: "全体メンバー", value: totalCount, color: "text-foreground" },
    { id: "pending", label: "承認待ち", value: pendingCount, color: pendingCount > 0 ? "text-orange-500 animate-pulse" : "text-muted-foreground" },
    { id: "manager", label: "管理者/代表", value: managerCount, color: "text-amber-500" },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map(({ id, label, value, color }) => {
        const isActive = currentFilter === id;
        return (
          <button
            key={id}
            onClick={() => onFilterChange(currentFilter === id ? "all" : id)}
            className={cn(
              "text-left transition-all rounded-[var(--radius-xl)] border shadow-sm p-3 bg-card",
              isActive ? "border-primary ring-1 ring-primary" : "border-border hover:border-muted-foreground/30"
            )}
          >
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className={cn("text-2xl sm:text-3xl font-black tabular-nums tracking-tight mt-1", color)}>
              {value}
              <span className="text-xs font-bold text-muted-foreground ml-0.5">名</span>
            </p>
          </button>
        );
      })}
    </div>
  );
}
