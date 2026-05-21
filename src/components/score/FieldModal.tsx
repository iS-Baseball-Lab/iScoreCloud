// src/components/score/FieldModal.tsx
"use client";

import { useState, useEffect } from "react";
import type { BaseAdvance } from "@/types/score";
import { useScore } from "@/contexts/ScoreContext";
/**
 * 💡 打球結果記録モーダル (究極UI版)
 * 1. 意匠: bg-background/60 と backdrop-blur-2xl による極上の透過感。
 * 2. 構造: ポジション選択(1-9)を野球の守備位置に合わせたグリッドで配置。
 * 3. 整理: 打点 (RBI) 入力と結果選択を1つのフローに集約。
 * 4. 規則: 影なし。角丸40px。border-border/40。
 */
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Minus, Plus, Check, Target } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FieldModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResult: (result: string, rbi: number, advances: BaseAdvance[]) => void;
}

export function FieldModal({ open, onOpenChange, onResult }: FieldModalProps) {
  const { state } = useScore();
  const { runners } = state;

  const [selectedPos, setSelectedPos] = useState<string | null>(null);
  const [hitType, setHitType] = useState<string>("GO"); // GO: Ground Out, 1B: Single, etc.
  const [rbi, setRbi] = useState(0);

  // Reset modal state on open
  useEffect(() => {
    if (open) {
      setSelectedPos(null);
      setHitType("GO");
      setRbi(0);
    }
  }, [open]);

  const calculateDefaultRbi = (type: string) => {
    const r1 = runners?.base1 ? 1 : 0;
    const r2 = runners?.base2 ? 1 : 0;
    const r3 = runners?.base3 ? 1 : 0;
    const runnersCount = r1 + r2 + r3;

    switch (type) {
      case "HR":
        return runnersCount + 1;
      case "3B":
        return runnersCount;
      case "2B":
        return r2 + r3;
      case "1B":
        return r3;
      default:
        return 0;
    }
  };

  const handleHitTypeSelect = (type: string) => {
    setHitType(type);
    setRbi(calculateDefaultRbi(type));
  };

  const positions = [
    { id: "1", label: "P", name: "投手" },
    { id: "2", label: "C", name: "捕手" },
    { id: "3", label: "1B", name: "一塁" },
    { id: "4", label: "2B", name: "二塁" },
    { id: "5", label: "3B", name: "三塁" },
    { id: "6", label: "SS", name: "遊撃" },
    { id: "7", label: "LF", name: "左翼" },
    { id: "8", label: "CF", name: "中堅" },
    { id: "9", label: "RF", name: "右翼" },
  ];

  const results = [
    { id: "GO", label: "ゴロ", color: "bg-zinc-500/10" },
    { id: "FO", label: "飛球", color: "bg-zinc-500/10" },
    { id: "1B", label: "単打", color: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" },
    { id: "2B", label: "二塁打", color: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" },
    { id: "3B", label: "三塁打", color: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" },
    { id: "HR", label: "本塁打", color: "bg-primary text-primary-foreground" },
    { id: "SH", label: "犠打", color: "bg-zinc-500/10" },
    { id: "SF", label: "犠飛", color: "bg-zinc-500/10" },
    { id: "E", label: "失策", color: "bg-red-500/20 text-red-600 dark:text-red-400" },
  ];

  const handleConfirm = () => {
    if (!selectedPos || !hitType) return;
    onResult(`${selectedPos}-${hitType}`, rbi, []);
    // Reset
    setSelectedPos(null);
    setHitType("GO");
    setRbi(0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-background/60 backdrop-blur-3xl border-border/40 rounded-[40px] shadow-none p-8 gap-8 animate-in zoom-in-95 duration-300">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5 rounded-full px-3 py-0.5 text-[9px] font-black tracking-widest uppercase">In Play Action</Badge>
          </div>
          <DialogTitle className="text-3xl font-black italic tracking-tighter uppercase italic leading-none">打球結果<span className="text-primary">記録</span></DialogTitle>
        </DialogHeader>

        <div className="space-y-8">
          {/* 1. ポジション選択 (野球の配置を意識したグリッド) */}
          <div className="space-y-4">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2 flex items-center gap-2">
              <Target className="h-3 w-3 text-primary" /> Select Field Position
            </p>
            <div className="grid grid-cols-3 gap-2">
              {positions.map((pos) => (
                <button
                  key={pos.id}
                  onClick={() => setSelectedPos(pos.id)}
                  className={cn(
                    "h-16 rounded-2xl border-2 font-black italic text-lg transition-all active:scale-95 flex flex-col items-center justify-center relative overflow-hidden group",
                    selectedPos === pos.id
                      ? "bg-primary border-primary text-primary-foreground"
                      : "bg-muted/20 border-border/20 text-muted-foreground hover:bg-muted/40"
                  )}
                >
                  <span className="text-[10px] opacity-40 group-hover:opacity-100 transition-opacity uppercase">{pos.name}</span>
                  <span className="text-xl leading-none">{pos.id}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. 結果種別 */}
          <div className="space-y-4">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Result Type</p>
            <div className="flex flex-wrap gap-2">
              {results.map((res) => (
                <button
                  key={res.id}
                  onClick={() => handleHitTypeSelect(res.id)}
                  className={cn(
                    "px-6 py-3 rounded-full border-2 font-black text-sm tracking-tight transition-all active:scale-95",
                    hitType === res.id
                      ? (res.id === 'HR' ? "bg-primary border-primary text-primary-foreground" : "bg-card border-primary text-primary")
                      : "bg-muted/10 border-border/20 text-muted-foreground opacity-60"
                  )}
                >
                  {res.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3. 打点入力 */}
          <div className="bg-muted/20 p-6 rounded-[32px] border border-border/20 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">RBI (打点)</p>
              <p className="text-2xl font-black italic text-foreground tracking-tighter">TOTAL RUNS</p>
            </div>
            <div className="flex items-center gap-6">
              <button
                onClick={() => setRbi(Math.max(0, rbi - 1))}
                className="h-12 w-12 rounded-full border-2 border-border/40 flex items-center justify-center hover:bg-muted/50 active:scale-90 transition-all"
              >
                <Minus className="h-5 w-5" />
              </button>
              <span className="text-4xl font-black tabular-nums italic text-primary w-8 text-center">{rbi}</span>
              <button
                onClick={() => setRbi(Math.min(4, rbi + 1))}
                className="h-12 w-12 rounded-full border-2 border-border/40 flex items-center justify-center hover:bg-muted/50 active:scale-90 transition-all"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <DialogFooter className="sm:justify-center">
          <Button
            onClick={handleConfirm}
            disabled={!selectedPos}
            className="w-full h-16 rounded-[24px] bg-primary text-primary-foreground font-black text-xl shadow-lg shadow-primary/10 hover:bg-primary/90 transition-all active:scale-95 flex items-center gap-3"
          >
            <Check className="h-6 w-6 stroke-[3px]" /> RECORD PLAY
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}