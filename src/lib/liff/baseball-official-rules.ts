// filepath: src/lib/liff/baseball-official-rules.ts
import type {
  AdvanceMethodCode,
  AppealOutKind,
  CanonicalAtBatResult,
  MidAtBatPriorBatterInfo,
  MidAtBatPriorPitcherInfo,
  OfficialPitcherDecision,
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

  const applyChainPutoutAndAssists = (rawChain: string | undefined): boolean => {
    if (!rawChain) return false;
    const chainDigits = rawChain
      .replace(/[０-９]/g, (ch) =>
        String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
      )
      .split(/[^1-9]+/)
      .filter((d) => /^[1-9]$/.test(d));
    if (chainDigits.length === 0) return false;
    const finalPos = chainDigits[chainDigits.length - 1]!;
    putouts.push(finalPos);
    if (chainDigits.length >= 2) {
      const seenA = new Set<string>();
      for (let i = 0; i < chainDigits.length - 1; i++) {
        const aPos = chainDigits[i]!;
        if (chainDigits.length === 2 && aPos === finalPos) continue;
        if (seenA.has(aPos)) continue;
        seenA.add(aPos);
        assists.push(aPos);
      }
    }
    return true;
  };

  const dirSegments = rawDir
    .split("-")
    .map((seg) => seg.replace(/[^1-9]/g, ""))
    .filter((seg) => seg.length === 1);
  const compactDirChain = dirSegments.join("-");
  const isOutfieldGapDir =
    compactDirChain === "7-8" || compactDirChain === "8-9";
  const isHitResult =
    rc === "single" ||
    rc === "double" ||
    rc === "triple" ||
    rc === "home_run";

  // 1) 投球間・走塁上の非打球アウト（盗塁死・牽制死等）の刺殺・捕殺を抽出
  let nonBattedRunnerOutsCount = 0;
  for (const adv of advances) {
    if (!isNonBattedRunnerOutAdvance(adv)) continue;
    nonBattedRunnerOutsCount += 1;
    if (applyChainPutoutAndAssists(adv.throwChain)) {
      continue;
    }
    if (
      adv.method === "out_on_base" &&
      isHitResult &&
      dirSegments.length >= 2 &&
      !isOutfieldGapDir
    ) {
      applyChainPutoutAndAssists(compactDirChain);
      continue;
    }
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
      const explicitErrAdv = advances.find(
        (a) => !a.isOut && a.method === "error" && a.throwChain
      );
      const errDigit = explicitErrAdv?.throwChain?.match(/([1-9])/);
      errors.push(errDigit?.[1] || "2");
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
    const pickErrAdv = advances.find(
      (a) => !a.isOut && a.method === "pickoff_error" && a.throwChain
    );
    const pickErrDigit = pickErrAdv?.throwChain?.match(/([1-9])/);
    errors.push(pickErrDigit?.[1] || "1");
    extraPlayErrors = 1;
  } else if (advances.some((a) => !a.isOut && a.method === "error")) {
    extraPlayErrors = 1;
    const explicitErrAdv = advances.find(
      (a) => !a.isOut && a.method === "error" && a.throwChain
    );
    const explicitErrDigit = explicitErrAdv?.throwChain?.match(/([1-9])/);
    const hitThrowPos = rawDir.match(/^([1-9])$/);
    if (explicitErrDigit?.[1]) {
      errors.push(explicitErrDigit[1]);
    } else if (hitThrowPos?.[1]) {
      errors.push(hitThrowPos[1]);
    }
  }

  // 7) 通常の打球アウトおよび走塁死送球中継（8-6TO / ￣6 + 6-3TO 等）の刺殺・捕殺（公認野球規則 9.09, 9.10）
  if (battedOutsRecorded > 0) {
    const explicitInPlayOutChains = advances
      .filter(
        (adv) =>
          adv.isOut && !isNonBattedRunnerOutAdvance(adv) && Boolean(adv.throwChain)
      )
      .map((adv) =>
        (adv.throwChain || "")
          .replace(/[０-９]/g, (ch) =>
            String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
          )
          .split(/[^1-9]+/)
          .filter((d) => /^[1-9]$/.test(d))
          .join("-")
      )
      .filter((c) => c.length > 0);

    if (dirSegments.length >= 2 && !isOutfieldGapDir) {
      const extraRunnerChains = explicitInPlayOutChains.filter(
        (chain) => !compactDirChain.includes(chain)
      );
      const dirOutsCount = Math.max(
        1,
        battedOutsRecorded - extraRunnerChains.length
      );
      const finalPos = dirSegments[dirSegments.length - 1]!;
      putouts.push(finalPos);

      if (dirOutsCount >= 2) {
        const dpPivotPos =
          dirSegments.length >= 3
            ? dirSegments[dirSegments.length - 2]!
            : dirSegments[0]!;
        putouts.push(dpPivotPos);
      }
      if (dirOutsCount >= 3) {
        const tpFirstPos =
          dirSegments.length >= 3
            ? dirSegments[dirSegments.length - 3]!
            : dirSegments[0]!;
        putouts.push(tpFirstPos);
      }

      const creditedAssistPositions = new Set<string>();
      for (let i = 0; i < dirSegments.length - 1; i++) {
        const aPos = dirSegments[i]!;
        if (dirSegments.length === 2 && aPos === finalPos) continue;
        if (creditedAssistPositions.has(aPos)) continue;
        creditedAssistPositions.add(aPos);
        assists.push(aPos);
      }

      let remainingExtra = Math.max(0, battedOutsRecorded - dirOutsCount);
      for (const extraChain of extraRunnerChains) {
        if (remainingExtra <= 0) break;
        if (applyChainPutoutAndAssists(extraChain)) {
          remainingExtra -= 1;
        }
      }
    } else {
      const chainCap = Math.min(
        battedOutsRecorded,
        explicitInPlayOutChains.length
      );
      const primarySoloOuts = Math.max(0, battedOutsRecorded - chainCap);

      if (
        primarySoloOuts > 0 &&
        dirSegments.length === 1 &&
        (rc === "flyout" ||
          rc === "infield_fly" ||
          rc === "sac_fly" ||
          rc === "groundout" ||
          rc === "sac_bunt" ||
          rc === "double_play" ||
          rc === "triple_play" ||
          rc === "interference_out")
      ) {
        const soloPos = dirSegments[0]!;
        // 外野手（7/8/9）が飛球捕球後に送球先不明で併殺になった場合、飛球捕球の1刺殺のみを記録し架空の無補殺帰塁刺殺は付与しない
        const maxSoloPutouts =
          soloPos === "7" || soloPos === "8" || soloPos === "9"
            ? 1
            : primarySoloOuts;
        for (let k = 0; k < maxSoloPutouts; k++) {
          putouts.push(soloPos);
        }
      }

      for (let idx = 0; idx < chainCap; idx++) {
        applyChainPutoutAndAssists(explicitInPlayOutChains[idx]);
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
  pitchNumber?: number;
  runnerName?: string;
  batterCleanBase?: 1 | 2 | 3;
}

export interface HalfInningAtBatPitchingInput {
  atBatId: string;
  pitcherKey: string;
  /** カウント途中で投手交代した場合の前任投手キー（規則 9.16(h)・任意） */
  priorPitcherKey?: string;
  rawResult: string | null | undefined;
  runsInPlay?: number;
  snapAb?: (Pick<
    ScorebookV2AtBat,
    | "resultCode"
    | "battedDirection"
    | "resultLabel"
    | "outsInPlay"
    | "runsInPlay"
    | "advances"
  > & {
    batterName?: string;
    pinchRunners?: ScorebookV2AtBat["pinchRunners"];
    midAtBatPriorPitcher?: MidAtBatPriorPitcherInfo | null;
  }) | null;
  advances: HalfInningAdvanceEventInput[];
}

export interface PitcherHalfInningCharge {
  outs: number;
  battersFaced: number;
  runs: number;
  earnedRuns: number;
  dtsWildPitches: number;
  /** 規則 9.16(h) によりカウント途中の前任投手へ帰属された四球数 */
  walksChargedFromRelief?: number;
}

export interface HalfInningChronologicalRunEvent {
  responsiblePitcherKey: string;
  isEarned: boolean;
  cellAtBatId: string | null;
}

export interface HalfInningPitcherEntrySnapshot {
  pitcherKey: string;
  outsAtEntry: number;
  inheritedRunnersOnBase: number;
  runsScoredInHalfBeforeEntry: number;
}

export interface HalfInningEarnedRunDetails {
  pitcherCharges: Map<string, PitcherHalfInningCharge>;
  earnedOriginAtBatIds: Set<string>;
  unearnedOriginAtBatIds: Set<string>;
  teamEarnedRuns: number;
  /** このハーフイニングで生還した各得点の時系列リスト（規則 9.17(d) 決勝点・敗戦投手特定用） */
  scoredRunsInOrder: HalfInningChronologicalRunEvent[];
  /** このハーフイニングで登板した各投手の登板時点スナップショット（規則 9.18 完封例外・9.19(d)(2) セーブ同点走者判定用） */
  pitcherEntrySnapshots: HalfInningPitcherEntrySnapshot[];
}

type HypoBaseState = 0 | 1 | 2 | 3 | 4;

interface TrackedPitchingRunner {
  id: number;
  cellAtBatId: string | null;
  runnerName: string;
  responsiblePitcherKey: string;
  isUnearnedOrigin: boolean;
  owesErrorLifeFromStint: number | null;
  isRetired: boolean;
  actualScored: boolean;
  teamHypoBase: HypoBaseState;
  pitcherHypoBase: HypoBaseState;
}

function normalizeCompactRunnerName(name: string | null | undefined): string {
  return (name || "").replace(/\s+/g, "").trim();
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
    low === "appeal_out" ||
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
    low === "obstruction" ||
    low === "tiebreak" ||
    low.includes("失策") ||
    low.includes("エラー") ||
    low.includes("捕逸") ||
    low.includes("走塁妨害") ||
    low.includes("タイブレーク")
  );
}

function isWildPitchReason(reason: string): boolean {
  const low = reason.trim().toLowerCase();
  return low === "wp" || low.includes("暴投");
}

function isBalkReason(reason: string): boolean {
  const low = reason.trim().toLowerCase();
  return low === "balk" || low.includes("ボーク");
}

function collapseBatterStretchInPitchingEvents(
  events: ReadonlyArray<HalfInningAdvanceEventInput>,
  batterCompactName: string,
  bases: Readonly<Record<1 | 2 | 3, TrackedPitchingRunner | null>>
): ReadonlyArray<HalfInningAdvanceEventInput> {
  if (!batterCompactName || events.length === 0) return events;
  const batterAlreadyOnBase = ([1, 2, 3] as const).some((b) => {
    const occ = bases[b];
    return (
      occ !== null &&
      normalizeCompactRunnerName(occ.runnerName) === batterCompactName
    );
  });
  if (batterAlreadyOnBase) return events;

  const hasExtraBatterMove = events.some(
    (e) =>
      e.fromBase > 0 &&
      !isPrePlayReason(e.reason) &&
      normalizeCompactRunnerName(e.runnerName) === batterCompactName
  );
  if (!hasExtraBatterMove) return events;

  const nonBatterEvents: HalfInningAdvanceEventInput[] = [];
  const batterEvents: HalfInningAdvanceEventInput[] = [];
  for (const ev of events) {
    if (
      ev.fromBase === 0 ||
      (!isPrePlayReason(ev.reason) &&
        normalizeCompactRunnerName(ev.runnerName) === batterCompactName)
    ) {
      batterEvents.push(ev);
    } else {
      nonBatterEvents.push(ev);
    }
  }
  if (batterEvents.length === 0) return events;

  const sortedBat = [...batterEvents].sort((x, y) => {
    if (x.fromBase !== y.fromBase) return x.fromBase - y.fromBase;
    return x.toBase - y.toBase;
  });

  let cleanBase: 1 | 2 | 3 | undefined = sortedBat[0]?.batterCleanBase;
  let finalTo: 1 | 2 | 3 | 4 = sortedBat[0]!.toBase;
  let finalOut = false;
  let finalReason = sortedBat[0]!.reason;
  let hitErrorOrOut = false;

  for (const bm of sortedBat) {
    if (finalOut) break;
    if (bm.isOut) {
      finalOut = true;
      finalTo = bm.toBase;
      finalReason = bm.reason;
      hitErrorOrOut = true;
      break;
    }
    if (isUnearnedScoringReason(bm.reason)) {
      hitErrorOrOut = true;
    } else if (
      !hitErrorOrOut &&
      (bm.toBase === 1 || bm.toBase === 2 || bm.toBase === 3)
    ) {
      cleanBase = bm.toBase;
    }
    finalTo = bm.toBase;
    finalReason = bm.reason;
  }

  nonBatterEvents.push({
    fromBase: 0,
    toBase: finalTo,
    isOut: finalOut,
    reason: finalReason,
    runnerName: sortedBat[0]!.runnerName,
    batterCleanBase: cleanBase,
  });
  return nonBatterEvents;
}

function pickNextOccupancyMoveIndex(
  remaining: ReadonlyArray<HalfInningAdvanceEventInput>,
  bases: Readonly<Record<1 | 2 | 3, TrackedPitchingRunner | null>>
): number {
  if (remaining.length <= 1) return 0;

  let minPitch: number | null = null;
  for (const mv of remaining) {
    if (typeof mv.pitchNumber === "number" && mv.pitchNumber >= 0) {
      if (minPitch === null || mv.pitchNumber < minPitch) {
        minPitch = mv.pitchNumber;
      }
    }
  }

  const candidateIndices: number[] = [];
  for (let i = 0; i < remaining.length; i++) {
    const mv = remaining[i]!;
    if (
      minPitch !== null &&
      typeof mv.pitchNumber === "number" &&
      mv.pitchNumber > minPitch
    ) {
      continue;
    }
    candidateIndices.push(i);
  }
  const pool =
    candidateIndices.length > 0
      ? candidateIndices
      : remaining.map((_, idx) => idx);

  // 1) 現在占有されている塁 かつ 走者名が一致する移動（先の塁 3B -> 2B -> 1B を優先）
  let bestExactIdx = -1;
  let bestExactFrom = -1;
  for (const idx of pool) {
    const mv = remaining[idx]!;
    if (mv.fromBase < 1 || mv.fromBase > 3) continue;
    const occ = bases[mv.fromBase as 1 | 2 | 3];
    if (!occ) continue;
    const mvName = normalizeCompactRunnerName(mv.runnerName);
    const occName = normalizeCompactRunnerName(occ.runnerName);
    if (mvName && occName && mvName === occName && mv.fromBase > bestExactFrom) {
      bestExactFrom = mv.fromBase;
      bestExactIdx = idx;
    }
  }
  if (bestExactIdx >= 0) return bestExactIdx;

  // 2) 現在占有されている塁からの移動（走者名が異ならないもの優先、次に先の塁優先）
  let bestOccIdx = -1;
  let bestOccFrom = -1;
  for (const idx of pool) {
    const mv = remaining[idx]!;
    if (mv.fromBase < 1 || mv.fromBase > 3) continue;
    const occ = bases[mv.fromBase as 1 | 2 | 3];
    if (!occ) continue;
    const mvName = normalizeCompactRunnerName(mv.runnerName);
    const occName = normalizeCompactRunnerName(occ.runnerName);
    if (mvName && occName && mvName !== occName) continue;
    if (mv.fromBase > bestOccFrom) {
      bestOccFrom = mv.fromBase;
      bestOccIdx = idx;
    }
  }
  if (bestOccIdx >= 0) return bestOccIdx;

  // 3) 占有中の塁（名前不一致でも占有中優先）
  for (const idx of pool) {
    const mv = remaining[idx]!;
    if (mv.fromBase >= 1 && mv.fromBase <= 3 && bases[mv.fromBase as 1 | 2 | 3]) {
      if (mv.fromBase > bestOccFrom) {
        bestOccFrom = mv.fromBase;
        bestOccIdx = idx;
      }
    }
  }
  if (bestOccIdx >= 0) return bestOccIdx;

  // 4) フォールバック：先の塁から順
  let fallbackIdx = pool[0]!;
  let fallbackFrom = remaining[fallbackIdx]!.fromBase;
  for (const idx of pool) {
    if (remaining[idx]!.fromBase > fallbackFrom) {
      fallbackFrom = remaining[idx]!.fromBase;
      fallbackIdx = idx;
    }
  }
  return fallbackIdx;
}

/**
 * 1ハーフイニング分の打席・走塁データから、公認野球規則 9.16（イニング再構成・失策/捕逸で生還した走者の
 * 後続安打/暴投/押し出しによる自責昇格・2死後失策・失策出塁走者の後続盗塁刺/併殺による二重アウト防止・
 * 打撃妨害の除外規定 9.16(a)/(b)(2)・タイブレーク非自責・救援登板時の前任責任走者帰属 9.16(g) ＆
 * 救援投手の仮想アウト独立計算 9.16(i)）を厳密に評価する。
 */
export function evaluateHalfInningEarnedRunDetails(
  plays: ReadonlyArray<HalfInningAtBatPitchingInput>
): HalfInningEarnedRunDetails {
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
  const allTokens: TrackedPitchingRunner[] = [];
  const scoredTokensInOrder: TrackedPitchingRunner[] = [];
  let nextTokenSeq = 1;

  const markTokenScored = (tok: TrackedPitchingRunner): void => {
    tok.actualScored = true;
    if (!scoredTokensInOrder.includes(tok)) {
      scoredTokensInOrder.push(tok);
    }
  };

  const createRunnerToken = (params: {
    cellAtBatId: string | null;
    runnerName: string;
    responsiblePitcherKey: string;
    isUnearnedOrigin: boolean;
    owesErrorLifeFromStint: number | null;
    actualScored: boolean;
    teamHypoBase: HypoBaseState;
    pitcherHypoBase: HypoBaseState;
  }): TrackedPitchingRunner => {
    const tok: TrackedPitchingRunner = {
      id: nextTokenSeq++,
      isRetired: false,
      ...params,
    };
    allTokens.push(tok);
    if (tok.actualScored) {
      scoredTokensInOrder.push(tok);
    }
    return tok;
  };

  let actualOuts = 0;
  const firstPitcherKey =
    plays.find((p) => Boolean(p.priorPitcherKey || p.pitcherKey))
      ?.priorPitcherKey ||
    plays.find((p) => Boolean(p.pitcherKey))?.pitcherKey ||
    "";
  // 公認野球規則 9.16(i): 救援投手は登板前に記録された失策による仮想アウトの恩恵を受けない
  const pitcherStintByKey = new Map<string, number>();
  const pitcherEntrySnapshots: HalfInningPitcherEntrySnapshot[] = [];
  const recordedEntryKeys = new Set<string>();
  let nextStintSeq = 0;

  const countOccupiedBases = (): number =>
    (bases[1] ? 1 : 0) + (bases[2] ? 1 : 0) + (bases[3] ? 1 : 0);

  const registerPitcherIfNew = (key: string): void => {
    if (!key) return;
    if (!pitcherStintByKey.has(key)) {
      pitcherStintByKey.set(key, nextStintSeq++);
    }
    if (!recordedEntryKeys.has(key)) {
      recordedEntryKeys.add(key);
      pitcherEntrySnapshots.push({
        pitcherKey: key,
        outsAtEntry: actualOuts,
        inheritedRunnersOnBase: countOccupiedBases(),
        runsScoredInHalfBeforeEntry: scoredTokensInOrder.length,
      });
    }
  };

  if (firstPitcherKey) {
    registerPitcherIfNew(firstPitcherKey);
  }

  const getActiveErrorLivesFromStint = (minStint: number): number => {
    let count = 0;
    for (const tok of allTokens) {
      if (
        !tok.isRetired &&
        tok.owesErrorLifeFromStint !== null &&
        tok.owesErrorLifeFromStint >= minStint
      ) {
        count += 1;
      }
    }
    return count;
  };

  const getTeamVirtualOuts = (curActualOuts: number): number =>
    curActualOuts + getActiveErrorLivesFromStint(0);

  const getPitcherEffectiveVirtualOuts = (
    respKey: string,
    curActualOuts: number
  ): number => {
    const minStint = pitcherStintByKey.get(respKey) ?? 0;
    return curActualOuts + getActiveErrorLivesFromStint(minStint);
  };

  for (const play of plays) {
    const midPriorInfo = play.snapAb?.midAtBatPriorPitcher || null;
    const priorKey =
      play.priorPitcherKey ||
      (midPriorInfo
        ? midPriorInfo.playerId ||
          normalizeCompactRunnerName(midPriorInfo.name)
        : "");
    if (priorKey) {
      registerPitcherIfNew(priorKey);
    }

    const pKey = play.pitcherKey || firstPitcherKey;
    if (pKey) {
      registerPitcherIfNew(pKey);
    }
    const curStint = pitcherStintByKey.get(pKey) ?? 0;
    const pCharge = pKey ? ensurePitcher(pKey) : null;
    const cls = classifyAtBatResultToken(play.rawResult, play.snapAb);

    // 公認野球規則 9.16(h): カウント 2-0, 2-1, 3-0, 3-1, 3-2 で救援登板し四球となった場合、四球・対戦打者・責任走者は前任投手に帰属
    const chargeWalkToPriorPitcher = Boolean(
      priorKey &&
        priorKey !== pKey &&
        cls.isWalk &&
        midPriorInfo &&
        ((midPriorInfo.ballsBeforeChange === 2 &&
          midPriorInfo.strikesBeforeChange <= 1) ||
          midPriorInfo.ballsBeforeChange >= 3)
    );

    if (!cls.isUnfinishedRunnerOut) {
      if (chargeWalkToPriorPitcher && priorKey) {
        const priorCharge = ensurePitcher(priorKey);
        priorCharge.battersFaced += 1;
        priorCharge.walksChargedFromRelief =
          (priorCharge.walksChargedFromRelief || 0) + 1;
      } else if (pCharge) {
        pCharge.battersFaced += 1;
      }
    }

    // 代走（PR/TR）交代時は塁上トークンの走者名を最新化して占有照合を一致させる（cellAtBatId は出塁元セルを維持）
    if (Array.isArray(play.snapAb?.pinchRunners)) {
      for (const pr of play.snapAb.pinchRunners) {
        const bNum: 1 | 2 | 3 =
          pr.base === "1B" ? 1 : pr.base === "2B" ? 2 : 3;
        if (bases[bNum] && pr.name.trim()) {
          bases[bNum]!.runnerName = pr.name.trim();
        }
      }
    }

    const batterCompactName = normalizeCompactRunnerName(
      play.snapAb?.batterName
    );
    const resolvedAdvances = collapseBatterStretchInPitchingEvents(
      play.advances,
      batterCompactName,
      bases
    );

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
          bases[bNum] = createRunnerToken({
            cellAtBatId: null,
            runnerName: sAdv.runnerName || "",
            responsiblePitcherKey: firstPitcherKey || pKey,
            isUnearnedOrigin: true,
            owesErrorLifeFromStint: null,
            actualScored: false,
            teamHypoBase: bNum,
            pitcherHypoBase: bNum,
          });
        }
      }
    }
    for (const adv of resolvedAdvances) {
      if (
        adv.reason.toLowerCase() === "tiebreak" &&
        !adv.isOut &&
        (adv.toBase === 1 || adv.toBase === 2 || adv.toBase === 3)
      ) {
        if (!bases[adv.toBase]) {
          bases[adv.toBase] = createRunnerToken({
            cellAtBatId: null,
            runnerName: adv.runnerName || "",
            responsiblePitcherKey: firstPitcherKey || pKey,
            isUnearnedOrigin: true,
            owesErrorLifeFromStint: null,
            actualScored: false,
            teamHypoBase: adv.toBase,
            pitcherHypoBase: adv.toBase,
          });
        }
      }
    }

    const isPrePlayEvent = (a: HalfInningAdvanceEventInput): boolean =>
      a.fromBase > 0 &&
      (a.reason.trim().toLowerCase() === "appeal_out"
        ? a.pitchNumber === 0
        : isPrePlayReason(a.reason));
    const prePlayAdvs = resolvedAdvances.filter(
      (a) => a.reason.toLowerCase() !== "tiebreak" && isPrePlayEvent(a)
    );
    const inPlayAdvs = resolvedAdvances.filter(
      (a) => a.reason.toLowerCase() !== "tiebreak" && !isPrePlayEvent(a)
    );

    // B) 投球間（盗塁・暴投・捕逸・ボーク・盗塁死・牽制死）の走者移動・得点・アウト処理（占有整合順）
    let prePlayOuts = 0;
    let modeledRunsInPlay = 0;
    const remainingPre = [...prePlayAdvs];
    interface MoundAdvanceBucket {
      kind: "wp" | "balk";
      pitchNumber?: number;
      movedTokenIds: Set<number>;
    }
    const moundBuckets: MoundAdvanceBucket[] = [];

    while (remainingPre.length > 0) {
      const nextIdx = pickNextOccupancyMoveIndex(remainingPre, bases);
      const pm = remainingPre.splice(nextIdx, 1)[0]!;
      const fromB = pm.fromBase as 1 | 2 | 3;
      const existingOnBase = bases[fromB];
      const token: TrackedPitchingRunner =
        existingOnBase ||
        createRunnerToken({
          cellAtBatId: null,
          runnerName: pm.runnerName || "",
          responsiblePitcherKey: pKey,
          isUnearnedOrigin: false,
          owesErrorLifeFromStint: null,
          actualScored: false,
          teamHypoBase: getTeamVirtualOuts(actualOuts) < 3 ? fromB : 0,
          pitcherHypoBase:
            getPitcherEffectiveVirtualOuts(pKey, actualOuts) < 3 ? fromB : 0,
        });
      if (bases[fromB] === token) {
        bases[fromB] = null;
      }

      if (pm.isOut) {
        // 失策出塁した走者が盗塁死・牽制死等で退場した場合、isRetired = true とすることで同一走者の二重アウト計上を防止（規則 9.16(a)）
        token.isRetired = true;
        token.teamHypoBase = 0;
        token.pitcherHypoBase = 0;
        prePlayOuts += 1;
        actualOuts = Math.min(3, actualOuts + 1);
        if (pCharge) pCharge.outs += 1;
      } else {
        if (pm.toBase === 4) {
          modeledRunsInPlay += 1;
          markTokenScored(token);
        } else if (pm.toBase === 1 || pm.toBase === 2 || pm.toBase === 3) {
          bases[pm.toBase] = token;
        }

        if (!isUnearnedScoringReason(pm.reason)) {
          const gain = Math.max(1, pm.toBase - pm.fromBase);
          const teamVirtNow = getTeamVirtualOuts(actualOuts);
          const pitcherVirtNow = getPitcherEffectiveVirtualOuts(
            token.responsiblePitcherKey || pKey,
            actualOuts
          );
          const isStealLike =
            !isWildPitchReason(pm.reason) && !isBalkReason(pm.reason);

          if (
            teamVirtNow < 3 &&
            token.teamHypoBase >= 1 &&
            token.teamHypoBase <= 3
          ) {
            const targetTeam = Math.min(
              4,
              token.teamHypoBase + gain
            ) as HypoBaseState;
            const blockedByAheadGhost =
              isStealLike &&
              targetTeam >= 1 &&
              targetTeam <= 3 &&
              allTokens.some(
                (other) =>
                  other.id !== token.id && other.teamHypoBase === targetTeam
              );
            if (!blockedByAheadGhost) {
              token.teamHypoBase = targetTeam;
            }
          }

          if (
            pitcherVirtNow < 3 &&
            token.pitcherHypoBase >= 1 &&
            token.pitcherHypoBase <= 3
          ) {
            const targetPitcher = Math.min(
              4,
              token.pitcherHypoBase + gain
            ) as HypoBaseState;
            const blockedByAheadGhost =
              isStealLike &&
              targetPitcher >= 1 &&
              targetPitcher <= 3 &&
              allTokens.some(
                (other) =>
                  other.id !== token.id &&
                  other.pitcherHypoBase === targetPitcher
              );
            if (!blockedByAheadGhost) {
              token.pitcherHypoBase = targetPitcher;
            }
          }

          if (isWildPitchReason(pm.reason) || isBalkReason(pm.reason)) {
            const bKind: "wp" | "balk" = isBalkReason(pm.reason)
              ? "balk"
              : "wp";
            const matchedBucket = moundBuckets.find(
              (b) =>
                b.kind === bKind &&
                !b.movedTokenIds.has(token.id) &&
                (b.pitchNumber === undefined ||
                  pm.pitchNumber === undefined ||
                  b.pitchNumber === pm.pitchNumber)
            );
            if (matchedBucket) {
              matchedBucket.movedTokenIds.add(token.id);
            } else {
              moundBuckets.push({
                kind: bKind,
                pitchNumber: pm.pitchNumber,
                movedTokenIds: new Set([token.id]),
              });
            }
          }
        }
      }
    }

    // 投球間の暴投・ボークで、直前の失策生還等により仮想塁上に残っている走者も1塁進塁させる（規則 9.16(a)）
    for (const bucket of moundBuckets) {
      const heldAtThird =
        bucket.kind === "wp" &&
        bases[3] !== null &&
        !bucket.movedTokenIds.has(bases[3].id);
      const capBase: 3 | 4 = heldAtThird ? 3 : 4;
      for (const ghost of allTokens) {
        if (!ghost.actualScored || bucket.movedTokenIds.has(ghost.id)) continue;
        const teamVirtNow = getTeamVirtualOuts(actualOuts);
        if (
          teamVirtNow < 3 &&
          ghost.teamHypoBase >= 1 &&
          ghost.teamHypoBase <= 3 &&
          ghost.teamHypoBase < capBase
        ) {
          ghost.teamHypoBase = Math.min(
            capBase,
            ghost.teamHypoBase + 1
          ) as HypoBaseState;
        }
        const pitcherVirtNow = getPitcherEffectiveVirtualOuts(
          ghost.responsiblePitcherKey || pKey,
          actualOuts
        );
        if (
          pitcherVirtNow < 3 &&
          ghost.pitcherHypoBase >= 1 &&
          ghost.pitcherHypoBase <= 3 &&
          ghost.pitcherHypoBase < capBase
        ) {
          ghost.pitcherHypoBase = Math.min(
            capBase,
            ghost.pitcherHypoBase + 1
          ) as HypoBaseState;
        }
      }
    }

    // このインプレー開始前に既に本塁生還していた仮想走者集合をスナップショット保持
    const ghostTokensBeforeInPlay = allTokens.filter((t) => t.actualScored);

    // C) 打者のインプレー結果・アウト数・失策救済アウト（仮想アウト）判定
    const batterAdvs = inPlayAdvs.filter((a) => a.fromBase === 0);
    const batterScoredExplicitly = batterAdvs.some(
      (a) => !a.isOut && a.toBase === 4
    );
    const batterOutExplicitly = batterAdvs.some((a) => a.isOut);

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
      inPlayOuts = inPlayAdvs.filter((a) => a.isOut).length;
    }
    inPlayOuts = Math.min(3 - actualOuts, Math.max(0, inPlayOuts));
    if (pCharge && inPlayOuts > 0) {
      pCharge.outs += inPlayOuts;
    }

    const rawDirUpper = (play.snapAb?.battedDirection || "")
      .trim()
      .toUpperCase();
    const hasRelayErrorSavingBatter =
      !batterOutExplicitly &&
      (cls.isFieldersChoiceReach ||
        (cls.effectiveResult === "groundout" && inPlayOuts >= 1)) &&
      /(?:[1-9]E|E[1-9])/i.test(rawDirUpper);

    let dtsKind: "wp" | "pb" | "throwing_error" | "receiving_error" = "pb";
    if (cls.isDroppedThirdStrikeSafe) {
      dtsKind = classifyDroppedThirdStrikeReach(
        play.snapAb?.battedDirection,
        play.snapAb?.resultLabel || play.rawResult
      ).kind;
      if (dtsKind === "wp" && pCharge) {
        pCharge.dtsWildPitches += 1;
      }
    }

    // 公認野球規則 9.16(a) & 9.16(b)(2):
    // - 失策出塁・捕逸/失策振り逃げ・併殺崩れ悪送球セーフ（同一プレーで打者自身が走塁死していない場合のみ）は仮想アウト +1
    // - 打撃妨害（cls.isInterferenceReach）は打者自身の得点は非自責となるが、仮想アウトには加算しない（"which exclude catcher's interference"）
    const batterReachedByError =
      (cls.isErrorReach ||
        (cls.isDroppedThirdStrikeSafe && dtsKind !== "wp") ||
        hasRelayErrorSavingBatter) &&
      !batterOutExplicitly;
    const errorSavedOutsThisPlay = batterReachedByError ? 1 : 0;
    const batterReachedUnearned =
      cls.isErrorReach ||
      cls.isInterferenceReach ||
      (cls.isDroppedThirdStrikeSafe && dtsKind !== "wp") ||
      hasRelayErrorSavingBatter;

    // インプレー開始時点の仮想アウト数をスナップショット保持（同一プレー内の走者退場順序に依存させない）
    const teamVirtBefore = getTeamVirtualOuts(actualOuts);
    const pitcherVirtBeforeByKey = new Map<string, number>();
    const getSnapshotPitcherVirtBefore = (rk: string): number => {
      let cached = pitcherVirtBeforeByKey.get(rk);
      if (cached === undefined) {
        cached = getPitcherEffectiveVirtualOuts(rk, actualOuts);
        pitcherVirtBeforeByKey.set(rk, cached);
      }
      return cached;
    };

    const isImplicitForceSwap =
      inPlayAdvs.filter((r) => r.fromBase > 0 && r.isOut).length === 0 &&
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

    const willBatterReachOnSwap =
      !batterOutExplicitly &&
      !cls.isHit &&
      !cls.isWalk &&
      !cls.isHbp &&
      !cls.isInterferenceReach &&
      !cls.isDroppedThirdStrikeSafe &&
      (batterScoredExplicitly ||
        batterAdvs.some(
          (a) => !a.isOut && (a.toBase === 1 || a.toBase === 2 || a.toBase === 3)
        ) ||
        cls.isErrorReach ||
        cls.isFieldersChoiceReach ||
        isImplicitForceSwap);

    // 併殺等で失策出塁走者が退場し打者も出塁しなかった場合、その走者の仮想アウトと実アウトの二重計上を差し引く
    const retiredTokensPreview: TrackedPitchingRunner[] = [];
    for (const rm of inPlayAdvs) {
      if (rm.isOut && rm.fromBase >= 1 && rm.fromBase <= 3) {
        const occ = bases[rm.fromBase as 1 | 2 | 3];
        if (occ && !retiredTokensPreview.includes(occ)) {
          retiredTokensPreview.push(occ);
        }
      }
    }
    if (isImplicitForceSwap && retiredTokensPreview.length === 0) {
      const forcedOcc = bases[1] || bases[2] || bases[3];
      if (forcedOcc) retiredTokensPreview.push(forcedOcc);
    }

    const getExtinguishedErrorLives = (minStint: number): number => {
      let ext = 0;
      retiredTokensPreview.forEach((rt, idx) => {
        if (idx === 0 && willBatterReachOnSwap) return;
        if (
          rt.owesErrorLifeFromStint !== null &&
          rt.owesErrorLifeFromStint >= minStint
        ) {
          ext += 1;
        }
      });
      return ext;
    };

    const intrinsicOutCountForVirtual =
      cls.intrinsicBatterOuts > 0 ? Math.max(1, inPlayOuts) : 0;
    const teamVirtDuringScoring =
      teamVirtBefore +
      Math.max(0, intrinsicOutCountForVirtual - getExtinguishedErrorLives(0)) +
      errorSavedOutsThisPlay;
    const getPitcherVirtDuringScoring = (rk: string): number => {
      const minStint = pitcherStintByKey.get(rk) ?? 0;
      return (
        getSnapshotPitcherVirtBefore(rk) +
        Math.max(
          0,
          intrinsicOutCountForVirtual - getExtinguishedErrorLives(minStint)
        ) +
        errorSavedOutsThisPlay
      );
    };

    const isAwardPushPlay =
      cls.isWalk ||
      cls.isHbp ||
      cls.isInterferenceReach ||
      (cls.isDroppedThirdStrikeSafe && dtsKind === "wp");
    const hitBases: 0 | 1 | 2 | 3 | 4 = cls.isHomeRun
      ? 4
      : cls.isTriple
      ? 3
      : cls.isDouble
      ? 2
      : cls.isSingle
      ? 1
      : 0;

    // E) インプレーでの先行走者アウト・進塁・生還と、封殺時の責任投手引き継ぎ（規則 9.16(g)）
    let retiredPrecedingRunnerToken: TrackedPitchingRunner | null = null;
    const remainingInPlayRunners = inPlayAdvs.filter((a) => a.fromBase > 0);
    const movedPhysicalTokenIds = new Set<number>();

    while (remainingInPlayRunners.length > 0) {
      const nextIdx = pickNextOccupancyMoveIndex(remainingInPlayRunners, bases);
      const rm = remainingInPlayRunners.splice(nextIdx, 1)[0]!;
      const fromB = rm.fromBase as 1 | 2 | 3;
      const existingOnBase = bases[fromB];
      const token: TrackedPitchingRunner =
        existingOnBase ||
        createRunnerToken({
          cellAtBatId: null,
          runnerName: rm.runnerName || "",
          responsiblePitcherKey: pKey,
          isUnearnedOrigin: false,
          owesErrorLifeFromStint: null,
          actualScored: false,
          teamHypoBase: teamVirtBefore < 3 ? fromB : 0,
          pitcherHypoBase:
            getSnapshotPitcherVirtBefore(pKey) < 3 ? fromB : 0,
        });
      if (bases[fromB] === token) {
        bases[fromB] = null;
      }
      movedPhysicalTokenIds.add(token.id);

      if (rm.isOut) {
        if (!retiredPrecedingRunnerToken) {
          retiredPrecedingRunnerToken = token;
        }
        token.isRetired = true;
        token.teamHypoBase = 0;
        token.pitcherHypoBase = 0;
      } else {
        if (rm.toBase === 4) {
          modeledRunsInPlay += 1;
          markTokenScored(token);
        } else if (rm.toBase === 1 || rm.toBase === 2 || rm.toBase === 3) {
          bases[rm.toBase] = token;
        }

        const respKey = token.responsiblePitcherKey || pKey;
        const pitcherVirtBefore = getSnapshotPitcherVirtBefore(respKey);
        const pitcherVirtDuringScoring = getPitcherVirtDuringScoring(respKey);

        if (
          !cls.isErrorReach &&
          !hasRelayErrorSavingBatter &&
          !isUnearnedScoringReason(rm.reason) &&
          !isAwardPushPlay
        ) {
          if (cls.isHit && hitBases > 0) {
            if (
              teamVirtBefore < 3 &&
              token.teamHypoBase >= 1 &&
              token.teamHypoBase <= 3
            ) {
              token.teamHypoBase =
                token.teamHypoBase === fromB
                  ? rm.toBase
                  : (Math.min(4, token.teamHypoBase + hitBases) as HypoBaseState);
            }
            if (
              pitcherVirtBefore < 3 &&
              token.pitcherHypoBase >= 1 &&
              token.pitcherHypoBase <= 3
            ) {
              token.pitcherHypoBase =
                token.pitcherHypoBase === fromB
                  ? rm.toBase
                  : (Math.min(
                      4,
                      token.pitcherHypoBase + hitBases
                    ) as HypoBaseState);
            }
          } else {
            if (
              teamVirtDuringScoring < 3 &&
              token.teamHypoBase >= 1 &&
              token.teamHypoBase <= 3
            ) {
              token.teamHypoBase =
                token.teamHypoBase === fromB
                  ? rm.toBase
                  : (Math.min(4, token.teamHypoBase + 1) as HypoBaseState);
            }
            if (
              pitcherVirtDuringScoring < 3 &&
              token.pitcherHypoBase >= 1 &&
              token.pitcherHypoBase <= 3
            ) {
              token.pitcherHypoBase =
                token.pitcherHypoBase === fromB
                  ? rm.toBase
                  : (Math.min(4, token.pitcherHypoBase + 1) as HypoBaseState);
            }
          }
        }
      }
    }

    // 明示的走者アウト行がない封殺ゴロ（6-4 等）でも塁上の先行走者を入れ替え、前任責任投手を継承する
    if (isImplicitForceSwap) {
      const forcedSlot: 1 | 2 | 3 | null = bases[1]
        ? 1
        : bases[2]
        ? 2
        : bases[3]
        ? 3
        : null;
      if (forcedSlot && bases[forcedSlot]) {
        retiredPrecedingRunnerToken = bases[forcedSlot];
        retiredPrecedingRunnerToken!.isRetired = true;
        retiredPrecedingRunnerToken!.teamHypoBase = 0;
        retiredPrecedingRunnerToken!.pitcherHypoBase = 0;
        bases[forcedSlot] = null;
      }
    }

    // 既に失策生還していた仮想走者（ghostTokensBeforeInPlay）の後続安打・犠飛での仮想進塁
    if (cls.isHit && hitBases > 0) {
      for (const ghost of ghostTokensBeforeInPlay) {
        if (
          teamVirtBefore < 3 &&
          ghost.teamHypoBase >= 1 &&
          ghost.teamHypoBase <= 3
        ) {
          ghost.teamHypoBase = Math.min(
            4,
            ghost.teamHypoBase + hitBases
          ) as HypoBaseState;
        }
        const pVirtBefore = getSnapshotPitcherVirtBefore(
          ghost.responsiblePitcherKey || pKey
        );
        if (
          pVirtBefore < 3 &&
          ghost.pitcherHypoBase >= 1 &&
          ghost.pitcherHypoBase <= 3
        ) {
          ghost.pitcherHypoBase = Math.min(
            4,
            ghost.pitcherHypoBase + hitBases
          ) as HypoBaseState;
        }
      }

      // 実塁上に残っていてこの安打で実移動しなかった先行走者（過去にPB等で先の塁にいた場合）の強制キャッチアップ進塁
      for (const bNum of [3, 2, 1] as const) {
        const onB = bases[bNum];
        if (!onB || movedPhysicalTokenIds.has(onB.id)) continue;
        if (
          teamVirtBefore < 3 &&
          onB.teamHypoBase >= 1 &&
          onB.teamHypoBase < bNum
        ) {
          onB.teamHypoBase = Math.min(
            bNum,
            onB.teamHypoBase + hitBases
          ) as HypoBaseState;
        }
        const pVirtBefore = getSnapshotPitcherVirtBefore(
          onB.responsiblePitcherKey || pKey
        );
        if (
          pVirtBefore < 3 &&
          onB.pitcherHypoBase >= 1 &&
          onB.pitcherHypoBase < bNum
        ) {
          onB.pitcherHypoBase = Math.min(
            bNum,
            onB.pitcherHypoBase + hitBases
          ) as HypoBaseState;
        }
      }
    } else if (cls.isSacFly) {
      for (const ghost of ghostTokensBeforeInPlay) {
        if (teamVirtDuringScoring < 3 && ghost.teamHypoBase === 3) {
          ghost.teamHypoBase = 4;
        }
        const pVirtDuring = getPitcherVirtDuringScoring(
          ghost.responsiblePitcherKey || pKey
        );
        if (pVirtDuring < 3 && ghost.pitcherHypoBase === 3) {
          ghost.pitcherHypoBase = 4;
        }
      }
    }

    // 四死球・打撃妨害・暴投振り逃げでの仮想押し出し進塁（実走者・仮想残留走者を統一評価）
    if (isAwardPushPlay) {
      if (teamVirtBefore < 3) {
        const hasTeam1 = allTokens.some((t) => t.teamHypoBase === 1);
        const hasTeam2 = allTokens.some((t) => t.teamHypoBase === 2);
        if (hasTeam1) {
          for (const t of allTokens) {
            if (hasTeam2 && t.teamHypoBase === 3) t.teamHypoBase = 4;
            else if (hasTeam2 && t.teamHypoBase === 2) t.teamHypoBase = 3;
            else if (t.teamHypoBase === 1) t.teamHypoBase = 2;
          }
        }
      }

      const hasPitcher1 = allTokens.some(
        (t) =>
          t.pitcherHypoBase === 1 &&
          getSnapshotPitcherVirtBefore(t.responsiblePitcherKey || pKey) < 3
      );
      const hasPitcher2 = allTokens.some(
        (t) =>
          t.pitcherHypoBase === 2 &&
          getSnapshotPitcherVirtBefore(t.responsiblePitcherKey || pKey) < 3
      );
      if (hasPitcher1) {
        for (const t of allTokens) {
          if (
            getSnapshotPitcherVirtBefore(t.responsiblePitcherKey || pKey) >= 3
          ) {
            continue;
          }
          if (hasPitcher2 && t.pitcherHypoBase === 3) t.pitcherHypoBase = 4;
          else if (hasPitcher2 && t.pitcherHypoBase === 2)
            t.pitcherHypoBase = 3;
          else if (t.pitcherHypoBase === 1) t.pitcherHypoBase = 2;
        }
      }
    }

    // F) 打者自身の出塁・本塁打生還
    const inheritsPrecedingRunner = Boolean(
      retiredPrecedingRunnerToken &&
        !cls.isHit &&
        !cls.isWalk &&
        !cls.isHbp &&
        !cls.isInterferenceReach &&
        !cls.isDroppedThirdStrikeSafe
    );
    const batterRespKey = inheritsPrecedingRunner
      ? retiredPrecedingRunnerToken!.responsiblePitcherKey || pKey
      : chargeWalkToPriorPitcher && priorKey
      ? priorKey
      : pKey;
    const batterIsUnearnedOrigin = inheritsPrecedingRunner
      ? retiredPrecedingRunnerToken!.isUnearnedOrigin || batterReachedUnearned
      : batterReachedUnearned;
    const batterErrorLifeStint: number | null = batterReachedByError
      ? curStint
      : inheritsPrecedingRunner
      ? retiredPrecedingRunnerToken!.owesErrorLifeFromStint
      : null;

    const batterPitcherVirtBefore = getSnapshotPitcherVirtBefore(batterRespKey);
    const batterMinStint = pitcherStintByKey.get(batterRespKey) ?? 0;
    const batterPitcherVirtAfter =
      batterPitcherVirtBefore +
      Math.max(0, inPlayOuts - getExtinguishedErrorLives(batterMinStint)) +
      errorSavedOutsThisPlay;
    const batterTeamVirtAfter =
      teamVirtBefore +
      Math.max(0, inPlayOuts - getExtinguishedErrorLives(0)) +
      errorSavedOutsThisPlay;

    if (cls.isHomeRun || batterScoredExplicitly) {
      // 本塁打で進塁明細行が省略されている場合は塁上の先行走者全員を生還させる
      if (cls.isHomeRun && movedPhysicalTokenIds.size === 0) {
        for (const bNum of [3, 2, 1] as const) {
          const onBase = bases[bNum];
          if (!onBase) continue;
          bases[bNum] = null;
          modeledRunsInPlay += 1;
          markTokenScored(onBase);
          if (teamVirtBefore < 3 && onBase.teamHypoBase >= 1) {
            onBase.teamHypoBase = 4;
          }
          const rVirtBefore = getSnapshotPitcherVirtBefore(
            onBase.responsiblePitcherKey || pKey
          );
          if (rVirtBefore < 3 && onBase.pitcherHypoBase >= 1) {
            onBase.pitcherHypoBase = 4;
          }
        }
      }

      modeledRunsInPlay += 1;
      const batterRunAdv = batterAdvs.find(
        (a) => !a.isOut && a.toBase === 4
      );
      const batterRunReason = batterRunAdv?.reason || "hit";
      const cleanInitBase: HypoBaseState = cls.isHomeRun
        ? 4
        : batterRunAdv?.batterCleanBase ??
          (hitBases > 0 ? hitBases : isAwardPushPlay ? 1 : 0);
      const scoredWithoutErr =
        cls.isHomeRun || !isUnearnedScoringReason(batterRunReason);

      createRunnerToken({
        cellAtBatId: play.atBatId || null,
        runnerName: play.snapAb?.batterName || "",
        responsiblePitcherKey: batterRespKey,
        isUnearnedOrigin: batterIsUnearnedOrigin,
        owesErrorLifeFromStint: batterErrorLifeStint,
        actualScored: true,
        teamHypoBase:
          batterReachedByError || teamVirtBefore >= 3
            ? 0
            : scoredWithoutErr
            ? 4
            : cleanInitBase,
        pitcherHypoBase:
          batterReachedByError || batterPitcherVirtBefore >= 3
            ? 0
            : scoredWithoutErr
            ? 4
            : cleanInitBase,
      });
    } else if (!batterOutExplicitly) {
      const explicitBatterAdv = batterAdvs.find(
        (a) => !a.isOut && (a.toBase === 1 || a.toBase === 2 || a.toBase === 3)
      );
      const explicitDest = explicitBatterAdv?.toBase as 1 | 2 | 3 | undefined;

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
          // 四死球での実塁上の自動押し出し進塁（明示的進塁行がない場合のみ補完；仮想塁は上の isAwardPushPlay で処理済み）
          if (
            (cls.isWalk || cls.isHbp || cls.isInterferenceReach) &&
            movedPhysicalTokenIds.size === 0
          ) {
            if (bases[1] && bases[2] && bases[3]) {
              const pushed = bases[3];
              modeledRunsInPlay += 1;
              markTokenScored(pushed);
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

      // 進塁行が省略された旧データで runsInPlay のみ記録されている場合、先行走者から順に生還補完
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
          markTokenScored(onBase);
          if (!cls.isErrorReach && !hasRelayErrorSavingBatter) {
            if (
              (cls.isHit ? teamVirtBefore < 3 : teamVirtDuringScoring < 3) &&
              onBase.teamHypoBase >= 1
            ) {
              onBase.teamHypoBase = 4;
            }
            const rKey = onBase.responsiblePitcherKey || pKey;
            const rVirtBefore = getSnapshotPitcherVirtBefore(rKey);
            const rVirtDuring = getPitcherVirtDuringScoring(rKey);
            if (
              (cls.isHit ? rVirtBefore < 3 : rVirtDuring < 3) &&
              onBase.pitcherHypoBase >= 1
            ) {
              onBase.pitcherHypoBase = 4;
            }
          }
        }
      }

      if (destBase) {
        if (bases[destBase] && destBase === 1) {
          if (!bases[2]) {
            const shifted = bases[1]!;
            bases[2] = shifted;
            if (
              !movedPhysicalTokenIds.has(shifted.id) &&
              !cls.isErrorReach &&
              !isAwardPushPlay
            ) {
              if (teamVirtBefore < 3 && shifted.teamHypoBase === 1) {
                shifted.teamHypoBase = 2;
              }
              if (
                getSnapshotPitcherVirtBefore(
                  shifted.responsiblePitcherKey || pKey
                ) < 3 &&
                shifted.pitcherHypoBase === 1
              ) {
                shifted.pitcherHypoBase = 2;
              }
            }
          } else if (!bases[3]) {
            bases[3] = bases[1];
          }
        }

        const cleanBaseBeforeExtra: 1 | 2 | 3 =
          explicitBatterAdv?.batterCleanBase ??
          (hitBases >= 1 && hitBases <= 3
            ? (hitBases as 1 | 2 | 3)
            : isUnearnedScoringReason(explicitBatterAdv?.reason || "")
            ? 1
            : destBase);

        const calcBatterHypo = (
          virtBefore: number,
          virtAfter: number
        ): HypoBaseState => {
          if (batterReachedByError) return 0;
          if (inheritsPrecedingRunner) {
            if (
              virtAfter >= 3 ||
              retiredPrecedingRunnerToken?.isUnearnedOrigin
            ) {
              return 0;
            }
            return 1;
          }
          if (virtBefore >= 3) return 0;
          if (
            explicitBatterAdv &&
            isUnearnedScoringReason(explicitBatterAdv.reason)
          ) {
            return cleanBaseBeforeExtra;
          }
          return destBase;
        };

        bases[destBase] = createRunnerToken({
          cellAtBatId: play.atBatId || null,
          runnerName: play.snapAb?.batterName || "",
          responsiblePitcherKey: batterRespKey,
          isUnearnedOrigin: batterIsUnearnedOrigin,
          owesErrorLifeFromStint: batterErrorLifeStint,
          actualScored: false,
          teamHypoBase: calcBatterHypo(teamVirtBefore, batterTeamVirtAfter),
          pitcherHypoBase: calcBatterHypo(
            batterPitcherVirtBefore,
            batterPitcherVirtAfter
          ),
        });
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
        markTokenScored(onBase);
        if (!cls.isErrorReach && !hasRelayErrorSavingBatter) {
          if (
            (cls.isHit ? teamVirtBefore < 3 : teamVirtDuringScoring < 3) &&
            onBase.teamHypoBase >= 1
          ) {
            onBase.teamHypoBase = 4;
          }
          const rKey = onBase.responsiblePitcherKey || pKey;
          const rVirtBefore = getSnapshotPitcherVirtBefore(rKey);
          const rVirtDuring = getPitcherVirtDuringScoring(rKey);
          if (
            (cls.isHit ? rVirtBefore < 3 : rVirtDuring < 3) &&
            onBase.pitcherHypoBase >= 1
          ) {
            onBase.pitcherHypoBase = 4;
          }
        }
      }
      while (remaining > 0) {
        remaining -= 1;
        const pVirtBefore = getSnapshotPitcherVirtBefore(pKey);
        const pVirtDuring = getPitcherVirtDuringScoring(pKey);
        createRunnerToken({
          cellAtBatId: null,
          runnerName: "",
          responsiblePitcherKey: pKey,
          isUnearnedOrigin: cls.isErrorReach || cls.isInterferenceReach,
          owesErrorLifeFromStint: null,
          actualScored: true,
          teamHypoBase:
            !cls.isErrorReach &&
            (cls.isHit ? teamVirtBefore < 3 : teamVirtDuringScoring < 3)
              ? 4
              : 0,
          pitcherHypoBase:
            !cls.isErrorReach &&
            (cls.isHit ? pVirtBefore < 3 : pVirtDuring < 3)
              ? 4
              : 0,
        });
      }
    }

    actualOuts = Math.min(3, actualOuts + inPlayOuts);
    if (actualOuts >= 3) {
      break;
    }
  }

  // G) イニング終了後の最終集計（後続安打・暴投・押し出しで仮想本塁4に到達した走者は自責点に昇格）
  const earnedOriginAtBatIds = new Set<string>();
  const unearnedOriginAtBatIds = new Set<string>();
  let teamEarnedRuns = 0;

  for (const tok of allTokens) {
    if (!tok.actualScored) continue;
    const respKey = tok.responsiblePitcherKey || firstPitcherKey;
    const isPitcherEarned = !tok.isUnearnedOrigin && tok.pitcherHypoBase === 4;
    const isTeamEarned = !tok.isUnearnedOrigin && tok.teamHypoBase === 4;

    if (respKey) {
      const respCharge = ensurePitcher(respKey);
      respCharge.runs += 1;
      if (isPitcherEarned) {
        respCharge.earnedRuns += 1;
      }
    }
    if (isTeamEarned) {
      teamEarnedRuns += 1;
    }
    if (tok.cellAtBatId) {
      if (isPitcherEarned) {
        earnedOriginAtBatIds.add(tok.cellAtBatId);
      } else {
        unearnedOriginAtBatIds.add(tok.cellAtBatId);
      }
    }
  }

  const scoredRunsInOrder: HalfInningChronologicalRunEvent[] =
    scoredTokensInOrder.map((tok) => {
      const respKey = tok.responsiblePitcherKey || firstPitcherKey;
      const isPitcherEarned =
        !tok.isUnearnedOrigin && tok.pitcherHypoBase === 4;
      return {
        responsiblePitcherKey: respKey,
        isEarned: isPitcherEarned,
        cellAtBatId: tok.cellAtBatId,
      };
    });

  return {
    pitcherCharges: charges,
    earnedOriginAtBatIds,
    unearnedOriginAtBatIds,
    teamEarnedRuns,
    scoredRunsInOrder,
    pitcherEntrySnapshots,
  };
}

export function evaluateHalfInningPitcherCharges(
  plays: ReadonlyArray<HalfInningAtBatPitchingInput>
): Map<string, PitcherHalfInningCharge> {
  return evaluateHalfInningEarnedRunDetails(plays).pitcherCharges;
}

/**
 * スナップショット形式の `ScorebookV2Advance` を `HalfInningAdvanceEventInput` へ変換する
 * （同一プレーで打者が安打後に二塁タッチアウト・悪送球進塁した場合は `fromBase: 0` に統合する）
 */
export function mapSnapshotAdvancesToPitchingEvents(
  advances: ReadonlyArray<ScorebookV2Advance> | undefined,
  batterName?: string | null
): HalfInningAdvanceEventInput[] {
  if (!Array.isArray(advances)) return [];
  const baseToNum = (b: OccupiedBaseKey | "BAT"): 0 | 1 | 2 | 3 =>
    b === "BAT" ? 0 : b === "1B" ? 1 : b === "2B" ? 2 : 3;
  const toBaseNum = (b: OccupiedBaseKey | "HP"): 1 | 2 | 3 | 4 =>
    b === "1B" ? 1 : b === "2B" ? 2 : b === "3B" ? 3 : 4;

  const filtered = advances.filter(
    (a) => !(a.from !== "BAT" && !a.isOut && a.from === a.to)
  );
  const compactBatName = normalizeCompactRunnerName(batterName);

  const batterMoveIds = new Set<string>();
  const batterMoves: ScorebookV2Advance[] = [];
  for (const a of filtered) {
    if (a.from === "BAT") {
      batterMoveIds.add(a.id);
      batterMoves.push(a);
    } else if (
      compactBatName &&
      !isPrePlayReason(a.method) &&
      normalizeCompactRunnerName(a.runnerName) === compactBatName
    ) {
      batterMoveIds.add(a.id);
      batterMoves.push(a);
    }
  }

  const events: HalfInningAdvanceEventInput[] = [];
  for (const a of filtered) {
    if (batterMoveIds.has(a.id)) continue;
    events.push({
      fromBase: baseToNum(a.from),
      toBase: toBaseNum(a.to),
      isOut: Boolean(a.isOut),
      reason: a.method as AdvanceMethodCode,
      pitchNumber: a.pitchNumber,
      runnerName: a.runnerName || undefined,
    });
  }

  if (batterMoves.length === 1 && batterMoves[0]!.from === "BAT") {
    const bm = batterMoves[0]!;
    events.push({
      fromBase: 0,
      toBase: toBaseNum(bm.to),
      isOut: Boolean(bm.isOut),
      reason: bm.method as AdvanceMethodCode,
      pitchNumber: bm.pitchNumber,
      runnerName: bm.runnerName || batterName || undefined,
    });
  } else if (batterMoves.length > 0) {
    const sortedBat = [...batterMoves].sort((x, y) => {
      const fDiff = baseToNum(x.from) - baseToNum(y.from);
      if (fDiff !== 0) return fDiff;
      return toBaseNum(x.to) - toBaseNum(y.to);
    });
    let cleanBase: 1 | 2 | 3 | undefined;
    let finalTo: 1 | 2 | 3 | 4 = toBaseNum(sortedBat[0]!.to);
    let finalOut = false;
    let finalReason: string = sortedBat[0]!.method;
    let hitErrorOrOut = false;

    for (const bm of sortedBat) {
      if (finalOut) break;
      const tb = toBaseNum(bm.to);
      if (bm.isOut) {
        finalOut = true;
        finalTo = tb;
        finalReason = bm.method;
        hitErrorOrOut = true;
        break;
      }
      if (isUnearnedScoringReason(bm.method)) {
        hitErrorOrOut = true;
      } else if (
        !hitErrorOrOut &&
        (tb === 1 || tb === 2 || tb === 3)
      ) {
        cleanBase = tb;
      }
      finalTo = tb;
      finalReason = bm.method;
    }

    events.push({
      fromBase: 0,
      toBase: finalTo,
      isOut: finalOut,
      reason: finalReason,
      runnerName: batterName || sortedBat[0]!.runnerName || undefined,
      batterCleanBase: cleanBase,
    });
  }

  return events;
}

// ============================================================================
// 公認野球規則 9.15(b)：カウント途中の代打三振帰属
// ============================================================================

/**
 * 2ストライク後に代打が出場し三振（振り逃げを含む三振全般）に倒れた場合、
 * 打席・打数・三振は前打者に記録し、それ以外の結果（四死球・安打・凡打・犠打飛・失策等）は代打に記録する（規則 9.15(b)）。
 */
export function isMidAtBatStrikeoutChargedToPriorBatter(
  priorBatter: MidAtBatPriorBatterInfo | null | undefined,
  isStrikeoutResult: boolean
): boolean {
  if (!priorBatter || !isStrikeoutResult) return false;
  return priorBatter.strikesBeforeSub >= 2;
}

// ============================================================================
// 公認野球規則 9.16(h)：カウント途中の救援投手四球・責任走者帰属
// ============================================================================

/**
 * カウント途中で救援投手が登板し打者が四球（敬遠含む）を得た場合、
 * 交代時カウントが 2-0, 2-1, 3-0, 3-1, 3-2 なら前任投手に四球・対戦打者・責任走者を帰属させ、
 * 2-2, 1-2, 1-1, 1-0, 0-2, 0-1, 0-0 または四球以外の全結果（死球・安打・凡打等）は救援投手に帰属させる（規則 9.16(h)）。
 */
export function isMidAtBatWalkChargedToPriorPitcher(
  priorPitcher: MidAtBatPriorPitcherInfo | null | undefined,
  isWalkResult: boolean
): boolean {
  if (!priorPitcher || !isWalkResult) return false;
  return (
    (priorPitcher.ballsBeforeChange === 2 &&
      priorPitcher.strikesBeforeChange <= 1) ||
    priorPitcher.ballsBeforeChange >= 3
  );
}

// ============================================================================
// 公認野球規則 9.06(b)/(c) ＆ 5.08(a)：アピールアウトによる安打格下げ・第3アウト得点取消判定
// ============================================================================

export interface AppealOutPlayAdjustment {
  hasAppealOut: boolean;
  /** 打者結果コードの格下げ（例: 二塁空過アピールアウトで二塁打→単打、一塁空過または強制進塁走者の空過で安打→ゴロ/野選） */
  downgradedResultCode: CanonicalAtBatResult | null;
  /** 第3アウトがこのアピールアウトで成立した場合、フォースアウト相当として同プレーの得点を全て取り消すか（規則 5.08(a)） */
  cancelsThirdOutRuns: boolean;
}

/**
 * 1打席内の `ScorebookV2Advance` に `method === "appeal_out"` が含まれる場合の
 * 安打格下げ（規則 9.05(b)(1), 9.06(b)/(c)）および第3アウト時の得点取消有無（規則 5.08(a)）を判定する。
 *
 * - 打者走者の空過アピールアウト:
 *   - 1B 空過 (`to === "1B"`): 安打取消（`groundout`）、第3アウトならフォース相当で全得点取消
 *   - 2B 空過 (`to === "2B"`): 単打（`single`）に格下げ、タイムプレー（アピール前の先行走者得点は有効）
 *   - 3B 空過 (`to === "3B"`): 二塁打（`double`）に格下げ、タイムプレー
 *   - HP 空過 (`to === "HP"`): 三塁打（`triple`）に格下げ、打者自身の得点のみ無効・先行走者得点は有効
 * - 先行走者のアピールアウト:
 *   - `appealType === "retouch_early"` または飛球アウト（`flyout` / `sac_fly` / `infield_fly`）での離塁アピール:
 *     フォースアウトではないため、第3アウトでもアピール成立前の本塁到達得点は認められる（タイムプレー）
 *   - `appealType === "missed_base_force"` または強制進塁義務のある次塁（例: 一塁走者の二塁空過）での空過アピール:
 *     フォースアウトとなるため、打者の安打は野選/ゴロに格下げされ、第3アウトなら全得点が取り消される
 */
export function resolveAppealOutPlayAdjustment(
  resultCode: CanonicalAtBatResult,
  advances: ReadonlyArray<ScorebookV2Advance>,
  occupiedBeforePlay: Readonly<Record<OccupiedBaseKey, string | null>>
): AppealOutPlayAdjustment {
  const appealAdvs = advances.filter(
    (a) => a.isOut && a.method === "appeal_out"
  );
  if (appealAdvs.length === 0) {
    return {
      hasAppealOut: false,
      downgradedResultCode: null,
      cancelsThirdOutRuns: false,
    };
  }

  const isFlyBallBatterOut =
    resultCode === "flyout" ||
    resultCode === "sac_fly" ||
    resultCode === "infield_fly";

  const isHitCode =
    resultCode === "single" ||
    resultCode === "double" ||
    resultCode === "triple" ||
    resultCode === "home_run";

  let downgradedResultCode: CanonicalAtBatResult | null = null;
  let cancelsThirdOutRuns = false;

  for (const ap of appealAdvs) {
    if (ap.appealType === "batting_out_of_turn") {
      downgradedResultCode = "groundout";
      continue;
    }

    if (ap.from === "BAT") {
      if (ap.to === "1B") {
        if (isHitCode) downgradedResultCode = "groundout";
        cancelsThirdOutRuns = true;
      } else if (ap.to === "2B") {
        if (
          resultCode === "double" ||
          resultCode === "triple" ||
          resultCode === "home_run"
        ) {
          downgradedResultCode = "single";
        }
      } else if (ap.to === "3B") {
        if (resultCode === "triple" || resultCode === "home_run") {
          downgradedResultCode = "double";
        }
      } else if (ap.to === "HP") {
        if (resultCode === "home_run") {
          downgradedResultCode = "triple";
        }
      }
      continue;
    }

    // 先行走者 (from: 1B / 2B / 3B) のアピールアウト
    if (ap.appealType === "retouch_early" || isFlyBallBatterOut) {
      // タッチアップ離塁アピールはタイムプレー（フォースアウトではない）
      continue;
    }
    if (ap.appealType === "missed_base_non_force") {
      continue;
    }

    const isForcedNextBase =
      ap.appealType === "missed_base_force" ||
      (!isFlyBallBatterOut &&
        ((ap.from === "1B" && ap.to === "2B") ||
          (ap.from === "2B" &&
            ap.to === "3B" &&
            Boolean(occupiedBeforePlay["1B"])) ||
          (ap.from === "3B" &&
            ap.to === "HP" &&
            Boolean(occupiedBeforePlay["1B"]) &&
            Boolean(occupiedBeforePlay["2B"]))));

    if (isForcedNextBase) {
      cancelsThirdOutRuns = true;
      if (isHitCode) {
        downgradedResultCode = "fc";
      }
    }
  }

  return {
    hasAppealOut: true,
    downgradedResultCode,
    cancelsThirdOutRuns,
  };
}

// ============================================================================
// 公認野球規則 9.17（勝敗投手）・9.18（完投/完封）・9.19（セーブ）＋ホールド＋9.01（記録員手動指定）
// ============================================================================

export interface MatchPitcherDecisionStintInput {
  pitcherKey: string;
  order: number;
  outsRecorded: number;
  runsAllowed: number;
  earnedRunsAllowed: number;
  hitsAllowed?: number;
  walksAllowed?: number;
  manualDecision?: OfficialPitcherDecision | null;
}

export interface MatchDefenseInningChronologyInput {
  inning: number;
  scoredRunsInOrder: ReadonlyArray<HalfInningChronologicalRunEvent>;
  pitcherEntrySnapshots: ReadonlyArray<HalfInningPitcherEntrySnapshot>;
}

export interface EvaluateMatchPitcherDecisionsInput {
  /** 自チームが先攻（true=表攻撃・裏守備）か後攻（false=表守備・裏攻撃）か */
  isMyTeamBatFirst: boolean;
  /** 規定イニング数（少年・中学・軟式一般7回制=7、高校・大学・プロ9回制=9） */
  scheduledInnings: number;
  myFinalScore: number;
  opponentFinalScore: number;
  myInningScores: ReadonlyArray<number>;
  opponentInningScores: ReadonlyArray<number>;
  pitchers: ReadonlyArray<MatchPitcherDecisionStintInput>;
  defenseInnings?: ReadonlyArray<MatchDefenseInningChronologyInput>;
}

export interface PitcherMatchDecisionOutcome {
  pitcherKey: string;
  decision: OfficialPitcherDecision;
  completeGame: boolean;
  shutout: boolean;
  isManualOverride: boolean;
}

export interface EvaluateMatchPitcherDecisionsResult {
  byPitcherKey: Map<string, PitcherMatchDecisionOutcome>;
  winningPitcherKey: string | null;
  losingPitcherKey: string | null;
  savingPitcherKey: string | null;
  holdPitcherKeys: string[];
  teamShutout: boolean;
  starterQualifyingOuts: number;
}

/**
 * 規定イニング数と実際の総守備アウト数から、先発投手の勝利資格アウト数を算出する（公認野球規則 9.17(a)）。
 * - 9回制: 原則 5回（15アウト）。5回コールド等の短縮試合（守備アウト 15 以下）では 4回（12アウト）。
 * - 7回制（JSBB軟式・中学・学童等）: 原則 4回（12アウト）。4回コールド等の短縮試合（守備アウト 12 以下）では 3回（9アウト）。
 */
export function getStarterWinQualifyingOuts(
  scheduledInnings: number,
  totalDefenseOuts: number
): number {
  if (totalDefenseOuts <= 0) {
    return scheduledInnings >= 8 ? 15 : 12;
  }
  if (scheduledInnings >= 8) {
    if (totalDefenseOuts <= 15) {
      return Math.min(12, totalDefenseOuts);
    }
    return 15;
  }
  // 7回制以下
  if (totalDefenseOuts <= 12) {
    return Math.min(9, totalDefenseOuts);
  }
  return 12;
}

/**
 * 1試合のイニングスコア・投手登板順・各守備イニングの時系列得点/登板スナップショットから、
 * 公認野球規則 9.17（勝投手・敗投手）、9.18（完投・個人完封 vs 継投完封・初回無死救援完封例外）、
 * 9.19（セーブ投手 3条件）、ホールド、および 9.01（公式記録員手動指定オーバーライド）を一括判定する。
 */
export function evaluateMatchPitcherDecisions(
  input: EvaluateMatchPitcherDecisionsInput
): EvaluateMatchPitcherDecisionsResult {
  const orderedPitchers = [...input.pitchers].sort((a, b) => a.order - b.order);
  const byPitcherKey = new Map<string, PitcherMatchDecisionOutcome>();

  if (orderedPitchers.length === 0) {
    return {
      byPitcherKey,
      winningPitcherKey: null,
      losingPitcherKey: null,
      savingPitcherKey: null,
      holdPitcherKeys: [],
      teamShutout: false,
      starterQualifyingOuts: getStarterWinQualifyingOuts(
        input.scheduledInnings,
        0
      ),
    };
  }

  const totalDefenseOuts = orderedPitchers.reduce(
    (acc, p) => acc + Math.max(0, p.outsRecorded),
    0
  );
  const starterQualifyingOuts = getStarterWinQualifyingOuts(
    input.scheduledInnings,
    totalDefenseOuts
  );

  const isFinishedComparisonValid =
    totalDefenseOuts > 0 ||
    input.myFinalScore > 0 ||
    input.opponentFinalScore > 0;
  const teamShutout =
    isFinishedComparisonValid &&
    totalDefenseOuts > 0 &&
    input.opponentFinalScore === 0;

  // 1) 完投（CG）＆ 個人完封（SHO）判定（公認野球規則 9.18）
  const completeGameByKey = new Map<string, boolean>();
  const shutoutByKey = new Map<string, boolean>();

  if (orderedPitchers.length === 1 && totalDefenseOuts > 0) {
    const soloKey = orderedPitchers[0]!.pitcherKey;
    completeGameByKey.set(soloKey, true);
    if (input.opponentFinalScore === 0) {
      shutoutByKey.set(soloKey, true);
    }
  } else if (
    orderedPitchers.length === 2 &&
    totalDefenseOuts > 0 &&
    input.opponentFinalScore === 0
  ) {
    // 公認野球規則 9.18 例外: 初回無死（1人もアウトを取る前）に救援登板し、最後まで無失点で投げ切った救援投手には個人完封を記録（完投は記録しない）
    const starter = orderedPitchers[0]!;
    const reliever = orderedPitchers[1]!;
    const inning1Chron = input.defenseInnings?.find((d) => d.inning === 1);
    const relieverSnap1 = inning1Chron?.pitcherEntrySnapshots.find(
      (s) => s.pitcherKey === reliever.pitcherKey
    );
    const enteredFirstInningZeroOuts = relieverSnap1
      ? relieverSnap1.outsAtEntry === 0
      : starter.outsRecorded === 0;
    if (
      starter.outsRecorded === 0 &&
      enteredFirstInningZeroOuts &&
      reliever.outsRecorded === totalDefenseOuts
    ) {
      shutoutByKey.set(reliever.pitcherKey, true);
    }
  }

  // 2) イニング・時系列イベント構築（defenseInnings が無い旧試合データのフォールバックも完備）
  const defenseChronMap = new Map<number, MatchDefenseInningChronologyInput>();
  for (const d of input.defenseInnings || []) {
    defenseChronMap.set(d.inning, d);
  }

  const maxInnings = Math.max(
    input.myInningScores.length,
    input.opponentInningScores.length,
    ...(input.defenseInnings || []).map((d) => d.inning),
    1
  );

  // フォールバック用: 各守備イニングの終了時投手を累積アウト数から推定
  let cumOutsCursor = 0;
  const fallbackPitcherForOutIndex = (targetOutOneBased: number): string => {
    let runSum = 0;
    for (const p of orderedPitchers) {
      runSum += Math.max(0, p.outsRecorded);
      if (runSum >= targetOutOneBased) {
        return p.pitcherKey;
      }
    }
    return orderedPitchers[orderedPitchers.length - 1]!.pitcherKey;
  };

  // フォールバック用失点割り当てプール
  const remainingFallbackRunsByKey = new Map<string, number>();
  for (const p of orderedPitchers) {
    remainingFallbackRunsByKey.set(p.pitcherKey, Math.max(0, p.runsAllowed));
  }

  interface RelieverStintTracking {
    pitcherKey: string;
    orderIdx: number;
    leadAtEntry: number;
    inheritedRunnersOnBase: number;
    relinquishedLeadDuringOrViaResponsibleRun: boolean;
    enteredGame: boolean;
  }

  const relieverTrackingByKey = new Map<string, RelieverStintTracking>();
  orderedPitchers.forEach((p, idx) => {
    if (idx === 0) return;
    relieverTrackingByKey.set(p.pitcherKey, {
      pitcherKey: p.pitcherKey,
      orderIdx: idx,
      leadAtEntry: 0,
      inheritedRunnersOnBase: 0,
      relinquishedLeadDuringOrViaResponsibleRun: false,
      enteredGame: false,
    });
  });

  let simMyScore = 0;
  let simOppScore = 0;
  let currentMoundPitcherKey = orderedPitchers[0]!.pitcherKey;
  let activeWinningPitcherOfRecordKey: string | null = null;
  let goAheadRunLosingPitcherKey: string | null = null;
  const enteredPitcherKeysSoFar = new Set<string>([
    orderedPitchers[0]!.pitcherKey,
  ]);

  const runOffenseHalf = (inn: number): void => {
    const addMy = Math.max(0, input.myInningScores[inn - 1] ?? 0);
    if (addMy <= 0) return;
    const prevMy = simMyScore;
    simMyScore += addMy;

    if (simMyScore >= simOppScore) {
      // 自チームが同点以上に追いついたため、それ以前の相手勝ち越しリードは消滅
      goAheadRunLosingPitcherKey = null;
    }
    if (prevMy <= simOppScore && simMyScore > simOppScore) {
      // 自チームが勝ち越した瞬間の責任投手（先攻1回表のみ先発投手、それ以外は直前の守備回を投げ終えた投手）
      activeWinningPitcherOfRecordKey =
        input.isMyTeamBatFirst && inn === 1
          ? orderedPitchers[0]!.pitcherKey
          : currentMoundPitcherKey;
    }
  };

  const runDefenseHalf = (inn: number): void => {
    const chron = defenseChronMap.get(inn);
    const oppRunsFromHeader = Math.max(
      0,
      input.opponentInningScores[inn - 1] ?? 0
    );
    const oppHalfStartScore = simOppScore;

    if (chron && (chron.pitcherEntrySnapshots.length > 0 || chron.scoredRunsInOrder.length > 0)) {
      // A) 救援投手の登板時点リード＆引き継ぎ走者スナップショットを記録
      for (const snap of chron.pitcherEntrySnapshots) {
        currentMoundPitcherKey = snap.pitcherKey;
        if (!enteredPitcherKeysSoFar.has(snap.pitcherKey)) {
          enteredPitcherKeysSoFar.add(snap.pitcherKey);
          const tr = relieverTrackingByKey.get(snap.pitcherKey);
          if (tr && !tr.enteredGame) {
            const oppAtEntry =
              oppHalfStartScore + snap.runsScoredInHalfBeforeEntry;
            tr.leadAtEntry = simMyScore - oppAtEntry;
            tr.inheritedRunnersOnBase = snap.inheritedRunnersOnBase;
            tr.enteredGame = true;
          }
        }
      }

      // B) 時系列順に相手得点を1点ずつ加算し、リード消滅・決勝点責任投手（9.17(d)）を追跡
      const runsList = chron.scoredRunsInOrder;
      const runCount = Math.max(runsList.length, oppRunsFromHeader);
      for (let rIdx = 0; rIdx < runCount; rIdx++) {
        const ev = runsList[rIdx];
        const respKey = ev?.responsiblePitcherKey || currentMoundPitcherKey;
        const prevOpp = simOppScore;
        simOppScore += 1;

        if (simOppScore >= simMyScore) {
          activeWinningPitcherOfRecordKey = null;
          // 既に登板済みの救援投手が守っていたリードが追いつかれたか記録（自身が降板後でも責任走者による同点ならホールド消滅）
          for (const tr of relieverTrackingByKey.values()) {
            if (!tr.enteredGame) continue;
            if (
              tr.pitcherKey === currentMoundPitcherKey ||
              tr.pitcherKey === respKey
            ) {
              tr.relinquishedLeadDuringOrViaResponsibleRun = true;
            }
          }
        }
        if (prevOpp === simMyScore && simOppScore === simMyScore + 1) {
          goAheadRunLosingPitcherKey = respKey;
        }
      }
      cumOutsCursor = Math.min(totalDefenseOuts, cumOutsCursor + 3);
    } else {
      // フォールバック（スコアボード得点＋投手別失点のみ存在する場合）
      const startOut = cumOutsCursor + 1;
      const endOut = Math.min(
        Math.max(totalDefenseOuts, startOut),
        cumOutsCursor + 3
      );
      const halfStartPitcher = fallbackPitcherForOutIndex(startOut);
      const halfEndPitcher = fallbackPitcherForOutIndex(endOut);

      for (const pk of [halfStartPitcher, halfEndPitcher]) {
        if (!enteredPitcherKeysSoFar.has(pk)) {
          enteredPitcherKeysSoFar.add(pk);
          const tr = relieverTrackingByKey.get(pk);
          if (tr && !tr.enteredGame) {
            tr.leadAtEntry = simMyScore - simOppScore;
            tr.inheritedRunnersOnBase = 0;
            tr.enteredGame = true;
          }
        }
      }

      for (let rIdx = 0; rIdx < oppRunsFromHeader; rIdx++) {
        // この回投げた投手のうち失点残枠がある投手を優先帰属
        let respKey = halfStartPitcher;
        if ((remainingFallbackRunsByKey.get(respKey) || 0) <= 0) {
          if ((remainingFallbackRunsByKey.get(halfEndPitcher) || 0) > 0) {
            respKey = halfEndPitcher;
          } else {
            const anyWithRuns = orderedPitchers.find(
              (p) => (remainingFallbackRunsByKey.get(p.pitcherKey) || 0) > 0
            );
            if (anyWithRuns) respKey = anyWithRuns.pitcherKey;
          }
        }
        remainingFallbackRunsByKey.set(
          respKey,
          Math.max(0, (remainingFallbackRunsByKey.get(respKey) || 0) - 1)
        );

        const prevOpp = simOppScore;
        simOppScore += 1;
        if (simOppScore >= simMyScore) {
          activeWinningPitcherOfRecordKey = null;
          for (const tr of relieverTrackingByKey.values()) {
            if (
              tr.enteredGame &&
              (tr.pitcherKey === halfEndPitcher || tr.pitcherKey === respKey)
            ) {
              tr.relinquishedLeadDuringOrViaResponsibleRun = true;
            }
          }
        }
        if (prevOpp === simMyScore && simOppScore === simMyScore + 1) {
          goAheadRunLosingPitcherKey = respKey;
        }
      }

      currentMoundPitcherKey = halfEndPitcher;
      cumOutsCursor = Math.min(totalDefenseOuts, cumOutsCursor + 3);
    }
  };

  for (let inn = 1; inn <= maxInnings; inn++) {
    if (input.isMyTeamBatFirst) {
      runOffenseHalf(inn);
      runDefenseHalf(inn);
    } else {
      runDefenseHalf(inn);
      runOffenseHalf(inn);
    }
  }

  // イニングスコア配列と最終スコアに差分がある場合の最終整合補正
  if (simMyScore !== input.myFinalScore || simOppScore !== input.opponentFinalScore) {
    simMyScore = input.myFinalScore;
    simOppScore = input.opponentFinalScore;
  }

  // 登板スナップショットに現れなかった救援投手（0アウト降板やイニング情報省略時）の補完
  for (const tr of relieverTrackingByKey.values()) {
    if (!tr.enteredGame) {
      tr.leadAtEntry = input.myFinalScore - input.opponentFinalScore;
      tr.inheritedRunnersOnBase = 0;
      tr.enteredGame = true;
    }
  }

  // 3) 自動勝・敗・S・H決定
  let autoWinKey: string | null = null;
  let autoLossKey: string | null = null;
  let autoSaveKey: string | null = null;
  const autoHoldKeys = new Set<string>();

  if (isFinishedComparisonValid && input.myFinalScore > input.opponentFinalScore) {
    const starter = orderedPitchers[0]!;
    const candidateWinKey =
      activeWinningPitcherOfRecordKey || starter.pitcherKey;

    if (candidateWinKey === starter.pitcherKey) {
      if (
        starter.outsRecorded >= starterQualifyingOuts ||
        orderedPitchers.length === 1
      ) {
        autoWinKey = starter.pitcherKey;
      } else {
        // 公認野球規則 9.17(b): 先発投手が規定投球回未満で降板した場合、最も有効な投球をした救援投手を勝投手とする
        const relievers = orderedPitchers.slice(1);
        let bestReliever = relievers[0]!;
        let bestScore = -Infinity;
        for (const rel of relievers) {
          const effectiveness =
            rel.outsRecorded * 2 -
            rel.runsAllowed * 6 -
            rel.earnedRunsAllowed * 3 -
            (rel.hitsAllowed || 0) -
            (rel.walksAllowed || 0) +
            (rel.outsRecorded >= 3 ? 4 : 0);
          if (effectiveness > bestScore) {
            bestScore = effectiveness;
            bestReliever = rel;
          }
        }
        autoWinKey = bestReliever.pitcherKey;
      }
    } else {
      autoWinKey = candidateWinKey;
    }

    // 公認野球規則 9.19: セーブ判定（勝チームの最終投手・非勝利投手・最低1/3回・リード時登板かつリード保持・3条件のいずれか）
    if (orderedPitchers.length >= 2) {
      const closer = orderedPitchers[orderedPitchers.length - 1]!;
      const closerTr = relieverTrackingByKey.get(closer.pitcherKey);
      if (
        closer.pitcherKey !== autoWinKey &&
        closer.outsRecorded >= 1 &&
        closerTr &&
        closerTr.leadAtEntry >= 1 &&
        !closerTr.relinquishedLeadDuringOrViaResponsibleRun
      ) {
        const cond1 =
          closerTr.leadAtEntry <= 3 && closer.outsRecorded >= 3;
        const cond2 =
          closerTr.leadAtEntry <= closerTr.inheritedRunnersOnBase + 2;
        const cond3 = closer.outsRecorded >= 9;
        if (cond1 || cond2 || cond3) {
          autoSaveKey = closer.pitcherKey;
        }
      }
    }
  } else if (
    isFinishedComparisonValid &&
    input.myFinalScore < input.opponentFinalScore
  ) {
    // 公認野球規則 9.17(d): 決勝点（相手チームが以後一度もリードを奪い返されなかった勝ち越し点）の責任投手が敗投手
    if (goAheadRunLosingPitcherKey) {
      autoLossKey = goAheadRunLosingPitcherKey;
    } else {
      const fallbackLoser =
        orderedPitchers.find((p) => p.runsAllowed > 0) || orderedPitchers[0]!;
      autoLossKey = fallbackLoser.pitcherKey;
    }
  }

  // ホールド判定（中継ぎ投手：1 <= idx < length - 1、勝・敗・S以外、セーブ機会で登板し1アウト以上記録してリードを保ったまま降板）
  if (isFinishedComparisonValid && orderedPitchers.length >= 2) {
    for (let idx = 1; idx < orderedPitchers.length - 1; idx++) {
      const mid = orderedPitchers[idx]!;
      if (
        mid.pitcherKey === autoWinKey ||
        mid.pitcherKey === autoLossKey ||
        mid.pitcherKey === autoSaveKey
      ) {
        continue;
      }
      const tr = relieverTrackingByKey.get(mid.pitcherKey);
      if (!tr) continue;
      const enteredInSaveSituation =
        tr.leadAtEntry >= 1 &&
        (tr.leadAtEntry <= 3 ||
          tr.leadAtEntry <= tr.inheritedRunnersOnBase + 2);
      if (
        mid.outsRecorded >= 1 &&
        enteredInSaveSituation &&
        !tr.relinquishedLeadDuringOrViaResponsibleRun
      ) {
        autoHoldKeys.add(mid.pitcherKey);
      }
    }
  }

  // 4) 公式記録員の手動指定オーバーライド反映（公認野球規則 9.01 / 9.17(b)/(c)）
  const manualWin = orderedPitchers.find((p) => p.manualDecision === "win");
  const manualLoss = orderedPitchers.find((p) => p.manualDecision === "loss");
  const manualSave = orderedPitchers.find((p) => p.manualDecision === "save");

  if (manualWin) {
    autoWinKey = manualWin.pitcherKey;
    if (autoSaveKey === manualWin.pitcherKey) autoSaveKey = null;
    autoHoldKeys.delete(manualWin.pitcherKey);
  }
  if (manualLoss) {
    autoLossKey = manualLoss.pitcherKey;
    autoHoldKeys.delete(manualLoss.pitcherKey);
  }
  if (manualSave) {
    autoSaveKey = manualSave.pitcherKey;
    if (autoWinKey === manualSave.pitcherKey) autoWinKey = null;
    autoHoldKeys.delete(manualSave.pitcherKey);
  }

  let finalWinKey: string | null = null;
  let finalLossKey: string | null = null;
  let finalSaveKey: string | null = null;
  const finalHoldKeys: string[] = [];

  for (const p of orderedPitchers) {
    let decision: OfficialPitcherDecision = "none";
    const hasManual =
      p.manualDecision !== undefined && p.manualDecision !== null;

    if (hasManual) {
      decision = p.manualDecision!;
    } else if (p.pitcherKey === autoWinKey) {
      decision = "win";
    } else if (p.pitcherKey === autoLossKey) {
      decision = "loss";
    } else if (p.pitcherKey === autoSaveKey) {
      decision = "save";
    } else if (autoHoldKeys.has(p.pitcherKey)) {
      decision = "hold";
    }

    if (decision === "win") finalWinKey = p.pitcherKey;
    else if (decision === "loss") finalLossKey = p.pitcherKey;
    else if (decision === "save") finalSaveKey = p.pitcherKey;
    else if (decision === "hold") finalHoldKeys.push(p.pitcherKey);

    byPitcherKey.set(p.pitcherKey, {
      pitcherKey: p.pitcherKey,
      decision,
      completeGame: completeGameByKey.get(p.pitcherKey) ?? false,
      shutout: shutoutByKey.get(p.pitcherKey) ?? false,
      isManualOverride: hasManual,
    });
  }

  return {
    byPitcherKey,
    winningPitcherKey: finalWinKey,
    losingPitcherKey: finalLossKey,
    savingPitcherKey: finalSaveKey,
    holdPitcherKeys: finalHoldKeys,
    teamShutout,
    starterQualifyingOuts,
  };
}

// ============================================================================
// 公認野球規則 9.20：連続試合安打・連続試合出塁の公式判定
// ============================================================================

export interface OfficialStreakGameLogInput {
  pa: number;
  ab: number;
  hits: number;
  walks: number;
  hbp: number;
  sacBunts: number;
  sacFlies: number;
  interferences?: number;
}

export interface OfficialStreaksResult {
  currentHitStreak: number;
  maxHitStreak: number;
  currentOnBaseStreak: number;
  maxOnBaseStreak: number;
}

/**
 * 時系列順（古い試合 → 新しい試合）の打撃成績リストから、公認野球規則 9.20(b) に準拠した
 * 連続試合安打および連続試合出塁を算出する。
 *
 * - 規則 9.20(b):
 *   - 1試合の全打席が 四球・死球・打撃妨害/走塁妨害・犠打（バント）のみで構成され無安打（`hits === 0 && ab === 0 && sacFlies === 0`）の場合、
 *     連続試合安打は「加算はしないが中断（終了）もしない」（スルー継続）。
 *   - 犠飛（`sacFlies > 0`）が含まれて無安打だった場合は、打数 0 でも連続試合安打は「中断（0にリセット）」される！
 *   - 打席 0（代走・守備固めのみ出場）の試合も中断しない。
 */
export function evaluateOfficialStreaks(
  chronologicalGames: ReadonlyArray<OfficialStreakGameLogInput>
): OfficialStreaksResult {
  let currentHitStreak = 0;
  let maxHitStreak = 0;
  let currentOnBaseStreak = 0;
  let maxOnBaseStreak = 0;

  for (const g of chronologicalGames) {
    if (g.pa <= 0) {
      continue;
    }

    // 1) 連続試合安打（規則 9.20(b)）
    if (g.hits > 0) {
      currentHitStreak += 1;
      if (currentHitStreak > maxHitStreak) {
        maxHitStreak = currentHitStreak;
      }
    } else if (g.ab === 0 && g.sacFlies === 0) {
      // 全打席が BB / IBB / HBP / SH / CI のみ -> 中断せず継続
    } else {
      // 有効打数あり無安打 または 犠飛あり無安打 -> 中断
      currentHitStreak = 0;
    }

    // 2) 連続試合出塁
    const reachedOnBase =
      g.hits + g.walks + g.hbp + (g.interferences || 0);
    if (reachedOnBase > 0) {
      currentOnBaseStreak += 1;
      if (currentOnBaseStreak > maxOnBaseStreak) {
        maxOnBaseStreak = currentOnBaseStreak;
      }
    } else if (g.ab === 0 && g.sacFlies === 0) {
      // 全打席が犠打（SH）のみ -> 中断せず継続
    } else {
      currentOnBaseStreak = 0;
    }
  }

  return {
    currentHitStreak,
    maxHitStreak,
    currentOnBaseStreak,
    maxOnBaseStreak,
  };
}

// ============================================================================
// 公認野球規則 9.22：規定打席・規定投球回 ＆ 9.22(a) 不足打席凡打加算による例外首位資格
// ============================================================================

export interface OfficialBattingQualificationCandidate {
  id: string;
  pa: number;
  ab: number;
  hits: number;
  totalBases: number;
  walks: number;
  hbp: number;
  sacFlies: number;
}

export type OfficialBattingRateCategory = "avg" | "obp" | "slg" | "ops";

export interface OfficialBattingQualificationEntry {
  id: string;
  isRegulationQualified: boolean;
  /** 規定打席未満だが、不足打席数を凡打として加算した仮想率でも全規定到達者を上回り首位となる例外資格（規則 9.22(a)） */
  qualifiedByRule922Exception: boolean;
  rawRate: number;
  hypotheticalRateWithHitlessShortfall: number;
}

export interface OfficialBattingTitleEvaluation {
  regulationPa: number;
  entries: Map<string, OfficialBattingQualificationEntry>;
  leaderId: string | null;
  isReferenceRecordOnly: boolean;
}

/**
 * チーム試合数と平均規定イニング数（9回制=9, 7回制=7）から規定打席数を算出する（規則 9.22(a)）。
 * - 9回制: `Math.round(teamGames * 3.1)`
 * - 7回制・混在時: イニング比 `avgScheduledInnings / 9` で按分（最低 1 打席）
 */
export function getOfficialRegulationPlateAppearances(
  teamGames: number,
  avgScheduledInnings = 9
): number {
  if (teamGames <= 0) return 0;
  const inningRatio =
    avgScheduledInnings > 0 ? avgScheduledInnings / 9 : 1;
  return Math.max(1, Math.round(teamGames * 3.1 * inningRatio));
}

/**
 * チーム試合数と平均規定イニング数から規定投球回（アウト数単位: 3アウト = 1.0回）を算出する（規則 9.22(b)）。
 * - 9回制: 試合数 × 1.0回（= `teamGames * 3` アウト）
 * - 7回制・混在時: イニング比 `avgScheduledInnings / 9` で按分（最低 3 アウト = 1.0回）
 */
export function getOfficialRegulationPitchingOuts(
  teamGames: number,
  avgScheduledInnings = 9
): number {
  if (teamGames <= 0) return 0;
  const inningRatio =
    avgScheduledInnings > 0 ? avgScheduledInnings / 9 : 1;
  return Math.max(3, Math.round(teamGames * 3 * inningRatio));
}

function calcRateWithAddedHitlessAtBats(
  c: OfficialBattingQualificationCandidate,
  addedHitlessAb: number,
  category: OfficialBattingRateCategory
): number {
  const adjAb = c.ab + Math.max(0, addedHitlessAb);
  const obpDenom = adjAb + c.walks + c.hbp + c.sacFlies;
  const avg = adjAb > 0 ? c.hits / adjAb : 0;
  const obp = obpDenom > 0 ? (c.hits + c.walks + c.hbp) / obpDenom : 0;
  const slg = adjAb > 0 ? c.totalBases / adjAb : 0;
  if (category === "avg") return avg;
  if (category === "obp") return obp;
  if (category === "slg") return slg;
  return obp + slg;
}

/**
 * 公認野球規則 9.22(a) に基づき、打率・出塁率・長打率・OPS の規定打席到達および
 * 「不足打席を凡打（無安打の打数）として加算してもなお最高率となる打者の例外首位資格」を判定する。
 */
export function evaluateOfficialBattingTitleQualification(
  candidates: ReadonlyArray<OfficialBattingQualificationCandidate>,
  teamGames: number,
  category: OfficialBattingRateCategory = "avg",
  avgScheduledInnings = 9
): OfficialBattingTitleEvaluation {
  const regulationPa = getOfficialRegulationPlateAppearances(
    teamGames,
    avgScheduledInnings
  );
  const entries = new Map<string, OfficialBattingQualificationEntry>();

  if (candidates.length === 0 || regulationPa <= 0) {
    return {
      regulationPa,
      entries,
      leaderId: null,
      isReferenceRecordOnly: true,
    };
  }

  let bestRegulationRate = -1;
  let bestRegulationId: string | null = null;

  for (const c of candidates) {
    const rawRate = calcRateWithAddedHitlessAtBats(c, 0, category);
    const shortfall = Math.max(0, regulationPa - c.pa);
    const hypoRate = calcRateWithAddedHitlessAtBats(c, shortfall, category);
    const isReg = c.pa >= regulationPa && (category === "obp" ? c.pa > 0 : c.ab > 0);

    if (isReg && rawRate > bestRegulationRate) {
      bestRegulationRate = rawRate;
      bestRegulationId = c.id;
    }

    entries.set(c.id, {
      id: c.id,
      isRegulationQualified: isReg,
      qualifiedByRule922Exception: false,
      rawRate,
      hypotheticalRateWithHitlessShortfall: hypoRate,
    });
  }

  // 規則 9.22(a) 例外判定: 規定打席到達者が存在するとき、規定打席未満でも不足打席分を凡打加算した仮想率が全規定到達者の最高率を上回る場合は首位有資格者とする
  let bestExceptionId: string | null = null;
  let bestExceptionHypoRate = bestRegulationRate;

  if (bestRegulationId !== null) {
    for (const c of candidates) {
      if (c.pa <= 0 || c.pa >= regulationPa) continue;
      const entry = entries.get(c.id)!;
      if (entry.hypotheticalRateWithHitlessShortfall > bestExceptionHypoRate) {
        bestExceptionHypoRate = entry.hypotheticalRateWithHitlessShortfall;
        bestExceptionId = c.id;
      }
    }
  }

  if (bestExceptionId) {
    const exEntry = entries.get(bestExceptionId)!;
    exEntry.qualifiedByRule922Exception = true;
    return {
      regulationPa,
      entries,
      leaderId: bestExceptionId,
      isReferenceRecordOnly: false,
    };
  }

  if (bestRegulationId) {
    return {
      regulationPa,
      entries,
      leaderId: bestRegulationId,
      isReferenceRecordOnly: false,
    };
  }

  // シーズン序盤等で規定打席到達者・9.22(a)例外者ともに0人の場合は参考記録リーダーを返す
  let fallbackId: string | null = null;
  let fallbackRate = -1;
  for (const c of candidates) {
    if (c.pa <= 0) continue;
    const entry = entries.get(c.id)!;
    if (entry.rawRate > fallbackRate) {
      fallbackRate = entry.rawRate;
      fallbackId = c.id;
    }
  }

  return {
    regulationPa,
    entries,
    leaderId: fallbackId,
    isReferenceRecordOnly: true,
  };
}


