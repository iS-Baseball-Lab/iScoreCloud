// filepath: src/lib/liff/scorebook-cell-guide.ts
import {
  isNonPitchMoundEvent,
  isPickoffPitch,
  type AdvanceMethodCode,
  type CanonicalAtBatResult,
  type CanonicalPitchResult,
  type ScorebookV2AtBat,
} from "@/types/scorebook-v2";
import type {
  BaseSegmentIndex,
  CompiledDiamondSegment,
  CompiledScorebookCell,
  CompiledScorebookSheetModel,
} from "@/lib/liff/scorebook-renderer-model";
import {
  formatAdvanceMethodByRules,
  formatAtBatPlayNotation,
  formatOutOrdinalText,
  type ScorebookSymbolRules,
} from "@/lib/liff/scorebook-symbol-rules";

export interface InspectedScorebookCellItem {
  cell: CompiledScorebookCell;
  model: CompiledScorebookSheetModel;
}

export interface PitchGuideItem {
  /** 表示行インデックス（1始まり） */
  stepIndex: number;
  /** 正式な投球数番号（牽制・ボーク時は null） */
  pitchNumber: number | null;
  pitchCode: CanonicalPitchResult;
  /** 球数番号式 (numbered_bs) の場合の表記トークン（例: "1", "2F"） */
  numberedToken?: string;
  /** 球数番号式 (numbered_bs) の場合の段（"S" | "B"） */
  numberedLane?: "S" | "B";
  /** テキスト補助ラベル（例: "○", "●", "ー", "△", "＞", "打撃"） */
  symbolHint: string;
  /** 見出し（例: "見逃しストライク", "ボール", "3球目を打撃（インプレー）"） */
  title: string;
  /** 初心者向けのやさしい解説文 */
  description: string;
  /** この球の後のカウント表記（例: "1B-2S"） */
  countText: string | null;
  /** 左のBSO欄には記号を書かないイベント（インプレー打撃・死球）か */
  isNoBsoMarkEvent: boolean;
  tone: "strike" | "ball" | "foul" | "mound" | "in_play";
}

export interface ResultBreakdownRow {
  badge: string;
  badgeTone: "red" | "dark" | "blue" | "amber";
  title: string;
  description: string;
}

export interface DiamondBreakdownRow {
  zoneLabel: string;
  symbolText: string;
  tone: "red" | "dark" | "blue" | "muted";
  title: string;
  description: string;
}

export interface ScorebookCellGuideData {
  inningText: string;
  teamAttackText: string;
  batterOrder: number;
  batterName: string;
  batterUniformNumber: string;
  pitcherName: string;
  headlineResult: string;
  rbi: number;
  pitchSummaryBadge: string;
  pitchEmptyNote: string | null;
  pitches: PitchGuideItem[];
  resultNotationMain: string;
  resultNotationSub?: string;
  resultDecoratorLabel?: string;
  resultRows: ResultBreakdownRow[];
  diamondRows: DiamondBreakdownRow[];
}

const POSITION_NAME_JA: Record<string, { short: string; full: string }> = {
  "1": { short: "投", full: "投手（ピッチャー）" },
  "2": { short: "捕", full: "捕手（キャッチャー）" },
  "3": { short: "一", full: "一塁手（ファースト）" },
  "4": { short: "二", full: "二塁手（セカンド）" },
  "5": { short: "三", full: "三塁手（サード）" },
  "6": { short: "遊", full: "遊撃手（ショート）" },
  "7": { short: "左", full: "左翼手（レフト）" },
  "8": { short: "中", full: "中堅手（センター）" },
  "9": { short: "右", full: "右翼手（ライト）" },
};

const CANONICAL_RESULT_HEADLINE_JA: Record<CanonicalAtBatResult, string> = {
  single: "単打（ヒット）",
  double: "二塁打",
  triple: "三塁打",
  home_run: "本塁打（ホームラン）",
  walk: "四球（フォアボール）",
  intentional_walk: "敬遠四球",
  hit_by_pitch: "死球（デッドボール）",
  interference: "打撃妨害",
  sac_bunt: "犠打（送りバント）",
  sac_fly: "犠飛（犠牲フライ）",
  groundout: "内野ゴロ",
  flyout: "フライ / ライナー",
  infield_fly: "インフィールドフライ",
  strikeout: "三振",
  dropped_third_strike_out: "三振（振り逃げアウト）",
  dropped_third_strike: "振り逃げ出塁",
  double_play: "併殺打（ダブルプレー）",
  triple_play: "三重殺（トリプルプレー）",
  interference_out: "守備妨害アウト",
  error: "相手失策（エラー）出塁",
  fc: "野手選択（フィルダースチョイス）",
  other: "打席途中断・走塁死終了",
};

function isBattedInPlayResult(rc: CanonicalAtBatResult): boolean {
  return (
    rc === "single" ||
    rc === "double" ||
    rc === "triple" ||
    rc === "home_run" ||
    rc === "sac_bunt" ||
    rc === "sac_fly" ||
    rc === "groundout" ||
    rc === "flyout" ||
    rc === "infield_fly" ||
    rc === "double_play" ||
    rc === "triple_play" ||
    rc === "error" ||
    rc === "fc"
  );
}

/**
 * 1枚のスコアブックモデルから、記録が存在する全マスを打席順（時系列順）に取得する
 * ※ cellsByKey は各イニング内で打席発生順に挿入されているため、打者一巡（9番→1番）の順序も正確に保持される
 */
export function getChronologicalSheetCells(
  model: CompiledScorebookSheetModel
): CompiledScorebookCell[] {
  const entries = Object.values(model.cellsByKey)
    .map((cell, insertionIdx) => ({ cell, insertionIdx }))
    .filter(({ cell }) => Boolean(cell.atBat || cell.isTiebreakRunnerOnly));

  entries.sort((a, b) => {
    if (a.cell.inning !== b.cell.inning) {
      return a.cell.inning - b.cell.inning;
    }
    if (a.cell.isTiebreakRunnerOnly !== b.cell.isTiebreakRunnerOnly) {
      return a.cell.isTiebreakRunnerOnly ? -1 : 1;
    }
    return a.insertionIdx - b.insertionIdx;
  });

  return entries.map((item) => item.cell);
}

/**
 * 先攻（表）・後攻（裏）のモデルを「1回表 → 1回裏 → 2回表 → 2回裏...」の試合進行順に統合する
 */
export function getChronologicalMergedGameCells(
  topModel: CompiledScorebookSheetModel | null,
  bottomModel: CompiledScorebookSheetModel | null
): InspectedScorebookCellItem[] {
  const topCells = topModel ? getChronologicalSheetCells(topModel) : [];
  const bottomCells = bottomModel ? getChronologicalSheetCells(bottomModel) : [];

  const inningSet = new Set<number>();
  for (const c of topCells) inningSet.add(c.inning);
  for (const c of bottomCells) inningSet.add(c.inning);
  const innings = Array.from(inningSet).sort((a, b) => a - b);

  const merged: InspectedScorebookCellItem[] = [];
  for (const inn of innings) {
    if (topModel) {
      for (const c of topCells) {
        if (c.inning === inn) {
          merged.push({ cell: c, model: topModel });
        }
      }
    }
    if (bottomModel) {
      for (const c of bottomCells) {
        if (c.inning === inn) {
          merged.push({ cell: c, model: bottomModel });
        }
      }
    }
  }
  return merged;
}

/**
 * 対象マスの打者氏名・背番号をラインナップ＆途中交代情報から解決する
 */
export function resolveCellBatterIdentity(
  cell: CompiledScorebookCell,
  model: CompiledScorebookSheetModel
): { name: string; uniformNumber: string } {
  const row = model.batterRows.find((r) => r.battingOrder === cell.battingOrder);
  const slot = row?.slot;

  const explicitName = (
    cell.atBat?.batterName ||
    cell.leftOutsideSub?.name ||
    cell.rightInsideSub?.name ||
    ""
  ).trim();

  if (slot) {
    if (explicitName) {
      if (slot.name.trim() === explicitName) {
        return {
          name: explicitName,
          uniformNumber: slot.uniformNumber || "",
        };
      }
      const matchedSub = slot.substitutions.find(
        (s) => s.name.trim() === explicitName
      );
      if (matchedSub) {
        return {
          name: explicitName,
          uniformNumber: matchedSub.uniformNumber || "",
        };
      }
      return { name: explicitName, uniformNumber: "" };
    }

    // タイブレーク走者など打席オブジェクトが無い場合は該当イニング時点の出場選手を推定
    let activeName = slot.name || `${cell.battingOrder}番打者`;
    let activeNum = slot.uniformNumber || "";
    for (const sub of slot.substitutions) {
      if (sub.inningEntered <= cell.inning && sub.name.trim()) {
        activeName = sub.name.trim();
        activeNum = sub.uniformNumber || activeNum;
      }
    }
    return { name: activeName, uniformNumber: activeNum };
  }

  return {
    name: explicitName || `${cell.battingOrder}番打者`,
    uniformNumber: "",
  };
}

function resolveDrivingBatterText(
  drivingOrder: number,
  inning: number,
  model: CompiledScorebookSheetModel
): string {
  const row = model.batterRows.find((r) => r.battingOrder === drivingOrder);
  if (!row) {
    return `${drivingOrder}番打者`;
  }
  let activeName = row.slot.name.trim();
  for (const sub of row.slot.substitutions) {
    if (
      sub.inningEntered <= inning &&
      (sub.subType === "PH" || sub.subType === "DEF") &&
      sub.name.trim()
    ) {
      activeName = sub.name.trim();
    }
  }
  return activeName ? `${drivingOrder}番 ${activeName}` : `${drivingOrder}番打者`;
}

function describeSinglePitch(
  p: CanonicalPitchResult,
  rules: ScorebookSymbolRules,
  pitchSeq: number
): {
  symbolHint: string;
  title: string;
  description: string;
  numberedToken?: string;
  numberedLane?: "S" | "B";
  isNoBsoMarkEvent: boolean;
  tone: PitchGuideItem["tone"];
} {
  if (p === "in_play" || p === "hit") {
    const isHit = p === "hit";
    return {
      symbolHint: "打撃",
      title:
        pitchSeq === 1
          ? `初球を打撃（${isHit ? "安打" : "インプレー"}）`
          : `${pitchSeq}球目を打撃（${isHit ? "安打" : "インプレー"}）`,
      description:
        "バットに当たってフェアゾーン（または捕球プレイ）になった球は、左のBSO欄には記号を書かず、右下やダイヤモンドに結果を記入します。",
      isNoBsoMarkEvent: true,
      tone: "in_play",
    };
  }

  if (p === "hbp") {
    return {
      symbolHint: "死球",
      title: `${pitchSeq}球目が死球（デッドボール）`,
      description:
        "打者に当たった球は左のBSO欄には記号を書かず、右下に死球記号を記入して一塁へ進塁線を引きます。",
      isNoBsoMarkEvent: true,
      tone: "in_play",
    };
  }

  if (p === "balk") {
    return {
      symbolHint: "BK",
      title: "ボーク（投球数に含めない）",
      description:
        "投手のボーク反則です。正式な球数やボール・ストライクには含めず、塁上の走者が1つずつ進塁します。",
      isNoBsoMarkEvent: false,
      tone: "mound",
    };
  }

  if (isPickoffPitch(p)) {
    const baseLabel =
      p === "pickoff_2b"
        ? "二塁"
        : p === "pickoff_3b"
        ? "三塁"
        : "一塁";
    const arrowHint =
      rules.pickoffMark === "full_arrow"
        ? p === "pickoff_2b"
          ? "↑"
          : p === "pickoff_3b"
          ? "←"
          : "→"
        : rules.pickoffMark === "kanji_num"
        ? p === "pickoff_2b"
          ? "2牽"
          : p === "pickoff_3b"
          ? "3牽"
          : "1牽"
        : p === "pickoff_2b"
        ? "∧"
        : p === "pickoff_3b"
        ? "＜"
        : "＞";
    return {
      symbolHint: arrowHint,
      title: `${baseLabel}への牽制球`,
      description:
        rules.pickoffMark === "hidden"
          ? `${baseLabel}への牽制球です（現在の記号設定ではBSO欄への牽制表示を省略しています）。球数には含めません。`
          : `ダイヤモンドの${baseLabel}方向を指す記号で${baseLabel}牽制を表します。投球数やB/Sカウントには含めません。`,
      isNoBsoMarkEvent: rules.pickoffMark === "hidden",
      tone: "mound",
    };
  }

  const isNumbered = rules.pitchMark === "numbered_bs";

  if (p === "strike") {
    return {
      symbolHint: isNumbered ? `S:${pitchSeq}` : "○",
      numberedToken: isNumbered ? String(pitchSeq) : undefined,
      numberedLane: isNumbered ? "S" : undefined,
      title: "見逃しストライク",
      description: isNumbered
        ? `上段のS（ストライク）欄に「${pitchSeq}」球目の番号を記入します。`
        : "白抜きの丸「○」は、打者がバットを振らずにストライク判定になった球を表します。",
      isNoBsoMarkEvent: false,
      tone: "strike",
    };
  }

  if (p === "bunt_swinging") {
    const token =
      rules.buntPitchMark === "v_dot_circle_dot" ||
      rules.buntPitchMark === "inv_triangle_diamond"
        ? `${pitchSeq}BS`
        : String(pitchSeq);
    const hint = isNumbered
      ? `S:${token}`
      : rules.buntPitchMark === "v_dot_circle_dot"
      ? "⊙"
      : rules.buntPitchMark === "inv_triangle_diamond"
      ? "◇"
      : rules.pitchMark === "cross_swing" || rules.pitchMark === "cross_dot_swing"
      ? "×"
      : rules.pitchMark === "slash_swing"
      ? "／"
      : "●";
    return {
      symbolHint: hint,
      numberedToken: isNumbered ? token : undefined,
      numberedLane: isNumbered ? "S" : undefined,
      title: "バント空振りストライク",
      description:
        "バントを試みてバットに当たらなかった空振りストライクを表します。",
      isNoBsoMarkEvent: false,
      tone: "strike",
    };
  }

  if (p === "swinging_strike") {
    const hint = isNumbered
      ? `S:${pitchSeq}`
      : rules.pitchMark === "cross_swing" || rules.pitchMark === "cross_dot_swing"
      ? "×"
      : rules.pitchMark === "slash_swing"
      ? "／"
      : "●";
    const glyphExplain = isNumbered
      ? `上段のS（ストライク）欄に「${pitchSeq}」球目の番号を記入します。`
      : hint === "×"
      ? "バツ印「×」は、打者がバットを振って空振りしたストライクを表します。"
      : hint === "／"
      ? "斜線「／」は、打者がバットを振って空振りしたストライクを表します。"
      : "黒塗りの丸「●」は、打者がバットを振って空振りしたストライクを表します（白丸○の見逃しと区別します）。";
    return {
      symbolHint: hint,
      numberedToken: isNumbered ? String(pitchSeq) : undefined,
      numberedLane: isNumbered ? "S" : undefined,
      title: "空振りストライク",
      description: glyphExplain,
      isNoBsoMarkEvent: false,
      tone: "strike",
    };
  }

  if (p === "ball") {
    const hint = isNumbered
      ? `B:${pitchSeq}`
      : rules.pitchMark === "slash_swing" || rules.pitchMark === "cross_dot_swing"
      ? "・"
      : "ー";
    return {
      symbolHint: hint,
      numberedToken: isNumbered ? String(pitchSeq) : undefined,
      numberedLane: isNumbered ? "B" : undefined,
      title: "ボール",
      description: isNumbered
        ? `下段のB（ボール）欄に「${pitchSeq}」球目の番号を記入します。`
        : hint === "・"
        ? "黒点「・」はストライクゾーンを外れたボール球を表します。"
        : "横線「ー」はストライクゾーンを外れたボール球を表します。4つたまると四球になります。",
      isNoBsoMarkEvent: false,
      tone: "ball",
    };
  }

  if (p === "bunt_foul") {
    const token =
      rules.buntPitchMark !== "same_as_normal" ? `${pitchSeq}BF` : `${pitchSeq}F`;
    const hint = isNumbered
      ? `S:${token}`
      : rules.buntPitchMark === "v_dot_circle_dot"
      ? "V・"
      : rules.buntPitchMark === "inv_triangle_diamond"
      ? "▽"
      : rules.buntPitchMark === "same_as_normal"
      ? "△"
      : "▲";
    return {
      symbolHint: hint,
      numberedToken: isNumbered ? token : undefined,
      numberedLane: isNumbered ? "S" : undefined,
      title: "バントファウル",
      description:
        "バントした打球がファウルになった球です。通常のファウルと異なり、2ストライク後でもスリーバント失敗で三振になります。",
      isNoBsoMarkEvent: false,
      tone: "foul",
    };
  }

  // foul
  return {
    symbolHint: isNumbered ? `S:${pitchSeq}F` : "△",
    numberedToken: isNumbered ? `${pitchSeq}F` : undefined,
    numberedLane: isNumbered ? "S" : undefined,
    title: "ファウル",
    description: isNumbered
      ? `上段S欄に「${pitchSeq}F」と記入してファウルを表します（2ストライク後はカウント据え置き）。`
      : "三角「△」はファウルボールを表します。2ストライクまではストライクが増え、2ストライク後はカウントが変わりません。",
    isNoBsoMarkEvent: false,
    tone: "foul",
  };
}

function buildPitchSection(
  cell: CompiledScorebookCell,
  rules: ScorebookSymbolRules
): {
  pitchSummaryBadge: string;
  pitchEmptyNote: string | null;
  pitches: PitchGuideItem[];
} {
  const ab = cell.atBat;
  if (!ab) {
    return {
      pitchSummaryBadge: "打席なし",
      pitchEmptyNote:
        "タイブレーク開始走者として塁上に置かれたマスのため、左列の配球記録はありません。",
      pitches: [],
    };
  }

  const rawPitches = [...ab.pitches];
  const hasExplicitTerminal = rawPitches.some(
    (p) => p === "in_play" || p === "hit" || p === "hbp"
  );

  // 手書きスコアブックでは最終打撃球にBSO記号を書かないため、解説用に最終インプレー球を補完してわかりやすく表示
  if (!hasExplicitTerminal) {
    if (
      ab.resultCode === "single" ||
      ab.resultCode === "double" ||
      ab.resultCode === "triple" ||
      ab.resultCode === "home_run"
    ) {
      rawPitches.push("hit");
    } else if (isBattedInPlayResult(ab.resultCode)) {
      rawPitches.push("in_play");
    } else if (ab.resultCode === "hit_by_pitch") {
      rawPitches.push("hbp");
    }
  }

  const items: PitchGuideItem[] = [];
  let balls = 0;
  let strikes = 0;
  let officialPitchCount = 0;

  rawPitches.forEach((p, idx) => {
    const isMound = isNonPitchMoundEvent(p);
    if (!isMound) {
      officialPitchCount += 1;
    }

    if (p === "ball") {
      balls = Math.min(4, balls + 1);
    } else if (
      p === "strike" ||
      p === "swinging_strike" ||
      p === "bunt_swinging" ||
      p === "bunt_foul"
    ) {
      strikes = Math.min(3, strikes + 1);
    } else if (p === "foul" && strikes < 2) {
      strikes += 1;
    }

    const desc = describeSinglePitch(p, rules, officialPitchCount);
    const isTerminalInPlay = p === "in_play" || p === "hit" || p === "hbp";

    items.push({
      stepIndex: idx + 1,
      pitchNumber: isMound ? null : officialPitchCount,
      pitchCode: p,
      numberedToken: desc.numberedToken,
      numberedLane: desc.numberedLane,
      symbolHint: desc.symbolHint,
      title: desc.title,
      description: desc.description,
      countText: isMound || isTerminalInPlay ? null : `${balls}B-${strikes}S`,
      isNoBsoMarkEvent: desc.isNoBsoMarkEvent,
      tone: desc.tone,
    });
  });

  const visibleMarksCount = ab.pitches.filter(
    (p) =>
      p !== "in_play" &&
      p !== "hit" &&
      p !== "hbp" &&
      !(rules.pickoffMark === "hidden" && isPickoffPitch(p))
  ).length;

  let pitchEmptyNote: string | null = null;
  if (visibleMarksCount === 0) {
    if (isBattedInPlayResult(ab.resultCode)) {
      pitchEmptyNote =
        "初球（1球目）を打ってインプレーになったため、左のBSO欄は空白のままにするのがスコアブックの正しい書き方です。";
    } else if (ab.resultCode === "hit_by_pitch") {
      pitchEmptyNote =
        "初球が死球（デッドボール）になったため、左のBSO欄は空白になります。";
    } else if (ab.resultCode === "intentional_walk") {
      pitchEmptyNote =
        "申告敬遠（または投球記録省略の敬遠）のため、左のBSO欄は空白です。";
    } else {
      pitchEmptyNote =
        "この打席は1球ごとの配球記号が省略されており、打席結果のみが記録されています。";
    }
  }

  const pitchSummaryBadge =
    officialPitchCount === 1 && isBattedInPlayResult(ab.resultCode)
      ? "初球打ち（1球）"
      : officialPitchCount > 0
      ? `全${officialPitchCount}球（${balls}B-${Math.min(2, strikes)}S）`
      : "配球記録なし";

  return {
    pitchSummaryBadge,
    pitchEmptyNote,
    pitches: items,
  };
}

function buildFielderExplanationRow(
  mainText: string,
  ab: ScorebookV2AtBat
): ResultBreakdownRow | null {
  const cleanDir = (ab.battedDirection || "").trim();
  const sourceToken =
    /^[1-9](?:-[1-9])+$/.test(mainText) ||
    /^[1-9]{1,2}$/.test(mainText) ||
    /78|89/.test(mainText)
      ? mainText
      : cleanDir || mainText;

  // 1. 送球経路（例: 6-3, 6-4-3, 1-2-3）
  const chainMatch = sourceToken.match(/[1-9](?:-[1-9])+/);
  if (chainMatch) {
    const nums = chainMatch[0].split("-");
    const stepsJa = nums.map((n) => {
      const info = POSITION_NAME_JA[n];
      return info ? `${n}（${info.short}：${info.full.replace(/（.*）/, "")}）` : n;
    });
    return {
      badge: chainMatch[0],
      badgeTone: "blue",
      title: "守備番号と送球ルート",
      description: `${stepsJa.join(" → ")} の順にボールが渡ってアウトにしたことを表します。`,
    };
  }

  // 2. 左中間(78)・右中間(89)
  if (sourceToken.includes("78")) {
    return {
      badge: "78",
      badgeTone: "blue",
      title: "打球方向：左中間（レフト・センター間）",
      description:
        "7（左翼手）と 8（中堅手）の間を抜ける左中間方向への打球を表します。",
    };
  }
  if (sourceToken.includes("89")) {
    return {
      badge: "89",
      badgeTone: "blue",
      title: "打球方向：右中間（センター・ライト間）",
      description:
        "8（中堅手）と 9（右翼手）の間を抜ける右中間方向への打球を表します。",
    };
  }

  // 3. 単独守備番号（例: 8, (8), 8F, 6E, BH5, HR(7)）
  const singleDigitMatch = sourceToken.match(/[1-9]/);
  if (singleDigitMatch) {
    const d = singleDigitMatch[0];
    const info = POSITION_NAME_JA[d];
    if (info) {
      return {
        badge: d,
        badgeTone: "blue",
        title: `守備番号 ${d} ＝ ${info.full}`,
        description: `野球のスコアでは守備位置を 1(投)・2(捕)・3(一)・4(二)・5(三)・6(遊)・7(左)・8(中)・9(右) の番号で表します。ここでは「${info.full}」方向の打球・守備機会を示します。`,
      };
    }
  }

  return null;
}

function buildResultSection(
  cell: CompiledScorebookCell,
  rules: ScorebookSymbolRules
): {
  headlineResult: string;
  resultNotationMain: string;
  resultNotationSub?: string;
  resultDecoratorLabel?: string;
  resultRows: ResultBreakdownRow[];
} {
  const ab = cell.atBat;
  if (!ab) {
    const startBaseJa =
      cell.tiebreakStartBase === "1B"
        ? "一塁"
        : cell.tiebreakStartBase === "3B"
        ? "三塁"
        : "二塁";
    return {
      headlineResult: `タイブレーク${startBaseJa}走者`,
      resultNotationMain: "TB",
      resultRows: [
        {
          badge: "TB",
          badgeTone: "blue",
          title: `タイブレーク開始走者（${startBaseJa}）`,
          description: `イニング開始時点から無死（または継続条件）で${startBaseJa}に配置されたタイブレーク走者のマスです。右下の打撃結果は空欄になります。`,
        },
      ],
    };
  }

  const notation = formatAtBatPlayNotation(ab, rules);
  const headlineResult =
    (ab.resultLabel || "").trim() ||
    CANONICAL_RESULT_HEADLINE_JA[ab.resultCode] ||
    "打席完了";

  const rows: ResultBreakdownRow[] = [];
  let decoratorLabel: string | undefined;

  const rc = ab.resultCode;

  // メイン結果の解説
  if (rc === "single" || rc === "double" || rc === "triple" || rc === "home_run") {
    const hitKindJa =
      rc === "single"
        ? "単打（ヒット）"
        : rc === "double"
        ? "二塁打（ツーベース）"
        : rc === "triple"
        ? "三塁打（スリーベース）"
        : "本塁打（ホームラン）";
    const slashRuleJa =
      rules.hitLine === "quadrant_slash_hr_diamond"
        ? rc === "home_run"
          ? "ダイヤモンド全体を太い赤線で一周させて本塁打を表し、右下に打球方向を黒字で記します。"
          : `右下の赤い斜線の本数（${
              rc === "single" ? "／＝1本" : rc === "double" ? "／／＝2本" : "／／／＝3本"
            }）で${hitKindJa}を表し、その横に打球方向の番号を記します。`
        : rules.hitLine === "parallel_bars"
        ? rc === "home_run"
          ? "ダイヤモンドを赤実線で結び、内側に赤ダイヤ枠を添えて本塁打を表します。"
          : "一塁線の赤い平行線の本数で単打・二塁打・三塁打を区別します。"
        : rules.hitLine === "mono_bold"
        ? "白黒印刷でも判別しやすい太い黒実線と一塁線の直交マークで安打を表します。"
        : rc === "home_run"
        ? "一塁から本塁までダイヤモンドの4辺すべてを赤実線で結んで本塁打を表します。"
        : "到達した塁まで赤実線を引き、一塁線に直交する赤線マークで安打の種類を表します。";

    rows.push({
      badge: notation.mainText || "H",
      badgeTone: "red",
      title: `${hitKindJa}（${headlineResult}）`,
      description: slashRuleJa,
    });
    if (/^BH/i.test(notation.mainText)) {
      rows.push({
        badge: "BH",
        badgeTone: "amber",
        title: "BH ＝ バントヒット",
        description:
          "バントした打球が内野安打になったことを「BH（Bunt Hit）」で表しています。",
      });
    }
  } else if (rc === "walk" || rc === "intentional_walk" || rc === "hit_by_pitch") {
    const kindTitle =
      rc === "walk"
        ? "四球（フォアボール）"
        : rc === "intentional_walk"
        ? "敬遠四球（申告敬遠含む）"
        : "死球（デッドボール）";
    const kindDesc =
      rc === "walk"
        ? `「${notation.mainText}」は4ボールによる四球出塁を表します。`
        : rc === "intentional_walk"
        ? `「${notation.mainText}」は敬遠（故意四球）による一塁出塁を表します。`
        : `「${notation.mainText}」は投球が打者の身体に当たった死球（Hit By Pitch / Dead Ball）を表します。`;
    rows.push({
      badge: notation.mainText,
      badgeTone: "dark",
      title: kindTitle,
      description: kindDesc,
    });
  } else if (
    rc === "strikeout" ||
    rc === "dropped_third_strike_out" ||
    rc === "dropped_third_strike"
  ) {
    if (notation.decorator === "reverse_k") {
      decoratorLabel = "反転K（見逃し三振）";
      rows.push({
        badge: "反転K",
        badgeTone: "dark",
        title: "見逃し三振（最後の3ストライク目を見逃し）",
        description:
          "左右反転させた「K」は、最後の球をバットを振らずに見逃して三振になったことを表します（空振り三振の通常Kと一目で区別できます）。",
      });
    } else if (notation.decorator === "circle_k") {
      decoratorLabel = "丸囲みK（見逃し三振）";
      rows.push({
        badge: "Ⓚ",
        badgeTone: "dark",
        title: "見逃し三振（最後の3ストライク目を見逃し）",
        description:
          "丸で囲んだ「Ⓚ」は、最後の球を見逃して三振になったことを表します（空振り三振は丸なしのK）。",
      });
    } else {
      rows.push({
        badge: notation.mainText,
        badgeTone: "dark",
        title: headlineResult.includes("見逃") ? "見逃し三振" : "空振り三振",
        description: `「${notation.mainText}」は3ストライクによる三振を表します。`,
      });
    }

    if (notation.subText) {
      if (rc === "dropped_third_strike_out") {
        rows.push({
          badge: notation.subText,
          badgeTone: "blue",
          title: "振り逃げ時の送球アウト記録",
          description: `第3ストライクを捕手が後逸・ワンバウンド捕球したあと、「${notation.subText}」（捕手→一塁手など）へ送球してアウトにしたことを表します。`,
        });
      } else if (rc === "dropped_third_strike") {
        rows.push({
          badge: notation.subText,
          badgeTone: "amber",
          title: "振り逃げ成功で一塁出塁",
          description:
            "第3ストライクが暴投・捕逸となり、打者がアウトにならず一塁へ生きた（振り逃げ出塁）ことを表します。",
        });
      } else if (notation.subText === "3B") {
        rows.push({
          badge: "3B",
          badgeTone: "amber",
          title: "スリーバント失敗",
          description:
            "2ストライク後にバントがファウルとなり、規則により三振アウトになったことを表します。",
        });
      }
    }
  } else if (rc === "sac_bunt") {
    decoratorLabel =
      notation.decorator === "sac_square" ? "□枠（犠打・バント）" : "◇枠（犠打）";
    const shapeName =
      notation.decorator === "sac_square" ? "四角枠「□」" : "ダイヤ枠「◇」";
    rows.push({
      badge: notation.decorator === "sac_square" ? `□${notation.mainText}` : `◇${notation.mainText}`,
      badgeTone: "amber",
      title: `犠打（送りバント：${headlineResult}）`,
      description: `${shapeName}で守備番号を囲むことで、走者を進めるための犠打（送りバント）が成功したことを表します（打数には含まれません）。`,
    });
  } else if (rc === "sac_fly") {
    decoratorLabel = "犠飛マーク";
    rows.push({
      badge:
        notation.decorator === "sac_fly_umbrella"
          ? `◇︵${notation.mainText}`
          : `◇${notation.mainText}`,
      badgeTone: "amber",
      title: `犠飛（犠牲フライ：${headlineResult}）`,
      description:
        "外野フライ等の捕球後に走者がタッチアップでホームインした「犠牲フライ」を表します（打数には含まれず打点がつきます）。",
    });
  } else if (rc === "flyout" || rc === "infield_fly") {
    if (
      notation.decorator === "umbrella" ||
      notation.decorator === "bunt_fly_square_umbrella"
    ) {
      decoratorLabel =
        notation.decorator === "bunt_fly_square_umbrella"
          ? "□＋傘（バントフライ）"
          : "︵ 傘マーク（フライ）";
      rows.push({
        badge: `︵${notation.mainText}`,
        badgeTone: "dark",
        title: `フライアウト（${headlineResult}）`,
        description:
          notation.decorator === "bunt_fly_square_umbrella"
            ? "四角枠「□（バント）」と上の曲線「︵（傘マーク＝フライ）」で、バントが小フライになって捕球されたことを表します。"
            : "守備番号の上にある曲線「︵（傘マーク）」は、高く上がったフライ（飛球）をノーバウンド捕球してアウトにしたことを表します。",
      });
    } else if (notation.decorator === "overline") {
      decoratorLabel = "￣ 上線マーク（ライナー）";
      rows.push({
        badge: `￣${notation.mainText}`,
        badgeTone: "dark",
        title: `ライナーアウト（${headlineResult}）`,
        description:
          "守備番号の上にある真っ直ぐな横線「￣」は、鋭い直線打球（ライナー）を直接捕球してアウトにしたことを表します。",
      });
    } else {
      rows.push({
        badge: notation.mainText,
        badgeTone: "dark",
        title: headlineResult,
        description: `「${notation.mainText}」は飛球またはライナーを直接捕球してアウトにしたことを表します。`,
      });
    }

    if (notation.subText === "IF") {
      rows.push({
        badge: "IF",
        badgeTone: "amber",
        title: "IF ＝ インフィールドフライ宣告",
        description:
          "無死または一死で走者一・二塁（または満塁）の場面で内野フェア飛球に宣告されるインフィールドフライを表します。",
      });
    } else if (notation.subText === "F" || notation.subText === "BF") {
      rows.push({
        badge: notation.subText,
        badgeTone: "dark",
        title: "F ＝ ファウルフライ（邪飛）",
        description:
          "ファウルゾーンに上がった飛球を野手が捕球してアウトにしたことを表します。",
      });
    }
  } else if (rc === "error") {
    rows.push({
      badge: notation.mainText || "E",
      badgeTone: "amber",
      title: `相手失策（エラー）による出塁（${headlineResult}）`,
      description: `「${
        rules.advanceError === "kanji" ? "失" : "E"
      }」は野手のエラー（捕球ミス・悪送球）によって打者がセーフになったことを表します（安打にはならず打数にカウントされます）。`,
    });
  } else if (rc === "fc") {
    rows.push({
      badge: notation.subText
        ? `${notation.mainText} (${notation.subText})`
        : notation.mainText || "FC",
      badgeTone: "amber",
      title: `野手選択（フィルダースチョイス：${headlineResult}）`,
      description:
        "野手が打者走者ではなく先行走者をアウトにしようと送球した結果、打者走者が一塁に生きたプレイを表します。",
    });
  } else if (rc === "groundout" || rc === "double_play" || rc === "triple_play") {
    rows.push({
      badge: notation.mainText,
      badgeTone: "dark",
      title: headlineResult,
      description:
        "ゴロを捕球した野手の番号から送球先の野手の番号へハイフン「-」でつなぎ、ゴロ送球アウトを表します。",
    });
    if (notation.subText === "DP" || rc === "double_play") {
      rows.push({
        badge: "DP",
        badgeTone: "amber",
        title: "DP ＝ 併殺（ダブルプレー）",
        description:
          "1つの打球から連続して2つのアウトを取った併殺プレイを表します（シート全体ではアウトになった走者マスと連結記号で結ばれます）。",
      });
    } else if (notation.subText === "TP" || rc === "triple_play") {
      rows.push({
        badge: "TP",
        badgeTone: "amber",
        title: "TP ＝ 三重殺（トリプルプレー）",
        description: "1つの打球から一気に3つのアウトを取った三重殺プレイを表します。",
      });
    }
  } else if (rc === "interference" || rc === "interference_out") {
    rows.push({
      badge: notation.mainText || "INT",
      badgeTone: "amber",
      title: headlineResult,
      description:
        rc === "interference"
          ? "捕手等の打撃妨害により打者に一塁が与えられた記録です。"
          : "打者または走者の守備妨害によりアウトが宣告された記録です。",
    });
  } else {
    rows.push({
      badge: notation.mainText || "中断",
      badgeTone: "dark",
      title: headlineResult,
      description:
        "打席の途中で盗塁死・牽制死などにより3アウトチェンジとなったため、この打席は完了せず次の回の先頭打者へ持ち越されます。",
    });
  }

  // 守備番号・送球経路の補足行を追加
  const fielderRow = buildFielderExplanationRow(notation.mainText, ab);
  if (fielderRow) {
    rows.push(fielderRow);
  }

  return {
    headlineResult,
    resultNotationMain: notation.mainText,
    resultNotationSub: notation.subText,
    resultDecoratorLabel: decoratorLabel,
    resultRows: rows,
  };
}

function segmentRangeLabel(startSeg: BaseSegmentIndex, endSeg: BaseSegmentIndex): string {
  const fromNames: Record<BaseSegmentIndex, string> = {
    1: "本塁",
    2: "一塁",
    3: "二塁",
    4: "三塁",
  };
  const toNames: Record<BaseSegmentIndex, string> = {
    1: "一塁",
    2: "二塁",
    3: "三塁",
    4: "本塁",
  };
  return `${fromNames[startSeg]} → ${toNames[endSeg]}`;
}

function describeAdvanceMethodMeaning(
  seg: CompiledDiamondSegment,
  startSeg: BaseSegmentIndex,
  endSeg: BaseSegmentIndex,
  cell: CompiledScorebookCell,
  model: CompiledScorebookSheetModel,
  rules: ScorebookSymbolRules
): { symbolText: string; tone: DiamondBreakdownRow["tone"]; title: string; description: string } {
  const rangeJa = segmentRangeLabel(startSeg, endSeg);
  const advSymbol = formatAdvanceMethodByRules(
    seg.method,
    rules,
    seg.drivingBatterOrder
  );
  const dottedNote =
    seg.status === "safe" && !seg.isBatterHit && rules.runnerLine === "dotted_only"
      ? "（※現在の記号ルールでは進塁線を点線のまま残し、記号で進塁位置を示します）"
      : "";

  if (seg.isBatterHit) {
    const hitName =
      seg.hitBases === 4
        ? "本塁打"
        : seg.hitBases === 3
        ? "三塁打"
        : seg.hitBases === 2
        ? "二塁打"
        : "単打（ヒット）";
    return {
      symbolText: rules.hitLine === "mono_bold" ? "黒太線" : "赤実線",
      tone: "red",
      title: `${rangeJa}：自分の${hitName}で到達`,
      description: `打者自身の安打で進んだ区間は、ダイヤモンドの辺に沿って${
        rules.hitLine === "mono_bold" ? "太い実線" : "赤い実線"
      }を引きます。`,
    };
  }

  if (seg.status === "out") {
    const outLineSymbol =
      rules.runnerOutLine === "t_stop"
        ? advSymbol
          ? `━━┫ ${advSymbol}`
          : "━━┫"
        : rules.runnerOutLine === "quadrant_arrow"
        ? advSymbol
          ? `→ ${advSymbol}`
          : "→"
        : advSymbol || "走塁死";

    const driverJa =
      seg.drivingBatterOrder && seg.drivingBatterOrder > 0
        ? `${resolveDrivingBatterText(seg.drivingBatterOrder, cell.inning, model)} の打席時に`
        : "";

    let reasonJa = "進塁を試みてタッチアウト（またはフォースアウト）";
    if (seg.method === "caught_stealing") reasonJa = "盗塁を試みてタッチアウト（盗塁死）";
    else if (seg.method === "pickoff_out") reasonJa = "牽制球でタッチアウト（牽制死）";
    else if (seg.method === "appeal_out") reasonJa = "アピールプレイによる離塁アウト";
    else if (seg.method === "interference_out") reasonJa = "守備妨害による走者アウト";

    const lineStyleJa =
      rules.runnerOutLine === "t_stop"
        ? "辺の途中で止まるT字線「━━┫」は、次のベースに届く手前でアウトになったことを表します。"
        : rules.runnerOutLine === "quadrant_arrow"
        ? "辺に沿った矢印マークで、この区間で走塁アウトになったことを表します。"
        : "この区間で走塁アウトになったことを表します。";

    return {
      symbolText: outLineSymbol,
      tone: "dark",
      title: `${rangeJa}：${reasonJa}`,
      description: `${driverJa}${rangeJa}の間でアウトになりました。${lineStyleJa}`,
    };
  }

  // セーフ進塁
  if (seg.method === "tiebreak") {
    return {
      symbolText: "TB（青点線）",
      tone: "blue",
      title: `${rangeJa}：タイブレーク開始走者配置`,
      description:
        "タイブレーク規則によりイニング開始時から塁上に置かれた走者であることを青い破線と「TB」で表します。",
    };
  }

  // 打者自身の出塁（HP -> 1B で drivingBatterOrder なし）
  if (
    startSeg === 1 &&
    endSeg === 1 &&
    !seg.drivingBatterOrder &&
    !seg.isPrePlay
  ) {
    const abCode = cell.atBat?.resultCode;
    const reachReason =
      abCode === "walk" || abCode === "intentional_walk"
        ? "四球で一塁へ出塁"
        : abCode === "hit_by_pitch"
        ? "死球で一塁へ出塁"
        : abCode === "error"
        ? "相手エラーで一塁へ出塁"
        : abCode === "fc"
        ? "野手選択（FC）で一塁へ出塁"
        : abCode === "dropped_third_strike"
        ? "振り逃げで一塁へ出塁"
        : "一塁へ出塁";
    return {
      symbolText: rules.runnerLine === "dotted_only" ? "一塁到達" : "黒実線",
      tone: "dark",
      title: `${rangeJa}：${reachReason}`,
      description: `安打以外の出塁（四死球・失策・野選など）は黒インクで進塁を記録します。${dottedNote}`,
    };
  }

  if (seg.method === "steal") {
    return {
      symbolText: advSymbol || "S",
      tone: "blue",
      title: `${rangeJa}：盗塁（スティール）成功`,
      description: `「${
        advSymbol || "S"
      }」は投球間に次の塁を奪った盗塁成功を表します。${dottedNote}`,
    };
  }

  if (seg.method === "wp") {
    return {
      symbolText: advSymbol || "WP",
      tone: "blue",
      title: `${rangeJa}：暴投（ワイルドピッチ）で進塁`,
      description: `「${
        advSymbol || "WP"
      }」は投手の暴投の間に進塁したことを表します。${dottedNote}`,
    };
  }

  if (seg.method === "pb") {
    return {
      symbolText: advSymbol || "PB",
      tone: "blue",
      title: `${rangeJa}：捕逸（パスボール）で進塁`,
      description: `「${
        advSymbol || "PB"
      }」は捕手が捕球を逸らした（パスボール）間に進塁したことを表します。${dottedNote}`,
    };
  }

  if (seg.method === "balk") {
    return {
      symbolText: advSymbol || "BK",
      tone: "blue",
      title: `${rangeJa}：ボークで進塁`,
      description: `「${
        advSymbol || "BK"
      }」は相手投手のボークにより安全進塁権を得て進んだことを表します。${dottedNote}`,
    };
  }

  if (seg.method === "error" || seg.method === "pickoff_error") {
    return {
      symbolText: advSymbol || "E",
      tone: "blue",
      title: `${rangeJa}：相手の失策（エラー）で進塁`,
      description: `「${advSymbol || "E"}」は${
        seg.method === "pickoff_error" ? "悪送球（牽制エラー）" : "相手守備のエラー"
      }によって進塁したことを表します。${dottedNote}`,
    };
  }

  if (seg.drivingBatterOrder && seg.drivingBatterOrder > 0) {
    const driverText = resolveDrivingBatterText(
      seg.drivingBatterOrder,
      cell.inning,
      model
    );
    const viaMethod =
      seg.method === "sac"
        ? "犠打・犠飛"
        : seg.method === "walk"
        ? "四死球押し出し"
        : seg.method === "fc"
        ? "野手選択・ゴロ"
        : seg.method === "throw_advance"
        ? "送球間の進塁"
        : "安打・打撃";
    return {
      symbolText: `(${seg.drivingBatterOrder})`,
      tone: "dark",
      title: `${rangeJa}：後続の ${driverText} の打席で進塁`,
      description: `カッコ数字「(${seg.drivingBatterOrder})」は、「${seg.drivingBatterOrder}番打者の打席結果（${viaMethod}）によってこの塁まで進んだ」という意味です。スコアブックで誰が誰を還したかを追える大事な記号です。${dottedNote}`,
    };
  }

  return {
    symbolText: advSymbol || "進塁",
    tone: "dark",
    title: `${rangeJa}：進塁`,
    description: `${rangeJa}へ進塁したことを表します。${dottedNote}`,
  };
}

function buildDiamondSection(
  cell: CompiledScorebookCell,
  model: CompiledScorebookSheetModel,
  rules: ScorebookSymbolRules
): DiamondBreakdownRow[] {
  const rows: DiamondBreakdownRow[] = [];

  // 1. セグメント 1〜4 を連続プレー単位でグルーピングして解説
  let segCursor = 1;
  while (segCursor <= 4) {
    const current = cell.segments[segCursor as BaseSegmentIndex];
    if (!current) {
      segCursor += 1;
      continue;
    }

    const startSeg = segCursor as BaseSegmentIndex;
    let endSeg = startSeg;
    let terminalSeg = current;

    if (current.isBatterHit && current.status === "safe") {
      while (endSeg < 4) {
        const nextIdx = (endSeg + 1) as BaseSegmentIndex;
        const next = cell.segments[nextIdx];
        if (next && next.isBatterHit && next.status === "safe") {
          endSeg = nextIdx;
          terminalSeg = next;
        } else {
          break;
        }
      }
    } else if (
      current.status === "safe" &&
      !current.isBatterHit &&
      current.drivingBatterOrder === undefined
    ) {
      // 1塁→3塁など複数塁を一気に進んだ場合、最終区間のみ drivingBatterOrder / out が入るため結合する
      const isBatterInitialReach =
        startSeg === 1 &&
        !current.isPrePlay &&
        current.method !== "tiebreak";

      if (!isBatterInitialReach) {
        while (endSeg < 4) {
          const nextIdx = (endSeg + 1) as BaseSegmentIndex;
          const next = cell.segments[nextIdx];
          if (
            next &&
            !next.isBatterHit &&
            next.method === current.method &&
            next.isPrePlay === current.isPrePlay
          ) {
            endSeg = nextIdx;
            terminalSeg = next;
            if (next.status === "out" || next.drivingBatterOrder !== undefined) {
              break;
            }
          } else {
            break;
          }
        }
      }
    }

    const explained = describeAdvanceMethodMeaning(
      terminalSeg,
      startSeg,
      endSeg,
      cell,
      model,
      rules
    );
    rows.push({
      zoneLabel: segmentRangeLabel(startSeg, endSeg),
      symbolText: explained.symbolText,
      tone: explained.tone,
      title: explained.title,
      description: explained.description,
    });

    segCursor = endSeg + 1;
  }

  // 2. ダイヤモンド中央ステータス（得点・アウト番号・残塁）
  if (cell.runScored) {
    const runSymbol =
      rules.runMark === "double_circle"
        ? "◎"
        : rules.runMark === "kanji_toku"
        ? "丸得"
        : "●";
    rows.push({
      zoneLabel: "ダイヤ中央",
      symbolText: runSymbol,
      tone: "red",
      title: "本塁生還（1得点）",
      description: `ダイヤモンド中央の「${runSymbol}」は、この走者がホームベースを踏んで1点が入ったことを表す最も大切なマークです。`,
    });
  } else if (cell.outNumber) {
    const outText = formatOutOrdinalText(cell.outNumber, rules);
    rows.push({
      zoneLabel: "ダイヤ中央",
      symbolText: outText,
      tone: "dark",
      title: `この回の ${cell.outNumber} アウト目`,
      description: `ダイヤモンド中央の「${outText}」は、このイニングで${cell.outNumber}番目に記録されたアウトであることを表します（3つ目のアウトでチェンジになります）。`,
    });
  } else if (cell.isResidual) {
    const resBaseJa =
      cell.residualBase === "1B"
        ? "一塁"
        : cell.residualBase === "2B"
        ? "二塁"
        : cell.residualBase === "3B"
        ? "三塁"
        : "塁上";
    rows.push({
      zoneLabel: "ダイヤ中央",
      symbolText: "ℓ",
      tone: "muted",
      title: `残塁（3アウト終了時に${resBaseJa}残り）`,
      description:
        "筆記体のエル「ℓ」は Left On Base（残塁）の頭文字で、味方が3アウトになった時点でホームに還れず塁上に残っていた走者を表します。",
    });
  }

  // 3. 右上：打点ドット
  const rbiCount = Math.max(0, cell.atBat?.rbi || 0);
  if (rbiCount > 0) {
    rows.push({
      zoneLabel: "マス右上",
      symbolText:
        rules.rbiMark === "hidden"
          ? `${rbiCount}打点`
          : `${"●".repeat(Math.min(4, rbiCount))}（${rbiCount}個）`,
      tone: rules.rbiMark === "black_dots" ? "dark" : "red",
      title: `${rbiCount}打点（RBI）`,
      description:
        rules.rbiMark === "hidden"
          ? `この打席で${rbiCount}人の走者をホームに還して打点が記録されています（現在の記号ルールではマス右上の打点ドットは非表示設定です）。`
          : `マス右上の点の数（${rbiCount}個）は、この打席の打撃・押し出し等でホームに還した走者の人数（＝打点）を表します。`,
    });
  }

  // 4. 右下角：イニング終了二重斜線
  if (cell.isInningEndCell) {
    rows.push({
      zoneLabel: "マス右下角",
      symbolText: "／／",
      tone: "dark",
      title: "イニング終了線（3アウトチェンジ）",
      description:
        "マス右下の二重斜線は「この打者のところで3アウトになり、この回の攻撃が終わった」という区切り印です。次の回は次の列の次の打順から始まります。",
    });
  }

  // 5. マス上辺：途中投手交代の青波線
  if (cell.hasPitcherChangeBefore) {
    rows.push({
      zoneLabel: "マス上辺",
      symbolText: "〜〜",
      tone: "blue",
      title: `相手投手の交代${
        cell.newPitcherName ? `（→ ${cell.newPitcherName}）` : ""
      }`,
      description: `マスの上辺に引かれた青い波線は、この打者の打席から相手投手が${
        cell.newPitcherName ? `「${cell.newPitcherName}」に` : ""
      }交代したことを表します。`,
    });
  }

  // 6. 左外・右内の代打／代走／守備交代の赤縦波線
  if (cell.leftOutsideSub && rules.pinchHitterMark !== "lineup_only") {
    rows.push({
      zoneLabel: "マス左辺",
      symbolText: "縦波線",
      tone: "red",
      title: `代打出場（${cell.leftOutsideSub.name}）`,
      description:
        "マスの左側に引かれた縦の波線は、前の打者に代わってこの打席から代打（ピンチヒッター）が出場したことを表します。",
    });
  }

  if (cell.rightInsideSub && rules.pinchHitterMark !== "lineup_only") {
    const roleLabel =
      cell.rightInsideSub.subType === "DEF"
        ? "守備交代"
        : cell.rightInsideSub.subType === "TR"
        ? "臨時代走"
        : "代走";
    rows.push({
      zoneLabel: "マス右辺",
      symbolText: "縦波線",
      tone: "red",
      title: `${roleLabel}（${cell.rightInsideSub.name}）`,
      description: `マスの右側に引かれた縦の波線は、出塁後に${roleLabel}「${cell.rightInsideSub.name}」と交代したことを表します。`,
    });
  }

  if (rows.length === 0) {
    rows.push({
      zoneLabel: "ダイヤ全体",
      symbolText: "空欄",
      tone: "muted",
      title: "進塁・アウト記録なし",
      description:
        "打席途中でイニング終了となった等の理由により、このマスには進塁線やアウト番号は記入されていません。",
    });
  }

  return rows;
}

/**
 * 1つのスコアブックマス（CompiledScorebookCell）と現在の記号ルール（ScorebookSymbolRules）から、
 * 初心者でも直感的に読める3セクション解説データを生成する
 */
export function buildScorebookCellGuide(
  cell: CompiledScorebookCell,
  model: CompiledScorebookSheetModel,
  rules: ScorebookSymbolRules
): ScorebookCellGuideData {
  const halfLabel = model.isTop ? "表" : "裏";
  const colMeta = model.columns.find(
    (c) => c.inning === cell.inning && c.columnIndex === cell.columnIndex
  );
  const subColSuffix =
    colMeta && colMeta.totalColumnsInInning > 1
      ? `（${cell.columnIndex}巡目）`
      : "";
  const inningText = `${cell.inning}回${halfLabel}${subColSuffix}`;
  const teamAttackText = `${model.battingTeamName}の攻撃`;

  const batterIdentity = resolveCellBatterIdentity(cell, model);
  const pitcherName = (cell.atBat?.pitcherName || "").trim();

  const pitchSection = buildPitchSection(cell, rules);
  const resultSection = buildResultSection(cell, rules);
  const diamondRows = buildDiamondSection(cell, model, rules);

  return {
    inningText,
    teamAttackText,
    batterOrder: cell.battingOrder,
    batterName: batterIdentity.name,
    batterUniformNumber: batterIdentity.uniformNumber,
    pitcherName,
    headlineResult: resultSection.headlineResult,
    rbi: Math.max(0, cell.atBat?.rbi || 0),
    pitchSummaryBadge: pitchSection.pitchSummaryBadge,
    pitchEmptyNote: pitchSection.pitchEmptyNote,
    pitches: pitchSection.pitches,
    resultNotationMain: resultSection.resultNotationMain,
    resultNotationSub: resultSection.resultNotationSub,
    resultDecoratorLabel: resultSection.resultDecoratorLabel,
    resultRows: resultSection.resultRows,
    diamondRows,
  };
}

