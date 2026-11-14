// filepath: src/app/liff/tools/news-generator/_components/InningLogTimelineCard.tsx
"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  ListOrdered,
  Edit3,
  Trash2,
  Zap,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatSinglePlayEntryLine,
  getHalfInningRuns,
  isMyTeamBattingHalf,
  normalizeRunnersList,
} from "@/lib/liff/live-report-v2";
import type {
  LiveReportBaseNum,
  LiveReportHalfInning,
  LiveReportPlayEntry,
  LiveReportV2Document,
} from "@/types/live-report-v2";

interface InningLogTimelineCardProps {
  doc: LiveReportV2Document;
  onChangeDoc: (
    updater: (prev: LiveReportV2Document) => LiveReportV2Document
  ) => void;
  activeContextKey: string;
  onStartRecording?: () => void;
  readOnly?: boolean;
  onSelectHalfForView?: (inning: number, isBottom: boolean) => void;
}

interface EditingEntryTarget {
  inning: number;
  isBottom: boolean;
  entry: LiveReportPlayEntry;
}

export function InningLogTimelineCard({
  doc,
  onChangeDoc,
  activeContextKey,
  onStartRecording,
  readOnly = false,
  onSelectHalfForView,
}: InningLogTimelineCardProps) {
  const [mounted, setMounted] = useState(false);
  const [editingTarget, setEditingTarget] = useState<EditingEntryTarget | null>(
    null
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  // SKILL.md 規約5: 対象試合切替・閲覧モード切替時にモーダルを安全にリセット
  useEffect(() => {
    setEditingTarget(null);
  }, [activeContextKey, readOnly]);

  const sortedHalves: LiveReportHalfInning[] = [...doc.halfInnings]
    .filter((h) => h.entries.length > 0 || h.manualRunsOverride !== null)
    .sort((a, b) => {
      if (a.inning !== b.inning) return a.inning - b.inning;
      if (a.isBottom === b.isBottom) return 0;
      return a.isBottom ? 1 : -1;
    });

  const totalEntriesCount = sortedHalves.reduce(
    (sum, h) => sum + h.entries.length,
    0
  );

  if (sortedHalves.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-slate-500 px-3.5 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <ListOrdered className="w-4 h-4 text-sky-400 shrink-0" />
            <h2 className="text-xs font-black text-white truncate">
              記録済みイニング経過
            </h2>
          </div>
          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-black font-mono shrink-0">
            0件
          </span>
        </div>
        <div className="p-6 text-center space-y-3">
          <p className="text-xs font-black text-foreground">
            まだ打席・イニング経過の記録がありません
          </p>
          <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
            {readOnly
              ? "速報担当者が打席結果を入力すると、ここにイニングごとの経過一覧が自動で反映されます。"
              : "「入力・速報」タブの下部キーパッドから打席結果を確定すると、ここにイニングごとの経過一覧が並び、タップで1行ずつ修正・削除できます。"}
          </p>
          {onStartRecording && (
            <button
              type="button"
              onClick={onStartRecording}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black shadow-2xs active:scale-95 transition-all cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>{readOnly ? "ライブ速報画面へ戻る" : "入力・速報パッドを開く"}</span>
            </button>
          )}
        </div>
      </section>
    );
  }

  const handleSaveEntryEdit = () => {
    if (readOnly || !editingTarget) return;
    const { inning, isBottom, entry } = editingTarget;
    onChangeDoc((prev) => ({
      ...prev,
      halfInnings: prev.halfInnings.map((h) => {
        if (h.inning !== inning || h.isBottom !== isBottom) return h;
        return {
          ...h,
          entries: h.entries.map((e) => (e.id === entry.id ? entry : e)),
        };
      }),
    }));
    setEditingTarget(null);
  };

  const handleDeleteEntry = (
    inning: number,
    isBottom: boolean,
    entryId: string
  ) => {
    if (readOnly) return;
    onChangeDoc((prev) => ({
      ...prev,
      halfInnings: prev.halfInnings
        .map((h) => {
          if (h.inning !== inning || h.isBottom !== isBottom) return h;
          return {
            ...h,
            entries: h.entries.filter((e) => e.id !== entryId),
          };
        })
        .filter((h) => h.entries.length > 0 || h.manualRunsOverride !== null),
    }));
    setEditingTarget(null);
  };

  let runningFirst = 0;
  let runningSecond = 0;

  return (
    <>
      <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-slate-500 px-3.5 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <ListOrdered className="w-4 h-4 text-sky-400 shrink-0" />
            <h2 className="text-xs font-black text-white truncate">
              {readOnly
                ? "記録済みイニング経過（閲覧モード）"
                : "記録済みイニング経過（行タップで修正・削除）"}
            </h2>
          </div>
          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 text-[10px] font-black font-mono shrink-0">
            {totalEntriesCount}件
          </span>
        </div>

        <div className="divide-y divide-border">
          {sortedHalves.map((half) => {
            const runs = getHalfInningRuns(half);
            if (!half.isBottom) runningFirst += runs;
            else runningSecond += runs;

            const isMyAttack = isMyTeamBattingHalf(
              doc.battingOrder,
              half.isBottom
            );
            const isActiveHalf =
              doc.activeInning === half.inning &&
              doc.activeIsBottom === half.isBottom;

            return (
              <div
                key={`${half.inning}-${half.isBottom ? "b" : "t"}`}
                className={cn(
                  "p-3 space-y-2",
                  isActiveHalf && "bg-primary/[0.04]"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (readOnly) {
                        onSelectHalfForView?.(half.inning, half.isBottom);
                        return;
                      }
                      onChangeDoc((p) => ({
                        ...p,
                        activeInning: half.inning,
                        activeIsBottom: half.isBottom,
                      }));
                    }}
                    className="inline-flex items-center gap-1.5 text-left cursor-pointer"
                  >
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-md text-[11px] font-black",
                        isActiveHalf
                          ? "bg-primary text-primary-foreground"
                          : "bg-slate-900 text-white"
                      )}
                    >
                      {half.inning}回{half.isBottom ? "裏" : "表"}
                    </span>
                    <span className="text-[10.5px] font-bold text-muted-foreground">
                      {isMyAttack ? "自チーム攻撃" : "相手攻撃"}
                    </span>
                  </button>

                  {/* イニング得点の確認・手動補正（閲覧モード時は参照のみ） */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10.5px] font-black text-muted-foreground">
                      得点
                    </span>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() =>
                          onChangeDoc((p) => ({
                            ...p,
                            halfInnings: p.halfInnings.map((h) =>
                              h.inning === half.inning &&
                              h.isBottom === half.isBottom
                                ? {
                                    ...h,
                                    manualRunsOverride: Math.max(0, runs - 1),
                                  }
                                : h
                            ),
                          }))
                        }
                        className="w-5 h-5 rounded bg-muted border border-border text-[10px] font-black cursor-pointer"
                      >
                        -
                      </button>
                    )}
                    <span className="font-mono text-xs font-black text-foreground min-w-[16px] text-center">
                      {runs}
                    </span>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() =>
                          onChangeDoc((p) => ({
                            ...p,
                            halfInnings: p.halfInnings.map((h) =>
                              h.inning === half.inning &&
                              h.isBottom === half.isBottom
                                ? { ...h, manualRunsOverride: runs + 1 }
                                : h
                            ),
                          }))
                        }
                        className="w-5 h-5 rounded bg-muted border border-border text-[10px] font-black cursor-pointer"
                      >
                        +
                      </button>
                    )}
                    <span className="ml-1 px-1.5 py-0.5 rounded bg-muted font-mono text-[10.5px] font-black text-foreground">
                      {runningFirst}-{runningSecond}
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  {half.entries.map((entry) => {
                    const line = formatSinglePlayEntryLine(
                      entry,
                      isMyAttack,
                      doc.showSurnameOnly
                    );
                    if (readOnly) {
                      return (
                        <div
                          key={entry.id}
                          className="w-full text-left px-2.5 py-1.5 rounded-lg border border-border/70 bg-card flex items-center justify-between gap-2"
                        >
                          <span className="text-xs font-bold text-foreground break-all">
                            {line}
                          </span>
                        </div>
                      );
                    }
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() =>
                          setEditingTarget({
                            inning: half.inning,
                            isBottom: half.isBottom,
                            entry: {
                              ...entry,
                              runnersAfter: [...entry.runnersAfter],
                              chainedPlays: [...entry.chainedPlays],
                            },
                          })
                        }
                        className="w-full text-left px-2.5 py-1.5 rounded-lg border border-border/70 bg-card hover:bg-muted/60 flex items-center justify-between gap-2 transition-colors cursor-pointer group"
                      >
                        <span className="text-xs font-bold text-foreground break-all">
                          {line}
                        </span>
                        <Edit3 className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 個別行編集・削除モーダル（createPortal + z-[9999]） */}
      {mounted &&
        !readOnly &&
        editingTarget &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            onClick={() => setEditingTarget(null)}
          >
            <div
              className="w-full sm:max-w-md max-h-[88dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between shrink-0">
                <h3 className="text-sm font-black text-white">
                  記録行の編集・削除（{editingTarget.inning}回
                  {editingTarget.isBottom ? "裏" : "表"}）
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingTarget(null)}
                  className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto space-y-3 flex-1">
                {editingTarget.entry.entryType !== "batter" ? (
                  <div className="space-y-1">
                    <label className="block text-xs font-black text-muted-foreground">
                      イベント・交代テキスト
                    </label>
                    <input
                      type="text"
                      value={editingTarget.entry.eventText}
                      onChange={(e) =>
                        setEditingTarget((prev) =>
                          prev
                            ? {
                                ...prev,
                                entry: {
                                  ...prev.entry,
                                  eventText: e.target.value,
                                },
                              }
                            : null
                        )
                      }
                      className="w-full h-10 rounded-xl border border-border bg-card px-3 text-base sm:text-xs font-black text-foreground outline-none focus:border-primary"
                    />
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <label className="block text-[11px] font-black text-muted-foreground">
                          打順
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={editingTarget.entry.battingOrder}
                          onChange={(e) =>
                            setEditingTarget((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    entry: {
                                      ...prev.entry,
                                      battingOrder: Number(e.target.value) || 1,
                                    },
                                  }
                                : null
                            )
                          }
                          className="w-full h-9 rounded-xl border border-border bg-card px-2.5 text-base sm:text-xs font-black text-foreground outline-none focus:border-primary"
                        />
                      </div>

                      <div className="col-span-2 space-y-1">
                        <label className="block text-[11px] font-black text-muted-foreground">
                          打者名（自チーム攻撃時のみ出力）
                        </label>
                        <input
                          type="text"
                          value={editingTarget.entry.batterName}
                          onChange={(e) =>
                            setEditingTarget((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    entry: {
                                      ...prev.entry,
                                      batterName: e.target.value,
                                    },
                                  }
                                : null
                            )
                          }
                          placeholder="選手名"
                          className="w-full h-9 rounded-xl border border-border bg-card px-3 text-base sm:text-xs font-black text-foreground outline-none focus:border-primary"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] font-black text-muted-foreground">
                        プレー結果テキスト
                      </label>
                      <input
                        type="text"
                        value={editingTarget.entry.playText}
                        onChange={(e) =>
                          setEditingTarget((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  entry: {
                                    ...prev.entry,
                                    playText: e.target.value,
                                  },
                                }
                              : null
                          )
                        }
                        className="w-full h-9 rounded-xl border border-border bg-card px-3 text-xs font-black text-foreground outline-none focus:border-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] font-black text-muted-foreground">
                        一言リアクション・好守備
                      </label>
                      <input
                        type="text"
                        value={editingTarget.entry.reactionText}
                        onChange={(e) =>
                          setEditingTarget((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  entry: {
                                    ...prev.entry,
                                    reactionText: e.target.value,
                                  },
                                }
                              : null
                          )
                        }
                        placeholder="例: 赤羽ナイスキャッチ❗️ / 惜しい❗️"
                        className="w-full h-9 rounded-xl border border-border bg-card px-3 text-xs font-black text-foreground outline-none focus:border-primary"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] font-black text-muted-foreground">
                          アウト:
                        </span>
                        {[0, 1, 2, 3].map((o) => (
                          <button
                            key={o}
                            type="button"
                            onClick={() =>
                              setEditingTarget((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      entry: {
                                        ...prev.entry,
                                        outsAfter: o,
                                        runnersAfter:
                                          o >= 3 ? [] : prev.entry.runnersAfter,
                                      },
                                    }
                                  : null
                              )
                            }
                            className={cn(
                              "w-7 h-7 rounded-lg border text-xs font-black cursor-pointer",
                              editingTarget.entry.outsAfter === o
                                ? "bg-slate-900 text-white border-slate-900"
                                : "bg-card text-foreground border-border"
                            )}
                          >
                            {o}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="text-[11px] font-black text-muted-foreground">
                          残塁:
                        </span>
                        {([1, 2, 3] as const).map((b) => {
                          const onB = editingTarget.entry.runnersAfter.includes(b);
                          return (
                            <button
                              key={b}
                              type="button"
                              disabled={editingTarget.entry.outsAfter >= 3}
                              onClick={() =>
                                setEditingTarget((prev) => {
                                  if (!prev) return null;
                                  const nextR: LiveReportBaseNum[] = onB
                                    ? prev.entry.runnersAfter.filter(
                                        (x) => x !== b
                                      )
                                    : normalizeRunnersList([
                                        ...prev.entry.runnersAfter,
                                        b,
                                      ]);
                                  return {
                                    ...prev,
                                    entry: {
                                      ...prev.entry,
                                      runnersAfter: nextR,
                                    },
                                  };
                                })
                              }
                              className={cn(
                                "px-2 h-7 rounded-lg border text-[11px] font-black cursor-pointer disabled:opacity-40",
                                onB
                                  ? "bg-amber-400 text-slate-950 border-amber-500"
                                  : "bg-card text-foreground border-border"
                              )}
                            >
                              {b}塁
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="text-[11px] font-black text-muted-foreground">
                          得点:
                        </span>
                        {[0, 1, 2, 3, 4].map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() =>
                              setEditingTarget((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      entry: { ...prev.entry, runsScored: r },
                                    }
                                  : null
                              )
                            }
                            className={cn(
                              "w-6 h-7 rounded-lg border text-xs font-black cursor-pointer",
                              editingTarget.entry.runsScored === r
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-card text-foreground border-border"
                            )}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>

                    {editingTarget.entry.chainedPlays.length > 0 && (
                      <div className="rounded-xl border border-border bg-muted/40 p-2.5 flex items-center justify-between">
                        <span className="text-[11px] font-bold text-foreground">
                          連結走塁プレー（
                          {editingTarget.entry.chainedPlays
                            .map((c) => c.playText)
                            .join("・")}
                          ）
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setEditingTarget((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    entry: { ...prev.entry, chainedPlays: [] },
                                  }
                                : null
                            )
                          }
                          className="text-[10.5px] font-black text-rose-600 cursor-pointer"
                        >
                          連結を解除
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="border-t border-border bg-muted/40 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 flex items-center justify-between gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    handleDeleteEntry(
                      editingTarget.inning,
                      editingTarget.isBottom,
                      editingTarget.entry.id
                    )
                  }
                  className="inline-flex items-center gap-1 px-3 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>この行を削除</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingTarget(null)}
                    className="px-4 py-2.5 rounded-xl border border-border bg-card text-xs font-black text-foreground cursor-pointer"
                  >
                    閉じる
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEntryEdit}
                    className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black cursor-pointer active:scale-95"
                  >
                    保存
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

