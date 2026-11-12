// filepath: src/components/liff/AdminMgmtShell.tsx
"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  Bus,
  KeyRound,
  Loader2,
  Lock,
  Package,
  RefreshCw,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { warmupLiffEndpointForHref } from "@/lib/liff/api-cache";
import { navigateToLiffRoot } from "@/lib/liff/navigation";

export interface AdminNavItem {
  id: string;
  label: string;
  shortLabel: string;
  href: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const ADMIN_MGMT_NAV_ITEMS: ReadonlyArray<AdminNavItem> = [
  {
    id: "hub",
    label: "参加承認・LINE招待",
    shortLabel: "承認・招待",
    href: "/liff/admin",
    desc: "参加リクエスト承認・メンバー統合・招待コード共有",
    icon: ShieldCheck,
  },
  {
    id: "teams",
    label: "チーム・編成管理",
    shortLabel: "チーム管理",
    href: "/liff/admin/teams",
    desc: "クラブ基本情報・A/B編成の追加・新クラブ立ち上げ",
    icon: Building2,
  },
  {
    id: "cars",
    label: "車両・バス管理",
    shortLabel: "車管理",
    href: "/liff/admin/cars",
    desc: "マイクロバス・共有道具車・保護者車両の一元登録",
    icon: Bus,
  },
  {
    id: "roles",
    label: "権限・役職管理",
    shortLabel: "権限管理",
    href: "/liff/admin/roles",
    desc: "監督・IT管理・兼務ロール割当・役職名のカスタム",
    icon: KeyRound,
  },
  {
    id: "family",
    label: "家族・当番班管理",
    shortLabel: "家族・当番班",
    href: "/liff/admin/family",
    desc: "親子・兄弟の紐付け漏れ確認・当番班の一括割当",
    icon: Users,
  },
  {
    id: "tournaments",
    label: "大会・リーグ管理",
    shortLabel: "大会管理",
    href: "/liff/admin/tournaments",
    desc: "公式戦・リーグ戦マスタ・大会規定の登録",
    icon: Trophy,
  },
  {
    id: "equipments",
    label: "道具・備品管理",
    shortLabel: "道具管理",
    href: "/liff/admin/equipments",
    desc: "防具・テント・ラインカー等の共通備品マスタ",
    icon: Package,
  },
];

interface AdminMgmtShellProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  isLoading: boolean;
  hasData: boolean;
  canManage: boolean;
  isDemo?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}

export function AdminMgmtShell({
  title,
  subtitle,
  icon,
  isLoading,
  hasData,
  canManage,
  isDemo,
  onRefresh,
  isRefreshing,
  headerRight,
  children,
}: AdminMgmtShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="p-4 space-y-3.5">
        <LiffPageHeader
          title={title}
          subtitle={subtitle}
          icon={icon}
          showBack
          rightElement={
            <div className="flex items-center gap-1.5">
              {headerRight}
              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={isRefreshing || isLoading}
                  title="最新データを再読み込み"
                  aria-label="最新データを再読み込み"
                  className="p-2 rounded-2xl bg-card border border-border text-foreground hover:bg-muted active:scale-95 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
                  />
                </button>
              )}
            </div>
          }
        />

        {/* 7つの管理メニュー横断クイックスイッチャー */}
        <nav
          aria-label="管理メニュー切替"
          className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1"
        >
          {ADMIN_MGMT_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/liff/admin"
                ? pathname === "/liff/admin"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.id}
                href={item.href}
                onPointerDown={() => warmupLiffEndpointForHref(item.href)}
                className={`h-8 px-2.5 rounded-xl border text-xs flex items-center gap-1.5 shrink-0 transition-colors ${
                  isActive
                    ? "bg-[#0f172a] text-white border-[#0f172a] font-black shadow-xs"
                    : "bg-card text-foreground border-border hover:bg-muted font-bold"
                }`}
              >
                <Icon
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isActive ? "text-teal-400" : "text-muted-foreground"
                  }`}
                />
                <span>{item.shortLabel}</span>
              </Link>
            );
          })}
        </nav>

        {isDemo && (
          <div className="px-3.5 py-2 rounded-xl border border-amber-500/40 bg-amber-500/12 text-amber-900 dark:text-amber-200 text-[11px] font-bold flex items-center justify-between gap-2">
            <span>
              🎮 デモモード表示中です（画面操作をお試しいただけます。実際のDB保存は自チーム切替後に行われます）
            </span>
          </div>
        )}

        {isLoading && !hasData ? (
          <div className="py-16 rounded-2xl border border-border bg-card flex flex-col items-center justify-center gap-2.5 text-muted-foreground shadow-xs">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs font-bold">管理データを読み込み中...</span>
          </div>
        ) : !canManage ? (
          <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
            <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-rose-500 flex items-center gap-2">
              <Lock className="w-4 h-4 text-rose-400 shrink-0" />
              <h2 className="text-sm font-black text-white">
                管理者専用メニュー
              </h2>
            </div>
            <div className="p-5 space-y-3 text-center">
              <p className="text-xs font-bold text-foreground leading-relaxed">
                この画面はチームの{" "}
                <span className="font-black text-primary">
                  監督・代表（manager）
                </span>{" "}
                または{" "}
                <span className="font-black text-primary">
                  IT管理者（admin）
                </span>{" "}
                権限をお持ちのメンバーのみ操作できます。
              </p>
              <p className="text-[11px] font-bold text-muted-foreground">
                権限の付与が必要な場合は、現在の監督・代表またはIT管理者へご依頼ください。
              </p>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => navigateToLiffRoot(router, pathname)}
                  className="h-10 px-5 rounded-xl bg-primary text-primary-foreground text-xs font-black cursor-pointer"
                >
                  ホームへ戻る
                </button>
              </div>
            </div>
          </section>
        ) : (
          children
        )}
      </div>

      {/* LIFF 共通最下部スペーサー */}
      <div
        className="h-8 w-full shrink-0 pointer-events-none select-none"
        aria-hidden="true"
      />
    </div>
  );
}
