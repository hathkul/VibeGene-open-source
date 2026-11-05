import { coerceBytes } from './desktop/fileIo'
import { isTauriRuntime } from './desktop/tauriRuntime'
import {
  MAX_REMOTE_SEQUENCE_BYTES,
  remoteSequenceFileName,
  type RemoteSequenceFile,
} from './domain/remoteSequenceFile'

const REMOTE_SEQUENCE_TIMEOUT_MS = 30_000

async function downloadInBrowser(sourceUrl: string): Promise<RemoteSequenceFile> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), REMOTE_SEQUENCE_TIMEOUT_MS)
  try {
    const response = await fetch(sourceUrl, {
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`The remote file server returned HTTP ${response.status}.`)
    const announcedSize = Number(response.headers.get('content-length') ?? 0)
    if (Number.isFinite(announcedSize) && announcedSize > MAX_REMOTE_SEQUENCE_BYTES) {
      throw new Error('The remote sequence file exceeds the 100 MB limit.')
    }
    const chunks: Uint8Array[] = []
    let receivedBytes = 0
    if (response.body) {
      const reader = response.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        receivedBytes += value.byteLength
        if (receivedBytes > MAX_REMOTE_SEQUENCE_BYTES) {
          await reader.cancel()
          throw new Error('The remote sequence file exceeds the 100 MB limit.')
        }
        chunks.push(value)
      }
    } else {
      const fallback = new Uint8Array(await response.arrayBuffer())
      receivedBytes = fallback.byteLength
      chunks.push(fallback)
    }
    const bytes = new Uint8Array(receivedBytes)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    if (!bytes.byteLength) throw new Error('The remote sequence file is empty.')
    if (bytes.byteLength > MAX_REMOTE_SEQUENCE_BYTES) {
      throw new Error('The remote sequence file exceeds the 100 MB limit.')
    }
    return {
      bytes,
      fileName: remoteSequenceFileName(sourceUrl, response.headers.get('content-disposition')),
      sourceUrl,
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('The remote sequence file did not respond within 30 seconds.', { cause: error })
    }
    if (error instanceof TypeError) {
      throw new Error('The remote sequence file could not be downloaded. Check the URL and that its server allows cross-origin (CORS) downloads.', { cause: error })
    }
    throw error
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

/** Download a launch URL without persisting it; parsing remains in the normal import pipeline. */
export async function downloadRemoteSequenceFile(sourceUrl: string): Promise<RemoteSequenceFile> {
  if (!isTauriRuntime()) return downloadInBrowser(sourceUrl)
  const { invoke } = await import('@tauri-apps/api/core')
  const raw = await invoke<unknown>('download_remote_file', { url: sourceUrl })
  const bytes = coerceBytes(raw)
  if (!bytes.byteLength) throw new Error('The remote sequence file is empty.')
  return { bytes, fileName: remoteSequenceFileName(sourceUrl), sourceUrl }
}
