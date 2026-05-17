// filepath: src/components/features/teams/team-role-settings-modal.tsx
"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { ROLES, DEFAULT_ROLE_LABELS, type CustomRoleSetting } from "@/lib/roles";

interface TeamRoleSettingsModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  initialSettings: CustomRoleSetting[];
  onSaveSuccess: () => void;
}

export function TeamRoleSettingsModal({
  isOpen,
  onOpenChange,
  teamId,
  initialSettings,
  onSaveSuccess,
}: TeamRoleSettingsModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // 編集可能な5つのチーム内ロール（admin, pending以外）
  const targetRoles = [ROLES.MANAGER, ROLES.COACH, ROLES.SCORER, ROLES.STAFF, ROLES.PLAYER];
  
  // 各ロールの入力状態を保持
  const [labels, setLabels] = useState<Record<string, string>>({});

  // モーダルが開いたときに初期値をセット
  useEffect(() => {
    const defaultState: Record<string, string> = {};
    targetRoles.forEach(role => {
      const saved = initialSettings.find(s => s.role.toLowerCase() === role.toLowerCase());
      defaultState[role] = saved ? saved.customLabel : DEFAULT_ROLE_LABELS[role];
    });
    setLabels(defaultState);
  }, [isOpen, initialSettings]);

  const handleInputChange = (role: string, value: string) => {
    setLabels(prev => ({ ...prev, [role]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // 送信用データ構造の整形
    const payload = Object.entries(labels).map(([role, customLabel]) => ({
      role,
      customLabel: customLabel.trim()
    }));

    try {
      const res = await fetch(`/api/teams/${teamId}/roles/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: payload }),
      });

      if (!res.ok) throw new Error();
      
      toast.success("役割の呼び方を更新しました");
      onSaveSuccess();
      onOpenChange(false);
    } catch {
      toast.error("設定の保存に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent 
        onInteractOutside={(e) => e.preventDefault()} 
        className="rounded-[var(--radius-2xl)] bg-card border-border sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle className="font-black text-xl flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            役割・呼称のカスタマイズ
          </DialogTitle>
          <DialogDescription className="text-xs font-bold text-muted-foreground">
            チームの文化に合わせて、システム内の役割名を設定できます。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
            {targetRoles.map(role => (
              <div key={role} className="space-y-1.5">
                <label className="text-xs font-black text-foreground uppercase tracking-wide block">
                  {role.toUpperCase()} <span className="text-[10px] text-muted-foreground font-normal">（標準: {DEFAULT_ROLE_LABELS[role]}）</span>
                </label>
                <Input
                  value={labels[role] || ""}
                  onChange={(e) => handleInputChange(role, e.target.value)}
                  placeholder={DEFAULT_ROLE_LABELS[role]}
                  maxLength={10}
                  className="h-10 rounded-[var(--radius-lg)] font-medium bg-muted/30 border-border"
                />
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)} 
              className="flex-1 h-11 rounded-[var(--radius-xl)] font-black"
            >
              キャンセル
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting} 
              className="flex-1 h-11 rounded-[var(--radius-xl)] font-black"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "設定を保存"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
