// filepath: src/lib/liff/score-settings.ts
import type { ImportScopeMode } from "@/types/scorebook-v2";

export type ScoreDefaultMatchType = "official" | "practice" | "exchange";

export interface LiffScoreSettings {
  defaultImportScope: ImportScopeMode;
  defaultEnhancePencil: boolean;
  defaultInnings: number;
  defaultMatchType: ScoreDefaultMatchType;
}

const KEY_DEFAULT_SCOPE = "iscore_score_setting_default_scope";
const KEY_DEFAULT_ENHANCE = "iscore_score_setting_default_enhance";
const KEY_DEFAULT_INNINGS = "iscore_setting_default_innings";
const KEY_DEFAULT_MATCH_TYPE = "iscore_score_setting_default_match_type";

export const DEFAULT_LIFF_SCORE_SETTINGS: LiffScoreSettings = {
  defaultImportScope: "both",
  defaultEnhancePencil: false,
  defaultInnings: 7,
  defaultMatchType: "practice",
};

export function loadLiffScoreSettings(): LiffScoreSettings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_LIFF_SCORE_SETTINGS };
  }

  try {
    const rawScope = localStorage.getItem(KEY_DEFAULT_SCOPE);
    const defaultImportScope: ImportScopeMode =
      rawScope === "top_only" ||
      rawScope === "bottom_only" ||
      rawScope === "both"
        ? rawScope
        : DEFAULT_LIFF_SCORE_SETTINGS.defaultImportScope;

    const rawEnhance = localStorage.getItem(KEY_DEFAULT_ENHANCE);
    const defaultEnhancePencil =
      rawEnhance !== null
        ? rawEnhance === "true"
        : DEFAULT_LIFF_SCORE_SETTINGS.defaultEnhancePencil;

    const rawInnings = Number(localStorage.getItem(KEY_DEFAULT_INNINGS));
    const defaultInnings =
      rawInnings === 5 || rawInnings === 6 || rawInnings === 7 || rawInnings === 9
        ? rawInnings
        : DEFAULT_LIFF_SCORE_SETTINGS.defaultInnings;

    const rawMatchType = localStorage.getItem(KEY_DEFAULT_MATCH_TYPE);
    const defaultMatchType: ScoreDefaultMatchType =
      rawMatchType === "official" ||
      rawMatchType === "practice" ||
      rawMatchType === "exchange"
        ? rawMatchType
        : DEFAULT_LIFF_SCORE_SETTINGS.defaultMatchType;

    return {
      defaultImportScope,
      defaultEnhancePencil,
      defaultInnings,
      defaultMatchType,
    };
  } catch {
    return { ...DEFAULT_LIFF_SCORE_SETTINGS };
  }
}

export function saveLiffScoreSettings(
  next: Partial<LiffScoreSettings>
): LiffScoreSettings {
  const merged: LiffScoreSettings = {
    ...loadLiffScoreSettings(),
    ...next,
  };

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(KEY_DEFAULT_SCOPE, merged.defaultImportScope);
      localStorage.setItem(
        KEY_DEFAULT_ENHANCE,
        String(merged.defaultEnhancePencil)
      );
      localStorage.setItem(KEY_DEFAULT_INNINGS, String(merged.defaultInnings));
      localStorage.setItem(KEY_DEFAULT_MATCH_TYPE, merged.defaultMatchType);
    } catch {
      // ignore storage quota errors
    }
  }

  return merged;
}

