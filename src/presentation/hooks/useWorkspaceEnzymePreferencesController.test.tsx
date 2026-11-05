// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  defaultEnzymePreferences,
  normalizeEnzymePreferences,
  type EnzymePreferences,
} from '../../domain/enzymePreferences'
import { useWorkspaceEnzymePreferencesController } from './useWorkspaceEnzymePreferencesController'

function mountController(input?: {
  initial?: EnzymePreferences
  subscribeExternalSync?: (apply: (preferences: EnzymePreferences) => void) => () => void
}) {
  let preferences = input?.initial ?? defaultEnzymePreferences
  let tabMode: EnzymePreferences['defaultTab'] = preferences.defaultTab
  const setEnzymePreferences = vi.fn((next: EnzymePreferences) => {
    preferences = next
  })
  const setEnzymeTabPositionMode = vi.fn((mode: EnzymePreferences['defaultTab']) => {
    tabMode = mode
  })
  const saveEnzymePreferences = vi.fn()
  const openEnzymeInfo = vi.fn()
  const setStatus = vi.fn()
  let externalApply: ((preferences: EnzymePreferences) => void) | null = null
  const subscribeExternalSync =
    input?.subscribeExternalSync
    ?? ((apply: (preferences: EnzymePreferences) => void) => {
      externalApply = apply
      return () => {
        externalApply = null
      }
    })

  let controller!: ReturnType<typeof useWorkspaceEnzymePreferencesController>
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)

  function Harness() {
    controller = useWorkspaceEnzymePreferencesController({
      enzymePreferences: preferences,
      setEnzymePreferences,
      setEnzymeTabPositionMode,
      normalizeEnzymePreferences,
      saveEnzymePreferences,
      subscribeExternalSync,
      enzymeNames: ['EcoRI', 'BamHI'],
      openEnzymeInfo,
      setStatus,
    })
    return null
  }

  act(() => {
    root.render(<Harness />)
  })

  return {
    controller,
    setEnzymePreferences,
    setEnzymeTabPositionMode,
    saveEnzymePreferences,
    openEnzymeInfo,
    setStatus,
    get preferences() {
      return preferences
    },
    get tabMode() {
      return tabMode
    },
    applyExternal: (next: EnzymePreferences) => externalApply?.(next),
    cleanup: () => {
      act(() => {
        root.unmount()
      })
      host.remove()
    },
  }
}

describe('useWorkspaceEnzymePreferencesController', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('persists normalized preferences and updates tab position mode', () => {
    const mounted = mountController()
    act(() => {
      mounted.controller.handleEnzymePreferencesChange({
        ...defaultEnzymePreferences,
        defaultTab: 'lines',
        italicizeNames: true,
      })
    })
    expect(mounted.saveEnzymePreferences).toHaveBeenCalledWith(
      expect.objectContaining({ defaultTab: 'lines', italicizeNames: true }),
    )
    expect(mounted.setEnzymeTabPositionMode).toHaveBeenCalledWith('lines')
    mounted.cleanup()
  })

  it('applies external preference changes without persisting again', () => {
    const mounted = mountController()
    mounted.saveEnzymePreferences.mockClear()
    act(() => {
      mounted.applyExternal(normalizeEnzymePreferences({ ...defaultEnzymePreferences, boldUniqueCutters: true }))
    })
    expect(mounted.setEnzymePreferences).toHaveBeenCalledWith(
      expect.objectContaining({ boldUniqueCutters: true }),
    )
    expect(mounted.saveEnzymePreferences).not.toHaveBeenCalled()
    mounted.cleanup()
  })

  it('opens enzyme info for a random catalog name', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const mounted = mountController()
    act(() => {
      mounted.controller.openRandomEnzymeInfo()
    })
    expect(mounted.openEnzymeInfo).toHaveBeenCalledWith('EcoRI')
    mounted.cleanup()
  })

  it('saves merged priorityOrder, reports exact status, and closes the dialog', () => {
    const mounted = mountController()
    act(() => {
      mounted.controller.setEnzymePrioritiesOpen(true)
      mounted.controller.saveEnzymePriorityOrder(['EcoRI', 'BamHI'])
    })
    expect(mounted.saveEnzymePreferences).toHaveBeenCalledWith(
      expect.objectContaining({ priorityOrder: ['EcoRI', 'BamHI'] }),
    )
    expect(mounted.setStatus).toHaveBeenCalledWith('Saved custom enzyme priority order (2 enzymes).')
    expect(mounted.controller.enzymePrioritiesOpen).toBe(false)
    mounted.cleanup()
  })

  it('reports restore status when priority order is cleared', () => {
    const mounted = mountController()
    act(() => {
      mounted.controller.saveEnzymePriorityOrder([])
    })
    expect(mounted.saveEnzymePreferences).toHaveBeenCalledWith(
      expect.objectContaining({ priorityOrder: [] }),
    )
    expect(mounted.setStatus).toHaveBeenCalledWith('Restored default enzyme priority order.')
    mounted.cleanup()
  })
})
