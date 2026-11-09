// filepath: src/components/liff/TeamCoverPhotoModal.tsx
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Camera,
  Image as ImageIcon,
  X,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Check,
  Trash2,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { invalidateLiffApiCache } from "@/lib/liff/api-cache";

interface TeamCoverPhotoModalProps {
  isOpen: boolean;
  teamId: string;
  teamName: string;
  logoImageUrl?: string | null;
  currentCoverUrl?: string | null;
  userId?: string | null;
  userName?: string | null;
  onClose: () => void;
  onCoverUpdated: (newCoverUrl: string | null) => void;
}

interface TeamCoverApiResponse {
  success: boolean;
  isDemo?: boolean;
  teamId?: string;
  coverImageUrl?: string | null;
  error?: string;
}

const PREVIEW_W = 600;
const PREVIEW_H = 250;
const EXPORT_W = 1200;
const EXPORT_H = 500;
const TARGET_ASPECT = EXPORT_W / EXPORT_H; // 2.4 : 1

function clampValue(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function computeMaxNormOffsets(
  natW: number,
  natH: number,
  rotationDeg: number,
  zoom: number
): { maxNormX: number; maxNormY: number } {
  const rotW = rotationDeg % 180 === 0 ? natW : natH;
  const rotH = rotationDeg % 180 === 0 ? natH : natW;
  if (rotW <= 0 || rotH <= 0) return { maxNormX: 0, maxNormY: 0 };

  const baseScale = Math.max(TARGET_ASPECT / rotW, 1 / rotH);
  const relW = (rotW * baseScale * zoom) / TARGET_ASPECT;
  const relH = rotH * baseScale * zoom;

  return {
    maxNormX: Math.max(0, (relW - 1) / 2),
    maxNormY: Math.max(0, (relH - 1) / 2),
  };
}

function drawCoverToCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  targetW: number,
  targetH: number,
  zoom: number,
  normX: number,
  normY: number,
  rotationDeg: number
): void {
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, targetW, targetH);

  const natW = img.naturalWidth || img.width;
  const natH = img.naturalHeight || img.height;
  if (natW <= 0 || natH <= 0) return;

  const rotW = rotationDeg % 180 === 0 ? natW : natH;
  const rotH = rotationDeg % 180 === 0 ? natH : natW;
  const baseScale = Math.max(targetW / rotW, targetH / rotH);
  const totalScale = baseScale * zoom;

  const { maxNormX, maxNormY } = computeMaxNormOffsets(
    natW,
    natH,
    rotationDeg,
    zoom
  );
  const clampedX = clampValue(normX, -maxNormX, maxNormX);
  const clampedY = clampValue(normY, -maxNormY, maxNormY);

  ctx.save();
  ctx.translate(
    targetW / 2 + clampedX * targetW,
    targetH / 2 + clampedY * targetH
  );
  ctx.rotate((rotationDeg * Math.PI) / 180);
  ctx.scale(totalScale, totalScale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, -natW / 2, -natH / 2, natW, natH);
  ctx.restore();
}

export function TeamCoverPhotoModal({
  isOpen,
  teamId,
  teamName,
  logoImageUrl,
  currentCoverUrl,
  userId,
  userName,
  onClose,
  onCoverUpdated,
}: TeamCoverPhotoModalProps) {
  const [mode, setMode] = useState<"idle" | "crop">("idle");
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState<number>(1.04);
  const [normX, setNormX] = useState<number>(0);
  const [normY, setNormY] = useState<number>(0);
  const [rotationDeg, setRotationDeg] = useState<number>(0);

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const albumInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const dragStateRef = useRef<{
    isDragging: boolean;
    startClientX: number;
    startClientY: number;
    startNormX: number;
    startNormY: number;
    boxWidth: number;
    boxHeight: number;
  }>({
    isDragging: false,
    startClientX: 0,
    startClientY: 0,
    startNormX: 0,
    startNormY: 0,
    boxWidth: 320,
    boxHeight: 133,
  });

  const clearDraft = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setLoadedImage(null);
    setZoom(1.04);
    setNormX(0);
    setNormY(0);
    setRotationDeg(0);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setMode("idle");
      clearDraft();
    } else {
      clearDraft();
      setMode("idle");
    }
  }, [isOpen, clearDraft]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (mode !== "crop" || !loadedImage || !previewCanvasRef.current) return;
    drawCoverToCanvas(
      previewCanvasRef.current,
      loadedImage,
      PREVIEW_W,
      PREVIEW_H,
      zoom,
      normX,
      normY,
      rotationDeg
    );
  }, [mode, loadedImage, zoom, normX, normY, rotationDeg]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("画像ファイル（JPEG / PNG / WebP 等）を選択してください");
      return;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    const objUrl = URL.createObjectURL(file);
    objectUrlRef.current = objUrl;

    const img = new window.Image();
    img.onload = () => {
      setLoadedImage(img);
      setRotationDeg(0);
      setZoom(1.04);
      setNormX(0);
      setNormY(0);
      setMode("crop");
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      objectUrlRef.current = null;
      toast.error("画像の読み込みに失敗しました。別の写真をお試しください。");
    };
    img.src = objUrl;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!loadedImage) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    dragStateRef.current = {
      isDragging: true,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startNormX: normX,
      startNormY: normY,
      boxWidth: rect.width || 320,
      boxHeight: rect.height || 133,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.isDragging || !loadedImage) return;
    const {
      startClientX,
      startClientY,
      startNormX,
      startNormY,
      boxWidth,
      boxHeight,
    } = dragStateRef.current;
    const dx = (e.clientX - startClientX) / boxWidth;
    const dy = (e.clientY - startClientY) / boxHeight;

    const natW = loadedImage.naturalWidth || loadedImage.width;
    const natH = loadedImage.naturalHeight || loadedImage.height;
    const { maxNormX, maxNormY } = computeMaxNormOffsets(
      natW,
      natH,
      rotationDeg,
      zoom
    );

    setNormX(clampValue(startNormX + dx, -maxNormX, maxNormX));
    setNormY(clampValue(startNormY + dy, -maxNormY, maxNormY));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current.isDragging) {
      dragStateRef.current.isDragging = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handleZoomChange = (nextZoom: number) => {
    const clampedZoom = clampValue(nextZoom, 1, 3);
    setZoom(clampedZoom);
    if (loadedImage) {
      const natW = loadedImage.naturalWidth || loadedImage.width;
      const natH = loadedImage.naturalHeight || loadedImage.height;
      const { maxNormX, maxNormY } = computeMaxNormOffsets(
        natW,
        natH,
        rotationDeg,
        clampedZoom
      );
      setNormX((prev) => clampValue(prev, -maxNormX, maxNormX));
      setNormY((prev) => clampValue(prev, -maxNormY, maxNormY));
    }
  };

  const handleRotate90 = () => {
    const nextRot = (rotationDeg + 90) % 360;
    setRotationDeg(nextRot);
    if (loadedImage) {
      const natW = loadedImage.naturalWidth || loadedImage.width;
      const natH = loadedImage.naturalHeight || loadedImage.height;
      const { maxNormX, maxNormY } = computeMaxNormOffsets(
        natW,
        natH,
        nextRot,
        zoom
      );
      setNormX((prev) => clampValue(prev, -maxNormX, maxNormX));
      setNormY((prev) => clampValue(prev, -maxNormY, maxNormY));
    }
  };

  const resolveCaller = (): { uid: string; uName: string } => {
    const uid =
      userId ||
      (typeof window !== "undefined"
        ? localStorage.getItem("iscore_user_id") ||
          localStorage.getItem("iscore_userId") ||
          ""
        : "");
    const uName =
      userName ||
      (typeof window !== "undefined"
        ? localStorage.getItem("iscore_user_name") || ""
        : "");
    return {
      uid: uid === "cached-user" ? "" : uid,
      uName,
    };
  };

  const handleSaveCover = async () => {
    if (!loadedImage || isSaving) return;
    setIsSaving(true);
    try {
      const exportCanvas = document.createElement("canvas");
      drawCoverToCanvas(
        exportCanvas,
        loadedImage,
        EXPORT_W,
        EXPORT_H,
        zoom,
        normX,
        normY,
        rotationDeg
      );

      const blob = await new Promise<Blob | null>((resolve) =>
        exportCanvas.toBlob((b) => resolve(b), "image/jpeg", 0.85)
      );
      if (!blob) {
        throw new Error("背景画像データの生成に失敗しました");
      }

      const file = new File([blob], `team-cover-${teamId}.jpg`, {
        type: "image/jpeg",
      });

      const { uid, uName } = resolveCaller();
      const formData = new FormData();
      formData.append("file", file);
      if (uid) formData.append("userId", uid);
      if (uName) formData.append("userName", uName);

      const res = await fetch(
        `/api/liff/teams/${encodeURIComponent(teamId)}/cover`,
        {
          method: "POST",
          body: formData,
        }
      );
      const data = (await res.json()) as TeamCoverApiResponse;
      if (!res.ok || !data.success || !data.coverImageUrl) {
        throw new Error(data.error || "チーム背景画像の保存に失敗しました");
      }

      invalidateLiffApiCache();
      onCoverUpdated(data.coverImageUrl);
      toast.success(
        data.isDemo
          ? "チームヘッダー背景画像を反映しました（デモプレビュー）"
          : "チームヘッダー背景画像を保存しました！"
      );
      clearDraft();
      setMode("idle");
      onClose();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "チーム背景画像の保存に失敗しました"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCover = async () => {
    if (!currentCoverUrl || isDeleting) return;
    if (!window.confirm("現在のチームヘッダー背景画像を削除しますか？")) {
      return;
    }

    setIsDeleting(true);
    try {
      const { uid, uName } = resolveCaller();
      const query = new URLSearchParams();
      if (uid) query.set("userId", uid);
      if (uName) query.set("userName", uName);
      const qs = query.toString() ? `?${query.toString()}` : "";

      const res = await fetch(
        `/api/liff/teams/${encodeURIComponent(teamId)}/cover${qs}`,
        { method: "DELETE" }
      );
      const data = (await res.json()) as TeamCoverApiResponse;
      if (!res.ok || !data.success) {
        throw new Error(data.error || "チーム背景画像の削除に失敗しました");
      }

      invalidateLiffApiCache();
      onCoverUpdated(null);
      toast.success("チームヘッダー背景画像を削除しました");
      onClose();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "チーム背景画像の削除に失敗しました"
      );
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen || typeof document === "undefined") return null;

  const teamInitial =
    (teamName || "TM").replace(/\s+/g, "").slice(0, 2).toUpperCase() || "TM";

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/60 p-3 sm:p-4 animate-in fade-in duration-150">
      <div
        className="absolute inset-0"
        onClick={() => {
          if (!isSaving && !isDeleting) onClose();
        }}
      />

      <input
        ref={albumInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card shadow-xl overflow-hidden max-h-[90dvh] flex flex-col animate-in zoom-in-95 duration-150">
        {/* A-3 上帯ダークキャップ */}
        <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-7 h-7 rounded-xl bg-primary/20 text-amber-300 border border-primary/40 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-white leading-tight truncate">
                チームヘッダー背景画像
              </h3>
              <p className="text-[10px] font-bold text-slate-300 leading-tight truncate">
                選手名鑑のチーム背景カバー写真
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isSaving || isDeleting}
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 flex items-center justify-center active:scale-90 transition-all cursor-pointer"
            aria-label="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ボディ */}
        <div className="p-4 pb-[max(env(safe-area-inset-bottom),20px)] space-y-3.5 overflow-y-auto bg-card">
          {mode === "idle" ? (
            <div className="space-y-3.5">
              {/* 境界オーバーラップ型 チームヘッダー完成プレビュー */}
              <div className="rounded-2xl border border-border bg-card shadow-2xs overflow-hidden">
                <div className="relative aspect-[12/5] w-full p-2.5 flex items-start justify-between overflow-hidden bg-[#0f172a] border-b-[3px] border-primary">
                  {currentCoverUrl ? (
                    <>
                      <img
                        src={currentCoverUrl}
                        alt="チームヘッダー背景"
                        className="pointer-events-none select-none absolute inset-0 w-full h-full object-cover"
                      />
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-slate-950/20"
                      />
                    </>
                  ) : (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <span className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-[10.5px] font-black text-slate-300">
                        集合写真・円陣・グラウンド写真を設定できます
                      </span>
                    </div>
                  )}

                  <span className="relative z-10 px-2 py-0.5 rounded bg-primary text-primary-foreground text-[9.5px] font-black tracking-wider shadow-2xs">
                    {new Date().getFullYear()}年度
                  </span>
                </div>

                <div className="px-3.5 pb-3 pt-1.5 bg-card">
                  <div className="relative z-20 flex items-end justify-between gap-2 -mt-8 mb-1">
                    <div className="w-14 h-14 rounded-full border-[3px] border-card bg-card shadow-sm ring-1 ring-border overflow-hidden flex items-center justify-center shrink-0">
                      {logoImageUrl ? (
                        <img
                          src={logoImageUrl}
                          alt={teamName}
                          className="w-full h-full object-contain p-1"
                        />
                      ) : (
                        <span className="w-full h-full bg-[#0f172a] text-white text-xs font-black flex items-center justify-center">
                          {teamInitial}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-bold text-muted-foreground">
                      選手名鑑ヘッダー表示イメージ
                    </span>
                  </div>
                  <p className="text-sm font-black text-foreground truncate">
                    {teamName || "チーム名"}
                  </p>
                </div>
              </div>

              <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
                チーム集合写真・ベンチ円陣・ホームグラウンドなどの横向き写真がおすすめです。チーム名や人数表示は下の白枠に配置されるため写真が隠れません。
              </p>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => albumInputRef.current?.click()}
                  className="w-full py-3.5 px-4 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black text-sm shadow-xs active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ImageIcon className="w-5 h-5" />
                  <span>スマホの写真アルバムから選ぶ</span>
                </button>

                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="w-full py-2.5 px-3 rounded-2xl bg-card hover:bg-muted border border-border text-foreground font-black text-xs shadow-2xs active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Camera className="w-4 h-4 text-primary shrink-0" />
                  <span>カメラで撮影する</span>
                </button>
              </div>

              {currentCoverUrl && (
                <div className="pt-2 border-t border-border flex justify-center">
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => void handleDeleteCover()}
                    className="px-3.5 py-2 rounded-xl bg-card hover:bg-rose-500/10 border border-rose-500/35 text-rose-600 dark:text-rose-400 text-xs font-black flex items-center gap-1.5 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isDeleting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    <span>現在の背景画像を削除する</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            loadedImage && (
              <div className="space-y-3.5">
                <div className="flex flex-col items-center space-y-2">
                  <div
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    className="relative w-full aspect-[12/5] rounded-2xl overflow-hidden border-2 border-primary bg-slate-950 shadow-xs touch-none cursor-grab active:cursor-grabbing select-none"
                  >
                    <canvas
                      ref={previewCanvasRef}
                      width={PREVIEW_W}
                      height={PREVIEW_H}
                      className="w-full h-full block pointer-events-none"
                    />
                    {/* 薄めソリッドスクリム ＆ 左下チームロゴ重なり位置ガイド */}
                    <div className="pointer-events-none absolute inset-0 bg-slate-950/20" />
                    <div className="pointer-events-none absolute left-3 -bottom-6 w-14 h-14 rounded-full border-2 border-dashed border-white/85 bg-slate-950/45 flex items-start justify-center pt-1.5">
                      <span className="text-[8.5px] font-black text-white/90">
                        ロゴ位置
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] font-bold text-muted-foreground text-center">
                    ドラッグ・ズームで集合写真やグラウンドの位置を調整できます
                  </p>
                </div>

                {/* ズーム ＆ 回転ツールバー */}
                <div className="p-2.5 rounded-2xl bg-muted border border-border">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleZoomChange(zoom - 0.15)}
                      className="w-7 h-7 rounded-lg bg-card border border-border flex items-center justify-center text-foreground hover:bg-muted active:scale-90 cursor-pointer"
                      aria-label="縮小"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="range"
                      min="1"
                      max="3"
                      step="0.02"
                      value={zoom}
                      onChange={(e) => handleZoomChange(Number(e.target.value))}
                      aria-label="ズーム倍率"
                      className="flex-1 accent-primary cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() => handleZoomChange(zoom + 0.15)}
                      className="w-7 h-7 rounded-lg bg-card border border-border flex items-center justify-center text-foreground hover:bg-muted active:scale-90 cursor-pointer"
                      aria-label="拡大"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleRotate90}
                      className="px-2.5 h-7 rounded-lg bg-card border border-border text-[11px] font-black text-foreground hover:bg-muted active:scale-95 flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <RotateCw className="w-3 h-3 text-primary" />
                      <span>回転</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void handleSaveCover()}
                    className="w-full py-3 px-4 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black text-sm shadow-xs active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4.5 h-4.5" />
                    )}
                    <span>この背景画像を保存する</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => {
                      clearDraft();
                      setMode("idle");
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-card hover:bg-muted border border-border text-xs font-bold text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                  >
                    別の写真を選び直す
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

