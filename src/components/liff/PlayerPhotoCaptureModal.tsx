// filepath: src/components/liff/PlayerPhotoCaptureModal.tsx
"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Camera,
  Image as ImageIcon,
  X,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Check,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Loader2,
  RefreshCw,
  ScanFace,
  ArrowRight,
  UserSquare2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { invalidateLiffApiCache } from "@/lib/liff/api-cache";
import {
  LiffSelect,
  type LiffSelectBadgeTone,
} from "@/components/liff/LiffSelect";
import { resolveDefaultPlayerActionBg } from "@/lib/liff/player-profile-schema";

export type PlayerPhotoKind = "portrait" | "action";

export interface PhotoTargetPlayer {
  id: string;
  name: string;
  uniformNumber: string;
  primaryPosition?: string | null;
  profileImageUrl: string | null;
  actionImageUrl?: string | null;
}

interface PlayerPhotoCaptureModalProps {
  isOpen: boolean;
  teamId: string;
  initialPlayerId: string;
  initialPhotoKind?: PlayerPhotoKind;
  enableActionPhoto?: boolean;
  userId?: string | null;
  userName?: string | null;
  rosterPlayers: PhotoTargetPlayer[];
  onClose: () => void;
  onPhotoUpdated: (
    playerId: string,
    newImageUrl: string | null,
    kind?: PlayerPhotoKind
  ) => void;
}

interface UploadPhotoApiResponse {
  success: boolean;
  isDemo?: boolean;
  playerId?: string;
  kind?: PlayerPhotoKind;
  profileImageUrl?: string | null;
  actionImageUrl?: string | null;
  error?: string;
}

const PORTRAIT_PREVIEW_W = 480;
const PORTRAIT_PREVIEW_H = 480;
const PORTRAIT_EXPORT_W = 512;
const PORTRAIT_EXPORT_H = 512;

const ACTION_PREVIEW_W = 640;
const ACTION_PREVIEW_H = 320;
const ACTION_EXPORT_W = 960;
const ACTION_EXPORT_H = 480;

function cleanUniform(raw: string | null | undefined): string {
  if (!raw) return "--";
  const c = raw.trim().replace(/^#/, "");
  return c || "--";
}

function computeMaxNormOffsets(
  natW: number,
  natH: number,
  rotationDeg: number,
  zoom: number,
  targetAspect: number
): { maxNormX: number; maxNormY: number } {
  const rotW = rotationDeg % 180 === 0 ? natW : natH;
  const rotH = rotationDeg % 180 === 0 ? natH : natW;
  if (rotW <= 0 || rotH <= 0 || targetAspect <= 0) {
    return { maxNormX: 0, maxNormY: 0 };
  }

  const baseScale = Math.max(targetAspect / rotW, 1 / rotH);
  const relW = (rotW * baseScale * zoom) / targetAspect;
  const relH = rotH * baseScale * zoom;

  return {
    maxNormX: Math.max(0, (relW - 1) / 2),
    maxNormY: Math.max(0, (relH - 1) / 2),
  };
}

function clampValue(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function drawCroppedPhotoToCanvas(
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
  if (natW <= 0 || natH <= 0 || targetW <= 0 || targetH <= 0) return;

  const rotW = rotationDeg % 180 === 0 ? natW : natH;
  const rotH = rotationDeg % 180 === 0 ? natH : natW;
  const targetAspect = targetW / targetH;
  const baseScale = Math.max(targetW / rotW, targetH / rotH);
  const totalScale = baseScale * zoom;

  const { maxNormX, maxNormY } = computeMaxNormOffsets(
    natW,
    natH,
    rotationDeg,
    zoom,
    targetAspect
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

export function PlayerPhotoCaptureModal({
  isOpen,
  teamId,
  initialPlayerId,
  initialPhotoKind = "portrait",
  enableActionPhoto = true,
  userId,
  userName,
  rosterPlayers,
  onClose,
  onPhotoUpdated,
}: PlayerPhotoCaptureModalProps) {
  const [activePlayerId, setActivePlayerId] = useState<string>(initialPlayerId);
  const [photoKind, setPhotoKind] = useState<PlayerPhotoKind>(
    enableActionPhoto ? initialPhotoKind : "portrait"
  );
  const [mode, setMode] = useState<"idle" | "live_camera" | "crop">("idle");
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState<number>(1.08);
  const [normX, setNormX] = useState<number>(0);
  const [normY, setNormY] = useState<number>(0);
  const [rotationDeg, setRotationDeg] = useState<number>(0);

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const albumInputRef = useRef<HTMLInputElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
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
    boxWidth: 240,
    boxHeight: 240,
  });

  const targetAspect = photoKind === "action" ? 2 : 1;
  const previewW = photoKind === "action" ? ACTION_PREVIEW_W : PORTRAIT_PREVIEW_W;
  const previewH = photoKind === "action" ? ACTION_PREVIEW_H : PORTRAIT_PREVIEW_H;
  const exportW = photoKind === "action" ? ACTION_EXPORT_W : PORTRAIT_EXPORT_W;
  const exportH = photoKind === "action" ? ACTION_EXPORT_H : PORTRAIT_EXPORT_H;

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const clearDraftImage = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setLoadedImage(null);
    setZoom(1.08);
    setNormX(0);
    setNormY(0);
    setRotationDeg(0);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setActivePlayerId(initialPlayerId);
      setPhotoKind(enableActionPhoto ? initialPhotoKind : "portrait");
      setMode("idle");
      clearDraftImage();
    } else {
      stopCameraStream();
      clearDraftImage();
      setMode("idle");
    }
  }, [
    isOpen,
    initialPlayerId,
    initialPhotoKind,
    enableActionPhoto,
    clearDraftImage,
    stopCameraStream,
  ]);

  useEffect(() => {
    return () => {
      stopCameraStream();
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [stopCameraStream]);

  const activeIndex = useMemo(() => {
    const idx = rosterPlayers.findIndex((p) => p.id === activePlayerId);
    return idx >= 0 ? idx : 0;
  }, [rosterPlayers, activePlayerId]);

  const activePlayer = rosterPlayers[activeIndex] || null;
  const prevPlayer = activeIndex > 0 ? rosterPlayers[activeIndex - 1] : null;
  const nextPlayer =
    activeIndex >= 0 && activeIndex < rosterPlayers.length - 1
      ? rosterPlayers[activeIndex + 1]
      : null;

  const hasPhotoForCurrentKind = useCallback(
    (p: PhotoTargetPlayer): boolean =>
      photoKind === "action" ? Boolean(p.actionImageUrl) : Boolean(p.profileImageUrl),
    [photoKind]
  );

  // 連続撮影用：現在選択中の写真種別（正面 or プレー写真）が「未設定」の次の選手を優先提案
  const nextRecommendedPlayer = useMemo(() => {
    if (rosterPlayers.length <= 1) return null;
    for (let offset = 1; offset < rosterPlayers.length; offset++) {
      const candidate = rosterPlayers[(activeIndex + offset) % rosterPlayers.length];
      if (!hasPhotoForCurrentKind(candidate) && candidate.id !== activePlayerId) {
        return candidate;
      }
    }
    return nextPlayer;
  }, [rosterPlayers, activeIndex, activePlayerId, nextPlayer, hasPhotoForCurrentKind]);

  const photographedCount = useMemo(
    () => rosterPlayers.filter((p) => hasPhotoForCurrentKind(p)).length,
    [rosterPlayers, hasPhotoForCurrentKind]
  );

  const switchTargetPlayer = useCallback(
    (targetId: string) => {
      stopCameraStream();
      clearDraftImage();
      setMode("idle");
      setActivePlayerId(targetId);
    },
    [stopCameraStream, clearDraftImage]
  );

  const switchPhotoKind = useCallback(
    (nextKind: PlayerPhotoKind) => {
      if (nextKind === photoKind || isSaving || isDeleting) return;
      stopCameraStream();
      clearDraftImage();
      setMode("idle");
      setPhotoKind(nextKind);
    },
    [photoKind, isSaving, isDeleting, stopCameraStream, clearDraftImage]
  );

  // プレビューCanvasの再描画
  useEffect(() => {
    if (mode !== "crop" || !loadedImage || !previewCanvasRef.current) return;
    drawCroppedPhotoToCanvas(
      previewCanvasRef.current,
      loadedImage,
      previewW,
      previewH,
      zoom,
      normX,
      normY,
      rotationDeg
    );
  }, [mode, loadedImage, previewW, previewH, zoom, normX, normY, rotationDeg]);

  const loadImageFromSrc = useCallback(
    (src: string, isObjectUrl: boolean) => {
      const img = new window.Image();
      img.onload = () => {
        const natW = img.naturalWidth || img.width;
        const natH = img.naturalHeight || img.height;
        const initialZoom = photoKind === "action" ? 1.04 : 1.08;
        const { maxNormY } = computeMaxNormOffsets(
          natW,
          natH,
          0,
          initialZoom,
          targetAspect
        );
        // 縦長写真では顔・上半身が見切れにくいよう少し上寄りを初期表示
        const initialNormY =
          natH > natW
            ? Math.min(maxNormY, photoKind === "action" ? 0.1 : 0.14)
            : 0;

        setLoadedImage(img);
        setRotationDeg(0);
        setZoom(initialZoom);
        setNormX(0);
        setNormY(initialNormY);
        setMode("crop");
      };
      img.onerror = () => {
        if (isObjectUrl) URL.revokeObjectURL(src);
        toast.error("画像の読み込みに失敗しました。別の写真をお試しください。");
      };
      img.src = src;
    },
    [photoKind, targetAspect]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("画像ファイル（JPEG / PNG / WebP 等）を選択してください");
      return;
    }

    stopCameraStream();
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    const objUrl = URL.createObjectURL(file);
    objectUrlRef.current = objUrl;
    loadImageFromSrc(objUrl, true);
  };

  // インアプリ・ガイド枠つきライブカメラ起動
  const startLiveCamera = useCallback(
    async (targetFacing: "environment" | "user") => {
      stopCameraStream();
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function"
      ) {
        cameraInputRef.current?.click();
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: targetFacing },
            width: { ideal: photoKind === "action" ? 1600 : 1280 },
            height: { ideal: photoKind === "action" ? 900 : 1280 },
          },
          audio: false,
        });
        streamRef.current = stream;
        setFacingMode(targetFacing);
        setMode("live_camera");

        requestAnimationFrame(() => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            void videoRef.current.play().catch(() => {});
          }
        });
      } catch {
        toast.info("標準カメラを起動します");
        cameraInputRef.current?.click();
      }
    },
    [photoKind, stopCameraStream]
  );

  const handleCaptureLiveFrame = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
      toast.error("カメラ映像の準備中です。もう一度お試しください。");
      return;
    }

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;
    const ctx = tempCanvas.getContext("2d");
    if (!ctx) return;

    if (facingMode === "user") {
      ctx.translate(tempCanvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);

    stopCameraStream();
    const dataUrl = tempCanvas.toDataURL("image/jpeg", 0.92);
    loadImageFromSrc(dataUrl, false);
  };

  // ドラッグ操作（タッチ＆マウス共通 Pointer Events）
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
      boxWidth: rect.width || 240,
      boxHeight: rect.height || 240,
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
      zoom,
      targetAspect
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
        clampedZoom,
        targetAspect
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
        zoom,
        targetAspect
      );
      setNormX((prev) => clampValue(prev, -maxNormX, maxNormX));
      setNormY((prev) => clampValue(prev, -maxNormY, maxNormY));
    }
  };

  const resolveEffectiveCaller = (): { uid: string; uName: string } => {
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

  const saveCroppedPhoto = async (advanceToNextPlayerId?: string) => {
    if (!activePlayer || !loadedImage || isSaving) return;

    setIsSaving(true);
    try {
      const exportCanvas = document.createElement("canvas");
      drawCroppedPhotoToCanvas(
        exportCanvas,
        loadedImage,
        exportW,
        exportH,
        zoom,
        normX,
        normY,
        rotationDeg
      );

      const jpegQuality = photoKind === "action" ? 0.84 : 0.86;
      const blob = await new Promise<Blob | null>((resolve) =>
        exportCanvas.toBlob((b) => resolve(b), "image/jpeg", jpegQuality)
      );
      if (!blob) {
        throw new Error("写真データの生成に失敗しました");
      }

      const filePrefix =
        photoKind === "action" ? "player-action" : "player-portrait";
      const file = new File([blob], `${filePrefix}-${activePlayer.id}.jpg`, {
        type: "image/jpeg",
      });

      const { uid, uName } = resolveEffectiveCaller();
      const formData = new FormData();
      formData.append("file", file);
      formData.append("teamId", teamId);
      formData.append("kind", photoKind);
      if (uid) formData.append("userId", uid);
      if (uName) formData.append("userName", uName);

      const res = await fetch(
        `/api/liff/players/${encodeURIComponent(activePlayer.id)}/photo`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = (await res.json()) as UploadPhotoApiResponse;
      const savedImageUrl =
        photoKind === "action" ? data.actionImageUrl : data.profileImageUrl;
      if (!res.ok || !data.success || !savedImageUrl) {
        throw new Error(data.error || "写真のアップロードに失敗しました");
      }

      invalidateLiffApiCache("/api/liff/players");
      invalidateLiffApiCache("/api/teams/");
      onPhotoUpdated(activePlayer.id, savedImageUrl, photoKind);

      const kindLabel = photoKind === "action" ? "プレー写真" : "正面写真";
      if (advanceToNextPlayerId) {
        toast.success(
          `#${cleanUniform(activePlayer.uniformNumber)} ${activePlayer.name} の${kindLabel}を保存しました！`
        );
        switchTargetPlayer(advanceToNextPlayerId);
      } else {
        toast.success(
          data.isDemo
            ? `${activePlayer.name} の${kindLabel}を反映しました（デモプレビュー）`
            : `${activePlayer.name} の${kindLabel}を保存しました！`
        );
        clearDraftImage();
        setMode("idle");
        onClose();
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "写真の保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const currentPhotoUrl =
    photoKind === "action"
      ? activePlayer?.actionImageUrl || null
      : activePlayer?.profileImageUrl || null;

  const handleDeletePhoto = async () => {
    if (!activePlayer || !currentPhotoUrl || isDeleting) return;
    const kindLabel = photoKind === "action" ? "背景プレー写真" : "正面写真";
    if (!window.confirm(`${activePlayer.name} 選手の${kindLabel}を削除しますか？`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const { uid, uName } = resolveEffectiveCaller();
      const query = new URLSearchParams({
        teamId,
        kind: photoKind,
      });
      if (uid) query.set("userId", uid);
      if (uName) query.set("userName", uName);

      const res = await fetch(
        `/api/liff/players/${encodeURIComponent(
          activePlayer.id
        )}/photo?${query.toString()}`,
        { method: "DELETE" }
      );
      const data = (await res.json()) as UploadPhotoApiResponse;
      if (!res.ok || !data.success) {
        throw new Error(data.error || "写真の削除に失敗しました");
      }

      invalidateLiffApiCache("/api/liff/players");
      invalidateLiffApiCache("/api/teams/");
      onPhotoUpdated(activePlayer.id, null, photoKind);
      toast.success(`${activePlayer.name} の${kindLabel}を削除しました`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "写真の削除に失敗しました");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen || !activePlayer || typeof document === "undefined") {
    return null;
  }

  const numStr = cleanUniform(activePlayer.uniformNumber);
  const initial = activePlayer.name.replace(/\s+/g, "").slice(0, 1) || "選";
  const isActionMode = photoKind === "action";

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/60 p-3 sm:p-4 animate-in fade-in duration-150">
      {/* 明示的タップで閉じる */}
      <div
        className="absolute inset-0"
        onClick={() => {
          if (!isSaving && !isDeleting) onClose();
        }}
      />

      {/* 非表示ファイル入力（スマホ標準カメラ撮影用 / アルバム選択用） */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={albumInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card shadow-xl overflow-hidden max-h-[90dvh] flex flex-col animate-in zoom-in-95 duration-150">
        {/* ━━━ A-3 上帯ダークソリッドキャップ ━━━ */}
        <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 space-y-2.5 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-7 h-7 rounded-xl bg-primary/20 text-blue-300 border border-primary/40 flex items-center justify-center shrink-0">
                <Camera className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-black text-white leading-tight truncate">
                  選手名鑑 写真撮影・設定
                </h3>
                <p className="text-[10px] font-bold text-slate-300 leading-tight">
                  PLAYER PHOTO STUDIO
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-200 border border-slate-700 text-[10px] font-black tabular-nums">
                {isActionMode ? "背景済" : "正面済"} {photographedCount}/
                {rosterPlayers.length}
              </span>
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
          </div>

          {/* 連続撮影用・選手クイック切替バー */}
          {rosterPlayers.length > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={!prevPlayer || isSaving}
                onClick={() => prevPlayer && switchTargetPlayer(prevPlayer.id)}
                className="h-8 w-8 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 disabled:opacity-35 flex items-center justify-center active:scale-95 transition-all shrink-0 cursor-pointer"
                aria-label="前の選手"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <LiffSelect
                value={activePlayer.id}
                disabled={isSaving}
                onChange={(val) => switchTargetPlayer(val)}
                options={rosterPlayers.map((rp) => {
                  const hasPhoto = hasPhotoForCurrentKind(rp);
                  return {
                    value: rp.id,
                    label: `${hasPhoto ? "📷 " : "○ "}#${cleanUniform(
                      rp.uniformNumber
                    )} ${rp.name}`,
                    badge: hasPhoto ? "設定済" : "未設定",
                    badgeTone: (hasPhoto
                      ? "emerald"
                      : "slate") as LiffSelectBadgeTone,
                    keywords: `${rp.uniformNumber || ""} ${rp.name} ${
                      rp.primaryPosition || ""
                    }`,
                  };
                })}
                title="撮影・設定する選手を選択"
                subtitle="連続して他の選手の写真も設定できます"
                ariaLabel="撮影・設定する選手を選択"
                variant="dark"
                size="xs"
                searchable={true}
                searchPlaceholder="選手名・背番号で検索..."
                className="flex-1 min-w-0 h-8 px-2.5 rounded-xl"
              />

              <button
                type="button"
                disabled={!nextPlayer || isSaving}
                onClick={() => nextPlayer && switchTargetPlayer(nextPlayer.id)}
                className="h-8 w-8 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 disabled:opacity-35 flex items-center justify-center active:scale-95 transition-all shrink-0 cursor-pointer"
                aria-label="次の選手"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* ━━━ ボディエリア ━━━ */}
        <div className="p-4 pb-[max(env(safe-area-inset-bottom),20px)] space-y-3.5 overflow-y-auto bg-card">
          {/* 写真種別 2セグメント切替タブ（正面写真 / 背景プレー写真） */}
          {enableActionPhoto && (
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-muted border border-border">
              <button
                type="button"
                disabled={isSaving || isDeleting}
                onClick={() => switchPhotoKind("portrait")}
                className={`py-2 px-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  !isActionMode
                    ? "bg-[#0f172a] text-white font-black shadow-2xs"
                    : "text-muted-foreground hover:text-foreground font-bold"
                }`}
              >
                <UserSquare2
                  className={`w-3.5 h-3.5 shrink-0 ${
                    !isActionMode ? "text-teal-400" : ""
                  }`}
                />
                <span>正面写真（丸枠）</span>
                {activePlayer.profileImageUrl && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                )}
              </button>

              <button
                type="button"
                disabled={isSaving || isDeleting}
                onClick={() => switchPhotoKind("action")}
                className={`py-2 px-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  isActionMode
                    ? "bg-[#0f172a] text-white font-black shadow-2xs"
                    : "text-muted-foreground hover:text-foreground font-bold"
                }`}
              >
                <Sparkles
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isActionMode ? "text-amber-300" : ""
                  }`}
                />
                <span>プレー写真（背景）</span>
                {activePlayer.actionImageUrl && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                )}
              </button>
            </div>
          )}

          {/* 対象選手バー */}
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-muted border border-border">
            <div className="flex items-center gap-2 min-w-0">
              <span className="px-2 py-0.5 rounded bg-[#0f172a] text-white text-xs font-black tabular-nums shrink-0">
                #{numStr}
              </span>
              <span className="text-sm font-black text-foreground truncate">
                {activePlayer.name}
              </span>
            </div>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black border shrink-0 ${
                currentPhotoUrl
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                  : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
              }`}
            >
              {currentPhotoUrl
                ? isActionMode
                  ? "プレー写真設定済"
                  : "正面写真設定済"
                : isActionMode
                ? "プレー写真未設定"
                : "正面写真未設定"}
            </span>
          </div>

          {mode === "idle" && (
            <div className="space-y-3.5">
              {isActionMode ? (
                /* 🏃 案B（境界オーバーラップ型＋薄めスクリム）カードステージ・ライブプレビュー */
                <div className="rounded-2xl border border-border bg-card shadow-2xs overflow-hidden">
                  <div className="h-[3px] w-full bg-primary" />
                  <div className="relative aspect-[2/1] w-full p-2.5 flex flex-col justify-between overflow-hidden border-b border-border bg-[#0f172a]">
                    <img
                      src={
                        activePlayer.actionImageUrl ||
                        resolveDefaultPlayerActionBg(
                          activePlayer.primaryPosition
                        )
                      }
                      alt={
                        activePlayer.actionImageUrl
                          ? `${activePlayer.name} プレー写真`
                          : ""
                      }
                      decoding="async"
                      className="pointer-events-none select-none absolute inset-0 w-full h-full object-cover"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 bg-slate-950/20"
                    />
                    {!activePlayer.actionImageUrl && (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none select-none absolute right-2 -bottom-3 text-[68px] font-black tracking-tighter leading-none text-white/[0.22] tabular-nums"
                      >
                        {numStr}
                      </span>
                    )}

                    <div className="relative z-10 flex items-center justify-between gap-1.5">
                      <span className="px-2 py-0.5 rounded bg-[#0f172a] text-white text-xs font-black tabular-nums shadow-2xs">
                        #{numStr}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-black shadow-2xs">
                        {activePlayer.primaryPosition || "PLAYER"}
                      </span>
                    </div>

                    {!activePlayer.actionImageUrl && (
                      <div className="relative z-10 flex justify-center pb-2">
                        <span className="px-2.5 py-1 rounded-full bg-card border border-border text-[10.5px] font-black text-foreground shadow-2xs">
                          ここに打撃・投球・守備のプレー写真が入ります
                        </span>
                      </div>
                    )}
                  </div>

                  {/* 境界オーバーラップ型 下部プレビュー帯 */}
                  <div className="px-3 pb-2.5 pt-1.5 bg-card">
                    <div className="relative z-20 flex items-end justify-between gap-2 -mt-8 mb-1">
                      <Avatar className="h-13 w-13 border-[3px] border-card bg-card shadow-sm ring-2 ring-primary/30 shrink-0">
                        {activePlayer.profileImageUrl && (
                          <AvatarImage
                            src={activePlayer.profileImageUrl}
                            alt={activePlayer.name}
                            className="object-cover"
                          />
                        )}
                        <AvatarFallback className="bg-primary text-primary-foreground font-black text-base">
                          {initial}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-[10px] font-bold text-muted-foreground">
                        カード表示イメージ
                      </span>
                    </div>
                    <p className="text-sm font-black text-foreground truncate">
                      {activePlayer.name}
                    </p>
                  </div>

                  <div className="px-3 py-2 bg-muted/50 border-t border-border">
                    <p className="text-[11px] font-bold text-muted-foreground text-center leading-relaxed">
                      打撃・投球・守備などの横向きプレー写真がおすすめ！左下に丸枠の正面写真が重なります
                    </p>
                  </div>
                </div>
              ) : (
                /* 🙂 正面写真（丸枠）プレビュー */
                <div className="flex flex-col items-center justify-center py-3 px-4 rounded-2xl bg-muted/60 border border-border space-y-2.5">
                  <Avatar className="h-32 w-32 border-4 border-card shadow-sm ring-2 ring-border">
                    {activePlayer.profileImageUrl && (
                      <AvatarImage
                        src={activePlayer.profileImageUrl}
                        alt={activePlayer.name}
                        className="object-cover"
                      />
                    )}
                    <AvatarFallback className="bg-primary text-primary-foreground font-black text-4xl">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                  <p className="text-[11px] font-bold text-muted-foreground text-center">
                    帽子・顔・胸元のユニフォームが入るように撮影すると名鑑カードが映えます
                  </p>
                </div>
              )}

              {/* 撮影・選択アクション */}
              <div className="space-y-2">
                {isActionMode ? (
                  <>
                    <button
                      type="button"
                      onClick={() => albumInputRef.current?.click()}
                      className="w-full py-3.5 px-4 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black text-sm shadow-xs active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <ImageIcon className="w-5 h-5" />
                      <span>スマホの写真アルバムから選ぶ</span>
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="py-2.5 px-3 rounded-2xl bg-card hover:bg-muted border border-border text-foreground font-black text-xs shadow-2xs active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Camera className="w-4 h-4 text-primary shrink-0" />
                        <span>カメラで撮影</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void startLiveCamera("environment")}
                        className="py-2.5 px-3 rounded-2xl bg-card hover:bg-muted border border-border text-foreground font-black text-xs shadow-2xs active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <ScanFace className="w-4 h-4 text-primary shrink-0" />
                        <span>ガイド枠カメラ</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="w-full py-3.5 px-4 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black text-sm shadow-xs active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Camera className="w-5 h-5" />
                      <span>スマホカメラで撮影する</span>
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => albumInputRef.current?.click()}
                        className="py-2.5 px-3 rounded-2xl bg-card hover:bg-muted border border-border text-foreground font-black text-xs shadow-2xs active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <ImageIcon className="w-4 h-4 text-primary shrink-0" />
                        <span>アルバムから選択</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void startLiveCamera("environment")}
                        className="py-2.5 px-3 rounded-2xl bg-card hover:bg-muted border border-border text-foreground font-black text-xs shadow-2xs active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <ScanFace className="w-4 h-4 text-primary shrink-0" />
                        <span>ガイド枠カメラ</span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {currentPhotoUrl && (
                <div className="pt-2 border-t border-border flex justify-center">
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => void handleDeletePhoto()}
                    className="px-3.5 py-2 rounded-xl bg-card hover:bg-rose-500/10 border border-rose-500/35 text-rose-600 dark:text-rose-400 text-xs font-black flex items-center gap-1.5 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isDeleting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    <span>
                      現在の{isActionMode ? "プレー写真" : "正面写真"}を削除する
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}

          {mode === "live_camera" && (
            <div className="space-y-3.5">
              <div
                className={`relative mx-auto rounded-2xl overflow-hidden border-2 border-primary bg-slate-950 shadow-xs ${
                  isActionMode ? "w-full aspect-[2/1]" : "w-64 h-64"
                }`}
              >
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${
                    facingMode === "user" ? "-scale-x-100" : ""
                  }`}
                />
                {isActionMode ? (
                  <>
                    <div className="pointer-events-none absolute inset-0 bg-slate-950/15" />
                    <div className="pointer-events-none absolute left-3 -bottom-5 w-12 h-12 rounded-full border-2 border-dashed border-white/80 bg-slate-950/45" />
                    <span className="pointer-events-none absolute bottom-2 right-2.5 px-2.5 py-0.5 rounded-full bg-slate-950/85 text-white text-[10px] font-black whitespace-nowrap border border-white/20">
                      中央〜右側にプレー姿を合わせて撮影
                    </span>
                  </>
                ) : (
                  <>
                    {/* 丸型顔位置ガイド枠 */}
                    <div className="pointer-events-none absolute inset-3 rounded-full border-2 border-dashed border-white/85 shadow-[0_0_0_9999px_rgba(15,23,42,0.42)]" />
                    <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-slate-950/85 text-white text-[10px] font-black whitespace-nowrap border border-white/20">
                      枠内に顔・帽子を合わせて撮影
                    </span>
                  </>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    stopCameraStream();
                    setMode("idle");
                  }}
                  className="py-2.5 px-3.5 rounded-2xl bg-card hover:bg-muted border border-border text-xs font-black text-foreground active:scale-95 transition-all cursor-pointer"
                >
                  戻る
                </button>

                <button
                  type="button"
                  onClick={handleCaptureLiveFrame}
                  className="flex-1 py-3 px-4 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-black shadow-xs active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Camera className="w-4.5 h-4.5" />
                  <span>シャッターを切る</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void startLiveCamera(
                      facingMode === "environment" ? "user" : "environment"
                    )
                  }
                  className="py-2.5 px-3 rounded-2xl bg-card hover:bg-muted border border-border text-xs font-black text-foreground active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
                  title="内側/外側カメラ切替"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-primary" />
                  <span>切替</span>
                </button>
              </div>
            </div>
          )}

          {mode === "crop" && loadedImage && (
            <div className="space-y-3.5">
              {/* ドラッグ＆ズーム位置調整ビューポート */}
              <div className="flex flex-col items-center space-y-2">
                <div
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className={`relative rounded-2xl overflow-hidden border-2 border-primary bg-slate-950 shadow-xs touch-none cursor-grab active:cursor-grabbing select-none ${
                    isActionMode ? "w-full aspect-[2/1]" : "w-60 h-60"
                  }`}
                >
                  <canvas
                    ref={previewCanvasRef}
                    width={previewW}
                    height={previewH}
                    className="w-full h-full block pointer-events-none"
                  />
                  {isActionMode ? (
                    <>
                      {/* カード表示時と同じ薄めソリッドスクリム＆左下丸枠オーバーラップ位置ガイド */}
                      <div className="pointer-events-none absolute inset-0 bg-slate-950/20" />
                      <span className="pointer-events-none absolute top-2 left-2.5 px-2 py-0.5 rounded bg-[#0f172a] text-white text-[10px] font-black tabular-nums">
                        #{numStr}
                      </span>
                      <div className="pointer-events-none absolute left-3 -bottom-6 w-13 h-13 rounded-full border-2 border-dashed border-white/85 bg-slate-950/45 flex items-start justify-center pt-1.5">
                        <span className="text-[8.5px] font-black text-white/90">
                          丸枠位置
                        </span>
                      </div>
                    </>
                  ) : (
                    /* 名鑑円形アバターでの見え方ガイド */
                    <div className="pointer-events-none absolute inset-2 rounded-full border-2 border-dashed border-white/85 shadow-[0_0_0_9999px_rgba(15,23,42,0.38)]" />
                  )}
                </div>
                <p className="text-[11px] font-bold text-muted-foreground text-center">
                  {isActionMode
                    ? "ドラッグ・ズームで打撃や投球フォームの位置を合わせられます（左下に丸枠が重なります）"
                    : "写真を指でドラッグして顔の位置を合わせられます"}
                </p>
              </div>

              {/* ズーム ＆ 90°回転ツールバー */}
              <div className="p-2.5 rounded-2xl bg-muted border border-border space-y-2">
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

              {/* 保存アクションボタン群 */}
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => void saveCroppedPhoto()}
                  className="w-full py-3 px-4 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black text-sm shadow-xs active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4.5 h-4.5" />
                  )}
                  <span>
                    この{isActionMode ? "プレー写真" : "正面写真"}を名鑑に保存する
                  </span>
                </button>

                {nextRecommendedPlayer && (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void saveCroppedPhoto(nextRecommendedPlayer.id)}
                    className="w-full py-2.5 px-4 rounded-2xl bg-[#0f172a] hover:bg-slate-800 text-white border border-slate-700 font-black text-xs shadow-2xs active:scale-[0.99] transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    <span>
                      保存して次の選手へ（#
                      {cleanUniform(nextRecommendedPlayer.uniformNumber)}{" "}
                      {nextRecommendedPlayer.name}）
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                  </button>
                )}

                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    clearDraftImage();
                    setMode("idle");
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-card hover:bg-muted border border-border text-xs font-bold text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                >
                  撮り直す・別の写真を選ぶ
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
