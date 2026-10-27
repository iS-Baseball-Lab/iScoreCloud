// filepath: src/app/liff/profile/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  UserCircle,
  Save,
  Users,
  Car,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  Phone,
  Search,
  ShieldCheck,
  Loader2,
  UserPlus,
  Tag,
  Package,
} from "lucide-react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { useLiff } from "@/components/liff/LiffProvider";
import { JoinTeamModal } from "@/components/liff/JoinTeamModal";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";

type MemberTypeId = "parent" | "staff" | "player" | "other";
type DefaultCarStatus = "can_drive" | "need_ride" | "not_needed";
type CarTypeId = "normal" | "cargo";

interface ProfileMemberInfo {
  id: string;
  name: string;
  nameKana: string;
  phone: string;
  email: string;
  memberType: string;
  role: string;
  subLabel: string;
  status: string;
}

interface ProfileGroupInfo {
  groupId: string;
  groupName: string;
  role: string | null;
}

interface RosterPlayerItem {
  id: string;
  name: string;
  nameKana?: string | null;
  uniformNumber: string;
  primaryPosition?: string | null;
}

interface LinkedChildItem {
  relationId: string;
  childId: string;
  childName: string;
  uniformNumber: string;
}

interface RegisteredCarItem {
  id: string;
  name: string;
  color: string | null;
  numberPlate: string | null;
  capacity: number;
  fuelEfficiency: number;
  carType: "normal" | "cargo" | "bus";
}

interface ProfileApiResponse {
  success: boolean;
  isDemo?: boolean;
  error?: string;
  member: ProfileMemberInfo | null;
  groups: ProfileGroupInfo[];
  players: RosterPlayerItem[];
  myChildren: LinkedChildItem[];
  myCars: RegisteredCarItem[];
}

const MEMBER_TYPE_OPTIONS: ReadonlyArray<{ id: MemberTypeId; label: string }> = [
  { id: "parent", label: "保護者" },
  { id: "staff", label: "指導者・スタッフ" },
  { id: "player", label: "選手" },
  { id: "other", label: "役員・他" },
];

const PRESET_SUB_LABELS: readonly string[] = [
  "1班",
  "2班",
  "3班",
  "4班",
  "配車",
  "審判",
  "用具",
  "救急",
];

const ROLE_BADGE_LABELS: Record<string, string> = {
  admin: "IT管理者",
  SYSTEM_ADMIN: "システム管理者",
  manager: "監督・代表",
  MANAGER: "監督・代表",
  coach: "コーチ",
  COACH: "コーチ",
  scorer: "スコアラー",
  SCORER: "スコアラー",
  staff: "スタッフ",
  parent: "保護者",
  player: "選手",
  PLAYER: "メンバー",
};

function formatUniformBadge(num?: string | null): string {
  if (!num) return "#-";
  const clean = num.trim();
  if (!clean) return "#-";
  return clean.startsWith("#") ? clean : `#${clean}`;
}

export default function LiffProfilePage() {
  const {
    profile,
    isLoggedIn,
    login,
    teams,
    currentTeam,
    selectTeam,
    isDemo: providerIsDemo,
    refreshTeams,
  } = useLiff();

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);

  // 基本プロフィールステート
  const [memberId, setMemberId] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [nameKana, setNameKana] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [memberType, setMemberType] = useState<MemberTypeId>("parent");
  const [systemRole, setSystemRole] = useState<string>("parent");
  const [subLabel, setSubLabel] = useState<string>("");
  const [groups, setGroups] = useState<ProfileGroupInfo[]>([]);
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);

  // 親子紐付けステート
  const [rosterPlayers, setRosterPlayers] = useState<RosterPlayerItem[]>([]);
  const [myChildren, setMyChildren] = useState<LinkedChildItem[]>([]);
  const [isChildPickerOpen, setIsChildPickerOpen] = useState<boolean>(false);
  const [playerSearchQuery, setPlayerSearchQuery] = useState<string>("");
  const [isUpdatingChildId, setIsUpdatingChildId] = useState<string | null>(null);

  // 配車初期値 & マイカーステート
  const [defaultCarStatus, setDefaultCarStatus] = useState<DefaultCarStatus>("need_ride");
  const [myCars, setMyCars] = useState<RegisteredCarItem[]>([]);
  const [isCarFormOpen, setIsCarFormOpen] = useState<boolean>(false);
  const [editingCarId, setEditingCarId] = useState<string | null>(null);
  const [carName, setCarName] = useState<string>("");
  const [carCapacity, setCarCapacity] = useState<number>(4);
  const [carType, setCarType] = useState<CarTypeId>("normal");
  const [carPlate, setCarPlate] = useState<string>("");
  const [carColor, setCarColor] = useState<string>("");
  const [isSavingCar, setIsSavingCar] = useState<boolean>(false);
  const [deletingCarId, setDeletingCarId] = useState<string | null>(null);

  // チーム参加モーダル
  const [isJoinModalOpen, setIsJoinModalOpen] = useState<boolean>(false);

  const activeTeamId = currentTeam?.id || "demo-team";

  // デフォルト配車希望の読み込み
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedCar = localStorage.getItem("iscore_setting_default_car");
    if (savedCar === "can_drive" || savedCar === "need_ride" || savedCar === "not_needed") {
      setDefaultCarStatus(savedCar);
    }
  }, []);

  // プロフィール・親子・車両データの一括取得
  const loadProfileData = useCallback(async () => {
    setIsLoading(true);
    try {
      const tid =
        currentTeam?.id ||
        (typeof window !== "undefined" ? localStorage.getItem("iscore_selectedTeamId") : "") ||
        "demo-team";
      const uid =
        profile?.userId ||
        (typeof window !== "undefined" ? localStorage.getItem("iscore_user_id") : "") ||
        "";
      const uName =
        profile?.displayName ||
        (typeof window !== "undefined" ? localStorage.getItem("iscore_user_name") : "") ||
        "";
      const cachedMemberId =
        typeof window !== "undefined" ? localStorage.getItem(`iscore_member_id_${tid}`) || "" : "";

      const params = new URLSearchParams();
      params.set("teamId", tid);
      if (cachedMemberId) params.set("memberId", cachedMemberId);
      if (uid) params.set("userId", uid);
      if (uName) params.set("userName", uName);

      const res = await fetch(`/api/liff/profile?${params.toString()}`);
      if (!res.ok) {
        throw new Error("プロフィールの読み込みに失敗しました");
      }

      const data = (await res.json()) as ProfileApiResponse;
      if (!data.success) {
        throw new Error(data.error || "プロフィールの取得に失敗しました");
      }

      setIsDemoMode(Boolean(data.isDemo));
      setRosterPlayers(data.players || []);
      setGroups(data.groups || []);

      if (data.member) {
        setMemberId(data.member.id);
        setDisplayName(data.member.name || uName || "");
        setNameKana(data.member.nameKana || "");
        setPhone(data.member.phone || "");
        const mType = data.member.memberType as MemberTypeId;
        setMemberType(
          mType === "parent" || mType === "staff" || mType === "player" || mType === "other"
            ? mType
            : "parent"
        );
        setSystemRole(data.member.role || "parent");
        setSubLabel(data.member.subLabel || "");

        if (typeof window !== "undefined" && !data.isDemo && data.member.id) {
          localStorage.setItem(`iscore_member_id_${tid}`, data.member.id);
        }
      } else {
        setMemberId("");
        setDisplayName(uName || "");
        setNameKana("");
        setPhone("");
        setMemberType("parent");
        setSystemRole("parent");
        setSubLabel("");
      }

      setMyChildren(data.myChildren || []);
      setMyCars(data.myCars || []);
    } catch (err: unknown) {
      console.error("Failed to fetch profile:", err);
      toast.error("プロフィール情報の取得に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, [currentTeam?.id, profile?.userId, profile?.displayName]);

  useEffect(() => {
    loadProfileData();
  }, [loadProfileData]);

  // ─── 基本プロフィール保存 ─────────────────────────────
  const handleSaveProfile = async () => {
    const trimmed = displayName.trim();
    if (!trimmed) {
      toast.error("チーム内の表示名を入力してください");
      return;
    }

    setIsSavingProfile(true);
    try {
      const uid =
        profile?.userId ||
        (typeof window !== "undefined" ? localStorage.getItem("iscore_user_id") : "") ||
        "";
      const uName =
        profile?.displayName ||
        (typeof window !== "undefined" ? localStorage.getItem("iscore_user_name") : "") ||
        trimmed;

      const res = await fetch("/api/liff/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: activeTeamId,
          memberId: memberId || undefined,
          userId: uid || undefined,
          userName: uName,
          name: trimmed,
          nameKana: nameKana.trim(),
          phone: phone.trim(),
          memberType,
          subLabel: subLabel.trim(),
        }),
      });

      const json = (await res.json()) as {
        success: boolean;
        memberId?: string;
        message?: string;
        error?: string;
      };

      if (!res.ok || !json.success) {
        throw new Error(json.error || "保存に失敗しました");
      }

      if (json.memberId) {
        setMemberId(json.memberId);
        if (typeof window !== "undefined" && activeTeamId !== "demo-team") {
          localStorage.setItem(`iscore_member_id_${activeTeamId}`, json.memberId);
        }
      }

      if (typeof window !== "undefined") {
        localStorage.setItem("iscore_setting_user_role", memberType);
      }

      toast.success(json.message || "プロフィールを保存しました");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "プロフィールの保存に失敗しました");
    } finally {
      setIsSavingProfile(false);
    }
  };

  // ─── お子様（選手）の紐付け追加 ────────────────────────
  const handleLinkChild = async (player: RosterPlayerItem) => {
    if (myChildren.some((c) => c.childId === player.id)) {
      toast.info(`${player.name} 選手はすでに紐付けられています`);
      return;
    }

    setIsUpdatingChildId(player.id);
    try {
      const uid =
        profile?.userId ||
        (typeof window !== "undefined" ? localStorage.getItem("iscore_user_id") : "") ||
        "";
      const uName =
        displayName.trim() ||
        profile?.displayName ||
        (typeof window !== "undefined" ? localStorage.getItem("iscore_user_name") : "") ||
        "保護者";

      const res = await fetch("/api/liff/profile/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: activeTeamId,
          memberId: memberId || undefined,
          userId: uid || undefined,
          userName: uName,
          childId: player.id,
        }),
      });

      const json = (await res.json()) as {
        success: boolean;
        relationId?: string;
        memberId?: string;
        error?: string;
      };

      if (!res.ok || !json.success || !json.relationId) {
        throw new Error(json.error || "紐付けに失敗しました");
      }

      if (json.memberId) {
        setMemberId(json.memberId);
        if (typeof window !== "undefined" && activeTeamId !== "demo-team") {
          localStorage.setItem(`iscore_member_id_${activeTeamId}`, json.memberId);
        }
      }

      setMyChildren((prev) => [
        ...prev,
        {
          relationId: json.relationId as string,
          childId: player.id,
          childName: player.name,
          uniformNumber: player.uniformNumber,
        },
      ]);
      toast.success(`${player.name} 選手をお子様として紐付けました`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "お子様の紐付けに失敗しました");
    } finally {
      setIsUpdatingChildId(null);
    }
  };

  // ─── お子様（選手）の紐付け解除 ────────────────────────
  const handleUnlinkChild = async (item: LinkedChildItem) => {
    setIsUpdatingChildId(item.childId);
    try {
      const res = await fetch(`/api/liff/profile/family/${encodeURIComponent(item.relationId)}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "紐付け解除に失敗しました");
      }

      setMyChildren((prev) => prev.filter((c) => c.relationId !== item.relationId));
      toast.success(`${item.childName} 選手の紐付けを解除しました`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "紐付け解除に失敗しました");
    } finally {
      setIsUpdatingChildId(null);
    }
  };

  // ─── 配車希望デフォルト変更 ────────────────────────────
  const handleSelectDefaultCarStatus = (status: DefaultCarStatus) => {
    setDefaultCarStatus(status);
    if (typeof window !== "undefined") {
      localStorage.setItem("iscore_setting_default_car", status);
    }
    toast.success("デフォルト配車希望を更新しました");
  };

  // ─── マイカー追加・編集フォーム制御 ────────────────────
  const openNewCarForm = () => {
    setEditingCarId(null);
    setCarName("");
    setCarCapacity(4);
    setCarType("normal");
    setCarPlate("");
    setCarColor("");
    setIsCarFormOpen(true);
  };

  const openEditCarForm = (car: RegisteredCarItem) => {
    setEditingCarId(car.id);
    setCarName(car.name);
    setCarCapacity(car.capacity || 4);
    setCarType(car.carType === "cargo" ? "cargo" : "normal");
    setCarPlate(car.numberPlate || "");
    setCarColor(car.color || "");
    setIsCarFormOpen(true);
  };

  const handleSaveCar = async () => {
    const trimmedCarName = carName.trim();
    if (!trimmedCarName) {
      toast.error("車種名を入力してください（例: セレナ）");
      return;
    }

    setIsSavingCar(true);
    try {
      const uid =
        profile?.userId ||
        (typeof window !== "undefined" ? localStorage.getItem("iscore_user_id") : "") ||
        "";
      const uName =
        displayName.trim() ||
        profile?.displayName ||
        (typeof window !== "undefined" ? localStorage.getItem("iscore_user_name") : "") ||
        "メンバー";

      const res = await fetch("/api/liff/profile/cars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingCarId || undefined,
          teamId: activeTeamId,
          memberId: memberId || undefined,
          userId: uid || undefined,
          userName: uName,
          name: trimmedCarName,
          capacity: carCapacity,
          carType,
          numberPlate: carPlate.trim(),
          color: carColor.trim(),
        }),
      });

      const json = (await res.json()) as {
        success: boolean;
        memberId?: string;
        car?: RegisteredCarItem;
        error?: string;
      };

      if (!res.ok || !json.success || !json.car) {
        throw new Error(json.error || "マイカーの保存に失敗しました");
      }

      if (json.memberId) {
        setMemberId(json.memberId);
        if (typeof window !== "undefined" && activeTeamId !== "demo-team") {
          localStorage.setItem(`iscore_member_id_${activeTeamId}`, json.memberId);
        }
      }

      const savedCar = json.car;
      setMyCars((prev) => {
        const exists = prev.some((c) => c.id === savedCar.id);
        if (exists) {
          return prev.map((c) => (c.id === savedCar.id ? savedCar : c));
        }
        return [...prev, savedCar];
      });

      setIsCarFormOpen(false);
      setEditingCarId(null);
      toast.success(editingCarId ? "マイカー情報を更新しました" : "マイカーを登録しました");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "マイカーの保存に失敗しました");
    } finally {
      setIsSavingCar(false);
    }
  };

  const handleDeleteCar = async (car: RegisteredCarItem) => {
    setDeletingCarId(car.id);
    try {
      const res = await fetch(`/api/liff/profile/cars/${encodeURIComponent(car.id)}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "マイカーの削除に失敗しました");
      }

      setMyCars((prev) => prev.filter((c) => c.id !== car.id));
      toast.success(`「${car.name}」の登録を削除しました`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "マイカーの削除に失敗しました");
    } finally {
      setDeletingCarId(null);
    }
  };

  // 選手検索フィルタ
  const filteredPlayers = useMemo(() => {
    const q = playerSearchQuery.trim().toLowerCase();
    if (!q) return rosterPlayers;
    return rosterPlayers.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.nameKana || "").toLowerCase().includes(q) ||
        p.uniformNumber.toLowerCase().includes(q)
    );
  }, [rosterPlayers, playerSearchQuery]);

  const linkedChildIds = useMemo(() => new Set(myChildren.map((c) => c.childId)), [myChildren]);

  const lineDisplayName = profile?.displayName || displayName || "メンバー";
  const avatarInitial = lineDisplayName.slice(0, 1).toUpperCase();
  const roleLabel = ROLE_BADGE_LABELS[systemRole] || "メンバー";

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="p-4 space-y-4 max-w-lg mx-auto w-full">
        <LiffPageHeader
          title="プロフィール"
          subtitle="表示名・お子様紐付け・マイカー登録"
          icon={
            <span className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black">
              <UserCircle className="w-4.5 h-4.5" />
            </span>
          }
          showBack
        />

        {isLoading ? (
          <div className="rounded-3xl bg-card border border-border/80 p-10 flex flex-col items-center justify-center gap-2.5 shadow-sm">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-xs font-bold text-muted-foreground">プロフィール情報を読み込み中...</p>
          </div>
        ) : (
          <>
            {/* ━━━ セクション 1: 🪪 アカウント & チーム内基本情報 ━━━ */}
            <section className="rounded-3xl bg-card border-2 border-primary/20 p-4 space-y-4 shadow-sm">
              {/* LINEアカウント状態ヘッダー */}
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-muted/60 border border-border/70">
                <Avatar className="h-12 w-12 border-2 border-primary/30 shrink-0">
                  {profile?.pictureUrl && (
                    <AvatarImage src={profile.pictureUrl} alt={lineDisplayName} />
                  )}
                  <AvatarFallback className="bg-primary text-primary-foreground font-black text-base">
                    {avatarInitial}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-black text-foreground truncate">
                      {profile?.displayName || displayName || "ゲストユーザー"}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-black">
                      {roleLabel}
                    </span>
                    {(isDemoMode || providerIsDemo) && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-black">
                        体験デモ
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isLoggedIn ? "bg-emerald-500" : "bg-amber-500"
                      }`}
                    />
                    <span className="text-[11px] font-bold text-muted-foreground truncate">
                      {isLoggedIn
                        ? `LINE連携中 ・ ${currentTeam?.name || "チーム未選択"}`
                        : "LINE未連携（ブラウザ表示）"}
                    </span>
                  </div>

                  {groups.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap pt-0.5">
                      {groups.map((g) => (
                        <span
                          key={g.groupId}
                          className="px-2 py-0.5 rounded-md bg-card border border-border text-[10px] font-bold text-foreground"
                        >
                          {g.groupName}
                          {g.role ? ` (${g.role})` : ""}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {!isLoggedIn && (
                  <button
                    type="button"
                    onClick={login}
                    className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-black shrink-0 transition-all shadow-xs"
                  >
                    LINE連携
                  </button>
                )}
              </div>

              {/* チーム内表示名 */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-foreground block">
                  チーム内の表示名 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="例: 山田 太郎 / 山田（翔太父）"
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-background border border-border text-sm font-bold text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                />
                <p className="text-[10px] font-bold text-muted-foreground">
                  出欠一覧表や配車表でチーム全員に表示される名前です。LINE名がニックネームの方も分かりやすい表記に変更できます。
                </p>
              </div>

              {/* フリガナ & 電話番号 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-black text-foreground block">フリガナ</label>
                  <input
                    type="text"
                    value={nameKana}
                    onChange={(e) => setNameKana(e.target.value)}
                    placeholder="例: ヤマダ タロウ"
                    className="w-full px-3 py-2 rounded-2xl bg-background border border-border text-xs font-bold text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-black text-foreground flex items-center gap-1">
                    <Phone className="w-3 h-3 text-primary" />
                    <span>緊急連絡先（電話番号）</span>
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="例: 090-1234-5678"
                    className="w-full px-3 py-2 rounded-2xl bg-background border border-border text-xs font-bold text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>

              {/* チームでの立場 */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-foreground block">チームでの主な立場</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {MEMBER_TYPE_OPTIONS.map((opt) => {
                    const active = memberType === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setMemberType(opt.id)}
                        className={`py-2 px-2 rounded-2xl text-xs transition-all active:scale-95 border ${
                          active
                            ? "bg-primary text-primary-foreground border-primary shadow-xs font-black"
                            : "bg-muted/50 border-border/70 text-muted-foreground hover:text-foreground font-bold"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 担当班・役割タグ */}
              <div className="space-y-2">
                <label className="text-xs font-black text-foreground flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-primary" />
                  <span>当番班・担当タグ（任意）</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_SUB_LABELS.map((preset) => {
                    const active = subLabel.trim() === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setSubLabel(active ? "" : preset)}
                        className={`px-2.5 py-1 rounded-xl text-[11px] transition-all active:scale-95 border ${
                          active
                            ? "bg-primary text-primary-foreground border-primary font-black"
                            : "bg-muted/50 border-border/70 text-muted-foreground hover:text-foreground font-bold"
                        }`}
                      >
                        {preset}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="text"
                  value={subLabel}
                  onChange={(e) => setSubLabel(e.target.value)}
                  placeholder="自由入力も可（例: 2班・会計 / 審判部）"
                  className="w-full px-3 py-2 rounded-2xl bg-background border border-border text-xs font-bold text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {/* 基本情報保存ボタン */}
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={isSavingProfile}
                className="w-full py-3 px-4 rounded-2xl bg-primary hover:brightness-105 active:scale-[0.99] text-primary-foreground text-xs sm:text-sm font-black shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {isSavingProfile ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>基本プロフィールを保存</span>
              </button>
            </section>

            {/* ━━━ セクション 2: 👦 お子様（選手）との親子紐付け ━━━ */}
            {memberType !== "player" && (
              <section className="rounded-3xl bg-card border-2 border-primary/20 p-4 space-y-3.5 shadow-sm">
                <div className="flex items-center justify-between pb-2 border-b border-border/60">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    <h2 className="text-sm font-black text-foreground">お子様（選手）の紐付け</h2>
                  </div>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300">
                    出欠・配車に自動連動
                  </span>
                </div>

                <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
                  チームの選手名簿からお子様を紐付けると、活動予定での親子出欠回答や配車表の親子同乗ルール判定にそのまま反映されます（兄弟複数登録可）。
                </p>

                {/* 紐付け済みのお子様リスト */}
                {myChildren.length === 0 ? (
                  <div className="p-3.5 rounded-2xl bg-muted/50 border border-dashed border-border text-center">
                    <p className="text-xs font-bold text-muted-foreground">
                      まだお子様（選手）が紐付けられていません
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {myChildren.map((child) => (
                      <div
                        key={child.relationId}
                        className="flex items-center justify-between p-3 rounded-2xl bg-amber-500/8 dark:bg-amber-500/12 border border-amber-500/30"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="min-w-[40px] h-7 px-2 rounded-xl bg-amber-500 text-white text-xs font-black flex items-center justify-center shrink-0">
                            {formatUniformBadge(child.uniformNumber)}
                          </span>
                          <span className="text-sm font-black text-foreground truncate">
                            {child.childName}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleUnlinkChild(child)}
                          disabled={isUpdatingChildId === child.childId}
                          className="py-1.5 px-2.5 rounded-xl bg-card hover:bg-rose-500/10 text-muted-foreground hover:text-rose-600 border border-border text-[11px] font-bold transition-all active:scale-95 flex items-center gap-1 shrink-0"
                        >
                          {isUpdatingChildId === child.childId ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <X className="w-3.5 h-3.5" />
                          )}
                          <span>解除</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* 選手名簿ピッカー開閉ボタン */}
                <button
                  type="button"
                  onClick={() => setIsChildPickerOpen((prev) => !prev)}
                  className="w-full py-2.5 px-3 rounded-2xl bg-muted hover:bg-muted/80 border border-border text-xs font-black text-foreground transition-all active:scale-98 flex items-center justify-center gap-1.5"
                >
                  {isChildPickerOpen ? (
                    <>
                      <X className="w-4 h-4" />
                      <span>選手一覧を閉じる</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 text-primary" />
                      <span>選手名簿からお子様を追加</span>
                    </>
                  )}
                </button>

                {/* インライン選手名簿ピッカー */}
                {isChildPickerOpen && (
                  <div className="p-3 rounded-2xl bg-background border border-border space-y-2.5">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={playerSearchQuery}
                        onChange={(e) => setPlayerSearchQuery(e.target.value)}
                        placeholder="名前・背番号で選手を検索..."
                        className="w-full pl-8 pr-3 py-2 rounded-xl bg-card border border-border text-xs font-bold text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                      />
                    </div>

                    {filteredPlayers.length === 0 ? (
                      <p className="text-xs font-bold text-muted-foreground text-center py-4">
                        該当する選手が見つかりません
                      </p>
                    ) : (
                      <div className="max-h-56 overflow-y-auto space-y-1.5 pr-0.5">
                        {filteredPlayers.map((player) => {
                          const isLinked = linkedChildIds.has(player.id);
                          const isBusy = isUpdatingChildId === player.id;
                          return (
                            <button
                              key={player.id}
                              type="button"
                              disabled={isLinked || isBusy}
                              onClick={() => handleLinkChild(player)}
                              className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all ${
                                isLinked
                                  ? "bg-primary/10 border-primary/30 text-primary cursor-default"
                                  : "bg-card hover:bg-muted/70 border-border/80 text-foreground active:scale-[0.99]"
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="min-w-[36px] px-1.5 py-0.5 rounded-lg bg-muted text-foreground text-[11px] font-black text-center shrink-0">
                                  {formatUniformBadge(player.uniformNumber)}
                                </span>
                                <span className="text-xs font-black truncate">{player.name}</span>
                                {player.primaryPosition && (
                                  <span className="text-[10px] font-bold text-muted-foreground shrink-0">
                                    {player.primaryPosition}
                                  </span>
                                )}
                              </div>

                              <span className="text-[11px] font-black shrink-0 flex items-center gap-1">
                                {isBusy ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                                ) : isLinked ? (
                                  <>
                                    <Check className="w-3.5 h-3.5" />
                                    <span>紐付け済</span>
                                  </>
                                ) : (
                                  <span className="text-primary">＋ 追加</span>
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* ━━━ セクション 3: 🚗 配車初期値 & マイカー登録 ━━━ */}
            <section className="rounded-3xl bg-card border-2 border-primary/20 p-4 space-y-4 shadow-sm">
              <div className="flex items-center gap-2 pb-2 border-b border-border/60">
                <Car className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-black text-foreground">配車希望 & マイカー登録</h2>
              </div>

              {/* デフォルト配車希望 */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-foreground block">
                  遠征・試合時のデフォルト配車希望
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: "can_drive", label: "🚗 車出し可" },
                      { id: "need_ride", label: "🙋 送迎希望" },
                      { id: "not_needed", label: "🚶 自走・不要" },
                    ] as const
                  ).map((carOpt) => {
                    const active = defaultCarStatus === carOpt.id;
                    return (
                      <button
                        key={carOpt.id}
                        type="button"
                        onClick={() => handleSelectDefaultCarStatus(carOpt.id)}
                        className={`py-2.5 px-1 rounded-2xl text-xs transition-all active:scale-95 border ${
                          active
                            ? "bg-primary text-primary-foreground border-primary shadow-xs font-black"
                            : "bg-muted/50 border-border/70 text-muted-foreground hover:text-foreground font-bold"
                        }`}
                      >
                        {carOpt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* マイカー登録一覧 */}
              <div className="space-y-2.5 pt-1 border-t border-border/50">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black text-foreground block">
                      登録マイカー（配車表連動）
                    </span>
                    <span className="text-[10px] font-bold text-muted-foreground block">
                      車出し可能な車両を登録しておくと配車作成がスムーズになります
                    </span>
                  </div>
                </div>

                {myCars.length === 0 ? (
                  <div className="p-3.5 rounded-2xl bg-muted/50 border border-dashed border-border text-center">
                    <p className="text-xs font-bold text-muted-foreground">
                      登録されている車両はありません
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {myCars.map((car) => (
                      <div
                        key={car.id}
                        className="p-3 rounded-2xl bg-background border border-border/90 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs sm:text-sm font-black text-foreground truncate">
                              {car.name}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                car.carType === "cargo"
                                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                  : "bg-blue-500/15 text-blue-700 dark:text-blue-300"
                              }`}
                            >
                              {car.carType === "cargo" ? "📦 道具車" : "🚙 普通車"}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-muted text-foreground text-[10px] font-black">
                              定員 {car.capacity}名
                            </span>
                          </div>

                          {(car.color || car.numberPlate) && (
                            <p className="text-[11px] font-bold text-muted-foreground">
                              {[car.color, car.numberPlate ? `ナンバー: ${car.numberPlate}` : null]
                                .filter(Boolean)
                                .join(" ・ ")}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditCarForm(car)}
                            className="p-2 rounded-xl bg-card hover:bg-muted border border-border text-muted-foreground hover:text-foreground transition-all active:scale-95"
                            title="車両を編集"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCar(car)}
                            disabled={deletingCarId === car.id}
                            className="p-2 rounded-xl bg-card hover:bg-rose-500/10 border border-border text-muted-foreground hover:text-rose-600 transition-all active:scale-95"
                            title="車両を削除"
                          >
                            {deletingCarId === car.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* マイカー追加・編集フォーム */}
                {isCarFormOpen ? (
                  <div className="p-3.5 rounded-2xl bg-background border-2 border-primary/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-foreground">
                        {editingCarId ? "マイカー情報を編集" : "マイカーを新規登録"}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCarFormOpen(false);
                          setEditingCarId(null);
                        }}
                        className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-black text-foreground block">
                        車種名 <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={carName}
                        onChange={(e) => setCarName(e.target.value)}
                        placeholder="例: セレナ / アルファード / フリード"
                        className="w-full px-3 py-2 rounded-xl bg-card border border-border text-xs font-bold text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label className="text-[11px] font-black text-foreground block">
                          乗車定員（運転手除く）
                        </label>
                        <select
                          value={carCapacity}
                          onChange={(e) => setCarCapacity(Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-xl bg-card border border-border text-xs font-bold text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                            <option key={n} value={n}>
                              {n}名（運転手除く）
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-black text-foreground block">車両区分</label>
                        <div className="grid grid-cols-2 gap-1">
                          <button
                            type="button"
                            onClick={() => setCarType("normal")}
                            className={`py-2 px-1.5 rounded-xl text-[11px] border transition-all ${
                              carType === "normal"
                                ? "bg-primary text-primary-foreground border-primary font-black"
                                : "bg-card border-border text-muted-foreground font-bold"
                            }`}
                          >
                            普通車
                          </button>
                          <button
                            type="button"
                            onClick={() => setCarType("cargo")}
                            className={`py-2 px-1.5 rounded-xl text-[11px] border transition-all flex items-center justify-center gap-0.5 ${
                              carType === "cargo"
                                ? "bg-amber-600 text-white border-amber-600 font-black"
                                : "bg-card border-border text-muted-foreground font-bold"
                            }`}
                          >
                            <Package className="w-3 h-3" />
                            <span>道具車</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label className="text-[11px] font-black text-foreground block">
                          車体カラー（任意）
                        </label>
                        <input
                          type="text"
                          value={carColor}
                          onChange={(e) => setCarColor(e.target.value)}
                          placeholder="例: ホワイト / 黒"
                          className="w-full px-3 py-2 rounded-xl bg-card border border-border text-xs font-bold text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-black text-foreground block">
                          ナンバー下4桁（任意）
                        </label>
                        <input
                          type="text"
                          value={carPlate}
                          onChange={(e) => setCarPlate(e.target.value)}
                          placeholder="例: 12-34"
                          className="w-full px-3 py-2 rounded-xl bg-card border border-border text-xs font-bold text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsCarFormOpen(false);
                          setEditingCarId(null);
                        }}
                        className="flex-1 py-2.5 rounded-xl bg-muted hover:bg-muted/80 text-xs font-bold text-foreground border border-border transition-all"
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveCar}
                        disabled={isSavingCar}
                        className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black shadow-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-60"
                      >
                        {isSavingCar ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        <span>{editingCarId ? "更新する" : "登録する"}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={openNewCarForm}
                    className="w-full py-2.5 px-3 rounded-2xl bg-muted hover:bg-muted/80 border border-border text-xs font-black text-foreground transition-all active:scale-98 flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-4 h-4 text-primary" />
                    <span>マイカーを追加登録</span>
                  </button>
                )}
              </div>
            </section>

            {/* ━━━ セクション 4: 🧢 所属チーム切替 & チーム参加 ━━━ */}
            <section className="rounded-3xl bg-card border-2 border-primary/20 p-4 space-y-3 shadow-sm">
              <div className="flex items-center gap-2 pb-2 border-b border-border/60">
                <ShieldCheck className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-black text-foreground">所属チーム</h2>
              </div>

              {teams.length > 0 && (
                <div className="space-y-1.5">
                  {teams.map((t) => {
                    const isCurrent = currentTeam?.id === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          if (!isCurrent) {
                            selectTeam(t.id);
                            toast.success(`表示チームを「${t.name}」に切り替えました`);
                          }
                        }}
                        className={`w-full flex items-center justify-between p-3 rounded-2xl border text-left transition-all ${
                          isCurrent
                            ? "bg-primary/10 border-primary/40 text-primary"
                            : "bg-background hover:bg-muted/60 border-border text-foreground active:scale-[0.99]"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-black truncate">
                            {t.orgName || t.name}
                          </p>
                          {t.teamName && (
                            <p className="text-[10px] font-bold text-muted-foreground truncate">
                              {t.teamName}
                            </p>
                          )}
                        </div>
                        {isCurrent ? (
                          <span className="px-2.5 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-black shrink-0 flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            <span>選択中</span>
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold text-muted-foreground shrink-0">
                            切替
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              <button
                type="button"
                onClick={() => setIsJoinModalOpen(true)}
                className="w-full py-2.5 px-3 rounded-2xl bg-primary/10 hover:bg-primary/15 border border-primary/30 text-xs font-black text-primary transition-all active:scale-98 flex items-center justify-center gap-1.5"
              >
                <UserPlus className="w-4 h-4" />
                <span>招待コードで別のチームに参加</span>
              </button>
            </section>
          </>
        )}

        <div className="h-8 w-full shrink-0" aria-hidden="true" />
      </div>

      <JoinTeamModal
        isOpen={isJoinModalOpen}
        onClose={() => setIsJoinModalOpen(false)}
        onSuccess={() => {
          setIsJoinModalOpen(false);
          refreshTeams();
        }}
      />
    </div>
  );
}

