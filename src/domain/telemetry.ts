/** Anonymous opt-in usage and user-submitted bug reports stored on Cloudflare. */

const INSTALL_ID_KEY = 'vibegene:installId'
const LAST_HEARTBEAT_KEY = 'vibegene:lastHeartbeatAt'
const HEARTBEAT_INTERVAL_MS = 20 * 60 * 60 * 1000 // ~daily, with slack for reopen

const PRODUCTION_API_ORIGIN = 'https://api.vibe-gene.com'

function platformLabel(): string {
  const ua = navigator.userAgent || ''
  if (/Tauri/i.test(ua) || '__TAURI_INTERNALS__' in window) return 'tauri'
  if (/Macintosh|Mac OS X/i.test(ua)) return 'mac-web'
  if (/Windows/i.test(ua)) return 'windows-web'
  if (/Linux/i.test(ua)) return 'linux-web'
  return 'web'
}

/** Local proxy in development; Cloudflare Worker in web and desktop releases. */
export function telemetryApiBase(): string {
  const fromEnv = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_VIBEGENE_API_BASE
  if (typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.replace(/\/$/, '')
  if (import.meta.env.DEV) return ''
  return PRODUCTION_API_ORIGIN
}

function timezoneLabel(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {
    return ''
  }
}

export function getOrCreateInstallId(): string {
  try {
    const existing = window.localStorage.getItem(INSTALL_ID_KEY)
    if (existing && existing.length >= 8) return existing
  } catch {
    // ignore
  }
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `vg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  try {
    window.localStorage.setItem(INSTALL_ID_KEY, id)
  } catch {
    // ignore
  }
  return id
}

export async function sendHeartbeat(appVersion: string): Promise<boolean> {
  try {
    // Do not write development activity to production unless a base URL is explicit.
    if (import.meta.env.DEV && !telemetryApiBase()) return false

    const lastRaw = window.localStorage.getItem(LAST_HEARTBEAT_KEY)
    const last = lastRaw ? Number(lastRaw) : 0
    if (Number.isFinite(last) && Date.now() - last < HEARTBEAT_INTERVAL_MS) return false

    const res = await fetch(`${telemetryApiBase()}/api/v1/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        installId: getOrCreateInstallId(),
        appVersion,
        platform: platformLabel(),
        timezone: timezoneLabel(),
      }),
      keepalive: true,
    })
    if (!res.ok) return false
    window.localStorage.setItem(LAST_HEARTBEAT_KEY, String(Date.now()))
    return true
  } catch {
    return false
  }
}

export type BugReportPayload = {
  title: string
  description: string
  email?: string
  statusNote?: string
  diagnostics?: string
  appVersion: string
  turnstileToken?: string
}

export async function sendBugReport(payload: BugReportPayload): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${telemetryApiBase()}/api/v1/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: payload.title,
        description: payload.description,
        email: payload.email || undefined,
        statusNote: payload.statusNote || undefined,
        diagnostics: payload.diagnostics || undefined,
        appVersion: payload.appVersion,
        platform: platformLabel(),
        userAgent: navigator.userAgent || '',
        installId: getOrCreateInstallId(),
        turnstileToken: payload.turnstileToken || undefined,
      }),
    })
    if (!res.ok) {
      const errorPayload = await res.json().catch(() => null) as { error?: unknown } | null
      const message = typeof errorPayload?.error === 'string' ? errorPayload.error : `HTTP ${res.status}`
      return { ok: false, error: message }
    }
    const data = (await res.json()) as { id?: number }
    return { ok: true, id: Number(data.id) || 0 }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
