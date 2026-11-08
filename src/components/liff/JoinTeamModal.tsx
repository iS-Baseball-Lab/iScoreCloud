// filepath: src/components/liff/JoinTeamModal.tsx
"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
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
} from "lucide-react";
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
  onClose: () => void;
  onSuccess?: (result: JoinTeamSuccessResult) => void;
}

export function JoinTeamModal({
  isOpen,
  onClose,
  onSuccess,
}: JoinTeamModalProps) {
  const {
    profile,
    isLoggedIn,
    login,
    pendingJoinCode,
    persistPendingJoinCode,
    clearPendingJoinCode,
    recordOptimisticPendingTeam,
  } = useLiff();
  const [mounted, setMounted] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [isAutoFilledFromInvite, setIsAutoFilledFromInvite] = useState(false);
  const [name, setName] = useState(profile?.displayName || "");
  const [memberType, setMemberType] = useState<"parent" | "player" | "staff">(
    "parent"
  );
  const [phone, setPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusResult, setStatusResult] = useState<{
    status: "pending" | "active";
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
  }, [isOpen, pendingJoinCode]);

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

  const handleSubmit = async (e: React.FormEvent) => {
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

      // 承認済み（active）の場合のみ選択チームを切り替え。pending の間は体験デモ（または既存の承認済みチーム）を維持する
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

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-xl overflow-hidden sm:my-auto max-h-[90dvh] flex flex-col animate-in zoom-in-95 duration-200">
        {/* ヘッダー (A-3 Dark Solid Header Cap + LINEミニアプリアイコン) */}
        <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/liff-logo.webp"
              alt="iScoreCloud LINEミニアプリ"
              className="w-9 h-9 rounded-[22%] bg-slate-900 border border-slate-700 object-contain shrink-0 shadow-xs"
            />
            <div className="min-w-0">
              <h3 className="text-base font-black text-white truncate">
                チーム参加申請
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
            className="w-8 h-8 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-all shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

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
                  <Clock className="w-8 h-8 animate-pulse" />
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
                className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-black text-xs hover:bg-primary/90 transition-all shadow-sm"
              >
                ホームへ進む
              </button>
            </div>
          ) : (
            /* 入力フォーム */
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* 外部ブラウザ等でLINE未連携の場合、1タップ連携を案内（招待コードはリダイレクト後も自動保持） */}
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
                    className="w-full py-2.5 px-3 rounded-xl bg-[#06C755] hover:bg-[#05b34c] active:scale-[0.99] text-white font-black text-xs flex items-center justify-center gap-2 shadow-xs transition-all"
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
                      className={`py-2 rounded-xl text-xs border transition-all ${
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

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-black text-xs hover:bg-primary/90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
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
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
