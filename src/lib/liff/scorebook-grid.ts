// filepath: src/lib/liff/scorebook-grid.ts
import type {
  NormalizedBox,
  NormalizedPoint,
  ScorebookBatterSlot,
  ScorebookGridCorners,
  ScorebookInningMeta,
  ScorebookSheetStructure,
} from "@/types/scorebook-v2";

export function clamp1000(val: number): number {
  return Math.max(0, Math.min(1000, Math.round(val)));
}

export function sanitizeGridCorners(
  raw?: {
    tl?: readonly number[];
    tr?: readonly number[];
    br?: readonly number[];
    bl?: readonly number[];
  } | null
): ScorebookGridCorners | undefined {
  if (!raw || !raw.tl || !raw.tr || !raw.br || !raw.bl) {
    return undefined;
  }
  if (
    raw.tl.length < 2 ||
    raw.tr.length < 2 ||
    raw.br.length < 2 ||
    raw.bl.length < 2
  ) {
    return undefined;
  }

  const tl: NormalizedPoint = [clamp1000(raw.tl[0]), clamp1000(raw.tl[1])];
  const tr: NormalizedPoint = [clamp1000(raw.tr[0]), clamp1000(raw.tr[1])];
  const br: NormalizedPoint = [clamp1000(raw.br[0]), clamp1000(raw.br[1])];
  const bl: NormalizedPoint = [clamp1000(raw.bl[0]), clamp1000(raw.bl[1])];

  // スコアブックの打席グリッドとして成立する最低サイズ＆向きチェック
  if (
    tr[0] - tl[0] < 80 ||
    br[0] - bl[0] < 80 ||
    bl[1] - tl[1] < 120 ||
    br[1] - tr[1] < 120
  ) {
    return undefined;
  }

  return { tl, tr, br, bl };
}

/**
 * シート構造から打席グリッドの4隅座標 (tl, tr, br, bl) を取得する。
 * gridCorners が未設定の既存データでも columnBox / rowBox / lineupRightX から完全互換で復元する。
 */
export function resolveStructureGridCorners(
  structure: Pick<
    ScorebookSheetStructure,
    "gridCorners" | "innings" | "batters" | "lineupRightX"
  >
): ScorebookGridCorners {
  const valid = sanitizeGridCorners(structure.gridCorners);
  if (valid) {
    return valid;
  }

  const batterCount = Math.max(1, structure.batters.length);
  const firstInnBox = structure.innings[0]?.columnBox;
  const lastInnBox =
    structure.innings[structure.innings.length - 1]?.columnBox;
  const firstBatBox = structure.batters[0]?.rowBox;
  const lastBatBox =
    structure.batters[structure.batters.length - 1]?.rowBox;

  const totalPhysCols = Math.max(
    1,
    structure.innings.reduce(
      (acc, m) => acc + Math.max(1, m.columnCount || 1),
      0
    )
  );

  const leftX = clamp1000(
    firstInnBox?.[1] ?? structure.lineupRightX ?? 310
  );
  const rightX = clamp1000(
    lastInnBox?.[3] ?? Math.min(960, Math.round(leftX + totalPhysCols * 58))
  );
  const topY = clamp1000(firstBatBox?.[0] ?? firstInnBox?.[0] ?? 165);
  const bottomY = clamp1000(
    lastBatBox?.[2] ??
      lastInnBox?.[2] ??
      Math.min(930, Math.round(topY + batterCount * 66))
  );

  return {
    tl: [leftX, topY],
    tr: [Math.max(leftX + 80, rightX), topY],
    br: [Math.max(leftX + 80, rightX), Math.max(topY + 120, bottomY)],
    bl: [leftX, Math.max(topY + 120, bottomY)],
  };
}

/**
 * 4隅グリッド上の正規化パラメータ (s: 横方向 0..1, t: 縦方向 0..1) からシート座標 [x, y] (0..1000) を双線形補間する
 */
export function bilinearGridPoint(
  corners: ScorebookGridCorners,
  s: number,
  t: number
): NormalizedPoint {
  const x =
    (1 - s) * (1 - t) * corners.tl[0] +
    s * (1 - t) * corners.tr[0] +
    s * t * corners.br[0] +
    (1 - s) * t * corners.bl[0];
  const y =
    (1 - s) * (1 - t) * corners.tl[1] +
    s * (1 - t) * corners.tr[1] +
    s * t * corners.br[1] +
    (1 - s) * t * corners.bl[1];
  return [x, y];
}

export function quadToBoundingBox(quad: ScorebookGridCorners): NormalizedBox {
  const xs = [quad.tl[0], quad.tr[0], quad.br[0], quad.bl[0]];
  const ys = [quad.tl[1], quad.tr[1], quad.br[1], quad.bl[1]];
  const x1 = clamp1000(Math.min(...xs));
  const y1 = clamp1000(Math.min(...ys));
  const x2 = Math.max(x1 + 10, clamp1000(Math.max(...xs)));
  const y2 = Math.max(y1 + 10, clamp1000(Math.max(...ys)));
  return [y1, x1, y2, x2];
}

/**
 * 指定イニング＆サブ列（1列目・2列目・3列目...）の横方向比率 [s0, s1] (0..1) を算出する
 */
export function getInningSubColumnFractions(
  innings: ReadonlyArray<ScorebookInningMeta>,
  inning: number,
  subColIndex = 1
): {
  s0: number;
  s1: number;
  inningS0: number;
  inningS1: number;
  totalPhysCols: number;
  subColsInInning: number;
  safeSubCol: number;
} | null {
  if (innings.length === 0) return null;
  const totalPhysCols = Math.max(
    1,
    innings.reduce((acc, m) => acc + Math.max(1, m.columnCount || 1), 0)
  );

  let cumCols = 0;
  for (const m of innings) {
    const cols = Math.max(1, m.columnCount || 1);
    if (m.inning === inning) {
      const safeSubCol = Math.max(1, Math.min(cols, subColIndex || 1));
      const inningS0 = cumCols / totalPhysCols;
      const inningS1 = (cumCols + cols) / totalPhysCols;
      const s0 = (cumCols + safeSubCol - 1) / totalPhysCols;
      const s1 = (cumCols + safeSubCol) / totalPhysCols;
      return {
        s0,
        s1,
        inningS0,
        inningS1,
        totalPhysCols,
        subColsInInning: cols,
        safeSubCol,
      };
    }
    cumCols += cols;
  }

  return null;
}

/**
 * 歪み・傾き・複数列（2列・3列以上）すべてに対応した「特定の1マス（イニング×サブ列×打順）」の4隅座標を返す
 */
export function getCellQuadInStructure(
  structure: Pick<
    ScorebookSheetStructure,
    "gridCorners" | "innings" | "batters" | "lineupRightX"
  >,
  inning: number,
  subColIndex: number,
  battingOrder: number,
  cellPadRatio = 0
): ScorebookGridCorners | null {
  const corners = resolveStructureGridCorners(structure);
  const colFrac = getInningSubColumnFractions(
    structure.innings,
    inning,
    subColIndex
  );
  if (!colFrac) return null;

  const bLen = Math.max(1, structure.batters.length);
  const bIdx = structure.batters.findIndex(
    (b) => b.battingOrder === battingOrder
  );
  const effectiveIdx =
    bIdx >= 0 ? bIdx : Math.max(0, Math.min(bLen - 1, battingOrder - 1));

  const ds = (colFrac.s1 - colFrac.s0) * cellPadRatio;
  const dt = (1 / bLen) * cellPadRatio;
  const s0 = colFrac.s0 - ds;
  const s1 = colFrac.s1 + ds;
  const t0 = effectiveIdx / bLen - dt;
  const t1 = (effectiveIdx + 1) / bLen + dt;

  return {
    tl: bilinearGridPoint(corners, s0, t0),
    tr: bilinearGridPoint(corners, s1, t0),
    br: bilinearGridPoint(corners, s1, t1),
    bl: bilinearGridPoint(corners, s0, t1),
  };
}

/**
 * 4隅座標 (gridCorners) の変更や列数・打順数の変更に合わせて、
 * lineupRightX・batters[].rowBox・innings[].columnBox を一貫して再計算する
 */
export function syncStructureBoxesFromCorners(
  base: ScorebookSheetStructure,
  rawCorners: ScorebookGridCorners
): ScorebookSheetStructure {
  const corners: ScorebookGridCorners = {
    tl: [
      Math.max(80, Math.min(580, Math.round(rawCorners.tl[0]))),
      Math.max(15, Math.min(480, Math.round(rawCorners.tl[1]))),
    ],
    tr: [
      Math.max(300, Math.min(992, Math.round(rawCorners.tr[0]))),
      Math.max(15, Math.min(480, Math.round(rawCorners.tr[1]))),
    ],
    br: [
      Math.max(300, Math.min(992, Math.round(rawCorners.br[0]))),
      Math.max(380, Math.min(992, Math.round(rawCorners.br[1]))),
    ],
    bl: [
      Math.max(80, Math.min(580, Math.round(rawCorners.bl[0]))),
      Math.max(380, Math.min(992, Math.round(rawCorners.bl[1]))),
    ],
  };

  // 左右・上下の最低幅を保証
  if (corners.tr[0] < corners.tl[0] + 80) {
    corners.tr[0] = Math.min(992, corners.tl[0] + 80);
  }
  if (corners.br[0] < corners.bl[0] + 80) {
    corners.br[0] = Math.min(992, corners.bl[0] + 80);
  }
  if (corners.bl[1] < corners.tl[1] + 120) {
    corners.bl[1] = Math.min(992, corners.tl[1] + 120);
  }
  if (corners.br[1] < corners.tr[1] + 120) {
    corners.br[1] = Math.min(992, corners.tr[1] + 120);
  }

  const avgLeftX = Math.round((corners.tl[0] + corners.bl[0]) / 2);
  const bLen = Math.max(1, base.batters.length);

  const nextBatters: ScorebookBatterSlot[] = base.batters.map((b, idx) => {
    const t0 = idx / bLen;
    const t1 = (idx + 1) / bLen;
    const pTop = bilinearGridPoint(corners, 0, t0);
    const pBot = bilinearGridPoint(corners, 0, t1);
    const y1 = clamp1000(pTop[1]);
    const y2 = Math.max(y1 + 12, clamp1000(pBot[1]));
    const rRight = clamp1000(Math.max(pTop[0], pBot[0]));
    return {
      ...b,
      rowBox: [y1, 0, y2, Math.max(20, rRight)] as NormalizedBox,
    };
  });

  const totalPhysCols = Math.max(
    1,
    base.innings.reduce((acc, m) => acc + Math.max(1, m.columnCount || 1), 0)
  );
  let cumCols = 0;
  const nextInnings: ScorebookInningMeta[] = base.innings.map((m) => {
    const w = Math.max(1, m.columnCount || 1);
    const s0 = cumCols / totalPhysCols;
    cumCols += w;
    const s1 = cumCols / totalPhysCols;
    const q = {
      tl: bilinearGridPoint(corners, s0, 0),
      tr: bilinearGridPoint(corners, s1, 0),
      br: bilinearGridPoint(corners, s1, 1),
      bl: bilinearGridPoint(corners, s0, 1),
    };
    return {
      ...m,
      columnBox: quadToBoundingBox(q),
    };
  });

  return {
    ...base,
    lineupRightX: avgLeftX,
    gridCorners: corners,
    batters: nextBatters,
    innings: nextInnings,
  };
}

/**
 * 単位正方形 (u,v)∈[0,1]^2 から任意の四角形 (tl, tr, br, bl) への射影変換（ホモグラフィ）を使い、
 * 歪んだ四角形領域を長方形 (dstW × dstH) の RGBA ピクセルバッファへ高精度バイリニア補間で真っ直ぐ展開する。
 */
export function warpQuadFromRgbaBuffer(
  srcData: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  quadPx: {
    tl: readonly [number, number];
    tr: readonly [number, number];
    br: readonly [number, number];
    bl: readonly [number, number];
  },
  dstData: Uint8ClampedArray,
  dstW: number,
  dstH: number
): void {
  const [x0, y0] = quadPx.tl;
  const [x1, y1] = quadPx.tr;
  const [x2, y2] = quadPx.br;
  const [x3, y3] = quadPx.bl;

  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const sxSum = x0 - x1 + x2 - x3;

  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const sySum = y0 - y1 + y2 - y3;

  const det = dx1 * dy2 - dx2 * dy1;
  let g = 0;
  let h = 0;
  if (Math.abs(det) > 1e-7) {
    g = (sxSum * dy2 - dx2 * sySum) / det;
    h = (dx1 * sySum - sxSum * dy1) / det;
  }

  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + h * x3;
  const c = x0;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + h * y3;
  const f = y0;

  const maxSrcX = srcW - 1.001;
  const maxSrcY = srcH - 1.001;
  const invW = dstW > 1 ? 1 / (dstW - 1) : 0;
  const invH = dstH > 1 ? 1 / (dstH - 1) : 0;

  let dstIdx = 0;
  for (let py = 0; py < dstH; py++) {
    const v = py * invH;
    const bv = b * v + c;
    const ev = e * v + f;
    const hv = h * v + 1;

    for (let px = 0; px < dstW; px++) {
      const u = px * invW;
      const denom = g * u + hv;
      const invDenom = Math.abs(denom) > 1e-7 ? 1 / denom : 1;

      const srcX = Math.max(0, Math.min(maxSrcX, (a * u + bv) * invDenom));
      const srcY = Math.max(0, Math.min(maxSrcY, (d * u + ev) * invDenom));

      const ix = srcX | 0;
      const iy = srcY | 0;
      const fx = srcX - ix;
      const fy = srcY - iy;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      const p00 = (iy * srcW + ix) << 2;
      const p10 = p00 + 4;
      const p01 = p00 + (srcW << 2);
      const p11 = p01 + 4;

      dstData[dstIdx] =
        srcData[p00] * w00 +
        srcData[p10] * w10 +
        srcData[p01] * w01 +
        srcData[p11] * w11;
      dstData[dstIdx + 1] =
        srcData[p00 + 1] * w00 +
        srcData[p10 + 1] * w10 +
        srcData[p01 + 1] * w01 +
        srcData[p11 + 1] * w11;
      dstData[dstIdx + 2] =
        srcData[p00 + 2] * w00 +
        srcData[p10 + 2] * w10 +
        srcData[p01 + 2] * w01 +
        srcData[p11 + 2] * w11;
      dstData[dstIdx + 3] = 255;
      dstIdx += 4;
    }
  }
}

