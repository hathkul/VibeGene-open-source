import { useRef, useState } from 'react'
import { type DisplaySettings } from '../sequence'
import { useCloseOnOutsidePointer } from '../hooks/useCloseOnOutsidePointer'

export function PrimerSidebarControl({
  settings,
  updateSection,
}: {
  settings: DisplaySettings
  updateSection: <Key extends keyof DisplaySettings>(key: Key, patch: Partial<DisplaySettings[Key]>) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<{ visible: boolean; sgRnasVisible: boolean } | null>(null)
  const { visible, sgRnasVisible } = settings.primers
  const anyOn = visible || sgRnasVisible

  useCloseOnOutsidePointer(menuOpen, rootRef, setMenuOpen)

  function toggleAll() {
    if (anyOn) {
      restoreRef.current = { visible, sgRnasVisible }
      updateSection('primers', { visible: false, sgRnasVisible: false })
      return
    }
    const restore = restoreRef.current
    updateSection('primers', restore && (restore.visible || restore.sgRnasVisible) ? restore : { visible: true, sgRnasVisible: true })
  }

  const items = [
    { key: 'visible', label: 'Primers', checked: visible },
    { key: 'sgRnasVisible', label: 'sgRNAs', checked: sgRnasVisible },
  ] as const

  return (
    <div className={`sidebar-enzyme-split sidebar-primer-split ${anyOn ? 'is-on' : ''} ${menuOpen ? 'menu-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="sidebar-enzyme-toggle"
        title={anyOn ? 'Hide primers and sgRNAs' : 'Show primers and sgRNAs'}
        aria-pressed={anyOn}
        onClick={toggleAll}
      >
        <img src="/primer-icon.png" alt="" className="sidebar-tool-icon" width={22} height={22} />
      </button>
      <button
        type="button"
        className="sidebar-enzyme-menu-trigger"
        title="Primer and sgRNA display options"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span className="sidebar-enzyme-caret" aria-hidden>
          ▾
        </span>
      </button>
      {menuOpen && (
        <div className="sidebar-menu sidebar-orf-picker sidebar-primer-picker" role="menu">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitemcheckbox"
              aria-checked={item.checked}
              className={`orf-mode-item ${item.checked ? 'is-selected' : ''}`}
              onClick={() => updateSection('primers', { [item.key]: !item.checked })}
            >
              <span className="orf-mode-check" aria-hidden>
                {item.checked ? '✓' : ''}
              </span>
              <span className="orf-mode-label">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
