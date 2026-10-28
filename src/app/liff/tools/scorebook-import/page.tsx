// filepath: src/app/liff/tools/scorebook-import/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { useLiff } from "@/components/liff/LiffProvider";
import { LiffToolSubNav } from "@/components/liff/LiffToolSubNav";
import {
  ensureCompactApiImage,
  extractInningChunkCompositeCrop,
  extractStructureFocusCrops,
  preprocessScorebookImage,
} from "@/lib/liff/scorebook-image";
import {
  clearScorebookDraft,
  loadScorebookDraft,
  reconstructFileFromDataUrl,
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
  enhancePencil,
  cropTop: 0,
  cropBottom: 0,
  cropLeft: 0,
  cropRight: 0,
  processed: null,
  isProcessing: false,
});

/**
 * 2枚セット読込時、片面の投手欄が未記載（「相手投手」または空欄）の場合に、
 * 反対側シートの打順にある投手（position === "1"）および投手交代から登板投手を自動補完する
 */
function crossFillOppositePitchers(
  target: ScorebookSheetStructure,
  opposite: ScorebookSheetStructure | null
): ScorebookSheetStructure {
  if (!opposite) return target;
  const hasRealPitcher = target.pitchers.some(
    (p) => p.name.trim() !== "" && p.name.trim() !== "相手投手"
  );
  if (hasRealPitcher) return target;

  const starterSlot = opposite.batters.find(
    (b) => b.position === "1" && b.name.trim() !== ""
  );
  if (!starterSlot) return target;

  const maxInn =
    target.innings[target.innings.length - 1]?.inning ||
    opposite.innings[opposite.innings.length - 1]?.inning ||
    7;

  const reliefSubs = opposite.batters
    .flatMap((b) => b.substitutions)
    .filter((s) => s.position === "1" && s.name.trim() !== "")
    .sort((a, b) => a.inningEntered - b.inningEntered);

  const builtPitchers: ScorebookPitcherStint[] = [];
  const starterTo =
    reliefSubs.length > 0
      ? Math.max(1, reliefSubs[0].inningEntered - 1)
      : maxInn;

  builtPitchers.push({
    id: crypto.randomUUID(),
    order: 1,
    name: starterSlot.name,
    uniformNumber: starterSlot.uniformNumber,
    playerId: starterSlot.playerId,
    fromInning: 1,
    toInning: starterTo,
  });

  reliefSubs.forEach((rel, idx) => {
    const nextRel = reliefSubs[idx + 1];
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
            const topFile = reconstructFileFromDataUrl(
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
            const bottomFile = reconstructFileFromDataUrl(
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

  // スコア設定画面から戻ってきた際、登録された早見表URLや初期設定を即時反映
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
      if (document.visibilityState === "visible") {
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

  // 2. Canvas前処理の実行ヘルパー
  const runPreprocess = async (isTop: boolean, nextState: SheetImageState) => {
    const setter = isTop ? setTopImage : setBottomImage;
    if (!nextState.file) {
      setter(
        createInitialSheetImageState(
          loadLiffScoreSettings().defaultEnhancePencil
        )
      );
      return;
    }

    setter({ ...nextState, isProcessing: true });
    try {
      const processed = await preprocessScorebookImage(nextState.file, {
        rotationDeg: nextState.rotationDeg,
        enhancePencil: nextState.enhancePencil,
        cropInsets: {
          top: nextState.cropTop,
          bottom: nextState.cropBottom,
          left: nextState.cropLeft,
          right: nextState.cropRight,
        },
        maxLongEdge: 2200,
      });
      setter({ ...nextState, processed, isProcessing: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorBanner(`画像の前処理に失敗しました: ${msg}`);
      setter({ ...nextState, isProcessing: false });
    }
  };

  const handleSelectSheetFile = (isTop: boolean, file: File | null) => {
    if (!file) {
      runPreprocess(
        isTop,
        createInitialSheetImageState(
          loadLiffScoreSettings().defaultEnhancePencil
        )
      );
      return;
    }
    const base = isTop ? topImage : bottomImage;
    runPreprocess(isTop, {
      ...base,
      file,
      rotationDeg: 0,
      cropTop: 0,
      cropBottom: 0,
      cropLeft: 0,
      cropRight: 0,
    });
  };

  const handleRotateSheet = (isTop: boolean) => {
    const cur = isTop ? topImage : bottomImage;
    if (!cur.file) return;
    const nextDeg = ((cur.rotationDeg + 90) % 360) as 0 | 90 | 180 | 270;
    runPreprocess(isTop, { ...cur, rotationDeg: nextDeg });
  };

  const handleToggleEnhance = (isTop: boolean) => {
    const cur = isTop ? topImage : bottomImage;
    if (!cur.file) return;
    runPreprocess(isTop, { ...cur, enhancePencil: !cur.enhancePencil });
  };

  const handleUpdateCrop = (
    isTop: boolean,
    edge: "cropTop" | "cropBottom" | "cropLeft" | "cropRight",
    val: number
  ) => {
    const cur = isTop ? topImage : bottomImage;
    if (!cur.file) return;
    runPreprocess(isTop, { ...cur, [edge]: val });
  };

  const handleSelectLegendOverride = async (file: File | null) => {
    if (!file) {
      setLegendOverride(null);
      return;
    }
    try {
      const processed = await preprocessScorebookImage(file, {
        rotationDeg: 0,
        enhancePencil: false,
        maxLongEdge: 1500,
      });
      setLegendOverride({
        dataUrl: processed.dataUrl,
        base64: processed.base64,
        mimeType: processed.mimeType,
      });
    } catch {
      setErrorBanner("早見表画像の読み込みに失敗しました");
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
      ensureCompactApiImage(imgState.processed, 1850, 0.88),
      extractStructureFocusCrops(imgState.processed.dataUrl),
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
        const chunks: number[][] = [];
        let buf: number[] = [];

        for (const meta of sortedMeta) {
          // 得点回(1点以上)・複数安打回(2本以上)・打者一巡(2列)の回は必ず単独1イニング集中解析とし、
          // 三者凡退などの静かな無得点回のみ最大2イニングまでに抑えて1マスあたりの推論精度を最大化する
          const isDetailedInning =
            meta.columnCount >= 2 || meta.runs >= 1 || meta.hits >= 2;
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
          b: structure.batters.map((x) => [
            x.battingOrder,
            x.name,
            x.position,
            x.substitutions.map((s) => [s.inningEntered, s.name, s.position]),
          ]),
          p: structure.pitchers.map((x) => [x.name, x.fromInning, x.toInning]),
          i: structure.innings.map((x) => [x.inning, x.runs, x.columnCount]),
        });

      const requestSingleChunk = async (
        isTop: boolean,
        structure: ScorebookSheetStructure,
        sourceDataUrl: string,
        apiImg: { base64: string; mimeType: string },
        structureFp: string,
        targetInnings: number[],
        expectedLeadOff: number
      ): Promise<{
        atBats: ScorebookV2AtBat[];
        nextLeadOffOrder?: number;
        fromCache?: boolean;
      }> => {
        const cacheKey = `${selectedMatchId}:${
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
          targetBoxes.length > 0
            ? await extractInningChunkCompositeCrop(sourceDataUrl, targetBoxes, {
                lineupRightX: structure.lineupRightX,
                firstInningMinX,
                batters: structure.batters,
                targetInnings,
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
        const apiImg = await ensureCompactApiImage(
          imgState.processed,
          1850,
          0.88
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

        {/* エラー通知バナー */}
        {errorBanner && (
          <div className="p-3.5 rounded-2xl bg-destructive/10 border border-destructive/30 flex items-start gap-2.5">
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
                teamLegendUrl={teamLegendUrl}
                legendOverrideDataUrl={legendOverride?.dataUrl || null}
                onSelectLegendOverride={handleSelectLegendOverride}
                onStartAnalyzeStructure={handleStartAnalyzeStructure}
                isAnalyzingStructure={isAnalyzingStructure}
                structureProgressLabel={structureProgressLabel}
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
                onBack={() => setStep(1)}
                onStartDeepAnalysis={handleStartDeepAnalysis}
                isAnalyzingInnings={isAnalyzingInnings}
                analysisProgressLabel={analysisProgressLabel}
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
                onBack={() => setStep(2)}
                onSave={handleSaveToDatabase}
                isSaving={isSaving}
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
