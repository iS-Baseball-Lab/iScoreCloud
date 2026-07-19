// src/api/matches.ts
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { MatchService } from "@/services/match.service";
import { eq, sql } from "drizzle-orm";
import { matchUndoHistories, atBats, playLogs, baseAdvances } from "@/db/schema/score";
import { matches } from "@/db/schema/match";
import scorebookRouter from "./matches/scorebook";

const app = new Hono<{ Bindings: { DB: D1Database } }>();

app.route("/", scorebookRouter);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⚾️ 窓口（Controller / Router）
// 通信の受け渡しとエラーハンドリングのみを担当
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.get("/", async (c) => {
  const teamId = c.req.query("teamId");
  if (!teamId) return c.json({ error: "teamId is required" }, 400);

  try {
    const matchesData = await MatchService.getMatchesByTeam(drizzle(c.env.DB), teamId);
    return c.json(matchesData);
  } catch (error) {
    return c.json({ error: "Failed to fetch matches" }, 500);
  }
});

app.get("/:id", async (c) => {
  try {
    const matchData = await MatchService.getMatchById(drizzle(c.env.DB), c.req.param("id"));
    if (!matchData) return c.json({ success: false, error: "Match not found" }, 404);
    return c.json({ success: true, match: matchData });
  } catch (error) {
    return c.json({ success: false, error: "Failed to fetch match" }, 500);
  }
});

app.get("/:id/undo-history", async (c) => {
  const db = drizzle(c.env.DB);
  const matchId = c.req.param("id");

  try {
    const result = await db.select({
      historyJson: matchUndoHistories.historyJson
    })
    .from(matchUndoHistories)
    .where(eq(matchUndoHistories.matchId, matchId))
    .get();
    
    const historyJson = result?.historyJson || "[]";
    return c.json({ success: true, history: JSON.parse(historyJson) });
  } catch (error) {
    return c.json({ success: true, history: [] });
  }
});

app.get("/:id/innings", async (c) => {
  try {
    const innings = await MatchService.getMatchInnings(drizzle(c.env.DB), c.req.param("id"));
    return c.json(innings);
  } catch (error) {
    return c.json([], 500);
  }
});

app.get("/:id/lineups", async (c) => {
  try {
    const lineups = await MatchService.getMatchLineups(drizzle(c.env.DB), c.req.param("id"));
    return c.json({ success: true, lineups });
  } catch (error) {
    return c.json({ success: false, error: "Failed to fetch lineups" }, 500);
  }
});

app.get("/:id/logs", async (c) => {
  try {
    const db = drizzle(c.env.DB);
    const matchId = c.req.param("id");
    const logs = await MatchService.getPlayLogs(db, matchId);
    
    // バリデーションも取得
    const matchData = await db.select({ scorebookValidations: matches.scorebookValidations }).from(matches).where(eq(matches.id, matchId)).get();
    let validationMessages = [];
    if (matchData?.scorebookValidations) {
      try {
        validationMessages = JSON.parse(matchData.scorebookValidations);
      } catch (e) {}
    }

    return c.json({ success: true, logs, validationMessages });
  } catch (error) {
    return c.json({ success: false, error: "Failed to fetch play logs" }, 500);
  }
});

app.post("/:id/validations/resolve", async (c) => {
  try {
    const db = drizzle(c.env.DB);
    await db.update(matches).set({ scorebookValidations: '[]' }).where(eq(matches.id, c.req.param("id")));
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: "Failed to resolve validations" }, 500);
  }
});

app.put("/:id/lineups", async (c) => {
  try {
    const body = await c.req.json();
    await MatchService.saveMatchLineups(drizzle(c.env.DB), c.req.param("id"), body.myLineup || [], body.opponentLineup || [], body.myAttendance || {});
    return c.json({ success: true });
  } catch (error) {
    console.error("Error in PUT /api/matches/:id/lineups:", error);
    return c.json({ success: false, error: "Failed to save lineups" }, 500);
  }
});

app.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const matchId = await MatchService.createMatch(drizzle(c.env.DB), body);
    return c.json({ success: true, matchId });
  } catch (error) {
    return c.json({ success: false, error: "Failed to create match" }, 500);
  }
});

app.patch("/:id", async (c) => {
  try {
    await MatchService.updateMatch(drizzle(c.env.DB), c.req.param("id"), await c.req.json());
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: "Failed to update match" }, 500);
  }
});

app.patch("/:id/finish", async (c) => {
  try {
    await MatchService.finishMatch(drizzle(c.env.DB), c.req.param("id"), await c.req.json());
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: "Failed to save scores" }, 500);
  }
});

app.post("/:id/reset", async (c) => {
  const db = drizzle(c.env.DB);
  const matchId = c.req.param("id");

  try {
    // 試合の関連テーブルを一括クリア＆ matches レコードの 0 リセット
    await db.batch([
      db.delete(playLogs).where(eq(playLogs.matchId, matchId)) as any,
      db.delete(atBats).where(eq(atBats.matchId, matchId)) as any,
      db.delete(matchUndoHistories).where(eq(matchUndoHistories.matchId, matchId)) as any,
      db.update(matches)
        .set({
          myScore: 0,
          opponentScore: 0,
          currentInning: 1,
          isBottom: false,
          balls: 0,
          strikes: 0,
          outs: 0,
          runners: JSON.stringify({ base1: null, base2: null, base3: null }),
          myInningScores: "[]",
          opponentInningScores: "[]",
          myHits: 0,
          opponentHits: 0,
          myErrors: 0,
          opponentErrors: 0,
          status: "live"
        })
        .where(eq(matches.id, matchId)) as any
    ]);

    return c.json({ success: true });
  } catch (error) {
    console.error("Failed to reset match:", error);
    return c.json({ success: false, error: "Failed to reset match" }, 500);
  }
});

app.get("/logs/:logId", async (c) => {
  const db = drizzle(c.env.DB);
  const logId = c.req.param("logId");

  try {
    const log = await db.select().from(playLogs).where(eq(playLogs.id, logId)).get();
    if (!log) {
      return c.json({ success: false, error: "Play log not found" }, 404);
    }
    const formattedLog = {
      id: log.id,
      matchId: log.matchId,
      inningText: log.inningText,
      resultType: log.resultType,
      description: log.description,
      createdAt: log.createdAt instanceof Date ? log.createdAt.getTime() : new Date(log.createdAt).getTime(),
    };
    return c.json({ success: true, log: formattedLog });
  } catch (error) {
    return c.json({ success: false, error: "Failed to fetch play log" }, 500);
  }
});

app.put("/logs/:logId", async (c) => {
  const db = drizzle(c.env.DB);
  const logId = c.req.param("logId");

  try {
    const body = await c.req.json();
    await db.update(playLogs)
      .set({
        description: body.description,
        resultType: body.resultType || "play",
        validationMessage: null, // 編集されたらバリデーションエラーはクリアする
      })
      .where(eq(playLogs.id, logId));
    return c.json({ success: true });
  } catch (error) {
    console.error("Error updating play log:", error);
    return c.json({ success: false, error: "Failed to update play log" }, 500);
  }
});

app.patch("/logs/:logId/resolve", async (c) => {
  const db = drizzle(c.env.DB);
  const logId = c.req.param("logId");

  try {
    await db.update(playLogs)
      .set({ validationMessage: null })
      .where(eq(playLogs.id, logId));
    return c.json({ success: true });
  } catch (error) {
    console.error("Error resolving play log validation:", error);
    return c.json({ success: false, error: "Failed to resolve validation" }, 500);
  }
});

app.delete("/logs/:logId", async (c) => {
  const db = drizzle(c.env.DB);
  const logId = c.req.param("logId");

  try {
    await db.delete(playLogs).where(eq(playLogs.id, logId));
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting play log:", error);
    return c.json({ success: false, error: "Failed to delete play log" }, 500);
  }
});

app.delete("/:id", async (c) => {
  try {
    await MatchService.deleteMatch(drizzle(c.env.DB), c.req.param("id"));
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: "Failed to delete match" }, 500);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📊 個人成績自動集計 ＆ 打席履歴（Boxscore）API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.get("/:id/boxscore", async (c) => {
  const db = drizzle(c.env.DB);
  const matchId = c.req.param("id");

  try {
    // playersテーブルと結合してバッターとピッチャーの名前を取得
    const rows = await db.select({
      id: atBats.id,
      inning: atBats.inning,
      isTop: atBats.isTop,
      result: atBats.result,
      batterId: atBats.batterId,
      batterName: sql<string>`batter.name`,
      batterNumber: sql<string>`batter.number`,
      pitcherId: atBats.pitcherId,
      pitcherName: sql<string>`pitcher.name`,
    })
    .from(atBats)
    .leftJoin(sql`players as batter`, sql`batter.id = ${atBats.batterId}`)
    .leftJoin(sql`players as pitcher`, sql`pitcher.id = ${atBats.pitcherId}`)
    .where(eq(atBats.matchId, matchId))
    .orderBy(atBats.inning, atBats.createdAt)
    .all();

    return c.json(rows);
  } catch (error) {
    console.error("Boxscore API error:", error);
    return c.json([], 500);
  }
});

app.get("/:id/stats", async (c) => {
  const db = drizzle(c.env.DB);
  const matchId = c.req.param("id");

  try {
    const match = await db.select().from(matches).where(eq(matches.id, matchId)).get();
    if (!match) return c.json({ success: false, error: "Match not found" }, 404);

    const isMyTeamTop = match.battingOrder === "first";

    const dbAtBats = await db.select({
      id: atBats.id,
      inning: atBats.inning,
      isTop: atBats.isTop,
      result: atBats.result,
      batterId: atBats.batterId,
      batterName: sql<string>`batter.name`,
      batterNumber: sql<string>`batter.number`,
      pitcherId: atBats.pitcherId,
      pitcherName: sql<string>`pitcher.name`,
      pitcherNumber: sql<string>`pitcher.number`,
    })
    .from(atBats)
    .leftJoin(sql`players as batter`, sql`batter.id = ${atBats.batterId}`)
    .leftJoin(sql`players as pitcher`, sql`pitcher.id = ${atBats.pitcherId}`)
    .where(eq(atBats.matchId, matchId))
    .all();

    const dbAdvances = await db.select()
      .from(baseAdvances)
      .where(eq(baseAdvances.matchId, matchId))
      .all();

    const runsList = dbAdvances.filter(a => a.toBase === 4 && !a.isOut);

    // --- 打者成績集計 ---
    const batterMap = new Map<string, any>();

    for (const ab of dbAtBats) {
      const isMyAttack = ab.isTop === isMyTeamTop;
      if (!isMyAttack || !ab.batterId) continue;

      const batterId = ab.batterId;
      if (!batterMap.has(batterId)) {
        batterMap.set(batterId, {
          id: batterId,
          name: ab.batterName || "不明",
          number: ab.batterNumber || "-",
          plateAppearances: 0,
          atBats: 0,
          runs: 0,
          hits: 0,
          rbi: 0,
          strikeouts: 0,
          walks: 0,
        });
      }

      const p = batterMap.get(batterId);
      p.plateAppearances++;

      const res = ab.result || "";
      const isWalk = res.includes("BB") || res.includes("HP") || res.includes("DB") || res.includes("四球") || res.includes("死球");
      const isSacrifice = res.includes("SF") || res.includes("SH") || res.includes("犠");

      if (!isWalk && !isSacrifice) {
        p.atBats++;
      }

      if (isWalk) {
        p.walks++;
      }

      if (res.includes("1B") || res.includes("2B") || res.includes("3B") || res.includes("HR") || res.includes("安") || res.includes("本塁打")) {
        p.hits++;
      }

      if (res.includes("K") || res.includes("三振")) {
        p.strikeouts++;
      }

      const rbiCount = runsList.filter(a => a.atBatId === ab.id).length;
      p.rbi += rbiCount;
    }

    for (const run of runsList) {
      if (run.runnerId && batterMap.has(run.runnerId)) {
        batterMap.get(run.runnerId).runs++;
      }
    }

    const batterStatsList = Array.from(batterMap.values()).map(p => {
      const avgVal = p.atBats > 0 ? (p.hits / p.atBats) : 0;
      let avgStr = avgVal.toFixed(3);
      if (avgStr.startsWith("0.")) {
        avgStr = avgStr.substring(1);
      } else if (avgStr === "1.000") {
        avgStr = "1.00";
      }
      return {
        ...p,
        avg: p.atBats > 0 ? avgStr : ".000"
      };
    });

    // --- 投手成績集計 ---
    const pitcherMap = new Map<string, any>();

    for (const ab of dbAtBats) {
      const isMyDefense = ab.isTop !== isMyTeamTop;
      if (!isMyDefense || !ab.pitcherId) continue;

      const pitcherId = ab.pitcherId;
      if (!pitcherMap.has(pitcherId)) {
        pitcherMap.set(pitcherId, {
          id: pitcherId,
          name: ab.pitcherName || "不明",
          number: ab.pitcherNumber || "-",
          outs: 0,
          hits: 0,
          walks: 0,
          strikeouts: 0,
          runs: 0,
          earnedRuns: 0,
        });
      }

      const p = pitcherMap.get(pitcherId);
      const res = ab.result || "";

      if (res.includes("1B") || res.includes("2B") || res.includes("3B") || res.includes("HR") || res.includes("安") || res.includes("本塁打")) {
        p.hits++;
      }

      if (res.includes("BB") || res.includes("HP") || res.includes("DB") || res.includes("四球") || res.includes("死球")) {
        p.walks++;
      }

      if (res.includes("K") || res.includes("三振")) {
        p.strikeouts++;
      }

      const isOut = res.includes("アウト") || res.includes("K") || res.includes("三振") || 
                    res.includes("ゴロ") || res.includes("フライ") || res.includes("ライナー") || 
                    res.includes("併殺") || res.includes("犠") || 
                    /^[1-9]-[1-9]$/.test(res) || 
                    /^[1-9]F$/.test(res) || 
                    /^[1-9]L$/.test(res) || 
                    res.includes("DP");

      if (isOut) {
        if (res.includes("併殺") || res.includes("DP")) {
          p.outs += 2;
        } else {
          p.outs += 1;
        }
      }
    }

    for (const run of runsList) {
      const ab = dbAtBats.find(a => a.id === run.atBatId);
      if (ab && ab.pitcherId && pitcherMap.has(ab.pitcherId)) {
        const p = pitcherMap.get(ab.pitcherId);
        p.runs++;
        p.earnedRuns++;
      }
    }

    const pitcherStatsList = Array.from(pitcherMap.values()).map(p => {
      const inningsInt = Math.floor(p.outs / 3);
      const inningsFrac = p.outs % 3;
      const ipStr = inningsFrac > 0 ? `${inningsInt}.${inningsFrac}` : `${inningsInt}.0`;

      const eraVal = p.outs > 0 ? (p.earnedRuns * 7 * 3) / p.outs : 0;

      return {
        ...p,
        ip: ipStr,
        era: p.outs > 0 ? eraVal.toFixed(2) : "0.00"
      };
    });

    return c.json({
      success: true,
      stats: batterStatsList,
      pitcherStats: pitcherStatsList
    });
  } catch (error) {
    console.error("Stats API error:", error);
    return c.json({ success: false, error: "Failed to generate stats", stats: [], pitcherStats: [] }, 500);
  }
});

export default app;