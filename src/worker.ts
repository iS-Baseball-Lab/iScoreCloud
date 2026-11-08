// filepath: src/worker.ts
/* 💡 iScoreCloud 規約: 
   1. Hono を使用した中央集権的ルーティング。
   2. API ユニットの責務分離規約に基づき、参照系と更新系を適切にマウントする。 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import attendanceRoute from './api/attendance'
import attendanceUpdate from './api/attendance/update-attendance'
import eventsRoute from './api/events'
import authRoute from './api/auth'
import orgsRoute from './api/orgs'
import teamsRoute from './api/teams'
import teamsUpdateSettings from './api/teams/update-settings' // 🌟 追加：更新用ユニット
import matchesRoute from './api/matches'
import createMatchRoute from '@/api/matches/create-match';
import updateMatchRoute from './api/matches/update-match';
import matchesApi from './api/matches/update-score';
import lockRoute from './api/matches/lock';
import webhookRoute from './api/matches/webhook'
import adminRoute from './api/admin'
import imagesRouter from './api/images'
import seed from './api/seed'
import tournaments from './api/tournaments'
import testPush from './api/teams/test-push'
import carpoolsRoute from './api/carpools'
import equipmentsRoute from './api/equipments'
import venuesRoute from './api/venues'
import liffRoute from './api/liff'
import liffScorebookRoute from './api/liff/scorebook'
import liffPlayerGrowthRoute from './api/liff/player-growth'
import liffNewsGeneratorRoute from './api/liff/news-generator'
import liffCarpoolConvoyRoute from './api/liff/carpool-convoy'
import liffCarpoolSimpleRoute from './api/liff/carpool-simple'
import liffGroundsAiRoute from './api/liff/grounds-ai'
import documentsRoute from './api/documents'
import {
  createLiffTeamIsolationMiddleware,
  createSharedApiTeamIsolationMiddleware,
} from './lib/team-access'
import type { WorkerEnv } from './types/api'

const app = new Hono<{ Bindings: WorkerEnv }>()

// 🌟 CORSを全APIルートに適用（Better-Auth Cookie認証とLINE内ブラウザ/LIFF双方に対応）
app.use('*', cors({
  origin: (origin) => origin || '*',
  credentials: true,
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'X-Liff-User-Id',
    'X-Liff-User-Name',
    'X-iScore-Bypass-Cache',
  ],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  exposeHeaders: ['Content-Length'],
  maxAge: 86400,
}))

// 🛡️ チーム所属・招待承認ステータスによる厳格なアクセス隔離ガード
app.use(
  '/api/liff/*',
  createLiffTeamIsolationMiddleware({
    publicSubpaths: [
      '/api/liff/config',
      '/api/liff/my-status',
      '/api/liff/join',
      '/api/liff/hub',
    ],
  })
)

const sharedTeamGuard = createSharedApiTeamIsolationMiddleware()
app.use('/api/*', async (c, next) => {
  const pathname = new URL(c.req.url).pathname
  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/liff') ||
    pathname.startsWith('/api/organizations') ||
    pathname.startsWith('/api/admin') ||
    pathname.startsWith('/api/seed')
  ) {
    return next()
  }
  return sharedTeamGuard(c, next)
})

// 💡 整理整頓された美しいルーティング
app.route('/api/auth', authRoute)
app.route('/api/liff/scorebook', liffScorebookRoute)
app.route('/api/liff/players/growth', liffPlayerGrowthRoute)
app.route('/api/liff/news-generator', liffNewsGeneratorRoute)
app.route('/api/liff/carpool-convoy', liffCarpoolConvoyRoute)
app.route('/api/liff/carpool-simple', liffCarpoolSimpleRoute)
app.route('/api/liff/grounds/ai-lookup', liffGroundsAiRoute)
app.route('/api/liff', liffRoute)
app.route('/api/documents', documentsRoute)
app.route('/api/attendance', attendanceRoute)      // GET /api/attendance/:eventId
app.route('/api/attendance', attendanceUpdate)     // POST /api/attendance/update
app.route('/api/events', eventsRoute)
app.route('/api/organizations', orgsRoute)
app.route('/api/teams', teamsRoute)               // 参照系（GET /api/teams/settings など）
app.route('/api/teams', teamsUpdateSettings)     // 🌟 更新系（POST /api/teams/update-line）
app.route('/api/matches', matchesRoute)
app.route('/api/matches', createMatchRoute)
app.route('/api/matches', updateMatchRoute)
app.route('/api/matches', matchesApi)
app.route('/api/matches', lockRoute)
app.route('/api/matches/webhook', webhookRoute)
app.route('/api/admin', adminRoute)
app.route('/api/images', imagesRouter)
app.route('/api/seed', seed)
app.route('/api/tournaments', tournaments)
app.route('/api/teams', testPush)
app.route('/api/carpools', carpoolsRoute)
app.route('/api/equipments', equipmentsRoute)
app.route('/api/venues', venuesRoute)

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext) {
    const url = new URL(request.url)

    // 💡 規約: API パスは Hono に、静的アセットは ASSETS (Cloudflare Workers) に振り分け
    if (url.pathname.startsWith('/api/')) {
      const apiRes = await app.fetch(request, env, ctx)
      // 認証コールバック（Set-Cookie・302リダイレクト）や画像配信は生レスポンスをそのまま返却し、通常の2xx JSON APIのみHTTPキャッシュ抑止を付与
      if (
        !url.pathname.startsWith('/api/images/') &&
        !url.pathname.startsWith('/api/auth/') &&
        apiRes.status < 300 &&
        !apiRes.headers.has('Cache-Control')
      ) {
        const headers = new Headers(apiRes.headers)
        headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
        return new Response(apiRes.body, {
          status: apiRes.status,
          statusText: apiRes.statusText,
          headers,
        })
      }
      return apiRes
    }

    let assetRes = await env.ASSETS.fetch(request)

    // 🛡️ セーフティネット: Windows ビルドの Next.js RSC セグメント（/__next.a.b.__PAGE__.txt）が万一 404 の場合、スラッシュ階層側へフォールバック
    if (
      assetRes.status === 404 &&
      request.method === 'GET' &&
      url.pathname.includes('/__next.') &&
      url.pathname.endsWith('.txt')
    ) {
      const lastSlash = url.pathname.lastIndexOf('/__next.')
      if (lastSlash >= 0) {
        const prefix = url.pathname.slice(0, lastSlash)
        const segFile = url.pathname.slice(lastSlash + 1) // __next.liff.schedule.__PAGE__.txt
        const withoutExt = segFile.slice(0, -4) // __next.liff.schedule.__PAGE__
        const firstDotAfterNext = withoutExt.indexOf('.', '__next.'.length)
        if (firstDotAfterNext > 0) {
          const head = withoutExt.slice(0, firstDotAfterNext) // __next.liff
          const rest = withoutExt.slice(firstDotAfterNext + 1).replace(/\./g, '/') // schedule/__PAGE__
          const fallbackUrl = new URL(request.url)
          fallbackUrl.pathname = `${prefix}/${head}/${rest}.txt`
          const retryRes = await env.ASSETS.fetch(new Request(fallbackUrl.toString(), request))
          if (retryRes.ok) {
            assetRes = retryRes
          }
        }
      }
    }

    if (url.pathname.startsWith('/_next/static/')) {
      const headers = new Headers(assetRes.headers)
      headers.set('Cache-Control', 'public, max-age=31536000, immutable')
      return new Response(assetRes.body, {
        status: assetRes.status,
        statusText: assetRes.statusText,
        headers,
      })
    }

    const contentType = assetRes.headers.get('content-type') || ''
    if (contentType.includes('text/html') || url.pathname.endsWith('.txt')) {
      const headers = new Headers(assetRes.headers)
      headers.set('Cache-Control', 'public, max-age=0, must-revalidate')
      return new Response(assetRes.body, {
        status: assetRes.status,
        statusText: assetRes.statusText,
        headers,
      })
    }

    return assetRes
  }
}
