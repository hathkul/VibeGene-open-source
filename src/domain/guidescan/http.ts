import { GuideScanError } from './types'

const DEFAULT_TIMEOUT_MS = 30_000

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    let settled = false
    const finish = (error?: GuideScanError) => {
      if (settled) return
      settled = true
      globalThis.clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      if (error) reject(error)
      else resolve()
    }
    const onAbort = () => {
      finish(new GuideScanError('cancelled', 'The GuideScan request was cancelled.'))
    }
    const timer = globalThis.setTimeout(() => finish(), ms)
    if (signal?.aborted) {
      onAbort()
      return
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function toGuideScanError(error: unknown): GuideScanError {
  if (error instanceof GuideScanError) return error
  if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return new GuideScanError(
      error.name === 'TimeoutError' ? 'timeout' : 'cancelled',
      error.name === 'TimeoutError'
        ? 'The GuideScan request timed out.'
        : 'The GuideScan request was cancelled.',
    )
  }
  if (error instanceof TypeError && /fetch|network|failed/i.test(error.message)) {
    return new GuideScanError('network', 'Could not reach GuideScan2. Check your connection or API proxy.')
  }
  if (error instanceof Error) return new GuideScanError('network', error.message)
  return new GuideScanError('network', String(error))
}

export async function guidescanFetch(
  url: string,
  init: RequestInit = {},
  options?: { timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const timeoutSeconds = Math.round(timeoutMs / 1000)
  const fetchImpl = options?.fetchImpl ?? fetch
  const timeoutController = new AbortController()
  let timedOut = false
  const timeout = globalThis.setTimeout(() => {
    timedOut = true
    timeoutController.abort(new DOMException('The GuideScan request timed out.', 'TimeoutError'))
  }, timeoutMs)
  const onAbort = () => timeoutController.abort(init.signal?.reason)
  init.signal?.addEventListener('abort', onAbort, { once: true })
  try {
    if (init.signal?.aborted) {
      throw new GuideScanError('cancelled', 'The GuideScan request was cancelled.')
    }
    const response = await fetchImpl(url, { ...init, signal: timeoutController.signal })
    return response
  } catch (error) {
    if (init.signal?.aborted) {
      throw new GuideScanError('cancelled', 'The GuideScan request was cancelled.')
    }
    if (timedOut) {
      throw new GuideScanError('timeout', `GuideScan2 did not respond within ${timeoutSeconds} s.`)
    }
    throw toGuideScanError(error)
  } finally {
    globalThis.clearTimeout(timeout)
    init.signal?.removeEventListener('abort', onAbort)
  }
}

export async function guidescanFetchJson<T>(
  url: string,
  init: RequestInit = {},
  options?: { timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<T> {
  const response = await guidescanFetch(url, {
    ...init,
    headers: { Accept: 'application/json', ...init.headers },
  }, options)
  if (!response.ok) {
    const message = (await response.text()).slice(0, 400).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    throw new GuideScanError(
      response.status === 404 ? 'not_found' : 'http',
      message || `GuideScan returned HTTP ${response.status}.`,
      response.status,
    )
  }
  try {
    return await response.json() as T
  } catch {
    throw new GuideScanError('parse', 'GuideScan returned a non-JSON response.')
  }
}

export async function sleep(ms: number, signal?: AbortSignal) {
  await delay(ms, signal)
}
