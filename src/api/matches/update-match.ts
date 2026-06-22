// filepath: src/api/matches/update-match.ts
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { matches } from '@/db/schema/match';
import type { WorkerEnv } from '@/types/api';

const app = new Hono<{ Bindings: WorkerEnv }>();

// 💡 厳格な型定義 (anyの排除): フロントから送られてくる更新ペイロード
interface UpdateMatchRequest {
  opponent?: string;
  date?: string;
  time?: string; // フロント側で結合してdateに入れるか、ここで結合するか（今回はフロント側で結合してdateに送ってくる想定）
  matchType?: 'official' | 'practice';
  tournamentName?: string; // 💡 Hono側ではtournamentIdとして処理すべきですが、現状の仕様に合わせてマッピング
  battingOrder?: 'first' | 'second';
  benchSide?: '1B' | '3B' | 'unknown'; // 🌟 ベンチ位置
  innings?: 6 | 7 | 9;                 // 🌟 イニング数
  location?: string;                   // 🌟 フロントからはlocationとして来る想定（DBはsurfaceDetails）
  venueId?: string;                    // 🌟 追加：球場ID
  status?: 'scheduled' | 'live' | 'finished';
  myScore?: number;
  opponentScore?: number;
  myInningScores?: number[];
  opponentInningScores?: number[];
}

// ━━━ 試合情報の更新 (PATCH) ━━━
app.patch('/:id', async (c) => {
  const db = drizzle(c.env.DB);
  const matchId = c.req.param('id');

  try {
    const body = (await c.req.json()) as UpdateMatchRequest;

    // 💡 徹底的に null 変換するヘルパー
    const n = (val: string | undefined | null) => (val === "" || val === undefined || val === null ? null : val);

    // 💡 更新データのマッピング
    // ※フロント側（edit/page.tsx）の body: JSON.stringify({...}) とキーを合わせています
    const updateData = {
      opponent: body.opponent,
      date: body.date, // ※フロント側で "YYYY-MM-DD HH:mm" に結合済みであることを想定
      matchType: body.matchType,
      // tournamentNameをtournamentIdとして扱うか、別途変換処理を入れるか。
      // 現在のフロント仕様上、tournamentName（= 実はtournamentIdが入っている）を保存する想定とします。
      tournamentId: n(body.tournamentName),
      battingOrder: body.battingOrder,
      benchSide: body.benchSide,
      innings: body.innings,
      surfaceDetails: n(body.location),
      venueId: n(body.venueId),
      status: body.status,
      myScore: body.myScore,
      opponentScore: body.opponentScore,
      myInningScores: body.myInningScores ? JSON.stringify(body.myInningScores) : undefined,
      opponentInningScores: body.opponentInningScores ? JSON.stringify(body.opponentInningScores) : undefined,
    };

    // 💡 undefined のプロパティは更新対象から外す（部分更新への対応）
    // Drizzleのupdateは、値が明示的に指定されたカラムのみ更新します。
    // 不要なundefinedキーを削除するクリーンアップ処理
    Object.keys(updateData).forEach(key => {
      if ((updateData as any)[key] === undefined) {
        delete (updateData as any)[key];
      }
    });

    // 💡 UPDATE実行
    await db.update(matches)
      .set(updateData)
      .where(eq(matches.id, matchId));

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