import adminHtml from '../../../services/vibegene-api/static/admin.html'

type JsonObject = Record<string, unknown>

type CountRow = { count: number }
type VersionRow = { app_version: string; count: number }
type InstallRow = {
  install_key: string
  first_seen: number
  last_seen: number
  app_version: string
  platform: string
  timezone: string
  heartbeat_count: number
}
type ReportRow = {
  id: number
  created_at: number
  title: string
  description: string
  email: string | null
  app_version: string
  platform: string
  user_agent: string
  status_note: string
  diagnostics: string
  install_key: string | null
  resolved: number
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function securityHeaders(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'no-store')
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

function json(body: unknown, status = 200): Response {
  return securityHeaders(Response.json(body, { status }))
}

function allowedAdminEmails(env: Env): Set<string> {
  return new Set(env.ADMIN_EMAILS.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean))
}

async function requireAdmin(ctx: ExecutionContext, env: Env): Promise<string | null> {
  if (!ctx.access) return null
  const identity = await ctx.access.getIdentity()
  const email = typeof identity?.email === 'string' ? identity.email.trim().toLowerCase() : ''
  return email && allowedAdminEmails(env).has(email) ? email : null
}

async function stats(env: Env): Promise<Response> {
  const [total, active7, active30, new7, openReports, versions, recent] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS count FROM installs').first<CountRow>(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM installs WHERE last_seen >= unixepoch() - 7 * 86400').first<CountRow>(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM installs WHERE last_seen >= unixepoch() - 30 * 86400').first<CountRow>(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM installs WHERE first_seen >= unixepoch() - 7 * 86400').first<CountRow>(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM reports WHERE resolved = 0').first<CountRow>(),
    env.DB.prepare(`
      SELECT app_version, COUNT(*) AS count
      FROM installs
      WHERE last_seen >= unixepoch() - 30 * 86400
      GROUP BY app_version
      ORDER BY count DESC
      LIMIT 12
    `).all<VersionRow>(),
    env.DB.prepare(`
      SELECT install_key, first_seen, last_seen, app_version, platform, timezone, heartbeat_count
      FROM installs
      ORDER BY last_seen DESC
      LIMIT 50
    `).all<InstallRow>(),
  ])

  return json({
    totalInstalls: total?.count ?? 0,
    active7d: active7?.count ?? 0,
    active30d: active30?.count ?? 0,
    new7d: new7?.count ?? 0,
    openReports: openReports?.count ?? 0,
    versions30d: versions.results.map((row) => ({ version: row.app_version || 'unknown', count: row.count })),
    recentInstalls: recent.results.map((row) => ({
      install_id: row.install_key,
      first_seen: row.first_seen,
      last_seen: row.last_seen,
      app_version: row.app_version,
      platform: row.platform,
      timezone: row.timezone,
      heartbeat_count: row.heartbeat_count,
    })),
    generatedAt: Math.floor(Date.now() / 1000),
  })
}

async function reports(env: Env): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT id, created_at, title, description, email, app_version, platform,
           user_agent, status_note, diagnostics, install_key, resolved
    FROM reports
    ORDER BY created_at DESC
    LIMIT 200
  `).all<ReportRow>()
  return json({
    reports: result.results.map((row) => ({ ...row, install_id: row.install_key })),
  })
}

async function updateReport(request: Request, env: Env, reportId: number): Promise<Response> {
  if (!Number.isSafeInteger(reportId) || reportId <= 0) return json({ error: 'Invalid report ID' }, 400)
  const length = Number(request.headers.get('Content-Length') ?? 0)
  if (Number.isFinite(length) && length > 1024) return json({ error: 'Payload too large' }, 413)

  let input: unknown
  try {
    input = await request.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  if (!isObject(input) || typeof input.resolved !== 'boolean') {
    return json({ error: 'Expected a resolved boolean' }, 400)
  }
  const result = await env.DB.prepare('UPDATE reports SET resolved = ? WHERE id = ?')
    .bind(input.resolved ? 1 : 0, reportId)
    .run()
  if (result.meta.changes === 0) return json({ error: 'Report not found' }, 404)
  return json({ status: 'ok', id: reportId, resolved: input.resolved })
}

function serveAdmin(): Response {
  return securityHeaders(new Response(adminHtml, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  }))
}

async function handleFetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/admin' || url.pathname === '/admin/')) {
    return serveAdmin()
  }
  if (request.method === 'GET' && url.pathname === '/api/v1/admin/stats') return stats(env)
  if (request.method === 'GET' && url.pathname === '/api/v1/admin/reports') return reports(env)

  const reportMatch = url.pathname.match(/^\/api\/v1\/admin\/reports\/(\d+)$/)
  if (request.method === 'PATCH' && reportMatch) {
    return updateReport(request, env, Number(reportMatch[1]))
  }
  return json({ error: 'Not found' }, 404)
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    try {
      const email = await requireAdmin(ctx, env)
      if (!email) return json({ error: 'Cloudflare Access authorization required' }, 403)
      return await handleFetch(request, env)
    } catch (error) {
      console.error(JSON.stringify({
        message: 'admin request failed',
        path: new URL(request.url).pathname,
        error: error instanceof Error ? error.message : 'unknown error',
      }))
      return json({ error: 'Internal server error' }, 500)
    }
  },
} satisfies ExportedHandler<Env>
