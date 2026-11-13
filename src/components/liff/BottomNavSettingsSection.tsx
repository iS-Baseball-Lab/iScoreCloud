// filepath: src/components/liff/BottomNavSettingsSection.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  ArrowLeftRight,
  Check,
  Home,
  Lock,
  Menu,
  PanelBottom,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  QUICK_MENU_CATALOG,
  QUICK_MENU_CATEGORIES,
  getQuickMenuItemToneStyle,
  type QuickMenuCategoryId,
  type QuickMenuItemDef,
  type QuickMenuItemId,
} from "@/lib/liff/quick-menu-settings";
import {
  BOTTOM_NAV_PRESETS,
  BOTTOM_NAV_STYLE_OPTIONS,
  DEFAULT_BOTTOM_NAV_CONFIG,
  LIFF_BOTTOM_NAV_CHANGE_EVENT,
  LIFF_BOTTOM_NAV_STORAGE_KEY,
  getBottomNavLabel,
  getDefaultBottomNavConfig,
  getSavedBottomNavConfig,
  isDefaultBottomNavConfig,
  resetBottomNavConfig,
  resolveBottomNavSlotItem,
  saveBottomNavConfig,
  type BottomNavConfig,
  type BottomNavPreset,
  type BottomNavSlotKey,
  type BottomNavStyleMode,
} from "@/lib/liff/bottom-nav-settings";

const SLOT_LABELS: Record<BottomNavSlotKey, string> = {
  left: "② 左スロット",
  center: "③ 中央ボタン",
  right: "④ 右スロット",
};

const SLOT_SHORT_BADGES: Record<BottomNavSlotKey, string> = {
  left: "② 左",
  center: "③ 中央",
  right: "④ 右",
};

export function BottomNavSettingsSection() {
  const [config, setConfig] = useState<BottomNavConfig>(() =>
    getDefaultBottomNavConfig()
  );
  const [editingSlot, setEditingSlot] = useState<BottomNavSlotKey>("center");
  const [activeCategory, setActiveCategory] =
    useState<QuickMenuCategoryId>("schedule_match");

  useEffect(() => {
    const sync = () => {
      setConfig(getSavedBottomNavConfig());
    };
    sync();

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === LIFF_BOTTOM_NAV_STORAGE_KEY) {
        sync();
      }
    };

    window.addEventListener(LIFF_BOTTOM_NAV_CHANGE_EVENT, sync);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(LIFF_BOTTOM_NAV_CHANGE_EVENT, sync);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const leftItem = useMemo(
    () => resolveBottomNavSlotItem(config.leftId, DEFAULT_BOTTOM_NAV_CONFIG.leftId),
    [config.leftId]
  );
  const centerItem = useMemo(
    () =>
      resolveBottomNavSlotItem(
        config.centerId,
        DEFAULT_BOTTOM_NAV_CONFIG.centerId
      ),
    [config.centerId]
  );
  const rightItem = useMemo(
    () =>
      resolveBottomNavSlotItem(
        config.rightId,
        DEFAULT_BOTTOM_NAV_CONFIG.rightId
      ),
    [config.rightId]
  );

  const isDefault = useMemo(() => isDefaultBottomNavConfig(config), [config]);

  const categoryItems = useMemo(
    () => QUICK_MENU_CATALOG.filter((item) => item.category === activeCategory),
    [activeCategory]
  );

  const slotByItemId = useMemo(() => {
    const map = new Map<QuickMenuItemId, BottomNavSlotKey>();
    map.set(config.leftId, "left");
    map.set(config.centerId, "center");
    map.set(config.rightId, "right");
    return map;
  }, [config.leftId, config.centerId, config.rightId]);

  const applyAndSave = (next: BottomNavConfig) => {
    const normalized = saveBottomNavConfig(next);
    setConfig(normalized);
  };

  const handleSelectSlot = (slot: BottomNavSlotKey, item: QuickMenuItemDef) => {
    setEditingSlot(slot);
    setActiveCategory(item.category);
  };

  const handleAssignItemToEditingSlot = (item: QuickMenuItemDef) => {
    const currentIdInTarget =
      editingSlot === "left"
        ? config.leftId
        : editingSlot === "center"
        ? config.centerId
        : config.rightId;

    if (currentIdInTarget === item.id) {
      return;
    }

    const existingSlot = slotByItemId.get(item.id);
    const next: BottomNavConfig = { ...config };

    if (existingSlot && existingSlot !== editingSlot) {
      // 既に別枠に入っている項目を選んだ場合は自動入れ替え（重複ゼロの排他制御）
      const displacedLabel = getBottomNavLabel(currentIdInTarget);
      if (editingSlot === "left") next.leftId = item.id;
      if (editingSlot === "center") next.centerId = item.id;
      if (editingSlot === "right") next.rightId = item.id;

      if (existingSlot === "left") next.leftId = currentIdInTarget;
      if (existingSlot === "center") next.centerId = currentIdInTarget;
      if (existingSlot === "right") next.rightId = currentIdInTarget;

      applyAndSave(next);
      toast.success(
        `「${getBottomNavLabel(item.id)}」と「${displacedLabel}」を入れ替えました`
      );
      return;
    }

    if (editingSlot === "left") next.leftId = item.id;
    if (editingSlot === "center") next.centerId = item.id;
    if (editingSlot === "right") next.rightId = item.id;

    applyAndSave(next);
    toast.success(
      `${SLOT_LABELS[editingSlot]}に「${getBottomNavLabel(item.id)}」を設定しました`
    );
  };

  const handleSwapAdjacent = (pair: "left_center" | "center_right") => {
    if (pair === "left_center") {
      applyAndSave({
        ...config,
        leftId: config.centerId,
        centerId: config.leftId,
      });
      toast.success("左スロットと中央ボタンを入れ替えました");
    } else {
      applyAndSave({
        ...config,
        centerId: config.rightId,
        rightId: config.centerId,
      });
      toast.success("中央ボタンと右スロットを入れ替えました");
    }
  };

  const handleStyleChange = (style: BottomNavStyleMode, label: string) => {
    if (config.style === style) return;
    applyAndSave({ ...config, style });
    toast.success(`ボトムナビ形状を「${label}」に変更しました`);
  };

  const handleApplyPreset = (preset: BottomNavPreset) => {
    applyAndSave({
      ...config,
      leftId: preset.leftId,
      centerId: preset.centerId,
      rightId: preset.rightId,
    });
    toast.success(`ボトムナビに「${preset.label}」を反映しました`);
  };

  const handleReset = () => {
    const defaults = resetBottomNavConfig();
    setConfig(defaults);
    toast.success("ボトムナビを初期設定に戻しました");
  };

  const renderSlotButton = (
    slot: BottomNavSlotKey,
    item: QuickMenuItemDef,
    badgeNum: string
  ) => {
    const Icon = item.icon;
    const isEditing = editingSlot === slot;
    const isCenterArch = slot === "center" && config.style === "arch";
    const label = getBottomNavLabel(item.id);

    return (
      <button
        key={slot}
        type="button"
        onClick={() => handleSelectSlot(slot, item)}
        className={`relative flex flex-col items-center justify-center py-2 px-1 rounded-xl border transition-all active:scale-95 cursor-pointer ${
          isEditing
            ? "border-2 border-primary bg-card shadow-xs"
            : "border-border bg-card hover:border-primary/40"
        }`}
      >
        <span
          className={`px-1.5 py-0.2 rounded text-[8.5px] font-black leading-tight mb-1 ${
            isEditing
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {isEditing ? "選択中" : badgeNum}
        </span>

        {isCenterArch ? (
          <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xs mb-0.5">
            <Icon className="w-4 h-4" />
          </span>
        ) : (
          <span className="w-8 h-8 rounded-xl bg-primary/12 text-primary flex items-center justify-center mb-0.5">
            <Icon className="w-4 h-4" />
          </span>
        )}

        <span className="text-[10px] font-black text-foreground leading-tight truncate max-w-full">
          {label}
        </span>
      </button>
    );
  };

  return (
    <section
      id="bottom-nav"
      className="scroll-mt-20 rounded-2xl border border-border bg-card shadow-xs overflow-hidden"
    >
      {/* A-3 上帯ダークキャップ */}
      <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-7 h-7 rounded-xl bg-primary/20 text-blue-300 border border-primary/40 flex items-center justify-center shrink-0">
              <PanelBottom className="w-4 h-4" />
            </span>
            <h2 className="text-sm font-black text-white truncate">
              ボトムナビ設定
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-200 border border-slate-700 text-[10px] font-black shrink-0">
              リアルタイム反映
            </span>
          </div>

          {!isDefault && (
            <button
              type="button"
              onClick={handleReset}
              className="py-1 px-2.5 rounded-full bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-[10px] font-black text-slate-300 hover:text-white transition-all flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>初期設定に戻す</span>
            </button>
          )}
        </div>
        <p className="text-[11px] font-bold text-slate-300 leading-relaxed">
          画面下部に常時表示される中央3枠（②左・③中央・④右）の機能とバー形状をカスタマイズできます。
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* 1. インタラクティブ5枠スロットプレビュー */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-black text-foreground">
              変更したい枠をタップして選択
            </label>
            <span className="text-[10px] font-bold text-muted-foreground">
              ホーム・メニューは安全固定
            </span>
          </div>

          <div className="p-2.5 rounded-2xl bg-[#eef2f6] dark:bg-muted/50 border border-border space-y-2">
            <div className="grid grid-cols-5 gap-1.5 items-stretch">
              {/* ① ホーム（固定） */}
              <div className="flex flex-col items-center justify-center py-2 px-1 rounded-xl border border-dashed border-border bg-card/70 opacity-75 select-none">
                <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-muted text-muted-foreground text-[8px] font-black leading-tight mb-1">
                  <Lock className="w-2.5 h-2.5" />
                  <span>固定</span>
                </span>
                <span className="w-8 h-8 rounded-xl bg-muted text-muted-foreground flex items-center justify-center mb-0.5">
                  <Home className="w-4 h-4" />
                </span>
                <span className="text-[10px] font-bold text-muted-foreground leading-tight">
                  ホーム
                </span>
              </div>

              {/* ② 左スロット */}
              {renderSlotButton("left", leftItem, "② 左枠")}

              {/* ③ 中央スロット */}
              {renderSlotButton("center", centerItem, "③ 中央")}

              {/* ④ 右スロット */}
              {renderSlotButton("right", rightItem, "④ 右枠")}

              {/* ⑤ メニュー（固定） */}
              <div className="flex flex-col items-center justify-center py-2 px-1 rounded-xl border border-dashed border-border bg-card/70 opacity-75 select-none">
                <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-muted text-muted-foreground text-[8px] font-black leading-tight mb-1">
                  <Lock className="w-2.5 h-2.5" />
                  <span>固定</span>
                </span>
                <span className="w-8 h-8 rounded-xl bg-muted text-muted-foreground flex items-center justify-center mb-0.5">
                  <Menu className="w-4 h-4" />
                </span>
                <span className="text-[10px] font-bold text-muted-foreground leading-tight">
                  メニュー
                </span>
              </div>
            </div>

            {/* 隣同士のワンタップ入れ替えバー */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => handleSwapAdjacent("left_center")}
                className="py-1.5 px-2.5 rounded-xl bg-card hover:bg-muted border border-border text-[10.5px] font-black text-foreground flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              >
                <ArrowLeftRight className="w-3 h-3 text-primary" />
                <span>②左 と ③中央 を入替</span>
              </button>
              <button
                type="button"
                onClick={() => handleSwapAdjacent("center_right")}
                className="py-1.5 px-2.5 rounded-xl bg-card hover:bg-muted border border-border text-[10.5px] font-black text-foreground flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              >
                <ArrowLeftRight className="w-3 h-3 text-primary" />
                <span>③中央 と ④右 を入替</span>
              </button>
            </div>
          </div>
        </div>

        {/* 2. ナビバー形状スタイル */}
        <div className="space-y-1.5">
          <label className="text-xs font-black text-foreground block">
            ボトムナビの形状デザイン
          </label>
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-muted/80 dark:bg-muted/50 border border-border">
            {BOTTOM_NAV_STYLE_OPTIONS.map((opt) => {
              const isActive = config.style === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleStyleChange(opt.id, opt.label)}
                  className={`flex flex-col items-center justify-center py-2 px-2 rounded-xl border transition-all active:scale-95 gap-0.5 cursor-pointer ${
                    isActive
                      ? "bg-card text-foreground border-border shadow-sm font-black"
                      : "border-transparent text-muted-foreground hover:text-foreground font-bold"
                  }`}
                >
                  <span className="text-xs leading-tight">{opt.label}</span>
                  <span
                    className={`text-[9.5px] leading-tight ${
                      isActive
                        ? "text-primary font-black"
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

        {/* 3. おすすめプリセット */}
        <div className="space-y-1.5">
          <label className="text-xs font-black text-foreground flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span>役割別おすすめプリセット（1タップ反映）</span>
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {BOTTOM_NAV_PRESETS.map((preset) => {
              const isMatched =
                config.leftId === preset.leftId &&
                config.centerId === preset.centerId &&
                config.rightId === preset.rightId;

              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  className={`flex flex-col items-start justify-between p-2.5 rounded-2xl border text-left transition-all active:scale-95 gap-1 cursor-pointer ${
                    isMatched
                      ? "border-primary bg-primary/10 text-primary font-black shadow-2xs"
                      : "bg-card border-border hover:border-primary/40 text-foreground font-bold"
                  }`}
                >
                  <div className="flex items-center justify-between w-full gap-1">
                    <span className="text-[11px] font-black leading-tight truncate">
                      {preset.label}
                    </span>
                    {isMatched && (
                      <Check className="w-3.5 h-3.5 text-primary shrink-0 stroke-[3]" />
                    )}
                  </div>
                  <span className="text-[9.5px] font-bold text-muted-foreground leading-snug truncate w-full">
                    {preset.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. 機能ピッカー（選択中スロットへの割り当て） */}
        <div className="space-y-2.5 pt-2 border-t border-border">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-black text-foreground">
              <span className="text-primary">{SLOT_LABELS[editingSlot]}</span>
              <span> に割り当てる機能</span>
            </label>
            <span className="text-[10px] font-bold text-muted-foreground shrink-0">
              画面下部に即時反映
            </span>
          </div>

          {/* カテゴリ切替タブ */}
          <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-muted/80 dark:bg-muted/50 border border-border">
            {QUICK_MENU_CATEGORIES.map((cat) => {
              const isTabActive = activeCategory === cat.id;
              const assignedCount = QUICK_MENU_CATALOG.filter(
                (i) => i.category === cat.id && slotByItemId.has(i.id)
              ).length;

              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl border text-[11px] transition-all active:scale-95 gap-0.5 cursor-pointer ${
                    isTabActive
                      ? "bg-card text-foreground border-border shadow-sm font-black"
                      : "border-transparent text-muted-foreground hover:text-foreground font-bold"
                  }`}
                >
                  <span className="truncate max-w-full leading-tight">
                    {cat.label}
                  </span>
                  <span
                    className={`text-[9px] font-mono leading-none px-1.5 py-0.5 rounded-full ${
                      isTabActive
                        ? "bg-primary/12 text-primary font-black"
                        : assignedCount > 0
                        ? "bg-primary/10 text-primary font-black"
                        : "bg-card text-muted-foreground font-bold"
                    }`}
                  >
                    {assignedCount > 0 ? `${assignedCount}枠設定中` : "選択可"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* カテゴリアイテム一覧 */}
          <div className="grid grid-cols-2 gap-2">
            {categoryItems.map((item) => {
              const Icon = item.icon;
              const tone = getQuickMenuItemToneStyle(item);
              const assignedSlot = slotByItemId.get(item.id);
              const isAssignedHere = assignedSlot === editingSlot;
              const navShort = getBottomNavLabel(item.id);

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleAssignItemToEditingSlot(item)}
                  className={`flex items-center gap-2.5 p-2.5 rounded-2xl border text-left transition-all active:scale-95 cursor-pointer ${
                    isAssignedHere
                      ? "border-2 border-primary bg-primary/10 shadow-2xs"
                      : assignedSlot
                      ? "border-primary/35 bg-muted/40 hover:border-primary/60"
                      : `bg-card border-border ${tone.hoverBorderClass}`
                  }`}
                >
                  <span
                    className={`w-8 h-8 rounded-xl ${tone.iconBoxClass} flex items-center justify-center shrink-0`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 min-w-0">
                      <p className="text-xs font-black text-foreground truncate">
                        {navShort}
                      </p>
                      {item.adminOnly && (
                        <span className="px-1 py-0.2 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-[8.5px] font-black shrink-0">
                          管理者専用
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-[10px] font-bold truncate ${
                        assignedSlot
                          ? "text-primary font-black"
                          : "text-muted-foreground"
                      }`}
                    >
                      {isAssignedHere
                        ? `${SLOT_SHORT_BADGES[editingSlot]}に配置中`
                        : assignedSlot
                        ? `${SLOT_SHORT_BADGES[assignedSlot]}と入替`
                        : item.description}
                    </p>
                  </div>

                  {assignedSlot && (
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[9.5px] font-black shrink-0 ${
                        isAssignedHere
                          ? "bg-primary text-primary-foreground"
                          : "bg-card border border-primary/40 text-primary"
                      }`}
                    >
                      {SLOT_SHORT_BADGES[assignedSlot]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

