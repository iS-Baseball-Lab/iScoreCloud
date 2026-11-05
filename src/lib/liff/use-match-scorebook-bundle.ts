// filepath: src/lib/liff/use-match-scorebook-bundle.ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ImportScopeMode,
  ScorebookSheetStructure,
  ScorebookV2AtBat,
} from "@/types/scorebook-v2";
import {
  DEFAULT_TEAM_SCOREBOOK_SYMBOL_RULES,
  loadCachedTeamSymbolRules,
  sanitizeScorebookSymbolRules,
  saveCachedTeamSymbolRules,
  type ScorebookSymbolRules,
} from "@/lib/liff/scorebook-symbol-rules";
import { saveTeamScoreNameDisplayMode } from "@/lib/liff/score-settings";
import {
  buildDemoScorebookSavedBundle,
  compileScorebookSheetModel,
  type CompiledScorebookSheetModel,
  type ScorebookMatchHeaderMeta,
} from "@/lib/liff/scorebook-renderer-model";

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

export interface UseMatchScorebookBundleParams {
  matchMeta: ScorebookMatchHeaderMeta | null;
  isMyTeamTop: boolean;
  hasPersonalStatsData: boolean;
  isFutureOrScheduled: boolean;
  isRainout: boolean;
  isDemoMatch: boolean;
  teamId?: string;
}

export interface MatchScorebookBundleState {
  topModel: CompiledScorebookSheetModel | null;
  bottomModel: CompiledScorebookSheetModel | null;
  effectiveRules: ScorebookSymbolRules;
  isLoadingSheet: boolean;
  loadError: string | null;
  resetBundle: () => void;
}

/**
 * 試合詳細ページ全体でデジタルスコアブックの保存データ取得＆モデルコンパイルを1回に統合する共有フック
 * （タイムラインの1マス表示・清書シート・1マス記号解説モーダルで同一インスタンスを共有し、二重フェッチ・二重計算をゼロにする）
 */
export function useMatchScorebookBundle({
  matchMeta,
  isMyTeamTop,
  hasPersonalStatsData,
  isFutureOrScheduled,
  isRainout,
  isDemoMatch,
  teamId,
}: UseMatchScorebookBundleParams): MatchScorebookBundleState {
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

  const resolvedTeamKey = useMemo(() => {
    if (isDemoMatch) return "demo-team";
    const explicit = (teamId || "").trim();
    if (explicit) return explicit;
    if (typeof window !== "undefined") {
      return (localStorage.getItem("iscore_selectedTeamId") || "").trim();
    }
    return "";
  }, [isDemoMatch, teamId]);

  useEffect(() => {
    const cachedRules = loadCachedTeamSymbolRules(resolvedTeamKey);
    setCloudTeamRules(cachedRules);
  }, [resolvedTeamKey]);

  const resetBundle = useCallback(() => {
    setTopStructure(null);
    setBottomStructure(null);
    setTopAtBats([]);
    setBottomAtBats([]);
    setLoadError(null);
    setIsLoadingSheet(false);
  }, []);

  const matchId = matchMeta?.matchId ?? "";
  const topTeamName = matchMeta?.topTeamName ?? "";
  const bottomTeamName = matchMeta?.bottomTeamName ?? "";

  useEffect(() => {
    if (!matchId || isFutureOrScheduled || isRainout) {
      setTopStructure(null);
      setBottomStructure(null);
      setTopAtBats([]);
      setBottomAtBats([]);
      setLoadError(null);
      setIsLoadingSheet(false);
      return;
    }

    if (isDemoMatch) {
      const demoBundle = buildDemoScorebookSavedBundle({
        matchId,
        isMyTeamFirst: isMyTeamTop,
        myTeamName: isMyTeamTop ? topTeamName : bottomTeamName,
        opponentName: isMyTeamTop ? bottomTeamName : topTeamName,
      });
      setTopStructure(demoBundle.topStructure);
      setBottomStructure(demoBundle.bottomStructure);
      setTopAtBats(demoBundle.topAtBats);
      setBottomAtBats(demoBundle.bottomAtBats);
      setLoadError(null);
      setIsLoadingSheet(false);
      return;
    }

    if (!hasPersonalStatsData) {
      setTopStructure(null);
      setBottomStructure(null);
      setTopAtBats([]);
      setBottomAtBats([]);
      setLoadError(null);
      setIsLoadingSheet(false);
      return;
    }

    let cancelled = false;
    setIsLoadingSheet(true);
    setLoadError(null);

    fetch(`/api/liff/scorebook/saved?matchId=${encodeURIComponent(matchId)}`)
      .then(async (res) => {
        const json = (await res.json()) as SavedScorebookApiResponse;
        if (cancelled) return;
        if (!res.ok || !json.success) {
          setLoadError(
            json.error || "スコアブックデータの読み込みに失敗しました"
          );
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
          const sanitized = sanitizeScorebookSymbolRules(
            json.teamSymbolRules,
            DEFAULT_TEAM_SCOREBOOK_SYMBOL_RULES
          );
          setCloudTeamRules(sanitized);
          saveCachedTeamSymbolRules(sanitized, resolvedTeamKey);
          saveTeamScoreNameDisplayMode(
            resolvedTeamKey,
            sanitized.scoreTeamNameMode ?? "organization"
          );
        } else {
          setCloudTeamRules(null);
          saveCachedTeamSymbolRules(null, resolvedTeamKey);
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
    matchId,
    topTeamName,
    bottomTeamName,
    isMyTeamTop,
    hasPersonalStatsData,
    isFutureOrScheduled,
    isRainout,
    isDemoMatch,
    resolvedTeamKey,
  ]);

  const topModel = useMemo(() => {
    if (!matchMeta || !topStructure || topAtBats.length === 0) return null;
    return compileScorebookSheetModel(topStructure, topAtBats, matchMeta);
  }, [topStructure, topAtBats, matchMeta]);

  const bottomModel = useMemo(() => {
    if (!matchMeta || !bottomStructure || bottomAtBats.length === 0) return null;
    return compileScorebookSheetModel(bottomStructure, bottomAtBats, matchMeta);
  }, [bottomStructure, bottomAtBats, matchMeta]);

  const effectiveRules: ScorebookSymbolRules = useMemo(
    () => cloudTeamRules ?? DEFAULT_TEAM_SCOREBOOK_SYMBOL_RULES,
    [cloudTeamRules]
  );

  return {
    topModel,
    bottomModel,
    effectiveRules,
    isLoadingSheet,
    loadError,
    resetBundle,
  };
}

