import type { SequenceFeature } from '../../domain/types'
import { MapZoomMinimap } from './MapZoomMinimap'
import { MapZoomSliderGroup } from './MapZoomSliderGroup'
import type { MapSelectionRange } from './mapZoom'

export function MapZoomStrip({
  sequenceLength,
  annotationFeatures,
  viewRange,
  caretPosition,
  sliderValue,
  onSliderValueChange,
  onViewRangeChange,
}: {
  sequenceLength: number
  annotationFeatures: SequenceFeature[]
  viewRange: MapSelectionRange
  caretPosition: number | null
  sliderValue: number
  onSliderValueChange: (value: number) => void
  onViewRangeChange: (range: MapSelectionRange) => void
}) {
  return (
    <div className="map-zoom-strip" role="toolbar" aria-label="Map zoom controls">
      <MapZoomSliderGroup
        sequenceLength={sequenceLength}
        sliderValue={sliderValue}
        onSliderValueChange={onSliderValueChange}
      />
      <MapZoomMinimap
        sequenceLength={sequenceLength}
        annotationFeatures={annotationFeatures}
        viewRange={viewRange}
        caretPosition={caretPosition}
        onViewRangeChange={onViewRangeChange}
      />
    </div>
  )
}
