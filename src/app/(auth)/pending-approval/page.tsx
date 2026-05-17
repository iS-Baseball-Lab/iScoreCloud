// filepath: src/app/(auth)/pending-approval/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send, Clock, ShieldQuestion, LogOut } from "lucide-react"; // 💡 LogOutアイコンを追加、ArrowLeftを削除

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 💡 型定義 (Type Safety)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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
    memberships: Membership[];
  };
  error?: string;
}

interface JoinTeamResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export default function PendingApprovalPage() {
  const router = useRouter();
  const [view, setView] = useState<ViewState>("input");
  const [inviteCode, setInviteCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false); // 💡 ログアウト中のローディング状態
  const [isLoading, setIsLoading] = useState(true);

  // ─── 初期状態のチェック（既に申請中かどうか） ───
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) throw new Error("ネットワークエラー");

        const json = (await res.json()) as AuthMeResponse;

        if (json.success && json.data?.memberships) {
          const hasPending = json.data.memberships.some(m => m.status === "pending");
          if (hasPending) {
            setView("pending");
          }
        }
      } catch (error) {
        console.error("ステータス確認エラー:", error);
      } finally {
        setIsLoading(false);
      }
    };
    checkStatus();
  }, []);

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

    } catch (error) {
      toast.error(error instanceof Error ? error.message : "参加申請に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── 💡 ログアウト処理 ───
  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      // 💡 i-Scoreの認証機構（Auth.js / NextAuth等）のサインアウトエンドポイントへリクエスト
      const res = await fetch("/api/auth/signout", { method: "POST" });

      toast.success("ログアウトしました");
      // セッションをクリアしたため、安全にログイン画面（またはトップ）へ戻す
      router.push("/login");
    } catch (error) {
      // 通信エラーなどのフォールバック処理として、強制的に画面を切り替えて安全を担保
      window.location.href = "/login";
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
                  placeholder="例: 01HGW..."
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

                {/* 💡 不自然なダッシュボードへの導線を廃して、ログアウトボタンへ変更 */}
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
                承認されるまで、しばらくお待ちください。
              </p>
            </div>

            <div className="pt-4 space-y-3">
              <Button
                onClick={() => window.location.reload()}
                disabled={isLoggingOut}
                variant="outline"
                className="w-full h-12 rounded-[var(--radius-xl)] font-black border-border shadow-sm"
              >
                ステータスを更新
              </Button>

              {/* 💡 待合室側も、一度離脱してやり直せるようにログアウトボタンへ変更 */}
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
