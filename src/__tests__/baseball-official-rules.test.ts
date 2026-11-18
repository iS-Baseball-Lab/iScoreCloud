// filepath: src/__tests__/baseball-official-rules.test.ts
import { describe, expect, it } from "vitest";
import {
  classifyDroppedThirdStrikeReach,
  formatOfficialBaseballRate,
  normalizeLegacyDroppedThirdStrikeAtBat,
  normalizeRegulationInnings,
} from "@/lib/liff/baseball-official-rules";
import {
  normalizeLegacyForceOutAtBat,
  normalizeLegacyInfieldFlyAtBat,
  repairPlayLogForceOutDescription,
} from "@/lib/liff/scorebook-fielding";

describe("Official Baseball Rules Chapter 9 & scorebook normalization", () => {
  it("classifies dropped third strike reach (WP vs PB vs throwing/receiving error) per Rule 9.12/9.16", () => {
    // Legacy mechanical "K-E2" without error wording -> treated as standard WP (no error)
    expect(classifyDroppedThirdStrikeReach("K-E2", "振り逃げ出塁")).toEqual({
      kind: "wp",
      errorPos: null,
      assistPos: null,
    });

    // Passed ball
    expect(classifyDroppedThirdStrikeReach("K PB", "振り逃げ出塁 (捕逸)")).toEqual({
      kind: "pb",
      errorPos: null,
      assistPos: null,
    });

    // Catcher throwing error
    expect(classifyDroppedThirdStrikeReach("K 2E-3", "振り逃げ悪送球")).toEqual({
      kind: "throwing_error",
      errorPos: "2",
      assistPos: null,
    });

    // First baseman receiving error (catcher gets assist!)
    expect(classifyDroppedThirdStrikeReach("K 2-3E", "振り逃げ一落球失策")).toEqual({
      kind: "receiving_error",
      errorPos: "3",
      assistPos: "2",
    });

    const repaired = normalizeLegacyDroppedThirdStrikeAtBat({
      resultCode: "dropped_third_strike",
      battedDirection: "K-E2",
      resultLabel: "振り逃げ出塁",
    });
    expect(repaired.battedDirection).toBe("K WP");
  });

  it("formats batting/on-base rates per Rule 9.21 (.333 vs 1.000)", () => {
    expect(formatOfficialBaseballRate(1, 3)).toBe(".333");
    expect(formatOfficialBaseballRate(3, 3)).toBe("1.000");
    expect(formatOfficialBaseballRate(0, 4)).toBe(".000");
    expect(formatOfficialBaseballRate(0, 0)).toBe(".---");
  });

  it("normalizes regulation innings to official 5/6/7/9 game formats", () => {
    expect(normalizeRegulationInnings(5)).toBe(5);
    expect(normalizeRegulationInnings(6)).toBe(6);
    expect(normalizeRegulationInnings(7)).toBe(7);
    expect(normalizeRegulationInnings(9)).toBe(9);
    expect(normalizeRegulationInnings(undefined)).toBe(7);
  });

  it("strictly separates force-out grounders (groundout) from all-safe fielder's choice (fc)", () => {
    const legacyForceOut = normalizeLegacyForceOutAtBat({
      resultCode: "fc",
      battedDirection: "FC6-4",
      resultLabel: "遊野選",
      outsInPlay: 1,
      advances: [
        {
          id: "adv1",
          from: "1B",
          to: "2B",
          method: "fc",
          isOut: true,
          runnerName: "山田",
        },
      ],
    });
    expect(legacyForceOut.resultCode).toBe("groundout");
    expect(legacyForceOut.battedDirection).not.toContain("FC");

    // All-safe FC (0 outs recorded on play) remains "fc"
    const trueAllSafeFc = normalizeLegacyForceOutAtBat({
      resultCode: "fc",
      battedDirection: "4FC",
      resultLabel: "二野選",
      outsInPlay: 0,
      advances: [
        {
          id: "adv2",
          from: "1B",
          to: "2B",
          method: "fc",
          isOut: false,
          runnerName: "山田",
        },
      ],
    });
    expect(trueAllSafeFc.resultCode).toBe("fc");
  });

  it("strips outfield position numbers (7/8/9) from infield fly plays and play_logs", () => {
    const repairedIf = normalizeLegacyInfieldFlyAtBat({
      resultCode: "infield_fly",
      battedDirection: "8IF",
      resultLabel: "中インフィールドフライ",
    });
    expect(repairedIf.resultCode).toBe("infield_fly");
    expect(repairedIf.battedDirection).toBe("IF");
    expect(repairedIf.resultLabel).toBe("インフィールドフライ");

    const repairedLog = repairPlayLogForceOutDescription(
      "3番 佐藤: 中インフィールドフライ (8IF) [B:1, S:1, O:1]",
      repairedIf
    );
    expect(repairedLog).toBe("3番 佐藤: インフィールドフライ (IF) [B:1, S:1, O:1]");
  });
});
