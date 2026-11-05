import { useMemo, useRef, useState } from 'react'
import { enzymes } from '../../domain/enzymes'
import { enzymeNamesBySelection } from '../../domain/restrictionSiteFilters'
import { enzymePoolForSettings, type EnzymePreferences, type SavedEnzymeSet } from '../../domain/enzymePreferences'
import { EnzymePreferencesDialog } from '../../EnzymePreferencesDialog'
import { type EnzymeManufacturerId, type SequenceRecord } from '../../domain/types'
import { enzymeSiteCounts } from '../map/mapPrimitives'
import { EnzymeSetMenu } from '../documentMenus'
import { useRestrictionSiteScan } from '../hooks/useRestrictionSiteScan'
import { filterRestrictionSitesForEnzymeSet } from '../sequence/sequenceRenderingHelpers'
import {
  ChooseEnzymesDialog,
  NoncuttersDialog,
} from './EnzymeDialogs'
import {
  createChooseEnzymesDraft,
  enzymeSetModeLabel,
  type ChooseEnzymesDraft,
} from './enzymeHelpers'
import { useCloseOnOutsidePointer } from '../hooks/useCloseOnOutsidePointer'
import { type DisplaySettings, type EnzymeSetMode, type RestrictionSiteList, type SelectionRange } from '../sequence'

const EMPTY_HIDDEN_ENZYME_NAMES: readonly string[] = []

export function EnzymeTabSetControl({
  settings,
  enzymePreferences,
  fileEnzymeSets = [],
  restrictionSites,
  parentalRestrictionSites,
  recordName,
  sequence,
  topology,
  construct,
  selectedRange,
  selectedEnzymeNames = [],
  enzymeCount,
  updateSection,
  onEnzymeInfo,
  onPreferencesChange,
  onFileEnzymeSetsChange,
  onSaveEnzymeSet,
}: {
  settings: DisplaySettings
  enzymePreferences: EnzymePreferences
  fileEnzymeSets?: SavedEnzymeSet[]
  restrictionSites: RestrictionSiteList
  parentalRestrictionSites: RestrictionSiteList
  recordName: string
  sequence: string
  topology: SequenceRecord['topology']
  construct: SequenceRecord['construct']
  selectedRange: SelectionRange | null
  selectedEnzymeNames?: string[]
  enzymeCount: number
  updateSection: <Key extends keyof DisplaySettings>(key: Key, patch: Partial<DisplaySettings[Key]>) => void
  onEnzymeInfo: (enzymeName: string) => void
  onPreferencesChange: (preferences: EnzymePreferences) => void
  onFileEnzymeSetsChange?: (sets: SavedEnzymeSet[]) => void
  onSaveEnzymeSet?: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [chooseOpen, setChooseOpen] = useState(false)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [noncuttersOpen, setNoncuttersOpen] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [chooseDraft, setChooseDraft] = useState<ChooseEnzymesDraft | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const addRootRef = useRef<HTMLDivElement>(null)
  const actionsRootRef = useRef<HTMLDivElement>(null)
  const activePool = useMemo(
    () => enzymePoolForSettings(settings.enzymes, enzymePreferences),
    [enzymePreferences, settings.enzymes],
  )
  const counts = useMemo(() => enzymeSiteCounts(restrictionSites), [restrictionSites])
  const allEnzymeNames = useMemo(() => enzymes.map((enzyme) => enzyme.name), [])
  const allEnzymeScan = useRestrictionSiteScan({
    enabled: addMenuOpen,
    sequence,
    topology,
    construct,
    enzymeNames: allEnzymeNames,
  })
  const allEnzymeCounts = useMemo(() => enzymeSiteCounts(allEnzymeScan.sites), [allEnzymeScan.sites])
  const displayedEnzymeNames = useMemo(() => {
    if (settings.enzymes.set === 'custom') return settings.enzymes.selectedNames
    const sourceSites = allEnzymeScan.stage === 'complete' ? allEnzymeScan.sites : restrictionSites
    return [...new Set(filterRestrictionSitesForEnzymeSet(sourceSites, settings.enzymes).map((site) => site.enzyme.name))]
  }, [allEnzymeScan.sites, allEnzymeScan.stage, restrictionSites, settings.enzymes])
  const visibleEnzymeSet = useMemo(() => new Set(displayedEnzymeNames), [displayedEnzymeNames])
  const enzymeSetNames = useMemo(() => [...new Set(activePool.map((enzyme) => enzyme.name))], [activePool])
  const hiddenNames = settings.enzymes.hiddenNames ?? EMPTY_HIDDEN_ENZYME_NAMES
  const hiddenNameSet = useMemo(() => new Set(hiddenNames), [hiddenNames])
  const hasSequenceSelection = Boolean(selectedRange && selectedRange.end !== selectedRange.start && (topology === 'circular' || selectedRange.end > selectedRange.start))
  const selectedHiddenCount = selectedEnzymeNames.filter((name) => hiddenNameSet.has(name)).length
  const { inside: selectedCutNames, outside: selectedOutsideCutNames } = useMemo(
    () => enzymeNamesBySelection(restrictionSites, selectedRange, sequence.length, topology),
    [restrictionSites, selectedRange, sequence.length, topology],
  )
  const filteredCatalog = useMemo(() => {
    const query = addSearch.trim().toLocaleLowerCase()
    return enzymes
      .filter((enzyme) =>
        !query || enzyme.name.toLocaleLowerCase().includes(query) ||
        enzyme.recognition.replace(/\s+/g, '').toLocaleLowerCase().includes(query.replace(/\s+/g, '')),
      )
      .toSorted((left, right) => left.name.localeCompare(right.name))
  }, [addSearch])
  const noncutters = useMemo(
    () =>
      activePool
        .map((enzyme) => enzyme.name)
        .filter((name) => !(counts[name] ?? 0))
        .toSorted((left, right) => left.localeCompare(right)),
    [activePool, counts],
  )

  useCloseOnOutsidePointer(menuOpen, rootRef, setMenuOpen)
  useCloseOnOutsidePointer(addMenuOpen, addRootRef, setAddMenuOpen)
  useCloseOnOutsidePointer(actionsMenuOpen, actionsRootRef, setActionsMenuOpen)

  function updateHiddenNames(nextNames: Iterable<string>) {
    updateSection('enzymes', { hiddenNames: [...new Set(nextNames)].toSorted((left, right) => left.localeCompare(right)) })
    setActionsMenuOpen(false)
  }

  function hideNames(names: Iterable<string>) {
    updateHiddenNames([...hiddenNames, ...names])
  }

  function showNames(names: Iterable<string>) {
    const namesToShow = new Set(names)
    updateHiddenNames(hiddenNames.filter((name) => !namesToShow.has(name)))
  }

  function showAllEnzymes() {
    updateHiddenNames([])
  }

  function toggleEnzyme(name: string, checked: boolean) {
    const selected = new Set(displayedEnzymeNames)
    if (checked) selected.add(name)
    else selected.delete(name)
    updateSection('enzymes', {
      set: 'custom',
      selectedNames: [...selected].toSorted((left, right) => left.localeCompare(right)),
      supplierSetId: null,
      visible: true,
    })
  }

  function selectSet(set: EnzymeSetMode) {
    updateSection('enzymes', { set, supplierSetId: set === 'supplier' ? settings.enzymes.supplierSetId : null })
    setMenuOpen(false)
  }

  function selectSupplier(supplierId: EnzymeManufacturerId) {
    updateSection('enzymes', { set: 'supplier', supplierSetId: supplierId })
    setMenuOpen(false)
  }

  function selectSavedSet(savedSetId: string) {
    const saved = enzymePreferences.savedEnzymeSets.find((entry) => entry.id === savedSetId)
    if (!saved) return
    updateSection('enzymes', { set: 'custom', selectedNames: [...saved.enzymeNames], supplierSetId: null })
    setMenuOpen(false)
  }

  function selectFileSet(savedSetId: string) {
    const saved = fileEnzymeSets.find((entry) => entry.id === savedSetId)
    if (!saved) return
    updateSection('enzymes', { set: 'custom', selectedNames: [...saved.enzymeNames], supplierSetId: null })
    setMenuOpen(false)
  }

  function openPreferencesDialog() {
    setMenuOpen(false)
    setPreferencesOpen(true)
  }

  function openChooseDialog() {
    setMenuOpen(false)
    setChooseDraft(createChooseEnzymesDraft(settings.enzymes))
    setChooseOpen(true)
  }

  function confirmChooseDialog(selectedNames: string[]) {
    updateSection('enzymes', { set: 'custom', selectedNames })
    setChooseOpen(false)
    setChooseDraft(null)
  }

  return (
    <>
      <div className={`enzymes-tab-toolbar ${menuOpen ? 'menu-open' : ''}`}>
        <span className="enzymes-tab-toolbar-label">Enzyme set</span>
        <div className="enzyme-tab-set-picker" ref={rootRef}>
          <button
            type="button"
            className="enzyme-tab-set-trigger"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span>
              {enzymeSetModeLabel(
                settings.enzymes.set,
                settings.enzymes.selectedNames.length,
                settings.enzymes.supplierSetId,
                [...enzymePreferences.savedEnzymeSets, ...fileEnzymeSets].find((saved) => {
                  if (settings.enzymes.set !== 'custom') return false
                  const selected = new Set(settings.enzymes.selectedNames)
                  return (
                    saved.enzymeNames.length === selected.size &&
                    saved.enzymeNames.every((name) => selected.has(name))
                  )
                })?.name,
              )}
            </span>
            <span className="sidebar-enzyme-caret" aria-hidden>
              ▾
            </span>
          </button>
          {menuOpen && (
            <EnzymeSetMenu
              className="sidebar-menu sidebar-enzyme-picker enzyme-tab-set-menu"
              settings={settings}
              preferences={enzymePreferences}
              fileEnzymeSets={fileEnzymeSets}
              parentalRestrictionSites={parentalRestrictionSites}
              onSelectSet={selectSet}
              onSelectSupplier={selectSupplier}
              onSelectSavedSet={selectSavedSet}
              onSelectFileSet={selectFileSet}
              onChooseEnzymes={openChooseDialog}
              onShowNoncutters={() => {
                setMenuOpen(false)
                setNoncuttersOpen(true)
              }}
              onOpenPreferences={openPreferencesDialog}
              onSaveSet={onSaveEnzymeSet ? () => { setMenuOpen(false); onSaveEnzymeSet() } : undefined}
            />
          )}
        </div>
        <div className={`enzyme-add-picker${addMenuOpen ? ' is-open' : ''}`} ref={addRootRef}>
          <button
            type="button"
            className="enzyme-add-trigger"
            aria-expanded={addMenuOpen}
            aria-haspopup="dialog"
            onClick={() => setAddMenuOpen((open) => !open)}
          >
            Add enzymes <span aria-hidden>▾</span>
          </button>
          {addMenuOpen ? (
            <div className="enzyme-add-dropdown" role="dialog" aria-label="Add enzymes to sequence display">
              <input
                type="search"
                className="enzyme-add-search"
                aria-label="Search enzyme catalog"
                placeholder="Search enzymes…"
                value={addSearch}
                onChange={(event) => setAddSearch(event.target.value)}
              />
              <div className="enzyme-add-list" role="group" aria-label="Enzyme catalog">
                {filteredCatalog.map((enzyme) => {
                  const checked = visibleEnzymeSet.has(enzyme.name)
                  const count = allEnzymeCounts[enzyme.name] ?? 0
                  const waitingForSetScan = settings.enzymes.set !== 'custom' && allEnzymeScan.stage !== 'complete'
                  return (
                    <label
                      key={enzyme.name}
                      className={`enzyme-add-option${checked ? ' is-selected' : ''}`}
                      title={`${enzyme.name} · ${enzyme.recognition}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={waitingForSetScan}
                        aria-label={`Show ${enzyme.name} (${count} cut sites)`}
                        onChange={(event) => toggleEnzyme(enzyme.name, event.target.checked)}
                      />
                      <span className="enzyme-add-name">{enzyme.name}</span>
                      <span className="enzyme-add-count" aria-label={`${count} cut sites`}>
                        ({allEnzymeScan.stage === 'complete' ? count : allEnzymeScan.stage === 'error' ? '—' : '…'})
                      </span>
                    </label>
                  )
                })}
                {filteredCatalog.length === 0 ? <div className="enzyme-add-empty">No enzymes match.</div> : null}
              </div>
              {allEnzymeScan.pending ? <div className="enzyme-add-status">Calculating cut sites…</div> : null}
              {allEnzymeScan.error ? <div className="enzyme-add-status is-error">Could not calculate cut sites.</div> : null}
            </div>
          ) : null}
        </div>
        <div className={`enzyme-actions-picker${actionsMenuOpen ? ' is-open' : ''}`} ref={actionsRootRef}>
          <button
            type="button"
            className="enzyme-actions-trigger"
            aria-expanded={actionsMenuOpen}
            aria-haspopup="menu"
            onClick={() => setActionsMenuOpen((open) => !open)}
          >
            Actions <span aria-hidden>▾</span>
          </button>
          {actionsMenuOpen ? (
            <div className="enzyme-actions-menu" role="menu" aria-label="Enzyme visibility actions">
              <button type="button" role="menuitem" disabled={hiddenNames.length === 0} onClick={showAllEnzymes}>
                Show All Enzymes
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={selectedHiddenCount === 0}
                onClick={() => showNames(selectedEnzymeNames)}
              >
                Show Selected Enzymes
              </button>
              <div className="enzyme-actions-divider" role="separator" />
              <button type="button" role="menuitem" disabled={enzymeSetNames.length === 0} onClick={() => hideNames(enzymeSetNames)}>
                Hide All Enzymes
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={selectedEnzymeNames.length === 0 || selectedHiddenCount === selectedEnzymeNames.length}
                onClick={() => hideNames(selectedEnzymeNames)}
              >
                Hide Selected Enzymes
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!hasSequenceSelection || selectedCutNames.size === 0}
                onClick={() => hideNames(selectedCutNames)}
              >
                Hide Enzymes That Cut Inside the Selection
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!hasSequenceSelection || selectedOutsideCutNames.size === 0}
                onClick={() => hideNames(selectedOutsideCutNames)}
              >
                Hide Enzymes That Cut Outside the Selection
              </button>
            </div>
          ) : null}
        </div>
        <button type="button" className="enzyme-noncutters-trigger" onClick={() => setNoncuttersOpen(true)}>
          Noncutters
        </button>
        <span className="muted enzymes-tab-toolbar-count">
          {enzymeCount} enzyme{enzymeCount === 1 ? '' : 's'}
        </span>
      </div>
      {chooseOpen && chooseDraft && (
        <ChooseEnzymesDialog
          recordName={recordName}
          draft={chooseDraft}
          preferences={enzymePreferences}
          fileEnzymeSets={fileEnzymeSets}
          sequence={sequence}
          topology={topology}
          construct={construct}
          selectedRange={selectedRange}
          onDraftChange={(patch) => setChooseDraft((current) => (current ? { ...current, ...patch } : current))}
          onPreferencesChange={onPreferencesChange}
          onFileEnzymeSetsChange={onFileEnzymeSetsChange}
          onCancel={() => {
            setChooseOpen(false)
            setChooseDraft(null)
          }}
          onConfirm={confirmChooseDialog}
        />
      )}
      {preferencesOpen && (
        <EnzymePreferencesDialog
          preferences={enzymePreferences}
          onCancel={() => setPreferencesOpen(false)}
          onConfirm={(preferences) => {
            onPreferencesChange(preferences)
            setPreferencesOpen(false)
          }}
        />
      )}
      {noncuttersOpen && (
        <NoncuttersDialog
          recordName={recordName}
          noncutters={noncutters}
          onClose={() => setNoncuttersOpen(false)}
          onEnzymeInfo={onEnzymeInfo}
        />
      )}
    </>
  )
}
export function EnzymeSidebarControl({
  settings,
  enzymePreferences,
  fileEnzymeSets = [],
  restrictionSites,
  parentalRestrictionSites,
  recordName,
  sequence,
  topology,
  construct,
  selectedRange,
  updateSection,
  onEnzymeInfo,
  onPreferencesChange,
  onFileEnzymeSetsChange,
}: {
  settings: DisplaySettings
  enzymePreferences: EnzymePreferences
  fileEnzymeSets?: SavedEnzymeSet[]
  restrictionSites: RestrictionSiteList
  parentalRestrictionSites: RestrictionSiteList
  recordName: string
  sequence: string
  topology: SequenceRecord['topology']
  construct: SequenceRecord['construct']
  selectedRange: SelectionRange | null
  updateSection: <Key extends keyof DisplaySettings>(key: Key, patch: Partial<DisplaySettings[Key]>) => void
  onEnzymeInfo: (enzymeName: string) => void
  onPreferencesChange: (preferences: EnzymePreferences) => void
  onFileEnzymeSetsChange?: (sets: SavedEnzymeSet[]) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [chooseOpen, setChooseOpen] = useState(false)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [noncuttersOpen, setNoncuttersOpen] = useState(false)
  const [chooseDraft, setChooseDraft] = useState<ChooseEnzymesDraft | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const activePool = useMemo(
    () => enzymePoolForSettings(settings.enzymes, enzymePreferences),
    [enzymePreferences, settings.enzymes],
  )
  const counts = useMemo(() => enzymeSiteCounts(restrictionSites), [restrictionSites])
  const noncutters = useMemo(
    () =>
      activePool
        .map((enzyme) => enzyme.name)
        .filter((name) => !(counts[name] ?? 0))
        .toSorted((left, right) => left.localeCompare(right)),
    [activePool, counts],
  )

  useCloseOnOutsidePointer(menuOpen, rootRef, setMenuOpen)

  const enzymesOn = settings.enzymes.visible

  function selectSet(set: EnzymeSetMode) {
    updateSection('enzymes', { set, visible: true, supplierSetId: set === 'supplier' ? settings.enzymes.supplierSetId : null })
    setMenuOpen(false)
  }

  function selectSupplier(supplierId: EnzymeManufacturerId) {
    updateSection('enzymes', { set: 'supplier', supplierSetId: supplierId, visible: true })
    setMenuOpen(false)
  }

  function selectSavedSet(savedSetId: string) {
    const saved = enzymePreferences.savedEnzymeSets.find((entry) => entry.id === savedSetId)
    if (!saved) return
    updateSection('enzymes', {
      set: 'custom',
      selectedNames: [...saved.enzymeNames],
      supplierSetId: null,
      visible: true,
    })
    setMenuOpen(false)
  }

  function selectFileSet(savedSetId: string) {
    const saved = fileEnzymeSets.find((entry) => entry.id === savedSetId)
    if (!saved) return
    updateSection('enzymes', {
      set: 'custom',
      selectedNames: [...saved.enzymeNames],
      supplierSetId: null,
      visible: true,
    })
    setMenuOpen(false)
  }

  function openPreferencesDialog() {
    setMenuOpen(false)
    setPreferencesOpen(true)
  }

  function openChooseDialog() {
    setMenuOpen(false)
    setChooseDraft(createChooseEnzymesDraft(settings.enzymes))
    setChooseOpen(true)
  }

  function confirmChooseDialog(selectedNames: string[]) {
    updateSection('enzymes', { set: 'custom', selectedNames, visible: true })
    setChooseOpen(false)
    setChooseDraft(null)
  }

  return (
    <>
      <div className={`sidebar-enzyme-split ${enzymesOn ? 'is-on' : ''} ${menuOpen ? 'menu-open' : ''}`} ref={rootRef}>
        <button
          type="button"
          className="sidebar-enzyme-toggle"
          title={enzymesOn ? 'Hide restriction enzymes' : 'Show restriction enzymes'}
          aria-pressed={enzymesOn}
          onClick={() => updateSection('enzymes', { visible: !enzymesOn })}
        >
          <img src="/enzyme-icon.png" alt="" className="sidebar-enzyme-icon" width={22} height={22} />
        </button>
        <button
          type="button"
          className="sidebar-enzyme-menu-trigger"
          title="Choose restriction enzymes"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="sidebar-enzyme-caret" aria-hidden>
            ▾
          </span>
        </button>
        {menuOpen && (
          <EnzymeSetMenu
            className="sidebar-menu sidebar-enzyme-picker"
            settings={settings}
            preferences={enzymePreferences}
            fileEnzymeSets={fileEnzymeSets}
            parentalRestrictionSites={parentalRestrictionSites}
            onSelectSet={selectSet}
            onSelectSupplier={selectSupplier}
            onSelectSavedSet={selectSavedSet}
            onSelectFileSet={selectFileSet}
            onChooseEnzymes={openChooseDialog}
            onShowNoncutters={() => {
              setMenuOpen(false)
              setNoncuttersOpen(true)
            }}
            onOpenPreferences={openPreferencesDialog}
          />
        )}
      </div>
      {chooseOpen && chooseDraft && (
        <ChooseEnzymesDialog
          recordName={recordName}
          draft={chooseDraft}
          preferences={enzymePreferences}
          fileEnzymeSets={fileEnzymeSets}
          sequence={sequence}
          topology={topology}
          construct={construct}
          selectedRange={selectedRange}
          onDraftChange={(patch) => setChooseDraft((current) => (current ? { ...current, ...patch } : current))}
          onPreferencesChange={onPreferencesChange}
          onFileEnzymeSetsChange={onFileEnzymeSetsChange}
          onCancel={() => { setChooseOpen(false); setChooseDraft(null) }}
          onConfirm={confirmChooseDialog}
        />
      )}
      {preferencesOpen && (
        <EnzymePreferencesDialog
          preferences={enzymePreferences}
          onCancel={() => setPreferencesOpen(false)}
          onConfirm={(preferences) => {
            onPreferencesChange(preferences)
            setPreferencesOpen(false)
          }}
        />
      )}
      {noncuttersOpen && (
        <NoncuttersDialog
          recordName={recordName}
          noncutters={noncutters}
          onClose={() => setNoncuttersOpen(false)}
          onEnzymeInfo={onEnzymeInfo}
        />
      )}
    </>
  )
}
