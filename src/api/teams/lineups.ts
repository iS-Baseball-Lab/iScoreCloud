// filepath: src/api/teams/lineups.ts
import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { lineupTemplates } from '@/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import { ensureMatchLineupColumns } from '@/lib/db-helper'

const app = new Hono<{ Bindings: { DB: D1Database } }>()

app.get('/:teamId/lineup-templates', async (c) => {
  await ensureMatchLineupColumns(c.env.DB)
  const db = drizzle(c.env.DB)
  const teamId = c.req.param('teamId')
  try {
    const templates = await db.select().from(lineupTemplates).where(eq(lineupTemplates.teamId, teamId)).orderBy(desc(lineupTemplates.createdAt))
    return c.json(templates)
  } catch { return c.json({ error: 'Failed to fetch templates' }, 500) }
})

app.post('/:teamId/lineup-templates', async (c) => {
  await ensureMatchLineupColumns(c.env.DB)
  const db = drizzle(c.env.DB)
  const teamId = c.req.param('teamId')
  const body = await c.req.json<{ name?: string; lineupData?: unknown }>()
  const id = crypto.randomUUID()
  try {
    await db.insert(lineupTemplates).values({ id, teamId, name: body.name || '', lineupData: JSON.stringify(body.lineupData ?? []) })
    return c.json({ success: true, id })
  } catch { return c.json({ error: 'Failed to save template' }, 500) }
})

app.delete('/:teamId/lineup-templates/:id', async (c) => {
  await ensureMatchLineupColumns(c.env.DB)
  const db = drizzle(c.env.DB)
  const teamId = c.req.param('teamId')
  const id = c.req.param('id')
  try {
    await db.delete(lineupTemplates).where(and(eq(lineupTemplates.id, id), eq(lineupTemplates.teamId, teamId)))
    return c.json({ success: true })
  } catch { return c.json({ error: 'Failed to delete template' }, 500) }
})

export default app;
