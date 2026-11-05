const DEFAULT_TIMEOUT_MS = 25_000
const MAX_RESPONSE_BYTES = 25 * 1024 * 1024

function hostFromUrl(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** HTML error pages are not user-readable; only JSON `error`/`message` fields or short plain text are kept. */
function serverErrorDetail(body: string, contentType: string | null): string {
  const text = body.trim()
  if (!text || /html/i.test(contentType ?? '') || text.startsWith('<')) return ''
  try {
    const parsed = JSON.parse(text) as { error?: unknown; message?: unknown }
    const field = typeof parsed.error === 'string' ? parsed.error : parsed.message
    return typeof field === 'string' ? field.trim().slice(0, 200) : ''
  } catch {
    return text.replace(/\s+/g, ' ').slice(0, 200)
  }
}

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = globalThis.setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      globalThis.clearTimeout(timer)
      reject(new DOMException('The request was cancelled.', 'AbortError'))
    }, { once: true })
  })
}

export async function fetchSequenceResource(
  url: string,
  init: RequestInit = {},
  options?: { timeoutMs?: number; attempts?: number },
): Promise<Response> {
  const attempts = Math.max(1, options?.attempts ?? 3)
  let lastError: unknown

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const host = hostFromUrl(url)
  const timeoutSeconds = Math.round(timeoutMs / 1000)

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const timeoutController = new AbortController()
    let timedOut = false
    const timeout = globalThis.setTimeout(() => {
      timedOut = true
      timeoutController.abort(new DOMException('The database request timed out.', 'TimeoutError'))
    }, timeoutMs)
    const onAbort = () => timeoutController.abort(init.signal?.reason)
    init.signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const response = await fetch(url, { ...init, signal: timeoutController.signal })
      const length = Number(response.headers.get('content-length') ?? 0)
      if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) {
        throw new Error('The selected database record is too large to import (25 MB limit).')
      }
      if (response.ok) return response
      const detail = serverErrorDetail(await response.text(), response.headers.get('content-type'))
      if ((response.status === 429 || response.status >= 500) && attempt + 1 < attempts) {
        const retryAfter = Number(response.headers.get('retry-after'))
        await delay(Number.isFinite(retryAfter) ? retryAfter * 1000 : 500 * 2 ** attempt, init.signal ?? undefined)
        continue
      }
      throw new Error(`${host} returned HTTP ${response.status}${detail ? `: ${detail}` : '.'}`)
    } catch (error) {
      lastError = error
      if (init.signal?.aborted) throw new DOMException('The request was cancelled.', 'AbortError')
      if (timedOut) {
        throw new DOMException(`${host} did not respond within ${timeoutSeconds} s.`, 'TimeoutError')
      }
      if (attempt + 1 >= attempts || (error instanceof DOMException && error.name === 'AbortError')) throw error
      await delay(500 * 2 ** attempt, init.signal ?? undefined)
    } finally {
      globalThis.clearTimeout(timeout)
      init.signal?.removeEventListener('abort', onAbort)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('The database request failed.')
}

export type FetchSequenceResourceOptions = { timeoutMs?: number; attempts?: number }

export async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  options?: FetchSequenceResourceOptions,
): Promise<T> {
  const response = await fetchSequenceResource(url, {
    ...init,
    headers: { Accept: 'application/json', ...init.headers },
  }, options)
  return response.json() as Promise<T>
}

export async function fetchText(
  url: string,
  init: RequestInit = {},
  options?: FetchSequenceResourceOptions,
): Promise<string> {
  const response = await fetchSequenceResource(url, init, options)
  return response.text()
}

export function databaseImportError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'A network request was interrupted before it finished.'
  }
  if (error instanceof DOMException && error.name === 'TimeoutError') return error.message
  if (error instanceof TypeError && /fetch|load failed|network/i.test(error.message)) {
    return 'Could not reach the server (network error). Check your connection, VPN or proxy.'
  }
  if (error instanceof Error) {
    return error.message.trim() || `${error.name || 'Error'} (no details)`
  }
  return String(error) || 'Unknown error'
}
