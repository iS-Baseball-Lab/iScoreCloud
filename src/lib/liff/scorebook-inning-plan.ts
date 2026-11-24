// filepath: src/lib/liff/scorebook-inning-plan.ts
import {
  resolveStructureGridCorners,
  syncStructureBoxesFromCorners,
} from "@/lib/liff/scorebook-grid";
import {
  resolveActiveMatchupFromStructure,
  resolveEffectiveBattingCycleLength,
} from "@/lib/liff/scorebook-validator";
import type {
  ScorebookInningMeta,
  ScorebookSheetStructure,
  ScorebookV2AtBat,
} from "@/types/scorebook-v2";

export interface PlannedInningBatterSlot {
  /** イニング内の1始まり打席通番 (1..batterCount) */
  seqNumber: number;
  /** 打順番号 (1..lineupLen) */
  battingOrder: number;
  /** シート上の物理サブ列番号 (1..columnCount) */
  subCol: number;
  /** このイニング内での巡目 (1=1巡目, 2=2巡目, ...) */
  cycleInInning: number;
}

function clampBattingOrder(order: number, lineupLen: number): number {
  const safeLen = Math.max(1, lineupLen);
  if (!Number.isFinite(order) || order < 1) return 1;
  return (((Math.round(order) - 1) % safeLen) + safeLen) % safeLen + 1;
}

/**
 * 先頭打順と打席人数から、そのイニングの最終打順（最後の打者）を算出する。
 * batterCount === 0（未消化回）の場合は null を返す。
 */
export function computeInningEndOrder(
  leadOffOrder: number,
  batterCount: number,
  lineupLen: number
): number | null {
  if (!Number.isFinite(batterCount) || batterCount <= 0) {
    return null;
  }
  const safeLen = Math.max(1, lineupLen);
  const start = clampBattingOrder(leadOffOrder, safeLen);
  return ((start - 1 + Math.round(batterCount) - 1) % safeLen) + 1;
}

/**
 * 先頭打順・打席人数・折り返し記法から、スコアシート上で必要となる物理サブ列数（1〜6列）を算出する。
 */
export function computeRequiredColumnsForInningPlan(
  leadOffOrder: number,
  batterCount: number,
  lineupLen: number,
  wrapStyle?: "cycle" | "bottom_wrap" | null
): number {
  if (!Number.isFinite(batterCount) || batterCount <= 0) {
    return 1;
  }
  const safeLen = Math.max(1, lineupLen);
  const count = Math.round(batterCount);
  if (wrapStyle === "bottom_wrap") {
    let cols = 1;
    let curOrder = clampBattingOrder(leadOffOrder, safeLen);
    for (let k = 1; k < count; k++) {
      curOrder = (curOrder % safeLen) + 1;
      if (curOrder === 1) {
        cols += 1;
      }
    }
    return Math.min(6, Math.max(1, cols));
  }
  return Math.min(6, Math.max(1, Math.ceil(count / safeLen)));
}

/**
 * イニングメタ情報（leadOffOrder / batterCount / columnCount / wrapStyle）から、
 * そのイニングで打席に立つ確定シーケンス（#1〜#N）を展開する。
 * - batterCount が未設定（null / undefined）の場合は null（未ロック）を返す。
 * - batterCount === 0（最終回裏未消化 × 等）の場合は空配列 [] を返す。
 */
export function computeInningPlannedSlots(
  meta: ScorebookInningMeta | null | undefined,
  lineupLen: number
): PlannedInningBatterSlot[] | null {
  if (
    !meta ||
    typeof meta.batterCount !== "number" ||
    !Number.isFinite(meta.batterCount) ||
    meta.batterCount < 0
  ) {
    return null;
  }
  const count = Math.round(meta.batterCount);
  if (count === 0) {
    return [];
  }

  const safeLen = Math.max(1, lineupLen);
  const leadOff = clampBattingOrder(meta.leadOffOrder ?? 1, safeLen);
  const cols = Math.max(1, meta.columnCount || 1);
  const useBottomWrap = cols >= 2 && meta.wrapStyle === "bottom_wrap";

  const slots: PlannedInningBatterSlot[] = [];
  let currentSubCol = 1;
  for (let k = 0; k < count; k++) {
    const battingOrder = ((leadOff - 1 + k) % safeLen) + 1;
    const cycleInInning = Math.floor(k / safeLen) + 1;
    if (cols <= 1) {
      currentSubCol = 1;
    } else if (useBottomWrap) {
      if (k > 0 && battingOrder === 1) {
        currentSubCol = Math.min(cols, currentSubCol + 1);
      }
    } else {
      currentSubCol = Math.min(cols, cycleInInning);
    }
    slots.push({
      seqNumber: k + 1,
      battingOrder,
      subCol: currentSubCol,
      cycleInInning,
    });
  }
  return slots;
}

export interface NormalizeInningBatterPlanOptions {
  anchorAtBats?: ReadonlyArray<ScorebookV2AtBat> | null;
  /** true の場合、AI骨格スキャン等で batterCount が未設定だった回にも連続した初期推定値を補完する */
  fillDefaultWhenMissing?: boolean;
}

/**
 * シート骨格全体の各イニング（1回〜最終回）の leadOffOrder・batterCount・columnCount を一貫した連鎖に正規化する。
 */
export function normalizeStructureInningBatterPlan(
  structure: ScorebookSheetStructure,
  options?: NormalizeInningBatterPlanOptions
): ScorebookSheetStructure {
  if (!structure.innings || structure.innings.length === 0) {
    return structure;
  }

  const lineupLen = resolveEffectiveBattingCycleLength(structure);
  const sortedInnings = [...structure.innings].sort(
    (a, b) => a.inning - b.inning
  );
  const anchorList = options?.anchorAtBats || [];
  const hasAnyAnchor = anchorList.length > 0;
  const fillDefault = Boolean(options?.fillDefaultWhenMissing);

  const hasAnyExplicitPlan = sortedInnings.some(
    (m) => typeof m.batterCount === "number" && Number.isFinite(m.batterCount)
  );
  if (!hasAnyAnchor && !hasAnyExplicitPlan && !fillDefault) {
    return structure;
  }

  let runningLeadOff = 1;
  let anyColumnCountChanged = false;

  const updatedSorted: ScorebookInningMeta[] = sortedInnings.map((meta, idx) => {
    const isFinalInning = idx === sortedInnings.length - 1;
    const nextMeta =
      idx < sortedInnings.length - 1 ? sortedInnings[idx + 1] : null;
    const anchorInInn = anchorList.filter((a) => a.inning === meta.inning);

    // 1. 先頭打順の決定
    let leadOff: number;
    if (anchorInInn.length > 0) {
      leadOff = clampBattingOrder(anchorInInn[0].battingOrder, lineupLen);
    } else if (
      meta.isLeadOffPinned &&
      typeof meta.leadOffOrder === "number" &&
      meta.leadOffOrder >= 1
    ) {
      leadOff = clampBattingOrder(meta.leadOffOrder, lineupLen);
    } else if (
      idx === 0 &&
      typeof meta.leadOffOrder === "number" &&
      meta.leadOffOrder >= 1
    ) {
      leadOff = clampBattingOrder(meta.leadOffOrder, lineupLen);
    } else {
      leadOff = runningLeadOff;
    }

    // 2. 打席人数の決定
    let count: number | null = null;
    if (anchorInInn.length > 0) {
      count = anchorInInn.length;
    } else if (
      hasAnyAnchor &&
      isFinalInning &&
      !structure.isTop &&
      meta.runs === 0 &&
      anchorList.some((a) => a.inning < meta.inning) &&
      typeof meta.batterCount !== "number"
    ) {
      count = 0;
    } else if (
      typeof meta.batterCount === "number" &&
      Number.isFinite(meta.batterCount) &&
      meta.batterCount >= 0
    ) {
      count = Math.min(36, Math.max(0, Math.round(meta.batterCount)));
      // 非最終回で誤って 0〜2 人になっていた場合は最低3人へ補正
      if (!isFinalInning && count < 3) {
        count = Math.max(3, meta.runs + 3);
      }
    } else if (fillDefault || hasAnyExplicitPlan) {
      const cols = Math.max(1, meta.columnCount || 1);
      // 次イニングのAI推定先頭打順がある場合は、そこから逆算して境界を一致させる
      if (
        nextMeta &&
        typeof nextMeta.leadOffOrder === "number" &&
        nextMeta.leadOffOrder >= 1
      ) {
        const nextLead = clampBattingOrder(nextMeta.leadOffOrder, lineupLen);
        const targetEnd =
          ((nextLead - 2 + lineupLen) % lineupLen) + 1;
        const baseSpan =
          ((targetEnd - leadOff + lineupLen) % lineupLen) + 1;
        const extraCycles = Math.max(0, cols - 1);
        const inferred = baseSpan + extraCycles * lineupLen;
        const minExpected = !isFinalInning
          ? Math.max(3, meta.inning <= 5 ? meta.runs + 3 : 3)
          : 3;
        count =
          inferred >= minExpected
            ? inferred
            : inferred + lineupLen <= cols * lineupLen
              ? inferred + lineupLen
              : minExpected;
      } else {
        const minFromRuns =
          isFinalInning && !structure.isTop && meta.runs === 0
            ? 3
            : Math.max(3, meta.runs + 3);
        const minFromCols = cols >= 2 ? (cols - 1) * lineupLen + 1 : 3;
        count = Math.min(36, Math.max(minFromRuns, minFromCols));
      }
    }

    let nextCols = Math.max(1, meta.columnCount || 1);
    const wrapStyle =
      meta.wrapStyle === "bottom_wrap" || meta.wrapStyle === "cycle"
        ? meta.wrapStyle
        : null;

    if (typeof count === "number" && count > 0) {
      const reqCols = computeRequiredColumnsForInningPlan(
        leadOff,
        count,
        lineupLen,
        wrapStyle
      );
      if (reqCols > nextCols) {
        nextCols = reqCols;
        anyColumnCountChanged = true;
      }
      const endOrder = computeInningEndOrder(leadOff, count, lineupLen)!;
      runningLeadOff = (endOrder % lineupLen) + 1;
    } else if (count === 0) {
      runningLeadOff = leadOff;
    }

    return {
      ...meta,
      columnCount: nextCols,
      leadOffOrder: count !== null ? leadOff : meta.leadOffOrder,
      batterCount: count !== null ? count : meta.batterCount,
      wrapStyle,
    };
  });

  const baseUpdated: ScorebookSheetStructure = {
    ...structure,
    innings: updatedSorted,
  };

  if (anyColumnCountChanged) {
    return syncStructureBoxesFromCorners(
      baseUpdated,
      resolveStructureGridCorners(baseUpdated)
    );
  }
  return baseUpdated;
}

/**
 * STEP 2 で特定イニングの「打席人数（または終了打者）」をユーザーが変更した際、
 * 1) 対象イニングの batterCount と必要な columnCount（打者一巡時の2列化等）を更新し、
 * 2) 後続イニングの leadOffOrder を自動更新しつつ、1〜2人程度の境界補正なら後続イニングの終了打順を維持して手直し連鎖を最小化し、
 *    3者凡退等で最低人数（3人等）を下回る場合は自動で玉突きシフトさせる。
 */
export function applyInningBatterCountEdit(
  structure: ScorebookSheetStructure,
  targetInning: number,
  rawNextBatterCount: number
): ScorebookSheetStructure {
  const normalized = normalizeStructureInningBatterPlan(structure, {
    fillDefaultWhenMissing: true,
  });
  const lineupLen = resolveEffectiveBattingCycleLength(normalized);
  const sorted = [...normalized.innings].sort((a, b) => a.inning - b.inning);
  const targetIdx = sorted.findIndex((m) => m.inning === targetInning);
  if (targetIdx < 0) return normalized;

  const isTargetFinal = targetIdx === sorted.length - 1;
  const minAllowed = isTargetFinal && !normalized.isTop ? 0 : 1;
  const nextBatterCount = Math.min(
    36,
    Math.max(minAllowed, Math.round(rawNextBatterCount))
  );

  let anyColChanged = false;
  const targetMeta = sorted[targetIdx];
  const targetLeadOff = clampBattingOrder(
    targetMeta.leadOffOrder ?? 1,
    lineupLen
  );
  const targetWrap = targetMeta.wrapStyle ?? null;
  const nextTargetCols =
    nextBatterCount === 0
      ? 1
      : computeRequiredColumnsForInningPlan(
          targetLeadOff,
          nextBatterCount,
          lineupLen,
          targetWrap
        );
  if (nextTargetCols !== Math.max(1, targetMeta.columnCount || 1)) {
    anyColChanged = true;
  }

  sorted[targetIdx] = {
    ...targetMeta,
    leadOffOrder: targetLeadOff,
    batterCount: nextBatterCount,
    columnCount: nextTargetCols,
  };

  // 後続イニングへのスマート連動
  for (let i = targetIdx + 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const prevLead = clampBattingOrder(prev.leadOffOrder ?? 1, lineupLen);
    const prevCount = prev.batterCount ?? 3;
    const expectedNextLead =
      prevCount <= 0
        ? prevLead
        : ((prevLead - 1 + prevCount) % lineupLen) + 1;

    const cur = sorted[i];
    if (cur.isLeadOffPinned && typeof cur.leadOffOrder === "number") {
      continue;
    }

    const oldLead = clampBattingOrder(cur.leadOffOrder ?? 1, lineupLen);
    if (expectedNextLead === oldLead) {
      continue;
    }

    const oldCount = cur.batterCount ?? 3;
    if (oldCount === 0) {
      sorted[i] = {
        ...cur,
        leadOffOrder: expectedNextLead,
      };
      continue;
    }

    const isFinal = i === sorted.length - 1;
    const oldEndOrder = computeInningEndOrder(oldLead, oldCount, lineupLen)!;
    const oldExtraCycles = Math.floor(Math.max(0, oldCount - 1) / lineupLen);
    const baseSpanToOldEnd =
      ((oldEndOrder - expectedNextLead + lineupLen) % lineupLen) + 1;
    const candidateKeepEndCount =
      baseSpanToOldEnd + oldExtraCycles * lineupLen;

    const minValidForDownstream = !isFinal
      ? Math.max(3, cur.inning <= 5 ? cur.runs + 3 : 3)
      : normalized.isTop
        ? 3
        : Math.max(1, cur.runs, 3);

    const nextCount =
      candidateKeepEndCount >= minValidForDownstream &&
      Math.abs(candidateKeepEndCount - oldCount) <= 2
        ? candidateKeepEndCount
        : Math.max(oldCount, minValidForDownstream);

    const nextCols = computeRequiredColumnsForInningPlan(
      expectedNextLead,
      nextCount,
      lineupLen,
      cur.wrapStyle ?? null
    );
    if (nextCols !== Math.max(1, cur.columnCount || 1)) {
      anyColChanged = true;
    }

    sorted[i] = {
      ...cur,
      leadOffOrder: expectedNextLead,
      batterCount: nextCount,
      columnCount: nextCols,
    };
  }

  const updatedStruct: ScorebookSheetStructure = {
    ...normalized,
    innings: sorted,
  };
  return anyColChanged
    ? syncStructureBoxesFromCorners(
        updatedStruct,
        resolveStructureGridCorners(updatedStruct)
      )
    : updatedStruct;
}

/**
 * STEP 2 で特定イニングの「先頭打順」を明示変更（または自動連動へ解除）する。
 * 例: 前イニングが打席途中の盗塁死・牽制死で3アウトチェンジになり、同じ打者が次イニング先頭になる場合など。
 */
export function applyInningLeadOffEdit(
  structure: ScorebookSheetStructure,
  targetInning: number,
  nextLeadOffOrder: number | null
): ScorebookSheetStructure {
  const normalized = normalizeStructureInningBatterPlan(structure, {
    fillDefaultWhenMissing: true,
  });
  const lineupLen = resolveEffectiveBattingCycleLength(normalized);
  const sorted = [...normalized.innings].sort((a, b) => a.inning - b.inning);
  const targetIdx = sorted.findIndex((m) => m.inning === targetInning);
  if (targetIdx < 0) return normalized;

  const cur = sorted[targetIdx];
  const prev = targetIdx > 0 ? sorted[targetIdx - 1] : null;
  const naturalLeadOff =
    prev === null
      ? 1
      : (prev.batterCount ?? 0) <= 0
        ? clampBattingOrder(prev.leadOffOrder ?? 1, lineupLen)
        : ((clampBattingOrder(prev.leadOffOrder ?? 1, lineupLen) -
            1 +
            (prev.batterCount ?? 3)) %
            lineupLen) +
          1;

  const resolvedLeadOff =
    nextLeadOffOrder === null
      ? naturalLeadOff
      : clampBattingOrder(nextLeadOffOrder, lineupLen);
  const isPinned =
    nextLeadOffOrder !== null && resolvedLeadOff !== naturalLeadOff;

  const oldLead = clampBattingOrder(cur.leadOffOrder ?? naturalLeadOff, lineupLen);
  const oldCount = cur.batterCount ?? 3;
  let nextCount = oldCount;
  if (oldCount > 0 && resolvedLeadOff !== oldLead) {
    const oldEnd = computeInningEndOrder(oldLead, oldCount, lineupLen)!;
    const oldExtraCycles = Math.floor(Math.max(0, oldCount - 1) / lineupLen);
    const candidate =
      ((oldEnd - resolvedLeadOff + lineupLen) % lineupLen) +
      1 +
      oldExtraCycles * lineupLen;
    const isFinal = targetIdx === sorted.length - 1;
    const minValid = !isFinal ? 3 : normalized.isTop ? 3 : 1;
    if (candidate >= minValid && Math.abs(candidate - oldCount) <= 2) {
      nextCount = candidate;
    }
  }

  sorted[targetIdx] = {
    ...cur,
    leadOffOrder: resolvedLeadOff,
    isLeadOffPinned: isPinned,
    batterCount: nextCount,
  };

  return applyInningBatterCountEdit(
    {
      ...normalized,
      innings: sorted,
    },
    targetInning,
    nextCount
  );
}

/**
 * Stage 2（1球検算 `/analyze-inning-chunk`）でAIが返した打席配列を、
 * STEP 2 で確定ロックされたイニング別の打順シーケンス（plannedSlots）へ厳密に1対1アライメントする。
 * - 計画外の白紙行ノイズ（幽霊打席）を確実に除去
 * - 万が一1イニング内で上から順（1番〜9番）に出力されても先頭打順からの正しい時系列へ整列
 * - 記入が薄くAIが飛ばした枠があれば低確信度プレースホルダーを補完（直後の2.5倍ピンポイント再読取の対象化）
 */
export function alignParsedAtBatsToPlannedInningSequence(
  parsedAtBats: ScorebookV2AtBat[],
  targetInnings: ReadonlyArray<number>,
  isTop: boolean,
  structure: ScorebookSheetStructure
): ScorebookV2AtBat[] {
  const lineupLen = resolveEffectiveBattingCycleLength(structure);
  const targetSet = new Set(targetInnings);
  const untouchedOther = parsedAtBats.filter((a) => !targetSet.has(a.inning));
  const alignedTarget: ScorebookV2AtBat[] = [];

  for (const innNum of [...targetInnings].sort((a, b) => a - b)) {
    const meta = structure.innings.find((m) => m.inning === innNum);
    const innParsed = parsedAtBats.filter((a) => a.inning === innNum);
    const plannedSlots = computeInningPlannedSlots(meta, lineupLen);

    if (plannedSlots === null) {
      alignedTarget.push(...innParsed);
      continue;
    }

    if (plannedSlots.length === 0) {
      // batterCount === 0（未消化 ×）
      continue;
    }

    // 既に完全一致している場合の高速パス
    const alreadyExact =
      innParsed.length === plannedSlots.length &&
      plannedSlots.every(
        (slot, idx) => innParsed[idx]?.battingOrder === slot.battingOrder
      );
    if (alreadyExact) {
      for (let idx = 0; idx < plannedSlots.length; idx++) {
        alignedTarget.push({
          ...innParsed[idx],
          columnIndex: plannedSlots[idx].subCol,
        });
      }
      continue;
    }

    // 打順ごとの出現キューを構築し、同一(battingOrder, subCol)一致を優先しつつ時系列スロットへ割り当てる
    const pool = innParsed.map((ab, idx) => ({ ab, used: false, idx }));
    const matchedForSlot: Array<ScorebookV2AtBat | null> = plannedSlots.map(
      (slot) => {
        // 1) battingOrder と subCol の両方が一致する未使用要素
        const exactSubIdx = pool.findIndex(
          (item) =>
            !item.used &&
            item.ab.battingOrder === slot.battingOrder &&
            item.ab.columnIndex === slot.subCol
        );
        if (exactSubIdx >= 0) {
          pool[exactSubIdx].used = true;
          return pool[exactSubIdx].ab;
        }
        // 2) battingOrder が一致する最初の未使用要素（上から順に出力された循環イニングも時系列順へ復元）
        const orderOnlyIdx = pool.findIndex(
          (item) => !item.used && item.ab.battingOrder === slot.battingOrder
        );
        if (orderOnlyIdx >= 0) {
          pool[orderOnlyIdx].used = true;
          return pool[orderOnlyIdx].ab;
        }
        return null;
      }
    );

    const matchedKnownOuts = matchedForSlot.reduce(
      (sum, item) => sum + (item ? Math.max(0, item.outsInPlay) : 0),
      0
    );
    let runningKnownOuts = matchedKnownOuts;

    for (let sIdx = 0; sIdx < plannedSlots.length; sIdx++) {
      const slot = plannedSlots[sIdx];
      const existing = matchedForSlot[sIdx];
      if (existing) {
        alignedTarget.push({
          ...existing,
          inning: innNum,
          isTop,
          columnIndex: slot.subCol,
          battingOrder: slot.battingOrder,
        });
        continue;
      }

      // 記入が薄く飛ばされたスロットは、他の確定アウト合計に応じて3アウト超過を起こさない仮初期値を入れて低確信度マーク（直後の超拡大再解析対象）にする
      const resolved = resolveActiveMatchupFromStructure(
        structure,
        innNum,
        slot.battingOrder,
        undefined,
        slot.subCol,
        meta?.leadOffOrder ?? null
      );
      const needsOutToCompleteInning = runningKnownOuts < 3;
      if (needsOutToCompleteInning) {
        runningKnownOuts += 1;
      }

      alignedTarget.push({
        id: crypto.randomUUID(),
        inning: innNum,
        isTop,
        columnIndex: slot.subCol,
        battingOrder: slot.battingOrder,
        batterName: resolved.batterName,
        batterPlayerId: resolved.batterPlayerId,
        pitcherName: resolved.pitcherName,
        pitcherPlayerId: resolved.pitcherPlayerId,
        resultCode: needsOutToCompleteInning ? "groundout" : "single",
        resultLabel: needsOutToCompleteInning ? "内ゴロ" : "単打",
        battedDirection: "",
        rbi: 0,
        outsInPlay: needsOutToCompleteInning ? 1 : 0,
        endingOuts: Math.min(3, runningKnownOuts),
        runsInPlay: 0,
        balls: 0,
        strikes: 0,
        pitches: [needsOutToCompleteInning ? "in_play" : "hit"],
        advances: [
          {
            id: crypto.randomUUID(),
            runnerName: resolved.batterName,
            from: "BAT",
            to: "1B",
            method: needsOutToCompleteInning ? "other" : "hit",
            isOut: needsOutToCompleteInning,
          },
        ],
        confidence: "low",
        confidenceReason: "STEP2で指定された打順マスの記入が薄いため要確認",
      });
    }
  }

  return [...untouchedOther, ...alignedTarget].sort(
    (a, b) => a.inning - b.inning
  );
}
