import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CommonFeaturePreviewWorkspace } from './CommonFeaturePreviewWorkspace'
import type { CloningWorkspaceRenderArgs } from './cloningWorkspaceTypes'
import {
  loadBuiltInCommonFeatures,
  type CommonFeatureTemplate,
} from './domain/commonFeatures'
import {
  addUserCommonFeatures,
  listUserCommonFeatures,
  MIN_COMMON_FEATURE_LENGTH_BP,
  writeUserCommonFeatures,
} from './storage/userCommonFeatures'
import { MobilePaneTabs } from './ui/MobilePaneTabs'

type LibrarySource = 'standard' | 'user'

type CommonFeaturesBrowseDialogProps = {
  onCancel: () => void
  renderWorkspace: (args: CloningWorkspaceRenderArgs) => ReactNode
}

export function CommonFeaturesBrowseDialog({
  onCancel,
  renderWorkspace,
}: CommonFeaturesBrowseDialogProps) {
  const [library, setLibrary] = useState<LibrarySource>('standard')
  const [standardTemplates, setStandardTemplates] = useState<CommonFeatureTemplate[]>([])
  const [userTemplates, setUserTemplates] = useState(() => listUserCommonFeatures())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [importMenuOpen, setImportMenuOpen] = useState(false)
  const [mobilePane, setMobilePane] = useState<'list' | 'preview'>('list')
  const importInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const templates = await loadBuiltInCommonFeatures()
        if (cancelled) return
        setStandardTemplates(templates)
        setLoadError(null)
      } catch (error) {
        if (cancelled) return
        setLoadError(error instanceof Error ? error.message : String(error))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const templates = library === 'standard' ? standardTemplates : userTemplates

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const rows = needle
      ? templates.filter(
          (template) =>
            template.name.toLowerCase().includes(needle) ||
            template.type.toLowerCase().includes(needle) ||
            (template.notes ?? '').toLowerCase().includes(needle),
        )
      : templates
    return [...rows].sort((left, right) => left.name.localeCompare(right.name))
  }, [query, templates])

  const [selection, setSelection] = useState<{
    source: CommonFeatureTemplate[]
    id: string | null
  }>({ source: filtered, id: filtered[0]?.id ?? null })
  const effectiveSelectedId = selection.source === filtered ? selection.id : filtered[0]?.id ?? null
  const selected = filtered.find((template) => template.id === effectiveSelectedId) ?? null

  function refreshUserTemplates() {
    setUserTemplates(listUserCommonFeatures())
  }

  function exportUserFeatures() {
    const payload = JSON.stringify(listUserCommonFeatures(), null, 2)
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'vibegene-user-common-features.json'
    anchor.click()
    URL.revokeObjectURL(url)
    setImportMenuOpen(false)
  }

  async function importUserFeatures(file: File) {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as unknown
      if (!Array.isArray(parsed)) throw new Error('Expected a JSON array of features.')
      const templates = parsed.filter(
        (entry): entry is CommonFeatureTemplate =>
          Boolean(entry) &&
          typeof entry === 'object' &&
          typeof (entry as CommonFeatureTemplate).name === 'string' &&
          typeof (entry as CommonFeatureTemplate).sequence === 'string' &&
          (entry as CommonFeatureTemplate).sequence.length >= MIN_COMMON_FEATURE_LENGTH_BP,
      )
      if (!templates.length) {
        throw new Error(`No valid features ≥ ${MIN_COMMON_FEATURE_LENGTH_BP} bp found in file.`)
      }
      addUserCommonFeatures(templates)
      refreshUserTemplates()
      setLibrary('user')
    } catch (error) {
      window.alert(`Could not import features: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setImportMenuOpen(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  function clearUserFeatures() {
    if (!window.confirm('Remove all user common features from this browser?')) return
    writeUserCommonFeatures([])
    refreshUserTemplates()
    setImportMenuOpen(false)
  }

  return (
    <div className="translation-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="translation-dialog enzyme-dialog common-features-browse-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="common-features-browse-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3 id="common-features-browse-title">Browse Common Features</h3>
        <MobilePaneTabs
          label="Common features panes"
          panes={[
            { id: 'list', label: 'List' },
            { id: 'preview', label: 'Feature' },
          ]}
          value={mobilePane}
          onChange={setMobilePane}
        />
        <div className={`common-features-browse-layout mobile-pane-${mobilePane}`}>
          <aside className="common-features-browse-sidebar">
            <label className="common-features-browse-library">
              <span className="visually-hidden-heading">Feature library</span>
              <select
                value={library}
                onChange={(event) => {
                  setLibrary(event.target.value as LibrarySource)
                  setQuery('')
                }}
              >
                <option value="standard">Standard Features</option>
                <option value="user">User Features</option>
              </select>
            </label>
            <input
              type="search"
              className="common-features-browse-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter…"
              aria-label="Filter features"
            />
            <div className="common-features-browse-list" role="listbox" aria-label="Common features">
              {loading && library === 'standard' ? (
                <div className="common-features-browse-list-empty">Loading…</div>
              ) : loadError && library === 'standard' ? (
                <div className="common-features-browse-list-empty">{loadError}</div>
              ) : filtered.length === 0 ? (
                <div className="common-features-browse-list-empty">
                  {library === 'user' ? 'No user features yet.' : 'No matching features.'}
                </div>
              ) : (
                filtered.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    role="option"
                    aria-selected={template.id === effectiveSelectedId}
                    className={`common-features-browse-item${template.id === effectiveSelectedId ? ' is-selected' : ''}`}
                    title={template.name}
                    onClick={() => {
                      setSelection({ source: filtered, id: template.id })
                      setMobilePane('preview')
                    }}
                  >
                    {template.name}
                  </button>
                ))
              )}
            </div>
            <div className="common-features-browse-sidebar-footer">
              <div className="common-features-browse-import">
                <button
                  type="button"
                  className="common-features-browse-import-toggle"
                  aria-expanded={importMenuOpen}
                  onClick={() => setImportMenuOpen((open) => !open)}
                >
                  Import/Export ▾
                </button>
                {importMenuOpen && (
                  <div className="common-features-browse-import-menu" role="menu">
                    <button type="button" role="menuitem" onClick={exportUserFeatures}>
                      Export User Features…
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => importInputRef.current?.click()}
                    >
                      Import User Features…
                    </button>
                    <button type="button" role="menuitem" onClick={clearUserFeatures}>
                      Clear User Features
                    </button>
                  </div>
                )}
                <input
                  ref={importInputRef}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void importUserFeatures(file)
                  }}
                />
              </div>
            </div>
          </aside>

          <div className="common-features-browse-main">
            <CommonFeaturePreviewWorkspace
              template={selected}
              renderWorkspace={renderWorkspace}
            />
            <div className="common-features-browse-main-footer">
              <button type="button" className="primary" onClick={onCancel}>
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
