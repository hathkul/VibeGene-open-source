import { useEffect, useMemo, useState } from 'react'
import {
  buildDnaHistoryRetentionPolicy,
  buildProteinSourceHistoryRetentionPolicy,
  type AncestorTraceRetention,
  type DnaHistoryRetentionMode,
  type HistoryRetentionPolicy,
  type ProteinSourceDnaRetentionMode,
} from './domain/historyRetention'
import { previewHistoryTrimBatch } from './domain/historyRetentionPreview'
import {
  readHistoryRetentionDefaults,
  writeHistoryRetentionDefaults,
} from './domain/historyRetentionPreferences'
import {
  proteinSourceReferenceStatusLabel,
  verifyProteinSourceReferences,
  type ProteinSourceReferenceVerification,
} from './domain/proteinSourceReferenceVerification'
import type { SequenceRecord } from './domain/types'

export type DatabaseHistoryBatchResult = {
  trimmedNames: string[]
  failures: Array<{ name: string; error: string }>
}

export type DatabaseHistoryBatchApplyOptions = {
  recoveryDays: number
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function buildBatchPolicy(
  nativeMode: DnaHistoryRetentionMode,
  nativeGenerations: number,
  sourceMode: ProteinSourceDnaRetentionMode,
  sourceGenerations: number,
  traceMode: AncestorTraceRetention['mode'],
  traceGenerations: number,
  clearOperationLog: boolean,
): HistoryRetentionPolicy {
  const nativePolicy = buildDnaHistoryRetentionPolicy(
    nativeMode,
    nativeGenerations,
    clearOperationLog,
    traceMode,
    traceGenerations,
  )
  const sourcePolicy = buildProteinSourceHistoryRetentionPolicy(
    sourceMode,
    sourceGenerations,
    traceMode,
    traceGenerations,
  )
  return {
    ...nativePolicy,
    translationSources: sourcePolicy.translationSources,
  }
}

export function DatabaseHistoryBatchDialog({
  records,
  busy,
  result,
  containsOpenRecord = false,
  onLoadProject,
  onCancel,
  onApply,
}: {
  records: SequenceRecord[]
  busy: boolean
  result?: DatabaseHistoryBatchResult | null
  containsOpenRecord?: boolean
  onLoadProject?: (projectId: string) => Promise<SequenceRecord | null>
  onCancel: () => void
  onApply: (policy: HistoryRetentionPolicy, options: DatabaseHistoryBatchApplyOptions) => void
}) {
  const [defaults] = useState(readHistoryRetentionDefaults)
  const [nativeMode, setNativeMode] = useState<DnaHistoryRetentionMode>(defaults.nativeMode)
  const [nativeGenerations, setNativeGenerations] = useState(defaults.nativeGenerations)
  const [sourceMode, setSourceMode] = useState<ProteinSourceDnaRetentionMode>(defaults.sourceMode)
  const [sourceGenerations, setSourceGenerations] = useState(defaults.sourceGenerations)
  const [traceMode, setTraceMode] = useState<AncestorTraceRetention['mode']>(defaults.traceMode)
  const [traceGenerations, setTraceGenerations] = useState(defaults.traceGenerations)
  const [clearOperationLog, setClearOperationLog] = useState(defaults.clearOperationLog)
  const [recoveryDays, setRecoveryDays] = useState(defaults.recoveryDays)
  const [rememberDefaults, setRememberDefaults] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [referenceVerification, setReferenceVerification] = useState<
    ProteinSourceReferenceVerification[] | 'loading' | null
  >(defaults.sourceMode === 'reference-only' ? 'loading' : null)
  const proteinCount = records.filter((record) => record.molecule === 'protein').length
  const proteinSources = useMemo(
    () => records.flatMap((record) => record.protein?.translationDerivation?.sources ?? []),
    [records],
  )
  const policy = useMemo(
    () => buildBatchPolicy(
      nativeMode,
      nativeGenerations,
      sourceMode,
      sourceGenerations,
      traceMode,
      traceGenerations,
      clearOperationLog,
    ),
    [
      clearOperationLog,
      nativeGenerations,
      nativeMode,
      sourceGenerations,
      sourceMode,
      traceGenerations,
      traceMode,
    ],
  )
  const preview = useMemo(() => previewHistoryTrimBatch(records, policy), [policy, records])
  const removed = preview.removed
  const savedBytes = Math.max(0, -preview.serializedByteDelta)
  const removedNodes = removed.nativeHistoryNodes + removed.embeddedHistoryNodes
  const removedBases = removed.nativeDecodedSequenceBases + removed.embeddedDecodedSequenceBases
  const removedTraces = removed.nativeAncestorTraces + removed.embeddedAncestorTraces
  const removedTraceBytes = removed.nativeAncestorTraceBytes + removed.embeddedAncestorTraceBytes
  const referencesVerified = referenceVerification !== 'loading'
    && referenceVerification !== null
    && referenceVerification.every((entry) => entry.status === 'verified')

  useEffect(() => {
    if (sourceMode !== 'reference-only') {
      return
    }
    let cancelled = false
    if (!onLoadProject) {
      void Promise.resolve().then(() => {
        if (!cancelled) setReferenceVerification(proteinSources.map((source, index) => ({
          key: `${source.projectId ?? source.projectName ?? 'source'}#${index}`,
          ...(source.projectId ? { projectId: source.projectId } : {}),
          projectName: source.projectName || 'Source DNA',
          status: 'missing' as const,
        })))
      })
      return () => { cancelled = true }
    }
    void verifyProteinSourceReferences(proteinSources, onLoadProject).then((verification) => {
      if (!cancelled) setReferenceVerification(verification)
    })
    return () => { cancelled = true }
  }, [onLoadProject, proteinSources, sourceMode])

  function resetConfirmation() {
    setConfirming(false)
  }

  function apply() {
    if (rememberDefaults) {
      writeHistoryRetentionDefaults({
        nativeMode,
        nativeGenerations,
        sourceMode,
        sourceGenerations,
        traceMode,
        traceGenerations,
        clearOperationLog,
        recoveryDays,
      })
    }
    onApply(policy, { recoveryDays })
  }

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={() => !busy && onCancel()}>
      <div
        className="translation-dialog history-manager-dialog database-history-batch-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="database-history-batch-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="database-history-batch-title">Trim Database History</h3>
        <p className="history-manager-intro">
          Preview a retention policy across <strong>{records.length} selected file{records.length === 1 ? '' : 's'}</strong> before changing the database.
        </p>

        {result ? (
          <>
            <div className={result.failures.length ? 'history-manager-confirmation' : 'database-history-batch-success'} role="status">
              <strong>Batch trimming finished</strong>
              <p>{result.trimmedNames.length} file{result.trimmedNames.length === 1 ? '' : 's'} trimmed successfully.</p>
              {result.failures.map((failure) => <p key={failure.name}><b>{failure.name}:</b> {failure.error}</p>)}
            </div>
            <div className="translation-dialog-footer">
              <button type="button" className="primary" onClick={onCancel}>Close</button>
            </div>
          </>
        ) : !confirming ? (
          <>
            <div className="database-history-batch-controls">
              <label className="history-manager-field">
                <span>Construct ancestry</span>
                <select
                  aria-label="Batch construct ancestry retention"
                  value={nativeMode}
                  onChange={(event) => {
                    setNativeMode(event.target.value as DnaHistoryRetentionMode)
                    resetConfirmation()
                  }}
                >
                  <option value="complete">Keep complete history</option>
                  <option value="generations">Keep last N generations</option>
                  <option value="tree-only">Keep tree without sequence snapshots</option>
                  <option value="current-only">Keep current construct only</option>
                </select>
              </label>
              {nativeMode === 'generations' && (
                <label className="history-manager-field history-manager-generation-field">
                  <span>Parent generations</span>
                  <input
                    aria-label="Batch parent generations"
                    type="number"
                    min={0}
                    step={1}
                    value={nativeGenerations}
                    onChange={(event) => setNativeGenerations(Math.max(0, Math.floor(Number(event.target.value) || 0)))}
                  />
                </label>
              )}

              {proteinCount > 0 && (
                <>
                  <label className="history-manager-field">
                    <span>Protein source DNA</span>
                    <select
                      aria-label="Batch protein source DNA retention"
                      value={sourceMode}
                      onChange={(event) => {
                        const next = event.target.value as ProteinSourceDnaRetentionMode
                        setSourceMode(next)
                        setReferenceVerification(next === 'reference-only' ? 'loading' : null)
                        resetConfirmation()
                      }}
                    >
                      <option value="complete">Keep complete source DNA</option>
                      <option value="generations">Keep last N source generations</option>
                      <option value="current-dna">Keep current source DNA only</option>
                      <option value="cds-only">Keep translated CDS payload only</option>
                      <option value="reference-only">Keep database references only</option>
                      <option value="remove">Remove translation provenance</option>
                    </select>
                  </label>
                  {sourceMode === 'generations' && (
                    <label className="history-manager-field history-manager-generation-field">
                      <span>Source generations</span>
                      <input
                        aria-label="Batch source generations"
                        type="number"
                        min={0}
                        step={1}
                        value={sourceGenerations}
                        onChange={(event) => setSourceGenerations(Math.max(0, Math.floor(Number(event.target.value) || 0)))}
                      />
                    </label>
                  )}
                  {sourceMode === 'reference-only' && (
                    <section className="history-reference-verification" aria-label="Batch source reference verification">
                      <strong>Database reference verification</strong>
                      {referenceVerification === 'loading' && <p>Checking source records…</p>}
                      {Array.isArray(referenceVerification) && referenceVerification.map((entry) => (
                        <div key={entry.key} className={entry.status === 'verified' ? 'is-verified' : 'is-invalid'}>
                          <span>{entry.projectName}</span>
                          <strong>{proteinSourceReferenceStatusLabel(entry.status)}</strong>
                        </div>
                      ))}
                      {Array.isArray(referenceVerification) && !referencesVerified && (
                        <p>Reference-only trimming is blocked until every source resolves to the same DNA sequence.</p>
                      )}
                    </section>
                  )}
                </>
              )}

              <label className="history-manager-field">
                <span>Ancestor traces</span>
                <select
                  aria-label="Batch ancestor trace retention"
                  value={traceMode}
                  onChange={(event) => {
                    setTraceMode(event.target.value as AncestorTraceRetention['mode'])
                    resetConfirmation()
                  }}
                >
                  <option value="complete">Keep all ancestor traces</option>
                  <option value="generations">Keep traces through last N generations</option>
                  <option value="remove">Remove all ancestor traces</option>
                </select>
              </label>
              {traceMode === 'generations' && (
                <label className="history-manager-field history-manager-generation-field">
                  <span>Trace generations</span>
                  <input
                    aria-label="Batch trace generations"
                    type="number"
                    min={0}
                    step={1}
                    value={traceGenerations}
                    onChange={(event) => setTraceGenerations(Math.max(0, Math.floor(Number(event.target.value) || 0)))}
                  />
                </label>
              )}
              <label className="history-manager-checkbox">
                <input
                  type="checkbox"
                  aria-label="Batch clear operation logs"
                  checked={clearOperationLog}
                  onChange={(event) => {
                    setClearOperationLog(event.target.checked)
                    resetConfirmation()
                  }}
                />
                <span>Also clear lightweight operation logs</span>
              </label>
              <label className="history-manager-field history-manager-generation-field">
                <span>Recovery copy (days)</span>
                <input
                  aria-label="Batch history recovery days"
                  type="number"
                  min={0}
                  max={365}
                  step={1}
                  value={recoveryDays}
                  onChange={(event) => setRecoveryDays(Math.max(0, Math.min(365, Math.floor(Number(event.target.value) || 0))))}
                />
              </label>
              <label className="history-manager-checkbox">
                <input
                  type="checkbox"
                  aria-label="Remember database history defaults"
                  checked={rememberDefaults}
                  onChange={(event) => setRememberDefaults(event.target.checked)}
                />
                <span>Use these choices as the default for future history trimming</span>
              </label>
            </div>

            <section className="history-manager-preview" aria-label="Database history trim preview">
              <h4>Batch preview</h4>
              <div className="history-manager-metrics">
                <span>Files changed</span><strong>{preview.changedRecordCount} / {preview.recordCount}</strong>
                <span>History nodes removed</span><strong>{removedNodes.toLocaleString()}</strong>
                <span>Decoded history bases removed</span><strong>{removedBases.toLocaleString()}</strong>
                <span>Ancestor traces removed</span><strong>{removedTraces.toLocaleString()} ({formatBytes(removedTraceBytes)})</strong>
                <span>Embedded source DNA removed</span><strong>{removed.embeddedDnaSources.toLocaleString()}</strong>
                <span>CDS payloads removed</span><strong>{removed.cdsPayloads.toLocaleString()}</strong>
                <span>Operation entries removed</span><strong>{removed.operations.toLocaleString()}</strong>
                <span>Estimated project data</span><strong>{formatBytes(preview.beforeSerializedBytes)} → {formatBytes(preview.afterSerializedBytes)}</strong>
              </div>
              {!preview.changedRecordCount ? (
                <p className="history-manager-no-change">This policy would not change any selected file.</p>
              ) : (
                <p className="history-manager-saving">
                  Estimated retained-record saving: {formatBytes(savedBytes)}. Rewritten files also discard their cached original-file copy.
                </p>
              )}
            </section>

            <div className="database-history-batch-records" aria-label="Per-file history trim preview">
              {preview.records.map((recordPreview) => {
                const recordRemoved = recordPreview.removed
                const recordNodes = recordRemoved.nativeHistoryNodes + recordRemoved.embeddedHistoryNodes
                const recordTraces = recordRemoved.nativeAncestorTraces + recordRemoved.embeddedAncestorTraces
                return (
                  <div key={recordPreview.recordId} className={recordPreview.changed ? 'is-changed' : ''}>
                    <span title={recordPreview.recordName}>{recordPreview.recordName}</span>
                    <small>{recordPreview.molecule === 'protein' ? 'Protein' : recordPreview.molecule.toUpperCase()}</small>
                    <strong>{recordPreview.changed
                      ? `${recordNodes} nodes · ${recordTraces} traces · ${formatBytes(Math.max(0, -recordPreview.serializedByteDelta))}`
                      : 'No change'}</strong>
                  </div>
                )
              })}
            </div>

            <div className="translation-dialog-footer">
              <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
              <button
                type="button"
                className="primary"
                disabled={
                  busy
                  || preview.changedRecordCount === 0
                  || (sourceMode === 'reference-only' && !referencesVerified)
                }
                onClick={() => setConfirming(true)}
              >
                Review batch
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="history-manager-confirmation" role="alert">
              <strong>Trim history in {preview.changedRecordCount} database file{preview.changedRecordCount === 1 ? '' : 's'}?</strong>
              <p>This permanently removes the previewed ancestry and trace data from the saved database records.</p>
              {recoveryDays > 0
                ? <p>A recovery copy will be kept in this database for {recoveryDays} day{recoveryDays === 1 ? '' : 's'}. It uses storage until restored, deleted, or expired.</p>
                : <p>No recovery copy will be created. Export a database backup first if you may need the removed data.</p>}
              <p>Close or reload any selected constructs already open in other editor windows; saving an older in-memory copy can restore its untrimmed history.</p>
              {containsOpenRecord && (
                <p><strong>One selected file is currently open in this window.</strong></p>
              )}
            </div>
            <div className="translation-dialog-footer">
              <button type="button" disabled={busy} onClick={() => setConfirming(false)}>Back</button>
              <div className="translation-actions">
                <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
                <button type="button" className="danger" disabled={busy} onClick={apply}>
                  {busy ? 'Trimming…' : `Trim ${preview.changedRecordCount} file${preview.changedRecordCount === 1 ? '' : 's'}`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
