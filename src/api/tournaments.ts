// src/api/tournaments.ts
import { Hono } from 'hono'
import { getAuth } from "@/lib/auth"
import { drizzle } from 'drizzle-orm/d1'
import { tournaments, matches } from '@/db/schema'
import type { WorkerEnv } from '@/types/api'
import { desc, eq } from 'drizzle-orm'

const app = new Hono<{ Bindings: WorkerEnv }>()

// ──────────────────────────────────
// GET /api/tournaments
// 大会一覧取得（新しい順）
// ──────────────────────────────────
app.get('/', async (c) => {
    const auth = getAuth(c.env.DB, c.env)
    const session = await auth.api.getSession({ headers: c.req.raw.headers as any })
    if (!session) return c.json({ error: 'Unauthorized' }, 401)

    const db = drizzle(c.env.DB)
    const category = c.req.query('category')
    try {
        const results = category && category !== 'all'
            ? await db.select().from(tournaments).where(eq(tournaments.category, category)).orderBy(desc(tournaments.createdAt))
            : await db.select().from(tournaments).orderBy(desc(tournaments.createdAt));
        return c.json(results)
    } catch (e) {
        return c.json({ error: '大会の取得に失敗しました' }, 500)
    }
})

// ──────────────────────────────────
// POST /api/tournaments
// 大会の新規登録
// ──────────────────────────────────
app.post('/', async (c) => {
    const auth = getAuth(c.env.DB, c.env)
    const session = await auth.api.getSession({ headers: c.req.raw.headers as any })
    if (!session) return c.json({ error: 'Unauthorized' }, 401)

    const body = await c.req.json()
    const db = drizzle(c.env.DB)
    const tournamentId = crypto.randomUUID()

    try {
        await db.insert(tournaments).values({
            id: tournamentId,
            name: body.name,
            category: body.category ?? 'other',
            season: body.season ?? String(new Date().getFullYear()),
            organizer: body.organizer ?? null,
            bracketUrl: body.bracketUrl ?? null,
            timeLimit: body.timeLimit ?? null,
            coldGameRule: body.coldGameRule ?? null,
            tiebreakerRule: body.tiebreakerRule ?? null,
            startDate: body.startDate ?? null,
            endDate: body.endDate ?? null,
        })
        return c.json({ success: true, id: tournamentId })
    } catch (e) {
        console.error(e)
        return c.json({ success: false, error: '大会の作成に失敗しました' }, 500)
    }
})

// ──────────────────────────────────
// PATCH /api/tournaments/:id
// 大会情報の更新
// ──────────────────────────────────
app.patch('/:id', async (c) => {
    const auth = getAuth(c.env.DB, c.env)
    const session = await auth.api.getSession({ headers: c.req.raw.headers as any })
    if (!session) return c.json({ error: 'Unauthorized' }, 401)

    const id = c.req.param('id')
    const body = await c.req.json()
    const db = drizzle(c.env.DB)

    try {
        await db.update(tournaments).set({
            name: body.name,
            category: body.category ?? 'other',
            season: body.season,
            organizer: body.organizer ?? null,
            bracketUrl: body.bracketUrl ?? null,
            timeLimit: body.timeLimit ?? null,
            coldGameRule: body.coldGameRule ?? null,
            tiebreakerRule: body.tiebreakerRule ?? null,
            startDate: body.startDate ?? null,
            endDate: body.endDate ?? null,
        }).where(eq(tournaments.id, id))
        return c.json({ success: true })
    } catch (e) {
        console.error(e)
        return c.json({ success: false, error: '更新に失敗しました' }, 500)
    }
})

// ──────────────────────────────────
// DELETE /api/tournaments/:id
// 大会の削除（関連試合のtournamentIdをnullに）
// ──────────────────────────────────
app.delete('/:id', async (c) => {
    const auth = getAuth(c.env.DB, c.env)
    const session = await auth.api.getSession({ headers: c.req.raw.headers as any })
    if (!session) return c.json({ error: 'Unauthorized' }, 401)

    const id = c.req.param('id')
    const db = drizzle(c.env.DB)

    try {
        await db.update(matches).set({ tournamentId: null }).where(eq(matches.tournamentId, id))
        await db.delete(tournaments).where(eq(tournaments.id, id))
        return c.json({ success: true })
    } catch (e) {
        return c.json({ success: false, error: '削除に失敗しました' }, 500)
    }
})

export default app
