// filepath: src/__tests__/pitch-workload.test.ts
import { describe, expect, it } from "vitest";
import {
  buildThresholdsForLimit,
  evaluatePitchAlert,
  evaluatePreMatchWorkloadWarning,
  parseTournamentPitchLimitText,
  resolvePitchLimitSpec,
} from "@/lib/liff/pitch-workload";

describe("pitch-workload protection engine", () => {
  it("parses tournament pitch limit strings including full-width Japanese numbers", () => {
    expect(parseTournamentPitchLimitText("1日70球以内（学童規定）")).toEqual({
      kind: "limit",
      value: 70,
    });
    expect(parseTournamentPitchLimitText("１日１００球まで")).toEqual({
      kind: "limit",
      value: 100,
    });
    expect(parseTournamentPitchLimitText("球数制限なし")).toEqual({
      kind: "none",
    });
    expect(parseTournamentPitchLimitText("")).toEqual({
      kind: "unset",
    });
  });

  it("resolves priority hierarchy (manual override > tournament rule > team setting > category)", () => {
    expect(
      resolvePitchLimitSpec({
        manualOverride: 85,
        tournamentPitchLimitRule: "70球",
        teamPitchCountLimit: 100,
      }).limit
    ).toBe(85);

    expect(
      resolvePitchLimitSpec({
        manualOverride: "none",
        tournamentPitchLimitRule: "70球",
      }).limit
    ).toBeNull();

    expect(
      resolvePitchLimitSpec({
        tournamentPitchLimitRule: "1日70球以内",
        orgCategory: "chugaku",
      }).limit
    ).toBe(70);

    expect(
      resolvePitchLimitSpec({
        orgCategory: "chugaku",
      }).limit
    ).toBe(100);
  });

  it("evaluates 3-stage pitch alerts accurately for JSBB 70-pitch youth standard", () => {
    const spec70 = buildThresholdsForLimit(70);
    expect(evaluatePitchAlert(49, spec70, "山田").level).toBe("none");

    const caution = evaluatePitchAlert(50, spec70, "山田");
    expect(caution.level).toBe("caution");
    expect(caution.remaining).toBe(20);

    const prepare = evaluatePitchAlert(62, spec70, "山田");
    expect(prepare.level).toBe("prepare");
    expect(prepare.remaining).toBe(8);

    const limit = evaluatePitchAlert(70, spec70, "山田");
    expect(limit.level).toBe("limit");
    expect(limit.remaining).toBe(0);
    expect(limit.bannerTitle).toContain("山田投手");
  });

  it("flags consecutive-day and 7-day cumulative pitching overload before lineup registration", () => {
    expect(
      evaluatePreMatchWorkloadWarning({
        yesterdayPitches: 70,
        last7DaysPitches: 70,
        dailyLimit: 70,
      }).severity
    ).toBe("high");

    expect(
      evaluatePreMatchWorkloadWarning({
        yesterdayPitches: 0,
        last7DaysPitches: 145,
        dailyLimit: 70,
      }).severity
    ).toBe("high");

    expect(
      evaluatePreMatchWorkloadWarning({
        yesterdayPitches: 35,
        last7DaysPitches: 60,
        dailyLimit: 70,
      }).severity
    ).toBe("caution");

    expect(
      evaluatePreMatchWorkloadWarning({
        yesterdayPitches: 0,
        last7DaysPitches: 40,
        dailyLimit: 70,
      }).severity
    ).toBe("none");
  });
});
