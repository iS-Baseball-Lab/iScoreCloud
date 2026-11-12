// filepath: src/app/(auth)/pending-approval/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OpenLineMiniAppButton } from "@/components/common/OpenLineMiniAppButton";
import { Loader2, Send, Clock, ShieldQuestion, LogOut } from "lucide-react";

type ViewState = "input" | "pending";

interface Membership {
  teamId: string;
  teamName: string;
  role: string;
  status: "active" | "pending";
  isMainTeam: boolean;
}

interface AuthMeResponse {
  success: boolean;
  data?: {
    id: string;
    name?: string;
    image?: string;
    role?: string;
    systemRole?: string;
    memberships: Membership[];
  };
  error?: string;
}

interface JoinTeamResponse {
  success: boolean;
  message?: string;
  error?: string;
}

function clearClientAuthAndTeamStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("iscore_auth_cache_active");
    localStorage.removeItem("iscore_selectedTeamId");
    localStorage.removeItem("iscore_selectedTeamName");
    localStorage.removeItem("iscore_selectedTeamCategory");
    localStorage.removeItem("iscore_selectedTeamLogo");
    localStorage.removeItem("iscore_selectedTeamLegend");
    localStorage.removeItem("iscore_teams_json");
    localStorage.removeItem("iscore_teams_v2_json");
    localStorage.removeItem("iscore_currentTeam_json");
    localStorage.removeItem("iscore_currentTeam_v2_json");
    localStorage.removeItem("iscore_user_id");
    localStorage.removeItem("iscore_userId");
    localStorage.removeItem("iscore_user_name");
    localStorage.removeItem("iscore_user_avatar");
  } catch {
    // ignore storage errors
  }
}

export default function PendingApprovalPage() {
  const router = useRouter();
  const [view, setView] = useState<ViewState>("input");
  const [inviteCode, setInviteCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);

  // ─── ステータスの確認と自動ダッシュボード遷移 ───
  const checkStatus = useCallback(async (showToast = false) => {
    if (showToast) setIsChecking(true);
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.status === 401) {
        clearClientAuthAndTeamStorage();
        router.replace("/login");
        return;
      }
      if (!res.ok) throw new Error("ネットワークエラー");

      const json = (await res.json()) as AuthMeResponse;

      if (json.success && json.data) {
        const isSystemAdmin =
          json.data.systemRole === "SYSTEM_ADMIN" ||
          json.data.role === "SYSTEM_ADMIN";
        const memberships = json.data.memberships || [];
        const hasActive = memberships.some((m) => m.status === "active");
        const hasPending = memberships.some((m) => m.status === "pending");

        // 🌟 承認されている場合、または SYSTEM_ADMIN の場合はダッシュボードへ遷移
        if (hasActive || isSystemAdmin) {
          toast.success("チームへの参加が承認されました！ダッシュボードに遷移します。");
          if (typeof window !== "undefined") {
            localStorage.setItem("iscore_auth_cache_active", "true");
          }
          router.replace("/dashboard");
          return;
        }

        if (hasPending) {
          setView("pending");
          if (showToast) {
            toast.info("まだ申請承認待ちの状態です。承認されるまでしばらくお待ちください。");
          }
        } else {
          setView("input");
          if (showToast) {
            toast.warning("参加申請が見つかりませんでした。もう一度招待コードを入力してください。");
          }
        }
      }
    } catch (error) {
      console.error("ステータス確認エラー:", error);
      if (showToast) {
        toast.error("ステータス確認に失敗しました。接続環境をお確かめください。");
      }
    } finally {
      if (showToast) setIsChecking(false);
      setIsLoading(false);
    }
  }, [router]);

  // ─── 初期チェック ＆ 自動ステータス確認ポーリング ───
  useEffect(() => {
    void checkStatus(false);

    const interval = setInterval(() => {
      if (view === "pending" && document.visibilityState === "visible") {
        void checkStatus(false);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [view, checkStatus]);

  // ─── チーム参加申請処理 ───
  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/teams/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: inviteCode.trim() }),
      });

      const json = (await res.json()) as JoinTeamResponse;

      if (!json.success) {
        throw new Error(json.error || "無効な招待コードです");
      }

      toast.success(json.message || "チームへの参加申請を送信しました！");
      setView("pending");
      void checkStatus(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "参加申請に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── ログアウト処理（Better-Auth セッション破棄 ＋ ローカルストレージ消去） ───
  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const { authClient } = await import("@/lib/auth-client");
      await authClient.signOut();
      clearClientAuthAndTeamStorage();
      toast.success("ログアウトしました");
      router.push("/login");
    } catch {
      clearClientAuthAndTeamStorage();
      router.push("/login");
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 animate-in fade-in duration-500">
      <div className="w-full max-w-md bg-card border border-border rounded-[var(--radius-2xl)] shadow-lg overflow-hidden">

        {/* ━━ 【ビュー1】招待コード入力画面 ━━ */}
        {view === "input" && (
          <div className="p-6 sm:p-8 space-y-6">
            <div className="text-center space-y-3">
              <div className="mx-auto w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center border border-primary/20 shadow-inner">
                <ShieldQuestion className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                チームへの参加
              </h1>
              <p className="text-sm font-bold text-muted-foreground leading-relaxed text-left sm:text-center">
                監督や代表者または、管理者などから共有された<br />
                チームへの<span className="text-foreground">招待コード（チームID）</span>を入力して、<br />
                参加申請を送信してください。
              </p>
            </div>

            <form onSubmit={handleJoin} className="space-y-5 pt-2">
              <div className="space-y-2">
                <label className="text-xs font-black text-foreground uppercase tracking-wider ml-1">
                  招待コード（チームID）
                </label>
                <Input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="例: 0a074b27-..."
                  className="h-12 text-xs sm:text-sm font-mono tracking-tight text-center rounded-[var(--radius-xl)] bg-muted/40 border-border focus:bg-background transition-colors"
                  maxLength={50}
                  required
                />
              </div>

              <div className="space-y-3 pt-2">
                <Button
                  type="submit"
                  disabled={isSubmitting || isLoggingOut || !inviteCode.trim()}
                  className="w-full h-12 rounded-[var(--radius-xl)] font-black text-sm shadow-md transition-all active:scale-[0.98] group"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      参加申請を送る
                      <Send className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
                    </>
                  )}
                </Button>

                <div className="pt-2 border-t border-border space-y-2">
                  <p className="text-[11px] font-bold text-muted-foreground text-center">
                    招待コードを待つ間、LINEミニアプリで体験デモチームをお試しいただけます
                  </p>
                  <OpenLineMiniAppButton
                    variant="banner"
                    teamId="demo-team"
                    teamName="体験デモチーム"
                    compact
                  />
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleLogout}
                  disabled={isSubmitting || isLoggingOut}
                  className="w-full h-12 rounded-[var(--radius-xl)] font-bold text-muted-foreground hover:text-foreground"
                >
                  {isLoggingOut ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <LogOut className="h-4 w-4 mr-2" />
                  )}
                  ログアウトして戻る
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* ━━ 【ビュー2】承認待ち（待合室）画面 ━━ */}
        {view === "pending" && (
          <div className="p-6 sm:p-8 space-y-6 text-center">
            <div className="relative mx-auto w-16 h-16 flex items-center justify-center">
              <div className="absolute inset-0 bg-orange-500/20 rounded-full animate-ping opacity-75" />
              <div className="relative bg-orange-500 rounded-full p-4 shadow-lg border-2 border-background">
                <Clock className="h-6 w-6 text-white" />
              </div>
            </div>

            <div className="space-y-3">
              <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                承認待ちです
              </h1>
              <p className="text-sm font-bold text-muted-foreground leading-relaxed">
                チームへの参加申請を送信しました。<br />
                管理者に承認されるまで、実チームのデータは非公開となります。
              </p>
            </div>

            <div className="pt-4 space-y-3">
              <Button
                onClick={() => void checkStatus(true)}
                disabled={isLoggingOut || isChecking}
                variant="outline"
                className="w-full h-12 rounded-[var(--radius-xl)] font-black border-border shadow-sm flex items-center justify-center gap-2"
              >
                {isChecking ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/60" />
                ) : null}
                ステータスを更新
              </Button>

              <div className="pt-2 border-t border-border space-y-2 text-left">
                <p className="text-[11px] font-bold text-muted-foreground text-center">
                  承認待ちの間も、体験デモチームで操作感をお試しいただけます
                </p>
                <OpenLineMiniAppButton
                  variant="banner"
                  teamId="demo-team"
                  teamName="体験デモチーム"
                  compact
                />
              </div>

              <Button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                variant="ghost"
                className="w-full h-12 rounded-[var(--radius-xl)] font-bold text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                {isLoggingOut ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <LogOut className="h-4 w-4 mr-2" />
                )}
                ログアウトする
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
