// filepath: src/app/(protected)/settings/team/roles/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Users, ShieldAlert } from "lucide-react";
import { ROLES } from "@/lib/roles";

// 💡 共通レイアウトコンポーネント（現場至上主義UI）
import { SectionHeader } from "@/components/layout/SectionHeader";
import { EmptyState } from "@/components/layout/EmptyState";

// 💡 共通機能コンポーネントのインポート
import { TeamMemberSummaryCards } from "@/components/features/teams/team-member-summary-cards";
import { TeamInviteCard } from "@/components/features/teams/team-invite-card";
import { TeamMemberCard, type TeamMember } from "@/components/features/teams/team-member-card";
import { TeamMemberRemoveModal } from "@/components/features/teams/team-member-remove-modal";

export default function TeamMembersPage() {
  const router = useRouter();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [myUserId, setMyUserId] = useState("");
  const [myRole, setMyRole] = useState("");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  
  // フィルター状態管理 ("all" | "pending" | "manager")
  const [filter, setFilter] = useState<string>("all");

  // ─── データの取得 (Cloudflare Workers API) ───
  const fetchMembers = useCallback(async (tid: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/teams/${tid}/members`);
      if (!res.ok) throw new Error();
      const json = await res.json() as { success: boolean; members?: TeamMember[]; inviteCode?: string };
      if (json.success && json.members) {
        setMembers(json.members);
        if (json.inviteCode) setInviteCode(json.inviteCode);
      }
    } catch {
      toast.error("メンバー情報の取得に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const tid = localStorage.getItem("iscore_selectedTeamId");
      if (!tid) {
        setIsLoading(false);
        return;
      }
      setTeamId(tid);

      try {
        const meRes = await fetch("/api/auth/me");
        const meJson = await meRes.json() as {
          success: boolean;
          data: {
            id: string;
            memberships: { teamId: string; teamName: string; role: string; isMainTeam: boolean }[];
          };
        };
        if (!meJson.success) throw new Error();

        const me = meJson.data;
        setMyUserId(me.id);

        const membership = me.memberships.find(m => m.teamId === tid)
          ?? me.memberships.find(m => m.isMainTeam)
          ?? me.memberships[0];

        if (!membership) { router.push("/teams"); return; }

        setTeamName(membership.teamName);
        setMyRole(membership.role);

        await fetchMembers(tid);
      } catch {
        toast.error("認証データの取得に失敗しました");
      }
    };
    init();
  }, [router, fetchMembers]);

  // ─── ロール変更 ───
  const handleRoleChange = async (memberId: string, newRole: string) => {
    if (!teamId) return;
    try {
      const res = await fetch(`/api/teams/${teamId}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const json = await res.json() as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error);

      setMembers(prev => prev.map(m =>
        m.memberId === memberId ? { ...m, role: newRole } : m
      ));
      toast.success("ロールを変更しました");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ロールの変更に失敗しました");
    }
  };

  // ─── 除名処理 ───
  const handleRemoveConfirm = async () => {
    if (!teamId || !removeTarget) return;
    setIsRemoving(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/members/${removeTarget.memberId}`, {
        method: "DELETE",
      });
      const json = await res.json() as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error);

      setMembers(prev => prev.filter(m => m.memberId !== removeTarget.memberId));
      toast.success(`${removeTarget.name} さんをチームから除名しました`);
      setRemoveTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "除名処理に失敗しました");
    } finally {
      setIsRemoving(false);
    }
  };

  // ─── フィルタリング & 集計 ───
  const activeMembers = members.filter(m => m.status === "active");
  const pendingMembers = members.filter(m => m.status === "pending");
  const managerCount = activeMembers.filter(m => m.role === ROLES.MANAGER).length;

  const filteredMembers = members.filter(m => {
    if (filter === "pending") return m.status === "pending";
    if (filter === "manager") return m.status === "active" && m.role === ROLES.MANAGER;
    return true; // "all"
  });

  const canManage = myRole === ROLES.MANAGER || myRole === "SYSTEM_ADMIN";

  // ─── 共通仕様ローディング ───
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

  // ─── 共通仕様チーム未選択 ───
  if (!teamId) {
    return (
      <div className="flex h-[60vh] items-center justify-center p-6 animate-in fade-in">
        <EmptyState 
          icon={ShieldAlert} 
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
            title="メンバー管理" 
            subtitle="MEMBERS" 
            showPulse={true} 
          />
          
          <div className="flex items-center justify-between bg-card p-3 rounded-[var(--radius-xl)] border border-border shadow-sm">
            <p className="text-sm font-black text-foreground flex items-center gap-1.5">
              <Users className="h-4 w-4 text-primary" />
              {activeMembers.length}
              <span className="text-xs font-bold text-muted-foreground">名参加中（{teamName}）</span>
            </p>
            <Button 
              onClick={() => fetchMembers(teamId)} 
              variant="ghost"
              size="sm" 
              className="h-9 w-9 p-0 rounded-[var(--radius-lg)]"
              title="情報を更新"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ━━ カテゴリ別サマリー ━━ */}
        <TeamMemberSummaryCards
          totalCount={activeMembers.length}
          pendingCount={pendingMembers.length}
          managerCount={managerCount}
          currentFilter={filter}
          onFilterChange={setFilter}
        />

        {/* ━━ 招待コード (マネージャー権限のみ表示) ━━ */}
        {canManage && inviteCode && <TeamInviteCard inviteCode={inviteCode} />}

        {/* ━━ メンバーリスト ━━ */}
        <div className="space-y-3">
          {filteredMembers.length === 0 ? (
            <EmptyState 
              icon={Users} 
              title="メンバーが見つかりません" 
              description="該当するステータスのユーザーは登録されていません。" 
              className="mt-4"
            />
          ) : (
            // 申請中を優先表示
            [...filteredMembers]
              .sort((a, b) => (a.status === "pending" ? -1 : 1))
              .map(member => (
                <TeamMemberCard
                  key={member.memberId}
                  member={member}
                  myUserId={myUserId}
                  myRole={myRole}
                  onRoleChange={handleRoleChange}
                  onRemove={setRemoveTarget}
                />
              ))
          )}
        </div>
      </div>

      {/* ━━ チームメンバー除名確認モーダル (現場仕様装備) ━━ */}
      <TeamMemberRemoveModal
        member={removeTarget}
        isRemoving={isRemoving}
        onConfirm={handleRemoveConfirm}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}
