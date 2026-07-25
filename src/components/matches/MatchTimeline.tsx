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

function expandPlayLogsToPitches(logs: PlayLog[]): PlayLog[] {
  const pitchLogs: PlayLog[] = [];

  logs.forEach(log => {
    // 投球履歴のパース
    const lines = log.description
      ? log.description.split("\n").map(l => l.trim()).filter(Boolean)
      : [];

    let currentB = log.balls;
    let currentS = log.strikes;
    let currentO = log.outs;

    if (lines.length === 0) {
      pitchLogs.push({
        ...log,
        balls: currentB,
        strikes: currentS,
        outs: currentO,
        hasBso: true
      });
      return;
    }

    lines.forEach((line, idx) => {
      const isLast = idx === lines.length - 1;
      const pitchMatch = line.match(/^(\d+)球目:\s*(.*)$/);

      let pitchNum = idx + 1;
      let pitchRes = line;

      if (pitchMatch) {
        pitchNum = parseInt(pitchMatch[1], 10);
        pitchRes = pitchMatch[2];
      }

      // 投球結果によるBSO更新
      const lowerRes = pitchRes.toLowerCase();

      if (lowerRes.includes("ボール") || lowerRes.includes("ball") || lowerRes.includes("b")) {
        currentB = Math.min(4, currentB + 1);
      } else if (lowerRes.includes("ストライク") || lowerRes.includes("strike") || lowerRes.includes("s") || lowerRes.includes("空振り") || lowerRes.includes("見逃し")) {
        currentS = Math.min(3, currentS + 1);
        if (currentS === 3) {
          currentO = Math.min(3, currentO + 1);
        }
      } else if (lowerRes.includes("ファウル") || lowerRes.includes("foul") || lowerRes.includes("f")) {
        if (currentS < 2) {
          currentS++;
        }
      }

      if (isLast) {
        if (log.result.includes("三振") || log.result.includes("K")) {
          currentS = 3;
          currentO = Math.min(3, currentO + 1);
        } else if (log.result.includes("四球") || log.result.includes("BB")) {
          currentB = 4;
        } else {
          const isOut = log.result.includes("アウト") ||
                        log.result.includes("ゴロ") || log.result.includes("フライ") || log.result.includes("ライナー") ||
                        log.result.includes("併殺") || log.result.includes("犠") ||
                        /^[1-9]-[1-9]$/.test(log.result) ||
                        /^[1-9]F$/.test(log.result) ||
                        /^[1-9]L$/.test(log.result) ||
                        log.result.includes("DP");
          if (isOut) {
            if (log.result.includes("併殺") || log.result.includes("DP")) {
              currentO = Math.min(3, currentO + 2);
            } else {
              currentO = Math.min(3, currentO + 1);
            }
          }
        }
      }

      pitchLogs.push({
        ...log,
        id: `${log.id}-${pitchNum}`,
        balls: currentB,
        strikes: currentS,
        outs: currentO,
        result: isLast 
          ? `${pitchNum}球目: ${pitchRes} (${log.result})` 
          : `${pitchNum}球目: ${pitchRes}`,
        resultType: isLast ? log.resultType : "pitch",
        description: "", // 詳細アコーディオンは不要
        hasBso: true
      });
    });
  });

  return pitchLogs;
}

export function MatchTimeline({ events, onEdit, onDelete, emptyMessage = "データがありません" }: MatchTimelineProps) {
  // 1. イニングごとにグループ化
  const groupedEvents = useMemo(() => {
    const groups: { inningLabel: string; inning: number; isTop: boolean; events: PlayLog[] }[] = [];
    const expandedPitches = expandPlayLogsToPitches(events);
    
    expandedPitches.forEach(event => {
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
