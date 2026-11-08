// filepath: src/app/liff/settings/score/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import dynamic from "next/dynamic";
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
  FileSpreadsheet,
} from "lucide-react";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { LiffSelect } from "@/components/liff/LiffSelect";
import { TeamSymbolRulesSettingsSection } from "@/components/liff/TeamSymbolRulesSettingsSection";

const ScorebookCameraModal = dynamic(
  () => import("@/components/liff/ScorebookCameraModal").then((m) => m.ScorebookCameraModal),
  { ssr: false }
);
const ScorebookSymbolChartSheetModal = dynamic(
  () =>
    import("@/components/liff/ScorebookSymbolChartSheetModal").then(
      (m) => m.ScorebookSymbolChartSheetModal
    ),
  { ssr: false }
);
import { useLiff, usePracticeMatchLabel } from "@/components/liff/LiffProvider";
import {
  DEFAULT_TEAM_SCOREBOOK_SYMBOL_RULES,
  loadCachedTeamSymbolRules,
  sanitizeScorebookSymbolRules,
  saveCachedTeamSymbolRules,
  type ScorebookSymbolRules,
  type ScoreTeamNameDisplayMode,
} from "@/lib/liff/scorebook-symbol-rules";
import { invalidateLiffApiCache } from "@/lib/liff/api-cache";
import { getClientQueryParam } from "@/lib/liff/liff-client";
import {
  ensureCompactApiImage,
  preprocessScorebookImage,
  type PreprocessedScorebookImage,
} from "@/lib/liff/scorebook-image";
import {
  DEFAULT_LIFF_SCORE_SETTINGS,
  loadLiffScoreSettings,
  loadTeamScoreNameDisplayMode,
  saveLiffScoreSettings,
  saveTeamScoreNameDisplayMode,
  type LiffScoreSettings,
  type ScoreDefaultMatchType,
  type ScoreMercyRule,
  type ScorePositionNotation,
} from "@/lib/liff/score-settings";
import type { ImportScopeMode } from "@/types/scorebook-v2";
import { toast } from "sonner";

interface ScoreContextApiResponse {
  success: boolean;
  isDemo?: boolean;
  team?: {
    id: string;
    name: string;
    /** `organizations.name` = チーム名 */
    orgName?: string | null;
    /** `teams.name` = 構成名 */
    squadName?: string | null;
    scorebookLegendUrl: string | null;
    scorebookSymbolRules?: ScorebookSymbolRules | null;
  } | null;
  error?: string;
}

interface SaveSymbolRulesModeApiResponse {
  success: boolean;
  scorebookSymbolRules?: ScorebookSymbolRules | null;
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
  const { currentTeam, refreshTeams } = useLiff();
  const practiceMatchLabel = usePracticeMatchLabel();

  const [isLoadingTeam, setIsLoadingTeam] = useState(true);
  const [isDemoContext, setIsDemoContext] = useState(false);
  const [resolvedTeamId, setResolvedTeamId] = useState<string>("");
  const [resolvedTeamName, setResolvedTeamName] = useState<string>("");
  const [resolvedOrgName, setResolvedOrgName] = useState<string>("");
  const [resolvedSquadName, setResolvedSquadName] = useState<string>("");
  const [isSavingTeamNameMode, setIsSavingTeamNameMode] = useState(false);
  const [savedLegendUrl, setSavedLegendUrl] = useState<string | null>(null);
  const [savedTeamSymbolRules, setSavedTeamSymbolRules] =
    useState<ScorebookSymbolRules | null>(null);
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
  const [activeSymbolRules, setActiveSymbolRules] =
    useState<ScorebookSymbolRules>(DEFAULT_TEAM_SCOREBOOK_SYMBOL_RULES);
  const [isChartGeneratorOpen, setIsChartGeneratorOpen] = useState(false);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const stageSeqRef = useRef<number>(0);

  // 1. 端末保存のスコア取込初期設定を読み込み
  useEffect(() => {
    setScoreSettings(loadLiffScoreSettings());
  }, []);

  // 2. チーム登録済みの「スコア記号早見表」URLを取得
  const fetchTeamLegendContext = useCallback(async () => {
    try {
      setIsLoadingTeam(true);
      setErrorMessage(null);
      const qTeam = currentTeam?.id || getClientQueryParam("teamId") || "demo-team";
      const res = await fetch(
        `/api/liff/scorebook/context?teamId=${encodeURIComponent(qTeam)}`
      );
      const data = (await res.json()) as ScoreContextApiResponse;
      if (!data.success) {
        throw new Error(data.error || "チーム設定の取得に失敗しました");
      }

      setIsDemoContext(Boolean(data.isDemo));
      if (data.team) {
        const sanitizedTeamRules = data.team.scorebookSymbolRules
          ? sanitizeScorebookSymbolRules(
              data.team.scorebookSymbolRules,
              DEFAULT_TEAM_SCOREBOOK_SYMBOL_RULES
            )
          : null;
        const orgLabel = (
          data.team.orgName ||
          currentTeam?.orgName ||
          data.team.name ||
          ""
        ).trim();
        const squadLabel = (
          data.team.squadName ||
          (currentTeam?.teamName && currentTeam.teamName !== "チームHUB"
            ? currentTeam.teamName
            : "") ||
          data.team.name ||
          ""
        ).trim();
        const resolvedMode =
          sanitizedTeamRules?.scoreTeamNameMode ?? "organization";
        saveTeamScoreNameDisplayMode(data.team.id, resolvedMode, false);

        setResolvedTeamId(data.team.id);
        setResolvedOrgName(orgLabel);
        setResolvedSquadName(squadLabel);
        setResolvedTeamName(
          resolvedMode === "squad" ? squadLabel || orgLabel : orgLabel || squadLabel
        );
        setSavedLegendUrl(data.team.scorebookLegendUrl);
        setSavedTeamSymbolRules(sanitizedTeamRules);
        setActiveSymbolRules(
          sanitizedTeamRules ?? DEFAULT_TEAM_SCOREBOOK_SYMBOL_RULES
        );
      } else {
        const demoKey = data.isDemo ? "demo-team" : qTeam || "demo-team";
        const demoCached = data.isDemo
          ? loadCachedTeamSymbolRules("demo-team")
          : null;
        const demoMode = loadTeamScoreNameDisplayMode(
          demoKey,
          demoCached?.scoreTeamNameMode ?? currentTeam?.scoreTeamNameMode ?? "organization"
        );
        const fallbackOrg = (
          currentTeam?.orgName ||
          currentTeam?.name ||
          "マイチーム"
        ).trim();
        const fallbackSquad = (
          (currentTeam?.teamName && currentTeam.teamName !== "チームHUB"
            ? currentTeam.teamName
            : "") ||
          currentTeam?.shortName ||
          fallbackOrg
        ).trim();
        const initialDemoRules = sanitizeScorebookSymbolRules(
          demoCached
            ? { ...demoCached, scoreTeamNameMode: demoMode }
            : { ...DEFAULT_TEAM_SCOREBOOK_SYMBOL_RULES, scoreTeamNameMode: demoMode },
          DEFAULT_TEAM_SCOREBOOK_SYMBOL_RULES
        );

        setResolvedTeamId(qTeam);
        setResolvedOrgName(fallbackOrg);
        setResolvedSquadName(fallbackSquad);
        setResolvedTeamName(
          demoMode === "squad" ? fallbackSquad : fallbackOrg
        );
        setSavedLegendUrl(null);
        setSavedTeamSymbolRules(demoCached ? initialDemoRules : null);
        setActiveSymbolRules(initialDemoRules);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setIsLoadingTeam(false);
    }
  }, [
    currentTeam?.id,
    currentTeam?.name,
    currentTeam?.orgName,
    currentTeam?.scoreTeamNameMode,
    currentTeam?.shortName,
    currentTeam?.teamName,
  ]);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
    const name = (file.name || "").toLowerCase();
    const isRejectedDoc =
      mime === "application/pdf" ||
      mime.startsWith("video/") ||
      mime.startsWith("audio/") ||
      mime.startsWith("text/") ||
      mime.includes("spreadsheet") ||
      mime.includes("excel") ||
      mime.includes("wordprocessing") ||
      mime.includes("presentation") ||
      mime === "application/zip" ||
      /\.(pdf|xlsx?|xlsm|csv|docx?|pptx?|zip|mp4|mov|avi|mp3|wav|txt)$/i.test(
        name
      );
    if (isRejectedDoc) {
      const msg =
        "PDF等の書類ではなく、早見表の写真（JPG・PNG画像）を選択してください";
      setErrorMessage(msg);
      toast.error(msg);
      return;
    }
    void runStagePreprocess(file, 0, false, null);
  };

  const handleLegendInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.currentTarget;
    const picked = inputEl.files?.[0] ?? null;
    if (!picked) {
      inputEl.value = "";
      return;
    }
    window.setTimeout(() => {
      handleSelectLegendFile(picked);
      inputEl.value = "";
    }, 60);
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

  // 4-B. アプリ内で生成した清書マス版「スコア記号早見表」をそのままクラウド登録
  const handleSaveGeneratedLegendToCloud = useCallback(
    async (file: File) => {
      setIsSavingLegend(true);
      setErrorMessage(null);
      try {
        const processed = await preprocessScorebookImage(file, {
          rotationDeg: 0,
          enhancePencil: false,
          maxLongEdge: 2000,
        });

        if (isDemoContext) {
          setSavedLegendUrl(processed.dataUrl);
          setStagedLegend(null);
          toast.success(
            "作り直した「スコア記号早見表」をチーム早見表として反映しました！"
          );
          return;
        }

        const compact = await ensureCompactApiImage(processed, 2000, 0.9);
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
          throw new Error(data.error || "生成した早見表の保存に失敗しました");
        }

        setSavedLegendUrl(data.scorebookLegendUrl ?? null);
        setStagedLegend(null);
        toast.success(
          "作り直した清書マス版「スコア記号早見表」をチーム共通設定として保存しました！"
        );
      } finally {
        setIsSavingLegend(false);
      }
    },
    [currentTeam?.id, isDemoContext, resolvedTeamId]
  );

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

  // ⚠️ 内部DBスキーマでは organizations (`orgName`) = チーム名、teams (`squadName`/`teamName`) = 構成名
  const effectiveTeamKey =
    isDemoContext || currentTeam?.id === "demo-team"
      ? "demo-team"
      : (resolvedTeamId || currentTeam?.id || "").trim();

  const scoreTeamNameMode: ScoreTeamNameDisplayMode =
    activeSymbolRules.scoreTeamNameMode ??
    loadTeamScoreNameDisplayMode(
      effectiveTeamKey,
      currentTeam?.scoreTeamNameMode ?? "organization"
    );

  const previewOrgName =
    (
      resolvedOrgName ||
      currentTeam?.orgName ||
      currentTeam?.name ||
      "〇〇クラブ"
    ).trim() || "〇〇クラブ";

  const previewSquadName =
    (
      resolvedSquadName ||
      (currentTeam?.teamName && currentTeam.teamName !== "チームHUB"
        ? currentTeam.teamName
        : "") ||
      currentTeam?.shortName ||
      "1年生 / Aチーム"
    ).trim() || "1年生 / Aチーム";

  const effectiveScoreDisplayTeamName =
    scoreTeamNameMode === "squad" ? previewSquadName : previewOrgName;

  const handleSelectScoreTeamNameMode = async (
    nextMode: ScoreTeamNameDisplayMode
  ) => {
    if (isSavingTeamNameMode || scoreTeamNameMode === nextMode) return;

    const targetKey = effectiveTeamKey || "demo-team";
    const nextRules = sanitizeScorebookSymbolRules(
      {
        ...activeSymbolRules,
        scoreTeamNameMode: nextMode,
      },
      DEFAULT_TEAM_SCOREBOOK_SYMBOL_RULES
    );

    // 1. ローカル状態 ＆ チーム別キャッシュを 0ms で即時更新し全画面へ反映
    setActiveSymbolRules(nextRules);
    setSavedTeamSymbolRules(nextRules);
    setResolvedTeamName(
      nextMode === "squad" ? previewSquadName : previewOrgName
    );
    saveCachedTeamSymbolRules(nextRules, targetKey);
    saveTeamScoreNameDisplayMode(targetKey, nextMode, true);

    if (typeof window !== "undefined") {
      try {
        const rawCur = localStorage.getItem("iscore_currentTeam_json");
        if (rawCur) {
          const parsedCur = JSON.parse(rawCur) as {
            id?: string;
            scoreTeamNameMode?: ScoreTeamNameDisplayMode;
          };
          if (parsedCur && parsedCur.id === targetKey) {
            parsedCur.scoreTeamNameMode = nextMode;
            localStorage.setItem(
              "iscore_currentTeam_json",
              JSON.stringify(parsedCur)
            );
          }
        }
      } catch {
        // ignore storage errors
      }
    }

    const modeLabel =
      nextMode === "organization" ? "チーム名" : "構成名";

    if (isDemoContext || targetKey === "demo-team" || !resolvedTeamId) {
      toast.success(`スコア表示の自チーム名を「${modeLabel}」に変更しました`);
      return;
    }

    // 2. チーム共通設定として D1 へ永続化 & HUBキャッシュ更新
    setIsSavingTeamNameMode(true);
    try {
      const res = await fetch("/api/liff/scorebook/symbol-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: resolvedTeamId,
          scoreTeamNameMode: nextMode,
        }),
      });
      const json = (await res.json()) as SaveSymbolRulesModeApiResponse;
      if (!res.ok || !json.success) {
        throw new Error(json.error || "スコア表示チーム名設定の保存に失敗しました");
      }
      if (json.scorebookSymbolRules) {
        const synced = sanitizeScorebookSymbolRules(
          json.scorebookSymbolRules,
          DEFAULT_TEAM_SCOREBOOK_SYMBOL_RULES
        );
        setActiveSymbolRules(synced);
        setSavedTeamSymbolRules(synced);
        saveCachedTeamSymbolRules(synced, targetKey);
      }
      invalidateLiffApiCache("/api/liff/hub");
      void refreshTeams();
      toast.success(
        `スコア表示の自チーム名を「${modeLabel}」に保存しました（チーム共通）`
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "設定の保存に失敗しました";
      toast.error(msg);
    } finally {
      setIsSavingTeamNameMode(false);
    }
  };

  const previewImageUrl =
    stagedLegend?.processed?.dataUrl || savedLegendUrl || null;

  return (
    <div className="flex flex-col flex-1">
      {isCameraModalOpen && (
        <ScorebookCameraModal
          isOpen={isCameraModalOpen}
          title="スコア記号早見表を撮影"
          hintText="記載例・記号早見表のページ全体が枠に入るよう撮影してください"
          onClose={() => setIsCameraModalOpen(false)}
          onCapture={(file) => handleSelectLegendFile(file)}
        />
      )}

      {isChartGeneratorOpen && (
        <ScorebookSymbolChartSheetModal
          isOpen={isChartGeneratorOpen}
          onClose={() => setIsChartGeneratorOpen(false)}
          teamName={effectiveScoreDisplayTeamName}
          rules={activeSymbolRules}
          onRegisterLegendToCloud={handleSaveGeneratedLegendToCloud}
        />
      )}

      <LiffHeader />

      <div className="p-4 space-y-4 max-w-lg mx-auto w-full">
        <LiffPageHeader
          title="スコア設定"
          subtitle="SCORE & AI IMPORT SETTINGS"
          icon={
            <span className="w-8 h-8 rounded-xl bg-slate-500/12 text-slate-700 dark:text-slate-300 flex items-center justify-center font-black">
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

        {/* ━━━ セクション 1: ⚾ 試合・スコア規定（試合作成・スコア表記ルール） ━━━ */}
        <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-7 h-7 rounded-xl bg-primary/20 text-blue-300 border border-primary/40 flex items-center justify-center shrink-0">
                <Sliders className="w-4 h-4" />
              </span>
              <h2 className="text-sm font-black text-white truncate">
                試合・スコア規定
              </h2>
            </div>
            <span className="text-[10px] font-bold text-slate-300 shrink-0">
              試合作成・表記に反映
            </span>
          </div>

          <div className="p-4 space-y-4">
            {/* 0. スコア表示の自チーム名（チーム名 [organizations] vs 構成名 [teams]） */}
            <div className="space-y-2 pb-3.5 border-b border-border">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-black text-foreground block">
                  スコア表示の自チーム名
                </label>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/25 shrink-0">
                  {isSavingTeamNameMode ? "保存中..." : "チーム共通設定"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    {
                      id: "organization" as const,
                      title: "チーム名を使用",
                      badge: "初期値",
                      preview: previewOrgName,
                      desc: "クラブ・チーム全体名を表示",
                    },
                    {
                      id: "squad" as const,
                      title: "構成名を使用",
                      badge: null,
                      preview: previewSquadName,
                      desc: "学年・編成ごとの構成名を表示",
                    },
                  ] as const
                ).map((opt) => {
                  const isActive = scoreTeamNameMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={isSavingTeamNameMode}
                      onClick={() =>
                        void handleSelectScoreTeamNameMode(opt.id)
                      }
                      className={`p-3 rounded-2xl border text-left transition-all active:scale-95 cursor-pointer space-y-1.5 disabled:opacity-60 ${
                        isActive
                          ? "bg-primary/12 border-2 border-primary shadow-2xs"
                          : "bg-muted/45 border-border hover:bg-muted/70"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`text-xs font-black truncate ${
                            isActive ? "text-primary" : "text-foreground"
                          }`}
                        >
                          {opt.title}
                        </span>
                        {isActive ? (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-primary text-primary-foreground shrink-0">
                            選択中
                          </span>
                        ) : opt.badge ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-card text-muted-foreground border border-border shrink-0">
                            {opt.badge}
                          </span>
                        ) : null}
                      </div>

                      <div
                        className={`px-2 py-1 rounded-lg border text-[11px] font-black truncate ${
                          isActive
                            ? "bg-card text-foreground border-primary/35"
                            : "bg-card/80 text-foreground border-border"
                        }`}
                      >
                        {opt.preview}
                      </div>

                      <p
                        className={`text-[10px] leading-snug font-bold ${
                          isActive ? "text-primary/85" : "text-muted-foreground"
                        }`}
                      >
                        {opt.desc}
                      </p>
                    </button>
                  );
                })}
              </div>

              <p className="text-[10px] font-bold text-muted-foreground leading-relaxed">
                ※ スコアボード・試合一覧カード・清書スコアブック・打席経過・早見表の自チーム表記に反映されます（初期値：チーム名）
              </p>
            </div>

            {/* 1. 規定イニング数 & 新規試合の初期種別 */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-[11px] font-black text-foreground block">
                  規定イニング初期値
                </label>
                <LiffSelect
                  value={String(scoreSettings.defaultInnings)}
                  onChange={(val) =>
                    updateLocalSetting(
                      "defaultInnings",
                      Number(val),
                      "規定イニング初期値"
                    )
                  }
                  options={[
                    { value: "5", label: "5回制（低学年等）" },
                    { value: "6", label: "6回制（学童等）" },
                    { value: "7", label: "7回制（中学・草野球）" },
                    { value: "9", label: "9回制" },
                  ]}
                  title="規定イニング初期値"
                  accent="slate"
                  searchable={false}
                  className="w-full bg-muted/35"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-black text-foreground block">
                  新規試合の初期種別
                </label>
                <LiffSelect
                  value={scoreSettings.defaultMatchType}
                  onChange={(val) =>
                    updateLocalSetting(
                      "defaultMatchType",
                      val as ScoreDefaultMatchType,
                      "新規試合の初期種別"
                    )
                  }
                  options={[
                    { value: "practice", label: practiceMatchLabel },
                    { value: "official", label: "公式戦" },
                    { value: "exchange", label: "交流戦" },
                  ]}
                  title="新規試合の初期種別"
                  accent="slate"
                  searchable={false}
                  className="w-full bg-muted/35"
                />
              </div>
            </div>

            {/* 2. コールドゲーム規定 */}
            <div className="space-y-1.5 pt-1 border-t border-border">
              <label className="text-xs font-black text-foreground block">
                コールドゲーム規定
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: "standard", label: "3回10/4回7点" },
                    { id: "loose", label: "4回10/5回7点" },
                    { id: "none", label: "コールドなし" },
                  ] as ReadonlyArray<{ id: ScoreMercyRule; label: string }>
                ).map((m) => {
                  const isActive = scoreSettings.mercyRule === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() =>
                        updateLocalSetting("mercyRule", m.id, "コールド規定")
                      }
                      className={`py-2 px-1 rounded-2xl text-xs font-bold transition-all active:scale-95 border cursor-pointer ${
                        isActive
                          ? "bg-primary/12 text-primary border-primary shadow-2xs font-black"
                          : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. 守備位置の表記形式 */}
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-black text-foreground block">
                守備位置の表記形式
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: "kanji", label: "漢字 (投・捕・一)" },
                    { id: "number", label: "守備番号 (1・2・3)" },
                    { id: "english", label: "英語 (P・C・1B)" },
                  ] as ReadonlyArray<{ id: ScorePositionNotation; label: string }>
                ).map((p) => {
                  const isActive = scoreSettings.positionNotation === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        updateLocalSetting(
                          "positionNotation",
                          p.id,
                          "守備位置の表記形式"
                        )
                      }
                      className={`py-2 px-1 rounded-2xl text-xs font-bold transition-all active:scale-95 border cursor-pointer ${
                        isActive
                          ? "bg-primary/12 text-primary border-primary shadow-2xs font-black"
                          : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. DH制（指名打者）初期値 */}
            <div className="pt-1 flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="text-xs font-black text-foreground">
                  DH制（指名打者）初期値
                </div>
                <p className="text-[10px] text-muted-foreground font-bold">
                  新規試合作成時にDH制をデフォルトでONにします
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateLocalSetting(
                    "dhDefault",
                    !scoreSettings.dhDefault,
                    "DH制初期値"
                  )
                }
                className={`w-12 h-6 rounded-full transition-colors relative p-0.5 cursor-pointer ${
                  scoreSettings.dhDefault
                    ? "bg-primary"
                    : "bg-muted border border-border"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    scoreSettings.dhDefault
                      ? "translate-x-6 shadow-xs"
                      : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        {/* ━━━ セクション 2: 📘 スコア記号早見表（チーム共通・毎回自動参照） ━━━ */}
        <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-7 h-7 rounded-xl bg-primary/20 text-blue-300 border border-primary/40 flex items-center justify-center shrink-0">
                <BookOpen className="w-4 h-4" />
              </span>
              <h2 className="text-sm font-black text-white truncate">
                スコア記号早見表（チーム共通）
              </h2>
            </div>

            {isLoadingTeam ? (
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 shrink-0">
                確認中...
              </span>
            ) : stagedLegend ? (
              <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30 shrink-0">
                未保存プレビュー
              </span>
            ) : savedLegendUrl ? (
              <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1 shrink-0">
                <CheckCircle2 className="w-3 h-3" />
                登録済み・自動適用中
              </span>
            ) : (
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 shrink-0">
                未登録（標準ルール）
              </span>
            )}
          </div>

          <div className="p-4 space-y-3.5">
            <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
              お使いのスコアブック表紙裏などの「記入例・記号早見表」を1度登録しておけば、
              <strong className="text-foreground font-black">
                毎回のスコアブック取り込みで添付し直す必要はありません。
              </strong>
              {resolvedTeamName ? `（${resolvedTeamName} 共通設定）` : ""}
            </p>

            {isLoadingTeam ? (
              <div className="py-10 rounded-2xl bg-muted/35 border border-border flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="text-xs font-bold text-muted-foreground">
                  登録状況を読み込み中...
                </span>
              </div>
            ) : stagedLegend ? (
              /* 新しく選択した画像の保存前プレビュー＆回転補正 */
              <div className="space-y-3">
                <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-primary/40 aspect-4/3 flex items-center justify-center">
                  {stagedLegend.isProcessing || !stagedLegend.processed ? (
                    <div className="flex flex-col items-center gap-2 text-white">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
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
                    className="py-2.5 px-3 rounded-xl bg-card hover:bg-muted border border-border text-xs font-black text-foreground flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
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
                        ? "bg-primary/12 text-primary border-primary"
                        : "bg-card text-foreground border-border hover:bg-muted"
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
                    className="py-3 px-4 rounded-2xl bg-card hover:bg-muted border border-border text-xs font-black text-muted-foreground hover:text-foreground active:scale-95 transition-all cursor-pointer"
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
                    className="flex-1 py-3 px-4 rounded-2xl bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-xs font-black shadow-xs flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
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
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-contain"
                  />
                  <span className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-xl bg-slate-900/90 text-white border border-slate-700 text-[10px] font-black flex items-center gap-1 shadow-xs">
                    <ZoomIn className="w-3.5 h-3.5" />
                    <span>タップで拡大確認</span>
                  </span>
                </div>

                <div className="p-2.5 rounded-2xl bg-emerald-500/12 border border-emerald-500/25 flex items-center gap-2 text-[11px] font-black text-emerald-700 dark:text-emerald-400">
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
                    className="py-2.5 px-3 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xs flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Camera className="w-4 h-4 shrink-0" />
                    <span>カメラで撮り直す</span>
                  </button>

                  {isSavingLegend ? (
                    <span className="py-2.5 px-3 rounded-2xl bg-card border border-border text-foreground font-black text-xs flex items-center justify-center gap-1.5 opacity-50">
                      <ImagePlus className="w-4 h-4 text-primary shrink-0" />
                      <span>アルバムから変更</span>
                    </span>
                  ) : (
                    <div className="relative overflow-hidden py-2.5 px-3 rounded-2xl bg-card border border-border text-foreground font-black text-xs flex items-center justify-center gap-1.5 shadow-2xs hover:bg-muted">
                      <ImagePlus className="w-4 h-4 text-primary shrink-0 pointer-events-none" />
                      <span className="pointer-events-none">アルバムから変更</span>
                      <input
                        type="file"
                        accept="image/*"
                        aria-label="スコア記号早見表をアルバムから変更"
                        onChange={handleLegendInputChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={isSavingLegend}
                  onClick={() => setIsChartGeneratorOpen(true)}
                  className="w-full py-2.5 px-3 rounded-2xl bg-[#0f172a] hover:bg-slate-800 text-white border border-amber-500/50 text-xs font-black flex items-center justify-center gap-2 shadow-2xs active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
                >
                  <FileSpreadsheet className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    清書マス目で「チーム早見表」を作り直す（A4出力・そのまま登録）
                  </span>
                </button>

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
              <div className="rounded-2xl border border-dashed border-border bg-muted/35 p-5 flex flex-col items-center text-center space-y-3">
                <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
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
                    className="py-3 px-3 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Camera className="w-4 h-4 shrink-0" />
                    <span>カメラ撮影</span>
                  </button>

                  {isSavingLegend ? (
                    <span className="py-3 px-3 rounded-2xl bg-card border border-border text-foreground font-black text-xs flex items-center justify-center gap-1.5 opacity-50">
                      <ImagePlus className="w-4 h-4 text-primary shrink-0" />
                      <span>アルバム選択</span>
                    </span>
                  ) : (
                    <div className="relative overflow-hidden py-3 px-3 rounded-2xl bg-card border border-border text-foreground font-black text-xs flex items-center justify-center gap-1.5 shadow-2xs hover:bg-muted">
                      <ImagePlus className="w-4 h-4 text-primary shrink-0 pointer-events-none" />
                      <span className="pointer-events-none">アルバム選択</span>
                      <input
                        type="file"
                        accept="image/*"
                        aria-label="スコア記号早見表をアルバムから選択"
                        onChange={handleLegendInputChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={isSavingLegend}
                  onClick={() => setIsChartGeneratorOpen(true)}
                  className="w-full py-3 px-3 rounded-2xl bg-[#0f172a] hover:bg-slate-800 text-white border border-amber-500/50 text-xs font-black flex items-center justify-center gap-2 shadow-xs active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
                >
                  <FileSpreadsheet className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    本物の清書マス目で早見表を新規作成（A4出力・そのまま登録）
                  </span>
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ━━━ セクション 2.5: 📒 チーム記号ルール（清書シート表示切替用） ━━━ */}
        <TeamSymbolRulesSettingsSection
          teamId={resolvedTeamId}
          teamName={effectiveScoreDisplayTeamName}
          isDemo={isDemoContext}
          savedLegendUrl={savedLegendUrl}
          initialCloudRules={savedTeamSymbolRules}
          isLoadingTeam={isLoadingTeam}
          onRulesChange={setActiveSymbolRules}
          onOpenChartGenerator={() => setIsChartGeneratorOpen(true)}
        />

        {/* ━━━ セクション 3: ⚙️ AIスコアブック取り込みの初期設定 ━━━ */}
        <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-primary/20 text-blue-300 border border-primary/40 flex items-center justify-center shrink-0">
              <ScanLine className="w-4 h-4" />
            </span>
            <h2 className="text-sm font-black text-white">
              AIスコアブック取り込みの初期設定
            </h2>
          </div>

          <div className="p-4 space-y-4">
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
                          ? "bg-primary/12 text-primary border-primary shadow-2xs font-black"
                          : "bg-muted/50 border-border text-muted-foreground hover:text-foreground font-bold"
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
                          ? "bg-primary/12 text-primary border-primary shadow-2xs"
                          : "bg-muted/50 border-border text-foreground"
                      }`}
                    >
                      <p className="text-xs font-black">{opt.title}</p>
                      <p
                        className={`text-[10px] leading-snug ${
                          isActive
                            ? "text-primary/80 font-bold"
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
          </div>
        </section>

        {/* ━━━ クイック移動アクション ━━━ */}
        <div className="space-y-2.5 pt-1">
          <Link
            href="/liff/tools/scorebook-import"
            className="w-full h-13 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xs sm:text-sm shadow-xs flex items-center justify-center gap-2 active:scale-98 transition-all"
          >
            <ScanLine className="w-4 h-4" />
            <span>スコアブック取り込み画面へ進む</span>
          </Link>

          <Link
            href="/liff/settings/team"
            className="p-3.5 rounded-2xl border border-border bg-card shadow-xs hover:border-primary/40 transition-all flex items-center justify-between group active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-slate-500/12 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-black text-foreground truncate">
                  チーム設定はこちら
                </p>
                <p className="text-[10px] font-bold text-muted-foreground truncate">
                  チーム基本情報・活動班・球場マスタ・LINE速報配信設定
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
          </Link>
        </div>

        <div className="h-8 w-full shrink-0 pointer-events-none select-none" aria-hidden="true" />
      </div>

      {/* 全画面拡大プレビューモーダル（Portal z-[9999]） */}
      {mounted &&
        isZoomOpen &&
        previewImageUrl &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-slate-950/70 flex items-center justify-center p-3 pb-[max(env(safe-area-inset-bottom),16px)]"
            onClick={() => setIsZoomOpen(false)}
          >
            <div
              className="w-full max-w-3xl max-h-[88dvh] rounded-2xl border border-border bg-card shadow-xs overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between gap-2 shrink-0">
                <span className="text-xs sm:text-sm font-black text-white truncate">
                  登録済みスコア記号早見表プレビュー
                </span>
                <button
                  type="button"
                  onClick={() => setIsZoomOpen(false)}
                  className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer transition-colors"
                  aria-label="閉じる"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-3 bg-slate-950 flex items-center justify-center">
                <img
                  src={previewImageUrl}
                  alt="スコア記号早見表の拡大表示"
                  className="max-w-full max-h-[75dvh] object-contain rounded-xl"
                />
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

