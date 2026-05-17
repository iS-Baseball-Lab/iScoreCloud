// src/app/(protected)/teams/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { RiTeamFill } from "react-icons/ri";
import { toast } from "sonner";
import { Organization, Team } from "@/types/teams";

import { OrgList } from "./_components/org-list";
import { TeamList } from "./_components/team-list";
import { CreateOrgModal, OrgDetailModal } from "./_components/org-modals";
import { CreateTeamModal, TeamDetailModal } from "./_components/team-modals";

export default function TeamsPage() {
  const router = useRouter();

  const [view, setView] = useState<'orgs' | 'teams'>('orgs');
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);

  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(true);
  const [isLoadingTeams, setIsLoadingTeams] = useState(false);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const [isExternalOrgCreate, setIsExternalOrgCreate] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const [detailModal, setDetailModal] = useState<{ type: 'org' | 'team', data: Organization | Team } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('iscore_selectedCategory');
    if (saved) setSelectedCategory(saved);
    fetchOrgs();
  }, []);

  const fetchOrgs = async () => {
    setIsLoadingOrgs(true);
    try {
      const res = await fetch('/api/organizations');
      if (res.ok) setOrgs(await res.json());
    } catch (e) { console.error(e); }
    finally { setIsLoadingOrgs(false); }
  };

  const fetchTeams = async (orgId: string) => {
    setIsLoadingTeams(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}/teams`);
      if (res.ok) setTeams(await res.json());
    } catch (e) { console.error(e); }
    finally { setIsLoadingTeams(false); }
  };

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
    localStorage.setItem('iscore_selectedCategory', cat);
  };

  const handleSelectOrg = (org: Organization) => {
    setSelectedOrg(org);
    setView('teams');
    fetchTeams(org.id);
  };

  const handleTeamClick = (teamId: string) => {
    localStorage.setItem("iscore_selectedTeamId", teamId);
    if (selectedOrg) localStorage.setItem("iscore_selectedOrgId", selectedOrg.id);
    router.push('/dashboard');
  };

  const handleCreateOrg = async (name: string, category: string) => {
    if (!name.trim()) return;
    setIsCreating(true);
    try {
      const res = await fetch('/api/organizations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, isExternal: isExternalOrgCreate, category }),
      });
      const data = await res.json() as { success: boolean; error?: string };
      if (res.ok && data.success) {
        toast.success(isExternalOrgCreate ? "対戦相手を追加しました！" : "チームを作成しました！");
        setIsDrawerOpen(false);
        handleCategoryChange(category);
        fetchOrgs();
      } else toast.error(data.error || "作成に失敗しました");
    } catch (e) { toast.error("通信エラーが発生しました"); }
    finally { setIsCreating(false); }
  };

  const handleCreateTeam = async (name: string, role: string, year: number, tier: string, generation?: string, teamType?: string) => {
    if (!name.trim() || !selectedOrg) return;
    setIsCreating(true);
    try {
      const res = await fetch('/api/teams', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, role, organizationId: selectedOrg.id, year, tier, generation, teamType }),
      });
      const data = await res.json() as { success: boolean; error?: string };
      if (res.ok && data.success) {
        toast.success("編成を作成しました！");
        setIsDrawerOpen(false);
        fetchTeams(selectedOrg.id);
      } else toast.error(data.error || "作成に失敗しました");
    } catch (e) { toast.error("通信エラーが発生しました"); }
    finally { setIsCreating(false); }
  };

  type TeamExtraData = { year?: number; tier?: string; generation?: string; teamType?: string };
  const handleUpdate = async (newName: string, extraData?: string | TeamExtraData) => {
    if (!detailModal || !newName.trim()) return;
    setIsUpdating(true);
    try {
      const url = detailModal.type === 'org' ? `/api/organizations/${detailModal.data.id}` : `/api/teams/${detailModal.data.id}`;
      const bodyPayload: Record<string, unknown> = { name: newName };

      if (detailModal.type === 'org' && extraData) {
        bodyPayload.category = extraData;
      } else if (detailModal.type === 'team' && extraData && typeof extraData === 'object') {
        bodyPayload.year = extraData.year;
        bodyPayload.tier = extraData.tier;
        bodyPayload.generation = extraData.generation;
        bodyPayload.teamType = extraData.teamType;
      }

      const res = await fetch(url, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });

      if (res.ok) {
        toast.success("情報を更新しました");
        setDetailModal(null);
        if (detailModal.type === 'org') fetchOrgs();
        else if (selectedOrg) fetchTeams(selectedOrg.id);
      } else toast.error("更新に失敗しました");
    } catch (e) { toast.error("通信エラーが発生しました"); }
    finally { setIsUpdating(false); }
  };

  const handleDelete = async () => {
    if (!detailModal) return;
    const typeName = detailModal.type === 'org' ? 'チーム' : '編成';
    if (!confirm(`⚠️ 本当に${typeName}「${detailModal.data.name}」を削除しますか？\n（復旧はできません！）`)) return;

    setIsUpdating(true);
    try {
      const url = detailModal.type === 'org' ? `/api/organizations/${detailModal.data.id}` : `/api/teams/${detailModal.data.id}`;
      const res = await fetch(url, { method: 'DELETE' });
      if (res.ok) {
        toast.success(`${typeName}を削除しました`);
        setDetailModal(null);
        if (detailModal.type === 'org') {
          if (selectedOrg?.id === detailModal.data.id) { setSelectedOrg(null); setView('orgs'); }
          fetchOrgs();
        } else if (selectedOrg) fetchTeams(selectedOrg.id);
      } else toast.error("削除に失敗しました");
    } catch (e) { toast.error("通信エラーが発生しました"); }
    finally { setIsUpdating(false); }
  };

  return (
    <div className="flex flex-col min-h-screen text-foreground pb-32 relative overflow-x-hidden">
      <PageHeader href="/dashboard" icon={RiTeamFill} title="チーム" subtitle="所属するチームの作成・編集や対戦チームの確認が行えます。" />

      <main className="flex-1 px-4 sm:px-6 max-w-4xl mx-auto w-full mt-6 sm:mt-8 relative z-10">
        {view === 'orgs' ? (
          <OrgList
            orgs={orgs}
            isLoading={isLoadingOrgs}
            selectedCategory={selectedCategory}
            onCategoryChange={handleCategoryChange}
            onSelectOrg={handleSelectOrg}
            onOpenDetail={(e, org) => { e.preventDefault(); e.stopPropagation(); setDetailModal({ type: 'org', data: org }); }}
            onOpponentClick={(opp) => opp.originalOrg && handleSelectOrg(opp.originalOrg)}
            onAddOrg={(isExternal) => { setIsExternalOrgCreate(isExternal); setIsDrawerOpen(true); }}
          />
        ) : (
          selectedOrg && (
            <TeamList
              teams={teams}
              selectedOrg={selectedOrg}
              isLoading={isLoadingTeams}
              onBack={() => { setView('orgs'); setSelectedOrg(null); }}
              onTeamClick={handleTeamClick}
              onOpenDetail={(e, team) => { e.preventDefault(); e.stopPropagation(); setDetailModal({ type: 'team', data: team }); }}
            />
          )
        )}
      </main>

      {/* 🔥 究極UI: 浮遊感と発光エフェクトを持つFABボタン */}
      <Button
        onClick={() => { setIsExternalOrgCreate(false); setIsDrawerOpen(true); }}
        className="fixed bottom-8 right-4 sm:bottom-10 sm:right-8 h-16 w-16 rounded-full shadow-[0_8px_30px_rgba(var(--primary),0.4)] bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-300 hover:scale-110 active:scale-95 z-40 flex items-center justify-center group"
      >
        <Plus className="h-8 w-8 group-hover:rotate-90 transition-transform duration-300" />
      </Button>

      <CreateOrgModal
        isOpen={isDrawerOpen && view === 'orgs'}
        onOpenChange={setIsDrawerOpen}
        isCreating={isCreating}
        isExternalOrgCreate={isExternalOrgCreate}
        defaultCategory={selectedCategory === 'all' ? 'other' : selectedCategory}
        onSubmit={handleCreateOrg}
      />

      <CreateTeamModal
        isOpen={isDrawerOpen && view === 'teams'}
        onOpenChange={setIsDrawerOpen}
        isCreating={isCreating}
        onSubmit={handleCreateTeam}
      />

      <OrgDetailModal
        isOpen={!!detailModal && detailModal.type === 'org'}
        data={detailModal?.data as Organization}
        isUpdating={isUpdating}
        onClose={() => setDetailModal(null)}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
      />

      <TeamDetailModal
        isOpen={!!detailModal && detailModal.type === 'team'}
        data={detailModal?.data as Team}
        selectedOrgRole={selectedOrg?.myRole}
        isUpdating={isUpdating}
        onClose={() => setDetailModal(null)}
        onUpdate={(name, extraData) => handleUpdate(name, extraData)}
        onDelete={handleDelete}
      />
    </div>
  );
}