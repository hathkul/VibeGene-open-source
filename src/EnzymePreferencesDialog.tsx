import { useMemo, useState } from 'react'
import {
  buildNonredundantCommercialSet,
  manufacturerCounts,
  manufacturerLabel,
  normalizeEnzymePreferences,
  type EnzymePreferences,
} from './domain/enzymePreferences'
import { enzymes } from './domain/enzymes'
import type { EnzymeManufacturerId } from './domain/types'

type EnzymePreferencesDialogProps = {
  preferences: EnzymePreferences
  onCancel: () => void
  onConfirm: (preferences: EnzymePreferences) => void
}

function moveSupplier(order: EnzymeManufacturerId[], index: number, target: number) {
  if (index < 0 || index >= order.length || target < 0 || target >= order.length || index === target) return order
  const next = [...order]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item!)
  return next
}

export function EnzymePreferencesDialog({ preferences, onCancel, onConfirm }: EnzymePreferencesDialogProps) {
  const [draft, setDraft] = useState(() => normalizeEnzymePreferences(preferences))
  const [selectedSupplierIndex, setSelectedSupplierIndex] = useState(0)
  const supplierCounts = useMemo(() => manufacturerCounts(), [])
  const nonredundantCount = useMemo(
    () => buildNonredundantCommercialSet(draft.supplierOrder, undefined, draft.priorityOrder).length,
    [draft.priorityOrder, draft.supplierOrder],
  )
  const parentalCounts = useMemo(
    () => ({
      all: enzymes.length,
      nonredundant: nonredundantCount,
    }),
    [nonredundantCount],
  )

  function patchDraft(patch: Partial<EnzymePreferences>) {
    setDraft((current) => normalizeEnzymePreferences({ ...current, ...patch }))
  }

  function moveSelected(direction: 'up' | 'down' | 'top') {
    const index = selectedSupplierIndex
    if (index < 0 || index >= draft.supplierOrder.length) return
    if (direction === 'top') {
      patchDraft({ supplierOrder: moveSupplier(draft.supplierOrder, index, 0) })
      setSelectedSupplierIndex(0)
      return
    }
    const target = direction === 'up' ? index - 1 : index + 1
    patchDraft({ supplierOrder: moveSupplier(draft.supplierOrder, index, target) })
    setSelectedSupplierIndex(target)
  }

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onCancel}>
      <div
        className="translation-dialog enzyme-dialog enzyme-preferences-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Set Enzyme Preferences"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3>Set Enzyme Preferences</h3>

        <section className="enzyme-preferences-section">
          <h4>Display &amp; View Options</h4>
          <div className="enzyme-preferences-display-options">
            <label className="enzyme-preferences-option">
              <input
                type="checkbox"
                checked={draft.italicizeNames}
                onChange={(event) => patchDraft({ italicizeNames: event.target.checked })}
              />
              <span>Italicize restriction enzyme names</span>
            </label>
            <label className="enzyme-preferences-option">
              <input
                type="checkbox"
                checked={draft.boldUniqueCutters}
                onChange={(event) => patchDraft({ boldUniqueCutters: event.target.checked })}
              />
              <span>
                Show unique cutters in <strong>bold</strong>
              </span>
            </label>
            <label className="enzyme-preferences-option">
              <input
                type="checkbox"
                checked={draft.greenBluntCutters}
                onChange={(event) => patchDraft({ greenBluntCutters: event.target.checked })}
              />
              <span>
                Show blunt cutters in <span className="enzyme-preferences-green">green</span>
              </span>
            </label>
          </div>
          <div className="enzyme-preferences-default-tab">
            <span>Default tab for Enzymes view:</span>
            <div className="enzyme-position-mode-toggle" role="tablist" aria-label="Default enzymes tab">
              <button
                type="button"
                role="tab"
                aria-selected={draft.defaultTab === 'numbers'}
                className={draft.defaultTab === 'numbers' ? 'is-active' : ''}
                onClick={() => patchDraft({ defaultTab: 'numbers' })}
              >
                Numbers
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={draft.defaultTab === 'lines'}
                className={draft.defaultTab === 'lines' ? 'is-active' : ''}
                onClick={() => patchDraft({ defaultTab: 'lines' })}
              >
                Lines
              </button>
            </div>
          </div>
        </section>

        <section className="enzyme-preferences-section">
          <h4>Enzyme suppliers in order of preference:</h4>
          <div className="enzyme-preferences-supplier-layout">
            <div className="enzyme-preferences-supplier-list" role="listbox" aria-label="Enzyme suppliers">
              {draft.supplierOrder.map((supplierId, index) => (
                <button
                  key={supplierId}
                  type="button"
                  role="option"
                  aria-selected={selectedSupplierIndex === index}
                  className={selectedSupplierIndex === index ? 'is-selected' : ''}
                  onClick={() => setSelectedSupplierIndex(index)}
                >
                  {manufacturerLabel(supplierId)} ({supplierCounts.get(supplierId) ?? 0})
                </button>
              ))}
            </div>
            <div className="enzyme-preferences-supplier-actions">
              <button type="button" disabled={selectedSupplierIndex <= 0} onClick={() => moveSelected('up')}>
                Move Up
              </button>
              <button type="button" disabled={selectedSupplierIndex <= 0} onClick={() => moveSelected('top')}>
                Move to Top
              </button>
              <button
                type="button"
                disabled={selectedSupplierIndex < 0 || selectedSupplierIndex >= draft.supplierOrder.length - 1}
                onClick={() => moveSelected('down')}
              >
                Move Down
              </button>
            </div>
          </div>
          <label className="enzyme-preferences-menu-count">
            <span>List the top</span>
            <select
              value={draft.menuSupplierCount}
              onChange={(event) => patchDraft({ menuSupplierCount: Number(event.target.value) })}
            >
              {draft.supplierOrder.map((_, index) => (
                <option key={index + 1} value={index + 1}>
                  {index + 1}
                </option>
              ))}
            </select>
            <span>suppliers in the program menus</span>
          </label>
        </section>

        <section className="enzyme-preferences-section">
          <label className="enzyme-preferences-parental-set">
            <span>Use</span>
            <select
              value={draft.parentalSet}
              onChange={(event) => patchDraft({ parentalSet: event.target.value as EnzymePreferences['parentalSet'] })}
            >
              <option value="nonredundant">Nonredundant Commercial ({parentalCounts.nonredundant})</option>
              <option value="all">All Commercial ({parentalCounts.all})</option>
            </select>
            <span>
              as the parental enzyme set for Unique Cutters, Unique &amp; Dual Cutters, 6+ Cutters, and Unique 6+
              Cutters
            </span>
          </label>
        </section>

        <div className="translation-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => onConfirm(normalizeEnzymePreferences(draft))}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
