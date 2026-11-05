const MAX_HEARTBEAT_BYTES = 4 * 1024
const MAX_REPORT_BYTES = 220 * 1024
const MAX_BLAST_REQUEST_BYTES = 5 * 1024 * 1024
const MAX_BLAST_RESPONSE_BYTES = 25 * 1024 * 1024
const NCBI_BLAST_URL = 'https://blast.ncbi.nlm.nih.gov/Blast.cgi'

const ALLOWED_ORIGINS = new Set([
  'https://vibe-gene.com',
  'https://ru.vibe-gene.com',
  'https://vibegene.pages.dev',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
])

const TAURI_ORIGINS = new Set([
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
])

type WorkerEnv = Env & { TURNSTILE_SECRET: string }
type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function originFor(request: Request): string | null {
  const origin = request.headers.get('Origin')
  return origin && ALLOWED_ORIGINS.has(origin) ? origin : null
}

function withCors(request: Request, response: Response): Response {
  const origin = originFor(request)
  const headers = new Headers(response.headers)
  if (origin) headers.set('Access-Control-Allow-Origin', origin)
  headers.set('Vary', 'Origin')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('Cache-Control', 'no-store')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

function json(request: Request, body: unknown, status = 200): Response {
  return withCors(request, Response.json(body, { status }))
}

function errorResponse(request: Request, status: number, message: string): Response {
  return json(request, { error: message }, status)
}

async function readBoundedBytes(request: Request, maximumBytes: number): Promise<Uint8Array> {
  const length = Number(request.headers.get('Content-Length') ?? 0)
  if (Number.isFinite(length) && length > maximumBytes) throw new Error('payload_too_large')
  if (!request.body) return new Uint8Array()

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const part = await reader.read()
    if (part.done) break
    total += part.value.byteLength
    if (total > maximumBytes) {
      await reader.cancel('payload too large')
      throw new Error('payload_too_large')
    }
    chunks.push(part.value)
  }

  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

async function readJsonObject(request: Request, maximumBytes: number): Promise<JsonObject> {
  const bytes = await readBoundedBytes(request, maximumBytes)
  if (bytes.byteLength === 0) throw new Error('invalid_json')
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new Error('invalid_json')
  }
  if (!isObject(parsed)) throw new Error('invalid_json')
  return parsed
}

function cleanString(
  input: JsonObject,
  key: string,
  options: { minimum?: number; maximum: number; optional?: boolean },
): string | null {
  const value = input[key]
  if (value === undefined || value === null) {
    if (options.optional) return null
    throw new Error(`invalid_${key}`)
  }
  if (typeof value !== 'string') throw new Error(`invalid_${key}`)
  const cleaned = value.trim()
  if (options.optional && cleaned.length === 0) return null
  if (cleaned.length < (options.minimum ?? 0) || cleaned.length > options.maximum) {
    throw new Error(`invalid_${key}`)
  }
  return cleaned
}

function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown'
}

async function installKey(installId: string): Promise<string> {
  if (!/^[A-Za-z0-9:_-]{8,80}$/.test(installId)) throw new Error('invalid_installId')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`vibegene:${installId}`))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function handleHeartbeat(request: Request, env: WorkerEnv): Promise<Response> {
  let input: JsonObject
  try {
    input = await readJsonObject(request, MAX_HEARTBEAT_BYTES)
  } catch (error) {
    return errorResponse(request, error instanceof Error && error.message === 'payload_too_large' ? 413 : 400, 'Invalid heartbeat payload')
  }

  try {
    const rawInstallId = cleanString(input, 'installId', { minimum: 8, maximum: 80 })!
    const key = await installKey(rawInstallId)
    const appVersion = cleanString(input, 'appVersion', { maximum: 64, optional: true }) ?? 'unknown'
    const platform = cleanString(input, 'platform', { maximum: 64, optional: true }) ?? 'unknown'
    const timezone = cleanString(input, 'timezone', { maximum: 64, optional: true }) ?? ''
    const rate = await env.HEARTBEAT_RATE_LIMITER.limit({ key: `${clientIp(request)}:${key}` })
    if (!rate.success) return errorResponse(request, 429, 'Too many heartbeat requests')

    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO installs (
          install_key, first_seen, last_seen, app_version, platform, timezone, heartbeat_count
        ) VALUES (?, unixepoch(), unixepoch(), ?, ?, ?, 1)
        ON CONFLICT(install_key) DO UPDATE SET
          last_seen = unixepoch(),
          app_version = excluded.app_version,
          platform = excluded.platform,
          timezone = excluded.timezone,
          heartbeat_count = heartbeat_count + 1
      `).bind(key, appVersion, platform, timezone),
      env.DB.prepare(`
        INSERT INTO heartbeats (install_key, seen_at, app_version, platform, timezone)
        VALUES (?, unixepoch(), ?, ?, ?)
      `).bind(key, appVersion, platform, timezone),
    ])
    return json(request, { status: 'ok' })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) {
      return errorResponse(request, 400, 'Invalid heartbeat payload')
    }
    throw error
  }
}

type TurnstileResult = {
  success: boolean
  action?: string
  hostname?: string
}

function parseTurnstileResult(value: unknown): TurnstileResult | null {
  if (!isObject(value) || typeof value.success !== 'boolean') return null
  if (value.action !== undefined && typeof value.action !== 'string') return null
  if (value.hostname !== undefined && typeof value.hostname !== 'string') return null
  return { success: value.success, action: value.action, hostname: value.hostname }
}

async function verifyTurnstile(
  request: Request,
  env: WorkerEnv,
  token: string,
): Promise<boolean> {
  const expectedHostnames = new Set(
    env.TURNSTILE_HOSTNAMES.split(',').map((hostname) => hostname.trim()).filter(Boolean),
  )
  if (!token || token.length > 2048 || expectedHostnames.size === 0) return false

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET,
        response: token,
        remoteip: clientIp(request),
      }),
    })
    if (!response.ok) return false
    const result = parseTurnstileResult(await response.json())
    return Boolean(
      result?.success &&
      result.action === env.TURNSTILE_ACTION &&
      result.hostname &&
      expectedHostnames.has(result.hostname),
    )
  } catch {
    return false
  }
}

async function handleReport(request: Request, env: WorkerEnv): Promise<Response> {
  const origin = originFor(request)
  let input: JsonObject
  try {
    input = await readJsonObject(request, MAX_REPORT_BYTES)
  } catch (error) {
    return errorResponse(request, error instanceof Error && error.message === 'payload_too_large' ? 413 : 400, 'Invalid bug report payload')
  }

  try {
    const title = cleanString(input, 'title', { minimum: 3, maximum: 200 })!
    const description = cleanString(input, 'description', { minimum: 3, maximum: 8000 })!
    const email = cleanString(input, 'email', { maximum: 200, optional: true })
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('invalid_email')
    const appVersion = cleanString(input, 'appVersion', { maximum: 64, optional: true }) ?? 'unknown'
    const platform = cleanString(input, 'platform', { maximum: 64, optional: true }) ?? 'unknown'
    const suppliedUserAgent = cleanString(input, 'userAgent', { maximum: 400, optional: true })
    const userAgent = suppliedUserAgent ?? (request.headers.get('User-Agent') ?? '').slice(0, 400)
    const statusNote = cleanString(input, 'statusNote', { maximum: 1000, optional: true }) ?? ''
    const diagnostics = cleanString(input, 'diagnostics', { maximum: 200_000, optional: true }) ?? ''
    const rawInstallId = cleanString(input, 'installId', { minimum: 8, maximum: 80, optional: true })
    const key = rawInstallId ? await installKey(rawInstallId) : null
    const isDesktop = platform === 'tauri' && origin !== null && TAURI_ORIGINS.has(origin)

    const rate = await env.REPORT_RATE_LIMITER.limit({ key: clientIp(request) })
    if (!rate.success) return errorResponse(request, 429, 'Too many bug reports; please try again later')

    if (key) {
      const recent = await env.DB.prepare(`
        SELECT COUNT(*) AS count
        FROM reports
        WHERE install_key = ? AND created_at >= unixepoch() - 86400
      `).bind(key).first<{ count: number }>()
      const dailyLimit = isDesktop ? 5 : 20
      if ((recent?.count ?? 0) >= dailyLimit) {
        return errorResponse(request, 429, 'Daily bug report limit reached')
      }
    }

    if (!isDesktop) {
      const token = cleanString(input, 'turnstileToken', { maximum: 2048, optional: true }) ?? ''
      if (!(await verifyTurnstile(request, env, token))) {
        return errorResponse(request, 403, 'Human verification failed; please retry')
      }
    }

    const result = await env.DB.prepare(`
      INSERT INTO reports (
        created_at, title, description, email, app_version, platform,
        user_agent, status_note, diagnostics, install_key, resolved
      ) VALUES (unixepoch(), ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).bind(
      title,
      description,
      email,
      appVersion,
      platform,
      userAgent,
      statusNote,
      diagnostics,
      key,
    ).run()
    return json(request, { status: 'ok', id: result.meta.last_row_id })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) {
      return errorResponse(request, 400, 'Invalid bug report payload')
    }
    throw error
  }
}

async function handleNcbiBlast(request: Request, env: WorkerEnv): Promise<Response> {
  if (!request.headers.get('Content-Type')?.toLowerCase().includes('application/x-www-form-urlencoded')) {
    return errorResponse(request, 415, 'Expected a URL-encoded BLAST request')
  }
  const rate = await env.BLAST_RATE_LIMITER.limit({ key: clientIp(request) })
  if (!rate.success) return errorResponse(request, 429, 'Too many BLAST requests')

  let body: Uint8Array
  try {
    body = await readBoundedBytes(request, MAX_BLAST_REQUEST_BYTES)
  } catch {
    return errorResponse(request, 413, 'BLAST request is too large')
  }
  if (body.byteLength === 0) return errorResponse(request, 400, 'BLAST request is empty')

  const upstream = await fetch(NCBI_BLAST_URL, {
    method: 'POST',
    headers: {
      Accept: 'text/plain, application/xml',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'VibeGene/0.8.3 (support@vibe-gene.com)',
    },
    body,
  })
  const upstreamLength = Number(upstream.headers.get('Content-Length') ?? 0)
  if (Number.isFinite(upstreamLength) && upstreamLength > MAX_BLAST_RESPONSE_BYTES) {
    await upstream.body?.cancel('response too large')
    return errorResponse(request, 502, 'NCBI response was too large')
  }

  const headers = new Headers({
    'Content-Type': upstream.headers.get('Content-Type') ?? 'text/plain; charset=utf-8',
  })
  return withCors(request, new Response(upstream.body, { status: upstream.status, headers }))
}

async function handleFetch(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url)

  if (request.method === 'OPTIONS') {
    if (!originFor(request)) return errorResponse(request, 403, 'Origin not allowed')
    return withCors(request, new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    }))
  }

  if (request.method === 'GET' && url.pathname === '/api/v1/health') {
    return json(request, { status: 'ok', storage: 'cloudflare-d1' })
  }
  if (request.method === 'GET' && url.pathname === '/api/v1/config') {
    return json(request, {
      turnstileSitekey: env.TURNSTILE_SITEKEY,
    })
  }
  if (request.method === 'GET' && url.pathname === '/') {
    return json(request, { service: 'vibegene-telemetry-api', health: '/api/v1/health' })
  }

  if (request.method === 'POST' && !originFor(request)) {
    return errorResponse(request, 403, 'Origin not allowed')
  }
  if (request.method === 'POST' && url.pathname === '/api/v1/heartbeat') {
    return handleHeartbeat(request, env)
  }
  if (request.method === 'POST' && url.pathname === '/api/v1/reports') {
    return handleReport(request, env)
  }
  if (request.method === 'POST' && url.pathname === '/api/v1/ncbi/blast') {
    return handleNcbiBlast(request, env)
  }
  return errorResponse(request, 404, 'Not found')
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      return await handleFetch(request, env)
    } catch (error) {
      console.error(JSON.stringify({
        message: 'request failed',
        path: new URL(request.url).pathname,
        error: error instanceof Error ? error.message : 'unknown error',
      }))
      return errorResponse(request, 500, 'Internal server error')
    }
  },

  async scheduled(_controller, env): Promise<void> {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM heartbeats WHERE seen_at < unixepoch() - 90 * 86400'),
      env.DB.prepare('DELETE FROM reports WHERE resolved = 1 AND created_at < unixepoch() - 180 * 86400'),
      env.DB.prepare('DELETE FROM installs WHERE last_seen < unixepoch() - 365 * 86400'),
    ])
  },
} satisfies ExportedHandler<WorkerEnv>
