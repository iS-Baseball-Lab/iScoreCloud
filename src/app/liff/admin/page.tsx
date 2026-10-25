// filepath: src/app/liff/admin/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { 
  ShieldCheck, 
  UserCheck, 
  Users, 
  Copy, 
  Share2, 
  Check, 
  X, 
  Clock, 
  Settings, 
  AlertCircle, 
  Calendar, 
  ClipboardCheck, 
  ExternalLink,
  ChevronRight,
  Search,
  RefreshCw,
  Phone,
  Mail,
  Edit2,
  Lock,
  Sparkles,
  UserPlus
} from "lucide-react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { useLiff } from "@/components/liff/LiffProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
  subLabel?: string;
}

interface AdminDashboardData {
  success: boolean;
  isDemo?: boolean;
  canManage?: boolean;
  myRole?: string;
  team?: {
    id: string;
    name: string;
    shortName: string;
    inviteCode: string;
  };
  stats?: {
    pendingCount: number;
    activeCount: number;
    playerCount: number;
  };
  pendingRequests?: PendingRequest[];
  activeMembers?: ActiveMember[];
}

const ROLE_OPTIONS = [
  { id: "parent", label: "保護者", desc: "出欠・配車・閲覧" },
  { id: "coach", label: "コーチ", desc: "指導・スコア入力" },
  { id: "scorer", label: "スコアラー", desc: "スコア入力・管理" },
  { id: "staff", label: "スタッフ", desc: "運営・サポート" },
  { id: "manager", label: "監督・代表", desc: "全権限・承認" },
  { id: "admin", label: "IT管理者", desc: "システム・参加承認" },
];

const PRESET_SUB_LABELS = ["1班", "2班", "3班", "4班", "配車", "審判", "用具", "救急"];

export default function LiffAdminDashboardPage() {
  const { currentTeam, profile, isDemo: providerDemo, liff } = useLiff();
  const [activeTab, setActiveTab] = useState<"requests" | "members" | "invite">("requests");

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [data, setData] = useState<AdminDashboardData | null>(null);

  // メンバー検索・絞り込み
  const [memberSearch, setMemberSearch] = useState("");
  const [memberFilter, setMemberFilter] = useState<"all" | "staff" | "parent">("all");

  // メンバー編集ポップアップ
  const [editingMember, setEditingMember] = useState<ActiveMember | null>(null);
  const [editRole, setEditRole] = useState("parent");
  const [editSubLabel, setEditSubLabel] = useState("");
  const [isSavingMember, setIsSavingMember] = useState(false);

  // 招待コードコピーフィードバック
  const [isCopied, setIsCopied] = useState(false);

  // ─── ダッシュボードデータの取得 ─────────────────────
  const loadDashboardData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const tid = currentTeam?.id || (typeof window !== "undefined" ? localStorage.getItem("iscore_selectedTeamId") : "") || "demo-team";
      const uid = profile?.userId || (typeof window !== "undefined" ? localStorage.getItem("iscore_user_id") : "") || "";

      const res = await fetch(`/api/liff/admin/dashboard?teamId=${encodeURIComponent(tid)}&userId=${encodeURIComponent(uid)}`);
      if (res.ok) {
        const json = (await res.json()) as AdminDashboardData;
        if (json.success) {
          setData(json);
        }
      }
    } catch (err) {
      console.error("Failed to load admin dashboard data:", err);
      toast.error("管理者データの取得に失敗しました");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [currentTeam?.id, profile?.userId]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // ─── 参加申請の承認・却下アクション ─────────────────
  const handleRequestAction = async (memberId: string, action: "approve" | "reject") => {
    const tid = currentTeam?.id || "demo-team";
    try {
      const res = await fetch("/api/liff/admin/requests/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: tid,
          memberId,
          action,
          role: "parent",
        }),
      });

      const resJson = await res.json() as any;
      if (resJson.success) {
        toast.success(action === "approve" ? "参加申請を承認しました！" : "参加申請を却下しました");
        // ローカルステート即時更新
        setData((prev) => {
          if (!prev) return prev;
          const target = prev.pendingRequests?.find((r) => r.memberId === memberId);
          const newPending = prev.pendingRequests?.filter((r) => r.memberId !== memberId) || [];
          let newActive = prev.activeMembers || [];
          if (action === "approve" && target) {
            newActive = [
              {
                memberId: target.memberId,
                name: target.name,
                nameKana: target.nameKana,
                memberType: target.memberType,
                phone: target.phone,
                email: target.email,
                role: "parent",
                subLabel: "",
              },
              ...newActive,
            ];
          }
          return {
            ...prev,
            pendingRequests: newPending,
            activeMembers: newActive,
            stats: {
              ...(prev.stats || { activeCount: 0, playerCount: 0, pendingCount: 0 }),
              pendingCount: newPending.length,
              activeCount: newActive.length,
            },
          };
        });
      } else {
        toast.error(resJson.error || "処理に失敗しました");
      }
    } catch (err) {
      toast.error("通信エラーが発生しました");
    }
  };

  // ─── メンバー情報の更新保存 ─────────────────────────
  const handleSaveMemberRole = async () => {
    if (!editingMember) return;
    const tid = currentTeam?.id || "demo-team";
    setIsSavingMember(true);
    try {
      const res = await fetch("/api/liff/admin/members/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: tid,
          memberId: editingMember.memberId,
          role: editRole,
          subLabel: editSubLabel.trim(),
        }),
      });

      const resJson = await res.json() as any;
      if (resJson.success) {
        toast.success(`${editingMember.name} さんの設定を更新しました`);
        setData((prev) => {
          if (!prev) return prev;
          const updatedActive = (prev.activeMembers || []).map((m) =>
            m.memberId === editingMember.memberId
              ? { ...m, role: editRole, subLabel: editSubLabel.trim() }
              : m
          );
          return { ...prev, activeMembers: updatedActive };
        });
        setEditingMember(null);
      } else {
        toast.error(resJson.error || "更新に失敗しました");
      }
    } catch {
      toast.error("更新処理に失敗しました");
    } finally {
      setIsSavingMember(false);
    }
  };

  // ─── 招待コードのコピー & LINEシェア ──────────────────
  const inviteCode = data?.team?.inviteCode || currentTeam?.id || "DEMO2026";
  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}/liff?join=${encodeURIComponent(inviteCode)}` : "";

  const handleCopyInvite = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(inviteCode);
      setIsCopied(true);
      toast.success("招待コードをコピーしました！");
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleShareLine = async () => {
    const text = `【${data?.team?.name || "チーム"}】LINEミニアプリへの参加案内です！\n下記の招待コードを入力してご参加ください。\n\n🔑 招待コード: ${inviteCode}\n📲 参加URL: ${inviteUrl}`;
    
    try {
      if (liff && liff.isApiAvailable("shareTargetPicker")) {
        await liff.shareTargetPicker([
          {
            type: "text",
            text,
          },
        ]);
        toast.success("LINEで招待を共有しました");
      } else {
        window.open(`https://line.me/R/msg/text/?${encodeURIComponent(text)}`, "_blank");
      }
    } catch (e) {
      window.open(`https://line.me/R/msg/text/?${encodeURIComponent(text)}`, "_blank");
    }
  };

  // メンバー絞り込み
  const filteredActiveMembers = useMemo(() => {
    let list = data?.activeMembers || [];
    if (memberFilter === "staff") {
      list = list.filter((m) => m.role === "manager" || m.role === "coach" || m.role === "scorer" || m.role === "admin" || m.role === "staff");
    } else if (memberFilter === "parent") {
      list = list.filter((m) => m.role === "parent");
    }

    if (memberSearch.trim()) {
      const q = memberSearch.trim().toLowerCase();
      list = list.filter((m) =>
        m.name.toLowerCase().includes(q) ||
        (m.subLabel && m.subLabel.toLowerCase().includes(q)) ||
        (m.phone && m.phone.includes(q))
      );
    }

    return list;
  }, [data?.activeMembers, memberFilter, memberSearch]);

  const pendingCount = data?.pendingRequests?.length || 0;
  const isAuthorized = data?.canManage || providerDemo || data?.isDemo;

  return (
    <div className="min-h-screen bg-background pb-32 text-foreground">
      {/* 🌟 ヘッダー */}
      <LiffHeader
        shareData={{
          title: `IT管理者コンソール - ${data?.team?.name || "チーム"}`,
          text: `参加承認・メンバー管理はこちらから行えます。`,
        }}
      />

      <div className="p-4 space-y-4">
        {/* ページタイトル */}
        <div className="flex items-center justify-between">
          <LiffPageHeader 
            title="IT管理者コンソール" 
            subtitle="TEAM ADMIN DASHBOARD" 
            showBack 
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => loadDashboardData(true)}
            disabled={isRefreshing}
            className="h-8 px-2.5 rounded-full text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 mr-1", isRefreshing && "animate-spin")} />
            <span>更新</span>
          </Button>
        </div>

        {/* 🔒 権限エラー表示（IT管理者・監督でない場合） */}
        {!isLoading && !isAuthorized && (
          <div className="p-6 rounded-2xl bg-card border-2 border-rose-500/20 text-center space-y-3">
            <Lock className="w-10 h-10 text-rose-500 mx-auto" />
            <h3 className="text-base font-black text-foreground">権限がありません</h3>
            <p className="text-xs text-muted-foreground font-bold">
              この画面はチームの「IT管理者」または「監督・代表」に指定されたメンバーのみ利用可能です。
            </p>
            <Link
              href="/liff"
              className="inline-block mt-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-black"
            >
              チームHUBへ戻る
            </Link>
          </div>
        )}

        {isAuthorized && (
          <>
            {/* 🧢 チーム＆権限ステータスサマリー */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 flex items-center justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-[10px] font-black uppercase tracking-wider text-primary">
                    {data?.myRole === "admin" ? "IT管理者権限" : data?.myRole === "manager" ? "監督・代表権限" : "管理者モード"}
                  </span>
                </div>
                <h2 className="text-sm font-black truncate text-foreground">
                  {data?.team?.name || currentTeam?.name || "チーム"}
                </h2>
              </div>

              <div className="flex items-center gap-2 shrink-0 text-right">
                <div className="px-2.5 py-1 rounded-xl bg-card border border-border shadow-2xs">
                  <span className="text-[9px] font-bold text-muted-foreground block">未承認</span>
                  <span className={cn("text-xs font-black", pendingCount > 0 ? "text-orange-500 animate-pulse" : "text-foreground")}>
                    {pendingCount}件
                  </span>
                </div>
                <div className="px-2.5 py-1 rounded-xl bg-card border border-border shadow-2xs">
                  <span className="text-[9px] font-bold text-muted-foreground block">総メンバー</span>
                  <span className="text-xs font-black text-foreground">
                    {data?.stats?.activeCount || 0}名
                  </span>
                </div>
              </div>
            </div>

            {/* 🌟 セグメントタブ切り替え */}
            <div className="flex items-center p-1 bg-muted/60 backdrop-blur-md rounded-2xl border border-border shadow-2xs">
              <button
                type="button"
                onClick={() => setActiveTab("requests")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl text-xs font-black transition-all cursor-pointer",
                  activeTab === "requests"
                    ? "bg-card text-foreground shadow-xs ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>参加承認</span>
                {pendingCount > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-orange-500 text-white text-[10px] font-black animate-pulse">
                    {pendingCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("members")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl text-xs font-black transition-all cursor-pointer",
                  activeTab === "members"
                    ? "bg-card text-foreground shadow-xs ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Users className="w-3.5 h-3.5" />
                <span>メンバー・班</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("invite")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl text-xs font-black transition-all cursor-pointer",
                  activeTab === "invite"
                    ? "bg-card text-foreground shadow-xs ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>招待 & 設定</span>
              </button>
            </div>

            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                🅰️ 【参加承認】タブ
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            {activeTab === "requests" && (
              <div className="space-y-3 animate-in fade-in duration-200">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-black text-muted-foreground flex items-center gap-1.5">
                    <UserPlus className="w-3.5 h-3.5 text-primary" />
                    <span>参加申請一覧 ({pendingCount}件)</span>
                  </h3>
                  <span className="text-[11px] font-bold text-muted-foreground">
                    承認すると予定や出欠が解禁されます
                  </span>
                </div>

                {isLoading ? (
                  <div className="p-8 text-center text-xs font-bold text-muted-foreground">
                    申請データを読み込み中...
                  </div>
                ) : pendingCount === 0 ? (
                  <div className="p-8 rounded-2xl bg-card border border-border/60 text-center space-y-2">
                    <Check className="w-8 h-8 text-emerald-500 mx-auto" />
                    <p className="text-xs font-black text-foreground">承認待ちの申請はありません</p>
                    <p className="text-[11px] text-muted-foreground font-medium">
                      新しい保護者や指導者が招待コードを入力すると、ここに申請が届きます
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {data?.pendingRequests?.map((req) => (
                      <div
                        key={req.memberId}
                        className="p-3.5 rounded-2xl bg-card border-2 border-orange-500/25 shadow-xs space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30">
                                {req.memberType === "father" ? "父" : req.memberType === "mother" ? "母" : req.memberType === "staff" ? "指導・スタッフ" : "保護者"}
                              </span>
                              <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-0.5">
                                <Clock className="w-3 h-3" />
                                {req.joinedAt ? new Date(req.joinedAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "申請中"}
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
                          <div className="p-2 rounded-xl bg-muted/40 border border-border/40 text-[11px] space-y-1">
                            {req.phone && (
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                <Phone className="w-3 h-3 shrink-0" />
                                <a href={`tel:${req.phone}`} className="font-bold text-primary hover:underline">
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

                        {/* 操作ボタン */}
                        <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleRequestAction(req.memberId, "approve")}
                            className="flex-1 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-xs gap-1"
                          >
                            <Check className="w-4 h-4" />
                            <span>承認する</span>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (window.confirm(`${req.name} さんの参加申請を却下しますか？`)) {
                                handleRequestAction(req.memberId, "reject");
                              }
                            }}
                            className="h-9 px-3 rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 font-bold text-xs"
                          >
                            <X className="w-4 h-4 mr-0.5" />
                            <span>却下</span>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                🅱️ 【メンバー・班管理】タブ
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            {activeTab === "members" && (
              <div className="space-y-3 animate-in fade-in duration-200">
                {/* 検索 & フィルター */}
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="名前・班（例: 山田, 1班）で絞り込み"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      className="pl-9 h-10 rounded-xl text-xs font-bold bg-card border-border"
                    />
                    {memberSearch && (
                      <button
                        type="button"
                        onClick={() => setMemberSearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-xs">
                    {(["all", "staff", "parent"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setMemberFilter(t)}
                        className={cn(
                          "px-3 py-1.5 rounded-xl font-black text-[11px] transition-all cursor-pointer",
                          memberFilter === t
                            ? "bg-primary text-primary-foreground shadow-2xs"
                            : "bg-card text-muted-foreground border border-border hover:text-foreground"
                        )}
                      >
                        {t === "all" ? "全員" : t === "staff" ? "指導・スタッフ" : "保護者"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* メンバー一覧 */}
                <div className="space-y-2">
                  {filteredActiveMembers.length === 0 ? (
                    <div className="p-8 text-center text-xs font-bold text-muted-foreground bg-card rounded-2xl border border-border">
                      一致するメンバーが見つかりません
                    </div>
                  ) : (
                    filteredActiveMembers.map((member) => (
                      <div
                        key={member.memberId}
                        className="p-3 rounded-2xl bg-card border border-border shadow-2xs flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-muted text-muted-foreground border border-border">
                              {ROLE_OPTIONS.find((r) => r.id === member.role)?.label || member.role}
                            </span>
                            {member.subLabel && (
                              <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                                {member.subLabel}
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-black text-foreground truncate">
                            {member.name}
                          </h4>
                          {member.phone && (
                            <p className="text-[10px] font-bold text-muted-foreground">
                              {member.phone}
                            </p>
                          )}
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingMember(member);
                            setEditRole(member.role || "parent");
                            setEditSubLabel(member.subLabel || "");
                          }}
                          className="h-8 px-2.5 rounded-xl text-xs font-bold border-border bg-muted/40 hover:bg-muted gap-1 shrink-0"
                        >
                          <Edit2 className="w-3 h-3 text-primary" />
                          <span>変更</span>
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                🅲️ 【招待 & 設定】タブ
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            {activeTab === "invite" && (
              <div className="space-y-4 animate-in fade-in duration-200">
                {/* 🔑 招待コードカード */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-card via-card to-primary/5 border border-border shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-muted-foreground flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                      <span>チーム招待コード</span>
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      LINEから直接参加可
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-muted/50 border border-border/80 flex items-center justify-between gap-2">
                    <span className="font-mono text-sm sm:text-base font-black tracking-widest text-foreground select-all truncate">
                      {inviteCode}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleCopyInvite}
                      className="h-8 px-3 rounded-lg bg-primary text-primary-foreground font-black text-xs shrink-0 gap-1"
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{isCopied ? "コピー済" : "コピー"}</span>
                    </Button>
                  </div>

                  <Button
                    type="button"
                    onClick={handleShareLine}
                    className="w-full h-10 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white font-black text-xs gap-1.5 shadow-xs"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>LINEでメンバーを招待する</span>
                  </Button>
                </div>

                {/* 🚀 管理クイックショートカット */}
                <div className="space-y-2">
                  <h4 className="text-xs font-black text-muted-foreground px-1">
                    管理者向けクイックショートカット
                  </h4>
                  
                  <div className="grid grid-cols-1 gap-2">
                    <Link
                      href="/liff/schedule/board"
                      className="p-3.5 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all flex items-center justify-between shadow-2xs group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                          <ClipboardCheck className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-black text-foreground group-hover:text-primary transition-colors">
                            出欠一覧表・当番管理
                          </p>
                          <p className="text-[10px] text-muted-foreground font-bold">
                            出欠集計、ヘッダー班ラベルの一括設定
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                    </Link>

                    <Link
                      href="/liff/schedule?tab=planner"
                      className="p-3.5 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all flex items-center justify-between shadow-2xs group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
                          <Calendar className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-black text-foreground group-hover:text-primary transition-colors">
                            活動予定スケジューラー
                          </p>
                          <p className="text-[10px] text-muted-foreground font-bold">
                            練習・試合予定の新規作成・通知送信
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                    </Link>

                    <Link
                      href="/liff/settings/team"
                      className="p-3.5 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all flex items-center justify-between shadow-2xs group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                          <Settings className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-black text-foreground group-hover:text-primary transition-colors">
                            チーム環境設定
                          </p>
                          <p className="text-[10px] text-muted-foreground font-bold">
                            イニング数・規定・活動カテゴリ管理
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 🌟 メンバー役割・班編集ポップアップモーダル */}
      {editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-3xl bg-card border border-border p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <span className="text-[10px] font-black uppercase text-primary tracking-wider">メンバー設定</span>
                <h3 className="text-base font-black text-foreground truncate">{editingMember.name} さん</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 1. 役割 (Role) の選択 */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-foreground">チーム内の役割 (Role)</label>
              <div className="grid grid-cols-2 gap-1.5">
                {ROLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setEditRole(opt.id)}
                    className={cn(
                      "p-2 rounded-xl text-left border transition-all cursor-pointer",
                      editRole === opt.id
                        ? "bg-primary text-primary-foreground border-primary shadow-xs font-black"
                        : "bg-muted/40 text-foreground border-border hover:bg-muted font-bold"
                    )}
                  >
                    <p className="text-xs leading-none">{opt.label}</p>
                    <p className={cn("text-[9px] mt-1 leading-none truncate", editRole === opt.id ? "text-primary-foreground/80" : "text-muted-foreground")}>
                      {opt.desc}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. 班・サブラベルの設定 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-foreground">当番班・サブラベル</label>
                <span className="text-[10px] text-muted-foreground font-bold">出欠表の氏名下に表示</span>
              </div>

              <div className="flex flex-wrap gap-1 mb-1.5">
                {PRESET_SUB_LABELS.map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setEditSubLabel(label)}
                    className={cn(
                      "px-2 py-1 rounded-lg text-xs font-bold border transition-all",
                      editSubLabel === label
                        ? "bg-amber-500 text-white border-amber-600 font-black shadow-2xs"
                        : "bg-muted text-muted-foreground border-border hover:text-foreground"
                    )}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setEditSubLabel("")}
                  className="px-2 py-1 rounded-lg text-xs font-bold bg-muted/60 text-muted-foreground border border-border hover:text-rose-500"
                >
                  解除
                </button>
              </div>

              <Input
                type="text"
                placeholder="自由入力 (例: 1班, 捕手, 配車)"
                value={editSubLabel}
                maxLength={8}
                onChange={(e) => setEditSubLabel(e.target.value)}
                className="h-9 rounded-xl text-xs font-bold bg-muted/50 border-border"
              />
            </div>

            {/* アクションボタン */}
            <div className="flex items-center gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingMember(null)}
                className="flex-1 h-10 rounded-xl text-xs font-bold"
              >
                キャンセル
              </Button>
              <Button
                type="button"
                onClick={handleSaveMemberRole}
                disabled={isSavingMember}
                className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground font-black text-xs shadow-xs"
              >
                {isSavingMember ? "保存中..." : "変更を保存"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
