// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWorkspaceMapNavigationController } from './useWorkspaceMapNavigationController'

describe('useWorkspaceMapNavigationController', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('preserves the clicked feature segment as the sequence reveal position', () => {
    const selectFeatureById = vi.fn()
    let controller: ReturnType<typeof useWorkspaceMapNavigationController>
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      controller = useWorkspaceMapNavigationController({
        libraryMapBrowseActive: false,
        libraryMapBrowseKeys: [],
        libraryMapBrowseIndex: -1,
        libraryMapMembers: [],
        libraryMapBrowseMemberId: null,
        mapViewSequenceLength: 100,
        recordSequenceLength: 100,
        queueRevealTarget: vi.fn(),
        traceFiles: [],
        setSelectedAlignmentTraceId: vi.fn(),
        traceAlignmentMode: false,
        setSequenceRange: vi.fn(),
        setStatus: vi.fn(),
        selectFeatureById,
        openFeatureEditorForFeature: vi.fn(),
        selectPrimerById: vi.fn(),
        openPrimerEditorForPrimer: vi.fn(),
      })
      return null
    }

    act(() => root.render(<Harness />))
    act(() => controller!.selectMapFeature('multi-segment', false, 240))

    expect(selectFeatureById).toHaveBeenCalledWith(
      'multi-segment',
      false,
      false,
      { libraryMemberId: null, scrollPosition: 240 },
    )
  })
})
