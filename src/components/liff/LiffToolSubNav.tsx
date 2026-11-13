// filepath: src/components/liff/LiffToolSubNav.tsx
"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ScanLine,
  Megaphone,
  Music,
  Wrench,
  ChevronRight,
} from "lucide-react";

export interface LiffToolMeta {
  id: "news-generator" | "scorebook-import" | "cheer-songs";
  title: string;
  shortTitle: string;
  subtitle: string;
  href: string;
  statusLabel: string;
  statusTone: "indigo" | "rose" | "orange" | "emerald";
  icon: React.ComponentType<{ className?: string }>;
  iconColorClass: string;
}

export const LIFF_TOOLS: LiffToolMeta[] = [
  {
    id: "news-generator",
    title: "LINE試合速報",
    shortTitle: "LINE速報",
    subtitle: "試合・スタメン連携＆片手タップでLINE速報を作成",
    href: "/liff/tools/news-generator",
    statusLabel: "稼働中",
    statusTone: "emerald",
    icon: Megaphone,
    iconColorClass: "bg-primary/12 text-primary",
  },
  {
    id: "scorebook-import",
    title: "スコアAI取込",
    shortTitle: "スコア取込",
    subtitle: "紙スコアブックの撮影画像を高精度AIでデータ化",
    href: "/liff/tools/scorebook-import",
    statusLabel: "稼働中",
    statusTone: "indigo",
    icon: ScanLine,
    iconColorClass: "bg-primary/12 text-primary",
  },
  {
    id: "cheer-songs",
    title: "応援歌・コール",
    shortTitle: "応援歌",
    subtitle: "選手名を自動差し込んだ応援歌・コール歌詞を表示",
    href: "/liff/tools/cheer-songs",
    statusLabel: "準備中",
    statusTone: "orange",
    icon: Music,
    iconColorClass: "bg-primary/12 text-primary",
  },
];

export function LiffToolSubNav() {
  const pathname = usePathname();

  return (
    <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-muted border border-border">
      {LIFF_TOOLS.map((tool) => {
        const Icon = tool.icon;
        const isActive = pathname === tool.href;

        return (
          <Link
            key={tool.id}
            href={tool.href}
            className={`flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl border text-center transition-all active:scale-95 ${
              isActive
                ? "bg-card text-foreground border-border shadow-xs font-black"
                : "bg-transparent border-transparent text-muted-foreground hover:text-foreground hover:bg-card font-bold"
            }`}
          >
            <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-primary" : ""}`} />
            <span className="text-[10px] leading-tight truncate max-w-full">
              {tool.shortTitle}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export function LiffToolOtherLinks() {
  const pathname = usePathname();
  const otherTools = LIFF_TOOLS.filter((tool) => tool.href !== pathname);

  return (
    <section className="rounded-2xl bg-card border border-border shadow-xs overflow-hidden">
      <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-xl bg-primary/20 text-blue-300 border border-primary/40 flex items-center justify-center">
            <Wrench className="w-4 h-4" />
          </span>
          <div>
            <h2 className="text-xs font-black text-white">その他の試合・応援ツール</h2>
            <p className="text-[10px] font-bold text-slate-300">
              タップして各ツールへ切り替えられます
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-2">
        {otherTools.map((tool) => {
          const Icon = tool.icon;
          const statusBadgeClass =
            tool.id === "scorebook-import" || tool.id === "news-generator"
              ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/25"
              : "bg-card text-muted-foreground border-border";
          const hoverBorderClass = "hover:border-primary/40";

          return (
            <Link
              key={tool.id}
              href={tool.href}
              className={`flex items-center gap-3 p-3 rounded-2xl bg-muted hover:bg-accent border border-border ${hoverBorderClass} transition-all active:scale-98 group`}
            >
              <span
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tool.iconColorClass}`}
              >
                <Icon className="w-4 h-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-black text-foreground truncate">
                    {tool.title}
                  </p>
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black border shrink-0 ${statusBadgeClass}`}>
                    {tool.statusLabel}
                  </span>
                </div>
                <p className="text-[10px] font-bold text-muted-foreground truncate mt-0.5">
                  {tool.subtitle}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform shrink-0" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

