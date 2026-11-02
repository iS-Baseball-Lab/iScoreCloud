// filepath: src/components/liff/QuickMenuSettingsSection.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ExternalLink,
  LayoutGrid,
  Plus,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/layout/EmptyState";
import {
  LIFF_QUICK_MENU_CHANGE_EVENT,
  LIFF_QUICK_MENU_STORAGE_KEY,
  QUICK_MENU_CATALOG,
  QUICK_MENU_CATEGORIES,
  QUICK_MENU_LAYOUT_OPTIONS,
  QUICK_MENU_PRESETS,
  getDefaultQuickMenuConfig,
  getSavedQuickMenuConfig,
  isDefaultQuickMenuConfig,
  resetQuickMenuConfig,
  resolveQuickMenuItems,
  saveQuickMenuConfig,
  type QuickMenuCategoryId,
  type QuickMenuConfig,
  type QuickMenuItemDef,
  type QuickMenuItemId,
  type QuickMenuLayoutMode,
} from "@/lib/liff/quick-menu-settings";

export function QuickMenuSettingsSection() {
  const [config, setConfig] = useState<QuickMenuConfig>(() =>
    getDefaultQuickMenuConfig(),
  );
  const [activeCategory, setActiveCategory] =
    useState<QuickMenuCategoryId>("match_team");

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

  const selectedItems = useMemo(
    () => resolveQuickMenuItems(config.itemIds),
    [config.itemIds],
  );

  const selectedIdSet = useMemo(
    () => new Set<QuickMenuItemId>(config.itemIds),
    [config.itemIds],
  );

  const categoryItems = useMemo(
    () => QUICK_MENU_CATALOG.filter((item) => item.category === activeCategory),
    [activeCategory],
  );

  const isDefault = useMemo(() => isDefaultQuickMenuConfig(config), [config]);

  const applyAndSave = (next: QuickMenuConfig) => {
    setConfig(next);
    saveQuickMenuConfig(next);
  };

  const handleLayoutChange = (layout: QuickMenuLayoutMode, label: string) => {
    applyAndSave({ ...config, layout });
    toast.success(`クイックメニューを「${label}」に変更しました`);
  };

  const handleApplyPreset = (
    itemIds: readonly QuickMenuItemId[],
    label: string,
  ) => {
    applyAndSave({ ...config, itemIds: [...itemIds] });
    toast.success(`プリセット「${label}」を反映しました`);
  };

  const handleMoveItem = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= config.itemIds.length) return;
    const nextIds = [...config.itemIds];
    const [moved] = nextIds.splice(index, 1);
    if (!moved) return;
    nextIds.splice(targetIndex, 0, moved);
    applyAndSave({ ...config, itemIds: nextIds });
  };

  const handleRemoveItem = (item: QuickMenuItemDef) => {
    const nextIds = config.itemIds.filter((id) => id !== item.id);
    applyAndSave({ ...config, itemIds: nextIds });
    toast.success(`「${item.label}」をクイックメニューから外しました`);
  };

  const handleToggleItem = (item: QuickMenuItemDef) => {
    if (selectedIdSet.has(item.id)) {
      handleRemoveItem(item);
    } else {
      const nextIds = [...config.itemIds, item.id];
      applyAndSave({ ...config, itemIds: nextIds });
      toast.success(`「${item.label}」をクイックメニューに追加しました`);
    }
  };

  const handleReset = () => {
    const defaults = resetQuickMenuConfig();
    setConfig(defaults);
    toast.success("クイックメニューを初期設定に戻しました");
  };

  return (
    <section
      id="quick-menu"
      className="scroll-mt-20 rounded-2xl border border-border/60 bg-card shadow-xs p-4 space-y-4"
    >
      {/* ヘッダー */}
      <div className="space-y-1.5 pb-2.5 border-b border-border/60">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <LayoutGrid className="w-4 h-4 text-primary shrink-0" />
            <h2 className="text-sm font-black text-foreground truncate">
              クイックメニュー設定
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-black shrink-0 font-mono">
              {selectedItems.length}件表示中
            </span>
          </div>

          {!isDefault && (
            <button
              type="button"
              onClick={handleReset}
              className="py-1 px-2.5 rounded-full bg-card hover:bg-muted active:scale-95 border border-border/60 text-[10px] font-black text-muted-foreground hover:text-foreground transition-all flex items-center gap-1 shrink-0"
            >
              <RotateCcw className="w-3 h-3" />
              <span>初期設定に戻す</span>
            </button>
          )}
        </div>
        <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
          トップページの「クイックメニュー」に並べる機能と表示順をカスタマイズできます。
        </p>
      </div>

      {/* 1. 表示レイアウト */}
      <div className="space-y-1.5">
        <label className="text-xs font-black text-foreground block">
          表示レイアウト
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {QUICK_MENU_LAYOUT_OPTIONS.map((opt) => {
            const isActive = config.layout === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleLayoutChange(opt.id, opt.label)}
                className={`flex flex-col items-center justify-center py-2.5 px-1.5 rounded-2xl border transition-all active:scale-95 gap-0.5 ${
                  isActive
                    ? "bg-primary text-primary-foreground border-primary shadow-xs font-black"
                    : "bg-muted/50 border-border/60 text-muted-foreground hover:text-foreground font-bold"
                }`}
              >
                <span className="text-xs leading-tight">{opt.label}</span>
                <span
                  className={`text-[9.5px] leading-tight ${
                    isActive
                      ? "text-primary-foreground/85"
                      : "text-muted-foreground"
                  }`}
                >
                  {opt.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. おすすめプリセット */}
      <div className="space-y-1.5">
        <label className="text-xs font-black text-foreground flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span>おすすめプリセット（1タップ反映）</span>
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {QUICK_MENU_PRESETS.map((preset) => {
            const isMatchingPreset =
              config.itemIds.length === preset.itemIds.length &&
              config.itemIds.every((id, idx) => id === preset.itemIds[idx]);

            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyPreset(preset.itemIds, preset.label)}
                className={`flex flex-col items-start justify-between p-2.5 rounded-2xl border text-left transition-all active:scale-95 gap-1 ${
                  isMatchingPreset
                    ? "border-primary bg-primary/10 text-primary font-black shadow-2xs"
                    : "bg-card border-border/60 hover:border-primary/40 text-foreground font-bold"
                }`}
              >
                <div className="flex items-center justify-between w-full gap-1">
                  <span className="text-[11px] font-black leading-tight truncate">
                    {preset.label}
                  </span>
                  {isMatchingPreset && (
                    <Check className="w-3.5 h-3.5 text-primary shrink-0 stroke-[3]" />
                  )}
                </div>
                <span className="text-[9.5px] font-bold text-muted-foreground leading-snug line-clamp-2">
                  {preset.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. 現在選択中のメニュー & 並び替え */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-black text-foreground">
            現在の表示順・並び替え
          </label>
          <span className="text-[10px] font-bold text-muted-foreground">
            ↑↓で順番変更・×で解除
          </span>
        </div>

        {selectedItems.length === 0 ? (
          <EmptyState
            icon={LayoutGrid}
            title="選択中のメニューがありません"
            description="NO QUICK MENU ITEMS"
            className="p-6"
          />
        ) : (
          <div className="space-y-1.5">
            {selectedItems.map((item, idx) => {
              const Icon = item.icon;
              const isFirst = idx === 0;
              const isLast = idx === selectedItems.length - 1;

              return (
                <div
                  key={item.id}
                  className="flex items-center gap-2.5 p-2.5 rounded-2xl bg-muted/35 border border-border/60"
                >
                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-black flex items-center justify-center shrink-0 font-mono">
                    {idx + 1}
                  </span>

                  <span className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-foreground truncate">
                      {item.label}
                    </p>
                    <p className="text-[10px] font-bold text-muted-foreground truncate">
                      {item.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={isFirst}
                      onClick={() => handleMoveItem(idx, -1)}
                      aria-label={`${item.label}を上へ移動`}
                      className="w-8 h-8 rounded-xl border border-border/60 bg-card hover:bg-muted text-foreground flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none active:scale-90 transition-all"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={isLast}
                      onClick={() => handleMoveItem(idx, 1)}
                      aria-label={`${item.label}を下へ移動`}
                      className="w-8 h-8 rounded-xl border border-border/60 bg-card hover:bg-muted text-foreground flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none active:scale-90 transition-all"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item)}
                      aria-label={`${item.label}を非表示にする`}
                      className="w-8 h-8 rounded-xl border border-destructive/30 bg-destructive/10 hover:bg-destructive/20 text-destructive flex items-center justify-center active:scale-90 transition-all"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. カテゴリ別メニュー追加・ON/OFF切替 */}
      <div className="space-y-2.5 pt-2 border-t border-border/60">
        <div className="flex items-center justify-between">
          <label className="text-xs font-black text-foreground">
            メニューの追加・ON/OFF切替
          </label>
          <span className="text-[10px] font-bold text-muted-foreground">
            タップで表示 / 非表示
          </span>
        </div>

        {/* カテゴリ切替タブ */}
        <div className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-muted/50 border border-border/60">
          {QUICK_MENU_CATEGORIES.map((cat) => {
            const isTabActive = activeCategory === cat.id;
            const enabledInCat = QUICK_MENU_CATALOG.filter(
              (i) => i.category === cat.id && selectedIdSet.has(i.id),
            ).length;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl text-[11px] transition-all active:scale-95 gap-0.5 ${
                  isTabActive
                    ? "bg-primary text-primary-foreground shadow-xs font-black"
                    : "text-muted-foreground hover:text-foreground font-bold"
                }`}
              >
                <span className="truncate max-w-full leading-tight">
                  {cat.label}
                </span>
                <span
                  className={`text-[9px] font-mono leading-none px-1.5 py-0.5 rounded-full ${
                    isTabActive
                      ? "bg-primary-foreground/20 text-primary-foreground font-black"
                      : enabledInCat > 0
                        ? "bg-primary/10 text-primary font-black"
                        : "bg-card text-muted-foreground font-bold"
                  }`}
                >
                  {enabledInCat}件ON
                </span>
              </button>
            );
          })}
        </div>

        {/* カテゴリアイテム一覧 */}
        <div className="grid grid-cols-2 gap-2">
          {categoryItems.map((item) => {
            const Icon = item.icon;
            const isSelected = selectedIdSet.has(item.id);
            const orderIdx = config.itemIds.indexOf(item.id);

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleToggleItem(item)}
                className={`flex items-center gap-2.5 p-2.5 rounded-2xl border text-left transition-all active:scale-95 ${
                  isSelected
                    ? "border-primary bg-primary/10 text-primary shadow-2xs"
                    : "bg-card border-border/60 hover:border-primary/40"
                }`}
              >
                <span
                  className={`w-8 h-8 rounded-xl ${
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-primary/10 text-primary"
                  } flex items-center justify-center shrink-0`}
                >
                  <Icon className="w-4 h-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-foreground truncate">
                    {item.label}
                  </p>
                  <p className="text-[10px] font-bold text-muted-foreground truncate">
                    {isSelected && orderIdx >= 0
                      ? `${orderIdx + 1}番目に表示中`
                      : item.description}
                  </p>
                </div>

                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50 border border-border/60 text-muted-foreground"
                  }`}
                >
                  {isSelected ? (
                    <Check className="w-3 h-3 stroke-[3]" />
                  ) : (
                    <Plus className="w-3 h-3" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* トップページプレビュー導線 */}
      <div className="pt-1">
        <Link
          href="/liff"
          className="w-full py-2.5 px-4 rounded-2xl bg-card hover:bg-muted border border-border/60 hover:border-primary/40 text-xs font-black text-foreground flex items-center justify-center gap-1.5 active:scale-[0.99] transition-all"
        >
          <span>トップページでクイックメニューを確認する</span>
          <ExternalLink className="w-3.5 h-3.5 text-primary" />
        </Link>
      </div>
    </section>
  );
}

