// filepath: src/api/teams/update-settings.ts
/* 💡 iScoreCloud 規約: 
   1. API ユニットの責務分離規約に基づき、Payload と Response 型を明示的に export する。
   2. フロントエンド（Next.js）での型安全なインポートを保証する。 */

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { teams } from '@/db/schema/team';
import { eq } from 'drizzle-orm';
import type { WorkerEnv } from '@/types/api';

const teamsUpdateSettings = new Hono<{ Bindings: WorkerEnv }>();

/** 🌟 エラー解消の鍵：明示的に export をつける */
export interface TeamSettingsUpdatePayload {
  teamId: string;
  lineGroupId: string;
  isAutoReportEnabled: boolean;
  reportPlayballEnabled: boolean;
  reportInningEnabled: boolean;
  reportGameSetEnabled: boolean;
}

/** 🌟 レスポンス型も export して共有 */
export interface TeamSettingsUpdateResponse {
  success: boolean;
  data?: { updatedId: string };
  error?: string;
}

// 💡 既存の LINE 設定取得ハンドラを追加
teamsUpdateSettings.get('/:teamId/line-settings', async (c) => {
  const db = drizzle(c.env.DB);
  const teamId = c.req.param('teamId');

  try {
    const team = await db.select({
      id: teams.id,
      lineGroupId: teams.lineGroupId,
      isAutoReportEnabled: teams.isAutoReportEnabled,
      reportPlayballEnabled: teams.reportPlayballEnabled,
      reportInningEnabled: teams.reportInningEnabled,
      reportGameSetEnabled: teams.reportGameSetEnabled,
    })
      .from(teams)
      .where(eq(teams.id, teamId))
      .get();

    if (!team) {
      return c.json({ success: false, error: "チームが見つかりません" }, 404);
    }

    return c.json({
      success: true,
      data: {
        lineGroupId: team.lineGroupId || "",
        isAutoReportEnabled: !!team.isAutoReportEnabled,
        reportPlayballEnabled: team.reportPlayballEnabled !== false, // デフォルトは true
        reportInningEnabled: team.reportInningEnabled !== false,     // デフォルトは true
        reportGameSetEnabled: team.reportGameSetEnabled !== false,   // デフォルトは true
      }
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Fetch Failed";
    return c.json({ success: false, error: errorMsg }, 500);
  }
});

// 💡 既存の POST ハンドラ（新しいカラムに対応）
teamsUpdateSettings.post('/update-line', async (c) => {
  const db = drizzle(c.env.DB);

  try {
    const body = (await c.req.json()) as TeamSettingsUpdatePayload;
    const { teamId, lineGroupId, isAutoReportEnabled, reportPlayballEnabled, reportInningEnabled, reportGameSetEnabled } = body;

    await db.update(teams)
      .set({
        lineGroupId: lineGroupId.trim() || null,
        isAutoReportEnabled: isAutoReportEnabled,
        reportPlayballEnabled: reportPlayballEnabled,
        reportInningEnabled: reportInningEnabled,
        reportGameSetEnabled: reportGameSetEnabled,
      })
      .where(eq(teams.id, teamId));

    const res: TeamSettingsUpdateResponse = {
      success: true,
      data: { updatedId: teamId }
    };
    return c.json(res);

  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Update Failed";
    const res: TeamSettingsUpdateResponse = { success: false, error: errorMsg };
    return c.json(res, 500);
  }
});

export default teamsUpdateSettings;