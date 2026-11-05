// filepath: src/lib/liff/scorebook-renderer-model.ts
import {
  isPrePlayAdvanceMethod,
  simulateSheetRunners,
  type OccupiedBaseKey,
} from "@/lib/liff/scorebook-runners";
import {
  isNonPitchMoundEvent,
  type AdvanceMethodCode,
  type CanonicalAtBatResult,
  type CanonicalPitchResult,
  type ScorebookBatterSlot,
  type ScorebookPitcherStint,
  type ScorebookSheetStructure,
  type ScorebookSubstitution,
  type ScorebookV2AtBat,
} from "@/types/scorebook-v2";

export interface ScorebookMatchHeaderMeta {
  matchId: string;
  date: string;
  startTime?: string;
  matchTypeLabel: string;
  tournamentName?: string | null;
  venueName?: string | null;
  topTeamName: string;
  bottomTeamName: string;
  scheduledInnings: number;
  topInningScores: number[];
  bottomInningScores: number[];
  topTotalRuns: number;
  bottomTotalRuns: number;
  topTotalHits: number;
  bottomTotalHits: number;
  topTotalErrors: number;
  bottomTotalErrors: number;
}

export type BaseSegmentIndex = 1 | 2 | 3 | 4;

export interface CompiledDiamondSegment {
  /** 1: HP->1B, 2: 1B->2B, 3: 2B->3B, 4: 3B->HP */
  segment: BaseSegmentIndex;
  status: "safe" | "out";
  /** 打者自身の安打によって到達した区間か */
  isBatterHit: boolean;
  /** 安打時の塁打数 (1=単打, 2=二塁打, 3=三塁打, 4=本塁打, 0=安打以外) */
  hitBases: 0 | 1 | 2 | 3 | 4;
  method: AdvanceMethodCode;
  /** 後続打者の打撃・四球等で進塁した場合の打順番号（例: 3番打者で進塁 → 3 → "(3)" 表示） */
  drivingBatterOrder?: number;
  /** 投球間進塁（盗塁・暴投・捕逸・ボーク等）か */
  isPrePlay: boolean;
  /** アウト時のフォースプレイ（封殺）判定 */
  isForceOut?: boolean;
  /** 送球・守備番号チェーン（例: "6-4", "5", "1-3", "6"） */
  throwChain?: string;
  /** ダブルスチール（重盗）か */
  isDoubleSteal?: boolean;
  /** 特殊表記の上書きラベル（早見表の "(ー)" 等） */
  customLabelOverride?: string;
  /** 早稲田式（塁線波線）モード用の代走選手名 */
  pinchRunnerName?: string;
}

export interface CompiledCellSubMark {
  name: string;
  subType: "PH" | "PR" | "TR" | "DEF";
}

export interface CompiledCellBasePresence {
  "1B": boolean;
  "2B": boolean;
  "3B": boolean;
}

export interface CompiledCellSituation {
  outsBefore: number;
  outsAfter: number;
  basesBefore: CompiledCellBasePresence;
  basesAfterPlay: CompiledCellBasePresence;
  isInningOver: boolean;
  runsInPlay: number;
}

export interface CompiledScorebookCell {
  cellKey: string;
  inning: number;
  columnIndex: number;
  battingOrder: number;
  atBat: ScorebookV2AtBat | null;
  isTiebreakRunnerOnly: boolean;
  tiebreakStartBase?: OccupiedBaseKey;
  /** 打席前後のアウト数・塁上走者・得点状況スナップショット（タイムライン等で使用） */
  situation?: CompiledCellSituation;
  /** セグメント 1(HP->1B), 2(1B->2B), 3(2B->3B), 4(3B->HP) */
  segments: Record<BaseSegmentIndex, CompiledDiamondSegment | null>;
  /** このマス（打者または走者）が記録したアウト番号 (1〜3) */
  outNumber: 1 | 2 | 3 | null;
  /** 本塁生還（得点）したか */
  runScored: boolean;
  /** 非自責点（失策・捕逸・2死後失策絡み等による得点）か */
  isUnearnedRun?: boolean;
  /** イニング終了時点で塁上に残った残塁走者か */
  isResidual: boolean;
  residualBase?: OccupiedBaseKey;
  /** このイニングの最終打席（イニング終了斜線「／」を引くマス）か */
  isInningEndCell: boolean;
  /** この打席から相手投手が交代したか（マス上辺に投手交代赤波線を引く） */
  hasPitcherChangeBefore: boolean;
  newPitcherName?: string;
  newPitcherUniformNumber?: string;
  /** 打席途中での投手交代位置（0始まりの投球インデックス、指定時は階段状赤波線を描画） */
  pitcherChangeAtPitchIndex?: number;
  /** この打席中に盗塁が発生した投球インデックス配列（BSOの○′表記用） */
  stealPitchIndices?: number[];
  /** 代打(PH)：このマスの左境界に赤縦波線＋縦書き選手名を描画 */
  leftOutsideSub?: CompiledCellSubMark;
  /** 代走(PR/TR)・守備交代(DEF)：このマスの右内に赤縦波線＋縦書き選手名を描画 */
  rightInsideSub?: CompiledCellSubMark;
}

export interface CompiledDoublePlayLink {
  id: string;
  inning: number;
  outCellKeys: string[];
  batterCellKey: string;
  isTriplePlay: boolean;
}

export interface CompiledGridColumn {
  colKey: string;
  inning: number;
  columnIndex: number;
  totalColumnsInInning: number;
}

export interface CompiledInningSummary {
  inning: number;
  runs: number;
  hits: number;
  errors: number;
  walksHbp: number;
  leftOnBase: number;
  plateAppearances: number;
  hasData: boolean;
}

export interface CompiledBatterRowStats {
  battingOrder: number;
  slot: ScorebookBatterSlot;
  plateAppearances: number;
  atBats: number;
  hits: number;
  rbi: number;
  runs: number;
  walksHbp: number;
  strikeouts: number;
  stolenBases: number;
}

export interface CompiledPitcherRowStats {
  order: number;
  name: string;
  uniformNumber: string;
  fromInning: number;
  toInning: number;
  outsRecorded: number;
  ipDisplay: string;
  battersFaced: number;
  pitchesCount: number;
  hitsAllowed: number;
  homeRunsAllowed: number;
  strikeouts: number;
  walksHbp: number;
  runsAllowed: number;
}

export interface CompiledScorebookSheetModel {
  isTop: boolean;
  battingTeamName: string;
  fieldingTeamName: string;
  columns: CompiledGridColumn[];
  batterRows: CompiledBatterRowStats[];
  cellsByKey: Record<string, CompiledScorebookCell>;
  doublePlayLinks: CompiledDoublePlayLink[];
  inningSummaries: CompiledInningSummary[];
  totals: {
    plateAppearances: number;
    atBats: number;
    hits: number;
    rbi: number;
    runs: number;
    walksHbp: number;
    strikeouts: number;
    stolenBases: number;
    leftOnBase: number;
    errors: number;
  };
  pitcherRows: CompiledPitcherRowStats[];
}

function baseToLevel(base: OccupiedBaseKey | "HP" | "BAT"): 0 | 1 | 2 | 3 | 4 {
  if (base === "1B") return 1;
  if (base === "2B") return 2;
  if (base === "3B") return 3;
  if (base === "HP") return 4;
  return 0;
}

function getHitBasesForResult(rc: CanonicalAtBatResult): 0 | 1 | 2 | 3 | 4 {
  if (rc === "single") return 1;
  if (rc === "double") return 2;
  if (rc === "triple") return 3;
  if (rc === "home_run") return 4;
  return 0;
}

function isOfficialAtBatResult(rc: CanonicalAtBatResult): boolean {
  return (
    rc !== "walk" &&
    rc !== "intentional_walk" &&
    rc !== "hit_by_pitch" &&
    rc !== "interference" &&
    rc !== "sac_bunt" &&
    rc !== "sac_fly" &&
    rc !== "other"
  );
}

function isWalkOrHbpResult(rc: CanonicalAtBatResult): boolean {
  return (
    rc === "walk" ||
    rc === "intentional_walk" ||
    rc === "hit_by_pitch"
  );
}

function isStrikeoutResult(rc: CanonicalAtBatResult): boolean {
  return (
    rc === "strikeout" ||
    rc === "dropped_third_strike_out" ||
    rc === "dropped_third_strike"
  );
}

function isIntrinsicBatterOutCode(rc: CanonicalAtBatResult): boolean {
  return (
    rc === "groundout" ||
    rc === "flyout" ||
    rc === "infield_fly" ||
    rc === "strikeout" ||
    rc === "dropped_third_strike_out" ||
    rc === "sac_bunt" ||
    rc === "sac_fly" ||
    rc === "double_play" ||
    rc === "triple_play" ||
    rc === "interference_out"
  );
}

function formatOutsToIp(outs: number): string {
  const full = Math.floor(outs / 3);
  const rem = outs % 3;
  return rem === 0 ? `${full}.0` : `${full}.${rem}`;
}

function makeEmptyCell(
  inning: number,
  columnIndex: number,
  battingOrder: number,
  atBat: ScorebookV2AtBat | null
): CompiledScorebookCell {
  return {
    cellKey: `${inning}-${columnIndex}-${battingOrder}`,
    inning,
    columnIndex,
    battingOrder,
    atBat,
    isTiebreakRunnerOnly: false,
    segments: { 1: null, 2: null, 3: null, 4: null },
    outNumber: null,
    runScored: false,
    isResidual: false,
    isInningEndCell: false,
    hasPitcherChangeBefore: false,
  };
}

function applyRunnerStepSegments(
  cell: CompiledScorebookCell,
  fromBase: OccupiedBaseKey | "BAT",
  toBase: OccupiedBaseKey | "HP",
  isOut: boolean,
  options: {
    isBatterHit: boolean;
    hitBases: 0 | 1 | 2 | 3 | 4;
    method: AdvanceMethodCode;
    drivingBatterOrder?: number;
    isPrePlay: boolean;
    isForceOut?: boolean;
    throwChain?: string;
    isDoubleSteal?: boolean;
  }
): void {
  const startLv = baseToLevel(fromBase);
  const endLv = baseToLevel(toBase);

  // 牽制死（1B→1B 等）やフライ・ライナー飛び出し帰塁アウト（1B→1B 等）は次区間（1Bなら右上seg2）にアウト表記を記録
  if (
    isOut &&
    fromBase !== "BAT" &&
    endLv === startLv &&
    startLv >= 1 &&
    startLv <= 3
  ) {
    const segIdx = (startLv + 1) as BaseSegmentIndex;
    cell.segments[segIdx] = {
      segment: segIdx,
      status: "out",
      isBatterHit: false,
      hitBases: 0,
      method: options.method,
      drivingBatterOrder: options.drivingBatterOrder,
      isPrePlay: options.isPrePlay,
      isForceOut: false,
      throwChain: options.throwChain,
    };
    return;
  }

  if (endLv <= startLv) return;

  const suppressBatterSamePlayDup =
    fromBase === "BAT" &&
    !isOut &&
    (options.method === "error" || options.method === "fc");

  for (let lv = startLv + 1; lv <= endLv; lv++) {
    const segIdx = lv as BaseSegmentIndex;
    const isFinalStep = lv === endLv;
    cell.segments[segIdx] = {
      segment: segIdx,
      status: isFinalStep && isOut ? "out" : "safe",
      isBatterHit: options.isBatterHit,
      hitBases: options.isBatterHit ? options.hitBases : 0,
      method: options.method,
      drivingBatterOrder: isFinalStep ? options.drivingBatterOrder : undefined,
      isPrePlay: options.isPrePlay,
      isForceOut: isFinalStep ? options.isForceOut : undefined,
      throwChain: isFinalStep ? options.throwChain : undefined,
      isDoubleSteal: isFinalStep ? options.isDoubleSteal : undefined,
      customLabelOverride:
        !isFinalStep || suppressBatterSamePlayDup ? "" : undefined,
    };
  }
}

function inferRunnerOutThrowChain(
  ab: ScorebookV2AtBat,
  targetLv: BaseSegmentIndex,
  isForceOut: boolean
): string {
  const raw = (ab.battedDirection || "").trim();
  const digits = raw.match(/[1-9]/g) || [];
  if (digits.length === 0) return "";
  if (digits.length === 1) return digits[0]!;

  if (isForceOut) {
    if (targetLv === 3 && digits[0] === "5") {
      return "5";
    }
    if (targetLv === 2 && (digits[0] === "4" || digits[0] === "6") && digits[1] === "3") {
      return digits[0]!;
    }
    if (digits.length >= 3) {
      return `${digits[0]}-${digits[1]}`;
    }
  }
  return digits.slice(0, 2).join("-");
}

function isOriginCellReachedByErrorOrUncharged(
  originCell: CompiledScorebookCell | undefined
): boolean {
  const rc = originCell?.atBat?.resultCode;
  return (
    rc === "error" ||
    rc === "dropped_third_strike" ||
    rc === "interference"
  );
}

/**
 * 保存済みのシート骨格＋打席配列から、早稲田・成美堂式デジタルスコアブックの全マス座標・進塁線・集計値を決定論的にコンパイルする
 */
export function compileScorebookSheetModel(
  structure: ScorebookSheetStructure,
  atBats: ScorebookV2AtBat[],
  matchMeta: ScorebookMatchHeaderMeta
): CompiledScorebookSheetModel {
  const isTop = structure.isTop;
  const battingTeamName = isTop
    ? matchMeta.topTeamName
    : matchMeta.bottomTeamName;
  const fieldingTeamName = isTop
    ? matchMeta.bottomTeamName
    : matchMeta.topTeamName;

  // 1. 打順行（最低9人、全員打ち等で10人以上なら拡張）を構築
  const maxOrder = Math.max(
    9,
    ...structure.batters.map((b) => b.battingOrder),
    ...atBats.map((a) => a.battingOrder || 1)
  );

  const slotMap = new Map<number, ScorebookBatterSlot>();
  for (const slot of structure.batters) {
    slotMap.set(slot.battingOrder, slot);
  }

  const normalizedSlots: ScorebookBatterSlot[] = [];
  for (let order = 1; order <= maxOrder; order++) {
    const existing = slotMap.get(order);
    if (existing) {
      normalizedSlots.push(existing);
    } else {
      const sampleAb = atBats.find((a) => a.battingOrder === order);
      normalizedSlots.push({
        battingOrder: order,
        name: sampleAb?.batterName || "",
        uniformNumber: "",
        position: "",
        playerId: sampleAb?.batterPlayerId ?? null,
        substitutions: [],
      });
    }
  }

  // 2. イニングごとに打席を割り当て、サブ列（打者一巡時の2列目・3列目）を衝突ゼロで確定
  const maxInning = Math.max(
    7,
    matchMeta.scheduledInnings || 7,
    ...structure.innings.map((m) => m.inning),
    ...atBats.map((a) => a.inning || 1)
  );

  const atBatsByInning = new Map<number, ScorebookV2AtBat[]>();
  for (const ab of atBats) {
    const inn = Math.max(1, ab.inning || 1);
    const list = atBatsByInning.get(inn) || [];
    list.push(ab);
    atBatsByInning.set(inn, list);
  }

  const assignedColByAtBatId = new Map<string, number>();
  const columnCountByInning = new Map<number, number>();

  for (let inn = 1; inn <= maxInning; inn++) {
    const meta = structure.innings.find((m) => m.inning === inn);
    const innAbs = atBatsByInning.get(inn) || [];
    let maxCol = Math.max(1, meta?.columnCount ?? 1);
    const usedInInning = new Set<string>();
    let runningMinCol = 1;

    for (const ab of innAbs) {
      let col = Math.max(runningMinCol, ab.columnIndex || 1);
      while (usedInInning.has(`${col}-${ab.battingOrder}`)) {
        col += 1;
      }
      runningMinCol = col;
      usedInInning.add(`${col}-${ab.battingOrder}`);
      assignedColByAtBatId.set(ab.id, col);
      if (col > maxCol) maxCol = col;
    }

    columnCountByInning.set(inn, maxCol);
  }

  const columns: CompiledGridColumn[] = [];
  for (let inn = 1; inn <= maxInning; inn++) {
    const totalCols = columnCountByInning.get(inn) || 1;
    for (let cIdx = 1; cIdx <= totalCols; cIdx++) {
      columns.push({
        colKey: `${inn}-${cIdx}`,
        inning: inn,
        columnIndex: cIdx,
        totalColumnsInInning: totalCols,
      });
    }
  }

  // 3. 走者スナップショットを一括計算し、各打席・先行走者マスの進塁セグメント・得点・アウト・残塁を紐づけ
  const runnerSnapshots = simulateSheetRunners(atBats, structure);
  const cellsByKey: Record<string, CompiledScorebookCell> = {};

  // 打順別集計アキュムレータ
  const batterStatsMap = new Map<number, CompiledBatterRowStats>();
  for (const slot of normalizedSlots) {
    batterStatsMap.set(slot.battingOrder, {
      battingOrder: slot.battingOrder,
      slot,
      plateAppearances: 0,
      atBats: 0,
      hits: 0,
      rbi: 0,
      runs: 0,
      walksHbp: 0,
      strikeouts: 0,
      stolenBases: 0,
    });
  }

  const addRunToOrder = (order: number) => {
    const row = batterStatsMap.get(order);
    if (row) row.runs += 1;
  };
  const addStealToOrder = (order: number) => {
    const row = batterStatsMap.get(order);
    if (row) row.stolenBases += 1;
  };

  let prevPitcherKey: string | null = null;
  const doublePlayLinks: CompiledDoublePlayLink[] = [];
  const normalizeBatterIdentity = (
    playerId: string | null | undefined,
    name: string | null | undefined
  ): string | null => {
    if (playerId && playerId.trim()) return `id:${playerId.trim()}`;
    const clean = (name || "").replace(/\s+/g, "");
    return clean ? `name:${clean}` : null;
  };
  const prOriginCellByAtBatAndOrder = new Map<string, string>();
  const prOriginCellByInningAndOrder = new Map<string, string>();
  const explicitPinchRunnerRecords: Array<{
    cellKey: string;
    battingOrder: number;
    name: string;
    playerId: string | null;
    subType: "PR" | "TR";
  }> = [];
  const inningSummaries: CompiledInningSummary[] = [];

  for (let inn = 1; inn <= maxInning; inn++) {
    const innAbs = atBatsByInning.get(inn) || [];
    const innMeta = structure.innings.find((m) => m.inning === inn);

    if (innAbs.length === 0) {
      const fallbackScore = isTop
        ? matchMeta.topInningScores[inn - 1]
        : matchMeta.bottomInningScores[inn - 1];
      inningSummaries.push({
        inning: inn,
        runs: innMeta?.runs ?? (typeof fallbackScore === "number" && fallbackScore >= 0 ? fallbackScore : 0),
        hits: innMeta?.hits ?? 0,
        errors: 0,
        walksHbp: 0,
        leftOnBase: 0,
        plateAppearances: 0,
        hasData: Boolean(innMeta) || (typeof fallbackScore === "number" && fallbackScore >= 0),
      });
      continue;
    }

    let originByBase: Record<OccupiedBaseKey, string | null> = {
      "1B": null,
      "2B": null,
      "3B": null,
    };
    let outsTracker = 0;
    let virtualErrorSavedOuts = 0;
    let innRuns = 0;
    let innHits = 0;
    let innErrors = 0;
    let innWalksHbp = 0;
    let innPa = 0;

    // このイニングの1列目で実際に打席に入る打順集合（タイブレーク走者専用マスの安全判定用）
    const col1BatterOrders = new Set<number>(
      innAbs
        .filter((a) => (assignedColByAtBatId.get(a.id) || 1) === 1)
        .map((a) => a.battingOrder)
    );

    for (let idx = 0; idx < innAbs.length; idx++) {
      const ab = innAbs[idx];
      const col = assignedColByAtBatId.get(ab.id) || 1;
      const cellKey = `${inn}-${col}-${ab.battingOrder}`;
      const cell = makeEmptyCell(inn, col, ab.battingOrder, ab);
      cellsByKey[cellKey] = cell;

      // 投手交代検出（背番号も structure.pitchers から照合）
      const curPitcherKey = (
        ab.pitcherPlayerId ||
        ab.pitcherName ||
        ""
      ).trim();
      if (curPitcherKey) {
        if (prevPitcherKey !== null && prevPitcherKey !== curPitcherKey) {
          cell.hasPitcherChangeBefore = true;
          const matchedPitcher = structure.pitchers.find(
            (st) =>
              (ab.pitcherPlayerId &&
                st.playerId &&
                st.playerId === ab.pitcherPlayerId) ||
              (ab.pitcherName &&
                st.name.replace(/\s+/g, "") ===
                  ab.pitcherName.replace(/\s+/g, ""))
          );
          const rawAbPitcherName = (ab.pitcherName || "").trim();
          const hasRealAbName =
            Boolean(rawAbPitcherName) &&
            rawAbPitcherName !== "相手投手" &&
            rawAbPitcherName !== "投手";
          cell.newPitcherName = hasRealAbName
            ? rawAbPitcherName
            : matchedPitcher?.name || rawAbPitcherName || undefined;
          if (matchedPitcher?.uniformNumber) {
            cell.newPitcherUniformNumber = matchedPitcher.uniformNumber;
          }
        }
        prevPitcherKey = curPitcherKey;
      }

      // 打者個人成績の加算（走塁死による打席途中断 resultCode==="other" は打席・打数に含めない）
      const bRow = batterStatsMap.get(ab.battingOrder);
      if (ab.resultCode !== "other") {
        innPa += 1;
        if (bRow) {
          bRow.plateAppearances += 1;
          if (isOfficialAtBatResult(ab.resultCode)) {
            bRow.atBats += 1;
          }
          const hb = getHitBasesForResult(ab.resultCode);
          if (hb > 0) {
            bRow.hits += 1;
            innHits += 1;
          }
          bRow.rbi += Math.max(0, ab.rbi || 0);
          if (isWalkOrHbpResult(ab.resultCode)) {
            bRow.walksHbp += 1;
            innWalksHbp += 1;
          }
          if (isStrikeoutResult(ab.resultCode)) {
            bRow.strikeouts += 1;
          }
        }
      }
      if (ab.resultCode === "error") {
        innErrors += 1;
        virtualErrorSavedOuts += 1;
      } else if (ab.resultCode === "dropped_third_strike") {
        virtualErrorSavedOuts += 1;
      }

      const snap = runnerSnapshots.get(ab.id);
      if (!snap) {
        continue;
      }

      const innRunsBeforePlay = innRuns;
      outsTracker = snap.outsBefore;

      // タイブレーク等で打席開始前に突如ベースに出現した先行走者の起点マスを確保
      for (const bKey of ["3B", "2B", "1B"] as const) {
        const beforeRunner = snap.basesBefore[bKey];
        if (beforeRunner && !originByBase[bKey]) {
          const rOrder = beforeRunner.battingOrder;
          if (rOrder >= 1 && rOrder <= maxOrder && !col1BatterOrders.has(rOrder)) {
            const tbKey = `${inn}-1-${rOrder}`;
            if (!cellsByKey[tbKey]) {
              const tbCell = makeEmptyCell(inn, 1, rOrder, null);
              tbCell.isTiebreakRunnerOnly = true;
              tbCell.tiebreakStartBase = bKey;
              tbCell.situation = {
                outsBefore: 0,
                outsAfter: 0,
                basesBefore: { "1B": false, "2B": false, "3B": false },
                basesAfterPlay: {
                  "1B": Boolean(snap.basesBefore["1B"]),
                  "2B": Boolean(snap.basesBefore["2B"]),
                  "3B": Boolean(snap.basesBefore["3B"]),
                },
                isInningOver: false,
                runsInPlay: 0,
              };
              applyRunnerStepSegments(tbCell, "BAT", bKey, false, {
                isBatterHit: false,
                hitBases: 0,
                method: "tiebreak",
                isPrePlay: true,
              });
              cellsByKey[tbKey] = tbCell;
            }
            originByBase[bKey] = tbKey;
          }
        }
      }

      // 代走・臨時代走の起点マス（出塁したマス）を記録
      if (Array.isArray(ab.pinchRunners)) {
        for (const prEntry of ab.pinchRunners) {
          const originKey = originByBase[prEntry.base];
          const resolvedOrder =
            prEntry.battingOrder > 0
              ? prEntry.battingOrder
              : originKey
              ? cellsByKey[originKey]?.battingOrder || 0
              : 0;
          const resolvedKey =
            originKey ||
            (resolvedOrder > 0 ? `${inn}-${col}-${resolvedOrder}` : null);
          if (resolvedKey && resolvedOrder > 0) {
            prOriginCellByAtBatAndOrder.set(
              `${ab.id}:${resolvedOrder}`,
              resolvedKey
            );
            prOriginCellByInningAndOrder.set(
              `${inn}:${resolvedOrder}`,
              resolvedKey
            );
            if (prEntry.name.trim()) {
              explicitPinchRunnerRecords.push({
                cellKey: resolvedKey,
                battingOrder: resolvedOrder,
                name: prEntry.name.trim(),
                playerId: prEntry.playerId ?? null,
                subType: prEntry.subType,
              });
              const prTargetCell = cellsByKey[resolvedKey];
              const prLv = baseToLevel(prEntry.base);
              if (prTargetCell && prLv >= 1 && prLv <= 3) {
                const seg = prTargetCell.segments[prLv as BaseSegmentIndex];
                if (seg) {
                  seg.pinchRunnerName = prEntry.name.trim();
                }
              }
            }
          }
        }
      }

      const nextOutOrdinal = (): 1 | 2 | 3 => {
        outsTracker = Math.min(3, outsTracker + 1);
        return outsTracker as 1 | 2 | 3;
      };

      const playOutCellKeys: string[] = [];
      const recordPlayOutCell = (outKey: string) => {
        if (!playOutCellKeys.includes(outKey)) {
          playOutCellKeys.push(outKey);
        }
      };

      // 同一打席中の盗塁数（2人以上ならダブルスチール DS）
      let stealRunnersInAtBat = 0;
      for (const pr of snap.precedingRunners) {
        if (pr.prePlayMoves.some((pm) => !pm.isOut && pm.method === "steal")) {
          stealRunnersInAtBat += 1;
        }
      }
      if (stealRunnersInAtBat > 0) {
        const visiblePitches = ab.pitches.filter(
          (p) => p !== "in_play" && p !== "hit" && p !== "hbp"
        );
        if (visiblePitches.length > 0) {
          cell.stealPitchIndices = [0];
        }
      }

      // A) 投球間（盗塁・暴投・捕逸・牽制死・盗塁死）の反映
      for (const pr of snap.precedingRunners) {
        const originKey = originByBase[pr.startBase];
        const originCell = originKey ? cellsByKey[originKey] : undefined;

        for (const pm of pr.prePlayMoves) {
          if (!pm.isOut && pm.method === "steal" && pr.runner.battingOrder > 0) {
            addStealToOrder(pr.runner.battingOrder);
          }
          if (pm.method === "error" || pm.method === "pickoff_error") {
            innErrors += 1;
          }
          if (originCell && pm.from !== "BAT") {
            const defaultPickoffChain =
              pm.isOut && pm.method === "pickoff_out"
                ? pm.from === "1B"
                  ? "1-3"
                  : pm.from === "2B"
                  ? "1-6"
                  : pm.from === "3B"
                  ? "1-5"
                  : undefined
                : undefined;
            applyRunnerStepSegments(originCell, pm.from, pm.to, pm.isOut, {
              isBatterHit: false,
              hitBases: 0,
              method: pm.method,
              isPrePlay: true,
              isForceOut: false,
              throwChain: defaultPickoffChain,
              isDoubleSteal:
                !pm.isOut && pm.method === "steal" && stealRunnersInAtBat >= 2,
            });
          }
          if (!pm.isOut && pm.to === "HP") {
            innRuns += 1;
            if (pr.runner.battingOrder > 0) addRunToOrder(pr.runner.battingOrder);
            if (originCell) {
              originCell.runScored = true;
              if (
                pm.method === "error" ||
                pm.method === "pb" ||
                pm.method === "pickoff_error" ||
                isOriginCellReachedByErrorOrUncharged(originCell) ||
                outsTracker + virtualErrorSavedOuts >= 3
              ) {
                originCell.isUnearnedRun = true;
              }
            }
          }
        }

        if (pr.isOutPrePlay) {
          const ord = nextOutOrdinal();
          if (originCell) {
            originCell.outNumber = ord;
            if (
              ab.resultCode === "strikeout" ||
              ab.resultCode === "dropped_third_strike_out"
            ) {
              recordPlayOutCell(originCell.cellKey);
            }
          }
        }
      }

      // B) インプレーアウト順序の決定（フライ・ライナー併殺等は打者先アウト、ゴロ封殺・併殺は先行走者先アウト）
      const isAerialDpOrTp =
        (ab.resultCode === "double_play" || ab.resultCode === "triple_play") &&
        (/飛|フライ|直|ライナー|[⌒︵]/.test(ab.resultLabel || "") ||
          /^[1-9][FL](?:-[1-9])?$/i.test((ab.battedDirection || "").trim()));

      const batterFirstOut =
        ab.resultCode === "flyout" ||
        ab.resultCode === "sac_fly" ||
        ab.resultCode === "infield_fly" ||
        ab.resultCode === "strikeout" ||
        ab.resultCode === "dropped_third_strike_out" ||
        isAerialDpOrTp;

      const isBatterIntrinsicOut =
        isIntrinsicBatterOutCode(ab.resultCode) &&
        snap.batterSummary.initialBase === null;

      const assignBatterOutIfApplicable = () => {
        if (isBatterIntrinsicOut || snap.batterSummary.isOutOnBases) {
          cell.outNumber = nextOutOrdinal();
          recordPlayOutCell(cell.cellKey);
        }
      };

      const assignInPlayPrecedingRunners = () => {
        for (const pr of snap.precedingRunners) {
          if (pr.isOutPrePlay) continue;
          const originKey = originByBase[pr.startBase];
          const originCell = originKey ? cellsByBaseLookup(cellsByKey, originKey) : undefined;
          const inPlayFrom = pr.baseAtInPlay;
          if (!inPlayFrom || inPlayFrom === "HP") continue;

          if (pr.isOut) {
            if (originCell) {
              const endLv = baseToLevel(pr.finalBase) as BaseSegmentIndex;
              const isNonFlyPlay =
                ab.resultCode !== "flyout" &&
                ab.resultCode !== "sac_fly" &&
                ab.resultCode !== "infield_fly" &&
                ab.resultCode !== "strikeout" &&
                !isAerialDpOrTp;
              const isRunnerForced =
                isNonFlyPlay &&
                ((inPlayFrom === "1B" && pr.finalBase === "2B") ||
                  (inPlayFrom === "2B" &&
                    pr.finalBase === "3B" &&
                    Boolean(snap.basesBefore["1B"])) ||
                  (inPlayFrom === "3B" &&
                    pr.finalBase === "HP" &&
                    Boolean(snap.basesBefore["1B"]) &&
                    Boolean(snap.basesBefore["2B"])));
              const runnerThrowChain = inferRunnerOutThrowChain(
                ab,
                endLv,
                isRunnerForced
              );
              applyRunnerStepSegments(
                originCell,
                inPlayFrom,
                pr.finalBase,
                true,
                {
                  isBatterHit: false,
                  hitBases: 0,
                  method: pr.effectiveMethod,
                  drivingBatterOrder: ab.battingOrder,
                  isPrePlay: false,
                  isForceOut: isRunnerForced,
                  throwChain: runnerThrowChain || undefined,
                }
              );
              originCell.outNumber = nextOutOrdinal();
              recordPlayOutCell(originCell.cellKey);
            } else {
              nextOutOrdinal();
            }
          } else if (baseToLevel(pr.finalBase) > baseToLevel(inPlayFrom)) {
            if (pr.effectiveMethod === "error" && ab.resultCode !== "error") {
              innErrors += 1;
            }
            if (originCell) {
              applyRunnerStepSegments(
                originCell,
                inPlayFrom,
                pr.finalBase,
                false,
                {
                  isBatterHit: false,
                  hitBases: 0,
                  method: pr.effectiveMethod,
                  drivingBatterOrder: isPrePlayAdvanceMethod(pr.effectiveMethod)
                    ? undefined
                    : ab.battingOrder,
                  isPrePlay: isPrePlayAdvanceMethod(pr.effectiveMethod),
                }
              );
            }
            if (pr.finalBase === "HP") {
              innRuns += 1;
              if (pr.runner.battingOrder > 0) {
                addRunToOrder(pr.runner.battingOrder);
              }
              if (originCell) {
                originCell.runScored = true;
                if (
                  pr.effectiveMethod === "error" ||
                  pr.effectiveMethod === "pb" ||
                  isOriginCellReachedByErrorOrUncharged(originCell) ||
                  outsTracker + virtualErrorSavedOuts >= 3
                ) {
                  originCell.isUnearnedRun = true;
                }
              }
            }
          }
        }
      };

      if (batterFirstOut) {
        assignBatterOutIfApplicable();
        assignInPlayPrecedingRunners();
      } else {
        assignInPlayPrecedingRunners();
        assignBatterOutIfApplicable();
      }

      if (
        playOutCellKeys.length >= 2 ||
        ab.resultCode === "double_play" ||
        ab.resultCode === "triple_play" ||
        ab.outsInPlay >= 2
      ) {
        const resolvedOutCellKeys = [...playOutCellKeys];
        if (
          resolvedOutCellKeys.length === 1 &&
          (ab.resultCode === "double_play" || ab.outsInPlay >= 2)
        ) {
          const fallbackRunnerKey =
            originByBase["1B"] ?? originByBase["2B"] ?? originByBase["3B"];
          if (fallbackRunnerKey && !resolvedOutCellKeys.includes(fallbackRunnerKey)) {
            resolvedOutCellKeys.unshift(fallbackRunnerKey);
          }
        }
        doublePlayLinks.push({
          id: `dp-${ab.id}`,
          inning: inn,
          outCellKeys:
            resolvedOutCellKeys.length >= 2
              ? resolvedOutCellKeys
              : [cell.cellKey],
          batterCellKey: cell.cellKey,
          isTriplePlay:
            ab.resultCode === "triple_play" ||
            ab.outsInPlay >= 3 ||
            resolvedOutCellKeys.length >= 3,
        });
      }

      // C) 打者自身のベース進塁セグメント反映
      const initBase = snap.batterSummary.initialBase;
      const finalBase = snap.batterSummary.finalBase;
      const hitBases = getHitBasesForResult(ab.resultCode);

      if (initBase) {
        const isDirectOutWithoutSafeInit =
          snap.batterSummary.isOutOnBases && finalBase === initBase;
        applyRunnerStepSegments(
          cell,
          "BAT",
          initBase,
          isDirectOutWithoutSafeInit,
          {
            isBatterHit: hitBases > 0,
            hitBases,
            method:
              hitBases > 0
                ? "hit"
                : snap.batterSummary.effectiveMethod,
            isPrePlay: false,
          }
        );

        if (
          finalBase &&
          initBase !== "HP" &&
          baseToLevel(finalBase) > baseToLevel(initBase)
        ) {
          applyRunnerStepSegments(
            cell,
            initBase,
            finalBase,
            snap.batterSummary.isOutOnBases,
            {
              isBatterHit: false,
              hitBases: 0,
              method: snap.batterSummary.effectiveMethod,
              isPrePlay: false,
            }
          );
        }

        if (!snap.batterSummary.isOutOnBases && finalBase === "HP") {
          cell.runScored = true;
          if (
            isOriginCellReachedByErrorOrUncharged(cell) ||
            outsTracker + virtualErrorSavedOuts >= 3
          ) {
            cell.isUnearnedRun = true;
          }
          innRuns += 1;
          addRunToOrder(ab.battingOrder);
        }
      }

      // D) 次打席に向けた塁上起点セルの更新
      cell.situation = {
        outsBefore: snap.outsBefore,
        outsAfter: snap.outsAfter,
        basesBefore: {
          "1B": Boolean(snap.basesBefore["1B"]),
          "2B": Boolean(snap.basesBefore["2B"]),
          "3B": Boolean(snap.basesBefore["3B"]),
        },
        basesAfterPlay: {
          "1B": Boolean(snap.basesAfterPlay["1B"]),
          "2B": Boolean(snap.basesAfterPlay["2B"]),
          "3B": Boolean(snap.basesAfterPlay["3B"]),
        },
        isInningOver: snap.isInningOver,
        runsInPlay: Math.max(ab.runsInPlay || 0, innRuns - innRunsBeforePlay),
      };

      const nextOrigins: Record<OccupiedBaseKey, string | null> = {
        "1B": null,
        "2B": null,
        "3B": null,
      };
      for (const pr of snap.precedingRunners) {
        if (
          !pr.isOut &&
          (pr.finalBase === "1B" ||
            pr.finalBase === "2B" ||
            pr.finalBase === "3B")
        ) {
          nextOrigins[pr.finalBase] = originByBase[pr.startBase];
        }
      }
      if (
        !snap.batterSummary.isOutOnBases &&
        (finalBase === "1B" || finalBase === "2B" || finalBase === "3B")
      ) {
        nextOrigins[finalBase] = cellKey;
      }

      const isLastPaOfInning = idx === innAbs.length - 1;
      if (snap.isInningOver || isLastPaOfInning) {
        if (snap.isInningOver) {
          cell.isInningEndCell = true;
        }
        // 残塁走者マーク (ℓ) 付与
        let lobCount = 0;
        for (const bKey of ["3B", "2B", "1B"] as const) {
          const strandedKey = nextOrigins[bKey];
          if (strandedKey && cellsByKey[strandedKey]) {
            cellsByKey[strandedKey].isResidual = true;
            cellsByKey[strandedKey].residualBase = bKey;
            lobCount += 1;
          } else if (snap.basesAfterPlay[bKey]) {
            lobCount += 1;
          }
        }

        if (isLastPaOfInning) {
          const resolvedRuns =
            innMeta && typeof innMeta.runs === "number"
              ? Math.max(innRuns, innMeta.runs)
              : innRuns;
          inningSummaries.push({
            inning: inn,
            runs: resolvedRuns,
            hits: innHits,
            errors: innErrors,
            walksHbp: innWalksHbp,
            leftOnBase: lobCount,
            plateAppearances: innPa,
            hasData: true,
          });
        }

        originByBase = { "1B": null, "2B": null, "3B": null };
      } else {
        originByBase = nextOrigins;
      }
    }
  }

  // 3B. 代打(マス左外)・代走/守備交代(マス右内)の配置解決
  const ensureGridCell = (
    inn: number,
    colIdx: number,
    ord: number
  ): CompiledScorebookCell => {
    const k = `${inn}-${colIdx}-${ord}`;
    if (!cellsByKey[k]) {
      cellsByKey[k] = makeEmptyCell(inn, colIdx, ord, null);
    }
    return cellsByKey[k];
  };

  const findColumnArrayIndex = (inn: number, colIdx: number): number =>
    columns.findIndex((c) => c.inning === inn && c.columnIndex === colIdx);

  const findFirstColOfInning = (inn: number, preferredCol = 1): CompiledGridColumn | undefined => {
    const exact = columns.find(
      (c) => c.inning === inn && c.columnIndex === preferredCol
    );
    if (exact) return exact;
    return columns.find((c) => c.inning === inn);
  };

  const findLastColOfInning = (inn: number): CompiledGridColumn | undefined => {
    for (let i = columns.length - 1; i >= 0; i--) {
      if (columns[i]!.inning === inn) return columns[i];
    }
    return undefined;
  };

  const handledIdentitiesByOrder = new Map<number, Set<string>>();

  for (const slot of normalizedSlots) {
    const order = slot.battingOrder;
    let activeIdentity = normalizeBatterIdentity(slot.playerId, slot.name);
    const seen = new Set<string>();
    if (activeIdentity) seen.add(activeIdentity);
    handledIdentitiesByOrder.set(order, seen);

    for (const sub of slot.substitutions) {
      const subName = sub.name.trim();
      const subIdentity = normalizeBatterIdentity(sub.playerId, subName);
      const isSamePlayer =
        (subIdentity !== null &&
          activeIdentity !== null &&
          subIdentity === activeIdentity) ||
        (!subName && sub.subType === "DEF");
      if (isSamePlayer) {
        continue;
      }
      if (!subName) {
        continue;
      }

      if (subIdentity && sub.subType !== "TR") {
        activeIdentity = subIdentity;
        seen.add(subIdentity);
      }

      const enteredInn = Math.min(maxInning, Math.max(1, sub.inningEntered || 1));

      if (sub.subType === "PH") {
        // 代打：該当打席マスの左境界に赤波線＋縦書き選手名（実際の打席が存在するマスに紐づける）
        const explicitAb = sub.enteredAtBatId
          ? atBats.find(
              (a) => a.id === sub.enteredAtBatId && a.battingOrder === order
            )
          : undefined;
        const inningAb =
          explicitAb ||
          atBats.find(
            (a) =>
              a.battingOrder === order &&
              a.inning === enteredInn &&
              (sub.enteredColumnIndex
                ? (assignedColByAtBatId.get(a.id) || 1) === sub.enteredColumnIndex
                : true)
          ) ||
          atBats.find(
            (a) =>
              a.battingOrder === order &&
              a.inning >= enteredInn &&
              subIdentity !== null &&
              normalizeBatterIdentity(a.batterPlayerId, a.batterName) ===
                subIdentity
          );
        if (inningAb) {
          const cIdx = assignedColByAtBatId.get(inningAb.id) || 1;
          ensureGridCell(inningAb.inning, cIdx, order).leftOutsideSub = {
            name: subName,
            subType: "PH",
          };
        }
        continue;
      }

      if (sub.subType === "PR" || sub.subType === "TR") {
        // 代走・臨時代走：出塁したマスの「右内」に赤波線＋縦書き選手名（＋早稲田式用に到達セグメントへも名前付与）
        const attachPrSegmentName = (targetCell: CompiledScorebookCell) => {
          const hb = targetCell.atBat
            ? getHitBasesForResult(targetCell.atBat.resultCode)
            : 0;
          const prefSeg = (
            hb >= 1 && hb <= 3 ? hb : targetCell.segments[1] ? 1 : 2
          ) as BaseSegmentIndex;
          const seg =
            targetCell.segments[prefSeg] ||
            targetCell.segments[1] ||
            targetCell.segments[2] ||
            targetCell.segments[3];
          if (seg && !seg.pinchRunnerName) {
            seg.pinchRunnerName = subName;
          }
        };

        const mappedKey =
          (sub.enteredAtBatId
            ? prOriginCellByAtBatAndOrder.get(`${sub.enteredAtBatId}:${order}`)
            : undefined) ||
          prOriginCellByInningAndOrder.get(`${enteredInn}:${order}`);

        if (mappedKey && cellsByKey[mappedKey]) {
          cellsByKey[mappedKey].rightInsideSub = {
            name: subName,
            subType: sub.subType,
          };
          attachPrSegmentName(cellsByKey[mappedKey]);
        } else {
          const reachAb = atBats.find(
            (a) => a.battingOrder === order && a.inning === enteredInn
          );
          if (reachAb) {
            const cIdx = assignedColByAtBatId.get(reachAb.id) || 1;
            const tCell = ensureGridCell(reachAb.inning, cIdx, order);
            tCell.rightInsideSub = {
              name: subName,
              subType: sub.subType,
            };
            attachPrSegmentName(tCell);
          } else {
            const targetCol =
              findFirstColOfInning(enteredInn, sub.enteredColumnIndex || 1) ||
              columns[0];
            if (targetCol) {
              const tCell = ensureGridCell(
                targetCol.inning,
                targetCol.columnIndex,
                order
              );
              tCell.rightInsideSub = {
                name: subName,
                subType: sub.subType,
              };
              attachPrSegmentName(tCell);
            }
          }
        }
        continue;
      }

      // sub.subType === "DEF"（守備交代：交代が発生したイニングマスの「右内」に赤波線＋その左に上詰め黒字で名前）
      if (sub.enteredAtBatId) {
        const targetAb = atBats.find((a) => a.id === sub.enteredAtBatId);
        if (targetAb) {
          const abCol = assignedColByAtBatId.get(targetAb.id) || 1;
          const arrIdx = findColumnArrayIndex(targetAb.inning, abCol);
          if (arrIdx > 0) {
            const prevCol = columns[arrIdx - 1]!;
            ensureGridCell(
              prevCol.inning,
              prevCol.columnIndex,
              order
            ).rightInsideSub = {
              name: subName,
              subType: "DEF",
            };
            continue;
          }
          if (arrIdx === 0) {
            ensureGridCell(
              columns[0]!.inning,
              columns[0]!.columnIndex,
              order
            ).leftOutsideSub = {
              name: subName,
              subType: "DEF",
            };
            continue;
          }
        }
      }

      const alreadyBattedInEnteredInning = atBats.some(
        (a) =>
          a.battingOrder === order &&
          a.inning === enteredInn &&
          subIdentity !== null &&
          normalizeBatterIdentity(a.batterPlayerId, a.batterName) === subIdentity
      );

      if ((!isTop || alreadyBattedInEnteredInning) && enteredInn > 1) {
        const prevInnCol = findLastColOfInning(enteredInn - 1);
        if (prevInnCol) {
          ensureGridCell(
            prevInnCol.inning,
            prevInnCol.columnIndex,
            order
          ).rightInsideSub = {
            name: subName,
            subType: "DEF",
          };
          continue;
        }
      }

      const curInnCol = findLastColOfInning(enteredInn) || columns[0];
      if (curInnCol) {
        if (!isTop && enteredInn === 1) {
          ensureGridCell(
            curInnCol.inning,
            curInnCol.columnIndex,
            order
          ).leftOutsideSub = {
            name: subName,
            subType: "DEF",
          };
        } else {
          ensureGridCell(
            curInnCol.inning,
            curInnCol.columnIndex,
            order
          ).rightInsideSub = {
            name: subName,
            subType: "DEF",
          };
        }
      }
    }
  }

  // pinchRunners 配列のみに記録されている代走の補完
  for (const prRec of explicitPinchRunnerRecords) {
    const prKey = normalizeBatterIdentity(prRec.playerId, prRec.name);
    const seen = handledIdentitiesByOrder.get(prRec.battingOrder);
    if (cellsByKey[prRec.cellKey] && !cellsByKey[prRec.cellKey].rightInsideSub) {
      if (!prKey || !seen || !seen.has(prKey)) {
        cellsByKey[prRec.cellKey].rightInsideSub = {
          name: prRec.name,
          subType: prRec.subType,
        };
        if (prKey && seen && prRec.subType !== "TR") {
          seen.add(prKey);
        }
      }
    }
  }

  // 打席データ上で直接選手名が変わっている未登録代打の補完
  const lastSeenAtBatBatterByOrder = new Map<number, string>();
  for (const slot of normalizedSlots) {
    const k = normalizeBatterIdentity(slot.playerId, slot.name);
    if (k) lastSeenAtBatBatterByOrder.set(slot.battingOrder, k);
  }
  for (const ab of atBats) {
    const curKey = normalizeBatterIdentity(ab.batterPlayerId, ab.batterName);
    if (!curKey || !ab.batterName.trim()) continue;
    const prevKey = lastSeenAtBatBatterByOrder.get(ab.battingOrder);
    const seen = handledIdentitiesByOrder.get(ab.battingOrder);
    if (prevKey && curKey !== prevKey && (!seen || !seen.has(curKey))) {
      const cIdx = assignedColByAtBatId.get(ab.id) || 1;
      const target = ensureGridCell(ab.inning, cIdx, ab.battingOrder);
      if (!target.leftOutsideSub) {
        target.leftOutsideSub = {
          name: ab.batterName.trim(),
          subType: "PH",
        };
      }
      if (seen) seen.add(curKey);
    }
    lastSeenAtBatBatterByOrder.set(ab.battingOrder, curKey);
  }

  // 4. 相手（守備側）投手ごとの登板成績集計
  const pitcherRows = compilePitcherRows(structure.pitchers, atBats, maxInning);

  const batterRows = normalizedSlots.map(
    (s) => batterStatsMap.get(s.battingOrder)!
  );

  const totalPa = batterRows.reduce((s, r) => s + r.plateAppearances, 0);
  const totalAb = batterRows.reduce((s, r) => s + r.atBats, 0);
  const totalHits = batterRows.reduce((s, r) => s + r.hits, 0);
  const totalRbi = batterRows.reduce((s, r) => s + r.rbi, 0);
  const computedRuns = inningSummaries.reduce((s, i) => s + i.runs, 0);
  const totalRuns = Math.max(
    batterRows.reduce((s, r) => s + r.runs, 0),
    structure.totalRuns || 0,
    computedRuns
  );
  const totalWalksHbp = batterRows.reduce((s, r) => s + r.walksHbp, 0);
  const totalSo = batterRows.reduce((s, r) => s + r.strikeouts, 0);
  const totalSb = batterRows.reduce((s, r) => s + r.stolenBases, 0);
  const totalLob = inningSummaries.reduce((s, i) => s + i.leftOnBase, 0);
  const totalErrors = Math.max(
    structure.totalErrors || 0,
    inningSummaries.reduce((s, i) => s + i.errors, 0)
  );

  return {
    isTop,
    battingTeamName,
    fieldingTeamName,
    columns,
    batterRows,
    cellsByKey,
    doublePlayLinks,
    inningSummaries,
    totals: {
      plateAppearances: totalPa,
      atBats: totalAb,
      hits: totalHits,
      rbi: totalRbi,
      runs: totalRuns,
      walksHbp: totalWalksHbp,
      strikeouts: totalSo,
      stolenBases: totalSb,
      leftOnBase: totalLob,
      errors: totalErrors,
    },
    pitcherRows,
  };
}

function cellsByBaseLookup(
  map: Record<string, CompiledScorebookCell>,
  key: string
): CompiledScorebookCell | undefined {
  return map[key];
}

function compilePitcherRows(
  stints: ScorebookPitcherStint[],
  atBats: ScorebookV2AtBat[],
  maxInning: number
): CompiledPitcherRowStats[] {
  interface MutablePitcherAcc {
    order: number;
    name: string;
    uniformNumber: string;
    fromInning: number;
    toInning: number;
    outsRecorded: number;
    battersFaced: number;
    pitchesCount: number;
    hitsAllowed: number;
    homeRunsAllowed: number;
    strikeouts: number;
    walksHbp: number;
    runsAllowed: number;
  }

  const accList: MutablePitcherAcc[] = stints.map((st, idx) => ({
    order: st.order || idx + 1,
    name: st.name || `投手 ${idx + 1}`,
    uniformNumber: st.uniformNumber || "",
    fromInning: st.fromInning || 1,
    toInning: st.toInning || maxInning,
    outsRecorded: 0,
    battersFaced: 0,
    pitchesCount: 0,
    hitsAllowed: 0,
    homeRunsAllowed: 0,
    strikeouts: 0,
    walksHbp: 0,
    runsAllowed: 0,
  }));

  const findOrCreatePitcher = (ab: ScorebookV2AtBat): MutablePitcherAcc => {
    const pName = (ab.pitcherName || "").trim();
    if (pName) {
      const exact = accList.find(
        (p) =>
          p.name.replace(/\s+/g, "") === pName.replace(/\s+/g, "")
      );
      if (exact) {
        exact.fromInning = Math.min(exact.fromInning, ab.inning);
        exact.toInning = Math.max(exact.toInning, ab.inning);
        return exact;
      }
    }
    const byInning = accList.find(
      (p) => ab.inning >= p.fromInning && ab.inning <= p.toInning
    );
    if (byInning) return byInning;

    if (accList.length > 0 && !pName) {
      return accList[accList.length - 1];
    }

    const created: MutablePitcherAcc = {
      order: accList.length + 1,
      name: pName || "相手投手",
      uniformNumber: "",
      fromInning: ab.inning,
      toInning: ab.inning,
      outsRecorded: 0,
      battersFaced: 0,
      pitchesCount: 0,
      hitsAllowed: 0,
      homeRunsAllowed: 0,
      strikeouts: 0,
      walksHbp: 0,
      runsAllowed: 0,
    };
    accList.push(created);
    return created;
  };

  for (const ab of atBats) {
    const target = findOrCreatePitcher(ab);
    if (ab.resultCode !== "other") {
      target.battersFaced += 1;
    }
    target.outsRecorded += Math.max(0, ab.outsInPlay || 0);
    const realPitchCount = ab.pitches.filter(
      (p) => !isNonPitchMoundEvent(p)
    ).length;
    target.pitchesCount +=
      realPitchCount > 0
        ? realPitchCount
        : Math.max(
            ab.resultCode === "intentional_walk" || ab.resultCode === "other"
              ? 0
              : 1,
            (ab.balls || 0) + (ab.strikes || 0)
          );
    if (getHitBasesForResult(ab.resultCode) > 0) {
      target.hitsAllowed += 1;
    }
    if (ab.resultCode === "home_run") {
      target.homeRunsAllowed += 1;
    }
    if (isStrikeoutResult(ab.resultCode)) {
      target.strikeouts += 1;
    }
    if (isWalkOrHbpResult(ab.resultCode)) {
      target.walksHbp += 1;
    }
    target.runsAllowed += Math.max(0, ab.runsInPlay || 0);
  }

  return accList
    .filter((p) => p.battersFaced > 0 || accList.length === 1)
    .map((p, idx) => ({
      order: idx + 1,
      name: p.name,
      uniformNumber: p.uniformNumber,
      fromInning: p.fromInning,
      toInning: p.toInning,
      outsRecorded: p.outsRecorded,
      ipDisplay: formatOutsToIp(p.outsRecorded),
      battersFaced: p.battersFaced,
      pitchesCount: p.pitchesCount,
      hitsAllowed: p.hitsAllowed,
      homeRunsAllowed: p.homeRunsAllowed,
      strikeouts: p.strikeouts,
      walksHbp: p.walksHbp,
      runsAllowed: p.runsAllowed,
    }));
}

export function formatSubstitutionRoleShort(
  sub: ScorebookSubstitution
): string {
  if (sub.subType === "PH") return "代打";
  if (sub.subType === "PR") return "代走";
  if (sub.subType === "TR") return "臨走";
  return "守備";
}

/**
 * デモモード用：試合情報ページで「デジタルスコアブック清書」と「標準 ⇄ チーム記号ルール切替」をすぐ体験できるサンプルデータを生成
 */
export function buildDemoScorebookSavedBundle(params: {
  matchId: string;
  isMyTeamFirst: boolean;
  myTeamName: string;
  opponentName: string;
}): {
  topStructure: ScorebookSheetStructure;
  bottomStructure: ScorebookSheetStructure;
  topAtBats: ScorebookV2AtBat[];
  bottomAtBats: ScorebookV2AtBat[];
} {
  const { isMyTeamFirst } = params;

  const mkAb = (
    id: string,
    isTop: boolean,
    inning: number,
    battingOrder: number,
    batterName: string,
    pitcherName: string,
    resultCode: CanonicalAtBatResult,
    resultLabel: string,
    battedDirection: string,
    pitches: CanonicalPitchResult[],
    outsInPlay: number,
    endingOuts: number,
    runsInPlay = 0,
    rbi = 0,
    advances: ScorebookV2AtBat["advances"] = []
  ): ScorebookV2AtBat => ({
    id,
    inning,
    isTop,
    columnIndex: 1,
    battingOrder,
    batterName,
    batterPlayerId: null,
    pitcherName,
    pitcherPlayerId: null,
    resultCode,
    resultLabel,
    battedDirection,
    rbi,
    outsInPlay,
    endingOuts,
    runsInPlay,
    balls: pitches.filter((p) => p === "ball").length,
    strikes: pitches.filter(
      (p) =>
        p === "strike" ||
        p === "swinging_strike" ||
        p === "foul" ||
        p === "bunt_foul"
    ).length,
    pitches,
    advances,
    confidence: "high",
  });

  const myBatters: ScorebookBatterSlot[] = [
    { battingOrder: 1, name: "田中 健太", uniformNumber: "6", position: "6", playerId: "demo-p-6", bats: "L", substitutions: [] },
    {
      battingOrder: 2,
      name: "渡辺 陽向",
      uniformNumber: "4",
      position: "4",
      playerId: "demo-p-4",
      bats: "R",
      substitutions: [
        {
          id: "demo-shift-2",
          inningEntered: 5,
          subType: "DEF",
          name: "渡辺 陽向",
          uniformNumber: "4",
          position: "9",
          playerId: "demo-p-4",
          bats: "R",
        },
      ],
    },
    { battingOrder: 3, name: "山下 颯太", uniformNumber: "8", position: "8", playerId: "demo-p-8", bats: "L", substitutions: [] },
    { battingOrder: 4, name: "山田 翔太", uniformNumber: "10", position: "2", playerId: "demo-p-10", bats: "R", substitutions: [] },
    { battingOrder: 5, name: "鈴木 蓮", uniformNumber: "1", position: "1", playerId: "demo-p-1", bats: "R", substitutions: [] },
    { battingOrder: 6, name: "高橋 陸", uniformNumber: "3", position: "3", playerId: "demo-p-3", bats: "L", substitutions: [] },
    {
      battingOrder: 7,
      name: "山本 大翔",
      uniformNumber: "5",
      position: "5",
      playerId: "demo-p-5",
      bats: "R",
      substitutions: [
        {
          id: "demo-sub-1",
          inningEntered: 5,
          subType: "PH",
          name: "伊藤 蒼真",
          uniformNumber: "12",
          position: "5",
          playerId: "demo-p-12",
          bats: "L",
        },
      ],
    },
    { battingOrder: 8, name: "中村 颯", uniformNumber: "7", position: "7", playerId: "demo-p-7", bats: "R", substitutions: [] },
    {
      battingOrder: 9,
      name: "小林 樹",
      uniformNumber: "9",
      position: "9",
      playerId: "demo-p-9",
      bats: "R",
      substitutions: [
        {
          id: "demo-sub-9",
          inningEntered: 5,
          subType: "DEF",
          name: "小西 湊",
          uniformNumber: "14",
          position: "4",
          playerId: "demo-p-14",
          bats: "R",
        },
      ],
    },
  ];

  const myIsTop = isMyTeamFirst;
  const oppPitcher1 = "高橋 颯真";
  const oppPitcher2 = "佐々木 翼";

  const myAtBats: ScorebookV2AtBat[] = [
    // 1回 (2点)
    mkAb("dm-1", myIsTop, 1, 1, "田中 健太", oppPitcher1, "double", "左二塁打", "7", ["ball", "strike", "hit"], 0, 0),
    mkAb("dm-2", myIsTop, 1, 2, "渡辺 陽向", oppPitcher1, "sac_bunt", "投犠打", "1-3", ["in_play"], 1, 1, 0, 0, [
      { id: "adv-1", runnerName: "田中 健太", from: "2B", to: "3B", method: "sac", isOut: false },
    ]),
    mkAb("dm-3", myIsTop, 1, 3, "山下 颯太", oppPitcher1, "double", "右中間二塁打", "89", ["ball", "foul", "hit"], 0, 1, 1, 1, [
      { id: "adv-2", runnerName: "田中 健太", from: "3B", to: "HP", method: "hit", isOut: false },
    ]),
    mkAb("dm-4", myIsTop, 1, 4, "山田 翔太", oppPitcher1, "single", "中安打", "8", ["strike", "hit"], 0, 1, 1, 1, [
      { id: "adv-3", runnerName: "山下 颯太", from: "2B", to: "HP", method: "hit", isOut: false },
    ]),
    mkAb("dm-5", myIsTop, 1, 5, "鈴木 蓮", oppPitcher1, "strikeout", "見逃し三振", "", ["strike", "ball", "foul", "strike"], 1, 2),
    mkAb("dm-6", myIsTop, 1, 6, "高橋 陸", oppPitcher1, "flyout", "中飛", "8", ["ball", "in_play"], 1, 3),

    // 2回 (0点)
    mkAb("dm-7", myIsTop, 2, 7, "山本 大翔", oppPitcher1, "walk", "四球", "", ["ball", "strike", "ball", "ball", "ball"], 0, 0),
    mkAb("dm-8", myIsTop, 2, 8, "中村 颯", oppPitcher1, "double_play", "遊ゴロ併殺", "6-4-3", ["strike", "in_play"], 2, 2),
    mkAb("dm-9", myIsTop, 2, 9, "小林 樹", oppPitcher1, "strikeout", "空振り三振", "", ["swinging_strike", "ball", "foul", "swinging_strike"], 1, 3),

    // 3回 (1点)
    mkAb("dm-10", myIsTop, 3, 1, "田中 健太", oppPitcher1, "single", "中安打", "8", ["ball", "hit"], 0, 0),
    mkAb("dm-11", myIsTop, 3, 2, "渡辺 陽向", oppPitcher1, "groundout", "二ゴロ", "4-3", ["ball", "strike", "in_play"], 1, 1, 0, 0, [
      { id: "adv-4", runnerName: "田中 健太", from: "1B", to: "2B", method: "steal", isOut: false },
      { id: "adv-5", runnerName: "田中 健太", from: "2B", to: "3B", method: "other", isOut: false },
    ]),
    mkAb("dm-12", myIsTop, 3, 3, "山下 颯太", oppPitcher1, "walk", "四球", "", ["ball", "ball", "strike", "ball", "ball"], 0, 1),
    mkAb("dm-13", myIsTop, 3, 4, "山田 翔太", oppPitcher1, "sac_fly", "中犠飛", "8", ["foul", "in_play"], 1, 2, 1, 1, [
      { id: "adv-6", runnerName: "田中 健太", from: "3B", to: "HP", method: "sac", isOut: false },
    ]),
    mkAb("dm-14", myIsTop, 3, 5, "鈴木 蓮", oppPitcher1, "groundout", "遊ゴロ", "6-3", ["in_play"], 1, 3),

    // 4回 (2点)
    mkAb("dm-15", myIsTop, 4, 6, "高橋 陸", oppPitcher1, "single", "右安打", "9", ["strike", "ball", "hit"], 0, 0),
    mkAb("dm-16", myIsTop, 4, 7, "山本 大翔", oppPitcher1, "flyout", "三直", "5L", ["ball", "in_play"], 1, 1),
    mkAb("dm-17", myIsTop, 4, 8, "中村 颯", oppPitcher1, "strikeout", "見逃し三振", "", ["ball", "strike", "foul", "strike"], 1, 2),
    mkAb("dm-18", myIsTop, 4, 9, "小林 樹", oppPitcher1, "error", "遊失策", "6E", ["in_play"], 0, 2, 0, 0, [
      { id: "adv-7", runnerName: "高橋 陸", from: "1B", to: "2B", method: "error", isOut: false },
    ]),
    mkAb("dm-19", myIsTop, 4, 1, "田中 健太", oppPitcher2, "single", "左安打", "7", ["strike", "hit"], 0, 2, 1, 1, [
      { id: "adv-8", runnerName: "高橋 陸", from: "2B", to: "HP", method: "hit", isOut: false },
      { id: "adv-9", runnerName: "小林 樹", from: "1B", to: "3B", method: "hit", isOut: false },
    ]),
    mkAb("dm-20", myIsTop, 4, 2, "渡辺 陽向", oppPitcher2, "single", "中安打", "8", ["ball", "hit"], 0, 2, 1, 1, [
      { id: "adv-10", runnerName: "小林 樹", from: "3B", to: "HP", method: "hit", isOut: false },
      { id: "adv-11", runnerName: "田中 健太", from: "1B", to: "2B", method: "steal", isOut: false },
      { id: "adv-12", runnerName: "田中 健太", from: "2B", to: "3B", method: "hit", isOut: false },
    ]),
    mkAb("dm-21", myIsTop, 4, 3, "山下 颯太", oppPitcher2, "flyout", "右飛", "9", ["ball", "in_play"], 1, 3),

    // 5回 (2点)
    mkAb("dm-22", myIsTop, 5, 4, "山田 翔太", oppPitcher2, "hit_by_pitch", "死球", "", ["ball", "hbp"], 0, 0),
    mkAb("dm-23", myIsTop, 5, 5, "鈴木 蓮", oppPitcher2, "flyout", "左飛", "7", ["strike", "in_play"], 1, 1),
    mkAb("dm-24", myIsTop, 5, 6, "高橋 陸", oppPitcher2, "groundout", "一ゴロ", "3", ["in_play"], 1, 2, 0, 0, [
      { id: "adv-13", runnerName: "山田 翔太", from: "1B", to: "2B", method: "other", isOut: false },
    ]),
    mkAb("dm-25", myIsTop, 5, 7, "伊藤 蒼真", oppPitcher2, "home_run", "左越本塁打", "7", ["ball", "ball", "swinging_strike", "hit"], 0, 2, 2, 2, [
      { id: "adv-14", runnerName: "山田 翔太", from: "2B", to: "HP", method: "hit", isOut: false },
    ]),
    mkAb("dm-26", myIsTop, 5, 8, "中村 颯", oppPitcher2, "groundout", "三ゴロ", "5-3", ["strike", "in_play"], 1, 3),

    // 6回 (0点)
    mkAb("dm-27", myIsTop, 6, 9, "小西 湊", oppPitcher2, "groundout", "二ゴロ", "4-3", ["ball", "in_play"], 1, 1),
    mkAb("dm-28", myIsTop, 6, 1, "田中 健太", oppPitcher2, "flyout", "遊飛", "6", ["foul", "in_play"], 1, 2),
    mkAb("dm-29", myIsTop, 6, 2, "渡辺 陽向", oppPitcher2, "groundout", "遊ゴロ", "6-3", ["strike", "in_play"], 1, 3),

    // 7回 (0点)
    mkAb("dm-30", myIsTop, 7, 3, "山下 颯太", oppPitcher2, "single", "中安打", "8", ["ball", "hit"], 0, 0),
    mkAb("dm-31", myIsTop, 7, 4, "山田 翔太", oppPitcher2, "flyout", "中飛", "8", ["in_play"], 1, 1),
    mkAb("dm-32", myIsTop, 7, 5, "鈴木 蓮", oppPitcher2, "strikeout", "空振り三振", "", ["swinging_strike", "foul", "swinging_strike"], 1, 2),
    mkAb("dm-33", myIsTop, 7, 6, "高橋 陸", oppPitcher2, "groundout", "二ゴロ", "4-3", ["ball", "in_play"], 1, 3),
  ];

  const myStructure: ScorebookSheetStructure = {
    isTop: myIsTop,
    isMyTeamBatting: true,
    batters: myBatters,
    pitchers: [
      { id: "dp-1", order: 1, name: oppPitcher1, uniformNumber: "1", playerId: null, fromInning: 1, toInning: 4 },
      { id: "dp-2", order: 2, name: oppPitcher2, uniformNumber: "11", playerId: null, fromInning: 4, toInning: 7 },
    ],
    innings: [
      { inning: 1, columnCount: 1, runs: 2, hits: 3 },
      { inning: 2, columnCount: 1, runs: 0, hits: 0 },
      { inning: 3, columnCount: 1, runs: 1, hits: 1 },
      { inning: 4, columnCount: 1, runs: 2, hits: 3 },
      { inning: 5, columnCount: 1, runs: 2, hits: 1 },
      { inning: 6, columnCount: 1, runs: 0, hits: 0 },
      { inning: 7, columnCount: 1, runs: 0, hits: 1 },
    ],
    totalRuns: 7,
    totalHits: 9,
    totalErrors: 1,
  };

  const oppIsTop = !myIsTop;
  const oppBatters: ScorebookBatterSlot[] = Array.from({ length: 9 }, (_, i) => ({
    battingOrder: i + 1,
    name: `相手打者 ${i + 1}`,
    uniformNumber: String(i + 1),
    position: String(((i + 5) % 9) + 1),
    playerId: null,
    substitutions: [],
  }));

  const oppAtBats: ScorebookV2AtBat[] = [
    mkAb("do-1", oppIsTop, 1, 1, "相手打者 1", "鈴木 蓮", "groundout", "遊ゴロ", "6-3", ["strike", "in_play"], 1, 1),
    mkAb("do-2", oppIsTop, 1, 2, "相手打者 2", "鈴木 蓮", "strikeout", "見逃し三振", "", ["ball", "strike", "foul", "strike"], 1, 2),
    mkAb("do-3", oppIsTop, 1, 3, "相手打者 3", "鈴木 蓮", "flyout", "中飛", "8", ["in_play"], 1, 3),

    mkAb("do-4", oppIsTop, 2, 4, "相手打者 4", "鈴木 蓮", "double", "左二塁打", "7", ["ball", "hit"], 0, 0),
    mkAb("do-5", oppIsTop, 2, 5, "相手打者 5", "鈴木 蓮", "sac_bunt", "投犠打", "1-4", ["in_play"], 1, 1, 0, 0, [
      { id: "oa-1", runnerName: "相手打者 4", from: "2B", to: "3B", method: "sac", isOut: false },
    ]),
    mkAb("do-6", oppIsTop, 2, 6, "相手打者 6", "鈴木 蓮", "single", "中安打", "8", ["strike", "hit"], 0, 1, 1, 1, [
      { id: "oa-2", runnerName: "相手打者 4", from: "3B", to: "HP", method: "hit", isOut: false },
    ]),
    mkAb("do-7", oppIsTop, 2, 7, "相手打者 7", "鈴木 蓮", "strikeout", "空振り三振", "", ["swinging_strike", "foul", "swinging_strike"], 1, 2),
    mkAb("do-8", oppIsTop, 2, 8, "相手打者 8", "鈴木 蓮", "groundout", "二ゴロ", "4-3", ["in_play"], 1, 3),

    mkAb("do-9", oppIsTop, 3, 9, "相手打者 9", "鈴木 蓮", "flyout", "右飛", "9", ["ball", "in_play"], 1, 1),
    mkAb("do-10", oppIsTop, 3, 1, "相手打者 1", "鈴木 蓮", "walk", "四球", "", ["ball", "ball", "strike", "ball", "ball"], 0, 1),
    mkAb("do-11", oppIsTop, 3, 2, "相手打者 2", "鈴木 蓮", "double_play", "二ゴロ併殺", "4-6-3", ["in_play"], 2, 3),

    mkAb("do-12", oppIsTop, 4, 3, "相手打者 3", "鈴木 蓮", "single", "右安打", "9", ["hit"], 0, 0),
    mkAb("do-13", oppIsTop, 4, 4, "相手打者 4", "鈴木 蓮", "double", "左中間二塁打", "78", ["ball", "hit"], 0, 0, 1, 1, [
      { id: "oa-3", runnerName: "相手打者 3", from: "1B", to: "HP", method: "hit", isOut: false },
    ]),
    mkAb("do-14", oppIsTop, 4, 5, "相手打者 5", "鈴木 蓮", "groundout", "三ゴロ", "5-3", ["in_play"], 1, 1, 0, 0, [
      { id: "oa-4", runnerName: "相手打者 4", from: "2B", to: "3B", method: "other", isOut: false },
    ]),
    mkAb("do-15", oppIsTop, 4, 6, "相手打者 6", "鈴木 蓮", "sac_fly", "右犠飛", "9", ["ball", "in_play"], 1, 2, 1, 1, [
      { id: "oa-5", runnerName: "相手打者 4", from: "3B", to: "HP", method: "sac", isOut: false },
    ]),
    mkAb("do-16", oppIsTop, 4, 7, "相手打者 7", "鈴木 蓮", "strikeout", "空振り三振", "", ["strike", "swinging_strike", "swinging_strike"], 1, 3),

    mkAb("do-17", oppIsTop, 5, 8, "相手打者 8", "鈴木 蓮", "groundout", "遊ゴロ", "6-3", ["in_play"], 1, 1),
    mkAb("do-18", oppIsTop, 5, 9, "相手打者 9", "鈴木 蓮", "strikeout", "見逃し三振", "", ["strike", "ball", "strike", "strike"], 1, 2),
    mkAb("do-19", oppIsTop, 5, 1, "相手打者 1", "鈴木 蓮", "flyout", "左飛", "7", ["in_play"], 1, 3),

    mkAb("do-20", oppIsTop, 6, 2, "相手打者 2", "佐藤 陽太", "single", "中安打", "8", ["ball", "hit"], 0, 0),
    mkAb("do-21", oppIsTop, 6, 3, "相手打者 3", "佐藤 陽太", "double", "右二塁打", "9", ["strike", "hit"], 0, 0, 1, 1, [
      { id: "oa-6", runnerName: "相手打者 2", from: "1B", to: "HP", method: "hit", isOut: false },
    ]),
    mkAb("do-22", oppIsTop, 6, 4, "相手打者 4", "佐藤 陽太", "strikeout", "空振り三振", "", ["swinging_strike", "ball", "swinging_strike", "swinging_strike"], 1, 1),
    mkAb("do-23", oppIsTop, 6, 5, "相手打者 5", "佐藤 陽太", "flyout", "二飛", "4", ["in_play"], 1, 2),
    mkAb("do-24", oppIsTop, 6, 6, "相手打者 6", "佐藤 陽太", "groundout", "遊ゴロ", "6-3", ["in_play"], 1, 3),

    mkAb("do-25", oppIsTop, 7, 7, "相手打者 7", "佐藤 陽太", "groundout", "三ゴロ", "5-3", ["in_play"], 1, 1),
    mkAb("do-26", oppIsTop, 7, 8, "相手打者 8", "佐藤 陽太", "flyout", "中飛", "8", ["ball", "in_play"], 1, 2),
    mkAb("do-27", oppIsTop, 7, 9, "相手打者 9", "佐藤 陽太", "strikeout", "空振り三振", "", ["strike", "foul", "ball", "swinging_strike"], 1, 3),
  ];

  const oppStructure: ScorebookSheetStructure = {
    isTop: oppIsTop,
    isMyTeamBatting: false,
    batters: oppBatters,
    pitchers: [
      { id: "mp-1", order: 1, name: "鈴木 蓮", uniformNumber: "1", playerId: "demo-p-1", fromInning: 1, toInning: 5 },
      { id: "mp-2", order: 2, name: "佐藤 陽太", uniformNumber: "11", playerId: "demo-p-11", fromInning: 6, toInning: 7 },
    ],
    innings: [
      { inning: 1, columnCount: 1, runs: 0, hits: 0 },
      { inning: 2, columnCount: 1, runs: 1, hits: 2 },
      { inning: 3, columnCount: 1, runs: 0, hits: 0 },
      { inning: 4, columnCount: 1, runs: 2, hits: 2 },
      { inning: 5, columnCount: 1, runs: 0, hits: 0 },
      { inning: 6, columnCount: 1, runs: 1, hits: 2 },
      { inning: 7, columnCount: 1, runs: 0, hits: 0 },
    ],
    totalRuns: 4,
    totalHits: 6,
    totalErrors: 0,
  };

  return myIsTop
    ? {
        topStructure: myStructure,
        bottomStructure: oppStructure,
        topAtBats: myAtBats,
        bottomAtBats: oppAtBats,
      }
    : {
        topStructure: oppStructure,
        bottomStructure: myStructure,
        topAtBats: oppAtBats,
        bottomAtBats: myAtBats,
      };
}
