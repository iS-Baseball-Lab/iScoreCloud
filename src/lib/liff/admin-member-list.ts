// filepath: src/lib/liff/admin-member-list.ts

import {
  BUILTIN_ROLE_MASTER_LIST,
  evaluateEffectiveRolePermissions,
  resolveRoleLabel,
  type RoleBadgeTone,
  type TeamRoleDefinition,
} from "@/lib/roles";

export interface AdminMemberLinkedChild {
  id: string;
  name: string;
  nameKana?: string;
  uniformNumber: string;
}

export interface AdminMemberListItem {
  memberId: string;
  userId?: string | null;
  name: string;
  nameKana?: string | null;
  memberType?: string | null;
  phone?: string | null;
  email?: string | null;
  role: string;
  subRoles?: string[];
  subLabel?: string;
  isLineLinked?: boolean;
  joinedAt?: string;
  linkedChildren?: AdminMemberLinkedChild[];
  playerUniformNumber?: string | null;
}

export type AdminMemberCategoryKey =
  | "managers"
  | "coaches_ops"
  | "parents"
  | "players_others";

/**
 * 絞り込みチップID:
 * - `"all"`: 全員
 * - `"unlinked"`: 手動登録（LINE未連携）のみ
 * - `"role:<roleKey>"`: 指定した役職（主役職または兼務ロール）を持つメンバー
 */
export type AdminMemberFilterId = "all" | "unlinked" | `role:${string}`;

export type AdminMemberSortMode = "role" | "kana" | "duty";

export interface AdminMemberSectionAccent {
  capBorderClass: string;
  iconBgClass: string;
  countBadgeClass: string;
}

export interface AdminMemberRoleFilterChip {
  filterId: `role:${string}`;
  roleKey: string;
  label: string;
  isBuiltin: boolean;
  badgeTone: RoleBadgeTone;
  count: number;
}

export interface AdminMemberSectionGroup<
  T extends AdminMemberListItem = AdminMemberListItem
> {
  key: string;
  title: string;
  subtitle?: string;
  accent: AdminMemberSectionAccent;
  roleKey?: string;
  isCustomRole?: boolean;
  concurrentCount?: number;
  members: T[];
}

const BUILTIN_ROLE_KEYS = new Set<string>(
  BUILTIN_ROLE_MASTER_LIST.map((r) => r.role.toLowerCase())
);

const jaCollator = new Intl.Collator("ja", {
  numeric: true,
  sensitivity: "base",
});

export function resolveRoleToneSectionAccent(
  tone: RoleBadgeTone
): AdminMemberSectionAccent {
  switch (tone) {
    case "rose":
      return {
        capBorderClass: "border-rose-500",
        iconBgClass: "bg-rose-500/20 text-rose-300 border border-rose-400/30",
        countBadgeClass:
          "bg-rose-500/20 text-rose-200 border border-rose-400/30",
      };
    case "amber":
      return {
        capBorderClass: "border-amber-500",
        iconBgClass:
          "bg-amber-500/20 text-amber-300 border border-amber-400/30",
        countBadgeClass:
          "bg-amber-500/20 text-amber-200 border border-amber-400/30",
      };
    case "primary":
      return {
        capBorderClass: "border-primary",
        iconBgClass: "bg-slate-800 text-sky-300 border border-slate-700",
        countBadgeClass: "bg-slate-800 text-slate-100 border border-slate-700",
      };
    case "teal":
      return {
        capBorderClass: "border-teal-500",
        iconBgClass: "bg-teal-500/20 text-teal-300 border border-teal-400/30",
        countBadgeClass:
          "bg-teal-500/20 text-teal-200 border border-teal-400/30",
      };
    case "emerald":
      return {
        capBorderClass: "border-emerald-500",
        iconBgClass:
          "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30",
        countBadgeClass:
          "bg-emerald-500/20 text-emerald-200 border border-emerald-400/30",
      };
    case "slate":
    default:
      return {
        capBorderClass: "border-slate-500",
        iconBgClass: "bg-slate-800 text-slate-200 border border-slate-700",
        countBadgeClass: "bg-slate-800 text-slate-200 border border-slate-700",
      };
  }
}

/**
 * メンバーに割り当てられている全役職キー（主役職 ＋ 兼務ロール）を小文字・重複なしで返す
 */
export function extractMemberAssignedRoleKeys(
  member: AdminMemberListItem
): string[] {
  const primary = (member.role || "parent").trim().toLowerCase() || "parent";
  const result: string[] = [primary];
  const seen = new Set<string>([primary]);
  for (const sr of member.subRoles || []) {
    const clean = (sr || "").trim().toLowerCase();
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      result.push(clean);
    }
  }
  return result;
}

/**
 * 役職定義リストを優先度（priority）昇順に整列して返す
 */
export function sortRoleDefinitionsByPriority(
  roleDefinitions: ReadonlyArray<TeamRoleDefinition>
): TeamRoleDefinition[] {
  return [...roleDefinitions].sort((a, b) => {
    const pa = a.priority ?? 99;
    const pb = b.priority ?? 99;
    if (pa !== pb) return pa - pb;
    return jaCollator.compare(a.label, b.label);
  });
}

/**
 * カタカナをひらがなへ正規化し、前後の空白を除去する
 */
export function normalizeToHiragana(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/[\u30a1-\u30f6]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60)
    )
    .replace(/\s+/g, " ");
}

/**
 * 氏名からスペース区切りの苗字（姓）トークンを抽出する
 * （例: "田中 健一" -> "田中", "田中　母" -> "田中", スペース無し -> ""）
 */
export function extractFamilySurname(name: string | null | undefined): string {
  if (!name) return "";
  const trimmed = name.trim();
  const parts = trimmed.split(/[\s\u3000]+/).filter(Boolean);
  if (parts.length >= 2 && parts[0].length >= 1 && parts[0].length <= 6) {
    return parts[0];
  }
  return "";
}

/**
 * チーム内の他メンバーや紐付け選手のふりがなから「苗字 -> よみがな」辞書を構築する
 * （保護者のふりがなが未入力でも、配偶者や選手名簿のよみがなから五十音順を自動補完する）
 */
export function buildSurnameKanaHintMap(
  members: ReadonlyArray<AdminMemberListItem>
): Map<string, string> {
  const map = new Map<string, string>();

  const registerPair = (
    fullName: string | null | undefined,
    fullKana: string | null | undefined
  ) => {
    const surname = extractFamilySurname(fullName);
    if (!surname || map.has(surname)) return;
    const hira = normalizeToHiragana(fullKana);
    if (!hira) return;
    const kanaParts = hira.split(" ").filter(Boolean);
    const firstKana = kanaParts[0] || hira;
    if (/^[\u3041-\u3096ー]+$/.test(firstKana)) {
      map.set(surname, firstKana);
    }
  };

  for (const m of members) {
    registerPair(m.name, m.nameKana);
    for (const child of m.linkedChildren || []) {
      registerPair(child.name, child.nameKana);
    }
  }

  return map;
}

/**
 * メンバーの名前昇順ソート・五十音行判定に使う実効よみがなを解決する
 */
export function resolveEffectiveMemberReading(
  member: AdminMemberListItem,
  surnameKanaMap: ReadonlyMap<string, string>
): string {
  const directHira = normalizeToHiragana(member.nameKana);
  if (directHira && /^[\u3041-\u3096]/.test(directHira)) {
    return directHira;
  }

  const nameHira = normalizeToHiragana(member.name);
  if (nameHira && /^[\u3041-\u3096]/.test(nameHira)) {
    return nameHira;
  }

  const surname = extractFamilySurname(member.name);
  if (surname) {
    const hinted = surnameKanaMap.get(surname);
    if (hinted) {
      const rest = member.name
        .trim()
        .slice(surname.length)
        .trim();
      return rest ? `${hinted} ${normalizeToHiragana(rest)}` : hinted;
    }
  }

  for (const child of member.linkedChildren || []) {
    const childKana = normalizeToHiragana(child.nameKana);
    if (childKana && /^[\u3041-\u3096]/.test(childKana)) {
      const childSurnameKana = childKana.split(" ")[0] || childKana;
      return `${childSurnameKana} ${member.name.trim()}`;
    }
  }

  return "";
}

const GOJUON_ROWS: ReadonlyArray<{
  key: string;
  label: string;
  order: number;
  chars: string;
}> = [
  { key: "kana_a", label: "あ行", order: 0, chars: "あいうえおぁぃぅぇぉゔ" },
  {
    key: "kana_ka",
    label: "か行",
    order: 1,
    chars: "かきくけこがぎぐげごゕゖ",
  },
  { key: "kana_sa", label: "さ行", order: 2, chars: "さしすせそざじずぜぞ" },
  {
    key: "kana_ta",
    label: "た行",
    order: 3,
    chars: "たちつてとだぢづでどっ",
  },
  { key: "kana_na", label: "な行", order: 4, chars: "なにぬねの" },
  {
    key: "kana_ha",
    label: "は行",
    order: 5,
    chars: "はひふへほばびぶべぼぱぴぷぺぽ",
  },
  { key: "kana_ma", label: "ま行", order: 6, chars: "まみむめも" },
  { key: "kana_ya", label: "や行", order: 7, chars: "やゆよゃゅょ" },
  { key: "kana_ra", label: "ら行", order: 8, chars: "らりるれろ" },
  { key: "kana_wa", label: "わ行", order: 9, chars: "わゐゑをんゎ" },
];

export function resolveGojuonGroupMeta(
  effectiveReading: string,
  fallbackName: string
): { key: string; label: string; order: number } {
  const firstChar = (effectiveReading || "").trim().charAt(0);
  if (firstChar) {
    for (const row of GOJUON_ROWS) {
      if (row.chars.includes(firstChar)) {
        return { key: row.key, label: row.label, order: row.order };
      }
    }
  }
  const rawFirst = (fallbackName || "").trim().charAt(0);
  if (/^[a-zA-Zａ-ｚＡ-Ｚ]/.test(rawFirst)) {
    return { key: "kana_alpha", label: "英字", order: 10 };
  }
  return { key: "kana_other", label: "その他（かな未設定）", order: 11 };
}

/**
 * アバター配色等に使用するメンバーの機能トーン分類
 */
export function classifyAdminMemberCategory(
  member: AdminMemberListItem,
  roleDefinitions: ReadonlyArray<TeamRoleDefinition>
): AdminMemberCategoryKey {
  const subs = member.subRoles || [];
  const effectivePerms = evaluateEffectiveRolePermissions(
    member.role,
    subs,
    roleDefinitions
  );

  if (effectivePerms.canManageTeam) {
    return "managers";
  }

  const primaryKey = (member.role || "parent").trim().toLowerCase();
  const allRoleKeys = [primaryKey, ...subs.map((s) => s.trim().toLowerCase())];

  const hasOpsOrStaffPermission =
    effectivePerms.canManageOps ||
    effectivePerms.canManagePlayers ||
    effectivePerms.canEditScore ||
    effectivePerms.canEditSchedule ||
    effectivePerms.canEditCarpool;

  const hasCoachOrStaffBuiltin = allRoleKeys.some(
    (k) => k === "coach" || k === "scorer" || k === "staff"
  );

  if (
    hasOpsOrStaffPermission ||
    hasCoachOrStaffBuiltin ||
    member.memberType === "staff"
  ) {
    return "coaches_ops";
  }

  if (
    primaryKey === "player" ||
    primaryKey === "viewer" ||
    member.memberType === "player"
  ) {
    return "players_others";
  }

  if (!BUILTIN_ROLE_KEYS.has(primaryKey)) {
    return "coaches_ops";
  }

  return "parents";
}

/**
 * 役職ごとの所属人数（主役職＋兼務ロールを含む）と未連携件数を集計し、
 * 1名以上所属する役職の絞り込みチップ配列を優先度順で返す
 */
export function computeAdminMemberFilterSummary(
  members: ReadonlyArray<AdminMemberListItem>,
  roleDefinitions: ReadonlyArray<TeamRoleDefinition>
): {
  totalCount: number;
  unlinkedCount: number;
  roleChips: AdminMemberRoleFilterChip[];
} {
  const roleCountMap = new Map<string, number>();
  let unlinkedCount = 0;

  for (const m of members) {
    const isLinked = m.isLineLinked ?? Boolean(m.userId);
    if (!isLinked) {
      unlinkedCount += 1;
    }
    for (const rk of extractMemberAssignedRoleKeys(m)) {
      roleCountMap.set(rk, (roleCountMap.get(rk) || 0) + 1);
    }
  }

  const sortedDefs = sortRoleDefinitionsByPriority(roleDefinitions);
  const roleChips: AdminMemberRoleFilterChip[] = [];
  const seenKeys = new Set<string>();

  for (const def of sortedDefs) {
    const rk = def.role.toLowerCase();
    seenKeys.add(rk);
    const count = roleCountMap.get(rk) || 0;
    if (count <= 0) continue;
    roleChips.push({
      filterId: `role:${rk}`,
      roleKey: rk,
      label: def.label,
      isBuiltin: def.isBuiltin,
      badgeTone: def.badgeTone,
      count,
    });
  }

  for (const [rk, count] of roleCountMap.entries()) {
    if (seenKeys.has(rk) || count <= 0) continue;
    roleChips.push({
      filterId: `role:${rk}`,
      roleKey: rk,
      label: resolveRoleLabel(rk, roleDefinitions),
      isBuiltin: BUILTIN_ROLE_KEYS.has(rk),
      badgeTone: "slate",
      count,
    });
  }

  return {
    totalCount: members.length,
    unlinkedCount,
    roleChips,
  };
}

/**
 * 検索キーワード＋役職/未連携チップでメンバーを絞り込む
 * （氏名・ふりがな・役職名・当番班・電話番号に加え、紐付けお子様名・背番号でもヒット）
 */
export function filterAdminMembers<T extends AdminMemberListItem>(
  members: ReadonlyArray<T>,
  options: {
    filter: AdminMemberFilterId;
    searchQuery: string;
    roleDefinitions: ReadonlyArray<TeamRoleDefinition>;
  }
): T[] {
  const { filter, searchQuery, roleDefinitions } = options;
  const q = searchQuery.trim().toLowerCase();
  const qHira = normalizeToHiragana(q);
  const targetRoleKey = filter.startsWith("role:")
    ? filter.slice("role:".length).trim().toLowerCase()
    : "";

  return members.filter((m) => {
    const isLinked = m.isLineLinked ?? Boolean(m.userId);
    if (filter === "unlinked") {
      if (isLinked) return false;
    } else if (targetRoleKey) {
      const assigned = extractMemberAssignedRoleKeys(m);
      if (!assigned.includes(targetRoleKey)) return false;
    }

    if (!q) return true;

    const allRoles = extractMemberAssignedRoleKeys(m);
    const roleLabels = allRoles
      .map((r) => resolveRoleLabel(r, roleDefinitions))
      .join(" ");
    const childrenText = (m.linkedChildren || [])
      .map(
        (c) =>
          `${c.name} ${c.nameKana || ""} #${c.uniformNumber} ${c.uniformNumber}`
      )
      .join(" ");
    const playerNumText = m.playerUniformNumber
      ? `#${m.playerUniformNumber} ${m.playerUniformNumber}`
      : "";

    const rawHay = `${m.name} ${m.nameKana || ""} ${roleLabels} ${
      m.subLabel || ""
    } ${m.phone || ""} ${childrenText} ${playerNumText}`.toLowerCase();

    if (rawHay.includes(q)) return true;
    if (qHira && normalizeToHiragana(rawHay).includes(qHira)) return true;
    return false;
  });
}

/**
 * 選択された並び順モードに応じてセクション単位にグループ化し、各くくりの中は「名前の昇順」で整列する
 * - `role`（役職別）: 規定・独自を含む各役職ごとにくくり、兼務メンバーは該当するすべての役職くくりに表示する
 * - `kana`（五十音順）: あ行〜わ行ごとにくくり、名前昇順で整列する
 * - `duty`（当番班別）: 当番班・担当ラベルごとにくくり、名前昇順で整列する
 */
export function groupAndSortAdminMembers<T extends AdminMemberListItem>(
  members: ReadonlyArray<T>,
  options: {
    sortMode: AdminMemberSortMode;
    filter?: AdminMemberFilterId;
    roleDefinitions: ReadonlyArray<TeamRoleDefinition>;
    allTeamMembersForKanaHint?: ReadonlyArray<AdminMemberListItem>;
    presetDutyGroups?: ReadonlyArray<string>;
  }
): AdminMemberSectionGroup<T>[] {
  const {
    sortMode,
    filter = "all",
    roleDefinitions,
    allTeamMembersForKanaHint,
    presetDutyGroups = [],
  } = options;

  if (members.length === 0) return [];

  const surnameKanaMap = buildSurnameKanaHintMap(
    allTeamMembersForKanaHint || members
  );

  const readingCache = new Map<string, string>();
  const getReading = (m: AdminMemberListItem): string => {
    const cached = readingCache.get(m.memberId);
    if (cached !== undefined) return cached;
    const resolved = resolveEffectiveMemberReading(m, surnameKanaMap);
    readingCache.set(m.memberId, resolved);
    return resolved;
  };

  /**
   * くくり内の統一ソート：名前の昇順（よみがな五十音昇順 ➔ 氏名文字列昇順 ➔ ID昇順）
   */
  const compareByNameAsc = (a: T, b: T): number => {
    const ra = getReading(a);
    const rb = getReading(b);
    if (ra && rb) {
      const kanaCmp = jaCollator.compare(ra, rb);
      if (kanaCmp !== 0) return kanaCmp;
    } else if (ra || rb) {
      const mixedCmp = jaCollator.compare(ra || a.name, rb || b.name);
      if (mixedCmp !== 0) return mixedCmp;
    }

    const nameCmp = jaCollator.compare(a.name, b.name);
    if (nameCmp !== 0) return nameCmp;

    return a.memberId.localeCompare(b.memberId);
  };

  // ① 役職ごとモード（主役職＋兼務ロールごとに展開、兼務者は複数箇所に表示）
  if (sortMode === "role") {
    const buckets = new Map<string, T[]>();
    for (const m of members) {
      for (const rk of extractMemberAssignedRoleKeys(m)) {
        const list = buckets.get(rk);
        if (list) {
          list.push(m);
        } else {
          buckets.set(rk, [m]);
        }
      }
    }

    const activeRoleFilterKey = filter.startsWith("role:")
      ? filter.slice("role:".length).trim().toLowerCase()
      : "";

    const sortedDefs = sortRoleDefinitionsByPriority(roleDefinitions);
    const sections: AdminMemberSectionGroup<T>[] = [];
    const handledKeys = new Set<string>();

    for (const def of sortedDefs) {
      const rk = def.role.toLowerCase();
      handledKeys.add(rk);
      if (activeRoleFilterKey && rk !== activeRoleFilterKey) continue;

      const items = buckets.get(rk);
      if (!items || items.length === 0) continue;

      const sortedItems = [...items].sort(compareByNameAsc);
      const concurrentCount = sortedItems.filter(
        (m) => (m.role || "parent").trim().toLowerCase() !== rk
      ).length;

      sections.push({
        key: `role_${rk}`,
        title: def.label,
        subtitle: def.summary,
        accent: resolveRoleToneSectionAccent(def.badgeTone),
        roleKey: rk,
        isCustomRole: !def.isBuiltin,
        concurrentCount,
        members: sortedItems,
      });
    }

    // 万一、定義外のロールキーを持つデータが残っていた場合のフォールバック
    for (const [rk, items] of buckets.entries()) {
      if (handledKeys.has(rk) || items.length === 0) continue;
      if (activeRoleFilterKey && rk !== activeRoleFilterKey) continue;

      const sortedItems = [...items].sort(compareByNameAsc);
      const concurrentCount = sortedItems.filter(
        (m) => (m.role || "parent").trim().toLowerCase() !== rk
      ).length;

      sections.push({
        key: `role_${rk}`,
        title: resolveRoleLabel(rk, roleDefinitions),
        accent: resolveRoleToneSectionAccent("slate"),
        roleKey: rk,
        isCustomRole: !BUILTIN_ROLE_KEYS.has(rk),
        concurrentCount,
        members: sortedItems,
      });
    }

    return sections;
  }

  // ② 五十音順モード
  if (sortMode === "kana") {
    const rowBuckets = new Map<
      string,
      { label: string; order: number; items: T[] }
    >();

    for (const m of members) {
      const reading = getReading(m);
      const rowMeta = resolveGojuonGroupMeta(reading, m.name);
      const existing = rowBuckets.get(rowMeta.key);
      if (existing) {
        existing.items.push(m);
      } else {
        rowBuckets.set(rowMeta.key, {
          label: rowMeta.label,
          order: rowMeta.order,
          items: [m],
        });
      }
    }

    return Array.from(rowBuckets.entries())
      .sort((a, b) => a[1].order - b[1].order)
      .map(([key, bucket]) => {
        bucket.items.sort(compareByNameAsc);
        return {
          key,
          title: bucket.label,
          accent: {
            capBorderClass: "border-teal-500",
            iconBgClass: "bg-slate-800 text-teal-300 border border-slate-700",
            countBadgeClass:
              "bg-slate-800 text-slate-200 border border-slate-700",
          },
          members: bucket.items,
        };
      });
  }

  // ③ 当番班・担当ラベル別モード
  const dutyBuckets = new Map<string, T[]>();
  const unassigned: T[] = [];

  for (const m of members) {
    const label = (m.subLabel || "").trim();
    if (!label) {
      unassigned.push(m);
      continue;
    }
    const bucket = dutyBuckets.get(label);
    if (bucket) {
      bucket.push(m);
    } else {
      dutyBuckets.set(label, [m]);
    }
  }

  const presetIndex = new Map<string, number>();
  presetDutyGroups.forEach((g, idx) => {
    const clean = g.trim();
    if (clean && !presetIndex.has(clean)) {
      presetIndex.set(clean, idx);
    }
  });

  const sortedDutyKeys = Array.from(dutyBuckets.keys()).sort((a, b) => {
    const ia = presetIndex.get(a);
    const ib = presetIndex.get(b);
    if (ia !== undefined && ib !== undefined) return ia - ib;
    if (ia !== undefined) return -1;
    if (ib !== undefined) return 1;
    return jaCollator.compare(a, b);
  });

  const dutySections: AdminMemberSectionGroup<T>[] = sortedDutyKeys.map(
    (label) => {
      const items = dutyBuckets.get(label) || [];
      items.sort(compareByNameAsc);
      return {
        key: `duty_${label}`,
        title: label,
        accent: {
          capBorderClass: "border-teal-500",
          iconBgClass:
            "bg-teal-500/20 text-teal-300 border border-teal-400/30",
          countBadgeClass:
            "bg-teal-500/20 text-teal-200 border border-teal-400/30",
        },
        members: items,
      };
    }
  );

  if (unassigned.length > 0) {
    unassigned.sort(compareByNameAsc);
    dutySections.push({
      key: "duty_unassigned",
      title: "班・担当ラベル未設定",
      accent: {
        capBorderClass: "border-slate-500",
        iconBgClass: "bg-slate-800 text-slate-300 border border-slate-700",
        countBadgeClass: "bg-slate-800 text-slate-300 border border-slate-700",
      },
      members: unassigned,
    });
  }

  return dutySections;
}

/**
 * 左端タイルに表示する2文字モノグラム（選手背番号 または 苗字先頭2文字）を生成する
 */
export function resolveMemberAvatarMonogram(
  member: AdminMemberListItem
): string {
  if (member.playerUniformNumber) {
    const cleanNum = member.playerUniformNumber.trim();
    if (cleanNum) return `#${cleanNum}`;
  }
  const surname = extractFamilySurname(member.name);
  if (surname) {
    return surname.slice(0, 2);
  }
  const compact = (member.name || "").replace(/[\s\u3000]+/g, "");
  return compact.slice(0, 2) || "名";
}

/**
 * 保護者行に添える紐付け選手のコンパクト表記（例: 同姓なら "#10 翔太"、別姓なら "#10 田中翔太"）
 */
export function formatCompactLinkedChildLabel(
  parentName: string,
  child: AdminMemberLinkedChild
): string {
  const parentSurname = extractFamilySurname(parentName);
  const childParts = (child.name || "").trim().split(/[\s\u3000]+/).filter(Boolean);
  let shortName = (child.name || "").trim();
  if (
    parentSurname &&
    childParts.length >= 2 &&
    childParts[0] === parentSurname
  ) {
    shortName = childParts.slice(1).join("");
  } else {
    shortName = childParts.join("");
  }
  const num = (child.uniformNumber || "").trim();
  return num ? `#${num} ${shortName}` : shortName;
}
