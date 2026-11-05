import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadRemoteSequenceFile } from './remoteSequenceDownload'

afterEach(() => vi.unstubAllGlobals())

describe('remote sequence download adapter', () => {
  it('downloads bytes and honors the server-provided file name in the web build', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(Uint8Array.from([1, 2, 3]), {
      headers: { 'content-disposition': 'attachment; filename="shared-map.dna"' },
    })))

    await expect(downloadRemoteSequenceFile('https://example.org/download')).resolves.toEqual({
      bytes: Uint8Array.from([1, 2, 3]),
      fileName: 'shared-map.dna',
      sourceUrl: 'https://example.org/download',
    })
  })
})
