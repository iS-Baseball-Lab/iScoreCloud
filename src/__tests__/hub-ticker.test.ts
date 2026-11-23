// filepath: src/__tests__/hub-ticker.test.ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_HUB_TICKER_CONFIG,
  TICKER_SCROLL_PX_PER_SEC,
  buildHubTickerFeed,
  computeTickerHorizontalPanPlan,
  isHubManualTickerExpired,
  parseHubTickerConfigJson,
  resolveQuickExpiryDate,
  serializeHubTickerConfigJson,
  type HubTickerServerContext,
} from "@/lib/liff/hub-ticker";
import type { MatchCardData } from "@/components/liff/MatchScoreCard";
import type { HubEventInputItem } from "@/components/liff/HubHeroSection";
import type { HubSpecialEventSummary } from "@/lib/liff/special-events-schema";

describe("hub-ticker schema & feed builder", () => {
  const fixedNow = new Date("2026-11-23T03:00:00.000Z"); // 2026-11-23 12:00 JST (Mon)

  it("normalizes and sanitizes manual ticker config JSON safely", () => {
    const raw = JSON.stringify({
      enabled: true,
      autoSources: {
        importantNotices: true,
        liveStatus: false,
      },
      manualItems: [
        {
          id: "m1",
          enabled: true,
          tone: "urgent",
          badgeLabel: "🚨 雨天変更",
          text: "  本日の練習は体育館9:00集合に変更です  ",
          linkTarget: "/liff/schedule",
          expiresAt: "2026-11-23",
        },
        {
          id: "m_unsafe",
          enabled: true,
          tone: "info",
          text: "外部URLテスト",
          linkTarget: "https://evil.example.com",
          expiresAt: "invalid-date",
        },
        {
          id: "m_empty",
          enabled: true,
          tone: "info",
          text: "   ",
        },
      ],
    });

    const parsed = parseHubTickerConfigJson(raw);
    expect(parsed.enabled).toBe(true);
    expect(parsed.autoSources.importantNotices).toBe(true);
    expect(parsed.autoSources.liveStatus).toBe(false);
    expect(parsed.autoSources.myReminders).toBe(true);
    expect(parsed.manualItems).toHaveLength(2);
    expect(parsed.manualItems[0].text).toBe(
      "本日の練習は体育館9:00集合に変更です"
    );
    expect(parsed.manualItems[0].linkTarget).toBe("/liff/schedule");
    expect(parsed.manualItems[0].expiresAt).toBe("2026-11-23");
    // External URLs are rejected to empty string (opens safe full-text modal)
    expect(parsed.manualItems[1].linkTarget).toBe("");
    expect(parsed.manualItems[1].expiresAt).toBeNull();

    const roundTrip = parseHubTickerConfigJson(
      serializeHubTickerConfigJson(parsed)
    );
    expect(roundTrip.manualItems).toHaveLength(2);
  });

  it("evaluates quick expiry presets and JST expiration boundary accurately", () => {
    expect(resolveQuickExpiryDate("today", fixedNow)).toBe("2026-11-23");
    expect(resolveQuickExpiryDate("tomorrow", fixedNow)).toBe("2026-11-24");
    expect(resolveQuickExpiryDate("weekend", fixedNow)).toBe("2026-11-29"); // Sunday
    expect(resolveQuickExpiryDate("week", fixedNow)).toBe("2026-11-30");
    expect(resolveQuickExpiryDate("none", fixedNow)).toBeNull();

    expect(isHubManualTickerExpired("2026-11-22", fixedNow)).toBe(true);
    expect(isHubManualTickerExpired("2026-11-23", fixedNow)).toBe(false);
    expect(isHubManualTickerExpired(null, fixedNow)).toBe(false);
  });

  it("builds all 6 categories (①〜⑥) in priority order and hides expired manual items", () => {
    const config = parseHubTickerConfigJson({
      enabled: true,
      manualItems: [
        {
          id: "info_1",
          enabled: true,
          tone: "info",
          badgeLabel: "📣 体験案内",
          text: "来週の体験会参加者を募集中です",
          linkTarget: "/liff/schedule",
          expiresAt: "2026-11-30",
        },
        {
          id: "urgent_1",
          enabled: true,
          tone: "urgent",
          badgeLabel: "🚨 緊急変更",
          text: "本日は雨天のため〇〇体育館へ変更！",
          linkTarget: "/liff/schedule",
          expiresAt: "2026-11-23",
        },
        {
          id: "expired_1",
          enabled: true,
          tone: "urgent",
          text: "昨日の古い連絡",
          expiresAt: "2026-11-22",
        },
      ],
    });

    const events: HubEventInputItem[] = [
      {
        id: "ev_1",
        title: "通常練習",
        date: "11/28(土)",
        dateStr: "2026-11-28",
        amTime: "08:00〜12:00",
        location: "〇〇市民グラウンド",
        dutyGroup: "2班",
        needsLunch: false,
        importantNotice: "駐車場は北口ゲートから入場してください",
        myStatus: "pending",
        attendCount: { present: 22, absent: 2, pending: 4 },
      },
    ];

    const specialEvents: HubSpecialEventSummary[] = [
      {
        id: "sp_1",
        title: "2026年度 納会",
        category: "party",
        mode: "rsvp",
        status: "open",
        eventDate: "2026-12-20",
        eventDateLabel: "12/20(日)",
        timeRangeLabel: "17:00〜19:00",
        deadlineDate: "2026-11-30",
        deadlineDateLabel: "11/30",
        location: "〇〇会館",
        importantNotice: "",
        myResponded: false,
        myOverallState: "pending",
        myHeadcount: 0,
        myFeeAmount: 0,
        useFeeCalculation: true,
        respondedHouseholdCount: 8,
        activeTargetHouseholdCount: 15,
        totalHeadcount: 24,
        tierTotals: [],
        topCandidateSummary: null,
      },
    ];

    const matches: MatchCardData[] = [
      {
        id: "m_live",
        opponent: "〇〇スターズ",
        date: "2026/11/23",
        status: "live",
        myScore: 4,
        opponentScore: 1,
        matchType: "official",
        tournamentName: "秋季大会 準決勝",
      },
      {
        id: "m_sched",
        opponent: "△△ファイターズ",
        date: "2026/11/25",
        status: "scheduled",
        myScore: 0,
        opponentScore: 0,
        matchType: "practice",
        venueName: "〇〇河川敷球場",
        venueParkingInfo: "各チーム駐車5台まで",
        matchDayOps: {
          staffRoles: [
            {
              roleKey: "scorer",
              roleLabel: "スコアラー",
              assignees: ["山田 父"],
            },
          ],
        },
        scheduleSync: {
          eventId: "ev_match",
          title: "OP戦",
          dutyGroup: null,
          needsLunch: true,
          needsSnack: false,
          gatherTime: "08:00",
          gatherLocation: "現地",
          destination: "〇〇河川敷球場",
          cars: [
            {
              carNumber: 2,
              driverName: "山田 父",
              carModel: "ミニバン",
              plate: "1234",
              capacity: 5,
              isCargo: false,
              passengers: [],
            },
          ],
        },
      },
      {
        id: "m_fin_1",
        opponent: "□□イーグルス",
        date: "2026/11/16",
        status: "finished",
        myScore: 6,
        opponentScore: 2,
        matchType: "official",
        tournamentName: "秋季大会 2回戦",
        youtubeUrl: "https://www.youtube.com/watch?v=qkRUcYHJ1JI",
      },
      {
        id: "m_fin_2",
        opponent: "◇◇ライオンズ",
        date: "2026/11/09",
        status: "finished",
        myScore: 5,
        opponentScore: 3,
        matchType: "practice",
      },
    ];

    const serverContext: HubTickerServerContext = {
      activeConvoyCars: 3,
      convoyDestination: "〇〇河川敷球場",
      liveReport: {
        matchId: "m_live",
        opponentName: "〇〇スターズ",
        tournamentText: "秋季大会 準決勝",
        inningLabel: "5回裏",
        isGameFinished: false,
        updatedAtSec: Math.floor(fixedNow.getTime() / 1000) - 60,
      },
      latestAlbum: {
        id: "alb_1",
        title: "秋季大会2回戦ハイライト",
        albumDate: "2026-11-16",
        photoCount: 35,
        updatedAtSec: Math.floor(fixedNow.getTime() / 1000) - 3600,
      },
      pendingMemberCount: 2,
      slogan: "全力疾走・声でつなぐ全員野球",
      myMatchIdentity: {
        memberId: "mem_yamada",
        memberName: "山田 父",
        displayName: "山田 父",
        childNames: ["山田 太郎"],
      },
    };

    const managerFeed = buildHubTickerFeed({
      config,
      events,
      specialEvents,
      matches,
      serverContext,
      canManage: true,
      practiceMatchLabel: "OP戦",
      userName: "山田 父",
      nowDate: fixedNow,
    });

    // Urgent manual item comes before info manual item, and expired item is excluded
    expect(managerFeed[0].id).toBe("manual:urgent_1");
    expect(managerFeed[1].id).toBe("manual:info_1");
    expect(managerFeed.some((i) => i.id === "manual:expired_1")).toBe(false);

    // Manager sees pending member approvals
    expect(managerFeed.some((i) => i.id === "admin-pending:2")).toBe(true);

    // Important notices & venue rules
    expect(managerFeed.some((i) => i.id === "ev-notice:ev_1")).toBe(true);
    expect(managerFeed.some((i) => i.id === "venue-rule:m_sched")).toBe(true);

    // Live match with inning & active convoy
    const liveItem = managerFeed.find((i) => i.id === "live-match:m_live");
    expect(liveItem?.text).toContain("5回裏 4 - 1");
    expect(managerFeed.some((i) => i.id === "live-convoy:3")).toBe(true);

    // Personal duty & unanswered items
    const dutyItem = managerFeed.find((i) => i.id === "my-duty:m_sched");
    expect(dutyItem?.text).toContain("スコアラー");
    expect(dutyItem?.text).toContain("2号車運転");
    expect(managerFeed.some((i) => i.id.startsWith("my-unanswered-ev:"))).toBe(
      true
    );
    expect(managerFeed.some((i) => i.id === "my-unanswered-sp:sp_1")).toBe(
      true
    );

    // Schedule summary & unfilled roles recruitment
    expect(managerFeed.some((i) => i.id === "next-schedule:ev_1")).toBe(true);
    expect(managerFeed.some((i) => i.id === "role-open:m_sched")).toBe(true);

    // Match result with 2-game win streak, YouTube video, gallery album, slogan
    const resultItem = managerFeed.find((i) => i.id === "match-result:m_fin_1");
    expect(resultItem?.text).toContain("現在チーム2連勝中");
    expect(managerFeed.some((i) => i.id === "match-video:m_fin_1")).toBe(true);
    expect(managerFeed.some((i) => i.id === "gallery-album:alb_1")).toBe(true);
    expect(managerFeed.some((i) => i.id === "team-slogan")).toBe(true);

    // Non-manager MUST NEVER see pending member approvals
    const memberFeed = buildHubTickerFeed({
      config,
      events,
      specialEvents,
      matches,
      serverContext,
      canManage: false,
      nowDate: fixedNow,
    });
    expect(memberFeed.some((i) => i.id.startsWith("admin-pending:"))).toBe(
      false
    );

    // Disabled config returns empty array
    const disabledFeed = buildHubTickerFeed({
      config: { ...DEFAULT_HUB_TICKER_CONFIG, enabled: false },
      events,
      specialEvents,
      matches,
      serverContext,
      canManage: true,
      nowDate: fixedNow,
    });
    expect(disabledFeed).toHaveLength(0);
  });

  it("maintains a strictly constant px/sec horizontal scroll speed regardless of message length", () => {
    const sampleOverflows = [12, 60, 180, 420, 960];
    for (const overflow of sampleOverflows) {
      const plan = computeTickerHorizontalPanPlan(overflow);
      const actualSpeedPxPerSec = plan.travelDistancePx / (plan.scrollMs / 1000);
      expect(actualSpeedPxPerSec).toBeCloseTo(TICKER_SCROLL_PX_PER_SEC, 1);
      expect(plan.totalCycleMs).toBe(
        plan.initialHoldMs + plan.scrollMs + plan.endHoldMs
      );
      expect(plan.totalCycleMs).toBeGreaterThanOrEqual(4800);
    }
  });
});

