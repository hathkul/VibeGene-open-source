import { useMemo, useState } from 'react'
import {
  buildDnaHistoryRetentionPolicy,
  type AncestorTraceRetention,
  type DnaHistoryRetentionMode,
  type HistoryRetentionPolicy,
} from './domain/historyRetention'
import { previewHistoryTrim } from './domain/historyRetentionPreview'
import {
  readHistoryRetentionDefaults,
  writeHistoryRetentionDefaults,
} from './domain/historyRetentionPreferences'
import type { SequenceRecord } from './domain/types'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function retentionDescription(mode: DnaHistoryRetentionMode) {
  if (mode === 'generations') return 'Keep the current construct and the requested number of parent generations.'
  if (mode === 'tree-only') return 'Keep the complete visible ancestry tree, but remove decoded sequence snapshots from its nodes.'
  if (mode === 'current-only') return 'Keep only the current history root. Parent constructs and duplicate root sequence data are removed.'
  return 'Keep the complete ancestry tree and all decoded sequence snapshots.'
}

export function HistoryManagerDialog({
  record,
  onCancel,
  onApply,
}: {
  record: SequenceRecord
  onCancel: () => void
  onApply: (policy: HistoryRetentionPolicy) => void
}) {
  const [defaults] = useState(readHistoryRetentionDefaults)
  const [mode, setMode] = useState<DnaHistoryRetentionMode>(defaults.nativeMode)
  const [generations, setGenerations] = useState(defaults.nativeGenerations)
  const [clearOperationLog, setClearOperationLog] = useState(defaults.clearOperationLog)
  const [traceMode, setTraceMode] = useState<AncestorTraceRetention['mode']>(defaults.traceMode)
  const [traceGenerations, setTraceGenerations] = useState(defaults.traceGenerations)
  const [rememberDefaults, setRememberDefaults] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const policy = useMemo(
    () => buildDnaHistoryRetentionPolicy(
      mode,
      generations,
      clearOperationLog,
      traceMode,
      traceGenerations,
    ),
    [clearOperationLog, generations, mode, traceGenerations, traceMode],
  )
  const preview = useMemo(() => previewHistoryTrim(record, policy), [policy, record])
  const removed = preview.removed
  const savedBytes = Math.max(0, -preview.serializedByteDelta)

  function changeMode(next: DnaHistoryRetentionMode) {
    setMode(next)
    setConfirming(false)
  }

  function apply() {
    if (rememberDefaults) {
      writeHistoryRetentionDefaults({
        ...readHistoryRetentionDefaults(),
        nativeMode: mode,
        nativeGenerations: generations,
        traceMode,
        traceGenerations,
        clearOperationLog,
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
        aria-labelledby="history-manager-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="history-manager-title">Manage History</h3>
        <p className="history-manager-intro">
          Choose how much ancestry to retain for <strong>{record.name}</strong>. Applying a change is undoable until the document is closed.
        </p>

        {!confirming ? (
          <>
            <label className="history-manager-field">
              <span>{record.molecule === 'rna' ? 'RNA ancestry' : 'DNA ancestry'}</span>
              <select
                aria-label={`${record.molecule === 'rna' ? 'RNA' : 'DNA'} ancestry retention`}
                value={mode}
                onChange={(event) => changeMode(event.target.value as DnaHistoryRetentionMode)}
              >
                <option value="complete">Keep complete history</option>
                <option value="generations">Keep last N generations</option>
                <option value="tree-only">Keep tree without sequence snapshots</option>
                <option value="current-only">Keep current construct only</option>
              </select>
            </label>
            {mode === 'generations' && (
              <label className="history-manager-field history-manager-generation-field">
                <span>Parent generations</span>
                <input
                  aria-label="Parent generations"
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
            <label className="history-manager-field">
              <span>Ancestor sequencing traces</span>
              <select
                aria-label="Ancestor trace retention"
                value={traceMode}
                onChange={(event) => {
                  setTraceMode(event.target.value as AncestorTraceRetention['mode'])
                  setConfirming(false)
                }}
              >
                <option value="complete">Keep all ancestor traces</option>
                <option value="generations">Keep traces through last N generations</option>
                <option value="remove">Remove all ancestor traces</option>
              </select>
            </label>
            {traceMode === 'generations' && (
              <label className="history-manager-field history-manager-generation-field">
                <span>Trace parent generations</span>
                <input
                  aria-label="Trace parent generations"
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
            <p className="history-manager-description">
              {traceMode === 'generations'
                ? 'Traces older than the requested number of parent generations are removed; other ancestor data is retained.'
                : traceMode === 'remove'
                  ? 'Remove embedded traces from every retained ancestor record.'
                  : `Keep all ${preview.before.nativeAncestorTraces.traceCount} embedded ancestor traces (${formatBytes(preview.before.nativeAncestorTraces.packetBytes)}).`}
            </p>
            <label className="history-manager-checkbox">
              <input
                type="checkbox"
                aria-label="Clear operation log"
                checked={clearOperationLog}
                onChange={(event) => {
                  setClearOperationLog(event.target.checked)
                  setConfirming(false)
                }}
              />
              <span>Also clear the lightweight operation log ({record.operations.length})</span>
            </label>
            <label className="history-manager-checkbox">
              <input
                type="checkbox"
                aria-label="Remember DNA history defaults"
                checked={rememberDefaults}
                onChange={(event) => setRememberDefaults(event.target.checked)}
              />
              <span>Use these choices as the default for future history trimming</span>
            </label>

            <section className="history-manager-preview" aria-label="History trim preview">
              <h4>Preview</h4>
              <div className="history-manager-metrics">
                <span>History nodes</span>
                <strong>{preview.before.nativeHistory.nodeCount} → {preview.after.nativeHistory.nodeCount}</strong>
                <span>Ancestor generations</span>
                <strong>{preview.before.nativeHistory.ancestorGenerations} → {preview.after.nativeHistory.ancestorGenerations}</strong>
                <span>Decoded history bases</span>
                <strong>{preview.before.nativeHistory.decodedSequenceBases.toLocaleString()} → {preview.after.nativeHistory.decodedSequenceBases.toLocaleString()}</strong>
                <span>Embedded ancestor traces</span>
                <strong>{preview.before.nativeAncestorTraces.traceCount} → {preview.after.nativeAncestorTraces.traceCount}</strong>
                <span>Ancestor trace data</span>
                <strong>{formatBytes(preview.before.nativeAncestorTraces.packetBytes)} → {formatBytes(preview.after.nativeAncestorTraces.packetBytes)}</strong>
                <span>Operation entries</span>
                <strong>{preview.before.operationCount} → {preview.after.operationCount}</strong>
                <span>Estimated VibeGene project size</span>
                <strong>{formatBytes(preview.before.serializedBytes)} → {formatBytes(preview.after.serializedBytes)}</strong>
              </div>
              {!preview.changed ? (
                <p className="history-manager-no-change">This policy would not change the construct.</p>
              ) : (
                <p className="history-manager-saving">
                  Removes {removed.nativeHistoryNodes} history node{removed.nativeHistoryNodes === 1 ? '' : 's'}, {' '}
                  {removed.nativeDecodedSequenceBases.toLocaleString()} decoded base{removed.nativeDecodedSequenceBases === 1 ? '' : 's'}, and {' '}
                  {removed.nativeAncestorTraces} embedded trace{removed.nativeAncestorTraces === 1 ? '' : 's'}, and {' '}
                  {removed.operations} operation entr{removed.operations === 1 ? 'y' : 'ies'}.
                  {savedBytes > 0 ? ` Estimated saving: ${formatBytes(savedBytes)}.` : ''}
                </p>
              )}
            </section>

            <div className="translation-dialog-footer">
              <button type="button" onClick={onCancel}>Cancel</button>
              <button
                type="button"
                className="primary"
                disabled={!preview.changed}
                onClick={() => setConfirming(true)}
              >
                Review changes
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="history-manager-confirmation" role="alert">
              <strong>Trim this construct’s history?</strong>
              <p>
                This removes {removed.nativeHistoryNodes} history node{removed.nativeHistoryNodes === 1 ? '' : 's'} and {' '}
                {removed.nativeDecodedSequenceBases.toLocaleString()} decoded base{removed.nativeDecodedSequenceBases === 1 ? '' : 's'}.
                {removed.nativeAncestorTraces > 0
                  ? ` It also permanently removes ${removed.nativeAncestorTraces} embedded ancestor trace${removed.nativeAncestorTraces === 1 ? '' : 's'} (${formatBytes(removed.nativeAncestorTraceBytes)}).`
                  : ''}
                {removed.operations > 0 ? ` It also clears ${removed.operations} operation entries.` : ''}
              </p>
              <p>You can use Undo immediately afterward, but saved or exported copies will contain the trimmed history.</p>
            </div>
            <div className="translation-dialog-footer">
              <button type="button" onClick={() => setConfirming(false)}>Back</button>
              <div className="translation-actions">
                <button type="button" onClick={onCancel}>Cancel</button>
                <button type="button" className="danger" onClick={apply}>Trim history</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
