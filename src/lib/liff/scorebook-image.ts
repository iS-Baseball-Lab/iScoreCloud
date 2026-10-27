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

export interface StructureFocusCrops {
  lineupCropBase64: string;
  summaryCropBase64: string;
  mimeType: string;
}

/**
 * スマホで撮影したスコアブック画像をCanvas上で前処理する
 * - 90度単位の回転補正
 * - 余白トリミング
 * - 長辺2200pxへの高精細リサイズ（文字潰れ防止と高速送信の両立）
 * - 【重要】薄い鉛筆線や罫線を白飛びさせない非破壊コントラスト強調（オプション時のみ）
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

  // 4. 鉛筆＆赤ペン濃さ強調（薄いHB/2H鉛筆の筆跡や印刷罫線を絶対に白飛びさせない穏やかなS字補正）
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
        data[i] = Math.min(255, Math.round(r * 1.06));
        data[i + 1] = Math.max(0, Math.round(g * 0.72));
        data[i + 2] = Math.max(0, Math.round(b * 0.72));
        continue;
      }

      // 輝度236以上の完全な白紙背景のみ軽く整え、190〜235の薄い鉛筆線・罫線は絶対に消さない
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum > 236) {
        const boost = Math.min(255, Math.round(236 + (lum - 236) * 1.15));
        const ratio = lum > 0 ? boost / lum : 1;
        data[i] = Math.min(255, Math.round(r * ratio));
        data[i + 1] = Math.min(255, Math.round(g * ratio));
        data[i + 2] = Math.min(255, Math.round(b * ratio));
      } else if (lum < 188) {
        // 薄い鉛筆〜濃い文字の筆跡を自然に引き締める
        const darkFactor = lum < 125 ? 0.76 : 0.88;
        data[i] = Math.max(0, Math.round(r * darkFactor));
        data[i + 1] = Math.max(0, Math.round(g * darkFactor));
        data[i + 2] = Math.max(0, Math.round(b * darkFactor));
      }
    }

    outCtx.putImageData(imageData, 0, 0);
  }

  const mimeType = "image/jpeg";
  const dataUrl = outCanvas.toDataURL(mimeType, 0.9);
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
 * API送信直前に高精細（長辺2200px・JPEG品質0.90）を維持しつつ適切なペイロードサイズに整える。
 * 細かい手書き漢字・背番号・BSO記号が潰れない解像度を確保する。
 */
export async function ensureCompactApiImage(
  processed: PreprocessedScorebookImage,
  maxLongEdge = 2200,
  quality = 0.9
): Promise<{ base64: string; mimeType: string }> {
  const currentLong = Math.max(processed.width, processed.height);
  if (currentLong <= maxLongEdge && processed.base64.length <= 1_450_000) {
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
  return { base64: stripDataUrlPrefix(dataUrl), mimeType };
}

/**
 * Stage 1（骨格スキャン）精度向上のため、シート全体画像に加えて
 * 1) 左側の「打順・守備位置・背番号・選手名・途中交代欄」の拡大クロップ
 * 2) 上部「スコアボード＆各列のイニング見出し番号」＋下部「各回計＆投手成績欄」の上下結合拡大クロップ
 * を自動生成する。
 */
export async function extractStructureFocusCrops(
  sourceDataUrl: string
): Promise<StructureFocusCrops | null> {
  try {
    const img = await loadImageFromUrl(sourceDataUrl);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w < 120 || h < 120) return null;

    const mimeType = "image/jpeg";

    // 1. 左側 0%〜44%（打順・守備・背番号・氏名・途中交代欄）の高解像度クロップ
    const lineupSrcW = Math.max(64, Math.round(w * 0.44));
    const lineupSrcH = h;
    const lineupMaxEdge = 1800;
    const lineupScale =
      Math.max(lineupSrcW, lineupSrcH) > lineupMaxEdge
        ? lineupMaxEdge / Math.max(lineupSrcW, lineupSrcH)
        : 1;
    const lineupCanvas = document.createElement("canvas");
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
      lineupCanvas.toDataURL(mimeType, 0.92)
    );

    // 2. 上部 0%〜26%（スコアボード＆イニング列ヘッダー番号）＋ 下部 68%〜100%（各列合計得点・安打・投手欄）を1枚に結合
    const topStripH = Math.max(48, Math.round(h * 0.26));
    const botStripY = Math.round(h * 0.68);
    const botStripH = Math.max(48, h - botStripY);
    const dividerH = 8;
    const rawCompW = w;
    const rawCompH = topStripH + dividerH + botStripH;
    const summaryMaxEdge = 1800;
    const sumScale =
      Math.max(rawCompW, rawCompH) > summaryMaxEdge
        ? summaryMaxEdge / Math.max(rawCompW, rawCompH)
        : 1;

    const sumCanvas = document.createElement("canvas");
    sumCanvas.width = Math.max(64, Math.round(rawCompW * sumScale));
    sumCanvas.height = Math.max(64, Math.round(rawCompH * sumScale));
    const sumCtx = sumCanvas.getContext("2d");
    if (!sumCtx) return null;
    sumCtx.imageSmoothingEnabled = true;
    sumCtx.imageSmoothingQuality = "high";

    const outTopH = Math.round(topStripH * sumScale);
    const outDivH = Math.max(4, Math.round(dividerH * sumScale));
    const outBotH = sumCanvas.height - outTopH - outDivH;

    sumCtx.drawImage(img, 0, 0, w, topStripH, 0, 0, sumCanvas.width, outTopH);
    sumCtx.fillStyle = "#1e293b";
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
      Math.max(24, outBotH)
    );

    const summaryCropBase64 = stripDataUrlPrefix(
      sumCanvas.toDataURL(mimeType, 0.92)
    );

    return {
      lineupCropBase64,
      summaryCropBase64,
      mimeType,
    };
  } catch {
    return null;
  }
}

/**
 * Stage 2（イニング分割ディープ解析）で列ズレ（1回と2回の取り違え等）を物理的に防ぐため、
 * 左端の「打順・選手名欄 (0%〜30%)」と「対象イニング列 (columnBox周辺)」を
 * Y座標（行の高さ）を1pxもずらさずに横並び結合した高精細フォーカス画像を生成する。
 */
export async function extractInningChunkCompositeCrop(
  sourceDataUrl: string,
  columnBoxes: NormalizedBox[]
): Promise<{ base64: string; mimeType: string } | null> {
  if (columnBoxes.length === 0) return null;
  try {
    const img = await loadImageFromUrl(sourceDataUrl);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w < 120 || h < 120) return null;

    let minColX = 1000;
    let maxColX = 0;
    for (const [, xmin, , xmax] of columnBoxes) {
      minColX = Math.min(minColX, xmin);
      maxColX = Math.max(maxColX, xmax);
    }
    if (maxColX <= minColX || minColX >= 980) return null;

    // 左パネル: 打順・選手名欄 (0% 〜 30%)
    const leftPanelW = Math.max(48, Math.round(w * 0.3));
    // 右パネル: 対象イニング列（見出し番号や境界線が確実に読めるよう左右に余白4.5%を確保）
    const targetStartNorm = Math.max(0.18, (minColX - 45) / 1000);
    const targetEndNorm = Math.min(1, (maxColX + 45) / 1000);
    if (targetEndNorm - targetStartNorm < 0.05) return null;

    const rightSrcX = Math.round(w * targetStartNorm);
    const rightSrcW = Math.max(48, Math.round(w * (targetEndNorm - targetStartNorm)));

    const dividerW = 8;
    const rawTotalW = leftPanelW + dividerW + rightSrcW;
    const rawTotalH = h;
    const maxEdge = 1800;
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
    const outDivW = Math.max(4, Math.round(dividerW * scale));
    const outRightW = Math.max(32, canvas.width - outLeftW - outDivW);

    // 左側に打順・選手名をそのままの高さで描画
    ctx.drawImage(img, 0, 0, leftPanelW, h, 0, 0, outLeftW, canvas.height);
    // 視認しやすいシアン境界線
    ctx.fillStyle = "#0284c7";
    ctx.fillRect(outLeftW, 0, outDivW, canvas.height);
    // 右隣に対象イニング列のみを同じY座標のまま描画
    ctx.drawImage(
      img,
      rightSrcX,
      0,
      rightSrcW,
      h,
      outLeftW + outDivW,
      0,
      outRightW,
      canvas.height
    );

    const mimeType = "image/jpeg";
    const dataUrl = canvas.toDataURL(mimeType, 0.92);
    return {
      base64: stripDataUrlPrefix(dataUrl),
      mimeType,
    };
  } catch {
    return null;
  }
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

function stripDataUrlPrefix(dataUrl: string): string {
  const commaIdx = dataUrl.indexOf(",");
  return commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;
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

