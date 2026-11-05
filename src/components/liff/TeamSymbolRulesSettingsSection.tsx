// filepath: src/components/liff/TeamSymbolRulesSettingsSection.tsx
"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  CircleDot,
  Diamond,
  FileSpreadsheet,
  LayoutGrid,
  Loader2,
  NotebookPen,
  Printer,
  Sparkles,
  Swords,
  Trophy,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DEFAULT_TEAM_SCOREBOOK_SYMBOL_RULES,
  SCOREBOOK_SYMBOL_PRESETS,
  SYMBOL_RULE_FIELD_CONFIGS,
  loadCachedTeamSymbolRules,
  sanitizeScorebookSymbolRules,
  saveCachedTeamSymbolRules,
  type ScorebookSymbolRules,
} from "@/lib/liff/scorebook-symbol-rules";
import { ScorebookSymbolSamplePreview } from "@/components/liff/DigitalScorebookSheet";
import { ScorebookRuleOptionMiniPreview } from "@/components/liff/ScorebookRuleOptionMiniPreview";

interface SaveSymbolRulesApiResponse {
  success: boolean;
  scorebookSymbolRules?: ScorebookSymbolRules | null;
  error?: string;
}

interface ExtractSymbolRulesApiResponse {
  success: boolean;
  scorebookSymbolRules?: ScorebookSymbolRules;
  summary?: string;
  error?: string;
}

export interface TeamSymbolRulesSettingsSectionProps {
  teamId: string;
  teamName: string;
  isDemo?: boolean;
  savedLegendUrl: string | null;
  initialCloudRules: ScorebookSymbolRules | null;
  isLoadingTeam: boolean;
  onRulesChange?: (rules: ScorebookSymbolRules) => void;
  onOpenChartGenerator?: () => void;
}

export function TeamSymbolRulesSettingsSection({
  teamId,
  teamName,
  isDemo = false,
  savedLegendUrl,
  initialCloudRules,
  isLoadingTeam,
  onRulesChange,
  onOpenChartGenerator,
}: TeamSymbolRulesSettingsSectionProps) {
  const [rules, setRules] = useState<ScorebookSymbolRules>(
    DEFAULT_TEAM_SCOREBOOK_SYMBOL_RULES
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isExtractingAi, setIsExtractingAi] = useState(false);
  const [lastAiSummary, setLastAiSummary] = useState<string | null>(null);
  const [hasSavedCloud, setHasSavedCloud] = useState(false);

  const effectiveTeamKey = isDemo ? "demo-team" : (teamId || "").trim();

  useEffect(() => {
    setLastAiSummary(null);
  }, [effectiveTeamKey]);

  useEffect(() => {
    if (isLoadingTeam) {
      const cached = loadCachedTeamSymbolRules(effectiveTeamKey);
      const next = cached ?? DEFAULT_TEAM_SCOREBOOK_SYMBOL_RULES;
      setRules(next);
      setHasSavedCloud(Boolean(cached));
      onRulesChange?.(next);
      return;
    }

    if (initialCloudRules) {
      const sanitized = sanitizeScorebookSymbolRules(
        initialCloudRules,
        DEFAULT_TEAM_SCOREBOOK_SYMBOL_RULES
      );
      setRules(sanitized);
      setHasSavedCloud(true);
      saveCachedTeamSymbolRules(sanitized, effectiveTeamKey);
      onRulesChange?.(sanitized);
      return;
    }

    if (isDemo || !effectiveTeamKey) {
      const demoCached = loadCachedTeamSymbolRules("demo-team");
      const next = demoCached ?? DEFAULT_TEAM_SCOREBOOK_SYMBOL_RULES;
      setRules(next);
      setHasSavedCloud(Boolean(demoCached));
      onRulesChange?.(next);
      return;
    }

    // 切替先チームにまだクラウド保存ルールがない場合は、前チームの値・補足メモを残さず初期値へ完全リセット
    setRules(DEFAULT_TEAM_SCOREBOOK_SYMBOL_RULES);
    setHasSavedCloud(false);
    saveCachedTeamSymbolRules(null, effectiveTeamKey);
    onRulesChange?.(DEFAULT_TEAM_SCOREBOOK_SYMBOL_RULES);
  }, [effectiveTeamKey, initialCloudRules, isDemo, isLoadingTeam, onRulesChange]);

  const persistRules = useCallback(
    async (
      nextRules: ScorebookSymbolRules,
      toastLabel?: string
    ): Promise<void> => {
      const sanitized = sanitizeScorebookSymbolRules(
        nextRules,
        DEFAULT_TEAM_SCOREBOOK_SYMBOL_RULES
      );
      setRules(sanitized);
      saveCachedTeamSymbolRules(sanitized, effectiveTeamKey);
      onRulesChange?.(sanitized);

      if (isDemo || !teamId) {
        setHasSavedCloud(true);
        if (toastLabel) {
          toast.success(`${toastLabel}を反映しました`);
        }
        return;
      }

      setIsSaving(true);
      try {
        const res = await fetch("/api/liff/scorebook/symbol-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId,
            rules: sanitized,
          }),
        });
        const json = (await res.json()) as SaveSymbolRulesApiResponse;
        if (!res.ok || !json.success) {
          throw new Error(json.error || "チーム記号ルールの保存に失敗しました");
        }
        setHasSavedCloud(true);
        if (toastLabel) {
          toast.success(`${toastLabel}をチーム共通ルールとして保存しました`);
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "保存中にエラーが発生しました";
        toast.error(msg);
      } finally {
        setIsSaving(false);
      }
    },
    [effectiveTeamKey, isDemo, teamId, onRulesChange]
  );

  const handleFieldSelect = <K extends keyof ScorebookSymbolRules>(
    key: K,
    val: ScorebookSymbolRules[K],
    label: string
  ) => {
    const next: ScorebookSymbolRules = {
      ...rules,
      [key]: val,
    };
    void persistRules(next, label);
  };

  const handleApplyPreset = (presetLabel: string, presetRules: ScorebookSymbolRules) => {
    void persistRules(
      {
        ...presetRules,
        customNote: rules.customNote || "",
      },
      `プリセット「${presetLabel}」`
    );
  };

  const handleExtractFromLegendWithAi = async () => {
    if (!savedLegendUrl) {
      toast.error("先に上の「スコア記号早見表」画像を登録してください");
      return;
    }

    setIsExtractingAi(true);
    setLastAiSummary(null);
    try {
      const res = await fetch("/api/liff/scorebook/extract-symbol-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          saveToTeam: true,
        }),
      });
      const json = (await res.json()) as ExtractSymbolRulesApiResponse;
      if (!res.ok || !json.success || !json.scorebookSymbolRules) {
        throw new Error(
          json.error || "早見表からの記号ルール読取に失敗しました"
        );
      }

      const sanitizedAi = sanitizeScorebookSymbolRules(
        json.scorebookSymbolRules,
        DEFAULT_TEAM_SCOREBOOK_SYMBOL_RULES
      );
      setRules(sanitizedAi);
      setHasSavedCloud(true);
      saveCachedTeamSymbolRules(sanitizedAi, effectiveTeamKey);
      onRulesChange?.(sanitizedAi);
      if (json.summary) {
        setLastAiSummary(json.summary);
      }
      toast.success("早見表画像からチーム記号ルールを自動設定しました！");
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "AI自動読取に失敗しました。手動で選択してください。";
      toast.error(msg);
    } finally {
      setIsExtractingAi(false);
    }
  };

  type RuleFieldKey = Exclude<keyof ScorebookSymbolRules, "customNote">;

  interface RuleFieldSectionItem {
    itemNo: string;
    key: RuleFieldKey;
    title: string;
    options: ReadonlyArray<{ value: string; label: string; sample: string }>;
  }

  interface RuleCategoryGroup {
    id: string;
    stepLabel: string;
    title: string;
    subtitle: string;
    rangeLabel: string;
    accentBorderClass: string;
    icon: React.ReactNode;
    items: RuleFieldSectionItem[];
  }

  const categoryGroups: RuleCategoryGroup[] = [
    {
      id: "sheet-lineup",
      stepLabel: "カテゴリ 1",
      title: "シート罫線・メンバー欄・選手交代",
      subtitle: "マス目の基本デザイン、打順欄の並び、代打・代走の波線ルール",
      rangeLabel: "01〜04",
      accentBorderClass: "border-l-blue-400",
      icon: <LayoutGrid className="w-4 h-4 text-blue-300 shrink-0" />,
      items: [
        {
          itemNo: "01",
          key: "cellStyle",
          title: SYMBOL_RULE_FIELD_CONFIGS.cellStyle.title,
          options: SYMBOL_RULE_FIELD_CONFIGS.cellStyle.options,
        },
        {
          itemNo: "02",
          key: "lineupStyle",
          title: SYMBOL_RULE_FIELD_CONFIGS.lineupStyle.title,
          options: SYMBOL_RULE_FIELD_CONFIGS.lineupStyle.options,
        },
        {
          itemNo: "03",
          key: "positionLabel",
          title: SYMBOL_RULE_FIELD_CONFIGS.positionLabel.title,
          options: SYMBOL_RULE_FIELD_CONFIGS.positionLabel.options,
        },
        {
          itemNo: "04",
          key: "pinchHitterMark",
          title: SYMBOL_RULE_FIELD_CONFIGS.pinchHitterMark.title,
          options: SYMBOL_RULE_FIELD_CONFIGS.pinchHitterMark.options,
        },
      ],
    },
    {
      id: "bso-pitch",
      stepLabel: "カテゴリ 2",
      title: "配球・カウント・牽制（左BSO欄）",
      subtitle: "1球ごとのストライク・ボール・バント球・牽制記号",
      rangeLabel: "05〜07",
      accentBorderClass: "border-l-teal-400",
      icon: <CircleDot className="w-4 h-4 text-teal-300 shrink-0" />,
      items: [
        {
          itemNo: "05",
          key: "pitchMark",
          title: SYMBOL_RULE_FIELD_CONFIGS.pitchMark.title,
          options: SYMBOL_RULE_FIELD_CONFIGS.pitchMark.options,
        },
        {
          itemNo: "06",
          key: "buntPitchMark",
          title: SYMBOL_RULE_FIELD_CONFIGS.buntPitchMark.title,
          options: SYMBOL_RULE_FIELD_CONFIGS.buntPitchMark.options,
        },
        {
          itemNo: "07",
          key: "pickoffMark",
          title: SYMBOL_RULE_FIELD_CONFIGS.pickoffMark.title,
          options: SYMBOL_RULE_FIELD_CONFIGS.pickoffMark.options,
        },
      ],
    },
    {
      id: "batting-result",
      stepLabel: "カテゴリ 3",
      title: "打撃結果・三振・四死球（マス右下・安打線）",
      subtitle: "三振・四死球・飛球/ゴロ・犠打/犠飛・併殺打・安打赤線",
      rangeLabel: "08〜13",
      accentBorderClass: "border-l-amber-400",
      icon: <Swords className="w-4 h-4 text-amber-300 shrink-0" />,
      items: [
        {
          itemNo: "08",
          key: "strikeout",
          title: SYMBOL_RULE_FIELD_CONFIGS.strikeout.title,
          options: SYMBOL_RULE_FIELD_CONFIGS.strikeout.options,
        },
        {
          itemNo: "09",
          key: "walkHbp",
          title: SYMBOL_RULE_FIELD_CONFIGS.walkHbp.title,
          options: SYMBOL_RULE_FIELD_CONFIGS.walkHbp.options,
        },
        {
          itemNo: "10",
          key: "flyLiner",
          title: SYMBOL_RULE_FIELD_CONFIGS.flyLiner.title,
          options: SYMBOL_RULE_FIELD_CONFIGS.flyLiner.options,
        },
        {
          itemNo: "11",
          key: "buntMark",
          title: SYMBOL_RULE_FIELD_CONFIGS.buntMark.title,
          options: SYMBOL_RULE_FIELD_CONFIGS.buntMark.options,
        },
        {
          itemNo: "12",
          key: "doublePlayMark",
          title: SYMBOL_RULE_FIELD_CONFIGS.doublePlayMark.title,
          options: SYMBOL_RULE_FIELD_CONFIGS.doublePlayMark.options,
        },
        {
          itemNo: "13",
          key: "hitLine",
          title: SYMBOL_RULE_FIELD_CONFIGS.hitLine.title,
          options: SYMBOL_RULE_FIELD_CONFIGS.hitLine.options,
        },
      ],
    },
    {
      id: "runner-advance",
      stepLabel: "カテゴリ 4",
      title: "進塁・走塁アウト・失策略号（ダイヤ外周）",
      subtitle: "進塁線・ストップ線・封殺記号・失策/野選/盗塁の略号",
      rangeLabel: "14〜17",
      accentBorderClass: "border-l-emerald-400",
      icon: <Diamond className="w-4 h-4 text-emerald-300 shrink-0" />,
      items: [
        {
          itemNo: "14",
          key: "runnerLine",
          title: SYMBOL_RULE_FIELD_CONFIGS.runnerLine.title,
          options: SYMBOL_RULE_FIELD_CONFIGS.runnerLine.options,
        },
        {
          itemNo: "15",
          key: "runnerOutLine",
          title: SYMBOL_RULE_FIELD_CONFIGS.runnerOutLine.title,
          options: SYMBOL_RULE_FIELD_CONFIGS.runnerOutLine.options,
        },
        {
          itemNo: "16",
          key: "forceOutMark",
          title: SYMBOL_RULE_FIELD_CONFIGS.forceOutMark.title,
          options: SYMBOL_RULE_FIELD_CONFIGS.forceOutMark.options,
        },
        {
          itemNo: "17",
          key: "advanceError",
          title: SYMBOL_RULE_FIELD_CONFIGS.advanceError.title,
          options: SYMBOL_RULE_FIELD_CONFIGS.advanceError.options,
        },
      ],
    },
    {
      id: "center-score-out",
      stepLabel: "カテゴリ 5",
      title: "アウト・得点・打点（ダイヤ中央・右上）",
      subtitle: "アウトカウント数字、自責点/非自責点マーク、打点ドット",
      rangeLabel: "18〜20",
      accentBorderClass: "border-l-rose-400",
      icon: <Trophy className="w-4 h-4 text-rose-300 shrink-0" />,
      items: [
        {
          itemNo: "18",
          key: "outMark",
          title: SYMBOL_RULE_FIELD_CONFIGS.outMark.title,
          options: SYMBOL_RULE_FIELD_CONFIGS.outMark.options,
        },
        {
          itemNo: "19",
          key: "runMark",
          title: SYMBOL_RULE_FIELD_CONFIGS.runMark.title,
          options: SYMBOL_RULE_FIELD_CONFIGS.runMark.options,
        },
        {
          itemNo: "20",
          key: "rbiMark",
          title: SYMBOL_RULE_FIELD_CONFIGS.rbiMark.title,
          options: SYMBOL_RULE_FIELD_CONFIGS.rbiMark.options,
        },
      ],
    },
  ];

  return (
    <section
      id="symbol-rules"
      className="scroll-mt-16 rounded-2xl border border-border bg-card shadow-xs overflow-hidden"
    >
      {/* ヘッダー */}
      <div className="bg-[#0f172a] text-slate-50 border-b-[3px] border-primary px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-xl bg-primary/20 text-blue-300 border border-primary/40 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-4 h-4" />
          </span>
          <h2 className="text-sm font-black text-white truncate">
            チーム記号ルール（清書シート表示用）
          </h2>
        </div>

        {isSaving ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary/20 text-blue-300 border border-primary/40 text-[10px] font-black shrink-0">
            <Loader2 className="w-3 h-3 animate-spin" />
            保存中...
          </span>
        ) : hasSavedCloud ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-black shrink-0">
            <CheckCircle2 className="w-3 h-3" />
            チーム保存済
          </span>
        ) : (
          <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-bold shrink-0">
            カスタム可能
          </span>
        )}
      </div>

      <div className="p-4 space-y-4">
        <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
          ここで設定した
          <strong className="text-foreground font-black">
            マス目や記号ルールが試合情報ページのスコアブック（清書シート）にそのまま反映
          </strong>
          されます。設定内容は
          {teamName ? ` ${teamName} ` : "チーム"}全員に共有されます。
        </p>

        {/* リアルタイム4マス記号プレビュー */}
        <div className="space-y-2 rounded-2xl bg-muted/35 border border-border p-2.5">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[11px] font-black text-foreground flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span>現在の「チーム記号ルール」プレビュー</span>
            </span>
            <span className="text-[10px] font-bold text-muted-foreground">
              タップで即反映
            </span>
          </div>
          <ScorebookSymbolSamplePreview rules={rules} />

          {onOpenChartGenerator && (
            <button
              type="button"
              onClick={onOpenChartGenerator}
              className="w-full py-2.5 px-3 rounded-xl bg-[#0f172a] hover:bg-slate-800 text-white border border-amber-500/50 text-xs font-black flex items-center justify-center gap-2 shadow-2xs active:scale-[0.99] transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                本物の清書マス目で「スコア記号 早見表」を作成・印刷・登録
              </span>
            </button>
          )}
        </div>

        {/* 登録済み早見表画像からのAIワンタップ自動抽出ボタン */}
        {!isLoadingTeam && savedLegendUrl && (
          <div className="space-y-2">
            <button
              type="button"
              disabled={isExtractingAi}
              onClick={handleExtractFromLegendWithAi}
              className="w-full py-3 px-3.5 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xs flex items-center justify-center gap-2 shadow-xs active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60"
            >
              {isExtractingAi ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>登録済みの早見表画像をAI解析中...</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 shrink-0" />
                  <span>登録済みの「早見表画像」からAIで自動設定する</span>
                </>
              )}
            </button>

            {lastAiSummary && (
              <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/25 text-[11px] font-bold text-foreground leading-snug">
                AI読取結果: {lastAiSummary}
              </div>
            )}
          </div>
        )}

        {/* 1. かんたん一括プリセット */}
        <div className="rounded-2xl border border-[#cbd5e1] dark:border-border bg-[#eef2f6] dark:bg-muted/40 overflow-hidden">
          <div className="bg-card border-b border-[#cbd5e1] dark:border-border px-3 py-2 flex items-center justify-between gap-2">
            <span className="text-xs font-black text-foreground">
              一括テンプレートからまとめてセット
            </span>
            <span className="text-[10px] font-bold text-muted-foreground shrink-0">
              あとから個別変更OK
            </span>
          </div>
          <div className="p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SCOREBOOK_SYMBOL_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyPreset(preset.label, preset.rules)}
                className="p-2.5 rounded-xl border border-[#cbd5e1] dark:border-border bg-card hover:bg-muted/60 hover:border-primary/50 text-left transition-all active:scale-[0.98] shadow-2xs cursor-pointer"
              >
                <p className="text-xs font-black text-foreground leading-tight">
                  {preset.label}
                </p>
                <p className="text-[10px] font-bold text-muted-foreground leading-snug mt-1">
                  {preset.description}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* 2. カテゴリ別・各記号の詳細カスタマイズ（全20項目・各項目独立カード枠＋見出し帯） */}
        <div className="pt-3 border-t-2 border-slate-200 dark:border-border space-y-5">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <div>
              <h3 className="text-xs sm:text-[13px] font-black text-foreground">
                項目ごとの詳細ルール選択（全20項目）
              </h3>
              <p className="text-[10px] font-bold text-muted-foreground mt-0.5">
                5つのカテゴリ別に整理しています。各見本をタップすると即座に保存されます。
              </p>
            </div>
          </div>

          {categoryGroups.map((group, groupIdx) => (
            <div
              key={group.id}
              className={cn(
                "space-y-3",
                groupIdx > 0 &&
                  "pt-4 border-t-2 border-slate-200 dark:border-border"
              )}
            >
              {/* カテゴリ大見出しキャップ */}
              <div
                className={cn(
                  "rounded-xl bg-[#0f172a] text-slate-50 border-l-4 px-3.5 py-2.5 flex items-center justify-between gap-2 shadow-2xs",
                  group.accentBorderClass
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {group.icon}
                    <span className="text-[10px] font-black text-slate-300 tracking-wide">
                      {group.stepLabel}
                    </span>
                    <h4 className="text-xs sm:text-[13px] font-black text-white truncate">
                      {group.title}
                    </h4>
                  </div>
                  <p className="text-[10px] font-bold text-slate-300 leading-snug mt-0.5">
                    {group.subtitle}
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 border border-slate-700 font-mono text-[10px] font-black shrink-0">
                  {group.rangeLabel}
                </span>
              </div>

              {/* カテゴリ内の各設定項目（1項目ごとに独立した枠線＋白ヘッダー帯＋スレート背景トレイで完全分離） */}
              <div className="space-y-3.5">
                {group.items.map((sec) => {
                  const currentVal = rules[sec.key];
                  const gridClass =
                    sec.key === "lineupStyle"
                      ? "grid-cols-1 sm:grid-cols-2"
                      : "grid-cols-2";
                  return (
                    <div
                      key={sec.key}
                      className="rounded-2xl border border-[#cbd5e1] dark:border-border bg-[#eef2f6] dark:bg-muted/45 overflow-hidden shadow-2xs"
                    >
                      {/* 項目見出しバー */}
                      <div className="bg-card border-b border-[#cbd5e1] dark:border-border px-3 py-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="inline-flex items-center justify-center min-w-[26px] h-5 px-1.5 rounded-md bg-[#0f172a] text-white font-mono text-[10px] font-black shrink-0">
                            {sec.itemNo}
                          </span>
                          <label className="text-xs sm:text-[13px] font-black text-foreground leading-snug">
                            {sec.title}
                          </label>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-muted text-slate-600 dark:text-muted-foreground border border-slate-300 dark:border-border text-[10px] font-black shrink-0">
                          {sec.options.length}択
                        </span>
                      </div>

                      {/* 選択肢カード群 */}
                      <div className={cn("p-2.5 grid gap-2", gridClass)}>
                        {sec.options.map((opt) => {
                          const isActive = currentVal === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() =>
                                handleFieldSelect(
                                  sec.key,
                                  opt.value as ScorebookSymbolRules[typeof sec.key],
                                  sec.title
                                )
                              }
                              className={cn(
                                "p-2 rounded-xl text-left transition-all active:scale-[0.98] cursor-pointer flex flex-col gap-1.5",
                                isActive
                                  ? "bg-blue-50 dark:bg-primary/15 text-primary border-2 border-primary shadow-xs"
                                  : "bg-card border border-[#cbd5e1] dark:border-border text-foreground hover:border-slate-400 shadow-2xs"
                              )}
                            >
                              <ScorebookRuleOptionMiniPreview
                                fieldKey={sec.key}
                                optionValue={opt.value}
                                baseRules={rules}
                                className={
                                  isActive
                                    ? "border-primary/50"
                                    : "border-slate-300/90"
                                }
                              />
                              <div className="w-full min-w-0 px-0.5">
                                <div className="flex items-start justify-between gap-1">
                                  <p className="text-[11px] font-black leading-snug">
                                    {opt.label}
                                  </p>
                                  {isActive && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[9px] font-black shrink-0">
                                      <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                                      <span>選択中</span>
                                    </span>
                                  )}
                                </div>
                                <p
                                  className={cn(
                                    "text-[10px] font-mono font-bold leading-tight mt-0.5 truncate",
                                    isActive
                                      ? "text-primary/85"
                                      : "text-muted-foreground"
                                  )}
                                >
                                  {opt.sample}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* 3. チーム補足メモ（独立ボックス） */}
          <div className="pt-4 border-t-2 border-slate-200 dark:border-border">
            <div className="rounded-2xl border border-[#cbd5e1] dark:border-border bg-[#eef2f6] dark:bg-muted/40 overflow-hidden shadow-2xs">
              <div className="bg-card border-b border-[#cbd5e1] dark:border-border px-3 py-2 flex items-center gap-2">
                <NotebookPen className="w-3.5 h-3.5 text-primary shrink-0" />
                <label className="text-xs font-black text-foreground block">
                  チーム独自ルール補足メモ（任意・シート上部に印字）
                </label>
              </div>
              <div className="p-2.5 flex gap-2">
                <div className="relative flex-1 min-w-0">
                  <input
                    type="text"
                    maxLength={80}
                    value={rules.customNote || ""}
                    onChange={(e) =>
                      setRules((prev) => ({
                        ...prev,
                        customNote: e.target.value,
                      }))
                    }
                    placeholder="例: 臨時代走はTR表記、タイブレーク開始走者はTB"
                    className="w-full h-10 pl-3 pr-8 rounded-xl bg-card border border-[#cbd5e1] dark:border-border text-xs font-bold text-foreground placeholder:text-muted-foreground/60 focus:outline-hidden focus:border-primary"
                  />
                  {Boolean(rules.customNote) && (
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() =>
                        void persistRules(
                          { ...rules, customNote: "" },
                          "補足メモのクリア"
                        )
                      }
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                      aria-label="補足メモを消去"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => void persistRules(rules, "補足メモ")}
                  className="h-10 px-3.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black shrink-0 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

