// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { cloneFixture } from '../domain/fixtures'
import { traceRecordFromSequence } from '../domain/sequenceTraceFactory'

const mocks = vi.hoisted(() => ({ full: vi.fn(), list: vi.fn() }))
vi.mock('../crossTab/openTabs', () => ({
  getCloningOpenTabSession: mocks.full,
  listOtherOpenTabs: mocks.list,
  pruneStaleOpenTabs: vi.fn(async () => {}),
}))
vi.mock('../crossTab/channel', () => ({ subscribeCrossTabMessages: () => () => {} }))
vi.mock('../storage/recentFiles', () => ({ RECENT_FILES_CHANGED_EVENT: 'recent', listRecentFiles: () => [] }))
vi.mock('../storage/sessionDraft', () => ({ listSessionDrafts: async () => [], getSessionDraft: vi.fn() }))

import { useConstructSources } from './useConstructSources'

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })

it('offers the complete other-window source and its trace to cloning', async () => {
  vi.useFakeTimers()
  const current = { ...cloneFixture(), id: 'current' }
  const parent = { ...cloneFixture(), id: 'parent' }
  const read = traceRecordFromSequence('ACGT', 'read.ab1')
  read.chromatogram.aTrace = [1, 4, 1]
  mocks.list.mockResolvedValue([{ tabId: 'other', recordId: 'parent' }])
  mocks.full.mockResolvedValue({ tabId: 'other', name: 'Parent', record: { ...parent, traceFiles: [read] } })
  let result: ReturnType<typeof useConstructSources> | undefined
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  function Harness() { result = useConstructSources({ currentRecord: current, currentTabId: 'here' }); return null }
  await act(async () => { root.render(<Harness />) })
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(result!.options.find(option => option.kind === 'open-tab')?.record.traceFiles?.[0]?.chromatogram.aTrace).toEqual([1, 4, 1])
  await act(async () => { root.unmount() })
  host.remove()
})
