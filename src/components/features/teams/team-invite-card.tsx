// filepath: src/components/features/teams/team-invite-card.tsx
"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Copy, Check, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

interface TeamInviteCardProps {
  inviteCode: string;
}

export function TeamInviteCard({ inviteCode }: TeamInviteCardProps) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyCode = async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setIsCopied(true);
      toast.success("招待コード（チームID）をコピーしました！");
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      toast.error("クリップボードへのコピーに失敗しました");
    }
  };

  return (
    <div className="relative overflow-hidden rounded-[var(--radius-xl)] border-2 border-dashed border-primary/30 bg-primary/[0.02] dark:bg-primary/[0.01] p-3 shadow-sm transition-all hover:border-primary/50">
      {/* 💡 左端の鮮やかなアクセント縦線 */}
      <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
      
      <div className="pl-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        {/* 左側：テキスト情報 */}
        <div className="space-y-0.5">
          <p className="text-[11px] font-black flex items-center gap-1.5 text-primary tracking-widest uppercase">
            <UserPlus className="h-3.5 w-3.5 stroke-[2.5]" />
            TEAM INVITATION CODE
          </p>
          <p className="text-[11px] text-muted-foreground font-bold tracking-tight">
            この招待コード（チームID）を共有してメンバーを招待できます。
          </p>
        </div>
        
        {/* 右側：コード表示 ＆ コピーボタン */}
        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <div className="bg-background/80 backdrop-blur-sm border border-border rounded-[var(--radius-lg)] px-3 py-1.5 flex-1 sm:flex-none text-center sm:text-left min-w-[140px] shadow-inner select-all">
            <code className="text-sm font-black tracking-widest text-foreground font-mono">
              {inviteCode}
            </code>
          </div>
          <Button
            onClick={handleCopyCode}
            size="sm"
            variant={isCopied ? "default" : "outline"}
            className={cn(
              "h-9 px-3.5 rounded-[var(--radius-lg)] font-black text-xs transition-all duration-200 shadow-sm active:scale-95",
              isCopied && "bg-green-600 hover:bg-green-600 text-white border-green-600"
            )}
          >
            {isCopied ? (
              <><Check className="h-3.5 w-3.5 mr-1 stroke-[3]" /> コピー完了</>
            ) : (
              <><Copy className="h-3.5 w-3.5 mr-1" /> COPY</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
