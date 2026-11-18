// filepath: src/__tests__/weekend-reminder.test.ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEEKEND_REMINDER_SETTINGS,
  buildWeekendReminderMessage,
  isValidLineGroupTargetId,
  parseWeekendReminderSettingsJson,
  resolveUpcomingWeekendWindowJst,
  shouldTriggerWeekendReminderNow,
  type WeekendReminderDigest,
} from "@/lib/line/weekend-reminder";

describe("weekend-reminder settings & scheduling", () => {
  it("strictly defaults enabled to false when raw JSON is null, empty, or malformed", () => {
    expect(DEFAULT_WEEKEND_REMINDER_SETTINGS.enabled).toBe(false);
    expect(parseWeekendReminderSettingsJson(null).enabled).toBe(false);
    expect(parseWeekendReminderSettingsJson("").enabled).toBe(false);
    expect(parseWeekendReminderSettingsJson("{broken").enabled).toBe(false);
    expect(parseWeekendReminderSettingsJson({ enabled: "true" }).enabled).toBe(
      false
    );
  });

  it("enables auto-reminder only when enabled === true and clamps day/hour to valid presets", () => {
    const parsed = parseWeekendReminderSettingsJson(
      JSON.stringify({
        enabled: true,
        sendDayOfWeek: 5,
        sendHourJst: 19,
        includeUnanswered: false,
      })
    );
    expect(parsed.enabled).toBe(true);
    expect(parsed.sendDayOfWeek).toBe(5);
    expect(parsed.sendHourJst).toBe(19);
    expect(parsed.includeUnanswered).toBe(false);
    expect(parsed.includeSchedule).toBe(true);

    const clamped = parseWeekendReminderSettingsJson({
      enabled: true,
      sendDayOfWeek: 99,
      sendHourJst: 3,
    });
    expect(clamped.sendDayOfWeek).toBe(4);
    expect(clamped.sendHourJst).toBe(20);
  });

  it("validates LINE group/room target IDs strictly", () => {
    expect(
      isValidLineGroupTargetId("C1234567890abcdef1234567890abcdef")
    ).toBe(true);
    expect(
      isValidLineGroupTargetId("Rabcdef1234567890abcdef1234567890")
    ).toBe(true);
    expect(isValidLineGroupTargetId("U1234567890abcdef1234567890abcdef")).toBe(
      false
    );
    expect(isValidLineGroupTargetId("C123")).toBe(false);
    expect(isValidLineGroupTargetId("")).toBe(false);
    expect(isValidLineGroupTargetId(null)).toBe(false);
  });

  it("evaluates JST day/hour trigger window and prevents duplicate weekly sends", () => {
    // 2026-11-19 20:05 JST = 2026-11-19 11:05 UTC (Thursday)
    const thu20Jst = new Date("2026-11-19T11:05:00.000Z");
    const validGroupId = "C1234567890abcdef1234567890abcdef";
    const window = resolveUpcomingWeekendWindowJst(thu20Jst);
    expect(window.weekendKey).toBe("2026-11-21");

    // 1. Default OFF -> never sends
    expect(
      shouldTriggerWeekendReminderNow({
        settings: DEFAULT_WEEKEND_REMINDER_SETTINGS,
        lineGroupId: validGroupId,
        now: thu20Jst,
      })
    ).toEqual({
      shouldSend: false,
      weekendKey: "2026-11-21",
      reason: "disabled",
    });

    // 2. Enabled + matching Thu 20:00 JST -> sends
    const enabledThu20 = {
      ...DEFAULT_WEEKEND_REMINDER_SETTINGS,
      enabled: true,
      sendDayOfWeek: 4 as const,
      sendHourJst: 20 as const,
    };
    expect(
      shouldTriggerWeekendReminderNow({
        settings: enabledThu20,
        lineGroupId: validGroupId,
        now: thu20Jst,
      })
    ).toEqual({
      shouldSend: true,
      weekendKey: "2026-11-21",
      reason: "matched",
    });

    // 3. Same week already sent -> blocked
    expect(
      shouldTriggerWeekendReminderNow({
        settings: {
          ...enabledThu20,
          lastSentWeekKey: "2026-11-21",
        },
        lineGroupId: validGroupId,
        now: thu20Jst,
      })
    ).toEqual({
      shouldSend: false,
      weekendKey: "2026-11-21",
      reason: "already_sent_this_week",
    });

    // 4. Hour mismatch -> blocked
    const thu19Jst = new Date("2026-11-19T10:05:00.000Z");
    expect(
      shouldTriggerWeekendReminderNow({
        settings: enabledThu20,
        lineGroupId: validGroupId,
        now: thu19Jst,
      }).reason
    ).toBe("hour_mismatch");
  });

  it("formats weekend reminder text cleanly according to section toggles and test mode", () => {
    const digest: WeekendReminderDigest = {
      teamName: "〇〇クラブ（Aチーム）",
      weekendKey: "2026-11-21",
      weekendRangeLabel: "11/21(土)〜11/22(日)",
      scheduleUrl: "https://iscorecloud.com/liff/schedule",
      events: [
        {
          id: "ev1",
          dateLabel: "11/21(土)",
          timeLabel: "09:00〜16:00",
          title: "秋季大会 準決勝",
          location: "市民球場",
          targetGroup: "Aチーム",
          dutyGroup: "1班",
          needsLunch: true,
          presentPlayerCount: 15,
          absentPlayerCount: 1,
          unansweredPlayerNames: ["山田 太郎", "佐藤 次郎"],
          carCount: 4,
          carOfferCount: 5,
        },
      ],
    };

    const fullMsg = buildWeekendReminderMessage(
      digest,
      DEFAULT_WEEKEND_REMINDER_SETTINGS,
      { isTest: true }
    );
    expect(fullMsg).toContain("🧪【テスト配信】【週末予定＆出欠リマインド】");
    expect(fullMsg).toContain("📅 11/21(土) 秋季大会 準決勝 [Aチーム]");
    expect(fullMsg).toContain("🕒 09:00〜16:00 ＠市民球場 / 🍙弁当あり");
    expect(fullMsg).toContain("🚗 当番:1班 / 配車確定:4台");
    expect(fullMsg).toContain("⏳ 未回答：山田 太郎・佐藤 次郎");
    expect(fullMsg).toContain("https://iscorecloud.com/liff/schedule");

    const compactMsg = buildWeekendReminderMessage(digest, {
      includeSchedule: false,
      includeUnanswered: false,
      includeOpsSummary: false,
      includeScheduleUrl: false,
    });
    expect(compactMsg).not.toContain("🧪【テスト配信】");
    expect(compactMsg).not.toContain("＠市民球場");
    expect(compactMsg).not.toContain("未回答：");
    expect(compactMsg).not.toContain("https://iscorecloud.com/liff/schedule");
  });
});
