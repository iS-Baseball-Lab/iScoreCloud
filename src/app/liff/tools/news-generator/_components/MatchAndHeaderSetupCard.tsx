// filepath: src/app/liff/tools/news-generator/_components/MatchAndHeaderSetupCard.tsx
"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Settings2,
  ChevronDown,
  ChevronUp,
  Clock,
  ArrowLeftRight,
  Users,
  UserCheck,
  Plus,
  Trash2,
  X,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  POSITION_OPTIONS,
  deriveScoreboardShortName,
  formatPlayerReportName,
  getCurrentHmText,
  normalizeReportPositionCode,
} from "@/lib/liff/live-report-v2";
import type {
  LiveReportLineupSlot,
  LiveReportRosterPlayer,
  LiveReportV2Document,
} from "@/types/live-report-v2";

interface MatchAndHeaderSetupCardProps {
  doc: LiveReportV2Document;
  onChangeDoc: (updater: (prev: LiveReportV2Document) => LiveReportV2Document) => void;
  rosterPlayers: ReadonlyArray<LiveReportRosterPlayer>;
  suggestedReporters: ReadonlyArray<string>;
  hasSavedMatchLineup: boolean;
  onReloadMatchLineup: () => void;
  activeContextKey: string;
}

export function MatchAndHeaderSetupCard({
  doc,
  onChangeDoc,
  rosterPlayers,
  suggestedReporters,
  hasSavedMatchLineup,
  onReloadMatchLineup,
  activeContextKey,
}: MatchAndHeaderSetupCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLineupModalOpen, setIsLineupModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // SKILL.md 規約5: 対象試合切替時にモーダルを安全にリセット
  useEffect(() => {
    setIsLineupModalOpen(false);
  }, [activeContextKey]);

  const filledLineupCount = doc.lineup.filter(
    (s) => s.playerName.trim().length > 0
  ).length;

  const handleSwapBattingOrder = () => {
    onChangeDoc((prev) => ({
      ...prev,
      battingOrder: prev.battingOrder === "first" ? "second" : "first",
      firstTeamShortName: prev.secondTeamShortName,
      secondTeamShortName: prev.firstTeamShortName,
    }));
  };

  const handleOpponentChange = (nextOpponent: string) => {
    onChangeDoc((prev) => {
      const prevAutoShort = prev.opponentName
        ? deriveScoreboardShortName(prev.opponentName)
        : "相　手";
      const nextShort = nextOpponent.trim()
        ? deriveScoreboardShortName(nextOpponent)
        : "相　手";

      const isMyFirst = prev.battingOrder === "first";
      const currentOppShort = isMyFirst
        ? prev.secondTeamShortName
        : prev.firstTeamShortName;
      const shouldAutoUpdateShort =
        !currentOppShort.trim() ||
        currentOppShort === "相　手" ||
        currentOppShort === prevAutoShort;

      return {
        ...prev,
        opponentName: nextOpponent,
        firstTeamShortName:
          !isMyFirst && shouldAutoUpdateShort
            ? nextShort
            : prev.firstTeamShortName,
        secondTeamShortName:
          isMyFirst && shouldAutoUpdateShort
            ? nextShort
            : prev.secondTeamShortName,
      };
    });
  };

  return (
    <>
      <section className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
        {/* A-3 ダークヘッダーキャップ */}
        <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Settings2 className="w-4 h-4 text-sky-400 shrink-0" />
            <h2 className="text-xs font-black text-white truncate">
              1. 試合情報・スタメン・速報担当
            </h2>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsLineupModalOpen(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 text-[10.5px] font-black transition-all active:scale-95 cursor-pointer"
            >
              <Users className="w-3 h-3 text-sky-400" />
              <span>スタメン {filledLineupCount}名</span>
            </button>
            <button
              type="button"
              onClick={() => setIsExpanded((v) => !v)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-[10.5px] font-black transition-all active:scale-95 cursor-pointer"
            >
              <span>{isExpanded ? "閉じる" : "詳細編集"}</span>
              {isExpanded ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          </div>
        </div>

        {/* 常時表示コンパクトバー（片手操作・開始時刻1タップ打刻・先攻後攻切替） */}
        <div className="p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded-md bg-slate-900 text-white text-[10.5px] font-black">
                  {doc.battingOrder === "first" ? "自チーム先攻 (表)" : "自チーム後攻 (裏)"}
                </span>
                <span className="text-[11px] font-black text-muted-foreground">
                  {doc.dateText || "日付未設定"}
                </span>
                {doc.tournamentText && (
                  <span className="text-[11px] font-black text-primary truncate max-w-[180px]">
                    {doc.tournamentText}
                  </span>
                )}
              </div>
              <p className="text-xs font-black text-foreground truncate">
                {doc.opponentName ? `対${doc.opponentName}` : "対戦相手未設定"}
                {doc.venueName ? `@${doc.venueName}` : ""}
              </p>
            </div>

            <button
              type="button"
              onClick={handleSwapBattingOrder}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-border bg-muted hover:bg-accent text-[11px] font-black text-foreground transition-all active:scale-95 cursor-pointer shrink-0"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-primary" />
              <span>先攻⇄後攻</span>
            </button>
          </div>

          {/* 開始・終了時刻ワンタップ打刻 ＆ 速報担当者クイック入力 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/50 px-2.5 py-1.5">
              <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-[10.5px] font-black text-muted-foreground shrink-0">
                開始
              </span>
              <input
                type="text"
                value={doc.startTime}
                onChange={(e) =>
                  onChangeDoc((p) => ({ ...p, startTime: e.target.value }))
                }
                placeholder="11:57"
                className="w-full min-w-0 bg-transparent text-xs font-mono font-black text-foreground outline-none placeholder:text-muted-foreground/60"
              />
              <button
                type="button"
                onClick={() =>
                  onChangeDoc((p) => ({ ...p, startTime: getCurrentHmText() }))
                }
                className="px-2 py-0.5 rounded-md bg-card border border-border hover:bg-muted text-[10px] font-black text-primary shrink-0 cursor-pointer active:scale-95"
              >
                現在
              </button>
            </div>

            <div className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/50 px-2.5 py-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="text-[10.5px] font-black text-muted-foreground shrink-0">
                終了
              </span>
              <input
                type="text"
                value={doc.endTime}
                onChange={(e) =>
                  onChangeDoc((p) => ({ ...p, endTime: e.target.value }))
                }
                placeholder="13:17"
                className="w-full min-w-0 bg-transparent text-xs font-mono font-black text-foreground outline-none placeholder:text-muted-foreground/60"
              />
              <button
                type="button"
                onClick={() =>
                  onChangeDoc((p) => ({ ...p, endTime: getCurrentHmText() }))
                }
                className="px-2 py-0.5 rounded-md bg-card border border-border hover:bg-muted text-[10px] font-black text-foreground shrink-0 cursor-pointer active:scale-95"
              >
                現在
              </button>
            </div>

            <div className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/50 px-2.5 py-1.5">
              <UserCheck className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-[10.5px] font-black text-muted-foreground shrink-0">
                速報
              </span>
              <input
                type="text"
                value={doc.reporterNames}
                onChange={(e) =>
                  onChangeDoc((p) => ({ ...p, reporterNames: e.target.value }))
                }
                placeholder="例: 山田、佐藤"
                className="w-full min-w-0 bg-transparent text-xs font-black text-foreground outline-none placeholder:text-muted-foreground/60"
              />
            </div>
          </div>

          {suggestedReporters.length > 0 &&
            doc.reporterNames.trim() !== suggestedReporters.join("、") && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold text-muted-foreground">
                  当日の役割（LINE速報）から反映:
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onChangeDoc((p) => ({
                      ...p,
                      reporterNames: suggestedReporters.join("、"),
                    }))
                  }
                  className="px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/25 text-[10.5px] font-black cursor-pointer active:scale-95"
                >
                  ＋ {suggestedReporters.join("、")}
                </button>
              </div>
            )}

          {/* スタメン横プレビュー＆編集ボタン */}
          <div className="rounded-xl border border-border bg-muted/40 p-2.5 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              {filledLineupCount > 0 ? (
                <p className="text-[11px] font-bold text-foreground truncate">
                  {doc.lineup
                    .filter((s) => s.playerName.trim().length > 0)
                    .map(
                      (s) =>
                        `${s.order}.${normalizeReportPositionCode(
                          s.position
                        )}${formatPlayerReportName(
                          s.playerName,
                          doc.showSurnameOnly
                        )}`
                    )
                    .join(" / ")}
                </p>
              ) : (
                <p className="text-[11px] font-bold text-muted-foreground">
                  スタメン未設定（タップして名簿から選択または手入力できます）
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsLineupModalOpen(true)}
              className="px-2.5 py-1 rounded-lg bg-card border border-border hover:bg-muted text-[11px] font-black text-primary shrink-0 cursor-pointer active:scale-95"
            >
              オーダー編集
            </button>
          </div>

          {/* 展開時：ヘッダー・スコアボード詳細設定 */}
          {isExpanded && (
            <div className="pt-3 border-t border-border space-y-3 animate-in fade-in duration-150">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="block text-[10.5px] font-black text-muted-foreground">
                    日付表記
                  </label>
                  <input
                    type="text"
                    value={doc.dateText}
                    onChange={(e) =>
                      onChangeDoc((p) => ({ ...p, dateText: e.target.value }))
                    }
                    placeholder="例: 11月3日(火祝)"
                    className="w-full h-9 rounded-xl border border-border bg-card px-3 text-xs font-bold text-foreground outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10.5px] font-black text-muted-foreground">
                    大会名・回戦
                  </label>
                  <input
                    type="text"
                    value={doc.tournamentText}
                    onChange={(e) =>
                      onChangeDoc((p) => ({
                        ...p,
                        tournamentText: e.target.value,
                      }))
                    }
                    placeholder="例: 秋季大会　第三回戦"
                    className="w-full h-9 rounded-xl border border-border bg-card px-3 text-xs font-bold text-foreground outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10.5px] font-black text-muted-foreground">
                    対戦相手名（対〇〇）
                  </label>
                  <input
                    type="text"
                    value={doc.opponentName}
                    onChange={(e) => handleOpponentChange(e.target.value)}
                    placeholder="例: 〇〇チーム"
                    className="w-full h-9 rounded-xl border border-border bg-card px-3 text-xs font-bold text-foreground outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10.5px] font-black text-muted-foreground">
                    球場名（@〇〇）
                  </label>
                  <input
                    type="text"
                    value={doc.venueName}
                    onChange={(e) =>
                      onChangeDoc((p) => ({ ...p, venueName: e.target.value }))
                    }
                    placeholder="例: 市民球場"
                    className="w-full h-9 rounded-xl border border-border bg-card px-3 text-xs font-bold text-foreground outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div className="space-y-1">
                  <label className="block text-[10.5px] font-black text-muted-foreground">
                    スコア表・先攻略称
                  </label>
                  <input
                    type="text"
                    value={doc.firstTeamShortName}
                    onChange={(e) =>
                      onChangeDoc((p) => ({
                        ...p,
                        firstTeamShortName: e.target.value,
                      }))
                    }
                    placeholder="例: 自チーム"
                    className="w-full h-9 rounded-xl border border-border bg-card px-2.5 text-xs font-bold text-foreground outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10.5px] font-black text-muted-foreground">
                    スコア表・後攻略称
                  </label>
                  <input
                    type="text"
                    value={doc.secondTeamShortName}
                    onChange={(e) =>
                      onChangeDoc((p) => ({
                        ...p,
                        secondTeamShortName: e.target.value,
                      }))
                    }
                    placeholder="例: 相　手"
                    className="w-full h-9 rounded-xl border border-border bg-card px-2.5 text-xs font-bold text-foreground outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10.5px] font-black text-muted-foreground">
                    規定イニング
                  </label>
                  <select
                    value={doc.regulationInnings}
                    onChange={(e) =>
                      onChangeDoc((p) => ({
                        ...p,
                        regulationInnings: Number(e.target.value) || 7,
                      }))
                    }
                    className="w-full h-9 rounded-xl border border-border bg-card px-2 text-xs font-black text-foreground outline-none focus:border-primary"
                  >
                    {[5, 6, 7, 9].map((n) => (
                      <option key={n} value={n}>
                        {n}回制
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 表記オプションスイッチ群 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onChangeDoc((p) => ({
                      ...p,
                      showSurnameOnly: !p.showSurnameOnly,
                    }))
                  }
                  className={cn(
                    "px-3 py-2 rounded-xl border text-left transition-all cursor-pointer",
                    doc.showSurnameOnly
                      ? "border-primary bg-primary/8 text-foreground"
                      : "border-border bg-muted/40 text-muted-foreground"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-black">苗字のみ出力</span>
                    <span
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[9.5px] font-black",
                        doc.showSurnameOnly
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {doc.showSurnameOnly ? "ON" : "OFF"}
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onChangeDoc((p) => ({
                      ...p,
                      appendSubsToTopLineup: !p.appendSubsToTopLineup,
                    }))
                  }
                  className={cn(
                    "px-3 py-2 rounded-xl border text-left transition-all cursor-pointer",
                    doc.appendSubsToTopLineup
                      ? "border-primary bg-primary/8 text-foreground"
                      : "border-border bg-muted/40 text-muted-foreground"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-black">
                      スタメン欄に交代併記
                    </span>
                    <span
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[9.5px] font-black",
                        doc.appendSubsToTopLineup
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {doc.appendSubsToTopLineup ? "ON" : "OFF"}
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onChangeDoc((p) => ({
                      ...p,
                      showWalkoffX: !p.showWalkoffX,
                    }))
                  }
                  className={cn(
                    "px-3 py-2 rounded-xl border text-left transition-all cursor-pointer",
                    doc.showWalkoffX
                      ? "border-primary bg-primary/8 text-foreground"
                      : "border-border bg-muted/40 text-muted-foreground"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-black">
                      最終裏省略時に「ｘ」
                    </span>
                    <span
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[9.5px] font-black",
                        doc.showWalkoffX
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {doc.showWalkoffX ? "ｘ表示" : "－表示"}
                    </span>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* スタメン編集モーダル（SKILL.md 規約62・63: createPortal + z-[9999] + Safe Area） */}
      {mounted &&
        isLineupModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            onClick={() => setIsLineupModalOpen(false)}
          >
            <div
              className="w-full sm:max-w-lg max-h-[88dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-xl overflow-hidden text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              {/* A-3 Dark Cap */}
              <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Users className="w-4 h-4 text-sky-400 shrink-0" />
                  <div>
                    <h3 className="text-sm font-black text-white">
                      自チーム スタメン設定
                    </h3>
                    <p className="text-[10px] font-bold text-slate-300">
                      例: 1.9 関本（打順 . 守備番号 選手名）
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsLineupModalOpen(false)}
                  className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto space-y-2.5 flex-1">
                {hasSavedMatchLineup && (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/8 px-3 py-2">
                    <span className="text-[11px] font-bold text-foreground">
                      試合データの登録済みオーダーを再反映できます
                    </span>
                    <button
                      type="button"
                      onClick={onReloadMatchLineup}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-[10.5px] font-black shrink-0 cursor-pointer active:scale-95"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>再読込</span>
                    </button>
                  </div>
                )}

                {doc.lineup.map((slot, index) => (
                  <div
                    key={slot.order}
                    className="flex items-center gap-2 rounded-xl border border-border bg-muted/35 p-2"
                  >
                    <span className="w-6 h-7 rounded-lg bg-[#0f172a] text-white font-mono text-xs font-black flex items-center justify-center shrink-0">
                      {slot.order}
                    </span>

                    <select
                      value={normalizeReportPositionCode(slot.position)}
                      onChange={(e) => {
                        const val = e.target.value;
                        onChangeDoc((prev) => {
                          const next = [...prev.lineup];
                          next[index] = { ...next[index], position: val };
                          return { ...prev, lineup: next };
                        });
                      }}
                      className="h-8 w-20 rounded-lg border border-border bg-card px-1.5 text-xs font-black text-foreground shrink-0 outline-none focus:border-primary"
                    >
                      {POSITION_OPTIONS.map((p) => (
                        <option key={p.code} value={p.code}>
                          {p.shortLabel}
                        </option>
                      ))}
                      <option value="打">打</option>
                    </select>

                    {rosterPlayers.length > 0 && (
                      <select
                        value={slot.playerId || ""}
                        onChange={(e) => {
                          const pid = e.target.value;
                          const matched = rosterPlayers.find(
                            (rp) => rp.id === pid
                          );
                          onChangeDoc((prev) => {
                            const next = [...prev.lineup];
                            next[index] = {
                              ...next[index],
                              playerId: matched ? matched.id : null,
                              playerName: matched
                                ? matched.name
                                : next[index].playerName,
                            };
                            return { ...prev, lineup: next };
                          });
                        }}
                        className="h-8 w-28 sm:w-36 rounded-lg border border-border bg-card px-1.5 text-[11px] font-bold text-foreground shrink-0 outline-none focus:border-primary"
                      >
                        <option value="">名簿から選択</option>
                        {rosterPlayers.map((rp) => (
                          <option key={rp.id} value={rp.id}>
                            {rp.uniformNumber ? `#${rp.uniformNumber} ` : ""}
                            {rp.name}
                          </option>
                        ))}
                      </select>
                    )}

                    <input
                      type="text"
                      value={slot.playerName}
                      onChange={(e) => {
                        const nameVal = e.target.value;
                        onChangeDoc((prev) => {
                          const next = [...prev.lineup];
                          next[index] = {
                            ...next[index],
                            playerName: nameVal,
                          };
                          return { ...prev, lineup: next };
                        });
                      }}
                      placeholder="選手名を入力"
                      className="h-8 flex-1 min-w-0 rounded-lg border border-border bg-card px-2.5 text-xs font-black text-foreground outline-none focus:border-primary"
                    />

                    {doc.lineup.length > 9 && index === doc.lineup.length - 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          onChangeDoc((prev) => ({
                            ...prev,
                            lineup: prev.lineup.slice(0, -1),
                          }))
                        }
                        className="w-7 h-7 rounded-lg bg-rose-500/12 text-rose-600 flex items-center justify-center shrink-0 cursor-pointer"
                        title="最終打順枠を削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}

                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      onChangeDoc((prev) => {
                        const nextOrder = prev.lineup.length + 1;
                        const added: LiveReportLineupSlot = {
                          order: nextOrder,
                          position: "D",
                          playerId: null,
                          playerName: "",
                          substitutions: [],
                        };
                        return { ...prev, lineup: [...prev.lineup, added] };
                      })
                    }
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-border bg-muted hover:bg-accent text-xs font-black text-foreground cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-primary" />
                    <span>{doc.lineup.length + 1}番打者を追加（全員打制・DP等）</span>
                  </button>
                </div>
              </div>

              <div className="border-t border-border bg-muted/40 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-3.5 flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setIsLineupModalOpen(false)}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black cursor-pointer active:scale-95"
                >
                  完了して閉じる
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

