// filepath: src/__tests__/admin-member-list.test.ts

import { describe, expect, it } from "vitest";
import {
  computeAdminMemberFilterSummary,
  filterAdminMembers,
  formatCompactLinkedChildLabel,
  groupAndSortAdminMembers,
  resolveMemberAvatarMonogram,
  type AdminMemberListItem,
} from "@/lib/liff/admin-member-list";
import {
  EMPTY_ROLE_PERMISSIONS,
  parseTeamRoleDefinitions,
} from "@/lib/roles";

const sampleRoleDefs = parseTeamRoleDefinitions({
  version: 1,
  customRoles: [
    {
      role: "custom_carpool_lead",
      label: "配車係",
      badgeTone: "teal",
      summary: "配車表の編成担当",
      permissions: {
        ...EMPTY_ROLE_PERMISSIONS,
        canEditCarpool: true,
        canMutate: true,
      },
    },
    {
      role: "custom_captain",
      label: "キャプテン",
      badgeTone: "emerald",
      summary: "チーム主将",
      permissions: {
        ...EMPTY_ROLE_PERMISSIONS,
        canMutate: true,
      },
    },
  ],
});

const sampleMembers: AdminMemberListItem[] = [
  {
    memberId: "m-manager",
    userId: "u-1",
    name: "田中 監督",
    nameKana: "タナカ カントク",
    memberType: "staff",
    role: "manager",
    subRoles: ["scorer"],
    subLabel: "",
    isLineLinked: true,
  },
  {
    memberId: "m-coach",
    userId: "u-3",
    name: "高橋 コーチ",
    nameKana: "タカハシ コーチ",
    memberType: "staff",
    role: "coach",
    subRoles: ["scorer", "parent"],
    subLabel: "1班",
    isLineLinked: true,
  },
  {
    memberId: "m-carpool-parent",
    userId: "u-2",
    name: "佐藤 美咲",
    nameKana: "", // ふりがな未入力（紐付け選手から「サトウ」を自動補完）
    memberType: "parent",
    role: "parent",
    subRoles: ["custom_carpool_lead"],
    subLabel: "2班",
    isLineLinked: true,
    linkedChildren: [
      {
        id: "p-8",
        name: "佐藤 蓮",
        nameKana: "サトウ レン",
        uniformNumber: "8",
      },
    ],
  },
  {
    memberId: "m-parent-1",
    userId: null,
    name: "鈴木 父",
    nameKana: "スズキ チチ",
    memberType: "parent",
    role: "parent",
    subRoles: [],
    subLabel: "10班",
    isLineLinked: false,
    linkedChildren: [
      {
        id: "p-10",
        name: "鈴木 翔太",
        nameKana: "スズキ ショウタ",
        uniformNumber: "10",
      },
    ],
  },
  {
    memberId: "m-parent-2",
    userId: "u-4",
    name: "阿部 母",
    nameKana: "アベ ハハ",
    memberType: "parent",
    role: "parent",
    subRoles: [],
    subLabel: "1班",
    isLineLinked: true,
  },
  {
    memberId: "m-player",
    userId: "u-5",
    name: "鈴木 翔太",
    nameKana: "スズキ ショウタ",
    memberType: "player",
    role: "player",
    subRoles: ["custom_captain"],
    subLabel: "",
    isLineLinked: true,
    playerUniformNumber: "10",
  },
];

describe("admin-member-list per-role grouping & ascending name sort", () => {
  it("groups per individual role, shows concurrent members in multiple sections, and sorts by name ascending", () => {
    const sections = groupAndSortAdminMembers(sampleMembers, {
      sortMode: "role",
      roleDefinitions: sampleRoleDefs,
    });

    // 所属者が1名以上いる役職のみ優先度順に並ぶ（配車係は保護者より上、キャプテンは選手より下）
    expect(sections.map((s) => s.title)).toEqual([
      "監督・代表",
      "コーチ",
      "スコアラー",
      "配車係",
      "保護者",
      "選手",
      "キャプテン",
    ]);

    // スコアラーくくり：兼務2名（田中 監督・高橋 コーチ）が両方表示され、名前昇順（たかはし -> たなか）になる
    const scorerSection = sections.find((s) => s.roleKey === "scorer");
    expect(scorerSection?.concurrentCount).toBe(2);
    expect(scorerSection?.members.map((m) => m.name)).toEqual([
      "高橋 コーチ",
      "田中 監督",
    ]);

    // 保護者くくり：主役職3名＋兼務1名（高橋 コーチ）の計4名が、役職優先ではなく純粋な名前昇順（あべ -> さとう -> すずき -> たかはし）で並ぶ
    const parentSection = sections.find((s) => s.roleKey === "parent");
    expect(parentSection?.concurrentCount).toBe(1);
    expect(parentSection?.members.map((m) => m.name)).toEqual([
      "阿部 母",
      "佐藤 美咲",
      "鈴木 父",
      "高橋 コーチ",
    ]);

    // 配車係（独自役職）くくり：兼務の佐藤 美咲が表示される
    const carpoolSection = sections.find(
      (s) => s.roleKey === "custom_carpool_lead"
    );
    expect(carpoolSection?.isCustomRole).toBe(true);
    expect(carpoolSection?.members.map((m) => m.name)).toEqual(["佐藤 美咲"]);
  });

  it("summarizes per-role chip counts including concurrent assignments and filters to a single role section when selected", () => {
    const summary = computeAdminMemberFilterSummary(
      sampleMembers,
      sampleRoleDefs
    );
    expect(summary.totalCount).toBe(6);
    expect(summary.unlinkedCount).toBe(1);
    expect(
      summary.roleChips.map((c) => [c.label, c.count])
    ).toEqual([
      ["監督・代表", 1],
      ["コーチ", 1],
      ["スコアラー", 2],
      ["配車係", 1],
      ["保護者", 4],
      ["選手", 1],
      ["キャプテン", 1],
    ]);

    const filteredScorers = filterAdminMembers(sampleMembers, {
      filter: "role:scorer",
      searchQuery: "",
      roleDefinitions: sampleRoleDefs,
    });
    expect(filteredScorers.map((m) => m.memberId)).toEqual([
      "m-manager",
      "m-coach",
    ]);

    // 特定役職チップで絞り込んだ際は、該当役職セクション1つのみを表示する
    const scorerOnlySections = groupAndSortAdminMembers(filteredScorers, {
      sortMode: "role",
      filter: "role:scorer",
      roleDefinitions: sampleRoleDefs,
      allTeamMembersForKanaHint: sampleMembers,
    });
    expect(scorerOnlySections.map((s) => s.title)).toEqual(["スコアラー"]);
    expect(scorerOnlySections[0]?.members.map((m) => m.name)).toEqual([
      "高橋 コーチ",
      "田中 監督",
    ]);
  });

  it("filters members by custom role label and linked child uniform/name", () => {
    const byCustomRole = filterAdminMembers(sampleMembers, {
      filter: "all",
      searchQuery: "配車係",
      roleDefinitions: sampleRoleDefs,
    });
    expect(byCustomRole.map((m) => m.memberId)).toEqual(["m-carpool-parent"]);

    const byChildUniform = filterAdminMembers(sampleMembers, {
      filter: "all",
      searchQuery: "#8",
      roleDefinitions: sampleRoleDefs,
    });
    expect(byChildUniform.map((m) => m.memberId)).toEqual(["m-carpool-parent"]);
  });

  it("groups by Gojuon (kana) row and sorts strictly by name ascending", () => {
    const sections = groupAndSortAdminMembers(sampleMembers, {
      sortMode: "kana",
      roleDefinitions: sampleRoleDefs,
    });

    expect(sections.map((s) => s.title)).toEqual(["あ行", "さ行", "た行"]);
    const saRowNames = sections[1]?.members.map((m) => m.name);
    expect(saRowNames).toEqual(["佐藤 美咲", "鈴木 翔太", "鈴木 父"]);
    const taRowNames = sections[2]?.members.map((m) => m.name);
    expect(taRowNames).toEqual(["高橋 コーチ", "田中 監督"]);
  });

  it("groups by duty label and sorts members inside each duty group by name ascending", () => {
    const sections = groupAndSortAdminMembers(sampleMembers, {
      sortMode: "duty",
      roleDefinitions: sampleRoleDefs,
      presetDutyGroups: ["1班", "2班"],
    });

    expect(sections.map((s) => s.title)).toEqual([
      "1班",
      "2班",
      "10班",
      "班・担当ラベル未設定",
    ]);
    // 1班の中も役職ではなく名前の昇順（あべ -> たかはし）
    expect(sections[0]?.members.map((m) => m.name)).toEqual([
      "阿部 母",
      "高橋 コーチ",
    ]);
  });

  it("formats compact avatar monograms and linked child badges cleanly", () => {
    expect(resolveMemberAvatarMonogram(sampleMembers[0])).toBe("田中");
    expect(resolveMemberAvatarMonogram(sampleMembers[5])).toBe("#10");

    expect(
      formatCompactLinkedChildLabel("鈴木 父", {
        id: "p-10",
        name: "鈴木 翔太",
        uniformNumber: "10",
      })
    ).toBe("#10 翔太");

    expect(
      formatCompactLinkedChildLabel("山田 母", {
        id: "p-10",
        name: "鈴木 翔太",
        uniformNumber: "10",
      })
    ).toBe("#10 鈴木翔太");
  });
});
