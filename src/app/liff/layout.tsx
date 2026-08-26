// filepath: src/app/liff/layout.tsx
import React from "react";
import { LiffProvider } from "@/components/liff/LiffProvider";
import { LiffBottomNav } from "@/components/liff/LiffBottomNav";

export const metadata = {
  title: "i-Score Mini | チーム情報 & 試合動画",
  description: "LINEで試合動画やスコアをサクサク確認できる草野球チーム向けミニアプリ",
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
