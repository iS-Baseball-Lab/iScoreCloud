// filepath: src/components/liff/LiffMainShell.tsx
"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { LiffBottomNav } from "@/components/liff/LiffBottomNav";
import { LegacyDeviceCompatibilityBanner } from "@/components/liff/LegacyDeviceCompatibilityBanner";

interface LiffMainShellProps {
  children: React.ReactNode;
}

/**
 * LIFF 共通メインシェル
 * - 通常ルート: 従来通り `min-h-screen` + 下部ボトムナビ余白 (`pb-28 sm:pb-32`) + `<LiffBottomNav />`
 * - 1画面コックピットルート (`/liff/tools/news-generator`・`/liff/baseball-board`):
 *   ボトムナビを非表示にし、スクロールゼロの1画面完結レイアウト (`h-dvh max-h-dvh overflow-hidden pb-0`) とする
 */
export function LiffMainShell({ children }: LiffMainShellProps) {
  const pathname = usePathname();
  const isFullViewportCockpit = Boolean(
    pathname?.startsWith("/liff/tools/news-generator") ||
      pathname?.startsWith("/liff/baseball-board")
  );

  if (isFullViewportCockpit) {
    return (
      <div className="h-dvh max-h-dvh overflow-hidden bg-slate-200/60 dark:bg-slate-950 text-foreground flex justify-center selection:bg-primary/20">
        <main className="w-full max-w-lg h-dvh max-h-dvh bg-background border-x border-border shadow-xs flex flex-col pb-0 relative overflow-hidden">
          <LegacyDeviceCompatibilityBanner />
          <div className="relative flex flex-col flex-1 min-h-0 overflow-hidden">
            {children}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-200/60 dark:bg-slate-950 text-foreground flex justify-center selection:bg-primary/20">
      <main className="w-full max-w-lg min-h-screen bg-background border-x border-border shadow-xs flex flex-col pb-28 sm:pb-32 relative overflow-x-clip">
        <LegacyDeviceCompatibilityBanner />
        <div className="relative flex flex-col flex-1">{children}</div>
        {/* 🌟 画像様フローティングボトムメニュー */}
        <LiffBottomNav />
      </main>
    </div>
  );
}

