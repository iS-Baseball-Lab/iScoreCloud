// filepath: src/app/liff/layout.tsx
import React from "react";
import { LiffProvider } from "@/components/liff/LiffProvider";
import { LiffBottomNav } from "@/components/liff/LiffBottomNav";

export const metadata = {
  title: "iScoreMini | チームHUB",
  description: "LINEで出欠回答・配車表・予定確認・試合動画がサクサク確認できる草野球・学童野球チーム向けミニアプリ",
};

export default function LiffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LiffProvider>
      <div className="min-h-screen bg-muted/20 text-foreground flex justify-center selection:bg-primary/20">
        <main className="w-full max-w-lg min-h-screen bg-background border-x border-border/40 shadow-xs flex flex-col pb-24 relative">
          {children}
          {/* 🌟 画像様フローティングボトムメニュー */}
          <LiffBottomNav />
        </main>
      </div>
    </LiffProvider>
  );
}
