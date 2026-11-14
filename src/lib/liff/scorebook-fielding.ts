// filepath: src/lib/liff/scorebook-fielding.ts
import type {
  CanonicalAtBatResult,
  ScorebookV2Advance,
  ScorebookV2AtBat,
} from "@/types/scorebook-v2";

export type DefensivePosNumber =
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9";

export type HitZoneOption =
  | "front"
  | "over"
  | "line"
  | "gap_lc"
  | "gap_rc"
  | "infield";

export type FlyStyleOption = "fly" | "foul_fly" | "liner";

export type AssistTargetOption =
  | "1"
  | "3"
  | "4"
  | "6"
  | "5"
  | "2"
  | "base_a"
  | "base_b"
  | "base_c"
  | "base_h"
  | "touch_out"
  | "unassisted";

export type ErrorStyleOption = "fielding" | "throwing";

export interface DefensivePositionDef {
  code: DefensivePosNumber;
  shortJa: string;
  fullJa: string;
  badgeLabel: string;
  isOutfield: boolean;
}

export const DEFENSIVE_POSITIONS: readonly DefensivePositionDef[] = [
  { code: "1", shortJa: "投", fullJa: "投手", badgeLabel: "1 投", isOutfield: false },
  { code: "2", shortJa: "捕", fullJa: "捕手", badgeLabel: "2 捕", isOutfield: false },
  { code: "3", shortJa: "一", fullJa: "一塁", badgeLabel: "3 一", isOutfield: false },
  { code: "4", shortJa: "二", fullJa: "二塁", badgeLabel: "4 二", isOutfield: false },
  { code: "5", shortJa: "三", fullJa: "三塁", badgeLabel: "5 三", isOutfield: false },
  { code: "6", shortJa: "遊", fullJa: "遊撃", badgeLabel: "6 遊", isOutfield: false },
  { code: "7", shortJa: "左", fullJa: "左翼", badgeLabel: "7 左", isOutfield: true },
  { code: "8", shortJa: "中", fullJa: "中堅", badgeLabel: "8 中", isOutfield: true },
  { code: "9", shortJa: "右", fullJa: "右翼", badgeLabel: "9 右", isOutfield: true },
] as const;

export const DP_RELAY_PRESETS: readonly string[] = [
  "6-4-3",
  "4-6-3",
  "5-4-3",
  "1-6-3",
  "1-4-3",
  "3-6-3",
  "3-6-1",
  "1-2-3",
  "5-2-3",
  "6-3",
  "4-3",
] as const;

export function getDefensivePositionDef(
  code: string | undefined | null
): DefensivePositionDef | null {
  if (!code) return null;
  return DEFENSIVE_POSITIONS.find((p) => p.code === code) || null;
}

export function getDefaultDpRelay(primaryPos: DefensivePosNumber): string {
  switch (primaryPos) {
    case "1":
      return "1-6-3";
    case "2":
      return "2-6-3";
    case "3":
      return "3-6-3";
    case "4":
      return "4-6-3";
    case "5":
      return "5-4-3";
    case "6":
      return "6-4-3";
    case "7":
      return "7-2";
    case "8":
      return "8-2";
    case "9":
      return "9-2";
  }
}

export interface ParsedFieldingMeta {
  primaryPos: DefensivePosNumber | "";
  assistTargetPos: AssistTargetOption | "";
  dpRelay: string;
  hitZone: HitZoneOption;
  flyStyle: FlyStyleOption;
  errorStyle: ErrorStyleOption;
  isBunt: boolean;
}

const JA_CHAR_TO_POS: ReadonlyArray<readonly [string, DefensivePosNumber]> = [
  ["遊撃", "6"],
  ["左翼", "7"],
  ["中堅", "8"],
  ["右翼", "9"],
  ["一塁", "3"],
  ["二塁", "4"],
  ["三塁", "5"],
  ["投手", "1"],
  ["捕手", "2"],
  ["ショート", "6"],
  ["セカンド", "4"],
  ["サード", "5"],
  ["ファースト", "3"],
  ["ピッチャー", "1"],
  ["キャッチャー", "2"],
  ["レフト", "7"],
  ["センター", "8"],
  ["ライト", "9"],
  ["投", "1"],
  ["捕", "2"],
  ["一", "3"],
  ["二", "4"],
  ["三", "5"],
  ["遊", "6"],
  ["左", "7"],
  ["中", "8"],
  ["右", "9"],
];

function isValidPosDigit(d: string | undefined): d is DefensivePosNumber {
  return Boolean(d && /^[1-9]$/.test(d));
}

function normalizeFieldingAscii(raw: string): string {
  return raw
    .replace(/[０-９]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
    )
    .replace(/[Ａ-Ｚａ-ｚ]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
    )
    .replace(/\bFC\s+([1-9])/gi, "FC$1")
    .replace(
      /((?:FC|E)?[1-9](?:FC|E)?)\s*[－ー―‐=＝→⇒➡-]\s*(E?[1-9]E?)/gi,
      "$1-$2"
    )
    .replace(
      /((?:FC|E)?[1-9](?:FC|E)?)\s*[－ー―‐=＝→⇒➡-]\s*(E?[1-9]E?)/gi,
      "$1-$2"
    );
}

/**
 * 既存の battedDirection と resultLabel から守備位置番号（1〜9）・送球先・打球性質を逆解析する
 */
export function parseFieldingMeta(
  resultCode: CanonicalAtBatResult,
  battedDirection: string | undefined | null,
  resultLabel: string | undefined | null
): ParsedFieldingMeta {
  const dir = normalizeFieldingAscii((battedDirection || "").trim());
  const label = normalizeFieldingAscii((resultLabel || "").trim());
  const combined = `${dir} ${label}`;

  let primaryPos: DefensivePosNumber | "" = "";
  let assistTargetPos: AssistTargetOption | "" = "";
  let dpRelay = "";
  let hitZone: HitZoneOption =
    resultCode === "double" ||
    resultCode === "triple" ||
    resultCode === "home_run"
      ? "over"
      : "front";
  let flyStyle: FlyStyleOption = "fly";
  let errorStyle: ErrorStyleOption = "fielding";
  const isBunt =
    resultCode === "sac_bunt" ||
    (!/3バント|スリーバント/.test(label) && /バント/.test(label)) ||
    /^BH(?:[1-9](?:-[1-9])?)?$/i.test(dir) ||
    /^[1-9]BH$/i.test(dir) ||
    /^B(?=[1-9](?:-[1-9]|F|L)?$)/i.test(dir) ||
    /^□/.test(dir) ||
    (resultCode !== "flyout" && /^\[[1-9](?:-[1-9])+\]$/.test(dir));

  // 四死球・三振・打席途中断は野手の守備位置（1〜9）を持たないため、「空振り三振」の『三』や「打席途中断」の『中』の誤抽出を防ぐ
  if (
    resultCode === "walk" ||
    resultCode === "intentional_walk" ||
    resultCode === "hit_by_pitch" ||
    resultCode === "strikeout" ||
    resultCode === "other"
  ) {
    return {
      primaryPos: "",
      assistTargetPos: "",
      dpRelay: "",
      hitZone,
      flyStyle,
      errorStyle,
      isBunt: false,
    };
  }

  const isHitCode =
    resultCode === "single" ||
    resultCode === "double" ||
    resultCode === "triple" ||
    resultCode === "home_run";

  // 1. 左中間 / 右中間 の判定
  if (
    dir === "7-8" ||
    dir === "78" ||
    label.includes("左中間")
  ) {
    primaryPos = "7";
    hitZone = "gap_lc";
  } else if (
    dir === "8-9" ||
    dir === "89" ||
    label.includes("右中間")
  ) {
    primaryPos = "9";
    hitZone = "gap_rc";
  }

  // 2. 3連以上の中継（6-4-3, DP6-4-3, (5-4-3) 等）
  const threeRelayMatch = combined.match(
    /(?<![0-9])([1-9]-[1-9]-[1-9])(?![0-9])/
  );
  if (threeRelayMatch) {
    dpRelay = threeRelayMatch[1];
    const firstDigit = dpRelay[0];
    if (isValidPosDigit(firstDigit)) {
      primaryPos = firstDigit;
    }
  }

  // 2.5. 悪送球＋送球先（4E-3, 6E-4, E4-3 等）および送球先落球（6-3E, 6-E3 等）
  const throwingErrorRelayMatch = !threeRelayMatch
    ? combined.match(
        /(?<![0-9A-Za-z-])(?:E([1-9])|([1-9])E)-([1-9])(?![0-9A-Za-z-])/i
      )
    : null;
  const catchingErrorRelayMatch =
    !threeRelayMatch && !throwingErrorRelayMatch
      ? combined.match(
          /(?<![0-9A-Za-z-])([1-9])-(?:E([1-9])|([1-9])E)(?![0-9A-Za-z-])/i
        )
      : null;

  if (throwingErrorRelayMatch) {
    const p1 = throwingErrorRelayMatch[1] || throwingErrorRelayMatch[2];
    const p2 = throwingErrorRelayMatch[3];
    if (isValidPosDigit(p1)) {
      primaryPos = p1;
    }
    if (
      p2 === "1" ||
      p2 === "2" ||
      p2 === "3" ||
      p2 === "4" ||
      p2 === "5" ||
      p2 === "6"
    ) {
      assistTargetPos = p2;
    }
    errorStyle = "throwing";
  } else if (catchingErrorRelayMatch) {
    const thrower = catchingErrorRelayMatch[1];
    const receiver = catchingErrorRelayMatch[2] || catchingErrorRelayMatch[3];
    if (label.includes("悪送球")) {
      if (isValidPosDigit(thrower)) {
        primaryPos = thrower;
      }
      if (
        receiver === "1" ||
        receiver === "2" ||
        receiver === "3" ||
        receiver === "4" ||
        receiver === "5" ||
        receiver === "6"
      ) {
        assistTargetPos = receiver;
      }
      errorStyle = "throwing";
    } else {
      if (isValidPosDigit(receiver)) {
        primaryPos = receiver;
      }
      errorStyle = "fielding";
    }
  }

  // 2.6. 野選＋送球先（FC6-2, FC5-2, FC4-6, 6FC-2 等）
  const fcRelayMatch =
    !threeRelayMatch &&
    !throwingErrorRelayMatch &&
    !catchingErrorRelayMatch
      ? combined.match(
          /(?<![0-9A-Za-z-])(?:FC([1-9])|([1-9])FC)-([1-9])(?![0-9A-Za-z-])/i
        )
      : null;
  if (fcRelayMatch) {
    const p1 = fcRelayMatch[1] || fcRelayMatch[2];
    const p2 = fcRelayMatch[3];
    if (isValidPosDigit(p1)) {
      primaryPos = p1;
    }
    if (
      p2 === "1" ||
      p2 === "2" ||
      p2 === "3" ||
      p2 === "4" ||
      p2 === "5" ||
      p2 === "6"
    ) {
      assistTargetPos = p2;
    }
  }

  // 3. 2連送球（6-3, 3-1, 6-4B, 6-5C, 5-2H, 〜6-3, [1-3], ◇5-3, B1-3, BH5-3, K 2-3 等 ※7-8/8-9の安打は除外）
  const twoRelayMatch =
    !threeRelayMatch &&
    !throwingErrorRelayMatch &&
    !catchingErrorRelayMatch &&
    !fcRelayMatch &&
    !(isHitCode && (hitZone === "gap_lc" || hitZone === "gap_rc"))
      ? combined.match(
          /(?:(?<![0-9A-Za-z-])|(?<=\bBH|\bB))([1-9])-([1-9])(?:A|B|C|H|TO)?(?![0-9A-Za-z-])/i
        )
      : null;
  if (twoRelayMatch) {
    const p1 = twoRelayMatch[1];
    const p2 = twoRelayMatch[2];
    if (isValidPosDigit(p1) && !primaryPos) {
      primaryPos = p1;
    }
    if (
      p2 === "1" ||
      p2 === "2" ||
      p2 === "3" ||
      p2 === "4" ||
      p2 === "5" ||
      p2 === "6"
    ) {
      assistTargetPos = p2;
    }
    if (
      (resultCode === "double_play" || resultCode === "triple_play") &&
      !dpRelay
    ) {
      dpRelay = `${p1}-${p2}`;
    }
  }

  // 4. E6 / 4E / FC6 / K-E2 / 6F / 6L / 6IF / 3A / 6B / 5C / 2H / 3TO / ⌒4 / ︵4 / 傘4 / △2 / (2) / [1] / ◇3 / 4￣ / 単独 1〜9
  if (!primaryPos) {
    const strippedDecorDir = dir
      .replace(/[\u0304\u0305]/g, "")
      .replace(/^[⌒︵︶∩^傘~〜￣ー\-△▲□◇◯○[({\uff08\s]+/, "")
      .replace(/[⌒︵︶∩^傘~〜￣ー\-△▲□◇◯○\])}\uff09,，.\s]+$/, "");
    const baseStepOrTouchMatch =
      strippedDecorDir.match(
        /^(?:BH|B|K\s*(?:-\s*)?\s*)?([1-9])\s*(A|B|C|H|TO)$/i
      ) ||
      label.match(
        /\((?:BH|B|K\s*(?:-\s*)?\s*)?([1-9])\s*(A|B|C|H|TO)\)/i
      );
    const suffixErrorMatch =
      !baseStepOrTouchMatch &&
      (strippedDecorDir.match(/^([1-9])\s*E$/i) ||
        label.match(/\(([1-9])E\)/i));
    const codeDigitMatch =
      baseStepOrTouchMatch ||
      suffixErrorMatch ||
      strippedDecorDir.match(
        /^(?:BH|B|E|FC|INT|K\s*(?:-\s*E|E|-)?\s*)?([1-9])(?:BH|B|F|L|IF|SF|E|FC|G)?$/i
      ) ||
      strippedDecorDir.match(/^([1-9])\s*(?:BH|E|FC|失)$/i) ||
      label.match(
        /\((?:BH|B|E|FC|K\s*(?:-\s*E|E|-)?\s*)?([1-9])(?:BH|FC|G)?\)/i
      );
    if (baseStepOrTouchMatch && isValidPosDigit(baseStepOrTouchMatch[1])) {
      primaryPos = baseStepOrTouchMatch[1];
      const sfx = baseStepOrTouchMatch[2].toUpperCase();
      if (sfx === "A") assistTargetPos = "base_a";
      else if (sfx === "B") assistTargetPos = "base_b";
      else if (sfx === "C") assistTargetPos = "base_c";
      else if (sfx === "H") assistTargetPos = "base_h";
      else if (sfx === "TO") assistTargetPos = "touch_out";
    } else if (codeDigitMatch && isValidPosDigit(codeDigitMatch[1])) {
      primaryPos = codeDigitMatch[1];
      if (
        resultCode === "groundout" ||
        resultCode === "sac_bunt" ||
        resultCode === "dropped_third_strike_out" ||
        resultCode === "fc" ||
        (resultCode === "single" &&
          (Number(codeDigitMatch[1]) <= 6 ||
            label.includes("内野安打") ||
            label.includes("内安") ||
            label.includes("強襲")))
      ) {
        assistTargetPos = "unassisted";
      } else if (
        resultCode === "error" &&
        suffixErrorMatch &&
        !/[投捕一二三遊左中右]失/.test(label)
      ) {
        errorStyle = "throwing";
        assistTargetPos = "unassisted";
      }
    }
  }

  // 5. 日本語表記（「左前安打」「遊ゴロ」「捕邪飛」「三失」など）からの抽出
  if (!primaryPos) {
    // 「二塁打」「三塁打」「三重殺」「三振」「途中」等の漢字を二塁手・三塁手・中堅手と誤認しないよう除外した文字列で検索
    const strippedForPos = label.replace(
      /二塁打|三塁打|三重殺|三振|途中|一塁線|三塁線|二封|三封|本塁打|一死|二死|三死|一巡|二巡|二重|スリーバント/g,
      ""
    );
    if (label.includes("一塁線")) {
      primaryPos = "3";
    } else if (label.includes("三塁線")) {
      primaryPos = "5";
    } else {
      for (const [kw, posCode] of JA_CHAR_TO_POS) {
        if (strippedForPos.includes(kw)) {
          primaryPos = posCode;
          break;
        }
      }
    }
  }

  // インフィールドフライは公認野球規則上「内野手（1〜6）」の飛球に限定されるため、外野番号（7〜9）は保持しない
  if (
    resultCode === "infield_fly" &&
    (primaryPos === "7" || primaryPos === "8" || primaryPos === "9")
  ) {
    primaryPos = "";
  }

  // 6. 打球ゾーン・飛球種別・エラー種別の推定
  if (hitZone !== "gap_lc" && hitZone !== "gap_rc") {
    if (
      label.includes("内野安打") ||
      label.includes("内安") ||
      label.includes("強襲") ||
      label.includes("ランニング") ||
      (resultCode === "single" && Boolean(twoRelayMatch))
    ) {
      hitZone = "infield";
    } else if (label.includes("線")) {
      hitZone = "line";
    } else if (label.includes("越") || label.includes("オーバー")) {
      hitZone = "over";
    } else if (label.includes("前")) {
      hitZone = "front";
    } else if (primaryPos && Number(primaryPos) <= 6 && resultCode === "single") {
      hitZone = "infield";
    }
  }

  if (
    label.includes("邪") ||
    label.includes("ファウル") ||
    /^F$/i.test(dir) ||
    /^(?:B|[⌒︵︶∩^])?[1-9]F$/i.test(dir) ||
    /^[⌒︵︶∩^]?[1-9]SF$/i.test(dir) ||
    /^[△▲][1-9]$/.test(dir) ||
    /^[(（][1-9][)）]$/.test(dir) ||
    /^[⌒︵]?[1-9][,，]$/.test(dir)
  ) {
    flyStyle = "foul_fly";
  } else if (
    label.includes("直") ||
    label.includes("ライナー") ||
    /^L$/i.test(dir) ||
    /^(?:B|[⌒︵])?[1-9]L$/i.test(dir) ||
    /[\u0304\u0305￣]/.test(dir) ||
    /^[1-9][ー\-]$/.test(dir) ||
    /^[ー￣][1-9]$/.test(dir)
  ) {
    flyStyle = "liner";
  }

  if (label.includes("悪送球")) {
    errorStyle = "throwing";
    if (!assistTargetPos && !throwingErrorRelayMatch) {
      assistTargetPos = "unassisted";
    }
  }

  if (!assistTargetPos && primaryPos) {
    if (/一塁踏/.test(label) || /\b[1-9]A\b/i.test(combined)) {
      assistTargetPos = "base_a";
    } else if (/二塁踏/.test(label) || /\b[1-9]B\b/i.test(combined)) {
      assistTargetPos = "base_b";
    } else if (/三塁踏/.test(label) || /\b[1-9]C\b/i.test(combined)) {
      assistTargetPos = "base_c";
    } else if (/本塁踏/.test(label) || /\b[1-9]H\b/i.test(combined)) {
      assistTargetPos = "base_h";
    } else if (/タッチアウト/.test(label) || /\b[1-9]TO\b/i.test(combined)) {
      assistTargetPos = "touch_out";
    } else if (label.includes("本封")) {
      assistTargetPos = "2";
    } else if (label.includes("三封")) {
      assistTargetPos = "5";
    } else if (label.includes("二封")) {
      assistTargetPos = primaryPos === "4" ? "6" : "4";
    }
  }

  return {
    primaryPos,
    assistTargetPos,
    dpRelay,
    hitZone,
    flyStyle,
    errorStyle,
    isBunt,
  };
}

export interface ComposeFieldingParams {
  resultCode: CanonicalAtBatResult;
  primaryPos: DefensivePosNumber | "";
  assistTargetPos?: AssistTargetOption | "";
  dpRelay?: string;
  hitZone?: HitZoneOption;
  flyStyle?: FlyStyleOption;
  errorStyle?: ErrorStyleOption;
  isBunt?: boolean;
  fallbackLabel?: string;
}

/**
 * 守備位置番号（1〜9）が未指定のとき、または四死球・三振等の固定記号プレーに対する標準スコアブック守備記号を返す。
 * （※単打・二塁打・三塁打・ゴロ・通常フライのように 1〜9 の指定が必要な打球は数字を含めず、未設定警告と完全互換を保つ）
 */
export function defaultGenericDirection(
  code: CanonicalAtBatResult,
  options?: {
    flyStyle?: FlyStyleOption;
    clearPos?: boolean;
    presetId?: string;
    resultLabel?: string;
  }
): string {
  switch (code) {
    case "walk":
      return "B";
    case "intentional_walk":
      return "IBB";
    case "hit_by_pitch":
      return "D";
    case "strikeout": {
      const lbl = (options?.resultLabel || "").trim();
      if (options?.presetId === "so_look" || /見逃|Ⓚ|ꓘ/.test(lbl)) {
        return "K";
      }
      return "SO";
    }
    case "dropped_third_strike_out":
      return "K 2-3";
    case "dropped_third_strike":
      return "K-E2";
    case "interference":
      return options?.clearPos ? "INT" : "INT2";
    case "interference_out":
      return "INT";
    case "home_run":
      return "HR";
    case "sac_bunt":
      return "SAC";
    case "sac_fly":
      return "SF";
    case "infield_fly":
      return "IF";
    case "double_play":
      return "DP";
    case "triple_play":
      return "TP";
    case "error":
      return "E";
    case "fc":
      return "FC";
    case "flyout":
      return options?.flyStyle === "liner"
        ? "L"
        : options?.flyStyle === "foul_fly"
        ? "F"
        : "";
    case "single":
    case "double":
    case "triple":
    case "groundout":
    case "other":
    default:
      return "";
  }
}

/**
 * インプレー打球として野手番号（1〜9）を記憶・引き継ぎ対象にする結果コードか判定する
 * （※四死球・三振および捕手自動デフォルトを持つ振逃・妨害は除外）
 */
export function isBattedFieldableResultCode(
  code: CanonicalAtBatResult
): boolean {
  return (
    code === "single" ||
    code === "double" ||
    code === "triple" ||
    code === "home_run" ||
    code === "groundout" ||
    code === "flyout" ||
    code === "infield_fly" ||
    code === "sac_bunt" ||
    code === "sac_fly" ||
    code === "double_play" ||
    code === "triple_play" ||
    code === "error" ||
    code === "fc"
  );
}

/**
 * 打撃結果コード＋守備位置指定から、正規化された battedDirection と見やすい日本語 resultLabel を自動生成する
 */
export function composeFieldingResult(params: ComposeFieldingParams): {
  battedDirection: string;
  resultLabel: string;
} {
  const { resultCode, primaryPos } = params;

  if (
    resultCode === "walk" ||
    resultCode === "intentional_walk" ||
    resultCode === "hit_by_pitch" ||
    resultCode === "strikeout" ||
    resultCode === "other"
  ) {
    const resolvedLabel =
      params.fallbackLabel || defaultGenericLabel(resultCode);
    return {
      battedDirection: defaultGenericDirection(resultCode, {
        resultLabel: resolvedLabel,
      }),
      resultLabel: resolvedLabel,
    };
  }

  const posDef = getDefensivePositionDef(primaryPos);

  if (!posDef) {
    const fallbackLabel =
      params.fallbackLabel ||
      (params.isBunt && resultCode === "single"
        ? "バント安打"
        : params.isBunt && resultCode === "groundout"
        ? "バントゴロ"
        : params.isBunt && resultCode === "flyout"
        ? params.flyStyle === "foul_fly"
          ? "バント邪飛"
          : "バント飛"
        : resultCode === "flyout" && params.flyStyle === "liner"
        ? "直（ライナー）"
        : defaultGenericLabel(resultCode));
    return {
      battedDirection:
        params.isBunt && resultCode === "single"
          ? "BH"
          : defaultGenericDirection(resultCode, {
              flyStyle: params.flyStyle,
            }),
      resultLabel: fallbackLabel,
    };
  }

  const { code, shortJa, fullJa, isOutfield } = posDef;

  switch (resultCode) {
    case "single": {
      if (params.isBunt) {
        const target = params.assistTargetPos;
        if (
          target &&
          target !== "unassisted" &&
          target !== code &&
          isValidPosDigit(target)
        ) {
          const dir = `BH${code}-${target}`;
          return {
            battedDirection: dir,
            resultLabel: `${shortJa}バント安打 (${dir})`,
          };
        }
        const dir = `BH${code}`;
        return {
          battedDirection: dir,
          resultLabel: `${shortJa}バント安打 (${dir})`,
        };
      }
      const zone = params.hitZone || (isOutfield ? "front" : "infield");
      if (zone === "gap_lc") {
        return { battedDirection: "7-8", resultLabel: "左中間安打" };
      }
      if (zone === "gap_rc") {
        return { battedDirection: "8-9", resultLabel: "右中間安打" };
      }
      const isInfieldHit =
        (!isOutfield && zone !== "line" && zone !== "over") ||
        zone === "infield";
      if (isInfieldHit) {
        const target = params.assistTargetPos;
        if (
          target &&
          target !== "unassisted" &&
          target !== code &&
          isValidPosDigit(target)
        ) {
          const dir = `${code}-${target}`;
          return {
            battedDirection: dir,
            resultLabel: `${fullJa}内野安打 (${dir})`,
          };
        }
        const label =
          code === "1"
            ? "投強襲内野安打 (1)"
            : `${fullJa}内野安打 (${code})`;
        return { battedDirection: code, resultLabel: label };
      }
      if (zone === "line") {
        const linePrefix = isOutfield ? shortJa : fullJa;
        return {
          battedDirection: code,
          resultLabel: `${linePrefix}線安打`,
        };
      }
      if (zone === "over") {
        return {
          battedDirection: code,
          resultLabel: `${shortJa}越安打`,
        };
      }
      return {
        battedDirection: code,
        resultLabel: `${shortJa}前安打`,
      };
    }

    case "double":
    case "triple": {
      const hitSuffix = resultCode === "double" ? "二塁打" : "三塁打";
      const zone = params.hitZone || (isOutfield ? "over" : "line");
      if (zone === "gap_lc") {
        return { battedDirection: "7-8", resultLabel: `左中間${hitSuffix}` };
      }
      if (zone === "gap_rc") {
        return { battedDirection: "8-9", resultLabel: `右中間${hitSuffix}` };
      }
      if (!isOutfield) {
        return {
          battedDirection: code,
          resultLabel: `${fullJa}線${hitSuffix} (${code})`,
        };
      }
      if (zone === "line") {
        return {
          battedDirection: code,
          resultLabel: `${shortJa}線${hitSuffix}`,
        };
      }
      if (zone === "front") {
        return {
          battedDirection: code,
          resultLabel: `${shortJa}前${hitSuffix}`,
        };
      }
      return {
        battedDirection: code,
        resultLabel: `${shortJa}越${hitSuffix}`,
      };
    }

    case "home_run": {
      const zone = params.hitZone || "over";
      if (zone === "gap_lc") {
        return { battedDirection: "7-8", resultLabel: "左中間本塁打" };
      }
      if (zone === "gap_rc") {
        return { battedDirection: "8-9", resultLabel: "右中間本塁打" };
      }
      if (zone === "infield" || !isOutfield) {
        return {
          battedDirection: code,
          resultLabel: `ランニング本塁打 (${shortJa})`,
        };
      }
      if (zone === "line") {
        return {
          battedDirection: code,
          resultLabel: `${shortJa}線本塁打`,
        };
      }
      return {
        battedDirection: code,
        resultLabel: `${shortJa}越本塁打`,
      };
    }

    case "groundout": {
      const gSuffix = params.isBunt ? "バントゴロ" : "ゴロ";
      const target =
        params.assistTargetPos || (code === "3" ? "base_a" : "3");
      if (target === "base_a") {
        const dir = `${code}A`;
        return {
          battedDirection: dir,
          resultLabel: `${shortJa}${gSuffix} (${dir})`,
        };
      }
      if (target === "base_b") {
        const dir = `${code}B`;
        return {
          battedDirection: dir,
          resultLabel: `${shortJa}${gSuffix}二封 (${dir})`,
        };
      }
      if (target === "base_c") {
        const dir = `${code}C`;
        return {
          battedDirection: dir,
          resultLabel: `${shortJa}${gSuffix}三封 (${dir})`,
        };
      }
      if (target === "base_h") {
        const dir = `${code}H`;
        return {
          battedDirection: dir,
          resultLabel: `${shortJa}${gSuffix}本封 (${dir})`,
        };
      }
      if (target === "touch_out") {
        const dir = `${code}TO`;
        return {
          battedDirection: dir,
          resultLabel: `${shortJa}${gSuffix}タッチアウト (${dir})`,
        };
      }
      if (target === "unassisted" || target === code) {
        return {
          battedDirection: code,
          resultLabel: `${shortJa}${gSuffix} (${code})`,
        };
      }
      const dir = `${code}-${target}`;
      if (target === "4" || target === "6") {
        return {
          battedDirection: dir,
          resultLabel: `${shortJa}${gSuffix}二封 (${dir})`,
        };
      }
      if (target === "5") {
        return {
          battedDirection: dir,
          resultLabel: `${shortJa}${gSuffix}三封 (${dir})`,
        };
      }
      if (target === "2") {
        return {
          battedDirection: dir,
          resultLabel: `${shortJa}${gSuffix}本封 (${dir})`,
        };
      }
      return {
        battedDirection: dir,
        resultLabel: `${shortJa}${gSuffix} (${dir})`,
      };
    }

    case "sac_bunt": {
      const target =
        params.assistTargetPos || (code === "3" ? "4" : "3");
      if (target === "base_a") {
        const dir = `${code}A`;
        return {
          battedDirection: dir,
          resultLabel: `${shortJa}犠打 (${dir})`,
        };
      }
      if (target === "base_b") {
        const dir = `${code}B`;
        return {
          battedDirection: dir,
          resultLabel: `${shortJa}犠打 (${dir})`,
        };
      }
      if (target === "base_c") {
        const dir = `${code}C`;
        return {
          battedDirection: dir,
          resultLabel: `${shortJa}犠打 (${dir})`,
        };
      }
      if (target === "base_h") {
        const dir = `${code}H`;
        return {
          battedDirection: dir,
          resultLabel: `${shortJa}犠打 (${dir})`,
        };
      }
      if (target === "touch_out") {
        const dir = `${code}TO`;
        return {
          battedDirection: dir,
          resultLabel: `${shortJa}犠打 (${dir})`,
        };
      }
      if (target === "unassisted" || target === code) {
        return {
          battedDirection: code,
          resultLabel: `${shortJa}犠打 (${code})`,
        };
      }
      const dir = `${code}-${target}`;
      return {
        battedDirection: dir,
        resultLabel: `${shortJa}犠打 (${dir})`,
      };
    }

    case "dropped_third_strike_out": {
      const target =
        params.assistTargetPos || (code === "3" ? "base_a" : "3");
      if (target === "base_a") {
        return {
          battedDirection: `K ${code}A`,
          resultLabel: `振り逃げアウト (K ${code}A)`,
        };
      }
      if (target === "base_b") {
        return {
          battedDirection: `K ${code}B`,
          resultLabel: `振り逃げアウト (K ${code}B)`,
        };
      }
      if (target === "base_c") {
        return {
          battedDirection: `K ${code}C`,
          resultLabel: `振り逃げアウト (K ${code}C)`,
        };
      }
      if (target === "base_h") {
        return {
          battedDirection: `K ${code}H`,
          resultLabel: `振り逃げアウト (K ${code}H)`,
        };
      }
      if (target === "touch_out") {
        return {
          battedDirection: `K ${code}TO`,
          resultLabel: `振り逃げアウト (K ${code}TO)`,
        };
      }
      if (target === "unassisted" || target === code) {
        return {
          battedDirection: `K ${code}`,
          resultLabel: `振り逃げアウト (K ${code})`,
        };
      }
      return {
        battedDirection: `K ${code}-${target}`,
        resultLabel: `振り逃げアウト (K ${code}-${target})`,
      };
    }

    case "double_play": {
      const relay = (params.dpRelay || "").trim() || getDefaultDpRelay(code);
      const dpLabel = params.isBunt ? "バント併殺打" : "併殺打";
      return {
        battedDirection: relay,
        resultLabel: `${shortJa}${dpLabel} (${relay})`,
      };
    }

    case "triple_play": {
      const relay = (params.dpRelay || "").trim() || `${code}-4-3`;
      const tpLabel = params.isBunt ? "バント三重殺" : "三重殺";
      return {
        battedDirection: relay,
        resultLabel: `${shortJa}${tpLabel} (${relay})`,
      };
    }

    case "flyout": {
      const style = params.flyStyle || "fly";
      if (style === "foul_fly") {
        return {
          battedDirection: `${code}F`,
          resultLabel: params.isBunt ? `${shortJa}バント邪飛` : `${shortJa}邪飛`,
        };
      }
      if (style === "liner") {
        return {
          battedDirection: `${code}L`,
          resultLabel: params.isBunt ? `${shortJa}バント直` : `${shortJa}直`,
        };
      }
      return {
        battedDirection: code,
        resultLabel: params.isBunt ? `${shortJa}バント飛` : `${shortJa}飛`,
      };
    }

    case "infield_fly": {
      if (isOutfield) {
        return {
          battedDirection: "IF",
          resultLabel: "インフィールドフライ",
        };
      }
      return {
        battedDirection: `${code}IF`,
        resultLabel: `${shortJa}インフィールドフライ`,
      };
    }

    case "sac_fly": {
      const style = params.flyStyle || "fly";
      if (style === "foul_fly") {
        return {
          battedDirection: `${code}SF`,
          resultLabel: `${shortJa}邪犠飛`,
        };
      }
      return {
        battedDirection: code,
        resultLabel: `${shortJa}犠飛`,
      };
    }

    case "error": {
      const style = params.errorStyle || "fielding";
      if (style === "throwing") {
        const target = params.assistTargetPos;
        if (
          target &&
          target !== "unassisted" &&
          target !== code &&
          isValidPosDigit(target)
        ) {
          const dir = `${code}E-${target}`;
          return {
            battedDirection: dir,
            resultLabel: `${shortJa}悪送球 (${dir})`,
          };
        }
        const dir = `${code}E`;
        return {
          battedDirection: dir,
          resultLabel: `${shortJa}悪送球 (${dir})`,
        };
      }
      const dir = `E${code}`;
      return {
        battedDirection: dir,
        resultLabel: `${shortJa}失 (${dir})`,
      };
    }

    case "fc": {
      const target = params.assistTargetPos;
      if (
        target &&
        target !== "unassisted" &&
        target !== code &&
        isValidPosDigit(target)
      ) {
        const dir = `FC${code}-${target}`;
        return {
          battedDirection: dir,
          resultLabel: `${shortJa}野選 (${dir})`,
        };
      }
      const dir = `FC${code}`;
      return {
        battedDirection: dir,
        resultLabel: `${shortJa}野選 (${dir})`,
      };
    }

    case "interference": {
      return {
        battedDirection: `INT${code}`,
        resultLabel: `打撃妨害 (${fullJa})`,
      };
    }

    case "interference_out": {
      return {
        battedDirection: `INT${code}`,
        resultLabel: `守備妨害アウト (${shortJa})`,
      };
    }

    case "dropped_third_strike": {
      return {
        battedDirection: `K-E${code}`,
        resultLabel: "振り逃げ出塁",
      };
    }

    default: {
      return {
        battedDirection: defaultGenericDirection(resultCode),
        resultLabel: params.fallbackLabel || defaultGenericLabel(resultCode),
      };
    }
  }
}

export interface ResolveFieldingTransitionParams {
  prevResultCode: CanonicalAtBatResult;
  prevBattedDirection: string;
  prevResultLabel: string;
  nextResultCode: CanonicalAtBatResult;
  presetId?: string;
  presetDefaultLabel?: string;
  rememberedFielding?: ParsedFieldingMeta | null;
}

/**
 * 打撃結果プリセット切替時・投球連動時に、守備記号（B / IBB / D / K / K 2-3 / K-E2 / INT2 / HR / E / FC 等）が
 * 空白化せず、かつ直前に選んでいた妥当な野手番号（1〜9）を安全に復元・変換する。
 */
export function resolveFieldingOnResultChange(
  params: ResolveFieldingTransitionParams
): {
  battedDirection: string;
  resultLabel: string;
} {
  const {
    prevResultCode,
    prevBattedDirection,
    prevResultLabel,
    nextResultCode,
    presetId,
    presetDefaultLabel,
    rememberedFielding,
  } = params;

  // 1. 四死球・三振・途中断は常に標準記号（B / IBB / D / SO / K / ""）を確定設定
  if (
    nextResultCode === "walk" ||
    nextResultCode === "intentional_walk" ||
    nextResultCode === "hit_by_pitch" ||
    nextResultCode === "strikeout" ||
    nextResultCode === "other"
  ) {
    const resolvedLabel =
      presetDefaultLabel ||
      (prevResultCode === nextResultCode && prevResultLabel
        ? prevResultLabel
        : defaultGenericLabel(nextResultCode));
    return {
      battedDirection: defaultGenericDirection(nextResultCode, {
        presetId,
        resultLabel: resolvedLabel,
      }),
      resultLabel: resolvedLabel,
    };
  }

  // 2. 捕手起点の特殊プレー（振逃アウト / 振逃セーフ / 打撃妨害）はデフォルト捕手(2)を自動適用
  if (
    nextResultCode === "dropped_third_strike_out" ||
    nextResultCode === "dropped_third_strike" ||
    nextResultCode === "interference"
  ) {
    const wasSameCatcherGroup =
      prevResultCode === "dropped_third_strike_out" ||
      prevResultCode === "dropped_third_strike" ||
      prevResultCode === "interference";
    const prevParsed = wasSameCatcherGroup
      ? parseFieldingMeta(prevResultCode, prevBattedDirection, prevResultLabel)
      : null;
    const catcherPos: DefensivePosNumber = prevParsed?.primaryPos || "2";
    const catcherAssist: AssistTargetOption | "" =
      nextResultCode === "dropped_third_strike_out"
        ? prevResultCode === "dropped_third_strike_out" &&
          prevParsed?.assistTargetPos
          ? prevParsed.assistTargetPos
          : catcherPos === "3"
          ? "unassisted"
          : "3"
        : "";
    return composeFieldingResult({
      resultCode: nextResultCode,
      primaryPos: catcherPos,
      assistTargetPos: catcherAssist,
      fallbackLabel: presetDefaultLabel,
    });
  }

  // 3. 守備妨害アウトは既に守備妨害で野手指定済みなら維持し、他からの切替時は汎用 "INT" を設定
  if (nextResultCode === "interference_out") {
    if (prevResultCode === "interference_out") {
      const prevParsed = parseFieldingMeta(
        prevResultCode,
        prevBattedDirection,
        prevResultLabel
      );
      if (prevParsed.primaryPos) {
        return composeFieldingResult({
          resultCode: "interference_out",
          primaryPos: prevParsed.primaryPos,
          fallbackLabel: presetDefaultLabel,
        });
      }
    }
    return {
      battedDirection: defaultGenericDirection("interference_out"),
      resultLabel:
        presetDefaultLabel || defaultGenericLabel("interference_out"),
    };
  }

  // 4. インプレー打球系: 直前の打球野手、または四死球経由でも記憶していた野手番号を野球規則整合の範囲で引き継ぐ
  const directFielding = isBattedFieldableResultCode(prevResultCode)
    ? parseFieldingMeta(prevResultCode, prevBattedDirection, prevResultLabel)
    : null;
  const sourceMeta: ParsedFieldingMeta | null =
    directFielding && directFielding.primaryPos
      ? directFielding
      : rememberedFielding && rememberedFielding.primaryPos
      ? rememberedFielding
      : null;

  const forcedIsBunt: boolean =
    presetId === "bunt_single" ||
    presetId === "bunt_groundout" ||
    presetId === "bunt_flyout" ||
    nextResultCode === "sac_bunt"
      ? true
      : presetId === "single" ||
        presetId === "groundout" ||
        presetId === "flyout" ||
        presetId === "lineout"
      ? false
      : Boolean(sourceMeta?.isBunt);

  const isPosCompatible = (
    pos: DefensivePosNumber | "",
    code: CanonicalAtBatResult
  ): pos is DefensivePosNumber => {
    if (!pos) return false;
    const isOf = pos === "7" || pos === "8" || pos === "9";
    if (forcedIsBunt && (code === "single" || code === "flyout")) {
      return !isOf;
    }
    switch (code) {
      case "home_run":
      case "sac_fly":
        return isOf;
      case "double":
      case "triple":
        return isOf || pos === "3" || pos === "5";
      case "groundout":
      case "sac_bunt":
      case "infield_fly":
      case "double_play":
      case "triple_play":
        return !isOf;
      case "single":
      case "flyout":
      case "error":
      case "fc":
      default:
        return true;
    }
  };

  const forcedFlyStyle: FlyStyleOption =
    presetId === "lineout"
      ? "liner"
      : (presetId === "flyout" || presetId === "bunt_flyout") &&
        sourceMeta?.flyStyle === "liner"
      ? "fly"
      : sourceMeta?.flyStyle || "fly";

  if (sourceMeta && isPosCompatible(sourceMeta.primaryPos, nextResultCode)) {
    const pos = sourceMeta.primaryPos;
    const wasThrowTargetPlay =
      prevResultCode === "groundout" ||
      prevResultCode === "sac_bunt" ||
      prevResultCode === "fc" ||
      (prevResultCode === "single" &&
        (Number(pos) <= 6 || sourceMeta.hitZone === "infield")) ||
      (prevResultCode === "error" && sourceMeta.errorStyle === "throwing");
    const rawSourceAssist = sourceMeta.assistTargetPos;
    const normalizedThrowDigitAssist: AssistTargetOption | "" =
      rawSourceAssist === "base_b"
        ? pos === "4"
          ? "6"
          : "4"
        : rawSourceAssist === "base_c"
        ? "5"
        : rawSourceAssist === "base_h"
        ? "2"
        : rawSourceAssist === "base_a" || rawSourceAssist === "touch_out"
        ? "unassisted"
        : rawSourceAssist;
    const nextAssist: AssistTargetOption | "" =
      nextResultCode === "error"
        ? sourceMeta.errorStyle === "throwing"
          ? normalizedThrowDigitAssist || (pos === "3" ? "unassisted" : "3")
          : ""
        : nextResultCode === "fc"
        ? prevResultCode === "fc" && normalizedThrowDigitAssist !== pos
          ? normalizedThrowDigitAssist
          : wasThrowTargetPlay &&
            (normalizedThrowDigitAssist === "2" ||
              normalizedThrowDigitAssist === "4" ||
              normalizedThrowDigitAssist === "5" ||
              normalizedThrowDigitAssist === "6") &&
            normalizedThrowDigitAssist !== pos
          ? normalizedThrowDigitAssist
          : ""
        : nextResultCode === "single"
        ? forcedIsBunt
          ? prevResultCode === "single" &&
            sourceMeta.isBunt &&
            normalizedThrowDigitAssist &&
            normalizedThrowDigitAssist !== pos
            ? normalizedThrowDigitAssist
            : "unassisted"
          : (Number(pos) <= 6 &&
              sourceMeta.hitZone !== "line" &&
              sourceMeta.hitZone !== "over") ||
            sourceMeta.hitZone === "infield"
          ? wasThrowTargetPlay &&
            normalizedThrowDigitAssist &&
            normalizedThrowDigitAssist !== "unassisted" &&
            normalizedThrowDigitAssist !== pos
            ? normalizedThrowDigitAssist
            : "unassisted"
          : ""
        : nextResultCode === "groundout"
        ? prevResultCode === "groundout"
          ? rawSourceAssist
          : wasThrowTargetPlay &&
            rawSourceAssist &&
            rawSourceAssist !== "unassisted"
          ? rawSourceAssist
          : ""
        : wasThrowTargetPlay
        ? rawSourceAssist
        : "";
    const nextDpRelay =
      prevResultCode === "double_play" || prevResultCode === "triple_play"
        ? sourceMeta.dpRelay
        : "";

    return composeFieldingResult({
      resultCode: nextResultCode,
      primaryPos: pos,
      assistTargetPos: nextAssist,
      dpRelay: nextDpRelay,
      hitZone: forcedIsBunt && nextResultCode === "single" ? "infield" : sourceMeta.hitZone,
      flyStyle: forcedFlyStyle,
      errorStyle: sourceMeta.errorStyle,
      isBunt: forcedIsBunt,
      fallbackLabel: presetDefaultLabel,
    });
  }

  return composeFieldingResult({
    resultCode: nextResultCode,
    primaryPos: "",
    flyStyle: forcedFlyStyle,
    isBunt: forcedIsBunt,
    fallbackLabel: presetDefaultLabel,
  });
}

/**
 * AIのOCR出力（dir と rl）を相互補完し、守備位置コードと日本語ラベルの両方を揃える
 */
export function harmonizeOcrFieldingAndLabel(
  resultCode: CanonicalAtBatResult,
  rawDir: string | undefined | null,
  rawLabel: string | undefined | null
): { battedDirection: string; resultLabel: string } {
  const cleanDir = (rawDir || "").trim();
  const cleanLabel = (rawLabel || "").trim();
  const normInputDir = normalizeFieldingAscii(cleanDir);

  if (resultCode === "strikeout") {
    const isThreeBunt =
      /3バント|スリーバント/.test(cleanLabel) ||
      /\b3B\b/i.test(normInputDir);
    const isCalled =
      !isThreeBunt &&
      (/見逃|Ⓚ|ꓘ/.test(cleanLabel) || /Ⓚ|ꓘ/.test(cleanDir));
    const isSwinging =
      !isThreeBunt &&
      !isCalled &&
      (/空振/.test(cleanLabel) || /^SO\b/i.test(normInputDir));

    if (isThreeBunt) {
      return {
        battedDirection: "SO",
        resultLabel:
          cleanLabel && cleanLabel !== "三振" ? cleanLabel : "スリーバント失敗",
      };
    }
    if (isCalled) {
      return {
        battedDirection: "K",
        resultLabel:
          cleanLabel && cleanLabel !== "三振" ? cleanLabel : "見逃し三振",
      };
    }
    if (isSwinging) {
      return {
        battedDirection: "SO",
        resultLabel:
          cleanLabel && cleanLabel !== "三振" ? cleanLabel : "空振り三振",
      };
    }
    if (/^K$/i.test(normInputDir)) {
      return {
        battedDirection: "K",
        resultLabel: cleanLabel || "三振",
      };
    }
    return {
      battedDirection: "SO",
      resultLabel: cleanLabel || "空振り三振",
    };
  }

  if (
    resultCode === "walk" ||
    resultCode === "intentional_walk" ||
    resultCode === "hit_by_pitch" ||
    resultCode === "other"
  ) {
    const defaultDir = defaultGenericDirection(resultCode);
    const useDefault =
      !normInputDir ||
      resultCode === "other" ||
      /^[1-9]$/.test(normInputDir);
    return {
      battedDirection: useDefault ? defaultDir : normInputDir,
      resultLabel: cleanLabel || defaultGenericLabel(resultCode),
    };
  }

  const parsed = parseFieldingMeta(resultCode, cleanDir, cleanLabel);
  if (!parsed.primaryPos) {
    if (resultCode === "infield_fly") {
      return {
        battedDirection: "IF",
        resultLabel: "インフィールドフライ",
      };
    }
    const fallbackDir = defaultGenericDirection(resultCode, {
      flyStyle: parsed.flyStyle,
    });
    return {
      battedDirection: normInputDir || fallbackDir,
      resultLabel: cleanLabel || defaultGenericLabel(resultCode),
    };
  }

  const composed = composeFieldingResult({
    resultCode,
    primaryPos: parsed.primaryPos,
    assistTargetPos: parsed.assistTargetPos,
    dpRelay: parsed.dpRelay,
    hitZone: parsed.hitZone,
    flyStyle: parsed.flyStyle,
    errorStyle: parsed.errorStyle,
    isBunt: parsed.isBunt,
    fallbackLabel: cleanLabel,
  });

  // 既存の日本語ラベルが十分に具体的（守備位置漢字を含んでいる）場合はそれを尊重しつつ、汎用ラベル（"ゴロ","安打","フライ"等）なら自動生成ラベルへ昇格させる
  const genericSet = new Set([
    "",
    "安打",
    "単打",
    "ヒット",
    "内野安打",
    "内安",
    "バント安打",
    "バント内野安打",
    "二塁打",
    "三塁打",
    "本塁打",
    "ホームラン",
    "ゴロ",
    "内ゴロ",
    "バントゴロ",
    "飛球",
    "フライ",
    "バント飛",
    "バント飛球",
    "バントフライ",
    "バント邪飛",
    "ライナー",
    "直",
    "直（ライナー）",
    "犠打",
    "バント",
    "犠飛",
    "併殺打",
    "ゲッツー",
    "三重殺",
    "失策",
    "失策出塁",
    "エラー",
    "野選",
    "インフィールドフライ",
    resultCode,
  ]);

  const needsBuntLabelUpgrade =
    parsed.isBunt &&
    resultCode !== "sac_bunt" &&
    !cleanLabel.includes("バント");
  const needsInfieldFlyLabelUpgrade =
    resultCode === "infield_fly" &&
    (!cleanLabel.includes("インフィールド") ||
      /(?:^[左中右]|左翼|中堅|右翼|レフト|センター|ライト)/.test(cleanLabel));

  const finalLabel =
    genericSet.has(cleanLabel) ||
    needsBuntLabelUpgrade ||
    needsInfieldFlyLabelUpgrade ||
    /^[0-9EFCLKSBH⌒︵︶∩^~〜￣ー\-△▲□◇()（），,\s\u0304\u0305]+$/i.test(
      cleanLabel
    )
      ? composed.resultLabel
      : cleanLabel;

  const hasRawDecorGlyph =
    /[⌒︵︶∩^~〜￣ー－―‐→⇒➡△▲□◇◯○[\]{}()（），,０-９\u0304\u0305]/.test(
      cleanDir
    ) || /^[1-9]-$/.test(cleanDir);

  const normCleanDir = normalizeFieldingAscii(cleanDir);
  const isPrefixThrowErr =
    resultCode === "error" && /^E[1-9]-[1-9]$/i.test(normCleanDir);
  const isNonCanonicalFcDir =
    resultCode === "fc" && !/^FC[1-9](?:-[1-9])?$/.test(normCleanDir);
  const isNonCanonicalInfieldFlyDir =
    resultCode === "infield_fly" && !/^[1-6]IF$/i.test(normCleanDir);
  const isNonCanonicalBuntHitDir =
    resultCode === "single" &&
    parsed.isBunt &&
    !/^BH[1-9](?:-[1-9])?$/i.test(normCleanDir);

  return {
    battedDirection:
      !cleanDir ||
      hasRawDecorGlyph ||
      isPrefixThrowErr ||
      isNonCanonicalFcDir ||
      isNonCanonicalInfieldFlyDir ||
      isNonCanonicalBuntHitDir
        ? composed.battedDirection
        : normCleanDir,
    resultLabel: finalLabel,
  };
}

function defaultGenericLabel(code: CanonicalAtBatResult): string {
  switch (code) {
    case "single":
      return "安打";
    case "double":
      return "二塁打";
    case "triple":
      return "三塁打";
    case "home_run":
      return "本塁打";
    case "walk":
      return "四球";
    case "intentional_walk":
      return "申告敬遠";
    case "hit_by_pitch":
      return "死球";
    case "interference":
      return "打撃妨害 (INT)";
    case "sac_bunt":
      return "犠打";
    case "sac_fly":
      return "犠飛";
    case "groundout":
      return "内ゴロ";
    case "flyout":
      return "飛球";
    case "infield_fly":
      return "インフィールドフライ";
    case "strikeout":
      return "三振";
    case "dropped_third_strike_out":
      return "振り逃げアウト (K 2-3)";
    case "dropped_third_strike":
      return "振り逃げ出塁";
    case "double_play":
      return "併殺打";
    case "triple_play":
      return "三重殺 (TP)";
    case "interference_out":
      return "守備妨害アウト (INT)";
    case "error":
      return "失策出塁";
    case "fc":
      return "野選";
    case "other":
    default:
      return "打席途中断（走塁死チェンジ）";
  }
}

/**
 * 過去データ互換補正（インフィールドフライ）:
 * 1) 旧OCR/再構築処理で resultCode: "flyout" のまま dir: "IF" / "6IF" や label: "インフィールドフライ" で保存された打席を
 *    正式な resultCode: "infield_fly" へ昇格する。
 * 2) 守備位置指定がないのに外野番号（7/8/9: 特に旧フォールバックの "8" や "中インフィールドフライ"）が混入していたデータを
 *    汎用表記（battedDirection: "IF", resultLabel: "インフィールドフライ"）へ自動正規化する。
 * ※内野手（1〜6）が明記されている正当なデータ（例: "6IF" / "遊インフィールドフライ"）はそのまま保持する。
 */
export function normalizeLegacyInfieldFlyAtBat<
  T extends Pick<
    ScorebookV2AtBat,
    "resultCode" | "battedDirection" | "resultLabel"
  >,
>(ab: T): T {
  if (!ab) return ab;
  if (ab.resultCode !== "infield_fly" && ab.resultCode !== "flyout") {
    return ab;
  }

  const rawDir = (ab.battedDirection || "").trim();
  const rawLabel = (ab.resultLabel || "").trim();
  const normDir = normalizeFieldingAscii(rawDir);
  const strippedDir = normDir
    .replace(/^[⌒︵︶∩^傘()\s]+|\s*[()]+$/g, "")
    .trim();

  if (ab.resultCode === "flyout") {
    const isInterferenceLike =
      rawLabel.includes("妨害") || /^INT/i.test(strippedDir);
    const hasInfieldFlyMarker =
      !isInterferenceLike &&
      (rawLabel.includes("インフィールド") ||
        /\bIFF\b/i.test(rawLabel) ||
        /\bIFF\b/i.test(strippedDir) ||
        /^(?:[1-9])?I\.?F\.?F?$/i.test(strippedDir) ||
        /\((?:[1-9])?I\.?F\.?F?\)/i.test(rawLabel));
    if (!hasInfieldFlyMarker) {
      return ab;
    }
  }

  const sanitizedSeedLabel = rawLabel.includes("インフィールド") ? rawLabel : "";
  const harmonized = harmonizeOcrFieldingAndLabel(
    "infield_fly",
    rawDir,
    sanitizedSeedLabel
  );

  if (
    ab.resultCode === "infield_fly" &&
    ab.battedDirection === harmonized.battedDirection &&
    ab.resultLabel === harmonized.resultLabel
  ) {
    return ab;
  }

  return {
    ...ab,
    resultCode: "infield_fly",
    battedDirection: harmonized.battedDirection,
    resultLabel: harmonized.resultLabel,
  };
}

/**
 * 過去データ互換補正:
 * 先行走者が封殺・アウト（二封・三封・本封: 6-4, 4-6, 5-4, 6-5, 5-2, 6B, 5C, 2H 等）となって
 * 1アウトが記録されているにもかかわらず、旧ロジックで resultCode: "fc"（野選）として保存された打席を
 * 公式野球規則に準拠したゴロ封殺（resultCode: "groundout" 等）へ自動正規化する。
 * あわせて旧インフィールドフライの外野番号（"8" 等）混入・"flyout" 残留データも正規化する。
 * ※先行走者もセーフになった本物のオールセーフ野選（outsInPlay === 0 等）はそのまま "fc" として保持する。
 */
export function normalizeLegacyForceOutAtBat<
  T extends Pick<
    ScorebookV2AtBat,
    "resultCode" | "battedDirection" | "resultLabel" | "outsInPlay" | "advances"
  >,
>(ab: T): T {
  if (!ab) return ab;
  if (ab.resultCode === "infield_fly" || ab.resultCode === "flyout") {
    return normalizeLegacyInfieldFlyAtBat(ab);
  }
  if (ab.resultCode !== "fc") return ab;

  const rawDir = (ab.battedDirection || "").trim();
  // 早見表・設定プレビュー用の残塁イニング終了サンプル表記（"6-" 等）はそのまま保持
  if (/^[1-9]-$/.test(rawDir)) return ab;

  const advances: ScorebookV2Advance[] = Array.isArray(ab.advances)
    ? ab.advances
    : [];
  const prePlayOuts = advances.filter(
    (a) =>
      a.isOut &&
      (a.method === "caught_stealing" ||
        a.method === "pickoff_out" ||
        a.method === "appeal_out")
  ).length;
  const inPlayRunnerOuts = advances.filter(
    (a) =>
      a.isOut &&
      a.from !== "BAT" &&
      a.method !== "caught_stealing" &&
      a.method !== "pickoff_out" &&
      a.method !== "appeal_out"
  );
  const netInPlayOuts = Math.max(0, (ab.outsInPlay ?? 0) - prePlayOuts);

  // インプレーでの走者アウトが 0（本物のオールセーフ野選）なら変更しない
  if (inPlayRunnerOuts.length === 0 && netInPlayOuts === 0) {
    return ab;
  }

  // 本塁送球（-2 等）で三塁走者がセーフ生還し、後続走者のみ別塁タッチアウトになった本物の野選＋走塁死は保持
  const hasSafeRunnerScore = advances.some(
    (a) => !a.isOut && a.from !== "BAT" && a.to === "HP"
  );
  if (
    hasSafeRunnerScore &&
    inPlayRunnerOuts.length > 0 &&
    inPlayRunnerOuts.every((a) => a.to !== "HP") &&
    /(?:-2|2H)/i.test(rawDir)
  ) {
    return ab;
  }

  const rawLabel = (ab.resultLabel || "").trim();
  const normDir = normalizeFieldingAscii(rawDir);
  const parenMatch = rawLabel.match(/\(([^()]+)\)/);
  const fallbackFromLabel = parenMatch
    ? normalizeFieldingAscii(parenMatch[1])
    : "";
  const sourceToken = normDir || fallbackFromLabel;

  const isBunt =
    /^B(?!H)/i.test(sourceToken) || rawLabel.includes("バント");

  let core = sourceToken
    .replace(/^B(?!H)/i, "")
    .replace(/O\.?B\.?/gi, "")
    .replace(/FC/gi, "")
    .replace(/^-+|-+$/g, "")
    .trim();

  if (!core) {
    const labelPosMatch = rawLabel.match(/^([投捕一二三遊左中右])/);
    const posMap: Record<string, string> = {
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
    if (labelPosMatch && posMap[labelPosMatch[1]]) {
      core = posMap[labelPosMatch[1]];
    }
  }

  // 旧処理で 5C / 6B / 4B / 2H 等の末尾ベース記号が削られて単独数字（"5", "6" 等）になっていた場合を復元
  if (/^[1-9]$/.test(core)) {
    const outTargetBase = inPlayRunnerOuts[0]?.to;
    if (outTargetBase === "3B") {
      core = core === "5" ? "5C" : `${core}-5`;
    } else if (outTargetBase === "HP") {
      core = core === "2" ? "2H" : `${core}-2`;
    } else if (outTargetBase === "2B") {
      core =
        core === "4" || core === "6"
          ? `${core}B`
          : core === "3"
          ? "3-6"
          : `${core}-4`;
    } else {
      core =
        core === "6"
          ? "6-4"
          : core === "4"
          ? "4-6"
          : core === "5"
          ? "5-4"
          : core === "3"
          ? "3-6"
          : core === "1"
          ? "1-4"
          : core === "2"
          ? "2-4"
          : `${core}-4`;
    }
  }

  const candidateDir =
    isBunt && core && !/^B/i.test(core) ? `B${core}` : core || "6-4";
  const targetCode: CanonicalAtBatResult =
    netInPlayOuts >= 3
      ? "triple_play"
      : netInPlayOuts >= 2
      ? "double_play"
      : "groundout";

  const harmonized = harmonizeOcrFieldingAndLabel(
    targetCode,
    candidateDir,
    isBunt ? "バント" : ""
  );

  return {
    ...ab,
    resultCode: targetCode,
    battedDirection: harmonized.battedDirection,
    resultLabel: harmonized.resultLabel,
  };
}

function repairPlayLogInfieldFlyDescription(
  description: string,
  repairedAb?: Pick<
    ScorebookV2AtBat,
    "resultCode" | "battedDirection" | "resultLabel"
  > | null
): string {
  if (!description) return description;
  const isMatchedInfieldFly = repairedAb?.resultCode === "infield_fly";
  if (!isMatchedInfieldFly && !description.includes("インフィールド")) {
    return description;
  }

  const pitchMarker = "\n===PITCHES===\n";
  const markerIdx = description.indexOf(pitchMarker);
  const headPart = markerIdx >= 0 ? description.slice(0, markerIdx) : description;
  const tailPart = markerIdx >= 0 ? description.slice(markerIdx) : "";

  const headMatch = headPart.match(
    /^([^:：]+[:：]\s*)(.+?)(\s*(?:（(?:打点|得点)[^）]*）)?\s*(?:［[^］]*］)?\s*(?:\[B:\d+,\s*S:\d+,\s*O:\d+\])?)$/
  );
  if (!headMatch) return description;

  const prefix = headMatch[1];
  const oldResultText = headMatch[2].trim();
  const suffix = headMatch[3] || "";

  const hasOutfieldNoise =
    /(?:^[左中右]|左翼|中堅|右翼|レフト|センター|ライト)/.test(oldResultText) ||
    /\((?:[789](?:I\.?F\.?F?)?|I\.?F\.?\s*[789])\)/i.test(oldResultText);
  const missingInfieldFlyWord =
    isMatchedInfieldFly && !oldResultText.includes("インフィールド");

  if (!hasOutfieldNoise && !missingInfieldFlyWord) {
    return description;
  }

  const hasParenInOld = /\([^()]+\)/.test(oldResultText);
  let nextResultText = "";
  if (isMatchedInfieldFly && repairedAb) {
    const baseLabel = (repairedAb.resultLabel || "インフィールドフライ").trim();
    const dir = (repairedAb.battedDirection || "IF").trim();
    nextResultText =
      dir &&
      (hasParenInOld || /^[1-6]IF$/i.test(dir)) &&
      !baseLabel.includes(dir)
        ? `${baseLabel} (${dir})`
        : baseLabel;
  } else {
    nextResultText = hasParenInOld
      ? "インフィールドフライ (IF)"
      : "インフィールドフライ";
  }

  if (!nextResultText || nextResultText === oldResultText) {
    return description;
  }

  return `${prefix}${nextResultText}${suffix}${tailPart}`;
}

/**
 * play_logs.description 内の旧「〇〇野選 (FC6-4)」等の見出しを、
 * 走者封殺アウトが記録されている打席に限り「〇〇ゴロ二封 (6-4)」等へ安全に補正する
 * （あわせてインフィールドフライの外野番号 "8" / "中インフィールドフライ" 混入も除去する）
 */
export function repairPlayLogForceOutDescription(
  description: string,
  repairedAb?: Pick<
    ScorebookV2AtBat,
    "resultCode" | "battedDirection" | "resultLabel"
  > | null
): string {
  if (!description) return description;

  const afterInfieldFly = repairPlayLogInfieldFlyDescription(
    description,
    repairedAb
  );
  if (afterInfieldFly !== description) {
    return afterInfieldFly;
  }

  if (!description.includes("野選") && !description.includes("FC")) {
    return description;
  }

  if (repairedAb && repairedAb.resultCode === "fc") {
    return description;
  }

  const outCountMatch = description.match(/\[B:\d+,\s*S:\d+,\s*O:(\d+)\]/);
  const recordedOuts = outCountMatch ? Number(outCountMatch[1]) : 0;

  const runnerBracketMatch = description.match(/［([^］]*)］/);
  const runnerBracket = runnerBracketMatch ? runnerBracketMatch[1] : "";

  if (!repairedAb) {
    if (recordedOuts <= 0) return description;
    const segments = runnerBracket
      ? runnerBracket.split("、").map((s) => s.trim()).filter(Boolean)
      : [];
    const inPlayOutSegs = segments.filter(
      (s) =>
        s.includes("アウト") &&
        !s.includes("@投球外") &&
        !s.includes("盗塁") &&
        !s.includes("牽制")
    );
    const hasSafeHomeScore = segments.some((s) => s.includes("本塁生還"));
    if (segments.length > 0 && inPlayOutSegs.length === 0) {
      return description;
    }
    if (hasSafeHomeScore && inPlayOutSegs.every((s) => !s.includes("→本塁アウト"))) {
      return description;
    }
  }

  const pitchMarker = "\n===PITCHES===\n";
  const markerIdx = description.indexOf(pitchMarker);
  const headPart = markerIdx >= 0 ? description.slice(0, markerIdx) : description;
  const tailPart = markerIdx >= 0 ? description.slice(markerIdx) : "";

  const headMatch = headPart.match(
    /^([^:：]+[:：]\s*)(.+?)(\s*(?:（(?:打点|得点)[^）]*）)?\s*(?:［[^］]*］)?\s*(?:\[B:\d+,\s*S:\d+,\s*O:\d+\])?)$/
  );
  if (!headMatch) return description;

  const prefix = headMatch[1];
  const oldResultText = headMatch[2].trim();
  const suffix = headMatch[3] || "";

  let nextResultText = repairedAb?.resultLabel?.trim() || "";
  if (!nextResultText) {
    const inferredAdvances: ScorebookV2Advance[] = [];
    if (runnerBracket.includes("→2塁アウト")) {
      inferredAdvances.push({
        id: "r",
        from: "1B",
        to: "2B",
        method: "fc",
        isOut: true,
        runnerName: "",
      });
    } else if (runnerBracket.includes("→3塁アウト")) {
      inferredAdvances.push({
        id: "r",
        from: "2B",
        to: "3B",
        method: "fc",
        isOut: true,
        runnerName: "",
      });
    } else if (runnerBracket.includes("→本塁アウト")) {
      inferredAdvances.push({
        id: "r",
        from: "3B",
        to: "HP",
        method: "fc",
        isOut: true,
        runnerName: "",
      });
    }
    const parenCodeMatch = oldResultText.match(/\(([^()]+)\)/);
    const normalized = normalizeLegacyForceOutAtBat({
      resultCode: "fc",
      battedDirection: parenCodeMatch ? parenCodeMatch[1] : "",
      resultLabel: oldResultText,
      outsInPlay: Math.max(1, recordedOuts),
      advances: inferredAdvances,
    });
    if (normalized.resultCode === "fc") return description;
    nextResultText = normalized.resultLabel;
  } else if (
    repairedAb?.battedDirection &&
    !nextResultText.includes(repairedAb.battedDirection)
  ) {
    nextResultText = `${nextResultText} (${repairedAb.battedDirection})`;
  }

  if (!nextResultText || nextResultText === oldResultText) {
    return description;
  }

  return `${prefix}${nextResultText}${suffix}${tailPart}`;
}


