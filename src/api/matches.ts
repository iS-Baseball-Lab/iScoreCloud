// src/api/matches.ts
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { MatchService } from "@/services/match.service";

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

app.delete("/:id", async (c) => {
  try {
    await MatchService.deleteMatch(drizzle(c.env.DB), c.req.param("id"));
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: "Failed to delete match" }, 500);
  }
});

export default app;