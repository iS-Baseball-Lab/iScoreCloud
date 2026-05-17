// filepath: src/components/features/teams/team-invite-card.tsx
"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
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
      toast.success("招待コードをコピーしました！");
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      toast.error("クリップボードへのコピーに失敗しました");
    }
  };

  return (
    <Card className="bg-card border border-border rounded-[var(--radius-xl)] shadow-sm">
      <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-0.5">
          <p className="text-xs font-black flex items-center gap-1.5 text-primary uppercase tracking-wider">
            <UserPlus className="h-3.5 w-3.5" />
            TEAM INVITATION CODE
          </p>
          <p className="text-xs text-muted-foreground font-bold">
            このコードを共有して新メンバーを招待できます。
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <div className="bg-muted/50 border border-border rounded-[var(--radius-lg)] px-3 py-2 flex-1 sm:flex-none text-center sm:text-left min-w-[130px]">
            <code className="text-base font-black tracking-widest text-foreground font-mono select-all">
              {inviteCode}
            </code>
          </div>
          <Button
            onClick={handleCopyCode}
            size="sm"
            variant={isCopied ? "default" : "outline"}
            className={cn(
              "h-10 px-4 rounded-[var(--radius-lg)] font-black transition-all",
              isCopied && "bg-green-600 hover:bg-green-600 text-white border-green-600"
            )}
          >
            {isCopied ? (
              <><Check className="h-4 w-4 mr-1.5" /> 完了</>
            ) : (
              <><Copy className="h-4 w-4 mr-1.5" /> コピー</>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
