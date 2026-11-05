import { useRef, useState } from 'react'
import { useCloseOnOutsidePointer } from '../hooks/useCloseOnOutsidePointer'

export function FeatureVisibilityHeaderMenu({
  onCheckAll,
  onUncheckAll,
  checkLabel = 'Check all',
  uncheckLabel = 'Uncheck all',
  title = 'Feature visibility',
}: {
  onCheckAll: () => void
  onUncheckAll: () => void
  checkLabel?: string
  uncheckLabel?: string
  title?: string
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useCloseOnOutsidePointer(menuOpen, rootRef, setMenuOpen)

  return (
    <div className={`feature-visibility-header-menu${menuOpen ? ' menu-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="feature-visibility-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title={title}
        onClick={() => setMenuOpen((open) => !open)}
      >
        ▾
      </button>
      {menuOpen && (
        <div className="feature-visibility-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onCheckAll()
              setMenuOpen(false)
            }}
          >
            {checkLabel}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onUncheckAll()
              setMenuOpen(false)
            }}
          >
            {uncheckLabel}
          </button>
        </div>
      )}
    </div>
  )
}
