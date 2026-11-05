import type { SaveToolbarMode } from '../application/ports/saveToolbar'
export type { SaveToolbarMode } from '../application/ports/saveToolbar'

const SAVE_TOOLBAR_MODE_KEY = 'vibegene:save-toolbar-mode'


const DEFAULT_SAVE_TOOLBAR_MODE: SaveToolbarMode = 'save'

function isSaveToolbarMode(value: unknown): value is SaveToolbarMode {
  return value === 'save' || value === 'save-dna' || value === 'save-to'
}

export function readSaveToolbarMode(): SaveToolbarMode {
  try {
    const raw = window.localStorage.getItem(SAVE_TOOLBAR_MODE_KEY)
    return isSaveToolbarMode(raw) ? raw : DEFAULT_SAVE_TOOLBAR_MODE
  } catch {
    return DEFAULT_SAVE_TOOLBAR_MODE
  }
}

export function writeSaveToolbarMode(mode: SaveToolbarMode) {
  try {
    window.localStorage.setItem(SAVE_TOOLBAR_MODE_KEY, mode)
  } catch {
    // ignore
  }
}
