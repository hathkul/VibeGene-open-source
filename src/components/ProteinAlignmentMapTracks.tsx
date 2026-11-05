import { buildProteinAlignmentMapLayout } from '../domain/proteinAlignmentMap'
import type { ProteinComparisonAlignmentEntry } from '../presentation/hooks/useProteinComparisonAlignments'

export const proteinAlignmentMapRowPitch = 32

function identityPercent(entry: ProteinComparisonAlignmentEntry) {
  const alignment = entry.alignment
  if (!alignment) return 0
  const compared = alignment.identityCount + alignment.similarCount + alignment.mismatchCount
  return compared ? alignment.identityCount / compared * 100 : 0
}

function orientationLabel(entry: ProteinComparisonAlignmentEntry) {
  if (!entry.alignment || entry.source.kind === 'protein') return 'protein'
  return entry.alignment.orientation === 'reverse' ? 'reverse DNA' : 'forward DNA'
}

export function ProteinAlignmentMapTracks({
  entries,
  top,
  trackLeft,
  trackRight,
  sequenceX,
  rowPitch = proteinAlignmentMapRowPitch,
  labelFontSizePx = 8,
  labelFontWeight = 600,
  trackHeightPx = 14,
}: {
  entries: ProteinComparisonAlignmentEntry[]
  top: number
  trackLeft: number
  trackRight: number
  sequenceX: (position: number) => number
  rowPitch?: number
  labelFontSizePx?: number
  labelFontWeight?: number
  trackHeightPx?: number
}) {
  return (
    <g className="protein-alignment-map-tracks" aria-label="Protein comparative alignment tracks">
      {entries.map((entry, rowIndex) => {
        const rowTop = top + rowIndex * rowPitch
        const labelY = rowTop + labelFontSizePx
        const barY = labelY + 4
        const alignment = entry.alignment
        const layout = alignment ? buildProteinAlignmentMapLayout(alignment) : null
        const summary = alignment
          ? `${identityPercent(entry).toFixed(1)}% id · ${orientationLabel(entry)}${alignment.frameShiftCount ? ` · ${alignment.frameShiftCount} fs` : ''}`
          : entry.pending ? 'aligning…' : entry.error ?? 'no useful alignment'
        return (
          <g className="protein-alignment-map-row" key={entry.source.id}>
            <title>{`${entry.source.name} · ${summary}`}</title>
            <text x={trackLeft} y={labelY} className="protein-alignment-map-name" style={{ fontSize: labelFontSizePx, fontWeight: labelFontWeight }}>
              {entry.source.name}
            </text>
            <text x={trackRight} y={labelY} textAnchor="end" className="protein-alignment-map-summary" style={{ fontSize: labelFontSizePx, fontWeight: labelFontWeight }}>
              {summary}
            </text>
            {layout ? (
              <>
                <rect
                  x={sequenceX(layout.start)}
                  y={barY}
                  width={Math.max(1, sequenceX(layout.end) - sequenceX(layout.start))}
                  height={trackHeightPx}
                  rx={3}
                  className="protein-alignment-map-coverage"
                />
                {layout.segments.map((segment) => (
                  <rect
                    key={`${segment.start}-${segment.end}-${segment.similarity}`}
                    x={sequenceX(segment.start)}
                    y={barY}
                    width={Math.max(1, sequenceX(segment.end) - sequenceX(segment.start))}
                    height={trackHeightPx}
                    rx={segment.end - segment.start > 1 ? 2 : 0}
                    className={`protein-alignment-map-segment is-${segment.similarity}`}
                  >
                    <title>{`${entry.source.name} · ${segment.similarity} · residues ${segment.start + 1}–${segment.end}`}</title>
                  </rect>
                ))}
                {layout.insertions.map((insertion) => {
                  const x = sequenceX(insertion.boundary)
                  return (
                    <g key={`insertion-${insertion.boundary}`} className="protein-alignment-map-insertion">
                      <line x1={x} x2={x} y1={barY - 2} y2={barY + trackHeightPx + 2} />
                      <path d={`M ${x - 3} ${barY - 2} L ${x + 3} ${barY - 2} L ${x} ${barY + 2} Z`} />
                      <title>{`${entry.source.name} · ${insertion.count} inserted amino acid${insertion.count === 1 ? '' : 's'} at boundary ${insertion.boundary}`}</title>
                    </g>
                  )
                })}
              </>
            ) : (
              <rect
                x={trackLeft}
                y={barY}
                width={Math.max(1, trackRight - trackLeft)}
                height={trackHeightPx}
                rx={3}
                className="protein-alignment-map-pending"
              />
            )}
          </g>
        )
      })}
    </g>
  )
}
