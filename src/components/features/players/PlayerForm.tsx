import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, User } from "lucide-react";
import { PlayerFormData, PositionKey } from "@/types/player";
import { POSITION_LABELS } from "./constants";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export const EMPTY_FORM: PlayerFormData = {
  name: "", nameKana: "", uniformNumber: "", primaryPosition: "", throws: "", bats: "", profileImageUrl: "", joinedAt: "",
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
      {/* 👤 アバタープレビューと簡易生成 */}
      <div className="flex flex-col items-center justify-center py-2 space-y-2 bg-muted/30 rounded-[var(--radius-xl)] border border-dashed border-border p-3">
        <Avatar className="h-16 w-16 border border-border shadow-sm bg-background flex items-center justify-center">
          <AvatarImage src={form.profileImageUrl || ""} alt="アバタープレビュー" className="object-cover" />
          <AvatarFallback className="flex items-center justify-center bg-primary/10 text-primary">
            <User className="h-8 w-8" strokeWidth={2.5} />
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-wrap justify-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            className="text-[10px] h-7 px-2.5 rounded-lg font-bold"
            onClick={() => {
              const seed = form.name || Math.random().toString(36).substring(7);
              const url = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(seed)}`;
              setForm(prev => ({ ...prev, profileImageUrl: url }));
            }}
          >
            アバター生成 (Pop)
          </Button>
          <Button
            type="button"
            variant="outline"
            className="text-[10px] h-7 px-2.5 rounded-lg font-bold"
            onClick={() => {
              const seed = form.name || Math.random().toString(36).substring(7);
              const url = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(seed)}`;
              setForm(prev => ({ ...prev, profileImageUrl: url }));
            }}
          >
            アバター生成 (Bot)
          </Button>
          {form.profileImageUrl && (
            <Button
              type="button"
              variant="ghost"
              className="text-[10px] h-7 px-2 rounded-lg font-bold text-destructive hover:bg-destructive/10"
              onClick={() => setForm(prev => ({ ...prev, profileImageUrl: "" }))}
            >
              クリア
            </Button>
          )}
        </div>
      </div>

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
        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">アバター画像URL</Label>
        <Input 
          value={form.profileImageUrl || ""} 
          onChange={(e) => setForm(prev => ({ ...prev, profileImageUrl: e.target.value }))} 
          placeholder="https://example.com/avatar.png (省略時は頭文字表示)" 
          className="h-12 rounded-[var(--radius-xl)] font-bold text-xs" 
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">入団日（入部日）</Label>
        <Input 
          type="date"
          value={form.joinedAt || ""} 
          onChange={set("joinedAt")} 
          className="h-12 rounded-[var(--radius-xl)] font-bold" 
        />
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
