// filepath: src/lib/liff/match-day-ops.ts

import type {
  MatchCarpoolMode,
  MatchDayOps,
  MatchMealOption,
  MatchStaffRoleAssignment,
} from "@/types/match";

export interface MatchStaffRolePreset {
  roleKey: string;
  roleLabel: string;
  shortHint: string;
  notePlaceholder: string;
}

export const DEFAULT_MATCH_STAFF_ROLES: readonly MatchStaffRolePreset[] = [
  {
    roleKey: "umpire",
    roleLabel: "審判",
    shortHint: "球審・塁審（当日割振）",
    notePlaceholder: "例: 審判服・防具持参（球審/塁審は当日決定）",
  },
  {
    roleKey: "scorer",
    roleLabel: "スコアラー",
    shortHint: "公式・自チーム記録",
    notePlaceholder: "例: 本部席1名・ベンチ1名",
  },
  {
    roleKey: "bso_board",
    roleLabel: "BSO・得点板",
    shortHint: "カウント・得点掲示",
    notePlaceholder: "例: BSO操作・得点めくり",
  },
  {
    roleKey: "line_live",
    roleLabel: "LINE速報",
    shortHint: "イニング速報係",
    notePlaceholder: "例: グループLINE実況",
  },
  {
    roleKey: "buzzer",
    roleLabel: "ブザー",
    shortHint: "本部・放送室ブザー係",
    notePlaceholder: "例: 本部席・放送室ブザー操作",
  },
  {
    roleKey: "video_camera",
    roleLabel: "動画撮影",
    shortHint: "YouTube用カメラ",
    notePlaceholder: "例: バックネット裏三脚・モバイルバッテリー",
  },
  {
    roleKey: "announcer_duty",
    roleLabel: "アナウンス・当番",
    shortHint: "放送・お茶/救護当番",
    notePlaceholder: "例: 放送室・氷/ジャグ準備",
  },
] as const;

export interface MealOptionMeta {
  value: MatchMealOption;
  label: string;
  shortLabel: string;
}

export const MEAL_OPTION_ITEMS: readonly MealOptionMeta[] = [
  { value: "none", label: "未設定（日程設定に連動）", shortLabel: "未設定" },
  {
    value: "lunch_and_snack",
    label: "弁当 ＋ 捕食（軽食）持参",
    shortLabel: "弁当＋捕食持参",
  },
  { value: "lunch_only", label: "弁当持参", shortLabel: "弁当持参" },
  { value: "snack_only", label: "捕食（おにぎり等）のみ", shortLabel: "捕食のみ持参" },
  { value: "no_meal", label: "昼食不要（半日）", shortLabel: "昼食不要" },
] as const;

export const UNIFORM_QUICK_PRESETS: readonly string[] = [
  "公式戦ユニフォーム",
  "セカンドユニフォーム",
  "練習試合ユニフォーム",
  "練習着（移動着）",
] as const;

export const GATHER_PLACE_QUICK_PRESETS: readonly string[] = [
  "現地集合",
  "本拠地集合・乗り合い出発",
] as const;

export interface LiffAdultMemberOption {
  id: string;
  name: string;
  memberType: string;
  role: string;
  isFatherOrStaff: boolean;
}

export interface LiffMyMatchIdentity {
  memberId: string | null;
  memberName: string | null;
  displayName: string | null;
  childNames: string[];
}

export interface LiffMatchScheduleCarpoolCar {
  carNumber: number;
  driverName: string;
  carModel: string;
  plate: string;
  capacity: number;
  isCargo: boolean;
  passengers: Array<{ name: string; type: "player" | "adult" }>;
}

export interface LiffMatchScheduleSyncInfo {
  eventId: string;
  title: string;
  dutyGroup: string | null;
  needsLunch: boolean;
  needsSnack: boolean;
  gatherTime: string | null;
  gatherLocation: string | null;
  destination: string | null;
  cars: LiffMatchScheduleCarpoolCar[];
}

export interface LiffMatchOpsContextResponse {
  success: boolean;
  isDemo?: boolean;
  adultMembers: LiffAdultMemberOption[];
  myIdentity: LiffMyMatchIdentity;
  scheduleSync: LiffMatchScheduleSyncInfo | null;
}

export const DEMO_SCHEDULED_MATCH_CARPOOL_SYNC: LiffMatchScheduleSyncInfo = {
  eventId: "demo-event-3",
  title: "秋季大会 2回戦 vs レッドソックス",
  dutyGroup: "B班（鈴木・佐藤・高橋）",
  needsLunch: true,
  needsSnack: true,
  gatherTime: "07:45",
  gatherLocation: "桜本小学校 正門前",
  destination: "多摩川緑地野球場 第1駐車場",
  cars: [
    {
      carNumber: 1,
      driverName: "鈴木 パパ",
      carModel: "セレナ (白)",
      plate: "・12-34",
      capacity: 6,
      isCargo: false,
      passengers: [
        { name: "鈴木 蓮 (選手)", type: "player" },
        { name: "高橋 陸 (選手)", type: "player" },
        { name: "田中 健太 (選手)", type: "player" },
        { name: "佐藤 ママ (保護者)", type: "adult" },
      ],
    },
    {
      carNumber: 2,
      driverName: "田中 パパ",
      carModel: "アルファード (黒)",
      plate: "・・88",
      capacity: 5,
      isCargo: false,
      passengers: [
        { name: "渡辺 陽向 (選手)", type: "player" },
        { name: "山本 大翔 (選手)", type: "player" },
        { name: "渡辺 パパ (指導者)", type: "adult" },
      ],
    },
    {
      carNumber: 3,
      driverName: "山下 監督",
      carModel: "ハイエース (道具車)",
      plate: "・56-78",
      capacity: 3,
      isCargo: true,
      passengers: [
        { name: "中村 颯 (選手)", type: "player" },
        { name: "小林 樹 (選手)", type: "player" },
      ],
    },
  ],
};

const VALID_MEAL_OPTIONS = new Set<MatchMealOption>([
  "none",
  "lunch_and_snack",
  "lunch_only",
  "snack_only",
  "no_meal",
]);

const VALID_CARPOOL_MODES = new Set<MatchCarpoolMode>([
  "auto",
  "away_carpool",
  "local_gather",
  "no_carpool",
  "none",
]);

const LEGACY_UMPIRE_ROLE_KEYS = new Set([
  "umpire",
  "plate_umpire",
  "base_umpire",
]);
const LEGACY_UMPIRE_ROLE_LABELS = new Set(["審判", "球審", "塁審"]);

const PRESET_ROLE_KEY_SET = new Set<string>([
  ...DEFAULT_MATCH_STAFF_ROLES.map((r) => r.roleKey),
  "plate_umpire",
  "base_umpire",
]);
const PRESET_ROLE_LABEL_SET = new Set<string>([
  ...DEFAULT_MATCH_STAFF_ROLES.map((r) => r.roleLabel),
  "球審",
  "塁審",
]);

function isUmpireStaffRole(roleKey: string, roleLabel: string): boolean {
  return (
    !roleKey.startsWith("custom_") &&
    (LEGACY_UMPIRE_ROLE_KEYS.has(roleKey) ||
      LEGACY_UMPIRE_ROLE_LABELS.has(roleLabel.trim()))
  );
}

export function isPresetStaffRole(roleKey: string, roleLabel: string): boolean {
  const cleanKey = (roleKey || "").trim();
  if (cleanKey.startsWith("custom_")) return false;
  if (PRESET_ROLE_KEY_SET.has(cleanKey)) return true;
  return PRESET_ROLE_LABEL_SET.has((roleLabel || "").trim());
}

/**
 * 既存の「球審」「塁審」個別データを「審判（umpire）」1枠へ自動統合する（後方互換対応）
 * ※固定プリセット枠は担当者またはメモがある場合のみ保持し、手動追加されたカスタム枠は未割当でも枠自体を保持する
 */
export function normalizeUnifiedStaffRoles(
  rawRoles: readonly MatchStaffRoleAssignment[] | undefined | null
): MatchStaffRoleAssignment[] {
  if (!rawRoles || rawRoles.length === 0) return [];

  const result: MatchStaffRoleAssignment[] = [];
  let mergedUmpireIndex = -1;
  const umpireAssignees: string[] = [];
  const umpireAssigneeSet = new Set<string>();
  const umpireNotes: string[] = [];
  const umpireNoteSet = new Set<string>();

  for (const item of rawRoles) {
    const cleanKey = (item.roleKey || "").trim();
    const cleanLabel = (item.roleLabel || "").trim();
    if (!cleanLabel) continue;

    const cleanAssignees = (item.assignees || [])
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
    const cleanNote = (item.note || "").trim();
    const isPreset = isPresetStaffRole(cleanKey, cleanLabel);

    if (isPreset && cleanAssignees.length === 0 && !cleanNote) continue;

    if (isUmpireStaffRole(cleanKey, cleanLabel)) {
      if (mergedUmpireIndex === -1) {
        mergedUmpireIndex = result.length;
        result.push({
          roleKey: "umpire",
          roleLabel: "審判",
          assignees: [],
        });
      }
      for (const person of cleanAssignees) {
        if (!umpireAssigneeSet.has(person)) {
          umpireAssigneeSet.add(person);
          umpireAssignees.push(person);
        }
      }
      if (cleanNote && !umpireNoteSet.has(cleanNote)) {
        umpireNoteSet.add(cleanNote);
        umpireNotes.push(cleanNote);
      }
    } else {
      result.push({
        roleKey: cleanKey || `custom_${result.length + 1}`,
        roleLabel: cleanLabel,
        assignees: cleanAssignees,
        note: cleanNote || undefined,
      });
    }
  }

  if (mergedUmpireIndex !== -1) {
    result[mergedUmpireIndex] = {
      roleKey: "umpire",
      roleLabel: "審判",
      assignees: umpireAssignees,
      note: umpireNotes.length > 0 ? umpireNotes.join(" / ") : undefined,
    };
  }

  return result;
}

export function parseMatchDayOpsJson(raw: unknown): MatchDayOps {
  if (!raw) return {};
  let obj: Record<string, unknown> | null = null;

  let candidate: unknown = raw;
  for (let depth = 0; depth < 2 && typeof candidate === "string"; depth++) {
    const trimmed = candidate.trim();
    if (!trimmed || trimmed === "{}" || trimmed === "null") return {};
    try {
      candidate = JSON.parse(trimmed) as unknown;
    } catch {
      return {};
    }
  }

  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    obj = candidate as Record<string, unknown>;
  }

  if (!obj) return {};

  const rawMeal = typeof obj.meal === "string" ? (obj.meal as MatchMealOption) : "none";
  const rawCarpoolMode =
    typeof obj.carpoolMode === "string"
      ? (obj.carpoolMode as MatchCarpoolMode)
      : "auto";

  const parsedStaffRoles: MatchStaffRoleAssignment[] = [];
  if (Array.isArray(obj.staffRoles)) {
    for (const item of obj.staffRoles) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const roleKey = typeof rec.roleKey === "string" ? rec.roleKey.trim() : "";
      const roleLabel =
        typeof rec.roleLabel === "string" ? rec.roleLabel.trim() : "";
      const assignees = Array.isArray(rec.assignees)
        ? rec.assignees
            .map((a) => (typeof a === "string" ? a.trim() : ""))
            .filter((a) => a.length > 0)
        : typeof rec.assignees === "string"
        ? rec.assignees
            .split(/[/／、,，]+/)
            .map((a) => a.trim())
            .filter((a) => a.length > 0)
        : [];
      const note = typeof rec.note === "string" ? rec.note.trim() : "";
      const isPreset = isPresetStaffRole(roleKey, roleLabel);
      if (roleLabel && (!isPreset || assignees.length > 0 || note.length > 0)) {
        parsedStaffRoles.push({
          roleKey: roleKey || `custom_${parsedStaffRoles.length + 1}`,
          roleLabel,
          assignees,
          note: note || undefined,
        });
      }
    }
  }
  const staffRoles = normalizeUnifiedStaffRoles(parsedStaffRoles);

  const str = (v: unknown): string | undefined => {
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    return t.length > 0 ? t : undefined;
  };

  return {
    gatherTime: str(obj.gatherTime),
    gatherPlace: str(obj.gatherPlace),
    uniform: str(obj.uniform),
    meal: VALID_MEAL_OPTIONS.has(rawMeal) ? rawMeal : "none",
    mealNote: str(obj.mealNote),
    belongingsNote: str(obj.belongingsNote),
    carpoolMode: VALID_CARPOOL_MODES.has(rawCarpoolMode) ? rawCarpoolMode : "auto",
    linkedEventId:
      typeof obj.linkedEventId === "string" && obj.linkedEventId.trim()
        ? obj.linkedEventId.trim()
        : null,
    carLimitNote: str(obj.carLimitNote),
    cargoCarMember: str(obj.cargoCarMember),
    carpoolSummaryNote: str(obj.carpoolSummaryNote),
    staffRoles: staffRoles.length > 0 ? staffRoles : undefined,
  };
}

const ROLE_PRESET_ORDER_BY_KEY = new Map<string, number>(
  DEFAULT_MATCH_STAFF_ROLES.map((r, idx) => [r.roleKey, idx])
);
const ROLE_PRESET_ORDER_BY_LABEL = new Map<string, number>(
  DEFAULT_MATCH_STAFF_ROLES.map((r, idx) => [r.roleLabel, idx])
);

export interface ResolvedMatchStaffRoleRow {
  roleKey: string;
  roleLabel: string;
  shortHint: string;
  assignees: string[];
  note?: string;
  isCustom: boolean;
  isAssigned: boolean;
}

export interface SplitMatchStaffRolesResult {
  presetRoles: ResolvedMatchStaffRoleRow[];
  customRoles: ResolvedMatchStaffRoleRow[];
  assignedPresetCount: number;
  assignedCustomCount: number;
  assignedTotalCount: number;
}

/**
 * 固定プリセット役割（全7枠常時）と、手動追加されたカスタム役割を分離して返す
 */
export function splitPresetAndCustomStaffRoles(
  ops: MatchDayOps | null | undefined
): SplitMatchStaffRolesResult {
  const normalized = normalizeUnifiedStaffRoles(ops?.staffRoles);
  const consumedIndices = new Set<number>();

  const presetRoles: ResolvedMatchStaffRoleRow[] = DEFAULT_MATCH_STAFF_ROLES.map(
    (preset) => {
      const matchIdx = normalized.findIndex((item, idx) => {
        if (consumedIndices.has(idx)) return false;
        if (item.roleKey.startsWith("custom_")) return false;
        return (
          item.roleKey === preset.roleKey ||
          item.roleLabel.trim() === preset.roleLabel
        );
      });

      const saved = matchIdx >= 0 ? normalized[matchIdx] : undefined;
      if (matchIdx >= 0) {
        consumedIndices.add(matchIdx);
      }

      const assignees = saved ? [...saved.assignees] : [];
      const note = saved?.note?.trim() || undefined;
      return {
        roleKey: preset.roleKey,
        roleLabel: preset.roleLabel,
        shortHint: preset.shortHint,
        assignees,
        note,
        isCustom: false,
        isAssigned: assignees.length > 0 || Boolean(note),
      };
    }
  );

  const customRoles: ResolvedMatchStaffRoleRow[] = [];
  normalized.forEach((item, idx) => {
    if (consumedIndices.has(idx)) return;
    const cleanLabel = item.roleLabel.trim();
    if (!cleanLabel) return;
    const assignees = [...item.assignees];
    const note = item.note?.trim() || undefined;
    customRoles.push({
      roleKey: item.roleKey || `custom_${idx + 1}`,
      roleLabel: cleanLabel,
      shortHint: "追加役割",
      assignees,
      note,
      isCustom: true,
      isAssigned: assignees.length > 0 || Boolean(note),
    });
  });

  const assignedPresetCount = presetRoles.filter((r) => r.isAssigned).length;
  const assignedCustomCount = customRoles.filter((r) => r.isAssigned).length;

  return {
    presetRoles,
    customRoles,
    assignedPresetCount,
    assignedCustomCount,
    assignedTotalCount: assignedPresetCount + assignedCustomCount,
  };
}

export function getFilledStaffRoles(
  ops: MatchDayOps | null | undefined
): MatchStaffRoleAssignment[] {
  if (!ops?.staffRoles) return [];
  return normalizeUnifiedStaffRoles(ops.staffRoles)
    .filter((r) => {
      const cleanLabel = r.roleLabel.trim();
      if (!cleanLabel) return false;
      if (!isPresetStaffRole(r.roleKey, cleanLabel)) {
        return true;
      }
      return r.assignees.length > 0 || Boolean(r.note?.trim());
    })
    .map((r, originalIdx) => {
      const isCustom = r.roleKey.startsWith("custom_");
      const rank = isCustom
        ? 1000 + originalIdx
        : (ROLE_PRESET_ORDER_BY_KEY.get(r.roleKey) ??
          ROLE_PRESET_ORDER_BY_LABEL.get(r.roleLabel.trim()) ??
          1000 + originalIdx);
      return { role: r, rank };
    })
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.role);
}

export function resolveEffectiveMealLabel(
  ops: MatchDayOps | null | undefined,
  scheduleSync: LiffMatchScheduleSyncInfo | null | undefined
): string {
  const meal = ops?.meal || "none";
  if (meal !== "none") {
    const found = MEAL_OPTION_ITEMS.find((m) => m.value === meal);
    return found ? found.shortLabel : "";
  }
  if (scheduleSync) {
    if (scheduleSync.needsLunch && scheduleSync.needsSnack) return "弁当＋捕食持参";
    if (scheduleSync.needsLunch) return "弁当持参";
    if (scheduleSync.needsSnack) return "捕食のみ持参";
  }
  return "";
}

export function hasAnyGuidebookContent(
  ops: MatchDayOps | null | undefined,
  scheduleSync: LiffMatchScheduleSyncInfo | null | undefined
): boolean {
  const filledRoles = getFilledStaffRoles(ops);
  if (filledRoles.length > 0) return true;
  if (ops?.gatherTime || ops?.gatherPlace || ops?.uniform || ops?.mealNote || ops?.belongingsNote) {
    return true;
  }
  if (resolveEffectiveMealLabel(ops, scheduleSync)) return true;
  if (scheduleSync?.dutyGroup) return true;
  return false;
}

function normalizeNameToken(raw: string | null | undefined): string {
  return (raw || "")
    .replace(/[\s　()（）【】［］\[\]]+/g, "")
    .replace(/(?:さん|様|コーチ|監督|代表)$/g, "")
    .trim();
}

function isFatherTag(raw: string): boolean {
  return /(?:父|パパ|お父さん|夫)/.test(raw);
}

function isMotherTag(raw: string): boolean {
  return /(?:母|ママ|お母さん|妻)/.test(raw);
}

export function isAssigneeMatchingIdentity(
  assigneeRaw: string,
  identity: LiffMyMatchIdentity | null | undefined
): boolean {
  if (!identity) return false;
  const normTarget = normalizeNameToken(assigneeRaw);
  if (!normTarget || normTarget.length < 2) return false;

  const candidates = [identity.memberName, identity.displayName].filter(
    (v): v is string => Boolean(v && v.trim())
  );

  for (const cand of candidates) {
    const normCand = normalizeNameToken(cand);
    if (!normCand || normCand.length < 2) continue;
    if (isFatherTag(cand) && isMotherTag(assigneeRaw)) continue;
    if (isMotherTag(cand) && isFatherTag(assigneeRaw)) continue;
    if (normTarget === normCand) return true;
    if (normTarget.includes(normCand) || normCand.includes(normTarget)) {
      return true;
    }
  }
  return false;
}

export function findMyAssignedStaffRoles(
  ops: MatchDayOps | null | undefined,
  identity: LiffMyMatchIdentity | null | undefined
): MatchStaffRoleAssignment[] {
  const filled = getFilledStaffRoles(ops);
  if (!identity || filled.length === 0) return [];
  return filled.filter((role) =>
    role.assignees.some((person) => isAssigneeMatchingIdentity(person, identity))
  );
}

export interface MyFamilyCarMatch {
  carNumber: number;
  driverName: string;
  isDriver: boolean;
  matchedName: string;
}

export function findMyFamilyCarpoolMatches(
  cars: LiffMatchScheduleCarpoolCar[],
  identity: LiffMyMatchIdentity | null | undefined
): MyFamilyCarMatch[] {
  if (!identity || cars.length === 0) return [];
  const results: MyFamilyCarMatch[] = [];

  const childNorms = (identity.childNames || [])
    .map((c) => normalizeNameToken(c))
    .filter((c) => c.length >= 2);

  for (const car of cars) {
    if (isAssigneeMatchingIdentity(car.driverName, identity)) {
      results.push({
        carNumber: car.carNumber,
        driverName: car.driverName,
        isDriver: true,
        matchedName: car.driverName,
      });
      continue;
    }

    let matchedPassenger: string | null = null;
    for (const p of car.passengers) {
      const cleanPassenger = p.name.replace(/\s*\((?:選手|保護者|指導者)\)\s*$/g, "").trim();
      if (isAssigneeMatchingIdentity(cleanPassenger, identity)) {
        matchedPassenger = cleanPassenger;
        break;
      }
      const normP = normalizeNameToken(cleanPassenger);
      if (normP && childNorms.some((cn) => normP === cn || normP.includes(cn))) {
        matchedPassenger = cleanPassenger;
        break;
      }
    }

    if (matchedPassenger) {
      results.push({
        carNumber: car.carNumber,
        driverName: car.driverName,
        isDriver: false,
        matchedName: matchedPassenger,
      });
    }
  }

  return results;
}

export interface BuildPreMatchShareParams {
  opponent: string;
  dateText: string;
  matchTypeLabel: string;
  inningsLabel: string;
  battingOrderLabel: string;
  benchSideLabel?: string;
  tournamentName?: string;
  venueOfficialName?: string;
  venueAddress?: string;
  venueExternalMapUrl?: string;
  venueParkingInfo?: string | null;
  venueSpikeRule?: string | null;
  venueNotes?: string | null;
  ops?: MatchDayOps | null;
  scheduleSync?: LiffMatchScheduleSyncInfo | null;
  lineupShareBlock?: string;
}

/**
 * 📲 前日・当日連絡用のLINEグループ共有テキストを自動整形
 */
export function buildPreMatchAnnouncementShareText(
  params: BuildPreMatchShareParams
): string {
  const lines: string[] = [];
  lines.push(`【試合連絡】vs ${params.opponent}`);
  lines.push(`📅 ${params.dateText}`);

  const metaParts = [
    params.matchTypeLabel,
    params.inningsLabel,
    params.battingOrderLabel,
  ];
  if (params.benchSideLabel) metaParts.push(params.benchSideLabel);
  lines.push(`🏷️ ${metaParts.join(" • ")}`);

  if (params.tournamentName) {
    lines.push(`🏆 ${params.tournamentName}`);
  }

  const ops = params.ops || {};
  const sync = params.scheduleSync || null;

  // 1. 集合・ユニフォーム・昼食・連絡メモ
  const guideLines: string[] = [];
  const gatherTime = ops.gatherTime || sync?.gatherTime || "";
  const gatherPlace = ops.gatherPlace || sync?.gatherLocation || "";
  if (gatherTime || gatherPlace) {
    guideLines.push(
      `⏰ 集合: ${[gatherTime, gatherPlace].filter(Boolean).join(" ＠ ")}`
    );
  }
  if (ops.uniform) {
    guideLines.push(`👕 服装: ${ops.uniform}`);
  }
  const mealLabel = resolveEffectiveMealLabel(ops, sync);
  if (mealLabel || ops.mealNote) {
    guideLines.push(
      `🍙 昼食: ${[mealLabel, ops.mealNote].filter(Boolean).join("（")}${
        mealLabel && ops.mealNote ? "）" : ""
      }`
    );
  }
  if (sync?.dutyGroup) {
    guideLines.push(`🏷️ 当番班: ${sync.dutyGroup}`);
  }
  if (ops.belongingsNote) {
    guideLines.push(`📌 連絡: ${ops.belongingsNote}`);
  }

  if (guideLines.length > 0) {
    lines.push("");
    lines.push("━━ 当日の集合・持ち物 ━━");
    lines.push(...guideLines);
  }

  // 2. お父さん・保護者の役割担当
  const filledRoles = getFilledStaffRoles(ops);
  if (filledRoles.length > 0) {
    lines.push("");
    lines.push("━━ 当日の役割担当 ━━");
    for (const r of filledRoles) {
      const who = r.assignees.length > 0 ? r.assignees.join("・") : "調整中";
      const notePart = r.note ? `（${r.note}）` : "";
      lines.push(`・${r.roleLabel}: ${who}${notePart}`);
    }
  }

  // 3. 配車・駐車場・スパイク規定
  const carLines: string[] = [];
  if (ops.carpoolMode === "no_carpool") {
    carLines.push("🚫 配車: 配車なし（各自での移動・集合をお願いします）");
  } else if (ops.carpoolMode === "local_gather") {
    carLines.push("🚙 移動: 現地集合（各自移動）");
  } else if (ops.carpoolMode !== "none") {
    if (sync && sync.cars.length > 0) {
      const totalRiders = sync.cars.reduce((s, c) => s + c.passengers.length, 0);
      carLines.push(
        `🚗 配車: 計${sync.cars.length}台（乗車${totalRiders}名・アプリ内「配車表」参照）`
      );
    } else if (ops.carpoolMode === "away_carpool") {
      carLines.push("🚗 配車: 遠征乗り合い配車");
    }
  }

  const cargoText =
    ops.cargoCarMember ||
    sync?.cars
      .filter((c) => c.isCargo)
      .map((c) => `${c.driverName}`)
      .join("・") ||
    "";
  if (cargoText) {
    carLines.push(`📦 道具車: ${cargoText}`);
  }
  if (ops.carpoolSummaryNote) {
    carLines.push(`💬 配車メモ: ${ops.carpoolSummaryNote}`);
  }

  const parkingText = ops.carLimitNote || (params.venueParkingInfo || "").trim();
  if (
    parkingText &&
    parkingText !== "駐車場ルールは管理者にお問い合わせください"
  ) {
    carLines.push(`🅿️ 駐車ルール: ${parkingText}`);
  }

  const spikeText = (params.venueSpikeRule || "").trim();
  if (spikeText) {
    carLines.push(`👟 スパイク: ${spikeText}`);
  }

  const venueNotesText = (params.venueNotes || "").trim();
  if (venueNotesText) {
    carLines.push(`⚠️ 会場注意: ${venueNotesText}`);
  }

  if (carLines.length > 0) {
    lines.push("");
    lines.push("━━ 配車・会場ルール ━━");
    lines.push(...carLines);
  }

  // 4. 球場・地図URL
  if (params.venueOfficialName) {
    lines.push("");
    lines.push(
      `📍 会場: ${params.venueOfficialName}${
        params.venueAddress ? ` (${params.venueAddress})` : ""
      }`
    );
    if (
      params.venueExternalMapUrl &&
      params.venueExternalMapUrl !== "https://maps.google.com"
    ) {
      lines.push(`🗺️ Google Map: ${params.venueExternalMapUrl}`);
    }
  }

  // 5. スタメン（登録済みの場合）
  if (params.lineupShareBlock) {
    lines.push("");
    lines.push(params.lineupShareBlock);
  }

  return lines.join("\n");
}

