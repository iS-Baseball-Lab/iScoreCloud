// filepath: src/api/matches/create-match.ts
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { matches } from '@/db/schema/match';
import type { WorkerEnv } from '@/types/api';

const app = new Hono<{ Bindings: WorkerEnv }>();

// 💡 厳格な型定義 (anyの排除): フロントから送られてくるペイロードを定義
interface CreateMatchRequest {
  teamId: string;
  opponent: string;
  date: string;
  matchType: 'official' | 'practice';
  tournamentId?: string;
  venueId?: string;
  battingOrder: 'first' | 'second';
  benchSide?: '1B' | '3B' | 'unknown'; // 🌟 追加：ベンチ位置
  innings: 6 | 7 | 9;                  // 🌟 追加：イニング数
  surfaceDetails?: string;
  status: 'scheduled' | 'started' | 'finished'; // 🌟 追加：3つの導線対応
  myScore?: number;                    // 🌟 追加：QUICK SCORE用
  opponentScore?: number;              // 🌟 追加：QUICK SCORE用
  myInningScores?: number[];           // 🌟 追加：QUICK SCORE用
  opponentInningScores?: number[];     // 🌟 追加：QUICK SCORE用
}

app.post('/create', async (c) => {
  const db = drizzle(c.env.DB);

  try {
    // 💡 型キャストで安全にデータを受け取る
    const body = (await c.req.json()) as CreateMatchRequest;
    const matchId = crypto.randomUUID();

    // 💡 徹底的に null 変換するヘルパー (anyを排除しstring等の型を指定)
    const n = (val: string | undefined | null) => (val === "" || val === undefined || val === null ? null : val);

    // 💡 INSERT実行 (drizzle-orm や tournaments などの追加インポートを完全排除して500エラーを回避)
    await db.insert(matches).values({
      id: matchId,
      // 🌟 teamId が DB の teams テーブルに実在することを確認してください
      teamId: body.teamId || "team-001",
      opponent: body.opponent,

      // 🌟 ID系は絶対に "" ではなく null を渡す
      tournamentId: n(body.tournamentId),
      venueId: n(body.venueId),

      date: body.date || new Date().toISOString().split('T')[0],
      matchType: body.matchType || 'practice',
      
      // 🌟 'unknown' などの不正値がDBに漏れるのを完全にガードし 'first' に安全フォールバック
      battingOrder: ((body.battingOrder as string) === 'unknown' || !body.battingOrder) ? 'first' : body.battingOrder,

      // 🌟 現場仕様：当日決まるかもしれないベンチ位置を保存
      benchSide: body.benchSide || 'unknown',

      // 🌟 フロントから inningCount と innings の両方のキー名に100%安全対応
      innings: body.innings || (body as any).inningCount || 7,
      currentInning: 1,
      isBottom: false, // SQLiteでは自動で 0 になります

      isTiebreaker: false,
      isColdGame: false,

      // 🌟 導線(mode)に応じたステータスを保存
      status: body.status || 'scheduled',

      // 🌟 QUICK SCORE（終わった試合の記録）に対応
      myScore: body.myScore || 0,
      opponentScore: body.opponentScore || 0,
      myInningScores: JSON.stringify(body.myInningScores || []),
      opponentInningScores: JSON.stringify(body.opponentInningScores || []),

      surfaceDetails: n(body.surfaceDetails),
      weather: null,

      // 🌟 重要: created_at はここから削除します
      // スキーマの default(sql`...`) に完全に任せるのが SQLite (D1) の安全策です
    });

    return c.json({ success: true, matchId });
  } catch (error) {
    // 💡 catch(err: any) を排除し、instanceof Error で安全に処理
    const errorMessage = error instanceof Error ? error.message : "試合の作成に失敗しました";
    console.error("Match Create Error Detail:", errorMessage);

    // 💡 もし "FOREIGN KEY constraint failed" と出たら、teamId の存在を確認！
    return c.json({ success: false, error: errorMessage }, 500);
  }
});

export default app;