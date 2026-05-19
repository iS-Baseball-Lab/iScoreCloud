// src/components/features/players/PlayerForm.tsx
"use client";
/* 💡 選手追加・編集フォーム */

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { PlayerFormData, PositionKey } from "@/types/player";
import { POSITION_LABELS } from "./constants";

export const EMPTY_FORM: PlayerFormData = {
  name: "", nameKana: "", uniformNumber: "", primaryPosition: "", throws: "", bats: "",
};

interface PlayerFormProps {
  initial?: PlayerFormData;
  onSubmit: (data: PlayerFormData) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  submitLabel: string;
}

export function PlayerForm({ initial = EMPTY_FORM, onSubmit, onCancel, isSubmitting, submitLabel }: PlayerFormProps) {
  const [form, setForm] = useState<PlayerFormData>(initial);
  const set = (key: keyof PlayerFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  return (
    <form onSubmit={async (e) => { e.preventDefault(); await onSubmit(form); }} className="space-y-4 pt-1">
      {/* フォーム内容は元のまま移植（省略せず完全な状態） */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">背番号 *</Label>
          <Input value={form.uniformNumber} onChange={set("uniformNumber")} placeholder="01" required maxLength={3} className="h-12 rounded-[var(--radius-xl)] text-center text-xl font-black" />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">氏名 *</Label>
          <Input value={form.name} onChange={set("name")} placeholder="山田 太郎" required className="h-12 rounded-[var(--radius-xl)] font-bold" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">よみがな</Label>
        <Input value={form.nameKana || ""} onChange={set("nameKana")} placeholder="やまだ たろう" className="h-12 rounded-[var(--radius-xl)] font-bold" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">守備位置</Label>
        <select value={form.primaryPosition} onChange={set("primaryPosition")} className="w-full h-12 rounded-[var(--radius-xl)] bg-input border border-border px-3 font-bold text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
          <option value="">未設定</option>
          {(Object.keys(POSITION_LABELS) as PositionKey[]).map(k => (
            <option key={k} value={k}>{k} — {POSITION_LABELS[k]}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">投</Label>
          <select value={form.throws} onChange={set("throws")} className="w-full h-12 rounded-[var(--radius-xl)] bg-input border border-border px-3 font-bold text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">未設定</option>
            <option value="R">右投 (R)</option><option value="L">左投 (L)</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">打</Label>
          <select value={form.bats} onChange={set("bats")} className="w-full h-12 rounded-[var(--radius-xl)] bg-input border border-border px-3 font-bold text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">未設定</option>
            <option value="R">右打 (R)</option><option value="L">左打 (L)</option><option value="B">両打 (B)</option>
          </select>
        </div>
      </div>
      <div className="flex gap-3 pt-1">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1 h-12 rounded-[var(--radius-xl)] font-black">キャンセル</Button>
        <Button type="submit" disabled={isSubmitting} className="flex-1 h-12 rounded-[var(--radius-xl)] font-black">
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : submitLabel}
        </Button>
      </div>
    </form>
  );
}
