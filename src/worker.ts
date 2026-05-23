// filepath: src/worker.ts
/* 💡 iScoreCloud 規約: 
   1. Hono を使用した中央集権的ルーティング。
   2. API ユニットの責務分離規約に基づき、参照系と更新系を適切にマウントする。 */

import { Hono } from 'hono'
import attendanceRoute from './api/attendance'
import attendanceUpdate from './api/attendance/update-attendance'
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
import type { WorkerEnv } from './types/api'

const app = new Hono<{ Bindings: WorkerEnv }>()

// 💡 整理整頓された美しいルーティング
app.route('/api/auth', authRoute)
app.route('/api/attendance', attendanceRoute)      // GET /api/attendance/:eventId
app.route('/api/attendance', attendanceUpdate)     // POST /api/attendance/update
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

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext) {
    const url = new URL(request.url)

    // 💡 規約: API パスは Hono に、静的アセットは ASSETS (Cloudflare Workers) に振り分け
    if (url.pathname.startsWith('/api/')) {
      return app.fetch(request, env, ctx)
    }

    return env.ASSETS.fetch(request)
  }
}
