"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Settings, ArrowLeft, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/layout/SectionHeader";

export default function SettingsPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen p-4 sm:p-6 pt-8 pb-32 animate-in fade-in duration-400">
      <div className="max-w-2xl mx-auto space-y-8">
        
        {/* ヘッダーエリア */}
        <SectionHeader title="アプリ設定" subtitle="SETTINGS" showPulse={false} />

        {/* 開発中プレースホルダー */}
        <div className="bg-card border border-border rounded-[var(--radius-xl)] p-12 shadow-sm flex flex-col items-center justify-center text-center space-y-4">
          <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Wrench className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-xl font-black text-foreground">
            現在、開発中です
          </h2>
          <p className="text-sm font-bold text-muted-foreground max-w-sm">
            アプリの各種設定（テーマ、表示サイズなど）を変更できる機能を準備しています。今後のアップデートをお待ちください。
          </p>
          <Button
            onClick={() => router.back()}
            className="mt-4 rounded-full font-bold px-8 shadow-sm active:scale-95 transition-transform"
          >
            前の画面に戻る
          </Button>
        </div>

      </div>
    </div>
  );
}
