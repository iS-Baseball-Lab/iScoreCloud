"use client";

import React, { useEffect, useRef, useState } from "react";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [renderedImageUrl, setRenderedImageUrl] = useState<string | null>(null);
  const [fallbackToIframe, setFallbackToIframe] = useState(false);

  // ページごとのレンダリング結果キャッシュ (ページ切替時のチカチカ・再描画を完全防止)
  const pageCacheRef = useRef<Record<number, string>>({});
  const pdfDocRef = useRef<any>(null);
  const isRenderingRef = useRef(false);

  // 1. PDFドキュメント読み込み
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setError(null);
    setFallbackToIframe(false);
    pageCacheRef.current = {};
    setRenderedImageUrl(null);

    const targetUrl = getAbsoluteUrl(url);

    loadPdfJs()
      .then((pdfjs) => {
        if (isCancelled) return null;
        return pdfjs.getDocument({
          url: targetUrl,
          withCredentials: false,
        }).promise;
      })
      .then((doc) => {
        if (isCancelled || !doc) return;
        pdfDocRef.current = doc;
        setNumPages(doc.numPages || 1);
        setCurrentPage(1);
        // 最初のページをオフスクリーン描画
        renderPageOffscreen(doc, 1, isCancelled);
      })
      .catch((err) => {
        if (isCancelled) return;
        console.warn("[PdfCanvasViewer] PDF.js load error, fallback to iframe:", err);
        setFallbackToIframe(true);
        setLoading(false);
      });

    return () => {
      isCancelled = true;
      pdfDocRef.current = null;
    };
  }, [url]);

  // 2. オフスクリーンCanvasで描画し、DataURLとして画像化する (チカチカ/ピカピカを完全防止)
  const renderPageOffscreen = async (doc: any, pageNumber: number, isCancelledCheck = false) => {
    if (!doc || isRenderingRef.current) return;

    // すでにキャッシュがある場合は即時適用
    if (pageCacheRef.current[pageNumber]) {
      setRenderedImageUrl(pageCacheRef.current[pageNumber]);
      setLoading(false);
      return;
    }

    try {
      isRenderingRef.current = true;
      const page = await doc.getPage(pageNumber);
      if (isCancelledCheck) return;

      // 高解像度（Retina/ピンチズームでも文字が綺麗）でオフスクリーン描画
      // 基準幅1200px（スマホ〜タブレットで超鮮明）
      const baseViewport = page.getViewport({ scale: 1.0 });
      const targetWidth = 1200;
      const scale = targetWidth / baseViewport.width;
      const viewport = page.getViewport({ scale });

      const offscreenCanvas = document.createElement("canvas");
      offscreenCanvas.width = Math.floor(viewport.width);
      offscreenCanvas.height = Math.floor(viewport.height);

      const ctx = offscreenCanvas.getContext("2d", { alpha: false });
      if (!ctx) return;

      // 背景を純白で塗りつぶす (黒余白ゼロ)
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

      await page.render({
        canvasContext: ctx,
        viewport: viewport,
      }).promise;

      // WebP または PNG で画像データ化
      let dataUrl = offscreenCanvas.toDataURL("image/webp", 0.95);
      if (!dataUrl || !dataUrl.startsWith("data:image/webp")) {
        dataUrl = offscreenCanvas.toDataURL("image/png");
      }

      // キャッシュに保存
      pageCacheRef.current[pageNumber] = dataUrl;
      setRenderedImageUrl(dataUrl);
      setLoading(false);
    } catch (err) {
      console.error("[PdfCanvasViewer] Render error:", err);
      // 万が一失敗した場合はIframeフォールバック
      setFallbackToIframe(true);
      setLoading(false);
    } finally {
      isRenderingRef.current = false;
    }
  };

  // ページ切り替え時
  const handlePageChange = (newPage: number) => {
    if (newPage === currentPage || newPage < 1 || newPage > numPages) return;
    setCurrentPage(newPage);
    if (pdfDocRef.current) {
      renderPageOffscreen(pdfDocRef.current, newPage);
    }
  };

  // Iframeフォールバック
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
      className={`relative w-full rounded-2xl overflow-hidden border border-border bg-white shadow-xs flex flex-col items-center justify-start select-none ${className}`}
      style={aspectRatioA4 ? { aspectRatio: "210 / 297" } : undefined}
    >
      {/* 読込中インジケーター (初回のみ) */}
      {loading && !renderedImageUrl && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white gap-2">
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

      {/* 📄 高画質オフスクリーン描画画像 (チカチカ/ピカピカせず完全に静止表示) */}
      <div className="w-full h-full overflow-y-auto overflow-x-hidden flex flex-col items-center bg-white">
        {renderedImageUrl && (
          <img
            src={renderedImageUrl}
            alt={`${title} - ページ ${currentPage}`}
            className="w-full h-auto block object-contain bg-white shadow-2xs"
            draggable={false}
          />
        )}
      </div>

      {/* 複数ページ時のページネーションバー */}
      {numPages > 1 && (
        <div className="absolute bottom-2.5 inset-x-0 mx-auto w-fit flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/75 text-white backdrop-blur-md shadow-lg text-xs font-black z-20">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => handlePageChange(currentPage - 1)}
            className="p-0.5 rounded-full hover:bg-white/20 disabled:opacity-30 cursor-pointer transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] tracking-widest font-bold">
            {currentPage} / {numPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= numPages}
            onClick={() => handlePageChange(currentPage + 1)}
            className="p-0.5 rounded-full hover:bg-white/20 disabled:opacity-30 cursor-pointer transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
