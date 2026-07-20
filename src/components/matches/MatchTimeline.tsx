import React, { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Edit2, Trash2, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface TimelineEvent {
  id: string;
  inning: number;
  isTop: boolean;
  batterName?: string | null;
  batterNumber?: string | null;
  pitcherName?: string | null;
  result?: string | null;
  description?: string | null;
  validationMessage?: string | null;
}

interface MatchTimelineProps {
  events: TimelineEvent[];
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  emptyMessage?: string;
}

export function MatchTimeline({ events, onEdit, onDelete, emptyMessage = "データがありません" }: MatchTimelineProps) {
  // 1. イニングごとにグループ化
  const groupedEvents = useMemo(() => {
    const groups: { inningLabel: string; inning: number; isTop: boolean; events: TimelineEvent[] }[] = [];
    
    events.forEach(event => {
      const inningLabel = `${event.inning}回${event.isTop ? '表' : '裏'}`;
      let group = groups.find(g => g.inningLabel === inningLabel);
      if (!group) {
        group = { inningLabel, inning: event.inning, isTop: event.isTop, events: [] };
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
    <Card className="rounded-[var(--radius-xl)] border-0 sm:border border-border/40 bg-card overflow-hidden p-3.5 sm:p-6 space-y-6">
      <div className="relative border-l border-border pl-4 sm:pl-6 ml-2 sm:ml-4 space-y-6 sm:space-y-8">
        {groupedEvents.map((group) => (
          <div key={group.inningLabel} className="relative space-y-3">
            {/* イニングマーカー (背骨上のドット) */}
            <span className="absolute -left-[25px] sm:-left-[31px] top-1 h-3.5 w-3.5 rounded-full bg-primary border-[2.5px] border-background" />
            
            {/* イニングラベル */}
            <h4 className="font-black text-xs sm:text-sm text-primary uppercase tracking-wider">{group.inningLabel}</h4>
            
            <div className="space-y-2">
              {group.events.map((ev, idx) => (
                <div key={ev.id} className="p-2 sm:p-3 bg-card border border-border/40 rounded-[var(--radius-xl)] flex flex-col sm:flex-row sm:items-center justify-between text-xs sm:text-sm font-bold gap-3 hover:bg-muted/30 transition-colors">
                  
                  {/* 左側：基本情報（打順、打者、投手） */}
                  <div className="flex flex-col gap-2 flex-1">
                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                      <span className="text-[9px] font-black text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                        打席 {idx + 1}
                      </span>
                      <span className="text-foreground text-xs sm:text-sm truncate max-w-[120px] sm:max-w-[200px]">
                        {ev.batterName ? `${ev.batterName}${ev.batterNumber ? ` (#${ev.batterNumber})` : ''}` : "不明"}
                      </span>
                      {ev.pitcherName && (
                        <span className="text-[10px] text-muted-foreground/60 hidden sm:inline shrink-0">
                          (投: {ev.pitcherName})
                        </span>
                      )}
                      
                      {/* 結果ラベル */}
                      {ev.result && (
                        <span className="font-black text-primary px-2.5 py-0.5 bg-primary/5 rounded-full border border-primary/10 text-[10px] sm:text-xs">
                          {ev.result}
                        </span>
                      )}
                    </div>
                    
                    {/* 詳細なプレイログ (descriptionがある場合のみ) */}
                    {ev.description && (
                      <div className="text-muted-foreground font-medium text-xs mt-1 sm:mt-0 leading-relaxed border-l-2 border-primary/20 pl-2 ml-1">
                        {ev.description}
                      </div>
                    )}
                    
                    {/* バリデーションエラーメッセージ (AI解析指摘) */}
                    {ev.validationMessage && (
                      <div className="mt-2 p-2 sm:p-2.5 bg-destructive/10 text-destructive text-[10px] sm:text-xs rounded-lg border border-destructive/20 font-bold flex items-start gap-1.5 leading-relaxed">
                        <Activity className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <div>{ev.validationMessage}</div>
                      </div>
                    )}
                  </div>
                  
                  {/* 右側：アクションボタン (編集モード時のみ) */}
                  {(onEdit || onDelete) && (
                    <div className="flex items-center gap-1 sm:ml-4 self-end sm:self-center">
                      {onEdit && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground hover:text-primary transition-colors"
                          onClick={() => onEdit(ev.id)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      )}
                      {onDelete && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground hover:text-rose-500 transition-colors"
                          onClick={() => {
                            if (window.confirm("このログを削除しますか？")) {
                              onDelete(ev.id);
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  )}
                  
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
