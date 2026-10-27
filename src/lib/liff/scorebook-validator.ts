// filepath: src/lib/liff/scorebook-validator.ts
import type {
  CanonicalAtBatResult,
  CanonicalPitchResult,
  ScorebookRosterPlayer,
  ScorebookSheetStructure,
  ScorebookV2AtBat,
  ScorebookValidationIssue,
} from "@/types/scorebook-v2";

/**
 * 1球ごとの投球履歴からボールカウント・ストライクカウントを厳密計算する
 */
export function computeCountFromPitches(pitches: CanonicalPitchResult[]): {
  balls: number;
  strikes: number;
} {
  let balls = 0;
  let strikes = 0;

  for (const p of pitches) {
    if (p === "ball") {
      balls = Math.min(4, balls + 1);
    } else if (p === "strike" || p === "swinging_strike") {
      strikes = Math.min(3, strikes + 1);
    } else if (p === "foul") {
      if (strikes < 2) {
        strikes += 1;
      }
    } else if (p === "hbp") {
      balls = Math.min(4, balls + 1);
    }
    // pickoff / in_play / hit は B/S の事前カウントを直接増やさない
  }

  return { balls, strikes };
}

/**
 * 自由記述の日本語結果ラベルから正規のDB集計コード(CanonicalAtBatResult)を推定・補完する
 */
export function inferCanonicalResultCode(
  rawCode: string | undefined | null,
  rawLabel: string | undefined | null
): CanonicalAtBatResult {
  const validCodes: Set<CanonicalAtBatResult> = new Set([
    "single",
    "double",
    "triple",
    "home_run",
    "walk",
    "hit_by_pitch",
    "strikeout",
    "dropped_third_strike",
    "groundout",
    "flyout",
    "double_play",
    "sac_bunt",
    "sac_fly",
    "error",
    "fc",
    "other",
  ]);

  if (rawCode && validCodes.has(rawCode as CanonicalAtBatResult)) {
    return rawCode as CanonicalAtBatResult;
  }

  const label = (rawLabel || "").trim();
  const upper = label.toUpperCase();

  if (upper.includes("HR") || label.includes("本塁打") || label.includes("ホームラン")) {
    return "home_run";
  }
  if (upper.includes("3B") || label.includes("三塁打")) {
    return "triple";
  }
  if (upper.includes("2B") || label.includes("二塁打")) {
    return "double";
  }
  if (
    upper === "1B" ||
    label.includes("単打") ||
    label.includes("安打") ||
    label.includes("ヒット") ||
    label.includes("内安")
  ) {
    return "single";
  }
  if (upper.includes("HBP") || label.includes("死球") || label.includes("デッド")) {
    return "hit_by_pitch";
  }
  if (upper === "BB" || upper === "IBB" || label.includes("四球") || label.includes("敬遠")) {
    return "walk";
  }
  if (label.includes("振逃") || label.includes("振り逃げ")) {
    return "dropped_third_strike";
  }
  if (upper === "K" || upper === "SO" || label.includes("三振")) {
    return "strikeout";
  }
  if (label.includes("犠飛")) {
    return "sac_fly";
  }
  if (upper === "SAC" || upper === "SH" || label.includes("犠打") || label.includes("バント")) {
    return "sac_bunt";
  }
  if (upper.includes("DP") || label.includes("併殺") || label.includes("ゲッツー")) {
    return "double_play";
  }
  if (upper.startsWith("E") || label.includes("失策") || label.includes("エラー")) {
    return "error";
  }
  if (upper.includes("FC") || label.includes("野選")) {
    return "fc";
  }
  if (
    label.includes("飛") ||
    label.includes("フライ") ||
    label.includes("直") ||
    label.includes("ライナー") ||
    label.includes("邪飛") ||
    /[1-9][FL]$/i.test(upper)
  ) {
    return "flyout";
  }
  if (
    label.includes("ゴロ") ||
    label.includes("封殺") ||
    /^[1-9]-[1-9]/.test(upper)
  ) {
    return "groundout";
  }

  return "other";
}

const KANJI_VARIANT_MAP: ReadonlyArray<readonly [RegExp, string]> = [
  [/髙/g, "高"],
  [/[﨑嵜]/g, "崎"],
  [/[齋齊]/g, "斎"],
  [/[邊邉]/g, "辺"],
  [/澤/g, "沢"],
  [/[濱濵]/g, "浜"],
  [/廣/g, "広"],
  [/櫻/g, "桜"],
  [/國/g, "国"],
  [/德/g, "徳"],
  [/栁/g, "柳"],
  [/[嶋嶌]/g, "島"],
  [/峯/g, "峰"],
  [/渡部/g, "渡部"],
];

function normalizePlayerNameForMatch(raw: string): string {
  let s = raw
    .replace(/[\s　・.()（）[\]【】#＃背番号選手代打代走守備投手]+/g, "")
    .trim()
    .toLowerCase();
  for (const [pattern, replacement] of KANJI_VARIANT_MAP) {
    s = s.replace(pattern, replacement);
  }
  // カタカナをひらがなに統一（よみがな比較用）
  s = s.replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
  return s;
}

function countOrderedCharOverlap(a: string, b: string): number {
  if (!a || !b) return 0;
  let bIdx = 0;
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const ch = a[i];
    const foundAt = b.indexOf(ch, bIdx);
    if (foundAt !== -1) {
      matches += 1;
      bIdx = foundAt + 1;
    }
  }
  return matches;
}

/**
 * 守備位置の表記揺れ（漢字・英語略称・数字）を UI/DB 共通コード（"1"〜"9" | "D" | ""）へ正規化する
 */
export function normalizePositionCode(
  rawPos: string | undefined | null
): string {
  const s = (rawPos || "").trim();
  if (!s) return "";
  const u = s.toUpperCase();

  if (u === "D" || u === "DH" || u === "DP" || s.includes("指")) return "D";
  if (u === "1" || u === "P" || s.startsWith("投") || s.includes("ピッチャー")) {
    return "1";
  }
  if (u === "2" || u === "C" || s.startsWith("捕") || s.includes("キャッチャー")) {
    return "2";
  }
  if (u === "3" || u === "1B" || s.startsWith("一") || s.includes("ファースト")) {
    return "3";
  }
  if (u === "4" || u === "2B" || s.startsWith("二") || s.includes("セカンド")) {
    return "4";
  }
  if (u === "5" || u === "3B" || s.startsWith("三") || s.includes("サード")) {
    return "5";
  }
  if (u === "6" || u === "SS" || s.startsWith("遊") || s.includes("ショート")) {
    return "6";
  }
  if (u === "7" || u === "LF" || s.startsWith("左") || s.includes("レフト")) {
    return "7";
  }
  if (u === "8" || u === "CF" || s.startsWith("中") || s.includes("センター")) {
    return "8";
  }
  if (u === "9" || u === "RF" || s.startsWith("右") || s.includes("ライト")) {
    return "9";
  }

  const digitMatch = u.match(/^([1-9])\b/);
  if (digitMatch) return digitMatch[1];

  return "";
}

/**
 * 選手名・背番号からチーム登録選手IDを高精度ファジーマッチングする
 * ※重要: 手書き守備番号と背番号の取り違えで別人の名前に誤変換される事故を防ぐため、
 *   名前が明記されているのに1文字も一致しない選手へ背番号だけで強制置換しない安全設計。
 */
export function matchRosterPlayer(
  rawName: string | undefined | null,
  rawNumber: string | undefined | null,
  roster: ScorebookRosterPlayer[]
): ScorebookRosterPlayer | null {
  if (roster.length === 0) return null;

  const cleanNum = (rawNumber || "").replace(/[^0-9]/g, "").trim();
  const cleanName = normalizePlayerNameForMatch(rawName || "");

  let bestPlayer: ScorebookRosterPlayer | null = null;
  let bestScore = 0;

  for (const p of roster) {
    const pNum = p.uniformNumber.replace(/[^0-9]/g, "").trim();
    const pName = normalizePlayerNameForMatch(p.name);
    const pKana = p.nameKana ? normalizePlayerNameForMatch(p.nameKana) : "";

    const isExactNum = Boolean(cleanNum && pNum && cleanNum === pNum);
    let score = 0;

    if (cleanName && pName) {
      if (cleanName === pName || (pKana && cleanName === pKana)) {
        // フルネームまたはよみがな完全一致
        score = isExactNum ? 100 : 92;
      } else if (
        (cleanName.length >= 2 && pName.startsWith(cleanName)) ||
        (pName.length >= 2 && cleanName.startsWith(pName)) ||
        (cleanName.length >= 2 && pKana && pKana.startsWith(cleanName))
      ) {
        // 苗字（2文字以上）前方一致
        score = isExactNum ? 96 : 82;
      } else if (cleanName.length === 1 && pName.startsWith(cleanName)) {
        // 1文字苗字（森・林・原など）前方一致
        score = isExactNum ? 90 : 68;
      } else {
        // 手書き1文字誤読の救済（例: 3〜4文字中 length-1 文字以上が順序一致）
        const overlap = Math.max(
          countOrderedCharOverlap(cleanName, pName),
          countOrderedCharOverlap(pName, cleanName)
        );
        const minLen = Math.min(cleanName.length, pName.length);
        if (minLen >= 3 && overlap >= minLen - 1) {
          score = isExactNum ? 88 : 74;
        } else if (minLen >= 2 && overlap >= 2) {
          score = isExactNum ? 85 : 70;
        } else if (isExactNum && overlap >= 1) {
          // 背番号が完全一致し、かつ最低1文字（苗字の片方など）が一致する場合は高信頼
          score = 84;
        }
      }
    } else if (!cleanName && isExactNum) {
      // 名前が空欄で背番号のみ書かれている場合のみ背番号単独一致を許可
      score = 65;
    }

    if (score > bestScore) {
      bestScore = score;
      bestPlayer = p;
    }
  }

  return bestScore >= 65 ? bestPlayer : null;
}

/**
 * 確定したシート骨格(打順・途中交代・継投)から、指定イニング時点の打者・投手を解決する
 */
export function resolveActiveMatchupFromStructure(
  structure: ScorebookSheetStructure,
  inning: number,
  battingOrder: number
): {
  batterName: string;
  batterPlayerId: string | null;
  pitcherName: string;
  pitcherPlayerId: string | null;
} {
  const slot = structure.batters.find((b) => b.battingOrder === battingOrder);
  let batterName = slot?.name || "";
  let batterPlayerId = slot?.playerId || null;

  if (slot && slot.substitutions.length > 0) {
    const applicableSubs = slot.substitutions
      .filter((s) => s.inningEntered <= inning && s.name.trim() !== "")
      .sort((a, b) => a.inningEntered - b.inningEntered);
    if (applicableSubs.length > 0) {
      const latest = applicableSubs[applicableSubs.length - 1];
      batterName = latest.name;
      batterPlayerId = latest.playerId;
    }
  }

  let pitcherName = "";
  let pitcherPlayerId: string | null = null;
  if (structure.pitchers.length > 0) {
    const stint =
      structure.pitchers.find(
        (p) => inning >= p.fromInning && inning <= p.toInning
      ) || structure.pitchers[structure.pitchers.length - 1];
    pitcherName = stint.name;
    pitcherPlayerId = stint.playerId;
  }

  return {
    batterName,
    batterPlayerId,
    pitcherName,
    pitcherPlayerId,
  };
}

/**
 * 1シート分（先攻または後攻）の打席イベント配列に対して、野球ルール状態機械による多角検算を実行する
 */
export function validateScorebookSheet(
  atBats: ScorebookV2AtBat[],
  structure?: ScorebookSheetStructure | null
): ScorebookValidationIssue[] {
  const issues: ScorebookValidationIssue[] = [];
  if (atBats.length === 0) return issues;

  const isTop = atBats[0].isTop;
  const sideLabel = isTop ? "表" : "裏";

  const maxOrder = Math.max(
    9,
    structure?.batters.length || 9,
    ...atBats.map((a) => a.battingOrder || 9)
  );
  const lineupCycle = maxOrder >= 10 ? maxOrder : 9;

  // イニング別に整列（イニング昇順 -> columnIndex昇順 -> 元の出現順）
  const inningsMap = new Map<number, ScorebookV2AtBat[]>();
  for (const ab of atBats) {
    const list = inningsMap.get(ab.inning) || [];
    list.push(ab);
    inningsMap.set(ab.inning, list);
  }

  const sortedInnings = Array.from(inningsMap.keys()).sort((a, b) => a - b);
  let expectedNextBatterOrder: number | null = 1;

  for (let idx = 0; idx < sortedInnings.length; idx++) {
    const inning = sortedInnings[idx];
    const inningEvents = inningsMap.get(inning) || [];
    if (inningEvents.length === 0) continue;

    const isLastRecordedInning = idx === sortedInnings.length - 1;

    // 1. 先頭打者の打順連続性チェック（列ズレ検知の要！）
    const firstAb = inningEvents[0];
    if (
      expectedNextBatterOrder !== null &&
      firstAb.battingOrder !== expectedNextBatterOrder
    ) {
      issues.push({
        id: `order-${isTop ? "t" : "b"}-${inning}-${firstAb.id}`,
        severity: "error",
        atBatId: firstAb.id,
        inning,
        isTop,
        battingOrder: firstAb.battingOrder,
        category: "order",
        message: `${inning}回${sideLabel}の先頭打者が${firstAb.battingOrder}番になっています（前イニング終了順からは${expectedNextBatterOrder}番のはずです）。列ズレまたは前イニングの盗塁死・牽制死を確認してください。`,
      });
    }

    let inningOuts = 0;
    let inningRuns = 0;
    const bases: Record<"1B" | "2B" | "3B", string | null> = {
      "1B": null,
      "2B": null,
      "3B": null,
    };

    for (let i = 0; i < inningEvents.length; i++) {
      const ab = inningEvents[i];

      // 打順の1打席ごとの連続チェック
      if (i > 0) {
        const prevAb = inningEvents[i - 1];
        const expectedInInning = (prevAb.battingOrder % lineupCycle) + 1;
        if (ab.battingOrder !== expectedInInning) {
          issues.push({
            id: `seq-${ab.id}`,
            severity: "warning",
            atBatId: ab.id,
            inning,
            isTop,
            battingOrder: ab.battingOrder,
            category: "order",
            message: `${inning}回${sideLabel}で${prevAb.battingOrder}番の次に${ab.battingOrder}番が記録されています（通常は${expectedInInning}番）。空きマスの読み飛ばしがないか確認してください。`,
          });
        }
      }

      // 2. AI確信度チェック
      if (ab.confidence === "low") {
        issues.push({
          id: `conf-${ab.id}`,
          severity: "warning",
          atBatId: ab.id,
          inning,
          isTop,
          battingOrder: ab.battingOrder,
          category: "confidence",
          message: `AIが手書き文字の判読に迷ったマスです${ab.confidenceReason ? `（${ab.confidenceReason}）` : ""}。拡大画像と照らし合わせて確認してください。`,
        });
      }

      // 3. 1球履歴(必須要件)の整合性チェック
      if (!ab.pitches || ab.pitches.length === 0) {
        issues.push({
          id: `pitch-empty-${ab.id}`,
          severity: "warning",
          atBatId: ab.id,
          inning,
          isTop,
          battingOrder: ab.battingOrder,
          category: "count",
          message: `1球ごとの投球順序が空になっています。BSO欄の投球記号を確認して追加してください。`,
        });
      } else {
        const calc = computeCountFromPitches(ab.pitches);
        if (ab.resultCode === "walk" && calc.balls < 4) {
          issues.push({
            id: `pitch-bb-${ab.id}`,
            severity: "warning",
            atBatId: ab.id,
            inning,
            isTop,
            battingOrder: ab.battingOrder,
            category: "count",
            message: `打席結果が「四球」ですが、投球履歴のボール数が${calc.balls}球です（敬遠でない場合はボール4球か確認してください）。`,
          });
        }
        if (ab.resultCode === "strikeout" && calc.strikes < 3) {
          issues.push({
            id: `pitch-so-${ab.id}`,
            severity: "warning",
            atBatId: ab.id,
            inning,
            isTop,
            battingOrder: ab.battingOrder,
            category: "count",
            message: `打席結果が「三振」ですが、投球履歴のストライク数が${calc.strikes}球です。見逃し/空振り/ファウルの抜けを確認してください。`,
          });
        }
      }

      // 4. 得点と本塁生還数の一致チェック
      const hpAdvances = ab.advances.filter((a) => a.to === "HP" && !a.isOut).length;
      const isHomeRun = ab.resultCode === "home_run";
      if (ab.runsInPlay > 0 && hpAdvances === 0 && !isHomeRun) {
        issues.push({
          id: `hp-mismatch-${ab.id}`,
          severity: "warning",
          atBatId: ab.id,
          inning,
          isTop,
          battingOrder: ab.battingOrder,
          category: "runs",
          message: `この打席で${ab.runsInPlay}点記録されていますが、本塁生還(HP)の進塁記録が見当たりません。`,
        });
      }

      inningOuts += ab.outsInPlay;
      inningRuns += ab.runsInPlay;

      if (inningOuts > 3) {
        issues.push({
          id: `outs-over-${ab.id}`,
          severity: "error",
          atBatId: ab.id,
          inning,
          isTop,
          battingOrder: ab.battingOrder,
          category: "outs",
          message: `${inning}回${sideLabel}の合計アウト数が${inningOuts}になっています（3アウト超過）。`,
        });
      }

      if (inningOuts === 3 && i < inningEvents.length - 1) {
        issues.push({
          id: `outs-extra-${inningEvents[i + 1].id}`,
          severity: "error",
          atBatId: inningEvents[i + 1].id,
          inning,
          isTop,
          battingOrder: inningEvents[i + 1].battingOrder,
          category: "outs",
          message: `すでに3アウトチェンジした後に後続打席が読み取られています。次イニングの打席が混入していないか確認してください。`,
        });
      }

      // 簡易ベースランナー更新
      for (const adv of ab.advances) {
        if (adv.from !== "BAT" && bases[adv.from] === ab.batterName) {
          // ignore
        }
        if (adv.from === "1B" || adv.from === "2B" || adv.from === "3B") {
          bases[adv.from] = null;
        }
      }
      for (const adv of ab.advances) {
        if (!adv.isOut && (adv.to === "1B" || adv.to === "2B" || adv.to === "3B")) {
          bases[adv.to] = adv.runnerName || ab.batterName;
        }
      }
      if (
        ab.advances.filter((a) => a.from === "BAT").length === 0 &&
        ab.outsInPlay === 0
      ) {
        if (ab.resultCode === "single" || ab.resultCode === "walk" || ab.resultCode === "hit_by_pitch" || ab.resultCode === "error" || ab.resultCode === "fc" || ab.resultCode === "dropped_third_strike") {
          bases["1B"] = ab.batterName;
        } else if (ab.resultCode === "double") {
          bases["2B"] = ab.batterName;
        } else if (ab.resultCode === "triple") {
          bases["3B"] = ab.batterName;
        }
      }
    }

    // 5. イニング終了時（3アウト未満チェック ※最終裏サヨナラ・コールド除く）
    if (inningOuts < 3 && !(isLastRecordedInning && !isTop)) {
      const lastAb = inningEvents[inningEvents.length - 1];
      issues.push({
        id: `outs-under-${isTop ? "t" : "b"}-${inning}`,
        severity: "error",
        atBatId: lastAb.id,
        inning,
        isTop,
        battingOrder: lastAb.battingOrder,
        category: "outs",
        message: `${inning}回${sideLabel}の合計アウト数が${inningOuts}アウトで終わっています（通常は3アウト）。アウト丸数字（①②③）や盗塁死・併殺の見落としを確認してください。`,
      });
    }

    // 6. Stage 1で確定したイニングスコアボード得点との完全一致チェック！
    const confirmedInningMeta = structure?.innings.find((m) => m.inning === inning);
    if (confirmedInningMeta && confirmedInningMeta.runs !== inningRuns) {
      const lastAb = inningEvents[inningEvents.length - 1];
      issues.push({
        id: `score-mismatch-${isTop ? "t" : "b"}-${inning}`,
        severity: "error",
        atBatId: lastAb.id,
        inning,
        isTop,
        battingOrder: lastAb.battingOrder,
        category: "runs",
        message: `スコアボード上の${inning}回${sideLabel}の得点（${confirmedInningMeta.runs}点）と、打席データから集計した得点（${inningRuns}点）が一致していません。`,
      });
    }

    // 次イニングの先頭打者を算出
    // ※最終打席で打者自身が完了せず走者盗塁死/牽制死のみで3アウトになった場合は同じ打者が次回先頭になるケースも考慮
    const lastAb = inningEvents[inningEvents.length - 1];
    const endedByRunnerOutOnly =
      lastAb.resultCode === "other" &&
      lastAb.advances.some(
        (a) =>
          a.isOut &&
          (a.method === "caught_stealing" || a.method === "pickoff_out")
      );
    expectedNextBatterOrder = endedByRunnerOutOnly
      ? lastAb.battingOrder
      : (lastAb.battingOrder % lineupCycle) + 1;
  }

  return issues;
}

