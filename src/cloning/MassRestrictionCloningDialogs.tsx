import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { RestrictionBatchSourceChoice } from '../domain/restrictionCloningBatch'
import type { SequenceRecord } from '../domain/types'
import { ProductNameInput } from './ProductNameInput'

export type MassRestrictionSourceChoice = RestrictionBatchSourceChoice

export type MassInsertChoice = MassRestrictionSourceChoice

export type MassRestrictionNameChoice = {
  key: string
  vectorName: string
  insertName: string
}

export type MassRestrictionBatchResult = {
  action?: 'clone' | 'delete-fragment' | 'destroy-site' | 'linear-ligation' | 'pcr' | 'gibson' | 'ta-gc' | 'gateway'
  cloned: Array<{ vectorName: string; insertName: string; productName: string }>
  notCloned: Array<{ vectorName: string; insertName: string; reason: string }>
}

export function MassRestrictionLibraryOutputControls({
  checked,
  name,
  onCheckedChange,
  onNameChange,
}: {
  checked: boolean
  name: string
  onCheckedChange: (checked: boolean) => void
  onNameChange: (name: string) => void
}) {
  return (
    <div className="mass-restriction-library-output-controls">
      <label className="mass-restriction-library-output-toggle">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onCheckedChange(event.target.checked)}
        />
        <span>Output as library</span>
      </label>
      {checked && (
        <label className="restriction-cloning-field mass-restriction-library-name-field">
          <span>Library name</span>
          <input value={name} onChange={(event) => onNameChange(event.target.value)} />
        </label>
      )}
    </div>
  )
}

export function MassRestrictionSourceNavigator({
  kind,
  choices,
  index,
  onChange,
  onExclude,
  excludedCount = 0,
}: {
  kind: 'vector' | 'insert' | 'construct'
  choices: MassRestrictionSourceChoice[]
  index: number
  onChange: (index: number) => void
  onExclude?: () => void
  excludedCount?: number
}) {
  const safeIndex = Math.min(Math.max(0, index), Math.max(0, choices.length - 1))
  const current = choices[safeIndex]
  if (!current || (choices.length < 2 && !onExclude)) return null
  const label = kind === 'vector' ? 'vectors' : kind === 'construct' ? 'constructs' : 'inserts'
  return (
    <div className="mass-insert-selection-summary">
      <div className="mass-restriction-source-navigator">
        <strong>{choices.length} {choices.length === 1 ? kind : label} selected</strong>
        <div className="mass-restriction-source-navigation" role="group" aria-label={`Inspect selected ${label}`}>
          {onExclude ? (
            <button type="button" className="mass-restriction-exclude-button" onClick={onExclude}>
              Exclude…{excludedCount > 0 ? ` (${excludedCount})` : ''}
            </button>
          ) : null}
          <button
            type="button"
            aria-label={`Previous ${kind}`}
            disabled={safeIndex === 0}
            onClick={() => onChange(safeIndex - 1)}
          >
            <ChevronLeft size={14} aria-hidden="true" />
          </button>
          <span>{safeIndex + 1} of {choices.length}</span>
          <button
            type="button"
            aria-label={`Next ${kind}`}
            disabled={safeIndex === choices.length - 1}
            onClick={() => onChange(safeIndex + 1)}
          >
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
      <span title={current.record.name}>{current.record.name}</span>
    </div>
  )
}

export function MassRestrictionLibraryMembersDialog({
  choices,
  cloneableChoiceKeys,
  excludedChoiceKeys,
  failureReasons = {},
  onCancel,
  onConfirm,
}: {
  choices: MassInsertChoice[]
  cloneableChoiceKeys: string[]
  excludedChoiceKeys: string[]
  failureReasons?: Record<string, string>
  onCancel: () => void
  onConfirm: (excludedChoiceKeys: string[]) => void
}) {
  const cloneable = new Set(cloneableChoiceKeys)
  const [excluded, setExcluded] = useState(() => new Set(excludedChoiceKeys))

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onCancel])

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onCancel}>
      <div
        className="translation-dialog mass-restriction-members-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mass-restriction-members-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="mass-restriction-members-title">Include library members</h3>
        <p className="muted">Uncheck cloneable members that should be excluded from this cloning batch.</p>
        <div className="mass-restriction-members-list">
          {choices.map((choice) => {
            const canClone = cloneable.has(choice.key)
            const checked = canClone && !excluded.has(choice.key)
            return (
              <label key={choice.key} className={canClone ? undefined : 'is-uncloneable'}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!canClone}
                  onChange={(event) => {
                    setExcluded((current) => {
                      const next = new Set(current)
                      if (event.target.checked) next.delete(choice.key)
                      else next.add(choice.key)
                      return next
                    })
                  }}
                />
                <span>
                  <strong>{choice.record.name}</strong>
                  <small>
                    {canClone
                      ? choice.librarySource?.name ?? 'DNA library'
                      : failureReasons[choice.key] ?? 'Not cloneable with the selected enzymes'}
                  </small>
                </span>
              </label>
            )
          })}
        </div>
        <footer className="translation-dialog-footer">
          <div className="translation-actions">
            <button type="button" onClick={onCancel}>Cancel</button>
            <button
              type="button"
              className="primary"
              onClick={() => onConfirm([...excluded])}
            >
              Use selection
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

export function MassRestrictionNamesDialog({
  choices,
  initialNames,
  eligibleChoiceKeys,
  failureReasons = {},
  vectorLabel = 'Vector',
  insertLabel = 'Insert',
  onCancel,
  onConfirm,
}: {
  choices: MassRestrictionNameChoice[]
  initialNames: Record<string, string>
  eligibleChoiceKeys?: string[]
  failureReasons?: Record<string, string>
  vectorLabel?: string
  insertLabel?: string
  onCancel: () => void
  onConfirm: (names: Record<string, string>) => void
}) {
  const [names, setNames] = useState<Record<string, string>>(() => ({ ...initialNames }))
  const eligible = new Set(eligibleChoiceKeys ?? choices.map((choice) => choice.key))
  const normalized = choices.filter((choice) => eligible.has(choice.key)).map((choice) =>
    (names[choice.key] ?? '').trim().replace(/\.dna$/i, '').toLocaleLowerCase(),
  )
  const duplicateNames = new Set(
    normalized.filter((name, index) => name && normalized.indexOf(name) !== index),
  )
  const invalid = normalized.length === 0 || normalized.some((name) => !name) || duplicateNames.size > 0
  const hasInsertColumn = choices.some((choice) => Boolean(choice.insertName))

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onCancel])

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onCancel}>
      <div
        className="translation-dialog mass-restriction-names-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mass-restriction-names-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="mass-restriction-names-title">Choose product names</h3>
        <p className="muted">
          Edit product names for the constructs that can be processed. Names must be non-empty and unique.
        </p>
        <div className="mass-restriction-name-table-wrap">
          <table className="mass-restriction-name-table">
            <colgroup>
              <col className="mass-restriction-vector-column" />
              {hasInsertColumn && <col className="mass-restriction-insert-column" />}
              <col className="mass-restriction-product-column" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">{hasInsertColumn ? vectorLabel : 'Construct'}</th>
                {hasInsertColumn && <th scope="col">{insertLabel}</th>}
                <th scope="col">Product</th>
              </tr>
            </thead>
            <tbody>
              {choices.map((choice) => {
                const willBeCloned = eligible.has(choice.key)
                const value = names[choice.key] ?? ''
                const duplicate = duplicateNames.has(
                  value.trim().replace(/\.dna$/i, '').toLocaleLowerCase(),
                )
                return (
                  <tr key={choice.key} className={willBeCloned ? undefined : 'is-skipped'}>
                    <td title={choice.vectorName || 'Vector'}>{choice.vectorName || 'Vector'}</td>
                    {hasInsertColumn && (
                      <td title={choice.insertName || 'Insert'}>{choice.insertName || 'Insert'}</td>
                    )}
                    <td>
                      {willBeCloned ? (
                      <ProductNameInput
                        value={value}
                        className={duplicate ? 'is-invalid' : undefined}
                        aria-label={
                          choice.insertName
                            ? `Product name for ${choice.vectorName} and ${choice.insertName}`
                            : `Product name for ${choice.vectorName}`
                        }
                        onChange={(event) =>
                          setNames((current) => ({ ...current, [choice.key]: event.target.value }))
                        }
                      />
                      ) : (
                        <div className="mass-restriction-skipped-name">
                          <strong>Will not be cloned</strong>
                          <span>{failureReasons[choice.key] ?? 'Incompatible with the configured digest.'}</span>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {duplicateNames.size > 0 && <p className="mass-insert-dialog-status is-error">Product names must be unique.</p>}
        <footer className="translation-dialog-footer">
          <div className="translation-actions">
            <button type="button" onClick={onCancel}>Cancel</button>
            <button type="button" className="primary" disabled={invalid} onClick={() => onConfirm(names)}>
              Use names
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

export function MassRestrictionResultsDialog({
  result,
  onClose,
}: {
  result: MassRestrictionBatchResult
  onClose: () => void
}) {
  const labels = result.action === 'delete-fragment'
    ? {
        title: 'Mass restriction fragment deletion results',
        completed: 'Deleted',
        failed: 'Not deleted',
        empty: 'No restriction fragments were deleted.',
        all: 'All selected constructs were processed.',
      }
    : result.action === 'destroy-site'
      ? {
          title: 'Mass restriction site destruction results',
          completed: 'Destroyed',
          failed: 'Not destroyed',
          empty: 'No restriction sites were destroyed.',
          all: 'All selected constructs were processed.',
        }
      : result.action === 'linear-ligation'
        ? {
            title: 'Mass linear ligation results',
            completed: 'Ligated',
            failed: 'Not ligated',
            empty: 'No constructs were ligated.',
            all: 'All selected fragment combinations were ligated.',
          }
        : result.action === 'pcr'
          ? {
              title: 'Mass PCR results',
              completed: 'Amplified',
              failed: 'Not amplified',
              empty: 'No PCR products were created.',
              all: 'All selected template combinations were amplified.',
            }
          : result.action === 'gibson'
            ? {
                title: 'Mass Gibson-style assembly results',
                completed: 'Assembled',
                failed: 'Not assembled',
                empty: 'No Gibson-style products were created.',
                all: 'All selected combinations were assembled.',
              }
            : result.action === 'ta-gc'
              ? {
                  title: 'Mass AT/GC cloning results',
                  completed: 'Cloned',
                  failed: 'Not cloned',
                  empty: 'No AT/GC cloning products were created.',
                  all: 'All selected combinations were cloned.',
                }
              : result.action === 'gateway'
                ? {
                    title: 'Mass Gateway cloning results',
                    completed: 'Cloned',
                    failed: 'Not cloned',
                    empty: 'No Gateway cloning products were created.',
                    all: 'All selected combinations were cloned.',
                  }
                : {
                  title: 'Mass restriction cloning results',
                  completed: 'Cloned',
                  failed: 'Not cloned',
                  empty: 'No constructs were cloned.',
                  all: 'All selected combinations were cloned.',
                }

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onClose}>
      <div
        className="translation-dialog mass-restriction-results-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mass-restriction-results-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="mass-restriction-results-title">{labels.title}</h3>
        <p className="muted mass-restriction-results-summary">
          {result.cloned.length} {labels.completed.toLowerCase()} · {result.notCloned.length}{' '}
          {labels.failed.toLowerCase()}
        </p>
        <div className="mass-restriction-results-columns">
          <section className="mass-restriction-results-column is-cloned">
            <h4>{labels.completed} <span>{result.cloned.length}</span></h4>
            <div className="mass-restriction-results-list">
              {result.cloned.length ? (
                <ul>
                  {result.cloned.map((entry, index) => (
                    <li key={`${entry.vectorName}-${entry.insertName}-${entry.productName}-${index}`}>
                      <strong title={entry.productName}>{entry.productName}</strong>
                      <span title={entry.insertName ? `${entry.vectorName} ← ${entry.insertName}` : entry.vectorName}>
                        {entry.insertName ? `${entry.vectorName} ← ${entry.insertName}` : entry.vectorName}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">{labels.empty}</p>
              )}
            </div>
          </section>
          <section className="mass-restriction-results-column is-not-cloned">
            <h4>{labels.failed} <span>{result.notCloned.length}</span></h4>
            <div className="mass-restriction-results-list">
              {result.notCloned.length ? (
                <ul>
                  {result.notCloned.map((entry, index) => (
                    <li key={`${entry.vectorName}-${entry.insertName}-${index}`}>
                      <strong title={entry.insertName ? `${entry.vectorName} ← ${entry.insertName}` : entry.vectorName}>
                        {entry.insertName ? `${entry.vectorName} ← ${entry.insertName}` : entry.vectorName}
                      </strong>
                      <span>{entry.reason}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">{labels.all}</p>
              )}
            </div>
          </section>
        </div>
        <footer className="translation-dialog-footer">
          <div className="translation-actions">
            <button type="button" className="primary" autoFocus onClick={onClose}>Close</button>
          </div>
        </footer>
      </div>
    </div>
  )
}

export function BlockedBatchOpenDialog({
  products,
  openedCount,
  onOpen,
  onDiscard,
}: {
  products: SequenceRecord[]
  openedCount: number
  onOpen: (product: SequenceRecord) => void
  onDiscard: () => void
}) {
  return (
    <div className="translation-dialog-backdrop" role="presentation">
      <div
        className="translation-dialog blocked-batch-open-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="blocked-batch-open-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="blocked-batch-open-title">Some product tabs were blocked</h3>
        <p className="muted">
          {openedCount} opened · {products.length} remaining. Allow popups for this site to open
          whole batches automatically, or open each remaining product below.
        </p>
        <div className="blocked-batch-open-list">
          <ul>
            {products.map((product) => (
              <li key={product.id}>
                <span>
                  <strong>{product.name}</strong>
                  <small>{product.sequence.length.toLocaleString()} bp</small>
                </span>
                <button type="button" className="primary" onClick={() => onOpen(product)}>
                  Open
                </button>
              </li>
            ))}
          </ul>
        </div>
        <p className="muted blocked-batch-open-warning">
          Remaining products are temporary and will be lost if this list is discarded.
        </p>
        <footer className="translation-dialog-footer">
          <div className="translation-actions">
            <button type="button" className="danger-text" onClick={onDiscard}>
              Discard remaining
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
