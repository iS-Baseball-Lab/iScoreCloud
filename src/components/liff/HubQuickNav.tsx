// filepath: src/components/liff/HubQuickNav.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { LayoutGrid, SlidersHorizontal, Plus } from "lucide-react";
import { EmptyState } from "@/components/layout/EmptyState";
import {
  LIFF_QUICK_MENU_CHANGE_EVENT,
  LIFF_QUICK_MENU_STORAGE_KEY,
  getDefaultQuickMenuConfig,
  getQuickMenuItemToneStyle,
  getSavedQuickMenuConfig,
  resolveQuickMenuItems,
  type QuickMenuConfig,
} from "@/lib/liff/quick-menu-settings";

export function HubQuickNav() {
  const [config, setConfig] = useState<QuickMenuConfig>(() =>
    getDefaultQuickMenuConfig(),
  );

  useEffect(() => {
    const sync = () => {
      setConfig(getSavedQuickMenuConfig());
    };
    sync();

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === LIFF_QUICK_MENU_STORAGE_KEY) {
        sync();
      }
    };

    window.addEventListener(LIFF_QUICK_MENU_CHANGE_EVENT, sync);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(LIFF_QUICK_MENU_CHANGE_EVENT, sync);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const items = useMemo(
    () => resolveQuickMenuItems(config.itemIds),
    [config.itemIds],
  );

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-black text-foreground flex items-center gap-1.5">
          <LayoutGrid className="w-3.5 h-3.5 text-primary" />
          <span>クイックメニュー</span>
        </h3>

        <Link
          href="/liff/settings#quick-menu"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-card border border-border/60 text-[10.5px] font-black text-muted-foreground hover:text-primary hover:border-primary/40 active:scale-95 transition-all shadow-xs"
        >
          <SlidersHorizontal className="w-3 h-3 text-primary" />
          <span>メニュー設定</span>
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="space-y-2.5">
          <EmptyState
            icon={LayoutGrid}
            title="クイックメニューが未設定です"
            description="QUICK MENU EMPTY"
            className="p-6"
          />
          <Link
            href="/liff/settings#quick-menu"
            className="w-full py-2.5 px-4 rounded-2xl bg-primary text-primary-foreground font-black text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>アプリ設定でメニューを追加する</span>
          </Link>
        </div>
      ) : config.layout === "compact" ? (
        <div className="grid grid-cols-3 gap-2.5">
          {items.map((item) => {
            const Icon = item.icon;
            const tone = getQuickMenuItemToneStyle(item);
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex flex-col items-center justify-center text-center p-3 rounded-2xl border border-border/60 bg-card shadow-xs ${tone.hoverBorderClass} transition-all active:scale-[0.98] group gap-1.5`}
              >
                <span
                  className={`w-10 h-10 rounded-xl ${tone.iconBoxClass} flex items-center justify-center font-black shadow-2xs`}
                >
                  <Icon className="w-5 h-5 group-hover:scale-110 transition-transform" />
                </span>
                <div className="space-y-0.5 min-w-0 w-full">
                  <h4 className="text-xs font-black text-foreground tracking-tight truncate">
                    {item.shortLabel}
                  </h4>
                  <span
                    className={`inline-block text-[9.5px] font-black px-1.5 py-0.2 rounded-full ${tone.badgeClass} font-mono`}
                  >
                    {item.badge}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : config.layout === "slim" ? (
        <div className="grid grid-cols-2 gap-2.5">
          {items.map((item) => {
            const Icon = item.icon;
            const tone = getQuickMenuItemToneStyle(item);
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center gap-2.5 p-3 rounded-2xl border border-border/60 bg-card shadow-xs ${tone.hoverBorderClass} transition-all active:scale-[0.98] group`}
              >
                <span
                  className={`w-9 h-9 rounded-xl ${tone.iconBoxClass} flex items-center justify-center font-black shrink-0 shadow-2xs`}
                >
                  <Icon className="w-4.5 h-4.5 group-hover:scale-110 transition-transform" />
                </span>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-black text-foreground tracking-tight truncate">
                    {item.label}
                  </h4>
                  <p className="text-[10px] font-bold text-muted-foreground truncate mt-0.5">
                    {item.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {items.map((item) => {
            const Icon = item.icon;
            const tone = getQuickMenuItemToneStyle(item);
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex flex-col justify-between p-4 rounded-2xl border border-border/60 bg-card shadow-xs ${tone.hoverBorderClass} transition-all active:scale-[0.98] group`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`w-10 h-10 rounded-xl ${tone.iconBoxClass} flex items-center justify-center font-black shadow-2xs`}
                  >
                    <Icon className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  </span>
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-full ${tone.badgeClass} font-mono`}
                  >
                    {item.badge}
                  </span>
                </div>
                <div className="mt-3.5 space-y-0.5">
                  <h4 className="text-base font-black text-foreground tracking-tight">
                    {item.label}
                  </h4>
                  <p className="text-xs font-bold text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
