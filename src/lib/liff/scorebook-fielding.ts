// filepath: src/lib/liff/scorebook-fielding.ts
import type { CanonicalAtBatResult } from "@/types/scorebook-v2";

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
    .replace(/(E?[1-9]E?)\s*[－ー―‐=＝→⇒➡]\s*(E?[1-9]E?)/gi, "$1-$2")
    .replace(/(E?[1-9]E?)\s*[－ー―‐=＝→⇒➡]\s*(E?[1-9]E?)/gi, "$1-$2");
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

  // 3. 2連送球（6-3, 3-1, 〜6-3, [1-3], ◇5-3, K 2-3 等 ※7-8/8-9の安打は除外）
  const twoRelayMatch =
    !threeRelayMatch &&
    !throwingErrorRelayMatch &&
    !catchingErrorRelayMatch &&
    !(isHitCode && (hitZone === "gap_lc" || hitZone === "gap_rc"))
      ? combined.match(/(?<![0-9A-Za-z-])([1-9])-([1-9])(?![0-9A-Za-z-])/)
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

  // 4. E6 / 4E / FC6 / 6F / 6L / 6IF / ⌒4 / ︵4 / 傘4 / △2 / (2) / [1] / ◇3 / 4￣ / 単独 1〜9
  if (!primaryPos) {
    const strippedDecorDir = dir
      .replace(/[\u0304\u0305]/g, "")
      .replace(/^[⌒︵︶∩^傘~〜￣ー\-△▲□◇◯○[({\uff08\s]+/, "")
      .replace(/[⌒︵︶∩^傘~〜￣ー\-△▲□◇◯○\])}\uff09,，.\s]+$/, "");
    const suffixErrorMatch =
      strippedDecorDir.match(/^([1-9])\s*E$/i) ||
      label.match(/\(([1-9])E\)/i);
    const codeDigitMatch =
      suffixErrorMatch ||
      strippedDecorDir.match(
        /^(?:E|FC|INT|K\s*)?([1-9])(?:F|L|IF|SF|E|A|G)?$/i
      ) ||
      strippedDecorDir.match(/^([1-9])\s*(?:E|失)$/i) ||
      label.match(/\((?:E|FC|K\s*)?([1-9])(?:A|G)?\)/i);
    if (codeDigitMatch && isValidPosDigit(codeDigitMatch[1])) {
      primaryPos = codeDigitMatch[1];
      if (
        resultCode === "groundout" ||
        resultCode === "sac_bunt" ||
        resultCode === "dropped_third_strike_out"
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
    // 「二塁打」「三塁打」の「二」「三」を二塁手・三塁手と誤認しないよう除外した文字列で検索
    const strippedForPos = label
      .replace(/二塁打|三塁打|一塁線|三塁線|二封|三封|本塁打|一死|二死|三死|スリーバント/g, "");
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

  // 6. 打球ゾーン・飛球種別・エラー種別の推定
  if (hitZone !== "gap_lc" && hitZone !== "gap_rc") {
    if (
      label.includes("内野安打") ||
      label.includes("内安") ||
      label.includes("強襲") ||
      label.includes("ランニング")
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
    /^[⌒︵︶∩^]?[1-9]F$/i.test(dir) ||
    /^[⌒︵︶∩^]?[1-9]SF$/i.test(dir) ||
    /^[△▲][1-9]$/.test(dir) ||
    /^[(（][1-9][)）]$/.test(dir) ||
    /^[⌒︵]?[1-9][,，]$/.test(dir)
  ) {
    flyStyle = "foul_fly";
  } else if (
    label.includes("直") ||
    label.includes("ライナー") ||
    /^[⌒︵]?[1-9]L$/i.test(dir) ||
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
    if (label.includes("本封")) assistTargetPos = "2";
    else if (label.includes("三封")) assistTargetPos = "5";
    else if (label.includes("二封")) {
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
  fallbackLabel?: string;
}

/**
 * 打撃結果コード＋守備位置指定から、正規化された battedDirection と見やすい日本語 resultLabel を自動生成する
 */
export function composeFieldingResult(params: ComposeFieldingParams): {
  battedDirection: string;
  resultLabel: string;
} {
  const { resultCode, primaryPos } = params;
  const posDef = getDefensivePositionDef(primaryPos);

  if (!posDef) {
    return {
      battedDirection: "",
      resultLabel: params.fallbackLabel || defaultGenericLabel(resultCode),
    };
  }

  const { code, shortJa, fullJa, isOutfield } = posDef;

  switch (resultCode) {
    case "single": {
      const zone = params.hitZone || (isOutfield ? "front" : "infield");
      if (zone === "gap_lc") {
        return { battedDirection: "7-8", resultLabel: "左中間安打" };
      }
      if (zone === "gap_rc") {
        return { battedDirection: "8-9", resultLabel: "右中間安打" };
      }
      if (!isOutfield && zone !== "line" && zone !== "over") {
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
      if (zone === "infield") {
        return {
          battedDirection: code,
          resultLabel: `${shortJa}前安打`,
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
      const target =
        params.assistTargetPos || (code === "3" ? "unassisted" : "3");
      if (target === "unassisted" || target === code) {
        return {
          battedDirection: code,
          resultLabel: `${shortJa}ゴロ (${code})`,
        };
      }
      const dir = `${code}-${target}`;
      if (target === "4" || target === "6") {
        return {
          battedDirection: dir,
          resultLabel: `${shortJa}ゴロ二封 (${dir})`,
        };
      }
      if (target === "5") {
        return {
          battedDirection: dir,
          resultLabel: `${shortJa}ゴロ三封 (${dir})`,
        };
      }
      if (target === "2") {
        return {
          battedDirection: dir,
          resultLabel: `${shortJa}ゴロ本封 (${dir})`,
        };
      }
      return {
        battedDirection: dir,
        resultLabel: `${shortJa}ゴロ (${dir})`,
      };
    }

    case "sac_bunt": {
      const target =
        params.assistTargetPos || (code === "3" ? "4" : "3");
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
        params.assistTargetPos || (code === "3" ? "unassisted" : "3");
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
      return {
        battedDirection: relay,
        resultLabel: `${shortJa}併殺打 (${relay})`,
      };
    }

    case "triple_play": {
      const relay = (params.dpRelay || "").trim() || `${code}-4-3`;
      return {
        battedDirection: relay,
        resultLabel: `${shortJa}三重殺 (${relay})`,
      };
    }

    case "flyout": {
      const style = params.flyStyle || "fly";
      if (style === "foul_fly") {
        return {
          battedDirection: `${code}F`,
          resultLabel: `${shortJa}邪飛`,
        };
      }
      if (style === "liner") {
        return {
          battedDirection: `${code}L`,
          resultLabel: `${shortJa}直`,
        };
      }
      return {
        battedDirection: code,
        resultLabel: `${shortJa}飛`,
      };
    }

    case "infield_fly": {
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

    case "walk":
    case "intentional_walk":
    case "hit_by_pitch":
    case "strikeout":
    case "other":
    default: {
      return {
        battedDirection: "",
        resultLabel: params.fallbackLabel || defaultGenericLabel(resultCode),
      };
    }
  }
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

  const parsed = parseFieldingMeta(resultCode, cleanDir, cleanLabel);
  if (!parsed.primaryPos) {
    return {
      battedDirection: cleanDir,
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
    fallbackLabel: cleanLabel,
  });

  // 既存の日本語ラベルが十分に具体的（守備位置漢字を含んでいる）場合はそれを尊重しつつ、汎用ラベル（"ゴロ","安打","フライ"等）なら自動生成ラベルへ昇格させる
  const genericSet = new Set([
    "",
    "安打",
    "単打",
    "ヒット",
    "二塁打",
    "三塁打",
    "本塁打",
    "ホームラン",
    "ゴロ",
    "内ゴロ",
    "飛球",
    "フライ",
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

  const finalLabel =
    genericSet.has(cleanLabel) ||
    /^[0-9EFCLKS⌒︵︶∩^~〜￣ー\-△▲()（），,\s\u0304\u0305]+$/i.test(cleanLabel)
      ? composed.resultLabel
      : cleanLabel;

  const hasRawDecorGlyph =
    /[⌒︵︶∩^~〜￣ー－―‐→⇒➡△▲□◇◯○[\]{}()（），,０-９\u0304\u0305]/.test(
      cleanDir
    ) || /^[1-9]-$/.test(cleanDir);

  const normCleanDir = normalizeFieldingAscii(cleanDir);
  const isPrefixThrowErr =
    resultCode === "error" && /^E[1-9]-[1-9]$/i.test(normCleanDir);

  return {
    battedDirection:
      !cleanDir || hasRawDecorGlyph || isPrefixThrowErr
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

