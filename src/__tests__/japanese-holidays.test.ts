// filepath: src/__tests__/japanese-holidays.test.ts
import { describe, expect, it } from "vitest";
import {
  getJapaneseHolidayName,
  getJapaneseHolidayNameFromDateStr,
  isJapaneseHoliday,
} from "@/lib/liff/japanese-holidays";
import { buildCalendarMonthGridDays } from "@/lib/liff/calendar-month-bg";

describe("Japanese public holiday resolver (国民の祝日・振替休日・国民の休日)", () => {
  it("resolves all 2026 official Japanese holidays including GW substitute holiday and Silver Week citizens holiday", () => {
    const expected2026: Array<[string, string]> = [
      ["2026-01-01", "元日"],
      ["2026-01-12", "成人の日"],
      ["2026-02-11", "建国記念の日"],
      ["2026-02-23", "天皇誕生日"],
      ["2026-03-20", "春分の日"],
      ["2026-04-29", "昭和の日"],
      ["2026-05-03", "憲法記念日"],
      ["2026-05-04", "みどりの日"],
      ["2026-05-05", "こどもの日"],
      ["2026-05-06", "振替休日"], // 5/3(日) 憲法記念日の振替休日
      ["2026-07-20", "海の日"],
      ["2026-08-11", "山の日"],
      ["2026-09-21", "敬老の日"],
      ["2026-09-22", "国民の休日"], // 9/21 敬老の日 と 9/23 秋分の日 に挟まれた平日
      ["2026-09-23", "秋分の日"],
      ["2026-10-12", "スポーツの日"],
      ["2026-11-03", "文化の日"],
      ["2026-11-23", "勤労感謝の日"],
    ];

    for (const [ymd, name] of expected2026) {
      expect(getJapaneseHolidayNameFromDateStr(ymd), ymd).toBe(name);
    }

    // Regular weekdays and post-2019 Dec 23 should be null
    expect(getJapaneseHolidayNameFromDateStr("2026-11-20")).toBeNull();
    expect(getJapaneseHolidayNameFromDateStr("2026-12-23")).toBeNull();
    expect(isJapaneseHoliday(new Date(2026, 10, 23))).toBe(true);
    expect(isJapaneseHoliday(new Date(2026, 10, 24))).toBe(false);
  });

  it("handles 2020/2021 Olympic holiday shifts and Sunday substitute holidays", () => {
    expect(getJapaneseHolidayNameFromDateStr("2020-07-23")).toBe("海の日");
    expect(getJapaneseHolidayNameFromDateStr("2020-07-24")).toBe("スポーツの日");
    expect(getJapaneseHolidayNameFromDateStr("2020-10-12")).toBeNull();

    expect(getJapaneseHolidayNameFromDateStr("2021-08-08")).toBe("山の日");
    expect(getJapaneseHolidayNameFromDateStr("2021-08-09")).toBe("振替休日");
  });

  it("populates holidayName and isHoliday in buildCalendarMonthGridDays", () => {
    const nov2026 = buildCalendarMonthGridDays(2026, 10);
    const nov3 = nov2026.find((c) => c.dateStr === "2026-11-03");
    const nov23 = nov2026.find((c) => c.dateStr === "2026-11-23");
    const nov21 = nov2026.find((c) => c.dateStr === "2026-11-21");

    expect(nov3?.isHoliday).toBe(true);
    expect(nov3?.holidayName).toBe("文化の日");
    expect(nov23?.isHoliday).toBe(true);
    expect(nov23?.holidayName).toBe("勤労感謝の日");
    expect(nov21?.isHoliday).toBe(false);
    expect(nov21?.holidayName).toBeNull();
    expect(getJapaneseHolidayName(new Date("invalid"))).toBeNull();
  });
});
