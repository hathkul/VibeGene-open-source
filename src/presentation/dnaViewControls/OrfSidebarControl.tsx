import { startTransition, useEffect, useRef, useState } from 'react'
import { type DisplaySettings } from '../sequence'
import { orfModeIconByMode, orfModeOrder } from '../sequence'
import { useCloseOnOutsidePointer } from '../hooks/useCloseOnOutsidePointer'
import { TranslationOptionsDialog } from './EnzymeDialogs'
import { orfModeLabel, type OrfTranslationDraft } from './enzymeHelpers'

export function OrfSidebarControl({
  settings,
  updateSection,
}: {
  settings: DisplaySettings
  updateSection: <Key extends keyof DisplaySettings>(key: Key, patch: Partial<DisplaySettings[Key]>) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [translationOpen, setTranslationOpen] = useState(false)
  const [translationDraft, setTranslationDraft] = useState<OrfTranslationDraft | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useCloseOnOutsidePointer(menuOpen, rootRef, setMenuOpen)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key !== ';') return
      event.preventDefault()
      updateSection('orfs', { mode: 'frame-plus-1', visible: true })
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [updateSection])

  function openTranslationDialog() {
    setMenuOpen(false)
    setTranslationDraft({
      minimumLengthAa: settings.orfs.minimumLengthAa,
      requireStartCodon: settings.orfs.requireStartCodon,
      startCodon: settings.orfs.startCodon,
      geneticCode: settings.orfs.geneticCode,
      applyToExistingFeatures: settings.orfs.applyToExistingFeatures,
      preview: settings.orfs.preview,
    })
    setTranslationOpen(true)
  }

  function closeTranslationDialog() {
    setTranslationOpen(false)
    setTranslationDraft(null)
  }

  function confirmTranslationDialog() {
    if (!translationDraft) return
    updateSection('orfs', translationDraft)
    closeTranslationDialog()
  }

  return (
    <>
      <div className={`sidebar-enzyme-split sidebar-orf-split ${settings.orfs.visible ? 'is-on' : ''} ${menuOpen ? 'menu-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="sidebar-enzyme-toggle"
        title={settings.orfs.visible ? 'Hide ORFs' : `Show ORFs (${orfModeLabel(settings.orfs.mode)})`}
        aria-pressed={settings.orfs.visible}
        onClick={() => startTransition(() => updateSection('orfs', { visible: !settings.orfs.visible }))}
      >
        <img src={orfModeIconByMode[settings.orfs.mode]} alt="" className="sidebar-tool-icon" width={22} height={22} />
      </button>
      <button
        type="button"
        className="sidebar-enzyme-menu-trigger"
        title="ORF display options"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span className="sidebar-enzyme-caret" aria-hidden>
          ▾
        </span>
      </button>
      {menuOpen && (
        <div className="sidebar-menu sidebar-orf-picker" role="menu">
          {orfModeOrder.map((mode) => {
            const selected = settings.orfs.mode === mode
            return (
              <button
                key={mode}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className={`orf-mode-item ${selected ? 'is-selected' : ''}`}
                onClick={() => {
                  updateSection('orfs', { mode, visible: true })
                  setMenuOpen(false)
                }}
              >
                <span className="orf-mode-check" aria-hidden>
                  {selected ? '✓' : ''}
                </span>
                <span className="orf-mode-label">{orfModeLabel(mode)}</span>
                {mode === 'frame-plus-1' && <span className="orf-mode-shortcut">⌘;</span>}
              </button>
            )
          })}
          <div className="sidebar-menu-divider" />
          <button type="button" role="menuitem" className="orf-mode-item orf-translation-item" onClick={openTranslationDialog}>
            <span className="orf-mode-check" aria-hidden />
            <span className="orf-mode-label">Translation Options...</span>
          </button>
        </div>
      )}
      </div>
      {translationOpen && translationDraft && (
        <TranslationOptionsDialog
          draft={translationDraft}
          onDraftChange={(patch) => setTranslationDraft((current) => (current ? { ...current, ...patch } : current))}
          onCancel={closeTranslationDialog}
          onConfirm={confirmTranslationDialog}
        />
      )}
    </>
  )
}
