// src/app/(auth)/layout.tsx
import React from "react";

/**
 * 💡 認証エリア共通レイアウト
 * 1. スクロールさせない (h-[100dvh] overflow-hidden)
 * 2. グラスモーフィズムの美しい共通背景
 * 3. ヘッダー、ボトムナビ、アバターなどは一切配置しない「純粋な空間」
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex h-[100dvh] w-full flex-col items-center justify-center overflow-hidden bg-background text-foreground selection:bg-primary/20">
      {/* 🌟 共通の背景装飾 (グラスモーフィズムの土台・太陽光下でも見やすいコントラスト) */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/20 rounded-full blur-[120px] -z-10 opacity-70 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[600px] h-[300px] bg-blue-500/10 rounded-full blur-[100px] -z-10 opacity-50 pointer-events-none" />

      {/* コンテンツエリア（モバイル幅に最適化） */}
      <main className="w-full max-w-md z-10 flex flex-col items-center">
        {children}
      </main>
    </div>
  );
}
