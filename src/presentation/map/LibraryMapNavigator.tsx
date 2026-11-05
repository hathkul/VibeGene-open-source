import { ChevronLeft, ChevronRight } from 'lucide-react'

export function LibraryMapNavigator({
  label,
  index,
  count,
  onPrevious,
  onNext,
}: {
  label: string
  index: number
  count: number
  onPrevious: () => void
  onNext: () => void
}) {
  if (count < 2) return null
  return (
    <div className="library-map-navigator" role="navigation" aria-label="Library map">
      <div className="library-map-navigator-buttons" role="group" aria-label="Switch library map">
        <button type="button" aria-label="Previous map" onClick={onPrevious}>
          <ChevronLeft size={14} aria-hidden="true" />
        </button>
        <button type="button" aria-label="Next map" onClick={onNext}>
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="library-map-navigator-meta">
        <span className="library-map-navigator-label" title={label}>{label}</span>
        <span className="library-map-navigator-index">{index + 1} of {count}</span>
      </div>
    </div>
  )
}
