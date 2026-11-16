// filepath: src/api/venues.ts
import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { venues, matches } from '@/db/schema/match'
import { eq, desc } from 'drizzle-orm'
import { resolveCallerTeamAccess } from '@/lib/team-access'
import type { WorkerEnv } from '@/types/api'

const app = new Hono<{ Bindings: WorkerEnv }>()

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🗺️ 球場・グラウンド 基本CRUD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 球場一覧の取得 */
app.get('/', async (c) => {
  const access = await resolveCallerTeamAccess(c)
  if (!access.isAuthenticated) return c.json({ error: 'Unauthorized' }, 401)

  const db = drizzle(c.env.DB)
  try {
    const list = await db.select().from(venues).orderBy(desc(venues.createdAt))
    return c.json({ success: true, data: list })
  } catch {
    return c.json({ success: false, error: '球場一覧の取得に失敗しました' }, 500)
  }
})

/** 新規球場の追加（指導者・管理者のみ） */
app.post('/', async (c) => {
  const access = await resolveCallerTeamAccess(c)
  if (!access.isAuthenticated) return c.json({ error: 'Unauthorized' }, 401)
  if (!access.isSystemAdmin && access.playerManageableTeamIds.size === 0) {
    return c.json({ error: '球場の登録には指導者・管理者権限が必要です' }, 403)
  }

  const body = await c.req.json<{
    name: string
    shortName?: string
    address?: string
    mapUrl?: string
    surfaceType?: string
    dimensions?: string
    notes?: string
  }>()

  if (!body.name || !body.name.trim()) {
    return c.json({ error: '球場名は必須です' }, 400)
  }

  const db = drizzle(c.env.DB)
  const newId = crypto.randomUUID()
  try {
    await db.insert(venues).values({
      id: newId,
      name: body.name.trim(),
      shortName: body.shortName?.trim() || null,
      address: body.address?.trim() || null,
      mapUrl: body.mapUrl?.trim() || null,
      surfaceType: body.surfaceType || 'dirt',
      dimensions: body.dimensions?.trim() || null,
      notes: body.notes?.trim() || null,
    })
    return c.json({ success: true, id: newId })
  } catch {
    return c.json({ success: false, error: '球場の登録に失敗しました' }, 500)
  }
})

/** 球場情報の更新（指導者・管理者のみ ＆ 他チーム利用中の球場上書き防止） */
app.patch('/:id', async (c) => {
  const access = await resolveCallerTeamAccess(c)
  if (!access.isAuthenticated) return c.json({ error: 'Unauthorized' }, 401)
  if (!access.isSystemAdmin && access.playerManageableTeamIds.size === 0) {
    return c.json({ error: '球場の更新には指導者・管理者権限が必要です' }, 403)
  }

  const id = c.req.param('id')!
  const body = await c.req.json<{
    name?: string | null
    shortName?: string | null
    address?: string | null
    mapUrl?: string | null
    surfaceType?: string | null
    dimensions?: string | null
    notes?: string | null
  }>()

  const db = drizzle(c.env.DB)
  try {
    if (!access.isSystemAdmin) {
      const refMatches = await db.select({ teamId: matches.teamId }).from(matches).where(eq(matches.venueId, id)).all()
      const usedByOtherTeam = refMatches.some((m) => !access.canManagePlayersForTeam(m.teamId))
      if (usedByOtherTeam) {
        return c.json({ success: false, error: '他チームの試合記録で使用されている球場のため変更できません' }, 403)
      }
    }

    const s = (val: string | null | undefined) => (val && typeof val === 'string') ? val.trim() : null
    const updateData: Partial<typeof venues.$inferInsert> = {}
    if (body.name !== undefined && body.name?.trim()) updateData.name = body.name.trim()
    if (body.shortName !== undefined) updateData.shortName = s(body.shortName)
    if (body.address !== undefined) updateData.address = s(body.address)
    if (body.mapUrl !== undefined) updateData.mapUrl = s(body.mapUrl)
    if (body.surfaceType !== undefined && body.surfaceType) updateData.surfaceType = body.surfaceType
    if (body.dimensions !== undefined) updateData.dimensions = s(body.dimensions)
    if (body.notes !== undefined) updateData.notes = s(body.notes)

    if (Object.keys(updateData).length > 0) {
      await db.update(venues)
        .set(updateData)
        .where(eq(venues.id, id))
    }
    return c.json({ success: true })
  } catch {
    return c.json({ success: false, error: '球場の更新に失敗しました' }, 500)
  }
})

/** 球場の削除（指導者・管理者のみ ＆ 他チーム利用中の球場削除防止） */
app.delete('/:id', async (c) => {
  const access = await resolveCallerTeamAccess(c)
  if (!access.isAuthenticated) return c.json({ error: 'Unauthorized' }, 401)
  if (!access.isSystemAdmin && access.playerManageableTeamIds.size === 0) {
    return c.json({ error: '球場の削除には指導者・管理者権限が必要です' }, 403)
  }

  const id = c.req.param('id')!
  const db = drizzle(c.env.DB)
  try {
    if (!access.isSystemAdmin) {
      const refMatches = await db.select({ teamId: matches.teamId }).from(matches).where(eq(matches.venueId, id)).all()
      const usedByOtherTeam = refMatches.some((m) => !access.canManagePlayersForTeam(m.teamId))
      if (usedByOtherTeam) {
        return c.json({ success: false, error: '他チームの試合記録で使用されている球場のため削除できません' }, 403)
      }
    }

    await db.delete(venues).where(eq(venues.id, id))
    return c.json({ success: true })
  } catch {
    return c.json({ success: false, error: '球場の削除に失敗しました' }, 500)
  }
})

export default app
