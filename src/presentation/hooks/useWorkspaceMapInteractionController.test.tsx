// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultDisplaySettings } from '../sequence'
import { useWorkspaceMapInteractionController } from './useWorkspaceMapInteractionController'

describe('useWorkspaceMapInteractionController', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('does not recenter an enabled zoom window when only the selection changes', async () => {
    const setMapZoomRange = vi.fn()
    const setMapZoomSlider = vi.fn()
    let setSelection: (range: { start: number; end: number }) => void
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      const [selection, updateSelection] = useState({ start: 2, end: 8 })
      setSelection = updateSelection
      useWorkspaceMapInteractionController({
        record: { molecule: 'dna', sequence: 'A'.repeat(100) },
        displaySettings: { ...defaultDisplaySettings, mapView: { ...defaultDisplaySettings.mapView, zoom: true } },
        mapViewSelectedRange: selection,
        mapViewSequenceLength: 100,
        setMapZoomRange,
        setMapZoomSlider,
        setDisplaySettings: vi.fn(),
        mapZoomLinearBeforeRef: { current: null },
      })
      return null
    }
    await act(async () => root.render(<Harness />))
    setMapZoomRange.mockClear()
    setMapZoomSlider.mockClear()
    act(() => setSelection!({ start: 50, end: 60 }))
    expect(setMapZoomRange).not.toHaveBeenCalled()
    expect(setMapZoomSlider).not.toHaveBeenCalled()
  })
})
