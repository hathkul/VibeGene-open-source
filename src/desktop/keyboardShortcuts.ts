import type { NativeAppMenuAction } from './nativeAppMenu'

export type ShortcutPlatform = 'mac' | 'windows' | 'other'
export type ShortcutModifier = 'mod' | 'shift' | 'alt'

export type KeyboardShortcut = {
  action: NativeAppMenuAction
  description: string
  key: string
  modifiers: readonly ShortcutModifier[]
  scope?: 'all' | 'desktop'
  molecule?: 'dna' | 'protein'
}

/**
 * Supported, collision-reviewed app shortcuts. The same entries drive native
 * Tauri accelerators, web key handling, and the in-app shortcut reference.
 */
export const KEYBOARD_SHORTCUTS: readonly KeyboardShortcut[] = [
  { action: 'file.open', description: 'Open file', key: 'O', modifiers: ['mod'] },
  { action: 'file.save', description: 'Save', key: 'S', modifiers: ['mod'] },
  { action: 'app.quit', description: 'Quit VibeGene', key: 'Q', modifiers: ['mod'], scope: 'desktop' },
  { action: 'file.import-database', description: 'Import from Sequence Database', key: 'O', modifiers: ['mod', 'shift'] },
  { action: 'edit.undo', description: 'Undo', key: 'Z', modifiers: ['mod'] },
  { action: 'edit.redo', description: 'Redo', key: 'Z', modifiers: ['mod', 'shift'] },
  { action: 'edit.redo', description: 'Redo', key: 'Y', modifiers: ['mod'] },
  { action: 'features.add', description: 'Add Feature', key: 'T', modifiers: ['mod'] },
  { action: 'features.duplicate', description: 'Duplicate Feature', key: 'T', modifiers: ['mod', 'shift'], scope: 'desktop' },
  { action: 'enzymes.choose', description: 'Choose Enzymes', key: 'E', modifiers: ['mod'], molecule: 'dna' },
  { action: 'enzymes.database', description: 'Open Enzyme Database', key: 'E', modifiers: ['mod', 'shift'], molecule: 'dna' },
  { action: 'primers.add', description: 'Add Primer', key: 'R', modifiers: ['mod'], molecule: 'dna' },
  { action: 'view.tab.map', description: 'Map view', key: '1', modifiers: ['mod'], scope: 'desktop' },
  { action: 'view.tab.sequence', description: 'Sequence view', key: '2', modifiers: ['mod'], scope: 'desktop' },
  { action: 'view.tab.enzymes', description: 'Enzymes view', key: '3', modifiers: ['mod'], scope: 'desktop', molecule: 'dna' },
  { action: 'view.tab.properties', description: 'Properties view', key: '3', modifiers: ['mod'], scope: 'desktop', molecule: 'protein' },
  { action: 'view.tab.features', description: 'Features view', key: '4', modifiers: ['mod'], scope: 'desktop' },
  { action: 'view.tab.primers', description: 'Primers view', key: '5', modifiers: ['mod'], scope: 'desktop', molecule: 'dna' },
  { action: 'view.tab.history', description: 'History view', key: '6', modifiers: ['mod'], scope: 'desktop', molecule: 'dna' },
  { action: 'actions.restriction-cloning', description: 'Restriction cloning', key: 'I', modifiers: ['mod', 'shift'], scope: 'desktop', molecule: 'dna' },
  { action: 'actions.pcr', description: 'PCR', key: 'D', modifiers: ['mod'], scope: 'desktop', molecule: 'dna' },
  { action: 'actions.mutagenesis', description: 'Mutagenesis', key: 'J', modifiers: ['mod'], scope: 'desktop', molecule: 'dna' },
  { action: 'tools.agarose-gel', description: 'Simulate DNA gel', key: 'G', modifiers: ['mod', 'shift'], scope: 'desktop', molecule: 'dna' },
  { action: 'tools.dna-mw', description: 'Show DNA molecular weight', key: 'M', modifiers: ['mod', 'shift'], scope: 'desktop', molecule: 'dna' },
  { action: 'edit.uppercase', description: 'Make selection uppercase', key: 'U', modifiers: ['mod', 'shift'] },
  { action: 'edit.lowercase', description: 'Make selection lowercase', key: 'L', modifiers: ['mod', 'shift'] },
]

export function getShortcutPlatform(platform?: string, userAgent?: string): ShortcutPlatform {
  const platformText = platform ?? (typeof navigator === 'undefined' ? '' : navigator.platform)
  const userAgentText = userAgent ?? (typeof navigator === 'undefined' ? '' : navigator.userAgent)
  if (/Mac|iPhone|iPad|iPod/i.test(platformText) || /Mac OS X/i.test(userAgentText)) return 'mac'
  if (/Win/i.test(platformText) || /Windows/i.test(userAgentText)) return 'windows'
  return 'other'
}

export function formatKeyboardShortcut(shortcut: KeyboardShortcut, platform: ShortcutPlatform): string {
  const mod = platform === 'mac' ? '⌘' : 'Ctrl'
  const orderedModifiers = platform === 'mac'
    ? [...shortcut.modifiers].sort((left, right) => (left === 'shift' ? -1 : right === 'shift' ? 1 : 0))
    : shortcut.modifiers
  const parts: string[] = orderedModifiers.map((modifier) => {
    if (modifier === 'mod') return mod
    if (modifier === 'shift') return platform === 'mac' ? '⇧' : 'Shift'
    return platform === 'mac' ? '⌥' : 'Alt'
  })
  parts.push(shortcut.key === ' ' ? 'Space' : shortcut.key)
  return platform === 'mac' ? parts.join('') : parts.join('+')
}

export function toTauriAccelerator(shortcut: KeyboardShortcut): string {
  const modifiers = shortcut.modifiers.map((modifier) =>
    modifier === 'mod' ? 'CmdOrCtrl' : modifier === 'shift' ? 'Shift' : 'Alt',
  )
  return [...modifiers, shortcut.key].join('+')
}

export function getKeyboardShortcut(action: NativeAppMenuAction): KeyboardShortcut | undefined {
  return KEYBOARD_SHORTCUTS.find((shortcut) => shortcut.action === action)
}

export function visibleKeyboardShortcuts(
  desktop: boolean,
  molecule?: 'dna' | 'protein' | 'rna',
): readonly KeyboardShortcut[] {
  return KEYBOARD_SHORTCUTS.filter(
    (shortcut) =>
      (desktop || shortcut.scope !== 'desktop') &&
      isKeyboardShortcutAvailable(shortcut, molecule),
  )
}

export function isKeyboardShortcutAvailable(
  shortcut: KeyboardShortcut,
  molecule?: 'dna' | 'protein' | 'rna',
): boolean {
  return !molecule || !shortcut.molecule || shortcut.molecule === molecule
}

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]'))
}

export function canHandleAppShortcut(
  event: Pick<KeyboardEvent, 'defaultPrevented'>,
  targetIsEditable: boolean,
  hasOpenDialog: boolean,
): boolean {
  return !event.defaultPrevented && !targetIsEditable && !hasOpenDialog
}

export function matchKeyboardShortcut(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>,
  platform: ShortcutPlatform = getShortcutPlatform(),
  surface: 'web' | 'desktop' = 'web',
): KeyboardShortcut | undefined {
  // Mod means Meta on macOS and Ctrl elsewhere. This avoids intercepting a
  // Windows Ctrl shortcut when a synthetic/macOS event happens to set both.
  const modPressed = platform === 'mac' ? event.metaKey : event.ctrlKey
  return KEYBOARD_SHORTCUTS.find((shortcut) => {
    if (shortcut.scope === 'desktop' && surface !== 'desktop') return false
    const wantsMod = shortcut.modifiers.includes('mod')
    const wantsShift = shortcut.modifiers.includes('shift')
    const wantsAlt = shortcut.modifiers.includes('alt')
    return (
      wantsMod === modPressed &&
      wantsShift === event.shiftKey &&
      wantsAlt === event.altKey &&
      event.key.toUpperCase() === shortcut.key.toUpperCase()
    )
  })
}
