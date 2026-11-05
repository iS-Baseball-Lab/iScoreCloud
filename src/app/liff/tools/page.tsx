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
            <span className="w-8 h-8 rounded-xl bg-primary/12 text-primary flex items-center justify-center font-black">
              <Wrench className="w-4 h-4" />
            </span>
          }
          showBack
        />

        <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="px-4 py-2 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary flex items-center justify-between">
            <span className="text-xs font-black flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>TEAM UTILITY LAB</span>
            </span>
            <span className="px-2 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-black">
              {LIFF_TOOLS.length} TOOLS
            </span>
          </div>
          <div className="p-4 space-y-1">
            <h2 className="text-xs font-black text-foreground">
              現場で使える便利ツール（順次拡張中）
            </h2>
            <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
              「スコアブック取り込み v2」と「試合速報ジェネレータ v2」が稼働中です。応援歌・配車支援ツールも順次公開予定です。
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          {LIFF_TOOLS.map((tool) => {
            const Icon = tool.icon;
            const isCarpool =
              tool.id === "carpool-generator" || tool.href.includes("carpool");
            const isLiveTool =
              tool.id === "scorebook-import" || tool.id === "news-generator";
            return (
              <Link
                key={tool.id}
                href={tool.href}
                className="relative overflow-hidden flex items-center gap-3.5 p-4 pt-4.5 rounded-2xl border border-border bg-card shadow-xs hover:border-primary/50 hover:bg-muted/40 transition-all active:scale-98 group"
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-x-0 top-0 h-[3px] ${
                    isCarpool ? "bg-teal-600" : "bg-primary"
                  }`}
                />
                <span
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                    isCarpool
                      ? "bg-teal-500/12 text-teal-600 dark:text-teal-400"
                      : "bg-primary/12 text-primary"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-black text-foreground truncate">
                      {tool.title}
                    </p>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-black shrink-0 ${
                        isLiveTool
                          ? "bg-emerald-600 text-white"
                          : "bg-muted text-muted-foreground border border-border"
                      }`}
                    >
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

        <div className="h-8 w-full shrink-0 pointer-events-none select-none" aria-hidden="true" />
      </div>
    </div>
  );
}

