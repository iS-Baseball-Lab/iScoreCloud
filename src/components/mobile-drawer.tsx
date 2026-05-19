// src/components/mobile-drawer.tsx
"use client";

import React from "react";
/**
 * 💡 モバイルドロワー (機能完全統合版)
 * 1. 意匠: 背景を bg-background/95 に設定し、backdrop-blur-3xl で強力なガラスの質感を表現。
 * 2. 構成: 
 * - 上部: アプリロゴと閉じるボタン。
 * - 外観設定: テーマ (ライト/ダーク) と アクセントカラー を親指で簡単に切り替え可能。
 * - ナビゲーション: 試合記録や大会管理などの主要機能への動線。
 * - 下部: ユーザー情報と、安全に退出するための「ログアウト」ボタン。
 */
import {
  X,
  History,
  PlusSquare,
  UserCheck,
  Settings,
  ChevronRight,
  LogOut,
  User,
  Palette
} from "lucide-react";
import { MobileDrawerProps } from "@/types/navigation";
import { ThemeToggle } from "./layout/theme-toggle";
import { ThemeSwitcher } from "./layout/theme-switcher";

// 💡 既存の MobileDrawerProps に onLogout を追加拡張
interface ExtendedMobileDrawerProps extends MobileDrawerProps {
  onLogout?: () => void;
}

export function MobileDrawer({ isOpen, onClose, onNavigate, onLogout }: ExtendedMobileDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] md:hidden bg-background/95 backdrop-blur-3xl animate-in fade-in zoom-in-95 duration-300">
      <div className="p-6 flex flex-col h-full max-w-lg mx-auto">

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            1. ヘッダー (タイトル & 閉じる)
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="flex justify-between items-center mb-8 border-b border-border/40 pb-6">
          <div className="flex flex-col">
            <h2 className="text-3xl font-black italic uppercase tracking-tighter text-foreground leading-none">
              iScore
            </h2>
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest opacity-60 mt-1">
              Management Hub
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-3 bg-muted/50 hover:bg-muted/80 rounded-full active:scale-90 transition-all border border-border/40 shadow-none"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            2. スクロール領域 (設定 & メニュー)
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="space-y-8 overflow-y-auto scrollbar-hide flex-1 pb-10">

          {/* 🌗 外観設定 (Appearance) */}
          <div className="space-y-4 px-2">
            <p className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-[0.2em] px-2 flex items-center gap-2">
              App Appearance
            </p>
            <div className="space-y-4 bg-muted/5 p-4 rounded-[32px] border border-border/20">
              {/* ライト/ダーク切り替え */}
              <ThemeToggle variant="segmented" />

              <div className="space-y-2 pt-2 border-t border-border/10">
                <div className="flex items-center gap-2 px-2 text-muted-foreground/40 mb-3">
                  <Palette className="h-3 w-3" />
                  <span className="text-[9px] font-black uppercase tracking-widest">Team Accent Color</span>
                </div>
                {/* チームカラー切り替え */}
                <ThemeSwitcher variant="grid" />
              </div>
            </div>
          </div>

          {/* 📊 メインアクション (アーカイブ) */}
          <div className="space-y-3">
            <p className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-[0.2em] px-4">Match Archives</p>
            <button
              onClick={() => onNavigate('/matches/history')}
              className="flex items-center gap-5 w-full p-4 rounded-[32px] bg-card/20 border border-border/40 hover:bg-card/40 active:scale-95 transition-all group shadow-none"
            >
              <div className="p-3 rounded-2xl bg-muted/50 text-muted-foreground border border-border/30 group-hover:text-primary group-hover:bg-primary/10 transition-colors">
                <History className="h-6 w-6" />
              </div>
              <p className="text-lg font-black tracking-tight">試合記録</p>
              <ChevronRight className="h-5 w-5 ml-auto text-muted-foreground/30 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {/* ⚙️ 管理セクション (Administration) */}
          <div className="space-y-3">
            <p className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-[0.2em] px-4">Administration</p>
            <div className="grid grid-cols-1 gap-2">
              {[
                { name: "大会管理", href: "/tournaments", icon: PlusSquare },
                { name: "参加申請", href: "/teams/requests", icon: UserCheck },
                { name: "設定", href: "/settings", icon: Settings },
              ].map((item) => (
                <button
                  key={item.href}
                  onClick={() => onNavigate(item.href)}
                  className="flex items-center gap-5 w-full p-4 rounded-[32px] bg-card/20 border border-border/40 hover:bg-card/40 active:scale-95 transition-all group shadow-none"
                >
                  <div className="p-3 rounded-2xl bg-muted/50 text-muted-foreground border border-border/30 group-hover:text-primary group-hover:bg-primary/10 transition-colors">
                    <item.icon className="h-6 w-6" />
                  </div>
                  <p className="text-lg font-black tracking-tight">{item.name}</p>
                  <ChevronRight className="h-5 w-5 ml-auto text-muted-foreground/30 group-hover:translate-x-1 transition-transform" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            3. フッター (アカウント & ログアウト)
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="mt-auto py-8 border-t border-border/40">
          <div className="flex items-center gap-3 w-full p-3 rounded-[32px] bg-muted/20 border border-border/20">
            {/* アバター */}
            <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30 text-primary shrink-0">
              <User className="h-6 w-6" />
            </div>

            {/* ユーザー情報 */}
            <div className="flex-1 overflow-hidden">
              <p className="font-black text-foreground italic leading-none truncate">山田 監督</p>
              <p className="text-[10px] font-bold text-muted-foreground uppercase mt-1">Administrator</p>
            </div>

            {/* 🚪 ログアウトボタン */}
            <button
              onClick={onLogout}
              className="p-4 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-full transition-all active:scale-90 group"
              aria-label="ログアウト"
            >
              <LogOut className="h-5 w-5 group-hover:rotate-12 transition-transform" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
