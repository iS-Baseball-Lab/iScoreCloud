"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Zap, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/layout/SectionHeader";

export default function NewsGeneratorPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen p-4 sm:p-6 pt-8 pb-32 animate-in fade-in duration-400">
      <div className="max-w-2xl mx-auto space-y-8">
        
        {/* ヘッダーエリア */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="h-10 w-10 rounded-full bg-card border border-border/50 shadow-sm hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <SectionHeader title="試合速報ジェネレーター" subtitle="NEWS GENERATOR" showPulse={false} />
        </div>

        {/* 開発中プレースホルダー */}
        <div className="bg-card border border-border rounded-[var(--radius-xl)] p-12 shadow-sm flex flex-col items-center justify-center text-center space-y-4">
          <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Zap className="h-10 w-10 text-primary animate-pulse" />
          </div>
          <h2 className="text-xl font-black text-foreground">
            現在、開発中です
          </h2>
          <p className="text-sm font-bold text-muted-foreground max-w-sm">
            試合のスコアや結果から、SNS等でシェアしやすい「試合速報・戦評」をAIが自動生成する機能を準備しています。今後のアップデートをお待ちください。
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
