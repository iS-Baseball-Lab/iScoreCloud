// filepath: src/app/liff/layout.tsx
import React from "react";
import { LiffProvider } from "@/components/liff/LiffProvider";
import { LiffBottomNav } from "@/components/liff/LiffBottomNav";

export const metadata = {
  title: "iScore for LINEミニアプリ | チームHUB",
  description: "LINEで出欠回答・配車表・予定確認・試合動画がサクサク確認できる草野球・学童野球チーム向けミニアプリ「iScore for LINEミニアプリ」",
};

export default function LiffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LiffProvider>
      <div className="min-h-screen bg-muted/20 text-foreground flex justify-center selection:bg-primary/20">
        <main className="w-full max-w-lg min-h-screen bg-background border-x border-border/40 shadow-xs flex flex-col pb-24 relative overflow-x-clip">
          {/* 🌟 トップページと全画面で統一されたアンビエントグラデーション背景 */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-0 right-0 h-[480px] bg-gradient-to-b from-primary/12 via-primary/6 to-transparent z-0"
          />
          <div className="relative flex flex-col flex-1">
            {children}
          </div>
          {/* 🌟 画像様フローティングボトムメニュー */}
          <LiffBottomNav />
        </main>
      </div>
    </LiffProvider>
  );
}
