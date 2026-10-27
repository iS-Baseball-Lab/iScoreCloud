// filepath: src/app/liff/tools/scorebook-import/_components/Step2StructureCheck.tsx
"use client";

import React, { useState } from "react";
import {
  Users,
  Plus,
  Trash2,
  Sparkles,
  ChevronLeft,
  Loader2,
  Columns2,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import type {
  ImportScopeMode,
  ScorebookBatterSlot,
  ScorebookInningMeta,
  ScorebookPitcherStint,
  ScorebookRosterPlayer,
  ScorebookSheetStructure,
  ScorebookSubstitution,
} from "@/types/scorebook-v2";

interface Step2StructureCheckProps {
  importScope: ImportScopeMode;
  roster: ScorebookRosterPlayer[];
  opponentName: string;
  topStructure: ScorebookSheetStructure | null;
  bottomStructure: ScorebookSheetStructure | null;
  onChangeStructure: (isTop: boolean, updated: ScorebookSheetStructure) => void;
  onBack: () => void;
  onStartDeepAnalysis: () => void;
  isAnalyzingInnings: boolean;
  analysisProgressLabel: string;
}

const POSITION_OPTIONS = [
  { value: "", label: "-" },
  { value: "1", label: "1 投" },
  { value: "2", label: "2 捕" },
  { value: "3", label: "3 一" },
  { value: "4", label: "4 二" },
  { value: "5", label: "5 三" },
  { value: "6", label: "6 遊" },
  { value: "7", label: "7 左" },
  { value: "8", label: "8 中" },
  { value: "9", label: "9 右" },
  { value: "D", label: "DH" },
];

export function Step2StructureCheck({
  importScope,
  roster,
  opponentName,
  topStructure,
  bottomStructure,
  onChangeStructure,
  onBack,
  onStartDeepAnalysis,
  isAnalyzingInnings,
  analysisProgressLabel,
}: Step2StructureCheckProps) {
  const [activeSide, setActiveSide] = useState<"top" | "bottom">(
    importScope === "bottom_only" ? "bottom" : "top"
  );

  const isTop = activeSide === "top";
  const current = isTop ? topStructure : bottomStructure;

  if (!current) {
    return null;
  }

  const updateInningMeta = (
    inningNum: number,
    patch: Partial<ScorebookInningMeta>
  ) => {
    const nextInnings = current.innings.map((m) =>
      m.inning === inningNum ? { ...m, ...patch } : m
    );
    const totalRuns = nextInnings.reduce((s, m) => s + m.runs, 0);
    onChangeStructure(isTop, {
      ...current,
      innings: nextInnings,
      totalRuns,
    });
  };

  const handleAddInning = () => {
    const nextNum =
      current.innings.length > 0
        ? current.innings[current.innings.length - 1].inning + 1
        : 1;
    const nextInnings = [
      ...current.innings,
      { inning: nextNum, columnCount: 1, runs: 0, hits: 0 },
    ];
    onChangeStructure(isTop, { ...current, innings: nextInnings });
  };

  const handleRemoveLastInning = () => {
    if (current.innings.length <= 1) return;
    const nextInnings = current.innings.slice(0, -1);
    const totalRuns = nextInnings.reduce((s, m) => s + m.runs, 0);
    onChangeStructure(isTop, {
      ...current,
      innings: nextInnings,
      totalRuns,
    });
  };

  const updateBatter = (
    order: number,
    patch: Partial<ScorebookBatterSlot>
  ) => {
    const nextBatters = current.batters.map((b) =>
      b.battingOrder === order ? { ...b, ...patch } : b
    );
    onChangeStructure(isTop, { ...current, batters: nextBatters });
  };

  const handleSelectRosterForBatter = (order: number, playerId: string) => {
    if (!playerId) {
      updateBatter(order, { playerId: null });
      return;
    }
    const found = roster.find((p) => p.id === playerId);
    if (found) {
      updateBatter(order, {
        playerId: found.id,
        name: found.name,
        uniformNumber: found.uniformNumber,
      });
    }
  };

  const handleAddBatterSlot = () => {
    const nextOrder = current.batters.length + 1;
    onChangeStructure(isTop, {
      ...current,
      batters: [
        ...current.batters,
        {
          battingOrder: nextOrder,
          name: "",
          uniformNumber: "",
          position: "",
          playerId: null,
          substitutions: [],
        },
      ],
    });
  };

  const handleAddSubstitution = (order: number) => {
    const sub: ScorebookSubstitution = {
      id: crypto.randomUUID(),
      inningEntered: 4,
      subType: "PH",
      name: "",
      uniformNumber: "",
      position: "",
      playerId: null,
    };
    const slot = current.batters.find((b) => b.battingOrder === order);
    if (!slot) return;
    updateBatter(order, { substitutions: [...slot.substitutions, sub] });
  };

  const updateSubstitution = (
    order: number,
    subId: string,
    patch: Partial<ScorebookSubstitution>
  ) => {
    const slot = current.batters.find((b) => b.battingOrder === order);
    if (!slot) return;
    const nextSubs = slot.substitutions.map((s) =>
      s.id === subId ? { ...s, ...patch } : s
    );
    updateBatter(order, { substitutions: nextSubs });
  };

  const removeSubstitution = (order: number, subId: string) => {
    const slot = current.batters.find((b) => b.battingOrder === order);
    if (!slot) return;
    updateBatter(order, {
      substitutions: slot.substitutions.filter((s) => s.id !== subId),
    });
  };

  const updatePitcher = (
    id: string,
    patch: Partial<ScorebookPitcherStint>
  ) => {
    const nextPitchers = current.pitchers.map((p) =>
      p.id === id ? { ...p, ...patch } : p
    );
    onChangeStructure(isTop, { ...current, pitchers: nextPitchers });
  };

  const addPitcher = () => {
    const maxInn =
      current.innings[current.innings.length - 1]?.inning || 7;
    const prevLast = current.pitchers[current.pitchers.length - 1];
    onChangeStructure(isTop, {
      ...current,
      pitchers: [
        ...current.pitchers,
        {
          id: crypto.randomUUID(),
          order: current.pitchers.length + 1,
          name: "",
          uniformNumber: "",
          playerId: null,
          fromInning: prevLast ? Math.min(maxInn, prevLast.toInning + 1) : 1,
          toInning: maxInn,
        },
      ],
    });
  };

  const removePitcher = (id: string) => {
    if (current.pitchers.length <= 1) return;
    onChangeStructure(isTop, {
      ...current,
      pitchers: current.pitchers.filter((p) => p.id !== id),
    });
  };

  return (
    <div className="space-y-4">
      {/* ガイドバナー */}
      <section className="rounded-3xl bg-card border border-indigo-500/35 shadow-xs p-4 space-y-1.5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <h2 className="text-xs font-black text-foreground">
            10秒骨格チェック（列ズレ・名寄せミスをゼロにします）
          </h2>
        </div>
        <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
          ここで確定した「各回の得点」「打者一巡(2列)の有無」「打順・途中交代・投手」を絶対正解の制約として、次のステップで全投球・全打席を精密解析します。
        </p>
      </section>

      {/* 先攻 / 後攻 シート切替タブ */}
      {importScope === "both" && (
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-muted/70 border border-border/60">
          <button
            type="button"
            onClick={() => setActiveSide("top")}
            className={`py-2.5 px-3 rounded-xl text-xs transition-all cursor-pointer ${
              activeSide === "top"
                ? "bg-card text-foreground font-black shadow-2xs"
                : "text-muted-foreground font-bold"
            }`}
          >
            先攻（表）: {topStructure?.isMyTeamBatting ? "自チーム" : opponentName}
          </button>
          <button
            type="button"
            onClick={() => setActiveSide("bottom")}
            className={`py-2.5 px-3 rounded-xl text-xs transition-all cursor-pointer ${
              activeSide === "bottom"
                ? "bg-card text-foreground font-black shadow-2xs"
                : "text-muted-foreground font-bold"
            }`}
          >
            後攻（裏）: {bottomStructure?.isMyTeamBatting ? "自チーム" : opponentName}
          </button>
        </div>
      )}

      {/* A. イニング別得点 ＆ 打者一巡(2列)設定 */}
      <section className="rounded-3xl bg-card border border-border shadow-xs p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-black text-foreground">
              {isTop ? "先攻（表）" : "後攻（裏）"} イニング別得点・列数
            </h3>
            <p className="text-[10px] font-bold text-muted-foreground">
              打者一巡して2列使ったイニングは「2列(一巡)」をONにしてください
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleRemoveLastInning}
              className="px-2 py-1 rounded-lg bg-muted border border-border text-[10px] font-black text-muted-foreground cursor-pointer"
            >
              -回
            </button>
            <button
              type="button"
              onClick={handleAddInning}
              className="px-2 py-1 rounded-lg bg-primary/12 text-primary text-[10px] font-black cursor-pointer"
            >
              +回
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
          {current.innings.map((inn) => (
            <div
              key={inn.inning}
              className={`p-2 rounded-2xl border text-center space-y-1.5 ${
                inn.columnCount >= 2
                  ? "bg-indigo-500/8 border-indigo-500/40"
                  : "bg-muted/35 border-border"
              }`}
            >
              <span className="text-[10px] font-black text-muted-foreground block">
                {inn.inning}回{isTop ? "表" : "裏"}
              </span>

              <div className="flex items-center justify-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    updateInningMeta(inn.inning, {
                      runs: Math.max(0, inn.runs - 1),
                    })
                  }
                  className="w-6 h-6 rounded-lg bg-card border border-border text-xs font-black text-foreground active:scale-90 cursor-pointer"
                >
                  -
                </button>
                <span className="w-6 text-sm font-black text-foreground">
                  {inn.runs}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    updateInningMeta(inn.inning, { runs: inn.runs + 1 })
                  }
                  className="w-6 h-6 rounded-lg bg-card border border-border text-xs font-black text-foreground active:scale-90 cursor-pointer"
                >
                  +
                </button>
              </div>

              <button
                type="button"
                onClick={() =>
                  updateInningMeta(inn.inning, {
                    columnCount: inn.columnCount >= 2 ? 1 : 2,
                  })
                }
                className={`w-full py-0.5 px-1 rounded-md text-[9px] font-black flex items-center justify-center gap-0.5 cursor-pointer ${
                  inn.columnCount >= 2
                    ? "bg-indigo-600 text-white"
                    : "bg-card text-muted-foreground border border-border/60"
                }`}
              >
                <Columns2 className="w-2.5 h-2.5" />
                <span>{inn.columnCount >= 2 ? "2列(一巡)" : "1列"}</span>
              </button>
            </div>
          ))}

          {/* 合計得点表示 */}
          <div className="p-2 rounded-2xl bg-primary/10 border border-primary/30 flex flex-col items-center justify-center">
            <span className="text-[10px] font-black text-primary">合計得点</span>
            <span className="text-lg font-black text-primary">
              {current.innings.reduce((s, m) => s + m.runs, 0)}
            </span>
          </div>
        </div>
      </section>

      {/* B. 打順（1〜9番＋途中交代）確認 */}
      <section className="rounded-3xl bg-card border border-border shadow-xs p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <div>
              <h3 className="text-sm font-black text-foreground">
                {current.isMyTeamBatting
                  ? "自チームの打順・途中交代"
                  : `相手（${opponentName}）の打順・途中交代`}
              </h3>
              <p className="text-[10px] font-bold text-muted-foreground">
                {current.isMyTeamBatting
                  ? "登録選手と紐付けることで個人成績に正確に集計されます"
                  : "手書き文字の読み間違いがあれば修正してください"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddBatterSlot}
            className="px-2.5 py-1 rounded-xl bg-muted border border-border text-[10px] font-black text-foreground cursor-pointer"
          >
            +10番以降
          </button>
        </div>

        <div className="space-y-2.5">
          {current.batters.map((slot) => (
            <div
              key={slot.battingOrder}
              className="p-2.5 rounded-2xl bg-muted/35 border border-border/80 space-y-2"
            >
              <div className="flex items-center gap-1.5">
                <span className="w-6 h-6 rounded-lg bg-foreground text-background text-[11px] font-black flex items-center justify-center shrink-0">
                  {slot.battingOrder}
                </span>

                {current.isMyTeamBatting && roster.length > 0 ? (
                  <select
                    value={slot.playerId || ""}
                    onChange={(e) =>
                      handleSelectRosterForBatter(
                        slot.battingOrder,
                        e.target.value
                      )
                    }
                    className="flex-1 min-w-0 h-9 px-2 rounded-xl bg-card border border-border text-xs font-black text-foreground"
                  >
                    <option value="">
                      {slot.name
                        ? `未登録: ${slot.name} (#${slot.uniformNumber || "-"})`
                        : "-- 選手を選択 --"}
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
                      value={slot.uniformNumber}
                      onChange={(e) =>
                        updateBatter(slot.battingOrder, {
                          uniformNumber: e.target.value,
                        })
                      }
                      placeholder="#"
                      className="w-11 h-9 px-1.5 rounded-xl bg-card border border-border text-center text-xs font-black text-foreground"
                    />
                    <input
                      type="text"
                      value={slot.name}
                      onChange={(e) =>
                        updateBatter(slot.battingOrder, { name: e.target.value })
                      }
                      placeholder="選手名"
                      className="flex-1 min-w-0 h-9 px-2.5 rounded-xl bg-card border border-border text-xs font-black text-foreground"
                    />
                  </>
                )}

                <select
                  value={slot.position}
                  onChange={(e) =>
                    updateBatter(slot.battingOrder, { position: e.target.value })
                  }
                  className="w-16 h-9 px-1 rounded-xl bg-card border border-border text-[11px] font-black text-foreground shrink-0"
                >
                  {POSITION_OPTIONS.map((pos) => (
                    <option key={pos.value} value={pos.value}>
                      {pos.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => handleAddSubstitution(slot.battingOrder)}
                  className="h-9 px-2 rounded-xl bg-card hover:bg-muted border border-border text-[10px] font-black text-primary flex items-center gap-0.5 shrink-0 cursor-pointer"
                  title="途中交代を追加"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>交代</span>
                </button>
              </div>

              {/* 途中交代（代打・代走・守備交代） */}
              {slot.substitutions.length > 0 && (
                <div className="pl-6 space-y-1.5">
                  {slot.substitutions.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center gap-1.5 p-1.5 rounded-xl bg-amber-500/8 border border-amber-500/25"
                    >
                      <select
                        value={sub.inningEntered}
                        onChange={(e) =>
                          updateSubstitution(slot.battingOrder, sub.id, {
                            inningEntered: Number(e.target.value),
                          })
                        }
                        className="h-8 px-1 rounded-lg bg-card border border-border text-[10px] font-black text-foreground shrink-0"
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>
                            {n}回〜
                          </option>
                        ))}
                      </select>

                      <select
                        value={sub.subType}
                        onChange={(e) =>
                          updateSubstitution(slot.battingOrder, sub.id, {
                            subType: e.target.value as "PH" | "PR" | "DEF",
                          })
                        }
                        className="h-8 px-1 rounded-lg bg-card border border-border text-[10px] font-black text-amber-700 dark:text-amber-300 shrink-0"
                      >
                        <option value="PH">代打</option>
                        <option value="PR">代走</option>
                        <option value="DEF">守備</option>
                      </select>

                      {current.isMyTeamBatting && roster.length > 0 ? (
                        <select
                          value={sub.playerId || ""}
                          onChange={(e) => {
                            const found = roster.find(
                              (p) => p.id === e.target.value
                            );
                            if (found) {
                              updateSubstitution(slot.battingOrder, sub.id, {
                                playerId: found.id,
                                name: found.name,
                                uniformNumber: found.uniformNumber,
                              });
                            } else {
                              updateSubstitution(slot.battingOrder, sub.id, {
                                playerId: null,
                              });
                            }
                          }}
                          className="flex-1 min-w-0 h-8 px-1.5 rounded-lg bg-card border border-border text-[11px] font-black text-foreground"
                        >
                          <option value="">
                            {sub.name ? `未登録: ${sub.name}` : "-- 交代選手 --"}
                          </option>
                          {roster.map((p) => (
                            <option key={p.id} value={p.id}>
                              #{p.uniformNumber} {p.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={sub.name}
                          onChange={(e) =>
                            updateSubstitution(slot.battingOrder, sub.id, {
                              name: e.target.value,
                            })
                          }
                          placeholder="交代選手名"
                          className="flex-1 min-w-0 h-8 px-2 rounded-lg bg-card border border-border text-[11px] font-black text-foreground"
                        />
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          removeSubstitution(slot.battingOrder, sub.id)
                        }
                        className="p-1 text-destructive cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* C. 登板投手（先発・継投）確認 */}
      <section className="rounded-3xl bg-card border border-border shadow-xs p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-foreground">
              {!current.isMyTeamBatting
                ? "自チームの登板投手（継投）"
                : `相手（${opponentName}）の登板投手`}
            </h3>
            <p className="text-[10px] font-bold text-muted-foreground">
              このシートの打者に対して投げたピッチャーと担当回
            </p>
          </div>
          <button
            type="button"
            onClick={addPitcher}
            className="px-2.5 py-1.5 rounded-xl bg-primary/12 text-primary text-[10px] font-black flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>継投追加</span>
          </button>
        </div>

        <div className="space-y-2">
          {current.pitchers.map((pt, idx) => (
            <div
              key={pt.id}
              className="flex items-center gap-1.5 p-2.5 rounded-2xl bg-muted/35 border border-border/80"
            >
              <span className="px-1.5 py-0.5 rounded-md bg-muted text-[10px] font-black text-muted-foreground shrink-0">
                {idx === 0 ? "先発" : `${idx + 1}番手`}
              </span>

              {!current.isMyTeamBatting && roster.length > 0 ? (
                <select
                  value={pt.playerId || ""}
                  onChange={(e) => {
                    const found = roster.find((p) => p.id === e.target.value);
                    if (found) {
                      updatePitcher(pt.id, {
                        playerId: found.id,
                        name: found.name,
                        uniformNumber: found.uniformNumber,
                      });
                    } else {
                      updatePitcher(pt.id, { playerId: null });
                    }
                  }}
                  className="flex-1 min-w-0 h-9 px-2 rounded-xl bg-card border border-border text-xs font-black text-foreground"
                >
                  <option value="">
                    {pt.name ? `未登録: ${pt.name}` : "-- 自チーム投手を選択 --"}
                  </option>
                  {roster.map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.uniformNumber} {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={pt.name}
                  onChange={(e) => updatePitcher(pt.id, { name: e.target.value })}
                  placeholder="相手投手名"
                  className="flex-1 min-w-0 h-9 px-2.5 rounded-xl bg-card border border-border text-xs font-black text-foreground"
                />
              )}

              <div className="flex items-center gap-1 text-[11px] font-black shrink-0">
                <input
                  type="number"
                  min={1}
                  max={15}
                  value={pt.fromInning}
                  onChange={(e) =>
                    updatePitcher(pt.id, {
                      fromInning: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                  className="w-10 h-9 rounded-xl bg-card border border-border text-center text-xs font-black"
                />
                <span>〜</span>
                <input
                  type="number"
                  min={1}
                  max={15}
                  value={pt.toInning}
                  onChange={(e) =>
                    updatePitcher(pt.id, {
                      toInning: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                  className="w-10 h-9 rounded-xl bg-card border border-border text-center text-xs font-black"
                />
                <span className="text-[10px] text-muted-foreground">回</span>
              </div>

              {current.pitchers.length > 1 && (
                <button
                  type="button"
                  onClick={() => removePitcher(pt.id)}
                  className="p-1 text-destructive cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* アクションボタン */}
      <div className="space-y-2.5 pt-1">
        {isAnalyzingInnings && (
          <div className="p-4 rounded-2xl bg-indigo-600/10 border border-indigo-500/35 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-600 dark:text-indigo-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-black text-foreground">
                イニング分割ディープ解析を実行中...
              </p>
              <p className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 truncate">
                {analysisProgressLabel}
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-2.5">
          <button
            type="button"
            disabled={isAnalyzingInnings}
            onClick={onBack}
            className="h-13 px-4 rounded-2xl bg-card border border-border text-xs font-black text-foreground flex items-center gap-1 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>画像選択へ</span>
          </button>

          <button
            type="button"
            disabled={isAnalyzingInnings}
            onClick={onStartDeepAnalysis}
            className="flex-1 h-13 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-black shadow-md flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>全打席・1球順序をディープ解析</span>
          </button>
        </div>
      </div>
    </div>
  );
}

