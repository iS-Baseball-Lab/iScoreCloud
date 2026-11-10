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

export interface CompiledBatterStatValues {
  plateAppearances: number;
  atBats: number;
  hits: number;
  singles: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  rbi: number;
  runs: number;
  walks: number;
  hitByPitch: number;
  walksHbp: number;
  strikeouts: number;
  sacBunts: number;
  sacFlies: number;
  stolenBases: number;
  caughtStealing: number;
  leftOnBase: number;
  doublePlays: number;
  errors: number;
  assists: number;
  putouts: number;
  avg: string;
}

export interface CompiledBatterSubRowStats extends CompiledBatterStatValues {
  subRowIndex: 0 | 1 | 2;
  hasPlayer: boolean;
  name: string;
  uniformNumber: string;
}

export interface CompiledBatterRowStats extends CompiledBatterStatValues {
  battingOrder: number;
  slot: ScorebookBatterSlot;
  subRows: [
    CompiledBatterSubRowStats,
    CompiledBatterSubRowStats,
    CompiledBatterSubRowStats,
  ];
}

export interface CompiledPitcherRowStats {
  order: number;
  name: string;
  uniformNumber: string;
  fromInning: number;
  toInning: number;
  outsRecorded: number;
  ipDisplay: string;
  pitchesCount: number;
  battersFaced: number;
  hitsAllowed: number;
  homeRunsAllowed: number;
  sacBuntsAllowed: number;
  sacFliesAllowed: number;
  strikeouts: number;
  walks: number;
  hitByPitch: number;
  walksHbp: number;
  wildPitches: number;
  balks: number;
  runsAllowed: number;
  earnedRuns: number;
  eraDisplay: string;
}

export interface CompiledPitcherTotals {
  outsRecorded: number;
  ipDisplay: string;
  pitchesCount: number;
  battersFaced: number;
  hitsAllowed: number;
  homeRunsAllowed: number;
  sacBuntsAllowed: number;
  sacFliesAllowed: number;
  strikeouts: number;
  walks: number;
  hitByPitch: number;
  walksHbp: number;
  wildPitches: number;
  balks: number;
  runsAllowed: number;
  earnedRuns: number;
  eraDisplay: string;
}

export interface ScorebookDefenseContext {
  opponentAtBats: ScorebookV2AtBat[];
  opponentStructure?: ScorebookSheetStructure | null;
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
  totals: CompiledBatterStatValues & {
    opponentErrors: number;
  };
  pitcherRows: CompiledPitcherRowStats[];
  pitcherTotals: CompiledPitcherTotals;
}

function formatBattingAvg(hits: number, atBats: number): string {
  if (atBats <= 0) return ".000";
  const raw = (hits / atBats).toFixed(3);
  if (raw.startsWith("0.")) return raw.slice(1);
  if (raw === "1.000") return "1.00";
  return raw;
}

function formatRegulationEra(earnedRuns: number, outs: number): string {
  if (outs <= 0) return "0.00";
  return ((earnedRuns * 7 * 3) / outs).toFixed(2);
}

function normalizeFieldingPosCode(raw: string | null | undefined): string {
  const s = (raw || "").trim().toUpperCase();
  if (!s) return "";
  if (/^[1-9]$/.test(s)) return s;
  if (s === "投" || s === "P") return "1";
  if (s === "捕" || s === "C") return "2";
  if (s === "一" || s === "1B") return "3";
  if (s === "二" || s === "2B") return "4";
  if (s === "三" || s === "3B") return "5";
  if (s === "遊" || s === "SS") return "6";
  if (s === "左" || s === "LF") return "7";
  if (s === "中" || s === "CF") return "8";
  if (s === "右" || s === "RF") return "9";
  return "";
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
  matchMeta: ScorebookMatchHeaderMeta,
  defenseContext?: ScorebookDefenseContext
): CompiledScorebookSheetModel {
  const isTop = structure.isTop;
  const battingTeamName = isTop
    ? matchMeta.topTeamName
    : matchMeta.bottomTeamName;
  const fieldingTeamName = isTop
    ? matchMeta.bottomTeamName
    : matchMeta.topTeamName;

  // 1. 打順行（標準紙面に合わせて最低10番まで表示、全員打ち等で11人以上なら自動拡張）を構築
  const maxOrder = Math.max(
    10,
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
  // 清書シート紙面は常に最低9回までマスを表示し、延長10回以降は自動拡張する
  const maxPlayedInning =
    atBats.length > 0 ? Math.max(1, ...atBats.map((a) => a.inning || 1)) : 0;
  const maxInning = Math.max(
    9,
    matchMeta.scheduledInnings || 9,
    ...structure.innings.map((m) => m.inning),
    maxPlayedInning
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

  const normalizeBatterIdentity = (
    playerId: string | null | undefined,
    name: string | null | undefined
  ): string | null => {
    if (playerId && playerId.trim()) return `id:${playerId.trim()}`;
    const clean = (name || "").replace(/\s+/g, "");
    return clean ? `name:${clean}` : null;
  };

  const makeEmptyStatValues = (): CompiledBatterStatValues => ({
    plateAppearances: 0,
    atBats: 0,
    hits: 0,
    singles: 0,
    doubles: 0,
    triples: 0,
    homeRuns: 0,
    rbi: 0,
    runs: 0,
    walks: 0,
    hitByPitch: 0,
    walksHbp: 0,
    strikeouts: 0,
    sacBunts: 0,
    sacFlies: 0,
    stolenBases: 0,
    caughtStealing: 0,
    leftOnBase: 0,
    doublePlays: 0,
    errors: 0,
    assists: 0,
    putouts: 0,
    avg: ".000",
  });

  interface SlotParticipantMeta {
    subRowIndex: 0 | 1 | 2;
    playerId: string | null;
    cleanName: string;
    inningEntered: number;
    enteredFromBatterOrder?: number | null;
    subType: "STARTER" | "PH" | "PR" | "TR" | "DEF";
    position: string;
  }

  const slotParticipantsMap = new Map<number, SlotParticipantMeta[]>();

  // 打順別＋3段サブ行別集計アキュムレータ
  const batterStatsMap = new Map<number, CompiledBatterRowStats>();
  for (const slot of normalizedSlots) {
    const starterName = slot.name.trim();
    const starterNum = slot.uniformNumber.trim();
    const subRows: [
      CompiledBatterSubRowStats,
      CompiledBatterSubRowStats,
      CompiledBatterSubRowStats,
    ] = [
      {
        ...makeEmptyStatValues(),
        subRowIndex: 0,
        hasPlayer: Boolean(starterName),
        name: starterName,
        uniformNumber: starterNum,
      },
      {
        ...makeEmptyStatValues(),
        subRowIndex: 1,
        hasPlayer: false,
        name: "",
        uniformNumber: "",
      },
      {
        ...makeEmptyStatValues(),
        subRowIndex: 2,
        hasPlayer: false,
        name: "",
        uniformNumber: "",
      },
    ];

    const participants: SlotParticipantMeta[] = [
      {
        subRowIndex: 0,
        playerId: slot.playerId || null,
        cleanName: starterName.replace(/\s+/g, ""),
        inningEntered: 1,
        subType: "STARTER",
        position: normalizeFieldingPosCode(slot.position),
      },
    ];

    let activeRowIdx: 0 | 1 | 2 = 0;
    let activePlayerId = slot.playerId || null;
    let activeCleanName = starterName.replace(/\s+/g, "");

    for (const sub of slot.substitutions) {
      const cleanSubName = sub.name.replace(/\s+/g, "");
      const cleanSubPos = sub.position.trim();
      const cleanSubNum = sub.uniformNumber.trim();
      if (!cleanSubName && !cleanSubPos && !cleanSubNum) {
        continue;
      }

      const isSamePlayer =
        (Boolean(sub.playerId) &&
          Boolean(activePlayerId) &&
          sub.playerId === activePlayerId) ||
        ((!sub.playerId || !activePlayerId) &&
          cleanSubName !== "" &&
          activeCleanName !== "" &&
          cleanSubName === activeCleanName) ||
        (cleanSubName === "" && sub.subType === "DEF");

      if (isSamePlayer) {
        const normPos = normalizeFieldingPosCode(cleanSubPos);
        if (normPos) {
          participants.push({
            subRowIndex: activeRowIdx,
            playerId: sub.playerId || activePlayerId,
            cleanName: cleanSubName || activeCleanName,
            inningEntered: sub.inningEntered || 1,
            enteredFromBatterOrder: sub.enteredFromBatterOrder ?? null,
            subType: sub.subType,
            position: normPos,
          });
        }
        if (cleanSubNum && !subRows[activeRowIdx].uniformNumber) {
          subRows[activeRowIdx].uniformNumber = cleanSubNum;
        }
        continue;
      }

      if (activeRowIdx < 2) {
        activeRowIdx = (activeRowIdx + 1) as 1 | 2;
        subRows[activeRowIdx].hasPlayer = true;
        subRows[activeRowIdx].name = sub.name.trim();
        subRows[activeRowIdx].uniformNumber = cleanSubNum;
      } else {
        subRows[2].hasPlayer = true;
        subRows[2].name = subRows[2].name
          ? `${subRows[2].name}/${sub.name.trim()}`
          : sub.name.trim();
        subRows[2].uniformNumber = cleanSubNum || subRows[2].uniformNumber;
      }

      activePlayerId = sub.playerId || null;
      activeCleanName = cleanSubName;

      participants.push({
        subRowIndex: activeRowIdx,
        playerId: activePlayerId,
        cleanName: activeCleanName,
        inningEntered: sub.inningEntered || 1,
        enteredFromBatterOrder: sub.enteredFromBatterOrder ?? null,
        subType: sub.subType,
        position: normalizeFieldingPosCode(cleanSubPos),
      });
    }

    slotParticipantsMap.set(slot.battingOrder, participants);
    batterStatsMap.set(slot.battingOrder, {
      battingOrder: slot.battingOrder,
      slot,
      ...makeEmptyStatValues(),
      subRows,
    });
  }

  const resolveSubRowIdxForPlayer = (
    order: number,
    playerId: string | null | undefined,
    name: string | null | undefined,
    inning: number
  ): 0 | 1 | 2 => {
    const participants = slotParticipantsMap.get(order);
    if (!participants || participants.length <= 1) return 0;

    const cleanTarget = (name || "").replace(/\s+/g, "");
    if (playerId && playerId.trim()) {
      const byId = participants.find((p) => p.playerId === playerId.trim());
      if (byId) return byId.subRowIndex;
    }
    if (cleanTarget) {
      const byName = participants.find(
        (p) => p.cleanName !== "" && p.cleanName === cleanTarget
      );
      if (byName) return byName.subRowIndex;
    }

    let fallbackIdx: 0 | 1 | 2 = 0;
    for (const p of participants) {
      if (p.subType === "TR") continue;
      if (p.inningEntered <= inning) {
        fallbackIdx = p.subRowIndex;
      }
    }
    return fallbackIdx;
  };

  const applyStatMutation = (
    order: number,
    subIdx: 0 | 1 | 2,
    mutator: (target: CompiledBatterStatValues) => void
  ) => {
    const row = batterStatsMap.get(order);
    if (!row) return;
    mutator(row);
    const subRow = row.subRows[subIdx];
    subRow.hasPlayer = true;
    mutator(subRow);
  };

  const addRunToRunner = (
    order: number,
    playerId: string | null | undefined,
    name: string | null | undefined,
    inning: number
  ) => {
    if (order <= 0) return;
    const subIdx = resolveSubRowIdxForPlayer(order, playerId, name, inning);
    applyStatMutation(order, subIdx, (t) => {
      t.runs += 1;
    });
  };

  const addStealToRunner = (
    order: number,
    playerId: string | null | undefined,
    name: string | null | undefined,
    inning: number
  ) => {
    if (order <= 0) return;
    const subIdx = resolveSubRowIdxForPlayer(order, playerId, name, inning);
    applyStatMutation(order, subIdx, (t) => {
      t.stolenBases += 1;
    });
  };

  const addCaughtStealingToRunner = (
    order: number,
    playerId: string | null | undefined,
    name: string | null | undefined,
    inning: number
  ) => {
    if (order <= 0) return;
    const subIdx = resolveSubRowIdxForPlayer(order, playerId, name, inning);
    applyStatMutation(order, subIdx, (t) => {
      t.caughtStealing += 1;
    });
  };

  const atBatPitcherCharges = new Map<
    string,
    { runs: number; earnedRuns: number; outs: number }
  >();

  let prevPitcherKey: string | null = null;
  const doublePlayLinks: CompiledDoublePlayLink[] = [];
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
      const hasNonZeroMeta = Boolean(
        innMeta && ((innMeta.runs ?? 0) > 0 || (innMeta.hits ?? 0) > 0)
      );
      inningSummaries.push({
        inning: inn,
        runs:
          innMeta?.runs ??
          (typeof fallbackScore === "number" && fallbackScore >= 0
            ? fallbackScore
            : 0),
        hits: innMeta?.hits ?? 0,
        errors: 0,
        walksHbp: 0,
        leftOnBase: 0,
        plateAppearances: 0,
        hasData:
          (typeof fallbackScore === "number" && fallbackScore >= 0) ||
          inn <= maxPlayedInning ||
          hasNonZeroMeta,
      });
      continue;
    }

    let originByBase: Record<OccupiedBaseKey, string | null> = {
      "1B": null,
      "2B": null,
      "3B": null,
    };
    let outsTracker = 0;
    const assignedOutCellKeysInInning = new Set<string>();
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
      if (ab.resultCode !== "other") {
        innPa += 1;
        const hb = getHitBasesForResult(ab.resultCode);
        if (hb > 0) {
          innHits += 1;
        }
        if (isWalkOrHbpResult(ab.resultCode)) {
          innWalksHbp += 1;
        }
        const batterSubIdx = resolveSubRowIdxForPlayer(
          ab.battingOrder,
          ab.batterPlayerId,
          ab.batterName,
          inn
        );
        applyStatMutation(ab.battingOrder, batterSubIdx, (t) => {
          t.plateAppearances += 1;
          if (isOfficialAtBatResult(ab.resultCode)) {
            t.atBats += 1;
          }
          if (hb === 1) {
            t.hits += 1;
            t.singles += 1;
          } else if (hb === 2) {
            t.hits += 1;
            t.doubles += 1;
          } else if (hb === 3) {
            t.hits += 1;
            t.triples += 1;
          } else if (hb === 4) {
            t.hits += 1;
            t.homeRuns += 1;
          }
          t.rbi += Math.max(0, ab.rbi || 0);
          if (
            ab.resultCode === "walk" ||
            ab.resultCode === "intentional_walk"
          ) {
            t.walks += 1;
            t.walksHbp += 1;
          } else if (ab.resultCode === "hit_by_pitch") {
            t.hitByPitch += 1;
            t.walksHbp += 1;
          }
          if (isStrikeoutResult(ab.resultCode)) {
            t.strikeouts += 1;
          }
          if (ab.resultCode === "sac_bunt") {
            t.sacBunts += 1;
          } else if (ab.resultCode === "sac_fly") {
            t.sacFlies += 1;
          }
          if (
            ab.resultCode === "double_play" ||
            ab.resultCode === "triple_play"
          ) {
            t.doublePlays += 1;
          }
        });
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
      let unearnedRunsInPlay = 0;
      if (idx === 0 && outsTracker === 0 && snap.outsBefore > 0) {
        outsTracker = Math.min(2, snap.outsBefore);
      }

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

      const playOutCellKeys: string[] = [];
      const recordPlayOutCell = (outKey: string) => {
        if (!playOutCellKeys.includes(outKey)) {
          playOutCellKeys.push(outKey);
        }
      };

      const assignInningOutOrdinal = (
        targetCell?: CompiledScorebookCell,
        recordForPlayLink = false
      ): 1 | 2 | 3 | null => {
        if (targetCell) {
          if (assignedOutCellKeysInInning.has(targetCell.cellKey)) {
            if (recordForPlayLink && targetCell.outNumber) {
              recordPlayOutCell(targetCell.cellKey);
            }
            return targetCell.outNumber;
          }
          if (outsTracker >= 3) {
            return null;
          }
          outsTracker += 1;
          const ord = outsTracker as 1 | 2 | 3;
          targetCell.outNumber = ord;
          assignedOutCellKeysInInning.add(targetCell.cellKey);
          if (recordForPlayLink) {
            recordPlayOutCell(targetCell.cellKey);
          }
          return ord;
        }

        if (outsTracker >= 3) {
          return null;
        }
        outsTracker += 1;
        return outsTracker as 1 | 2 | 3;
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
            addStealToRunner(
              pr.runner.battingOrder,
              pr.runner.playerId,
              pr.runner.name,
              inn
            );
          } else if (
            pr.runner.battingOrder > 0 &&
            ((pm.isOut && pm.method === "steal") ||
              pm.method === "caught_stealing")
          ) {
            addCaughtStealingToRunner(
              pr.runner.battingOrder,
              pr.runner.playerId,
              pr.runner.name,
              inn
            );
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
            if (pr.runner.battingOrder > 0) {
              addRunToRunner(
                pr.runner.battingOrder,
                pr.runner.playerId,
                pr.runner.name,
                inn
              );
            }
            const isUnearnedPrePlay =
              pm.method === "error" ||
              pm.method === "pb" ||
              pm.method === "pickoff_error" ||
              isOriginCellReachedByErrorOrUncharged(originCell) ||
              (virtualErrorSavedOuts > 0 &&
                outsTracker + virtualErrorSavedOuts >= 3);
            if (isUnearnedPrePlay) {
              unearnedRunsInPlay += 1;
            }
            if (originCell) {
              originCell.runScored = true;
              if (isUnearnedPrePlay) {
                originCell.isUnearnedRun = true;
              }
            }
          }
        }

        if (pr.isOutPrePlay) {
          assignInningOutOrdinal(originCell, false);
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
          assignInningOutOrdinal(cell, true);
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
            if (
              pr.runner.battingOrder > 0 &&
              pr.effectiveMethod === "caught_stealing"
            ) {
              addCaughtStealingToRunner(
                pr.runner.battingOrder,
                pr.runner.playerId,
                pr.runner.name,
                inn
              );
            }
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
              assignInningOutOrdinal(originCell, true);
            } else {
              assignInningOutOrdinal(undefined, false);
            }
          } else if (baseToLevel(pr.finalBase) > baseToLevel(inPlayFrom)) {
            if (
              pr.runner.battingOrder > 0 &&
              pr.effectiveMethod === "steal" &&
              !pr.prePlayMoves.some((pm) => !pm.isOut && pm.method === "steal")
            ) {
              addStealToRunner(
                pr.runner.battingOrder,
                pr.runner.playerId,
                pr.runner.name,
                inn
              );
            }
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
                addRunToRunner(
                  pr.runner.battingOrder,
                  pr.runner.playerId,
                  pr.runner.name,
                  inn
                );
              }
              const isUnearnedInPlay =
                pr.effectiveMethod === "error" ||
                pr.effectiveMethod === "pb" ||
                ab.resultCode === "error" ||
                isOriginCellReachedByErrorOrUncharged(originCell) ||
                (virtualErrorSavedOuts > 0 &&
                  outsTracker + virtualErrorSavedOuts >= 3);
              if (isUnearnedInPlay) {
                unearnedRunsInPlay += 1;
              }
              if (originCell) {
                originCell.runScored = true;
                if (isUnearnedInPlay) {
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

      const isGenuineDoubleOrTriplePlay =
        ab.resultCode === "double_play" ||
        ab.resultCode === "triple_play" ||
        ((ab.resultCode === "flyout" || ab.resultCode === "infield_fly") &&
          playOutCellKeys.length >= 2) ||
        (ab.resultCode === "groundout" &&
          playOutCellKeys.length >= 2 &&
          /[1-9]-[1-9]-[1-9]/.test(ab.battedDirection || ""));

      if (isGenuineDoubleOrTriplePlay) {
        const resolvedOutCellKeys = [...playOutCellKeys];
        if (
          resolvedOutCellKeys.length === 1 &&
          (ab.resultCode === "double_play" ||
            ab.resultCode === "triple_play" ||
            ab.outsInPlay >= 2)
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

        const extraMove = snap.batterSummary.extraExplicitMove;
        if (extraMove) {
          if (!extraMove.isOut && extraMove.method === "steal") {
            addStealToRunner(
              ab.battingOrder,
              ab.batterPlayerId,
              ab.batterName,
              inn
            );
          } else if (
            (extraMove.isOut && extraMove.method === "steal") ||
            extraMove.method === "caught_stealing"
          ) {
            addCaughtStealingToRunner(
              ab.battingOrder,
              ab.batterPlayerId,
              ab.batterName,
              inn
            );
          }
        }

        if (!snap.batterSummary.isOutOnBases && finalBase === "HP") {
          cell.runScored = true;
          const isBatterRunUnearned =
            snap.batterSummary.effectiveMethod === "error" ||
            snap.batterSummary.effectiveMethod === "pb" ||
            isOriginCellReachedByErrorOrUncharged(cell) ||
            (virtualErrorSavedOuts > 0 &&
              outsTracker + virtualErrorSavedOuts >= 3);
          if (isBatterRunUnearned) {
            cell.isUnearnedRun = true;
            unearnedRunsInPlay += 1;
          }
          innRuns += 1;
          addRunToRunner(
            ab.battingOrder,
            ab.batterPlayerId,
            ab.batterName,
            inn
          );
        }
      }

      // D) 次打席に向けた塁上起点セルの更新 ＆ 投手失点・自責点チャージ記録
      const simRunsInPlay = innRuns - innRunsBeforePlay;
      const resolvedPlayRuns = Math.max(ab.runsInPlay || 0, simRunsInPlay);
      const extraUnmodeledRuns = Math.max(0, resolvedPlayRuns - simRunsInPlay);
      const extraUnearned =
        extraUnmodeledRuns > 0 &&
        (ab.resultCode === "error" ||
          (virtualErrorSavedOuts > 0 &&
            outsTracker + virtualErrorSavedOuts >= 3))
          ? extraUnmodeledRuns
          : 0;
      const resolvedEarnedRuns = Math.max(
        0,
        resolvedPlayRuns - unearnedRunsInPlay - extraUnearned
      );
      const resolvedPlayOuts = Math.max(
        ab.outsInPlay || 0,
        Math.max(0, snap.outsAfter - snap.outsBefore)
      );
      atBatPitcherCharges.set(ab.id, {
        runs: resolvedPlayRuns,
        earnedRuns: resolvedEarnedRuns,
        outs: resolvedPlayOuts,
      });

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
        runsInPlay: resolvedPlayRuns,
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
        // 残塁走者マーク (ℓ) 付与 ＆ 個人残塁 (leftOnBase) 計上
        let lobCount = 0;
        for (const bKey of ["3B", "2B", "1B"] as const) {
          const strandedKey = nextOrigins[bKey];
          const strandedRunner = snap.basesAfterPlay[bKey];
          if (strandedKey && cellsByKey[strandedKey]) {
            cellsByKey[strandedKey].isResidual = true;
            cellsByKey[strandedKey].residualBase = bKey;
            lobCount += 1;
            if (isLastPaOfInning) {
              const lobOrder =
                strandedRunner?.battingOrder ||
                cellsByKey[strandedKey].battingOrder;
              const lobSubIdx = resolveSubRowIdxForPlayer(
                lobOrder,
                strandedRunner?.playerId,
                strandedRunner?.name,
                inn
              );
              applyStatMutation(lobOrder, lobSubIdx, (t) => {
                t.leftOnBase += 1;
              });
            }
          } else if (strandedRunner) {
            lobCount += 1;
            if (isLastPaOfInning && strandedRunner.battingOrder > 0) {
              const lobSubIdx = resolveSubRowIdxForPlayer(
                strandedRunner.battingOrder,
                strandedRunner.playerId,
                strandedRunner.name,
                inn
              );
              applyStatMutation(strandedRunner.battingOrder, lobSubIdx, (t) => {
                t.leftOnBase += 1;
              });
            }
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

  // 3C. 守備回データ（反対ハーフイニング）からの個人守備成績（失策・捕殺・刺殺）集計
  const oppAtBats = defenseContext?.opponentAtBats ?? [];
  const oppPitchers = defenseContext?.opponentStructure?.pitchers ?? [];
  if (oppAtBats.length > 0) {
    const findLineupSlotForPitcher = (
      oppAb: ScorebookV2AtBat
    ): { order: number; subIdx: 0 | 1 | 2 } | null => {
      const cleanAbPitcher = (oppAb.pitcherName || "").replace(/\s+/g, "");
      const matchedStint = oppPitchers.find(
        (st) =>
          (oppAb.pitcherPlayerId &&
            st.playerId &&
            st.playerId === oppAb.pitcherPlayerId) ||
          (cleanAbPitcher &&
            st.name.replace(/\s+/g, "") === cleanAbPitcher)
      );
      const targetPlayerId =
        oppAb.pitcherPlayerId || matchedStint?.playerId || null;
      const targetCleanName =
        cleanAbPitcher &&
        cleanAbPitcher !== "相手投手" &&
        cleanAbPitcher !== "投手" &&
        cleanAbPitcher !== "不明"
          ? cleanAbPitcher
          : (matchedStint?.name || "").replace(/\s+/g, "");

      if (!targetPlayerId && !targetCleanName) return null;

      for (const [order, participants] of slotParticipantsMap) {
        for (const pt of participants) {
          if (
            (targetPlayerId && pt.playerId && pt.playerId === targetPlayerId) ||
            (targetCleanName && pt.cleanName && pt.cleanName === targetCleanName)
          ) {
            return { order, subIdx: pt.subRowIndex };
          }
        }
      }
      return null;
    };

    const oppIndexById = new Map<string, number>();
    const oppLeadOffByInning = new Map<number, number>();
    oppAtBats.forEach((oAb, oIdx) => {
      oppIndexById.set(oAb.id, oIdx);
      if (!oppLeadOffByInning.has(oAb.inning)) {
        oppLeadOffByInning.set(oAb.inning, oAb.battingOrder);
      }
    });

    const isMidInningDefActiveAtOppAtBat = (
      thresholdOrder: number,
      oppAb: ScorebookV2AtBat
    ): boolean => {
      const oppIdx = oppIndexById.get(oppAb.id) ?? -1;
      const cutoffIdx = oppAtBats.findIndex(
        (a) =>
          a.inning === oppAb.inning &&
          a.battingOrder === thresholdOrder
      );
      if (oppIdx !== -1 && cutoffIdx !== -1) {
        return oppIdx >= cutoffIdx;
      }
      const leadOff =
        oppLeadOffByInning.get(oppAb.inning) ?? (oppAb.inning === 1 ? 1 : null);
      const cycle = Math.max(9, oppAb.battingOrder, thresholdOrder);
      if (typeof leadOff === "number" && leadOff >= 1 && leadOff <= cycle) {
        const tOff = (((oppAb.battingOrder - leadOff) % cycle) + cycle) % cycle;
        const thOff = (((thresholdOrder - leadOff) % cycle) + cycle) % cycle;
        return tOff >= thOff;
      }
      return oppAb.battingOrder >= thresholdOrder;
    };

    const resolveFielderAtInning = (
      posCode: string,
      oppAb: ScorebookV2AtBat
    ): { order: number; subIdx: 0 | 1 | 2 } | null => {
      if (posCode === "1") {
        const pitcherTarget = findLineupSlotForPitcher(oppAb);
        if (pitcherTarget) return pitcherTarget;
        // 登板投手がベンチ専任（打順外）で明示されている場合は、旧投手の打順枠へ誤計上しない
        const cleanAbPitcher = (oppAb.pitcherName || "").replace(/\s+/g, "");
        if (
          oppAb.pitcherPlayerId ||
          (cleanAbPitcher &&
            cleanAbPitcher !== "相手投手" &&
            cleanAbPitcher !== "投手" &&
            cleanAbPitcher !== "不明")
        ) {
          return null;
        }
      }

      for (const slot of normalizedSlots) {
        const participants = slotParticipantsMap.get(slot.battingOrder);
        if (!participants || participants.length === 0) continue;

        let activeSubIdx: 0 | 1 | 2 = 0;
        let activePos = participants[0]!.position;
        let hasValidParticipant = Boolean(
          participants[0]!.playerId || participants[0]!.cleanName
        );

        for (let i = 1; i < participants.length; i++) {
          const pt = participants[i]!;
          if (pt.subType === "TR") continue;
          // 後攻チーム（!isTop）の代打・代走はN回裏攻撃から出場するため、N回表の守備にはまだ就いていない
          let effectiveInDefense = isTop
            ? pt.inningEntered <= oppAb.inning
            : pt.subType === "DEF"
            ? pt.inningEntered <= oppAb.inning
            : pt.inningEntered < oppAb.inning;
          if (
            effectiveInDefense &&
            pt.inningEntered === oppAb.inning &&
            pt.subType === "DEF" &&
            typeof pt.enteredFromBatterOrder === "number" &&
            pt.enteredFromBatterOrder >= 1
          ) {
            effectiveInDefense = isMidInningDefActiveAtOppAtBat(
              pt.enteredFromBatterOrder,
              oppAb
            );
          }
          if (effectiveInDefense) {
            activeSubIdx = pt.subRowIndex;
            if (pt.position) activePos = pt.position;
            hasValidParticipant = true;
          }
        }

        if (hasValidParticipant && activePos === posCode) {
          return { order: slot.battingOrder, subIdx: activeSubIdx };
        }
      }
      return null;
    };

    const creditFielderStat = (
      posCode: string,
      oppAb: ScorebookV2AtBat,
      kind: "errors" | "assists" | "putouts"
    ) => {
      const target = resolveFielderAtInning(posCode, oppAb);
      if (!target) return;
      applyStatMutation(target.order, target.subIdx, (t) => {
        t[kind] += 1;
      });
    };

    for (const oppAb of oppAtBats) {
      const rawDir = (oppAb.battedDirection || "").trim().toUpperCase();
      const rc = oppAb.resultCode;

      // 1) 失策（"6E"・"E6"・"4E-3"・単独守備番号＋error）
      const errorPosMatches = Array.from(
        rawDir.matchAll(/([1-9])E|E([1-9])/g)
      );
      if (errorPosMatches.length > 0) {
        for (const m of errorPosMatches) {
          const pos = m[1] || m[2];
          if (pos) creditFielderStat(pos, oppAb, "errors");
        }
      } else if (rc === "error") {
        const singlePos = rawDir.match(/^([1-9])/);
        if (singlePos && singlePos[1]) {
          creditFielderStat(singlePos[1], oppAb, "errors");
        }
      }

      // 2) 刺殺・捕殺
      const outsRecorded = Math.max(0, oppAb.outsInPlay || 0);
      if (outsRecorded <= 0) continue;

      if (rc === "strikeout" || rc === "dropped_third_strike_out") {
        const chainMatch = rawDir.match(/([1-9])-([1-9])/);
        if (chainMatch && chainMatch[1] && chainMatch[2]) {
          creditFielderStat(chainMatch[1], oppAb, "assists");
          creditFielderStat(chainMatch[2], oppAb, "putouts");
        } else {
          creditFielderStat("2", oppAb, "putouts");
        }
        continue;
      }

      if (rawDir.includes("E")) continue;
      const segments = rawDir
        .split("-")
        .map((seg) => seg.replace(/[^1-9]/g, ""))
        .filter((seg) => seg.length === 1);

      if (segments.length >= 2) {
        const finalPos = segments[segments.length - 1]!;
        creditFielderStat(finalPos, oppAb, "putouts");

        if (outsRecorded >= 2) {
          const dpPivotPos =
            segments.length >= 3
              ? segments[segments.length - 2]!
              : segments[0]!;
          creditFielderStat(dpPivotPos, oppAb, "putouts");
        }
        if (outsRecorded >= 3 && segments.length >= 3) {
          creditFielderStat(segments[segments.length - 3]!, oppAb, "putouts");
        }

        const creditedAssistPositions = new Set<string>();
        for (let i = 0; i < segments.length - 1; i++) {
          const aPos = segments[i]!;
          if (segments.length === 2 && aPos === finalPos) continue;
          if (creditedAssistPositions.has(aPos)) continue;
          creditedAssistPositions.add(aPos);
          creditFielderStat(aPos, oppAb, "assists");
        }
      } else if (
        segments.length === 1 &&
        (rc === "flyout" ||
          rc === "infield_fly" ||
          rc === "sac_fly" ||
          rc === "groundout" ||
          rc === "sac_bunt" ||
          rc === "double_play" ||
          rc === "triple_play" ||
          rc === "interference_out")
      ) {
        creditFielderStat(segments[0]!, oppAb, "putouts");
      }
    }
  }

  // 4. 相手（守備側）投手ごとの登板成績集計（空表示の8・9回枠ではなく実プレイ最終回を上限とする）
  const { pitcherRows, pitcherTotals } = compilePitcherRows(
    structure.pitchers,
    atBats,
    Math.max(1, maxPlayedInning),
    atBatPitcherCharges
  );

  const batterRows = normalizedSlots.map((s) => {
    const row = batterStatsMap.get(s.battingOrder)!;
    row.avg = formatBattingAvg(row.hits, row.atBats);
    for (const sr of row.subRows) {
      sr.avg = formatBattingAvg(sr.hits, sr.atBats);
    }
    return row;
  });

  const totalPa = batterRows.reduce((s, r) => s + r.plateAppearances, 0);
  const totalAb = batterRows.reduce((s, r) => s + r.atBats, 0);
  const totalHits = batterRows.reduce((s, r) => s + r.hits, 0);
  const totalSingles = batterRows.reduce((s, r) => s + r.singles, 0);
  const totalDoubles = batterRows.reduce((s, r) => s + r.doubles, 0);
  const totalTriples = batterRows.reduce((s, r) => s + r.triples, 0);
  const totalHomeRuns = batterRows.reduce((s, r) => s + r.homeRuns, 0);
  const totalRbi = batterRows.reduce((s, r) => s + r.rbi, 0);
  const computedRuns = inningSummaries.reduce((s, i) => s + i.runs, 0);
  const totalRuns = Math.max(
    batterRows.reduce((s, r) => s + r.runs, 0),
    structure.totalRuns || 0,
    computedRuns
  );
  const totalWalks = batterRows.reduce((s, r) => s + r.walks, 0);
  const totalHbp = batterRows.reduce((s, r) => s + r.hitByPitch, 0);
  const totalWalksHbp = batterRows.reduce((s, r) => s + r.walksHbp, 0);
  const totalSo = batterRows.reduce((s, r) => s + r.strikeouts, 0);
  const totalSacBunts = batterRows.reduce((s, r) => s + r.sacBunts, 0);
  const totalSacFlies = batterRows.reduce((s, r) => s + r.sacFlies, 0);
  const totalSb = batterRows.reduce((s, r) => s + r.stolenBases, 0);
  const totalCs = batterRows.reduce((s, r) => s + r.caughtStealing, 0);
  const totalLob = Math.max(
    batterRows.reduce((s, r) => s + r.leftOnBase, 0),
    inningSummaries.reduce((s, i) => s + i.leftOnBase, 0)
  );
  const totalDp = batterRows.reduce((s, r) => s + r.doublePlays, 0);
  const totalOwnErrors = batterRows.reduce((s, r) => s + r.errors, 0);
  const totalAssists = batterRows.reduce((s, r) => s + r.assists, 0);
  const totalPutouts = batterRows.reduce((s, r) => s + r.putouts, 0);
  const totalOpponentErrors = Math.max(
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
      singles: totalSingles,
      doubles: totalDoubles,
      triples: totalTriples,
      homeRuns: totalHomeRuns,
      rbi: totalRbi,
      runs: totalRuns,
      walks: totalWalks,
      hitByPitch: totalHbp,
      walksHbp: totalWalksHbp,
      strikeouts: totalSo,
      sacBunts: totalSacBunts,
      sacFlies: totalSacFlies,
      stolenBases: totalSb,
      caughtStealing: totalCs,
      leftOnBase: totalLob,
      doublePlays: totalDp,
      errors: totalOwnErrors,
      assists: totalAssists,
      putouts: totalPutouts,
      avg: formatBattingAvg(totalHits, totalAb),
      opponentErrors: totalOpponentErrors,
    },
    pitcherRows,
    pitcherTotals,
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
  maxInning: number,
  atBatPitcherCharges: Map<
    string,
    { runs: number; earnedRuns: number; outs: number }
  >
): {
  pitcherRows: CompiledPitcherRowStats[];
  pitcherTotals: CompiledPitcherTotals;
} {
  interface MutablePitcherAcc {
    order: number;
    playerId: string | null;
    name: string;
    uniformNumber: string;
    fromInning: number;
    toInning: number;
    outsRecorded: number;
    pitchesCount: number;
    battersFaced: number;
    hitsAllowed: number;
    homeRunsAllowed: number;
    sacBuntsAllowed: number;
    sacFliesAllowed: number;
    strikeouts: number;
    walks: number;
    hitByPitch: number;
    walksHbp: number;
    wildPitches: number;
    balks: number;
    runsAllowed: number;
    earnedRuns: number;
  }

  const createEmptyAcc = (
    order: number,
    playerId: string | null,
    name: string,
    uniformNumber: string,
    fromInning: number,
    toInning: number
  ): MutablePitcherAcc => ({
    order,
    playerId,
    name,
    uniformNumber,
    fromInning,
    toInning,
    outsRecorded: 0,
    pitchesCount: 0,
    battersFaced: 0,
    hitsAllowed: 0,
    homeRunsAllowed: 0,
    sacBuntsAllowed: 0,
    sacFliesAllowed: 0,
    strikeouts: 0,
    walks: 0,
    hitByPitch: 0,
    walksHbp: 0,
    wildPitches: 0,
    balks: 0,
    runsAllowed: 0,
    earnedRuns: 0,
  });

  const accList: MutablePitcherAcc[] = stints.map((st, idx) =>
    createEmptyAcc(
      st.order || idx + 1,
      st.playerId || null,
      st.name || `投手 ${idx + 1}`,
      st.uniformNumber || "",
      st.fromInning || 1,
      st.toInning || maxInning
    )
  );

  const findOrCreatePitcher = (ab: ScorebookV2AtBat): MutablePitcherAcc => {
    if (ab.pitcherPlayerId) {
      const byId = accList.find((p) => p.playerId === ab.pitcherPlayerId);
      if (byId) {
        byId.fromInning = Math.min(byId.fromInning, ab.inning);
        byId.toInning = Math.max(byId.toInning, ab.inning);
        return byId;
      }
    }
    const pName = (ab.pitcherName || "").trim();
    if (pName) {
      const exact = accList.find(
        (p) => p.name.replace(/\s+/g, "") === pName.replace(/\s+/g, "")
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
      return accList[accList.length - 1]!;
    }

    const created = createEmptyAcc(
      accList.length + 1,
      ab.pitcherPlayerId || null,
      pName || "相手投手",
      "",
      ab.inning,
      ab.inning
    );
    accList.push(created);
    return created;
  };

  for (const ab of atBats) {
    const target = findOrCreatePitcher(ab);
    const charge = atBatPitcherCharges.get(ab.id);

    if (ab.resultCode !== "other") {
      target.battersFaced += 1;
    }

    target.outsRecorded += charge
      ? charge.outs
      : Math.max(0, ab.outsInPlay || 0);

    const realPitchCount = ab.pitches.filter(
      (p) => !isNonPitchMoundEvent(p)
    ).length;
    const countFromBallsStrikes = Math.max(
      0,
      (ab.balls || 0) + (ab.strikes || 0)
    );
    target.pitchesCount +=
      realPitchCount > 0 ? realPitchCount : countFromBallsStrikes;

    if (getHitBasesForResult(ab.resultCode) > 0) {
      target.hitsAllowed += 1;
    }
    if (ab.resultCode === "home_run") {
      target.homeRunsAllowed += 1;
    }
    if (ab.resultCode === "sac_bunt") {
      target.sacBuntsAllowed += 1;
    } else if (ab.resultCode === "sac_fly") {
      target.sacFliesAllowed += 1;
    }
    if (isStrikeoutResult(ab.resultCode)) {
      target.strikeouts += 1;
    }
    if (ab.resultCode === "walk" || ab.resultCode === "intentional_walk") {
      target.walks += 1;
      target.walksHbp += 1;
    } else if (ab.resultCode === "hit_by_pitch") {
      target.hitByPitch += 1;
      target.walksHbp += 1;
    }

    // 暴投（同一打席・同一投球での複数走者進塁は1回として計上）
    const wpKeys = new Set<string>();
    for (const adv of ab.advances) {
      if (adv.method === "wp") {
        wpKeys.add(
          typeof adv.pitchNumber === "number" ? `p:${adv.pitchNumber}` : "ab"
        );
      }
    }
    target.wildPitches += wpKeys.size;

    // ボーク（投球配列の balk を優先し、未記録時のみ進塁記録から重複除外計上）
    const pitchBalkCount = ab.pitches.filter((p) => p === "balk").length;
    if (pitchBalkCount > 0) {
      target.balks += pitchBalkCount;
    } else {
      const balkKeys = new Set<string>();
      for (const adv of ab.advances) {
        if (adv.method === "balk") {
          balkKeys.add(
            typeof adv.pitchNumber === "number" ? `p:${adv.pitchNumber}` : "ab"
          );
        }
      }
      target.balks += balkKeys.size;
    }

    const fallbackRuns = Math.max(0, ab.runsInPlay || 0);
    const runsToAdd = charge ? charge.runs : fallbackRuns;
    const earnedToAdd = charge
      ? charge.earnedRuns
      : ab.resultCode === "error"
      ? 0
      : fallbackRuns;
    target.runsAllowed += runsToAdd;
    target.earnedRuns += earnedToAdd;
  }

  const pitcherRows: CompiledPitcherRowStats[] = accList
    .filter((p) => p.battersFaced > 0 || p.outsRecorded > 0 || accList.length === 1)
    .map((p, idx) => ({
      order: idx + 1,
      name: p.name,
      uniformNumber: p.uniformNumber,
      fromInning: p.fromInning,
      toInning: p.toInning,
      outsRecorded: p.outsRecorded,
      ipDisplay: formatOutsToIp(p.outsRecorded),
      pitchesCount: p.pitchesCount,
      battersFaced: p.battersFaced,
      hitsAllowed: p.hitsAllowed,
      homeRunsAllowed: p.homeRunsAllowed,
      sacBuntsAllowed: p.sacBuntsAllowed,
      sacFliesAllowed: p.sacFliesAllowed,
      strikeouts: p.strikeouts,
      walks: p.walks,
      hitByPitch: p.hitByPitch,
      walksHbp: p.walksHbp,
      wildPitches: p.wildPitches,
      balks: p.balks,
      runsAllowed: p.runsAllowed,
      earnedRuns: p.earnedRuns,
      eraDisplay: formatRegulationEra(p.earnedRuns, p.outsRecorded),
    }));

  const totOuts = pitcherRows.reduce((s, p) => s + p.outsRecorded, 0);
  const totEarned = pitcherRows.reduce((s, p) => s + p.earnedRuns, 0);
  const pitcherTotals: CompiledPitcherTotals = {
    outsRecorded: totOuts,
    ipDisplay: formatOutsToIp(totOuts),
    pitchesCount: pitcherRows.reduce((s, p) => s + p.pitchesCount, 0),
    battersFaced: pitcherRows.reduce((s, p) => s + p.battersFaced, 0),
    hitsAllowed: pitcherRows.reduce((s, p) => s + p.hitsAllowed, 0),
    homeRunsAllowed: pitcherRows.reduce((s, p) => s + p.homeRunsAllowed, 0),
    sacBuntsAllowed: pitcherRows.reduce((s, p) => s + p.sacBuntsAllowed, 0),
    sacFliesAllowed: pitcherRows.reduce((s, p) => s + p.sacFliesAllowed, 0),
    strikeouts: pitcherRows.reduce((s, p) => s + p.strikeouts, 0),
    walks: pitcherRows.reduce((s, p) => s + p.walks, 0),
    hitByPitch: pitcherRows.reduce((s, p) => s + p.hitByPitch, 0),
    walksHbp: pitcherRows.reduce((s, p) => s + p.walksHbp, 0),
    wildPitches: pitcherRows.reduce((s, p) => s + p.wildPitches, 0),
    balks: pitcherRows.reduce((s, p) => s + p.balks, 0),
    runsAllowed: pitcherRows.reduce((s, p) => s + p.runsAllowed, 0),
    earnedRuns: totEarned,
    eraDisplay: formatRegulationEra(totEarned, totOuts),
  };

  return { pitcherRows, pitcherTotals };
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
