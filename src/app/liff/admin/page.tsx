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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type AdminTabId = "requests" | "members" | "titles" | "invite";

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

interface ActiveMember {
  memberId: string;
  userId?: string | null;
  name: string;
  nameKana?: string | null;
  memberType?: string | null;
  phone?: string | null;
  email?: string | null;
  role: string;
  subRoles?: string[];
  subLabel?: string;
  isLineLinked?: boolean;
}

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
  roleSettings?: RoleSettingItem[];
}

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

function LiffAdminDashboardContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { currentTeam, profile, isDemo: providerDemo, liff } = useLiff();

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

  // メンバー検索・絞り込み
  const [memberSearch, setMemberSearch] = useState("");
  const [memberFilter, setMemberFilter] = useState<
    "all" | "managers" | "coaches" | "parents" | "unlinked"
  >("all");

  // 役職カスタム呼称マップ
  const [customLabels, setCustomLabels] = useState<Record<string, string>>({});
  const [isSavingTitles, setIsSavingTitles] = useState(false);

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

  const syncCustomLabelsFromData = useCallback(
    (res: AdminDashboardData | null) => {
      if (!res) return;
      const nextMap: Record<string, string> = {};
      for (const item of res.roleSettings || []) {
        if (item.role && item.customLabel) {
          nextMap[item.role.toLowerCase()] = item.customLabel;
        }
      }
      setCustomLabels(nextMap);
    },
    []
  );

  useEffect(() => {
    if (initialCached) {
      syncCustomLabelsFromData(initialCached);
    }
  }, [initialCached, syncCustomLabelsFromData]);

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

  const getDisplayRoleLabel = useCallback(
    (roleKey: string): string => {
      const clean = (roleKey || "parent").toLowerCase();
      if (customLabels[clean]?.trim()) {
        return customLabels[clean].trim();
      }
      const found = ROLE_MASTER_LIST.find((r) => r.role === clean);
      return found ? found.defaultLabel : roleKey;
    },
    [customLabels]
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
          syncCustomLabelsFromData(syncHit);
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
          syncCustomLabelsFromData(json);
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
    [dashboardEndpoint, syncCustomLabelsFromData]
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
      await loadDashboardData(true);
      toast.success(json.message || "役職の呼称設定を保存しました！");
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSavingTitles(false);
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
                        url: "https://iscorecloud.com/liff-logo.png?v=2",
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

  // メンバー絞り込み
  const filteredActiveMembers = useMemo(() => {
    const list = data?.activeMembers || [];
    const q = memberSearch.trim().toLowerCase();

    return list.filter((m) => {
      const subs = m.subRoles || [];
      const allRoles = [m.role, ...subs];
      const isLinked = m.isLineLinked ?? Boolean(m.userId);

      if (
        memberFilter === "managers" &&
        !allRoles.some((r) => r === "manager" || r === "admin")
      ) {
        return false;
      }
      if (
        memberFilter === "coaches" &&
        !allRoles.some((r) => r === "coach" || r === "scorer" || r === "staff")
      ) {
        return false;
      }
      if (
        memberFilter === "parents" &&
        !allRoles.some((r) => r === "parent" || r === "player" || r === "viewer")
      ) {
        return false;
      }
      if (memberFilter === "unlinked" && isLinked) {
        return false;
      }

      if (!q) return true;
      const roleText = allRoles.map((r) => getDisplayRoleLabel(r)).join(" ");
      const hay = `${m.name} ${m.nameKana || ""} ${roleText} ${
        m.subLabel || ""
      } ${m.phone || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data?.activeMembers, memberFilter, memberSearch, getDisplayRoleLabel]);

  const pendingCount = data?.pendingRequests?.length || 0;
  const activeCount =
    data?.activeMembers?.length ?? data?.stats?.activeCount ?? 0;

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
                                options={ROLE_MASTER_LIST.map((rm) => ({
                                  value: rm.role,
                                  label: getDisplayRoleLabel(rm.role),
                                  sublabel: rm.summary,
                                  badge: rm.canAdminMenu
                                    ? "管理権限あり"
                                    : undefined,
                                  badgeTone: rm.badgeTone,
                                }))}
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
              <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden animate-in fade-in duration-200">
                <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 px-4 py-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-7 h-7 rounded-xl bg-slate-800 text-amber-400 border border-slate-700 flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-xs sm:text-sm font-black text-white truncate">
                        メンバー・権限・兼務管理
                      </h3>
                      <p className="text-[10px] font-bold text-slate-300 truncate">
                        手動追加・主役職/兼務ロール・当番班・LINE統合
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 text-[11px] font-black shrink-0">
                    {filteredActiveMembers.length}名
                  </span>
                </div>

                <div className="p-4 space-y-3">
                  {/* アクションバー（手動追加 ＆ LINE重複統合） */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={openAddMemberModal}
                      className="h-9 px-3.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all"
                    >
                      <UserPlus className="w-3.5 h-3.5 shrink-0" />
                      <span>＋ メンバーを手動追加</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenMergeModal()}
                      className="h-9 px-3 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-xs font-black flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95 transition-all"
                    >
                      <GitMerge className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                      <span>LINE重複統合</span>
                    </button>
                  </div>

                  {/* ロール絞り込みチップ */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                    {(
                      [
                        { id: "all", label: "全員" },
                        { id: "managers", label: "🔑 監督・管理" },
                        { id: "coaches", label: "⚾ コーチ・記録・運営" },
                        { id: "parents", label: "👪 保護者・選手" },
                        { id: "unlinked", label: "📝 手動登録（未連携）" },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setMemberFilter(f.id)}
                        className={cn(
                          "h-8 px-2.5 rounded-xl border text-[11px] shrink-0 transition-colors cursor-pointer",
                          memberFilter === f.id
                            ? "bg-[#0f172a] text-white border-[#0f172a] font-black"
                            : "bg-card text-muted-foreground border-border hover:text-foreground font-bold"
                        )}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  {/* 検索ボックス */}
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input
                      type="text"
                      placeholder="氏名・かな・役職・当番班で絞り込み..."
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      className="pl-9 pr-8 h-10 rounded-xl text-xs font-bold bg-card border-border shadow-xs"
                    />
                    {memberSearch && (
                      <button
                        type="button"
                        onClick={() => setMemberSearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* メンバー一覧 */}
                  <div className="space-y-2">
                    {filteredActiveMembers.length === 0 ? (
                      <div className="p-8 text-center text-xs font-bold text-muted-foreground rounded-2xl border border-border bg-muted/20 space-y-2">
                        <p>条件に一致するメンバーが見つかりません</p>
                        <button
                          type="button"
                          onClick={openAddMemberModal}
                          className="mt-1 h-8 px-3 rounded-xl bg-primary text-primary-foreground text-[11px] font-black inline-flex items-center gap-1 cursor-pointer"
                        >
                          <UserPlus className="w-3 h-3" />
                          <span>新しいメンバーを手動追加</span>
                        </button>
                      </div>
                    ) : (
                      filteredActiveMembers.map((member) => {
                        const subs = member.subRoles || [];
                        const allRoles = [member.role, ...subs];
                        const isManagerPower = allRoles.some(
                          (r) => r === "manager" || r === "admin"
                        );
                        const isLinked =
                          member.isLineLinked ?? Boolean(member.userId);

                        return (
                          <div
                            key={member.memberId}
                            className="p-3.5 rounded-2xl border border-border bg-card shadow-2xs flex items-center justify-between gap-2.5"
                          >
                            <div className="space-y-1.5 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h4 className="text-xs sm:text-sm font-black text-foreground truncate">
                                  {member.name}
                                </h4>
                                {isLinked ? (
                                  <span className="px-1.5 py-0.5 rounded bg-[#06C755]/15 text-[#059440] dark:text-[#2ee075] border border-[#06C755]/30 text-[10px] font-black flex items-center gap-0.5">
                                    <UserCheck className="w-2.5 h-2.5" />
                                    <span>LINE連携済</span>
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border text-[10px] font-bold">
                                    手動登録（未連携）
                                  </span>
                                )}
                                {member.subLabel && (
                                  <span className="px-2 py-0.5 rounded bg-teal-500/12 text-teal-700 dark:text-teal-300 border border-teal-500/30 text-[10px] font-black">
                                    {member.subLabel}
                                  </span>
                                )}
                              </div>

                              {/* 主ロール ＋ 兼務サブバッジ */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10.5px] font-black ${
                                    isManagerPower
                                      ? "bg-[#0f172a] text-amber-300"
                                      : "bg-primary/12 text-primary border border-primary/25"
                                  }`}
                                >
                                  主: {getDisplayRoleLabel(member.role)}
                                </span>
                                {subs.map((sr) => (
                                  <span
                                    key={sr}
                                    className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-[10px] font-black"
                                  >
                                    兼: {getDisplayRoleLabel(sr)}
                                  </span>
                                ))}
                                {member.phone && (
                                  <span className="text-[10px] font-bold text-muted-foreground">
                                    {member.phone}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {!isLinked && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenMergeModal(member)}
                                  title="LINE参加アカウントと統合"
                                  className="h-8 px-2 rounded-xl border border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/20 text-teal-700 dark:text-teal-300 text-[11px] font-black flex items-center gap-1 cursor-pointer"
                                >
                                  <GitMerge className="w-3 h-3" />
                                  <span className="hidden sm:inline">統合</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => openEditMemberModal(member)}
                                className="h-8 px-2.5 rounded-xl bg-[#0f172a] hover:bg-slate-800 text-white text-xs font-black flex items-center gap-1 cursor-pointer"
                              >
                                <Edit2 className="w-3 h-3 text-teal-400" />
                                <span>編集</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setDeletingMember(member)}
                                title="メンバーを削除"
                                aria-label={`${member.name}さんを削除`}
                                className="h-8 w-8 rounded-xl border border-border bg-background hover:bg-rose-600 text-muted-foreground hover:text-white flex items-center justify-center cursor-pointer transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                🅲️ 【役職設定（呼称カスタム・権限表）】タブ
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            {activeTab === "titles" && (
              <div className="space-y-4 animate-in fade-in duration-200">
                {/* 役職カスタム呼称カード */}
                <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
                  <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-7 h-7 rounded-xl bg-slate-800 text-amber-400 border border-slate-700 flex items-center justify-center shrink-0">
                        <KeyRound className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-xs sm:text-sm font-black text-white truncate">
                          チーム独自の役職名カスタマイズ
                        </h3>
                        <p className="text-[10px] font-bold text-slate-300 truncate">
                          普段使っている役員・係の呼び名に変更できます
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCustomLabels({})}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[10px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>初期値に戻す</span>
                    </button>
                  </div>

                  <div className="p-4 space-y-3 text-xs">
                    <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
                      例:「IT管理者」→「父母会長・事務局」、「スタッフ」→「審判部」など、チーム独自の肩書に変更できます（空欄は標準名を使用）。
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
                      className="w-full h-10 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
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
                  <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
                    <h3 className="text-xs sm:text-sm font-black text-white">
                      役職別 権限マトリクス早見表
                    </h3>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-muted border-b border-border text-[11px] font-black text-foreground">
                          <th className="p-2.5 text-left">役職（ロール）</th>
                          <th className="p-2 text-center">チーム管理</th>
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

            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                🅳️ 【LINE招待】タブ
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            {activeTab === "invite" && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
                  <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-[#06C755] px-4 py-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src="/liff-logo.webp?v=2"
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
                    兼務ロール（複数選択可 — 例:「保護者」兼「スコアラー・IT管理者」）
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
                            {checked && (
                              <Check className="w-3.5 h-3.5 shrink-0" />
                            )}
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>

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
                    {PRESET_SUB_LABELS.map((label) => (
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
                  className="h-10 px-5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingMember ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>{editingMember ? "変更を保存" : "メンバーを追加"}</span>
                </button>
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
