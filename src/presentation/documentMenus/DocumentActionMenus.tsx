import { useRef, useState } from 'react'
import { GIBSON_ASSEMBLY_METHODS, gibsonMethodLabel, type GibsonAssemblyMethod } from '../../domain/gibsonAssembly'
import { TA_GC_METHODS, taGcMethodLabel, type TaGcCloningMethod } from '../../domain/taGcCloning'
import { GATEWAY_METHODS, gatewayMethodLabel, type GatewayCloningMethod } from '../../domain/gatewayBpCloning'
import { useCloseOnOutsidePointer } from '../hooks/useCloseOnOutsidePointer'

export function DocumentActionsMenu({
  onRestrictionCloning,
  onDeleteRestrictionFragment,
  onDestroyRestrictionSite,
  onLinearLigation,
  onGibsonAssembly,
  onTaGcCloning,
  onGatewayCloning,
  onMutagenesis,
  onPcr,
}: {
  onRestrictionCloning: () => void
  onDeleteRestrictionFragment: () => void
  onDestroyRestrictionSite: () => void
  onLinearLigation: () => void
  onGibsonAssembly: (method: GibsonAssemblyMethod) => void
  onTaGcCloning: (method: TaGcCloningMethod) => void
  onGatewayCloning: (method: GatewayCloningMethod) => void
  onMutagenesis: () => void
  onPcr: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useCloseOnOutsidePointer(menuOpen, rootRef, setMenuOpen)

  const run = (action: () => void) => {
    action()
    setMenuOpen(false)
  }

  return (
    <div className={`toolbar-edit-menu ${menuOpen ? 'menu-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="toolbar-edit-trigger"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => setMenuOpen((open) => !open)}
      >
        Actions <span className="sidebar-enzyme-caret" aria-hidden>▾</span>
      </button>
      {menuOpen && (
        <div className="toolbar-edit-dropdown" role="menu">
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => run(onRestrictionCloning)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Restriction Cloning…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => run(onDeleteRestrictionFragment)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Delete Restriction Fragment…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => run(onDestroyRestrictionSite)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Destroy Restriction Site…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => run(onLinearLigation)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Linear Ligation…
          </button>
          <div className="toolbar-edit-submenu">
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              className="toolbar-edit-item toolbar-edit-submenu-trigger"
            >
              <span className="toolbar-edit-check" aria-hidden />
              <span className="toolbar-edit-label">Gibson-style assembly</span>
              <span className="toolbar-edit-submenu-arrow" aria-hidden>
                ›
              </span>
            </button>
            <div className="toolbar-edit-submenu-panel">
              {GIBSON_ASSEMBLY_METHODS.map((method) => (
                <button
                  key={method}
                  type="button"
                  role="menuitem"
                  className="toolbar-edit-item"
                  onClick={() => run(() => onGibsonAssembly(method))}
                >
                  <span className="toolbar-edit-check" aria-hidden />
                  {gibsonMethodLabel(method)}
                </button>
              ))}
            </div>
          </div>
          <div className="toolbar-edit-submenu">
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              className="toolbar-edit-item toolbar-edit-submenu-trigger"
            >
              <span className="toolbar-edit-check" aria-hidden />
              <span className="toolbar-edit-label">AT/GC cloning</span>
              <span className="toolbar-edit-submenu-arrow" aria-hidden>
                ›
              </span>
            </button>
            <div className="toolbar-edit-submenu-panel">
              {TA_GC_METHODS.map((method) => (
                <button
                  key={method}
                  type="button"
                  role="menuitem"
                  className="toolbar-edit-item"
                  onClick={() => run(() => onTaGcCloning(method))}
                >
                  <span className="toolbar-edit-check" aria-hidden />
                  {taGcMethodLabel(method)}
                </button>
              ))}
            </div>
          </div>
          <div className="toolbar-edit-submenu">
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              className="toolbar-edit-item toolbar-edit-submenu-trigger"
            >
              <span className="toolbar-edit-check" aria-hidden />
              <span className="toolbar-edit-label">Gateway cloning</span>
              <span className="toolbar-edit-submenu-arrow" aria-hidden>
                ›
              </span>
            </button>
            <div className="toolbar-edit-submenu-panel">
              {GATEWAY_METHODS.map((method) => (
                <button
                  key={method}
                  type="button"
                  role="menuitem"
                  className="toolbar-edit-item"
                  onClick={() => run(() => onGatewayCloning(method))}
                >
                  <span className="toolbar-edit-check" aria-hidden />
                  {gatewayMethodLabel(method)}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => run(onPcr)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            PCR…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => run(onMutagenesis)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Mutagenesis…
          </button>
        </div>
      )}
    </div>
  )
}

export function DocumentToolsMenu({
  dnaTools,
  proteinTools,
  onSimulateAgaroseGel,
  onDoubleDigest,
  onShowDnaMolecularWeight,
  onLetterCodes,
  onGeneticCodeTables,
  onProteinProperties,
}: {
  dnaTools: boolean
  proteinTools: boolean
  onSimulateAgaroseGel: () => void
  onDoubleDigest: () => void
  onShowDnaMolecularWeight: () => void
  onLetterCodes: () => void
  onGeneticCodeTables: () => void
  onProteinProperties: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useCloseOnOutsidePointer(menuOpen, rootRef, setMenuOpen)

  const run = (action: () => void) => {
    action()
    setMenuOpen(false)
  }

  return (
    <div className={`toolbar-edit-menu ${menuOpen ? 'menu-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="toolbar-edit-trigger"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => setMenuOpen((open) => !open)}
      >
        Tools <span className="sidebar-enzyme-caret" aria-hidden>▾</span>
      </button>
      {menuOpen && (
        <div className="toolbar-edit-dropdown" role="menu">
          {proteinTools && (
            <button type="button" role="menuitem" className="toolbar-edit-item" onClick={() => run(onProteinProperties)}>
              <span className="toolbar-edit-check" aria-hidden />
              Protein properties
            </button>
          )}
          {dnaTools && (
            <>
              <button
                type="button"
                role="menuitem"
                className="toolbar-edit-item"
                onClick={() => run(onSimulateAgaroseGel)}
              >
                <span className="toolbar-edit-check" aria-hidden />
                Simulate DNA gel
              </button>
              <button
                type="button"
                role="menuitem"
                className="toolbar-edit-item"
                onClick={() => run(onShowDnaMolecularWeight)}
              >
                <span className="toolbar-edit-check" aria-hidden />
                Show DNA molecular weight
              </button>
              <button
                type="button"
                role="menuitem"
                className="toolbar-edit-item"
                onClick={() => run(onDoubleDigest)}
              >
                <span className="toolbar-edit-check" aria-hidden />
                Double digest…
              </button>
            </>
          )}
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => run(onLetterCodes)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Letter codes
          </button>
          {dnaTools && (
            <button type="button" role="menuitem" className="toolbar-edit-item" onClick={() => run(onGeneticCodeTables)}>
              <span className="toolbar-edit-check" aria-hidden />
              Genetic code tables
            </button>
          )}
        </div>
      )}
    </div>
  )
}
