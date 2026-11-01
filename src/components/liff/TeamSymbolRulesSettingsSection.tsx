// filepath: src/components/liff/TeamSymbolRulesSettingsSection.tsx
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  Wand2,
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
}

export function TeamSymbolRulesSettingsSection({
  teamId,
  teamName,
  isDemo = false,
  savedLegendUrl,
  initialCloudRules,
  isLoadingTeam,
}: TeamSymbolRulesSettingsSectionProps) {
  const [rules, setRules] = useState<ScorebookSymbolRules>(
    DEFAULT_TEAM_SCOREBOOK_SYMBOL_RULES
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isExtractingAi, setIsExtractingAi] = useState(false);
  const [lastAiSummary, setLastAiSummary] = useState<string | null>(null);
  const [hasSavedCloud, setHasSavedCloud] = useState(false);

  const hydratedRef = useRef(false);

  useEffect(() => {
    const cached = loadCachedTeamSymbolRules();
    if (cached && !hydratedRef.current) {
      setRules(cached);
    }
  }, []);

  useEffect(() => {
    if (initialCloudRules) {
      hydratedRef.current = true;
      setRules(initialCloudRules);
      setHasSavedCloud(true);
      saveCachedTeamSymbolRules(initialCloudRules);
    }
  }, [initialCloudRules]);

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
      saveCachedTeamSymbolRules(sanitized);

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
    [isDemo, teamId]
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

      setRules(json.scorebookSymbolRules);
      setHasSavedCloud(true);
      saveCachedTeamSymbolRules(json.scorebookSymbolRules);
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

  const fieldSections: Array<{
    key: Exclude<keyof ScorebookSymbolRules, "customNote">;
    title: string;
    options: ReadonlyArray<{ value: string; label: string; sample: string }>;
  }> = [
    {
      key: "cellStyle",
      title: SYMBOL_RULE_FIELD_CONFIGS.cellStyle.title,
      options: SYMBOL_RULE_FIELD_CONFIGS.cellStyle.options,
    },
    {
      key: "lineupStyle",
      title: SYMBOL_RULE_FIELD_CONFIGS.lineupStyle.title,
      options: SYMBOL_RULE_FIELD_CONFIGS.lineupStyle.options,
    },
    {
      key: "positionLabel",
      title: SYMBOL_RULE_FIELD_CONFIGS.positionLabel.title,
      options: SYMBOL_RULE_FIELD_CONFIGS.positionLabel.options,
    },
    {
      key: "outMark",
      title: SYMBOL_RULE_FIELD_CONFIGS.outMark.title,
      options: SYMBOL_RULE_FIELD_CONFIGS.outMark.options,
    },
    {
      key: "strikeout",
      title: SYMBOL_RULE_FIELD_CONFIGS.strikeout.title,
      options: SYMBOL_RULE_FIELD_CONFIGS.strikeout.options,
    },
    {
      key: "walkHbp",
      title: SYMBOL_RULE_FIELD_CONFIGS.walkHbp.title,
      options: SYMBOL_RULE_FIELD_CONFIGS.walkHbp.options,
    },
    {
      key: "flyLiner",
      title: SYMBOL_RULE_FIELD_CONFIGS.flyLiner.title,
      options: SYMBOL_RULE_FIELD_CONFIGS.flyLiner.options,
    },
    {
      key: "buntMark",
      title: SYMBOL_RULE_FIELD_CONFIGS.buntMark.title,
      options: SYMBOL_RULE_FIELD_CONFIGS.buntMark.options,
    },
    {
      key: "hitLine",
      title: SYMBOL_RULE_FIELD_CONFIGS.hitLine.title,
      options: SYMBOL_RULE_FIELD_CONFIGS.hitLine.options,
    },
    {
      key: "runMark",
      title: SYMBOL_RULE_FIELD_CONFIGS.runMark.title,
      options: SYMBOL_RULE_FIELD_CONFIGS.runMark.options,
    },
    {
      key: "pitchMark",
      title: SYMBOL_RULE_FIELD_CONFIGS.pitchMark.title,
      options: SYMBOL_RULE_FIELD_CONFIGS.pitchMark.options,
    },
    {
      key: "buntPitchMark",
      title: SYMBOL_RULE_FIELD_CONFIGS.buntPitchMark.title,
      options: SYMBOL_RULE_FIELD_CONFIGS.buntPitchMark.options,
    },
    {
      key: "pickoffMark",
      title: SYMBOL_RULE_FIELD_CONFIGS.pickoffMark.title,
      options: SYMBOL_RULE_FIELD_CONFIGS.pickoffMark.options,
    },
    {
      key: "advanceError",
      title: SYMBOL_RULE_FIELD_CONFIGS.advanceError.title,
      options: SYMBOL_RULE_FIELD_CONFIGS.advanceError.options,
    },
  ];

  return (
    <section
      id="symbol-rules"
      className="scroll-mt-16 rounded-3xl bg-card border-2 border-indigo-500/30 p-4 space-y-4 shadow-sm"
    >
      {/* ヘッダー */}
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          <FileSpreadsheet className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <h2 className="text-sm font-black text-foreground truncate">
            チーム記号ルール（清書シート表示用）
          </h2>
        </div>

        {isSaving ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[10px] font-black shrink-0">
            <Loader2 className="w-3 h-3 animate-spin" />
            保存中...
          </span>
        ) : hasSavedCloud ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/35 text-[10px] font-black shrink-0">
            <CheckCircle2 className="w-3 h-3" />
            チーム保存済
          </span>
        ) : (
          <span className="px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border text-[10px] font-bold shrink-0">
            カスタム可能
          </span>
        )}
      </div>

      <p className="text-[11px] font-bold text-muted-foreground leading-relaxed">
        ここで設定した
        <strong className="text-foreground font-black">
          マス目や記号ルールが試合情報ページのスコアブック（清書シート）にそのまま反映
        </strong>
        されます。設定内容は
        {teamName ? ` ${teamName} ` : "チーム"}全員に共有されます。
      </p>

      {/* リアルタイム4マス記号プレビュー */}
      <div className="space-y-1.5 rounded-2xl bg-slate-100 dark:bg-zinc-900 border border-border p-2.5">
        <div className="flex items-center justify-between px-0.5">
          <span className="text-[11px] font-black text-foreground flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>現在の「チーム記号ルール」プレビュー</span>
          </span>
          <span className="text-[10px] font-bold text-muted-foreground">
            タップで即反映
          </span>
        </div>
        <ScorebookSymbolSamplePreview rules={rules} />
      </div>

      {/* 登録済み早見表画像からのAIワンタップ自動抽出ボタン */}
      {!isLoadingTeam && savedLegendUrl && (
        <div className="space-y-2">
          <button
            type="button"
            disabled={isExtractingAi}
            onClick={handleExtractFromLegendWithAi}
            className="w-full py-3 px-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-xs active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60"
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
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-bold text-emerald-800 dark:text-emerald-200 leading-snug">
              AI読取結果: {lastAiSummary}
            </div>
          )}
        </div>
      )}

      {/* 1. かんたん一括プリセット */}
      <div className="space-y-1.5 pt-1 border-t border-border/60">
        <label className="text-xs font-black text-foreground block">
          定番テンプレートから一括セット
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {SCOREBOOK_SYMBOL_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleApplyPreset(preset.label, preset.rules)}
              className="p-2.5 rounded-2xl border border-border bg-muted/40 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 hover:border-indigo-400 text-left transition-all active:scale-95 cursor-pointer"
            >
              <p className="text-[11px] font-black text-foreground leading-tight">
                {preset.label}
              </p>
              <p className="text-[10px] font-bold text-muted-foreground leading-snug mt-0.5">
                {preset.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* 3. 各記号の詳細カスタマイズ */}
      <div className="space-y-3 pt-1 border-t border-border/60">
        {fieldSections.map((sec) => {
          const currentVal = rules[sec.key];
          const gridClass =
            sec.options.length === 2 || sec.options.length >= 4
              ? "grid-cols-2"
              : "grid-cols-3";
          return (
            <div key={sec.key} className="space-y-1.5">
              <label className="text-[11px] font-black text-foreground block">
                {sec.title}
              </label>
              <div className={cn("grid gap-1.5", gridClass)}>
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
                        "py-2 px-2 rounded-xl border text-left transition-all active:scale-95 cursor-pointer",
                        isActive
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                          : "bg-muted/45 border-border/70 text-foreground hover:bg-muted"
                      )}
                    >
                      <p className="text-[11px] font-black leading-tight truncate">
                        {opt.label}
                      </p>
                      <p
                        className={cn(
                          "text-[10px] font-mono font-bold leading-tight mt-0.5 truncate",
                          isActive ? "text-white/85" : "text-muted-foreground"
                        )}
                      >
                        {opt.sample}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* チーム補足メモ（ヘッダーに小さく印字可能） */}
        <div className="space-y-1.5 pt-1">
          <label className="text-[11px] font-black text-foreground block">
            チーム独自ルール補足メモ（任意・シート上部に印字）
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              maxLength={80}
              value={rules.customNote || ""}
              onChange={(e) =>
                setRules((prev) => ({ ...prev, customNote: e.target.value }))
              }
              placeholder="例: 臨時代走はTR表記、タイブレーク開始走者はTB"
              className="flex-1 h-10 px-3 rounded-xl bg-muted/40 border border-border text-xs font-bold text-foreground placeholder:text-muted-foreground/60"
            />
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void persistRules(rules, "補足メモ")}
              className="h-10 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shrink-0 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

