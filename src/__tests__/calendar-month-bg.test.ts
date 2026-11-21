// filepath: src/__tests__/calendar-month-bg.test.ts
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CALENDAR_MONTH_PHOTO_MELT_ASSETS,
  getAdjacentCalendarMonthPhotoMelts,
  normalizeCalendarMonthNumber,
  resolveCalendarMonthPhotoMelt,
} from "@/lib/liff/calendar-month-bg";

describe("Calendar monthly seasonal photo-melt resolver", () => {
  it("defines 12 distinct monthly assets for January through December", () => {
    expect(CALENDAR_MONTH_PHOTO_MELT_ASSETS).toHaveLength(12);

    const uniqueSrcs = new Set(
      CALENDAR_MONTH_PHOTO_MELT_ASSETS.map((item) => item.src)
    );
    expect(uniqueSrcs.size).toBe(12);

    for (let m = 1; m <= 12; m++) {
      const resolved = resolveCalendarMonthPhotoMelt(m);
      expect(resolved.month).toBe(m);
      expect(resolved.src).toBe(
        `/calendar-bg-${String(m).padStart(2, "0")}.webp`
      );
      expect(resolved.seasonTheme.length).toBeGreaterThan(0);
    }
  });

  it("safely normalizes wrap-around and out-of-range month values", () => {
    expect(normalizeCalendarMonthNumber(0)).toBe(12);
    expect(normalizeCalendarMonthNumber(13)).toBe(1);
    expect(normalizeCalendarMonthNumber(-1)).toBe(11);
    expect(normalizeCalendarMonthNumber(Number.NaN)).toBe(1);
    expect(resolveCalendarMonthPhotoMelt(0).month).toBe(12);
    expect(resolveCalendarMonthPhotoMelt(13).month).toBe(1);
  });

  it("returns adjacent previous and next month assets for instant preloading", () => {
    const [janPrev, janNext] = getAdjacentCalendarMonthPhotoMelts(1);
    expect(janPrev.month).toBe(12);
    expect(janNext.month).toBe(2);

    const [decPrev, decNext] = getAdjacentCalendarMonthPhotoMelts(12);
    expect(decPrev.month).toBe(11);
    expect(decNext.month).toBe(1);
  });

  it("ensures all 12 seasonal WebP files exist and are non-empty under public/", () => {
    const publicDir = resolve(process.cwd(), "public");
    for (const asset of CALENDAR_MONTH_PHOTO_MELT_ASSETS) {
      const filePath = resolve(publicDir, asset.src.replace(/^\//, ""));
      expect(existsSync(filePath), `Missing asset: ${filePath}`).toBe(true);
      expect(statSync(filePath).size).toBeGreaterThan(1024);
    }
  });
});
