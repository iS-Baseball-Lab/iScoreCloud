// filepath: src/lib/liff/scorebook-image.ts
import type {
  ExcessOutInningSpec,
  FlaggedAtBatReconcileItemSpec,
  MissingOrderGapSpec,
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
  syncStructureBoxesFromCorners,
  warpQuadFromRgbaBuffer,
} from "./scorebook-grid";
import { computeInningPlannedSlots } from "./scorebook-inning-plan";
import { isNonBattingBatterSlot } from "./scorebook-validator";

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
    if (rel >= 0.91) {
      lut[i] = Math.min(255, Math.round(248 + (rel - 0.91) * 78));
    } else {
      // サインペンや濃い鉛筆のインクにじみ（rel=0.72〜0.90の淡いハロー）を黒く太らせないようS字トー特性を持たせ、
      // 小さい『○』『△』『6』『8』『4』の中心の白い抜けと接触ストローク間の谷間を鮮明に保つ
      const ink = Math.max(0, (0.91 - rel) / 0.91);
      const gain = Math.min(1, Math.pow(ink * 1.48, 1.28));
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
  void alreadyEnhanced;
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

function sliceQuadSubRegion(
  quad: ScorebookGridCorners,
  u0: number,
  u1: number,
  v0: number,
  v1: number
): ScorebookGridCorners {
  return {
    tl: bilinearGridPoint(quad, u0, v0),
    tr: bilinearGridPoint(quad, u1, v0),
    br: bilinearGridPoint(quad, u1, v1),
    bl: bilinearGridPoint(quad, u0, v1),
  };
}

function normalizedQuadToPixelQuad(
  quad: ScorebookGridCorners,
  imgW: number,
  imgH: number
): ScorebookGridCorners {
  const clampNorm = (v: number): number => Math.max(0, Math.min(1000, v));
  return {
    tl: [(clampNorm(quad.tl[0]) * imgW) / 1000, (clampNorm(quad.tl[1]) * imgH) / 1000],
    tr: [(clampNorm(quad.tr[0]) * imgW) / 1000, (clampNorm(quad.tr[1]) * imgH) / 1000],
    br: [(clampNorm(quad.br[0]) * imgW) / 1000, (clampNorm(quad.br[1]) * imgH) / 1000],
    bl: [(clampNorm(quad.bl[0]) * imgW) / 1000, (clampNorm(quad.bl[1]) * imgH) / 1000],
  };
}

/**
 * 拡大サブパネル専用の手書き「にじみ・くっつき」分解シャープフィルタ（5×5局所アンシャープ）。
 * - 紙面のざらつきノイズを増幅しないデッドゾーン付き
 * - にじんだ白丸『○』・白三角『△』・数字『6』『8』『4』の中心のわずかな明るい抜けや、
 *   『︵＋4』『○＋ー＋△』『6-3』の接触部の輝度谷間（detail > 0）を優先的に開いて分離しやすくする
 * - 一方で中まで均一に塗られた黒丸『●』や『▲』の中心（5×5平均と輝度差が無い領域）は黒のまま維持するため中抜け誤読を起こさない
 */
function applyStrokeValleySharpen(
  imageData: ImageData,
  width: number,
  height: number,
  alreadyEnhanced = false
): void {
  const n = width * height;
  if (n < 64) return;
  const data = imageData.data;
  const lum = new Uint8Array(n);
  const hist = new Uint32Array(32);

  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const l = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    lum[p] = l;
    hist[l >> 3] += 1;
  }

  const targetRank = Math.floor(n * 0.8);
  let acc = 0;
  let whiteBin = 28;
  for (let b = 0; b < 32; b++) {
    acc += hist[b];
    if (acc >= targetRank) {
      whiteBin = b;
      break;
    }
  }
  const paperLum = Math.max(168, Math.min(252, whiteBin * 8 + 4));

  // 5×5 セパラブルボックスブラー（水平パス）
  const hSum = new Uint16Array(n);
  for (let y = 0; y < height; y++) {
    const rowOff = y * width;
    for (let x = 0; x < width; x++) {
      const x0 = x > 1 ? x - 2 : 0;
      const x1 = x > 0 ? x - 1 : 0;
      const x3 = x + 1 < width ? x + 1 : width - 1;
      const x4 = x + 2 < width ? x + 2 : width - 1;
      hSum[rowOff + x] =
        lum[rowOff + x0] +
        lum[rowOff + x1] +
        lum[rowOff + x] +
        lum[rowOff + x3] +
        lum[rowOff + x4];
    }
  }

  // 垂直パス ＋ 非対称バレー強調合成
  for (let y = 0; y < height; y++) {
    const y0 = (y > 1 ? y - 2 : 0) * width;
    const y1 = (y > 0 ? y - 1 : 0) * width;
    const y2 = y * width;
    const y3 = (y + 1 < height ? y + 1 : height - 1) * width;
    const y4 = (y + 2 < height ? y + 2 : height - 1) * width;

    let i = y2 * 4;
    for (let x = 0; x < width; x++, i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // 赤ペン筆跡（安打・打点等）は彩度を維持したままくっきり化
      const maxGb = g > b ? g : b;
      if (r - maxGb > 18 && r > 80) {
        const nr = (r * 268) >> 8;
        data[i] = nr > 255 ? 255 : nr;
        data[i + 1] = (g * 204) >> 8;
        data[i + 2] = (b * 204) >> 8;
        continue;
      }

      const curLum = lum[y2 + x];
      if (curLum <= 1) continue;

      const sum25 =
        hSum[y0 + x] +
        hSum[y1 + x] +
        hSum[y2 + x] +
        hSum[y3 + x] +
        hSum[y4 + x];
      const meanLum = (sum25 + 12) / 25;

      const baseLum =
        curLum >= paperLum
          ? Math.min(255, 246 + ((curLum - paperLum) >> 1))
          : (curLum * 246) / paperLum;
      const normMean =
        meanLum >= paperLum ? 246 : (meanLum * 246) / paperLum;

      const detail = baseLum - normMean;
      let targetLum = baseLum;
      if (alreadyEnhanced) {
        // 既にSTEP 1で鉛筆S字強調済みの画像に対して二重濃色化を行うと印刷点線ダイヤが実線化・中潰れするため、
        // 白抜き谷間の開口を最優先し、芯の引き締めは最小限に留める
        if (detail > 2.6) {
          targetLum = baseLum + (detail - 2.6) * 1.46;
        } else if (detail < -4.5) {
          targetLum = baseLum + (detail + 4.5) * 0.32;
        }
      } else if (detail > 3) {
        // 文字内部の白穴や接触ストローク間の明るい谷間を開いてにじみ潰れを防ぐ
        targetLum = baseLum + (detail - 3) * 1.38;
      } else if (detail < -3) {
        // 筆跡の芯・輪郭を引き締める
        targetLum = baseLum + (detail + 3) * 0.92;
      }

      const clampedTarget =
        targetLum > 255 ? 255 : targetLum < 0 ? 0 : Math.round(targetLum);
      const scale256 = ((clampedTarget << 8) / curLum) | 0;
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
 * [BSO拡大] パネル専用の鉛筆・細線投球記号コントラスト増強フィルタ:
 * - 薄い鉛筆の点『・』、短いボール横棒『ー』『-』、小さな『○』『△』『／』、球数番号『1,2,3』が
 *   紙面背景に埋もれて欠落（["X"]のみ化）するのを防ぐため、7×7局所背景より暗い筆跡成分を強力に濃色化する
 * - 同時に濃いサインペンの『○』『△』中心の白穴（低輝度域の明るい谷間）だけは開いて中潰れも防止する
 * - ※alreadyEnhanced=true（STEP 1で鉛筆くっきり補正ON）の時は二重濃色化による罫線ボール誤読・白丸潰れを防ぐ
 */
function applyBsoPitchEnhance(
  imageData: ImageData,
  width: number,
  height: number,
  alreadyEnhanced = false
): void {
  const n = width * height;
  if (n < 64) return;
  const data = imageData.data;
  const lum = new Uint8Array(n);
  const hist = new Uint32Array(32);

  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const l = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    lum[p] = l;
    hist[l >> 3] += 1;
  }

  const targetRank = Math.floor(n * 0.8);
  let acc = 0;
  let whiteBin = 28;
  for (let b = 0; b < 32; b++) {
    acc += hist[b];
    if (acc >= targetRank) {
      whiteBin = b;
      break;
    }
  }
  const paperLum = Math.max(168, Math.min(252, whiteBin * 8 + 4));

  // 7×7 セパラブルボックスブラー（拡大されたBSO筆跡の太さに合わせた局所背景推定）
  const hSum = new Uint16Array(n);
  for (let y = 0; y < height; y++) {
    const rowOff = y * width;
    for (let x = 0; x < width; x++) {
      const xm3 = x > 2 ? x - 3 : 0;
      const xm2 = x > 1 ? x - 2 : 0;
      const xm1 = x > 0 ? x - 1 : 0;
      const xp1 = x + 1 < width ? x + 1 : width - 1;
      const xp2 = x + 2 < width ? x + 2 : width - 1;
      const xp3 = x + 3 < width ? x + 3 : width - 1;
      hSum[rowOff + x] =
        lum[rowOff + xm3] +
        lum[rowOff + xm2] +
        lum[rowOff + xm1] +
        lum[rowOff + x] +
        lum[rowOff + xp1] +
        lum[rowOff + xp2] +
        lum[rowOff + xp3];
    }
  }

  for (let y = 0; y < height; y++) {
    const ym3 = (y > 2 ? y - 3 : 0) * width;
    const ym2 = (y > 1 ? y - 2 : 0) * width;
    const ym1 = (y > 0 ? y - 1 : 0) * width;
    const y0 = y * width;
    const yp1 = (y + 1 < height ? y + 1 : height - 1) * width;
    const yp2 = (y + 2 < height ? y + 2 : height - 1) * width;
    const yp3 = (y + 3 < height ? y + 3 : height - 1) * width;

    let i = y0 * 4;
    for (let x = 0; x < width; x++, i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const maxGb = g > b ? g : b;
      if (r - maxGb > 18 && r > 80) {
        const nr = (r * 270) >> 8;
        data[i] = nr > 255 ? 255 : nr;
        data[i + 1] = (g * 196) >> 8;
        data[i + 2] = (b * 196) >> 8;
        continue;
      }

      const curLum = lum[y0 + x];
      if (curLum <= 1) continue;

      const sum49 =
        hSum[ym3 + x] +
        hSum[ym2 + x] +
        hSum[ym1 + x] +
        hSum[y0 + x] +
        hSum[yp1 + x] +
        hSum[yp2 + x] +
        hSum[yp3 + x];
      const meanLum = (sum49 + 24) / 49;

      const baseLum =
        curLum >= paperLum
          ? Math.min(255, 248 + ((curLum - paperLum) >> 1))
          : (curLum * 248) / paperLum;
      const normMean =
        meanLum >= paperLum ? 248 : (meanLum * 248) / paperLum;

      const detail = baseLum - normMean;
      let targetLum = baseLum;

      if (alreadyEnhanced) {
        // 二重強調によるBSO印刷横線のボール誤読・白丸『○』の黒丸『●』潰れを防止し、白穴開口を優先
        if (baseLum < 185 && detail > 2.6) {
          targetLum = baseLum + (detail - 2.6) * 1.48;
        } else if (detail < -4.5) {
          targetLum = baseLum + (detail + 4.5) * 0.36;
        }
      } else if (detail < -1.8) {
        // 薄い鉛筆の点『・』や細線『ー』『○』『△』『1,2,3』をくっきり濃色化
        targetLum = baseLum + (detail + 1.8) * 1.68;
        if (baseLum < 236) {
          targetLum -= (236 - baseLum) * 0.26;
        }
      } else if (baseLum < 168 && detail > 3.5) {
        // 濃いサインペン『○』『△』内部の白穴だけは開いて『●』『▲』との誤認を防ぐ
        targetLum = baseLum + (detail - 3.5) * 1.28;
      }

      const clampedTarget =
        targetLum > 255 ? 255 : targetLum < 0 ? 0 : Math.round(targetLum);
      const scale256 = ((clampedTarget << 8) / curLum) | 0;
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
 * Stage 2（イニング分割ディープ解析）向けに、上下左右の隣接マスの映り込みを物理的にゼロ化し、
 * 1イニング2列・3列以上（打者一巡・二巡）および原本の傾き・台形歪み（gridCorners）にも対応した
 * 「サブ列×打順 射影補正セルマトリクス＋にじみ分解ズーム画像」を生成する。
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
      const totalGridRows = Math.max(1, struct.batters.length);
      const activeOnlyBatters = struct.batters.filter(
        (b) => !isNonBattingBatterSlot(b, struct.batters)
      );
      const sortedBatters = [
        ...(activeOnlyBatters.length > 0 ? activeOnlyBatters : struct.batters),
      ].sort((a, b) => a.battingOrder - b.battingOrder);
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

      const singleLockedInning =
        targetNums.length === 1 ? targetNums[0] : null;
      const singleLockedMeta =
        singleLockedInning !== null
          ? struct.innings.find((m) => m.inning === singleLockedInning)
          : undefined;
      const lockedPlannedSlots =
        singleLockedMeta && bLen >= 1
          ? computeInningPlannedSlots(singleLockedMeta, bLen)
          : null;

      // ━━━ モードL（最優先・STEP 2 打順範囲ロック時の時系列1列・空欄マス完全除外マトリクス） ━━━
      if (
        singleLockedInning !== null &&
        lockedPlannedSlots !== null &&
        lockedPlannedSlots.length >= 1 &&
        lockedPlannedSlots.length <= 24 &&
        subColSpecs.length > 0
      ) {
        const sampleQuad = getCellQuadInStructure(
          struct,
          singleLockedInning,
          lockedPlannedSlots[0].subCol,
          lockedPlannedSlots[0].battingOrder,
          0.045
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
            0.8,
            Math.min(2.15, sampleW / Math.max(16, sampleH))
          );

          const slotCount = lockedPlannedSlots.length;
          const colCount = subColSpecs.length;
          const headerH = 84;
          const rowGapH = 6;
          // iOS WKWebView の 4096px 上限を超えない範囲で各マスの高さを最大化
          const rowOutH =
            slotCount <= 9
              ? 220
              : Math.max(
                  124,
                  Math.min(
                    192,
                    Math.floor((3780 - headerH) / slotCount) - rowGapH
                  )
                );
          const cellOutW = Math.max(
            268,
            Math.min(348, Math.round(rowOutH * singleAspect))
          );
          const zoomGapW = 5;
          const bsoZoomW = Math.max(
            152,
            Math.min(178, Math.round(rowOutH * 0.39 * singleAspect * 1.45))
          );
          const playZoomW = Math.max(
            184,
            Math.min(236, Math.round(rowOutH * (0.72 / 0.86) * singleAspect))
          );
          const colGroupW =
            cellOutW + zoomGapW + bsoZoomW + zoomGapW + playZoomW;

          const overviewSubColW =
            colCount === 1 ? 124 : colCount === 2 ? 92 : 76;
          const overviewSubGap = 4;
          const overviewPanelW =
            colCount * overviewSubColW + (colCount - 1) * overviewSubGap;
          const sectionGapW = 12;
          const labelPanelW = 162;
          const gutterW = 8;
          const outerPadX = 12;

          const totalW =
            outerPadX * 2 +
            overviewPanelW +
            sectionGapW +
            labelPanelW +
            gutterW +
            colGroupW;
          const totalH = Math.max(
            headerH + 3 * (rowOutH + rowGapH) + 10,
            headerH + slotCount * (rowOutH + rowGapH) + 10
          );

          const cachedRgba = getDecodedSheetRgbaBuffer(
            sourceDataUrl,
            img,
            w,
            h
          );
          const canvas = document.createElement("canvas");
          canvas.width = totalW;
          canvas.height = totalH;
          const ctx = canvas.getContext("2d");

          if (cachedRgba && ctx) {
            const fullSrcData = cachedRgba.data;
            ctx.fillStyle = "#0f172a";
            ctx.fillRect(0, 0, totalW, totalH);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";

            const subColPalette = [
              "#0284c7",
              "#d97706",
              "#059669",
              "#7c3aed",
            ];

            // 左端: 連続列全体ストリップ（投手交代波線・3アウト終了斜線・全体文脈用）
            const ovOriginX = outerPadX;
            ctx.fillStyle = "#38bdf8";
            ctx.font = "bold 13px sans-serif";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText("連続列全体", ovOriginX + 2, 18);
            ctx.fillStyle = "#94a3b8";
            ctx.font = "bold 10px sans-serif";
            ctx.fillText("全体文脈参照", ovOriginX + 2, 34);

            const ovStripTopY = 44;
            const ovStripH = totalH - ovStripTopY - 10;
            for (let cIdx = 0; cIdx < colCount; cIdx++) {
              const spec = subColSpecs[cIdx];
              const accent =
                subColPalette[(spec.subCol - 1) % subColPalette.length];
              const ovColX =
                ovOriginX + cIdx * (overviewSubColW + overviewSubGap);
              const frac = getInningSubColumnFractions(
                struct.innings,
                spec.inning,
                spec.subCol
              );
              if (frac && ovStripH > 40) {
                const ovT0 = -0.6 / totalGridRows;
                const ovT1 = 1 + 0.85 / totalGridRows;
                const ovQuad = {
                  tl: bilinearGridPoint(corners, frac.s0, ovT0),
                  tr: bilinearGridPoint(corners, frac.s1, ovT0),
                  br: bilinearGridPoint(corners, frac.s1, ovT1),
                  bl: bilinearGridPoint(corners, frac.s0, ovT1),
                };
                const ovImgData = ctx.createImageData(
                  overviewSubColW,
                  ovStripH
                );
                warpQuadFromRgbaBuffer(
                  fullSrcData,
                  w,
                  h,
                  normalizedQuadToPixelQuad(ovQuad, w, h),
                  ovImgData.data,
                  overviewSubColW,
                  ovStripH
                );
                ctx.putImageData(ovImgData, ovColX, ovStripTopY);
                ctx.strokeStyle = accent;
                ctx.lineWidth = 1.5;
                ctx.strokeRect(ovColX, ovStripTopY, overviewSubColW, ovStripH);
              }
            }

            const sepX =
              ovOriginX + overviewPanelW + Math.floor(sectionGapW / 2);
            ctx.strokeStyle = "#334155";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(sepX, 8);
            ctx.lineTo(sepX, totalH - 8);
            ctx.stroke();

            // 右側: 確定した #1〜#N 打席のみを時系列順に縦1列展開（白紙空欄行は一切含めない！）
            const matrixOriginX = ovOriginX + overviewPanelW + sectionGapW;
            const firstSlot = lockedPlannedSlots[0];
            const lastSlot = lockedPlannedSlots[slotCount - 1];

            ctx.fillStyle = "#38bdf8";
            ctx.font = "bold 15px sans-serif";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(
              `【${singleLockedInning}回 確定${slotCount}打席】`,
              matrixOriginX + 4,
              22
            );
            ctx.fillStyle = "#f8fafc";
            ctx.font = "bold 12px sans-serif";
            ctx.fillText(
              `▼ #1(${firstSlot.battingOrder}番)〜#${slotCount}(${lastSlot.battingOrder}番)`,
              matrixOriginX + 4,
              46
            );
            ctx.fillStyle = "#34d399";
            ctx.font = "bold 10px sans-serif";
            ctx.fillText("時系列確定・空欄除外済", matrixOriginX + 4, 68);

            const colDstX = matrixOriginX + labelPanelW + gutterW;
            const hdrOutH = headerH - 40;
            ctx.fillStyle = "#0284c7";
            ctx.fillRect(colDstX, 6, cellOutW, 26);
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 13px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(
              `${singleLockedInning}回 全体マス（確定順 #1〜#${slotCount}）`,
              colDstX + cellOutW / 2,
              19
            );
            ctx.fillStyle = "#0c4a6e";
            ctx.fillRect(colDstX, 34, cellOutW, hdrOutH);
            ctx.fillStyle = "#bae6fd";
            ctx.font = "bold 11px sans-serif";
            ctx.fillText(
              "上から順に1打席ずつ過不足なく読取",
              colDstX + cellOutW / 2,
              34 + hdrOutH / 2
            );

            const bsoHdrX = colDstX + cellOutW + zoomGapW;
            const playHdrX = bsoHdrX + bsoZoomW + zoomGapW;

            ctx.fillStyle = "#0f766e";
            ctx.fillRect(bsoHdrX, 6, bsoZoomW, 26);
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 11px sans-serif";
            ctx.fillText("BSO投球拡大", bsoHdrX + bsoZoomW / 2, 19);
            ctx.fillStyle = "#134e4a";
            ctx.fillRect(bsoHdrX, 34, bsoZoomW, hdrOutH);
            ctx.fillStyle = "#99f6e4";
            ctx.font = "bold 10px sans-serif";
            ctx.fillText(
              "○●ー・△ 全球抽出",
              bsoHdrX + bsoZoomW / 2,
              34 + hdrOutH / 2
            );

            ctx.fillStyle = "#4338ca";
            ctx.fillRect(playHdrX, 6, playZoomW, 26);
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 11px sans-serif";
            ctx.fillText(
              "中央・右下拡大（同一打席）",
              playHdrX + playZoomW / 2,
              19
            );
            ctx.fillStyle = "#1e1b4b";
            ctx.fillRect(playHdrX, 34, playZoomW, hdrOutH);
            ctx.fillStyle = "#c7d2fe";
            ctx.font = "bold 10px sans-serif";
            ctx.fillText(
              "ⅠⅡⅢ・進塁・守備番号分解",
              playHdrX + playZoomW / 2,
              34 + hdrOutH / 2
            );

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
            const isSheetAlreadyEnhanced = Boolean(options?.alreadyEnhanced);

            for (let sIdx = 0; sIdx < slotCount; sIdx++) {
              const slot = lockedPlannedSlots[sIdx];
              const batter =
                sortedBatters.find(
                  (b) => b.battingOrder === slot.battingOrder
                ) || sortedBatters[0];
              const physRowIdx = Math.max(
                0,
                struct.batters.findIndex(
                  (b) => b.battingOrder === slot.battingOrder
                )
              );
              const dstY = headerH + sIdx * (rowOutH + rowGapH);
              const accent =
                subColPalette[(slot.subCol - 1) % subColPalette.length];

              ctx.fillStyle = "#1e293b";
              ctx.fillRect(matrixOriginX, dstY, labelPanelW, rowOutH);
              ctx.fillStyle = accent;
              ctx.fillRect(matrixOriginX, dstY, labelPanelW, 28);
              ctx.fillStyle = "#ffffff";
              ctx.font = "bold 12px sans-serif";
              ctx.textAlign = "left";
              ctx.textBaseline = "middle";
              const shortName = (batter?.name || "").slice(0, 5);
              const subColTag = colCount >= 2 ? ` [c:${slot.subCol}]` : "";
              ctx.fillText(
                `#${slot.seqNumber} ${slot.battingOrder}番 ${shortName}${subColTag}`,
                matrixOriginX + 6,
                dstY + 14
              );

              const t0 = physRowIdx / totalGridRows;
              const t1 = (physRowIdx + 1) / totalGridRows;
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
              const nameThumbH = Math.max(24, rowOutH - 36);
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
              ctx.putImageData(nameImgData, matrixOriginX + 5, dstY + 32);

              const cellQuad = getCellQuadInStructure(
                struct,
                singleLockedInning,
                slot.subCol,
                slot.battingOrder,
                0.045
              );
              if (!cellQuad) continue;

              const cellImgData = ctx.createImageData(cellOutW, rowOutH);
              warpQuadFromRgbaBuffer(
                fullSrcData,
                w,
                h,
                normalizedQuadToPixelQuad(cellQuad, w, h),
                cellImgData.data,
                cellOutW,
                rowOutH
              );
              ctx.putImageData(cellImgData, colDstX, dstY);
              ctx.strokeStyle = accent;
              ctx.lineWidth = 2;
              ctx.strokeRect(colDstX, dstY, cellOutW, rowOutH);

              const tightCellQuad =
                getCellQuadInStructure(
                  struct,
                  singleLockedInning,
                  slot.subCol,
                  slot.battingOrder,
                  0.015
                ) || cellQuad;

              const bsoDstX = colDstX + cellOutW + zoomGapW;
              const bsoSubQuad = sliceQuadSubRegion(
                tightCellQuad,
                -0.03,
                0.36,
                -0.01,
                1.01
              );
              const bsoImgData = ctx.createImageData(bsoZoomW, rowOutH);
              warpQuadFromRgbaBuffer(
                fullSrcData,
                w,
                h,
                normalizedQuadToPixelQuad(bsoSubQuad, w, h),
                bsoImgData.data,
                bsoZoomW,
                rowOutH
              );
              applyBsoPitchEnhance(
                bsoImgData,
                bsoZoomW,
                rowOutH,
                isSheetAlreadyEnhanced
              );
              ctx.putImageData(bsoImgData, bsoDstX, dstY);
              ctx.strokeStyle = "#0d9488";
              ctx.lineWidth = 1.5;
              ctx.strokeRect(bsoDstX, dstY, bsoZoomW, rowOutH);

              const playDstX = bsoDstX + bsoZoomW + zoomGapW;
              const playSubQuad = sliceQuadSubRegion(
                tightCellQuad,
                0.28,
                1.0,
                0.14,
                1.0
              );
              const playImgData = ctx.createImageData(playZoomW, rowOutH);
              warpQuadFromRgbaBuffer(
                fullSrcData,
                w,
                h,
                normalizedQuadToPixelQuad(playSubQuad, w, h),
                playImgData.data,
                playZoomW,
                rowOutH
              );
              applyStrokeValleySharpen(
                playImgData,
                playZoomW,
                rowOutH,
                isSheetAlreadyEnhanced
              );
              ctx.putImageData(playImgData, playDstX, dstY);
              ctx.strokeStyle = "#6366f1";
              ctx.lineWidth = 1.5;
              ctx.strokeRect(playDstX, dstY, playZoomW, rowOutH);
            }

            const mimeType = "image/jpeg";
            const outBase64 = stripDataUrlPrefix(
              canvas.toDataURL(mimeType, 0.92)
            );
            releaseCanvas(canvas);
            return {
              base64: outBase64,
              mimeType,
            };
          }
          releaseCanvas(canvas);
        }
      }

      if (subColSpecs.length > 0) {
        const sampleQuad = getCellQuadInStructure(
          struct,
          subColSpecs[0].inning,
          subColSpecs[0].subCol,
          sortedBatters[0].battingOrder,
          0.045
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
            0.8,
            Math.min(2.15, sampleW / Math.max(16, sampleH))
          );

          const colCount = subColSpecs.length;
          // 1番〜9番を分割せず上から下へ自然な縦1列で並べつつ、左端に「イニング見出し〜9番〜下段得点欄までの連続列全体ストリップ」を併設する。
          // さらに colCount <= 2（全イニングの99%以上）では、各打順行の全体マスのすぐ右横に
          // 手書きの「くっつき・にじみ」を分離鮮明化した『BSO拡大』と『中央・右下拡大』の2パネルを等倍アスペクト比で併設する。
          const showDebleedMagnifiers = colCount <= 2;
          const rowOutH =
            colCount === 1
              ? bLen <= 9
                ? 220
                : 198
              : colCount === 2
              ? 192
              : 166;
          const minCellW =
            colCount === 1 ? 268 : colCount === 2 ? 220 : 196;
          const maxCellW =
            colCount === 1 ? 348 : colCount === 2 ? 276 : 244;
          const cellOutW = Math.max(
            minCellW,
            Math.min(maxCellW, Math.round(rowOutH * singleAspect))
          );

          const zoomGapW = showDebleedMagnifiers
            ? colCount === 1
              ? 5
              : 4
            : 0;
          // [BSO拡大] は全体マス内のBSO幅（約90px）の約1.8〜2.0倍に本物拡大して薄い鉛筆の投球記号欠落を防ぐ
          const bsoZoomW = showDebleedMagnifiers
            ? Math.max(
                colCount === 1 ? 152 : 118,
                Math.min(
                  colCount === 1 ? 178 : 138,
                  Math.round(rowOutH * 0.39 * singleAspect * 1.45)
                )
              )
            : 0;
          const playZoomW = showDebleedMagnifiers
            ? Math.max(
                colCount === 1 ? 184 : 148,
                Math.min(
                  colCount === 1 ? 236 : 190,
                  Math.round(rowOutH * (0.72 / 0.86) * singleAspect)
                )
              )
            : 0;
          const colGroupW = showDebleedMagnifiers
            ? cellOutW + zoomGapW + bsoZoomW + zoomGapW + playZoomW
            : cellOutW;

          const overviewSubColW =
            colCount === 1 ? 124 : colCount === 2 ? 92 : 76;
          const overviewSubGap = 4;
          const overviewPanelW =
            colCount * overviewSubColW + (colCount - 1) * overviewSubGap;
          const sectionGapW = 12;
          const labelPanelW = colCount <= 2 ? 152 : 146;
          const gutterW = colCount === 1 ? 8 : 10;
          const rowGapH = 6;
          const headerH = 84;
          const outerPadX = 12;

          const totalW =
            outerPadX * 2 +
            overviewPanelW +
            sectionGapW +
            labelPanelW +
            colCount * (gutterW + colGroupW);
          const totalH = headerH + bLen * (rowOutH + rowGapH) + 10;

          // 同一シートの連続イニング切り出し時はRGBAバッファを再利用してスマホCPU負荷と待機時間を大幅削減
          const cachedRgba = getDecodedSheetRgbaBuffer(sourceDataUrl, img, w, h);

          const canvas = document.createElement("canvas");
          canvas.width = totalW;
          canvas.height = totalH;
          const ctx = canvas.getContext("2d");

          if (cachedRgba && ctx) {
            const fullSrcData = cachedRgba.data;

            ctx.fillStyle = "#0f172a";
            ctx.fillRect(0, 0, totalW, totalH);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";

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

            // ── セクション1（左端）: 連続列全体ストリップ（白紙マス判定・3アウト終了斜線・継投横波線・下段得点の確認用） ──
            const ovOriginX = outerPadX;
            ctx.fillStyle = "#38bdf8";
            ctx.font = "bold 13px sans-serif";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText("連続列全体", ovOriginX + 2, 18);
            ctx.fillStyle = "#94a3b8";
            ctx.font = "bold 10px sans-serif";
            ctx.fillText("空欄/切線確認", ovOriginX + 2, 34);

            const ovStripTopY = 44;
            const ovStripH = totalH - ovStripTopY - 10;
            for (let cIdx = 0; cIdx < colCount; cIdx++) {
              const spec = subColSpecs[cIdx];
              const accent =
                subColPalette[(spec.subCol - 1) % subColPalette.length];
              const ovColX =
                ovOriginX + cIdx * (overviewSubColW + overviewSubGap);
              const frac = getInningSubColumnFractions(
                struct.innings,
                spec.inning,
                spec.subCol
              );
              if (frac && ovStripH > 40) {
                const ovT0 = -0.6 / totalGridRows;
                const ovT1 = 1 + 0.85 / totalGridRows;
                const ovQuad = {
                  tl: bilinearGridPoint(corners, frac.s0, ovT0),
                  tr: bilinearGridPoint(corners, frac.s1, ovT0),
                  br: bilinearGridPoint(corners, frac.s1, ovT1),
                  bl: bilinearGridPoint(corners, frac.s0, ovT1),
                };
                const ovImgData = ctx.createImageData(
                  overviewSubColW,
                  ovStripH
                );
                warpQuadFromRgbaBuffer(
                  fullSrcData,
                  w,
                  h,
                  normalizedQuadToPixelQuad(ovQuad, w, h),
                  ovImgData.data,
                  overviewSubColW,
                  ovStripH
                );
                ctx.putImageData(ovImgData, ovColX, ovStripTopY);
                ctx.strokeStyle = accent;
                ctx.lineWidth = 1.5;
                ctx.strokeRect(ovColX, ovStripTopY, overviewSubColW, ovStripH);
              }
            }

            // 区切り縦線
            const sepX = ovOriginX + overviewPanelW + Math.floor(sectionGapW / 2);
            ctx.strokeStyle = "#334155";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(sepX, 8);
            ctx.lineTo(sepX, totalH - 8);
            ctx.stroke();

            // ── セクション2（中央〜右）: 1番〜最終打順の縦一列・1マス独立大判セル＋にじみ分解ズーム ──
            const matrixOriginX = ovOriginX + overviewPanelW + sectionGapW;
            const firstBo = sortedBatters[0]?.battingOrder ?? 1;
            const lastBo = sortedBatters[bLen - 1]?.battingOrder ?? bLen;

            ctx.fillStyle = "#38bdf8";
            ctx.font = "bold 15px sans-serif";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(`【${innTitle}】`, matrixOriginX + 4, 22);
            ctx.fillStyle = "#f8fafc";
            ctx.font = "bold 13px sans-serif";
            ctx.fillText(
              `▼ ${firstBo}番〜${lastBo}番 縦順拡大`,
              matrixOriginX + 4,
              46
            );
            ctx.fillStyle = "#94a3b8";
            ctx.font = "bold 10px sans-serif";
            ctx.fillText("記入マスのみ抽出", matrixOriginX + 4, 68);

            for (let cIdx = 0; cIdx < colCount; cIdx++) {
              const spec = subColSpecs[cIdx];
              const colDstX =
                matrixOriginX +
                labelPanelW +
                gutterW +
                cIdx * (colGroupW + gutterW);
              const accent =
                subColPalette[(spec.subCol - 1) % subColPalette.length];

              ctx.fillStyle = accent;
              ctx.fillRect(colDstX, 6, cellOutW, 26);
              ctx.fillStyle = "#ffffff";
              ctx.font = "bold 13px sans-serif";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              const hdrLabel =
                spec.totalSubCols >= 2
                  ? `${spec.inning}回 ${spec.subCol}列目 [c:${spec.subCol}]`
                  : `${spec.inning}回 [c:1] 全体マス`;
              ctx.fillText(hdrLabel, colDstX + cellOutW / 2, 19);

              // 原本のイニング番号印字部分のホモグラフィ切り抜き
              const frac = getInningSubColumnFractions(
                struct.innings,
                spec.inning,
                spec.subCol
              );
              const hdrOutH = headerH - 40;
              if (frac) {
                const hdrT0 = -0.62 / Math.max(1, bLen);
                const hdrT1 = 0.02 / Math.max(1, bLen);
                const hdrQuad = {
                  tl: bilinearGridPoint(corners, frac.s0, hdrT0),
                  tr: bilinearGridPoint(corners, frac.s1, hdrT0),
                  br: bilinearGridPoint(corners, frac.s1, hdrT1),
                  bl: bilinearGridPoint(corners, frac.s0, hdrT1),
                };
                const hdrImgData = ctx.createImageData(cellOutW, hdrOutH);
                warpQuadFromRgbaBuffer(
                  fullSrcData,
                  w,
                  h,
                  normalizedQuadToPixelQuad(hdrQuad, w, h),
                  hdrImgData.data,
                  cellOutW,
                  hdrOutH
                );
                ctx.putImageData(hdrImgData, colDstX, 34);
                ctx.strokeStyle = accent;
                ctx.lineWidth = 1.5;
                ctx.strokeRect(colDstX, 34, cellOutW, hdrOutH);
              }

              if (showDebleedMagnifiers) {
                const bsoHdrX = colDstX + cellOutW + zoomGapW;
                const playHdrX = bsoHdrX + bsoZoomW + zoomGapW;

                ctx.fillStyle = "#0f766e";
                ctx.fillRect(bsoHdrX, 6, bsoZoomW, 26);
                ctx.fillStyle = "#ffffff";
                ctx.font = "bold 11px sans-serif";
                ctx.fillText("BSO投球拡大", bsoHdrX + bsoZoomW / 2, 19);
                ctx.fillStyle = "#134e4a";
                ctx.fillRect(bsoHdrX, 34, bsoZoomW, hdrOutH);
                ctx.fillStyle = "#99f6e4";
                ctx.font = "bold 10px sans-serif";
                ctx.fillText(
                  "○●ー・△123 全球抽出",
                  bsoHdrX + bsoZoomW / 2,
                  34 + hdrOutH / 2
                );

                ctx.fillStyle = "#4338ca";
                ctx.fillRect(playHdrX, 6, playZoomW, 26);
                ctx.fillStyle = "#ffffff";
                ctx.font = "bold 11px sans-serif";
                ctx.fillText(
                  "中央・右下拡大（同一打席）",
                  playHdrX + playZoomW / 2,
                  19
                );
                ctx.fillStyle = "#1e1b4b";
                ctx.fillRect(playHdrX, 34, playZoomW, hdrOutH);
                ctx.fillStyle = "#c7d2fe";
                ctx.font = "bold 10px sans-serif";
                ctx.fillText(
                  "ⅠⅡⅢ・本一線・︵4 / 6-3 分解",
                  playHdrX + playZoomW / 2,
                  34 + hdrOutH / 2
                );
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

            // 各打順行 × 各サブ列の1マス忠実ホモグラフィ展開 ＋ にじみ分解拡大パネル
            for (let bIdx = 0; bIdx < bLen; bIdx++) {
              const batter = sortedBatters[bIdx];
              const dstY = headerH + bIdx * (rowOutH + rowGapH);

              // 打順番号バッジ＋傾き補正済みの選手欄サムネイル
              ctx.fillStyle = "#1e293b";
              ctx.fillRect(matrixOriginX, dstY, labelPanelW, rowOutH);
              ctx.fillStyle = "#0284c7";
              ctx.fillRect(matrixOriginX, dstY, labelPanelW, 28);
              ctx.fillStyle = "#ffffff";
              ctx.font = "bold 13px sans-serif";
              ctx.textAlign = "left";
              ctx.textBaseline = "middle";
              const displayName = (batter.name || "").slice(0, 7);
              ctx.fillText(
                `${batter.battingOrder}番 ${displayName}`,
                matrixOriginX + 7,
                dstY + 14
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
              const nameThumbH = rowOutH - 36;
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
              ctx.putImageData(nameImgData, matrixOriginX + 5, dstY + 32);

              // 右側: サブ列ごとに [全体マス] ＋ [BSO拡大] ＋ [中央・右下拡大] を同一行に配置
              for (let cIdx = 0; cIdx < colCount; cIdx++) {
                const spec = subColSpecs[cIdx];
                const colDstX =
                  matrixOriginX +
                  labelPanelW +
                  gutterW +
                  cIdx * (colGroupW + gutterW);
                const accent =
                  subColPalette[(spec.subCol - 1) % subColPalette.length];

                const cellQuad = getCellQuadInStructure(
                  struct,
                  spec.inning,
                  spec.subCol,
                  batter.battingOrder,
                  0.045
                );
                if (!cellQuad) continue;

                const cellImgData = ctx.createImageData(cellOutW, rowOutH);
                warpQuadFromRgbaBuffer(
                  fullSrcData,
                  w,
                  h,
                  normalizedQuadToPixelQuad(cellQuad, w, h),
                  cellImgData.data,
                  cellOutW,
                  rowOutH
                );
                ctx.putImageData(cellImgData, colDstX, dstY);
                ctx.strokeStyle = accent;
                ctx.lineWidth = 2;
                ctx.strokeRect(colDstX, dstY, cellOutW, rowOutH);

                if (showDebleedMagnifiers) {
                  const tightCellQuad =
                    getCellQuadInStructure(
                      struct,
                      spec.inning,
                      spec.subCol,
                      batter.battingOrder,
                      0.015
                    ) || cellQuad;

                  const bsoDstX = colDstX + cellOutW + zoomGapW;
                  const bsoSubQuad = sliceQuadSubRegion(
                    tightCellQuad,
                    -0.03,
                    0.36,
                    -0.01,
                    1.01
                  );
                  const bsoImgData = ctx.createImageData(bsoZoomW, rowOutH);
                  warpQuadFromRgbaBuffer(
                    fullSrcData,
                    w,
                    h,
                    normalizedQuadToPixelQuad(bsoSubQuad, w, h),
                    bsoImgData.data,
                    bsoZoomW,
                    rowOutH
                  );
                  const isSheetAlreadyEnhanced = Boolean(
                    options?.alreadyEnhanced
                  );
                  applyBsoPitchEnhance(
                    bsoImgData,
                    bsoZoomW,
                    rowOutH,
                    isSheetAlreadyEnhanced
                  );
                  ctx.putImageData(bsoImgData, bsoDstX, dstY);
                  ctx.strokeStyle = "#0d9488";
                  ctx.lineWidth = 1.5;
                  ctx.strokeRect(bsoDstX, dstY, bsoZoomW, rowOutH);

                  const playDstX = bsoDstX + bsoZoomW + zoomGapW;
                  const playSubQuad = sliceQuadSubRegion(
                    tightCellQuad,
                    0.28,
                    1.0,
                    0.14,
                    1.0
                  );
                  const playImgData = ctx.createImageData(playZoomW, rowOutH);
                  warpQuadFromRgbaBuffer(
                    fullSrcData,
                    w,
                    h,
                    normalizedQuadToPixelQuad(playSubQuad, w, h),
                    playImgData.data,
                    playZoomW,
                    rowOutH
                  );
                  applyStrokeValleySharpen(
                    playImgData,
                    playZoomW,
                    rowOutH,
                    isSheetAlreadyEnhanced
                  );
                  ctx.putImageData(playImgData, playDstX, dstY);
                  ctx.strokeStyle = "#6366f1";
                  ctx.lineWidth = 1.5;
                  ctx.strokeRect(playDstX, dstY, playZoomW, rowOutH);
                }
              }
            }

            const mimeType = "image/jpeg";
            const outBase64 = stripDataUrlPrefix(
              canvas.toDataURL(mimeType, 0.92)
            );
            releaseCanvas(canvas);
            return {
              base64: outBase64,
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

          // 右側: 対象イニングの該当1マスのみを大判・高精細で描画（周囲の映り込みゼロ・画素劣化防止のため局所フィルタ非適用）
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

const RECENT_SHEET_RGBA_CACHE: Array<{
  key: string;
  w: number;
  h: number;
  data: Uint8ClampedArray;
}> = [];

function getDecodedSheetRgbaBuffer(
  sourceDataUrl: string,
  img: HTMLImageElement,
  w: number,
  h: number
): { data: Uint8ClampedArray } | null {
  const key = `${sourceDataUrl.length}:${sourceDataUrl.slice(-64)}:${w}x${h}`;
  const hit = RECENT_SHEET_RGBA_CACHE.find((c) => c.key === key);
  if (hit) {
    return { data: hit.data };
  }

  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = w;
  srcCanvas.height = h;
  const srcCtx = srcCanvas.getContext("2d");
  if (!srcCtx) {
    releaseCanvas(srcCanvas);
    return null;
  }

  srcCtx.drawImage(img, 0, 0, w, h);
  const data = srcCtx.getImageData(0, 0, w, h).data;
  releaseCanvas(srcCanvas);

  // 先攻・後攻の最大2枚のみ保持してメモリ肥大化を防止
  if (RECENT_SHEET_RGBA_CACHE.length >= 2) {
    RECENT_SHEET_RGBA_CACHE.shift();
  }
  RECENT_SHEET_RGBA_CACHE.push({ key, w, h, data });
  return { data };
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

/**
 * 確定済み打順の循環チェックで検出された「抜けている打順（例: 1回4番終了→2回6番開始の間の5番）」について、
 * 候補となるマス（候補A: 前イニング末尾の5番マス vs 候補B: 次イニング先頭の5番マス 等）を
 * [全体マス | BSO拡大 | 中央・右下拡大] の高精細トリプルビューで横並び比較描画する。
 */
export async function buildMissingOrderComparisonCrop(
  sourceDataUrl: string,
  structure: ScorebookSheetStructure,
  gaps: readonly MissingOrderGapSpec[],
  options?: { alreadyEnhanced?: boolean }
): Promise<{ base64: string; mimeType: string } | null> {
  if (!sourceDataUrl || gaps.length === 0 || structure.batters.length === 0) {
    return null;
  }

  try {
    const img = await loadImageFromUrl(sourceDataUrl);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w < 120 || h < 120) return null;

    const cachedRgba = getDecodedSheetRgbaBuffer(sourceDataUrl, img, w, h);
    if (!cachedRgba) return null;
    const fullSrcData = cachedRgba.data;
    const isAlreadyEnhanced = Boolean(options?.alreadyEnhanced);

    const maxCandidates = Math.max(
      1,
      ...gaps.map((g) => Math.max(1, g.candidates.length))
    );

    const rowCellH = 204;
    const cellW = 248;
    const zoomGap = 4;
    const bsoW = 144;
    const playW = 182;
    const candGroupW = cellW + zoomGap + bsoW + zoomGap + playW;
    const candHeaderH = 28;
    const rowBlockH = candHeaderH + rowCellH;
    const rowGapH = 14;
    const leftLabelW = 172;
    const candGapW = 14;
    const padX = 12;
    const topBannerH = 38;

    const totalW =
      padX * 2 +
      leftLabelW +
      candGapW +
      maxCandidates * candGroupW +
      (maxCandidates - 1) * candGapW;
    const totalH =
      topBannerH + gaps.length * rowBlockH + (gaps.length - 1) * rowGapH + 12;

    const canvas = document.createElement("canvas");
    canvas.width = totalW;
    canvas.height = totalH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      releaseCanvas(canvas);
      return null;
    }

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, totalW, totalH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(
      "【打順抜けピンポイント検証】手書き記録がある候補マスを特定して1打席抽出",
      padX,
      19
    );

    const candPalette = ["#0284c7", "#059669", "#d97706"];
    const candNames = ["候補A", "候補B", "候補C"];

    for (let gIdx = 0; gIdx < gaps.length; gIdx++) {
      const gap = gaps[gIdx];
      const blockTopY = topBannerH + gIdx * (rowBlockH + rowGapH);
      const cellTopY = blockTopY + candHeaderH;

      // 左ラベルボックス
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(padX, blockTopY, leftLabelW, rowBlockH);
      ctx.fillStyle = "#4f46e5";
      ctx.fillRect(padX, blockTopY, leftLabelW, candHeaderH);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`[${gap.gapId}] ${gap.battingOrder}番 欠損`, padX + 8, blockTopY + 14);

      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText((gap.batterName || "").slice(0, 9), padX + 8, cellTopY + 26);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "bold 11px sans-serif";
      const kindText =
        gap.kind === "inter_inning"
          ? `${gap.prevInning}回末尾 vs ${gap.nextInning}回先頭`
          : gap.kind === "lead_off_1st"
          ? "1回先頭マス確認"
          : `${gap.targetInning}回 途中抜け確認`;
      ctx.fillText(kindText, padX + 8, cellTopY + 52);
      ctx.fillText("記入済みの側を採用", padX + 8, cellTopY + 74);

      for (let cIdx = 0; cIdx < gap.candidates.length; cIdx++) {
        const cand = gap.candidates[cIdx];
        const candX =
          padX + leftLabelW + candGapW + cIdx * (candGroupW + candGapW);
        const accent = candPalette[cIdx % candPalette.length];
        const candTitle = `${candNames[cIdx] || `候補${cIdx + 1}`}: ${
          cand.inning
        }回 [c:${cand.columnIndex}] ${gap.battingOrder}番マス`;

        ctx.fillStyle = accent;
        ctx.fillRect(candX, blockTopY, cellW, candHeaderH);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(candTitle, candX + cellW / 2, blockTopY + 14);

        const bsoX = candX + cellW + zoomGap;
        const playX = bsoX + bsoW + zoomGap;

        ctx.fillStyle = "#0f766e";
        ctx.fillRect(bsoX, blockTopY, bsoW, candHeaderH);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 10px sans-serif";
        ctx.fillText("BSO拡大", bsoX + bsoW / 2, blockTopY + 14);

        ctx.fillStyle = "#4338ca";
        ctx.fillRect(playX, blockTopY, playW, candHeaderH);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 10px sans-serif";
        ctx.fillText("中央・右下拡大", playX + playW / 2, blockTopY + 14);

        const fullQuad = getCellQuadInStructure(
          structure,
          cand.inning,
          cand.columnIndex,
          gap.battingOrder,
          0.045
        );
        if (!fullQuad) continue;

        const fullImgData = ctx.createImageData(cellW, rowCellH);
        warpQuadFromRgbaBuffer(
          fullSrcData,
          w,
          h,
          normalizedQuadToPixelQuad(fullQuad, w, h),
          fullImgData.data,
          cellW,
          rowCellH
        );
        ctx.putImageData(fullImgData, candX, cellTopY);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(candX, cellTopY, cellW, rowCellH);

        const tightQuad =
          getCellQuadInStructure(
            structure,
            cand.inning,
            cand.columnIndex,
            gap.battingOrder,
            0.015
          ) || fullQuad;

        const bsoQuad = sliceQuadSubRegion(tightQuad, -0.03, 0.36, -0.01, 1.01);
        const bsoImgData = ctx.createImageData(bsoW, rowCellH);
        warpQuadFromRgbaBuffer(
          fullSrcData,
          w,
          h,
          normalizedQuadToPixelQuad(bsoQuad, w, h),
          bsoImgData.data,
          bsoW,
          rowCellH
        );
        applyBsoPitchEnhance(bsoImgData, bsoW, rowCellH, isAlreadyEnhanced);
        ctx.putImageData(bsoImgData, bsoX, cellTopY);
        ctx.strokeStyle = "#0d9488";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bsoX, cellTopY, bsoW, rowCellH);

        const playQuad = sliceQuadSubRegion(tightQuad, 0.28, 1.0, 0.14, 1.0);
        const playImgData = ctx.createImageData(playW, rowCellH);
        warpQuadFromRgbaBuffer(
          fullSrcData,
          w,
          h,
          normalizedQuadToPixelQuad(playQuad, w, h),
          playImgData.data,
          playW,
          rowCellH
        );
        applyStrokeValleySharpen(playImgData, playW, rowCellH, isAlreadyEnhanced);
        ctx.putImageData(playImgData, playX, cellTopY);
        ctx.strokeStyle = "#6366f1";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(playX, cellTopY, playW, rowCellH);
      }
    }

    const mimeType = "image/jpeg";
    const outBase64 = stripDataUrlPrefix(canvas.toDataURL(mimeType, 0.92));
    releaseCanvas(canvas);
    return {
      base64: outBase64,
      mimeType,
    };
  } catch {
    return null;
  }
}

/**
 * 1イニング合計アウトが3アウトを超過している（4アウト・5アウト等）イニングについて、
 * 当該イニングの全候補打席マス [B1, B2, B3, B4...] を
 * [全体マス | BSO拡大 | 中央・右下拡大] の高精細トリプルビューで縦並びに切り出し、
 * 「どのマスが実は出塁（本一実線・安打/四球/失策/封殺）または末尾切り線ノイズなのか」を視覚比較再検算できるようにする。
 */
export async function buildInningOutsReconcileCrop(
  sourceDataUrl: string,
  structure: ScorebookSheetStructure,
  spec: ExcessOutInningSpec,
  options?: { alreadyEnhanced?: boolean }
): Promise<{ base64: string; mimeType: string } | null> {
  if (
    !sourceDataUrl ||
    spec.batters.length === 0 ||
    structure.batters.length === 0
  ) {
    return null;
  }

  try {
    const img = await loadImageFromUrl(sourceDataUrl);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w < 120 || h < 120) return null;

    const cachedRgba = getDecodedSheetRgbaBuffer(sourceDataUrl, img, w, h);
    if (!cachedRgba) return null;
    const fullSrcData = cachedRgba.data;
    const isAlreadyEnhanced = Boolean(options?.alreadyEnhanced);

    const rowCellH = 202;
    const cellW = 248;
    const zoomGap = 4;
    const bsoW = 144;
    const playW = 184;
    const leftLabelW = 206;
    const candGapW = 12;
    const padX = 12;
    const topBannerH = 38;
    const candHeaderH = 26;
    const rowBlockH = candHeaderH + rowCellH;
    const rowGapH = 10;

    const totalW =
      padX * 2 +
      leftLabelW +
      candGapW +
      cellW +
      zoomGap +
      bsoW +
      zoomGap +
      playW;
    const totalH =
      topBannerH +
      spec.batters.length * rowBlockH +
      (spec.batters.length - 1) * rowGapH +
      12;

    const canvas = document.createElement("canvas");
    canvas.width = totalW;
    canvas.height = totalH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      releaseCanvas(canvas);
      return null;
    }

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, totalW, totalH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(
      `【${spec.inning}回 3アウト厳密再検算】現在${spec.currentTotalOuts}アウト超過 ➔ 各マスの本塁1塁線・ⅠⅡⅢ・打球を再確認し合計3アウトへ補正`,
      padX,
      19
    );

    const candX = padX + leftLabelW + candGapW;
    const bsoX = candX + cellW + zoomGap;
    const playX = bsoX + bsoW + zoomGap;

    for (let idx = 0; idx < spec.batters.length; idx++) {
      const b = spec.batters[idx];
      const blockTopY = topBannerH + idx * (rowBlockH + rowGapH);
      const cellTopY = blockTopY + candHeaderH;

      ctx.fillStyle = "#1e293b";
      ctx.fillRect(padX, blockTopY, leftLabelW, rowBlockH);
      ctx.fillStyle = "#dc2626";
      ctx.fillRect(padX, blockTopY, leftLabelW, candHeaderH);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(
        `[${b.slotKey}] ${b.battingOrder}番 [c:${b.columnIndex}]`,
        padX + 8,
        blockTopY + 13
      );

      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText((b.batterName || "").slice(0, 10), padX + 8, cellTopY + 26);

      ctx.fillStyle = "#cbd5e1";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText(
        `仮読取: ${(b.currentResultLabel || "").slice(0, 8)}`,
        padX + 8,
        cellTopY + 52
      );
      ctx.fillStyle = "#fca5a5";
      ctx.fillText(
        `仮アウト: +${b.currentOutsInPlay}死`,
        padX + 8,
        cellTopY + 74
      );

      ctx.fillStyle = "#0284c7";
      ctx.fillRect(candX, blockTopY, cellW, candHeaderH);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        `${spec.inning}回 [c:${b.columnIndex}] ${b.battingOrder}番 全体マス`,
        candX + cellW / 2,
        blockTopY + 13
      );

      ctx.fillStyle = "#0f766e";
      ctx.fillRect(bsoX, blockTopY, bsoW, candHeaderH);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText("BSO拡大", bsoX + bsoW / 2, blockTopY + 13);

      ctx.fillStyle = "#4338ca";
      ctx.fillRect(playX, blockTopY, playW, candHeaderH);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText("中央・右下拡大", playX + playW / 2, blockTopY + 13);

      const fullQuad = getCellQuadInStructure(
        structure,
        spec.inning,
        b.columnIndex,
        b.battingOrder,
        0.045
      );
      if (!fullQuad) continue;

      const fullImgData = ctx.createImageData(cellW, rowCellH);
      warpQuadFromRgbaBuffer(
        fullSrcData,
        w,
        h,
        normalizedQuadToPixelQuad(fullQuad, w, h),
        fullImgData.data,
        cellW,
        rowCellH
      );
      ctx.putImageData(fullImgData, candX, cellTopY);
      ctx.strokeStyle = "#0284c7";
      ctx.lineWidth = 2;
      ctx.strokeRect(candX, cellTopY, cellW, rowCellH);

      const tightQuad =
        getCellQuadInStructure(
          structure,
          spec.inning,
          b.columnIndex,
          b.battingOrder,
          0.015
        ) || fullQuad;

      const bsoQuad = sliceQuadSubRegion(tightQuad, -0.03, 0.36, -0.01, 1.01);
      const bsoImgData = ctx.createImageData(bsoW, rowCellH);
      warpQuadFromRgbaBuffer(
        fullSrcData,
        w,
        h,
        normalizedQuadToPixelQuad(bsoQuad, w, h),
        bsoImgData.data,
        bsoW,
        rowCellH
      );
      applyBsoPitchEnhance(bsoImgData, bsoW, rowCellH, isAlreadyEnhanced);
      ctx.putImageData(bsoImgData, bsoX, cellTopY);
      ctx.strokeStyle = "#0d9488";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bsoX, cellTopY, bsoW, rowCellH);

      const playQuad = sliceQuadSubRegion(tightQuad, 0.28, 1.0, 0.14, 1.0);
      const playImgData = ctx.createImageData(playW, rowCellH);
      warpQuadFromRgbaBuffer(
        fullSrcData,
        w,
        h,
        normalizedQuadToPixelQuad(playQuad, w, h),
        playImgData.data,
        playW,
        rowCellH
      );
      applyStrokeValleySharpen(playImgData, playW, rowCellH, isAlreadyEnhanced);
      ctx.putImageData(playImgData, playX, cellTopY);
      ctx.strokeStyle = "#6366f1";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(playX, cellTopY, playW, rowCellH);
    }

    const mimeType = "image/jpeg";
    const outBase64 = stripDataUrlPrefix(canvas.toDataURL(mimeType, 0.92));
    releaseCanvas(canvas);
    return {
      base64: outBase64,
      mimeType,
    };
  } catch {
    return null;
  }
}

/**
 * STEP 3 の「確認おすすめの箇所」または個別1マスの超拡大AI再解析向けに、
 * 各対象マス [F1, F2...] を最大2.5倍解像度の 5〜6パネル並列ビュー
 * [全体マス | 上下隣接マス文脈 | BSO超拡大 | 中央ダイヤ・進塁拡大 | 右下打球・守備番号分離拡大 | (走者あり時) 先行走者マス参照]
 * として切り出す。
 */
export async function buildFlaggedAtBatsReconcileCrop(
  sourceDataUrl: string,
  structure: ScorebookSheetStructure,
  specs: readonly FlaggedAtBatReconcileItemSpec[],
  options?: { alreadyEnhanced?: boolean }
): Promise<{ base64: string; mimeType: string } | null> {
  if (
    !sourceDataUrl ||
    specs.length === 0 ||
    structure.batters.length === 0
  ) {
    return null;
  }

  try {
    const img = await loadImageFromUrl(sourceDataUrl);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w < 120 || h < 120) return null;

    const cachedRgba = getDecodedSheetRgbaBuffer(sourceDataUrl, img, w, h);
    if (!cachedRgba) return null;
    const fullSrcData = cachedRgba.data;
    const isAlreadyEnhanced = Boolean(options?.alreadyEnhanced);

    const batchSpecs = specs.slice(0, 6);
    const hasAnyPrecedingRunner = batchSpecs.some(
      (s) => s.precedingRunners.length > 0
    );

    const rowCellH = batchSpecs.length <= 3 ? 252 : 216;
    const leftLabelW = 220;
    const candGapW = 10;
    const zoomGap = 4;
    const cellW = 264;
    const ctxW = 128;
    const bsoW = 160;
    const diamondW = 184;
    const dirW = 184;
    const runnerW = hasAnyPrecedingRunner ? 192 : 0;
    const padX = 12;
    const topBannerH = 38;
    const candHeaderH = 26;
    const rowBlockH = candHeaderH + rowCellH;
    const rowGapH = 10;

    const totalW =
      padX * 2 +
      leftLabelW +
      candGapW +
      cellW +
      zoomGap +
      ctxW +
      zoomGap +
      bsoW +
      zoomGap +
      diamondW +
      zoomGap +
      dirW +
      (hasAnyPrecedingRunner ? zoomGap + runnerW : 0);
    const totalH =
      topBannerH +
      batchSpecs.length * rowBlockH +
      (batchSpecs.length - 1) * rowGapH +
      12;

    const canvas = document.createElement("canvas");
    canvas.width = totalW;
    canvas.height = totalH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      releaseCanvas(canvas);
      return null;
    }

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, totalW, totalH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(
      `【要確認マス 超拡大ピンポイントAI精密照合】各行の [全体マス | 上下隣接マス | BSO超拡大 | 中央ダイヤ | 右下打球番号${
        hasAnyPrecedingRunner ? " | 先行走者マス" : ""
      }] を照合`,
      padX,
      19
    );

    const candX = padX + leftLabelW + candGapW;
    const ctxX = candX + cellW + zoomGap;
    const bsoX = ctxX + ctxW + zoomGap;
    const diamondX = bsoX + bsoW + zoomGap;
    const dirX = diamondX + diamondW + zoomGap;
    const runnerX = dirX + dirW + zoomGap;

    for (let idx = 0; idx < batchSpecs.length; idx++) {
      const s = batchSpecs[idx];
      const blockTopY = topBannerH + idx * (rowBlockH + rowGapH);
      const cellTopY = blockTopY + candHeaderH;

      // 左側：状況・検証ポイントカード
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(padX, blockTopY, leftLabelW, rowBlockH);
      ctx.fillStyle = "#d97706";
      ctx.fillRect(padX, blockTopY, leftLabelW, candHeaderH);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(
        `[${s.slotKey}] ${s.inning}回 ${s.battingOrder}番 [c:${s.columnIndex}]`,
        padX + 8,
        blockTopY + 13
      );

      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText((s.batterName || "").slice(0, 11), padX + 8, cellTopY + 22);

      ctx.fillStyle = "#93c5fd";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText(
        `前:${s.outsBefore}死 / ${(s.occupiedBasesSummary || "走者なし").slice(
          0,
          12
        )}`,
        padX + 8,
        cellTopY + 46
      );

      ctx.fillStyle = "#cbd5e1";
      ctx.fillText(
        `仮:${(s.currentResultLabel || "").slice(0, 7)} (${
          s.currentDirection || "-"
        })`,
        padX + 8,
        cellTopY + 68
      );

      ctx.fillStyle = "#fcd34d";
      ctx.font = "bold 10px sans-serif";
      const issueLine1 = (s.issueMessages[0] || "").slice(0, 18);
      const issueLine2 = (s.issueMessages[0] || "").slice(18, 36);
      if (issueLine1) {
        ctx.fillText(issueLine1, padX + 8, cellTopY + 92);
      }
      if (issueLine2) {
        ctx.fillText(issueLine2, padX + 8, cellTopY + 108);
      }

      // パネル見出し
      ctx.fillStyle = "#0284c7";
      ctx.fillRect(candX, blockTopY, cellW, candHeaderH);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        `[${s.slotKey}] ${s.inning}回 ${s.battingOrder}番 全体マス`,
        candX + cellW / 2,
        blockTopY + 13
      );

      ctx.fillStyle = "#0369a1";
      ctx.fillRect(ctxX, blockTopY, ctxW, candHeaderH);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText("上下隣接マス文脈", ctxX + ctxW / 2, blockTopY + 13);

      ctx.fillStyle = "#0f766e";
      ctx.fillRect(bsoX, blockTopY, bsoW, candHeaderH);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText("BSO超拡大", bsoX + bsoW / 2, blockTopY + 13);

      ctx.fillStyle = "#4338ca";
      ctx.fillRect(diamondX, blockTopY, diamondW, candHeaderH);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText(
        "中央ダイヤ・進塁拡大",
        diamondX + diamondW / 2,
        blockTopY + 13
      );

      ctx.fillStyle = "#be123c";
      ctx.fillRect(dirX, blockTopY, dirW, candHeaderH);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText("右下・打球番号拡大", dirX + dirW / 2, blockTopY + 13);

      if (hasAnyPrecedingRunner) {
        ctx.fillStyle = "#6d28d9";
        ctx.fillRect(runnerX, blockTopY, runnerW, candHeaderH);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 10px sans-serif";
        const pr0 = s.precedingRunners[0];
        ctx.fillText(
          pr0
            ? `先行走者(${pr0.startBase}:${pr0.battingOrder}番)`
            : "先行走者なし",
          runnerX + runnerW / 2,
          blockTopY + 13
        );
      }

      const fullQuad = getCellQuadInStructure(
        structure,
        s.inning,
        s.columnIndex,
        s.battingOrder,
        0.055
      );
      if (!fullQuad) continue;

      // 1. 全体マス
      const fullImgData = ctx.createImageData(cellW, rowCellH);
      warpQuadFromRgbaBuffer(
        fullSrcData,
        w,
        h,
        normalizedQuadToPixelQuad(fullQuad, w, h),
        fullImgData.data,
        cellW,
        rowCellH
      );
      ctx.putImageData(fullImgData, candX, cellTopY);
      ctx.strokeStyle = "#0284c7";
      ctx.lineWidth = 2;
      ctx.strokeRect(candX, cellTopY, cellW, rowCellH);

      const tightQuad =
        getCellQuadInStructure(
          structure,
          s.inning,
          s.columnIndex,
          s.battingOrder,
          0.015
        ) || fullQuad;

      // 1-B. 上下隣接マス文脈（上半分〜当該マス〜下半分を描画し、枠線越えの筆跡・DP括弧・切り線・波線ズレを確認可能にする）
      const ctxQuad = sliceQuadSubRegion(tightQuad, -0.04, 1.04, -0.55, 1.55);
      const ctxImgData = ctx.createImageData(ctxW, rowCellH);
      warpQuadFromRgbaBuffer(
        fullSrcData,
        w,
        h,
        normalizedQuadToPixelQuad(ctxQuad, w, h),
        ctxImgData.data,
        ctxW,
        rowCellH
      );
      ctx.putImageData(ctxImgData, ctxX, cellTopY);
      const topTickY = cellTopY + Math.round((0.55 / 2.1) * rowCellH);
      const botTickY = cellTopY + Math.round((1.55 / 2.1) * rowCellH);
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ctxX, topTickY);
      ctx.lineTo(ctxX + 12, topTickY);
      ctx.moveTo(ctxX + ctxW - 12, topTickY);
      ctx.lineTo(ctxX + ctxW, topTickY);
      ctx.moveTo(ctxX, botTickY);
      ctx.lineTo(ctxX + 12, botTickY);
      ctx.moveTo(ctxX + ctxW - 12, botTickY);
      ctx.lineTo(ctxX + ctxW, botTickY);
      ctx.stroke();
      ctx.strokeStyle = "#0369a1";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(ctxX, cellTopY, ctxW, rowCellH);

      // 2. BSO超拡大
      const bsoQuad = sliceQuadSubRegion(tightQuad, -0.03, 0.37, -0.01, 1.01);
      const bsoImgData = ctx.createImageData(bsoW, rowCellH);
      warpQuadFromRgbaBuffer(
        fullSrcData,
        w,
        h,
        normalizedQuadToPixelQuad(bsoQuad, w, h),
        bsoImgData.data,
        bsoW,
        rowCellH
      );
      applyBsoPitchEnhance(bsoImgData, bsoW, rowCellH, isAlreadyEnhanced);
      ctx.putImageData(bsoImgData, bsoX, cellTopY);
      ctx.strokeStyle = "#0d9488";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bsoX, cellTopY, bsoW, rowCellH);

      // 3. 中央ダイヤモンド・上辺進塁メモ超拡大
      const diamondQuad = sliceQuadSubRegion(tightQuad, 0.24, 0.96, 0.02, 0.86);
      const diamondImgData = ctx.createImageData(diamondW, rowCellH);
      warpQuadFromRgbaBuffer(
        fullSrcData,
        w,
        h,
        normalizedQuadToPixelQuad(diamondQuad, w, h),
        diamondImgData.data,
        diamondW,
        rowCellH
      );
      applyStrokeValleySharpen(
        diamondImgData,
        diamondW,
        rowCellH,
        isAlreadyEnhanced
      );
      ctx.putImageData(diamondImgData, diamondX, cellTopY);
      ctx.strokeStyle = "#6366f1";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(diamondX, cellTopY, diamondW, rowCellH);

      // 4. 右下象限（打球記号・守備番号 6-3 vs 8-3 / E6 / B / K 等）超拡大
      const dirQuad = sliceQuadSubRegion(tightQuad, 0.42, 1.02, 0.38, 1.02);
      const dirImgData = ctx.createImageData(dirW, rowCellH);
      warpQuadFromRgbaBuffer(
        fullSrcData,
        w,
        h,
        normalizedQuadToPixelQuad(dirQuad, w, h),
        dirImgData.data,
        dirW,
        rowCellH
      );
      applyStrokeValleySharpen(dirImgData, dirW, rowCellH, isAlreadyEnhanced);
      ctx.putImageData(dirImgData, dirX, cellTopY);
      ctx.strokeStyle = "#e11d48";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(dirX, cellTopY, dirW, rowCellH);

      // 5. 先行走者マス参照（本塁に近い最大2名まで上下分割または単独拡大で表示）
      if (hasAnyPrecedingRunner) {
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(runnerX, cellTopY, runnerW, rowCellH);
        const prs = s.precedingRunners.slice(0, 2);
        if (prs.length === 0) {
          ctx.fillStyle = "#64748b";
          ctx.font = "bold 11px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(
            "塁上走者なし",
            runnerX + runnerW / 2,
            cellTopY + rowCellH / 2
          );
        } else if (prs.length === 1) {
          const pr = prs[0];
          const prQuad =
            pr.battingOrder >= 1
              ? getCellQuadInStructure(
                  structure,
                  pr.inning,
                  pr.columnIndex || 1,
                  pr.battingOrder,
                  0.025
                )
              : null;
          if (prQuad) {
            const prImg = ctx.createImageData(runnerW, rowCellH);
            warpQuadFromRgbaBuffer(
              fullSrcData,
              w,
              h,
              normalizedQuadToPixelQuad(prQuad, w, h),
              prImg.data,
              runnerW,
              rowCellH
            );
            applyStrokeValleySharpen(
              prImg,
              runnerW,
              rowCellH,
              isAlreadyEnhanced
            );
            ctx.putImageData(prImg, runnerX, cellTopY);
          }
        } else {
          const subGap = 4;
          const topH = Math.floor((rowCellH - subGap) / 2);
          const botH = rowCellH - subGap - topH;
          const heights = [topH, botH];
          const yOffsets = [cellTopY, cellTopY + topH + subGap];
          for (let rIdx = 0; rIdx < 2; rIdx++) {
            const pr = prs[rIdx];
            const subH = heights[rIdx];
            const subY = yOffsets[rIdx];
            const prQuad =
              pr.battingOrder >= 1
                ? getCellQuadInStructure(
                    structure,
                    pr.inning,
                    pr.columnIndex || 1,
                    pr.battingOrder,
                    0.02
                  )
                : null;
            if (!prQuad) continue;
            const prSubQuad = sliceQuadSubRegion(prQuad, 0.18, 0.98, 0.04, 0.96);
            const prImg = ctx.createImageData(runnerW, subH);
            warpQuadFromRgbaBuffer(
              fullSrcData,
              w,
              h,
              normalizedQuadToPixelQuad(prSubQuad, w, h),
              prImg.data,
              runnerW,
              subH
            );
            applyStrokeValleySharpen(
              prImg,
              runnerW,
              subH,
              isAlreadyEnhanced
            );
            ctx.putImageData(prImg, runnerX, subY);
            ctx.fillStyle = "#5b21b6";
            ctx.fillRect(runnerX, subY, 58, 16);
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 9px sans-serif";
            ctx.textAlign = "left";
            ctx.fillText(
              `${pr.startBase}:${pr.battingOrder}番`,
              runnerX + 4,
              subY + 8
            );
          }
        }
        ctx.strokeStyle = "#7c3aed";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(runnerX, cellTopY, runnerW, rowCellH);
      }
    }

    const mimeType = "image/jpeg";
    const outBase64 = stripDataUrlPrefix(canvas.toDataURL(mimeType, 0.93));
    releaseCanvas(canvas);
    return {
      base64: outBase64,
      mimeType,
    };
  } catch {
    return null;
  }
}

/**
 * Stage 1（AI骨格スキャン）直後に、シート画像上の実在する「印刷外枠罫線（上・下・左・右）」へ
 * 4隅グリッド座標 (gridCorners) をサブピクセル〜数ピクセル単位で自動スナップ補正する（所要約1〜3ms）。
 * - 探索幅を ±10（正規化座標 0..1000 の ±1.0%）に制限しているため、マス内部のBSO区切り線へ誤ジャンプせず、
 *   AIのルーラー目測誤差（1〜2%の微ズレ）のみを実際の印刷黒罫線へピタッと吸着させる。
 */
export async function refineStructureGridOnImage(
  sourceDataUrl: string,
  structure: ScorebookSheetStructure
): Promise<ScorebookSheetStructure> {
  if (
    !sourceDataUrl ||
    structure.batters.length < 4 ||
    structure.innings.length < 1
  ) {
    return structure;
  }

  try {
    const img = await loadImageFromUrl(sourceDataUrl);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w < 240 || h < 240) return structure;

    const cachedRgba = getDecodedSheetRgbaBuffer(sourceDataUrl, img, w, h);
    if (!cachedRgba) return structure;
    const rgba = cachedRgba.data;

    const baseCorners = resolveStructureGridCorners(structure);
    const sampleLumNorm = (nx: number, ny: number): number => {
      const px = Math.max(0, Math.min(w - 1, Math.round((nx * w) / 1000)));
      const py = Math.max(0, Math.min(h - 1, Math.round((ny * h) / 1000)));
      const off = (py * w + px) * 4;
      return (rgba[off] * 77 + rgba[off + 1] * 150 + rgba[off + 2] * 29) >> 8;
    };

    const SAMPLES = 72;
    const MAX_SHIFT = 10;
    const TILT_DELTAS = [-2, 0, 2] as const;

    const findBestHorizontalEdgeShift = (
      x0: number,
      y0: number,
      x1: number,
      y1: number
    ): [number, number] => {
      const evalCandidate = (d0: number, d1: number): { score: number; hitRatio: number } => {
        let dipSum = 0;
        let hits = 0;
        for (let k = 0; k < SAMPLES; k++) {
          const s = 0.03 + (0.94 * k) / (SAMPLES - 1);
          const x = x0 + (x1 - x0) * s;
          const y = y0 + d0 + (y1 + d1 - (y0 + d0)) * s;
          const cMin = Math.min(
            sampleLumNorm(x, y - 0.45),
            sampleLumNorm(x, y),
            sampleLumNorm(x, y + 0.45)
          );
          const flank =
            0.5 * (sampleLumNorm(x, y - 3.0) + sampleLumNorm(x, y + 3.0));
          const dip = Math.max(0, flank - cMin);
          dipSum += dip;
          if (dip >= 16) hits += 1;
        }
        const hitRatio = hits / SAMPLES;
        const meanDip = dipSum / SAMPLES;
        const meanAbs = 0.5 * (Math.abs(d0) + Math.abs(d1));
        const tiltPenalty = Math.abs(d1 - d0) * 0.025;
        const score =
          meanDip * hitRatio * Math.max(0.5, 1 - meanAbs * 0.028 - tiltPenalty);
        return { score, hitRatio };
      };

      const zero = evalCandidate(0, 0);
      let bestScore = zero.score;
      let bestPair: [number, number] = [0, 0];
      let bestHitRatio = zero.hitRatio;

      for (let d = -MAX_SHIFT; d <= MAX_SHIFT; d++) {
        for (const td of TILT_DELTAS) {
          const d0 = d - td;
          const d1 = d + td;
          if (d0 === 0 && d1 === 0) continue;
          const cur = evalCandidate(d0, d1);
          if (cur.hitRatio >= 0.55 && cur.score > bestScore) {
            bestScore = cur.score;
            bestPair = [d0, d1];
            bestHitRatio = cur.hitRatio;
          }
        }
      }

      if (
        (bestPair[0] !== 0 || bestPair[1] !== 0) &&
        bestHitRatio >= 0.55 &&
        bestScore >= 12 &&
        bestScore >= zero.score * 1.18 + 2.5
      ) {
        return bestPair;
      }
      return [0, 0];
    };

    const findBestVerticalEdgeShift = (
      x0: number,
      y0: number,
      x1: number,
      y1: number
    ): [number, number] => {
      const evalCandidate = (d0: number, d1: number): { score: number; hitRatio: number } => {
        let dipSum = 0;
        let hits = 0;
        for (let k = 0; k < SAMPLES; k++) {
          const t = 0.03 + (0.94 * k) / (SAMPLES - 1);
          const y = y0 + (y1 - y0) * t;
          const x = x0 + d0 + (x1 + d1 - (x0 + d0)) * t;
          const cMin = Math.min(
            sampleLumNorm(x - 0.45, y),
            sampleLumNorm(x, y),
            sampleLumNorm(x + 0.45, y)
          );
          const flank =
            0.5 * (sampleLumNorm(x - 3.0, y) + sampleLumNorm(x + 3.0, y));
          const dip = Math.max(0, flank - cMin);
          dipSum += dip;
          if (dip >= 16) hits += 1;
        }
        const hitRatio = hits / SAMPLES;
        const meanDip = dipSum / SAMPLES;
        const meanAbs = 0.5 * (Math.abs(d0) + Math.abs(d1));
        const tiltPenalty = Math.abs(d1 - d0) * 0.025;
        const score =
          meanDip * hitRatio * Math.max(0.5, 1 - meanAbs * 0.028 - tiltPenalty);
        return { score, hitRatio };
      };

      const zero = evalCandidate(0, 0);
      let bestScore = zero.score;
      let bestPair: [number, number] = [0, 0];
      let bestHitRatio = zero.hitRatio;

      for (let d = -MAX_SHIFT; d <= MAX_SHIFT; d++) {
        for (const td of TILT_DELTAS) {
          const d0 = d - td;
          const d1 = d + td;
          if (d0 === 0 && d1 === 0) continue;
          const cur = evalCandidate(d0, d1);
          if (cur.hitRatio >= 0.55 && cur.score > bestScore) {
            bestScore = cur.score;
            bestPair = [d0, d1];
            bestHitRatio = cur.hitRatio;
          }
        }
      }

      if (
        (bestPair[0] !== 0 || bestPair[1] !== 0) &&
        bestHitRatio >= 0.55 &&
        bestScore >= 12 &&
        bestScore >= zero.score * 1.18 + 2.5
      ) {
        return bestPair;
      }
      return [0, 0];
    };

    const [topDl, topDr] = findBestHorizontalEdgeShift(
      baseCorners.tl[0],
      baseCorners.tl[1],
      baseCorners.tr[0],
      baseCorners.tr[1]
    );
    const [botDl, botDr] = findBestHorizontalEdgeShift(
      baseCorners.bl[0],
      baseCorners.bl[1],
      baseCorners.br[0],
      baseCorners.br[1]
    );
    const [leftDt, leftDb] = findBestVerticalEdgeShift(
      baseCorners.tl[0],
      baseCorners.tl[1],
      baseCorners.bl[0],
      baseCorners.bl[1]
    );
    const [rightDt, rightDb] = findBestVerticalEdgeShift(
      baseCorners.tr[0],
      baseCorners.tr[1],
      baseCorners.br[0],
      baseCorners.br[1]
    );

    if (
      topDl === 0 &&
      topDr === 0 &&
      botDl === 0 &&
      botDr === 0 &&
      leftDt === 0 &&
      leftDb === 0 &&
      rightDt === 0 &&
      rightDb === 0
    ) {
      return structure;
    }

    const snappedCorners: ScorebookGridCorners = {
      tl: [baseCorners.tl[0] + leftDt, baseCorners.tl[1] + topDl],
      tr: [baseCorners.tr[0] + rightDt, baseCorners.tr[1] + topDr],
      br: [baseCorners.br[0] + rightDb, baseCorners.br[1] + botDr],
      bl: [baseCorners.bl[0] + leftDb, baseCorners.bl[1] + botDl],
    };

    return syncStructureBoxesFromCorners(structure, snappedCorners);
  } catch {
    return structure;
  }
}

/**
 * STEP 2「各イニングの打順範囲・打席人数（例: 1回=1番〜5番）」をAIで高速一括判定するため、
 * 位置合わせ済みの4隅グリッド (gridCorners) に沿って全イニング×全打順行を真っ直ぐ展開し、
 * 各セルの左上に [回-打順] バッジを刻印した一覧画像を生成する。
 */
export async function buildSheetInningRangesOverviewCrop(
  sourceDataUrl: string,
  structure: ScorebookSheetStructure
): Promise<{ base64: string; mimeType: string } | null> {
  if (
    !sourceDataUrl ||
    structure.batters.length < 4 ||
    structure.innings.length < 1
  ) {
    return null;
  }

  try {
    const img = await loadImageFromUrl(sourceDataUrl);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w < 120 || h < 120) return null;

    const cachedRgba = getDecodedSheetRgbaBuffer(sourceDataUrl, img, w, h);
    if (!cachedRgba) return null;
    const fullSrcData = cachedRgba.data;

    const corners = resolveStructureGridCorners(structure);
    const totalGridRows = Math.max(1, structure.batters.length);
    const activeBatters = structure.batters
      .filter((b) => !isNonBattingBatterSlot(b, structure.batters))
      .sort((a, b) => a.battingOrder - b.battingOrder);
    const rows =
      activeBatters.length > 0 ? activeBatters : [...structure.batters];
    const rowCount = rows.length;

    const sortedInnings = [...structure.innings].sort(
      (a, b) => a.inning - b.inning
    );
    const colSpecs: Array<{
      inning: number;
      subCol: number;
      totalSubCols: number;
    }> = [];
    for (const m of sortedInnings) {
      const cols = Math.max(1, m.columnCount || 1);
      for (let sc = 1; sc <= cols; sc++) {
        colSpecs.push({ inning: m.inning, subCol: sc, totalSubCols: cols });
      }
    }
    if (colSpecs.length === 0) return null;

    const leftLabelW = 88;
    const topHdrH = 62;
    const botFooterH = 54;
    const pad = 10;
    const cellGap = 3;
    const cellW = Math.max(
      108,
      Math.min(168, Math.floor((1620 - leftLabelW - pad * 2) / colSpecs.length))
    );
    const cellH = Math.max(
      96,
      Math.min(126, Math.floor((1240 - topHdrH - botFooterH) / rowCount))
    );

    const totalW =
      pad * 2 + leftLabelW + colSpecs.length * (cellW + cellGap) + 4;
    const totalH =
      pad * 2 + topHdrH + rowCount * (cellH + cellGap) + botFooterH;

    const canvas = document.createElement("canvas");
    canvas.width = totalW;
    canvas.height = totalH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      releaseCanvas(canvas);
      return null;
    }

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, totalW, totalH);

    // 上段: 各イニング見出し＋原本イニング印字ヘッダー
    for (let cIdx = 0; cIdx < colSpecs.length; cIdx++) {
      const spec = colSpecs[cIdx];
      const cx = pad + leftLabelW + cIdx * (cellW + cellGap);
      const isMulti = spec.totalSubCols >= 2;
      ctx.fillStyle = isMulti ? "#d97706" : "#0284c7";
      ctx.fillRect(cx, pad, cellW, 24);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = isMulti
        ? `${spec.inning}回 [c:${spec.subCol}]`
        : `${spec.inning}回`;
      ctx.fillText(label, cx + cellW / 2, pad + 12);

      const frac = getInningSubColumnFractions(
        structure.innings,
        spec.inning,
        spec.subCol
      );
      if (frac) {
        const hdrOutH = topHdrH - 28;
        const hdrQuad = {
          tl: bilinearGridPoint(corners, frac.s0, -0.58 / totalGridRows),
          tr: bilinearGridPoint(corners, frac.s1, -0.58 / totalGridRows),
          br: bilinearGridPoint(corners, frac.s1, 0.02 / totalGridRows),
          bl: bilinearGridPoint(corners, frac.s0, 0.02 / totalGridRows),
        };
        const hdrImg = ctx.createImageData(cellW, hdrOutH);
        warpQuadFromRgbaBuffer(
          fullSrcData,
          w,
          h,
          normalizedQuadToPixelQuad(hdrQuad, w, h),
          hdrImg.data,
          cellW,
          hdrOutH
        );
        ctx.putImageData(hdrImg, cx, pad + 26);

        // 下段: 原本のイニング得点欄
        const ftrTopY = pad + topHdrH + rowCount * (cellH + cellGap) + 4;
        const ftrOutH = botFooterH - 8;
        const ftrQuad = {
          tl: bilinearGridPoint(corners, frac.s0, 1 - 0.02 / totalGridRows),
          tr: bilinearGridPoint(corners, frac.s1, 1 - 0.02 / totalGridRows),
          br: bilinearGridPoint(corners, frac.s1, 1 + 0.78 / totalGridRows),
          bl: bilinearGridPoint(corners, frac.s0, 1 + 0.78 / totalGridRows),
        };
        const ftrImg = ctx.createImageData(cellW, ftrOutH);
        warpQuadFromRgbaBuffer(
          fullSrcData,
          w,
          h,
          normalizedQuadToPixelQuad(ftrQuad, w, h),
          ftrImg.data,
          cellW,
          ftrOutH
        );
        ctx.putImageData(ftrImg, cx, ftrTopY);
        ctx.strokeStyle = "#475569";
        ctx.lineWidth = 1;
        ctx.strokeRect(cx, ftrTopY, cellW, ftrOutH);
      }
    }

    // 左端: 打順ラベル & 各マスのホモグラフィ展開
    for (let rIdx = 0; rIdx < rowCount; rIdx++) {
      const batter = rows[rIdx];
      const ry = pad + topHdrH + rIdx * (cellH + cellGap);

      ctx.fillStyle = "#1e293b";
      ctx.fillRect(pad, ry, leftLabelW - 4, cellH);
      ctx.fillStyle = "#059669";
      ctx.fillRect(pad, ry, leftLabelW - 4, 24);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        `${batter.battingOrder}番`,
        pad + (leftLabelW - 4) / 2,
        ry + 12
      );
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText(
        (batter.name || "").slice(0, 5),
        pad + (leftLabelW - 4) / 2,
        ry + 24 + (cellH - 24) / 2
      );

      for (let cIdx = 0; cIdx < colSpecs.length; cIdx++) {
        const spec = colSpecs[cIdx];
        const cx = pad + leftLabelW + cIdx * (cellW + cellGap);
        const quad = getCellQuadInStructure(
          structure,
          spec.inning,
          spec.subCol,
          batter.battingOrder,
          0.04
        );
        if (!quad) continue;

        const cellImg = ctx.createImageData(cellW, cellH);
        warpQuadFromRgbaBuffer(
          fullSrcData,
          w,
          h,
          normalizedQuadToPixelQuad(quad, w, h),
          cellImg.data,
          cellW,
          cellH
        );
        ctx.putImageData(cellImg, cx, ry);

        ctx.strokeStyle = spec.totalSubCols >= 2 ? "#f59e0b" : "#38bdf8";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(cx, ry, cellW, cellH);

        // 左上角に控えめな [1-5] 座標タグを刻印して行番号の読み違えを防止
        const tagText =
          spec.totalSubCols >= 2
            ? `${spec.inning}c${spec.subCol}-${batter.battingOrder}番`
            : `${spec.inning}回-${batter.battingOrder}番`;
        const tagW = spec.totalSubCols >= 2 ? 56 : 48;
        ctx.fillStyle = "rgba(15, 23, 42, 0.82)";
        ctx.fillRect(cx + 1, ry + 1, tagW, 15);
        ctx.fillStyle = "#bae6fd";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(tagText, cx + 3, ry + 8.5);
      }
    }

    const ftrLabelY = pad + topHdrH + rowCount * (cellH + cellGap) + 4;
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(pad, ftrLabelY, leftLabelW - 4, botFooterH - 8);
    ctx.fillStyle = "#fcd34d";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      "得点欄",
      pad + (leftLabelW - 4) / 2,
      ftrLabelY + (botFooterH - 8) / 2
    );

    const mimeType = "image/jpeg";
    const outBase64 = stripDataUrlPrefix(canvas.toDataURL(mimeType, 0.9));
    releaseCanvas(canvas);
    return { base64: outBase64, mimeType };
  } catch {
    return null;
  }
}



