// src/api/teams/players.ts
import { Hono } from 'hono'

const app = new Hono<{ Bindings: { DB: D1Database } }>()

// 選手一覧取得（主要フィールド全て含む）
app.get('/:teamId/players', async (c) => {
  const teamId = c.req.param('teamId');
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT
        id,
        team_id        AS teamId,
        name,
        name_kana      AS nameKana,
        uniform_number AS uniformNumber,
        primary_position AS primaryPosition,
        throws,
        bats,
        is_active      AS isActive,
        notes,
        profile_image_url AS profileImageUrl,
        created_at     AS createdAt
       FROM players
       WHERE team_id = ?
       ORDER BY CAST(uniform_number AS INTEGER) ASC`
    ).bind(teamId).all();
    return c.json(results);
  } catch (e) {
    return c.json({ error: '選手の取得に失敗しました' }, 500);
  }
});

// 選手登録（主要フィールド対応）
app.post('/:teamId/players', async (c) => {
  const teamId = c.req.param('teamId');
  const body = await c.req.json();
  const playerId = crypto.randomUUID();
  try {
    await c.env.DB.prepare(
      `INSERT INTO players (id, team_id, name, name_kana, uniform_number, primary_position, throws, bats, profile_image_url, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).bind(
      playerId,
      teamId,
      body.name,
      body.nameKana ?? null,
      body.uniformNumber,
      body.primaryPosition ?? null,
      body.throws ?? null,
      body.bats ?? null,
      body.profileImageUrl ?? null,
    ).run();
    return c.json({ success: true, id: playerId });
  } catch (e) {
    return c.json({ error: '選手の登録に失敗しました' }, 500);
  }
});

// 選手情報更新（主要フィールド対応）
app.patch('/:teamId/players/:playerId', async (c) => {
  const teamId = c.req.param('teamId');
  const playerId = c.req.param('playerId');
  const body = await c.req.json();
  try {
    await c.env.DB.prepare(
      `UPDATE players
       SET name = ?, name_kana = ?, uniform_number = ?, primary_position = ?, throws = ?, bats = ?, profile_image_url = ?, is_active = ?
       WHERE id = ? AND team_id = ?`
    ).bind(
      body.name,
      body.nameKana ?? null,
      body.uniformNumber,
      body.primaryPosition ?? null,
      body.throws ?? null,
      body.bats ?? null,
      body.profileImageUrl ?? null,
      body.isActive !== false ? 1 : 0,
      playerId,
      teamId,
    ).run();
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: '選手の更新に失敗しました' }, 500);
  }
});

// 選手削除
app.delete('/:teamId/players/:playerId', async (c) => {
  const teamId = c.req.param('teamId');
  const playerId = c.req.param('playerId');
  try {
    await c.env.DB.prepare(
      `DELETE FROM players WHERE id = ? AND team_id = ?`
    ).bind(playerId, teamId).run();
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: '選手の削除に失敗しました' }, 500);
  }
});

export default app;
