// src/components/sidebar.tsx
"use client";

import React from "react";
/**
 * 💡 究極のサイドバー・コンポーネント
 * 1. 役割: PC版のメインナビゲーション、チーム切り替え、ユーザー設定へのアクセスを提供。
 * 2. 意匠: 
 * - 影を一切使わず、境界線 (border-border/40) と透過 (bg-background/40) で質感を表現。
 * - 強力なブラー (backdrop-blur-3xl) により、背後の Stadium Sync 背景を美しく透過。
 * 3. 機能: 
 * - チームスイッチャー：所属チームと役割を一目で確認可能。
 * - コラップス（折りたたみ）：画面スペースを有効活用するための開閉機能。
 * - ログアウト：セッションを終了しゲート（ログイン画面）へ戻る導線。
 */
import Link from "next/link";
import {
  ChevronDown,
  LogOut,
  Menu,
  ChevronLeft,
  Shield
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NavItem, SidebarProps } from "@/types/navigation";
import { Badge } from "@/components/ui/badge";

export function Sidebar({
  session,
  pathname,
  isCollapsed,
  toggleSidebar,
  mainNavItems,
  bottomNavItems,
  onLogout
}: SidebarProps) {

  // 💡 チーム情報のモック（実際には session.memberships などから取得）
  const currentTeam = {
    name: "Prime Bears",
    roleLabel: "監督",
    logo: "/logo.webp"
  };

  /**
   * 💡 ナビゲーションリンク・サブコンポーネント
   */
  const NavLink = ({ item }: { item: NavItem }) => {
    // 現在のパスと一致するか判定（完全一致または前方一致）
    const isActive = pathname === item.href || (item.exact === false && pathname.startsWith(item.href));
    const Icon = item.icon;

    return (
      <Link
        href={item.href}
        className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 group relative",
          isActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        )}
      >
        <Icon className={cn(
          "h-5 w-5 shrink-0 transition-transform duration-300",
          isActive && "stroke-[2.5px]",
          !isActive && "group-hover:scale-110"
        )} />

        {!isCollapsed && (
          <span className="text-sm font-black italic tracking-tight uppercase animate-in fade-in duration-500">
            {item.name}
          </span>
        )}

        {/* 🚀 アクティブ時のインジケーター（垂直ライン） */}
        {isActive && (
          <div className="absolute left-0 w-1 h-6 bg-primary rounded-r-full animate-in slide-in-from-left-full duration-300" />
        )}

        {/* 通知バッジ（存在する場合） */}
        {item.badge && !isCollapsed && (
          <span className="ml-auto bg-primary text-primary-foreground text-[10px] font-black px-1.5 py-0.5 rounded-md tabular-nums shadow-sm">
            {item.badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside className={cn(
      "fixed left-0 top-0 h-screen z-50 bg-background/40 backdrop-blur-3xl border-r border-border/40 transition-all duration-500 ease-in-out hidden md:flex flex-col shadow-none",
      isCollapsed ? "w-20" : "w-64"
    )}>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          1. チームスイッチャーエリア
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="p-4 border-b border-border/40">
        <button className={cn(
          "w-full flex items-center gap-3 p-2 rounded-2xl hover:bg-muted/30 transition-all active:scale-95 group border border-transparent hover:border-border/40",
          isCollapsed && "justify-center"
        )}>
          {/* チームロゴ */}
          <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 shadow-inner overflow-hidden">
            <img src={currentTeam.logo} alt="Team Logo" className="h-6 w-6 object-contain" />
          </div>

          {/* チーム名とロール（展開時のみ） */}
          {!isCollapsed && (
            <div className="flex-1 text-left overflow-hidden animate-in fade-in duration-500">
              <p className="text-sm font-black italic text-foreground truncate uppercase leading-none tracking-tighter">
                {currentTeam.name}
              </p>
              <div className="flex items-center gap-1.5 mt-1.5">
                <Badge variant="outline" className="text-[8px] px-1.5 py-0 rounded-md border-primary/30 text-primary bg-primary/5 font-black uppercase tracking-widest leading-none">
                  {currentTeam.roleLabel}
                </Badge>
              </div>
            </div>
          )}

          {!isCollapsed && (
            <ChevronDown className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
          )}
        </button>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          2. メインナビゲーション
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <nav className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto scrollbar-hide">
        <p className={cn(
          "text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.3em] mb-4 px-4",
          isCollapsed && "text-center px-0"
        )}>
          {isCollapsed ? "•" : "Operational Menu"}
        </p>

        {mainNavItems.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </nav>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          3. フッターエリア（設定・ログアウト・開閉）
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="px-3 py-6 border-t border-border/40 space-y-1.5 bg-muted/5">

        {/* 下部ナビゲーション（設定など） */}
        {bottomNavItems.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}

        {/* 🚪 ログアウトボタン */}
        <button
          onClick={onLogout}
          className={cn(
            "flex items-center gap-3 w-full px-4 py-3 rounded-2xl text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-all group active:scale-95 shadow-none border-none",
            isCollapsed && "justify-center"
          )}
        >
          <LogOut className="h-5 w-5 shrink-0 group-hover:rotate-12 transition-transform" />
          {!isCollapsed && (
            <span className="text-sm font-black italic uppercase tracking-tight">Logout</span>
          )}
        </button>

        {/* コラップス（折りたたみ）制御ボタン */}
        <button
          onClick={toggleSidebar}
          className="w-full flex items-center justify-center pt-6 opacity-20 hover:opacity-100 transition-opacity"
        >
          <div className="h-8 w-8 rounded-full border border-border/40 flex items-center justify-center bg-background/40">
            {isCollapsed ? (
              <Menu className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </div>
        </button>

        {/* ブランド表示（展開時のみ） */}
        {!isCollapsed && (
          <div className="pt-4 text-center">
            <p className="text-[8px] font-black text-muted-foreground uppercase tracking-[0.4em] opacity-30">
              iScore OS v2.5
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
