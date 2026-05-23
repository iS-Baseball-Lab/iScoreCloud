// filepath: src/components/layout/protected-client-layout.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";

export function ProtectedClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  
  // 💡 検問のステータス（最初は「確認中」なので false）
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/me");
        const json = (await res.json()) as any;

        // 1. 未ログインならログイン画面へ弾く
        if (!json.success || !json.data) {
          router.replace("/login");
          return;
        }

        const memberships = json.data.memberships || [];
        const hasActive = memberships.some((m: any) => m.status === "active");
        const hasPending = memberships.some((m: any) => m.status === "pending");

        // 🌟 2. 承認済みのチームがなく、申請中（Pending）のチームがある場合は強制送還！
        if (!hasActive && hasPending) {
          router.replace("/pending-approval");
          return; // 👈 ここで止めるので isAuthorized は false のまま
        }

        // 🌟 3. どのチームにも属していない（新規ユーザー）場合も入力画面へ
        if (!hasActive && !hasPending) {
          router.replace("/pending-approval"); 
          return;
        }

        // 💡 4. すべての検問をクリアした人だけ、ダッシュボードの描画を許可！
        setIsAuthorized(true);
        
      } catch (error) {
        console.error("認証チェックエラー:", error);
        router.replace("/login");
      }
    };

    checkAuth();
  }, [router, pathname]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🚨 検問をクリアするまでは、絶対に AppShell や children を描画しない！
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] animate-pulse">
            Authenticating...
          </p>
        </div>
      </div>
    );
  }

  // 検問クリアで初めて中身を描画
  return <>{children}</>;
}
