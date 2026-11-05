import { useMemo, useState } from 'react'
import { sanitizeProtein } from './domain/sequence'
import {
  DEFAULT_NEW_PROTEIN_FILE_NAME,
  normalizeNewProteinFileName,
  type NewProteinFileResult,
} from './domain/newProteinFile'

function stripSequenceHeaders(input: string): string {
  return input
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('>') && !line.trimStart().startsWith(';'))
    .join('\n')
}

export function NewProteinFileDialog({
  onCancel,
  onCreate,
}: {
  onCancel: () => void
  onCreate: (result: NewProteinFileResult) => void
}) {
  const [rawSequence, setRawSequence] = useState('')
  const [fileName, setFileName] = useState(DEFAULT_NEW_PROTEIN_FILE_NAME)
  const cleanedSequence = useMemo(
    () => sanitizeProtein(stripSequenceHeaders(rawSequence)).toUpperCase(),
    [rawSequence],
  )
  const hasInput = rawSequence.trim().length > 0
  const canCreate = cleanedSequence.length > 0

  const submit = () => {
    if (!canCreate) return
    onCreate({
      sequence: cleanedSequence,
      fileName: normalizeNewProteinFileName(fileName),
    })
  }

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onCancel}>
      <div
        className="translation-dialog new-dna-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-protein-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="new-dna-row new-dna-heading-row">
          <strong id="new-protein-title">Create a protein sequence</strong>
          <span className="new-dna-bp">{cleanedSequence.length.toLocaleString()} aa</span>
        </div>
        <textarea
          className="new-dna-textarea"
          value={rawSequence}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="Paste a one-letter amino-acid sequence or FASTA record"
          onChange={(event) => setRawSequence(event.target.value)}
        />
        <div className="new-dna-row new-dna-textarea-controls">
          <span className="muted">Standard, ambiguous, rare amino acids, and * stop symbols are accepted.</span>
          <button type="button" className="new-dna-clear" disabled={!hasInput} onClick={() => setRawSequence('')}>
            Clear
          </button>
        </div>
        <hr className="new-dna-divider" />
        <div className="new-dna-row new-dna-footer-fields">
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
        <div className={`new-dna-status${hasInput && !canCreate ? ' is-error' : ''}`}>
          {canCreate
            ? `${cleanedSequence.length.toLocaleString()} aa ready.`
            : hasInput
              ? 'No valid amino-acid symbols found.'
              : 'Enter a protein sequence.'}
        </div>
        <div className="translation-dialog-footer new-dna-dialog-footer">
          <div />
          <div className="translation-actions">
            <button type="button" onClick={onCancel}>Cancel</button>
            <button type="button" className="primary" disabled={!canCreate} onClick={submit}>OK</button>
          </div>
        </div>
      </div>
    </div>
  )
}
