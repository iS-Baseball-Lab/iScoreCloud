// filepath: src/app/liff/admin/roles/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { toast } from "sonner";
import {
  Check,
  Edit2,
  GitMerge,
  KeyRound,
  Loader2,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import type {
  AdminRoleMemberItem,
  AdminRolesResponse,
} from "@/api/liff/admin-management";
import { AdminMgmtShell } from "@/components/liff/AdminMgmtShell";
import { useLiff } from "@/components/liff/LiffProvider";
import {
  LiffSelect,
  type LiffSelectBadgeTone,
} from "@/components/liff/LiffSelect";
import {
  invalidateLiffApiCache,
  peekLiffApiCache,
} from "@/lib/liff/api-cache";

interface RoleMasterDef {
  role: string;
  defaultLabel: string;
  badgeTone: LiffSelectBadgeTone;
  summary: string;
  canAdminMenu: boolean;
  canScoreInput: boolean;
  canScheduleEdit: boolean;
}

const ROLE_MASTER_LIST: ReadonlyArray<RoleMasterDef> = [
  {
    role: "manager",
    defaultLabel: "監督・代表",
    badgeTone: "rose",
    summary: "全管理メニュー・参加承認・編成・スコア・予定のすべてを操作可能",
    canAdminMenu: true,
    canScoreInput: true,
    canScheduleEdit: true,
  },
  {
    role: "admin",
    defaultLabel: "IT管理者",
    badgeTone: "amber",
    summary: "監督と同等の全管理権限（保護者会長・事務局・システム担当向け）",
    canAdminMenu: true,
    canScoreInput: true,
    canScheduleEdit: true,
  },
  {
    role: "coach",
    defaultLabel: "コーチ",
    badgeTone: "primary",
    summary: "オーダー作成・スコア記録・選手育成・予定の編集が可能",
    canAdminMenu: false,
    canScoreInput: true,
    canScheduleEdit: true,
  },
  {
    role: "scorer",
    defaultLabel: "スコアラー",
    badgeTone: "teal",
    summary: "試合のライブ一球速報・スコアブック記録・成績集計を担当",
    canAdminMenu: false,
    canScoreInput: true,
    canScheduleEdit: false,
  },
  {
    role: "staff",
    defaultLabel: "スタッフ",
    badgeTone: "emerald",
    summary: "審判・会計・配車係などのチーム運営サポート・予定連絡",
    canAdminMenu: false,
    canScoreInput: false,
    canScheduleEdit: true,
  },
  {
    role: "parent",
    defaultLabel: "保護者",
    badgeTone: "slate",
    summary: "家族の出欠回答・車出し登録・試合速報や資料の閲覧",
    canAdminMenu: false,
    canScoreInput: false,
    canScheduleEdit: false,
  },
  {
    role: "player",
    defaultLabel: "選手",
    badgeTone: "primary",
    summary: "自分の出欠回答・個人成績や自主練ノートの記録（中高生・草野球等）",
    canAdminMenu: false,
    canScoreInput: false,
    canScheduleEdit: false,
  },
  {
    role: "viewer",
    defaultLabel: "閲覧のみ（OB・応援）",
    badgeTone: "slate",
    summary: "試合速報・戦績の閲覧専用（名簿編集や出欠変更は不可）",
    canAdminMenu: false,
    canScoreInput: false,
    canScheduleEdit: false,
  },
];

export default function LiffAdminRolesPage() {
  const { currentTeam, profile } = useLiff();
  const teamId = currentTeam?.id || "demo-team";
  const endpointUrl = `/api/liff/admin/mgmt/roles?teamId=${encodeURIComponent(
    teamId
  )}`;

  const initialCached = useMemo(() => {
    if (typeof window === "undefined") return null;
    return peekLiffApiCache<AdminRolesResponse>(endpointUrl);
  }, [endpointUrl]);

  const [data, setData] = useState<AdminRolesResponse | null>(initialCached);
  const [isLoading, setIsLoading] = useState<boolean>(!initialCached);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [activeTab, setActiveTab] = useState<"members" | "titles">("members");
  const [roleFilter, setRoleFilter] = useState<
    "all" | "managers" | "coaches" | "parents" | "unlinked"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");

  // 役職カスタム呼称マップ
  const [customLabels, setCustomLabels] = useState<Record<string, string>>({});
  const [isSavingTitles, setIsSavingTitles] = useState(false);

  // メンバー追加・権限編集モーダル
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [editingMember, setEditingMember] =
    useState<AdminRoleMemberItem | null>(null);
  const [formName, setFormName] = useState("");
  const [formKana, setFormKana] = useState("");
  const [formMemberType, setFormMemberType] = useState("parent");
  const [formRole, setFormRole] = useState("parent");
  const [formSubRoles, setFormSubRoles] = useState<string[]>([]);
  const [formPhone, setFormPhone] = useState("");
  const [formSubLabel, setFormSubLabel] = useState("");
  const [isSavingMember, setIsSavingMember] = useState(false);

  // 除籍確認モーダル
  const [deletingMember, setDeletingMember] =
    useState<AdminRoleMemberItem | null>(null);
  const [isDeletingMember, setIsDeletingMember] = useState(false);

  const syncCustomLabelsFromResponse = useCallback(
    (res: AdminRolesResponse) => {
      const nextMap: Record<string, string> = {};
      for (const item of res.roleSettings || []) {
        if (item.role && item.customLabel) {
          nextMap[item.role] = item.customLabel;
        }
      }
      setCustomLabels(nextMap);
    },
    []
  );

  useEffect(() => {
    if (initialCached) {
      syncCustomLabelsFromResponse(initialCached);
    }
  }, [initialCached, syncCustomLabelsFromResponse]);

  const loadRoles = useCallback(
    async (bypassCache = false) => {
      if (bypassCache) {
        setIsRefreshing(true);
      } else {
        const syncHit = peekLiffApiCache<AdminRolesResponse>(endpointUrl);
        if (syncHit) {
          setData(syncHit);
          syncCustomLabelsFromResponse(syncHit);
          setIsLoading(false);
        } else {
          setIsLoading(true);
        }
      }

      try {
        const res = await fetch(
          endpointUrl,
          bypassCache
            ? { headers: { "x-iscore-bypass-cache": "1" } }
            : undefined
        );
        const json = (await res.json()) as AdminRolesResponse;
        if (res.ok && json.success) {
          setData(json);
          syncCustomLabelsFromResponse(json);
        } else if (json.error) {
          toast.error(json.error);
        }
      } catch {
        toast.error("権限データの取得に失敗しました");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [endpointUrl, syncCustomLabelsFromResponse]
  );

  useEffect(() => {
    void loadRoles(false);
  }, [loadRoles]);

  const getDisplayRoleLabel = useCallback(
    (roleKey: string): string => {
      const clean = roleKey.toLowerCase();
      if (customLabels[clean]?.trim()) {
        return customLabels[clean].trim();
      }
      const found = ROLE_MASTER_LIST.find((r) => r.role === clean);
      return found ? found.defaultLabel : roleKey;
    },
    [customLabels]
  );

  const openPreRegisterModal = () => {
    setEditingMember(null);
    setFormName("");
    setFormKana("");
    setFormMemberType("parent");
    setFormRole("parent");
    setFormSubRoles([]);
    setFormPhone("");
    setFormSubLabel("");
    setIsMemberModalOpen(true);
  };

  const openEditMemberModal = (m: AdminRoleMemberItem) => {
    setEditingMember(m);
    setFormName(m.name);
    setFormKana(m.nameKana || "");
    setFormMemberType(m.memberType || "parent");
    setFormRole(m.role || "parent");
    setFormSubRoles(m.subRoles.filter((sr) => sr !== m.role));
    setFormPhone(m.phone || "");
    setFormSubLabel(m.subLabel || "");
    setIsMemberModalOpen(true);
  };

  const toggleSubRole = (roleKey: string) => {
    if (roleKey === formRole) return;
    setFormSubRoles((prev) =>
      prev.includes(roleKey)
        ? prev.filter((x) => x !== roleKey)
        : [...prev, roleKey]
    );
  };

  const handleSaveMember = async () => {
    if (!formName.trim()) {
      toast.error("氏名を入力してください");
      return;
    }
    setIsSavingMember(true);
    try {
      const res = await fetch("/api/liff/admin/mgmt/roles/member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          userId: profile?.userId || undefined,
          memberId: editingMember?.memberId || null,
          name: formName.trim(),
          nameKana: formKana.trim(),
          memberType: formMemberType,
          phone: formPhone.trim(),
          role: formRole,
          subRoles: formSubRoles.filter((sr) => sr !== formRole),
          subLabel: formSubLabel.trim(),
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.success) {
        toast.error(json.error || "保存に失敗しました");
        return;
      }

      setIsMemberModalOpen(false);
      invalidateLiffApiCache();
      await loadRoles(true);
      toast.success(json.message || "権限を更新しました！");
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSavingMember(false);
    }
  };

  const handleDeleteMember = async () => {
    if (!deletingMember) return;
    setIsDeletingMember(true);
    try {
      const qs = new URLSearchParams({ teamId });
      if (profile?.userId) qs.set("userId", profile.userId);
      const res = await fetch(
        `/api/liff/admin/mgmt/roles/member/${encodeURIComponent(
          deletingMember.memberId
        )}?${qs.toString()}`,
        { method: "DELETE" }
      );
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.success) {
        toast.error(json.error || "削除に失敗しました");
        return;
      }

      setDeletingMember(null);
      invalidateLiffApiCache();
      await loadRoles(true);
      toast.success(json.message || "メンバーを削除しました");
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsDeletingMember(false);
    }
  };

  const handleSaveCustomTitles = async () => {
    setIsSavingTitles(true);
    try {
      const settingsPayload = ROLE_MASTER_LIST.map((rm) => ({
        role: rm.role,
        customLabel: (customLabels[rm.role] || "").trim(),
      })).filter(
        (item) =>
          item.customLabel.length > 0 &&
          item.customLabel !==
            ROLE_MASTER_LIST.find((r) => r.role === item.role)?.defaultLabel
      );

      const res = await fetch("/api/liff/admin/mgmt/roles/titles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          userId: profile?.userId || undefined,
          settings: settingsPayload,
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.success) {
        toast.error(json.error || "保存に失敗しました");
        return;
      }

      invalidateLiffApiCache();
      await loadRoles(true);
      toast.success(json.message || "役職のカスタム呼称を保存しました！");
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSavingTitles(false);
    }
  };

  const filteredMembers = useMemo(() => {
    const list = data?.members || [];
    const q = searchQuery.trim().toLowerCase();
    return list.filter((m) => {
      const allRoles = [m.role, ...m.subRoles];
      if (
        roleFilter === "managers" &&
        !allRoles.some((r) => r === "manager" || r === "admin")
      ) {
        return false;
      }
      if (
        roleFilter === "coaches" &&
        !allRoles.some((r) => r === "coach" || r === "scorer" || r === "staff")
      ) {
        return false;
      }
      if (
        roleFilter === "parents" &&
        !allRoles.some((r) => r === "parent" || r === "player" || r === "viewer")
      ) {
        return false;
      }
      if (roleFilter === "unlinked" && m.isLineLinked) {
        return false;
      }
      if (!q) return true;
      const hay = `${m.name} ${m.nameKana} ${getDisplayRoleLabel(m.role)} ${
        m.subLabel
      }`.toLowerCase();
      return hay.includes(q);
    });
  }, [data?.members, roleFilter, searchQuery, getDisplayRoleLabel]);

  const canManage = data ? data.canManage : true;

  return (
    <AdminMgmtShell
      title="権限・役職管理"
      subtitle="監督・IT管理者・兼務ロール・役職名の設定"
      icon={
        <span className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center justify-center font-black">
          <KeyRound className="w-4 h-4" />
        </span>
      }
      isLoading={isLoading}
      hasData={Boolean(data)}
      canManage={canManage}
      isDemo={data?.isDemo}
      onRefresh={() => void loadRoles(true)}
      isRefreshing={isRefreshing}
    >
      {/* メインタブ切替 */}
      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-card border border-border shadow-2xs">
        <button
          type="button"
          onClick={() => setActiveTab("members")}
          className={`h-9 rounded-xl text-xs cursor-pointer transition-colors ${
            activeTab === "members"
              ? "bg-[#0f172a] text-white font-black"
              : "text-muted-foreground font-bold hover:text-foreground"
          }`}
        >
          メンバー権限・兼務 ({data?.members.length || 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("titles")}
          className={`h-9 rounded-xl text-xs cursor-pointer transition-colors ${
            activeTab === "titles"
              ? "bg-[#0f172a] text-white font-black"
              : "text-muted-foreground font-bold hover:text-foreground"
          }`}
        >
          役職の呼称カスタム・権限表
        </button>
      </div>

      {activeTab === "members" ? (
        <div className="space-y-3">
          {/* アクションバー */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={openPreRegisterModal}
              className="h-9 px-3.5 rounded-xl bg-primary text-primary-foreground text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>＋ メンバーを事前登録</span>
            </button>

            <Link
              href="/liff/admin?tab=members"
              className="h-9 px-3 rounded-xl bg-card border border-border hover:bg-muted text-foreground text-xs font-bold flex items-center gap-1.5"
            >
              <GitMerge className="w-3.5 h-3.5 text-teal-600" />
              <span>LINE重複メンバー統合</span>
            </Link>
          </div>

          {/* 絞り込みチップ ＆ 検索 */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {[
              { id: "all" as const, label: "すべて" },
              { id: "managers" as const, label: "🔑 監督・IT管理" },
              { id: "coaches" as const, label: "⚾ コーチ・スコア・運営" },
              { id: "parents" as const, label: "👪 保護者・選手" },
              { id: "unlinked" as const, label: "LINE未連携" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setRoleFilter(f.id)}
                className={`h-8 px-2.5 rounded-xl border text-xs shrink-0 cursor-pointer ${
                  roleFilter === f.id
                    ? "bg-[#0f172a] text-white border-[#0f172a] font-black"
                    : "bg-card text-foreground border-border font-bold"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="氏名・かな・役職・当番班で検索..."
              className="w-full h-9 pl-9 pr-3 rounded-xl border border-border bg-card text-foreground text-xs font-bold"
            />
          </div>

          {/* メンバーカード一覧 */}
          <div className="space-y-2">
            {filteredMembers.map((m) => {
              const allRoles = [m.role, ...m.subRoles];
              const isManagerPower = allRoles.some(
                (r) => r === "manager" || r === "admin"
              );

              return (
                <div
                  key={m.memberId}
                  className="p-3.5 rounded-2xl border border-border bg-card shadow-2xs flex items-center justify-between gap-2.5"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs sm:text-sm font-black text-foreground">
                        {m.name}
                      </span>
                      {m.isLineLinked ? (
                        <span className="px-1.5 py-0.5 rounded bg-[#06C755]/15 text-[#059440] dark:text-[#2ee075] border border-[#06C755]/30 text-[10px] font-black">
                          LINE連携済
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border text-[10px] font-bold">
                          事前登録（未連携）
                        </span>
                      )}
                      {m.subLabel && (
                        <span className="px-2 py-0.5 rounded bg-teal-500/12 text-teal-700 dark:text-teal-300 border border-teal-500/30 text-[10px] font-black">
                          {m.subLabel}
                        </span>
                      )}
                    </div>

                    {/* 主ロール ＋ 兼務サブバッジ */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-black ${
                          isManagerPower
                            ? "bg-[#0f172a] text-amber-300"
                            : "bg-primary/12 text-primary border border-primary/25"
                        }`}
                      >
                        主: {getDisplayRoleLabel(m.role)}
                      </span>
                      {m.subRoles.map((sr) => (
                        <span
                          key={sr}
                          className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-[10px] font-black"
                        >
                          兼: {getDisplayRoleLabel(sr)}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditMemberModal(m)}
                      className="h-8 px-3 rounded-xl bg-[#0f172a] hover:bg-slate-800 text-white text-xs font-black flex items-center gap-1 cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3 text-teal-400" />
                      <span>権限変更</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingMember(m)}
                      title="メンバーを除籍・削除"
                      className="h-8 w-8 rounded-xl border border-border bg-background hover:bg-rose-600 text-muted-foreground hover:text-white flex items-center justify-center cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredMembers.length === 0 && (
              <div className="p-8 rounded-2xl border border-border bg-card text-center text-xs font-bold text-muted-foreground">
                条件に一致するメンバーが見つかりません
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 役職カスタム呼称カード */}
          <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
            <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-black text-white">
                  チーム独自の役職名カスタマイズ
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCustomLabels({})}
                className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>初期値に戻す</span>
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
                例:「IT管理者」→「父母会長・事務局」、「スタッフ」→「審判部」など、チームで普段使っている呼び名に変更できます（空欄は標準名を使用）。
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {ROLE_MASTER_LIST.map((rm) => (
                  <div
                    key={rm.role}
                    className="p-2.5 rounded-xl border border-border bg-background space-y-1"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-black text-foreground">
                        標準: {rm.defaultLabel}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {rm.role}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={customLabels[rm.role] || ""}
                      onChange={(e) =>
                        setCustomLabels((prev) => ({
                          ...prev,
                          [rm.role]: e.target.value,
                        }))
                      }
                      placeholder={`カスタム呼称（標準: ${rm.defaultLabel}）`}
                      maxLength={20}
                      className="w-full h-9 px-2.5 rounded-lg border border-border bg-card text-foreground text-xs font-bold"
                    />
                  </div>
                ))}
              </div>

              <button
                type="button"
                disabled={isSavingTitles}
                onClick={() => void handleSaveCustomTitles()}
                className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSavingTitles ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>役職の呼称設定を保存する</span>
              </button>
            </div>
          </section>

          {/* 権限マトリクス早見表 */}
          <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
            <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-400" />
              <h2 className="text-sm font-black text-white">
                ロール別 権限マトリクス一覧
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-muted border-b border-border text-[11px] font-black text-foreground">
                    <th className="p-2.5 text-left">役職（ロール）</th>
                    <th className="p-2 text-center">管理画面</th>
                    <th className="p-2 text-center">スコア記録</th>
                    <th className="p-2 text-center">予定作成</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ROLE_MASTER_LIST.map((rm) => (
                    <tr key={rm.role} className="bg-card">
                      <td className="p-2.5">
                        <div className="font-black text-foreground">
                          {getDisplayRoleLabel(rm.role)}
                        </div>
                        <div className="text-[10px] font-bold text-muted-foreground">
                          {rm.summary}
                        </div>
                      </td>
                      <td className="p-2 text-center font-black">
                        {rm.canAdminMenu ? "⭕" : "—"}
                      </td>
                      <td className="p-2 text-center font-black">
                        {rm.canScoreInput ? "⭕" : "—"}
                      </td>
                      <td className="p-2 text-center font-black">
                        {rm.canScheduleEdit ? "⭕" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ==================== モーダル: メンバー事前登録 / 権限・兼務編集 ==================== */}
      {isMemberModalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setIsMemberModalOpen(false)}
          >
            <div
              className="w-full sm:max-w-lg max-h-[90dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-card text-foreground shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-black text-white">
                    {editingMember
                      ? `${editingMember.name} さんの権限・兼務設定`
                      : "メンバーの事前登録 ＆ 権限設定"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMemberModalOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3.5 overflow-y-auto text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-black text-foreground">
                      氏名（必須）
                    </label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="例: 佐藤 健一"
                      className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-black text-muted-foreground">
                      ふりがな（任意）
                    </label>
                    <input
                      type="text"
                      value={formKana}
                      onChange={(e) => setFormKana(e.target.value)}
                      placeholder="例: さとう けんいち"
                      className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                    />
                  </div>
                </div>

                {/* 主ロール選択 */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-black text-foreground">
                    主となる役職（メインロール）
                  </label>
                  <LiffSelect
                    value={formRole}
                    onChange={(val) => {
                      setFormRole(val);
                      setFormSubRoles((prev) => prev.filter((x) => x !== val));
                      if (
                        val === "manager" ||
                        val === "coach" ||
                        val === "scorer" ||
                        val === "staff"
                      ) {
                        setFormMemberType("staff");
                      } else if (val === "player") {
                        setFormMemberType("player");
                      }
                    }}
                    options={ROLE_MASTER_LIST.map((rm) => ({
                      value: rm.role,
                      label: getDisplayRoleLabel(rm.role),
                      sublabel: rm.summary,
                      badge: rm.canAdminMenu ? "管理権限あり" : undefined,
                      badgeTone: rm.badgeTone,
                    }))}
                    title="主となる役職を選択"
                    accent="amber"
                    size="md"
                    className="w-full bg-background"
                  />
                </div>

                {/* 兼務ロール（複数選択可） */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-black text-foreground">
                    兼務ロール（複数選択可 — 例:「保護者」兼「IT管理者・スコアラー」）
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {ROLE_MASTER_LIST.filter((rm) => rm.role !== formRole).map(
                      (rm) => {
                        const checked = formSubRoles.includes(rm.role);
                        return (
                          <button
                            key={rm.role}
                            type="button"
                            onClick={() => toggleSubRole(rm.role)}
                            className={`px-2.5 py-2 rounded-xl border text-left flex items-center justify-between gap-1 cursor-pointer transition-colors ${
                              checked
                                ? "bg-amber-500 text-slate-950 border-amber-500 font-black"
                                : "bg-background text-foreground border-border hover:bg-muted font-bold"
                            }`}
                          >
                            <span className="truncate">
                              {getDisplayRoleLabel(rm.role)}
                            </span>
                            {checked && <Check className="w-3.5 h-3.5 shrink-0" />}
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>

                {/* 区分 ＆ 当番班・連絡先 */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-black text-muted-foreground">
                      名簿区分
                    </label>
                    <LiffSelect
                      value={formMemberType}
                      onChange={(val) => setFormMemberType(val)}
                      options={[
                        { value: "parent", label: "保護者" },
                        { value: "staff", label: "指導者・スタッフ" },
                        { value: "player", label: "選手本人" },
                      ]}
                      title="名簿区分を選択"
                      accent="slate"
                      size="md"
                      className="w-full bg-background"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-black text-muted-foreground">
                      当番班・担当ラベル（任意）
                    </label>
                    <input
                      type="text"
                      value={formSubLabel}
                      onChange={(e) => setFormSubLabel(e.target.value)}
                      placeholder="例: 1班 / 配車係"
                      className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-black text-muted-foreground">
                      緊急連絡先電話番号（任意）
                    </label>
                    <input
                      type="tel"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      placeholder="例: 090-0000-0000"
                      className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsMemberModalOpen(false)}
                  className="h-10 px-4 rounded-xl border border-border bg-muted text-foreground text-xs font-black cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={isSavingMember}
                  onClick={() => void handleSaveMember()}
                  className="h-10 px-5 rounded-xl bg-primary text-primary-foreground text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingMember ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>保存する</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ==================== モーダル: メンバー除籍確認 ==================== */}
      {deletingMember &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setDeletingMember(null)}
          >
            <div
              className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-border bg-card text-foreground shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-rose-500 flex items-center justify-between">
                <h3 className="text-sm font-black text-white">
                  メンバー削除の確認
                </h3>
                <button
                  type="button"
                  onClick={() => setDeletingMember(null)}
                  className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 space-y-1.5 text-xs">
                <p className="font-black text-foreground">
                  「{deletingMember.name}」さんをこのチーム名簿から削除しますか？
                </p>
                <p className="text-[11px] font-bold text-muted-foreground">
                  LINE重複アカウントの整理であれば、削除ではなく「LINE重複メンバー統合」を使うと過去の出欠・車両データを引き継げます。
                </p>
              </div>
              <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeletingMember(null)}
                  className="h-10 px-4 rounded-xl border border-border bg-muted text-foreground text-xs font-black cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={isDeletingMember}
                  onClick={() => void handleDeleteMember()}
                  className="h-10 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isDeletingMember ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  <span>削除する</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </AdminMgmtShell>
  );
}
