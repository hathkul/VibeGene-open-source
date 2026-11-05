import { useEffect, useRef, useState } from 'react'
import type { SequenceRecord } from './domain/types'
import { normalizeProjectFileName } from './storage/projects'

export function RenameFileDialog({
  initialFileName,
  molecule,
  detail,
  onCancel,
  onConfirm,
}: {
  initialFileName: string
  molecule: SequenceRecord['molecule']
  detail?: string
  onCancel: () => void
  onConfirm: (fileName: string) => void | Promise<void>
}) {
  const [fileName, setFileName] = useState(initialFileName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.focus()
    const dot = input.value.lastIndexOf('.')
    if (dot > 0) input.setSelectionRange(0, dot)
    else input.select()
  }, [])

  const submit = () => {
    const next = normalizeProjectFileName(fileName, initialFileName, molecule)
    if (!next.trim()) {
      setError('Enter a file name.')
      return
    }
    setBusy(true)
    setError('')
    void Promise.resolve(onConfirm(next))
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onCancel}>
      <div
        className="translation-dialog name-new-file-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-file-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="rename-file-title">Rename file</h3>
        {detail ? <p className="muted">{detail}</p> : null}
        <label>
          File name
          <input
            ref={inputRef}
            type="text"
            value={fileName}
            disabled={busy}
            onChange={(event) => {
              setFileName(event.target.value)
              setError('')
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                submit()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                onCancel()
              }
            }}
          />
        </label>
        {error ? <p className="mass-insert-dialog-status is-error" role="alert">{error}</p> : null}
        <div className="translation-actions">
          <button type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary" disabled={busy || !fileName.trim()} onClick={submit}>
            Rename
          </button>
        </div>
      </div>
    </div>
  )
}
