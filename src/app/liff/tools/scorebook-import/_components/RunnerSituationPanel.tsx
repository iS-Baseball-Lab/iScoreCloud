// filepath: src/app/liff/tools/scorebook-import/_components/RunnerSituationPanel.tsx
"use client";

import React, { useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
} from "lucide-react";
import {
  ADVANCE_METHOD_LABELS,
  type AdvanceMethodCode,
  type ScorebookBatterSlot,
  type ScorebookV2Advance,
  type ScorebookV2AtBat,
} from "@/types/scorebook-v2";
import {
  applyPrecedingRunnerSelection,
  computeSyncedStatsFromAdvances,
  formatBaseJa,
  formatOccupiedRunnersShort,
  formatOutsAndBasesLabel,
  formatRunnerBadgeName,
  isPrePlayAdvanceMethod,
  sortAdvancesClosestToHomeFirst,
  sortPrecedingRunnersClosestToHomeFirst,
  type AtBatRunnerSnapshot,
  type BaseRunnerMap,
  type DeferredPersonalRunInfo,
  type OccupiedBaseKey,
  type PrecedingRunnerSummary,
} from "@/lib/liff/scorebook-runners";

interface MiniBaseDiamondProps {
  bases: BaseRunnerMap;
  size?: "sm" | "md";
  tone?: "before" | "after";
  dimmed?: boolean;
}

/**
 * 直射日光下でも一目で「一・二・三塁のどこに走者がいるか」が判別できる高コントラスト・ソリッドSVGダイヤモンド
 */
export function MiniBaseDiamond({
  bases,
  size = "sm",
  tone = "before",
  dimmed = false,
}: MiniBaseDiamondProps) {
  const px = size === "md" ? 38 : 22;
  const activeFill =
    tone === "after" ? "#10b981" : "#f59e0b"; // emerald-500 / amber-500
  const activeStroke =
    tone === "after" ? "#047857" : "#b45309"; // emerald-700 / amber-700
  const emptyFill = dimmed ? "#e2e8f0" : "#f8fafc";
  const emptyStroke = "#64748b";

  const has1B = !dimmed && Boolean(bases["1B"]);
  const has2B = !dimmed && Boolean(bases["2B"]);
  const has3B = !dimmed && Boolean(bases["3B"]);

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 36 36"
      aria-hidden="true"
      className="shrink-0"
    >
      {/* 内野ラインガイド */}
      <polygon
        points="18,6 30,18 18,30 6,18"
        fill="none"
        stroke="#94a3b8"
        strokeWidth="1.2"
        strokeDasharray="2 1.5"
      />
      {/* 二塁 (Top) */}
      <polygon
        points="18,2.5 23.5,8 18,13.5 12.5,8"
        fill={has2B ? activeFill : emptyFill}
        stroke={has2B ? activeStroke : emptyStroke}
        strokeWidth="1.8"
      />
      {/* 三塁 (Left) */}
      <polygon
        points="6.5,14 12,19.5 6.5,25 1,19.5"
        fill={has3B ? activeFill : emptyFill}
        stroke={has3B ? activeStroke : emptyStroke}
        strokeWidth="1.8"
      />
      {/* 一塁 (Right) */}
      <polygon
        points="29.5,14 35,19.5 29.5,25 24,19.5"
        fill={has1B ? activeFill : emptyFill}
        stroke={has1B ? activeStroke : emptyStroke}
        strokeWidth="1.8"
      />
      {/* 本塁 (Bottom pentagon) */}
      <polygon
        points="15,28.5 21,28.5 21,31.5 18,34 15,31.5"
        fill="#cbd5e1"
        stroke="#475569"
        strokeWidth="1.3"
      />
    </svg>
  );
}

interface AtBatCardRunnerStripProps {
  atBat: ScorebookV2AtBat;
  snapshot?: AtBatRunnerSnapshot;
  deferredPersonalRun?: DeferredPersonalRunInfo;
}

/**
 * Step 3 打席カード内に常時表示する「打席前 ➔ 打席後の走者・アウト状況 ＆ 先行走者の進塁結果」バー
 */
export function AtBatCardRunnerStrip({
  atBat,
  snapshot,
  deferredPersonalRun,
}: AtBatCardRunnerStripProps) {
  if (!snapshot) return null;

  const beforeRunnersText = formatOccupiedRunnersShort(snapshot.basesBefore);
  const afterRunnersText = snapshot.isInningOver
    ? ""
    : formatOccupiedRunnersShort(snapshot.basesAfterPlay);

  const hasPrecedingRunners = snapshot.precedingRunners.length > 0;
  const hasBatterExtra = Boolean(snapshot.batterSummary.extraExplicitMove);
  const hasDeferredPersonalRun = Boolean(deferredPersonalRun);

  return (
    <div className="rounded-xl bg-card border border-border px-2.5 py-1.5 space-y-1.5">
      {/* 上段: 打席前ダイヤモンド ➔ 打席後ダイヤモンド */}
      <div className="flex items-center justify-between gap-1.5 flex-wrap">
        <div className="flex items-center gap-1.5 min-w-0">
          <MiniBaseDiamond
            bases={snapshot.basesBefore}
            size="sm"
            tone="before"
          />
          <div className="min-w-0">
            <span className="text-[10px] font-black text-foreground block leading-tight">
              開始: {formatOutsAndBasesLabel(snapshot.outsBefore, snapshot.basesBefore)}
            </span>
            {beforeRunnersText && (
              <span className="text-[9px] font-bold text-amber-700 dark:text-amber-300 block truncate leading-tight">
                {beforeRunnersText}
              </span>
            )}
          </div>
        </div>

        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />

        <div className="flex items-center gap-1.5 min-w-0">
          <MiniBaseDiamond
            bases={snapshot.basesAfterPlay}
            size="sm"
            tone="after"
            dimmed={snapshot.isInningOver}
          />
          <div className="min-w-0 text-right sm:text-left">
            <span
              className={`text-[10px] font-black block leading-tight ${
                snapshot.isInningOver
                  ? "text-slate-600 dark:text-slate-300"
                  : "text-emerald-700 dark:text-emerald-300"
              }`}
            >
              終了:{" "}
              {formatOutsAndBasesLabel(
                snapshot.outsAfter,
                snapshot.basesAfterPlay,
                snapshot.isInningOver
              )}
            </span>
            {afterRunnersText && (
              <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-300 block truncate leading-tight">
                {afterRunnersText}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 下段: 前の走者がいた場合、それぞれの進塁・生還・アウト・残留、および出塁打者の後続生還（●）を明示 */}
      {(hasPrecedingRunners || hasBatterExtra || hasDeferredPersonalRun) && (
        <div className="pt-1 border-t border-border/70 flex items-center flex-wrap gap-1">
          {snapshot.precedingRunners.map((pr) => {
            const rLabel = formatRunnerBadgeName(pr.runner);
            const preTag =
              pr.prePlayMoves.length > 0
                ? `${pr.prePlayMoves
                    .map(
                      (m) =>
                        `${formatBaseJa(m.from)}→${formatBaseJa(m.to)}(${
                          ADVANCE_METHOD_LABELS[m.method]
                        })`
                    )
                    .join("・")}`
                : "";

            if (pr.isOut) {
              return (
                <span
                  key={`${atBat.id}-pr-${pr.startBase}`}
                  className="px-1.5 py-0.5 rounded-md bg-destructive/12 border border-destructive/35 text-destructive text-[10px] font-black"
                >
                  ✖ {rLabel}: {formatBaseJa(pr.startBase)}→
                  {formatBaseJa(pr.finalBase)}アウト（
                  {ADVANCE_METHOD_LABELS[pr.effectiveMethod]}）
                </span>
              );
            }

            if (pr.finalBase === "HP") {
              return (
                <span
                  key={`${atBat.id}-pr-${pr.startBase}`}
                  className="px-1.5 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/35 text-rose-700 dark:text-rose-300 text-[10px] font-black"
                >
                  🏠 {rLabel}: {formatBaseJa(pr.startBase)}→本塁生還
                  {preTag ? `［${preTag}後］` : `（${ADVANCE_METHOD_LABELS[pr.effectiveMethod]}）`}
                </span>
              );
            }

            if (pr.finalBase !== pr.startBase) {
              return (
                <span
                  key={`${atBat.id}-pr-${pr.startBase}`}
                  className="px-1.5 py-0.5 rounded-md bg-emerald-500/12 border border-emerald-500/35 text-emerald-800 dark:text-emerald-200 text-[10px] font-black"
                >
                  🏃 {rLabel}: {formatBaseJa(pr.startBase)}→
                  {formatBaseJa(pr.finalBase)}（
                  {ADVANCE_METHOD_LABELS[pr.effectiveMethod]}
                  {pr.isImplicit ? "・自動" : ""}）
                </span>
              );
            }

            if (snapshot.isInningOver) {
              return (
                <span
                  key={`${atBat.id}-pr-${pr.startBase}`}
                  className="px-1.5 py-0.5 rounded-md bg-muted border border-border text-muted-foreground text-[10px] font-bold"
                >
                  {rLabel}: {formatBaseJa(pr.startBase)}残塁
                </span>
              );
            }

            return (
              <span
                key={`${atBat.id}-pr-${pr.startBase}`}
                className="px-1.5 py-0.5 rounded-md bg-amber-500/12 border border-amber-500/35 text-amber-800 dark:text-amber-200 text-[10px] font-black"
              >
                ⏸ {rLabel}: {formatBaseJa(pr.startBase)}のまま（進塁時はタップで変更）
              </span>
            );
          })}

          {snapshot.batterSummary.extraExplicitMove && (
            <span
              className={`px-1.5 py-0.5 rounded-md border text-[10px] font-black ${
                snapshot.batterSummary.isOutOnBases
                  ? "bg-destructive/12 border-destructive/35 text-destructive"
                  : "bg-indigo-500/12 border-indigo-500/35 text-indigo-700 dark:text-indigo-300"
              }`}
            >
              打者走者({atBat.battingOrder}.{atBat.batterName || "打者"}):{" "}
              {formatBaseJa(snapshot.batterSummary.extraExplicitMove.from)}→
              {formatBaseJa(snapshot.batterSummary.extraExplicitMove.to)}
              {snapshot.batterSummary.isOutOnBases ? "アウト" : ""}（
              {
                ADVANCE_METHOD_LABELS[
                  snapshot.batterSummary.extraExplicitMove.method
                ]
              }
              ）
            </span>
          )}

          {deferredPersonalRun && (
            <span className="px-1.5 py-0.5 rounded-md bg-sky-500/15 border border-sky-500/35 text-sky-800 dark:text-sky-200 text-[10px] font-black">
              ● 後続（{deferredPersonalRun.scorerBattingOrder}番{" "}
              {deferredPersonalRun.scorerName}）で生還 ➔ 本人の個人得点+1
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export interface PrecedingRunnerCellCrop {
  startBase: OccupiedBaseKey;
  currentBase?: OccupiedBaseKey | "HP" | null;
  battingOrder: number;
  runnerName: string;
  atBatId: string | null;
  columnIndex: number;
  cropUrl: string;
}

interface AtBatModalRunnerEditorProps {
  atBat: ScorebookV2AtBat;
  snapshot?: AtBatRunnerSnapshot;
  batters: ScorebookBatterSlot[];
  runnerCellCrops?: Partial<Record<OccupiedBaseKey, PrecedingRunnerCellCrop>>;
  onJumpToRunnerAtBat?: (atBatId: string) => void;
  onUpdateAtBat: (updater: (prev: ScorebookV2AtBat) => ScorebookV2AtBat) => void;
}

const IN_PLAY_SAFE_REASON_CHIPS: ReadonlyArray<{
  code: AdvanceMethodCode;
  label: string;
}> = [
  { code: "hit", label: "打撃・インプレー" },
  { code: "sac", label: "犠打・犠飛" },
  { code: "error", label: "失策・悪送球(E)" },
  { code: "throw_advance", label: "送球間(T)" },
  { code: "walk", label: "四死球押出" },
  { code: "fc", label: "野選(FC)" },
  { code: "obstruction", label: "走塁妨害" },
];

const IN_PLAY_OUT_REASON_CHIPS: ReadonlyArray<{
  code: AdvanceMethodCode;
  label: string;
}> = [
  { code: "fc", label: "封殺・野選(FC)" },
  { code: "out_on_base", label: "走塁死・タッチアウト" },
  { code: "caught_stealing", label: "盗塁死(CS)" },
  { code: "pickoff_out", label: "牽制死(PO)" },
  { code: "interference_out", label: "守備妨害" },
  { code: "appeal_out", label: "アピール死" },
];

const QUICK_EVENT_PRESETS: ReadonlyArray<{
  label: string;
  from: "1B" | "2B" | "3B";
  to: "1B" | "2B" | "3B" | "HP";
  method: AdvanceMethodCode;
  isOut: boolean;
}> = [
  { label: "+本盗(3→本塁)", from: "3B", to: "HP", method: "steal", isOut: false },
  { label: "+三盗(2→3塁)", from: "2B", to: "3B", method: "steal", isOut: false },
  { label: "+二盗(1→2塁)", from: "1B", to: "2B", method: "steal", isOut: false },
  { label: "+盗塁死(CS)", from: "1B", to: "2B", method: "caught_stealing", isOut: true },
  { label: "+牽制死(PO)", from: "1B", to: "1B", method: "pickoff_out", isOut: true },
  { label: "+牽制悪送球", from: "1B", to: "2B", method: "pickoff_error", isOut: false },
  { label: "+暴投(WP)", from: "1B", to: "2B", method: "wp", isOut: false },
  { label: "+捕逸(PB)", from: "1B", to: "2B", method: "pb", isOut: false },
  { label: "+ボーク(BK)", from: "1B", to: "2B", method: "balk", isOut: false },
  { label: "+タイブレーク2塁", from: "2B", to: "2B", method: "tiebreak", isOut: false },
  { label: "+タイブレーク1塁", from: "1B", to: "1B", method: "tiebreak", isOut: false },
  { label: "+アピール死", from: "1B", to: "1B", method: "appeal_out", isOut: true },
];

function isHoldMarker(adv: ScorebookV2Advance): boolean {
  return (
    !adv.isOut &&
    adv.from !== "BAT" &&
    adv.from === adv.to &&
    adv.method !== "tiebreak"
  );
}

/**
 * 打席編集モーダル内の「走者状況（打席前➔打席後）＆ 前の走者のインプレー進塁・走塁ワンタップエディタ」
 */
export function AtBatModalRunnerEditor({
  atBat,
  snapshot,
  batters,
  runnerCellCrops,
  onJumpToRunnerAtBat,
  onUpdateAtBat,
}: AtBatModalRunnerEditorProps) {
  const [showOtherEventPresets, setShowOtherEventPresets] = useState(false);
  const [openPrePlayForBase, setOpenPrePlayForBase] =
    useState<OccupiedBaseKey | null>(null);

  const outsBefore = snapshot?.outsBefore ?? 0;
  const outsAfter =
    snapshot?.outsAfter ?? Math.min(3, outsBefore + atBat.outsInPlay);
  const basesBefore: BaseRunnerMap = snapshot?.basesBefore ?? {
    "1B": null,
    "2B": null,
    "3B": null,
  };
  const basesAfterPlay: BaseRunnerMap = snapshot?.basesAfterPlay ?? {
    "1B": null,
    "2B": null,
    "3B": null,
  };
  const isInningOver = snapshot?.isInningOver ?? outsAfter >= 3;
  const precedingRunners = sortPrecedingRunnersClosestToHomeFirst(
    snapshot?.precedingRunners ?? []
  );
  const batterSummary = snapshot?.batterSummary;

  const visibleExplicitAdvances = sortAdvancesClosestToHomeFirst(
    atBat.advances.filter(
      (a) =>
        !isHoldMarker(a) &&
        !(
          a.from === "BAT" &&
          !a.isOut &&
          batterSummary?.initialBase &&
          a.to === batterSummary.initialBase
        )
    )
  );

  // デフォルトの手動追加用走者（常にホームに近い占有走者: 3塁 ➔ 2塁 ➔ 1塁 を優先し、未登録塁があればそこを優先）
  const resolveDefaultManualRunner = (
    currentAdvances: readonly ScorebookV2Advance[] = atBat.advances
  ): {
    name: string;
    from: "1B" | "2B" | "3B";
  } => {
    for (const bKey of ["3B", "2B", "1B"] as const) {
      const r = basesBefore[bKey];
      if (!r) continue;
      const alreadyHasInPlay = currentAdvances.some(
        (a) =>
          !isHoldMarker(a) &&
          a.method !== "tiebreak" &&
          !isPrePlayAdvanceMethod(a.method) &&
          a.from === bKey
      );
      if (!alreadyHasInPlay) {
        return { name: r.name, from: bKey };
      }
    }
    if (basesBefore["3B"]) {
      return { name: basesBefore["3B"].name, from: "3B" };
    }
    if (basesBefore["2B"]) {
      return { name: basesBefore["2B"].name, from: "2B" };
    }
    if (basesBefore["1B"]) {
      return { name: basesBefore["1B"].name, from: "1B" };
    }
    const maxOrd = Math.max(9, batters.length || 9);
    const prevOrd = ((atBat.battingOrder - 2 + maxOrd) % maxOrd) + 1;
    const prevSlot = batters.find((b) => b.battingOrder === prevOrd);
    return {
      name: prevSlot?.name || "",
      from: "1B",
    };
  };

  const handleSelectRunnerOutcome = (
    summary: PrecedingRunnerSummary,
    targetBase: OccupiedBaseKey | "HP",
    isOut: boolean,
    preferredMethod?: AdvanceMethodCode
  ) => {
    onUpdateAtBat((prev) => {
      const res = applyPrecedingRunnerSelection({
        ab: prev,
        summary,
        allSummaries: precedingRunners,
        targetBase,
        isOut,
        preferredMethod,
        outsBefore,
        basesBefore,
      });
      return {
        ...prev,
        advances: res.advances,
        outsInPlay: res.outsInPlay,
        runsInPlay: res.runsInPlay,
        rbi: res.rbi,
        confidence: "high",
      };
    });
  };

  const handleAddPrePlayEventForRunner = (
    summary: PrecedingRunnerSummary,
    toBase: OccupiedBaseKey | "HP",
    method: AdvanceMethodCode,
    isOut: boolean
  ) => {
    const startFrom: OccupiedBaseKey =
      summary.baseAtInPlay && summary.baseAtInPlay !== "HP"
        ? summary.baseAtInPlay
        : summary.startBase;

    onUpdateAtBat((prev) => {
      const newAdv: ScorebookV2Advance = {
        id: crypto.randomUUID(),
        runnerName: summary.runner.name,
        from: startFrom,
        to: toBase,
        method,
        isOut,
      };
      // 既存の元塁インプレー進塁があれば起点を更新または一旦クリアして再評価させる
      const cleaned = prev.advances.filter(
        (a) =>
          !(
            !isPrePlayAdvanceMethod(a.method) &&
            a.method !== "tiebreak" &&
            a.from === startFrom &&
            (!a.runnerName || a.runnerName === summary.runner.name)
          )
      );
      const nextAdvances = sortAdvancesClosestToHomeFirst([
        ...cleaned,
        newAdv,
      ]);
      const synced = computeSyncedStatsFromAdvances(
        prev,
        nextAdvances,
        outsBefore,
        basesBefore
      );
      return {
        ...prev,
        advances: nextAdvances,
        outsInPlay: synced.outsInPlay,
        runsInPlay: synced.runsInPlay,
        rbi: synced.rbi,
        confidence: "high",
      };
    });
    setOpenPrePlayForBase(null);
  };

  const handleSetBatterExtraAdvance = (
    targetBase: OccupiedBaseKey | "HP" | null,
    isOut: boolean,
    method: AdvanceMethodCode = "throw_advance"
  ) => {
    const initialBase = batterSummary?.initialBase;
    if (!initialBase || initialBase === "HP") return;

    onUpdateAtBat((prev) => {
      const withoutBatterExtra = prev.advances.filter(
        (a) =>
          !(
            a.from === "BAT" ||
            (a.from === initialBase &&
              (!a.runnerName || a.runnerName === prev.batterName))
          )
      );
      let nextAdvances = withoutBatterExtra;
      if (targetBase && (isOut || targetBase !== initialBase)) {
        nextAdvances = [
          ...withoutBatterExtra,
          {
            id: crypto.randomUUID(),
            runnerName: prev.batterName,
            from: "BAT",
            to: targetBase,
            method,
            isOut,
          },
        ];
      }
      nextAdvances = sortAdvancesClosestToHomeFirst(nextAdvances);
      const synced = computeSyncedStatsFromAdvances(
        prev,
        nextAdvances,
        outsBefore,
        basesBefore
      );
      return {
        ...prev,
        advances: nextAdvances,
        outsInPlay: synced.outsInPlay,
        runsInPlay: synced.runsInPlay,
        rbi: synced.rbi,
        confidence: "high",
      };
    });
  };

  const handleManualAddInPlayAdvance = () => {
    onUpdateAtBat((prev) => {
      const def = resolveDefaultManualRunner(prev.advances);
      const defaultTo: "2B" | "3B" | "HP" =
        def.from === "3B" ? "HP" : def.from === "2B" ? "3B" : "2B";
      const newAdv: ScorebookV2Advance = {
        id: crypto.randomUUID(),
        runnerName: def.name,
        from: def.from,
        to: defaultTo,
        method: "hit",
        isOut: false,
      };
      const nextAdvances = sortAdvancesClosestToHomeFirst([
        ...prev.advances,
        newAdv,
      ]);
      const synced = computeSyncedStatsFromAdvances(
        prev,
        nextAdvances,
        outsBefore,
        basesBefore
      );
      return {
        ...prev,
        advances: nextAdvances,
        outsInPlay: synced.outsInPlay,
        runsInPlay: synced.runsInPlay,
        rbi: synced.rbi,
        confidence: "high",
      };
    });
  };

  const handleAddQuickPresetAdvance = (
    preset: (typeof QUICK_EVENT_PRESETS)[number]
  ) => {
    onUpdateAtBat((prev) => {
      let resolvedFrom: "1B" | "2B" | "3B" = preset.from;
      let resolvedTo: "1B" | "2B" | "3B" | "HP" = preset.to;
      if (preset.method !== "steal" && preset.method !== "tiebreak") {
        const leadOccupied = (["3B", "2B", "1B"] as const).find((bKey) =>
          Boolean(basesBefore[bKey])
        );
        if (leadOccupied) {
          resolvedFrom = leadOccupied;
          if (
            preset.method === "pickoff_out" ||
            preset.method === "appeal_out"
          ) {
            resolvedTo = leadOccupied;
          } else {
            resolvedTo =
              leadOccupied === "3B"
                ? "HP"
                : leadOccupied === "2B"
                ? "3B"
                : "2B";
          }
        }
      }
      const runnerOnTargetFrom =
        basesBefore[resolvedFrom]?.name ||
        resolveDefaultManualRunner(prev.advances).name;

      const newAdv: ScorebookV2Advance = {
        id: crypto.randomUUID(),
        runnerName: runnerOnTargetFrom,
        from: resolvedFrom,
        to: resolvedTo,
        method: preset.method,
        isOut: preset.isOut,
      };
      const nextAdvances = sortAdvancesClosestToHomeFirst([
        ...prev.advances,
        newAdv,
      ]);
      const synced = computeSyncedStatsFromAdvances(
        prev,
        nextAdvances,
        outsBefore,
        basesBefore
      );
      return {
        ...prev,
        advances: nextAdvances,
        outsInPlay: synced.outsInPlay,
        runsInPlay: synced.runsInPlay,
        rbi: synced.rbi,
        confidence: "high",
      };
    });
  };

  const handleUpdateExplicitAdvanceRow = (
    advId: string,
    patcher: (cur: ScorebookV2Advance) => ScorebookV2Advance
  ) => {
    onUpdateAtBat((prev) => {
      const nextAdvances = sortAdvancesClosestToHomeFirst(
        prev.advances.map((a) => (a.id === advId ? patcher(a) : a))
      );
      const synced = computeSyncedStatsFromAdvances(
        prev,
        nextAdvances,
        outsBefore,
        basesBefore
      );
      return {
        ...prev,
        advances: nextAdvances,
        outsInPlay: synced.outsInPlay,
        runsInPlay: synced.runsInPlay,
        rbi: synced.rbi,
        confidence: "high",
      };
    });
  };

  const handleDeleteExplicitAdvanceRow = (advId: string) => {
    onUpdateAtBat((prev) => {
      const nextAdvances = prev.advances.filter((a) => a.id !== advId);
      const synced = computeSyncedStatsFromAdvances(
        prev,
        nextAdvances,
        outsBefore,
        basesBefore
      );
      return {
        ...prev,
        advances: nextAdvances,
        outsInPlay: synced.outsInPlay,
        runsInPlay: synced.runsInPlay,
        rbi: synced.rbi,
        confidence: "high",
      };
    });
  };

  return (
    <div className="p-3 rounded-2xl bg-amber-500/8 border-2 border-amber-500/35 space-y-3">
      {/* セクション見出し */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-black text-foreground flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 rounded-md bg-amber-500 text-white text-[10px] font-black">
            STEP 3
          </span>
          <span>走者・進塁（塁上の走者状況 ＆ 前の走者の進塁・生還）</span>
        </span>
        <span className="text-[10px] font-bold text-muted-foreground">
          ボタン1タップで進塁・得点・アウト連動
        </span>
      </div>

      {/* 1. 打席開始前 ➔ 打席終了後 ビジュアルダイヤモンド比較パネル（ソリッド高視認性） */}
      <div className="grid grid-cols-11 gap-1.5 items-stretch">
        {/* 打席前 */}
        <div className="col-span-5 p-2.5 rounded-xl bg-card border border-border flex flex-col justify-between gap-1.5">
          <div className="flex items-center gap-2">
            <MiniBaseDiamond bases={basesBefore} size="md" tone="before" />
            <div className="min-w-0">
              <span className="text-[9px] font-bold text-muted-foreground block">
                打席開始前
              </span>
              <span className="text-xs font-black text-foreground block leading-tight">
                {formatOutsAndBasesLabel(outsBefore, basesBefore)}
              </span>
            </div>
          </div>
          <div className="space-y-0.5 text-[10px] font-bold border-t border-border pt-1">
            {(["3B", "2B", "1B"] as const).map((bKey) => {
              const r = basesBefore[bKey];
              return (
                <div
                  key={`before-${bKey}`}
                  className="flex items-center justify-between gap-1"
                >
                  <span className="text-muted-foreground shrink-0">
                    {formatBaseJa(bKey)}:
                  </span>
                  <span
                    className={`truncate font-black ${
                      r ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground/60"
                    }`}
                  >
                    {r ? formatRunnerBadgeName(r) : "ー"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 矢印 */}
        <div className="col-span-1 flex items-center justify-center">
          <ArrowRight className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        </div>

        {/* 打席後 */}
        <div className="col-span-5 p-2.5 rounded-xl bg-card border border-border flex flex-col justify-between gap-1.5">
          <div className="flex items-center gap-2">
            <MiniBaseDiamond
              bases={basesAfterPlay}
              size="md"
              tone="after"
              dimmed={isInningOver}
            />
            <div className="min-w-0">
              <span className="text-[9px] font-bold text-muted-foreground block">
                打席終了後
              </span>
              <span
                className={`text-xs font-black block leading-tight ${
                  isInningOver
                    ? "text-slate-700 dark:text-slate-200"
                    : "text-emerald-700 dark:text-emerald-300"
                }`}
              >
                {formatOutsAndBasesLabel(outsAfter, basesAfterPlay, isInningOver)}
              </span>
            </div>
          </div>
          {isInningOver ? (
            <div className="border-t border-border pt-1.5 flex items-center justify-center h-full">
              <span className="px-2 py-0.5 rounded-md bg-slate-700 text-white text-[10px] font-black">
                3アウト攻守交代
              </span>
            </div>
          ) : (
            <div className="space-y-0.5 text-[10px] font-bold border-t border-border pt-1">
              {(["3B", "2B", "1B"] as const).map((bKey) => {
                const r = basesAfterPlay[bKey];
                return (
                  <div
                    key={`after-${bKey}`}
                    className="flex items-center justify-between gap-1"
                  >
                    <span className="text-muted-foreground shrink-0">
                      {formatBaseJa(bKey)}:
                    </span>
                    <span
                      className={`truncate font-black ${
                        r
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-muted-foreground/60"
                      }`}
                    >
                      {r ? formatRunnerBadgeName(r) : "ー"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 2. 塁上にいる各先行走者（3塁走者 ➔ 2塁走者 ➔ 1塁走者）のワンタップ進塁カード */}
      {precedingRunners.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[11px] font-black text-foreground">
              塁上の走者ごとの結果（タップで進塁先・生還・アウトを指定）:
            </span>
            {precedingRunners.length >= 2 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/35 text-amber-800 dark:text-amber-200 text-[10px] font-black">
                ホームに近い走者順（
                {precedingRunners
                  .map((r) => formatBaseJa(r.baseAtInPlay ?? r.startBase))
                  .join(" ➔ ")}
                ）
              </span>
            )}
          </div>

          {precedingRunners.map((pr, runnerIdx) => {
            const inPlayBase: OccupiedBaseKey | "HP" | null = pr.baseAtInPlay;
            const orderCircled =
              runnerIdx === 0 ? "①" : runnerIdx === 1 ? "②" : "③";
            const displayCurrentBase =
              inPlayBase && inPlayBase !== "HP" ? inPlayBase : pr.startBase;
            const candidateTargets: ReadonlyArray<OccupiedBaseKey | "HP"> =
              inPlayBase === "3B"
                ? ["3B", "HP"]
                : inPlayBase === "2B"
                ? ["2B", "3B", "HP"]
                : ["1B", "2B", "3B", "HP"];

            const outCandidateBases: ReadonlyArray<OccupiedBaseKey | "HP"> =
              inPlayBase === "3B"
                ? ["HP", "3B"]
                : inPlayBase === "2B"
                ? ["3B", "HP", "2B"]
                : ["2B", "3B", "HP", "1B"];

            const isHolding =
              !pr.isOut && inPlayBase !== null && pr.finalBase === inPlayBase;

            return (
              <div
                key={`runner-card-${pr.startBase}`}
                className="p-2.5 rounded-xl bg-card border border-border space-y-2 shadow-2xs"
              >
                {/* 走者ヘッダー */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-md bg-amber-500 text-white text-[10px] font-black">
                      {precedingRunners.length >= 2 ? `${orderCircled} ` : ""}
                      {formatBaseJa(displayCurrentBase)}走者
                      {displayCurrentBase !== pr.startBase
                        ? `（開始${formatBaseJa(pr.startBase)}）`
                        : ""}
                    </span>
                    <span className="text-xs font-black text-foreground">
                      {pr.runner.battingOrder > 0
                        ? `${pr.runner.battingOrder}番 `
                        : ""}
                      {pr.runner.name || "走者"}
                    </span>
                  </div>

                  {/* 現在ステータスバッジ */}
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      pr.isOut
                        ? "bg-destructive text-white"
                        : pr.finalBase === "HP"
                        ? "bg-rose-600 text-white"
                        : !isHolding
                        ? "bg-emerald-600 text-white"
                        : "bg-muted text-foreground border border-border"
                    }`}
                  >
                    {pr.isOut
                      ? `✖ ${formatBaseJa(pr.finalBase)}アウト`
                      : pr.finalBase === "HP"
                      ? "🏠 本塁生還 (+1点)"
                      : !isHolding
                      ? `➔ ${formatBaseJa(pr.finalBase)}へ進塁${
                          pr.isImplicit ? "（自動）" : ""
                        }`
                      : `${formatBaseJa(pr.startBase)}のまま`}
                  </span>
                </div>

                {/* 先行走者の手書き原本マス切り抜き（進塁線・本塁●・アウトⅠⅡⅢをその場で確認） */}
                {(() => {
                  const rCrop = runnerCellCrops?.[pr.startBase];
                  if (!rCrop?.cropUrl) return null;
                  return (
                    <div className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
                      <div className="px-2.5 py-1 bg-slate-900 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-black text-amber-300 truncate">
                          原本マス（
                          {rCrop.battingOrder > 0
                            ? `${rCrop.battingOrder}番 `
                            : ""}
                          {rCrop.runnerName || "走者"}
                          {rCrop.columnIndex >= 2
                            ? `・${rCrop.columnIndex}列目`
                            : ""}
                          ）※進塁線・●・ⅠⅡⅢを確認
                        </span>
                        {rCrop.atBatId && onJumpToRunnerAtBat && (
                          <button
                            type="button"
                            onClick={() => onJumpToRunnerAtBat(rCrop.atBatId!)}
                            className="px-2 py-0.5 rounded-md bg-white/15 hover:bg-white/25 text-white text-[9px] font-black shrink-0 cursor-pointer"
                          >
                            この走者の打席へ
                          </button>
                        )}
                      </div>
                      <div className="p-1.5 flex items-center justify-center">
                        <img
                          src={rCrop.cropUrl}
                          alt={`${formatBaseJa(pr.startBase)}走者の原本マス`}
                          className="max-h-28 w-full object-contain rounded-md"
                        />
                      </div>
                    </div>
                  );
                })()}

                {/* 投球間イベント（盗塁・暴投等）が入っている場合の表示 */}
                {pr.prePlayMoves.length > 0 && (
                  <div className="flex items-center flex-wrap gap-1">
                    {pr.prePlayMoves.map((pm) => (
                      <span
                        key={pm.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-500/12 border border-sky-500/35 text-sky-800 dark:text-sky-200 text-[10px] font-black"
                      >
                        <span>
                          投球間: {formatBaseJa(pm.from)}→{formatBaseJa(pm.to)}（
                          {ADVANCE_METHOD_LABELS[pm.method]}）
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteExplicitAdvanceRow(pm.id)}
                          className="text-destructive ml-0.5 cursor-pointer"
                          aria-label="投球間進塁を削除"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* インプレー進塁先ワンタップボタン群（投球間アウト・本盗生還済でない場合） */}
                {!pr.isOutPrePlay && inPlayBase && inPlayBase !== "HP" && (
                  <>
                    <div
                      className={`grid gap-1 ${
                        candidateTargets.length === 4
                          ? "grid-cols-5"
                          : candidateTargets.length === 3
                          ? "grid-cols-4"
                          : "grid-cols-3"
                      }`}
                    >
                      {candidateTargets.map((tBase) => {
                        const isSameBase = tBase === inPlayBase;
                        const isBlocked =
                          tBase !== "HP" && pr.blockedHoldBases.includes(tBase);
                        const isSelected = !pr.isOut && pr.finalBase === tBase;

                        const btnLabel = isSameBase
                          ? `${formatBaseJa(tBase)}のまま`
                          : tBase === "HP"
                          ? "→本塁生還"
                          : `→${formatBaseJa(tBase)}へ`;

                        return (
                          <button
                            key={tBase}
                            type="button"
                            disabled={isBlocked}
                            onClick={() =>
                              handleSelectRunnerOutcome(pr, tBase, false)
                            }
                            className={`py-2 px-1 rounded-xl border text-[10px] font-black transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                              isSelected
                                ? tBase === "HP"
                                  ? "bg-rose-600 text-white border-rose-600 shadow-2xs"
                                  : isSameBase
                                  ? "bg-slate-700 text-white border-slate-700"
                                  : "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                                : "bg-muted/50 border-border text-foreground hover:bg-muted"
                            }`}
                          >
                            {btnLabel}
                          </button>
                        );
                      })}

                      {/* アウトボタン */}
                      <button
                        type="button"
                        onClick={() => {
                          const defaultOutTarget: OccupiedBaseKey | "HP" =
                            inPlayBase === "3B"
                              ? "HP"
                              : inPlayBase === "2B"
                              ? "3B"
                              : "2B";
                          handleSelectRunnerOutcome(pr, defaultOutTarget, true);
                        }}
                        className={`py-2 px-1 rounded-xl border text-[10px] font-black transition-all cursor-pointer ${
                          pr.isOut
                            ? "bg-destructive text-white border-destructive shadow-2xs"
                            : "bg-destructive/8 border-destructive/30 text-destructive hover:bg-destructive/15"
                        }`}
                      >
                        アウト
                      </button>
                    </div>

                    {/* セーフ進塁時の理由ワンタップ選択 */}
                    {!pr.isOut && pr.finalBase !== inPlayBase && (
                      <div className="pt-1 space-y-1">
                        <span className="text-[9px] font-bold text-muted-foreground block">
                          進塁理由（タップで切替）:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {IN_PLAY_SAFE_REASON_CHIPS.map((chip) => {
                            const active = pr.effectiveMethod === chip.code;
                            return (
                              <button
                                key={chip.code}
                                type="button"
                                onClick={() =>
                                  handleSelectRunnerOutcome(
                                    pr,
                                    pr.finalBase,
                                    false,
                                    chip.code
                                  )
                                }
                                className={`px-2 py-1 rounded-lg border text-[10px] font-black cursor-pointer ${
                                  active
                                    ? "bg-indigo-600 text-white border-indigo-600"
                                    : "bg-muted/40 border-border text-foreground"
                                }`}
                              >
                                {chip.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* アウト時のアウト塁＆アウト理由ワンタップ選択 */}
                    {pr.isOut && (
                      <div className="pt-1 space-y-1.5">
                        <div className="flex items-center flex-wrap gap-1">
                          <span className="text-[9px] font-bold text-muted-foreground mr-1">
                            アウト塁:
                          </span>
                          {outCandidateBases.map((ob) => (
                            <button
                              key={ob}
                              type="button"
                              onClick={() =>
                                handleSelectRunnerOutcome(
                                  pr,
                                  ob,
                                  true,
                                  pr.effectiveMethod
                                )
                              }
                              className={`px-2 py-0.5 rounded-lg border text-[10px] font-black cursor-pointer ${
                                pr.finalBase === ob
                                  ? "bg-destructive text-white border-destructive"
                                  : "bg-muted/40 border-border text-foreground"
                              }`}
                            >
                              {formatBaseJa(ob)}でアウト
                            </button>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {IN_PLAY_OUT_REASON_CHIPS.map((chip) => (
                            <button
                              key={chip.code}
                              type="button"
                              onClick={() =>
                                handleSelectRunnerOutcome(
                                  pr,
                                  pr.finalBase,
                                  true,
                                  chip.code
                                )
                              }
                              className={`px-2 py-1 rounded-lg border text-[10px] font-black cursor-pointer ${
                                pr.effectiveMethod === chip.code
                                  ? "bg-destructive text-white border-destructive"
                                  : "bg-muted/40 border-border text-foreground"
                              }`}
                            >
                              {chip.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* この走者の投球間イベント（盗塁・暴投・牽制死等）をワンタップ追加するサブトグル */}
                {!pr.isOutPrePlay && inPlayBase && inPlayBase !== "HP" && (
                  <div className="pt-0.5 border-t border-border/60">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenPrePlayForBase((prev) =>
                          prev === pr.startBase ? null : pr.startBase
                        )
                      }
                      className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>
                        ＋ この走者の盗塁・暴投・捕逸・ボーク・牽制死を記録
                      </span>
                      {openPrePlayForBase === pr.startBase ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>

                    {openPrePlayForBase === pr.startBase && (
                      <div className="grid grid-cols-3 gap-1 pt-1.5">
                        {(() => {
                          const nextB: OccupiedBaseKey | "HP" =
                            inPlayBase === "1B"
                              ? "2B"
                              : inPlayBase === "2B"
                              ? "3B"
                              : "HP";
                          const items: Array<{
                            label: string;
                            to: OccupiedBaseKey | "HP";
                            method: AdvanceMethodCode;
                            isOut: boolean;
                          }> = [
                            {
                              label: `盗塁 (→${formatBaseJa(nextB)})`,
                              to: nextB,
                              method: "steal",
                              isOut: false,
                            },
                            {
                              label: `盗塁死 (${formatBaseJa(nextB)})`,
                              to: nextB,
                              method: "caught_stealing",
                              isOut: true,
                            },
                            {
                              label: `牽制死 (${formatBaseJa(inPlayBase)})`,
                              to: inPlayBase,
                              method: "pickoff_out",
                              isOut: true,
                            },
                            {
                              label: `暴投WP (→${formatBaseJa(nextB)})`,
                              to: nextB,
                              method: "wp",
                              isOut: false,
                            },
                            {
                              label: `捕逸PB (→${formatBaseJa(nextB)})`,
                              to: nextB,
                              method: "pb",
                              isOut: false,
                            },
                            {
                              label: `ボーク (→${formatBaseJa(nextB)})`,
                              to: nextB,
                              method: "balk",
                              isOut: false,
                            },
                          ];
                          return items.map((ev) => (
                            <button
                              key={ev.label}
                              type="button"
                              onClick={() =>
                                handleAddPrePlayEventForRunner(
                                  pr,
                                  ev.to,
                                  ev.method,
                                  ev.isOut
                                )
                              }
                              className={`py-1.5 px-1 rounded-lg border text-[10px] font-black cursor-pointer ${
                                ev.isOut
                                  ? "bg-destructive/10 border-destructive/30 text-destructive"
                                  : "bg-sky-500/10 border-sky-500/30 text-sky-800 dark:text-sky-200"
                              }`}
                            >
                              {ev.label}
                            </button>
                          ));
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-2.5 rounded-xl bg-card border border-border text-[11px] font-bold text-muted-foreground">
          打席開始時は「走者なし」です（前の打席が出塁すると自動でここに走者が表示されます。タイブレークや手動進塁は下のボタンから追加できます）
        </div>
      )}

      {/* 3. 打者走者が出塁する結果（単打・二塁打・三塁打・四球・失策・野選等）の送球間進塁・走塁死指定 */}
      {batterSummary?.initialBase && batterSummary.initialBase !== "HP" && (
        <div className="p-2.5 rounded-xl bg-card border border-border space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-black text-foreground">
              打者走者（{atBat.battingOrder}番 {atBat.batterName || "打者"}）の到達塁:
            </span>
            <span className="text-[10px] font-bold text-muted-foreground">
              基本: {formatBaseJa(batterSummary.initialBase)}出塁
            </span>
          </div>

          <div className="flex flex-wrap gap-1">
            {(() => {
              const initB = batterSummary.initialBase;
              const opts: Array<{
                label: string;
                to: OccupiedBaseKey | "HP" | null;
                isOut: boolean;
                method: AdvanceMethodCode;
              }> = [
                {
                  label: `${formatBaseJa(initB)}止まり`,
                  to: null,
                  isOut: false,
                  method: "hit",
                },
              ];
              if (initB === "1B") {
                opts.push(
                  {
                    label: "+送球間で2塁",
                    to: "2B",
                    isOut: false,
                    method: "throw_advance",
                  },
                  {
                    label: "+失策で2塁",
                    to: "2B",
                    isOut: false,
                    method: "error",
                  },
                  {
                    label: "+3塁まで進塁",
                    to: "3B",
                    isOut: false,
                    method: "error",
                  },
                  {
                    label: "+本塁生還",
                    to: "HP",
                    isOut: false,
                    method: "error",
                  },
                  {
                    label: "2塁走塁死アウト",
                    to: "2B",
                    isOut: true,
                    method: "out_on_base",
                  }
                );
              } else if (initB === "2B") {
                opts.push(
                  {
                    label: "+送球間で3塁",
                    to: "3B",
                    isOut: false,
                    method: "throw_advance",
                  },
                  {
                    label: "+失策で3塁",
                    to: "3B",
                    isOut: false,
                    method: "error",
                  },
                  {
                    label: "+本塁生還",
                    to: "HP",
                    isOut: false,
                    method: "error",
                  },
                  {
                    label: "3塁走塁死アウト",
                    to: "3B",
                    isOut: true,
                    method: "out_on_base",
                  }
                );
              } else if (initB === "3B") {
                opts.push(
                  {
                    label: "+悪送球で本塁生還",
                    to: "HP",
                    isOut: false,
                    method: "error",
                  },
                  {
                    label: "本塁憤死アウト",
                    to: "HP",
                    isOut: true,
                    method: "out_on_base",
                  }
                );
              }

              return opts.map((o) => {
                const isSelected =
                  o.to === null
                    ? !batterSummary.extraExplicitMove
                    : Boolean(
                        batterSummary.extraExplicitMove &&
                          batterSummary.extraExplicitMove.to === o.to &&
                          batterSummary.extraExplicitMove.isOut === o.isOut &&
                          (o.to !== "2B" && o.to !== "3B"
                            ? true
                            : batterSummary.extraExplicitMove.method === o.method)
                      );
                return (
                  <button
                    key={o.label}
                    type="button"
                    onClick={() =>
                      handleSetBatterExtraAdvance(o.to, o.isOut, o.method)
                    }
                    className={`px-2 py-1.5 rounded-xl border text-[10px] font-black cursor-pointer ${
                      isSelected
                        ? o.isOut
                          ? "bg-destructive text-white border-destructive"
                          : o.to === null
                          ? "bg-slate-700 text-white border-slate-700"
                          : "bg-indigo-600 text-white border-indigo-600"
                        : "bg-muted/40 border-border text-foreground"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* 4. いつでも使える手動追加ボタン ＆ 個別明細リスト */}
      <div className="pt-1 border-t border-amber-500/25 space-y-2">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={handleManualAddInPlayAdvance}
            className="h-9 px-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>インプレー進塁を追加</span>
          </button>

          <button
            type="button"
            onClick={() => setShowOtherEventPresets((prev) => !prev)}
            className="h-9 px-2.5 rounded-xl bg-card border border-border hover:bg-muted text-foreground text-[11px] font-black flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>盗塁・暴投・他を追加</span>
            {showOtherEventPresets ? (
              <ChevronUp className="w-3 h-3 shrink-0" />
            ) : (
              <ChevronDown className="w-3 h-3 shrink-0" />
            )}
          </button>
        </div>

        {showOtherEventPresets && (
          <div className="grid grid-cols-3 gap-1 p-2 rounded-xl bg-card border border-border">
            {QUICK_EVENT_PRESETS.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => handleAddQuickPresetAdvance(q)}
                className={`py-1.5 px-1 rounded-lg border text-[10px] font-black active:scale-95 cursor-pointer ${
                  q.isOut
                    ? "bg-destructive/10 text-destructive border-destructive/25"
                    : q.to === "HP"
                    ? "bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/30"
                    : "bg-muted/40 text-foreground border-border"
                }`}
              >
                {q.label}
              </button>
            ))}
          </div>
        )}

        {/* 登録済み進塁明細行（2段構成でスマホでも文字切れゼロ＆セーフ/アウト明示切替対応） */}
        {visibleExplicitAdvances.length > 0 && (
          <div className="space-y-1.5 pt-0.5">
            <span className="text-[10px] font-black text-muted-foreground block">
              登録済みの進塁・走塁記録（{visibleExplicitAdvances.length}件・直接編集可）:
            </span>
            {visibleExplicitAdvances.map((adv) => {
              const matchedBatter = batters.find(
                (b) => b.name && b.name === adv.runnerName
              );
              const selectValue = matchedBatter ? matchedBatter.name : "__custom__";

              return (
                <div
                  key={adv.id}
                  className="p-2 rounded-xl bg-card border border-border space-y-1.5"
                >
                  {/* 1段目: 走者選択（打順メンバーからワンタップ選択可）＋ セーフ/アウト切替 ＋ 削除 */}
                  <div className="flex items-center gap-1.5">
                    {batters.length > 0 ? (
                      <select
                        value={selectValue}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "__custom__") return;
                          handleUpdateExplicitAdvanceRow(adv.id, (cur) => ({
                            ...cur,
                            runnerName: val,
                          }));
                        }}
                        aria-label="走者を選択"
                        className="h-8 px-1.5 rounded-lg bg-muted/50 border border-border text-[11px] font-black text-foreground min-w-0 flex-1"
                      >
                        <option value="__custom__">
                          {adv.runnerName
                            ? `走者: ${adv.runnerName}`
                            : "走者を選択..."}
                        </option>
                        {batters.map((b) => (
                          <option
                            key={`runner-opt-${b.battingOrder}`}
                            value={b.name}
                          >
                            {b.battingOrder}番: {b.name || `#${b.uniformNumber}`}
                          </option>
                        ))}
                      </select>
                    ) : null}

                    {(batters.length === 0 || selectValue === "__custom__") && (
                      <input
                        type="text"
                        value={adv.runnerName}
                        onChange={(e) =>
                          handleUpdateExplicitAdvanceRow(adv.id, (cur) => ({
                            ...cur,
                            runnerName: e.target.value,
                          }))
                        }
                        placeholder="走者名"
                        className="h-8 px-2 rounded-lg bg-muted/50 border border-border text-[11px] font-black text-foreground w-24 shrink-0"
                      />
                    )}

                    {/* セーフ / アウト 明示トグルボタン */}
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateExplicitAdvanceRow(adv.id, (cur) => ({
                          ...cur,
                          isOut: !cur.isOut,
                        }))
                      }
                      className={`h-8 px-2.5 rounded-lg border text-[10px] font-black shrink-0 cursor-pointer ${
                        adv.isOut
                          ? "bg-destructive text-white border-destructive"
                          : "bg-emerald-600 text-white border-emerald-600"
                      }`}
                    >
                      {adv.isOut ? "アウト" : "セーフ"}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteExplicitAdvanceRow(adv.id)}
                      className="h-8 w-8 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center shrink-0 cursor-pointer"
                      aria-label="進塁行を削除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* 2段目: 元塁 ➔ 先塁 ＋ 進塁理由 */}
                  <div className="grid grid-cols-12 gap-1 items-center">
                    <select
                      value={adv.from}
                      onChange={(e) =>
                        handleUpdateExplicitAdvanceRow(adv.id, (cur) => ({
                          ...cur,
                          from: e.target.value as "BAT" | "1B" | "2B" | "3B",
                        }))
                      }
                      aria-label="進塁元の塁"
                      className="col-span-3 h-8 px-1 rounded-lg bg-muted/50 border border-border text-[11px] font-black text-foreground"
                    >
                      <option value="3B">3塁から</option>
                      <option value="2B">2塁から</option>
                      <option value="1B">1塁から</option>
                      <option value="BAT">打者走者</option>
                    </select>

                    <select
                      value={adv.to}
                      onChange={(e) =>
                        handleUpdateExplicitAdvanceRow(adv.id, (cur) => ({
                          ...cur,
                          to: e.target.value as "1B" | "2B" | "3B" | "HP",
                        }))
                      }
                      aria-label="進塁先の塁"
                      className="col-span-3 h-8 px-1 rounded-lg bg-muted/50 border border-border text-[11px] font-black text-foreground"
                    >
                      <option value="HP">→本塁</option>
                      <option value="3B">→3塁</option>
                      <option value="2B">→2塁</option>
                      <option value="1B">→1塁</option>
                    </select>

                    <select
                      value={adv.method}
                      onChange={(e) => {
                        const m = e.target.value as AdvanceMethodCode;
                        const forceOutMethod =
                          m === "caught_stealing" ||
                          m === "pickoff_out" ||
                          m === "interference_out" ||
                          m === "appeal_out" ||
                          m === "out_on_base";
                        const forceSafeMethod =
                          m === "steal" ||
                          m === "walk" ||
                          m === "wp" ||
                          m === "pb" ||
                          m === "balk" ||
                          m === "pickoff_error" ||
                          m === "obstruction" ||
                          m === "tiebreak";
                        handleUpdateExplicitAdvanceRow(adv.id, (cur) => ({
                          ...cur,
                          method: m,
                          isOut: forceOutMethod
                            ? true
                            : forceSafeMethod
                            ? false
                            : cur.isOut,
                        }));
                      }}
                      aria-label="進塁・アウト理由"
                      className="col-span-6 h-8 px-1.5 rounded-lg bg-muted/50 border border-border text-[11px] font-black text-foreground"
                    >
                      {(
                        Object.keys(ADVANCE_METHOD_LABELS) as AdvanceMethodCode[]
                      ).map((k) => (
                        <option key={k} value={k}>
                          {ADVANCE_METHOD_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
