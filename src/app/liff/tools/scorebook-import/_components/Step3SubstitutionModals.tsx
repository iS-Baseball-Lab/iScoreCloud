// filepath: src/app/liff/tools/scorebook-import/_components/Step3SubstitutionModals.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import {
  type MidAtBatPriorBatterInfo,
  type MidAtBatPriorPitcherInfo,
  type OfficialPitcherDecision,
  type ScorebookBatterSlot,
  type ScorebookPinchRunnerEntry,
  type ScorebookPitcherStint,
  type ScorebookRosterPlayer,
  type ScorebookSheetStructure,
  type ScorebookSubstitution,
  type ScorebookV2AtBat,
} from "@/types/scorebook-v2";
import { syncSheetAtBatsWithStructure } from "@/lib/liff/scorebook-validator";
import {
  pruneStaleSheetRunnerAdvances,
  type OccupiedBaseKey,
} from "@/lib/liff/scorebook-runners";
import type { PinchRunnerApplyParams } from "./RunnerSituationPanel";
import {
  LiffSelect,
  type LiffSelectOption,
} from "@/components/liff/LiffSelect";

export type BatterChangeMode = "PH" | "DEF" | "STARTER" | "SINGLE_AB";
export type PitcherChangeMode = "FROM_HERE" | "SINGLE_AB";

const OFFICIAL_PITCHER_DECISION_OPTIONS: LiffSelectOption[] = [
  {
    value: "",
    label: "自動判定（規則9.17〜9.19）",
    sublabel: "イニング・得点推移から勝敗・S・Hを公認野球規則どおり自動算出",
  },
  {
    value: "win",
    label: "○ 勝利投手（記録員指定）",
    sublabel: "規則9.17(b)/(c) 先発規定回未満や継投時の公式記録員裁定で勝利を指定",
  },
  {
    value: "loss",
    label: "● 敗戦投手（記録員指定）",
    sublabel: "規則9.17(d) 公式記録員指定による敗戦投手オーバーライド",
  },
  {
    value: "save",
    label: "S セーブ（記録員指定）",
    sublabel: "規則9.19 公式記録員指定によるセーブ投手付与",
  },
  {
    value: "hold",
    label: "H ホールド（記録員指定）",
    sublabel: "リード保持救援のホールドを手動付与",
  },
  {
    value: "none",
    label: "記録なし固定",
    sublabel: "規則9.17(c) 短時間非効果的登板など勝敗・S・H対象外に固定",
  },
];

const POSITION_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "守備未指定" },
  { value: "1", label: "1 投手" },
  { value: "2", label: "2 捕手" },
  { value: "3", label: "3 一塁" },
  { value: "4", label: "4 二塁" },
  { value: "5", label: "5 三塁" },
  { value: "6", label: "6 遊撃" },
  { value: "7", label: "7 左翼" },
  { value: "8", label: "8 中堅" },
  { value: "9", label: "9 右翼" },
  { value: "DH", label: "DH 指名打者" },
];

const SUB_TYPE_LABELS: Record<ScorebookSubstitution["subType"], string> = {
  PH: "代打 (PH)",
  PR: "代走 (PR)",
  TR: "臨時代走 (TR)",
  DEF: "守備・途中出場",
};

function recomputeOrderedEndingOuts(
  items: ScorebookV2AtBat[],
  structure: ScorebookSheetStructure
): ScorebookV2AtBat[] {
  const byInning = new Map<number, ScorebookV2AtBat[]>();
  for (const item of items) {
    const inn = Math.max(1, item.inning || 1);
    const arr = byInning.get(inn) || [];
    arr.push({ ...item, inning: inn });
    byInning.set(inn, arr);
  }
  const sortedInns = Array.from(byInning.keys()).sort((a, b) => a - b);
  const ordered: ScorebookV2AtBat[] = [];
  for (const inn of sortedInns) {
    ordered.push(...(byInning.get(inn) || []));
  }

  const pruned = pruneStaleSheetRunnerAdvances(ordered, structure).atBats;
  const result: ScorebookV2AtBat[] = [];
  let activeInn = -1;
  let cumOuts = 0;
  for (const ab of pruned) {
    if (ab.inning !== activeInn) {
      activeInn = ab.inning;
      cumOuts = 0;
    }
    cumOuts = Math.min(3, cumOuts + Math.max(0, ab.outsInPlay));
    result.push({
      ...ab,
      endingOuts: cumOuts,
    });
  }
  return result;
}

function ensureBatterSlotExists(
  batters: ScorebookBatterSlot[],
  battingOrder: number
): ScorebookBatterSlot[] {
  if (batters.some((b) => b.battingOrder === battingOrder)) {
    return batters.map((b) => ({
      ...b,
      substitutions: [...b.substitutions],
    }));
  }
  const next = batters.map((b) => ({
    ...b,
    substitutions: [...b.substitutions],
  }));
  next.push({
    battingOrder,
    name: "",
    uniformNumber: "",
    position: "",
    playerId: null,
    substitutions: [],
  });
  next.sort((a, b) => a.battingOrder - b.battingOrder);
  return next;
}

function normalizePitcherIdentityKey(
  name: string,
  playerId: string | null
): string {
  if (playerId) return `id:${playerId}`;
  return `name:${name.replace(/\s+/g, "").trim()}`;
}

/**
 * STEP 3 の特定打席から「代打(PH)・守備交代(DEF)・スタメン修正・この1打席のみ変更」を適用する純関数
 */
export function applyAtBatBatterChange(params: {
  atBats: ScorebookV2AtBat[];
  structure: ScorebookSheetStructure;
  targetAtBatId: string;
  mode: BatterChangeMode;
  name: string;
  uniformNumber: string;
  position: string;
  playerId: string | null;
  midAtBatPriorBatter?: MidAtBatPriorBatterInfo | null;
}): {
  structure: ScorebookSheetStructure;
  atBats: ScorebookV2AtBat[];
} {
  const {
    atBats,
    structure,
    targetAtBatId,
    mode,
    name,
    uniformNumber,
    position,
    playerId,
    midAtBatPriorBatter,
  } = params;
  const cleanName = name.trim();
  const cleanUniform = uniformNumber.trim();
  const cleanPos = position.trim();
  const targetIdx = atBats.findIndex((a) => a.id === targetAtBatId);
  if (!cleanName || targetIdx < 0) {
    return { structure, atBats };
  }
  const targetAb = atBats[targetIdx];

  const attachPriorBatterIfSpecified = (
    items: ScorebookV2AtBat[],
    allowPrior: boolean
  ): ScorebookV2AtBat[] => {
    if (midAtBatPriorBatter === undefined) return items;
    return items.map((ab) => {
      if (ab.id !== targetAtBatId) return ab;
      return {
        ...ab,
        midAtBatPriorBatter:
          allowPrior && midAtBatPriorBatter ? midAtBatPriorBatter : undefined,
      };
    });
  };

  if (mode === "SINGLE_AB") {
    const updatedSingle = atBats.map((ab) => {
      if (ab.id !== targetAtBatId) return ab;
      return {
        ...ab,
        batterName: cleanName,
        batterPlayerId: playerId,
        manualBatterOverride: true,
        advances: ab.advances.map((adv) =>
          adv.from === "BAT" ? { ...adv, runnerName: cleanName } : adv
        ),
      };
    });
    const syncedRunners = syncSheetAtBatsWithStructure(updatedSingle, structure);
    return {
      structure,
      atBats: attachPriorBatterIfSpecified(
        recomputeOrderedEndingOuts(syncedRunners, structure),
        true
      ),
    };
  }

  const nextBatters = ensureBatterSlotExists(
    structure.batters,
    targetAb.battingOrder
  );
  const slotIdx = nextBatters.findIndex(
    (b) => b.battingOrder === targetAb.battingOrder
  );
  if (slotIdx < 0) {
    return { structure, atBats };
  }
  const slot = nextBatters[slotIdx];

  if (mode === "STARTER") {
    nextBatters[slotIdx] = {
      ...slot,
      name: cleanName,
      uniformNumber: cleanUniform || slot.uniformNumber,
      position: cleanPos || slot.position,
      playerId,
    };
    const nextStructure: ScorebookSheetStructure = {
      ...structure,
      batters: nextBatters,
    };
    const clearedOverrides = atBats.map((ab) =>
      ab.battingOrder === targetAb.battingOrder
        ? { ...ab, manualBatterOverride: false }
        : ab
    );
    const synced = syncSheetAtBatsWithStructure(clearedOverrides, nextStructure);
    return {
      structure: nextStructure,
      atBats: attachPriorBatterIfSpecified(
        recomputeOrderedEndingOuts(synced, nextStructure),
        false
      ),
    };
  }

  // PH または DEF（この打席から途中交代）
  const isFirstAtBatOfInning =
    !atBats
      .slice(0, targetIdx)
      .some((prev) => prev.inning === targetAb.inning);
  const existingIdx = slot.substitutions.findIndex(
    (s) =>
      (s.subType === "PH" || s.subType === "DEF") &&
      s.enteredAtBatId === targetAb.id
  );
  const nextSub: ScorebookSubstitution = {
    id:
      existingIdx >= 0
        ? slot.substitutions[existingIdx].id
        : crypto.randomUUID(),
    inningEntered: Math.max(1, targetAb.inning),
    enteredFromBatterOrder: isFirstAtBatOfInning
      ? null
      : targetAb.battingOrder,
    enteredColumnIndex: Math.max(1, targetAb.columnIndex || 1),
    enteredAtBatId: targetAb.id,
    subType: mode === "PH" ? "PH" : "DEF",
    name: cleanName,
    uniformNumber: cleanUniform,
    position: mode === "DEF" ? cleanPos : "",
    playerId,
  };

  const nextSubs = [...slot.substitutions];
  if (existingIdx >= 0) {
    nextSubs[existingIdx] = nextSub;
  } else {
    nextSubs.push(nextSub);
  }
  nextBatters[slotIdx] = {
    ...slot,
    substitutions: nextSubs,
  };

  const nextStructure: ScorebookSheetStructure = {
    ...structure,
    batters: nextBatters,
  };
  const clearedOverrides = atBats.map((ab, idx) =>
    idx >= targetIdx && ab.battingOrder === targetAb.battingOrder
      ? { ...ab, manualBatterOverride: false }
      : ab
  );
  const synced = syncSheetAtBatsWithStructure(clearedOverrides, nextStructure);
  return {
    structure: nextStructure,
    atBats: attachPriorBatterIfSpecified(
      recomputeOrderedEndingOuts(synced, nextStructure),
      mode === "PH"
    ),
  };
}

/**
 * 指定打順の途中交代エントリを解除し、スタメン（または前の交代選手）へ戻す純関数
 */
export function removeBatterSubstitutionForOrder(params: {
  atBats: ScorebookV2AtBat[];
  structure: ScorebookSheetStructure;
  battingOrder: number;
  subId: string;
}): {
  structure: ScorebookSheetStructure;
  atBats: ScorebookV2AtBat[];
} {
  const { atBats, structure, battingOrder, subId } = params;
  const targetSlot = structure.batters.find(
    (b) => b.battingOrder === battingOrder
  );
  const removedSub = targetSlot?.substitutions.find((s) => s.id === subId);

  const nextBatters = structure.batters.map((slot) =>
    slot.battingOrder === battingOrder
      ? {
          ...slot,
          substitutions: slot.substitutions.filter((s) => s.id !== subId),
        }
      : slot
  );
  const nextStructure: ScorebookSheetStructure = {
    ...structure,
    batters: nextBatters,
  };

  const cleanedAtBats = atBats.map((ab) => {
    let nextAb = ab;
    if (
      removedSub &&
      removedSub.subType === "PH" &&
      removedSub.enteredAtBatId &&
      ab.id === removedSub.enteredAtBatId &&
      ab.midAtBatPriorBatter
    ) {
      nextAb = { ...nextAb, midAtBatPriorBatter: undefined };
    }
    if (
      removedSub &&
      (removedSub.subType === "PR" || removedSub.subType === "TR") &&
      Array.isArray(nextAb.pinchRunners) &&
      nextAb.pinchRunners.length > 0 &&
      (removedSub.enteredAtBatId
        ? nextAb.id === removedSub.enteredAtBatId
        : nextAb.inning === removedSub.inningEntered)
    ) {
      const filteredPr = nextAb.pinchRunners.filter(
        (pr) => pr.battingOrder !== battingOrder
      );
      return {
        ...nextAb,
        pinchRunners: filteredPr.length > 0 ? filteredPr : undefined,
      };
    }
    return nextAb;
  });

  const synced = syncSheetAtBatsWithStructure(cleanedAtBats, nextStructure);
  return {
    structure: nextStructure,
    atBats: recomputeOrderedEndingOuts(synced, nextStructure),
  };
}

/**
 * STEP 3 の特定打席から「この打席から投手交代（回途中対応）」または「この1打席のみ投手変更」を適用する純関数
 */
export function applyAtBatPitcherChange(params: {
  atBats: ScorebookV2AtBat[];
  structure: ScorebookSheetStructure;
  targetAtBatId: string;
  mode: PitcherChangeMode;
  name: string;
  uniformNumber: string;
  playerId: string | null;
  midAtBatPriorPitcher?: MidAtBatPriorPitcherInfo | null;
}): {
  structure: ScorebookSheetStructure;
  atBats: ScorebookV2AtBat[];
} {
  const {
    atBats,
    structure,
    targetAtBatId,
    mode,
    name,
    uniformNumber,
    playerId,
    midAtBatPriorPitcher,
  } = params;
  const cleanName = name.trim();
  const cleanUniform = uniformNumber.trim();
  const targetIdx = atBats.findIndex((a) => a.id === targetAtBatId);
  if (!cleanName || targetIdx < 0) {
    return { structure, atBats };
  }

  if (mode === "SINGLE_AB") {
    const nextAtBats = atBats.map((ab) =>
      ab.id === targetAtBatId
        ? {
            ...ab,
            pitcherName: cleanName,
            pitcherPlayerId: playerId,
            manualPitcherOverride: true,
            ...(midAtBatPriorPitcher !== undefined
              ? { midAtBatPriorPitcher: midAtBatPriorPitcher || undefined }
              : {}),
          }
        : ab
    );
    return { structure, atBats: nextAtBats };
  }

  const targetAb = atBats[targetIdx];
  const oldKey = normalizePitcherIdentityKey(
    targetAb.pitcherName,
    targetAb.pitcherPlayerId
  );
  const newKey = normalizePitcherIdentityKey(cleanName, playerId);

  let hitLaterDifferentReliever = false;
  const updatedAtBats = atBats.map((ab, idx) => {
    if (idx < targetIdx) return ab;
    if (idx === targetIdx) {
      return {
        ...ab,
        pitcherName: cleanName,
        pitcherPlayerId: playerId,
        manualPitcherOverride: false,
        ...(midAtBatPriorPitcher !== undefined
          ? { midAtBatPriorPitcher: midAtBatPriorPitcher || undefined }
          : {}),
      };
    }
    if (ab.manualPitcherOverride) return ab;
    if (hitLaterDifferentReliever) return ab;

    const curKey = normalizePitcherIdentityKey(
      ab.pitcherName,
      ab.pitcherPlayerId
    );
    const isEmptyCur = !ab.pitcherName.trim() && !ab.pitcherPlayerId;
    const isEmptyOld =
      !targetAb.pitcherName.trim() && !targetAb.pitcherPlayerId;

    if (!isEmptyOld && !isEmptyCur && curKey !== oldKey && curKey !== newKey) {
      hitLaterDifferentReliever = true;
      return ab;
    }

    return {
      ...ab,
      pitcherName: cleanName,
      pitcherPlayerId: playerId,
      manualPitcherOverride: false,
    };
  });

  // 時系列の連続登板スパンから structure.pitchers を矛盾なく再構築（回途中交代時は自動で交代イニングが重なり、先頭交代時は綺麗に分割）
  const maxStructureInning = Math.max(
    1,
    structure.innings[structure.innings.length - 1]?.inning || 7,
    ...updatedAtBats.map((a) => a.inning || 1)
  );

  interface ContiguousPitcherRun {
    key: string;
    name: string;
    playerId: string | null;
    fromInning: number;
    fromBatterOrder: number | null;
    fromColumnIndex: number | null;
    toInning: number;
  }

  const runs: ContiguousPitcherRun[] = [];
  for (let abIdx = 0; abIdx < updatedAtBats.length; abIdx++) {
    const ab = updatedAtBats[abIdx];
    if (ab.manualPitcherOverride) continue;
    const pName = ab.pitcherName.trim();
    if (!pName && !ab.pitcherPlayerId) continue;
    const key = normalizePitcherIdentityKey(pName, ab.pitcherPlayerId);
    const last = runs[runs.length - 1];
    if (last && last.key === key) {
      last.fromInning = Math.min(last.fromInning, ab.inning);
      last.toInning = Math.max(last.toInning, ab.inning);
    } else {
      const hasPriorInSameInning = updatedAtBats
        .slice(0, abIdx)
        .some((prev) => !prev.manualPitcherOverride && prev.inning === ab.inning);
      runs.push({
        key,
        name: pName,
        playerId: ab.pitcherPlayerId,
        fromInning: ab.inning,
        fromBatterOrder: hasPriorInSameInning ? ab.battingOrder : null,
        fromColumnIndex: hasPriorInSameInning
          ? Math.max(1, ab.columnIndex || 1)
          : null,
        toInning: ab.inning,
      });
    }
  }

  let nextPitchers: ScorebookPitcherStint[];
  if (runs.length === 0) {
    nextPitchers = [
      {
        id: structure.pitchers[0]?.id || crypto.randomUUID(),
        order: 1,
        name: cleanName,
        uniformNumber: cleanUniform,
        playerId,
        fromInning: 1,
        fromBatterOrder: null,
        fromColumnIndex: null,
        toInning: maxStructureInning,
        manualDecision: structure.pitchers[0]?.manualDecision ?? null,
      },
    ];
  } else {
    runs[0].fromInning = Math.min(1, runs[0].fromInning);
    runs[0].fromBatterOrder = null;
    runs[0].fromColumnIndex = null;
    runs[runs.length - 1].toInning = Math.max(
      runs[runs.length - 1].toInning,
      maxStructureInning
    );

    const usedExistingIds = new Set<string>();
    nextPitchers = runs.map((run, rIdx) => {
      const matchedExisting = structure.pitchers.find(
        (ep) =>
          !usedExistingIds.has(ep.id) &&
          normalizePitcherIdentityKey(ep.name, ep.playerId) === run.key
      );
      if (matchedExisting) {
        usedExistingIds.add(matchedExisting.id);
      }
      const isNewlyApplied = run.key === newKey;
      return {
        id: matchedExisting?.id || crypto.randomUUID(),
        order: rIdx + 1,
        name: run.name,
        uniformNumber: isNewlyApplied
          ? cleanUniform || matchedExisting?.uniformNumber || ""
          : matchedExisting?.uniformNumber || "",
        playerId: run.playerId,
        fromInning: run.fromInning,
        fromBatterOrder: run.fromBatterOrder,
        fromColumnIndex: run.fromColumnIndex,
        toInning: run.toInning,
        manualDecision: matchedExisting?.manualDecision ?? null,
      };
    });
  }

  const nextStructure: ScorebookSheetStructure = {
    ...structure,
    pitchers: nextPitchers,
  };

  return {
    structure: nextStructure,
    atBats: updatedAtBats,
  };
}

/**
 * STEP 3 の特定打席で塁上の走者に代走(PR)・臨時代走(TR)を送る純関数
 */
export function applyAtBatPinchRunnerChange(params: {
  atBats: ScorebookV2AtBat[];
  structure: ScorebookSheetStructure;
  targetAtBatId: string;
  runnerParams: PinchRunnerApplyParams;
}): {
  structure: ScorebookSheetStructure;
  atBats: ScorebookV2AtBat[];
} {
  const { atBats, structure, targetAtBatId, runnerParams } = params;
  const targetIdx = atBats.findIndex((a) => a.id === targetAtBatId);
  const cleanName = runnerParams.name.trim();
  const cleanUniform = runnerParams.uniformNumber.trim();
  if (!cleanName || targetIdx < 0) {
    return { structure, atBats };
  }
  const targetAb = atBats[targetIdx];

  const entry: ScorebookPinchRunnerEntry = {
    base: runnerParams.startBase,
    subType: runnerParams.subType,
    battingOrder: runnerParams.battingOrder,
    replacedName: runnerParams.currentRunnerName,
    name: cleanName,
    uniformNumber: cleanUniform,
    playerId: runnerParams.playerId,
  };

  const withPinchRunnerAtBats = atBats.map((ab) => {
    if (ab.id !== targetAtBatId) return ab;
    const prevEntries = (ab.pinchRunners || []).filter(
      (e) =>
        e.base !== runnerParams.startBase &&
        !(
          runnerParams.battingOrder > 0 &&
          e.battingOrder === runnerParams.battingOrder
        )
    );
    return {
      ...ab,
      pinchRunners: [...prevEntries, entry],
    };
  });

  let nextStructure = structure;
  if (runnerParams.battingOrder > 0) {
    const nextBatters = ensureBatterSlotExists(
      structure.batters,
      runnerParams.battingOrder
    );
    const slotIdx = nextBatters.findIndex(
      (b) => b.battingOrder === runnerParams.battingOrder
    );
    if (slotIdx >= 0) {
      const slot = nextBatters[slotIdx];
      const existingIdx = slot.substitutions.findIndex(
        (s) =>
          (s.subType === "PR" || s.subType === "TR") &&
          s.enteredAtBatId === targetAb.id
      );
      const nextSub: ScorebookSubstitution = {
        id:
          existingIdx >= 0
            ? slot.substitutions[existingIdx].id
            : crypto.randomUUID(),
        inningEntered: Math.max(1, targetAb.inning),
        enteredColumnIndex: Math.max(1, targetAb.columnIndex || 1),
        enteredAtBatId: targetAb.id,
        subType: runnerParams.subType,
        name: cleanName,
        uniformNumber: cleanUniform,
        position: "",
        playerId: runnerParams.playerId,
      };
      const nextSubs = [...slot.substitutions];
      if (existingIdx >= 0) {
        nextSubs[existingIdx] = nextSub;
      } else {
        nextSubs.push(nextSub);
      }
      nextBatters[slotIdx] = {
        ...slot,
        substitutions: nextSubs,
      };
      nextStructure = {
        ...structure,
        batters: nextBatters,
      };
    }
  }

  const synced = syncSheetAtBatsWithStructure(
    withPinchRunnerAtBats,
    nextStructure
  );
  return {
    structure: nextStructure,
    atBats: recomputeOrderedEndingOuts(synced, nextStructure),
  };
}

/**
 * STEP 3 の特定打席で設定した代走(PR)・臨時代走(TR)を解除する純関数
 */
export function removeAtBatPinchRunnerChange(params: {
  atBats: ScorebookV2AtBat[];
  structure: ScorebookSheetStructure;
  targetAtBatId: string;
  startBase: OccupiedBaseKey;
  battingOrder: number;
}): {
  structure: ScorebookSheetStructure;
  atBats: ScorebookV2AtBat[];
} {
  const { atBats, structure, targetAtBatId, startBase, battingOrder } = params;
  const cleanedAtBats = atBats.map((ab) => {
    if (ab.id !== targetAtBatId || !Array.isArray(ab.pinchRunners)) return ab;
    const nextPr = ab.pinchRunners.filter(
      (e) =>
        e.base !== startBase &&
        !(battingOrder > 0 && e.battingOrder === battingOrder)
    );
    return {
      ...ab,
      pinchRunners: nextPr.length > 0 ? nextPr : undefined,
    };
  });

  let nextStructure = structure;
  if (battingOrder > 0) {
    nextStructure = {
      ...structure,
      batters: structure.batters.map((slot) =>
        slot.battingOrder === battingOrder
          ? {
              ...slot,
              substitutions: slot.substitutions.filter(
                (s) =>
                  !(
                    (s.subType === "PR" || s.subType === "TR") &&
                    s.enteredAtBatId === targetAtBatId
                  )
              ),
            }
          : slot
      ),
    };
  }

  const synced = syncSheetAtBatsWithStructure(cleanedAtBats, nextStructure);
  return {
    structure: nextStructure,
    atBats: recomputeOrderedEndingOuts(synced, nextStructure),
  };
}

/**
 * 継投追加時に、前の投手が最終回までになっていた場合は自動で前半・後半に分割して追加する純関数
 */
export function smartAppendPitcherStint(
  structure: ScorebookSheetStructure,
  maxInning: number
): ScorebookSheetStructure {
  const prevList = [...structure.pitchers];
  const prevLast = prevList[prevList.length - 1];
  let nextFrom = 1;
  if (prevLast) {
    if (prevLast.toInning >= maxInning && prevLast.fromInning < maxInning) {
      const splitInn = Math.max(
        prevLast.fromInning + 1,
        Math.floor((prevLast.fromInning + maxInning) / 2) + 1
      );
      prevList[prevList.length - 1] = {
        ...prevLast,
        toInning: splitInn - 1,
      };
      nextFrom = splitInn;
    } else {
      nextFrom = Math.min(maxInning, prevLast.toInning + 1);
    }
  }
  return {
    ...structure,
    pitchers: [
      ...prevList,
      {
        id: crypto.randomUUID(),
        order: prevList.length + 1,
        name: "",
        uniformNumber: "",
        playerId: null,
        fromInning: nextFrom,
        toInning: maxInning,
      },
    ],
  };
}

interface AtBatPlayerSubstitutionPanelProps {
  atBat: ScorebookV2AtBat;
  structure: ScorebookSheetStructure | null;
  atBats: ScorebookV2AtBat[];
  roster: ScorebookRosterPlayer[];
  isOpen: boolean;
  initialTab?: "batter" | "pitcher";
  onToggleOpen: (open: boolean, tab?: "batter" | "pitcher") => void;
  onApply: (
    nextStructure: ScorebookSheetStructure,
    nextAtBats: ScorebookV2AtBat[]
  ) => void;
}

/**
 * STEP 3 の打席詳細モーダル内で、原本マスを見ながらその場で「代打・守備交代・スタメン修正・回途中継投」を行えるパネル
 */
export function AtBatPlayerSubstitutionPanel({
  atBat,
  structure,
  atBats,
  roster,
  isOpen,
  initialTab = "batter",
  onToggleOpen,
  onApply,
}: AtBatPlayerSubstitutionPanelProps) {
  const [activeTab, setActiveTab] = useState<"batter" | "pitcher">(initialTab);
  const [batterMode, setBatterMode] = useState<BatterChangeMode>("PH");
  const [batterRosterId, setBatterRosterId] = useState<string>("");
  const [batterName, setBatterName] = useState<string>("");
  const [batterUniform, setBatterUniform] = useState<string>("");
  const [batterPos, setBatterPos] = useState<string>("");
  const [isMidCountBatterSub, setIsMidCountBatterSub] = useState<boolean>(
    Boolean(atBat.midAtBatPriorBatter)
  );
  const [midBatterBalls, setMidBatterBalls] = useState<number>(
    atBat.midAtBatPriorBatter?.ballsBeforeSub ?? 0
  );
  const [midBatterStrikes, setMidBatterStrikes] = useState<number>(
    atBat.midAtBatPriorBatter?.strikesBeforeSub ?? 2
  );

  const [pitcherMode, setPitcherMode] =
    useState<PitcherChangeMode>("FROM_HERE");
  const [pitcherRosterId, setPitcherRosterId] = useState<string>("");
  const [pitcherName, setPitcherName] = useState<string>("");
  const [pitcherUniform, setPitcherUniform] = useState<string>("");
  const [isMidCountPitcherSub, setIsMidCountPitcherSub] = useState<boolean>(
    Boolean(atBat.midAtBatPriorPitcher)
  );
  const [midPitcherBalls, setMidPitcherBalls] = useState<number>(
    atBat.midAtBatPriorPitcher?.ballsBeforeChange ?? 2
  );
  const [midPitcherStrikes, setMidPitcherStrikes] = useState<number>(
    atBat.midAtBatPriorPitcher?.strikesBeforeChange ?? 0
  );
  const [appliedToast, setAppliedToast] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setAppliedToast(null);
    setBatterRosterId("");
    setBatterName("");
    setBatterUniform("");
    setBatterPos("");
    setIsMidCountBatterSub(Boolean(atBat.midAtBatPriorBatter));
    setMidBatterBalls(atBat.midAtBatPriorBatter?.ballsBeforeSub ?? 0);
    setMidBatterStrikes(atBat.midAtBatPriorBatter?.strikesBeforeSub ?? 2);
    setPitcherRosterId("");
    setPitcherName("");
    setPitcherUniform("");
    setIsMidCountPitcherSub(Boolean(atBat.midAtBatPriorPitcher));
    setMidPitcherBalls(atBat.midAtBatPriorPitcher?.ballsBeforeChange ?? 2);
    setMidPitcherStrikes(atBat.midAtBatPriorPitcher?.strikesBeforeChange ?? 0);
  }, [atBat.id, atBat.midAtBatPriorBatter, atBat.midAtBatPriorPitcher]);

  const currentSlot = useMemo(
    () =>
      structure?.batters.find((b) => b.battingOrder === atBat.battingOrder) ||
      null,
    [structure, atBat.battingOrder]
  );

  const usedBatterIds = useMemo(() => {
    const ids = new Set<string>();
    if (!structure) return ids;
    for (const b of structure.batters) {
      if (b.playerId) ids.add(b.playerId);
      for (const s of b.substitutions) {
        if (s.playerId && s.subType !== "TR") ids.add(s.playerId);
      }
    }
    return ids;
  }, [structure]);

  const usedPitcherIds = useMemo(() => {
    const ids = new Set<string>();
    if (!structure) return ids;
    for (const p of structure.pitchers) {
      if (p.playerId) ids.add(p.playerId);
    }
    return ids;
  }, [structure]);

  if (!structure) return null;

  const benchBatters = roster.filter((p) => !usedBatterIds.has(p.id));
  const activeBatters = roster.filter((p) => usedBatterIds.has(p.id));
  const benchPitchers = roster.filter((p) => !usedPitcherIds.has(p.id));
  const activePitchers = roster.filter((p) => usedPitcherIds.has(p.id));

  const orderSubs = currentSlot?.substitutions || [];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden transition-colors">
      <button
        type="button"
        onClick={() => onToggleOpen(!isOpen, activeTab)}
        aria-expanded={isOpen}
        className={`w-full flex items-center justify-between gap-2 text-left cursor-pointer transition-colors ${
          isOpen
            ? "px-3 py-2.5 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary"
            : "px-3 py-2.5 rounded-2xl hover:bg-muted"
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <UserCheck
            className={`w-3.5 h-3.5 shrink-0 ${
              isOpen ? "text-blue-400" : "text-primary"
            }`}
          />
          <span
            className={`text-xs font-black ${
              isOpen ? "text-white" : "text-foreground"
            }`}
          >
            選手交代・打者/投手変更
          </span>
          <span
            className={`px-1.5 py-0.5 rounded-md border text-[10px] font-black ${
              isOpen
                ? "bg-slate-800 border-slate-700 text-slate-300"
                : "bg-muted border-border text-muted-foreground"
            }`}
          >
            打者: {atBat.batterName || "未設定"} / 投手:{" "}
            {atBat.pitcherName || "未設定"}
          </span>
          {orderSubs.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-black">
              {atBat.battingOrder}番交代{orderSubs.length}件
            </span>
          )}
        </div>
        <span
          className={`text-[10px] font-black flex items-center gap-0.5 shrink-0 ${
            isOpen ? "text-blue-300" : "text-primary"
          }`}
        >
          <span>{isOpen ? "閉じる" : "代打・継投"}</span>
          {isOpen ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </span>
      </button>

      {isOpen && (
        <div className="p-3 space-y-2.5">
          {appliedToast && (
            <div className="px-2.5 py-1.5 rounded-xl bg-emerald-500/12 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-[11px] font-black">
              ✓ {appliedToast}
            </div>
          )}

          {/* 打者交代 / 投手交代 サブタブ */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-muted border border-border">
            <button
              type="button"
              onClick={() => setActiveTab("batter")}
              className={`py-1.5 px-2 rounded-lg border text-[11px] font-black cursor-pointer transition-colors ${
                activeTab === "batter"
                  ? "bg-card text-foreground border-border shadow-xs"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              打者交代・変更（{atBat.battingOrder}番）
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("pitcher")}
              className={`py-1.5 px-2 rounded-lg border text-[11px] font-black cursor-pointer transition-colors ${
                activeTab === "pitcher"
                  ? "bg-card text-foreground border-border shadow-xs"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              投手交代・継投変更
            </button>
          </div>

          {activeTab === "batter" ? (
            <div className="space-y-2">
              {atBat.midAtBatPriorBatter && (
                <div className="px-2.5 py-1.5 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-between gap-2 text-[10px] font-black text-primary">
                  <span>
                    規則9.15(b) カウント途中代打: 前打者{" "}
                    {atBat.midAtBatPriorBatter.name}（
                    {atBat.midAtBatPriorBatter.ballsBeforeSub}B-
                    {atBat.midAtBatPriorBatter.strikesBeforeSub}S 時点で交代）
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const nextAtBats = atBats.map((ab) =>
                        ab.id === atBat.id
                          ? { ...ab, midAtBatPriorBatter: undefined }
                          : ab
                      );
                      onApply(structure, nextAtBats);
                      setIsMidCountBatterSub(false);
                      setAppliedToast("カウント途中代打の記録を解除しました");
                    }}
                    className="px-2 py-0.5 rounded-md bg-card border border-border text-destructive text-[10px] font-black cursor-pointer shrink-0"
                  >
                    解除
                  </button>
                </div>
              )}

              {/* 既存の交代履歴（解除ボタン付き） */}
              {orderSubs.length > 0 && (
                <div className="p-2 rounded-xl bg-muted border border-border space-y-1">
                  <span className="text-[10px] font-black text-muted-foreground block">
                    {atBat.battingOrder}番の途中交代履歴（スタメン:{" "}
                    {currentSlot?.name || "未設定"}）:
                  </span>
                  {orderSubs.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center justify-between gap-2 text-[11px] font-black text-foreground bg-card px-2 py-1 rounded-lg border border-border"
                    >
                      <span>
                        {sub.inningEntered}回 {SUB_TYPE_LABELS[sub.subType]}:{" "}
                        {sub.uniformNumber ? `#${sub.uniformNumber} ` : ""}
                        {sub.name}
                        {sub.position ? `（守備:${sub.position}）` : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const res = removeBatterSubstitutionForOrder({
                            atBats,
                            structure,
                            battingOrder: atBat.battingOrder,
                            subId: sub.id,
                          });
                          onApply(res.structure, res.atBats);
                          setAppliedToast(
                            `${sub.name} の途中交代を解除しました`
                          );
                        }}
                        className="px-2 py-0.5 rounded-md bg-destructive/10 text-destructive text-[10px] font-black cursor-pointer shrink-0"
                      >
                        解除
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* 交代モード選択 */}
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    {
                      id: "PH",
                      label: "代打 (PH)・この打席〜",
                    },
                    {
                      id: "DEF",
                      label: "守備・途中出場・この打席〜",
                    },
                    {
                      id: "STARTER",
                      label: "スタメン修正（1回〜全打席）",
                    },
                    {
                      id: "SINGLE_AB",
                      label: "この1打席のみ打者変更",
                    },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setBatterMode(opt.id);
                      if (opt.id === "STARTER" && currentSlot && !batterName) {
                        setBatterName(currentSlot.name);
                        setBatterUniform(currentSlot.uniformNumber);
                        setBatterPos(currentSlot.position);
                        setBatterRosterId(currentSlot.playerId || "");
                      }
                    }}
                    className={`py-1.5 px-2 rounded-lg border text-[10px] font-black cursor-pointer text-left transition-colors ${
                      batterMode === opt.id
                        ? "bg-primary/12 text-primary border-primary/40 shadow-2xs"
                        : "bg-muted border-border text-foreground hover:bg-muted/80"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {structure.isMyTeamBatting && roster.length > 0 && (
                <LiffSelect
                  value={batterRosterId}
                  onChange={(pid) => {
                    setBatterRosterId(pid);
                    const matched = roster.find((p) => p.id === pid);
                    if (matched) {
                      setBatterName(matched.name);
                      setBatterUniform(matched.uniformNumber || "");
                      if (!batterPos && matched.primaryPosition) {
                        setBatterPos(matched.primaryPosition);
                      }
                    }
                  }}
                  title={`${atBat.battingOrder}番の交代・変更選手を選択`}
                  searchable={true}
                  searchPlaceholder="背番号・選手名で検索..."
                  size="sm"
                  className="w-full bg-muted"
                  ariaLabel="登録メンバーから打者を選択"
                  options={[
                    {
                      value: "",
                      label: "登録メンバーから選択（または下に直接入力）",
                    },
                    ...benchBatters.map(
                      (p): LiffSelectOption => ({
                        value: p.id,
                        label: `#${p.uniformNumber} ${p.name}`,
                        group: "控え・未出場メンバー（推奨）",
                        sublabel: p.primaryPosition
                          ? `主守備: ${p.primaryPosition}`
                          : undefined,
                        keywords: `${p.uniformNumber} ${p.name} ${
                          p.nameKana || ""
                        }`,
                      })
                    ),
                    ...activeBatters.map(
                      (p): LiffSelectOption => ({
                        value: p.id,
                        label: `#${p.uniformNumber} ${p.name}`,
                        group: "出場中メンバー",
                        sublabel: p.primaryPosition
                          ? `主守備: ${p.primaryPosition}`
                          : undefined,
                        keywords: `${p.uniformNumber} ${p.name} ${
                          p.nameKana || ""
                        }`,
                      })
                    ),
                  ]}
                />
              )}

              <div className="grid grid-cols-12 gap-1.5">
                <input
                  type="text"
                  value={batterUniform}
                  onChange={(e) => setBatterUniform(e.target.value)}
                  placeholder="背番"
                  className="col-span-3 h-9 px-2 rounded-xl bg-muted border border-border text-xs font-black text-center text-foreground"
                />
                <input
                  type="text"
                  value={batterName}
                  onChange={(e) => {
                    const v = e.target.value;
                    setBatterName(v);
                    if (batterRosterId) {
                      const matched = roster.find(
                        (p) => p.id === batterRosterId
                      );
                      if (matched && matched.name !== v) {
                        setBatterRosterId("");
                      }
                    }
                  }}
                  placeholder="交代後の打者名を入力"
                  className="col-span-5 h-9 px-2.5 rounded-xl bg-muted border border-border text-xs font-black text-foreground"
                />
                <LiffSelect
                  value={batterPos}
                  onChange={(val) => setBatterPos(val)}
                  title="守備位置を選択"
                  size="sm"
                  searchable={false}
                  disabled={batterMode === "PH" || batterMode === "SINGLE_AB"}
                  className="col-span-4 w-full bg-muted"
                  ariaLabel="守備位置"
                  options={POSITION_OPTIONS}
                />
              </div>

              {(batterMode === "PH" || batterMode === "SINGLE_AB") && (
                <div className="p-2 rounded-xl bg-muted border border-border space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setIsMidCountBatterSub((prev) => !prev)}
                      className={`px-2.5 py-1 rounded-lg border text-[10px] font-black cursor-pointer transition-colors ${
                        isMidCountBatterSub
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-foreground border-border"
                      }`}
                    >
                      {isMidCountBatterSub ? "✓ " : "＋ "}
                      カウント途中の代打（規則9.15(b)）
                    </button>
                    <span className="text-[10px] font-bold text-muted-foreground">
                      前打者:{" "}
                      {atBat.midAtBatPriorBatter?.name ||
                        atBat.batterName ||
                        currentSlot?.name ||
                        "未設定"}
                    </span>
                  </div>
                  {isMidCountBatterSub && (
                    <div className="space-y-1.5 pt-0.5">
                      <div className="grid grid-cols-2 gap-1.5">
                        <LiffSelect
                          value={String(midBatterBalls)}
                          onChange={(val) => setMidBatterBalls(Number(val))}
                          title="代打起用時のボールカウントを選択"
                          size="xs"
                          searchable={false}
                          className="w-full bg-card"
                          ariaLabel="代打起用時のボールカウント"
                          options={[0, 1, 2, 3].map((b) => ({
                            value: String(b),
                            label: `交代時 ${b} ボール`,
                          }))}
                        />
                        <LiffSelect
                          value={String(midBatterStrikes)}
                          onChange={(val) => setMidBatterStrikes(Number(val))}
                          title="代打起用時のストライクカウントを選択"
                          size="xs"
                          searchable={false}
                          className="w-full bg-card"
                          ariaLabel="代打起用時のストライクカウント"
                          options={[0, 1, 2].map((s) => ({
                            value: String(s),
                            label: `交代時 ${s} ストライク`,
                            sublabel:
                              s === 2
                                ? "三振時は前打者に打数・三振を記録（規則9.15(b)）"
                                : "全結果とも代打に記録",
                          }))}
                        />
                      </div>
                      <p className="text-[10px] font-bold text-muted-foreground leading-snug">
                        {midBatterStrikes >= 2
                          ? "※2ストライク後の代打で三振に倒れた場合は前打者の三振、それ以外の結果は代打に記録されます。"
                          : "※0〜1ストライクでの代打は三振を含めすべての結果が代打に記録されます。"}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-0.5">
                <span className="text-[10px] font-bold text-muted-foreground">
                  ※塁上の走者への「代走(PR/TR)」は下部のSTEP 3走者カードから指定できます
                </span>
                <button
                  type="button"
                  disabled={!batterName.trim()}
                  onClick={() => {
                    const priorName = (
                      atBat.midAtBatPriorBatter?.name ||
                      atBat.batterName ||
                      currentSlot?.name ||
                      ""
                    ).trim();
                    const priorBatterInfo: MidAtBatPriorBatterInfo | null =
                      (batterMode === "PH" || batterMode === "SINGLE_AB") &&
                      isMidCountBatterSub &&
                      priorName
                        ? {
                            name: priorName,
                            uniformNumber:
                              atBat.midAtBatPriorBatter?.uniformNumber ??
                              currentSlot?.uniformNumber ??
                              undefined,
                            playerId:
                              atBat.midAtBatPriorBatter !== undefined &&
                              atBat.midAtBatPriorBatter !== null
                                ? atBat.midAtBatPriorBatter.playerId
                                : atBat.batterPlayerId ??
                                  currentSlot?.playerId ??
                                  null,
                            ballsBeforeSub: midBatterBalls,
                            strikesBeforeSub: midBatterStrikes,
                          }
                        : null;
                    const res = applyAtBatBatterChange({
                      atBats,
                      structure,
                      targetAtBatId: atBat.id,
                      mode: batterMode,
                      name: batterName,
                      uniformNumber: batterUniform,
                      position: batterPos,
                      playerId: batterRosterId || null,
                      midAtBatPriorBatter: priorBatterInfo,
                    });
                    onApply(res.structure, res.atBats);
                    setAppliedToast(
                      `${atBat.battingOrder}番を「${batterName.trim()}」へ反映しました`
                    );
                    setBatterName("");
                    setBatterUniform("");
                    setBatterRosterId("");
                  }}
                  className="px-3.5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black shrink-0 disabled:opacity-40 cursor-pointer"
                >
                  打者変更を反映
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {atBat.midAtBatPriorPitcher && (
                <div className="px-2.5 py-1.5 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-between gap-2 text-[10px] font-black text-primary">
                  <span>
                    規則9.16(h) カウント途中救援: 前任投手{" "}
                    {atBat.midAtBatPriorPitcher.name}（
                    {atBat.midAtBatPriorPitcher.ballsBeforeChange}B-
                    {atBat.midAtBatPriorPitcher.strikesBeforeChange}S 時点で交代）
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const nextAtBats = atBats.map((ab) =>
                        ab.id === atBat.id
                          ? { ...ab, midAtBatPriorPitcher: undefined }
                          : ab
                      );
                      onApply(structure, nextAtBats);
                      setIsMidCountPitcherSub(false);
                      setAppliedToast("カウント途中救援の記録を解除しました");
                    }}
                    className="px-2 py-0.5 rounded-md bg-card border border-border text-destructive text-[10px] font-black cursor-pointer shrink-0"
                  >
                    解除
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setPitcherMode("FROM_HERE")}
                  className={`py-1.5 px-2 rounded-lg border text-[10px] font-black cursor-pointer text-left transition-colors ${
                    pitcherMode === "FROM_HERE"
                      ? "bg-primary/12 text-primary border-primary/40 shadow-2xs"
                      : "bg-muted border-border text-foreground hover:bg-muted/80"
                  }`}
                >
                  この打席から投手交代（回途中対応）
                </button>
                <button
                  type="button"
                  onClick={() => setPitcherMode("SINGLE_AB")}
                  className={`py-1.5 px-2 rounded-lg border text-[10px] font-black cursor-pointer text-left transition-colors ${
                    pitcherMode === "SINGLE_AB"
                      ? "bg-primary/12 text-primary border-primary/40 shadow-2xs"
                      : "bg-muted border-border text-foreground hover:bg-muted/80"
                  }`}
                >
                  この1打席のみ投手変更
                </button>
              </div>

              {structure.pitchers.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[10px] font-bold text-muted-foreground mr-0.5">
                    登板済から選択:
                  </span>
                  {structure.pitchers
                    .filter((pt) => pt.name.trim() !== "")
                    .map((pt, idx) => (
                      <button
                        key={pt.id}
                        type="button"
                        onClick={() => {
                          setPitcherName(pt.name);
                          setPitcherUniform(pt.uniformNumber || "");
                          setPitcherRosterId(pt.playerId || "");
                        }}
                        className="px-2 py-0.5 rounded-lg bg-muted hover:bg-muted/80 border border-border text-[10px] font-black text-foreground cursor-pointer"
                      >
                        {idx === 0 ? "先発" : `${idx + 1}番手`}: {pt.name}（
                        {pt.fromInning}〜{pt.toInning}回）
                      </button>
                    ))}
                </div>
              )}

              {!structure.isMyTeamBatting && roster.length > 0 && (
                <LiffSelect
                  value={pitcherRosterId}
                  onChange={(pid) => {
                    setPitcherRosterId(pid);
                    const matched = roster.find((p) => p.id === pid);
                    if (matched) {
                      setPitcherName(matched.name);
                      setPitcherUniform(matched.uniformNumber || "");
                    }
                  }}
                  title="自チーム登録メンバーから投手を選択"
                  searchable={true}
                  searchPlaceholder="背番号・選手名で検索..."
                  size="sm"
                  className="w-full bg-muted"
                  ariaLabel="自チーム登録メンバーから投手を選択"
                  options={[
                    {
                      value: "",
                      label: "自チーム登録メンバーから投手を選択",
                    },
                    ...benchPitchers.map(
                      (p): LiffSelectOption => ({
                        value: p.id,
                        label: `#${p.uniformNumber} ${p.name}`,
                        group: "未登板メンバー（推奨）",
                        sublabel: p.primaryPosition
                          ? `主守備: ${p.primaryPosition}`
                          : undefined,
                        keywords: `${p.uniformNumber} ${p.name} ${
                          p.nameKana || ""
                        }`,
                      })
                    ),
                    ...activePitchers.map(
                      (p): LiffSelectOption => ({
                        value: p.id,
                        label: `#${p.uniformNumber} ${p.name}`,
                        group: "登板済メンバー",
                        sublabel: p.primaryPosition
                          ? `主守備: ${p.primaryPosition}`
                          : undefined,
                        keywords: `${p.uniformNumber} ${p.name} ${
                          p.nameKana || ""
                        }`,
                      })
                    ),
                  ]}
                />
              )}

              <div className="grid grid-cols-12 gap-1.5">
                <input
                  type="text"
                  value={pitcherUniform}
                  onChange={(e) => setPitcherUniform(e.target.value)}
                  placeholder="背番"
                  className="col-span-3 h-9 px-2 rounded-xl bg-muted border border-border text-xs font-black text-center text-foreground"
                />
                <input
                  type="text"
                  value={pitcherName}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPitcherName(v);
                    if (pitcherRosterId) {
                      const matched = roster.find(
                        (p) => p.id === pitcherRosterId
                      );
                      if (matched && matched.name !== v) {
                        setPitcherRosterId("");
                      }
                    }
                  }}
                  placeholder="交代後の投手名を入力"
                  className="col-span-9 h-9 px-2.5 rounded-xl bg-muted border border-border text-xs font-black text-foreground"
                />
              </div>

              <div className="p-2 rounded-xl bg-muted border border-border space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setIsMidCountPitcherSub((prev) => !prev)}
                    className={`px-2.5 py-1 rounded-lg border text-[10px] font-black cursor-pointer transition-colors ${
                      isMidCountPitcherSub
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-foreground border-border"
                    }`}
                  >
                    {isMidCountPitcherSub ? "✓ " : "＋ "}
                    カウント途中の救援登板（規則9.16(h)）
                  </button>
                  <span className="text-[10px] font-bold text-muted-foreground">
                    降板投手:{" "}
                    {atBat.midAtBatPriorPitcher?.name ||
                      atBat.pitcherName ||
                      "未設定"}
                  </span>
                </div>
                {isMidCountPitcherSub && (
                  <div className="space-y-1.5 pt-0.5">
                    <div className="grid grid-cols-2 gap-1.5">
                      <LiffSelect
                        value={String(midPitcherBalls)}
                        onChange={(val) => setMidPitcherBalls(Number(val))}
                        title="投手交代時のボールカウントを選択"
                        size="xs"
                        searchable={false}
                        className="w-full bg-card"
                        ariaLabel="投手交代時のボールカウント"
                        options={[0, 1, 2, 3].map((b) => ({
                          value: String(b),
                          label: `交代時 ${b} ボール`,
                        }))}
                      />
                      <LiffSelect
                        value={String(midPitcherStrikes)}
                        onChange={(val) => setMidPitcherStrikes(Number(val))}
                        title="投手交代時のストライクカウントを選択"
                        size="xs"
                        searchable={false}
                        className="w-full bg-card"
                        ariaLabel="投手交代時のストライクカウント"
                        options={[0, 1, 2].map((s) => ({
                          value: String(s),
                          label: `交代時 ${s} ストライク`,
                        }))}
                      />
                    </div>
                    <p className="text-[10px] font-bold text-muted-foreground leading-snug">
                      {(midPitcherBalls === 2 && midPitcherStrikes <= 1) ||
                      midPitcherBalls === 3
                        ? "※規則9.16(h)：このカウントからの四球および走者責任（得点・自責点）は前任投手に記録されます。"
                        : "※規則9.16(h)：このカウント（2-2 または 1ボール以下）からは四球を含め救援投手に記録されます。"}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 pt-0.5">
                <span className="text-[10px] font-bold text-muted-foreground">
                  {pitcherMode === "FROM_HERE"
                    ? `${atBat.inning}回${
                        atBat.isTop ? "表" : "裏"
                      }（${atBat.battingOrder}番）以降の打席へ自動反映します`
                    : "この1打席の投手のみ変更します"}
                </span>
                <button
                  type="button"
                  disabled={!pitcherName.trim()}
                  onClick={() => {
                    const priorPName = (
                      atBat.midAtBatPriorPitcher?.name ||
                      atBat.pitcherName ||
                      ""
                    ).trim();
                    const priorPitcherInfo: MidAtBatPriorPitcherInfo | null =
                      isMidCountPitcherSub && priorPName
                        ? {
                            name: priorPName,
                            uniformNumber:
                              atBat.midAtBatPriorPitcher?.uniformNumber,
                            playerId:
                              atBat.midAtBatPriorPitcher !== undefined &&
                              atBat.midAtBatPriorPitcher !== null
                                ? atBat.midAtBatPriorPitcher.playerId
                                : atBat.pitcherPlayerId ?? null,
                            ballsBeforeChange: midPitcherBalls,
                            strikesBeforeChange: midPitcherStrikes,
                            pitchesThrownInAtBat:
                              midPitcherBalls + midPitcherStrikes,
                          }
                        : null;
                    const res = applyAtBatPitcherChange({
                      atBats,
                      structure,
                      targetAtBatId: atBat.id,
                      mode: pitcherMode,
                      name: pitcherName,
                      uniformNumber: pitcherUniform,
                      playerId: pitcherRosterId || null,
                      midAtBatPriorPitcher: priorPitcherInfo,
                    });
                    onApply(res.structure, res.atBats);
                    setAppliedToast(
                      `投手を「${pitcherName.trim()}」へ反映しました`
                    );
                    setPitcherName("");
                    setPitcherUniform("");
                    setPitcherRosterId("");
                  }}
                  className="px-3.5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black shrink-0 disabled:opacity-40 cursor-pointer"
                >
                  投手交代を反映
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface Step3QuickSubstitutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  opponentName: string;
  structure: ScorebookSheetStructure | null;
  atBats: ScorebookV2AtBat[];
  roster: ScorebookRosterPlayer[];
  onApply: (
    nextStructure: ScorebookSheetStructure,
    nextAtBats: ScorebookV2AtBat[]
  ) => void;
}

/**
 * STEP 3 の一覧画面から 1タップで開ける「選手交代・継投クイック一覧編集モーダル」
 */
export function Step3QuickSubstitutionModal({
  isOpen,
  onClose,
  opponentName,
  structure,
  atBats,
  roster,
  onApply,
}: Step3QuickSubstitutionModalProps) {
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<"batters" | "pitchers">("batters");
  const [addingOrder, setAddingOrder] = useState<number | null>(null);
  const [draftSubType, setDraftSubType] =
    useState<ScorebookSubstitution["subType"]>("PH");
  const [draftInning, setDraftInning] = useState<number>(5);
  const [draftFromBatterOrder, setDraftFromBatterOrder] = useState<
    number | null
  >(null);
  const [draftRosterId, setDraftRosterId] = useState<string>("");
  const [draftName, setDraftName] = useState<string>("");
  const [draftUniform, setDraftUniform] = useState<string>("");
  const [draftPosition, setDraftPosition] = useState<string>("");

  useEffect(() => {
    setMounted(true);
  }, []);

  // 背景シート切替時は自動リセット（SKILL.md ルール5準拠）
  const sideKey = structure?.isTop;
  useEffect(() => {
    setAddingOrder(null);
  }, [sideKey]);

  const maxInning = useMemo(() => {
    return Math.max(
      7,
      structure?.innings[structure.innings.length - 1]?.inning || 7,
      ...atBats.map((a) => a.inning || 1)
    );
  }, [structure, atBats]);

  const inningOptions = useMemo(
    () => Array.from({ length: Math.max(9, maxInning + 2) }, (_, i) => i + 1),
    [maxInning]
  );

  if (!mounted || !isOpen || !structure) return null;

  const battingTeamLabel = structure.isMyTeamBatting
    ? "自チーム"
    : `相手（${opponentName}）`;
  const pitchingTeamLabel = !structure.isMyTeamBatting
    ? "自チーム"
    : `相手（${opponentName}）`;

  const applyStructureChangeAndSync = (nextStruct: ScorebookSheetStructure) => {
    const synced = syncSheetAtBatsWithStructure(atBats, nextStruct);
    const recomputed = recomputeOrderedEndingOuts(synced, nextStruct);
    onApply(nextStruct, recomputed);
  };

  const usedBatterIds = new Set<string>();
  for (const b of structure.batters) {
    if (b.playerId) usedBatterIds.add(b.playerId);
    for (const s of b.substitutions) {
      if (s.playerId && s.subType !== "TR") usedBatterIds.add(s.playerId);
    }
  }
  const benchBatters = roster.filter((p) => !usedBatterIds.has(p.id));
  const activeBatters = roster.filter((p) => usedBatterIds.has(p.id));

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg max-h-[88dvh] sm:max-h-[90dvh] bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="px-4 py-3 bg-[#0f172a] text-slate-50 border-b-[3px] border-primary flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-7 h-7 rounded-lg bg-primary/20 text-blue-300 border border-primary/40 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-xs font-black text-white truncate">
                選手交代・継投の編集（{structure.isTop ? "先攻・表" : "後攻・裏"}）
              </h3>
              <p className="text-[10px] font-bold text-slate-300 truncate">
                変更すると既存の打席・走者・個人成績へ即座に自動反映されます
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white cursor-pointer shrink-0 transition-colors"
            aria-label="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* タブ切替 */}
        <div className="px-4 pt-3 bg-card">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-muted border border-border">
            <button
              type="button"
              onClick={() => setTab("batters")}
              className={`py-2 px-2 rounded-xl border text-xs font-black cursor-pointer transition-colors ${
                tab === "batters"
                  ? "bg-card text-foreground border-border shadow-xs"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {battingTeamLabel}の打順・交代
            </button>
            <button
              type="button"
              onClick={() => setTab("pitchers")}
              className={`py-2 px-2 rounded-xl border text-xs font-black cursor-pointer transition-colors ${
                tab === "pitchers"
                  ? "bg-card text-foreground border-border shadow-xs"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {pitchingTeamLabel}の継投投手
            </button>
          </div>
        </div>

        {/* スクロールボディ */}
        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          {tab === "batters" ? (
            <div className="space-y-2.5">
              {structure.batters.map((slot) => {
                const isAddingHere = addingOrder === slot.battingOrder;
                return (
                  <div
                    key={slot.battingOrder}
                    className="p-3 rounded-2xl bg-muted border border-border space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-6 h-6 rounded-lg bg-primary text-primary-foreground text-xs font-black flex items-center justify-center shrink-0">
                          {slot.battingOrder}
                        </span>
                        <div className="min-w-0">
                          <span className="text-xs font-black text-foreground block truncate">
                            {slot.uniformNumber
                              ? `#${slot.uniformNumber} `
                              : ""}
                            {slot.name || "未設定"}
                            {slot.position ? `（守備:${slot.position}）` : ""}
                          </span>
                          <span className="text-[10px] font-bold text-muted-foreground block">
                            スタメン
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (isAddingHere) {
                            setAddingOrder(null);
                          } else {
                            setAddingOrder(slot.battingOrder);
                            setDraftSubType("PH");
                            setDraftInning(Math.min(maxInning, 5));
                            setDraftFromBatterOrder(null);
                            setDraftRosterId("");
                            setDraftName("");
                            setDraftUniform("");
                            setDraftPosition("");
                          }
                        }}
                        className="px-2.5 py-1 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-[10px] font-black inline-flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>途中交代</span>
                      </button>
                    </div>

                    {slot.substitutions.length > 0 && (
                      <div className="space-y-1.5 pt-1 border-t border-border">
                        {slot.substitutions.map((sub) => (
                          <div
                            key={sub.id}
                            className="p-2 rounded-xl bg-card border border-border flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-1.5 flex-wrap min-w-0 text-[11px] font-black text-foreground">
                              <LiffSelect
                                value={String(sub.inningEntered)}
                                ariaLabel="交代イニング"
                                title="交代イニングを変更"
                                size="xs"
                                searchable={false}
                                className="bg-muted shrink-0"
                                onChange={(val) => {
                                  const nextInn = Number(val);
                                  const nextStruct: ScorebookSheetStructure = {
                                    ...structure,
                                    batters: structure.batters.map((b) =>
                                      b.battingOrder === slot.battingOrder
                                        ? {
                                            ...b,
                                            substitutions: b.substitutions.map(
                                              (s) =>
                                                s.id === sub.id
                                                  ? {
                                                      ...s,
                                                      inningEntered: nextInn,
                                                      enteredAtBatId: undefined,
                                                    }
                                                  : s
                                            ),
                                          }
                                        : b
                                    ),
                                  };
                                  applyStructureChangeAndSync(nextStruct);
                                }}
                                options={inningOptions.map((n) => ({
                                  value: String(n),
                                  label: `${n}回`,
                                }))}
                              />
                              <LiffSelect
                                value={
                                  typeof sub.enteredFromBatterOrder ===
                                    "number" && sub.enteredFromBatterOrder >= 1
                                    ? String(sub.enteredFromBatterOrder)
                                    : ""
                                }
                                ariaLabel="交代タイミング"
                                title={`${sub.inningEntered}回の交代タイミングを変更`}
                                size="xs"
                                searchable={false}
                                className="bg-muted shrink-0"
                                onChange={(val) => {
                                  const nextOrder = val ? Number(val) : null;
                                  const nextStruct: ScorebookSheetStructure = {
                                    ...structure,
                                    batters: structure.batters.map((b) =>
                                      b.battingOrder === slot.battingOrder
                                        ? {
                                            ...b,
                                            substitutions: b.substitutions.map(
                                              (s) =>
                                                s.id === sub.id
                                                  ? {
                                                      ...s,
                                                      enteredFromBatterOrder:
                                                        nextOrder,
                                                      enteredAtBatId: undefined,
                                                    }
                                                  : s
                                            ),
                                          }
                                        : b
                                    ),
                                  };
                                  applyStructureChangeAndSync(nextStruct);
                                }}
                                options={[
                                  { value: "", label: "回頭から" },
                                  ...Array.from(
                                    {
                                      length: Math.max(
                                        9,
                                        structure.batters.length
                                      ),
                                    },
                                    (_, i) => i + 1
                                  ).map((orderNum) => ({
                                    value: String(orderNum),
                                    label: `途中:${orderNum}番〜`,
                                  })),
                                ]}
                              />
                              <span className="px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-black">
                                {SUB_TYPE_LABELS[sub.subType]}
                              </span>
                              <span className="truncate">
                                {sub.uniformNumber
                                  ? `#${sub.uniformNumber} `
                                  : ""}
                                {sub.name}
                                {sub.position ? `（守:${sub.position}）` : ""}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                const res = removeBatterSubstitutionForOrder({
                                  atBats,
                                  structure,
                                  battingOrder: slot.battingOrder,
                                  subId: sub.id,
                                });
                                onApply(res.structure, res.atBats);
                              }}
                              className="p-1.5 rounded-lg bg-muted text-destructive hover:bg-destructive/10 cursor-pointer shrink-0"
                              aria-label="交代を削除"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {isAddingHere && (
                      <div className="p-2.5 rounded-xl bg-card border border-primary/35 space-y-2">
                        <div className="grid grid-cols-12 gap-1.5">
                          <LiffSelect
                            value={String(draftInning)}
                            onChange={(val) => setDraftInning(Number(val))}
                            title="出場イニングを選択"
                            size="xs"
                            searchable={false}
                            className="col-span-3 w-full bg-muted"
                            ariaLabel="出場イニング"
                            options={inningOptions.map((n) => ({
                              value: String(n),
                              label: `${n}回`,
                            }))}
                          />
                          <LiffSelect
                            value={
                              typeof draftFromBatterOrder === "number" &&
                              draftFromBatterOrder >= 1
                                ? String(draftFromBatterOrder)
                                : ""
                            }
                            onChange={(val) =>
                              setDraftFromBatterOrder(val ? Number(val) : null)
                            }
                            title={`${draftInning}回の交代タイミングを選択`}
                            size="xs"
                            searchable={false}
                            className="col-span-4 w-full bg-muted"
                            ariaLabel="イニング内タイミング"
                            options={[
                              { value: "", label: "回頭から" },
                              ...Array.from(
                                {
                                  length: Math.max(
                                    9,
                                    structure.batters.length
                                  ),
                                },
                                (_, i) => i + 1
                              ).map((orderNum) => ({
                                value: String(orderNum),
                                label: `途中:${orderNum}番〜`,
                              })),
                            ]}
                          />
                          <LiffSelect
                            value={draftSubType}
                            onChange={(val) => {
                              if (val === "POS_SHIFT") {
                                const lastNonTr = [...slot.substitutions]
                                  .reverse()
                                  .find(
                                    (s) =>
                                      s.subType !== "TR" && s.name.trim() !== ""
                                  );
                                const activeP = lastNonTr || slot;
                                setDraftSubType("DEF");
                                setDraftRosterId(activeP.playerId || "");
                                setDraftName(activeP.name);
                                setDraftUniform(activeP.uniformNumber || "");
                              } else {
                                setDraftSubType(
                                  val as ScorebookSubstitution["subType"]
                                );
                              }
                            }}
                            title="交代種別を選択"
                            size="xs"
                            searchable={false}
                            className="col-span-5 w-full bg-muted"
                            ariaLabel="交代種別"
                            options={[
                              { value: "PH", label: "代打 (PH)" },
                              { value: "PR", label: "代走 (PR)" },
                              {
                                value: "TR",
                                label: "臨時代走 (TR)",
                              },
                              { value: "DEF", label: "守備交代 (別選手)" },
                              ...(slot.name.trim()
                                ? [
                                    {
                                      value: "POS_SHIFT",
                                      label: "守備変更 (同選手)",
                                    },
                                  ]
                                : []),
                            ]}
                          />
                        </div>

                        {structure.isMyTeamBatting && roster.length > 0 && (
                          <LiffSelect
                            value={draftRosterId}
                            onChange={(pid) => {
                              setDraftRosterId(pid);
                              const matched = roster.find((p) => p.id === pid);
                              if (matched) {
                                setDraftName(matched.name);
                                setDraftUniform(matched.uniformNumber || "");
                                if (!draftPosition && matched.primaryPosition) {
                                  setDraftPosition(matched.primaryPosition);
                                }
                              }
                            }}
                            title={`${slot.battingOrder}番の途中交代選手を選択`}
                            searchable={true}
                            searchPlaceholder="背番号・選手名で検索..."
                            size="xs"
                            className="w-full bg-muted"
                            ariaLabel="登録メンバーから交代選手を選択"
                            options={[
                              {
                                value: "",
                                label:
                                  "登録メンバーから選択（または下に直接入力）",
                              },
                              ...benchBatters.map(
                                (p): LiffSelectOption => ({
                                  value: p.id,
                                  label: `#${p.uniformNumber} ${p.name}`,
                                  group: "控え・未出場メンバー（推奨）",
                                  sublabel: p.primaryPosition
                                    ? `主守備: ${p.primaryPosition}`
                                    : undefined,
                                  keywords: `${p.uniformNumber} ${p.name} ${
                                    p.nameKana || ""
                                  }`,
                                })
                              ),
                              ...activeBatters.map(
                                (p): LiffSelectOption => ({
                                  value: p.id,
                                  label: `#${p.uniformNumber} ${p.name}`,
                                  group: "出場中メンバー",
                                  sublabel: p.primaryPosition
                                    ? `主守備: ${p.primaryPosition}`
                                    : undefined,
                                  keywords: `${p.uniformNumber} ${p.name} ${
                                    p.nameKana || ""
                                  }`,
                                })
                              ),
                            ]}
                          />
                        )}

                        <div className="grid grid-cols-12 gap-1.5">
                          <input
                            type="text"
                            value={draftUniform}
                            onChange={(e) => setDraftUniform(e.target.value)}
                            placeholder="背番"
                            className="col-span-3 h-9 px-2 rounded-xl bg-muted border border-border text-xs font-black text-center text-foreground"
                          />
                          <input
                            type="text"
                            value={draftName}
                            onChange={(e) => {
                              const v = e.target.value;
                              setDraftName(v);
                              if (draftRosterId) {
                                const m = roster.find(
                                  (p) => p.id === draftRosterId
                                );
                                if (m && m.name !== v) {
                                  setDraftRosterId("");
                                }
                              }
                            }}
                            placeholder="交代選手名を入力"
                            className="col-span-5 h-9 px-2.5 rounded-xl bg-muted border border-border text-xs font-black text-foreground"
                          />
                          <LiffSelect
                            value={draftPosition}
                            onChange={(val) => setDraftPosition(val)}
                            title="守備位置を選択"
                            size="xs"
                            searchable={false}
                            disabled={draftSubType !== "DEF"}
                            className="col-span-4 w-full h-9 rounded-xl bg-muted"
                            ariaLabel="守備位置"
                            options={POSITION_OPTIONS}
                          />
                        </div>

                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setAddingOrder(null)}
                            className="px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 border border-border text-xs font-bold text-foreground cursor-pointer"
                          >
                            キャンセル
                          </button>
                          <button
                            type="button"
                            disabled={!draftName.trim()}
                            onClick={() => {
                              const newSub: ScorebookSubstitution = {
                                id: crypto.randomUUID(),
                                inningEntered: draftInning,
                                enteredFromBatterOrder: draftFromBatterOrder,
                                subType: draftSubType,
                                name: draftName.trim(),
                                uniformNumber: draftUniform.trim(),
                                position:
                                  draftSubType === "DEF" ? draftPosition : "",
                                playerId: draftRosterId || null,
                              };
                              const nextStruct: ScorebookSheetStructure = {
                                ...structure,
                                batters: structure.batters.map((b) =>
                                  b.battingOrder === slot.battingOrder
                                    ? {
                                        ...b,
                                        substitutions: [
                                          ...b.substitutions,
                                          newSub,
                                        ],
                                      }
                                    : b
                                ),
                              };
                              applyStructureChangeAndSync(nextStruct);
                              setAddingOrder(null);
                            }}
                            className="px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black disabled:opacity-40 cursor-pointer"
                          >
                            追加して打席へ反映
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="p-2.5 rounded-xl bg-muted border border-border flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold text-muted-foreground leading-snug">
                  担当イニングや「途中：○番打者から」を変更すると該当回の打席へ自動反映されます（各打席をタップして「この打席から投手交代」も使えます）。
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const nextStruct = smartAppendPitcherStint(
                      structure,
                      maxInning
                    );
                    applyStructureChangeAndSync(nextStruct);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-[10px] font-black inline-flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>継投追加</span>
                </button>
              </div>

              {structure.pitchers.map((pt, idx) => (
                <div
                  key={pt.id}
                  className="p-3 rounded-2xl bg-muted border border-border space-y-2"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-1 rounded-lg bg-primary text-primary-foreground text-[10px] font-black shrink-0">
                      {idx === 0 ? "先発" : `${idx + 1}番手`}
                    </span>

                    {!structure.isMyTeamBatting && roster.length > 0 ? (
                      <LiffSelect
                        value={pt.playerId || ""}
                        onChange={(val) => {
                          const found = roster.find((p) => p.id === val);
                          const nextStruct: ScorebookSheetStructure = {
                            ...structure,
                            pitchers: structure.pitchers.map((item) =>
                              item.id === pt.id
                                ? found
                                  ? {
                                      ...item,
                                      playerId: found.id,
                                      name: found.name,
                                      uniformNumber: found.uniformNumber || "",
                                    }
                                  : { ...item, playerId: null }
                                : item
                            ),
                          };
                          applyStructureChangeAndSync(nextStruct);
                        }}
                        title={`${
                          idx === 0 ? "先発" : `${idx + 1}番手`
                        }投手を選択`}
                        searchable={true}
                        searchPlaceholder="背番号・選手名で検索..."
                        size="sm"
                        className="flex-1 min-w-0"
                        ariaLabel="自チーム投手を選択"
                        options={[
                          {
                            value: "",
                            label: pt.name
                              ? `手入力: ${pt.name}`
                              : "-- 自チーム投手を選択 --",
                          },
                          ...roster.map(
                            (p): LiffSelectOption => ({
                              value: p.id,
                              label: `#${p.uniformNumber} ${p.name}`,
                              sublabel: p.primaryPosition
                                ? `主守備: ${p.primaryPosition}`
                                : undefined,
                              keywords: `${p.uniformNumber} ${p.name} ${
                                p.nameKana || ""
                              }`,
                            })
                          ),
                        ]}
                      />
                    ) : (
                      <>
                        <input
                          type="text"
                          value={pt.uniformNumber}
                          onChange={(e) => {
                            const nextStruct: ScorebookSheetStructure = {
                              ...structure,
                              pitchers: structure.pitchers.map((item) =>
                                item.id === pt.id
                                  ? { ...item, uniformNumber: e.target.value }
                                  : item
                              ),
                            };
                            applyStructureChangeAndSync(nextStruct);
                          }}
                          placeholder="#"
                          className="w-12 h-9 px-1.5 rounded-xl bg-card border border-border text-center text-xs font-black text-foreground shrink-0"
                        />
                        <input
                          type="text"
                          value={pt.name}
                          onChange={(e) => {
                            const nextStruct: ScorebookSheetStructure = {
                              ...structure,
                              pitchers: structure.pitchers.map((item) =>
                                item.id === pt.id
                                  ? { ...item, name: e.target.value }
                                  : item
                              ),
                            };
                            applyStructureChangeAndSync(nextStruct);
                          }}
                          placeholder="投手名を入力"
                          className="flex-1 min-w-0 h-9 px-2.5 rounded-xl bg-card border border-border text-xs font-black text-foreground"
                        />
                      </>
                    )}

                    {structure.pitchers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const remaining = structure.pitchers.filter(
                            (item) => item.id !== pt.id
                          );
                          if (
                            remaining.length > 0 &&
                            idx === structure.pitchers.length - 1
                          ) {
                            const lastIdx = remaining.length - 1;
                            remaining[lastIdx] = {
                              ...remaining[lastIdx],
                              toInning: Math.max(
                                remaining[lastIdx].toInning,
                                pt.toInning
                              ),
                            };
                          }
                          applyStructureChangeAndSync({
                            ...structure,
                            pitchers: remaining.map((item, i) => ({
                              ...item,
                              order: i + 1,
                            })),
                          });
                        }}
                        className="h-9 w-9 rounded-xl bg-card border border-border flex items-center justify-center text-destructive hover:bg-destructive/10 shrink-0 cursor-pointer"
                        aria-label="投手を削除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {!structure.isMyTeamBatting &&
                    roster.length > 0 &&
                    !pt.playerId && (
                      <div className="pl-12 flex items-center gap-1.5">
                        <input
                          type="text"
                          value={pt.uniformNumber}
                          onChange={(e) => {
                            const nextStruct: ScorebookSheetStructure = {
                              ...structure,
                              pitchers: structure.pitchers.map((item) =>
                                item.id === pt.id
                                  ? { ...item, uniformNumber: e.target.value }
                                  : item
                              ),
                            };
                            applyStructureChangeAndSync(nextStruct);
                          }}
                          placeholder="背番"
                          className="w-14 h-8 px-1.5 rounded-lg bg-card border border-border text-center text-[11px] font-black text-foreground shrink-0"
                        />
                        <input
                          type="text"
                          value={pt.name}
                          onChange={(e) => {
                            const nextStruct: ScorebookSheetStructure = {
                              ...structure,
                              pitchers: structure.pitchers.map((item) =>
                                item.id === pt.id
                                  ? { ...item, name: e.target.value }
                                  : item
                              ),
                            };
                            applyStructureChangeAndSync(nextStruct);
                          }}
                          placeholder="助っ人・未登録投手名を直接入力"
                          className="flex-1 min-w-0 h-8 px-2.5 rounded-lg bg-card border border-border text-[11px] font-black text-foreground"
                        />
                      </div>
                    )}

                  <div className="flex items-center justify-between gap-2 pl-1 flex-wrap">
                    <span className="text-[11px] font-bold text-muted-foreground shrink-0">
                      担当イニング
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      <LiffSelect
                        value={String(pt.fromInning)}
                        ariaLabel="登板開始イニング"
                        title="登板開始イニングを選択"
                        size="xs"
                        searchable={false}
                        className="min-w-[4rem]"
                        onChange={(val) => {
                          const nextFrom = Number(val);
                          const isMidInning =
                            typeof pt.fromBatterOrder === "number" &&
                            pt.fromBatterOrder >= 1;
                          const nextPitchers = structure.pitchers.map(
                            (item, pIdx) => {
                              if (item.id === pt.id) {
                                return {
                                  ...item,
                                  fromInning: nextFrom,
                                  toInning: Math.max(item.toInning, nextFrom),
                                };
                              }
                              if (pIdx === idx - 1) {
                                if (isMidInning) {
                                  return {
                                    ...item,
                                    toInning: Math.max(
                                      item.fromInning,
                                      nextFrom
                                    ),
                                  };
                                }
                                if (
                                  item.toInning >= nextFrom &&
                                  item.fromInning < nextFrom
                                ) {
                                  return {
                                    ...item,
                                    toInning: nextFrom - 1,
                                  };
                                }
                              }
                              return item;
                            }
                          );
                          applyStructureChangeAndSync({
                            ...structure,
                            pitchers: nextPitchers,
                          });
                        }}
                        options={inningOptions.map((n) => ({
                          value: String(n),
                          label: `${n}回`,
                        }))}
                      />

                      {idx >= 1 && (
                        <LiffSelect
                          value={
                            typeof pt.fromBatterOrder === "number" &&
                            pt.fromBatterOrder >= 1
                              ? String(pt.fromBatterOrder)
                              : ""
                          }
                          ariaLabel="イニング内登板タイミング"
                          title={`${pt.fromInning}回の登板開始タイミングを選択`}
                          size="xs"
                          searchable={false}
                          className="shrink-0"
                          onChange={(val) => {
                            const nextOrder = val ? Number(val) : null;
                            const nextPitchers = structure.pitchers.map(
                              (item, pIdx) => {
                                if (item.id === pt.id) {
                                  return {
                                    ...item,
                                    fromBatterOrder: nextOrder,
                                  };
                                }
                                if (pIdx === idx - 1) {
                                  if (nextOrder && nextOrder >= 1) {
                                    return {
                                      ...item,
                                      toInning: Math.max(
                                        item.fromInning,
                                        pt.fromInning
                                      ),
                                    };
                                  }
                                  if (
                                    item.toInning === pt.fromInning &&
                                    item.fromInning < pt.fromInning
                                  ) {
                                    return {
                                      ...item,
                                      toInning: pt.fromInning - 1,
                                    };
                                  }
                                }
                                return item;
                              }
                            );
                            applyStructureChangeAndSync({
                              ...structure,
                              pitchers: nextPitchers,
                            });
                          }}
                          options={[
                            {
                              value: "",
                              label: "回頭から",
                              sublabel: `${pt.fromInning}回の先頭打者から登板`,
                            },
                            ...Array.from(
                              {
                                length: Math.max(9, structure.batters.length),
                              },
                              (_, i) => i + 1
                            ).map((orderNum): LiffSelectOption => {
                              const bSlot = structure.batters.find(
                                (b) => b.battingOrder === orderNum
                              );
                              const bName = bSlot?.name
                                ? `（${bSlot.name}）`
                                : "";
                              return {
                                value: String(orderNum),
                                label: `途中:${orderNum}番〜`,
                                sublabel: `${pt.fromInning}回途中・${orderNum}番打者${bName}から登板`,
                              };
                            }),
                          ]}
                        />
                      )}

                      <span className="text-xs font-black text-muted-foreground">
                        〜
                      </span>
                      <LiffSelect
                        value={String(pt.toInning)}
                        ariaLabel="登板終了イニング"
                        title="登板終了イニングを選択"
                        size="xs"
                        searchable={false}
                        className="min-w-[4rem]"
                        onChange={(val) => {
                          const nextTo = Number(val);
                          const nextPitchers = structure.pitchers.map(
                            (item) =>
                              item.id === pt.id
                                ? {
                                    ...item,
                                    fromInning: Math.min(
                                      item.fromInning,
                                      nextTo
                                    ),
                                    toInning: nextTo,
                                  }
                                : item
                          );
                          applyStructureChangeAndSync({
                            ...structure,
                            pitchers: nextPitchers,
                          });
                        }}
                        options={inningOptions.map((n) => ({
                          value: String(n),
                          label: `${n}回`,
                        }))}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pl-1 flex-wrap pt-0.5">
                    <span className="text-[11px] font-bold text-muted-foreground shrink-0">
                      勝敗・S・H裁定
                    </span>
                    <LiffSelect
                      ariaLabel="公式記録員の勝敗・セーブ裁定"
                      title={`${
                        pt.name || `${idx === 0 ? "先発" : `${idx + 1}番手`}投手`
                      } の勝敗・セーブ裁定`}
                      subtitle="通常は「自動判定」のままで公認野球規則 9.17〜9.19 どおり算出されます"
                      value={pt.manualDecision ?? ""}
                      size="xs"
                      searchable={false}
                      className="min-w-[10.5rem]"
                      triggerTextClassName={
                        pt.manualDecision ? "text-primary" : undefined
                      }
                      onChange={(val) => {
                        const nextDecision = val
                          ? (val as OfficialPitcherDecision)
                          : null;
                        const nextPitchers = structure.pitchers.map((item) =>
                          item.id === pt.id
                            ? { ...item, manualDecision: nextDecision }
                            : item
                        );
                        onApply({ ...structure, pitchers: nextPitchers }, atBats);
                      }}
                      options={OFFICIAL_PITCHER_DECISION_OPTIONS}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="px-4 py-3 pb-[max(env(safe-area-inset-bottom),24px)] sm:pb-3 border-t border-border bg-card flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black cursor-pointer"
          >
            完了して閉じる
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

