// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cloneFixture } from '../../domain/fixtures'
import { useSharedTabController } from './useSharedTabController'

describe('useSharedTabController', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('reports the count returned by manual shared-tab cleanup when no stale rows are listed', async () => {
    const setStatus = vi.fn()
    const clearOtherOpenTabs = vi.fn().mockResolvedValue(2)
    let controller: ReturnType<typeof useSharedTabController>
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      controller = useSharedTabController({
        tabId: 'current', record: cloneFixture(), selectedRange: null, cutStrandSelection: null, otherOpenTabs: [],
        requestDocumentExit: vi.fn(), shareFragment: vi.fn(), getOpenTabSession: vi.fn(), removeOpenTab: vi.fn(), removeOpenTabs: vi.fn(),
        clearOtherOpenTabs, refreshOtherOpenTabs: vi.fn(), setRecord: vi.fn(), setActiveTabMap: vi.fn(), setTraceFiles: vi.fn(),
        setSelectedFeatureId: vi.fn(), setSelectedPrimerId: vi.fn(), setSelectionFocus: vi.fn(), setSelectedRange: vi.fn(),
        setLastAlignedSequence: vi.fn(), setTracesNeedRealign: vi.fn(), applyDefaultMapViewForTopology: vi.fn(), markClean: vi.fn(), setStatus,
      })
      return null
    }
    await act(async () => root.render(<Harness />))
    await act(async () => controller!.unloadOrphanedOpenTabs())
    expect(clearOtherOpenTabs).toHaveBeenCalledWith('current')
    expect(setStatus).toHaveBeenCalledWith('Unloaded 2 orphaned tab entries from the shared cache.')
  })
})
