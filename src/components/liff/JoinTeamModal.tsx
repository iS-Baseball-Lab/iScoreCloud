// filepath: src/components/liff/JoinTeamModal.tsx
"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { SiLine } from "react-icons/si";
import {
  UserPlus,
  Shield,
  CheckCircle2,
  Clock,
  X,
  AlertCircle,
  Loader2,
  Check,
  Building2,
  Plus,
} from "lucide-react";
import { LiffSelect, type LiffSelectOption } from "@/components/liff/LiffSelect";
import { invalidateLiffApiCache } from "@/lib/liff/api-cache";
import {
  EXPLICIT_DEMO_STORAGE_KEY,
  extractJoinCodeFromSearch,
  useLiff,
} from "./LiffProvider";

export interface JoinTeamSuccessResult {
  status: "pending" | "active";
  teamId?: string;
  teamName?: string;
}

interface JoinTeamModalProps {
  isOpen: boolean;
  initialMode?: "join" | "create";
  onClose: () => void;
  onSuccess?: (result: JoinTeamSuccessResult) => void;
}

const CLUB_CATEGORY_OPTIONS: LiffSelectOption[] = [
  { value: "gakudou", label: "学童野球（小学生・軟式）", group: "少年・学生" },
  { value: "little", label: "リトル・ボーイズ等（小学生・硬式）", group: "少年・学生" },
  { value: "chugaku_nanshiki", label: "中学軟式（部活・クラブ）", group: "少年・学生" },
  { value: "chugaku_koshiki", label: "中学硬式（シニア・ボーイズ・ヤング等）", group: "少年・学生" },
  { value: "koukou", label: "高校野球（硬式・軟式）", group: "少年・学生" },
  { value: "daigaku", label: "大学野球・準硬式", group: "一般・社会人" },
  { value: "shakaijin", label: "社会人・企業・クラブチーム", group: "一般・社会人" },
  { value: "kusa", label: "草野球・一般軟式", group: "一般・社会人" },
  { value: "softball", label: "ソフトボール", group: "その他" },
  { value: "other", label: "その他", group: "その他" },
];

export function JoinTeamModal({
  isOpen,
  initialMode = "join",
  onClose,
  onSuccess,
}: JoinTeamModalProps) {
  const {
    profile,
    isLoggedIn,
    login,
    selectTeam,
    pendingJoinCode,
    persistPendingJoinCode,
    clearPendingJoinCode,
    recordOptimisticPendingTeam,
  } = useLiff();

  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<"join" | "create">(initialMode);

  // 参加申請フォーム
  const [inviteCode, setInviteCode] = useState("");
  const [isAutoFilledFromInvite, setIsAutoFilledFromInvite] = useState(false);
  const [name, setName] = useState(profile?.displayName || "");
  const [memberType, setMemberType] = useState<"parent" | "player" | "staff">(
    "parent"
  );
  const [phone, setPhone] = useState("");

  // 新規チーム立ち上げフォーム
  const currentYear = new Date().getFullYear();
  const [orgName, setOrgName] = useState("");
  const [orgShortName, setOrgShortName] = useState("");
  const [clubCategory, setClubCategory] = useState("gakudou");
  const [squadName, setSquadName] = useState(`${currentYear}年度 Aチーム`);
  const [homeGround, setHomeGround] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusResult, setStatusResult] = useState<{
    status: "pending" | "active";
    isCreatedClub?: boolean;
    message: string;
    teamName?: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setStatusResult(null);
      setErrorMsg(null);
      return;
    }

    const fromUrl =
      typeof window !== "undefined"
        ? extractJoinCodeFromSearch(window.location.search)
        : null;
    const resolvedCode = pendingJoinCode || fromUrl;
    if (resolvedCode) {
      setInviteCode(resolvedCode);
      setIsAutoFilledFromInvite(true);
    }

    if (initialMode === "create") {
      setMode("create");
    } else {
      setMode("join");
    }
  }, [initialMode, isOpen, pendingJoinCode]);

  useEffect(() => {
    if (profile?.displayName && !name) {
      setName(profile.displayName);
    }
  }, [profile?.displayName, name]);

  if (!isOpen || !mounted) return null;

  const hasValidAccountId = Boolean(
    isLoggedIn && profile?.userId && profile.userId !== "cached-user"
  );

  const handleLineLoginForJoin = () => {
    if (inviteCode.trim()) {
      persistPendingJoinCode(inviteCode.trim());
    }
    login();
  };

  const handleSubmitJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) {
      setErrorMsg("チーム招待コードを入力してください");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const cleanUserId =
        profile?.userId && profile.userId !== "cached-user"
          ? profile.userId
          : undefined;

      const res = await fetch("/api/liff/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteCode: inviteCode.trim(),
          userId: cleanUserId,
          userName: name.trim() || profile?.displayName || "メンバー",
          memberType,
          phone: phone.trim() || undefined,
        }),
      });

      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        message?: string;
        status?: "pending" | "active";
        teamId?: string;
        teamName?: string;
        logoImageUrl?: string;
      };

      if (!res.ok || !data.success) {
        throw new Error(data.error || "チームが見つかりませんでした");
      }

      const resolvedStatus: "pending" | "active" =
        data.status === "active" ? "active" : "pending";
      setStatusResult({
        status: resolvedStatus,
        message: data.message || "チーム参加申請を送信しました！",
        teamName: data.teamName,
      });

      clearPendingJoinCode();

      if (resolvedStatus === "pending" && data.teamId && data.teamName) {
        recordOptimisticPendingTeam({
          id: data.teamId,
          name: data.teamName,
          logoImageUrl: data.logoImageUrl,
        });
      }

      if (
        resolvedStatus === "active" &&
        data.teamId &&
        data.teamId !== "demo-team"
      ) {
        localStorage.setItem("iscore_selectedTeamId", data.teamId);
        localStorage.removeItem(EXPLICIT_DEMO_STORAGE_KEY);
      }

      if (onSuccess) {
        onSuccess({
          status: resolvedStatus,
          teamId: data.teamId,
          teamName: data.teamName,
        });
      }
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error && err.message
          ? err.message
          : "参加申請に失敗しました"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitCreateClub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasValidAccountId) {
      setErrorMsg("新しいチームを作成するにはLINEログインが必要です");
      return;
    }
    const trimmedOrgName = orgName.trim();
    if (!trimmedOrgName) {
      setErrorMsg("チーム（クラブ）名を入力してください");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const res = await fetch("/api/liff/admin/mgmt/create-club", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: profile?.userId || undefined,
          userName: name.trim() || profile?.displayName || undefined,
          orgName: trimmedOrgName,
          orgShortName: orgShortName.trim() || undefined,
          category: clubCategory,
          squadName: squadName.trim() || `${currentYear}年度 Aチーム`,
          year: currentYear,
          homeGround: homeGround.trim() || undefined,
        }),
      });

      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        message?: string;
        teamId?: string;
        displayName?: string;
      };

      if (!res.ok || !data.success || !data.teamId) {
        throw new Error(data.error || "新しいチームの作成に失敗しました");
      }

      clearPendingJoinCode();
      localStorage.setItem("iscore_selectedTeamId", data.teamId);
      localStorage.removeItem(EXPLICIT_DEMO_STORAGE_KEY);
      invalidateLiffApiCache();
      selectTeam(data.teamId);

      if (onSuccess) {
        onSuccess({
          status: "active",
          teamId: data.teamId,
          teamName: data.displayName || trimmedOrgName,
        });
      }
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error && err.message
          ? err.message
          : "新しいチームの作成に失敗しました"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-xl overflow-hidden sm:my-auto max-h-[90dvh] flex flex-col animate-in zoom-in-95 duration-200">
        {/* ヘッダー (A-3 Dark Solid Header Cap + LINEミニアプリアイコン) */}
        <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/liff-logo.webp"
              alt="iScoreCloud LINEミニアプリ"
              width={36}
              height={36}
              className="w-9 h-9 rounded-[22%] bg-slate-900 border border-slate-700 object-contain shrink-0 shadow-xs"
            />
            <div className="min-w-0">
              <h3 className="text-base font-black text-white truncate">
                {mode === "create" ? "新しいチームを作成" : "チーム参加申請"}
              </h3>
              <p className="text-[11px] font-bold text-slate-300 truncate">
                iScoreCloud LINEミニアプリ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="w-8 h-8 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-all shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 参加 / 新規作成 切替タブ */}
        {!statusResult && (
          <div className="px-4 pt-3 pb-2 bg-muted/40 border-b border-border shrink-0">
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-muted border border-border">
              <button
                type="button"
                onClick={() => {
                  setMode("join");
                  setErrorMsg(null);
                }}
                className={`py-2 px-2.5 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  mode === "join"
                    ? "bg-card text-foreground shadow-2xs border border-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <UserPlus className={`w-3.5 h-3.5 ${mode === "join" ? "text-primary" : ""}`} />
                <span>招待コードで参加</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode("create");
                  setErrorMsg(null);
                }}
                className={`py-2 px-2.5 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  mode === "create"
                    ? "bg-card text-foreground shadow-2xs border border-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Building2 className={`w-3.5 h-3.5 ${mode === "create" ? "text-primary" : ""}`} />
                <span>新しくチームを作成</span>
              </button>
            </div>
          </div>
        )}

        <div className="p-5 sm:p-6 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-6 space-y-4 overflow-y-auto">
          {/* 申請完了画面 */}
          {statusResult ? (
            <div className="py-3 space-y-4 text-center">
              <div
                className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center ${
                  statusResult.status === "active"
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                }`}
              >
                {statusResult.status === "active" ? (
                  <CheckCircle2 className="w-8 h-8" />
                ) : (
                  <Clock className="w-8 h-8" />
                )}
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-black text-foreground">
                  {statusResult.status === "active"
                    ? "チームへの参加が完了しました！"
                    : "参加申請を受け付けました！"}
                </h4>
                <p className="text-xs font-bold text-muted-foreground leading-relaxed">
                  {statusResult.message}
                </p>
              </div>
              {statusResult.status === "pending" && (
                <div className="p-3.5 rounded-2xl bg-muted border border-border border-l-4 border-l-amber-500 text-left text-xs font-bold text-muted-foreground space-y-1">
                  <p className="text-foreground font-black">
                    ⏳ 管理者の承認をお待ちください
                  </p>
                  <p className="leading-relaxed">
                    チーム管理者が承認すると、ホーム画面から実際の予定・出欠・配車・試合データが自動的に表示されます。（承認までは体験用デモ画面をご覧いただけます）
                  </p>
                </div>
              )}
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-black text-xs hover:bg-primary/90 transition-all shadow-sm cursor-pointer"
              >
                ホームへ進む
              </button>
            </div>
          ) : mode === "join" ? (
            /* 1. 招待コード参加フォーム */
            <form onSubmit={handleSubmitJoin} className="space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {!hasValidAccountId && (
                <div className="p-3.5 rounded-2xl bg-muted border border-border border-l-4 border-l-[#06C755] space-y-2.5">
                  <div className="space-y-0.5">
                    <p className="text-xs font-black text-foreground">
                      LINEアカウント連携がおすすめです
                    </p>
                    <p className="text-[11px] font-bold text-muted-foreground leading-snug">
                      LINEでログインしてから申請すると、管理者の承認後すぐにチーム画面が自動解禁されます。（入力中の招待コードは保持されます）
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleLineLoginForJoin}
                    className="w-full py-2.5 px-3 rounded-xl bg-[#06C755] hover:bg-[#05b34c] active:scale-[0.99] text-white font-black text-xs flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
                  >
                    <SiLine className="w-4 h-4 shrink-0" />
                    <span>LINEでログインして申請に進む</span>
                  </button>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-black text-foreground">
                    チーム招待コード <span className="text-destructive">*</span>
                  </label>
                  {isAutoFilledFromInvite && inviteCode.trim() && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-black">
                      <Check className="w-3 h-3" />
                      招待リンクから自動入力済
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="管理者から共有された招待コードを入力"
                  value={inviteCode}
                  onChange={(e) => {
                    setInviteCode(e.target.value);
                    setIsAutoFilledFromInvite(false);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background font-mono text-xs font-black tracking-wide placeholder:font-sans placeholder:font-bold placeholder:text-muted-foreground/60 focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black text-foreground">
                  お名前 (表示名) <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  placeholder="例: 山田 太郎 (または LINE名)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-xs font-bold placeholder:text-muted-foreground/60 focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black text-foreground">区分</label>
                <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-muted border border-border">
                  {(
                    [
                      { id: "parent", label: "保護者" },
                      { id: "player", label: "選手" },
                      { id: "staff", label: "指導者・役員" },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setMemberType(item.id)}
                      className={`py-2 rounded-xl text-xs border transition-all cursor-pointer ${
                        memberType === item.id
                          ? "bg-card text-foreground border-border font-black shadow-sm"
                          : "border-transparent text-muted-foreground hover:text-foreground font-bold"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black text-foreground">
                  連絡先電話番号 (任意)
                </label>
                <input
                  type="tel"
                  placeholder="例: 090-1234-5678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-xs font-bold placeholder:text-muted-foreground/60 focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="p-3 rounded-2xl bg-muted border border-border text-[11px] text-muted-foreground font-bold flex items-start gap-2">
                <Shield className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>
                  チーム管理者の承認完了後、予定や配車表・写真ギャラリーなどのチーム限定機能が解禁されます。
                </span>
              </div>

              <p className="text-[11px] font-bold text-muted-foreground text-center leading-relaxed px-1">
                申請の送信により、
                <Link
                  href="/liff/terms"
                  onClick={onClose}
                  className="text-primary font-black underline underline-offset-2 hover:opacity-80 mx-0.5"
                >
                  利用規約
                </Link>
                ・
                <Link
                  href="/liff/privacy"
                  onClick={onClose}
                  className="text-primary font-black underline underline-offset-2 hover:opacity-80 mx-0.5"
                >
                  プライバシーポリシー
                </Link>
                に同意したものとみなされます（未成年の方は保護者の同意を得て申請してください）。
              </p>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-black text-xs hover:bg-primary/90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>申請送信中...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>チーム参加申請を送信</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            /* 2. 新規チーム（クラブ）作成フォーム */
            <form onSubmit={handleSubmitCreateClub} className="space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {!hasValidAccountId ? (
                <div className="p-4 rounded-2xl bg-muted border border-border border-l-4 border-l-[#06C755] space-y-3">
                  <div className="space-y-1">
                    <p className="text-xs font-black text-foreground">
                      新しいチームを作成するにはLINEログインが必要です
                    </p>
                    <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
                      作成者がチームの代表・管理者（オーナー）として安全に登録されます。LINE連携後にすぐ作成できます。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => login()}
                    className="w-full py-2.5 px-3 rounded-xl bg-[#06C755] hover:bg-[#05b34c] active:scale-[0.99] text-white font-black text-xs flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
                  >
                    <SiLine className="w-4 h-4 shrink-0" />
                    <span>LINEでログインして作成に進む</span>
                  </button>
                </div>
              ) : (
                <>
                  <div className="p-3 rounded-2xl bg-muted/60 border border-border text-[11px] font-bold text-muted-foreground leading-relaxed">
                    代表・監督・IT管理者として新しいチームを立ち上げます。作成後にLINEで保護者や選手へ招待リンクを送れます。
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-foreground">
                      チーム名（クラブ・団体名） <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="例: 〇〇少年野球クラブ"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-xs font-bold placeholder:text-muted-foreground/60 focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-black text-foreground">
                        略称 (任意)
                      </label>
                      <input
                        type="text"
                        placeholder="例: 〇〇クラブ"
                        value={orgShortName}
                        onChange={(e) => setOrgShortName(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-xs font-bold placeholder:text-muted-foreground/60 focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-black text-foreground">
                        初期編成名
                      </label>
                      <input
                        type="text"
                        placeholder={`例: ${currentYear}年度 Aチーム`}
                        value={squadName}
                        onChange={(e) => setSquadName(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-xs font-bold placeholder:text-muted-foreground/60 focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-foreground block">
                      チーム種別・カテゴリ
                    </label>
                    <LiffSelect
                      value={clubCategory}
                      onChange={setClubCategory}
                      options={CLUB_CATEGORY_OPTIONS}
                      title="チーム種別・カテゴリを選択"
                      size="md"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-black text-foreground">
                        あなたの表示名
                      </label>
                      <input
                        type="text"
                        placeholder="例: 山田 太郎"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-xs font-bold placeholder:text-muted-foreground/60 focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-black text-foreground">
                        主な活動場所 (任意)
                      </label>
                      <input
                        type="text"
                        placeholder="例: 〇〇第一球場"
                        value={homeGround}
                        onChange={(e) => setHomeGround(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-xs font-bold placeholder:text-muted-foreground/60 focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  </div>

                  <p className="text-[11px] font-bold text-muted-foreground text-center leading-relaxed px-1">
                    チームの作成により、
                    <Link
                      href="/liff/terms"
                      onClick={onClose}
                      className="text-primary font-black underline underline-offset-2 hover:opacity-80 mx-0.5"
                    >
                      利用規約
                    </Link>
                    ・
                    <Link
                      href="/liff/privacy"
                      onClick={onClose}
                      className="text-primary font-black underline underline-offset-2 hover:opacity-80 mx-0.5"
                    >
                      プライバシーポリシー
                    </Link>
                    に同意したものとみなされます。
                  </p>

                  <button
                    type="submit"
                    disabled={isSubmitting || !orgName.trim()}
                    className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-black text-xs hover:bg-primary/90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>チームを作成中...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        <span>この内容でチームを作成する</span>
                      </>
                    )}
                  </button>
                </>
              )}
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
