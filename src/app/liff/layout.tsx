// filepath: src/app/liff/layout.tsx
import React from "react";
import { LiffProvider } from "@/components/liff/LiffProvider";
import { LiffBottomNav } from "@/components/liff/LiffBottomNav";

export const metadata = {
  title: "iScoreCloud for LINEミニアプリ",
  description: "LINEで出欠回答・配車表・予定確認・試合動画がサクサク確認できる草野球・学童野球チーム向けミニアプリ「iScoreCloud for LINEミニアプリ」",
};

export default function LiffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LiffProvider>
      <div className="min-h-screen bg-slate-200/60 dark:bg-slate-950 text-foreground flex justify-center selection:bg-primary/20">
        <main className="w-full max-w-lg min-h-screen bg-background border-x border-border shadow-xs flex flex-col pb-28 sm:pb-32 relative overflow-x-clip">
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
