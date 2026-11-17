// filepath: src/api/matches/update-match.ts
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { and, eq } from 'drizzle-orm';
import { matches, tournaments } from '@/db/schema/match';
import { ensureMatchLineupColumns } from '@/lib/db-helper';
import { buildTeamTenantWhere, resolveTeamTenantIds } from '@/lib/tenant-scope';
import type { WorkerEnv } from '@/types/api';
import type { MatchDayOps } from '@/types/match';

const app = new Hono<{ Bindings: WorkerEnv }>();

// 💡 厳格な型定義 (anyの排除): フロントから送られてくる更新ペイロード
interface UpdateMatchRequest {
  opponent?: string;
  date?: string;
  time?: string; // フロント側で結合してdateに入れるか、ここで結合するか（今回はフロント側で結合してdateに送ってくる想定）
  matchType?: 'official' | 'practice' | 'exchange';
  tournamentName?: string; // 💡 Hono側ではtournamentIdとして処理すべきですが、現状の仕様に合わせてマッピング
  battingOrder?: 'first' | 'second';
  benchSide?: '1B' | '3B' | 'unknown'; // 🌟 ベンチ位置
  innings?: 6 | 7 | 9;                 // 🌟 イニング数
  location?: string;                   // 🌟 フロントからはlocationとして来る想定（DBはsurfaceDetails）
  venueId?: string;                    // 🌟 追加：球場ID
  status?: 'scheduled' | 'live' | 'finished' | 'rainout';
  myScore?: number;
  opponentScore?: number;
  myInningScores?: number[];
  opponentInningScores?: number[];
  matchDayOps?: MatchDayOps | null;
}

// ━━━ 試合情報の更新 (PATCH) ━━━
app.patch('/:id', async (c) => {
  await ensureMatchLineupColumns(c.env.DB);
  const db = drizzle(c.env.DB);
  const matchId = c.req.param('id');

  try {
    const body = (await c.req.json()) as UpdateMatchRequest;

    // 💡 徹底的に null 変換するヘルパー
    const n = (val: string | undefined | null) => (val === "" || val === undefined || val === null ? null : val);

    // 💡 大会名（tournamentName）が送られてきた場合、対象試合の所属クラブ・チーム内で解決・新規生成する
    let tournamentId: string | null | undefined = undefined;
    if (body.tournamentName !== undefined) {
      const tName = (body.tournamentName || "").trim();
      if (!tName) {
        tournamentId = null;
      } else {
        const matchRow = await db
          .select({ teamId: matches.teamId })
          .from(matches)
          .where(eq(matches.id, matchId))
          .get();
        const tenant = matchRow?.teamId
          ? await resolveTeamTenantIds(db, matchRow.teamId)
          : null;
        const tenantWhere = buildTeamTenantWhere(
          { organizationId: tournaments.organizationId, teamId: tournaments.teamId },
          tenant
        );

        // 1. IDが送られてきた場合（自クラブ内または未割当レガシーのみ許可）
        const byId = await db
          .select()
          .from(tournaments)
          .where(and(eq(tournaments.id, tName), tenantWhere))
          .get();
        if (byId) {
          tournamentId = byId.id;
        } else {
          // 2. 自クラブ・チーム内で名前検索
          const existing = await db
            .select()
            .from(tournaments)
            .where(and(eq(tournaments.name, tName), tenantWhere))
            .get();
          if (existing) {
            tournamentId = existing.id;
          } else {
            // 3. なければ自クラブ・チームの大会として新規作成
            const newId = crypto.randomUUID();
            await db.insert(tournaments).values({
              id: newId,
              organizationId: tenant?.organizationId || null,
              teamId: tenant?.teamId || null,
              name: tName,
              season: new Date().getFullYear().toString(),
              category: 'other',
            });
            tournamentId = newId;
          }
        }
      }
    }

    // 💡 更新データのマッピング
    // ※フロント側（edit/page.tsx）の body: JSON.stringify({...}) とキーを合わせています
    const updateData: Record<string, unknown> = {
      opponent: body.opponent,
      date: body.date, // ※フロント側で "YYYY-MM-DD HH:mm" に結合済みであることを想定
      matchType: body.matchType,
      tournamentId: tournamentId !== undefined ? tournamentId : undefined,
      battingOrder: body.battingOrder,
      benchSide: body.benchSide,
      innings: body.innings,
      surfaceDetails: body.location !== undefined ? n(body.location) : undefined,
      venueId: body.venueId !== undefined ? n(body.venueId) : undefined,
      status: body.status,
      myScore: body.myScore,
      opponentScore: body.opponentScore,
      myInningScores: body.myInningScores ? JSON.stringify(body.myInningScores) : undefined,
      opponentInningScores: body.opponentInningScores ? JSON.stringify(body.opponentInningScores) : undefined,
      matchDayOps: body.matchDayOps !== undefined ? JSON.stringify(body.matchDayOps || {}) : undefined,
    };

    // 💡 undefined のプロパティは更新対象から外す（部分更新への対応）
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    // 💡 UPDATE実行
    if (Object.keys(updateData).length > 0) {
      await db.update(matches)
        .set(updateData)
        .where(eq(matches.id, matchId));
    }

    return c.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "試合の更新に失敗しました";
    console.error("Match Update Error Detail:", errorMessage);
    return c.json({ success: false, error: errorMessage }, 500);
  }
});

// ━━━ 試合完了時のスコア保存 (PATCH) ━━━
// ※ edit/page.tsx の handleUpdate 内で status==='finished' 時に呼ばれるエンドポイント
interface FinishMatchRequest {
  myScore: number;
  opponentScore: number;
  myInningScores: number[];
  opponentInningScores: number[];
}

app.patch('/:id/finish', async (c) => {
  const db = drizzle(c.env.DB);
  const matchId = c.req.param('id');

  try {
    const body = (await c.req.json()) as FinishMatchRequest;

    await db.update(matches)
      .set({
        status: 'finished', // 明示的に完了状態へ
        myScore: body.myScore,
        opponentScore: body.opponentScore,
        myInningScores: JSON.stringify(body.myInningScores),
        opponentInningScores: JSON.stringify(body.opponentInningScores),
      })
      .where(eq(matches.id, matchId));

    return c.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "スコアの保存に失敗しました";
    console.error("Match Finish Update Error Detail:", errorMessage);
    return c.json({ success: false, error: errorMessage }, 500);
  }
});

export default app;
