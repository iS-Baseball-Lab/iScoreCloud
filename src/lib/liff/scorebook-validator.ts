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

/**
 * 選手名・背番号からチーム登録選手IDをファジーマッチングする
 */
export function matchRosterPlayer(
  rawName: string | undefined | null,
  rawNumber: string | undefined | null,
  roster: ScorebookRosterPlayer[]
): ScorebookRosterPlayer | null {
  if (roster.length === 0) return null;

  const cleanNum = (rawNumber || "").replace(/[^0-9]/g, "").trim();
  const normalizeName = (s: string) =>
    s
      .replace(/[\s　・.()（）#＃背番号]+/g, "")
      .toLowerCase();

  const cleanName = normalizeName(rawName || "");

  // 1. 背番号＋苗字または名前一致（最も信頼性が高い）
  if (cleanNum) {
    const numMatches = roster.filter(
      (p) => p.uniformNumber.replace(/[^0-9]/g, "") === cleanNum
    );
    if (numMatches.length === 1) {
      return numMatches[0];
    }
    if (numMatches.length > 1 && cleanName) {
      const both = numMatches.find((p) => {
        const n = normalizeName(p.name);
        return n.includes(cleanName) || cleanName.includes(n);
      });
      if (both) return both;
    }
  }

  if (!cleanName) return null;

  // 2. 正規化フルネーム完全一致
  const exact = roster.find((p) => normalizeName(p.name) === cleanName);
  if (exact) return exact;

  // 3. よみがな一致
  const kanaExact = roster.find(
    (p) => p.nameKana && normalizeName(p.nameKana) === cleanName
  );
  if (kanaExact) return kanaExact;

  // 4. 苗字・前方一致（スコアブックは苗字のみ記載が多いため）
  const partials = roster.filter((p) => {
    const n = normalizeName(p.name);
    return (
      (cleanName.length >= 1 && n.startsWith(cleanName)) ||
      (n.length >= 2 && cleanName.startsWith(n))
    );
  });

  if (partials.length === 1) {
    return partials[0];
  }

  return partials[0] || null;
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

