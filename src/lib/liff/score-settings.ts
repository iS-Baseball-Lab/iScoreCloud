// filepath: src/lib/liff/score-settings.ts
import type { ImportScopeMode } from "@/types/scorebook-v2";
import type { ScoreTeamNameDisplayMode } from "@/lib/liff/scorebook-symbol-rules";

export type { ScoreTeamNameDisplayMode };

export type ScoreDefaultMatchType = "official" | "practice" | "exchange";
export type ScoreMercyRule = "standard" | "loose" | "none";
export type ScorePositionNotation = "kanji" | "number" | "english";

export const LIFF_SCORE_SETTINGS_CHANGE_EVENT = "iscore-score-settings-change";
const TEAM_SCORE_NAME_MODE_STORAGE_PREFIX = "iscore_score_team_name_mode_v1:";

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

function buildTeamScoreNameModeKey(teamId?: string | null): string | null {
  const clean = (teamId || "").trim();
  if (!clean) return null;
  return `${TEAM_SCORE_NAME_MODE_STORAGE_PREFIX}${clean}`;
}

export function normalizeScoreTeamNameMode(
  raw: unknown,
  fallback: ScoreTeamNameDisplayMode = "organization"
): ScoreTeamNameDisplayMode {
  if (raw === "organization" || raw === "squad") {
    return raw;
  }
  return fallback;
}

/**
 * チーム別の「スコア表示の自チーム名モード」を取得する（デフォルトは必ず `"organization"` = チーム名）
 */
export function loadTeamScoreNameDisplayMode(
  teamId?: string | null,
  cloudFallback?: ScoreTeamNameDisplayMode | null
): ScoreTeamNameDisplayMode {
  const safeFallback = normalizeScoreTeamNameMode(cloudFallback, "organization");
  if (typeof window === "undefined") {
    return safeFallback;
  }
  try {
    const key = buildTeamScoreNameModeKey(teamId);
    if (!key) return safeFallback;
    const stored = localStorage.getItem(key);
    if (stored === "organization" || stored === "squad") {
      return stored;
    }
    return safeFallback;
  } catch {
    return safeFallback;
  }
}

/**
 * チーム別の「スコア表示の自チーム名モード」を保存し、必要に応じて全画面へ即時変更イベントを発火する
 */
export function saveTeamScoreNameDisplayMode(
  teamId: string | null | undefined,
  mode: ScoreTeamNameDisplayMode | null,
  emitEvent = true
): void {
  if (typeof window === "undefined") return;
  try {
    const key = buildTeamScoreNameModeKey(teamId);
    if (!key) return;
    if (!mode) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, normalizeScoreTeamNameMode(mode, "organization"));
    }
    if (emitEvent) {
      window.dispatchEvent(
        new CustomEvent(LIFF_SCORE_SETTINGS_CHANGE_EVENT, {
          detail: { teamId: (teamId || "").trim(), mode },
        })
      );
    }
  } catch {
    // ignore storage quota errors
  }
}

export interface ScoreTeamIdentitySource {
  id?: string | null;
  /** `organizations.name` = チーム名（クラブ・団体全体名） */
  orgName?: string | null;
  /** `teams.name` = 構成名（学年・階層・編成ごとの名称） */
  teamName?: string | null;
  shortName?: string | null;
  name?: string | null;
  scoreTeamNameMode?: ScoreTeamNameDisplayMode | null;
}

/**
 * スコアボード・試合カード・清書スコアブック等に表示する自チーム名を決定する
 * ⚠️ 重要: 内部DBスキーマでは `organizations` (`orgName`) = 「チーム名」、`teams` (`teamName`) = 「構成名」であるため絶対に逆転させないこと。
 * デフォルトは `"organization"`（チーム名）を優先表示する。
 */
export function resolveScoreTeamDisplayName(
  team: ScoreTeamIdentitySource | null | undefined,
  modeOverride?: ScoreTeamNameDisplayMode | null,
  fallback = "自チーム"
): string {
  if (!team) return fallback;

  const effectiveMode: ScoreTeamNameDisplayMode = modeOverride
    ? normalizeScoreTeamNameMode(modeOverride, "organization")
    : loadTeamScoreNameDisplayMode(team.id, team.scoreTeamNameMode);

  // organizations.name = チーム名
  const orgLabel = (team.orgName || "").trim();
  // teams.name = 構成名（初期プレースホルダー文字列 "チームHUB" は除外）
  const rawSquadLabel = (team.teamName || "").trim();
  const squadLabel = rawSquadLabel && rawSquadLabel !== "チームHUB" ? rawSquadLabel : "";
  const rawFullName = (team.name || "").trim();

  if (effectiveMode === "squad") {
    return squadLabel || orgLabel || rawFullName || fallback;
  }
  return orgLabel || squadLabel || rawFullName || fallback;
}


