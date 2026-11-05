import { describe, expect, it, vi } from 'vitest'
import {
  openLocalDocument,
  type LocalDocumentFile,
  type LocalDocumentOpenPorts,
} from './openLocalDocument'

function sequenceFile(path: string | null = '/maps/demo.dna'): LocalDocumentFile {
  return { bytes: Uint8Array.from([1, 2, 3]), fileName: 'demo.dna', path }
}

function traceFile(path: string | null = '/traces/read.ab1'): LocalDocumentFile {
  return { bytes: Uint8Array.from([0x41, 0x42, 0x49, 0x46]), fileName: 'read.ab1', path }
}

function ports(overrides: Partial<LocalDocumentOpenPorts<string, string>> = {}) {
  return {
    takeHandoff: vi.fn(async () => null),
    readPath: vi.fn(async () => null),
    openSequence: vi.fn(async () => 'opened-sequence'),
    openTrace: vi.fn(async () => 'opened-trace'),
    reportHandoffError: vi.fn(),
    ...overrides,
  }
}

describe('local document opening workflow', () => {
  it('does nothing when the launch has no handoff or direct path', async () => {
    const io = ports()
    await expect(openLocalDocument({ handoffKey: null, directPath: null }, io)).resolves.toBeNull()
    expect(io.takeHandoff).not.toHaveBeenCalled()
    expect(io.readPath).not.toHaveBeenCalled()
  })

  it('prefers handoff bytes and preserves their path', async () => {
    const file = sequenceFile('/handoff/demo.dna')
    const io = ports({ takeHandoff: vi.fn(async () => file) })

    await expect(openLocalDocument({ handoffKey: 'handoff-1', directPath: '/fallback/demo.dna' }, io))
      .resolves.toEqual({ kind: 'sequence', opened: 'opened-sequence' })
    expect(io.openSequence).toHaveBeenCalledWith(file)
    expect(io.readPath).not.toHaveBeenCalled()
  })

  it('uses the direct path when a handoff is missing', async () => {
    const file = sequenceFile('/fallback/demo.dna')
    const io = ports({ readPath: vi.fn(async () => file) })

    await expect(openLocalDocument({ handoffKey: 'missing', directPath: file.path }, io))
      .resolves.toEqual({ kind: 'sequence', opened: 'opened-sequence' })
    expect(io.readPath).toHaveBeenCalledWith('/fallback/demo.dna')
  })

  it('reports a handoff failure and still falls back to the direct path', async () => {
    const failure = new Error('IndexedDB unavailable')
    const file = sequenceFile()
    const io = ports({
      takeHandoff: vi.fn(async () => { throw failure }),
      readPath: vi.fn(async () => file),
    })

    await expect(openLocalDocument({ handoffKey: 'broken', directPath: file.path }, io))
      .resolves.toEqual({ kind: 'sequence', opened: 'opened-sequence' })
    expect(io.reportHandoffError).toHaveBeenCalledWith(failure)
  })

  it('uses the direct path as metadata when a handoff has no path', async () => {
    const handoff = sequenceFile(null)
    const io = ports({ takeHandoff: vi.fn(async () => handoff) })

    await openLocalDocument({ handoffKey: 'handoff-1', directPath: '/fallback/demo.dna' }, io)
    expect(io.openSequence).toHaveBeenCalledWith({ ...handoff, path: '/fallback/demo.dna' })
  })

  it('routes AB1 bytes through the trace parser', async () => {
    const file = traceFile()
    const io = ports({ takeHandoff: vi.fn(async () => file) })

    await expect(openLocalDocument({ handoffKey: 'trace', directPath: null }, io))
      .resolves.toEqual({ kind: 'trace', opened: 'opened-trace' })
    expect(io.openTrace).toHaveBeenCalledWith(file)
    expect(io.openSequence).not.toHaveBeenCalled()
  })

  it('routes an AB1 file name through the trace parser even without readable magic bytes', async () => {
    const file = { ...sequenceFile(), fileName: 'damaged.AB1' }
    const io = ports({ readPath: vi.fn(async () => file) })

    await expect(openLocalDocument({ handoffKey: null, directPath: file.path }, io))
      .resolves.toEqual({ kind: 'trace', opened: 'opened-trace' })
  })

  it('returns null when neither source produces bytes', async () => {
    const io = ports()
    await expect(openLocalDocument({ handoffKey: 'missing', directPath: '/missing.dna' }, io)).resolves.toBeNull()
    expect(io.openSequence).not.toHaveBeenCalled()
    expect(io.openTrace).not.toHaveBeenCalled()
  })
})
