// filepath: src/components/liff/LineGroupReminderSettingsSection.tsx
"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  BellOff,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  HelpCircle,
  Loader2,
  MessageCircle,
  Save,
  Send,
  X,
} from "lucide-react";
import { LiffSelect, type LiffSelectOption } from "@/components/liff/LiffSelect";
import {
  fetchLiffJsonSWR,
  invalidateLiffApiCache,
  peekLiffApiCache,
} from "@/lib/liff/api-cache";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface ClientWeekendReminderSettings {
  enabled: boolean;
  sendDayOfWeek: 3 | 4 | 5;
  sendHourJst: 18 | 19 | 20 | 21;
  includeSchedule: boolean;
  includeUnanswered: boolean;
  includeOpsSummary: boolean;
  includeScheduleUrl: boolean;
  skipWhenNoEvents: boolean;
  lastSentWeekKey: string | null;
  lastSentAt: string | null;
}

export const INITIAL_CLIENT_WEEKEND_REMINDER_SETTINGS: ClientWeekendReminderSettings = {
  enabled: false,
  sendDayOfWeek: 4,
  sendHourJst: 20,
  includeSchedule: true,
  includeUnanswered: true,
  includeOpsSummary: true,
  includeScheduleUrl: true,
  skipWhenNoEvents: true,
  lastSentWeekKey: null,
  lastSentAt: null,
};

interface LineReminderSettingsApiResponse {
  success: boolean;
  isDemo?: boolean;
  canManage?: boolean;
  hasBotToken?: boolean;
  hasLineGroupLinked?: boolean;
  lineGroupId?: string;
  isAutoReportEnabled?: boolean;
  reportPlayballEnabled?: boolean;
  reportInningEnabled?: boolean;
  reportGameSetEnabled?: boolean;
  reminderSettings?: ClientWeekendReminderSettings;
  error?: string;
}

interface LineReminderPreviewApiResponse {
  success: boolean;
  isDemo?: boolean;
  weekendRangeLabel?: string;
  eventCount?: number;
  message?: string;
  error?: string;
}

interface LineReminderTestPushApiResponse {
  success: boolean;
  message?: string;
  previewMessage?: string;
  error?: string;
}

const SEND_DAY_OPTIONS: LiffSelectOption[] = [
  {
    value: "3",
    label: "毎週 水曜日",
    sublabel: "週半ばに早めに週末出欠を集めたいチーム向け",
  },
  {
    value: "4",
    label: "毎週 木曜日（おすすめ）",
    sublabel: "木曜夜に未回答確認 ➔ 金曜に配車確定の定番サイクル",
  },
  {
    value: "5",
    label: "毎週 金曜日",
    sublabel: "前日夜の最終確認・当番リマインド向け",
  },
];

const SEND_HOUR_OPTIONS: LiffSelectOption[] = [
  { value: "18", label: "18:00 ごろ（夕方）" },
  { value: "19", label: "19:00 ごろ" },
  { value: "20", label: "20:00 ごろ（おすすめ）" },
  { value: "21", label: "21:00 ごろ" },
];

const DAY_SHORT_LABEL: Record<3 | 4 | 5, string> = {
  3: "水曜",
  4: "木曜",
  5: "金曜",
};

interface LineGroupReminderSettingsSectionProps {
  teamId: string;
  isDemoTeam: boolean;
  canManageTeam: boolean;
}

export function LineGroupReminderSettingsSection({
  teamId,
  isDemoTeam,
  canManageTeam,
}: LineGroupReminderSettingsSectionProps) {
  const effectiveCanManage = canManageTeam || isDemoTeam;
  const settingsUrl = `/api/liff/line-reminder-settings?teamId=${encodeURIComponent(teamId)}`;

  const initialCached = peekLiffApiCache<LineReminderSettingsApiResponse>(settingsUrl);

  const [hasBotToken, setHasBotToken] = useState<boolean>(
    initialCached?.hasBotToken ?? true
  );
  const [hasLineGroupLinked, setHasLineGroupLinked] = useState<boolean>(
    Boolean(initialCached?.hasLineGroupLinked)
  );
  const [lineGroupId, setLineGroupId] = useState<string>(
    initialCached?.lineGroupId || ""
  );
  const [isAutoReportEnabled, setIsAutoReportEnabled] = useState<boolean>(
    Boolean(initialCached?.isAutoReportEnabled)
  );
  const [reportPlayballEnabled, setReportPlayballEnabled] = useState<boolean>(
    initialCached?.reportPlayballEnabled !== false
  );
  const [reportInningEnabled, setReportInningEnabled] = useState<boolean>(
    initialCached?.reportInningEnabled !== false
  );
  const [reportGameSetEnabled, setReportGameSetEnabled] = useState<boolean>(
    initialCached?.reportGameSetEnabled !== false
  );
  const [reminderSettings, setReminderSettings] =
    useState<ClientWeekendReminderSettings>(
      initialCached?.reminderSettings
        ? { ...INITIAL_CLIENT_WEEKEND_REMINDER_SETTINGS, ...initialCached.reminderSettings }
        : { ...INITIAL_CLIENT_WEEKEND_REMINDER_SETTINGS }
    );

  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [isConfirmingTestPush, setIsConfirmingTestPush] = useState(false);

  const [previewModalState, setPreviewModalState] = useState<{
    isOpen: boolean;
    weekendRangeLabel: string;
    eventCount: number;
    message: string;
  }>({
    isOpen: false,
    weekendRangeLabel: "",
    eventCount: 0,
    message: "",
  });

  useEffect(() => {
    let cancelled = false;
    setIsConfirmingTestPush(false);
    setPreviewModalState((prev) => ({ ...prev, isOpen: false }));

    const applyPayload = (data?: LineReminderSettingsApiResponse | null) => {
      if (!data?.success) return;
      setHasBotToken(data.hasBotToken ?? true);
      setHasLineGroupLinked(Boolean(data.hasLineGroupLinked));
      setLineGroupId(data.lineGroupId || "");
      setIsAutoReportEnabled(Boolean(data.isAutoReportEnabled));
      setReportPlayballEnabled(data.reportPlayballEnabled !== false);
      setReportInningEnabled(data.reportInningEnabled !== false);
      setReportGameSetEnabled(data.reportGameSetEnabled !== false);
      setReminderSettings(
        data.reminderSettings
          ? {
              ...INITIAL_CLIENT_WEEKEND_REMINDER_SETTINGS,
              ...data.reminderSettings,
              enabled: data.reminderSettings.enabled === true,
            }
          : { ...INITIAL_CLIENT_WEEKEND_REMINDER_SETTINGS }
      );
    };

    const cached = peekLiffApiCache<LineReminderSettingsApiResponse>(settingsUrl);
    if (cached?.success) {
      applyPayload(cached);
    } else {
      // チーム切替時に前チームの値が絶対に残らないよう初期値（enabled: false）へ即時リセット
      setHasLineGroupLinked(false);
      setLineGroupId("");
      setIsAutoReportEnabled(false);
      setReportPlayballEnabled(true);
      setReportInningEnabled(true);
      setReportGameSetEnabled(true);
      setReminderSettings({ ...INITIAL_CLIENT_WEEKEND_REMINDER_SETTINGS });
    }

    void fetchLiffJsonSWR<LineReminderSettingsApiResponse>(settingsUrl, {
      onRevalidate: (fresh) => {
        if (!cancelled && fresh?.success) {
          applyPayload(fresh);
        }
      },
    })
      .then((res) => {
        if (!cancelled && res?.success) {
          applyPayload(res);
        }
      })
      .catch((err) => {
        console.error("Failed to load LINE reminder settings:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [settingsUrl, teamId]);

  const handleSaveSettings = async () => {
    if (!effectiveCanManage || isSaving) return;
    const trimmedGroupId = lineGroupId.trim();

    if (reminderSettings.enabled && !trimmedGroupId && !isDemoTeam) {
      toast.error(
        "週末自動リマインドをONにするには、先にLINEグループIDを入力してください"
      );
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/liff/line-reminder-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          lineGroupId: trimmedGroupId,
          isAutoReportEnabled,
          reportPlayballEnabled,
          reportInningEnabled,
          reportGameSetEnabled,
          reminderSettings,
        }),
      });
      const data = (await res.json()) as LineReminderSettingsApiResponse;
      if (!res.ok || !data.success) {
        throw new Error(data.error || "LINE連携・リマインド設定の保存に失敗しました");
      }

      if (data.reminderSettings) {
        setReminderSettings({
          ...INITIAL_CLIENT_WEEKEND_REMINDER_SETTINGS,
          ...data.reminderSettings,
          enabled: data.reminderSettings.enabled === true,
        });
      }
      setHasLineGroupLinked(Boolean(data.hasLineGroupLinked));
      if (typeof data.lineGroupId === "string") {
        setLineGroupId(data.lineGroupId);
      }
      invalidateLiffApiCache("/api/liff/line-reminder-settings");
      toast.success(
        reminderSettings.enabled
          ? `週末自動リマインドをON（毎週${DAY_SHORT_LABEL[reminderSettings.sendDayOfWeek]} ${reminderSettings.sendHourJst}:00）で保存しました`
          : "LINE連携・リマインド設定を保存しました（自動リマインド: OFF）"
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "LINE連携・リマインド設定の保存に失敗しました";
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenPreview = async () => {
    if (isLoadingPreview) return;
    setIsLoadingPreview(true);
    try {
      const res = await fetch("/api/liff/line-reminder-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          reminderSettings,
        }),
      });
      const data = (await res.json()) as LineReminderPreviewApiResponse;
      if (!res.ok || !data.success || typeof data.message !== "string") {
        throw new Error(data.error || "プレビュー文面の作成に失敗しました");
      }
      setPreviewModalState({
        isOpen: true,
        weekendRangeLabel: data.weekendRangeLabel || "今週末",
        eventCount: data.eventCount ?? 0,
        message: data.message,
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "プレビュー文面の作成に失敗しました";
      toast.error(msg);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleSendTestPush = async () => {
    if (!effectiveCanManage || isSendingTest) return;
    if (isDemoTeam) {
      toast.info("体験デモモードでは「文面プレビューを確認」から配信文面をお試しいただけます");
      return;
    }
    const trimmedGroupId = lineGroupId.trim();
    if (!trimmedGroupId) {
      toast.error("テスト送信先のLINEグループIDを入力してください");
      return;
    }

    setIsSendingTest(true);
    try {
      const res = await fetch("/api/liff/line-reminder-test-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          lineGroupId: trimmedGroupId,
          reminderSettings,
        }),
      });
      const data = (await res.json()) as LineReminderTestPushApiResponse;
      if (!res.ok || !data.success) {
        throw new Error(data.error || "LINEテスト送信に失敗しました");
      }
      setIsConfirmingTestPush(false);
      toast.success(data.message || "LINEグループへテスト配信を送信しました！");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "LINEテスト送信に失敗しました";
      toast.error(msg);
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleCopyPreviewText = async () => {
    if (!previewModalState.message) return;
    try {
      await navigator.clipboard.writeText(previewModalState.message);
      toast.success("リマインド文面をクリップボードにコピーしました");
    } catch {
      toast.error("コピーに失敗しました");
    }
  };

  const formattedLastSentAt = (() => {
    if (!reminderSettings.lastSentAt) return null;
    const dt = new Date(reminderSettings.lastSentAt);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toLocaleString("ja-JP", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  })();

  const toggleIncludeField = (
    key:
      | "includeSchedule"
      | "includeUnanswered"
      | "includeOpsSummary"
      | "includeScheduleUrl"
      | "skipWhenNoEvents"
  ) => {
    if (!effectiveCanManage) return;
    setReminderSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <>
      <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
        {/* A-3 上帯ダークキャップ（公式LINEカラー #06C755 下線） */}
        <div className="bg-[#0f172a] text-slate-50 px-3.5 py-2.5 border-b-[3px] border-[#06C755] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-6 h-6 rounded-md bg-[#06C755] text-white flex items-center justify-center shrink-0">
              <MessageCircle className="w-3.5 h-3.5" />
            </span>
            <h2 className="text-xs font-black tracking-wide truncate">
              LINEグループ連携 ＆ 週末自動リマインド
            </h2>
          </div>

          {reminderSettings.enabled ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#06C755] text-white text-[10px] font-black shrink-0">
              <Bell className="w-2.5 h-2.5" />
              <span>
                ON（毎週{DAY_SHORT_LABEL[reminderSettings.sendDayOfWeek]}{" "}
                {reminderSettings.sendHourJst}:00）
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-black shrink-0">
              <BellOff className="w-2.5 h-2.5" />
              <span>自動配信: OFF</span>
            </span>
          )}
        </div>

        <div className="p-4 space-y-4">
          <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">
            チームのLINEグループと連携すると、週末の活動予定・出欠未回答メンバー・配車/当番サマリーを指定曜日の夜に自動リマインド配信できます（初期設定は<strong>オフ</strong>です）。
          </p>

          {!effectiveCanManage ? (
            /* 一般閲覧メンバー向け：読み取り専用ステータス ＋ 文面プレビュー */
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-muted-foreground">LINEグループ連携</span>
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-md text-[11px] font-black",
                      hasLineGroupLinked
                        ? "bg-[#06C755]/15 text-[#06C755]"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {hasLineGroupLinked ? "連携済み" : "未設定"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-muted-foreground">週末自動リマインド</span>
                  <span className="text-foreground font-black">
                    {reminderSettings.enabled
                      ? `ON（毎週${DAY_SHORT_LABEL[reminderSettings.sendDayOfWeek]} ${reminderSettings.sendHourJst}:00ごろ）`
                      : "OFF（自動送信なし）"}
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled={isLoadingPreview}
                onClick={() => void handleOpenPreview()}
                className="w-full py-2.5 px-3.5 rounded-xl border border-border bg-card hover:bg-muted text-xs font-black text-foreground flex items-center justify-center gap-1.5 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
              >
                {isLoadingPreview ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                ) : (
                  <Eye className="w-3.5 h-3.5 shrink-0 text-[#06C755]" />
                )}
                <span>今週末のリマインド文面をプレビュー（送信されません）</span>
              </button>

              <p className="text-[10.5px] font-bold text-muted-foreground">
                ※ LINEグループ連携・自動配信のON/OFF変更はチーム管理者（監督・代表・IT管理者）が行えます
              </p>
            </div>
          ) : (
            /* 管理者（監督・代表・IT管理者・デモ）向けフル設定UI */
            <div className="space-y-4">
              {!hasBotToken && !isDemoTeam && (
                <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-[11px] font-bold text-amber-900 dark:text-amber-200 leading-relaxed">
                  ⚠️ サーバー環境に <code className="font-mono">LINE_CHANNEL_ACCESS_TOKEN</code>{" "}
                  が未設定のため、自動Push送信は現在待機状態です（文面プレビュー＆コピーはそのままご利用いただけます）。
                </div>
              )}

              {/* 1. LINEグループID設定 ＋ 連携手順ガイド */}
              <div className="p-3.5 rounded-xl bg-muted/35 border border-border space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="liff-team-line-group-id"
                    className="text-xs font-black text-foreground flex items-center gap-1.5"
                  >
                    <span>① 送信先 LINEグループID</span>
                    {lineGroupId.trim() ? (
                      <span className="px-1.5 py-0.2 rounded bg-[#06C755]/15 text-[#06C755] text-[10px] font-black">
                        入力済み
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.2 rounded bg-muted text-muted-foreground text-[10px] font-bold">
                        未設定
                      </span>
                    )}
                  </label>

                  <button
                    type="button"
                    onClick={() => setIsGuideOpen((prev) => !prev)}
                    className="inline-flex items-center gap-1 text-[11px] font-black text-[#06C755] hover:underline cursor-pointer"
                  >
                    <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>グループIDの確認手順</span>
                    {isGuideOpen ? (
                      <ChevronUp className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                    )}
                  </button>
                </div>

                {isGuideOpen && (
                  <div className="p-3 rounded-xl bg-card border border-border text-[11px] text-foreground space-y-1.5 leading-relaxed">
                    <p className="font-black text-[#06C755]">
                      📱 LINEグループID（C...）の取得手順
                    </p>
                    <ol className="list-decimal pl-4 space-y-1 font-medium text-muted-foreground">
                      <li>
                        チームのLINEグループに、連携するLINE公式アカウント（Bot）を招待します。
                      </li>
                      <li>
                        グループトーク内で <code className="px-1 py-0.5 rounded bg-muted text-foreground font-mono font-bold">!groupId</code>{" "}
                        またはグループID確認コマンドを送信し、返信された{" "}
                        <code className="px-1 py-0.5 rounded bg-muted text-foreground font-mono font-bold">C</code>{" "}
                        から始まるID（33文字）をコピーします。
                      </li>
                      <li>
                        下の入力欄に貼り付けて「LINE・リマインド設定を保存」を押します。
                      </li>
                    </ol>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input
                    id="liff-team-line-group-id"
                    type="text"
                    value={lineGroupId}
                    onChange={(e) => setLineGroupId(e.target.value)}
                    placeholder="例: C1234567890abcdef1234567890abcdef"
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-card text-xs font-mono font-bold text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-[#06C755]/40"
                  />
                  {lineGroupId && (
                    <button
                      type="button"
                      onClick={() => setLineGroupId("")}
                      aria-label="グループIDをクリア"
                      className="h-10 px-2.5 rounded-xl border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-bold shrink-0 cursor-pointer"
                    >
                      クリア
                    </button>
                  )}
                </div>

                {/* 試合速報自動Push連動トグル */}
                <div className="pt-1 border-t border-border/70 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11.5px] font-black text-foreground">
                        ⚾ 試合速報の自動Push通知
                      </p>
                      <p className="text-[10px] font-bold text-muted-foreground">
                        スコア入力時のプレイボール・回終了・試合終了を自動通知
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isAutoReportEnabled}
                      onClick={() => setIsAutoReportEnabled((prev) => !prev)}
                      className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer",
                        isAutoReportEnabled
                          ? "bg-[#06C755] border-[#06C755]"
                          : "bg-slate-300 dark:bg-slate-700 border-slate-400 dark:border-slate-600"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block h-4 w-4 rounded-full bg-white shadow-2xs transition-transform",
                          isAutoReportEnabled ? "translate-x-5" : "translate-x-1"
                        )}
                      />
                    </button>
                  </div>

                  {isAutoReportEnabled && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {[
                        {
                          label: "プレイボール",
                          checked: reportPlayballEnabled,
                          toggle: () => setReportPlayballEnabled((v) => !v),
                        },
                        {
                          label: "イニング終了",
                          checked: reportInningEnabled,
                          toggle: () => setReportInningEnabled((v) => !v),
                        },
                        {
                          label: "試合終了",
                          checked: reportGameSetEnabled,
                          toggle: () => setReportGameSetEnabled((v) => !v),
                        },
                      ].map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={item.toggle}
                          className={cn(
                            "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-black transition-colors cursor-pointer",
                            item.checked
                              ? "bg-[#06C755]/12 border-[#06C755] text-foreground"
                              : "bg-card border-border text-muted-foreground"
                          )}
                        >
                          <Check
                            className={cn(
                              "w-3 h-3 shrink-0",
                              item.checked ? "text-[#06C755]" : "opacity-30"
                            )}
                          />
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 2. 週末自動リマインド ON / OFF メインスイッチ（初期値: OFF） */}
              <div
                className={cn(
                  "p-3.5 rounded-xl border space-y-3 transition-colors",
                  reminderSettings.enabled
                    ? "bg-[#06C755]/5 border-[#06C755]/50"
                    : "bg-muted/35 border-border"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-black text-foreground">
                        ② 週末予定・出欠の自動リマインド
                      </span>
                      <span
                        className={cn(
                          "px-1.5 py-0.2 rounded text-[10px] font-black",
                          reminderSettings.enabled
                            ? "bg-[#06C755] text-white"
                            : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                        )}
                      >
                        {reminderSettings.enabled ? "ON" : "OFF（初期設定）"}
                      </span>
                    </div>
                    <p className="text-[10.5px] font-bold text-muted-foreground mt-0.5">
                      {reminderSettings.enabled
                        ? `毎週${DAY_SHORT_LABEL[reminderSettings.sendDayOfWeek]} ${reminderSettings.sendHourJst}:00 ごろに今週末の予定・未回答者を自動配信します`
                        : "現在はオフです。オンに切り替えて保存するまで自動送信は一切行われません"}
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-label="週末自動リマインドのオン・オフ"
                    aria-checked={reminderSettings.enabled}
                    onClick={() =>
                      setReminderSettings((prev) => ({
                        ...prev,
                        enabled: !prev.enabled,
                      }))
                    }
                    className={cn(
                      "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors cursor-pointer",
                      reminderSettings.enabled
                        ? "bg-[#06C755] border-[#06C755]"
                        : "bg-slate-300 dark:bg-slate-700 border-slate-400 dark:border-slate-600"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-5 w-5 rounded-full bg-white shadow-2xs transition-transform",
                        reminderSettings.enabled ? "translate-x-6" : "translate-x-1"
                      )}
                    />
                  </button>
                </div>

                {reminderSettings.enabled && !lineGroupId.trim() && !isDemoTeam && (
                  <p className="text-[11px] font-black text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
                    ※ 自動リマインドをONで保存するには、上の「① 送信先 LINEグループID」を入力してください
                  </p>
                )}

                {/* 配信曜日 ＆ 配信時刻（LiffSelect統一・ネイティブselect不使用） */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <div className="space-y-1">
                    <span className="text-[11px] font-black text-foreground block">
                      配信する曜日
                    </span>
                    <LiffSelect
                      value={String(reminderSettings.sendDayOfWeek)}
                      onChange={(val) => {
                        const n = Number(val);
                        if (n === 3 || n === 4 || n === 5) {
                          setReminderSettings((prev) => ({
                            ...prev,
                            sendDayOfWeek: n,
                          }));
                        }
                      }}
                      options={SEND_DAY_OPTIONS}
                      title="自動リマインドを配信する曜日"
                      accent="teal"
                      size="sm"
                      searchable={false}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] font-black text-foreground block">
                      配信する時刻（日本時間）
                    </span>
                    <LiffSelect
                      value={String(reminderSettings.sendHourJst)}
                      onChange={(val) => {
                        const n = Number(val);
                        if (n === 18 || n === 19 || n === 20 || n === 21) {
                          setReminderSettings((prev) => ({
                            ...prev,
                            sendHourJst: n,
                          }));
                        }
                      }}
                      options={SEND_HOUR_OPTIONS}
                      title="自動リマインドを配信する時刻"
                      accent="teal"
                      size="sm"
                      searchable={false}
                      className="w-full"
                    />
                  </div>
                </div>

                {/* 配信文面に含める項目チップ */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-black text-foreground block">
                    メッセージに含める内容・送信条件
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        {
                          key: "includeSchedule",
                          label: "日時・場所・弁当",
                        },
                        {
                          key: "includeUnanswered",
                          label: "未回答の選手名（休部除外）",
                        },
                        {
                          key: "includeOpsSummary",
                          label: "配車台数・当番班",
                        },
                        {
                          key: "includeScheduleUrl",
                          label: "出欠回答URL",
                        },
                        {
                          key: "skipWhenNoEvents",
                          label: "週末予定0件なら送信スキップ",
                        },
                      ] as const
                    ).map((opt) => {
                      const active = reminderSettings[opt.key];
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => toggleIncludeField(opt.key)}
                          className={cn(
                            "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-black transition-colors cursor-pointer",
                            active
                              ? "bg-card border-[#06C755] text-foreground shadow-2xs"
                              : "bg-card/60 border-border text-muted-foreground"
                          )}
                        >
                          <Check
                            className={cn(
                              "w-3 h-3 shrink-0",
                              active ? "text-[#06C755]" : "opacity-30"
                            )}
                          />
                          <span>{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {formattedLastSentAt && (
                  <p className="text-[10.5px] font-bold text-muted-foreground pt-0.5">
                    直近の自動配信履歴: {formattedLastSentAt}（対象週末:{" "}
                    {reminderSettings.lastSentWeekKey}）
                  </p>
                )}
              </div>

              {/* 3. アクションボタン群（文面プレビュー / LINEテスト送信 / 保存） */}
              <div className="space-y-2 pt-0.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isLoadingPreview}
                    onClick={() => void handleOpenPreview()}
                    className="py-2.5 px-3 rounded-xl border border-border bg-card hover:bg-muted text-xs font-black text-foreground flex items-center justify-center gap-1.5 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isLoadingPreview ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    ) : (
                      <Eye className="w-3.5 h-3.5 shrink-0 text-[#06C755]" />
                    )}
                    <span>文面プレビュー（送信なし）</span>
                  </button>

                  {!isDemoTeam && (
                    <button
                      type="button"
                      disabled={isSendingTest || !lineGroupId.trim()}
                      onClick={() => setIsConfirmingTestPush((prev) => !prev)}
                      className="py-2.5 px-3 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-2xs active:scale-98 transition-all cursor-pointer disabled:opacity-45"
                    >
                      {isSendingTest ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                      ) : (
                        <Send className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>LINEへテスト送信</span>
                    </button>
                  )}
                </div>

                {isConfirmingTestPush && !isDemoTeam && (
                  <div className="p-3 rounded-xl border border-[#06C755]/40 bg-[#06C755]/10 flex items-center justify-between gap-2">
                    <p className="text-[11px] font-bold text-foreground leading-snug">
                      先頭に「🧪【テスト配信】」を付けて、登録グループへ今すぐ1通テスト送信しますか？
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsConfirmingTestPush(false)}
                        className="px-2.5 py-1.5 rounded-lg border border-border bg-card text-[11px] font-black text-muted-foreground cursor-pointer"
                      >
                        やめる
                      </button>
                      <button
                        type="button"
                        disabled={isSendingTest}
                        onClick={() => void handleSendTestPush()}
                        className="px-3 py-1.5 rounded-lg bg-[#06C755] hover:bg-[#05b34c] text-white text-[11px] font-black cursor-pointer disabled:opacity-50"
                      >
                        送信する
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => void handleSaveSettings()}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#0f172a] hover:bg-slate-800 text-white text-xs font-black shadow-2xs flex items-center justify-center gap-1.5 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                      <span>保存中...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5 shrink-0" />
                      <span>LINE連携・自動リマインド設定を保存</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 文面プレビューモーダル（createPortal + z-[9999] + Safe Area準拠） */}
      {previewModalState.isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() =>
              setPreviewModalState((prev) => ({ ...prev, isOpen: false }))
            }
          >
            <div
              className="w-full sm:max-w-lg max-h-[90dvh] rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* A-3 モーダル上帯ダークキャップ */}
              <div className="bg-[#0f172a] text-slate-50 px-4 py-3 border-b-[3px] border-[#06C755] flex items-center justify-between gap-2 shrink-0">
                <div className="min-w-0">
                  <p className="text-xs font-black truncate">
                    💬 週末リマインド配信プレビュー
                  </p>
                  <p className="text-[10.5px] font-bold text-slate-300 truncate">
                    対象: {previewModalState.weekendRangeLabel}（予定{" "}
                    {previewModalState.eventCount}件・LINEへは送信されません）
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setPreviewModalState((prev) => ({ ...prev, isOpen: false }))
                  }
                  aria-label="閉じる"
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto flex-1 space-y-3">
                <div className="p-3.5 rounded-xl bg-[#eef2f6] dark:bg-slate-900 border border-border">
                  <pre className="whitespace-pre-wrap break-words font-sans text-xs font-bold text-foreground leading-relaxed">
                    {previewModalState.message}
                  </pre>
                </div>
                <p className="text-[10.5px] font-bold text-muted-foreground">
                  💡 そのままコピーして手動でLINEグループへ貼り付けることもできます。
                </p>
              </div>

              <div className="px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 border-t border-border bg-card flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleCopyPreviewText()}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5 shrink-0" />
                  <span>文面をコピー</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPreviewModalState((prev) => ({ ...prev, isOpen: false }))
                  }
                  className="py-2.5 px-4 rounded-xl border border-border bg-card hover:bg-muted text-xs font-black text-foreground cursor-pointer"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
