import { useEffect } from 'react'
import {
  formatKeyboardShortcut,
  getShortcutPlatform,
  visibleKeyboardShortcuts,
  type ShortcutPlatform,
} from './desktop/keyboardShortcuts'
import { isTauriRuntime } from './desktop/tauriRuntime'

export const KEYBOARD_SHORTCUTS_HELP_TITLE = 'Keyboard Shortcuts'

type KeyboardShortcutsDialogProps = {
  onDismiss: () => void
  platform?: ShortcutPlatform
  desktop?: boolean
  molecule?: 'dna' | 'protein' | 'rna'
}

export function KeyboardShortcutsDialog({
  onDismiss,
  platform = getShortcutPlatform(),
  desktop = isTauriRuntime(),
  molecule,
}: KeyboardShortcutsDialogProps) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onDismiss()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onDismiss])

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onDismiss}>
      <div
        className="translation-dialog dna-library-help-dialog keyboard-shortcuts-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-shortcuts-help-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="keyboard-shortcuts-help-title">{KEYBOARD_SHORTCUTS_HELP_TITLE}</h3>
        <p>Shortcuts are available when a document is active. Text fields and open dialogs keep their normal keyboard behavior.</p>
        <dl className="keyboard-shortcuts-list">
          {visibleKeyboardShortcuts(desktop, molecule).map((shortcut, index) => (
            <div key={`${shortcut.action}:${shortcut.key}:${index}`}>
              <dt>
                {shortcut.description}
                {shortcut.scope === 'desktop' ? <small> (desktop app{shortcut.molecule ? `, ${shortcut.molecule.toUpperCase()} only` : ''})</small> : null}
              </dt>
              <dd><kbd>{formatKeyboardShortcut(shortcut, platform)}</kbd></dd>
            </div>
          ))}
        </dl>
        <div className="translation-dialog-footer">
          <button type="button" className="primary" onClick={onDismiss}>Done</button>
        </div>
      </div>
    </div>
  )
}
