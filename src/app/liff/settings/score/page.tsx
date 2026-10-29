// filepath: src/app/liff/settings/score/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  BookOpen,
  Camera,
  ImagePlus,
  RotateCw,
  Sparkles,
  CheckCircle2,
  Trash2,
  Loader2,
  ZoomIn,
  X,
  ScanLine,
  ShieldCheck,
  ChevronRight,
  Sliders,
  Save,
  AlertCircle,
} from "lucide-react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { ScorebookCameraModal } from "@/components/liff/ScorebookCameraModal";
import { useLiff } from "@/components/liff/LiffProvider";
import { isAndroidClientDevice } from "@/lib/liff/liff-client";
import {
  ensureCompactApiImage,
  preprocessScorebookImage,
  type PreprocessedScorebookImage,
} from "@/lib/liff/scorebook-image";
import {
  DEFAULT_LIFF_SCORE_SETTINGS,
  loadLiffScoreSettings,
  saveLiffScoreSettings,
  type LiffScoreSettings,
  type ScoreDefaultMatchType,
} from "@/lib/liff/score-settings";
import type { ImportScopeMode } from "@/types/scorebook-v2";
import { toast } from "sonner";

interface ScoreContextApiResponse {
  success: boolean;
  isDemo?: boolean;
  team?: {
    id: string;
    name: string;
    scorebookLegendUrl: string | null;
  } | null;
  error?: string;
}

interface UpdateLegendApiResponse {
  success: boolean;
  teamId?: string;
  scorebookLegendUrl?: string | null;
  error?: string;
}

interface StagedLegendState {
  file: File;
  rotationDeg: 0 | 90 | 180 | 270;
  enhancePencil: boolean;
  processed: PreprocessedScorebookImage | null;
  isProcessing: boolean;
}

export default function LiffScoreSettingsPage() {
  const { currentTeam } = useLiff();

  const [isLoadingTeam, setIsLoadingTeam] = useState(true);
  const [resolvedTeamId, setResolvedTeamId] = useState<string>("");
  const [resolvedTeamName, setResolvedTeamName] = useState<string>("");
  const [savedLegendUrl, setSavedLegendUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [stagedLegend, setStagedLegend] = useState<StagedLegendState | null>(
    null
  );
  const [isSavingLegend, setIsSavingLegend] = useState(false);
  const [confirmClearLegend, setConfirmClearLegend] = useState(false);
  const [isZoomOpen, setIsZoomOpen] = useState(false);

  const [scoreSettings, setScoreSettings] = useState<LiffScoreSettings>(
    DEFAULT_LIFF_SCORE_SETTINGS
  );
  const [isAndroidClient, setIsAndroidClient] = useState(false);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const legendFileInputRef = useRef<HTMLInputElement | null>(null);
  const stageSeqRef = useRef<number>(0);
  const pickerCooldownRef = useRef<number>(0);

  const fileAcceptAttr = isAndroidClient
    ? "image/*,application/pdf,.jpg,.jpeg,.png,.webp,.heic,.heif"
    : "image/*";

  const openLegendAlbumPicker = () => {
    const now = Date.now();
    if (now - pickerCooldownRef.current < 500) {
      return;
    }
    pickerCooldownRef.current = now;
    const inputEl = legendFileInputRef.current;
    if (!inputEl) return;
    inputEl.value = "";
    inputEl.click();
  };

  // 1. 端末保存のスコア取込初期設定を読み込み
  useEffect(() => {
    setScoreSettings(loadLiffScoreSettings());
    setIsAndroidClient(isAndroidClientDevice());
  }, []);

  // 2. チーム登録済みの「スコア記号早見表」URLを取得
  const fetchTeamLegendContext = useCallback(async () => {
    try {
      setIsLoadingTeam(true);
      setErrorMessage(null);
      const qTeam = currentTeam?.id || "";
      const res = await fetch(
        `/api/liff/scorebook/context?teamId=${encodeURIComponent(qTeam)}`
      );
      const data = (await res.json()) as ScoreContextApiResponse;
      if (!data.success) {
        throw new Error(data.error || "チーム設定の取得に失敗しました");
      }

      if (data.team) {
        setResolvedTeamId(data.team.id);
        setResolvedTeamName(data.team.name);
        setSavedLegendUrl(data.team.scorebookLegendUrl);
      } else {
        setResolvedTeamId(qTeam);
        setResolvedTeamName(currentTeam?.name || "マイチーム");
        setSavedLegendUrl(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setIsLoadingTeam(false);
    }
  }, [currentTeam?.id, currentTeam?.name]);

  useEffect(() => {
    void fetchTeamLegendContext();
  }, [fetchTeamLegendContext]);

  // 3. 早見表画像のCanvas前処理（回転・濃さ強調・ウォッチドッグ付き）
  const runStagePreprocess = async (
    file: File,
    rotationDeg: 0 | 90 | 180 | 270,
    enhancePencil: boolean,
    fallbackProcessed: PreprocessedScorebookImage | null = null
  ) => {
    const seq = ++stageSeqRef.current;
    setStagedLegend({
      file,
      rotationDeg,
      enhancePencil,
      processed: fallbackProcessed,
      isProcessing: true,
    });
    setConfirmClearLegend(false);
    setErrorMessage(null);

    let watchdogId: ReturnType<typeof setTimeout> | null = null;
    try {
      const processed = await Promise.race([
        preprocessScorebookImage(file, {
          rotationDeg,
          enhancePencil,
          maxLongEdge: 1800,
        }),
        new Promise<never>((_, reject) => {
          watchdogId = setTimeout(() => {
            reject(
              new Error(
                "画像の最適化がタイムアウトしました。もう一度お試しください"
              )
            );
          }, 18000);
        }),
      ]);
      if (stageSeqRef.current !== seq) return;
      setStagedLegend({
        file,
        rotationDeg,
        enhancePencil,
        processed,
        isProcessing: false,
      });
    } catch (err) {
      if (stageSeqRef.current !== seq) return;
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`画像の読み込みに失敗しました: ${msg}`);
      if (fallbackProcessed) {
        setStagedLegend({
          file,
          rotationDeg,
          enhancePencil,
          processed: fallbackProcessed,
          isProcessing: false,
        });
      } else {
        setStagedLegend(null);
      }
    } finally {
      if (watchdogId) clearTimeout(watchdogId);
    }
  };

  const handleSelectLegendFile = (file: File | null) => {
    if (!file) return;
    const mime = (file.type || "").toLowerCase();
    const isImage =
      mime.startsWith("image/") ||
      (mime !== "application/pdf" &&
        /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name || ""));
    if (!isImage) {
      const msg =
        "PDF等の書類ではなく、早見表の写真（JPG・PNG画像）を選択してください";
      setErrorMessage(msg);
      toast.error(msg);
      return;
    }
    void runStagePreprocess(file, 0, false, null);
  };

  const handleLegendInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.currentTarget.files?.[0] ?? null;
    e.currentTarget.value = "";
    if (!picked) return;
    window.setTimeout(() => {
      handleSelectLegendFile(picked);
    }, 80);
  };

  const handleRotateStaged = () => {
    if (!stagedLegend || stagedLegend.isProcessing) return;
    const nextDeg = ((stagedLegend.rotationDeg + 90) % 360) as
      | 0
      | 90
      | 180
      | 270;
    void runStagePreprocess(
      stagedLegend.file,
      nextDeg,
      stagedLegend.enhancePencil,
      stagedLegend.processed
    );
  };

  const handleToggleEnhanceStaged = () => {
    if (!stagedLegend || stagedLegend.isProcessing) return;
    void runStagePreprocess(
      stagedLegend.file,
      stagedLegend.rotationDeg,
      !stagedLegend.enhancePencil,
      stagedLegend.processed
    );
  };

  // 4. R2 + D1 へスコア記号早見表を保存
  const handleSaveLegendToCloud = async () => {
    if (!stagedLegend?.processed || isSavingLegend) return;
    try {
      setIsSavingLegend(true);
      setErrorMessage(null);

      const compact = await ensureCompactApiImage(
        stagedLegend.processed,
        1800,
        0.88
      );

      const res = await fetch("/api/liff/scorebook/legend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: resolvedTeamId || currentTeam?.id || "",
          imageBase64: compact.base64,
          mimeType: compact.mimeType,
        }),
      });

      const data = (await res.json()) as UpdateLegendApiResponse;
      if (!res.ok || !data.success) {
        throw new Error(data.error || "早見表の保存に失敗しました");
      }

      setSavedLegendUrl(data.scorebookLegendUrl ?? null);
      setStagedLegend(null);
      toast.success(
        "スコア記号早見表を保存しました！次回の取り込みから自動適用されます"
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsSavingLegend(false);
    }
  };

  // 5. 登録済み早見表の解除
  const handleClearSavedLegend = async () => {
    if (isSavingLegend) return;
    try {
      setIsSavingLegend(true);
      setErrorMessage(null);

      const res = await fetch("/api/liff/scorebook/legend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: resolvedTeamId || currentTeam?.id || "",
          clear: true,
        }),
      });

      const data = (await res.json()) as UpdateLegendApiResponse;
      if (!res.ok || !data.success) {
        throw new Error(data.error || "早見表の解除に失敗しました");
      }

      setSavedLegendUrl(null);
      setConfirmClearLegend(false);
      toast.success("登録済みのスコア記号早見表を解除しました");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsSavingLegend(false);
    }
  };

  const updateLocalSetting = <K extends keyof LiffScoreSettings>(
    key: K,
    value: LiffScoreSettings[K],
    toastLabel: string
  ) => {
    const updated = saveLiffScoreSettings({ [key]: value });
    setScoreSettings(updated);
    toast.success(`${toastLabel}を変更しました`);
  };

  const previewImageUrl =
    stagedLegend?.processed?.dataUrl || savedLegendUrl || null;

  return (
    <div className="flex flex-col flex-1">
      <input
        ref={legendFileInputRef}
        type="file"
        accept={fileAcceptAttr}
        onChange={handleLegendInputChange}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      <ScorebookCameraModal
        isOpen={isCameraModalOpen}
        title="スコア記号早見表を撮影"
        hintText="記載例・記号早見表のページ全体が枠に入るよう撮影してください"
        onClose={() => setIsCameraModalOpen(false)}
        onCapture={(file) => handleSelectLegendFile(file)}
        onFallbackToFilePicker={() => openLegendAlbumPicker()}
      />

      <LiffHeader />

      <div className="p-4 space-y-4 max-w-lg mx-auto w-full">
        <LiffPageHeader
          title="スコア設定"
          subtitle="SCORE & AI IMPORT SETTINGS"
          icon={
            <span className="w-8 h-8 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black">
              <BookOpen className="w-4 h-4" />
            </span>
          }
          showBack
        />

        {errorMessage && (
          <div className="p-3.5 rounded-2xl bg-destructive/10 border border-destructive/30 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs font-bold text-destructive leading-relaxed">
              {errorMessage}
            </p>
          </div>
        )}

        {/* ━━━ セクション 1: 📘 スコア記号早見表（チーム共通・毎回自動参照） ━━━ */}
        <section className="rounded-3xl bg-card border-2 border-indigo-500/30 p-4 space-y-3.5 shadow-sm">
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-border/60">
            <div className="flex items-center gap-2 min-w-0">
              <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <h2 className="text-sm font-black text-foreground truncate">
                スコア記号早見表（チーム共通）
              </h2>
            </div>

            {isLoadingTeam ? (
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                確認中...
              </span>
            ) : stagedLegend ? (
              <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40 shrink-0">
                未保存プレビュー
              </span>
            ) : savedLegendUrl ? (
              <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 flex items-center gap-1 shrink-0">
                <CheckCircle2 className="w-3 h-3" />
                登録済み・自動適用中
              </span>
            ) : (
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border shrink-0">
                未登録（標準ルール）
              </span>
            )}
          </div>

          <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
            お使いのスコアブック表紙裏などの「記入例・記号早見表」を1度登録しておけば、
            <strong className="text-foreground font-black">
              毎回のスコアブック取り込みで添付し直す必要はありません。
            </strong>
            {resolvedTeamName ? `（${resolvedTeamName} 共通設定）` : ""}
          </p>

          {isLoadingTeam ? (
            <div className="py-10 rounded-2xl bg-muted/40 border border-border flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              <span className="text-xs font-bold text-muted-foreground">
                登録状況を読み込み中...
              </span>
            </div>
          ) : stagedLegend ? (
            /* 新しく選択した画像の保存前プレビュー＆回転補正 */
            <div className="space-y-3">
              <div className="relative rounded-2xl overflow-hidden bg-slate-950 border-2 border-amber-500/50 aspect-4/3 flex items-center justify-center">
                {stagedLegend.isProcessing || !stagedLegend.processed ? (
                  <div className="flex flex-col items-center gap-2 text-white">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                    <span className="text-xs font-bold">
                      画像を最適化中...
                    </span>
                  </div>
                ) : (
                  <img
                    src={stagedLegend.processed.dataUrl}
                    alt="保存前のスコア記号早見表プレビュー"
                    className="w-full h-full object-contain"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleRotateStaged}
                  disabled={stagedLegend.isProcessing || isSavingLegend}
                  className="py-2.5 px-3 rounded-xl bg-muted hover:bg-muted/80 border border-border text-xs font-black text-foreground flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                >
                  <RotateCw className="w-4 h-4 text-primary" />
                  <span>90°回転して向きを揃える</span>
                </button>

                <button
                  type="button"
                  onClick={handleToggleEnhanceStaged}
                  disabled={stagedLegend.isProcessing || isSavingLegend}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-black flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer ${
                    stagedLegend.enhancePencil
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-muted text-foreground border-border"
                  }`}
                >
                  <Sparkles className="w-4 h-4 shrink-0" />
                  <span>
                    {stagedLegend.enhancePencil
                      ? "濃さ強調: ON"
                      : "原本カラー（標準）"}
                  </span>
                </button>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setStagedLegend(null)}
                  disabled={isSavingLegend}
                  className="py-3 px-4 rounded-2xl bg-card border border-border text-xs font-black text-muted-foreground hover:text-foreground active:scale-95 transition-all cursor-pointer"
                >
                  キャンセル
                </button>

                <button
                  type="button"
                  onClick={() => void handleSaveLegendToCloud()}
                  disabled={
                    stagedLegend.isProcessing ||
                    !stagedLegend.processed ||
                    isSavingLegend
                  }
                  className="flex-1 py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black shadow-sm flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
                >
                  {isSavingLegend ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>保存中...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>この早見表を保存する（毎回自動適用）</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : savedLegendUrl ? (
            /* すでに登録済みの早見表がある状態 */
            <div className="space-y-3">
              <div
                onClick={() => setIsZoomOpen(true)}
                className="relative rounded-2xl overflow-hidden bg-slate-950 border border-border aspect-4/3 flex items-center justify-center cursor-pointer group"
              >
                <img
                  src={savedLegendUrl}
                  alt="登録済みのスコア記号早見表"
                  className="w-full h-full object-contain"
                />
                <span className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-xl bg-black/75 text-white text-[10px] font-black flex items-center gap-1 shadow-xs">
                  <ZoomIn className="w-3.5 h-3.5" />
                  <span>タップで拡大確認</span>
                </span>
              </div>

              <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2 text-[11px] font-black text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  スコアブック取り込み（STEP 1・2）で毎回自動的にこの早見表を参照します
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isSavingLegend}
                  onClick={() => setIsCameraModalOpen(true)}
                  className="py-2.5 px-3 rounded-2xl bg-primary text-primary-foreground font-black text-xs flex items-center justify-center gap-1.5 shadow-2xs hover:opacity-95 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Camera className="w-4 h-4 shrink-0" />
                  <span>カメラで撮り直す</span>
                </button>

                <button
                  type="button"
                  disabled={isSavingLegend}
                  onClick={openLegendAlbumPicker}
                  className="py-2.5 px-3 rounded-2xl bg-card border border-border text-foreground font-black text-xs flex items-center justify-center gap-1.5 shadow-2xs hover:bg-muted/60 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  <ImagePlus className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span>アルバムから変更</span>
                </button>
              </div>

              {!confirmClearLegend ? (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setConfirmClearLegend(true)}
                    className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>登録済みの早見表を削除する</span>
                  </button>
                </div>
              ) : (
                <div className="p-3 rounded-2xl bg-destructive/10 border border-destructive/30 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-black text-destructive">
                    早見表の登録を解除しますか？
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setConfirmClearLegend(false)}
                      disabled={isSavingLegend}
                      className="px-2.5 py-1.5 rounded-xl bg-card border border-border text-[11px] font-black text-foreground cursor-pointer"
                    >
                      やめる
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleClearSavedLegend()}
                      disabled={isSavingLegend}
                      className="px-3 py-1.5 rounded-xl bg-destructive text-white text-[11px] font-black cursor-pointer"
                    >
                      {isSavingLegend ? "削除中..." : "削除する"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* 未登録時のアップロードエリア */
            <div className="rounded-2xl border-2 border-dashed border-indigo-500/35 bg-indigo-500/5 p-5 flex flex-col items-center text-center space-y-3">
              <div className="w-11 h-11 rounded-2xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <BookOpen className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-black text-foreground">
                  スコア記号早見表がまだ登録されていません
                </p>
                <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
                  成美堂・早稲田式・独自ルールなど、普段お使いのスコアブック記載例ページを撮影して登録してください
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2.5 w-full pt-1">
                <button
                  type="button"
                  disabled={isSavingLegend}
                  onClick={() => setIsCameraModalOpen(true)}
                  className="py-3 px-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Camera className="w-4 h-4 shrink-0" />
                  <span>カメラ撮影</span>
                </button>

                <button
                  type="button"
                  disabled={isSavingLegend}
                  onClick={openLegendAlbumPicker}
                  className="py-3 px-3 rounded-2xl bg-card border border-border text-foreground font-black text-xs flex items-center justify-center gap-1.5 shadow-2xs hover:bg-muted/60 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  <ImagePlus className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span>アルバム選択</span>
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ━━━ セクション 2: ⚙️ AIスコアブック取り込みの初期設定 ━━━ */}
        <section className="rounded-3xl bg-card border-2 border-primary/20 p-4 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 pb-2 border-b border-border/60">
            <Sliders className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-black text-foreground">
              AIスコアブック取り込みの初期設定
            </h2>
          </div>

          {/* 1. 取り込むシート範囲の初期値 */}
          <div className="space-y-1.5">
            <label className="text-xs font-black text-foreground block">
              取り込むシート範囲の初期値
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: "both" as const, label: "先攻＋後攻 (2枚)" },
                  { id: "top_only" as const, label: "先攻シートのみ" },
                  { id: "bottom_only" as const, label: "後攻シートのみ" },
                ] as ReadonlyArray<{ id: ImportScopeMode; label: string }>
              ).map((opt) => {
                const isActive = scoreSettings.defaultImportScope === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      updateLocalSetting(
                        "defaultImportScope",
                        opt.id,
                        "シート範囲の初期値"
                      )
                    }
                    className={`py-2.5 px-2 rounded-2xl border text-[11px] transition-all active:scale-95 cursor-pointer ${
                      isActive
                        ? "bg-primary text-primary-foreground border-primary shadow-xs font-black"
                        : "bg-muted/50 border-border/60 text-muted-foreground hover:text-foreground font-bold"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] font-bold text-muted-foreground">
              ※ 取り込み画面を開くたびにこの範囲が最初から選ばれます（画面内で都度変更も可能）
            </p>
          </div>

          {/* 2. 画像補正の初期モード */}
          <div className="space-y-1.5">
            <label className="text-xs font-black text-foreground block">
              シート撮影時の初期画質モード
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  {
                    value: false,
                    title: "原本高精細（推奨）",
                    desc: "赤・青ペンの色分けと細い罫線を忠実に保持",
                  },
                  {
                    value: true,
                    title: "濃さ強調ON",
                    desc: "薄いHB/2H鉛筆の筆跡を毎回自動で引き締め",
                  },
                ] as const
              ).map((opt) => {
                const isActive =
                  scoreSettings.defaultEnhancePencil === opt.value;
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() =>
                      updateLocalSetting(
                        "defaultEnhancePencil",
                        opt.value,
                        "初期画質モード"
                      )
                    }
                    className={`p-3 rounded-2xl border text-left transition-all active:scale-95 cursor-pointer space-y-0.5 ${
                      isActive
                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                        : "bg-muted/50 border-border/60 text-foreground"
                    }`}
                  >
                    <p className="text-xs font-black">{opt.title}</p>
                    <p
                      className={`text-[10px] leading-snug ${
                        isActive
                          ? "text-primary-foreground/85 font-bold"
                          : "text-muted-foreground font-bold"
                      }`}
                    >
                      {opt.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. 新規試合枠作成時の規定イニング・試合種別 */}
          <div className="grid grid-cols-2 gap-2.5 pt-1 border-t border-border/50">
            <div className="space-y-1">
              <label className="text-[11px] font-black text-foreground block">
                規定イニング初期値
              </label>
              <select
                value={scoreSettings.defaultInnings}
                onChange={(e) =>
                  updateLocalSetting(
                    "defaultInnings",
                    Number(e.target.value),
                    "規定イニング初期値"
                  )
                }
                className="w-full h-10 px-2.5 rounded-xl bg-muted/40 border border-border text-xs font-black text-foreground cursor-pointer"
              >
                <option value={5}>5回制（低学年等）</option>
                <option value={6}>6回制（学童等）</option>
                <option value={7}>7回制（中学・草野球）</option>
                <option value={9}>9回制</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-black text-foreground block">
                新規試合の初期種別
              </label>
              <select
                value={scoreSettings.defaultMatchType}
                onChange={(e) =>
                  updateLocalSetting(
                    "defaultMatchType",
                    e.target.value as ScoreDefaultMatchType,
                    "新規試合の初期種別"
                  )
                }
                className="w-full h-10 px-2.5 rounded-xl bg-muted/40 border border-border text-xs font-black text-foreground cursor-pointer"
              >
                <option value="practice">OP戦（練習試合）</option>
                <option value="official">公式戦</option>
                <option value="exchange">交流戦</option>
              </select>
            </div>
          </div>
        </section>

        {/* ━━━ クイック移動アクション ━━━ */}
        <div className="space-y-2.5 pt-1">
          <Link
            href="/liff/tools/scorebook-import"
            className="w-full h-13 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs sm:text-sm shadow-sm flex items-center justify-center gap-2 active:scale-98 transition-all"
          >
            <ScanLine className="w-4 h-4" />
            <span>スコアブック取り込み画面へ進む</span>
          </Link>

          <Link
            href="/liff/settings/team"
            className="p-3.5 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all flex items-center justify-between group active:scale-[0.99] shadow-2xs"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-primary/12 text-primary flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-black text-foreground truncate">
                  チーム設定・コールド規定・守備表記
                </p>
                <p className="text-[10px] font-bold text-muted-foreground truncate">
                  活動班・球場マスタ・LINE速報配信設定はこちら
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform shrink-0" />
          </Link>
        </div>

        <div className="h-8 w-full shrink-0" aria-hidden="true" />
      </div>

      {/* 全画面拡大プレビューモーダル */}
      {isZoomOpen && previewImageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/92 flex flex-col p-3"
          onClick={() => setIsZoomOpen(false)}
        >
          <div className="flex items-center justify-between pb-2 text-white">
            <span className="text-xs font-black">
              登録済みスコア記号早見表プレビュー
            </span>
            <button
              type="button"
              onClick={() => setIsZoomOpen(false)}
              className="p-2 rounded-full bg-white/15 hover:bg-white/25 text-white cursor-pointer"
              aria-label="閉じる"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div
            className="flex-1 overflow-auto flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewImageUrl}
              alt="スコア記号早見表の拡大表示"
              className="max-w-full max-h-full object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}

