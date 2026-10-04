// src/app/api/images.ts
import { Hono } from 'hono'
import { getAuth } from "@/lib/auth"
import type { WorkerEnv } from "@/types/api"

const app = new Hono<{ Bindings: WorkerEnv }>()

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 💡 1. 画像アップロード API (POST /api/images/upload)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.post('/upload', async (c) => {
  const auth = getAuth(c.env.DB, c.env)
  const session = await auth.api.getSession({ headers: c.req.raw.headers as any })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const formData = await c.req.parseBody()
  const file = formData['file'] as File
  if (!file) return c.json({ error: 'File is required' }, 400)

  // 💡 アップロードの用途に応じて保存先フォルダを切り替える (type=team など)
  const uploadType = c.req.query('type') || 'avatar'
  const folder = uploadType === 'team' ? 'teams' : 'avatars'

  // 拡張子を取得して、ユーザーIDベースのユニークなファイル名を作成
  const fileExtension = file.name.split('.').pop()
  const fileName = `${folder}/${session.user.id}-${Date.now()}.${fileExtension}`

  try {
    // R2バケットへ保存！
    await c.env.BUCKET!.put(fileName, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    })

    // 💡 パブリックURLの代わりに、「自分のAPIを経由するURL」をフロントエンドに返す
    const imageUrl = `/api/images/${fileName}`
    return c.json({ success: true, imageUrl })
  } catch (e) {
    console.error("画像アップロードエラー:", e)
    return c.json({ success: false, error: 'Upload failed' }, 500)
  }
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 💡 2. 画像・添付ファイル配信 API (GET /api/images/:folder/:filename & /api/images/:folder/:subfolder/:filename)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function serveImage(c: any, path: string) {
  if (!c.env.BUCKET) return c.text('Not found', 404)

  // R2バケットから画像/ファイルを取り出す
  const object = await c.env.BUCKET.get(path)
  if (!object) return c.text('Not found', 404)

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)

  if (path.endsWith('.pdf')) {
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/pdf')
    }
    if (!headers.has('content-disposition')) {
      headers.set('content-disposition', 'inline')
    }
  }

  // 💡 究極のパフォーマンス最適化：ブラウザにキャッシュさせる！
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')

  return new Response(object.body, { headers })
}

app.get('/:folder/:filename', async (c) => {
  const folder = c.req.param('folder')
  const filename = c.req.param('filename')
  return serveImage(c, `${folder}/${filename}`)
})

app.get('/:folder/:subfolder/:filename', async (c) => {
  const folder = c.req.param('folder')
  const subfolder = c.req.param('subfolder')
  const filename = c.req.param('filename')
  return serveImage(c, `${folder}/${subfolder}/${filename}`)
})

export default app