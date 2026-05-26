// src/api/matches.ts
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { MatchService } from "@/services/match.service";
import { eq, sql } from "drizzle-orm";
import { matchUndoHistories, atBats, playLogs } from "@/db/schema/score";
import { matches } from "@/db/schema/match";

const app = new Hono<{ Bindings: { DB: D1Database } }>();

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
    const logs = await MatchService.getPlayLogs(drizzle(c.env.DB), c.req.param("id"));
    return c.json({ success: true, logs });
  } catch (error) {
    return c.json({ success: false, error: "Failed to fetch play logs" }, 500);
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
      })
      .where(eq(playLogs.id, logId));
    return c.json({ success: true });
  } catch (error) {
    console.error("Error updating play log:", error);
    return c.json({ success: false, error: "Failed to update play log" }, 500);
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

export default app;