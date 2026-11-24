// filepath: src/lib/liff/scorebook-live-hybrid.ts
import {
  isPickoffPitch,
  type CanonicalAtBatResult,
  type CanonicalPitchResult,
  type ScorebookBatterSlot,
  type ScorebookPitcherStint,
  type ScorebookRosterPlayer,
  type ScorebookSheetStructure,
  type ScorebookSubstitution,
  type ScorebookV2Advance,
  type ScorebookV2AtBat,
  type ScorebookValidationIssue,
} from "@/types/scorebook-v2";

function computeCountLocal(pitches: readonly CanonicalPitchResult[]): {
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
      if (strikes < 2) strikes += 1;
    } else if (p === "hbp" || isPickoffPitch(p) || p === "balk") {
      // no count change
    }
  }
  return { balls, strikes };
}

export interface ScorebookDigitalAnchorSide {
  source: "live_report" | "digital_snapshot";
  structure: ScorebookSheetStructure | null;
  atBats: ScorebookV2AtBat[];
}

function compactPersonName(raw: string | null | undefined): string {
  return (raw || "").replace(/[\s　]+/g, "").trim();
}

export function isGenericPlaceholderPersonName(
  raw: string | null | undefined
): boolean {
  const s = compactPersonName(raw);
  if (!s) return true;
  if (/^(?:相手)?\d+番(?:打者)?$/.test(s)) return true;
  if (/^(?:相手)?(?:先発)?投手(?:\d+)?$/.test(s)) return true;
  if (/^(?:打者|走者|選手)\d*$/.test(s)) return true;
  return false;
}

function isReachOrSafeResult(code: CanonicalAtBatResult): boolean {
  return (
    code === "single" ||
    code === "double" ||
    code === "triple" ||
    code === "home_run" ||
    code === "walk" ||
    code === "intentional_walk" ||
    code === "hit_by_pitch" ||
    code === "interference" ||
    code === "dropped_third_strike" ||
    code === "error" ||
    code === "fc"
  );
}

/**
 * 速報記録と紙面AI読取の打撃結果コードが「同一カテゴリ（差異警告を出すべきでない互換関係）」かどうかを判定する。
 * - 例: 空振三振 vs 見逃三振 vs 振逃アウト はいずれも三振アウト（strikeout系）として互換
 * - 例: 四球 vs 敬遠四球 は四球系として互換
 * - 例: 速報が野選(fc, o:1)で紙面が封殺ゴロ(groundout, o:1)の場合は公認記録正規化ルールにより互換
 */
export function areAnchorAndPaperResultsCompatible(
  paperAb: Pick<ScorebookV2AtBat, "resultCode" | "outsInPlay" | "runsInPlay">,
  anchorAb: Pick<ScorebookV2AtBat, "resultCode" | "outsInPlay" | "runsInPlay">
): boolean {
  const pCode = paperAb.resultCode;
  const aCode = anchorAb.resultCode;

  if (pCode === aCode) return true;

  const strikeoutOuts = new Set<CanonicalAtBatResult>([
    "strikeout",
    "dropped_third_strike_out",
  ]);
  if (strikeoutOuts.has(pCode) && strikeoutOuts.has(aCode)) {
    return true;
  }

  const walkCodes = new Set<CanonicalAtBatResult>([
    "walk",
    "intentional_walk",
  ]);
  if (walkCodes.has(pCode) && walkCodes.has(aCode)) {
    return true;
  }

  // 速報側で先行走者封殺が fc(o:1) になっていたものが紙面側で正規の groundout(o:1) になった場合
  if (
    paperAb.outsInPlay === 1 &&
    anchorAb.outsInPlay === 1 &&
    ((pCode === "groundout" && aCode === "fc") ||
      (pCode === "fc" && aCode === "groundout"))
  ) {
    return true;
  }

  // インフィールドフライと通常フライ（共に1アウト）は紙面の IF 表記有無に従うため互換扱い
  if (
    paperAb.outsInPlay === 1 &&
    anchorAb.outsInPlay === 1 &&
    ((pCode === "infield_fly" && aCode === "flyout") ||
      (pCode === "flyout" && aCode === "infield_fly"))
  ) {
    return true;
  }

  return false;
}

/**
 * 同一イニング内の打席配列から、対象打席に対応する速報アンカー打席（同一打順の N 巡目出現）を特定する。
 * サブ列折り返し方式（一巡充填式 vs 9番下端折り返し式）の違いに左右されないよう、イニング内の同一打順出現順で対応付ける。
 */
export function buildInningAtBatAnchorMatchMap(
  paperAtBats: ReadonlyArray<ScorebookV2AtBat>,
  anchorAtBats: ReadonlyArray<ScorebookV2AtBat>
): Map<string, ScorebookV2AtBat> {
  const result = new Map<string, ScorebookV2AtBat>();
  if (paperAtBats.length === 0 || anchorAtBats.length === 0) {
    return result;
  }

  const anchorByInningOrder = new Map<string, ScorebookV2AtBat[]>();
  for (const aAb of anchorAtBats) {
    const key = `${aAb.inning}:${aAb.battingOrder}`;
    const list = anchorByInningOrder.get(key) || [];
    list.push(aAb);
    anchorByInningOrder.set(key, list);
  }

  const seenCountMap = new Map<string, number>();
  for (const pAb of paperAtBats) {
    const key = `${pAb.inning}:${pAb.battingOrder}`;
    const occIdx = seenCountMap.get(key) || 0;
    seenCountMap.set(key, occIdx + 1);
    const candidates = anchorByInningOrder.get(key);
    if (candidates && occIdx < candidates.length) {
      result.set(pAb.id, candidates[occIdx]);
    }
  }

  return result;
}

/**
 * Stage 1（AI骨格スキャン `/analyze-structure`）向けに、
 * 記録済みのLINE試合速報（またはデジタル清書データ）から途中交代・継投・各回打席数ヒントを生成する。
 */
export function formatDigitalAnchorForStructurePrompt(
  anchor: ScorebookDigitalAnchorSide | null | undefined,
  isMyTeamBatting: boolean
): string {
  if (!anchor) return "";
  const struct = anchor.structure;
  const abs = anchor.atBats || [];
  if (!struct && abs.length === 0) return "";

  const lines: string[] = [];

  if (struct && struct.batters.length > 0) {
    const subEntries: string[] = [];
    for (const b of struct.batters) {
      if (!b.substitutions || b.substitutions.length === 0) continue;
      const desc = b.substitutions
        .filter((s) => !isGenericPlaceholderPersonName(s.name))
        .map(
          (s) =>
            `${s.inningEntered}回〜 ${s.subType} ${
              s.uniformNumber ? `#${s.uniformNumber} ` : ""
            }${s.name}${s.position ? `(守:${s.position})` : ""}`
        );
      if (desc.length > 0) {
        subEntries.push(`${b.battingOrder}番枠: ${desc.join(" / ")}`);
      }
    }
    if (subEntries.length > 0) {
      lines.push(`・記録済みの途中交代（代打・代走・守備変更）: ${subEntries.join(" ／ ")}`);
    }
  }

  if (struct && struct.pitchers.length > 0) {
    const namedPitchers = struct.pitchers.filter(
      (p) => !isGenericPlaceholderPersonName(p.name)
    );
    if (namedPitchers.length > 0) {
      const pDesc = namedPitchers
        .map(
          (p) =>
            `${p.fromInning}回〜${p.toInning}回 ${
              p.uniformNumber ? `#${p.uniformNumber} ` : ""
            }${p.name}`
        )
        .join(" ➔ ");
      lines.push(`・記録済みの登板投手継投: ${pDesc}`);
    }
  }

  if (abs.length > 0) {
    const byInn = new Map<number, ScorebookV2AtBat[]>();
    for (const ab of abs) {
      const arr = byInn.get(ab.inning) || [];
      arr.push(ab);
      byInn.set(ab.inning, arr);
    }
    const innSummaries: string[] = [];
    for (const [inn, list] of Array.from(byInn.entries()).sort(
      (a, b) => a[0] - b[0]
    )) {
      const runs = list.reduce((s, x) => s + Math.max(0, x.runsInPlay), 0);
      const colHint = list.length >= 10 ? "・⚠️打者一巡2列以上注意" : "";
      innSummaries.push(`${inn}回=${runs}点(${list.length}打席${colHint})`);
    }
    if (innSummaries.length > 0) {
      lines.push(`・各回の速報記録打席数と得点: ${innSummaries.join(", ")}`);
    }
  }

  if (lines.length === 0) return "";

  const nameRule = isMyTeamBatting
    ? "自チームの途中交代（代打・代走・守備変更）は紙面の波線見落とし防止に活用し、相手投手の実名・背番号が紙面に書かれていれば紙面から正確に読み取ってください。"
    : "相手打者の実名・背番号が紙面に書かれていれば『相手1番』等の仮名のままにせず紙面の手書き氏名を優先して読み取り、守備側（自チーム）の投手継投は上記記録と紙面を照合して漏れなく反映してください。";

  return `\n【⚡現場リアルタイム速報リファレンス（デジタル記録済情報）】
${lines.join("\n")}
※注意: **外周0〜1000ルーラーによるグリッド座標（lineupRightX, ymin/ymax, xmin/xmax, gridCorners）および複数列折り返し構造は必ず添付された手書き画像から直接計測**してください。${nameRule}\n`;
}

function summarizeAdvancesBrief(advances: ReadonlyArray<ScorebookV2Advance>): string {
  const notable = advances.filter(
    (a) =>
      a.from !== "BAT" &&
      (a.method === "steal" ||
        a.method === "caught_stealing" ||
        a.method === "pickoff_out" ||
        a.method === "wp" ||
        a.method === "pb" ||
        a.method === "balk" ||
        a.to === "HP" ||
        a.isOut)
  );
  if (notable.length === 0) return "";
  const parts = notable.slice(0, 3).map((a) => {
    const tag =
      a.method === "steal"
        ? "盗塁"
        : a.method === "caught_stealing"
          ? "盗塁死"
          : a.method === "pickoff_out"
            ? "牽制死"
            : a.method === "wp"
              ? "暴投"
              : a.method === "pb"
                ? "捕逸"
                : a.method === "balk"
                  ? "ボーク"
                  : a.isOut
                    ? "走塁死"
                    : "生還";
    return `${a.from}→${a.to}(${tag})`;
  });
  return ` [走者:${parts.join(",")}]`;
}

/**
 * Stage 2（イニング分割ディープ解析 `/analyze-inning-chunk`）向けに、
 * 対象イニングのLINE試合速報経過を「打順・大枠結果アンカー」として構築する。
 */
export function formatDigitalAnchorForInningChunkPrompt(
  anchorAtBats: ReadonlyArray<ScorebookV2AtBat> | null | undefined,
  targetInnings: ReadonlyArray<number>,
  isTop: boolean
): string {
  if (!anchorAtBats || anchorAtBats.length === 0 || targetInnings.length === 0) {
    return "";
  }

  const targetSet = new Set(targetInnings);
  const matched = anchorAtBats.filter((ab) => targetSet.has(ab.inning));
  if (matched.length === 0) return "";

  const sideText = isTop ? "表" : "裏";
  const byInn = new Map<number, ScorebookV2AtBat[]>();
  for (const ab of matched) {
    const list = byInn.get(ab.inning) || [];
    list.push(ab);
    byInn.set(ab.inning, list);
  }

  const blocks: string[] = [];
  for (const inn of [...targetInnings].sort((a, b) => a - b)) {
    const list = byInn.get(inn);
    if (!list || list.length === 0) continue;
    const totalRuns = list.reduce((s, x) => s + Math.max(0, x.runsInPlay), 0);
    const itemLines = list.map((ab, idx) => {
      const dirPart = ab.battedDirection ? `, dir:${ab.battedDirection}` : "";
      const advPart = summarizeAdvancesBrief(ab.advances || []);
      return `  ${idx + 1}) ${ab.battingOrder}番 ${ab.batterName}: ${
        ab.resultLabel
      } (rc:${ab.resultCode}${dirPart}, o:${ab.outsInPlay}, ru:${
        ab.runsInPlay
      }, rbi:${ab.rbi})${advPart}`;
    });
    blocks.push(
      `・${inn}回${sideText}（速報記録 ${list.length}打席 / 計${totalRuns}点）:\n${itemLines.join(
        "\n"
      )}`
    );
  }

  if (blocks.length === 0) return "";

  return `
【⚡ハイブリッド高精度解析：当日のLINE試合速報リファレンス（デジタル記録済）】
${blocks.join("\n")}
- **ハイブリッド統合の鉄則（必読）**:
  1) 上記は試合当日にリアルタイム入力された信頼度の高い打順・打席結果リファレンスです。手書きのにじみ・薄い線・点線維持式で出塁/凡退や打順境界が紛らわしい箇所は、この速報リファレンスと紙面を照合して打順ズレや誤読を防いでください。
  2) **🔥手書き紙面から上乗せすべき詳細情報（最重要！）**: 速報側では省略・簡略化されている **① BSO欄の1球ごとの全投球記号（○・●・ー・△・BF等）** と **② 右下の正確な守備番号・送球経路（6-3 / 4-6-3 / E6 / 6E / 9F 等）** は、必ず添付の手書き拡大画像から1球・1文字残らず忠実に読み取って出力してください！
  3) 万が一、公式記録員が手書きスコアブック上で事後訂正している等、**手書き紙面の記号（例: E6・FC・安打等）が誰の目にも明確に速報と異なる場合のみ手書き紙面の記録を優先採用**し、"cr" に「紙面は〇〇（速報は△△）」と簡潔に記載してください。\n`;
}

/**
 * 打順抜け・3アウト超過・要確認ピンポイント再解析向けに、対象マスの速報リファレンス行を生成する。
 */
export function formatDigitalAnchorForReconcilePrompt(
  anchorAtBats: ReadonlyArray<ScorebookV2AtBat> | null | undefined,
  targets: ReadonlyArray<{
    slotKey: string;
    inning: number;
    battingOrder: number;
  }>
): string {
  if (!anchorAtBats || anchorAtBats.length === 0 || targets.length === 0) {
    return "";
  }

  const lines: string[] = [];
  for (const t of targets) {
    const matches = anchorAtBats.filter(
      (ab) => ab.inning === t.inning && ab.battingOrder === t.battingOrder
    );
    if (matches.length === 0) continue;
    const summary = matches
      .map(
        (ab) =>
          `${ab.resultLabel}(rc:${ab.resultCode}${
            ab.battedDirection ? `, dir:${ab.battedDirection}` : ""
          }, o:${ab.outsInPlay}, ru:${ab.runsInPlay})`
      )
      .join(" / ");
    lines.push(
      `・[${t.slotKey}] ${t.inning}回 ${t.battingOrder}番のLINE速報記録: ${summary}`
    );
  }

  if (lines.length === 0) return "";
  return `\n【⚡対象マスのLINE試合速報リファレンス】\n${lines.join(
    "\n"
  )}\n※紙面の1球BSO・守備番号は超拡大画像から忠実に読み取りつつ、にじみ等で判定が割れる場合は上記速報記録との整合を確認してください（紙面が明確に異なる公式記録の場合のみ紙面を採用）。\n`;
}

/**
 * Stage 1 でスキャンしたシート骨格（4隅グリッド・列/行座標・手書き相手選手名）を100%活かしつつ、
 * 速報（デジタルアンカー）側に確定記録されている自チーム選手ID・途中交代（PH/PR/DEF）・継投スティントの欠落を非破壊補完する。
 */
export function mergeStructureWithDigitalAnchor(
  scanned: ScorebookSheetStructure,
  anchor: ScorebookSheetStructure | null | undefined,
  roster: ReadonlyArray<ScorebookRosterPlayer> = []
): ScorebookSheetStructure {
  if (!anchor) return scanned;

  const rosterById = new Map(roster.map((r) => [r.id, r]));

  const mergedBatters: ScorebookBatterSlot[] = scanned.batters.map((slot) => {
    const anchorSlot = anchor.batters.find(
      (b) => b.battingOrder === slot.battingOrder
    );
    if (!anchorSlot) return slot;

    let nextName = slot.name;
    let nextUniform = slot.uniformNumber;
    let nextPlayerId = slot.playerId;
    let nextPosition = slot.position;
    let nextBats = slot.bats;

    const slotIsPlaceholder = isGenericPlaceholderPersonName(slot.name);
    const anchorIsPlaceholder = isGenericPlaceholderPersonName(anchorSlot.name);

    if (scanned.isMyTeamBatting) {
      // 自チーム打順: 紙面読取で playerId が未紐付けの場合、同背番号または手書き未読取なら速報側の確定選手ID・背番号を引き継ぐ
      const differentExplicitRosterPlayer =
        Boolean(slot.playerId) &&
        Boolean(anchorSlot.playerId) &&
        slot.playerId !== anchorSlot.playerId;

      if (!differentExplicitRosterPlayer && !slot.playerId && anchorSlot.playerId) {
        const sameNumberOrBlank =
          !slot.uniformNumber ||
          !anchorSlot.uniformNumber ||
          slot.uniformNumber === anchorSlot.uniformNumber;
        if (slotIsPlaceholder || sameNumberOrBlank) {
          const rPlayer = rosterById.get(anchorSlot.playerId);
          nextPlayerId = anchorSlot.playerId;
          nextName = rPlayer?.name || anchorSlot.name || slot.name;
          nextUniform =
            slot.uniformNumber ||
            rPlayer?.uniformNumber ||
            anchorSlot.uniformNumber ||
            "";
          nextBats = slot.bats ?? anchorSlot.bats ?? null;
        }
      } else if (slotIsPlaceholder && !anchorIsPlaceholder) {
        nextName = anchorSlot.name;
        nextUniform = slot.uniformNumber || anchorSlot.uniformNumber || "";
      }
    } else {
      // 相手チーム打順: 紙面で実名が読めていれば紙面優先（「相手1番」→実名へアップグレード！）、紙面が空欄/仮名なら速報の実名を補完
      if (slotIsPlaceholder && !anchorIsPlaceholder) {
        nextName = anchorSlot.name;
        nextUniform = slot.uniformNumber || anchorSlot.uniformNumber || "";
      } else if (!slot.uniformNumber && anchorSlot.uniformNumber) {
        nextUniform = anchorSlot.uniformNumber;
      }
    }

    if (!nextPosition && anchorSlot.position) {
      nextPosition = anchorSlot.position;
    }

    // 途中交代（PH / PR / DEF）の非破壊マージ: 紙面の縦波線が見落とされた交代を速報から補完
    const nextSubs: ScorebookSubstitution[] = [...(slot.substitutions || [])];
    for (const aSub of anchorSlot.substitutions || []) {
      if (isGenericPlaceholderPersonName(aSub.name)) continue;
      const aCompact = compactPersonName(aSub.name);
      const existingIdx = nextSubs.findIndex((s) => {
        if (s.playerId && aSub.playerId && s.playerId === aSub.playerId) {
          return s.subType === aSub.subType;
        }
        return (
          compactPersonName(s.name) === aCompact && s.subType === aSub.subType
        );
      });

      if (existingIdx >= 0) {
        const cur = nextSubs[existingIdx];
        nextSubs[existingIdx] = {
          ...cur,
          playerId: cur.playerId || aSub.playerId || null,
          uniformNumber: cur.uniformNumber || aSub.uniformNumber || "",
          position: cur.position || aSub.position || "",
          bats: cur.bats ?? aSub.bats ?? null,
        };
      } else {
        nextSubs.push({ ...aSub });
      }
    }

    nextSubs.sort((a, b) => a.inningEntered - b.inningEntered);

    return {
      ...slot,
      name: nextName,
      uniformNumber: nextUniform,
      playerId: nextPlayerId,
      position: nextPosition,
      bats: nextBats,
      substitutions: nextSubs,
    };
  });

  // 登板投手（pitchers）の非破壊マージ:
  // 相手攻撃シート（!scanned.isMyTeamBatting ＝ 自チーム投手陣が登板）で、紙面下部投手欄の省略により継投が欠落した場合に速報の継投を復元
  let mergedPitchers: ScorebookPitcherStint[] = scanned.pitchers;
  const anchorNamedPitchers = (anchor.pitchers || []).filter(
    (p) => !isGenericPlaceholderPersonName(p.name)
  );
  const scannedNamedPitchers = (scanned.pitchers || []).filter(
    (p) => !isGenericPlaceholderPersonName(p.name)
  );

  if (!scanned.isMyTeamBatting && anchorNamedPitchers.length > 0) {
    if (scannedNamedPitchers.length === 0) {
      mergedPitchers = anchorNamedPitchers.map((p, idx) => ({
        ...p,
        order: idx + 1,
      }));
    } else if (anchorNamedPitchers.length > scannedNamedPitchers.length) {
      // 速報側でより詳しい継投人数が記録されている場合は、紙面で検出された途中打順(fromBatterOrder)があれば引き継ぎつつ統合
      mergedPitchers = anchorNamedPitchers.map((ap, idx) => {
        const matchedScan = scannedNamedPitchers.find(
          (sp) =>
            (sp.playerId && ap.playerId && sp.playerId === ap.playerId) ||
            compactPersonName(sp.name) === compactPersonName(ap.name)
        );
        return {
          ...ap,
          order: idx + 1,
          uniformNumber:
            matchedScan?.uniformNumber || ap.uniformNumber || "",
          fromBatterOrder:
            matchedScan?.fromBatterOrder ?? ap.fromBatterOrder ?? null,
          fromColumnIndex:
            matchedScan?.fromColumnIndex ?? ap.fromColumnIndex ?? null,
        };
      });
    } else {
      mergedPitchers = scanned.pitchers.map((sp) => {
        const matchedAnchor = anchorNamedPitchers.find(
          (ap) =>
            (sp.playerId && ap.playerId && sp.playerId === ap.playerId) ||
            compactPersonName(sp.name) === compactPersonName(ap.name)
        );
        if (!matchedAnchor) return sp;
        return {
          ...sp,
          playerId: sp.playerId || matchedAnchor.playerId || null,
          uniformNumber:
            sp.uniformNumber || matchedAnchor.uniformNumber || "",
        };
      });
    }
  } else if (
    scanned.isMyTeamBatting &&
    scannedNamedPitchers.length === 0 &&
    anchorNamedPitchers.length > 0
  ) {
    mergedPitchers = anchorNamedPitchers.map((p, idx) => ({
      ...p,
      order: idx + 1,
    }));
  }

  return {
    ...scanned,
    batters: mergedBatters,
    pitchers: mergedPitchers,
  };
}

/**
 * Stage 2 / 再検算で紙面から抽出した打席データ（1球ごとのBSO順序・具体的な守備番号）を最優先で保持しつつ、
 * 速報側にしか無い「代走・臨時代走（PR/TR）」「選手ID」「紙面で見落とされた盗塁/暴投進塁」を安全に補完する。
 */
export function enrichAtBatsWithDigitalAnchor(
  scannedAtBats: ScorebookV2AtBat[],
  anchorAtBats: ReadonlyArray<ScorebookV2AtBat> | null | undefined,
  _structure?: ScorebookSheetStructure | null
): ScorebookV2AtBat[] {
  if (!anchorAtBats || anchorAtBats.length === 0 || scannedAtBats.length === 0) {
    return scannedAtBats;
  }

  const pairMap = buildInningAtBatAnchorMatchMap(scannedAtBats, anchorAtBats);
  if (pairMap.size === 0) return scannedAtBats;

  return scannedAtBats.map((ab) => {
    const anchorAb = pairMap.get(ab.id);
    if (!anchorAb) return ab;

    // 1. 打者・投手の playerId および仮名（「3番」「相手投手」等）の補完
    let batterPlayerId = ab.batterPlayerId;
    let batterName = ab.batterName;
    if (!batterPlayerId && anchorAb.batterPlayerId) {
      const abPlaceholder = isGenericPlaceholderPersonName(ab.batterName);
      if (
        abPlaceholder ||
        compactPersonName(ab.batterName) === compactPersonName(anchorAb.batterName)
      ) {
        batterPlayerId = anchorAb.batterPlayerId;
        if (abPlaceholder && !isGenericPlaceholderPersonName(anchorAb.batterName)) {
          batterName = anchorAb.batterName;
        }
      }
    } else if (
      isGenericPlaceholderPersonName(ab.batterName) &&
      !isGenericPlaceholderPersonName(anchorAb.batterName)
    ) {
      batterName = anchorAb.batterName;
    }

    let pitcherPlayerId = ab.pitcherPlayerId;
    let pitcherName = ab.pitcherName;
    if (!pitcherPlayerId && anchorAb.pitcherPlayerId) {
      if (
        isGenericPlaceholderPersonName(ab.pitcherName) ||
        compactPersonName(ab.pitcherName) === compactPersonName(anchorAb.pitcherName)
      ) {
        pitcherPlayerId = anchorAb.pitcherPlayerId;
        if (
          isGenericPlaceholderPersonName(ab.pitcherName) &&
          !isGenericPlaceholderPersonName(anchorAb.pitcherName)
        ) {
          pitcherName = anchorAb.pitcherName;
        }
      }
    } else if (
      isGenericPlaceholderPersonName(ab.pitcherName) &&
      !isGenericPlaceholderPersonName(anchorAb.pitcherName)
    ) {
      pitcherName = anchorAb.pitcherName;
    }

    // 2. 代走・臨時代走（PR / TR）の引き継ぎ（紙面では特に臨時代走TRや波線無し代走が欠落しやすいため保護）
    const pinchRunners =
      ab.pinchRunners && ab.pinchRunners.length > 0
        ? ab.pinchRunners
        : anchorAb.pinchRunners && anchorAb.pinchRunners.length > 0
          ? anchorAb.pinchRunners.map((pr) => ({ ...pr }))
          : ab.pinchRunners;

    // 3. 打球方向: 紙面に具体的な守備番号（6-3, 9F 等）があれば100%紙面優先。紙面が空欄で結果が互換の時のみ速報方向を補完
    const compatibleResult = areAnchorAndPaperResultsCompatible(ab, anchorAb);
    const battedDirection =
      ab.battedDirection && ab.battedDirection.trim().length > 0
        ? ab.battedDirection
        : compatibleResult && anchorAb.battedDirection
          ? anchorAb.battedDirection
          : ab.battedDirection;

    // 4. 紙面で事前投球（○・●・ー・△）が全く読めず終端1球のみだった場合で、速報側に明示球順があり結果互換なら補完
    let pitches = ab.pitches;
    let balls = ab.balls;
    let strikes = ab.strikes;
    const paperPrePitches = ab.pitches.filter(
      (p) => p !== "in_play" && p !== "hit" && p !== "hbp"
    );
    const anchorPrePitches = anchorAb.pitches.filter(
      (p) => p !== "in_play" && p !== "hit" && p !== "hbp"
    );
    if (
      compatibleResult &&
      paperPrePitches.length === 0 &&
      anchorPrePitches.length > 0 &&
      ab.resultCode !== "walk" &&
      ab.resultCode !== "intentional_walk" &&
      ab.resultCode !== "strikeout"
    ) {
      const terminal = ab.pitches[ab.pitches.length - 1];
      pitches = terminal ? [...anchorPrePitches, terminal] : [...anchorAb.pitches];
      const cnt = computeCountLocal(pitches);
      balls = cnt.balls;
      strikes = cnt.strikes;
    }

    // 5. 盗塁・暴投・捕逸・ボークによる先行走者の安全進塁が紙面で読み落とされた場合の補完（アウト増減・得点数が一致している場合のみ安全適用）
    let advances = ab.advances;
    if (
      ab.outsInPlay === anchorAb.outsInPlay &&
      ab.runsInPlay === anchorAb.runsInPlay &&
      anchorAb.advances.length > 0
    ) {
      const coveredFromBases = new Set(ab.advances.map((a) => a.from));
      const extraSafeBatteryAdvances = anchorAb.advances.filter(
        (a) =>
          a.from !== "BAT" &&
          !a.isOut &&
          a.to !== "HP" &&
          !coveredFromBases.has(a.from) &&
          (a.method === "steal" ||
            a.method === "wp" ||
            a.method === "pb" ||
            a.method === "balk" ||
            a.method === "indifference")
      );
      if (extraSafeBatteryAdvances.length > 0) {
        advances = [
          ...extraSafeBatteryAdvances.map((a, idx) => ({
            ...a,
            id: `${ab.id}-live-adv-${idx + 1}`,
          })),
          ...ab.advances,
        ];
      }
    }

    return {
      ...ab,
      batterName,
      batterPlayerId,
      pitcherName,
      pitcherPlayerId,
      battedDirection,
      pitches,
      balls,
      strikes,
      advances,
      pinchRunners,
    };
  });
}

/**
 * STEP 3 の「確認おすすめの箇所」向けに、LINE速報記録と手書きAI読取で「打撃結果・アウト数・得点」が食い違っているマスだけを検出する。
 * ※単なる詳細化（例: 速報「内ゴロ」➔ 紙面「遊ゴロ (6-3)」＋球数追加）では一切警告を出さない。
 */
export function detectLiveAnchorDiscrepancies(
  atBats: ReadonlyArray<ScorebookV2AtBat>,
  anchorAtBats: ReadonlyArray<ScorebookV2AtBat> | null | undefined,
  isTop: boolean,
  confirmedDiffIds?: ReadonlySet<string>
): ScorebookValidationIssue[] {
  if (!anchorAtBats || anchorAtBats.length === 0 || atBats.length === 0) {
    return [];
  }

  const pairMap = buildInningAtBatAnchorMatchMap(atBats, anchorAtBats);
  const issues: ScorebookValidationIssue[] = [];

  for (const ab of atBats) {
    const anchorAb = pairMap.get(ab.id);
    if (!anchorAb) continue;

    const issueId = `live-diff-${isTop ? "t" : "b"}-${ab.id}`;
    if (confirmedDiffIds?.has(issueId)) continue;

    const sameCompat = areAnchorAndPaperResultsCompatible(ab, anchorAb);
    const outsDiff = ab.outsInPlay !== anchorAb.outsInPlay;
    const runsDiff = ab.runsInPlay !== anchorAb.runsInPlay;

    if (sameCompat && !outsDiff && !runsDiff) {
      continue;
    }

    // どちらも1アウトの通常内野/外野凡退（ゴロ vs フライ）で得点差もない場合は、紙面の打球記号が正であることが自明なため過剰警告しない
    const bothRoutineBattedSingleOut =
      !outsDiff &&
      !runsDiff &&
      ab.outsInPlay === 1 &&
      (ab.resultCode === "groundout" || ab.resultCode === "flyout") &&
      (anchorAb.resultCode === "groundout" || anchorAb.resultCode === "flyout");
    if (bothRoutineBattedSingleOut) {
      continue;
    }

    const anchorDesc = `${anchorAb.resultLabel}${
      anchorAb.battedDirection ? `(${anchorAb.battedDirection})` : ""
    }${anchorAb.runsInPlay > 0 ? `・${anchorAb.runsInPlay}点` : ""}`;
    const paperDesc = `${ab.resultLabel}${
      ab.battedDirection ? `(${ab.battedDirection})` : ""
    }${ab.runsInPlay > 0 ? `・${ab.runsInPlay}点` : ""}`;

    const reachVsOut =
      isReachOrSafeResult(ab.resultCode) !==
      isReachOrSafeResult(anchorAb.resultCode);

    issues.push({
      id: issueId,
      severity: reachVsOut || outsDiff || runsDiff ? "error" : "warning",
      atBatId: ab.id,
      inning: ab.inning,
      isTop,
      battingOrder: ab.battingOrder,
      category: "confidence",
      message: `⚡速報記録と差異: 速報は「${anchorDesc}」、紙面読取は「${paperDesc}」です`,
      suggestion:
        "マス画像をタップして確認するか、ワンタップで速報値採用または紙面確定を選べます。",
    });
  }

  return issues;
}

/**
 * STEP 3 でユーザーが「速報の記録を採用」ボタンを押した際、
 * 紙面からせっかく読み取ったBSO事前投球（○・●・ー・△）は可能な限り保持したまま、打撃結果・進塁・打点・アウト数を速報値へ切り替える。
 */
export function applyAnchorAtBatResultPreservingPaperPitches(
  paperAb: ScorebookV2AtBat,
  anchorAb: ScorebookV2AtBat
): ScorebookV2AtBat {
  const paperPrePitches = paperAb.pitches.filter(
    (p) => p !== "in_play" && p !== "hit" && p !== "hbp"
  );

  const code = anchorAb.resultCode;
  const isHit =
    code === "single" ||
    code === "double" ||
    code === "triple" ||
    code === "home_run";
  const isInPlay =
    code === "groundout" ||
    code === "flyout" ||
    code === "infield_fly" ||
    code === "double_play" ||
    code === "triple_play" ||
    code === "sac_bunt" ||
    code === "sac_fly" ||
    code === "error" ||
    code === "fc" ||
    code === "interference" ||
    code === "interference_out";

  let nextPitches: CanonicalPitchResult[];
  if (code === "walk") {
    let bSeen = 0;
    let sSeen = 0;
    const sanitizedWalkPre: CanonicalPitchResult[] = [];
    for (const p of paperPrePitches) {
      if (p === "ball") {
        if (bSeen >= 4) continue;
        bSeen += 1;
      } else if (
        p === "strike" ||
        p === "swinging_strike" ||
        p === "bunt_swinging"
      ) {
        if (sSeen >= 2) continue;
        sSeen += 1;
      }
      sanitizedWalkPre.push(p);
    }
    if (bSeen >= 4) {
      nextPitches = sanitizedWalkPre;
    } else if (sanitizedWalkPre.length > 0) {
      const needed = 4 - bSeen;
      nextPitches = [
        ...sanitizedWalkPre,
        ...Array.from({ length: needed }, (): CanonicalPitchResult => "ball"),
      ];
    } else {
      nextPitches =
        anchorAb.pitches.length > 0
          ? [...anchorAb.pitches]
          : ["ball", "ball", "ball", "ball"];
    }
  } else if (code === "intentional_walk") {
    nextPitches = [];
  } else if (code === "hit_by_pitch") {
    let bSeen = 0;
    let sSeen = 0;
    const sanitizedHbpPre: CanonicalPitchResult[] = [];
    for (const p of paperPrePitches) {
      if (p === "ball") {
        if (bSeen >= 3) continue;
        bSeen += 1;
      } else if (
        p === "strike" ||
        p === "swinging_strike" ||
        p === "bunt_swinging"
      ) {
        if (sSeen >= 2) continue;
        sSeen += 1;
      }
      sanitizedHbpPre.push(p);
    }
    nextPitches = [...sanitizedHbpPre, "hbp"];
  } else if (
    code === "strikeout" ||
    code === "dropped_third_strike" ||
    code === "dropped_third_strike_out"
  ) {
    const preCnt = computeCountLocal(paperPrePitches);
    if (preCnt.strikes >= 3 && preCnt.balls <= 3) {
      nextPitches = [...paperPrePitches];
    } else {
      nextPitches =
        anchorAb.pitches.length > 0
          ? [...anchorAb.pitches]
          : ["strike", "strike", "swinging_strike"];
    }
  } else if (isHit || isInPlay) {
    const terminal: CanonicalPitchResult = isHit ? "hit" : "in_play";
    let bSeen = 0;
    let sSeen = 0;
    const sanitizedPre: CanonicalPitchResult[] = [];
    for (const p of paperPrePitches) {
      if (p === "ball") {
        if (bSeen >= 3) continue;
        bSeen += 1;
      } else if (
        p === "strike" ||
        p === "swinging_strike" ||
        p === "bunt_swinging"
      ) {
        if (sSeen >= 2) continue;
        sSeen += 1;
      }
      sanitizedPre.push(p);
    }
    nextPitches =
      sanitizedPre.length > 0
        ? [...sanitizedPre, terminal]
        : anchorAb.pitches.length > 0
          ? [...anchorAb.pitches]
          : [terminal];
  } else {
    nextPitches =
      paperAb.pitches.length > 0 ? [...paperAb.pitches] : [...anchorAb.pitches];
  }

  const syncedCnt = computeCountLocal(nextPitches);
  const keepPaperDir =
    paperAb.resultCode === anchorAb.resultCode &&
    Boolean(paperAb.battedDirection);

  return {
    ...paperAb,
    resultCode: anchorAb.resultCode,
    resultLabel: anchorAb.resultLabel,
    battedDirection: keepPaperDir
      ? paperAb.battedDirection
      : anchorAb.battedDirection,
    outsInPlay: anchorAb.outsInPlay,
    runsInPlay: anchorAb.runsInPlay,
    rbi: anchorAb.rbi,
    pitches: nextPitches,
    balls: syncedCnt.balls,
    strikes: syncedCnt.strikes,
    advances: anchorAb.advances.map((a, idx) => ({
      ...a,
      id: `${paperAb.id}-adopt-${idx + 1}`,
    })),
    pinchRunners:
      paperAb.pinchRunners && paperAb.pinchRunners.length > 0
        ? paperAb.pinchRunners
        : anchorAb.pinchRunners,
    confidence: "high",
    confidenceReason: undefined,
  };
}
