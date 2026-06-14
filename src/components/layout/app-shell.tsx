// filepath: src/components/layout/app-shell.tsx
"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Header } from "@/components/layout/header";
import { FloatingNav } from "@/components/layout/floating-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isAuthPage = pathname === "/" || pathname?.startsWith("/login") || pathname?.startsWith("/register");

  if (isAuthPage) {
    return <>{children}</>;
  }

  // ⚾️ 独自性：スコア入力ページかどうかを判定
  // このページは「戦場」なので、ナビゲーションは一切不要！
  const isScorePage = pathname?.startsWith("/matches/score");

  if (isScorePage) {
    return <>{children}</>;
  }
  
  return (
    // 🔥 bg-background を bg-transparent に変更！
    // globals.css の美しいグラデーション背景が綺麗に透けて見えます！
    <div className="relative min-h-screen flex flex-col bg-transparent">
      <Header />

      <main className="flex-1 w-full relative pb-36 md:pb-12">
        {children}
      </main>

      {/* 自己完結した FloatingNav をシンプルに呼び出し */}
      <FloatingNav />
    </div>
  );
}
