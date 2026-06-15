// src/app/(protected)/teams/requests/page.tsx
"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Check,
  X,
  Loader2,
  Clock,
  ChevronLeft,
  Trophy,
  Users,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 型定義
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface JoinRequest {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  status: string;
  joinedAt: number | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 承認確認モーダル
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface ActionConfirmModalProps {
  request: JoinRequest;
  action: "approve" | "reject";
  isProcessing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ActionConfirmModal({
  request,
  action,
  isProcessing,
  onConfirm,
  onCancel,
}: ActionConfirmModalProps) {
  const isApprove = action === "approve";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-card rounded-3xl border border-border/50 shadow-2xl p-6 space-y-5 animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "h-12 w-12 rounded-2xl flex items-center justify-center shrink-0",
              isApprove ? "bg-emerald-500/10" : "bg-red-500/10"
            )}
          >
            {isApprove ? (
              <Check className="h-6 w-6 text-emerald-500" />
            ) : (
              <AlertCircle className="h-6 w-6 text-red-500" />
            )}
          </div>
          <div>
            <h3 className="font-black text-base text-foreground">
              {isApprove ? "参加を承認しますか？" : "申請を拒否しますか？"}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isApprove
                ? "承認後はメンバーとしてチームに参加します"
                : "この操作は取り消せません"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border/40">
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarImage src={request.avatarUrl ?? ""} />
            <AvatarFallback className="bg-primary/10 text-primary font-black text-xs">
              {(request.name || "?").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-black">{request.name}</p>
            <p className="text-[11px] text-muted-foreground">{request.email}</p>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isProcessing}
            className="flex-1 rounded-2xl font-bold border-border/50"
          >
            キャンセル
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isProcessing}
            className={cn(
              "flex-1 rounded-2xl font-black border-0 text-white",
              isApprove
                ? "bg-emerald-600 hover:bg-emerald-500"
                : "bg-red-500 hover:bg-red-600"
            )}
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isApprove ? (
              "承認する"
            ) : (
              "拒否する"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// リクエストカード
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface RequestCardProps {
  request: JoinRequest;
  onAction: (req: JoinRequest, action: "approve" | "reject") => void;
}

function RequestCard({ request, onAction }: RequestCardProps) {
  const requestDate = request.joinedAt
    ? new Date(request.joinedAt * 1000).toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
    : null;

  return (
    <Card className="bg-card/40 backdrop-blur-md border-border/50 rounded-3xl overflow-hidden shadow-sm transition-all duration-300 hover:border-primary/30 group">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-center gap-4">
          {/* アバター */}
          <div className="relative shrink-0">
            <Avatar className="h-12 w-12 border-2 border-border/40">
              <AvatarImage
                src={request.avatarUrl ?? ""}
                alt={request.name}
                className="object-cover"
              />
              <AvatarFallback className="bg-orange-500/10 text-orange-500 font-black text-sm">
                {(request.name || "?").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-orange-500 border-2 border-background flex items-center justify-center">
              <Clock className="h-2.5 w-2.5 text-white" />
            </span>
          </div>

          {/* 名前・メール */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-foreground truncate">
              {request.name}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {request.email}
            </p>
            {requestDate && (
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                申請日: {requestDate}
              </p>
            )}
          </div>

          {/* アクションボタン */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onAction(request, "reject")}
              className="h-9 w-9 rounded-xl border border-border/40 flex items-center justify-center text-muted-foreground hover:bg-red-500 hover:text-white hover:border-red-500 transition-all"
              title="申請を拒否"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              onClick={() => onAction(request, "approve")}
              className="h-9 px-4 rounded-xl bg-emerald-600 text-white font-black text-xs hover:bg-emerald-500 transition-all flex items-center gap-1.5"
            >
              <Check className="h-3.5 w-3.5 stroke-[2.5px]" />
              承認
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メインコンテンツ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function TeamRequestsContent() {
  const router = useRouter();

  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [teamId, setTeamId] = useState("");
  const [teamName, setTeamName] = useState("");
  const [myRole, setMyRole] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [confirmTarget, setConfirmTarget] = useState<{
    req: JoinRequest;
    action: "approve" | "reject";
  } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // ─── データ取得 ───────────────────────
  const fetchRequests = useCallback(async (tid: string) => {
    try {
      const res = await fetch(`/api/teams/${tid}/requests`);
      const json = (await res.json()) as {
        success: boolean;
        requests?: JoinRequest[];
        error?: string;
      };
      if (!json.success) throw new Error(json.error ?? "取得失敗");
      setRequests(json.requests ?? []);
    } catch {
      toast.error("参加申請の取得に失敗しました");
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      try {
        // 1. セッション取得
        const meRes = await fetch("/api/auth/me");
        const meJson = (await meRes.json()) as {
          success: boolean;
          data: {
            id: string;
            memberships: {
              teamId: string;
              teamName: string;
              role: string;
              isMainTeam: boolean;
            }[];
          };
        };
        if (!meJson.success) throw new Error("認証エラー");

        // 2. 選択中チームを特定
        const selectedTeamId =
          localStorage.getItem("iscore_selectedTeamId") ?? "";
        const membership =
          meJson.data.memberships.find((m) => m.teamId === selectedTeamId) ??
          meJson.data.memberships.find((m) => m.isMainTeam) ??
          meJson.data.memberships[0];

        if (!membership) {
          router.push("/teams");
          return;
        }

        setTeamId(membership.teamId);
        setTeamName(membership.teamName);
        setMyRole(membership.role);

        // 3. 申請一覧取得
        await fetchRequests(membership.teamId);
      } catch {
        toast.error("データの取得に失敗しました");
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [router, fetchRequests]);

  // ─── 承認 / 拒否 ─────────────────────
  const handleConfirm = async () => {
    if (!confirmTarget) return;
    const { req, action } = confirmTarget;
    setIsProcessing(true);
    try {
      const res = await fetch(
        `/api/teams/${teamId}/requests/${req.memberId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );
      const json = (await res.json()) as {
        success: boolean;
        message?: string;
        error?: string;
      };
      if (!json.success) throw new Error(json.error ?? "処理失敗");

      toast.success(
        action === "approve"
          ? `${req.name} さんの参加を承認しました`
          : `${req.name} さんの申請を拒否しました`
      );
      setRequests((prev) => prev.filter((r) => r.memberId !== req.memberId));
      setConfirmTarget(null);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "処理に失敗しました"
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // ─── 権限チェック ─────────────────────
  const canManage =
    myRole === "MANAGER" || myRole === "manager" || myRole === "SYSTEM_ADMIN";

  // ─── ローディング ─────────────────────
  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-bold text-muted-foreground">
            申請情報を取得中...
          </p>
        </div>
      </div>
    );
  }

  // ─── 本体 ─────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in duration-500 pb-24">
      {/* ヘッダー */}
      <div className="flex items-start gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="h-10 w-10 rounded-full bg-card/60 border border-border/40 hover:bg-muted shrink-0 mt-1"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge
              variant="outline"
              className="border-orange-500/30 text-orange-500 bg-orange-500/5 rounded-full px-3 py-0.5 text-[9px] font-black tracking-widest uppercase"
            >
              Team Management
            </Badge>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black italic tracking-tighter uppercase text-foreground leading-none">
            Requests
          </h1>
          <p className="text-sm font-bold text-muted-foreground mt-1 truncate">
            {teamName}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => fetchRequests(teamId)}
          className="h-10 w-10 rounded-full bg-card/60 border border-border/40 hover:bg-muted shrink-0 mt-1"
          title="更新"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* サマリー */}
      <div className="flex items-center gap-3 p-4 rounded-2xl bg-orange-500/5 border border-orange-500/20">
        <Clock className="h-5 w-5 text-orange-500 shrink-0" />
        <div>
          <p className="text-sm font-black text-orange-500">
            承認待ちのリクエスト: {requests.length}件
          </p>
          <p className="text-[11px] text-muted-foreground">
            チームへの参加を申請しているメンバーの一覧です
          </p>
        </div>
      </div>

      {/* 権限なし通知 */}
      {!canManage && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-muted/40 border border-border/40">
          <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-sm font-bold text-muted-foreground">
            申請の承認・拒否には監督（MANAGER）権限が必要です。
          </p>
        </div>
      )}

      {/* リクエスト一覧 */}
      {requests.length === 0 ? (
        <div className="py-20 flex flex-col items-center gap-4 text-center opacity-30">
          <Trophy className="h-12 w-12" />
          <div className="space-y-1">
            <p className="font-black text-xl italic uppercase tracking-tighter">
              No Active Requests
            </p>
            <p className="text-sm font-bold text-muted-foreground">
              現在、新規の参加リクエストはありません
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-orange-500" />
            <h2 className="text-sm font-black uppercase tracking-widest text-orange-500">
              Pending ({requests.length})
            </h2>
          </div>
          {requests.map((req) => (
            <RequestCard
              key={req.memberId}
              request={req}
              onAction={(r, a) =>
                canManage
                  ? setConfirmTarget({ req: r, action: a })
                  : toast.error("この操作には監督権限が必要です")
              }
            />
          ))}
        </div>
      )}

      {/* メンバー管理へのリンク */}
      <Button
        variant="outline"
        onClick={() => router.push("/members")}
        className="w-full rounded-2xl h-11 border-border/50 text-muted-foreground hover:bg-muted font-bold text-sm"
      >
        メンバー一覧を見る →
      </Button>

      {/* フッター */}
      <footer className="py-4 opacity-20 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.4em]">
          Team Management • iScore
        </p>
      </footer>

      {/* 確認モーダル */}
      {confirmTarget && (
        <ActionConfirmModal
          request={confirmTarget.req}
          action={confirmTarget.action}
          isProcessing={isProcessing}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
    </div>
  );
}

export default function TeamRequestsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      }
    >
      <TeamRequestsContent />
    </Suspense>
  );
}
