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

export type BatterChangeMode = "PH" | "DEF" | "STARTER" | "SINGLE_AB";
export type PitcherChangeMode = "FROM_HERE" | "SINGLE_AB";

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
  } = params;
  const cleanName = name.trim();
  const cleanUniform = uniformNumber.trim();
  const cleanPos = position.trim();
  const targetIdx = atBats.findIndex((a) => a.id === targetAtBatId);
  if (!cleanName || targetIdx < 0) {
    return { structure, atBats };
  }
  const targetAb = atBats[targetIdx];

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
      atBats: recomputeOrderedEndingOuts(syncedRunners, structure),
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
      atBats: recomputeOrderedEndingOuts(synced, nextStructure),
    };
  }

  // PH または DEF（この打席から途中交代）
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
    atBats: recomputeOrderedEndingOuts(synced, nextStructure),
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
    if (
      removedSub &&
      (removedSub.subType === "PR" || removedSub.subType === "TR") &&
      Array.isArray(ab.pinchRunners) &&
      ab.pinchRunners.length > 0 &&
      (removedSub.enteredAtBatId
        ? ab.id === removedSub.enteredAtBatId
        : ab.inning === removedSub.inningEntered)
    ) {
      const filteredPr = ab.pinchRunners.filter(
        (pr) => pr.battingOrder !== battingOrder
      );
      return {
        ...ab,
        pinchRunners: filteredPr.length > 0 ? filteredPr : undefined,
      };
    }
    return ab;
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
    toInning: number;
  }

  const runs: ContiguousPitcherRun[] = [];
  for (const ab of updatedAtBats) {
    if (ab.manualPitcherOverride) continue;
    const pName = ab.pitcherName.trim();
    if (!pName && !ab.pitcherPlayerId) continue;
    const key = normalizePitcherIdentityKey(pName, ab.pitcherPlayerId);
    const last = runs[runs.length - 1];
    if (last && last.key === key) {
      last.fromInning = Math.min(last.fromInning, ab.inning);
      last.toInning = Math.max(last.toInning, ab.inning);
    } else {
      runs.push({
        key,
        name: pName,
        playerId: ab.pitcherPlayerId,
        fromInning: ab.inning,
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
        toInning: maxStructureInning,
      },
    ];
  } else {
    runs[0].fromInning = Math.min(1, runs[0].fromInning);
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
        toInning: run.toInning,
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
        Math.ceil((prevLast.fromInning + maxInning) / 2)
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

  const [pitcherMode, setPitcherMode] =
    useState<PitcherChangeMode>("FROM_HERE");
  const [pitcherRosterId, setPitcherRosterId] = useState<string>("");
  const [pitcherName, setPitcherName] = useState<string>("");
  const [pitcherUniform, setPitcherUniform] = useState<string>("");
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
    setPitcherRosterId("");
    setPitcherName("");
    setPitcherUniform("");
  }, [atBat.id]);

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
    <div
      className={`rounded-2xl border transition-colors ${
        isOpen
          ? "p-3 bg-card border-indigo-500/45 space-y-2.5 shadow-2xs"
          : "bg-card border-border"
      }`}
    >
      <button
        type="button"
        onClick={() => onToggleOpen(!isOpen, activeTab)}
        aria-expanded={isOpen}
        className={`w-full flex items-center justify-between gap-2 text-left cursor-pointer ${
          isOpen ? "" : "px-3 py-2.5 rounded-2xl hover:bg-muted/50"
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <UserCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span className="text-xs font-black text-foreground">
            選手交代・打者/投手変更
          </span>
          <span className="px-1.5 py-0.5 rounded-md bg-muted text-[10px] font-black text-muted-foreground">
            打者: {atBat.batterName || "未設定"} / 投手:{" "}
            {atBat.pitcherName || "未設定"}
          </span>
          {orderSubs.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-indigo-600 text-white text-[9px] font-black">
              {atBat.battingOrder}番交代{orderSubs.length}件
            </span>
          )}
        </div>
        <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 flex items-center gap-0.5 shrink-0">
          <span>{isOpen ? "閉じる" : "代打・継投"}</span>
          {isOpen ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </span>
      </button>

      {isOpen && (
        <div className="space-y-2.5 pt-2 border-t border-border">
          {appliedToast && (
            <div className="px-2.5 py-1.5 rounded-xl bg-emerald-600 text-white text-[11px] font-black">
              ✓ {appliedToast}
            </div>
          )}

          {/* 打者交代 / 投手交代 サブタブ */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-muted border border-border">
            <button
              type="button"
              onClick={() => setActiveTab("batter")}
              className={`py-1.5 px-2 rounded-lg text-[11px] font-black cursor-pointer transition-colors ${
                activeTab === "batter"
                  ? "bg-card text-foreground shadow-2xs"
                  : "text-muted-foreground"
              }`}
            >
              打者交代・変更（{atBat.battingOrder}番）
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("pitcher")}
              className={`py-1.5 px-2 rounded-lg text-[11px] font-black cursor-pointer transition-colors ${
                activeTab === "pitcher"
                  ? "bg-card text-foreground shadow-2xs"
                  : "text-muted-foreground"
              }`}
            >
              投手交代・継投変更
            </button>
          </div>

          {activeTab === "batter" ? (
            <div className="space-y-2">
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
                    className={`py-1.5 px-2 rounded-lg border text-[10px] font-black cursor-pointer text-left ${
                      batterMode === opt.id
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-muted border-border text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {structure.isMyTeamBatting && roster.length > 0 && (
                <select
                  value={batterRosterId}
                  onChange={(e) => {
                    const pid = e.target.value;
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
                  className="w-full h-9 px-2.5 rounded-xl bg-muted border border-border text-xs font-black text-foreground"
                >
                  <option value="">
                    登録メンバーから選択（または下に直接入力）
                  </option>
                  {benchBatters.length > 0 && (
                    <optgroup label="控え・未出場メンバー（推奨）">
                      {benchBatters.map((p) => (
                        <option key={p.id} value={p.id}>
                          #{p.uniformNumber} {p.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {activeBatters.length > 0 && (
                    <optgroup label="出場中メンバー">
                      {activeBatters.map((p) => (
                        <option key={p.id} value={p.id}>
                          #{p.uniformNumber} {p.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
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
                <select
                  value={batterPos}
                  onChange={(e) => setBatterPos(e.target.value)}
                  aria-label="守備位置"
                  disabled={batterMode === "PH" || batterMode === "SINGLE_AB"}
                  className="col-span-4 h-9 px-1.5 rounded-xl bg-muted border border-border text-[11px] font-black text-foreground disabled:opacity-45"
                >
                  {POSITION_OPTIONS.map((po) => (
                    <option key={po.value} value={po.value}>
                      {po.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between gap-2 pt-0.5">
                <span className="text-[10px] font-bold text-muted-foreground">
                  ※塁上の走者への「代走(PR/TR)」は下部のSTEP 3走者カードから指定できます
                </span>
                <button
                  type="button"
                  disabled={!batterName.trim()}
                  onClick={() => {
                    const res = applyAtBatBatterChange({
                      atBats,
                      structure,
                      targetAtBatId: atBat.id,
                      mode: batterMode,
                      name: batterName,
                      uniformNumber: batterUniform,
                      position: batterPos,
                      playerId: batterRosterId || null,
                    });
                    onApply(res.structure, res.atBats);
                    setAppliedToast(
                      `${atBat.battingOrder}番を「${batterName.trim()}」へ反映しました`
                    );
                    setBatterName("");
                    setBatterUniform("");
                    setBatterRosterId("");
                  }}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black shrink-0 disabled:opacity-40 cursor-pointer"
                >
                  打者変更を反映
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setPitcherMode("FROM_HERE")}
                  className={`py-1.5 px-2 rounded-lg border text-[10px] font-black cursor-pointer text-left ${
                    pitcherMode === "FROM_HERE"
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-muted border-border text-foreground"
                  }`}
                >
                  この打席から投手交代（回途中対応）
                </button>
                <button
                  type="button"
                  onClick={() => setPitcherMode("SINGLE_AB")}
                  className={`py-1.5 px-2 rounded-lg border text-[10px] font-black cursor-pointer text-left ${
                    pitcherMode === "SINGLE_AB"
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-muted border-border text-foreground"
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
                <select
                  value={pitcherRosterId}
                  onChange={(e) => {
                    const pid = e.target.value;
                    setPitcherRosterId(pid);
                    const matched = roster.find((p) => p.id === pid);
                    if (matched) {
                      setPitcherName(matched.name);
                      setPitcherUniform(matched.uniformNumber || "");
                    }
                  }}
                  className="w-full h-9 px-2.5 rounded-xl bg-muted border border-border text-xs font-black text-foreground"
                >
                  <option value="">
                    自チーム登録メンバーから投手を選択
                  </option>
                  {benchPitchers.length > 0 && (
                    <optgroup label="未登板メンバー（推奨）">
                      {benchPitchers.map((p) => (
                        <option key={p.id} value={p.id}>
                          #{p.uniformNumber} {p.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {activePitchers.length > 0 && (
                    <optgroup label="登板済メンバー">
                      {activePitchers.map((p) => (
                        <option key={p.id} value={p.id}>
                          #{p.uniformNumber} {p.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
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
                    const res = applyAtBatPitcherChange({
                      atBats,
                      structure,
                      targetAtBatId: atBat.id,
                      mode: pitcherMode,
                      name: pitcherName,
                      uniformNumber: pitcherUniform,
                      playerId: pitcherRosterId || null,
                    });
                    onApply(res.structure, res.atBats);
                    setAppliedToast(
                      `投手を「${pitcherName.trim()}」へ反映しました`
                    );
                    setPitcherName("");
                    setPitcherUniform("");
                    setPitcherRosterId("");
                  }}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black shrink-0 disabled:opacity-40 cursor-pointer"
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
      className="fixed inset-0 z-[9999] bg-black/75 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg max-h-[90vh] bg-card rounded-t-3xl sm:rounded-3xl border border-border shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="px-4 py-3 border-b border-border bg-card flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-xs font-black text-foreground truncate">
                選手交代・継投の編集（{structure.isTop ? "先攻・表" : "後攻・裏"}）
              </h3>
              <p className="text-[10px] font-bold text-muted-foreground truncate">
                変更すると既存の打席・走者・個人成績へ即座に自動反映されます
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full bg-muted text-foreground cursor-pointer shrink-0"
            aria-label="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* タブ切替 */}
        <div className="px-4 pt-3 bg-card">
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-muted border border-border">
            <button
              type="button"
              onClick={() => setTab("batters")}
              className={`py-2 px-2 rounded-xl text-xs font-black cursor-pointer transition-colors ${
                tab === "batters"
                  ? "bg-card text-foreground shadow-2xs"
                  : "text-muted-foreground"
              }`}
            >
              {battingTeamLabel}の打順・交代
            </button>
            <button
              type="button"
              onClick={() => setTab("pitchers")}
              className={`py-2 px-2 rounded-xl text-xs font-black cursor-pointer transition-colors ${
                tab === "pitchers"
                  ? "bg-card text-foreground shadow-2xs"
                  : "text-muted-foreground"
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
                        <span className="w-6 h-6 rounded-lg bg-foreground text-background text-xs font-black flex items-center justify-center shrink-0">
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
                            setDraftRosterId("");
                            setDraftName("");
                            setDraftUniform("");
                            setDraftPosition("");
                          }
                        }}
                        className="px-2.5 py-1 rounded-xl bg-indigo-600 text-white text-[10px] font-black inline-flex items-center gap-1 shrink-0 cursor-pointer"
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
                              <select
                                value={sub.inningEntered}
                                aria-label="交代イニング"
                                onChange={(e) => {
                                  const nextInn = Number(e.target.value);
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
                                className="h-7 px-1.5 rounded-lg bg-muted border border-border text-[10px] font-black text-foreground"
                              >
                                {inningOptions.map((n) => (
                                  <option key={n} value={n}>
                                    {n}回
                                  </option>
                                ))}
                              </select>
                              <span className="px-1.5 py-0.5 rounded-md bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[10px] font-black">
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
                      <div className="p-2.5 rounded-xl bg-card border-2 border-indigo-500/45 space-y-2">
                        <div className="grid grid-cols-12 gap-1.5">
                          <select
                            value={draftInning}
                            onChange={(e) =>
                              setDraftInning(Number(e.target.value))
                            }
                            aria-label="出場イニング"
                            className="col-span-4 h-9 px-2 rounded-xl bg-muted border border-border text-xs font-black text-foreground"
                          >
                            {inningOptions.map((n) => (
                              <option key={n} value={n}>
                                {n}回〜
                              </option>
                            ))}
                          </select>
                          <select
                            value={draftSubType}
                            onChange={(e) =>
                              setDraftSubType(
                                e.target.value as ScorebookSubstitution["subType"]
                              )
                            }
                            aria-label="交代種別"
                            className="col-span-8 h-9 px-2 rounded-xl bg-muted border border-border text-xs font-black text-foreground"
                          >
                            <option value="PH">代打 (PH)</option>
                            <option value="PR">代走 (PR)・以降も出場</option>
                            <option value="TR">臨時代走 (TR)・この回のみ</option>
                            <option value="DEF">守備交代・途中出場</option>
                          </select>
                        </div>

                        {structure.isMyTeamBatting && roster.length > 0 && (
                          <select
                            value={draftRosterId}
                            onChange={(e) => {
                              const pid = e.target.value;
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
                            className="w-full h-9 px-2.5 rounded-xl bg-muted border border-border text-xs font-black text-foreground"
                          >
                            <option value="">
                              登録メンバーから選択（または下に直接入力）
                            </option>
                            {benchBatters.length > 0 && (
                              <optgroup label="控え・未出場メンバー（推奨）">
                                {benchBatters.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    #{p.uniformNumber} {p.name}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {activeBatters.length > 0 && (
                              <optgroup label="出場中メンバー">
                                {activeBatters.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    #{p.uniformNumber} {p.name}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </select>
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
                          <select
                            value={draftPosition}
                            onChange={(e) => setDraftPosition(e.target.value)}
                            disabled={draftSubType !== "DEF"}
                            aria-label="守備位置"
                            className="col-span-4 h-9 px-1.5 rounded-xl bg-muted border border-border text-[11px] font-black text-foreground disabled:opacity-45"
                          >
                            {POSITION_OPTIONS.map((po) => (
                              <option key={po.value} value={po.value}>
                                {po.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setAddingOrder(null)}
                            className="px-3 py-1.5 rounded-lg bg-muted border border-border text-xs font-bold text-foreground cursor-pointer"
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
                            className="px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-black disabled:opacity-40 cursor-pointer"
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
                  担当イニングを変更すると該当回の全打席へ自動反映されます（回途中の継投は各打席をタップして「この打席から投手交代」も使えます）。
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
                  className="px-2.5 py-1.5 rounded-xl bg-indigo-600 text-white text-[10px] font-black inline-flex items-center gap-1 shrink-0 cursor-pointer"
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
                    <span className="px-2 py-1 rounded-lg bg-foreground text-background text-[10px] font-black shrink-0">
                      {idx === 0 ? "先発" : `${idx + 1}番手`}
                    </span>

                    {!structure.isMyTeamBatting && roster.length > 0 ? (
                      <select
                        value={pt.playerId || ""}
                        onChange={(e) => {
                          const found = roster.find(
                            (p) => p.id === e.target.value
                          );
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
                        className="flex-1 min-w-0 h-9 px-2.5 rounded-xl bg-card border border-border text-xs font-black text-foreground"
                      >
                        <option value="">
                          {pt.name
                            ? `手入力: ${pt.name}`
                            : "-- 自チーム投手を選択 --"}
                        </option>
                        {roster.map((p) => (
                          <option key={p.id} value={p.id}>
                            #{p.uniformNumber} {p.name}
                          </option>
                        ))}
                      </select>
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
                          if (remaining.length > 0 && idx === structure.pitchers.length - 1) {
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

                  <div className="flex items-center justify-between gap-2 pl-1">
                    <span className="text-[11px] font-bold text-muted-foreground">
                      担当イニング
                    </span>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={pt.fromInning}
                        aria-label="登板開始イニング"
                        onChange={(e) => {
                          const nextFrom = Number(e.target.value);
                          const nextPitchers = structure.pitchers.map(
                            (item, pIdx) => {
                              if (item.id === pt.id) {
                                return {
                                  ...item,
                                  fromInning: nextFrom,
                                  toInning: Math.max(item.toInning, nextFrom),
                                };
                              }
                              if (
                                pIdx === idx - 1 &&
                                item.toInning >= nextFrom &&
                                item.fromInning < nextFrom
                              ) {
                                return {
                                  ...item,
                                  toInning: nextFrom - 1,
                                };
                              }
                              return item;
                            }
                          );
                          applyStructureChangeAndSync({
                            ...structure,
                            pitchers: nextPitchers,
                          });
                        }}
                        className="h-9 min-w-[4.5rem] px-2.5 rounded-xl bg-card border border-border text-xs font-black text-foreground"
                      >
                        {inningOptions.map((n) => (
                          <option key={n} value={n}>
                            {n}回
                          </option>
                        ))}
                      </select>
                      <span className="text-xs font-black text-muted-foreground">
                        〜
                      </span>
                      <select
                        value={pt.toInning}
                        aria-label="登板終了イニング"
                        onChange={(e) => {
                          const nextTo = Number(e.target.value);
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
                        className="h-9 min-w-[4.5rem] px-2.5 rounded-xl bg-card border border-border text-xs font-black text-foreground"
                      >
                        {inningOptions.map((n) => (
                          <option key={n} value={n}>
                            {n}回
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="px-4 py-3 border-t border-border bg-card flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black cursor-pointer"
          >
            完了して閉じる
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

