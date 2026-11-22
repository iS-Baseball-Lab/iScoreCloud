// filepath: src/lib/liff/scorebook-live-converter.ts
import {
  normalizeLegacyForceOutAtBat,
  normalizeLegacyInfieldFlyAtBat,
} from "@/lib/liff/scorebook-fielding";
import {
  reconcileSheetExcessOutsDeterministically,
  syncSheetAtBatsWithStructure,
} from "@/lib/liff/scorebook-validator";
import {
  compareHalfInningOrder,
  getHalfInningRuns,
  isMyTeamBattingHalf,
  normalizeReportPositionCode,
  normalizeRunnersList,
  toLivePitcherKey,
} from "@/lib/liff/live-report-v2";
import type {
  LiveReportBaseNum,
  LiveReportPitchType,
  LiveReportPlayEntry,
  LiveReportV2Document,
} from "@/types/live-report-v2";
import type {
  AdvanceMethodCode,
  CanonicalAtBatResult,
  CanonicalPitchResult,
  ScorebookBatterSlot,
  ScorebookInningMeta,
  ScorebookPinchRunnerEntry,
  ScorebookPitcherStint,
  ScorebookRosterPlayer,
  ScorebookSheetStructure,
  ScorebookSubstitution,
  ScorebookV2Advance,
  ScorebookV2AtBat,
} from "@/types/scorebook-v2";

export interface SavedMatchLineupInput {
  battingOrder: number;
  position: string;
  playerId: string | null;
  playerName: string;
  uniformNumber?: string;
  bats?: string | null;
}

export interface SavedOpponentLineupInput {
  battingOrder: number;
  position: string;
  playerName: string;
  uniformNumber?: string;
  bats?: string | null;
}

export interface ScorebookDraftBundleOutput {
  topStructure: ScorebookSheetStructure;
  bottomStructure: ScorebookSheetStructure;
  topAtBats: ScorebookV2AtBat[];
  bottomAtBats: ScorebookV2AtBat[];
}

function normalizePosToDigitOrDh(raw: string | null | undefined): string {
  const p = (raw || "").trim().toUpperCase();
  const map: Record<string, string> = {
    "1": "1",
    P: "1",
    投: "1",
    投手: "1",
    "2": "2",
    C: "2",
    捕: "2",
    捕手: "2",
    "3": "3",
    "1B": "3",
    一: "3",
    "4": "4",
    "2B": "4",
    二: "4",
    "5": "5",
    "3B": "5",
    三: "5",
    "6": "6",
    SS: "6",
    遊: "6",
    "7": "7",
    LF: "7",
    左: "7",
    "8": "8",
    CF: "8",
    中: "8",
    "9": "9",
    RF: "9",
    右: "9",
    DH: "DH",
    D: "DH",
    指: "DH",
  };
  return map[p] || (p === "打" || p === "PH" ? "PH" : p || "");
}

function normalizeBatsCode(raw?: string | null): "R" | "L" | "B" | null {
  const s = (raw || "").trim().toUpperCase();
  if (s === "L" || s === "左") return "L";
  if (s === "B" || s === "S" || s === "両") return "B";
  if (s === "R" || s === "右") return "R";
  return null;
}

function compactName(name: string | null | undefined): string {
  return (name || "").replace(/[\s　]+/g, "").trim();
}

function findRosterPlayer(
  roster: ReadonlyArray<ScorebookRosterPlayer>,
  playerId: string | null | undefined,
  name: string | null | undefined
): ScorebookRosterPlayer | undefined {
  if (playerId) {
    const byId = roster.find((r) => r.id === playerId);
    if (byId) return byId;
  }
  const target = compactName(name);
  if (!target) return undefined;
  const exact = roster.find((r) => compactName(r.name) === target);
  if (exact) return exact;
  return roster.find((r) => {
    const surname = (r.name || "").trim().split(/[\s　]+/)[0] || "";
    return surname.length > 0 && surname === target;
  });
}

function buildBatterSlotsFromSavedLineups(
  savedLineup: ReadonlyArray<SavedMatchLineupInput>,
  roster: ReadonlyArray<ScorebookRosterPlayer>,
  isMyTeam: boolean,
  targetSlotCount: number
): ScorebookBatterSlot[] {
  const slotCount = Math.max(9, Math.min(25, targetSlotCount));
  const byOrder = new Map<number, SavedMatchLineupInput>();
  for (const row of savedLineup) {
    if (row.battingOrder >= 1 && row.battingOrder <= 25 && !byOrder.has(row.battingOrder)) {
      byOrder.set(row.battingOrder, row);
    }
  }

  return Array.from({ length: slotCount }, (_, idx) => {
    const order = idx + 1;
    const saved = byOrder.get(order);
    const matchedRoster = isMyTeam
      ? findRosterPlayer(roster, saved?.playerId, saved?.playerName)
      : undefined;
    const defaultName = isMyTeam ? "" : `相手${order}番`;
    const resolvedName =
      (saved?.playerName || matchedRoster?.name || "").trim() || defaultName;
    const resolvedUniform =
      (saved?.uniformNumber || matchedRoster?.uniformNumber || "").trim();
    const resolvedPos = normalizePosToDigitOrDh(
      saved?.position || (order <= 9 ? String(order) : "DH")
    );
    return {
      battingOrder: order,
      name: resolvedName,
      uniformNumber: resolvedUniform,
      position: resolvedPos,
      playerId: isMyTeam ? saved?.playerId || matchedRoster?.id || null : null,
      bats: normalizeBatsCode(saved?.bats ?? matchedRoster?.bats),
      substitutions: [],
    };
  });
}

function buildInitialPitchersFromDefendingBatters(
  defendingBatters: ReadonlyArray<ScorebookBatterSlot>,
  isMyTeamDefending: boolean,
  maxInning: number
): ScorebookPitcherStint[] {
  const starterPitcher = defendingBatters.find(
    (b) => normalizePosToDigitOrDh(b.position) === "1"
  );
  if (starterPitcher && starterPitcher.name.trim()) {
    return [
      {
        id: `p-init-1`,
        order: 1,
        name: starterPitcher.name.trim(),
        uniformNumber: starterPitcher.uniformNumber || "",
        playerId: starterPitcher.playerId || null,
        fromInning: 1,
        fromBatterOrder: null,
        toInning: Math.max(1, maxInning),
        manualDecision: null,
      },
    ];
  }
  return [
    {
      id: `p-init-1`,
      order: 1,
      name: isMyTeamDefending ? "" : "相手投手",
      uniformNumber: "",
      playerId: null,
      fromInning: 1,
      fromBatterOrder: null,
      toInning: Math.max(1, maxInning),
      manualDecision: null,
    },
  ];
}

/**
 * 紙スコアブック写真なしでの「直接デジタル手入力モード」初期シート構造を生成する（AI課金ゼロ）。
 */
export function buildDirectDigitalScorebookDraft(params: {
  battingOrder: "first" | "second";
  scheduledInnings: number;
  myLineup?: ReadonlyArray<SavedMatchLineupInput>;
  opponentLineup?: ReadonlyArray<SavedOpponentLineupInput>;
  rosterPlayers?: ReadonlyArray<ScorebookRosterPlayer>;
  myInningScores?: ReadonlyArray<number>;
  opponentInningScores?: ReadonlyArray<number>;
  opponentBatterCount?: number;
}): ScorebookDraftBundleOutput {
  const roster = params.rosterPlayers || [];
  const mySaved = params.myLineup || [];
  const oppSaved: SavedMatchLineupInput[] = (params.opponentLineup || []).map(
    (o) => ({
      battingOrder: o.battingOrder,
      position: o.position,
      playerId: null,
      playerName: o.playerName,
      uniformNumber: o.uniformNumber,
      bats: o.bats ?? null,
    })
  );

  const myMaxOrder = Math.max(
    9,
    ...mySaved.map((s) => s.battingOrder || 0)
  );
  const oppMaxOrder = Math.max(
    9,
    params.opponentBatterCount || 9,
    ...oppSaved.map((s) => s.battingOrder || 0)
  );

  const myScores = params.myInningScores || [];
  const oppScores = params.opponentInningScores || [];
  const maxInning = Math.max(
    5,
    params.scheduledInnings || 7,
    myScores.length,
    oppScores.length
  );

  const myBatters = buildBatterSlotsFromSavedLineups(
    mySaved,
    roster,
    true,
    myMaxOrder
  );
  const oppBatters = buildBatterSlotsFromSavedLineups(
    oppSaved,
    roster,
    false,
    oppMaxOrder
  );

  const isMyTop = params.battingOrder === "first";
  const topScores = isMyTop ? myScores : oppScores;
  const botScores = isMyTop ? oppScores : myScores;

  const topInnings: ScorebookInningMeta[] = Array.from(
    { length: maxInning },
    (_, i) => ({
      inning: i + 1,
      columnCount: 1,
      runs: Math.max(0, Number(topScores[i] ?? 0) || 0),
      hits: 0,
    })
  );
  const botInnings: ScorebookInningMeta[] = Array.from(
    { length: maxInning },
    (_, i) => ({
      inning: i + 1,
      columnCount: 1,
      runs: Math.max(0, Number(botScores[i] ?? 0) || 0),
      hits: 0,
    })
  );

  const topBatters = isMyTop ? myBatters : oppBatters;
  const bottomBatters = isMyTop ? oppBatters : myBatters;

  // 表シートの投手＝裏攻撃チームの投手、裏シートの投手＝表攻撃チームの投手
  const topPitchers = buildInitialPitchersFromDefendingBatters(
    bottomBatters,
    !isMyTop,
    maxInning
  );
  const bottomPitchers = buildInitialPitchersFromDefendingBatters(
    topBatters,
    isMyTop,
    maxInning
  );

  return {
    topStructure: {
      isTop: true,
      isMyTeamBatting: isMyTop,
      batters: topBatters,
      pitchers: topPitchers,
      innings: topInnings,
      totalRuns: topInnings.reduce((s, x) => s + x.runs, 0),
      totalHits: 0,
      totalErrors: 0,
    },
    bottomStructure: {
      isTop: false,
      isMyTeamBatting: !isMyTop,
      batters: bottomBatters,
      pitchers: bottomPitchers,
      innings: botInnings,
      totalRuns: botInnings.reduce((s, x) => s + x.runs, 0),
      totalHits: 0,
      totalErrors: 0,
    },
    topAtBats: [],
    bottomAtBats: [],
  };
}

// =========================================================
// LINE試合速報（LiveReportV2Document） ➔ 清書スコアブック下書き変換
// =========================================================

const KANJI_DIR_TO_POS: Array<[RegExp, string]> = [
  [/^(?:左中|右中)/, "8"],
  [/^一二/, "4"],
  [/^(?:二遊|三遊)/, "6"],
  [/^投/, "1"],
  [/^捕/, "2"],
  [/^一/, "3"],
  [/^二/, "4"],
  [/^三/, "5"],
  [/^遊/, "6"],
  [/^左/, "7"],
  [/^中/, "8"],
  [/^右/, "9"],
];

function extractPrimaryDirectionDigit(
  playText: string,
  explicitDir?: string
): string {
  const dirSrc = (explicitDir || "").trim();
  if (/^[1-9]$/.test(dirSrc)) return dirSrc;
  for (const [re, pos] of KANJI_DIR_TO_POS) {
    if (re.test(dirSrc)) return pos;
  }
  const text = (playText || "").trim();
  for (const [re, pos] of KANJI_DIR_TO_POS) {
    if (re.test(text)) return pos;
  }
  if (text.includes("ピッチャー")) return "1";
  if (text.includes("キャッチャー")) return "2";
  if (text.includes("ファースト")) return "3";
  if (text.includes("セカンド")) return "4";
  if (text.includes("サード")) return "5";
  if (text.includes("ショート")) return "6";
  if (text.includes("レフト")) return "7";
  if (text.includes("センター")) return "8";
  if (text.includes("ライト")) return "9";
  return "";
}

function buildDefaultGroundoutThrow(posDigit: string, isForce2B: boolean, isForceHome: boolean): string {
  const p = /^[1-6]$/.test(posDigit) ? posDigit : "6";
  if (isForceHome) return p === "2" ? "2" : `${p}-2`;
  if (isForce2B) {
    if (p === "4") return "4-6";
    if (p === "6") return "6-4";
    return `${p}-4`;
  }
  if (p === "3") return "3";
  return `${p}-3`;
}

function classifyLivePlayEntry(
  entry: LiveReportPlayEntry,
  outsBefore: number,
  runnersBefore: ReadonlyArray<LiveReportBaseNum>
): {
  resultCode: CanonicalAtBatResult;
  resultLabel: string;
  battedDirection: string;
  isHit: boolean;
  isError: boolean;
  outsInPlay: number;
  rbi: number;
  balls: number;
  strikes: number;
  pitches: CanonicalPitchResult[];
} {
  const text = (entry.playText || "").trim();
  const outsAfterFirst = Math.max(0, Math.min(3, entry.outsAfter));
  const outsDelta = Math.max(0, outsAfterFirst - outsBefore);
  const posDigit = extractPrimaryDirectionDigit(text, entry.battedDirection);
  const explicitCode = (entry.resultCode || "").trim();

  // 1. 三振・振り逃げ系
  if (
    explicitCode === "dropped_third_strike" ||
    /振(?:り)?逃(?:げ)?(?:出塁|セーフ)/.test(text)
  ) {
    const isPb = /捕逸|パスボール/.test(text);
    return {
      resultCode: "dropped_third_strike",
      resultLabel: isPb ? "振り逃げ出塁 (捕逸)" : "振り逃げ出塁 (暴投)",
      battedDirection: isPb ? "K PB" : "K WP",
      isHit: false,
      isError: false,
      outsInPlay: 0,
      rbi: 0,
      balls: 0,
      strikes: 3,
      pitches: ["strike", "strike", "swinging_strike"],
    };
  }
  if (
    explicitCode === "dropped_third_strike_out" ||
    /振(?:り)?逃(?:げ)?(?:アウト|死)/.test(text)
  ) {
    return {
      resultCode: "dropped_third_strike_out",
      resultLabel: "振り逃げアウト (K 2-3)",
      battedDirection: "K 2-3",
      isHit: false,
      isError: false,
      outsInPlay: Math.max(1, outsDelta),
      rbi: 0,
      balls: 0,
      strikes: 3,
      pitches: ["strike", "strike", "swinging_strike"],
    };
  }
  if (
    explicitCode === "strikeout" ||
    /三振|スリーバント失敗/.test(text)
  ) {
    const isLooking = /見逃/.test(text);
    const is3Bunt = /スリーバント/.test(text);
    return {
      resultCode: outsDelta >= 2 ? "double_play" : "strikeout",
      resultLabel: is3Bunt
        ? "スリーバント失敗"
        : isLooking
        ? "見逃し三振"
        : text || "空振り三振",
      battedDirection: outsDelta >= 2 ? "K 2-6" : isLooking ? "K" : "SO",
      isHit: false,
      isError: false,
      outsInPlay: Math.max(1, outsDelta),
      rbi: 0,
      balls: 0,
      strikes: 3,
      pitches: is3Bunt
        ? ["strike", "strike", "bunt_foul"]
        : isLooking
        ? ["strike", "strike", "strike"]
        : ["strike", "strike", "swinging_strike"],
    };
  }

  // 2. 四死球・打撃妨害系
  if (explicitCode === "intentional_walk" || /敬遠/.test(text)) {
    const pushRbi =
      runnersBefore.length === 3 && entry.runsScored > 0 ? 1 : 0;
    return {
      resultCode: "intentional_walk",
      resultLabel: "申告敬遠",
      battedDirection: "",
      isHit: false,
      isError: false,
      outsInPlay: 0,
      rbi: typeof entry.rbi === "number" ? entry.rbi : pushRbi,
      balls: 4,
      strikes: 0,
      pitches: [],
    };
  }
  if (explicitCode === "hit_by_pitch" || /死球|デッドボール/.test(text)) {
    const pushRbi =
      runnersBefore.length === 3 && entry.runsScored > 0 ? 1 : 0;
    return {
      resultCode: "hit_by_pitch",
      resultLabel: "死球",
      battedDirection: "",
      isHit: false,
      isError: false,
      outsInPlay: 0,
      rbi: typeof entry.rbi === "number" ? entry.rbi : pushRbi,
      balls: 0,
      strikes: 0,
      pitches: ["hbp"],
    };
  }
  if (explicitCode === "interference" || /打撃妨害/.test(text)) {
    const pushRbi =
      runnersBefore.length === 3 && entry.runsScored > 0 ? 1 : 0;
    return {
      resultCode: "interference",
      resultLabel: "打撃妨害 (INT)",
      battedDirection: "INT2",
      isHit: false,
      isError: true,
      outsInPlay: 0,
      rbi: typeof entry.rbi === "number" ? entry.rbi : pushRbi,
      balls: 0,
      strikes: 0,
      pitches: ["in_play"],
    };
  }
  if (explicitCode === "walk" || /四球|フォアボール/.test(text)) {
    const pushRbi =
      runnersBefore.length === 3 && entry.runsScored > 0 ? 1 : 0;
    return {
      resultCode: "walk",
      resultLabel: "四球",
      battedDirection: "",
      isHit: false,
      isError: false,
      outsInPlay: 0,
      rbi: typeof entry.rbi === "number" ? entry.rbi : pushRbi,
      balls: 4,
      strikes: /フルカウント/.test(text) ? 2 : 0,
      pitches: /フルカウント/.test(text)
        ? ["strike", "strike", "ball", "ball", "ball", "ball"]
        : ["ball", "ball", "ball", "ball"],
    };
  }

  // 3. 安打・長打系
  if (explicitCode === "home_run" || /本塁打|ホームラン/.test(text)) {
    const isRh = /ランニング/.test(text);
    const dir = posDigit || "8";
    return {
      resultCode: "home_run",
      resultLabel: isRh ? "ランニング本塁打" : text || "本塁打",
      battedDirection: isRh ? `${dir} RH` : dir,
      isHit: true,
      isError: false,
      outsInPlay: outsDelta,
      rbi:
        typeof entry.rbi === "number"
          ? entry.rbi
          : Math.max(1, entry.runsScored),
      balls: 0,
      strikes: 0,
      pitches: ["hit"],
    };
  }
  if (explicitCode === "triple" || /三塁打|スリーベース/.test(text)) {
    return {
      resultCode: "triple",
      resultLabel: text || "三塁打",
      battedDirection: posDigit || "9",
      isHit: true,
      isError: false,
      outsInPlay: outsDelta,
      rbi: typeof entry.rbi === "number" ? entry.rbi : entry.runsScored,
      balls: 0,
      strikes: 0,
      pitches: ["hit"],
    };
  }
  if (explicitCode === "double" || /二塁打|ツーベース/.test(text)) {
    return {
      resultCode: "double",
      resultLabel: text || "二塁打",
      battedDirection: posDigit || "7",
      isHit: true,
      isError: false,
      outsInPlay: outsDelta,
      rbi: typeof entry.rbi === "number" ? entry.rbi : entry.runsScored,
      balls: 0,
      strikes: 0,
      pitches: ["hit"],
    };
  }
  if (
    explicitCode === "single" ||
    /ヒット|内野安打|バント安打|安打/.test(text)
  ) {
    return {
      resultCode: "single",
      resultLabel: text || "安打",
      battedDirection: posDigit || (/内野|バント/.test(text) ? "6" : "8"),
      isHit: true,
      isError: false,
      outsInPlay: outsDelta,
      rbi: typeof entry.rbi === "number" ? entry.rbi : entry.runsScored,
      balls: 0,
      strikes: 0,
      pitches: ["hit"],
    };
  }

  // 4. 犠打・犠飛系
  if (
    (explicitCode === "sac_bunt" ||
      /送りバント|犠打|スクイズ/.test(text)) &&
    !/失敗|封殺|小飛球/.test(text)
  ) {
    const p = /^[1-6]$/.test(posDigit) ? posDigit : "1";
    const throwDir = p === "3" ? "3-4" : `${p}-3`;
    return {
      resultCode: outsDelta === 0 ? "fc" : "sac_bunt",
      resultLabel: text || "犠打",
      battedDirection: outsDelta === 0 ? `${p}FC` : throwDir,
      isHit: false,
      isError: false,
      outsInPlay: outsDelta,
      rbi: typeof entry.rbi === "number" ? entry.rbi : entry.runsScored,
      balls: 0,
      strikes: 0,
      pitches: ["in_play"],
    };
  }
  if (explicitCode === "sac_fly" || /犠飛|犠牲フライ/.test(text)) {
    const dir = /^[7-9]$/.test(posDigit) ? posDigit : posDigit || "8";
    return {
      resultCode: "sac_fly",
      resultLabel: text || "犠飛",
      battedDirection: `F${dir}`,
      isHit: false,
      isError: false,
      outsInPlay: Math.max(1, outsDelta),
      rbi:
        typeof entry.rbi === "number"
          ? entry.rbi
          : Math.max(1, entry.runsScored),
      balls: 0,
      strikes: 0,
      pitches: ["in_play"],
    };
  }

  // 5. 失策・野選（SKILL.md: 封殺アウトがあるゴロは必ず groundout にし fc を禁止）
  if (explicitCode === "error" || /エラー|失策|悪送球|後逸|落球/.test(text)) {
    const ep = posDigit || "6";
    const isThrowErr = /悪送球/.test(text);
    return {
      resultCode: "error",
      resultLabel: text || "失策出塁",
      battedDirection: isThrowErr ? `${ep}E` : `E${ep}`,
      isHit: false,
      isError: true,
      outsInPlay: outsDelta,
      rbi: 0,
      balls: 0,
      strikes: 0,
      pitches: ["in_play"],
    };
  }
  if ((explicitCode === "fc" || /野選|オールセーフ/.test(text)) && outsDelta === 0) {
    const fp = posDigit || "6";
    return {
      resultCode: "fc",
      resultLabel: text || "野選",
      battedDirection: `${fp}FC`,
      isHit: false,
      isError: false,
      outsInPlay: 0,
      rbi: typeof entry.rbi === "number" ? entry.rbi : entry.runsScored,
      balls: 0,
      strikes: 0,
      pitches: ["in_play"],
    };
  }

  // 6. 併殺・三重殺・インフィールドフライ・飛球・ライナー・ゴロ
  if (outsDelta >= 3 || explicitCode === "triple_play") {
    return {
      resultCode: "triple_play",
      resultLabel: text || "三重殺",
      battedDirection: posDigit ? `${posDigit}-4-3` : "5-4-3",
      isHit: false,
      isError: false,
      outsInPlay: 3,
      rbi: 0,
      balls: 0,
      strikes: 0,
      pitches: ["in_play"],
    };
  }
  if (
    outsDelta === 2 ||
    explicitCode === "double_play" ||
    /併殺|ゲッツー/.test(text)
  ) {
    const isAerial = /ライナー|フライ|飛/.test(text);
    const p = posDigit || "6";
    const dpDir = isAerial
      ? `L${p}`
      : p === "4"
      ? "4-6-3"
      : p === "5"
      ? "5-4-3"
      : p === "1"
      ? "1-6-3"
      : "6-4-3";
    return {
      resultCode: "double_play",
      resultLabel: text || "併殺打",
      battedDirection: dpDir,
      isHit: false,
      isError: false,
      outsInPlay: 2,
      rbi: isAerial ? entry.runsScored : 0,
      balls: 0,
      strikes: 0,
      pitches: ["in_play"],
    };
  }

  // インフィールドフライ（SKILL.md: 外野 7・8・9 付与厳禁）
  if (explicitCode === "infield_fly" || /インフィールドフライ/.test(text)) {
    const safeIfPos = /^[1-6]$/.test(posDigit) ? posDigit : "IF";
    return {
      resultCode: "infield_fly",
      resultLabel: "インフィールドフライ",
      battedDirection: safeIfPos === "IF" ? "IF" : `${safeIfPos}IF`,
      isHit: false,
      isError: false,
      outsInPlay: Math.max(1, outsDelta),
      rbi: 0,
      balls: 0,
      strikes: 0,
      pitches: ["in_play"],
    };
  }

  // ライナー・フライ・ファウルフライ（lineoutは CanonicalAtBatResult になく flyout にマッピング）
  if (
    explicitCode === "flyout" ||
    /フライ|ライナー|飛|邪飛|直/.test(text)
  ) {
    const isLiner = /ライナー|直/.test(text);
    const isFoul = /邪|ファウル/.test(text);
    const p = posDigit || "8";
    const dirToken = isLiner ? `L${p}` : isFoul ? `FF${p}` : `F${p}`;
    return {
      resultCode: "flyout",
      resultLabel: text || (isLiner ? "ライナー" : "飛球"),
      battedDirection: dirToken,
      isHit: false,
      isError: false,
      outsInPlay: Math.max(1, outsDelta),
      rbi: typeof entry.rbi === "number" ? entry.rbi : entry.runsScored,
      balls: 0,
      strikes: 0,
      pitches: ["in_play"],
    };
  }

  // デフォルト：ゴロ / 封殺ゴロ（outsDelta === 1）
  const isForce2B = /二封|フォース/.test(text) || (runnersBefore.includes(1) && entry.runnersAfter.includes(1));
  const isForceHome = /本封|ホームフォース/.test(text);
  const throwChain = buildDefaultGroundoutThrow(posDigit, isForce2B, isForceHome);
  return {
    resultCode: "groundout",
    resultLabel: text || "内ゴロ",
    battedDirection: throwChain,
    isHit: false,
    isError: false,
    outsInPlay: Math.max(1, outsDelta),
    rbi: typeof entry.rbi === "number" ? entry.rbi : entry.runsScored,
    balls: 0,
    strikes: 0,
    pitches: ["in_play"],
  };
}

function baseNumToCode(b: LiveReportBaseNum): "1B" | "2B" | "3B" {
  if (b === 1) return "1B";
  if (b === 2) return "2B";
  return "3B";
}

function inferAdvanceMethodForBatter(
  rc: CanonicalAtBatResult,
  playText: string
): AdvanceMethodCode {
  if (rc === "single" || rc === "double" || rc === "triple" || rc === "home_run") {
    return "hit";
  }
  if (
    rc === "walk" ||
    rc === "intentional_walk" ||
    rc === "hit_by_pitch" ||
    rc === "interference"
  ) {
    return "walk";
  }
  if (rc === "error") return "error";
  if (rc === "sac_bunt" || rc === "sac_fly") return "sac";
  if (rc === "dropped_third_strike") {
    return /捕逸/.test(playText) ? "pb" : "wp";
  }
  return "fc";
}

function synthesizePlayAdvances(params: {
  abId: string;
  batterName: string;
  resultCode: CanonicalAtBatResult;
  playText: string;
  outsBefore: number;
  outsAfterPrimary: number;
  runnersBefore: ReadonlyArray<LiveReportBaseNum>;
  runnerNamesBefore: Partial<Record<LiveReportBaseNum, string>>;
  runnersAfterPrimary: ReadonlyArray<LiveReportBaseNum>;
  primaryRunsScored: number;
  chainedPlays: LiveReportPlayEntry["chainedPlays"];
}): {
  advances: ScorebookV2Advance[];
  nextRunnerNames: Partial<Record<LiveReportBaseNum, string>>;
  totalOutsDelta: number;
  totalRunsInPlay: number;
} {
  const advances: ScorebookV2Advance[] = [];
  let advSeq = 1;
  const primaryMethod = inferAdvanceMethodForBatter(
    params.resultCode,
    params.playText
  );

  const prevSortedDesc = [...params.runnersBefore].sort((a, b) => b - a);
  const afterPrimary =
    params.outsAfterPrimary >= 3
      ? []
      : normalizeRunnersList(params.runnersAfterPrimary);
  const primaryOutsDelta = Math.max(
    0,
    params.outsAfterPrimary - params.outsBefore
  );

  // Batter target base on primary play
  let batterDest: "1B" | "2B" | "3B" | "HP" | null = null;
  let batterIsOut = false;
  if (params.resultCode === "home_run") {
    batterDest = "HP";
  } else if (params.resultCode === "triple") {
    batterDest = "3B";
  } else if (params.resultCode === "double") {
    batterDest = "2B";
  } else if (
    params.resultCode === "single" ||
    params.resultCode === "walk" ||
    params.resultCode === "intentional_walk" ||
    params.resultCode === "hit_by_pitch" ||
    params.resultCode === "interference" ||
    params.resultCode === "error" ||
    params.resultCode === "fc" ||
    params.resultCode === "dropped_third_strike"
  ) {
    batterDest = "1B";
  } else if (
    params.resultCode === "groundout" &&
    primaryOutsDelta === 1 &&
    afterPrimary.includes(1) &&
    params.runnersBefore.length > 0
  ) {
    // 先行走者封殺による一塁残塁
    batterDest = "1B";
  } else {
    batterIsOut = primaryOutsDelta > 0;
  }

  // Remaining bases after reserving batter's base
  const remainingAfterDesc = [...afterPrimary]
    .filter((b) => !(batterDest && baseNumToCode(b) === batterDest))
    .sort((a, b) => b - a);

  let runsLeftToAssign = Math.max(
    0,
    params.primaryRunsScored - (batterDest === "HP" ? 1 : 0)
  );
  let runnerOutsLeft = Math.max(
    0,
    primaryOutsDelta - (batterIsOut ? 1 : 0)
  );

  const primaryRunnerNames: Partial<Record<LiveReportBaseNum, string>> = {};
  if (batterDest && batterDest !== "HP") {
    const bNum: LiveReportBaseNum =
      batterDest === "1B" ? 1 : batterDest === "2B" ? 2 : 3;
    primaryRunnerNames[bNum] = params.batterName;
  }

  let remIdx = 0;
  for (const fromB of prevSortedDesc) {
    const rName = params.runnerNamesBefore[fromB] || `${fromB}塁走者`;
    const fromCode = baseNumToCode(fromB);
    if (runsLeftToAssign > 0) {
      runsLeftToAssign -= 1;
      advances.push({
        id: `${params.abId}-adv-${advSeq++}`,
        runnerName: rName,
        from: fromCode,
        to: "HP",
        method: primaryMethod,
        isOut: false,
      });
    } else if (remIdx < remainingAfterDesc.length) {
      const toB = remainingAfterDesc[remIdx++]!;
      primaryRunnerNames[toB] = rName;
      if (toB !== fromB) {
        advances.push({
          id: `${params.abId}-adv-${advSeq++}`,
          runnerName: rName,
          from: fromCode,
          to: baseNumToCode(toB),
          method: primaryMethod,
          isOut: false,
        });
      }
    } else if (runnerOutsLeft > 0) {
      runnerOutsLeft -= 1;
      const outTo: "2B" | "3B" | "HP" =
        fromB === 1 ? "2B" : fromB === 2 ? "3B" : "HP";
      advances.push({
        id: `${params.abId}-adv-${advSeq++}`,
        runnerName: rName,
        from: fromCode,
        to: outTo,
        method: primaryMethod === "hit" ? "out_on_base" : "fc",
        isOut: true,
      });
    }
  }

  if (batterDest) {
    advances.push({
      id: `${params.abId}-adv-${advSeq++}`,
      runnerName: params.batterName,
      from: "BAT",
      to: batterDest,
      method: primaryMethod,
      isOut: false,
    });
  }

  // Chained plays (steals, WP, PB, balk, caught stealing, pickoff)
  let curOuts = params.outsAfterPrimary;
  let curRunners = afterPrimary;
  let curNames: Partial<Record<LiveReportBaseNum, string>> = {
    ...primaryRunnerNames,
  };
  let extraRuns = 0;

  for (const cp of params.chainedPlays || []) {
    const cpText = (cp.playText || "").trim();
    const cpOutsAfter = Math.max(curOuts, Math.min(3, cp.outsAfter));
    const cpOutsDelta = Math.max(0, cpOutsAfter - curOuts);
    const cpRunnersAfter =
      cpOutsAfter >= 3 ? [] : normalizeRunnersList(cp.runnersAfter);
    const cpRuns = Math.max(0, cp.runsScored || 0);
    extraRuns += cpRuns;

    const cpMethod: AdvanceMethodCode = /牽制死|飛び出し/.test(cpText)
      ? "pickoff_out"
      : /盗塁死|盗塁刺|タッチアウト/.test(cpText) && cpOutsDelta > 0
      ? "caught_stealing"
      : /盗|スチール/.test(cpText)
      ? "steal"
      : /暴投|ワイルドピッチ/.test(cpText)
      ? "wp"
      : /捕逸|パスボール/.test(cpText)
      ? "pb"
      : /ボーク/.test(cpText)
      ? "balk"
      : /エラー|悪送球|失策/.test(cpText)
      ? "error"
      : "other";

    const curDesc = [...curRunners].sort((a, b) => b - a);
    const nextDesc = [...cpRunnersAfter].sort((a, b) => b - a);
    let cpRunsLeft = cpRuns;
    let cpOutsLeft = cpOutsDelta;
    let nextIdx = 0;
    const nextNames: Partial<Record<LiveReportBaseNum, string>> = {};

    for (const fb of curDesc) {
      const rName = curNames[fb] || `${fb}塁走者`;
      const fCode = baseNumToCode(fb);
      if (cpRunsLeft > 0) {
        cpRunsLeft -= 1;
        advances.push({
          id: `${params.abId}-adv-${advSeq++}`,
          runnerName: rName,
          from: fCode,
          to: "HP",
          method: cpMethod,
          isOut: false,
          pitchNumber: 0,
        });
      } else if (nextIdx < nextDesc.length) {
        const tb = nextDesc[nextIdx++]!;
        nextNames[tb] = rName;
        if (tb !== fb) {
          advances.push({
            id: `${params.abId}-adv-${advSeq++}`,
            runnerName: rName,
            from: fCode,
            to: baseNumToCode(tb),
            method: cpMethod,
            isOut: false,
            pitchNumber: 0,
          });
        }
      } else if (cpOutsLeft > 0) {
        cpOutsLeft -= 1;
        const outTo: "2B" | "3B" | "HP" =
          fb === 1 ? "2B" : fb === 2 ? "3B" : "HP";
        advances.push({
          id: `${params.abId}-adv-${advSeq++}`,
          runnerName: rName,
          from: fCode,
          to: outTo,
          method:
            cpMethod === "caught_stealing" || cpMethod === "pickoff_out"
              ? cpMethod
              : "out_on_base",
          isOut: true,
          pitchNumber: 0,
        });
      }
    }

    curOuts = cpOutsAfter;
    curRunners = cpRunnersAfter;
    curNames = cpOutsAfter >= 3 ? {} : nextNames;
  }

  return {
    advances,
    nextRunnerNames: curOuts >= 3 ? {} : curNames,
    totalOutsDelta: Math.max(0, curOuts - params.outsBefore),
    totalRunsInPlay: params.primaryRunsScored + extraRuns,
  };
}

/**
 * LINE試合速報（LiveReportV2Document）から清書スコアブック下書き（STEP 2/3 用）を1タップ生成する（AI課金ゼロ）。
 */
export function convertLiveReportToScorebookDraft(params: {
  doc: LiveReportV2Document;
  rosterPlayers?: ReadonlyArray<ScorebookRosterPlayer>;
  savedMyLineup?: ReadonlyArray<SavedMatchLineupInput>;
  savedOpponentLineup?: ReadonlyArray<SavedOpponentLineupInput>;
}): ScorebookDraftBundleOutput {
  const { doc } = params;
  const roster = params.rosterPlayers || [];
  const isMyTop = doc.battingOrder === "first";

  // 1. 自チーム打順（doc.lineup 優先、空なら savedMyLineup フォールバック）
  const hasDocLineup = doc.lineup.some((s) => (s.playerName || "").trim().length > 0);
  const mySlotCount = Math.max(
    9,
    doc.lineup.length,
    ...(params.savedMyLineup || []).map((s) => s.battingOrder || 0),
    ...doc.halfInnings
      .filter((h) => isMyTeamBattingHalf(doc.battingOrder, h.isBottom))
      .flatMap((h) => h.entries.map((e) => e.battingOrder || 0))
  );

  const myBatters: ScorebookBatterSlot[] = hasDocLineup
    ? Array.from({ length: mySlotCount }, (_, idx) => {
        const order = idx + 1;
        const slot = doc.lineup.find((s) => s.order === order);
        const matched = findRosterPlayer(
          roster,
          slot?.playerId,
          slot?.playerName
        );
        const subs: ScorebookSubstitution[] = (slot?.substitutions || [])
          .filter((sr) => sr.subType !== "TR" && sr.newName.trim().length > 0)
          .map((sr, sIdx) => {
            const subMatched = findRosterPlayer(
              roster,
              sr.playerId,
              sr.newName
            );
            const mappedSubType: "PH" | "PR" | "DEF" =
              sr.subType === "PH"
                ? "PH"
                : sr.subType === "PR"
                ? "PR"
                : "DEF";
            return {
              id: sr.id || `sub-${order}-${sIdx + 1}`,
              inningEntered: Math.max(1, sr.inning || 1),
              subType: mappedSubType,
              name: (subMatched?.name || sr.newName).trim(),
              uniformNumber: subMatched?.uniformNumber || "",
              position: normalizePosToDigitOrDh(
                sr.newPosition || slot?.position || ""
              ),
              playerId: sr.playerId || subMatched?.id || null,
              bats: normalizeBatsCode(subMatched?.bats),
            };
          });
        return {
          battingOrder: order,
          name: (matched?.name || slot?.playerName || "").trim(),
          uniformNumber: matched?.uniformNumber || "",
          position: normalizePosToDigitOrDh(
            slot?.position || (order <= 9 ? String(order) : "DH")
          ),
          playerId: slot?.playerId || matched?.id || null,
          bats: normalizeBatsCode(matched?.bats),
          substitutions: subs,
        };
      })
    : buildBatterSlotsFromSavedLineups(
        params.savedMyLineup || [],
        roster,
        true,
        mySlotCount
      );

  // 2. 相手チーム打順（9〜25人対応）
  const fallbackDocOppLineup = (doc.opponentLineup || []).map((o) => ({
    battingOrder: o.order,
    position: o.position,
    playerName: o.playerName,
    uniformNumber: o.uniformNumber || "",
    bats: null,
  }));
  const effectiveSavedOpp =
    params.savedOpponentLineup && params.savedOpponentLineup.length > 0
      ? params.savedOpponentLineup
      : fallbackDocOppLineup;

  const maxRecordedOppOrder = Math.max(
    9,
    doc.opponentBatterCount || 9,
    ...effectiveSavedOpp.map((o) => o.battingOrder || 0),
    ...doc.halfInnings
      .filter((h) => !isMyTeamBattingHalf(doc.battingOrder, h.isBottom))
      .flatMap((h) => h.entries.map((e) => e.battingOrder || 0))
  );
  const oppBatters = buildBatterSlotsFromSavedLineups(
    effectiveSavedOpp.map((o) => ({
      battingOrder: o.battingOrder,
      position: o.position,
      playerId: null,
      playerName: o.playerName,
      uniformNumber: o.uniformNumber,
      bats: o.bats ?? null,
    })),
    roster,
    false,
    maxRecordedOppOrder
  );

  // 3. イニング範囲の決定
  const maxInning = Math.max(
    5,
    doc.regulationInnings || 7,
    ...doc.halfInnings.map((h) => h.inning || 1)
  );

  // 4. 自チーム投手継投スティント構築（先発投手 ＋ DH専任投手 ＋ subType === "P" または守備位置 "1" への交代）
  const myPitchers: ScorebookPitcherStint[] = [];
  const starterPitcherSlot = myBatters.find(
    (b) => normalizePosToDigitOrDh(b.position) === "1"
  );
  if (starterPitcherSlot && starterPitcherSlot.name) {
    myPitchers.push({
      id: "my-p-1",
      order: 1,
      name: starterPitcherSlot.name,
      uniformNumber: starterPitcherSlot.uniformNumber || "",
      playerId: starterPitcherSlot.playerId || null,
      fromInning: 1,
      fromBatterOrder: null,
      toInning: maxInning,
      manualDecision: null,
    });
  } else if (doc.dhStarterPitcher && doc.dhStarterPitcher.playerName.trim()) {
    const matchedDhP = findRosterPlayer(
      roster,
      doc.dhStarterPitcher.playerId,
      doc.dhStarterPitcher.playerName
    );
    myPitchers.push({
      id: "my-p-1",
      order: 1,
      name: (matchedDhP?.name || doc.dhStarterPitcher.playerName).trim(),
      uniformNumber:
        doc.dhStarterPitcher.uniformNumber || matchedDhP?.uniformNumber || "",
      playerId: doc.dhStarterPitcher.playerId || matchedDhP?.id || null,
      fromInning: 1,
      fromBatterOrder: null,
      toInning: maxInning,
      manualDecision: null,
    });
  } else {
    myPitchers.push({
      id: "my-p-1",
      order: 1,
      name: "",
      uniformNumber: "",
      playerId: null,
      fromInning: 1,
      fromBatterOrder: null,
      toInning: maxInning,
      manualDecision: null,
    });
  }

  // 時系列順に投手交代を収集
  const pitcherChanges: Array<{
    inning: number;
    isBottom: boolean;
    name: string;
    uniformNumber: string;
    playerId: string | null;
  }> = [];
  for (const slot of doc.lineup) {
    for (const sr of slot.substitutions) {
      if (
        (sr.subType === "P" || normalizeReportPositionCode(sr.newPosition) === "1") &&
        sr.newName.trim()
      ) {
        const matched = findRosterPlayer(roster, sr.playerId, sr.newName);
        const fullName = (matched?.name || sr.newName).trim();
        pitcherChanges.push({
          inning: Math.max(1, sr.inning || 1),
          isBottom: sr.isBottom,
          name: fullName,
          uniformNumber: matched?.uniformNumber || "",
          playerId: sr.playerId || matched?.id || null,
        });
      }
    }
  }
  pitcherChanges.sort((a, b) =>
    compareHalfInningOrder(a.inning, a.isBottom, b.inning, b.isBottom)
  );
  for (const pc of pitcherChanges) {
    const prevStint = myPitchers[myPitchers.length - 1];
    if (prevStint && compactName(prevStint.name) === compactName(pc.name)) {
      continue;
    }
    if (prevStint && !prevStint.name) {
      prevStint.name = pc.name;
      prevStint.uniformNumber = pc.uniformNumber;
      prevStint.playerId = pc.playerId;
      continue;
    }
    if (prevStint) {
      prevStint.toInning = Math.max(prevStint.fromInning, pc.inning);
    }
    myPitchers.push({
      id: `my-p-${myPitchers.length + 1}`,
      order: myPitchers.length + 1,
      name: pc.name,
      uniformNumber: pc.uniformNumber,
      playerId: pc.playerId,
      fromInning: pc.inning,
      fromBatterOrder: null,
      toInning: maxInning,
      manualDecision: null,
    });
  }

  const oppPitchers = buildInitialPitchersFromDefendingBatters(
    oppBatters,
    false,
    maxInning
  );

  // 5. 表・裏それぞれの打席リストとイニング集計を構築
  const buildSideData = (targetIsTop: boolean) => {
    const isMyBatting = isMyTop ? targetIsTop : !targetIsTop;
    const sideBatters = isMyBatting ? myBatters : oppBatters;
    const defendingPitchers = isMyBatting ? oppPitchers : myPitchers;
    const lineupLen = Math.max(9, sideBatters.length);

    const sideHalves = doc.halfInnings
      .filter((h) => h.isBottom === !targetIsTop)
      .sort((a, b) => a.inning - b.inning);

    const atBats: ScorebookV2AtBat[] = [];
    const inningMetas: ScorebookInningMeta[] = [];
    let totalHits = 0;
    let totalRuns = 0;

    for (let inn = 1; inn <= maxInning; inn++) {
      const half = sideHalves.find((h) => h.inning === inn);
      if (!half) {
        inningMetas.push({ inning: inn, columnCount: 1, runs: 0, hits: 0 });
        continue;
      }

      let curOuts = 0;
      let curRunners: LiveReportBaseNum[] = [];
      let curRunnerNames: Partial<Record<LiveReportBaseNum, string>> = {};
      let pendingPinchRunners: ScorebookPinchRunnerEntry[] = [];
      const seenOrdersInCol = new Set<number>();
      let colIdx = 1;
      let innHits = 0;
      let innAtBatCount = 0;

      const activePitcher =
        [...defendingPitchers]
          .reverse()
          .find((p) => inn >= p.fromInning && inn <= p.toInning) ||
        defendingPitchers[0];

      for (const entry of half.entries) {
        if (entry.entryType === "substitution") {
          const sm = entry.subMeta;
          if (sm && (sm.subType === "PR" || sm.subType === "TR") && sm.newName) {
            const matchedPr = isMyBatting
              ? findRosterPlayer(roster, sm.playerId, sm.newName)
              : undefined;
            const bNum: LiveReportBaseNum =
              sm.runnerBase && curRunners.includes(sm.runnerBase)
                ? sm.runnerBase
                : curRunners[0] || 1;
            const resolvedPrName = (matchedPr?.name || sm.newName).trim();
            curRunnerNames[bNum] = resolvedPrName;
            pendingPinchRunners.push({
              base: baseNumToCode(bNum),
              subType: sm.subType === "TR" ? "TR" : "PR",
              battingOrder: sm.slotOrder || 1,
              replacedName: sm.oldName || "",
              name: resolvedPrName,
              uniformNumber: matchedPr?.uniformNumber || "",
              playerId: sm.playerId || matchedPr?.id || null,
            });
          }
          continue;
        }
        if (entry.entryType !== "batter") continue;

        if (curOuts >= 3) {
          curOuts = 0;
          curRunners = [];
          curRunnerNames = {};
        }

        const order =
          entry.battingOrder >= 1 && entry.battingOrder <= lineupLen
            ? entry.battingOrder
            : ((innAtBatCount % lineupLen) + 1);
        if (seenOrdersInCol.has(order)) {
          colIdx += 1;
          seenOrdersInCol.clear();
        }
        seenOrdersInCol.add(order);

        const slot = sideBatters.find((b) => b.battingOrder === order);
        const matchedBatter = isMyBatting
          ? findRosterPlayer(roster, entry.batterPlayerId, entry.batterName)
          : undefined;
        const resolvedBatterName = isMyBatting
          ? (
              matchedBatter?.name ||
              entry.batterName ||
              slot?.name ||
              `${order}番`
            ).trim()
          : (slot?.name || `相手${order}番`).trim();
        const resolvedBatterId = isMyBatting
          ? entry.batterPlayerId || matchedBatter?.id || slot?.playerId || null
          : null;

        const abId = `live-${targetIsTop ? "t" : "b"}-${inn}-${innAtBatCount + 1}`;
        const classified = classifyLivePlayEntry(entry, curOuts, curRunners);

        // イニング先頭打席でタイブレーク走者が推測されるケースの自動補完
        const extraPreAdvances: ScorebookV2Advance[] = [];
        if (
          innAtBatCount === 0 &&
          curRunners.length === 0 &&
          inn > (doc.regulationInnings || 7) &&
          (entry.runsScored >= 2 && classified.resultCode !== "home_run")
        ) {
          const prev1Order = ((order - 2 + lineupLen) % lineupLen) + 1;
          const prev2Order = ((order - 3 + lineupLen) % lineupLen) + 1;
          const p1Name =
            sideBatters.find((b) => b.battingOrder === prev1Order)?.name ||
            `${prev1Order}番`;
          const p2Name =
            sideBatters.find((b) => b.battingOrder === prev2Order)?.name ||
            `${prev2Order}番`;
          curRunners = [1, 2];
          curRunnerNames = { 1: p1Name, 2: p2Name };
          extraPreAdvances.push(
            {
              id: `${abId}-tb-2b`,
              runnerName: p2Name,
              from: "BAT",
              to: "2B",
              method: "tiebreak",
              isOut: false,
            },
            {
              id: `${abId}-tb-1b`,
              runnerName: p1Name,
              from: "BAT",
              to: "1B",
              method: "tiebreak",
              isOut: false,
            }
          );
        }

        const synth = synthesizePlayAdvances({
          abId,
          batterName: resolvedBatterName,
          resultCode: classified.resultCode,
          playText: entry.playText,
          outsBefore: curOuts,
          outsAfterPrimary: entry.outsAfter,
          runnersBefore: curRunners,
          runnerNamesBefore: curRunnerNames,
          runnersAfterPrimary: entry.runnersAfter,
          primaryRunsScored: Math.max(
            0,
            entry.runsScored -
              (entry.chainedPlays || []).reduce(
                (s, cp) => s + (cp.runsScored || 0),
                0
              )
          ),
          chainedPlays: entry.chainedPlays || [],
        });

        const finalEndingOuts = Math.min(3, curOuts + synth.totalOutsDelta);
        const resolvedPitchState = (() => {
          const basePitches = classified.pitches;
          const terminalPitch: CanonicalPitchResult =
            basePitches.length > 0
              ? basePitches[basePitches.length - 1]
              : classified.isHit
                ? "hit"
                : "in_play";
          const recordedSeq = Array.isArray(entry.pitches) ? entry.pitches : [];
          const explicitCount =
            typeof entry.pitchCount === "number" &&
            Number.isFinite(entry.pitchCount) &&
            entry.pitchCount > 0
              ? Math.floor(entry.pitchCount)
              : null;

          if (recordedSeq.length === 0 && explicitCount === null) {
            return {
              pitches: basePitches,
              balls: classified.balls,
              strikes: classified.strikes,
            };
          }

          let mapped: CanonicalPitchResult[] = [];
          if (recordedSeq.length > 0) {
            mapped = recordedSeq.map((pt: LiveReportPitchType, idx: number) => {
              const isLast = idx === recordedSeq.length - 1;
              if (isLast && basePitches.length > 0) {
                return terminalPitch;
              }
              if (pt === "ball") return "ball";
              if (pt === "strike") return "strike";
              return "foul";
            });
            if (explicitCount !== null && explicitCount > mapped.length) {
              const padCount = explicitCount - mapped.length;
              const prefix = mapped.slice(0, Math.max(0, mapped.length - 1));
              const tail =
                mapped.length > 0 ? [mapped[mapped.length - 1]] : [terminalPitch];
              mapped = [
                ...prefix,
                ...Array.from({ length: padCount }, (): CanonicalPitchResult => "foul"),
                ...tail,
              ];
            }
          } else if (explicitCount !== null) {
            if (basePitches.length === 0) {
              mapped = [
                ...Array.from(
                  { length: Math.max(0, explicitCount - 1) },
                  (): CanonicalPitchResult => "foul"
                ),
                terminalPitch,
              ];
            } else if (explicitCount === basePitches.length) {
              mapped = [...basePitches];
            } else if (explicitCount > basePitches.length) {
              const padCount = explicitCount - basePitches.length;
              mapped = [
                ...basePitches.slice(0, basePitches.length - 1),
                ...Array.from({ length: padCount }, (): CanonicalPitchResult => "foul"),
                basePitches[basePitches.length - 1],
              ];
            } else {
              mapped = basePitches.slice(basePitches.length - explicitCount);
            }
          }

          let balls = 0;
          let strikes = 0;
          const countLimit = Math.max(0, mapped.length - 1);
          for (let i = 0; i < countLimit; i += 1) {
            const code = mapped[i];
            if (code === "ball") {
              balls = Math.min(3, balls + 1);
            } else if (code === "strike" || code === "swinging_strike") {
              strikes = Math.min(2, strikes + 1);
            } else if (code === "foul" || code === "bunt_foul") {
              if (strikes < 2) strikes += 1;
            }
          }
          if (
            classified.resultCode === "walk" ||
            classified.resultCode === "intentional_walk"
          ) {
            balls = Math.max(balls, Math.min(4, classified.balls));
          } else if (
            classified.resultCode === "strikeout" ||
            classified.resultCode === "dropped_third_strike" ||
            classified.resultCode === "dropped_third_strike_out"
          ) {
            strikes = Math.max(strikes, Math.min(3, classified.strikes));
          }

          return { pitches: mapped, balls, strikes };
        })();

        let rawAb: ScorebookV2AtBat = {
          id: abId,
          inning: inn,
          isTop: targetIsTop,
          columnIndex: colIdx,
          battingOrder: order,
          batterName: resolvedBatterName,
          batterPlayerId: resolvedBatterId,
          pitcherName:
            (!isMyBatting && entry.pitcherName?.trim()) ||
            activePitcher?.name ||
            (isMyBatting ? "相手投手" : ""),
          pitcherPlayerId:
            !isMyBatting && entry.pitcherPlayerId !== undefined
              ? entry.pitcherPlayerId
              : activePitcher?.playerId || null,
          resultCode: classified.resultCode,
          resultLabel: classified.resultLabel,
          battedDirection: classified.battedDirection,
          rbi: Math.min(synth.totalRunsInPlay, Math.max(0, classified.rbi)),
          outsInPlay: synth.totalOutsDelta,
          endingOuts: finalEndingOuts,
          runsInPlay: synth.totalRunsInPlay,
          balls: resolvedPitchState.balls,
          strikes: resolvedPitchState.strikes,
          pitches: resolvedPitchState.pitches,
          advances: [...extraPreAdvances, ...synth.advances],
          pinchRunners:
            pendingPinchRunners.length > 0 ? pendingPinchRunners : undefined,
          confidence: "high",
        };
        rawAb = normalizeLegacyInfieldFlyAtBat(
          normalizeLegacyForceOutAtBat(rawAb)
        );

        atBats.push(rawAb);
        pendingPinchRunners = [];
        innAtBatCount += 1;
        if (classified.isHit) {
          innHits += 1;
          totalHits += 1;
        }

        const lastChain =
          entry.chainedPlays && entry.chainedPlays.length > 0
            ? entry.chainedPlays[entry.chainedPlays.length - 1]
            : null;
        curOuts = finalEndingOuts;
        curRunners =
          curOuts >= 3
            ? []
            : normalizeRunnersList(
                lastChain ? lastChain.runnersAfter : entry.runnersAfter
              );
        curRunnerNames = synth.nextRunnerNames;
      }

      const innRuns = getHalfInningRuns(half);
      totalRuns += innRuns;
      inningMetas.push({
        inning: inn,
        columnCount: Math.max(1, colIdx),
        runs: innRuns,
        hits: innHits,
      });
    }

    // 速報での手動球数微調整（+1/-1）を該当投手の打席球数配列へ反映
    const pitchAdjustments = doc.pitcherPitchAdjustments || {};
    if (!isMyBatting && atBats.length > 0) {
      for (const [adjKey, rawDelta] of Object.entries(pitchAdjustments)) {
        if (!Number.isFinite(rawDelta) || rawDelta === 0 || adjKey === "__opponent__") {
          continue;
        }
        const delta = Math.trunc(rawDelta);
        const matchingIndices: number[] = [];
        for (let idx = 0; idx < atBats.length; idx += 1) {
          const ab = atBats[idx];
          const key = toLivePitcherKey(ab.pitcherPlayerId, ab.pitcherName);
          if (key === adjKey) {
            matchingIndices.push(idx);
          }
        }
        if (matchingIndices.length === 0) continue;
        if (delta > 0) {
          const lastIdx = matchingIndices[matchingIndices.length - 1];
          const targetAb = atBats[lastIdx];
          const curPitches = targetAb.pitches || [];
          const nextPitches: CanonicalPitchResult[] =
            curPitches.length > 0
              ? [
                  ...curPitches.slice(0, curPitches.length - 1),
                  ...Array.from({ length: delta }, (): CanonicalPitchResult => "foul"),
                  curPitches[curPitches.length - 1],
                ]
              : Array.from({ length: delta }, (): CanonicalPitchResult => "foul");
          atBats[lastIdx] = { ...targetAb, pitches: nextPitches };
        } else {
          let remainingToTrim = Math.abs(delta);
          for (
            let m = matchingIndices.length - 1;
            m >= 0 && remainingToTrim > 0;
            m -= 1
          ) {
            const abIdx = matchingIndices[m];
            const targetAb = atBats[abIdx];
            const curPitches = targetAb.pitches || [];
            if (curPitches.length <= 1) continue;
            const trimCount = Math.min(remainingToTrim, curPitches.length - 1);
            const nextPitches = [
              ...curPitches.slice(0, curPitches.length - 1 - trimCount),
              curPitches[curPitches.length - 1],
            ];
            atBats[abIdx] = { ...targetAb, pitches: nextPitches };
            remainingToTrim -= trimCount;
          }
        }
      }
    } else if (isMyBatting && atBats.length > 0) {
      const oppDelta = Math.trunc(pitchAdjustments["__opponent__"] || 0);
      if (oppDelta > 0) {
        const lastIdx = atBats.length - 1;
        const targetAb = atBats[lastIdx];
        const curPitches = targetAb.pitches || [];
        const nextPitches: CanonicalPitchResult[] =
          curPitches.length > 0
            ? [
                ...curPitches.slice(0, curPitches.length - 1),
                ...Array.from({ length: oppDelta }, (): CanonicalPitchResult => "foul"),
                curPitches[curPitches.length - 1],
              ]
            : Array.from({ length: oppDelta }, (): CanonicalPitchResult => "foul");
        atBats[lastIdx] = { ...targetAb, pitches: nextPitches };
      }
    }

    const structure: ScorebookSheetStructure = {
      isTop: targetIsTop,
      isMyTeamBatting: isMyBatting,
      batters: sideBatters,
      pitchers: defendingPitchers,
      innings: inningMetas,
      totalRuns,
      totalHits,
      totalErrors: 0,
    };

    const synced = syncSheetAtBatsWithStructure(atBats, structure);
    const reconciled = reconcileSheetExcessOutsDeterministically(
      synced,
      structure
    );

    return {
      structure,
      atBats: reconciled.atBats,
    };
  };

  const topBuilt = buildSideData(true);
  const botBuilt = buildSideData(false);

  // 相手失策数を攻撃側 error 打席数からクロス集計して守備側シートの参考値と整合させる
  const topReachErrors = topBuilt.atBats.filter(
    (a) => a.resultCode === "error" || a.resultCode === "interference"
  ).length;
  const botReachErrors = botBuilt.atBats.filter(
    (a) => a.resultCode === "error" || a.resultCode === "interference"
  ).length;
  topBuilt.structure.totalErrors = botReachErrors;
  botBuilt.structure.totalErrors = topReachErrors;

  return {
    topStructure: topBuilt.structure,
    bottomStructure: botBuilt.structure,
    topAtBats: topBuilt.atBats,
    bottomAtBats: botBuilt.atBats,
  };
}
