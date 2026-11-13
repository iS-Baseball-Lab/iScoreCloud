// filepath: src/app/liff/settings/team/page.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { 
  ShieldCheck, 
  SlidersHorizontal,
  KeyRound,
  MapPin, 
  Car, 
  Save, 
  ChevronRight, 
  Layers,
  Building,
  BookOpen,
  ImagePlus,
  Image as ImageIcon,
  Trash2,
  Loader2,
  RotateCcw,
  Clock,
  CalendarDays,
} from "lucide-react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { LiffSelect, type LiffSelectOption } from "@/components/liff/LiffSelect";
import {
  DEMO_TEAM_DEFAULT_LOGO_URL,
  useLiff,
  usePracticeMatchLabel,
} from "@/components/liff/LiffProvider";
import { invalidateLiffApiCache } from "@/lib/liff/api-cache";
import { saveTeamPracticeMatchLabel } from "@/lib/liff/score-settings";
import {
  DEFAULT_TEAM_SCHEDULE_TIMES,
  SCHEDULE_TIME_OPTIONS,
  buildContiguousMonths,
  detectContiguousMonthRange,
  formatMonthSetLabel,
  getWinterMonths,
  loadCachedTeamScheduleDefaultTimes,
  normalizeTeamScheduleDefaultTimes,
  saveCachedTeamScheduleDefaultTimes,
  type TeamScheduleDefaultTimes,
} from "@/lib/liff/schedule-default-times";
import {
  DEFAULT_PRACTICE_MATCH_LABEL,
  PRACTICE_MATCH_LABEL_PRESETS,
  sanitizePracticeMatchLabel,
} from "@/lib/liff/scorebook-symbol-rules";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const TeamCoverPhotoModal = dynamic(
  () =>
    import("@/components/liff/TeamCoverPhotoModal").then(
      (mod) => mod.TeamCoverPhotoModal
    ),
  { ssr: false }
);

interface TeamLogoApiResponse {
  success: boolean;
  isDemo?: boolean;
  teamId?: string;
  logoImageUrl?: string | null;
  error?: string;
}

interface TeamCoverApiResponse {
  success: boolean;
  isDemo?: boolean;
  teamId?: string;
  coverImageUrl?: string | null;
  error?: string;
}

interface SavePracticeLabelApiResponse {
  success: boolean;
  error?: string;
}

interface ScheduleDefaultTimesApiResponse {
  success: boolean;
  isDemo?: boolean;
  scheduleDefaultTimes?: unknown;
  error?: string;
}

async function compressTeamLogoImage(file: File): Promise<{
  dataUrl: string;
  mimeType: string;
}> {
  // SVG はベクター鮮明度を維持したまま DataURL 化（最大 512KB）
  if (file.type === "image/svg+xml") {
    if (file.size > 512 * 1024) {
      throw new Error("SVG画像は 512KB 以下のファイルを選択してください");
    }
    const svgDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("SVGファイルの読み込みに失敗しました"));
      reader.readAsDataURL(file);
    });
    return { dataUrl: svgDataUrl, mimeType: "image/svg+xml" };
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("画像ファイルの読み込みに失敗しました"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("画像のデコードに失敗しました"));
    el.src = rawDataUrl;
  });

  const MAX_SIDE = 512;
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width || 1, img.height || 1));
  const targetW = Math.max(1, Math.round(img.width * scale));
  const targetH = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return { dataUrl: rawDataUrl, mimeType: file.type || "image/png" };
  }
  ctx.clearRect(0, 0, targetW, targetH);
  ctx.drawImage(img, 0, 0, targetW, targetH);

  // PNG / WebP は透過背景を保持、JPEG は高画質圧縮
  const keepAlpha = file.type === "image/png" || file.type === "image/webp";
  const outputMime = keepAlpha ? "image/png" : "image/jpeg";
  let dataUrl = keepAlpha
    ? canvas.toDataURL("image/png")
    : canvas.toDataURL("image/jpeg", 0.88);

  // 万一 PNG が大きい場合は WebP へフォールバック圧縮
  if (dataUrl.length > 2_000_000) {
    dataUrl = canvas.toDataURL("image/webp", 0.85);
    return { dataUrl, mimeType: "image/webp" };
  }

  return { dataUrl, mimeType: outputMime };
}

const MONTH_SELECT_OPTIONS: LiffSelectOption[] = Array.from({ length: 12 }, (_, idx) => {
  const m = idx + 1;
  return {
    value: String(m),
    label: `${m}月`,
  };
});

const DEFAULT_TARGET_GROUPS = [
  "全体",
  "Aチーム",
  "Bチーム",
  "高学年",
  "低学年",
];

export default function LiffTeamSettingsPage() {
  const {
    currentTeam,
    profile,
    refreshTeams,
    updateCurrentTeamLogo,
    updateCurrentTeamCover,
  } = useLiff();
  const activePracticeLabel = usePracticeMatchLabel();
  const logoFileInputRef = useRef<HTMLInputElement | null>(null);

  // チーム表示設定ステート
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(
    currentTeam?.logoImageUrl || null
  );
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(
    currentTeam?.coverImageUrl || null
  );
  const [isCoverModalOpen, setIsCoverModalOpen] = useState(false);
  const [isRemovingCover, setIsRemovingCover] = useState(false);
  const [customPracticeLabelInput, setCustomPracticeLabelInput] =
    useState<string>(activePracticeLabel);
  const [isSavingPracticeLabel, setIsSavingPracticeLabel] = useState(false);

  // 活動区分・班設定
  const [targetGroups, setTargetGroups] = useState<string[]>(
    DEFAULT_TARGET_GROUPS
  );
  const [newGroupInput, setNewGroupInput] = useState("");

  // ⏰ 予定スケジューラーの初期時間設定（午前・午後／季節別）
  const [scheduleTimes, setScheduleTimes] = useState<TeamScheduleDefaultTimes>(() =>
    loadCachedTeamScheduleDefaultTimes(currentTeam?.id || "demo-team")
  );
  const [isSavingScheduleTimes, setIsSavingScheduleTimes] = useState(false);

  useEffect(() => {
    setCustomPracticeLabelInput(activePracticeLabel);
  }, [activePracticeLabel, currentTeam?.id]);

  useEffect(() => {
    setIsCoverModalOpen(false);
  }, [currentTeam?.id]);

  // 初期ロード＆チーム切替時の同期（前チームの値が残らないよう未保存時は初期値へリセット）
  useEffect(() => {
    if (typeof window === "undefined") return;

    const tid = currentTeam?.id || "demo-team";
    setLogoPreviewUrl(currentTeam?.logoImageUrl || null);
    setCoverPreviewUrl(currentTeam?.coverImageUrl || null);
    setScheduleTimes(loadCachedTeamScheduleDefaultTimes(tid));

    let cancelled = false;
    if (tid !== "demo-team" && !currentTeam?.isDemo) {
      void (async () => {
        try {
          const res = await fetch(
            `/api/liff/schedule-default-times?teamId=${encodeURIComponent(tid)}`
          );
          if (!res.ok) return;
          const data = (await res.json()) as ScheduleDefaultTimesApiResponse;
          if (!cancelled && data.success && data.scheduleDefaultTimes) {
            const normalized = normalizeTeamScheduleDefaultTimes(data.scheduleDefaultTimes);
            setScheduleTimes(normalized);
            saveCachedTeamScheduleDefaultTimes(tid, normalized);
          }
        } catch (err) {
          console.error("Failed to fetch schedule default times:", err);
        }
      })();
    }

    try {
      const savedGroups = localStorage.getItem(`iscore_team_target_groups_${tid}`);
      if (savedGroups) {
        const parsed = JSON.parse(savedGroups) as unknown;
        if (
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          parsed.every((item): item is string => typeof item === "string")
        ) {
          setTargetGroups(parsed);
        } else {
          setTargetGroups(DEFAULT_TARGET_GROUPS);
        }
      } else {
        setTargetGroups(DEFAULT_TARGET_GROUPS);
      }
    } catch (e) {
      console.error("Failed to load team settings", e);
      setTargetGroups(DEFAULT_TARGET_GROUPS);
    }

    return () => {
      cancelled = true;
    };
  }, [
    currentTeam?.id,
    currentTeam?.isDemo,
    currentTeam?.logoImageUrl,
    currentTeam?.coverImageUrl,
  ]);

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const targetTeamId = currentTeam?.id || "demo-team";
    setIsUploadingLogo(true);
    try {
      const { dataUrl, mimeType } = await compressTeamLogoImage(file);
      const res = await fetch(`/api/liff/teams/${encodeURIComponent(targetTeamId)}/logo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: dataUrl,
          mimeType,
        }),
      });
      const data = (await res.json()) as TeamLogoApiResponse;
      if (!res.ok || !data.success || !data.logoImageUrl) {
        throw new Error(data.error || "チームロゴの保存に失敗しました");
      }

      setLogoPreviewUrl(data.logoImageUrl);
      updateCurrentTeamLogo(data.logoImageUrl);
      invalidateLiffApiCache();
      if (!data.isDemo) {
        void refreshTeams();
      }
      toast.success("チームロゴを更新しました");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "チームロゴの保存に失敗しました";
      toast.error(msg);
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!logoPreviewUrl || isUploadingLogo) return;
    const targetTeamId = currentTeam?.id || "demo-team";
    setIsUploadingLogo(true);
    try {
      const res = await fetch(`/api/liff/teams/${encodeURIComponent(targetTeamId)}/logo`, {
        method: "DELETE",
      });
      const data = (await res.json()) as TeamLogoApiResponse;
      if (!res.ok || !data.success) {
        throw new Error(data.error || "チームロゴの削除に失敗しました");
      }

      setLogoPreviewUrl(null);
      updateCurrentTeamLogo(undefined);
      invalidateLiffApiCache();
      if (!data.isDemo) {
        void refreshTeams();
      }
      toast.success("チームロゴを削除しました");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "チームロゴの削除に失敗しました";
      toast.error(msg);
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleRestoreDemoDefaultLogo = () => {
    if (isUploadingLogo) return;
    setLogoPreviewUrl(DEMO_TEAM_DEFAULT_LOGO_URL);
    updateCurrentTeamLogo(DEMO_TEAM_DEFAULT_LOGO_URL);
    invalidateLiffApiCache();
    toast.success("デモチームの初期ロゴに戻しました");
  };

  const handleRemoveCover = async () => {
    if (!coverPreviewUrl || isRemovingCover) return;
    const targetTeamId = currentTeam?.id || "demo-team";
    setIsRemovingCover(true);
    try {
      const query = new URLSearchParams();
      if (profile?.userId) query.set("userId", profile.userId);
      if (profile?.displayName) query.set("userName", profile.displayName);
      const qs = query.toString() ? `?${query.toString()}` : "";

      const res = await fetch(
        `/api/liff/teams/${encodeURIComponent(targetTeamId)}/cover${qs}`,
        {
          method: "DELETE",
        }
      );
      const data = (await res.json()) as TeamCoverApiResponse;
      if (!res.ok || !data.success) {
        throw new Error(data.error || "チームヘッダー背景画像の削除に失敗しました");
      }

      setCoverPreviewUrl(null);
      updateCurrentTeamCover(undefined);
      invalidateLiffApiCache();
      if (!data.isDemo) {
        void refreshTeams();
      }
      toast.success("チームヘッダー背景画像を削除しました");
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "チームヘッダー背景画像の削除に失敗しました";
      toast.error(msg);
    } finally {
      setIsRemovingCover(false);
    }
  };

  const saveSetting = (key: string, value: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(key, value);
    }
  };

  const persistPracticeMatchLabel = async (
    rawLabel: string,
    silentToast = false
  ) => {
    const nextLabel = sanitizePracticeMatchLabel(
      rawLabel,
      DEFAULT_PRACTICE_MATCH_LABEL
    );
    const targetTeamId = currentTeam?.id || "demo-team";
    setCustomPracticeLabelInput(nextLabel);
    saveTeamPracticeMatchLabel(targetTeamId, nextLabel, true);

    setIsSavingPracticeLabel(true);
    try {
      const res = await fetch("/api/liff/scorebook/symbol-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: targetTeamId,
          practiceMatchLabel: nextLabel,
        }),
      });
      const data = (await res.json()) as SavePracticeLabelApiResponse;
      if (!res.ok || !data.success) {
        throw new Error(data.error || "練習試合の呼称の保存に失敗しました");
      }
      invalidateLiffApiCache();
      if (targetTeamId !== "demo-team" && !currentTeam?.isDemo) {
        void refreshTeams();
      }
      if (!silentToast) {
        toast.success(`練習試合の呼称を「${nextLabel}」に設定しました`);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "練習試合の呼称の保存に失敗しました";
      toast.error(msg);
    } finally {
      setIsSavingPracticeLabel(false);
    }
  };

  const persistScheduleDefaultTimes = async (
    nextConfig: TeamScheduleDefaultTimes,
    silentToast = false
  ) => {
    const targetTeamId = currentTeam?.id || "demo-team";
    const normalized = normalizeTeamScheduleDefaultTimes(nextConfig);
    setScheduleTimes(normalized);
    saveCachedTeamScheduleDefaultTimes(targetTeamId, normalized);

    setIsSavingScheduleTimes(true);
    try {
      const res = await fetch("/api/liff/schedule-default-times", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: targetTeamId,
          scheduleDefaultTimes: normalized,
        }),
      });
      const data = (await res.json()) as ScheduleDefaultTimesApiResponse;
      if (!res.ok || !data.success) {
        throw new Error(data.error || "初期時間設定の保存に失敗しました");
      }
      invalidateLiffApiCache();
      if (!silentToast) {
        toast.success("予定スケジューラーの初期時間を保存しました");
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "初期時間設定の保存に失敗しました";
      toast.error(msg);
    } finally {
      setIsSavingScheduleTimes(false);
    }
  };

  const handleToggleSummerMonth = (month: number) => {
    setScheduleTimes((prev) => {
      const set = new Set(prev.summerMonths);
      if (set.has(month)) {
        set.delete(month);
      } else {
        set.add(month);
      }
      return {
        ...prev,
        summerMonths: Array.from(set).sort((a, b) => a - b),
      };
    });
  };

  const handleResetScheduleTimes = () => {
    const resetValue: TeamScheduleDefaultTimes = {
      ...DEFAULT_TEAM_SCHEDULE_TIMES,
      summerMonths: [...DEFAULT_TEAM_SCHEDULE_TIMES.summerMonths],
    };
    void persistScheduleDefaultTimes(resetValue, false);
  };

  const handleSaveAll = () => {
    const tid = currentTeam?.id || "demo-team";
    saveSetting(`iscore_team_target_groups_${tid}`, JSON.stringify(targetGroups));
    const trimmedPractice = customPracticeLabelInput.trim();
    if (trimmedPractice && trimmedPractice !== activePracticeLabel) {
      void persistPracticeMatchLabel(trimmedPractice, true);
    }
    void persistScheduleDefaultTimes(scheduleTimes, true);
    toast.success("チーム表示・予定設定を保存しました");
  };

  const handleAddGroup = () => {
    const trimmed = newGroupInput.trim();
    if (!trimmed) return;
    if (targetGroups.includes(trimmed)) {
      toast.error("既に同じ名前のグループがあります");
      return;
    }
    const updated = [...targetGroups, trimmed];
    setTargetGroups(updated);
    setNewGroupInput("");
    saveSetting(`iscore_team_target_groups_${currentTeam?.id || "default"}`, JSON.stringify(updated));
    toast.success(`「${trimmed}」を追加しました`);
  };

  const handleRemoveGroup = (name: string) => {
    if (name === "全体") {
      toast.error("「全体」は削除できません");
      return;
    }
    const updated = targetGroups.filter((g) => g !== name);
    setTargetGroups(updated);
    saveSetting(`iscore_team_target_groups_${currentTeam?.id || "default"}`, JSON.stringify(updated));
    toast.success(`「${name}」を削除しました`);
  };

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader
        shareData={{
          title: "チーム表示・予定設定 - iScoreCloud LINEミニアプリ",
          text: "ロゴ・背景写真・練習試合呼称・予定の標準時間設定",
        }}
      />

      <div className="p-4 space-y-4 max-w-lg mx-auto w-full">
        <LiffPageHeader
          title="チーム表示・予定設定"
          subtitle="ロゴ・背景写真・練習試合呼称・予定の標準時間"
          icon={
            <span className="w-8 h-8 rounded-xl bg-slate-500/12 text-slate-700 dark:text-slate-300 flex items-center justify-center font-black">
              <SlidersHorizontal className="w-4 h-4" />
            </span>
          }
          showBack
        />

        {/* チーム管理メニュー（組織・権限・車両）への直通ショートカット */}
        <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="px-4 py-2 bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 flex items-center justify-between gap-2">
            <span className="text-xs font-black text-white">
              チーム管理マスタ（組織・権限・車両）
            </span>
            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[9.5px] font-black">
              管理者専用
            </span>
          </div>
          <div className="p-3 grid grid-cols-3 gap-2 text-xs">
            <Link
              href="/liff/admin/teams"
              className="p-2.5 rounded-xl border border-border bg-background hover:bg-muted flex flex-col justify-between gap-1"
            >
              <div className="flex items-center justify-between">
                <Layers className="w-3.5 h-3.5 text-primary" />
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              </div>
              <span className="font-black text-foreground">チーム・編成</span>
              <span className="text-[10px] font-bold text-muted-foreground">
                名称・A/B編成
              </span>
            </Link>
            <Link
              href="/liff/admin/roles"
              className="p-2.5 rounded-xl border border-border bg-background hover:bg-muted flex flex-col justify-between gap-1"
            >
              <div className="flex items-center justify-between">
                <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              </div>
              <span className="font-black text-foreground">権限・役職</span>
              <span className="text-[10px] font-bold text-muted-foreground">
                兼務・役職呼称
              </span>
            </Link>
            <Link
              href="/liff/admin/cars"
              className="p-2.5 rounded-xl border border-border bg-background hover:bg-muted flex flex-col justify-between gap-1"
            >
              <div className="flex items-center justify-between">
                <Car className="w-3.5 h-3.5 text-teal-600" />
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              </div>
              <span className="font-black text-foreground">車両・バス</span>
              <span className="text-[10px] font-bold text-muted-foreground">
                マイクロ・道具車
              </span>
            </Link>
          </div>
        </section>

        {/* ━━━ セクション 1: 🛡️ チームロゴ・背景・表示呼称 ━━━ */}
        <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-slate-500 px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-7 h-7 rounded-xl bg-slate-800 text-slate-200 border border-slate-700 flex items-center justify-center shrink-0">
                <Building className="w-4 h-4" />
              </span>
              <h2 className="text-sm font-black text-white truncate">ロゴ・背景写真・表示呼称</h2>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 shrink-0">
              チーム共通
            </span>
          </div>

          <div className="p-4 space-y-3.5">
            {/* チームロゴ設定 */}
            <div className="space-y-2 pb-3.5 border-b border-border">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-foreground">
                  チームロゴ（エンブレム）
                </label>
                <span className="text-[10px] font-bold text-muted-foreground">
                  透過PNG・JPG・WebP・SVG対応
                </span>
              </div>

              <div className="flex items-center gap-3.5 p-3 rounded-xl bg-muted/40 border border-border">
                <div className="w-16 h-16 rounded-2xl border border-border bg-card shadow-2xs flex items-center justify-center overflow-hidden shrink-0">
                  {logoPreviewUrl ? (
                    <img
                      src={logoPreviewUrl}
                      alt="チームロゴ"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-sm font-black text-primary select-none">
                      {(currentTeam?.orgName || currentTeam?.name || "TM")
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  <p className="text-[11px] font-bold text-muted-foreground leading-snug">
                    上部ヘッダー・チーム切替メニュー・選手名鑑などに表示されます。
                  </p>

                  <input
                    ref={logoFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={handleLogoFileChange}
                    className="hidden"
                  />

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isUploadingLogo}
                      onClick={() => logoFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black shadow-2xs active:scale-95 transition-all cursor-pointer disabled:opacity-60"
                    >
                      {isUploadingLogo ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                          <span>反映中...</span>
                        </>
                      ) : (
                        <>
                          <ImagePlus className="w-3.5 h-3.5 shrink-0" />
                          <span>{logoPreviewUrl ? "ロゴを変更" : "ロゴを設定"}</span>
                        </>
                      )}
                    </button>

                    {logoPreviewUrl && (
                      <button
                        type="button"
                        disabled={isUploadingLogo}
                        onClick={handleRemoveLogo}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-card hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs font-black active:scale-95 transition-all cursor-pointer disabled:opacity-60"
                      >
                        <Trash2 className="w-3.5 h-3.5 shrink-0" />
                        <span>削除</span>
                      </button>
                    )}

                    {(currentTeam?.id === "demo-team" || currentTeam?.isDemo) &&
                      logoPreviewUrl !== DEMO_TEAM_DEFAULT_LOGO_URL && (
                        <button
                          type="button"
                          disabled={isUploadingLogo}
                          onClick={handleRestoreDemoDefaultLogo}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-card hover:bg-muted border border-border text-foreground text-xs font-black active:scale-95 transition-all cursor-pointer disabled:opacity-60"
                        >
                          <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                          <span>初期ロゴに戻す</span>
                        </button>
                      )}
                  </div>
                </div>
              </div>
            </div>

            {/* チームヘッダー背景画像（カバー写真） */}
            <div className="space-y-2 pb-3.5 border-b border-border">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-foreground">
                  チームヘッダー背景画像（カバー写真）
                </label>
                <span className="text-[10px] font-bold text-muted-foreground">
                  横ワイド 12:5 自動トリミング
                </span>
              </div>

              <div className="rounded-xl bg-muted/40 border border-border overflow-hidden">
                {/* 境界オーバーラップ・ミニプレビュー */}
                <div className="relative aspect-[12/5] w-full bg-[#0f172a] border-b-[3px] border-primary overflow-hidden">
                  {coverPreviewUrl ? (
                    <>
                      <img
                        src={coverPreviewUrl}
                        alt="チームヘッダー背景"
                        className="w-full h-full object-cover object-center select-none pointer-events-none"
                      />
                      <div
                        className="absolute inset-0 bg-slate-950/20 pointer-events-none"
                        aria-hidden="true"
                      />
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-slate-400">
                      <ImageIcon className="w-5 h-5 text-slate-500" />
                      <span className="text-[10px] font-bold text-slate-400">
                        背景画像 未設定（標準ダークスレート背景）
                      </span>
                    </div>
                  )}
                  <span className="absolute top-2 left-2.5 px-2 py-0.5 rounded bg-slate-900/85 border border-slate-700 text-[9px] font-black text-slate-100 tracking-wider">
                    選手名鑑ヘッダー プレビュー
                  </span>
                </div>

                <div className="p-3 pt-2 bg-card flex items-start gap-3">
                  <div className="-mt-7 relative z-10 w-12 h-12 rounded-full border-[3px] border-card bg-card shadow-xs ring-1 ring-border flex items-center justify-center overflow-hidden shrink-0">
                    {logoPreviewUrl ? (
                      <img
                        src={logoPreviewUrl}
                        alt=""
                        width={48}
                        height={48}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-xs font-black text-primary select-none">
                        {(currentTeam?.orgName || currentTeam?.name || "TM")
                          .slice(0, 2)
                          .toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <p className="text-[11px] font-bold text-muted-foreground leading-snug">
                      選手名鑑ページ上部のチーム情報ヘッダー背景に表示されます（集合写真・円陣・ホームグラウンド写真など）。
                    </p>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={isRemovingCover}
                        onClick={() => setIsCoverModalOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black shadow-2xs active:scale-95 transition-all cursor-pointer disabled:opacity-60"
                      >
                        <ImagePlus className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {coverPreviewUrl ? "背景画像を変更" : "背景画像を設定"}
                        </span>
                      </button>

                      {coverPreviewUrl && (
                        <button
                          type="button"
                          disabled={isRemovingCover}
                          onClick={() => void handleRemoveCover()}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-card hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs font-black active:scale-95 transition-all cursor-pointer disabled:opacity-60"
                        >
                          {isRemovingCover ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span>削除</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* クラブ名称・カテゴリー・編成変更への案内（重複排除） */}
            <Link
              href="/liff/admin/teams"
              className="flex items-center justify-between gap-2.5 p-3 rounded-xl bg-muted/40 hover:bg-muted border border-border transition-colors"
            >
              <div className="min-w-0">
                <p className="text-xs font-black text-foreground truncate">
                  現在の表示チーム：{currentTeam?.name || "チーム"}
                </p>
                <p className="text-[10.5px] font-bold text-muted-foreground leading-snug mt-0.5">
                  クラブ名称・所属カテゴリー・A/B編成の追加は「チーム・編成管理」で行えます
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </Link>

            {/* 練習試合の呼称設定（練習試合 / OP戦 / オープン戦 / 自由入力） */}
            <div className="space-y-2.5 pt-3 border-t border-border">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-black text-foreground">
                  練習試合の呼称（チーム共通表記）
                </label>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#0f172a] text-slate-100 text-[10px] font-black shrink-0">
                  <span>現在:</span>
                  <span>⚾ {activePracticeLabel}</span>
                </span>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                {PRACTICE_MATCH_LABEL_PRESETS.map((preset) => {
                  const isSelected = activePracticeLabel === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      disabled={isSavingPracticeLabel}
                      onClick={() => void persistPracticeMatchLabel(preset)}
                      className={cn(
                        "py-2 px-2 rounded-xl border text-xs transition-all cursor-pointer active:scale-95 disabled:opacity-60 truncate",
                        isSelected
                          ? "border-2 border-primary bg-primary/10 text-primary font-black shadow-2xs"
                          : "border-border bg-muted/35 hover:bg-muted text-foreground font-bold"
                      )}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={12}
                  value={customPracticeLabelInput}
                  onChange={(e) => setCustomPracticeLabelInput(e.target.value)}
                  placeholder="自由入力 (例: 練習戦, 紅白戦, TM)"
                  className="flex-1 px-3 py-1.5 rounded-xl bg-muted/35 border border-border text-xs font-bold text-foreground focus:outline-hidden focus:border-primary"
                />
                <button
                  type="button"
                  disabled={
                    isSavingPracticeLabel ||
                    !customPracticeLabelInput.trim() ||
                    customPracticeLabelInput.trim() === activePracticeLabel
                  }
                  onClick={() =>
                    void persistPracticeMatchLabel(customPracticeLabelInput)
                  }
                  className="py-1.5 px-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black active:scale-95 transition-all cursor-pointer disabled:opacity-45 shrink-0"
                >
                  {isSavingPracticeLabel ? "保存中..." : "適用"}
                </button>
              </div>

              <p className="text-[10px] text-muted-foreground font-bold leading-relaxed">
                ※ 試合カード・チーム成績・個人成績・スタメン編成・試合速報ジェネレータなどの表記にチーム全体で反映されます
              </p>
            </div>
          </div>
        </section>

        {/* ━━━ セクション 2: 👥 活動グループ（班分け） ━━━ */}
        <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-slate-500 px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-7 h-7 rounded-xl bg-slate-800 text-slate-200 border border-slate-700 flex items-center justify-center shrink-0">
                <Layers className="w-4 h-4" />
              </span>
              <h2 className="text-sm font-black text-white truncate">活動グループ（チーム区分）</h2>
            </div>
            <span className="text-[10px] font-bold text-slate-300 shrink-0">予定作成時に選択可能</span>
          </div>

          <div className="p-4 space-y-3.5">
            <div className="flex flex-wrap gap-1.5">
              {targetGroups.map((group) => (
                <span
                  key={group}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-muted/50 border border-border text-xs font-black text-foreground"
                >
                  <span>{group}</span>
                  {group !== "全体" && (
                    <button
                      type="button"
                      onClick={() => handleRemoveGroup(group)}
                      className="text-muted-foreground hover:text-destructive font-bold ml-0.5 cursor-pointer"
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={newGroupInput}
                onChange={(e) => setNewGroupInput(e.target.value)}
                placeholder="新しい区分 (例: ジュニア組, Cチーム)"
                className="flex-1 px-3 py-1.5 rounded-xl bg-muted/35 border border-border text-xs font-bold text-foreground focus:outline-hidden focus:border-primary"
              />
              <button
                type="button"
                onClick={handleAddGroup}
                className="py-1.5 px-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black active:scale-95 transition-all cursor-pointer"
              >
                追加
              </button>
            </div>
          </div>
        </section>

        {/* ━━━ セクション 3: ⏰ 予定スケジューラーの初期時間設定（午前・午後／季節別） ━━━ */}
        {(() => {
          const winterMonths = getWinterMonths(scheduleTimes.summerMonths);
          const summerRange = detectContiguousMonthRange(scheduleTimes.summerMonths);
          const summerLabel = formatMonthSetLabel(scheduleTimes.summerMonths);
          const winterLabel = formatMonthSetLabel(winterMonths);

          return (
            <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-teal-500 px-4 py-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-7 h-7 rounded-xl bg-teal-500/20 text-teal-300 border border-teal-400/30 flex items-center justify-center shrink-0">
                    <Clock className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-black text-white truncate">
                      予定スケジューラーの初期時間
                    </h2>
                    <p className="text-[10px] font-bold text-slate-300 truncate">
                      活動日作成時の午前・午後（季節／月別）のデフォルト時間
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-800 text-teal-300 border border-slate-700 shrink-0">
                  チーム共通
                </span>
              </div>

              <div className="p-4 space-y-4">
                {/* 1. ☀️ 午前のデフォルト時間 */}
                <div className="p-3 rounded-2xl bg-muted/35 border border-border space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30 text-[10.5px] font-black">
                        ☀️ 午前
                      </span>
                      <span>午前の活動時間（通年共通）</span>
                    </span>
                    <span className="text-[10.5px] font-black text-foreground tabular-nums">
                      {scheduleTimes.amStart}〜{scheduleTimes.amEnd}
                    </span>
                  </div>

                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <LiffSelect
                      value={scheduleTimes.amStart}
                      onChange={(val) =>
                        setScheduleTimes((prev) => ({ ...prev, amStart: val }))
                      }
                      options={SCHEDULE_TIME_OPTIONS}
                      title="午前の開始時刻"
                      accent="teal"
                      size="sm"
                      searchable={false}
                      className="w-full"
                    />
                    <span className="text-xs font-black text-muted-foreground">〜</span>
                    <LiffSelect
                      value={scheduleTimes.amEnd}
                      onChange={(val) =>
                        setScheduleTimes((prev) => ({ ...prev, amEnd: val }))
                      }
                      options={SCHEDULE_TIME_OPTIONS}
                      title="午前の終了時刻"
                      accent="teal"
                      size="sm"
                      searchable={false}
                      className="w-full"
                    />
                  </div>
                </div>

                {/* 2. 🌙 午後のデフォルト時間（季節・対象月別） */}
                <div className="p-3 rounded-2xl bg-muted/35 border border-border space-y-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 text-[10.5px] font-black">
                          🌙 午後
                        </span>
                        <span>午後の活動時間（対象月で自動切替）</span>
                      </span>
                    </div>
                    <p className="text-[10.5px] font-bold text-muted-foreground leading-relaxed">
                      日没時間に合わせて、通常期（夏時間）と冬時間の対象月・終了時刻を分けて設定できます。
                    </p>
                  </div>

                  {/* 📅 対象月セレクター（範囲一括指定 ＋ 1〜12月個別トグル） */}
                  <div className="p-3 rounded-xl bg-card border border-border space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-black text-foreground flex items-center gap-1">
                        <CalendarDays className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                        <span>通常・夏時間の対象月を選択</span>
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground">
                        残りの月は自動で冬時間
                      </span>
                    </div>

                    {/* 開始月〜終了月の範囲選択 */}
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <LiffSelect
                        value={String(summerRange?.startMonth ?? (scheduleTimes.summerMonths[0] || 4))}
                        onChange={(val) => {
                          const nextStart = Number(val);
                          const curEnd =
                            summerRange?.endMonth ??
                            (scheduleTimes.summerMonths[scheduleTimes.summerMonths.length - 1] || 10);
                          setScheduleTimes((prev) => ({
                            ...prev,
                            summerMonths: buildContiguousMonths(nextStart, curEnd),
                          }));
                        }}
                        options={MONTH_SELECT_OPTIONS}
                        title="通常・夏時間の開始月"
                        accent="teal"
                        size="sm"
                        searchable={false}
                        className="w-full"
                      />
                      <span className="text-[11px] font-black text-muted-foreground">〜</span>
                      <LiffSelect
                        value={String(
                          summerRange?.endMonth ??
                            (scheduleTimes.summerMonths[scheduleTimes.summerMonths.length - 1] || 10)
                        )}
                        onChange={(val) => {
                          const nextEnd = Number(val);
                          const curStart =
                            summerRange?.startMonth ?? (scheduleTimes.summerMonths[0] || 4);
                          setScheduleTimes((prev) => ({
                            ...prev,
                            summerMonths: buildContiguousMonths(curStart, nextEnd),
                          }));
                        }}
                        options={MONTH_SELECT_OPTIONS}
                        title="通常・夏時間の終了月"
                        accent="teal"
                        size="sm"
                        searchable={false}
                        className="w-full"
                      />
                    </div>

                    {/* 1月〜12月 個別タップ切替ピル */}
                    <div className="grid grid-cols-6 gap-1.5 pt-0.5">
                      {Array.from({ length: 12 }, (_, idx) => {
                        const m = idx + 1;
                        const isSummer = scheduleTimes.summerMonths.includes(m);
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => handleToggleSummerMonth(m)}
                            className={cn(
                              "py-1.5 rounded-lg text-[11px] font-black border transition-all active:scale-95 cursor-pointer tabular-nums",
                              isSummer
                                ? "bg-teal-600 text-white border-teal-600 shadow-2xs"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-border hover:border-teal-500/40"
                            )}
                            title={
                              isSummer
                                ? `${m}月: 通常・夏時間（タップで冬時間へ切替）`
                                : `${m}月: 冬時間（タップで通常・夏時間へ切替）`
                            }
                          >
                            {m}月
                          </button>
                        );
                      })}
                    </div>

                    {/* 区分サマリーバッジ */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[10px] font-black">
                      <span className="px-2 py-0.5 rounded-md bg-teal-600 text-white">
                        ☀️ 通常・夏時間: {summerLabel}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-700 text-white">
                        ❄️ 冬時間: {winterLabel}
                      </span>
                    </div>
                  </div>

                  {/* ☀️ 通常・夏時間（例: 4月〜10月）の午後時刻 */}
                  <div className="p-3 rounded-xl bg-card border border-teal-500/35 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-black text-foreground flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-teal-600 shrink-0" />
                        <span>通常・夏時間の午後（{summerLabel}）</span>
                      </span>
                      <span className="text-[10.5px] font-black text-teal-700 dark:text-teal-300 tabular-nums shrink-0">
                        {scheduleTimes.summerPmStart}〜{scheduleTimes.summerPmEnd}
                      </span>
                    </div>

                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <LiffSelect
                        value={scheduleTimes.summerPmStart}
                        onChange={(val) =>
                          setScheduleTimes((prev) => ({ ...prev, summerPmStart: val }))
                        }
                        options={SCHEDULE_TIME_OPTIONS}
                        title={`通常・夏時間（${summerLabel}）の午後開始時刻`}
                        accent="teal"
                        size="sm"
                        searchable={false}
                        className="w-full"
                      />
                      <span className="text-xs font-black text-muted-foreground">〜</span>
                      <LiffSelect
                        value={scheduleTimes.summerPmEnd}
                        onChange={(val) =>
                          setScheduleTimes((prev) => ({ ...prev, summerPmEnd: val }))
                        }
                        options={SCHEDULE_TIME_OPTIONS}
                        title={`通常・夏時間（${summerLabel}）の午後終了時刻`}
                        accent="teal"
                        size="sm"
                        searchable={false}
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* ❄️ 冬時間・日没短縮（例: 11月〜3月）の午後時刻 */}
                  <div className="p-3 rounded-xl bg-card border border-slate-400/50 dark:border-slate-600 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-black text-foreground flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-slate-600 shrink-0" />
                        <span>冬時間・日没短縮の午後（{winterLabel}）</span>
                      </span>
                      <span className="text-[10.5px] font-black text-slate-700 dark:text-slate-300 tabular-nums shrink-0">
                        {scheduleTimes.winterPmStart}〜{scheduleTimes.winterPmEnd}
                      </span>
                    </div>

                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <LiffSelect
                        value={scheduleTimes.winterPmStart}
                        onChange={(val) =>
                          setScheduleTimes((prev) => ({ ...prev, winterPmStart: val }))
                        }
                        options={SCHEDULE_TIME_OPTIONS}
                        title={`冬時間（${winterLabel}）の午後開始時刻`}
                        accent="teal"
                        size="sm"
                        searchable={false}
                        className="w-full"
                      />
                      <span className="text-xs font-black text-muted-foreground">〜</span>
                      <LiffSelect
                        value={scheduleTimes.winterPmEnd}
                        onChange={(val) =>
                          setScheduleTimes((prev) => ({ ...prev, winterPmEnd: val }))
                        }
                        options={SCHEDULE_TIME_OPTIONS}
                        title={`冬時間（${winterLabel}）の午後終了時刻`}
                        accent="teal"
                        size="sm"
                        searchable={false}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* セクション内アクションバー（初期値リセット ＆ 即時保存） */}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isSavingScheduleTimes}
                    onClick={handleResetScheduleTimes}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-border bg-card hover:bg-muted text-xs font-black text-muted-foreground hover:text-foreground active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                    <span>初期値に戻す</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSavingScheduleTimes}
                    onClick={() => void persistScheduleDefaultTimes(scheduleTimes, false)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black shadow-2xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSavingScheduleTimes ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                        <span>保存中...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5 shrink-0" />
                        <span>初期時間を保存</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </section>
          );
        })()}

        {/* ━━━ セクション 4: 🏟️ 関連する規定・管理画面への移動 ━━━ */}
        <section className="space-y-2.5">
          <p className="text-[11px] font-black text-muted-foreground tracking-wide pl-1">
            関連する規定・管理メニュー
          </p>

          <Link
            href="/liff/settings/score"
            className="p-3.5 rounded-2xl border border-border bg-card shadow-xs hover:border-primary/40 flex items-center gap-3 group active:scale-98 transition-all"
          >
            <span className="w-10 h-10 rounded-xl bg-slate-500/12 text-slate-700 dark:text-slate-300 flex items-center justify-center font-black shrink-0 group-hover:scale-105 transition-transform">
              <BookOpen className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-foreground truncate">
                スコア・試合規定（記号流儀・早見表）
              </p>
              <p className="text-[10px] text-muted-foreground font-bold truncate">
                規定イニング・コールド・守備表記・スコア記号早見表の登録
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0" />
          </Link>

          <div className="grid grid-cols-2 gap-2.5">
            <Link
              href="/liff/grounds"
              className="p-3.5 rounded-2xl border border-border bg-card shadow-xs hover:border-primary/40 flex items-center gap-3 group active:scale-95 transition-all"
            >
              <span className="w-10 h-10 rounded-xl bg-teal-500/12 text-teal-600 dark:text-teal-400 flex items-center justify-center font-black shrink-0 group-hover:scale-105 transition-transform">
                <MapPin className="w-5 h-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-foreground truncate">球場・施設マップ</p>
                <p className="text-[10px] text-muted-foreground font-bold truncate">アクセス・駐車規定</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-teal-600 dark:group-hover:text-teal-400 shrink-0" />
            </Link>

            <Link
              href="/liff/carpool"
              className="p-3.5 rounded-2xl border border-border bg-card shadow-xs hover:border-primary/40 flex items-center gap-3 group active:scale-95 transition-all"
            >
              <span className="w-10 h-10 rounded-xl bg-teal-500/12 text-teal-600 dark:text-teal-400 flex items-center justify-center font-black shrink-0 group-hover:scale-105 transition-transform">
                <Car className="w-5 h-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-foreground truncate">配車表</p>
                <p className="text-[10px] text-muted-foreground font-bold truncate">号車割り・隊列マップ</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-teal-600 dark:group-hover:text-teal-400 shrink-0" />
            </Link>
          </div>

          <Link
            href="/liff/admin?tab=invite"
            className="p-3.5 rounded-2xl border border-border bg-card shadow-xs hover:border-primary/40 flex items-center gap-3 group active:scale-98 transition-all"
          >
            <span className="w-10 h-10 rounded-xl bg-slate-500/12 text-slate-700 dark:text-slate-300 flex items-center justify-center font-black shrink-0 group-hover:scale-105 transition-transform">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-black text-foreground truncate">
                  参加承認・LINE招待（Google Maps連携）
                </p>
                <span className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-[9px] font-black shrink-0">
                  管理者専用
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground font-bold truncate">
                招待リンク共有・参加承認・隊列マップAPIキー設定
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0" />
          </Link>
        </section>

        {/* 💾 一括保存ボタン */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleSaveAll}
            className="w-full py-3.5 px-4 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xs shadow-xs active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>表示・予定設定を保存する</span>
          </button>
        </div>

        <div className="h-8 w-full shrink-0" aria-hidden="true" />
      </div>

      {isCoverModalOpen && (
        <TeamCoverPhotoModal
          isOpen={isCoverModalOpen}
          teamId={currentTeam?.id || "demo-team"}
          teamName={currentTeam?.orgName || currentTeam?.name || "チーム"}
          logoImageUrl={logoPreviewUrl}
          currentCoverUrl={coverPreviewUrl}
          userId={profile?.userId}
          userName={profile?.displayName}
          onClose={() => setIsCoverModalOpen(false)}
          onCoverUpdated={(nextCoverUrl) => {
            setCoverPreviewUrl(nextCoverUrl);
            updateCurrentTeamCover(nextCoverUrl || undefined);
            if (!(currentTeam?.id === "demo-team" || currentTeam?.isDemo)) {
              void refreshTeams();
            }
          }}
        />
      )}
    </div>
  );
}
