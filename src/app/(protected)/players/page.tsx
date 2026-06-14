// filepath: src/app/(protected)/players/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { 
  Search, UserPlus, Loader2, UserCircle, Users, Settings, Plus, Trash2, Edit2, 
  ChevronRight, Link, Shield, MessageCircle, Phone, Mail, FolderPlus, UserCheck, Layers
} from "lucide-react";
import { toast } from "sonner";

// 💡 レイアウト・表示用共通コンポーネント
import { SectionHeader } from "@/components/layout/SectionHeader";
import { EmptyState } from "@/components/layout/EmptyState";

import { Player, PlayerFormData, PosCategory } from "@/types/player";
import { getCategory } from "@/components/features/players/constants";
import { PlayerCard } from "@/components/features/players/PlayerCard";
import { SummaryCard } from "@/components/features/players/SummaryCard";
import { PlayerForm } from "@/components/features/players/PlayerForm";
import { cn } from "@/lib/utils";

// 💡 新規：スタッフ・保護者、グループ関連のインターフェース
interface Member {
  memberId: string;
  userId: string | null;
  role: string;
  status: string;
  joinedAt: number;
  name: string;
  nameKana?: string;
  avatarUrl?: string;
  email?: string;
  memberType: 'staff' | 'parent' | 'other';
  phone?: string;
  authProviders?: string[];
}

interface Group {
  id: string;
  teamId: string;
  name: string;
  parentId: string | null;
  createdAt: number;
}

interface GroupMember {
  relationId: string;
  groupId: string;
  playerId: string | null;
  teamMemberId: string | null;
  role: string;
  systemRole?: string;
  name: string;
  type: 'player' | 'staff' | 'parent' | 'other';
  uniformNumber: string | null;
}

export default function TeamRosterAndGroupPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"players" | "staff_parents" | "groups">("players");
  
  // 共通状態
  const [teamId, setTeamId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // ━━ 選手（Players）関連状態 ━━
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerFilter, setPlayerFilter] = useState<PosCategory | "すべて">("すべて");
  const [isAddPlayerOpen, setIsAddPlayerOpen] = useState(false);
  const [editPlayerTarget, setEditPlayerTarget] = useState<Player | null>(null);
  const [deletePlayerTarget, setDeletePlayerTarget] = useState<Player | null>(null);

  // ━━ スタッフ・保護者（Members）関連状態 ━━
  const [members, setMembers] = useState<Member[]>([]);
  const [memberFilter, setMemberFilter] = useState<"すべて" | "staff" | "parent" | "other">("すべて");
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [editMemberTarget, setEditMemberTarget] = useState<Member | null>(null);
  const [deleteMemberTarget, setDeleteMemberTarget] = useState<Member | null>(null);
  
  // アカウント紐付けダイアログ状態
  const [linkTarget, setLinkTarget] = useState<Member | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  // ━━ グループ（Groups）関連状態 ━━
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const selectedGroup = groups.find(g => g.id === selectedGroupId) || null;
  const [isAddGroupOpen, setIsAddGroupOpen] = useState(false);
  const [parentGroupId, setParentGroupId] = useState<string | null>(null);
  const [editGroupTarget, setEditGroupTarget] = useState<Group | null>(null);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<Group | null>(null);

  // グループへのメンバー追加用
  const [isAddGroupMemberOpen, setIsAddGroupMemberOpen] = useState(false);
  const [selectedAddMemberType, setSelectedAddMemberType] = useState<"player" | "other">("player");
  const [selectedAddMemberId, setSelectedAddMemberId] = useState<string>("");
  const [addGroupMemberRole, setAddGroupMemberRole] = useState<string>("");
  const [addGroupMemberSystemRole, setAddGroupMemberSystemRole] = useState<string>("");

  // グループメンバーの編集用
  const [isEditGroupMemberOpen, setIsEditGroupMemberOpen] = useState(false);
  const [editingGroupMember, setEditingGroupMember] = useState<GroupMember | null>(null);
  const [editGroupMemberRole, setEditGroupMemberRole] = useState("");
  const [editGroupMemberSystemRole, setEditGroupMemberSystemRole] = useState("");

  // Member 登録フォーム用状態
  const [memberFormName, setMemberFormName] = useState("");
  const [memberFormKana, setMemberFormKana] = useState("");
  const [memberFormType, setMemberFormType] = useState<'staff' | 'parent' | 'other'>("parent");
  const [memberFormPhone, setMemberFormPhone] = useState("");
  const [memberFormEmail, setMemberFormEmail] = useState("");

  // Group フォーム用状態
  const [groupFormName, setGroupFormName] = useState("");
  const [groupFormParentId, setGroupFormParentId] = useState<string | null>(null);

  // ━━ データ取得処理 ━━
  const fetchPlayers = useCallback(async (tid: string) => {
    try {
      const res = await fetch(`/api/teams/${tid}/players`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as Player[];
      setPlayers(Array.isArray(data) ? data : []);
    } catch {
      toast.error("名簿データの取得に失敗しました");
    }
  }, []);

  const fetchMembers = useCallback(async (tid: string) => {
    try {
      const res = await fetch(`/api/teams/${tid}/members`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { success: boolean; members?: Member[] };
      if (data.success) {
        setMembers(data.members || []);
      }
    } catch {
      toast.error("スタッフ・保護者一覧の取得に失敗しました");
    }
  }, []);

  const fetchGroups = useCallback(async (tid: string) => {
    try {
      const res = await fetch(`/api/teams/${tid}/groups`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { success: boolean; groups?: Group[]; members?: GroupMember[] };
      if (data.success) {
        setGroups(data.groups || []);
        setGroupMembers(data.members || []);
      }
    } catch {
      toast.error("グループ一覧の取得に失敗しました");
    }
  }, []);

  const fetchAllData = useCallback(async (tid: string) => {
    setIsLoading(true);
    await Promise.all([
      fetchPlayers(tid),
      fetchMembers(tid),
      fetchGroups(tid)
    ]);
    setIsLoading(false);
  }, [fetchPlayers, fetchMembers, fetchGroups]);

  useEffect(() => {
    const tid = localStorage.getItem("iscore_selectedTeamId");
    if (!tid) {
      setIsLoading(false);
      return;
    }
    setTeamId(tid);
    fetchAllData(tid);
  }, [fetchAllData]);

  // ━━ 選手 (Player) 操作 ━━
  const handleAddPlayer = async (formData: PlayerFormData) => {
    if (!teamId) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/players`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error();
      toast.success(`${formData.name} 選手を登録しました`);
      setIsAddPlayerOpen(false);
      await fetchPlayers(teamId);
    } catch {
      toast.error("選手の登録に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditPlayer = async (formData: PlayerFormData) => {
    if (!teamId || !editPlayerTarget) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/players/${editPlayerTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error();
      toast.success(`${formData.name} 選手を更新しました`);
      setEditPlayerTarget(null);
      await fetchPlayers(teamId);
    } catch {
      toast.error("選手情報の更新に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePlayer = async () => {
    if (!teamId || !deletePlayerTarget) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/players/${deletePlayerTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success(`${deletePlayerTarget.name} 選手を削除しました`);
      setDeletePlayerTarget(null);
      await fetchPlayers(teamId);
    } catch {
      toast.error("選手の削除に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ━━ スタッフ・保護者 (Member) 操作 ━━
  const openAddMember = () => {
    setMemberFormName("");
    setMemberFormKana("");
    setMemberFormType("parent");
    setMemberFormPhone("");
    setMemberFormEmail("");
    setIsAddMemberOpen(true);
  };

  const openEditMember = (m: Member) => {
    setEditMemberTarget(m);
    setMemberFormName(m.name);
    setMemberFormKana(m.nameKana || "");
    setMemberFormType(m.memberType);
    setMemberFormPhone(m.phone || "");
    setMemberFormEmail(m.email || "");
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamId || !memberFormName.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: memberFormName.trim(),
          nameKana: memberFormKana.trim() || null,
          memberType: memberFormType,
          phone: memberFormPhone.trim() || null,
          email: memberFormEmail.trim() || null
        })
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error || "登録に失敗しました");
      }
      toast.success(`${memberFormName} 様をメンバー登録しました`);
      setIsAddMemberOpen(false);
      await fetchMembers(teamId);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamId || !editMemberTarget || !memberFormName.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/members/${editMemberTarget.memberId}/info`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: memberFormName.trim(),
          nameKana: memberFormKana.trim() || null,
          memberType: memberFormType,
          phone: memberFormPhone.trim() || null,
          email: memberFormEmail.trim() || null
        })
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error || "更新に失敗しました");
      }
      toast.success(`${memberFormName} 様の情報を更新しました`);
      setEditMemberTarget(null);
      await fetchMembers(teamId);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteMember = async () => {
    if (!teamId || !deleteMemberTarget) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/members/${deleteMemberTarget.memberId}`, {
        method: "DELETE"
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error || "削除に失敗しました");
      }
      toast.success(`${deleteMemberTarget.name} 様をメンバーから除外しました`);
      setDeleteMemberTarget(null);
      await fetchMembers(teamId);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ユーザー紐付け処理
  const handleLinkUser = async () => {
    if (!teamId || !linkTarget || !selectedUserId) return;
    setIsSubmitting(true);
    try {
      const selectedUser = members.find(m => m.userId === selectedUserId);
      const userEmail = selectedUser?.email || null;

      const res = await fetch(`/api/teams/${teamId}/members/${linkTarget.memberId}/info`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          userId: selectedUserId,
          email: userEmail
        })
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error || "紐付けに失敗しました");
      }
      toast.success("ログインユーザーとメンバー情報の紐付けが完了しました");
      setLinkTarget(null);
      setSelectedUserId("");
      await fetchMembers(teamId);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnlinkUser = async (m: Member) => {
    if (!teamId) return;
    if (!confirm(`${m.name} 様のアカウント紐付けを解除しますか？`)) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/members/${m.memberId}/info`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: null })
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error || "解除に失敗しました");
      }
      toast.success("アカウント紐付けを解除しました");
      await fetchMembers(teamId);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ━━ グループ (Group) 操作 ━━
  const openAddGroup = (pId: string | null = null) => {
    setGroupFormName("");
    setParentGroupId(pId);
    setIsAddGroupOpen(true);
  };

  const handleAddGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamId || !groupFormName.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: groupFormName.trim(),
          parentId: parentGroupId
        })
      });
      if (!res.ok) throw new Error();
      toast.success(`グループ「${groupFormName}」を作成しました`);
      setIsAddGroupOpen(false);
      await fetchGroups(teamId);
    } catch {
      toast.error("グループの作成に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamId || !editGroupTarget || !groupFormName.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/groups/${editGroupTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: groupFormName.trim(),
          parentId: groupFormParentId || null
        })
      });
      if (!res.ok) throw new Error();
      toast.success("グループ情報を更新しました");
      setEditGroupTarget(null);
      setGroupFormParentId(null);
      await fetchGroups(teamId);
    } catch {
      toast.error("グループ情報の更新に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!teamId || !deleteGroupTarget) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/groups/${deleteGroupTarget.id}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error();
      toast.success("グループを削除しました");
      if (selectedGroupId === deleteGroupTarget.id) {
        setSelectedGroupId(null);
      }
      setDeleteGroupTarget(null);
      await fetchGroups(teamId);
    } catch {
      toast.error("グループの削除に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  // グループへのメンバー所属操作
  const handleAddGroupMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamId || !selectedGroup || !selectedAddMemberId) return;
    setIsSubmitting(true);
    try {
      const isPlayer = selectedAddMemberType === "player";
      const res = await fetch(`/api/teams/${teamId}/groups/${selectedGroup.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: isPlayer ? selectedAddMemberId : null,
          teamMemberId: !isPlayer ? selectedAddMemberId : null,
          role: addGroupMemberRole || null,
          systemRole: !isPlayer ? (addGroupMemberSystemRole || null) : null
        })
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error || "メンバーの追加に失敗しました");
      }
      toast.success("グループにメンバーを追加しました");
      setIsAddGroupMemberOpen(false);
      setSelectedAddMemberId("");
      addGroupMemberRole && setAddGroupMemberRole("");
      addGroupMemberSystemRole && setAddGroupMemberSystemRole("");
      await fetchGroups(teamId);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditGroupMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamId || !selectedGroup || !editingGroupMember) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/groups/${selectedGroup.id}/members/${editingGroupMember.relationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: editGroupMemberRole || null,
          systemRole: editingGroupMember.type !== "player" ? (editGroupMemberSystemRole || null) : null
        })
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error || "役割の更新に失敗しました");
      }
      toast.success("グループメンバーの役割を更新しました");
      setIsEditGroupMemberOpen(false);
      setEditingGroupMember(null);
      await fetchGroups(teamId);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteGroupMember = async (relationId: string, name: string) => {
    if (!teamId || !selectedGroup) return;
    if (!confirm(`${name} 様をグループから外しますか？`)) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/groups/${selectedGroup.id}/members/${relationId}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error();
      toast.success("グループから除外しました");
      await fetchGroups(teamId);
    } catch {
      toast.error("メンバーの除外に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ━━ フィルタリング ━━
  const filteredPlayers = players.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.uniformNumber.includes(searchQuery);
    const cat = getCategory(p.primaryPosition);
    return matchesSearch && (playerFilter === "すべて" || cat === playerFilter);
  });

  const filteredMembers = members.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase()) || (m.nameKana && m.nameKana.includes(searchQuery));
    return matchesSearch && (memberFilter === "すべて" || m.memberType === memberFilter);
  });

  const playerCounts = players.reduce<Record<string, number>>((acc, p) => {
    const cat = getCategory(p.primaryPosition);
    acc[cat] = (acc[cat] ?? 0) + 1;
    return acc;
  }, {});

  // 親子ツリーレンダラー (再帰的にインデント描画)
  const renderGroupTree = (parentId: string | null = null, depth = 0) => {
    const childGroups = groups.filter(g => g.parentId === parentId);
    if (childGroups.length === 0) return null;

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {childGroups.map(g => {
          const isSelected = selectedGroupId === g.id;
          return (
            <div key={g.id} className="w-full flex flex-col">
              <div 
                style={{ paddingLeft: `${depth * 16 + 12}px` }}
                className={cn(
                  "flex items-center justify-between py-2.5 pr-3 rounded-[var(--radius-lg)] border transition-all cursor-pointer group",
                  isSelected
                    ? "bg-primary/5 border-primary/20 text-primary"
                    : "bg-card hover:bg-zinc-50 border-border dark:hover:bg-zinc-900"
                )}
                onClick={() => setSelectedGroupId(g.id)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform text-muted-foreground", isSelected && "text-primary rotate-90")} />
                  <span className="text-xs font-black tracking-tight truncate">{g.name}</span>
                </div>
                
                {/* グループホバー時の管理アクション (管理者のみ想定) */}
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={(e) => { e.stopPropagation(); openAddGroup(g.id); }}
                    className="p-1 rounded hover:bg-zinc-150 dark:hover:bg-zinc-800 text-muted-foreground hover:text-foreground transition-colors"
                    title="子グループを追加"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setGroupFormName(g.name); setGroupFormParentId(g.parentId); setEditGroupTarget(g); }}
                    className="p-1 rounded hover:bg-zinc-150 dark:hover:bg-zinc-800 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setDeleteGroupTarget(g); }}
                    className="p-1 rounded hover:bg-zinc-150 dark:hover:bg-zinc-800 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              
              {/* 子階層のレンダリング */}
              <div className="w-full">
                {renderGroupTree(g.id, depth + 1)}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

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

  // アカウント未紐付けのメンバーリスト (紐付け候補)
  const unlinkedUsers = members.filter(m => m.userId);

  return (
    <div className="min-h-screen pb-28 animate-in fade-in duration-400">
      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-6">
        
        {/* ━━ ページヘッダー ━━ */}
        <div className="space-y-4">
          <SectionHeader 
            title="チーム名簿・組織管理" 
            subtitle="ROSTER & GROUPS" 
            showPulse={true} 
          />

          {/* 🚀 セグメントタブ (選手 / スタッフ・保護者 / グループ) */}
          <div className="grid grid-cols-3 gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 border border-border rounded-xl">
            <button
              onClick={() => { setActiveTab("players"); setSearchQuery(""); }}
              className={cn(
                "py-2 text-xs font-black rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5",
                activeTab === "players"
                  ? "bg-white dark:bg-zinc-800 text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Users className="h-3.5 w-3.5" />
              選手一覧
            </button>
            <button
              onClick={() => { setActiveTab("staff_parents"); setSearchQuery(""); }}
              className={cn(
                "py-2 text-xs font-black rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5",
                activeTab === "staff_parents"
                  ? "bg-white dark:bg-zinc-800 text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <UserCheck className="h-3.5 w-3.5" />
              スタッフ・保護者
            </button>
            <button
              onClick={() => { setActiveTab("groups"); setSearchQuery(""); }}
              className={cn(
                "py-2 text-xs font-black rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5",
                activeTab === "groups"
                  ? "bg-white dark:bg-zinc-800 text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Layers className="h-3.5 w-3.5" />
              グループ管理
            </button>
          </div>
        </div>

        {/* ━━━━━━ タブ1: 選手一覧 ━━━━━━ */}
        {activeTab === "players" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="flex items-center justify-between bg-card p-3 rounded-[var(--radius-xl)] border border-border shadow-sm">
              <p className="text-sm font-black text-foreground flex items-center gap-1.5">
                <Users className="h-4 w-4 text-primary" />
                {players.length}
                <span className="text-xs font-bold text-muted-foreground">名の選手が登録中</span>
              </p>
              <Button 
                onClick={() => setIsAddPlayerOpen(true)} 
                size="sm" 
                className="h-9 px-4 rounded-[var(--radius-lg)] font-black gap-2"
              >
                <UserPlus className="h-4 w-4" strokeWidth={2.5} />
                選手追加
              </Button>
            </div>

            {/* カテゴリサマリー */}
            <div className="grid grid-cols-4 gap-2">
              {(["投手", "捕手", "内野手", "外野手"] as PosCategory[]).map(cat => (
                <SummaryCard 
                  key={cat} 
                  cat={cat} 
                  count={playerCounts[cat] ?? 0} 
                  isActive={playerFilter === cat} 
                  onClick={() => setPlayerFilter(playerFilter === cat ? "すべて" : cat)} 
                />
              ))}
            </div>

            {/* 検索窓 */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input 
                placeholder="選手名・背番号で検索..." 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
                className="h-11 pl-10 rounded-[var(--radius-xl)] font-medium bg-card border-border" 
              />
            </div>

            {/* 選手リスト */}
            <div className="grid grid-cols-1 gap-3">
              {filteredPlayers.length === 0 ? (
                <EmptyState 
                  icon={Users} 
                  title="選手が見つかりません" 
                  description="新しい選手を追加してください" 
                />
              ) : (
                filteredPlayers.map(player => (
                  <PlayerCard 
                    key={player.id} 
                    player={player} 
                    teamId={teamId} 
                    onEdit={setEditPlayerTarget} 
                    onDelete={setDeletePlayerTarget} 
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
        )}

        {/* ━━━━━━ タブ2: スタッフ・保護者一覧 ━━━━━━ */}
        {activeTab === "staff_parents" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="flex items-center justify-between bg-card p-3 rounded-[var(--radius-xl)] border border-border shadow-sm">
              <p className="text-sm font-black text-foreground flex items-center gap-1.5">
                <UserCheck className="h-4 w-4 text-primary" />
                {members.length}
                <span className="text-xs font-bold text-muted-foreground">名のスタッフ・保護者</span>
              </p>
              <Button 
                onClick={openAddMember} 
                size="sm" 
                className="h-9 px-4 rounded-[var(--radius-lg)] font-black gap-2"
              >
                <UserPlus className="h-4 w-4" strokeWidth={2.5} />
                メンバー追加
              </Button>
            </div>

            {/* 種別フィルター */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { key: "すべて", label: "すべて" },
                { key: "staff", label: "スタッフ" },
                { key: "parent", label: "保護者" },
                { key: "other", label: "その他" }
              ].map(item => (
                <button
                  key={item.key}
                  onClick={() => setMemberFilter(item.key as any)}
                  className={cn(
                    "h-10 rounded-xl border text-xs font-black transition-all active:scale-95 cursor-pointer flex flex-col items-center justify-center border-border",
                    memberFilter === item.key
                      ? "bg-primary text-white border-primary shadow-xs"
                      : "bg-card text-muted-foreground hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* 検索窓 */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input 
                placeholder="名前・フリガナで検索..." 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
                className="h-11 pl-10 rounded-[var(--radius-xl)] font-medium bg-card border-border" 
              />
            </div>

            {/* スタッフ・保護者リスト */}
            <div className="grid grid-cols-1 gap-3">
              {filteredMembers.length === 0 ? (
                <EmptyState 
                  icon={UserCheck} 
                  title="メンバーが見つかりません" 
                  description="新しくスタッフ・保護者を追加してください" 
                />
              ) : (
                filteredMembers.map(m => (
                  <div key={m.memberId} className="flex items-center justify-between p-4 bg-card border border-border rounded-[var(--radius-xl)] shadow-xs transition-all duration-300">
                    <div className="flex items-center gap-3.5 min-w-0">
                      {m.avatarUrl ? (
                        <img src={m.avatarUrl} alt={m.name} className="h-10 w-10 rounded-full object-cover shrink-0 border border-zinc-200" />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-400 dark:text-zinc-600 flex items-center justify-center shrink-0 border border-zinc-200 dark:border-zinc-800">
                          <UserCircle className="h-6 w-6" />
                        </div>
                      )}
                      
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-foreground truncate">{m.name}</span>
                          {m.nameKana && <span className="text-[10px] font-bold text-muted-foreground truncate">({m.nameKana})</span>}
                        </div>
                        
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {/* 役割バッジ */}
                          <span className={cn(
                            "text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-sm",
                            m.memberType === 'staff' 
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" 
                              : m.memberType === 'parent' 
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" 
                                : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400"
                          )}>
                            {m.memberType === 'staff' ? '指導者・スタッフ' : m.memberType === 'parent' ? '保護者' : 'その他'}
                          </span>

                          {/* ユーザー紐付けバッジ */}
                          {m.userId ? (
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-[8px] font-black px-2 py-0.5 rounded-sm bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                                <UserCheck className="h-2 w-2" />
                                紐付け済
                              </span>
                              {m.authProviders && m.authProviders.map(prov => {
                                const p = prov.toLowerCase();
                                if (p.includes("google")) {
                                  return (
                                    <span key={prov} className="text-[8px] font-black px-1.5 py-0.5 rounded-sm bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200/50 dark:border-red-900/30">
                                      Google
                                    </span>
                                  );
                                }
                                if (p.includes("line")) {
                                  return (
                                    <span key={prov} className="text-[8px] font-black px-1.5 py-0.5 rounded-sm bg-emerald-600/15 text-emerald-600 dark:text-emerald-400 border border-emerald-250/30 dark:border-emerald-900/30">
                                      LINE
                                    </span>
                                  );
                                }
                                if (p.includes("microsoft") || p.includes("entra") || p.includes("azure")) {
                                  return (
                                    <span key={prov} className="text-[8px] font-black px-1.5 py-0.5 rounded-sm bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-250/30 dark:border-blue-900/30">
                                      Microsoft
                                    </span>
                                  );
                                }
                                return (
                                  <span key={prov} className="text-[8px] font-black px-1.5 py-0.5 rounded-sm bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 uppercase">
                                    {prov}
                                  </span>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="text-[8px] font-bold px-2 py-0.5 rounded-sm bg-zinc-100 dark:bg-zinc-800 text-muted-foreground">
                              未紐付け
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {m.userId ? (
                        <Button 
                          onClick={() => handleUnlinkUser(m)} 
                          size="icon" 
                          variant="ghost" 
                          className="h-8 w-8 text-emerald-600 dark:text-emerald-400 hover:text-destructive hover:bg-destructive/10 shrink-0"
                          title="紐付け解除"
                        >
                          <Link className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button 
                          onClick={() => { setLinkTarget(m); setSelectedUserId(""); }} 
                          size="icon" 
                          variant="ghost" 
                          className="h-8 w-8 text-zinc-400 hover:text-primary shrink-0"
                          title="アカウント紐付け"
                        >
                          <Link className="h-4 w-4" />
                        </Button>
                      )}
                      
                      <Button 
                        onClick={() => openEditMember(m)} 
                        size="icon" 
                        variant="ghost" 
                        className="h-8 w-8 text-zinc-400 hover:text-foreground shrink-0"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button 
                        onClick={() => setDeleteMemberTarget(m)} 
                        size="icon" 
                        variant="ghost" 
                        className="h-8 w-8 text-zinc-400 hover:text-destructive shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ━━━━━━ タブ3: グループ管理 ━━━━━━ */}
        {activeTab === "groups" && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-5 animate-in fade-in duration-200">
            {/* 左側: グループ一覧ツリー構造 */}
            <div className="md:col-span-2 space-y-4">
              <div className="flex items-center justify-between bg-card p-3 rounded-[var(--radius-xl)] border border-border shadow-sm">
                <span className="text-xs font-black text-foreground">グループツリー</span>
                <Button 
                  onClick={() => openAddGroup(null)} 
                  size="sm" 
                  className="h-8 px-3 rounded-[var(--radius-lg)] font-black text-[11px] gap-1.5"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  親グループ作成
                </Button>
              </div>

              {groups.length === 0 ? (
                <EmptyState 
                  icon={Layers} 
                  title="グループなし" 
                  description="メンバーを分類するグループを新規作成してください" 
                />
              ) : (
                <div className="bg-card border border-border rounded-[var(--radius-xl)] p-3 space-y-1.5 max-h-[60vh] overflow-y-auto">
                  {renderGroupTree(null)}
                </div>
              )}
            </div>

            {/* 右側: 選択中のグループのメンバー・役割管理 */}
            <div className="md:col-span-3 space-y-4">
              {selectedGroup ? (
                <div className="bg-card border border-border rounded-[var(--radius-xl)] p-4 space-y-4 animate-in slide-in-from-right-4 duration-200">
                  <div className="flex items-center justify-between pb-3 border-b border-border">
                    <div>
                      <span className="text-[9px] font-black uppercase text-primary tracking-widest">Selected Group</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <h4 className="font-black text-base text-foreground">{selectedGroup.name}</h4>
                        <button 
                          onClick={() => { setGroupFormName(selectedGroup.name); setGroupFormParentId(selectedGroup.parentId); setEditGroupTarget(selectedGroup); }}
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                          title="グループ情報を編集"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <Button 
                      onClick={() => setIsAddGroupMemberOpen(true)}
                      size="sm"
                      className="h-8 rounded-[var(--radius-lg)] text-[11px] font-black gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      メンバー追加
                    </Button>
                  </div>

                  {/* グループ所属メンバー一覧 */}
                  <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                    {groupMembers.filter(m => m.groupId === selectedGroup.id).length === 0 ? (
                      <div className="text-center py-8 text-xs font-bold text-muted-foreground">
                        グループメンバーが登録されていません
                      </div>
                    ) : (
                      groupMembers.filter(m => m.groupId === selectedGroup.id).map(m => (
                        <div key={m.relationId} className="flex items-center justify-between p-3 bg-zinc-50/50 dark:bg-zinc-900/40 rounded-xl border border-zinc-100 dark:border-zinc-800">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-black text-xs text-foreground truncate">{m.name}</span>
                              {m.uniformNumber && (
                                <span className="text-[9px] font-black bg-zinc-200/60 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-1 rounded-sm">
                                  #{m.uniformNumber}
                                </span>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[8px] font-bold px-1.5 py-0.5 bg-zinc-150 dark:bg-zinc-800 rounded-xs text-muted-foreground shrink-0">
                                {m.type === "player" ? "選手" : m.type === "staff" ? "スタッフ" : m.type === "parent" ? "保護者" : "その他"}
                              </span>
                              {m.role && (
                                <span className="text-[9px] font-black px-2 py-0.5 bg-primary/10 text-primary rounded-full shrink-0">
                                  役割: {m.role}
                                </span>
                              )}
                              {m.systemRole && m.type !== 'player' && (
                                <span className="text-[9px] font-bold px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full shrink-0">
                                  権限: {
                                    m.systemRole === 'manager' ? '監督・代表' :
                                    m.systemRole === 'coach' ? 'コーチ' :
                                    m.systemRole === 'scorer' ? 'スコアラー' :
                                    m.systemRole === 'staff' ? 'スタッフ' :
                                    m.systemRole === 'parent' ? '保護者' : m.systemRole
                                  }
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <Button
                              onClick={() => {
                                setEditingGroupMember(m);
                                setEditGroupMemberRole(m.role || "");
                                setEditGroupMemberSystemRole(m.systemRole || "");
                                setIsEditGroupMemberOpen(true);
                              }}
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-zinc-400 hover:text-foreground shrink-0"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            
                            <Button
                              onClick={() => handleDeleteGroupMember(m.relationId, m.name)}
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-zinc-400 hover:text-destructive shrink-0"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="h-[40vh] border border-dashed border-border rounded-[var(--radius-xl)] flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
                  <Layers className="h-8 w-8 opacity-20 mb-2" />
                  <p className="text-xs font-bold">グループを選択してください</p>
                  <p className="text-[10px] opacity-70 mt-1">左のツリーからグループ名を選択すると所属メンバーの管理ができます</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ━━━━━━━━━━ ダイアログ群 ━━━━━━━━━━ */}

      {/* 選手追加ダイアログ */}
      <Dialog open={isAddPlayerOpen} onOpenChange={setIsAddPlayerOpen}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} className="rounded-[var(--radius-2xl)] bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black text-xl">新規選手の追加</DialogTitle>
            <DialogDescription className="text-xs font-bold text-muted-foreground">新しい選手情報を入力してください。</DialogDescription>
          </DialogHeader>
          <PlayerForm onSubmit={handleAddPlayer} onCancel={() => setIsAddPlayerOpen(false)} isSubmitting={isSubmitting} submitLabel="登録する" />
        </DialogContent>
      </Dialog>

      {/* 選手編集ダイアログ */}
      <Dialog open={!!editPlayerTarget} onOpenChange={(open) => !open && setEditPlayerTarget(null)}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} className="rounded-[var(--radius-2xl)] bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black text-xl">選手情報の編集</DialogTitle>
            <DialogDescription className="text-xs font-bold text-muted-foreground">登録内容を修正します。</DialogDescription>
          </DialogHeader>
          {editPlayerTarget && (
            <PlayerForm
              initial={{
                name: editPlayerTarget.name,
                nameKana: editPlayerTarget.nameKana ?? "",
                uniformNumber: editPlayerTarget.uniformNumber,
                primaryPosition: editPlayerTarget.primaryPosition ?? "",
                throws: editPlayerTarget.throws ?? "",
                bats: editPlayerTarget.bats ?? "",
                profileImageUrl: editPlayerTarget.profileImageUrl ?? "",
              }}
              onSubmit={handleEditPlayer} onCancel={() => setEditPlayerTarget(null)} isSubmitting={isSubmitting} submitLabel="更新する"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* 選手削除ダイアログ */}
      <Dialog open={!!deletePlayerTarget} onOpenChange={(open) => !open && setDeletePlayerTarget(null)}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} className="rounded-[var(--radius-2xl)] bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black text-xl text-destructive">選手の削除</DialogTitle>
            <DialogDescription className="text-sm font-bold mt-2">
              本当に <span className="text-foreground">{deletePlayerTarget?.name}</span> 選手を削除してもよろしいですか？<br />
              <span className="text-xs text-muted-foreground">※この操作は取り消せません。</span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setDeletePlayerTarget(null)} className="flex-1 h-12 rounded-[var(--radius-xl)] font-black">キャンセル</Button>
            <Button type="button" variant="destructive" onClick={handleDeletePlayer} disabled={isSubmitting} className="flex-1 h-12 rounded-[var(--radius-xl)] font-black">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "削除する"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* スタッフ・保護者追加ダイアログ */}
      <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} className="rounded-[var(--radius-2xl)] bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black text-xl">メンバー追加 (選手以外)</DialogTitle>
            <DialogDescription className="text-xs font-bold text-muted-foreground">指導者・スタッフや保護者の名簿登録を行います。</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddMember} className="space-y-4 pt-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">名前 (必須)</label>
              <Input value={memberFormName} onChange={e => setMemberFormName(e.target.value)} placeholder="例: 佐藤 隆" required className="h-11 rounded-xl" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">フリガナ</label>
              <Input value={memberFormKana} onChange={e => setMemberFormKana(e.target.value)} placeholder="例: サトウ タカシ" className="h-11 rounded-xl" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">メンバー種別</label>
              <Select value={memberFormType} onChange={(e: any) => setMemberFormType(e.target.value)} className="h-11 rounded-xl bg-card">
                <option value="staff">指導者・スタッフ</option>
                <option value="parent">保護者</option>
                <option value="other">その他メンバー</option>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">電話番号 (連絡用)</label>
              <Input value={memberFormPhone} onChange={e => setMemberFormPhone(e.target.value)} placeholder="例: 090-XXXX-XXXX" className="h-11 rounded-xl" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">メールアドレス</label>
              <Input value={memberFormEmail} onChange={e => setMemberFormEmail(e.target.value)} placeholder="例: sato@example.com" type="email" className="h-11 rounded-xl" />
            </div>

            <div className="flex gap-3 pt-3">
              <Button type="button" variant="outline" onClick={() => setIsAddMemberOpen(false)} className="flex-1 h-12 rounded-xl font-black">キャンセル</Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1 h-12 rounded-xl font-black">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "登録する"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* スタッフ・保護者編集ダイアログ */}
      <Dialog open={!!editMemberTarget} onOpenChange={(open) => !open && setEditMemberTarget(null)}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} className="rounded-[var(--radius-2xl)] bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black text-xl">登録メンバーの編集</DialogTitle>
            <DialogDescription className="text-xs font-bold text-muted-foreground">登録内容を修正します。</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditMember} className="space-y-4 pt-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">名前 (必須)</label>
              <Input value={memberFormName} onChange={e => setMemberFormName(e.target.value)} placeholder="例: 佐藤 隆" required className="h-11 rounded-xl" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">フリガナ</label>
              <Input value={memberFormKana} onChange={e => setMemberFormKana(e.target.value)} placeholder="例: サトウ タカシ" className="h-11 rounded-xl" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">メンバー種別</label>
              <Select value={memberFormType} onChange={(e: any) => setMemberFormType(e.target.value)} className="h-11 rounded-xl bg-card">
                <option value="staff">指導者・スタッフ</option>
                <option value="parent">保護者</option>
                <option value="other">その他メンバー</option>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">電話番号</label>
              <Input value={memberFormPhone} onChange={e => setMemberFormPhone(e.target.value)} placeholder="例: 090-XXXX-XXXX" className="h-11 rounded-xl" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">
                メールアドレス {editMemberTarget?.userId && "(アカウント紐付け済のため編集不可)"}
              </label>
              <Input 
                value={memberFormEmail} 
                onChange={e => setMemberFormEmail(e.target.value)} 
                placeholder="例: sato@example.com" 
                type="email" 
                className="h-11 rounded-xl bg-zinc-50 dark:bg-zinc-900/50" 
                disabled={!!editMemberTarget?.userId}
              />
            </div>

            <div className="flex gap-3 pt-3">
              <Button type="button" variant="outline" onClick={() => setEditMemberTarget(null)} className="flex-1 h-12 rounded-xl font-black">キャンセル</Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1 h-12 rounded-xl font-black">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "更新する"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* スタッフ・保護者削除ダイアログ */}
      <Dialog open={!!deleteMemberTarget} onOpenChange={(open) => !open && setDeleteMemberTarget(null)}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} className="rounded-[var(--radius-2xl)] bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black text-xl text-destructive">メンバーの除外</DialogTitle>
            <DialogDescription className="text-sm font-bold mt-2">
              本当に <span className="text-foreground">{deleteMemberTarget?.name}</span> 様を名簿から除外してもよろしいですか？<br />
              <span className="text-xs text-muted-foreground">※この操作によってグループ所属なども削除されます。</span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setDeleteMemberTarget(null)} className="flex-1 h-12 rounded-[var(--radius-xl)] font-black">キャンセル</Button>
            <Button type="button" variant="destructive" onClick={handleDeleteMember} disabled={isSubmitting} className="flex-1 h-12 rounded-[var(--radius-xl)] font-black">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "除外する"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* アカウント紐付けダイアログ */}
      <Dialog open={!!linkTarget} onOpenChange={(open) => !open && setLinkTarget(null)}>
        <DialogContent className="rounded-[var(--radius-2xl)] bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black text-xl">アカウント紐付け</DialogTitle>
            <DialogDescription className="text-xs font-bold text-muted-foreground">
              名簿メンバー「{linkTarget?.name}」をアプリのログインユーザーに紐付けます。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">チームの参加メンバーから選択</label>
              {members.filter(m => m.userId && !members.some(x => x.userId === m.userId && x.memberId !== m.memberId && !x.userId)).length === 0 ? (
                <div className="text-xs text-muted-foreground py-2 text-center">選択可能な参加ユーザーがいません。先にチームへ招待・参加申請を行ってください。</div>
              ) : (
                <Select value={selectedUserId} onChange={(e: any) => setSelectedUserId(e.target.value)} className="h-11 rounded-xl bg-card">
                  <option value="">ユーザーを選択...</option>
                  {/* すでにチームメンバー(teamMembers)として登録されているログインユーザーの中で、まだ手動作成名簿メンバーに紐付いていないものをリスト */}
                  {members
                    .filter(m => m.userId && m.userId !== linkTarget?.userId)
                    .map(m => (
                      <option key={m.userId!} value={m.userId!}>{m.name} ({m.email || 'メールなし'})</option>
                    ))
                  }
                </Select>
              )}
            </div>

            <div className="flex gap-3 pt-3">
              <Button type="button" variant="outline" onClick={() => setLinkTarget(null)} className="flex-1 h-12 rounded-xl font-black">キャンセル</Button>
              <Button type="button" onClick={handleLinkUser} disabled={isSubmitting || !selectedUserId} className="flex-1 h-12 rounded-xl font-black">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "紐付ける"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* グループ追加ダイアログ */}
      <Dialog open={isAddGroupOpen} onOpenChange={setIsAddGroupOpen}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} className="rounded-[var(--radius-2xl)] bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black text-xl">
              {parentGroupId ? "子グループの追加" : "新規親グループの追加"}
            </DialogTitle>
            <DialogDescription className="text-xs font-bold text-muted-foreground">
              {parentGroupId 
                ? `グループ「${groups.find(g => g.id === parentGroupId)?.name}」の配下に作成します。`
                : "大元となる親グループを新しく定義します。"
              }
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddGroup} className="space-y-4 pt-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">グループ名 (必須)</label>
              <Input value={groupFormName} onChange={e => setGroupFormName(e.target.value)} placeholder="例: 保護者会、配車係" required className="h-11 rounded-xl" />
            </div>

            <div className="flex gap-3 pt-3">
              <Button type="button" variant="outline" onClick={() => setIsAddGroupOpen(false)} className="flex-1 h-12 rounded-xl font-black">キャンセル</Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1 h-12 rounded-xl font-black">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "作成する"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* グループ編集ダイアログ */}
      <Dialog open={!!editGroupTarget} onOpenChange={(open) => { if (!open) { setEditGroupTarget(null); setGroupFormParentId(null); } }}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} className="rounded-[var(--radius-2xl)] bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black text-xl">グループ情報の編集</DialogTitle>
            <DialogDescription className="text-xs font-bold text-muted-foreground">グループ名や所属する階層を変更します。</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditGroup} className="space-y-4 pt-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">グループ名 (必須)</label>
              <Input value={groupFormName} onChange={e => setGroupFormName(e.target.value)} required className="h-11 rounded-xl" />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">所属する親グループ</label>
              <Select 
                value={groupFormParentId || ""} 
                onChange={(e: any) => setGroupFormParentId(e.target.value || null)}
                className="h-11 rounded-xl bg-card"
              >
                <option value="">親グループなし (最上位)</option>
                {groups
                  .filter(g => g.id !== editGroupTarget?.id && g.parentId !== editGroupTarget?.id) // 循環防止
                  .map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))
                }
              </Select>
            </div>

            <div className="flex gap-3 pt-3">
              <Button type="button" variant="outline" onClick={() => { setEditGroupTarget(null); setGroupFormParentId(null); }} className="flex-1 h-12 rounded-xl font-black">キャンセル</Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1 h-12 rounded-xl font-black">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存する"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* グループ削除ダイアログ */}
      <Dialog open={!!deleteGroupTarget} onOpenChange={(open) => !open && setDeleteGroupTarget(null)}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} className="rounded-[var(--radius-2xl)] bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black text-xl text-destructive">グループの削除</DialogTitle>
            <DialogDescription className="text-sm font-bold mt-2">
              本当にグループ「<span className="text-foreground">{deleteGroupTarget?.name}</span>」を削除しますか？<br />
              <span className="text-xs text-muted-foreground">※配下の子グループやメンバー所属データもまとめて削除されます。</span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setDeleteGroupTarget(null)} className="flex-1 h-12 rounded-[var(--radius-xl)] font-black">キャンセル</Button>
            <Button type="button" variant="destructive" onClick={handleDeleteGroup} disabled={isSubmitting} className="flex-1 h-12 rounded-[var(--radius-xl)] font-black">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "削除する"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* グループメンバー追加ダイアログ */}
      <Dialog open={isAddGroupMemberOpen} onOpenChange={setIsAddGroupMemberOpen}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} className="rounded-[var(--radius-2xl)] bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black text-xl">グループへのメンバー追加</DialogTitle>
            <DialogDescription className="text-xs font-bold text-muted-foreground">
              グループ「{selectedGroup?.name}」にメンバーを所属させます。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddGroupMember} className="space-y-4 pt-3">
            {/* メンバータイプ選択 (選手 or スタッフ・保護者) */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">追加対象</label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 dark:bg-zinc-900 border border-border rounded-xl">
                <button
                  type="button"
                  onClick={() => { setSelectedAddMemberType("player"); setSelectedAddMemberId(""); }}
                  className={cn(
                    "py-1.5 text-[11px] font-black rounded-lg cursor-pointer",
                    selectedAddMemberType === "player" ? "bg-white dark:bg-zinc-800 text-primary shadow-xs" : "text-muted-foreground"
                  )}
                >
                  選手
                </button>
                <button
                  type="button"
                  onClick={() => { setSelectedAddMemberType("other"); setSelectedAddMemberId(""); }}
                  className={cn(
                    "py-1.5 text-[11px] font-black rounded-lg cursor-pointer",
                    selectedAddMemberType === "other" ? "bg-white dark:bg-zinc-800 text-primary shadow-xs" : "text-muted-foreground"
                  )}
                >
                  スタッフ・保護者
                </button>
              </div>
            </div>

            {/* メンバー選択セレクト */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">メンバーの選択</label>
              {selectedAddMemberType === "player" ? (
                players.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-2 text-center">登録されている選手がいません</div>
                ) : (
                  <Select value={selectedAddMemberId} onChange={(e: any) => setSelectedAddMemberId(e.target.value)} className="h-11 rounded-xl bg-card">
                    <option value="">選手を選択...</option>
                    {players.map(p => (
                      <option key={p.id} value={p.id}>{p.name} (#{p.uniformNumber})</option>
                    ))}
                  </Select>
                )
              ) : (
                members.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-2 text-center">登録されているスタッフ・保護者がいません</div>
                ) : (
                  <Select value={selectedAddMemberId} onChange={(e: any) => setSelectedAddMemberId(e.target.value)} className="h-11 rounded-xl bg-card">
                    <option value="">スタッフ・保護者を選択...</option>
                    {members
                      .map(m => (
                        <option key={m.memberId} value={m.memberId}>
                          {m.name} ({m.memberType === 'staff' ? 'スタッフ' : m.memberType === 'parent' ? '保護者' : 'その他'})
                        </option>
                      ))
                    }
                  </Select>
                )
              )}
            </div>

            {/* グループ内役割入力 */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">グループ内での役割（任意）</label>
              <Input value={addGroupMemberRole} onChange={e => setAddGroupMemberRole(e.target.value)} placeholder="例: 会長、会計、車当番、カメラ" className="h-11 rounded-xl" />
            </div>

            {/* グループ内システムロール選択 (選手以外のみ) */}
            {selectedAddMemberType === "other" && (
              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">割り当てるシステム権限（任意）</label>
                <Select value={addGroupMemberSystemRole} onChange={(e: any) => setAddGroupMemberSystemRole(e.target.value)} className="h-11 rounded-xl bg-card">
                  <option value="">権限を変更しない (現在のまま)</option>
                  <option value="manager">監督・代表者 (フルアクセス)</option>
                  <option value="coach">コーチ (チーム管理・編集)</option>
                  <option value="scorer">スコアラー (スコア入力)</option>
                  <option value="staff">スタッフ</option>
                  <option value="parent">保護者 (閲覧のみ)</option>
                </Select>
              </div>
            )}

            <div className="flex gap-3 pt-3">
              <Button type="button" variant="outline" onClick={() => { setIsAddGroupMemberOpen(false); setAddGroupMemberSystemRole(""); }} className="flex-1 h-12 rounded-xl font-black">キャンセル</Button>
              <Button type="submit" disabled={isSubmitting || !selectedAddMemberId} className="flex-1 h-12 rounded-xl font-black">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "追加する"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* グループメンバー役割・権限編集ダイアログ */}
      <Dialog open={isEditGroupMemberOpen} onOpenChange={(open) => !open && setIsEditGroupMemberOpen(false)}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} className="rounded-[var(--radius-2xl)] bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black text-xl">メンバー役割と権限の編集</DialogTitle>
            <DialogDescription className="text-xs font-bold text-muted-foreground">
              グループ「{selectedGroup?.name}」における「{editingGroupMember?.name}」様の役割とシステム権限を修正します。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditGroupMember} className="space-y-4 pt-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">グループ内での役割（任意）</label>
              <Input value={editGroupMemberRole} onChange={e => setEditGroupMemberRole(e.target.value)} placeholder="例: 会長、会計、車当番" className="h-11 rounded-xl" />
            </div>

            {/* システムロール選択 (選手以外のみ) */}
            {editingGroupMember?.type !== "player" && (
              <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">割り当てるシステム権限（任意）</label>
                <Select value={editGroupMemberSystemRole} onChange={(e: any) => setEditGroupMemberSystemRole(e.target.value)} className="h-11 rounded-xl bg-card">
                  <option value="">権限を変更しない (現在のまま)</option>
                  <option value="manager">監督・代表者 (フルアクセス)</option>
                  <option value="coach">コーチ (チーム管理・編集)</option>
                  <option value="scorer">スコアラー (スコア入力)</option>
                  <option value="staff">スタッフ</option>
                  <option value="parent">保護者 (閲覧のみ)</option>
                </Select>
              </div>
            )}

            <div className="flex gap-3 pt-3">
              <Button type="button" variant="outline" onClick={() => setIsEditGroupMemberOpen(false)} className="flex-1 h-12 rounded-xl font-black">キャンセル</Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1 h-12 rounded-xl font-black">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存する"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
