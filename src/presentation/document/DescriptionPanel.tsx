import { useLayoutEffect, useMemo, useRef } from 'react'
import { Trash2 } from 'lucide-react'
import { OtherOpenTabsPanel } from '../../components/OtherOpenTabsPanel'
import { type OpenTabSummary, type SharedFragment } from '../../crossTab/types'
import { type SequenceRecord } from '../../domain/types'
import { laboratoryHostGroups, methylationForStrain, normalizeConstructProperties, normalizeSequenceRecord, sequenceClassOptions, transformationStrainOptions } from '../../domain/constructProperties'
import { formatSequenceLength } from '../../domain/moleculeCapabilities'
import { nowIso } from '../../domain/sequence'
import { normalizeConstructFileName } from '../../domain/constructFileName'
import type { StoredProjectSummary } from '../../application/ports/projectPersistence'
function AutoGrowTextarea({
  value,
  onChange,
  minRows = 3,
  className,
}: {
  value: string
  onChange: (value: string) => void
  minRows?: number
  className?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    element.style.height = 'auto'
    const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight) || 18
    const minHeight = lineHeight * minRows + 16
    element.style.height = `${Math.max(minHeight, element.scrollHeight)}px`
  }, [minRows, value])

  return (
    <textarea
      ref={ref}
      className={className ? `auto-grow-textarea ${className}` : 'auto-grow-textarea'}
      value={value}
      rows={minRows}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

export function DescriptionPanel({
  record,
  otherOpenTabs,
  pendingSharedFragment,
  canInsertSharedFragment,
  canShareSelectionToOtherTabs,
  onRecordChange,
  onShareSelectionToOtherTabs,
  onLoadOpenTab,
  onUnloadOpenTab,
  onUnloadOrphanedTabs,
  onInsertSharedFragment,
  onDismissSharedFragment,
  isNativeDesktop,
  projects,
  onLoadProject,
  onDeleteProject,
}: {
  record: SequenceRecord
  otherOpenTabs: OpenTabSummary[]
  pendingSharedFragment: SharedFragment | null
  canInsertSharedFragment: boolean
  canShareSelectionToOtherTabs: boolean
  onRecordChange: (updater: (current: SequenceRecord) => SequenceRecord) => void
  onShareSelectionToOtherTabs: () => void
  onLoadOpenTab: (tabId: string) => void
  onUnloadOpenTab: (tabId: string) => void
  onUnloadOrphanedTabs: () => void
  onInsertSharedFragment: () => void
  onDismissSharedFragment: () => void
  isNativeDesktop: boolean
  projects?: StoredProjectSummary[]
  onLoadProject?: (project: StoredProjectSummary) => void
  onDeleteProject?: (project: StoredProjectSummary) => void
}) {
  const construct = record.construct
  const hostGroups = useMemo(() => laboratoryHostGroups(), [])

  function updateConstruct(patch: Partial<typeof construct>) {
    onRecordChange((current) =>
      normalizeSequenceRecord({
        ...current,
        construct: normalizeConstructProperties({ ...current.construct, ...patch }),
        updatedAt: nowIso(),
      }),
    )
  }

  function updateProtein(patch: Partial<NonNullable<SequenceRecord['protein']>>) {
    onRecordChange((current) => ({
      ...current,
      protein: { ...current.protein!, ...patch },
      updatedAt: nowIso(),
    }))
  }

  function setTransformationStrain(strainId: string) {
    updateConstruct({
      bacterialTransformationStrain: strainId || null,
      hostMethylation: methylationForStrain(strainId),
    })
  }

  function organismSelect(value: string | null, onChange: (next: string | null) => void, label: string) {
    return (
      <label>
        {label}
        <select value={value ?? ''} onChange={(event) => onChange(event.target.value || null)}>
          {[...hostGroups.entries()].map(([group, options]) => (
            <optgroup key={group} label={group}>
              {options.map((option) => (
                <option key={option.value || 'unspecified'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
    )
  }

  return (
    <aside className="description-panel" aria-label="Document description">
      <label>
        Name
        <input
          type="text"
          value={record.name}
          onChange={(event) =>
            onRecordChange((current) => ({
              ...current,
              name: event.target.value,
              updatedAt: nowIso(),
            }))
          }
          onBlur={(event) => {
            const next = record.molecule === 'dna'
              ? normalizeConstructFileName(event.target.value)
              : event.target.value.trim() || 'Untitled'
            if (next === record.name) return
            onRecordChange((current) => ({
              ...current,
              name: next,
              updatedAt: nowIso(),
            }))
          }}
          placeholder="Untitled"
        />
      </label>

      {record.molecule === 'dna' && (
        <div className="description-dna-metadata">
      <label>
        DNA type
        <select
          value={construct.syntheticDna ? 'synthetic' : 'natural'}
          onChange={(event) => updateConstruct({ syntheticDna: event.target.value === 'synthetic' })}
        >
          <option value="synthetic">Synthetic DNA</option>
          <option value="natural">Natural DNA</option>
        </select>
      </label>

      <label className="checkbox-line">
        <input
          type="checkbox"
          checked={construct.confirmedExperimentally}
          onChange={(event) => updateConstruct({ confirmedExperimentally: event.target.checked })}
        />
        Confirmed experimentally
      </label>

      {construct.syntheticDna ? (
        <>
          {organismSelect(
            construct.laboratoryHostOrganism,
            (next) => updateConstruct({ laboratoryHostOrganism: next }),
            'Laboratory Host Organism',
          )}

          <label>
            Bacterial Transformation Strain
            <select
              value={construct.bacterialTransformationStrain ?? ''}
              onChange={(event) => setTransformationStrain(event.target.value)}
            >
              {transformationStrainOptions.map((strain) => (
                <option key={strain.id || 'unspecified'} value={strain.id}>
                  {strain.label}
                </option>
              ))}
            </select>
          </label>

          <div className="panel-section construct-methylation-panel">
            <strong>Methylation</strong>
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={construct.hostMethylation.dam}
                onChange={(event) =>
                  updateConstruct({
                    hostMethylation: { ...construct.hostMethylation, dam: event.target.checked },
                  })
                }
              />
              Dam+
            </label>
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={construct.hostMethylation.dcm}
                onChange={(event) =>
                  updateConstruct({
                    hostMethylation: { ...construct.hostMethylation, dcm: event.target.checked },
                  })
                }
              />
              Dcm+
            </label>
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={construct.hostMethylation.ecoKI}
                onChange={(event) =>
                  updateConstruct({
                    hostMethylation: { ...construct.hostMethylation, ecoKI: event.target.checked },
                  })
                }
              />
              EcoKI+
            </label>
          </div>
        </>
      ) : (
        <>
          {organismSelect(
            construct.sourceOrganism,
            (next) => updateConstruct({ sourceOrganism: next }),
            'Source Organism',
          )}

          <label>
            Sequence Class
            <select
              value={construct.sequenceClass}
              onChange={(event) => updateConstruct({ sequenceClass: event.target.value })}
            >
              {sequenceClassOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

        </div>
      )}

      {record.molecule === 'protein' && (
        <div className="description-protein-metadata">
          <div className="description-field-row">
            <label>
              Source database
              <input
                value={record.protein?.sourceDatabase ?? ''}
                placeholder="UniProt"
                onChange={(event) => updateProtein({ sourceDatabase: event.target.value || undefined })}
              />
            </label>
            <label>
              Source accession
              <input
                value={record.protein?.sourceAccession ?? ''}
                placeholder="P12345"
                onChange={(event) => updateProtein({ sourceAccession: event.target.value || undefined })}
              />
            </label>
          </div>
          <div className="description-field-row">
            <label>
              Retrieved
              <input
                type="date"
                value={record.protein?.retrievedAt?.slice(0, 10) ?? ''}
                onChange={(event) => updateProtein({ retrievedAt: event.target.value || undefined })}
              />
            </label>
            <label>
              Number of first residue
              <input
                type="number"
                value={record.protein?.numberingStart ?? 1}
                onChange={(event) => updateProtein({ numberingStart: Number(event.target.value) })}
              />
            </label>
          </div>
        </div>
      )}

      <label>
        Description
        <textarea
          value={record.description}
          onChange={(event) =>
            onRecordChange((current) => ({ ...current, description: event.target.value, updatedAt: nowIso() }))
          }
          rows={4}
        />
      </label>

      <div className="metadata-grid">
        <span>Created:</span>
        <strong>{new Date(record.createdAt).toLocaleDateString()}</strong>
        <span>Last Modified:</span>
        <strong>{new Date(record.updatedAt).toLocaleDateString()}</strong>
        <span>Molecule:</span>
        <strong>{record.molecule}</strong>
        <span>Topology:</span>
        <strong>{record.topology}</strong>
        <span>Length:</span>
        <strong>{formatSequenceLength(record.sequence.length, record.molecule)}</strong>
        {record.externalSource && (
          <>
            <span>Database record:</span>
            <strong>
              {record.externalSource.provider.toUpperCase()} {record.externalSource.accession}
              {record.externalSource.assembly ? ` · ${record.externalSource.assembly}` : ''}
            </strong>
            <span>Retrieved:</span>
            <strong>{new Date(record.externalSource.retrievedAt).toLocaleDateString()}</strong>
          </>
        )}
        {record.molecule === 'protein' && (
          <>
            <span>Protein source:</span>
            <strong>{[record.protein?.sourceDatabase, record.protein?.sourceAccession].filter(Boolean).join(' ') || '—'}</strong>
            <span>Annotations:</span>
            <strong>{record.features.length.toLocaleString()} features · {(record.protein?.bonds.length ?? 0).toLocaleString()} bonds</strong>
          </>
        )}
      </div>

      {record.molecule !== 'protein' && <div className="description-field-row">
        <label>
          Accession number
          <input
            value={construct.accessionNumber}
            onChange={(event) => updateConstruct({ accessionNumber: event.target.value })}
          />
        </label>
        <label>
          Code number
          <input
            value={construct.codeNumber}
            onChange={(event) => updateConstruct({ codeNumber: event.target.value })}
          />
        </label>
      </div>}

      <label>
        Sequence Author
        <input
          value={construct.sequenceAuthor}
          onChange={(event) => updateConstruct({ sequenceAuthor: event.target.value })}
        />
      </label>

      <label>
        Comments
        <AutoGrowTextarea
          value={construct.comments}
          onChange={(next) => updateConstruct({ comments: next })}
          minRows={4}
        />
      </label>

      <label>
        References
        <AutoGrowTextarea
          value={construct.references}
          onChange={(next) => updateConstruct({ references: next })}
          minRows={4}
        />
      </label>

      {!isNativeDesktop && (
        <OtherOpenTabsPanel
          otherTabs={otherOpenTabs}
          pendingFragment={pendingSharedFragment}
          canInsertFragment={canInsertSharedFragment}
          canShareSelection={canShareSelectionToOtherTabs}
          onShareSelection={onShareSelectionToOtherTabs}
          onLoadOpenTab={onLoadOpenTab}
          onUnloadOpenTab={onUnloadOpenTab}
          onUnloadOrphanedTabs={onUnloadOrphanedTabs}
          onInsertFragment={onInsertSharedFragment}
          onDismissFragment={onDismissSharedFragment}
        />
      )}

      {!isNativeDesktop && (
        <div className="panel-section">
          <h3>Recent files</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Organize files in <strong>Database</strong> (toolbar).
          </p>
          {(projects?.length ?? 0) === 0 && <p className="muted">No recent files yet.</p>}
          {(projects ?? []).slice(0, 10).map((project) => (
            <div className="project-row" key={project.id}>
              <button type="button" onClick={() => onLoadProject?.(project)}>
                {project.name}
                <span>{new Date(project.updatedAt).toLocaleString()}</span>
              </button>
              <button type="button" className="icon-button danger" aria-label={`Delete ${project.name}`} onClick={() => onDeleteProject?.(project)}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}
