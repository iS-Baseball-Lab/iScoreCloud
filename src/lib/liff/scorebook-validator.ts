// filepath: src/lib/liff/scorebook-validator.ts
import {
  isPickoffPitch,
  type CanonicalAtBatResult,
  type CanonicalPitchResult,
  type MissingOrderGapSpec,
  type ResolvedMissingAtBatItem,
  type ScorebookRosterPlayer,
  type ScorebookSheetStructure,
  type ScorebookV2AtBat,
  type ScorebookValidationIssue,
} from "@/types/scorebook-v2";

/**
 * 1球ごとの投球履歴からボールカウント・ストライクカウントを厳密計算する
 * - バントファウル (bunt_foul) は 2ストライク後でもスリーバント失敗として 3ストライクに到達する
 * - 牽制球 (pickoff_1b / pickoff_2b / pickoff_3b / pickoff) は B/S カウントを増やさない
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
    } else if (
      p === "strike" ||
      p === "swinging_strike" ||
      p === "bunt_swinging" ||
      p === "bunt_foul"
    ) {
      strikes = Math.min(3, strikes + 1);
    } else if (p === "foul") {
      if (strikes < 2) {
        strikes += 1;
      }
    } else if (p === "hbp") {
      balls = Math.min(4, balls + 1);
    } else if (isPickoffPitch(p) || p === "balk") {
      // 1塁牽制 / 2塁牽制 / 3塁牽制 / ボーク は B/S カウントを増やさない
    }
    // in_play / hit も事前 B/S カウントを増やさない
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
    "intentional_walk",
    "hit_by_pitch",
    "interference",
    "sac_bunt",
    "sac_fly",
    "groundout",
    "flyout",
    "infield_fly",
    "strikeout",
    "dropped_third_strike_out",
    "dropped_third_strike",
    "double_play",
    "triple_play",
    "interference_out",
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
  if (upper === "IBB" || label.includes("申告敬遠") || label.includes("敬遠")) {
    return "intentional_walk";
  }
  if (upper === "BB" || label.includes("四球")) {
    return "walk";
  }
  // インターフェア（打撃妨害 vs 守備妨害・反則打球）
  if (
    label.includes("守備妨害") ||
    label.includes("守妨") ||
    label.includes("反則打球") ||
    ((upper.includes("INT") || label.includes("インターフェア")) &&
      (label.includes("アウト") || label.includes("死")))
  ) {
    return "interference_out";
  }
  if (
    label.includes("打撃妨害") ||
    label.includes("打妨") ||
    upper === "INT" ||
    upper === "CI" ||
    label.includes("インターフェア")
  ) {
    return "interference";
  }
  // 振り逃げアウト vs 振り逃げセーフ（出塁）
  if (
    ((label.includes("振逃") || label.includes("振り逃げ")) &&
      (label.includes("アウト") ||
        label.includes("死") ||
        label.includes("失敗") ||
        /[1-9]-[1-9]/.test(upper))) ||
    /^K\s*2-3/i.test(upper) ||
    /^SO\s*2-3/i.test(upper)
  ) {
    return "dropped_third_strike_out";
  }
  if (label.includes("振逃") || label.includes("振り逃げ")) {
    return "dropped_third_strike";
  }
  if (
    upper === "K" ||
    upper === "SO" ||
    label.includes("三振") ||
    label.includes("スリーバント失敗") ||
    label.includes("3バント失敗") ||
    label.includes("３バント失敗")
  ) {
    return "strikeout";
  }
  if (label.includes("犠飛")) {
    return "sac_fly";
  }
  if (upper === "SAC" || upper === "SH" || label.includes("犠打") || label.includes("バント")) {
    return "sac_bunt";
  }
  if (upper.includes("TP") || label.includes("三重殺") || label.includes("トリプルプレー")) {
    return "triple_play";
  }
  if (
    upper.includes("DP") ||
    label.includes("併殺") ||
    label.includes("ゲッツー")
  ) {
    return "double_play";
  }
  if (
    label.includes("インフィールド") ||
    upper.includes("IFF") ||
    /\bIF\b/.test(upper) ||
    /^[1-9]IF$/i.test(upper)
  ) {
    return "infield_fly";
  }
  if (upper.startsWith("E") || label.includes("失策") || label.includes("エラー")) {
    return "error";
  }
  if (
    upper.includes("FC") ||
    upper === "OB" ||
    upper === "O.B." ||
    label.includes("野選")
  ) {
    return "fc";
  }
  if (
    label.includes("飛") ||
    label.includes("フライ") ||
    label.includes("直") ||
    label.includes("ライナー") ||
    label.includes("邪飛") ||
    /[1-9][FL]$/i.test(upper) ||
    /[⌒︵︶∩^]\s*[1-9]/.test(label) ||
    /[1-9]\s*[⌒︵︶∩^￣\u0304\u0305]/.test(label) ||
    /^[△▲(（][1-9][)）]?$/.test(label) ||
    /^[1-9][ー\-]$/.test(label)
  ) {
    return "flyout";
  }
  if (
    label.includes("ゴロ") ||
    label.includes("封殺") ||
    /^[1-9]-[1-9]/.test(upper) ||
    /^[~〜][1-9]$/.test(label)
  ) {
    return "groundout";
  }
  if (/^[1-9]$/.test(upper)) {
    return "flyout";
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
 * - 同一イニング途中の投手交代（例: 先発 1〜4回、2番手 4〜7回のように交代回が重なるケース）では、
 *   AIが打席横の交代線から読み取った投手名ヒント(ocrPitcherHint)も照合して正確な投手を割り当てる。
 */
export function resolveActiveMatchupFromStructure(
  structure: ScorebookSheetStructure,
  inning: number,
  battingOrder: number,
  ocrPitcherHint?: string
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
      .filter(
        (s) =>
          s.subType !== "TR" &&
          s.inningEntered <= inning &&
          s.name.trim() !== ""
      )
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
    const matchingStints = structure.pitchers.filter(
      (p) => inning >= p.fromInning && inning <= p.toInning
    );
    let chosenStint =
      matchingStints[0] || structure.pitchers[structure.pitchers.length - 1];

    const cleanHint = normalizePlayerNameForMatch(ocrPitcherHint || "");
    if (cleanHint) {
      const pool =
        matchingStints.length > 1 ? matchingStints : structure.pitchers;
      const hintMatched = pool.find((p) => {
        const cleanP = normalizePlayerNameForMatch(p.name);
        if (!cleanP) return false;
        return (
          cleanP === cleanHint ||
          cleanP.includes(cleanHint) ||
          cleanHint.includes(cleanP)
        );
      });
      if (hintMatched) {
        chosenStint = hintMatched;
      }
    }

    pitcherName = chosenStint.name;
    pitcherPlayerId = chosenStint.playerId;
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
  structure?: ScorebookSheetStructure | null,
  isTopOverride?: boolean
): ScorebookValidationIssue[] {
  const issues: ScorebookValidationIssue[] = [];
  if (
    atBats.length === 0 &&
    (!structure || !Array.isArray(structure.innings) || structure.innings.length === 0)
  ) {
    return issues;
  }

  const isTop =
    typeof isTopOverride === "boolean"
      ? isTopOverride
      : atBats.length > 0
      ? atBats[0].isTop
      : true;
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

  const allInningsSet = new Set<number>(inningsMap.keys());
  if (structure?.innings) {
    for (const meta of structure.innings) {
      if (typeof meta.inning === "number" && meta.inning >= 1) {
        allInningsSet.add(meta.inning);
      }
    }
  }

  const sortedInnings = Array.from(allInningsSet).sort((a, b) => a - b);
  let expectedNextBatterOrder: number | null = 1;

  for (let idx = 0; idx < sortedInnings.length; idx++) {
    const inning = sortedInnings[idx];
    const inningEvents = inningsMap.get(inning) || [];
    const isLastRecordedInning = idx === sortedInnings.length - 1;

    if (inningEvents.length === 0) {
      const emptyMeta = structure?.innings.find((m) => m.inning === inning);
      const maybeSkippedFinalBottom =
        !isTop &&
        isLastRecordedInning &&
        inning >= 3 &&
        (emptyMeta?.runs ?? 0) === 0 &&
        (emptyMeta?.hits ?? 0) === 0 &&
        (emptyMeta?.columnCount ?? 1) <= 1;

      if (!maybeSkippedFinalBottom) {
        issues.push({
          id: `empty-inning-${isTop ? "t" : "b"}-${inning}`,
          severity: "error",
          inning,
          isTop,
          category: "outs",
          message: `${inning}回${sideLabel}の打席データが0件になっています（試合が行われたイニングで0打席はあり得ません）。該当回の「AI再解析」または「打席追加」を行ってください。`,
        });
      }
      expectedNextBatterOrder = null;
      continue;
    }

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

    const preTotalOuts = inningEvents.reduce(
      (sum, x) => sum + Math.max(0, x.outsInPlay),
      0
    );
    const preTotalRuns = inningEvents.reduce(
      (sum, x) => sum + Math.max(0, x.runsInPlay),
      0
    );
    const preMeta = structure?.innings.find((m) => m.inning === inning);
    const inningOutsCorroborated =
      preTotalOuts === 3 ||
      (isLastRecordedInning && !isTop && preTotalOuts <= 3 && preTotalRuns > 0);
    const inningRunsCorroborated =
      !preMeta || preMeta.runs === preTotalRuns;
    const inningLeadOffCorroborated =
      expectedNextBatterOrder === null ||
      firstAb.battingOrder === expectedNextBatterOrder;

    let inningOuts = 0;
    let inningRuns = 0;
    const bases: Record<"1B" | "2B" | "3B", string | null> = {
      "1B": null,
      "2B": null,
      "3B": null,
    };

    for (let i = 0; i < inningEvents.length; i++) {
      const ab = inningEvents[i];
      let hasRowOrderJump = false;

      // 打順の1打席ごとの連続チェック
      if (i > 0) {
        const prevAb = inningEvents[i - 1];
        const expectedInInning = (prevAb.battingOrder % lineupCycle) + 1;
        if (ab.battingOrder !== expectedInInning) {
          hasRowOrderJump = true;
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

      const needsFieldingPos =
        ab.resultCode === "groundout" ||
        ab.resultCode === "flyout" ||
        ab.resultCode === "single" ||
        ab.resultCode === "double" ||
        ab.resultCode === "triple" ||
        ab.resultCode === "sac_bunt" ||
        ab.resultCode === "sac_fly" ||
        ab.resultCode === "error" ||
        ab.resultCode === "double_play";
      const hasFieldingDigit = /[1-9]/.test(ab.battedDirection || "");

      if (needsFieldingPos && !hasFieldingDigit) {
        issues.push({
          id: `dir-missing-${ab.id}`,
          severity: "warning",
          atBatId: ab.id,
          inning,
          isTop,
          battingOrder: ab.battingOrder,
          category: "confidence",
          message: `インプレー打球（${ab.resultLabel}）の守備位置番号（1〜9）が未設定です。右下の数字を確認して選択してください。`,
        });
      } else if (
        ab.resultCode === "groundout" &&
        /^[789]-3$/.test((ab.battedDirection || "").trim())
      ) {
        issues.push({
          id: `dir-rare-ofg-${ab.id}`,
          severity: "warning",
          atBatId: ab.id,
          inning,
          isTop,
          battingOrder: ab.battingOrder,
          category: "confidence",
          message: `外野ゴロ一塁送球（${ab.battedDirection}）になっています。手書きの『4-3（二ゴロ）』や『6-3（遊ゴロ）』のにじみ誤読でないか確認してください。`,
        });
      }

      // 2. AI確信度チェック（イニングの3アウト・確定得点・打順連続・守備位置番号がすべて整合している単なるペンにじみマスでは過剰警告を抑止）
      const hasExplicitConfReason = Boolean(
        ab.confidenceReason && ab.confidenceReason.trim().length > 0
      );
      const isStructurallyCorroborated =
        inningOutsCorroborated &&
        inningRunsCorroborated &&
        inningLeadOffCorroborated &&
        !hasRowOrderJump &&
        ab.resultCode !== "other" &&
        (!needsFieldingPos || hasFieldingDigit);

      if (
        ab.confidence === "low" &&
        (hasExplicitConfReason || !isStructurallyCorroborated)
      ) {
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
      const isIntentionalWalk =
        ab.resultCode === "intentional_walk" ||
        ab.resultLabel.includes("敬遠") ||
        ab.resultLabel.toUpperCase().includes("IBB");
      const isZeroPitchAllowed =
        isIntentionalWalk ||
        (ab.resultCode === "other" &&
          ab.advances.some((a) => a.isOut && a.from !== "BAT"));

      if ((!ab.pitches || ab.pitches.length === 0) && !isZeroPitchAllowed) {
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
      } else if (ab.pitches && ab.pitches.length > 0) {
        const calc = computeCountFromPitches(ab.pitches);
        if (ab.resultCode === "walk" && !isIntentionalWalk && calc.balls < 4) {
          issues.push({
            id: `pitch-bb-${ab.id}`,
            severity: "warning",
            atBatId: ab.id,
            inning,
            isTop,
            battingOrder: ab.battingOrder,
            category: "count",
            message: `打席結果が「四球」ですが、投球履歴のボール数が${calc.balls}球です（申告敬遠の場合は「敬遠四球」を選択するかボール4球を確認してください）。`,
          });
        }
        if (
          (ab.resultCode === "strikeout" ||
            ab.resultCode === "dropped_third_strike_out" ||
            ab.resultCode === "dropped_third_strike") &&
          calc.strikes < 3
        ) {
          issues.push({
            id: `pitch-so-${ab.id}`,
            severity: "warning",
            atBatId: ab.id,
            inning,
            isTop,
            battingOrder: ab.battingOrder,
            category: "count",
            message: `打席結果が三振・振り逃げですが、投球履歴のストライク数が${calc.strikes}球です。見逃し/空振り/バントファウルの抜けを確認してください。`,
          });
        }

        // 2ストライク後のバントファウル（スリーバント失敗）整合チェック
        let runningStrikes = 0;
        let hasThreeBuntFoul = false;
        for (const p of ab.pitches) {
          if (p === "bunt_foul" && runningStrikes >= 2) {
            hasThreeBuntFoul = true;
          }
          if (
            p === "strike" ||
            p === "swinging_strike" ||
            p === "bunt_swinging" ||
            p === "bunt_foul"
          ) {
            runningStrikes = Math.min(3, runningStrikes + 1);
          } else if (p === "foul" && runningStrikes < 2) {
            runningStrikes += 1;
          }
        }
        if (
          hasThreeBuntFoul &&
          ab.resultCode !== "strikeout" &&
          ab.resultCode !== "dropped_third_strike_out"
        ) {
          issues.push({
            id: `pitch-3bunt-${ab.id}`,
            severity: "warning",
            atBatId: ab.id,
            inning,
            isTop,
            battingOrder: ab.battingOrder,
            category: "count",
            message: `2ストライク後に「バントファウル」が記録されています（公認野球規則によりスリーバント失敗＝三振）。通常のファウルか打席結果を確認してください。`,
          });
        }

        // 牽制球と塁上走者の整合チェック（1塁牽制 / 2塁牽制 / 3塁牽制）
        if (ab.pitches.some((p) => p === "pickoff")) {
          issues.push({
            id: `pitch-po-generic-${ab.id}`,
            severity: "warning",
            atBatId: ab.id,
            inning,
            isTop,
            battingOrder: ab.battingOrder,
            category: "runner",
            message: `塁未指定の「牽制」が含まれています。1塁牽制・2塁牽制・3塁牽制のいずれかを選択してください。`,
          });
        }
        const had1B =
          Boolean(bases["1B"]) ||
          ab.advances.some(
            (a) => a.from === "1B" || (a.from !== "BAT" && a.to === "1B")
          );
        const had2B =
          Boolean(bases["2B"]) ||
          ab.advances.some(
            (a) => a.from === "2B" || (a.from !== "BAT" && a.to === "2B")
          );
        const had3B =
          Boolean(bases["3B"]) ||
          ab.advances.some(
            (a) => a.from === "3B" || (a.from !== "BAT" && a.to === "3B")
          );
        if (ab.pitches.includes("pickoff_1b") && !had1B) {
          issues.push({
            id: `pitch-po1-${ab.id}`,
            severity: "warning",
            atBatId: ab.id,
            inning,
            isTop,
            battingOrder: ab.battingOrder,
            category: "runner",
            message: `1塁走者がいない場面で「1塁牽制」が記録されています。ボール記号（ー）や他塁牽制との見間違いがないか確認してください。`,
          });
        }
        if (ab.pitches.includes("pickoff_2b") && !had2B) {
          issues.push({
            id: `pitch-po2-${ab.id}`,
            severity: "warning",
            atBatId: ab.id,
            inning,
            isTop,
            battingOrder: ab.battingOrder,
            category: "runner",
            message: `2塁走者がいない場面で「2塁牽制」が記録されています。1塁牽制やボール記号との見間違いがないか確認してください。`,
          });
        }
        if (ab.pitches.includes("pickoff_3b") && !had3B) {
          issues.push({
            id: `pitch-po3-${ab.id}`,
            severity: "warning",
            atBatId: ab.id,
            inning,
            isTop,
            battingOrder: ab.battingOrder,
            category: "runner",
            message: `3塁走者がいない場面で「3塁牽制」が記録されています。他塁牽制やボール記号との見間違いがないか確認してください。`,
          });
        }
        if (ab.pitches.includes("balk")) {
          if (!had1B && !had2B && !had3B) {
            issues.push({
              id: `pitch-balk-empty-${ab.id}`,
              severity: "warning",
              atBatId: ab.id,
              inning,
              isTop,
              battingOrder: ab.battingOrder,
              category: "runner",
              message: `無走者の場面で「ボーク」が記録されています（無走者時の反則投球はボールになります）。`,
            });
          } else if (!ab.advances.some((a) => a.method === "balk")) {
            issues.push({
              id: `pitch-balk-adv-${ab.id}`,
              severity: "warning",
              atBatId: ab.id,
              inning,
              isTop,
              battingOrder: ab.battingOrder,
              category: "runner",
              message: `「ボーク」が記録されていますが、走者のボーク進塁（BK）が未登録です。走者進塁を確認してください。`,
            });
          }
        }
      }

      // インフィールドフライの宣告条件チェック（無死または一死、かつ一・二塁または満塁）
      if (ab.resultCode === "infield_fly") {
        const hasTiebreakOrRunner1B =
          Boolean(bases["1B"]) ||
          ab.advances.some((a) => a.from === "1B" || a.method === "tiebreak");
        const hasTiebreakOrRunner2B =
          Boolean(bases["2B"]) ||
          ab.advances.some((a) => a.from === "2B" || a.method === "tiebreak");
        if (inningOuts >= 2 || !hasTiebreakOrRunner1B || !hasTiebreakOrRunner2B) {
          issues.push({
            id: `iff-cond-${ab.id}`,
            severity: "warning",
            atBatId: ab.id,
            inning,
            isTop,
            battingOrder: ab.battingOrder,
            category: "outs",
            message: `インフィールドフライは無死または一死で走者一・二塁（または満塁）の場面でのみ成立します。通常の内野フライでないか確認してください。`,
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
        if (
          ab.resultCode === "single" ||
          ab.resultCode === "walk" ||
          ab.resultCode === "intentional_walk" ||
          ab.resultCode === "hit_by_pitch" ||
          ab.resultCode === "interference" ||
          ab.resultCode === "error" ||
          ab.resultCode === "fc" ||
          ab.resultCode === "dropped_third_strike"
        ) {
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
    // ※最終打席で打者自身が完了せず走者盗塁死/牽制死/走塁死のみで3アウトになった場合は同じ打者が次回先頭になる
    const lastAb = inningEvents[inningEvents.length - 1];
    const endedByRunnerOutOnly =
      lastAb.resultCode === "other" &&
      lastAb.advances.some(
        (a) =>
          a.isOut &&
          (a.method === "caught_stealing" ||
            a.method === "pickoff_out" ||
            a.method === "interference_out" ||
            a.method === "appeal_out" ||
            a.method === "out_on_base")
      );
    expectedNextBatterOrder = endedByRunnerOutOnly
      ? lastAb.battingOrder
      : (lastAb.battingOrder % lineupCycle) + 1;
  }

  return issues;
}

function isRunnerOnlyInningEnd(ab: ScorebookV2AtBat): boolean {
  return (
    ab.resultCode === "other" &&
    ab.advances.some(
      (a) =>
        a.isOut &&
        (a.method === "caught_stealing" ||
          a.method === "pickoff_out" ||
          a.method === "interference_out" ||
          a.method === "appeal_out" ||
          a.method === "out_on_base")
    )
  );
}

/**
 * Stage 1 で確定済みの打順リスト（1番〜9番/N番）の厳密な循環則を用い、
 * ① 1回の先頭打順抜け（例: 2番から始まっている ➔ 1番抜け）
 * ② 同一イニング内の打順飛び（例: 1→2→4番 ➔ 3番抜け）
 * ③ 連続するイニング間の境界打順抜け（例: 1回が1→2→3→4番で終わり、2回が6番から始まっている ➔ 5番抜け！）
 * を自動検出し、再確認すべき候補マス座標ペア（前イニング末尾 vs 次イニング先頭 等）を生成する。
 */
export function detectMissingOrderGaps(
  atBats: ScorebookV2AtBat[],
  structure: ScorebookSheetStructure | null | undefined
): MissingOrderGapSpec[] {
  if (!structure || atBats.length === 0) return [];

  const maxOrder = Math.max(
    9,
    structure.batters.length || 9,
    ...atBats.map((a) => a.battingOrder || 9)
  );
  const lineupCycle = maxOrder >= 10 ? maxOrder : 9;
  const stepOrder = (bo: number): number => (bo % lineupCycle) + 1;
  const gapCount = (expectedBo: number, actualBo: number): number =>
    (actualBo - expectedBo + lineupCycle) % lineupCycle;
  const expandMissingOrders = (expectedBo: number, count: number): number[] => {
    const res: number[] = [];
    let cur = expectedBo;
    for (let k = 0; k < count; k++) {
      res.push(cur);
      cur = stepOrder(cur);
    }
    return res;
  };

  const inningsMap = new Map<number, ScorebookV2AtBat[]>();
  for (const ab of atBats) {
    const arr = inningsMap.get(ab.inning) || [];
    arr.push(ab);
    inningsMap.set(ab.inning, arr);
  }
  const sortedInnings = Array.from(inningsMap.keys()).sort((a, b) => a - b);
  if (sortedInnings.length === 0) return [];

  const gaps: MissingOrderGapSpec[] = [];
  let seqNum = 1;
  const MAX_GAPS = 8;

  const summarizeInning = (inn: number, list: ScorebookV2AtBat[]): string => {
    const outs = list.reduce((s, x) => s + Math.max(0, x.outsInPlay), 0);
    const runs = list.reduce((s, x) => s + Math.max(0, x.runsInPlay), 0);
    const meta = structure.innings.find((m) => m.inning === inn);
    const seqText = list
      .map((x) => `${x.battingOrder}番(${x.resultLabel}, ${x.outsInPlay}死)`)
      .join("→");
    return `${inn}回: [${seqText}] 計${outs}アウト/${runs}点(確定得点:${meta?.runs ?? runs}点)`;
  };

  // 1. 1回の先頭が1番でない場合（例: 2番スタート ➔ 1番抜け）
  if (sortedInnings[0] === 1) {
    const inn1 = inningsMap.get(1) || [];
    if (inn1.length > 0 && inn1[0].battingOrder !== 1) {
      const g = gapCount(1, inn1[0].battingOrder);
      if (g >= 1 && g <= 3) {
        const missingOrders = expandMissingOrders(1, g);
        for (const bo of missingOrders) {
          if (gaps.length >= MAX_GAPS) break;
          const resolved = resolveActiveMatchupFromStructure(structure, 1, bo);
          gaps.push({
            gapId: `G${seqNum++}`,
            battingOrder: bo,
            batterName: resolved.batterName || `${bo}番打者`,
            kind: "lead_off_1st",
            targetInning: 1,
            candidates: [
              {
                inning: 1,
                columnIndex: 1,
                role: "single_inning",
              },
            ],
            contextHint: `1回先頭から${inn1[0].battingOrder}番の前に欠落している${bo}番打者 (${summarizeInning(
              1,
              inn1
            )})`,
          });
        }
      }
    }
  }

  // 2. 各イニング内の途中飛び ＆ 隣接イニング間の境界抜け
  for (let idx = 0; idx < sortedInnings.length; idx++) {
    if (gaps.length >= MAX_GAPS) break;
    const inn = sortedInnings[idx];
    const list = inningsMap.get(inn) || [];
    const innMeta = structure.innings.find((m) => m.inning === inn);
    const maxCols = Math.max(1, innMeta?.columnCount ?? 1);

    // 2-A. 同一イニング内の打順飛び（例: 1→2→4番 ➔ 3番抜け）
    for (let i = 1; i < list.length; i++) {
      if (gaps.length >= MAX_GAPS) break;
      const prev = list[i - 1];
      const cur = list[i];
      const expected = stepOrder(prev.battingOrder);
      const g = gapCount(expected, cur.battingOrder);
      if (g >= 1 && g <= 3) {
        const missingOrders = expandMissingOrders(expected, g);
        for (const bo of missingOrders) {
          if (gaps.length >= MAX_GAPS) break;
          const subCol = Math.max(
            1,
            Math.min(
              maxCols,
              bo < prev.battingOrder && cur.columnIndex > prev.columnIndex
                ? cur.columnIndex
                : prev.columnIndex || 1
            )
          );
          const resolved = resolveActiveMatchupFromStructure(structure, inn, bo);
          gaps.push({
            gapId: `G${seqNum++}`,
            battingOrder: bo,
            batterName: resolved.batterName || `${bo}番打者`,
            kind: "intra_inning",
            targetInning: inn,
            insertAfterAtBatId: prev.id,
            candidates: [
              {
                inning: inn,
                columnIndex: subCol,
                role: "single_inning",
              },
            ],
            contextHint: `${inn}回内の${prev.battingOrder}番と${cur.battingOrder}番の間で読み飛ばされた${bo}番打者 (${summarizeInning(
              inn,
              list
            )})`,
          });
        }
      }
    }

    // 2-B. 隣接する次イニング（inn + 1）との境界抜け（例: 1回が1→2→3→4番で終了し、2回が6番から開始 ➔ 5番抜け！）
    if (idx < sortedInnings.length - 1) {
      const nextInn = sortedInnings[idx + 1];
      if (nextInn === inn + 1) {
        const nextList = inningsMap.get(nextInn) || [];
        if (list.length > 0 && nextList.length > 0) {
          const lastPrev = list[list.length - 1];
          const firstNext = nextList[0];
          const runnerEnd = isRunnerOnlyInningEnd(lastPrev);

          let g = 0;
          let expected = stepOrder(lastPrev.battingOrder);
          if (runnerEnd) {
            if (firstNext.battingOrder === lastPrev.battingOrder) {
              g = 0;
            } else if (firstNext.battingOrder === stepOrder(lastPrev.battingOrder)) {
              // 実は打席完了していたケースなので欠損マス自体は無し
              g = 0;
            } else {
              expected = lastPrev.battingOrder;
              g = gapCount(expected, firstNext.battingOrder);
            }
          } else {
            expected = stepOrder(lastPrev.battingOrder);
            g = gapCount(expected, firstNext.battingOrder);
          }

          if (g >= 1 && g <= 3) {
            const missingOrders = expandMissingOrders(expected, g);
            for (const bo of missingOrders) {
              if (gaps.length >= MAX_GAPS) break;
              const existingCountInPrev = list.filter(
                (x) => x.battingOrder === bo
              ).length;
              const prevTailCol = Math.min(
                maxCols,
                Math.max(lastPrev.columnIndex || 1, existingCountInPrev + 1)
              );
              const resolved = resolveActiveMatchupFromStructure(
                structure,
                inn,
                bo
              );
              gaps.push({
                gapId: `G${seqNum++}`,
                battingOrder: bo,
                batterName: resolved.batterName || `${bo}番打者`,
                kind: "inter_inning",
                prevInning: inn,
                nextInning: nextInn,
                candidates: [
                  {
                    inning: inn,
                    columnIndex: prevTailCol,
                    role: "prev_inning_tail",
                  },
                  {
                    inning: nextInn,
                    columnIndex: 1,
                    role: "next_inning_head",
                  },
                ],
                contextHint: `${inn}回終了(${lastPrev.battingOrder}番)と${nextInn}回先頭(${firstNext.battingOrder}番)の間で抜けている${bo}番打者。${summarizeInning(
                  inn,
                  list
                )} ／ ${summarizeInning(nextInn, nextList)}`,
              });
            }
          }
        }
      }
    }
  }

  return gaps;
}

function rebalanceInningOutsAfterRecovery(
  list: ScorebookV2AtBat[]
): ScorebookV2AtBat[] {
  if (list.length === 0) return list;
  const cloned = list.map((x) => ({
    ...x,
    advances: x.advances.map((a) => ({ ...a })),
  }));

  let totalOuts = cloned.reduce((s, x) => s + Math.max(0, x.outsInPlay), 0);

  // ケース1: 2アウト＋最終打者が野選/封殺(fc)で outsInPlay=0 になっていた場合 ➔ 1塁走者封殺の1アウトを補完して3アウト化
  const last = cloned[cloned.length - 1];
  if (totalOuts === 2 && last && last.resultCode === "fc" && last.outsInPlay === 0) {
    last.outsInPlay = 1;
    totalOuts = 3;
  }

  // ケース2: 補完により合計アウトが4以上になった場合（先行走者マスのⅢが先行打席と後続打席で二重計上されていたケース等を解消）
  if (totalOuts > 3) {
    // 2-A: 単打・四死球・失策等の安全出塁打席なのに後続打席での走塁死分が outsInPlay に乗っていた箇所から優先控除
    for (let i = 0; i < cloned.length - 1 && totalOuts > 3; i++) {
      const ab = cloned[i];
      const isSafeReach =
        ab.resultCode === "single" ||
        ab.resultCode === "double" ||
        ab.resultCode === "triple" ||
        ab.resultCode === "home_run" ||
        ab.resultCode === "walk" ||
        ab.resultCode === "intentional_walk" ||
        ab.resultCode === "hit_by_pitch" ||
        ab.resultCode === "interference" ||
        ab.resultCode === "dropped_third_strike" ||
        ab.resultCode === "error";
      if (isSafeReach && ab.outsInPlay > 0) {
        const deduct = Math.min(ab.outsInPlay, totalOuts - 3);
        ab.outsInPlay -= deduct;
        totalOuts -= deduct;
      }
    }

    // 2-B: それでも超過しており末尾や途中に野選(fc)または途中断(other)の重複アウトがある場合
    for (let i = 0; i < cloned.length && totalOuts > 3; i++) {
      const ab = cloned[i];
      if ((ab.resultCode === "fc" || ab.resultCode === "other") && ab.outsInPlay > 0) {
        const deduct = Math.min(ab.outsInPlay, totalOuts - 3);
        ab.outsInPlay -= deduct;
        totalOuts -= deduct;
      }
    }
  }

  // endingOuts を先頭から単調増加（1〜3）に整える
  let runningOuts = 0;
  for (const ab of cloned) {
    runningOuts = Math.min(3, runningOuts + Math.max(0, ab.outsInPlay));
    ab.endingOuts = runningOuts;
  }

  return cloned;
}

/**
 * `/reconcile-missing-atbats` で抽出された欠損打順の打席データを、
 * 正しいイニング（1回末尾 or 2回先頭 or イニング途中）の正しい時系列位置へ挿入し、アウト推移を整合化する。
 */
export function applyRecoveredMissingAtBats(
  atBats: ScorebookV2AtBat[],
  resolved: ResolvedMissingAtBatItem[],
  gaps: MissingOrderGapSpec[]
): ScorebookV2AtBat[] {
  if (resolved.length === 0 || gaps.length === 0) return atBats;

  const resolvedByGapId = new Map<string, ScorebookV2AtBat>();
  for (const item of resolved) {
    resolvedByGapId.set(item.gapId, item.atBat);
  }

  const inningsMap = new Map<number, ScorebookV2AtBat[]>();
  for (const ab of atBats) {
    const arr = inningsMap.get(ab.inning) || [];
    arr.push(ab);
    inningsMap.set(ab.inning, arr);
  }

  const touchedInnings = new Set<number>();

  // 1. 1回先頭への先頭挿入 (lead_off_1st)
  const leadOffItems: ScorebookV2AtBat[] = [];
  for (const gap of gaps) {
    if (gap.kind !== "lead_off_1st") continue;
    const item = resolvedByGapId.get(gap.gapId);
    if (!item) continue;
    leadOffItems.push({ ...item, inning: 1 });
  }
  if (leadOffItems.length > 0) {
    const existing1 = inningsMap.get(1) || [];
    inningsMap.set(1, [...leadOffItems, ...existing1]);
    touchedInnings.add(1);
  }

  // 2. 同一イニング途中の挿入 (intra_inning)
  const intraByAfterId = new Map<string, ScorebookV2AtBat[]>();
  for (const gap of gaps) {
    if (gap.kind !== "intra_inning" || !gap.insertAfterAtBatId || !gap.targetInning) {
      continue;
    }
    const item = resolvedByGapId.get(gap.gapId);
    if (!item) continue;
    const queue = intraByAfterId.get(gap.insertAfterAtBatId) || [];
    queue.push({ ...item, inning: gap.targetInning });
    intraByAfterId.set(gap.insertAfterAtBatId, queue);
    touchedInnings.add(gap.targetInning);
  }
  if (intraByAfterId.size > 0) {
    for (const [inn, list] of inningsMap.entries()) {
      let modified = false;
      const rebuilt: ScorebookV2AtBat[] = [];
      for (const ab of list) {
        rebuilt.push(ab);
        const ins = intraByAfterId.get(ab.id);
        if (ins && ins.length > 0) {
          rebuilt.push(...ins);
          modified = true;
        }
      }
      if (modified) {
        inningsMap.set(inn, rebuilt);
      }
    }
  }

  // 3. イニング境界（prevInning 末尾 vs nextInning 先頭）への挿入 (inter_inning)
  const tailQueues = new Map<number, ScorebookV2AtBat[]>();
  const headQueues = new Map<number, ScorebookV2AtBat[]>();

  for (const gap of gaps) {
    if (gap.kind !== "inter_inning" || !gap.prevInning || !gap.nextInning) {
      continue;
    }
    const item = resolvedByGapId.get(gap.gapId);
    if (!item) continue;

    if (item.inning === gap.nextInning) {
      const q = headQueues.get(gap.nextInning) || [];
      q.push({ ...item, inning: gap.nextInning, columnIndex: 1 });
      headQueues.set(gap.nextInning, q);
      touchedInnings.add(gap.nextInning);
    } else {
      const prevTailCand = gap.candidates.find(
        (c) => c.inning === gap.prevInning
      );
      const q = tailQueues.get(gap.prevInning) || [];
      q.push({
        ...item,
        inning: gap.prevInning,
        columnIndex: prevTailCand?.columnIndex ?? item.columnIndex ?? 1,
      });
      tailQueues.set(gap.prevInning, q);
      touchedInnings.add(gap.prevInning);
    }
  }

  for (const [inn, headItems] of headQueues.entries()) {
    const cur = inningsMap.get(inn) || [];
    inningsMap.set(inn, [...headItems, ...cur]);
  }
  for (const [inn, tailItems] of tailQueues.entries()) {
    const cur = inningsMap.get(inn) || [];
    inningsMap.set(inn, [...cur, ...tailItems]);
  }

  // 4. 挿入が行われたイニングのアウト数整合リバランス
  for (const inn of touchedInnings) {
    const list = inningsMap.get(inn);
    if (list && list.length > 0) {
      inningsMap.set(inn, rebalanceInningOutsAfterRecovery(list));
    }
  }

  const allSortedInnings = Array.from(inningsMap.keys()).sort((a, b) => a - b);
  const merged: ScorebookV2AtBat[] = [];
  for (const inn of allSortedInnings) {
    const list = inningsMap.get(inn) || [];
    merged.push(...list);
  }
  return merged;
}

