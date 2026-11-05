// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cloneFixture } from '../../domain/fixtures'
import { useWorkspaceSearchController } from './useWorkspaceSearchController'

describe('useWorkspaceSearchController', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('reveals the first query hit only when search inputs change, not when callback identities refresh', async () => {
    const setSequenceRange = vi.fn()
    let rerender: () => void
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      const [version, setVersion] = useState(0)
      rerender = () => setVersion((current) => current + 1)
      useWorkspaceSearchController({
        record: { ...cloneFixture(), id: 'record', name: 'Record', sequence: 'ACGTA', features: [], primers: [] },
        activeTab: 'Sequence',
        searchQuery: 'CG',
        primers: [],
        enzymeRows: [],
        searchHitIndex: 0,
        setSearchHitIndex: vi.fn(),
        setPrimerTabAnchorId: vi.fn(),
        selectPrimerById: () => { void version },
        setSequenceRange,
        setSequenceScrollTarget: vi.fn(),
        actionProfileSync: (_name, _category, run) => run(),
      })
      return null
    }
    await act(async () => root.render(<Harness />))
    expect(setSequenceRange).toHaveBeenCalledOnce()
    setSequenceRange.mockClear()
    await act(async () => rerender!())
    expect(setSequenceRange).not.toHaveBeenCalled()
  })
})
