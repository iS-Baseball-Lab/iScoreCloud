// filepath: src/api/matches.ts
import { ensureMatchLineupColumns } from "@/lib/db-helper";
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { MatchService } from "@/services/match.service";
import { eq, sql, desc, asc, and, inArray } from "drizzle-orm";
import {
  matchUndoHistories,
  atBats,
  playLogs,
  baseAdvances,
  pitches,
  matchScorebookSnapshots,
  matchLiveReports,
} from "@/db/schema/score";
import { matches, matchLineups } from "@/db/schema/match";
import { players } from "@/db/schema/team";
import {
  classifyAtBatResultToken,
  classifyDroppedThirdStrikeReach,
  evaluateHalfInningPitcherCharges,
  extractFieldingCreditsForAtBat,
  formatOfficialBaseballRate,
  mapSnapshotAdvancesToPitchingEvents,
  type HalfInningAdvanceEventInput,
  type HalfInningAtBatPitchingInput,
} from "@/lib/liff/baseball-official-rules";
import {
  normalizeLegacyForceOutAtBat,
  repairPlayLogForceOutDescription,
} from "@/lib/liff/scorebook-fielding";
import { simulateSheetRunners } from "@/lib/liff/scorebook-runners";
import type { WorkerEnv } from "@/types/api";
import type {
  ScorebookSheetStructure,
  ScorebookV2AtBat,
} from "@/types/scorebook-v2";
import scorebookRouter from "./matches/scorebook";

const app = new Hono<{ Bindings: WorkerEnv }>();

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
    const db = drizzle(c.env.DB);
    const matchId = c.req.param("id");
    await ensureMatchLineupColumns(c.env.DB);
    const matchData = await MatchService.getMatchById(db, matchId);
    if (!matchData) return c.json({ success: false, error: "Match not found" }, 404);

    // 前後の試合を取得（日付区切り文字揺れも吸収して降順整列）
    const rawMatchesList = await db
      .select({
        id: matches.id,
        opponent: matches.opponent,
        date: matches.date,
      })
      .from(matches)
      .where(eq(matches.teamId, matchData.teamId))
      .orderBy(desc(matches.date), desc(matches.createdAt))
      .all();

    const matchesList = [...rawMatchesList].sort((a, b) =>
      b.date.replace(/\//g, "-").localeCompare(a.date.replace(/\//g, "-"))
    );

    const currentIndex = matchesList.findIndex((m) => m.id === matchId);
    const totalMatches = matchesList.length;
    // 時系列順の通し番号（最古=1, 最新=totalMatches。例: 最新試合なら 17/17）
    const matchOrderNumber =
      currentIndex !== -1 ? totalMatches - currentIndex : null;
    const prevMatch =
      currentIndex !== -1 && currentIndex < totalMatches - 1
        ? matchesList[currentIndex + 1]
        : null; // 時系列で古い試合 (DESCなので index が後ろ)
    const nextMatch =
      currentIndex !== -1 && currentIndex > 0
        ? matchesList[currentIndex - 1]
        : null; // 時系列で新しい試合 (DESCなので index が前)

    return c.json({
      success: true,
      match: matchData,
      prevMatchId: prevMatch?.id ?? null,
      nextMatchId: nextMatch?.id ?? null,
      prevMatch,
      nextMatch,
      matchOrderNumber,
      totalMatches,
    });
  } catch (error) {
    return c.json({ success: false, error: "Failed to fetch match" }, 500);
  }
});

app.get("/:id/undo-history", async (c) => {
  const db = drizzle(c.env.DB);
  const matchId = c.req.param("id");

  try {
    const result = await db
      .select({
        historyJson: matchUndoHistories.historyJson,
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
    await ensureMatchLineupColumns(c.env.DB);
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
    const [logs, matchData] = await Promise.all([
      MatchService.getPlayLogs(db, matchId),
      db
        .select({ scorebookValidations: matches.scorebookValidations })
        .from(matches)
        .where(eq(matches.id, matchId))
        .get(),
    ]);
    let validationMessages: unknown[] = [];
    if (matchData?.scorebookValidations) {
      try {
        validationMessages = JSON.parse(matchData.scorebookValidations);
      } catch {}
    }

    return c.json({ success: true, logs, validationMessages });
  } catch (error) {
    return c.json({ success: false, error: "Failed to fetch play logs" }, 500);
  }
});

app.post("/:id/validations/resolve", async (c) => {
  try {
    const db = drizzle(c.env.DB);
    await db.update(matches).set({ scorebookValidations: "[]" }).where(eq(matches.id, c.req.param("id")));
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: "Failed to resolve validations" }, 500);
  }
});

async function deleteMatchPersonalRecordsSafely(
  db: ReturnType<typeof drizzle>,
  bucket: R2Bucket | undefined,
  matchId: string
): Promise<number> {
  const existingAbs = await db
    .select({ id: atBats.id })
    .from(atBats)
    .where(eq(atBats.matchId, matchId))
    .all();
  const abIds = existingAbs.map((r) => r.id);

  // 外部キー制約（base_advances.pitch_id -> pitches.id, play_logs.at_bat_id -> at_bats.id）を遵守し子テーブルから順に削除
  await db.delete(baseAdvances).where(eq(baseAdvances.matchId, matchId));
  await db.delete(playLogs).where(eq(playLogs.matchId, matchId));

  const idChunkSize = 40;
  for (let i = 0; i < abIds.length; i += idChunkSize) {
    const slice = abIds.slice(i, i + idChunkSize);
    if (slice.length === 0) continue;
    await db.delete(pitches).where(inArray(pitches.atBatId, slice));
    await db.delete(atBats).where(inArray(atBats.id, slice));
  }
  await db.delete(atBats).where(eq(atBats.matchId, matchId));

  try {
    const existingSnap = await db
      .select({
        topImageUrl: matchScorebookSnapshots.topImageUrl,
        bottomImageUrl: matchScorebookSnapshots.bottomImageUrl,
      })
      .from(matchScorebookSnapshots)
      .where(eq(matchScorebookSnapshots.matchId, matchId))
      .get();

    if (existingSnap && bucket) {
      const prefix = "/api/images/";
      for (const url of [
        existingSnap.topImageUrl,
        existingSnap.bottomImageUrl,
      ]) {
        if (url && url.startsWith("/api/images/scorebooks/")) {
          const r2Key = url.slice(prefix.length);
          await bucket.delete(r2Key).catch(() => {});
        }
      }
    }
    await db
      .delete(matchScorebookSnapshots)
      .where(eq(matchScorebookSnapshots.matchId, matchId));
  } catch {
    // snapshot table optional in older environments
  }

  try {
    await db
      .delete(matchUndoHistories)
      .where(eq(matchUndoHistories.matchId, matchId));
  } catch {
    // undo table optional
  }

  return abIds.length;
}

// 🌟 プレイログと個人成績データをすべて削除（試合の基本情報・イニングスコアは保持）
app.delete("/:id/reset-logs", async (c) => {
  try {
    const db = drizzle(c.env.DB);
    const matchId = c.req.param("id");
    const clearLineups =
      c.req.query("clearLineups") === "1" ||
      c.req.query("clearLineups") === "true";
    const resetMatchScore =
      c.req.query("resetMatchScore") === "1" ||
      c.req.query("resetMatchScore") === "true";

    const deletedAtBatsCount = await deleteMatchPersonalRecordsSafely(
      db,
      c.env.BUCKET,
      matchId
    );

    if (clearLineups) {
      await db.delete(matchLineups).where(eq(matchLineups.matchId, matchId));
    } else {
      await db
        .delete(matchLineups)
        .where(
          and(
            eq(matchLineups.matchId, matchId),
            eq(matchLineups.isStarting, false)
          )
        );
    }

    const patch: Partial<typeof matches.$inferInsert> = {
      scorebookValidations: "[]",
      balls: 0,
      strikes: 0,
      outs: 0,
      runners: JSON.stringify({ base1: null, base2: null, base3: null }),
    };
    if (clearLineups) {
      patch.myLineup = "[]";
      patch.opponentLineup = "[]";
      patch.opponentBench = "[]";
    }
    if (resetMatchScore) {
      patch.myScore = 0;
      patch.opponentScore = 0;
      patch.myInningScores = "[]";
      patch.opponentInningScores = "[]";
      patch.myHits = 0;
      patch.opponentHits = 0;
      patch.myErrors = 0;
      patch.opponentErrors = 0;
    }

    await db.update(matches).set(patch).where(eq(matches.id, matchId));

    return c.json({ success: true, deletedAtBatsCount });
  } catch (error) {
    console.error("Failed to reset logs:", error);
    return c.json({ success: false, error: "Failed to reset play logs" }, 500);
  }
});

app.put("/:id/lineups", async (c) => {
  try {
    const body = (await c.req.json()) as {
      myLineup?: unknown[];
      opponentLineup?: unknown[];
      opponentBench?: unknown[];
      myAttendance?: Record<string, unknown>;
    };
    await ensureMatchLineupColumns(c.env.DB);
    await MatchService.saveMatchLineups(
      drizzle(c.env.DB),
      c.req.param("id"),
      Array.isArray(body.myLineup) ? body.myLineup : [],
      Array.isArray(body.opponentLineup) ? body.opponentLineup : [],
      body.myAttendance !== undefined && typeof body.myAttendance === "object" && body.myAttendance !== null
        ? body.myAttendance
        : undefined,
      Array.isArray(body.opponentBench) ? body.opponentBench : undefined
    );
    return c.json({ success: true });
  } catch (error) {
    console.error("Error in PUT /api/matches/:id/lineups:", error);
    return c.json({ success: false, error: "Failed to save lineups" }, 500);
  }
});

app.post("/", async (c) => {
  try {
    await ensureMatchLineupColumns(c.env.DB);
    const body = await c.req.json();
    const matchId = await MatchService.createMatch(drizzle(c.env.DB), body);
    return c.json({ success: true, matchId });
  } catch (error) {
    return c.json({ success: false, error: "Failed to create match" }, 500);
  }
});

app.patch("/:id", async (c) => {
  try {
    await ensureMatchLineupColumns(c.env.DB);
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
    // 外部キー制約を遵守して関連テーブルを一括クリア＆ matches レコードを 0 リセット
    await deleteMatchPersonalRecordsSafely(db, c.env.BUCKET, matchId);
    await db
      .update(matches)
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
        scorebookValidations: "[]",
        status: "live",
      })
      .where(eq(matches.id, matchId));

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

    // 🌟 新機能：atBatの取得と、チームのrosterの取得
    let atBat = null;
    if (log.atBatId) {
      atBat = await db.select().from(atBats).where(eq(atBats.id, log.atBatId)).get();
    }

    // フォールバック: atBatIdが未保存の既存データの場合、作成日時が完全に一致する打席データを探す
    if (!atBat) {
      atBat = await db
        .select()
        .from(atBats)
        .where(and(eq(atBats.matchId, log.matchId), eq(atBats.createdAt, log.createdAt)))
        .get();

      // 見つかった場合、次回以降のために atBatId を保存して修復しておく
      if (atBat) {
        await db.update(playLogs).set({ atBatId: atBat.id }).where(eq(playLogs.id, log.id));
        log.atBatId = atBat.id;
      }
    }

    // Roster 取得のためにチームIDを引く
    const match = await db
      .select({ teamId: matches.teamId })
      .from(matches)
      .where(eq(matches.id, log.matchId))
      .get();
    let roster: any[] = [];
    if (match) {
      roster = await db.select().from(players).where(eq(players.teamId, match.teamId)).all();
    }

    const formattedLog = {
      id: log.id,
      matchId: log.matchId,
      atBatId: log.atBatId,
      batterId: atBat?.batterId || null,
      pitcherId: atBat?.pitcherId || null,
      inningText: log.inningText,
      resultType: log.resultType,
      description: log.description,
      createdAt:
        log.createdAt instanceof Date
          ? log.createdAt.getTime()
          : new Date(log.createdAt).getTime(),
    };
    return c.json({ success: true, log: formattedLog, roster });
  } catch (error) {
    return c.json({ success: false, error: "Failed to fetch play log" }, 500);
  }
});

app.put("/logs/:logId", async (c) => {
  const db = drizzle(c.env.DB);
  const logId = c.req.param("logId");

  try {
    const body = await c.req.json();
    await db
      .update(playLogs)
      .set({
        description: body.description,
        resultType: body.resultType || "play",
        validationMessage: null, // 編集されたらバリデーションエラーはクリアする
      })
      .where(eq(playLogs.id, logId));

    // もし atBatId があって、batterId や pitcherId も送られてきていたら更新
    if (body.atBatId && (body.batterId !== undefined || body.pitcherId !== undefined)) {
      const updateData: any = {};
      if (body.batterId !== undefined) updateData.batterId = body.batterId || null;
      if (body.pitcherId !== undefined) updateData.pitcherId = body.pitcherId || null;

      await db.update(atBats).set(updateData).where(eq(atBats.id, body.atBatId));
    }

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
    await db
      .update(playLogs)
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
    const db = drizzle(c.env.DB);
    const matchId = c.req.param("id");
    await deleteMatchPersonalRecordsSafely(db, c.env.BUCKET, matchId);
    try {
      await db
        .delete(matchLiveReports)
        .where(eq(matchLiveReports.matchId, matchId));
    } catch {
      // live reports table optional in older environments
    }
    await MatchService.deleteMatch(db, matchId);
    return c.json({ success: true, deletedMatchId: matchId });
  } catch (error) {
    console.error("Failed to delete match completely:", error);
    return c.json({ success: false, error: "試合データの削除に失敗しました" }, 500);
  }
});

app.post("/:id/reaggregate", async (c) => {
  const db = drizzle(c.env.DB);
  const matchId = c.req.param("id");

  try {
    const logs = await db.select().from(playLogs).where(eq(playLogs.matchId, matchId)).all();

    // atBatsとplayersをJOINしてbatterNameを取得
    const bats = await db
      .select({
        id: atBats.id,
        inning: atBats.inning,
        isTop: atBats.isTop,
        batterName: players.name,
      })
      .from(atBats)
      .leftJoin(players, eq(players.id, atBats.batterId))
      .where(eq(atBats.matchId, matchId))
      .all();

    const batchQueries: any[] = [];
    const usedBatIds = new Set<string>();

    const debugParsed: any[] = [];

    for (const log of logs) {
      // ログのテキストから選手名と結果を抽出（"1番 山田: 安打", "undefined番 山田: 安打", "山田: 安打" など全てに対応）
      const match = log.description.match(/^(?:.*?番\s*)?([^:]+):\s*(.*)$/);
      if (match) {
        const batterName = match[1].trim();
        const resultText = match[2].trim();
        const inning = parseInt(log.inningText) || 1;
        const isTop = log.inningText.includes("表");

        // 該当する atBat を探す（イニング、表裏が一致し、さらに名前から空白を除去して一致確認）
        // 名前の揺れ（半角・全角スペース）を吸収するため replace(/\s+/g, '') を使用
        const targetBat = bats.find((b) => {
          const isSameInning = b.inning == inning;
          const isSameTop = b.isTop == isTop;
          if (!isSameInning || !isSameTop) return false;
          if (usedBatIds.has(b.id)) return false;

          // b.batterName が無い（未登録の相手選手など）場合はそのまま許可（時系列フォールバック）
          if (!b.batterName) return true;

          // 空白を全て除去して比較
          const dbName = b.batterName.replace(/[\s　]+/g, "");
          const logName = batterName.replace(/[\s　]+/g, "");
          return dbName === logName;
        });

        debugParsed.push({
          logId: log.id,
          inning,
          isTop,
          batterName,
          resultText,
          foundTargetBatId: targetBat?.id || null,
          b_isTop_type: targetBat ? typeof targetBat.isTop : null,
          b_inning_type: targetBat ? typeof targetBat.inning : null,
        });

        if (targetBat) {
          usedBatIds.add(targetBat.id);
          batchQueries.push(
            db.update(atBats).set({ result: resultText }).where(eq(atBats.id, targetBat.id))
          );
        }
      } else {
        debugParsed.push({ logId: log.id, failedMatch: log.description });
      }
    }

    if (batchQueries.length > 0) {
      await db.batch(batchQueries as [any, ...any[]]);
    }

    return c.json({
      success: true,
      updatedCount: batchQueries.length,
      debug: debugParsed,
      sampleBats: bats.slice(0, 3),
    });
  } catch (error) {
    console.error("Reaggregate API error:", error);
    return c.json({ success: false, error: "再集計処理に失敗しました" }, 500);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📊 個人成績自動集計 ＆ 打席履歴（Boxscore）API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface BatterStatsAccumulator {
  id: string;
  name: string;
  number: string;
  battingOrder?: number;
  position?: string;
  isSub?: boolean;
  plateAppearances: number;
  atBats: number;
  singles: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  hits: number;
  walks: number;
  hitByPitch: number;
  runs: number;
  rbi: number;
  stolenBases: number;
  caughtStealing: number;
  strikeouts: number;
  sacBunts: number;
  sacFlies: number;
  leftOnBase: number;
  errors: number;
  doublePlays: number;
  assists: number;
  putouts: number;
  sortOrder: number;
  sortSubOrder: number;
}

interface PitcherStatsAccumulator {
  id: string;
  name: string;
  number: string;
  outs: number;
  pitches: number;
  battersFaced: number;
  hits: number;
  homeRuns: number;
  sacBunts: number;
  sacFlies: number;
  strikeouts: number;
  walks: number;
  hitByPitch: number;
  wildPitches: number;
  balks: number;
  runs: number;
  earnedRuns: number;
  sortOrder: number;
}

interface MatchGameDetailsPayload {
  double: string[];
  triple: string[];
  homeRun: string[];
  sacrificeBunt: string[];
  sacrificeFly: string[];
  stolenBase: string[];
  doublePlay: string[];
}

function safeParseJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function normalizeLookupName(raw: string | null | undefined): string {
  return (raw || "").replace(/[\s　]+/g, "").trim();
}

function extractBatterNameFromPlayLog(descText: string | null | undefined): string {
  if (!descText) return "";
  const firstLine = descText.split("\n")[0] || "";
  const m = firstLine.match(/^(?:\d+番\s*)?([^:：]+)[：:]/);
  if (!m) return "";
  const name = m[1].trim();
  return name === "打者" || name === "不明" ? "" : name;
}

function normalizeFieldingPosCode(raw: string | null | undefined): string {
  const s = (raw || "").trim().toUpperCase();
  const map: Record<string, string> = {
    "1": "1",
    投: "1",
    P: "1",
    "2": "2",
    捕: "2",
    C: "2",
    "3": "3",
    一: "3",
    "1B": "3",
    "4": "4",
    二: "4",
    "2B": "4",
    "5": "5",
    三: "5",
    "3B": "5",
    "6": "6",
    遊: "6",
    SS: "6",
    "7": "7",
    左: "7",
    LF: "7",
    "8": "8",
    中: "8",
    CF: "8",
    "9": "9",
    右: "9",
    RF: "9",
  };
  return map[s] || "";
}

app.get("/:id/boxscore", async (c) => {
  const db = drizzle(c.env.DB);
  const matchId = c.req.param("id");

  try {
    const [rows, snapRow, logs] = await Promise.all([
      db
        .select({
          id: atBats.id,
          inning: atBats.inning,
          isTop: atBats.isTop,
          result: atBats.result,
          batterId: atBats.batterId,
          batterName: sql<string>`batter.name`,
          batterNumber: sql<string>`batter.uniform_number`,
          pitcherId: atBats.pitcherId,
          pitcherName: sql<string>`pitcher.name`,
        })
        .from(atBats)
        .leftJoin(sql`players as batter`, sql`batter.id = ${atBats.batterId}`)
        .leftJoin(sql`players as pitcher`, sql`pitcher.id = ${atBats.pitcherId}`)
        .where(eq(atBats.matchId, matchId))
        .orderBy(atBats.inning, atBats.createdAt)
        .all(),
      db
        .select()
        .from(matchScorebookSnapshots)
        .where(eq(matchScorebookSnapshots.matchId, matchId))
        .get()
        .catch(() => undefined),
      db
        .select({ atBatId: playLogs.atBatId, description: playLogs.description })
        .from(playLogs)
        .where(eq(playLogs.matchId, matchId))
        .all()
        .catch(() => [] as Array<{ atBatId: string | null; description: string | null }>),
    ]);

    let topSnapAtBats: ScorebookV2AtBat[] = [];
    let bottomSnapAtBats: ScorebookV2AtBat[] = [];
    const logDescByAtBatId = new Map<string, string>();
    if (snapRow) {
      topSnapAtBats = safeParseJson<ScorebookV2AtBat[]>(snapRow.topAtBatsJson) || [];
      bottomSnapAtBats = safeParseJson<ScorebookV2AtBat[]>(snapRow.bottomAtBatsJson) || [];
    }
    for (const l of logs) {
      if (l.atBatId && l.description) logDescByAtBatId.set(l.atBatId, l.description);
    }

    const seqCountByInningSide = new Map<string, number>();
    const snapByInningSide = new Map<string, ScorebookV2AtBat[]>();
    for (const sAb of topSnapAtBats) {
      const k = `${sAb.inning}:1`;
      const list = snapByInningSide.get(k) || [];
      list.push(sAb);
      snapByInningSide.set(k, list);
    }
    for (const sAb of bottomSnapAtBats) {
      const k = `${sAb.inning}:0`;
      const list = snapByInningSide.get(k) || [];
      list.push(sAb);
      snapByInningSide.set(k, list);
    }

    const enrichedRows = rows.map((r) => {
      const sideKey = `${r.inning}:${r.isTop ? 1 : 0}`;
      const idx = seqCountByInningSide.get(sideKey) || 0;
      seqCountByInningSide.set(sideKey, idx + 1);
      const snapAb = snapByInningSide.get(sideKey)?.[idx];
      const fallbackBatter =
        snapAb?.batterName?.trim() ||
        extractBatterNameFromPlayLog(logDescByAtBatId.get(r.id)) ||
        "";
      const fallbackPitcher = snapAb?.pitcherName?.trim() || "";
      return {
        ...r,
        batterName: r.batterName || fallbackBatter,
        pitcherName: r.pitcherName || fallbackPitcher,
      };
    });

    return c.json(enrichedRows);
  } catch (error) {
    console.error("Boxscore API error:", error);
    return c.json([], 500);
  }
});

app.get("/:id/stats", async (c) => {
  const db = drizzle(c.env.DB);
  const matchId = c.req.param("id");

  try {
    await ensureMatchLineupColumns(c.env.DB);
    const [
      match,
      dbAtBats,
      dbAdvances,
      dbPitches,
      dbPlayLogs,
      snapRow,
      dbLineups,
    ] = await Promise.all([
      db.select().from(matches).where(eq(matches.id, matchId)).get(),
      db
        .select({
          id: atBats.id,
          inning: atBats.inning,
          isTop: atBats.isTop,
          result: atBats.result,
          batterId: atBats.batterId,
          batterName: sql<string>`batter.name`,
          batterNumber: sql<string>`batter.uniform_number`,
          pitcherId: atBats.pitcherId,
          pitcherName: sql<string>`pitcher.name`,
          pitcherNumber: sql<string>`pitcher.uniform_number`,
        })
        .from(atBats)
        .leftJoin(sql`players as batter`, sql`batter.id = ${atBats.batterId}`)
        .leftJoin(sql`players as pitcher`, sql`pitcher.id = ${atBats.pitcherId}`)
        .where(eq(atBats.matchId, matchId))
        .orderBy(asc(atBats.inning), asc(atBats.createdAt))
        .all(),
      db
        .select({
          id: baseAdvances.id,
          matchId: baseAdvances.matchId,
          atBatId: baseAdvances.atBatId,
          pitchId: baseAdvances.pitchId,
          runnerId: baseAdvances.runnerId,
          fromBase: baseAdvances.fromBase,
          toBase: baseAdvances.toBase,
          reason: baseAdvances.reason,
          isOut: baseAdvances.isOut,
          runnerName: sql<string>`runner.name`,
          runnerNumber: sql<string>`runner.uniform_number`,
        })
        .from(baseAdvances)
        .leftJoin(sql`players as runner`, sql`runner.id = ${baseAdvances.runnerId}`)
        .where(eq(baseAdvances.matchId, matchId))
        .all(),
      db
        .select({
          id: pitches.id,
          atBatId: pitches.atBatId,
          result: pitches.result,
        })
        .from(pitches)
        .innerJoin(atBats, eq(pitches.atBatId, atBats.id))
        .where(eq(atBats.matchId, matchId))
        .all(),
      db
        .select({
          atBatId: playLogs.atBatId,
          description: playLogs.description,
        })
        .from(playLogs)
        .where(eq(playLogs.matchId, matchId))
        .all(),
      db
        .select()
        .from(matchScorebookSnapshots)
        .where(eq(matchScorebookSnapshots.matchId, matchId))
        .get()
        .catch(() => undefined),
      db
        .select({
          playerId: matchLineups.playerId,
          battingOrder: matchLineups.battingOrder,
          position: matchLineups.position,
          isStarting: matchLineups.isStarting,
          inningEntered: matchLineups.inningEntered,
          name: players.name,
          uniformNumber: players.uniformNumber,
        })
        .from(matchLineups)
        .leftJoin(players, eq(matchLineups.playerId, players.id))
        .where(eq(matchLineups.matchId, matchId))
        .orderBy(asc(matchLineups.battingOrder), asc(matchLineups.inningEntered))
        .all()
        .catch(() => [] as Array<{
          playerId: string;
          battingOrder: number;
          position: string;
          isStarting: boolean;
          inningEntered: number | null;
          name: string | null;
          uniformNumber: string | null;
        }>),
    ]);

    if (!match) return c.json({ success: false, error: "Match not found" }, 404);

    const isMyTeamTop = match.battingOrder === "first";

    let myStructure: ScorebookSheetStructure | null = null;
    let oppStructure: ScorebookSheetStructure | null = null;
    let mySnapAtBats: ScorebookV2AtBat[] = [];
    let oppSnapAtBats: ScorebookV2AtBat[] = [];

    if (snapRow) {
      const topStruct = safeParseJson<ScorebookSheetStructure>(snapRow.topStructureJson);
      const botStruct = safeParseJson<ScorebookSheetStructure>(snapRow.bottomStructureJson);
      const topAbs = (
        safeParseJson<ScorebookV2AtBat[]>(snapRow.topAtBatsJson) || []
      ).map((ab) => normalizeLegacyForceOutAtBat(ab));
      const botAbs = (
        safeParseJson<ScorebookV2AtBat[]>(snapRow.bottomAtBatsJson) || []
      ).map((ab) => normalizeLegacyForceOutAtBat(ab));
      myStructure = isMyTeamTop ? topStruct : botStruct;
      oppStructure = isMyTeamTop ? botStruct : topStruct;
      mySnapAtBats = isMyTeamTop ? topAbs : botAbs;
      oppSnapAtBats = isMyTeamTop ? botAbs : topAbs;
    }

    const explicitRbiByAtBatId = new Map<string, number>();
    const playLogDescByAtBatId = new Map<string, string>();
    for (const pl of dbPlayLogs) {
      if (!pl.atBatId || !pl.description) continue;
      playLogDescByAtBatId.set(
        pl.atBatId,
        repairPlayLogForceOutDescription(pl.description)
      );
      const rbiMatch = pl.description.match(/打点(\d+)/);
      if (rbiMatch) {
        explicitRbiByAtBatId.set(pl.atBatId, Number(rbiMatch[1]));
      }
    }

    // DB打席とスナップショット打席を (inning, isTop) 内の時系列順で対応付け
    const snapMapByDbAtBatId = new Map<string, ScorebookV2AtBat>();
    const mySnapQueueByInn = new Map<number, ScorebookV2AtBat[]>();
    for (const sAb of mySnapAtBats) {
      const q = mySnapQueueByInn.get(sAb.inning) || [];
      q.push(sAb);
      mySnapQueueByInn.set(sAb.inning, q);
    }
    const oppSnapQueueByInn = new Map<number, ScorebookV2AtBat[]>();
    for (const sAb of oppSnapAtBats) {
      const q = oppSnapQueueByInn.get(sAb.inning) || [];
      q.push(sAb);
      oppSnapQueueByInn.set(sAb.inning, q);
    }
    const myInnOffsets = new Map<number, number>();
    const oppInnOffsets = new Map<number, number>();
    for (const ab of dbAtBats) {
      if (ab.isTop === isMyTeamTop) {
        const idx = myInnOffsets.get(ab.inning) || 0;
        myInnOffsets.set(ab.inning, idx + 1);
        const sAb = mySnapQueueByInn.get(ab.inning)?.[idx];
        if (sAb) snapMapByDbAtBatId.set(ab.id, sAb);
      } else {
        const idx = oppInnOffsets.get(ab.inning) || 0;
        oppInnOffsets.set(ab.inning, idx + 1);
        const sAb = oppSnapQueueByInn.get(ab.inning)?.[idx];
        if (sAb) snapMapByDbAtBatId.set(ab.id, sAb);
      }
    }

    // 選手名簿・スコアブック骨格・ラインナップから (playerId / cleanName) -> 表示情報・打順メタデータを索引化
    interface PlayerMetaInfo {
      key: string;
      name: string;
      number: string;
      battingOrder?: number;
      position?: string;
      isSub?: boolean;
      sortOrder: number;
      sortSubOrder: number;
    }

    const metaByKey = new Map<string, PlayerMetaInfo>();
    const keyByCleanName = new Map<string, string>();

    const registerMeta = (info: PlayerMetaInfo) => {
      const prev = metaByKey.get(info.key);
      if (!prev) {
        metaByKey.set(info.key, info);
      } else {
        metaByKey.set(info.key, {
          ...prev,
          name: prev.name && prev.name !== "不明" ? prev.name : info.name,
          number: prev.number && prev.number !== "-" ? prev.number : info.number,
          battingOrder: prev.battingOrder ?? info.battingOrder,
          position: prev.position || info.position,
          isSub: prev.isSub ?? info.isSub,
          sortOrder: Math.min(prev.sortOrder, info.sortOrder),
          sortSubOrder: Math.min(prev.sortSubOrder, info.sortSubOrder),
        });
      }
      const cn = normalizeLookupName(info.name);
      if (cn && !keyByCleanName.has(cn)) {
        keyByCleanName.set(cn, info.key);
      }
    };

    for (const lu of dbLineups) {
      if (!lu.playerId) continue;
      registerMeta({
        key: lu.playerId,
        name: lu.name || "不明",
        number: lu.uniformNumber || "-",
        battingOrder: lu.battingOrder > 0 ? lu.battingOrder : undefined,
        position: lu.position || undefined,
        isSub: !lu.isStarting,
        sortOrder: lu.battingOrder > 0 ? lu.battingOrder : 99,
        sortSubOrder: lu.isStarting ? 0 : lu.inningEntered || 1,
      });
    }

    if (myStructure) {
      for (const slot of myStructure.batters) {
        const cleanSlotName = normalizeLookupName(slot.name);
        const slotKey =
          slot.playerId ||
          (cleanSlotName ? keyByCleanName.get(cleanSlotName) || `name:${cleanSlotName}` : "");
        if (slotKey && slot.name.trim()) {
          registerMeta({
            key: slotKey,
            name: slot.name.trim(),
            number: slot.uniformNumber?.trim() || "-",
            battingOrder: slot.battingOrder,
            position: slot.position || undefined,
            isSub: false,
            sortOrder: slot.battingOrder > 0 ? slot.battingOrder : 99,
            sortSubOrder: 0,
          });
        }
        slot.substitutions.forEach((sub, subIdx) => {
          const cleanSubName = normalizeLookupName(sub.name);
          const subKey =
            sub.playerId ||
            (cleanSubName ? keyByCleanName.get(cleanSubName) || `name:${cleanSubName}` : "");
          if (subKey && sub.name.trim()) {
            const subPos =
              sub.subType === "PH"
                ? "P"
                : sub.subType === "PR"
                ? "R"
                : sub.subType === "TR"
                ? "TR"
                : sub.position || "";
            registerMeta({
              key: subKey,
              name: sub.name.trim(),
              number: sub.uniformNumber?.trim() || "-",
              battingOrder: slot.battingOrder,
              position: subPos || undefined,
              isSub: true,
              sortOrder: slot.battingOrder > 0 ? slot.battingOrder : 99,
              sortSubOrder: (sub.inningEntered || 1) * 10 + subIdx + 1,
            });
          }
        });
      }
    }

    const isNonRbiAdvanceReason = (rawReason: string | null | undefined): boolean => {
      const r = String(rawReason || "").trim().toLowerCase();
      if (!r) return false;
      return (
        r === "wp" ||
        r === "pb" ||
        r === "balk" ||
        r === "steal" ||
        r === "pickoff_error" ||
        r === "error" ||
        r === "obstruction" ||
        r === "indifference" ||
        r === "tiebreak" ||
        r === "other" ||
        r.includes("暴投") ||
        r.includes("捕逸") ||
        r.includes("ボーク") ||
        r.includes("盗塁") ||
        r.includes("失策") ||
        r.includes("エラー") ||
        r.includes("無関心") ||
        r.includes("タイブレーク")
      );
    };

    const runsList = dbAdvances.filter((a) => a.toBase === 4 && !a.isOut);
    const dbAdvancesByAtBatId = new Map<string, typeof dbAdvances>();
    for (const adv of dbAdvances) {
      const arr = dbAdvancesByAtBatId.get(adv.atBatId) || [];
      arr.push(adv);
      dbAdvancesByAtBatId.set(adv.atBatId, arr);
    }

    // --- 打者・走者・守備成績集計 (20項目 + 安打 + 打率) ---
    const batterMap = new Map<string, BatterStatsAccumulator>();
    let fallbackAppearanceCounter = 100;

    const ensureBatterEntry = (
      key: string,
      fallbackName: string,
      fallbackNum: string,
      fallbackOrder?: number
    ): BatterStatsAccumulator => {
      const existing = batterMap.get(key);
      if (existing) return existing;
      const meta = metaByKey.get(key);
      fallbackAppearanceCounter += 1;
      const created: BatterStatsAccumulator = {
        id: key,
        name: meta?.name || fallbackName || "不明",
        number:
          meta?.number && meta.number !== "-"
            ? meta.number
            : fallbackNum || "-",
        battingOrder: meta?.battingOrder ?? fallbackOrder,
        position: meta?.position,
        isSub: meta?.isSub,
        plateAppearances: 0,
        atBats: 0,
        singles: 0,
        doubles: 0,
        triples: 0,
        homeRuns: 0,
        hits: 0,
        walks: 0,
        hitByPitch: 0,
        runs: 0,
        rbi: 0,
        stolenBases: 0,
        caughtStealing: 0,
        strikeouts: 0,
        sacBunts: 0,
        sacFlies: 0,
        leftOnBase: 0,
        errors: 0,
        doublePlays: 0,
        assists: 0,
        putouts: 0,
        sortOrder:
          meta?.sortOrder ??
          (fallbackOrder && fallbackOrder > 0 ? fallbackOrder : fallbackAppearanceCounter),
        sortSubOrder: meta?.sortSubOrder ?? 0,
      };
      batterMap.set(key, created);
      const cn = normalizeLookupName(created.name);
      if (cn && !keyByCleanName.has(cn)) {
        keyByCleanName.set(cn, key);
      }
      return created;
    };

    const gameDetails: MatchGameDetailsPayload = {
      double: [],
      triple: [],
      homeRun: [],
      sacrificeBunt: [],
      sacrificeFly: [],
      stolenBase: [],
      doublePlay: [],
    };

    for (const ab of dbAtBats) {
      const isMyAttack = ab.isTop === isMyTeamTop;
      if (!isMyAttack) continue;

      const snapAb = snapMapByDbAtBatId.get(ab.id);
      const fallbackBatterName =
        ab.batterName ||
        snapAb?.batterName?.trim() ||
        extractBatterNameFromPlayLog(playLogDescByAtBatId.get(ab.id)) ||
        "";
      const cleanFallbackBatter = normalizeLookupName(fallbackBatterName);
      const batterKey =
        ab.batterId ||
        snapAb?.batterPlayerId ||
        (cleanFallbackBatter
          ? keyByCleanName.get(cleanFallbackBatter) || `name:${cleanFallbackBatter}`
          : "");
      if (!batterKey) continue;

      const cls = classifyAtBatResultToken(ab.result, snapAb);
      if (cls.isUnfinishedRunnerOut) {
        continue;
      }

      const p = ensureBatterEntry(
        batterKey,
        fallbackBatterName || "不明",
        ab.batterNumber || "-",
        snapAb?.battingOrder
      );

      p.plateAppearances++;

      if (cls.isWalk) p.walks++;
      if (cls.isHbp) p.hitByPitch++;
      if (cls.isSacBunt) {
        p.sacBunts++;
        gameDetails.sacrificeBunt.push(`${p.name} (${ab.inning}回)`);
      }
      if (cls.isSacFly) {
        p.sacFlies++;
        gameDetails.sacrificeFly.push(`${p.name} (${ab.inning}回)`);
      }

      if (cls.isOfficialAtBat) {
        p.atBats++;
      }

      if (cls.isHomeRun) {
        p.homeRuns++;
        p.hits++;
        gameDetails.homeRun.push(`${p.name} (${ab.inning}回)`);
      } else if (cls.isTriple) {
        p.triples++;
        p.hits++;
        gameDetails.triple.push(`${p.name} (${ab.inning}回)`);
      } else if (cls.isDouble) {
        p.doubles++;
        p.hits++;
        gameDetails.double.push(`${p.name} (${ab.inning}回)`);
      } else if (cls.isSingle) {
        p.singles++;
        p.hits++;
      }

      if (cls.isStrikeout) {
        p.strikeouts++;
      }

      // 公認野球規則 9.02(a)(16): 併殺打はゴロ併殺のみ計上（飛球・ライナー・三振併殺を除外）
      if (cls.isGroundedIntoDoublePlay) {
        p.doublePlays++;
        gameDetails.doublePlay.push(`${p.name} (${ab.inning}回)`);
      }

      const atBatSafeRuns = runsList.filter((a) => a.atBatId === ab.id);
      const abAdvs = dbAdvancesByAtBatId.get(ab.id) || [];
      const snapSelfScored = Boolean(
        snapAb?.advances?.some((a) => a.from === "BAT" && a.to === "HP" && !a.isOut)
      );
      const hasBatterSelfRunRow =
        atBatSafeRuns.some((a) => a.runnerId === batterKey || a.fromBase === 0) ||
        (atBatSafeRuns.length > 0 && snapSelfScored);
      if (cls.isHomeRun && !hasBatterSelfRunRow) {
        p.runs++;
      }

      const isForcedWalkRbiEligible =
        (cls.isWalk || cls.isHbp || cls.isInterferenceReach) &&
        (atBatSafeRuns.some((a) => {
          const r = String(a.reason || "").trim().toLowerCase();
          return (
            r === "walk" ||
            r === "hbp" ||
            r === "interference" ||
            r.includes("押し出し")
          );
        }) ||
          snapAb?.advances?.some(
            (a) => !a.isOut && a.to === "HP" && a.method === "walk"
          ) ||
          abAdvs.filter((a) => !a.isOut && a.fromBase > 0).length >= 3);

      const explicitRbi = explicitRbiByAtBatId.get(ab.id);
      const rbiCount =
        typeof explicitRbi === "number"
          ? explicitRbi
          : typeof snapAb?.rbi === "number"
          ? snapAb.rbi
          : cls.isGroundedIntoDoublePlay || cls.isErrorReach || cls.isStrikeout
          ? 0
          : cls.isWalk || cls.isHbp || cls.isInterferenceReach
          ? isForcedWalkRbiEligible
            ? Math.min(
                1,
                atBatSafeRuns.filter((a) => !isNonRbiAdvanceReason(a.reason)).length
              )
            : 0
          : atBatSafeRuns.filter((a) => !isNonRbiAdvanceReason(a.reason)).length +
            (cls.isHomeRun && !hasBatterSelfRunRow ? 1 : 0);
      p.rbi += rbiCount;
    }

    // 得点・盗塁・盗塁刺の集計（公認野球規則 9.07(d)：重盗時に一方が盗塁刺の場合は他方の盗塁も不成立）
    for (const ab of dbAtBats) {
      if (ab.isTop !== isMyTeamTop) continue;
      const snapAb = snapMapByDbAtBatId.get(ab.id);
      const abAdvances = dbAdvancesByAtBatId.get(ab.id) || [];

      const isDbCaughtStealingRow = (row: (typeof abAdvances)[number]): boolean => {
        const rs = String(row.reason || "");
        if (
          rs === "caught_stealing" ||
          rs.includes("CS") ||
          rs.includes("盗塁刺") ||
          rs.includes("盗塁死")
        ) {
          return true;
        }
        return (
          Boolean(row.isOut) &&
          (rs === "steal" ||
            rs.includes("stolen") ||
            rs.includes("SB") ||
            rs.includes("盗塁"))
        );
      };

      abAdvances.forEach((adv, advIdx) => {
        const snapAdv = snapAb?.advances?.[advIdx];
        const fallbackRunnerName =
          adv.runnerName || snapAdv?.runnerName?.trim() || "";
        const cleanRunner = normalizeLookupName(fallbackRunnerName);
        const runnerKey =
          adv.runnerId ||
          (cleanRunner
            ? keyByCleanName.get(cleanRunner) || `name:${cleanRunner}`
            : "");
        if (!runnerKey) return;

        const runner = ensureBatterEntry(
          runnerKey,
          fallbackRunnerName || "不明",
          adv.runnerNumber || "-"
        );

        if (adv.toBase === 4 && !adv.isOut) {
          runner.runs++;
        }

        const reasonStr = String(adv.reason || "");
        if (isDbCaughtStealingRow(adv)) {
          runner.caughtStealing++;
        } else if (
          !adv.isOut &&
          (reasonStr === "steal" ||
            reasonStr.includes("stolen") ||
            reasonStr.includes("SB") ||
            reasonStr.includes("盗塁"))
        ) {
          const hasCompanionCs = abAdvances.some((other) => {
            if (other === adv || !isDbCaughtStealingRow(other)) return false;
            if (adv.pitchId && other.pitchId) {
              return adv.pitchId === other.pitchId;
            }
            return true;
          });
          if (!hasCompanionCs) {
            runner.stolenBases++;
            gameDetails.stolenBase.push(`${runner.name} (${ab.inning}回)`);
          }
        }
      });
    }

    // --- 残塁 (leftOnBase) の正確な集計（0打席代走・タイブレーク走者も保持、進行中の未完了回は除外） ---
    const isMatchEnded =
      match.status === "finished" || match.status === "completed";

    if (mySnapAtBats.length > 0) {
      const simSnaps = simulateSheetRunners(mySnapAtBats, myStructure ?? undefined);
      const snapAbsByInning = new Map<number, ScorebookV2AtBat[]>();
      let maxSnapInning = 1;
      for (const sAb of mySnapAtBats) {
        maxSnapInning = Math.max(maxSnapInning, sAb.inning);
        const list = snapAbsByInning.get(sAb.inning) || [];
        list.push(sAb);
        snapAbsByInning.set(sAb.inning, list);
      }

      for (const [inn, innSnapAbs] of snapAbsByInning.entries()) {
        const overAb = innSnapAbs.find(
          (sAb) => simSnaps.get(sAb.id)?.isInningOver
        );
        const targetAb =
          overAb ||
          (isMatchEnded || inn < maxSnapInning
            ? innSnapAbs[innSnapAbs.length - 1]
            : undefined);
        if (!targetAb) continue;
        const snap = simSnaps.get(targetAb.id);
        if (!snap) continue;
        for (const baseKey of ["1B", "2B", "3B"] as const) {
          const stranded = snap.basesAfterPlay[baseKey];
          if (!stranded) continue;
          const cleanName = normalizeLookupName(stranded.name);
          const rKey =
            stranded.playerId ||
            (cleanName ? keyByCleanName.get(cleanName) || `name:${cleanName}` : "");
          if (rKey) {
            const entry = ensureBatterEntry(
              rKey,
              stranded.name || "不明",
              "-",
              stranded.battingOrder > 0 ? stranded.battingOrder : undefined
            );
            entry.leftOnBase += 1;
          }
        }
      }
    } else {
      // ライブ入力等のフォールバック：イニング終了（3アウトまたは試合終了時の最終回）時点で残っている走者を集計
      const myAttackAbs = dbAtBats.filter((a) => a.isTop === isMyTeamTop);
      const myInnings = Array.from(new Set(myAttackAbs.map((a) => a.inning))).sort(
        (a, b) => a - b
      );
      const maxMyInning = myInnings[myInnings.length - 1] ?? 1;

      for (const inn of myInnings) {
        const runnerOnBaseByKey = new Map<string, number>();
        const innAbs = myAttackAbs.filter((a) => a.inning === inn);
        let innOuts = 0;

        for (const ab of innAbs) {
          const cls = classifyAtBatResultToken(ab.result, null);
          const abAdvs = dbAdvancesByAtBatId.get(ab.id) || [];
          let batterHasFromZeroAdv = false;

          for (const adv of abAdvs) {
            if (adv.fromBase === 0) batterHasFromZeroAdv = true;
            if (adv.isOut && adv.fromBase > 0) {
              const rs = String(adv.reason || "");
              if (cls.intrinsicBatterOuts === 0 || (rs !== "fc" && !rs.includes("封"))) {
                innOuts += 1;
              }
            } else if (adv.isOut && adv.fromBase === 0 && cls.intrinsicBatterOuts === 0) {
              innOuts += 1;
            }
            if (!adv.runnerId) continue;
            if (adv.isOut || adv.toBase >= 4) {
              runnerOnBaseByKey.delete(adv.runnerId);
            } else if (adv.toBase >= 1 && adv.toBase <= 3) {
              runnerOnBaseByKey.set(adv.runnerId, adv.toBase);
            }
          }

          innOuts += cls.intrinsicBatterOuts;

          if (!batterHasFromZeroAdv && ab.batterId) {
            const hasForceRunnerOut = abAdvs.some(
              (a) =>
                a.isOut &&
                a.fromBase > 0 &&
                (String(a.reason || "") === "fc" ||
                  String(a.reason || "").includes("封"))
            );
            if (cls.isTriple) {
              runnerOnBaseByKey.set(ab.batterId, 3);
            } else if (cls.isDouble) {
              runnerOnBaseByKey.set(ab.batterId, 2);
            } else if (
              cls.isSingle ||
              cls.isWalk ||
              cls.isHbp ||
              cls.isInterferenceReach ||
              cls.isDroppedThirdStrikeSafe ||
              cls.isErrorReach ||
              cls.isFieldersChoiceReach ||
              hasForceRunnerOut
            ) {
              runnerOnBaseByKey.set(ab.batterId, 1);
            }
          }
          if (innOuts >= 3) break;
        }

        if (innOuts >= 3 || isMatchEnded || inn < maxMyInning) {
          for (const [rKey] of runnerOnBaseByKey) {
            const entry = ensureBatterEntry(rKey, "不明", "-");
            entry.leftOnBase += 1;
          }
        }
      }
    }

    // --- 投手成績集計（公認野球規則 9.16 ハーフイニング責任走者・自責点再構築） ---
    const pitcherMap = new Map<string, PitcherStatsAccumulator>();
    const pitcherKeyByAtBatId = new Map<string, string>();
    let pitcherOrderSeq = 0;

    const oppDefenseAbs = dbAtBats.filter((a) => a.isTop !== isMyTeamTop);
    const oppAbsByInning = new Map<number, typeof oppDefenseAbs>();

    for (const ab of oppDefenseAbs) {
      const snapAb = snapMapByDbAtBatId.get(ab.id);
      const fallbackPitcherName =
        ab.pitcherName || snapAb?.pitcherName?.trim() || "";
      const cleanPitcher = normalizeLookupName(fallbackPitcherName);
      const matchedStint = oppStructure?.pitchers.find(
        (st) =>
          (ab.pitcherId && st.playerId === ab.pitcherId) ||
          (cleanPitcher && normalizeLookupName(st.name) === cleanPitcher)
      );
      const pitcherKey =
        ab.pitcherId ||
        snapAb?.pitcherPlayerId ||
        matchedStint?.playerId ||
        (cleanPitcher &&
        cleanPitcher !== "相手投手" &&
        cleanPitcher !== "投手" &&
        cleanPitcher !== "不明"
          ? keyByCleanName.get(cleanPitcher) || `name:${cleanPitcher}`
          : "");
      if (!pitcherKey) continue;

      pitcherKeyByAtBatId.set(ab.id, pitcherKey);

      if (!pitcherMap.has(pitcherKey)) {
        pitcherOrderSeq += 1;
        const meta = metaByKey.get(pitcherKey);
        pitcherMap.set(pitcherKey, {
          id: pitcherKey,
          name: meta?.name || fallbackPitcherName || "不明",
          number:
            ab.pitcherNumber ||
            matchedStint?.uniformNumber?.trim() ||
            meta?.number ||
            "-",
          outs: 0,
          pitches: 0,
          battersFaced: 0,
          hits: 0,
          homeRuns: 0,
          sacBunts: 0,
          sacFlies: 0,
          strikeouts: 0,
          walks: 0,
          hitByPitch: 0,
          wildPitches: 0,
          balks: 0,
          runs: 0,
          earnedRuns: 0,
          sortOrder: matchedStint?.order ?? pitcherOrderSeq,
        });
      }

      const p = pitcherMap.get(pitcherKey)!;
      const cls = classifyAtBatResultToken(ab.result, snapAb);

      // 投球数 (牽制球・ボークを除いた実投球数をカウント)
      const pitchCountForAtBat = dbPitches.filter(
        (pt) =>
          pt.atBatId === ab.id &&
          !pt.result.startsWith("pickoff") &&
          pt.result !== "balk"
      ).length;
      p.pitches += pitchCountForAtBat;

      if (cls.isHit) p.hits++;
      if (cls.isHomeRun) p.homeRuns++;
      if (cls.isSacBunt) p.sacBunts++;
      if (cls.isSacFly) p.sacFlies++;
      if (cls.isStrikeout) p.strikeouts++;
      if (cls.isWalk) p.walks++;
      if (cls.isHbp) p.hitByPitch++;

      const innList = oppAbsByInning.get(ab.inning) || [];
      innList.push(ab);
      oppAbsByInning.set(ab.inning, innList);
    }

    // 暴投・ボークの重複除外集計
    const wpEventKeysByPitcher = new Map<string, Set<string>>();
    const balkEventKeysByPitcher = new Map<string, Set<string>>();

    for (const pt of dbPitches) {
      const pKey = pitcherKeyByAtBatId.get(pt.atBatId);
      if (!pKey || !pitcherMap.has(pKey)) continue;
      if (pt.result === "wild_pitch" || pt.result === "wp") {
        const set = wpEventKeysByPitcher.get(pKey) || new Set<string>();
        set.add(`pitch:${pt.id}`);
        wpEventKeysByPitcher.set(pKey, set);
      } else if (pt.result === "balk") {
        const set = balkEventKeysByPitcher.get(pKey) || new Set<string>();
        set.add(`pitch:${pt.id}`);
        balkEventKeysByPitcher.set(pKey, set);
      }
    }

    for (const adv of dbAdvances) {
      const pKey = pitcherKeyByAtBatId.get(adv.atBatId);
      if (!pKey || !pitcherMap.has(pKey)) continue;
      const reasonStr = String(adv.reason || "");
      if (
        reasonStr === "wp" ||
        reasonStr.includes("wp_advance") ||
        reasonStr.includes("暴投")
      ) {
        const set = wpEventKeysByPitcher.get(pKey) || new Set<string>();
        const eventKey = adv.pitchId ? `pitch:${adv.pitchId}` : `ab:${adv.atBatId}`;
        const alreadyHasPitchWpInAtBat = Array.from(set).some(
          (k) =>
            k.startsWith("pitch:") &&
            dbPitches.some((pt) => `pitch:${pt.id}` === k && pt.atBatId === adv.atBatId)
        );
        if (!alreadyHasPitchWpInAtBat) {
          set.add(eventKey);
          wpEventKeysByPitcher.set(pKey, set);
        }
      }
      if (
        reasonStr === "balk" ||
        reasonStr.includes("balk_advance") ||
        reasonStr.includes("ボーク")
      ) {
        const set = balkEventKeysByPitcher.get(pKey) || new Set<string>();
        const eventKey = adv.pitchId ? `pitch:${adv.pitchId}` : `ab:${adv.atBatId}`;
        const alreadyHasPitchBalkInAtBat = Array.from(set).some(
          (k) =>
            k.startsWith("pitch:") &&
            dbPitches.some((pt) => `pitch:${pt.id}` === k && pt.atBatId === adv.atBatId)
        );
        if (!alreadyHasPitchBalkInAtBat) {
          set.add(eventKey);
          balkEventKeysByPitcher.set(pKey, set);
        }
      }
    }

    // ハーフイニングごとに投手アウト数・対戦打者・失点・自責点・振り逃げ暴投を算出
    for (const [, innAbs] of oppAbsByInning.entries()) {
      const halfPlays: HalfInningAtBatPitchingInput[] = innAbs.map((ab) => {
        const snapAb = snapMapByDbAtBatId.get(ab.id);
        const pKey = pitcherKeyByAtBatId.get(ab.id) || "";
        const dbAdvsForAb = dbAdvancesByAtBatId.get(ab.id) || [];
        const mappedDbAdvs: HalfInningAdvanceEventInput[] = dbAdvsForAb
          .filter(
            (a) =>
              a.toBase >= 1 &&
              a.toBase <= 4 &&
              a.fromBase >= 0 &&
              a.fromBase <= 3 &&
              !(a.fromBase > 0 && !a.isOut && a.fromBase === a.toBase)
          )
          .map((a) => ({
            fromBase: a.fromBase as 0 | 1 | 2 | 3,
            toBase: a.toBase as 1 | 2 | 3 | 4,
            isOut: Boolean(a.isOut),
            reason: String(a.reason || ""),
          }));
        const effectiveAdvs =
          snapAb && Array.isArray(snapAb.advances) && snapAb.advances.length > 0
            ? mapSnapshotAdvancesToPitchingEvents(snapAb.advances)
            : mappedDbAdvs;
        const dbSafeRuns = dbAdvsForAb.filter((a) => !a.isOut && a.toBase === 4).length;

        // 振り逃げ暴投（K WP）で pitches / advances にまだ WP が記録されていない場合は WP を1加算
        const cls = classifyAtBatResultToken(ab.result, snapAb);
        if (cls.isDroppedThirdStrikeSafe && pKey) {
          const dts = classifyDroppedThirdStrikeReach(
            snapAb?.battedDirection,
            snapAb?.resultLabel || ab.result
          );
          if (dts.kind === "wp") {
            const set = wpEventKeysByPitcher.get(pKey) || new Set<string>();
            const hasWpOnThisAb =
              set.has(`ab:${ab.id}`) ||
              dbPitches.some(
                (pt) =>
                  pt.atBatId === ab.id &&
                  (pt.result === "wild_pitch" || pt.result === "wp")
              );
            if (!hasWpOnThisAb) {
              set.add(`dts:${ab.id}`);
              wpEventKeysByPitcher.set(pKey, set);
            }
          }
        }

        return {
          atBatId: ab.id,
          pitcherKey: pKey,
          rawResult: ab.result,
          runsInPlay: Math.max(snapAb?.runsInPlay || 0, dbSafeRuns),
          snapAb,
          advances: effectiveAdvs,
        };
      });

      const charges = evaluateHalfInningPitcherCharges(halfPlays);
      for (const [pKey, ch] of charges.entries()) {
        const target = pitcherMap.get(pKey);
        if (!target) continue;
        target.outs += ch.outs;
        target.battersFaced += ch.battersFaced;
        target.runs += ch.runs;
        target.earnedRuns += ch.earnedRuns;
      }
    }

    for (const [pKey, set] of wpEventKeysByPitcher) {
      if (pitcherMap.has(pKey)) pitcherMap.get(pKey)!.wildPitches = set.size;
    }
    for (const [pKey, set] of balkEventKeysByPitcher) {
      if (pitcherMap.has(pKey)) pitcherMap.get(pKey)!.balks = set.size;
    }

    // --- 守備成績（刺殺 putouts・捕殺 assists・失策 errors）の自動集計 ---
    // 0打席の守備固め選手・登板投手も ensureBatterEntry で確実に保持し、後攻チームの代打・代走による表守備誤奪取も防止
    const resolveFielderKeyAtInning = (
      posCode: string,
      inning: number,
      abPitcherKey: string | undefined
    ): string | null => {
      if (posCode === "1" && abPitcherKey) {
        const pEntry = pitcherMap.get(abPitcherKey);
        ensureBatterEntry(
          abPitcherKey,
          pEntry?.name || "不明",
          pEntry?.number || "-"
        );
        return abPitcherKey;
      }
      if (myStructure) {
        for (const slot of myStructure.batters) {
          let activeKey: string | null = null;
          let activeName = slot.name?.trim() || "不明";
          let activeNum = slot.uniformNumber?.trim() || "-";
          let activePos = normalizeFieldingPosCode(slot.position);
          const cleanSlotName = normalizeLookupName(slot.name);
          if (slot.playerId || cleanSlotName) {
            activeKey =
              slot.playerId ||
              keyByCleanName.get(cleanSlotName) ||
              `name:${cleanSlotName}`;
          }
          for (const sub of slot.substitutions) {
            if (sub.subType === "TR") continue;
            const subInn = sub.inningEntered || 1;
            const effectiveInDefense = isMyTeamTop
              ? subInn <= inning
              : sub.subType === "DEF"
              ? subInn <= inning
              : subInn < inning;
            if (effectiveInDefense) {
              const cleanSub = normalizeLookupName(sub.name);
              if (sub.playerId || cleanSub) {
                activeKey =
                  sub.playerId ||
                  keyByCleanName.get(cleanSub) ||
                  `name:${cleanSub}`;
                activeName = sub.name?.trim() || activeName;
                activeNum = sub.uniformNumber?.trim() || activeNum;
              }
              const normSubPos = normalizeFieldingPosCode(sub.position);
              if (normSubPos) activePos = normSubPos;
            }
          }
          if (activePos === posCode && activeKey) {
            ensureBatterEntry(activeKey, activeName, activeNum, slot.battingOrder);
            return activeKey;
          }
        }
      }
      let matchedLineupPlayer: {
        playerId: string;
        name: string;
        number: string;
        battingOrder?: number;
      } | null = null;
      for (const lu of dbLineups) {
        if (!lu.playerId) continue;
        if (
          normalizeFieldingPosCode(lu.position) === posCode &&
          (lu.inningEntered || 1) <= inning
        ) {
          matchedLineupPlayer = {
            playerId: lu.playerId,
            name: lu.name || "不明",
            number: lu.uniformNumber || "-",
            battingOrder: lu.battingOrder > 0 ? lu.battingOrder : undefined,
          };
        }
      }
      if (matchedLineupPlayer) {
        ensureBatterEntry(
          matchedLineupPlayer.playerId,
          matchedLineupPlayer.name,
          matchedLineupPlayer.number,
          matchedLineupPlayer.battingOrder
        );
        return matchedLineupPlayer.playerId;
      }
      return null;
    };

    if (oppSnapAtBats.length > 0) {
      oppSnapAtBats.forEach((sAb, idx) => {
        const matchedDbAb =
          oppDefenseAbs.find(
            (d) => snapMapByDbAtBatId.get(d.id)?.id === sAb.id
          ) || oppDefenseAbs[idx];
        const abPitcherKey = matchedDbAb
          ? pitcherKeyByAtBatId.get(matchedDbAb.id)
          : undefined;

        const credits = extractFieldingCreditsForAtBat(sAb);
        for (const pos of credits.errors) {
          const fKey = resolveFielderKeyAtInning(pos, sAb.inning, abPitcherKey);
          if (fKey && batterMap.has(fKey)) batterMap.get(fKey)!.errors += 1;
        }
        for (const pos of credits.assists) {
          const fKey = resolveFielderKeyAtInning(pos, sAb.inning, abPitcherKey);
          if (fKey && batterMap.has(fKey)) batterMap.get(fKey)!.assists += 1;
        }
        for (const pos of credits.putouts) {
          const fKey = resolveFielderKeyAtInning(pos, sAb.inning, abPitcherKey);
          if (fKey && batterMap.has(fKey)) batterMap.get(fKey)!.putouts += 1;
        }
      });
    }

    const batterStatsList = Array.from(batterMap.values())
      .sort((a, b) =>
        a.sortOrder !== b.sortOrder
          ? a.sortOrder - b.sortOrder
          : a.sortSubOrder - b.sortSubOrder
      )
      .map(({ sortOrder: _so, sortSubOrder: _sso, ...p }) => ({
        ...p,
        avg: formatOfficialBaseballRate(p.hits, p.atBats, ".000"),
      }));

    const pitcherStatsList = Array.from(pitcherMap.values())
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(({ sortOrder: _so, ...p }) => {
        const inningsInt = Math.floor(p.outs / 3);
        const inningsFrac = p.outs % 3;
        const ipStr =
          inningsFrac > 0 ? `${inningsInt}.${inningsFrac}` : `${inningsInt}.0`;

        const eraVal = p.outs > 0 ? (p.earnedRuns * 7 * 3) / p.outs : 0;

        return {
          ...p,
          ip: ipStr,
          era: p.outs > 0 ? eraVal.toFixed(2) : "0.00",
        };
      });

    return c.json({
      success: true,
      stats: batterStatsList,
      pitcherStats: pitcherStatsList,
      gameDetails,
    });
  } catch (error) {
    console.error("Stats API error:", error);
    return c.json(
      {
        success: false,
        error: "Failed to generate stats",
        stats: [],
        pitcherStats: [],
      },
      500
    );
  }
});

export default app;
