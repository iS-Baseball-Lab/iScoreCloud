// filepath: src/app/liff/tools/scorebook-import/_components/Step1MatchAndImages.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
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
  Settings,
  X,
  AlertCircle,
  Scan,
  RotateCcw,
  ExternalLink,
  ClipboardPaste,
} from "lucide-react";
import { useLiff } from "@/components/liff/LiffProvider";
import { ScorebookCameraModal } from "@/components/liff/ScorebookCameraModal";
import { ScorebookPasteModal } from "@/components/liff/ScorebookPasteModal";
import {
  isAndroidClientDevice,
  openCurrentPageInExternalBrowser,
} from "@/lib/liff/liff-client";
import { loadLiffScoreSettings } from "@/lib/liff/score-settings";
import { bilinearGridPoint, clamp1000 } from "@/lib/liff/scorebook-grid";
import { ActionStatusBanner } from "./ActionStatusBanner";
import type {
  ImportScopeMode,
  NormalizedPoint,
  ScorebookGridCorners,
  ScorebookMatchSummary,
} from "@/types/scorebook-v2";
import type { PreprocessedScorebookImage } from "@/lib/liff/scorebook-image";

const DEFAULT_PERSPECTIVE_CORNERS: ScorebookGridCorners = {
  tl: [35, 35],
  tr: [965, 35],
  br: [965, 965],
  bl: [35, 965],
};

export interface SheetImageState {
  file: File | null;
  rotationDeg: 0 | 90 | 180 | 270;
  fineTiltDeg: number;
  perspectiveCorners: ScorebookGridCorners | null;
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
  onUpdateFineTilt: (isTop: boolean, deg: number) => void;
  onUpdatePerspectiveCorners: (
    isTop: boolean,
    corners: ScorebookGridCorners | null
  ) => void;
  teamLegendUrl: string | null;
  legendOverrideDataUrl: string | null;
  isLegendProcessing?: boolean;
  onSelectLegendOverride: (file: File | null) => void;
  onNavigateScoreSettings?: () => void;
  onStartAnalyzeStructure: () => void;
  isAnalyzingStructure: boolean;
  structureProgressLabel?: string;
  errorMessage?: string | null;
  onDismissError?: () => void;
  onReportError?: (message: string) => void;
}

type ImagePickerTarget = "top" | "bottom" | "legend";

function isSupportedImageFile(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  if (
    mime === "application/pdf" ||
    mime.startsWith("video/") ||
    mime.startsWith("audio/") ||
    mime.startsWith("text/") ||
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    mime.includes("wordprocessing") ||
    mime.includes("presentation") ||
    mime === "application/zip"
  ) {
    return false;
  }
  if (
    /\.(pdf|xlsx?|xlsm|csv|docx?|pptx?|zip|mp4|mov|avi|mp3|wav|txt)$/i.test(
      name
    )
  ) {
    return false;
  }
  return true;
}

interface PerspectiveCornerEditorProps {
  previewUrl: string;
  appliedCorners: ScorebookGridCorners | null;
  isProcessing: boolean;
  onApply: (corners: ScorebookGridCorners) => void;
  onReset: () => void;
}

function PerspectiveCornerEditor({
  previewUrl,
  appliedCorners,
  isProcessing,
  onApply,
  onReset,
}: PerspectiveCornerEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<ScorebookGridCorners>(
    () => appliedCorners || DEFAULT_PERSPECTIVE_CORNERS
  );
  const [draggingKey, setDraggingKey] = useState<
    keyof ScorebookGridCorners | null
  >(null);

  useEffect(() => {
    setDraft(appliedCorners || DEFAULT_PERSPECTIVE_CORNERS);
  }, [appliedCorners]);

  const updatePointFromClient = (
    key: keyof ScorebookGridCorners,
    clientX: number,
    clientY: number
  ) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return;
    const nx = clamp1000(((clientX - rect.left) / rect.width) * 1000);
    const ny = clamp1000(((clientY - rect.top) / rect.height) * 1000);

    setDraft((prev) => {
      const next = { ...prev, [key]: [nx, ny] as NormalizedPoint };
      if (key === "tl") {
        next.tl = [
          Math.min(nx, prev.tr[0] - 120),
          Math.min(ny, prev.bl[1] - 140),
        ];
      } else if (key === "tr") {
        next.tr = [
          Math.max(nx, prev.tl[0] + 120),
          Math.min(ny, prev.br[1] - 140),
        ];
      } else if (key === "br") {
        next.br = [
          Math.max(nx, prev.bl[0] + 120),
          Math.max(ny, prev.tr[1] + 140),
        ];
      } else if (key === "bl") {
        next.bl = [
          Math.min(nx, prev.br[0] - 120),
          Math.max(ny, prev.tl[1] + 140),
        ];
      }
      return next;
    });
  };

  const handleMeta: Array<{
    key: keyof ScorebookGridCorners;
    label: string;
  }> = [
    { key: "tl", label: "左上" },
    { key: "tr", label: "右上" },
    { key: "br", label: "右下" },
    { key: "bl", label: "左下" },
  ];

  const polyPoints = `${draft.tl[0]},${draft.tl[1]} ${draft.tr[0]},${draft.tr[1]} ${draft.br[0]},${draft.br[1]} ${draft.bl[0]},${draft.bl[1]}`;

  return (
    <div className="space-y-2.5">
      <p className="text-[10px] font-bold text-foreground leading-relaxed">
        斜め撮影やバインダーの歪みがある場合、水色の●（4隅）を指でドラッグして<strong>スコアブック用紙の4隅（外枠角）</strong>に合わせ、「この4隅で真っ直ぐ補正」を押してください。
      </p>

      <div
        ref={containerRef}
        className="relative w-full rounded-xl overflow-hidden bg-slate-950 border-2 border-sky-500/60 select-none touch-none"
      >
        <img
          src={previewUrl}
          alt="4隅歪み補正プレビュー"
          className="w-full h-auto block pointer-events-none select-none"
        />

        <svg
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none"
        >
          {/* 外側マスク表現＆選択ポリゴン */}
          <polygon
            points={polyPoints}
            fill="rgba(14, 165, 233, 0.12)"
            stroke="#0ea5e9"
            strokeWidth="5"
          />
          {/* 3分割の歪み確認ガイド線 */}
          {[0.25, 0.5, 0.75].map((r) => {
            const hL = bilinearGridPoint(draft, 0, r);
            const hR = bilinearGridPoint(draft, 1, r);
            const vT = bilinearGridPoint(draft, r, 0);
            const vB = bilinearGridPoint(draft, r, 1);
            return (
              <g key={r}>
                <line
                  x1={hL[0]}
                  y1={hL[1]}
                  x2={hR[0]}
                  y2={hR[1]}
                  stroke="rgba(56, 189, 248, 0.7)"
                  strokeWidth="2.5"
                  strokeDasharray="10 8"
                />
                <line
                  x1={vT[0]}
                  y1={vT[1]}
                  x2={vB[0]}
                  y2={vB[1]}
                  stroke="rgba(56, 189, 248, 0.7)"
                  strokeWidth="2.5"
                  strokeDasharray="10 8"
                />
              </g>
            );
          })}
        </svg>

        {/* 指で掴みやすい大判4隅ドラッグハンドル */}
        {handleMeta.map(({ key, label }) => {
          const pt = draft[key];
          const isActive = draggingKey === key;
          return (
            <button
              key={key}
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                setDraggingKey(key);
              }}
              onPointerMove={(e) => {
                if (draggingKey !== key) return;
                e.preventDefault();
                updatePointFromClient(key, e.clientX, e.clientY);
              }}
              onPointerUp={(e) => {
                if (draggingKey === key) {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                  setDraggingKey(null);
                }
              }}
              onPointerCancel={() => setDraggingKey(null)}
              style={{
                left: `${pt[0] / 10}%`,
                top: `${pt[1] / 10}%`,
              }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full border-2 border-white shadow-md flex items-center justify-center text-[9px] font-black text-white touch-none cursor-grab active:cursor-grabbing transition-transform ${
                isActive ? "bg-amber-500 scale-125 z-20" : "bg-sky-600 z-10"
              }`}
              aria-label={`${label}ハンドル`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={isProcessing}
          onClick={() => onApply(draft)}
          className="flex-1 py-2.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-xs active:scale-98 transition-all cursor-pointer"
        >
          <Scan className="w-3.5 h-3.5" />
          <span>この4隅で真っ直ぐ補正</span>
        </button>

        {appliedCorners && (
          <button
            type="button"
            disabled={isProcessing}
            onClick={onReset}
            className="py-2.5 px-3 rounded-xl bg-card border border-border hover:bg-muted text-foreground text-xs font-black flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
            <span>解除</span>
          </button>
        )}
      </div>
    </div>
  );
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
  onUpdateFineTilt,
  onUpdatePerspectiveCorners,
  teamLegendUrl,
  legendOverrideDataUrl,
  isLegendProcessing = false,
  onSelectLegendOverride,
  onNavigateScoreSettings,
  onStartAnalyzeStructure,
  isAnalyzingStructure,
  structureProgressLabel,
  errorMessage,
  onDismissError,
  onReportError,
}: Step1MatchAndImagesProps) {
  const { isInClient, currentTeam } = useLiff();
  const [isAndroidClient, setIsAndroidClient] = useState(false);
  const lastCameraTargetRef = useRef<ImagePickerTarget>("top");
  const lastPasteTargetRef = useRef<ImagePickerTarget>("top");
  const pendingNativePickerRef = useRef<{
    target: ImagePickerTarget;
    openedAt: number;
    didBlur: boolean;
    resolved: boolean;
  } | null>(null);
  const [cameraTarget, setCameraTarget] = useState<ImagePickerTarget | null>(
    null
  );
  const [pasteTarget, setPasteTarget] = useState<ImagePickerTarget | null>(
    null
  );
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

  useEffect(() => {
    const saved = loadLiffScoreSettings();
    setNewInnings(saved.defaultInnings);
    setNewMatchType(saved.defaultMatchType);
    setIsAndroidClient(isAndroidClientDevice());
  }, []);

  // Android LINE内ブラウザでネイティブファイル選択が透過Activity競合で開けず、別アプリ切替で復帰した場合に自動で貼り付けモーダルを案内
  useEffect(() => {
    if (!isAndroidClient || !isInClient) return;

    const handleBlur = () => {
      if (pendingNativePickerRef.current) {
        pendingNativePickerRef.current.didBlur = true;
      }
    };

    const handleReturn = () => {
      if (document.visibilityState && document.visibilityState !== "visible") {
        return;
      }
      const pending = pendingNativePickerRef.current;
      if (!pending || !pending.didBlur || pending.resolved) return;

      window.setTimeout(() => {
        const latest = pendingNativePickerRef.current;
        if (!latest || latest.resolved) return;
        const inputEl = document.getElementById(
          latest.target === "top"
            ? "scorebook-sheet-top-file-input"
            : latest.target === "bottom"
            ? "scorebook-sheet-bottom-file-input"
            : "scorebook-legend-override-file-input"
        ) as HTMLInputElement | null;
        if (inputEl?.files && inputEl.files.length > 0) return;
        pendingNativePickerRef.current = null;
        // 30秒以内にファイル未選択でアプリ切替復帰した場合、フリーズしない貼り付け/Chrome引継モーダルを自動表示
        if (Date.now() - latest.openedAt < 30000) {
          lastPasteTargetRef.current = latest.target;
          setPasteTarget(latest.target);
        }
      }, 1200);
    };

    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleReturn);
    document.addEventListener("visibilitychange", handleReturn);
    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleReturn);
      document.removeEventListener("visibilitychange", handleReturn);
    };
  }, [isAndroidClient, isInClient]);

  const [openCropSide, setOpenCropSide] = useState<"top" | "bottom" | null>(
    null
  );
  const [adjustTab, setAdjustTab] = useState<"perspective" | "tilt_crop">(
    "perspective"
  );

  // Android 15/16 + LINEミニアプリ(透過シートActivity)環境では、accept="image/*" を使うと
  // OSの透過PhotoPickerActivityが多重起動して画面タッチがフリーズ（別アプリ切替で解除される現象）が起きるため、
  // Androidでは "*/*" を指定して不透過フルスクリーンの標準ファイル選択（DocumentsUI）を起動する
  const fileAcceptAttr = isAndroidClient ? "*/*" : "image/*";

  const SHEET_TOP_INPUT_ID = "scorebook-sheet-top-file-input";
  const SHEET_BOTTOM_INPUT_ID = "scorebook-sheet-bottom-file-input";
  const LEGEND_OVERRIDE_INPUT_ID = "scorebook-legend-override-file-input";

  const getInputIdForTarget = (target: ImagePickerTarget): string => {
    if (target === "top") return SHEET_TOP_INPUT_ID;
    if (target === "bottom") return SHEET_BOTTOM_INPUT_ID;
    return LEGEND_OVERRIDE_INPUT_ID;
  };

  const openCameraModal = (target: ImagePickerTarget) => {
    lastCameraTargetRef.current = target;
    setCameraTarget(target);
  };

  const openPasteModal = (target: ImagePickerTarget) => {
    pendingNativePickerRef.current = null;
    lastPasteTargetRef.current = target;
    setPasteTarget(target);
  };

  const handleOpenInExternalChrome = () => {
    openCurrentPageInExternalBrowser({
      teamId: currentTeam?.id,
      matchId: selectedMatchId,
    });
  };

  const markNativePickerOpened = (target: ImagePickerTarget) => {
    if (!isAndroidClient || !isInClient) return;
    pendingNativePickerRef.current = {
      target,
      openedAt: Date.now(),
      didBlur: false,
      resolved: false,
    };
  };

  const dispatchPickedFile = (target: ImagePickerTarget, file: File) => {
    if (!isSupportedImageFile(file)) {
      onReportError?.(
        "PDF等の書類ではなく、スコアブックの写真（JPG・PNG画像）を選択してください"
      );
      return;
    }
    if (target === "top") {
      onSelectSheetFile(true, file);
    } else if (target === "bottom") {
      onSelectSheetFile(false, file);
    } else {
      onSelectLegendOverride(file);
    }
  };

  const handleNativeFileChange = (
    target: ImagePickerTarget,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (pendingNativePickerRef.current) {
      pendingNativePickerRef.current.resolved = true;
      pendingNativePickerRef.current = null;
    }
    setPasteTarget(null);
    const picked = e.currentTarget.files?.[0] ?? null;
    e.currentTarget.value = "";
    if (!picked) return;
    window.setTimeout(() => {
      dispatchPickedFile(target, picked);
    }, 60);
  };

  const handleCameraCaptured = (target: ImagePickerTarget, file: File) => {
    dispatchPickedFile(target, file);
  };

  const selectedMatch = matches.find((m) => m.id === selectedMatchId) || null;
  const isMyTeamFirst = selectedMatch
    ? selectedMatch.battingOrder === "first"
    : true;

  const needTop = importScope === "both" || importScope === "top_only";
  const needBottom = importScope === "both" || importScope === "bottom_only";

  const isPreprocessingAny =
    (needTop && topImage.isProcessing) ||
    (needBottom && bottomImage.isProcessing) ||
    isLegendProcessing;

  const preprocessingDetail =
    topImage.isProcessing && bottomImage.isProcessing
      ? "先攻・後攻シートの回転・余白カット・文字くっきり補正を適用しています..."
      : topImage.isProcessing
      ? "先攻（表）シートの高精細画像を準備しています..."
      : bottomImage.isProcessing
      ? "後攻（裏）シートの高精細画像を準備しています..."
      : "スコア記号早見表の画像を読み込んでいます...";

  const canProceed =
    Boolean(selectedMatchId) &&
    (!needTop || Boolean(topImage.processed)) &&
    (!needBottom || Boolean(bottomImage.processed)) &&
    !topImage.isProcessing &&
    !bottomImage.isProcessing &&
    !isLegendProcessing &&
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
    const isControlsDisabled = state.isProcessing || isAnalyzingStructure;

    const targetKey: ImagePickerTarget = isTop ? "top" : "bottom";
    const sheetInputId = isTop ? SHEET_TOP_INPUT_ID : SHEET_BOTTOM_INPUT_ID;

    return (
      <div className="relative rounded-3xl bg-card border border-border shadow-xs p-4 space-y-3">
        {/* カード内同位置に常駐するファイル入力（スクロールジャンプゼロ＆アンマウントゼロ） */}
        <input
          id={sheetInputId}
          type="file"
          accept={fileAcceptAttr}
          onChange={(e) => handleNativeFileChange(targetKey, e)}
          className="sr-only"
        />

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

          {(state.isProcessing || state.processed || state.file) && (
            <button
              type="button"
              disabled={isAnalyzingStructure}
              onClick={() => onSelectSheetFile(isTop, null)}
              className="px-2.5 py-1 rounded-xl bg-destructive/10 hover:bg-destructive/18 border border-destructive/25 text-destructive text-[10px] font-black flex items-center gap-1 shrink-0 transition-colors cursor-pointer disabled:opacity-50"
              title={state.isProcessing ? "処理を中断してクリア" : "画像を削除"}
            >
              {state.isProcessing ? (
                <>
                  <X className="w-3.5 h-3.5" />
                  <span>中断</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>削除</span>
                </>
              )}
            </button>
          )}
        </div>

        {!state.processed && !state.isProcessing ? (
          <div className="rounded-2xl border-2 border-dashed border-indigo-500/35 bg-indigo-500/5 p-5 flex flex-col items-center text-center space-y-3">
            <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
              1ページ（片面）全体が枠いっぱいに入るよう、影を避けて真上から撮影してください
            </p>
            <div className="grid grid-cols-2 gap-2.5 w-full">
              <button
                type="button"
                disabled={isControlsDisabled}
                onClick={() => openCameraModal(targetKey)}
                className="py-3 px-3 rounded-2xl bg-primary text-primary-foreground font-black text-xs flex items-center justify-center gap-1.5 shadow-xs hover:opacity-95 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Camera className="w-4 h-4 shrink-0" />
                <span>カメラ撮影</span>
              </button>

              {isControlsDisabled ? (
                <span
                  aria-disabled="true"
                  className="py-3 px-3 rounded-2xl bg-card border border-border text-foreground font-black text-xs flex items-center justify-center gap-1.5 opacity-50 cursor-not-allowed"
                >
                  <ImagePlus className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span>アルバム選択</span>
                </span>
              ) : (
                <label
                  htmlFor={sheetInputId}
                  onClick={() => markNativePickerOpened(targetKey)}
                  className="py-3 px-3 rounded-2xl bg-card border border-border text-foreground font-black text-xs flex items-center justify-center gap-1.5 shadow-2xs hover:bg-muted/60 active:scale-95 transition-all cursor-pointer"
                >
                  <ImagePlus className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span>アルバム選択</span>
                </label>
              )}
            </div>

            {isAndroidClient && isInClient && (
              <button
                type="button"
                disabled={isControlsDisabled}
                onClick={() => openPasteModal(targetKey)}
                className="w-full py-2.5 px-3 rounded-2xl bg-indigo-500/10 hover:bg-indigo-500/18 border border-indigo-500/35 text-indigo-700 dark:text-indigo-300 font-black text-[11px] flex items-center justify-center gap-1.5 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
              >
                <ClipboardPaste className="w-3.5 h-3.5 shrink-0" />
                <span>コピーした写真を貼り付け（LINE内で固まらない）</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* プレビュー画像 */}
            <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-border aspect-4/3 flex items-center justify-center">
              {!state.processed ? (
                <div className="flex flex-col items-center gap-2.5 text-white px-4 text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                  <span className="text-[11px] font-bold">
                    高精細画像を準備中...
                  </span>
                </div>
              ) : (
                <>
                  <img
                    src={state.processed.dataUrl}
                    alt={sideTitle}
                    className={`w-full h-full object-contain transition-opacity ${
                      state.isProcessing ? "opacity-65" : "opacity-100"
                    }`}
                  />
                  {/* 傾き微調整中は水平確認用の水色ガイドラインをオーバーレイ表示 */}
                  {isCropOpen && adjustTab === "tilt_crop" && (
                    <div className="absolute inset-0 pointer-events-none flex flex-col justify-evenly">
                      {[1, 2, 3, 4, 5].map((lineNo) => (
                        <div
                          key={lineNo}
                          className="w-full border-t border-dashed border-sky-400/75"
                        />
                      ))}
                    </div>
                  )}
                  {state.isProcessing && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="px-3 py-1.5 rounded-full bg-slate-900/90 border border-slate-700 text-white text-[11px] font-black flex items-center gap-1.5 shadow-md">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                        <span>補正を反映中...</span>
                      </div>
                    </div>
                  )}
                </>
              )}
              {state.processed && (
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
                  <div className="flex items-center gap-1">
                    {state.perspectiveCorners && (
                      <span className="px-2 py-0.5 rounded-md bg-sky-600 text-white text-[9px] font-black shadow-2xs">
                        4隅歪み補正済
                      </span>
                    )}
                    {Math.abs(state.fineTiltDeg) >= 0.1 && (
                      <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[9px] font-black shadow-2xs">
                        傾き{state.fineTiltDeg > 0 ? `+${state.fineTiltDeg}` : state.fineTiltDeg}°
                      </span>
                    )}
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-black/75 text-white text-[9px] font-bold">
                    {state.processed.width}×{state.processed.height}px
                  </span>
                </div>
              )}
            </div>

            {/* 回転・鉛筆くっきり補正・歪み＆余白補正バー */}
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                disabled={isControlsDisabled}
                onClick={() => onRotateSheet(isTop)}
                className="py-2 px-2 rounded-xl bg-muted hover:bg-muted/80 disabled:opacity-50 border border-border text-[11px] font-black text-foreground flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                <RotateCw className="w-3.5 h-3.5 text-primary" />
                <span>90°回転</span>
              </button>

              <button
                type="button"
                disabled={isControlsDisabled}
                onClick={() => onToggleEnhance(isTop)}
                className={`py-2 px-2 rounded-xl border text-[11px] font-black flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  state.enhancePencil
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-muted text-foreground border-border"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0 text-indigo-500" />
                <span className="truncate">
                  {state.enhancePencil ? "濃さ強調ON" : "原本高精細"}
                </span>
              </button>

              <button
                type="button"
                disabled={isControlsDisabled}
                onClick={() =>
                  setOpenCropSide(isCropOpen ? null : cropKey)
                }
                className={`py-2 px-2 rounded-xl border text-[11px] font-black flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  state.perspectiveCorners ||
                  Math.abs(state.fineTiltDeg) >= 0.1 ||
                  state.cropTop > 0 ||
                  state.cropBottom > 0 ||
                  state.cropLeft > 0 ||
                  state.cropRight > 0
                    ? "bg-sky-600 text-white border-sky-600"
                    : "bg-muted hover:bg-muted/80 text-foreground border-border"
                }`}
              >
                <Crop className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">歪み・余白</span>
                {isCropOpen ? (
                  <ChevronUp className="w-3 h-3 shrink-0" />
                ) : (
                  <ChevronDown className="w-3 h-3 shrink-0" />
                )}
              </button>
            </div>

            {/* 撮り直し・別画像への差し替えクイックバー */}
            {state.processed && !state.isProcessing && (
              <div className="space-y-1.5">
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    disabled={isControlsDisabled}
                    onClick={() => openCameraModal(targetKey)}
                    className="py-1.5 px-2 rounded-xl bg-card hover:bg-muted border border-border text-[10px] font-black text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Camera className="w-3 h-3 text-primary shrink-0" />
                    <span>カメラで撮り直す</span>
                  </button>

                  {isControlsDisabled ? (
                    <span
                      aria-disabled="true"
                      className="py-1.5 px-2 rounded-xl bg-card border border-border text-[10px] font-black text-muted-foreground flex items-center justify-center gap-1 opacity-50 cursor-not-allowed"
                    >
                      <ImagePlus className="w-3 h-3 text-indigo-500 shrink-0" />
                      <span>別画像に変更</span>
                    </span>
                  ) : (
                    <label
                      htmlFor={sheetInputId}
                      onClick={() => markNativePickerOpened(targetKey)}
                      className="py-1.5 px-2 rounded-xl bg-card hover:bg-muted border border-border text-[10px] font-black text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 transition-colors cursor-pointer"
                    >
                      <ImagePlus className="w-3 h-3 text-indigo-500 shrink-0" />
                      <span>別画像に変更</span>
                    </label>
                  )}
                </div>

                {isAndroidClient && isInClient && (
                  <button
                    type="button"
                    disabled={isControlsDisabled}
                    onClick={() => openPasteModal(targetKey)}
                    className="w-full py-1.5 px-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/18 border border-indigo-500/30 text-[10px] font-black text-indigo-700 dark:text-indigo-300 flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <ClipboardPaste className="w-3 h-3 shrink-0" />
                    <span>コピーした写真を貼り付けて変更</span>
                  </button>
                )}
              </div>
            )}

            {/* 4隅台形・歪み補正 ＆ 傾き角度・余白カットパネル */}
            {isCropOpen && state.processed && (
              <div className="p-3 rounded-2xl bg-card border-2 border-sky-500/35 space-y-3 shadow-xs">
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-muted border border-border">
                  <button
                    type="button"
                    onClick={() => setAdjustTab("perspective")}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-black transition-all cursor-pointer ${
                      adjustTab === "perspective"
                        ? "bg-sky-600 text-white shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    4隅台形・歪み補正
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustTab("tilt_crop")}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-black transition-all cursor-pointer ${
                      adjustTab === "tilt_crop"
                        ? "bg-indigo-600 text-white shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    傾き角度・余白カット
                  </button>
                </div>

                {adjustTab === "perspective" ? (
                  <PerspectiveCornerEditor
                    previewUrl={
                      state.processed.unwarpedPreviewDataUrl ||
                      state.processed.dataUrl
                    }
                    appliedCorners={state.perspectiveCorners}
                    isProcessing={state.isProcessing}
                    onApply={(corners) =>
                      onUpdatePerspectiveCorners(isTop, corners)
                    }
                    onReset={() => onUpdatePerspectiveCorners(isTop, null)}
                  />
                ) : (
                  <div className="space-y-3">
                    {/* 微細な傾き角度補正 (-10° 〜 +10°) */}
                    <div className="p-2.5 rounded-xl bg-muted/60 border border-border space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-black text-foreground">
                        <span>傾き角度の水平補正（-10°〜+10°）</span>
                        <span className="text-indigo-600 dark:text-indigo-400">
                          {state.fineTiltDeg > 0
                            ? `+${state.fineTiltDeg.toFixed(1)}°`
                            : `${state.fineTiltDeg.toFixed(1)}°`}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={-10}
                        max={10}
                        step={0.5}
                        value={state.fineTiltDeg}
                        onChange={(e) =>
                          onUpdateFineTilt(isTop, Number(e.target.value))
                        }
                        className="w-full accent-indigo-600"
                      />
                      <div className="grid grid-cols-5 gap-1">
                        {[
                          { label: "-1°", delta: -1 },
                          { label: "-0.5°", delta: -0.5 },
                          { label: "0°に戻す", reset: true as const },
                          { label: "+0.5°", delta: 0.5 },
                          { label: "+1°", delta: 1 },
                        ].map((btn) => (
                          <button
                            key={btn.label}
                            type="button"
                            onClick={() => {
                              if ("reset" in btn && btn.reset) {
                                onUpdateFineTilt(isTop, 0);
                              } else if ("delta" in btn) {
                                const next = Math.max(
                                  -10,
                                  Math.min(
                                    10,
                                    Math.round(
                                      (state.fineTiltDeg + btn.delta) * 2
                                    ) / 2
                                  )
                                );
                                onUpdateFineTilt(isTop, next);
                              }
                            }}
                            className="py-1 px-1 rounded-lg bg-card border border-border hover:bg-muted text-[10px] font-black text-foreground active:scale-95 transition-all cursor-pointer"
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 上下左右余白トリミング */}
                    <div className="space-y-2">
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
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const activeCameraTitle =
    cameraTarget === "top"
      ? "先攻（表）シートを撮影"
      : cameraTarget === "bottom"
      ? "後攻（裏）シートを撮影"
      : "スコア記号早見表を撮影";

  const activePasteTitle =
    pasteTarget === "top"
      ? "先攻（表）シート写真を貼り付け"
      : pasteTarget === "bottom"
      ? "後攻（裏）シート写真を貼り付け"
      : "スコア記号早見表の写真を貼り付け";

  return (
    <div className="space-y-4">
      {/* アプリ内専用WebRTCカメラモーダル（<input capture> を使わないためAndroid LINEのFileChooserフリーズを完全回避） */}
      <ScorebookCameraModal
        isOpen={cameraTarget !== null}
        title={activeCameraTitle}
        fallbackInputId={getInputIdForTarget(
          cameraTarget ?? lastCameraTargetRef.current
        )}
        onClose={() => setCameraTarget(null)}
        onCapture={(file) => {
          handleCameraCaptured(lastCameraTargetRef.current, file);
        }}
      />

      {/* LINE内ブラウザでonShowFileChooserを一切呼ばずにアルバム写真を読み込むクリップボード貼り付けモーダル */}
      <ScorebookPasteModal
        isOpen={pasteTarget !== null}
        title={activePasteTitle}
        onClose={() => setPasteTarget(null)}
        onCapture={(file) => {
          dispatchPickedFile(lastPasteTargetRef.current, file);
        }}
        onOpenExternalBrowser={handleOpenInExternalChrome}
      />

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
                  <option value={5}>5回制（低学年等）</option>
                  <option value={6}>6回制（学童等）</option>
                  <option value={7}>7回制（中学・草野球）</option>
                  <option value={9}>9回制</option>
                </select>
              </div>
            </div>

            {errorMessage && !isAnalyzingStructure && (
              <div className="p-2.5 rounded-xl bg-card border border-destructive/50 flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                <p className="text-[11px] font-bold text-destructive leading-snug wrap-break-word">
                  {errorMessage}
                </p>
              </div>
            )}

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
      {isAndroidClient && isInClient && (
        <div className="p-3 rounded-2xl bg-card border border-sky-500/35 flex items-center justify-between gap-2.5 shadow-2xs">
          <p className="text-[10px] font-bold text-muted-foreground leading-relaxed">
            Android版LINEでアルバム選択が開かない機種では、下の
            <strong className="text-foreground font-black">
              「コピーした写真を貼り付け」
            </strong>
            または右の
            <strong className="text-foreground font-black">
              「Chromeで開く」
            </strong>
            で確実に読み込めます。
          </p>
          <button
            type="button"
            onClick={handleOpenInExternalChrome}
            className="px-2.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-[10px] font-black flex items-center gap-1 shrink-0 cursor-pointer active:scale-95 transition-all"
          >
            <ExternalLink className="w-3 h-3 shrink-0" />
            <span>Chromeで開く</span>
          </button>
        </div>
      )}

      <div className="space-y-3">
        {needTop && renderSheetUploader(true)}
        {needBottom && renderSheetUploader(false)}
      </div>

      {/* ④ 記号早見表（スコア設定との自動連携） */}
      <section className="relative rounded-3xl bg-card border border-border shadow-xs p-4 space-y-3">
        <input
          id={LEGEND_OVERRIDE_INPUT_ID}
          type="file"
          accept={fileAcceptAttr}
          onChange={(e) => handleNativeFileChange("legend", e)}
          className="sr-only"
        />

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className="w-4 h-4 text-indigo-500 shrink-0" />
            <p className="text-xs font-black text-foreground truncate">
              スコア記号早見表
            </p>
          </div>

          <Link
            href="/liff/settings/score"
            onClick={() => onNavigateScoreSettings?.()}
            className="px-2.5 py-1.5 rounded-xl bg-indigo-500/12 hover:bg-indigo-500/20 border border-indigo-500/30 text-[11px] font-black text-indigo-700 dark:text-indigo-300 flex items-center gap-1 shrink-0 active:scale-95 transition-all"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>スコア設定</span>
          </Link>
        </div>

        {legendOverrideDataUrl ? (
          <div className="p-2.5 rounded-2xl bg-indigo-500/8 border border-indigo-500/30 flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src={legendOverrideDataUrl}
                alt="一時指定した早見表"
                className="w-11 h-11 rounded-lg object-cover border border-border bg-slate-950 shrink-0"
              />
              <div className="min-w-0 space-y-0.5">
                <p className="text-[11px] font-black text-foreground truncate">
                  この試合のみ一時添付した早見表を適用中
                </p>
                <p className="text-[10px] font-bold text-muted-foreground leading-snug">
                  毎回使う場合は右上の「スコア設定」に登録すると次回から添付不要です
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onSelectLegendOverride(null)}
              className="p-1.5 rounded-xl bg-card border border-border text-muted-foreground hover:text-destructive shrink-0 cursor-pointer"
              title="一時添付を解除"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : teamLegendUrl ? (
          <div className="space-y-2">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={teamLegendUrl}
                  alt="登録済みの早見表"
                  className="w-11 h-11 rounded-lg object-cover border border-emerald-500/30 bg-slate-950 shrink-0"
                />
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1 text-[11px] font-black text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">登録済み（毎回自動適用）</span>
                  </div>
                  <p className="text-[10px] font-bold text-muted-foreground leading-snug">
                    スコア設定の早見表を自動で参照します。毎回の添付は不要です
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              {isLegendProcessing || isAnalyzingStructure ? (
                <span className="py-1 px-2 rounded-lg text-[10px] font-bold text-muted-foreground opacity-50">
                  {isLegendProcessing
                    ? "早見表を読み込み中..."
                    : "この試合だけ別の早見表を一時添付する"}
                </span>
              ) : (
                <>
                  <label
                    htmlFor={LEGEND_OVERRIDE_INPUT_ID}
                    onClick={() => markNativePickerOpened("legend")}
                    className="py-1 px-2 rounded-lg text-[10px] font-bold text-muted-foreground hover:text-foreground underline underline-offset-2 cursor-pointer"
                  >
                    この試合だけ別の早見表を一時添付する
                  </label>
                  {isAndroidClient && isInClient && (
                    <button
                      type="button"
                      onClick={() => openPasteModal("legend")}
                      className="py-1 px-2 rounded-lg text-[10px] font-black text-indigo-600 dark:text-indigo-400 underline underline-offset-2 cursor-pointer"
                    >
                      貼り付け
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-2xl bg-muted/45 border border-border space-y-2.5">
            <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
              現在は標準の早稲田式・成美堂式ルールで解析します。お使いのスコアブック記載例を
              <strong className="text-foreground font-black">
                「スコア設定」に1度登録しておけば、毎回添付する手間なく自動適用
              </strong>
              できます。
            </p>
            <div className="flex items-center gap-2">
              <Link
                href="/liff/settings/score"
                onClick={() => onNavigateScoreSettings?.()}
                className="flex-1 py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all"
              >
                <Settings className="w-3.5 h-3.5 shrink-0" />
                <span>スコア設定で早見表を登録する</span>
              </Link>

              {isLegendProcessing || isAnalyzingStructure ? (
                <span className="py-2.5 px-3 rounded-xl bg-card border border-border text-[10px] font-black text-muted-foreground shrink-0 flex items-center gap-1 opacity-50">
                  {isLegendProcessing && (
                    <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />
                  )}
                  <span>{isLegendProcessing ? "読込中..." : "今回のみ添付"}</span>
                </span>
              ) : (
                <label
                  htmlFor={LEGEND_OVERRIDE_INPUT_ID}
                  onClick={() => markNativePickerOpened("legend")}
                  className="py-2.5 px-3 rounded-xl bg-card hover:bg-muted border border-border text-[10px] font-black text-muted-foreground hover:text-foreground shrink-0 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span>今回のみ添付</span>
                </label>
              )}
            </div>
            {isAndroidClient && isInClient && !isLegendProcessing && !isAnalyzingStructure && (
              <button
                type="button"
                onClick={() => openPasteModal("legend")}
                className="w-full py-2 px-3 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/18 border border-indigo-500/35 text-indigo-700 dark:text-indigo-300 text-[10px] font-black flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 transition-all"
              >
                <ClipboardPaste className="w-3 h-3 shrink-0" />
                <span>コピーした早見表写真を貼り付け</span>
              </button>
            )}
          </div>
        )}
      </section>

      {/* 進捗表示・エラー表示 ＆ 解析開始ボタン（Step 2と同じくボタン直上に集約） */}
      <div className="space-y-2.5 pt-1">
        <ActionStatusBanner
          isLoading={isAnalyzingStructure || isPreprocessingAny}
          autoScrollOnLoading={isAnalyzingStructure}
          loadingTitle={
            isAnalyzingStructure
              ? "AI骨格スキャンを実行中..."
              : "スコアブック画像の前処理を実行中..."
          }
          loadingDetail={
            isAnalyzingStructure
              ? structureProgressLabel ||
                "AIが打順・守備位置・途中交代・各回得点をスキャンしています..."
              : preprocessingDetail
          }
          errorMessage={errorMessage}
          onDismissError={onDismissError}
        />

        <button
          type="button"
          disabled={!canProceed}
          onClick={onStartAnalyzeStructure}
          className="w-full h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-45 text-white font-black text-sm shadow-md flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer disabled:cursor-not-allowed"
        >
          {isAnalyzingStructure ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin shrink-0" />
              <span>AI骨格スキャン実行中...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 shrink-0" />
              <span>AI骨格スキャンを開始（STEP 2へ）</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

