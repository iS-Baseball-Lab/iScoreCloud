"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, AlertCircle, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";

interface PdfCanvasViewerProps {
  url: string;
  title?: string;
  className?: string;
  aspectRatioA4?: boolean;
}

// PDF.js CDNスクリプトをクライアント側で安全に一度だけロード
const loadPdfJs = (): Promise<any> => {
  if (typeof window === "undefined") return Promise.reject();
  const win = window as any;
  if (win.pdfjsLib) return Promise.resolve(win.pdfjsLib);

  return new Promise((resolve, reject) => {
    const existing = document.getElementById("pdfjs-cdn-script");
    if (existing) {
      existing.addEventListener("load", () => resolve((window as any).pdfjsLib));
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.id = "pdfjs-cdn-script";
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.async = true;
    script.onload = () => {
      const pdfjs = (window as any).pdfjsLib;
      if (pdfjs) {
        pdfjs.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        resolve(pdfjs);
      } else {
        reject(new Error("pdfjsLib not available"));
      }
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

function getAbsoluteUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) return url;
  if (typeof window !== "undefined") {
    return `${window.location.origin}${url.startsWith("/") ? "" : "/"}${url}`;
  }
  return `https://iscorecloud.com${url.startsWith("/") ? "" : "/"}${url}`;
}

export function PdfCanvasViewer({
  url,
  title = "PDF資料",
  className = "",
  aspectRatioA4 = true,
}: PdfCanvasViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [fallbackToIframe, setFallbackToIframe] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);

  // PDFドキュメントの読み込み
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setError(null);
    setFallbackToIframe(false);

    const targetUrl = getAbsoluteUrl(url);

    loadPdfJs()
      .then((pdfjs) => {
        if (isCancelled) return;
        const loadingTask = pdfjs.getDocument({
          url: targetUrl,
          withCredentials: false,
        });

        return loadingTask.promise;
      })
      .then((doc) => {
        if (isCancelled || !doc) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages || 1);
        setCurrentPage(1);
        setLoading(false);
      })
      .catch((err) => {
        if (isCancelled) return;
        console.warn("[PdfCanvasViewer] PDF.js failed, falling back to viewer iframe:", err);
        setFallbackToIframe(true);
        setLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [url]);

  // 指定ページのCanvas描画
  const renderPage = useCallback(
    async (pageNumber: number) => {
      if (!pdfDoc || !canvasRef.current || !containerRef.current) return;

      try {
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
        }

        const page = await pdfDoc.getPage(pageNumber);
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) return;

        const containerWidth = containerRef.current.clientWidth || 360;
        // 未スケーリング時のビューポートから横幅に合わせたスケールを算出
        const unscaledViewport = page.getViewport({ scale: 1.0 });
        const scale = containerWidth / unscaledViewport.width;
        const viewport = page.getViewport({ scale });

        // レティナディスプレイ対応 (超高精細・文字の滲みを防止)
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = "100%";
        canvas.style.height = "auto";

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);

        // 背景を純白で塗りつぶす (黒余白を完全排除)
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, viewport.width, viewport.height);

        const renderContext = {
          canvasContext: ctx,
          viewport: viewport,
        };

        const task = page.render(renderContext);
        renderTaskRef.current = task;
        await task.promise;
      } catch (err: any) {
        if (err?.name !== "RenderingCancelledException") {
          console.error("[PdfCanvasViewer] Render error:", err);
        }
      }
    },
    [pdfDoc]
  );

  useEffect(() => {
    if (pdfDoc && !loading) {
      renderPage(currentPage);
    }
  }, [pdfDoc, currentPage, loading, renderPage]);

  // リサイズ検知で再描画
  useEffect(() => {
    const handleResize = () => {
      if (pdfDoc && !loading) {
        renderPage(currentPage);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [pdfDoc, currentPage, loading, renderPage]);

  // フォールバック（PDF.jsがブロックされた場合など）
  if (fallbackToIframe) {
    const abs = getAbsoluteUrl(url);
    const viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(abs)}&embedded=true`;
    return (
      <div
        className={`relative w-full rounded-2xl overflow-hidden border border-border bg-white shadow-xs ${className}`}
        style={aspectRatioA4 ? { aspectRatio: "210 / 297" } : undefined}
      >
        <iframe
          src={viewerUrl}
          title={title}
          className="w-full h-full border-none bg-white"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full rounded-2xl overflow-hidden border border-border bg-white shadow-xs flex flex-col items-center justify-start ${className}`}
      style={aspectRatioA4 ? { aspectRatio: "210 / 297" } : undefined}
    >
      {/* 読込中スピナー */}
      {loading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/90 backdrop-blur-2xs gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="text-[11px] font-bold text-muted-foreground">PDFを高画質展開中...</span>
        </div>
      )}

      {/* エラー表示 */}
      {error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white p-4 text-center gap-2">
          <AlertCircle className="w-8 h-8 text-rose-500" />
          <p className="text-xs font-bold text-foreground">{error}</p>
          <a
            href={getAbsoluteUrl(url)}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-black flex items-center gap-1 mt-2"
          >
            <span>直接開く</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* 📄 Canvas描画領域 (純白・黒余白なし・A4幅ジャストフィット) */}
      <div className="w-full h-full overflow-y-auto overflow-x-hidden flex flex-col items-center bg-white">
        <canvas
          ref={canvasRef}
          className="w-full h-auto block select-none bg-white shadow-2xs"
        />
      </div>

      {/* 複数ページ時のページネーションバー */}
      {numPages > 1 && (
        <div className="absolute bottom-2.5 inset-x-0 mx-auto w-fit flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/75 text-white backdrop-blur-md shadow-lg text-xs font-black z-20">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="p-0.5 rounded-full hover:bg-white/20 disabled:opacity-30 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] tracking-widest font-bold">
            {currentPage} / {numPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= numPages}
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
            className="p-0.5 rounded-full hover:bg-white/20 disabled:opacity-30 cursor-pointer"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
