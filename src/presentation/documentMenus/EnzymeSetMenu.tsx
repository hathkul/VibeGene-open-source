import { useMemo } from 'react'
import { enzymes } from '../../domain/enzymes'
import { isTypeIisEnzyme } from '../../domain/typeIisEnzymes'
import { buildNonredundantCommercialSet, manufacturerCounts, manufacturerLabel, menuSuppliers, type EnzymePreferences, type SavedEnzymeSet } from '../../domain/enzymePreferences'
import { type EnzymeManufacturerId } from '../../domain/types'
import { enzymeSiteCounts } from '../map/mapPrimitives'
import { type DisplaySettings, type EnzymeSetMode, type RestrictionSiteList } from '../sequence'

export function EnzymeSetMenu({
  settings,
  preferences,
  fileEnzymeSets = [],
  parentalRestrictionSites,
  onSelectSet,
  onSelectSupplier,
  onSelectSavedSet,
  onSelectFileSet,
  onChooseEnzymes,
  onShowNoncutters,
  onOpenPreferences,
  onSaveSet,
  className,
  showActions = true,
}: {
  settings: DisplaySettings
  preferences: EnzymePreferences
  fileEnzymeSets?: SavedEnzymeSet[]
  parentalRestrictionSites: RestrictionSiteList
  onSelectSet: (set: EnzymeSetMode) => void
  onSelectSupplier: (supplierId: EnzymeManufacturerId) => void
  onSelectSavedSet: (savedSetId: string) => void
  onSelectFileSet?: (savedSetId: string) => void
  onChooseEnzymes: () => void
  onShowNoncutters: () => void
  onOpenPreferences: () => void
  onSaveSet?: () => void
  className: string
  showActions?: boolean
}) {
  const parentalCounts = useMemo(() => enzymeSiteCounts(parentalRestrictionSites), [parentalRestrictionSites])
  const uniqueCount = Object.values(parentalCounts).filter((count) => count === 1).length
  const uniqueDualCount = Object.values(parentalCounts).filter((count) => count === 1 || count === 2).length
  const enzymesByName = useMemo(() => new Map(enzymes.map((enzyme) => [enzyme.name, enzyme])), [])
  const sixPlusCount = Object.entries(parentalCounts).filter(
    ([name, count]) => count > 0 && (enzymesByName.get(name)?.recognition.length ?? 0) >= 6,
  ).length
  const uniqueSixPlusCount = Object.entries(parentalCounts).filter(
    ([name, count]) => count === 1 && (enzymesByName.get(name)?.recognition.length ?? 0) >= 6,
  ).length
  const nonredundantCount = buildNonredundantCommercialSet(preferences.supplierOrder, undefined, preferences.priorityOrder).length
  const supplierCounts = useMemo(() => manufacturerCounts(), [])
  const menuSupplierEntries = menuSuppliers(preferences)
  const activeSavedSetId = useMemo(() => {
    if (settings.enzymes.set !== 'custom') return null
    const selected = new Set(settings.enzymes.selectedNames)
    return (
      preferences.savedEnzymeSets.find((saved) => {
        if (saved.enzymeNames.length !== selected.size) return false
        return saved.enzymeNames.every((name) => selected.has(name))
      })?.id ?? null
    )
  }, [preferences.savedEnzymeSets, settings.enzymes.selectedNames, settings.enzymes.set])
  const activeFileSetId = useMemo(() => {
    if (settings.enzymes.set !== 'custom' || activeSavedSetId) return null
    const selected = new Set(settings.enzymes.selectedNames)
    return (
      fileEnzymeSets.find((saved) => {
        if (saved.enzymeNames.length !== selected.size) return false
        return saved.enzymeNames.every((name) => selected.has(name))
      })?.id ?? null
    )
  }, [activeSavedSetId, fileEnzymeSets, settings.enzymes.selectedNames, settings.enzymes.set])

  return (
    <div className={className} role="menu">
      <button
        type="button"
        className={`orf-mode-item ${settings.enzymes.set === 'all' ? 'is-selected' : ''}`}
        onClick={() => onSelectSet('all')}
      >
        <span className="orf-mode-check">{settings.enzymes.set === 'all' ? '✓' : ''}</span>
        <span className="orf-mode-label">All Commercial ({enzymes.length})</span>
      </button>
      <button
        type="button"
        className={`orf-mode-item ${settings.enzymes.set === 'nonredundant' ? 'is-selected' : ''}`}
        onClick={() => onSelectSet('nonredundant')}
      >
        <span className="orf-mode-check">{settings.enzymes.set === 'nonredundant' ? '✓' : ''}</span>
        <span className="orf-mode-label">Nonredundant Commercial ({nonredundantCount})</span>
      </button>
      <button type="button" className={`orf-mode-item ${settings.enzymes.set === 'type-iis' ? 'is-selected' : ''}`} onClick={() => onSelectSet('type-iis')}>
        <span className="orf-mode-check">{settings.enzymes.set === 'type-iis' ? '✓' : ''}</span>
        <span className="orf-mode-label">Type IIS ({enzymes.filter(isTypeIisEnzyme).length})</span>
      </button>
      {menuSupplierEntries.map((supplierId) => (
        <button
          key={supplierId}
          type="button"
          className={`orf-mode-item ${settings.enzymes.set === 'supplier' && settings.enzymes.supplierSetId === supplierId ? 'is-selected' : ''}`}
          onClick={() => onSelectSupplier(supplierId)}
        >
          <span className="orf-mode-check">
            {settings.enzymes.set === 'supplier' && settings.enzymes.supplierSetId === supplierId ? '✓' : ''}
          </span>
          <span className="orf-mode-label">
            {manufacturerLabel(supplierId)} ({supplierCounts.get(supplierId) ?? 0})
          </span>
        </button>
      ))}
      {preferences.savedEnzymeSets.length > 0 && (
        <>
          <div className="sidebar-menu-divider" />
          {preferences.savedEnzymeSets.map((saved) => (
            <button
              key={saved.id}
              type="button"
              className={`orf-mode-item ${activeSavedSetId === saved.id ? 'is-selected' : ''}`}
              onClick={() => onSelectSavedSet(saved.id)}
            >
              <span className="orf-mode-check">{activeSavedSetId === saved.id ? '✓' : ''}</span>
              <span className="orf-mode-label">
                {saved.name} ({saved.enzymeNames.length})
              </span>
            </button>
          ))}
        </>
      )}
      {fileEnzymeSets.length > 0 && onSelectFileSet && (
        <>
          <div className="sidebar-menu-divider" />
          {fileEnzymeSets.map((saved) => (
            <button
              key={`file:${saved.id}`}
              type="button"
              className={`orf-mode-item ${activeFileSetId === saved.id ? 'is-selected' : ''}`}
              onClick={() => onSelectFileSet(saved.id)}
            >
              <span className="orf-mode-check">{activeFileSetId === saved.id ? '✓' : ''}</span>
              <span className="orf-mode-label">
                {saved.name} ({saved.enzymeNames.length})
              </span>
            </button>
          ))}
        </>
      )}
      <div className="sidebar-menu-divider" />
      <button type="button" className={`orf-mode-item ${settings.enzymes.set === 'unique' ? 'is-selected' : ''}`} onClick={() => onSelectSet('unique')}>
        <span className="orf-mode-check">{settings.enzymes.set === 'unique' ? '✓' : ''}</span>
        <span className="orf-mode-label">Unique Cutters ({uniqueCount})</span>
      </button>
      <button type="button" className={`orf-mode-item ${settings.enzymes.set === 'unique-dual' ? 'is-selected' : ''}`} onClick={() => onSelectSet('unique-dual')}>
        <span className="orf-mode-check">{settings.enzymes.set === 'unique-dual' ? '✓' : ''}</span>
        <span className="orf-mode-label">Unique & Dual Cutters ({uniqueDualCount})</span>
      </button>
      <button type="button" className={`orf-mode-item ${settings.enzymes.set === 'six-plus' ? 'is-selected' : ''}`} onClick={() => onSelectSet('six-plus')}>
        <span className="orf-mode-check">{settings.enzymes.set === 'six-plus' ? '✓' : ''}</span>
        <span className="orf-mode-label">6+ Cutters ({sixPlusCount})</span>
      </button>
      <button type="button" className={`orf-mode-item ${settings.enzymes.set === 'unique-six-plus' ? 'is-selected' : ''}`} onClick={() => onSelectSet('unique-six-plus')}>
        <span className="orf-mode-check">{settings.enzymes.set === 'unique-six-plus' ? '✓' : ''}</span>
        <span className="orf-mode-label">Unique 6+ Cutters ({uniqueSixPlusCount})</span>
      </button>
      {showActions && (
        <>
          <div className="sidebar-menu-divider" />
          <button type="button" className={`orf-mode-item ${settings.enzymes.set === 'custom' && !activeSavedSetId && !activeFileSetId ? 'is-selected' : ''}`} onClick={onChooseEnzymes}>
            <span className="orf-mode-check">{settings.enzymes.set === 'custom' && !activeSavedSetId && !activeFileSetId ? '✓' : ''}</span>
            <span className="orf-mode-label">Choose Enzymes...</span>
          </button>
          {onSaveSet && (
            <button type="button" className="orf-mode-item" disabled={settings.enzymes.set === 'custom' && settings.enzymes.selectedNames.length === 0} onClick={onSaveSet}>
              <span className="orf-mode-check" />
              <span className="orf-mode-label">Save Enzyme Set...</span>
            </button>
          )}
          <button type="button" className="orf-mode-item" onClick={onOpenPreferences}>
            <span className="orf-mode-check" />
            <span className="orf-mode-label">Set Enzyme Preferences...</span>
          </button>
          <div className="sidebar-menu-divider" />
          <button type="button" className="orf-mode-item" onClick={onShowNoncutters}>
            <span className="orf-mode-check" />
            <span className="orf-mode-label">Noncutters</span>
          </button>
        </>
      )}
    </div>
  )
}
