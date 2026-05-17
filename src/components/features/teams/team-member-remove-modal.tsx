// filepath: src/components/features/teams/team-member-remove-modal.tsx
"use client";

import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { TeamMember } from "./team-member-card";

interface TeamMemberRemoveModalProps {
  member: TeamMember | null;
  isRemoving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function TeamMemberRemoveModal({ member, isRemoving, onConfirm, onCancel }: TeamMemberRemoveModalProps) {
  return (
    <Dialog open={!!member} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent 
        onInteractOutside={(e) => e.preventDefault()} 
        className="rounded-[var(--radius-2xl)] bg-card border-border sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle className="font-black text-xl text-destructive">メンバーの除名</DialogTitle>
          <DialogDescription className="text-sm font-bold mt-2">
            本当に <span className="text-foreground">{member?.name}</span> さんをチームから除名してもよろしいですか？<br />
            <span className="text-xs text-muted-foreground">※この操作は取り消せません。対象ユーザーはアクセス権を失います。</span>
          </DialogDescription>
        </DialogHeader>

        {member && (
          <div className="flex items-center gap-3 p-3 rounded-[var(--radius-xl)] bg-muted/50 border border-border shadow-inner">
            <Avatar className="h-9 w-9 shrink-0 border border-border">
              <AvatarImage src={member.avatarUrl ?? ""} />
              <AvatarFallback className="bg-primary/10 text-primary font-black text-xs">
                {(member.name || "?").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-foreground truncate">{member.name}</p>
              <p className="text-[11px] text-muted-foreground truncate font-medium mt-0.5">{member.email}</p>
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <Button 
            type="button" 
            variant="outline" 
            onClick={onCancel} 
            className="flex-1 h-12 rounded-[var(--radius-xl)] font-black"
          >
            キャンセル
          </Button>
          <Button 
            type="button" 
            variant="destructive" 
            onClick={onConfirm} 
            disabled={isRemoving} 
            className="flex-1 h-12 rounded-[var(--radius-xl)] font-black"
          >
            {isRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : "除名する"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
