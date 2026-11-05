import { useMemo, useState } from 'react'
import { reverseComplement, sanitizeDna } from './domain/sequence'
import type { NewDnaFileResult } from './domain/newDnaFile'
import type { Topology } from './domain/types'

type NewDnaFileDialogProps = {
  onCancel: () => void
  onCreate: (result: NewDnaFileResult) => void
}

type CreateMode = 'sequence' | 'ns'

const MIN_NS = 1
const MAX_NS = 1_000_000

function stripFastaHeaders(input: string): string {
  return input
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('>') && !line.trimStart().startsWith(';'))
    .join('\n')
}

export function NewDnaFileDialog({ onCancel, onCreate }: NewDnaFileDialogProps) {
  const [mode, setMode] = useState<CreateMode>('sequence')
  const [rawSequence, setRawSequence] = useState('')
  const [reverse, setReverse] = useState(false)
  const [nCount, setNCount] = useState(1000)
  const [topology, setTopology] = useState<Topology>('circular')
  const [fileName, setFileName] = useState('Untitled.dna')

  const cleanedSequence = useMemo(() => {
    const bases = sanitizeDna(stripFastaHeaders(rawSequence)).toUpperCase()
    return reverse ? reverseComplement(bases) : bases
  }, [rawSequence, reverse])

  const clampedNCount = Math.max(MIN_NS, Math.min(MAX_NS, Math.round(nCount) || 0))

  const finalSequence = mode === 'ns' ? 'N'.repeat(clampedNCount) : cleanedSequence
  const bp = finalSequence.length

  const hasInvalidChars =
    mode === 'sequence' && rawSequence.trim().length > 0 && cleanedSequence.length === 0

  const canCreate = mode === 'ns' ? clampedNCount > 0 : cleanedSequence.length > 0

  const statusMessage = (() => {
    if (mode === 'ns') return `A ${clampedNCount.toLocaleString()} bp sequence of N's will be created.`
    if (hasInvalidChars) return 'No valid DNA bases found. Enter a plain or formatted DNA sequence.'
    if (cleanedSequence.length === 0) return 'Please enter a plain or formatted DNA sequence.'
    return `${cleanedSequence.length.toLocaleString()} bp ready.`
  })()

  const submit = () => {
    if (!canCreate) return
    const trimmedName = fileName.trim() || 'Untitled.dna'
    onCreate({
      sequence: finalSequence,
      topology,
      fileName: trimmedName.toLowerCase().endsWith('.dna') ? trimmedName : `${trimmedName}.dna`,
    })
  }

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onCancel}>
      <div
        className="translation-dialog new-dna-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-dna-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="new-dna-row new-dna-heading-row">
          <label className="new-dna-radio">
            <input
              type="radio"
              name="new-dna-mode"
              checked={mode === 'sequence'}
              onChange={() => setMode('sequence')}
            />
            <span id="new-dna-title">Create the following sequence:</span>
          </label>
          <span className="new-dna-bp">{bp.toLocaleString()} bp</span>
        </div>

        <textarea
          className="new-dna-textarea"
          value={rawSequence}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          disabled={mode !== 'sequence'}
          onFocus={() => setMode('sequence')}
          onChange={(event) => setRawSequence(event.target.value)}
        />

        <div className="new-dna-row new-dna-textarea-controls">
          <label className={`new-dna-checkbox${mode !== 'sequence' ? ' is-disabled' : ''}`}>
            <input
              type="checkbox"
              checked={reverse}
              disabled={mode !== 'sequence'}
              onChange={(event) => setReverse(event.target.checked)}
            />
            <span>Reverse complement</span>
          </label>
          <button
            type="button"
            className="new-dna-clear"
            disabled={mode !== 'sequence' || rawSequence.length === 0}
            onClick={() => setRawSequence('')}
          >
            Clear
          </button>
        </div>

        <div className="new-dna-row new-dna-ns-row">
          <label className="new-dna-radio">
            <input
              type="radio"
              name="new-dna-mode"
              checked={mode === 'ns'}
              onChange={() => setMode('ns')}
            />
            <span>Create a sequence of</span>
          </label>
          <input
            type="number"
            className="new-dna-ns-input"
            min={MIN_NS}
            max={MAX_NS}
            value={nCount}
            disabled={mode !== 'ns'}
            onFocus={() => setMode('ns')}
            onChange={(event) => setNCount(Number(event.target.value))}
          />
          <span>N's</span>
        </div>

        <hr className="new-dna-divider" />

        <div className="new-dna-row new-dna-footer-fields">
          <div className="new-dna-topology">
            <span className="new-dna-field-label">Topology:</span>
            <label className="new-dna-radio">
              <input
                type="radio"
                name="new-dna-topology"
                checked={topology === 'linear'}
                onChange={() => setTopology('linear')}
              />
              <span>Linear</span>
            </label>
            <label className="new-dna-radio">
              <input
                type="radio"
                name="new-dna-topology"
                checked={topology === 'circular'}
                onChange={() => setTopology('circular')}
              />
              <span>Circular</span>
            </label>
          </div>
          <div className="new-dna-filename">
            <span className="new-dna-field-label">File Name:</span>
            <input
              type="text"
              value={fileName}
              onChange={(event) => setFileName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  submit()
                }
              }}
            />
          </div>
        </div>

        <div className={`new-dna-status${hasInvalidChars ? ' is-error' : ''}`}>{statusMessage}</div>

        <div className="translation-dialog-footer new-dna-dialog-footer">
          <div />
          <div className="translation-actions">
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="primary" disabled={!canCreate} onClick={submit}>
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
