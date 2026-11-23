// filepath: src/lib/liff/live-report-v2.ts

import type {
  LiveReportAttendanceStatus,
  LiveReportBaseNum,
  LiveReportChainedPlay,
  LiveReportDhStarterPitcher,
  LiveReportHalfInning,
  LiveReportLineupSlot,
  LiveReportLineupSubRecord,
  LiveReportOpponentBenchPlayer,
  LiveReportOpponentLineupSlot,
  LiveReportOutputMode,
  LiveReportPitchType,
  LiveReportPlayEntry,
  LiveReportSubType,
  LiveReportV2Document,
} from "@/types/live-report-v2";
import type {
  MatchLineupsPayload,
  MyLineupSlot,
  OpponentBenchPlayer,
  OpponentLineupSlot,
  PlayerMatchAttendanceMap,
} from "@/lib/liff/demo-lineup";
import type {
  ScorebookSheetStructure,
  ScorebookV2AtBat,
} from "@/types/scorebook-v2";

// =========================================================
// 1. 日付・祝日フォーマット（iOS Safari安全パース ＆ 日本の祝日自動判定）
// =========================================================

import { isJapaneseHoliday } from "@/lib/liff/japanese-holidays";
export { isJapaneseHoliday };

export function parseSafeJstDate(rawDate: string | null | undefined): Date | null {
  if (!rawDate) return null;
  const trimmed = rawDate.trim();
  if (!trimmed) return null;

  const ymdMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymdMatch) {
    const y = Number(ymdMatch[1]);
    const m = Number(ymdMatch[2]);
    const d = Number(ymdMatch[3]);
    const dt = new Date(y, m - 1, d, 12, 0, 0);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return null;
}

export function formatJapaneseMatchDateLabel(rawDate: string | null | undefined): string {
  const d = parseSafeJstDate(rawDate) ?? new Date();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const wd = weekdays[d.getDay()] || "";
  const holidaySuffix = isJapaneseHoliday(d) && d.getDay() !== 0 ? "祝" : "";
  return `${month}月${day}日(${wd}${holidaySuffix})`;
}

export function getCurrentHmText(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// =========================================================
// 2. チーム名・選手名・守備位置ユーティリティ
// =========================================================

export function deriveScoreboardShortName(rawName: string): string {
  const base = (rawName || "")
    .replace(/[\(（].*?[\)）]/g, "")
    .replace(
      /(リトルシニア|シニア|ボーイズ|ヤング|ポニー|リトル|ベースボールクラブ|クラブ|ジュニア|スピリッツ|スターズ|ドリームス|ファイターズ|ライオンズ|イーグルス|ホークス|タイガース|ジャイアンツ|ドラゴンズ|スワローズ|マリナーズ|S|B|Y)$/i,
      ""
    )
    .trim();

  const target = base || (rawName || "").trim() || "チーム";
  const chars = Array.from(target);
  if (chars.length === 2) {
    return `${chars[0]}　${chars[1]}`;
  }
  if (chars.length > 4) {
    return chars.slice(0, 4).join("");
  }
  return target;
}

export function formatPlayerReportName(
  fullName: string,
  showSurnameOnly: boolean
): string {
  const cleaned = (fullName || "").trim();
  if (!cleaned) return "";
  if (!showSurnameOnly) return cleaned;
  const parts = cleaned.split(/[\s　]+/);
  return parts[0] || cleaned;
}

export const POSITION_OPTIONS: ReadonlyArray<{
  code: string;
  shortLabel: string;
  dirLabel: string;
}> = [
  { code: "1", shortLabel: "1 (投)", dirLabel: "投" },
  { code: "2", shortLabel: "2 (捕)", dirLabel: "捕" },
  { code: "3", shortLabel: "3 (一)", dirLabel: "一" },
  { code: "4", shortLabel: "4 (二)", dirLabel: "二" },
  { code: "5", shortLabel: "5 (三)", dirLabel: "三" },
  { code: "6", shortLabel: "6 (遊)", dirLabel: "遊" },
  { code: "7", shortLabel: "7 (左)", dirLabel: "左" },
  { code: "8", shortLabel: "8 (中)", dirLabel: "中" },
  { code: "9", shortLabel: "9 (右)", dirLabel: "右" },
  { code: "D", shortLabel: "D (DH)", dirLabel: "" },
];

export function normalizeReportPositionCode(rawPos: string | null | undefined): string {
  const p = (rawPos || "").trim().toUpperCase();
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
    一塁: "3",
    "4": "4",
    "2B": "4",
    二: "4",
    二塁: "4",
    "5": "5",
    "3B": "5",
    三: "5",
    三塁: "5",
    "6": "6",
    SS: "6",
    遊: "6",
    遊撃: "6",
    "7": "7",
    LF: "7",
    左: "7",
    左翼: "7",
    "8": "8",
    CF: "8",
    中: "8",
    中堅: "8",
    "9": "9",
    RF: "9",
    右: "9",
    右翼: "9",
    DH: "D",
    D: "D",
    指: "D",
  };
  return map[p] || (p ? p.slice(0, 1) : "打");
}

export function createDefaultEmptyLineup(count = 9): LiveReportLineupSlot[] {
  return Array.from({ length: count }, (_, idx) => ({
    order: idx + 1,
    position: String(idx + 1 <= 9 ? idx + 1 : "D"),
    playerId: null,
    playerName: "",
    substitutions: [],
  }));
}

export function toEditorLineupPosition(
  rawPos: string | null | undefined,
  hasPlayerIdentity: boolean
): string {
  if (!hasPlayerIdentity) return "";
  const trimmed = (rawPos || "").trim().toUpperCase();
  if (!trimmed || trimmed === "打") return "";
  const norm = normalizeReportPositionCode(trimmed);
  if (norm === "D") return "DH";
  if (norm === "打") return "";
  if (/^[1-9]$/.test(norm)) return norm;
  return "";
}

export function toReportLineupPosition(
  editorPos: string | null | undefined
): string {
  const trimmed = (editorPos || "").trim();
  if (!trimmed) return "打";
  return normalizeReportPositionCode(trimmed);
}

export function splitLoadedMyLineupSlots(
  raw: ReadonlyArray<Record<string, unknown>> | ReadonlyArray<MyLineupSlot> | null | undefined
): {
  battingSlots: MyLineupSlot[];
  dhPitcher: MyLineupSlot | null;
} {
  const createEmpty = (cnt = 9): MyLineupSlot[] =>
    Array.from({ length: cnt }, (_, i) => ({
      order: i + 1,
      position: "",
      playerId: "",
      name: "",
      uniformNumber: "",
    }));

  if (!Array.isArray(raw) || raw.length === 0) {
    return { battingSlots: createEmpty(9), dhPitcher: null };
  }

  const normalizedItems = raw.map((item, idx) => {
    const rec = (item || {}) as Record<string, unknown>;
    const rawOrder =
      typeof rec.order === "number"
        ? rec.order
        : typeof rec.battingOrder === "number"
        ? rec.battingOrder
        : idx + 1;
    const playerId = typeof rec.playerId === "string" ? rec.playerId : "";
    const name =
      typeof rec.name === "string"
        ? rec.name
        : typeof rec.playerName === "string"
        ? rec.playerName
        : "";
    const uniformNumber =
      typeof rec.uniformNumber === "string" ? rec.uniformNumber : "";
    const rawPos = typeof rec.position === "string" ? rec.position.trim() : "";
    const hasIdentity = Boolean(playerId || name.trim());
    const pos =
      rawOrder === 0
        ? "1"
        : rawPos.toUpperCase() === "D" || rawPos.toUpperCase() === "DH"
        ? "DH"
        : /^[1-9]$/.test(rawPos)
        ? rawPos
        : hasIdentity
        ? toEditorLineupPosition(rawPos, true)
        : "";
    return {
      order: rawOrder,
      position: pos,
      playerId,
      name,
      uniformNumber,
    };
  });

  const slots1to9 = normalizedItems.filter(
    (s) => s.order >= 1 && s.order <= 9
  );
  const hasDhIn1to9 = slots1to9.some((s) => s.position === "DH");
  const hasPitcherIn1to9 = slots1to9.some((s) => s.position === "1");

  const dhPitcherRaw =
    normalizedItems.find(
      (s) =>
        s.order === 0 &&
        (s.position === "1" || Boolean(s.playerId || s.name.trim()))
    ) ||
    (hasDhIn1to9 && !hasPitcherIn1to9 && normalizedItems.length === 10
      ? normalizedItems.find(
          (s) =>
            s.order === 10 &&
            s.position === "1" &&
            Boolean(s.playerId || s.name.trim())
        )
      : undefined);
  const dhPitcher: MyLineupSlot | null = dhPitcherRaw
    ? {
        order: 0,
        position: "1",
        playerId: dhPitcherRaw.playerId,
        name: dhPitcherRaw.name,
        uniformNumber: dhPitcherRaw.uniformNumber,
      }
    : null;

  const orderSlots = normalizedItems.filter(
    (s) => s.order >= 1 && s !== dhPitcherRaw
  );
  if (orderSlots.length === 0) {
    return { battingSlots: createEmpty(9), dhPitcher };
  }
  const maxOrder = Math.min(25, Math.max(9, ...orderSlots.map((s) => s.order)));
  const battingSlots: MyLineupSlot[] = Array.from(
    { length: maxOrder },
    (_, idx) => {
      const found = orderSlots.find((s) => s.order === idx + 1);
      return found
        ? {
            order: idx + 1,
            position: found.position,
            playerId: found.playerId,
            name: found.name,
            uniformNumber: found.uniformNumber,
          }
        : {
            order: idx + 1,
            position: "",
            playerId: "",
            name: "",
            uniformNumber: "",
          };
    }
  );
  return { battingSlots, dhPitcher };
}

export interface ExtractedDocLineupState {
  myLineup: MyLineupSlot[];
  dhStarterPitcher: MyLineupSlot | null;
  opponentLineup: OpponentLineupSlot[];
  opponentBench: OpponentBenchPlayer[];
  myAttendance: PlayerMatchAttendanceMap;
}

export function extractLineupEditorStateFromDoc(
  doc: LiveReportV2Document
): ExtractedDocLineupState {
  const slotCount = Math.max(9, doc.lineup.length);
  const myLineup: MyLineupSlot[] = Array.from(
    { length: slotCount },
    (_, idx) => {
      const slot =
        doc.lineup.find((s) => s.order === idx + 1) || doc.lineup[idx];
      if (!slot) {
        return {
          order: idx + 1,
          position: "",
          playerId: "",
          name: "",
          uniformNumber: "",
        };
      }
      const hasIdentity = Boolean(
        slot.playerId || (slot.playerName && slot.playerName.trim())
      );
      return {
        order: idx + 1,
        position: toEditorLineupPosition(slot.position, hasIdentity),
        playerId: slot.playerId || "",
        name: slot.playerName || "",
        uniformNumber: slot.uniformNumber || "",
      };
    }
  );

  const dhStarterPitcher: MyLineupSlot | null =
    doc.dhStarterPitcher &&
    (doc.dhStarterPitcher.playerId || doc.dhStarterPitcher.playerName.trim())
      ? {
          order: 0,
          position: "1",
          playerId: doc.dhStarterPitcher.playerId || "",
          name: doc.dhStarterPitcher.playerName || "",
          uniformNumber: doc.dhStarterPitcher.uniformNumber || "",
        }
      : null;

  const oppCount = Math.max(
    9,
    doc.opponentBatterCount || 9,
    doc.opponentLineup?.length || 0
  );
  const opponentLineup: OpponentLineupSlot[] = Array.from(
    { length: oppCount },
    (_, idx) => {
      const found =
        doc.opponentLineup?.find((o) => o.order === idx + 1) ||
        doc.opponentLineup?.[idx];
      const rawPos = (found?.position || "").trim();
      const normPos =
        rawPos.toUpperCase() === "D" || rawPos.toUpperCase() === "DH"
          ? "DH"
          : /^[1-9]$/.test(rawPos)
          ? rawPos
          : "";
      return {
        order: idx + 1,
        position: normPos,
        name: found?.playerName || "",
        uniformNumber: found?.uniformNumber || "",
      };
    }
  );

  const opponentBench: OpponentBenchPlayer[] = (doc.opponentBench || []).map(
    (b, idx) => ({
      id: b.id || `opp-b-${idx + 1}`,
      name: b.playerName || "",
      uniformNumber: b.uniformNumber || "",
      position: b.position || "",
    })
  );

  const myAttendance: PlayerMatchAttendanceMap = {
    ...(doc.myAttendance || {}),
  };

  return {
    myLineup,
    dhStarterPitcher,
    opponentLineup,
    opponentBench,
    myAttendance,
  };
}

export function applyLineupEditorStateToDoc(
  doc: LiveReportV2Document,
  patch: {
    myLineup?: ReadonlyArray<MyLineupSlot>;
    dhStarterPitcher?: MyLineupSlot | null;
    opponentLineup?: ReadonlyArray<OpponentLineupSlot>;
    opponentBench?: ReadonlyArray<OpponentBenchPlayer>;
    myAttendance?: PlayerMatchAttendanceMap;
  }
): LiveReportV2Document {
  const current = extractLineupEditorStateFromDoc(doc);
  const nextMySlots = patch.myLineup ?? current.myLineup;
  const rawNextDh =
    patch.dhStarterPitcher !== undefined
      ? patch.dhStarterPitcher
      : current.dhStarterPitcher;
  const nextOppSlots = patch.opponentLineup ?? current.opponentLineup;
  const nextOppBench = patch.opponentBench ?? current.opponentBench;
  const nextAttendance = patch.myAttendance ?? current.myAttendance;

  const builtLineup: LiveReportLineupSlot[] = Array.from(
    { length: Math.max(9, nextMySlots.length) },
    (_, idx) => {
      const src = nextMySlots[idx];
      const prevSlot =
        doc.lineup.find((s) => s.order === idx + 1) || doc.lineup[idx];
      const cleanName = (src?.name || "").trim();
      const cleanPid = (src?.playerId || "").trim() || null;
      const cleanUni = (src?.uniformNumber || "").trim();
      const hasIdentity = Boolean(cleanPid || cleanName);
      return {
        order: idx + 1,
        position: hasIdentity
          ? toReportLineupPosition(src?.position)
          : src?.position
          ? toReportLineupPosition(src.position)
          : "打",
        playerId: cleanPid,
        playerName: cleanName,
        ...(cleanUni ? { uniformNumber: cleanUni } : {}),
        substitutions: prevSlot?.substitutions || [],
      };
    }
  );

  const hasDhInOrder = builtLineup.some(
    (s) => normalizeReportPositionCode(s.position) === "D"
  );
  const hasPitcherInOrder = builtLineup.some(
    (s) =>
      Boolean(s.playerId || s.playerName.trim()) &&
      normalizeReportPositionCode(s.position) === "1"
  );
  const dhHasIdentity = Boolean(
    rawNextDh && (rawNextDh.playerId || rawNextDh.name.trim())
  );
  const dhDuplicateInOrder = Boolean(
    rawNextDh?.playerId &&
      builtLineup.some((s) => s.playerId === rawNextDh.playerId)
  );

  const resolvedDhPitcher: LiveReportDhStarterPitcher | null =
    dhHasIdentity && hasDhInOrder && !hasPitcherInOrder && !dhDuplicateInOrder
      ? {
          playerId: rawNextDh!.playerId.trim() || null,
          playerName: rawNextDh!.name.trim(),
          ...(rawNextDh!.uniformNumber.trim()
            ? { uniformNumber: rawNextDh!.uniformNumber.trim() }
            : {}),
        }
      : null;

  const builtOppLineup: LiveReportOpponentLineupSlot[] = Array.from(
    { length: Math.max(9, nextOppSlots.length) },
    (_, idx) => {
      const o = nextOppSlots[idx];
      const rawPos = (o?.position || "").trim();
      const normPos =
        rawPos.toUpperCase() === "D" || rawPos.toUpperCase() === "DH"
          ? "DH"
          : /^[1-9]$/.test(rawPos)
          ? rawPos
          : "";
      const cleanUni = (o?.uniformNumber || "").trim().replace(/^#/, "");
      return {
        order: idx + 1,
        position: normPos,
        playerName: o?.name || "",
        ...(cleanUni ? { uniformNumber: cleanUni } : {}),
      };
    }
  );

  const hasAnyOppInput = builtOppLineup.some(
    (o) => Boolean(o.playerName.trim() || o.position || o.uniformNumber)
  );

  const builtOppBench: LiveReportOpponentBenchPlayer[] = nextOppBench.map(
    (b, idx) => ({
      id: b.id || `opp-b-${idx + 1}`,
      playerName: b.name || "",
      ...(b.uniformNumber?.trim()
        ? { uniformNumber: b.uniformNumber.trim().replace(/^#/, "") }
        : {}),
      ...(b.position?.trim() ? { position: b.position.trim() } : {}),
    })
  );

  const cleanedAttendance: Record<string, LiveReportAttendanceStatus> = {};
  for (const [pid, st] of Object.entries(nextAttendance || {})) {
    if (
      pid &&
      (st === "bench" || st === "absent" || st === "excluded")
    ) {
      cleanedAttendance[pid] = st;
    }
  }

  const nextOppBatterCount = Math.min(25, Math.max(9, builtOppLineup.length));
  const nextMyLimit = Math.max(9, builtLineup.length);

  const updated: LiveReportV2Document = {
    ...doc,
    lineup: builtLineup,
    opponentBatterCount: nextOppBatterCount,
    nextMyOrder: Math.min(Math.max(1, doc.nextMyOrder || 1), nextMyLimit),
    nextOpponentOrder: Math.min(
      Math.max(1, doc.nextOpponentOrder || 1),
      nextOppBatterCount
    ),
  };

  if (resolvedDhPitcher) {
    updated.dhStarterPitcher = resolvedDhPitcher;
  } else {
    delete updated.dhStarterPitcher;
  }

  if (hasAnyOppInput || builtOppLineup.length > 9) {
    updated.opponentLineup = builtOppLineup;
  } else {
    delete updated.opponentLineup;
  }

  if (builtOppBench.length > 0) {
    updated.opponentBench = builtOppBench;
  } else {
    delete updated.opponentBench;
  }

  if (Object.keys(cleanedAttendance).length > 0) {
    updated.myAttendance = cleanedAttendance;
  } else {
    delete updated.myAttendance;
  }

  return updated;
}

export function hasMeaningfulDocLineupData(doc: LiveReportV2Document): boolean {
  if (
    doc.lineup.some((s) => Boolean(s.playerId || (s.playerName || "").trim()))
  ) {
    return true;
  }
  if (
    doc.dhStarterPitcher &&
    Boolean(
      doc.dhStarterPitcher.playerId || doc.dhStarterPitcher.playerName.trim()
    )
  ) {
    return true;
  }
  if (
    (doc.opponentLineup || []).some((o) =>
      Boolean((o.playerName || "").trim() || o.position || o.uniformNumber)
    )
  ) {
    return true;
  }
  if (
    (doc.opponentBench || []).some((b) =>
      Boolean((b.playerName || "").trim() || b.uniformNumber)
    )
  ) {
    return true;
  }
  if (doc.myAttendance && Object.keys(doc.myAttendance).length > 0) {
    return true;
  }
  return false;
}

export function serializeDocLineupForMatchStorage(
  doc: LiveReportV2Document
): MatchLineupsPayload {
  const extracted = extractLineupEditorStateFromDoc(doc);

  const hasAnyOpponentStarterInput = extracted.opponentLineup.some((p) =>
    Boolean(
      (p.name && p.name.trim() !== "") ||
        (p.position && p.position !== "") ||
        (p.uniformNumber && p.uniformNumber.trim() !== "")
    )
  );

  const filledOpponentLineup: OpponentLineupSlot[] =
    extracted.opponentLineup.map((p) => {
      const cleanName = (p.name || "").trim();
      const cleanNum = (p.uniformNumber || "").trim().replace(/^#/, "");
      const hasName = Boolean(cleanName);
      const hasPos = Boolean(p.position && p.position !== "");
      if (!hasAnyOpponentStarterInput) {
        return {
          order: p.order,
          name: "",
          uniformNumber: "",
          position: "",
        };
      }
      return {
        order: p.order,
        uniformNumber: cleanNum,
        name: hasName
          ? cleanName
          : cleanNum
          ? `相手選手 #${cleanNum}`
          : `相手打者 ${p.order}`,
        position: hasPos ? p.position : p.order <= 9 ? String(p.order) : "DH",
      };
    });

  const cleanedOpponentBench: OpponentBenchPlayer[] = extracted.opponentBench
    .map((b, idx) => ({
      id: b.id || `opp-b-${idx + 1}`,
      uniformNumber: (b.uniformNumber || "").trim().replace(/^#/, ""),
      name: (b.name || "").trim(),
      position: b.position || "",
    }))
    .filter((b) => Boolean(b.name || b.uniformNumber))
    .map((b) => ({
      ...b,
      name: b.name || `相手控え #${b.uniformNumber}`,
    }));

  const serializedMyLineup: MyLineupSlot[] = extracted.dhStarterPitcher
    ? [...extracted.myLineup, extracted.dhStarterPitcher]
    : extracted.myLineup;

  return {
    myLineup: serializedMyLineup,
    opponentLineup: filledOpponentLineup,
    opponentBench: cleanedOpponentBench,
    myAttendance: extracted.myAttendance,
  };
}

export function mergeSavedMatchLineupIntoDoc(
  doc: LiveReportV2Document,
  saved: {
    myLineup?: ReadonlyArray<Record<string, unknown>> | ReadonlyArray<MyLineupSlot>;
    dhStarterPitcher?: MyLineupSlot | null;
    opponentLineup?: ReadonlyArray<Record<string, unknown>> | ReadonlyArray<OpponentLineupSlot>;
    opponentBench?: ReadonlyArray<Record<string, unknown>> | ReadonlyArray<OpponentBenchPlayer>;
    myAttendance?: Record<string, unknown>;
  },
  options?: { overwriteFilled?: boolean }
): LiveReportV2Document {
  const overwriteFilled = options?.overwriteFilled ?? true;
  const docHasMyStarters = doc.lineup.some((s) =>
    Boolean(s.playerId || s.playerName.trim())
  );

  const splitMy = splitLoadedMyLineupSlots(saved.myLineup);
  const incomingDh =
    saved.dhStarterPitcher !== undefined
      ? saved.dhStarterPitcher
      : splitMy.dhPitcher;
  const incomingHasMyStarters =
    splitMy.battingSlots.some((s) => Boolean(s.playerId || s.name.trim())) ||
    Boolean(incomingDh && (incomingDh.playerId || incomingDh.name.trim()));

  const parsedOppLineup: OpponentLineupSlot[] | undefined = Array.isArray(
    saved.opponentLineup
  )
    ? saved.opponentLineup.map((rawItem, idx) => {
        const rec = (rawItem || {}) as Record<string, unknown>;
        const order =
          typeof rec.order === "number"
            ? rec.order
            : typeof rec.battingOrder === "number"
            ? rec.battingOrder
            : idx + 1;
        return {
          order,
          position: typeof rec.position === "string" ? rec.position : "",
          name:
            typeof rec.name === "string"
              ? rec.name
              : typeof rec.playerName === "string"
              ? rec.playerName
              : "",
          uniformNumber:
            typeof rec.uniformNumber === "string" ? rec.uniformNumber : "",
        };
      })
    : undefined;

  const parsedOppBench: OpponentBenchPlayer[] | undefined = Array.isArray(
    saved.opponentBench
  )
    ? saved.opponentBench.map((rawItem, idx) => {
        const rec = (rawItem || {}) as Record<string, unknown>;
        return {
          id: typeof rec.id === "string" ? rec.id : `opp-b-${idx + 1}`,
          name:
            typeof rec.name === "string"
              ? rec.name
              : typeof rec.playerName === "string"
              ? rec.playerName
              : "",
          uniformNumber:
            typeof rec.uniformNumber === "string" ? rec.uniformNumber : "",
          position: typeof rec.position === "string" ? rec.position : "",
        };
      })
    : undefined;

  let parsedAttendance: PlayerMatchAttendanceMap | undefined = undefined;
  if (
    saved.myAttendance &&
    typeof saved.myAttendance === "object" &&
    !Array.isArray(saved.myAttendance)
  ) {
    parsedAttendance = {};
    for (const [k, v] of Object.entries(saved.myAttendance)) {
      if (v === "bench" || v === "absent" || v === "excluded") {
        parsedAttendance[k] = v;
      }
    }
  }

  return applyLineupEditorStateToDoc(doc, {
    ...(incomingHasMyStarters && (overwriteFilled || !docHasMyStarters)
      ? {
          myLineup: splitMy.battingSlots,
          dhStarterPitcher: incomingDh,
        }
      : {}),
    ...(parsedOppLineup &&
    parsedOppLineup.length > 0 &&
    (overwriteFilled || !(doc.opponentLineup && doc.opponentLineup.length > 0))
      ? { opponentLineup: parsedOppLineup }
      : {}),
    ...(parsedOppBench &&
    (overwriteFilled || !(doc.opponentBench && doc.opponentBench.length > 0))
      ? { opponentBench: parsedOppBench }
      : {}),
    ...(parsedAttendance &&
    (overwriteFilled ||
      !(doc.myAttendance && Object.keys(doc.myAttendance).length > 0))
      ? { myAttendance: parsedAttendance }
      : {}),
  });
}

export function createInitialLiveReportDocument(params?: {
  matchId?: string | null;
  myTeamName?: string;
  opponentName?: string;
  date?: string;
  tournamentName?: string;
  venueName?: string;
  battingOrder?: "first" | "second";
  regulationInnings?: number;
  opponentBatterCount?: number;
  reporterNames?: string;
}): LiveReportV2Document {
  const myTeam = params?.myTeamName || "自チーム";
  const opp = params?.opponentName || "";
  const battingOrder = params?.battingOrder || "first";
  const myShort = deriveScoreboardShortName(myTeam);
  const oppShort = opp ? deriveScoreboardShortName(opp) : "相　手";
  const opponentBatterCount =
    typeof params?.opponentBatterCount === "number" &&
    Number.isFinite(params.opponentBatterCount)
      ? Math.max(9, Math.min(25, Math.round(params.opponentBatterCount)))
      : 9;

  return {
    version: 2,
    matchId: params?.matchId ?? null,
    dateText: formatJapaneseMatchDateLabel(params?.date),
    tournamentText: params?.tournamentName || "",
    opponentName: opp,
    venueName: params?.venueName || "",
    startTime: "",
    endTime: "",
    battingOrder,
    regulationInnings: params?.regulationInnings || 7,
    opponentBatterCount,
    firstTeamShortName: battingOrder === "first" ? myShort : oppShort,
    secondTeamShortName: battingOrder === "first" ? oppShort : myShort,
    showSurnameOnly: true,
    appendSubsToTopLineup: false,
    showWalkoffX: false,
    lineup: createDefaultEmptyLineup(9),
    halfInnings: [],
    activeInning: 1,
    activeIsBottom: false,
    nextMyOrder: 1,
    nextOpponentOrder: 1,
    isGameFinished: false,
    closingComment: "",
    reporterNames: params?.reporterNames || "",
  };
}

// =========================================================
// 3. アクティブ打順・守備解決（途中交代反映・臨時代走TRは打順/守備を保持）
// =========================================================

export function compareHalfInningOrder(
  aInning: number,
  aIsBottom: boolean,
  bInning: number,
  bIsBottom: boolean
): number {
  if (aInning !== bInning) return aInning - bInning;
  if (aIsBottom === bIsBottom) return 0;
  return aIsBottom ? 1 : -1;
}

export interface ActiveSlotSnapshot {
  order: number;
  position: string;
  playerId: string | null;
  playerName: string;
}

export function resolveActiveLineupAtInning(
  lineup: ReadonlyArray<LiveReportLineupSlot>,
  inning: number,
  isBottom: boolean
): ActiveSlotSnapshot[] {
  return lineup.map((slot) => {
    let currentName = slot.playerName;
    let currentPos = slot.position;
    let currentPlayerId = slot.playerId;

    for (const sub of slot.substitutions) {
      // 臨時代走（TR）は塁上のみの一時交代であり、元の捕手・投手の打順と守備位置を維持する
      if (sub.subType === "TR") continue;
      if (
        compareHalfInningOrder(sub.inning, sub.isBottom, inning, isBottom) <= 0
      ) {
        if (sub.newName) currentName = sub.newName;
        if (sub.newPosition) currentPos = sub.newPosition;
        if (sub.playerId !== undefined) currentPlayerId = sub.playerId;
      }
    }

    return {
      order: slot.order,
      position: currentPos,
      playerId: currentPlayerId,
      playerName: currentName,
    };
  });
}

const DIRECTION_TO_POS_CODE: Record<string, string> = {
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

export function resolvePrimaryPosCodeFromDirection(direction: string): string {
  const trimmed = (direction || "").trim();
  if (!trimmed) return "";
  if (DIRECTION_TO_POS_CODE[trimmed]) return DIRECTION_TO_POS_CODE[trimmed];
  if (trimmed.startsWith("左中") || trimmed.startsWith("右中")) {
    return "8";
  }
  if (trimmed.startsWith("一二")) return "4";
  if (trimmed.startsWith("二遊") || trimmed.startsWith("三遊")) return "6";
  const head = trimmed.slice(0, 1);
  return DIRECTION_TO_POS_CODE[head] || "";
}

export function findActiveDefenderByDirection(
  lineup: ReadonlyArray<LiveReportLineupSlot>,
  inning: number,
  isBottom: boolean,
  direction: string,
  showSurnameOnly: boolean
): string {
  const posCode = resolvePrimaryPosCodeFromDirection(direction);
  if (!posCode) return "";
  const active = resolveActiveLineupAtInning(lineup, inning, isBottom);
  const matched = active.find(
    (s) => normalizeReportPositionCode(s.position) === posCode
  );
  if (!matched || !matched.playerName) return "";
  return formatPlayerReportName(matched.playerName, showSurnameOnly);
}

// =========================================================
// 4. イニング内状況計算（アウト・残塁・走者氏名・得点・累計スコア）
// =========================================================

export function normalizeRunnersList(
  runners: ReadonlyArray<number>
): LiveReportBaseNum[] {
  const set = new Set<LiveReportBaseNum>();
  for (const r of runners) {
    if (r === 1 || r === 2 || r === 3) set.add(r);
  }
  return Array.from(set).sort((a, b) => a - b);
}

export function formatRunnersLabel(
  runners: ReadonlyArray<LiveReportBaseNum>,
  outs: number
): string {
  if (outs >= 3) return "";
  const sorted = normalizeRunnersList(runners);
  if (sorted.length === 0) return "";
  if (sorted.length === 3) return "満塁";
  if (sorted.length === 2) return `${sorted[0]}.${sorted[1]}塁`;
  return `${sorted[0]}塁`;
}

export function formatOutsAndRunnersSuffix(
  outs: number,
  runners: ReadonlyArray<LiveReportBaseNum>
): string {
  const clampedOuts = Math.max(0, Math.min(3, outs));
  const dots = "⚫️".repeat(clampedOuts);
  const baseStr = formatRunnersLabel(runners, clampedOuts);
  return `${dots}${baseStr}`;
}

export function sumHalfInningEntryRuns(
  entries: ReadonlyArray<LiveReportPlayEntry>
): number {
  return entries.reduce((sum, e) => sum + (e.runsScored || 0), 0);
}

export function getHalfInningRuns(half: LiveReportHalfInning | undefined): number {
  if (!half) return 0;
  if (typeof half.manualRunsOverride === "number") {
    return Math.max(0, half.manualRunsOverride);
  }
  return sumHalfInningEntryRuns(half.entries);
}

/**
 * 打席追加・取消・行編集・削除時に manualRunsOverride が古い値（初期0点固定等）のまま残って
 * 新しい得点更新を無効化してしまう不整合を防ぐ自動調停ヘルパー。
 */
export function reconcileHalfInningManualRuns(
  prevHalf: LiveReportHalfInning | undefined,
  nextEntries: ReadonlyArray<LiveReportPlayEntry>,
  mode: "append_or_remove" | "edit_entry"
): number | null {
  const prevOverride = prevHalf?.manualRunsOverride ?? null;
  if (prevOverride === null) return null;

  const prevEntries = prevHalf?.entries ?? [];
  const prevAuto = sumHalfInningEntryRuns(prevEntries);
  const nextAuto = sumHalfInningEntryRuns(nextEntries);
  const runsDelta = nextAuto - prevAuto;

  // 空イニングの初期値 0 オーバーライドに打席記録が入った場合は自動計算へ移行
  if (prevEntries.length === 0 && prevOverride === 0 && nextEntries.length > 0) {
    return null;
  }

  if (mode === "edit_entry") {
    if (runsDelta === 0) {
      // 既に打席側で得点が入っておりオーバーライドが 0 のまま残っていた場合は解除
      if (prevOverride === 0 && nextAuto > 0) return null;
      return prevOverride === nextAuto ? null : prevOverride;
    }
    if (prevOverride === 0) {
      return null;
    }
    // 打席側の得点が全て0でイニング合計のみ手動入力（または旧ログ取込）されていたケースでは二重計上を防ぐ
    if (prevAuto === 0 && prevOverride > 0) {
      return nextAuto >= prevOverride ? null : prevOverride;
    }
    const adjusted = Math.max(0, prevOverride + runsDelta);
    return adjusted === nextAuto ? null : adjusted;
  }

  // append_or_remove
  const adjusted = Math.max(0, prevOverride + runsDelta);
  return adjusted === nextAuto ? null : adjusted;
}

/**
 * 連結走塁（chainedPlays）を含む1行の最終アウト数・最終残塁を取得する。
 */
export function getEffectiveEntryFinalState(entry: LiveReportPlayEntry): {
  outsAfter: number;
  runnersAfter: LiveReportBaseNum[];
} {
  const lastChain =
    entry.chainedPlays && entry.chainedPlays.length > 0
      ? entry.chainedPlays[entry.chainedPlays.length - 1]
      : null;
  const rawOuts = lastChain ? lastChain.outsAfter : entry.outsAfter;
  const clampedOuts = Math.max(0, Math.min(3, rawOuts));
  const rawRunners = lastChain ? lastChain.runnersAfter : entry.runnersAfter;
  return {
    outsAfter: clampedOuts,
    runnersAfter: clampedOuts >= 3 ? [] : normalizeRunnersList(rawRunners),
  };
}

/**
 * 記録済み行の最終アウト数・最終残塁・得点を更新する（連結走塁がある場合は末尾の連結プレーへ確実に反映し、RBIも整合させる）。
 */
export function applyFinalStateToPlayEntry(
  entry: LiveReportPlayEntry,
  patch: {
    outsAfter?: number;
    runnersAfter?: ReadonlyArray<LiveReportBaseNum>;
    runsScored?: number;
  }
): LiveReportPlayEntry {
  const curFinal = getEffectiveEntryFinalState(entry);
  const nextOuts =
    patch.outsAfter !== undefined
      ? Math.max(0, Math.min(3, patch.outsAfter))
      : curFinal.outsAfter;
  const nextRunners =
    nextOuts >= 3
      ? []
      : patch.runnersAfter !== undefined
      ? normalizeRunnersList(patch.runnersAfter)
      : curFinal.runnersAfter;
  const nextRuns =
    patch.runsScored !== undefined
      ? Math.max(0, Math.round(patch.runsScored))
      : entry.runsScored;

  const chainedRunsSum = (entry.chainedPlays || []).reduce(
    (s, cp) => s + (cp.runsScored || 0),
    0
  );
  const resolvedBatterRbi = Math.max(0, nextRuns - chainedRunsSum);

  if (entry.chainedPlays && entry.chainedPlays.length > 0) {
    const nextChains = entry.chainedPlays.map((cp, idx) =>
      idx === entry.chainedPlays.length - 1
        ? {
            ...cp,
            outsAfter: nextOuts,
            runnersAfter: nextRunners,
          }
        : cp
    );
    return {
      ...entry,
      runsScored: nextRuns,
      rbi: resolvedBatterRbi > 0 ? resolvedBatterRbi : undefined,
      chainedPlays: nextChains,
    };
  }

  return {
    ...entry,
    outsAfter: nextOuts,
    runnersAfter: nextRunners,
    runsScored: nextRuns,
    rbi: resolvedBatterRbi > 0 ? resolvedBatterRbi : undefined,
  };
}

export interface HalfInningLiveSituation {
  outs: number;
  runners: LiveReportBaseNum[];
  runs: number;
  runnerNames?: Partial<Record<LiveReportBaseNum, string>>;
}

export function computeHalfInningSituation(
  half: LiveReportHalfInning | undefined
): HalfInningLiveSituation {
  if (!half) {
    return {
      outs: 0,
      runners: [],
      runs: 0,
      runnerNames: {},
    };
  }

  let outs = 0;
  let runners: LiveReportBaseNum[] = [];
  let runnerNames: Partial<Record<LiveReportBaseNum, string>> = {};

  for (const entry of half.entries) {
    if (entry.entryType === "substitution") {
      const meta = entry.subMeta;
      if (meta && (meta.subType === "PR" || meta.subType === "TR") && meta.newName) {
        if (meta.runnerBase && runners.includes(meta.runnerBase)) {
          runnerNames = { ...runnerNames, [meta.runnerBase]: meta.newName };
        } else {
          const matchedBase = ([3, 2, 1] as const).find(
            (b) =>
              runners.includes(b) &&
              meta.oldName &&
              runnerNames[b] &&
              runnerNames[b] === meta.oldName
          );
          const fallbackBase =
            matchedBase ??
            (runners.length === 1 ? runners[0] : undefined);
          if (fallbackBase) {
            runnerNames = { ...runnerNames, [fallbackBase]: meta.newName };
          }
        }
      }
      continue;
    }

    // イニング先頭打席前の走塁記録行（id: "br-..."）はアウト・残塁状況を前進させる
    if (entry.entryType === "note") {
      if (entry.id.startsWith("br-")) {
        const brOuts = Math.max(0, Math.min(3, entry.outsAfter));
        if (brOuts >= 3) {
          outs = 3;
          runners = [];
          runnerNames = {};
        } else {
          outs = brOuts;
          runners = normalizeRunnersList(entry.runnersAfter);
        }
      }
      continue;
    }

    if (entry.entryType !== "batter") continue;

    const prevRunners = [...runners];
    const prevNames = { ...runnerNames };
    const { outsAfter: finalOuts, runnersAfter: finalRunners } =
      getEffectiveEntryFinalState(entry);

    if (finalOuts >= 3) {
      outs = 3;
      runners = [];
      runnerNames = {};
      continue;
    }

    // 先行走者を先の塁から順に新しい残塁リストの先の塁へ対応付け、残った最も若い塁を打者走者に割り当てる
    const nextNames: Partial<Record<LiveReportBaseNum, string>> = {};
    const prevDesc = [...prevRunners].sort((a, b) => b - a);
    const nextDesc = [...finalRunners].sort((a, b) => b - a);
    const batterLabel =
      entry.batterName.trim() || `${entry.battingOrder}番打者`;

    // 打者が出塁していない（アウト増かつ走者数が増えず、単打/四死球等でない）かを簡易判定
    const batterLikelySafe =
      finalRunners.length > prevRunners.length ||
      /ヒット|安打|二塁打|三塁打|四球|敬遠|死球|エラー|失策|野選|振り逃げセーフ|振逃出塁|封殺/.test(
        entry.playText
      );

    if (batterLikelySafe && nextDesc.length > 0) {
      const batterBase = nextDesc[nextDesc.length - 1]!;
      nextNames[batterBase] = batterLabel;
      const slotsForPrev = nextDesc.slice(0, -1);
      for (let i = 0; i < slotsForPrev.length; i++) {
        const toB = slotsForPrev[i]!;
        const fromB = prevDesc[i];
        if (fromB && prevNames[fromB]) {
          nextNames[toB] = prevNames[fromB];
        }
      }
    } else {
      for (let i = 0; i < nextDesc.length; i++) {
        const toB = nextDesc[i]!;
        const fromB = prevDesc[i];
        if (fromB && prevNames[fromB]) {
          nextNames[toB] = prevNames[fromB];
        }
      }
    }

    outs = finalOuts;
    runners = finalRunners;
    runnerNames = nextNames;
  }

  const resolvedOuts =
    typeof half.manualOutsOverride === "number"
      ? Math.max(0, Math.min(3, Math.round(half.manualOutsOverride)))
      : outs;
  const resolvedRunners =
    resolvedOuts >= 3
      ? []
      : Array.isArray(half.manualRunnersOverride)
      ? normalizeRunnersList(half.manualRunnersOverride)
      : runners;

  return {
    outs: resolvedOuts,
    runners: resolvedRunners,
    runs: getHalfInningRuns(half),
    runnerNames: resolvedOuts >= 3 ? {} : runnerNames,
  };
}

export function isMyTeamBattingHalf(
  battingOrder: "first" | "second",
  isBottom: boolean
): boolean {
  return battingOrder === "first" ? !isBottom : isBottom;
}

export interface CumulativeScoreSummary {
  maxInning: number;
  firstInningScores: Array<number | null>;
  secondInningScores: Array<number | null>;
  firstTotal: number;
  secondTotal: number;
}

export function computeScoreboardSummary(
  doc: LiveReportV2Document,
  limitInning?: number,
  limitIsBottom?: boolean
): CumulativeScoreSummary {
  const recordedMax = doc.halfInnings.reduce(
    (mx, h) => Math.max(mx, h.inning),
    1
  );
  const maxInning = Math.max(
    doc.regulationInnings || 7,
    recordedMax,
    doc.activeInning || 1
  );

  const firstInningScores: Array<number | null> = [];
  const secondInningScores: Array<number | null> = [];
  let firstTotal = 0;
  let secondTotal = 0;

  for (let inn = 1; inn <= maxInning; inn++) {
    const topHalf = doc.halfInnings.find((h) => h.inning === inn && !h.isBottom);
    const botHalf = doc.halfInnings.find((h) => h.inning === inn && h.isBottom);

    const allowTop =
      limitInning === undefined ||
      compareHalfInningOrder(inn, false, limitInning, Boolean(limitIsBottom)) <= 0;
    const allowBot =
      limitInning === undefined ||
      compareHalfInningOrder(inn, true, limitInning, Boolean(limitIsBottom)) <= 0;

    const topPlayed =
      allowTop &&
      Boolean(
        topHalf &&
          (topHalf.entries.length > 0 || topHalf.manualRunsOverride !== null)
      );
    const botPlayed =
      allowBot &&
      Boolean(
        botHalf &&
          (botHalf.entries.length > 0 || botHalf.manualRunsOverride !== null)
      );

    if (topPlayed && topHalf) {
      const r = getHalfInningRuns(topHalf);
      firstInningScores.push(r);
      firstTotal += r;
    } else {
      firstInningScores.push(null);
    }

    if (botPlayed && botHalf) {
      const r = getHalfInningRuns(botHalf);
      secondInningScores.push(r);
      secondTotal += r;
    } else {
      secondInningScores.push(null);
    }
  }

  return {
    maxInning,
    firstInningScores,
    secondInningScores,
    firstTotal,
    secondTotal,
  };
}

// =========================================================
// 5. かんたん1打席シミュレーション（方向 × 打撃結果 → テキスト・アウト・残塁・得点）
// =========================================================

export type DirectOutcomeCode =
  | "strikeout_swing"
  | "strikeout_look"
  | "dropped_3rd_out"
  | "dropped_3rd_safe"
  | "walk"
  | "ibb"
  | "hbp";

export type DirectPlayVariant =
  | "so_foul_tip"
  | "walk_four_pitch"
  | "walk_full_count"
  | "walk_wp_2b"
  | "dts_wp_safe";

export type BattedOutcomeCode =
  | "groundout"
  | "hard_groundout"
  | "double_play"
  | "flyout"
  | "liner"
  | "foul_fly"
  | "sac_bunt"
  | "sac_fly"
  | "front_hit"
  | "hit"
  | "infield_hit"
  | "double"
  | "triple"
  | "homerun"
  | "rh_homerun"
  | "error"
  | "fc";

export type BattedPlayVariant =
  // ゴロ系
  | "ground_botebote"
  | "ground_high_bound"
  | "ground_force_2b"
  | "ground_force_home"
  | "ground_tag_out"
  // フライ・ライナー・併殺系
  | "fly_shallow"
  | "fly_deep"
  | "infield_fly"
  | "dp_liner"
  | "dp_fly_tag"
  | "dp_strikeout_cs"
  // 犠打・スクイズ系
  | "squeeze_score"
  | "safety_squeeze"
  | "bunt_fc_out"
  | "bunt_popup_out"
  | "squeeze_fail_out"
  // 安打・長打系
  | "hit_front"
  | "hit_poten"
  | "hit_clean"
  | "hit_line"
  | "hit_over"
  | "hit_gap"
  | "hit_liner"
  | "hit_hard"
  | "infield_botebote"
  | "bunt_hit"
  | "safety_bunt_hit"
  | "entitle_double"
  | "inside_park_hr"
  // エラー・野選系
  | "error_catch"
  | "error_throw"
  | "error_drop"
  | "error_pass_2b"
  | "fc_home_safe"
  | "fc_bunt_safe";

export type QuickBaserunningCode =
  | "steal_2b"
  | "steal_3b"
  | "double_steal"
  | "home_steal"
  | "delayed_steal"
  | "wp_advance"
  | "pb_advance"
  | "balk_advance"
  | "caught_stealing"
  | "pickoff_out"
  | "rundown_out";

export interface SimulatedPlayCandidate {
  id: string;
  chipLabel: string;
  playText: string;
  outsAfter: number;
  runnersAfter: LiveReportBaseNum[];
  runsScored: number;
}

export interface SimulatedBaserunningResult {
  mode: "inline" | "chained";
  playText: string;
  outsAfter: number;
  runnersAfter: LiveReportBaseNum[];
  runsScored: number;
}

function advanceForcedWalk(runnersBefore: ReadonlyArray<LiveReportBaseNum>): {
  runnersAfter: LiveReportBaseNum[];
  runs: number;
} {
  const has1 = runnersBefore.includes(1);
  const has2 = runnersBefore.includes(2);
  const has3 = runnersBefore.includes(3);

  if (!has1) {
    const next: LiveReportBaseNum[] = [1];
    if (has2) next.push(2);
    if (has3) next.push(3);
    return { runnersAfter: normalizeRunnersList(next), runs: 0 };
  }
  if (!has2) {
    const next: LiveReportBaseNum[] = [1, 2];
    if (has3) next.push(3);
    return { runnersAfter: normalizeRunnersList(next), runs: 0 };
  }
  if (!has3) {
    return { runnersAfter: [1, 2, 3], runs: 0 };
  }
  return { runnersAfter: [1, 2, 3], runs: 1 };
}

function hasDetailedDirSuffix(dir: string): boolean {
  return /(?:前|線|越|浅|深|間|強襲|後方|側|邪|破る)$/.test(dir);
}

function normalizeGapDirection(dir: string): string {
  if (dir === "左中") return "左中間";
  if (dir === "右中") return "右中間";
  return dir;
}

export function simulateDirectOutcome(
  code: DirectOutcomeCode,
  outsBefore: number,
  runnersBefore: ReadonlyArray<LiveReportBaseNum>,
  variant?: DirectPlayVariant | null
): SimulatedPlayCandidate {
  const runners = normalizeRunnersList(runnersBefore);

  if (code === "strikeout_swing") {
    const nextOuts = Math.min(3, outsBefore + 1);
    const label = variant === "so_foul_tip" ? "ファウルチップ三振" : "空三振";
    return {
      id: variant || "so_swing",
      chipLabel: label,
      playText: label,
      outsAfter: nextOuts,
      runnersAfter: nextOuts >= 3 ? [] : runners,
      runsScored: 0,
    };
  }
  if (code === "strikeout_look") {
    const nextOuts = Math.min(3, outsBefore + 1);
    return {
      id: "so_look",
      chipLabel: "見逃三振",
      playText: "見逃三振",
      outsAfter: nextOuts,
      runnersAfter: nextOuts >= 3 ? [] : runners,
      runsScored: 0,
    };
  }
  if (code === "dropped_3rd_out") {
    const nextOuts = Math.min(3, outsBefore + 1);
    // 野球規則 5.05(a)(2): 無死または一死で一塁に走者がいる場合、第3ストライク落球でも打者は自動的にアウト（振り逃げ不可）
    if (outsBefore < 2 && runners.includes(1)) {
      return {
        id: "dts_auto_out",
        chipLabel: "三振 (1塁走者あり自動アウト)",
        playText: "三振",
        outsAfter: nextOuts,
        runnersAfter: nextOuts >= 3 ? [] : runners,
        runsScored: 0,
      };
    }
    return {
      id: "dts_out",
      chipLabel: "振逃アウト",
      playText: "振逃",
      outsAfter: nextOuts,
      runnersAfter: nextOuts >= 3 ? [] : runners,
      runsScored: 0,
    };
  }
  if (code === "dropped_3rd_safe") {
    // 野球規則 5.05(a)(2): 無死または一死で一塁に走者がいる場合、打者は自動アウト（暴投時は既存走者のみ進塁可）
    if (outsBefore < 2 && runners.includes(1)) {
      const nextOuts = Math.min(3, outsBefore + 1);
      if (variant === "dts_wp_safe" && nextOuts < 3) {
        const nextR: LiveReportBaseNum[] = [];
        let scored = 0;
        for (const r of runners) {
          if (r === 3) scored += 1;
          else nextR.push((r + 1) as LiveReportBaseNum);
        }
        return {
          id: "dts_wp_batter_out",
          chipLabel: "三振＋暴投進塁 (打者アウト)",
          playText: scored > 0 ? `三振暴投${scored}点` : "三振暴投進塁",
          outsAfter: nextOuts,
          runnersAfter: normalizeRunnersList(nextR),
          runsScored: scored,
        };
      }
      return {
        id: "dts_auto_out",
        chipLabel: "三振 (1塁走者あり自動アウト)",
        playText: "三振",
        outsAfter: nextOuts,
        runnersAfter: nextOuts >= 3 ? [] : runners,
        runsScored: 0,
      };
    }

    if (variant === "dts_wp_safe") {
      const nextR: LiveReportBaseNum[] = [1];
      let scored = 0;
      for (const r of runners) {
        if (r === 3) scored += 1;
        else nextR.push((r + 1) as LiveReportBaseNum);
      }
      return {
        id: "dts_wp_safe",
        chipLabel: "暴投振逃出塁",
        playText: scored > 0 ? `暴投振逃${scored}点` : "暴投振逃",
        outsAfter: outsBefore,
        runnersAfter: normalizeRunnersList(nextR),
        runsScored: scored,
      };
    }
    const pushed = advanceForcedWalk(runners);
    return {
      id: "dts_safe",
      chipLabel: "振逃出塁",
      playText: pushed.runs > 0 ? `振逃${pushed.runs}点` : "振逃",
      outsAfter: outsBefore,
      runnersAfter: pushed.runnersAfter,
      runsScored: pushed.runs,
    };
  }

  if (code === "walk" && variant === "walk_wp_2b") {
    const nextR: LiveReportBaseNum[] = [2];
    let scored = 0;
    for (const r of runners) {
      if (r >= 2) scored += 1;
      else nextR.push(3);
    }
    return {
      id: "walk_wp_2b",
      chipLabel: "四球＋暴投二進",
      playText: scored > 0 ? `四球暴投${scored}点` : "四球暴投二進",
      outsAfter: outsBefore,
      runnersAfter: normalizeRunnersList(nextR),
      runsScored: scored,
    };
  }

  const labelMap: Record<"walk" | "ibb" | "hbp", string> = {
    walk:
      variant === "walk_four_pitch"
        ? "ストレート四球"
        : variant === "walk_full_count"
        ? "粘って四球"
        : "四球",
    ibb: "敬遠四球",
    hbp: "死球",
  };
  const baseLabel = labelMap[code];
  const pushed = advanceForcedWalk(runners);
  const text =
    pushed.runs > 0 ? `押し出し${baseLabel}${pushed.runs}点` : baseLabel;

  return {
    id: variant || code,
    chipLabel: baseLabel,
    playText: text,
    outsAfter: outsBefore,
    runnersAfter: pushed.runnersAfter,
    runsScored: pushed.runs,
  };
}

export function buildBattedPlayCandidates(
  direction: string,
  outcome: BattedOutcomeCode,
  outsBefore: number,
  runnersBefore: ReadonlyArray<LiveReportBaseNum>,
  variant?: BattedPlayVariant | null
): SimulatedPlayCandidate[] {
  const dir = (direction || "").trim();
  const normDir = normalizeGapDirection(dir);
  const runners = normalizeRunnersList(runnersBefore);
  const has1 = runners.includes(1);
  const has2 = runners.includes(2);
  const has3 = runners.includes(3);

  // 1. ゴロ・強襲ゴロ
  if (outcome === "groundout" || outcome === "hard_groundout") {
    const groundPrefix =
      outcome === "hard_groundout" || dir.endsWith("強襲")
        ? dir.endsWith("強襲")
          ? `${dir}ゴロ`
          : `${normDir}強襲ゴロ`
        : variant === "ground_botebote"
        ? `${normDir}ボテボテゴロ`
        : variant === "ground_high_bound"
        ? `${normDir}高いバウンドゴロ`
        : variant === "ground_tag_out"
        ? `${normDir}ゴロタッチアウト`
        : `${normDir}ゴロ`;

    const nextOuts = Math.min(3, outsBefore + 1);

    if (variant === "ground_force_home" && has1 && has2 && has3) {
      return [
        {
          id: "go_fc_home",
          chipLabel: "本塁封殺 (無得点)",
          playText: `${normDir}ゴロ本塁封殺`,
          outsAfter: nextOuts,
          runnersAfter: nextOuts >= 3 ? [] : [1, 2, 3],
          runsScored: 0,
        },
      ];
    }

    if (variant === "ground_force_home" && has3) {
      const rem: LiveReportBaseNum[] = [1];
      if (has1) rem.push(2);
      if (has2) rem.push(3);
      return [
        {
          id: "go_fc_home",
          chipLabel: "本塁タッチアウト (無得点)",
          playText: `${normDir}ゴロ本塁憤死`,
          outsAfter: nextOuts,
          runnersAfter: nextOuts >= 3 ? [] : normalizeRunnersList(rem),
          runsScored: 0,
        },
      ];
    }

    if (variant === "ground_force_2b" && has1) {
      const remAfterScore: LiveReportBaseNum[] = [1];
      if (has2) remAfterScore.push(3);
      if (nextOuts >= 3) {
        return [
          {
            id: "go_fc_2b_var",
            chipLabel: "二塁封殺 (3死)",
            playText: `${normDir}ゴロ二塁封殺`,
            outsAfter: nextOuts,
            runnersAfter: [],
            runsScored: 0,
          },
        ];
      }
      if (has3) {
        const fcCandidates: SimulatedPlayCandidate[] = [
          {
            id: "go_fc_2b_score",
            chipLabel: "二塁封殺・3塁走者生還 (+1点)",
            playText: `${normDir}ゴロ二塁封殺の間1点`,
            outsAfter: nextOuts,
            runnersAfter: normalizeRunnersList(remAfterScore),
            runsScored: 1,
          },
        ];
        if (!has2) {
          fcCandidates.push({
            id: "go_fc_2b_hold3",
            chipLabel: "二塁封殺 (1.3塁・無得点)",
            playText: `${normDir}ゴロ二塁封殺`,
            outsAfter: nextOuts,
            runnersAfter: [1, 3],
            runsScored: 0,
          });
        }
        return fcCandidates;
      }
      return [
        {
          id: "go_fc_2b_var",
          chipLabel: "二塁封殺",
          playText: `${normDir}ゴロ二塁封殺`,
          outsAfter: nextOuts,
          runnersAfter: normalizeRunnersList(remAfterScore),
          runsScored: 0,
        },
      ];
    }

    if (nextOuts >= 3 || runners.length === 0) {
      return [
        {
          id: "go_std",
          chipLabel: "通常アウト",
          playText: groundPrefix,
          outsAfter: nextOuts,
          runnersAfter: [],
          runsScored: 0,
        },
      ];
    }

    const candidates: SimulatedPlayCandidate[] = [];

    // 進塁ゴロパターン（例: 三ゴロ一塁走者進塁 ⚫️2塁）
    if (has1 && !has2 && !has3) {
      candidates.push({
        id: "go_adv1",
        chipLabel: "一塁走者進塁 (2塁)",
        playText: `${groundPrefix}一塁走者進塁`,
        outsAfter: nextOuts,
        runnersAfter: [2],
        runsScored: 0,
      });
    } else if (!has1 && has2 && !has3) {
      candidates.push({
        id: "go_adv2",
        chipLabel: "二塁走者進塁 (3塁)",
        playText: `${groundPrefix}二塁走者進塁`,
        outsAfter: nextOuts,
        runnersAfter: [3],
        runsScored: 0,
      });
    } else if (has1 && has2 && !has3) {
      candidates.push({
        id: "go_adv12",
        chipLabel: "それぞれ進塁 (2.3塁)",
        playText: `${groundPrefix}走者進塁`,
        outsAfter: nextOuts,
        runnersAfter: [2, 3],
        runsScored: 0,
      });
    }

    // 3塁走者生還（ゴロの間1点）
    if (has3) {
      const rem: LiveReportBaseNum[] = [];
      if (has2) rem.push(3);
      if (has1) rem.push(2);
      candidates.push({
        id: "go_score",
        chipLabel: "3塁走者生還 (+1点)",
        playText: `${groundPrefix}の間1点`,
        outsAfter: nextOuts,
        runnersAfter: normalizeRunnersList(rem),
        runsScored: 1,
      });
    }

    // 走者そのまま（釘付け / フォースアウト入替で1塁残る等）
    candidates.push({
      id: "go_hold",
      chipLabel: `走者そのまま (${formatRunnersLabel(runners, nextOuts)})`,
      playText: groundPrefix,
      outsAfter: nextOuts,
      runnersAfter: runners,
      runsScored: 0,
    });

    // 封殺で1塁に残るケース（例: 2塁走者3塁アウトや2塁フォースアウト）
    if (has1 && has2 && !has3) {
      candidates.push({
        id: "go_fc_2b",
        chipLabel: "二塁封殺 (1.3塁)",
        playText: `${groundPrefix}二塁封殺`,
        outsAfter: nextOuts,
        runnersAfter: [1, 3],
        runsScored: 0,
      });
    }

    // 併殺打パターン（2アウト未満）
    if (outsBefore <= 1 && has1) {
      const dpOuts = Math.min(3, outsBefore + 2);
      if (dpOuts < 3 && has3) {
        candidates.push({
          id: "go_dp_score",
          chipLabel: "併殺・3塁生還 (+1点)",
          playText: `${groundPrefix}併殺の間1点`,
          outsAfter: dpOuts,
          runnersAfter: has2 ? [3] : [],
          runsScored: 1,
        });
        candidates.push({
          id: "go_dp",
          chipLabel: "併殺・無得点",
          playText: `${groundPrefix}併殺`,
          outsAfter: dpOuts,
          runnersAfter: has2 ? [2, 3] : [3],
          runsScored: 0,
        });
      } else {
        const dpRem: LiveReportBaseNum[] =
          dpOuts < 3 && has2 ? [3] : [];
        candidates.push({
          id: "go_dp",
          chipLabel: "併殺 (ダブルプレー)",
          playText: `${groundPrefix}併殺`,
          outsAfter: dpOuts,
          runnersAfter: dpRem,
          runsScored: 0,
        });
      }
    }

    return candidates;
  }

  // 2. 併殺（直接選択）
  if (outcome === "double_play") {
    // 2死または走者なしでは併殺不可のため通常1アウトへ安全フォールバック
    if (outsBefore >= 2 || runners.length === 0) {
      const fallbackOuts = Math.min(3, outsBefore + 1);
      const fallbackText =
        variant === "dp_liner"
          ? `${normDir}ライナー`
          : variant === "dp_fly_tag"
          ? `${normDir}フライ`
          : variant === "dp_strikeout_cs"
          ? "三振"
          : `${normDir}ゴロ`;
      return [
        {
          id: "dp_fallback_single_out",
          chipLabel: `${fallbackText} (1アウト)`,
          playText: fallbackText,
          outsAfter: fallbackOuts,
          runnersAfter: fallbackOuts >= 3 ? [] : runners,
          runsScored: 0,
        },
      ];
    }

    const dpOuts = Math.min(3, outsBefore + 2);
    // ライナー併殺・フライ併殺・三振盗塁死併殺では打者＋走者1名がアウトとなり、残りの走者は塁上に残る
    const remAfterAerialOrCsDp: LiveReportBaseNum[] =
      dpOuts >= 3 ? [] : runners.slice(1);

    if (variant === "dp_strikeout_cs") {
      return [
        {
          id: "dp_k_cs",
          chipLabel: "三振＋盗塁死併殺",
          playText: "三振併殺",
          outsAfter: dpOuts,
          runnersAfter: remAfterAerialOrCsDp,
          runsScored: 0,
        },
      ];
    }
    if (variant === "dp_liner") {
      return [
        {
          id: "dp_liner_var",
          chipLabel: `${normDir}ライナー併殺`,
          playText: `${normDir}ライナー併殺`,
          outsAfter: dpOuts,
          runnersAfter: remAfterAerialOrCsDp,
          runsScored: 0,
        },
      ];
    }
    if (variant === "dp_fly_tag") {
      const remAfterFlyDp: LiveReportBaseNum[] =
        dpOuts >= 3
          ? []
          : has3
          ? runners.filter((r) => r !== 3)
          : runners.slice(1);
      return [
        {
          id: "dp_fly_var",
          chipLabel: `${normDir}フライ併殺`,
          playText: `${normDir}フライ併殺`,
          outsAfter: dpOuts,
          runnersAfter: remAfterFlyDp,
          runsScored: 0,
        },
      ];
    }

    if (!has1) {
      return [
        {
          id: "dp_liner",
          chipLabel: `${normDir}ライナー併殺`,
          playText: `${normDir}ライナー併殺`,
          outsAfter: dpOuts,
          runnersAfter: remAfterAerialOrCsDp,
          runsScored: 0,
        },
        {
          id: "dp_std",
          chipLabel: `${normDir}ゴロ併殺`,
          playText: `${normDir}ゴロ併殺`,
          outsAfter: dpOuts,
          runnersAfter: remAfterAerialOrCsDp,
          runsScored: 0,
        },
      ];
    }

    if (dpOuts < 3 && has3) {
      return [
        {
          id: "dp_std_score",
          chipLabel: `${normDir}ゴロ併殺・3塁生還 (+1点)`,
          playText: `${normDir}ゴロ併殺の間1点`,
          outsAfter: dpOuts,
          runnersAfter: has2 ? [3] : [],
          runsScored: 1,
        },
        {
          id: "dp_std",
          chipLabel: `${normDir}ゴロ併殺 (無得点)`,
          playText: `${normDir}ゴロ併殺`,
          outsAfter: dpOuts,
          runnersAfter: has2 ? [2, 3] : [3],
          runsScored: 0,
        },
        {
          id: "dp_liner",
          chipLabel: `${normDir}ライナー併殺`,
          playText: `${normDir}ライナー併殺`,
          outsAfter: dpOuts,
          runnersAfter: remAfterAerialOrCsDp,
          runsScored: 0,
        },
      ];
    }

    const gdpRem: LiveReportBaseNum[] = dpOuts < 3 && has2 ? [3] : [];
    return [
      {
        id: "dp_std",
        chipLabel: `${normDir}ゴロ併殺`,
        playText: `${normDir}ゴロ併殺`,
        outsAfter: dpOuts,
        runnersAfter: gdpRem,
        runsScored: 0,
      },
      {
        id: "dp_liner",
        chipLabel: `${normDir}ライナー併殺`,
        playText: `${normDir}ライナー併殺`,
        outsAfter: dpOuts,
        runnersAfter: remAfterAerialOrCsDp,
        runsScored: 0,
      },
    ];
  }

  // 3. フライ・ライナー・邪飛
  if (outcome === "flyout" || outcome === "liner" || outcome === "foul_fly") {
    // 野球規則 Definition of Infield Fly: 無死または一死で一・二塁または満塁のときのみ成立
    const isLegalInfieldFly =
      variant === "infield_fly" && outsBefore < 2 && has1 && has2;
    let baseWord: string;
    if (outcome === "flyout") {
      if (isLegalInfieldFly) {
        const isOutfieldWord =
          /^(?:[左中右]|左翼|中堅|右翼|左中間|右中間|レフト|センター|ライト)/.test(
            normDir
          );
        baseWord =
          normDir && !isOutfieldWord
            ? `${normDir}インフィールドフライ`
            : "インフィールドフライ";
      } else if (variant === "fly_shallow" || dir.endsWith("浅")) {
        const cleanHead = dir.endsWith("浅") ? dir.slice(0, -1) : normDir;
        baseWord = `${cleanHead}浅いフライ`;
      } else if (variant === "fly_deep" || dir.endsWith("深")) {
        const cleanHead = dir.endsWith("深") ? dir.slice(0, -1) : normDir;
        baseWord = `${cleanHead}深いフライ`;
      } else {
        baseWord = `${normDir}フライ`;
      }
    } else if (outcome === "liner") {
      baseWord = `${normDir}ライナー`;
    } else {
      baseWord = dir.endsWith("邪")
        ? `${dir}飛`
        : `${normDir}邪飛`;
    }

    const nextOuts = Math.min(3, outsBefore + 1);

    const list: SimulatedPlayCandidate[] = [
      {
        id: "air_std",
        chipLabel: "通常アウト (走者そのまま)",
        playText: baseWord,
        outsAfter: nextOuts,
        runnersAfter: nextOuts >= 3 ? [] : runners,
        runsScored: 0,
      },
    ];

    if (
      nextOuts < 3 &&
      has3 &&
      outcome !== "liner" &&
      !isLegalInfieldFly
    ) {
      const rem = runners.filter((r) => r !== 3);
      list.push({
        id: "air_sf",
        chipLabel: "タッチアップ生還 (犠飛+1点)",
        playText: `${normDir}犠飛1点`,
        outsAfter: nextOuts,
        runnersAfter: rem,
        runsScored: 1,
      });
    }

    if (nextOuts < 3 && has2 && !has3 && !isLegalInfieldFly) {
      const rem = normalizeRunnersList(
        runners.map((r) => (r === 2 ? 3 : r)) as LiveReportBaseNum[]
      );
      list.push({
        id: "air_tag3",
        chipLabel: "二塁走者タッチアップ (3塁へ)",
        playText: `${baseWord}二塁走者三進`,
        outsAfter: nextOuts,
        runnersAfter: rem,
        runsScored: 0,
      });
    }

    return list;
  }

  // 4. 送りバント・スクイズ・犠飛
  if (outcome === "sac_bunt") {
    const nextOuts = Math.min(3, outsBefore + 1);

    // 野球規則 9.08(a): 2死または走者なしでは犠打は成立しないためバントゴロ（凡打）扱い
    if (outsBefore >= 2 || runners.length === 0) {
      return [
        {
          id: "bunt_groundout",
          chipLabel: "バントゴロアウト",
          playText:
            variant === "bunt_popup_out"
              ? `${normDir}バント飛球`
              : `${normDir}バントゴロ`,
          outsAfter: nextOuts,
          runnersAfter: nextOuts >= 3 ? [] : runners,
          runsScored: 0,
        },
      ];
    }

    if (variant === "bunt_fc_out") {
      const fcRunners: LiveReportBaseNum[] = [1];
      if (has1 && has2 && !has3) fcRunners.push(2);
      else if (has1 && has2 && has3) fcRunners.push(2, 3);
      return [
        {
          id: "bunt_fc_out",
          chipLabel: "バント失敗・先行走者封殺",
          playText: `${normDir}バント失敗封殺`,
          outsAfter: nextOuts,
          runnersAfter: nextOuts >= 3 ? [] : normalizeRunnersList(fcRunners),
          runsScored: 0,
        },
      ];
    }

    if (variant === "bunt_popup_out") {
      return [
        {
          id: "bunt_popup_out",
          chipLabel: "バント小飛球アウト",
          playText: `${normDir}バント飛球`,
          outsAfter: nextOuts,
          runnersAfter: nextOuts >= 3 ? [] : runners,
          runsScored: 0,
        },
      ];
    }

    if (variant === "squeeze_fail_out" && has3) {
      const rem: LiveReportBaseNum[] = [1];
      for (const r of runners) {
        if (r !== 3) rem.push(r);
      }
      return [
        {
          id: "squeeze_fail_out",
          chipLabel: "スクイズ失敗 (3塁走者アウト)",
          playText: `${normDir}スクイズ失敗`,
          outsAfter: nextOuts,
          runnersAfter: nextOuts >= 3 ? [] : normalizeRunnersList(rem),
          runsScored: 0,
        },
      ];
    }

    if ((variant === "squeeze_score" || variant === "safety_squeeze") && has3) {
      const rem: LiveReportBaseNum[] = [];
      for (const r of runners) {
        if (r !== 3) rem.push((r + 1) as LiveReportBaseNum);
      }
      const sqWord =
        variant === "safety_squeeze" ? "セーフティスクイズ" : "スクイズ";
      const sqRuns = nextOuts >= 3 ? 0 : 1;
      return [
        {
          id: variant,
          chipLabel: `${sqWord}成功 (+1点)`,
          playText: `${normDir}${sqWord}${sqRuns > 0 ? "1点" : ""}`,
          outsAfter: nextOuts,
          runnersAfter: nextOuts >= 3 ? [] : normalizeRunnersList(rem),
          runsScored: sqRuns,
        },
      ];
    }

    const nextRunners: LiveReportBaseNum[] = [];
    let runs = 0;
    for (const r of runners) {
      if (r === 3) runs += 1;
      else nextRunners.push((r + 1) as LiveReportBaseNum);
    }
    const candidates: SimulatedPlayCandidate[] = [
      {
        id: "bunt_std",
        chipLabel: runs > 0 ? `スクイズ成功 (+${runs}点)` : "送りバント成功",
        playText:
          runs > 0 ? `${normDir}スクイズ${runs}点` : `${normDir}送りバント`,
        outsAfter: nextOuts,
        runnersAfter: nextOuts >= 3 ? [] : normalizeRunnersList(nextRunners),
        runsScored: nextOuts >= 3 ? 0 : runs,
      },
    ];
    if (runs > 0) {
      candidates.push({
        id: "bunt_hold3",
        chipLabel: "3塁ストップ (無得点)",
        playText: `${normDir}送りバント`,
        outsAfter: nextOuts,
        runnersAfter:
          nextOuts >= 3
            ? []
            : normalizeRunnersList([
                3,
                ...(has1 ? ([2] as LiveReportBaseNum[]) : []),
              ]),
        runsScored: 0,
      });
    }
    return candidates;
  }

  if (outcome === "sac_fly") {
    const nextOuts = Math.min(3, outsBefore + 1);
    // 野球規則 9.08(d): 2死または本塁生還走者なしでは犠飛は成立しないため通常の飛球凡退扱い
    if (nextOuts >= 3 || !has3) {
      const fallbackList: SimulatedPlayCandidate[] = [
        {
          id: "sf_flyout",
          chipLabel: `${normDir}フライ (無得点)`,
          playText: `${normDir}フライ`,
          outsAfter: nextOuts,
          runnersAfter: nextOuts >= 3 ? [] : runners,
          runsScored: 0,
        },
      ];
      if (nextOuts < 3 && has2) {
        const remTag3 = normalizeRunnersList(
          runners.map((r) => (r === 2 ? 3 : r)) as LiveReportBaseNum[]
        );
        fallbackList.push({
          id: "sf_tag3",
          chipLabel: "二塁走者タッチアップ (3塁へ)",
          playText: `${normDir}フライ二塁走者三進`,
          outsAfter: nextOuts,
          runnersAfter: remTag3,
          runsScored: 0,
        });
      }
      return fallbackList;
    }

    const rem = runners.filter((r) => r !== 3);
    return [
      {
        id: "sf_std",
        chipLabel: "犠飛 (+1点)",
        playText: `${normDir}犠飛1点`,
        outsAfter: nextOuts,
        runnersAfter: rem,
        runsScored: 1,
      },
    ];
  }

  // 5. 単打系（前ヒット / ヒット / 内野安打 ＋ フリック詳細バリエーション）
  if (
    outcome === "front_hit" ||
    outcome === "hit" ||
    outcome === "infield_hit"
  ) {
    const isInfieldStyle =
      outcome === "infield_hit" ||
      variant === "infield_botebote" ||
      variant === "bunt_hit" ||
      variant === "safety_bunt_hit";

    const makeSingleText = (runs: number): string => {
      const timely = runs > 0 ? "適時" : "";
      const runStr = runs > 0 ? `${runs}点` : "";

      if (variant === "bunt_hit") {
        return `${normDir}${timely}バント安打${runStr}`;
      }
      if (variant === "safety_bunt_hit") {
        return `${normDir}${timely}セーフティバント安打${runStr}`;
      }
      if (variant === "infield_botebote") {
        return `${normDir}ボテボテ${timely}内野安打${runStr}`;
      }
      if (outcome === "infield_hit") {
        const hardMark =
          variant === "hit_hard" && !normDir.endsWith("強襲") ? "強襲" : "";
        return `${normDir}${hardMark}${timely}内野安打${runStr}`;
      }

      // 外野・一般安打のニュアンス組み立て
      if (variant === "hit_poten" || dir.endsWith("浅")) {
        const baseHead = dir.endsWith("浅")
          ? `${dir.slice(0, -1)}前`
          : !dir
          ? ""
          : hasDetailedDirSuffix(normDir)
          ? normDir
          : normDir === "左" || normDir === "中" || normDir === "右"
          ? `${normDir}前`
          : normDir;
        return `${baseHead}ポテン${timely}ヒット${runStr}`;
      }

      if (variant === "hit_line") {
        const lineHead = !dir
          ? "ライン際"
          : normDir.endsWith("線")
          ? normDir
          : normDir === "左" || normDir === "右" || normDir === "一" || normDir === "三"
          ? `${normDir}線`
          : `${normDir}ライン際`;
        return `${lineHead}${timely}ヒット${runStr}`;
      }

      if (variant === "hit_clean") {
        const cleanHead = !dir
          ? ""
          : hasDetailedDirSuffix(normDir)
          ? normDir
          : normDir === "左" || normDir === "中" || normDir === "右"
          ? `${normDir}前`
          : normDir;
        return `${cleanHead}クリーン${timely}ヒット${runStr}`;
      }

      if (variant === "hit_liner") {
        return `${normDir}ライナー${timely}ヒット${runStr}`;
      }

      if (variant === "hit_hard") {
        const hardHead = normDir.endsWith("強襲") ? normDir : `${normDir}強襲`;
        return `${hardHead}${timely}ヒット${runStr}`;
      }

      if (variant === "hit_over") {
        const overHead = !dir
          ? "外野越"
          : normDir.endsWith("越")
          ? normDir
          : `${normDir}越`;
        return `${overHead}${timely}ヒット${runStr}`;
      }

      if (variant === "hit_gap") {
        const gapHead =
          normDir === "左"
            ? "左中間"
            : normDir === "右"
            ? "右中間"
            : normDir || "外野間";
        return `${gapHead}${timely}ヒット${runStr}`;
      }

      if (outcome === "front_hit" || variant === "hit_front") {
        const frontHead = !dir
          ? ""
          : hasDetailedDirSuffix(normDir)
          ? normDir
          : `${normDir}前`;
        return `${frontHead}${timely}ヒット${runStr}`;
      }

      return `${normDir}${timely}ヒット${runStr}`;
    };

    if (runners.length === 0) {
      return [
        {
          id: "1b_empty",
          chipLabel: "1塁出塁",
          playText: makeSingleText(0),
          outsAfter: outsBefore,
          runnersAfter: [1],
          runsScored: 0,
        },
      ];
    }

    const candidates: SimulatedPlayCandidate[] = [];

    // 内野安打・バント安打時は1つずつ進塁を先頭に
    if (isInfieldStyle) {
      const oneBaseRunners: LiveReportBaseNum[] = [1];
      let oneBaseRuns = 0;
      if (has1) oneBaseRunners.push(2);
      if (has2) oneBaseRunners.push(3);
      if (has3) oneBaseRuns += 1;
      candidates.push({
        id: "1b_inf_one",
        chipLabel:
          oneBaseRuns > 0
            ? `1つずつ進塁 (+${oneBaseRuns}点・${formatRunnersLabel(oneBaseRunners, 0)})`
            : `1つずつ進塁 (${formatRunnersLabel(oneBaseRunners, 0)})`,
        playText: makeSingleText(oneBaseRuns),
        outsAfter: outsBefore,
        runnersAfter: normalizeRunnersList(oneBaseRunners),
        runsScored: oneBaseRuns,
      });
    }

    // 標準外野前ヒット: 2・3塁生還、1塁→2塁
    {
      const stdRunners: LiveReportBaseNum[] = [1];
      let stdRuns = 0;
      if (has1) stdRunners.push(2);
      if (has2) stdRuns += 1;
      if (has3) stdRuns += 1;
      candidates.push({
        id: "1b_std",
        chipLabel:
          stdRuns > 0
            ? `適時ヒット (+${stdRuns}点・${formatRunnersLabel(stdRunners, 0)})`
            : `1・2塁 (${formatRunnersLabel(stdRunners, 0)})`,
        playText: makeSingleText(stdRuns),
        outsAfter: outsBefore,
        runnersAfter: normalizeRunnersList(stdRunners),
        runsScored: stdRuns,
      });
    }

    // 1塁走者が3塁まで好走塁するパターン
    if (has1) {
      const aggrRunners: LiveReportBaseNum[] = [1, 3];
      const aggrRuns = (has2 ? 1 : 0) + (has3 ? 1 : 0);
      candidates.push({
        id: "1b_1to3",
        chipLabel:
          aggrRuns > 0
            ? `1塁走者も3塁へ (+${aggrRuns}点・1.3塁)`
            : "1塁走者3塁へ (1.3塁)",
        playText: makeSingleText(aggrRuns),
        outsAfter: outsBefore,
        runnersAfter: aggrRunners,
        runsScored: aggrRuns,
      });
    }

    // 2塁走者が3塁ストップするパターン（ポテンヒット等でもよく発生）
    if (has2 && !isInfieldStyle) {
      const holdRunners: LiveReportBaseNum[] = [1, 3];
      if (has1) holdRunners.push(2);
      const holdRuns = has3 ? 1 : 0;
      candidates.push({
        id: "1b_hold3",
        chipLabel:
          holdRuns > 0
            ? `2塁走者3塁ストップ (+${holdRuns}点・${formatRunnersLabel(holdRunners, 0)})`
            : `2塁走者3塁ストップ (${formatRunnersLabel(holdRunners, 0)})`,
        playText: makeSingleText(holdRuns),
        outsAfter: outsBefore,
        runnersAfter: normalizeRunnersList(holdRunners),
        runsScored: holdRuns,
      });
    }

    return candidates;
  }

  // 6. 二塁打
  if (outcome === "double") {
    const makeDoubleText = (runs: number): string => {
      const timely = runs > 0 ? "適時" : "";
      const runStr = runs > 0 ? `${runs}点` : "";

      if (variant === "entitle_double") {
        return `${normDir}${timely}エンタイトル二塁打${runStr}`;
      }
      if (variant === "hit_poten" || dir.endsWith("浅")) {
        const cleanHead = dir.endsWith("浅")
          ? `${dir.slice(0, -1)}前`
          : normDir === "左" || normDir === "中" || normDir === "右"
          ? `${normDir}前`
          : normDir;
        return `${cleanHead}ポテン${timely}二塁打${runStr}`;
      }
      if (variant === "hit_line") {
        const lineHead = !dir
          ? "ライン際"
          : normDir.endsWith("線")
          ? normDir
          : normDir === "左" || normDir === "右" || normDir === "一" || normDir === "三"
          ? `${normDir}線`
          : `${normDir}ライン際`;
        return `${lineHead}${timely}二塁打${runStr}`;
      }
      if (variant === "hit_gap") {
        const gapHead =
          normDir === "左"
            ? "左中間破る"
            : normDir === "右"
            ? "右中間破る"
            : normDir.endsWith("破る")
            ? normDir
            : `${normDir || "外野間"}破る`;
        return `${gapHead}${timely}二塁打${runStr}`;
      }
      if (variant === "hit_over") {
        const overHead = !dir
          ? "外野越"
          : normDir.endsWith("越")
          ? normDir
          : `${normDir}越`;
        return `${overHead}${timely}二塁打${runStr}`;
      }

      if (dir === "左中" || dir === "右中" || normDir === "左中間" || normDir === "右中間") {
        return `${normDir}${timely}二塁打${runStr}`;
      }
      if (dir.endsWith("深")) {
        return `${dir.slice(0, -1)}越${timely}二塁打${runStr}`;
      }
      if (hasDetailedDirSuffix(normDir)) {
        return `${normDir}${timely}二塁打${runStr}`;
      }
      const overMark = dir === "左" || dir === "中" || dir === "右" ? "越" : "";
      return `${normDir}${overMark}${timely}二塁打${runStr}`;
    };

    if (runners.length === 0) {
      return [
        {
          id: "2b_empty",
          chipLabel: "2塁到達",
          playText: makeDoubleText(0),
          outsAfter: outsBefore,
          runnersAfter: [2],
          runsScored: 0,
        },
      ];
    }

    const candidates: SimulatedPlayCandidate[] = [];
    // 標準: 2・3塁生還、1塁→3塁（エンタイトル二塁打はこの2ベース進塁に固定）
    const stdRuns = (has2 ? 1 : 0) + (has3 ? 1 : 0);
    const stdRunners: LiveReportBaseNum[] = has1 ? [2, 3] : [2];
    candidates.push({
      id: "2b_std",
      chipLabel:
        stdRuns > 0
          ? `標準 (+${stdRuns}点・${formatRunnersLabel(stdRunners, 0)})`
          : `2.3塁 (${formatRunnersLabel(stdRunners, 0)})`,
      playText: makeDoubleText(stdRuns),
      outsAfter: outsBefore,
      runnersAfter: stdRunners,
      runsScored: stdRuns,
    });

    // 1塁走者も一気に本塁生還（エンタイトル二塁打以外）
    if (has1 && variant !== "entitle_double") {
      const allRuns = runners.length;
      candidates.push({
        id: "2b_clear",
        chipLabel: `走者一掃 (+${allRuns}点・2塁)`,
        playText: makeDoubleText(allRuns),
        outsAfter: outsBefore,
        runnersAfter: [2],
        runsScored: allRuns,
      });
    }

    return candidates;
  }

  // 7. 三塁打
  if (outcome === "triple") {
    const runs = runners.length;
    const timely = runs > 0 ? "適時" : "";
    const runStr = runs > 0 ? `${runs}点` : "";
    let cleanDir: string;
    if (variant === "hit_line") {
      cleanDir = !dir
        ? "ライン際"
        : normDir.endsWith("線")
        ? normDir
        : `${normDir}線`;
    } else if (variant === "hit_gap") {
      cleanDir =
        normDir === "左"
          ? "左中間破る"
          : normDir === "右"
          ? "右中間破る"
          : normDir.endsWith("破る")
          ? normDir
          : `${normDir || "外野間"}破る`;
    } else if (hasDetailedDirSuffix(normDir)) {
      cleanDir = normDir;
    } else if (dir === "左" || dir === "中" || dir === "右") {
      cleanDir = `${dir}越`;
    } else {
      cleanDir = normDir;
    }

    return [
      {
        id: "3b_std",
        chipLabel: runs > 0 ? `+${runs}点・3塁` : "3塁到達",
        playText: `${cleanDir}${timely}三塁打${runStr}`,
        outsAfter: outsBefore,
        runnersAfter: [3],
        runsScored: runs,
      },
    ];
  }

  // 8. 本塁打 / ランニング本塁打
  if (outcome === "homerun" || outcome === "rh_homerun") {
    const isInsidePark =
      outcome === "rh_homerun" || variant === "inside_park_hr";
    const runs = runners.length + 1;
    const cleanDir =
      variant === "hit_line"
        ? !dir
          ? "ポール際"
          : normDir.endsWith("線")
          ? normDir
          : `${normDir}線`
        : hasDetailedDirSuffix(normDir)
        ? normDir
        : !isInsidePark && (dir === "左" || dir === "中" || dir === "右")
        ? `${dir}越`
        : normDir;
    const word = isInsidePark ? "ランニング本塁打" : "本塁打";
    return [
      {
        id: "hr_std",
        chipLabel: `${runs}点${word}`,
        playText: `${cleanDir}${word}${runs}点`,
        outsAfter: outsBefore,
        runnersAfter: [],
        runsScored: runs,
      },
    ];
  }

  // 9. エラー・野選
  if (outcome === "error" && variant === "error_pass_2b") {
    const nextR: LiveReportBaseNum[] = [2];
    let runs = 0;
    for (const r of runners) {
      if (r >= 2) runs += 1;
      else nextR.push(3);
    }
    const passWord = `${normDir}後逸エラー`;
    return [
      {
        id: "error_pass_2b",
        chipLabel:
          runs > 0
            ? `+${runs}点・${formatRunnersLabel(nextR, 0)}`
            : `${formatRunnersLabel(nextR, 0)}`,
        playText: runs > 0 ? `${passWord}${runs}点` : passWord,
        outsAfter: outsBefore,
        runnersAfter: normalizeRunnersList(nextR),
        runsScored: runs,
      },
    ];
  }

  const word =
    outcome === "error"
      ? variant === "error_catch"
        ? `${normDir}捕球エラー`
        : variant === "error_throw"
        ? `${normDir}悪送球エラー`
        : variant === "error_drop"
        ? `${normDir}落球エラー`
        : `${normDir}エラー`
      : variant === "fc_home_safe"
      ? `${normDir}本塁野選`
      : variant === "fc_bunt_safe"
      ? `${normDir}バント野選`
      : `${normDir}野選`;

  const nextRunners: LiveReportBaseNum[] = [1];
  let runs = 0;
  for (const r of runners) {
    if (r === 3) runs += 1;
    else nextRunners.push((r + 1) as LiveReportBaseNum);
  }
  if (outcome === "fc" && variant === "fc_home_safe" && runs === 0 && has3) {
    runs = 1;
  }
  return [
    {
      id: `${outcome}_${variant || "std"}`,
      chipLabel:
        runs > 0
          ? `+${runs}点・${formatRunnersLabel(nextRunners, 0)}`
          : `${formatRunnersLabel(nextRunners, 0)}`,
      playText: runs > 0 ? `${word}${runs}点` : word,
      outsAfter: outsBefore,
      runnersAfter: normalizeRunnersList(nextRunners),
      runsScored: runs,
    },
  ];
}

/**
 * 🏃‍♂️ 走塁ボタン長押しフリック用の即応シミュレーション（二盗・三盗・重盗［ダブルスチール］・本盗・暴投・走塁死）
 */
export function simulateQuickBaserunningPlay(
  code: QuickBaserunningCode,
  outsBefore: number,
  runnersBefore: ReadonlyArray<LiveReportBaseNum>
): SimulatedBaserunningResult {
  const runners = normalizeRunnersList(runnersBefore);
  const has1 = runners.includes(1);
  const has2 = runners.includes(2);
  const has3 = runners.includes(3);

  // 走者なし または 3死時点では架空の走者・得点を生成しない
  if (outsBefore >= 3 || runners.length === 0) {
    return {
      mode: "chained",
      playText: "",
      outsAfter: outsBefore,
      runnersAfter: outsBefore >= 3 ? [] : runners,
      runsScored: 0,
    };
  }

  if (code === "steal_2b") {
    if (!has1 || has2) {
      return {
        mode: "chained",
        playText: "",
        outsAfter: outsBefore,
        runnersAfter: runners,
        runsScored: 0,
      };
    }
    const nextR = normalizeRunnersList(
      runners.map((r) => (r === 1 ? 2 : r)) as LiveReportBaseNum[]
    );
    return {
      mode: "chained",
      playText: "二盗",
      outsAfter: outsBefore,
      runnersAfter: nextR,
      runsScored: 0,
    };
  }

  if (code === "steal_3b") {
    if (!has2 || has3) {
      return {
        mode: "chained",
        playText: "",
        outsAfter: outsBefore,
        runnersAfter: runners,
        runsScored: 0,
      };
    }
    const nextR = normalizeRunnersList(
      runners.map((r) => (r === 2 ? 3 : r)) as LiveReportBaseNum[]
    );
    return {
      mode: "chained",
      playText: "三盗",
      outsAfter: outsBefore,
      runnersAfter: nextR,
      runsScored: 0,
    };
  }

  if (code === "double_steal") {
    // ダブルスチール（重盗）：走者2名以上が必要（1・2塁➔2・3塁、1・3塁➔2塁＆1点生還、満塁➔2・3塁＆1点生還 等）
    if (runners.length < 2) {
      return {
        mode: "chained",
        playText: "",
        outsAfter: outsBefore,
        runnersAfter: runners,
        runsScored: 0,
      };
    }
    const nextR: LiveReportBaseNum[] = [];
    let runs = 0;
    for (const r of runners) {
      if (r === 3) runs += 1;
      else nextR.push((r + 1) as LiveReportBaseNum);
    }
    return {
      mode: "chained",
      playText: runs > 0 ? `重盗${runs}点` : "重盗",
      outsAfter: outsBefore,
      runnersAfter: normalizeRunnersList(nextR),
      runsScored: runs,
    };
  }

  if (code === "home_steal") {
    if (!has3) {
      return {
        mode: "chained",
        playText: "",
        outsAfter: outsBefore,
        runnersAfter: runners,
        runsScored: 0,
      };
    }
    const rem = runners.filter((r) => r !== 3);
    return {
      mode: "chained",
      playText: "本盗1点",
      outsAfter: outsBefore,
      runnersAfter: rem,
      runsScored: 1,
    };
  }

  if (
    code === "delayed_steal" ||
    code === "wp_advance" ||
    code === "pb_advance" ||
    code === "balk_advance"
  ) {
    const nextR: LiveReportBaseNum[] = [];
    let runs = 0;
    for (const r of runners) {
      if (r === 3) runs += 1;
      else nextR.push((r + 1) as LiveReportBaseNum);
    }
    const baseWord =
      code === "delayed_steal"
        ? "ディレードスチール"
        : code === "wp_advance"
        ? runs > 0
          ? "暴投"
          : "暴投進塁"
        : code === "pb_advance"
        ? runs > 0
          ? "捕逸"
          : "捕逸進塁"
        : runs > 0
        ? "ボーク"
        : "ボーク進塁";
    return {
      mode: "chained",
      playText: runs > 0 ? `${baseWord}${runs}点` : baseWord,
      outsAfter: outsBefore,
      runnersAfter: normalizeRunnersList(nextR),
      runsScored: runs,
    };
  }

  // アウト系（盗塁死 / 牽制死 / 飛び出し挟殺アウト）
  const nextOuts = Math.min(3, outsBefore + 1);
  let targetOutBase: LiveReportBaseNum = 1;
  if (has3 && !has1 && !has2) targetOutBase = 3;
  else if (has2 && !has1) targetOutBase = 2;
  else if (code === "rundown_out" && has2) targetOutBase = 2;

  const rem =
    nextOuts >= 3 ? [] : runners.filter((r) => r !== targetOutBase);
  const outWord =
    code === "caught_stealing"
      ? "盗塁死"
      : code === "pickoff_out"
      ? "牽制死"
      : targetOutBase === 2
      ? "二塁走者飛び出し封殺"
      : targetOutBase === 3
      ? "三塁走者飛び出し封殺"
      : "一塁走者飛び出し封殺";

  return {
    mode: "chained",
    playText: outWord,
    outsAfter: nextOuts,
    runnersAfter: rem,
    runsScored: 0,
  };
}

// =========================================================
// 6. スコアブック取込v2 スナップショット ＆ プレイログからの自動変換
// =========================================================

function mapV2AtBatToReportPlayText(ab: ScorebookV2AtBat): string {
  const raw = (ab.resultLabel || "").trim();
  const runs = ab.runsInPlay || 0;
  const runSuffix =
    runs > 0 && !raw.includes("点") ? `${runs}点` : "";

  if (raw) {
    const normalized = raw
      .replace("空振り三振", "空三振")
      .replace("見逃し三振", "見逃三振")
      .replace("見三振", "見逃三振")
      .replace("フォアボール", "四球")
      .replace("デッドボール", "死球");
    if (
      runs > 0 &&
      (ab.resultCode === "single" ||
        ab.resultCode === "double" ||
        ab.resultCode === "triple") &&
      !normalized.includes("適時")
    ) {
      return `${normalized}${runSuffix}`;
    }
    return `${normalized}${runSuffix}`;
  }

  const codeFallback: Record<string, string> = {
    single: "ヒット",
    double: "二塁打",
    triple: "三塁打",
    home_run: "本塁打",
    walk: "四球",
    intentional_walk: "敬遠四球",
    hit_by_pitch: "死球",
    sac_bunt: "送りバント",
    sac_fly: "犠飛",
    groundout: "ゴロ",
    flyout: "フライ",
    lineout: "ライナー",
    infield_fly: "インフィールドフライ",
    strikeout: "三振",
    dropped_third_strike: "振逃",
    dropped_third_strike_out: "振逃",
    double_play: "併殺",
    triple_play: "三重殺",
    error: "エラー",
    fc: "野選",
    interference: "打撃妨害",
    interference_out: "守備妨害",
  };
  return `${codeFallback[ab.resultCode] || "プレー"}${runSuffix}`;
}

function buildHalfInningEntriesFromScorebookSheet(
  structure: ScorebookSheetStructure,
  atBats: ReadonlyArray<ScorebookV2AtBat>,
  inning: number,
  isBottom: boolean
): LiveReportPlayEntry[] {
  const inningAtBats = atBats
    .filter((ab) => ab.inning === inning && ab.isTop === !isBottom)
    .sort((a, b) => {
      if (a.columnIndex !== b.columnIndex) return a.columnIndex - b.columnIndex;
      return 0;
    });

  const entries: LiveReportPlayEntry[] = [];

  // 投手交代イベント（相手攻撃回＝自チーム守備時の投手交代を挿入）
  if (!structure.isMyTeamBatting && structure.pitchers.length > 1) {
    for (let i = 1; i < structure.pitchers.length; i++) {
      const prevP = structure.pitchers[i - 1];
      const nextP = structure.pitchers[i];
      if (nextP.fromInning === inning) {
        entries.push({
          id: `sub-p-${inning}-${i}`,
          entryType: "substitution",
          battingOrder: 0,
          batterName: "",
          playText: "",
          reactionText: "",
          outsAfter: 0,
          runnersAfter: [],
          runsScored: 0,
          chainedPlays: [],
          eventText: `投手交代 ${formatPlayerReportName(prevP.name, true)}→${formatPlayerReportName(nextP.name, true)}`,
        });
      }
    }
  }

  let base1 = false;
  let base2 = false;
  let base3 = false;

  for (const ab of inningAtBats) {
    // 進塁データの追跡
    const fromSet = new Set<string>();
    const toAlive: LiveReportBaseNum[] = [];

    for (const adv of ab.advances || []) {
      fromSet.add(adv.from);
      if (!adv.isOut) {
        if (adv.to === "1B") toAlive.push(1);
        else if (adv.to === "2B") toAlive.push(2);
        else if (adv.to === "3B") toAlive.push(3);
      }
    }

    if (fromSet.has("1B")) base1 = false;
    if (fromSet.has("2B")) base2 = false;
    if (fromSet.has("3B")) base3 = false;

    for (const dest of toAlive) {
      if (dest === 1) base1 = true;
      if (dest === 2) base2 = true;
      if (dest === 3) base3 = true;
    }

    // advances が空だった場合の安全なフォールバック推論
    if ((!ab.advances || ab.advances.length === 0) && ab.endingOuts < 3) {
      if (
        ab.resultCode === "single" ||
        ab.resultCode === "walk" ||
        ab.resultCode === "intentional_walk" ||
        ab.resultCode === "hit_by_pitch" ||
        ab.resultCode === "dropped_third_strike" ||
        ab.resultCode === "interference" ||
        ab.resultCode === "error" ||
        ab.resultCode === "fc"
      ) {
        base1 = true;
      } else if (ab.resultCode === "double") {
        base2 = true;
      } else if (ab.resultCode === "triple") {
        base3 = true;
      } else if (ab.resultCode === "home_run") {
        base1 = false;
        base2 = false;
        base3 = false;
      }
    }

    const outsAfter = Math.max(0, Math.min(3, ab.endingOuts || 0));
    if (outsAfter >= 3) {
      base1 = false;
      base2 = false;
      base3 = false;
    }

    const runnersAfter: LiveReportBaseNum[] = [];
    if (base1) runnersAfter.push(1);
    if (base2) runnersAfter.push(2);
    if (base3) runnersAfter.push(3);

    entries.push({
      id: ab.id || `ab-${inning}-${isBottom ? "b" : "t"}-${entries.length + 1}`,
      entryType: "batter",
      battingOrder: ab.battingOrder || 1,
      batterName: ab.batterName || "",
      playText: mapV2AtBatToReportPlayText(ab),
      reactionText: "",
      outsAfter,
      runnersAfter,
      runsScored: ab.runsInPlay || 0,
      chainedPlays: [],
      eventText: "",
    });
  }

  return entries;
}

export function hydrateLiveReportFromScorebookSnapshot(params: {
  baseDoc: LiveReportV2Document;
  topStructure: ScorebookSheetStructure | null;
  bottomStructure: ScorebookSheetStructure | null;
  topAtBats: ReadonlyArray<ScorebookV2AtBat>;
  bottomAtBats: ReadonlyArray<ScorebookV2AtBat>;
  matchStatus?: string;
}): LiveReportV2Document {
  const { baseDoc, topStructure, bottomStructure, topAtBats, bottomAtBats } = params;
  const isMyFirst = baseDoc.battingOrder === "first";
  const myStructure = isMyFirst ? topStructure : bottomStructure;

  // 自チームスタメンの復元
  let nextLineup = baseDoc.lineup;
  if (myStructure && myStructure.batters.length > 0) {
    nextLineup = myStructure.batters.map((b, idx) => ({
      order: b.battingOrder || idx + 1,
      position: normalizeReportPositionCode(b.position),
      playerId: b.playerId || null,
      playerName: b.name || "",
      substitutions: (b.substitutions || []).map((s, sIdx) => ({
        id: s.id || `sub-${idx}-${sIdx}`,
        inning: s.inningEntered || 1,
        isBottom: !isMyFirst,
        subType: (s.subType === "PH"
          ? "PH"
          : s.subType === "PR" || s.subType === "TR"
          ? "PR"
          : "DEF") as LiveReportSubType,
        oldName: b.name || "",
        newName: s.name || "",
        newPosition: normalizeReportPositionCode(s.position || b.position),
        playerId: s.playerId || null,
      })),
    }));
  }

  const maxTopInn = Math.max(
    0,
    ...(topStructure?.innings.map((i) => i.inning) || []),
    ...topAtBats.map((a) => a.inning)
  );
  const maxBotInn = Math.max(
    0,
    ...(bottomStructure?.innings.map((i) => i.inning) || []),
    ...bottomAtBats.map((a) => a.inning)
  );
  const maxInning = Math.max(maxTopInn, maxBotInn, 1);

  const halfInnings: LiveReportHalfInning[] = [];
  for (let inn = 1; inn <= maxInning; inn++) {
    if (topStructure) {
      const entries = buildHalfInningEntriesFromScorebookSheet(
        topStructure,
        topAtBats,
        inn,
        false
      );
      const metaRuns = topStructure.innings.find((m) => m.inning === inn)?.runs;
      if (entries.length > 0 || typeof metaRuns === "number") {
        const autoSum = entries.reduce((s, e) => s + e.runsScored, 0);
        halfInnings.push({
          inning: inn,
          isBottom: false,
          entries,
          manualRunsOverride:
            typeof metaRuns === "number" && metaRuns !== autoSum ? metaRuns : null,
        });
      }
    }
    if (bottomStructure) {
      const entries = buildHalfInningEntriesFromScorebookSheet(
        bottomStructure,
        bottomAtBats,
        inn,
        true
      );
      const metaRuns = bottomStructure.innings.find((m) => m.inning === inn)?.runs;
      if (entries.length > 0 || typeof metaRuns === "number") {
        const autoSum = entries.reduce((s, e) => s + e.runsScored, 0);
        halfInnings.push({
          inning: inn,
          isBottom: true,
          entries,
          manualRunsOverride:
            typeof metaRuns === "number" && metaRuns !== autoSum ? metaRuns : null,
        });
      }
    }
  }

  const lastHalf = halfInnings[halfInnings.length - 1];
  return {
    ...baseDoc,
    lineup: nextLineup,
    halfInnings,
    activeInning: lastHalf?.inning ?? 1,
    activeIsBottom: lastHalf?.isBottom ?? false,
    isGameFinished: params.matchStatus === "finished" || baseDoc.isGameFinished,
  };
}

// =========================================================
// 7. LINE速報テキスト生成エンジン（丸数字スペース式・ズレ完全ゼロ仕様）
// =========================================================

function toFullWidthAscii(str: string): string {
  let out = "";
  for (const ch of Array.from(str)) {
    const code = ch.codePointAt(0) || 0;
    if (code === 0x20) {
      out += "　";
    } else if (code >= 0x21 && code <= 0x7e) {
      out += String.fromCodePoint(code + 0xfee0);
    } else {
      out += ch;
    }
  }
  return out;
}

function toFullWidthDigits(num: number): string {
  return String(Math.max(0, Math.trunc(num))).replace(/[0-9]/g, (d) =>
    String.fromCodePoint(0xff10 + Number(d))
  );
}

function formatCircledInning(inn: number): string {
  if (inn >= 1 && inn <= 20) {
    return String.fromCodePoint(0x2460 + inn - 1);
  }
  return toFullWidthDigits(inn);
}

function padStartFullWidth(str: string, targetChars: number): string {
  const chars = Array.from(str);
  if (chars.length >= targetChars) return str;
  return `${"　".repeat(targetChars - chars.length)}${str}`;
}

function normalizeScoreboardTeamChars(raw: string, fallback: string): string[] {
  const cleaned = toFullWidthAscii((raw || "").trim() || fallback);
  const chars = Array.from(cleaned);
  if (chars.length === 1) {
    return ["　", chars[0], "　"];
  }
  if (chars.length === 2) {
    return [chars[0], "　", chars[1]];
  }
  return chars;
}

export function formatScoreboardBlock(
  doc: LiveReportV2Document,
  summary: CumulativeScoreSummary
): string {
  const fChars = normalizeScoreboardTeamChars(doc.firstTeamShortName, "先　攻");
  const sChars = normalizeScoreboardTeamChars(doc.secondTeamShortName, "後　攻");

  const labelWidth = Math.max(fChars.length, sChars.length, 3);
  const fPadded = `${fChars.join("")}${"　".repeat(
    Math.max(0, labelWidth - fChars.length)
  )}`;
  const sPadded = `${sChars.join("")}${"　".repeat(
    Math.max(0, labelWidth - sChars.length)
  )}`;
  const headerLabel = `回${"　".repeat(Math.max(1, labelWidth - 2))}数`;

  const inningHeaders: string[] = [];
  const fCells: string[] = [];
  const sCells: string[] = [];

  for (let i = 0; i < summary.maxInning; i++) {
    const inn = i + 1;
    const hRaw = formatCircledInning(inn);

    const fs = summary.firstInningScores[i];
    const ss = summary.secondInningScores[i];

    const fRaw = fs !== null && fs !== undefined ? toFullWidthDigits(fs) : "－";

    const isUnplayedFinalBottom =
      doc.isGameFinished &&
      inn >= doc.regulationInnings &&
      fs !== null &&
      ss === null &&
      summary.secondTotal > summary.firstTotal;

    const botHalf = doc.halfInnings.find((h) => h.inning === inn && h.isBottom);
    const botHasEntries = Boolean(botHalf && botHalf.entries.length > 0);
    const isPlayedWalkoffBottom =
      doc.isGameFinished &&
      doc.showWalkoffX &&
      inn === summary.maxInning &&
      ss !== null &&
      ss !== undefined &&
      ss > 0 &&
      summary.secondTotal > summary.firstTotal &&
      summary.secondTotal - ss <= summary.firstTotal &&
      (botHasEntries
        ? computeHalfInningSituation(botHalf).outs < 3
        : inn >= doc.regulationInnings);

    const sRaw =
      ss !== null && ss !== undefined
        ? isPlayedWalkoffBottom
          ? `${toFullWidthDigits(ss)}ｘ`
          : toFullWidthDigits(ss)
        : isUnplayedFinalBottom && doc.showWalkoffX
        ? "ｘ"
        : "－";

    const colWidth = Math.max(
      Array.from(hRaw).length,
      Array.from(fRaw).length,
      Array.from(sRaw).length
    );

    inningHeaders.push(padStartFullWidth(hRaw, colWidth));
    fCells.push(padStartFullWidth(fRaw, colWidth));
    sCells.push(padStartFullWidth(sRaw, colWidth));
  }

  const fTotalRaw = toFullWidthDigits(summary.firstTotal);
  const sTotalRaw = toFullWidthDigits(summary.secondTotal);
  const totalWidth = Math.max(
    Array.from(fTotalRaw).length,
    Array.from(sTotalRaw).length
  );
  const totalHeader =
    totalWidth <= 1 ? "計" : padStartFullWidth("合計", totalWidth);
  const fTotalPadded = padStartFullWidth(fTotalRaw, totalWidth);
  const sTotalPadded = padStartFullWidth(sTotalRaw, totalWidth);

  const headerLine = `${headerLabel}｜${inningHeaders.join(" ")}｜${totalHeader}`;
  const firstLine = `${fPadded}｜${fCells.join(" ")}｜${fTotalPadded}`;
  const secondLine = `${sPadded}｜${sCells.join(" ")}｜${sTotalPadded}`;

  return `${headerLine}\n${firstLine}\n${secondLine}`;
}

export function formatStartingLineupBlock(doc: LiveReportV2Document): string {
  const filledSlots = doc.lineup.filter(
    (s) => (s.playerName || "").trim().length > 0
  );
  const dhPitcherName = (doc.dhStarterPitcher?.playerName || "").trim();
  if (filledSlots.length === 0 && !dhPitcherName) return "";

  const lines = doc.lineup.map((slot) => {
    const pos = normalizeReportPositionCode(slot.position);
    const baseName = formatPlayerReportName(
      slot.playerName,
      doc.showSurnameOnly
    );
    if (!baseName) return `${slot.order}.${pos}`;

    const permanentSubs = slot.substitutions.filter(
      (s) => s.subType !== "TR" && s.newName.trim().length > 0
    );
    if (!doc.appendSubsToTopLineup || permanentSubs.length === 0) {
      return `${slot.order}.${pos} ${baseName}`;
    }

    const subTrail = permanentSubs
      .map(
        (s) =>
          `→${formatPlayerReportName(s.newName, doc.showSurnameOnly)}(${
            s.inning
          }${s.isBottom ? "裏" : "表"})`
      )
      .join("");

    return `${slot.order}.${pos} ${baseName}${subTrail}`;
  });

  const hasPitcherInOrder = doc.lineup.some(
    (s) =>
      (s.playerName || "").trim().length > 0 &&
      normalizeReportPositionCode(s.position) === "1"
  );
  if (dhPitcherName && !hasPitcherInOrder) {
    lines.push(
      `先発P ${formatPlayerReportName(dhPitcherName, doc.showSurnameOnly)}`
    );
  }

  return lines.join("\n");
}

export function formatSinglePlayEntryLine(
  entry: LiveReportPlayEntry,
  isMyTeamAttack: boolean,
  showSurnameOnly: boolean
): string {
  if (entry.entryType !== "batter") {
    return entry.eventText.trim();
  }

  const orderPrefix = `${entry.battingOrder}.`;
  const batterName = isMyTeamAttack
    ? formatPlayerReportName(entry.batterName, showSurnameOnly)
    : "";
  const nameSegment = batterName ? `${batterName}　` : "";

  const playCore = (entry.playText || "").trim();
  const reaction = (entry.reactionText || "").trim();
  const mainAction =
    reaction.length > 0
      ? /^[❗️‼️!！✨🔥⚾️]+/.test(reaction)
        ? `${playCore}${reaction}`
        : `${playCore}　${reaction}`
      : playCore;

  const stateSuffix = formatOutsAndRunnersSuffix(
    entry.outsAfter,
    entry.runnersAfter
  );

  let line = `${orderPrefix}${nameSegment}${mainAction}`;
  if (stateSuffix) {
    line += `　${stateSuffix}`;
  }

  if (entry.chainedPlays && entry.chainedPlays.length > 0) {
    for (const cp of entry.chainedPlays) {
      const cpState = formatOutsAndRunnersSuffix(cp.outsAfter, cp.runnersAfter);
      const cpPart = cpState ? `${cp.playText}　${cpState}` : cp.playText;
      line += `　${cpPart}`;
    }
  }

  return line;
}

export function formatHalfInningsPlayByPlay(
  doc: LiveReportV2Document,
  options?: {
    onlyInning?: number;
    onlyIsBottom?: boolean;
  }
): string {
  const sortedHalves = [...doc.halfInnings]
    .filter((h) => h.entries.length > 0 || h.manualRunsOverride !== null)
    .sort((a, b) =>
      compareHalfInningOrder(a.inning, a.isBottom, b.inning, b.isBottom)
    );

  if (sortedHalves.length === 0) return "";

  let runningFirst = 0;
  let runningSecond = 0;
  const blocks: string[] = [];

  for (const half of sortedHalves) {
    const runs = getHalfInningRuns(half);
    if (!half.isBottom) {
      runningFirst += runs;
    } else {
      runningSecond += runs;
    }

    const matchesFilter =
      options?.onlyInning === undefined
        ? true
        : half.inning === options.onlyInning &&
          (options.onlyIsBottom === undefined ||
            half.isBottom === options.onlyIsBottom);

    if (!matchesFilter) continue;

    const isMyAttack = isMyTeamBattingHalf(doc.battingOrder, half.isBottom);
    const header = `${half.inning}回${half.isBottom ? "裏" : "表"}`;
    const lines = half.entries
      .map((e) => formatSinglePlayEntryLine(e, isMyAttack, doc.showSurnameOnly))
      .filter((l) => l.length > 0);

    const body = lines.length > 0 ? `${lines.join("\n")}\n` : "";
    blocks.push(`${header}\n${body}得点${runs}\n${runningFirst}-${runningSecond}`);
  }

  return blocks.join("\n\n");
}

export function formatLiveReportText(
  doc: LiveReportV2Document,
  mode: LiveReportOutputMode
): string {
  const headerLines: string[] = [];
  if (doc.dateText.trim()) headerLines.push(doc.dateText.trim());
  if (doc.tournamentText.trim()) headerLines.push(doc.tournamentText.trim());

  const oppPart = doc.opponentName.trim() ? `対${doc.opponentName.trim()}` : "";
  const venuePart = doc.venueName.trim() ? `@${doc.venueName.trim()}` : "";
  if (oppPart || venuePart) {
    headerLines.push(`${oppPart}${venuePart}`);
  }

  const headerBlock = headerLines.join("\n");
  const isEndMode = mode === "game_set" || (mode === "full" && doc.isGameFinished);
  const timeBlock =
    mode === "lineup"
      ? doc.startTime.trim()
        ? `開始時間　${doc.startTime.trim()}`
        : ""
      : `開始時間　${doc.startTime.trim()}\n終了時間    ${
          isEndMode || doc.endTime.trim() ? doc.endTime.trim() : ""
        }`;

  const lineupBlock = formatStartingLineupBlock(doc);
  const reporterBlock = doc.reporterNames.trim()
    ? `速報　${doc.reporterNames.trim()}`
    : "";

  // ① スタメン発表モード
  if (mode === "lineup") {
    const sections = [
      headerBlock,
      timeBlock,
      lineupBlock,
      "プレイボール⚾️",
      reporterBlock,
    ].filter((s) => s.length > 0);
    return sections.join("\n\n");
  }

  // ② 直近イニングのみ切り出しモード
  if (mode === "latest_inning") {
    const nonEmpty = [...doc.halfInnings]
      .filter((h) => h.entries.length > 0 || h.manualRunsOverride !== null)
      .sort((a, b) =>
        compareHalfInningOrder(a.inning, a.isBottom, b.inning, b.isBottom)
      );
    const targetHalf =
      doc.halfInnings.find(
        (h) =>
          h.inning === doc.activeInning &&
          h.isBottom === doc.activeIsBottom &&
          (h.entries.length > 0 || h.manualRunsOverride !== null)
      ) || nonEmpty[nonEmpty.length - 1];

    if (!targetHalf) {
      return [headerBlock, "（まだイニング記録がありません）", reporterBlock]
        .filter(Boolean)
        .join("\n\n");
    }

    const summary = computeScoreboardSummary(
      doc,
      targetHalf.inning,
      targetHalf.isBottom
    );
    const playBlock = formatHalfInningsPlayByPlay(doc, {
      onlyInning: targetHalf.inning,
      onlyIsBottom: targetHalf.isBottom,
    });
    const miniTitle = `【${targetHalf.inning}回${
      targetHalf.isBottom ? "裏" : "表"
    }速報】${doc.firstTeamShortName.replace(/\s+/g, "")} ${
      summary.firstTotal
    }-${summary.secondTotal} ${doc.secondTeamShortName.replace(/\s+/g, "")}`;

    return [miniTitle, playBlock, reporterBlock].filter(Boolean).join("\n\n");
  }

  // ③ 全文積み上げモード / 試合終了全文モード（ユーザー提示サンプル完全準拠）
  const summary = computeScoreboardSummary(doc);
  const scoreboardBlock = formatScoreboardBlock(doc, summary);
  const playByPlayBlock = formatHalfInningsPlayByPlay(doc);

  const chunks: string[] = [];
  if (headerBlock) chunks.push(headerBlock);
  if (timeBlock) chunks.push(timeBlock);
  chunks.push(scoreboardBlock);
  if (lineupBlock) chunks.push(lineupBlock);
  chunks.push("\nプレイボール⚾️\n");
  if (playByPlayBlock) chunks.push(playByPlayBlock);

  if (isEndMode) {
    const scoreLine = `${summary.firstTotal}-${summary.secondTotal}${doc.closingComment.trim()}`;
    chunks.push(`\nゲームセット\n${scoreLine}\n`);
  }

  if (reporterBlock) {
    chunks.push(reporterBlock);
  }

  return chunks
    .join("\n\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export function resolveDisplayedLiveReportText(
  doc: LiveReportV2Document,
  mode: LiveReportOutputMode
): string {
  const manual = doc.manualTextOverrides?.[mode];
  if (typeof manual === "string") {
    return manual;
  }
  return formatLiveReportText(doc, mode);
}

// =========================================================
// 8. 安全なJSON復元 ＆ 既存プレイログ・イニング得点からの補完
// =========================================================

export interface LegacyPlayLogRow {
  id: string;
  inningText: string;
  resultType: string;
  description: string;
}

export function hydrateLiveReportFromLegacyLogsAndScores(params: {
  baseDoc: LiveReportV2Document;
  playLogs: ReadonlyArray<LegacyPlayLogRow>;
  myInningScores: ReadonlyArray<number>;
  opponentInningScores: ReadonlyArray<number>;
  matchStatus?: string;
}): LiveReportV2Document {
  const {
    baseDoc,
    playLogs,
    myInningScores,
    opponentInningScores,
    matchStatus,
  } = params;

  const isMyFirst = baseDoc.battingOrder === "first";
  const firstScores = isMyFirst ? myInningScores : opponentInningScores;
  const secondScores = isMyFirst ? opponentInningScores : myInningScores;

  const halfMap = new Map<string, LiveReportHalfInning>();
  const ensureHalf = (inning: number, isBottom: boolean): LiveReportHalfInning => {
    const key = `${inning}-${isBottom ? "b" : "t"}`;
    const existing = halfMap.get(key);
    if (existing) return existing;
    const created: LiveReportHalfInning = {
      inning,
      isBottom,
      entries: [],
      manualRunsOverride: null,
    };
    halfMap.set(key, created);
    return created;
  };

  for (const log of playLogs) {
    const innMatch = (log.inningText || "").match(/(\d+)回(表|裏)/);
    if (!innMatch) continue;
    const inn = Number(innMatch[1]) || 1;
    const isBottom = innMatch[2] === "裏";
    const half = ensureHalf(inn, isBottom);

    const bsoMatch = (log.description || "").match(
      /\[B:\d+,\s*S:\d+,\s*O:(\d+)\]$/
    );
    const outsAfter = bsoMatch ? Math.min(3, Number(bsoMatch[1]) || 0) : 0;
    const cleanDesc = (log.description || "")
      .replace(/\s*\[B:\d+,\s*S:\d+,\s*O:\d+\]$/, "")
      .trim();

    if (
      !cleanDesc ||
      cleanDesc === "ボール" ||
      cleanDesc === "空振り" ||
      cleanDesc === "見逃しストライク" ||
      cleanDesc === "ファウル" ||
      cleanDesc.includes("イニング交代") ||
      cleanDesc === "プレイボール" ||
      cleanDesc === "試合終了" ||
      cleanDesc === "ゲームセット"
    ) {
      continue;
    }

    if (cleanDesc.includes("選手交代")) {
      const subMatch = cleanDesc.match(
        /選手交代\[(.+?)\]:\s*(\d+)番\s*(.+?)\s*➔\s*(.+)/
      );
      if (subMatch && subMatch[1] === "自チーム") {
        half.entries.push({
          id: log.id || `sub-${inn}-${half.entries.length}`,
          entryType: "substitution",
          battingOrder: 0,
          batterName: "",
          playText: "",
          reactionText: "",
          outsAfter,
          runnersAfter: [],
          runsScored: 0,
          chainedPlays: [],
          eventText: `選手交代 ${formatPlayerReportName(
            subMatch[3],
            true
          )}→${formatPlayerReportName(subMatch[4], true)}`,
        });
      }
      continue;
    }

    const abMatch = cleanDesc.match(/^(\d+)番\s*([^:]*?)\s*:\s*(.+)$/);
    if (abMatch) {
      const order = Number(abMatch[1]) || 1;
      const name = abMatch[2].trim();
      const rawPlay = abMatch[3]
        .trim()
        .replace("空振り三振", "空三振")
        .replace("見逃し三振", "見逃三振")
        .replace("フォアボール", "四球")
        .replace("デッドボール", "死球");

      if (
        rawPlay === "ボール" ||
        rawPlay === "空振り" ||
        rawPlay === "見逃しストライク" ||
        rawPlay === "ファウル"
      ) {
        continue;
      }

      const runnersAfter: LiveReportBaseNum[] = [];
      if (outsAfter < 3) {
        if (
          rawPlay.includes("安") ||
          rawPlay.includes("ヒット") ||
          rawPlay.includes("四球") ||
          rawPlay.includes("死球") ||
          rawPlay.includes("失") ||
          rawPlay.includes("エラー") ||
          rawPlay.includes("野選")
        ) {
          runnersAfter.push(1);
        } else if (rawPlay.includes("二塁打")) {
          runnersAfter.push(2);
        } else if (rawPlay.includes("三塁打")) {
          runnersAfter.push(3);
        }
      }

      const rbiMatch = rawPlay.match(/(\d+)点/);
      const runsScored = rbiMatch ? Number(rbiMatch[1]) || 0 : 0;

      half.entries.push({
        id: log.id || `lg-${inn}-${half.entries.length}`,
        entryType: "batter",
        battingOrder: order,
        batterName: name === "打者" ? "" : name,
        playText: rawPlay,
        reactionText: "",
        outsAfter,
        runnersAfter,
        runsScored,
        chainedPlays: [],
        eventText: "",
      });
    }
  }

  const maxScoreInn = Math.max(firstScores.length, secondScores.length);
  for (let i = 0; i < maxScoreInn; i++) {
    const inn = i + 1;
    if (typeof firstScores[i] === "number") {
      const th = ensureHalf(inn, false);
      const autoRuns = th.entries.reduce((s, e) => s + e.runsScored, 0);
      if (th.entries.length === 0 || autoRuns !== firstScores[i]) {
        th.manualRunsOverride = firstScores[i];
      }
    }
    if (typeof secondScores[i] === "number") {
      const bh = ensureHalf(inn, true);
      const autoRuns = bh.entries.reduce((s, e) => s + e.runsScored, 0);
      if (bh.entries.length === 0 || autoRuns !== secondScores[i]) {
        bh.manualRunsOverride = secondScores[i];
      }
    }
  }

  const halfInnings = Array.from(halfMap.values()).sort((a, b) =>
    compareHalfInningOrder(a.inning, a.isBottom, b.inning, b.isBottom)
  );
  const lastHalf = halfInnings[halfInnings.length - 1];

  return {
    ...baseDoc,
    halfInnings,
    activeInning: lastHalf?.inning ?? 1,
    activeIsBottom: lastHalf?.isBottom ?? false,
    isGameFinished: matchStatus === "finished" || baseDoc.isGameFinished,
  };
}

export function sanitizeLiveReportDocument(
  raw: unknown,
  fallbackTeamName = "自チーム"
): LiveReportV2Document | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 2) return null;

  const fallback = createInitialLiveReportDocument({
    myTeamName: fallbackTeamName,
  });

  const lineupRaw = Array.isArray(obj.lineup) ? obj.lineup : fallback.lineup;
  const lineup: LiveReportLineupSlot[] = lineupRaw.map((item, idx) => {
    const s = (item || {}) as Record<string, unknown>;
    const subsRaw = Array.isArray(s.substitutions) ? s.substitutions : [];
    const cleanUni =
      typeof s.uniformNumber === "string" ? s.uniformNumber.trim() : "";
    return {
      order: typeof s.order === "number" ? s.order : idx + 1,
      position:
        typeof s.position === "string"
          ? normalizeReportPositionCode(s.position)
          : String(idx + 1 <= 9 ? idx + 1 : "D"),
      playerId: typeof s.playerId === "string" ? s.playerId : null,
      playerName: typeof s.playerName === "string" ? s.playerName : "",
      ...(cleanUni ? { uniformNumber: cleanUni } : {}),
      substitutions: subsRaw.map((sr, sIdx) => {
        const sub = (sr || {}) as Record<string, unknown>;
        const st = sub.subType;
        return {
          id: typeof sub.id === "string" ? sub.id : `sub-${idx}-${sIdx}`,
          inning: typeof sub.inning === "number" ? sub.inning : 1,
          isBottom: Boolean(sub.isBottom),
          subType:
            st === "P" ||
            st === "PH" ||
            st === "PR" ||
            st === "TR" ||
            st === "DEF"
              ? st
              : "DEF",
          oldName: typeof sub.oldName === "string" ? sub.oldName : "",
          newName: typeof sub.newName === "string" ? sub.newName : "",
          newPosition:
            typeof sub.newPosition === "string" ? sub.newPosition : "",
          playerId: typeof sub.playerId === "string" ? sub.playerId : null,
        };
      }),
    };
  });

  const halvesRaw = Array.isArray(obj.halfInnings) ? obj.halfInnings : [];
  const halfInnings: LiveReportHalfInning[] = halvesRaw.map((hr) => {
    const h = (hr || {}) as Record<string, unknown>;
    const entriesRaw = Array.isArray(h.entries) ? h.entries : [];
    const entries: LiveReportPlayEntry[] = entriesRaw.map((er, eIdx) => {
      const e = (er || {}) as Record<string, unknown>;
      const et = e.entryType;
      const chainsRaw = Array.isArray(e.chainedPlays) ? e.chainedPlays : [];
      const chainedPlays: LiveReportChainedPlay[] = chainsRaw.map(
        (cr, cIdx) => {
          const c = (cr || {}) as Record<string, unknown>;
          return {
            id: typeof c.id === "string" ? c.id : `cp-${eIdx}-${cIdx}`,
            playText: typeof c.playText === "string" ? c.playText : "",
            outsAfter:
              typeof c.outsAfter === "number"
                ? Math.max(0, Math.min(3, c.outsAfter))
                : 0,
            runnersAfter: Array.isArray(c.runnersAfter)
              ? normalizeRunnersList(c.runnersAfter as number[])
              : [],
            runsScored: typeof c.runsScored === "number" ? c.runsScored : 0,
          };
        }
      );

      let subMeta: LiveReportPlayEntry["subMeta"] = undefined;
      if (e.subMeta && typeof e.subMeta === "object") {
        const sm = e.subMeta as Record<string, unknown>;
        const smType = sm.subType;
        const rb = sm.runnerBase;
        subMeta = {
          subType:
            smType === "P" ||
            smType === "PH" ||
            smType === "PR" ||
            smType === "TR" ||
            smType === "DEF"
              ? smType
              : "DEF",
          slotOrder: typeof sm.slotOrder === "number" ? sm.slotOrder : 1,
          oldName: typeof sm.oldName === "string" ? sm.oldName : "",
          newName: typeof sm.newName === "string" ? sm.newName : "",
          newPosition: typeof sm.newPosition === "string" ? sm.newPosition : "",
          playerId: typeof sm.playerId === "string" ? sm.playerId : null,
          runnerBase: rb === 1 || rb === 2 || rb === 3 ? rb : null,
        };
      }

      const rawPitches = Array.isArray(e.pitches)
        ? e.pitches.filter(
            (
              p
            ): p is "ball" | "strike" | "foul" | "in_play" =>
              p === "ball" ||
              p === "strike" ||
              p === "foul" ||
              p === "in_play"
          )
        : undefined;
      const rawPitchCount =
        typeof e.pitchCount === "number" && Number.isFinite(e.pitchCount)
          ? Math.max(0, Math.min(60, Math.round(e.pitchCount)))
          : rawPitches
          ? rawPitches.length
          : undefined;

      return {
        id: typeof e.id === "string" ? e.id : `ent-${eIdx}`,
        entryType:
          et === "batter" || et === "substitution" || et === "note"
            ? et
            : "batter",
        battingOrder: typeof e.battingOrder === "number" ? e.battingOrder : 1,
        batterName: typeof e.batterName === "string" ? e.batterName : "",
        ...(typeof e.batterPlayerId === "string" || e.batterPlayerId === null
          ? { batterPlayerId: e.batterPlayerId }
          : {}),
        playText: typeof e.playText === "string" ? e.playText : "",
        reactionText: typeof e.reactionText === "string" ? e.reactionText : "",
        outsAfter:
          typeof e.outsAfter === "number"
            ? Math.max(0, Math.min(3, e.outsAfter))
            : 0,
        runnersAfter: Array.isArray(e.runnersAfter)
          ? normalizeRunnersList(e.runnersAfter as number[])
          : [],
        runsScored: typeof e.runsScored === "number" ? cSafeNonNegInt(e.runsScored) : 0,
        chainedPlays,
        eventText: typeof e.eventText === "string" ? e.eventText : "",
        ...(typeof e.resultCode === "string" && e.resultCode
          ? { resultCode: e.resultCode }
          : {}),
        ...(typeof e.battedDirection === "string" && e.battedDirection
          ? { battedDirection: e.battedDirection }
          : {}),
        ...(typeof e.rbi === "number" ? { rbi: Math.max(0, Math.round(e.rbi)) } : {}),
        ...(subMeta ? { subMeta } : {}),
        ...(rawPitches && rawPitches.length > 0 ? { pitches: rawPitches } : {}),
        ...(rawPitchCount !== undefined && rawPitchCount > 0
          ? { pitchCount: rawPitchCount }
          : {}),
        ...(typeof e.pitcherPlayerId === "string" || e.pitcherPlayerId === null
          ? { pitcherPlayerId: e.pitcherPlayerId }
          : {}),
        ...(typeof e.pitcherName === "string" && e.pitcherName.trim()
          ? { pitcherName: e.pitcherName.trim() }
          : {}),
      };
    });

    const manualOutsOverride =
      typeof h.manualOutsOverride === "number" &&
      Number.isFinite(h.manualOutsOverride)
        ? Math.max(0, Math.min(3, Math.round(h.manualOutsOverride)))
        : null;
    const manualRunnersOverride = Array.isArray(h.manualRunnersOverride)
      ? normalizeRunnersList(h.manualRunnersOverride as number[])
      : null;

    return {
      inning: typeof h.inning === "number" ? h.inning : 1,
      isBottom: Boolean(h.isBottom),
      entries,
      manualRunsOverride:
        typeof h.manualRunsOverride === "number" ? h.manualRunsOverride : null,
      ...(manualOutsOverride !== null ? { manualOutsOverride } : {}),
      ...(manualRunnersOverride !== null ? { manualRunnersOverride } : {}),
    };
  });

  const rawOppBatterCount =
    typeof obj.opponentBatterCount === "number"
      ? Math.max(9, Math.min(25, Math.round(obj.opponentBatterCount)))
      : 9;

  let pitcherPitchAdjustments: Record<string, number> | undefined = undefined;
  if (
    obj.pitcherPitchAdjustments &&
    typeof obj.pitcherPitchAdjustments === "object" &&
    !Array.isArray(obj.pitcherPitchAdjustments)
  ) {
    const cleanedAdj: Record<string, number> = {};
    for (const [k, v] of Object.entries(
      obj.pitcherPitchAdjustments as Record<string, unknown>
    )) {
      const key = k.trim();
      if (!key || typeof v !== "number" || !Number.isFinite(v)) continue;
      const rounded = Math.round(v);
      if (rounded !== 0) {
        cleanedAdj[key] = Math.max(-200, Math.min(250, rounded));
      }
    }
    if (Object.keys(cleanedAdj).length > 0) {
      pitcherPitchAdjustments = cleanedAdj;
    }
  }

  let pitchLimitOverride: number | "none" | null | undefined = undefined;
  if (obj.pitchLimitOverride === "none") {
    pitchLimitOverride = "none";
  } else if (obj.pitchLimitOverride === null) {
    pitchLimitOverride = null;
  } else if (
    typeof obj.pitchLimitOverride === "number" &&
    Number.isFinite(obj.pitchLimitOverride) &&
    obj.pitchLimitOverride >= 20 &&
    obj.pitchLimitOverride <= 250
  ) {
    pitchLimitOverride = Math.round(obj.pitchLimitOverride);
  }

  let manualTextOverrides:
    | Partial<Record<LiveReportOutputMode, string>>
    | undefined = undefined;
  if (
    obj.manualTextOverrides &&
    typeof obj.manualTextOverrides === "object" &&
    !Array.isArray(obj.manualTextOverrides)
  ) {
    const rawOverrides = obj.manualTextOverrides as Record<string, unknown>;
    const cleanedTextOverrides: Partial<Record<LiveReportOutputMode, string>> =
      {};
    const validModes: readonly LiveReportOutputMode[] = [
      "full",
      "latest_inning",
      "lineup",
      "game_set",
    ];
    for (const m of validModes) {
      const val = rawOverrides[m];
      if (typeof val === "string") {
        cleanedTextOverrides[m] = val;
      }
    }
    if (Object.keys(cleanedTextOverrides).length > 0) {
      manualTextOverrides = cleanedTextOverrides;
    }
  }

  let dhStarterPitcher: LiveReportDhStarterPitcher | undefined = undefined;
  if (obj.dhStarterPitcher && typeof obj.dhStarterPitcher === "object") {
    const dp = obj.dhStarterPitcher as Record<string, unknown>;
    const dpPid = typeof dp.playerId === "string" ? dp.playerId.trim() : "";
    const dpName =
      typeof dp.playerName === "string"
        ? dp.playerName.trim()
        : typeof dp.name === "string"
        ? dp.name.trim()
        : "";
    const dpUni =
      typeof dp.uniformNumber === "string" ? dp.uniformNumber.trim() : "";
    if (dpPid || dpName) {
      dhStarterPitcher = {
        playerId: dpPid || null,
        playerName: dpName,
        ...(dpUni ? { uniformNumber: dpUni } : {}),
      };
    }
  }

  let myAttendance: Record<string, LiveReportAttendanceStatus> | undefined =
    undefined;
  if (
    obj.myAttendance &&
    typeof obj.myAttendance === "object" &&
    !Array.isArray(obj.myAttendance)
  ) {
    const cleanedAtt: Record<string, LiveReportAttendanceStatus> = {};
    for (const [k, v] of Object.entries(
      obj.myAttendance as Record<string, unknown>
    )) {
      const pid = k.trim();
      if (pid && (v === "bench" || v === "absent" || v === "excluded")) {
        cleanedAtt[pid] = v;
      }
    }
    if (Object.keys(cleanedAtt).length > 0) {
      myAttendance = cleanedAtt;
    }
  }

  let opponentLineup: LiveReportOpponentLineupSlot[] | undefined = undefined;
  if (Array.isArray(obj.opponentLineup) && obj.opponentLineup.length > 0) {
    const cleanedOpp: LiveReportOpponentLineupSlot[] = obj.opponentLineup.map(
      (item, idx) => {
        const o = (item || {}) as Record<string, unknown>;
        const rawPos = typeof o.position === "string" ? o.position.trim() : "";
        const normPos =
          rawPos.toUpperCase() === "D" || rawPos.toUpperCase() === "DH"
            ? "DH"
            : /^[1-9]$/.test(rawPos)
            ? rawPos
            : "";
        const cleanUni =
          typeof o.uniformNumber === "string"
            ? o.uniformNumber.trim().replace(/^#/, "")
            : "";
        const cleanName =
          typeof o.playerName === "string"
            ? o.playerName
            : typeof o.name === "string"
            ? o.name
            : "";
        return {
          order: typeof o.order === "number" ? o.order : idx + 1,
          position: normPos,
          playerName: cleanName,
          ...(cleanUni ? { uniformNumber: cleanUni } : {}),
        };
      }
    );
    if (
      cleanedOpp.some((o) =>
        Boolean(o.playerName.trim() || o.position || o.uniformNumber)
      ) ||
      cleanedOpp.length > 9
    ) {
      opponentLineup = cleanedOpp;
    }
  }

  let opponentBench: LiveReportOpponentBenchPlayer[] | undefined = undefined;
  if (Array.isArray(obj.opponentBench) && obj.opponentBench.length > 0) {
    const cleanedBench: LiveReportOpponentBenchPlayer[] = obj.opponentBench
      .map((item, idx) => {
        const b = (item || {}) as Record<string, unknown>;
        const cleanName =
          typeof b.playerName === "string"
            ? b.playerName
            : typeof b.name === "string"
            ? b.name
            : "";
        const cleanUni =
          typeof b.uniformNumber === "string"
            ? b.uniformNumber.trim().replace(/^#/, "")
            : "";
        const cleanPos =
          typeof b.position === "string" ? b.position.trim() : "";
        return {
          id: typeof b.id === "string" && b.id ? b.id : `opp-b-${idx + 1}`,
          playerName: cleanName,
          ...(cleanUni ? { uniformNumber: cleanUni } : {}),
          ...(cleanPos ? { position: cleanPos } : {}),
        };
      })
      .filter((b) => Boolean(b.playerName.trim() || b.uniformNumber));
    if (cleanedBench.length > 0) {
      opponentBench = cleanedBench;
    }
  }

  const effectiveOppBatterCount = Math.max(
    rawOppBatterCount,
    opponentLineup ? Math.min(25, opponentLineup.length) : 9
  );

  return {
    version: 2,
    matchId: typeof obj.matchId === "string" ? obj.matchId : null,
    dateText:
      typeof obj.dateText === "string" ? obj.dateText : fallback.dateText,
    tournamentText:
      typeof obj.tournamentText === "string" ? obj.tournamentText : "",
    opponentName:
      typeof obj.opponentName === "string" ? obj.opponentName : "",
    venueName: typeof obj.venueName === "string" ? obj.venueName : "",
    startTime: typeof obj.startTime === "string" ? obj.startTime : "",
    endTime: typeof obj.endTime === "string" ? obj.endTime : "",
    battingOrder: obj.battingOrder === "second" ? "second" : "first",
    regulationInnings:
      typeof obj.regulationInnings === "number" ? obj.regulationInnings : 7,
    opponentBatterCount: effectiveOppBatterCount,
    firstTeamShortName:
      typeof obj.firstTeamShortName === "string"
        ? obj.firstTeamShortName
        : fallback.firstTeamShortName,
    secondTeamShortName:
      typeof obj.secondTeamShortName === "string"
        ? obj.secondTeamShortName
        : fallback.secondTeamShortName,
    showSurnameOnly:
      typeof obj.showSurnameOnly === "boolean" ? obj.showSurnameOnly : true,
    appendSubsToTopLineup: Boolean(obj.appendSubsToTopLineup),
    showWalkoffX: Boolean(obj.showWalkoffX),
    lineup: lineup.length > 0 ? lineup : createDefaultEmptyLineup(9),
    ...(dhStarterPitcher ? { dhStarterPitcher } : {}),
    ...(myAttendance ? { myAttendance } : {}),
    ...(opponentLineup ? { opponentLineup } : {}),
    ...(opponentBench ? { opponentBench } : {}),
    halfInnings,
    activeInning: typeof obj.activeInning === "number" ? obj.activeInning : 1,
    activeIsBottom: Boolean(obj.activeIsBottom),
    nextMyOrder: typeof obj.nextMyOrder === "number" ? obj.nextMyOrder : 1,
    nextOpponentOrder:
      typeof obj.nextOpponentOrder === "number" ? obj.nextOpponentOrder : 1,
    isGameFinished: Boolean(obj.isGameFinished),
    closingComment:
      typeof obj.closingComment === "string" ? obj.closingComment : "",
    reporterNames:
      typeof obj.reporterNames === "string" ? obj.reporterNames : "",
    ...(pitcherPitchAdjustments ? { pitcherPitchAdjustments } : {}),
    ...(pitchLimitOverride !== undefined ? { pitchLimitOverride } : {}),
    ...(manualTextOverrides ? { manualTextOverrides } : {}),
  };
}

function cSafeNonNegInt(val: number): number {
  return Number.isFinite(val) ? Math.max(0, Math.round(val)) : 0;
}

// =========================================================
// 8. 3-Way 共同編集マージエンジン（方式B：ロック不要・先祖返り防止）
// =========================================================

function isSameRunnersArray(
  a: ReadonlyArray<LiveReportBaseNum>,
  b: ReadonlyArray<LiveReportBaseNum>
): boolean {
  const na = normalizeRunnersList(a);
  const nb = normalizeRunnersList(b);
  if (na.length !== nb.length) return false;
  for (let i = 0; i < na.length; i++) {
    if (na[i] !== nb[i]) return false;
  }
  return true;
}

function isSameChainedPlay(
  a: LiveReportChainedPlay,
  b: LiveReportChainedPlay
): boolean {
  return (
    a.id === b.id &&
    a.playText === b.playText &&
    a.outsAfter === b.outsAfter &&
    a.runsScored === b.runsScored &&
    isSameRunnersArray(a.runnersAfter, b.runnersAfter)
  );
}

function isSameSubMeta(
  a: LiveReportPlayEntry["subMeta"],
  b: LiveReportPlayEntry["subMeta"]
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.subType === b.subType &&
    a.slotOrder === b.slotOrder &&
    a.oldName === b.oldName &&
    a.newName === b.newName &&
    a.newPosition === b.newPosition &&
    a.playerId === b.playerId &&
    (a.runnerBase ?? null) === (b.runnerBase ?? null)
  );
}

function isSamePitchesArray(
  a: LiveReportPlayEntry["pitches"],
  b: LiveReportPlayEntry["pitches"]
): boolean {
  const pa = a || [];
  const pb = b || [];
  if (pa.length !== pb.length) return false;
  for (let i = 0; i < pa.length; i++) {
    if (pa[i] !== pb[i]) return false;
  }
  return true;
}

function isSamePlayEntry(
  a: LiveReportPlayEntry,
  b: LiveReportPlayEntry
): boolean {
  if (
    a.id !== b.id ||
    a.entryType !== b.entryType ||
    a.battingOrder !== b.battingOrder ||
    a.batterName !== b.batterName ||
    (a.batterPlayerId ?? null) !== (b.batterPlayerId ?? null) ||
    a.playText !== b.playText ||
    a.reactionText !== b.reactionText ||
    a.outsAfter !== b.outsAfter ||
    a.runsScored !== b.runsScored ||
    a.eventText !== b.eventText ||
    (a.resultCode ?? "") !== (b.resultCode ?? "") ||
    (a.battedDirection ?? "") !== (b.battedDirection ?? "") ||
    (a.rbi ?? null) !== (b.rbi ?? null) ||
    (a.pitchCount ?? 0) !== (b.pitchCount ?? 0) ||
    (a.pitcherPlayerId ?? null) !== (b.pitcherPlayerId ?? null) ||
    (a.pitcherName ?? "") !== (b.pitcherName ?? "") ||
    !isSamePitchesArray(a.pitches, b.pitches) ||
    !isSameSubMeta(a.subMeta, b.subMeta) ||
    !isSameRunnersArray(a.runnersAfter, b.runnersAfter) ||
    a.chainedPlays.length !== b.chainedPlays.length
  ) {
    return false;
  }
  for (let i = 0; i < a.chainedPlays.length; i++) {
    if (!isSameChainedPlay(a.chainedPlays[i], b.chainedPlays[i])) {
      return false;
    }
  }
  return true;
}

function isSameSubRecord(
  a: LiveReportLineupSubRecord,
  b: LiveReportLineupSubRecord
): boolean {
  return (
    a.id === b.id &&
    a.inning === b.inning &&
    a.isBottom === b.isBottom &&
    a.subType === b.subType &&
    a.oldName === b.oldName &&
    a.newName === b.newName &&
    a.newPosition === b.newPosition &&
    a.playerId === b.playerId
  );
}

function isSameLineupSlot(
  a: LiveReportLineupSlot,
  b: LiveReportLineupSlot
): boolean {
  if (
    a.order !== b.order ||
    a.position !== b.position ||
    a.playerId !== b.playerId ||
    a.playerName !== b.playerName ||
    a.substitutions.length !== b.substitutions.length
  ) {
    return false;
  }
  for (let i = 0; i < a.substitutions.length; i++) {
    if (!isSameSubRecord(a.substitutions[i], b.substitutions[i])) {
      return false;
    }
  }
  return true;
}

function pickScalar3Way<T>(
  baseVal: T | undefined,
  remoteVal: T,
  localVal: T,
  hasBase: boolean
): T {
  if (hasBase && baseVal !== undefined) {
    return localVal !== baseVal ? localVal : remoteVal;
  }
  if (typeof remoteVal === "string" && typeof localVal === "string") {
    if (!remoteVal.trim() && localVal.trim()) {
      return localVal;
    }
    return remoteVal;
  }
  return remoteVal;
}

function mergeReporterNames3Way(
  baseVal: string | undefined,
  remoteVal: string,
  localVal: string,
  hasBase: boolean
): string {
  const splitNames = (raw: string): string[] =>
    raw
      .split(/[、,，／/\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

  if (hasBase && baseVal !== undefined) {
    const rChanged = remoteVal.trim() !== baseVal.trim();
    const lChanged = localVal.trim() !== baseVal.trim();
    if (lChanged && !rChanged) return localVal;
    if (!lChanged && rChanged) return remoteVal;
    if (lChanged && rChanged) {
      if (!localVal.trim()) return "";
      if (!remoteVal.trim()) return localVal;
      const merged = Array.from(
        new Set([...splitNames(remoteVal), ...splitNames(localVal)])
      );
      return merged.join("、");
    }
    return remoteVal;
  }

  if (!remoteVal.trim()) return localVal;
  if (!localVal.trim()) return remoteVal;
  if (remoteVal.trim() === localVal.trim()) return remoteVal;
  const merged = Array.from(
    new Set([...splitNames(remoteVal), ...splitNames(localVal)])
  );
  return merged.join("、");
}

function mergeSlotSubstitutions(
  baseSubs: ReadonlyArray<LiveReportLineupSubRecord> | null,
  remoteSubs: ReadonlyArray<LiveReportLineupSubRecord>,
  localSubs: ReadonlyArray<LiveReportLineupSubRecord>
): LiveReportLineupSubRecord[] {
  const bMap = new Map((baseSubs || []).map((s) => [s.id, s]));
  const rMap = new Map(remoteSubs.map((s) => [s.id, s]));
  const lMap = new Map(localSubs.map((s) => [s.id, s]));

  const merged: LiveReportLineupSubRecord[] = [];
  const remoteNewFingerprints = new Set<string>();

  const toFingerprint = (s: LiveReportLineupSubRecord): string =>
    `${s.inning}-${s.isBottom ? "B" : "T"}-${s.subType}-${s.newName.trim()}-${s.newPosition}`;

  for (const rSub of remoteSubs) {
    const bSub = bMap.get(rSub.id);
    const lSub = lMap.get(rSub.id);
    if (bSub && !lSub) {
      // ローカル側で削除された交代レコード（リモート未変更なら削除を反映）
      if (isSameSubRecord(bSub, rSub)) continue;
      merged.push(rSub);
    } else if (bSub && lSub) {
      merged.push(isSameSubRecord(bSub, lSub) ? rSub : lSub);
    } else if (!bSub && lSub) {
      merged.push(lSub);
    } else {
      merged.push(rSub);
      remoteNewFingerprints.add(toFingerprint(rSub));
    }
  }

  for (const lSub of localSubs) {
    if (bMap.has(lSub.id) || rMap.has(lSub.id)) continue;
    if (remoteNewFingerprints.has(toFingerprint(lSub))) continue;
    merged.push(lSub);
  }

  return merged.sort((a, b) =>
    compareHalfInningOrder(a.inning, a.isBottom, b.inning, b.isBottom)
  );
}

function mergeLineupSlots3Way(
  baseLineup: ReadonlyArray<LiveReportLineupSlot> | null,
  remoteLineup: ReadonlyArray<LiveReportLineupSlot>,
  localLineup: ReadonlyArray<LiveReportLineupSlot>,
  hasBase: boolean
): LiveReportLineupSlot[] {
  const bMap = new Map((baseLineup || []).map((s) => [s.order, s]));
  const rMap = new Map(remoteLineup.map((s) => [s.order, s]));
  const lMap = new Map(localLineup.map((s) => [s.order, s]));

  const orderSet = new Set<number>();
  for (const s of remoteLineup) orderSet.add(s.order);
  for (const s of localLineup) orderSet.add(s.order);
  for (let ord = 1; ord <= 9; ord++) orderSet.add(ord);

  const sortedOrders = Array.from(orderSet).sort((a, b) => a - b);
  const result: LiveReportLineupSlot[] = [];

  for (const order of sortedOrders) {
    const bSlot = bMap.get(order);
    const rSlot = rMap.get(order);
    const lSlot = lMap.get(order);

    // 10番以降（DH/全員打ち追加枠）の削除伝播
    if (order > 9 && hasBase) {
      if (bSlot && !lSlot && rSlot && isSameLineupSlot(bSlot, rSlot)) {
        continue;
      }
      if (bSlot && !rSlot && lSlot && isSameLineupSlot(bSlot, lSlot)) {
        continue;
      }
    }

    const fallbackPos = String(order <= 9 ? order : "D");
    let position = rSlot?.position ?? lSlot?.position ?? fallbackPos;
    let playerName = rSlot?.playerName ?? lSlot?.playerName ?? "";
    let playerId = rSlot?.playerId ?? lSlot?.playerId ?? null;

    if (hasBase && bSlot) {
      if (lSlot && lSlot.position !== bSlot.position) {
        position = lSlot.position;
      }
      const localChangedName = lSlot !== undefined && lSlot.playerName !== bSlot.playerName;
      const localChangedId = lSlot !== undefined && lSlot.playerId !== bSlot.playerId;
      if (localChangedName || localChangedId) {
        playerName = lSlot?.playerName ?? "";
        playerId = lSlot?.playerId ?? null;
      }
    } else if (!rSlot?.playerName.trim() && lSlot?.playerName.trim()) {
      position = lSlot.position;
      playerName = lSlot.playerName;
      playerId = lSlot.playerId;
    }

    const substitutions = mergeSlotSubstitutions(
      bSlot?.substitutions ?? null,
      rSlot?.substitutions ?? [],
      lSlot?.substitutions ?? []
    );

    result.push({
      order,
      position,
      playerId,
      playerName,
      substitutions,
    });
  }

  return result.length > 0 ? result : createDefaultEmptyLineup(9);
}

function mergeChainedPlays3Way(
  baseChains: ReadonlyArray<LiveReportChainedPlay> | null,
  remoteChains: ReadonlyArray<LiveReportChainedPlay>,
  localChains: ReadonlyArray<LiveReportChainedPlay>
): LiveReportChainedPlay[] {
  const bMap = new Map((baseChains || []).map((c) => [c.id, c]));
  const rMap = new Map(remoteChains.map((c) => [c.id, c]));
  const lMap = new Map(localChains.map((c) => [c.id, c]));

  const merged: LiveReportChainedPlay[] = [];
  const remoteNewKeys = new Set<string>();
  const toKey = (c: LiveReportChainedPlay) =>
    `${c.playText.trim()}__${c.outsAfter}__${c.runsScored}`;

  for (const rChain of remoteChains) {
    const bChain = bMap.get(rChain.id);
    const lChain = lMap.get(rChain.id);
    if (bChain && !lChain) {
      if (isSameChainedPlay(bChain, rChain)) continue;
      merged.push(rChain);
    } else if (bChain && lChain) {
      merged.push(isSameChainedPlay(bChain, lChain) ? rChain : lChain);
    } else if (!bChain && lChain) {
      merged.push(lChain);
    } else {
      merged.push(rChain);
      remoteNewKeys.add(toKey(rChain));
    }
  }

  for (const lChain of localChains) {
    if (bMap.has(lChain.id) || rMap.has(lChain.id)) continue;
    if (remoteNewKeys.has(toKey(lChain))) continue;
    merged.push(lChain);
  }

  return merged;
}

function mergeReactionText3Way(
  baseText: string | undefined,
  remoteText: string,
  localText: string,
  hasBase: boolean
): string {
  if (hasBase && baseText !== undefined) {
    const rChanged = remoteText !== baseText;
    const lChanged = localText !== baseText;
    if (lChanged && !rChanged) return localText;
    if (!lChanged && rChanged) return remoteText;
    if (lChanged && rChanged) {
      if (!localText.trim()) return "";
      if (!remoteText.trim()) return localText;
      if (localText.includes(remoteText)) return localText;
      if (remoteText.includes(localText)) return remoteText;
      return localText;
    }
    return remoteText;
  }
  if (!remoteText.trim()) return localText;
  if (!localText.trim()) return remoteText;
  if (localText.includes(remoteText)) return localText;
  if (remoteText.includes(localText)) return remoteText;
  return remoteText;
}

function mergeExistingPlayEntry3Way(
  baseEnt: LiveReportPlayEntry | null,
  remoteEnt: LiveReportPlayEntry,
  localEnt: LiveReportPlayEntry
): LiveReportPlayEntry {
  const hasBase = baseEnt !== null;

  const localChangedSituation = hasBase
    ? localEnt.outsAfter !== baseEnt.outsAfter ||
      localEnt.runsScored !== baseEnt.runsScored ||
      !isSameRunnersArray(localEnt.runnersAfter, baseEnt.runnersAfter)
    : false;

  const outsAfter = localChangedSituation
    ? localEnt.outsAfter
    : remoteEnt.outsAfter;
  const runnersAfter = localChangedSituation
    ? normalizeRunnersList(localEnt.runnersAfter)
    : normalizeRunnersList(remoteEnt.runnersAfter);
  const runsScored = localChangedSituation
    ? localEnt.runsScored
    : remoteEnt.runsScored;

  const localChangedPitches = hasBase
    ? !isSamePitchesArray(localEnt.pitches, baseEnt?.pitches) ||
      (localEnt.pitchCount ?? 0) !== (baseEnt?.pitchCount ?? 0)
    : Boolean(
        (localEnt.pitches && localEnt.pitches.length > 0) ||
          (localEnt.pitchCount ?? 0) > 0
      ) &&
      !(
        (remoteEnt.pitches && remoteEnt.pitches.length > 0) ||
        (remoteEnt.pitchCount ?? 0) > 0
      );

  const pitches = localChangedPitches ? localEnt.pitches : remoteEnt.pitches;
  const pitchCount = localChangedPitches
    ? localEnt.pitchCount
    : remoteEnt.pitchCount;
  const batterPlayerId = pickScalar3Way(
    baseEnt?.batterPlayerId ?? null,
    remoteEnt.batterPlayerId ?? null,
    localEnt.batterPlayerId ?? null,
    hasBase
  );
  const resultCode = pickScalar3Way(
    baseEnt?.resultCode ?? "",
    remoteEnt.resultCode ?? "",
    localEnt.resultCode ?? "",
    hasBase
  );
  const battedDirection = pickScalar3Way(
    baseEnt?.battedDirection ?? "",
    remoteEnt.battedDirection ?? "",
    localEnt.battedDirection ?? "",
    hasBase
  );
  const rbi = pickScalar3Way(
    baseEnt?.rbi ?? undefined,
    remoteEnt.rbi,
    localEnt.rbi,
    hasBase
  );
  const pitcherPlayerId = pickScalar3Way(
    baseEnt?.pitcherPlayerId ?? null,
    remoteEnt.pitcherPlayerId ?? null,
    localEnt.pitcherPlayerId ?? null,
    hasBase
  );
  const pitcherName = pickScalar3Way(
    baseEnt?.pitcherName ?? "",
    remoteEnt.pitcherName ?? "",
    localEnt.pitcherName ?? "",
    hasBase
  );
  const subMeta =
    hasBase && !isSameSubMeta(localEnt.subMeta, baseEnt?.subMeta)
      ? localEnt.subMeta
      : remoteEnt.subMeta ?? localEnt.subMeta;

  return {
    id: remoteEnt.id,
    entryType: pickScalar3Way(
      baseEnt?.entryType,
      remoteEnt.entryType,
      localEnt.entryType,
      hasBase
    ),
    battingOrder: pickScalar3Way(
      baseEnt?.battingOrder,
      remoteEnt.battingOrder,
      localEnt.battingOrder,
      hasBase
    ),
    batterName: pickScalar3Way(
      baseEnt?.batterName,
      remoteEnt.batterName,
      localEnt.batterName,
      hasBase
    ),
    ...(batterPlayerId !== null ? { batterPlayerId } : {}),
    playText: pickScalar3Way(
      baseEnt?.playText,
      remoteEnt.playText,
      localEnt.playText,
      hasBase
    ),
    reactionText: mergeReactionText3Way(
      baseEnt?.reactionText,
      remoteEnt.reactionText,
      localEnt.reactionText,
      hasBase
    ),
    outsAfter,
    runnersAfter,
    runsScored,
    chainedPlays: mergeChainedPlays3Way(
      baseEnt?.chainedPlays ?? null,
      remoteEnt.chainedPlays,
      localEnt.chainedPlays
    ),
    eventText: pickScalar3Way(
      baseEnt?.eventText,
      remoteEnt.eventText,
      localEnt.eventText,
      hasBase
    ),
    ...(resultCode ? { resultCode } : {}),
    ...(battedDirection ? { battedDirection } : {}),
    ...(typeof rbi === "number" ? { rbi } : {}),
    ...(subMeta ? { subMeta } : {}),
    ...(pitches && pitches.length > 0 ? { pitches } : {}),
    ...(typeof pitchCount === "number" && pitchCount > 0 ? { pitchCount } : {}),
    ...(pitcherPlayerId ? { pitcherPlayerId } : {}),
    ...(pitcherName ? { pitcherName } : {}),
  };
}

function collapseSimultaneousSameBatterEntry(
  remoteNewEnt: LiveReportPlayEntry,
  localNewEnt: LiveReportPlayEntry
): LiveReportPlayEntry {
  let mergedReaction = localNewEnt.reactionText || remoteNewEnt.reactionText;
  if (remoteNewEnt.reactionText && localNewEnt.reactionText) {
    if (localNewEnt.reactionText.includes(remoteNewEnt.reactionText)) {
      mergedReaction = localNewEnt.reactionText;
    } else if (remoteNewEnt.reactionText.includes(localNewEnt.reactionText)) {
      mergedReaction = remoteNewEnt.reactionText;
    } else {
      mergedReaction = `${remoteNewEnt.reactionText}${localNewEnt.reactionText}`;
    }
  }

  return {
    ...remoteNewEnt,
    ...localNewEnt,
    id: remoteNewEnt.id,
    batterName: localNewEnt.batterName || remoteNewEnt.batterName,
    playText: localNewEnt.playText || remoteNewEnt.playText,
    reactionText: mergedReaction,
    outsAfter: localNewEnt.outsAfter,
    runnersAfter: normalizeRunnersList(localNewEnt.runnersAfter),
    runsScored: localNewEnt.runsScored,
    pitches:
      localNewEnt.pitches && localNewEnt.pitches.length > 0
        ? localNewEnt.pitches
        : remoteNewEnt.pitches,
    pitchCount: localNewEnt.pitchCount ?? remoteNewEnt.pitchCount,
    chainedPlays: mergeChainedPlays3Way(
      [],
      remoteNewEnt.chainedPlays,
      localNewEnt.chainedPlays
    ),
  };
}

function mergeHalfInnings3Way(
  baseHalves: ReadonlyArray<LiveReportHalfInning> | null,
  remoteHalves: ReadonlyArray<LiveReportHalfInning>,
  localHalves: ReadonlyArray<LiveReportHalfInning>,
  lineupLength: number,
  hasBase: boolean
): LiveReportHalfInning[] {
  const toHalfKey = (inning: number, isBottom: boolean) =>
    `${inning}-${isBottom ? "B" : "T"}`;

  const bMap = new Map(
    (baseHalves || []).map((h) => [toHalfKey(h.inning, h.isBottom), h])
  );
  const rMap = new Map(
    remoteHalves.map((h) => [toHalfKey(h.inning, h.isBottom), h])
  );
  const lMap = new Map(
    localHalves.map((h) => [toHalfKey(h.inning, h.isBottom), h])
  );

  const halfCoords = new Map<string, { inning: number; isBottom: boolean }>();
  for (const h of remoteHalves) {
    halfCoords.set(toHalfKey(h.inning, h.isBottom), {
      inning: h.inning,
      isBottom: h.isBottom,
    });
  }
  for (const h of localHalves) {
    halfCoords.set(toHalfKey(h.inning, h.isBottom), {
      inning: h.inning,
      isBottom: h.isBottom,
    });
  }

  const sortedHalfSpecs = Array.from(halfCoords.entries())
    .map(([key, coord]) => ({ key, ...coord }))
    .sort((a, b) =>
      compareHalfInningOrder(a.inning, a.isBottom, b.inning, b.isBottom)
    );

  const mergedHalves: LiveReportHalfInning[] = [];
  const sameOrderWindow = Math.max(9, lineupLength);

  for (const spec of sortedHalfSpecs) {
    const bHalf = bMap.get(spec.key) ?? null;
    const rHalf = rMap.get(spec.key) ?? null;
    const lHalf = lMap.get(spec.key) ?? null;

    let manualRunsOverride: number | null = null;
    if (hasBase) {
      const bOverride = bHalf?.manualRunsOverride ?? null;
      const rOverride = rHalf?.manualRunsOverride ?? null;
      const lOverride = lHalf?.manualRunsOverride ?? null;
      manualRunsOverride = lOverride !== bOverride ? lOverride : rOverride;
    } else {
      manualRunsOverride =
        rHalf?.manualRunsOverride ?? lHalf?.manualRunsOverride ?? null;
    }

    const bEntries = bHalf?.entries ?? [];
    const rEntries = rHalf?.entries ?? [];
    const lEntries = lHalf?.entries ?? [];

    const bEntMap = new Map(bEntries.map((e) => [e.id, e]));
    const rEntMap = new Map(rEntries.map((e) => [e.id, e]));
    const lEntMap = new Map(lEntries.map((e) => [e.id, e]));

    const mergedEntries: LiveReportPlayEntry[] = [];
    const unconsumedRemoteNewIds = new Set<string>();

    // Step 1: リモート側の打席・イベント順序をベースに構築
    for (const rEnt of rEntries) {
      const bEnt = bEntMap.get(rEnt.id) ?? null;
      const lEnt = lEntMap.get(rEnt.id) ?? null;

      if (bEnt && !lEnt) {
        // ローカルで明示削除された行（リモート未編集なら削除を確定）
        if (isSamePlayEntry(bEnt, rEnt)) {
          continue;
        }
        mergedEntries.push(rEnt);
      } else if (lEnt) {
        mergedEntries.push(mergeExistingPlayEntry3Way(bEnt, rEnt, lEnt));
      } else {
        mergedEntries.push(rEnt);
        unconsumedRemoteNewIds.add(rEnt.id);
      }
    }

    // Step 2: ローカル側で新規追加された行をマージ（同一打者の同時二重タップは1打席に統合）
    for (let lIdx = 0; lIdx < lEntries.length; lIdx++) {
      const lEnt = lEntries[lIdx];
      if (bEntMap.has(lEnt.id) || rEntMap.has(lEnt.id)) continue;

      if (lEnt.entryType === "batter") {
        let collapsedIndex = -1;
        let battersSeenFromEnd = 0;

        for (let mIdx = mergedEntries.length - 1; mIdx >= 0; mIdx--) {
          const candidate = mergedEntries[mIdx];
          if (candidate.entryType !== "batter") continue;
          if (battersSeenFromEnd >= sameOrderWindow) break;

          if (
            unconsumedRemoteNewIds.has(candidate.id) &&
            candidate.battingOrder === lEnt.battingOrder
          ) {
            collapsedIndex = mIdx;
            break;
          }
          battersSeenFromEnd += 1;
        }

        if (collapsedIndex >= 0) {
          const target = mergedEntries[collapsedIndex];
          mergedEntries[collapsedIndex] = collapseSimultaneousSameBatterEntry(
            target,
            lEnt
          );
          unconsumedRemoteNewIds.delete(target.id);
        } else {
          mergedEntries.push(lEnt);
        }
      } else {
        // 選手交代・自由メモ行の重複排除＆直前行アンカー挿入
        const duplicateEvent = mergedEntries.some(
          (m) =>
            unconsumedRemoteNewIds.has(m.id) &&
            m.entryType === lEnt.entryType &&
            m.eventText.trim() === lEnt.eventText.trim()
        );
        if (duplicateEvent) continue;

        let insertAt = mergedEntries.length;
        for (let prevIdx = lIdx - 1; prevIdx >= 0; prevIdx--) {
          const anchorId = lEntries[prevIdx].id;
          const foundIdx = mergedEntries.findIndex((m) => m.id === anchorId);
          if (foundIdx >= 0) {
            insertAt = foundIdx + 1;
            break;
          }
        }
        if (lIdx === 0 && lEntries.length > 1) {
          const nextId = lEntries[1].id;
          const foundNextIdx = mergedEntries.findIndex((m) => m.id === nextId);
          if (foundNextIdx >= 0) {
            insertAt = foundNextIdx;
          }
        }
        mergedEntries.splice(insertAt, 0, lEnt);
      }
    }

    if (mergedEntries.length > 0 || manualRunsOverride !== null) {
      mergedHalves.push({
        inning: spec.inning,
        isBottom: spec.isBottom,
        entries: mergedEntries,
        manualRunsOverride,
      });
    }
  }

  return mergedHalves;
}

function getLastBatterSnapshotForSide(
  halfInnings: ReadonlyArray<LiveReportHalfInning>,
  battingOrder: "first" | "second",
  isMySide: boolean
): { entryId: string; battingOrder: number } | null {
  const sorted = [...halfInnings].sort((a, b) =>
    compareHalfInningOrder(a.inning, a.isBottom, b.inning, b.isBottom)
  );
  let last: { entryId: string; battingOrder: number } | null = null;
  for (const half of sorted) {
    if (isMyTeamBattingHalf(battingOrder, half.isBottom) !== isMySide) {
      continue;
    }
    for (const ent of half.entries) {
      if (ent.entryType === "batter") {
        last = { entryId: ent.id, battingOrder: ent.battingOrder };
      }
    }
  }
  return last;
}

function getFrontlinePlayedHalf(
  halfInnings: ReadonlyArray<LiveReportHalfInning>
): { inning: number; isBottom: boolean } | null {
  let latest: { inning: number; isBottom: boolean } | null = null;
  for (const h of halfInnings) {
    if (h.entries.length === 0 && h.manualRunsOverride === null) continue;
    if (
      !latest ||
      compareHalfInningOrder(h.inning, h.isBottom, latest.inning, latest.isBottom) > 0
    ) {
      latest = { inning: h.inning, isBottom: h.isBottom };
    }
  }
  return latest;
}

export interface MergeLiveReportDocumentsParams {
  base: LiveReportV2Document | null;
  remote: LiveReportV2Document;
  local: LiveReportV2Document;
  /**
   * クライアント側のバックグラウンド同期用：
   * ローカルユーザーが過去イニングを閲覧・編集中に別イニングへ強制ジャンプするのを防ぎ、
   * リモートがベースより先の回へ前進し、かつローカルがベースと同じ回にいた場合のみ自動追従させる。
   */
  clientSideCursorFollow?: boolean;
}

export function mergeLiveReportDocuments({
  base,
  remote,
  local,
  clientSideCursorFollow = false,
}: MergeLiveReportDocumentsParams): LiveReportV2Document {
  const hasBase = base !== null;

  const mergedBattingOrder = pickScalar3Way(
    base?.battingOrder,
    remote.battingOrder,
    local.battingOrder,
    hasBase
  );

  const mergedLineup = mergeLineupSlots3Way(
    base?.lineup ?? null,
    remote.lineup,
    local.lineup,
    hasBase
  );

  const mergedHalfInnings = mergeHalfInnings3Way(
    base?.halfInnings ?? null,
    remote.halfInnings,
    local.halfInnings,
    mergedLineup.length,
    hasBase
  );

  // 次打者カーソル（nextMyOrder / nextOpponentOrder）の再計算と手動シフト保護
  const limitMy = Math.max(9, mergedLineup.length);
  const mergedLastMy = getLastBatterSnapshotForSide(
    mergedHalfInnings,
    mergedBattingOrder,
    true
  );
  const baseLastMy = base
    ? getLastBatterSnapshotForSide(base.halfInnings, base.battingOrder, true)
    : null;
  const localLastMy = getLastBatterSnapshotForSide(
    local.halfInnings,
    local.battingOrder,
    true
  );
  const expectedLocalNextMy = localLastMy
    ? (localLastMy.battingOrder % Math.max(9, local.lineup.length)) + 1
    : 1;
  const localManuallyShiftedMy =
    hasBase &&
    base !== null &&
    local.nextMyOrder !== base.nextMyOrder &&
    local.nextMyOrder !== expectedLocalNextMy;

  let nextMyOrder: number;
  if (localManuallyShiftedMy && mergedLastMy?.entryId === localLastMy?.entryId) {
    nextMyOrder = local.nextMyOrder;
  } else if (mergedLastMy && mergedLastMy.entryId !== baseLastMy?.entryId) {
    nextMyOrder = (mergedLastMy.battingOrder % limitMy) + 1;
  } else {
    nextMyOrder = pickScalar3Way(
      base?.nextMyOrder,
      remote.nextMyOrder,
      local.nextMyOrder,
      hasBase
    );
  }

  const mergedOpponentBatterCount = Math.max(
    9,
    Math.min(
      25,
      pickScalar3Way(
        base?.opponentBatterCount,
        remote.opponentBatterCount ?? 9,
        local.opponentBatterCount ?? 9,
        hasBase
      ) || 9
    )
  );
  const localOppLimit = Math.max(9, local.opponentBatterCount || 9);

  const mergedLastOpp = getLastBatterSnapshotForSide(
    mergedHalfInnings,
    mergedBattingOrder,
    false
  );
  const baseLastOpp = base
    ? getLastBatterSnapshotForSide(base.halfInnings, base.battingOrder, false)
    : null;
  const localLastOpp = getLastBatterSnapshotForSide(
    local.halfInnings,
    local.battingOrder,
    false
  );
  const expectedLocalNextOpp = localLastOpp
    ? (localLastOpp.battingOrder % localOppLimit) + 1
    : 1;
  const localManuallyShiftedOpp =
    hasBase &&
    base !== null &&
    local.nextOpponentOrder !== base.nextOpponentOrder &&
    local.nextOpponentOrder !== expectedLocalNextOpp;

  let nextOpponentOrder: number;
  if (
    localManuallyShiftedOpp &&
    mergedLastOpp?.entryId === localLastOpp?.entryId
  ) {
    nextOpponentOrder = local.nextOpponentOrder;
  } else if (mergedLastOpp && mergedLastOpp.entryId !== baseLastOpp?.entryId) {
    nextOpponentOrder =
      (mergedLastOpp.battingOrder % mergedOpponentBatterCount) + 1;
  } else {
    nextOpponentOrder = pickScalar3Way(
      base?.nextOpponentOrder,
      remote.nextOpponentOrder,
      local.nextOpponentOrder,
      hasBase
    );
  }

  // アクティブイニング（activeInning / activeIsBottom）の決定
  let activeInning = remote.activeInning;
  let activeIsBottom = remote.activeIsBottom;

  if (clientSideCursorFollow && base) {
    const remoteAdvancedFromBase =
      compareHalfInningOrder(
        remote.activeInning,
        remote.activeIsBottom,
        base.activeInning,
        base.activeIsBottom
      ) > 0;
    const localStayedAtBase =
      local.activeInning === base.activeInning &&
      local.activeIsBottom === base.activeIsBottom;

    if (remoteAdvancedFromBase && localStayedAtBase) {
      activeInning = remote.activeInning;
      activeIsBottom = remote.activeIsBottom;
    } else {
      activeInning = local.activeInning;
      activeIsBottom = local.activeIsBottom;
    }
  } else if (hasBase && base) {
    const rChanged =
      remote.activeInning !== base.activeInning ||
      remote.activeIsBottom !== base.activeIsBottom;
    const lChanged =
      local.activeInning !== base.activeInning ||
      local.activeIsBottom !== base.activeIsBottom;

    if (lChanged && !rChanged) {
      const frontline = getFrontlinePlayedHalf(mergedHalfInnings);
      // 既に後ろのイニングに打席記録がある場合、サブ担当者の過去イニング閲覧でクラウド上の最前線カーソルを巻き戻さない
      if (
        frontline &&
        compareHalfInningOrder(
          local.activeInning,
          local.activeIsBottom,
          frontline.inning,
          frontline.isBottom
        ) < 0 &&
        compareHalfInningOrder(
          remote.activeInning,
          remote.activeIsBottom,
          frontline.inning,
          frontline.isBottom
        ) >= 0
      ) {
        activeInning = remote.activeInning;
        activeIsBottom = remote.activeIsBottom;
      } else {
        activeInning = local.activeInning;
        activeIsBottom = local.activeIsBottom;
      }
    } else if (!lChanged && rChanged) {
      activeInning = remote.activeInning;
      activeIsBottom = remote.activeIsBottom;
    } else if (lChanged && rChanged) {
      if (
        compareHalfInningOrder(
          local.activeInning,
          local.activeIsBottom,
          remote.activeInning,
          remote.activeIsBottom
        ) >= 0
      ) {
        activeInning = local.activeInning;
        activeIsBottom = local.activeIsBottom;
      } else {
        activeInning = remote.activeInning;
        activeIsBottom = remote.activeIsBottom;
      }
    }
  } else {
    if (
      compareHalfInningOrder(
        local.activeInning,
        local.activeIsBottom,
        remote.activeInning,
        remote.activeIsBottom
      ) > 0
    ) {
      activeInning = local.activeInning;
      activeIsBottom = local.activeIsBottom;
    }
  }

  const isGameFinished = hasBase
    ? pickScalar3Way(
        base?.isGameFinished,
        remote.isGameFinished,
        local.isGameFinished,
        true
      )
    : remote.isGameFinished || local.isGameFinished;

  const mergedPitchLimitOverride = pickScalar3Way(
    base?.pitchLimitOverride ?? undefined,
    remote.pitchLimitOverride,
    local.pitchLimitOverride,
    hasBase
  );

  const mergedPitchAdj: Record<string, number> = {};
  const adjKeys = new Set<string>([
    ...Object.keys(remote.pitcherPitchAdjustments || {}),
    ...Object.keys(local.pitcherPitchAdjustments || {}),
  ]);
  for (const key of adjKeys) {
    const bVal = base?.pitcherPitchAdjustments?.[key] ?? 0;
    const rVal = remote.pitcherPitchAdjustments?.[key] ?? 0;
    const lVal = local.pitcherPitchAdjustments?.[key] ?? 0;
    const chosen = hasBase ? (lVal !== bVal ? lVal : rVal) : lVal || rVal;
    if (chosen !== 0) {
      mergedPitchAdj[key] = chosen;
    }
  }

  return {
    version: 2,
    matchId: local.matchId ?? remote.matchId ?? null,
    dateText: pickScalar3Way(
      base?.dateText,
      remote.dateText,
      local.dateText,
      hasBase
    ),
    tournamentText: pickScalar3Way(
      base?.tournamentText,
      remote.tournamentText,
      local.tournamentText,
      hasBase
    ),
    opponentName: pickScalar3Way(
      base?.opponentName,
      remote.opponentName,
      local.opponentName,
      hasBase
    ),
    venueName: pickScalar3Way(
      base?.venueName,
      remote.venueName,
      local.venueName,
      hasBase
    ),
    startTime: pickScalar3Way(
      base?.startTime,
      remote.startTime,
      local.startTime,
      hasBase
    ),
    endTime: pickScalar3Way(
      base?.endTime,
      remote.endTime,
      local.endTime,
      hasBase
    ),
    battingOrder: mergedBattingOrder,
    regulationInnings: pickScalar3Way(
      base?.regulationInnings,
      remote.regulationInnings,
      local.regulationInnings,
      hasBase
    ),
    opponentBatterCount: mergedOpponentBatterCount,
    firstTeamShortName: pickScalar3Way(
      base?.firstTeamShortName,
      remote.firstTeamShortName,
      local.firstTeamShortName,
      hasBase
    ),
    secondTeamShortName: pickScalar3Way(
      base?.secondTeamShortName,
      remote.secondTeamShortName,
      local.secondTeamShortName,
      hasBase
    ),
    showSurnameOnly: pickScalar3Way(
      base?.showSurnameOnly,
      remote.showSurnameOnly,
      local.showSurnameOnly,
      hasBase
    ),
    appendSubsToTopLineup: pickScalar3Way(
      base?.appendSubsToTopLineup,
      remote.appendSubsToTopLineup,
      local.appendSubsToTopLineup,
      hasBase
    ),
    showWalkoffX: pickScalar3Way(
      base?.showWalkoffX,
      remote.showWalkoffX,
      local.showWalkoffX,
      hasBase
    ),
    lineup: mergedLineup,
    halfInnings: mergedHalfInnings,
    activeInning: Math.max(1, activeInning),
    activeIsBottom,
    nextMyOrder,
    nextOpponentOrder,
    isGameFinished,
    closingComment: pickScalar3Way(
      base?.closingComment,
      remote.closingComment,
      local.closingComment,
      hasBase
    ),
    reporterNames: mergeReporterNames3Way(
      base?.reporterNames,
      remote.reporterNames,
      local.reporterNames,
      hasBase
    ),
    ...(Object.keys(mergedPitchAdj).length > 0
      ? { pitcherPitchAdjustments: mergedPitchAdj }
      : {}),
    ...(mergedPitchLimitOverride !== undefined
      ? { pitchLimitOverride: mergedPitchLimitOverride }
      : {}),
  };
}

// =========================================================
// 9. ライブ速報 球数集計エンジン（投手別球数 ＆ 現在マウンド上の投手解決）
// =========================================================

export function toLivePitcherKey(
  playerId: string | null | undefined,
  playerName: string | null | undefined
): string {
  const cleanId = (playerId || "").trim();
  if (cleanId) return `id:${cleanId}`;
  const cleanName = (playerName || "").trim();
  if (cleanName) return `name:${cleanName}`;
  return "id:__my_default_pitcher__";
}

export function resolveActiveMyPitcherAtHalfInning(
  doc: LiveReportV2Document,
  inning: number,
  isBottom: boolean
): { key: string; playerId: string | null; playerName: string } {
  let pitcherId: string | null = null;
  let pitcherName = "";

  for (const slot of doc.lineup) {
    if (
      Boolean(slot.playerId || (slot.playerName || "").trim()) &&
      normalizeReportPositionCode(slot.position) === "1"
    ) {
      pitcherId = slot.playerId || null;
      pitcherName = (slot.playerName || "").trim();
      break;
    }
  }

  if (!pitcherId && !pitcherName && doc.dhStarterPitcher) {
    pitcherId = doc.dhStarterPitcher.playerId || null;
    pitcherName = (doc.dhStarterPitcher.playerName || "").trim();
  }

  const allSubs: Array<LiveReportLineupSubRecord & { slotOrder: number }> = [];
  for (const slot of doc.lineup) {
    for (const sub of slot.substitutions || []) {
      if (
        compareHalfInningOrder(sub.inning, sub.isBottom, inning, isBottom) <= 0
      ) {
        allSubs.push({ ...sub, slotOrder: slot.order });
      }
    }
  }
  allSubs.sort((a, b) =>
    compareHalfInningOrder(a.inning, a.isBottom, b.inning, b.isBottom)
  );

  for (const sub of allSubs) {
    const normNewPos = normalizeReportPositionCode(sub.newPosition);
    if (sub.subType === "P" || normNewPos === "1") {
      pitcherId = sub.playerId || null;
      pitcherName = (sub.newName || "").trim();
    }
  }

  return {
    key: toLivePitcherKey(pitcherId, pitcherName),
    playerId: pitcherId,
    playerName: pitcherName || "自チーム投手",
  };
}

export interface LiveReportPitcherCountSummary {
  activeMyPitcherKey: string;
  activeMyPitcherId: string | null;
  activeMyPitcherName: string;
  activeMyPitcherPitches: number;
  myPitchers: Array<{
    key: string;
    playerId: string | null;
    playerName: string;
    pitches: number;
  }>;
  opponentTotalPitches: number;
}

export function computeLiveReportPitchCounts(
  doc: LiveReportV2Document
): LiveReportPitcherCountSummary {
  const activePitcher = resolveActiveMyPitcherAtHalfInning(
    doc,
    doc.activeInning,
    doc.activeIsBottom
  );

  const pitcherMap = new Map<
    string,
    { key: string; playerId: string | null; playerName: string; pitches: number }
  >();
  let opponentTotalPitches = 0;

  const ensurePitcher = (
    key: string,
    playerId: string | null,
    playerName: string
  ) => {
    let rec = pitcherMap.get(key);
    if (!rec) {
      rec = {
        key,
        playerId,
        playerName: playerName || "自チーム投手",
        pitches: 0,
      };
      pitcherMap.set(key, rec);
    } else if (!rec.playerName && playerName) {
      rec.playerName = playerName;
    }
    return rec;
  };

  ensurePitcher(
    activePitcher.key,
    activePitcher.playerId,
    activePitcher.playerName
  );

  const sortedHalves = [...doc.halfInnings].sort((a, b) =>
    compareHalfInningOrder(a.inning, a.isBottom, b.inning, b.isBottom)
  );

  for (const half of sortedHalves) {
    const isMyBatting = isMyTeamBattingHalf(doc.battingOrder, half.isBottom);
    let currentHalfPitcher = !isMyBatting
      ? resolveActiveMyPitcherAtHalfInning(doc, half.inning, half.isBottom)
      : null;

    for (const ent of half.entries) {
      if (
        !isMyBatting &&
        ent.entryType === "substitution" &&
        ent.subMeta &&
        (ent.subMeta.subType === "P" ||
          normalizeReportPositionCode(ent.subMeta.newPosition) === "1")
      ) {
        const nextId = ent.subMeta.playerId || null;
        const nextName = (ent.subMeta.newName || "").trim() || "自チーム投手";
        currentHalfPitcher = {
          key: toLivePitcherKey(nextId, nextName),
          playerId: nextId,
          playerName: nextName,
        };
      }

      if (ent.entryType !== "batter") continue;
      const abPitches =
        typeof ent.pitchCount === "number" && ent.pitchCount > 0
          ? ent.pitchCount
          : ent.pitches?.length ?? 0;
      if (abPitches <= 0) continue;

      if (isMyBatting) {
        opponentTotalPitches += abPitches;
      } else {
        const resolvedId =
          ent.pitcherPlayerId !== undefined
            ? ent.pitcherPlayerId
            : currentHalfPitcher?.playerId ?? null;
        const resolvedName =
          ent.pitcherName?.trim() ||
          currentHalfPitcher?.playerName ||
          "自チーム投手";
        const key = toLivePitcherKey(resolvedId, resolvedName);
        const rec = ensurePitcher(key, resolvedId, resolvedName);
        rec.pitches += abPitches;
      }
    }
  }

  const adjustments = doc.pitcherPitchAdjustments || {};
  for (const [adjKey, delta] of Object.entries(adjustments)) {
    if (!Number.isFinite(delta) || delta === 0) continue;
    if (adjKey === "__opponent__") {
      opponentTotalPitches = Math.max(0, opponentTotalPitches + delta);
      continue;
    }
    const existing = pitcherMap.get(adjKey);
    if (existing) {
      existing.pitches = Math.max(0, existing.pitches + delta);
    } else if (adjKey === activePitcher.key) {
      const rec = ensurePitcher(
        activePitcher.key,
        activePitcher.playerId,
        activePitcher.playerName
      );
      rec.pitches = Math.max(0, rec.pitches + delta);
    }
  }

  const activeRec = pitcherMap.get(activePitcher.key);

  return {
    activeMyPitcherKey: activePitcher.key,
    activeMyPitcherId: activePitcher.playerId,
    activeMyPitcherName: activePitcher.playerName,
    activeMyPitcherPitches: activeRec?.pitches ?? 0,
    myPitchers: Array.from(pitcherMap.values()),
    opponentTotalPitches,
  };
}

// =========================================================
// 10. 記録済み行の入力パッド再入力・修正 ＆ 後続打席自動調停エンジン
// =========================================================

export function sameRunnersList(
  a: ReadonlyArray<LiveReportBaseNum>,
  b: ReadonlyArray<LiveReportBaseNum>
): boolean {
  const na = normalizeRunnersList(a);
  const nb = normalizeRunnersList(b);
  if (na.length !== nb.length) return false;
  for (let i = 0; i < na.length; i++) {
    if (na[i] !== nb[i]) return false;
  }
  return true;
}

/**
 * 指定した記録行（targetEntryId）の「直前時点」におけるアウト数・塁上走者・走者氏名を算出する。
 */
export function computeSituationBeforeEntry(
  half: LiveReportHalfInning | undefined,
  targetEntryId: string
): HalfInningLiveSituation {
  if (!half) {
    return { outs: 0, runners: [], runs: 0, runnerNames: {} };
  }
  const idx = half.entries.findIndex((e) => e.id === targetEntryId);
  if (idx <= 0) {
    return { outs: 0, runners: [], runs: 0, runnerNames: {} };
  }
  return computeHalfInningSituation({
    inning: half.inning,
    isBottom: half.isBottom,
    entries: half.entries.slice(0, idx),
    manualRunsOverride: null,
    manualOutsOverride: null,
    manualRunnersOverride: null,
  });
}

/**
 * 1打席確定時に付与する最終球数配列（終端の in_play / 4球目ball / 3球目strike を含む）を組み立てる。
 */
export function buildAttachedPitchesForAtBat(params: {
  pendingPitches: ReadonlyArray<LiveReportPitchType>;
  isPitchTrackingActive: boolean;
  selectedDirect: DirectOutcomeCode | null;
  selectedBatted: BattedOutcomeCode | null;
  selectedBattedVariant: BattedPlayVariant | null;
  finalPlayText: string;
}): LiveReportPitchType[] | undefined {
  const {
    pendingPitches,
    isPitchTrackingActive,
    selectedDirect,
    selectedBatted,
    selectedBattedVariant,
    finalPlayText,
  } = params;

  if (!isPitchTrackingActive) return undefined;

  const finalPitches: LiveReportPitchType[] = [...pendingPitches];
  let balls = 0;
  let strikes = 0;
  for (const p of pendingPitches) {
    if (p === "ball") {
      balls += 1;
    } else if (p === "strike") {
      strikes += 1;
    } else if (p === "foul" && strikes < 2) {
      strikes += 1;
    }
  }

  const isIntentionalWalk =
    selectedDirect === "ibb" ||
    (!selectedDirect && !selectedBatted && finalPlayText.includes("敬遠"));
  const isWalk =
    !isIntentionalWalk &&
    (selectedDirect === "walk" ||
      (!selectedDirect && !selectedBatted && finalPlayText.includes("四球")));
  const isStrikeout =
    selectedDirect === "strikeout_swing" ||
    selectedDirect === "strikeout_look" ||
    selectedDirect === "dropped_3rd_out" ||
    selectedDirect === "dropped_3rd_safe" ||
    (selectedBatted === "double_play" &&
      selectedBattedVariant === "dp_strikeout_cs") ||
    (!selectedDirect &&
      !selectedBatted &&
      (finalPlayText.includes("三振") || finalPlayText.includes("振逃")));

  if (isIntentionalWalk) {
    // 敬遠で pendingPitches が空ならそのまま空配列
  } else if (isWalk) {
    if (balls < 4) {
      finalPitches.push("ball");
    }
  } else if (isStrikeout) {
    if (strikes < 3) {
      finalPitches.push("strike");
    }
  } else {
    finalPitches.push("in_play");
  }

  return finalPitches;
}

/**
 * 記録済み打席の pitches から自動付与された終端1球（in_play / 4球目ball / 3球目strike）を除き、
 * パッド再編集用の pendingPitches を復元する（そのまま再確定しても球数が+1膨張しない）。
 */
export function extractEditablePendingPitches(
  entry: LiveReportPlayEntry
): LiveReportPitchType[] {
  if (!Array.isArray(entry.pitches) || entry.pitches.length === 0) {
    return [];
  }
  const copy = [...entry.pitches];
  const last = copy[copy.length - 1];

  const rawText = (entry.playText || "").trim();
  const isIntentionalWalk =
    entry.resultCode === "ibb" ||
    (!entry.resultCode && rawText.includes("敬遠"));
  const isWalk =
    !isIntentionalWalk &&
    (entry.resultCode === "walk" || rawText.includes("四球"));
  const isStrikeout =
    entry.resultCode === "strikeout_swing" ||
    entry.resultCode === "strikeout_look" ||
    entry.resultCode === "dropped_3rd_out" ||
    entry.resultCode === "dropped_3rd_safe" ||
    rawText.includes("三振") ||
    rawText.includes("振逃");

  if (last === "in_play") {
    copy.pop();
  } else if (last === "ball" && isWalk) {
    const ballCount = copy.filter((p) => p === "ball").length;
    if (ballCount <= 4) {
      copy.pop();
    }
  } else if (last === "strike" && isStrikeout) {
    let strikes = 0;
    for (const p of copy) {
      if (p === "strike") strikes += 1;
      else if (p === "foul" && strikes < 2) strikes += 1;
    }
    if (strikes <= 3) {
      copy.pop();
    }
  }

  return copy.filter(
    (p): p is LiveReportPitchType =>
      p === "ball" || p === "strike" || p === "foul"
  );
}

const POS_NUM_TO_PAD_DIRECTION: Record<string, string> = {
  "1": "投",
  "2": "捕",
  "3": "一",
  "4": "二",
  "5": "三",
  "6": "遊",
  "7": "左",
  "8": "中",
  "9": "右",
};

const KNOWN_PAD_DIRECTION_PREFIXES: ReadonlyArray<string> = [
  "左中間破る",
  "右中間破る",
  "左中間",
  "右中間",
  "左中浅",
  "左中深",
  "右中浅",
  "右中深",
  "左中",
  "右中",
  "三遊間",
  "二遊間",
  "一二間",
  "投強襲",
  "一強襲",
  "二強襲",
  "三強襲",
  "遊強襲",
  "投一側",
  "投三側",
  "二後方",
  "遊後方",
  "投前",
  "捕前",
  "捕邪",
  "一線",
  "一邪",
  "三線",
  "三前",
  "三邪",
  "左前",
  "左線",
  "左越",
  "左浅",
  "左深",
  "中前",
  "中越",
  "中浅",
  "中深",
  "右前",
  "右線",
  "右越",
  "右浅",
  "右深",
  "投",
  "捕",
  "一",
  "二",
  "三",
  "遊",
  "左",
  "中",
  "右",
];

export function resolvePadDirectionAnchor(direction: string): string {
  const d = (direction || "").trim();
  if (!d) return "";
  if (d.startsWith("左中")) return "左中";
  if (d.startsWith("右中")) return "右中";
  if (d === "一二間") return "二";
  if (d === "二遊間" || d === "三遊間") return "遊";
  const single = ["投", "捕", "一", "二", "三", "遊", "左", "中", "右"].find(
    (head) => d.startsWith(head)
  );
  return single || "";
}

function extractDirectionFromPlayText(playText: string): string {
  const t = playText.trim();
  if (!t) return "";
  if (
    t.startsWith("三振") ||
    t.startsWith("三塁") ||
    t.startsWith("二塁") ||
    t.startsWith("一塁")
  ) {
    return "";
  }
  for (const prefix of KNOWN_PAD_DIRECTION_PREFIXES) {
    if (t.startsWith(prefix)) {
      if (prefix === "左中間") return "左中";
      if (prefix === "右中間") return "右中";
      return prefix;
    }
  }
  return "";
}

const VALID_DIRECT_CODES = new Set<DirectOutcomeCode>([
  "strikeout_swing",
  "strikeout_look",
  "dropped_3rd_out",
  "dropped_3rd_safe",
  "walk",
  "ibb",
  "hbp",
]);

const VALID_BATTED_CODES = new Set<BattedOutcomeCode>([
  "groundout",
  "hard_groundout",
  "double_play",
  "flyout",
  "liner",
  "foul_fly",
  "sac_bunt",
  "sac_fly",
  "front_hit",
  "hit",
  "infield_hit",
  "double",
  "triple",
  "homerun",
  "rh_homerun",
  "error",
  "fc",
]);

export interface InferredPadSelection {
  direction: string;
  directionAnchor: string;
  directCode: DirectOutcomeCode | null;
  directVariant: DirectPlayVariant | null;
  directActiveChip: string | null;
  battedCode: BattedOutcomeCode | null;
  battedVariant: BattedPlayVariant | null;
  battedActiveChip: string | null;
  candidateIdx: number;
  matchedCandidateId: string | null;
  customPlayText: string | null;
  customOutsAfter: number | null;
  customRunnersAfter: LiveReportBaseNum[] | null;
  customRunsScored: number | null;
}

function inferDirectFromEntry(
  entry: LiveReportPlayEntry,
  outsBefore: number
): {
  code: DirectOutcomeCode;
  variant: DirectPlayVariant | null;
  activeChip: string | null;
} | null {
  const rc = (entry.resultCode || "").trim();
  const rawText = (entry.playText || "").trim();

  let code: DirectOutcomeCode | null = null;
  if (VALID_DIRECT_CODES.has(rc as DirectOutcomeCode)) {
    code = rc as DirectOutcomeCode;
  } else if (rc === "intentional_walk") {
    code = "ibb";
  } else if (rc === "hit_by_pitch") {
    code = "hbp";
  } else if (rc === "dropped_third_strike_out") {
    code = "dropped_3rd_out";
  } else if (rc === "dropped_third_strike") {
    code = "dropped_3rd_safe";
  } else if (rc === "strikeout") {
    code = rawText.includes("見") ? "strikeout_look" : "strikeout_swing";
  } else if (!rc && !rawText.includes("三振併殺")) {
    if (rawText.includes("見逃三振") || rawText.includes("見三振")) {
      code = "strikeout_look";
    } else if (
      rawText.includes("ファウルチップ三振") ||
      rawText.includes("空三振") ||
      rawText === "三振"
    ) {
      code = "strikeout_swing";
    } else if (rawText.includes("振逃") || rawText.includes("三振暴投")) {
      code =
        entry.outsAfter > outsBefore && !rawText.includes("暴投振逃")
          ? "dropped_3rd_out"
          : "dropped_3rd_safe";
    } else if (rawText.includes("敬遠")) {
      code = "ibb";
    } else if (rawText.includes("死球")) {
      code = "hbp";
    } else if (rawText.includes("四球")) {
      code = "walk";
    }
  }

  if (!code) return null;

  let variant: DirectPlayVariant | null = null;
  let activeChip: string | null = null;
  if (code === "strikeout_swing" && rawText.includes("ファウルチップ")) {
    variant = "so_foul_tip";
    activeChip = "チップ三振";
  } else if (code === "walk") {
    if (rawText.includes("ストレート四球")) {
      variant = "walk_four_pitch";
      activeChip = "スト四球";
    } else if (rawText.includes("粘って四球")) {
      variant = "walk_full_count";
      activeChip = "粘り四球";
    } else if (rawText.includes("四球暴投")) {
      variant = "walk_wp_2b";
      activeChip = "四球二進";
    }
  } else if (
    code === "dropped_3rd_safe" &&
    (rawText.includes("暴投振逃") || rawText.includes("三振暴投"))
  ) {
    variant = "dts_wp_safe";
    activeChip = "暴投振逃";
  }

  return { code, variant, activeChip };
}

function inferBattedVariantAndChip(
  code: BattedOutcomeCode,
  rawText: string,
  direction: string
): { variant: BattedPlayVariant | null; activeChip: string | null } {
  if (code === "groundout") {
    if (rawText.includes("ボテボテゴロ")) {
      return { variant: "ground_botebote", activeChip: "ボテゴロ" };
    }
    if (rawText.includes("高いバウンドゴロ")) {
      return { variant: "ground_high_bound", activeChip: "高バウンド" };
    }
    if (rawText.includes("ゴロタッチアウト")) {
      return { variant: "ground_tag_out", activeChip: "タッチ死" };
    }
    if (rawText.includes("ゴロ本塁封殺") || rawText.includes("ゴロ本塁憤死")) {
      return { variant: "ground_force_home", activeChip: "本封ゴロ" };
    }
    if (rawText.includes("ゴロ二塁封殺")) {
      return { variant: "ground_force_2b", activeChip: "二封ゴロ" };
    }
  }

  if (code === "flyout") {
    if (rawText.includes("インフィールドフライ")) {
      return { variant: "infield_fly", activeChip: "IFフライ" };
    }
    if (rawText.includes("浅いフライ") && !direction.endsWith("浅")) {
      return { variant: "fly_shallow", activeChip: "浅フライ" };
    }
    if (rawText.includes("深いフライ") && !direction.endsWith("深")) {
      return { variant: "fly_deep", activeChip: "深フライ" };
    }
  }

  if (code === "double_play") {
    if (rawText.includes("三振併殺")) {
      return { variant: "dp_strikeout_cs", activeChip: "三振併殺" };
    }
    if (rawText.includes("ライナー併殺")) {
      return { variant: "dp_liner", activeChip: "直併殺" };
    }
    if (rawText.includes("フライ併殺")) {
      return { variant: "dp_fly_tag", activeChip: "飛併殺" };
    }
  }

  if (code === "sac_bunt") {
    if (rawText.includes("セーフティスクイズ")) {
      return { variant: "safety_squeeze", activeChip: "Sスクイズ" };
    }
    if (rawText.includes("スクイズ失敗")) {
      return { variant: "squeeze_fail_out", activeChip: "スクイズ死" };
    }
    if (rawText.includes("スクイズ")) {
      return { variant: "squeeze_score", activeChip: "スクイズ" };
    }
    if (rawText.includes("バント失敗封殺")) {
      return { variant: "bunt_fc_out", activeChip: "バント封殺" };
    }
    if (rawText.includes("バント飛球")) {
      return { variant: "bunt_popup_out", activeChip: "バント飛" };
    }
  }

  if (code === "infield_hit") {
    if (rawText.includes("セーフティバント安打")) {
      return { variant: "safety_bunt_hit", activeChip: "セーフティ" };
    }
    if (rawText.includes("バント安打")) {
      return { variant: "bunt_hit", activeChip: "バント安" };
    }
    if (rawText.includes("ボテボテ")) {
      return { variant: "infield_botebote", activeChip: "ボテ安打" };
    }
    if (rawText.includes("強襲") && !direction.endsWith("強襲")) {
      return { variant: "hit_hard", activeChip: "強襲内安" };
    }
  }

  if (code === "front_hit" || code === "hit") {
    if (rawText.includes("ポテン") && !direction.endsWith("浅")) {
      return { variant: "hit_poten", activeChip: "ポテンH" };
    }
    if (rawText.includes("クリーン")) {
      return { variant: "hit_clean", activeChip: "クリーンH" };
    }
    if (rawText.includes("ライナー")) {
      return { variant: "hit_liner", activeChip: "ライナーH" };
    }
    if (
      code === "hit" &&
      (rawText.includes("ライン際") ||
        (!direction.endsWith("線") && /^[左右一三]線/.test(rawText)))
    ) {
      return { variant: "hit_line", activeChip: "線ヒット" };
    }
    if (
      code === "hit" &&
      rawText.includes("強襲") &&
      !direction.endsWith("強襲")
    ) {
      return { variant: "hit_hard", activeChip: "強襲H" };
    }
    if (
      code === "hit" &&
      !direction.endsWith("前") &&
      /^[投捕一二三遊左右中]前/.test(rawText)
    ) {
      return { variant: "hit_front", activeChip: "前ヒット" };
    }
  }

  if (code === "double") {
    if (rawText.includes("エンタイトル二塁打")) {
      return { variant: "entitle_double", activeChip: "エンタイトル" };
    }
    if (rawText.includes("ポテン") && !direction.endsWith("浅")) {
      return { variant: "hit_poten", activeChip: "ポテン二" };
    }
    if (rawText.includes("破る") && !direction.endsWith("破る")) {
      return { variant: "hit_gap", activeChip: "間二塁打" };
    }
    if (
      rawText.includes("ライン際") ||
      (!direction.endsWith("線") && /^[左右一三]線/.test(rawText))
    ) {
      return { variant: "hit_line", activeChip: "線二塁打" };
    }
  }

  if (code === "triple") {
    if (rawText.includes("破る") && !direction.endsWith("破る")) {
      return { variant: "hit_gap", activeChip: "間三塁打" };
    }
    if (
      rawText.includes("ライン際") ||
      (!direction.endsWith("線") && /^[左右一三]線/.test(rawText))
    ) {
      return { variant: "hit_line", activeChip: "線三塁打" };
    }
  }

  if (code === "homerun") {
    if (rawText.includes("ランニング本塁打")) {
      return { variant: "inside_park_hr", activeChip: "走本塁打" };
    }
    if (
      rawText.includes("ポール際") ||
      (!direction.endsWith("線") && /^[左右]線/.test(rawText))
    ) {
      return { variant: "hit_line", activeChip: "線本塁打" };
    }
  }

  if (code === "error") {
    if (rawText.includes("捕球エラー")) {
      return { variant: "error_catch", activeChip: "捕球E" };
    }
    if (rawText.includes("悪送球エラー")) {
      return { variant: "error_throw", activeChip: "悪送球E" };
    }
    if (rawText.includes("落球エラー")) {
      return { variant: "error_drop", activeChip: "落球E" };
    }
    if (rawText.includes("後逸エラー")) {
      return { variant: "error_pass_2b", activeChip: "後逸2塁" };
    }
  }

  if (code === "fc") {
    if (rawText.includes("本塁野選")) {
      return { variant: "fc_home_safe", activeChip: "本塁野選" };
    }
    if (rawText.includes("バント野選")) {
      return { variant: "fc_bunt_safe", activeChip: "バント野選" };
    }
  }

  return { variant: null, activeChip: null };
}

function inferBattedCodeFromEntry(entry: LiveReportPlayEntry): BattedOutcomeCode | null {
  const rc = (entry.resultCode || "").trim();
  const rawText = (entry.playText || "").trim();

  if (VALID_BATTED_CODES.has(rc as BattedOutcomeCode)) {
    return rc as BattedOutcomeCode;
  }
  if (rc === "single") {
    if (rawText.includes("内野安打") || rawText.includes("バント安打")) {
      return "infield_hit";
    }
    return rawText.includes("前") ? "front_hit" : "hit";
  }
  if (rc === "home_run") {
    return rawText.includes("ランニング") ? "rh_homerun" : "homerun";
  }
  if (rc === "lineout") return "liner";
  if (rc === "infield_fly") return "flyout";

  if (!rawText) return null;
  if (rawText.includes("ランニング本塁打")) return "rh_homerun";
  if (rawText.includes("本塁打")) return "homerun";
  if (rawText.includes("三塁打")) return "triple";
  if (rawText.includes("二塁打")) return "double";
  if (rawText.includes("内野安打") || rawText.includes("バント安打")) {
    return "infield_hit";
  }
  if (rawText.includes("ヒット") || rawText.includes("安打")) {
    return /^[投捕一二三遊左右中]前/.test(rawText) ||
      rawText.includes("ポテン") ||
      rawText.includes("クリーン")
      ? "front_hit"
      : "hit";
  }
  if (
    rawText.includes("送りバント") ||
    rawText.includes("スクイズ") ||
    rawText.includes("バント失敗") ||
    rawText.includes("バント飛球") ||
    rawText.includes("バントゴロ") ||
    rawText.includes("犠打")
  ) {
    return "sac_bunt";
  }
  if (rawText.includes("犠飛")) return "sac_fly";
  if (rawText.includes("併殺")) return "double_play";
  if (rawText.includes("邪飛") || rawText.endsWith("邪飛")) return "foul_fly";
  if (rawText.includes("ライナー")) return "liner";
  if (rawText.includes("フライ")) return "flyout";
  if (rawText.includes("エラー") || rawText.includes("失策")) return "error";
  if (rawText.includes("野選")) return "fc";
  if (rawText.includes("強襲ゴロ")) return "hard_groundout";
  if (rawText.includes("ゴロ")) return "groundout";

  return null;
}

/**
 * 記録済み打席データから入力パッドの選択状態（方向・打撃結果・フリック詳細・進塁候補インデックス・カスタム差分）を逆推論する。
 */
export function inferPadSelectionFromPlayEntry(
  entry: LiveReportPlayEntry,
  outsBefore: number,
  runnersBefore: ReadonlyArray<LiveReportBaseNum>
): InferredPadSelection {
  const startOuts = outsBefore >= 3 ? 0 : Math.max(0, Math.min(2, outsBefore));
  const normRunnersBefore = normalizeRunnersList(runnersBefore);
  const rawText = (entry.playText || "").trim();
  const entryOutsAfter = Math.max(0, Math.min(3, entry.outsAfter));
  const entryRunnersAfter =
    entryOutsAfter >= 3 ? [] : normalizeRunnersList(entry.runnersAfter);
  const chainedRunsSum = (entry.chainedPlays || []).reduce(
    (s, cp) => s + (cp.runsScored || 0),
    0
  );
  const atBatRuns = Math.max(0, (entry.runsScored || 0) - chainedRunsSum);

  // 1. 三振・四死球系
  const directMatch = inferDirectFromEntry(entry, startOuts);
  if (directMatch) {
    const sim = simulateDirectOutcome(
      directMatch.code,
      startOuts,
      normRunnersBefore,
      directMatch.variant
    );
    return {
      direction: "",
      directionAnchor: "",
      directCode: directMatch.code,
      directVariant: directMatch.variant,
      directActiveChip: directMatch.activeChip,
      battedCode: null,
      battedVariant: null,
      battedActiveChip: null,
      candidateIdx: 0,
      matchedCandidateId: sim.id,
      customPlayText: sim.playText === rawText ? null : rawText,
      customOutsAfter: sim.outsAfter === entryOutsAfter ? null : entryOutsAfter,
      customRunnersAfter: sameRunnersList(sim.runnersAfter, entryRunnersAfter)
        ? null
        : entryRunnersAfter,
      customRunsScored: sim.runsScored === atBatRuns ? null : atBatRuns,
    };
  }

  // 2. 打球方向 ＋ 打撃結果系
  let direction = (entry.battedDirection || "").trim();
  if (POS_NUM_TO_PAD_DIRECTION[direction]) {
    direction = POS_NUM_TO_PAD_DIRECTION[direction]!;
  }
  if (!direction) {
    direction = extractDirectionFromPlayText(rawText);
  }
  const directionAnchor = resolvePadDirectionAnchor(direction);

  const battedCode = inferBattedCodeFromEntry(entry);
  if (battedCode) {
    const { variant: inferredVar, activeChip: inferredChip } =
      inferBattedVariantAndChip(battedCode, rawText, direction);

    const variantTrials: Array<{
      variant: BattedPlayVariant | null;
      chip: string | null;
    }> =
      inferredVar !== null
        ? [
            { variant: inferredVar, chip: inferredChip },
            { variant: null, chip: null },
          ]
        : [{ variant: null, chip: null }];

    for (const trial of variantTrials) {
      const cands = buildBattedPlayCandidates(
        direction,
        battedCode,
        startOuts,
        normRunnersBefore,
        trial.variant
      );
      const exactIdx = cands.findIndex(
        (c) =>
          c.playText === rawText &&
          c.outsAfter === entryOutsAfter &&
          sameRunnersList(c.runnersAfter, entryRunnersAfter) &&
          c.runsScored === atBatRuns
      );
      if (exactIdx >= 0) {
        const matched = cands[exactIdx]!;
        return {
          direction,
          directionAnchor,
          directCode: null,
          directVariant: null,
          directActiveChip: null,
          battedCode,
          battedVariant: trial.variant,
          battedActiveChip: trial.chip,
          candidateIdx: exactIdx,
          matchedCandidateId: matched.id,
          customPlayText: null,
          customOutsAfter: null,
          customRunnersAfter: null,
          customRunsScored: null,
        };
      }
    }

    // 完全一致候補がない場合（テキスト微調整済み等）は最も近い進塁候補を選びつつ差分をカスタム値で保持
    const baseCands = buildBattedPlayCandidates(
      direction,
      battedCode,
      startOuts,
      normRunnersBefore,
      inferredVar
    );
    const stateMatchIdx = baseCands.findIndex(
      (c) =>
        c.outsAfter === entryOutsAfter &&
        sameRunnersList(c.runnersAfter, entryRunnersAfter) &&
        c.runsScored === atBatRuns
    );
    const chosenIdx = stateMatchIdx >= 0 ? stateMatchIdx : 0;
    const chosen = baseCands[chosenIdx] ?? null;

    return {
      direction,
      directionAnchor,
      directCode: null,
      directVariant: null,
      directActiveChip: null,
      battedCode,
      battedVariant: inferredVar,
      battedActiveChip: inferredChip,
      candidateIdx: chosenIdx,
      matchedCandidateId: chosen?.id ?? null,
      customPlayText:
        chosen && chosen.playText === rawText ? null : rawText || null,
      customOutsAfter:
        chosen && chosen.outsAfter === entryOutsAfter ? null : entryOutsAfter,
      customRunnersAfter:
        chosen && sameRunnersList(chosen.runnersAfter, entryRunnersAfter)
          ? null
          : entryRunnersAfter,
      customRunsScored:
        chosen && chosen.runsScored === atBatRuns ? null : atBatRuns,
    };
  }

  // 3. 未分類の自由入力テキスト行
  return {
    direction,
    directionAnchor,
    directCode: null,
    directVariant: null,
    directActiveChip: null,
    battedCode: null,
    battedVariant: null,
    battedActiveChip: null,
    candidateIdx: 0,
    matchedCandidateId: null,
    customPlayText: rawText || null,
    customOutsAfter: entryOutsAfter,
    customRunnersAfter: entryRunnersAfter,
    customRunsScored: atBatRuns,
  };
}

/**
 * ハーフイニング内の指定した記録行（targetEntryId）を新しい打席記録で置換し、
 * 前段の状況変化がある場合は後続の打席記録のアウト・走者・得点を安全に自動再計算して整合させる。
 */
export function replaceHalfInningPlayEntry(
  half: LiveReportHalfInning,
  targetEntryId: string,
  updatedEntry: LiveReportPlayEntry,
  options?: {
    clearManualRuns?: boolean;
    cascadeSubsequent?: boolean;
  }
): LiveReportHalfInning {
  const targetIdx = half.entries.findIndex((e) => e.id === targetEntryId);
  if (targetIdx < 0) return half;

  const cascadeSubsequent = options?.cascadeSubsequent ?? true;

  // 変更前の各行の「直前状況」を記録しておく
  const origSituationsBefore: Array<{
    outs: number;
    runners: LiveReportBaseNum[];
  }> = [];
  for (let i = 0; i < half.entries.length; i++) {
    const situ =
      i === 0
        ? { outs: 0, runners: [] as LiveReportBaseNum[] }
        : computeHalfInningSituation({
            inning: half.inning,
            isBottom: half.isBottom,
            entries: half.entries.slice(0, i),
            manualRunsOverride: null,
            manualOutsOverride: null,
            manualRunnersOverride: null,
          });
    origSituationsBefore.push({
      outs: situ.outs,
      runners: situ.runners,
    });
  }

  const clampedTargetOuts = Math.max(0, Math.min(3, updatedEntry.outsAfter));
  const clampedTargetRunners =
    clampedTargetOuts >= 3
      ? []
      : normalizeRunnersList(updatedEntry.runnersAfter);
  const validTargetChains =
    clampedTargetOuts >= 3 || clampedTargetRunners.length === 0
      ? []
      : updatedEntry.chainedPlays.map((cp) => {
          const cpOuts = Math.max(0, Math.min(3, cp.outsAfter));
          return {
            ...cp,
            outsAfter: cpOuts,
            runnersAfter:
              cpOuts >= 3 ? [] : normalizeRunnersList(cp.runnersAfter),
          };
        });
  const targetChainedRuns = validTargetChains.reduce(
    (s, cp) => s + (cp.runsScored || 0),
    0
  );
  const baseAtBatRuns =
    typeof updatedEntry.rbi === "number"
      ? Math.max(0, updatedEntry.rbi)
      : Math.max(
          0,
          updatedEntry.runsScored -
            updatedEntry.chainedPlays.reduce(
              (s, cp) => s + (cp.runsScored || 0),
              0
            )
        );
  const resolvedTargetRuns =
    validTargetChains.length > 0
      ? baseAtBatRuns + targetChainedRuns
      : updatedEntry.chainedPlays.length > 0
      ? baseAtBatRuns
      : Math.max(0, updatedEntry.runsScored);

  const normalizedTarget: LiveReportPlayEntry = {
    ...updatedEntry,
    outsAfter: clampedTargetOuts,
    runnersAfter: clampedTargetRunners,
    runsScored: resolvedTargetRuns,
    rbi: baseAtBatRuns > 0 ? baseAtBatRuns : undefined,
    chainedPlays: validTargetChains,
  };

  const nextEntries: LiveReportPlayEntry[] = [...half.entries];
  nextEntries[targetIdx] = normalizedTarget;

  if (cascadeSubsequent && targetIdx < nextEntries.length - 1) {
    let curSitu = computeHalfInningSituation({
      inning: half.inning,
      isBottom: half.isBottom,
      entries: nextEntries.slice(0, targetIdx + 1),
      manualRunsOverride: null,
      manualOutsOverride: null,
      manualRunnersOverride: null,
    });

    for (let k = targetIdx + 1; k < nextEntries.length; k++) {
      const ent = nextEntries[k]!;
      const origBefore = origSituationsBefore[k]!;

      if (
        curSitu.outs === origBefore.outs &&
        sameRunnersList(curSitu.runners, origBefore.runners)
      ) {
        curSitu = computeHalfInningSituation({
          inning: half.inning,
          isBottom: half.isBottom,
          entries: nextEntries.slice(0, k + 1),
          manualRunsOverride: null,
          manualOutsOverride: null,
          manualRunnersOverride: null,
        });
        continue;
      }

      if (ent.entryType === "batter") {
        if (curSitu.outs >= 3) {
          nextEntries[k] = {
            ...ent,
            outsAfter: 3,
            runnersAfter: [],
            chainedPlays: [],
          };
        } else {
          const origInf = inferPadSelectionFromPlayEntry(
            ent,
            origBefore.outs,
            origBefore.runners
          );

          if (
            (origInf.directCode !== null || origInf.battedCode !== null) &&
            origInf.customPlayText === null
          ) {
            const cands = origInf.directCode
              ? [
                  simulateDirectOutcome(
                    origInf.directCode,
                    curSitu.outs,
                    curSitu.runners,
                    origInf.directVariant
                  ),
                ]
              : buildBattedPlayCandidates(
                  origInf.direction,
                  origInf.battedCode!,
                  curSitu.outs,
                  curSitu.runners,
                  origInf.battedVariant
                );

            const matchedById = origInf.matchedCandidateId
              ? cands.find((c) => c.id === origInf.matchedCandidateId)
              : undefined;
            const simCand = matchedById ?? cands[0];

            if (simCand) {
              let nextChains: LiveReportChainedPlay[] = [];
              if (
                ent.chainedPlays.length > 0 &&
                simCand.outsAfter < 3 &&
                sameRunnersList(ent.runnersAfter, simCand.runnersAfter)
              ) {
                const outDelta = simCand.outsAfter - ent.outsAfter;
                for (const cp of ent.chainedPlays) {
                  const cpOuts = Math.max(
                    0,
                    Math.min(3, cp.outsAfter + outDelta)
                  );
                  nextChains.push({
                    ...cp,
                    outsAfter: cpOuts,
                    runnersAfter:
                      cpOuts >= 3 ? [] : normalizeRunnersList(cp.runnersAfter),
                  });
                  if (cpOuts >= 3) break;
                }
              }
              const chainRuns = nextChains.reduce(
                (s, cp) => s + (cp.runsScored || 0),
                0
              );
              nextEntries[k] = {
                ...ent,
                playText: simCand.playText,
                outsAfter: simCand.outsAfter,
                runnersAfter:
                  simCand.outsAfter >= 3 ? [] : simCand.runnersAfter,
                runsScored: simCand.runsScored + chainRuns,
                rbi: simCand.runsScored > 0 ? simCand.runsScored : undefined,
                chainedPlays: nextChains,
              };
            }
          } else {
            const origStartOuts =
              origBefore.outs >= 3 ? 0 : Math.max(0, origBefore.outs);
            const outStep = Math.max(0, ent.outsAfter - origStartOuts);
            const nextOuts = Math.min(3, curSitu.outs + outStep);
            nextEntries[k] = {
              ...ent,
              outsAfter: nextOuts,
              runnersAfter:
                nextOuts >= 3 ? [] : normalizeRunnersList(ent.runnersAfter),
              chainedPlays: nextOuts >= 3 ? [] : ent.chainedPlays,
            };
          }
        }
      }

      curSitu = computeHalfInningSituation({
        inning: half.inning,
        isBottom: half.isBottom,
        entries: nextEntries.slice(0, k + 1),
        manualRunsOverride: null,
        manualOutsOverride: null,
        manualRunnersOverride: null,
      });
    }
  }

  const isLastEntry = targetIdx === half.entries.length - 1;

  return {
    ...half,
    entries: nextEntries,
    manualRunsOverride: options?.clearManualRuns
      ? null
      : reconcileHalfInningManualRuns(half, nextEntries, "edit_entry"),
    ...(isLastEntry || cascadeSubsequent
      ? { manualOutsOverride: null, manualRunnersOverride: null }
      : {}),
  };
}



