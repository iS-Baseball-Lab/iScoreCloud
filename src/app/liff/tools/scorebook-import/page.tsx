// filepath: src/app/liff/tools/scorebook-import/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { useLiff } from "@/components/liff/LiffProvider";
import { LiffToolSubNav } from "@/components/liff/LiffToolSubNav";
import { getClientQueryParam } from "@/lib/liff/liff-client";
import {
  buildCalibratedRulerSheetImage,
  buildInningOutsReconcileCrop,
  buildMissingOrderComparisonCrop,
  extractInningChunkCompositeCrop,
  extractStructureFocusCrops,
  preprocessScorebookImage,
  type PreprocessedScorebookImage,
} from "@/lib/liff/scorebook-image";
import {
  applyRecoveredMissingAtBats,
  detectExcessOutInnings,
  detectMissingOrderGaps,
  reconcileSheetExcessOutsDeterministically,
} from "@/lib/liff/scorebook-validator";
import {
  clearScorebookDraft,
  loadScorebookDraft,
  peekScorebookDraftMeta,
  reconstructFileFromDataUrlAsync,
  saveScorebookDraft,
  type ScorebookDraftMeta,
} from "@/lib/liff/scorebook-draft";
import { loadLiffScoreSettings } from "@/lib/liff/score-settings";
import {
  Step1MatchAndImages,
  type SheetImageState,
} from "./_components/Step1MatchAndImages";
import { Step2StructureCheck } from "./_components/Step2StructureCheck";
import { Step3PinpointReview } from "./_components/Step3PinpointReview";
import {
  formatElapsedSeconds,
  formatTotalElapsedSeconds,
  type ImportScopeMode,
  type NormalizedBox,
  type ResolvedMissingAtBatItem,
  type ScorebookAnalysisTimingSummary,
  type ScorebookGridCorners,
  type ScorebookMatchSummary,
  type ScorebookPitcherStint,
  type ScorebookRosterPlayer,
  type ScorebookSheetStructure,
  type ScorebookTimingEntry,
  type ScorebookV2AtBat,
} from "@/types/scorebook-v2";
import {
  ScanLine,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Video,
  Trophy,
  RotateCcw,
  Save,
  Trash2,
  X,
  Settings,
  Clock,
} from "lucide-react";

type WizardStep = 1 | 2 | 3 | 4;

interface ContextApiResponse {
  success: boolean;
  isDemo?: boolean;
  team?: {
    id: string;
    name: string;
    scorebookLegendUrl: string | null;
  } | null;
  roster?: ScorebookRosterPlayer[];
  matches?: ScorebookMatchSummary[];
  error?: string;
}

interface SaveSummaryData {
  matchId: string;
  savedAtBatsCount: number;
  savedPitchesCount: number;
  myScore: number;
  opponentScore: number;
  myHits: number;
  opponentHits: number;
}

const createInitialSheetImageState = (
  enhancePencil = false
): SheetImageState => ({
  file: null,
  rotationDeg: 0,
  fineTiltDeg: 0,
  perspectiveCorners: null,
  enhancePencil,
  cropTop: 0,
  cropBottom: 0,
  cropLeft: 0,
  cropRight: 0,
  processed: null,
  isProcessing: false,
});

/**
 * 2枚セット読込時、片面の投手欄が未記載（「相手投手」または空欄）の場合や、
 * 先発1名しか抽出されていないが反対側シートの打順・途中交代（守備変更 6→1 を含む position === "1"）に
 * 救援投手が記録されている場合に、登板投手リレー（継投）を自動相互補完する
 */
function crossFillOppositePitchers(
  target: ScorebookSheetStructure,
  opposite: ScorebookSheetStructure | null
): ScorebookSheetStructure {
  if (!opposite) return target;

  const realTargetPitchers = target.pitchers.filter(
    (p) => p.name.trim() !== "" && p.name.trim() !== "相手投手"
  );
  // 既に2名以上の継投が読み取れている場合はそのまま優先
  if (realTargetPitchers.length >= 2) return target;

  const starterSlot = opposite.batters.find(
    (b) => b.position === "1" && b.name.trim() !== ""
  );

  const rawReliefSubs = opposite.batters
    .flatMap((b) => b.substitutions)
    .filter((s) => s.position === "1" && s.name.trim() !== "")
    .sort((a, b) => a.inningEntered - b.inningEntered);

  // 同一選手・同一イニングの重複を除外し、先発と同名の初期エントリも除外
  const starterBase = realTargetPitchers[0] || starterSlot;
  if (!starterBase) return target;

  const starterCleanName = starterBase.name.replace(/\s+/g, "");
  const dedupedReliefs: typeof rawReliefSubs = [];
  for (const rel of rawReliefSubs) {
    const cleanRel = rel.name.replace(/\s+/g, "");
    const prevName =
      dedupedReliefs.length > 0
        ? dedupedReliefs[dedupedReliefs.length - 1].name.replace(/\s+/g, "")
        : starterCleanName;
    if (cleanRel === prevName) continue;
    dedupedReliefs.push(rel);
  }

  // 既に先発1名が入っており、反対側にも救援投手がいないなら変更不要
  if (realTargetPitchers.length === 1 && dedupedReliefs.length === 0) {
    return target;
  }

  const maxInn =
    target.innings[target.innings.length - 1]?.inning ||
    opposite.innings[opposite.innings.length - 1]?.inning ||
    7;

  const builtPitchers: ScorebookPitcherStint[] = [];
  const starterTo =
    dedupedReliefs.length > 0
      ? Math.max(1, dedupedReliefs[0].inningEntered - 1)
      : maxInn;

  builtPitchers.push({
    id: realTargetPitchers[0]?.id || crypto.randomUUID(),
    order: 1,
    name: starterBase.name,
    uniformNumber: starterBase.uniformNumber,
    playerId: starterBase.playerId,
    fromInning: 1,
    toInning: starterTo,
  });

  dedupedReliefs.forEach((rel, idx) => {
    const nextRel = dedupedReliefs[idx + 1];
    builtPitchers.push({
      id: crypto.randomUUID(),
      order: idx + 2,
      name: rel.name,
      uniformNumber: rel.uniformNumber,
      playerId: rel.playerId,
      fromInning: rel.inningEntered,
      toInning: nextRel
        ? Math.max(rel.inningEntered, nextRel.inningEntered - 1)
        : maxInn,
    });
  });

  return {
    ...target,
    pitchers: builtPitchers,
  };
}

export default function LiffScorebookImportPage() {
  const { currentTeam } = useLiff();

  const [step, setStep] = useState<WizardStep>(1);
  const [isLoadingContext, setIsLoadingContext] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [resolvedTeamId, setResolvedTeamId] = useState<string>("");
  const [teamLegendUrl, setTeamLegendUrl] = useState<string | null>(null);
  const [roster, setRoster] = useState<ScorebookRosterPlayer[]>([]);
  const [matches, setMatches] = useState<ScorebookMatchSummary[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>("");

  const [importScope, setImportScope] = useState<ImportScopeMode>(
    () => loadLiffScoreSettings().defaultImportScope
  );
  const [topImage, setTopImage] = useState<SheetImageState>(() =>
    createInitialSheetImageState(loadLiffScoreSettings().defaultEnhancePencil)
  );
  const [bottomImage, setBottomImage] = useState<SheetImageState>(() =>
    createInitialSheetImageState(loadLiffScoreSettings().defaultEnhancePencil)
  );

  const [legendOverride, setLegendOverride] = useState<{
    dataUrl: string;
    base64: string;
    mimeType: string;
  } | null>(null);
  const [isLegendProcessing, setIsLegendProcessing] = useState(false);

  const preprocessSeqRef = useRef<{ top: number; bottom: number }>({
    top: 0,
    bottom: 0,
  });
  const sliderDebounceRef = useRef<{
    top: ReturnType<typeof setTimeout> | null;
    bottom: ReturnType<typeof setTimeout> | null;
  }>({
    top: null,
    bottom: null,
  });
  const didVisitScoreSettingsRef = useRef(false);

  const [isCreatingMatch, setIsCreatingMatch] = useState(false);
  const [isAnalyzingStructure, setIsAnalyzingStructure] = useState(false);
  const [structureProgressLabel, setStructureProgressLabel] = useState("");
  const [structureStartedAtMs, setStructureStartedAtMs] = useState<
    number | null
  >(null);
  const [structureActiveLabel, setStructureActiveLabel] = useState<
    string | null
  >(null);
  const [structureActiveStartedAtMs, setStructureActiveStartedAtMs] = useState<
    number | null
  >(null);
  const [structureCompletedTimings, setStructureCompletedTimings] = useState<
    ScorebookTimingEntry[]
  >([]);
  const [structureTotalMs, setStructureTotalMs] = useState<number | null>(null);

  const [isAnalyzingInnings, setIsAnalyzingInnings] = useState(false);
  const [reanalyzingInningKey, setReanalyzingInningKey] = useState<
    string | null
  >(null);
  const [isRepairingOrderGaps, setIsRepairingOrderGaps] = useState(false);
  const [analysisProgressLabel, setAnalysisProgressLabel] = useState("");
  const [deepStartedAtMs, setDeepStartedAtMs] = useState<number | null>(null);
  const [deepTotalDurationMs, setDeepTotalDurationMs] = useState<number | null>(
    null
  );
  const [deepActiveLabel, setDeepActiveLabel] = useState<string | null>(null);
  const [deepActiveLabels, setDeepActiveLabels] = useState<string[]>([]);
  const [deepActiveStartedAtMs, setDeepActiveStartedAtMs] = useState<
    number | null
  >(null);
  const [deepCompletedTimings, setDeepCompletedTimings] = useState<
    ScorebookTimingEntry[]
  >([]);
  const [timingSummary, setTimingSummary] =
    useState<ScorebookAnalysisTimingSummary | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [topStructure, setTopStructure] =
    useState<ScorebookSheetStructure | null>(null);
  const [bottomStructure, setBottomStructure] =
    useState<ScorebookSheetStructure | null>(null);
  const [topAtBats, setTopAtBats] = useState<ScorebookV2AtBat[]>([]);
  const [bottomAtBats, setBottomAtBats] = useState<ScorebookV2AtBat[]>([]);
  const [saveSummary, setSaveSummary] = useState<SaveSummaryData | null>(null);

  const hasRestoredTeamRef = useRef<string | null>(null);
  const completedChunkCacheRef = useRef<
    Map<string, { atBats: ScorebookV2AtBat[]; nextLeadOffOrder?: number }>
  >(new Map());
  /** 429 / 503 が発生したモデルをクライアント側でも50秒記憶し、別Workerインスタンスでも0msでスキップさせる */
  const cooledModelsRef = useRef<Map<string, number>>(new Map());
  const [isDraftReady, setIsDraftReady] = useState(false);
  const [availableDraftMeta, setAvailableDraftMeta] =
    useState<ScorebookDraftMeta | null>(null);
  const [isRestoringDraft, setIsRestoringDraft] = useState(false);
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<number | null>(null);
  const [restoredDraftBannerAt, setRestoredDraftBannerAt] = useState<
    number | null
  >(null);

  const formatSavedTime = (ts: number) => {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  };

  // 1. チーム選手名鑑・試合一覧の読み込み（初期表示時は巨大画像の自動展開を行わずメモリ負荷ゼロで起動）
  const fetchContext = useCallback(async () => {
    try {
      setIsLoadingContext(true);
      setErrorBanner(null);
      const qTeam = currentTeam?.id || getClientQueryParam("teamId") || "";
      const res = await fetch(
        `/api/liff/scorebook/context?teamId=${encodeURIComponent(qTeam)}`
      );
      const data = (await res.json()) as ContextApiResponse;

      if (!data.success) {
        throw new Error(data.error || "初期データの取得に失敗しました");
      }

      const effectiveTeamId = data.team?.id || qTeam || "default";
      if (data.team) {
        setResolvedTeamId(data.team.id);
        setTeamLegendUrl(data.team.scorebookLegendUrl);
      }
      setRoster(data.roster || []);
      const fetchedMatches = data.matches || [];
      setMatches(fetchedMatches);

      const urlMatchId = getClientQueryParam("matchId");
      const preferredMatchId =
        urlMatchId && fetchedMatches.some((m) => m.id === urlMatchId)
          ? urlMatchId
          : fetchedMatches[0]?.id || "";

      if (hasRestoredTeamRef.current !== effectiveTeamId) {
        hasRestoredTeamRef.current = effectiveTeamId;
        const prefs = loadLiffScoreSettings();
        setImportScope(prefs.defaultImportScope);
        setTopImage(createInitialSheetImageState(prefs.defaultEnhancePencil));
        setBottomImage(
          createInitialSheetImageState(prefs.defaultEnhancePencil)
        );
        if (preferredMatchId) {
          setSelectedMatchId((prev) => prev || preferredMatchId);
        }

        // 軽量メタ情報（約150B）のみで前回下書きの有無を確認し、必要時のみボタン押下で復元する
        const draftMeta = peekScorebookDraftMeta(effectiveTeamId);
        setAvailableDraftMeta(draftMeta);
        setIsDraftReady(true);
      } else if (preferredMatchId) {
        setSelectedMatchId((prev) => prev || preferredMatchId);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorBanner(msg);
      setIsDraftReady(true);
    } finally {
      setIsLoadingContext(false);
    }
  }, [currentTeam?.id]);

  const handleRestoreSavedDraft = async () => {
    if (isRestoringDraft) return;
    setIsRestoringDraft(true);
    setErrorBanner(null);
    try {
      const teamKey = resolvedTeamId || currentTeam?.id || "default";
      const draft = await loadScorebookDraft(teamKey);
      if (!draft) {
        await clearScorebookDraft(teamKey);
        setAvailableDraftMeta(null);
        return;
      }

      setImportScope(draft.importScope);
      const matchExists = matches.some((m) => m.id === draft.selectedMatchId);
      if (matchExists) {
        setSelectedMatchId(draft.selectedMatchId);
      }

      if (draft.topImage.processed) {
        const topFile = await reconstructFileFromDataUrlAsync(
          draft.topImage.processed.dataUrl,
          draft.topImage.fileName || "scorebook-top.jpg"
        );
        setTopImage({
          ...createInitialSheetImageState(),
          file: topFile,
          enhancePencil: draft.topImage.enhancePencil,
          processed: draft.topImage.processed,
        });
      }

      if (draft.bottomImage.processed) {
        const bottomFile = await reconstructFileFromDataUrlAsync(
          draft.bottomImage.processed.dataUrl,
          draft.bottomImage.fileName || "scorebook-bottom.jpg"
        );
        setBottomImage({
          ...createInitialSheetImageState(),
          file: bottomFile,
          enhancePencil: draft.bottomImage.enhancePencil,
          processed: draft.bottomImage.processed,
        });
      }

      setLegendOverride(draft.legendOverride);
      setTopStructure(draft.topStructure);
      setBottomStructure(draft.bottomStructure);
      setTopAtBats(
        reconcileSheetExcessOutsDeterministically(
          draft.topAtBats,
          draft.topStructure
        ).atBats
      );
      setBottomAtBats(
        reconcileSheetExcessOutsDeterministically(
          draft.bottomAtBats,
          draft.bottomStructure
        ).atBats
      );
      setTimingSummary(draft.timingSummary ?? null);
      setStructureTotalMs(draft.timingSummary?.structureTotalMs ?? null);
      setStructureCompletedTimings(draft.timingSummary?.structureEntries ?? []);
      setDeepTotalDurationMs(draft.timingSummary?.deepTotalMs ?? null);
      setDeepCompletedTimings(draft.timingSummary?.inningEntries ?? []);

      if (
        draft.step === 3 &&
        (draft.topAtBats.length > 0 || draft.bottomAtBats.length > 0)
      ) {
        setStep(3);
      } else if (
        draft.step >= 2 &&
        (draft.topStructure || draft.bottomStructure)
      ) {
        setStep(2);
      } else {
        setStep(1);
      }

      setAvailableDraftMeta(null);
      setLastAutoSavedAt(draft.savedAt);
      setRestoredDraftBannerAt(draft.savedAt);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorBanner(`下書きの復元に失敗しました: ${msg}`);
    } finally {
      setIsRestoringDraft(false);
    }
  };

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  // スコア設定画面から戻ってきた際のみ、登録された早見表URLを同期（カメラ・ファイル選択復帰時の不要な通信競合を防止）
  useEffect(() => {
    const syncScoreSettingsFromReturn = async () => {
      try {
        const qTeam = resolvedTeamId || currentTeam?.id || "";
        const res = await fetch(
          `/api/liff/scorebook/context?teamId=${encodeURIComponent(qTeam)}`
        );
        const data = (await res.json()) as ContextApiResponse;
        if (data.success && data.team) {
          setTeamLegendUrl(data.team.scorebookLegendUrl);
        }
      } catch {
        // ignore background sync error
      }
    };

    const handleVisibilityOrFocus = () => {
      if (
        document.visibilityState === "visible" &&
        didVisitScoreSettingsRef.current
      ) {
        didVisitScoreSettingsRef.current = false;
        void syncScoreSettingsFromReturn();
      }
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    return () => {
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [resolvedTeamId, currentTeam?.id]);

  useEffect(() => {
    const timers = sliderDebounceRef.current;
    return () => {
      if (timers.top) clearTimeout(timers.top);
      if (timers.bottom) clearTimeout(timers.bottom);
    };
  }, []);

  // 1-B. 入力途中のデータ（画像・Step2骨格・Step3の1球修正）を端末に自動下書き保存
  useEffect(() => {
    if (
      !isDraftReady ||
      step === 4 ||
      topImage.isProcessing ||
      bottomImage.isProcessing
    ) {
      return;
    }

    const teamKey = resolvedTeamId || currentTeam?.id || "default";
    const hasMeaningfulWork =
      step >= 2 ||
      Boolean(topImage.processed) ||
      Boolean(bottomImage.processed) ||
      Boolean(topStructure) ||
      Boolean(bottomStructure) ||
      topAtBats.length > 0 ||
      bottomAtBats.length > 0;

    if (!hasMeaningfulWork) {
      if (lastAutoSavedAt !== null) {
        void clearScorebookDraft(teamKey);
        setLastAutoSavedAt(null);
      }
      return;
    }

    setAvailableDraftMeta(null);

    const timer = setTimeout(() => {
      void saveScorebookDraft(teamKey, {
        step: step === 3 ? 3 : step === 2 ? 2 : 1,
        selectedMatchId,
        importScope,
        topImage: {
          fileName: topImage.file?.name || "scorebook-top.jpg",
          enhancePencil: topImage.enhancePencil,
          processed: topImage.processed,
        },
        bottomImage: {
          fileName: bottomImage.file?.name || "scorebook-bottom.jpg",
          enhancePencil: bottomImage.enhancePencil,
          processed: bottomImage.processed,
        },
        legendOverride,
        topStructure,
        bottomStructure,
        topAtBats,
        bottomAtBats,
        timingSummary,
      }).then((savedTs) => {
        setLastAutoSavedAt(savedTs);
      });
    }, 350);

    return () => clearTimeout(timer);
  }, [
    isDraftReady,
    resolvedTeamId,
    currentTeam?.id,
    step,
    selectedMatchId,
    importScope,
    topImage.processed,
    topImage.enhancePencil,
    topImage.file,
     topImage.isProcessing,
    bottomImage.processed,
    bottomImage.enhancePencil,
    bottomImage.file,
    bottomImage.isProcessing,
    legendOverride,
    topStructure,
    bottomStructure,
    topAtBats,
    bottomAtBats,
    timingSummary,
    lastAutoSavedAt,
  ]);

  const handleDiscardDraft = async () => {
    preprocessSeqRef.current.top += 1;
    preprocessSeqRef.current.bottom += 1;
    if (sliderDebounceRef.current.top) {
      clearTimeout(sliderDebounceRef.current.top);
      sliderDebounceRef.current.top = null;
    }
    if (sliderDebounceRef.current.bottom) {
      clearTimeout(sliderDebounceRef.current.bottom);
      sliderDebounceRef.current.bottom = null;
    }
    const teamKey = resolvedTeamId || currentTeam?.id || "default";
    await clearScorebookDraft(teamKey);
    const prefs = loadLiffScoreSettings();
    setImportScope(prefs.defaultImportScope);
    setTopImage(createInitialSheetImageState(prefs.defaultEnhancePencil));
    setBottomImage(createInitialSheetImageState(prefs.defaultEnhancePencil));
    setLegendOverride(null);
    setTopStructure(null);
    setBottomStructure(null);
    setTopAtBats([]);
    setBottomAtBats([]);
    setStructureStartedAtMs(null);
    setStructureActiveLabel(null);
    setStructureActiveStartedAtMs(null);
    setStructureCompletedTimings([]);
    setStructureTotalMs(null);
    setDeepStartedAtMs(null);
    setDeepTotalDurationMs(null);
    setDeepActiveLabel(null);
    setDeepActiveLabels([]);
    setDeepActiveStartedAtMs(null);
    setDeepCompletedTimings([]);
    setTimingSummary(null);
    cooledModelsRef.current.clear();
    setSaveSummary(null);
    setErrorBanner(null);
    setAvailableDraftMeta(null);
    setLastAutoSavedAt(null);
    setRestoredDraftBannerAt(null);
    setStep(1);
  };

  // 2. Canvas前処理の実行ヘルパー（シーケンス管理・18秒ウォッチドッグ・失敗時ロック防止付き）
  const runPreprocess = async (
    isTop: boolean,
    nextState: SheetImageState,
    fallbackProcessed: PreprocessedScorebookImage | null = null
  ) => {
    const sideKey = isTop ? "top" : "bottom";
    const setter = isTop ? setTopImage : setBottomImage;

    if (sliderDebounceRef.current[sideKey]) {
      clearTimeout(sliderDebounceRef.current[sideKey]!);
      sliderDebounceRef.current[sideKey] = null;
    }

    const seq = ++preprocessSeqRef.current[sideKey];

    let sourceFile = nextState.file;
    if (!sourceFile && nextState.processed?.dataUrl) {
      sourceFile = await reconstructFileFromDataUrlAsync(
        nextState.processed.dataUrl,
        isTop ? "scorebook-top.jpg" : "scorebook-bottom.jpg"
      );
    }

    if (!sourceFile) {
      setter(
        createInitialSheetImageState(
          loadLiffScoreSettings().defaultEnhancePencil
        )
      );
      return;
    }

    const activeState: SheetImageState = {
      ...nextState,
      file: sourceFile,
    };

    setter({ ...activeState, isProcessing: true });

    let watchdogId: ReturnType<typeof setTimeout> | null = null;
    try {
      const processed = await Promise.race([
        preprocessScorebookImage(sourceFile, {
          rotationDeg: activeState.rotationDeg,
          fineTiltDeg: activeState.fineTiltDeg,
          perspectiveCorners: activeState.perspectiveCorners,
          enhancePencil: activeState.enhancePencil,
          cropInsets: {
            top: activeState.cropTop,
            bottom: activeState.cropBottom,
            left: activeState.cropLeft,
            right: activeState.cropRight,
          },
          maxLongEdge: 2400,
        }),
        new Promise<never>((_, reject) => {
          watchdogId = setTimeout(() => {
            reject(
              new Error(
                "画像の最適化がタイムアウトしました。もう一度撮影・選択をお試しください"
              )
            );
          }, 18000);
        }),
      ]);

      if (preprocessSeqRef.current[sideKey] !== seq) return;
      setter({ ...activeState, processed, isProcessing: false });
    } catch (err) {
      if (preprocessSeqRef.current[sideKey] !== seq) return;
      const msg = err instanceof Error ? err.message : String(err);
      setErrorBanner(`画像の前処理に失敗しました: ${msg}`);

      if (fallbackProcessed) {
        // 既に読込済み画像の回転・傾き調整時に失敗した場合は既存プレビューを維持
        setter({
          ...activeState,
          processed: fallbackProcessed,
          isProcessing: false,
        });
      } else {
        // 初回撮影・画像選択で失敗した場合は必ず初期状態へ戻し、ボタンロック（無限スピナー）を完全防止
        setter(createInitialSheetImageState(activeState.enhancePencil));
      }
    } finally {
      if (watchdogId) clearTimeout(watchdogId);
    }
  };

  const scheduleDebouncedPreprocess = (
    isTop: boolean,
    nextState: SheetImageState,
    fallbackProcessed: PreprocessedScorebookImage | null
  ) => {
    const sideKey = isTop ? "top" : "bottom";
    const setter = isTop ? setTopImage : setBottomImage;
    setter(nextState);

    if (sliderDebounceRef.current[sideKey]) {
      clearTimeout(sliderDebounceRef.current[sideKey]!);
    }
    sliderDebounceRef.current[sideKey] = setTimeout(() => {
      sliderDebounceRef.current[sideKey] = null;
      void runPreprocess(isTop, nextState, fallbackProcessed);
    }, 180);
  };

  const handleSelectSheetFile = (isTop: boolean, file: File | null) => {
    setErrorBanner(null);
    if (!file) {
      void runPreprocess(
        isTop,
        createInitialSheetImageState(
          loadLiffScoreSettings().defaultEnhancePencil
        ),
        null
      );
      return;
    }
    const base = isTop ? topImage : bottomImage;
    void runPreprocess(
      isTop,
      {
        ...base,
        file,
        rotationDeg: 0,
        fineTiltDeg: 0,
        perspectiveCorners: null,
        cropTop: 0,
        cropBottom: 0,
        cropLeft: 0,
        cropRight: 0,
        processed: null,
      },
      null
    );
  };

  const handleRotateSheet = (isTop: boolean) => {
    const cur = isTop ? topImage : bottomImage;
    if (!cur.file && !cur.processed) return;
    const nextDeg = ((cur.rotationDeg + 90) % 360) as 0 | 90 | 180 | 270;
    void runPreprocess(
      isTop,
      {
        ...cur,
        rotationDeg: nextDeg,
        perspectiveCorners: null,
      },
      cur.processed
    );
  };

  const handleToggleEnhance = (isTop: boolean) => {
    const cur = isTop ? topImage : bottomImage;
    if (!cur.file && !cur.processed) return;
    void runPreprocess(
      isTop,
      { ...cur, enhancePencil: !cur.enhancePencil },
      cur.processed
    );
  };

  const handleUpdateCrop = (
    isTop: boolean,
    edge: "cropTop" | "cropBottom" | "cropLeft" | "cropRight",
    val: number
  ) => {
    const cur = isTop ? topImage : bottomImage;
    if (!cur.file && !cur.processed) return;
    scheduleDebouncedPreprocess(
      isTop,
      { ...cur, [edge]: val },
      cur.processed
    );
  };

  const handleUpdateFineTilt = (isTop: boolean, deg: number) => {
    const cur = isTop ? topImage : bottomImage;
    if (!cur.file && !cur.processed) return;
    scheduleDebouncedPreprocess(
      isTop,
      { ...cur, fineTiltDeg: deg },
      cur.processed
    );
  };

  const handleUpdatePerspectiveCorners = (
    isTop: boolean,
    corners: ScorebookGridCorners | null
  ) => {
    const cur = isTop ? topImage : bottomImage;
    if (!cur.file && !cur.processed) return;
    void runPreprocess(
      isTop,
      { ...cur, perspectiveCorners: corners },
      cur.processed
    );
  };

  const handleSelectLegendOverride = async (file: File | null) => {
    if (!file) {
      setLegendOverride(null);
      return;
    }
    setErrorBanner(null);
    setIsLegendProcessing(true);
    let watchdogId: ReturnType<typeof setTimeout> | null = null;
    try {
      const processed = await Promise.race([
        preprocessScorebookImage(file, {
          rotationDeg: 0,
          enhancePencil: false,
          maxLongEdge: 1500,
        }),
        new Promise<never>((_, reject) => {
          watchdogId = setTimeout(() => {
            reject(new Error("早見表画像の読み込みがタイムアウトしました"));
          }, 15000);
        }),
      ]);
      setLegendOverride({
        dataUrl: processed.dataUrl,
        base64: processed.base64,
        mimeType: processed.mimeType,
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "早見表画像の読み込みに失敗しました";
      setErrorBanner(msg);
    } finally {
      if (watchdogId) clearTimeout(watchdogId);
      setIsLegendProcessing(false);
    }
  };

  // 3. クイック新規試合枠作成
  const handleCreateMatch = async (payload: {
    opponent: string;
    date: string;
    matchType: "official" | "practice" | "exchange";
    tournamentName: string;
    battingOrder: "first" | "second";
    innings: number;
  }) => {
    try {
      setIsCreatingMatch(true);
      setErrorBanner(null);
      const res = await fetch("/api/liff/scorebook/create-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: resolvedTeamId || currentTeam?.id || "",
          ...payload,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        match?: ScorebookMatchSummary;
        error?: string;
      };
      if (!data.success || !data.match) {
        throw new Error(data.error || "試合枠の作成に失敗しました");
      }
      setMatches((prev) => [data.match!, ...prev]);
      setSelectedMatchId(data.match.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorBanner(msg);
    } finally {
      setIsCreatingMatch(false);
    }
  };

  const getActiveSkippedModels = (): string[] => {
    const now = Date.now();
    const skipped: string[] = [];
    for (const [model, until] of cooledModelsRef.current.entries()) {
      if (until > now) {
        skipped.push(model);
      } else {
        cooledModelsRef.current.delete(model);
      }
    }
    return skipped;
  };

  const recordCooledModels = (models?: string[]) => {
    if (!Array.isArray(models) || models.length === 0) return;
    const until = Date.now() + 50_000;
    for (const m of models) {
      if (typeof m === "string" && m.trim()) {
        cooledModelsRef.current.set(m.trim(), until);
      }
    }
  };

  const parseSafeJson = async <T,>(
    res: Response,
    fallbackMsg: string
  ): Promise<T> => {
    const rawText = await res.text();
    try {
      return JSON.parse(rawText) as T;
    } catch {
      const trimmed = rawText.trim();
      const lower = trimmed.toLowerCase();
      const isHtmlGatewayError =
        lower.startsWith("<!doctype") ||
        lower.startsWith("<html") ||
        lower.includes("<head>") ||
        lower.includes("cloudflare");
      if (isHtmlGatewayError) {
        const statusReason =
          res.status === 503 || res.status === 502
            ? "AIサーバーまたは通信経路が一時混雑しました"
            : res.status === 504 || res.status === 524
            ? "通信が一時タイムアウトしました"
            : "一時的な通信エラーが発生しました";
        throw new Error(
          `${fallbackMsg}（HTTP ${res.status}: ${statusReason}）`
        );
      }
      throw new Error(
        `${fallbackMsg} (HTTP ${res.status}${
          trimmed ? `: ${trimmed.slice(0, 100)}` : ""
        })`
      );
    }
  };

  // 4. Stage 1: AI骨格スキャン実行（高精細2200px＋打順欄・スコア欄の拡大クロップ併用＋直列実行）
  const scanSingleSheetStructure = async (
    isTop: boolean,
    imgState: SheetImageState,
    progressSuffix: string
  ): Promise<ScorebookSheetStructure> => {
    if (!imgState.processed) {
      throw new Error("画像が準備されていません");
    }
    const sideLabel = isTop ? "先攻（表）" : "後攻（裏）";
    setStructureProgressLabel(
      `${sideLabel}シートの打順・投手・得点を高精度スキャン中... ${progressSuffix}`
    );

    const [apiImg, focusCrops] = await Promise.all([
      buildCalibratedRulerSheetImage(imgState.processed, 1850, 0.89),
      extractStructureFocusCrops(
        imgState.processed.dataUrl,
        imgState.enhancePencil
      ),
    ]);

    const callOnce = async (): Promise<ScorebookSheetStructure> => {
      const res = await fetch("/api/liff/scorebook/analyze-structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: resolvedTeamId || currentTeam?.id || "",
          matchId: selectedMatchId,
          isTop,
          imageBase64: apiImg.base64,
          mimeType: apiImg.mimeType,
          lineupCropBase64: focusCrops?.lineupCropBase64,
          lineupCropMimeType: focusCrops?.mimeType,
          summaryCropBase64: focusCrops?.summaryCropBase64,
          summaryCropMimeType: focusCrops?.mimeType,
          legendBase64: legendOverride?.base64,
          legendMimeType: legendOverride?.mimeType,
        }),
      });
      const data = await parseSafeJson<{
        success: boolean;
        structure?: ScorebookSheetStructure;
        error?: string;
      }>(res, "骨格スキャン通信エラー");
      if (!data.success || !data.structure) {
        throw new Error(data.error || "骨格スキャンに失敗しました");
      }
      return data.structure;
    };

    try {
      return await callOnce();
    } catch (firstErr) {
      const firstMsg =
        firstErr instanceof Error ? firstErr.message : String(firstErr);
      // 全モデルのクォータ上限(429)到達時は即座の多重リトライで枠をさらに消費しないよう待機時間を長めに取る
      const isQuotaError =
        firstMsg.includes("429") || firstMsg.includes("利用枠上限");
      if (isQuotaError) {
        throw firstErr;
      }
      setStructureProgressLabel(
        `${sideLabel}シートを再スキャン中（AI混雑回避）... ${progressSuffix}`
      );
      await new Promise((r) => setTimeout(r, 2400));
      return await callOnce();
    }
  };

  const handleStartAnalyzeStructure = async () => {
    if (!selectedMatchId) return;
    setIsAnalyzingStructure(true);
    setErrorBanner(null);
    const stage1Start = Date.now();
    const stage1Entries: ScorebookTimingEntry[] = [];
    setStructureStartedAtMs(stage1Start);
    setStructureCompletedTimings([]);
    setStructureActiveLabel(null);
    setStructureActiveStartedAtMs(null);

    try {
      completedChunkCacheRef.current.clear();
      setTopAtBats([]);
      setBottomAtBats([]);
      setDeepCompletedTimings([]);
      setDeepTotalDurationMs(null);
      setTimingSummary(null);
      const needTop = importScope === "both" || importScope === "top_only";
      const needBottom =
        importScope === "both" || importScope === "bottom_only";
      const totalSides = (needTop ? 1 : 0) + (needBottom ? 1 : 0);

      let stepCounter = 0;
      let resTop: ScorebookSheetStructure | null = null;
      let resBottom: ScorebookSheetStructure | null = null;

      if (needTop) {
        stepCounter += 1;
        const topStart = Date.now();
        setStructureActiveLabel("先攻シート骨格");
        setStructureActiveStartedAtMs(topStart);
        resTop = await scanSingleSheetStructure(
          true,
          topImage,
          `(${stepCounter}/${totalSides})`
        );
        setTopStructure(resTop);
        stage1Entries.push({
          key: "structure-top",
          isTop: true,
          innings: [],
          label: "先攻シート骨格",
          durationMs: Date.now() - topStart,
        });
        setStructureCompletedTimings([...stage1Entries]);
        setStructureActiveLabel(null);
        setStructureActiveStartedAtMs(null);
      }

      if (needBottom) {
        if (needTop) {
          // 2枚連続スキャン時の分間リクエスト上限(RPM)スパイクを緩和
          await new Promise((r) => setTimeout(r, 1000));
        }
        stepCounter += 1;
        const bottomStart = Date.now();
        setStructureActiveLabel("後攻シート骨格");
        setStructureActiveStartedAtMs(bottomStart);
        resBottom = await scanSingleSheetStructure(
          false,
          bottomImage,
          `(${stepCounter}/${totalSides})`
        );
        setBottomStructure(resBottom);
        stage1Entries.push({
          key: "structure-bottom",
          isTop: false,
          innings: [],
          label: "後攻シート骨格",
          durationMs: Date.now() - bottomStart,
        });
        setStructureCompletedTimings([...stage1Entries]);
        setStructureActiveLabel(null);
        setStructureActiveStartedAtMs(null);
      }

      // 両面読込時は反対側シートの「1 投」から未記載の相手投手を自動相互補完
      if (resTop && resBottom) {
        resTop = crossFillOppositePitchers(resTop, resBottom);
        resBottom = crossFillOppositePitchers(resBottom, resTop);
        setTopStructure(resTop);
        setBottomStructure(resBottom);
      }

      if (!needTop) setTopStructure(null);
      if (!needBottom) setBottomStructure(null);
      setStructureTotalMs(Date.now() - stage1Start);
      setStep(2);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorBanner(msg);
    } finally {
      setIsAnalyzingStructure(false);
      setStructureProgressLabel("");
      setStructureStartedAtMs(null);
      setStructureActiveLabel(null);
      setStructureActiveStartedAtMs(null);
    }
  };

  const handleRescanSingleSide = async (isTop: boolean) => {
    if (!selectedMatchId) return;
    const imgState = isTop ? topImage : bottomImage;
    if (!imgState.processed) return;

    setIsAnalyzingStructure(true);
    setErrorBanner(null);
    const rescanStart = Date.now();
    const rescanLabel = isTop ? "先攻シート骨格" : "後攻シート骨格";
    setStructureStartedAtMs(rescanStart);
    setStructureActiveLabel(rescanLabel);
    setStructureActiveStartedAtMs(rescanStart);
    try {
      completedChunkCacheRef.current.clear();
      let rescanned = await scanSingleSheetStructure(isTop, imgState, "(1/1)");
      if (isTop) {
        rescanned = crossFillOppositePitchers(rescanned, bottomStructure);
        setTopStructure(rescanned);
        setTopAtBats([]);
      } else {
        rescanned = crossFillOppositePitchers(rescanned, topStructure);
        setBottomStructure(rescanned);
        setBottomAtBats([]);
      }
      setDeepCompletedTimings((prev) =>
        prev.filter((entry) => entry.isTop !== isTop)
      );
      const elapsed = Date.now() - rescanStart;
      const updatedEntry: ScorebookTimingEntry = {
        key: isTop ? "structure-top" : "structure-bottom",
        isTop,
        innings: [],
        label: rescanLabel,
        durationMs: elapsed,
      };
      setStructureCompletedTimings((prev) => {
        const filtered = prev.filter((e) => e.key !== updatedEntry.key);
        const next = isTop
          ? [updatedEntry, ...filtered]
          : [...filtered, updatedEntry];
        setStructureTotalMs(
          next.reduce((acc, item) => acc + item.durationMs, 0)
        );
        return next;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorBanner(msg);
    } finally {
      setIsAnalyzingStructure(false);
      setStructureProgressLabel("");
      setStructureStartedAtMs(null);
      setStructureActiveLabel(null);
      setStructureActiveStartedAtMs(null);
    }
  };

  const isSkippableFinalBottomInning = (
    isTop: boolean,
    innNum: number,
    structure: ScorebookSheetStructure
  ): boolean => {
    if (isTop || structure.innings.length === 0) return false;
    const maxInn = Math.max(1, ...structure.innings.map((m) => m.inning));
    const meta = structure.innings.find((m) => m.inning === innNum);
    return (
      innNum === maxInn &&
      innNum >= 3 &&
      (meta?.runs ?? 0) === 0 &&
      (meta?.hits ?? 0) === 0 &&
      (meta?.columnCount ?? 1) <= 1
    );
  };

  const computeNextLeadOffFromAtBats = (
    atBatsList: ScorebookV2AtBat[],
    lineupCycle: number,
    fallbackOrder: number
  ): number => {
    if (atBatsList.length === 0) return fallbackOrder;
    const lastAb = atBatsList[atBatsList.length - 1];
    const endedByRunnerOutOnly =
      lastAb.resultCode === "other" &&
      lastAb.advances.some(
        (a) =>
          a.isOut &&
          (a.method === "caught_stealing" ||
            a.method === "pickoff_out" ||
            a.method === "interference_out" ||
            a.method === "appeal_out" ||
            a.method === "out_on_base")
      );
    return endedByRunnerOutOnly
      ? lastAb.battingOrder
      : (lastAb.battingOrder % lineupCycle) + 1;
  };

  const sortTimingEntries = (
    entries: ScorebookTimingEntry[]
  ): ScorebookTimingEntry[] =>
    [...entries].sort((a, b) => {
      const innA = a.innings[0] ?? 99;
      const innB = b.innings[0] ?? 99;
      if (innA !== innB) return innA - innB;
      if (a.isTop !== b.isTop) return a.isTop ? -1 : 1;
      return a.key.localeCompare(b.key);
    });

  /**
   * 骨格確定済みの打順（1〜9番等）の循環則から「抜けている打順（例: 1回4番終了→2回6番開始の間の5番）」を自動検出し、
   * 候補マス（1回・5番 vs 2回・5番 等）をピンポイント拡大照合して1打席データを自動補完する。
   */
  const reconcileMissingOrderGapsForSide = async (
    isTop: boolean,
    structure: ScorebookSheetStructure,
    imgState: SheetImageState,
    initialSideAtBats: ScorebookV2AtBat[],
    options?: { throwOnFailure?: boolean }
  ): Promise<{
    atBats: ScorebookV2AtBat[];
    repairedCount: number;
    durationMs: number;
  }> => {
    const startMs = Date.now();
    if (!imgState.processed || initialSideAtBats.length === 0) {
      return { atBats: initialSideAtBats, repairedCount: 0, durationMs: 0 };
    }

    let currentList = initialSideAtBats;
    let totalRepaired = 0;

    for (let pass = 0; pass < 2; pass++) {
      const allGaps = detectMissingOrderGaps(currentList, structure);
      if (allGaps.length === 0) break;

      const batchGaps = allGaps.slice(0, 6);
      const crop = await buildMissingOrderComparisonCrop(
        imgState.processed.dataUrl,
        structure,
        batchGaps
      );
      if (!crop) break;

      const sideLabel = isTop ? "先攻（表）" : "後攻（裏）";
      try {
        const res = await fetch(
          "/api/liff/scorebook/reconcile-missing-atbats",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              teamId: resolvedTeamId || currentTeam?.id || "",
              matchId: selectedMatchId,
              isTop,
              comparisonCropBase64: crop.base64,
              comparisonCropMimeType: crop.mimeType,
              structure,
              gaps: batchGaps,
              legendBase64: legendOverride?.base64,
              legendMimeType: legendOverride?.mimeType,
              skipModels: getActiveSkippedModels(),
            }),
          }
        );

        const data = await parseSafeJson<{
          success: boolean;
          resolved?: ResolvedMissingAtBatItem[];
          cooledModels?: string[];
          error?: string;
        }>(res, `${sideLabel}打順抜け自動補正エラー`);

        recordCooledModels(data.cooledModels);

        if (!data.success || !data.resolved || data.resolved.length === 0) {
          if (options?.throwOnFailure) {
            throw new Error(
              data.error || `${sideLabel}の打順抜け補正結果を取得できませんでした`
            );
          }
          break;
        }

        currentList = applyRecoveredMissingAtBats(
          currentList,
          data.resolved,
          batchGaps
        );
        totalRepaired += data.resolved.length;
      } catch (err) {
        if (options?.throwOnFailure) {
          throw err;
        }
        break;
      }
    }

    return {
      atBats: currentList,
      repairedCount: totalRepaired,
      durationMs: Date.now() - startMs,
    };
  };

  /**
   * 決定論的補正後もなお「1イニングが3アウトを超過している（例: 4打席すべてが凡退アウトと誤読され計4アウト）」イニングについて、
   * 当該イニングの全マスをトリプルビュー拡大画像で再検算し、必ず合計3アウトへ収束させる。
   */
  const reconcileExcessOutInningsForSide = async (
    isTop: boolean,
    structure: ScorebookSheetStructure,
    imgState: SheetImageState,
    initialSideAtBats: ScorebookV2AtBat[],
    options?: { targetInningOnly?: number; throwOnFailure?: boolean }
  ): Promise<{
    atBats: ScorebookV2AtBat[];
    repairedCount: number;
    durationMs: number;
  }> => {
    const startMs = Date.now();
    const det = reconcileSheetExcessOutsDeterministically(
      initialSideAtBats,
      structure
    );
    let currentList = det.atBats;
    let totalRepaired = det.changed ? 1 : 0;

    if (!imgState.processed || currentList.length === 0) {
      return {
        atBats: currentList,
        repairedCount: totalRepaired,
        durationMs: Date.now() - startMs,
      };
    }

    const specs = detectExcessOutInnings(currentList, structure).filter((s) =>
      typeof options?.targetInningOnly === "number"
        ? s.inning === options.targetInningOnly
        : true
    );
    if (specs.length === 0) {
      return {
        atBats: currentList,
        repairedCount: totalRepaired,
        durationMs: Date.now() - startMs,
      };
    }

    const sideLabel = isTop ? "先攻（表）" : "後攻（裏）";
    for (const spec of specs) {
      const crop = await buildInningOutsReconcileCrop(
        imgState.processed.dataUrl,
        structure,
        spec
      );
      if (!crop) continue;

      try {
        const res = await fetch("/api/liff/scorebook/reconcile-inning-outs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId: resolvedTeamId || currentTeam?.id || "",
            matchId: selectedMatchId,
            isTop,
            cropBase64: crop.base64,
            cropMimeType: crop.mimeType,
            structure,
            spec,
            legendBase64: legendOverride?.base64,
            legendMimeType: legendOverride?.mimeType,
            skipModels: getActiveSkippedModels(),
          }),
        });

        const data = await parseSafeJson<{
          success: boolean;
          atBats?: ScorebookV2AtBat[];
          cooledModels?: string[];
          error?: string;
        }>(res, `${sideLabel} ${spec.inning}回 3アウト補正エラー`);

        recordCooledModels(data.cooledModels);

        if (!data.success || !data.atBats || data.atBats.length === 0) {
          if (options?.throwOnFailure) {
            throw new Error(
              data.error ||
                `${sideLabel} ${spec.inning}回の3アウト超過補正に失敗しました`
            );
          }
          continue;
        }

        const before = currentList.filter((a) => a.inning < spec.inning);
        const after = currentList.filter((a) => a.inning > spec.inning);
        currentList = reconcileSheetExcessOutsDeterministically(
          [...before, ...data.atBats, ...after],
          structure
        ).atBats;
        totalRepaired += 1;
      } catch (err) {
        if (options?.throwOnFailure) {
          throw err;
        }
      }
    }

    return {
      atBats: currentList,
      repairedCount: totalRepaired,
      durationMs: Date.now() - startMs,
    };
  };

  // 5. Stage 2: イニング並列・高速ディープ解析（逐次リアルタイム保持・エラー耐性・未完了回のみ再開対応）
  const handleStartDeepAnalysis = async (opts?: { onlyMissing?: boolean }) => {
    if (!selectedMatchId) return;
    const onlyMissing = Boolean(opts && opts.onlyMissing === true);

    setIsAnalyzingInnings(true);
    setErrorBanner(null);
    const deepStart = Date.now();
    setDeepStartedAtMs(deepStart);
    setDeepActiveLabel(null);
    setDeepActiveLabels([]);
    setDeepActiveStartedAtMs(deepStart);

    const needTop = importScope === "both" || importScope === "top_only";
    const needBottom = importScope === "both" || importScope === "bottom_only";

    if (!onlyMissing) {
      completedChunkCacheRef.current.clear();
      if (needTop) setTopAtBats([]);
      if (needBottom) setBottomAtBats([]);
      setDeepCompletedTimings([]);
      setDeepTotalDurationMs(null);
    }

    const previousTimingsMap = new Map<string, ScorebookTimingEntry>();
    if (onlyMissing) {
      for (const prevEntry of deepCompletedTimings) {
        if (prevEntry.status !== "error") {
          previousTimingsMap.set(prevEntry.key, prevEntry);
        }
      }
    }

    const recordedMap = new Map<string, ScorebookTimingEntry>(
      onlyMissing ? previousTimingsMap : []
    );
    if (onlyMissing && recordedMap.size > 0) {
      setDeepCompletedTimings(
        sortTimingEntries(Array.from(recordedMap.values()))
      );
    }

    let workingTop: ScorebookV2AtBat[] =
      onlyMissing && needTop ? [...topAtBats] : [];
    let workingBottom: ScorebookV2AtBat[] =
      onlyMissing && needBottom ? [...bottomAtBats] : [];

    const commitSideInningAtBats = (
      isTop: boolean,
      targetInnings: number[],
      incomingAtBats: ScorebookV2AtBat[]
    ) => {
      const targetSet = new Set(targetInnings);
      if (isTop) {
        const kept = workingTop.filter((a) => !targetSet.has(a.inning));
        workingTop = [...kept, ...incomingAtBats].sort(
          (a, b) => a.inning - b.inning
        );
        setTopAtBats([...workingTop]);
      } else {
        const kept = workingBottom.filter((a) => !targetSet.has(a.inning));
        workingBottom = [...kept, ...incomingAtBats].sort(
          (a, b) => a.inning - b.inning
        );
        setBottomAtBats([...workingBottom]);
      }
    };

    const upsertTimingEntry = (entry: ScorebookTimingEntry) => {
      recordedMap.set(entry.key, entry);
      setDeepCompletedTimings(
        sortTimingEntries(Array.from(recordedMap.values()))
      );
    };

    const activeSideLabels: { top: string | null; bottom: string | null } = {
      top: null,
      bottom: null,
    };
    const syncActiveLabelsUi = () => {
      const list = [activeSideLabels.top, activeSideLabels.bottom].filter(
        (v): v is string => Boolean(v)
      );
      setDeepActiveLabels(list);
      setDeepActiveLabel(list[0] ?? null);
      if (list.length > 0) {
        setAnalysisProgressLabel(
          `${list.join(" ／ ")} の1球順序・打撃結果・進塁を高速解析中...（完了した回から自動保存されます）`
        );
      }
    };

    try {
      const buildSmartInningChunks = (
        structure: ScorebookSheetStructure
      ): number[][] => {
        const sortedMeta = [...structure.innings].sort(
          (a, b) => a.inning - b.inning
        );
        if (sortedMeta.length <= 7) {
          return sortedMeta.map((m) => [m.inning]);
        }

        const chunks: number[][] = [];
        let buf: number[] = [];

        for (const meta of sortedMeta) {
          const isDetailedInning =
            meta.columnCount >= 2 || meta.runs >= 1 || meta.hits >= 1;
          if (isDetailedInning) {
            if (buf.length > 0) {
              chunks.push(buf);
              buf = [];
            }
            chunks.push([meta.inning]);
          } else {
            buf.push(meta.inning);
            if (buf.length >= 2) {
              chunks.push(buf);
              buf = [];
            }
          }
        }
        if (buf.length > 0) {
          chunks.push(buf);
        }
        return chunks;
      };

      const buildStructureFingerprint = (
        structure: ScorebookSheetStructure
      ): string =>
        JSON.stringify({
          lx: structure.lineupRightX,
          gc: structure.gridCorners,
          b: structure.batters.map((x) => [
            x.battingOrder,
            x.name,
            x.position,
            x.rowBox?.[0],
            x.rowBox?.[2],
            x.substitutions.map((s) => [s.inningEntered, s.name, s.position]),
          ]),
          p: structure.pitchers.map((x) => [x.name, x.fromInning, x.toInning]),
          i: structure.innings.map((x) => [
            x.inning,
            x.runs,
            x.columnCount,
            x.columnBox?.[1],
            x.columnBox?.[3],
          ]),
        });

      const requestSingleChunk = async (
        isTop: boolean,
        structure: ScorebookSheetStructure,
        imgState: SheetImageState,
        structureFp: string,
        targetInnings: number[],
        expectedLeadOff: number
      ): Promise<{
        atBats: ScorebookV2AtBat[];
        nextLeadOffOrder?: number;
        fromCache?: boolean;
      }> => {
        if (!imgState.processed) {
          throw new Error("画像データが見つかりません");
        }
        const sourceDataUrl = imgState.processed.dataUrl;
        const alreadyEnhanced = imgState.enhancePencil;
        const cacheKey = `v6:${selectedMatchId}:${
          isTop ? "top" : "bottom"
        }:${sourceDataUrl.length}:${structureFp}:${expectedLeadOff}:${targetInnings.join(
          ","
        )}`;
        const cached = completedChunkCacheRef.current.get(cacheKey);
        if (cached) {
          return { ...cached, fromCache: true };
        }

        const targetBoxes: NormalizedBox[] = targetInnings
          .map(
            (innNum) =>
              structure.innings.find((m) => m.inning === innNum)?.columnBox
          )
          .filter((b): b is NormalizedBox => Array.isArray(b));

        const knownMinXs = structure.innings
          .map((m) => m.columnBox?.[1])
          .filter((v): v is number => typeof v === "number" && v > 0);
        const firstInningMinX =
          knownMinXs.length > 0 ? Math.min(...knownMinXs) : undefined;

        const focusCrop =
          targetBoxes.length > 0 || structure.innings.length > 0
            ? await extractInningChunkCompositeCrop(sourceDataUrl, targetBoxes, {
                structure,
                lineupRightX: structure.lineupRightX,
                firstInningMinX,
                batters: structure.batters,
                targetInnings,
                alreadyEnhanced,
              })
            : null;

        // focusCrop がある場合は全体シート画像の再生成・再送信をスキップして高速化する
        const fallbackApiImg = !focusCrop
          ? await buildCalibratedRulerSheetImage(
              imgState.processed,
              1600,
              0.86
            )
          : null;

        const sideLabel = isTop ? "先攻（表）" : "後攻（裏）";
        const res = await fetch("/api/liff/scorebook/analyze-inning-chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId: resolvedTeamId || currentTeam?.id || "",
            matchId: selectedMatchId,
            isTop,
            imageBase64: fallbackApiImg?.base64,
            mimeType: fallbackApiImg?.mimeType,
            focusCropBase64: focusCrop?.base64,
            focusCropMimeType: focusCrop?.mimeType,
            structure,
            targetInnings,
            expectedLeadOffOrder: expectedLeadOff,
            legendBase64: legendOverride?.base64,
            legendMimeType: legendOverride?.mimeType,
            skipModels: getActiveSkippedModels(),
          }),
        });

        const data = await parseSafeJson<{
          success: boolean;
          atBats?: ScorebookV2AtBat[];
          nextLeadOffOrder?: number;
          cooledModels?: string[];
          error?: string;
        }>(res, `${sideLabel}イニング解析通信エラー`);

        recordCooledModels(data.cooledModels);

        if (!data.success || !data.atBats) {
          throw new Error(
            data.error || `${sideLabel}のイニング解析に失敗しました`
          );
        }

        const canBeUnplayedFinalBottom = targetInnings.every((innNum) =>
          isSkippableFinalBottomInning(isTop, innNum, structure)
        );

        if (data.atBats.length === 0 && !canBeUnplayedFinalBottom) {
          throw new Error(
            `${sideLabel} ${targetInnings.join(
              "・"
            )}回の打席抽出が0件だったため再試行します`
          );
        }

        const result = {
          atBats: data.atBats,
          nextLeadOffOrder: data.nextLeadOffOrder,
        };
        completedChunkCacheRef.current.set(cacheKey, result);
        return result;
      };

      const requestSingleInningWithQuickRetry = async (
        isTop: boolean,
        structure: ScorebookSheetStructure,
        imgState: SheetImageState,
        structureFp: string,
        singleInn: number,
        expectedLeadOff: number
      ): Promise<{
        atBats: ScorebookV2AtBat[];
        nextLeadOffOrder?: number;
        fromCache?: boolean;
      }> => {
        try {
          return await requestSingleChunk(
            isTop,
            structure,
            imgState,
            structureFp,
            [singleInn],
            expectedLeadOff
          );
        } catch (firstErr) {
          const msg =
            firstErr instanceof Error ? firstErr.message : String(firstErr);
          const waitMs =
            msg.includes("429") || msg.includes("混雑") ? 2800 : 1500;
          await new Promise((r) => setTimeout(r, waitMs));
          return await requestSingleChunk(
            isTop,
            structure,
            imgState,
            structureFp,
            [singleInn],
            expectedLeadOff
          );
        }
      };

      const analyzeSheetByChunks = async (
        isTop: boolean,
        structure: ScorebookSheetStructure,
        imgState: SheetImageState,
        startStaggerMs = 0
      ): Promise<void> => {
        if (!imgState.processed) return;
        if (startStaggerMs > 0) {
          await new Promise((r) => setTimeout(r, startStaggerMs));
        }

        const sideKey = isTop ? "top" : "bottom";
        const halfSuffix = isTop ? "表" : "裏";
        const structureFp = buildStructureFingerprint(structure);
        const chunks = buildSmartInningChunks(structure);
        const lineupCycle = Math.max(9, structure.batters.length);

        let expectedLeadOff = 1;

        for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
          const targetInnings = chunks[cIdx];
          const entryKey = `${sideKey}-${targetInnings.join("-")}`;
          const rangeText =
            targetInnings.length === 1
              ? `${targetInnings[0]}回`
              : `${targetInnings[0]}〜${
                  targetInnings[targetInnings.length - 1]
                }回`;
          const itemLabel = `${rangeText}${halfSuffix}`;

          // 「未完了の回だけ再解析」モード時は、既に打席が保持されているイニングを0msでスキップし先頭打順だけ引き継ぐ
          if (onlyMissing) {
            const currentSideAtBats = isTop ? workingTop : workingBottom;
            const allCoveredInState = targetInnings.every((innNum) => {
              const hasAb = currentSideAtBats.some((a) => a.inning === innNum);
              if (hasAb) return true;
              const prevEntry = previousTimingsMap.get(`${sideKey}-${innNum}`);
              return (
                Boolean(prevEntry) &&
                isSkippableFinalBottomInning(isTop, innNum, structure)
              );
            });

            if (allCoveredInState) {
              const existingChunkAtBats = currentSideAtBats.filter((a) =>
                targetInnings.includes(a.inning)
              );
              expectedLeadOff = computeNextLeadOffFromAtBats(
                existingChunkAtBats,
                lineupCycle,
                expectedLeadOff
              );
              const existingEntry = previousTimingsMap.get(entryKey);
              upsertTimingEntry({
                key: entryKey,
                isTop,
                innings: targetInnings,
                label: itemLabel,
                durationMs: existingEntry?.durationMs ?? 0,
                fromCache: true,
                status: "success",
              });
              continue;
            }
          }

          const chunkStart = Date.now();
          activeSideLabels[sideKey] = itemLabel;
          setDeepActiveStartedAtMs(chunkStart);
          syncActiveLabelsUi();

          try {
            const chunkRes =
              targetInnings.length === 1
                ? await requestSingleInningWithQuickRetry(
                    isTop,
                    structure,
                    imgState,
                    structureFp,
                    targetInnings[0],
                    expectedLeadOff
                  )
                : await requestSingleChunk(
                    isTop,
                    structure,
                    imgState,
                    structureFp,
                    targetInnings,
                    expectedLeadOff
                  );

            commitSideInningAtBats(isTop, targetInnings, chunkRes.atBats);
            if (chunkRes.nextLeadOffOrder) {
              expectedLeadOff = chunkRes.nextLeadOffOrder;
            } else {
              expectedLeadOff = computeNextLeadOffFromAtBats(
                chunkRes.atBats,
                lineupCycle,
                expectedLeadOff
              );
            }

            upsertTimingEntry({
              key: entryKey,
              isTop,
              innings: targetInnings,
              label: itemLabel,
              durationMs: Date.now() - chunkStart,
              fromCache: Boolean(chunkRes.fromCache),
              status: "success",
            });

            activeSideLabels[sideKey] = null;
            syncActiveLabelsUi();

            if (!chunkRes.fromCache && cIdx < chunks.length - 1) {
              await new Promise((r) => setTimeout(r, 150));
            }
          } catch (chunkErr) {
            // 複数イニングチャンクだった場合は1イニング単位に分解して個別に試行・保存する
            if (targetInnings.length > 1) {
              for (const singleInn of targetInnings) {
                const singleKey = `${sideKey}-${singleInn}`;
                const singleLabel = `${singleInn}回${halfSuffix}`;
                const singleStart = Date.now();
                activeSideLabels[sideKey] = singleLabel;
                setDeepActiveStartedAtMs(singleStart);
                syncActiveLabelsUi();

                try {
                  const singleRes = await requestSingleInningWithQuickRetry(
                    isTop,
                    structure,
                    imgState,
                    structureFp,
                    singleInn,
                    expectedLeadOff
                  );
                  commitSideInningAtBats(isTop, [singleInn], singleRes.atBats);
                  if (singleRes.nextLeadOffOrder) {
                    expectedLeadOff = singleRes.nextLeadOffOrder;
                  }
                  upsertTimingEntry({
                    key: singleKey,
                    isTop,
                    innings: [singleInn],
                    label: singleLabel,
                    durationMs: Date.now() - singleStart,
                    status: "success",
                  });
                } catch (singleErr) {
                  const errMsg =
                    singleErr instanceof Error
                      ? singleErr.message
                      : String(singleErr);
                  upsertTimingEntry({
                    key: singleKey,
                    isTop,
                    innings: [singleInn],
                    label: singleLabel,
                    durationMs: Date.now() - singleStart,
                    status: "error",
                    errorDetail: errMsg,
                  });
                  const estRuns =
                    structure.innings.find((m) => m.inning === singleInn)
                      ?.runs ?? 0;
                  expectedLeadOff =
                    ((expectedLeadOff - 1 + Math.max(3, estRuns + 3)) %
                      lineupCycle) +
                    1;
                }
              }
            } else {
              // 1イニング単独エラー時も全体を止めず、当該イニングをエラー記録して残りイニングの解析を続行する！
              const errMsg =
                chunkErr instanceof Error ? chunkErr.message : String(chunkErr);
              upsertTimingEntry({
                key: entryKey,
                isTop,
                innings: targetInnings,
                label: itemLabel,
                durationMs: Date.now() - chunkStart,
                status: "error",
                errorDetail: errMsg,
              });
              const estRuns =
                structure.innings.find((m) => m.inning === targetInnings[0])
                  ?.runs ?? 0;
              expectedLeadOff =
                ((expectedLeadOff - 1 + Math.max(3, estRuns + 3)) %
                  lineupCycle) +
                1;
            }

            activeSideLabels[sideKey] = null;
            syncActiveLabelsUi();
          }
        }

        // 全イニング走査完了直後に「打順の抜け・飛び」および「1イニング3アウト超過（4アウト以上）」を数学検算し、
        // 矛盾があれば候補マスを即座に拡大照合して打順連続性と1イニング3アウト整合を自動補完する
        let currentSideSnapshot = isTop ? workingTop : workingBottom;
        const detFirst = reconcileSheetExcessOutsDeterministically(
          currentSideSnapshot,
          structure
        );
        if (detFirst.changed) {
          currentSideSnapshot = detFirst.atBats;
          if (isTop) {
            workingTop = currentSideSnapshot;
            setTopAtBats([...workingTop]);
          } else {
            workingBottom = currentSideSnapshot;
            setBottomAtBats([...workingBottom]);
          }
        }

        const postScanGaps = detectMissingOrderGaps(
          currentSideSnapshot,
          structure
        );
        const postScanExcess = detectExcessOutInnings(
          currentSideSnapshot,
          structure
        );

        if (postScanGaps.length > 0 || postScanExcess.length > 0) {
          const repairStart = Date.now();
          activeSideLabels[sideKey] = `打順・アウト整合補正（${halfSuffix}）`;
          setDeepActiveStartedAtMs(repairStart);
          syncActiveLabelsUi();

          let updatedSide = currentSideSnapshot;
          let didVisualRepair = false;

          if (postScanGaps.length > 0) {
            const gapRepaired = await reconcileMissingOrderGapsForSide(
              isTop,
              structure,
              imgState,
              updatedSide
            );
            if (gapRepaired.repairedCount > 0) {
              updatedSide = gapRepaired.atBats;
              didVisualRepair = true;
            }
          }

          const outRepaired = await reconcileExcessOutInningsForSide(
            isTop,
            structure,
            imgState,
            updatedSide
          );
          if (outRepaired.repairedCount > 0) {
            updatedSide = outRepaired.atBats;
            didVisualRepair = true;
          }

          if (didVisualRepair) {
            if (isTop) {
              workingTop = updatedSide;
              setTopAtBats([...workingTop]);
            } else {
              workingBottom = updatedSide;
              setBottomAtBats([...workingBottom]);
            }
            upsertTimingEntry({
              key: `${sideKey}-order-reconcile`,
              isTop,
              innings: [],
              label: `整合補正${halfSuffix}`,
              durationMs: Date.now() - repairStart,
              status: "success",
            });
          }

          activeSideLabels[sideKey] = null;
          syncActiveLabelsUi();
        }
      };

      // 先攻（表）と後攻（裏）を2ストリーム並列実行することで、各サイド内の打順引き継ぎ精度を保ったまま所要時間を約半分に短縮する
      const tasks: Promise<void>[] = [];
      if (needTop && topStructure) {
        tasks.push(analyzeSheetByChunks(true, topStructure, topImage, 0));
      }
      if (needBottom && bottomStructure) {
        tasks.push(
          analyzeSheetByChunks(
            false,
            bottomStructure,
            bottomImage,
            needTop && topStructure ? 350 : 0
          )
        );
      }

      await Promise.all(tasks);

      const finalEntries = sortTimingEntries(Array.from(recordedMap.values()));
      const elapsedRunMs = Date.now() - deepStart;
      const cumulativeDeepMs = onlyMissing
        ? finalEntries.reduce((sum, item) => sum + item.durationMs, 0)
        : elapsedRunMs;

      setDeepCompletedTimings(finalEntries);
      setDeepTotalDurationMs(cumulativeDeepMs);
      setTimingSummary({
        structureTotalMs: structureTotalMs ?? undefined,
        structureEntries:
          structureCompletedTimings.length > 0
            ? structureCompletedTimings
            : undefined,
        deepTotalMs: cumulativeDeepMs,
        inningEntries: finalEntries,
      });

      const failedEntries = finalEntries.filter((e) => e.status === "error");
      if (failedEntries.length === 0) {
        setErrorBanner(null);
        setStep(3);
      } else {
        const succeededCount = finalEntries.length - failedEntries.length;
        const savedAtBatsTotal = workingTop.length + workingBottom.length;
        const failedLabels = failedEntries.map((e) => e.label).join("・");
        const firstReason = failedEntries[0]?.errorDetail
          ? `（原因: ${failedEntries[0].errorDetail}）`
          : "";
        setErrorBanner(
          `${failedLabels} の解析で一時エラーが発生しましたが、完了済みの ${succeededCount} イニング（計 ${savedAtBatsTotal} 打席）はすべて保持されています。下の「未完了の回だけ再解析」または各イニングのバッジから数秒で再取得できます。${firstReason}`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorBanner(msg);
    } finally {
      setIsAnalyzingInnings(false);
      setAnalysisProgressLabel("");
      setDeepStartedAtMs(null);
      setDeepActiveLabel(null);
      setDeepActiveLabels([]);
      setDeepActiveStartedAtMs(null);
    }
  };

  // 5-B. Step 2 / Step 3 共通：ピンポイント1イニング単独AI再解析
  const handleReanalyzeSingleInning = async (
    isTop: boolean,
    inning: number
  ) => {
    if (!selectedMatchId || reanalyzingInningKey) return;
    const structure = isTop ? topStructure : bottomStructure;
    const imgState = isTop ? topImage : bottomImage;
    if (!structure || !imgState.processed) return;

    const taskKey = `${isTop ? "top" : "bottom"}-${inning}`;
    setReanalyzingInningKey(taskKey);
    setErrorBanner(null);
    const startMs = Date.now();

    try {
      const currentSideList = isTop ? topAtBats : bottomAtBats;
      const lineupCycle = Math.max(9, structure.batters.length);
      let expectedLeadOff = 1;
      if (inning > 1) {
        const prevInningItems = currentSideList.filter(
          (a) => a.inning < inning
        );
        expectedLeadOff = computeNextLeadOffFromAtBats(
          prevInningItems,
          lineupCycle,
          1
        );
      }
      const nextInningItems = currentSideList.filter(
        (a) => a.inning === inning + 1
      );
      const nextInningLeadOffOrder =
        nextInningItems.length > 0
          ? nextInningItems[0].battingOrder
          : undefined;

      const targetBoxes: NormalizedBox[] = [inning]
        .map(
          (innNum) =>
            structure.innings.find((m) => m.inning === innNum)?.columnBox
        )
        .filter((b): b is NormalizedBox => Array.isArray(b));

      const knownMinXs = structure.innings
        .map((m) => m.columnBox?.[1])
        .filter((v): v is number => typeof v === "number" && v > 0);
      const firstInningMinX =
        knownMinXs.length > 0 ? Math.min(...knownMinXs) : undefined;

      const focusCrop = await extractInningChunkCompositeCrop(
        imgState.processed.dataUrl,
        targetBoxes,
        {
          structure,
          lineupRightX: structure.lineupRightX,
          firstInningMinX,
          batters: structure.batters,
          targetInnings: [inning],
          alreadyEnhanced: imgState.enhancePencil,
        }
      );

      const fallbackApiImg = !focusCrop
        ? await buildCalibratedRulerSheetImage(imgState.processed, 1600, 0.86)
        : null;

      const sideLabel = isTop ? "先攻（表）" : "後攻（裏）";
      const res = await fetch("/api/liff/scorebook/analyze-inning-chunk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: resolvedTeamId || currentTeam?.id || "",
          matchId: selectedMatchId,
          isTop,
          imageBase64: fallbackApiImg?.base64,
          mimeType: fallbackApiImg?.mimeType,
          focusCropBase64: focusCrop?.base64,
          focusCropMimeType: focusCrop?.mimeType,
          structure,
          targetInnings: [inning],
          expectedLeadOffOrder: expectedLeadOff,
          nextInningLeadOffOrder,
          legendBase64: legendOverride?.base64,
          legendMimeType: legendOverride?.mimeType,
          skipModels: getActiveSkippedModels(),
        }),
      });

      const data = await parseSafeJson<{
        success: boolean;
        atBats?: ScorebookV2AtBat[];
        cooledModels?: string[];
        error?: string;
      }>(res, `${sideLabel} ${inning}回 再解析エラー`);

      recordCooledModels(data.cooledModels);

      if (!data.success || !data.atBats) {
        throw new Error(
          data.error || `${sideLabel} ${inning}回の再解析に失敗しました`
        );
      }

      const freshInningAtBats = data.atBats;
      const before = currentSideList.filter((a) => a.inning < inning);
      const after = currentSideList.filter((a) => a.inning > inning);
      let finalMergedList = reconcileSheetExcessOutsDeterministically(
        [...before, ...freshInningAtBats, ...after],
        structure
      ).atBats;

      // 単独再解析後も当該イニング前後に打順の抜け・飛びや3アウト超過が残っていればそのまま自動照合・補完する
      const remainingGaps = detectMissingOrderGaps(
        finalMergedList,
        structure
      ).filter(
        (g) =>
          g.targetInning === inning ||
          g.prevInning === inning ||
          g.nextInning === inning
      );
      if (remainingGaps.length > 0) {
        const repaired = await reconcileMissingOrderGapsForSide(
          isTop,
          structure,
          imgState,
          finalMergedList
        );
        if (repaired.repairedCount > 0) {
          finalMergedList = repaired.atBats;
        }
      }

      const outRepaired = await reconcileExcessOutInningsForSide(
        isTop,
        structure,
        imgState,
        finalMergedList,
        { targetInningOnly: inning }
      );
      if (outRepaired.repairedCount > 0) {
        finalMergedList = outRepaired.atBats;
      }

      const elapsed = Date.now() - startMs;

      if (isTop) {
        setTopAtBats(finalMergedList);
      } else {
        setBottomAtBats(finalMergedList);
      }

      const entryKey = `${isTop ? "top" : "bottom"}-${inning}`;
      const updatedEntry: ScorebookTimingEntry = {
        key: entryKey,
        isTop,
        innings: [inning],
        label: `${inning}回${isTop ? "表" : "裏"}`,
        durationMs: elapsed,
        fromCache: false,
        status: "success",
      };

      setDeepCompletedTimings((prev) => {
        const exists = prev.some((e) => e.key === entryKey);
        const next = sortTimingEntries(
          exists
            ? prev.map((e) => (e.key === entryKey ? updatedEntry : e))
            : [...prev, updatedEntry]
        );
        const nextTotal = next.reduce((sum, item) => sum + item.durationMs, 0);
        setDeepTotalDurationMs(nextTotal);
        setTimingSummary((prevSum) => ({
          structureTotalMs:
            prevSum?.structureTotalMs ?? structureTotalMs ?? undefined,
          structureEntries:
            prevSum?.structureEntries ??
            (structureCompletedTimings.length > 0
              ? structureCompletedTimings
              : undefined),
          deepTotalMs: nextTotal,
          inningEntries: next,
        }));
        return next;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorBanner(msg);
    } finally {
      setReanalyzingInningKey(null);
    }
  };

  const handleRetryTimingEntry = async (entry: ScorebookTimingEntry) => {
    if (entry.innings.length === 0) return;
    for (const inn of entry.innings) {
      await handleReanalyzeSingleInning(entry.isTop, inn);
    }
  };

  // 5-C. Step 3 ワンタップ「打順抜け・3アウト超過 AI自動補正」（既に読込済みの下書きデータでも全回再解析なしで数秒でピンポイント復元）
  const handleManualRepairOrderGaps = async () => {
    if (!selectedMatchId || isRepairingOrderGaps || reanalyzingInningKey) {
      return;
    }
    setIsRepairingOrderGaps(true);
    setErrorBanner(null);

    try {
      const checkTop =
        (importScope === "both" || importScope === "top_only") &&
        Boolean(topStructure);
      const checkBottom =
        (importScope === "both" || importScope === "bottom_only") &&
        Boolean(bottomStructure);

      if (checkTop && topStructure) {
        const detTop = reconcileSheetExcessOutsDeterministically(
          topAtBats,
          topStructure
        );
        let nextTop = detTop.atBats;
        let topModified = detTop.changed;

        if (topImage.processed) {
          const topGaps = detectMissingOrderGaps(nextTop, topStructure);
          if (topGaps.length > 0) {
            const topGapRes = await reconcileMissingOrderGapsForSide(
              true,
              topStructure,
              topImage,
              nextTop,
              { throwOnFailure: true }
            );
            if (topGapRes.repairedCount > 0) {
              nextTop = topGapRes.atBats;
              topModified = true;
            }
          }

          const topExcess = detectExcessOutInnings(nextTop, topStructure);
          if (topExcess.length > 0) {
            const topOutRes = await reconcileExcessOutInningsForSide(
              true,
              topStructure,
              topImage,
              nextTop,
              { throwOnFailure: true }
            );
            if (topOutRes.repairedCount > 0) {
              nextTop = topOutRes.atBats;
              topModified = true;
            }
          }
        }

        if (topModified) {
          setTopAtBats(nextTop);
        }
      }

      if (checkBottom && bottomStructure) {
        const detBot = reconcileSheetExcessOutsDeterministically(
          bottomAtBats,
          bottomStructure
        );
        let nextBot = detBot.atBats;
        let botModified = detBot.changed;

        if (bottomImage.processed) {
          const botGaps = detectMissingOrderGaps(nextBot, bottomStructure);
          if (botGaps.length > 0) {
            const botGapRes = await reconcileMissingOrderGapsForSide(
              false,
              bottomStructure,
              bottomImage,
              nextBot,
              { throwOnFailure: true }
            );
            if (botGapRes.repairedCount > 0) {
              nextBot = botGapRes.atBats;
              botModified = true;
            }
          }

          const botExcess = detectExcessOutInnings(nextBot, bottomStructure);
          if (botExcess.length > 0) {
            const botOutRes = await reconcileExcessOutInningsForSide(
              false,
              bottomStructure,
              bottomImage,
              nextBot,
              { throwOnFailure: true }
            );
            if (botOutRes.repairedCount > 0) {
              nextBot = botOutRes.atBats;
              botModified = true;
            }
          }
        }

        if (botModified) {
          setBottomAtBats(nextBot);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorBanner(msg);
    } finally {
      setIsRepairingOrderGaps(false);
    }
  };

  // 6. 最終D1保存処理
  const handleSaveToDatabase = async () => {
    if (!selectedMatchId) return;
    setIsSaving(true);
    setErrorBanner(null);

    try {
      const res = await fetch("/api/liff/scorebook/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: resolvedTeamId || currentTeam?.id || "",
          matchId: selectedMatchId,
          importScope,
          topStructure,
          bottomStructure,
          topAtBats,
          bottomAtBats,
        }),
      });

      const data = (await res.json()) as {
        success: boolean;
        summary?: SaveSummaryData;
        error?: string;
      };

      if (!data.success || !data.summary) {
        throw new Error(data.error || "保存に失敗しました");
      }

      const teamKey = resolvedTeamId || currentTeam?.id || "default";
      await clearScorebookDraft(teamKey);
      setLastAutoSavedAt(null);
      setRestoredDraftBannerAt(null);

      setSaveSummary(data.summary);
      setStep(4);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorBanner(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const selectedMatch = matches.find((m) => m.id === selectedMatchId) || null;
  const needTopSide = importScope === "both" || importScope === "top_only";
  const needBottomSide =
    importScope === "both" || importScope === "bottom_only";
  const preservedAtBatsCount =
    (needTopSide ? topAtBats.length : 0) +
    (needBottomSide ? bottomAtBats.length : 0);

  const countMissingForSide = (
    isTop: boolean,
    structure: ScorebookSheetStructure | null,
    sideAtBats: ScorebookV2AtBat[]
  ): number => {
    if (!structure) return 0;
    let missing = 0;
    for (const meta of structure.innings) {
      const hasAtBat = sideAtBats.some((a) => a.inning === meta.inning);
      if (hasAtBat) continue;
      const succeededSkipped =
        isSkippableFinalBottomInning(isTop, meta.inning, structure) &&
        deepCompletedTimings.some(
          (e) =>
            e.isTop === isTop &&
            e.innings.includes(meta.inning) &&
            e.status !== "error"
        );
      if (!succeededSkipped) {
        missing += 1;
      }
    }
    return missing;
  };

  const missingInningsCount =
    (needTopSide ? countMissingForSide(true, topStructure, topAtBats) : 0) +
    (needBottomSide
      ? countMissingForSide(false, bottomStructure, bottomAtBats)
      : 0);

  return (
    <div className="flex flex-col flex-1">
      <LiffHeader />

      <div className="p-4 space-y-4">
        <LiffPageHeader
          title="スコアブック取り込み"
          subtitle="SCOREBOOK AI IMPORT v2"
          icon={
            <span className="w-8 h-8 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black">
              <ScanLine className="w-4 h-4" />
            </span>
          }
          showBack
          rightElement={
            <Link
              href="/liff/settings/score"
              className="px-2.5 py-1.5 rounded-2xl bg-card border border-border hover:bg-muted text-foreground text-[11px] font-black flex items-center gap-1 shadow-xs active:scale-95 transition-all"
            >
              <Settings className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>スコア設定</span>
            </Link>
          }
        />

        {/* ツール切替バー（Step 1時のみ表示し、作業中は画面集中） */}
        {step === 1 && <LiffToolSubNav />}

        {/* ステップインジケーター */}
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { num: 1 as const, label: "1. 撮影・前処理" },
              { num: 2 as const, label: "2. 骨格確認" },
              { num: 3 as const, label: "3. 1球検算・保存" },
            ].map((s) => {
              const active = step === s.num || (step === 4 && s.num === 3);
              const done = step > s.num;
              return (
                <div
                  key={s.num}
                  className={`py-2 px-2 rounded-xl text-center text-[11px] font-black border transition-all ${
                    active
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                      : done
                      ? "bg-indigo-500/12 text-indigo-600 dark:text-indigo-300 border-indigo-500/30"
                      : "bg-card text-muted-foreground border-border"
                  }`}
                >
                  {s.label}
                </div>
              );
            })}
          </div>

          {/* 自動下書き保存ステータスバー */}
          {step !== 4 && lastAutoSavedAt && (
            <div className="px-3 py-1.5 rounded-xl bg-card border border-border flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Save className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="text-[10px] font-bold text-muted-foreground truncate">
                  自動下書き保存済み（{formatSavedTime(lastAutoSavedAt)}）
                </span>
              </div>
              <button
                type="button"
                onClick={() => void handleDiscardDraft()}
                className="px-2 py-0.5 rounded-lg bg-muted hover:bg-destructive/10 text-[10px] font-black text-muted-foreground hover:text-destructive flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                <span>下書き破棄</span>
              </button>
            </div>
          )}
        </div>

        {/* 前回の途中データがある場合のオンデマンド復元バナー（初期表示時はメモリに読み込まず軽快に起動） */}
        {step === 1 && availableDraftMeta && !lastAutoSavedAt && (
          <div className="p-3.5 rounded-2xl bg-card border-2 border-indigo-500/45 shadow-xs space-y-2.5">
            <div className="flex items-start gap-2">
              <RotateCcw className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5 min-w-0">
                <p className="text-xs font-black text-foreground">
                  前回入力途中の下書き（{formatSavedTime(availableDraftMeta.savedAt)} 保存 / STEP {availableDraftMeta.step}）があります
                </p>
                <p className="text-[10px] font-bold text-muted-foreground">
                  新しく撮影を始める場合はこのまま下へ進めます。前回の続きを開く場合は「続きから復元」を押してください。
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isRestoringDraft}
                onClick={() => void handleRestoreSavedDraft()}
                className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
              >
                {isRestoringDraft ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>復元中...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>続きから復元</span>
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={isRestoringDraft}
                onClick={() => void handleDiscardDraft()}
                className="py-2 px-3 rounded-xl bg-muted hover:bg-destructive/10 border border-border text-xs font-black text-muted-foreground hover:text-destructive flex items-center gap-1 cursor-pointer active:scale-95 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>破棄</span>
              </button>
            </div>
          </div>
        )}

        {/* 前回の途中入力を復元した際の通知バナー */}
        {step !== 4 && restoredDraftBannerAt && (
          <div className="p-3 rounded-2xl bg-card border border-emerald-500/45 shadow-2xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <p className="text-[11px] font-black text-foreground leading-snug">
                前回入力途中の下書き（{formatSavedTime(restoredDraftBannerAt)} 保存）を自動復元しました
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRestoredDraftBannerAt(null)}
              className="p-1 rounded-full bg-muted text-muted-foreground shrink-0 cursor-pointer"
              aria-label="通知を閉じる"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 初期コンテキスト読込中またはStep 4表示時のみのフォールバックエラーバナー（Step 1〜3は操作ボタン直上の進捗エリアに表示） */}
        {(isLoadingContext || step === 4) && errorBanner && (
          <div className="p-3.5 rounded-2xl bg-card border-2 border-destructive/60 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs font-bold text-destructive leading-relaxed">
              {errorBanner}
            </p>
          </div>
        )}

        {isLoadingContext ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
            <p className="text-xs font-bold text-muted-foreground">
              チーム選手名鑑・試合情報を読み込み中...
            </p>
          </div>
        ) : (
          <>
            {step === 1 && (
              <Step1MatchAndImages
                matches={matches}
                selectedMatchId={selectedMatchId}
                onSelectMatchId={setSelectedMatchId}
                onCreateMatch={handleCreateMatch}
                isCreatingMatch={isCreatingMatch}
                importScope={importScope}
                onChangeImportScope={setImportScope}
                topImage={topImage}
                bottomImage={bottomImage}
                onSelectSheetFile={handleSelectSheetFile}
                onRotateSheet={handleRotateSheet}
                onToggleEnhance={handleToggleEnhance}
                onUpdateCrop={handleUpdateCrop}
                onUpdateFineTilt={handleUpdateFineTilt}
                onUpdatePerspectiveCorners={handleUpdatePerspectiveCorners}
                teamLegendUrl={teamLegendUrl}
                legendOverrideDataUrl={legendOverride?.dataUrl || null}
                isLegendProcessing={isLegendProcessing}
                onSelectLegendOverride={handleSelectLegendOverride}
                onNavigateScoreSettings={() => {
                  didVisitScoreSettingsRef.current = true;
                }}
                onStartAnalyzeStructure={handleStartAnalyzeStructure}
                isAnalyzingStructure={isAnalyzingStructure}
                structureProgressLabel={structureProgressLabel}
                structureStartedAtMs={structureStartedAtMs}
                structureActiveLabel={structureActiveLabel}
                structureActiveStartedAtMs={structureActiveStartedAtMs}
                structureCompletedTimings={structureCompletedTimings}
                errorMessage={errorBanner}
                onDismissError={() => setErrorBanner(null)}
                onReportError={(msg) => setErrorBanner(msg)}
              />
            )}

            {step === 2 && (
              <Step2StructureCheck
                importScope={importScope}
                roster={roster}
                opponentName={selectedMatch?.opponent || "対戦相手"}
                topImageDataUrl={topImage.processed?.dataUrl || null}
                bottomImageDataUrl={bottomImage.processed?.dataUrl || null}
                topStructure={topStructure}
                bottomStructure={bottomStructure}
                onChangeStructure={(isTop, updated) =>
                  isTop ? setTopStructure(updated) : setBottomStructure(updated)
                }
                onRescanSide={handleRescanSingleSide}
                isRescanningSide={isAnalyzingStructure}
                structureProgressLabel={structureProgressLabel}
                structureTotalMs={structureTotalMs}
                structureTimingEntries={structureCompletedTimings}
                onBack={() => {
                  setErrorBanner(null);
                  setStep(1);
                }}
                onStartDeepAnalysis={() =>
                  void handleStartDeepAnalysis({ onlyMissing: false })
                }
                isAnalyzingInnings={isAnalyzingInnings}
                analysisProgressLabel={analysisProgressLabel}
                analysisStartedAtMs={
                  isAnalyzingStructure ? structureStartedAtMs : deepStartedAtMs
                }
                analysisTotalDurationMs={
                  isAnalyzingStructure ? structureTotalMs : deepTotalDurationMs
                }
                analysisActiveLabel={
                  isAnalyzingStructure ? structureActiveLabel : deepActiveLabel
                }
                analysisActiveLabels={
                  isAnalyzingStructure ? undefined : deepActiveLabels
                }
                analysisActiveStartedAtMs={
                  isAnalyzingStructure
                    ? structureActiveStartedAtMs
                    : deepActiveStartedAtMs
                }
                analysisCompletedTimings={
                  isAnalyzingStructure
                    ? structureCompletedTimings
                    : deepCompletedTimings
                }
                onRetryTimingEntry={(entry) =>
                  void handleRetryTimingEntry(entry)
                }
                reanalyzingInningKey={reanalyzingInningKey}
                preservedAtBatsCount={preservedAtBatsCount}
                missingInningsCount={missingInningsCount}
                onResumeMissingInnings={() =>
                  void handleStartDeepAnalysis({ onlyMissing: true })
                }
                onProceedWithCompleted={() => {
                  setErrorBanner(null);
                  setStep(3);
                }}
                errorMessage={errorBanner}
                onDismissError={() => setErrorBanner(null)}
              />
            )}

            {step === 3 && (
              <Step3PinpointReview
                importScope={importScope}
                opponentName={selectedMatch?.opponent || "対戦相手"}
                topImageDataUrl={topImage.processed?.dataUrl || null}
                bottomImageDataUrl={bottomImage.processed?.dataUrl || null}
                topStructure={topStructure}
                bottomStructure={bottomStructure}
                topAtBats={topAtBats}
                bottomAtBats={bottomAtBats}
                onChangeAtBats={(isTop, updated) =>
                  isTop ? setTopAtBats(updated) : setBottomAtBats(updated)
                }
                onBack={() => {
                  setErrorBanner(null);
                  setStep(2);
                }}
                onSave={handleSaveToDatabase}
                isSaving={isSaving}
                onReanalyzeInning={handleReanalyzeSingleInning}
                reanalyzingInningKey={reanalyzingInningKey}
                onRepairOrderGaps={() => void handleManualRepairOrderGaps()}
                isRepairingOrderGaps={isRepairingOrderGaps}
                timingSummary={timingSummary}
                errorMessage={errorBanner}
                onDismissError={() => setErrorBanner(null)}
              />
            )}

            {step === 4 && saveSummary && (
              <section className="rounded-3xl bg-card border border-emerald-500/40 shadow-sm p-6 text-center space-y-5">
                <div className="w-14 h-14 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>

                <div className="space-y-1">
                  <h2 className="text-base font-black text-foreground">
                    スコアブックの取り込みが完了しました！
                  </h2>
                  <p className="text-xs font-bold text-muted-foreground">
                    試合結果・プレイログ・個人打撃/投手成績へ反映されました
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="p-3 rounded-2xl bg-muted/45 border border-border">
                    <span className="text-[10px] font-bold text-muted-foreground block">
                      確定スコア
                    </span>
                    <span className="text-base font-black text-foreground">
                      {saveSummary.myScore} - {saveSummary.opponentScore}
                    </span>
                  </div>
                  <div className="p-3 rounded-2xl bg-muted/45 border border-border">
                    <span className="text-[10px] font-bold text-muted-foreground block">
                      記録打席数
                    </span>
                    <span className="text-base font-black text-foreground">
                      {saveSummary.savedAtBatsCount}打席
                    </span>
                  </div>
                  <div className="p-3 rounded-2xl bg-muted/45 border border-border">
                    <span className="text-[10px] font-bold text-muted-foreground block">
                      記録投球数
                    </span>
                    <span className="text-base font-black text-foreground">
                      {saveSummary.savedPitchesCount}球
                    </span>
                  </div>
                </div>

                {timingSummary && (
                  <div className="px-3 py-2 rounded-2xl bg-muted border border-border flex items-center justify-center gap-1.5 text-[11px] font-black text-foreground tabular-nums">
                    <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <span>
                      AI解析タイム: 合計{" "}
                      {formatTotalElapsedSeconds(
                        (timingSummary.structureTotalMs ?? 0) +
                          timingSummary.deepTotalMs
                      )}
                      （イニング解析{" "}
                      {formatElapsedSeconds(timingSummary.deepTotalMs)}）
                    </span>
                  </div>
                )}

                <div className="space-y-2.5 pt-1">
                  <Link
                    href={`/liff/matches?matchId=${encodeURIComponent(
                      saveSummary.matchId
                    )}`}
                    className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-black text-xs flex items-center justify-center gap-2 shadow-xs"
                  >
                    <Video className="w-4 h-4" />
                    <span>取り込んだ試合の詳細を見る</span>
                  </Link>

                  <Link
                    href="/liff/stats"
                    className="w-full h-11 rounded-2xl bg-muted hover:bg-muted/80 border border-border text-foreground font-black text-xs flex items-center justify-center gap-2"
                  >
                    <Trophy className="w-4 h-4 text-amber-500" />
                    <span>チーム成績・個人成績を確認する</span>
                  </Link>

                  <button
                    type="button"
                    onClick={() => {
                      void handleDiscardDraft();
                      fetchContext();
                    }}
                    className="w-full h-11 rounded-2xl bg-card border border-border text-muted-foreground font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>続けて別のシートを取り込む</span>
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
