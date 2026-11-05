import { useRef, useState } from 'react'
import { useCloseOnOutsidePointer } from '../hooks/useCloseOnOutsidePointer'

export function DocumentCrisprMenu({
  canAddSgRna,
  canCloneSgRna,
  canExciseSgRnaRegion,
  canExportSgRnas,
  onDetectCrispr,
  onAddSgRna,
  onDesignSgRna,
  onCloneSgRna,
  onExciseSgRnaRegion,
  onSangerAlleles,
  onExportSgRnas,
}: {
  canAddSgRna: boolean
  canCloneSgRna: boolean
  canExciseSgRnaRegion: boolean
  canExportSgRnas: boolean
  onDetectCrispr: () => void
  onAddSgRna: () => void
  onDesignSgRna: () => void
  onCloneSgRna: () => void
  onExciseSgRnaRegion: () => void
  onSangerAlleles: () => void
  onExportSgRnas: () => void
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
        CRISPR <span className="sidebar-enzyme-caret" aria-hidden>▾</span>
      </button>
      {menuOpen && (
        <div className="toolbar-edit-dropdown" role="menu">
          <button type="button" role="menuitem" className="toolbar-edit-item" onClick={() => run(onDetectCrispr)}>
            <span className="toolbar-edit-check" aria-hidden />
            Detect CRISPR…
          </button>
          <div className="toolbar-edit-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!canAddSgRna}
            onClick={() => run(onAddSgRna)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Add sgRNA…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!canAddSgRna}
            onClick={() => run(onDesignSgRna)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Design sgRNA…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!canCloneSgRna}
            onClick={() => run(onCloneSgRna)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Clone sgRNA…
          </button>
          <button type="button" role="menuitem" className="toolbar-edit-item" disabled={!canExciseSgRnaRegion} title={!canExciseSgRnaRegion ? 'Select two mapped SpCas9, SaCas9, or Cas12a guides with cut sites inside a single-sequence DNA document.' : undefined} onClick={() => run(onExciseSgRnaRegion)}>
            <span className="toolbar-edit-check" aria-hidden />
            Excise Region…
          </button>
          <button type="button" role="menuitem" className="toolbar-edit-item" disabled={!canAddSgRna} onClick={() => run(onSangerAlleles)}>
            <span className="toolbar-edit-check" aria-hidden />
            Alleles from Sanger Data…
          </button>
          <div className="toolbar-edit-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!canExportSgRnas}
            onClick={() => run(onExportSgRnas)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Export sgRNAs…
          </button>
        </div>
      )}
    </div>
  )
}
