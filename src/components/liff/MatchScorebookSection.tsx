// filepath: src/components/liff/MatchScorebookSection.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Printer,
  Share2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type {
  ImportScopeMode,
  ScorebookSheetStructure,
  ScorebookV2AtBat,
} from "@/types/scorebook-v2";
import {
  DEFAULT_TEAM_SCOREBOOK_SYMBOL_RULES,
  loadCachedTeamSymbolRules,
  saveCachedTeamSymbolRules,
  type ScorebookSymbolRules,
} from "@/lib/liff/scorebook-symbol-rules";
import {
  buildDemoScorebookSavedBundle,
  compileScorebookSheetModel,
  type ScorebookMatchHeaderMeta,
} from "@/lib/liff/scorebook-renderer-model";
import {
  DigitalScorebookSheet,
  exportScorebookSvgElementsToPngBlob,
  printScorebookSvgElements,
} from "@/components/liff/DigitalScorebookSheet";

interface SavedScorebookApiResponse {
  success: boolean;
  error?: string;
  matchId?: string;
  importScope?: ImportScopeMode;
  topStructure?: ScorebookSheetStructure | null;
  bottomStructure?: ScorebookSheetStructure | null;
  topAtBats?: ScorebookV2AtBat[];
  bottomAtBats?: ScorebookV2AtBat[];
  topImageUrl?: string | null;
  bottomImageUrl?: string | null;
  teamName?: string | null;
  scorebookLegendUrl?: string | null;
  teamSymbolRules?: ScorebookSymbolRules | null;
}

export interface MatchScorebookSectionProps {
  matchMeta: ScorebookMatchHeaderMeta;
  isMyTeamTop: boolean;
  hasPersonalStatsData: boolean;
  isLoadingStats: boolean;
  isFutureOrScheduled: boolean;
  isRainout: boolean;
  isDemoMatch: boolean;
}

export function MatchScorebookSection({
  matchMeta,
  isMyTeamTop,
  hasPersonalStatsData,
  isLoadingStats,
  isFutureOrScheduled,
  isRainout,
  isDemoMatch,
}: MatchScorebookSectionProps) {
  const [isLoadingSheet, setIsLoadingSheet] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [topStructure, setTopStructure] =
    useState<ScorebookSheetStructure | null>(null);
  const [bottomStructure, setBottomStructure] =
    useState<ScorebookSheetStructure | null>(null);
  const [topAtBats, setTopAtBats] = useState<ScorebookV2AtBat[]>([]);
  const [bottomAtBats, setBottomAtBats] = useState<ScorebookV2AtBat[]>([]);
  const [cloudTeamRules, setCloudTeamRules] =
    useState<ScorebookSymbolRules | null>(null);

  const [activeSide, setActiveSide] = useState<"top" | "bottom">(
    isMyTeamTop ? "top" : "bottom"
  );
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [fullscreenZoom, setFullscreenZoom] = useState<number>(1);
  const [exportedPreviewDataUrl, setExportedPreviewDataUrl] = useState<
    string | null
  >(null);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [mountOffscreenSheet, setMountOffscreenSheet] = useState(false);

  const topSvgRef = useRef<SVGSVGElement | null>(null);
  const bottomSvgRef = useRef<SVGSVGElement | null>(null);

  // 初回マウント時にキャッシュ済みのチーム記号ルールを復元
  useEffect(() => {
    const cachedRules = loadCachedTeamSymbolRules();
    if (cachedRules) {
      setCloudTeamRules(cachedRules);
    }
  }, []);

  // 背景の試合IDが切り替わった際は開いているモーダルを自動リセット（SKILL.md規約5）
  useEffect(() => {
    setIsFullscreenOpen(false);
    setExportedPreviewDataUrl(null);
    setFullscreenZoom(1);
    setActiveSide(isMyTeamTop ? "top" : "bottom");
  }, [matchMeta.matchId, isMyTeamTop]);

  // 保存済みスコアブックデータの取得（デモ試合時はデモ用シートを構築）
  useEffect(() => {
    if (isFutureOrScheduled || isRainout) {
      setTopStructure(null);
      setBottomStructure(null);
      setTopAtBats([]);
      setBottomAtBats([]);
      return;
    }

    if (isDemoMatch) {
      const demoBundle = buildDemoScorebookSavedBundle({
        matchId: matchMeta.matchId,
        isMyTeamFirst: isMyTeamTop,
        myTeamName: isMyTeamTop
          ? matchMeta.topTeamName
          : matchMeta.bottomTeamName,
        opponentName: isMyTeamTop
          ? matchMeta.bottomTeamName
          : matchMeta.topTeamName,
      });
      setTopStructure(demoBundle.topStructure);
      setBottomStructure(demoBundle.bottomStructure);
      setTopAtBats(demoBundle.topAtBats);
      setBottomAtBats(demoBundle.bottomAtBats);
      setLoadError(null);
      return;
    }

    if (!hasPersonalStatsData) {
      setTopStructure(null);
      setBottomStructure(null);
      setTopAtBats([]);
      setBottomAtBats([]);
      return;
    }

    let cancelled = false;
    setIsLoadingSheet(true);
    setLoadError(null);

    fetch(
      `/api/liff/scorebook/saved?matchId=${encodeURIComponent(
        matchMeta.matchId
      )}`
    )
      .then(async (res) => {
        const json = (await res.json()) as SavedScorebookApiResponse;
        if (cancelled) return;
        if (!res.ok || !json.success) {
          setLoadError(json.error || "スコアブックデータの読み込みに失敗しました");
          return;
        }

        const nextTopStr = json.topStructure ?? null;
        const nextBotStr = json.bottomStructure ?? null;
        const nextTopAbs = Array.isArray(json.topAtBats) ? json.topAtBats : [];
        const nextBotAbs = Array.isArray(json.bottomAtBats)
          ? json.bottomAtBats
          : [];

        setTopStructure(nextTopStr);
        setBottomStructure(nextBotStr);
        setTopAtBats(nextTopAbs);
        setBottomAtBats(nextBotAbs);

        if (json.teamSymbolRules) {
          setCloudTeamRules(json.teamSymbolRules);
          saveCachedTeamSymbolRules(json.teamSymbolRules);
        }

        // 片面のみ取込済みの場合はデータが存在する側を自動選択
        const hasTop = Boolean(nextTopStr && nextTopAbs.length > 0);
        const hasBot = Boolean(nextBotStr && nextBotAbs.length > 0);
        if (hasTop && !hasBot) {
          setActiveSide("top");
        } else if (!hasTop && hasBot) {
          setActiveSide("bottom");
        } else {
          setActiveSide(isMyTeamTop ? "top" : "bottom");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError("通信エラーによりスコアブックを読み込めませんでした");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingSheet(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    matchMeta.matchId,
    matchMeta.topTeamName,
    matchMeta.bottomTeamName,
    isMyTeamTop,
    hasPersonalStatsData,
    isFutureOrScheduled,
    isRainout,
    isDemoMatch,
  ]);

  const topModel = useMemo(() => {
    if (!topStructure || topAtBats.length === 0) return null;
    return compileScorebookSheetModel(topStructure, topAtBats, matchMeta);
  }, [topStructure, topAtBats, matchMeta]);

  const bottomModel = useMemo(() => {
    if (!bottomStructure || bottomAtBats.length === 0) return null;
    return compileScorebookSheetModel(bottomStructure, bottomAtBats, matchMeta);
  }, [bottomStructure, bottomAtBats, matchMeta]);

  // スコア設定ページで設定されたチームの記号ルールを常に適用
  const effectiveRules: ScorebookSymbolRules = useMemo(
    () => cloudTeamRules ?? DEFAULT_TEAM_SCOREBOOK_SYMBOL_RULES,
    [cloudTeamRules]
  );

  const activeModel = activeSide === "top" ? topModel : bottomModel;
  const hasBothSides = Boolean(topModel && bottomModel);

  const ensureBothSidesMounted = useCallback(async () => {
    if (!hasBothSides) return;
    if (!topSvgRef.current || !bottomSvgRef.current) {
      setMountOffscreenSheet(true);
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    }
  }, [hasBothSides]);

  const handleExportPng = useCallback(
    async (scope: "current" | "both") => {
      if (scope === "both") {
        await ensureBothSidesMounted();
      }
      const targets: SVGSVGElement[] = [];
      if (scope === "both") {
        if (topSvgRef.current) targets.push(topSvgRef.current);
        if (bottomSvgRef.current) targets.push(bottomSvgRef.current);
      } else {
        const currentEl =
          activeSide === "top" ? topSvgRef.current : bottomSvgRef.current;
        if (currentEl) targets.push(currentEl);
      }

      if (targets.length === 0) {
        toast.error("出力するスコアブックシートが見つかりません");
        return;
      }

      setIsExportingPng(true);
      try {
        const blob = await exportScorebookSvgElementsToPngBlob(targets, 2.4);
        const safeDate = (matchMeta.date || "scorebook").replace(
          /[^0-9-]/g,
          ""
        );
        const sideSuffix =
          scope === "both"
            ? "両面"
            : activeSide === "top"
            ? "先攻"
            : "後攻";
        const fileName = `scorebook_${safeDate}_${sideSuffix}.png`;
        const file = new File([blob], fileName, { type: "image/png" });

        // モバイルLINE・スマホでネイティブ共有（写真保存・LINE送信）が可能な場合は優先利用
        if (
          typeof navigator !== "undefined" &&
          typeof navigator.share === "function" &&
          typeof navigator.canShare === "function" &&
          navigator.canShare({ files: [file] })
        ) {
          try {
            await navigator.share({
              title: `${matchMeta.topTeamName} vs ${matchMeta.bottomTeamName} スコアブック`,
              files: [file],
            });
            toast.success("スコアブック画像を出力しました");
            return;
          } catch (shareErr) {
            if (
              shareErr instanceof Error &&
              shareErr.name === "AbortError"
            ) {
              return;
            }
            // WebView制限等でshare失敗時はダウンロード＆画像プレビューへフォールバック
          }
        }

        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          reader.onloadend = () =>
            typeof reader.result === "string"
              ? resolve(reader.result)
              : reject(new Error("DataURL変換失敗"));
          reader.onerror = () => reject(new Error("DataURL変換失敗"));
          reader.readAsDataURL(blob);
        });

        const anchor = document.createElement("a");
        anchor.href = dataUrl;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);

        setExportedPreviewDataUrl(dataUrl);
        toast.success(
          "スコアブック画像を生成しました（長押し保存にも対応しています）"
        );
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "画像出力に失敗しました";
        toast.error(msg);
      } finally {
        setIsExportingPng(false);
      }
    },
    [
      activeSide,
      ensureBothSidesMounted,
      matchMeta.date,
      matchMeta.topTeamName,
      matchMeta.bottomTeamName,
    ]
  );

  const handlePrintSheet = useCallback(
    async (scope: "current" | "both") => {
      if (scope === "both") {
        await ensureBothSidesMounted();
      }
      const targets: SVGSVGElement[] = [];
      if (scope === "both") {
        if (topSvgRef.current) targets.push(topSvgRef.current);
        if (bottomSvgRef.current) targets.push(bottomSvgRef.current);
      } else {
        const currentEl =
          activeSide === "top" ? topSvgRef.current : bottomSvgRef.current;
        if (currentEl) targets.push(currentEl);
      }
      if (targets.length === 0) {
        toast.error("印刷するスコアブックシートがありません");
        return;
      }
      printScorebookSvgElements(
        targets,
        `${matchMeta.date} ${matchMeta.topTeamName} vs ${matchMeta.bottomTeamName} スコアブック`
      );
    },
    [
      activeSide,
      ensureBothSidesMounted,
      matchMeta.date,
      matchMeta.topTeamName,
      matchMeta.bottomTeamName,
    ]
  );

  if (isFutureOrScheduled || isRainout) {
    return null;
  }

  if (!isDemoMatch && !hasPersonalStatsData && !isLoadingStats) {
    return null;
  }

  return (
    <section className="space-y-2" aria-label="デジタルスコアブック">
      {/* セクション見出し（他セクションと統一したカード外見出し） */}
      <div className="flex items-center gap-1.5 px-1">
        <h2 className="flex items-center gap-1.5 text-xs font-black text-foreground">
          <FileSpreadsheet className="w-4 h-4 text-primary shrink-0" />
          <span>スコアブック（清書シート）</span>
        </h2>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
        {isLoadingStats || isLoadingSheet ? (
          <div className="py-10 px-4 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-xs font-black text-foreground">
              スコアブック清書シートを作成しています...
            </p>
          </div>
        ) : loadError ? (
          <div className="p-4 text-center space-y-1">
            <p className="text-xs font-black text-rose-600 dark:text-rose-400">
              {loadError}
            </p>
          </div>
        ) : !topModel && !bottomModel ? null : (
          <>
            {/* A-3 上帯ダークキャップ */}
            <div className="px-4 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-black text-white">
                <FileSpreadsheet className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>デジタル清書スコアシート</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 text-[10px] font-bold">
                {hasBothSides
                  ? "先攻・後攻 両面データ"
                  : activeSide === "top"
                  ? "先攻シート"
                  : "後攻シート"}
              </span>
            </div>

            <div className="p-3 sm:p-3.5 space-y-3">
              {/* ━━━ 上段コントロール：先攻（表） ⇄ 後攻（裏） シート切替 ━━━ */}
              <div className="grid grid-cols-2 gap-1.5 bg-muted/80 dark:bg-muted/50 p-1 rounded-2xl border border-border/60">
                <button
                  type="button"
                  disabled={!topModel}
                  onClick={() => setActiveSide("top")}
                  className={cn(
                    "py-2 px-2.5 rounded-xl text-xs transition-all flex items-center justify-between gap-1.5 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed",
                    activeSide === "top" && topModel
                      ? "bg-card text-foreground shadow-sm border border-border/50 font-black"
                      : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                  )}
                >
                  <span className="truncate">
                    <span className={activeSide === "top" && topModel ? "text-primary mr-1" : "mr-1"}>
                      先攻:
                    </span>
                    {matchMeta.topTeamName}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-[10px] px-1.5 py-0.5 rounded shrink-0",
                      activeSide === "top" && topModel
                        ? "bg-primary/12 text-primary font-black"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {topModel ? `${topModel.totals.runs}点` : "未取込"}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={!bottomModel}
                  onClick={() => setActiveSide("bottom")}
                  className={cn(
                    "py-2 px-2.5 rounded-xl text-xs transition-all flex items-center justify-between gap-1.5 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed",
                    activeSide === "bottom" && bottomModel
                      ? "bg-card text-foreground shadow-sm border border-border/50 font-black"
                      : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                  )}
                >
                  <span className="truncate">
                    <span className={activeSide === "bottom" && bottomModel ? "text-primary mr-1" : "mr-1"}>
                      後攻:
                    </span>
                    {matchMeta.bottomTeamName}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-[10px] px-1.5 py-0.5 rounded shrink-0",
                      activeSide === "bottom" && bottomModel
                        ? "bg-primary/12 text-primary font-black"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {bottomModel ? `${bottomModel.totals.runs}点` : "未取込"}
                  </span>
                </button>
              </div>

            {/* ━━━ スコアブックSVGシート本体（横スクロール＋タップ拡大対応） ━━━ */}
            {activeModel && (
              <div className="relative rounded-xl border border-border/60 bg-[#fffefb] overflow-hidden">
                <div className="overflow-x-auto overscroll-x-contain">
                  <div className="min-w-[820px] p-1">
                    {activeSide === "top" && topModel ? (
                      <DigitalScorebookSheet
                        model={topModel}
                        matchMeta={matchMeta}
                        rules={effectiveRules}
                        svgRef={topSvgRef}
                        className="w-full h-auto block"
                      />
                    ) : bottomModel ? (
                      <DigitalScorebookSheet
                        model={bottomModel}
                        matchMeta={matchMeta}
                        rules={effectiveRules}
                        svgRef={bottomSvgRef}
                        className="w-full h-auto block"
                      />
                    ) : null}
                  </div>
                </div>

                {/* 横スクロール案内＋全画面拡大フローティングピル */}
                <div className="px-3 py-1.5 bg-muted/50 border-t border-border/60 flex items-center justify-between gap-2 text-[10px] font-bold text-muted-foreground">
                  <span>← 左右にスワイプして全イニング・個人集計を確認 →</span>
                  <button
                    type="button"
                    onClick={() => {
                      setFullscreenZoom(1);
                      setIsFullscreenOpen(true);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/12 text-primary border border-primary/35 hover:bg-primary/18 font-black text-[10px] shadow-2xs active:scale-95 transition-all cursor-pointer shrink-0"
                  >
                    <Maximize2 className="w-3 h-3" />
                    <span>拡大表示</span>
                  </button>
                </div>
              </div>
            )}

            {/* 反対側シートは両面保存・両面印刷の実行時にのみオンデマンドでマウント（初期描画のSVGノード数を50%削減） */}
            {hasBothSides && mountOffscreenSheet && (
              <div
                aria-hidden="true"
                className="fixed -left-[9999px] top-0 pointer-events-none opacity-0 overflow-hidden w-0 h-0"
              >
                {activeSide === "top" && bottomModel && (
                  <DigitalScorebookSheet
                    model={bottomModel}
                    matchMeta={matchMeta}
                    rules={effectiveRules}
                    svgRef={bottomSvgRef}
                  />
                )}
                {activeSide === "bottom" && topModel && (
                  <DigitalScorebookSheet
                    model={topModel}
                    matchMeta={matchMeta}
                    rules={effectiveRules}
                    svgRef={topSvgRef}
                  />
                )}
              </div>
            )}

            {/* ━━━ 下段アクションバー：画像保存・LINE共有・A4印刷 ━━━ */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-0.5">
              <button
                type="button"
                disabled={isExportingPng}
                onClick={() => handleExportPng("current")}
                className="h-10 px-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer disabled:opacity-55"
              >
                {isExportingPng ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                ) : (
                  <Share2 className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>表示中を画像保存</span>
              </button>

              {hasBothSides ? (
                <button
                  type="button"
                  disabled={isExportingPng}
                  onClick={() => handleExportPng("both")}
                  className="h-10 px-3 rounded-xl border border-primary/25 bg-primary/10 hover:bg-primary/15 text-primary text-xs font-black flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer disabled:opacity-55"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span>先攻・後攻まとめて保存</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setFullscreenZoom(1.25);
                    setIsFullscreenOpen(true);
                  }}
                  className="h-10 px-3 rounded-xl border border-border/60 bg-card hover:bg-muted text-foreground text-xs font-black flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span>全画面で大きく見る</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handlePrintSheet(hasBothSides ? "both" : "current")}
                className="col-span-2 sm:col-span-1 h-10 px-3 rounded-xl border border-border/60 bg-card hover:bg-muted text-foreground text-xs font-black flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>{hasBothSides ? "A4横 両面印刷 / PDF" : "A4横 印刷 / PDF"}</span>
              </button>
            </div>
          </div>
          </>
        )}
      </div>

      {/* ━━━ モーダル1：全画面・高精細ズームビューア（明示的な×ボタンでのみ閉じる） ━━━ */}
      {isFullscreenOpen && activeModel && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="スコアブック全画面表示"
          className="fixed inset-0 z-50 bg-black/95 flex flex-col"
        >
          {/* 上部ツールバー */}
          <div className="px-3 py-2.5 bg-card border-b border-border/60 flex items-center justify-between gap-2 shrink-0">
            <div className="inline-flex items-center gap-1 bg-muted/80 dark:bg-muted/50 p-1 rounded-2xl border border-border/60 min-w-0">
              {topModel && (
                <button
                  type="button"
                  onClick={() => setActiveSide("top")}
                  className={cn(
                    "px-2.5 py-1 rounded-xl text-[11px] transition-all cursor-pointer",
                    activeSide === "top"
                      ? "bg-card text-foreground shadow-sm border border-border/50 font-black"
                      : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                  )}
                >
                  <span className={activeSide === "top" ? "text-primary" : ""}>先攻</span>
                </button>
              )}
              {bottomModel && (
                <button
                  type="button"
                  onClick={() => setActiveSide("bottom")}
                  className={cn(
                    "px-2.5 py-1 rounded-xl text-[11px] transition-all cursor-pointer",
                    activeSide === "bottom"
                      ? "bg-card text-foreground shadow-sm border border-border/50 font-black"
                      : "text-muted-foreground hover:text-foreground font-bold border border-transparent"
                  )}
                >
                  <span className={activeSide === "bottom" ? "text-primary" : ""}>後攻</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() =>
                  setFullscreenZoom((z) => Math.max(0.75, +(z - 0.25).toFixed(2)))
                }
                aria-label="縮小"
                className="w-8 h-8 rounded-lg bg-card border border-border/60 hover:bg-muted text-foreground flex items-center justify-center cursor-pointer active:scale-95"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-[11px] font-mono font-black text-foreground w-11 text-center">
                {Math.round(fullscreenZoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() =>
                  setFullscreenZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)))
                }
                aria-label="拡大"
                className="w-8 h-8 rounded-lg bg-card border border-border/60 hover:bg-muted text-foreground flex items-center justify-center cursor-pointer active:scale-95"
              >
                <ZoomIn className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setIsFullscreenOpen(false)}
                aria-label="全画面表示を閉じる"
                className="ml-1 w-9 h-9 rounded-full bg-muted hover:bg-muted/80 border border-border/60 text-foreground flex items-center justify-center cursor-pointer active:scale-95"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* ズーム＆2軸パン領域 */}
          <div className="flex-1 overflow-auto p-3">
            <div
              style={{
                width: `${Math.round(980 * fullscreenZoom)}px`,
              }}
              className="mx-auto"
            >
              <DigitalScorebookSheet
                model={activeModel}
                matchMeta={matchMeta}
                rules={effectiveRules}
                className="w-full h-auto rounded-lg shadow-2xl"
              />
            </div>
          </div>
        </div>
      )}

      {/* ━━━ モーダル2：生成PNG画像の長押し保存プレビュー（LINEアプリ内ブラウザ用） ━━━ */}
      {exportedPreviewDataUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="生成スコアブック画像"
          className="fixed inset-0 z-50 bg-black/95 flex flex-col p-3"
        >
          <div className="flex items-center justify-between pb-2.5 text-white shrink-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <ImageIcon className="w-4 h-4 text-primary shrink-0" />
              <span className="text-xs font-black truncate">
                画像を長押しして「写真に保存」できます
              </span>
            </div>
            <button
              type="button"
              onClick={() => setExportedPreviewDataUrl(null)}
              aria-label="閉じる"
              className="p-2 rounded-full bg-white/15 hover:bg-white/25 text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-auto flex items-start justify-center">
            <img
              src={exportedPreviewDataUrl}
              alt="デジタルスコアブック清書画像"
              className="max-w-full h-auto rounded-xl border border-white/20 shadow-xl"
            />
          </div>
        </div>
      )}
    </section>
  );
}
