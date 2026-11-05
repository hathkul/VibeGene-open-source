import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  formatStructureDeltaG,
  formatStructureTm,
  predictPrimerPairStructures,
  predictPrimerSecondaryStructures,
  structureKindLabel,
  PRIMER_SECONDARY_STRUCTURE_METHOD_SUMMARY,
  type PrimerSecondaryStructure,
} from './domain/primerSecondaryStructure'
import { MAX_PRIMER_LENGTH } from './domain/primerLimits'
import { normalizeDna } from './domain/sequence'

function StructuresTable({
  structures,
  showSource,
}: {
  structures: PrimerSecondaryStructure[]
  showSource: boolean
}) {
  return (
    <div className="primer-editor-structures-table-wrap">
      <table className={`primer-editor-structures-table${showSource ? ' has-source' : ''}`}>
        <thead>
          <tr>
            <th>Type</th>
            {showSource ? <th>Oligo</th> : null}
            <th>Stem</th>
            <th>Location</th>
            <th>ΔG₃₇</th>
            <th>Tm</th>
          </tr>
        </thead>
        <tbody>
          {structures.map((structure) => (
            <tr key={structure.id}>
              <td title={structure.label}>
                {structureKindLabel(structure.kind)}
                {structure.loopLength != null ? ` · loop ${structure.loopLength}` : ''}
              </td>
              {showSource ? (
                <td title={structure.source}>{structure.source}</td>
              ) : null}
              <td className="primer-editor-structure-stem-cell">
                <div className="primer-editor-structure-stem">
                  <span className="primer-editor-structure-stem-line" title={`5′ ${structure.topStem} 3′`}>
                    {structure.topStem}
                  </span>
                  <span className="primer-editor-structure-stem-pairs" aria-hidden="true">
                    {'|'.repeat(structure.stemLength)}
                  </span>
                  <span className="primer-editor-structure-stem-line" title={`3′ ${structure.bottomStem} 5′`}>
                    {structure.bottomStem}
                  </span>
                </div>
              </td>
              <td title={structure.detail}>{structure.detail}</td>
              <td>{formatStructureDeltaG(structure.dG37)}</td>
              <td>{formatStructureTm(structure.tmC)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StructuresMethodSummary({
  structures,
  emptyLabel,
}: {
  structures: PrimerSecondaryStructure[]
  emptyLabel: ReactNode
}) {
  const [methodOpen, setMethodOpen] = useState(false)
  const methodRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!methodOpen) return
    const onPointerDown = (event: PointerEvent) => {
      const root = methodRef.current
      if (!root || !(event.target instanceof Node) || root.contains(event.target)) return
      setMethodOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMethodOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [methodOpen])

  return (
    <div className="primer-editor-structures-summary-row" ref={methodRef}>
      <p className="muted primer-editor-structures-summary">
        {structures.length === 0 ? (
          emptyLabel
        ) : (
          <>
            {structures.length} predicted structure{structures.length === 1 ? '' : 's'} · most stable first
          </>
        )}
        {' · '}
        <button
          type="button"
          className="primer-editor-structures-method-link"
          aria-expanded={methodOpen}
          aria-controls="primer-structures-method-popup"
          onClick={() => setMethodOpen((open) => !open)}
        >
          calculation method
        </button>
      </p>
      {methodOpen ? (
        <div
          id="primer-structures-method-popup"
          className="primer-editor-structures-method-popup"
          role="dialog"
          aria-label="Secondary structure calculation method"
        >
          {PRIMER_SECONDARY_STRUCTURE_METHOD_SUMMARY.split('\n\n').map((paragraph) => (
            <p key={paragraph.slice(0, 24)}>{paragraph}</p>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function PrimerStructuresPanel({
  sequence,
  pairSequence,
  labels,
}: {
  sequence: string
  /** When set, analyze the PCR primer pair (includes primer-dimers). */
  pairSequence?: string
  labels?: { forward: string; reverse: string }
}) {
  const showSource = pairSequence !== undefined
  const sequenceLength = normalizeDna(sequence).length
  const pairSequenceLength = pairSequence === undefined ? 0 : normalizeDna(pairSequence).length
  const analysisTooLong = sequenceLength > MAX_PRIMER_LENGTH || pairSequenceLength > MAX_PRIMER_LENGTH
  const structures = useMemo(() => {
    if (analysisTooLong) return []
    if (pairSequence !== undefined) {
      return predictPrimerPairStructures(sequence, pairSequence, {
        forward: labels?.forward ?? 'Primer 1',
        reverse: labels?.reverse ?? 'Primer 2',
      })
    }
    return predictPrimerSecondaryStructures(sequence)
  }, [analysisTooLong, labels?.forward, labels?.reverse, pairSequence, sequence])

  if (analysisTooLong) {
    return (
      <div className="primer-editor-structures-panel">
        <p className="muted primer-editor-structures-summary">
          Structure analysis is unavailable for oligos longer than {MAX_PRIMER_LENGTH} bases.
        </p>
      </div>
    )
  }

  return (
    <div className="primer-editor-structures-panel">
      <StructuresMethodSummary
        structures={structures}
        emptyLabel={
          showSource ? (
            <>No stable hairpins, self-dimers, or primer-dimers predicted (ΔG₃₇ &lt; 0 at PCR oligo concentration).</>
          ) : (
            <>No stable hairpins or self-dimers predicted (ΔG₃₇ &lt; 0 at PCR oligo concentration).</>
          )
        }
      />
      {structures.length > 0 ? <StructuresTable structures={structures} showSource={showSource} /> : null}
    </div>
  )
}

/** Wraps Primer 1/2 (or A/B) editors with a Calculated structures tab. */
export function PcrPrimerPairPanel({
  forwardSequence,
  reverseSequence,
  forwardLabel = 'Primer 1',
  reverseLabel = 'Primer 2',
  className,
  children,
}: {
  forwardSequence: string
  reverseSequence: string
  forwardLabel?: string
  reverseLabel?: string
  className?: string
  children: ReactNode
}) {
  const [tab, setTab] = useState<'primers' | 'structures'>('primers')

  return (
    <div className={`pcr-primer-panel${className ? ` ${className}` : ''}`}>
      <div className="pcr-primer-panel-body">
        {tab === 'primers' ? (
          children
        ) : (
          <PrimerStructuresPanel
            sequence={forwardSequence}
            pairSequence={reverseSequence}
            labels={{ forward: forwardLabel, reverse: reverseLabel }}
          />
        )}
      </div>
      <div className="pcr-primer-panel-tabs" role="tablist" aria-label="Primer pair views">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'primers'}
          className={tab === 'primers' ? 'active' : ''}
          onClick={() => setTab('primers')}
        >
          Primers
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'structures'}
          className={tab === 'structures' ? 'active' : ''}
          onClick={() => setTab('structures')}
        >
          Calculated structures
        </button>
      </div>
    </div>
  )
}
