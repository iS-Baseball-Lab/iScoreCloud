// filepath: src/app/liff/admin/page.tsx
"use client";

import React, {
  Suspense,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ShieldCheck,
  UserCheck,
  Users,
  Copy,
  Share2,
  Check,
  X,
  Clock,
  Search,
  RefreshCw,
  Phone,
  Mail,
  Edit2,
  Lock,
  Sparkles,
  UserPlus,
  GitMerge,
  Loader2,
  KeyRound,
  RotateCcw,
  Trash2,
  Plus,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
} from "lucide-react";
import type { Liff } from "@line/liff";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { LiffDataLoadErrorCard } from "@/components/liff/LiffDataLoadErrorCard";
import { ADMIN_MGMT_NAV_ITEMS } from "@/components/liff/AdminMgmtShell";
import {
  LiffSelect,
  type LiffSelectBadgeTone,
} from "@/components/liff/LiffSelect";
import {
  canManageCurrentTeam,
  useLiff,
} from "@/components/liff/LiffProvider";
import {
  classifyAdminMemberCategory,
  computeAdminMemberFilterSummary,
  filterAdminMembers,
  formatCompactLinkedChildLabel,
  groupAndSortAdminMembers,
  resolveMemberAvatarMonogram,
  type AdminMemberCategoryKey,
  type AdminMemberFilterId,
  type AdminMemberListItem,
  type AdminMemberSortMode,
} from "@/lib/liff/admin-member-list";
import {
  invalidateLiffApiCache,
  peekLiffApiCache,
  warmupLiffEndpointForHref,
} from "@/lib/liff/api-cache";
import { handleLiffRootLinkClick } from "@/lib/liff/navigation";
import {
  buildLineMiniAppInviteTargets,
  getCachedLineMiniAppConfig,
  resolveLineMiniAppConfig,
  syncLineMiniAppConfigCache,
  type LineMiniAppConfig,
} from "@/lib/line-miniapp";
import {
  BUILTIN_ROLE_MASTER_LIST,
  CUSTOM_ROLE_PRESETS,
  MAX_CUSTOM_ROLES_PER_TEAM,
  PERMISSION_AXIS_METAS,
  evaluateEffectiveRolePermissions,
  generateCustomRoleKey,
  isBuiltinRoleModifiedFromDefault,
  normalizeRolePermissions,
  parseTeamRoleDefinitions,
  resolveRoleLabel,
  serializeTeamRolePermissionsJson,
  type CustomRolePresetTemplate,
  type RoleBadgeTone,
  type RolePermissionKey,
  type RolePermissions,
  type TeamRoleDefinition,
} from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type AdminTabId = "requests" | "members" | "titles" | "invite";

const DEMO_ROLE_DEFS_STORAGE_KEY = "iscore_demo_role_defs_v1";

const ROLE_BADGE_TONE_OPTIONS: ReadonlyArray<{
  value: RoleBadgeTone;
  label: string;
  chipClass: string;
}> = [
  {
    value: "teal",
    label: "ティール",
    chipClass:
      "bg-teal-500/15 text-teal-800 dark:text-teal-300 border-teal-500/35",
  },
  {
    value: "primary",
    label: "ブルー",
    chipClass: "bg-primary/12 text-primary border-primary/30",
  },
  {
    value: "amber",
    label: "アンバー",
    chipClass:
      "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/35",
  },
  {
    value: "emerald",
    label: "グリーン",
    chipClass:
      "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/35",
  },
  {
    value: "rose",
    label: "ローズ",
    chipClass:
      "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/35",
  },
  {
    value: "slate",
    label: "スレート",
    chipClass: "bg-muted text-foreground border-border",
  },
];

function getRoleTonePillClass(tone: RoleBadgeTone): string {
  const found = ROLE_BADGE_TONE_OPTIONS.find((o) => o.value === tone);
  return found ? found.chipClass : "bg-muted text-foreground border-border";
}

interface PendingRequest {
  memberId: string;
  userId?: string | null;
  name: string;
  nameKana?: string | null;
  memberType?: string | null;
  phone?: string | null;
  email?: string | null;
  joinedAt?: string;
  role?: string;
}

type ActiveMember = AdminMemberListItem;

interface RoleSettingItem {
  role: string;
  customLabel: string;
}

interface AdminDashboardData {
  success: boolean;
  isDemo?: boolean;
  canManage?: boolean;
  myRole?: string;
  liffId?: string;
  miniAppUrl?: string;
  error?: string;
  team?: {
    id: string;
    name: string;
    orgName?: string;
    shortName: string;
    logoImageUrl?: string;
    inviteCode: string;
  };
  stats?: {
    pendingCount: number;
    activeCount: number;
    playerCount: number;
  };
  pendingRequests?: PendingRequest[];
  activeMembers?: ActiveMember[];
  presetDutyGroups?: string[];
  roleSettings?: RoleSettingItem[];
  roleDefinitions?: TeamRoleDefinition[];
}

const PRESET_SUB_LABELS = [
  "1班",
  "2班",
  "3班",
  "4班",
  "配車",
  "審判",
  "用具",
  "救急",
];

function resolveInitialTab(raw: string | null): AdminTabId {
  if (raw === "invite") return "invite";
  if (raw === "titles") return "titles";
  if (raw === "members" || raw === "roles") return "members";
  return "requests";
}

function defaultApproveRoleForMemberType(memberType?: string | null): string {
  if (memberType === "staff") return "coach";
  if (memberType === "player") return "player";
  return "parent";
}

function readDemoStoredRoleDefinitions(
  fallbackSettings?: RoleSettingItem[]
): TeamRoleDefinition[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DEMO_ROLE_DEFS_STORAGE_KEY);
    if (!raw) return null;
    return parseTeamRoleDefinitions(raw, fallbackSettings);
  } catch {
    return null;
  }
}

function LiffAdminDashboardContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    currentTeam,
    profile,
    isDemo: providerDemo,
    liff,
    refreshTeams,
  } = useLiff();

  const teamId = useMemo(
    () =>
      currentTeam?.id ||
      (typeof window !== "undefined"
        ? localStorage.getItem("iscore_selectedTeamId")
        : "") ||
      "demo-team",
    [currentTeam?.id]
  );

  const dashboardEndpoint = useMemo(() => {
    const qs = new URLSearchParams({ teamId });
    const uid =
      profile?.userId ||
      (typeof window !== "undefined"
        ? localStorage.getItem("iscore_user_id")
        : "") ||
      "";
    const uName =
      profile?.displayName ||
      (typeof window !== "undefined"
        ? localStorage.getItem("iscore_user_name")
        : "") ||
      "";
    if (uid) qs.set("userId", uid);
    if (uName) qs.set("userName", uName);
    return `/api/liff/admin/dashboard?${qs.toString()}`;
  }, [teamId, profile?.userId, profile?.displayName]);

  const initialCached = useMemo(() => {
    if (typeof window === "undefined") return null;
    return peekLiffApiCache<AdminDashboardData>(dashboardEndpoint);
  }, [dashboardEndpoint]);

  const [activeTab, setActiveTab] = useState<AdminTabId>(() =>
    resolveInitialTab(searchParams.get("tab"))
  );
  const [data, setData] = useState<AdminDashboardData | null>(initialCached);
  const [isLoading, setIsLoading] = useState<boolean>(!initialCached);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 参加承認時の初期ロール選択マップ
  const [approveRoles, setApproveRoles] = useState<Record<string, string>>({});

  // メンバー検索・絞り込み・並び順モード・セクション開閉
  const [memberSearch, setMemberSearch] = useState("");
  const [memberFilter, setMemberFilter] =
    useState<AdminMemberFilterId>("all");
  const [memberSortMode, setMemberSortMode] =
    useState<AdminMemberSortMode>("role");
  const [collapsedMemberSections, setCollapsedMemberSections] = useState<
    Set<string>
  >(new Set());

  // 役職・権限設定（規定8役職 ＋ チーム独自カスタム役職）
  const [roleDefinitions, setRoleDefinitions] = useState<TeamRoleDefinition[]>(
    () =>
      parseTeamRoleDefinitions(
        initialCached?.roleDefinitions ?? null,
        initialCached?.roleSettings ?? null
      )
  );
  const [isSavingTitles, setIsSavingTitles] = useState(false);

  // 役職追加・権限編集モーダル
  const [isRoleEditorOpen, setIsRoleEditorOpen] = useState(false);
  const [roleEditorMode, setRoleEditorMode] = useState<"create" | "edit">(
    "edit"
  );
  const [editingRoleKey, setEditingRoleKey] = useState<string>("");
  const [editingRoleIsBuiltin, setEditingRoleIsBuiltin] = useState(true);
  const [editingRoleDefaultLabel, setEditingRoleDefaultLabel] = useState("");
  const [editingRoleLockManageTeam, setEditingRoleLockManageTeam] =
    useState(false);
  const [roleFormLabel, setRoleFormLabel] = useState("");
  const [roleFormTone, setRoleFormTone] = useState<RoleBadgeTone>("teal");
  const [roleFormSummary, setRoleFormSummary] = useState("");
  const [roleFormPermissions, setRoleFormPermissions] =
    useState<RolePermissions>({
      canManageTeam: false,
      canManageOps: false,
      canManagePlayers: false,
      canEditScore: false,
      canEditSchedule: false,
      canEditCarpool: false,
      canMutate: true,
    });

  // カスタム役職削除確認モーダル
  const [deletingRoleDef, setDeletingRoleDef] =
    useState<TeamRoleDefinition | null>(null);
  const [isResetRolesConfirmOpen, setIsResetRolesConfirmOpen] = useState(false);

  // メンバー手動追加・権限/兼務編集モーダル
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<ActiveMember | null>(null);
  const [formName, setFormName] = useState("");
  const [formKana, setFormKana] = useState("");
  const [formMemberType, setFormMemberType] = useState("parent");
  const [formRole, setFormRole] = useState("parent");
  const [formSubRoles, setFormSubRoles] = useState<string[]>([]);
  const [formPhone, setFormPhone] = useState("");
  const [formSubLabel, setFormSubLabel] = useState("");
  const [isSavingMember, setIsSavingMember] = useState(false);

  // メンバー削除確認モーダル
  const [deletingMember, setDeletingMember] = useState<ActiveMember | null>(
    null
  );
  const [isDeletingMember, setIsDeletingMember] = useState(false);

  // 🔗 メンバー統合（マージ）モーダル
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [mergeTargetMember, setMergeTargetMember] =
    useState<ActiveMember | null>(null);
  const [selectedSourceMemberId, setSelectedSourceMemberId] = useState("");
  const [isMerging, setIsMerging] = useState(false);

  // 招待コード・招待URLコピーフィードバック & LINEミニアプリ設定
  const [isCopied, setIsCopied] = useState(false);
  const [isUrlCopied, setIsUrlCopied] = useState(false);
  const [miniAppConfig, setMiniAppConfig] = useState<LineMiniAppConfig>(() =>
    getCachedLineMiniAppConfig()
  );
  const [mounted, setMounted] = useState(false);

  const syncRoleDefinitionsFromData = useCallback(
    (res: AdminDashboardData | null) => {
      if (!res) return;
      if (res.isDemo || teamId === "demo-team") {
        const demoStored = readDemoStoredRoleDefinitions(res.roleSettings);
        if (demoStored) {
          setRoleDefinitions(demoStored);
          return;
        }
      }
      setRoleDefinitions(
        parseTeamRoleDefinitions(
          res.roleDefinitions ?? null,
          res.roleSettings ?? null
        )
      );
    },
    [teamId]
  );

  useEffect(() => {
    if (initialCached) {
      syncRoleDefinitionsFromData(initialCached);
    }
  }, [initialCached, syncRoleDefinitionsFromData]);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam) {
      setActiveTab(resolveInitialTab(tabParam));
    }
  }, [searchParams]);

  // チーム切替時のローカル入力クリア
  useEffect(() => {
    setApproveRoles({});
    setMemberSearch("");
    setMemberFilter("all");
    setMemberSortMode("role");
    setCollapsedMemberSections(new Set());
    setIsRoleEditorOpen(false);
    setDeletingRoleDef(null);
    setIsResetRolesConfirmOpen(false);
  }, [teamId]);

  useEffect(() => {
    setMounted(true);
    let active = true;
    void resolveLineMiniAppConfig().then((resolved) => {
      if (active) setMiniAppConfig(resolved);
    });
    return () => {
      active = false;
    };
  }, []);

  const roleDefByKey = useMemo(() => {
    const map = new Map<string, TeamRoleDefinition>();
    for (const def of roleDefinitions) {
      map.set(def.role.toLowerCase(), def);
    }
    return map;
  }, [roleDefinitions]);

  const builtinRoleDefs = useMemo(
    () => roleDefinitions.filter((d) => d.isBuiltin),
    [roleDefinitions]
  );
  const customRoleDefs = useMemo(
    () => roleDefinitions.filter((d) => !d.isBuiltin),
    [roleDefinitions]
  );

  const roleMemberCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of data?.activeMembers || []) {
      const assigned = new Set<string>();
      if (m.role) assigned.add(m.role.toLowerCase());
      for (const sr of m.subRoles || []) {
        if (sr) assigned.add(sr.toLowerCase());
      }
      for (const key of assigned) {
        counts[key] = (counts[key] || 0) + 1;
      }
    }
    return counts;
  }, [data?.activeMembers]);

  const roleSelectOptions = useMemo(
    () =>
      roleDefinitions.map((rm) => ({
        value: rm.role,
        label: rm.isBuiltin ? rm.label : `${rm.label}`,
        sublabel: rm.summary,
        badge: rm.permissions.canManageTeam
          ? "管理権限"
          : !rm.isBuiltin
          ? "独自役職"
          : undefined,
        badgeTone: rm.badgeTone as LiffSelectBadgeTone,
      })),
    [roleDefinitions]
  );

  const getDisplayRoleLabel = useCallback(
    (roleKey: string): string => {
      const clean = (roleKey || "parent").toLowerCase();
      const found = roleDefByKey.get(clean);
      if (found) return found.label;
      return resolveRoleLabel(clean, roleDefinitions);
    },
    [roleDefByKey, roleDefinitions]
  );

  // ─── ダッシュボードデータの取得 ─────────────────────
  const loadDashboardData = useCallback(
    async (bypassCache = false) => {
      setLoadError(null);
      if (bypassCache) {
        setIsRefreshing(true);
      } else {
        const syncHit =
          peekLiffApiCache<AdminDashboardData>(dashboardEndpoint);
        if (syncHit) {
          setData(syncHit);
          syncRoleDefinitionsFromData(syncHit);
          setIsLoading(false);
        } else {
          setIsLoading(true);
        }
      }

      try {
        const res = await fetch(
          dashboardEndpoint,
          bypassCache
            ? { headers: { "x-iscore-bypass-cache": "1" } }
            : undefined
        );
        const json = (await res.json()) as AdminDashboardData;
        if (res.ok && json.success) {
          setData(json);
          syncRoleDefinitionsFromData(json);
          if (json.liffId || json.miniAppUrl) {
            setMiniAppConfig(
              syncLineMiniAppConfigCache({
                liffId: json.liffId,
                miniAppUrl: json.miniAppUrl,
              })
            );
          }
        } else {
          const msg = json.error || "管理者データの取得に失敗しました";
          setLoadError(msg);
          if (bypassCache) toast.error(msg);
        }
      } catch {
        setLoadError("通信エラーが発生しました");
        if (bypassCache) toast.error("管理者データの取得に失敗しました");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [dashboardEndpoint, syncRoleDefinitionsFromData]
  );

  useEffect(() => {
    void loadDashboardData(false);
  }, [loadDashboardData]);

  // ─── 参加申請の承認・却下アクション ─────────────────
  const handleRequestAction = async (
    req: PendingRequest,
    action: "approve" | "reject"
  ) => {
    const selectedRole =
      approveRoles[req.memberId] ||
      defaultApproveRoleForMemberType(req.memberType);

    try {
      const res = await fetch("/api/liff/admin/requests/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          memberId: req.memberId,
          action,
          role: selectedRole,
        }),
      });

      const resJson = (await res.json()) as {
        success?: boolean;
        error?: string;
      };
      if (resJson.success) {
        toast.success(
          action === "approve"
            ? `${req.name} さんを「${getDisplayRoleLabel(
                selectedRole
              )}」として承認しました！`
            : "参加申請を却下しました"
        );
        invalidateLiffApiCache();
        await loadDashboardData(true);
      } else {
        toast.error(resJson.error || "処理に失敗しました");
      }
    } catch {
      toast.error("通信エラーが発生しました");
    }
  };

  // ─── メンバー手動追加・権限/兼務モーダル ─────────────
  const openAddMemberModal = () => {
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

  const openEditMemberModal = (m: ActiveMember) => {
    const primary = (m.role || "parent").toLowerCase();
    const subs = (m.subRoles || []).filter((sr) => sr !== primary);
    setEditingMember(m);
    setFormName(m.name);
    setFormKana(m.nameKana || "");
    setFormMemberType(
      m.memberType === "staff" || m.memberType === "player"
        ? m.memberType
        : "parent"
    );
    setFormRole(primary);
    setFormSubRoles(subs);
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
      void refreshTeams();
      await loadDashboardData(true);
      toast.success(
        json.message ||
          (editingMember
            ? "メンバー・権限設定を更新しました！"
            : `「${formName.trim()}」さんを手動追加しました！`)
      );
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
      await loadDashboardData(true);
      toast.success(json.message || "メンバーを削除しました");
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsDeletingMember(false);
    }
  };

  // ─── 役職追加・権限カスタマイズ保存 ─────────────────
  const persistRoleDefinitions = async (
    nextDefs: TeamRoleDefinition[],
    successToastMessage: string
  ): Promise<boolean> => {
    setIsSavingTitles(true);
    try {
      const res = await fetch("/api/liff/admin/mgmt/roles/titles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          userId: profile?.userId || undefined,
          roleDefinitions: nextDefs,
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        isDemo?: boolean;
        roleDefinitions?: TeamRoleDefinition[];
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.success) {
        toast.error(json.error || "役職・権限設定の保存に失敗しました");
        return false;
      }

      const normalized = Array.isArray(json.roleDefinitions)
        ? parseTeamRoleDefinitions(json.roleDefinitions, null)
        : parseTeamRoleDefinitions(nextDefs, null);

      setRoleDefinitions(normalized);
      if (
        (json.isDemo || data?.isDemo || teamId === "demo-team") &&
        typeof window !== "undefined"
      ) {
        try {
          const serialized = serializeTeamRolePermissionsJson(normalized);
          localStorage.setItem(DEMO_ROLE_DEFS_STORAGE_KEY, serialized.json);
        } catch {
          // ignore quota error
        }
      }

      invalidateLiffApiCache();
      void refreshTeams();
      await loadDashboardData(true);
      toast.success(successToastMessage);
      return true;
    } catch {
      toast.error("通信エラーが発生しました");
      return false;
    } finally {
      setIsSavingTitles(false);
    }
  };

  const openCreateCustomRoleModal = (preset?: CustomRolePresetTemplate) => {
    if (customRoleDefs.length >= MAX_CUSTOM_ROLES_PER_TEAM) {
      toast.error(
        `チーム独自の役職は最大 ${MAX_CUSTOM_ROLES_PER_TEAM} 個まで登録できます`
      );
      return;
    }
    setRoleEditorMode("create");
    setEditingRoleKey(generateCustomRoleKey());
    setEditingRoleIsBuiltin(false);
    setEditingRoleDefaultLabel("");
    setEditingRoleLockManageTeam(false);
    setRoleFormLabel(preset ? preset.label : "");
    setRoleFormTone(preset ? preset.badgeTone : "teal");
    setRoleFormSummary(preset ? preset.summary : "");
    setRoleFormPermissions(
      preset
        ? { ...preset.permissions }
        : {
            canManageTeam: false,
            canManageOps: false,
            canManagePlayers: false,
            canEditScore: false,
            canEditSchedule: false,
            canEditCarpool: false,
            canMutate: true,
          }
    );
    setIsRoleEditorOpen(true);
  };

  const openEditRoleModal = (def: TeamRoleDefinition) => {
    setRoleEditorMode("edit");
    setEditingRoleKey(def.role);
    setEditingRoleIsBuiltin(def.isBuiltin);
    setEditingRoleDefaultLabel(def.defaultLabel);
    setEditingRoleLockManageTeam(def.lockManageTeamOn);
    setRoleFormLabel(def.isBuiltin ? def.customLabel : def.label);
    setRoleFormTone(def.badgeTone);
    setRoleFormSummary(def.summary);
    setRoleFormPermissions({ ...def.permissions });
    setIsRoleEditorOpen(true);
  };

  const handleToggleRolePermission = (permKey: RolePermissionKey) => {
    if (permKey === "canManageTeam" && editingRoleLockManageTeam) {
      return;
    }
    setRoleFormPermissions((prev) => {
      const nextRaw: RolePermissions = {
        ...prev,
        [permKey]: !prev[permKey],
      };
      return normalizeRolePermissions(nextRaw, prev, {
        lockManageTeamOn: editingRoleLockManageTeam,
      });
    });
  };

  const handleRestoreSingleBuiltinDefault = () => {
    if (!editingRoleIsBuiltin) return;
    const master = BUILTIN_ROLE_MASTER_LIST.find(
      (m) => m.role === editingRoleKey
    );
    if (!master) return;
    setRoleFormLabel("");
    setRoleFormTone(master.badgeTone);
    setRoleFormSummary(master.summary);
    setRoleFormPermissions({ ...master.defaultPermissions });
  };

  const handleSaveRoleEditor = async () => {
    const trimmedLabel = roleFormLabel.trim().slice(0, 20);
    if (!editingRoleIsBuiltin && !trimmedLabel) {
      toast.error("チーム独自の役職名を入力してください（例: 配車係）");
      return;
    }

    const normalizedPerms = normalizeRolePermissions(
      roleFormPermissions,
      roleFormPermissions,
      { lockManageTeamOn: editingRoleLockManageTeam }
    );

    let nextDefs: TeamRoleDefinition[];
    if (roleEditorMode === "create") {
      const duplicate = roleDefinitions.some(
        (d) => d.label.trim() === trimmedLabel
      );
      if (duplicate) {
        toast.error(`「${trimmedLabel}」と同じ名前の役職が既に存在します`);
        return;
      }
      const newDef: TeamRoleDefinition = {
        role: editingRoleKey || generateCustomRoleKey(),
        isBuiltin: false,
        defaultLabel: trimmedLabel,
        customLabel: trimmedLabel,
        label: trimmedLabel,
        badgeTone: roleFormTone,
        summary: roleFormSummary.trim().slice(0, 80) || "チーム独自の役職",
        priority: 10,
        lockManageTeamOn: false,
        permissions: normalizedPerms,
      };
      nextDefs = [...roleDefinitions, newDef];
    } else {
      nextDefs = roleDefinitions.map((d) => {
        if (d.role !== editingRoleKey) return d;
        if (d.isBuiltin) {
          const cleanCustom =
            trimmedLabel && trimmedLabel !== d.defaultLabel
              ? trimmedLabel
              : "";
          return {
            ...d,
            customLabel: cleanCustom,
            label: cleanCustom || d.defaultLabel,
            badgeTone: roleFormTone,
            summary: roleFormSummary.trim().slice(0, 80) || d.summary,
            permissions: normalizedPerms,
          };
        }
        return {
          ...d,
          defaultLabel: trimmedLabel,
          customLabel: trimmedLabel,
          label: trimmedLabel,
          badgeTone: roleFormTone,
          summary: roleFormSummary.trim().slice(0, 80) || "チーム独自の役職",
          permissions: normalizedPerms,
        };
      });
    }

    const ok = await persistRoleDefinitions(
      nextDefs,
      roleEditorMode === "create"
        ? `チーム役職「${trimmedLabel}」を追加しました！`
        : `役職「${
            editingRoleIsBuiltin
              ? trimmedLabel || editingRoleDefaultLabel
              : trimmedLabel
          }」の権限設定を保存しました！`
    );
    if (ok) {
      setIsRoleEditorOpen(false);
    }
  };

  const handleConfirmDeleteCustomRole = async () => {
    if (!deletingRoleDef || deletingRoleDef.isBuiltin) return;
    const nextDefs = roleDefinitions.filter(
      (d) => d.role !== deletingRoleDef.role
    );
    const deletedLabel = deletingRoleDef.label;
    const ok = await persistRoleDefinitions(
      nextDefs,
      `役職「${deletedLabel}」を削除しました`
    );
    if (ok) {
      setDeletingRoleDef(null);
    }
  };

  const handleConfirmResetAllBuiltinRoles = async () => {
    const resetBuiltins = parseTeamRoleDefinitions(null, null);
    const nextDefs = [...resetBuiltins, ...customRoleDefs];
    const ok = await persistRoleDefinitions(
      nextDefs,
      "規定8役職の呼称と権限を標準の初期設定に戻しました"
    );
    if (ok) {
      setIsResetRolesConfirmOpen(false);
    }
  };

  // ─── メンバー統合モーダル操作 ─────────────────────────
  const handleOpenMergeModal = (targetMember?: ActiveMember) => {
    const membersList = data?.activeMembers || [];
    if (targetMember) {
      setMergeTargetMember(targetMember);
      const candidate = membersList.find(
        (m) =>
          m.memberId !== targetMember.memberId &&
          (Boolean(m.userId) || m.name === targetMember.name)
      );
      setSelectedSourceMemberId(candidate ? candidate.memberId : "");
    } else {
      const unlinked = membersList.find((m) => !m.userId);
      setMergeTargetMember(unlinked || membersList[0] || null);
      setSelectedSourceMemberId("");
    }
    setIsMergeModalOpen(true);
  };

  const handleExecuteMerge = async () => {
    if (!mergeTargetMember || !selectedSourceMemberId) {
      toast.error(
        "残す名簿メンバーと、統合するアカウントの両方を選択してください"
      );
      return;
    }
    if (mergeTargetMember.memberId === selectedSourceMemberId) {
      toast.error("同じメンバー同士を統合することはできません");
      return;
    }

    const source = data?.activeMembers?.find(
      (m) => m.memberId === selectedSourceMemberId
    );
    if (
      !window.confirm(
        `「${mergeTargetMember.name}（残す名簿）」に「${
          source?.name || "アカウント"
        }（LINE連携側）」を統合しますか？\n\n統合すると、過去の記録（出欠履歴・配車・親子関係等）を残したまま、重複アカウントが1つに合流されます。`
      )
    ) {
      return;
    }

    try {
      setIsMerging(true);
      const uid =
        profile?.userId ||
        (typeof window !== "undefined"
          ? localStorage.getItem("iscore_user_id")
          : "") ||
        "";

      const res = await fetch("/api/liff/admin/members/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          targetMemberId: mergeTargetMember.memberId,
          sourceMemberId: selectedSourceMemberId,
          userId: uid,
        }),
      });

      const json = (await res.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
      };
      if (res.ok && json.success) {
        toast.success(json.message || "メンバーを正常に統合しました！");
        setIsMergeModalOpen(false);
        setMergeTargetMember(null);
        setSelectedSourceMemberId("");
        invalidateLiffApiCache();
        await loadDashboardData(true);
      } else {
        toast.error(json.error || "メンバーの統合に失敗しました");
      }
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "メンバー統合処理に失敗しました"
      );
    } finally {
      setIsMerging(false);
    }
  };

  // ─── 招待コードのコピー & LINEシェア ──────────────────
  const inviteCode = data?.team?.inviteCode || currentTeam?.id || "DEMO2026";
  const inviteTargets = useMemo(
    () =>
      buildLineMiniAppInviteTargets({
        config: miniAppConfig,
        inviteCode,
        origin:
          typeof window !== "undefined" ? window.location.origin : undefined,
      }),
    [inviteCode, miniAppConfig]
  );
  const inviteUrl = inviteTargets.primaryInviteUrl;

  const handleCopyInvite = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(inviteCode);
      setIsCopied(true);
      toast.success("招待コードをコピーしました！");
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleCopyInviteUrl = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(inviteUrl);
      setIsUrlCopied(true);
      toast.success("参加申請URLをコピーしました！");
      setTimeout(() => setIsUrlCopied(false), 2000);
    }
  };

  const handleShareLine = async () => {
    const teamLabel =
      data?.team?.name ||
      currentTeam?.orgName ||
      currentTeam?.name ||
      "チーム";
    const text = `⚾【${teamLabel}】iScoreCloud LINEミニアプリへの参加招待です！\n下のリンクをタップすると、招待コード自動入力済みの参加申請画面が開きます。\n\n📲 1タップ参加申請URL:\n${inviteUrl}\n\n🔑 招待コード: ${inviteCode}\n※申請後、管理者の承認が完了すると予定・出欠・配車・試合データが自動解禁されます。`;

    try {
      if (liff && liff.isApiAvailable("shareTargetPicker")) {
        if (inviteUrl.startsWith("https://")) {
          try {
            const flexMessages: Parameters<Liff["shareTargetPicker"]>[0] = [
              {
                type: "flex",
                altText:
                  `【${teamLabel}】iScoreCloud LINEミニアプリ参加招待（コード: ${inviteCode}）`.slice(
                    0,
                    380
                  ),
                contents: {
                  type: "bubble",
                  size: "mega",
                  header: {
                    type: "box",
                    layout: "horizontal",
                    spacing: "md",
                    alignItems: "center",
                    backgroundColor: "#0f172a",
                    paddingAll: "14px",
                    contents: [
                      {
                        type: "image",
                        url: "https://iscorecloud.com/liff-logo.png?v=3",
                        size: "40px",
                        aspectRatio: "1:1",
                        aspectMode: "fit",
                        flex: 0,
                      },
                      {
                        type: "box",
                        layout: "vertical",
                        flex: 1,
                        contents: [
                          {
                            type: "text",
                            text: "iScoreCloud LINEミニアプリ",
                            weight: "bold",
                            size: "sm",
                            color: "#f8fafc",
                          },
                          {
                            type: "text",
                            text: "チーム参加招待",
                            size: "xxs",
                            color: "#94a3b8",
                          },
                        ],
                      },
                    ],
                  },
                  body: {
                    type: "box",
                    layout: "vertical",
                    spacing: "md",
                    paddingAll: "16px",
                    backgroundColor: "#ffffff",
                    contents: [
                      {
                        type: "text",
                        text: `【${teamLabel}】`,
                        weight: "bold",
                        size: "md",
                        color: "#0f172a",
                        wrap: true,
                      },
                      {
                        type: "text",
                        text: "下のボタンから参加申請画面を開けます（招待コードは自動入力されます）。管理者の承認後にチーム画面が解禁されます。",
                        size: "xs",
                        color: "#475569",
                        wrap: true,
                      },
                      {
                        type: "box",
                        layout: "vertical",
                        spacing: "xs",
                        backgroundColor: "#f1f5f9",
                        cornerRadius: "10px",
                        paddingAll: "10px",
                        contents: [
                          {
                            type: "text",
                            text: "🔑 チーム招待コード",
                            size: "xxs",
                            weight: "bold",
                            color: "#64748b",
                          },
                          {
                            type: "text",
                            text: inviteCode,
                            size: "sm",
                            weight: "bold",
                            color: "#0f172a",
                            wrap: true,
                          },
                        ],
                      },
                    ],
                  },
                  footer: {
                    type: "box",
                    layout: "vertical",
                    spacing: "sm",
                    paddingAll: "14px",
                    backgroundColor: "#ffffff",
                    contents: [
                      {
                        type: "button",
                        style: "primary",
                        color: "#06C755",
                        height: "sm",
                        action: {
                          type: "uri",
                          label: "ミニアプリで参加申請する",
                          uri: inviteUrl,
                        },
                      },
                    ],
                  },
                },
              },
            ];
            const flexRes = await liff.shareTargetPicker(flexMessages);
            if (flexRes) {
              toast.success("LINEで招待カードを共有しました！");
            }
            return;
          } catch {
            // Flex送信非対応環境ではテキスト共有へ自動フォールバック
          }
        }

        const textRes = await liff.shareTargetPicker([
          {
            type: "text",
            text,
          },
        ]);
        if (textRes) {
          toast.success("LINEで招待を共有しました");
        }
      } else {
        window.open(
          `https://line.me/R/msg/text/?${encodeURIComponent(text)}`,
          "_blank"
        );
      }
    } catch {
      window.open(
        `https://line.me/R/msg/text/?${encodeURIComponent(text)}`,
        "_blank"
      );
    }
  };

  // メンバー件数集計・絞り込み・セクション別整列
  const allActiveMembers = useMemo(
    () => data?.activeMembers || [],
    [data?.activeMembers]
  );

  const memberFilterSummary = useMemo(
    () => computeAdminMemberFilterSummary(allActiveMembers, roleDefinitions),
    [allActiveMembers, roleDefinitions]
  );

  const filteredActiveMembers = useMemo(
    () =>
      filterAdminMembers(allActiveMembers, {
        filter: memberFilter,
        searchQuery: memberSearch,
        roleDefinitions,
      }),
    [allActiveMembers, memberFilter, memberSearch, roleDefinitions]
  );

  const memberSections = useMemo(
    () =>
      groupAndSortAdminMembers(filteredActiveMembers, {
        sortMode: memberSortMode,
        filter: memberFilter,
        roleDefinitions,
        allTeamMembersForKanaHint: allActiveMembers,
        presetDutyGroups: data?.presetDutyGroups,
      }),
    [
      filteredActiveMembers,
      memberSortMode,
      memberFilter,
      roleDefinitions,
      allActiveMembers,
      data?.presetDutyGroups,
    ]
  );

  const hasActiveMemberQuery = Boolean(
    memberSearch.trim() || memberFilter !== "all"
  );

  const toggleMemberSectionCollapsed = useCallback((sectionKey: string) => {
    setCollapsedMemberSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }
      return next;
    });
  }, []);

  const areAllMemberSectionsCollapsed = useMemo(() => {
    if (memberSections.length <= 1 || hasActiveMemberQuery) return false;
    return memberSections.every((sec) =>
      collapsedMemberSections.has(sec.key)
    );
  }, [memberSections, collapsedMemberSections, hasActiveMemberQuery]);

  const toggleAllMemberSectionsCollapsed = useCallback(() => {
    if (areAllMemberSectionsCollapsed) {
      setCollapsedMemberSections(new Set());
    } else {
      setCollapsedMemberSections(
        new Set(memberSections.map((sec) => sec.key))
      );
    }
  }, [areAllMemberSectionsCollapsed, memberSections]);

  const dutyPresetChips = useMemo(() => {
    const merged: string[] = [];
    const seen = new Set<string>();
    for (const item of [
      ...(data?.presetDutyGroups || []),
      ...PRESET_SUB_LABELS,
    ]) {
      const clean = item.trim();
      if (clean && !seen.has(clean)) {
        seen.add(clean);
        merged.push(clean);
      }
    }
    return merged;
  }, [data?.presetDutyGroups]);

  const pendingCount = data?.pendingRequests?.length || 0;
  const activeCount =
    data?.activeMembers?.length ?? data?.stats?.activeCount ?? 0;
  const linkedActiveCount = Math.max(
    0,
    activeCount - memberFilterSummary.unlinkedCount
  );

  const isAuthorized =
    providerDemo || data?.isDemo
      ? true
      : data
      ? Boolean(data.canManage)
      : canManageCurrentTeam(currentTeam, false);

  return (
    <div className="flex flex-col flex-1 bg-background text-foreground">
      {/* 🌟 ヘッダー */}
      <LiffHeader
        shareData={{
          title: `メンバー・権限管理 - ${data?.team?.name || "チーム"}`,
          text: `参加承認・メンバー管理・権限設定はこちらから行えます。`,
        }}
      />

      <div className="p-4 space-y-4">
        {/* ページタイトル */}
        <div className="flex items-center justify-between gap-2">
          <LiffPageHeader
            title="メンバー・権限管理"
            subtitle="参加承認・手動追加・役職/兼務・LINE招待"
            icon={
              <span className="w-8 h-8 rounded-xl bg-slate-500/12 text-slate-700 dark:text-slate-300 border border-slate-500/25 flex items-center justify-center font-black">
                <ShieldCheck className="w-4 h-4" />
              </span>
            }
            showBack
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void loadDashboardData(true)}
            disabled={isRefreshing}
            className="h-8 px-2.5 rounded-full text-xs font-bold text-muted-foreground hover:text-foreground shrink-0"
          >
            <RefreshCw
              className={cn("w-3.5 h-3.5 mr-1", isRefreshing && "animate-spin")}
            />
            <span>更新</span>
          </Button>
        </div>

        {/* 6つの管理画面横断クイックスイッチャー */}
        {(isAuthorized || isLoading) && (
          <nav
            aria-label="管理メニュー切替"
            className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1"
          >
            {ADMIN_MGMT_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = item.href === "/liff/admin";
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onPointerDown={() => warmupLiffEndpointForHref(item.href)}
                  className={`h-8 px-2.5 rounded-xl border text-xs flex items-center gap-1.5 shrink-0 transition-colors ${
                    isActive
                      ? "bg-[#0f172a] text-white border-[#0f172a] font-black shadow-xs"
                      : "bg-card text-foreground border-border hover:bg-muted font-bold"
                  }`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isActive ? "text-teal-400" : "text-muted-foreground"
                    }`}
                  />
                  <span>{item.shortLabel}</span>
                </Link>
              );
            })}
          </nav>
        )}

        {/* 通信失敗時のリカバリーカード */}
        {!isLoading && !data && loadError && (
          <LiffDataLoadErrorCard
            title="管理データを読み込めませんでした"
            description={loadError}
            onRetry={() => void loadDashboardData(true)}
            isRetrying={isRefreshing}
          />
        )}

        {/* 🔒 権限エラー表示（監督・管理者でない場合） */}
        {!isLoading && data && !isAuthorized && (
          <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
            <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-rose-500 px-4 py-3 flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-400/30 flex items-center justify-center shrink-0">
                <Lock className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-black text-white">
                  権限がありません
                </h3>
                <p className="text-[10px] font-bold text-slate-300">
                  管理者専用メニュー
                </p>
              </div>
            </div>
            <div className="p-6 text-center space-y-3">
              <p className="text-xs text-muted-foreground font-bold">
                この画面はチームの「監督・代表」または「IT管理者」に指定されたメンバーのみ利用可能です。
              </p>
              <Link
                href="/liff"
                onClick={(e) => handleLiffRootLinkClick(e, router, pathname)}
                className="inline-block mt-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-black"
              >
                チームHUBへ戻る
              </Link>
            </div>
          </div>
        )}

        {isAuthorized && (data || isLoading) && (
          <>
            {/* 🧢 チーム＆権限ステータスサマリー */}
            <div className="p-3.5 rounded-2xl border border-border bg-card shadow-xs flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-[10px] font-black uppercase tracking-wider text-primary">
                    {data?.myRole
                      ? `${getDisplayRoleLabel(data.myRole)}権限`
                      : "管理者モード"}
                  </span>
                  {data?.isDemo && (
                    <span className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-[9px] font-black">
                      体験デモ
                    </span>
                  )}
                </div>
                <h2 className="text-sm font-black truncate text-foreground">
                  {data?.team?.name || currentTeam?.name || "チーム"}
                </h2>
              </div>

              <div className="flex items-center gap-2 shrink-0 text-right">
                <button
                  type="button"
                  onClick={() => setActiveTab("requests")}
                  className={cn(
                    "px-2.5 py-1 rounded-xl border text-right cursor-pointer transition-colors",
                    pendingCount > 0
                      ? "bg-amber-500/15 border-amber-500/30 hover:bg-amber-500/20"
                      : "bg-muted/35 border-border hover:bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "text-[9px] font-bold block",
                      pendingCount > 0
                        ? "text-amber-700 dark:text-amber-300"
                        : "text-muted-foreground"
                    )}
                  >
                    未承認
                  </span>
                  <span
                    className={cn(
                      "text-xs font-black",
                      pendingCount > 0
                        ? "text-amber-700 dark:text-amber-300"
                        : "text-foreground"
                    )}
                  >
                    {pendingCount}件
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("members")}
                  className="px-2.5 py-1 rounded-xl bg-muted/35 hover:bg-muted border border-border text-right cursor-pointer transition-colors"
                >
                  <span className="text-[9px] font-bold text-muted-foreground block">
                    メンバー
                  </span>
                  <span className="text-xs font-black text-foreground">
                    {activeCount}名
                  </span>
                </button>
              </div>
            </div>

            {/* 🌟 4分割セグメントタブ切り替え（参加承認 / メンバー / 役職設定 / LINE招待） */}
            <div className="grid grid-cols-4 gap-1 bg-muted/80 dark:bg-muted/50 p-1 rounded-2xl border border-border">
              <button
                type="button"
                onClick={() => setActiveTab("requests")}
                className={cn(
                  "flex items-center justify-center gap-1 py-2 px-1 rounded-xl text-[11px] transition-all cursor-pointer",
                  activeTab === "requests"
                    ? "bg-card text-foreground shadow-xs border border-border font-black"
                    : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                )}
              >
                <UserCheck
                  className={cn(
                    "w-3.5 h-3.5 shrink-0 hidden sm:inline",
                    activeTab === "requests" ? "text-primary" : ""
                  )}
                />
                <span className="truncate">参加承認</span>
                {pendingCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 text-[9.5px] font-black shrink-0">
                    {pendingCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("members")}
                className={cn(
                  "flex items-center justify-center gap-1 py-2 px-1 rounded-xl text-[11px] transition-all cursor-pointer",
                  activeTab === "members"
                    ? "bg-card text-foreground shadow-xs border border-border font-black"
                    : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                )}
              >
                <Users
                  className={cn(
                    "w-3.5 h-3.5 shrink-0 hidden sm:inline",
                    activeTab === "members" ? "text-primary" : ""
                  )}
                />
                <span className="truncate">メンバー</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("titles")}
                className={cn(
                  "flex items-center justify-center gap-1 py-2 px-1 rounded-xl text-[11px] transition-all cursor-pointer",
                  activeTab === "titles"
                    ? "bg-card text-foreground shadow-xs border border-border font-black"
                    : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                )}
              >
                <KeyRound
                  className={cn(
                    "w-3.5 h-3.5 shrink-0 hidden sm:inline",
                    activeTab === "titles" ? "text-amber-600" : ""
                  )}
                />
                <span className="truncate">役職設定</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("invite")}
                className={cn(
                  "flex items-center justify-center gap-1 py-2 px-1 rounded-xl text-[11px] transition-all cursor-pointer",
                  activeTab === "invite"
                    ? "bg-card text-foreground shadow-xs border border-border font-black"
                    : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                )}
              >
                <Share2
                  className={cn(
                    "w-3.5 h-3.5 shrink-0 hidden sm:inline",
                    activeTab === "invite" ? "text-[#06C755]" : ""
                  )}
                />
                <span className="truncate">LINE招待</span>
              </button>
            </div>

            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                🅰️ 【参加承認】タブ
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            {activeTab === "requests" && (
              <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden animate-in fade-in duration-200">
                <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-slate-500 px-4 py-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-7 h-7 rounded-xl bg-slate-800 text-slate-200 border border-slate-700 flex items-center justify-center shrink-0">
                      <UserCheck className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-xs sm:text-sm font-black text-white truncate">
                        参加申請一覧
                      </h3>
                      <p className="text-[10px] font-bold text-slate-300 truncate">
                        役職を選んで承認するとチーム画面が解禁されます
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 text-[11px] font-black shrink-0">
                    {pendingCount}件
                  </span>
                </div>

                <div className="p-4">
                  {isLoading && !data ? (
                    <div className="p-8 rounded-2xl border border-border bg-muted/20 text-center text-xs font-bold text-muted-foreground">
                      申請データを読み込み中...
                    </div>
                  ) : pendingCount === 0 ? (
                    <div className="p-6 rounded-2xl border border-border bg-muted/20 text-center space-y-3">
                      <Check className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto" />
                      <div className="space-y-1">
                        <p className="text-xs font-black text-foreground">
                          承認待ちの参加申請はありません
                        </p>
                        <p className="text-[11px] text-muted-foreground font-medium">
                          LINE招待リンクの共有、またはLINE未利用メンバーの手動追加が行えます
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setActiveTab("invite")}
                          className="h-9 px-3.5 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white text-xs font-black inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span>LINEで招待する</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab("members");
                            openAddMemberModal();
                          }}
                          className="h-9 px-3.5 rounded-xl bg-card hover:bg-muted border border-border text-foreground text-xs font-black inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5 text-primary" />
                          <span>手動でメンバー追加</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {data?.pendingRequests?.map((req) => {
                        const selectedApproveRole =
                          approveRoles[req.memberId] ||
                          defaultApproveRoleForMemberType(req.memberType);

                        return (
                          <div
                            key={req.memberId}
                            className="p-3.5 rounded-2xl border border-border bg-card shadow-xs space-y-3"
                          >
                            {/* 承認待ちカード内ヘッダー */}
                            <div className="p-2.5 rounded-xl bg-amber-500/[0.08] border border-amber-500/25 border-l-4 border-l-amber-500 flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                                    承認待ち
                                  </span>
                                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-primary/12 text-primary border border-primary/25">
                                    {req.memberType === "father"
                                      ? "父"
                                      : req.memberType === "mother"
                                      ? "母"
                                      : req.memberType === "staff"
                                      ? "指導・スタッフ"
                                      : req.memberType === "player"
                                      ? "選手"
                                      : "保護者"}
                                  </span>
                                  <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-0.5">
                                    <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                    {req.joinedAt
                                      ? new Date(
                                          req.joinedAt
                                        ).toLocaleDateString("ja-JP", {
                                          month: "numeric",
                                          day: "numeric",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })
                                      : "申請中"}
                                  </span>
                                </div>
                                <h4 className="text-sm font-black text-foreground truncate">
                                  {req.name}
                                </h4>
                                {req.nameKana && (
                                  <p className="text-[10px] font-bold text-muted-foreground truncate">
                                    {req.nameKana}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* 連絡先情報 */}
                            {(req.phone || req.email) && (
                              <div className="p-2 rounded-xl bg-muted/35 border border-border text-[11px] space-y-1">
                                {req.phone && (
                                  <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Phone className="w-3 h-3 shrink-0" />
                                    <a
                                      href={`tel:${req.phone}`}
                                      className="font-bold text-primary hover:underline"
                                    >
                                      {req.phone}
                                    </a>
                                  </div>
                                )}
                                {req.email && (
                                  <div className="flex items-center gap-1.5 text-muted-foreground truncate">
                                    <Mail className="w-3 h-3 shrink-0" />
                                    <span className="truncate">{req.email}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* 承認時の初期ロール選択 */}
                            <div className="space-y-1">
                              <label className="block text-[10px] font-black text-muted-foreground">
                                承認時に付与する役職
                              </label>
                              <LiffSelect
                                value={selectedApproveRole}
                                onChange={(val) =>
                                  setApproveRoles((prev) => ({
                                    ...prev,
                                    [req.memberId]: val,
                                  }))
                                }
                                options={roleSelectOptions}
                                title={`${req.name} さんの役職を選択`}
                                accent="slate"
                                size="sm"
                                className="w-full"
                              />
                            </div>

                            {/* 操作ボタン */}
                            <div className="flex items-center gap-2 pt-1 border-t border-border">
                              <Button
                                type="button"
                                size="sm"
                                onClick={() =>
                                  void handleRequestAction(req, "approve")
                                }
                                className="flex-1 h-9 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-black text-xs shadow-xs gap-1"
                              >
                                <Check className="w-4 h-4" />
                                <span>承認する</span>
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `${req.name} さんの参加申請を却下しますか？`
                                    )
                                  ) {
                                    void handleRequestAction(req, "reject");
                                  }
                                }}
                                className="h-9 px-3 rounded-xl border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-600 hover:text-white hover:border-rose-600 font-bold text-xs"
                              >
                                <X className="w-4 h-4 mr-0.5" />
                                <span>却下</span>
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                🅱️ 【メンバー（手動追加・権限・兼務・統合）】タブ
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            {activeTab === "members" && (
              <div className="space-y-3 animate-in fade-in duration-200">
                {/* 1. コントロール＆絞り込みパネル */}
                <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
                  <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 px-4 py-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-7 h-7 rounded-xl bg-slate-800 text-amber-400 border border-slate-700 flex items-center justify-center shrink-0">
                        <Users className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-xs sm:text-sm font-black text-white truncate">
                          メンバー一覧・権限・兼務管理
                        </h3>
                        <p className="text-[10px] font-bold text-slate-300 truncate">
                          行タップまたは「編集」から役職・兼務・当番班を変更
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {memberFilterSummary.unlinkedCount > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setMemberFilter((prev) =>
                              prev === "unlinked" ? "all" : "unlinked"
                            )
                          }
                          className={cn(
                            "px-2 py-1 rounded-lg border text-[10px] font-black cursor-pointer transition-colors",
                            memberFilter === "unlinked"
                              ? "bg-amber-400 text-slate-950 border-amber-300"
                              : "bg-amber-500/20 text-amber-200 border-amber-400/35 hover:bg-amber-500/30"
                          )}
                        >
                          未連携 {memberFilterSummary.unlinkedCount}
                        </button>
                      )}
                      <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 text-[10.5px] font-black">
                        LINE {linkedActiveCount}/{activeCount}名
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 space-y-2.5">
                    {/* アクションバー（手動追加 ／ LINE重複統合・家族班管理） */}
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <button
                        type="button"
                        onClick={openAddMemberModal}
                        className="h-9 px-3.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black inline-flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all"
                      >
                        <UserPlus className="w-3.5 h-3.5 shrink-0" />
                        <span>メンバー追加</span>
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenMergeModal()}
                          className="h-9 px-2.5 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-[11px] font-black inline-flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95 transition-all"
                        >
                          <GitMerge className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                          <span>LINE統合</span>
                        </button>

                        <Link
                          href="/liff/admin/family"
                          onPointerDown={() =>
                            warmupLiffEndpointForHref("/liff/admin/family")
                          }
                          className="h-9 px-2.5 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-[11px] font-black inline-flex items-center gap-1 shadow-2xs active:scale-95 transition-all"
                        >
                          <Users className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span>家族・班割当</span>
                          <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                        </Link>
                      </div>
                    </div>

                    {/* 検索ボックス */}
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      <Input
                        type="text"
                        placeholder="氏名・かな・役職・お子様(#背番号)・当番班で検索..."
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        className="pl-9 pr-8 h-9 rounded-xl text-xs font-bold bg-background border-border"
                      />
                      {memberSearch && (
                        <button
                          type="button"
                          onClick={() => setMemberSearch("")}
                          aria-label="検索条件をクリア"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* 並び順・グルーピング切替バー ＋ 一括開閉 */}
                    <div className="flex items-center justify-between gap-2">
                      <div
                        role="tablist"
                        aria-label="メンバー一覧の並び順"
                        className="grid grid-cols-3 gap-1 bg-muted/80 dark:bg-muted/50 p-1 rounded-xl border border-border flex-1"
                      >
                        {(
                          [
                            { id: "role", label: "役職別" },
                            { id: "kana", label: "五十音順" },
                            { id: "duty", label: "当番班別" },
                          ] as const
                        ).map((mode) => {
                          const active = memberSortMode === mode.id;
                          return (
                            <button
                              key={mode.id}
                              type="button"
                              role="tab"
                              aria-selected={active}
                              onClick={() => {
                                setMemberSortMode(mode.id);
                                setCollapsedMemberSections(new Set());
                              }}
                              className={cn(
                                "h-7 px-2 rounded-lg text-[11px] flex items-center justify-center gap-1 transition-colors cursor-pointer",
                                active
                                  ? "bg-[#0f172a] text-white font-black shadow-2xs"
                                  : "text-muted-foreground hover:text-foreground font-bold"
                              )}
                            >
                              {active && (
                                <ArrowUpDown className="w-3 h-3 text-teal-400 shrink-0 hidden sm:inline" />
                              )}
                              <span className="truncate">{mode.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      {memberSections.length > 1 && !hasActiveMemberQuery && (
                        <button
                          type="button"
                          onClick={toggleAllMemberSectionsCollapsed}
                          className="h-9 px-2.5 rounded-xl border border-border bg-background hover:bg-muted text-[10.5px] font-black text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
                        >
                          <ChevronDown
                            className={cn(
                              "w-3.5 h-3.5 transition-transform",
                              areAllMemberSectionsCollapsed && "-rotate-90"
                            )}
                          />
                          <span>
                            {areAllMemberSectionsCollapsed
                              ? "すべて開く"
                              : "すべて畳む"}
                          </span>
                        </button>
                      )}
                    </div>

                    {/* 役職別・ステータス絞り込みチップ（兼務を含む延べ所属数バッジ付き） */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 -mx-0.5 px-0.5">
                      <button
                        type="button"
                        onClick={() => setMemberFilter("all")}
                        className={cn(
                          "h-7 px-2.5 rounded-xl border text-[11px] inline-flex items-center gap-1 shrink-0 transition-colors cursor-pointer",
                          memberFilter === "all"
                            ? "bg-[#0f172a] text-white border-[#0f172a] font-black"
                            : "bg-background text-muted-foreground border-border hover:text-foreground font-bold"
                        )}
                      >
                        <span>全員</span>
                        <span
                          className={cn(
                            "text-[10px] font-black",
                            memberFilter === "all"
                              ? "text-teal-300"
                              : "text-muted-foreground/80"
                          )}
                        >
                          {memberFilterSummary.totalCount}
                        </span>
                      </button>

                      {memberFilterSummary.roleChips.map((chip) => {
                        const active = memberFilter === chip.filterId;
                        return (
                          <button
                            key={chip.filterId}
                            type="button"
                            onClick={() =>
                              setMemberFilter((prev) =>
                                prev === chip.filterId ? "all" : chip.filterId
                              )
                            }
                            className={cn(
                              "h-7 px-2.5 rounded-xl border text-[11px] inline-flex items-center gap-1 shrink-0 transition-colors cursor-pointer",
                              active
                                ? "bg-[#0f172a] text-white border-[#0f172a] font-black"
                                : "bg-background text-muted-foreground border-border hover:text-foreground font-bold"
                            )}
                          >
                            <span>{chip.label}</span>
                            <span
                              className={cn(
                                "text-[10px] font-black",
                                active
                                  ? "text-teal-300"
                                  : "text-muted-foreground/80"
                              )}
                            >
                              {chip.count}
                            </span>
                          </button>
                        );
                      })}

                      {(memberFilterSummary.unlinkedCount > 0 ||
                        memberFilter === "unlinked") && (
                        <button
                          type="button"
                          onClick={() =>
                            setMemberFilter((prev) =>
                              prev === "unlinked" ? "all" : "unlinked"
                            )
                          }
                          className={cn(
                            "h-7 px-2.5 rounded-xl border text-[11px] inline-flex items-center gap-1 shrink-0 transition-colors cursor-pointer",
                            memberFilter === "unlinked"
                              ? "bg-[#0f172a] text-white border-[#0f172a] font-black"
                              : "bg-background text-muted-foreground border-border hover:text-foreground font-bold"
                          )}
                        >
                          <span>📝 未連携</span>
                          <span
                            className={cn(
                              "text-[10px] font-black",
                              memberFilter === "unlinked"
                                ? "text-amber-300"
                                : "text-muted-foreground/80"
                            )}
                          >
                            {memberFilterSummary.unlinkedCount}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                </section>

                {/* 2. セクション別・整列メンバーリスト（各くくり内は名前の昇順） */}
                {filteredActiveMembers.length === 0 ? (
                  <div className="p-8 text-center text-xs font-bold text-muted-foreground rounded-2xl border border-border bg-card shadow-xs space-y-2.5">
                    <p>条件に一致するメンバーが見つかりません</p>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {hasActiveMemberQuery && (
                        <button
                          type="button"
                          onClick={() => {
                            setMemberSearch("");
                            setMemberFilter("all");
                          }}
                          className="h-8 px-3 rounded-xl border border-border bg-background hover:bg-muted text-foreground text-[11px] font-black inline-flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>絞り込みを解除</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={openAddMemberModal}
                        className="h-8 px-3 rounded-xl bg-primary text-primary-foreground text-[11px] font-black inline-flex items-center gap-1 cursor-pointer"
                      >
                        <UserPlus className="w-3 h-3" />
                        <span>新しいメンバーを手動追加</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {memberSections.map((section) => {
                      const isCollapsed =
                        !hasActiveMemberQuery &&
                        collapsedMemberSections.has(section.key);

                      return (
                        <section
                          key={section.key}
                          className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden"
                        >
                          {/* セクションダークキャップ（タップで開閉） */}
                          <button
                            type="button"
                            onClick={() =>
                              toggleMemberSectionCollapsed(section.key)
                            }
                            aria-expanded={!isCollapsed}
                            className={cn(
                              "w-full px-3.5 py-2 bg-[#0f172a] text-slate-50 flex items-center justify-between gap-2 text-left cursor-pointer hover:bg-slate-900 transition-colors",
                              !isCollapsed &&
                                `border-b-[3px] ${section.accent.capBorderClass}`
                            )}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-xs font-black text-white truncate">
                                {section.title}
                              </span>
                              {section.isCustomRole && (
                                <span className="px-1.5 py-0.2 rounded bg-teal-500/20 text-teal-200 border border-teal-400/35 text-[9.5px] font-black shrink-0">
                                  独自
                                </span>
                              )}
                              {section.subtitle && (
                                <span className="hidden sm:inline text-[10px] font-bold text-slate-400 truncate">
                                  — {section.subtitle}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {Boolean(
                                section.concurrentCount &&
                                  section.concurrentCount > 0
                              ) && (
                                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700 text-[9.5px] font-bold">
                                  兼務{section.concurrentCount}
                                </span>
                              )}
                              <span
                                className={cn(
                                  "px-2 py-0.5 rounded-md text-[10.5px] font-black",
                                  section.accent.countBadgeClass
                                )}
                              >
                                {section.members.length}名
                              </span>
                              <ChevronDown
                                className={cn(
                                  "w-4 h-4 text-slate-300 transition-transform",
                                  isCollapsed && "-rotate-90"
                                )}
                              />
                            </div>
                          </button>

                          {/* コンパクト整列メンバー行（名前の昇順） */}
                          {!isCollapsed && (
                            <div className="divide-y divide-border">
                              {section.members.map((member) => {
                                const subs = member.subRoles || [];
                                const effectivePerms =
                                  evaluateEffectiveRolePermissions(
                                    member.role,
                                    subs,
                                    roleDefinitions
                                  );
                                const isManagerPower =
                                  effectivePerms.canManageTeam;
                                const isLinked =
                                  member.isLineLinked ?? Boolean(member.userId);
                                const primaryRoleKey = (
                                  member.role || "parent"
                                ).toLowerCase();
                                const primaryRoleDef =
                                  roleDefByKey.get(primaryRoleKey);
                                const memberCategory: AdminMemberCategoryKey =
                                  classifyAdminMemberCategory(
                                    member,
                                    roleDefinitions
                                  );
                                const monogram =
                                  resolveMemberAvatarMonogram(member);
                                const childrenList =
                                  member.linkedChildren || [];
                                const visibleChildren = childrenList.slice(
                                  0,
                                  2
                                );
                                const extraChildrenCount = Math.max(
                                  0,
                                  childrenList.length - visibleChildren.length
                                );
                                const isPlainParentPrimary =
                                  primaryRoleKey === "parent" &&
                                  subs.length === 0 &&
                                  !isManagerPower &&
                                  (!primaryRoleDef || primaryRoleDef.isBuiltin);

                                return (
                                  <div
                                    key={`${section.key}_${member.memberId}`}
                                    onClick={() => openEditMemberModal(member)}
                                    className="px-3 py-2.5 sm:px-3.5 flex items-center gap-2.5 hover:bg-muted/35 active:bg-muted/55 transition-colors cursor-pointer [content-visibility:auto] [contain-intrinsic-size:auto_58px]"
                                  >
                                    {/* 左：苗字/背番号モノグラム ＋ LINE連携ステータスドット */}
                                    <div className="relative shrink-0">
                                      <div
                                        className={cn(
                                          "w-9 h-9 rounded-xl border flex items-center justify-center text-[11px] font-black tracking-tight select-none",
                                          isManagerPower
                                            ? "bg-[#0f172a] text-amber-300 border-[#0f172a]"
                                            : memberCategory === "coaches_ops"
                                            ? "bg-teal-500/12 text-teal-800 dark:text-teal-300 border-teal-500/30"
                                            : memberCategory ===
                                              "players_others"
                                            ? "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300 border-emerald-500/30"
                                            : "bg-primary/10 text-primary border-primary/25"
                                        )}
                                      >
                                        {monogram}
                                      </div>
                                      <span
                                        title={
                                          isLinked
                                            ? "LINE連携済み"
                                            : "手動登録（LINE未連携）"
                                        }
                                        className={cn(
                                          "w-3.5 h-3.5 rounded-full border-2 border-card flex items-center justify-center absolute -bottom-0.5 -right-0.5",
                                          isLinked
                                            ? "bg-[#06C755] text-white"
                                            : "bg-slate-400 dark:bg-slate-600 text-white"
                                        )}
                                      >
                                        {isLinked && (
                                          <Check className="w-2 h-2 stroke-[3.5]" />
                                        )}
                                      </span>
                                    </div>

                                    {/* 中央：1段目（氏名・未連携・当番班・紐付け選手）＋ 2段目（役職・兼務・電話） */}
                                    <div className="flex-1 min-w-0 space-y-1">
                                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                        <span className="text-[13px] sm:text-sm font-black text-foreground truncate max-w-full">
                                          {member.name}
                                        </span>

                                        {!isLinked && (
                                          <span className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/35 text-[9.5px] font-black shrink-0">
                                            未連携
                                          </span>
                                        )}

                                        {member.subLabel && (
                                          <span className="px-1.5 py-0.2 rounded bg-teal-500/12 text-teal-700 dark:text-teal-300 border border-teal-500/30 text-[10px] font-black shrink-0">
                                            {member.subLabel}
                                          </span>
                                        )}

                                        {visibleChildren.map((child) => (
                                          <span
                                            key={child.id}
                                            className="px-1.5 py-0.2 rounded bg-muted text-muted-foreground border border-border text-[10px] font-bold shrink-0"
                                          >
                                            {formatCompactLinkedChildLabel(
                                              member.name,
                                              child
                                            )}
                                          </span>
                                        ))}
                                        {extraChildrenCount > 0 && (
                                          <span className="px-1 py-0.2 rounded bg-muted text-muted-foreground border border-border text-[9.5px] font-bold shrink-0">
                                            +{extraChildrenCount}
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-1 flex-wrap">
                                        <span
                                          className={cn(
                                            "px-1.5 py-0.2 rounded text-[10px] font-black border",
                                            isManagerPower
                                              ? "bg-[#0f172a] text-amber-300 border-[#0f172a]"
                                              : primaryRoleDef &&
                                                !primaryRoleDef.isBuiltin
                                              ? getRoleTonePillClass(
                                                  primaryRoleDef.badgeTone
                                                )
                                              : isPlainParentPrimary
                                              ? "bg-muted/70 text-muted-foreground border-border font-bold"
                                              : "bg-primary/12 text-primary border-primary/25"
                                          )}
                                        >
                                          {subs.length > 0
                                            ? `主: ${getDisplayRoleLabel(
                                                member.role
                                              )}`
                                            : getDisplayRoleLabel(member.role)}
                                        </span>

                                        {subs.map((sr) => {
                                          const srKey = sr.toLowerCase();
                                          const subDef =
                                            roleDefByKey.get(srKey);
                                          const isCurrentRoleSection =
                                            section.roleKey === srKey;
                                          return (
                                            <span
                                              key={sr}
                                              className={cn(
                                                "px-1.5 py-0.2 rounded text-[10px] font-black border",
                                                isCurrentRoleSection
                                                  ? "bg-amber-500 text-slate-950 border-amber-500"
                                                  : subDef && !subDef.isBuiltin
                                                  ? getRoleTonePillClass(
                                                      subDef.badgeTone
                                                    )
                                                  : "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30"
                                              )}
                                            >
                                              兼: {getDisplayRoleLabel(sr)}
                                            </span>
                                          );
                                        })}

                                        {member.phone && (
                                          <a
                                            href={`tel:${member.phone}`}
                                            onClick={(e) => e.stopPropagation()}
                                            className="inline-flex items-center gap-0.5 text-[10px] font-bold text-muted-foreground hover:text-primary ml-0.5"
                                          >
                                            <Phone className="w-2.5 h-2.5 shrink-0" />
                                            <span>{member.phone}</span>
                                          </a>
                                        )}
                                      </div>
                                    </div>

                                    {/* 右：すっきり整理した操作ゾーン（統合［未連携のみ］＋ 編集） */}
                                    <div className="flex items-center gap-1 shrink-0">
                                      {!isLinked && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenMergeModal(member);
                                          }}
                                          title="LINE参加アカウントと統合"
                                          className="h-7 px-2 rounded-lg border border-teal-500/35 bg-teal-500/10 hover:bg-teal-500/20 text-teal-700 dark:text-teal-300 text-[10.5px] font-black inline-flex items-center gap-1 cursor-pointer"
                                        >
                                          <GitMerge className="w-3 h-3 shrink-0" />
                                          <span className="hidden sm:inline">
                                            統合
                                          </span>
                                        </button>
                                      )}

                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openEditMemberModal(member);
                                        }}
                                        className="h-7 px-2.5 rounded-lg border border-border bg-background hover:bg-[#0f172a] hover:text-white hover:border-[#0f172a] text-foreground text-[11px] font-black inline-flex items-center gap-1 cursor-pointer transition-colors"
                                      >
                                        <Edit2 className="w-3 h-3 text-teal-600 dark:text-teal-400 shrink-0" />
                                        <span>編集</span>
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </section>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                🅲️ 【役職設定（独自役職の追加・呼称カスタム・7権限付与）】タブ
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            {activeTab === "titles" && (
              <div className="space-y-4 animate-in fade-in duration-200">
                {/* 1. ➕ チーム独自の役職（カスタム役職） */}
                <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
                  <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-7 h-7 rounded-xl bg-teal-500/20 text-teal-300 border border-teal-400/30 flex items-center justify-center shrink-0">
                        <Plus className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-xs sm:text-sm font-black text-white truncate">
                          チーム独自の役職を追加・管理
                        </h3>
                        <p className="text-[10px] font-bold text-slate-300 truncate">
                          配車係・行事係・審判部長など必要な権限を個別に付与
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={
                        isSavingTitles ||
                        customRoleDefs.length >= MAX_CUSTOM_ROLES_PER_TEAM
                      }
                      onClick={() => openCreateCustomRoleModal()}
                      className="h-8 px-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-[11px] font-black inline-flex items-center gap-1 shrink-0 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>役職を追加</span>
                    </button>
                  </div>

                  <div className="p-4 space-y-3.5 text-xs">
                    {/* 1タップおすすめプリセット */}
                    <div className="p-3 rounded-xl border border-border bg-muted/35 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-black text-foreground">
                          ⚡ おすすめのチーム役職テンプレート（タップで作成）
                        </span>
                        <span className="text-[10px] font-bold text-muted-foreground shrink-0">
                          {customRoleDefs.length}/{MAX_CUSTOM_ROLES_PER_TEAM}枠
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {CUSTOM_ROLE_PRESETS.map((preset) => {
                          const existingDef = roleDefinitions.find(
                            (d) => d.label.trim() === preset.label
                          );
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              disabled={isSavingTitles}
                              onClick={() =>
                                existingDef
                                  ? openEditRoleModal(existingDef)
                                  : openCreateCustomRoleModal(preset)
                              }
                              className={cn(
                                "px-2.5 py-1.5 rounded-xl border text-[11px] font-black inline-flex items-center gap-1 active:scale-95 transition-all cursor-pointer",
                                existingDef
                                  ? "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300 border-emerald-500/35"
                                  : "bg-card hover:bg-muted text-foreground border-border shadow-2xs"
                              )}
                            >
                              {existingDef ? (
                                <Check className="w-3 h-3 shrink-0" />
                              ) : (
                                <Plus className="w-3 h-3 text-teal-600 dark:text-teal-400 shrink-0" />
                              )}
                              <span>{preset.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 追加済みカスタム役職リスト */}
                    {customRoleDefs.length === 0 ? (
                      <div className="p-4 rounded-xl border border-dashed border-border bg-muted/20 text-center space-y-2">
                        <p className="text-xs font-black text-foreground">
                          まだチーム独自の役職は登録されていません
                        </p>
                        <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
                          上のテンプレートをタップするか「＋ 役職を追加」から作成すると、「メンバー」タブの主役職・兼務ロールとして誰にでも割り当てられます。
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {customRoleDefs.map((def) => {
                          const assignedCount =
                            roleMemberCounts[def.role.toLowerCase()] || 0;
                          const activeAxes = PERMISSION_AXIS_METAS.filter(
                            (ax) => def.permissions[ax.key]
                          );
                          return (
                            <div
                              key={def.role}
                              className="p-3.5 rounded-2xl border border-border bg-background space-y-2.5 shadow-2xs"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="space-y-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span
                                      className={cn(
                                        "px-2 py-0.5 rounded-md border text-[11px] font-black",
                                        getRoleTonePillClass(def.badgeTone)
                                      )}
                                    >
                                      {def.label}
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded bg-[#0f172a] text-teal-300 text-[9.5px] font-black">
                                      独自役職
                                    </span>
                                    <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
                                      割当 {assignedCount}名
                                    </span>
                                  </div>
                                  <p className="text-[11px] font-bold text-muted-foreground leading-snug">
                                    {def.summary}
                                  </p>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    disabled={isSavingTitles}
                                    onClick={() => openEditRoleModal(def)}
                                    className="h-8 px-2.5 rounded-xl bg-[#0f172a] hover:bg-slate-800 text-white text-[11px] font-black inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <SlidersHorizontal className="w-3 h-3 text-teal-400" />
                                    <span>権限編集</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isSavingTitles}
                                    onClick={() => setDeletingRoleDef(def)}
                                    aria-label={`${def.label}を削除`}
                                    className="h-8 w-8 rounded-xl border border-border bg-card hover:bg-rose-600 text-muted-foreground hover:text-white flex items-center justify-center cursor-pointer transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* ONになっている権限バッジ */}
                              <div className="flex flex-wrap gap-1 pt-0.5">
                                {activeAxes.length === 0 ? (
                                  <span className="px-2 py-0.5 rounded-md bg-muted border border-border text-[10px] font-bold text-muted-foreground">
                                    閲覧専用（編集権限なし）
                                  </span>
                                ) : (
                                  activeAxes.map((ax) => (
                                    <span
                                      key={ax.key}
                                      className={cn(
                                        "px-2 py-0.5 rounded-md border text-[10px] font-black",
                                        ax.key === "canManageTeam"
                                          ? "bg-[#0f172a] text-amber-300 border-[#0f172a]"
                                          : ax.key === "canEditCarpool"
                                          ? "bg-teal-500/12 text-teal-800 dark:text-teal-300 border-teal-500/35"
                                          : ax.key === "canManageOps"
                                          ? "bg-amber-500/12 text-amber-800 dark:text-amber-300 border-amber-500/35"
                                          : "bg-primary/10 text-primary border-primary/25"
                                      )}
                                    >
                                      ✓ {ax.shortLabel}
                                    </span>
                                  ))
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </section>

                {/* 2. 🛡️ 規定8役職（呼称変更 ＆ 権限カスタマイズ） */}
                <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
                  <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-7 h-7 rounded-xl bg-slate-800 text-amber-400 border border-slate-700 flex items-center justify-center shrink-0">
                        <KeyRound className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-xs sm:text-sm font-black text-white truncate">
                          規定の役職（呼称・権限のカスタマイズ）
                        </h3>
                        <p className="text-[10px] font-bold text-slate-300 truncate">
                          規定8役職の呼び名と7つの機能権限をチームに合わせて調整
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isSavingTitles}
                      onClick={() => setIsResetRolesConfirmOpen(true)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[10px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>初期値に戻す</span>
                    </button>
                  </div>

                  <div className="p-4 space-y-2.5 text-xs">
                    <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
                      初期状態では「保護者」「選手」は出欠回答・写真投稿などの一般操作のみ有効で、「運用・規定の設定」や「配車編成」はロックされています。必要に応じて各役職の「呼称・権限」から変更できます。
                    </p>

                    <div className="grid grid-cols-1 gap-2.5">
                      {builtinRoleDefs.map((def) => {
                        const assignedCount =
                          roleMemberCounts[def.role.toLowerCase()] || 0;
                        const isModified =
                          isBuiltinRoleModifiedFromDefault(def);
                        const activeAxes = PERMISSION_AXIS_METAS.filter(
                          (ax) => def.permissions[ax.key]
                        );

                        return (
                          <div
                            key={def.role}
                            className="p-3 rounded-2xl border border-border bg-background space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span
                                    className={cn(
                                      "px-2 py-0.5 rounded-md border text-[11px] font-black",
                                      def.permissions.canManageTeam
                                        ? "bg-[#0f172a] text-amber-300 border-[#0f172a]"
                                        : getRoleTonePillClass(def.badgeTone)
                                    )}
                                  >
                                    {def.label}
                                  </span>
                                  {def.customLabel && (
                                    <span className="text-[10px] font-bold text-muted-foreground">
                                      （標準: {def.defaultLabel}）
                                    </span>
                                  )}
                                  {isModified && (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/35 text-[9.5px] font-black">
                                      カスタム中
                                    </span>
                                  )}
                                  <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
                                    {assignedCount}名
                                  </span>
                                </div>
                                <p className="text-[10.5px] font-bold text-muted-foreground leading-snug">
                                  {def.summary}
                                </p>
                              </div>

                              <button
                                type="button"
                                disabled={isSavingTitles}
                                onClick={() => openEditRoleModal(def)}
                                className="h-8 px-2.5 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-[11px] font-black inline-flex items-center gap-1 shrink-0 active:scale-95 transition-all cursor-pointer"
                              >
                                <SlidersHorizontal className="w-3 h-3 text-primary" />
                                <span>呼称・権限</span>
                              </button>
                            </div>

                            <div className="flex flex-wrap gap-1">
                              {activeAxes.length === 0 ? (
                                <span className="px-2 py-0.5 rounded-md bg-muted border border-border text-[10px] font-bold text-muted-foreground">
                                  閲覧専用（編集不可）
                                </span>
                              ) : (
                                activeAxes.map((ax) => (
                                  <span
                                    key={ax.key}
                                    className={cn(
                                      "px-2 py-0.5 rounded-md border text-[10px] font-black",
                                      ax.key === "canManageTeam"
                                        ? "bg-[#0f172a] text-amber-300 border-[#0f172a]"
                                        : ax.key === "canEditCarpool"
                                        ? "bg-teal-500/12 text-teal-800 dark:text-teal-300 border-teal-500/35"
                                        : ax.key === "canManageOps"
                                        ? "bg-amber-500/12 text-amber-800 dark:text-amber-300 border-amber-500/35"
                                        : "bg-card text-foreground border-border"
                                    )}
                                  >
                                    ✓ {ax.shortLabel}
                                  </span>
                                ))
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>

                {/* 3. 📊 役職別 7権限マトリクス早見表 */}
                <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
                  <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
                      <h3 className="text-xs sm:text-sm font-black text-white truncate">
                        役職別 7権限マトリクス早見表
                      </h3>
                    </div>
                    <span className="text-[10px] font-bold text-slate-300 shrink-0">
                      行タップで編集
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[540px] text-xs border-collapse">
                      <thead>
                        <tr className="bg-muted border-b border-border text-[10.5px] font-black text-foreground">
                          <th className="p-2.5 text-left sticky left-0 bg-muted z-10 min-w-[132px]">
                            役職（ロール）
                          </th>
                          {PERMISSION_AXIS_METAS.map((ax) => (
                            <th
                              key={ax.key}
                              className="p-1.5 text-center whitespace-nowrap"
                            >
                              {ax.shortLabel}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {roleDefinitions.map((rm) => (
                          <tr
                            key={rm.role}
                            onClick={() => openEditRoleModal(rm)}
                            className="bg-card hover:bg-muted/50 cursor-pointer transition-colors"
                          >
                            <td className="p-2.5 sticky left-0 bg-card z-10 border-r border-border/60">
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="font-black text-foreground">
                                  {rm.label}
                                </span>
                                {!rm.isBuiltin && (
                                  <span className="px-1 py-0.2 rounded bg-teal-500/15 text-teal-800 dark:text-teal-300 text-[9px] font-black">
                                    独自
                                  </span>
                                )}
                              </div>
                            </td>
                            {PERMISSION_AXIS_METAS.map((ax) => {
                              const enabled = rm.permissions[ax.key];
                              return (
                                <td
                                  key={ax.key}
                                  className="p-1.5 text-center font-black"
                                >
                                  {enabled ? (
                                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[11px]">
                                      ●
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground/50">
                                      —
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}

            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                🅳️ 【LINE招待】タブ
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            {activeTab === "invite" && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
                  <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-[#06C755] px-4 py-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src="/liff-logo.webp?v=3"
                        alt="iScoreCloud LINEミニアプリ"
                        width={32}
                        height={32}
                        className="w-8 h-8 rounded-[22%] bg-white object-contain shrink-0 shadow-xs"
                      />
                      <div className="min-w-0">
                        <h3 className="text-xs sm:text-sm font-black text-white truncate">
                          チーム招待（LINEミニアプリ）
                        </h3>
                        <p className="text-[10px] font-bold text-slate-300 truncate">
                          リンクから招待コード自動入力で参加申請
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-[#06C755] text-white shrink-0">
                      {inviteTargets.isDirectMiniAppUrl
                        ? "ミニアプリ直起動"
                        : "1タップ参加対応"}
                    </span>
                  </div>

                  <div className="p-4 space-y-3">
                    {/* 招待コード */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-muted-foreground pl-0.5">
                        🔑 チーム招待コード
                      </span>
                      <div className="p-3 rounded-xl bg-muted border border-border flex items-center justify-between gap-2">
                        <span className="font-mono text-sm sm:text-base font-black tracking-widest text-foreground select-all truncate">
                          {inviteCode}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleCopyInvite}
                          className="h-8 px-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-black text-xs shrink-0 gap-1"
                        >
                          {isCopied ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>{isCopied ? "コピー済" : "コピー"}</span>
                        </Button>
                      </div>
                    </div>

                    {/* 1タップ招待URL */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-muted-foreground pl-0.5">
                        📲 1タップ参加申請リンク（招待コード自動セット）
                      </span>
                      <div className="p-2.5 rounded-xl bg-muted border border-border flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] font-bold text-muted-foreground select-all truncate">
                          {inviteUrl}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={handleCopyInviteUrl}
                          className="h-8 px-3 rounded-lg border-border bg-card text-foreground hover:bg-muted font-black text-xs shrink-0 gap-1"
                        >
                          {isUrlCopied ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>{isUrlCopied ? "URLコピー済" : "URLコピー"}</span>
                        </Button>
                      </div>
                    </div>

                    <Button
                      type="button"
                      onClick={() => void handleShareLine()}
                      className="w-full h-11 rounded-xl bg-[#06C755] text-white hover:bg-[#05b34c] font-black text-xs gap-2 shadow-xs border-0"
                    >
                      <Share2 className="w-4 h-4" />
                      <span>LINEでメンバーを招待する</span>
                    </Button>

                    {/* 参加フローのわかりやすい3ステップ案内 */}
                    <div className="p-3 rounded-xl bg-muted/60 border border-border text-[11px] font-bold text-muted-foreground space-y-1">
                      <p className="text-foreground font-black text-[11px]">
                        📌 招待されたメンバー側の流れ
                      </p>
                      <p>
                        ① LINEの招待リンクをタップ ➔ ② 参加申請フォームが自動で開き、名前と区分を選んで1タップ送信 ➔ ③ この画面の「参加承認」タブで承認するとチームデータが解禁されます。
                      </p>
                    </div>
                  </div>
                </section>
              </div>
            )}
          </>
        )}

        <div
          className="h-8 w-full shrink-0 pointer-events-none select-none"
          aria-hidden="true"
        />
      </div>

      {/* ==================== モーダル: メンバー手動追加 / 権限・兼務編集 ==================== */}
      {mounted &&
        isMemberModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setIsMemberModalOpen(false)}
          >
            <div
              className="w-full sm:max-w-lg max-h-[90dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-card text-foreground shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-8 h-8 rounded-xl bg-slate-800 text-amber-400 border border-slate-700 flex items-center justify-center shrink-0">
                    {editingMember ? (
                      <KeyRound className="w-4 h-4" />
                    ) : (
                      <UserPlus className="w-4 h-4" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-white truncate">
                      {editingMember
                        ? `${editingMember.name} さんの編集・権限設定`
                        : "メンバーを手動追加"}
                    </h3>
                    <p className="text-[10px] font-bold text-slate-300 truncate">
                      {editingMember
                        ? "氏名・主役職・兼務ロール・当番班の変更"
                        : "LINE未参加メンバーも先に名簿登録できます（後からLINE統合可）"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMemberModalOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3.5 overflow-y-auto text-xs">
                {editingMember && (
                  <div className="p-2.5 rounded-xl bg-muted/40 border border-border flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {editingMember.isLineLinked ??
                      Boolean(editingMember.userId) ? (
                        <span className="px-2 py-0.5 rounded bg-[#06C755]/15 text-[#059440] dark:text-[#2ee075] border border-[#06C755]/30 text-[10px] font-black inline-flex items-center gap-1">
                          <UserCheck className="w-3 h-3" />
                          <span>LINE連携済み</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/35 text-[10px] font-black">
                          手動登録（LINE未連携）
                        </span>
                      )}
                      {(editingMember.linkedChildren || []).map((child) => (
                        <span
                          key={child.id}
                          className="px-2 py-0.5 rounded bg-card border border-border text-[10px] font-bold text-foreground"
                        >
                          お子様:{" "}
                          {formatCompactLinkedChildLabel(
                            editingMember.name,
                            child
                          )}
                        </span>
                      ))}
                    </div>

                    {!(
                      editingMember.isLineLinked ??
                      Boolean(editingMember.userId)
                    ) && (
                      <button
                        type="button"
                        onClick={() => {
                          const target = editingMember;
                          setIsMemberModalOpen(false);
                          handleOpenMergeModal(target);
                        }}
                        className="h-7 px-2.5 rounded-lg border border-teal-500/35 bg-teal-500/12 hover:bg-teal-500/20 text-teal-700 dark:text-teal-300 text-[10.5px] font-black inline-flex items-center gap-1 cursor-pointer"
                      >
                        <GitMerge className="w-3 h-3 shrink-0" />
                        <span>LINEアカウントと統合</span>
                      </button>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-black text-foreground">
                      氏名（必須）
                    </label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="例: 山田 太郎"
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
                      placeholder="例: やまだ たろう"
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
                      const pickedDef = roleDefByKey.get(val.toLowerCase());
                      if (
                        val === "manager" ||
                        val === "coach" ||
                        val === "scorer" ||
                        val === "staff"
                      ) {
                        setFormMemberType("staff");
                      } else if (val === "player") {
                        setFormMemberType("player");
                      } else if (val === "parent") {
                        setFormMemberType("parent");
                      } else if (
                        pickedDef &&
                        !pickedDef.isBuiltin &&
                        !editingMember
                      ) {
                        if (
                          pickedDef.permissions.canManageOps ||
                          pickedDef.permissions.canEditScore
                        ) {
                          setFormMemberType("staff");
                        }
                      }
                    }}
                    options={roleSelectOptions}
                    title="主となる役職を選択"
                    accent="amber"
                    size="md"
                    className="w-full bg-background"
                  />
                </div>

                {/* 兼務ロール（複数選択可 — 規定役職＋チーム独自役職に対応） */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-black text-foreground">
                    兼務ロール（複数選択可 — 例:「保護者」兼「配車係・スコアラー」）
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {roleDefinitions
                      .filter((rm) => rm.role !== formRole)
                      .map((rm) => {
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
                            <span className="truncate flex items-center gap-1 min-w-0">
                              <span className="truncate">{rm.label}</span>
                              {!rm.isBuiltin && !checked && (
                                <span className="px-1 py-0.2 rounded bg-teal-500/15 text-teal-700 dark:text-teal-300 text-[9px] font-black shrink-0">
                                  独自
                                </span>
                              )}
                            </span>
                            {checked && (
                              <Check className="w-3.5 h-3.5 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                  </div>
                </div>

                {/* 実効権限のリアルタイム合算プレビュー */}
                {(() => {
                  const previewPerms = evaluateEffectiveRolePermissions(
                    formRole,
                    formSubRoles,
                    roleDefinitions
                  );
                  const activePreviewAxes = PERMISSION_AXIS_METAS.filter(
                    (ax) => previewPerms[ax.key]
                  );
                  return (
                    <div className="p-2.5 rounded-xl bg-muted/45 border border-border space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10.5px] font-black text-foreground">
                          付与される実効権限（主役職＋兼務の合算）
                        </span>
                        <span className="text-[10px] font-bold text-muted-foreground">
                          {activePreviewAxes.length}項目有効
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {activePreviewAxes.length === 0 ? (
                          <span className="px-2 py-0.5 rounded bg-card border border-border text-[10px] font-bold text-muted-foreground">
                            閲覧専用（編集不可）
                          </span>
                        ) : (
                          activePreviewAxes.map((ax) => (
                            <span
                              key={ax.key}
                              className="px-2 py-0.5 rounded bg-card border border-border text-[10px] font-black text-foreground"
                            >
                              ✓ {ax.shortLabel}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* 区分 ＆ 連絡先 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-black text-muted-foreground">
                      名簿区分（出欠表グループ連動）
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
                      連絡先電話番号（任意）
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

                {/* 当番班・担当サブラベル */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black text-foreground">
                      当番班・担当ラベル（任意）
                    </label>
                    <span className="text-[10px] font-bold text-muted-foreground">
                      出欠一覧表の氏名下に表示
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {dutyPresetChips.map((label) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setFormSubLabel(label)}
                        className={cn(
                          "px-2 py-1 rounded-lg text-[11px] border transition-colors cursor-pointer",
                          formSubLabel === label
                            ? "bg-primary/12 text-primary border-primary/35 font-black"
                            : "bg-background text-muted-foreground border-border hover:text-foreground font-bold"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                    {formSubLabel && (
                      <button
                        type="button"
                        onClick={() => setFormSubLabel("")}
                        className="px-2 py-1 rounded-lg text-[11px] font-bold bg-background text-muted-foreground border border-border hover:text-rose-600 cursor-pointer"
                      >
                        解除
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={formSubLabel}
                    maxLength={12}
                    onChange={(e) => setFormSubLabel(e.target.value)}
                    placeholder="自由入力（例: 1班 / 配車係 / 事務局）"
                    className="w-full h-9 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                  />
                </div>
              </div>

              <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex items-center justify-between gap-2 shrink-0">
                {editingMember ? (
                  <button
                    type="button"
                    onClick={() => {
                      const target = editingMember;
                      setIsMemberModalOpen(false);
                      setDeletingMember(target);
                    }}
                    className="h-10 px-3 rounded-xl border border-rose-500/35 bg-rose-500/10 hover:bg-rose-600 text-rose-600 dark:text-rose-400 hover:text-white hover:border-rose-600 text-xs font-black inline-flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    <span>削除</span>
                  </button>
                ) : (
                  <span />
                )}

                <div className="flex items-center gap-2">
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
                    className="h-10 px-5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isSavingMember ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    <span>
                      {editingMember ? "変更を保存" : "メンバーを追加"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ==================== モーダル: メンバー削除確認 ==================== */}
      {mounted &&
        deletingMember &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
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
                <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
                  手動登録とLINE参加の重複整理であれば、削除ではなく「LINE重複統合」を使うと過去の出欠・車両データを引き継げます。
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

      {/* ==================== モーダル: メンバー統合（マージ） ==================== */}
      {mounted &&
        isMergeModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60"
            onClick={() => setIsMergeModalOpen(false)}
          >
            <div
              className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-2xl overflow-hidden max-h-[90dvh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-primary/20 text-blue-300 border border-primary/40 flex items-center justify-center shrink-0">
                    <GitMerge className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-white truncate">
                      LINE重複メンバー統合
                    </h3>
                    <p className="text-[10px] font-bold text-slate-300 truncate">
                      手動追加した名簿とLINE参加アカウントを1つに合流
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMergeModalOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-4 text-xs overflow-y-auto">
                {/* ① 残す名簿メンバー（手動登録・マスター側） */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-foreground flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-primary/12 text-primary flex items-center justify-center text-[10px] font-black shrink-0">
                      1
                    </span>
                    <span>残す名簿データ（手動登録・マスター側）</span>
                  </label>
                  <LiffSelect
                    value={mergeTargetMember?.memberId || ""}
                    onChange={(val) => {
                      const found = data?.activeMembers?.find(
                        (m) => m.memberId === val
                      );
                      setMergeTargetMember(found || null);
                    }}
                    options={[
                      { value: "", label: "残すメンバーを選択..." },
                      ...(data?.activeMembers || []).map((m) => ({
                        value: m.memberId,
                        label: m.name,
                        badge: !m.userId ? "手動登録・未連携" : "LINE連携済",
                        badgeTone: (!m.userId
                          ? "amber"
                          : "emerald") as LiffSelectBadgeTone,
                        sublabel: m.subLabel || getDisplayRoleLabel(m.role),
                        keywords: `${m.nameKana || ""} ${m.phone || ""} ${
                          m.subLabel || ""
                        }`,
                      })),
                    ]}
                    placeholder="残すメンバーを選択..."
                    title="残す名簿データ（マスター側）を選択"
                    subtitle="出欠履歴・配車当番・親子関係などの過去データが引き継がれます"
                    accent="slate"
                    searchable={true}
                    searchPlaceholder="氏名・かな・属性で検索..."
                    className="w-full"
                  />
                  <p className="text-[10px] text-muted-foreground font-medium px-1">
                    ※ 出欠履歴・配車当番・お子様との親子関係などの過去データが保持されます。
                  </p>
                </div>

                {/* ② 統合するアカウント（LINE参加・連携側） */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-foreground flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-primary/12 text-primary flex items-center justify-center text-[10px] font-black shrink-0">
                      2
                    </span>
                    <span>合流・統合するアカウント（LINE参加側）</span>
                  </label>
                  <LiffSelect
                    value={selectedSourceMemberId}
                    onChange={(val) => setSelectedSourceMemberId(val)}
                    options={[
                      { value: "", label: "統合するアカウントを選択..." },
                      ...(data?.activeMembers || [])
                        .filter(
                          (m) => m.memberId !== mergeTargetMember?.memberId
                        )
                        .map((m) => ({
                          value: m.memberId,
                          label: m.name,
                          badge: m.userId ? "LINE連携アカウント" : "手動登録",
                          badgeTone: (m.userId
                            ? "teal"
                            : "slate") as LiffSelectBadgeTone,
                          sublabel: m.phone
                            ? `TEL: ${m.phone}`
                            : m.subLabel || getDisplayRoleLabel(m.role),
                          keywords: `${m.nameKana || ""} ${m.phone || ""} ${
                            m.subLabel || ""
                          }`,
                        })),
                    ]}
                    placeholder="統合するアカウントを選択..."
                    title="合流・統合するアカウントを選択"
                    subtitle="このアカウントのLINEログインがマスター側へ合流され、重複側は整理されます"
                    accent="slate"
                    searchable={true}
                    searchPlaceholder="氏名・かな・電話番号で検索..."
                    className="w-full"
                  />
                </div>

                {/* プレビューカード */}
                {(() => {
                  const source = data?.activeMembers?.find(
                    (m) => m.memberId === selectedSourceMemberId
                  );
                  if (!mergeTargetMember || !source) return null;

                  return (
                    <div className="p-3.5 rounded-2xl bg-muted/35 border border-border border-l-4 border-l-primary space-y-2">
                      <div className="flex items-center gap-1.5 font-black text-primary">
                        <Sparkles className="w-4 h-4 shrink-0" />
                        <span>統合プレビュー</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-card border border-border space-y-1 text-[11px] font-bold">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">
                            残す名簿データ:
                          </span>
                          <span className="font-black text-foreground truncate">
                            {mergeTargetMember.name}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">
                            合流するLINE:
                          </span>
                          <span className="font-black text-primary truncate">
                            {source.name}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsMergeModalOpen(false)}
                  disabled={isMerging}
                  className="flex-1 h-10 rounded-xl border-border font-black text-xs"
                >
                  キャンセル
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleExecuteMerge()}
                  disabled={
                    isMerging || !mergeTargetMember || !selectedSourceMemberId
                  }
                  className="flex-1 h-10 rounded-xl font-black text-xs bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs"
                >
                  {isMerging ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>統合中...</span>
                    </span>
                  ) : (
                    <span>アカウントを統合する</span>
                  )}
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ==================== モーダル: 役職追加・呼称＆7権限スイッチ編集 ==================== */}
      {mounted &&
        isRoleEditorOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => {
              if (!isSavingTitles) setIsRoleEditorOpen(false);
            }}
          >
            <div
              className="w-full sm:max-w-lg max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-card text-foreground shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className={cn(
                  "px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] flex items-center justify-between gap-2 shrink-0",
                  editingRoleIsBuiltin ? "border-amber-500" : "border-teal-500"
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={cn(
                      "w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0",
                      editingRoleIsBuiltin ? "text-amber-400" : "text-teal-400"
                    )}
                  >
                    {roleEditorMode === "create" ? (
                      <Plus className="w-4 h-4" />
                    ) : (
                      <SlidersHorizontal className="w-4 h-4" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-white truncate">
                      {roleEditorMode === "create"
                        ? "チーム独自の役職を追加"
                        : editingRoleIsBuiltin
                        ? `「${editingRoleDefaultLabel}」の呼称・権限設定`
                        : `「${roleFormLabel || "役職"}」の編集・権限設定`}
                    </h3>
                    <p className="text-[10px] font-bold text-slate-300 truncate">
                      {editingRoleIsBuiltin
                        ? "チーム内での呼び名と7つの機能権限を設定します"
                        : "この役職に付与する操作権限を個別にON/OFFできます"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isSavingTitles}
                  onClick={() => setIsRoleEditorOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-4 overflow-y-auto text-xs">
                {/* 1. 役職名 / カスタム呼称 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-black text-foreground">
                      {editingRoleIsBuiltin
                        ? "チーム内での表示呼称（任意）"
                        : "役職名（必須）"}
                    </label>
                    {editingRoleIsBuiltin && (
                      <span className="text-[10px] font-bold text-muted-foreground">
                        空欄時は標準「{editingRoleDefaultLabel}」
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    maxLength={20}
                    value={roleFormLabel}
                    onChange={(e) => setRoleFormLabel(e.target.value)}
                    placeholder={
                      editingRoleIsBuiltin
                        ? `標準: ${editingRoleDefaultLabel}（例: 父母会長・事務局）`
                        : "例: 配車係 / 行事・会計係 / 審判部長"
                    }
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                  />
                </div>

                {/* 2. バッジカラー */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-black text-foreground">
                    バッジの表示カラー
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                    {ROLE_BADGE_TONE_OPTIONS.map((opt) => {
                      const active = roleFormTone === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setRoleFormTone(opt.value)}
                          className={cn(
                            "py-1.5 px-2 rounded-xl border text-[11px] font-black transition-all cursor-pointer",
                            active
                              ? cn(opt.chipClass, "ring-2 ring-primary/40")
                              : "bg-background text-muted-foreground border-border hover:text-foreground"
                          )}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. 役割の補足説明 */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-black text-foreground">
                    担当内容・説明メモ（任意）
                  </label>
                  <input
                    type="text"
                    maxLength={80}
                    value={roleFormSummary}
                    onChange={(e) => setRoleFormSummary(e.target.value)}
                    placeholder="例: 遠征・試合の号車割り・乗車メンバー・積載道具の編成を担当"
                    className="w-full h-9 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                  />
                </div>

                {/* 4. 7つの機能権限スイッチ */}
                <div className="space-y-2 pt-1 border-t border-border">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-black text-foreground">
                      この役職に付与する権限（7カテゴリ）
                    </label>
                    <span className="text-[10px] font-bold text-muted-foreground">
                      タップでON/OFF
                    </span>
                  </div>

                  {(() => {
                    const hasUpperPermOn =
                      roleFormPermissions.canManageTeam ||
                      roleFormPermissions.canManageOps ||
                      roleFormPermissions.canManagePlayers ||
                      roleFormPermissions.canEditScore ||
                      roleFormPermissions.canEditSchedule ||
                      roleFormPermissions.canEditCarpool;

                    return (
                      <div className="space-y-2">
                        {PERMISSION_AXIS_METAS.map((ax) => {
                          const enabled = roleFormPermissions[ax.key];
                          const isLockedManageTeam =
                            ax.key === "canManageTeam" &&
                            editingRoleLockManageTeam;
                          const isAutoMutateLocked =
                            ax.key === "canMutate" && hasUpperPermOn;
                          const isLocked =
                            isLockedManageTeam || isAutoMutateLocked;

                          return (
                            <div
                              key={ax.key}
                              onClick={() => {
                                if (!isLocked) {
                                  handleToggleRolePermission(ax.key);
                                }
                              }}
                              className={cn(
                                "p-3 rounded-xl border flex items-center justify-between gap-3 transition-colors",
                                !isLocked && "cursor-pointer",
                                enabled
                                  ? "bg-primary/[0.06] border-primary/35"
                                  : "bg-background border-border"
                              )}
                            >
                              <div className="space-y-0.5 min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-black text-foreground">
                                    {ax.label}
                                  </span>
                                  {ax.key === "canEditCarpool" && (
                                    <span className="px-1.5 py-0.2 rounded bg-teal-500/15 text-teal-800 dark:text-teal-300 border border-teal-500/30 text-[9.5px] font-black">
                                      配車独立枠
                                    </span>
                                  )}
                                  {ax.key === "canManageOps" && (
                                    <span className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-[9.5px] font-black">
                                      運用・規定
                                    </span>
                                  )}
                                  {isLockedManageTeam && (
                                    <span className="px-1.5 py-0.2 rounded bg-[#0f172a] text-amber-300 text-[9.5px] font-black inline-flex items-center gap-0.5">
                                      <Lock className="w-2.5 h-2.5" />
                                      <span>常時ON固定</span>
                                    </span>
                                  )}
                                  {isAutoMutateLocked && (
                                    <span className="px-1.5 py-0.2 rounded bg-muted border border-border text-muted-foreground text-[9.5px] font-bold">
                                      上位権限ONのため自動有効
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10.5px] font-bold text-muted-foreground leading-snug">
                                  {ax.description}
                                </p>
                              </div>

                              <button
                                type="button"
                                role="switch"
                                aria-checked={enabled}
                                disabled={isLocked}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!isLocked) {
                                    handleToggleRolePermission(ax.key);
                                  }
                                }}
                                className={cn(
                                  "w-12 h-6 rounded-full transition-colors relative p-0.5 shrink-0",
                                  isLocked
                                    ? "opacity-75 cursor-not-allowed"
                                    : "cursor-pointer",
                                  enabled
                                    ? "bg-primary"
                                    : "bg-muted border border-border"
                                )}
                              >
                                <div
                                  className={cn(
                                    "w-5 h-5 rounded-full bg-white transition-transform",
                                    enabled
                                      ? "translate-x-6 shadow-xs"
                                      : "translate-x-0"
                                  )}
                                />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex items-center justify-between gap-2 shrink-0">
                <div>
                  {editingRoleIsBuiltin && roleEditorMode === "edit" && (
                    <button
                      type="button"
                      disabled={isSavingTitles}
                      onClick={handleRestoreSingleBuiltinDefault}
                      className="h-9 px-2.5 rounded-xl border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground text-[11px] font-black inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>標準値に戻す</span>
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isSavingTitles}
                    onClick={() => setIsRoleEditorOpen(false)}
                    className="h-10 px-4 rounded-xl border border-border bg-muted text-foreground text-xs font-black cursor-pointer"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    disabled={isSavingTitles}
                    onClick={() => void handleSaveRoleEditor()}
                    className="h-10 px-5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isSavingTitles ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    <span>
                      {roleEditorMode === "create"
                        ? "役職を追加する"
                        : "設定を保存"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ==================== モーダル: チーム独自役職の削除確認 ==================== */}
      {mounted &&
        deletingRoleDef &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => {
              if (!isSavingTitles) setDeletingRoleDef(null);
            }}
          >
            <div
              className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-border bg-card text-foreground shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-rose-500 flex items-center justify-between">
                <h3 className="text-sm font-black text-white">
                  独自役職の削除確認
                </h3>
                <button
                  type="button"
                  disabled={isSavingTitles}
                  onClick={() => setDeletingRoleDef(null)}
                  className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 space-y-2 text-xs">
                <p className="font-black text-foreground">
                  チーム独自役職「{deletingRoleDef.label}」を削除しますか？
                </p>
                <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
                  {(roleMemberCounts[deletingRoleDef.role.toLowerCase()] || 0) >
                  0
                    ? `現在 ${
                        roleMemberCounts[deletingRoleDef.role.toLowerCase()]
                      }名のメンバーに割り当てられています。削除すると兼務から外れ、主役職にしていたメンバーは自動的に標準役職（保護者／スタッフ等）へ引き継がれます。`
                    : "現在この役職が割り当てられているメンバーはいません。安全に削除できます。"}
                </p>
              </div>
              <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isSavingTitles}
                  onClick={() => setDeletingRoleDef(null)}
                  className="h-10 px-4 rounded-xl border border-border bg-muted text-foreground text-xs font-black cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={isSavingTitles}
                  onClick={() => void handleConfirmDeleteCustomRole()}
                  className="h-10 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingTitles ? (
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

      {/* ==================== モーダル: 規定役職の初期値リセット確認 ==================== */}
      {mounted &&
        isResetRolesConfirmOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => {
              if (!isSavingTitles) setIsResetRolesConfirmOpen(false);
            }}
          >
            <div
              className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-border bg-card text-foreground shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 flex items-center justify-between">
                <h3 className="text-sm font-black text-white">
                  規定役職を初期値に戻す
                </h3>
                <button
                  type="button"
                  disabled={isSavingTitles}
                  onClick={() => setIsResetRolesConfirmOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 space-y-2 text-xs">
                <p className="font-black text-foreground">
                  規定8役職の呼称と権限設定をすべて標準の初期値に戻しますか？
                </p>
                <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
                  ※ 追加済みの「チーム独自の役職」は消えずにそのまま残ります。
                </p>
              </div>
              <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isSavingTitles}
                  onClick={() => setIsResetRolesConfirmOpen(false)}
                  className="h-10 px-4 rounded-xl border border-border bg-muted text-foreground text-xs font-black cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={isSavingTitles}
                  onClick={() => void handleConfirmResetAllBuiltinRoles()}
                  className="h-10 px-4 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingTitles ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RotateCcw className="w-4 h-4" />
                  )}
                  <span>初期値に戻す</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default function LiffAdminDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col flex-1 bg-background text-foreground">
          <LiffHeader />
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs font-bold">
              メンバー・権限管理を読み込み中...
            </span>
          </div>
        </div>
      }
    >
      <LiffAdminDashboardContent />
    </Suspense>
  );
}
