// filepath: src/__tests__/match-card-bg.test.ts
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MATCH_RESULT_PHOTO_MELT_POOL,
  SCHEDULED_MATCH_PHOTO_MELT_ASSET,
  pickDeterministicMatchBgIndex,
  resolveMatchCardPhotoMelt,
} from "@/lib/liff/match-card-bg";

describe("MatchScoreCard photo-melt background resolver", () => {
  it("always returns the scorebook photo for scheduled matches", () => {
    expect(
      resolveMatchCardPhotoMelt({
        matchId: "match-001",
        isScheduledMatch: true,
        isRainout: false,
      })
    ).toEqual(SCHEDULED_MATCH_PHOTO_MELT_ASSET);
  });

  it("returns null only when the match is rained out", () => {
    expect(
      resolveMatchCardPhotoMelt({
        matchId: "match-003",
        isScheduledMatch: false,
        isRainout: true,
      })
    ).toBeNull();
  });

  it("deterministically assigns one of the 5 post-game photos for finished/live matches regardless of video without flickering", () => {
    const first = resolveMatchCardPhotoMelt({
      matchId: "finished-match-abc",
      isScheduledMatch: false,
      isRainout: false,
    });
    const second = resolveMatchCardPhotoMelt({
      matchId: "finished-match-abc",
      isScheduledMatch: false,
      isRainout: false,
    });

    expect(first).not.toBeNull();
    expect(first).toEqual(second);
    expect(MATCH_RESULT_PHOTO_MELT_POOL).toContainEqual(first);
  });

  it("spreads sequential match IDs across all 5 pool images", () => {
    const hitIndices = new Set<number>();
    for (let i = 1; i <= 40; i++) {
      hitIndices.add(
        pickDeterministicMatchBgIndex(
          `match-${i}`,
          MATCH_RESULT_PHOTO_MELT_POOL.length
        )
      );
    }
    expect(hitIndices.size).toBe(MATCH_RESULT_PHOTO_MELT_POOL.length);
  });

  it("ensures every referenced WebP asset exists under public/", () => {
    const publicDir = resolve(process.cwd(), "public");
    const allAssets = [
      SCHEDULED_MATCH_PHOTO_MELT_ASSET,
      ...MATCH_RESULT_PHOTO_MELT_POOL,
    ];
    for (const asset of allAssets) {
      const filePath = resolve(publicDir, asset.src.replace(/^\//, ""));
      expect(existsSync(filePath), `Missing asset: ${filePath}`).toBe(true);
    }
  });
});
