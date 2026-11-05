import { useEffect, useMemo, useRef, useState } from 'react'
import { formatPromptTagList, parsePromptTagList } from '../../application/databaseManager/textPromptTags'

export type DatabaseTextPromptModel = {
  title: string
  label: string
  initial: string
  confirmLabel?: string
  allowEmpty?: boolean
  /** Existing tags shown below the input for one-click assign/toggle. */
  suggestions?: string[]
  secondaryLabel?: string
  secondaryInitial?: string
}

export function DatabaseTextPromptDialog({
  prompt,
  busy,
  onCancel,
  onConfirm,
}: {
  prompt: DatabaseTextPromptModel
  busy: boolean
  onCancel: () => void
  onConfirm: (value: string, secondaryValue?: string) => Promise<void> | void
}) {
  const [value, setValue] = useState(prompt.initial)
  const [secondaryValue, setSecondaryValue] = useState(prompt.secondaryInitial ?? '')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const selectedTags = useMemo(() => parsePromptTagList(value), [value])
  const selectedKeys = useMemo(
    () => new Set(selectedTags.map((tag) => tag.toLowerCase())),
    [selectedTags],
  )
  const suggestions = prompt.suggestions ?? []
  const currentExtension = prompt.initial.match(/\.[^.]+$/)?.[0] ?? ''
  const promptSessionRef = useRef<DatabaseTextPromptModel | null>(null)

  useEffect(() => {
    if (promptSessionRef.current === prompt) return
    promptSessionRef.current = prompt
    setValue(prompt.initial)
    setSecondaryValue(prompt.secondaryInitial ?? '')
    const input = inputRef.current
    if (!input) return
    input.focus()
    input.select()
  }, [prompt])

  const submit = () => {
    const trimmed = value.trim()
    if (!prompt.allowEmpty && !trimmed) return
    const result = prompt.secondaryLabel
      ? onConfirm(trimmed, secondaryValue.trim())
      : onConfirm(trimmed)
    void Promise.resolve(result).catch(() => undefined)
  }

  function toggleSuggestion(tag: string) {
    if (busy) return
    const key = tag.toLowerCase()
    const next = selectedKeys.has(key)
      ? selectedTags.filter((entry) => entry.toLowerCase() !== key)
      : [...selectedTags, tag]
    setValue(formatPromptTagList(next))
  }

  return (
    <div className="db-picker-backdrop" role="presentation" onPointerDown={onCancel}>
      <div
        className="db-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="db-text-prompt-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h4 id="db-text-prompt-title">{prompt.title}</h4>
        <label className="db-text-prompt-label">
          <span>{prompt.label}</span>
          <input
            ref={inputRef}
            type="text"
            value={value}
            disabled={busy}
            onChange={(event) => setValue(event.target.value)}
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
        {prompt.secondaryLabel ? (
          <label className="db-text-prompt-label">
            <span>{prompt.secondaryLabel}</span>
            <input type="text" value={secondaryValue} disabled={busy} onChange={(event) => setSecondaryValue(event.target.value)} />
            <span className="db-picker-actions">
              <button type="button" disabled={busy} onClick={() => setSecondaryValue(value.replace(/\.[^.]+$/, ''))}>Copy filename → name</button>
              <button type="button" disabled={busy} onClick={() => setValue(`${secondaryValue}${currentExtension}`)}>Copy name → filename</button>
            </span>
          </label>
        ) : null}
        {suggestions.length > 0 ? (
          <div className="db-text-prompt-suggestions" aria-label="Existing tags">
            <div className="db-tag-chips">
              {suggestions.map((tag) => {
                const active = selectedKeys.has(tag.toLowerCase())
                return (
                  <button
                    key={tag}
                    type="button"
                    className={`db-tag-chip db-text-prompt-tag${active ? ' is-selected' : ''}`}
                    disabled={busy}
                    aria-pressed={active}
                    onClick={() => toggleSuggestion(tag)}
                  >
                    {tag}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
        <div className="db-picker-actions">
          <button type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy || (!prompt.allowEmpty && !value.trim())}
            onClick={submit}
          >
            {prompt.confirmLabel ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}
