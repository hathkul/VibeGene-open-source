import { isTauriRuntime } from './desktop/tauriRuntime'
import { fetchSequenceResource } from './domain/externalSequences/http'
import { telemetryApiBase } from './domain/telemetry'
import type { NcbiBlastRequester } from './domain/ncbiBlast'

// NCBI's legacy BLAST endpoint has no browser CORS support. In development Vite
// proxies this route directly; production and desktop builds use VibeGene's API.
function ncbiBlastUrl(): string {
  return `${telemetryApiBase()}/api/v1/ncbi/blast`
}

export const ncbiBlastTransport: NcbiBlastRequester = async (body, signal) => {
  if (isTauriRuntime()) {
    if (signal?.aborted) throw new DOMException('The request was cancelled.', 'AbortError')
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke<string>('ncbi_blast_request', { formBody: body.toString() })
  }
  const response = await fetchSequenceResource(ncbiBlastUrl(), {
    method: 'POST',
    headers: { Accept: 'text/plain, application/xml', 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal,
  }, { attempts: 1, timeoutMs: 45_000 })
  return response.text()
}
