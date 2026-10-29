// filepath: src/lib/liff/score-settings.ts
import type { ImportScopeMode } from "@/types/scorebook-v2";

export type ScoreDefaultMatchType = "official" | "practice" | "exchange";
export type ScoreMercyRule = "standard" | "loose" | "none";
export type ScorePositionNotation = "kanji" | "number" | "english";

export interface LiffScoreSettings {
  defaultImportScope: ImportScopeMode;
  defaultEnhancePencil: boolean;
  defaultInnings: number;
  defaultMatchType: ScoreDefaultMatchType;
  mercyRule: ScoreMercyRule;
  positionNotation: ScorePositionNotation;
  dhDefault: boolean;
}

const KEY_DEFAULT_SCOPE = "iscore_score_setting_default_scope";
const KEY_DEFAULT_ENHANCE = "iscore_score_setting_default_enhance";
const KEY_DEFAULT_INNINGS = "iscore_setting_default_innings";
const KEY_DEFAULT_MATCH_TYPE = "iscore_score_setting_default_match_type";
const KEY_MERCY_RULE = "iscore_setting_mercy_rule";
const KEY_POSITION_NOTATION = "iscore_setting_position_notation";
const KEY_DH_DEFAULT = "iscore_setting_dh_default";

export const DEFAULT_LIFF_SCORE_SETTINGS: LiffScoreSettings = {
  defaultImportScope: "both",
  defaultEnhancePencil: false,
  defaultInnings: 7,
  defaultMatchType: "practice",
  mercyRule: "standard",
  positionNotation: "kanji",
  dhDefault: false,
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

    const rawMercy = localStorage.getItem(KEY_MERCY_RULE);
    const mercyRule: ScoreMercyRule =
      rawMercy === "standard" || rawMercy === "loose" || rawMercy === "none"
        ? rawMercy
        : DEFAULT_LIFF_SCORE_SETTINGS.mercyRule;

    const rawNotation = localStorage.getItem(KEY_POSITION_NOTATION);
    const positionNotation: ScorePositionNotation =
      rawNotation === "kanji" ||
      rawNotation === "number" ||
      rawNotation === "english"
        ? rawNotation
        : DEFAULT_LIFF_SCORE_SETTINGS.positionNotation;

    const rawDh = localStorage.getItem(KEY_DH_DEFAULT);
    const dhDefault =
      rawDh !== null
        ? rawDh === "true"
        : DEFAULT_LIFF_SCORE_SETTINGS.dhDefault;

    return {
      defaultImportScope,
      defaultEnhancePencil,
      defaultInnings,
      defaultMatchType,
      mercyRule,
      positionNotation,
      dhDefault,
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
      localStorage.setItem(KEY_MERCY_RULE, merged.mercyRule);
      localStorage.setItem(KEY_POSITION_NOTATION, merged.positionNotation);
      localStorage.setItem(KEY_DH_DEFAULT, String(merged.dhDefault));
    } catch {
      // ignore storage quota errors
    }
  }

  return merged;
}

