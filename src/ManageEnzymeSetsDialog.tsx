import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createSavedEnzymeSetId,
  type EnzymePreferences,
  type SavedEnzymeSet,
} from './domain/enzymePreferences'
import {
  enzymeSetDownloadFileName,
  formatEnzymeSetTxt,
  mergeEnzymeNameLists,
  overlapEnzymeNameLists,
  parseEnzymeSetsTxt,
  suggestMergedEnzymeSetName,
  suggestOverlapEnzymeSetName,
} from './domain/enzymeSetFile'
import {
  buildManageSavedItems,
  buildManageStandardItems,
  buildManageSupplierItems,
  manageSetKey,
  parseManageSetKey,
  resolveManageSetEnzymes,
  uniqueSavedSetName,
  type ManageSetListItem,
  type ManageSetRef,
} from './domain/manageEnzymeSets'

export type EnzymeSetStorageScope = 'global' | 'file'

type ManageEnzymeSetsDialogProps = {
  recordName: string
  preferences: EnzymePreferences
  fileEnzymeSets: SavedEnzymeSet[]
  parentalCounts: Record<string, number>
  onCancel: () => void
  onConfirm: (result: {
    savedEnzymeSets: SavedEnzymeSet[]
    fileEnzymeSets: SavedEnzymeSet[]
  }) => void
  onDownloadText: (fileName: string, contents: string) => void | Promise<string | null>
}

function listLabel(item: ManageSetListItem) {
  return `${item.label} (${item.count})`
}

function selectionSummary(items: ManageSetListItem[], selectedKeys: string[]): string {
  if (selectedKeys.length === 0) return 'None selected.'
  if (selectedKeys.length === 1) {
    const item = items.find((entry) => entry.key === selectedKeys[0])
    return item ? listLabel(item) : '1 selected.'
  }
  return `${selectedKeys.length} selected.`
}

export function ManageEnzymeSetsDialog({
  recordName,
  preferences,
  fileEnzymeSets,
  parentalCounts,
  onCancel,
  onConfirm,
  onDownloadText,
}: ManageEnzymeSetsDialogProps) {
  const [globalSets, setGlobalSets] = useState<SavedEnzymeSet[]>(() =>
    preferences.savedEnzymeSets.map((set) => ({ ...set, enzymeNames: [...set.enzymeNames] })),
  )
  const [fileSets, setFileSets] = useState<SavedEnzymeSet[]>(() =>
    fileEnzymeSets.map((set) => ({ ...set, enzymeNames: [...set.enzymeNames] })),
  )
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [draftName, setDraftName] = useState('')
  const [draftScope, setDraftScope] = useState<EnzymeSetStorageScope>('global')
  const [importExportOpen, setImportExportOpen] = useState(false)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const importExportRef = useRef<HTMLDivElement | null>(null)

  const standardItems = useMemo(() => buildManageStandardItems(parentalCounts), [parentalCounts])
  const supplierItems = useMemo(() => buildManageSupplierItems(preferences), [preferences])
  const globalItems = useMemo(() => buildManageSavedItems('global', globalSets), [globalSets])
  const fileItems = useMemo(() => buildManageSavedItems('file', fileSets), [fileSets])
  const allItems = useMemo(
    () => [...standardItems, ...supplierItems, ...globalItems, ...fileItems],
    [fileItems, globalItems, standardItems, supplierItems],
  )

  useEffect(() => {
    if (!importExportOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (!importExportRef.current?.contains(event.target as Node)) setImportExportOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [importExportOpen])

  function toggleSelect(key: string, additive: boolean) {
    const item = allItems.find((entry) => entry.key === key)
    const clearingOnlySelection = !additive && selectedKeys.length === 1 && selectedKeys[0] === key
    if (clearingOnlySelection) {
      setDraftName('')
    } else if (!additive && item?.editable && (item.ref.scope === 'global' || item.ref.scope === 'file')) {
      setDraftName(item.label)
      setDraftScope(item.ref.scope)
    }
    setSelectedKeys((current) => {
      if (!additive) return current.includes(key) && current.length === 1 ? [] : [key]
      return current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]
    })
  }

  function resolveSelected(): Array<{ ref: ManageSetRef; name: string; enzymeNames: string[] }> {
    const resolved: Array<{ ref: ManageSetRef; name: string; enzymeNames: string[] }> = []
    for (const key of selectedKeys) {
      const ref = parseManageSetKey(key)
      if (!ref) continue
      const entry = resolveManageSetEnzymes(ref, {
        parentalCounts,
        preferences,
        globalSets,
        fileSets,
      })
      if (!entry) continue
      resolved.push({ ref, ...entry })
    }
    return resolved
  }

  function insertDraftSet(name: string, enzymeNames: string[], preferredScope = draftScope) {
    const targetSets = preferredScope === 'global' ? globalSets : fileSets
    const next: SavedEnzymeSet = {
      id: createSavedEnzymeSetId(),
      name: uniqueSavedSetName(name, targetSets),
      enzymeNames: [...enzymeNames].toSorted((left, right) => left.localeCompare(right)),
    }
    if (preferredScope === 'global') setGlobalSets((current) => [...current, next])
    else setFileSets((current) => [...current, next])
    setDraftName(next.name)
    setDraftScope(preferredScope)
    setSelectedKeys([manageSetKey({ scope: preferredScope, id: next.id })])
  }

  function handleDelete() {
    const editable = resolveSelected().filter((entry) => entry.ref.scope === 'global' || entry.ref.scope === 'file')
    if (editable.length === 0) return
    const removeGlobal = new Set(
      editable.filter((entry) => entry.ref.scope === 'global').map((entry) => entry.ref.id),
    )
    const removeFile = new Set(
      editable.filter((entry) => entry.ref.scope === 'file').map((entry) => entry.ref.id),
    )
    if (removeGlobal.size) setGlobalSets((current) => current.filter((set) => !removeGlobal.has(set.id)))
    if (removeFile.size) setFileSets((current) => current.filter((set) => !removeFile.has(set.id)))
    setSelectedKeys([])
    setDraftName('')
  }

  function handleDuplicate() {
    const selected = resolveSelected()
    if (selected.length === 0) return
    if (selected.length === 1) {
      const only = selected[0]!
      insertDraftSet(`${only.name} copy`, only.enzymeNames)
      return
    }
    insertDraftSet(suggestMergedEnzymeSetName(selected.map((entry) => entry.name)), mergeEnzymeNameLists(selected.map((entry) => entry.enzymeNames)))
  }

  function handleMerge() {
    const selected = resolveSelected()
    if (selected.length === 0) return
    insertDraftSet(
      suggestMergedEnzymeSetName(selected.map((entry) => entry.name)),
      mergeEnzymeNameLists(selected.map((entry) => entry.enzymeNames)),
    )
  }

  function handleOverlap() {
    const selected = resolveSelected()
    if (selected.length < 2) return
    insertDraftSet(
      suggestOverlapEnzymeSetName(selected.map((entry) => entry.name)),
      overlapEnzymeNameLists(selected.map((entry) => entry.enzymeNames)),
    )
  }

  function applyNameToSelection() {
    const name = draftName.trim()
    if (!name || selectedKeys.length !== 1) return
    const ref = parseManageSetKey(selectedKeys[0]!)
    if (!ref || (ref.scope !== 'global' && ref.scope !== 'file')) return
    const renameIn = (sets: SavedEnzymeSet[]) =>
      sets.map((set) => (set.id === ref.id ? { ...set, name } : set))
    if (ref.scope === 'global') setGlobalSets(renameIn)
    else setFileSets(renameIn)
  }

  function moveSelectionToScope(nextScope: EnzymeSetStorageScope) {
    setDraftScope(nextScope)
    if (selectedKeys.length !== 1) return
    const ref = parseManageSetKey(selectedKeys[0]!)
    if (!ref || (ref.scope !== 'global' && ref.scope !== 'file')) return
    if (ref.scope === nextScope) return
    const source = ref.scope === 'global' ? globalSets : fileSets
    const set = source.find((entry) => entry.id === ref.id)
    if (!set) return
    const moved: SavedEnzymeSet = {
      ...set,
      name: uniqueSavedSetName(set.name, nextScope === 'global' ? globalSets : fileSets),
    }
    if (ref.scope === 'global') setGlobalSets((current) => current.filter((entry) => entry.id !== ref.id))
    else setFileSets((current) => current.filter((entry) => entry.id !== ref.id))
    if (nextScope === 'global') setGlobalSets((current) => [...current, moved])
    else setFileSets((current) => [...current, moved])
    setSelectedKeys([manageSetKey({ scope: nextScope, id: moved.id })])
    setDraftName(moved.name)
  }

  function handleImportFiles(files: FileList | null) {
    if (!files?.length) return
    void (async () => {
      const imported: SavedEnzymeSet[] = []
      for (const file of [...files]) {
        const text = await file.text()
        for (const parsed of parseEnzymeSetsTxt(text)) {
          imported.push({
            id: createSavedEnzymeSetId(),
            name: uniqueSavedSetName(
              parsed.name,
              [...globalSets, ...imported],
            ),
            enzymeNames: parsed.enzymeNames,
          })
        }
      }
      if (!imported.length) return
      setGlobalSets((current) => [...current, ...imported])
      setDraftScope('global')
      setSelectedKeys(imported.map((set) => manageSetKey({ scope: 'global', id: set.id })))
      setDraftName(imported[0]?.name ?? '')
    })()
  }

  function handleExportSelected() {
    const selected = resolveSelected()
    if (selected.length === 0) return
    for (const entry of selected) {
      onDownloadText(enzymeSetDownloadFileName(entry.name), formatEnzymeSetTxt(entry.name, entry.enzymeNames))
    }
  }

  function renderList(title: string, items: ManageSetListItem[], tall?: boolean) {
    return (
      <div className={`enzyme-manage-section${tall ? ' is-tall' : ''}`}>
        <div className="enzyme-manage-section-header">{title}</div>
        <div className="enzyme-manage-list" role="listbox" aria-label={title} aria-multiselectable="true">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="option"
              aria-selected={selectedKeys.includes(item.key)}
              className={selectedKeys.includes(item.key) ? 'is-selected' : undefined}
              onClick={(event) => toggleSelect(item.key, event.metaKey || event.ctrlKey || event.shiftKey)}
            >
              {listLabel(item)}
            </button>
          ))}
        </div>
      </div>
    )
  }

  const canDelete = resolveSelected().some((entry) => entry.ref.scope === 'global' || entry.ref.scope === 'file')
  const canDuplicate = selectedKeys.length > 0
  const canMerge = selectedKeys.length > 0
  const canOverlap = selectedKeys.length >= 2
  const fileOnlyLabel = `Only for ${recordName}`

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onCancel}>
      <div
        className="translation-dialog enzyme-dialog enzyme-manage-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Manage Enzyme Sets"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3>Please select one or more enzyme sets.</h3>

        <div className="enzyme-manage-panels">
          {renderList('Standard Enzyme Sets', standardItems)}
          {renderList('Enzyme Suppliers', supplierItems, true)}
          {renderList('Available for All Files', globalItems)}
          {renderList(fileOnlyLabel, fileItems)}
        </div>

        <div className="enzyme-manage-lower">
          <div className="enzyme-manage-status" aria-live="polite">
            {selectionSummary(allItems, selectedKeys)}
          </div>

          <div className="enzyme-manage-actions" role="toolbar" aria-label="Enzyme set actions">
            <button type="button" disabled={!canDelete} onClick={handleDelete}>
              <span className="enzyme-manage-action-glyph is-delete" aria-hidden>
                ✕
              </span>
              <span>Delete</span>
            </button>
            <button type="button" disabled={!canDuplicate} onClick={handleDuplicate}>
              <span className="enzyme-manage-action-glyph is-duplicate" aria-hidden>
                ◯◯
              </span>
              <span>Duplicate</span>
            </button>
            <button type="button" disabled={!canMerge} onClick={handleMerge}>
              <span className="enzyme-manage-action-glyph is-merge" aria-hidden>
                ⋃
              </span>
              <span>Merge</span>
            </button>
            <button type="button" disabled={!canOverlap} onClick={handleOverlap}>
              <span className="enzyme-manage-action-glyph is-overlap" aria-hidden>
                ∩
              </span>
              <span>Overlap</span>
            </button>
          </div>

          <label className="translation-field-row enzyme-manage-name-row">
            <span>Name:</span>
            <input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={applyNameToSelection}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  applyNameToSelection()
                }
              }}
            />
          </label>

          <fieldset className="enzyme-manage-type">
            <legend>Type:</legend>
            <label className="enzyme-manage-type-option">
              <input
                type="radio"
                name="enzyme-set-type"
                checked={draftScope === 'global'}
                onChange={() => moveSelectionToScope('global')}
              />
              <span>Available for all files</span>
            </label>
            <label className="enzyme-manage-type-option">
              <input
                type="radio"
                name="enzyme-set-type"
                checked={draftScope === 'file'}
                onChange={() => moveSelectionToScope('file')}
              />
              <span>{fileOnlyLabel}</span>
            </label>
          </fieldset>

          <div className="translation-actions enzyme-manage-footer">
            <div className="enzyme-manage-import-export" ref={importExportRef}>
              <button
                type="button"
                className="enzyme-manage-import-export-trigger"
                aria-haspopup="menu"
                aria-expanded={importExportOpen}
                onClick={() => setImportExportOpen((open) => !open)}
              >
                Import/Export <span aria-hidden>▾</span>
              </button>
              {importExportOpen && (
                <div className="enzyme-manage-import-export-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setImportExportOpen(false)
                      importInputRef.current?.click()
                    }}
                  >
                    Import Enzyme Sets…
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={selectedKeys.length === 0}
                    onClick={() => {
                      setImportExportOpen(false)
                      handleExportSelected()
                    }}
                  >
                    Export Selected Sets…
                  </button>
                </div>
              )}
              <input
                ref={importInputRef}
                type="file"
                accept=".txt,text/plain"
                multiple
                hidden
                onChange={(event) => {
                  handleImportFiles(event.target.files)
                  event.currentTarget.value = ''
                }}
              />
            </div>
            <div className="enzyme-manage-footer-right">
              <button type="button" onClick={onCancel}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  const name = draftName.trim()
                  let nextGlobal = globalSets
                  let nextFile = fileSets
                  if (name && selectedKeys.length === 1) {
                    const ref = parseManageSetKey(selectedKeys[0]!)
                    if (ref?.scope === 'global') {
                      nextGlobal = globalSets.map((set) => (set.id === ref.id ? { ...set, name } : set))
                    } else if (ref?.scope === 'file') {
                      nextFile = fileSets.map((set) => (set.id === ref.id ? { ...set, name } : set))
                    }
                  }
                  onConfirm({
                    savedEnzymeSets: nextGlobal,
                    fileEnzymeSets: nextFile,
                  })
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
