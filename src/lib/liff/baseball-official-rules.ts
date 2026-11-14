// filepath: src/lib/liff/baseball-official-rules.ts
import type {
  AdvanceMethodCode,
  CanonicalAtBatResult,
  ScorebookV2Advance,
  ScorebookV2AtBat,
} from "@/types/scorebook-v2";

export type OccupiedBaseKey = "1B" | "2B" | "3B";

export type DroppedThirdStrikeReachKind =
  | "wp"
  | "pb"
  | "throwing_error"
  | "receiving_error";

export interface DroppedThirdStrikeClassification {
  kind: DroppedThirdStrikeReachKind;
  errorPos: string | null;
  assistPos: string | null;
}

/**
 * 振り逃げ出塁（dropped_third_strike）の内訳（暴投 WP［標準初期値］ / 捕逸 PB / 悪送球エラー / 捕球落球エラー）を判定する。
 * 公認野球規則 9.12(f)(1), 9.13(a), 9.16(a) 準拠：
 * - 通常の振り逃げは暴投または捕逸であり、失策（E）は記録しない。
 * - 旧データが機械的に保持していた初期値 "K-E2"（ラベルに失策・悪送球の明示がないもの）は標準の暴投扱い（"wp"）として扱う。
 */
export function classifyDroppedThirdStrikeReach(
  battedDirection?: string | null,
  resultLabel?: string | null
): DroppedThirdStrikeClassification {
  const dir = (battedDirection || "").trim();
  const label = (resultLabel || "").trim();
  const combined = `${dir} ${label}`;

  // 1. 送球を受けた野手の捕球落球エラー（例: "K 2-3E", "K 2-E3", "2-3E", "一落球失策"）
  const recvChainMatch = dir.match(
    /(?:K\s*)?([1-9])\s*-\s*(?:E\s*([1-9])|([1-9])\s*E)\b/i
  );
  if (recvChainMatch) {
    const assistPos = recvChainMatch[1] || "2";
    const errorPos = recvChainMatch[2] || recvChainMatch[3] || "3";
    return {
      kind: "receiving_error",
      errorPos,
      assistPos,
    };
  }
  if (/落球失策|一失|一塁手失策/.test(label)) {
    return {
      kind: "receiving_error",
      errorPos: "3",
      assistPos: "2",
    };
  }

  // 2. 悪送球エラー（例: "K 2E-3", "2E-3", ラベルに「悪送球」「送球失策」「捕失」等がある場合）
  const throwChainMatch = dir.match(/(?:K\s*)?([1-9])\s*E\s*-\s*[1-9]/i);
  if (throwChainMatch) {
    return {
      kind: "throwing_error",
      errorPos: throwChainMatch[1] || "2",
      assistPos: null,
    };
  }

  const isLegacyMechanicalDefault =
    /^K\s*-\s*E2$/i.test(dir) &&
    !/悪送球|失策|エラー|捕失|落球/.test(label);

  if (!isLegacyMechanicalDefault) {
    const explicitErrPos = dir.match(/(?:^|\s|K\s*-?\s*)(?:([1-9])E|E([1-9]))$/i);
    if (explicitErrPos || /悪送球|送球失策|捕失|捕手失策/.test(label)) {
      const pos = explicitErrPos?.[1] || explicitErrPos?.[2] || "2";
      return {
        kind: "throwing_error",
        errorPos: pos,
        assistPos: null,
      };
    }
  }

  // 3. 捕逸（パスボール）による振り逃げ
  if (/\bPB\b|K\s*PB|捕逸|パスボール/i.test(combined)) {
    return {
      kind: "pb",
      errorPos: null,
      assistPos: null,
    };
  }

  // 4. 標準デフォルト：暴投（ワイルドピッチ）扱い
  return {
    kind: "wp",
    errorPos: null,
    assistPos: null,
  };
}

/**
 * 過去データの機械的な `dropped_third_strike` + `battedDirection: "K-E2"`（失策明示なし）を
 * 標準の無失策・暴投表記（`battedDirection: "K WP"`）へ正規化する。
 */
export function normalizeLegacyDroppedThirdStrikeAtBat<
  T extends Pick<
    ScorebookV2AtBat,
    "resultCode" | "battedDirection" | "resultLabel"
  >
>(ab: T): T {
  if (ab.resultCode !== "dropped_third_strike") return ab;
  const dir = (ab.battedDirection || "").trim();
  const label = (ab.resultLabel || "").trim();
  if (/^K\s*-\s*E2$/i.test(dir) && !/悪送球|失策|エラー|捕失|落球/.test(label)) {
    const cls = classifyDroppedThirdStrikeReach(dir, label);
    const nextDir = cls.kind === "pb" ? "K PB" : "K WP";
    const nextLabel =
      !label || label === "振り逃げ出塁" || label === "振逃"
        ? cls.kind === "pb"
          ? "振り逃げ出塁 (捕逸)"
          : "振り逃げ出塁 (暴投)"
        : label;
    return {
      ...ab,
      battedDirection: nextDir,
      resultLabel: nextLabel,
    };
  }
  return ab;
}

/**
 * 公認野球規則 9.21 準拠の打率・出塁率・長打率フォーマット（小数第3位まで表示、10割は "1.000"）
 */
export function formatOfficialBaseballRate(
  numerator: number,
  denominator: number,
  zeroDenominatorFallback: ".---" | ".000" = ".---"
): string {
  if (denominator <= 0 || !Number.isFinite(numerator / denominator)) {
    return zeroDenominatorFallback;
  }
  const ratio = Math.max(0, numerator / denominator);
  const fixed = ratio.toFixed(3);
  if (ratio >= 1) {
    return fixed;
  }
  return fixed.startsWith("0.") ? fixed.slice(1) : fixed;
}

export interface ClassifiedAtBatResultMeta {
  effectiveResult: string;
  isUnfinishedRunnerOut: boolean;
  isWalk: boolean;
  isIntentionalWalk: boolean;
  isHbp: boolean;
  isSacBunt: boolean;
  isSacFly: boolean;
  isInterferenceReach: boolean;
  isInterferenceOut: boolean;
  isOfficialAtBat: boolean;
  isSingle: boolean;
  isDouble: boolean;
  isTriple: boolean;
  isHomeRun: boolean;
  isHit: boolean;
  isStrikeout: boolean;
  isDroppedThirdStrikeSafe: boolean;
  isDroppedThirdStrikeOut: boolean;
  isErrorReach: boolean;
  isFieldersChoiceReach: boolean;
  isDoublePlay: boolean;
  isTriplePlay: boolean;
  isAerialDoubleOrTriplePlay: boolean;
  isGroundedIntoDoublePlay: boolean;
  intrinsicBatterOuts: number;
}

/**
 * 飛球・ライナー併殺（ゴロ併殺ではない併殺）かどうかを判定する。
 * 公認野球規則 9.02(a)(16) ＆ 9.04(b)(1)：飛球・ライナー併殺は「併殺打（GDP）」に算入せず、三塁走者タッチアップ生還時は打点も記録される。
 */
export function isAerialMultiOutAtBat(
  resultCode?: string | null,
  battedDirection?: string | null,
  resultLabel?: string | null
): boolean {
  const rc = (resultCode || "").trim();
  const dir = (battedDirection || "").trim();
  const label = (resultLabel || "").trim();
  if (rc === "flyout" || rc === "sac_fly" || rc === "infield_fly" || rc === "lineout") {
    return true;
  }
  if (
    rc === "double_play" ||
    rc === "triple_play" ||
    /併殺|三重殺|ゲッツー|DP|TP/i.test(rc)
  ) {
    if (
      /飛|フライ|直|ライナー|邪飛|[⌒︵]/.test(label) ||
      /飛|フライ|直|ライナー|邪飛|[⌒︵]/.test(rc) ||
      /^(?:[⌒︵])?[1-9][FL](?:-[1-9])+/i.test(dir) ||
      /^[789]-[1-9]/.test(dir)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * DB上の `at_bats.result`（英語正規コード・日本語表記の両対応）および任意のスナップショット打席から
 * 公認野球規則に完全準拠した打席分類メタデータを返す。
 */
export function classifyAtBatResultToken(
  rawDbResult: string | null | undefined,
  snapAb?: Pick<
    ScorebookV2AtBat,
    "resultCode" | "battedDirection" | "resultLabel" | "outsInPlay"
  > | null
): ClassifiedAtBatResultMeta {
  const rawTrimmed = (rawDbResult || "").trim();
  const effective =
    snapAb?.resultCode &&
    (!rawTrimmed ||
      (rawTrimmed === "fc" && snapAb.resultCode !== "fc") ||
      (rawTrimmed === "flyout" && snapAb.resultCode === "infield_fly") ||
      (rawTrimmed === "flyout" && snapAb.resultCode === "sac_fly"))
      ? snapAb.resultCode
      : rawTrimmed;

  const dir = (snapAb?.battedDirection || "").trim();
  const label = (snapAb?.resultLabel || "").trim();

  const isUnfinishedRunnerOut =
    !effective ||
    effective === "other" ||
    effective === "runner_out" ||
    effective.includes("途中断") ||
    /^(?:走塁死|盗塁死|盗塁刺|牽制死|アピールアウト)$/.test(effective);

  if (isUnfinishedRunnerOut) {
    return {
      effectiveResult: effective || "other",
      isUnfinishedRunnerOut: true,
      isWalk: false,
      isIntentionalWalk: false,
      isHbp: false,
      isSacBunt: false,
      isSacFly: false,
      isInterferenceReach: false,
      isInterferenceOut: false,
      isOfficialAtBat: false,
      isSingle: false,
      isDouble: false,
      isTriple: false,
      isHomeRun: false,
      isHit: false,
      isStrikeout: false,
      isDroppedThirdStrikeSafe: false,
      isDroppedThirdStrikeOut: false,
      isErrorReach: false,
      isFieldersChoiceReach: false,
      isDoublePlay: false,
      isTriplePlay: false,
      isAerialDoubleOrTriplePlay: false,
      isGroundedIntoDoublePlay: false,
      intrinsicBatterOuts: 0,
    };
  }

  // 「犠牲フライ」が「犠」を含み「飛」を含まないため、必ず犠飛を先に判定する
  const isSacFly =
    effective === "sac_fly" ||
    /\bSF\b/i.test(effective) ||
    effective.includes("犠飛") ||
    effective.includes("犠牲フライ");

  const isSacBunt =
    !isSacFly &&
    (effective === "sac_bunt" ||
      /\b(?:SH|SAC)\b/i.test(effective) ||
      effective.includes("犠打") ||
      effective.includes("送りバント") ||
      effective.includes("スクイズ") ||
      effective.includes("犠"));

  const isIntentionalWalk =
    effective === "intentional_walk" ||
    /\bIBB\b/i.test(effective) ||
    effective.includes("敬遠");

  const isWalk =
    isIntentionalWalk ||
    effective === "walk" ||
    /\bBB\b/i.test(effective) ||
    effective.includes("四球");

  // "本塁(HP)" 等との部分一致衝突を避けるため "HP" は単独トークンのみ死球扱いとする
  const isHbp =
    effective === "hit_by_pitch" ||
    /\b(?:HBP|DB)\b/i.test(effective) ||
    /^HP$/i.test(effective) ||
    effective.includes("死球") ||
    effective.includes("デッドボール");

  const isInterferenceOut =
    effective === "interference_out" || effective.includes("守備妨害");

  const isInterferenceReach =
    !isInterferenceOut &&
    (effective === "interference" ||
      /^INT[1-9]?$/i.test(effective) ||
      /\bCI\b/i.test(effective) ||
      effective.includes("打撃妨害") ||
      effective.includes("打妨"));

  const isHomeRun =
    effective === "home_run" ||
    /\b(?:HR|RHR)\b/i.test(effective) ||
    effective.includes("本塁打") ||
    effective.includes("ホームラン");

  const isTriple =
    !isHomeRun &&
    (effective === "triple" ||
      /\b3B\b/i.test(effective) ||
      effective.includes("三塁打") ||
      effective.includes("３塁打"));

  const isDouble =
    !isHomeRun &&
    !isTriple &&
    (effective === "double" ||
      /\b2B\b/i.test(effective) ||
      effective.includes("二塁打") ||
      effective.includes("２塁打"));

  const isSingle =
    !isHomeRun &&
    !isTriple &&
    !isDouble &&
    (effective === "single" ||
      /\b1B\b/i.test(effective) ||
      effective.includes("単打") ||
      effective.includes("内野安打") ||
      effective.includes("安打") ||
      effective.includes("ヒット") ||
      (effective.includes("安") && !effective.includes("不安")));

  const isHit = isSingle || isDouble || isTriple || isHomeRun;

  const isDroppedThirdStrikeOut =
    effective === "dropped_third_strike_out" ||
    (effective.includes("振逃") &&
      (effective.includes("アウト") || effective.includes("死"))) ||
    (effective.includes("振り逃げ") &&
      (effective.includes("アウト") || effective.includes("死")));

  const isDroppedThirdStrikeSafe =
    !isDroppedThirdStrikeOut &&
    (effective === "dropped_third_strike" ||
      effective.includes("振逃") ||
      effective.includes("振り逃げ"));

  // "BK"(ボーク) や "KO" との誤一致を防ぐため K は境界一致のみ判定
  const isStrikeout =
    effective === "strikeout" ||
    isDroppedThirdStrikeSafe ||
    isDroppedThirdStrikeOut ||
    /^(?:K|SO|Ⓚ|ꓘ)(?:[\s\-]|$)/i.test(effective) ||
    effective.includes("三振") ||
    effective.includes("スリーバント失敗");

  const isTriplePlay =
    effective === "triple_play" ||
    /\bTP\b/i.test(effective) ||
    effective.includes("三重殺") ||
    effective.includes("トリプルプレー");

  const isDoublePlay =
    !isTriplePlay &&
    (effective === "double_play" ||
      /\bDP\b/i.test(effective) ||
      effective.includes("併殺") ||
      effective.includes("ゲッツー") ||
      effective.includes("ダブルプレー"));

  const isAerialDp =
    (isDoublePlay || isTriplePlay) &&
    isAerialMultiOutAtBat(effective, dir, label);

  const isStrikeoutDp =
    (isDoublePlay || isTriplePlay) &&
    (/三振|[KS]O?\s*2-[465]/i.test(label) || /^K/i.test(dir));

  const isGroundedIntoDoublePlay =
    (isDoublePlay || isTriplePlay) && !isAerialDp && !isStrikeoutDp;

  // 安打＋送球失策（例: "右前安打+E9"）を失策出塁と誤認しないよう !isHit を徹底
  const isErrorReach =
    !isHit &&
    !isWalk &&
    !isHbp &&
    !isSacBunt &&
    !isSacFly &&
    !isInterferenceReach &&
    !isDroppedThirdStrikeSafe &&
    (effective === "error" ||
      /^(?:E[1-9]|[1-9]E(?:-[1-9])?)$/i.test(effective) ||
      effective.includes("失策") ||
      effective.includes("敵失") ||
      effective.includes("エラー") ||
      /[投捕一二三遊左中右]失/.test(effective));

  const isFieldersChoiceReach =
    !isHit &&
    !isErrorReach &&
    (effective === "fc" ||
      /^FC[1-9]/i.test(effective) ||
      effective.includes("野選") ||
      effective.includes("フィルダースチョイス"));

  const isOfficialAtBat =
    !isWalk &&
    !isHbp &&
    !isSacBunt &&
    !isSacFly &&
    !isInterferenceReach;

  let intrinsicBatterOuts = 0;
  if (isTriplePlay) {
    intrinsicBatterOuts = 3;
  } else if (isDoublePlay) {
    intrinsicBatterOuts = 2;
  } else if (
    !isHit &&
    !isWalk &&
    !isHbp &&
    !isInterferenceReach &&
    !isDroppedThirdStrikeSafe &&
    !isErrorReach &&
    !isFieldersChoiceReach &&
    (effective === "groundout" ||
      effective === "flyout" ||
      effective === "lineout" ||
      effective === "infield_fly" ||
      effective === "strikeout" ||
      isDroppedThirdStrikeOut ||
      isSacBunt ||
      isSacFly ||
      isInterferenceOut ||
      effective.includes("ゴロ") ||
      effective.includes("フライ") ||
      effective.includes("ライナー") ||
      effective.includes("邪飛") ||
      effective.includes("直") ||
      effective.includes("飛") ||
      effective.includes("封") ||
      effective.includes("アウト") ||
      isStrikeout ||
      /^[1-9](?:-[1-9])+$/.test(effective) ||
      /^[1-9][FLABCH]$/i.test(effective))
  ) {
    intrinsicBatterOuts = 1;
  }

  return {
    effectiveResult: effective,
    isUnfinishedRunnerOut: false,
    isWalk,
    isIntentionalWalk,
    isHbp,
    isSacBunt,
    isSacFly,
    isInterferenceReach,
    isInterferenceOut,
    isOfficialAtBat,
    isSingle,
    isDouble,
    isTriple,
    isHomeRun,
    isHit,
    isStrikeout,
    isDroppedThirdStrikeSafe,
    isDroppedThirdStrikeOut,
    isErrorReach,
    isFieldersChoiceReach,
    isDoublePlay,
    isTriplePlay,
    isAerialDoubleOrTriplePlay: isAerialDp,
    isGroundedIntoDoublePlay,
    intrinsicBatterOuts,
  };
}

/**
 * 公認野球規則 9.07(d) 準拠：
 * 重盗・三重盗において、同一投球（または同一打席投球間）でいずれか1人の走者が盗塁刺（caught_stealing / steal+isOut）
 * となった場合、同じタイミングで進塁した他の走者には盗塁（SB）を記録しない。
 */
export function hasCompanionCaughtStealingOnSameStealAttempt(
  targetMove: Pick<ScorebookV2Advance, "method" | "isOut" | "pitchNumber">,
  allAtBatMoves: ReadonlyArray<
    Pick<ScorebookV2Advance, "from" | "method" | "isOut" | "pitchNumber">
  >
): boolean {
  if (targetMove.isOut || targetMove.method !== "steal") {
    return false;
  }
  const targetPitch =
    typeof targetMove.pitchNumber === "number" && targetMove.pitchNumber >= 1
      ? targetMove.pitchNumber
      : null;

  return allAtBatMoves.some((other) => {
    if (other === targetMove || other.from === "BAT") return false;
    const isCs =
      other.method === "caught_stealing" ||
      (other.isOut && other.method === "steal");
    if (!isCs) return false;
    const otherPitch =
      typeof other.pitchNumber === "number" && other.pitchNumber >= 1
        ? other.pitchNumber
        : null;
    if (targetPitch !== null && otherPitch !== null) {
      return targetPitch === otherPitch;
    }
    return true;
  });
}

export interface FieldingPlayCredits {
  putouts: string[];
  assists: string[];
  errors: string[];
  teamErrorCount: number;
}

function isNonBattedRunnerOutAdvance(adv: ScorebookV2Advance): boolean {
  if (!adv.isOut || adv.from === "BAT") return false;
  return (
    adv.method === "caught_stealing" ||
    adv.method === "steal" ||
    adv.method === "pickoff_out" ||
    adv.method === "appeal_out" ||
    adv.method === "interference_out" ||
    adv.method === "out_on_base"
  );
}

/**
 * 1打席（＋付随する投球間盗塁死・牽制死・悪送球等）から守備側野手（"1"〜"9"）の
 * 刺殺（PO）・捕殺（A）・失策（E）およびチーム失策数を公認野球規則 9.09〜9.12 に従って抽出する。
 */
export function extractFieldingCreditsForAtBat(
  rawAb: ScorebookV2AtBat
): FieldingPlayCredits {
  const ab = normalizeLegacyDroppedThirdStrikeAtBat(rawAb);
  const putouts: string[] = [];
  const assists: string[] = [];
  const errors: string[] = [];

  const rawDir = (ab.battedDirection || "").trim().toUpperCase();
  const label = (ab.resultLabel || "").trim();
  const rc = ab.resultCode;
  const advances = Array.isArray(ab.advances) ? ab.advances : [];

  // 1) 投球間・走塁上の非打球アウト（盗塁死・牽制死等）の刺殺・捕殺を抽出
  let nonBattedRunnerOutsCount = 0;
  for (const adv of advances) {
    if (!isNonBattedRunnerOutAdvance(adv)) continue;
    nonBattedRunnerOutsCount += 1;
    if (adv.method === "caught_stealing" || adv.method === "steal") {
      if (adv.to === "2B") {
        assists.push("2");
        putouts.push("6");
      } else if (adv.to === "3B") {
        assists.push("2");
        putouts.push("5");
      } else if (adv.to === "HP") {
        putouts.push("2");
      } else {
        assists.push("2");
        putouts.push("3");
      }
    } else if (adv.method === "pickoff_out") {
      if (adv.from === "1B") {
        assists.push("1");
        putouts.push("3");
      } else if (adv.from === "2B") {
        assists.push("1");
        putouts.push("6");
      } else if (adv.from === "3B") {
        assists.push("1");
        putouts.push("5");
      }
    } else if (adv.method === "appeal_out") {
      const targetPos =
        adv.from === "1B" || adv.to === "1B"
          ? "3"
          : adv.from === "2B" || adv.to === "2B"
          ? "6"
          : adv.from === "3B" || adv.to === "3B"
          ? "5"
          : "2";
      putouts.push(targetPos);
    } else if (adv.method === "interference_out") {
      const targetPos =
        adv.to === "2B" ? "6" : adv.to === "3B" ? "5" : adv.to === "HP" ? "2" : "3";
      putouts.push(targetPos);
    }
  }

  const totalOutsInAtBat = Math.max(0, ab.outsInPlay || 0);
  const battedOutsRecorded =
    rc === "other"
      ? 0
      : Math.max(0, totalOutsInAtBat - nonBattedRunnerOutsCount);

  // 2) 打撃妨害（公認野球規則 9.12(c)：打撃妨害は捕手に失策1を記録）
  if (rc === "interference") {
    if (battedOutsRecorded === 0) {
      const intPosMatch = rawDir.match(/INT\s*([1-9])/i) || rawDir.match(/^([1-9])$/);
      errors.push(intPosMatch?.[1] || "2");
    }
    return {
      putouts,
      assists,
      errors,
      teamErrorCount: errors.length,
    };
  }

  // 3) 振り逃げ出塁（公認野球規則 9.12(f)(1), 9.10(a)(1)）
  if (rc === "dropped_third_strike") {
    const dts = classifyDroppedThirdStrikeReach(rawDir, label);
    if (dts.kind === "throwing_error" && dts.errorPos) {
      errors.push(dts.errorPos);
    } else if (dts.kind === "receiving_error") {
      if (dts.assistPos) assists.push(dts.assistPos);
      if (dts.errorPos) errors.push(dts.errorPos);
    }
    // 振り逃げとは別に同一打席内で悪送球進塁等があった場合のみ補完
    if (
      errors.length === 0 &&
      advances.some((a) => !a.isOut && a.method === "pickoff_error")
    ) {
      errors.push("1");
    }
    return {
      putouts,
      assists,
      errors,
      teamErrorCount: errors.length,
    };
  }

  // 4) 三振・振り逃げアウト（K / K 2-3）
  if (rc === "strikeout" || rc === "dropped_third_strike_out") {
    if (battedOutsRecorded > 0) {
      const chainMatch = rawDir.match(/([1-9])\s*-\s*([1-9])/);
      if (chainMatch && chainMatch[1] && chainMatch[2]) {
        assists.push(chainMatch[1]);
        putouts.push(chainMatch[2]);
      } else {
        putouts.push("2");
      }
    }
    if (advances.some((a) => !a.isOut && a.method === "pickoff_error")) {
      errors.push("1");
    } else if (
      advances.some((a) => !a.isOut && a.method === "error") &&
      errors.length === 0
    ) {
      errors.push("2");
    }
    return {
      putouts,
      assists,
      errors,
      teamErrorCount:
        errors.length > 0
          ? errors.length
          : advances.some((a) => !a.isOut && (a.method === "error" || a.method === "pickoff_error"))
          ? 1
          : 0,
    };
  }

  // 5) 打球の失策および送球捕球エラー時の捕殺・先行封殺刺殺（公認野球規則 9.10(a)(1), 9.12）
  const rawTokens = rawDir ? rawDir.split("-").map((t) => t.trim()).filter(Boolean) : [];
  const hasErrorInDir = rawTokens.some((t) => /E/i.test(t));

  if (hasErrorInDir || rc === "error") {
    if (hasErrorInDir) {
      const parsedTokens = rawTokens.map((tok) => {
        const digitMatch = tok.match(/([1-9])/);
        const pos = digitMatch ? digitMatch[1]! : "";
        const isErr = /E/i.test(tok);
        return { pos, isErr };
      }).filter((t) => t.pos.length === 1);

      let firstErrIdx = -1;
      parsedTokens.forEach((pt, idx) => {
        if (pt.isErr) {
          errors.push(pt.pos);
          if (firstErrIdx < 0) firstErrIdx = idx;
        }
      });

      // 公認野球規則 9.10(a)(1): 捕球ミス（6-3E や 6-4-3E）では、エラーした野手より前に正確送球した野手に捕殺（A）を記録
      // また 6-4-3E / 6-4E-3 で先行封殺アウト（battedOutsRecorded >= 1）が成立している場合は中継野手に刺殺（PO）も記録
      if (firstErrIdx > 0) {
        const creditedAssists = new Set<string>();
        for (let i = 0; i < firstErrIdx; i++) {
          const aPos = parsedTokens[i]!.pos;
          if (!creditedAssists.has(aPos)) {
            creditedAssists.add(aPos);
            assists.push(aPos);
          }
        }
        if (battedOutsRecorded >= 1) {
          // 6-4-3E (firstErrIdx=2 -> pivot=parsedTokens[1]="4") / 6-4E-3 (firstErrIdx=1 -> pivot=parsedTokens[1]="4")
          const forcePivotIdx =
            firstErrIdx >= 2 ? firstErrIdx - 1 : firstErrIdx;
          const pivotPos = parsedTokens[forcePivotIdx]?.pos;
          if (pivotPos) {
            putouts.push(pivotPos);
          }
        }
      } else if (firstErrIdx === 0 && battedOutsRecorded >= 1 && parsedTokens.length >= 2) {
        const lastClean = parsedTokens[parsedTokens.length - 1];
        if (lastClean && !lastClean.isErr) {
          putouts.push(lastClean.pos);
        }
      }
    } else {
      // rc === "error" で battedDirection が単独数字 "6" 等、または日本語ラベル "遊失" 等
      const singlePos = rawDir.match(/([1-9])/);
      const jaPosMap: Record<string, string> = {
        投: "1",
        捕: "2",
        一: "3",
        二: "4",
        三: "5",
        遊: "6",
        左: "7",
        中: "8",
        右: "9",
      };
      let resolvedErrPos = singlePos?.[1] || "";
      if (!resolvedErrPos) {
        const jaMatch = label.match(/([投捕一二三遊左中右])(?:失|悪送球|エラー)/);
        if (jaMatch && jaPosMap[jaMatch[1]!]) {
          resolvedErrPos = jaPosMap[jaMatch[1]!];
        }
      }
      if (resolvedErrPos) {
        errors.push(resolvedErrPos);
      }
    }

    const hasAdvanceOnlyError =
      errors.length === 0 &&
      (rc === "error" ||
        advances.some(
          (a) =>
            !a.isOut && (a.method === "error" || a.method === "pickoff_error")
        ));

    return {
      putouts,
      assists,
      errors,
      teamErrorCount: Math.max(errors.length, hasAdvanceOnlyError ? 1 : 0),
    };
  }

  // 6) 打者安打・四死球等に付随する悪送球進塁・牽制悪送球（1つの失策で複数走者が進んでも失策数は1：規則 9.12(d) 原注）
  let extraPlayErrors = 0;
  if (advances.some((a) => !a.isOut && a.method === "pickoff_error")) {
    errors.push("1");
    extraPlayErrors = 1;
  } else if (advances.some((a) => !a.isOut && a.method === "error")) {
    extraPlayErrors = 1;
    const hitThrowPos = rawDir.match(/^([1-9])$/);
    if (hitThrowPos?.[1]) {
      errors.push(hitThrowPos[1]);
    }
  }

  // 7) 通常の打球アウト（ゴロ・飛球・ライナー・犠打・犠飛・封殺・併殺・三重殺）の刺殺・捕殺
  if (battedOutsRecorded > 0) {
    const segments = rawDir
      .split("-")
      .map((seg) => seg.replace(/[^1-9]/g, ""))
      .filter((seg) => seg.length === 1);

    if (segments.length >= 2) {
      const finalPos = segments[segments.length - 1]!;
      putouts.push(finalPos);

      if (battedOutsRecorded >= 2) {
        const dpPivotPos =
          segments.length >= 3 ? segments[segments.length - 2]! : segments[0]!;
        putouts.push(dpPivotPos);
      }
      if (battedOutsRecorded >= 3) {
        const tpFirstPos =
          segments.length >= 3 ? segments[segments.length - 3]! : segments[0]!;
        putouts.push(tpFirstPos);
      }

      const creditedAssistPositions = new Set<string>();
      for (let i = 0; i < segments.length - 1; i++) {
        const aPos = segments[i]!;
        if (segments.length === 2 && aPos === finalPos) continue;
        if (creditedAssistPositions.has(aPos)) continue;
        creditedAssistPositions.add(aPos);
        assists.push(aPos);
      }
    } else if (
      segments.length === 1 &&
      (rc === "flyout" ||
        rc === "infield_fly" ||
        rc === "sac_fly" ||
        rc === "groundout" ||
        rc === "sac_bunt" ||
        rc === "double_play" ||
        rc === "triple_play" ||
        rc === "interference_out")
    ) {
      const soloPos = segments[0]!;
      for (let k = 0; k < battedOutsRecorded; k++) {
        putouts.push(soloPos);
      }
    }
  }

  return {
    putouts,
    assists,
    errors,
    teamErrorCount: Math.max(errors.length, extraPlayErrors),
  };
}

export interface HalfInningAdvanceEventInput {
  fromBase: 0 | 1 | 2 | 3;
  toBase: 1 | 2 | 3 | 4;
  isOut: boolean;
  reason: string;
}

export interface HalfInningAtBatPitchingInput {
  atBatId: string;
  pitcherKey: string;
  rawResult: string | null | undefined;
  runsInPlay?: number;
  snapAb?: Pick<
    ScorebookV2AtBat,
    | "resultCode"
    | "battedDirection"
    | "resultLabel"
    | "outsInPlay"
    | "runsInPlay"
    | "advances"
  > | null;
  advances: HalfInningAdvanceEventInput[];
}

export interface PitcherHalfInningCharge {
  outs: number;
  battersFaced: number;
  runs: number;
  earnedRuns: number;
  dtsWildPitches: number;
}

interface TrackedPitchingRunner {
  responsiblePitcherKey: string;
  isUnearnedOrigin: boolean;
}

function isPrePlayReason(reason: string): boolean {
  const low = reason.trim().toLowerCase();
  return (
    low === "steal" ||
    low === "caught_stealing" ||
    low === "wp" ||
    low === "pb" ||
    low === "balk" ||
    low === "pickoff_out" ||
    low === "pickoff_error" ||
    low === "indifference" ||
    low.includes("盗塁") ||
    low.includes("暴投") ||
    low.includes("捕逸") ||
    low.includes("ボーク") ||
    low.includes("牽制")
  );
}

function isUnearnedScoringReason(reason: string): boolean {
  const low = reason.trim().toLowerCase();
  return (
    low === "error" ||
    low === "pb" ||
    low === "pickoff_error" ||
    low === "tiebreak" ||
    low.includes("失策") ||
    low.includes("エラー") ||
    low.includes("捕逸") ||
    low.includes("タイブレーク")
  );
}

/**
 * 1ハーフイニング分の打席・走塁データから、公認野球規則 9.16（自責点・2死後失策・仮想3アウト・
 * タイブレーク配置走者非自責・救援登板時の前任責任走者［遺産走者］帰属）および正確な投手アウト数を算出する。
 */
export function evaluateHalfInningPitcherCharges(
  plays: ReadonlyArray<HalfInningAtBatPitchingInput>
): Map<string, PitcherHalfInningCharge> {
  const charges = new Map<string, PitcherHalfInningCharge>();
  const ensurePitcher = (pKey: string): PitcherHalfInningCharge => {
    let cur = charges.get(pKey);
    if (!cur) {
      cur = {
        outs: 0,
        battersFaced: 0,
        runs: 0,
        earnedRuns: 0,
        dtsWildPitches: 0,
      };
      charges.set(pKey, cur);
    }
    return cur;
  };

  const bases: Record<1 | 2 | 3, TrackedPitchingRunner | null> = {
    1: null,
    2: null,
    3: null,
  };

  let actualOuts = 0;
  let virtualErrorSavedOuts = 0;
  const firstPitcherKey = plays.find((p) => Boolean(p.pitcherKey))?.pitcherKey || "";

  for (const play of plays) {
    const pKey = play.pitcherKey || firstPitcherKey;
    const pCharge = pKey ? ensurePitcher(pKey) : null;
    const cls = classifyAtBatResultToken(play.rawResult, play.snapAb);

    if (!cls.isUnfinishedRunnerOut && pCharge) {
      pCharge.battersFaced += 1;
    }

    // A) タイブレーク開始走者の初期配置（常に非自責起点: isUnearnedOrigin = true）
    const snapAdvances = play.snapAb?.advances || [];
    for (const sAdv of snapAdvances) {
      if (
        sAdv.method === "tiebreak" &&
        !sAdv.isOut &&
        (sAdv.to === "1B" || sAdv.to === "2B" || sAdv.to === "3B")
      ) {
        const bNum: 1 | 2 | 3 =
          sAdv.to === "1B" ? 1 : sAdv.to === "2B" ? 2 : 3;
        if (!bases[bNum]) {
          bases[bNum] = {
            responsiblePitcherKey: firstPitcherKey || pKey,
            isUnearnedOrigin: true,
          };
        }
      }
    }
    for (const adv of play.advances) {
      if (
        adv.reason.toLowerCase() === "tiebreak" &&
        !adv.isOut &&
        (adv.toBase === 1 || adv.toBase === 2 || adv.toBase === 3)
      ) {
        if (!bases[adv.toBase]) {
          bases[adv.toBase] = {
            responsiblePitcherKey: firstPitcherKey || pKey,
            isUnearnedOrigin: true,
          };
        }
      }
    }

    const prePlayAdvs = play.advances.filter(
      (a) => a.reason.toLowerCase() !== "tiebreak" && a.fromBase > 0 && isPrePlayReason(a.reason)
    );
    const inPlayAdvs = play.advances.filter(
      (a) => a.reason.toLowerCase() !== "tiebreak" && !(a.fromBase > 0 && isPrePlayReason(a.reason))
    );

    // B) 投球間（盗塁・暴投・捕逸・ボーク・盗塁死・牽制死）の走者移動・得点・アウト処理
    let prePlayOuts = 0;
    let modeledRunsInPlay = 0;
    const sortedPre = [...prePlayAdvs].sort((a, b) => b.fromBase - a.fromBase);
    for (const pm of sortedPre) {
      const fromB = pm.fromBase as 1 | 2 | 3;
      const token: TrackedPitchingRunner = bases[fromB] || {
        responsiblePitcherKey: pKey,
        isUnearnedOrigin: false,
      };
      if (bases[fromB] === token) {
        bases[fromB] = null;
      }

      if (pm.isOut) {
        prePlayOuts += 1;
        actualOuts = Math.min(3, actualOuts + 1);
        if (pCharge) pCharge.outs += 1;
      } else if (pm.toBase === 4) {
        modeledRunsInPlay += 1;
        const respKey = token.responsiblePitcherKey || pKey;
        if (respKey) {
          const respCharge = ensurePitcher(respKey);
          respCharge.runs += 1;
          const isUnearned =
            token.isUnearnedOrigin ||
            isUnearnedScoringReason(pm.reason) ||
            (virtualErrorSavedOuts > 0 &&
              actualOuts + virtualErrorSavedOuts >= 3);
          if (!isUnearned) {
            respCharge.earnedRuns += 1;
          }
        }
      } else if (pm.toBase === 1 || pm.toBase === 2 || pm.toBase === 3) {
        bases[pm.toBase] = token;
      }
    }

    // C) 振り逃げ出塁の内訳判定（暴投WP＝自責・暴投+1 / 捕逸PB・エラー＝非自責・仮想アウト+1）
    let batterReachedUnearned = false;
    if (cls.isDroppedThirdStrikeSafe) {
      const dts = classifyDroppedThirdStrikeReach(
        play.snapAb?.battedDirection,
        play.snapAb?.resultLabel || play.rawResult
      );
      if (dts.kind === "wp") {
        if (pCharge) pCharge.dtsWildPitches += 1;
        batterReachedUnearned = false;
      } else {
        batterReachedUnearned = true;
        virtualErrorSavedOuts += 1;
      }
    } else if (cls.isErrorReach || cls.isInterferenceReach) {
      batterReachedUnearned = true;
      virtualErrorSavedOuts += 1;
    }

    // D) インプレーのアウト数確定（スナップショット outsInPlay 優先、なければ打者固有アウト＋非重複走塁アウト）
    let inPlayOuts = 0;
    if (play.snapAb && typeof play.snapAb.outsInPlay === "number") {
      inPlayOuts = Math.max(0, play.snapAb.outsInPlay - prePlayOuts);
    } else if (cls.isUnfinishedRunnerOut) {
      inPlayOuts = inPlayAdvs.filter((a) => a.isOut).length;
    } else if (cls.isDoublePlay || cls.isTriplePlay) {
      inPlayOuts = cls.intrinsicBatterOuts;
    } else if (cls.intrinsicBatterOuts > 0) {
      const extraNonForceRunnerOuts = inPlayAdvs.filter(
        (a) =>
          a.isOut &&
          a.fromBase > 0 &&
          a.reason !== "fc" &&
          !a.reason.includes("封")
      ).length;
      inPlayOuts = cls.intrinsicBatterOuts + extraNonForceRunnerOuts;
    } else {
      // 安打・四死球・失策・野選時の走塁アウト（打者走者の二塁タッチアウト fromBase===0 を含む）
      inPlayOuts = inPlayAdvs.filter((a) => a.isOut).length;
    }

    inPlayOuts = Math.min(3 - actualOuts, Math.max(0, inPlayOuts));
    if (pCharge && inPlayOuts > 0) {
      pCharge.outs += inPlayOuts;
    }

    // 公認野球規則 9.16(a): ゴロ・犠飛・併殺打等の打者打球アウトで仮想3アウトに達する場合、その間に生還した得点も非自責点となる
    const intrinsicOutCountForVirtual =
      cls.intrinsicBatterOuts > 0 ? Math.max(1, inPlayOuts) : 0;
    const virtualOutsDuringInPlayScoring =
      actualOuts + intrinsicOutCountForVirtual + virtualErrorSavedOuts;

    // E) インプレーでの先行走者アウト・進塁・生還と、野選封殺時の責任投手引き継ぎ（規則 9.16(g) ＆ タイブレーク規則）
    let retiredPrecedingRunnerToken: TrackedPitchingRunner | null = null;
    const sortedInPlayRunners = inPlayAdvs
      .filter((a) => a.fromBase > 0)
      .sort((a, b) => b.fromBase - a.fromBase);

    for (const rm of sortedInPlayRunners) {
      const fromB = rm.fromBase as 1 | 2 | 3;
      const token: TrackedPitchingRunner = bases[fromB] || {
        responsiblePitcherKey: pKey,
        isUnearnedOrigin: false,
      };
      if (bases[fromB] === token) {
        bases[fromB] = null;
      }

      if (rm.isOut) {
        if (!retiredPrecedingRunnerToken) {
          retiredPrecedingRunnerToken = token;
        }
      } else if (rm.toBase === 4) {
        modeledRunsInPlay += 1;
        const respKey = token.responsiblePitcherKey || pKey;
        if (respKey) {
          const respCharge = ensurePitcher(respKey);
          respCharge.runs += 1;
          const isUnearned =
            token.isUnearnedOrigin ||
            cls.isErrorReach ||
            isUnearnedScoringReason(rm.reason) ||
            (virtualErrorSavedOuts > 0 && virtualOutsDuringInPlayScoring >= 3);
          if (!isUnearned) {
            respCharge.earnedRuns += 1;
          }
        }
      } else if (rm.toBase === 1 || rm.toBase === 2 || rm.toBase === 3) {
        bases[rm.toBase] = token;
      }
    }

    // 明示的走者アウト行がない封殺ゴロ（6-4 等）でも塁上の先行走者を入れ替え、前任責任投手を継承する
    const isImplicitForceSwap =
      sortedInPlayRunners.filter((r) => r.isOut).length === 0 &&
      !cls.isHit &&
      !cls.isWalk &&
      !cls.isHbp &&
      (cls.isFieldersChoiceReach ||
        (cls.effectiveResult === "groundout" &&
          inPlayOuts === 1 &&
          Boolean(
            play.snapAb?.battedDirection &&
              /(?:-[2456]|[1-9][BCH])$/i.test(play.snapAb.battedDirection.trim())
          )));

    if (isImplicitForceSwap) {
      if (bases[1]) {
        retiredPrecedingRunnerToken = bases[1];
        bases[1] = null;
      } else if (bases[2]) {
        retiredPrecedingRunnerToken = bases[2];
        bases[2] = null;
      } else if (bases[3]) {
        retiredPrecedingRunnerToken = bases[3];
        bases[3] = null;
      }
    }

    // F) 打者自身の出塁・本塁打生還
    const batterAdvs = inPlayAdvs.filter((a) => a.fromBase === 0);
    const batterScoredExplicitly = batterAdvs.some(
      (a) => !a.isOut && a.toBase === 4
    );
    const batterOutExplicitly = batterAdvs.some((a) => a.isOut);

    // 封殺ゴロ（6-4等）や野選で先行走者と入れ替わって打者が一塁に残った場合は前任責任投手を継承（規則 9.16(g) 例）
    const batterToken: TrackedPitchingRunner =
      retiredPrecedingRunnerToken &&
      !cls.isHit &&
      !cls.isWalk &&
      !cls.isHbp &&
      !cls.isInterferenceReach &&
      !cls.isDroppedThirdStrikeSafe
        ? {
            responsiblePitcherKey:
              retiredPrecedingRunnerToken.responsiblePitcherKey || pKey,
            isUnearnedOrigin:
              retiredPrecedingRunnerToken.isUnearnedOrigin ||
              batterReachedUnearned,
          }
        : {
            responsiblePitcherKey: pKey,
            isUnearnedOrigin: batterReachedUnearned,
          };

    if (cls.isHomeRun || batterScoredExplicitly) {
      // 本塁打で進塁明細行が省略されている場合は塁上の先行走者全員を生還させる
      if (cls.isHomeRun && sortedInPlayRunners.length === 0) {
        for (const bNum of [3, 2, 1] as const) {
          const onBase = bases[bNum];
          if (!onBase) continue;
          bases[bNum] = null;
          modeledRunsInPlay += 1;
          const rKey = onBase.responsiblePitcherKey || pKey;
          if (rKey) {
            const rCharge = ensurePitcher(rKey);
            rCharge.runs += 1;
            const rUnearned =
              onBase.isUnearnedOrigin ||
              (virtualErrorSavedOuts > 0 && virtualOutsDuringInPlayScoring >= 3);
            if (!rUnearned) rCharge.earnedRuns += 1;
          }
        }
      }
      modeledRunsInPlay += 1;
      const batterRunReason =
        batterAdvs.find((a) => !a.isOut && a.toBase === 4)?.reason || "hit";
      const respKey = batterToken.responsiblePitcherKey || pKey;
      if (respKey) {
        const respCharge = ensurePitcher(respKey);
        respCharge.runs += 1;
        const isUnearned =
          batterToken.isUnearnedOrigin ||
          cls.isErrorReach ||
          isUnearnedScoringReason(batterRunReason) ||
          (virtualErrorSavedOuts > 0 && virtualOutsDuringInPlayScoring >= 3);
        if (!isUnearned) {
          respCharge.earnedRuns += 1;
        }
      }
    } else if (!batterOutExplicitly) {
      const explicitDest = batterAdvs.find(
        (a) => !a.isOut && (a.toBase === 1 || a.toBase === 2 || a.toBase === 3)
      )?.toBase as 1 | 2 | 3 | undefined;

      let destBase: 1 | 2 | 3 | null = explicitDest || null;
      if (!destBase) {
        if (cls.isTriple) destBase = 3;
        else if (cls.isDouble) destBase = 2;
        else if (
          cls.isSingle ||
          cls.isWalk ||
          cls.isHbp ||
          cls.isInterferenceReach ||
          cls.isDroppedThirdStrikeSafe ||
          cls.isErrorReach ||
          cls.isFieldersChoiceReach ||
          isImplicitForceSwap
        ) {
          // 四死球での自動押し出し進塁（明示的進塁行がない場合のみ補完）
          if (
            (cls.isWalk || cls.isHbp || cls.isInterferenceReach) &&
            sortedInPlayRunners.length === 0
          ) {
            if (bases[1] && bases[2] && bases[3]) {
              const pushed = bases[3];
              modeledRunsInPlay += 1;
              const respKey = pushed.responsiblePitcherKey || pKey;
              if (respKey) {
                const respCharge = ensurePitcher(respKey);
                respCharge.runs += 1;
                const isUnearned =
                  pushed.isUnearnedOrigin ||
                  (virtualErrorSavedOuts > 0 &&
                    actualOuts + virtualErrorSavedOuts >= 3);
                if (!isUnearned) respCharge.earnedRuns += 1;
              }
              bases[3] = bases[2];
              bases[2] = bases[1];
            } else if (bases[1] && bases[2]) {
              bases[3] = bases[2];
              bases[2] = bases[1];
            } else if (bases[1]) {
              bases[2] = bases[1];
            }
          }
          destBase = 1;
        }
      }

      // 進塁行が省略された旧データで runsInPlay / rbi のみ記録されている場合、先行走者から順に生還補完
      const expectedRunsPrePlace = Math.max(
        0,
        play.runsInPlay ?? play.snapAb?.runsInPlay ?? 0
      );
      if (expectedRunsPrePlace > modeledRunsInPlay) {
        let missing = expectedRunsPrePlace - modeledRunsInPlay;
        for (const bNum of [3, 2, 1] as const) {
          if (missing <= 0) break;
          const onBase = bases[bNum];
          if (!onBase) continue;
          bases[bNum] = null;
          missing -= 1;
          modeledRunsInPlay += 1;
          const rKey = onBase.responsiblePitcherKey || pKey;
          if (rKey) {
            const rCharge = ensurePitcher(rKey);
            rCharge.runs += 1;
            const rUnearned =
              onBase.isUnearnedOrigin ||
              cls.isErrorReach ||
              (virtualErrorSavedOuts > 0 && virtualOutsDuringInPlayScoring >= 3);
            if (!rUnearned) rCharge.earnedRuns += 1;
          }
        }
      }

      if (destBase) {
        if (bases[destBase] && destBase === 1) {
          if (!bases[2]) bases[2] = bases[1];
          else if (!bases[3]) bases[3] = bases[1];
        }
        bases[destBase] = batterToken;
      }
    }

    // それでも runsInPlay に未計上分が残る場合（走者アウト打席での生還省略等）の最終補完
    const expectedPlayRuns = Math.max(
      0,
      play.runsInPlay ?? play.snapAb?.runsInPlay ?? 0
    );
    if (expectedPlayRuns > modeledRunsInPlay) {
      let remaining = expectedPlayRuns - modeledRunsInPlay;
      for (const bNum of [3, 2, 1] as const) {
        if (remaining <= 0) break;
        const onBase = bases[bNum];
        if (!onBase) continue;
        bases[bNum] = null;
        remaining -= 1;
        modeledRunsInPlay += 1;
        const rKey = onBase.responsiblePitcherKey || pKey;
        if (rKey) {
          const rCharge = ensurePitcher(rKey);
          rCharge.runs += 1;
          const rUnearned =
            onBase.isUnearnedOrigin ||
            cls.isErrorReach ||
            (virtualErrorSavedOuts > 0 && virtualOutsDuringInPlayScoring >= 3);
          if (!rUnearned) rCharge.earnedRuns += 1;
        }
      }
      if (remaining > 0 && pCharge) {
        pCharge.runs += remaining;
        const fallbackUnearned =
          cls.isErrorReach ||
          (virtualErrorSavedOuts > 0 && virtualOutsDuringInPlayScoring >= 3);
        if (!fallbackUnearned) {
          pCharge.earnedRuns += remaining;
        }
      }
    }

    actualOuts = Math.min(3, actualOuts + inPlayOuts);
    if (actualOuts >= 3) {
      break;
    }
  }

  return charges;
}

/**
 * スナップショット形式の `ScorebookV2Advance` を `HalfInningAdvanceEventInput` へ変換する
 */
export function mapSnapshotAdvancesToPitchingEvents(
  advances: ReadonlyArray<ScorebookV2Advance> | undefined
): HalfInningAdvanceEventInput[] {
  if (!Array.isArray(advances)) return [];
  const baseToNum = (b: OccupiedBaseKey | "BAT"): 0 | 1 | 2 | 3 =>
    b === "BAT" ? 0 : b === "1B" ? 1 : b === "2B" ? 2 : 3;
  const toBaseNum = (b: OccupiedBaseKey | "HP"): 1 | 2 | 3 | 4 =>
    b === "1B" ? 1 : b === "2B" ? 2 : b === "3B" ? 3 : 4;

  return advances
    .filter((a) => !(a.from !== "BAT" && !a.isOut && a.from === a.to))
    .map((a) => ({
      fromBase: baseToNum(a.from),
      toBase: toBaseNum(a.to),
      isOut: Boolean(a.isOut),
      reason: a.method as AdvanceMethodCode,
    }));
}
