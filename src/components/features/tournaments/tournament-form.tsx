"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { TournamentFormData } from "@/types/tournament";
import { EMPTY_FORM } from "./utils";

interface TournamentFormProps {
    initial?: TournamentFormData;
    onSubmit: (data: TournamentFormData) => Promise<void>;
    onCancel: () => void;
    isSubmitting: boolean;
    submitLabel: string;
}

export function TournamentForm({ initial = EMPTY_FORM, onSubmit, onCancel, isSubmitting, submitLabel }: TournamentFormProps) {
    const [form, setForm] = useState<TournamentFormData>(initial);
    const set = (key: keyof TournamentFormData) =>
        (e: React.ChangeEvent<HTMLInputElement>) =>
            setForm(prev => ({ ...prev, [key]: e.target.value }));

    return (
        <form onSubmit={async (e) => { e.preventDefault(); await onSubmit(form); }} className="space-y-4 pt-1">
            <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">大会名 *</Label>
                <Input value={form.name} onChange={set("name")} placeholder="第○○回 春季市民野球大会" required className="h-11 rounded-[var(--radius-xl)] font-bold" />
            </div>

            <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">対象カテゴリ *</Label>
                <select
                    value={form.category}
                    onChange={(e: any) => setForm(prev => ({ ...prev, category: e.target.value }))}
                    className="flex h-11 w-full rounded-[var(--radius-xl)] border border-input bg-background px-3 py-2 text-sm font-bold ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    required
                >
                    <option value="other">その他</option>
                    <option value="gakudo">🧢 学童野球（少年野球）</option>
                    <option value="junior">⚾️ 中学野球（シニア・ボーイズ等）</option>
                    <option value="high">🏫 高校野球</option>
                    <option value="university">🎓 大学野球</option>
                    <option value="adult">🍺 一般・草野球</option>
                </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">年度 *</Label>
                    <Input value={form.season} onChange={set("season")} placeholder="2026" required maxLength={4} className="h-11 rounded-[var(--radius-xl)] font-bold text-center" />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">主催</Label>
                    <Input value={form.organizer} onChange={set("organizer")} placeholder="○○連盟" className="h-11 rounded-[var(--radius-xl)] font-bold" />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">開始日</Label>
                    <Input type="date" value={form.startDate} onChange={set("startDate")} className="h-11 rounded-[var(--radius-xl)] font-bold" />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">終了日</Label>
                    <Input type="date" value={form.endDate} onChange={set("endDate")} className="h-11 rounded-[var(--radius-xl)] font-bold" />
                </div>
            </div>

            <div className="space-y-3 pt-1 border-t border-border/50">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground pt-2">試合規定（任意）</p>
                <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-muted-foreground">制限時間</Label>
                    <Input value={form.timeLimit} onChange={set("timeLimit")} placeholder="例: 1時間30分 (新しいイニングに入らない)" className="h-10 rounded-[var(--radius-xl)] text-sm" />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-muted-foreground">コールド規定</Label>
                    <Input value={form.coldGameRule} onChange={set("coldGameRule")} placeholder="例: 3回10点、5回7点差" className="h-10 rounded-[var(--radius-xl)] text-sm" />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-muted-foreground">タイブレーク</Label>
                    <Input value={form.tiebreakerRule} onChange={set("tiebreakerRule")} placeholder="例: 1アウト満塁から" className="h-10 rounded-[var(--radius-xl)] text-sm" />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-muted-foreground">組み合わせ表URL</Label>
                    <Input value={form.bracketUrl} onChange={set("bracketUrl")} placeholder="https://..." type="url" className="h-10 rounded-[var(--radius-xl)] text-sm" />
                </div>
            </div>

            <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={onCancel} className="flex-1 h-12 rounded-[var(--radius-xl)] font-black">キャンセル</Button>
                <Button type="submit" disabled={isSubmitting} className="flex-1 h-12 rounded-[var(--radius-xl)] font-black">
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : submitLabel}
                </Button>
            </div>
        </form>
    );
}
