// filepath: src/app/(protected)/players/page.tsx
"use client";
/* 💡 選手名簿一覧・管理ページ */

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Search, UserPlus, Loader2, UserCircle, Users } from "lucide-react";
import { toast } from "sonner";

// 💡 共通レイアウトコンポーネント（現場至上主義UI）
import { SectionHeader } from "@/components/layout/SectionHeader";
import { EmptyState } from "@/components/layout/EmptyState";

// 💡 分割したコンポーネント・型・定数のインポート
import { Player, PlayerFormData, PosCategory } from "@/types/player";
import { getCategory } from "@/components/features/players/constants";
import { PlayerCard } from "@/components/features/players/PlayerCard";
import { SummaryCard } from "@/components/features/players/SummaryCard";
import { PlayerForm } from "@/components/features/players/PlayerForm";

export default function PlayerRosterPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<PosCategory | "すべて">("すべて");

  // ダイアログ・モーダル用の状態管理
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Player | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Player | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ━━ データの取得 (Cloudflare Workers API) ━━
  const fetchPlayers = useCallback(async (tid: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/teams/${tid}/players`);
      if (!res.ok) throw new Error("データの取得に失敗しました");
      
      // 💡 unknownエラー回避のための明示的な型キャスト
      const data = (await res.json()) as Player[];
      setPlayers(Array.isArray(data) ? data : []);
    } catch {
      toast.error("選手一覧の取得に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const tid = localStorage.getItem("iscore_selectedTeamId");
    if (!tid) {
      setIsLoading(false);
      return;
    }
    setTeamId(tid);
    fetchPlayers(tid);
  }, [fetchPlayers]);

  // ━━ CRUD アクション ━━
  const handleAdd = async (data: PlayerFormData) => {
    if (!teamId) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/players`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      toast.success(`${data.name} 選手を登録しました`);
      setIsAddOpen(false);
      await fetchPlayers(teamId);
    } catch {
      toast.error("登録に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (data: PlayerFormData) => {
    if (!teamId || !editTarget) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/players/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      toast.success(`${data.name} 選手を更新しました`);
      setEditTarget(null);
      await fetchPlayers(teamId);
    } catch {
      toast.error("更新に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!teamId || !deleteTarget) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/players/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success(`${deleteTarget.name} 選手を削除しました`);
      setDeleteTarget(null);
      await fetchPlayers(teamId);
    } catch {
      toast.error("削除に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ━━ フィルタリング ━━
  const filtered = players.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.uniformNumber.includes(searchQuery);
    const cat = getCategory(p.primaryPosition);
    return matchesSearch && (filter === "すべて" || cat === filter);
  });

  const counts = players.reduce<Record<string, number>>((acc, p) => {
    const cat = getCategory(p.primaryPosition);
    acc[cat] = (acc[cat] ?? 0) + 1;
    return acc;
  }, {});

  // ━━ レンダリング ━━
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

  // チーム未選択時
  if (!teamId) {
    return (
      <div className="flex h-[60vh] items-center justify-center p-6 animate-in fade-in">
        <EmptyState 
          icon={UserCircle} 
          title="チームが選択されていません" 
          description="ダッシュボードでチームを選択してください" 
          className="w-full max-w-sm"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28 animate-in fade-in duration-400">
      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-6">
        
        {/* ━━ ページヘッダー ━━ */}
        <div className="space-y-4">
          <SectionHeader 
            title="選手名簿" 
            subtitle="PLAYERS" 
            showPulse={true} 
          />
          
          <div className="flex items-center justify-between bg-card p-3 rounded-[var(--radius-xl)] border border-border shadow-sm">
            <p className="text-sm font-black text-foreground flex items-center gap-1.5">
              <Users className="h-4 w-4 text-primary" />
              {players.length}
              <span className="text-xs font-bold text-muted-foreground">名登録中</span>
            </p>
            <Button 
              onClick={() => setIsAddOpen(true)} 
              size="sm" 
              className="h-9 px-4 rounded-[var(--radius-lg)] font-black gap-2"
            >
              <UserPlus className="h-4 w-4" strokeWidth={2.5} />
              選手追加
            </Button>
          </div>
        </div>

        {/* ━━ カテゴリ別サマリー ━━ */}
        <div className="grid grid-cols-4 gap-2">
          {(["投手", "捕手", "内野手", "外野手"] as PosCategory[]).map(cat => (
            <SummaryCard 
              key={cat} 
              cat={cat} 
              count={counts[cat] ?? 0} 
              isActive={filter === cat} 
              onClick={() => setFilter(filter === cat ? "すべて" : cat)} 
            />
          ))}
        </div>

        {/* ━━ 検索窓 ━━ */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input 
            placeholder="名前・背番号で検索..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            className="h-11 pl-10 rounded-[var(--radius-xl)] font-medium bg-card border-border" 
          />
        </div>

        {/* ━━ 選手リスト ━━ */}
        <div className="grid grid-cols-1 gap-3">
          {filtered.length === 0 ? (
            <EmptyState 
              icon={Users} 
              title="選手が見つかりません" 
              description="検索条件を変更するか、新しい選手を追加してください" 
              className="mt-4"
            />
          ) : (
            filtered.map(player => (
              <PlayerCard 
                key={player.id} 
                player={player} 
                teamId={teamId} 
                onEdit={setEditTarget} 
                onDelete={setDeleteTarget} 
                // 💡 Hono/Cloudflare用のURLパラメータ付き遷移！
                onDetail={() => {
                  const params = new URLSearchParams({
                    teamId: teamId || "",
                    playerName: player.name,
                    uniformNumber: player.uniformNumber
                  });
                  if (player.nameKana) params.append("nameKana", player.nameKana);
                  router.push(`/players/detail?${params.toString()}`);
                }} 
              />
            ))
          )}
        </div>
      </div>

      {/* ━━ 各種ダイアログ (現場仕様: onInteractOutsideを装備) ━━ */}
      
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} className="rounded-[var(--radius-2xl)] bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black text-xl">新規選手の追加</DialogTitle>
            <DialogDescription className="text-xs font-bold text-muted-foreground">新しい選手情報を入力してください。</DialogDescription>
          </DialogHeader>
          <PlayerForm onSubmit={handleAdd} onCancel={() => setIsAddOpen(false)} isSubmitting={isSubmitting} submitLabel="登録する" />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} className="rounded-[var(--radius-2xl)] bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black text-xl">選手情報の編集</DialogTitle>
            <DialogDescription className="text-xs font-bold text-muted-foreground">登録内容を修正します。</DialogDescription>
          </DialogHeader>
          {editTarget && (
            <PlayerForm
              initial={{
                name: editTarget.name, uniformNumber: editTarget.uniformNumber,
                primaryPosition: editTarget.primaryPosition ?? "",
                throws: editTarget.throws ?? "", bats: editTarget.bats ?? "",
                profileImageUrl: editTarget.profileImageUrl ?? "",
              }}
              onSubmit={handleEdit} onCancel={() => setEditTarget(null)} isSubmitting={isSubmitting} submitLabel="更新する"
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} className="rounded-[var(--radius-2xl)] bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black text-xl text-destructive">選手の削除</DialogTitle>
            <DialogDescription className="text-sm font-bold mt-2">
              本当に <span className="text-foreground">{deleteTarget?.name}</span> 選手を削除してもよろしいですか？<br />
              <span className="text-xs text-muted-foreground">※この操作は取り消せません。</span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)} className="flex-1 h-12 rounded-[var(--radius-xl)] font-black">キャンセル</Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={isSubmitting} className="flex-1 h-12 rounded-[var(--radius-xl)] font-black">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "削除する"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
