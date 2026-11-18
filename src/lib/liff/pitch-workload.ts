// filepath: src/lib/liff/pitch-workload.ts

/**
 * ⚾ 肩肘保護・リアルタイム球数制限 ＆ 連投ワークロード判定ヘルパー
 * - 学童野球新基準（1日70球上限：50球=注意 / 60球=交代準備 / 70球=上限到達）
 * - 中学軟式野球基準（1日100球上限：75球=注意 / 85球=交代準備 / 100球=上限到達）
 * - 大会別カスタム球数制限文字列（例: "1日70球以内", "85球制限", "制限なし"）からの自動数値抽出対応
 */

export type PitchAlertLevel = "none" | "caution" | "prepare" | "limit";

export interface PitchLimitSpec {
  /** null = 上限なし */
  limit: number | null;
  cautionAt: number | null;
  prepareAt: number | null;
  ruleLabel: string;
}

export interface PitchAlertEvaluation {
  level: PitchAlertLevel;
  pitches: number;
  limit: number | null;
  remaining: number | null;
  badgeText: string;
  bannerTitle: string;
  bannerDetail: string;
}

/**
 * 大会規定の球数制限テキスト（例: "1日70球以内（学童規定）", "100球", "制限なし"）から数値上限を抽出
 * - `"none"` = 明示的に「制限なし」と記載されている場合
 * - `number` = 20〜250球の数値が見つかった場合
 * - `"unset"` = 未設定・空欄の場合
 */
export function parseTournamentPitchLimitText(
  rawText: string | null | undefined
): { kind: "none" } | { kind: "limit"; value: number } | { kind: "unset" } {
  const clean = (rawText || "").trim();
  if (!clean) return { kind: "unset" };
  if (/制限なし|上限なし|無制限/u.test(clean)) {
    return { kind: "none" };
  }
  const normalized = clean.replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  );
  const ballMatch = normalized.match(/(\d{2,3})\s*球/);
  if (ballMatch) {
    const n = Number(ballMatch[1]);
    if (Number.isFinite(n) && n >= 20 && n <= 250) {
      return { kind: "limit", value: n };
    }
  }
  const plainMatch = normalized.match(/^(\d{2,3})$/);
  if (plainMatch) {
    const n = Number(plainMatch[1]);
    if (Number.isFinite(n) && n >= 20 && n <= 250) {
      return { kind: "limit", value: n };
    }
  }
  return { kind: "unset" };
}

export function buildThresholdsForLimit(
  limit: number | null,
  sourceLabel?: string
): PitchLimitSpec {
  if (!limit || limit <= 0) {
    return {
      limit: null,
      cautionAt: null,
      prepareAt: null,
      ruleLabel: sourceLabel || "制限なし",
    };
  }
  if (limit === 70) {
    return {
      limit: 70,
      cautionAt: 50,
      prepareAt: 60,
      ruleLabel: sourceLabel || "学童70球基準",
    };
  }
  if (limit === 100) {
    return {
      limit: 100,
      cautionAt: 75,
      prepareAt: 85,
      ruleLabel: sourceLabel || "中学100球基準",
    };
  }
  if (limit === 85) {
    return {
      limit: 85,
      cautionAt: 65,
      prepareAt: 75,
      ruleLabel: sourceLabel || "85球基準",
    };
  }
  return {
    limit,
    cautionAt: Math.max(1, limit - 20),
    prepareAt: Math.max(1, limit - 10),
    ruleLabel: sourceLabel || `${limit}球制限`,
  };
}

export function resolvePitchLimitSpec(params: {
  manualOverride?: number | "none" | null;
  tournamentPitchLimitRule?: string | null;
  tournamentCategory?: string | null;
  teamPitchCountLimit?: number | null;
  orgCategory?: string | null;
}): PitchLimitSpec {
  // 1. 速報画面での手動オーバーライド
  if (params.manualOverride === "none") {
    return buildThresholdsForLimit(null, "制限なし");
  }
  if (typeof params.manualOverride === "number" && params.manualOverride > 0) {
    return buildThresholdsForLimit(params.manualOverride);
  }

  // 2. 大会規定の球数制限テキスト
  const parsedTournament = parseTournamentPitchLimitText(
    params.tournamentPitchLimitRule
  );
  if (parsedTournament.kind === "none") {
    return buildThresholdsForLimit(null, "大会規定:制限なし");
  }
  if (parsedTournament.kind === "limit") {
    return buildThresholdsForLimit(
      parsedTournament.value,
      `大会規定:${parsedTournament.value}球`
    );
  }

  // 3. チームのスコア設定（settings/score）で明示設定された上限
  if (
    typeof params.teamPitchCountLimit === "number" &&
    params.teamPitchCountLimit > 0
  ) {
    return buildThresholdsForLimit(params.teamPitchCountLimit);
  }

  // 4. 大会カテゴリまたはクラブ（organizations.category）からの自動判定
  const cat = (
    params.tournamentCategory ||
    params.orgCategory ||
    ""
  ).toLowerCase();
  if (cat === "gakudou") {
    return buildThresholdsForLimit(70, "学童70球基準");
  }
  if (cat === "chugaku" || cat === "koukou") {
    return buildThresholdsForLimit(100, "100球基準");
  }
  if (cat === "shakaijin") {
    return buildThresholdsForLimit(null, "制限なし");
  }

  // デフォルトは最も保護優先度の高い学童70球基準を初期適用（ワンタップで100球/なしへ切替可）
  return buildThresholdsForLimit(70, "70球基準");
}

export function evaluatePitchAlert(
  pitches: number,
  spec: PitchLimitSpec,
  pitcherName?: string
): PitchAlertEvaluation {
  const safePitches = Math.max(0, Math.trunc(pitches || 0));
  const who = pitcherName?.trim() ? `${pitcherName.trim()}投手 ` : "";

  if (!spec.limit) {
    return {
      level: "none",
      pitches: safePitches,
      limit: null,
      remaining: null,
      badgeText: `${safePitches}球`,
      bannerTitle: "",
      bannerDetail: "",
    };
  }

  const remaining = Math.max(0, spec.limit - safePitches);

  if (safePitches >= spec.limit) {
    return {
      level: "limit",
      pitches: safePitches,
      limit: spec.limit,
      remaining: 0,
      badgeText: `${safePitches}/${spec.limit}球 (上限)`,
      bannerTitle: `🚨 ${who}${safePitches}球到達（上限${spec.limit}球）`,
      bannerDetail:
        "規定球数に到達しました。完了打者までで速やかに投手交代を行ってください。",
    };
  }

  if (spec.prepareAt !== null && safePitches >= spec.prepareAt) {
    return {
      level: "prepare",
      pitches: safePitches,
      limit: spec.limit,
      remaining,
      badgeText: `${safePitches}/${spec.limit}球 (残${remaining})`,
      bannerTitle: `⚠️ ${who}${safePitches}球（交代準備・残り${remaining}球）`,
      bannerDetail: `上限${spec.limit}球まで残り${remaining}球です。次投手のキャッチボール準備を推奨します。`,
    };
  }

  if (spec.cautionAt !== null && safePitches >= spec.cautionAt) {
    return {
      level: "caution",
      pitches: safePitches,
      limit: spec.limit,
      remaining,
      badgeText: `${safePitches}/${spec.limit}球 (残${remaining})`,
      bannerTitle: `⚡ ${who}${safePitches}球通過（注意・残り${remaining}球）`,
      bannerDetail: `上限${spec.limit}球まで残り${remaining}球です。球数ペースにご注意ください。`,
    };
  }

  return {
    level: "none",
    pitches: safePitches,
    limit: spec.limit,
    remaining,
    badgeText: `${safePitches}/${spec.limit}球`,
    bannerTitle: "",
    bannerDetail: "",
  };
}

export interface PreMatchPitchWorkloadWarning {
  severity: "none" | "caution" | "high";
  shortBadge: string;
  message: string;
}

export function evaluatePreMatchWorkloadWarning(params: {
  yesterdayPitches?: number;
  last7DaysPitches?: number;
  dailyLimit?: number | null;
}): PreMatchPitchWorkloadWarning {
  const yPitches = Math.max(0, Math.trunc(params.yesterdayPitches || 0));
  const w7Pitches = Math.max(0, Math.trunc(params.last7DaysPitches || 0));
  const limit = params.dailyLimit && params.dailyLimit > 0 ? params.dailyLimit : 70;
  const weeklyHeavy = limit <= 70 ? 140 : 200;
  const weeklyCaution = limit <= 70 ? 100 : 150;

  if (yPitches >= limit || w7Pitches >= weeklyHeavy) {
    return {
      severity: "high",
      shortBadge:
        yPitches >= limit
          ? `連投警戒:前日${yPitches}球`
          : `7日計${w7Pitches}球(過多)`,
      message:
        yPitches >= limit
          ? `前日に${yPitches}球（上限水準）を投球しています。肩肘保護のため本日の登板回避を強く推奨します。`
          : `直近7日間で計${w7Pitches}球を投球しています。疲労蓄積に十分ご注意ください。`,
    };
  }

  if (yPitches >= 30 || w7Pitches >= weeklyCaution) {
    return {
      severity: "caution",
      shortBadge:
        yPitches > 0 ? `前日${yPitches}球` : `7日計${w7Pitches}球`,
      message:
        yPitches > 0
          ? `前日に${yPitches}球を投球しています（直近7日計${w7Pitches}球）。連投時のイニング・球数制限にご注意ください。`
          : `直近7日間で計${w7Pitches}球を投球しています。`,
    };
  }

  return {
    severity: "none",
    shortBadge: "",
    message: "",
  };
}
