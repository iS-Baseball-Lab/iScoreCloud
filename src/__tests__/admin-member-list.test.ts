// filepath: src/__tests__/admin-member-list.test.ts

import { describe, expect, it } from "vitest";
import {
  classifyAdminMemberCategory,
  computeAdminMemberFilterCounts,
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
    subRoles: [],
    subLabel: "",
    isLineLinked: true,
  },
  {
    memberId: "m-carpool-parent",
    userId: "u-2",
    name: "佐藤 美咲",
    nameKana: "", // ふりがな未入力（紐付け選手から自動補完される想定）
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

describe("admin-member-list helpers", () => {
  it("classifies members into 4 disjoint categories and counts unlinked accurately", () => {
    expect(
      classifyAdminMemberCategory(sampleMembers[0], sampleRoleDefs)
    ).toBe("managers");
    // 保護者＋兼務「配車係」（canEditCarpool: true）は指導者・運営係セクションへ
    expect(
      classifyAdminMemberCategory(sampleMembers[1], sampleRoleDefs)
    ).toBe("coaches_ops");
    expect(
      classifyAdminMemberCategory(sampleMembers[2], sampleRoleDefs)
    ).toBe("parents");
    // 選手＋兼務「キャプテン」（一般権限のみ）は選手・閲覧セクションを維持
    expect(
      classifyAdminMemberCategory(sampleMembers[4], sampleRoleDefs)
    ).toBe("players_others");

    const counts = computeAdminMemberFilterCounts(
      sampleMembers,
      sampleRoleDefs
    );
    expect(counts).toEqual({
      all: 5,
      managers: 1,
      coaches_ops: 1,
      parents: 2,
      players_others: 1,
      unlinked: 1,
    });
    expect(
      counts.managers +
        counts.coaches_ops +
        counts.parents +
        counts.players_others
    ).toBe(counts.all);
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

    const onlyUnlinked = filterAdminMembers(sampleMembers, {
      filter: "unlinked",
      searchQuery: "",
      roleDefinitions: sampleRoleDefs,
    });
    expect(onlyUnlinked.map((m) => m.memberId)).toEqual(["m-parent-1"]);
  });

  it("groups by Gojuon (kana) row and infers missing parent reading from linked child", () => {
    const sections = groupAndSortAdminMembers(sampleMembers, {
      sortMode: "kana",
      roleDefinitions: sampleRoleDefs,
    });

    expect(sections.map((s) => s.title)).toEqual(["あ行", "さ行", "た行"]);
    // 佐藤 美咲（かな未入力）もお子様「サトウ レン」から「さ行」へ自動分類され、サトウ -> スズキ順に並ぶ
    const saRowNames = sections[1]?.members.map((m) => m.name);
    expect(saRowNames).toEqual(["佐藤 美咲", "鈴木 翔太", "鈴木 父"]);
  });

  it("groups by duty label respecting preset order, natural numeric order, and unassigned last", () => {
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
  });

  it("formats compact avatar monograms and linked child badges cleanly", () => {
    expect(resolveMemberAvatarMonogram(sampleMembers[0])).toBe("田中");
    expect(resolveMemberAvatarMonogram(sampleMembers[4])).toBe("#10");

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
