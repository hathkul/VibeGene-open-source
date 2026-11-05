import { useMemo, useRef, useState, type DragEvent as ReactDragEvent } from 'react'
import {
  type MwLadderFavorites,
} from './domain/mwLadderFavorites'
import {
  DEFAULT_MW_LADDER_ID,
  mwSupplierGroupsWithCustom,
  mwLadderById,
  type MwFragmentFormat,
  type MwLadder,
} from './domain/mwLadders'
import {
  createCustomMwLadderId,
  CUSTOM_MW_SUPPLIER,
  listCustomMwLadders,
  upsertCustomMwLadder,
} from './storage/customMwLadders'
import { loadMwLadderFavorites, saveMwLadderFavorites } from './storage/mwLadderFavorites'

type MwLadderPickerProps = {
  selectedLadderId: string
  onSelectLadder: (ladderId: string) => void
}

type DraftBandRow = {
  key: string
  lengthBp: string
  mass: string
  format: MwFragmentFormat
}

function emptyBandRow(): DraftBandRow {
  return {
    key: `row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    lengthBp: '',
    mass: '100',
    format: 'normal',
  }
}

export function MwLadderPicker({ selectedLadderId, onSelectLadder }: MwLadderPickerProps) {
  const [customLadders, setCustomLadders] = useState<MwLadder[]>(() => listCustomMwLadders())
  const [favorites, setFavorites] = useState<MwLadderFavorites>(() =>
    loadMwLadderFavorites(listCustomMwLadders()),
  )
  const [editorOpen, setEditorOpen] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftBands, setDraftBands] = useState<DraftBandRow[]>(() => [emptyBandRow()])
  const [editorError, setEditorError] = useState<string | null>(null)
  const dragIdRef = useRef<string | null>(null)
  const favoriteSet = useMemo(() => new Set(favorites.favoriteIds), [favorites.favoriteIds])
  const supplierGroups = useMemo(
    () => mwSupplierGroupsWithCustom(customLadders),
    [customLadders],
  )

  function commitFavorites(nextIds: string[]) {
    const next = { favoriteIds: nextIds.length > 0 ? nextIds : [DEFAULT_MW_LADDER_ID] }
    setFavorites(next)
    saveMwLadderFavorites(next, customLadders)
  }

  function toggleFavorite(ladderId: string, favorited: boolean) {
    if (favorited) {
      if (favoriteSet.has(ladderId)) return
      commitFavorites([...favorites.favoriteIds, ladderId])
      return
    }
    commitFavorites(favorites.favoriteIds.filter((id) => id !== ladderId))
  }

  function onFavoriteDragStart(ladderId: string, event: ReactDragEvent<HTMLButtonElement>) {
    dragIdRef.current = ladderId
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', ladderId)
  }

  function onFavoriteDragOver(event: ReactDragEvent<HTMLLIElement>) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  function onFavoriteDrop(targetId: string, event: ReactDragEvent<HTMLLIElement>) {
    event.preventDefault()
    const sourceId = dragIdRef.current || event.dataTransfer.getData('text/plain')
    dragIdRef.current = null
    if (!sourceId || sourceId === targetId) return
    const ids = [...favorites.favoriteIds]
    const from = ids.indexOf(sourceId)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0) return
    ids.splice(from, 1)
    ids.splice(to, 0, sourceId)
    commitFavorites(ids)
  }

  function openEditor() {
    setDraftName('')
    setDraftBands([emptyBandRow()])
    setEditorError(null)
    setEditorOpen(true)
  }

  function updateBand(key: string, patch: Partial<DraftBandRow>) {
    setDraftBands((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    )
  }

  function removeBand(key: string) {
    setDraftBands((current) => (current.length <= 1 ? current : current.filter((row) => row.key !== key)))
  }

  function saveCustomMarker() {
    const name = draftName.trim()
    if (!name) {
      setEditorError('Enter a marker name.')
      return
    }
    const fragments = draftBands
      .map((row) => {
        const lengthBp = Number(row.lengthBp)
        const mass = Number(row.mass)
        if (!Number.isFinite(lengthBp) || lengthBp <= 0) return null
        return {
          lengthBp: Math.round(lengthBp),
          mass: Number.isFinite(mass) && mass > 0 ? mass : 1,
          format: row.format,
        }
      })
      .filter((fragment): fragment is NonNullable<typeof fragment> => Boolean(fragment))
      .sort((a, b) => b.lengthBp - a.lengthBp)

    if (fragments.length === 0) {
      setEditorError('Add at least one band with a valid length (bp).')
      return
    }

    const ladder: MwLadder = {
      id: createCustomMwLadderId(name),
      name,
      supplier: CUSTOM_MW_SUPPLIER,
      preferredUnits: 'bp',
      concentration: null,
      url: null,
      isDefault: false,
      fragments,
    }
    const saved = upsertCustomMwLadder(ladder)
    if (!saved) {
      setEditorError('Could not save this marker.')
      return
    }
    const nextCustom = listCustomMwLadders()
    setCustomLadders(nextCustom)
    const nextFavoriteIds = favoriteSet.has(saved.id)
      ? favorites.favoriteIds
      : [...favorites.favoriteIds, saved.id]
    const nextFavorites = { favoriteIds: nextFavoriteIds }
    setFavorites(nextFavorites)
    saveMwLadderFavorites(nextFavorites, nextCustom)
    onSelectLadder(saved.id)
    setEditorOpen(false)
    setEditorError(null)
  }

  const favoriteLadders = favorites.favoriteIds.map((id) => mwLadderById(id, customLadders))

  return (
    <div className="agarose-gel-mw-picker">
      <div className="agarose-gel-mw-picker-header">
        <div className="agarose-gel-mw-picker-title-row">
          <h4>Molecular weight markers</h4>
          <button type="button" className="agarose-gel-mw-create" onClick={openEditor}>
            Create custom marker
          </button>
        </div>
        <p>Top favorite is the default marker for new gels.</p>
      </div>

      {editorOpen && (
        <section className="agarose-gel-mw-editor" aria-label="Create custom marker">
          <label className="agarose-gel-mw-editor-name">
            <span>Marker name</span>
            <input
              type="text"
              value={draftName}
              placeholder="e.g. Lab 1 kb ladder"
              onChange={(event) => setDraftName(event.target.value)}
            />
          </label>
          <div className="agarose-gel-mw-editor-table-wrap">
            <table className="agarose-gel-mw-editor-table">
              <thead>
                <tr>
                  <th>Length (bp)</th>
                  <th>Mass</th>
                  <th>Label</th>
                  <th aria-label="Remove" />
                </tr>
              </thead>
              <tbody>
                {draftBands.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={row.lengthBp}
                        placeholder="1000"
                        onChange={(event) => updateBand(row.key, { lengthBp: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={row.mass}
                        title="Relative DNA mass (controls band brightness)"
                        onChange={(event) => updateBand(row.key, { mass: event.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        value={row.format}
                        onChange={(event) =>
                          updateBand(row.key, { format: event.target.value as MwFragmentFormat })
                        }
                      >
                        <option value="normal">Normal</option>
                        <option value="bold">Bold</option>
                        <option value="hidden">Hidden</option>
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="agarose-gel-mw-editor-remove"
                        disabled={draftBands.length <= 1}
                        onClick={() => removeBand(row.key)}
                        aria-label="Remove band row"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {editorError ? <div className="agarose-gel-mw-editor-error">{editorError}</div> : null}
          <div className="agarose-gel-mw-editor-actions">
            <button type="button" onClick={() => setDraftBands((current) => [...current, emptyBandRow()])}>
              Add row
            </button>
            <button type="button" className="primary" onClick={saveCustomMarker}>
              Save
            </button>
            <button type="button" onClick={() => setEditorOpen(false)}>
              Cancel
            </button>
          </div>
        </section>
      )}

      <section className="agarose-gel-mw-section">
        <h5>Favorites</h5>
        {favoriteLadders.length === 0 ? (
          <div className="agarose-gel-mw-empty">No favorites yet.</div>
        ) : (
          <ul className="agarose-gel-mw-list agarose-gel-mw-favorites">
            {favoriteLadders.map((ladder, index) => (
              <li
                key={ladder.id}
                className={`agarose-gel-mw-row${selectedLadderId === ladder.id ? ' is-selected' : ''}`}
                onDragOver={onFavoriteDragOver}
                onDrop={(event) => onFavoriteDrop(ladder.id, event)}
              >
                <label className="agarose-gel-mw-fav">
                  <input
                    type="checkbox"
                    checked
                    onChange={() => toggleFavorite(ladder.id, false)}
                    aria-label={`Remove ${ladder.name} from favorites`}
                  />
                </label>
                <button
                  type="button"
                  className="agarose-gel-mw-drag"
                  draggable
                  aria-label={`Drag to reorder ${ladder.name}`}
                  title="Drag to reorder"
                  onDragStart={(event) => onFavoriteDragStart(ladder.id, event)}
                  onDragEnd={() => {
                    dragIdRef.current = null
                  }}
                >
                  ⋮⋮
                </button>
                <button
                  type="button"
                  className="agarose-gel-mw-name"
                  onClick={() => onSelectLadder(ladder.id)}
                  title={index === 0 ? `${ladder.name} (default)` : ladder.name}
                >
                  <span className="agarose-gel-mw-name-text">{ladder.name}</span>
                  {index === 0 ? <span className="agarose-gel-mw-default-tag">default</span> : null}
                  <span className="agarose-gel-mw-supplier-inline">{ladder.supplier}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="agarose-gel-mw-section">
        <h5>All markers</h5>
        <div className="agarose-gel-mw-catalog">
          {supplierGroups.map((group) => (
            <div key={group.supplier} className="agarose-gel-mw-supplier">
              <div className="agarose-gel-mw-supplier-name">{group.supplier}</div>
              <ul className="agarose-gel-mw-list">
                {group.ladders.map((ladder) => (
                  <LadderCatalogRow
                    key={ladder.id}
                    ladder={ladder}
                    selected={selectedLadderId === ladder.id}
                    favorited={favoriteSet.has(ladder.id)}
                    onSelect={() => onSelectLadder(ladder.id)}
                    onToggleFavorite={(favorited) => toggleFavorite(ladder.id, favorited)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function LadderCatalogRow({
  ladder,
  selected,
  favorited,
  onSelect,
  onToggleFavorite,
}: {
  ladder: MwLadder
  selected: boolean
  favorited: boolean
  onSelect: () => void
  onToggleFavorite: (favorited: boolean) => void
}) {
  return (
    <li className={`agarose-gel-mw-row${selected ? ' is-selected' : ''}`}>
      <label className="agarose-gel-mw-fav">
        <input
          type="checkbox"
          checked={favorited}
          onChange={(event) => onToggleFavorite(event.target.checked)}
          aria-label={`${favorited ? 'Remove' : 'Add'} ${ladder.name} ${favorited ? 'from' : 'to'} favorites`}
        />
      </label>
      <button type="button" className="agarose-gel-mw-name" onClick={onSelect} title={ladder.name}>
        <span className="agarose-gel-mw-name-text">{ladder.name}</span>
      </button>
    </li>
  )
}
