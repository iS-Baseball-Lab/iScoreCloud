// filepath: src/lib/liff/scorebook-image.ts
import type {
  NormalizedBox,
  ScorebookGridCorners,
  ScorebookSheetStructure,
} from "@/types/scorebook-v2";
import {
  bilinearGridPoint,
  getCellQuadInStructure,
  getInningSubColumnFractions,
  resolveStructureGridCorners,
  sanitizeGridCorners,
  warpQuadFromRgbaBuffer,
} from "./scorebook-grid";

export interface ImagePreprocessOptions {
  rotationDeg: 0 | 90 | 180 | 270;
  /** 微細な傾き補正角度 (-12〜+12度、0.5度刻み等) */
  fineTiltDeg?: number;
  enhancePencil: boolean;
  /** 斜め撮影・台形歪みを真っ直ぐ長方形へスキャナー補正するシート4隅座標 (0〜1000) */
  perspectiveCorners?: ScorebookGridCorners | null;
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
  /** 4隅台形補正UIでいつでも再調整できるよう保持する回転後・歪み補正前の軽量プレビューDataURL */
  unwarpedPreviewDataUrl?: string;
}

export interface StructureFocusCrops {
  lineupCropBase64: string;
  summaryCropBase64: string;
  mimeType: string;
}

const PENCIL_LUT_SCALE = 1024;
const PENCIL_REL_TO_TARGET_LUT: Uint8Array = (() => {
  const lut = new Uint8Array(PENCIL_LUT_SCALE + 1);
  for (let i = 0; i <= PENCIL_LUT_SCALE; i++) {
    const rel = i / PENCIL_LUT_SCALE;
    if (rel >= 0.93) {
      lut[i] = Math.min(255, Math.round(248 + (rel - 0.93) * 100));
    } else {
      const ink = Math.max(0, (0.93 - rel) / 0.93);
      const gain = Math.min(1, Math.pow(ink * 1.82, 0.94));
      lut[i] = Math.max(0, Math.round(248 * (1 - gain)));
    }
  }
  return lut;
})();

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function releaseCanvas(canvas: HTMLCanvasElement | null | undefined): void {
  if (!canvas) return;
  canvas.width = 1;
  canvas.height = 1;
}

async function canvasToDataUrlAsync(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<string> {
  if (typeof canvas.toBlob !== "function") {
    return canvas.toDataURL(mimeType, quality);
  }
  return new Promise<string>((resolve) => {
    let settled = false;
    const fallbackTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(canvas.toDataURL(mimeType, quality));
    }, 6000);

    try {
      canvas.toBlob(
        (blob) => {
          if (settled) return;
          if (!blob) {
            settled = true;
            clearTimeout(fallbackTimer);
            resolve(canvas.toDataURL(mimeType, quality));
            return;
          }
          const reader = new FileReader();
          reader.onloadend = () => {
            if (settled) return;
            settled = true;
            clearTimeout(fallbackTimer);
            if (typeof reader.result === "string" && reader.result.length > 0) {
              resolve(reader.result);
            } else {
              resolve(canvas.toDataURL(mimeType, quality));
            }
          };
          reader.onerror = () => {
            if (settled) return;
            settled = true;
            clearTimeout(fallbackTimer);
            resolve(canvas.toDataURL(mimeType, quality));
          };
          reader.readAsDataURL(blob);
        },
        mimeType,
        quality
      );
    } catch {
      if (!settled) {
        settled = true;
        clearTimeout(fallbackTimer);
        resolve(canvas.toDataURL(mimeType, quality));
      }
    }
  });
}

/**
 * 照明ムラ・スマホの影を除去しつつ、薄い鉛筆の手書き数字（6-3, 8, ①②③, 背番号）と赤ペンを鮮明化する局所適応コントラスト補正
 * （事前計算LUT＆整数演算によりメインスレッドのブロックを最小化）
 */
function applyAdaptivePencilContrast(
  imageData: ImageData,
  width: number,
  height: number
): void {
  const data = imageData.data;
  const tileCols = 24;
  const tileRows = 18;
  const tileW = Math.max(8, width / tileCols);
  const tileH = Math.max(8, height / tileRows);
  const tileWhite = new Float32Array(tileCols * tileRows);

  // 1. タイルごとに82パーセンタイル輝度（局所の白紙背景レベル）を高速ヒストグラム算出
  const hist = new Uint32Array(32);
  for (let ty = 0; ty < tileRows; ty++) {
    const y0 = Math.floor(ty * tileH);
    const y1 = Math.min(height, Math.floor((ty + 1) * tileH));
    for (let tx = 0; tx < tileCols; tx++) {
      const x0 = Math.floor(tx * tileW);
      const x1 = Math.min(width, Math.floor((tx + 1) * tileW));
      hist.fill(0);
      let count = 0;
      for (let y = y0; y < y1; y += 3) {
        let idx = (y * width + x0) * 4;
        for (let x = x0; x < x1; x += 3) {
          const lum =
            (data[idx] * 77 + data[idx + 1] * 150 + data[idx + 2] * 29) >> 8;
          hist[lum >> 3] += 1;
          count += 1;
          idx += 12;
        }
      }

      if (count === 0) {
        tileWhite[ty * tileCols + tx] = 230;
        continue;
      }

      const targetRank = Math.floor(count * 0.82);
      let acc = 0;
      let whiteBin = 28;
      for (let b = 0; b < 32; b++) {
        acc += hist[b];
        if (acc >= targetRank) {
          whiteBin = b;
          break;
        }
      }
      const estimated = whiteBin * 8 + 4;
      tileWhite[ty * tileCols + tx] = Math.max(140, Math.min(252, estimated));
    }
  }

  // X方向の補間テーブルを事前計算
  const colTx0 = new Int32Array(width);
  const colTx1 = new Int32Array(width);
  const colWx = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const gx = Math.max(
      0,
      Math.min(tileCols - 1.001, (x + 0.5) / tileW - 0.5)
    );
    const tx0 = Math.floor(gx);
    colTx0[x] = tx0;
    colTx1[x] = Math.min(tileCols - 1, tx0 + 1);
    colWx[x] = gx - tx0;
  }

  // 2. 双線形補間で影の境界を滑らかに除去しながら鉛筆筆跡と赤ペンを強調
  for (let y = 0; y < height; y++) {
    const gy = Math.max(0, Math.min(tileRows - 1.001, (y + 0.5) / tileH - 0.5));
    const ty0 = Math.floor(gy);
    const ty1 = Math.min(tileRows - 1, ty0 + 1);
    const wy = gy - ty0;
    const invWy = 1 - wy;
    const row0Base = ty0 * tileCols;
    const row1Base = ty1 * tileCols;

    let i = y * width * 4;
    for (let x = 0; x < width; x++, i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // 赤ペン判定（早稲田式スコアブックの安打・打点・盗塁など）
      const maxGb = g > b ? g : b;
      if (r - maxGb > 20 && r > 85) {
        const nr = (r * 276) >> 8;
        data[i] = nr > 255 ? 255 : nr;
        data[i + 1] = (g * 174) >> 8;
        data[i + 2] = (b * 174) >> 8;
        continue;
      }

      const tx0 = colTx0[x];
      const tx1 = colTx1[x];
      const wx = colWx[x];
      const invWx = 1 - wx;

      const paperLum =
        (tileWhite[row0Base + tx0] * invWx + tileWhite[row0Base + tx1] * wx) *
          invWy +
        (tileWhite[row1Base + tx0] * invWx + tileWhite[row1Base + tx1] * wx) *
          wy;

      const lum = (r * 77 + g * 150 + b * 29) >> 8;
      if (lum <= 1) continue;

      let lutIdx =
        paperLum > 1
          ? ((lum * PENCIL_LUT_SCALE) / paperLum) | 0
          : PENCIL_LUT_SCALE;
      if (lutIdx < 0) lutIdx = 0;
      else if (lutIdx > PENCIL_LUT_SCALE) lutIdx = PENCIL_LUT_SCALE;

      const targetLum = PENCIL_REL_TO_TARGET_LUT[lutIdx];
      const scale256 = ((targetLum << 8) / lum) | 0;
      const nr = (r * scale256) >> 8;
      const ng = (g * scale256) >> 8;
      const nb = (b * scale256) >> 8;
      data[i] = nr > 255 ? 255 : nr < 0 ? 0 : nr;
      data[i + 1] = ng > 255 ? 255 : ng < 0 ? 0 : ng;
      data[i + 2] = nb > 255 ? 255 : nb < 0 ? 0 : nb;
    }
  }
}

/**
 * スマホで撮影したスコアブック画像をCanvas上で安全・高速に前処理する
 * - iOS Safari / LINE WKWebView の 16.77MP Canvas上限クラッシュを完全回避（事前縮小描画＋即時メモリ解放）
 * - UIスレッドをフリーズさせないフレーム分割＆非同期Blobエンコード
 * - 90度回転・微細傾き・4隅台形歪み・余白トリミング・照明ムラ除去＆鉛筆強調
 */
export async function preprocessScorebookImage(
  file: File,
  options: ImagePreprocessOptions
): Promise<PreprocessedScorebookImage> {
  await yieldToMainThread();

  const maxLongEdge = Math.min(2600, Math.max(600, options.maxLongEdge ?? 2400));
  const insets = options.cropInsets ?? { top: 0, right: 0, bottom: 0, left: 0 };

  let rotCanvas: HTMLCanvasElement | null = null;
  let prevCanvas: HTMLCanvasElement | null = null;
  let outCanvas: HTMLCanvasElement | null = null;

  try {
    // 1. 画像デコードと90度回転＋微細傾き補正（iOS 16.77MP上限を超えないよう中間Canvas時点で縮小描画）
    const {
      source: decodedSource,
      width: rawW,
      height: rawH,
      cleanup,
    } = await loadDecodedImageFromFile(file);
    let rotW = 64;
    let rotH = 64;
    let rotCtx: CanvasRenderingContext2D | null = null;

    try {
      if (rawW < 16 || rawH < 16) {
        throw new Error("画像サイズが小さすぎるか破損しています");
      }

      const isRotated90 =
        options.rotationDeg === 90 || options.rotationDeg === 270;
      const fullRotW = isRotated90 ? rawH : rawW;
      const fullRotH = isRotated90 ? rawW : rawH;

      // 中間Canvasは最大2560px（約4.9MP）以下に抑え、24MP/48MPスマホ写真でもiOS WebKit上限(16.7MP)の1/3未満を厳守
      const maxIntermEdge = Math.min(2560, Math.round(maxLongEdge * 1.06));
      const intermScale =
        Math.max(fullRotW, fullRotH) > maxIntermEdge
          ? maxIntermEdge / Math.max(fullRotW, fullRotH)
          : 1;

      rotW = Math.max(64, Math.round(fullRotW * intermScale));
      rotH = Math.max(64, Math.round(fullRotH * intermScale));
      const drawW = Math.max(64, Math.round(rawW * intermScale));
      const drawH = Math.max(64, Math.round(rawH * intermScale));

      const fineTilt = Math.max(-15, Math.min(15, options.fineTiltDeg ?? 0));
      const totalAngleRad = ((options.rotationDeg + fineTilt) * Math.PI) / 180;

      rotCanvas = document.createElement("canvas");
      rotCanvas.width = rotW;
      rotCanvas.height = rotH;
      rotCtx = rotCanvas.getContext("2d");
      if (!rotCtx) {
        throw new Error(
          "端末のメモリが不足しています。不要なタブを閉じて再度お試しください"
        );
      }

      // 微細回転時に四隅が黒くならないよう紙面に近い白で下塗り
      rotCtx.fillStyle = "#f8fafc";
      rotCtx.fillRect(0, 0, rotW, rotH);
      rotCtx.imageSmoothingEnabled = true;
      rotCtx.imageSmoothingQuality = "high";
      rotCtx.save();
      rotCtx.translate(rotW / 2, rotH / 2);
      rotCtx.rotate(totalAngleRad);
      rotCtx.drawImage(decodedSource, -drawW / 2, -drawH / 2, drawW, drawH);
      rotCtx.restore();
    } finally {
      // デコード済みビットマップ / ObjectURL を即座に解放
      cleanup();
    }

    await yieldToMainThread();

    // 4隅ドラッグUI用の軽量ベースプレビューを生成（長辺960px）し、生成直後に中間プレビューCanvasを解放
    const prevScale =
      Math.max(rotW, rotH) > 960 ? 960 / Math.max(rotW, rotH) : 1;
    prevCanvas = document.createElement("canvas");
    prevCanvas.width = Math.max(64, Math.round(rotW * prevScale));
    prevCanvas.height = Math.max(64, Math.round(rotH * prevScale));
    const prevCtx = prevCanvas.getContext("2d");
    let unwarpedPreviewDataUrl: string | undefined;
    if (prevCtx) {
      prevCtx.imageSmoothingEnabled = true;
      prevCtx.imageSmoothingQuality = "high";
      prevCtx.drawImage(rotCanvas, 0, 0, prevCanvas.width, prevCanvas.height);
      unwarpedPreviewDataUrl = await canvasToDataUrlAsync(
        prevCanvas,
        "image/jpeg",
        0.8
      );
    }
    releaseCanvas(prevCanvas);
    prevCanvas = null;

    await yieldToMainThread();

    const validPersp = sanitizeGridCorners(options.perspectiveCorners);
    let outW: number;
    let outH: number;
    outCanvas = document.createElement("canvas");
    let outCtx: CanvasRenderingContext2D | null = null;

    if (validPersp) {
      // 2A. 4隅指定による台形・斜め歪みホモグラフィ補正（スキャナー平面化）
      const tlPx: [number, number] = [
        (validPersp.tl[0] / 1000) * rotW,
        (validPersp.tl[1] / 1000) * rotH,
      ];
      const trPx: [number, number] = [
        (validPersp.tr[0] / 1000) * rotW,
        (validPersp.tr[1] / 1000) * rotH,
      ];
      const brPx: [number, number] = [
        (validPersp.br[0] / 1000) * rotW,
        (validPersp.br[1] / 1000) * rotH,
      ];
      const blPx: [number, number] = [
        (validPersp.bl[0] / 1000) * rotW,
        (validPersp.bl[1] / 1000) * rotH,
      ];

      const topEdgeW = Math.hypot(trPx[0] - tlPx[0], trPx[1] - tlPx[1]);
      const botEdgeW = Math.hypot(brPx[0] - blPx[0], brPx[1] - blPx[1]);
      const leftEdgeH = Math.hypot(blPx[0] - tlPx[0], blPx[1] - tlPx[1]);
      const rightEdgeH = Math.hypot(brPx[0] - trPx[0], brPx[1] - trPx[1]);

      const rawWarpW = Math.max(64, Math.max(topEdgeW, botEdgeW));
      const rawWarpH = Math.max(64, Math.max(leftEdgeH, rightEdgeH));
      const warpScale =
        Math.max(rawWarpW, rawWarpH) > maxLongEdge
          ? maxLongEdge / Math.max(rawWarpW, rawWarpH)
          : 1;

      outW = Math.max(64, Math.round(rawWarpW * warpScale));
      outH = Math.max(64, Math.round(rawWarpH * warpScale));
      outCanvas.width = outW;
      outCanvas.height = outH;
      outCtx = outCanvas.getContext("2d");
      if (!outCtx) {
        throw new Error("出力用Canvasの確保に失敗しました");
      }

      const srcBuffer = rotCtx.getImageData(0, 0, rotW, rotH);
      releaseCanvas(rotCanvas);
      rotCanvas = null;

      const dstImgData = outCtx.createImageData(outW, outH);
      warpQuadFromRgbaBuffer(
        srcBuffer.data,
        rotW,
        rotH,
        { tl: tlPx, tr: trPx, br: brPx, bl: blPx },
        dstImgData.data,
        outW,
        outH
      );
      outCtx.putImageData(dstImgData, 0, 0);
    } else {
      // 2B. 通常の矩形トリミング範囲を計算
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

      const longEdge = Math.max(sw, sh);
      const scale = longEdge > maxLongEdge ? maxLongEdge / longEdge : 1;
      outW = Math.max(64, Math.round(sw * scale));
      outH = Math.max(64, Math.round(sh * scale));

      outCanvas.width = outW;
      outCanvas.height = outH;
      outCtx = outCanvas.getContext("2d");
      if (!outCtx) {
        throw new Error("出力用Canvasの確保に失敗しました");
      }

      outCtx.imageSmoothingEnabled = true;
      outCtx.imageSmoothingQuality = "high";
      outCtx.drawImage(rotCanvas, sx, sy, sw, sh, 0, 0, outW, outH);
      releaseCanvas(rotCanvas);
      rotCanvas = null;
    }

    // 4. 局所適応の影除去＆鉛筆・赤ペン強調
    if (options.enhancePencil) {
      await yieldToMainThread();
      const imageData = outCtx.getImageData(0, 0, outW, outH);
      applyAdaptivePencilContrast(imageData, outW, outH);
      outCtx.putImageData(imageData, 0, 0);
    }

    await yieldToMainThread();
    const mimeType = "image/jpeg";
    const dataUrl = await canvasToDataUrlAsync(outCanvas, mimeType, 0.9);
    const base64 = stripDataUrlPrefix(dataUrl);

    return {
      dataUrl,
      base64,
      mimeType,
      width: outW,
      height: outH,
      unwarpedPreviewDataUrl,
    };
  } finally {
    releaseCanvas(rotCanvas);
    releaseCanvas(prevCanvas);
    releaseCanvas(outCanvas);
  }
}

/**
 * API送信直前に高精細を維持しつつ適切なペイロードサイズに整える
 */
export async function ensureCompactApiImage(
  processed: PreprocessedScorebookImage,
  maxLongEdge = 1850,
  quality = 0.88
): Promise<{ base64: string; mimeType: string }> {
  const currentLong = Math.max(processed.width, processed.height);
  if (
    currentLong <= maxLongEdge &&
    processed.base64.length > 0 &&
    processed.base64.length <= 920_000
  ) {
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
  try {
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return {
        base64: processed.base64 || stripDataUrlPrefix(processed.dataUrl),
        mimeType: processed.mimeType,
      };
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, outW, outH);

    const mimeType = "image/jpeg";
    const dataUrl = await canvasToDataUrlAsync(canvas, mimeType, quality);
    return { base64: stripDataUrlPrefix(dataUrl), mimeType };
  } finally {
    releaseCanvas(canvas);
  }
}

/**
 * シートの上下左右4辺の余白端（外側約1.4%）に「0〜1000の精密目盛りルーラー」を重ねた全体画像を生成する。
 * キャンバスサイズを元画像と100%同一比率（余白追加ゼロ）に保つことで、
 * Gemini本来の内部ビジョン空間座標(0..1000)と印刷された目盛り数値(0..1000)を1pxの狂いもなく完全一致させる。
 */
export async function buildCalibratedRulerSheetImage(
  processed: PreprocessedScorebookImage,
  maxInnerLongEdge = 1850,
  quality = 0.89
): Promise<{ base64: string; mimeType: string }> {
  let canvas: HTMLCanvasElement | null = null;
  try {
    const img = await loadImageFromUrl(processed.dataUrl);
    const srcW = img.naturalWidth || processed.width;
    const srcH = img.naturalHeight || processed.height;
    const longEdge = Math.max(srcW, srcH);
    const scale =
      longEdge > maxInnerLongEdge ? maxInnerLongEdge / longEdge : 1;
    const innerW = Math.max(120, Math.round(srcW * scale));
    const innerH = Math.max(120, Math.round(srcH * scale));

    canvas = document.createElement("canvas");
    canvas.width = innerW;
    canvas.height = innerH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return ensureCompactApiImage(processed, maxInnerLongEdge, quality);
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, srcW, srcH, 0, 0, innerW, innerH);

    const bandH = 22;
    const bandW = 28;
    ctx.fillStyle = "rgba(15, 23, 42, 0.82)";
    ctx.fillRect(0, 0, innerW, bandH);
    ctx.fillRect(0, innerH - bandH, innerW, bandH);
    ctx.fillRect(0, bandH, bandW, innerH - bandH * 2);
    ctx.fillRect(innerW - bandW, bandH, bandW, innerH - bandH * 2);

    ctx.font = "bold 10px sans-serif";

    // 上辺・下辺 X座標ルーラー (0..1000, 元画像と100%同一座標系)
    ctx.textAlign = "center";
    for (let v = 20; v <= 980; v += 10) {
      const px = (v / 1000) * innerW;
      const is100 = v % 100 === 0;
      const is50 = v % 50 === 0;
      const tickLen = is100 ? 8 : is50 ? 5 : 3;
      ctx.strokeStyle = is100 ? "#38bdf8" : is50 ? "#f8fafc" : "#94a3b8";
      ctx.lineWidth = is100 ? 1.8 : 1;

      // 上辺目盛り（内側へ向かって伸びる）
      ctx.beginPath();
      ctx.moveTo(px, bandH - tickLen);
      ctx.lineTo(px, bandH);
      ctx.stroke();

      // 下辺目盛り（内側へ向かって伸びる）
      ctx.beginPath();
      ctx.moveTo(px, innerH - bandH);
      ctx.lineTo(px, innerH - bandH + tickLen);
      ctx.stroke();

      if (is50 && v >= 50 && v <= 950) {
        ctx.fillStyle = is100 ? "#38bdf8" : "#f1f5f9";
        ctx.textBaseline = "top";
        ctx.fillText(String(v), px, 2);
        ctx.textBaseline = "bottom";
        ctx.fillText(String(v), px, innerH - 2);
      }
    }

    // 左辺・右辺 Y座標ルーラー (0..1000, 元画像と100%同一座標系)
    for (let v = 30; v <= 970; v += 10) {
      const py = (v / 1000) * innerH;
      const is100 = v % 100 === 0;
      const is50 = v % 50 === 0;
      const tickLen = is100 ? 7 : is50 ? 5 : 3;
      ctx.strokeStyle = is100 ? "#34d399" : is50 ? "#f8fafc" : "#94a3b8";
      ctx.lineWidth = is100 ? 1.8 : 1;

      // 左辺目盛り
      ctx.beginPath();
      ctx.moveTo(bandW - tickLen, py);
      ctx.lineTo(bandW, py);
      ctx.stroke();

      // 右辺目盛り
      ctx.beginPath();
      ctx.moveTo(innerW - bandW, py);
      ctx.lineTo(innerW - bandW + tickLen, py);
      ctx.stroke();

      if (is50 && v >= 50 && v <= 950) {
        ctx.fillStyle = is100 ? "#34d399" : "#f1f5f9";
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.fillText(String(v), 2, py);
        ctx.textAlign = "right";
        ctx.fillText(String(v), innerW - 2, py);
      }
    }

    const mimeType = "image/jpeg";
    const dataUrl = await canvasToDataUrlAsync(canvas, mimeType, quality);
    return {
      base64: stripDataUrlPrefix(dataUrl),
      mimeType,
    };
  } catch {
    return ensureCompactApiImage(processed, maxInnerLongEdge, quality);
  } finally {
    releaseCanvas(canvas);
  }
}

/**
 * Stage 1（骨格スキャン）精度向上のため、マスター画像から
 * 1) 左側 0%〜42%「打順・守備位置・背番号・選手名・途中交代欄」の高精細拡大クロップ
 * 2) 上部 0%〜28%「スコアボード＆イニング見出し番号」＋下部 56%〜100%「各回計＆投手継投成績欄」の上下結合拡大クロップ
 * を自動生成する。
 */
export async function extractStructureFocusCrops(
  sourceDataUrl: string,
  alreadyEnhanced = false
): Promise<StructureFocusCrops | null> {
  let lineupCanvas: HTMLCanvasElement | null = null;
  let sumCanvas: HTMLCanvasElement | null = null;
  try {
    const img = await loadImageFromUrl(sourceDataUrl);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w < 120 || h < 120) return null;

    const mimeType = "image/jpeg";

    // 1. 左側 0%〜42%（選手氏名・交代段が広い様式でも見切れない余裕幅）の高解像度クロップ
    const lineupSrcW = Math.max(64, Math.round(w * 0.42));
    const lineupSrcH = h;
    const lineupMaxEdge = 1750;
    const lineupScale =
      Math.max(lineupSrcW, lineupSrcH) > lineupMaxEdge
        ? lineupMaxEdge / Math.max(lineupSrcW, lineupSrcH)
        : 1;
    lineupCanvas = document.createElement("canvas");
    lineupCanvas.width = Math.max(64, Math.round(lineupSrcW * lineupScale));
    lineupCanvas.height = Math.max(64, Math.round(lineupSrcH * lineupScale));
    const lineupCtx = lineupCanvas.getContext("2d");
    if (!lineupCtx) return null;
    lineupCtx.imageSmoothingEnabled = true;
    lineupCtx.imageSmoothingQuality = "high";
    lineupCtx.drawImage(
      img,
      0,
      0,
      lineupSrcW,
      lineupSrcH,
      0,
      0,
      lineupCanvas.width,
      lineupCanvas.height
    );
    if (!alreadyEnhanced) {
      const lineupImgData = lineupCtx.getImageData(
        0,
        0,
        lineupCanvas.width,
        lineupCanvas.height
      );
      applyAdaptivePencilContrast(
        lineupImgData,
        lineupCanvas.width,
        lineupCanvas.height
      );
      lineupCtx.putImageData(lineupImgData, 0, 0);
    }
    const lineupCropBase64 = stripDataUrlPrefix(
      await canvasToDataUrlAsync(lineupCanvas, mimeType, 0.9)
    );
    releaseCanvas(lineupCanvas);
    lineupCanvas = null;

    // 2. 上部 0%〜28%（スコアボード＆イニング列ヘッダー番号）＋ 下部 56%〜100%（各列合計得点・安打・複数行の投手継投欄）を結合
    const topStripH = Math.max(48, Math.round(h * 0.28));
    const botStripY = Math.round(h * 0.56);
    const botStripH = Math.max(48, h - botStripY);
    const dividerH = 10;
    const rawCompW = w;
    const rawCompH = topStripH + dividerH + botStripH;
    const summaryMaxEdge = 1750;
    const sumScale =
      Math.max(rawCompW, rawCompH) > summaryMaxEdge
        ? summaryMaxEdge / Math.max(rawCompW, rawCompH)
        : 1;

    sumCanvas = document.createElement("canvas");
    sumCanvas.width = Math.max(64, Math.round(rawCompW * sumScale));
    sumCanvas.height = Math.max(64, Math.round(rawCompH * sumScale));
    const sumCtx = sumCanvas.getContext("2d");
    if (!sumCtx) return null;
    sumCtx.imageSmoothingEnabled = true;
    sumCtx.imageSmoothingQuality = "high";

    const outTopH = Math.round(topStripH * sumScale);
    const outDivH = Math.max(6, Math.round(dividerH * sumScale));
    const outBotH = Math.max(24, sumCanvas.height - outTopH - outDivH);

    sumCtx.drawImage(img, 0, 0, w, topStripH, 0, 0, sumCanvas.width, outTopH);
    sumCtx.fillStyle = "#0f172a";
    sumCtx.fillRect(0, outTopH, sumCanvas.width, outDivH);
    sumCtx.drawImage(
      img,
      0,
      botStripY,
      w,
      botStripH,
      0,
      outTopH + outDivH,
      sumCanvas.width,
      outBotH
    );

    if (!alreadyEnhanced) {
      const topImgData = sumCtx.getImageData(0, 0, sumCanvas.width, outTopH);
      applyAdaptivePencilContrast(topImgData, sumCanvas.width, outTopH);
      sumCtx.putImageData(topImgData, 0, 0);

      const botImgData = sumCtx.getImageData(
        0,
        outTopH + outDivH,
        sumCanvas.width,
        outBotH
      );
      applyAdaptivePencilContrast(botImgData, sumCanvas.width, outBotH);
      sumCtx.putImageData(botImgData, 0, outTopH + outDivH);
    }

    const summaryCropBase64 = stripDataUrlPrefix(
      await canvasToDataUrlAsync(sumCanvas, mimeType, 0.9)
    );

    return {
      lineupCropBase64,
      summaryCropBase64,
      mimeType,
    };
  } catch {
    return null;
  } finally {
    releaseCanvas(lineupCanvas);
    releaseCanvas(sumCanvas);
  }
}

export interface InningChunkCropOptions {
  /** Stage 1・Step 2で確定したシート骨格構造（歪み4隅 gridCorners・複数列 columnCount 含む） */
  structure?: ScorebookSheetStructure;
  /** Stage 1・Step 2で確定した打順欄の右端X座標 (0〜1000) */
  lineupRightX?: number;
  /** 1回列の左端X座標 (0〜1000) */
  firstInningMinX?: number;
  /** 打順ごとの行Y座標ガイド */
  batters?: ReadonlyArray<{
    battingOrder: number;
    name: string;
    rowBox?: NormalizedBox;
  }>;
  /** 対象イニング番号 */
  targetInnings?: readonly number[];
  /** 前処理時点で既に鉛筆くっきり補正済みかどうか */
  alreadyEnhanced?: boolean;
}

/**
 * Stage 2（イニング分割ディープ解析）向けに、上下左右の隣接マスの映り込みを物理的にゼロ化し、
 * 1イニング2列・3列以上（打者一巡・二巡）および原本の傾き・台形歪み（gridCorners）にも対応した
 * 「サブ列×打順 射影補正セルマトリクス画像」を生成する。
 * ※早稲田式の赤線（安打線）と混同しないよう、赤色の枠線は一切描画しない。
 */
export async function extractInningChunkCompositeCrop(
  sourceDataUrl: string,
  columnBoxes: NormalizedBox[],
  options?: InningChunkCropOptions
): Promise<{ base64: string; mimeType: string } | null> {
  if (columnBoxes.length === 0 && !options?.structure) return null;
  try {
    const img = await loadImageFromUrl(sourceDataUrl);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w < 120 || h < 120) return null;

    // ━━━ モードS（最優先・歪み射影補正＆複数列完全分離マトリクス） ━━━
    // structure が渡されている場合、gridCorners の傾き・台形歪みをホモグラフィで真っ直ぐ補正しつつ、
    // 1イニング2列・3列以上を「1列目[c:1]」「2列目[c:2]」「3列目[c:3]」として1列ずつ独立並列描画する
    if (
      options?.structure &&
      options.structure.batters.length >= 4 &&
      options.structure.innings.length >= 1
    ) {
      const struct = options.structure;
      const corners = resolveStructureGridCorners(struct);
      const sortedBatters = [...struct.batters].sort(
        (a, b) => a.battingOrder - b.battingOrder
      );
      const bLen = sortedBatters.length;

      const targetNums =
        options.targetInnings && options.targetInnings.length > 0
          ? options.targetInnings
          : struct.innings.map((m) => m.inning);

      const subColSpecs: Array<{
        inning: number;
        subCol: number;
        totalSubCols: number;
      }> = [];
      for (const innNum of targetNums) {
        const meta = struct.innings.find((m) => m.inning === innNum);
        if (!meta) continue;
        const cols = Math.max(1, meta.columnCount || 1);
        for (let sc = 1; sc <= cols; sc++) {
          subColSpecs.push({
            inning: innNum,
            subCol: sc,
            totalSubCols: cols,
          });
        }
      }

      if (subColSpecs.length > 0) {
        const sampleQuad = getCellQuadInStructure(
          struct,
          subColSpecs[0].inning,
          subColSpecs[0].subCol,
          sortedBatters[0].battingOrder,
          0.035
        );
        if (sampleQuad) {
          const sampleW = Math.hypot(
            ((sampleQuad.tr[0] - sampleQuad.tl[0]) * w) / 1000,
            ((sampleQuad.tr[1] - sampleQuad.tl[1]) * h) / 1000
          );
          const sampleH = Math.hypot(
            ((sampleQuad.bl[0] - sampleQuad.tl[0]) * w) / 1000,
            ((sampleQuad.bl[1] - sampleQuad.tl[1]) * h) / 1000
          );
          const singleAspect = Math.max(
            0.78,
            Math.min(2.15, sampleW / Math.max(16, sampleH))
          );

          const colCount = subColSpecs.length;
          // 1〜2列イニングは縦に細長いストリップ（428×1666等）にするとVisionエンコーダ縮小時にBSO欄が潰れるため、
          // 左段（前半打順: 1〜5番）・右段（後半打順: 6〜9番）の2段並列ニアスクエア高精細グリッド（1マス約320×256px）に展開する
          const useTwoBlockSplit = colCount <= 2 && bLen >= 6;
          const blockCount = useTwoBlockSplit ? 2 : 1;
          const rowsPerBlock = useTwoBlockSplit
            ? Math.ceil(bLen / 2)
            : bLen;

          const rowOutH = useTwoBlockSplit
            ? colCount === 1
              ? 256
              : 216
            : colCount === 3
            ? 192
            : 164;
          const minCellW = useTwoBlockSplit
            ? colCount === 1
              ? 296
              : 224
            : 204;
          const maxCellW = useTwoBlockSplit
            ? colCount === 1
              ? 392
              : 288
            : colCount === 3
            ? 256
            : 220;
          const cellOutW = Math.max(
            minCellW,
            Math.min(maxCellW, Math.round(rowOutH * singleAspect))
          );
          const labelPanelW = useTwoBlockSplit
            ? colCount === 1
              ? 172
              : 148
            : 196;
          const gutterW = 8;
          const rowGapH = 10;
          const headerH = 88;
          const blockDividerW = 22;
          const outerPadX = 12;

          const singleBlockW =
            labelPanelW + colCount * (gutterW + cellOutW);
          const totalW =
            outerPadX * 2 +
            blockCount * singleBlockW +
            (blockCount - 1) * blockDividerW;
          const totalH =
            headerH + rowsPerBlock * (rowOutH + rowGapH) + 8;

          // ソース画像を1度だけキャンバス展開してRGBAバッファから高速ホモグラフィ切り出しを行う
          const srcCanvas = document.createElement("canvas");
          srcCanvas.width = w;
          srcCanvas.height = h;
          const srcCtx = srcCanvas.getContext("2d");

          const canvas = document.createElement("canvas");
          canvas.width = totalW;
          canvas.height = totalH;
          const ctx = canvas.getContext("2d");

          if (srcCtx && ctx) {
            srcCtx.drawImage(img, 0, 0, w, h);
            const fullSrcData = srcCtx.getImageData(0, 0, w, h).data;

            ctx.fillStyle = "#0f172a";
            ctx.fillRect(0, 0, totalW, totalH);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";

            if (blockCount === 2) {
              const divX = outerPadX + singleBlockW + Math.floor(blockDividerW / 2);
              ctx.strokeStyle = "#334155";
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(divX, 6);
              ctx.lineTo(divX, totalH - 6);
              ctx.stroke();
            }

            const innTitle =
              targetNums.length > 0
                ? `${targetNums.join("・")}回`
                : "対象イニング";

            // サブ列ごとの色分け（早稲田式の赤線と絶対混同しない寒色・アンバー・エメラルド系）
            const subColPalette = [
              "#0284c7", // c:1 スカイブルー
              "#d97706", // c:2 アンバー（2列目＝打者一巡）
              "#059669", // c:3 エメラルド（3列目＝打者二巡）
              "#7c3aed", // c:4 バイオレット
            ];

            // 各ブロック（左段・右段）の上部ヘッダーを描画
            for (let blkIdx = 0; blkIdx < blockCount; blkIdx++) {
              const blockOriginX =
                outerPadX + blkIdx * (singleBlockW + blockDividerW);
              const rangeStartBo =
                sortedBatters[blkIdx * rowsPerBlock]?.battingOrder ?? 1;
              const rangeEndBo =
                sortedBatters[
                  Math.min(bLen - 1, (blkIdx + 1) * rowsPerBlock - 1)
                ]?.battingOrder ?? bLen;

              ctx.fillStyle = "#38bdf8";
              ctx.font = "bold 15px sans-serif";
              ctx.textAlign = "left";
              ctx.textBaseline = "middle";
              ctx.fillText(
                blockCount === 2
                  ? `【${innTitle}】${blkIdx === 0 ? "左段" : "右段"}`
                  : `【${innTitle} 独立セル】`,
                blockOriginX + 4,
                22
              );
              ctx.fillStyle = "#f8fafc";
              ctx.font = "bold 13px sans-serif";
              ctx.fillText(
                blockCount === 2
                  ? `▼ ${rangeStartBo}番〜${rangeEndBo}番打者`
                  : colCount >= 2
                  ? `全${colCount}列を分離拡大`
                  : "各打順1マス拡大",
                blockOriginX + 4,
                48
              );
              ctx.fillStyle = "#94a3b8";
              ctx.font = "bold 10px sans-serif";
              ctx.fillText("左細枠=BSO / 中央=アウト", blockOriginX + 4, 70);

              for (let cIdx = 0; cIdx < colCount; cIdx++) {
                const spec = subColSpecs[cIdx];
                const colDstX =
                  blockOriginX +
                  labelPanelW +
                  gutterW +
                  cIdx * (cellOutW + gutterW);
                const accent =
                  subColPalette[(spec.subCol - 1) % subColPalette.length];

                // デジタルバッジ（AIに c:1, c:2, c:3 を100%誤認させない明示ヘッダー）
                ctx.fillStyle = accent;
                ctx.fillRect(colDstX, 6, cellOutW, 26);
                ctx.fillStyle = "#ffffff";
                ctx.font = "bold 13px sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                const hdrLabel =
                  spec.totalSubCols >= 2
                    ? `${spec.inning}回 ${spec.subCol}列目 [c:${spec.subCol}]`
                    : `${spec.inning}回 [c:1] (${rangeStartBo}〜${rangeEndBo}番)`;
                ctx.fillText(hdrLabel, colDstX + cellOutW / 2, 19);

                // 原本のイニング番号印字部分のホモグラフィ切り抜き
                const frac = getInningSubColumnFractions(
                  struct.innings,
                  spec.inning,
                  spec.subCol
                );
                if (frac) {
                  const hdrT0 = -0.62 / Math.max(1, bLen);
                  const hdrT1 = 0.02 / Math.max(1, bLen);
                  const hdrQuad = {
                    tl: bilinearGridPoint(corners, frac.s0, hdrT0),
                    tr: bilinearGridPoint(corners, frac.s1, hdrT0),
                    br: bilinearGridPoint(corners, frac.s1, hdrT1),
                    bl: bilinearGridPoint(corners, frac.s0, hdrT1),
                  };
                  const hdrOutH = headerH - 40;
                  const hdrImgData = ctx.createImageData(cellOutW, hdrOutH);
                  warpQuadFromRgbaBuffer(
                    fullSrcData,
                    w,
                    h,
                    {
                      tl: [
                        (Math.max(0, hdrQuad.tl[0]) * w) / 1000,
                        (Math.max(0, hdrQuad.tl[1]) * h) / 1000,
                      ],
                      tr: [
                        (Math.min(1000, hdrQuad.tr[0]) * w) / 1000,
                        (Math.max(0, hdrQuad.tr[1]) * h) / 1000,
                      ],
                      br: [
                        (Math.min(1000, hdrQuad.br[0]) * w) / 1000,
                        (Math.min(1000, hdrQuad.br[1]) * h) / 1000,
                      ],
                      bl: [
                        (Math.max(0, hdrQuad.bl[0]) * w) / 1000,
                        (Math.min(1000, hdrQuad.bl[1]) * h) / 1000,
                      ],
                    },
                    hdrImgData.data,
                    cellOutW,
                    hdrOutH
                  );
                  ctx.putImageData(hdrImgData, colDstX, 34);
                  ctx.strokeStyle = accent;
                  ctx.lineWidth = 1.5;
                  ctx.strokeRect(colDstX, 34, cellOutW, hdrOutH);
                }
              }
            }

            // 横罫線の傾き勾配（左側の選手名欄も同じ傾きで真っ直ぐ切り抜くために使用）
            const gridSlopeY =
              (corners.tr[1] -
                corners.tl[1] +
                (corners.br[1] - corners.bl[1])) /
              Math.max(
                120,
                corners.tr[0] -
                  corners.tl[0] +
                  (corners.br[0] - corners.bl[0])
              );

            // 各打順行 × 各サブ列の1マス超高精細射影展開
            for (let bIdx = 0; bIdx < bLen; bIdx++) {
              const batter = sortedBatters[bIdx];
              const blkIdx = useTwoBlockSplit
                ? Math.floor(bIdx / rowsPerBlock)
                : 0;
              const localRowIdx = useTwoBlockSplit
                ? bIdx % rowsPerBlock
                : bIdx;
              const blockOriginX =
                outerPadX + blkIdx * (singleBlockW + blockDividerW);
              const dstY = headerH + localRowIdx * (rowOutH + rowGapH);

              // 左パネル: 視認性抜群の打順番号バッジ＋傾き補正済みの選手欄サムネイル
              ctx.fillStyle = "#1e293b";
              ctx.fillRect(blockOriginX, dstY, labelPanelW, rowOutH);
              ctx.fillStyle = "#0284c7";
              ctx.fillRect(blockOriginX, dstY, labelPanelW, 30);
              ctx.fillStyle = "#ffffff";
              ctx.font = "bold 14px sans-serif";
              ctx.textAlign = "left";
              ctx.textBaseline = "middle";
              const displayName = (batter.name || "").slice(0, 7);
              ctx.fillText(
                `${batter.battingOrder}番 ${displayName}`,
                blockOriginX + 7,
                dstY + 15
              );

              const t0 = bIdx / bLen;
              const t1 = (bIdx + 1) / bLen;
              const pGridTop = bilinearGridPoint(corners, 0, t0);
              const pGridBot = bilinearGridPoint(corners, 0, t1);
              const leftX = 8;
              const leftTopY = Math.max(
                0,
                Math.min(1000, pGridTop[1] - (pGridTop[0] - leftX) * gridSlopeY)
              );
              const leftBotY = Math.max(
                0,
                Math.min(1000, pGridBot[1] - (pGridBot[0] - leftX) * gridSlopeY)
              );

              const nameThumbW = labelPanelW - 10;
              const nameThumbH = rowOutH - 38;
              const nameImgData = ctx.createImageData(nameThumbW, nameThumbH);
              warpQuadFromRgbaBuffer(
                fullSrcData,
                w,
                h,
                {
                  tl: [(leftX * w) / 1000, (leftTopY * h) / 1000],
                  tr: [(pGridTop[0] * w) / 1000, (pGridTop[1] * h) / 1000],
                  br: [(pGridBot[0] * w) / 1000, (pGridBot[1] * h) / 1000],
                  bl: [(leftX * w) / 1000, (leftBotY * h) / 1000],
                },
                nameImgData.data,
                nameThumbW,
                nameThumbH
              );
              ctx.putImageData(nameImgData, blockOriginX + 5, dstY + 34);

              // 右側: サブ列ごとに1マスずつ大判ホモグラフィ展開して配置
              for (let cIdx = 0; cIdx < colCount; cIdx++) {
                const spec = subColSpecs[cIdx];
                const colDstX =
                  blockOriginX +
                  labelPanelW +
                  gutterW +
                  cIdx * (cellOutW + gutterW);
                const accent =
                  subColPalette[(spec.subCol - 1) % subColPalette.length];

                const cellQuad = getCellQuadInStructure(
                  struct,
                  spec.inning,
                  spec.subCol,
                  batter.battingOrder,
                  0.035
                );
                if (!cellQuad) continue;

                const cellImgData = ctx.createImageData(cellOutW, rowOutH);
                warpQuadFromRgbaBuffer(
                  fullSrcData,
                  w,
                  h,
                  {
                    tl: [
                      (Math.max(0, Math.min(1000, cellQuad.tl[0])) * w) / 1000,
                      (Math.max(0, Math.min(1000, cellQuad.tl[1])) * h) / 1000,
                    ],
                    tr: [
                      (Math.max(0, Math.min(1000, cellQuad.tr[0])) * w) / 1000,
                      (Math.max(0, Math.min(1000, cellQuad.tr[1])) * h) / 1000,
                    ],
                    br: [
                      (Math.max(0, Math.min(1000, cellQuad.br[0])) * w) / 1000,
                      (Math.max(0, Math.min(1000, cellQuad.br[1])) * h) / 1000,
                    ],
                    bl: [
                      (Math.max(0, Math.min(1000, cellQuad.bl[0])) * w) / 1000,
                      (Math.max(0, Math.min(1000, cellQuad.bl[1])) * h) / 1000,
                    ],
                  },
                  cellImgData.data,
                  cellOutW,
                  rowOutH
                );

                if (!options.alreadyEnhanced) {
                  applyAdaptivePencilContrast(cellImgData, cellOutW, rowOutH);
                }
                ctx.putImageData(cellImgData, colDstX, dstY);

                ctx.strokeStyle = accent;
                ctx.lineWidth = 2;
                ctx.strokeRect(colDstX, dstY, cellOutW, rowOutH);
              }
            }

            // 9人打順の右段最下段（空き1枠）にAI視覚アンカー用の「1マス記号構造チートシート」を描画
            if (useTwoBlockSplit && bLen < rowsPerBlock * 2) {
              const guideOriginX =
                outerPadX + singleBlockW + blockDividerW;
              const guideY =
                headerH + (rowsPerBlock - 1) * (rowOutH + rowGapH);
              ctx.fillStyle = "#1e293b";
              ctx.fillRect(guideOriginX, guideY, singleBlockW, rowOutH);
              ctx.strokeStyle = "#38bdf8";
              ctx.lineWidth = 1.5;
              ctx.strokeRect(guideOriginX, guideY, singleBlockW, rowOutH);

              ctx.fillStyle = "#38bdf8";
              ctx.font = "bold 14px sans-serif";
              ctx.textAlign = "left";
              ctx.textBaseline = "top";
              ctx.fillText(
                "【重要：1マス内の3ゾーン記号ルール】",
                guideOriginX + 12,
                guideY + 10
              );

              const guideLines = [
                "①左端細枠(BSO欄): 上から1球順 ○=見逃S / ●,／=空振W",
                "   短横棒(ー),点=ボールB / △=ファウルF / ▲=バントF",
                "   ※枠端まで貫通する薄い印刷横区切り線はボールではない！",
                "   ※ゴロ・飛・安打の最終球はBSO欄に書かずダイヤ側のみ",
                "②中央ダイヤ: Ⅰ・Ⅱ・Ⅲ(ローマ数字) や ①②③ はアウト数！",
                "   右下斜辺(本塁→1塁)が点線のままなら100%未出塁(四球禁止)",
                "③右下記号: ⌒4,︵4(傘マーク+数字)=フライ(二飛) / 6-3=ゴロ",
              ];
              ctx.fillStyle = "#e2e8f0";
              ctx.font = "bold 12px sans-serif";
              guideLines.forEach((line, idx) => {
                ctx.fillText(
                  line,
                  guideOriginX + 12,
                  guideY + 36 + idx * 28
                );
              });
            }

            // メモリ解放補助
            srcCanvas.width = 1;
            srcCanvas.height = 1;

            const mimeType = "image/jpeg";
            return {
              base64: stripDataUrlPrefix(canvas.toDataURL(mimeType, 0.93)),
              mimeType,
            };
          }
        }
      }
    }

    if (columnBoxes.length === 0) return null;

    let minColX = 1000;
    let maxColX = 0;
    let minColY = 1000;
    let maxColY = 0;
    for (const [ymin, xmin, ymax, xmax] of columnBoxes) {
      minColX = Math.min(minColX, xmin);
      maxColX = Math.max(maxColX, xmax);
      minColY = Math.min(minColY, ymin);
      maxColY = Math.max(maxColY, ymax);
    }
    if (maxColX <= minColX || minColX >= 985) return null;

    // 選手欄の右端境界（0.26上限クランプを撤廃し、広い選手氏名欄 0.14〜0.44 にも完全追従）
    const candidateBoundary =
      typeof options?.lineupRightX === "number" &&
      options.lineupRightX >= 120 &&
      options.lineupRightX <= 460
        ? options.lineupRightX
        : typeof options?.firstInningMinX === "number" &&
          options.firstInningMinX >= 120 &&
          options.firstInningMinX <= 460
        ? options.firstInningMinX - 2
        : Math.max(140, Math.min(440, minColX - 2));

    const leftEndNorm = Math.max(
      0.14,
      Math.min(0.44, candidateBoundary / 1000)
    );

    // 打順行ボックスが単調増加で揃っているか検証
    const validRows = (options?.batters || [])
      .filter(
        (
          b
        ): b is {
          battingOrder: number;
          name: string;
          rowBox: NormalizedBox;
        } =>
          Array.isArray(b.rowBox) &&
          b.rowBox[2] > b.rowBox[0] + 15 &&
          b.rowBox[0] >= 40 &&
          b.rowBox[2] <= 985
      )
      .sort((a, b) => a.battingOrder - b.battingOrder);

    let hasCleanRowBoxes = validRows.length >= 7;
    for (let i = 1; i < validRows.length; i++) {
      if (validRows[i].rowBox[0] < validRows[i - 1].rowBox[0] + 12) {
        hasCleanRowBoxes = false;
        break;
      }
    }

    // ━━━ モードA（推奨・主力）: 行ごと・列ごとに完全分離した高精細セルマトリクス画像 ━━━
    // 上下左右の隣接マスの映り込みを物理的に遮断し、1マス内の手書き数字（6-3, 8, ①②③）を最大倍率で描画
    if (hasCleanRowBoxes) {
      // 対象列の罫線ちょうどを含む極小マージン（0.35% = 3.5/1000）のみ切り出し、隣のイニング列は一切入れない
      const colSrcX1 = Math.max(
        0,
        Math.round(w * (Math.max(0, minColX - 3.5) / 1000))
      );
      const colSrcX2 = Math.min(
        w,
        Math.round(w * (Math.min(1000, maxColX + 3.5) / 1000))
      );
      const colSrcW = Math.max(32, colSrcX2 - colSrcX1);

      const sampleRowSrcH = Math.max(
        24,
        Math.round(
          h * ((validRows[0].rowBox[2] - validRows[0].rowBox[0]) / 1000)
        )
      );
      const cellAspect = colSrcW / sampleRowSrcH;

      const rowOutH = 168;
      const cellOutW = Math.max(
        240,
        Math.min(760, Math.round(rowOutH * cellAspect))
      );
      const labelPanelW = 210;
      const gutterW = 10;
      const rowGapH = 8;
      const headerH = 68;

      const totalW = labelPanelW + gutterW + cellOutW + 12;
      const totalH =
        headerH + validRows.length * (rowOutH + rowGapH) + 8;

      const canvas = document.createElement("canvas");
      canvas.width = totalW;
      canvas.height = totalH;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, totalW, totalH);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        const innTitle =
          options?.targetInnings && options.targetInnings.length > 0
            ? `${options.targetInnings.join("・")}回 対象列`
            : "対象イニング";

        ctx.fillStyle = "#38bdf8";
        ctx.font = "bold 16px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(`【${innTitle}】`, 12, 24);
        ctx.fillStyle = "#cbd5e1";
        ctx.font = "bold 11px sans-serif";
        ctx.fillText("各打順1マス独立拡大", 12, 46);

        // 列ヘッダー（印字されたイニング番号 1, 2, 3... の直上領域）を上部に表示
        const firstRowTopY = validRows[0].rowBox[0];
        const hdrNormY1 = Math.max(0, (firstRowTopY - 58) / 1000);
        const hdrNormY2 = Math.max(hdrNormY1 + 0.02, (firstRowTopY + 2) / 1000);
        const hdrSrcY = Math.round(h * hdrNormY1);
        const hdrSrcH = Math.max(16, Math.round(h * (hdrNormY2 - hdrNormY1)));
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(labelPanelW + gutterW, 6, cellOutW, headerH - 12);
        ctx.drawImage(
          img,
          colSrcX1,
          hdrSrcY,
          colSrcW,
          hdrSrcH,
          labelPanelW + gutterW,
          6,
          cellOutW,
          headerH - 12
        );

        const lineupSrcW = Math.max(48, Math.round(w * leftEndNorm));

        for (let idx = 0; idx < validRows.length; idx++) {
          const r = validRows[idx];
          const dstY = headerH + idx * (rowOutH + rowGapH);

          // 上下隣接マスの文字が入らないよう ±2/1000（罫線厚み分のみ）で厳密切り出し
          const rNormY1 = Math.max(0, (r.rowBox[0] - 2) / 1000);
          const rNormY2 = Math.min(1, (r.rowBox[2] + 2) / 1000);
          const rSrcY = Math.round(h * rNormY1);
          const rSrcH = Math.max(18, Math.round(h * (rNormY2 - rNormY1)));

          // 左側: 打順バッジ＋手書き選手欄サムネイル
          ctx.fillStyle = "#1e293b";
          ctx.fillRect(6, dstY, labelPanelW - 6, rowOutH);

          ctx.fillStyle = "#38bdf8";
          ctx.font = "bold 15px sans-serif";
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          const displayName = (r.name || "").slice(0, 8);
          ctx.fillText(`${r.battingOrder}番 ${displayName}`, 12, dstY + 8);

          // 選手名欄の該当行切り抜きを下段に添える（交代線の有無も確認可能）
          const nameThumbY = dstY + 32;
          const nameThumbH = rowOutH - 38;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(10, nameThumbY, labelPanelW - 16, nameThumbH);
          ctx.drawImage(
            img,
            0,
            rSrcY,
            lineupSrcW,
            rSrcH,
            10,
            nameThumbY,
            labelPanelW - 16,
            nameThumbH
          );

          // 右側: 対象イニングの該当1マスのみを大判・高精細で描画（周囲の映り込みゼロ！）
          const cellDstX = labelPanelW + gutterW;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(cellDstX, dstY, cellOutW, rowOutH);
          ctx.drawImage(
            img,
            colSrcX1,
            rSrcY,
            colSrcW,
            rSrcH,
            cellDstX,
            dstY,
            cellOutW,
            rowOutH
          );

          if (!options?.alreadyEnhanced) {
            const cellImgData = ctx.getImageData(
              cellDstX,
              dstY,
              cellOutW,
              rowOutH
            );
            applyAdaptivePencilContrast(cellImgData, cellOutW, rowOutH);
            ctx.putImageData(cellImgData, cellDstX, dstY);
          }

          // スカイブルーの細い外枠（早稲田式の赤線と絶対混同しない色）
          ctx.strokeStyle = "#0284c7";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(cellDstX, dstY, cellOutW, rowOutH);
        }

        const mimeType = "image/jpeg";
        return {
          base64: stripDataUrlPrefix(canvas.toDataURL(mimeType, 0.91)),
          mimeType,
        };
      }
    }

    // ━━━ モードB（フォールバック）: 隣接列を厳密除外したクリーン並列ストリップ ━━━
    const leftPanelW = Math.max(48, Math.round(w * leftEndNorm));
    const padX = 5;
    const targetStartNorm = Math.max(leftEndNorm, (minColX - padX) / 1000);
    const targetEndNorm = Math.min(1, (maxColX + padX) / 1000);
    if (targetEndNorm - targetStartNorm < 0.025) return null;

    const rightSrcX = Math.round(w * targetStartNorm);
    const rightSrcW = Math.max(
      48,
      Math.round(w * (targetEndNorm - targetStartNorm))
    );

    const dividerW = 22;
    const rawTotalW = leftPanelW + dividerW + rightSrcW;
    const rawTotalH = h;
    const maxEdge = 1700;
    const scale =
      Math.max(rawTotalW, rawTotalH) > maxEdge
        ? maxEdge / Math.max(rawTotalW, rawTotalH)
        : 1;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(80, Math.round(rawTotalW * scale));
    canvas.height = Math.max(80, Math.round(rawTotalH * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const outLeftW = Math.round(leftPanelW * scale);
    const outDivW = Math.max(14, Math.round(dividerW * scale));
    const outRightX = outLeftW + outDivW;
    const outRightW = Math.max(32, canvas.width - outRightX);

    ctx.drawImage(img, 0, 0, leftPanelW, h, 0, 0, outLeftW, canvas.height);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(outLeftW, 0, outDivW, canvas.height);
    ctx.drawImage(
      img,
      rightSrcX,
      0,
      rightSrcW,
      h,
      outRightX,
      0,
      outRightW,
      canvas.height
    );

    if (options?.targetInnings && options.targetInnings.length > 0) {
      const badgeText = `${options.targetInnings.join("・")}回 対象列`;
      const fontPx = Math.max(11, Math.round(14 * scale));
      ctx.font = `bold ${fontPx}px sans-serif`;
      const textW = ctx.measureText(badgeText).width;
      const badgeW = Math.min(outRightW - 4, Math.ceil(textW + 12));
      const badgeH = fontPx + 8;
      const frameTopY =
        minColY < maxColY && minColY >= 20
          ? Math.max(0, Math.round(((minColY - 25) / 1000) * canvas.height))
          : 4;
      ctx.fillStyle = "#0284c7";
      ctx.fillRect(outRightX + 2, Math.max(2, frameTopY), badgeW, badgeH);
      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = "middle";
      ctx.fillText(
        badgeText,
        outRightX + 8,
        Math.max(2, frameTopY) + badgeH / 2
      );
    }

    const mimeType = "image/jpeg";
    return {
      base64: stripDataUrlPrefix(canvas.toDataURL(mimeType, 0.9)),
      mimeType,
    };
  } catch {
    return null;
  }
}

/**
 * ページ画像(DataURL)から特定の1マス領域([ymin, xmin, ymax, xmax] 0..1000)を切り抜いて拡大プレビューDataURLを生成する。
 * デフォルト余白を 4%（0.04 = マスの外枠罫線ちょうど）に抑え、上下左右の隣接マスの映り込みを防ぐ。
 */
export async function cropScorebookRegion(
  sourceDataUrl: string,
  box: NormalizedBox,
  paddingRatio = 0.04
): Promise<string> {
  const img = await loadImageFromUrl(sourceDataUrl);
  const [ymin, xmin, ymax, xmax] = box;

  const boxW = Math.max(16, xmax - xmin);
  const boxH = Math.max(16, ymax - ymin);
  const padX = boxW * paddingRatio;
  const padY = boxH * paddingRatio;

  const normX1 = Math.max(0, Math.min(985, xmin - padX)) / 1000;
  const normY1 = Math.max(0, Math.min(985, ymin - padY)) / 1000;
  const normX2 = Math.max(normX1 + 0.02, Math.min(1000, xmax + padX) / 1000);
  const normY2 = Math.max(normY1 + 0.02, Math.min(1000, ymax + padY) / 1000);

  const sx = Math.round(img.naturalWidth * normX1);
  const sy = Math.round(img.naturalHeight * normY1);
  const sw = Math.max(40, Math.round(img.naturalWidth * (normX2 - normX1)));
  const sh = Math.max(40, Math.round(img.naturalHeight * (normY2 - normY1)));

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return sourceDataUrl;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas.toDataURL("image/jpeg", 0.92);
}

/**
 * 歪み・傾き・複数列に対応した任意の四角形4隅 (ScorebookGridCorners, 0..1000) を
 * ホモグラフィ射影変換で真っ直ぐ水平な長方形に展開して高精細DataURLを返す（Step 3ピンポイント確認用）。
 */
export async function cropScorebookQuad(
  sourceDataUrl: string,
  quad: ScorebookGridCorners,
  paddingRatio = 0.04,
  targetWidth = 480
): Promise<string> {
  const img = await loadImageFromUrl(sourceDataUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w < 64 || h < 64) return sourceDataUrl;

  const p = Math.max(0, Math.min(0.25, paddingRatio));
  const expanded = {
    tl: bilinearGridPoint(quad, -p, -p),
    tr: bilinearGridPoint(quad, 1 + p, -p),
    br: bilinearGridPoint(quad, 1 + p, 1 + p),
    bl: bilinearGridPoint(quad, -p, 1 + p),
  };

  const ptsPx = [
    [
      Math.max(0, Math.min(w - 1, (expanded.tl[0] * w) / 1000)),
      Math.max(0, Math.min(h - 1, (expanded.tl[1] * h) / 1000)),
    ],
    [
      Math.max(0, Math.min(w - 1, (expanded.tr[0] * w) / 1000)),
      Math.max(0, Math.min(h - 1, (expanded.tr[1] * h) / 1000)),
    ],
    [
      Math.max(0, Math.min(w - 1, (expanded.br[0] * w) / 1000)),
      Math.max(0, Math.min(h - 1, (expanded.br[1] * h) / 1000)),
    ],
    [
      Math.max(0, Math.min(w - 1, (expanded.bl[0] * w) / 1000)),
      Math.max(0, Math.min(h - 1, (expanded.bl[1] * h) / 1000)),
    ],
  ] as const;

  const roiX = Math.max(
    0,
    Math.floor(Math.min(ptsPx[0][0], ptsPx[1][0], ptsPx[2][0], ptsPx[3][0])) - 2
  );
  const roiY = Math.max(
    0,
    Math.floor(Math.min(ptsPx[0][1], ptsPx[1][1], ptsPx[2][1], ptsPx[3][1])) - 2
  );
  const roiX2 = Math.min(
    w,
    Math.ceil(Math.max(ptsPx[0][0], ptsPx[1][0], ptsPx[2][0], ptsPx[3][0])) + 2
  );
  const roiY2 = Math.min(
    h,
    Math.ceil(Math.max(ptsPx[0][1], ptsPx[1][1], ptsPx[2][1], ptsPx[3][1])) + 2
  );
  const roiW = Math.max(16, roiX2 - roiX);
  const roiH = Math.max(16, roiY2 - roiY);

  const srcEdgeW =
    (Math.hypot(ptsPx[1][0] - ptsPx[0][0], ptsPx[1][1] - ptsPx[0][1]) +
      Math.hypot(ptsPx[2][0] - ptsPx[3][0], ptsPx[2][1] - ptsPx[3][1])) /
    2;
  const srcEdgeH =
    (Math.hypot(ptsPx[3][0] - ptsPx[0][0], ptsPx[3][1] - ptsPx[0][1]) +
      Math.hypot(ptsPx[2][0] - ptsPx[1][0], ptsPx[2][1] - ptsPx[1][1])) /
    2;
  const aspect = Math.max(0.55, Math.min(2.6, srcEdgeW / Math.max(12, srcEdgeH)));

  const dstW = Math.max(180, Math.min(640, Math.round(targetWidth)));
  const dstH = Math.max(120, Math.min(540, Math.round(dstW / aspect)));

  const roiCanvas = document.createElement("canvas");
  roiCanvas.width = roiW;
  roiCanvas.height = roiH;
  const roiCtx = roiCanvas.getContext("2d");

  const dstCanvas = document.createElement("canvas");
  dstCanvas.width = dstW;
  dstCanvas.height = dstH;
  const dstCtx = dstCanvas.getContext("2d");

  if (!roiCtx || !dstCtx) return sourceDataUrl;

  roiCtx.drawImage(img, roiX, roiY, roiW, roiH, 0, 0, roiW, roiH);
  const roiImgData = roiCtx.getImageData(0, 0, roiW, roiH);
  const dstImgData = dstCtx.createImageData(dstW, dstH);

  warpQuadFromRgbaBuffer(
    roiImgData.data,
    roiW,
    roiH,
    {
      tl: [ptsPx[0][0] - roiX, ptsPx[0][1] - roiY],
      tr: [ptsPx[1][0] - roiX, ptsPx[1][1] - roiY],
      br: [ptsPx[2][0] - roiX, ptsPx[2][1] - roiY],
      bl: [ptsPx[3][0] - roiX, ptsPx[3][1] - roiY],
    },
    dstImgData.data,
    dstW,
    dstH
  );

  dstCtx.putImageData(dstImgData, 0, 0);
  releaseCanvas(roiCanvas);
  const cellUrl = dstCanvas.toDataURL("image/jpeg", 0.92);
  releaseCanvas(dstCanvas);
  return cellUrl;
}

function stripDataUrlPrefix(dataUrl: string): string {
  const commaIdx = dataUrl.indexOf(",");
  return commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;
}

async function loadDecodedImageFromFile(file: File): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}> {
  if (!file || file.size === 0) {
    throw new Error("選択された画像が空です。もう一度選択してください");
  }

  // Android Chromium WebView / モダンブラウザではオフメインスレッドの createImageBitmap を最優先で使用し、UIブロックとメモリ残留を防ぐ
  if (typeof createImageBitmap === "function") {
    let bitmapTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      const bitmap = await Promise.race([
        createImageBitmap(file),
        new Promise<never>((_, reject) => {
          bitmapTimer = setTimeout(
            () => reject(new Error("ImageBitmap decode timeout")),
            10000
          );
        }),
      ]);
      if (bitmap.width >= 16 && bitmap.height >= 16) {
        let closed = false;
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          cleanup: () => {
            if (closed) return;
            closed = true;
            try {
              bitmap.close();
            } catch {
              // ignore
            }
          },
        };
      }
      bitmap.close();
    } catch {
      // createImageBitmap 非対応形式の場合は下の HTMLImageElement デコードへフォールバック
    } finally {
      if (bitmapTimer) clearTimeout(bitmapTimer);
    }
  }

  const objectUrl = URL.createObjectURL(file);
  let cleaned = false;
  const img = new Image();
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    img.onload = null;
    img.onerror = null;
    try {
      img.src = "";
    } catch {
      // ignore
    }
    try {
      URL.revokeObjectURL(objectUrl);
    } catch {
      // ignore
    }
  };

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            "画像の読み込みがタイムアウトしました。もう一度お試しください"
          )
        );
      }, 15000);

      img.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      img.onerror = () => {
        clearTimeout(timer);
        const lowerName = (file.name || "").toLowerCase();
        const lowerType = (file.type || "").toLowerCase();
        if (
          lowerName.endsWith(".heic") ||
          lowerName.endsWith(".heif") ||
          lowerType.includes("heic") ||
          lowerType.includes("heif")
        ) {
          reject(
            new Error(
              "このブラウザではHEIC画像を直接開けません。iPhoneのカメラ設定を「互換性優先」にするか、JPEG/PNG画像を選択してください"
            )
          );
          return;
        }
        reject(new Error("画像ファイルの読み込みに失敗しました"));
      };
      img.src = objectUrl;
    });

    // ObjectURL が有効な状態で非同期ビットマップデコードを先行完了させ、drawImage 時のUIブロックを防ぐ
    if (typeof img.decode === "function") {
      try {
        await img.decode();
      } catch {
        // onload 済みであれば drawImage へフォールバック可能
      }
    }

    return {
      source: img,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      cleanup,
    };
  } catch (err) {
    cleanup();
    throw err;
  }
}

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      reject(new Error("プレビュー画像の展開がタイムアウトしました"));
    }, 15000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error("プレビュー画像の生成に失敗しました"));
    };
    img.src = url;
  });
}
