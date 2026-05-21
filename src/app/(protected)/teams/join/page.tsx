"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { UserPlus, ChevronLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TeamJoinPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen p-4 sm:p-6 pt-8 pb-32 animate-in fade-in duration-400">
      <div className="max-w-2xl mx-auto space-y-8">
        
        {/* ━━ トップ：戻るボタン & SectionHeader ━━ */}
        <div className="space-y-4">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => router.back()}
            className="h-10 px-4 rounded-[var(--radius-xl)] font-black gap-2 shadow-sm border-border bg-card text-foreground hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
            戻る
          </Button>
          <SectionHeader title="チーム参加申請" subtitle="JOIN TEAM" showPulse={false} />
        </div>

        {/* コンテンツ */}
        <div className="flex flex-col items-center justify-center p-12 text-center bg-card border border-border rounded-3xl shadow-sm">
          <div className="h-16 w-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-6">
            <UserPlus className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-black mb-2">現在開発中です</h2>
          <p className="text-sm font-bold text-muted-foreground mb-8">
            チームの招待コードを入力するか、<br/>検索して参加申請を行えるようになる予定です。
          </p>
          <Button
            onClick={() => router.back()}
            className="rounded-full font-bold px-8 h-12 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            メニューに戻る
          </Button>
        </div>

      </div>
    </div>
  );
}
