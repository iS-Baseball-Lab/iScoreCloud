// filepath: src/app/liff/tools/news-generator/_components/MatchAndHeaderSetupCard.tsx
"use client";

import React, { useState, useEffect } from "react";
import {
  Settings2,
  ChevronDown,
  ChevronUp,
  Clock,
  ArrowLeftRight,
  Users,
  UserCheck,
  ExternalLink,
  Flame,
  Snowflake,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LiffSelect } from "@/components/liff/LiffSelect";
import {
  deriveScoreboardShortName,
  formatPlayerReportName,
  getCurrentHmText,
  normalizeReportPositionCode,
} from "@/lib/liff/live-report-v2";
import type { LiveReportV2Document } from "@/types/live-report-v2";

export interface MatchSetupTournamentRules {
  tournamentName?: string | null;
  category?: string | null;
  timeLimit?: string | null;
  coldGameRule?: string | null;
  tiebreakerRule?: string | null;
  pitchLimitRule?: string | null;
  bracketUrl?: string | null;
}

interface MatchAndHeaderSetupCardProps {
  doc: LiveReportV2Document;
  onChangeDoc: (updater: (prev: LiveReportV2Document) => LiveReportV2Document) => void;
  suggestedReporters: ReadonlyArray<string>;
  onOpenLineupTab: () => void;
  activeContextKey: string;
  defaultExpanded?: boolean;
  readOnly?: boolean;
  tournamentRules?: MatchSetupTournamentRules | null;
  resolvedPitchRuleLabel?: string;
}

const PITCH_LIMIT_OVERRIDE_OPTIONS = [
  { value: "auto", label: "大会/チーム規定自動" },
  { value: "70", label: "学童70球（50注意・60準備）" },
  { value: "85", label: "85球（65注意・75準備）" },
  { value: "100", label: "中学100球（75注意・85準備）" },
  { value: "none", label: "制限なし" },
] as const;

export function MatchAndHeaderSetupCard({
  doc,
  onChangeDoc,
  suggestedReporters,
  onOpenLineupTab,
  activeContextKey,
  defaultExpanded = false,
  readOnly = false,
  tournamentRules = null,
  resolvedPitchRuleLabel,
}: MatchAndHeaderSetupCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // SKILL.md 規約5: 対象試合切替・閲覧モード切替時に展開状態を安全にリセット
  useEffect(() => {
    if (readOnly) {
      setIsExpanded(false);
    }
  }, [activeContextKey, readOnly]);

  const filledLineupCount =
    doc.lineup.filter((s) => s.playerName.trim().length > 0).length +
    (doc.dhStarterPitcher?.playerName.trim() ? 1 : 0);

  const timeRule = (tournamentRules?.timeLimit || "").trim();
  const coldRule = (tournamentRules?.coldGameRule || "").trim();
  const tieRule = (tournamentRules?.tiebreakerRule || "").trim();
  const pitchRule = (tournamentRules?.pitchLimitRule || "").trim();
  const rawBracketUrl = (tournamentRules?.bracketUrl || "").trim();
  const validBracketUrl = /^https?:\/\//i.test(rawBracketUrl)
    ? rawBracketUrl
    : "";
  const hasAnyTournamentRule = Boolean(
    timeRule || coldRule || tieRule || pitchRule || validBracketUrl
  );

  const pitchOverrideSelectValue =
    doc.pitchLimitOverride === "none"
      ? "none"
      : typeof doc.pitchLimitOverride === "number" &&
          (doc.pitchLimitOverride === 70 ||
            doc.pitchLimitOverride === 85 ||
            doc.pitchLimitOverride === 100)
        ? String(doc.pitchLimitOverride)
        : "auto";

  const handleSwapBattingOrder = () => {
    if (readOnly) return;
    onChangeDoc((prev) => ({
      ...prev,
      battingOrder: prev.battingOrder === "first" ? "second" : "first",
      firstTeamShortName: prev.secondTeamShortName,
      secondTeamShortName: prev.firstTeamShortName,
    }));
  };

  const handleOpponentChange = (nextOpponent: string) => {
    if (readOnly) return;
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
              {readOnly
                ? "試合情報・スタメン・速報担当（参照専用）"
                : "1. 試合情報・スタメン・速報担当"}
            </h2>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onOpenLineupTab}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 text-[10.5px] font-black transition-all active:scale-95 cursor-pointer"
            >
              <Users className="w-3 h-3 text-sky-400" />
              <span>スタメン {filledLineupCount}名</span>
            </button>
            {!readOnly && (
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
            )}
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
                <span className="px-1.5 py-0.5 rounded-md bg-muted border border-border text-foreground text-[10px] font-black">
                  {doc.regulationInnings || 7}回制
                </span>
                {(doc.opponentBatterCount || 9) > 9 && (
                  <span className="px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/35 text-amber-800 dark:text-amber-300 text-[10px] font-black">
                    相手{doc.opponentBatterCount}人打順
                  </span>
                )}
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

            {!readOnly && (
              <button
                type="button"
                onClick={handleSwapBattingOrder}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-border bg-muted hover:bg-accent text-[11px] font-black text-foreground transition-all active:scale-95 cursor-pointer shrink-0"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-primary" />
                <span>先攻⇄後攻</span>
              </button>
            )}
          </div>

          {/* 大会規定ソリッドストリップ（時間制限・コールド・タイブレーク・球数制限・トーナメント表） */}
          {hasAnyTournamentRule && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-3 py-1.5 bg-[#0f172a] text-slate-50 border-b-[2px] border-amber-500 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-[10.5px] font-black text-white">
                  <Trophy className="w-3 h-3 text-amber-400 shrink-0" />
                  <span>大会規定</span>
                </span>
                {validBracketUrl && (
                  <a
                    href={validBracketUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10.5px] font-black text-amber-300 hover:underline shrink-0"
                  >
                    <span>トーナメント表</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              {(timeRule || coldRule || tieRule || pitchRule) && (
                <div className="p-2 flex flex-wrap gap-1.5 bg-card">
                  {timeRule && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted border border-border text-[10.5px] font-bold text-foreground">
                      <Clock className="w-3 h-3 text-primary shrink-0" />
                      <span>時間制限: {timeRule}</span>
                    </span>
                  )}
                  {coldRule && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted border border-border text-[10.5px] font-bold text-foreground">
                      <Snowflake className="w-3 h-3 text-sky-600 shrink-0" />
                      <span>コールド: {coldRule}</span>
                    </span>
                  )}
                  {tieRule && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted border border-border text-[10.5px] font-bold text-foreground">
                      <Flame className="w-3 h-3 text-amber-600 shrink-0" />
                      <span>タイブレーク: {tieRule}</span>
                    </span>
                  )}
                  {pitchRule && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-[10.5px] font-black text-amber-900 dark:text-amber-200">
                      <span aria-hidden="true">⚾</span>
                      <span>球数制限: {pitchRule}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ⚾ 球数アラート基準セレクター */}
          <div className="rounded-xl border border-border bg-muted/40 px-2.5 py-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span aria-hidden="true" className="text-xs">
                ⚾
              </span>
              <span className="text-[11px] font-black text-foreground shrink-0">
                球数アラート基準
              </span>
              {resolvedPitchRuleLabel && (
                <span className="px-1.5 py-0.5 rounded bg-card border border-border text-[10px] font-black text-muted-foreground truncate">
                  現在: {resolvedPitchRuleLabel}
                </span>
              )}
            </div>
            {readOnly ? (
              <span className="text-[11px] font-black text-foreground">
                {
                  PITCH_LIMIT_OVERRIDE_OPTIONS.find(
                    (o) => o.value === pitchOverrideSelectValue
                  )?.label
                }
              </span>
            ) : (
              <LiffSelect
                value={pitchOverrideSelectValue}
                onChange={(val) => {
                  onChangeDoc((prev) => ({
                    ...prev,
                    pitchLimitOverride:
                      val === "none"
                        ? "none"
                        : val === "70" || val === "85" || val === "100"
                          ? Number(val)
                          : null,
                  }));
                }}
                options={PITCH_LIMIT_OVERRIDE_OPTIONS}
                title="⚾ 球数アラート基準を選択"
                subtitle="投手の肩肘保護アラート（注意・交代準備・上限到達）の基準を切り替えます"
                accent="amber"
                size="xs"
                searchable={false}
                className="h-8 w-52 max-w-full bg-card shrink-0"
              />
            )}
          </div>

          {/* 開始・終了時刻ワンタップ打刻 ＆ 速報担当者クイック入力 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/50 px-2.5 py-1.5">
              <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-[10.5px] font-black text-muted-foreground shrink-0">
                開始
              </span>
              {readOnly ? (
                <span className="text-xs font-mono font-black text-foreground">
                  {doc.startTime || "未設定"}
                </span>
              ) : (
                <>
                  <input
                    type="text"
                    value={doc.startTime}
                    onChange={(e) =>
                      onChangeDoc((p) => ({ ...p, startTime: e.target.value }))
                    }
                    placeholder="11:57"
                    className="w-full min-w-0 bg-transparent text-base sm:text-xs font-mono font-black text-foreground outline-none placeholder:text-muted-foreground/60"
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
                </>
              )}
            </div>

            <div className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/50 px-2.5 py-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="text-[10.5px] font-black text-muted-foreground shrink-0">
                終了
              </span>
              {readOnly ? (
                <span className="text-xs font-mono font-black text-foreground">
                  {doc.endTime || "未設定"}
                </span>
              ) : (
                <>
                  <input
                    type="text"
                    value={doc.endTime}
                    onChange={(e) =>
                      onChangeDoc((p) => ({ ...p, endTime: e.target.value }))
                    }
                    placeholder="13:17"
                    className="w-full min-w-0 bg-transparent text-base sm:text-xs font-mono font-black text-foreground outline-none placeholder:text-muted-foreground/60"
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
                </>
              )}
            </div>

            <div className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/50 px-2.5 py-1.5">
              <UserCheck className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-[10.5px] font-black text-muted-foreground shrink-0">
                速報
              </span>
              {readOnly ? (
                <span className="text-xs font-black text-foreground truncate">
                  {doc.reporterNames || suggestedReporters.join("、") || "未設定"}
                </span>
              ) : (
                <input
                  type="text"
                  value={doc.reporterNames}
                  onChange={(e) =>
                    onChangeDoc((p) => ({ ...p, reporterNames: e.target.value }))
                  }
                  placeholder="例: 山田、佐藤"
                  className="w-full min-w-0 bg-transparent text-base sm:text-xs font-black text-foreground outline-none placeholder:text-muted-foreground/60"
                />
              )}
            </div>
          </div>

          {!readOnly &&
            suggestedReporters.length > 0 &&
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

          {/* スタメン横プレビュー＆編集/確認ボタン */}
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
                  {readOnly
                    ? "スタメンはまだ登録されていません"
                    : "スタメン未設定（タップして名簿から選択または手入力できます）"}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onOpenLineupTab}
              className="px-2.5 py-1 rounded-lg bg-card border border-border hover:bg-muted text-[11px] font-black text-primary shrink-0 cursor-pointer active:scale-95"
            >
              {readOnly ? "オーダー確認" : "スタメン・控え編成"}
            </button>
          </div>

          {/* 展開時：ヘッダー・スコアボード詳細設定 */}
          {!readOnly && isExpanded && (
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
                    className="w-full h-9 rounded-xl border border-border bg-card px-3 text-base sm:text-xs font-bold text-foreground outline-none focus:border-primary"
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
                    className="w-full h-9 rounded-xl border border-border bg-card px-3 text-base sm:text-xs font-bold text-foreground outline-none focus:border-primary"
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
                    className="w-full h-9 rounded-xl border border-border bg-card px-3 text-base sm:text-xs font-bold text-foreground outline-none focus:border-primary"
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
                    className="w-full h-9 rounded-xl border border-border bg-card px-3 text-base sm:text-xs font-bold text-foreground outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
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
                    className="w-full h-9 rounded-xl border border-border bg-card px-2.5 text-base sm:text-xs font-bold text-foreground outline-none focus:border-primary"
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
                    className="w-full h-9 rounded-xl border border-border bg-card px-2.5 text-base sm:text-xs font-bold text-foreground outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10.5px] font-black text-muted-foreground">
                    規定イニング
                  </label>
                  <LiffSelect
                    value={String(doc.regulationInnings)}
                    onChange={(val) =>
                      onChangeDoc((p) => ({
                        ...p,
                        regulationInnings: Number(val) || 7,
                      }))
                    }
                    options={[5, 6, 7, 9].map((n) => ({
                      value: String(n),
                      label: `${n}回制`,
                    }))}
                    title="規定イニングを選択"
                    size="sm"
                    searchable={false}
                    className="w-full h-9"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10.5px] font-black text-muted-foreground">
                    相手打順人数
                  </label>
                  <LiffSelect
                    value={String(doc.opponentBatterCount || 9)}
                    onChange={(val) => {
                      const nextCount = Math.min(
                        25,
                        Math.max(9, Number(val) || 9)
                      );
                      onChangeDoc((p) => ({
                        ...p,
                        opponentBatterCount: nextCount,
                        nextOpponentOrder: Math.min(
                          Math.max(1, p.nextOpponentOrder || 1),
                          nextCount
                        ),
                      }));
                    }}
                    options={Array.from({ length: 17 }, (_, i) => i + 9).map(
                      (n) => ({
                        value: String(n),
                        label:
                          n === 9 ? "9人（通常）" : `${n}人（全員打制）`,
                      })
                    )}
                    title="相手の打順人数を選択"
                    subtitle="練習試合・学童野球などの全員打ち（10人以上打順）に対応します"
                    size="sm"
                    searchable={false}
                    className="w-full h-9"
                  />
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
    </>
  );
}
