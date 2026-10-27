// filepath: src/app/liff/tools/page.tsx
"use client";

import React from "react";
import Link from "next/link";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { LIFF_TOOLS } from "@/components/liff/LiffToolSubNav";
import { Wrench, ChevronRight, Sparkles } from "lucide-react";

export default function LiffToolsIndexPage() {
  return (
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="p-4 space-y-4">
        <LiffPageHeader
          title="便利ツール一覧"
          subtitle="TEAM UTILITY TOOLS"
          icon={
            <span className="w-8 h-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-black">
              <Wrench className="w-4 h-4" />
            </span>
          }
          showBack
        />

        <div className="rounded-3xl bg-card border border-border shadow-xs p-4 flex items-start gap-3">
          <span className="w-9 h-9 rounded-2xl bg-primary/12 text-primary flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles className="w-4 h-4" />
          </span>
          <div className="space-y-1">
            <h2 className="text-xs font-black text-foreground">
              現場で使える便利ツールを順次追加予定
            </h2>
            <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
              現在は各ツールの画面構成・要件確認用の「枠（プロトタイプ）」を公開しています。
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          {LIFF_TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.id}
                href={tool.href}
                className="flex items-center gap-3.5 p-4 rounded-3xl bg-card hover:bg-muted/40 border border-border shadow-xs transition-all active:scale-98 group"
              >
                <span
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${tool.iconColorClass}`}
                >
                  <Icon className="w-5 h-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-black text-foreground truncate">
                      {tool.title}
                    </p>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-muted text-muted-foreground border border-border/60 shrink-0">
                      {tool.statusLabel}
                    </span>
                  </div>
                  <p className="text-[11px] font-bold text-muted-foreground mt-1 leading-snug">
                    {tool.subtitle}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform shrink-0" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

