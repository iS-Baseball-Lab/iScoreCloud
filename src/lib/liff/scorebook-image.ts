// filepath: src/lib/liff/scorebook-image.ts
import type { NormalizedBox } from "@/types/scorebook-v2";

export interface ImagePreprocessOptions {
  rotationDeg: 0 | 90 | 180 | 270;
  enhancePencil: boolean;
  /** トリミング比率 (0〜1) */
  cropInsets?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  maxLongEdge?: number;
}

export interface PreprocessedScorebookImage {
  dataUrl: string;
  base64: string;
  mimeType: string;
  width: number;
  height: number;
}

/**
 * スマホで撮影したスコアブック画像をCanvas上で前処理する
 * - 90度単位の回転補正
 * - 余白トリミング
 * - 長辺2200pxへの高精細リサイズ（文字潰れ防止と高速送信の両立）
 * - 【重要】赤ペンの安打・本塁生還線を鮮やかに残したまま、影を飛ばして薄い鉛筆線を濃くする適応コントラスト強調
 */
export async function preprocessScorebookImage(
  file: File,
  options: ImagePreprocessOptions
): Promise<PreprocessedScorebookImage> {
  const img = await loadImageFromFile(file);
  const maxLongEdge = options.maxLongEdge ?? 2200;
  const insets = options.cropInsets ?? { top: 0, right: 0, bottom: 0, left: 0 };

  // 1. まず回転を適用した中間Canvasを作る
  const isRotated90 = options.rotationDeg === 90 || options.rotationDeg === 270;
  const rotW = isRotated90 ? img.naturalHeight : img.naturalWidth;
  const rotH = isRotated90 ? img.naturalWidth : img.naturalHeight;

  const rotCanvas = document.createElement("canvas");
  rotCanvas.width = rotW;
  rotCanvas.height = rotH;
  const rotCtx = rotCanvas.getContext("2d");
  if (!rotCtx) {
    throw new Error("Canvas 2D context is unavailable");
  }

  rotCtx.save();
  rotCtx.translate(rotW / 2, rotH / 2);
  rotCtx.rotate((options.rotationDeg * Math.PI) / 180);
  rotCtx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  rotCtx.restore();

  // 2. トリミング範囲を計算
  const sx = Math.round(rotW * Math.max(0, Math.min(0.4, insets.left)));
  const sy = Math.round(rotH * Math.max(0, Math.min(0.4, insets.top)));
  const sw = Math.max(
    64,
    Math.round(rotW * (1 - insets.left - insets.right))
  );
  const sh = Math.max(
    64,
    Math.round(rotH * (1 - insets.top - insets.bottom))
  );

  // 3. 長辺 maxLongEdge に収まるようスケール計算
  const longEdge = Math.max(sw, sh);
  const scale = longEdge > maxLongEdge ? maxLongEdge / longEdge : 1;
  const outW = Math.max(64, Math.round(sw * scale));
  const outH = Math.max(64, Math.round(sh * scale));

  const outCanvas = document.createElement("canvas");
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext("2d");
  if (!outCtx) {
    throw new Error("Output Canvas 2D context is unavailable");
  }

  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = "high";
  outCtx.drawImage(rotCanvas, sx, sy, sw, sh, 0, 0, outW, outH);

  // 4. 鉛筆＆赤ペンくっきり補正（紙の影を白く飛ばし、薄い鉛筆を濃く、赤ペンは赤のまま強調）
  if (options.enhancePencil) {
    const imageData = outCtx.getImageData(0, 0, outW, outH);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // 赤ペン判定（早稲田式スコアブックの安打・盗塁・自責点など）
      const redness = r - Math.max(g, b);
      if (redness > 26 && r > 95) {
        // 赤線をくっきり鮮やかに強調
        data[i] = Math.min(255, Math.round(r * 1.08));
        data[i + 1] = Math.max(0, Math.round(g * 0.65));
        data[i + 2] = Math.max(0, Math.round(b * 0.65));
        continue;
      }

      // 青ペン・緑罫線判定も軽く保持しつつ、紙のグレー影と鉛筆のコントラストを引き上げる
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum > 198) {
        // 紙の背景・スマホの薄い影を明るい白へ持ち上げる
        const boost = Math.min(255, Math.round(198 + (lum - 198) * 1.45 + 16));
        const ratio = lum > 0 ? boost / lum : 1;
        data[i] = Math.min(255, Math.round(r * ratio));
        data[i + 1] = Math.min(255, Math.round(g * ratio));
        data[i + 2] = Math.min(255, Math.round(b * ratio));
      } else if (lum < 165) {
        // 鉛筆・黒ボールペンの筆跡を引き締めて濃くする
        const darkFactor = lum < 110 ? 0.68 : 0.82;
        data[i] = Math.max(0, Math.round(r * darkFactor));
        data[i + 1] = Math.max(0, Math.round(g * darkFactor));
        data[i + 2] = Math.max(0, Math.round(b * darkFactor));
      }
    }

    outCtx.putImageData(imageData, 0, 0);
  }

  const mimeType = "image/jpeg";
  const dataUrl = outCanvas.toDataURL(mimeType, 0.88);
  const commaIdx = dataUrl.indexOf(",");
  const base64 = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;

  return {
    dataUrl,
    base64,
    mimeType,
    width: outW,
    height: outH,
  };
}

/**
 * API送信直前に長辺1536px（Gemini Vision 2x2タイル境界）・JPEG品質0.80以内へ軽量化する。
 * 既に軽量な場合は再エンコードせず即座に返し、自動下書き復元された高解像度画像（2000px等）も確実に高速化する。
 * （※クライアント側の Step 3 マス拡大プレビュー用の高精細 dataUrl はそのまま保持される）
 */
export async function ensureCompactApiImage(
  processed: PreprocessedScorebookImage,
  maxLongEdge = 1536,
  quality = 0.8
): Promise<{ base64: string; mimeType: string }> {
  const currentLong = Math.max(processed.width, processed.height);
  if (currentLong <= maxLongEdge && processed.base64.length <= 520_000) {
    return {
      base64: processed.base64,
      mimeType: processed.mimeType,
    };
  }

  const img = await loadImageFromUrl(processed.dataUrl);
  const srcW = img.naturalWidth || processed.width;
  const srcH = img.naturalHeight || processed.height;
  const longEdge = Math.max(srcW, srcH);
  const scale = longEdge > maxLongEdge ? maxLongEdge / longEdge : 1;
  const outW = Math.max(64, Math.round(srcW * scale));
  const outH = Math.max(64, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      base64: processed.base64,
      mimeType: processed.mimeType,
    };
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, outW, outH);

  const mimeType = "image/jpeg";
  const dataUrl = canvas.toDataURL(mimeType, quality);
  const commaIdx = dataUrl.indexOf(",");
  const base64 = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;

  return { base64, mimeType };
}

/**
 * ページ画像(DataURL)から特定の1マスまたは領域([ymin, xmin, ymax, xmax] 0..1000)を切り抜いて拡大プレビューDataURLを生成する
 */
export async function cropScorebookRegion(
  sourceDataUrl: string,
  box: NormalizedBox,
  paddingRatio = 0.22
): Promise<string> {
  const img = await loadImageFromUrl(sourceDataUrl);
  const [ymin, xmin, ymax, xmax] = box;

  const boxW = Math.max(20, xmax - xmin);
  const boxH = Math.max(20, ymax - ymin);
  const padX = boxW * paddingRatio;
  const padY = boxH * paddingRatio;

  const normX1 = Math.max(0, Math.min(980, xmin - padX)) / 1000;
  const normY1 = Math.max(0, Math.min(980, ymin - padY)) / 1000;
  const normX2 = Math.max(normX1 + 0.03, Math.min(1000, xmax + padX) / 1000);
  const normY2 = Math.max(normY1 + 0.03, Math.min(1000, ymax + padY) / 1000);

  const sx = Math.round(img.naturalWidth * normX1);
  const sy = Math.round(img.naturalHeight * normY1);
  const sw = Math.max(40, Math.round(img.naturalWidth * (normX2 - normX1)));
  const sh = Math.max(40, Math.round(img.naturalHeight * (normY2 - normY1)));

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return sourceDataUrl;

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas.toDataURL("image/jpeg", 0.92);
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("画像ファイルの読み込みに失敗しました"));
    };
    img.src = objectUrl;
  });
}

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("プレビュー画像の生成に失敗しました"));
    img.src = url;
  });
}

