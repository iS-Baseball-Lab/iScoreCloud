// filepath: src/lib/liff/equipment-sets-schema.ts

export type EquipmentSetCategory =
  | "official"
  | "hardball"
  | "practice_match"
  | "expedition"
  | "practice"
  | "custom";

export interface EquipmentSetItem {
  id: string;
  name: string;
  category: EquipmentSetCategory;
  description: string;
  equipmentIds: string[];
}

export interface EquipmentSetCategoryMeta {
  value: EquipmentSetCategory;
  label: string;
  shortBadge: string;
  badgeClass: string;
}

export const EQUIPMENT_SET_CATEGORIES: readonly EquipmentSetCategoryMeta[] = [
  {
    value: "official",
    label: "公式戦・大会用",
    shortBadge: "🏆 公式戦",
    badgeClass:
      "bg-amber-400 text-slate-950 border border-amber-500",
  },
  {
    value: "hardball",
    label: "硬式戦・硬式試合用",
    shortBadge: "⚾ 硬式戦",
    badgeClass:
      "bg-rose-600 text-white border border-rose-700",
  },
  {
    value: "practice_match",
    label: "OP戦・練習試合用",
    shortBadge: "🤝 OP戦",
    badgeClass:
      "bg-teal-500 text-slate-950 border border-teal-600",
  },
  {
    value: "expedition",
    label: "遠征・夏場対策用",
    shortBadge: "☀️ 遠征・夏場",
    badgeClass:
      "bg-sky-500 text-white border border-sky-600",
  },
  {
    value: "practice",
    label: "通常練習用",
    shortBadge: "🧢 通常練習",
    badgeClass:
      "bg-emerald-600 text-white border border-emerald-700",
  },
  {
    value: "custom",
    label: "その他カスタム",
    shortBadge: "📋 セット",
    badgeClass:
      "bg-slate-800 text-white border border-slate-700",
  },
] as const;

const VALID_CATEGORIES = new Set<EquipmentSetCategory>(
  EQUIPMENT_SET_CATEGORIES.map((c) => c.value)
);

export const MAX_EQUIPMENT_SETS_PER_TEAM = 24;

export function getEquipmentSetCategoryMeta(
  category: EquipmentSetCategory | string | null | undefined
): EquipmentSetCategoryMeta {
  const found = EQUIPMENT_SET_CATEGORIES.find((c) => c.value === category);
  return found || EQUIPMENT_SET_CATEGORIES[EQUIPMENT_SET_CATEGORIES.length - 1];
}

export interface EquipmentStarterTemplate {
  key: string;
  name: string;
  category: EquipmentSetCategory;
  description: string;
  includeKeywords: readonly string[];
  excludeKeywords?: readonly string[];
}

export const EQUIPMENT_SET_STARTER_TEMPLATES: readonly EquipmentStarterTemplate[] =
  [
    {
      key: "official",
      name: "公式戦セット",
      category: "official",
      description: "大会・トーナメント戦に持参する基本道具・団旗一式",
      includeKeywords: [
        "キャッチャー",
        "防具",
        "バット",
        "ヘルメット",
        "試合球",
        "公認球",
        "団旗",
        "プラカード",
        "救急",
        "アイシング",
        "テント",
      ],
      excludeKeywords: ["練習専用", "ラインカー"],
    },
    {
      key: "hardball",
      name: "硬式戦セット",
      category: "hardball",
      description: "硬式球の試合・大会で使用する道具・救急セット一式",
      includeKeywords: [
        "硬式",
        "キャッチャー",
        "防具",
        "バット",
        "ヘルメット",
        "試合球",
        "ボール",
        "ロジン",
        "救急",
        "アイシング",
      ],
      excludeKeywords: ["軟式専用"],
    },
    {
      key: "practice_match",
      name: "OP戦セット",
      category: "practice_match",
      description: "OP戦（練習試合・交流戦）用の道具・得点盤・審判用具一式",
      includeKeywords: [
        "キャッチャー",
        "防具",
        "バット",
        "ヘルメット",
        "試合球",
        "練習球",
        "ボール",
        "BSO",
        "得点",
        "インジケーター",
        "審判",
        "ラインカー",
        "救急",
      ],
      excludeKeywords: ["団旗", "プラカード"],
    },
    {
      key: "expedition",
      name: "遠征・夏場セット",
      category: "expedition",
      description: "タープテント・ジャグ・クーラーなど遠征・熱中症対策品一式",
      includeKeywords: [
        "テント",
        "タープ",
        "ジャグ",
        "クーラー",
        "氷",
        "救急",
        "アイシング",
        "ベンチシート",
      ],
    },
    {
      key: "practice",
      name: "通常練習セット",
      category: "practice",
      description: "普段のグラウンド練習・ノック・打撃練習用の道具一式",
      includeKeywords: [
        "練習球",
        "ボール",
        "バット",
        "キャッチャー",
        "防具",
        "ヘルメット",
        "ラインカー",
        "ティースタンド",
        "ネット",
        "救急",
      ],
      excludeKeywords: ["団旗", "プラカード"],
    },
  ] as const;

export function matchEquipmentIdsForStarterTemplate(
  template: EquipmentStarterTemplate,
  equipments: ReadonlyArray<{
    id: string;
    name: string;
    description?: string | null;
  }>
): string[] {
  const matched: string[] = [];
  for (const eq of equipments) {
    const haystack = `${eq.name} ${eq.description || ""}`.toLowerCase();
    const isExcluded = (template.excludeKeywords || []).some((kw) =>
      haystack.includes(kw.toLowerCase())
    );
    if (isExcluded) continue;
    const isIncluded = template.includeKeywords.some((kw) =>
      haystack.includes(kw.toLowerCase())
    );
    if (isIncluded) {
      matched.push(eq.id);
    }
  }
  return matched;
}

export function parseEquipmentSetsJson(
  raw: unknown,
  validEquipmentIds?: ReadonlySet<string>
): EquipmentSetItem[] {
  if (!raw) return [];
  let parsed: unknown = raw;
  for (let depth = 0; depth < 2 && typeof parsed === "string"; depth++) {
    const trimmed = parsed.trim();
    if (!trimmed || trimmed === "[]" || trimmed === "null") return [];
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];

  const result: EquipmentSetItem[] = [];
  const seenSetIds = new Set<string>();

  for (let idx = 0; idx < parsed.length; idx++) {
    if (result.length >= MAX_EQUIPMENT_SETS_PER_TEAM) break;
    const item = parsed[idx];
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;

    const name =
      typeof rec.name === "string" ? rec.name.trim().slice(0, 40) : "";
    if (!name) continue;

    const rawId =
      typeof rec.id === "string" && rec.id.trim()
        ? rec.id.trim().slice(0, 64)
        : `eqset_${idx + 1}`;
    if (seenSetIds.has(rawId)) continue;
    seenSetIds.add(rawId);

    const rawCat =
      typeof rec.category === "string"
        ? (rec.category.trim() as EquipmentSetCategory)
        : "custom";
    const category: EquipmentSetCategory = VALID_CATEGORIES.has(rawCat)
      ? rawCat
      : inferEquipmentSetCategoryFromName(name);

    const description =
      typeof rec.description === "string"
        ? rec.description.trim().slice(0, 120)
        : "";

    const eqIdList: string[] = [];
    const seenEqIds = new Set<string>();
    if (Array.isArray(rec.equipmentIds)) {
      for (const rawEqId of rec.equipmentIds) {
        if (typeof rawEqId !== "string") continue;
        const cleanEqId = rawEqId.trim();
        if (!cleanEqId || seenEqIds.has(cleanEqId)) continue;
        if (validEquipmentIds && !validEquipmentIds.has(cleanEqId)) continue;
        seenEqIds.add(cleanEqId);
        eqIdList.push(cleanEqId);
      }
    }

    result.push({
      id: rawId,
      name,
      category,
      description,
      equipmentIds: eqIdList,
    });
  }

  return result;
}

export function inferEquipmentSetCategoryFromName(
  name: string
): EquipmentSetCategory {
  const norm = name.trim().toLowerCase();
  if (norm.includes("硬式")) return "hardball";
  if (
    norm.includes("op") ||
    norm.includes("ｏｐ") ||
    norm.includes("練習試合") ||
    norm.includes("オープン戦") ||
    norm.includes("交流戦")
  ) {
    return "practice_match";
  }
  if (
    norm.includes("公式") ||
    norm.includes("大会") ||
    norm.includes("トーナメント")
  ) {
    return "official";
  }
  if (norm.includes("遠征") || norm.includes("夏") || norm.includes("合宿")) {
    return "expedition";
  }
  if (norm.includes("練習")) return "practice";
  return "custom";
}

export function sanitizeEquipmentSetsForSave(
  input: unknown,
  validEquipmentIds: ReadonlySet<string>
): EquipmentSetItem[] {
  return parseEquipmentSetsJson(input, validEquipmentIds);
}

/**
 * 予定タイトル・メモ・日付から「この日の配車におすすめの道具セットID」を推論する
 */
export function recommendEquipmentSetIds(
  sets: readonly EquipmentSetItem[],
  contextText: string,
  dateKey?: string | null
): Set<string> {
  const recommended = new Set<string>();
  if (sets.length === 0) return recommended;

  const text = (contextText || "").toLowerCase();
  const isHardball = text.includes("硬式");
  const isPracticeMatch =
    text.includes("op戦") ||
    text.includes("ｏｐ戦") ||
    text.includes("練習試合") ||
    text.includes("オープン戦") ||
    text.includes("交流戦") ||
    text.includes("親善");
  const isOfficial =
    !isPracticeMatch &&
    (text.includes("公式戦") ||
      text.includes("大会") ||
      text.includes("トーナメント") ||
      text.includes("選手権") ||
      text.includes("予選") ||
      text.includes("本戦") ||
      text.includes("決勝") ||
      text.includes("回戦") ||
      text.includes("杯"));

  let monthNum = 0;
  if (dateKey) {
    const m = dateKey.match(/^\d{4}-(\d{2})-/);
    if (m) monthNum = Number(m[1]);
  }
  const isSummerOrExpedition =
    text.includes("遠征") ||
    text.includes("合宿") ||
    (monthNum >= 6 && monthNum <= 9 && (isOfficial || isPracticeMatch || isHardball));

  const isPlainPractice =
    !isHardball &&
    !isPracticeMatch &&
    !isOfficial &&
    (text.includes("練習") || text.includes("グラウンド"));

  for (const s of sets) {
    const setNorm = s.name.toLowerCase();
    if (
      isHardball &&
      (s.category === "hardball" || setNorm.includes("硬式"))
    ) {
      recommended.add(s.id);
    }
    if (
      isPracticeMatch &&
      (s.category === "practice_match" ||
        setNorm.includes("op") ||
        setNorm.includes("練習試合"))
    ) {
      recommended.add(s.id);
    }
    if (
      isOfficial &&
      (s.category === "official" ||
        setNorm.includes("公式") ||
        setNorm.includes("大会"))
    ) {
      recommended.add(s.id);
    }
    if (
      isSummerOrExpedition &&
      (s.category === "expedition" ||
        setNorm.includes("遠征") ||
        setNorm.includes("夏"))
    ) {
      recommended.add(s.id);
    }
    if (isPlainPractice && s.category === "practice") {
      recommended.add(s.id);
    }
  }

  return recommended;
}

export interface CarSlotForEquipmentCalc {
  localKey: string;
  carId: string | null;
  driverMemberId: string;
  isCargo: boolean;
  isBus: boolean;
  capacity: number;
  ridersCount: number;
  equipmentIds: string[];
}

export interface EquipmentMetaForCalc {
  id: string;
  isHeavy: boolean;
  defaultCarId?: string | null;
  defaultMemberId?: string | null;
}

/**
 * 備品マスタの「いつもの積載車（defaultCarId）」または「普段の保管担当（defaultMemberId）」に一致する号車へ未割当備品を自動セットする
 */
export function applyDefaultEquipmentsToCarSlots(params: {
  slots: readonly CarSlotForEquipmentCalc[];
  equipments: readonly EquipmentMetaForCalc[];
}): {
  equipmentIdsBySlotKey: Map<string, string[]>;
  addedCount: number;
} {
  const { slots, equipments } = params;
  const equipmentIdsBySlotKey = new Map<string, string[]>();
  const assignedEqIds = new Set<string>();

  for (const s of slots) {
    const copy = [...s.equipmentIds];
    equipmentIdsBySlotKey.set(s.localKey, copy);
    for (const eqId of copy) {
      assignedEqIds.add(eqId);
    }
  }

  let addedCount = 0;
  for (const eq of equipments) {
    if (assignedEqIds.has(eq.id)) continue;
    if (!eq.defaultCarId && !eq.defaultMemberId) continue;

    // 1. 車両ID一致を最優先
    let targetSlot = eq.defaultCarId
      ? slots.find((s) => s.carId && s.carId === eq.defaultCarId)
      : undefined;

    // 2. 次に運転手メンバーID一致
    if (!targetSlot && eq.defaultMemberId) {
      targetSlot = slots.find(
        (s) =>
          s.driverMemberId &&
          s.driverMemberId !== "__custom__" &&
          s.driverMemberId === eq.defaultMemberId
      );
    }

    if (targetSlot) {
      const list = equipmentIdsBySlotKey.get(targetSlot.localKey);
      if (list && !list.includes(eq.id)) {
        list.push(eq.id);
        assignedEqIds.add(eq.id);
        addedCount += 1;
      }
    }
  }

  return { equipmentIdsBySlotKey, addedCount };
}

/**
 * 選択した道具セット（targetEquipmentIds）を現在の全号車へスマート自動振り分けする
 * - 既にいずれかの号車に積載済みの備品はその号車を維持（重複防止）
 * - 未割当の備品は: ①いつもの積載車/保管担当一致 ➔ ②重量物は道具車/バス優先 ➔ ③空き座席・積載点数のバランスが良い号車へ自動分散
 */
export function distributeEquipmentsAcrossCarSlots(params: {
  targetEquipmentIds: readonly string[];
  slots: readonly CarSlotForEquipmentCalc[];
  equipments: readonly EquipmentMetaForCalc[];
}): {
  equipmentIdsBySlotKey: Map<string, string[]>;
  newlyPlacedCount: number;
} {
  const { targetEquipmentIds, slots, equipments } = params;
  const equipmentIdsBySlotKey = new Map<string, string[]>();
  const assignedEqIds = new Set<string>();

  for (const s of slots) {
    const copy = [...s.equipmentIds];
    equipmentIdsBySlotKey.set(s.localKey, copy);
    for (const eqId of copy) {
      assignedEqIds.add(eqId);
    }
  }

  if (slots.length === 0 || targetEquipmentIds.length === 0) {
    return { equipmentIdsBySlotKey, newlyPlacedCount: 0 };
  }

  const eqMetaMap = new Map<string, EquipmentMetaForCalc>();
  for (const eq of equipments) {
    eqMetaMap.set(eq.id, eq);
  }

  // 重量物を先に配置して道具車枠を確保し、その後に軽量物を分散する
  const pendingIds = targetEquipmentIds.filter(
    (id) => !assignedEqIds.has(id) && eqMetaMap.has(id)
  );
  pendingIds.sort((a, b) => {
    const aHeavy = eqMetaMap.get(a)?.isHeavy ? 1 : 0;
    const bHeavy = eqMetaMap.get(b)?.isHeavy ? 1 : 0;
    return bHeavy - aHeavy;
  });

  let newlyPlacedCount = 0;

  for (const eqId of pendingIds) {
    const meta = eqMetaMap.get(eqId);
    if (!meta) continue;

    // ① いつもの積載車両 / 保管担当メンバーがいれば最優先
    let chosenSlot: CarSlotForEquipmentCalc | undefined = meta.defaultCarId
      ? slots.find((s) => s.carId && s.carId === meta.defaultCarId)
      : undefined;

    if (!chosenSlot && meta.defaultMemberId) {
      chosenSlot = slots.find(
        (s) =>
          s.driverMemberId &&
          s.driverMemberId !== "__custom__" &&
          s.driverMemberId === meta.defaultMemberId
      );
    }

    // ② スコアリングで最適な号車を選択
    if (!chosenSlot) {
      let bestScore = -Infinity;
      for (const s of slots) {
        const currentList = equipmentIdsBySlotKey.get(s.localKey) || [];
        const currentHeavyCount = currentList.filter(
          (id) => eqMetaMap.get(id)?.isHeavy
        ).length;
        const spareSeats = Math.max(0, s.capacity - s.ridersCount);

        let score = 0;
        if (meta.isHeavy) {
          if (s.isCargo) score += 100 - currentHeavyCount * 12;
          else if (s.isBus) score += 45 - currentHeavyCount * 10;
          else score += spareSeats * 5 - currentHeavyCount * 18 - currentList.length * 6;
        } else {
          // 軽量備品（救急バッグ・インジケーター等）：荷物専用車があれば適度に積みつつ、普通車の空き余裕にもバランス配分
          if (s.isCargo && currentList.length < 3) {
            score += 22 - currentList.length * 6;
          } else {
            score += spareSeats * 4 - currentList.length * 9;
          }
        }

        if (score > bestScore) {
          bestScore = score;
          chosenSlot = s;
        }
      }
    }

    if (chosenSlot) {
      const list = equipmentIdsBySlotKey.get(chosenSlot.localKey);
      if (list && !list.includes(eqId)) {
        list.push(eqId);
        assignedEqIds.add(eqId);
        newlyPlacedCount += 1;
      }
    }
  }

  return { equipmentIdsBySlotKey, newlyPlacedCount };
}

export interface PreviousCarpoolEquipmentEntry {
  carId: string | null;
  driverMemberId: string | null;
  isCargo: boolean;
  equipmentIds: string[];
}

/**
 * 前回の配車データから、同じ車両または同じ運転手（または道具車枠）へ道具割当を引き継ぐ
 */
export function applyPreviousCarpoolEquipments(params: {
  slots: readonly CarSlotForEquipmentCalc[];
  previousCars: readonly PreviousCarpoolEquipmentEntry[];
  validEquipmentIds: ReadonlySet<string>;
}): {
  equipmentIdsBySlotKey: Map<string, string[]>;
  restoredCount: number;
} {
  const { slots, previousCars, validEquipmentIds } = params;
  const equipmentIdsBySlotKey = new Map<string, string[]>();
  const assignedEqIds = new Set<string>();

  for (const s of slots) {
    const copy = [...s.equipmentIds];
    equipmentIdsBySlotKey.set(s.localKey, copy);
    for (const eqId of copy) {
      assignedEqIds.add(eqId);
    }
  }

  let restoredCount = 0;

  for (const prevCar of previousCars) {
    const validPrevEqs = prevCar.equipmentIds.filter(
      (id) => validEquipmentIds.has(id) && !assignedEqIds.has(id)
    );
    if (validPrevEqs.length === 0) continue;

    // 1. 同一車両ID ➔ 2. 同一運転手メンバーID ➔ 3. 道具車同士 の順で照合
    const matchedSlot =
      (prevCar.carId
        ? slots.find((s) => s.carId && s.carId === prevCar.carId)
        : undefined) ||
      (prevCar.driverMemberId
        ? slots.find(
            (s) =>
              s.driverMemberId &&
              s.driverMemberId !== "__custom__" &&
              s.driverMemberId === prevCar.driverMemberId
          )
        : undefined) ||
      (prevCar.isCargo ? slots.find((s) => s.isCargo) : undefined);

    if (!matchedSlot) continue;
    const list = equipmentIdsBySlotKey.get(matchedSlot.localKey);
    if (!list) continue;

    for (const eqId of validPrevEqs) {
      if (!assignedEqIds.has(eqId)) {
        list.push(eqId);
        assignedEqIds.add(eqId);
        restoredCount += 1;
      }
    }
  }

  return { equipmentIdsBySlotKey, restoredCount };
}
