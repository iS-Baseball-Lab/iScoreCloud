// filepath: src/lib/liff/scorebook-runners.ts
import {
  type AdvanceMethodCode,
  type CanonicalAtBatResult,
  type ScorebookSheetStructure,
  type ScorebookV2Advance,
  type ScorebookV2AtBat,
} from "@/types/scorebook-v2";

export type OccupiedBaseKey = "1B" | "2B" | "3B";

export interface RunnerOnBase {
  battingOrder: number;
  name: string;
  playerId: string | null;
}

export interface BaseRunnerMap {
  "1B": RunnerOnBase | null;
  "2B": RunnerOnBase | null;
  "3B": RunnerOnBase | null;
}

export interface EffectiveRunnerMove {
  explicitAdvanceId: string | null;
  runnerOrder: number;
  runnerName: string;
  runnerPlayerId: string | null;
  from: "BAT" | "1B" | "2B" | "3B";
  to: "1B" | "2B" | "3B" | "HP";
  method: AdvanceMethodCode;
  isOut: boolean;
  isImplicit: boolean;
  pitchNumber?: number;
}

export interface PrecedingRunnerSummary {
  startBase: OccupiedBaseKey;
  runner: RunnerOnBase;
  /** 投球間（盗塁・暴投・捕逸・ボーク・牽制死等）の明示的イベント */
  prePlayMoves: ScorebookV2Advance[];
  /** インプレー打球時点の所在塁（投球間アウト時は null、本塁生還済時は "HP"） */
  baseAtInPlay: OccupiedBaseKey | "HP" | null;
  isOutPrePlay: boolean;
  /** インプレーでの明示的 ScorebookV2Advance（未登録なら null） */
  inPlayExplicitMove: ScorebookV2Advance | null;
  /** 打席終了時点の最終到達塁（アウト時はアウトになった塁） */
  finalBase: OccupiedBaseKey | "HP";
  isOut: boolean;
  effectiveMethod: AdvanceMethodCode;
  isImplicit: boolean;
  /** 打者出塁・押し出し等により物理的に残留できない塁 */
  blockedHoldBases: OccupiedBaseKey[];
}

export interface BatterRunnerSummary {
  initialBase: OccupiedBaseKey | "HP" | null;
  extraExplicitMove: ScorebookV2Advance | null;
  finalBase: OccupiedBaseKey | "HP" | null;
  isOutOnBases: boolean;
  effectiveMethod: AdvanceMethodCode;
}

export interface AtBatRunnerSnapshot {
  atBatId: string;
  inning: number;
  outsBefore: number;
  outsAfter: number;
  basesBefore: BaseRunnerMap;
  basesAfterPlay: BaseRunnerMap;
  basesForNextBatter: BaseRunnerMap;
  isInningOver: boolean;
  precedingRunners: PrecedingRunnerSummary[];
  precedingRunnerMoves: EffectiveRunnerMove[];
  batterSummary: BatterRunnerSummary;
}

const PRE_PLAY_METHODS: ReadonlySet<AdvanceMethodCode> = new Set([
  "steal",
  "caught_stealing",
  "pickoff_out",
  "pickoff_error",
  "wp",
  "pb",
  "balk",
  "appeal_out",
]);

const RBI_ELIGIBLE_METHODS: ReadonlySet<AdvanceMethodCode> = new Set([
  "hit",
  "sac",
  "walk",
  "fc",
]);

export function isPrePlayAdvanceMethod(method: AdvanceMethodCode): boolean {
  return PRE_PLAY_METHODS.has(method);
}

export function createEmptyBaseMap(): BaseRunnerMap {
  return {
    "1B": null,
    "2B": null,
    "3B": null,
  };
}

export function cloneBaseMap(src: BaseRunnerMap): BaseRunnerMap {
  return {
    "1B": src["1B"] ? { ...src["1B"] } : null,
    "2B": src["2B"] ? { ...src["2B"] } : null,
    "3B": src["3B"] ? { ...src["3B"] } : null,
  };
}

export function countOccupiedBases(bases: BaseRunnerMap): number {
  return (
    (bases["1B"] ? 1 : 0) + (bases["2B"] ? 1 : 0) + (bases["3B"] ? 1 : 0)
  );
}

export function formatBaseSituationLabel(bases: BaseRunnerMap): string {
  const b1 = Boolean(bases["1B"]);
  const b2 = Boolean(bases["2B"]);
  const b3 = Boolean(bases["3B"]);

  if (b1 && b2 && b3) return "満塁";
  if (b2 && b3) return "二・三塁";
  if (b1 && b3) return "一・三塁";
  if (b1 && b2) return "一・二塁";
  if (b3) return "三塁";
  if (b2) return "二塁";
  if (b1) return "一塁";
  return "走者なし";
}

export function formatOutsLabel(outs: number): string {
  if (outs <= 0) return "無死";
  if (outs >= 3) return "3死";
  return `${outs}死`;
}

export function formatOutsAndBasesLabel(
  outs: number,
  bases: BaseRunnerMap,
  isInningOver = false
): string {
  if (isInningOver || outs >= 3) {
    return "3死チェンジ";
  }
  return `${formatOutsLabel(outs)} ${formatBaseSituationLabel(bases)}`;
}

export function formatRunnerBadgeName(runner: RunnerOnBase): string {
  const cleanName = (runner.name || "").trim();
  if (runner.battingOrder > 0 && cleanName) {
    return `${runner.battingOrder}.${cleanName}`;
  }
  if (cleanName) return cleanName;
  if (runner.battingOrder > 0) return `${runner.battingOrder}番`;
  return "走者";
}

export function formatOccupiedRunnersShort(bases: BaseRunnerMap): string {
  const parts: string[] = [];
  if (bases["3B"]) parts.push(`3塁:${formatRunnerBadgeName(bases["3B"])}`);
  if (bases["2B"]) parts.push(`2塁:${formatRunnerBadgeName(bases["2B"])}`);
  if (bases["1B"]) parts.push(`1塁:${formatRunnerBadgeName(bases["1B"])}`);
  return parts.join(" / ");
}

export function formatBaseJa(base: "BAT" | "1B" | "2B" | "3B" | "HP"): string {
  switch (base) {
    case "BAT":
      return "打者";
    case "1B":
      return "1塁";
    case "2B":
      return "2塁";
    case "3B":
      return "3塁";
    case "HP":
      return "本塁";
  }
}

/**
 * 本塁に近い走者を先頭に並べるための優先度スコア（HP > 3B > 2B > 1B > BAT）
 */
export function getBaseClosestToHomeRank(
  base: "BAT" | OccupiedBaseKey | "HP" | null | undefined
): number {
  switch (base) {
    case "HP":
      return 5;
    case "3B":
      return 4;
    case "2B":
      return 3;
    case "1B":
      return 2;
    case "BAT":
      return 1;
    default:
      return 0;
  }
}

/**
 * 塁上の先行走者リストを「ホームに最も近い走者順（3塁走者 ➔ 2塁走者 ➔ 1塁走者）」に安定ソートする
 */
export function sortPrecedingRunnersClosestToHomeFirst<
  T extends {
    startBase: OccupiedBaseKey;
    baseAtInPlay?: OccupiedBaseKey | "HP" | null;
  }
>(runners: readonly T[]): T[] {
  return [...runners].sort((a, b) => {
    const aActive = a.baseAtInPlay ?? a.startBase;
    const bActive = b.baseAtInPlay ?? b.startBase;
    const activeDiff =
      getBaseClosestToHomeRank(bActive) - getBaseClosestToHomeRank(aActive);
    if (activeDiff !== 0) return activeDiff;
    return (
      getBaseClosestToHomeRank(b.startBase) -
      getBaseClosestToHomeRank(a.startBase)
    );
  });
}

/**
 * 進塁・走塁記録（advances）を「ホームに近い走者順（3塁走者 ➔ 2塁走者 ➔ 1塁走者 ➔ 打者走者）」に整列する。
 * 同一走者が投球間進塁（例: 1B→2B 盗塁）の後にインプレー進塁（2B→HP 安打）している場合は、
 * その走者グループ内で時系列順（投球間 ➔ インプレー）を維持する。
 */
export function sortAdvancesClosestToHomeFirst(
  advances: readonly ScorebookV2Advance[]
): ScorebookV2Advance[] {
  if (advances.length <= 1) return [...advances];

  const isSameRunnerSecondStep = (
    prevAdv: ScorebookV2Advance,
    curAdv: ScorebookV2Advance
  ): boolean => {
    if (prevAdv.id === curAdv.id) return false;
    if (prevAdv.from === "BAT" || curAdv.from === "BAT") return false;
    if (
      prevAdv.isOut ||
      prevAdv.method === "tiebreak" ||
      (!prevAdv.isOut && prevAdv.from === prevAdv.to)
    ) {
      return false;
    }
    if (prevAdv.to !== curAdv.from) return false;

    const pName = prevAdv.runnerName.replace(/\s+/g, "").trim();
    const cName = curAdv.runnerName.replace(/\s+/g, "").trim();
    if (pName && cName) {
      return pName === cName || pName.includes(cName) || cName.includes(pName);
    }
    return (
      isPrePlayAdvanceMethod(prevAdv.method) &&
      !isPrePlayAdvanceMethod(curAdv.method)
    );
  };

  const resolveOriginRank = (
    adv: ScorebookV2Advance,
    visited: Set<string>
  ): number => {
    if (adv.from === "BAT") return 1;
    visited.add(adv.id);
    for (const cand of advances) {
      if (visited.has(cand.id)) continue;
      if (isSameRunnerSecondStep(cand, adv)) {
        return resolveOriginRank(cand, visited);
      }
    }
    return getBaseClosestToHomeRank(adv.from);
  };

  const indexed = advances.map((adv, idx) => {
    const originRank = resolveOriginRank(adv, new Set<string>());
    const phase =
      adv.method === "tiebreak"
        ? 0
        : isPrePlayAdvanceMethod(adv.method)
        ? 1
        : 2;
    return {
      adv,
      idx,
      originRank,
      phase,
      fromRank: getBaseClosestToHomeRank(adv.from),
      toRank: getBaseClosestToHomeRank(adv.to),
    };
  });

  indexed.sort((a, b) => {
    // 1. ホームに近い走者（3B=4 > 2B=3 > 1B=2 > BAT=1）を最優先で上位へ
    if (b.originRank !== a.originRank) {
      return b.originRank - a.originRank;
    }
    // 2. 同一走者の複数進塁はタイブレーク ➔ 投球間 ➔ インプレーの時系列順
    if (a.phase !== b.phase) {
      return a.phase - b.phase;
    }
    // 3. 同一走者・同フェーズで 1B→2B ➔ 2B→3B のような連続移動は開始塁昇順
    if (a.fromRank !== b.fromRank) {
      return a.fromRank - b.fromRank;
    }
    // 4. 到達塁がよりホームに近いものを優先
    if (b.toRank !== a.toRank) {
      return b.toRank - a.toRank;
    }
    return a.idx - b.idx;
  });

  return indexed.map((item) => item.adv);
}

/**
 * ゴロ表記であっても二封・三封・本封（先行走者フォースアウトで打者1塁残り）かどうかを判定する
 */
export function isForceOutGroundout(
  resultCode: CanonicalAtBatResult,
  battedDirection?: string | null,
  resultLabel?: string | null
): boolean {
  if (resultCode !== "groundout") return false;
  const dir = (battedDirection || "").trim();
  const label = (resultLabel || "").trim();
  if (/^[1-9]-[2456]$/.test(dir)) return true;
  if (/二封|三封|本封|封殺/.test(label)) return true;
  return false;
}

/**
 * 打撃結果コード単体から、打者自身が到達する基本塁を返す（凡退時は null）
 */
export function getBatterInitialSafeBase(
  ab: Pick<
    ScorebookV2AtBat,
    "resultCode" | "battedDirection" | "resultLabel" | "outsInPlay"
  >,
  hasRunnerForceOut = false
): OccupiedBaseKey | "HP" | null {
  switch (ab.resultCode) {
    case "home_run":
      return "HP";
    case "triple":
      return "3B";
    case "double":
      return "2B";
    case "single":
    case "walk":
    case "intentional_walk":
    case "hit_by_pitch":
    case "interference":
    case "dropped_third_strike":
    case "error":
    case "fc":
      return "1B";
    case "groundout":
      if (
        isForceOutGroundout(
          ab.resultCode,
          ab.battedDirection,
          ab.resultLabel
        ) ||
        (hasRunnerForceOut && ab.outsInPlay === 1)
      ) {
        return "1B";
      }
      return null;
    default:
      return null;
  }
}

export function isIntrinsicBatterOutResult(
  resultCode: CanonicalAtBatResult,
  battedDirection?: string | null,
  resultLabel?: string | null
): boolean {
  if (isForceOutGroundout(resultCode, battedDirection, resultLabel)) {
    return false;
  }
  return (
    resultCode === "groundout" ||
    resultCode === "flyout" ||
    resultCode === "infield_fly" ||
    resultCode === "strikeout" ||
    resultCode === "dropped_third_strike_out" ||
    resultCode === "sac_bunt" ||
    resultCode === "sac_fly" ||
    resultCode === "interference_out" ||
    resultCode === "double_play" ||
    resultCode === "triple_play"
  );
}

export function getDefaultInPlayMethodForResult(
  resultCode: CanonicalAtBatResult,
  isOut = false
): AdvanceMethodCode {
  if (isOut) {
    if (
      resultCode === "fc" ||
      resultCode === "double_play" ||
      resultCode === "triple_play" ||
      resultCode === "groundout"
    ) {
      return "fc";
    }
    if (resultCode === "other") {
      return "caught_stealing";
    }
    return "out_on_base";
  }

  switch (resultCode) {
    case "walk":
    case "intentional_walk":
    case "hit_by_pitch":
    case "interference":
      return "walk";
    case "sac_bunt":
    case "sac_fly":
      return "sac";
    case "error":
      return "error";
    case "fc":
      return "fc";
    default:
      return "hit";
  }
}

function resolveRunnerFromStructureByName(
  rawName: string,
  inning: number,
  structure?: ScorebookSheetStructure | null
): RunnerOnBase {
  const trimmed = rawName.trim();
  if (!structure || !trimmed) {
    return { battingOrder: 0, name: trimmed || "走者", playerId: null };
  }

  for (const slot of structure.batters) {
    if (slot.name && (slot.name === trimmed || slot.name.includes(trimmed) || trimmed.includes(slot.name))) {
      // 代走(PR)がそのイニングで出ていれば反映
      const activePr = slot.substitutions
        .filter((s) => s.subType === "PR" && s.inningEntered <= inning && s.name.trim() !== "")
        .sort((a, b) => a.inningEntered - b.inningEntered);
      if (activePr.length > 0) {
        const pr = activePr[activePr.length - 1];
        return {
          battingOrder: slot.battingOrder,
          name: pr.name,
          playerId: pr.playerId,
        };
      }
      return {
        battingOrder: slot.battingOrder,
        name: slot.name,
        playerId: slot.playerId,
      };
    }
    for (const sub of slot.substitutions) {
      if (sub.name && (sub.name === trimmed || sub.name.includes(trimmed) || trimmed.includes(sub.name))) {
        return {
          battingOrder: slot.battingOrder,
          name: sub.name,
          playerId: sub.playerId,
        };
      }
    }
  }

  return { battingOrder: 0, name: trimmed, playerId: null };
}

function resolveBatterRunnerIdentity(
  ab: ScorebookV2AtBat,
  structure?: ScorebookSheetStructure | null
): RunnerOnBase {
  if (structure) {
    const slot = structure.batters.find((b) => b.battingOrder === ab.battingOrder);
    if (slot) {
      // 同じイニングまたはそれ以前に代走(PR)が登録されている場合も考慮（まずは打者本人をセット）
      const cleanBatter = (ab.batterName || slot.name || "").trim();
      return {
        battingOrder: ab.battingOrder,
        name: cleanBatter,
        playerId: ab.batterPlayerId || slot.playerId || null,
      };
    }
  }
  return {
    battingOrder: ab.battingOrder,
    name: (ab.batterName || "").trim(),
    playerId: ab.batterPlayerId || null,
  };
}

interface InternalTrackedRunner {
  startBase: OccupiedBaseKey;
  runner: RunnerOnBase;
  prePlayMoves: ScorebookV2Advance[];
  currentBase: OccupiedBaseKey | "HP" | null;
  isOutPrePlay: boolean;
  inPlayExplicitMove: ScorebookV2Advance | null;
  finalBase: OccupiedBaseKey | "HP";
  isOut: boolean;
  effectiveMethod: AdvanceMethodCode;
  isImplicit: boolean;
}

function isNoOpHoldAdvance(adv: ScorebookV2Advance): boolean {
  return (
    !adv.isOut &&
    adv.from !== "BAT" &&
    adv.from === adv.to &&
    adv.method !== "tiebreak"
  );
}

function namesLikelyMatch(a: string, b: string): boolean {
  const ca = a.replace(/\s+/g, "").trim();
  const cb = b.replace(/\s+/g, "").trim();
  if (!ca || !cb) return false;
  return ca === cb || ca.includes(cb) || cb.includes(ca);
}

function computeBlockedHoldBasesForRunner(
  inPlayBase: OccupiedBaseKey | "HP" | null,
  batterBase: OccupiedBaseKey | "HP" | null,
  ab: ScorebookV2AtBat,
  basesAtInPlay: BaseRunnerMap
): OccupiedBaseKey[] {
  if (!inPlayBase || inPlayBase === "HP") return [];

  if (
    ab.resultCode === "home_run" ||
    ab.resultCode === "triple" ||
    batterBase === "HP" ||
    batterBase === "3B"
  ) {
    return ["1B", "2B", "3B"];
  }
  if (ab.resultCode === "double" || batterBase === "2B") {
    return ["1B", "2B"];
  }

  const isAwardedFirst =
    ab.resultCode === "walk" ||
    ab.resultCode === "intentional_walk" ||
    ab.resultCode === "hit_by_pitch" ||
    ab.resultCode === "interference";

  if (isAwardedFirst) {
    const has1B = Boolean(basesAtInPlay["1B"]);
    const has2B = Boolean(basesAtInPlay["2B"]);
    const has3B = Boolean(basesAtInPlay["3B"]);
    if (inPlayBase === "1B") return ["1B"];
    if (inPlayBase === "2B" && has1B) return ["1B", "2B"];
    if (inPlayBase === "3B" && has1B && has2B && has3B) {
      return ["1B", "2B", "3B"];
    }
    return [];
  }

  if (batterBase === "1B") {
    if (inPlayBase === "1B") return ["1B"];
    if (inPlayBase === "2B" && Boolean(basesAtInPlay["1B"])) {
      // 1塁走者がアウトになっていない限り2塁も押し出される可能性が高いが、1塁は常に不可
      return ["1B"];
    }
  }

  return [];
}

/**
 * 1シート（表または裏）の全打席をイニングごとに時系列シミュレーションし、
 * 各打席の「開始前走者」「終了後走者」「先行走者ごとの明示/自動進塁状態」を算出する
 */
export function simulateSheetRunners(
  atBats: ScorebookV2AtBat[],
  structure?: ScorebookSheetStructure | null
): Map<string, AtBatRunnerSnapshot> {
  const resultMap = new Map<string, AtBatRunnerSnapshot>();
  if (atBats.length === 0) return resultMap;

  const byInning = new Map<number, ScorebookV2AtBat[]>();
  for (const ab of atBats) {
    const inn = Math.max(1, ab.inning || 1);
    const list = byInning.get(inn) || [];
    list.push(ab);
    byInning.set(inn, list);
  }

  const sortedInnings = Array.from(byInning.keys()).sort((a, b) => a - b);

  for (const inning of sortedInnings) {
    const inningAtBats = byInning.get(inning) || [];
    let outs = 0;
    let currentBases = createEmptyBaseMap();
    const retiredOrScoredOrders = new Set<number>();
    const retiredOrScoredNames = new Set<string>();

    const isRunnerAlreadyRetiredOrScored = (
      order: number,
      rawName: string
    ): boolean => {
      if (order > 0 && retiredOrScoredOrders.has(order)) {
        return true;
      }
      const clean = rawName.replace(/\s+/g, "").trim();
      if (!clean) return false;
      for (const prevName of retiredOrScoredNames) {
        if (namesLikelyMatch(clean, prevName)) {
          return true;
        }
      }
      return false;
    };

    for (let abIdx = 0; abIdx < inningAtBats.length; abIdx++) {
      const ab = inningAtBats[abIdx];
      if (outs >= 3) {
        // 万一3アウト超過データがまだ残っている場合の安全リセットガード
        currentBases = createEmptyBaseMap();
        retiredOrScoredOrders.clear();
        retiredOrScoredNames.clear();
      }

      const outsBefore = Math.min(3, outs);
      const basesBefore = cloneBaseMap(currentBases);

      // タイブレーク走者設定 (method === "tiebreak") があれば打席開始前ベースへ反映
      for (const adv of ab.advances) {
        if (
          adv.method === "tiebreak" &&
          !adv.isOut &&
          (adv.to === "1B" || adv.to === "2B" || adv.to === "3B") &&
          !basesBefore[adv.to]
        ) {
          basesBefore[adv.to] = resolveRunnerFromStructureByName(
            adv.runnerName,
            inning,
            structure
          );
        }
      }

      // 既に塁上にいる走者に代走(PR)が当回入っていれば名前を最新化
      if (structure) {
        for (const bKey of ["3B", "2B", "1B"] as const) {
          const r = basesBefore[bKey];
          if (!r || r.battingOrder <= 0) continue;
          const slot = structure.batters.find(
            (s) => s.battingOrder === r.battingOrder
          );
          if (!slot || slot.substitutions.length === 0) continue;
          const prs = slot.substitutions
            .filter(
              (s) =>
                s.subType === "PR" &&
                s.inningEntered === inning &&
                s.name.trim() !== ""
            )
            .sort((a, b) => a.inningEntered - b.inningEntered);
          if (prs.length > 0) {
            const latestPr = prs[prs.length - 1];
            basesBefore[bKey] = {
              battingOrder: r.battingOrder,
              name: latestPr.name,
              playerId: latestPr.playerId,
            };
          }
        }
      }

      // 先行走者トラッカーを 3B -> 2B -> 1B の順で初期化
      const trackedRunners: InternalTrackedRunner[] = [];
      for (const bKey of ["3B", "2B", "1B"] as const) {
        const r = basesBefore[bKey];
        if (r) {
          trackedRunners.push({
            startBase: bKey,
            runner: { ...r },
            prePlayMoves: [],
            currentBase: bKey,
            isOutPrePlay: false,
            inPlayExplicitMove: null,
            finalBase: bKey,
            isOut: false,
            effectiveMethod: "other",
            isImplicit: false,
          });
        }
      }

      // 明示的 advances（tiebreak以外）のうち先行走者分と打者分を分離
      // ※すでに本イニングの前打席で本塁生還・アウト退場済みの走者名が後続打席に亡霊残存している場合は除外する
      const nonTiebreakAdvances = ab.advances.filter((a) => {
        if (a.method === "tiebreak") return false;
        if (a.from === "BAT") return true;
        const rName = a.runnerName.trim();
        if (!rName) return true;
        const matchesCurrentBaseRunner = trackedRunners.some(
          (tr) =>
            Boolean(tr.runner.name.trim()) &&
            namesLikelyMatch(rName, tr.runner.name)
        );
        if (matchesCurrentBaseRunner) return true;
        if (ab.batterName.trim() && namesLikelyMatch(rName, ab.batterName)) {
          return true;
        }
        const resolved = resolveRunnerFromStructureByName(
          rName,
          inning,
          structure
        );
        if (isRunnerAlreadyRetiredOrScored(resolved.battingOrder, rName)) {
          return false;
        }
        return true;
      });

      // イニング先頭打席（abIdx === 0：途中回からの部分取り込み等）に限り、
      // basesBefore に走者が不在でも明示的に from: "1B"|"2B"|"3B" が登録されていれば仮想先行走者として補完する。
      // ※2打席目以降（abIdx > 0）は前打席終了時点の basesBefore + tiebreak が真の走者状態であり、
      //   生還済み・アウト済み走者の古い進塁行から幽霊走者が復活するのを完全に防ぐ。
      if (abIdx === 0) {
        for (const adv of nonTiebreakAdvances) {
          if (isNoOpHoldAdvance(adv)) continue;
          if (adv.from === "1B" || adv.from === "2B" || adv.from === "3B") {
            const fromBase = adv.from;
            const alreadyTracked = trackedRunners.some(
              (tr) =>
                tr.startBase === fromBase ||
                (adv.runnerName &&
                  namesLikelyMatch(tr.runner.name, adv.runnerName))
            );
            const couldBeSecondStep = trackedRunners.some((tr) =>
              nonTiebreakAdvances.some(
                (prevAdv) =>
                  prevAdv.id !== adv.id &&
                  prevAdv.from === tr.startBase &&
                  prevAdv.to === fromBase &&
                  !prevAdv.isOut
              )
            );
            if (!alreadyTracked && !couldBeSecondStep && !basesBefore[fromBase]) {
              const manualRunner = resolveRunnerFromStructureByName(
                adv.runnerName,
                inning,
                structure
              );
              if (
                !isRunnerAlreadyRetiredOrScored(
                  manualRunner.battingOrder,
                  manualRunner.name
                )
              ) {
                basesBefore[fromBase] = manualRunner;
                trackedRunners.push({
                  startBase: fromBase,
                  runner: manualRunner,
                  prePlayMoves: [],
                  currentBase: fromBase,
                  isOutPrePlay: false,
                  inPlayExplicitMove: null,
                  finalBase: fromBase,
                  isOut: false,
                  effectiveMethod: "other",
                  isImplicit: false,
                });
              }
            }
          }
        }
      }

      // 3B -> 2B -> 1B 順に整列
      const baseRank: Record<OccupiedBaseKey, number> = {
        "3B": 3,
        "2B": 2,
        "1B": 1,
      };
      trackedRunners.sort(
        (a, b) => baseRank[b.startBase] - baseRank[a.startBase]
      );

      const usedAdvIds = new Set<string>();

      const belongsToDifferentActivePerson = (
        advName: string,
        targetRunnerName: string
      ): boolean => {
        const trimmed = advName.trim();
        if (!trimmed) return false;
        if (namesLikelyMatch(trimmed, targetRunnerName)) return false;
        if (
          trackedRunners.some(
            (other) =>
              Boolean(other.runner.name.trim()) &&
              namesLikelyMatch(trimmed, other.runner.name)
          )
        ) {
          return true;
        }
        if (
          ab.batterName.trim() !== "" &&
          namesLikelyMatch(trimmed, ab.batterName)
        ) {
          return true;
        }
        return false;
      };

      // Phase 1: 投球間イベント（盗塁・盗塁死・牽制死・暴投・捕逸・ボーク等）をリード走者優先ウェーブで適用
      const prePlayPool = nonTiebreakAdvances.filter(
        (a) => a.from !== "BAT" && isPrePlayAdvanceMethod(a.method)
      );
      let preWaveSafety = 0;
      while (preWaveSafety < 6) {
        preWaveSafety += 1;
        let matchedAny = false;
        for (const tr of trackedRunners) {
          if (!tr.currentBase || tr.currentBase === "HP" || tr.isOutPrePlay) {
            continue;
          }
          const curBase = tr.currentBase;
          const matchAdv =
            prePlayPool.find(
              (a) =>
                !usedAdvIds.has(a.id) &&
                a.from === curBase &&
                a.runnerName &&
                namesLikelyMatch(a.runnerName, tr.runner.name)
            ) ||
            prePlayPool.find(
              (a) =>
                !usedAdvIds.has(a.id) &&
                a.from === curBase &&
                !belongsToDifferentActivePerson(a.runnerName, tr.runner.name)
            );

          if (matchAdv) {
            usedAdvIds.add(matchAdv.id);
            matchedAny = true;
            tr.prePlayMoves.push(matchAdv);
            tr.effectiveMethod = matchAdv.method;
            if (matchAdv.isOut) {
              tr.isOutPrePlay = true;
              tr.isOut = true;
              tr.finalBase = matchAdv.to;
              tr.currentBase = null;
            } else {
              tr.finalBase = matchAdv.to;
              tr.currentBase = matchAdv.to;
            }
          }
        }
        if (!matchedAny) break;
      }

      // Phase 1-B: 開始塁誤読でも走者名が一致している投球間イベントをフォールバック紐づけ
      for (const tr of trackedRunners) {
        if (!tr.currentBase || tr.currentBase === "HP" || tr.isOutPrePlay) {
          continue;
        }
        const curBase = tr.currentBase;
        const nameFallback = prePlayPool.find(
          (a) =>
            !usedAdvIds.has(a.id) &&
            !isNoOpHoldAdvance(a) &&
            Boolean(a.runnerName.trim()) &&
            namesLikelyMatch(a.runnerName, tr.runner.name) &&
            (a.isOut ||
              a.to === "HP" ||
              getBaseClosestToHomeRank(a.to) > getBaseClosestToHomeRank(curBase))
        );
        if (nameFallback) {
          usedAdvIds.add(nameFallback.id);
          const normalizedPre: ScorebookV2Advance = {
            ...nameFallback,
            from: curBase,
          };
          tr.prePlayMoves.push(normalizedPre);
          tr.effectiveMethod = normalizedPre.method;
          if (normalizedPre.isOut) {
            tr.isOutPrePlay = true;
            tr.isOut = true;
            tr.finalBase = normalizedPre.to;
            tr.currentBase = null;
          } else {
            tr.finalBase = normalizedPre.to;
            tr.currentBase = normalizedPre.to;
          }
        }
      }

      // インプレー開始時点の塁マップを構築
      const basesAtInPlay = createEmptyBaseMap();
      for (const tr of trackedRunners) {
        if (
          !tr.isOutPrePlay &&
          (tr.currentBase === "1B" ||
            tr.currentBase === "2B" ||
            tr.currentBase === "3B")
        ) {
          basesAtInPlay[tr.currentBase] = tr.runner;
        }
      }

      // Phase 2: インプレーでの明示的先行走者イベントをリード走者優先で紐づけ
      const inPlayRunnerPool = nonTiebreakAdvances.filter(
        (a) => a.from !== "BAT" && !usedAdvIds.has(a.id)
      );
      let inPlayWaveSafety = 0;
      while (inPlayWaveSafety < 4) {
        inPlayWaveSafety += 1;
        let matchedAny = false;
        for (const tr of trackedRunners) {
          if (!tr.currentBase || tr.currentBase === "HP" || tr.isOut) {
            continue;
          }
          const curBase = tr.currentBase;
          const matchAdv =
            inPlayRunnerPool.find(
              (a) =>
                !usedAdvIds.has(a.id) &&
                a.from === curBase &&
                a.runnerName &&
                namesLikelyMatch(a.runnerName, tr.runner.name)
            ) ||
            inPlayRunnerPool.find(
              (a) =>
                !usedAdvIds.has(a.id) &&
                a.from === curBase &&
                !belongsToDifferentActivePerson(a.runnerName, tr.runner.name)
            );

          if (matchAdv) {
            usedAdvIds.add(matchAdv.id);
            matchedAny = true;
            tr.inPlayExplicitMove = matchAdv;
            tr.effectiveMethod = matchAdv.method;
            tr.isImplicit = false;
            if (matchAdv.isOut) {
              tr.isOut = true;
              tr.finalBase = matchAdv.to;
              tr.currentBase = null;
            } else {
              tr.finalBase = matchAdv.to;
              tr.currentBase = matchAdv.to;
            }
          }
        }
        if (!matchedAny) break;
      }

      // Phase 2-B: 早稲田式で元の出塁塁（例: from:"1B"）としてAI出力されたが実際には2B/3Bにいた走者の本塁生還等を走者名・最上位塁優先で紐づけ
      for (const tr of trackedRunners) {
        if (
          !tr.currentBase ||
          tr.currentBase === "HP" ||
          tr.isOut ||
          tr.inPlayExplicitMove !== null
        ) {
          continue;
        }
        const curBase = tr.currentBase;
        const byName = inPlayRunnerPool.find(
          (a) =>
            !usedAdvIds.has(a.id) &&
            !isNoOpHoldAdvance(a) &&
            Boolean(a.runnerName.trim()) &&
            namesLikelyMatch(a.runnerName, tr.runner.name) &&
            (a.isOut ||
              a.to === "HP" ||
              getBaseClosestToHomeRank(a.to) > getBaseClosestToHomeRank(curBase))
        );
        if (byName) {
          usedAdvIds.add(byName.id);
          const normalizedAdv: ScorebookV2Advance = {
            ...byName,
            from: curBase,
          };
          tr.inPlayExplicitMove = normalizedAdv;
          tr.effectiveMethod = normalizedAdv.method;
          tr.isImplicit = false;
          if (normalizedAdv.isOut) {
            tr.isOut = true;
            tr.finalBase = normalizedAdv.to;
            tr.currentBase = null;
          } else {
            tr.finalBase = normalizedAdv.to;
            tr.currentBase = normalizedAdv.to;
          }
        }
      }

      for (const namelessHp of inPlayRunnerPool) {
        if (usedAdvIds.has(namelessHp.id) || isNoOpHoldAdvance(namelessHp)) {
          continue;
        }
        if (namelessHp.isOut || namelessHp.to !== "HP") continue;
        if (namelessHp.runnerName.trim() !== "") continue;
        const leadTarget = trackedRunners.find(
          (tr) =>
            !tr.isOut &&
            tr.currentBase &&
            tr.currentBase !== "HP" &&
            tr.inPlayExplicitMove === null
        );
        if (leadTarget && leadTarget.currentBase && leadTarget.currentBase !== "HP") {
          usedAdvIds.add(namelessHp.id);
          const normalizedAdv: ScorebookV2Advance = {
            ...namelessHp,
            from: leadTarget.currentBase,
            runnerName: leadTarget.runner.name,
          };
          leadTarget.inPlayExplicitMove = normalizedAdv;
          leadTarget.effectiveMethod = normalizedAdv.method;
          leadTarget.isImplicit = false;
          leadTarget.finalBase = "HP";
          leadTarget.currentBase = "HP";
        }
      }

      // Phase 3: 明示的インプレー進塁が未登録の先行走者に対する野球物理推論
      const outsAfterPlay = Math.min(3, outsBefore + Math.max(0, ab.outsInPlay));
      const isThirdOutBatterPlay =
        outsAfterPlay >= 3 &&
        isIntrinsicBatterOutResult(
          ab.resultCode,
          ab.battedDirection,
          ab.resultLabel
        ) &&
        ab.runsInPlay === 0;

      const explicitRunnerOutsCount = trackedRunners.filter(
        (tr) => tr.isOut
      ).length;
      const hasImplicitRunnerForceOut =
        !isThirdOutBatterPlay &&
        explicitRunnerOutsCount === 0 &&
        ((ab.resultCode === "fc" && ab.outsInPlay >= 1) ||
          ab.resultCode === "double_play" ||
          ab.resultCode === "triple_play" ||
          isForceOutGroundout(
            ab.resultCode,
            ab.battedDirection,
            ab.resultLabel
          ));

      const batterInitialBase = getBatterInitialSafeBase(
        ab,
        hasImplicitRunnerForceOut || explicitRunnerOutsCount > 0
      );

      // 打者の明示的進塁（単打＋送球間2塁、または単打→2塁タッチアウト等）を確認
      const batterExplicitAdvances = nonTiebreakAdvances.filter(
        (a) => a.from === "BAT" || !usedAdvIds.has(a.id)
      );
      let batterFinalBase: OccupiedBaseKey | "HP" | null = batterInitialBase;
      let batterOutOnBases = false;
      let batterEffectiveMethod: AdvanceMethodCode =
        getDefaultInPlayMethodForResult(ab.resultCode, false);
      let batterExtraExplicit: ScorebookV2Advance | null = null;

      for (const bAdv of batterExplicitAdvances) {
        const isDirectBatAdv = bAdv.from === "BAT";
        const isValidSamePlayBatterStretch =
          !isDirectBatAdv &&
          !isNoOpHoldAdvance(bAdv) &&
          batterFinalBase !== null &&
          bAdv.from === batterFinalBase &&
          (!bAdv.runnerName.trim() ||
            namesLikelyMatch(bAdv.runnerName, ab.batterName)) &&
          !trackedRunners.some(
            (tr) =>
              Boolean(bAdv.runnerName.trim()) &&
              Boolean(tr.runner.name.trim()) &&
              namesLikelyMatch(bAdv.runnerName, tr.runner.name)
          ) &&
          (bAdv.isOut ||
            bAdv.method === "throw_advance" ||
            bAdv.method === "error");

        if (isDirectBatAdv || isValidSamePlayBatterStretch) {
          usedAdvIds.add(bAdv.id);
          batterEffectiveMethod = bAdv.method;
          if (
            bAdv.isOut ||
            (batterInitialBase && bAdv.to !== batterInitialBase)
          ) {
            batterExtraExplicit = bAdv;
          }
          if (bAdv.isOut) {
            batterOutOnBases = true;
            batterFinalBase = bAdv.to;
          } else {
            batterFinalBase = bAdv.to;
          }
        }
      }

      const explicitSafeHpCount =
        trackedRunners.filter((tr) => !tr.isOut && tr.finalBase === "HP")
          .length + (batterFinalBase === "HP" && !batterOutOnBases ? 1 : 0);
      let remainingRunsToAssign = Math.max(
        0,
        ab.runsInPlay - explicitSafeHpCount
      );

      const unmovedInPlayRunners = trackedRunners.filter(
        (tr) =>
          !tr.isOut &&
          tr.inPlayExplicitMove === null &&
          (tr.currentBase === "1B" ||
            tr.currentBase === "2B" ||
            tr.currentBase === "3B")
      );

      if (!isThirdOutBatterPlay && trackedRunners.length > 0) {
        // 3-A. 野選封殺 / ゴロ封殺 / 併殺打 で先行走者アウトが未登録なら該当走者を封殺アウト化
        if (hasImplicitRunnerForceOut && unmovedInPlayRunners.length > 0) {
          const dir = (ab.battedDirection || "").trim();
          const label = (ab.resultLabel || "").trim();
          let forcedTargetRunner: InternalTrackedRunner | undefined;
          let outAtBase: OccupiedBaseKey | "HP" = "2B";

          if (
            (/^[1-9]-2/.test(dir) || label.includes("本封")) &&
            unmovedInPlayRunners.some((r) => r.currentBase === "3B")
          ) {
            forcedTargetRunner = unmovedInPlayRunners.find(
              (r) => r.currentBase === "3B"
            );
            outAtBase = "HP";
          } else if (
            (/^[1-9]-5/.test(dir) || label.includes("三封")) &&
            unmovedInPlayRunners.some((r) => r.currentBase === "2B")
          ) {
            forcedTargetRunner = unmovedInPlayRunners.find(
              (r) => r.currentBase === "2B"
            );
            outAtBase = "3B";
          } else if (
            unmovedInPlayRunners.some((r) => r.currentBase === "1B")
          ) {
            forcedTargetRunner = unmovedInPlayRunners.find(
              (r) => r.currentBase === "1B"
            );
            outAtBase = "2B";
          } else {
            forcedTargetRunner =
              unmovedInPlayRunners[unmovedInPlayRunners.length - 1];
            outAtBase =
              forcedTargetRunner.currentBase === "3B"
                ? "HP"
                : forcedTargetRunner.currentBase === "2B"
                ? "3B"
                : "2B";
          }

          if (forcedTargetRunner) {
            forcedTargetRunner.isOut = true;
            forcedTargetRunner.finalBase = outAtBase;
            forcedTargetRunner.currentBase = null;
            forcedTargetRunner.effectiveMethod = "fc";
            forcedTargetRunner.isImplicit = true;
          }
        }

        const stillActiveUnmoved = trackedRunners.filter(
          (tr) =>
            !tr.isOut &&
            tr.inPlayExplicitMove === null &&
            (tr.currentBase === "1B" ||
              tr.currentBase === "2B" ||
              tr.currentBase === "3B")
        );

        // 3-B. 本塁打・三塁打は塁上の非アウト走者全員が必ず本塁生還（古い中間進塁が残っていても残塁化させない）
        if (
          (ab.resultCode === "home_run" || ab.resultCode === "triple") &&
          outsAfterPlay < 3
        ) {
          for (const tr of trackedRunners) {
            if (tr.isOut) continue;
            const wasAtHp = tr.finalBase === "HP";
            tr.finalBase = "HP";
            tr.currentBase = "HP";
            if (
              !tr.inPlayExplicitMove ||
              isNoOpHoldAdvance(tr.inPlayExplicitMove)
            ) {
              tr.effectiveMethod = "hit";
              tr.isImplicit = true;
            } else if (tr.inPlayExplicitMove.to !== "HP") {
              tr.effectiveMethod = "hit";
              tr.inPlayExplicitMove = {
                ...tr.inPlayExplicitMove,
                to: "HP",
                method: "hit",
              };
            }
            if (!wasAtHp && remainingRunsToAssign > 0) {
              remainingRunsToAssign -= 1;
            }
          }
        } else if (ab.resultCode === "double") {
          // 二塁打: 3B走者は生還、2B走者は得点に応じて生還または3B、1B走者は得点に応じて生還または3B
          for (const tr of stillActiveUnmoved) {
            if (tr.currentBase === "3B") {
              tr.finalBase = "HP";
              tr.currentBase = "HP";
              tr.effectiveMethod = "hit";
              tr.isImplicit = true;
              if (remainingRunsToAssign > 0) remainingRunsToAssign -= 1;
            } else if (remainingRunsToAssign > 0) {
              tr.finalBase = "HP";
              tr.currentBase = "HP";
              tr.effectiveMethod = "hit";
              tr.isImplicit = true;
              remainingRunsToAssign -= 1;
            } else {
              tr.finalBase = "3B";
              tr.currentBase = "3B";
              tr.effectiveMethod = "hit";
              tr.isImplicit = true;
            }
          }
        } else if (
          ab.resultCode === "walk" ||
          ab.resultCode === "intentional_walk" ||
          ab.resultCode === "hit_by_pitch" ||
          ab.resultCode === "interference"
        ) {
          // 四死球・打撃妨害: 1塁から連なるフォース走者のみ1つずつ進塁
          const r1 = stillActiveUnmoved.find((r) => r.currentBase === "1B");
          const r2 = stillActiveUnmoved.find((r) => r.currentBase === "2B");
          const r3 = stillActiveUnmoved.find((r) => r.currentBase === "3B");
          // 既に1Bから盗塁等で移動しておらず1Bにいる場合のみ連鎖押し出し
          const occupied1B = trackedRunners.some(
            (r) => !r.isOut && r.currentBase === "1B"
          );
          const occupied2B = trackedRunners.some(
            (r) => !r.isOut && r.currentBase === "2B"
          );
          if (occupied1B && occupied2B && r3) {
            r3.finalBase = "HP";
            r3.currentBase = "HP";
            r3.effectiveMethod = "walk";
            r3.isImplicit = true;
          }
          if (occupied1B && r2) {
            r2.finalBase = "3B";
            r2.currentBase = "3B";
            r2.effectiveMethod = "walk";
            r2.isImplicit = true;
          }
          if (r1) {
            r1.finalBase = "2B";
            r1.currentBase = "2B";
            r1.effectiveMethod = "walk";
            r1.isImplicit = true;
          }
        } else {
          // 単打・失策・野選・犠打・犠飛・内野ゴロ得点など
          const defaultMethod = getDefaultInPlayMethodForResult(
            ab.resultCode,
            false
          );

          // まず runsInPlay > 0 の未割当得点をリード走者（3B -> 2B -> 1B）から生還させる
          for (const tr of stillActiveUnmoved) {
            if (remainingRunsToAssign <= 0) break;
            tr.finalBase = "HP";
            tr.currentBase = "HP";
            tr.effectiveMethod = defaultMethod;
            tr.isImplicit = true;
            remainingRunsToAssign -= 1;
          }

          // 犠飛で 3B走者がまだ残っていれば生還（runsInPlay が 1 以上の場合は上で処理済）
          if (ab.resultCode === "sac_fly" && outsAfterPlay < 3) {
            const r3 = stillActiveUnmoved.find((r) => r.currentBase === "3B");
            if (r3 && ab.runsInPlay > 0) {
              r3.finalBase = "HP";
              r3.currentBase = "HP";
              r3.effectiveMethod = "sac";
              r3.isImplicit = true;
            }
          }

          // 犠打（送りバント）で 3アウト未満なら残っている 2B->3B, 1B->2B を1つ進める
          if (ab.resultCode === "sac_bunt" && outsAfterPlay < 3) {
            const r2 = stillActiveUnmoved.find((r) => r.currentBase === "2B");
            const r1 = stillActiveUnmoved.find((r) => r.currentBase === "1B");
            const is3BOccupied = trackedRunners.some(
              (r) => !r.isOut && r.currentBase === "3B"
            );
            if (r2 && !is3BOccupied) {
              r2.finalBase = "3B";
              r2.currentBase = "3B";
              r2.effectiveMethod = "sac";
              r2.isImplicit = true;
            }
            const is2BOccupiedAfter = trackedRunners.some(
              (r) => !r.isOut && r.currentBase === "2B"
            );
            if (r1 && !is2BOccupiedAfter) {
              r1.finalBase = "2B";
              r1.currentBase = "2B";
              r1.effectiveMethod = "sac";
              r1.isImplicit = true;
            }
          }
        }

        // 3-C. 明示的な中間進塁（例: 二塁打での 1B->3B や OCRの 1B->2B）が入っていても、
        // 打席得点 (runsInPlay) に対して本塁生還数が不足している場合はホームに近い走者から確実に本塁生還へ昇格させる
        if (outsAfterPlay < 3 && ab.resultCode !== "home_run") {
          const currentSafeHp =
            trackedRunners.filter((r) => !r.isOut && r.finalBase === "HP")
              .length +
            (!batterOutOnBases && batterFinalBase === "HP" ? 1 : 0);
          let deficitRuns = Math.max(0, ab.runsInPlay - currentSafeHp);
          if (deficitRuns > 0) {
            const isAwardedFirst = isAwardedFirstBaseResult(ab.resultCode);
            const fallbackScoreMethod: AdvanceMethodCode = isAwardedFirst
              ? "wp"
              : getDefaultInPlayMethodForResult(ab.resultCode, false);
            const promoteCandidates = trackedRunners
              .filter((r) => {
                if (r.isOut || r.finalBase === "HP") return false;
                if (isAwardedFirst) {
                  return r.finalBase === "3B" || r.startBase === "3B";
                }
                return true;
              })
              .sort((a, b) => {
                const aHold =
                  a.inPlayExplicitMove &&
                  isNoOpHoldAdvance(a.inPlayExplicitMove)
                    ? 1
                    : 0;
                const bHold =
                  b.inPlayExplicitMove &&
                  isNoOpHoldAdvance(b.inPlayExplicitMove)
                    ? 1
                    : 0;
                if (aHold !== bHold) return aHold - bHold;
                const fDiff =
                  getBaseClosestToHomeRank(b.finalBase) -
                  getBaseClosestToHomeRank(a.finalBase);
                if (fDiff !== 0) return fDiff;
                return (
                  getBaseClosestToHomeRank(b.startBase) -
                  getBaseClosestToHomeRank(a.startBase)
                );
              });

            for (const cand of promoteCandidates) {
              if (deficitRuns <= 0) break;
              cand.finalBase = "HP";
              cand.currentBase = "HP";
              if (
                !cand.inPlayExplicitMove ||
                isNoOpHoldAdvance(cand.inPlayExplicitMove)
              ) {
                cand.effectiveMethod = fallbackScoreMethod;
                cand.isImplicit = true;
              } else if (cand.inPlayExplicitMove.to !== "HP") {
                cand.effectiveMethod =
                  cand.inPlayExplicitMove.method === "other"
                    ? fallbackScoreMethod
                    : cand.inPlayExplicitMove.method;
                cand.inPlayExplicitMove = {
                  ...cand.inPlayExplicitMove,
                  to: "HP",
                  method: cand.effectiveMethod,
                };
              }
              deficitRuns -= 1;
            }
          }
        }

        // 3-D. 全打席共通：打者および後続走者によるベース重複・追い越し防止カスケード（打者 ➔ 1塁走者 ➔ 2塁走者 ➔ 3塁走者）
        if (outsAfterPlay < 3) {
          const defaultCascadeMethod = getDefaultInPlayMethodForResult(
            ab.resultCode,
            false
          );
          const baseToLevel = (
            b: OccupiedBaseKey | "HP" | null
          ): number =>
            b === "1B"
              ? 1
              : b === "2B"
              ? 2
              : b === "3B"
              ? 3
              : b === "HP"
              ? 4
              : 0;
          const levelToBase = (lv: number): OccupiedBaseKey | "HP" =>
            lv <= 1 ? "1B" : lv === 2 ? "2B" : lv === 3 ? "3B" : "HP";

          let occupiedFloor =
            !batterOutOnBases && batterFinalBase
              ? baseToLevel(batterFinalBase)
              : 0;

          for (let idx = trackedRunners.length - 1; idx >= 0; idx--) {
            const tr = trackedRunners[idx];
            if (tr.isOut) continue;
            const curLv = baseToLevel(tr.finalBase);
            if (curLv < 4 && curLv <= occupiedFloor) {
              const pushedLv = Math.min(4, occupiedFloor + 1);
              const pushedBase = levelToBase(pushedLv);
              tr.finalBase = pushedBase;
              tr.currentBase = pushedBase;
              if (
                !tr.inPlayExplicitMove ||
                isNoOpHoldAdvance(tr.inPlayExplicitMove)
              ) {
                tr.effectiveMethod = defaultCascadeMethod;
                tr.isImplicit = true;
              } else if (tr.inPlayExplicitMove.to !== pushedBase) {
                tr.inPlayExplicitMove = {
                  ...tr.inPlayExplicitMove,
                  to: pushedBase,
                };
              }
              occupiedFloor = Math.max(occupiedFloor, pushedLv);
            } else {
              occupiedFloor = Math.max(occupiedFloor, curLv);
            }
          }
        }
      }

      // 最終塁状況 (basesAfterPlay) の組み立て
      const basesAfterPlay = createEmptyBaseMap();
      for (const tr of trackedRunners) {
        if (
          !tr.isOut &&
          (tr.finalBase === "1B" ||
            tr.finalBase === "2B" ||
            tr.finalBase === "3B")
        ) {
          basesAfterPlay[tr.finalBase] = tr.runner;
        }
      }

      if (
        !batterOutOnBases &&
        (batterFinalBase === "1B" ||
          batterFinalBase === "2B" ||
          batterFinalBase === "3B")
      ) {
        basesAfterPlay[batterFinalBase] = resolveBatterRunnerIdentity(
          ab,
          structure
        );
      }

      const isInningOver = outsAfterPlay >= 3;
      const basesForNextBatter = isInningOver
        ? createEmptyBaseMap()
        : cloneBaseMap(basesAfterPlay);

      const effectiveBatterSafeBase =
        !batterOutOnBases && batterFinalBase
          ? batterFinalBase
          : batterInitialBase;

      // UI・検算用サマリー生成（常にホームに近い走者順: 3塁走者 ➔ 2塁走者 ➔ 1塁走者 に整列）
      const precedingRunners: PrecedingRunnerSummary[] =
        sortPrecedingRunnersClosestToHomeFirst(
          trackedRunners.map((tr) => {
            const baseAtInPlay: OccupiedBaseKey | "HP" | null = tr.isOutPrePlay
              ? null
              : tr.prePlayMoves.length > 0
              ? (tr.prePlayMoves[tr.prePlayMoves.length - 1].to as
                  | OccupiedBaseKey
                  | "HP")
              : tr.startBase;

            return {
              startBase: tr.startBase,
              runner: tr.runner,
              prePlayMoves: tr.prePlayMoves,
              baseAtInPlay,
              isOutPrePlay: tr.isOutPrePlay,
              inPlayExplicitMove: tr.inPlayExplicitMove,
              finalBase: tr.finalBase,
              isOut: tr.isOut,
              effectiveMethod: tr.effectiveMethod,
              isImplicit: tr.isImplicit,
              blockedHoldBases: computeBlockedHoldBasesForRunner(
                baseAtInPlay,
                effectiveBatterSafeBase,
                ab,
                basesAtInPlay
              ),
            };
          })
        );

      const orderedTrackedRunners = [...trackedRunners].sort((a, b) => {
        const aInPlay = a.isOutPrePlay
          ? a.startBase
          : a.prePlayMoves.length > 0
          ? a.prePlayMoves[a.prePlayMoves.length - 1].to
          : a.startBase;
        const bInPlay = b.isOutPrePlay
          ? b.startBase
          : b.prePlayMoves.length > 0
          ? b.prePlayMoves[b.prePlayMoves.length - 1].to
          : b.startBase;
        const diff =
          getBaseClosestToHomeRank(bInPlay) -
          getBaseClosestToHomeRank(aInPlay);
        if (diff !== 0) return diff;
        return (
          getBaseClosestToHomeRank(b.startBase) -
          getBaseClosestToHomeRank(a.startBase)
        );
      });

      const precedingRunnerMoves: EffectiveRunnerMove[] = [];
      for (const tr of orderedTrackedRunners) {
        for (const pm of tr.prePlayMoves) {
          precedingRunnerMoves.push({
            explicitAdvanceId: pm.id,
            runnerOrder: tr.runner.battingOrder,
            runnerName: tr.runner.name || pm.runnerName,
            runnerPlayerId: tr.runner.playerId,
            from: pm.from,
            to: pm.to,
            method: pm.method,
            isOut: pm.isOut,
            isImplicit: false,
            pitchNumber: pm.pitchNumber,
          });
        }

        const inPlayStart =
          tr.prePlayMoves.length > 0 && !tr.isOutPrePlay
            ? tr.prePlayMoves[tr.prePlayMoves.length - 1].to
            : tr.startBase;

        if (!tr.isOutPrePlay && inPlayStart !== "HP") {
          if (
            tr.inPlayExplicitMove &&
            !isNoOpHoldAdvance(tr.inPlayExplicitMove) &&
            (tr.isOut || tr.finalBase !== inPlayStart)
          ) {
            precedingRunnerMoves.push({
              explicitAdvanceId: tr.inPlayExplicitMove.id,
              runnerOrder: tr.runner.battingOrder,
              runnerName: tr.runner.name || tr.inPlayExplicitMove.runnerName,
              runnerPlayerId: tr.runner.playerId,
              from: inPlayStart,
              to: tr.finalBase,
              method: tr.effectiveMethod,
              isOut: tr.isOut,
              isImplicit: false,
              pitchNumber: tr.inPlayExplicitMove.pitchNumber,
            });
          } else if (tr.isImplicit && (tr.isOut || tr.finalBase !== inPlayStart)) {
            precedingRunnerMoves.push({
              explicitAdvanceId: null,
              runnerOrder: tr.runner.battingOrder,
              runnerName: tr.runner.name,
              runnerPlayerId: tr.runner.playerId,
              from: inPlayStart,
              to: tr.finalBase,
              method: tr.effectiveMethod,
              isOut: tr.isOut,
              isImplicit: true,
            });
          }
        }
      }

      // この打席で本塁生還またはアウト退場した走者・打者を記録し、打者一巡で再出塁しない限り後続打席での復活を防止
      for (const tr of trackedRunners) {
        if (tr.isOut || tr.finalBase === "HP") {
          if (tr.runner.battingOrder > 0) {
            retiredOrScoredOrders.add(tr.runner.battingOrder);
          }
          if (tr.runner.name.trim()) {
            retiredOrScoredNames.add(tr.runner.name.trim());
          }
        }
      }
      const batterIdentityForTrack = resolveBatterRunnerIdentity(ab, structure);
      const batterStayedOnBase =
        !isInningOver &&
        !batterOutOnBases &&
        (batterFinalBase === "1B" ||
          batterFinalBase === "2B" ||
          batterFinalBase === "3B");
      if (batterStayedOnBase) {
        if (batterIdentityForTrack.battingOrder > 0) {
          retiredOrScoredOrders.delete(batterIdentityForTrack.battingOrder);
        }
        if (batterIdentityForTrack.name.trim()) {
          for (const prevName of Array.from(retiredOrScoredNames)) {
            if (namesLikelyMatch(prevName, batterIdentityForTrack.name)) {
              retiredOrScoredNames.delete(prevName);
            }
          }
        }
      } else {
        if (batterIdentityForTrack.battingOrder > 0) {
          retiredOrScoredOrders.add(batterIdentityForTrack.battingOrder);
        }
        if (batterIdentityForTrack.name.trim()) {
          retiredOrScoredNames.add(batterIdentityForTrack.name.trim());
        }
      }

      resultMap.set(ab.id, {
        atBatId: ab.id,
        inning,
        outsBefore,
        outsAfter: outsAfterPlay,
        basesBefore,
        basesAfterPlay,
        basesForNextBatter,
        isInningOver,
        precedingRunners,
        precedingRunnerMoves,
        batterSummary: {
          initialBase: batterInitialBase,
          extraExplicitMove: batterExtraExplicit,
          finalBase: batterFinalBase,
          isOutOnBases: batterOutOnBases,
          effectiveMethod: batterEffectiveMethod,
        },
      });

      outs = outsAfterPlay;
      currentBases = basesForNextBatter;
    }
  }

  return resultMap;
}

const ZERO_RBI_RESULT_CODES: ReadonlySet<CanonicalAtBatResult> = new Set([
  "double_play",
  "triple_play",
  "error",
  "strikeout",
  "dropped_third_strike",
  "dropped_third_strike_out",
  "interference_out",
  "other",
]);

function isAwardedFirstBaseResult(rc: CanonicalAtBatResult): boolean {
  return (
    rc === "walk" ||
    rc === "intentional_walk" ||
    rc === "hit_by_pitch" ||
    rc === "interference"
  );
}

/**
 * 打席開始時の塁マップに対してタイブレーク走者および投球間イベント（盗塁・暴投・捕逸・ボーク・牽制等）を適用し、
 * インプレー（または四死球確定）時点の正確な走者配置を返す
 */
export function computeBasesAtInPlayFromAdvances(
  basesBefore: BaseRunnerMap,
  advances: ScorebookV2Advance[]
): BaseRunnerMap {
  const working = cloneBaseMap(basesBefore);
  for (const adv of advances) {
    if (
      adv.method === "tiebreak" &&
      !adv.isOut &&
      (adv.to === "1B" || adv.to === "2B" || adv.to === "3B") &&
      !working[adv.to]
    ) {
      working[adv.to] = {
        battingOrder: 0,
        name: adv.runnerName || "走者",
        playerId: null,
      };
    }
  }

  const prePlayPool = advances.filter(
    (a) =>
      !isNoOpHoldAdvance(a) &&
      a.from !== "BAT" &&
      isPrePlayAdvanceMethod(a.method)
  );
  if (prePlayPool.length === 0) {
    return working;
  }

  const slots: Array<{
    currentBase: OccupiedBaseKey | "HP" | null;
    runner: RunnerOnBase;
  }> = [];
  for (const bKey of ["3B", "2B", "1B"] as const) {
    if (working[bKey]) {
      slots.push({ currentBase: bKey, runner: { ...working[bKey] } });
    }
  }

  const usedIds = new Set<string>();
  let wave = 0;
  while (wave < 6) {
    wave += 1;
    let moved = false;
    for (const sl of slots) {
      if (!sl.currentBase || sl.currentBase === "HP") continue;
      const curBase = sl.currentBase;
      const match =
        prePlayPool.find(
          (a) =>
            !usedIds.has(a.id) &&
            a.from === curBase &&
            a.runnerName &&
            namesLikelyMatch(a.runnerName, sl.runner.name)
        ) || prePlayPool.find((a) => !usedIds.has(a.id) && a.from === curBase);
      if (match) {
        usedIds.add(match.id);
        moved = true;
        sl.currentBase = match.isOut ? null : match.to;
      }
    }
    if (!moved) break;
  }

  const afterPre = createEmptyBaseMap();
  for (const sl of slots) {
    if (
      sl.currentBase === "1B" ||
      sl.currentBase === "2B" ||
      sl.currentBase === "3B"
    ) {
      afterPre[sl.currentBase] = sl.runner;
    }
  }
  return afterPre;
}

/**
 * 指定された打席結果・進塁内容・打席得点に対する野球規則準拠の標準打点（RBI）を算出する
 */
export function computeDefaultRbiForAtBat(
  ab: Pick<ScorebookV2AtBat, "resultCode" | "advances">,
  nextRunsInPlay: number,
  basesBefore: BaseRunnerMap
): number {
  const safeRuns = Math.max(0, nextRunsInPlay);
  if (safeRuns === 0) return 0;
  if (ZERO_RBI_RESULT_CODES.has(ab.resultCode)) {
    return 0;
  }

  const realAdvances = ab.advances.filter((a) => !isNoOpHoldAdvance(a));
  const basesAtPlay = computeBasesAtInPlayFromAdvances(
    basesBefore,
    realAdvances
  );
  const isBasesLoadedAtPlay = Boolean(
    basesAtPlay["1B"] && basesAtPlay["2B"] && basesAtPlay["3B"]
  );

  if (isAwardedFirstBaseResult(ab.resultCode)) {
    return isBasesLoadedAtPlay ? 1 : 0;
  }

  const nonRbiExplicitHp = realAdvances.filter(
    (a) =>
      !a.isOut &&
      a.to === "HP" &&
      a.method !== "other" &&
      !RBI_ELIGIBLE_METHODS.has(a.method)
  ).length;

  if (ab.resultCode === "home_run") {
    return Math.max(1, safeRuns - nonRbiExplicitHp);
  }

  return Math.max(0, safeRuns - nonRbiExplicitHp);
}

/**
 * D1保存時や初期整合用に、暗黙の押し出し・生還・封殺進塁および本塁打の打者自身生還を実体の ScorebookV2Advance 配列へ具体化し、
 * UI専用の「そのまま残留マーカー（from === to && !isOut）」を除去したクリーンな打席リストを返す
 */
export function materializeSheetRunnerAdvances(
  atBats: ScorebookV2AtBat[],
  structure?: ScorebookSheetStructure | null
): ScorebookV2AtBat[] {
  const prunedList = pruneStaleSheetRunnerAdvances(atBats, structure).atBats;
  const snapshots = simulateSheetRunners(prunedList, structure);

  return prunedList.map((ab) => {
    const snap = snapshots.get(ab.id);
    if (!snap) return ab;

    // 1. 既存の明示的 advances から残留マーカーを除き、走者名・シミュレーション確定到達塁と同期
    const cleanedExplicit: ScorebookV2Advance[] = [];
    for (const a of ab.advances) {
      if (isNoOpHoldAdvance(a)) continue;
      if (a.from === "BAT") {
        cleanedExplicit.push(
          a.runnerName.trim() !== "" ? a : { ...a, runnerName: ab.batterName }
        );
        continue;
      }
      const matchedPr = snap.precedingRunners.find(
        (pr) => pr.inPlayExplicitMove?.id === a.id
      );
      if (matchedPr) {
        const startFrom: OccupiedBaseKey =
          matchedPr.baseAtInPlay && matchedPr.baseAtInPlay !== "HP"
            ? matchedPr.baseAtInPlay
            : matchedPr.startBase;
        if (!matchedPr.isOut && matchedPr.finalBase === startFrom) {
          continue;
        }
        cleanedExplicit.push({
          ...a,
          runnerName: matchedPr.runner.name || a.runnerName,
          from: startFrom,
          to: matchedPr.finalBase,
          method: matchedPr.effectiveMethod,
          isOut: matchedPr.isOut,
        });
        continue;
      }
      const matchedRunner = snap.basesBefore[a.from];
      cleanedExplicit.push(
        a.runnerName.trim() !== ""
          ? a
          : matchedRunner?.name
          ? { ...a, runnerName: matchedRunner.name }
          : a
      );
    }

    // 2. 本塁打で打者自身の BAT -> HP 生還が明示登録されていなければ必ず具体化（個人成績の得点・打点集計に必須）
    const batterHrAdd: ScorebookV2Advance[] = [];
    if (
      ab.resultCode === "home_run" &&
      !cleanedExplicit.some((a) => a.from === "BAT" && a.to === "HP" && !a.isOut)
    ) {
      batterHrAdd.push({
        id: crypto.randomUUID(),
        runnerName: ab.batterName,
        from: "BAT",
        to: "HP",
        method: "hit",
        isOut: false,
      });
    }

    // 3. 暗黙推論された先行走者の実移動を追加
    const implicitToAdd: ScorebookV2Advance[] = snap.precedingRunnerMoves
      .filter((m) => m.isImplicit && (m.isOut || m.from !== m.to))
      .map((m) => ({
        id: crypto.randomUUID(),
        runnerName: m.runnerName,
        from: m.from,
        to: m.to,
        method: m.method,
        isOut: m.isOut,
      }));

    const combined = [...cleanedExplicit, ...batterHrAdd, ...implicitToAdd];

    // 4. 手動で打席得点 runsInPlay が増やされているのに HP 生還行が不足している場合、塁上の先行走者（3B→2B→1B）を生還へ昇格
    const currentSafeHp = combined.filter(
      (a) => !a.isOut && a.to === "HP"
    ).length;
    let deficit = Math.max(0, ab.runsInPlay - currentSafeHp);
    if (deficit > 0 && snap.precedingRunners.length > 0) {
      const fallbackMethod: AdvanceMethodCode = isAwardedFirstBaseResult(
        ab.resultCode
      )
        ? "wp"
        : getDefaultInPlayMethodForResult(ab.resultCode, false);
      for (const pr of snap.precedingRunners) {
        if (deficit <= 0) break;
        if (pr.isOut || pr.finalBase === "HP") continue;
        const startFrom: OccupiedBaseKey =
          pr.baseAtInPlay && pr.baseAtInPlay !== "HP"
            ? pr.baseAtInPlay
            : pr.startBase;
        const existingIdx = combined.findIndex(
          (a) =>
            !a.isOut &&
            a.from === startFrom &&
            a.to !== "HP" &&
            (!a.runnerName || namesLikelyMatch(a.runnerName, pr.runner.name))
        );
        if (existingIdx >= 0) {
          combined[existingIdx] = {
            ...combined[existingIdx],
            to: "HP",
            method: fallbackMethod,
          };
        } else {
          combined.push({
            id: crypto.randomUUID(),
            runnerName: pr.runner.name,
            from: startFrom,
            to: "HP",
            method: fallbackMethod,
            isOut: false,
          });
        }
        deficit -= 1;
      }
    }

    return {
      ...ab,
      advances: sortAdvancesClosestToHomeFirst(combined),
    };
  });
}

/**
 * 進塁配列の変更から outsInPlay / runsInPlay / rbi を野球規則に沿って自動同期する
 */
export function computeSyncedStatsFromAdvances(
  ab: ScorebookV2AtBat,
  nextAdvances: ScorebookV2Advance[],
  outsBefore: number,
  basesBefore: BaseRunnerMap
): {
  outsInPlay: number;
  runsInPlay: number;
  rbi: number;
} {
  const realAdvances = nextAdvances.filter((a) => !isNoOpHoldAdvance(a));
  const runnerOuts = realAdvances.filter(
    (a) => a.isOut && a.from !== "BAT"
  ).length;
  const batterAdvOuts = realAdvances.filter(
    (a) => a.isOut && a.from === "BAT"
  ).length;

  let outsInPlay = ab.outsInPlay;
  if (
    isForceOutGroundout(ab.resultCode, ab.battedDirection, ab.resultLabel)
  ) {
    outsInPlay = Math.max(1, runnerOuts + batterAdvOuts);
  } else if (ab.resultCode === "triple_play") {
    outsInPlay = 3;
  } else if (ab.resultCode === "double_play") {
    outsInPlay = Math.min(3, Math.max(2, 1 + runnerOuts));
  } else if (
    isIntrinsicBatterOutResult(
      ab.resultCode,
      ab.battedDirection,
      ab.resultLabel
    )
  ) {
    outsInPlay = Math.min(3, 1 + runnerOuts);
  } else {
    outsInPlay = Math.min(3, runnerOuts + batterAdvOuts);
  }

  if (outsBefore < 3) {
    outsInPlay = Math.min(3 - outsBefore, outsInPlay);
  }

  const basesAtPlay = computeBasesAtInPlayFromAdvances(
    basesBefore,
    realAdvances
  );
  const occupiedCount = countOccupiedBases(basesBefore);
  const outsAfterPlay = Math.min(3, outsBefore + outsInPlay);
  let runsInPlay = 0;
  let rbi = 0;

  if (ab.resultCode === "home_run") {
    const outRunners = realAdvances.filter(
      (a) => a.isOut && a.from !== "BAT"
    ).length;
    const nonRbiExplicitHp = realAdvances.filter(
      (a) =>
        !a.isOut &&
        a.to === "HP" &&
        a.method !== "other" &&
        !RBI_ELIGIBLE_METHODS.has(a.method)
    ).length;
    runsInPlay = Math.max(1, 1 + Math.max(0, occupiedCount - outRunners));
    rbi = Math.max(1, runsInPlay - nonRbiExplicitHp);
  } else {
    const explicitSafeHp = realAdvances.filter(
      (a) => !a.isOut && a.to === "HP"
    );
    const isAwardedFirst = isAwardedFirstBaseResult(ab.resultCode);
    const isBasesLoadedAtPlay = Boolean(
      basesAtPlay["1B"] && basesAtPlay["2B"] && basesAtPlay["3B"]
    );
    const hasExplicitInPlay3BMove = realAdvances.some(
      (a) => a.from === "3B" && !isPrePlayAdvanceMethod(a.method)
    );

    let implicitRbiHp = 0;
    if (isAwardedFirst) {
      if (isBasesLoadedAtPlay && !hasExplicitInPlay3BMove) {
        implicitRbiHp = 1;
      }
    } else if (outsAfterPlay < 3 && ab.resultCode === "triple") {
      for (const bKey of ["3B", "2B", "1B"] as const) {
        if (
          basesAtPlay[bKey] &&
          !realAdvances.some(
            (a) => a.from === bKey && !isPrePlayAdvanceMethod(a.method)
          )
        ) {
          implicitRbiHp += 1;
        }
      }
    } else if (outsAfterPlay < 3 && ab.resultCode === "double") {
      if (
        basesAtPlay["3B"] &&
        !realAdvances.some(
          (a) => a.from === "3B" && !isPrePlayAdvanceMethod(a.method)
        )
      ) {
        implicitRbiHp = 1;
      }
    }

    runsInPlay = explicitSafeHp.length + implicitRbiHp;

    if (ZERO_RBI_RESULT_CODES.has(ab.resultCode)) {
      rbi = 0;
    } else if (isAwardedFirst) {
      rbi = isBasesLoadedAtPlay && runsInPlay >= 1 ? 1 : 0;
    } else {
      const rbiFromExplicit = explicitSafeHp.filter(
        (a) => RBI_ELIGIBLE_METHODS.has(a.method) || a.method === "other"
      ).length;
      rbi = Math.max(0, Math.min(runsInPlay, rbiFromExplicit + implicitRbiHp));
    }
  }

  return {
    outsInPlay,
    runsInPlay,
    rbi,
  };
}

/**
 * モーダルで先行走者カードのボタン（そのまま / →2塁 / →3塁 / →本塁 / アウト）をタップした際の更新ヘルパー
 */
export function applyPrecedingRunnerSelection(params: {
  ab: ScorebookV2AtBat;
  summary: PrecedingRunnerSummary;
  allSummaries?: PrecedingRunnerSummary[];
  targetBase: OccupiedBaseKey | "HP";
  isOut: boolean;
  preferredMethod?: AdvanceMethodCode;
  outsBefore: number;
  basesBefore: BaseRunnerMap;
}): Pick<ScorebookV2AtBat, "advances" | "outsInPlay" | "runsInPlay" | "rbi"> {
  const {
    ab,
    summary,
    allSummaries = [],
    targetBase,
    isOut,
    preferredMethod,
    outsBefore,
    basesBefore,
  } = params;

  const inPlayStartBase: OccupiedBaseKey =
    summary.baseAtInPlay && summary.baseAtInPlay !== "HP"
      ? summary.baseAtInPlay
      : summary.startBase;

  const existingInPlayId = summary.inPlayExplicitMove?.id || null;

  // この走者の既存インプレー進塁以外の advances を保持
  const preserved: ScorebookV2Advance[] = ab.advances.filter((a) => {
    if (existingInPlayId && a.id === existingInPlayId) return false;
    if (
      !isPrePlayAdvanceMethod(a.method) &&
      a.method !== "tiebreak" &&
      a.from === inPlayStartBase &&
      (!a.runnerName || namesLikelyMatch(a.runnerName, summary.runner.name))
    ) {
      return false;
    }
    return true;
  });

  // 他の塁にいた走者で暗黙推論中だった移動（例: 3塁走者の暗黙生還や1塁走者の暗黙二進）が消えないよう同時に実体化する
  for (const other of allSummaries) {
    if (other.startBase === summary.startBase) continue;
    if (!other.isImplicit || other.isOutPrePlay || !other.baseAtInPlay || other.baseAtInPlay === "HP") {
      continue;
    }
    if (!other.isOut && other.finalBase === other.baseAtInPlay) {
      continue;
    }
    const alreadyExists = preserved.some(
      (p) =>
        !isPrePlayAdvanceMethod(p.method) &&
        p.from === other.baseAtInPlay &&
        (!p.runnerName || namesLikelyMatch(p.runnerName, other.runner.name))
    );
    if (!alreadyExists) {
      preserved.push({
        id: crypto.randomUUID(),
        runnerName: other.runner.name,
        from: other.baseAtInPlay,
        to: other.finalBase,
        method: other.effectiveMethod,
        isOut: other.isOut,
      });
    }
  }

  let nextAdvances: ScorebookV2Advance[];

  if (!isOut && targetBase === inPlayStartBase) {
    // 「そのまま（元塁残留）」を明示選択した場合
    const holdMarker: ScorebookV2Advance = {
      id: existingInPlayId || crypto.randomUUID(),
      runnerName: summary.runner.name,
      from: inPlayStartBase,
      to: inPlayStartBase,
      method: "other",
      isOut: false,
    };
    nextAdvances = [...preserved, holdMarker];
  } else {
    const resolvedMethod: AdvanceMethodCode =
      preferredMethod ||
      (summary.inPlayExplicitMove &&
      summary.inPlayExplicitMove.isOut === isOut &&
      !isNoOpHoldAdvance(summary.inPlayExplicitMove)
        ? summary.inPlayExplicitMove.method
        : getDefaultInPlayMethodForResult(ab.resultCode, isOut));

    const updatedAdv: ScorebookV2Advance = {
      id: existingInPlayId || crypto.randomUUID(),
      runnerName: summary.runner.name,
      from: inPlayStartBase,
      to: targetBase,
      method: resolvedMethod,
      isOut,
    };
    nextAdvances = [...preserved, updatedAdv];
  }

  // 複数走者間で「追い越し」や「同一ベース重複」が生じないよう前後走者の明示到達塁を連動補正
  if (!isOut) {
    const curFromRank = getBaseClosestToHomeRank(inPlayStartBase);
    const curToRank = getBaseClosestToHomeRank(targetBase);
    const rankToBase = (rk: number): OccupiedBaseKey | "HP" =>
      rk >= 5 ? "HP" : rk === 4 ? "3B" : rk === 3 ? "2B" : "1B";
    const defaultSafeMethod = getDefaultInPlayMethodForResult(
      ab.resultCode,
      false
    );

    // 1) よりホームに近い前方の走者（fromRank > curFromRank）が後続走者の到達塁以下に留まっていたら前へ押し出す
    let aheadFloorRank = curToRank;
    const sortedForCascade = sortAdvancesClosestToHomeFirst(nextAdvances);
    for (let k = sortedForCascade.length - 1; k >= 0; k--) {
      const item = sortedForCascade[k];
      if (
        item.from === "BAT" ||
        item.isOut ||
        item.method === "tiebreak" ||
        isPrePlayAdvanceMethod(item.method)
      ) {
        continue;
      }
      const fRank = getBaseClosestToHomeRank(item.from);
      if (fRank <= curFromRank) continue;
      const tRank = getBaseClosestToHomeRank(item.to);
      if (tRank < 5 && tRank <= aheadFloorRank) {
        const nextRk = Math.min(5, aheadFloorRank + 1);
        const nextTo = rankToBase(nextRk);
        sortedForCascade[k] = {
          ...item,
          to: nextTo,
          method: isNoOpHoldAdvance(item) ? defaultSafeMethod : item.method,
        };
        aheadFloorRank = Math.max(aheadFloorRank, nextRk);
      } else {
        aheadFloorRank = Math.max(aheadFloorRank, tRank);
      }
    }

    // 2) より後ろの走者（fromRank < curFromRank）が前方走者の停止塁（HP以外）以上へ進んでいたら手前へクランプ
    if (curToRank < 5) {
      let behindCeilingRank = curToRank;
      for (let k = 0; k < sortedForCascade.length; k++) {
        const item = sortedForCascade[k];
        if (
          item.from === "BAT" ||
          item.isOut ||
          item.method === "tiebreak" ||
          isPrePlayAdvanceMethod(item.method)
        ) {
          continue;
        }
        const fRank = getBaseClosestToHomeRank(item.from);
        if (fRank >= curFromRank) continue;
        const tRank = getBaseClosestToHomeRank(item.to);
        if (tRank >= behindCeilingRank) {
          const clampedRk = Math.max(fRank, behindCeilingRank - 1);
          const clampedTo = rankToBase(clampedRk);
          sortedForCascade[k] = {
            ...item,
            to: clampedTo,
            method: clampedTo === item.from ? "other" : item.method,
          };
          behindCeilingRank = clampedRk;
        } else {
          behindCeilingRank = Math.min(behindCeilingRank, tRank);
        }
      }
    }

    nextAdvances = sortedForCascade;
  } else {
    nextAdvances = sortAdvancesClosestToHomeFirst(nextAdvances);
  }

  const synced = computeSyncedStatsFromAdvances(
    ab,
    nextAdvances,
    outsBefore,
    basesBefore
  );

  return {
    advances: nextAdvances,
    outsInPlay: synced.outsInPlay,
    runsInPlay: synced.runsInPlay,
    rbi: synced.rbi,
  };
}

/**
 * 打撃結果プリセット変更時（単打・二塁打・三塁打・本塁打・四球・犠打・犠飛・野選・併殺等）に、
 * 塁上走者状況と矛盾しない進塁・アウト・得点をスマート初期化する
 */
export function buildSmartAdvancesForResultChange(params: {
  prevAb: ScorebookV2AtBat;
  nextResultCode: CanonicalAtBatResult;
  nextBattedDirection: string;
  nextResultLabel: string;
  defaultPresetOuts: number;
  outsBefore: number;
  basesBefore: BaseRunnerMap;
}): Pick<ScorebookV2AtBat, "advances" | "outsInPlay" | "runsInPlay" | "rbi"> {
  const {
    prevAb,
    nextResultCode,
    nextBattedDirection,
    nextResultLabel,
    defaultPresetOuts,
    outsBefore,
    basesBefore,
  } = params;

  // 盗塁やタイブレーク等の投球間イベントは保持し、旧打撃結果に依存していたインプレー自動進塁を再構築
  const keptPrePlay = prevAb.advances.filter(
    (a) => a.method === "tiebreak" || isPrePlayAdvanceMethod(a.method)
  );

  const generated: ScorebookV2Advance[] = [...keptPrePlay];

  // 投球間進塁を反映したインプレー開始ベースを計算
  const activeAtPlay = cloneBaseMap(basesBefore);
  for (const pre of keptPrePlay) {
    if (pre.method === "tiebreak") continue;
    if (pre.from !== "BAT") {
      const moving = activeAtPlay[pre.from];
      activeAtPlay[pre.from] = null;
      if (
        !pre.isOut &&
        moving &&
        (pre.to === "1B" || pre.to === "2B" || pre.to === "3B")
      ) {
        activeAtPlay[pre.to] = moving;
      }
    }
  }

  const r3 = activeAtPlay["3B"];
  const r2 = activeAtPlay["2B"];
  const r1 = activeAtPlay["1B"];

  if (nextResultCode === "home_run" || nextResultCode === "triple") {
    if (r3) {
      generated.push({
        id: crypto.randomUUID(),
        runnerName: r3.name,
        from: "3B",
        to: "HP",
        method: "hit",
        isOut: false,
      });
    }
    if (r2) {
      generated.push({
        id: crypto.randomUUID(),
        runnerName: r2.name,
        from: "2B",
        to: "HP",
        method: "hit",
        isOut: false,
      });
    }
    if (r1) {
      generated.push({
        id: crypto.randomUUID(),
        runnerName: r1.name,
        from: "1B",
        to: "HP",
        method: "hit",
        isOut: false,
      });
    }
  } else if (nextResultCode === "double") {
    if (r3) {
      generated.push({
        id: crypto.randomUUID(),
        runnerName: r3.name,
        from: "3B",
        to: "HP",
        method: "hit",
        isOut: false,
      });
    }
    if (r2) {
      generated.push({
        id: crypto.randomUUID(),
        runnerName: r2.name,
        from: "2B",
        to: "HP",
        method: "hit",
        isOut: false,
      });
    }
    if (r1) {
      generated.push({
        id: crypto.randomUUID(),
        runnerName: r1.name,
        from: "1B",
        to: "3B",
        method: "hit",
        isOut: false,
      });
    }
  } else if (
    nextResultCode === "walk" ||
    nextResultCode === "intentional_walk" ||
    nextResultCode === "hit_by_pitch" ||
    nextResultCode === "interference"
  ) {
    if (r1 && r2 && r3) {
      generated.push({
        id: crypto.randomUUID(),
        runnerName: r3.name,
        from: "3B",
        to: "HP",
        method: "walk",
        isOut: false,
      });
    }
    if (r1 && r2) {
      generated.push({
        id: crypto.randomUUID(),
        runnerName: r2.name,
        from: "2B",
        to: "3B",
        method: "walk",
        isOut: false,
      });
    }
    if (r1) {
      generated.push({
        id: crypto.randomUUID(),
        runnerName: r1.name,
        from: "1B",
        to: "2B",
        method: "walk",
        isOut: false,
      });
    }
  } else if (nextResultCode === "sac_fly" && outsBefore < 2 && r3) {
    generated.push({
      id: crypto.randomUUID(),
      runnerName: r3.name,
      from: "3B",
      to: "HP",
      method: "sac",
      isOut: false,
    });
  } else if (nextResultCode === "sac_bunt" && outsBefore < 2) {
    if (r2 && !r3) {
      generated.push({
        id: crypto.randomUUID(),
        runnerName: r2.name,
        from: "2B",
        to: "3B",
        method: "sac",
        isOut: false,
      });
    }
    if (r1 && (!r2 || !r3)) {
      generated.push({
        id: crypto.randomUUID(),
        runnerName: r1.name,
        from: "1B",
        to: "2B",
        method: "sac",
        isOut: false,
      });
    }
  } else if (
    nextResultCode === "single" ||
    nextResultCode === "error" ||
    nextResultCode === "dropped_third_strike"
  ) {
    const m: AdvanceMethodCode =
      nextResultCode === "error" ? "error" : "hit";
    if (r1 && r2 && r3) {
      generated.push({
        id: crypto.randomUUID(),
        runnerName: r3.name,
        from: "3B",
        to: "HP",
        method: m,
        isOut: false,
      });
    }
    if (r1 && r2) {
      generated.push({
        id: crypto.randomUUID(),
        runnerName: r2.name,
        from: "2B",
        to: "3B",
        method: m,
        isOut: false,
      });
    }
    if (r1) {
      generated.push({
        id: crypto.randomUUID(),
        runnerName: r1.name,
        from: "1B",
        to: "2B",
        method: m,
        isOut: false,
      });
    }
  } else if (
    nextResultCode === "double_play" &&
    outsBefore < 2 &&
    (r1 || r2 || r3)
  ) {
    const targetOutRunner = r1 || r2 || r3;
    const fromBase: OccupiedBaseKey = r1 ? "1B" : r2 ? "2B" : "3B";
    const toBase: OccupiedBaseKey | "HP" =
      fromBase === "1B" ? "2B" : fromBase === "2B" ? "3B" : "HP";
    if (targetOutRunner) {
      generated.push({
        id: crypto.randomUUID(),
        runnerName: targetOutRunner.name,
        from: fromBase,
        to: toBase,
        method: "fc",
        isOut: true,
      });
    }
  } else if (
    (nextResultCode === "fc" ||
      isForceOutGroundout(
        nextResultCode,
        nextBattedDirection,
        nextResultLabel
      )) &&
    (r1 || r2 || r3)
  ) {
    if (
      isForceOutGroundout(nextResultCode, nextBattedDirection, nextResultLabel)
    ) {
      if (
        (/^[1-9]-2/.test(nextBattedDirection) ||
          nextResultLabel.includes("本封")) &&
        r3
      ) {
        generated.push({
          id: crypto.randomUUID(),
          runnerName: r3.name,
          from: "3B",
          to: "HP",
          method: "fc",
          isOut: true,
        });
      } else if (
        (/^[1-9]-5/.test(nextBattedDirection) ||
          nextResultLabel.includes("三封")) &&
        r2
      ) {
        generated.push({
          id: crypto.randomUUID(),
          runnerName: r2.name,
          from: "2B",
          to: "3B",
          method: "fc",
          isOut: true,
        });
      } else if (r1) {
        generated.push({
          id: crypto.randomUUID(),
          runnerName: r1.name,
          from: "1B",
          to: "2B",
          method: "fc",
          isOut: true,
        });
      }
    } else if (nextResultCode === "fc") {
      // 野選出塁（FC6-2, FC5-2, FC4-6, FC1-5, FC6 等）: 送球先（本塁 -2 / 三塁 -5 / 二塁 -4,-6）に応じてホームに近い走者順に進塁を生成
      const fcThrowMatch =
        nextBattedDirection.match(/FC[1-9]-([1-9])/i) ||
        nextBattedDirection.match(/^[1-9]-([1-9])$/);
      const fcTarget = fcThrowMatch ? fcThrowMatch[1] : "";
      const makeForceOut =
        prevAb.resultCode === "fc" && defaultPresetOuts >= 1 && outsBefore < 3;

      if (fcTarget === "2" && r3) {
        generated.push({
          id: crypto.randomUUID(),
          runnerName: r3.name,
          from: "3B",
          to: "HP",
          method: "fc",
          isOut: makeForceOut,
        });
        if (r2 && r1) {
          generated.push({
            id: crypto.randomUUID(),
            runnerName: r2.name,
            from: "2B",
            to: "3B",
            method: "fc",
            isOut: false,
          });
        }
        if (r1) {
          generated.push({
            id: crypto.randomUUID(),
            runnerName: r1.name,
            from: "1B",
            to: "2B",
            method: "fc",
            isOut: false,
          });
        }
      } else if (fcTarget === "5" && r2) {
        if (r3) {
          generated.push({
            id: crypto.randomUUID(),
            runnerName: r3.name,
            from: "3B",
            to: "HP",
            method: "fc",
            isOut: false,
          });
        }
        generated.push({
          id: crypto.randomUUID(),
          runnerName: r2.name,
          from: "2B",
          to: "3B",
          method: "fc",
          isOut: makeForceOut,
        });
        if (r1) {
          generated.push({
            id: crypto.randomUUID(),
            runnerName: r1.name,
            from: "1B",
            to: "2B",
            method: "fc",
            isOut: false,
          });
        }
      } else {
        if (r1 && r2 && r3) {
          generated.push({
            id: crypto.randomUUID(),
            runnerName: r3.name,
            from: "3B",
            to: "HP",
            method: "fc",
            isOut: false,
          });
        }
        if (r1 && r2) {
          generated.push({
            id: crypto.randomUUID(),
            runnerName: r2.name,
            from: "2B",
            to: "3B",
            method: "fc",
            isOut: false,
          });
        }
        if (r1) {
          generated.push({
            id: crypto.randomUUID(),
            runnerName: r1.name,
            from: "1B",
            to: "2B",
            method: "fc",
            isOut: makeForceOut,
          });
        } else if (r3 && fcTarget === "") {
          generated.push({
            id: crypto.randomUUID(),
            runnerName: r3.name,
            from: "3B",
            to: "HP",
            method: "fc",
            isOut: makeForceOut,
          });
        } else if (r2 && fcTarget === "") {
          generated.push({
            id: crypto.randomUUID(),
            runnerName: r2.name,
            from: "2B",
            to: "3B",
            method: "fc",
            isOut: makeForceOut,
          });
        }
      }
    }
  }

  const sortedGenerated = sortAdvancesClosestToHomeFirst(generated);

  const candidateAb: ScorebookV2AtBat = {
    ...prevAb,
    resultCode: nextResultCode,
    battedDirection: nextBattedDirection,
    resultLabel: nextResultLabel,
    outsInPlay: defaultPresetOuts,
    advances: sortedGenerated,
  };

  const synced = computeSyncedStatsFromAdvances(
    candidateAb,
    sortedGenerated,
    outsBefore,
    basesBefore
  );

  return {
    advances: sortedGenerated,
    outsInPlay:
      sortedGenerated.length === 0 && defaultPresetOuts > 0
        ? Math.min(Math.max(0, 3 - outsBefore), defaultPresetOuts)
        : synced.outsInPlay,
    runsInPlay: synced.runsInPlay,
    rbi: synced.rbi,
  };
}

export interface DeferredPersonalRunInfo {
  scorerAtBatId: string;
  scorerBattingOrder: number;
  scorerName: string;
  scorerResultLabel: string;
  scoredFromBase: OccupiedBaseKey;
  scoredMethod: AdvanceMethodCode;
}

/**
 * 早稲田式・成美堂式スコアブックで出塁打者マスの中央に「●（個人得点）」が書かれるケースに対応し、
 * 「この打席で出塁した走者が、同イニング後続の誰の打席で本塁生還したか」を逆引きマップとして返す
 */
export function resolveDeferredPersonalRunsMap(
  atBats: ScorebookV2AtBat[],
  snapshots: Map<string, AtBatRunnerSnapshot>
): Map<string, DeferredPersonalRunInfo> {
  const result = new Map<string, DeferredPersonalRunInfo>();
  if (atBats.length === 0) return result;

  const byInning = new Map<number, ScorebookV2AtBat[]>();
  for (const ab of atBats) {
    const arr = byInning.get(ab.inning) || [];
    arr.push(ab);
    byInning.set(ab.inning, arr);
  }

  for (const [, innList] of byInning) {
    for (let j = 1; j < innList.length; j++) {
      const scorerAb = innList[j];
      const scorerSnap = snapshots.get(scorerAb.id);
      if (!scorerSnap) continue;

      for (const pr of scorerSnap.precedingRunners) {
        if (pr.isOut || pr.finalBase !== "HP") continue;

        // j より前の同一イニング打席のうち、該当走者が出塁した直近の打席を特定
        for (let i = j - 1; i >= 0; i--) {
          const priorAb = innList[i];
          const priorSnap = snapshots.get(priorAb.id);
          if (!priorSnap) continue;
          const bSum = priorSnap.batterSummary;
          const reachedBaseSafely =
            !bSum.isOutOnBases &&
            (bSum.finalBase === "1B" ||
              bSum.finalBase === "2B" ||
              bSum.finalBase === "3B");
          if (!reachedBaseSafely) continue;

          const orderMatches =
            pr.runner.battingOrder > 0 &&
            priorAb.battingOrder === pr.runner.battingOrder;
          const nameMatches =
            pr.runner.battingOrder <= 0 &&
            Boolean(pr.runner.name) &&
            namesLikelyMatch(pr.runner.name, priorAb.batterName);

          if (orderMatches || nameMatches) {
            if (!result.has(priorAb.id)) {
              result.set(priorAb.id, {
                scorerAtBatId: scorerAb.id,
                scorerBattingOrder: scorerAb.battingOrder,
                scorerName: scorerAb.batterName || "打者",
                scorerResultLabel: scorerAb.resultLabel,
                scoredFromBase: pr.startBase,
                scoredMethod: pr.effectiveMethod,
              });
            }
            break;
          }
        }
      }
    }
  }

  return result;
}

function scoreDownstreamRunCandidate(
  ab: ScorebookV2AtBat,
  snap: AtBatRunnerSnapshot,
  pr: PrecedingRunnerSummary,
  isDeferredMarkedOrder: boolean
): { score: number; method: AdvanceMethodCode; startFrom: OccupiedBaseKey } | null {
  if (pr.isOut || pr.finalBase === "HP") return null;
  const inPlayBase: OccupiedBaseKey =
    pr.baseAtInPlay && pr.baseAtInPlay !== "HP"
      ? pr.baseAtInPlay
      : pr.startBase;

  const baseBonus =
    inPlayBase === "3B" ? 32 : inPlayBase === "2B" ? 22 : 12;
  const deferredBonus = isDeferredMarkedOrder ? 45 : 0;
  const rc = ab.resultCode;

  // 3アウト到達打席では投球間（暴投等）以外のインプレー得点は不可
  if (snap.outsAfter >= 3) {
    if (snap.outsBefore < 3 && inPlayBase === "3B") {
      return {
        score: 14 + deferredBonus,
        method: "wp",
        startFrom: pr.startBase,
      };
    }
    return null;
  }

  if (isAwardedFirstBaseResult(rc)) {
    const basesAtPlay = computeBasesAtInPlayFromAdvances(
      snap.basesBefore,
      ab.advances
    );
    const isLoaded = Boolean(
      basesAtPlay["1B"] && basesAtPlay["2B"] && basesAtPlay["3B"]
    );
    if (isLoaded && inPlayBase === "3B") {
      return {
        score: 88 + baseBonus + deferredBonus,
        method: "walk",
        startFrom: inPlayBase,
      };
    }
    if (inPlayBase === "3B") {
      return {
        score: 20 + deferredBonus,
        method: "wp",
        startFrom: pr.startBase,
      };
    }
    return null;
  }

  switch (rc) {
    case "home_run":
    case "triple":
      return {
        score: 105 + baseBonus + deferredBonus,
        method: "hit",
        startFrom: inPlayBase,
      };
    case "double":
      return {
        score: 95 + baseBonus + deferredBonus,
        method: "hit",
        startFrom: inPlayBase,
      };
    case "sac_fly":
      if (inPlayBase !== "3B") return null;
      return {
        score: 96 + baseBonus + deferredBonus,
        method: "sac",
        startFrom: inPlayBase,
      };
    case "single":
      return {
        score:
          (inPlayBase === "1B" ? 60 : 86) + baseBonus + deferredBonus,
        method: "hit",
        startFrom: inPlayBase,
      };
    case "error":
      return {
        score: 74 + baseBonus + deferredBonus,
        method: "error",
        startFrom: inPlayBase,
      };
    case "fc":
      return {
        score:
          (inPlayBase === "3B" ? 72 : 52) + baseBonus + deferredBonus,
        method: "fc",
        startFrom: inPlayBase,
      };
    case "sac_bunt":
      if (inPlayBase !== "3B") return null;
      return {
        score: 70 + baseBonus + deferredBonus,
        method: "sac",
        startFrom: inPlayBase,
      };
    case "groundout":
      if (inPlayBase === "1B") return null;
      return {
        score:
          (inPlayBase === "3B" ? 66 : 42) + baseBonus + deferredBonus,
        method: "fc",
        startFrom: inPlayBase,
      };
    case "double_play":
      if (snap.outsBefore > 0 || inPlayBase !== "3B") return null;
      return {
        score: 54 + baseBonus + deferredBonus,
        method: "fc",
        startFrom: inPlayBase,
      };
    case "flyout":
      if (inPlayBase !== "3B") return null;
      return {
        score: 48 + baseBonus + deferredBonus,
        method: "sac",
        startFrom: inPlayBase,
      };
    case "dropped_third_strike":
      if (inPlayBase !== "3B") return null;
      return {
        score: 36 + baseBonus + deferredBonus,
        method: "wp",
        startFrom: pr.startBase,
      };
    case "strikeout":
    case "dropped_third_strike_out":
    case "infield_fly":
      if (inPlayBase !== "3B") return null;
      return {
        score: 22 + deferredBonus,
        method: "wp",
        startFrom: pr.startBase,
      };
    default:
      return null;
  }
}

/**
 * AI解析直後のイニング打席リストに対し、以下の野球規則・早稲田式記法補正を決定論的（0ms）に適用する:
 * 1. 先頭打者の四球や無走者単打など、物理的にその打席では入り得ない「●（後続打席での個人得点マーク）」由来の
 *    過剰な runsInPlay / rbi / 幻覚 HP 進塁をクランプ・除去し、出塁走者を正しく塁上に残す
 * 2. 失策・併殺打・三振・非満塁四死球・暴投/捕逸での生還に対する打点（rbi）を公認野球規則どおり 0（満塁四死球のみ 1）に厳密補正
 * 3. クランプされた「●（個人得点）」やスコアボード確定得点（structure.innings[].runs）との差分を、
 *    実際にその走者を還した同イニング後続の適時打・犠飛・内野ゴロ・失策等の打席へ自動再配分する
 */
export function reconcileSheetRunsAndRbi(
  atBats: ScorebookV2AtBat[],
  structure?: ScorebookSheetStructure | null
): { atBats: ScorebookV2AtBat[]; changed: boolean } {
  if (atBats.length === 0) {
    return { atBats, changed: false };
  }

  const byInning = new Map<number, ScorebookV2AtBat[]>();
  for (const ab of atBats) {
    const arr = byInning.get(ab.inning) || [];
    arr.push({
      ...ab,
      advances: ab.advances.map((adv) => ({ ...adv })),
    });
    byInning.set(ab.inning, arr);
  }

  const sortedInnings = Array.from(byInning.keys()).sort((a, b) => a - b);
  let changed = false;

  for (const inn of sortedInnings) {
    const innList = byInning.get(inn) || [];
    if (innList.length === 0) continue;

    const deferredScoreOrders = new Set<number>();
    const minGuaranteedRunsByIdx: number[] = new Array(innList.length).fill(0);

    // =========================================================================
    // Pass A: 打席順に沿った物理的生還上限クランプ ＆ 早稲田式「●」混入の分離 ＆ 打点厳密化
    // =========================================================================
    for (let i = 0; i < innList.length; i++) {
      const ab = innList[i];

      // i番目開始時点の正確な塁状況・アウト数を直前までの確定済打席から取得
      let outsBefore = 0;
      let effectiveBasesBefore = createEmptyBaseMap();
      if (i > 0) {
        const prefixSnaps = simulateSheetRunners(innList.slice(0, i), structure);
        const prevSnap = prefixSnaps.get(innList[i - 1].id);
        if (prevSnap) {
          outsBefore = prevSnap.outsAfter;
          effectiveBasesBefore = prevSnap.isInningOver
            ? createEmptyBaseMap()
            : cloneBaseMap(prevSnap.basesForNextBatter);
        }
      }
      for (const adv of ab.advances) {
        if (
          adv.method === "tiebreak" &&
          !adv.isOut &&
          (adv.to === "1B" || adv.to === "2B" || adv.to === "3B") &&
          !effectiveBasesBefore[adv.to]
        ) {
          effectiveBasesBefore[adv.to] = resolveRunnerFromStructureByName(
            adv.runnerName,
            inn,
            structure
          );
        }
      }

      const occupiedBeforeCount = countOccupiedBases(effectiveBasesBefore);
      const initSafeBase = getBatterInitialSafeBase(ab, ab.outsInPlay >= 1);
      const reachablePreceding = new Set<OccupiedBaseKey>();
      for (const bKey of ["3B", "2B", "1B"] as const) {
        if (effectiveBasesBefore[bKey]) {
          reachablePreceding.add(bKey);
        }
      }

      // A-1. 物理的にあり得ない advances（後続打席での進塁線・●生還の混入）をクレンジング
      const prelimAdvances: ScorebookV2Advance[] = [];
      let advModified = false;

      for (const adv of ab.advances) {
        if (adv.method === "tiebreak" || isNoOpHoldAdvance(adv)) {
          prelimAdvances.push(adv);
          continue;
        }

        if (adv.from === "BAT") {
          if (ab.resultCode === "home_run") {
            if (adv.to !== "HP" || adv.isOut) {
              prelimAdvances.push({
                ...adv,
                to: "HP",
                method: "hit",
                isOut: false,
              });
              advModified = true;
            } else {
              prelimAdvances.push(adv);
            }
            continue;
          }

          if (initSafeBase === null) {
            // 凡退打者の安全な出塁・本塁生還は物理的に不可
            if (!adv.isOut) {
              advModified = true;
              continue;
            }
            prelimAdvances.push(adv);
            continue;
          }

          // 出塁打者（四死球・単打・二塁打・三塁打・失策・野選・振り逃げ等）
          if (!adv.isOut && adv.to === "HP") {
            const isExplicitMultiBaseError =
              (ab.resultCode === "single" ||
                ab.resultCode === "double" ||
                ab.resultCode === "triple" ||
                ab.resultCode === "error") &&
              adv.method === "error";
            if (!isExplicitMultiBaseError) {
              // スコアブック中央の「●（後続打席での個人得点）」をこの打席の BAT->HP と誤読したケース
              deferredScoreOrders.add(ab.battingOrder);
              prelimAdvances.push({
                ...adv,
                to: initSafeBase,
                method: getDefaultInPlayMethodForResult(ab.resultCode, false),
              });
              advModified = true;
              continue;
            }
          }

          if (
            !adv.isOut &&
            isAwardedFirstBaseResult(ab.resultCode) &&
            adv.to !== "1B"
          ) {
            const canAdvanceOnBallFour =
              ab.resultCode === "walk" &&
              (adv.method === "wp" ||
                adv.method === "pb" ||
                adv.method === "error" ||
                adv.method === "throw_advance");
            if (!canAdvanceOnBallFour) {
              prelimAdvances.push({
                ...adv,
                to: "1B",
                method: "walk",
              });
              advModified = true;
              continue;
            }
          }

          // 単打・失策・野選・二塁打で、後続打席での進塁線（1B->2B / 1B->3B / 2B->3B）をこの打席の BAT->2B/3B（method: "hit" 等）と誤読した場合は基本出塁塁へ戻す
          if (
            !adv.isOut &&
            !isAwardedFirstBaseResult(ab.resultCode) &&
            initSafeBase !== "HP" &&
            getBaseClosestToHomeRank(adv.to) >
              getBaseClosestToHomeRank(initSafeBase) &&
            adv.method !== "throw_advance" &&
            adv.method !== "error"
          ) {
            prelimAdvances.push({
              ...adv,
              to: initSafeBase,
              method: getDefaultInPlayMethodForResult(ab.resultCode, false),
            });
            advModified = true;
            continue;
          }

          prelimAdvances.push(adv);
          continue;
        }

        // adv.from === "1B" | "2B" | "3B"
        if (reachablePreceding.has(adv.from)) {
          prelimAdvances.push(adv);
          if (
            !adv.isOut &&
            (adv.to === "1B" || adv.to === "2B" || adv.to === "3B")
          ) {
            reachablePreceding.add(adv.to);
          }
          continue;
        }

        // 該当塁に先行走者が存在しない場合
        const isSamePlayBatterStretch =
          !isAwardedFirstBaseResult(ab.resultCode) &&
          initSafeBase === adv.from &&
          (adv.method === "throw_advance" ||
            adv.method === "error" ||
            adv.isOut) &&
          (adv.to !== "HP" || adv.isOut || adv.method === "error");

        if (isSamePlayBatterStretch) {
          prelimAdvances.push(adv);
          continue;
        }

        if (occupiedBeforeCount === 0) {
          // 無走者打席での 1B/2B/3B からの移動は 100% 後続打席の進塁線・●マーク
          if (!adv.isOut && adv.to === "HP" && initSafeBase !== null) {
            deferredScoreOrders.add(ab.battingOrder);
          }
          advModified = true;
          continue;
        }

        // 他塁に先行走者がいるのに開始塁だけ誤読された本塁生還なら、最上位の占有塁へスナップ補正
        if (
          !adv.isOut &&
          adv.to === "HP" &&
          !isAwardedFirstBaseResult(ab.resultCode)
        ) {
          const fallbackBase = (["3B", "2B", "1B"] as const).find(
            (bKey) =>
              reachablePreceding.has(bKey) &&
              !prelimAdvances.some((p) => p.from === bKey)
          );
          if (fallbackBase) {
            prelimAdvances.push({
              ...adv,
              from: fallbackBase,
              runnerName:
                effectiveBasesBefore[fallbackBase]?.name || adv.runnerName,
            });
            advModified = true;
            continue;
          }
        }

        advModified = true;
      }

      // A-2. 非満塁時の四死球における不可能な押し出し生還と、3アウト成立打席での無効インプレー生還を除去
      const basesAtPlay = computeBasesAtInPlayFromAdvances(
        effectiveBasesBefore,
        prelimAdvances
      );
      const isBasesLoadedAtPlay = Boolean(
        basesAtPlay["1B"] && basesAtPlay["2B"] && basesAtPlay["3B"]
      );
      const outsAfter = Math.min(3, outsBefore + Math.max(0, ab.outsInPlay));
      const invalidatesInPlayRunsOnThirdOut =
        outsAfter >= 3 &&
        (ab.resultCode === "double_play" ||
          ab.resultCode === "triple_play" ||
          isForceOutGroundout(
            ab.resultCode,
            ab.battedDirection,
            ab.resultLabel
          ) ||
          (outsBefore >= 2 &&
            isIntrinsicBatterOutResult(
              ab.resultCode,
              ab.battedDirection,
              ab.resultLabel
            )));

      const cleanedAdvances = sortAdvancesClosestToHomeFirst(
        prelimAdvances.filter((adv) => {
          if (adv.method === "tiebreak" || isNoOpHoldAdvance(adv)) return true;

          if (
            invalidatesInPlayRunsOnThirdOut &&
            !adv.isOut &&
            adv.to === "HP" &&
            !isPrePlayAdvanceMethod(adv.method)
          ) {
            advModified = true;
            return false;
          }

          if (isAwardedFirstBaseResult(ab.resultCode) && adv.from !== "BAT") {
            if (
              !adv.isOut &&
              adv.to === "HP" &&
              !isPrePlayAdvanceMethod(adv.method) &&
              adv.method !== "error" &&
              adv.method !== "obstruction" &&
              !isBasesLoadedAtPlay
            ) {
              if (initSafeBase !== null) {
                deferredScoreOrders.add(ab.battingOrder);
              }
              advModified = true;
              return false;
            }
            if (
              !adv.isOut &&
              adv.method === "walk" &&
              adv.from === "2B" &&
              adv.to === "3B" &&
              !(basesAtPlay["1B"] && basesAtPlay["2B"])
            ) {
              advModified = true;
              return false;
            }
          }

          return true;
        })
      );

      // A-3. この打席で物理的に成立し得る最小得点・最大得点を算出
      const realClean = cleanedAdvances.filter(
        (a) => !isNoOpHoldAdvance(a) && a.method !== "tiebreak"
      );
      const validPrePlayHp = realClean.filter(
        (a) =>
          a.from !== "BAT" &&
          !a.isOut &&
          a.to === "HP" &&
          isPrePlayAdvanceMethod(a.method)
      ).length;
      const inPlayOccupied = countOccupiedBases(basesAtPlay);
      const inPlayRunnerOuts = realClean.filter(
        (a) =>
          a.from !== "BAT" && a.isOut && !isPrePlayAdvanceMethod(a.method)
      ).length;
      const maxInPlayRunnerHp = Math.max(0, inPlayOccupied - inPlayRunnerOuts);
      const explicitBatErrorHp = realClean.filter(
        (a) =>
          a.from === "BAT" &&
          !a.isOut &&
          a.to === "HP" &&
          a.method === "error"
      ).length;
      const explicitSafeHp = realClean.filter(
        (a) => !a.isOut && a.to === "HP"
      ).length;

      let minRuns = 0;
      let maxRuns = 0;

      if (outsBefore >= 3) {
        minRuns = 0;
        maxRuns = 0;
      } else if (ab.resultCode === "home_run") {
        const hrRuns = Math.max(1, 1 + maxInPlayRunnerHp + validPrePlayHp);
        minRuns = hrRuns;
        maxRuns = hrRuns;
      } else if (invalidatesInPlayRunsOnThirdOut) {
        minRuns = validPrePlayHp;
        maxRuns = validPrePlayHp;
      } else if (isAwardedFirstBaseResult(ab.resultCode)) {
        const forcedHp = isBasesLoadedAtPlay ? 1 : 0;
        const explicitNonForceHp = realClean.filter(
          (a) =>
            a.from !== "BAT" &&
            !a.isOut &&
            a.to === "HP" &&
            !isPrePlayAdvanceMethod(a.method) &&
            (a.method === "error" || a.method === "obstruction")
        ).length;
        minRuns = validPrePlayHp + forcedHp;
        maxRuns = Math.min(
          occupiedBeforeCount,
          validPrePlayHp + forcedHp + explicitNonForceHp
        );
      } else if (
        ab.resultCode === "strikeout" ||
        ab.resultCode === "dropped_third_strike_out" ||
        ab.resultCode === "infield_fly" ||
        ab.resultCode === "interference_out" ||
        ab.resultCode === "other"
      ) {
        minRuns = explicitSafeHp;
        maxRuns = Math.min(occupiedBeforeCount, explicitSafeHp);
      } else if (ab.resultCode === "triple") {
        minRuns = validPrePlayHp + maxInPlayRunnerHp;
        maxRuns = minRuns + explicitBatErrorHp;
      } else if (ab.resultCode === "double") {
        const safe3B =
          basesAtPlay["3B"] &&
          !realClean.some(
            (a) =>
              a.from === "3B" && a.isOut && !isPrePlayAdvanceMethod(a.method)
          )
            ? 1
            : 0;
        minRuns = Math.max(explicitSafeHp, validPrePlayHp + safe3B);
        maxRuns = validPrePlayHp + maxInPlayRunnerHp + explicitBatErrorHp;
      } else {
        minRuns = explicitSafeHp;
        maxRuns = validPrePlayHp + maxInPlayRunnerHp + explicitBatErrorHp;
      }

      minGuaranteedRunsByIdx[i] = minRuns;

      if (ab.runsInPlay > maxRuns && initSafeBase !== null) {
        deferredScoreOrders.add(ab.battingOrder);
      }

      const clampedRuns = Math.max(minRuns, Math.min(maxRuns, ab.runsInPlay));
      const defaultRbi = computeDefaultRbiForAtBat(
        { resultCode: ab.resultCode, advances: cleanedAdvances },
        clampedRuns,
        effectiveBasesBefore
      );

      let nextRbi = defaultRbi;
      if (
        clampedRuns > 0 &&
        !ZERO_RBI_RESULT_CODES.has(ab.resultCode) &&
        !isAwardedFirstBaseResult(ab.resultCode) &&
        ab.resultCode !== "home_run" &&
        clampedRuns === ab.runsInPlay &&
        ab.rbi >= 0 &&
        ab.rbi <= defaultRbi
      ) {
        const mentionsErrorOrBatteryMiss =
          /[Ee失]|暴投|捕逸|ボーク/.test(
            `${ab.battedDirection || ""} ${ab.resultLabel || ""}`
          );
        nextRbi =
          ab.rbi === 0 && !mentionsErrorOrBatteryMiss ? defaultRbi : ab.rbi;
      }

      if (
        advModified ||
        clampedRuns !== ab.runsInPlay ||
        nextRbi !== ab.rbi
      ) {
        innList[i] = {
          ...ab,
          advances: cleanedAdvances,
          runsInPlay: clampedRuns,
          rbi: nextRbi,
        };
        changed = true;
      }
    }

    // =========================================================================
    // Pass B: クランプされた「●（個人得点）」や確定イニング得点との不足分を後続の適時打・失策等へ再配分
    // =========================================================================
    const meta = structure?.innings.find((m) => m.inning === inn);
    const confirmedRuns =
      typeof meta?.runs === "number" ? Math.max(0, meta.runs) : null;
    let currentInningRuns = innList.reduce(
      (sum, x) => sum + Math.max(0, x.runsInPlay),
      0
    );
    const targetRuns =
      confirmedRuns !== null
        ? confirmedRuns
        : currentInningRuns + deferredScoreOrders.size;

    let assignGuard = 0;
    while (currentInningRuns < targetRuns && assignGuard < 8) {
      assignGuard += 1;
      const snaps = simulateSheetRunners(innList, structure);
      let bestPick: {
        idx: number;
        runnerName: string;
        runnerOrder: number;
        startFrom: OccupiedBaseKey;
        method: AdvanceMethodCode;
        score: number;
      } | null = null;

      for (let j = 1; j < innList.length; j++) {
        const candAb = innList[j];
        const snap = snaps.get(candAb.id);
        if (!snap || snap.precedingRunners.length === 0) continue;

        for (const pr of snap.precedingRunners) {
          // この走者がさらに後続の打席で明示的にアウト（盗塁死・封殺等）になっていないか確認
          let explicitlyOutLater = false;
          for (let k = j + 1; k < innList.length; k++) {
            const laterSnap = snaps.get(innList[k].id);
            if (!laterSnap) continue;
            const laterPr = laterSnap.precedingRunners.find(
              (lp) =>
                (pr.runner.battingOrder > 0 &&
                  lp.runner.battingOrder === pr.runner.battingOrder) ||
                (pr.runner.battingOrder <= 0 &&
                  namesLikelyMatch(lp.runner.name, pr.runner.name))
            );
            if (laterPr && laterPr.isOut && !laterPr.isImplicit) {
              explicitlyOutLater = true;
              break;
            }
          }
          if (explicitlyOutLater) continue;

          const evalRes = scoreDownstreamRunCandidate(
            candAb,
            snap,
            pr,
            deferredScoreOrders.has(pr.runner.battingOrder)
          );
          if (!evalRes) continue;

          if (!bestPick || evalRes.score > bestPick.score) {
            bestPick = {
              idx: j,
              runnerName: pr.runner.name,
              runnerOrder: pr.runner.battingOrder,
              startFrom: evalRes.startFrom,
              method: evalRes.method,
              score: evalRes.score,
            };
          }
        }
      }

      if (!bestPick) break;

      const targetAb = innList[bestPick.idx];
      const targetSnap = snaps.get(targetAb.id);
      if (!targetSnap) break;

      const filteredExisting = targetAb.advances.filter(
        (a) =>
          !(
            !a.isOut &&
            a.from === bestPick.startFrom &&
            (!a.runnerName ||
              namesLikelyMatch(a.runnerName, bestPick.runnerName))
          )
      );
      const nextAdvances: ScorebookV2Advance[] =
        sortAdvancesClosestToHomeFirst([
          ...filteredExisting,
          {
            id: crypto.randomUUID(),
            runnerName: bestPick.runnerName,
            from: bestPick.startFrom,
            to: "HP",
            method: bestPick.method,
            isOut: false,
          },
        ]);
      const synced = computeSyncedStatsFromAdvances(
        targetAb,
        nextAdvances,
        targetSnap.outsBefore,
        targetSnap.basesBefore
      );
      const nextRunsInPlay = Math.max(targetAb.runsInPlay + 1, synced.runsInPlay);
      const nextRbi = computeDefaultRbiForAtBat(
        { resultCode: targetAb.resultCode, advances: nextAdvances },
        nextRunsInPlay,
        targetSnap.basesBefore
      );

      innList[bestPick.idx] = {
        ...targetAb,
        advances: nextAdvances,
        runsInPlay: nextRunsInPlay,
        rbi: nextRbi,
      };
      deferredScoreOrders.delete(bestPick.runnerOrder);
      // この打席で本塁生還が確定した走者の古い進塁行が後続打席に残っていれば即座に除去
      const midPruned = pruneStaleSheetRunnerAdvances(innList, structure);
      if (midPruned.changed) {
        innList.splice(0, innList.length, ...midPruned.atBats);
      }
      currentInningRuns = innList.reduce(
        (sum, x) => sum + Math.max(0, x.runsInPlay),
        0
      );
      changed = true;
    }

    // =========================================================================
    // Pass C: スコアボード確定得点を上回る二重計上（塁上走者ありで出塁した打者自身の「●」も加算されたケース）の解消
    // =========================================================================
    if (confirmedRuns !== null && currentInningRuns > confirmedRuns) {
      for (let i = 0; i < innList.length - 1; i++) {
        if (currentInningRuns <= confirmedRuns) break;
        const ab = innList[i];
        const minReq = minGuaranteedRunsByIdx[i] ?? 0;
        if (ab.runsInPlay <= minReq) continue;

        const isOnBaseBatter =
          ab.resultCode === "single" ||
          ab.resultCode === "double" ||
          ab.resultCode === "error" ||
          ab.resultCode === "fc" ||
          ab.resultCode === "dropped_third_strike";
        const hasDownstreamScorer = innList
          .slice(i + 1)
          .some(
            (later) =>
              later.runsInPlay > 0 ||
              later.resultCode === "home_run" ||
              later.resultCode === "triple" ||
              later.resultCode === "double"
          );
        if (!isOnBaseBatter || !hasDownstreamScorer) continue;

        const excessHere = Math.min(
          ab.runsInPlay - minReq,
          currentInningRuns - confirmedRuns
        );
        if (excessHere <= 0) continue;

        const curSnaps = simulateSheetRunners(innList.slice(0, i + 1), structure);
        const curSnap = curSnaps.get(ab.id);

        const nextRuns = ab.runsInPlay - excessHere;
        const syncedManual = syncAtBatAdvancesForManualRuns(
          ab,
          nextRuns,
          curSnap
        );
        innList[i] = {
          ...ab,
          advances: syncedManual.advances,
          runsInPlay: syncedManual.runsInPlay,
          rbi: syncedManual.rbi,
        };
        currentInningRuns -= excessHere;
        changed = true;
      }
    }

    const finalInningPruned = pruneStaleSheetRunnerAdvances(innList, structure);
    if (finalInningPruned.changed) {
      innList.splice(0, innList.length, ...finalInningPruned.atBats);
      changed = true;
    }

    byInning.set(inn, innList);
  }

  if (!changed) {
    return { atBats, changed: false };
  }

  const rebuilt: ScorebookV2AtBat[] = [];
  for (const inn of sortedInnings) {
    rebuilt.push(...(byInning.get(inn) || []));
  }
  return { atBats: rebuilt, changed: true };
}

/**
 * 手動で「打席得点（runsInPlay）」を変更した際、先行走者の進塁配列（to: "HP" 等）も矛盾なく自動昇格・降格同期する
 */
export function syncAtBatAdvancesForManualRuns(
  ab: ScorebookV2AtBat,
  rawNextRuns: number,
  snapshot?: AtBatRunnerSnapshot
): Pick<ScorebookV2AtBat, "advances" | "runsInPlay" | "rbi"> {
  const nextRuns = Math.max(0, Math.min(4, rawNextRuns));
  const basesBefore = snapshot?.basesBefore ?? createEmptyBaseMap();

  if (ab.resultCode === "home_run" || !snapshot) {
    return {
      advances: ab.advances,
      runsInPlay: nextRuns,
      rbi: computeDefaultRbiForAtBat(ab, nextRuns, basesBefore),
    };
  }

  let workingAdvances = ab.advances.map((a) => ({ ...a }));
  const batterSafeHp =
    !snapshot.batterSummary.isOutOnBases &&
    snapshot.batterSummary.finalBase === "HP"
      ? 1
      : 0;
  const activeScoredRunners = snapshot.precedingRunners.filter(
    (pr) => !pr.isOut && pr.finalBase === "HP"
  );
  const currentSafeHp = activeScoredRunners.length + batterSafeHp;

  if (nextRuns > currentSafeHp) {
    let toPromote = nextRuns - currentSafeHp;
    const basesAtPlay = computeBasesAtInPlayFromAdvances(
      basesBefore,
      workingAdvances
    );
    const isLoaded = Boolean(
      basesAtPlay["1B"] && basesAtPlay["2B"] && basesAtPlay["3B"]
    );

    // ホームに近い走者順（3B ➔ 2B ➔ 1B）で本塁生還へ昇格
    for (const pr of snapshot.precedingRunners) {
      if (toPromote <= 0) break;
      if (pr.isOut || pr.finalBase === "HP") continue;
      const startFrom: OccupiedBaseKey =
        pr.baseAtInPlay && pr.baseAtInPlay !== "HP"
          ? pr.baseAtInPlay
          : pr.startBase;
      const method: AdvanceMethodCode = isAwardedFirstBaseResult(ab.resultCode)
        ? isLoaded && startFrom === "3B"
          ? "walk"
          : "wp"
        : getDefaultInPlayMethodForResult(ab.resultCode, false);

      const existingInPlayId = pr.inPlayExplicitMove?.id || null;
      workingAdvances = workingAdvances.filter((a) => {
        if (existingInPlayId && a.id === existingInPlayId) return false;
        if (
          !isPrePlayAdvanceMethod(a.method) &&
          a.method !== "tiebreak" &&
          a.from === startFrom &&
          (!a.runnerName || namesLikelyMatch(a.runnerName, pr.runner.name))
        ) {
          return false;
        }
        return true;
      });
      workingAdvances.push({
        id: existingInPlayId || crypto.randomUUID(),
        runnerName: pr.runner.name,
        from: startFrom,
        to: "HP",
        method,
        isOut: false,
      });
      toPromote -= 1;
    }
  } else if (nextRuns < currentSafeHp) {
    let toDemote = currentSafeHp - nextRuns;
    // 後方の走者順（1B ➔ 2B ➔ 3B）から本塁生還を取り下げて手前の塁へ戻す
    const scoredReversed = [...activeScoredRunners].reverse();
    const defaultSafeMethod = getDefaultInPlayMethodForResult(
      ab.resultCode,
      false
    );

    for (const pr of scoredReversed) {
      if (toDemote <= 0) break;
      const startFrom: OccupiedBaseKey =
        pr.baseAtInPlay && pr.baseAtInPlay !== "HP"
          ? pr.baseAtInPlay
          : pr.startBase;
      const stopBase: OccupiedBaseKey =
        startFrom === "3B" || startFrom === "2B" || ab.resultCode === "double"
          ? "3B"
          : "2B";

      if (pr.baseAtInPlay === "HP") {
        // 投球間（本盗・暴投等）で生還していた場合は該当 HP 行を除去
        workingAdvances = workingAdvances.filter(
          (a) =>
            !(
              !a.isOut &&
              a.to === "HP" &&
              (!a.runnerName || namesLikelyMatch(a.runnerName, pr.runner.name))
            )
        );
      } else {
        const existingInPlayId = pr.inPlayExplicitMove?.id || null;
        workingAdvances = workingAdvances.filter((a) => {
          if (existingInPlayId && a.id === existingInPlayId) return false;
          if (
            !isPrePlayAdvanceMethod(a.method) &&
            a.method !== "tiebreak" &&
            (a.from === startFrom || a.to === "HP") &&
            (!a.runnerName || namesLikelyMatch(a.runnerName, pr.runner.name))
          ) {
            return false;
          }
          return true;
        });

        const isHoldAt3B = stopBase === startFrom;
        workingAdvances.push({
          id: existingInPlayId || crypto.randomUUID(),
          runnerName: pr.runner.name,
          from: startFrom,
          to: stopBase,
          method: isHoldAt3B ? "other" : defaultSafeMethod,
          isOut: false,
        });
      }
      toDemote -= 1;
    }
  }

  const sorted = sortAdvancesClosestToHomeFirst(workingAdvances);
  return {
    advances: sorted,
    runsInPlay: nextRuns,
    rbi: computeDefaultRbiForAtBat(
      { resultCode: ab.resultCode, advances: sorted },
      nextRuns,
      basesBefore
    ),
  };
}

/**
 * 同一イニング内で「すでに前の打席で本塁生還（HP）またはアウト退場した走者」の古い進塁行・残留マーカーや、
 * 該当塁に走者が存在しない幽霊進塁行を後続打席から決定論的にクレンジングし、得点・打点・アウト数を整合同期する。
 * （※打者一巡でその打者が再び安全に出塁した場合は新しい走者として正常に追跡を再開する）
 */
export function pruneStaleSheetRunnerAdvances(
  atBats: ScorebookV2AtBat[],
  structure?: ScorebookSheetStructure | null
): { atBats: ScorebookV2AtBat[]; changed: boolean } {
  if (atBats.length === 0) {
    return { atBats, changed: false };
  }

  const byInning = new Map<number, ScorebookV2AtBat[]>();
  for (const ab of atBats) {
    const inn = Math.max(1, ab.inning || 1);
    const arr = byInning.get(inn) || [];
    arr.push({
      ...ab,
      inning: inn,
      advances: ab.advances.map((a) => ({ ...a })),
    });
    byInning.set(inn, arr);
  }

  const sortedInnings = Array.from(byInning.keys()).sort((a, b) => a - b);
  let changed = false;

  for (const inn of sortedInnings) {
    const innList = byInning.get(inn) || [];
    if (innList.length === 0) continue;

    const retiredOrScoredOrders = new Set<number>();
    const retiredOrScoredNames = new Set<string>();

    const isRetiredOrScored = (order: number, rawName: string): boolean => {
      if (order > 0 && retiredOrScoredOrders.has(order)) {
        return true;
      }
      const clean = rawName.replace(/\s+/g, "").trim();
      if (!clean) return false;
      for (const prevName of retiredOrScoredNames) {
        if (namesLikelyMatch(clean, prevName)) {
          return true;
        }
      }
      return false;
    };

    for (let j = 0; j < innList.length; j++) {
      const ab = innList[j];

      if (j > 0) {
        const prefixSnaps = simulateSheetRunners(
          innList.slice(0, j),
          structure
        );
        const prevSnap = prefixSnaps.get(innList[j - 1].id);
        const outsBefore =
          prevSnap && !prevSnap.isInningOver ? prevSnap.outsAfter : 0;
        if (prevSnap?.isInningOver) {
          retiredOrScoredOrders.clear();
          retiredOrScoredNames.clear();
        }
        const validBases: BaseRunnerMap =
          prevSnap && !prevSnap.isInningOver
            ? cloneBaseMap(prevSnap.basesForNextBatter)
            : createEmptyBaseMap();

        for (const adv of ab.advances) {
          if (
            adv.method === "tiebreak" &&
            !adv.isOut &&
            (adv.to === "1B" || adv.to === "2B" || adv.to === "3B") &&
            !validBases[adv.to]
          ) {
            validBases[adv.to] = resolveRunnerFromStructureByName(
              adv.runnerName,
              inn,
              structure
            );
          }
        }

        const activeOnBases: Array<{
          base: OccupiedBaseKey;
          runner: RunnerOnBase;
        }> = [];
        const reachableFromBases = new Set<OccupiedBaseKey>();
        for (const bKey of ["3B", "2B", "1B"] as const) {
          const r = validBases[bKey];
          if (r) {
            activeOnBases.push({ base: bKey, runner: r });
            reachableFromBases.add(bKey);
          }
        }

        const initSafeBase = getBatterInitialSafeBase(ab, ab.outsInPlay >= 1);
        const nextAdvances: ScorebookV2Advance[] = [];
        let abModified = false;
        let prunedSafeHpCount = 0;
        let prunedRunnerOutCount = 0;

        const recordPruned = (prunedAdv: ScorebookV2Advance) => {
          abModified = true;
          if (!prunedAdv.isOut && prunedAdv.to === "HP") {
            prunedSafeHpCount += 1;
          }
          if (prunedAdv.isOut && prunedAdv.from !== "BAT") {
            prunedRunnerOutCount += 1;
          }
        };

        for (const adv of ab.advances) {
          if (adv.method === "tiebreak" || adv.from === "BAT") {
            nextAdvances.push(adv);
            continue;
          }

          const fromBase = adv.from;
          const rName = adv.runnerName.trim();

          // 打者自身の同一プレー内オーバーラン・進塁（1B->2B 送球間等）
          const isSamePlayBatterStretch =
            !isNoOpHoldAdvance(adv) &&
            !isAwardedFirstBaseResult(ab.resultCode) &&
            initSafeBase === fromBase &&
            !validBases[fromBase] &&
            (!rName || namesLikelyMatch(rName, ab.batterName)) &&
            (adv.method === "throw_advance" ||
              adv.method === "error" ||
              adv.isOut);
          if (isSamePlayBatterStretch) {
            nextAdvances.push(adv);
            continue;
          }

          // 1. 走者名が入っており、現在の塁上走者のいずれかに一致する場合
          const matchedActive = rName
            ? activeOnBases.find(
                (entry) =>
                  Boolean(entry.runner.name.trim()) &&
                  namesLikelyMatch(rName, entry.runner.name)
              )
            : undefined;

          if (matchedActive) {
            if (reachableFromBases.has(fromBase)) {
              nextAdvances.push(adv);
              if (
                !adv.isOut &&
                (adv.to === "1B" || adv.to === "2B" || adv.to === "3B")
              ) {
                reachableFromBases.add(adv.to);
              }
              continue;
            }
            // 実際の在塁位置（例: 2Bや3B）と adv.from（例: 1B）がズレている場合
            const actualBase = matchedActive.base;
            if (isNoOpHoldAdvance(adv)) {
              nextAdvances.push({
                ...adv,
                from: actualBase,
                to: actualBase,
                runnerName: matchedActive.runner.name || adv.runnerName,
              });
              abModified = true;
              continue;
            }
            if (
              adv.isOut ||
              adv.to === "HP" ||
              getBaseClosestToHomeRank(adv.to) >
                getBaseClosestToHomeRank(actualBase)
            ) {
              const normalized: ScorebookV2Advance = {
                ...adv,
                from: actualBase,
                runnerName: matchedActive.runner.name || adv.runnerName,
              };
              nextAdvances.push(normalized);
              if (
                !normalized.isOut &&
                (normalized.to === "1B" ||
                  normalized.to === "2B" ||
                  normalized.to === "3B")
              ) {
                reachableFromBases.add(normalized.to);
              }
              abModified = true;
              continue;
            }
            // 既に3Bにいるのに古い 1B->2B が残っている等の矛盾行は除去
            recordPruned(adv);
            continue;
          }

          // 2. 走者名が現在の塁上走者にも打者にも一致せず、既に本塁生還・アウト退場済みの走者である場合は確実に除去
          if (rName && (!ab.batterName.trim() || !namesLikelyMatch(rName, ab.batterName))) {
            const resolved = resolveRunnerFromStructureByName(
              rName,
              inn,
              structure
            );
            if (isRetiredOrScored(resolved.battingOrder, rName)) {
              recordPruned(adv);
              continue;
            }
          }

          // 3. 該当塁に実際に走者が到達可能であれば維持
          if (reachableFromBases.has(fromBase)) {
            nextAdvances.push(adv);
            if (
              !adv.isOut &&
              (adv.to === "1B" || adv.to === "2B" || adv.to === "3B")
            ) {
              reachableFromBases.add(adv.to);
            }
            continue;
          }

          // 4. 該当塁は空だが他塁に先行走者がおり、本塁生還の開始塁だけズレていた場合は最上位占有塁へスナップ
          if (
            activeOnBases.length > 0 &&
            !isNoOpHoldAdvance(adv) &&
            !adv.isOut &&
            adv.to === "HP" &&
            !isAwardedFirstBaseResult(ab.resultCode)
          ) {
            const fallbackEntry = activeOnBases.find(
              (entry) => !nextAdvances.some((na) => na.from === entry.base)
            );
            if (fallbackEntry) {
              nextAdvances.push({
                ...adv,
                from: fallbackEntry.base,
                runnerName:
                  fallbackEntry.runner.name || adv.runnerName,
              });
              abModified = true;
              continue;
            }
          }

          // それ以外の幽霊進塁・古い残留マーカーは除去
          recordPruned(adv);
        }

        if (abModified) {
          const sortedNextAdvances =
            sortAdvancesClosestToHomeFirst(nextAdvances);
          const synced = computeSyncedStatsFromAdvances(
            ab,
            sortedNextAdvances,
            outsBefore,
            validBases
          );
          const nextOutsInPlay =
            prunedRunnerOutCount > 0
              ? synced.outsInPlay
              : Math.min(Math.max(0, 3 - outsBefore), ab.outsInPlay);

          let nextRunsInPlay = ab.runsInPlay;
          let nextRbi = ab.rbi;
          const maxPossibleRunsHere =
            ab.resultCode === "home_run"
              ? 1 + activeOnBases.length
              : activeOnBases.length;

          if (prunedSafeHpCount > 0 || ab.runsInPlay > maxPossibleRunsHere) {
            const adjustedPrevRuns = Math.max(
              0,
              ab.runsInPlay - prunedSafeHpCount
            );
            const outsAfterHere = Math.min(3, outsBefore + nextOutsInPlay);
            if (
              outsAfterHere >= 3 &&
              ab.resultCode !== "home_run" &&
              isIntrinsicBatterOutResult(
                ab.resultCode,
                ab.battedDirection,
                ab.resultLabel
              ) &&
              synced.runsInPlay === 0
            ) {
              nextRunsInPlay = 0;
            } else {
              nextRunsInPlay = Math.min(
                maxPossibleRunsHere,
                Math.max(synced.runsInPlay, adjustedPrevRuns)
              );
            }
            nextRbi = computeDefaultRbiForAtBat(
              { resultCode: ab.resultCode, advances: sortedNextAdvances },
              nextRunsInPlay,
              validBases
            );
          }

          innList[j] = {
            ...ab,
            advances: sortedNextAdvances,
            outsInPlay: nextOutsInPlay,
            runsInPlay: nextRunsInPlay,
            rbi: nextRbi,
          };
          changed = true;
        }
      }

      // j番目終了時点の生還・アウト退場走者を更新
      const snapsUpToJ = simulateSheetRunners(
        innList.slice(0, j + 1),
        structure
      );
      const curSnap = snapsUpToJ.get(innList[j].id);
      if (curSnap) {
        for (const pr of curSnap.precedingRunners) {
          if (pr.isOut || pr.finalBase === "HP") {
            if (pr.runner.battingOrder > 0) {
              retiredOrScoredOrders.add(pr.runner.battingOrder);
            }
            if (pr.runner.name.trim()) {
              retiredOrScoredNames.add(pr.runner.name.trim());
            }
          }
        }
        const batterIdentity = resolveBatterRunnerIdentity(
          innList[j],
          structure
        );
        const stayedOnBase =
          !curSnap.isInningOver &&
          !curSnap.batterSummary.isOutOnBases &&
          (curSnap.batterSummary.finalBase === "1B" ||
            curSnap.batterSummary.finalBase === "2B" ||
            curSnap.batterSummary.finalBase === "3B");
        if (stayedOnBase) {
          if (batterIdentity.battingOrder > 0) {
            retiredOrScoredOrders.delete(batterIdentity.battingOrder);
          }
          if (batterIdentity.name.trim()) {
            for (const prevName of Array.from(retiredOrScoredNames)) {
              if (namesLikelyMatch(prevName, batterIdentity.name)) {
                retiredOrScoredNames.delete(prevName);
              }
            }
          }
        } else {
          if (batterIdentity.battingOrder > 0) {
            retiredOrScoredOrders.add(batterIdentity.battingOrder);
          }
          if (batterIdentity.name.trim()) {
            retiredOrScoredNames.add(batterIdentity.name.trim());
          }
        }
      }
    }

    byInning.set(inn, innList);
  }

  if (!changed) {
    return { atBats, changed: false };
  }

  const rebuilt: ScorebookV2AtBat[] = [];
  for (const inn of sortedInnings) {
    rebuilt.push(...(byInning.get(inn) || []));
  }
  return { atBats: rebuilt, changed: true };
}
