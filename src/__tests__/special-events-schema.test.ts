// filepath: src/__tests__/special-events-schema.test.ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SPECIAL_EVENT_FEE_TIERS,
  buildDemoSpecialEventsBundle,
  buildSpecialEventAnnouncementLineText,
  buildSpecialEventCsvContent,
  buildSpecialEventHouseholdsAndSummary,
  buildSpecialEventSummaryLineText,
  buildTeamHouseholdUnits,
  formatSpecialEventCompactDeadline,
  formatSpecialEventTickerDeadlineSuffix,
  normalizeCandidateDates,
  normalizeSurveyQuestions,
  type RawSpecialEventResponseRow,
  type SpecialEventDetailItem,
} from "@/lib/liff/special-events-schema";

describe("special-events-schema", () => {
  it("groups sibling players and both parents into a single household unit via Union-Find", () => {
    const { units, myHouseholdKey } = buildTeamHouseholdUnits({
      players: [
        {
          id: "p_taro",
          name: "山田 太郎",
          uniformNumber: "10",
          isActive: true,
          conditionStatus: "active",
        },
        {
          id: "p_jiro",
          name: "山田 次郎",
          uniformNumber: "24",
          isActive: true,
          conditionStatus: "active",
        },
        {
          id: "p_leave",
          name: "田中 翼",
          uniformNumber: "8",
          isActive: true,
          conditionStatus: "on_leave",
        },
      ],
      teamMembers: [
        {
          id: "m_yamada_mom",
          userId: "uid_mom",
          name: "山田 母",
          memberType: "parent",
          role: "parent",
          status: "active",
        },
        {
          id: "m_yamada_dad",
          userId: "uid_dad",
          name: "山田 父",
          memberType: "parent",
          role: "coach",
          status: "active",
        },
        {
          id: "m_tanaka_mom",
          userId: "uid_tanaka",
          name: "田中 母",
          memberType: "parent",
          role: "parent",
          status: "active",
        },
        {
          id: "m_coach_solo",
          userId: "uid_coach",
          name: "佐藤 監督",
          memberType: "staff",
          role: "manager",
          status: "active",
        },
      ],
      relations: [
        { parentId: "m_yamada_mom", childId: "p_taro" },
        { parentId: "m_yamada_mom", childId: "p_jiro" },
        { parentId: "m_yamada_dad", childId: "p_taro" },
        { parentId: "m_tanaka_mom", childId: "p_leave" },
      ],
      candidateUserIds: ["uid_mom"],
      callerUserName: "山田 母",
      dateKey: "2026-12-19",
      todayKey: "2026-11-21",
    });

    // 山田家(1) + 田中家[休部](1) + 佐藤監督(1) = 3世帯
    expect(units).toHaveLength(3);

    const yamadaUnit = units.find((u) => u.householdLabel === "山田 家");
    expect(yamadaUnit).toBeDefined();
    expect(yamadaUnit?.members).toHaveLength(4);
    expect(yamadaUnit?.isAllOnLeave).toBe(false);
    expect(myHouseholdKey).toBe(yamadaUnit?.householdKey);

    const tanakaUnit = units.find((u) => u.householdLabel === "田中 家");
    expect(tanakaUnit?.isAllOnLeave).toBe(true);

    const coachUnit = units.find((u) => u.householdLabel === "佐藤 監督");
    expect(coachUnit?.sortCategory).toBe("staff");

    // スタッフ除外設定（includeStaff: false）時は単独スタッフ（佐藤監督）のみ除外され、
    // お父さんコーチ（山田父）を含む選手世帯（山田家）はそのまま残ることを検証
    const staffExcludedAsCoach = buildTeamHouseholdUnits({
      players: [
        {
          id: "p_taro",
          name: "山田 太郎",
          uniformNumber: "10",
          isActive: true,
          conditionStatus: "active",
        },
        {
          id: "p_jiro",
          name: "山田 次郎",
          uniformNumber: "24",
          isActive: true,
          conditionStatus: "active",
        },
      ],
      teamMembers: [
        {
          id: "m_yamada_dad",
          userId: "uid_dad",
          name: "山田 父",
          memberType: "parent",
          role: "coach",
          status: "active",
        },
        {
          id: "m_coach_solo",
          userId: "uid_coach",
          name: "佐藤 監督",
          memberType: "staff",
          role: "manager",
          status: "active",
        },
      ],
      relations: [
        { parentId: "m_yamada_dad", childId: "p_taro" },
        { parentId: "m_yamada_dad", childId: "p_jiro" },
      ],
      candidateUserIds: ["uid_coach"],
      callerUserName: "佐藤 監督",
      includeStaff: false,
    });

    expect(staffExcludedAsCoach.units).toHaveLength(1);
    expect(staffExcludedAsCoach.units[0]?.householdLabel).toBe("山田 家");
    expect(staffExcludedAsCoach.myHouseholdKey).toBeNull();
    expect(staffExcludedAsCoach.isCallerExcludedStaff).toBe(true);
    expect(staffExcludedAsCoach.excludedStaffHouseholdKeys).toEqual([
      "hh_m_m_coach_solo",
    ]);

    const { households: familyOnlyHouseholds, summary: familyOnlySummary } =
      buildSpecialEventHouseholdsAndSummary({
        units: staffExcludedAsCoach.units,
        excludedStaffHouseholdKeys:
          staffExcludedAsCoach.excludedStaffHouseholdKeys,
        includeStaff: false,
        responseRows: [
          {
            id: "r_staff_stale",
            specialEventId: "ev_family_only",
            householdKey: "hh_m_m_coach_solo",
            householdLabel: "佐藤 監督",
            memberEntriesJson: JSON.stringify([
              {
                entityType: "member",
                entityId: "m_coach_solo",
                name: "佐藤 監督",
                roleGroup: "staff",
                status: "present",
                feeTierId: "adult",
              },
            ]),
            companionsJson: "[]",
            dateVotesJson: "[]",
            surveyAnswersJson: "{}",
            comment: null,
            feePaid: false,
            updatedByUserId: "uid_coach",
            updatedByName: "佐藤 監督",
            updatedAt: "2026-11-24T00:00:00.000Z",
          },
        ],
        mode: "rsvp",
        allowCompanions: false,
        useFeeCalculation: false,
        feeTiers: [],
        candidateDates: [],
        questions: [],
      });
    expect(familyOnlyHouseholds).toHaveLength(1);
    expect(familyOnlyHouseholds[0]?.householdLabel).toBe("山田 家");
    expect(familyOnlySummary.totalHeadcount).toBe(0);
    expect(familyOnlySummary.activeTargetHouseholdCount).toBe(1);
  });

  it("calculates member + sibling/companion headcounts, tier fees, paid progress, and survey summaries", () => {
    const { units } = buildTeamHouseholdUnits({
      players: [
        {
          id: "p1",
          name: "山田 太郎",
          isActive: true,
          conditionStatus: "active",
        },
        {
          id: "p2",
          name: "鈴木 健",
          isActive: true,
          conditionStatus: "active",
        },
      ],
      teamMembers: [
        {
          id: "m1_mom",
          name: "山田 母",
          memberType: "parent",
          role: "parent",
          status: "active",
        },
        {
          id: "m1_dad",
          name: "山田 父",
          memberType: "parent",
          role: "parent",
          status: "active",
        },
        {
          id: "m2_mom",
          name: "鈴木 母",
          memberType: "parent",
          role: "parent",
          status: "active",
        },
      ],
      relations: [
        { parentId: "m1_mom", childId: "p1" },
        { parentId: "m1_dad", childId: "p1" },
        { parentId: "m2_mom", childId: "p2" },
      ],
    });

    const questions = normalizeSurveyQuestions([
      {
        id: "q_drink",
        title: "ドリンク区分",
        type: "single",
        options: ["アルコール", "ソフトドリンク"],
        required: true,
      },
      {
        id: "q_allergy",
        title: "アレルギー",
        type: "text",
        options: [],
        required: false,
      },
    ]);

    const responses: RawSpecialEventResponseRow[] = [
      {
        id: "r1",
        specialEventId: "ev1",
        householdKey: "hh_p_p1",
        householdLabel: "山田 家",
        memberEntriesJson: JSON.stringify([
          {
            entityType: "player",
            entityId: "p1",
            name: "山田 太郎",
            roleGroup: "player",
            status: "present",
            feeTierId: "player",
          },
          {
            entityType: "member",
            entityId: "m1_mom",
            name: "山田 母",
            roleGroup: "mother",
            status: "present",
            feeTierId: "adult",
          },
          {
            entityType: "member",
            entityId: "m1_dad",
            name: "山田 父",
            roleGroup: "father",
            status: "present",
            feeTierId: "adult",
          },
        ]),
        companionsJson: JSON.stringify([
          {
            id: "c1",
            name: "花子",
            relationLabel: "妹",
            feeTierId: "elementary",
            dietaryNote: "卵アレルギー",
          },
          {
            id: "c2",
            name: "蓮",
            relationLabel: "弟",
            feeTierId: "infant_free",
          },
        ]),
        dateVotesJson: "[]",
        surveyAnswersJson: JSON.stringify({
          q_drink: "アルコール",
          q_allergy: "花子：卵抜き希望",
        }),
        comment: "5人で伺います",
        feePaid: true,
        updatedByUserId: "u1",
        updatedByName: "山田 母",
        updatedAt: "2026-11-21T00:00:00.000Z",
      },
      {
        id: "r2",
        specialEventId: "ev1",
        householdKey: "hh_p_p2",
        householdLabel: "鈴木 家",
        memberEntriesJson: JSON.stringify([
          {
            entityType: "player",
            entityId: "p2",
            name: "鈴木 健",
            roleGroup: "player",
            status: "absent",
            feeTierId: "player",
          },
          {
            entityType: "member",
            entityId: "m2_mom",
            name: "鈴木 母",
            roleGroup: "mother",
            status: "absent",
            feeTierId: "adult",
          },
        ]),
        // 全員欠席時に残っていた同伴データは誤集計防止で除外されることを検証
        companionsJson: JSON.stringify([
          {
            id: "c_stale",
            name: "三郎",
            relationLabel: "弟",
            feeTierId: "elementary",
          },
        ]),
        dateVotesJson: "[]",
        surveyAnswersJson: JSON.stringify({
          q_drink: "ソフトドリンク",
        }),
        comment: "旅行のため欠席します",
        feePaid: false,
        updatedByUserId: "u2",
        updatedByName: "鈴木 母",
        updatedAt: "2026-11-21T01:00:00.000Z",
      },
    ];

    const { households, summary } = buildSpecialEventHouseholdsAndSummary({
      units,
      responseRows: responses,
      mode: "rsvp",
      allowCompanions: true,
      useFeeCalculation: true,
      feeTiers: DEFAULT_SPECIAL_EVENT_FEE_TIERS,
      candidateDates: [],
      questions,
    });

    const yamada = households.find((h) => h.householdKey === "hh_p_p1")!;
    expect(yamada.presentMemberCount).toBe(3);
    expect(yamada.companionCount).toBe(2);
    expect(yamada.totalHeadcount).toBe(5);
    // 大人4500*2 + 選手2000*1 + 小学生2000*1 + 乳幼児0*1 = 13000円
    expect(yamada.totalFeeAmount).toBe(13000);

    const suzuki = households.find((h) => h.householdKey === "hh_p_p2")!;
    expect(suzuki.overallState).toBe("absent");
    expect(suzuki.totalHeadcount).toBe(0);
    expect(suzuki.totalFeeAmount).toBe(0);

    expect(summary.totalHeadcount).toBe(5);
    expect(summary.companionCount).toBe(2);
    expect(summary.expectedFeeTotal).toBe(13000);
    expect(summary.paidFeeTotal).toBe(13000);
    expect(summary.dietaryNotes).toHaveLength(1);
    expect(summary.dietaryNotes[0]?.note).toBe("卵アレルギー");
    // 欠席世帯のアンケート回答は集計ノイズ防止のため除外される
    expect(summary.questionSummaries[0]?.optionCounts[0]?.count).toBe(1);
    expect(summary.questionSummaries[0]?.optionCounts[1]?.count).toBe(0);
  });

  it("ranks candidate dates in date_poll mode and generates LINE & CSV outputs with 2-stage deadlines", () => {
    const candidates = normalizeCandidateDates([
      {
        id: "c1",
        dateStr: "2026-12-12",
        startTime: "18:00",
        endTime: "20:00",
        note: "第1候補",
      },
      {
        id: "c2",
        dateStr: "2026-12-19",
        startTime: "18:00",
        endTime: "20:30",
        note: "第2候補",
      },
    ]);
    expect(candidates).toHaveLength(2);

    const demo = buildDemoSpecialEventsBundle();
    const partyEvent: SpecialEventDetailItem = demo.events[0]!;
    const pollEvent: SpecialEventDetailItem = demo.events[1]!;

    expect(partyEvent.summary.totalHeadcount).toBeGreaterThan(0);
    expect(partyEvent.interimDeadlineDate).toBe("2026-11-29");
    expect(partyEvent.deadlineDate).toBe("2026-12-06");
    expect(formatSpecialEventCompactDeadline(partyEvent)).toBe(
      "中間〆11/29(日)・最終〆12/6(日)"
    );
    expect(formatSpecialEventCompactDeadline(pollEvent)).toBe(
      "最終〆12/15(火)"
    );
    expect(
      formatSpecialEventTickerDeadlineSuffix(partyEvent, "2026-11-24")
    ).toBe("（中間〆11/29(日)・最終〆12/6(日)）");
    expect(
      formatSpecialEventTickerDeadlineSuffix(partyEvent, "2026-12-01")
    ).toBe("（最終〆12/6(日)）");

    expect(
      pollEvent.summary.candidateSummaries.some((c) => c.isTopCandidate)
    ).toBe(true);

    const announceText = buildSpecialEventAnnouncementLineText({
      event: partyEvent,
      teamName: "〇〇チーム",
      pageUrl: "https://iscorecloud.com/liff/events?id=demo-spev-party",
      includeUnansweredList: true,
    });
    expect(announceText).toContain("2026年 チーム忘年会・納会");
    expect(announceText).toContain("📌 中間回答期限: 11/29(日) まで");
    expect(announceText).toContain("⏰ 最終回答期限: 12/6(日) まで");
    expect(announceText).toContain("⚠️ 注意事項・特記事項:");
    expect(announceText).toContain("コース料金100%");
    expect(announceText).toContain("鈴木 家");

    const summaryText = buildSpecialEventSummaryLineText({
      event: partyEvent,
      teamName: "〇〇チーム",
    });
    expect(summaryText).toContain("回答期限: 中間 11/29(日) ／ 最終 12/6(日)");
    expect(summaryText).toContain("参加総人数:");
    expect(summaryText).toContain("ご兄弟・同伴家族");
    expect(summaryText).toContain("⚠️ 注意事項・特記事項:");

    const csv = buildSpecialEventCsvContent(partyEvent);
    expect(csv).toContain("山田 家");
    expect(csv).toContain("陽菜");
  });
});
