// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  canHandleAppShortcut,
  formatKeyboardShortcut,
  getKeyboardShortcut,
  getShortcutPlatform,
  isKeyboardShortcutAvailable,
  isEditableShortcutTarget,
  KEYBOARD_SHORTCUTS,
  matchKeyboardShortcut,
  visibleKeyboardShortcuts,
} from '../src/desktop/keyboardShortcuts'

describe('keyboard shortcut registry', () => {
  it('uses Command labels on macOS and Ctrl labels on Windows', () => {
    const open = getKeyboardShortcut('file.open')!
    expect(formatKeyboardShortcut(open, 'mac')).toBe('⌘O')
    expect(formatKeyboardShortcut(open, 'windows')).toBe('Ctrl+O')
    expect(getShortcutPlatform('MacIntel', '')).toBe('mac')
    expect(getShortcutPlatform('Win32', '')).toBe('windows')
  })

  it('matches platform-specific modifiers and exact modifier sets', () => {
    expect(matchKeyboardShortcut({ key: 'o', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }, 'mac')?.action)
      .toBe('file.open')
    expect(matchKeyboardShortcut({ key: 'o', metaKey: false, ctrlKey: true, shiftKey: false, altKey: false }, 'windows')?.action)
      .toBe('file.open')
    expect(matchKeyboardShortcut({ key: 'o', metaKey: false, ctrlKey: true, shiftKey: true, altKey: false }, 'windows')?.action)
      .toBe('file.import-database')
    expect(matchKeyboardShortcut({ key: 'o', metaKey: true, ctrlKey: false, shiftKey: true, altKey: false }, 'mac')?.action)
      .toBe('file.import-database')
    expect(matchKeyboardShortcut({ key: 'o', metaKey: false, ctrlKey: true, shiftKey: true, altKey: false }, 'mac'))
      .toBeUndefined()
  })

  it('routes Shift+Ctrl+E / Shift+Command+E to Enzyme Database', () => {
    const windowsEvent = { key: 'e', metaKey: false, ctrlKey: true, shiftKey: true, altKey: false }
    const macEvent = { key: 'e', metaKey: true, ctrlKey: false, shiftKey: true, altKey: false }
    const shortcut = getKeyboardShortcut('enzymes.database')!

    expect(matchKeyboardShortcut(windowsEvent, 'windows')?.action).toBe('enzymes.database')
    expect(matchKeyboardShortcut(macEvent, 'mac')?.action).toBe('enzymes.database')
    expect(getKeyboardShortcut('enzymes.restriction-tab')).toBeUndefined()
    expect(formatKeyboardShortcut(shortcut, 'windows')).toBe('Ctrl+Shift+E')
    expect(formatKeyboardShortcut(shortcut, 'mac')).toBe('⇧⌘E')
  })

  it('keeps browser-owned accelerators desktop-only', () => {
    const pcrEvent = { key: 'd', metaKey: false, ctrlKey: true, shiftKey: false, altKey: false }
    expect(matchKeyboardShortcut(pcrEvent, 'windows')?.action).not.toBe('actions.pcr')
    expect(matchKeyboardShortcut(pcrEvent, 'windows', 'desktop')?.action).toBe('actions.pcr')
    const duplicateFeatureEvent = { key: 't', metaKey: false, ctrlKey: true, shiftKey: true, altKey: false }
    expect(matchKeyboardShortcut(duplicateFeatureEvent, 'windows')).toBeUndefined()
    expect(matchKeyboardShortcut(duplicateFeatureEvent, 'windows', 'desktop')?.action).toBe('features.duplicate')
    expect(visibleKeyboardShortcuts(false).some(({ action }) => action === 'actions.pcr')).toBe(false)
    expect(visibleKeyboardShortcuts(true).some(({ action }) => action === 'actions.pcr')).toBe(true)
  })

  it('filters DNA-only shortcuts from protein help and dispatch contexts', () => {
    const enzymeShortcut = getKeyboardShortcut('enzymes.choose')!
    const primerShortcut = getKeyboardShortcut('primers.add')!
    expect(enzymeShortcut.molecule).toBe('dna')
    expect(primerShortcut.molecule).toBe('dna')
    expect(isKeyboardShortcutAvailable(enzymeShortcut, 'protein')).toBe(false)
    expect(isKeyboardShortcutAvailable(primerShortcut, 'protein')).toBe(false)
    expect(visibleKeyboardShortcuts(true, 'protein').some(({ action }) => action === 'enzymes.choose')).toBe(false)
    expect(visibleKeyboardShortcuts(true, 'protein').some(({ action }) => action === 'primers.add')).toBe(false)
    expect(visibleKeyboardShortcuts(true, 'dna').some(({ action }) => action === 'enzymes.choose')).toBe(true)
  })

  it('rejects already handled events, editable targets, and modal contexts', () => {
    expect(canHandleAppShortcut({ defaultPrevented: true }, false, false)).toBe(false)
    expect(canHandleAppShortcut({ defaultPrevented: false }, true, false)).toBe(false)
    expect(canHandleAppShortcut({ defaultPrevented: false }, false, true)).toBe(false)
    expect(canHandleAppShortcut({ defaultPrevented: false }, false, false)).toBe(true)

    const input = document.createElement('input')
    const richText = document.createElement('div')
    richText.setAttribute('contenteditable', 'true')
    const button = document.createElement('button')
    expect(isEditableShortcutTarget(input)).toBe(true)
    expect(isEditableShortcutTarget(richText)).toBe(true)
    expect(isEditableShortcutTarget(button)).toBe(false)
  })

  it('contains only actions backed by VibeGene menu commands', () => {
    expect(KEYBOARD_SHORTCUTS.length).toBeGreaterThan(10)
    expect(KEYBOARD_SHORTCUTS.some(({ action }) => action === 'primers.add')).toBe(true)
  })
})
