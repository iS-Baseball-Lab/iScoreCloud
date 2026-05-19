"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Flame, Zap, ArrowLeft, Plus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Tournament, TournamentFormData } from "@/types/tournament";
import { TournamentCard } from "@/components/features/tournaments/tournament-card";
import { TournamentForm } from "@/components/features/tournaments/tournament-form";
import { EMPTY_FORM, getTournamentStatus } from "@/components/features/tournaments/utils";
import { useTeam } from "@/contexts/TeamContext";

export default function TournamentMapContent() {
    const router = useRouter();
    const { currentTeam } = useTeam();
    const [tournaments, setTournaments] = useState<Tournament[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [isAddOpen, setIsAddOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<Tournament | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Tournament | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchTournaments = useCallback(async () => {
        setIsLoading(true);
        try {
            const categoryParam = currentTeam?.organizationCategory ? `?category=${currentTeam.organizationCategory}` : '';
            const res = await fetch(`/api/tournaments${categoryParam}`);
            if (!res.ok) throw new Error();
            const data = await res.json() as Tournament[];
            setTournaments(Array.isArray(data) ? data : []);
        } catch {
            toast.error("大会一覧の取得に失敗しました");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (currentTeam !== undefined) {
            fetchTournaments();
        }
    }, [fetchTournaments, currentTeam]);

    const handleAdd = async (data: TournamentFormData) => {
        setIsSubmitting(true);
        try {
            const res = await fetch("/api/tournaments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error();
            toast.success(`「${data.name}」を登録しました`);
            setIsAddOpen(false);
            await fetchTournaments();
        } catch {
            toast.error("登録に失敗しました");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEdit = async (data: TournamentFormData) => {
        if (!editTarget) return;
        setIsSubmitting(true);
        try {
            const res = await fetch(`/api/tournaments/${editTarget.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error();
            toast.success(`「${data.name}」を更新しました`);
            setEditTarget(null);
            await fetchTournaments();
        } catch {
            toast.error("更新に失敗しました");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setIsSubmitting(true);
        try {
            const res = await fetch(`/api/tournaments/${deleteTarget.id}`, { method: "DELETE" });
            if (!res.ok) throw new Error();
            toast.success(`「${deleteTarget.name}」を削除しました`);
            setDeleteTarget(null);
            await fetchTournaments();
        } catch {
            toast.error("削除に失敗しました");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <div className="text-center space-y-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary/40 mx-auto" />
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen pb-28 animate-in fade-in duration-400">
            {tournaments.length > 0 && (
                <div className="w-full bg-primary/5 border-b border-border/40 h-9 flex items-center overflow-hidden">
                    {[0, 1].map(i => (
                        <div key={i} className="flex animate-[marquee_30s_linear_infinite] whitespace-nowrap gap-16 shrink-0 pr-16">
                            {tournaments.filter(t => getTournamentStatus(t) === "ongoing").map(t => (
                                <span key={t.id} className="text-[11px] font-bold text-primary flex items-center gap-2">
                                    <Flame className="h-3 w-3 shrink-0" /> 参戦中: {t.name}
                                </span>
                            ))}
                            <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-2">
                                <Zap className="h-3 w-3 shrink-0" /> 登録大会数: {tournaments.length}件
                            </span>
                        </div>
                    ))}
                </div>
            )}

            <div className="max-w-2xl mx-auto px-4 pt-6 space-y-6">
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2 mb-1.5">
                            <button onClick={() => router.back()} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground">
                                <ArrowLeft className="h-4 w-4" />
                            </button>
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
                                Tournaments
                            </span>
                        </div>
                        <h1 className="text-2xl font-black tracking-tighter text-foreground">
                            大会・イベント
                        </h1>
                    </div>
                    <button onClick={() => setIsAddOpen(true)} className="h-11 px-4 bg-primary text-primary-foreground rounded-[var(--radius-xl)] font-black text-sm flex items-center gap-2 shadow-sm hover:opacity-90 active:scale-95 transition-all">
                        <Plus className="h-4 w-4" />
                        <span className="hidden sm:inline">大会を追加</span>
                        <span className="sm:hidden">追加</span>
                    </button>
                </div>

                <div className="space-y-3">
                    {tournaments.map(t => (
                        <TournamentCard 
                            key={t.id} 
                            t={t} 
                            onEdit={() => setEditTarget(t)} 
                            onDelete={() => setDeleteTarget(t)} 
                        />
                    ))}
                </div>
            </div>

            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                <DialogContent className="sm:max-w-[425px] p-4 sm:p-6 rounded-[var(--radius-2xl)]">
                    <div className="space-y-4">
                        <h2 className="text-xl font-black tracking-tight text-foreground">新規大会の登録</h2>
                        <TournamentForm 
                            initial={{ ...EMPTY_FORM, category: currentTeam?.organizationCategory || "other" }}
                            onSubmit={handleAdd} 
                            onCancel={() => setIsAddOpen(false)} 
                            isSubmitting={isSubmitting} 
                            submitLabel="登録する" 
                        />
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
                <DialogContent className="sm:max-w-[425px] p-4 sm:p-6 rounded-[var(--radius-2xl)]">
                    <div className="space-y-4">
                        <h2 className="text-xl font-black tracking-tight text-foreground">大会情報の編集</h2>
                        {editTarget && (
                            <TournamentForm
                                initial={{
                                    name: editTarget.name,
                                    season: editTarget.season,
                                    category: editTarget.category,
                                    organizer: editTarget.organizer || "",
                                    startDate: editTarget.startDate || "",
                                    endDate: editTarget.endDate || "",
                                    timeLimit: editTarget.timeLimit || "",
                                    coldGameRule: editTarget.coldGameRule || "",
                                    tiebreakerRule: editTarget.tiebreakerRule || "",
                                    bracketUrl: editTarget.bracketUrl || "",
                                }}
                                onSubmit={handleEdit}
                                onCancel={() => setEditTarget(null)}
                                isSubmitting={isSubmitting}
                                submitLabel="保存する"
                            />
                        )}
                    </div>
                </DialogContent>
            </Dialog>
            
            <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <DialogContent className="sm:max-w-[425px] p-6 rounded-[var(--radius-2xl)] text-center space-y-4">
                    <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-2">
                        <Trash2 className="h-6 w-6" />
                    </div>
                    <h2 className="text-lg font-black tracking-tight text-foreground">大会を削除しますか？</h2>
                    <p className="text-sm text-muted-foreground font-bold leading-relaxed">
                        「{deleteTarget?.name}」を削除します。<br />この操作は取り消せません。
                    </p>
                    <div className="flex gap-3 pt-4">
                        <button type="button" onClick={() => setDeleteTarget(null)} className="flex-1 h-12 rounded-[var(--radius-xl)] font-black bg-muted text-muted-foreground hover:bg-muted/80">キャンセル</button>
                        <button type="button" onClick={handleDelete} disabled={isSubmitting} className="flex-1 h-12 rounded-[var(--radius-xl)] font-black bg-destructive text-destructive-foreground hover:opacity-90 flex items-center justify-center">
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "削除する"}
                        </button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
