import type { PointerEvent } from 'react'
import { MobilePaneTabs } from '../../ui/MobilePaneTabs'
import { DatabaseManagerHeader, type DatabaseManagerHeaderProps } from './DatabaseManagerHeader'
import { DatabaseManagerMainSection, type DatabaseManagerMainSectionProps } from './DatabaseManagerMainSection'
import { DatabaseManagerSidebar, type DatabaseManagerSidebarProps } from './DatabaseManagerSidebar'

export type DatabaseManagerShellSidebarResizeCommands = {
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void
  onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void
}

export type DatabaseManagerShellLayoutProps = {
  hybridWindow: boolean
  isMobileShell: boolean
  mobilePane: 'folders' | 'records'
  onMobilePaneChange: (pane: 'folders' | 'records') => void
  sidebarWidth: number
  header: DatabaseManagerHeaderProps | null
  sidebar: DatabaseManagerSidebarProps
  sidebarResize: DatabaseManagerShellSidebarResizeCommands
  main: DatabaseManagerMainSectionProps
}

export function DatabaseManagerShellLayout({
  hybridWindow,
  isMobileShell,
  mobilePane,
  onMobilePaneChange,
  sidebarWidth,
  header,
  sidebar,
  sidebarResize,
  main,
}: DatabaseManagerShellLayoutProps) {
  return (
    <>
      {!hybridWindow && header ? <DatabaseManagerHeader {...header} /> : null}

      <div
        className={`db-manager-body${isMobileShell ? ` mobile-pane-${mobilePane}` : ''}`}
        style={isMobileShell ? undefined : { gridTemplateColumns: `${sidebarWidth}px 5px minmax(0, 1fr)` }}
      >
        <MobilePaneTabs
          label="Database panes"
          panes={[
            { id: 'folders', label: 'Folders' },
            { id: 'records', label: 'Records' },
          ]}
          value={mobilePane}
          onChange={onMobilePaneChange}
        />
        <DatabaseManagerSidebar {...sidebar} />
        <div
          className="db-manager-sidebar-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onPointerDown={sidebarResize.onPointerDown}
          onPointerMove={sidebarResize.onPointerMove}
          onPointerUp={sidebarResize.onPointerUp}
          onPointerCancel={sidebarResize.onPointerCancel}
        />
        <DatabaseManagerMainSection {...main} />
      </div>
    </>
  )
}
