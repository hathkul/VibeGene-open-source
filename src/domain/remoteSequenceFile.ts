export const REMOTE_SEQUENCE_QUERY_PARAM = 'url'
export const MAX_REMOTE_SEQUENCE_BYTES = 100 * 1024 * 1024

export type RemoteSequenceFile = {
  bytes: Uint8Array
  fileName: string
  sourceUrl: string
}

/** Validate and normalize a user-supplied remote sequence URL. */
export function normalizeRemoteSequenceUrl(rawValue: string): string {
  const raw = rawValue.trim()
  if (!raw) throw new Error('Enter a link to a sequence file.')
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('The url launch argument is not a valid URL.')
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('The url launch argument must use http:// or https://.')
  }
  if (parsed.username || parsed.password) {
    throw new Error('The url launch argument must not contain embedded credentials.')
  }
  return parsed.href
}

/** Read and validate the optional remote-document launch argument. */
export function remoteSequenceUrlFromSearch(search: string): string | null {
  const raw = new URLSearchParams(search).get(REMOTE_SEQUENCE_QUERY_PARAM)
  return raw == null || !raw.trim() ? null : normalizeRemoteSequenceUrl(raw)
}

/** Build a link on the current VibeGene deployment that opens a remote sequence document. */
export function remoteSequenceShareUrl(sourceUrl: string, appUrl: string): string {
  const link = new URL(appUrl)
  link.hash = ''
  link.search = ''
  link.searchParams.set(REMOTE_SEQUENCE_QUERY_PARAM, normalizeRemoteSequenceUrl(sourceUrl))
  return link.href
}

function cleanFileName(value: string): string | null {
  const decoded = (() => {
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  })()
  const cleaned = decoded.replace(new RegExp(String.raw`[\\/\x00-\x1f\x7f]`, 'g'), '').trim()
  return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned.slice(0, 240) : null
}

/** Prefer the server's download name, then the URL path, with a useful SnapGene fallback. */
export function remoteSequenceFileName(sourceUrl: string, contentDisposition?: string | null): string {
  if (contentDisposition) {
    const encoded = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1]
    const plain = contentDisposition.match(/filename\s*=\s*(?:"([^"]+)"|([^;]+))/i)
    const fromHeader = cleanFileName(encoded ?? plain?.[1] ?? plain?.[2] ?? '')
    if (fromHeader) return fromHeader
  }
  try {
    const segment = new URL(sourceUrl).pathname.split('/').filter(Boolean).at(-1) ?? ''
    return cleanFileName(segment) ?? 'remote.dna'
  } catch {
    return 'remote.dna'
  }
}
