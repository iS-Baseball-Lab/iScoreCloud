// filepath: src/__tests__/baseball-board-engine.test.ts
import { describe, expect, it } from "vitest";
import {
  DERBY_TOTAL_PITCHES,
  MAX_VANISH_PITCHES_PER_GAME,
  applyPlayOutcome,
  buildBaseballBoardShareText,
  buildTeamLineupFromRoster,
  createGenericLineup,
  createInitialMatchState,
  isFairTerritory,
  resolveFencePocketAtAngle,
  resolveLaunchSpeedMetrics,
} from "@/lib/liff/baseball-board-engine";
import { QUICK_MENU_CATALOG } from "@/lib/liff/quick-menu-settings";

describe("baseball-board-engine", () => {
  it("builds a 9-batter lineup from active roster excluding on_leave and archived players", () => {
    const lineup = buildTeamLineupFromRoster([
      {
        id: "p1",
        name: "テスト 一郎",
        uniformNumber: "10",
        bats: "左打ち",
        primaryPosition: "遊撃手",
        conditionStatus: "active",
        isActive: true,
      },
      {
        id: "p2",
        name: "休部 太郎",
        uniformNumber: "99",
        bats: "右",
        conditionStatus: "on_leave",
        isActive: true,
      },
      {
        id: "p3",
        name: "退団 次郎",
        uniformNumber: "88",
        bats: "右",
        conditionStatus: "active",
        isActive: false,
      },
    ]);

    expect(lineup).toHaveLength(9);
    expect(lineup[0]?.name).toBe("テスト 一郎");
    expect(lineup[0]?.uniformNumber).toBe("10");
    expect(lineup[0]?.bats).toBe("L");
    expect(lineup.some((p) => p.name.includes("休部"))).toBe(false);
    expect(lineup.some((p) => p.name.includes("退団"))).toBe(false);
  });

  it("handles balls, bases-loaded walk, 2-strike fouls, and 3-bunt failure", () => {
    let state = createInitialMatchState({
      mode: "cpu",
      totalInnings: 3,
      difficulty: "normal",
      myTeamName: "サンプルクラブ",
      myLineup: createGenericLineup("my"),
    });

    state.bases = { first: true, second: true, third: true };

    // 4 consecutive balls -> walk + 1 forced run
    for (let i = 0; i < 3; i++) {
      state = applyPlayOutcome(state, "ball", "ボール").nextState;
      expect(state.balls).toBe(i + 1);
    }
    const walkRes = applyPlayOutcome(state, "ball", "ボール");
    expect(walkRes.runsScored).toBe(1);
    expect(walkRes.nextState.awayScore).toBe(1);
    expect(walkRes.nextState.balls).toBe(0);

    // 2 strikes + normal foul keeps strikes at 2, then 3-bunt foul = out
    state = walkRes.nextState;
    state = applyPlayOutcome(state, "called_strike", "ストライク").nextState;
    state = applyPlayOutcome(state, "swinging_strike", "空振り", true).nextState;
    expect(state.strikes).toBe(2);
    expect(state.homeVanishLeft).toBe(MAX_VANISH_PITCHES_PER_GAME - 1);

    state = applyPlayOutcome(state, "foul", "ファウル").nextState;
    expect(state.strikes).toBe(2);

    const buntOut = applyPlayOutcome(
      state,
      "three_bunt_out",
      "スリーバント失敗"
    );
    expect(buntOut.outsAdded).toBe(1);
    expect(buntOut.nextState.outs).toBe(1);
  });

  it("resolves double play without scoring 3rd-base runner on 3rd out, and supports walk-off x", () => {
    let state = createInitialMatchState({
      mode: "cpu",
      totalInnings: 1,
      difficulty: "normal",
      myTeamName: "サンプルクラブ",
      myLineup: createGenericLineup("my"),
    });

    // 1回表 1死 一・三塁から併殺打 ➔ 3アウトチェンジ＆無得点
    state.outs = 1;
    state.bases = { first: true, second: false, third: true };
    const dpRes = applyPlayOutcome(state, "double_play", "6-4-3 併殺");
    expect(dpRes.runsScored).toBe(0);
    expect(dpRes.halfInningEnded).toBe(true);
    expect(dpRes.nextState.isTop).toBe(false);
    expect(dpRes.nextState.awayScore).toBe(0);

    // 1回裏 ソロ本塁打 ➔ 即サヨナラ勝ち（1x）
    const walkOffRes = applyPlayOutcome(
      dpRes.nextState,
      "homerun",
      "レフトスタンド本塁打"
    );
    expect(walkOffRes.isWalkOff).toBe(true);
    expect(walkOffRes.nextState.isGameOver).toBe(true);
    expect(walkOffRes.nextState.winner).toBe("home");
    expect(walkOffRes.nextState.homeScore).toBe(1);

    const shareText = buildBaseballBoardShareText(walkOffRes.nextState);
    expect(shareText).toContain("1x");
    expect(shareText).toContain("野球盤ミニゲーム");
  });

  it("skips bottom of final inning with X when home leads after top half, and enters tiebreaker when tied", () => {
    // 1) Home leads -> X win
    let leadState = createInitialMatchState({
      mode: "cpu",
      totalInnings: 1,
      difficulty: "normal",
      myTeamName: "サンプルクラブ",
      myLineup: createGenericLineup("my"),
    });
    leadState.homeScore = 2;
    leadState.outs = 2;
    const topEnd = applyPlayOutcome(leadState, "ground_out", "遊ゴロ");
    expect(topEnd.nextState.isGameOver).toBe(true);
    expect(topEnd.nextState.winner).toBe("home");
    expect(topEnd.nextState.innings[0]?.bottom).toBe("x");

    // 2) Tied at end of 1st bottom -> Extra inning 2 top with runners on 1st & 2nd
    let tieState = createInitialMatchState({
      mode: "cpu",
      totalInnings: 1,
      difficulty: "normal",
      myTeamName: "サンプルクラブ",
      myLineup: createGenericLineup("my"),
    });
    tieState.isTop = false;
    tieState.innings[0] = { top: 0, bottom: 0 };
    tieState.outs = 2;
    const extraRes = applyPlayOutcome(tieState, "fly_out", "中飛");
    expect(extraRes.nextState.isGameOver).toBe(false);
    expect(extraRes.nextState.inning).toBe(2);
    expect(extraRes.nextState.isTop).toBe(true);
    expect(extraRes.nextState.bases).toEqual({
      first: true,
      second: true,
      third: false,
    });
  });

  it("completes 10-pitch Home Run Derby and maps fence pockets & fair territory accurately", () => {
    let derby = createInitialMatchState({
      mode: "derby",
      totalInnings: 3,
      difficulty: "normal",
      myTeamName: "サンプルクラブ",
      myLineup: createGenericLineup("my"),
    });

    for (let i = 0; i < DERBY_TOTAL_PITCHES; i++) {
      derby = applyPlayOutcome(
        derby,
        i % 2 === 0 ? "homerun" : "single",
        "打撃結果"
      ).nextState;
    }

    expect(derby.isGameOver).toBe(true);
    expect(derby.derbyHomeRuns).toBe(5);
    expect(derby.derbyPoints).toBe(5 * 100 + 5 * 20);

    expect(isFairTerritory(200, 200)).toBe(true);
    expect(isFairTerritory(20, 350)).toBe(false);
    expect(resolveFencePocketAtAngle(-90)?.kind).toBe("hr");
    expect(resolveFencePocketAtAngle(-160)?.kind).toBe("1b");
    expect(resolveFencePocketAtAngle(-45)?.kind).toBe("3b");
  });

  it("supports pitch speed presets (slow/monster/chaos), billboard +150pt bonus, and batting-first playerSide", () => {
    const slowMetrics = resolveLaunchSpeedMetrics("straight", "slow");
    const monsterMetrics = resolveLaunchSpeedMetrics("straight", "monster");
    expect(slowMetrics.displayKmh).toBeLessThan(95);
    expect(monsterMetrics.displayKmh).toBeGreaterThanOrEqual(158);
    expect(monsterMetrics.isFireball).toBe(true);
    expect(monsterMetrics.effectiveSpeedPxPerSec).toBeGreaterThan(
      slowMetrics.effectiveSpeedPxPerSec
    );

    const awayFirst = createInitialMatchState({
      mode: "cpu",
      totalInnings: 3,
      difficulty: "normal",
      myTeamName: "テストチーム",
      myLineup: createGenericLineup("my"),
      playerIsHome: false,
    });
    expect(awayFirst.playerSide).toBe("away");
    expect(awayFirst.awayTeamName).toBe("テストチーム");

    const derby = createInitialMatchState({
      mode: "derby",
      totalInnings: 3,
      difficulty: "normal",
      myTeamName: "テストチーム",
      myLineup: createGenericLineup("my"),
    });
    const billboardRes = applyPlayOutcome(
      derby,
      "homerun",
      "看板直撃！特大本塁打！！"
    );
    expect(billboardRes.nextState.derbyPoints).toBe(150);
  });

  it("places baseball_board right after related_teams in QUICK_MENU_CATALOG", () => {
    const relatedIdx = QUICK_MENU_CATALOG.findIndex(
      (i) => i.id === "related_teams"
    );
    const boardIdx = QUICK_MENU_CATALOG.findIndex(
      (i) => i.id === "baseball_board"
    );
    expect(relatedIdx).toBeGreaterThanOrEqual(0);
    expect(boardIdx).toBe(relatedIdx + 1);
    expect(QUICK_MENU_CATALOG[boardIdx]?.href).toBe("/liff/baseball-board");
  });
});
