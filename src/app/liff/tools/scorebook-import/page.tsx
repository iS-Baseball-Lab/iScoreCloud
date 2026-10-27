// filepath: src/app/liff/tools/scorebook-import/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { LiffHeader } from "@/components/liff/LiffHeader";
import { LiffPageHeader } from "@/components/liff/LiffPageHeader";
import { useLiff } from "@/components/liff/LiffProvider";
import { LiffToolSubNav } from "@/components/liff/LiffToolSubNav";
import { preprocessScorebookImage } from "@/lib/liff/scorebook-image";
import {
  Step1MatchAndImages,
  type SheetImageState,
} from "./_components/Step1MatchAndImages";
import { Step2StructureCheck } from "./_components/Step2StructureCheck";
import { Step3PinpointReview } from "./_components/Step3PinpointReview";
import type {
  ImportScopeMode,
  ScorebookMatchSummary,
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

const createInitialSheetImageState = (): SheetImageState => ({
  file: null,
  rotationDeg: 0,
  enhancePencil: true,
  cropTop: 0,
  cropBottom: 0,
  cropLeft: 0,
  cropRight: 0,
  processed: null,
  isProcessing: false,
});

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

  const [importScope, setImportScope] = useState<ImportScopeMode>("both");
  const [topImage, setTopImage] = useState<SheetImageState>(
    createInitialSheetImageState
  );
  const [bottomImage, setBottomImage] = useState<SheetImageState>(
    createInitialSheetImageState
  );

  const [legendOverride, setLegendOverride] = useState<{
    dataUrl: string;
    base64: string;
    mimeType: string;
  } | null>(null);

  const [isCreatingMatch, setIsCreatingMatch] = useState(false);
  const [isAnalyzingStructure, setIsAnalyzingStructure] = useState(false);
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

  // 1. チーム選手名鑑・試合一覧の読み込み
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

      if (data.team) {
        setResolvedTeamId(data.team.id);
        setTeamLegendUrl(data.team.scorebookLegendUrl);
      }
      setRoster(data.roster || []);
      const fetchedMatches = data.matches || [];
      setMatches(fetchedMatches);
      if (fetchedMatches.length > 0 && !selectedMatchId) {
        setSelectedMatchId(fetchedMatches[0].id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorBanner(msg);
    } finally {
      setIsLoadingContext(false);
    }
  }, [currentTeam?.id, selectedMatchId]);

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  // 2. Canvas前処理の実行ヘルパー
  const runPreprocess = async (isTop: boolean, nextState: SheetImageState) => {
    const setter = isTop ? setTopImage : setBottomImage;
    if (!nextState.file) {
      setter(createInitialSheetImageState());
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
        maxLongEdge: 2000,
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
      runPreprocess(isTop, createInitialSheetImageState());
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
        maxLongEdge: 1600,
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

  // 4. Stage 1: AI骨格スキャン実行
  const handleStartAnalyzeStructure = async () => {
    if (!selectedMatchId) return;
    setIsAnalyzingStructure(true);
    setErrorBanner(null);

    try {
      const needTop = importScope === "both" || importScope === "top_only";
      const needBottom =
        importScope === "both" || importScope === "bottom_only";

      const analyzeOneSide = async (
        isTop: boolean,
        imgState: SheetImageState
      ): Promise<ScorebookSheetStructure> => {
        if (!imgState.processed) {
          throw new Error("画像が準備されていません");
        }
        const res = await fetch("/api/liff/scorebook/analyze-structure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId: resolvedTeamId || currentTeam?.id || "",
            matchId: selectedMatchId,
            isTop,
            imageBase64: imgState.processed.base64,
            mimeType: imgState.processed.mimeType,
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

      const [resTop, resBottom] = await Promise.all([
        needTop ? analyzeOneSide(true, topImage) : Promise.resolve(null),
        needBottom
          ? analyzeOneSide(false, bottomImage)
          : Promise.resolve(null),
      ]);

      setTopStructure(resTop);
      setBottomStructure(resBottom);
      setStep(2);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorBanner(msg);
    } finally {
      setIsAnalyzingStructure(false);
    }
  };

  // 5. Stage 2: イニング分割ディープ解析（1〜2回ずつの高速チャンク＋自動分割リトライ＆先頭打順連鎖）
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
          // 打者一巡(2列)や大量得点(3点以上)の回は単独1イニングで集中解析しタイムアウトを防止
          const isHeavyInning = meta.columnCount >= 2 || meta.runs >= 3;
          if (isHeavyInning) {
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

      const requestSingleChunk = async (
        isTop: boolean,
        structure: ScorebookSheetStructure,
        imgState: SheetImageState,
        targetInnings: number[],
        expectedLeadOff: number
      ): Promise<{
        atBats: ScorebookV2AtBat[];
        nextLeadOffOrder?: number;
      }> => {
        const sideLabel = isTop ? "先攻（表）" : "後攻（裏）";
        const res = await fetch("/api/liff/scorebook/analyze-inning-chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId: resolvedTeamId || currentTeam?.id || "",
            matchId: selectedMatchId,
            isTop,
            imageBase64: imgState.processed!.base64,
            mimeType: imgState.processed!.mimeType,
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

        return {
          atBats: data.atBats,
          nextLeadOffOrder: data.nextLeadOffOrder,
        };
      };

      const analyzeSheetByChunks = async (
        isTop: boolean,
        structure: ScorebookSheetStructure,
        imgState: SheetImageState
      ): Promise<ScorebookV2AtBat[]> => {
        if (!imgState.processed) return [];
        const sideLabel = isTop ? "先攻（表）" : "後攻（裏）";
        const chunks = buildSmartInningChunks(structure);

        const collected: ScorebookV2AtBat[] = [];
        let expectedLeadOff = 1;

        for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
          const targetInnings = chunks[cIdx];
          const rangeText =
            targetInnings.length === 1
              ? `${targetInnings[0]}回`
              : `${targetInnings[0]}〜${
                  targetInnings[targetInnings.length - 1]
                }回`;

          setAnalysisProgressLabel(
            `${sideLabel} ${rangeText} の1球順序・進塁を解析中... (${
              cIdx + 1
            }/${chunks.length})`
          );

          try {
            const chunkRes = await requestSingleChunk(
              isTop,
              structure,
              imgState,
              targetInnings,
              expectedLeadOff
            );
            collected.push(...chunkRes.atBats);
            if (chunkRes.nextLeadOffOrder) {
              expectedLeadOff = chunkRes.nextLeadOffOrder;
            }
          } catch (chunkErr) {
            // 2イニング同時チャンクがタイムアウト等になった場合は自動的に1イニングずつに分割して再試行
            if (targetInnings.length > 1) {
              for (const singleInn of targetInnings) {
                setAnalysisProgressLabel(
                  `${sideLabel} ${singleInn}回 を精密再解析中... (${
                    cIdx + 1
                  }/${chunks.length})`
                );
                const singleRes = await requestSingleChunk(
                  isTop,
                  structure,
                  imgState,
                  [singleInn],
                  expectedLeadOff
                );
                collected.push(...singleRes.atBats);
                if (singleRes.nextLeadOffOrder) {
                  expectedLeadOff = singleRes.nextLeadOffOrder;
                }
              }
            } else {
              // 単独1イニングの一時エラー時は1回だけ自動リトライ
              setAnalysisProgressLabel(
                `${sideLabel} ${rangeText} を再試行中... (${cIdx + 1}/${
                  chunks.length
                })`
              );
              await new Promise((r) => setTimeout(r, 800));
              const retryRes = await requestSingleChunk(
                isTop,
                structure,
                imgState,
                targetInnings,
                expectedLeadOff
              );
              collected.push(...retryRes.atBats);
              if (retryRes.nextLeadOffOrder) {
                expectedLeadOff = retryRes.nextLeadOffOrder;
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
        />

        {/* ツール切替バー（Step 1時のみ表示し、作業中は画面集中） */}
        {step === 1 && <LiffToolSubNav />}

        {/* ステップインジケーター */}
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { num: 1 as const, label: "1. 撮影・前処理" },
            { num: 2 as const, label: "2. 骨格10秒確認" },
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
              />
            )}

            {step === 2 && (
              <Step2StructureCheck
                importScope={importScope}
                roster={roster}
                opponentName={selectedMatch?.opponent || "対戦相手"}
                topStructure={topStructure}
                bottomStructure={bottomStructure}
                onChangeStructure={(isTop, updated) =>
                  isTop ? setTopStructure(updated) : setBottomStructure(updated)
                }
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
                      setTopImage(createInitialSheetImageState());
                      setBottomImage(createInitialSheetImageState());
                      setTopStructure(null);
                      setBottomStructure(null);
                      setTopAtBats([]);
                      setBottomAtBats([]);
                      setSaveSummary(null);
                      setStep(1);
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
