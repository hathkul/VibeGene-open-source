import { describe, expect, it, vi } from 'vitest'
import type { SequenceRecord } from '../../domain/types'
import { createSyncDocumentBootSnapshot } from './documentBootSnapshot'
import { parseDocumentBootQuery } from './documentBootQuery'
import { runDocumentBootstrapAsync } from './runDocumentBootstrap'

const record = (overrides: Partial<SequenceRecord> = {}): SequenceRecord =>
  ({
    id: 'record-1',
    name: 'Demo',
    molecule: 'dna',
    topology: 'linear',
    sequence: 'ACGT',
    features: [],
    primers: [],
    ...overrides,
  }) as SequenceRecord

function demoSnapshot(overrides: Partial<ReturnType<typeof createSyncDocumentBootSnapshot>> = {}) {
  const query = parseDocumentBootQuery('?history=hist-1&fileHandoff=file-1&openPath=%2Ftmp%2Fa.dna')
  return {
    ...createSyncDocumentBootSnapshot({
      query,
      compactHandoffRecord: null,
      demoRecord: record(),
      libraryFolderId: undefined,
      workspaceDiskPath: null,
    }),
    ...overrides,
  }
}

function asyncPorts(
  overrides: Partial<Parameters<typeof runDocumentBootstrapAsync>[3]> = {},
) {
  return {
    openLocalDocument: vi.fn(async () => null),
    openRemoteDocument: vi.fn(async () => ({ sourceUrl: 'https://example.org/a.dna' })),
    waitForHandoffRecord: vi.fn(async () => null),
    resolveDiskPathForHandoffKey: vi.fn(() => null),
    openPathFromQuery: null,
    applySequenceBoot: vi.fn(),
    applyTraceBoot: vi.fn(),
    applyRemoteSequenceBoot: vi.fn(),
    applyIndexedDbHandoffBoot: vi.fn(),
    acknowledgeWindowHandoff: vi.fn(),
    clearFileBootQueryParams: vi.fn(),
    teardownWindowHandoffListener: vi.fn(),
    ...overrides,
  }
}

describe('runDocumentBootstrapAsync', () => {
  it('prefers local disk/trace handoff before remote and IndexedDB sources', async () => {
    const snapshot = demoSnapshot()
    const ports = asyncPorts({
      openLocalDocument: vi.fn(async () => ({ kind: 'trace' as const, opened: { fileName: 't.ab1' } })),
    })
    await runDocumentBootstrapAsync(snapshot, snapshot.query, '?url=https%3A%2F%2Fexample.org%2Fa.dna', ports)
    expect(ports.applyTraceBoot).toHaveBeenCalled()
    expect(ports.openRemoteDocument).not.toHaveBeenCalled()
    expect(ports.waitForHandoffRecord).not.toHaveBeenCalled()
  })

  it('falls back to remote open when disk handoff is missing', async () => {
    const snapshot = demoSnapshot()
    const ports = asyncPorts()
    await runDocumentBootstrapAsync(snapshot, snapshot.query, '?url=https%3A%2F%2Fexample.org%2Fa.dna', ports)
    expect(ports.applyRemoteSequenceBoot).toHaveBeenCalled()
    expect(ports.waitForHandoffRecord).not.toHaveBeenCalled()
  })

  it('falls back to IndexedDB/window handoff when disk and remote are unavailable', async () => {
    const snapshot = demoSnapshot()
    const handoff = { record: record({ name: 'From IDB' }), sourceHydrationPending: true }
    const ports = asyncPorts({
      waitForHandoffRecord: vi.fn(async () => handoff),
      resolveDiskPathForHandoffKey: vi.fn(() => '/tmp/from-idb.dna'),
    })
    await runDocumentBootstrapAsync(snapshot, snapshot.query, '', ports)
    expect(ports.applyIndexedDbHandoffBoot).toHaveBeenCalledWith(handoff, '/tmp/from-idb.dna')
    expect(ports.acknowledgeWindowHandoff).toHaveBeenCalledWith('hist-1')
    expect(ports.clearFileBootQueryParams).toHaveBeenCalled()
  })

  it('records bootstrap errors instead of throwing', async () => {
    const snapshot = demoSnapshot({ pendingIdbHandoffKey: null })
    const query = parseDocumentBootQuery('')
    snapshot.query = query
    const ports = asyncPorts({
      openLocalDocument: vi.fn(async () => {
        throw new Error('disk failed')
      }),
    })
    await runDocumentBootstrapAsync(snapshot, query, '', ports)
    expect(snapshot.openError).toBe('disk failed')
    expect(ports.teardownWindowHandoffListener).toHaveBeenCalled()
  })

  it('clears file boot query params when sync handoff already resolved a disk path', async () => {
    const query = parseDocumentBootQuery('?history=hist-2')
    const snapshot = createSyncDocumentBootSnapshot({
      query,
      compactHandoffRecord: record(),
      demoRecord: record(),
      libraryFolderId: 'folder-1',
      workspaceDiskPath: '/tmp/compact.dna',
    })
    const ports = asyncPorts()
    await runDocumentBootstrapAsync(snapshot, query, '', ports)
    expect(ports.clearFileBootQueryParams).toHaveBeenCalled()
    expect(ports.openLocalDocument).not.toHaveBeenCalled()
  })

  it('retains a database origin supplied by a compact handoff', () => {
    const query = parseDocumentBootQuery('?history=hist-database')
    const snapshot = createSyncDocumentBootSnapshot({
      query,
      compactHandoffRecord: record({ id: 'editable-record' }),
      demoRecord: record(),
      libraryFolderId: null,
      workspaceDiskPath: null,
      documentOrigin: { kind: 'database', projectId: 'stored-project', folderId: null },
    })
    expect(snapshot.documentOrigin).toEqual({ kind: 'database', projectId: 'stored-project', folderId: null })
  })
})
