import { useEffect, useMemo, useState } from 'react'
import {
  buildProteinSourceHistoryRetentionPolicy,
  type AncestorTraceRetention,
  type HistoryRetentionPolicy,
  type ProteinSourceDnaRetentionMode,
} from './domain/historyRetention'
import { previewHistoryTrim } from './domain/historyRetentionPreview'
import {
  readHistoryRetentionDefaults,
  writeHistoryRetentionDefaults,
} from './domain/historyRetentionPreferences'
import {
  proteinSourceReferenceStatusLabel,
  verifyProteinSourceReferences,
  type ProteinSourceReferenceVerification,
} from './domain/proteinSourceReferenceVerification'
import type { ProteinTranslationSource, SequenceRecord } from './domain/types'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function retentionDescription(mode: ProteinSourceDnaRetentionMode) {
  if (mode === 'generations') return 'Keep each embedded source DNA construct and its requested number of parent generations.'
  if (mode === 'current-dna') return 'Keep each current source DNA sequence and CDS, but remove its ancestry.'
  if (mode === 'cds-only') return 'Keep the translated CDS sequence and translation settings, without a reopenable source DNA construct.'
  if (mode === 'reference-only') return 'Keep only source project names, IDs, and sequence digests. Reopening requires the corresponding database record.'
  if (mode === 'remove') return 'Remove all translation-source provenance from this protein.'
  return 'Keep portable source DNA constructs, complete ancestry, CDS payloads, and source references.'
}

function sourcePayload(source: ProteinTranslationSource) {
  if (source.sourceRecord) return 'Embedded source DNA'
  if (source.cds) return 'CDS payload only'
  return 'Reference only'
}

export function ProteinSourceHistoryDialog({
  record,
  onLoadProject,
  onCancel,
  onApply,
}: {
  record: SequenceRecord
  onLoadProject?: (projectId: string) => Promise<SequenceRecord | null>
  onCancel: () => void
  onApply: (policy: HistoryRetentionPolicy) => void
}) {
  const [defaults] = useState(readHistoryRetentionDefaults)
  const [mode, setMode] = useState<ProteinSourceDnaRetentionMode>(defaults.sourceMode)
  const [generations, setGenerations] = useState(defaults.sourceGenerations)
  const [traceMode, setTraceMode] = useState<AncestorTraceRetention['mode']>(defaults.traceMode)
  const [traceGenerations, setTraceGenerations] = useState(defaults.traceGenerations)
  const [rememberDefaults, setRememberDefaults] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [referenceVerification, setReferenceVerification] = useState<
    ProteinSourceReferenceVerification[] | 'loading' | null
  >(defaults.sourceMode === 'reference-only' ? 'loading' : null)
  const showAncestryControls = mode === 'complete' || mode === 'generations'
  const policy = useMemo(
    () => buildProteinSourceHistoryRetentionPolicy(
      mode,
      generations,
      traceMode,
      traceGenerations,
    ),
    [generations, mode, traceGenerations, traceMode],
  )
  const preview = useMemo(() => previewHistoryTrim(record, policy), [policy, record])
  const before = preview.before.translationProvenance
  const after = preview.after.translationProvenance
  const removed = preview.removed
  const savedBytes = Math.max(0, -preview.serializedByteDelta)
  const sources = useMemo(
    () => record.protein?.translationDerivation?.sources ?? [],
    [record.protein?.translationDerivation?.sources],
  )
  const referencesVerified = referenceVerification !== 'loading'
    && referenceVerification !== null
    && referenceVerification.every((entry) => entry.status === 'verified')

  useEffect(() => {
    if (mode !== 'reference-only') {
      return
    }
    let cancelled = false
    if (!onLoadProject) {
      void Promise.resolve().then(() => {
        if (!cancelled) setReferenceVerification(sources.map((source, index) => ({
          key: `${source.projectId ?? source.projectName ?? 'source'}#${index}`,
          ...(source.projectId ? { projectId: source.projectId } : {}),
          projectName: source.projectName || 'Source DNA',
          status: 'missing' as const,
        })))
      })
      return () => { cancelled = true }
    }
    void verifyProteinSourceReferences(sources, onLoadProject).then((result) => {
      if (!cancelled) setReferenceVerification(result)
    })
    return () => { cancelled = true }
  }, [mode, onLoadProject, sources])

  function changeMode(next: ProteinSourceDnaRetentionMode) {
    setMode(next)
    setReferenceVerification(next === 'reference-only' ? 'loading' : null)
    setConfirming(false)
  }

  function apply() {
    if (rememberDefaults) {
      writeHistoryRetentionDefaults({
        ...readHistoryRetentionDefaults(),
        sourceMode: mode,
        sourceGenerations: generations,
        traceMode,
        traceGenerations,
      })
    }
    onApply(policy)
  }

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onCancel}>
      <div
        className="translation-dialog history-manager-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="protein-source-history-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="protein-source-history-title">Manage Protein Source DNA</h3>
        <p className="history-manager-intro">
          Choose how much source-DNA provenance to retain in <strong>{record.name}</strong>. These settings apply to all translated-CDS sources in this protein.
        </p>

        {!confirming ? (
          <>
            <section className="protein-source-history-list" aria-label="Translation sources">
              {sources.map((source, index) => (
                <div key={`${source.projectId ?? source.projectName}-${index}`}>
                  <strong>{source.projectName || 'Source DNA'}</strong>
                  <span>{sourcePayload(source)}</span>
                </div>
              ))}
            </section>
            <label className="history-manager-field">
              <span>Source DNA retention</span>
              <select
                aria-label="Protein source DNA retention"
                value={mode}
                onChange={(event) => changeMode(event.target.value as ProteinSourceDnaRetentionMode)}
              >
                <option value="complete">Keep complete source DNA history</option>
                <option value="generations">Keep last N source generations</option>
                <option value="current-dna">Keep current source DNA only</option>
                <option value="cds-only">Keep translated CDS payload only</option>
                <option value="reference-only">Keep database reference only</option>
                <option value="remove">Remove all source provenance</option>
              </select>
            </label>
            {mode === 'generations' && (
              <label className="history-manager-field history-manager-generation-field">
                <span>Parent generations</span>
                <input
                  aria-label="Source DNA parent generations"
                  type="number"
                  min={0}
                  step={1}
                  value={generations}
                  onChange={(event) => {
                    setGenerations(Math.max(0, Math.floor(Number(event.target.value) || 0)))
                    setConfirming(false)
                  }}
                />
              </label>
            )}
            <p className="history-manager-description">{retentionDescription(mode)}</p>
            {mode === 'reference-only' && (
              <section className="history-reference-verification" aria-label="Source reference verification">
                <strong>Database reference verification</strong>
                {referenceVerification === 'loading' && <p>Checking source records…</p>}
                {Array.isArray(referenceVerification) && referenceVerification.map((entry) => (
                  <div key={entry.key} className={entry.status === 'verified' ? 'is-verified' : 'is-invalid'}>
                    <span>{entry.projectName}</span>
                    <strong>{proteinSourceReferenceStatusLabel(entry.status)}</strong>
                  </div>
                ))}
                {Array.isArray(referenceVerification) && !referencesVerified && (
                  <p>Reference-only trimming is blocked until every source ID resolves to the same DNA sequence.</p>
                )}
              </section>
            )}
            {showAncestryControls && (
              <>
                <label className="history-manager-field">
                  <span>Source ancestor traces</span>
                  <select
                    aria-label="Protein source ancestor trace retention"
                    value={traceMode}
                    onChange={(event) => {
                      setTraceMode(event.target.value as AncestorTraceRetention['mode'])
                      setConfirming(false)
                    }}
                  >
                    <option value="complete">Keep all source ancestor traces</option>
                    <option value="generations">Keep traces through last N generations</option>
                    <option value="remove">Remove all source ancestor traces</option>
                  </select>
                </label>
                {traceMode === 'generations' && (
                  <label className="history-manager-field history-manager-generation-field">
                    <span>Trace parent generations</span>
                    <input
                      aria-label="Source trace parent generations"
                      type="number"
                      min={0}
                      step={1}
                      value={traceGenerations}
                      onChange={(event) => {
                        setTraceGenerations(Math.max(0, Math.floor(Number(event.target.value) || 0)))
                        setConfirming(false)
                      }}
                    />
                  </label>
                )}
              </>
            )}
            <label className="history-manager-checkbox">
              <input
                type="checkbox"
                aria-label="Remember protein source history defaults"
                checked={rememberDefaults}
                onChange={(event) => setRememberDefaults(event.target.checked)}
              />
              <span>Use these choices as the default for future source-DNA trimming</span>
            </label>

            <section className="history-manager-preview" aria-label="Protein source history trim preview">
              <h4>Preview</h4>
              <div className="history-manager-metrics">
                <span>Translation sources</span><strong>{before.sourceCount} → {after.sourceCount}</strong>
                <span>Embedded source DNA</span><strong>{before.embeddedDnaSourceCount} → {after.embeddedDnaSourceCount}</strong>
                <span>Embedded DNA bases</span><strong>{before.embeddedDnaBases.toLocaleString()} → {after.embeddedDnaBases.toLocaleString()}</strong>
                <span>Source history nodes</span><strong>{before.embeddedDnaHistory.nodeCount} → {after.embeddedDnaHistory.nodeCount}</strong>
                <span>Source decoded history bases</span><strong>{before.embeddedDnaHistory.decodedSequenceBases.toLocaleString()} → {after.embeddedDnaHistory.decodedSequenceBases.toLocaleString()}</strong>
                <span>Source ancestor traces</span><strong>{before.embeddedDnaAncestorTraces.traceCount} → {after.embeddedDnaAncestorTraces.traceCount}</strong>
                <span>Source trace data</span><strong>{formatBytes(before.embeddedDnaAncestorTraces.packetBytes)} → {formatBytes(after.embeddedDnaAncestorTraces.packetBytes)}</strong>
                <span>CDS payloads</span><strong>{before.cdsPayloadCount} → {after.cdsPayloadCount}</strong>
                <span>Reference-only sources</span><strong>{before.referenceOnlySourceCount} → {after.referenceOnlySourceCount}</strong>
                <span>Estimated VibeGene project size</span><strong>{formatBytes(preview.before.serializedBytes)} → {formatBytes(preview.after.serializedBytes)}</strong>
              </div>
              {!preview.changed ? (
                <p className="history-manager-no-change">This policy would not change the protein.</p>
              ) : (
                <p className="history-manager-saving">
                  Removes {removed.embeddedDnaSources} embedded source{removed.embeddedDnaSources === 1 ? '' : 's'}, {removed.embeddedHistoryNodes} source history node{removed.embeddedHistoryNodes === 1 ? '' : 's'}, and {removed.embeddedAncestorTraces} source ancestor trace{removed.embeddedAncestorTraces === 1 ? '' : 's'}.
                  {savedBytes > 0 ? ` Estimated saving: ${formatBytes(savedBytes)}.` : ''}
                </p>
              )}
            </section>

            <div className="translation-dialog-footer">
              <button type="button" onClick={onCancel}>Cancel</button>
              <button
                type="button"
                className="primary"
                disabled={!preview.changed || (mode === 'reference-only' && !referencesVerified)}
                onClick={() => setConfirming(true)}
              >
                Review changes
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="history-manager-confirmation" role="alert">
              <strong>Trim this protein’s source DNA?</strong>
              <p>
                This removes {removed.embeddedDnaSources} embedded source DNA construct{removed.embeddedDnaSources === 1 ? '' : 's'}, {removed.embeddedHistoryNodes} source history node{removed.embeddedHistoryNodes === 1 ? '' : 's'}, and {removed.embeddedAncestorTraces} embedded trace{removed.embeddedAncestorTraces === 1 ? '' : 's'}.
              </p>
              {mode === 'reference-only' && <p>Reference-only sources can be reopened only while the corresponding database records remain available.</p>}
              {mode === 'remove' && <p>The source names, database references, CDS payloads, and translation provenance will all be removed.</p>}
              <p>You can use Undo immediately afterward, but saved or exported copies will contain only the retained source data.</p>
            </div>
            <div className="translation-dialog-footer">
              <button type="button" onClick={() => setConfirming(false)}>Back</button>
              <div className="translation-actions">
                <button type="button" onClick={onCancel}>Cancel</button>
                <button type="button" className="danger" onClick={apply}>Trim source DNA</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
