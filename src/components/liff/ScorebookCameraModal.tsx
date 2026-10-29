// filepath: src/components/liff/ScorebookCameraModal.tsx
"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  Camera,
  ImagePlus,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";

export interface ScorebookCameraModalProps {
  isOpen: boolean;
  title: string;
  hintText?: string;
  onClose: () => void;
  onCapture: (file: File) => void;
}

type CameraStatus = "starting" | "ready" | "capturing" | "error";

export function ScorebookCameraModal({
  isOpen,
  title,
  hintText = "1ページ（片面）全体が枠いっぱいに入るよう、影を避けて真上から撮影してください",
  onClose,
  onCapture,
}: ScorebookCameraModalProps) {
  const [mounted, setMounted] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment"
  );
  const [status, setStatus] = useState<CameraStatus>("starting");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startSeqRef = useRef<number>(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const stopActiveStream = useCallback(() => {
    const active = streamRef.current;
    streamRef.current = null;
    if (active) {
      for (const track of active.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
    }
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      } catch {
        // ignore
      }
    }
  }, []);

  const waitForVideoFrames = async (
    videoEl: HTMLVideoElement,
    timeoutMs: number
  ): Promise<boolean> => {
    if (videoEl.readyState >= 2 && videoEl.videoWidth >= 64) {
      return true;
    }

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearInterval(pollTimer);
        clearTimeout(timeoutTimer);
        videoEl.removeEventListener("loadeddata", handleReady);
        videoEl.removeEventListener("playing", handleReady);
        videoEl.removeEventListener("resize", handleReady);
        resolve(ok);
      };

      const handleReady = () => {
        if (videoEl.videoWidth >= 64 && videoEl.videoHeight >= 64) {
          finish(true);
        }
      };

      videoEl.addEventListener("loadeddata", handleReady);
      videoEl.addEventListener("playing", handleReady);
      videoEl.addEventListener("resize", handleReady);

      const pollTimer = setInterval(() => {
        if (videoEl.videoWidth >= 64 && videoEl.videoHeight >= 64) {
          finish(true);
        }
      }, 90);

      const timeoutTimer = setTimeout(() => {
        finish(videoEl.videoWidth >= 64 && videoEl.videoHeight >= 64);
      }, timeoutMs);
    });
  };

  const startCamera = useCallback(
    async (targetFacing: "environment" | "user") => {
      const seq = ++startSeqRef.current;
      stopActiveStream();
      setStatus("starting");
      setErrorDetail(null);

      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function"
      ) {
        setStatus("error");
        setErrorDetail(
          "この環境ではアプリ内カメラを起動できませんでした。下の「アルバムから写真を選択する」をご利用ください。"
        );
        return;
      }

      const requestWithTimeout = async (
        constraints: MediaStreamConstraints
      ): Promise<MediaStream> => {
        let timerId: ReturnType<typeof setTimeout> | null = null;
        try {
          return await Promise.race([
            navigator.mediaDevices.getUserMedia(constraints),
            new Promise<never>((_, reject) => {
              timerId = setTimeout(() => {
                reject(new Error("CAMERA_START_TIMEOUT"));
              }, 7000);
            }),
          ]);
        } finally {
          if (timerId) clearTimeout(timerId);
        }
      };

      // Android WebViewのSurfaceTextureで黒画面にならないFull HD(1920x1080)を最優先にする
      const candidateConstraints: MediaStreamConstraints[] = [
        {
          video: {
            facingMode: { ideal: targetFacing },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        },
        {
          video: { facingMode: targetFacing },
          audio: false,
        },
        {
          video: true,
          audio: false,
        },
      ];

      let acquiredStream: MediaStream | null = null;
      let lastErr: unknown = null;

      for (const c of candidateConstraints) {
        try {
          const candidateStream = await requestWithTimeout(c);
          if (startSeqRef.current !== seq) {
            for (const track of candidateStream.getTracks()) {
              try {
                track.stop();
              } catch {
                // ignore
              }
            }
            return;
          }

          streamRef.current = candidateStream;
          const videoEl = videoRef.current;
          if (videoEl) {
            videoEl.srcObject = candidateStream;
            try {
              await videoEl.play();
            } catch {
              // autoPlay + muted で再生開始される環境では無視可能
            }
            const hasFrames = await waitForVideoFrames(videoEl, 4500);
            if (!hasFrames) {
              // 映像フレームが届かない黒画面ストリームは解放し、より互換性の高い次候補へフォールバック
              stopActiveStream();
              lastErr = new Error("CAMERA_EMPTY_STREAM");
              continue;
            }
          }

          acquiredStream = candidateStream;
          break;
        } catch (err) {
          lastErr = err;
          const errName =
            err instanceof DOMException
              ? err.name
              : err instanceof Error
              ? err.message
              : "";
          if (
            errName === "NotAllowedError" ||
            errName === "PermissionDeniedError" ||
            errName === "SecurityError" ||
            errName === "CAMERA_START_TIMEOUT"
          ) {
            break;
          }
        }
      }

      if (startSeqRef.current !== seq) {
        stopActiveStream();
        return;
      }

      if (!acquiredStream) {
        const msg =
          lastErr instanceof Error ? lastErr.message : String(lastErr || "");
        const errName = lastErr instanceof DOMException ? lastErr.name : "";
        if (
          errName === "NotAllowedError" ||
          errName === "PermissionDeniedError"
        ) {
          setErrorDetail(
            "LINEにカメラ権限が許可されていないため起動できませんでした。スマホの「設定 ＞ アプリ ＞ LINE ＞ 権限 ＞ カメラ」を許可するか、標準カメラで撮影済みの写真を「アルバムから選択」してください。"
          );
        } else if (msg === "CAMERA_START_TIMEOUT") {
          setErrorDetail(
            "カメラの起動がタイムアウトしました。下の「アルバムから写真を選択する」または「もう一度カメラ起動を試す」をお試しください。"
          );
        } else {
          setErrorDetail(
            "カメラ映像を取得できませんでした。下の「アルバムから写真を選択する」または「もう一度カメラ起動を試す」をお試しください。"
          );
        }
        setStatus("error");
        return;
      }

      if (startSeqRef.current === seq) {
        setStatus("ready");
      }
    },
    [stopActiveStream]
  );

  useEffect(() => {
    if (!isOpen || !mounted) {
      startSeqRef.current += 1;
      stopActiveStream();
      return;
    }

    void startCamera(facingMode);

    return () => {
      startSeqRef.current += 1;
      stopActiveStream();
    };
  }, [isOpen, mounted, facingMode, startCamera, stopActiveStream]);

  const handleClose = () => {
    startSeqRef.current += 1;
    stopActiveStream();
    onClose();
  };

  const handleSwitchCamera = () => {
    if (status === "capturing") return;
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  const handleShutter = async () => {
    const videoEl = videoRef.current;
    if (!videoEl || status !== "ready") return;

    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;
    if (vw < 64 || vh < 64) {
      setErrorDetail(
        "カメラ映像の準備が完了していません。1秒ほど待ってからもう一度シャッターを押してください。"
      );
      setStatus("error");
      return;
    }

    setStatus("capturing");

    const maxEdge = 2560;
    const scale = Math.max(vw, vh) > maxEdge ? maxEdge / Math.max(vw, vh) : 1;
    const outW = Math.max(64, Math.round(vw * scale));
    const outH = Math.max(64, Math.round(vh * scale));

    const canvas = document.createElement("canvas");
    try {
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("撮影用Canvasの確保に失敗しました");
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(videoEl, 0, 0, outW, outH);

      const blob = await new Promise<Blob | null>((resolve) => {
        if (typeof canvas.toBlob !== "function") {
          resolve(null);
          return;
        }
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          resolve(null);
        }, 5000);
        canvas.toBlob(
          (b) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(b);
          },
          "image/jpeg",
          0.92
        );
      });

      let capturedFile: File;
      if (blob && blob.size > 0) {
        capturedFile = new File(
          [blob],
          `scorebook-camera-${Date.now()}.jpg`,
          { type: "image/jpeg" }
        );
      } else {
        const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
        const commaIdx = dataUrl.indexOf(",");
        const b64 = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        capturedFile = new File(
          [bytes],
          `scorebook-camera-${Date.now()}.jpg`,
          { type: "image/jpeg" }
        );
      }

      startSeqRef.current += 1;
      stopActiveStream();
      onClose();
      window.setTimeout(() => {
        onCapture(capturedFile);
      }, 40);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorDetail(`撮影データの作成に失敗しました: ${msg}`);
      setStatus("error");
    } finally {
      canvas.width = 1;
      canvas.height = 1;
    }
  };

  const handleFallbackFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.currentTarget;
    const picked = inputEl.files?.[0] ?? null;
    if (!picked) {
      inputEl.value = "";
      return;
    }
    startSeqRef.current += 1;
    stopActiveStream();
    onClose();
    window.setTimeout(() => {
      onCapture(picked);
      inputEl.value = "";
    }, 50);
  };

  if (!isOpen || !mounted || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col select-none"
    >
      {/* 上部ソリッドヘッダー（常に即タップ可能でデッドロックゼロ） */}
      <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
            <Camera className="w-4 h-4" />
          </span>
          <h2 className="text-xs sm:text-sm font-black truncate">{title}</h2>
        </div>

        <button
          type="button"
          onClick={handleClose}
          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-black flex items-center gap-1 shrink-0 cursor-pointer active:scale-95 transition-all"
        >
          <X className="w-4 h-4" />
          <span>閉じる</span>
        </button>
      </div>

      {/* 中央カメラプレビュー（min-h-0 + absolute inset-0 でWebViewの0px崩壊・黒画面を完全防止） */}
      <div className="relative flex-1 min-h-0 bg-black overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-contain ${
            status === "error" ? "hidden" : "block"
          }`}
        />

        {/* スコアブック4隅ガイド枠 */}
        {status === "ready" && (
          <div className="pointer-events-none absolute inset-4 sm:inset-6 border-2 border-dashed border-sky-400/75 rounded-2xl flex flex-col justify-between p-3 z-10">
            <div className="flex justify-between">
              <span className="w-5 h-5 border-t-4 border-l-4 border-sky-400 rounded-tl-md" />
              <span className="w-5 h-5 border-t-4 border-r-4 border-sky-400 rounded-tr-md" />
            </div>
            <div className="mx-auto px-3 py-1 rounded-full bg-slate-950 border border-slate-700 text-[11px] font-black text-sky-300 text-center">
              {hintText}
            </div>
            <div className="flex justify-between">
              <span className="w-5 h-5 border-b-4 border-l-4 border-sky-400 rounded-bl-md" />
              <span className="w-5 h-5 border-b-4 border-r-4 border-sky-400 rounded-br-md" />
            </div>
          </div>
        )}

        {(status === "starting" || status === "capturing") && (
          <div className="absolute inset-0 z-20 bg-slate-950 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
            <p className="text-xs font-black text-white">
              {status === "capturing"
                ? "高精細画像を切り出しています..."
                : "カメラ映像を準備しています..."}
            </p>
            <p className="text-[11px] font-bold text-slate-300">
              カメラの許可ダイアログが表示された場合は「許可」を押してください
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-4 overflow-y-auto">
            <div className="max-w-sm w-full p-5 rounded-3xl bg-slate-900 border-2 border-slate-700 space-y-4 text-center shadow-lg">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-sm font-black text-white">
                  アプリ内カメラを起動できませんでした
                </h3>
                <p className="text-xs font-bold text-slate-300 leading-relaxed">
                  {errorDetail}
                </p>
              </div>

              <div className="space-y-2 pt-1">
                <div className="relative overflow-hidden w-full py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center justify-center gap-2">
                  <ImagePlus className="w-4 h-4 shrink-0 pointer-events-none" />
                  <span className="pointer-events-none">
                    アルバムから写真を選択する
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    aria-label="アルバムから写真を選択する"
                    onChange={handleFallbackFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void startCamera(facingMode)}
                  className="w-full py-2.5 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>もう一度カメラ起動を試す</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 下部シャッター操作バー */}
      {status !== "error" && (
        <div className="px-4 py-4 pb-7 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
          {status !== "capturing" ? (
            <div className="relative overflow-hidden py-2.5 px-3 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-[11px] font-black flex items-center gap-1.5">
              <ImagePlus className="w-4 h-4 text-indigo-400 shrink-0 pointer-events-none" />
              <span className="pointer-events-none">アルバム</span>
              <input
                type="file"
                accept="image/*"
                aria-label="アルバムから選択"
                onChange={handleFallbackFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
            </div>
          ) : (
            <div className="w-20" />
          )}

          <button
            type="button"
            disabled={status !== "ready"}
            onClick={() => void handleShutter()}
            className="h-14 px-7 rounded-full bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-950 font-black text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all"
          >
            <Camera className="w-5 h-5 text-indigo-600 shrink-0" />
            <span>シャッターを切る</span>
          </button>

          <button
            type="button"
            disabled={status !== "ready"}
            onClick={handleSwitchCamera}
            className="py-2.5 px-3 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-[11px] font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4 text-sky-400 shrink-0" />
            <span>切替</span>
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}
