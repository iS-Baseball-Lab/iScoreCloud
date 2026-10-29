// filepath: src/app/liff/tools/scorebook-import/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { useLiff } from "@/components/liff/LiffProvider";
import { LiffToolSubNav } from "@/components/liff/LiffToolSubNav";
import {
  buildCalibratedRulerSheetImage,
  extractInningChunkCompositeCrop,
  extractStructureFocusCrops,
  preprocessScorebookImage,
  type PreprocessedScorebookImage,
} from "@/lib/liff/scorebook-image";
import {
  clearScorebookDraft,
  loadScorebookDraft,
  reconstructFileFromDataUrlAsync,
  saveScorebookDraft,
} from "@/lib/liff/scorebook-draft";
import { loadLiffScoreSettings } from "@/lib/liff/score-settings";
import {
  Step1MatchAndImages,
  type SheetImageState,
} from "./_components/Step1MatchAndImages";
import { Step2StructureCheck } from "./_components/Step2StructureCheck";
import { Step3PinpointReview } from "./_components/Step3PinpointReview";
import type {
  ImportScopeMode,
  NormalizedBox,
  ScorebookGridCorners,
  ScorebookMatchSummary,
  ScorebookPitcherStint,
  ScorebookRosterPlayer,
  ScorebookSheetStructure,
  ScorebookV2AtBat,
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
  const [isAnalyzingInnings, setIsAnalyzingInnings] = useState(false);
  const [analysisProgressLabel, setAnalysisProgressLabel] = useState("");
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
  const [isDraftReady, setIsDraftReady] = useState(false);
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

  // 1. チーム選手名鑑・試合一覧の読み込み ＋ 保存済み下書きの自動復元
  const fetchContext = useCallback(async () => {
    try {
      setIsLoadingContext(true);
      setErrorBanner(null);
      const qTeam = currentTeam?.id || "";
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

      if (hasRestoredTeamRef.current !== effectiveTeamId) {
        hasRestoredTeamRef.current = effectiveTeamId;
        const draft = await loadScorebookDraft(effectiveTeamId);
        const hasDraftContent =
          draft !== null &&
          (draft.step >= 2 ||
            Boolean(draft.topImage.processed) ||
            Boolean(draft.bottomImage.processed) ||
            Boolean(draft.topStructure) ||
            Boolean(draft.bottomStructure) ||
            draft.topAtBats.length > 0 ||
            draft.bottomAtBats.length > 0);

        if (hasDraftContent && draft) {
          setImportScope(draft.importScope);
          const matchExists = fetchedMatches.some(
            (m) => m.id === draft.selectedMatchId
          );
          if (matchExists) {
            setSelectedMatchId(draft.selectedMatchId);
          } else if (fetchedMatches.length > 0) {
            setSelectedMatchId(fetchedMatches[0].id);
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
          setTopAtBats(draft.topAtBats);
          setBottomAtBats(draft.bottomAtBats);

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

          setLastAutoSavedAt(draft.savedAt);
          setRestoredDraftBannerAt(draft.savedAt);
        } else {
          const prefs = loadLiffScoreSettings();
          setImportScope(prefs.defaultImportScope);
          setTopImage(createInitialSheetImageState(prefs.defaultEnhancePencil));
          setBottomImage(
            createInitialSheetImageState(prefs.defaultEnhancePencil)
          );
          if (fetchedMatches.length > 0) {
            setSelectedMatchId((prev) => prev || fetchedMatches[0].id);
          }
        }
        setIsDraftReady(true);
      } else if (fetchedMatches.length > 0) {
        setSelectedMatchId((prev) => prev || fetchedMatches[0].id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorBanner(msg);
      setIsDraftReady(true);
    } finally {
      setIsLoadingContext(false);
    }
  }, [currentTeam?.id]);

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
    setSaveSummary(null);
    setErrorBanner(null);
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

  const parseSafeJson = async <T,>(
    res: Response,
    fallbackMsg: string
  ): Promise<T> => {
    const rawText = await res.text();
    try {
      return JSON.parse(rawText) as T;
    } catch {
      throw new Error(
        `${fallbackMsg} (HTTP ${res.status}${
          rawText ? `: ${rawText.slice(0, 120)}` : ""
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

    try {
      completedChunkCacheRef.current.clear();
      const needTop = importScope === "both" || importScope === "top_only";
      const needBottom =
        importScope === "both" || importScope === "bottom_only";
      const totalSides = (needTop ? 1 : 0) + (needBottom ? 1 : 0);

      let stepCounter = 0;
      let resTop: ScorebookSheetStructure | null = null;
      let resBottom: ScorebookSheetStructure | null = null;

      if (needTop) {
        stepCounter += 1;
        resTop = await scanSingleSheetStructure(
          true,
          topImage,
          `(${stepCounter}/${totalSides})`
        );
        setTopStructure(resTop);
      }

      if (needBottom) {
        if (needTop) {
          // 2枚連続スキャン時の分間リクエスト上限(RPM)スパイクを緩和
          await new Promise((r) => setTimeout(r, 1000));
        }
        stepCounter += 1;
        resBottom = await scanSingleSheetStructure(
          false,
          bottomImage,
          `(${stepCounter}/${totalSides})`
        );
        setBottomStructure(resBottom);
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
      setStep(2);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorBanner(msg);
    } finally {
      setIsAnalyzingStructure(false);
      setStructureProgressLabel("");
    }
  };

  const handleRescanSingleSide = async (isTop: boolean) => {
    if (!selectedMatchId) return;
    const imgState = isTop ? topImage : bottomImage;
    if (!imgState.processed) return;

    setIsAnalyzingStructure(true);
    setErrorBanner(null);
    try {
      completedChunkCacheRef.current.clear();
      let rescanned = await scanSingleSheetStructure(isTop, imgState, "(1/1)");
      if (isTop) {
        rescanned = crossFillOppositePitchers(rescanned, bottomStructure);
        setTopStructure(rescanned);
      } else {
        rescanned = crossFillOppositePitchers(rescanned, topStructure);
        setBottomStructure(rescanned);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorBanner(msg);
    } finally {
      setIsAnalyzingStructure(false);
      setStructureProgressLabel("");
    }
  };

  // 5. Stage 2: イニング分割ディープ解析（高精細2200px＋打順×対象イニング水平整列ズーム併用＋完了キャッシュ）
  const handleStartDeepAnalysis = async () => {
    if (!selectedMatchId) return;
    setIsAnalyzingInnings(true);
    setErrorBanner(null);

    try {
      const buildSmartInningChunks = (
        structure: ScorebookSheetStructure
      ): number[][] => {
        const sortedMeta = [...structure.innings].sort(
          (a, b) => a.inning - b.inning
        );
        // 草野球・学童野球の標準的な7回制以下の試合は、隣接イニングの列混入を完全にゼロにするため
        // 全イニングを「1イニングずつ単独の1列独立マトリクス」として超高精細解析する
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
        sourceDataUrl: string,
        alreadyEnhanced: boolean,
        apiImg: { base64: string; mimeType: string },
        structureFp: string,
        targetInnings: number[],
        expectedLeadOff: number
      ): Promise<{
        atBats: ScorebookV2AtBat[];
        nextLeadOffOrder?: number;
        fromCache?: boolean;
      }> => {
        const cacheKey = `v3:${selectedMatchId}:${
          isTop ? "top" : "bottom"
        }:${apiImg.base64.length}:${structureFp}:${expectedLeadOff}:${targetInnings.join(
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

        const sideLabel = isTop ? "先攻（表）" : "後攻（裏）";
        const res = await fetch("/api/liff/scorebook/analyze-inning-chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId: resolvedTeamId || currentTeam?.id || "",
            matchId: selectedMatchId,
            isTop,
            imageBase64: apiImg.base64,
            mimeType: apiImg.mimeType,
            focusCropBase64: focusCrop?.base64,
            focusCropMimeType: focusCrop?.mimeType,
            structure,
            targetInnings,
            expectedLeadOffOrder: expectedLeadOff,
            legendBase64: legendOverride?.base64,
            legendMimeType: legendOverride?.mimeType,
          }),
        });

        const data = await parseSafeJson<{
          success: boolean;
          atBats?: ScorebookV2AtBat[];
          nextLeadOffOrder?: number;
          error?: string;
        }>(res, `${sideLabel}イニング解析通信エラー`);

        if (!data.success || !data.atBats) {
          throw new Error(
            data.error || `${sideLabel}のイニング解析に失敗しました`
          );
        }

        const result = {
          atBats: data.atBats,
          nextLeadOffOrder: data.nextLeadOffOrder,
        };
        completedChunkCacheRef.current.set(cacheKey, result);
        return result;
      };

      const requestSingleInningWithRetries = async (
        isTop: boolean,
        structure: ScorebookSheetStructure,
        sourceDataUrl: string,
        alreadyEnhanced: boolean,
        apiImg: { base64: string; mimeType: string },
        structureFp: string,
        singleInn: number,
        expectedLeadOff: number,
        progressSuffix: string
      ): Promise<{
        atBats: ScorebookV2AtBat[];
        nextLeadOffOrder?: number;
      }> => {
        const sideLabel = isTop ? "先攻（表）" : "後攻（裏）";
        const retryDelays = [2200, 4200];
        let lastErr: unknown = null;

        for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
          if (attempt > 0) {
            setAnalysisProgressLabel(
              `${sideLabel} ${singleInn}回 を混雑回避リトライ中 (${attempt}/${retryDelays.length})... ${progressSuffix}`
            );
            await new Promise((r) => setTimeout(r, retryDelays[attempt - 1]));
          }
          try {
            return await requestSingleChunk(
              isTop,
              structure,
              sourceDataUrl,
              alreadyEnhanced,
              apiImg,
              structureFp,
              [singleInn],
              expectedLeadOff
            );
          } catch (err) {
            lastErr = err;
          }
        }
        throw lastErr instanceof Error
          ? lastErr
          : new Error(`${sideLabel} ${singleInn}回の解析に失敗しました`);
      };

      const analyzeSheetByChunks = async (
        isTop: boolean,
        structure: ScorebookSheetStructure,
        imgState: SheetImageState
      ): Promise<ScorebookV2AtBat[]> => {
        if (!imgState.processed) return [];
        const sideLabel = isTop ? "先攻（表）" : "後攻（裏）";
        const sourceDataUrl = imgState.processed.dataUrl;
        const alreadyEnhanced = imgState.enhancePencil;
        const apiImg = await buildCalibratedRulerSheetImage(
          imgState.processed,
          1850,
          0.89
        );
        const structureFp = buildStructureFingerprint(structure);
        const chunks = buildSmartInningChunks(structure);

        const collected: ScorebookV2AtBat[] = [];
        let expectedLeadOff = 1;

        for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
          const targetInnings = chunks[cIdx];
          const progressSuffix = `(${cIdx + 1}/${chunks.length})`;
          const rangeText =
            targetInnings.length === 1
              ? `${targetInnings[0]}回`
              : `${targetInnings[0]}〜${
                  targetInnings[targetInnings.length - 1]
                }回`;

          setAnalysisProgressLabel(
            `${sideLabel} ${rangeText} の1球順序・進塁を解析中... ${progressSuffix}`
          );

          try {
            const chunkRes = await requestSingleChunk(
              isTop,
              structure,
              sourceDataUrl,
              alreadyEnhanced,
              apiImg,
              structureFp,
              targetInnings,
              expectedLeadOff
            );
            collected.push(...chunkRes.atBats);
            if (chunkRes.nextLeadOffOrder) {
              expectedLeadOff = chunkRes.nextLeadOffOrder;
            }
            if (!chunkRes.fromCache && cIdx < chunks.length - 1) {
              await new Promise((r) => setTimeout(r, 350));
            }
          } catch (chunkErr) {
            // 2イニング同時チャンクが失敗した場合は小休止後に1イニングずつへ自動分割＆個別キャッシュ
            if (targetInnings.length > 1) {
              await new Promise((r) => setTimeout(r, 1800));
              for (const singleInn of targetInnings) {
                setAnalysisProgressLabel(
                  `${sideLabel} ${singleInn}回 を1回単位で精密解析中... ${progressSuffix}`
                );
                const singleRes = await requestSingleInningWithRetries(
                  isTop,
                  structure,
                  sourceDataUrl,
                  alreadyEnhanced,
                  apiImg,
                  structureFp,
                  singleInn,
                  expectedLeadOff,
                  progressSuffix
                );
                collected.push(...singleRes.atBats);
                if (singleRes.nextLeadOffOrder) {
                  expectedLeadOff = singleRes.nextLeadOffOrder;
                }
              }
            } else {
              const singleRes = await requestSingleInningWithRetries(
                isTop,
                structure,
                sourceDataUrl,
                alreadyEnhanced,
                apiImg,
                structureFp,
                targetInnings[0],
                expectedLeadOff,
                progressSuffix
              );
              collected.push(...singleRes.atBats);
              if (singleRes.nextLeadOffOrder) {
                expectedLeadOff = singleRes.nextLeadOffOrder;
              }
            }
            void chunkErr;
          }
        }

        return collected;
      };

      const needTop = importScope === "both" || importScope === "top_only";
      const needBottom =
        importScope === "both" || importScope === "bottom_only";

      const nextTopAtBats =
        needTop && topStructure
          ? await analyzeSheetByChunks(true, topStructure, topImage)
          : [];

      if (needTop && needBottom) {
        await new Promise((r) => setTimeout(r, 400));
      }

      const nextBottomAtBats =
        needBottom && bottomStructure
          ? await analyzeSheetByChunks(false, bottomStructure, bottomImage)
          : [];

      setTopAtBats(nextTopAtBats);
      setBottomAtBats(nextBottomAtBats);
      setStep(3);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorBanner(msg);
    } finally {
      setIsAnalyzingInnings(false);
      setAnalysisProgressLabel("");
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

        {/* 前回の途中入力を自動復元した際の通知バナー */}
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
                errorMessage={errorBanner}
                onDismissError={() => setErrorBanner(null)}
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
                onBack={() => {
                  setErrorBanner(null);
                  setStep(1);
                }}
                onStartDeepAnalysis={handleStartDeepAnalysis}
                isAnalyzingInnings={isAnalyzingInnings}
                analysisProgressLabel={analysisProgressLabel}
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
