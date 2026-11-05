// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cloneFixture } from '../src/domain/fixtures'
import type { CrossTabMessage } from '../src/crossTab/types'
import { traceRecordFromSequence } from '../src/domain/sequenceTraceFactory'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), subscribe: vi.fn() }))
vi.mock('../src/storage/projects', () => ({ db: { openTabs: { get: mocks.get } } }))
vi.mock('../src/crossTab/channel', () => ({ postCrossTabMessage: mocks.post, subscribeCrossTabMessages: mocks.subscribe }))

import { getCloningOpenTabSession } from '../src/crossTab/openTabs'

describe('full cloning source transfer', () => {
  afterEach(() => { vi.useRealTimers(); vi.resetAllMocks() })

  it('receives the requested live source with its trace signal and visibility', async () => {
    const source = cloneFixture()
    const read = traceRecordFromSequence('ACGT', 'parent.ab1')
    read.enabled = false
    read.chromatogram.aTrace = [1, 4, 1]
    mocks.get.mockResolvedValue({ tabId: 'parent', recordId: source.id, name: source.name, updatedAt: '', record: source })
    let listener: (message: CrossTabMessage) => void = () => {}
    mocks.subscribe.mockImplementation((callback) => { listener = callback; return vi.fn() })
    mocks.post.mockImplementation((message: CrossTabMessage) => {
      if (message.type === 'cloning-source-request') {
        listener({ type: 'cloning-source-response', targetTabId: 'parent', requestId: message.requestId, record: { ...source, traceFiles: [read] } })
      }
    })
    const session = await getCloningOpenTabSession('parent')
    expect(session?.record.traceFiles?.[0]).toMatchObject({ fileName: 'parent.ab1', enabled: false, chromatogram: { aTrace: [1, 4, 1] } })
  })

  it('does not use a lightweight snapshot when the source window fails to respond', async () => {
    vi.useFakeTimers()
    const source = cloneFixture()
    mocks.get.mockResolvedValue({ tabId: 'parent', recordId: source.id, name: source.name, updatedAt: '', record: source })
    mocks.subscribe.mockReturnValue(vi.fn())
    const pending = getCloningOpenTabSession('parent')
    await vi.advanceTimersByTimeAsync(2100)
    expect(await pending).toBeNull()
  })
})
