import { useEffect, useMemo, useRef, useState } from 'react'
import { findRestrictionSites } from '../../domain/enzymes'
import { createSavedEnzymeSetId, type EnzymePreferences, type SavedEnzymeSet } from '../../domain/enzymePreferences'
import {
  CHOOSE_ENZYMES_CUT_LOCATION_OPTIONS,
  CHOOSE_ENZYMES_OVERHANG_OPTIONS,
  CHOOSE_ENZYMES_RECOGNITION_OPTIONS,
  chooseEnzymesSourceOptions,
  enzymeNamesForChooseSource,
  enzymesForChooseSource,
  filterEnzymesByChooseCriteria,
  hasRangeSelection,
  recognitionLengthLabel,
  type ChooseEnzymesCutLocation,
  type ChooseEnzymesOverhangFilter,
  type ChooseEnzymesSourceSet,
} from '../../domain/chooseEnzymesFilters'
import { type EnzymeSetStorageScope } from '../../ManageEnzymeSetsDialog'
import { type GeneticCodeOption } from '../../domain/geneticCode'
import { type SequenceRecord } from '../../domain/types'
import {
  geneticCodeOptions,
  type SelectionRange,
} from '../sequence'
import {
  chooseEnzymesCriteriaFromDraft,
  type ChooseEnzymesDraft,
  type OrfTranslationDraft,
} from './enzymeHelpers'

export function TranslationOptionsDialog({
  draft,
  onDraftChange,
  onCancel,
  onConfirm,
}: {
  draft: OrfTranslationDraft
  onDraftChange: (patch: Partial<OrfTranslationDraft>) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onCancel}>
      <div
        className="translation-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Translation options"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3>ORFs:</h3>
        <label className="translation-field-row">
          <span>Minimum Length:</span>
          <span className="translation-inline-inputs">
            <input
              type="number"
              min={1}
              value={draft.minimumLengthAa}
              onChange={(event) => onDraftChange({ minimumLengthAa: Math.max(1, Number(event.target.value) || 1) })}
            />
            amino acids
          </span>
        </label>
        <label className="translation-checkbox-row">
          <input type="checkbox" checked={draft.requireStartCodon} onChange={(event) => onDraftChange({ requireStartCodon: event.target.checked })} />
          Require a start codon:
          <select value={draft.startCodon} onChange={(event) => onDraftChange({ startCodon: event.target.value })}>
            <option value="ATG">ATG</option>
            <option value="GTG">GTG</option>
            <option value="TTG">TTG</option>
          </select>
        </label>
        <hr />
        <label className="translation-field-label">Genetic code for ORFs and new features:</label>
        <select value={draft.geneticCode} onChange={(event) => onDraftChange({ geneticCode: event.target.value as GeneticCodeOption })}>
          {geneticCodeOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <label className="translation-checkbox-row">
          <input type="checkbox" checked={draft.applyToExistingFeatures} onChange={(event) => onDraftChange({ applyToExistingFeatures: event.target.checked })} />
          Apply this genetic code to existing features
        </label>
        <div className="translation-dialog-footer">
          <label className="translation-checkbox-row">
            <input type="checkbox" checked={draft.preview} onChange={(event) => onDraftChange({ preview: event.target.checked })} />
            Preview
          </label>
          <div className="translation-actions">
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="primary" onClick={onConfirm}>
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}




export function NoncuttersDialog({
  recordName,
  noncutters,
  onClose,
  onEnzymeInfo,
}: {
  recordName: string
  noncutters: string[]
  onClose: () => void
  onEnzymeInfo: (enzymeName: string) => void
}) {
  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onClose}>
      <div className="translation-dialog enzyme-dialog" role="dialog" aria-modal="true" aria-label="Noncutters" onPointerDown={(event) => event.stopPropagation()}>
        <h3>Noncutters for {recordName}</h3>
        <p>{noncutters.length} enzymes do not cut this sequence:</p>
        <div className="noncutters-grid">
          {noncutters.map((name) => (
            <button
              key={name}
              type="button"
              className="noncutters-enzyme"
              title="Double-click for enzyme information"
              onDoubleClick={() => onEnzymeInfo(name)}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="translation-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export function ChooseEnzymesStepper({
  value,
  disabled,
  onChange,
}: {
  value: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  function setValue(next: number) {
    onChange(Math.max(0, Math.floor(next)))
  }

  return (
    <div className={`enzyme-choose-stepper ${disabled ? 'is-disabled' : ''}`}>
      <input
        type="text"
        inputMode="numeric"
        value={String(value)}
        disabled={disabled}
        onChange={(event) => {
          const digits = event.target.value.replace(/[^\d]/g, '')
          setValue(digits === '' ? 0 : Number(digits))
        }}
      />
      <div className="enzyme-choose-stepper-buttons">
        <button
          type="button"
          tabIndex={-1}
          aria-label="Increase"
          disabled={disabled}
          onClick={() => setValue(value + 1)}
        >
          ▴
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Decrease"
          disabled={disabled || value <= 0}
          onClick={() => setValue(value - 1)}
        >
          ▾
        </button>
      </div>
    </div>
  )
}

export function ChooseEnzymesDialog({
  recordName,
  draft,
  preferences,
  fileEnzymeSets = [],
  sequence,
  topology,
  construct,
  selectedRange,
  onDraftChange,
  onPreferencesChange,
  onFileEnzymeSetsChange,
  onCancel,
  onConfirm,
}: {
  recordName: string
  draft: ChooseEnzymesDraft
  preferences: EnzymePreferences
  fileEnzymeSets?: SavedEnzymeSet[]
  sequence: string
  topology: SequenceRecord['topology']
  construct: SequenceRecord['construct']
  selectedRange: SelectionRange | null
  onDraftChange: (patch: Partial<ChooseEnzymesDraft>) => void
  onPreferencesChange: (preferences: EnzymePreferences) => void
  onFileEnzymeSetsChange?: (sets: SavedEnzymeSet[]) => void
  onCancel: () => void
  onConfirm: (selectedNames: string[]) => void
}) {
  const [highlightedAvailable, setHighlightedAvailable] = useState<string[]>([])
  const [highlightedChosen, setHighlightedChosen] = useState<string[]>([])
  const [activeSavedSetId, setActiveSavedSetId] = useState<string | null>(null)
  const [activeFileSetId, setActiveFileSetId] = useState<string | null>(null)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [saveSetName, setSaveSetName] = useState('')
  const [saveScope, setSaveScope] = useState<EnzymeSetStorageScope>('global')
  const sourceOptions = useMemo(
    () => chooseEnzymesSourceOptions(preferences, fileEnzymeSets),
    [fileEnzymeSets, preferences],
  )
  const hasSelection = hasRangeSelection(selectedRange)

  const sourceNames = useMemo(
    () => enzymeNamesForChooseSource(draft.sourceSet, preferences, fileEnzymeSets),
    [draft.sourceSet, fileEnzymeSets, preferences],
  )

  const criteriaPool = useMemo(
    () => enzymesForChooseSource(draft.criteriaSourceSet, preferences, fileEnzymeSets),
    [draft.criteriaSourceSet, fileEnzymeSets, preferences],
  )
  const criteriaSites = useMemo(() => {
    if (!sequence || !draft.criteriaEnabled) return []
    return findRestrictionSites(sequence, criteriaPool, {
      construct,
      topology,
      annotateMethylation: false,
    })
  }, [construct, criteriaPool, draft.criteriaEnabled, sequence, topology])

  const criteriaMatches = useMemo(() => {
    if (!draft.criteriaEnabled) return []
    return filterEnzymesByChooseCriteria(
      criteriaPool,
      criteriaSites,
      chooseEnzymesCriteriaFromDraft(draft),
      selectedRange,
    ).map((enzyme) => enzyme.name)
  }, [criteriaPool, criteriaSites, draft, selectedRange])

  const displayedChosen = draft.criteriaEnabled ? criteriaMatches : draft.selectedNames

  const available = useMemo(() => {
    const selected = new Set(displayedChosen)
    const query = draft.query.toLowerCase()
    return sourceNames.filter((name) => !selected.has(name) && name.toLowerCase().includes(query))
  }, [displayedChosen, draft.query, sourceNames])

  const onDraftChangeRef = useRef(onDraftChange)
  const draftRef = useRef(draft)
  useEffect(() => {
    onDraftChangeRef.current = onDraftChange
    draftRef.current = draft
  }, [draft, onDraftChange])

  useEffect(() => {
    if (hasSelection) return
    const current = draftRef.current
    if (current.cutLocation === 'anywhere' && current.cutCountScope === 'entire') return
    onDraftChangeRef.current({ cutLocation: 'anywhere', cutCountScope: 'entire' })
  }, [hasSelection])

  function toggleHighlight(list: string[], name: string, setter: (next: string[]) => void) {
    setter(list.includes(name) ? list.filter((item) => item !== name) : [...list, name])
  }

  function commitChosen(names: string[]) {
    setActiveSavedSetId(null)
    setActiveFileSetId(null)
    onDraftChange({
      criteriaEnabled: false,
      selectedNames: [...names].toSorted((left, right) => left.localeCompare(right)),
    })
  }

  function addHighlighted() {
    if (highlightedAvailable.length === 0) return
    const selected = new Set(displayedChosen)
    for (const name of highlightedAvailable) selected.add(name)
    commitChosen([...selected])
    setHighlightedAvailable([])
  }

  function addAllFromSource() {
    const selected = new Set(displayedChosen)
    for (const name of sourceNames) selected.add(name)
    commitChosen([...selected])
    setHighlightedAvailable([])
  }

  function removeHighlighted() {
    if (highlightedChosen.length === 0) return
    const remove = new Set(highlightedChosen)
    commitChosen(displayedChosen.filter((name) => !remove.has(name)))
    setHighlightedChosen([])
  }

  function removeAllChosen() {
    commitChosen([])
    setHighlightedChosen([])
  }

  function openSaveDialog() {
    const existing = activeSavedSetId
      ? preferences.savedEnzymeSets.find((entry) => entry.id === activeSavedSetId)
      : activeFileSetId
        ? fileEnzymeSets.find((entry) => entry.id === activeFileSetId)
        : null
    setSaveSetName(existing?.name ?? '')
    setSaveScope(activeFileSetId ? 'file' : 'global')
    setSaveDialogOpen(true)
  }

  function confirmSaveSet() {
    const name = saveSetName.trim()
    if (!name || displayedChosen.length === 0) return
    const enzymeNames = [...displayedChosen].toSorted((left, right) => left.localeCompare(right))
    if (saveScope === 'file') {
      if (!onFileEnzymeSetsChange) return
      const nextSets = [...fileEnzymeSets]
      const existingIndex = nextSets.findIndex((entry) => entry.name.toLowerCase() === name.toLowerCase())
      let savedId: string
      if (existingIndex >= 0) {
        const previous = nextSets[existingIndex]!
        savedId = previous.id
        nextSets[existingIndex] = { ...previous, name, enzymeNames }
      } else {
        savedId = createSavedEnzymeSetId()
        nextSets.push({ id: savedId, name, enzymeNames })
      }
      onFileEnzymeSetsChange(nextSets)
      setActiveFileSetId(savedId)
      setActiveSavedSetId(null)
      onDraftChange({
        criteriaEnabled: false,
        selectedNames: enzymeNames,
        sourceSet: `file:${savedId}`,
        criteriaSourceSet: `file:${savedId}`,
      })
    } else {
      const existingIndex = preferences.savedEnzymeSets.findIndex(
        (entry) => entry.name.toLowerCase() === name.toLowerCase(),
      )
      const nextSets = [...preferences.savedEnzymeSets]
      let savedId: string
      if (existingIndex >= 0) {
        const previous = nextSets[existingIndex]!
        savedId = previous.id
        nextSets[existingIndex] = { ...previous, name, enzymeNames }
      } else {
        savedId = createSavedEnzymeSetId()
        nextSets.push({ id: savedId, name, enzymeNames })
      }
      onPreferencesChange({
        ...preferences,
        savedEnzymeSets: nextSets,
      })
      setActiveSavedSetId(savedId)
      setActiveFileSetId(null)
      onDraftChange({
        criteriaEnabled: false,
        selectedNames: enzymeNames,
        sourceSet: `saved:${savedId}`,
        criteriaSourceSet: `saved:${savedId}`,
      })
    }
    setSaveDialogOpen(false)
    setSaveSetName('')
  }

  function handleChosenSetChange(value: string) {
    if (value === 'unsaved') {
      setActiveSavedSetId(null)
      setActiveFileSetId(null)
      return
    }
    if (value.startsWith('file:')) {
      const fileId = value.slice('file:'.length)
      const saved = fileEnzymeSets.find((entry) => entry.id === fileId)
      if (!saved) return
      setActiveFileSetId(saved.id)
      setActiveSavedSetId(null)
      onDraftChange({
        criteriaEnabled: false,
        selectedNames: [...saved.enzymeNames],
      })
      setHighlightedChosen([])
      return
    }
    const saved = preferences.savedEnzymeSets.find((entry) => entry.id === value)
    if (!saved) return
    setActiveSavedSetId(saved.id)
    setActiveFileSetId(null)
    onDraftChange({
      criteriaEnabled: false,
      selectedNames: [...saved.enzymeNames],
    })
    setHighlightedChosen([])
  }

  function handleConfirm() {
    onConfirm(displayedChosen)
  }

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onCancel}>
      <div
        className="translation-dialog enzyme-dialog enzyme-choose-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Choose Enzymes"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3>Choose Enzymes for {recordName}</h3>
        <div className="enzyme-chooser">
          <div className="enzyme-chooser-pane">
            <strong>Choose from:</strong>
            <select
              value={draft.sourceSet}
              onChange={(event) => {
                onDraftChange({ sourceSet: event.target.value as ChooseEnzymesSourceSet })
                setHighlightedAvailable([])
              }}
            >
              {sourceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="enzyme-list-box" role="listbox" aria-multiselectable="true">
              {available.map((name) => (
                <button
                  key={name}
                  type="button"
                  role="option"
                  aria-selected={highlightedAvailable.includes(name)}
                  className={highlightedAvailable.includes(name) ? 'is-selected' : undefined}
                  onClick={() => toggleHighlight(highlightedAvailable, name, setHighlightedAvailable)}
                  onDoubleClick={() => {
                    commitChosen([...displayedChosen, name])
                    setHighlightedAvailable((current) => current.filter((item) => item !== name))
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
            <label className="translation-field-row">
              <span>Enzyme:</span>
              <input value={draft.query} onChange={(event) => onDraftChange({ query: event.target.value })} />
            </label>
          </div>
          <div className="enzyme-actions-column">
            <button type="button" disabled={highlightedAvailable.length === 0} onClick={addHighlighted}>
              Add →
            </button>
            <button type="button" onClick={addAllFromSource}>
              Add All →
            </button>
          </div>
          <div className="enzyme-chooser-pane">
            <strong>Chosen Enzymes:</strong>
            <select
              value={activeFileSetId ? `file:${activeFileSetId}` : activeSavedSetId ?? 'unsaved'}
              onChange={(event) => handleChosenSetChange(event.target.value)}
            >
              <option value="unsaved">{`< Unsaved Enzyme Set (${displayedChosen.length}) >`}</option>
              {preferences.savedEnzymeSets.map((saved) => (
                <option key={saved.id} value={saved.id}>
                  {saved.name} ({saved.enzymeNames.length})
                </option>
              ))}
              {fileEnzymeSets.map((saved) => (
                <option key={`file:${saved.id}`} value={`file:${saved.id}`}>
                  {saved.name} ({saved.enzymeNames.length}) · this file
                </option>
              ))}
            </select>
            <div className="enzyme-list-box" role="listbox" aria-multiselectable="true">
              {displayedChosen.map((name) => (
                <button
                  key={name}
                  type="button"
                  role="option"
                  aria-selected={highlightedChosen.includes(name)}
                  className={highlightedChosen.includes(name) ? 'is-selected' : undefined}
                  onClick={() => toggleHighlight(highlightedChosen, name, setHighlightedChosen)}
                  onDoubleClick={() => {
                    commitChosen(displayedChosen.filter((selected) => selected !== name))
                    setHighlightedChosen((current) => current.filter((item) => item !== name))
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="enzyme-chosen-actions">
              <button type="button" disabled={highlightedChosen.length === 0} onClick={removeHighlighted}>
                Remove
              </button>
              <button type="button" onClick={removeAllChosen}>
                Remove All
              </button>
              <button
                type="button"
                disabled={displayedChosen.length === 0}
                onClick={openSaveDialog}
              >
                Save…
              </button>
            </div>
          </div>
        </div>

        <div className="enzyme-choose-criteria">
          <div className="enzyme-choose-criteria-row">
            <label className="enzyme-choose-criteria-check">
              <input
                type="checkbox"
                checked={draft.criteriaEnabled}
                onChange={(event) => onDraftChange({ criteriaEnabled: event.target.checked })}
              />
              <span>Choose from</span>
            </label>
            <select
              value={draft.criteriaSourceSet}
              disabled={!draft.criteriaEnabled}
              onChange={(event) =>
                onDraftChange({ criteriaSourceSet: event.target.value as ChooseEnzymesSourceSet })
              }
            >
              {sourceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="enzyme-choose-criteria-row">
            <span>Enzymes cut</span>
            <select
              value={draft.cutLocation}
              disabled={!draft.criteriaEnabled}
              onChange={(event) => {
                const value = event.target.value as ChooseEnzymesCutLocation
                if ((value === 'only-inside' || value === 'only-outside') && !hasSelection) return
                onDraftChange({ cutLocation: value })
              }}
            >
              {CHOOSE_ENZYMES_CUT_LOCATION_OPTIONS.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  disabled={option.value !== 'anywhere' && !hasSelection}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="enzyme-choose-cut-sites">
            <div className="enzyme-choose-cut-sites-label">Number of Cut Sites:</div>
            <div className="enzyme-choose-cut-sites-body">
              <div className="enzyme-choose-cut-sites-modes" role="radiogroup" aria-label="Number of cut sites">
                <label className={`enzyme-choose-cut-mode ${draft.cutCountMode === 'at-least' ? 'is-active' : ''}`}>
                  <input
                    type="radio"
                    name="choose-cut-count-mode"
                    checked={draft.cutCountMode === 'at-least'}
                    disabled={!draft.criteriaEnabled}
                    onChange={() => onDraftChange({ cutCountMode: 'at-least' })}
                  />
                  <ChooseEnzymesStepper
                    value={draft.cutCountAtLeast}
                    disabled={!draft.criteriaEnabled || draft.cutCountMode !== 'at-least'}
                    onChange={(cutCountAtLeast) => onDraftChange({ cutCountAtLeast })}
                  />
                  <span>or more</span>
                </label>
                <label className={`enzyme-choose-cut-mode ${draft.cutCountMode === 'exact' ? 'is-active' : ''}`}>
                  <input
                    type="radio"
                    name="choose-cut-count-mode"
                    checked={draft.cutCountMode === 'exact'}
                    disabled={!draft.criteriaEnabled}
                    onChange={() => onDraftChange({ cutCountMode: 'exact' })}
                  />
                  <ChooseEnzymesStepper
                    value={draft.cutCountExact}
                    disabled={!draft.criteriaEnabled || draft.cutCountMode !== 'exact'}
                    onChange={(cutCountExact) => onDraftChange({ cutCountExact })}
                  />
                </label>
                <label className={`enzyme-choose-cut-mode is-range ${draft.cutCountMode === 'range' ? 'is-active' : ''}`}>
                  <input
                    type="radio"
                    name="choose-cut-count-mode"
                    checked={draft.cutCountMode === 'range'}
                    disabled={!draft.criteriaEnabled}
                    onChange={() => onDraftChange({ cutCountMode: 'range' })}
                  />
                  <ChooseEnzymesStepper
                    value={draft.cutCountRangeMin}
                    disabled={!draft.criteriaEnabled || draft.cutCountMode !== 'range'}
                    onChange={(cutCountRangeMin) => onDraftChange({ cutCountRangeMin })}
                  />
                  <span>to</span>
                  <ChooseEnzymesStepper
                    value={draft.cutCountRangeMax}
                    disabled={!draft.criteriaEnabled || draft.cutCountMode !== 'range'}
                    onChange={(cutCountRangeMax) => onDraftChange({ cutCountRangeMax })}
                  />
                </label>
              </div>
              <div className="enzyme-choose-cut-brace" aria-hidden>
                {'}'}
              </div>
              <div className="enzyme-choose-cut-sites-scope" role="radiogroup" aria-label="Cut site scope">
                <label>
                  <input
                    type="radio"
                    name="choose-cut-count-scope"
                    checked={draft.cutCountScope === 'entire'}
                    disabled={!draft.criteriaEnabled}
                    onChange={() => onDraftChange({ cutCountScope: 'entire' })}
                  />
                  <span>in the entire sequence</span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="choose-cut-count-scope"
                    checked={draft.cutCountScope === 'inside-selection'}
                    disabled={!draft.criteriaEnabled || !hasSelection}
                    onChange={() => {
                      if (!hasSelection) return
                      onDraftChange({ cutCountScope: 'inside-selection' })
                    }}
                  />
                  <span>inside the selection</span>
                </label>
              </div>
            </div>
          </div>

          <div className="enzyme-choose-criteria-footer">
            <label className="enzyme-choose-overhang">
              <span>Overhang:</span>
              <select
                value={draft.overhang}
                disabled={!draft.criteriaEnabled}
                onChange={(event) =>
                  onDraftChange({ overhang: event.target.value as ChooseEnzymesOverhangFilter })
                }
              >
                {CHOOSE_ENZYMES_OVERHANG_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="enzyme-choose-recognition">
              <span>Recognition Sequence:</span>
              <select
                value={draft.recognitionMin}
                disabled={!draft.criteriaEnabled}
                onChange={(event) => {
                  const recognitionMin = Number(event.target.value)
                  onDraftChange({
                    recognitionMin,
                    recognitionMax: Math.max(recognitionMin, draft.recognitionMax),
                  })
                }}
              >
                {CHOOSE_ENZYMES_RECOGNITION_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {recognitionLengthLabel(value)}
                  </option>
                ))}
              </select>
              <span>to</span>
              <select
                value={draft.recognitionMax}
                disabled={!draft.criteriaEnabled}
                onChange={(event) => {
                  const recognitionMax = Number(event.target.value)
                  onDraftChange({
                    recognitionMax,
                    recognitionMin: Math.min(draft.recognitionMin, recognitionMax),
                  })
                }}
              >
                {CHOOSE_ENZYMES_RECOGNITION_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {recognitionLengthLabel(value)}
                  </option>
                ))}
              </select>
              <span>bp</span>
            </div>
          </div>
        </div>

        <div className="translation-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={handleConfirm}>
            OK
          </button>
        </div>
      </div>
      {saveDialogOpen && (
        <div
          className="enzyme-save-set-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Save Enzyme Set"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <h4>Save Enzyme Set</h4>
          <label className="translation-field-row">
            <span>Name:</span>
            <input
              autoFocus
              value={saveSetName}
              onChange={(event) => setSaveSetName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  confirmSaveSet()
                }
              }}
            />
          </label>
          <fieldset className="enzyme-save-set-type">
            <legend>Type:</legend>
            <label>
              <input
                type="radio"
                name="choose-save-enzyme-set-type"
                checked={saveScope === 'global'}
                onChange={() => setSaveScope('global')}
              />
              <span>Available for all files</span>
            </label>
            <label>
              <input
                type="radio"
                name="choose-save-enzyme-set-type"
                checked={saveScope === 'file'}
                onChange={() => setSaveScope('file')}
                disabled={!onFileEnzymeSetsChange}
              />
              <span>Only for {recordName}</span>
            </label>
          </fieldset>
          <div className="translation-actions">
            <button type="button" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              disabled={
                !saveSetName.trim() ||
                displayedChosen.length === 0 ||
                (saveScope === 'file' && !onFileEnzymeSetsChange)
              }
              onClick={confirmSaveSet}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
