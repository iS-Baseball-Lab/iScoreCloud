// filepath: src/__tests__/match-day-ops.test.ts

import { describe, expect, it } from "vitest";
import {
  DEFAULT_MATCH_STAFF_ROLES,
  buildPreMatchAnnouncementShareText,
  findMyAssignedStaffRoles,
  getConfiguredStaffRoles,
  getFilledStaffRoles,
  hasAnyGuidebookContent,
  isNoneAssigneeToken,
  normalizeUnifiedStaffRoles,
  parseMatchDayOpsJson,
  splitPresetAndCustomStaffRoles,
} from "@/lib/liff/match-day-ops";
import type { MatchDayOps } from "@/types/match";

describe("match-day-ops role 'none' (なし) handling", () => {
  it("recognizes none tokens accurately", () => {
    expect(isNoneAssigneeToken("なし")).toBe(true);
    expect(isNoneAssigneeToken(" 不要 ")).toBe(true);
    expect(isNoneAssigneeToken("担当なし")).toBe(true);
    expect(isNoneAssigneeToken("山田 父")).toBe(false);
  });

  it("preserves explicit isNone on preset roles and converts free-text 'なし' to isNone", () => {
    const json = JSON.stringify({
      staffRoles: [
        { roleKey: "umpire", roleLabel: "審判", assignees: ["山田 父"] },
        { roleKey: "buzzer", roleLabel: "ブザー", assignees: [], isNone: true },
        { roleKey: "announcer_duty", roleLabel: "アナウンス・当番", assignees: ["不要"] },
        // 未入力かつ isNone でない固定枠は保存対象から除外される
        { roleKey: "video_camera", roleLabel: "動画撮影", assignees: [] },
      ],
    });

    const parsed = parseMatchDayOpsJson(json);
    expect(parsed.staffRoles).toHaveLength(3);

    const umpire = parsed.staffRoles?.find((r) => r.roleKey === "umpire");
    expect(umpire).toEqual({
      roleKey: "umpire",
      roleLabel: "審判",
      assignees: ["山田 父"],
      note: undefined,
      isNone: undefined,
    });

    const buzzer = parsed.staffRoles?.find((r) => r.roleKey === "buzzer");
    expect(buzzer).toEqual({
      roleKey: "buzzer",
      roleLabel: "ブザー",
      assignees: [],
      note: undefined,
      isNone: true,
    });

    const announcer = parsed.staffRoles?.find(
      (r) => r.roleKey === "announcer_duty"
    );
    expect(announcer).toEqual({
      roleKey: "announcer_duty",
      roleLabel: "アナウンス・当番",
      assignees: [],
      note: undefined,
      isNone: true,
    });
  });

  it("enforces mutual exclusivity when real assignees exist alongside isNone or 'なし'", () => {
    const normalized = normalizeUnifiedStaffRoles([
      {
        roleKey: "scorer",
        roleLabel: "スコアラー",
        assignees: ["なし", "佐藤 母"],
        isNone: true,
      },
      {
        roleKey: "plate_umpire",
        roleLabel: "球審",
        assignees: [],
        isNone: true,
      },
      {
        roleKey: "base_umpire",
        roleLabel: "塁審",
        assignees: ["鈴木 父"],
      },
    ]);

    const scorer = normalized.find((r) => r.roleKey === "scorer");
    expect(scorer?.assignees).toEqual(["佐藤 母"]);
    expect(scorer?.isNone).toBeUndefined();

    const umpire = normalized.find((r) => r.roleKey === "umpire");
    expect(umpire?.assignees).toEqual(["鈴木 父"]);
    expect(umpire?.isNone).toBeUndefined();
  });

  it("computes activePresetCount, nonePresetCount, and isAllRolesNone accurately", () => {
    const partialOps: MatchDayOps = {
      staffRoles: [
        { roleKey: "umpire", roleLabel: "審判", assignees: ["山田 父"] },
        { roleKey: "scorer", roleLabel: "スコアラー", assignees: ["佐藤 母"] },
        { roleKey: "buzzer", roleLabel: "ブザー", assignees: [], isNone: true },
        {
          roleKey: "announcer_duty",
          roleLabel: "アナウンス・当番",
          assignees: [],
          isNone: true,
        },
        {
          roleKey: "bso_board",
          roleLabel: "BSO・得点板",
          assignees: [],
          isNone: true,
        },
      ],
    };

    const partialSplit = splitPresetAndCustomStaffRoles(partialOps);
    expect(partialSplit.assignedPresetCount).toBe(2);
    expect(partialSplit.nonePresetCount).toBe(3);
    expect(partialSplit.activePresetCount).toBe(4);
    expect(partialSplit.isAllRolesNone).toBe(false);

    const allNoneOps: MatchDayOps = {
      staffRoles: DEFAULT_MATCH_STAFF_ROLES.map((r) => ({
        roleKey: r.roleKey,
        roleLabel: r.roleLabel,
        assignees: [],
        isNone: true,
      })),
    };

    const allNoneSplit = splitPresetAndCustomStaffRoles(allNoneOps);
    expect(allNoneSplit.assignedPresetCount).toBe(0);
    expect(allNoneSplit.nonePresetCount).toBe(DEFAULT_MATCH_STAFF_ROLES.length);
    expect(allNoneSplit.activePresetCount).toBe(0);
    expect(allNoneSplit.isAllRolesNone).toBe(true);
  });

  it("separates getFilledStaffRoles (post-match credits) from getConfiguredStaffRoles (pre-match guide)", () => {
    const ops: MatchDayOps = {
      staffRoles: [
        { roleKey: "umpire", roleLabel: "審判", assignees: ["山田 父"] },
        { roleKey: "buzzer", roleLabel: "ブザー", assignees: [], isNone: true },
      ],
    };

    const filled = getFilledStaffRoles(ops);
    expect(filled.map((r) => r.roleKey)).toEqual(["umpire"]);

    const configured = getConfiguredStaffRoles(ops);
    expect(configured.map((r) => r.roleKey)).toEqual(["umpire", "buzzer"]);

    const allNoneOnlyOps: MatchDayOps = {
      staffRoles: DEFAULT_MATCH_STAFF_ROLES.map((r) => ({
        roleKey: r.roleKey,
        roleLabel: r.roleLabel,
        assignees: [],
        isNone: true,
      })),
    };
    expect(getFilledStaffRoles(allNoneOnlyOps)).toHaveLength(0);
    expect(getConfiguredStaffRoles(allNoneOnlyOps)).toHaveLength(
      DEFAULT_MATCH_STAFF_ROLES.length
    );
    expect(hasAnyGuidebookContent(allNoneOnlyOps, null)).toBe(true);

    const myRoles = findMyAssignedStaffRoles(ops, {
      memberId: "m-1",
      memberName: "山田 父",
      displayName: "山田",
      childNames: [],
    });
    expect(myRoles.map((r) => r.roleKey)).toEqual(["umpire"]);
  });

  it("formats LINE pre-match announcement share text for both partial none and all-roles-none", () => {
    const partialText = buildPreMatchAnnouncementShareText({
      opponent: "〇〇クラブ",
      dateText: "2026/11/22(日) 10:00",
      matchTypeLabel: "練習試合",
      inningsLabel: "7回制",
      battingOrderLabel: "先攻",
      ops: {
        staffRoles: [
          { roleKey: "umpire", roleLabel: "審判", assignees: ["山田 父"] },
          {
            roleKey: "buzzer",
            roleLabel: "ブザー",
            assignees: [],
            isNone: true,
          },
          {
            roleKey: "announcer_duty",
            roleLabel: "アナウンス・当番",
            assignees: [],
            note: "本部運営",
            isNone: true,
          },
        ],
      },
    });

    expect(partialText).toContain("━━ 当日の役割担当 ━━");
    expect(partialText).toContain("・審判: 山田 父");
    expect(partialText).toContain("・ブザー: なし");
    expect(partialText).toContain("・アナウンス・当番: なし（本部運営）");

    const allNoneText = buildPreMatchAnnouncementShareText({
      opponent: "〇〇クラブ",
      dateText: "2026/11/22(日) 13:00",
      matchTypeLabel: "公式戦",
      inningsLabel: "7回制",
      battingOrderLabel: "後攻",
      ops: {
        staffRoles: DEFAULT_MATCH_STAFF_ROLES.map((r) => ({
          roleKey: r.roleKey,
          roleLabel: r.roleLabel,
          assignees: [],
          isNone: true,
        })),
      },
    });

    expect(allNoneText).toContain("━━ 当日の役割担当 ━━\n・役割分担: なし");
  });
});
