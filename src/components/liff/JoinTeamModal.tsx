// filepath: src/components/liff/JoinTeamModal.tsx
"use client";

import React, { useState } from "react";
import { UserPlus, Shield, CheckCircle2, Clock, X, AlertCircle, Loader2 } from "lucide-react";
import { useLiff } from "./LiffProvider";

interface JoinTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function JoinTeamModal({ isOpen, onClose, onSuccess }: JoinTeamModalProps) {
  const { profile } = useLiff();
  const [inviteCode, setInviteCode] = useState("");
  const [name, setName] = useState(profile?.displayName || "");
  const [memberType, setMemberType] = useState<"parent" | "player" | "staff">("parent");
  const [phone, setPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusResult, setStatusResult] = useState<{ status: "pending" | "active"; message: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) {
      setErrorMsg("チーム招待コードを入力してください");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const res = await fetch("/api/liff/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteCode: inviteCode.trim(),
          userId: profile?.userId,
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
      };

      if (!res.ok || !data.success) {
        throw new Error(data.error || "チームが見つかりませんでした");
      }

      setStatusResult({
        status: data.status || "pending",
        message: data.message || "チーム参加申請を送信しました！",
      });

      if (data.teamId) {
        localStorage.setItem("iscore_selectedTeamId", data.teamId);
      }

      if (onSuccess) onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || "参加申請に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-background/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-card rounded-3xl border border-border shadow-2xl p-5 sm:p-6 space-y-4 my-auto max-h-[88vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        
        {/* ヘッダー */}
        <div className="flex items-center justify-between pb-3 border-b border-border/50 sticky top-0 bg-card z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-foreground">チーム参加申請</h3>
              <p className="text-[11px] font-bold text-muted-foreground">招待コードを入力して参加申請</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 申請完了画面 */}
        {statusResult ? (
          <div className="py-4 space-y-4 text-center">
            <div className="w-14 h-14 mx-auto rounded-3xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Clock className="w-8 h-8 animate-pulse" />
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-black text-foreground">参加申請を受け付けました！</h4>
              <p className="text-xs font-bold text-muted-foreground">
                {statusResult.message}
              </p>
            </div>
            <div className="p-3.5 rounded-2xl bg-muted/50 border border-border/60 text-left text-xs font-bold text-muted-foreground space-y-1">
              <p className="text-foreground font-black">🔒 セキュリティ・承認制について</p>
              <p>チーム管理者が承認するまで、個人情報や配車表・詳細予定は非公開となります。承認後に自動的にチームHUBが解禁されます。</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-black text-xs hover:bg-primary/90 transition-all shadow-sm"
            >
              閉じる
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

            <div className="space-y-1.5">
              <label className="text-xs font-black text-foreground">
                チーム招待コード / チームID <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                placeholder="管理者から共有された招待コードを入力"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-xs font-bold placeholder:text-muted-foreground/60 focus:outline-hidden focus:ring-2 focus:ring-primary/20"
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
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "parent", label: "保護者" },
                  { id: "player", label: "選手" },
                  { id: "staff", label: "指導者・役員" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setMemberType(item.id as any)}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                      memberType === item.id
                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                        : "bg-background border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-black text-foreground">連絡先電話番号 (任意)</label>
              <input
                type="tel"
                placeholder="例: 090-1234-5678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-xs font-bold placeholder:text-muted-foreground/60 focus:outline-hidden focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="p-3 rounded-2xl bg-muted/40 border border-border/50 text-[11px] text-muted-foreground font-bold flex items-start gap-2">
              <Shield className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <span>チーム管理者の承認完了後、予定や配車表などのチーム限定機能が解禁されます。</span>
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
  );
}
