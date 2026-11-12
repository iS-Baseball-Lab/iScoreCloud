// filepath: src/app/liff/admin/teams/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRightLeft,
  Building2,
  Check,
  Image as ImageIcon,
  Layers,
  Loader2,
  MapPin,
  Plus,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type {
  AdminSquadItem,
  AdminTeamsResponse,
} from "@/api/liff/admin-management";
import { AdminMgmtShell } from "@/components/liff/AdminMgmtShell";
import { useLiff } from "@/components/liff/LiffProvider";
import { LiffSelect } from "@/components/liff/LiffSelect";
import {
  invalidateLiffApiCache,
  peekLiffApiCache,
} from "@/lib/liff/api-cache";
import { navigateToLiffRoot } from "@/lib/liff/navigation";

const CATEGORY_OPTIONS = [
  { value: "gakudou", label: "学童野球（小学生・軟式）" },
  { value: "little", label: "リトル・ボーイズ等（小学生・硬式）" },
  { value: "chugaku_nanshiki", label: "中学軟式（部活・クラブ）" },
  { value: "chugaku_koshiki", label: "中学硬式（シニア・ボーイズ・ヤング等）" },
  { value: "koukou", label: "高校野球（硬式・軟式）" },
  { value: "daigaku", label: "大学野球・準硬式" },
  { value: "shakaijin", label: "社会人・企業・クラブチーム" },
  { value: "kusa", label: "草野球・一般軟式" },
  { value: "softball", label: "ソフトボール" },
  { value: "other", label: "その他" },
] as const;

const TIER_OPTIONS = [
  { value: "A", label: "Aチーム（トップ・レギュラー編成）" },
  { value: "B", label: "Bチーム（育成・セカンド編成）" },
  { value: "C", label: "Cチーム・ジュニア編成（低学年等）" },
  { value: "ALL", label: "全体統合編成（1チーム運用）" },
] as const;

const TEAM_TYPE_OPTIONS = [
  { value: "regular", label: "公式・通年編成（レギュラー）" },
  { value: "practice", label: "練習試合・イベント限定編成" },
] as const;

export default function LiffAdminTeamsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    currentTeam,
    profile,
    isLoggedIn,
    login,
    selectTeam,
    refreshTeams,
  } = useLiff();

  const teamId = currentTeam?.id || "demo-team";
  const endpointUrl = `/api/liff/admin/mgmt/teams?teamId=${encodeURIComponent(
    teamId
  )}`;

  const initialCached = useMemo(() => {
    if (typeof window === "undefined") return null;
    return peekLiffApiCache<AdminTeamsResponse>(endpointUrl);
  }, [endpointUrl]);

  const [data, setData] = useState<AdminTeamsResponse | null>(initialCached);
  const [isLoading, setIsLoading] = useState<boolean>(!initialCached);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingCurrent, setIsSavingCurrent] = useState(false);

  // クラブ基本情報フォーム
  const [orgName, setOrgName] = useState("");
  const [orgShortName, setOrgShortName] = useState("");
  const [category, setCategory] = useState("gakudou");
  const [foundedYearInput, setFoundedYearInput] = useState("");
  const [description, setDescription] = useState("");

  // 現在選択中の編成フォーム
  const [squadName, setSquadName] = useState("");
  const [yearInput, setYearInput] = useState(String(new Date().getFullYear()));
  const [managerName, setManagerName] = useState("");
  const [captainId, setCaptainId] = useState("__none__");
  const [homeGround, setHomeGround] = useState("");
  const [tier, setTier] = useState("A");
  const [teamType, setTeamType] = useState<"regular" | "practice">("regular");

  // モーダル: 同一クラブ内の新規編成追加
  const [isAddSquadOpen, setIsAddSquadOpen] = useState(false);
  const [newSquadName, setNewSquadName] = useState("");
  const [newSquadYear, setNewSquadYear] = useState(
    String(new Date().getFullYear())
  );
  const [newSquadTier, setNewSquadTier] = useState("B");
  const [newSquadType, setNewSquadType] = useState<"regular" | "practice">(
    "regular"
  );
  const [newSquadManager, setNewSquadManager] = useState("");
  const [newSquadGround, setNewSquadGround] = useState("");
  const [copyStaffMembers, setCopyStaffMembers] = useState(true);
  const [isCreatingSquad, setIsCreatingSquad] = useState(false);

  // モーダル: 編成削除確認
  const [deletingSquad, setDeletingSquad] = useState<AdminSquadItem | null>(
    null
  );
  const [isDeletingSquad, setIsDeletingSquad] = useState(false);

  // モーダル: 別クラブ（新団体）の新規立ち上げ
  const [isCreateClubOpen, setIsCreateClubOpen] = useState(false);
  const [newClubOrgName, setNewClubOrgName] = useState("");
  const [newClubShortName, setNewClubShortName] = useState("");
  const [newClubCategory, setNewClubCategory] = useState("gakudou");
  const [newClubSquadName, setNewClubSquadName] = useState(
    `${new Date().getFullYear()}年度 Aチーム`
  );
  const [newClubGround, setNewClubGround] = useState("");
  const [isCreatingClub, setIsCreatingClub] = useState(false);

  const hydrateFormFromResponse = useCallback((res: AdminTeamsResponse) => {
    setOrgName(res.organization.name || "");
    setOrgShortName(res.organization.shortName || "");
    setCategory(res.organization.category || "gakudou");
    setFoundedYearInput(
      res.organization.foundedYear ? String(res.organization.foundedYear) : ""
    );
    setDescription(res.organization.description || "");

    setSquadName(res.currentSquad.name || "");
    setYearInput(
      String(res.currentSquad.year || new Date().getFullYear())
    );
    setManagerName(res.currentSquad.managerName || "");
    setCaptainId(res.currentSquad.captainId || "__none__");
    setHomeGround(res.currentSquad.homeGround || "");
    setTier(res.currentSquad.tier || "A");
    setTeamType(
      res.currentSquad.teamType === "practice" ? "practice" : "regular"
    );
  }, []);

  useEffect(() => {
    if (initialCached) {
      hydrateFormFromResponse(initialCached);
    }
  }, [initialCached, hydrateFormFromResponse]);

  const loadTeamsData = useCallback(
    async (bypassCache = false) => {
      if (bypassCache) {
        setIsRefreshing(true);
      } else {
        const syncHit = peekLiffApiCache<AdminTeamsResponse>(endpointUrl);
        if (syncHit) {
          setData(syncHit);
          hydrateFormFromResponse(syncHit);
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
        const json = (await res.json()) as AdminTeamsResponse;
        if (res.ok && json.success) {
          setData(json);
          hydrateFormFromResponse(json);
        } else if (json.error) {
          toast.error(json.error);
        }
      } catch {
        toast.error("チーム管理データの取得に失敗しました");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [endpointUrl, hydrateFormFromResponse]
  );

  useEffect(() => {
    void loadTeamsData(false);
  }, [loadTeamsData]);

  const handleSaveCurrentTeam = async () => {
    if (!orgName.trim()) {
      toast.error("クラブ（チーム）名を入力してください");
      return;
    }
    if (!squadName.trim()) {
      toast.error("編成名を入力してください");
      return;
    }

    setIsSavingCurrent(true);
    try {
      const parsedFounded = foundedYearInput.trim()
        ? parseInt(foundedYearInput.trim(), 10)
        : null;
      const parsedYear =
        parseInt(yearInput.trim(), 10) || new Date().getFullYear();

      const res = await fetch("/api/liff/admin/mgmt/teams/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          userId: profile?.userId || undefined,
          orgName: orgName.trim(),
          orgShortName: orgShortName.trim(),
          category,
          foundedYear:
            parsedFounded && !Number.isNaN(parsedFounded)
              ? parsedFounded
              : null,
          description: description.trim(),
          squadName: squadName.trim(),
          year: parsedYear,
          managerName: managerName.trim(),
          captainId: captainId === "__none__" ? null : captainId,
          homeGround: homeGround.trim(),
          tier,
          teamType,
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

      if (typeof window !== "undefined") {
        localStorage.setItem(`iscore_team_name_${teamId}`, orgName.trim());
        localStorage.setItem(`iscore_team_category_${teamId}`, category);
      }
      invalidateLiffApiCache();
      await refreshTeams();
      await loadTeamsData(true);
      toast.success(json.message || "チーム・編成情報を保存しました！");
    } catch {
      toast.error("通信エラーにより保存できませんでした");
    } finally {
      setIsSavingCurrent(false);
    }
  };

  const handleCreateSquad = async () => {
    if (!newSquadName.trim()) {
      toast.error("新しい編成名（例: 2026年度 Bチーム）を入力してください");
      return;
    }
    setIsCreatingSquad(true);
    try {
      const res = await fetch("/api/liff/admin/mgmt/teams/squad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          userId: profile?.userId || undefined,
          userName: profile?.displayName || undefined,
          name: newSquadName.trim(),
          year:
            parseInt(newSquadYear.trim(), 10) || new Date().getFullYear(),
          tier: newSquadTier,
          teamType: newSquadType,
          managerName: newSquadManager.trim() || managerName.trim(),
          homeGround: newSquadGround.trim() || homeGround.trim(),
          copyStaffMembers,
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        squadId?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.success) {
        toast.error(json.error || "編成の作成に失敗しました");
        return;
      }

      setIsAddSquadOpen(false);
      setNewSquadName("");
      invalidateLiffApiCache();
      await refreshTeams();
      await loadTeamsData(true);
      toast.success(json.message || "新しい編成を追加しました！");
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsCreatingSquad(false);
    }
  };

  const handleDeleteSquad = async () => {
    if (!deletingSquad) return;
    setIsDeletingSquad(true);
    try {
      const qs = new URLSearchParams({ teamId });
      if (profile?.userId) qs.set("userId", profile.userId);
      const res = await fetch(
        `/api/liff/admin/mgmt/teams/squad/${encodeURIComponent(
          deletingSquad.id
        )}?${qs.toString()}`,
        { method: "DELETE" }
      );
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.success) {
        toast.error(json.error || "編成の削除に失敗しました");
        return;
      }

      const wasCurrent = deletingSquad.id === teamId;
      const fallbackSquad = data?.siblingSquads.find(
        (s) => s.id !== deletingSquad.id
      );
      setDeletingSquad(null);
      invalidateLiffApiCache();
      await refreshTeams();
      toast.success(json.message || "編成を削除しました");

      if (wasCurrent && fallbackSquad) {
        selectTeam(fallbackSquad.id);
      } else {
        await loadTeamsData(true);
      }
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsDeletingSquad(false);
    }
  };

  const handleSwitchSquad = (targetSquad: AdminSquadItem) => {
    if (targetSquad.id === teamId) return;
    selectTeam(targetSquad.id);
    toast.success(`「${targetSquad.name}」へ切り替えました`);
    navigateToLiffRoot(router, pathname);
  };

  const handleCreateNewClub = async () => {
    if (!newClubOrgName.trim()) {
      toast.error("新しいチーム（クラブ）名を入力してください");
      return;
    }
    setIsCreatingClub(true);
    try {
      const res = await fetch("/api/liff/admin/mgmt/create-club", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: profile?.userId || undefined,
          userName: profile?.displayName || undefined,
          orgName: newClubOrgName.trim(),
          orgShortName: newClubShortName.trim(),
          category: newClubCategory,
          squadName:
            newClubSquadName.trim() ||
            `${new Date().getFullYear()}年度 Aチーム`,
          year: new Date().getFullYear(),
          homeGround: newClubGround.trim(),
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        teamId?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.success) {
        toast.error(json.error || "新チームの立ち上げに失敗しました");
        return;
      }

      setIsCreateClubOpen(false);
      setNewClubOrgName("");
      setNewClubShortName("");
      invalidateLiffApiCache();
      await refreshTeams();
      if (json.teamId) {
        selectTeam(json.teamId);
      }
      toast.success(json.message || "新しいチームを立ち上げました！");
      navigateToLiffRoot(router, pathname);
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsCreatingClub(false);
    }
  };

  const canManage = data ? data.canManage : true;

  return (
    <AdminMgmtShell
      title="チーム・編成管理"
      subtitle="クラブ基本情報・A/B編成の追加・切替"
      icon={
        <span className="w-8 h-8 rounded-xl bg-primary/12 text-primary flex items-center justify-center font-black">
          <Building2 className="w-4 h-4" />
        </span>
      }
      isLoading={isLoading}
      hasData={Boolean(data)}
      canManage={canManage}
      isDemo={data?.isDemo}
      onRefresh={() => void loadTeamsData(true)}
      isRefreshing={isRefreshing}
    >
      {/* ==================== 1. クラブ基本情報 ＆ 現在の編成設定 ==================== */}
      <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="w-4 h-4 text-teal-400 shrink-0" />
            <h2 className="text-sm font-black text-white truncate">
              1. クラブ基本情報 ＆ 現在の編成設定
            </h2>
          </div>
          <Link
            href="/liff/settings/team"
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-[11px] font-black flex items-center gap-1 shrink-0"
          >
            <ImageIcon className="w-3 h-3 text-teal-400" />
            <span>ロゴ・表示設定</span>
          </Link>
        </div>

        <div className="p-4 space-y-4 text-xs">
          {/* クラブ共通情報 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-primary">
                ■ クラブ（団体）共通情報
              </span>
              <span className="text-[10px] font-bold text-muted-foreground">
                全編成で共有されます
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
              <div className="sm:col-span-8 space-y-1">
                <label className="block text-[11px] font-black text-muted-foreground">
                  クラブ・チーム正式名称（必須）
                </label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="例: 青葉ベースボールクラブ"
                  className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                />
              </div>

              <div className="sm:col-span-4 space-y-1">
                <label className="block text-[11px] font-black text-muted-foreground">
                  スコアボード略称（任意）
                </label>
                <input
                  type="text"
                  value={orgShortName}
                  onChange={(e) => setOrgShortName(e.target.value)}
                  placeholder="例: 青葉BBC"
                  maxLength={12}
                  className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
              <div className="sm:col-span-8 space-y-1">
                <label className="block text-[11px] font-black text-muted-foreground">
                  競技カテゴリ
                </label>
                <LiffSelect
                  value={category}
                  onChange={(val) => setCategory(val)}
                  options={CATEGORY_OPTIONS}
                  title="競技カテゴリを選択"
                  accent="primary"
                  size="md"
                  className="w-full bg-background"
                />
              </div>

              <div className="sm:col-span-4 space-y-1">
                <label className="block text-[11px] font-black text-muted-foreground">
                  創部・結成西暦（任意）
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1900}
                  max={2100}
                  value={foundedYearInput}
                  onChange={(e) => setFoundedYearInput(e.target.value)}
                  placeholder="例: 2010"
                  className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-black text-muted-foreground">
                チームスローガン・紹介メモ（任意）
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="例: 全員野球で一戦必勝！礼儀と感謝を大切にするチームです"
                className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
              />
            </div>
          </div>

          {/* 区切り線 */}
          <div className="border-t border-border pt-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-teal-700 dark:text-teal-400">
                ■ 現在選択中の編成（チーム枠）情報
              </span>
              <span className="px-2 py-0.5 rounded bg-muted text-foreground text-[10px] font-black">
                選手 {data?.currentSquad.playerCount ?? 0}名 / 試合{" "}
                {data?.currentSquad.matchCount ?? 0}件
              </span>
            </div>

            <div className="grid grid-cols-12 gap-2.5">
              <div className="col-span-8 space-y-1">
                <label className="block text-[11px] font-black text-muted-foreground">
                  編成名（必須）
                </label>
                <input
                  type="text"
                  value={squadName}
                  onChange={(e) => setSquadName(e.target.value)}
                  placeholder="例: 2026年度 Aチーム"
                  className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                />
              </div>

              <div className="col-span-4 space-y-1">
                <label className="block text-[11px] font-black text-muted-foreground">
                  対象年度
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={2000}
                  max={2100}
                  value={yearInput}
                  onChange={(e) => setYearInput(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="block text-[11px] font-black text-muted-foreground">
                  編成区分（A/B・階層）
                </label>
                <LiffSelect
                  value={tier}
                  onChange={(val) => setTier(val)}
                  options={TIER_OPTIONS}
                  title="編成区分を選択"
                  accent="teal"
                  size="md"
                  className="w-full bg-background"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-black text-muted-foreground">
                  運用種別
                </label>
                <LiffSelect
                  value={teamType}
                  onChange={(val) =>
                    setTeamType(val === "practice" ? "practice" : "regular")
                  }
                  options={TEAM_TYPE_OPTIONS}
                  title="運用種別を選択"
                  accent="teal"
                  size="md"
                  className="w-full bg-background"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="block text-[11px] font-black text-muted-foreground">
                  監督名（スコアブック・公式表記用）
                </label>
                <input
                  type="text"
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                  placeholder="例: 監督の氏名を入力"
                  className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-black text-muted-foreground">
                  主将（キャプテン）
                </label>
                <LiffSelect
                  value={captainId}
                  onChange={(val) => setCaptainId(val)}
                  options={[
                    { value: "__none__", label: "未設定" },
                    ...(data?.players || []).map((p) => ({
                      value: p.id,
                      label: `${
                        p.uniformNumber ? `#${p.uniformNumber} ` : ""
                      }${p.name}`,
                    })),
                  ]}
                  title="主将（キャプテン）を選択"
                  accent="primary"
                  size="md"
                  searchable={(data?.players.length || 0) > 8}
                  className="w-full bg-background"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="flex items-center gap-1 text-[11px] font-black text-muted-foreground">
                <MapPin className="w-3.5 h-3.5 text-teal-600" />
                <span>メイン活動拠点（ホームグラウンド名）</span>
              </label>
              <input
                type="text"
                value={homeGround}
                onChange={(e) => setHomeGround(e.target.value)}
                placeholder="例: 市立第一小学校グラウンド"
                className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
              />
            </div>
          </div>

          <button
            type="button"
            disabled={isSavingCurrent}
            onClick={() => void handleSaveCurrentTeam()}
            className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black flex items-center justify-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50 transition-colors"
          >
            {isSavingCurrent ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            <span>クラブ・現在の編成設定を保存する</span>
          </button>
        </div>
      </section>

      {/* ==================== 2. クラブ内の編成一覧（Aチーム・Bチーム・年度別） ==================== */}
      <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Layers className="w-4 h-4 text-teal-400 shrink-0" />
            <h2 className="text-sm font-black text-white truncate">
              2. クラブ内の編成一覧（{data?.siblingSquads.length || 1}編成）
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              setNewSquadName(`${new Date().getFullYear()}年度 Bチーム`);
              setNewSquadManager(managerName);
              setNewSquadGround(homeGround);
              setIsAddSquadOpen(true);
            }}
            className="px-2.5 py-1 rounded-lg bg-teal-500 text-slate-950 text-[11px] font-black flex items-center gap-1 cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>編成を追加</span>
          </button>
        </div>

        <div className="p-4 space-y-2.5">
          <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
            Aチーム（上級生）・Bチーム（育成・低学年）や次年度の新体制を別編成として追加し、同じクラブ内で切り替えながら運用できます。
          </p>

          <div className="space-y-2">
            {(data?.siblingSquads || []).map((sq) => {
              const canDelete =
                (data?.siblingSquads.length || 0) > 1 && sq.matchCount === 0;
              return (
                <div
                  key={sq.id}
                  className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                    sq.isCurrent
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background"
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {sq.isCurrent && (
                        <span className="px-2 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-black">
                          選択中
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded bg-muted text-foreground border border-border text-[10px] font-black tabular-nums">
                        {sq.year}年度 / {sq.tier || "A"}
                      </span>
                      <h3 className="text-xs sm:text-sm font-black text-foreground truncate">
                        {sq.name}
                      </h3>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-bold text-muted-foreground flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        選手 {sq.playerCount}名 ・ メンバー {sq.memberCount}名
                      </span>
                      <span>試合記録 {sq.matchCount}件</span>
                      {sq.managerName && <span>監督: {sq.managerName}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!sq.isCurrent && (
                      <button
                        type="button"
                        onClick={() => handleSwitchSquad(sq)}
                        className="h-8 px-3 rounded-lg bg-[#0f172a] hover:bg-slate-800 text-white text-xs font-black flex items-center gap-1 cursor-pointer"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5 text-teal-400" />
                        <span>この編成へ切替</span>
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!canDelete}
                      onClick={() => setDeletingSquad(sq)}
                      title={
                        !canDelete
                          ? sq.matchCount > 0
                            ? "試合記録がある編成は削除できません"
                            : "クラブ最後の1編成は削除できません"
                          : "未使用の編成を削除"
                      }
                      className="h-8 w-8 rounded-lg border border-border bg-card hover:bg-rose-600 text-muted-foreground hover:text-white flex items-center justify-center cursor-pointer disabled:opacity-35 disabled:pointer-events-none transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ==================== 3. 新しい別クラブ（別団体）の立ち上げ ==================== */}
      <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <h2 className="text-sm font-black text-white">
              3. 新しいクラブ（別団体）の立ち上げ
            </h2>
          </div>
        </div>
        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs font-bold text-muted-foreground leading-relaxed">
            体験デモからの本番チーム作成や、兼任している別の野球チーム（中学部・選抜チーム等）を新しくゼロから立ち上げる場合はこちらから作成できます。
          </p>
          <button
            type="button"
            onClick={() => setIsCreateClubOpen(true)}
            className="h-10 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black flex items-center justify-center gap-1.5 shrink-0 cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>新規クラブを立ち上げる</span>
          </button>
        </div>
      </section>

      {/* ==================== モーダル1: 編成追加 ==================== */}
      {isAddSquadOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setIsAddSquadOpen(false)}
          >
            <div
              className="w-full sm:max-w-md max-h-[90dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-card text-foreground shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-teal-400" />
                  <h3 className="text-sm font-black text-white">
                    クラブ内に新しい編成を追加
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddSquadOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3 overflow-y-auto text-xs">
                <div className="space-y-1">
                  <label className="block text-[11px] font-black text-foreground">
                    新しい編成名（必須）
                  </label>
                  <input
                    type="text"
                    value={newSquadName}
                    onChange={(e) => setNewSquadName(e.target.value)}
                    placeholder="例: 2026年度 Bチーム（4年生以下）"
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-black text-muted-foreground">
                      対象年度
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={newSquadYear}
                      onChange={(e) => setNewSquadYear(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-black text-muted-foreground">
                      編成区分
                    </label>
                    <LiffSelect
                      value={newSquadTier}
                      onChange={(val) => setNewSquadTier(val)}
                      options={TIER_OPTIONS}
                      title="編成区分を選択"
                      accent="teal"
                      size="md"
                      className="w-full bg-background"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-black text-muted-foreground">
                    運用種別
                  </label>
                  <LiffSelect
                    value={newSquadType}
                    onChange={(val) =>
                      setNewSquadType(
                        val === "practice" ? "practice" : "regular"
                      )
                    }
                    options={TEAM_TYPE_OPTIONS}
                    title="運用種別を選択"
                    accent="teal"
                    size="md"
                    className="w-full bg-background"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-black text-muted-foreground">
                    この編成の監督名（任意）
                  </label>
                  <input
                    type="text"
                    value={newSquadManager}
                    onChange={(e) => setNewSquadManager(e.target.value)}
                    placeholder="例: Bチーム監督名"
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                  />
                </div>

                <label className="p-3 rounded-xl border border-border bg-muted/60 flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={copyStaffMembers}
                    onChange={(e) => setCopyStaffMembers(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-teal-600"
                  />
                  <span className="space-y-0.5">
                    <span className="block text-xs font-black text-foreground">
                      現在の監督・IT管理者・コーチ陣を自動引き継ぎ
                    </span>
                    <span className="block text-[11px] font-bold text-muted-foreground">
                      チェックを入れると、指導者スタッフが再招待不要ですぐ新編成を閲覧・管理できます
                    </span>
                  </span>
                </label>
              </div>

              <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAddSquadOpen(false)}
                  className="h-10 px-4 rounded-xl border border-border bg-muted text-foreground text-xs font-black cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={isCreatingSquad}
                  onClick={() => void handleCreateSquad()}
                  className="h-10 px-5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isCreatingSquad ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  <span>この内容で編成を作成</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ==================== モーダル2: 編成削除確認 ==================== */}
      {deletingSquad &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setDeletingSquad(null)}
          >
            <div
              className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-border bg-card text-foreground shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-rose-500 flex items-center justify-between">
                <h3 className="text-sm font-black text-white">編成の削除確認</h3>
                <button
                  type="button"
                  onClick={() => setDeletingSquad(null)}
                  className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 space-y-2 text-xs">
                <p className="font-black text-foreground">
                  編成「{deletingSquad.name}」を削除しますか？
                </p>
                <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
                  この編成に登録されている予定・名簿枠が削除されます。他の編成のデータには影響しません。
                </p>
              </div>
              <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeletingSquad(null)}
                  className="h-10 px-4 rounded-xl border border-border bg-muted text-foreground text-xs font-black cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={isDeletingSquad}
                  onClick={() => void handleDeleteSquad()}
                  className="h-10 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isDeletingSquad ? (
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

      {/* ==================== モーダル3: 新規クラブ立ち上げ ==================== */}
      {isCreateClubOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setIsCreateClubOpen(false)}
          >
            <div
              className="w-full sm:max-w-md max-h-[90dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-card text-foreground shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-amber-500 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-black text-white">
                    新しいクラブ（チーム）を立ち上げる
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateClubOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3 overflow-y-auto text-xs">
                {!isLoggedIn ? (
                  <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/12 space-y-3 text-center">
                    <p className="text-xs font-black text-foreground">
                      新しいチームの作成にはLINEログインが必要です
                    </p>
                    <p className="text-[11px] font-bold text-muted-foreground">
                      作成したチームの初期オーナー（代表・IT管理者）にあなたのLINEアカウントを登録します。
                    </p>
                    <button
                      type="button"
                      onClick={() => login()}
                      className="h-10 px-5 rounded-xl bg-[#06C755] text-white text-xs font-black cursor-pointer"
                    >
                      LINEでログインする
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1">
                      <label className="block text-[11px] font-black text-foreground">
                        チーム・クラブ名（必須）
                      </label>
                      <input
                        type="text"
                        value={newClubOrgName}
                        onChange={(e) => setNewClubOrgName(e.target.value)}
                        placeholder="例: 〇〇ジュニアベースボール"
                        className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] font-black text-muted-foreground">
                        スコアボード略称（任意）
                      </label>
                      <input
                        type="text"
                        value={newClubShortName}
                        onChange={(e) => setNewClubShortName(e.target.value)}
                        placeholder="例: 〇〇JBB"
                        maxLength={12}
                        className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] font-black text-muted-foreground">
                        競技カテゴリ
                      </label>
                      <LiffSelect
                        value={newClubCategory}
                        onChange={(val) => setNewClubCategory(val)}
                        options={CATEGORY_OPTIONS}
                        title="競技カテゴリを選択"
                        accent="amber"
                        size="md"
                        className="w-full bg-background"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] font-black text-muted-foreground">
                        初期編成名
                      </label>
                      <input
                        type="text"
                        value={newClubSquadName}
                        onChange={(e) => setNewClubSquadName(e.target.value)}
                        placeholder="例: 2026年度 Aチーム"
                        className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] font-black text-muted-foreground">
                        主な活動グラウンド（任意）
                      </label>
                      <input
                        type="text"
                        value={newClubGround}
                        onChange={(e) => setNewClubGround(e.target.value)}
                        placeholder="例: 市民総合運動場"
                        className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs font-bold"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsCreateClubOpen(false)}
                  className="h-10 px-4 rounded-xl border border-border bg-muted text-foreground text-xs font-black cursor-pointer"
                >
                  閉じる
                </button>
                {isLoggedIn && (
                  <button
                    type="button"
                    disabled={isCreatingClub}
                    onClick={() => void handleCreateNewClub()}
                    className="h-10 px-5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isCreatingClub ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    <span>チームを作成する</span>
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </AdminMgmtShell>
  );
}
