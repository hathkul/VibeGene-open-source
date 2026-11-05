import { useMemo, useState } from 'react'
import { aminoAcidInfo, calculateProteinProperties, proteinDisplayNumberAt, type ProteinProperties } from '../../domain/protein'
import { type SequenceRecord } from '../../domain/types'
import { type SelectionRange } from '../sequence'

function knownDisulfideCysteines(
  record: SequenceRecord,
  range: SelectionRange = { start: 0, end: record.sequence.length },
): number {
  return (record.protein?.bonds ?? []).reduce((count, bond) => {
    if (bond.type !== 'disulfide') return count
    const localEndpoints = bond.endpoints.filter((endpoint) => (
      !endpoint.chainId
      && endpoint.residue >= range.start
      && endpoint.residue < range.end
      && record.sequence[endpoint.residue]?.toUpperCase() === 'C'
    ))
    return localEndpoints.length === 2 ? count + 2 : count
  }, 0)
}

function formatProteinPropertyValue(value: number | null, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function ProteinPropertiesPane({
  record,
  selectedRange,
}: {
  record: SequenceRecord
  selectedRange: SelectionRange | null
}) {
  const [ph, setPh] = useState(7)
  const selectedStart = selectedRange?.start
  const selectedEnd = selectedRange?.end
  const selection = useMemo(() => selectedStart != null && selectedEnd != null && selectedEnd > selectedStart
    ? {
        start: Math.max(0, Math.min(record.sequence.length, selectedStart)),
        end: Math.max(0, Math.min(record.sequence.length, selectedEnd)),
      }
    : null, [record.sequence.length, selectedEnd, selectedStart])
  const whole = useMemo(() => calculateProteinProperties(record.sequence, {
    ph,
    knownDisulfideCysteines: knownDisulfideCysteines(record),
  }), [ph, record])
  const selected = useMemo(() => selection
    ? calculateProteinProperties(record.sequence.slice(selection.start, selection.end), {
        ph,
        knownDisulfideCysteines: knownDisulfideCysteines(record, selection),
      })
    : null, [ph, record, selection])
  const selectionLabel = selection
    ? `${proteinDisplayNumberAt(selection.start, record.protein, record.features)}…${proteinDisplayNumberAt(selection.end - 1, record.protein, record.features)}`
    : 'No selection'
  const propertyCell = (
    properties: ProteinProperties | null,
    field: keyof ProteinProperties,
    suffix = '',
    digits = 2,
  ) => {
    const value = properties?.[field]
    return typeof value === 'number' ? `${formatProteinPropertyValue(value, digits)}${suffix}` : '—'
  }

  return (
    <div className="protein-properties-pane">
      <div className="protein-properties-heading">
        <div>
          <h2>Protein Properties</h2>
          <p>Predicted properties calculated from the amino-acid sequence.</p>
        </div>
        <label>
          Charge at pH
          <input
            type="number"
            min="0"
            max="14"
            step="0.1"
            value={ph}
            onChange={(event) => {
              const next = Number(event.currentTarget.value)
              if (Number.isFinite(next)) setPh(Math.max(0, Math.min(14, next)))
            }}
          />
        </label>
      </div>

      <div className="protein-properties-table-wrap">
        <table className="protein-properties-summary">
          <thead>
            <tr>
              <th>Property</th>
              <th>Whole Protein</th>
              <th>
                Selection
                <small>{selectionLabel}</small>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr><th>Length</th><td>{whole.length.toLocaleString()} aa</td><td>{selected ? `${selected.length.toLocaleString()} aa` : '—'}</td></tr>
            <tr className="protein-property-section"><th colSpan={3}>Molecular Weight</th></tr>
            <tr><th>average</th><td>{propertyCell(whole, 'averageMass', ' Da')}</td><td>{propertyCell(selected, 'averageMass', ' Da')}</td></tr>
            <tr><th>monoisotopic</th><td>{propertyCell(whole, 'monoisotopicMass', ' Da')}</td><td>{propertyCell(selected, 'monoisotopicMass', ' Da')}</td></tr>
            <tr className="protein-property-section"><th colSpan={3}>Extinction Coefficient (280 nm)</th></tr>
            <tr><th>known disulfides</th><td>{propertyCell(whole, 'extinctionCoefficient', ' M⁻¹ cm⁻¹', 0)}</td><td>{propertyCell(selected, 'extinctionCoefficient', ' M⁻¹ cm⁻¹', 0)}</td></tr>
            <tr><th>fully reduced</th><td>{propertyCell(whole, 'extinctionCoefficientReduced', ' M⁻¹ cm⁻¹', 0)}</td><td>{propertyCell(selected, 'extinctionCoefficientReduced', ' M⁻¹ cm⁻¹', 0)}</td></tr>
            <tr><th>fully oxidized</th><td>{propertyCell(whole, 'extinctionCoefficientOxidized', ' M⁻¹ cm⁻¹', 0)}</td><td>{propertyCell(selected, 'extinctionCoefficientOxidized', ' M⁻¹ cm⁻¹', 0)}</td></tr>
            <tr className="protein-property-section"><th colSpan={3}>Absorbance (280 nm, 0.1%)</th></tr>
            <tr><th>known disulfides</th><td>{propertyCell(whole, 'absorbance')}</td><td>{propertyCell(selected, 'absorbance')}</td></tr>
            <tr><th>fully reduced</th><td>{propertyCell(whole, 'absorbanceReduced')}</td><td>{propertyCell(selected, 'absorbanceReduced')}</td></tr>
            <tr><th>fully oxidized</th><td>{propertyCell(whole, 'absorbanceOxidized')}</td><td>{propertyCell(selected, 'absorbanceOxidized')}</td></tr>
            <tr><th>Isoelectric Point (pI)</th><td>{propertyCell(whole, 'isoelectricPoint')}</td><td>{propertyCell(selected, 'isoelectricPoint')}</td></tr>
            <tr><th>Charge at pH {ph.toFixed(1)}</th><td>{propertyCell(whole, 'charge')}</td><td>{propertyCell(selected, 'charge')}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="protein-composition-wrap">
        <h3>Amino Acid Composition</h3>
        <table className="protein-composition-table">
          <thead>
            <tr>
              <th colSpan={3}>Amino Acid</th>
              <th>Whole Number</th>
              <th>Whole Percent</th>
              <th>Selection Number</th>
              <th>Selection Percent</th>
            </tr>
          </thead>
          <tbody>
            {whole.composition.map((entry) => {
              const selectedEntry = selected?.composition.find((candidate) => candidate.code === entry.code)
              return (
                <tr key={entry.code}>
                  <td className={`protein-composition-code is-${aminoAcidInfo(entry.code).className}`}>{entry.code}</td>
                  <td>{entry.threeLetter}</td>
                  <td>{entry.name}</td>
                  <td>{entry.count.toLocaleString()}</td>
                  <td>{formatProteinPropertyValue(entry.percent)}%</td>
                  <td>{selectedEntry ? selectedEntry.count.toLocaleString() : '—'}</td>
                  <td>{selectedEntry ? `${formatProteinPropertyValue(selectedEntry.percent)}%` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
