// filepath: src/__tests__/calendar-month-bg.test.ts
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CALENDAR_MONTH_PHOTO_MELT_ASSETS,
  detectCalendarSwipeAxis,
  getAdjacentCalendarMonthPhotoMelts,
  normalizeCalendarMonthNumber,
  resolveCalendarFlickDirection,
  resolveCalendarMonthPhotoMelt,
} from "@/lib/liff/calendar-month-bg";

describe("Calendar monthly seasonal photo-melt resolver & horizontal flick physics", () => {
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

  it("strictly separates vertical scrolling from horizontal calendar swipes", () => {
    // Sub-8px tap jitter stays undecided
    expect(detectCalendarSwipeAxis(4, 3)).toBe("undecided");
    // Vertical or diagonal-vertical movement prioritizes native page scrolling
    expect(detectCalendarSwipeAxis(12, 24)).toBe("vertical");
    expect(detectCalendarSwipeAxis(-18, 18)).toBe("vertical");
    // Clear horizontal flick locks horizontal
    expect(detectCalendarSwipeAxis(-28, 6)).toBe("horizontal");
    expect(detectCalendarSwipeAxis(32, -8)).toBe("horizontal");
  });

  it("resolves left flick to next month, right flick to previous month, and tiny drags to none", () => {
    // Left swipe beyond distance threshold -> next month
    expect(
      resolveCalendarFlickDirection({
        totalDx: -64,
        elapsedMs: 320,
        containerWidth: 380,
      })
    ).toBe("next");

    // Right swipe beyond distance threshold -> prev month
    expect(
      resolveCalendarFlickDirection({
        totalDx: 64,
        elapsedMs: 320,
        containerWidth: 380,
      })
    ).toBe("prev");

    // Quick short thumb flick -> triggers month switch even below full drag threshold
    expect(
      resolveCalendarFlickDirection({
        totalDx: -30,
        elapsedMs: 75,
        containerWidth: 380,
      })
    ).toBe("next");
    expect(
      resolveCalendarFlickDirection({
        totalDx: 28,
        elapsedMs: 70,
        containerWidth: 380,
      })
    ).toBe("prev");

    // Slow short drag -> cancels cleanly without switching month
    expect(
      resolveCalendarFlickDirection({
        totalDx: -20,
        elapsedMs: 260,
        containerWidth: 380,
      })
    ).toBe("none");
  });
});
