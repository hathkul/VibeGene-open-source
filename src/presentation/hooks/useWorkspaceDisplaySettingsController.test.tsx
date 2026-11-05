// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_APP_PREFERENCES } from '../../domain/appPreferences'
import { defaultDisplaySettings, type DisplaySettings } from '../sequence'
import { useWorkspaceDisplaySettingsController } from './useWorkspaceDisplaySettingsController'

function mountController(input: {
  initial: DisplaySettings
  activeTab?: 'Map' | 'Sequence'
  readAppPreferences?: () => typeof DEFAULT_APP_PREFERENCES
}) {
  let current = input.initial
  const setDisplaySettings = vi.fn((updater: (value: DisplaySettings) => DisplaySettings) => {
    current = updater(current)
  })
  let controller!: ReturnType<typeof useWorkspaceDisplaySettingsController>
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)

  function Harness() {
    controller = useWorkspaceDisplaySettingsController({
      setDisplaySettings,
      activeTab: input.activeTab ?? 'Map',
      readAppPreferences: input.readAppPreferences,
    })
    return null
  }

  act(() => {
    root.render(<Harness />)
  })

  return {
    controller,
    get current() {
      return current
    },
    cleanup: () => {
      act(() => {
        root.unmount()
      })
      host.remove()
    },
  }
}

describe('useWorkspaceDisplaySettingsController', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('patches a display section through the planner', () => {
    const mounted = mountController({ initial: defaultDisplaySettings })
    act(() => {
      mounted.controller.updateDisplaySection('primers', { visible: false })
    })
    expect(mounted.current.primers.visible).toBe(false)
    mounted.cleanup()
  })

  it('applies topology defaults with app preference precedence for enzyme visibility', () => {
    const mounted = mountController({
      initial: { ...defaultDisplaySettings, enzymes: { ...defaultDisplaySettings.enzymes, visible: true } },
      readAppPreferences: () => ({
        ...DEFAULT_APP_PREFERENCES,
        skipEnzymeScanForLongSequences: true,
        enzymeScanMaxBp: 10_000,
      }),
    })
    act(() => {
      mounted.controller.applyDefaultMapViewForTopology('circular', 50_000)
    })
    expect(mounted.current.mapView.linear).toBe(false)
    expect(mounted.current.enzymes.visible).toBe(false)
    mounted.cleanup()
  })
})
