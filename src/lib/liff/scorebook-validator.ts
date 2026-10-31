// filepath: src/lib/liff/scorebook-validator.ts
import { harmonizeOcrFieldingAndLabel } from "@/lib/liff/scorebook-fielding";
import {
  getCellQuadInStructure,
  quadToBoundingBox,
} from "@/lib/liff/scorebook-grid";
import { simulateSheetRunners } from "@/lib/liff/scorebook-runners";
import {
  isPickoffPitch,
  type CanonicalAtBatResult,
  type CanonicalPitchResult,
  type ExcessOutInningSpec,
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
  if (
    label.includes("振逃") ||
    label.includes("振り逃げ") ||
    /^K\s*[-－ー]?\s*(?:E2|2E(?:-3)?)$/i.test(upper)
  ) {
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
  const normErrToken = upper
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0)
    )
    .replace(/\s+/g, "")
    .replace(/[－ー―‐=＝→⇒➡]/g, "-");
  if (
    normErrToken.startsWith("E") ||
    /^[1-9]E(?:-[1-9])?$/.test(normErrToken) ||
    (/^[1-9]-E?[1-9]E?$/.test(normErrToken) && normErrToken.includes("E")) ||
    /\((?:E[1-9](?:-[1-9])?|[1-9]E(?:-[1-9])?)\)/.test(normErrToken) ||
    label.includes("失策") ||
    label.includes("悪送球") ||
    label.includes("エラー") ||
    /[投捕一二三遊左中右]失/.test(label)
  ) {
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
    const inningSnapshots = simulateSheetRunners(inningEvents, structure);

    for (let i = 0; i < inningEvents.length; i++) {
      const ab = inningEvents[i];
      const snap = inningSnapshots.get(ab.id);
      const snapBasesBefore = snap?.basesBefore;
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
          Boolean(snapBasesBefore?.["1B"]) ||
          ab.advances.some(
            (a) => a.from === "1B" || (a.from !== "BAT" && a.to === "1B")
          );
        const had2B =
          Boolean(snapBasesBefore?.["2B"]) ||
          ab.advances.some(
            (a) => a.from === "2B" || (a.from !== "BAT" && a.to === "2B")
          );
        const had3B =
          Boolean(snapBasesBefore?.["3B"]) ||
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
          Boolean(snapBasesBefore?.["1B"]) ||
          ab.advances.some((a) => a.from === "1B" || a.method === "tiebreak");
        const hasTiebreakOrRunner2B =
          Boolean(snapBasesBefore?.["2B"]) ||
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

      // 4. 得点と本塁生還可能走者数の一致チェック
      const explicitHpAdvances = ab.advances.filter(
        (a) => a.to === "HP" && !a.isOut
      ).length;
      const simulatedHpMoves = snap
        ? snap.precedingRunnerMoves.filter((m) => m.to === "HP" && !m.isOut)
            .length +
          (snap.batterSummary.finalBase === "HP" &&
          !snap.batterSummary.isOutOnBases
            ? 1
            : 0)
        : explicitHpAdvances + (ab.resultCode === "home_run" ? 1 : 0);
      const isHomeRun = ab.resultCode === "home_run";
      if (ab.runsInPlay > 0 && simulatedHpMoves < ab.runsInPlay && !isHomeRun) {
        issues.push({
          id: `hp-mismatch-${ab.id}`,
          severity: "warning",
          atBatId: ab.id,
          inning,
          isTop,
          battingOrder: ab.battingOrder,
          category: "runs",
          message: `この打席で${ab.runsInPlay}点記録されていますが、生還可能な塁上走者が見当たりません（走者状況・本塁生還を確認してください）。`,
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
    expectedNextBatterOrder = isRunnerOnlyInningEnd(lastAb)
      ? lastAb.battingOrder
      : (lastAb.battingOrder % lineupCycle) + 1;
  }

  return issues;
}

export function isRunnerOnlyInningEnd(ab: ScorebookV2AtBat): boolean {
  if (ab.resultCode !== "other") return false;
  if (
    ab.advances.some(
      (a) =>
        a.isOut &&
        (a.method === "caught_stealing" ||
          a.method === "pickoff_out" ||
          a.method === "interference_out" ||
          a.method === "appeal_out" ||
          a.method === "out_on_base")
    )
  ) {
    return true;
  }
  const label = (ab.resultLabel || "").trim();
  return /途中断|走塁死|盗塁死|牽制死|アピール/.test(label);
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

function isSafeBatterReachCode(rc: CanonicalAtBatResult): boolean {
  return (
    rc === "single" ||
    rc === "double" ||
    rc === "triple" ||
    rc === "home_run" ||
    rc === "walk" ||
    rc === "intentional_walk" ||
    rc === "hit_by_pitch" ||
    rc === "interference" ||
    rc === "dropped_third_strike" ||
    rc === "error"
  );
}

function isSingleBatterOutCode(rc: CanonicalAtBatResult): boolean {
  return (
    rc === "groundout" ||
    rc === "flyout" ||
    rc === "infield_fly" ||
    rc === "strikeout" ||
    rc === "dropped_third_strike_out" ||
    rc === "sac_bunt" ||
    rc === "sac_fly" ||
    rc === "interference_out"
  );
}

function estimateSingleItemOutsForRotation(ab: ScorebookV2AtBat): number {
  if (ab.resultCode === "triple_play") return 3;
  if (ab.resultCode === "double_play") return 2;
  if (isSingleBatterOutCode(ab.resultCode)) return 1;
  if (isSafeBatterReachCode(ab.resultCode)) return 0;
  return Math.max(0, Math.min(2, ab.outsInPlay || 0));
}

function isFullEqualLineupCycle(
  list: ScorebookV2AtBat[],
  lineupCycle: number
): boolean {
  if (list.length < lineupCycle || list.length % lineupCycle !== 0) {
    return false;
  }
  const expectedPerSlot = list.length / lineupCycle;
  const counts = new Array<number>(lineupCycle + 1).fill(0);
  for (const ab of list) {
    if (ab.battingOrder < 1 || ab.battingOrder > lineupCycle) return false;
    counts[ab.battingOrder] += 1;
  }
  for (let bo = 1; bo <= lineupCycle; bo++) {
    if (counts[bo] !== expectedPerSlot) return false;
  }
  return true;
}

/**
 * 1イニング9人全員（または18人など打順一巡・二巡ちょうど）が埋まっている場合や、
 * 10人以上の打者一巡イニングで上から「1番→9番」の行順で並んでしまっている場合に、
 *  ① 前のイニング終了打順からの連続則（通常＝次の打順番号 ／ 打席途中の盗塁死・牽制死等での終了時＝同一の打順番号）
 *  ② 次イニング先頭打順との連続則（9人攻撃なら次回先頭も原則同じ打順番号）
 *  ③ イニング内の3アウト完了位置（3アウト目が最終打者に位置し、3アウト後に余剰打席が出ないこと）
 *  ④ 9番下端折り返し式のサブ列境界（c:1 ➔ c:2）および先頭打者の野球物理制約
 * を総合評価し、イニング内の打席配列を正しい先頭打者からの時系列順へ数学的に循環回転（補正）する。
 */
function reconcileCyclicInningLeadOffs(
  inningsMap: Map<number, ScorebookV2AtBat[]>,
  sortedInnings: number[],
  lineupCycle: number,
  structure?: ScorebookSheetStructure | null
): boolean {
  if (sortedInnings.length === 0) return false;

  const stepOrder = (bo: number): number => (bo % lineupCycle) + 1;
  const prevOrder = (bo: number): number =>
    ((bo - 2 + lineupCycle) % lineupCycle) + 1;

  let anyRotated = false;

  // 連続する2イニング（例: 2回・3回ともに9人攻撃）でも確実に伝播するよう最大2パス走査する
  for (let sweep = 0; sweep < 2; sweep++) {
    let sweepChanged = false;

    for (let idx = 0; idx < sortedInnings.length; idx++) {
      const inn = sortedInnings[idx];
      const list = inningsMap.get(inn) || [];
      if (list.length < lineupCycle) continue;

      const counts = new Array<number>(lineupCycle + 1).fill(0);
      let validOrders = true;
      for (const ab of list) {
        if (ab.battingOrder < 1 || ab.battingOrder > lineupCycle) {
          validOrders = false;
          break;
        }
        counts[ab.battingOrder] += 1;
      }
      if (!validOrders) continue;

      const minCount = Math.min(...counts.slice(1));
      const maxCount = Math.max(...counts.slice(1));
      if (minCount === 0) continue;

      const byBo = new Map<
        number,
        Array<{ ab: ScorebookV2AtBat; origIdx: number }>
      >();
      list.forEach((ab, origIdx) => {
        const arr = byBo.get(ab.battingOrder) || [];
        arr.push({ ab, origIdx });
        byBo.set(ab.battingOrder, arr);
      });
      if (maxCount > 1) {
        for (const arr of byBo.values()) {
          arr.sort((a, b) => {
            const colDiff = (a.ab.columnIndex || 1) - (b.ab.columnIndex || 1);
            return colDiff !== 0 ? colDiff : a.origIdx - b.origIdx;
          });
        }
      }

      const buildCandidateOrder = (startBo: number): ScorebookV2AtBat[] => {
        const seq: ScorebookV2AtBat[] = [];
        for (let lap = 0; lap < maxCount; lap++) {
          for (let offset = 0; offset < lineupCycle; offset++) {
            const bo = ((startBo - 1 + offset) % lineupCycle) + 1;
            const entries = byBo.get(bo) || [];
            if (lap < entries.length) {
              seq.push(entries[lap].ab);
            }
          }
        }
        return seq;
      };

      let targetStartBo: number | null = null;

      if (minCount === maxCount) {
        // === ケースA: 1イニング9人（または18人）全員が同数ずつ埋まっている場合 ===
        if (inn === 1) {
          targetStartBo = 1;
        } else {
          const prevInn = idx > 0 ? sortedInnings[idx - 1] : null;
          const prevList =
            prevInn !== null && prevInn === inn - 1
              ? inningsMap.get(prevInn) || []
              : [];

          const nextInn =
            idx < sortedInnings.length - 1 ? sortedInnings[idx + 1] : null;
          const nextList =
            nextInn !== null && nextInn === inn + 1
              ? inningsMap.get(nextInn) || []
              : [];
          const nextIsAlsoAmbiguousFullCycle = isFullEqualLineupCycle(
            nextList,
            lineupCycle
          );

          const currentFirstBo = list[0].battingOrder;
          let bestBo = currentFirstBo;
          let bestScore = -Infinity;

          for (let candS = 1; candS <= lineupCycle; candS++) {
            let score = 0;
            const seq = buildCandidateOrder(candS);

            // ① 前のイニング終了打順との連続性（次の番号 or 走塁死終了時の同一番号）
            if (prevList.length > 0) {
              const lastPrev = prevList[prevList.length - 1];
              const lastBo = lastPrev.battingOrder;
              const candNext = stepOrder(lastBo);
              const candSame = lastBo;
              const prevRunnerEnd = isRunnerOnlyInningEnd(lastPrev);
              const prevOuts = prevList.reduce(
                (s, x) => s + estimateSingleItemOutsForRotation(x),
                0
              );

              if (prevOuts === 3) {
                if (prevRunnerEnd) {
                  if (candS === candSame) score += 140;
                  else if (candS === candNext) score += 55;
                  else score -= 80;
                } else {
                  if (candS === candNext) score += 140;
                  else if (candS === candSame) score += 60;
                  else score -= 80;
                }
              } else if (prevOuts < 3) {
                // 前イニングの末尾打席に読取漏れ（例: 2アウト止まり）がある可能性も考慮
                if (candS === candNext) score += 35;
                if (candS === candSame) score += 18;
                const maxMiss = Math.min(2, 3 - prevOuts);
                for (let skip = 1; skip <= maxMiss; skip++) {
                  const skippedBo =
                    ((candNext - 1 + skip) % lineupCycle) + 1;
                  if (candS === skippedBo) score += 26;
                }
              } else {
                // 前イニングに余剰打席が含まれている場合は累積3アウト到達打順も参照
                let cPrev = 0;
                let threePrevBo: number | null = null;
                for (const pAb of prevList) {
                  cPrev += estimateSingleItemOutsForRotation(pAb);
                  if (cPrev === 3) {
                    threePrevBo = pAb.battingOrder;
                    break;
                  }
                }
                if (threePrevBo !== null) {
                  if (candS === stepOrder(threePrevBo)) score += 75;
                  else if (candS === threePrevBo) score += 35;
                }
                if (candS === candNext) score += 35;
                else if (candS === candSame) score += 20;
              }
            }

            // ② 次のイニング先頭打順との連続性
            if (nextList.length > 0) {
              const nextWeight = nextIsAlsoAmbiguousFullCycle ? 25 : 120;
              const firstNextBo = nextList[0].battingOrder;
              const tailItem = seq[seq.length - 1];
              const tailBo = tailItem.battingOrder; // === prevOrder(candS)
              if (isRunnerOnlyInningEnd(tailItem)) {
                if (tailBo === firstNextBo) score += nextWeight;
                else if (candS === firstNextBo) {
                  score += Math.round(nextWeight * 0.45);
                }
              } else {
                if (candS === firstNextBo) score += nextWeight;
                else if (tailBo === firstNextBo) {
                  score += Math.round(nextWeight * 0.45);
                }
              }
            }

            // ③ イニング内の3アウト完了位置（3アウト目が最終打者で完了し、3アウト後に余剰打席が無いこと）
            let cumOuts = 0;
            let battersAfterThreeOuts = 0;
            for (let i = 0; i < seq.length; i++) {
              if (cumOuts >= 3) {
                battersAfterThreeOuts += 1;
              }
              cumOuts += estimateSingleItemOutsForRotation(seq[i]);
            }
            if (cumOuts >= 3) {
              const tailItem = seq[seq.length - 1];
              if (battersAfterThreeOuts === 0) {
                score += 95;
              } else if (
                battersAfterThreeOuts === 1 &&
                (tailItem.resultCode === "fc" ||
                  tailItem.resultCode === "other" ||
                  tailItem.outsInPlay === 0)
              ) {
                score += 45;
              } else {
                score -= 40 * battersAfterThreeOuts;
              }
            }

            // ④ 9番下端折り返し式のサブ列段差（candS..9番が c:1、1番..candS-1が c:2）
            if (minCount === 1 && candS > 1) {
              let cleanTwoColWrap = true;
              for (let bo = 1; bo <= lineupCycle; bo++) {
                const item = byBo.get(bo)?.[0]?.ab;
                if (!item) {
                  cleanTwoColWrap = false;
                  break;
                }
                const expectedCol = bo >= candS ? 1 : 2;
                if ((item.columnIndex || 1) !== expectedCol) {
                  cleanTwoColWrap = false;
                  break;
                }
              }
              if (cleanTwoColWrap) {
                score += 75;
              }
            }

            // ⑤ イニング先頭打者（無死走者なし）として物理的に不自然な結果の減点
            const leadItem = seq[0];
            if (
              leadItem &&
              (leadItem.resultCode === "sac_fly" ||
                leadItem.resultCode === "sac_bunt" ||
                leadItem.resultCode === "double_play" ||
                leadItem.resultCode === "triple_play" ||
                leadItem.resultCode === "infield_fly" ||
                leadItem.resultCode === "fc")
            ) {
              score -= 30;
            }

            // 完全に同点の場合のみ現在の並びを維持
            if (candS === currentFirstBo) {
              score += 1;
            }

            if (score > bestScore) {
              bestScore = score;
              bestBo = candS;
            }
          }

          targetStartBo = bestBo;
        }
      } else if (maxCount === minCount + 1) {
        // === ケースB: 10〜17人（一巡＋数人）で上から行順に並び打順飛びが発生している場合の整列 ===
        const hasOrderJump = list.some(
          (ab, i) =>
            i > 0 && ab.battingOrder !== stepOrder(list[i - 1].battingOrder)
        );
        if (hasOrderJump) {
          const stepUps: number[] = [];
          for (let bo = 1; bo <= lineupCycle; bo++) {
            if (counts[prevOrder(bo)] < counts[bo]) {
              stepUps.push(bo);
            }
          }
          if (stepUps.length === 1) {
            targetStartBo = stepUps[0];
          }
        }
      }

      if (targetStartBo === null) continue;

      const rotated = buildCandidateOrder(targetStartBo);
      const isDifferentOrder = rotated.some((ab, i) => ab.id !== list[i]?.id);
      if (!isDifferentOrder) continue;

      // 1巡目の9番折り返し前（targetStartBo..lineupCycle）は必ず1列目(columnIndex=1)になるため座標も安全同期
      const innMeta = structure?.innings.find((m) => m.inning === inn);
      const maxSubCols = Math.max(1, innMeta?.columnCount ?? 1);
      const normalizedRotated = rotated.map((ab, posIdx) => {
        const isFirstLapBeforeNineWrap =
          posIdx < lineupCycle && ab.battingOrder >= targetStartBo!;
        const safeCol = isFirstLapBeforeNineWrap
          ? 1
          : Math.max(1, Math.min(maxSubCols, ab.columnIndex || 1));
        if (safeCol === ab.columnIndex) {
          return ab;
        }
        const nextQuad = structure
          ? getCellQuadInStructure(
              structure,
              inn,
              safeCol,
              ab.battingOrder,
              0
            )
          : null;
        return {
          ...ab,
          columnIndex: safeCol,
          cellBox: nextQuad ? quadToBoundingBox(nextQuad) : ab.cellBox,
        };
      });

      inningsMap.set(inn, normalizedRotated);
      sweepChanged = true;
      anyRotated = true;
    }

    if (!sweepChanged) break;
  }

  return anyRotated;
}

/**
 * 1イニングが3アウトを超過する（4アウト・5アウト等）および3アウト後の余剰打席混入、
 * ならびに1イニング9人（打者一巡）が埋まっている場合の先頭打者位置ズレについて、
 * 野球規則とイニング間の打順連続性から数学的に100%確定できる矛盾を0msで自動補正する:
 * 0) 1イニング9人（または18人）が埋まっているイニングの先頭打者位置ズレを前後の回＆3アウト位置から循環回転補正
 * 1) 隣接イニングとの境界重複除去（例: 1回末尾4番と2回先頭4番が重複して1回が4アウトになっている場合や、次イニング先頭打順から3アウト終了位置が一意に確定する場合）
 * 2) 累積アウト数字（Ⅱ=2, Ⅲ=3）が単一アウト打席の outsInPlay に混入したケースの1アウト正規化
 * 3) 無走者時・2アウト時の物理的に不可能な併殺打(double_play=2死)の通常凡退(1死)化
 * 4) 早稲田式で出塁打者のダイヤモンド内に後続打席での盗塁死・封殺が記入され二重計上されたケースの解消
 */
export function reconcileSheetExcessOutsDeterministically(
  atBats: ScorebookV2AtBat[],
  structure?: ScorebookSheetStructure | null
): { atBats: ScorebookV2AtBat[]; changed: boolean } {
  if (atBats.length === 0) {
    return { atBats, changed: false };
  }

  const maxOrder = Math.max(
    9,
    structure?.batters.length || 9,
    ...atBats.map((a) => a.battingOrder || 9)
  );
  const lineupCycle = maxOrder >= 10 ? maxOrder : 9;
  const stepOrder = (bo: number): number => (bo % lineupCycle) + 1;

  const inningsMap = new Map<number, ScorebookV2AtBat[]>();
  for (const ab of atBats) {
    const cloned: ScorebookV2AtBat = {
      ...ab,
      pitches: [...ab.pitches],
      advances: ab.advances.map((a) => ({ ...a })),
    };
    const arr = inningsMap.get(ab.inning) || [];
    arr.push(cloned);
    inningsMap.set(ab.inning, arr);
  }

  const sortedInnings = Array.from(inningsMap.keys()).sort((a, b) => a - b);
  let changed = false;

  // Pass 0: 1イニング9人（打者一巡・二巡）が埋まっているイニングの先頭打者ズレを先に循環回転補正
  // （※これをPass 1/Pass 2の前に実行することで、正しい走者順での併殺判定＆誤トリミング防止を保証！）
  if (
    reconcileCyclicInningLeadOffs(
      inningsMap,
      sortedInnings,
      lineupCycle,
      structure
    )
  ) {
    changed = true;
  }

  // Pass 1: 各イニング内の1打席ごとの野球物理上限＆後続打席走塁死の二重計上クリーンアップ
  for (const inn of sortedInnings) {
    const list = inningsMap.get(inn) || [];
    if (list.length === 0) continue;

    const activeBases: Record<"1B" | "2B" | "3B", boolean> = {
      "1B": false,
      "2B": false,
      "3B": false,
    };
    let runningOuts = 0;

    for (let i = 0; i < list.length; i++) {
      const ab = list[i];
      const activeRunnersCount =
        (activeBases["1B"] ? 1 : 0) +
        (activeBases["2B"] ? 1 : 0) +
        (activeBases["3B"] ? 1 : 0);

      // 出塁打席に「打席開始時に存在しなかった塁からの盗塁死・牽制死・封殺」が入っている場合は後続打席の記録（二重計上）なので除去
      if (isSafeBatterReachCode(ab.resultCode) && ab.advances.length > 0) {
        const filteredAdv = ab.advances.filter((adv) => {
          if (!adv.isOut || adv.from === "BAT") return true;
          const baseOccupiedBefore = activeBases[adv.from];
          if (
            !baseOccupiedBefore &&
            (adv.method === "caught_stealing" ||
              adv.method === "pickoff_out" ||
              adv.method === "fc" ||
              adv.method === "appeal_out")
          ) {
            return false;
          }
          if (
            (ab.resultCode === "walk" ||
              ab.resultCode === "intentional_walk" ||
              ab.resultCode === "hit_by_pitch" ||
              ab.resultCode === "interference") &&
            !baseOccupiedBefore
          ) {
            return false;
          }
          return true;
        });
        if (filteredAdv.length !== ab.advances.length) {
          ab.advances = filteredAdv;
          changed = true;
        }
      }

      const occupiedBaseRunnerOuts = Math.min(
        activeRunnersCount,
        ab.advances.filter(
          (a) => a.isOut && a.from !== "BAT" && activeBases[a.from]
        ).length
      );
      const batterOverrunOut = ab.advances.some(
        (a) =>
          a.isOut &&
          (a.from === "BAT" ||
            (!activeBases[a.from as "1B" | "2B" | "3B"] &&
              a.runnerName === ab.batterName)) &&
          (a.method === "hit" || a.method === "out_on_base")
      )
        ? 1
        : 0;
      const validSamePlayRunnerOuts = occupiedBaseRunnerOuts + batterOverrunOut;

      // 無走者時または既に2アウト時の double_play (2死) は野球規則上100%不可能 ➔ 1アウト凡退/封殺へ補正
      if (
        ab.resultCode === "double_play" &&
        (activeRunnersCount === 0 || runningOuts >= 2)
      ) {
        const hint = `${ab.battedDirection || ""} ${ab.resultLabel || ""}`;
        const nextRc: CanonicalAtBatResult =
          /[FL]$|飛|直|ライナー/i.test(hint) ? "flyout" : "groundout";
        const harm = harmonizeOcrFieldingAndLabel(
          nextRc,
          ab.battedDirection,
          ""
        );
        ab.resultCode = nextRc;
        ab.resultLabel = harm.resultLabel;
        ab.battedDirection = harm.battedDirection;
        ab.outsInPlay = 1;
        changed = true;
      } else if (ab.resultCode === "double_play") {
        if (ab.outsInPlay !== 2) {
          ab.outsInPlay = 2;
          changed = true;
        }
      } else if (ab.resultCode === "triple_play") {
        const maxTp = Math.max(
          1,
          Math.min(3 - runningOuts, 1 + activeRunnersCount)
        );
        if (ab.outsInPlay !== maxTp) {
          ab.outsInPlay = maxTp;
          changed = true;
        }
      } else if (isSingleBatterOutCode(ab.resultCode)) {
        const exactOuts = Math.min(3, 1 + occupiedBaseRunnerOuts);
        if (ab.outsInPlay !== exactOuts) {
          ab.outsInPlay = exactOuts;
          changed = true;
        }
      } else if (isSafeBatterReachCode(ab.resultCode)) {
        const exactOuts = Math.min(2, validSamePlayRunnerOuts);
        if (ab.outsInPlay !== exactOuts) {
          ab.outsInPlay = exactOuts;
          changed = true;
        }
      } else if (ab.resultCode === "fc") {
        const exactOuts =
          ab.outsInPlay >= 1 || occupiedBaseRunnerOuts >= 1 ? 1 : 0;
        if (ab.outsInPlay !== exactOuts) {
          ab.outsInPlay = exactOuts;
          changed = true;
        }
      } else if (ab.resultCode === "other") {
        const exactOuts =
          occupiedBaseRunnerOuts > 0
            ? Math.min(2, occupiedBaseRunnerOuts)
            : ab.outsInPlay > 0
            ? 1
            : 0;
        if (ab.outsInPlay !== exactOuts) {
          ab.outsInPlay = exactOuts;
          changed = true;
        }
      }

      runningOuts = Math.min(3, runningOuts + Math.max(0, ab.outsInPlay));

      for (const adv of ab.advances) {
        if (adv.from === "1B" || adv.from === "2B" || adv.from === "3B") {
          activeBases[adv.from] = false;
        }
      }
      for (const adv of ab.advances) {
        if (
          !adv.isOut &&
          (adv.to === "1B" || adv.to === "2B" || adv.to === "3B")
        ) {
          activeBases[adv.to] = true;
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
          activeBases["1B"] = true;
        } else if (ab.resultCode === "double") {
          activeBases["2B"] = true;
        } else if (ab.resultCode === "triple") {
          activeBases["3B"] = true;
        }
      }
    }
  }

  // Pass 2: 隣接イニングとの打順境界照合による「3アウト後の切り線・重複打席」除去
  for (let idx = 0; idx < sortedInnings.length; idx++) {
    const inn = sortedInnings[idx];
    const list = inningsMap.get(inn) || [];
    if (list.length === 0) continue;

    const nextInn =
      idx < sortedInnings.length - 1 ? sortedInnings[idx + 1] : null;
    const nextList =
      nextInn !== null && nextInn === inn + 1
        ? inningsMap.get(nextInn) || []
        : [];

    const sumOuts = (arr: ScorebookV2AtBat[]): number =>
      arr.reduce((s, x) => s + Math.max(0, x.outsInPlay), 0);

    // 2-A. 次イニング先頭と同じ打順が前イニング末尾にも重複しており、前イニングが3アウト超過（または既に3アウト到達済み）の場合
    while (
      list.length >= 4 &&
      nextList.length > 0 &&
      list[list.length - 1].battingOrder === nextList[0].battingOrder &&
      sumOuts(list.slice(0, -1)) >= 3
    ) {
      list.pop();
      changed = true;
    }

    // 2-B. 前イニングは3アウトちょうどで完了しているのに、次イニング先頭に前イニング最終打者が重複混入して次イニングが4アウト以上になっている場合
    while (
      list.length >= 3 &&
      sumOuts(list) === 3 &&
      nextList.length >= 4 &&
      sumOuts(nextList) > 3 &&
      nextList[0].battingOrder === list[list.length - 1].battingOrder &&
      !isRunnerOnlyInningEnd(list[list.length - 1])
    ) {
      nextList.shift();
      changed = true;
    }

    // 2-C. 累積3アウト到達時点の打順の「次の打順」から次イニングがピタリと始まっている場合、それより後ろの余剰行は100%切り線・ノイズなので除去
    if (nextList.length > 0 && list.length >= 4) {
      let cOuts = 0;
      let threeIdx = -1;
      for (let i = 0; i < list.length; i++) {
        cOuts += Math.max(0, list[i].outsInPlay);
        if (cOuts === 3) {
          threeIdx = i;
          break;
        }
      }
      if (
        threeIdx !== -1 &&
        threeIdx < list.length - 1 &&
        stepOrder(list[threeIdx].battingOrder) === nextList[0].battingOrder
      ) {
        list.splice(threeIdx + 1);
        changed = true;
      }
    }

    // 2-D. 次イニングが存在しない最終イニング等で、先頭から無走者のまま3アウト完了した後ろに余剰行がある場合
    if (nextList.length === 0 && list.length >= 4) {
      let cOuts = 0;
      let threeIdx = -1;
      for (let i = 0; i < list.length; i++) {
        cOuts += Math.max(0, list[i].outsInPlay);
        if (cOuts === 3) {
          threeIdx = i;
          break;
        }
      }
      if (threeIdx !== -1 && threeIdx < list.length - 1) {
        const head = list.slice(0, threeIdx + 1);
        const tail = list.slice(threeIdx + 1);
        const anyRunnerInHead = head.some(
          (x) =>
            isSafeBatterReachCode(x.resultCode) ||
            x.resultCode === "fc" ||
            x.outsInPlay === 0
        );
        const tailPhantom = tail.every(
          (t) =>
            (t.outsInPlay === 0 && t.runsInPlay === 0) ||
            (t.resultCode === "other" && t.runsInPlay === 0)
        );
        if (!anyRunnerInHead || tailPhantom) {
          list.splice(threeIdx + 1);
          changed = true;
        }
      }
    }

    // 2-E. まだ合計4アウト以上で、途中に野選(fc)または打席途中断(other)の重複アウトがある場合は3アウトへ控除
    let curTotalOuts = sumOuts(list);
    if (curTotalOuts > 3) {
      for (let i = 0; i < list.length && curTotalOuts > 3; i++) {
        const ab = list[i];
        if (
          (ab.resultCode === "fc" || ab.resultCode === "other") &&
          ab.outsInPlay > 0
        ) {
          const deduct = Math.min(ab.outsInPlay, curTotalOuts - 3);
          ab.outsInPlay -= deduct;
          curTotalOuts -= deduct;
          changed = true;
        }
      }
    }

    // endingOuts を先頭から単調増加（最大3）に同期
    let monoOuts = 0;
    for (const ab of list) {
      monoOuts = Math.min(3, monoOuts + Math.max(0, ab.outsInPlay));
      if (ab.endingOuts !== monoOuts) {
        ab.endingOuts = monoOuts;
        changed = true;
      }
    }

    inningsMap.set(inn, list);
  }

  // Pass 3: Pass 2 で前イニング末尾の切り線・重複打席が除去された結果に合わせて、9人一巡イニングの先頭位置を最終再確認
  if (
    reconcileCyclicInningLeadOffs(
      inningsMap,
      sortedInnings,
      lineupCycle,
      structure
    )
  ) {
    changed = true;
    for (const inn of sortedInnings) {
      const list = inningsMap.get(inn) || [];
      let monoOuts = 0;
      for (const ab of list) {
        monoOuts = Math.min(3, monoOuts + Math.max(0, ab.outsInPlay));
        ab.endingOuts = monoOuts;
      }
      inningsMap.set(inn, list);
    }
  }

  if (!changed) {
    return { atBats, changed: false };
  }

  const rebuilt: ScorebookV2AtBat[] = [];
  for (const inn of sortedInnings) {
    const list = inningsMap.get(inn) || [];
    rebuilt.push(...list);
  }
  return { atBats: rebuilt, changed: true };
}

/**
 * 決定論的補正後もなお「1イニング合計が3アウトを超過している（例: 4打席すべてが凡退アウトと誤読され計4アウト）」
 * または「3アウト到達後に余剰打席が残っている」イニングを検出し、ピンポイント視覚再検算仕様を生成する。
 */
export function detectExcessOutInnings(
  atBats: ScorebookV2AtBat[],
  structure?: ScorebookSheetStructure | null
): ExcessOutInningSpec[] {
  if (!structure || structure.batters.length === 0 || atBats.length === 0) {
    return [];
  }

  const lineupCycle = Math.max(9, structure.batters.length);
  const inningsMap = new Map<number, ScorebookV2AtBat[]>();
  for (const ab of atBats) {
    const arr = inningsMap.get(ab.inning) || [];
    arr.push(ab);
    inningsMap.set(ab.inning, arr);
  }

  const sortedInnings = Array.from(inningsMap.keys()).sort((a, b) => a - b);
  const specs: ExcessOutInningSpec[] = [];

  for (let idx = 0; idx < sortedInnings.length; idx++) {
    const inn = sortedInnings[idx];
    const list = inningsMap.get(inn) || [];
    if (list.length === 0) continue;

    let cumOuts = 0;
    let hasPostThreeOutExtra = false;
    for (let i = 0; i < list.length; i++) {
      if (cumOuts >= 3) {
        hasPostThreeOutExtra = true;
      }
      cumOuts += Math.max(0, list[i].outsInPlay);
    }

    if (cumOuts <= 3 && !hasPostThreeOutExtra) {
      continue;
    }

    let expectedLeadOff = 1;
    if (inn > 1 && idx > 0) {
      const prevInn = sortedInnings[idx - 1];
      const prevList = prevInn === inn - 1 ? inningsMap.get(prevInn) || [] : [];
      if (prevList.length > 0) {
        const lastPrev = prevList[prevList.length - 1];
        expectedLeadOff = isRunnerOnlyInningEnd(lastPrev)
          ? lastPrev.battingOrder
          : (lastPrev.battingOrder % lineupCycle) + 1;
      } else {
        expectedLeadOff = list[0].battingOrder;
      }
    }

    const nextInn =
      idx < sortedInnings.length - 1 ? sortedInnings[idx + 1] : null;
    const nextList =
      nextInn !== null && nextInn === inn + 1
        ? inningsMap.get(nextInn) || []
        : [];
    const nextInningLeadOffOrder =
      nextList.length > 0 ? nextList[0].battingOrder : undefined;

    const meta = structure.innings.find((m) => m.inning === inn);
    const confirmedRuns = meta?.runs ?? 0;

    specs.push({
      inning: inn,
      confirmedRuns,
      currentTotalOuts: cumOuts,
      expectedLeadOffOrder: expectedLeadOff,
      nextInningLeadOffOrder,
      batters: list.map((ab, bIdx) => ({
        slotKey: `B${bIdx + 1}`,
        atBatId: ab.id,
        columnIndex: ab.columnIndex || 1,
        battingOrder: ab.battingOrder,
        batterName: ab.batterName,
        currentResultCode: ab.resultCode,
        currentResultLabel: ab.resultLabel,
        currentDirection: ab.battedDirection,
        currentOutsInPlay: ab.outsInPlay,
        currentEndingOuts: ab.endingOuts,
      })),
    });
  }

  return specs;
}


