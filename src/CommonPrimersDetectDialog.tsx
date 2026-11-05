import { useMemo, useState } from 'react'
import type { CommonPrimerMatch } from './domain/commonPrimers'
import { gcContent } from './domain/sequence'
import { calculateAnnealTemperature } from './domain/primerThermodynamics'

type DetectRow = CommonPrimerMatch<{ name: string; sequence: string; color?: string; description?: string }>

function formatTm(sequence: string) {
  const thermo = calculateAnnealTemperature(sequence)
  if (thermo.tmC === null || !Number.isFinite(thermo.tmC)) return '—'
  return `${thermo.tmC.toFixed(1)} C`
}

export function CommonPrimersDetectDialog({
  recordName,
  matches,
  onCancel,
  onAdd,
}: {
  recordName: string
  matches: DetectRow[]
  onCancel: () => void
  onAdd: (primers: DetectRow['primer'][]) => void
}) {
  const addable = useMemo(
    () => matches.filter((match) => !match.alreadyPresent).map((match) => match.primer.sequence),
    [matches],
  )
  const [checked, setChecked] = useState<Set<string>>(() => new Set(addable))

  const selected = matches.filter(
    (match) => !match.alreadyPresent && checked.has(match.primer.sequence),
  )

  return (
    <div className="translation-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="translation-dialog common-primers-detect-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="common-primers-detect-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3 id="common-primers-detect-title">Detect Common Primers in {recordName}</h3>
        {matches.length === 0 ? (
          <p className="muted">No common primers hybridize to this sequence under the current parameters.</p>
        ) : (
          <div className="common-primers-detect-table-wrap">
            <table className="enzyme-table common-primers-detect-table">
              <thead>
                <tr>
                  <th>Add</th>
                  <th>Name</th>
                  <th>Length</th>
                  <th>Tm</th>
                  <th>GC</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((match) => {
                  const key = match.primer.sequence
                  const disabled = match.alreadyPresent
                  return (
                    <tr key={`${match.primer.name}:${key}`}>
                      <td>
                        <input
                          type="checkbox"
                          disabled={disabled}
                          checked={!disabled && checked.has(key)}
                          onChange={(event) => {
                            setChecked((current) => {
                              const next = new Set(current)
                              if (event.target.checked) next.add(key)
                              else next.delete(key)
                              return next
                            })
                          }}
                          aria-label={`Add ${match.primer.name}`}
                        />
                      </td>
                      <td>{match.primer.name}</td>
                      <td>{match.primer.sequence.length}</td>
                      <td>{formatTm(match.primer.sequence)}</td>
                      <td>{gcContent(match.primer.sequence).toFixed(0)}%</td>
                      <td>{match.alreadyPresent ? 'Already on construct' : 'New'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="translation-dialog-footer common-primers-detect-footer">
          {matches.length === 0 ? (
            <div className="translation-actions">
              <button type="button" className="primary" onClick={onCancel}>OK</button>
            </div>
          ) : (
            <div className="translation-actions">
              <button type="button" onClick={onCancel}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={selected.length === 0}
                onClick={() => onAdd(selected.map((match) => match.primer))}
              >
                Add{selected.length > 0 ? ` (${selected.length})` : ''}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
