// filepath: src/components/liff/LiffToolSubNav.tsx
"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ScanLine,
  Megaphone,
  Music,
  Wand2,
  Wrench,
  ChevronRight,
} from "lucide-react";

export interface LiffToolMeta {
  id: "scorebook-import" | "news-generator" | "cheer-songs" | "carpool-generator";
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
    id: "scorebook-import",
    title: "スコアブック取り込み",
    shortTitle: "スコア取込",
    subtitle: "手書きのスコアブック画像を高精度AIでデータ化",
    href: "/liff/tools/scorebook-import",
    statusLabel: "準備中",
    statusTone: "indigo",
    icon: ScanLine,
    iconColorClass: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  },
  {
    id: "news-generator",
    title: "試合速報ジェネレータ",
    shortTitle: "速報生成",
    subtitle: "スコア連携不要・簡易入力でLINE速報テキストを作成",
    href: "/liff/tools/news-generator",
    statusLabel: "準備中",
    statusTone: "rose",
    icon: Megaphone,
    iconColorClass: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  },
  {
    id: "cheer-songs",
    title: "応援歌あんちょこ",
    shortTitle: "応援歌",
    subtitle: "選手名を自動差し込んだ応援歌・コール歌詞を表示",
    href: "/liff/tools/cheer-songs",
    statusLabel: "準備中",
    statusTone: "orange",
    icon: Music,
    iconColorClass: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  },
  {
    id: "carpool-generator",
    title: "配車ジェネレータ",
    shortTitle: "配車生成",
    subtitle: "配車係の作業を軽減する乗車割り支援（新規検討・要MTG）",
    href: "/liff/tools/carpool-generator",
    statusLabel: "要MTG・検討中",
    statusTone: "emerald",
    icon: Wand2,
    iconColorClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
];

export function LiffToolSubNav() {
  const pathname = usePathname();

  return (
    <div className="grid grid-cols-4 gap-1.5 p-1 rounded-2xl bg-card border border-border shadow-2xs">
      {LIFF_TOOLS.map((tool) => {
        const Icon = tool.icon;
        const isActive = pathname === tool.href;

        return (
          <Link
            key={tool.id}
            href={tool.href}
            className={`flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl text-center transition-all active:scale-95 ${
              isActive
                ? "bg-primary text-primary-foreground shadow-xs font-black"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60 font-bold"
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
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
    <section className="rounded-3xl bg-card border border-border shadow-xs p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Wrench className="w-4 h-4" />
          </span>
          <div>
            <h2 className="text-xs font-black text-foreground">その他の開発予定ツール</h2>
            <p className="text-[10px] font-bold text-muted-foreground">
              タップして各ツールの構成枠を確認できます
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {otherTools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link
              key={tool.id}
              href={tool.href}
              className="flex items-center gap-3 p-3 rounded-2xl bg-muted/40 hover:bg-muted/80 border border-border/70 transition-all active:scale-98 group"
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
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black bg-background border border-border text-muted-foreground shrink-0">
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

