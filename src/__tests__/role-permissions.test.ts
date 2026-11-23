// filepath: src/__tests__/role-permissions.test.ts

import { describe, expect, it } from "vitest";
import {
  CUSTOM_ROLE_PRESETS,
  ROLES,
  evaluateEffectiveRolePermissions,
  generateCustomRoleKey,
  isBuiltinRoleModifiedFromDefault,
  isValidCustomRoleKey,
  isValidTeamRoleKey,
  normalizeRolePermissions,
  parseTeamRoleDefinitions,
  resolveRoleLabel,
  serializeTeamRolePermissionsJson,
  type TeamRoleDefinition,
} from "@/lib/roles";
import {
  canEditCarpoolCurrentTeam,
  canEditScheduleCurrentTeam,
  canManageOpsCurrentTeam,
  canMutateCurrentTeam,
  type LiffTeamItem,
} from "@/components/liff/LiffProvider";

describe("7軸チーム権限モデル & カスタム役職定義 (src/lib/roles.ts)", () => {
  it("規定初期値では 保護者(parent) と 選手(player) は 運用・規定(canManageOps) や 配車編成(canEditCarpool) を持たず 一般操作(canMutate) のみ有効", () => {
    const defs = parseTeamRoleDefinitions(null, null);

    const parentPerms = evaluateEffectiveRolePermissions(
      ROLES.PARENT,
      [],
      defs
    );
    expect(parentPerms).toEqual({
      canManageTeam: false,
      canManageOps: false,
      canManagePlayers: false,
      canEditScore: false,
      canEditSchedule: false,
      canEditCarpool: false,
      canMutate: true,
    });

    const playerPerms = evaluateEffectiveRolePermissions(
      ROLES.PLAYER,
      [],
      defs
    );
    expect(playerPerms).toEqual({
      canManageTeam: false,
      canManageOps: false,
      canManagePlayers: false,
      canEditScore: false,
      canEditSchedule: false,
      canEditCarpool: false,
      canMutate: true,
    });

    const viewerPerms = evaluateEffectiveRolePermissions(
      ROLES.VIEWER,
      [],
      defs
    );
    expect(viewerPerms).toEqual({
      canManageTeam: false,
      canManageOps: false,
      canManagePlayers: false,
      canEditScore: false,
      canEditSchedule: false,
      canEditCarpool: false,
      canMutate: false,
    });
  });

  it("監督(manager)・IT管理者(admin) の canManageTeam はロックアウト防止のため OFF 指定でも強制的に ON を維持する", () => {
    const baseDefs = parseTeamRoleDefinitions(null, null);
    const attemptedDisable = baseDefs.map((d) =>
      d.role === ROLES.MANAGER || d.role === ROLES.ADMIN
        ? {
            ...d,
            permissions: {
              ...d.permissions,
              canManageTeam: false,
              canManageOps: false,
            },
          }
        : d
    );

    const { json } = serializeTeamRolePermissionsJson(attemptedDisable);
    const restored = parseTeamRoleDefinitions(json, null);

    const managerDef = restored.find((d) => d.role === ROLES.MANAGER)!;
    const adminDef = restored.find((d) => d.role === ROLES.ADMIN)!;

    expect(managerDef.permissions.canManageTeam).toBe(true);
    expect(adminDef.permissions.canManageTeam).toBe(true);
    // canManageTeam 以外の権限スイッチはチーム事情に合わせて調整可能
    expect(managerDef.permissions.canManageOps).toBe(false);
    expect(isBuiltinRoleModifiedFromDefault(managerDef)).toBe(true);
  });

  it("上位6権限のいずれかが true の場合、API共通ガードとの整合性のため canMutate も自動的に true へ昇格する", () => {
    const normalized = normalizeRolePermissions(
      {
        canManageTeam: false,
        canManageOps: false,
        canManagePlayers: false,
        canEditScore: false,
        canEditSchedule: false,
        canEditCarpool: true,
        canMutate: false,
      },
      {
        canManageTeam: false,
        canManageOps: false,
        canManagePlayers: false,
        canEditScore: false,
        canEditSchedule: false,
        canEditCarpool: false,
        canMutate: false,
      }
    );

    expect(normalized.canEditCarpool).toBe(true);
    expect(normalized.canMutate).toBe(true);
  });

  it("チーム独自の役職（例: 配車係）を追加・保存・復元し、予定編集とは独立して配車編成権限のみを付与できる", () => {
    const carpoolPreset = CUSTOM_ROLE_PRESETS.find(
      (p) => p.id === "carpool_coordinator"
    )!;
    expect(carpoolPreset).toBeDefined();

    const customKey = generateCustomRoleKey();
    expect(isValidCustomRoleKey(customKey)).toBe(true);
    expect(isValidCustomRoleKey("manager")).toBe(false);

    const baseDefs = parseTeamRoleDefinitions(null, null);
    const customDef: TeamRoleDefinition = {
      role: customKey,
      isBuiltin: false,
      defaultLabel: carpoolPreset.label,
      customLabel: carpoolPreset.label,
      label: carpoolPreset.label,
      badgeTone: carpoolPreset.badgeTone,
      summary: carpoolPreset.summary,
      priority: 10,
      lockManageTeamOn: false,
      permissions: { ...carpoolPreset.permissions },
    };

    const { json, roleSettingsRows } = serializeTeamRolePermissionsJson([
      ...baseDefs,
      customDef,
    ]);
    const restored = parseTeamRoleDefinitions(json, roleSettingsRows);

    expect(isValidTeamRoleKey(customKey, restored)).toBe(true);
    expect(resolveRoleLabel(customKey, restored)).toBe("配車係");

    // 「主: 保護者」＋「兼: 配車係」のメンバーの実効権限を検証
    const effective = evaluateEffectiveRolePermissions(
      ROLES.PARENT,
      [customKey],
      restored
    );
    expect(effective.canEditCarpool).toBe(true);
    expect(effective.canEditSchedule).toBe(false);
    expect(effective.canManageOps).toBe(false);
    expect(effective.canManageTeam).toBe(false);
    expect(effective.canMutate).toBe(true);
  });

  it("規定役職の権限カスタマイズ（例: スタッフに 運用・規定 権限を追加、配車編成をOFF）が正しくシリアライズされる", () => {
    const baseDefs = parseTeamRoleDefinitions(null, null);
    const updatedDefs = baseDefs.map((d) =>
      d.role === ROLES.STAFF
        ? {
            ...d,
            customLabel: "事務局スタッフ",
            permissions: {
              ...d.permissions,
              canManageOps: true,
              canEditCarpool: false,
            },
          }
        : d
    );

    const { json } = serializeTeamRolePermissionsJson(updatedDefs);
    const restored = parseTeamRoleDefinitions(json, null);
    const staffEffective = evaluateEffectiveRolePermissions(
      ROLES.STAFF,
      [],
      restored
    );

    expect(resolveRoleLabel(ROLES.STAFF, restored)).toBe("事務局スタッフ");
    expect(staffEffective.canManageOps).toBe(true);
    expect(staffEffective.canEditCarpool).toBe(false);
    expect(staffEffective.canEditSchedule).toBe(true);
  });

  it("削除済みカスタム役職キーがメンバーに残っていた場合でも、管理者権限へ昇格せず保護者相当へ安全にフォールバックする", () => {
    const defs = parseTeamRoleDefinitions(null, null);
    const fallbackPerms = evaluateEffectiveRolePermissions(
      "custom_deleted999",
      [],
      defs
    );

    expect(fallbackPerms.canManageTeam).toBe(false);
    expect(fallbackPerms.canManageOps).toBe(false);
    expect(fallbackPerms.canEditCarpool).toBe(false);
    expect(fallbackPerms.canMutate).toBe(true);
  });

  it("LiffProvider のクライアント権限ヘルパーがサーバー計算フラグおよび規定ロールフォールバックと一致する", () => {
    const parentTeam: LiffTeamItem = {
      id: "team-1",
      name: "テストチーム",
      shortName: "テスト",
      role: "parent",
      subRoles: [],
      canManage: false,
      canManageOps: false,
      canManagePlayers: false,
      canEditScore: false,
      canEditSchedule: false,
      canEditCarpool: false,
      canMutate: true,
      isMember: true,
    };

    expect(canManageOpsCurrentTeam(parentTeam, false)).toBe(false);
    expect(canEditScheduleCurrentTeam(parentTeam, false)).toBe(false);
    expect(canEditCarpoolCurrentTeam(parentTeam, false)).toBe(false);
    expect(canMutateCurrentTeam(parentTeam, false, true)).toBe(true);

    const carpoolCoordinatorTeam: LiffTeamItem = {
      ...parentTeam,
      subRoles: ["custom_carpool01"],
      canEditCarpool: true,
    };

    expect(canManageOpsCurrentTeam(carpoolCoordinatorTeam, false)).toBe(false);
    expect(canEditScheduleCurrentTeam(carpoolCoordinatorTeam, false)).toBe(
      false
    );
    expect(canEditCarpoolCurrentTeam(carpoolCoordinatorTeam, false)).toBe(true);
  });
});
