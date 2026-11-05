import { useEffect, useRef, useState } from 'react'
import {
  folderSyncConflictChoiceLabel,
  folderSyncIntentLabel,
  type FolderSyncConflictChoice,
} from '../../application/databaseManager/folderSyncPresentation'
import type {
  FolderSyncPreflightResolution,
  FolderSyncPreflightViewModel,
} from './folderSyncPreflightTypes'

export function FolderSyncPreflightDialog({
  model,
  busy,
  progress,
  onCancel,
  onApply,
}: {
  model: FolderSyncPreflightViewModel
  busy: boolean
  progress?: string | null
  onCancel: () => void
  onApply: (resolutions: FolderSyncPreflightResolution[]) => void | Promise<void>
}) {
  const [applying, setApplying] = useState(false)
  const applyStartedRef = useRef(false)
  const locked = busy || applying

  const choicesFor = (conflict: FolderSyncPreflightViewModel['conflicts'][number]) =>
    conflict.allowedChoices

  const [choices, setChoices] = useState<Record<string, FolderSyncConflictChoice>>(
    () => ({ ...model.initialChoices }),
  )
  const modelSessionRef = useRef<FolderSyncPreflightViewModel | null>(null)

  useEffect(() => {
    if (modelSessionRef.current === model) return
    modelSessionRef.current = model
    setChoices({ ...model.initialChoices })
  }, [model])

  const resolvable = model.conflicts.filter((conflict) => choicesFor(conflict).length > 0)
  const unsupported = model.conflicts.filter(
    (conflict) => choicesFor(conflict).length === 0,
  )
  const unresolved = resolvable.filter((conflict) => !choices[conflict.id])
  // Unsupported collisions are reported as unresolved by the service, but
  // they must not block safe, independently resolved writes and updates.
  const canApply = unresolved.length === 0
  const { counts } = model
  const { missingDiskConflicts } = model

  function chooseAll(choice: FolderSyncConflictChoice) {
    if (locked) return
    setChoices((current) => {
      const next = { ...current }
      for (const conflict of resolvable) {
        if (choicesFor(conflict).includes(choice)) next[conflict.id] = choice
      }
      return next
    })
  }

  function handleApply() {
    if (locked || !canApply || applyStartedRef.current) return
    applyStartedRef.current = true
    setApplying(true)
    void Promise.resolve(
      onApply(
        resolvable.map((conflict) => ({
          conflictId: conflict.id,
          choice: choices[conflict.id]!,
        })),
      ),
    )
      .catch(() => {
        // Root apply command reports failures; keep dialog choices intact.
      })
      .finally(() => {
        applyStartedRef.current = false
        setApplying(false)
      })
  }

  return (
    <div
      className="db-picker-backdrop db-sync-dialog-backdrop"
      role="presentation"
      onPointerDown={() => {
        if (!locked) onCancel()
      }}
    >
      <div
        className={`db-picker-dialog db-sync-dialog${locked ? ' is-applying' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-busy={locked}
        aria-labelledby="db-sync-dialog-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="db-sync-dialog-header">
          <h4 id="db-sync-dialog-title">{folderSyncIntentLabel(model.intent)}</h4>
          <p className="db-sync-source-path" title={model.externalPath}>
            Source: <strong>{model.externalPath}</strong>
          </p>
          <div className="db-sync-summary" aria-label="Planned sync changes">
            <span><strong>{counts.addToDb}</strong> add</span>
            <span><strong>{counts.updateDb}</strong> update</span>
            <span><strong>{counts.createOnDisk + counts.overwriteDisk}</strong> write</span>
            <span><strong>{counts.removeFromDb}</strong> remove</span>
            <span><strong>{counts.ignore}</strong> ignored</span>
            <span><strong>{counts.conflict}</strong> conflict{counts.conflict === 1 ? '' : 's'}</span>
            {model.showPrimerListCount ? (
              <span><strong>{model.primerListCount}</strong> primer list{model.primerListCount === 1 ? '' : 's'}</span>
            ) : null}
          </div>
          {model.intent === 'sync-cleanup' && counts.removeFromDb > 0 ? (
            <p className="db-sync-warning">
              Cleanup will remove {counts.removeFromDb} database construct{counts.removeFromDb === 1 ? '' : 's'} missing from the source folder.
            </p>
          ) : null}
          {model.conflicts.length === 0 ? (
            <p className="db-sync-confirm-copy">
              No conflicts were found. Review the counts, then apply this plan.
            </p>
          ) : (
            <>
              <p className="db-sync-confirm-copy">
                {missingDiskConflicts
                  ? 'Keep the database copy, use the folder file, or remove constructs gone from the folder.'
                  : 'For each conflict, keep the database copy or accept the folder file.'}
              </p>
              {unsupported.length > 0 ? (
                <p className="db-sync-warning">
                  {unsupported.length} conflict{unsupported.length === 1 ? '' : 's'} need manual repair and will be left untouched. Resolved conflicts can still be applied now.
                </p>
              ) : null}
              <div className="db-sync-apply-all" aria-label="Apply one resolution to all supported conflicts">
                <span>Apply to all:</span>
                <button type="button" disabled={locked || !resolvable.some((conflict) => choicesFor(conflict).includes('database'))} onClick={() => chooseAll('database')}>
                  {model.applyAllDatabaseLabel}
                </button>
                <button type="button" disabled={locked || !resolvable.some((conflict) => choicesFor(conflict).includes('filesystem'))} onClick={() => chooseAll('filesystem')}>
                  {model.applyAllFilesystemLabel}
                </button>
              </div>
            </>
          )}
        </div>
        {model.conflicts.length > 0 ? (
          <div className="db-sync-conflict-list">
            <table className="db-sync-conflict-table">
              <colgroup>
                <col className="db-sync-col-file" />
                <col className="db-sync-col-issue" />
                <col className="db-sync-col-resolution" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">File</th>
                  <th scope="col">Issue</th>
                  <th scope="col">Resolution</th>
                </tr>
              </thead>
              <tbody>
                {model.conflicts.map((conflict) => {
                  const allowedChoices = choicesFor(conflict)
                  const supported = allowedChoices.length > 0
                  return (
                    <tr key={conflict.id} className={supported ? undefined : 'is-unsupported'}>
                      <td className="db-sync-conflict-path" title={conflict.relativePath}>
                        {conflict.relativePath}
                      </td>
                      <td className="db-sync-conflict-reason" title={conflict.issueLabel}>
                        {conflict.issueLabel}
                      </td>
                      <td className="db-sync-conflict-resolution">
                        {supported ? (
                          <div className="db-sync-conflict-choices" role="radiogroup" aria-label={`Resolution for ${conflict.relativePath}`}>
                            {(['database', 'filesystem'] as const)
                              .filter((choice) => allowedChoices.includes(choice))
                              .map((choice) => (
                                <label key={choice}>
                                  <input
                                    type="radio"
                                    name={`sync-conflict-${conflict.id}`}
                                    value={choice}
                                    checked={choices[conflict.id] === choice}
                                    disabled={locked}
                                    onChange={() => {
                                      if (locked) return
                                      setChoices((current) => ({ ...current, [conflict.id]: choice }))
                                    }}
                                  />
                                  {folderSyncConflictChoiceLabel(choice, conflict.hasDiskFile)}
                                </label>
                              ))}
                          </div>
                        ) : (
                          <span className="db-sync-unsupported">Needs manual repair</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {locked ? (
          <p className="db-sync-progress" role="status">
            {progress || 'Applying reviewed sync plan…'}
          </p>
        ) : null}
        <div className="db-picker-actions db-sync-dialog-actions">
          <button type="button" disabled={locked} onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="primary"
            disabled={locked || !canApply}
            title={
              locked
                ? 'Applying reviewed sync plan'
              : unresolved.length
                    ? `Choose a resolution for ${unresolved.length} conflict${unresolved.length === 1 ? '' : 's'}`
                    : unsupported.length
                      ? `${unsupported.length} conflict(s) need manual repair and will remain unresolved`
                    : 'Apply this preflight plan'
            }
            onClick={handleApply}
          >
            {locked ? 'Applying…' : 'Apply sync'}
          </button>
        </div>
      </div>
    </div>
  )
}
