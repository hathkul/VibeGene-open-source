export type NcbiBlastRequester = (body: URLSearchParams, signal?: AbortSignal) => Promise<string>

const unavailableRequester: NcbiBlastRequester = async () => {
  throw new Error('The NCBI BLAST transport has not been configured.')
}

let configuredRequester: NcbiBlastRequester = unavailableRequester

/** Install the concrete HTTP/desktop adapter at the application composition root. */
export function configureNcbiBlastRequester(requester: NcbiBlastRequester | null): void {
  configuredRequester = requester ?? unavailableRequester
}

export function abortableDelay(ms: number, signal?: AbortSignal, message = 'The request was cancelled.') {
  return new Promise<void>((resolve, reject) => {
    const timer = globalThis.setTimeout(resolve, ms)
    const abort = () => {
      globalThis.clearTimeout(timer)
      reject(new DOMException(message, 'AbortError'))
    }
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
  })
}

export async function ncbiBlastRequest(body: URLSearchParams, signal?: AbortSignal) {
  return configuredRequester(body, signal)
}

/** Submit a BLAST `Put` request; `params` must not include CMD, TOOL or EMAIL. */
export async function submitNcbiBlast(params: Record<string, string>, signal?: AbortSignal) {
  const response = await ncbiBlastRequest(new URLSearchParams({
    CMD: 'Put',
    ...params,
    TOOL: 'VibeGene',
    EMAIL: 'support@vibe-gene.com',
  }), signal)
  const rid = response.match(/\bRID\s*=\s*([^\s]+)/)?.[1]?.trim()
  if (!rid) throw new Error('NCBI did not return a BLAST request ID.')
  const rtoeSeconds = Math.max(10, Number(response.match(/\bRTOE\s*=\s*(\d+)/)?.[1] ?? 60))
  return { rid, rtoeSeconds }
}

/** NCBI's human-readable job state from the SearchInfo page, e.g. "Searching". */
function ncbiJobPhase(response: string) {
  return response.match(/<td>\s*Status\s*<\/td>\s*<td>\s*([A-Za-z][A-Za-z ]{0,30}?)\s*<\/td>/i)?.[1] ?? ''
}

/**
 * Resolves true when the search has hits, false when NCBI reports none.
 * While queued, emits `WAITING:<rtoeSeconds>:<nextCheckEpochMs>:<checksDone>:<ncbiPhase>`.
 */
export async function waitForNcbiBlast(
  rid: string,
  rtoeSeconds: number,
  onStatus?: (status: string) => void,
  signal?: AbortSignal,
  options: { maxWaitMs?: number; timeoutMessage?: string } = {},
) {
  // NCBI asks API clients not to poll an RID more often than once per minute.
  // Large genomic queues can legitimately take much longer than six minutes.
  const deadline = Date.now() + (options.maxWaitMs ?? Math.max(30 * 60_000, Math.min(6 * 60 * 60_000, rtoeSeconds * 2_000)))
  let checks = 0
  let phase = ''
  while (Date.now() < deadline) {
    const delayMs = Math.min(checks === 0 ? Math.max(10_000, Math.min(60_000, rtoeSeconds * 1_000)) : 60_000, Math.max(0, deadline - Date.now()))
    onStatus?.(`WAITING:${rtoeSeconds}:${Date.now() + delayMs}:${checks}:${phase}`)
    await abortableDelay(delayMs, signal, 'The NCBI BLAST search was cancelled.')
    checks += 1
    const response = await ncbiBlastRequest(new URLSearchParams({ CMD: 'Get', RID: rid, FORMAT_OBJECT: 'SearchInfo' }), signal)
    const parsedStatus = response.match(/Status=([^\s<]+)/i)?.[1]?.toUpperCase()
    if (!parsedStatus) throw new Error('NCBI returned an unrecognized BLAST status response. Please try again later.')
    const status = parsedStatus
    if (status === 'WAITING') {
      phase = ncbiJobPhase(response)
      continue
    }
    onStatus?.(status)
    if (status === 'READY') {
      if (/ThereAreHits=no/i.test(response)) return false
      return true
    }
    if (['FAILED', 'UNKNOWN'].includes(status)) throw new Error(`NCBI BLAST search ended with status ${status}.`)
  }
  throw new Error(options.timeoutMessage ?? 'The NCBI BLAST search did not finish within its estimated queue window. Please try again later.')
}

export function retrieveNcbiBlastXml2(rid: string, signal?: AbortSignal) {
  return ncbiBlastRequest(new URLSearchParams({ CMD: 'Get', RID: rid, FORMAT_TYPE: 'XML2_S' }), signal)
}

export function xmlDecode(value: string) {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}

export function xmlTag(block: string, name: string) {
  const match = block.match(new RegExp(`<(?:\\w+:)?${name}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${name}>`, 'i'))
  return match ? xmlDecode(match[1]!.trim()) : ''
}

export function numericTag(block: string, name: string) {
  const value = Number(xmlTag(block, name))
  return Number.isFinite(value) ? value : 0
}
