// src/components/matches/match-mode-dialog.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Play, History } from "lucide-react";

interface MatchModeDialogProps {
  // 💡 トリガーとなるボタン（NEW MATCHボタンなど）を外から受け取れるようにする
  children: React.ReactNode;
}

export function MatchModeDialog({ children }: MatchModeDialogProps) {
  const router = useRouter();

  return (
    <Dialog>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] rounded-[40px] border-none bg-white/95 dark:bg-zinc-900/90 backdrop-blur-2xl p-8 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black italic uppercase tracking-tighter text-center mb-6">
            Select Match <span className="text-primary">Mode</span>
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4">

          {/* パターン1: リアルタイム入力 */}
          <button
            onClick={() => router.push('/matches/create?mode=live')}
            className="group flex items-center gap-5 sm:gap-6 p-5 sm:p-6 rounded-[32px] bg-primary/10 border-2 border-primary/20 hover:border-primary transition-all text-left"
          >
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground shrink-0 shadow-lg shadow-primary/20">
              <Play className="h-6 w-6 sm:h-7 sm:w-7 fill-current" />
            </div>
            <div>
              <p className="text-base sm:text-lg font-black text-foreground">リアルタイム入力</p>
              <p className="text-[10px] sm:text-xs font-bold text-muted-foreground mt-1">
                試合展開に合わせて、1球・1打席ずつ詳細に記録します。
              </p>
            </div>
          </button>

          {/* パターン2: あとから入力（得点のみ） */}
          <button
            onClick={() => router.push('/matches/create?mode=quick')}
            className="group flex items-center gap-5 sm:gap-6 p-5 sm:p-6 rounded-[32px] bg-muted/50 border-2 border-border/50 hover:border-foreground/20 transition-all text-left"
          >
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-background border border-border/50 flex items-center justify-center text-foreground shrink-0 group-hover:bg-foreground group-hover:text-background transition-colors">
              <History className="h-6 w-6 sm:h-7 sm:w-7" />
            </div>
            <div>
              <p className="text-base sm:text-lg font-black text-foreground">スコアのみ入力</p>
              <p className="text-[10px] sm:text-xs font-bold text-muted-foreground mt-1">
                先に試合結果（スコアボード）だけを入力し、後から詳細を追記します。
              </p>
            </div>
          </button>

        </div>
      </DialogContent>
    </Dialog>
  );
}