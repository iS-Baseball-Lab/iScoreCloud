// filepath: src/app/(protected)/members/family/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  Users, UserPlus, Trash2, ArrowLeft, Loader2, Search, Link2, 
  Baby, UserCheck, Plus, Link, AlertCircle, HelpCircle
} from "lucide-react";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { EmptyState } from "@/components/layout/EmptyState";
import { cn } from "@/lib/utils";

interface Player {
  id: string;
  name: string;
  uniformNumber: string;
}

interface Member {
  memberId: string;
  name: string;
  memberType: 'staff' | 'parent' | 'other' | 'player';
  role: string;
}

interface FamilyRelation {
  id: string;
  parentId: string;
  parentName: string;
  childId: string;
  childName: string;
  uniformNumber: string;
}

export default function FamilyRelationsPage() {
  const router = useRouter();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [players, setPlayers] = useState<Player[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [relations, setRelations] = useState<FamilyRelation[]>([]);

  // 新規登録用ダイアログ制御
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedParentId, setSelectedParentId] = useState("");
  const [selectedChildId, setSelectedChildId] = useState("");

  // 削除用ダイアログ制御
  const [deleteTarget, setDeleteTarget] = useState<FamilyRelation | null>(null);

  // 1. 初期化とデータ取得
  const fetchData = useCallback(async (tid: string) => {
    setIsLoading(true);
    try {
      // 選手一覧取得
      const playersRes = await fetch(`/api/teams/${tid}/players`);
      const playersData = await playersRes.json() as Player[];
      setPlayers(Array.isArray(playersData) ? playersData : []);

      // メンバー一覧取得
      const membersRes = await fetch(`/api/teams/${tid}/members`);
      const membersJson = await membersRes.json() as { success: boolean; members?: Member[] };
      if (membersJson.success) {
        // 大人のみ（親子関係では親になりうるメンバーのみ）
        const adultMembers = (membersJson.members || []).filter(m => m.memberType !== 'player');
        setMembers(adultMembers);
      }

      // 親子関係一覧取得
      const relationsRes = await fetch(`/api/carpools/family?teamId=${tid}`);
      const relationsJson = await relationsRes.json() as { success: boolean; data?: FamilyRelation[] };
      if (relationsJson.success) {
        setRelations(relationsJson.data || []);
      }

    } catch (e) {
      console.error(e);
      toast.error("データの取得に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const tid = localStorage.getItem("iscore_selectedTeamId");
    if (tid) {
      setTeamId(tid);
      fetchData(tid);
    } else {
      setIsLoading(false);
    }
  }, [fetchData]);

  // 2. 親子関係の追加
  const handleAddRelation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamId) return;
    if (!selectedParentId || !selectedChildId) {
      toast.error("保護者と選手の両方を選択してください。");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/carpools/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          parentId: selectedParentId,
          childId: selectedChildId
        })
      });

      const json = await res.json() as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error);

      toast.success("親子関係を登録しました。");
      setIsAddModalOpen(false);
      setSelectedParentId("");
      setSelectedChildId("");
      
      // 再取得
      await fetchData(teamId);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "登録に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. 親子関係の削除
  const handleDeleteRelation = async () => {
    if (!teamId || !deleteTarget) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/carpools/family/${deleteTarget.id}`, {
        method: "DELETE"
      });

      const json = await res.json() as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error);

      toast.success("親子関係を解除しました。");
      setDeleteTarget(null);
      
      // 再取得
      await fetchData(teamId);
    } catch (err) {
      console.error(err);
      toast.error("解除に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. 検索フィルタリング
  const filteredRelations = relations.filter(r => {
    const query = searchQuery.toLowerCase();
    return (
      r.parentName.toLowerCase().includes(query) ||
      r.childName.toLowerCase().includes(query) ||
      r.uniformNumber.includes(query)
    );
  });

  if (isLoading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest animate-pulse">Loading Family Relations...</p>
        </div>
      </div>
    );
  }

  if (!teamId) {
    return <div className="p-20 text-center text-muted-foreground">チーム情報が選択されていません。</div>;
  }

  return (
    <div className="flex flex-col min-h-screen text-foreground pb-24">
      <main className="flex-1 px-3 sm:px-6 max-w-2xl mx-auto w-full space-y-6 mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* 戻るボタン */}
        <Button 
          variant="outline" 
          onClick={() => router.back()} 
          className="h-10 px-4 rounded-[var(--radius-xl)] font-black gap-2 shadow-sm border-border bg-card text-foreground hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" /> メンバー管理へ戻る
        </Button>

        <SectionHeader title="親子関係の設定" subtitle="FAMILY RELATIONS" showPulse={true} />

        {/* ガイドライン / アラート */}
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 p-4 rounded-3xl text-xs space-y-1.5 font-bold">
          <div className="flex items-center gap-2 text-sm font-black">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>親子同乗禁止ルールのために設定します</span>
          </div>
          <p>
            「親の車に自分の子供は載せない」ルールを自動配車で適用するため、ここで選手（子供）と保護者（大人）の関係性を設定してください。
            ※一人の選手に複数の保護者を設定することも可能です（例：父と母など）。
          </p>
        </div>

        {/* コントロール・フィルターバー */}
        <div className="flex items-center gap-3 bg-card border border-border/40 p-4 rounded-3xl shadow-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="保護者名や選手名で検索..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10 h-11 rounded-2xl bg-muted/30 border-none font-bold"
            />
          </div>
          <Button 
            onClick={() => setIsAddModalOpen(true)} 
            className="h-11 px-5 rounded-2xl font-black shrink-0 flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" />
            紐付け追加
          </Button>
        </div>

        {/* 親子関係一覧 */}
        {filteredRelations.length === 0 ? (
          <EmptyState 
            icon={Link2} 
            title="親子関係の設定はありません" 
            description={searchQuery ? "検索条件に一致する親子関係が見つかりません。" : "「紐付け追加」から、保護者と選手の紐付けを登録してください。"}
          />
        ) : (
          <div className="space-y-3">
            {filteredRelations.map((rel) => (
              <div 
                key={rel.id} 
                className="flex items-center justify-between p-4 bg-card border border-border/40 rounded-3xl shadow-xs hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-4">
                  {/* 保護者（親）の表示 */}
                  <div className="space-y-0.5">
                    <div className="text-xs text-muted-foreground font-extrabold uppercase tracking-wider">保護者</div>
                    <div className="font-black text-sm">{rel.parentName}</div>
                  </div>

                  {/* リンクアイコン */}
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <Link className="h-4 w-4" />
                  </div>

                  {/* 選手（子）の表示 */}
                  <div className="space-y-0.5">
                    <div className="text-xs text-muted-foreground font-extrabold uppercase tracking-wider">選手</div>
                    <div className="font-black text-sm flex items-center gap-1.5">
                      <span>{rel.childName}</span>
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-zinc-500 font-extrabold">
                        #{rel.uniformNumber}
                      </span>
                    </div>
                  </div>
                </div>

                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setDeleteTarget(rel)}
                  className="h-9 w-9 rounded-xl hover:bg-rose-500/10 hover:text-rose-500 text-muted-foreground shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* 紐付け追加ダイアログ */}
        <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
          <DialogContent className="rounded-[var(--radius-2xl)] bg-card border-border sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="font-black text-lg">親子関係の紐付け追加</DialogTitle>
              <DialogDescription className="text-xs font-bold text-muted-foreground">
                保護者（メンバー）と選手（子供）を選択して紐付けます。
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleAddRelation} className="space-y-4 pt-2">
              {/* 保護者の選択 */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">保護者 (メンバー)</label>
                <select 
                  value={selectedParentId} 
                  onChange={e => setSelectedParentId(e.target.value)}
                  required
                  className="w-full h-11 rounded-xl border border-border bg-muted/20 px-3 text-sm font-bold shadow-xs focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
                >
                  <option value="">-- 保護者を選択してください --</option>
                  {members.map(m => (
                    <option key={m.memberId} value={m.memberId}>{m.name}</option>
                  ))}
                </select>
              </div>

              {/* 選手の選択 */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">選手 (子供)</label>
                <select 
                  value={selectedChildId} 
                  onChange={e => setSelectedChildId(e.target.value)}
                  required
                  className="w-full h-11 rounded-xl border border-border bg-muted/20 px-3 text-sm font-bold shadow-xs focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
                >
                  <option value="">-- 選手を選択してください --</option>
                  {players.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (背番号: #{p.uniformNumber})</option>
                  ))}
                </select>
              </div>

              <DialogFooter className="flex flex-col gap-2 w-full pt-2 sm:flex-col">
                <Button type="submit" disabled={isSubmitting} className="w-full h-12 rounded-xl font-black text-white text-sm">
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "登録する"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)} className="w-full h-12 rounded-xl font-bold text-sm">
                  キャンセル
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* 解除確認ダイアログ */}
        <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
          <DialogContent className="rounded-[var(--radius-2xl)] bg-card border-border sm:max-w-xs" onInteractOutside={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="font-black text-base text-rose-500">親子関係の解除</DialogTitle>
              <DialogDescription className="text-xs font-bold text-muted-foreground leading-snug">
                <strong>{deleteTarget?.parentName}</strong> 様 と <strong>{deleteTarget?.childName}</strong> 選手の親子関係の紐付けを解除しますか？ <br />
                ※登録済みの車両アサイン情報等は解除されません。
              </DialogDescription>
            </DialogHeader>

            <DialogFooter className="flex flex-col gap-2 w-full pt-2 sm:flex-col">
              <Button 
                onClick={handleDeleteRelation} 
                disabled={isSubmitting} 
                className="w-full h-12 rounded-xl font-black text-white text-sm bg-rose-500 hover:bg-rose-600 border-none"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "解除する"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)} className="w-full h-12 rounded-xl font-bold text-sm">
                キャンセル
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </main>
    </div>
  );
}
