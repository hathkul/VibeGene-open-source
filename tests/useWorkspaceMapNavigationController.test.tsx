// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWorkspaceMapNavigationController } from '../src/presentation/hooks/useWorkspaceMapNavigationController'

describe('useWorkspaceMapNavigationController', () => {
  let cleanup: (() => void) | null = null
  afterEach(() => {
    cleanup?.()
    cleanup = null
  })

  function mountController(overrides: Partial<Parameters<typeof useWorkspaceMapNavigationController>[0]> = {}) {
    const setSequenceRange = vi.fn()
    const setStatus = vi.fn()
    const selectFeatureById = vi.fn()
    const openFeatureEditorForFeature = vi.fn()
    const selectPrimerById = vi.fn()
    const openPrimerEditorForPrimer = vi.fn()
    const queueRevealTarget = vi.fn()
    const view = {
      controller: null as ReturnType<typeof useWorkspaceMapNavigationController> | null,
    }

    function Harness() {
      view.controller = useWorkspaceMapNavigationController({
        libraryMapBrowseActive: true,
        libraryMapBrowseKeys: [null, 'member-a', 'member-b'],
        libraryMapBrowseIndex: 1,
        libraryMapMembers: [
          { id: 'member-a', fileName: 'read-a.ab1', sequence: 'ACGTACGT' },
          { id: 'member-b', fileName: 'read-b.ab1', sequence: 'ACGT' },
        ],
        libraryMapBrowseMemberId: 'member-a',
        mapViewSequenceLength: 8,
        recordSequenceLength: 1134,
        queueRevealTarget,
        setSequenceRange,
        setStatus,
        selectFeatureById,
        openFeatureEditorForFeature,
        selectPrimerById,
        openPrimerEditorForPrimer,
        ...overrides,
      })
      return null
    }

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<Harness />))
    cleanup = () => act(() => root.unmount())

    return {
      view,
      setSequenceRange,
      setStatus,
      selectFeatureById,
      openFeatureEditorForFeature,
      selectPrimerById,
      openPrimerEditorForPrimer,
      queueRevealTarget,
    }
  }

  it('selects map features with allowToggle false and current browse member context', () => {
    const env = mountController()
    act(() => env.view.controller!.selectMapFeature('feature-1', true))
    expect(env.selectFeatureById).toHaveBeenCalledWith('feature-1', true, false, { libraryMemberId: 'member-a' })
    expect(env.queueRevealTarget).toHaveBeenCalledWith({ kind: 'selection', viewport: 'sequence' })
  })

  it('routes map range selection with member length and without scroll options', () => {
    const env = mountController()
    act(() => env.view.controller!.selectMapRange({ start: 2, end: 5 }))
    expect(env.setSequenceRange).toHaveBeenCalledWith(
      { start: 2, end: 5 },
      { libraryMemberId: 'member-a', sequenceLength: 8 },
    )
    expect(env.queueRevealTarget).toHaveBeenCalledWith({ kind: 'selection', viewport: 'sequence' })
  })

  it('opens map feature and primer editors with browse member context', () => {
    const env = mountController()
    act(() => env.view.controller!.editMapFeature('feature-2'))
    act(() => env.view.controller!.editMapPrimer('primer-1'))
    expect(env.openFeatureEditorForFeature).toHaveBeenCalledWith('feature-2', { libraryMemberId: 'member-a' })
    expect(env.openPrimerEditorForPrimer).toHaveBeenCalledWith('primer-1', 'member-a')
  })

  it('selects map primers with browse member context and default scroll via omission', () => {
    const env = mountController()
    act(() => env.view.controller!.selectMapPrimer('primer-2', false))
    expect(env.selectPrimerById).toHaveBeenCalledWith('primer-2', false, { libraryMemberId: 'member-a' })
  })

  it('navigates library map forward with collapsed caret, member length, and status', () => {
    const env = mountController()
    act(() => env.view.controller!.navigateNextLibraryMap())
    expect(env.setSequenceRange).toHaveBeenCalledWith(
      { start: 0, end: 0 },
      { collapsed: true, libraryMemberId: 'member-b', sequenceLength: 4 },
    )
    expect(env.setStatus).toHaveBeenCalledWith('Map: read-b.ab1')
  })

  it('navigates to consensus with record sequence length when browse key is null', () => {
    const env = mountController({ libraryMapBrowseIndex: 1, libraryMapBrowseMemberId: 'member-a' })
    act(() => env.view.controller!.navigatePreviousLibraryMap())
    expect(env.setSequenceRange).toHaveBeenCalledWith(
      { start: 0, end: 0 },
      { collapsed: true, libraryMemberId: null, sequenceLength: 1134 },
    )
    expect(env.setStatus).toHaveBeenCalledWith('Map: Consensus')
  })

  it('ignores library navigation when browse is inactive', () => {
    const env = mountController({ libraryMapBrowseActive: false })
    act(() => env.view.controller!.navigateNextLibraryMap())
    expect(env.setSequenceRange).not.toHaveBeenCalled()
    expect(env.setStatus).not.toHaveBeenCalled()
    act(() => env.view.controller!.navigatePreviousLibraryMap())
    expect(env.setSequenceRange).not.toHaveBeenCalled()
    expect(env.setStatus).not.toHaveBeenCalled()
  })

  it('keeps map command identity when unrelated browse fields change', () => {
    const setSequenceRange = vi.fn()
    const setStatus = vi.fn()
    const selectFeatureById = vi.fn()
    const openFeatureEditorForFeature = vi.fn()
    const selectPrimerById = vi.fn()
    const openPrimerEditorForPrimer = vi.fn()
    const queueRevealTarget = vi.fn()
    const view = { controller: null as ReturnType<typeof useWorkspaceMapNavigationController> | null }

    function Harness({ recordSequenceLength }: { recordSequenceLength: number }) {
      view.controller = useWorkspaceMapNavigationController({
        libraryMapBrowseActive: true,
        libraryMapBrowseKeys: [null, 'member-a', 'member-b'],
        libraryMapBrowseIndex: 1,
        libraryMapMembers: [
          { id: 'member-a', fileName: 'read-a.ab1', sequence: 'ACGTACGT' },
          { id: 'member-b', fileName: 'read-b.ab1', sequence: 'ACGT' },
        ],
        libraryMapBrowseMemberId: 'member-a',
        mapViewSequenceLength: 8,
        recordSequenceLength,
        queueRevealTarget,
        setSequenceRange,
        setStatus,
        selectFeatureById,
        openFeatureEditorForFeature,
        selectPrimerById,
        openPrimerEditorForPrimer,
      })
      return null
    }

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<Harness recordSequenceLength={1134} />))
    const firstSelectMapRange = view.controller!.selectMapRange
    act(() => root.render(<Harness recordSequenceLength={2000} />))
    expect(view.controller!.selectMapRange).toBe(firstSelectMapRange)
    act(() => root.unmount())
  })

  it('updates library navigation commands when record sequence length changes', () => {
    const setSequenceRange = vi.fn()
    const view = { controller: null as ReturnType<typeof useWorkspaceMapNavigationController> | null }

    function Harness({ recordSequenceLength }: { recordSequenceLength: number }) {
      view.controller = useWorkspaceMapNavigationController({
        libraryMapBrowseActive: true,
        libraryMapBrowseKeys: [null, 'member-a'],
        libraryMapBrowseIndex: 1,
        libraryMapMembers: [{ id: 'member-a', fileName: 'read-a.ab1', sequence: 'ACGTACGT' }],
        libraryMapBrowseMemberId: 'member-a',
        mapViewSequenceLength: 8,
        recordSequenceLength,
        queueRevealTarget: vi.fn(),
        setSequenceRange,
        setStatus: vi.fn(),
        selectFeatureById: vi.fn(),
        openFeatureEditorForFeature: vi.fn(),
        selectPrimerById: vi.fn(),
        openPrimerEditorForPrimer: vi.fn(),
      })
      return null
    }

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<Harness recordSequenceLength={1134} />))
    const firstNavigatePrevious = view.controller!.navigatePreviousLibraryMap
    act(() => root.render(<Harness recordSequenceLength={2000} />))
    expect(view.controller!.navigatePreviousLibraryMap).not.toBe(firstNavigatePrevious)
    act(() => root.unmount())
  })

  it('updates map range commands when browse member context changes', () => {
    const setSequenceRange = vi.fn()
    const view = { controller: null as ReturnType<typeof useWorkspaceMapNavigationController> | null }

    function Harness({ browseMemberId }: { browseMemberId: string | null }) {
      view.controller = useWorkspaceMapNavigationController({
        libraryMapBrowseActive: true,
        libraryMapBrowseKeys: [null, 'member-a'],
        libraryMapBrowseIndex: 1,
        libraryMapMembers: [{ id: 'member-a', fileName: 'read-a.ab1', sequence: 'ACGTACGT' }],
        libraryMapBrowseMemberId: browseMemberId,
        mapViewSequenceLength: 8,
        recordSequenceLength: 1134,
        queueRevealTarget: vi.fn(),
        setSequenceRange,
        setStatus: vi.fn(),
        selectFeatureById: vi.fn(),
        openFeatureEditorForFeature: vi.fn(),
        selectPrimerById: vi.fn(),
        openPrimerEditorForPrimer: vi.fn(),
      })
      return null
    }

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => root.render(<Harness browseMemberId="member-a" />))
    const firstSelectMapRange = view.controller!.selectMapRange
    act(() => root.render(<Harness browseMemberId={null} />))
    expect(view.controller!.selectMapRange).not.toBe(firstSelectMapRange)
    act(() => view.controller!.selectMapRange({ start: 1, end: 2 }))
    expect(setSequenceRange).toHaveBeenCalledWith(
      { start: 1, end: 2 },
      { libraryMemberId: null, sequenceLength: 8 },
    )
    act(() => root.unmount())
  })
})
