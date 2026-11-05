import { useLayoutEffect, useRef, useState } from 'react'
import { recognitionDisplayFor } from '../../domain/enzymeCatalog'
import type { RecognitionRowDisplay } from '../../domain/enzymeCatalog'
import type { Hover } from './useEnzymeHoverTooltip'
import { resolveEnzymeTooltipLeft, resolveEnzymeTooltipVerticalPosition } from './enzymeTooltipLayout'

function CutMarker({ strand }: { strand: 'top' | 'bottom' }) {
  return (
    <span className="enzyme-hover-cut-anchor" aria-hidden>
      <span className={`enzyme-hover-cut enzyme-hover-cut-${strand}`} />
    </span>
  )
}

function RecognitionStrand({ row, strand, allCutBoundaries }: {
  row: RecognitionRowDisplay
  strand: 'top' | 'bottom'
  allCutBoundaries: number[]
}) {
  return (
    <div className="enzyme-hover-diagram-strand enzyme-hover-strand">
      {row.segments.map((segment) => {
        const count = segment.rangeEnd - segment.rangeStart
        return (
          <span className="enzyme-hover-diagram-unit" key={`${strand}-${segment.rangeStart}`}>
            {allCutBoundaries.includes(segment.rangeStart) && (
              <span className="enzyme-hover-cut-slot">
                {row.cutBoundaries.includes(segment.rangeStart) && <CutMarker strand={strand} />}
              </span>
            )}
            <span className="enzyme-hover-diagram-segment">
              {segment.kind === 'spacer'
                ? count > 4
                  ? <span className="enzyme-hover-spacer-group">(N)<sub>{count}</sub></span>
                  : <span>{'N'.repeat(count)}</span>
                : [...segment.text].map((base, index) => (
                    <span key={`${segment.rangeStart + index}-${base}`}>{base}</span>
                  ))}
            </span>
          </span>
        )
      })}
      {row.segments.length > 0 && allCutBoundaries.includes(row.segments[row.segments.length - 1]!.rangeEnd) && (
        <span className="enzyme-hover-cut-slot">
          {row.cutBoundaries.includes(row.segments[row.segments.length - 1]!.rangeEnd) && <CutMarker strand={strand} />}
        </span>
      )}
    </div>
  )
}

export function EnzymeTooltip({ hover }: { hover: Hover }) {
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState({ left: hover.x + 14, top: hover.y + 14 })
  useLayoutEffect(() => {
    const tooltip = tooltipRef.current
    if (!tooltip) return
    tooltip.style.maxHeight = ''
    tooltip.style.overflowY = ''
    const { width, height } = tooltip.getBoundingClientRect()
    const left = resolveEnzymeTooltipLeft(hover.x, width, window.innerWidth, hover.horizontalSide)
    const { top } = resolveEnzymeTooltipVerticalPosition(hover.y, height, window.innerHeight, hover.placement, hover.sequenceBounds)
    setPosition({ left, top })
  }, [hover])
  const { enzyme } = hover.site
  const recognition = enzyme.recognition.toUpperCase()
  const diagram = recognitionDisplayFor(enzyme)
  const diagramLength = diagram.top.rangeEnd - diagram.top.rangeStart
  const showDiagram = diagramLength <= 70
  const allCutBoundaries = [...new Set([...diagram.top.cutBoundaries, ...diagram.bottom.cutBoundaries])]
  const overhang = enzyme.overhang.type === 'blunt' ? 'Blunt ends' : `${enzyme.overhang.type} overhang`
  const variable = enzyme.overhang.type !== 'blunt' && (enzyme.overhang.sequence === null || /[^ACGT]/i.test(enzyme.overhang.sequence))
  return (
    <div ref={tooltipRef} role="tooltip" className={`enzyme-hover-tooltip${hover.placement === 'above' ? ' is-sequence-tooltip' : ''}`} style={{ left: position.left, top: position.top }}>
      <div className="enzyme-hover-heading"><span><strong>{enzyme.name}</strong> <span className="enzyme-hover-muted">({(hover.site.cutTop + 1).toLocaleString()})</span></span><span className="enzyme-hover-badge">{overhang}</span></div>
      <div><strong>{hover.count}</strong> {hover.count === 1 ? 'site' : 'sites'} <span className="enzyme-hover-separator">•</span> <strong>{recognition.length}</strong> bp</div>
      {hover.outsideSequence && <div className="enzyme-hover-note enzyme-hover-outside-warning">Cut site is outside this linear sequence; this enzyme cannot cut this construct here.</div>}
      {variable && <div className="enzyme-hover-note">Sticky ends from different {enzyme.name} sites may not be compatible.</div>}
      <div className="enzyme-hover-pattern">{showDiagram ? <div className="enzyme-hover-diagram"><RecognitionStrand row={diagram.top} strand="top" allCutBoundaries={allCutBoundaries} /><RecognitionStrand row={diagram.bottom} strand="bottom" allCutBoundaries={allCutBoundaries} /></div> : <code>{enzyme.notation}</code>}</div>
    </div>
  )
}
