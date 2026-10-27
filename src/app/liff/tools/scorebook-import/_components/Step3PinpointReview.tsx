// filepath: src/app/liff/tools/scorebook-import/_components/Step3PinpointReview.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  X,
  Save,
  Loader2,
  ZoomIn,
  Maximize2,
  ArrowLeft,
  ArrowRight,
  Check,
} from "lucide-react";
import {
  ADVANCE_METHOD_LABELS,
  AT_BAT_RESULT_PRESETS,
  PITCH_RESULT_PRESETS,
  type AdvanceMethodCode,
  type CanonicalAtBatResult,
  type CanonicalPitchResult,
  type ImportScopeMode,
  type ScorebookSheetStructure,
  type ScorebookV2Advance,
  type ScorebookV2AtBat,
  type ScorebookValidationIssue,
} from "@/types/scorebook-v2";
import {
  computeCountFromPitches,
  validateScorebookSheet,
} from "@/lib/liff/scorebook-validator";
import { cropScorebookRegion } from "@/lib/liff/scorebook-image";

interface Step3PinpointReviewProps {
  importScope: ImportScopeMode;
  opponentName: string;
  topImageDataUrl: string | null;
  bottomImageDataUrl: string | null;
  topStructure: ScorebookSheetStructure | null;
  bottomStructure: ScorebookSheetStructure | null;
  topAtBats: ScorebookV2AtBat[];
  bottomAtBats: ScorebookV2AtBat[];
  onChangeAtBats: (isTop: boolean, updated: ScorebookV2AtBat[]) => void;
  onBack: () => void;
  onSave: () => void;
  isSaving: boolean;
}

export function Step3PinpointReview({
  importScope,
  opponentName,
  topImageDataUrl,
  bottomImageDataUrl,
  topStructure,
  bottomStructure,
  topAtBats,
  bottomAtBats,
  onChangeAtBats,
  onBack,
  onSave,
  isSaving,
}: Step3PinpointReviewProps) {
  const [mounted, setMounted] = useState(false);
  const [activeSide, setActiveSide] = useState<"top" | "bottom">(
    importScope === "bottom_only" ? "bottom" : "top"
  );
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [selectedInning, setSelectedInning] = useState<number | "all">("all");
  const [editingAtBatId, setEditingAtBatId] = useState<string | null>(null);
  const [croppedCellUrl, setCroppedCellUrl] = useState<string | null>(null);
  const [showFullSheetInModal, setShowFullSheetInModal] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isTop = activeSide === "top";
  const currentList = isTop ? topAtBats : bottomAtBats;
  const currentStructure = isTop ? topStructure : bottomStructure;
  const currentSheetImage = isTop ? topImageDataUrl : bottomImageDataUrl;

  const topIssues = useMemo(
    () =>
      importScope === "bottom_only"
        ? []
        : validateScorebookSheet(topAtBats, topStructure),
    [importScope, topAtBats, topStructure]
  );

  const bottomIssues = useMemo(
    () =>
      importScope === "top_only"
        ? []
        : validateScorebookSheet(bottomAtBats, bottomStructure),
    [importScope, bottomAtBats, bottomStructure]
  );

  const currentIssues = isTop ? topIssues : bottomIssues;
  const totalIssuesCount = topIssues.length + bottomIssues.length;

  const issuesByAtBatId = useMemo(() => {
    const map = new Map<string, ScorebookValidationIssue[]>();
    for (const iss of currentIssues) {
      if (!iss.atBatId) continue;
      const arr = map.get(iss.atBatId) || [];
      arr.push(iss);
      map.set(iss.atBatId, arr);
    }
    return map;
  }, [currentIssues]);

  const availableInnings = useMemo(() => {
    const set = new Set<number>();
    currentList.forEach((ab) => set.add(ab.inning));
    return Array.from(set).sort((a, b) => a - b);
  }, [currentList]);

  const visibleList = useMemo(() => {
    return currentList.filter((ab) => {
      if (selectedInning !== "all" && ab.inning !== selectedInning) {
        return false;
      }
      if (onlyFlagged) {
        return (
          issuesByAtBatId.has(ab.id) || ab.confidence === "low"
        );
      }
      return true;
    });
  }, [currentList, selectedInning, onlyFlagged, issuesByAtBatId]);

  const editingIndex = editingAtBatId
    ? currentList.findIndex((ab) => ab.id === editingAtBatId)
    : -1;
  const editingAtBat = editingIndex >= 0 ? currentList[editingIndex] : null;

  // 編集中マスの切り抜きズーム画像を生成
  useEffect(() => {
    let cancelled = false;
    setShowFullSheetInModal(false);

    if (!editingAtBat || !currentSheetImage) {
      setCroppedCellUrl(null);
      return;
    }

    if (!editingAtBat.cellBox) {
      setCroppedCellUrl(currentSheetImage);
      return;
    }

    cropScorebookRegion(currentSheetImage, editingAtBat.cellBox, 0.35)
      .then((url) => {
        if (!cancelled) setCroppedCellUrl(url);
      })
      .catch(() => {
        if (!cancelled) setCroppedCellUrl(currentSheetImage);
      });

    return () => {
      cancelled = true;
    };
  }, [editingAtBat?.id, editingAtBat?.cellBox, currentSheetImage]);

  const updateSingleAtBat = (
    targetId: string,
    updater: (prev: ScorebookV2AtBat) => ScorebookV2AtBat
  ) => {
    const updated = currentList.map((item) =>
      item.id === targetId ? updater(item) : item
    );
    onChangeAtBats(isTop, updated);
  };

  const handleAddAtBatInInning = (inning: number) => {
    const inInning = currentList.filter((a) => a.inning === inning);
    const lastInInning = inInning[inInning.length - 1];
    const nextOrder = lastInInning ? (lastInInning.battingOrder % 9) + 1 : 1;
    const batterSlot = currentStructure?.batters.find(
      (b) => b.battingOrder === nextOrder
    );
    const pitcherSlot = currentStructure?.pitchers[0];

    const newItem: ScorebookV2AtBat = {
      id: crypto.randomUUID(),
      inning,
      isTop,
      columnIndex: lastInInning?.columnIndex || 1,
      battingOrder: nextOrder,
      batterName: batterSlot?.name || "",
      batterPlayerId: batterSlot?.playerId || null,
      pitcherName: pitcherSlot?.name || "",
      pitcherPlayerId: pitcherSlot?.playerId || null,
      resultCode: "groundout",
      resultLabel: "内ゴロ",
      battedDirection: "",
      rbi: 0,
      outsInPlay: 1,
      endingOuts: Math.min(3, (lastInInning?.endingOuts || 0) + 1),
      runsInPlay: 0,
      balls: 0,
      strikes: 0,
      pitches: ["in_play"],
      advances: [],
      confidence: "high",
    };

    const nextList = [...currentList, newItem].sort((a, b) =>
      a.inning !== b.inning ? a.inning - b.inning : 0
    );
    onChangeAtBats(isTop, nextList);
    setEditingAtBatId(newItem.id);
  };

  const handleDeleteAtBat = (targetId: string) => {
    const nextList = currentList.filter((a) => a.id !== targetId);
    onChangeAtBats(isTop, nextList);
    setEditingAtBatId(null);
  };

  const getPitchMeta = (code: CanonicalPitchResult) =>
    PITCH_RESULT_PRESETS.find((p) => p.code === code) ||
    PITCH_RESULT_PRESETS[0];

  return (
    <div className="space-y-4">
      {/* 総合整合性サマリーバナー */}
      {totalIssuesCount === 0 ? (
        <section className="rounded-3xl bg-emerald-500/10 border border-emerald-500/35 p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <h2 className="text-xs font-black text-emerald-700 dark:text-emerald-300">
              全イニングの整合性チェックをクリアしました！
            </h2>
            <p className="text-[11px] font-bold text-muted-foreground">
              アウト数・イニング得点・打順連続性・1球履歴カウントすべて整合しています。各打席をタップして詳細確認・微調整もできます。
            </p>
          </div>
        </section>
      ) : (
        <section className="rounded-3xl bg-amber-500/10 border border-amber-500/35 p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <h2 className="text-xs font-black text-foreground">
                確認おすすめの箇所が {totalIssuesCount} 件あります
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setOnlyFlagged((prev) => !prev)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-black transition-all cursor-pointer ${
                onlyFlagged
                  ? "bg-amber-600 text-white"
                  : "bg-card border border-amber-500/40 text-amber-700 dark:text-amber-300"
              }`}
            >
              {onlyFlagged ? "すべて表示に戻す" : "要確認のみ絞込"}
            </button>
          </div>

          <div className="max-h-32 overflow-y-auto space-y-1.5">
            {currentIssues.map((iss) => (
              <button
                key={iss.id}
                type="button"
                onClick={() => {
                  if (iss.atBatId) setEditingAtBatId(iss.atBatId);
                }}
                className="w-full text-left p-2 rounded-xl bg-card/90 hover:bg-card border border-border/80 flex items-start justify-between gap-2 transition-all cursor-pointer"
              >
                <span className="text-[11px] font-bold text-foreground leading-snug">
                  <strong
                    className={
                      iss.severity === "error"
                        ? "text-destructive mr-1"
                        : "text-amber-600 dark:text-amber-400 mr-1"
                    }
                  >
                    [{iss.inning}回{iss.isTop ? "表" : "裏"}
                    {iss.battingOrder ? ` ${iss.battingOrder}番` : ""}]
                  </strong>
                  {iss.message}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 先攻 / 後攻 タブ切替 */}
      {importScope === "both" && (
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-muted/70 border border-border/60">
          <button
            type="button"
            onClick={() => {
              setActiveSide("top");
              setSelectedInning("all");
            }}
            className={`py-2.5 px-2 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeSide === "top"
                ? "bg-card text-foreground font-black shadow-2xs"
                : "text-muted-foreground font-bold"
            }`}
          >
            <span>
              先攻（{topStructure?.isMyTeamBatting ? "自チーム" : opponentName}）
            </span>
            {topIssues.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[9px] font-black">
                {topIssues.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSide("bottom");
              setSelectedInning("all");
            }}
            className={`py-2.5 px-2 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeSide === "bottom"
                ? "bg-card text-foreground font-black shadow-2xs"
                : "text-muted-foreground font-bold"
            }`}
          >
            <span>
              後攻（{bottomStructure?.isMyTeamBatting ? "自チーム" : opponentName}）
            </span>
            {bottomIssues.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[9px] font-black">
                {bottomIssues.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* イニング絞り込みピルバー */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 -mx-4 px-4 scrollbar-none">
        <button
          type="button"
          onClick={() => setSelectedInning("all")}
          className={`px-3 py-1.5 rounded-xl text-xs font-black shrink-0 cursor-pointer ${
            selectedInning === "all"
              ? "bg-foreground text-background"
              : "bg-card border border-border text-muted-foreground"
          }`}
        >
          全回 ({currentList.length}打席)
        </button>
        {availableInnings.map((inn) => (
          <button
            key={inn}
            type="button"
            onClick={() => setSelectedInning(inn)}
            className={`px-3 py-1.5 rounded-xl text-xs font-black shrink-0 cursor-pointer ${
              selectedInning === inn
                ? "bg-indigo-600 text-white"
                : "bg-card border border-border text-foreground"
            }`}
          >
            {inn}回{isTop ? "表" : "裏"}
          </button>
        ))}
      </div>

      {/* イニング別 打席カード一覧 */}
      <div className="space-y-4">
        {(selectedInning === "all" ? availableInnings : [selectedInning]).map(
          (inn) => {
            const innItems = visibleList.filter((a) => a.inning === inn);
            if (innItems.length === 0 && onlyFlagged) return null;

            const innRuns = currentList
              .filter((a) => a.inning === inn)
              .reduce((s, a) => s + a.runsInPlay, 0);
            const innOuts = currentList
              .filter((a) => a.inning === inn)
              .reduce((s, a) => s + a.outsInPlay, 0);

            return (
              <section
                key={inn}
                className="rounded-3xl bg-card border border-border shadow-xs p-3.5 space-y-2.5"
              >
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 text-xs font-black">
                      {inn}回{isTop ? "表" : "裏"}
                    </span>
                    <span className="text-[11px] font-bold text-muted-foreground">
                      得点 {innRuns} / アウト計 {innOuts}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAddAtBatInInning(inn)}
                    className="px-2 py-1 rounded-lg bg-muted hover:bg-muted/80 text-[10px] font-black text-foreground flex items-center gap-0.5 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>打席追加</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {innItems.map((ab) => {
                    const rowIssues = issuesByAtBatId.get(ab.id) || [];
                    const hasError = rowIssues.some(
                      (i) => i.severity === "error"
                    );
                    const hasWarning =
                      rowIssues.length > 0 || ab.confidence === "low";
                    const isHit =
                      ab.resultCode === "single" ||
                      ab.resultCode === "double" ||
                      ab.resultCode === "triple" ||
                      ab.resultCode === "home_run";

                    return (
                      <button
                        key={ab.id}
                        type="button"
                        onClick={() => setEditingAtBatId(ab.id)}
                        className={`w-full text-left p-3 rounded-2xl border transition-all active:scale-99 space-y-2 cursor-pointer ${
                          hasError
                            ? "bg-destructive/5 border-destructive/45"
                            : hasWarning
                            ? "bg-amber-500/5 border-amber-500/45"
                            : "bg-muted/30 hover:bg-muted/55 border-border/80"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-6 h-6 rounded-lg bg-foreground text-background text-[11px] font-black flex items-center justify-center shrink-0">
                              {ab.battingOrder}
                            </span>
                            <span className="text-xs font-black text-foreground truncate">
                              {ab.batterName || "未設定"}
                            </span>
                            <span className="text-[10px] font-bold text-muted-foreground truncate">
                              vs {ab.pitcherName || "投手"}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {ab.runsInPlay > 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black">
                                +{ab.runsInPlay}点
                              </span>
                            )}
                            {ab.outsInPlay > 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-slate-700 text-white text-[10px] font-black">
                                {ab.outsInPlay}死
                              </span>
                            )}
                            <span
                              className={`px-2.5 py-0.5 rounded-lg text-xs font-black ${
                                isHit
                                  ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                                  : "bg-card border border-border text-foreground"
                              }`}
                            >
                              {ab.resultLabel}
                            </span>
                          </div>
                        </div>

                        {/* 1球ごとの投球順序ピル表示 */}
                        <div className="flex items-center flex-wrap gap-1">
                          <span className="text-[10px] font-black text-muted-foreground mr-0.5">
                            {ab.pitches.length}球:
                          </span>
                          {ab.pitches.map((p, pIdx) => {
                            const meta = getPitchMeta(p);
                            return (
                              <span
                                key={`${ab.id}-p-${pIdx}`}
                                className={`px-1.5 py-0.5 rounded-md border text-[9px] font-black ${meta.toneClass}`}
                              >
                                {pIdx + 1}.{meta.shortLabel}
                              </span>
                            );
                          })}
                        </div>

                        {/* 盗塁・進塁があれば表示 */}
                        {ab.advances.length > 0 && (
                          <div className="flex items-center flex-wrap gap-1 text-[10px] font-bold text-muted-foreground">
                            {ab.advances.map((adv) => (
                              <span
                                key={adv.id}
                                className={`px-1.5 py-0.5 rounded-md border ${
                                  adv.isOut
                                    ? "bg-destructive/10 text-destructive border-destructive/25"
                                    : adv.to === "HP"
                                    ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25"
                                    : "bg-card border-border"
                                }`}
                              >
                                {adv.runnerName ? `${adv.runnerName}: ` : ""}
                                {adv.from}→{adv.to}（
                                {ADVANCE_METHOD_LABELS[adv.method] || adv.method}
                                ）
                              </span>
                            ))}
                          </div>
                        )}

                        {rowIssues.length > 0 && (
                          <p className="text-[10px] font-black text-amber-700 dark:text-amber-300 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span className="truncate">
                              {rowIssues[0].message}
                            </span>
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          }
        )}
      </div>

      {/* 下部保存アクション */}
      <div className="flex gap-2.5 pt-2">
        <button
          type="button"
          disabled={isSaving}
          onClick={onBack}
          className="h-13 px-4 rounded-2xl bg-card border border-border text-xs font-black text-foreground flex items-center gap-1 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>骨格確認へ</span>
        </button>

        <button
          type="button"
          disabled={isSaving}
          onClick={onSave}
          className="flex-1 h-13 px-4 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-black shadow-md flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>試合データ・成績を保存中...</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>試合データ・個人成績に保存する</span>
            </>
          )}
        </button>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          🔍 Portal z-[9999] マス拡大＆1球履歴ディープ編集モーダル
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {mounted &&
        editingAtBat &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex justify-center items-end sm:items-center bg-black/70 p-0 sm:p-4 animate-in fade-in duration-150">
            <div
              className="absolute inset-0"
              onClick={() => setEditingAtBatId(null)}
            />

            <div className="relative z-10 w-full max-w-lg max-h-[92dvh] bg-card rounded-t-3xl sm:rounded-3xl border border-border shadow-2xl flex flex-col overflow-hidden">
              {/* モーダルヘッダー（前後打席送り付き） */}
              <div className="px-4 py-3 border-b border-border bg-card flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={editingIndex <= 0}
                    onClick={() =>
                      editingIndex > 0 &&
                      setEditingAtBatId(currentList[editingIndex - 1].id)
                    }
                    className="p-1.5 rounded-xl bg-muted border border-border disabled:opacity-35 cursor-pointer"
                    aria-label="前の打席"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <div>
                    <p className="text-xs font-black text-foreground">
                      {editingAtBat.inning}回{editingAtBat.isTop ? "表" : "裏"} ・{" "}
                      {editingAtBat.battingOrder}番 {editingAtBat.batterName}
                    </p>
                    <p className="text-[10px] font-bold text-muted-foreground">
                      打席 {editingIndex + 1} / {currentList.length}（投手:{" "}
                      {editingAtBat.pitcherName || "未設定"}）
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={editingIndex >= currentList.length - 1}
                    onClick={() =>
                      editingIndex < currentList.length - 1 &&
                      setEditingAtBatId(currentList[editingIndex + 1].id)
                    }
                    className="p-1.5 rounded-xl bg-muted border border-border disabled:opacity-35 cursor-pointer"
                    aria-label="次の打席"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setEditingAtBatId(null)}
                  className="p-1.5 rounded-full bg-muted text-foreground cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* スクロール編集ボディ */}
              <div className="p-4 space-y-4 overflow-y-auto flex-1">
                {/* 1. 元スコアブック画像 該当マス拡大プレビュー */}
                {currentSheetImage && (
                  <div className="rounded-2xl bg-slate-950 border border-border overflow-hidden">
                    <div className="px-3 py-1.5 bg-slate-900 flex items-center justify-between text-white">
                      <span className="text-[10px] font-black flex items-center gap-1">
                        <ZoomIn className="w-3.5 h-3.5 text-indigo-400" />
                        {showFullSheetInModal
                          ? "シート全体画像"
                          : "手書き原本マス切り抜き"}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setShowFullSheetInModal((prev) => !prev)
                        }
                        className="px-2 py-0.5 rounded-md bg-white/15 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Maximize2 className="w-3 h-3" />
                        <span>
                          {showFullSheetInModal ? "マス拡大に戻す" : "全体を見る"}
                        </span>
                      </button>
                    </div>
                    <div className="max-h-44 overflow-auto flex items-center justify-center p-2">
                      <img
                        src={
                          showFullSheetInModal
                            ? currentSheetImage
                            : croppedCellUrl || currentSheetImage
                        }
                        alt="Scorebook cell preview"
                        className="max-h-40 object-contain rounded-lg"
                      />
                    </div>
                  </div>
                )}

                {/* 2. 打撃結果ワンタップ選択 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-foreground">
                      打撃結果（成績集計カテゴリ＋表示名）
                    </label>
                    {editingAtBat.confidence === "low" && (
                      <button
                        type="button"
                        onClick={() =>
                          updateSingleAtBat(editingAtBat.id, (prev) => ({
                            ...prev,
                            confidence: "high",
                            confidenceReason: undefined,
                          }))
                        }
                        className="px-2.5 py-1 rounded-full bg-emerald-600 text-white text-[10px] font-black flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3 h-3" />
                        <span>確認済みにする</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-1.5">
                    {AT_BAT_RESULT_PRESETS.map((preset) => {
                      const active = editingAtBat.resultCode === preset.code;
                      return (
                        <button
                          key={preset.code}
                          type="button"
                          onClick={() =>
                            updateSingleAtBat(editingAtBat.id, (prev) => ({
                              ...prev,
                              resultCode: preset.code as CanonicalAtBatResult,
                              resultLabel: preset.defaultLabel,
                              outsInPlay: preset.defaultOuts,
                              confidence: "high",
                            }))
                          }
                          className={`py-2 px-1 rounded-xl text-[11px] border transition-all cursor-pointer ${
                            active
                              ? "bg-indigo-600 text-white border-indigo-600 font-black shadow-2xs"
                              : "bg-muted/40 border-border text-foreground font-bold"
                          }`}
                        >
                          {preset.shortLabel}
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-4 gap-2 pt-1">
                    <div className="col-span-2 space-y-1">
                      <span className="text-[10px] font-bold text-muted-foreground">
                        詳細表記（例: 左前安打, 6-3）
                      </span>
                      <input
                        type="text"
                        value={editingAtBat.resultLabel}
                        onChange={(e) =>
                          updateSingleAtBat(editingAtBat.id, (prev) => ({
                            ...prev,
                            resultLabel: e.target.value,
                          }))
                        }
                        className="w-full h-9 px-2.5 rounded-xl bg-muted/40 border border-border text-xs font-black text-foreground"
                      />
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-muted-foreground">
                        アウト増
                      </span>
                      <select
                        value={editingAtBat.outsInPlay}
                        onChange={(e) =>
                          updateSingleAtBat(editingAtBat.id, (prev) => ({
                            ...prev,
                            outsInPlay: Number(e.target.value),
                          }))
                        }
                        className="w-full h-9 px-2 rounded-xl bg-muted/40 border border-border text-xs font-black text-foreground"
                      >
                        <option value={0}>0死</option>
                        <option value={1}>1死</option>
                        <option value={2}>2死(併殺)</option>
                        <option value={3}>3死</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-muted-foreground">
                        この打席得点
                      </span>
                      <select
                        value={editingAtBat.runsInPlay}
                        onChange={(e) =>
                          updateSingleAtBat(editingAtBat.id, (prev) => ({
                            ...prev,
                            runsInPlay: Number(e.target.value),
                            rbi: Number(e.target.value),
                          }))
                        }
                        className="w-full h-9 px-2 rounded-xl bg-muted/40 border border-border text-xs font-black text-foreground"
                      >
                        {[0, 1, 2, 3, 4].map((r) => (
                          <option key={r} value={r}>
                            {r}点
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* 3. 1球ごとの投球順序エディタ（必須機能！） */}
                <div className="p-3 rounded-2xl bg-muted/35 border border-border space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-foreground">
                      1球ごとの投球順序（全 {editingAtBat.pitches.length} 球）
                    </span>
                    <span className="text-[11px] font-black text-indigo-600 dark:text-indigo-400">
                      B:{editingAtBat.balls} - S:{editingAtBat.strikes}
                    </span>
                  </div>

                  {/* 登録済み球順リスト */}
                  <div className="space-y-1.5">
                    {editingAtBat.pitches.map((pCode, pIdx) => {
                      const meta = getPitchMeta(pCode);
                      return (
                        <div
                          key={`${editingAtBat.id}-edit-p-${pIdx}`}
                          className="flex items-center justify-between gap-1.5 p-1.5 rounded-xl bg-card border border-border"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-5 h-5 rounded-full bg-muted text-[10px] font-black flex items-center justify-center shrink-0">
                              {pIdx + 1}
                            </span>
                            <select
                              value={pCode}
                              onChange={(e) => {
                                const nextCode = e.target
                                  .value as CanonicalPitchResult;
                                updateSingleAtBat(editingAtBat.id, (prev) => {
                                  const nextPitches = [...prev.pitches];
                                  nextPitches[pIdx] = nextCode;
                                  const cnt = computeCountFromPitches(nextPitches);
                                  return {
                                    ...prev,
                                    pitches: nextPitches,
                                    balls: cnt.balls,
                                    strikes: cnt.strikes,
                                  };
                                });
                              }}
                              className={`h-7 px-2 rounded-lg border text-[11px] font-black ${meta.toneClass}`}
                            >
                              {PITCH_RESULT_PRESETS.map((opt) => (
                                <option key={opt.code} value={opt.code}>
                                  {opt.badgeLabel}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={pIdx === 0}
                              onClick={() =>
                                updateSingleAtBat(editingAtBat.id, (prev) => {
                                  const next = [...prev.pitches];
                                  [next[pIdx - 1], next[pIdx]] = [
                                    next[pIdx],
                                    next[pIdx - 1],
                                  ];
                                  const cnt = computeCountFromPitches(next);
                                  return {
                                    ...prev,
                                    pitches: next,
                                    balls: cnt.balls,
                                    strikes: cnt.strikes,
                                  };
                                })
                              }
                              className="p-1 rounded-md bg-muted disabled:opacity-30 cursor-pointer"
                            >
                              <ArrowLeft className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={pIdx === editingAtBat.pitches.length - 1}
                              onClick={() =>
                                updateSingleAtBat(editingAtBat.id, (prev) => {
                                  const next = [...prev.pitches];
                                  [next[pIdx], next[pIdx + 1]] = [
                                    next[pIdx + 1],
                                    next[pIdx],
                                  ];
                                  const cnt = computeCountFromPitches(next);
                                  return {
                                    ...prev,
                                    pitches: next,
                                    balls: cnt.balls,
                                    strikes: cnt.strikes,
                                  };
                                })
                              }
                              className="p-1 rounded-md bg-muted disabled:opacity-30 cursor-pointer"
                            >
                              <ArrowRight className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateSingleAtBat(editingAtBat.id, (prev) => {
                                  const next = prev.pitches.filter(
                                    (_, i) => i !== pIdx
                                  );
                                  const cnt = computeCountFromPitches(next);
                                  return {
                                    ...prev,
                                    pitches: next,
                                    balls: cnt.balls,
                                    strikes: cnt.strikes,
                                  };
                                })
                              }
                              className="p-1 text-destructive cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 末尾に1球ワンタップ追加 */}
                  <div className="pt-1 space-y-1">
                    <span className="text-[10px] font-bold text-muted-foreground block">
                      ＋ 末尾に1球追加
                    </span>
                    <div className="grid grid-cols-4 gap-1">
                      {PITCH_RESULT_PRESETS.map((opt) => (
                        <button
                          key={opt.code}
                          type="button"
                          onClick={() =>
                            updateSingleAtBat(editingAtBat.id, (prev) => {
                              const next = [...prev.pitches, opt.code];
                              const cnt = computeCountFromPitches(next);
                              return {
                                ...prev,
                                pitches: next,
                                balls: cnt.balls,
                                strikes: cnt.strikes,
                              };
                            })
                          }
                          className={`py-1.5 px-1 rounded-lg border text-[10px] font-black active:scale-95 cursor-pointer ${opt.toneClass}`}
                        >
                          +{opt.shortLabel}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 4. 走者進塁・盗塁・本塁生還エディタ */}
                <div className="p-3 rounded-2xl bg-muted/35 border border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-foreground">
                      走者進塁・盗塁・生還 ({editingAtBat.advances.length}件)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const newAdv: ScorebookV2Advance = {
                          id: crypto.randomUUID(),
                          runnerName: editingAtBat.batterName,
                          from: "1B",
                          to: "2B",
                          method: "steal",
                          isOut: false,
                        };
                        updateSingleAtBat(editingAtBat.id, (prev) => ({
                          ...prev,
                          advances: [...prev.advances, newAdv],
                        }));
                      }}
                      className="px-2 py-1 rounded-lg bg-primary/12 text-primary text-[10px] font-black flex items-center gap-0.5 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>進塁/盗塁追加</span>
                    </button>
                  </div>

                  {editingAtBat.advances.map((adv) => (
                    <div
                      key={adv.id}
                      className="grid grid-cols-12 gap-1 items-center p-1.5 rounded-xl bg-card border border-border"
                    >
                      <input
                        type="text"
                        value={adv.runnerName}
                        onChange={(e) =>
                          updateSingleAtBat(editingAtBat.id, (prev) => ({
                            ...prev,
                            advances: prev.advances.map((a) =>
                              a.id === adv.id
                                ? { ...a, runnerName: e.target.value }
                                : a
                            ),
                          }))
                        }
                        placeholder="走者名"
                        className="col-span-3 h-8 px-1.5 rounded-lg bg-muted/40 border border-border text-[10px] font-black"
                      />

                      <select
                        value={adv.from}
                        onChange={(e) =>
                          updateSingleAtBat(editingAtBat.id, (prev) => ({
                            ...prev,
                            advances: prev.advances.map((a) =>
                              a.id === adv.id
                                ? {
                                    ...a,
                                    from: e.target.value as
                                      | "BAT"
                                      | "1B"
                                      | "2B"
                                      | "3B",
                                  }
                                : a
                            ),
                          }))
                        }
                        className="col-span-2 h-8 px-1 rounded-lg bg-muted/40 border border-border text-[10px] font-black"
                      >
                        <option value="BAT">打者</option>
                        <option value="1B">1塁</option>
                        <option value="2B">2塁</option>
                        <option value="3B">3塁</option>
                      </select>

                      <select
                        value={adv.to}
                        onChange={(e) =>
                          updateSingleAtBat(editingAtBat.id, (prev) => ({
                            ...prev,
                            advances: prev.advances.map((a) =>
                              a.id === adv.id
                                ? {
                                    ...a,
                                    to: e.target.value as
                                      | "1B"
                                      | "2B"
                                      | "3B"
                                      | "HP",
                                  }
                                : a
                            ),
                          }))
                        }
                        className="col-span-2 h-8 px-1 rounded-lg bg-muted/40 border border-border text-[10px] font-black"
                      >
                        <option value="1B">→1塁</option>
                        <option value="2B">→2塁</option>
                        <option value="3B">→3塁</option>
                        <option value="HP">→本塁</option>
                      </select>

                      <select
                        value={adv.method}
                        onChange={(e) => {
                          const m = e.target.value as AdvanceMethodCode;
                          const autoOut =
                            m === "caught_stealing" ||
                            m === "pickoff_out" ||
                            m === "out_on_base";
                          updateSingleAtBat(editingAtBat.id, (prev) => ({
                            ...prev,
                            advances: prev.advances.map((a) =>
                              a.id === adv.id
                                ? { ...a, method: m, isOut: autoOut }
                                : a
                            ),
                          }));
                        }}
                        className="col-span-4 h-8 px-1 rounded-lg bg-muted/40 border border-border text-[10px] font-black"
                      >
                        {(
                          Object.keys(
                            ADVANCE_METHOD_LABELS
                          ) as AdvanceMethodCode[]
                        ).map((k) => (
                          <option key={k} value={k}>
                            {ADVANCE_METHOD_LABELS[k]}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() =>
                          updateSingleAtBat(editingAtBat.id, (prev) => ({
                            ...prev,
                            advances: prev.advances.filter(
                              (a) => a.id !== adv.id
                            ),
                          }))
                        }
                        className="col-span-1 flex justify-center text-destructive cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* 打席削除 */}
                <div className="flex justify-between items-center pt-1">
                  <button
                    type="button"
                    onClick={() => handleDeleteAtBat(editingAtBat.id)}
                    className="px-3 py-2 rounded-xl text-xs font-black text-destructive hover:bg-destructive/10 flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>この打席を削除</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditingAtBatId(null)}
                    className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black cursor-pointer"
                  >
                    完了して閉じる
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

