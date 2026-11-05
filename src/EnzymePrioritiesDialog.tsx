import { useMemo, useRef, useState, type DragEvent } from 'react'
import { enzymes } from './domain/enzymes'
import {
  defaultEnzymePriorityOrder,
} from './domain/enzymeLabelBudget'
import {
  normalizeEnzymePriorityOrder,
  type EnzymePreferences,
} from './domain/enzymePreferences'

type EnzymePrioritiesDialogProps = {
  preferences: EnzymePreferences
  onCancel: () => void
  onSave: (priorityOrder: string[]) => void
}

function moveName(order: string[], index: number, target: number) {
  if (index < 0 || index >= order.length || target < 0 || target >= order.length || index === target) {
    return order
  }
  const next = [...order]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item!)
  return next
}

export function EnzymePrioritiesDialog({ preferences, onCancel, onSave }: EnzymePrioritiesDialogProps) {
  const catalogNames = useMemo(() => enzymes.map((enzyme) => enzyme.name), [])
  const defaultOrder = useMemo(() => defaultEnzymePriorityOrder(catalogNames), [catalogNames])
  const [draft, setDraft] = useState(() =>
    preferences.priorityOrder.length
      ? normalizeEnzymePriorityOrder(preferences.priorityOrder)
      : [...defaultOrder],
  )
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [addQuery, setAddQuery] = useState('')
  const dragIndexRef = useRef<number | null>(null)
  const usingCustom = preferences.priorityOrder.length > 0

  const addCandidates = useMemo(() => {
    const inDraft = new Set(draft)
    const query = addQuery.trim().toLowerCase()
    return catalogNames
      .filter((name) => !inDraft.has(name) && (!query || name.toLowerCase().includes(query)))
      .slice(0, 40)
  }, [addQuery, catalogNames, draft])

  function clearDrag() {
    dragIndexRef.current = null
    setDragIndex(null)
    setDropIndex(null)
  }

  function handleDragStart(event: DragEvent<HTMLButtonElement>, index: number) {
    dragIndexRef.current = index
    setDragIndex(index)
    setSelectedIndex(index)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }

  function handleDragOver(event: DragEvent<HTMLButtonElement>, index: number) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (dropIndex !== index) setDropIndex(index)
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>, targetIndex: number) {
    event.preventDefault()
    const from = dragIndexRef.current
    clearDrag()
    if (from === null || from === targetIndex) return
    setDraft((current) => moveName(current, from, targetIndex))
    setSelectedIndex(targetIndex)
  }

  function moveSelected(direction: 'up' | 'down' | 'top') {
    if (selectedIndex < 0 || selectedIndex >= draft.length) return
    if (direction === 'top') {
      setDraft((current) => moveName(current, selectedIndex, 0))
      setSelectedIndex(0)
      return
    }
    const target = direction === 'up' ? selectedIndex - 1 : selectedIndex + 1
    if (target < 0 || target >= draft.length) return
    setDraft((current) => moveName(current, selectedIndex, target))
    setSelectedIndex(target)
  }

  function removeSelected() {
    if (selectedIndex < 0 || selectedIndex >= draft.length) return
    setDraft((current) => current.filter((_, index) => index !== selectedIndex))
    setSelectedIndex((current) => Math.max(0, Math.min(current, draft.length - 2)))
  }

  function addEnzyme(name: string) {
    setDraft((current) => (current.includes(name) ? current : [...current, name]))
    setAddQuery('')
    setSelectedIndex(draft.length)
  }

  function resetToDefaults() {
    setDraft([...defaultOrder])
    setSelectedIndex(0)
    clearDrag()
  }

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onCancel}>
      <div
        className="translation-dialog enzyme-dialog enzyme-priorities-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Enzyme priorities"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3>Enzyme priorities</h3>
        <p className="enzyme-priorities-help">
          Drag enzymes to set priority — reading order is left to right, top to bottom. Higher
          priority wins when the map label budget is tight. Leave the built-in list (or reset) to
          use the default common sticky 6-/8-cutter order.
          {usingCustom ? ' Custom order is active.' : ' Currently using defaults until you Save.'}
        </p>

        <div
          className="enzyme-list-box enzyme-priorities-list"
          role="listbox"
          aria-label="Enzyme priority order"
        >
          {draft.map((name, index) => (
            <button
              key={name}
              type="button"
              role="option"
              draggable
              title={`${index + 1}. ${name} — drag to reorder`}
              aria-selected={selectedIndex === index}
              aria-grabbed={dragIndex === index}
              className={[
                selectedIndex === index ? 'is-selected' : '',
                dragIndex === index ? 'is-dragging' : '',
                dropIndex === index && dragIndex !== null && dragIndex !== index ? 'is-drop-target' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setSelectedIndex(index)}
              onDragStart={(event) => handleDragStart(event, index)}
              onDragOver={(event) => handleDragOver(event, index)}
              onDrop={(event) => handleDrop(event, index)}
              onDragEnd={clearDrag}
            >
              {name}
            </button>
          ))}
          {draft.length === 0 && (
            <div className="enzyme-priorities-empty">No enzymes in the priority list.</div>
          )}
        </div>

        <div className="enzyme-priorities-actions">
          <button type="button" disabled={selectedIndex <= 0} onClick={() => moveSelected('top')}>
            Move to Top
          </button>
          <button type="button" disabled={selectedIndex <= 0} onClick={() => moveSelected('up')}>
            Move Earlier
          </button>
          <button
            type="button"
            disabled={selectedIndex < 0 || selectedIndex >= draft.length - 1}
            onClick={() => moveSelected('down')}
          >
            Move Later
          </button>
          <button
            type="button"
            disabled={draft.length === 0 || selectedIndex < 0}
            onClick={removeSelected}
          >
            Remove
          </button>
          <button type="button" onClick={resetToDefaults}>
            Reset to Defaults
          </button>
        </div>

        <label className="enzyme-priorities-add">
          <span>Add enzyme</span>
          <input
            type="search"
            value={addQuery}
            placeholder="Search catalog…"
            onChange={(event) => setAddQuery(event.target.value)}
          />
        </label>
        {addQuery.trim() && (
          <div
            className="enzyme-list-box enzyme-priorities-add-results"
            role="listbox"
            aria-label="Add enzyme results"
          >
            {addCandidates.map((name) => (
              <button key={name} type="button" onClick={() => addEnzyme(name)}>
                {name}
              </button>
            ))}
            {addCandidates.length === 0 && (
              <div className="enzyme-priorities-empty">No matching enzymes to add.</div>
            )}
          </div>
        )}

        <div className="translation-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              const normalized = normalizeEnzymePriorityOrder(draft)
              const matchesDefault =
                normalized.length === defaultOrder.length &&
                normalized.every((name, index) => name === defaultOrder[index])
              onSave(matchesDefault ? [] : normalized)
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
