import React, { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Edit2, Trash2, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";

import { PlayLog, PlayLogCard } from "./PlayLogCard";

interface MatchTimelineProps {
  events: PlayLog[];
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  emptyMessage?: string;
}

export function MatchTimeline({ events, onEdit, onDelete, emptyMessage = "データがありません" }: MatchTimelineProps) {
  // 1. イニングごとにグループ化
  const groupedEvents = useMemo(() => {
    const groups: { inningLabel: string; inning: number; isTop: boolean; events: PlayLog[] }[] = [];
    
    events.forEach(event => {
      const isTop = event.topBottom === 'top';
      const inningLabel = `${event.inning}回${isTop ? '表' : '裏'}`;
      let group = groups.find(g => g.inningLabel === inningLabel);
      if (!group) {
        group = { inningLabel, inning: event.inning, isTop, events: [] };
        groups.push(group);
      }
      group.events.push(event);
    });
    
    // イニング順、かつ表→裏の順になるようにソート
    groups.sort((a, b) => {
      if (a.inning !== b.inning) {
        return a.inning - b.inning;
      }
      if (a.isTop && !b.isTop) return -1;
      if (!a.isTop && b.isTop) return 1;
      return 0;
    });

    return groups;
  }, [events]);

  if (events.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground font-bold flex flex-col items-center gap-3">
        <Activity className="w-12 h-12 opacity-20" />
        {emptyMessage}
      </div>
    );
  }

  return (
    <Card className="rounded-[var(--radius-xl)] border-0 sm:border border-border/40 bg-card overflow-hidden sm:p-6 space-y-6">
      <div className="relative border-border space-y-6 sm:space-y-8">
        {groupedEvents.map((group) => (
          <div key={group.inningLabel} className="relative space-y-3">
            {/* イニングマーカー (背骨上のドット) */}
            <span className="absolute left-[18px] sm:left-[26px] top-0 h-3.5 w-3.5 rounded-full bg-primary border-[2.5px] border-background z-10" />
            
            {/* イニングラベル */}
            <h4 className="font-black text-xs sm:text-sm text-primary uppercase tracking-wider pl-12 sm:pl-16">{group.inningLabel}</h4>
            
            <div className="space-y-2">
              {group.events.map((ev, idx) => (
                <PlayLogCard 
                  key={ev.id} 
                  log={ev} 
                  isLast={idx === group.events.length - 1} 
                  onEdit={onEdit} 
                  onDelete={onDelete} 
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
