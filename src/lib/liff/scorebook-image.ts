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
 * API送信直前に高精細（長辺1850px・JPEG品質0.88）を維持しつつ、
 * Gemini MEDIA_RESOLUTION_HIGH のタイル分割数を最適化して初動レスポンス速度と文字鮮明度を両立する。
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

    // 1. 左側 0%〜36%（打順・守備・背番号・氏名・途中交代欄）の高解像度クロップ（768px×2タイル境界内の1520pxで高速・高精細）
    const lineupSrcW = Math.max(64, Math.round(w * 0.36));
    const lineupSrcH = h;
    const lineupMaxEdge = 1520;
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
      lineupCanvas.toDataURL(mimeType, 0.88)
    );

    // 2. 上部 0%〜28%（スコアボード＆イニング列ヘッダー番号）＋ 下部 64%〜100%（各列合計得点・安打・投手欄）を1枚に結合
    const topStripH = Math.max(48, Math.round(h * 0.28));
    const botStripY = Math.round(h * 0.64);
    const botStripH = Math.max(48, h - botStripY);
    const dividerH = 8;
    const rawCompW = w;
    const rawCompH = topStripH + dividerH + botStripH;
    const summaryMaxEdge = 1520;
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
      sumCanvas.toDataURL(mimeType, 0.88)
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
  /** Stage 1で検出した打順欄の右端X座標 (0〜1000) */
  lineupRightX?: number;
  /** 1回列の左端X座標 (0〜1000)。左パネルに1回の打席マスが絶対混入しないよう厳密クリップに使用 */
  firstInningMinX?: number;
  /** 打順ごとの行Y座標ガイド（検証済みの場合のみ行番号マーカーを描画） */
  batters?: ReadonlyArray<{
    battingOrder: number;
    name: string;
    rowBox?: NormalizedBox;
  }>;
  /** 対象イニング番号（赤枠ラベル描画用） */
  targetInnings?: readonly number[];
}

/**
 * Stage 2（イニング分割ディープ解析）で列ズレや1回マスの混入を物理的に防ぐため、
 * 1) 左端の「打順・選手名欄のみ（1回列の直前で厳密クリップ）」と
 * 2) 右側の「対象イニング列（赤枠ハイライト＋隣接列の減光マスク付き）」を
 * Y座標（行の高さ）を1pxもずらさずに横並び結合した高精度ビジュアルガイド画像を生成する。
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
    if (maxColX <= minColX || minColX >= 980) return null;

    // 【超重要】左パネルに1回列の打席マスが絶対混入しないよう、1回列の左端手前で厳密に打ち切る
    const candidateBoundary =
      typeof options?.lineupRightX === "number" &&
      options.lineupRightX >= 80 &&
      options.lineupRightX <= 340
        ? options.lineupRightX
        : typeof options?.firstInningMinX === "number" &&
          options.firstInningMinX >= 90 &&
          options.firstInningMinX <= 360
        ? options.firstInningMinX - 3
        : minColX >= 90 && minColX <= 290
        ? minColX - 3
        : 205;

    const leftEndNorm = Math.max(
      0.11,
      Math.min(0.26, candidateBoundary / 1000)
    );
    const leftPanelW = Math.max(48, Math.round(w * leftEndNorm));

    // 右パネル: 対象イニング列（見出し番号と左右縦罫線が読める最小限の余白2.6%のみ確保）
    const padX = 26;
    const targetStartNorm = Math.max(leftEndNorm, (minColX - padX) / 1000);
    const targetEndNorm = Math.min(1, (maxColX + padX) / 1000);
    if (targetEndNorm - targetStartNorm < 0.04) return null;

    const rightSrcX = Math.round(w * targetStartNorm);
    const rightSrcW = Math.max(
      48,
      Math.round(w * (targetEndNorm - targetStartNorm))
    );

    const dividerW = 24;
    const rawTotalW = leftPanelW + dividerW + rightSrcW;
    const rawTotalH = h;
    const maxEdge = 1520;
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
    const outDivW = Math.max(16, Math.round(dividerW * scale));
    const outRightX = outLeftW + outDivW;
    const outRightW = Math.max(32, canvas.width - outRightX);

    // 1. 左側に打順・選手名欄のみを同じY座標のまま描画
    ctx.drawImage(img, 0, 0, leftPanelW, h, 0, 0, outLeftW, canvas.height);

    // 2. 中央に濃紺セパレーター帯を描画（ここに行番号バッジを配置）
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(outLeftW, 0, outDivW, canvas.height);

    // 3. 右隣に対象イニング列を同じY座標のまま描画
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

    // 4. 対象イニング列の左右外側にわずかに写り込んだ隣接イニング列を減光し、対象列を赤枠で明確に囲む
    const focusLeftInRight =
      ((minColX / 1000 - targetStartNorm) / (targetEndNorm - targetStartNorm)) *
      outRightW;
    const focusRightInRight =
      ((maxColX / 1000 - targetStartNorm) / (targetEndNorm - targetStartNorm)) *
      outRightW;
    const clampedFocusL = Math.max(0, Math.round(focusLeftInRight) - 2);
    const clampedFocusR = Math.min(
      outRightW,
      Math.round(focusRightInRight) + 2
    );

    ctx.fillStyle = "rgba(15, 23, 42, 0.36)";
    if (clampedFocusL > 2) {
      ctx.fillRect(outRightX, 0, clampedFocusL, canvas.height);
    }
    if (clampedFocusR < outRightW - 2) {
      ctx.fillRect(
        outRightX + clampedFocusR,
        0,
        outRightW - clampedFocusR,
        canvas.height
      );
    }

    const frameTopY =
      minColY < maxColY && minColY >= 20
        ? Math.max(0, Math.round(((minColY - 25) / 1000) * canvas.height))
        : 0;
    const frameBotY =
      minColY < maxColY && maxColY <= 990
        ? Math.min(
            canvas.height,
            Math.round(((maxColY + 15) / 1000) * canvas.height)
          )
        : canvas.height;

    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = Math.max(2, Math.round(3 * scale));
    ctx.strokeRect(
      outRightX + clampedFocusL + 1,
      frameTopY + 1,
      Math.max(12, clampedFocusR - clampedFocusL - 2),
      Math.max(24, frameBotY - frameTopY - 2)
    );

    if (options?.targetInnings && options.targetInnings.length > 0) {
      const badgeText = `${options.targetInnings.join("・")}回 対象列`;
      const fontPx = Math.max(11, Math.round(14 * scale));
      ctx.font = `bold ${fontPx}px sans-serif`;
      const textW = ctx.measureText(badgeText).width;
      const badgeW = Math.min(outRightW - 4, Math.ceil(textW + 12));
      const badgeH = fontPx + 8;
      const badgeX =
        outRightX +
        Math.max(
          2,
          Math.min(
            outRightW - badgeW - 2,
            Math.round((clampedFocusL + clampedFocusR - badgeW) / 2)
          )
        );
      const badgeY = Math.max(2, frameTopY - badgeH - 2);
      ctx.fillStyle = "#dc2626";
      ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = "middle";
      ctx.fillText(badgeText, badgeX + 6, badgeY + badgeH / 2);
    }

    // 5. Stage 1で各打順の行Y座標(rowBox)が単調増加で取得できている場合、中央セパレーター帯に打順番号マーカーを描画
    const validRows = (options?.batters || []).filter(
      (b): b is { battingOrder: number; name: string; rowBox: NormalizedBox } =>
        Array.isArray(b.rowBox) &&
        b.rowBox.length === 4 &&
        b.rowBox[2] > b.rowBox[0]
    );
    let isStrictlyMonotonic = validRows.length >= 7;
    for (let i = 1; i < validRows.length; i++) {
      if (validRows[i].rowBox[0] < validRows[i - 1].rowBox[0] + 12) {
        isStrictlyMonotonic = false;
        break;
      }
    }

    if (isStrictlyMonotonic) {
      const rowFontPx = Math.max(10, Math.round(12 * scale));
      ctx.font = `bold ${rowFontPx}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (const row of validRows) {
        const yTop = Math.round((row.rowBox[0] / 1000) * canvas.height);
        const yBot = Math.round((row.rowBox[2] / 1000) * canvas.height);
        const yMid = Math.round((yTop + yBot) / 2);

        // 水平の薄い破線ガイドで行の対応を一目瞭然にする
        ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.max(0, outLeftW - 18), yTop);
        ctx.lineTo(outRightX + clampedFocusR, yTop);
        ctx.stroke();

        // 中央帯に打順番号（1〜9）を白抜き描画
        ctx.fillStyle = "#38bdf8";
        ctx.fillText(
          String(row.battingOrder),
          outLeftW + outDivW / 2,
          yMid
        );
      }
      ctx.textAlign = "start";
    }

    const mimeType = "image/jpeg";
    const dataUrl = canvas.toDataURL(mimeType, 0.88);
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

