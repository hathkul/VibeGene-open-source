import type { RefObject } from 'react'
import { Menu, PanelLeft, PanelRight } from 'lucide-react'

export type MobileAppBarProps = {
  menuButtonRef: RefObject<HTMLButtonElement | null>
  sidebarButtonRef: RefObject<HTMLButtonElement | null>
  descriptionButtonRef: RefObject<HTMLButtonElement | null>
  documentTitle: string
  menuOpen: boolean
  sidebarOpen: boolean
  descriptionPanelVisible: boolean
  sidePanelAvailable: boolean
  sidePanelLabel: string
  descriptionPanelAvailable: boolean
  onToggleMenu: () => void
  onToggleSidebar: () => void
  onToggleDescriptionPanel: () => void
}

/**
 * Phone app bar: document-menu trigger, document title, and the conditional
 * side-panel / description-panel triggers. Toggle sequencing stays in App,
 * which supplies the behavior-hook setters and panel setter as callbacks.
 */
export function MobileAppBar({
  menuButtonRef,
  sidebarButtonRef,
  descriptionButtonRef,
  documentTitle,
  menuOpen,
  sidebarOpen,
  descriptionPanelVisible,
  sidePanelAvailable,
  sidePanelLabel,
  descriptionPanelAvailable,
  onToggleMenu,
  onToggleSidebar,
  onToggleDescriptionPanel,
}: MobileAppBarProps) {
  return (
    <div className="mobile-app-bar">
      <button
        ref={menuButtonRef}
        type="button"
        className="mobile-app-bar-button"
        aria-label={`${menuOpen ? 'Close' : 'Open'} document menu`}
        aria-controls="mobile-document-menu"
        aria-expanded={menuOpen}
        onClick={onToggleMenu}
      >
        <Menu aria-hidden="true" />
      </button>
      <span
        className="mobile-document-title"
        title={documentTitle}
      >
        {documentTitle}
      </span>
      {sidePanelAvailable ? (
        <button
          ref={sidebarButtonRef}
          type="button"
          className="mobile-app-bar-button"
          aria-label={`${sidebarOpen ? 'Close' : 'Open'} ${sidePanelLabel.toLowerCase()}`}
          aria-controls="mobile-side-panel"
          aria-expanded={sidebarOpen}
          onClick={onToggleSidebar}
        >
          <PanelLeft aria-hidden="true" />
        </button>
      ) : null}
      {descriptionPanelAvailable ? (
        <button
          ref={descriptionButtonRef}
          type="button"
          className="mobile-app-bar-button"
          aria-label={`${descriptionPanelVisible ? 'Close' : 'Open'} description panel`}
          aria-controls="document-description-drawer"
          aria-expanded={descriptionPanelVisible}
          onClick={onToggleDescriptionPanel}
        >
          <PanelRight aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}
