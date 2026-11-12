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
    <div className="rounded-[var(--radius-xl)] border-2 border-dashed border-primary/20 bg-primary/[0.01] dark:bg-primary/[0.005] p-3.5 shadow-sm transition-all hover:border-primary/40 space-y-3">
      {/* ━━ 上段：テキスト情報 ━━ */}
      <div className="space-y-0.5">
        <p className="text-[11px] font-black flex items-center gap-1.5 text-primary tracking-widest uppercase">
          <UserPlus className="h-3.5 w-3.5 stroke-[2.5]" />
          TEAM INVITATION CODE
        </p>
        <p className="text-[11px] text-muted-foreground font-bold tracking-tight">
          この招待コード（チームID）を共有してメンバーを招待できます。
        </p>
      </div>
      
      {/* ━━ 下段：コード表示 ＆ 下配置のフルサイズボタン ━━ */}
      <div className="space-y-2">
        {/* 💡 不要な文字を除去し、長文IDでも自動で折り返して中央に美しく収まるように修正 */}
        <div className="bg-background/80 backdrop-blur-sm border border-border rounded-[var(--radius-lg)] px-3 py-2 text-center shadow-inner select-all max-w-full">
          <code className="text-xs sm:text-sm font-black tracking-widest text-foreground font-mono block break-all">
            {inviteCode}
          </code>
        </div>
        
        {/* 💡 コードの直下に配置された、押しやすい幅いっぱいのボタン */}
        <Button
          onClick={handleCopyCode}
          size="sm"
          variant={isCopied ? "default" : "outline"}
          className={cn(
            "w-full h-9 rounded-[var(--radius-lg)] font-black text-xs transition-all duration-200 shadow-sm active:scale-95",
            isCopied && "bg-green-600 hover:bg-green-600 text-white border-green-600"
          )}
        >
          {isCopied ? (
            <><Check className="h-3.5 w-3.5 mr-1 stroke-[3]" /> コピー完了しました</>
          ) : (
            <><Copy className="h-3.5 w-3.5 mr-1" /> 招待コードをコピーする</>
          )}
        </Button>
      </div>
    </div>
  );
}
