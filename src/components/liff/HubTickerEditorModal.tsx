// filepath: src/components/liff/HubTickerEditorModal.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarClock,
  Check,
  Loader2,
  Megaphone,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { LiffSelect, type LiffSelectOption } from "@/components/liff/LiffSelect";
import { Switch } from "@/components/ui/switch";
import { invalidateLiffApiCache } from "@/lib/liff/api-cache";
import {
  DEFAULT_HUB_TICKER_AUTO_SOURCES,
  HUB_MANUAL_TONE_META,
  HUB_TICKER_LINK_OPTIONS,
  HUB_TICKER_QUICK_PRESETS,
  MAX_HUB_MANUAL_TEXT_LENGTH,
  MAX_HUB_MANUAL_TICKER_ITEMS,
  formatShortMonthDay,
  isHubManualTickerExpired,
  parseHubTickerConfigJson,
  resolveQuickExpiryDate,
  saveDemoHubTickerConfig,
  type HubManualTickerItem,
  type HubManualTickerTone,
  type HubTickerAutoSources,
  type HubTickerConfig,
} from "@/lib/liff/hub-ticker";
import { cn } from "@/lib/utils";

interface HubTickerEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamId: string | null | undefined;
  isDemo: boolean;
  initialConfig: HubTickerConfig;
  userName?: string;
  onSaved: (nextConfig: HubTickerConfig) => void;
}

interface SaveHubTickerApiResponse {
  success: boolean;
  isDemo?: boolean;
  config?: HubTickerConfig;
  error?: string;
}

function createEmptyManualDraft(userName = ""): HubManualTickerItem {
  return {
    id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    enabled: true,
    tone: "urgent",
    badgeLabel: HUB_MANUAL_TONE_META.urgent.defaultBadge,
    text: "",
    linkTarget: "/liff/schedule",
    expiresAt: resolveQuickExpiryDate("today"),
    updatedAt: new Date().toISOString(),
    updatedBy: userName,
  };
}

const TONE_BUTTON_STYLES: Record<
  HubManualTickerTone,
  { active: string; inactive: string }
> = {
  urgent: {
    active: "bg-rose-600 text-white border-rose-600 shadow-xs",
    inactive:
      "bg-card text-rose-700 dark:text-rose-300 border-border hover:border-rose-400",
  },
  warning: {
    active: "bg-amber-500 text-slate-950 border-amber-500 shadow-xs",
    inactive:
      "bg-card text-amber-800 dark:text-amber-300 border-border hover:border-amber-400",
  },
  info: {
    active: "bg-sky-600 text-white border-sky-600 shadow-xs",
    inactive:
      "bg-card text-sky-700 dark:text-sky-300 border-border hover:border-sky-400",
  },
  celebration: {
    active: "bg-emerald-600 text-white border-emerald-600 shadow-xs",
    inactive:
      "bg-card text-emerald-700 dark:text-emerald-300 border-border hover:border-emerald-400",
  },
};

const AUTO_SOURCE_ITEMS: ReadonlyArray<{
  key: keyof HubTickerAutoSources;
  title: string;
  desc: string;
}> = [
  {
    key: "importantNotices",
    title: "① 注意事項・球場規定",
    desc: "直近予定の特記事項・駐車台数制限・スパイク規定",
  },
  {
    key: "liveStatus",
    title: "② 試合速報・配車ライブ",
    desc: "進行中の試合スコア速報・遠征隊列マップ稼働状況",
  },
  {
    key: "myReminders",
    title: "③ 個人別の未回答・担当",
    desc: "メンバーごとの出欠未回答・行事締切・当日役割/号車",
  },
  {
    key: "scheduleAndRoles",
    title: "④ 次回予定・役割空き枠",
    desc: "次回活動の参加選手数・当番班・審判/撮影の未定枠",
  },
  {
    key: "resultsAndMedia",
    title: "⑤ 試合結果・動画・写真",
    desc: "直近の勝敗＆連勝記録・YouTube試合映像・新着写真",
  },
  {
    key: "adminAndSlogan",
    title: "⑥ 承認待ち・スローガン",
    desc: "管理者限定の参加申請通知・平常時のチームスローガン",
  },
];

const EXPIRY_CHIPS: ReadonlyArray<{
  id: "today" | "tomorrow" | "weekend" | "week" | "none";
  label: string;
}> = [
  { id: "today", label: "今日中" },
  { id: "tomorrow", label: "明日まで" },
  { id: "weekend", label: "今週末まで" },
  { id: "week", label: "1週間" },
  { id: "none", label: "無期限" },
];

export function HubTickerEditorModal({
  isOpen,
  onClose,
  teamId,
  isDemo,
  initialConfig,
  userName = "",
  onSaved,
}: HubTickerEditorModalProps) {
  const [mounted, setMounted] = useState(false);
  const [tickerEnabled, setTickerEnabled] = useState<boolean>(true);
  const [autoSources, setAutoSources] = useState<HubTickerAutoSources>({
    ...DEFAULT_HUB_TICKER_AUTO_SOURCES,
  });
  const [draftItems, setDraftItems] = useState<HubManualTickerItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const normalized = parseHubTickerConfigJson(initialConfig);
    setTickerEnabled(normalized.enabled);
    setAutoSources({ ...normalized.autoSources });
    if (normalized.manualItems.length > 0) {
      setDraftItems(normalized.manualItems.map((item) => ({ ...item })));
    } else {
      setDraftItems([createEmptyManualDraft(userName)]);
    }
    setSelectedIndex(0);
  }, [initialConfig, isOpen, userName]);

  const linkSelectOptions = useMemo<LiffSelectOption[]>(
    () =>
      HUB_TICKER_LINK_OPTIONS.map((opt) => ({
        value: opt.value,
        label: opt.label,
        sublabel: opt.subLabel,
        group: opt.group,
      })),
    []
  );

  if (!mounted || !isOpen) return null;

  const safeIdx = Math.min(
    Math.max(0, selectedIndex),
    Math.max(0, draftItems.length - 1)
  );
  const activeDraft = draftItems[safeIdx] || createEmptyManualDraft(userName);

  const updateActiveDraft = (patch: Partial<HubManualTickerItem>) => {
    setDraftItems((prev) => {
      const copy = prev.length > 0 ? [...prev] : [createEmptyManualDraft(userName)];
      const current = copy[safeIdx] || createEmptyManualDraft(userName);
      copy[safeIdx] = {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      return copy;
    });
  };

  const handleSelectTone = (nextTone: HubManualTickerTone) => {
    const prevDefault = HUB_MANUAL_TONE_META[activeDraft.tone].defaultBadge;
    const shouldSyncBadge =
      !activeDraft.badgeLabel.trim() || activeDraft.badgeLabel === prevDefault;
    updateActiveDraft({
      tone: nextTone,
      badgeLabel: shouldSyncBadge
        ? HUB_MANUAL_TONE_META[nextTone].defaultBadge
        : activeDraft.badgeLabel,
    });
  };

  const handleApplyQuickPreset = (
    preset: (typeof HUB_TICKER_QUICK_PRESETS)[number]
  ) => {
    updateActiveDraft({
      enabled: true,
      tone: preset.tone,
      badgeLabel: preset.badgeLabel,
      text: preset.text,
      linkTarget: preset.linkTarget,
      expiresAt: resolveQuickExpiryDate(preset.expiryPreset),
    });
  };

  const handleAddDraftSlot = () => {
    if (draftItems.length >= MAX_HUB_MANUAL_TICKER_ITEMS) return;
    const nextSlot = createEmptyManualDraft(userName);
    nextSlot.tone = "info";
    nextSlot.badgeLabel = HUB_MANUAL_TONE_META.info.defaultBadge;
    setDraftItems((prev) => [...prev, nextSlot]);
    setSelectedIndex(draftItems.length);
  };

  const handleRemoveActiveSlot = () => {
    if (draftItems.length <= 1) {
      setDraftItems([createEmptyManualDraft(userName)]);
      setSelectedIndex(0);
      return;
    }
    setDraftItems((prev) => prev.filter((_, idx) => idx !== safeIdx));
    setSelectedIndex((prev) => Math.max(0, prev - 1));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const cleanedManualItems = draftItems
        .filter((item) => item.text.trim().length > 0)
        .map((item) => ({
          ...item,
          text: item.text.trim().slice(0, MAX_HUB_MANUAL_TEXT_LENGTH),
          badgeLabel:
            item.badgeLabel.trim().slice(0, 12) ||
            HUB_MANUAL_TONE_META[item.tone].defaultBadge,
          updatedAt: new Date().toISOString(),
          updatedBy: item.updatedBy || userName || "管理者",
        }));

      const payloadConfig: HubTickerConfig = parseHubTickerConfigJson({
        enabled: tickerEnabled,
        autoSources,
        manualItems: cleanedManualItems,
      });

      const targetTeamId = isDemo ? "demo-team" : teamId || "demo-team";
      if (isDemo || targetTeamId === "demo-team") {
        saveDemoHubTickerConfig(payloadConfig);
      }

      const res = await fetch("/api/liff/hub-ticker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: targetTeamId,
          config: payloadConfig,
        }),
      });

      const data = (await res.json()) as SaveHubTickerApiResponse;
      if (!res.ok || !data.success) {
        throw new Error(data.error || "トップ案内メッセージの保存に失敗しました");
      }

      const finalConfig = data.config
        ? parseHubTickerConfigJson(data.config)
        : payloadConfig;

      if (isDemo || targetTeamId === "demo-team") {
        saveDemoHubTickerConfig(finalConfig);
      }

      invalidateLiffApiCache();
      onSaved(finalConfig);
      toast.success(
        cleanedManualItems.length > 0
          ? "トップページの流れる案内メッセージを更新しました！"
          : "トップ案内バーの表示設定を保存しました！"
      );
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "保存中にエラーが発生しました"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const isExpiredNow = isHubManualTickerExpired(activeDraft.expiresAt);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-slate-950/70 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-liff-backdrop-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90dvh] rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col animate-liff-sheet-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* A-3 上帯ダークキャップ */}
        <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 text-amber-400 flex items-center justify-center shrink-0">
              <Megaphone className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-white truncate">
                トップ案内メッセージ・表示設定
              </h3>
              <p className="text-[10.5px] font-bold text-slate-300 truncate">
                緊急連絡のピン留め（期限付き）と自動配信項目を編集できます
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center shrink-0 cursor-pointer"
            aria-label="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* スクロールボディ */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 bg-background">
          {/* マスター表示ON/OFF */}
          <div className="p-3 rounded-xl border border-border bg-card flex items-center justify-between gap-3 shadow-2xs">
            <div className="min-w-0">
              <p className="text-xs font-black text-foreground">
                トップ最上部に流れるメッセージを表示
              </p>
              <p className="text-[10.5px] font-bold text-muted-foreground">
                OFFにすると一般メンバーの画面からバーを非表示にします
              </p>
            </div>
            <Switch
              checked={tickerEnabled}
              onCheckedChange={setTickerEnabled}
              aria-label="トップ案内バーの表示切替"
            />
          </div>

          {/* 1. 手動ピン留め連絡（10秒スピード入力） */}
          <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
            <div className="px-3.5 py-2 bg-[#0f172a] text-slate-50 border-b-2 border-rose-500 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="text-xs font-black text-white truncate">
                  監督・管理者からのピン留め連絡（最大{MAX_HUB_MANUAL_TICKER_ITEMS}件）
                </span>
              </div>
              {draftItems.length < MAX_HUB_MANUAL_TICKER_ITEMS && (
                <button
                  type="button"
                  onClick={handleAddDraftSlot}
                  className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[10px] font-black text-amber-300 inline-flex items-center gap-0.5 shrink-0 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>枠を追加</span>
                </button>
              )}
            </div>

            <div className="p-3.5 space-y-3.5">
              {/* 複数枠タブ切替 */}
              {draftItems.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                  {draftItems.map((item, idx) => {
                    const isSelected = idx === safeIdx;
                    const hasContent = Boolean(item.text.trim());
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedIndex(idx)}
                        className={cn(
                          "px-2.5 py-1 rounded-lg border text-[11px] font-black shrink-0 inline-flex items-center gap-1 cursor-pointer transition-colors",
                          isSelected
                            ? "bg-[#0f172a] text-white border-[#0f172a] dark:bg-primary dark:text-primary-foreground dark:border-primary"
                            : "bg-muted text-muted-foreground border-border hover:text-foreground"
                        )}
                      >
                        <span>連絡 {idx + 1}</span>
                        {hasContent && (
                          <span
                            className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              item.enabled ? "bg-emerald-400" : "bg-slate-400"
                            )}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 1タップ定型文チップ */}
              <div className="space-y-1.5">
                <span className="text-[10.5px] font-black text-muted-foreground block">
                  ⚡ 1タップ定型文（タップで下書きセット）
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {HUB_TICKER_QUICK_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleApplyQuickPreset(preset)}
                      className="px-2.5 py-1 rounded-full bg-muted hover:bg-primary/12 text-foreground hover:text-primary border border-border text-[10.5px] font-black transition-colors active:scale-95 cursor-pointer"
                    >
                      {preset.chipLabel}
                    </button>
                  ))}
                </div>
              </div>

              {/* 種別トーン ＆ カスタム見出しバッジ */}
              <div className="space-y-1.5">
                <span className="text-[10.5px] font-black text-muted-foreground block">
                  ラベル種別（緊急度・色分け）
                </span>
                <div className="grid grid-cols-4 gap-1.5">
                  {(
                    ["urgent", "warning", "info", "celebration"] as const
                  ).map((tone) => {
                    const isSelected = activeDraft.tone === tone;
                    const meta = HUB_MANUAL_TONE_META[tone];
                    const style = TONE_BUTTON_STYLES[tone];
                    return (
                      <button
                        key={tone}
                        type="button"
                        onClick={() => handleSelectTone(tone)}
                        className={cn(
                          "py-1.5 px-1 rounded-xl border text-[11px] font-black text-center transition-all active:scale-95 cursor-pointer",
                          isSelected ? style.active : style.inactive
                        )}
                      >
                        {meta.shortOptionLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* メッセージ本文入力 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[10.5px] font-black text-muted-foreground">
                    流すメッセージ本文（空欄にすると手動連絡なし）
                  </label>
                  <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
                    {activeDraft.text.length}/{MAX_HUB_MANUAL_TEXT_LENGTH}文字
                  </span>
                </div>
                <textarea
                  rows={3}
                  maxLength={MAX_HUB_MANUAL_TEXT_LENGTH}
                  value={activeDraft.text}
                  onChange={(e) => updateActiveDraft({ text: e.target.value })}
                  placeholder="例：本日の練習は雨天のため「〇〇小体育館 9:00集合（上履き持参）」に変更です！"
                  className="w-full rounded-xl border border-border bg-input px-3 py-2 text-xs font-bold text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary resize-none"
                />

                {activeDraft.text.trim().length > 0 && (
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <Switch
                        checked={activeDraft.enabled}
                        onCheckedChange={(checked) =>
                          updateActiveDraft({ enabled: checked })
                        }
                      />
                      <span className="text-[11px] font-black text-foreground">
                        {activeDraft.enabled ? "現在掲示中（ON）" : "一時停止中（OFF）"}
                      </span>
                    </label>

                    <button
                      type="button"
                      onClick={handleRemoveActiveSlot}
                      className="px-2 py-1 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 text-[10.5px] font-black inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>
                        {draftItems.length > 1 ? "この連絡枠を削除" : "文面をクリア"}
                      </span>
                    </button>
                  </div>
                )}
              </div>

              {/* 表示期限（自動非表示） */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10.5px] font-black text-muted-foreground inline-flex items-center gap-1">
                    <CalendarClock className="w-3.5 h-3.5 text-primary" />
                    <span>表示期限（過ぎたら自動で非表示）</span>
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-black tabular-nums",
                      isExpiredNow
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-primary"
                    )}
                  >
                    {activeDraft.expiresAt
                      ? isExpiredNow
                        ? `期限切れ（${formatShortMonthDay(activeDraft.expiresAt)}）`
                        : `${formatShortMonthDay(activeDraft.expiresAt)} 23:59まで`
                      : "無期限で表示"}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {EXPIRY_CHIPS.map((chip) => {
                    const targetDate = resolveQuickExpiryDate(chip.id);
                    const isSelected =
                      (chip.id === "none" && !activeDraft.expiresAt) ||
                      (targetDate !== null &&
                        activeDraft.expiresAt === targetDate);
                    return (
                      <button
                        key={chip.id}
                        type="button"
                        onClick={() =>
                          updateActiveDraft({ expiresAt: targetDate })
                        }
                        className={cn(
                          "px-2.5 py-1 rounded-lg border text-[10.5px] font-black cursor-pointer transition-colors",
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted text-foreground border-border hover:border-primary/50"
                        )}
                      >
                        {chip.label}
                      </button>
                    );
                  })}

                  <input
                    type="date"
                    value={activeDraft.expiresAt || ""}
                    onChange={(e) =>
                      updateActiveDraft({
                        expiresAt: e.target.value ? e.target.value : null,
                      })
                    }
                    aria-label="表示期限の日付指定"
                    className="h-7 px-2 rounded-lg border border-border bg-card text-[11px] font-bold text-foreground"
                  />
                </div>
              </div>

              {/* タップ時の移動先（LiffSelect） */}
              <div className="space-y-1.5">
                <span className="text-[10.5px] font-black text-muted-foreground block">
                  メッセージをタップした時の動き
                </span>
                <LiffSelect
                  value={activeDraft.linkTarget}
                  onChange={(val) => updateActiveDraft({ linkTarget: val })}
                  options={linkSelectOptions}
                  title="タップ時の移動先を選択"
                  subtitle="メンバーがメッセージをタップした際に開く画面を指定します"
                  size="sm"
                />
              </div>
            </div>
          </section>

          {/* 2. 自動連動するチーム状況（①〜⑥） */}
          <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
            <div className="px-3.5 py-2 bg-[#0f172a] text-slate-50 border-b-2 border-teal-500 flex items-center justify-between gap-2">
              <span className="text-xs font-black text-white">
                アプリ連動の自動配信項目（①〜⑥）
              </span>
              <span className="text-[10px] font-bold text-teal-300">
                手入力不要で自動更新
              </span>
            </div>

            <div className="divide-y divide-border">
              {AUTO_SOURCE_ITEMS.map((src) => {
                const checked = autoSources[src.key];
                return (
                  <label
                    key={src.key}
                    className="px-3.5 py-2.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-muted/40 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-black text-foreground flex items-center gap-1.5">
                        <span>{src.title}</span>
                        {checked && (
                          <Check className="w-3 h-3 text-teal-600 dark:text-teal-400 shrink-0" />
                        )}
                      </p>
                      <p className="text-[10px] font-bold text-muted-foreground truncate">
                        {src.desc}
                      </p>
                    </div>
                    <Switch
                      checked={checked}
                      onCheckedChange={(val) =>
                        setAutoSources((prev) => ({
                          ...prev,
                          [src.key]: val,
                        }))
                      }
                    />
                  </label>
                );
              })}
            </div>
          </section>
        </div>

        {/* フッター（Safe Area 完全保護） */}
        <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="h-10 px-4 rounded-xl border border-border bg-muted hover:bg-muted/80 text-xs font-black text-foreground cursor-pointer disabled:opacity-50"
          >
            キャンセル
          </button>

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="flex-1 h-10 px-4 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black shadow-xs inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 active:scale-[0.99] transition-all"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>保存中...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>設定・メッセージを保存する</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
