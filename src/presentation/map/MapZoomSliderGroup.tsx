import { useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { mapZoomSliderSteps } from './mapZoom'

export function MapZoomSliderGroup({
  sequenceLength,
  sliderValue,
  onSliderValueChange,
}: {
  sequenceLength: number
  /** Authoritative thumb position (0 = full sequence). Never derived mid-gesture from window length. */
  sliderValue: number
  onSliderValueChange: (value: number) => void
}) {
  const steps = mapZoomSliderSteps(sequenceLength)
  const value = Math.max(0, Math.min(steps, Math.round(sliderValue)))
  const trackRef = useRef<HTMLDivElement | null>(null)
  const thumbTravelPadPx = 7

  function valueFromClientX(clientX: number) {
    const track = trackRef.current
    if (!track) return value
    const rect = track.getBoundingClientRect()
    const travel = Math.max(1, rect.width - thumbTravelPadPx * 2)
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left - thumbTravelPadPx) / travel))
    return Math.round(ratio * steps)
  }

  function handleTrackPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    onSliderValueChange(valueFromClientX(event.clientX))
  }

  function handleTrackPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    onSliderValueChange(valueFromClientX(event.clientX))
  }

  function nudgeZoom(direction: -1 | 1) {
    const step = Math.max(1, Math.round(steps / 40))
    onSliderValueChange(Math.max(0, Math.min(steps, value + direction * step)))
  }

  const thumbPercent = steps <= 0 ? 0 : (value / steps) * 100

  return (
    <div className="map-zoom-slider-group">
      <button
        type="button"
        className="map-zoom-nudge"
        title="Zoom out"
        aria-label="Zoom out"
        onClick={() => nudgeZoom(-1)}
      >
        −
      </button>
      <div
        ref={trackRef}
        className="map-zoom-slider"
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={steps}
        aria-valuenow={value}
        aria-label="Map zoom level"
        onPointerDown={handleTrackPointerDown}
        onPointerMove={handleTrackPointerMove}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
            event.preventDefault()
            nudgeZoom(-1)
          } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
            event.preventDefault()
            nudgeZoom(1)
          } else if (event.key === 'Home') {
            event.preventDefault()
            onSliderValueChange(0)
          } else if (event.key === 'End') {
            event.preventDefault()
            onSliderValueChange(steps)
          }
        }}
      >
        <div className="map-zoom-slider-rail" aria-hidden />
        <div
          className="map-zoom-slider-thumb"
          style={{ left: `calc(${thumbTravelPadPx}px + (100% - ${thumbTravelPadPx * 2}px) * ${thumbPercent / 100})` }}
          aria-hidden
        />
      </div>
      <button
        type="button"
        className="map-zoom-nudge"
        title="Zoom in"
        aria-label="Zoom in"
        onClick={() => nudgeZoom(1)}
      >
        +
      </button>
    </div>
  )
}
