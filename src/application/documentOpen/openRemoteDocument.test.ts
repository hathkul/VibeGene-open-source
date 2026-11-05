import { describe, expect, it, vi } from 'vitest'
import { openDesktopSequenceBytes } from '../../domain/openDesktopSequenceFile'
import {
  downloadRemoteDocument,
  openRemoteDocument,
  type RemoteDocumentOpenPorts,
} from './openRemoteDocument'

const opened = {
  record: { id: 'sequence-1' } as never,
  traces: [],
  fileName: 'remote.dna',
  path: null,
}

describe('remote document opening workflow', () => {
  it('normalizes the URL before downloading and parses the downloaded document', async () => {
    const download = vi.fn(async (sourceUrl: string) => ({
      bytes: Uint8Array.from([1, 2, 3]),
      fileName: 'shared-map.dna',
      sourceUrl,
    }))
    const parse = vi.fn(async () => opened)

    await expect(openRemoteDocument('  HTTPS://example.org/download  ', { download, parse })).resolves.toEqual({
      ...opened,
      sourceUrl: 'https://example.org/download',
    })
    expect(download).toHaveBeenCalledWith('https://example.org/download')
    expect(parse).toHaveBeenCalledWith(Uint8Array.from([1, 2, 3]), 'shared-map.dna')
  })

  it('rejects an invalid URL without touching the I/O port', async () => {
    const download = vi.fn()

    await expect(downloadRemoteDocument('file:///tmp/construct.dna', download)).rejects.toThrow(/http/)
    expect(download).not.toHaveBeenCalled()
  })

  it('rejects an empty payload before parsing', async () => {
    const parse = vi.fn()
    const download = vi.fn(async () => ({ bytes: new Uint8Array(), fileName: 'empty.dna', sourceUrl: 'https://example.org/empty.dna' }))

    await expect(downloadRemoteDocument('https://example.org/empty.dna', download)).rejects.toThrow(/empty/)
    expect(parse).not.toHaveBeenCalled()
  })

  it('propagates unsupported-content errors from the domain parser', async () => {
    const ports: RemoteDocumentOpenPorts = {
      download: async (sourceUrl) => ({
        bytes: Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0]),
        fileName: 'document.dna',
        sourceUrl,
      }),
      parse: (bytes, fileName) => openDesktopSequenceBytes(bytes, fileName),
    }

    await expect(openRemoteDocument('https://example.org/document.dna', ports)).rejects.toThrow(/Office document/)
  })

  it('propagates downloader cancellation and timeout errors unchanged', async () => {
    const timeout = new Error('The remote sequence file did not respond within 30 seconds.')
    const cancelled = new DOMException('The operation was aborted.', 'AbortError')
    const parse = vi.fn()

    await expect(openRemoteDocument('https://example.org/timeout.dna', {
      download: async () => { throw timeout },
      parse,
    })).rejects.toBe(timeout)
    await expect(openRemoteDocument('https://example.org/cancelled.dna', {
      download: async () => { throw cancelled },
      parse,
    })).rejects.toBe(cancelled)
    expect(parse).not.toHaveBeenCalled()
  })

  it('propagates parser errors without replacing the current document', async () => {
    const parseError = new Error('Invalid sequence document')
    const ports: RemoteDocumentOpenPorts = {
      download: async (sourceUrl) => ({ bytes: Uint8Array.from([1]), fileName: 'bad.dna', sourceUrl }),
      parse: async () => { throw parseError },
    }

    await expect(openRemoteDocument('https://example.org/bad.dna', ports)).rejects.toBe(parseError)
  })
})
