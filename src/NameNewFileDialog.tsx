import { useEffect, useRef, useState } from 'react'
import { normalizeConstructFileName } from './domain/constructFileName'

type NameNewFileDialogProps = {
  title?: string
  initialName: string
  detail?: string
  confirmLabel?: string
  onCancel: () => void
  onConfirm: (name: string) => void
}

export function NameNewFileDialog({
  title = 'Name new file',
  initialName,
  detail,
  confirmLabel = 'Create',
  onCancel,
  onConfirm,
}: NameNewFileDialogProps) {
  const [name, setName] = useState(() => normalizeConstructFileName(initialName))
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.focus()
    input.select()
  }, [])

  const submit = () => {
    onConfirm(normalizeConstructFileName(name, normalizeConstructFileName(initialName)))
  }

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onCancel}>
      <div
        className="translation-dialog name-new-file-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="name-new-file-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="name-new-file-title">{title}</h3>
        {detail ? <p className="muted">{detail}</p> : null}
        <label>
          File name
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                submit()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                onCancel()
              }
            }}
            placeholder="Untitled"
          />
        </label>
        <div className="translation-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={submit}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
