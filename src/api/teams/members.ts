// filepath: src/api/teams/members.ts
import type { Context } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import {
  teams,
  teamMembers,
  teamRoleSettings,
  parentChildRelations,
  attendances,
  memberCars,
  eventCarpools,
  eventCarpoolRiders,
  teamGroupMembers,
  eventEquipments,
} from '@/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { resolveCallerTeamAccess } from '@/lib/team-access'
import type { WorkerEnv } from '@/types/api'

type TeamContext = Context<{ Bindings: WorkerEnv }>

interface RawMemberRow {
  memberId: string
  userId: string | null
  role: string | null
  subRoles: string | null
  status: string | null
  joinedAt: string | number | null
  memberName: string | null
  nameKana: string | null
  memberType: string | null
  phone: string | null
  memberEmail: string | null
  userName: string | null
  avatarUrl: string | null
  userEmail: string | null
}

/** 🌟 チーム参加申請（型安全＆ねじれ解消版） */
export const handleJoinTeam = async (c: TeamContext) => {
  const access = await resolveCallerTeamAccess(c)
  if (!access.sessionUser) return c.json({ success: false, error: 'Unauthorized' }, 401)

  const body = await c.req.json<{ inviteCode?: string }>().catch(() => null)
  if (!body || !body.inviteCode) {
    return c.json({ success: false, error: '招待コードが入力されていません' }, 400)
  }

  const rawCode = body.inviteCode.trim()
  if (rawCode.length < 6) {
    return c.json({ success: false, error: '有効な招待コードを入力してください' }, 400)
  }

  const db = drizzle(c.env.DB)

  try {
    let team = await db.select().from(teams).where(eq(teams.id, rawCode)).get()
    if (!team && rawCode.length >= 8) {
      const allTeams = await db.select().from(teams).all()
      const prefixMatches = allTeams.filter(
        (t) => t.id.toLowerCase().startsWith(rawCode.toLowerCase())
      )
      if (prefixMatches.length === 1) {
        team = prefixMatches[0]
      }
    }
    if (!team) return c.json({ success: false, error: '無効な招待コードです' }, 404)

    const targetTeamId = team.id
    if (access.canAccessTeam(targetTeamId)) {
      return c.json({ success: false, error: 'すでにこのチームに参加しています。' }, 400)
    }

    const candidateIds = access.candidateUserIds.length > 0
      ? access.candidateUserIds
      : [access.sessionUser.id]

    const existing = await db.select().from(teamMembers)
      .where(and(eq(teamMembers.teamId, targetTeamId), inArray(teamMembers.userId, candidateIds)))
      .get()
    if (existing) {
      if (existing.status === 'pending') {
        return c.json({ success: false, error: 'すでに参加申請を送信済みです。承認をお待ちください。' }, 400)
      }
      return c.json({ success: false, error: 'すでにこのチームに参加しています。' }, 400)
    }

    await db.insert(teamMembers).values({
      id: crypto.randomUUID(),
      teamId: targetTeamId,
      userId: access.sessionUser.id,
      role: 'pending',
      status: 'pending',
      joinedAt: new Date(),
    })

    return c.json({ success: true, message: '参加申請を送信しました！' })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.error("[iScore API Error] チーム参加申請でエラー:", message)
    return c.json({ success: false, error: '申請処理に失敗しました', details: message }, 500)
  }
}

/** チーム検索（完全一致のチームIDのみ許可） */
export const handleSearchTeam = async (c: TeamContext) => {
  const access = await resolveCallerTeamAccess(c)
  if (!access.sessionUser) return c.json({ error: 'Unauthorized' }, 401)
  const teamId = (c.req.param('id') || '').trim()
  if (teamId.length < 8) {
    return c.json({ success: false, error: '指定されたチームが見つかりません' }, 404)
  }
  const db = drizzle(c.env.DB)

  try {
    const teamData = await db.select({ id: teams.id, name: teams.name, year: teams.year, tier: teams.tier })
      .from(teams).where(eq(teams.id, teamId)).get()
    if (!teamData) return c.json({ success: false, error: '指定されたチームが見つかりません' }, 404)
    return c.json({ success: true, team: teamData })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return c.json({ success: false, error: '検索に失敗しました', details: message }, 500)
  }
}

/** 🌟 チームメンバー一覧取得（承認済みの所属メンバーのみ閲覧可） */
export const handleGetMembers = async (c: TeamContext) => {
  const access = await resolveCallerTeamAccess(c)
  if (!access.isAuthenticated) return c.json({ error: 'Unauthorized' }, 401)

  const teamId = c.req.param('id')!
  const db = drizzle(c.env.DB)

  try {
    if (!access.canAccessTeam(teamId)) {
      return c.json({ error: '権限がありません' }, 403)
    }

    const canManage = access.canManageTeamId(teamId)

    let roleSettings: Array<{ id: string; teamId: string; role: string; customLabel: string }> = []
    try {
      roleSettings = await db.select().from(teamRoleSettings).where(eq(teamRoleSettings.teamId, teamId))
    } catch {
      console.warn("[iScore Warning] team_role_settings テーブルが未作成です。")
    }

    // ① まずは安全に確実に取れる情報だけをクエリする (LEFT JOIN に変更してアカウントなしメンバーに対応)
    const { results } = await c.env.DB.prepare(`
      SELECT
        tm.id              AS memberId,
        tm.user_id         AS userId,
        tm.role,
        tm.sub_roles       AS subRoles,
        tm.status,
        tm.joined_at       AS joinedAt,
        tm.name            AS memberName,
        tm.name_kana       AS nameKana,
        tm.member_type     AS memberType,
        tm.phone,
        tm.email           AS memberEmail,
        u.name             AS userName,
        COALESCE(tm.avatar_url, u.image) AS avatarUrl,
        u.email            AS userEmail
      FROM team_members tm
      LEFT JOIN user u ON tm.user_id = u.id
      WHERE tm.team_id = ?
        AND (tm.user_id IS NULL OR tm.user_id NOT IN (SELECT user_id FROM players WHERE team_id = ? AND user_id IS NOT NULL))
      ORDER BY
        CASE tm.status WHEN 'pending' THEN 0 ELSE 1 END,
        tm.joined_at ASC
    `).bind(teamId, teamId).all<RawMemberRow>()

    // ② ソーシャルログイン情報 (provider) の取得を試みる（安全設計）
    const providersMap: Record<string, string[]> = {}
    try {
      let accResults: Array<Record<string, unknown>> = []
      try {
        accResults = (await c.env.DB.prepare(`SELECT * FROM account`).all<Record<string, unknown>>()).results
      } catch {
        accResults = (await c.env.DB.prepare(`SELECT * FROM accounts`).all<Record<string, unknown>>()).results
      }

      for (const row of accResults) {
        const uid = String(row.userId || row.user_id || '')
        const p = String(row.providerId || row.provider_id || row.provider || '')
        if (uid && p) {
          if (!providersMap[uid]) providersMap[uid] = []
          providersMap[uid].push(p)
        }
      }
    } catch {
      console.warn("[iScore Warning] プロバイダー情報の取得をスキップしました")
    }

    // ③ フロントエンド用のフォーマットに合体させる（非管理者には pending 行・連絡先・招待コードを非公開）
    const visibleRows = canManage
      ? (results || [])
      : (results || []).filter((row) => (row.status || 'active') === 'active')

    const formattedMembers = visibleRows.map((row) => {
      let parsedSubRoles: string[] = []
      if (row.subRoles) {
        try {
          const raw = typeof row.subRoles === 'string' ? JSON.parse(row.subRoles) : row.subRoles
          if (Array.isArray(raw)) {
            parsedSubRoles = raw.filter((item): item is string => typeof item === 'string')
          }
        } catch {
          parsedSubRoles = []
        }
      }
      return {
        memberId: row.memberId,
        userId: row.userId,
        role: row.role,
        subRoles: parsedSubRoles,
        status: row.status,
        joinedAt: row.joinedAt,
        name: row.memberName || row.userName || '名前なし',
        nameKana: row.nameKana,
        avatarUrl: row.avatarUrl,
        email: canManage ? (row.memberEmail || row.userEmail || '') : '',
        memberType: row.memberType,
        phone: canManage ? row.phone : null,
        authProviders: row.userId ? (providersMap[row.userId] || []) : [],
      }
    })

    return c.json({
      success: true,
      members: formattedMembers,
      inviteCode: canManage ? teamId : '',
      roleSettings,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return c.json({ success: false, error: 'メンバー一覧の取得に失敗しました', details: message }, 500)
  }
}

/** 🌟 役割呼称カスタマイズの保存・更新 */
export const handlePutRoleSettings = async (c: TeamContext) => {
  const access = await resolveCallerTeamAccess(c)
  if (!access.isAuthenticated) return c.json({ error: 'Unauthorized' }, 401)

  const teamId = c.req.param('id')!
  const { settings } = await c.req.json<{ settings: Array<{ role: string; customLabel: string }> }>()
  const db = drizzle(c.env.DB)

  try {
    if (!access.canManageTeamId(teamId)) return c.json({ error: '権限がありません' }, 403)

    try {
      await c.env.DB.prepare(`DELETE FROM team_role_settings WHERE team_id = ?`).bind(teamId).run()
      for (const item of settings) {
        if (!item.customLabel.trim()) continue
        await db.insert(teamRoleSettings).values({
          id: crypto.randomUUID(),
          teamId,
          role: item.role.toLowerCase(),
          customLabel: item.customLabel.trim(),
        })
      }
    } catch {
      return c.json({ success: false, error: 'データベースの役割設定テーブルが存在しません。先にマイグレーションを実行してください。' }, 500)
    }

    return c.json({ success: true })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return c.json({ success: false, error: '呼称設定の保存に失敗しました', details: message }, 500)
  }
}

/** 🌟 メンバーのロール変更（自動承認機能つき） */
export const handlePatchMemberRole = async (c: TeamContext) => {
  const access = await resolveCallerTeamAccess(c)
  if (!access.isAuthenticated) return c.json({ error: 'Unauthorized' }, 401)

  const teamId = c.req.param('id')!
  const memberId = c.req.param('memberId')!
  const { role, subRoles } = await c.req.json<{ role: string; subRoles?: string[] }>()
  const db = drizzle(c.env.DB)

  try {
    if (!access.canManageTeamId(teamId)) {
      return c.json({ error: '権限がありません' }, 403)
    }

    const updateData: { role: string; status: string; subRoles?: string } = {
      role: role.toLowerCase(),
      status: 'active',
    }
    if (subRoles !== undefined) {
      updateData.subRoles = JSON.stringify(subRoles)
    }

    // 💡 ロール変更と同時に、status を 'active' に強制昇格させる
    await db.update(teamMembers)
      .set(updateData)
      .where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, teamId)))

    return c.json({ success: true })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return c.json({ success: false, error: 'Failed', details: message }, 500)
  }
}

/** メンバーを除名 */
export const handleRemoveMember = async (c: TeamContext) => {
  const access = await resolveCallerTeamAccess(c)
  if (!access.isAuthenticated) return c.json({ error: 'Unauthorized' }, 401)

  const teamId = c.req.param('id')!
  const memberId = c.req.param('memberId')!
  const db = drizzle(c.env.DB)

  try {
    if (!access.canManageTeamId(teamId)) {
      return c.json({ error: '権限がありません' }, 403)
    }

    const target = await db.select().from(teamMembers).where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, teamId))).get()
    if (target?.userId && access.candidateUserIds.includes(target.userId)) {
      return c.json({ error: '自分自身を除名することはできません' }, 400)
    }

    await db.delete(teamMembers).where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, teamId)))
    return c.json({ success: true })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return c.json({ success: false, error: 'Failed', details: message }, 500)
  }
}

/** 🌟 アカウント無しの新規メンバー（スタッフ・保護者）登録 */
export const handleCreateMember = async (c: TeamContext) => {
  const access = await resolveCallerTeamAccess(c)
  if (!access.isAuthenticated) return c.json({ error: 'Unauthorized' }, 401)

  const teamId = c.req.param('id')!
  const { name, nameKana, memberType, phone, email, avatarUrl } = await c.req.json<{
    name: string
    nameKana?: string
    memberType: 'staff' | 'parent' | 'other' | 'player'
    phone?: string
    email?: string
    avatarUrl?: string
  }>()
  const db = drizzle(c.env.DB)

  try {
    if (!access.canManageTeamId(teamId)) {
      return c.json({ error: '権限がありません' }, 403)
    }

    if (!name || !name.trim()) {
      return c.json({ error: '名前は必須です' }, 400)
    }

    await db.insert(teamMembers).values({
      id: crypto.randomUUID(),
      teamId,
      userId: null, // アカウント未紐付け
      name: name.trim(),
      nameKana: nameKana?.trim() || null,
      memberType: memberType || 'parent',
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      avatarUrl: avatarUrl?.trim() || null,
      role: 'player', // アプリ内の権限はデフォルト player
      status: 'active',
    })

    return c.json({ success: true })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return c.json({ success: false, error: '登録に失敗しました', details: message }, 500)
  }
}

/** 🌟 メンバー情報の更新 (およびログインユーザーとの紐付け) */
export const handleUpdateMemberInfo = async (c: TeamContext) => {
  const access = await resolveCallerTeamAccess(c)
  if (!access.isAuthenticated) return c.json({ error: 'Unauthorized' }, 401)

  const teamId = c.req.param('id')!
  const memberId = c.req.param('memberId')!
  if (!teamId || !memberId) {
    return c.json({ error: 'パラメータが不足しています' }, 400)
  }
  const { name, nameKana, memberType, phone, email, userId, avatarUrl } = await c.req.json<{
    name?: string
    nameKana?: string
    memberType?: 'staff' | 'parent' | 'other' | 'player'
    phone?: string
    email?: string
    userId?: string | null
    avatarUrl?: string | null
  }>()
  const db = drizzle(c.env.DB)

  try {
    if (!access.canManageTeamId(teamId)) {
      return c.json({ error: '権限がありません' }, 403)
    }

    // もし別のログインユーザーと紐付ける場合、すでにそのユーザーがこのチームに二重登録されていないか検証
    if (userId) {
      const duplicate = await db.select().from(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId))).get()
      if (duplicate && duplicate.id !== memberId) {
        return c.json({ error: '指定されたユーザーはすでにチームに登録されています。重複登録はできません。' }, 400)
      }
    }

    await db.update(teamMembers)
      .set({
        name: name !== undefined ? (name?.trim() || null) : undefined,
        nameKana: nameKana !== undefined ? (nameKana?.trim() || null) : undefined,
        memberType: memberType || undefined,
        phone: phone !== undefined ? (phone?.trim() || null) : undefined,
        email: email !== undefined ? (email?.trim() || null) : undefined,
        userId: userId !== undefined ? userId : undefined,
        avatarUrl: avatarUrl !== undefined ? avatarUrl : undefined,
      })
      .where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, teamId)))

    return c.json({ success: true })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return c.json({ success: false, error: '更新に失敗しました', details: message }, 500)
  }
}

/** 🔗 メンバー統合（手動登録メンバーとソーシャルログインメンバーのマージ） */
export const handleMergeMembers = async (c: TeamContext) => {
  const access = await resolveCallerTeamAccess(c)
  if (!access.isAuthenticated) return c.json({ error: 'Unauthorized' }, 401)

  const teamId = c.req.param('id')!
  if (!teamId) return c.json({ error: 'パラメータが不足しています' }, 400)

  const { targetMemberId, sourceMemberId } = await c.req.json<{
    targetMemberId: string // 残す手動登録メンバー (またはマスター側)
    sourceMemberId: string // 統合元 (ソーシャルログインで生成された重複メンバー)
  }>()

  if (!targetMemberId || !sourceMemberId) {
    return c.json({ error: '統合対象のメンバーIDが指定されていません' }, 400)
  }
  if (targetMemberId === sourceMemberId) {
    return c.json({ error: '同じメンバー同士を統合することはできません' }, 400)
  }

  const db = drizzle(c.env.DB)

  try {
    if (!access.canManageTeamId(teamId)) {
      return c.json({ error: 'メンバーを統合する権限がありません' }, 403)
    }

    const target = await db.select().from(teamMembers).where(and(eq(teamMembers.id, targetMemberId), eq(teamMembers.teamId, teamId))).get()
    const source = await db.select().from(teamMembers).where(and(eq(teamMembers.id, sourceMemberId), eq(teamMembers.teamId, teamId))).get()

    if (!target) return c.json({ error: '統合先のメンバーが見つかりません' }, 404)
    if (!source) return c.json({ error: '統合元のメンバーが見つかりません' }, 404)

    // 💡 統合後のユーザーID: targetのuserIdを優先し、なければsourceのuserIdを採用
    const resolvedUserId = target.userId || source.userId

    // 1. 🔗 親子関係の統合 (parentChildRelations)
    const sourceRelations = await db.select().from(parentChildRelations)
      .where(and(eq(parentChildRelations.teamId, teamId), eq(parentChildRelations.parentId, sourceMemberId))).all()
    for (const rel of sourceRelations) {
      const existing = await db.select().from(parentChildRelations)
        .where(and(eq(parentChildRelations.teamId, teamId), eq(parentChildRelations.parentId, targetMemberId), eq(parentChildRelations.childId, rel.childId))).get()
      if (existing) {
        await db.delete(parentChildRelations).where(eq(parentChildRelations.id, rel.id))
      } else {
        await db.update(parentChildRelations).set({ parentId: targetMemberId }).where(eq(parentChildRelations.id, rel.id))
      }
    }

    // 2. 📊 出欠記録の統合 (attendances)
    const sourceAttendances = await db.select().from(attendances)
      .where(eq(attendances.memberId, sourceMemberId)).all()
    for (const att of sourceAttendances) {
      const targetAtt = await db.select().from(attendances)
        .where(and(eq(attendances.eventId, att.eventId), eq(attendances.memberId, targetMemberId))).get()
      if (targetAtt) {
        if (targetAtt.status === 'pending' && att.status !== 'pending') {
          await db.update(attendances).set({
            status: att.status,
            comment: att.comment || targetAtt.comment,
            selectedGroupId: att.selectedGroupId || targetAtt.selectedGroupId,
            hasCar: att.hasCar || targetAtt.hasCar,
            carId: att.carId || targetAtt.carId,
            userId: resolvedUserId,
            updatedAt: new Date(),
          }).where(eq(attendances.id, targetAtt.id))
        }
        await db.delete(attendances).where(eq(attendances.id, att.id))
      } else {
        await db.update(attendances).set({
          memberId: targetMemberId,
          userId: resolvedUserId,
        }).where(eq(attendances.id, att.id))
      }
    }

    // 3. 🚗 登録車両の統合 (memberCars)
    await db.update(memberCars).set({ ownerId: targetMemberId })
      .where(and(eq(memberCars.teamId, teamId), eq(memberCars.ownerId, sourceMemberId)))
    await db.update(memberCars).set({ ownerId2: targetMemberId })
      .where(and(eq(memberCars.teamId, teamId), eq(memberCars.ownerId2, sourceMemberId)))

    // 4. 🚙 配車ドライバーの統合 (eventCarpools)
    await db.update(eventCarpools).set({ driverId: targetMemberId })
      .where(eq(eventCarpools.driverId, sourceMemberId))

    // 5. 👥 配車同乗者の統合 (eventCarpoolRiders)
    const sourceRiders = await db.select().from(eventCarpoolRiders)
      .where(eq(eventCarpoolRiders.memberId, sourceMemberId)).all()
    for (const rider of sourceRiders) {
      const existing = await db.select().from(eventCarpoolRiders)
        .where(and(eq(eventCarpoolRiders.carpoolId, rider.carpoolId), eq(eventCarpoolRiders.memberId, targetMemberId))).get()
      if (existing) {
        await db.delete(eventCarpoolRiders).where(eq(eventCarpoolRiders.id, rider.id))
      } else {
        await db.update(eventCarpoolRiders).set({ memberId: targetMemberId }).where(eq(eventCarpoolRiders.id, rider.id))
      }
    }

    // 6. 🏷️ チームグループ所属の統合 (teamGroupMembers)
    const sourceGroupMembers = await db.select().from(teamGroupMembers)
      .where(eq(teamGroupMembers.teamMemberId, sourceMemberId)).all()
    for (const tgm of sourceGroupMembers) {
      const existing = await db.select().from(teamGroupMembers)
        .where(and(eq(teamGroupMembers.groupId, tgm.groupId), eq(teamGroupMembers.teamMemberId, targetMemberId))).get()
      if (existing) {
        await db.delete(teamGroupMembers).where(eq(teamGroupMembers.id, tgm.id))
      } else {
        await db.update(teamGroupMembers).set({ teamMemberId: targetMemberId }).where(eq(teamGroupMembers.id, tgm.id))
      }
    }

    // 7. 📦 用具積載担当の統合 (eventEquipments)
    await db.update(eventEquipments).set({ responsibleMemberId: targetMemberId })
      .where(eq(eventEquipments.responsibleMemberId, sourceMemberId))

    // 8. 👤 ターゲットメンバーの更新 (userId, contact, status)
    const newAvatar = target.avatarUrl || source.avatarUrl || null
    const newPhone = target.phone || source.phone || null
    const newEmail = target.email || source.email || null
    const newNameKana = target.nameKana || source.nameKana || null

    await db.update(teamMembers).set({
      userId: resolvedUserId,
      avatarUrl: newAvatar,
      phone: newPhone,
      email: newEmail,
      nameKana: newNameKana,
      status: 'active',
    }).where(eq(teamMembers.id, targetMemberId))

    // 9. 🗑️ 統合元メンバー（重複したソーシャル参加レコード）の削除
    await db.delete(teamMembers).where(eq(teamMembers.id, sourceMemberId))

    return c.json({
      success: true,
      message: `「${target.name || 'メンバー'}」に「${source.name || 'アカウント'}」を正常に統合しました！`,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[iScore Merge Error]:', message)
    return c.json({ success: false, error: 'メンバーの統合に失敗しました', details: message }, 500)
  }
}

/** 🌟 参加申請一覧取得 */
export const handleGetJoinRequests = async (c: TeamContext) => {
  const access = await resolveCallerTeamAccess(c)
  if (!access.isAuthenticated) return c.json({ error: 'Unauthorized' }, 401)

  const teamId = c.req.param('id')!

  try {
    if (!access.canManageTeamId(teamId)) {
      return c.json({ error: '権限がありません' }, 403)
    }

    const { results } = await c.env.DB.prepare(`
      SELECT
        tm.id              AS memberId,
        tm.user_id         AS userId,
        tm.role,
        tm.status,
        tm.joined_at       AS joinedAt,
        tm.name            AS memberName,
        tm.name_kana       AS nameKana,
        tm.member_type     AS memberType,
        tm.phone,
        tm.email           AS memberEmail,
        u.name             AS userName,
        COALESCE(tm.avatar_url, u.image) AS avatarUrl,
        u.email            AS userEmail
      FROM team_members tm
      LEFT JOIN user u ON tm.user_id = u.id
      WHERE tm.team_id = ?
        AND tm.status = 'pending'
      ORDER BY tm.joined_at DESC
    `).bind(teamId).all<RawMemberRow>()

    const formatted = (results || []).map((row) => ({
      memberId: row.memberId,
      userId: row.userId,
      name: row.memberName || row.userName || '新規メンバー',
      kana: row.nameKana,
      email: row.memberEmail || row.userEmail,
      phone: row.phone,
      memberType: row.memberType || 'parent',
      role: row.role || 'player',
      createdAt: row.joinedAt ? new Date(row.joinedAt).toISOString() : new Date().toISOString(),
      avatarUrl: row.avatarUrl,
    }))

    return c.json({ success: true, requests: formatted })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return c.json({ success: false, error: '申請一覧の取得に失敗しました', details: message }, 500)
  }
}

/** 🌟 参加申請の承認・却下 */
export const handleActionJoinRequest = async (c: TeamContext) => {
  const access = await resolveCallerTeamAccess(c)
  if (!access.isAuthenticated) return c.json({ error: 'Unauthorized' }, 401)

  const teamId = c.req.param('id')!
  const memberId = c.req.param('memberId')!
  const { action } = await c.req.json<{ action: 'approve' | 'reject' }>()
  const db = drizzle(c.env.DB)

  try {
    if (!access.canManageTeamId(teamId)) {
      return c.json({ error: '権限がありません' }, 403)
    }

    if (action === 'approve') {
      await db.update(teamMembers)
        .set({ status: 'active', role: 'parent' })
        .where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, teamId)))
      return c.json({ success: true, message: '参加を承認しました' })
    } else {
      await db.delete(teamMembers)
        .where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, teamId)))
      return c.json({ success: true, message: '申請を却下しました' })
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return c.json({ success: false, error: '処理に失敗しました', details: message }, 500)
  }
}
