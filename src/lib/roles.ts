// filepath: src/lib/roles.ts

// 💡 規定のシステムロール（値は小文字で統一）
export const ROLES = {
  ADMIN: "admin",       // IT管理者
  MANAGER: "manager",   // 代表・監督
  COACH: "coach",       // コーチ
  SCORER: "scorer",     // スコアラー
  STAFF: "staff",       // スタッフ（マネージャーや用具係など）
  PARENT: "parent",     // 保護者（選手サポート・内部データ閲覧）
  PLAYER: "player",     // 選手
  VIEWER: "viewer",     // OB・ファン・関係者（閲覧のみ）
  PENDING: "pending",   // 認証待ちの仮ユーザー（デフォルト）
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export type BuiltinTeamRoleKey = Exclude<Role, typeof ROLES.PENDING>;

export type RoleBadgeTone =
  | "primary"
  | "teal"
  | "amber"
  | "rose"
  | "emerald"
  | "slate";

/**
 * 💡 7軸の細分化チーム権限モデル
 * 1. canManageTeam: チーム管理（参加承認・役職/権限設定・編成・車両/大会/備品マスタ・LINEリマインド・Google Mapsキー・ティッカー編集）
 * 2. canManageOps: 運用・規定の設定（チーム表示・予定設定 / スコア・試合規定）
 * 3. canManagePlayers: 選手名簿・試合管理（選手の追加/公式名簿編集/休部設定、試合作成・編集・削除、球場・関連チーム編集）
 * 4. canEditScore: スコア・オーダー記録（スタメン・ベンチ編成、LINE試合速報入力、スコアAI取込・記録編集）
 * 5. canEditSchedule: 予定・行事・資料編集（活動予定の作成/編集、出欠項目設定/代理入力、特別行事・アンケート作成/集金管理、ルール/FAQ/資料/リンク/応援歌編集）
 * 6. canEditCarpool: 配車編成・管理（配車表・号車割り・乗車メンバー・道具セット配分の作成・編集）
 * 7. canMutate: 一般メンバー操作（本人/家族の出欠回答・行事回答・マイカー登録・隊列GPS発信・道具積載チェック・写真アルバム投稿・セルフプロフィール編集）
 */
export interface RolePermissions {
  canManageTeam: boolean;
  canManageOps: boolean;
  canManagePlayers: boolean;
  canEditScore: boolean;
  canEditSchedule: boolean;
  canEditCarpool: boolean;
  canMutate: boolean;
}

export type RolePermissionKey = keyof RolePermissions;

export interface PermissionAxisMeta {
  key: RolePermissionKey;
  label: string;
  shortLabel: string;
  description: string;
}

export const PERMISSION_AXIS_METAS: ReadonlyArray<PermissionAxisMeta> = [
  {
    key: "canManageTeam",
    label: "チーム管理（最高権限）",
    shortLabel: "チーム管理",
    description:
      "参加承認・メンバー/役職設定・チーム編成・車両/大会/備品マスタ・LINE自動リマインド・ティッカー編集",
  },
  {
    key: "canManageOps",
    label: "運用・規定の設定",
    shortLabel: "運用・規定",
    description:
      "「チーム表示・予定設定」（ロゴ・背景・練習試合呼称・活動グループ/当番班・初期時間）および「スコア・試合規定」（規定回数・記号流儀・早見表）の変更",
  },
  {
    key: "canManagePlayers",
    label: "選手名簿・試合管理",
    shortLabel: "選手・試合",
    description:
      "選手の登録・背番号/在籍制限の編集、試合の新規作成・編集・削除、球場マスタ・関連チームの編集",
  },
  {
    key: "canEditScore",
    label: "スコア・オーダー記録",
    shortLabel: "スコア記録",
    description:
      "スタメン・ベンチ編成の保存、紙スコアAI取込・デジタルスコアブック編集、LINE試合速報の記録",
  },
  {
    key: "canEditSchedule",
    label: "予定・行事・資料編集",
    shortLabel: "予定・資料",
    description:
      "活動予定の作成・編集、出欠確認項目・代理入力、行事・アンケートの作成・集金管理、ルール・FAQ・配布資料・リンク集の編集",
  },
  {
    key: "canEditCarpool",
    label: "配車編成・管理",
    shortLabel: "配車編成",
    description:
      "遠征・試合の配車表（1号車〜N号車の運転手・行き帰り乗車割当・道具積載セット）の作成・編集",
  },
  {
    key: "canMutate",
    label: "一般メンバー操作（出欠・写真等）",
    shortLabel: "一般操作",
    description:
      "本人・家族の出欠回答、マイカー登録、当日の隊列GPS共有・積載チェック、写真アルバム投稿、本人名鑑プロフィール入力（OFFで完全閲覧専用）",
  },
];

export interface CustomRoleSetting {
  role: string;
  customLabel: string;
}

export interface BuiltinRoleMasterItem {
  role: BuiltinTeamRoleKey;
  defaultLabel: string;
  badgeTone: RoleBadgeTone;
  summary: string;
  priority: number;
  lockManageTeamOn?: boolean;
  defaultPermissions: RolePermissions;
}

export const BUILTIN_ROLE_MASTER_LIST: ReadonlyArray<BuiltinRoleMasterItem> = [
  {
    role: ROLES.MANAGER,
    defaultLabel: "監督・代表",
    badgeTone: "rose",
    summary: "全管理メニュー・運用規定・選手・スコア・予定・配車のすべてを操作可能",
    priority: 0,
    lockManageTeamOn: true,
    defaultPermissions: {
      canManageTeam: true,
      canManageOps: true,
      canManagePlayers: true,
      canEditScore: true,
      canEditSchedule: true,
      canEditCarpool: true,
      canMutate: true,
    },
  },
  {
    role: ROLES.ADMIN,
    defaultLabel: "IT管理者",
    badgeTone: "amber",
    summary: "監督と同等の全管理権限（保護者会長・事務局・システム担当向け）",
    priority: 1,
    lockManageTeamOn: true,
    defaultPermissions: {
      canManageTeam: true,
      canManageOps: true,
      canManagePlayers: true,
      canEditScore: true,
      canEditSchedule: true,
      canEditCarpool: true,
      canMutate: true,
    },
  },
  {
    role: ROLES.COACH,
    defaultLabel: "コーチ",
    badgeTone: "primary",
    summary: "運用規定・選手育成・オーダー・スコア記録・予定・配車の編集が可能",
    priority: 2,
    defaultPermissions: {
      canManageTeam: false,
      canManageOps: true,
      canManagePlayers: true,
      canEditScore: true,
      canEditSchedule: true,
      canEditCarpool: true,
      canMutate: true,
    },
  },
  {
    role: ROLES.SCORER,
    defaultLabel: "スコアラー",
    badgeTone: "teal",
    summary: "スコア・試合規定の設定、試合作成、スコアブックAI取込・成績記録を担当",
    priority: 3,
    defaultPermissions: {
      canManageTeam: false,
      canManageOps: true,
      canManagePlayers: true,
      canEditScore: true,
      canEditSchedule: false,
      canEditCarpool: false,
      canMutate: true,
    },
  },
  {
    role: ROLES.STAFF,
    defaultLabel: "スタッフ",
    badgeTone: "emerald",
    summary: "チーム運営サポート（選手・予定連絡・行事・資料・配車編成が可能）",
    priority: 4,
    defaultPermissions: {
      canManageTeam: false,
      canManageOps: false,
      canManagePlayers: true,
      canEditScore: false,
      canEditSchedule: true,
      canEditCarpool: true,
      canMutate: true,
    },
  },
  {
    role: ROLES.PARENT,
    defaultLabel: "保護者",
    badgeTone: "slate",
    summary: "家族の出欠回答・マイカー登録・当日GPS共有・写真投稿・試合や資料の閲覧",
    priority: 20,
    defaultPermissions: {
      canManageTeam: false,
      canManageOps: false,
      canManagePlayers: false,
      canEditScore: false,
      canEditSchedule: false,
      canEditCarpool: false,
      canMutate: true,
    },
  },
  {
    role: ROLES.PLAYER,
    defaultLabel: "選手",
    badgeTone: "primary",
    summary: "自分の出欠回答・本人名鑑プロフィール入力・成績や試合記録の閲覧",
    priority: 21,
    defaultPermissions: {
      canManageTeam: false,
      canManageOps: false,
      canManagePlayers: false,
      canEditScore: false,
      canEditSchedule: false,
      canEditCarpool: false,
      canMutate: true,
    },
  },
  {
    role: ROLES.VIEWER,
    defaultLabel: "閲覧のみ（OB・応援）",
    badgeTone: "slate",
    summary: "試合速報・戦績の閲覧専用（出欠変更やデータ編集は不可）",
    priority: 30,
    defaultPermissions: {
      canManageTeam: false,
      canManageOps: false,
      canManagePlayers: false,
      canEditScore: false,
      canEditSchedule: false,
      canEditCarpool: false,
      canMutate: false,
    },
  },
];

export interface CustomRolePresetTemplate {
  id: string;
  label: string;
  badgeTone: RoleBadgeTone;
  summary: string;
  permissions: RolePermissions;
}

export const CUSTOM_ROLE_PRESETS: ReadonlyArray<CustomRolePresetTemplate> = [
  {
    id: "carpool_coordinator",
    label: "配車係",
    badgeTone: "teal",
    summary: "遠征・試合の号車割り・乗車メンバー・積載道具の編成を担当",
    permissions: {
      canManageTeam: false,
      canManageOps: false,
      canManagePlayers: false,
      canEditScore: false,
      canEditSchedule: false,
      canEditCarpool: true,
      canMutate: true,
    },
  },
  {
    id: "parents_chair",
    label: "父母会長・事務局",
    badgeTone: "amber",
    summary: "保護者会代表として参加承認・予定・行事・配車・全体連絡を統括",
    permissions: {
      canManageTeam: true,
      canManageOps: true,
      canManagePlayers: true,
      canEditScore: false,
      canEditSchedule: true,
      canEditCarpool: true,
      canMutate: true,
    },
  },
  {
    id: "event_treasurer",
    label: "行事・会計係",
    badgeTone: "emerald",
    summary: "練習予定・合宿/納会アンケート作成・会費集金チェック・配布資料を担当",
    permissions: {
      canManageTeam: false,
      canManageOps: false,
      canManagePlayers: false,
      canEditScore: false,
      canEditSchedule: true,
      canEditCarpool: false,
      canMutate: true,
    },
  },
  {
    id: "head_coach",
    label: "ヘッドコーチ",
    badgeTone: "rose",
    summary: "監督補佐として運用規定・選手・オーダー・スコア・予定・配車を管理",
    permissions: {
      canManageTeam: false,
      canManageOps: true,
      canManagePlayers: true,
      canEditScore: true,
      canEditSchedule: true,
      canEditCarpool: true,
      canMutate: true,
    },
  },
  {
    id: "umpire_chief",
    label: "審判部長",
    badgeTone: "primary",
    summary: "試合規定・ルール資料・活動予定やグラウンド注意事項の整備を担当",
    permissions: {
      canManageTeam: false,
      canManageOps: true,
      canManagePlayers: false,
      canEditScore: false,
      canEditSchedule: true,
      canEditCarpool: false,
      canMutate: true,
    },
  },
  {
    id: "pr_media",
    label: "広報・撮影担当",
    badgeTone: "primary",
    summary: "写真アルバム共有・応援歌コール・関連リンク集や案内資料の更新を担当",
    permissions: {
      canManageTeam: false,
      canManageOps: false,
      canManagePlayers: false,
      canEditScore: false,
      canEditSchedule: true,
      canEditCarpool: false,
      canMutate: true,
    },
  },
  {
    id: "team_captain",
    label: "キャプテン",
    badgeTone: "primary",
    summary: "草野球・学生チームの出欠調整・スタメン編成・スコア記録を担当",
    permissions: {
      canManageTeam: false,
      canManageOps: false,
      canManagePlayers: false,
      canEditScore: true,
      canEditSchedule: true,
      canEditCarpool: false,
      canMutate: true,
    },
  },
];

export interface TeamRoleDefinition {
  role: string;
  isBuiltin: boolean;
  defaultLabel: string;
  customLabel: string;
  label: string;
  badgeTone: RoleBadgeTone;
  summary: string;
  priority: number;
  lockManageTeamOn: boolean;
  permissions: RolePermissions;
}

export interface StoredBuiltinRoleOverride {
  customLabel?: string;
  badgeTone?: RoleBadgeTone;
  summary?: string;
  permissions?: Partial<RolePermissions>;
}

export interface StoredCustomRoleEntry {
  role: string;
  label: string;
  badgeTone?: RoleBadgeTone;
  summary?: string;
  permissions?: Partial<RolePermissions>;
}

export interface TeamRolePermissionsStoredJson {
  version: 1;
  builtinOverrides?: Record<string, StoredBuiltinRoleOverride>;
  customRoles?: StoredCustomRoleEntry[];
}

export const MAX_CUSTOM_ROLES_PER_TEAM = 20;

const VALID_BADGE_TONES = new Set<RoleBadgeTone>([
  "primary",
  "teal",
  "amber",
  "rose",
  "emerald",
  "slate",
]);

export const BUILTIN_TEAM_ROLES_SET = new Set<string>(
  BUILTIN_ROLE_MASTER_LIST.map((r) => r.role)
);

const BUILTIN_MASTER_BY_KEY = new Map<string, BuiltinRoleMasterItem>(
  BUILTIN_ROLE_MASTER_LIST.map((r) => [r.role, r])
);

// 💡 チームがカスタム設定していない場合のシステムデフォルトの日本語呼称
export const DEFAULT_ROLE_LABELS: Record<Role, string> = {
  [ROLES.ADMIN]: "IT管理者",
  [ROLES.MANAGER]: "監督",
  [ROLES.COACH]: "コーチ",
  [ROLES.SCORER]: "スコアラー",
  [ROLES.STAFF]: "スタッフ",
  [ROLES.PARENT]: "保護者",
  [ROLES.PLAYER]: "選手",
  [ROLES.VIEWER]: "閲覧者",
  [ROLES.PENDING]: "承認待ち",
};

export function sanitizeRoleBadgeTone(
  raw: unknown,
  fallback: RoleBadgeTone = "slate"
): RoleBadgeTone {
  if (typeof raw === "string" && VALID_BADGE_TONES.has(raw as RoleBadgeTone)) {
    return raw as RoleBadgeTone;
  }
  return fallback;
}

export function isValidCustomRoleKey(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const clean = raw.trim().toLowerCase();
  if (BUILTIN_TEAM_ROLES_SET.has(clean) || clean === ROLES.PENDING) {
    return false;
  }
  return /^custom_[a-z0-9_]{3,28}$/.test(clean);
}

export function generateCustomRoleKey(): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10).toLowerCase()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toLowerCase();
  return `custom_${rand}`;
}

/**
 * 権限フラグの整合性を保証して正規化する
 * - manager / admin の `canManageTeam` はチーム管理者0名ロックアウト防止のため常時 true 固定
 * - 上位6権限のいずれかが true の場合、API共通書き込みガードとの矛盾を防ぐため `canMutate` も自動的に true に昇格
 */
export function normalizeRolePermissions(
  input: Partial<RolePermissions> | null | undefined,
  fallback: RolePermissions,
  options?: { lockManageTeamOn?: boolean }
): RolePermissions {
  const rawManageTeam = options?.lockManageTeamOn
    ? true
    : typeof input?.canManageTeam === "boolean"
    ? input.canManageTeam
    : fallback.canManageTeam;
  const canManageOps =
    typeof input?.canManageOps === "boolean"
      ? input.canManageOps
      : fallback.canManageOps;
  const canManagePlayers =
    typeof input?.canManagePlayers === "boolean"
      ? input.canManagePlayers
      : fallback.canManagePlayers;
  const canEditScore =
    typeof input?.canEditScore === "boolean"
      ? input.canEditScore
      : fallback.canEditScore;
  const canEditSchedule =
    typeof input?.canEditSchedule === "boolean"
      ? input.canEditSchedule
      : fallback.canEditSchedule;
  const canEditCarpool =
    typeof input?.canEditCarpool === "boolean"
      ? input.canEditCarpool
      : fallback.canEditCarpool;
  const rawMutate =
    typeof input?.canMutate === "boolean" ? input.canMutate : fallback.canMutate;

  const hasAnyUpperPermission =
    rawManageTeam ||
    canManageOps ||
    canManagePlayers ||
    canEditScore ||
    canEditSchedule ||
    canEditCarpool;

  return {
    canManageTeam: rawManageTeam,
    canManageOps,
    canManagePlayers,
    canEditScore,
    canEditSchedule,
    canEditCarpool,
    canMutate: hasAnyUpperPermission ? true : rawMutate,
  };
}

export const EMPTY_ROLE_PERMISSIONS: RolePermissions = {
  canManageTeam: false,
  canManageOps: false,
  canManagePlayers: false,
  canEditScore: false,
  canEditSchedule: false,
  canEditCarpool: false,
  canMutate: false,
};

export const FULL_ADMIN_ROLE_PERMISSIONS: RolePermissions = {
  canManageTeam: true,
  canManageOps: true,
  canManagePlayers: true,
  canEditScore: true,
  canEditSchedule: true,
  canEditCarpool: true,
  canMutate: true,
};

/**
 * D1 の `teams.role_permissions_json` および既存の `team_role_settings` 行から、
 * 規定8役職 ＋ チーム独自役職の完全な定義リストを復元する
 */
export function parseTeamRoleDefinitions(
  rawJson?: string | TeamRolePermissionsStoredJson | TeamRoleDefinition[] | null,
  legacyRoleSettings?: ReadonlyArray<CustomRoleSetting> | null
): TeamRoleDefinition[] {
  const legacyLabels = new Map<string, string>();
  if (Array.isArray(legacyRoleSettings)) {
    for (const item of legacyRoleSettings) {
      const k = String(item?.role || "").trim().toLowerCase();
      const lbl = String(item?.customLabel || "").trim().slice(0, 20);
      if (k && lbl) {
        legacyLabels.set(k, lbl);
      }
    }
  }

  // 既に TeamRoleDefinition[] が渡された場合の正規化対応
  if (Array.isArray(rawJson)) {
    return sanitizeIncomingRoleDefinitionsList(rawJson, legacyLabels);
  }

  let parsed: TeamRolePermissionsStoredJson | null = null;
  if (typeof rawJson === "string" && rawJson.trim().startsWith("{")) {
    try {
      const obj = JSON.parse(rawJson) as unknown;
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        parsed = obj as TeamRolePermissionsStoredJson;
      }
    } catch {
      parsed = null;
    }
  } else if (rawJson && typeof rawJson === "object" && !Array.isArray(rawJson)) {
    parsed = rawJson;
  }

  const overrides =
    parsed?.builtinOverrides && typeof parsed.builtinOverrides === "object"
      ? parsed.builtinOverrides
      : {};

  const result: TeamRoleDefinition[] = BUILTIN_ROLE_MASTER_LIST.map((master) => {
    const ov = overrides[master.role];
    const rawCustomLabel =
      typeof ov?.customLabel === "string"
        ? ov.customLabel.trim().slice(0, 20)
        : legacyLabels.get(master.role) || "";
    const customLabel =
      rawCustomLabel && rawCustomLabel !== master.defaultLabel
        ? rawCustomLabel
        : "";
    const label = customLabel || master.defaultLabel;
    const summary =
      typeof ov?.summary === "string" && ov.summary.trim()
        ? ov.summary.trim().slice(0, 80)
        : master.summary;
    return {
      role: master.role,
      isBuiltin: true,
      defaultLabel: master.defaultLabel,
      customLabel,
      label,
      badgeTone: sanitizeRoleBadgeTone(ov?.badgeTone, master.badgeTone),
      summary,
      priority: master.priority,
      lockManageTeamOn: Boolean(master.lockManageTeamOn),
      permissions: normalizeRolePermissions(
        ov?.permissions,
        master.defaultPermissions,
        { lockManageTeamOn: master.lockManageTeamOn }
      ),
    };
  });

  const seenKeys = new Set<string>(result.map((r) => r.role));
  const rawCustomList = Array.isArray(parsed?.customRoles)
    ? parsed.customRoles
    : [];

  let customIdx = 0;
  for (const item of rawCustomList) {
    if (customIdx >= MAX_CUSTOM_ROLES_PER_TEAM) break;
    const key = String(item?.role || "").trim().toLowerCase();
    const label = String(item?.label || legacyLabels.get(key) || "")
      .trim()
      .slice(0, 20);
    if (!isValidCustomRoleKey(key) || seenKeys.has(key) || !label) continue;
    seenKeys.add(key);

    const perms = normalizeRolePermissions(item?.permissions, {
      canManageTeam: false,
      canManageOps: false,
      canManagePlayers: false,
      canEditScore: false,
      canEditSchedule: false,
      canEditCarpool: false,
      canMutate: true,
    });

    // 指導・管理系権限を持つカスタム役職はメンバー一覧の上位に、一般係は中間に配置
    const computedPriority = perms.canManageTeam
      ? 1.5
      : perms.canManageOps || perms.canManagePlayers || perms.canEditScore
      ? 4.5
      : perms.canEditSchedule || perms.canEditCarpool
      ? 10 + customIdx * 0.01
      : 25 + customIdx * 0.01;

    result.push({
      role: key,
      isBuiltin: false,
      defaultLabel: label,
      customLabel: label,
      label,
      badgeTone: sanitizeRoleBadgeTone(item?.badgeTone, "teal"),
      summary: String(item?.summary || "").trim().slice(0, 80) || "チーム独自の役職",
      priority: computedPriority,
      lockManageTeamOn: false,
      permissions: perms,
    });
    customIdx += 1;
  }

  return result;
}

function sanitizeIncomingRoleDefinitionsList(
  list: ReadonlyArray<Partial<TeamRoleDefinition>>,
  legacyLabels: Map<string, string>
): TeamRoleDefinition[] {
  const byKey = new Map<string, Partial<TeamRoleDefinition>>();
  for (const item of list) {
    const k = String(item?.role || "").trim().toLowerCase();
    if (k) byKey.set(k, item);
  }

  const builtinOverrides: Record<string, StoredBuiltinRoleOverride> = {};
  for (const master of BUILTIN_ROLE_MASTER_LIST) {
    const incoming = byKey.get(master.role);
    if (incoming) {
      const candidateCustom = String(
        incoming.customLabel ??
          (incoming.label && incoming.label !== master.defaultLabel
            ? incoming.label
            : "") ??
          legacyLabels.get(master.role) ??
          ""
      )
        .trim()
        .slice(0, 20);
      builtinOverrides[master.role] = {
        customLabel: candidateCustom,
        badgeTone: incoming.badgeTone,
        summary: incoming.summary,
        permissions: incoming.permissions,
      };
    } else if (legacyLabels.has(master.role)) {
      builtinOverrides[master.role] = {
        customLabel: legacyLabels.get(master.role),
      };
    }
  }

  const customRoles: StoredCustomRoleEntry[] = [];
  for (const item of list) {
    const key = String(item?.role || "").trim().toLowerCase();
    if (!isValidCustomRoleKey(key)) continue;
    const label = String(item?.label || item?.customLabel || item?.defaultLabel || "")
      .trim()
      .slice(0, 20);
    if (!label) continue;
    customRoles.push({
      role: key,
      label,
      badgeTone: item?.badgeTone,
      summary: item?.summary,
      permissions: item?.permissions,
    });
    if (customRoles.length >= MAX_CUSTOM_ROLES_PER_TEAM) break;
  }

  return parseTeamRoleDefinitions(
    {
      version: 1,
      builtinOverrides,
      customRoles,
    },
    null
  );
}

/**
 * 正規化済み `TeamRoleDefinition[]` を D1 `teams.role_permissions_json` 保存用JSON文字列へ変換する
 */
export function serializeTeamRolePermissionsJson(
  definitions: ReadonlyArray<Partial<TeamRoleDefinition>>
): {
  json: string;
  normalizedDefinitions: TeamRoleDefinition[];
  roleSettingsRows: CustomRoleSetting[];
} {
  const normalized = sanitizeIncomingRoleDefinitionsList(definitions, new Map());
  const builtinOverrides: Record<string, StoredBuiltinRoleOverride> = {};
  const customRoles: StoredCustomRoleEntry[] = [];
  const roleSettingsRows: CustomRoleSetting[] = [];

  for (const def of normalized) {
    if (def.isBuiltin) {
      const master = BUILTIN_MASTER_BY_KEY.get(def.role);
      if (!master) continue;
      const hasCustomLabel =
        Boolean(def.customLabel) && def.customLabel !== master.defaultLabel;
      const hasPermDiff = isPermissionsDifferent(
        def.permissions,
        master.defaultPermissions
      );
      const hasToneDiff = def.badgeTone !== master.badgeTone;
      const hasSummaryDiff =
        Boolean(def.summary) && def.summary !== master.summary;

      if (hasCustomLabel || hasPermDiff || hasToneDiff || hasSummaryDiff) {
        builtinOverrides[def.role] = {
          ...(hasCustomLabel ? { customLabel: def.customLabel } : {}),
          ...(hasToneDiff ? { badgeTone: def.badgeTone } : {}),
          ...(hasSummaryDiff ? { summary: def.summary } : {}),
          ...(hasPermDiff ? { permissions: def.permissions } : {}),
        };
      }
      if (hasCustomLabel) {
        roleSettingsRows.push({
          role: def.role,
          customLabel: def.customLabel,
        });
      }
    } else {
      customRoles.push({
        role: def.role,
        label: def.label,
        badgeTone: def.badgeTone,
        summary: def.summary,
        permissions: def.permissions,
      });
      roleSettingsRows.push({
        role: def.role,
        customLabel: def.label,
      });
    }
  }

  const stored: TeamRolePermissionsStoredJson = {
    version: 1,
    builtinOverrides,
    customRoles,
  };

  return {
    json: JSON.stringify(stored),
    normalizedDefinitions: normalized,
    roleSettingsRows,
  };
}

export function isPermissionsDifferent(
  a: RolePermissions,
  b: RolePermissions
): boolean {
  return (
    a.canManageTeam !== b.canManageTeam ||
    a.canManageOps !== b.canManageOps ||
    a.canManagePlayers !== b.canManagePlayers ||
    a.canEditScore !== b.canEditScore ||
    a.canEditSchedule !== b.canEditSchedule ||
    a.canEditCarpool !== b.canEditCarpool ||
    a.canMutate !== b.canMutate
  );
}

export function isBuiltinRoleModifiedFromDefault(
  def: TeamRoleDefinition
): boolean {
  if (!def.isBuiltin) return true;
  const master = BUILTIN_MASTER_BY_KEY.get(def.role);
  if (!master) return false;
  if (def.customLabel && def.customLabel !== master.defaultLabel) return true;
  return isPermissionsDifferent(def.permissions, master.defaultPermissions);
}

export function isValidTeamRoleKey(
  roleKey: string | null | undefined,
  definitions?: ReadonlyArray<TeamRoleDefinition> | null
): boolean {
  if (!roleKey) return false;
  const clean = roleKey.trim().toLowerCase();
  if (BUILTIN_TEAM_ROLES_SET.has(clean)) return true;
  if (definitions && Array.isArray(definitions)) {
    return definitions.some((d) => d.role.toLowerCase() === clean);
  }
  return false;
}

/**
 * メンバーの主役職 + 兼務ロール配列から、そのチームの役職定義に基づく実効権限（OR合算）を計算する
 */
export function evaluateEffectiveRolePermissions(
  role: string | null | undefined,
  subRoles?: ReadonlyArray<string> | null,
  definitions?: ReadonlyArray<TeamRoleDefinition> | null
): RolePermissions {
  const defs =
    definitions && definitions.length > 0
      ? definitions
      : parseTeamRoleDefinitions(null, null);
  const defByKey = new Map<string, TeamRoleDefinition>();
  for (const d of defs) {
    defByKey.set(d.role.toLowerCase(), d);
  }

  const candidateKeys: string[] = [];
  if (role && role.trim()) {
    const primary = role.trim().toLowerCase();
    if (primary === ROLES.PENDING) {
      return { ...EMPTY_ROLE_PERMISSIONS };
    }
    candidateKeys.push(primary);
  }
  if (Array.isArray(subRoles)) {
    for (const sr of subRoles) {
      const clean = String(sr || "").trim().toLowerCase();
      if (clean && clean !== ROLES.PENDING && !candidateKeys.includes(clean)) {
        candidateKeys.push(clean);
      }
    }
  }

  if (candidateKeys.length === 0) {
    return { ...EMPTY_ROLE_PERMISSIONS };
  }

  const merged: RolePermissions = { ...EMPTY_ROLE_PERMISSIONS };
  let matchedAny = false;

  for (const key of candidateKeys) {
    const found = defByKey.get(key);
    if (!found) continue;
    matchedAny = true;
    merged.canManageTeam = merged.canManageTeam || found.permissions.canManageTeam;
    merged.canManageOps = merged.canManageOps || found.permissions.canManageOps;
    merged.canManagePlayers =
      merged.canManagePlayers || found.permissions.canManagePlayers;
    merged.canEditScore = merged.canEditScore || found.permissions.canEditScore;
    merged.canEditSchedule =
      merged.canEditSchedule || found.permissions.canEditSchedule;
    merged.canEditCarpool =
      merged.canEditCarpool || found.permissions.canEditCarpool;
    merged.canMutate = merged.canMutate || found.permissions.canMutate;
  }

  // 万一削除済みカスタムロールID等が残っていた場合は parent 相当へ安全フォールバック
  if (!matchedAny) {
    const parentDef = defByKey.get(ROLES.PARENT);
    if (parentDef) {
      return { ...parentDef.permissions };
    }
    return {
      ...EMPTY_ROLE_PERMISSIONS,
      canMutate: true,
    };
  }

  return normalizeRolePermissions(merged, EMPTY_ROLE_PERMISSIONS);
}

/**
 * 💡 チーム固有のカスタム設定（およびカスタム役職定義）を考慮して、正しい日本語表示ラベルを返す共通関数
 */
export function resolveRoleLabel(
  role: string | null | undefined,
  customSettings?:
    | ReadonlyArray<CustomRoleSetting | TeamRoleDefinition>
    | null
): string {
  if (!role) return "メンバー";

  const normalizedRole = role.trim().toLowerCase();
  if (!normalizedRole) return "メンバー";

  if (customSettings && Array.isArray(customSettings)) {
    for (const s of customSettings) {
      if (s.role.toLowerCase() !== normalizedRole) continue;
      if ("label" in s && typeof s.label === "string" && s.label.trim()) {
        return s.label.trim();
      }
      if (typeof s.customLabel === "string" && s.customLabel.trim()) {
        return s.customLabel.trim();
      }
    }
  }

  const builtinMaster = BUILTIN_MASTER_BY_KEY.get(normalizedRole);
  if (builtinMaster) {
    return DEFAULT_ROLE_LABELS[normalizedRole as Role] ?? builtinMaster.defaultLabel;
  }

  return DEFAULT_ROLE_LABELS[normalizedRole as Role] ?? "メンバー";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 💡 各アクションに対する権限チェック用のヘルパー関数（後方互換 + 役職定義連動対応）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const isApprovedMember = (role?: string | null): boolean => {
  if (!role) return false;
  return role.trim().toLowerCase() !== ROLES.PENDING;
};

export const canManageSystem = (
  role?: string | null,
  subRoles?: string[] | null
): boolean => {
  if (!role) return false;
  if (role.toLowerCase() === ROLES.ADMIN) return true;
  if (subRoles && Array.isArray(subRoles)) {
    return subRoles.some((sr) => sr.toLowerCase() === ROLES.ADMIN);
  }
  return false;
};

export const canManageTeam = (
  role?: string | null,
  subRoles?: string[] | null,
  definitions?: ReadonlyArray<TeamRoleDefinition> | null
): boolean => {
  return evaluateEffectiveRolePermissions(role, subRoles, definitions).canManageTeam;
};

export const canEditScore = (
  role?: string | null,
  subRoles?: string[] | null,
  definitions?: ReadonlyArray<TeamRoleDefinition> | null
): boolean => {
  return evaluateEffectiveRolePermissions(role, subRoles, definitions).canEditScore;
};

export const canViewInternalData = (
  role?: string | null,
  subRoles?: string[] | null,
  definitions?: ReadonlyArray<TeamRoleDefinition> | null
): boolean => {
  return evaluateEffectiveRolePermissions(role, subRoles, definitions).canMutate;
};
