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
  }) | null;
  advances: HalfInningAdvanceEventInput[];
}

export interface PitcherHalfInningCharge {
  outs: number;
  battersFaced: number;
  runs: number;
  earnedRuns: number;
  dtsWildPitches: number;
}

export interface HalfInningEarnedRunDetails {
  pitcherCharges: Map<string, PitcherHalfInningCharge>;
  earnedOriginAtBatIds: Set<string>;
  unearnedOriginAtBatIds: Set<string>;
  teamEarnedRuns: number;
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
  let nextTokenSeq = 1;

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
    return tok;
  };

  let actualOuts = 0;
  const firstPitcherKey =
    plays.find((p) => Boolean(p.pitcherKey))?.pitcherKey || "";
  // 公認野球規則 9.16(i): 救援投手は登板前に記録された失策による仮想アウトの恩恵を受けない
  const pitcherStintByKey = new Map<string, number>();
  let nextStintSeq = 0;
  if (firstPitcherKey) {
    pitcherStintByKey.set(firstPitcherKey, nextStintSeq++);
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
    const pKey = play.pitcherKey || firstPitcherKey;
    if (pKey && !pitcherStintByKey.has(pKey)) {
      pitcherStintByKey.set(pKey, nextStintSeq++);
    }
    const curStint = pitcherStintByKey.get(pKey) ?? 0;
    const pCharge = pKey ? ensurePitcher(pKey) : null;
    const cls = classifyAtBatResultToken(play.rawResult, play.snapAb);

    if (!cls.isUnfinishedRunnerOut && pCharge) {
      pCharge.battersFaced += 1;
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

    const prePlayAdvs = resolvedAdvances.filter(
      (a) =>
        a.reason.toLowerCase() !== "tiebreak" &&
        a.fromBase > 0 &&
        isPrePlayReason(a.reason)
    );
    const inPlayAdvs = resolvedAdvances.filter(
      (a) =>
        a.reason.toLowerCase() !== "tiebreak" &&
        !(a.fromBase > 0 && isPrePlayReason(a.reason))
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
          token.actualScored = true;
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
          token.actualScored = true;
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
          onBase.actualScored = true;
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
              pushed.actualScored = true;
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
          onBase.actualScored = true;
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
        onBase.actualScored = true;
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

  return {
    pitcherCharges: charges,
    earnedOriginAtBatIds,
    unearnedOriginAtBatIds,
    teamEarnedRuns,
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

