// filepath: src/api/teams/members.ts
// 🌟 一番上の `handleJoinTeam` 関数をこの内容に上書きしてください

/** 🌟 チーム参加申請（型安全＆ねじれ解消版） */
export const handleJoinTeam = async (c: Context) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session || !session.user) return c.json({ success: false, error: 'Unauthorized' }, 401)

  const body = await c.req.json().catch(() => null)
  if (!body || !body.inviteCode) {
    return c.json({ success: false, error: '招待コードが入力されていません' }, 400)
  }

  const targetTeamId = body.inviteCode.trim()
  const db = drizzle(c.env.DB)

  try {
    const team = await db.select().from(teams).where(eq(teams.id, targetTeamId)).get()
    if (!team) return c.json({ success: false, error: '無効な招待コードです' }, 444)

    const existing = await db.select().from(teamMembers).where(and(eq(teamMembers.teamId, targetTeamId), eq(teamMembers.userId, session.user.id))).get()
    if (existing) {
      if (existing.status === 'pending') return c.json({ success: false, error: 'すでに参加申請を送信済みです。承認をお待ちください。' }, 400)
      return c.json({ success: false, error: 'すでにこのチームに参加しています。' }, 400)
    }

    // 💡 解決策：スキーマの mode: 'timestamp' の型縛りを `as any` で突破し、
    // システムの正解である「10桁の秒数数値」を確実にデータベースへ叩き込む！
    await db.insert(teamMembers).values({
      id: crypto.randomUUID(),
      teamId: targetTeamId,
      userId: session.user.id,
      role: 'pending',
      status: 'pending',
      joinedAt: Math.floor(Date.now() / 1000) as any // 🔥 これが正解です！
    })

    return c.json({ success: true, message: '参加申請を送信しました！' })
  } catch (e: any) { 
    console.error("[iScore API Error] チーム参加申請でエラー:", e.message);
    return c.json({ success: false, error: '申請処理に失敗しました', details: e.message }, 500) 
  }
}
