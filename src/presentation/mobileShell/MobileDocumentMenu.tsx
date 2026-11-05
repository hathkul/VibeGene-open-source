import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { shouldCloseMobileDocumentDrawer } from '../../ui/mobileDocumentDrawer'

export type MobileDocumentMenuProps = {
  menuOpen: boolean
  isMobileShell: boolean
  onCloseMenu: () => void
  children: ReactNode
}

/**
 * Mobile document-drawer chrome: backdrop, the `#mobile-document-menu`
 * wrapper with its capture-phase close-on-leaf-action behavior, and the
 * drawer heading. The menu content (actions and document menus) is composed
 * by App as children so the documentMenus boundary stays the owner.
 */
export function MobileDocumentMenu({
  menuOpen,
  isMobileShell,
  onCloseMenu,
  children,
}: MobileDocumentMenuProps) {
  return (
    <>
      {menuOpen ? (
        <button
          type="button"
          className="mobile-drawer-backdrop mobile-menu-backdrop"
          aria-label="Close document menu"
          onClick={onCloseMenu}
        />
      ) : null}
      <div
        id="mobile-document-menu"
        className={`tool-group${menuOpen ? ' mobile-menu-open' : ''}`}
        onClickCapture={(event) => {
          if (!isMobileShell || !menuOpen) return
          if (shouldCloseMobileDocumentDrawer(event.target)) {
            onCloseMenu()
          }
        }}
      >
        <div className="mobile-drawer-heading">
          <strong>Document menu</strong>
          <button type="button" aria-label="Close document menu" onClick={onCloseMenu}>
            <X aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </>
  )
}
