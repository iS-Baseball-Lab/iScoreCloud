// filepath: src/app/liff/tools/scorebook-import/_components/Step1MatchAndImages.tsx
"use client";

import React, { useState } from "react";
import {
  Camera,
  ImagePlus,
  RotateCw,
  Sparkles,
  Plus,
  Calendar,
  CheckCircle2,
  Trash2,
  Crop,
  ChevronDown,
  ChevronUp,
  Loader2,
  BookOpen,
} from "lucide-react";
import type {
  ImportScopeMode,
  ScorebookMatchSummary,
} from "@/types/scorebook-v2";
import type { PreprocessedScorebookImage } from "@/lib/liff/scorebook-image";

export interface SheetImageState {
  file: File | null;
  rotationDeg: 0 | 90 | 180 | 270;
  enhancePencil: boolean;
  cropTop: number;
  cropBottom: number;
  cropLeft: number;
  cropRight: number;
  processed: PreprocessedScorebookImage | null;
  isProcessing: boolean;
}

interface Step1MatchAndImagesProps {
  matches: ScorebookMatchSummary[];
  selectedMatchId: string;
  onSelectMatchId: (id: string) => void;
  onCreateMatch: (payload: {
    opponent: string;
    date: string;
    matchType: "official" | "practice" | "exchange";
    tournamentName: string;
    battingOrder: "first" | "second";
    innings: number;
  }) => Promise<void>;
  isCreatingMatch: boolean;
  importScope: ImportScopeMode;
  onChangeImportScope: (scope: ImportScopeMode) => void;
  topImage: SheetImageState;
  bottomImage: SheetImageState;
  onSelectSheetFile: (isTop: boolean, file: File | null) => void;
  onRotateSheet: (isTop: boolean) => void;
  onToggleEnhance: (isTop: boolean) => void;
  onUpdateCrop: (
    isTop: boolean,
    edge: "cropTop" | "cropBottom" | "cropLeft" | "cropRight",
    val: number
  ) => void;
  teamLegendUrl: string | null;
  legendOverrideDataUrl: string | null;
  onSelectLegendOverride: (file: File | null) => void;
  onStartAnalyzeStructure: () => void;
  isAnalyzingStructure: boolean;
  structureProgressLabel?: string;
}

export function Step1MatchAndImages({
  matches,
  selectedMatchId,
  onSelectMatchId,
  onCreateMatch,
  isCreatingMatch,
  importScope,
  onChangeImportScope,
  topImage,
  bottomImage,
  onSelectSheetFile,
  onRotateSheet,
  onToggleEnhance,
  onUpdateCrop,
  teamLegendUrl,
  legendOverrideDataUrl,
  onSelectLegendOverride,
  onStartAnalyzeStructure,
  isAnalyzingStructure,
  structureProgressLabel,
}: Step1MatchAndImagesProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newOpponent, setNewOpponent] = useState("");
  const [newDate, setNewDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [newMatchType, setNewMatchType] = useState<
    "official" | "practice" | "exchange"
  >("practice");
  const [newTournamentName, setNewTournamentName] = useState("");
  const [newBattingOrder, setNewBattingOrder] = useState<"first" | "second">(
    "first"
  );
  const [newInnings, setNewInnings] = useState<number>(7);

  const [openCropSide, setOpenCropSide] = useState<"top" | "bottom" | null>(
    null
  );

  const selectedMatch = matches.find((m) => m.id === selectedMatchId) || null;
  const isMyTeamFirst = selectedMatch
    ? selectedMatch.battingOrder === "first"
    : true;

  const needTop = importScope === "both" || importScope === "top_only";
  const needBottom = importScope === "both" || importScope === "bottom_only";

  const canProceed =
    Boolean(selectedMatchId) &&
    (!needTop || Boolean(topImage.processed)) &&
    (!needBottom || Boolean(bottomImage.processed)) &&
    !topImage.isProcessing &&
    !bottomImage.isProcessing &&
    !isAnalyzingStructure;

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOpponent.trim()) return;
    await onCreateMatch({
      opponent: newOpponent.trim(),
      date: newDate,
      matchType: newMatchType,
      tournamentName: newTournamentName.trim(),
      battingOrder: newBattingOrder,
      innings: newInnings,
    });
    setNewOpponent("");
    setShowCreateForm(false);
  };

  const renderSheetUploader = (isTop: boolean) => {
    const state = isTop ? topImage : bottomImage;
    const isMyTeamSide = (isTop && isMyTeamFirst) || (!isTop && !isMyTeamFirst);
    const sideTitle = isTop ? "先攻（表）シート" : "後攻（裏）シート";
    const teamBadge = selectedMatch
      ? isMyTeamSide
        ? "自チームの攻撃"
        : `相手（${selectedMatch.opponent}）の攻撃`
      : isTop
      ? "表の攻撃"
      : "裏の攻撃";
    const cropKey = isTop ? "top" : "bottom";
    const isCropOpen = openCropSide === cropKey;

    return (
      <div className="rounded-3xl bg-card border border-border shadow-xs p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black shrink-0 ${
                isMyTeamSide
                  ? "bg-primary/15 text-primary"
                  : "bg-slate-500/15 text-slate-700 dark:text-slate-300"
              }`}
            >
              {teamBadge}
            </span>
            <h3 className="text-sm font-black text-foreground truncate">
              {sideTitle}
            </h3>
          </div>

          {state.processed && (
            <button
              type="button"
              onClick={() => onSelectSheetFile(isTop, null)}
              className="p-1.5 rounded-xl text-destructive hover:bg-destructive/10 transition-all cursor-pointer"
              title="画像を削除"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {!state.file ? (
          <div className="rounded-2xl border-2 border-dashed border-indigo-500/35 bg-indigo-500/5 p-5 flex flex-col items-center text-center space-y-3">
            <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
              1ページ（片面）全体が枠いっぱいに入るよう、影を避けて真上から撮影してください
            </p>
            <div className="grid grid-cols-2 gap-2.5 w-full">
              <label className="py-3 px-3 rounded-2xl bg-primary text-primary-foreground font-black text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer">
                <Camera className="w-4 h-4 shrink-0" />
                <span>カメラ撮影</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) =>
                    onSelectSheetFile(isTop, e.target.files?.[0] || null)
                  }
                  className="hidden"
                />
              </label>

              <label className="py-3 px-3 rounded-2xl bg-card border border-border text-foreground font-black text-xs flex items-center justify-center gap-1.5 shadow-2xs hover:bg-muted/60 active:scale-95 transition-all cursor-pointer">
                <ImagePlus className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>アルバム選択</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    onSelectSheetFile(isTop, e.target.files?.[0] || null)
                  }
                  className="hidden"
                />
              </label>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* プレビュー画像 */}
            <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-border aspect-4/3 flex items-center justify-center">
              {state.isProcessing || !state.processed ? (
                <div className="flex flex-col items-center gap-2 text-white">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                  <span className="text-[11px] font-bold">
                    高精細コントラスト最適化中...
                  </span>
                </div>
              ) : (
                <img
                  src={state.processed.dataUrl}
                  alt={sideTitle}
                  className="w-full h-full object-contain"
                />
              )}
              {state.processed && (
                <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/70 text-white text-[9px] font-bold">
                  {state.processed.width}×{state.processed.height}px
                </span>
              )}
            </div>

            {/* 回転・鉛筆くっきり補正・トリミング操作バー */}
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => onRotateSheet(isTop)}
                className="py-2 px-2 rounded-xl bg-muted hover:bg-muted/80 border border-border text-[11px] font-black text-foreground flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5 text-primary" />
                <span>90°回転</span>
              </button>

              <button
                type="button"
                onClick={() => onToggleEnhance(isTop)}
                className={`py-2 px-2 rounded-xl border text-[11px] font-black flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer ${
                  state.enhancePencil
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-muted text-muted-foreground border-border"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {state.enhancePencil ? "くっきりON" : "補正OFF"}
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setOpenCropSide(isCropOpen ? null : cropKey)
                }
                className="py-2 px-2 rounded-xl bg-muted hover:bg-muted/80 border border-border text-[11px] font-black text-foreground flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer"
              >
                <Crop className="w-3.5 h-3.5 text-primary" />
                <span>余白カット</span>
                {isCropOpen ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>
            </div>

            {/* 余白トリミングスライダー */}
            {isCropOpen && (
              <div className="p-3 rounded-2xl bg-muted/50 border border-border space-y-2.5">
                <p className="text-[10px] font-bold text-muted-foreground">
                  机の背景やリング金具など不要な端をカットすると文字の認識精度が上がります（0〜30%）
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      { key: "cropTop", label: "上端カット" },
                      { key: "cropBottom", label: "下端カット" },
                      { key: "cropLeft", label: "左端カット" },
                      { key: "cropRight", label: "右端カット" },
                    ] as const
                  ).map((edge) => (
                    <div key={edge.key} className="space-y-1">
                      <div className="flex justify-between text-[10px] font-black text-foreground">
                        <span>{edge.label}</span>
                        <span>{Math.round(state[edge.key] * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={30}
                        step={2}
                        value={Math.round(state[edge.key] * 100)}
                        onChange={(e) =>
                          onUpdateCrop(
                            isTop,
                            edge.key,
                            Number(e.target.value) / 100
                          )
                        }
                        className="w-full accent-indigo-600"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* ① 対象試合の選択・新規作成 */}
      <section className="rounded-3xl bg-card border border-border shadow-xs p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[11px] font-black flex items-center justify-center">
              1
            </span>
            <h2 className="text-sm font-black text-foreground">
              取り込み先の試合を選択
            </h2>
          </div>

          <button
            type="button"
            onClick={() => setShowCreateForm((prev) => !prev)}
            className="px-2.5 py-1.5 rounded-xl bg-primary/12 text-primary text-[11px] font-black flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{showCreateForm ? "閉じる" : "新規試合を作成"}</span>
          </button>
        </div>

        {!showCreateForm ? (
          <div className="space-y-2">
            {matches.length === 0 ? (
              <div className="p-4 rounded-2xl bg-muted/50 border border-border text-center space-y-2">
                <p className="text-xs font-bold text-muted-foreground">
                  まだ試合が登録されていません。「新規試合を作成」から試合枠を作成してください。
                </p>
              </div>
            ) : (
              <div className="relative">
                <select
                  value={selectedMatchId}
                  onChange={(e) => onSelectMatchId(e.target.value)}
                  className="w-full h-11 pl-3.5 pr-9 rounded-2xl bg-muted/50 border border-border text-xs font-black text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40 appearance-none cursor-pointer"
                >
                  {matches.map((m) => {
                    const orderTag =
                      m.battingOrder === "first" ? "自チーム先攻" : "自チーム後攻";
                    const importedTag = m.hasExistingAtBats ? " [記録あり]" : "";
                    return (
                      <option key={m.id} value={m.id}>
                        {m.date} vs {m.opponent}（{orderTag}）{importedTag}
                      </option>
                    );
                  })}
                </select>
                <Calendar className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            )}

            {selectedMatch && (
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-muted/35 border border-border/60 text-[11px] font-bold">
                <span className="text-muted-foreground">
                  先攻/後攻設定:{" "}
                  <strong className="text-foreground font-black">
                    {selectedMatch.battingOrder === "first"
                      ? "自チームが【先攻（表）】"
                      : "自チームが【後攻（裏）】"}
                  </strong>
                </span>
                <span className="text-muted-foreground">
                  {selectedMatch.tournamentName || "OP戦"}
                </span>
              </div>
            )}
          </div>
        ) : (
          <form
            onSubmit={handleCreateSubmit}
            className="p-3.5 rounded-2xl bg-muted/40 border border-border space-y-3"
          >
            <div className="grid grid-cols-2 gap-2.5">
              <div className="col-span-2 space-y-1">
                <label className="text-[10px] font-black text-muted-foreground">
                  対戦相手チーム名 *
                </label>
                <input
                  type="text"
                  required
                  value={newOpponent}
                  onChange={(e) => setNewOpponent(e.target.value)}
                  placeholder="例: 青葉スターズ"
                  className="w-full h-10 px-3 rounded-xl bg-card border border-border text-xs font-bold text-foreground"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-muted-foreground">
                  試合日
                </label>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full h-10 px-2.5 rounded-xl bg-card border border-border text-xs font-bold text-foreground"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-muted-foreground">
                  試合種別
                </label>
                <select
                  value={newMatchType}
                  onChange={(e) =>
                    setNewMatchType(
                      e.target.value as "official" | "practice" | "exchange"
                    )
                  }
                  className="w-full h-10 px-2.5 rounded-xl bg-card border border-border text-xs font-bold text-foreground"
                >
                  <option value="practice">OP戦（練習試合）</option>
                  <option value="official">公式戦</option>
                  <option value="exchange">交流戦</option>
                </select>
              </div>

              {newMatchType !== "practice" && (
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-black text-muted-foreground">
                    大会名
                  </label>
                  <input
                    type="text"
                    value={newTournamentName}
                    onChange={(e) => setNewTournamentName(e.target.value)}
                    placeholder="例: 春季区民大会"
                    className="w-full h-10 px-3 rounded-xl bg-card border border-border text-xs font-bold text-foreground"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-black text-muted-foreground">
                  自チームの先攻・後攻
                </label>
                <select
                  value={newBattingOrder}
                  onChange={(e) =>
                    setNewBattingOrder(e.target.value as "first" | "second")
                  }
                  className="w-full h-10 px-2.5 rounded-xl bg-card border border-border text-xs font-bold text-foreground"
                >
                  <option value="first">自チームが先攻（表）</option>
                  <option value="second">自チームが後攻（裏）</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-muted-foreground">
                  規定イニング
                </label>
                <select
                  value={newInnings}
                  onChange={(e) => setNewInnings(Number(e.target.value))}
                  className="w-full h-10 px-2.5 rounded-xl bg-card border border-border text-xs font-bold text-foreground"
                >
                  <option value={6}>6回制（学童等）</option>
                  <option value={7}>7回制（中学・草野球）</option>
                  <option value={9}>9回制</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={isCreatingMatch || !newOpponent.trim()}
              className="w-full h-10 rounded-xl bg-primary text-primary-foreground font-black text-xs flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {isCreatingMatch ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>作成中...</span>
                </>
              ) : (
                <span>この試合枠を作成して選択</span>
              )}
            </button>
          </form>
        )}
      </section>

      {/* ② 取り込み単位の選択（2枚セット / 片面のみ） */}
      <section className="rounded-3xl bg-card border border-border shadow-xs p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[11px] font-black flex items-center justify-center">
            2
          </span>
          <h2 className="text-sm font-black text-foreground">
            取り込むスコアシートの範囲
          </h2>
        </div>

        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-muted/70 border border-border/60">
          {(
            [
              { id: "both" as const, label: "先攻＋後攻 (2枚)" },
              { id: "top_only" as const, label: "先攻シートのみ" },
              { id: "bottom_only" as const, label: "後攻シートのみ" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChangeImportScope(opt.id)}
              className={`py-2 px-1.5 rounded-xl text-[11px] transition-all cursor-pointer ${
                importScope === opt.id
                  ? "bg-card text-foreground font-black shadow-2xs"
                  : "text-muted-foreground font-bold"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {importScope !== "both" && (
          <p className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 px-1">
            💡 片面のみ保存モード：反対側のイニング・打席データが既に入っていても消さずにマージ保存します。
          </p>
        )}
      </section>

      {/* ③ シート画像アップロード＆前処理 */}
      <div className="space-y-3">
        {needTop && renderSheetUploader(true)}
        {needBottom && renderSheetUploader(false)}
      </div>

      {/* ④ 記号早見表（レジェンド）連携ステータス */}
      <section className="rounded-3xl bg-card border border-border shadow-xs p-4 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className="w-4 h-4 text-indigo-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-black text-foreground">
                スコア記号早見表の参照（任意）
              </p>
              <p className="text-[10px] font-bold text-muted-foreground truncate">
                {legendOverrideDataUrl
                  ? "今回指定した早見表画像を最優先で適用します"
                  : teamLegendUrl
                  ? "チーム設定に登録済みの記号早見表を自動適用します"
                  : "標準の早稲田式・成美堂式ルールで解析します"}
              </p>
            </div>
          </div>

          <label className="px-2.5 py-1.5 rounded-xl bg-muted hover:bg-muted/80 border border-border text-[10px] font-black text-foreground shrink-0 cursor-pointer">
            {legendOverrideDataUrl ? "変更" : "早見表を添付"}
            <input
              type="file"
              accept="image/*"
              onChange={(e) =>
                onSelectLegendOverride(e.target.files?.[0] || null)
              }
              className="hidden"
            />
          </label>
        </div>

        {(legendOverrideDataUrl || teamLegendUrl) && (
          <div className="flex items-center gap-2 text-[10px] font-black text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>チーム固有の安打・投球・進塁記号ルールを参照して解析します</span>
          </div>
        )}
      </section>

      {/* 解析開始ボタン */}
      <button
        type="button"
        disabled={!canProceed}
        onClick={onStartAnalyzeStructure}
        className="w-full h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-45 text-white font-black text-sm shadow-md flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer disabled:cursor-not-allowed"
      >
        {isAnalyzingStructure ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin shrink-0" />
            <span className="truncate">
              {structureProgressLabel ||
                "AIが打順・途中交代・各回得点をスキャン中..."}
            </span>
          </>
        ) : (
          <>
            <Sparkles className="w-5 h-5" />
            <span>AI骨格スキャンを開始（STEP 2へ）</span>
          </>
        )}
      </button>
    </div>
  );
}

