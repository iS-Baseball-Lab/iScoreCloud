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
 * 照明ムラ・スマホの影を除去しつつ、薄い鉛筆の手書き数字（6-3, 8, ①②③, 背番号）と赤ペンを鮮明化する局所適応コントラスト補正
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

  // 2. 双線形補間で影の境界を滑らかに除去しながら鉛筆筆跡と赤ペンを強調
  for (let y = 0; y < height; y++) {
    const gy = Math.max(0, Math.min(tileRows - 1.001, (y + 0.5) / tileH - 0.5));
    const ty0 = Math.floor(gy);
    const ty1 = Math.min(tileRows - 1, ty0 + 1);
    const wy = gy - ty0;

    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // 赤ペン判定（早稲田式スコアブックの安打・打点・盗塁など）
      const redness = r - Math.max(g, b);
      if (redness > 20 && r > 85) {
        data[i] = Math.min(255, Math.round(r * 1.08));
        data[i + 1] = Math.max(0, Math.round(g * 0.68));
        data[i + 2] = Math.max(0, Math.round(b * 0.68));
        continue;
      }

      const gx = Math.max(
        0,
        Math.min(tileCols - 1.001, (x + 0.5) / tileW - 0.5)
      );
      const tx0 = Math.floor(gx);
      const tx1 = Math.min(tileCols - 1, tx0 + 1);
      const wx = gx - tx0;

      const w00 = tileWhite[ty0 * tileCols + tx0];
      const w10 = tileWhite[ty0 * tileCols + tx1];
      const w01 = tileWhite[ty1 * tileCols + tx0];
      const w11 = tileWhite[ty1 * tileCols + tx1];
      const paperLum =
        (w00 * (1 - wx) + w10 * wx) * (1 - wy) +
        (w01 * (1 - wx) + w11 * wx) * wy;

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const rel = paperLum > 1 ? lum / paperLum : 1;

      let targetLum: number;
      if (rel >= 0.93) {
        targetLum = Math.min(255, Math.round(248 + (rel - 0.93) * 100));
      } else {
        const ink = Math.max(0, (0.93 - rel) / 0.93);
        const gain = Math.min(1, Math.pow(ink * 1.82, 0.94));
        targetLum = Math.max(0, Math.round(248 * (1 - gain)));
      }

      if (lum > 1) {
        const ratio = targetLum / lum;
        data[i] = Math.max(0, Math.min(255, Math.round(r * ratio)));
        data[i + 1] = Math.max(0, Math.min(255, Math.round(g * ratio)));
        data[i + 2] = Math.max(0, Math.min(255, Math.round(b * ratio)));
      }
    }
  }
}

/**
 * スマホで撮影したスコアブック画像をCanvas上で前処理する
 * - 90度単位の回転補正
 * - 余白トリミング
 * - 長辺3000pxの高精細マスター保持（細かい手書き数字・BSO記号の切り抜き鮮明度を最大化）
 * - 照明ムラ除去＆薄い鉛筆強調（enhancePencil有効時）
 */
export async function preprocessScorebookImage(
  file: File,
  options: ImagePreprocessOptions
): Promise<PreprocessedScorebookImage> {
  const img = await loadImageFromFile(file);
  const maxLongEdge = options.maxLongEdge ?? 3000;
  const insets = options.cropInsets ?? { top: 0, right: 0, bottom: 0, left: 0 };

  // 1. 回転を適用した中間Canvasを作成
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

  // 4. 局所適応の影除去＆鉛筆・赤ペン強調
  if (options.enhancePencil) {
    const imageData = outCtx.getImageData(0, 0, outW, outH);
    applyAdaptivePencilContrast(imageData, outW, outH);
    outCtx.putImageData(imageData, 0, 0);
  }

  const mimeType = "image/jpeg";
  const dataUrl = outCanvas.toDataURL(mimeType, 0.91);
  const base64 = stripDataUrlPrefix(dataUrl);

  return {
    dataUrl,
    base64,
    mimeType,
    width: outW,
    height: outH,
  };
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
  if (currentLong <= maxLongEdge && processed.base64.length <= 920_000) {
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
 * シートの上下左右4辺の余白端（外側約1.4%）に「0〜1000の精密目盛りルーラー」を重ねた全体画像を生成する。
 * キャンバスサイズを元画像と100%同一比率（余白追加ゼロ）に保つことで、
 * Gemini本来の内部ビジョン空間座標(0..1000)と印刷された目盛り数値(0..1000)を1pxの狂いもなく完全一致させる。
 */
export async function buildCalibratedRulerSheetImage(
  processed: PreprocessedScorebookImage,
  maxInnerLongEdge = 1850,
  quality = 0.89
): Promise<{ base64: string; mimeType: string }> {
  try {
    const img = await loadImageFromUrl(processed.dataUrl);
    const srcW = img.naturalWidth || processed.width;
    const srcH = img.naturalHeight || processed.height;
    const longEdge = Math.max(srcW, srcH);
    const scale =
      longEdge > maxInnerLongEdge ? maxInnerLongEdge / longEdge : 1;
    const innerW = Math.max(120, Math.round(srcW * scale));
    const innerH = Math.max(120, Math.round(srcH * scale));

    const canvas = document.createElement("canvas");
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
    return {
      base64: stripDataUrlPrefix(canvas.toDataURL(mimeType, quality)),
      mimeType,
    };
  } catch {
    return ensureCompactApiImage(processed, maxInnerLongEdge, quality);
  }
}

/**
 * Stage 1（骨格スキャン）精度向上のため、3000pxマスター画像から
 * 1) 左側 0%〜42%「打順・守備位置・背番号・選手名・途中交代欄」の高精細拡大クロップ
 * 2) 上部 0%〜28%「スコアボード＆イニング見出し番号」＋下部 56%〜100%「各回計＆投手継投成績欄」の上下結合拡大クロップ
 * を自動生成する。
 */
export async function extractStructureFocusCrops(
  sourceDataUrl: string,
  alreadyEnhanced = false
): Promise<StructureFocusCrops | null> {
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
      lineupCanvas.toDataURL(mimeType, 0.9)
    );

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

    const sumCanvas = document.createElement("canvas");
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
      sumCanvas.toDataURL(mimeType, 0.9)
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

export interface InningChunkCropOptions {
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
 * 3000pxマスター画像から対象イニングの各打順マスを1段ずつ大きく切り離して高精細拡大した
 * 「打順別セルマトリクス画像」を生成する。
 * ※早稲田式の赤線（安打線）と混同しないよう、赤色の枠線は一切描画しない。
 */
export async function extractInningChunkCompositeCrop(
  sourceDataUrl: string,
  columnBoxes: NormalizedBox[],
  options?: InningChunkCropOptions
): Promise<{ base64: string; mimeType: string } | null> {
  if (columnBoxes.length === 0) return null;
  try {
    const img = await loadImageFromUrl(sourceDataUrl);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w < 120 || h < 120) return null;

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
    img.onerror = () =>
      reject(new Error("プレビュー画像の生成に失敗しました"));
    img.src = url;
  });
}
