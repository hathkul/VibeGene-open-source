import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { normalizeProteinDocumentData } from './domain/constructProperties'
import { defaultProteinBondResidues, proteinBondTypeLabel } from './domain/proteinBonds'
import { createId } from './domain/sequence'
import type { ProteinBond, ProteinBondEndpoint, ProteinBondType, ProteinDocumentData } from './domain/types'

const bondTypes: ProteinBondType[] = ['disulfide', 'thioether', 'thiolester', 'cross-link', 'other']

function cloneProteinData(data: ProteinDocumentData | undefined): ProteinDocumentData {
  return {
    numberingStart: data?.numberingStart ?? 1,
    numberingRegions: (data?.numberingRegions ?? []).map((region) => ({ ...region })),
    bonds: (data?.bonds ?? []).map((bond) => ({
      ...bond,
      endpoints: [{ ...bond.endpoints[0] }, { ...bond.endpoints[1] }],
    })),
    comparisonSources: (data?.comparisonSources ?? []).map((source) => ({
      ...source,
      disabledFrameShiftKeys: [...(source.disabledFrameShiftKeys ?? [])],
    })),
    comparisonVariableRegions: (data?.comparisonVariableRegions ?? []).map((region) => ({ ...region })),
    sourceDatabase: data?.sourceDatabase,
    sourceAccession: data?.sourceAccession,
    retrievedAt: data?.retrievedAt,
    translationDerivation: data?.translationDerivation,
  }
}

function updateBondEndpoint(
  bond: ProteinBond,
  endpointIndex: 0 | 1,
  patch: Partial<ProteinBondEndpoint>,
): ProteinBond {
  const endpoints: [ProteinBondEndpoint, ProteinBondEndpoint] = [
    { ...bond.endpoints[0] },
    { ...bond.endpoints[1] },
  ]
  endpoints[endpointIndex] = { ...endpoints[endpointIndex], ...patch }
  if (!endpoints[endpointIndex].chainId) delete endpoints[endpointIndex].chainId
  return { ...bond, endpoints }
}

export function ProteinPropertiesDialog({
  data,
  sequenceLength,
  selectedRange,
  onCancel,
  onSave,
}: {
  data: ProteinDocumentData | undefined
  sequenceLength: number
  selectedRange?: { start: number; end: number } | null
  onCancel: () => void
  onSave: (data: ProteinDocumentData) => void
}) {
  const [draft, setDraft] = useState(() => cloneProteinData(data))
  const maxLocalResidue = Math.max(1, sequenceLength)

  function updateBond(bondId: string, updater: (bond: ProteinBond) => ProteinBond) {
    setDraft((current) => ({
      ...current,
      bonds: current.bonds.map((bond) => bond.id === bondId ? updater(bond) : bond),
    }))
  }

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onCancel}>
      <div
        className="translation-dialog protein-properties-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="protein-properties-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="protein-properties-title">Protein Properties</h3>

        <section className="protein-properties-section">
          <h4>Source and numbering</h4>
          <div className="protein-properties-grid">
            <label>
              <span>Source database</span>
              <input value={draft.sourceDatabase ?? ''} placeholder="UniProt" onChange={(event) => setDraft({ ...draft, sourceDatabase: event.target.value })} />
            </label>
            <label>
              <span>Accession</span>
              <input value={draft.sourceAccession ?? ''} placeholder="P12345" onChange={(event) => setDraft({ ...draft, sourceAccession: event.target.value })} />
            </label>
            <label>
              <span>Retrieved</span>
              <input type="date" value={draft.retrievedAt?.slice(0, 10) ?? ''} onChange={(event) => setDraft({ ...draft, retrievedAt: event.target.value })} />
            </label>
            <label>
              <span>Number of first residue</span>
              <input type="number" value={draft.numberingStart} onChange={(event) => setDraft({ ...draft, numberingStart: Number(event.target.value) })} />
            </label>
          </div>
        </section>

        <section className="protein-properties-section">
          <div className="protein-properties-section-heading">
            <div>
              <h4>Numbering regions</h4>
              <p>Override displayed residue numbers for non-overlapping sequence ranges.</p>
            </div>
            <button
              type="button"
              onClick={() => setDraft((current) => ({
                ...current,
                numberingRegions: [...current.numberingRegions, {
                  id: createId('protein-numbering'),
                  name: 'Mature chain',
                  sequenceStart: 0,
                  sequenceEnd: Math.max(1, Math.min(sequenceLength, 10)),
                  startAt: 1,
                }],
              }))}
              disabled={sequenceLength === 0}
            >
              <Plus size={14} /> Add region
            </button>
          </div>
          {draft.numberingRegions.length === 0 ? (
            <p className="muted">No regional numbering overrides.</p>
          ) : (
            <div className="protein-properties-list">
              {draft.numberingRegions.map((region) => (
                <div className="protein-numbering-row" key={region.id}>
                  <input aria-label="Region name" value={region.name ?? ''} onChange={(event) => setDraft((current) => ({
                    ...current,
                    numberingRegions: current.numberingRegions.map((candidate) => candidate.id === region.id ? { ...candidate, name: event.target.value } : candidate),
                  }))} />
                  <label><span>Sequence</span><input type="number" min={1} max={maxLocalResidue} value={region.sequenceStart + 1} onChange={(event) => setDraft((current) => ({
                    ...current,
                    numberingRegions: current.numberingRegions.map((candidate) => candidate.id === region.id ? { ...candidate, sequenceStart: Number(event.target.value) - 1 } : candidate),
                  }))} /></label>
                  <span>to</span>
                  <input aria-label="Region end" type="number" min={1} max={maxLocalResidue} value={region.sequenceEnd} onChange={(event) => setDraft((current) => ({
                    ...current,
                    numberingRegions: current.numberingRegions.map((candidate) => candidate.id === region.id ? { ...candidate, sequenceEnd: Number(event.target.value) } : candidate),
                  }))} />
                  <label><span>starts at</span><input type="number" value={region.startAt} onChange={(event) => setDraft((current) => ({
                    ...current,
                    numberingRegions: current.numberingRegions.map((candidate) => candidate.id === region.id ? { ...candidate, startAt: Number(event.target.value) } : candidate),
                  }))} /></label>
                  <button type="button" className="danger" title="Delete numbering region" onClick={() => setDraft((current) => ({ ...current, numberingRegions: current.numberingRegions.filter((candidate) => candidate.id !== region.id) }))}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="protein-properties-section">
          <div className="protein-properties-section-heading">
            <div>
              <h4>Bonds</h4>
              <p>Leave Chain blank for this protein; enter a chain ID for an external endpoint.</p>
            </div>
            <button
              type="button"
              disabled={sequenceLength === 0}
              onClick={() => {
                const [startResidue, endResidue] = defaultProteinBondResidues(sequenceLength, selectedRange)
                setDraft((current) => ({
                  ...current,
                  bonds: [...current.bonds, {
                    id: createId('protein-bond'),
                    name: 'Disulfide bond',
                    type: 'disulfide',
                    endpoints: [{ residue: startResidue }, { residue: endResidue }],
                  }],
                }))
              }}
            >
              <Plus size={14} /> Add bond
            </button>
          </div>
          {draft.bonds.length === 0 ? (
            <p className="muted">No bonds defined.</p>
          ) : (
            <div className="protein-properties-list">
              {draft.bonds.map((bond) => (
                <div className="protein-bond-editor" key={bond.id}>
                  <div className="protein-bond-editor-heading">
                    <input aria-label="Bond name" value={bond.name} onChange={(event) => updateBond(bond.id, (current) => ({ ...current, name: event.target.value }))} />
                    <select aria-label="Bond type" value={bond.type} onChange={(event) => updateBond(bond.id, (current) => ({ ...current, type: event.target.value as ProteinBondType }))}>
                      {bondTypes.map((type) => <option value={type} key={type}>{proteinBondTypeLabel(type)}</option>)}
                    </select>
                    <button type="button" className="danger" title="Delete bond" onClick={() => setDraft((current) => ({ ...current, bonds: current.bonds.filter((candidate) => candidate.id !== bond.id) }))}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="protein-bond-endpoints">
                    {bond.endpoints.map((endpoint, endpointIndex) => (
                      <div key={endpointIndex}>
                        <strong>Endpoint {endpointIndex + 1}</strong>
                        <label><span>Chain</span><input value={endpoint.chainId ?? ''} placeholder="This protein" onChange={(event) => updateBond(bond.id, (current) => updateBondEndpoint(current, endpointIndex as 0 | 1, { chainId: event.target.value }))} /></label>
                        <label><span>Residue</span><input type="number" min={1} max={endpoint.chainId ? undefined : maxLocalResidue} value={endpoint.residue + 1} onChange={(event) => updateBond(bond.id, (current) => updateBondEndpoint(current, endpointIndex as 0 | 1, { residue: Math.max(0, Number(event.target.value) - 1) }))} /></label>
                      </div>
                    ))}
                  </div>
                  <label className="protein-bond-notes"><span>Notes</span><input value={bond.notes ?? ''} onChange={(event) => updateBond(bond.id, (current) => ({ ...current, notes: event.target.value }))} /></label>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="translation-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="primary" onClick={() => onSave(normalizeProteinDocumentData(draft, sequenceLength))}>Save</button>
        </div>
      </div>
    </div>
  )
}
