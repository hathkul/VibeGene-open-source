import { useCallback, useEffect } from 'react'
import { clampMapZoomRange, clampMapZoomRangeToSequence, initialMapZoomState, mapZoomCaretPosition, mapZoomRangeFromSlider, mapZoomSliderSteps, mapZoomSliderValueFromWindow, mapZoomWindowFromSlider } from '../map'
import type { DisplaySettings } from '../sequence'

type Range = { start: number; end: number }
type MapRecord = { molecule: 'dna' | 'rna' | 'protein'; sequence: string }

type WorkspaceMapInteractionOptions = {
  record: MapRecord
  displaySettings: DisplaySettings
  mapViewSelectedRange: Range | null
  mapViewSequenceLength: number
  setMapZoomRange: (range: Range | null | ((current: Range | null) => Range | null)) => void
  setMapZoomSlider: (value: number | ((current: number) => number)) => void
  setDisplaySettings: (updater: (current: DisplaySettings) => DisplaySettings) => void
  mapZoomLinearBeforeRef: { current: boolean | null }
}

/** Owns map zoom state transitions, caret-centered panning, and alignment visibility coupling. */
export function useWorkspaceMapInteractionController(options: WorkspaceMapInteractionOptions) {
  const {
    record,
    displaySettings,
    mapViewSelectedRange,
    mapViewSequenceLength,
    setMapZoomRange,
    setMapZoomSlider,
    setDisplaySettings,
    mapZoomLinearBeforeRef,
  } = options

  const toggleMapZoom = useCallback(() => {
    if (displaySettings.mapView.zoom) {
      const restoreLinear = mapZoomLinearBeforeRef.current ?? displaySettings.mapView.linear
      mapZoomLinearBeforeRef.current = null
      setMapZoomRange(null)
      setMapZoomSlider(0)
      setDisplaySettings((current) => ({ ...current, mapView: { ...current.mapView, zoom: false, linear: restoreLinear } }))
      return
    }
    mapZoomLinearBeforeRef.current = displaySettings.alignments.visible
      ? displaySettings.alignments.linearBeforeAlignments ?? displaySettings.mapView.linear
      : displaySettings.mapView.linear
    const next = record.molecule === 'protein'
      ? { range: { start: 0, end: record.sequence.length }, slider: 0 }
      : initialMapZoomState(mapViewSelectedRange, mapViewSequenceLength)
    setMapZoomRange(next.range)
    setMapZoomSlider(next.slider)
    setDisplaySettings((current) => ({
      ...current,
      mapView: { ...current.mapView, zoom: true, linear: true },
      alignments: current.alignments.visible ? { visible: false } : current.alignments,
    }))
  }, [displaySettings, mapViewSelectedRange, mapViewSequenceLength, mapZoomLinearBeforeRef, record, setDisplaySettings, setMapZoomRange, setMapZoomSlider])

  const handleMapZoomSliderChange = useCallback((value: number) => {
    const caret = mapZoomCaretPosition(mapViewSelectedRange, mapViewSequenceLength)
    const steps = mapZoomSliderSteps(mapViewSequenceLength)
    const clamped = Math.max(0, Math.min(steps, Math.round(value)))
    setMapZoomSlider(clamped)
    setMapZoomRange(mapZoomRangeFromSlider(clamped, caret, mapViewSequenceLength))
  }, [mapViewSelectedRange, mapViewSequenceLength, setMapZoomRange, setMapZoomSlider])

  const handleMapZoomRangeChange = useCallback((range: Range) => {
    const next = clampMapZoomRange(range, mapViewSequenceLength)
    setMapZoomRange(next)
    setMapZoomSlider((current) => {
      if (mapZoomWindowFromSlider(current, mapViewSequenceLength) === next.end - next.start) return current
      return mapZoomSliderValueFromWindow(next.end - next.start, mapViewSequenceLength)
    })
  }, [mapViewSequenceLength, setMapZoomRange, setMapZoomSlider])

  useEffect(() => {
    if (!displaySettings.mapView.zoom) {
      setMapZoomRange(null)
      setMapZoomSlider(0)
      mapZoomLinearBeforeRef.current = null
      return
    }
    const seedRange = mapViewSelectedRange
    setMapZoomRange((current) => current ? clampMapZoomRangeToSequence(current, mapViewSequenceLength) : initialMapZoomState(seedRange, mapViewSequenceLength).range)
    setMapZoomSlider((current) => Math.max(0, Math.min(mapZoomSliderSteps(mapViewSequenceLength), current)))
    // Intentionally omit caret deps: slider zooms around caret at interaction time; panning keeps the window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displaySettings.mapView.zoom, mapViewSequenceLength])

  return { toggleMapZoom, handleMapZoomSliderChange, handleMapZoomRangeChange }
}
