import type { Primer3LibrarySource, Primer3SelectionMode } from './types'
import { PRIMER3_BUILTIN_LIBRARY_HUMREP } from './types'
import { PRIMER3_SETTINGS, primer3DefaultSettings } from './settingsCatalog'
import { SPECIFICITY_DATABASES, recommendFastSpecificitySearch, type SpecificitySearchSet } from './specificity'

const STORAGE_KEY = 'vibegene.primer3.dialog.v1'
const MAX_CUSTOM_LIBRARY_BYTES = 512 * 1024

const KNOWN_TAGS = new Set(
  PRIMER3_SETTINGS.map((def) => def.tag).filter((tag) => !tag.startsWith('SEQUENCE_')),
)

export type PersistedMisprimingLibrary =
  | { kind: 'none' }
  | { kind: 'builtin'; id: typeof PRIMER3_BUILTIN_LIBRARY_HUMREP }
  | { kind: 'custom'; name: string; fasta: string }

export type Primer3DialogPersistedState = {
  settings: Record<string, string>
  selectionMode: Primer3SelectionMode
  misprimingLibrary: PersistedMisprimingLibrary
  internalMishybLibrary: PersistedMisprimingLibrary
  specificitySearchSet: SpecificitySearchSet
  specificityFastSearch: boolean
}

export const DEFAULT_SPECIFICITY_SEARCH_SET: SpecificitySearchSet = { database: 'refseq_rna', organism: '9606' }

function defaultPersistedState(): Primer3DialogPersistedState {
  return {
    settings: {},
    selectionMode: 'template',
    misprimingLibrary: { kind: 'none' },
    internalMishybLibrary: { kind: 'none' },
    specificitySearchSet: { ...DEFAULT_SPECIFICITY_SEARCH_SET },
    specificityFastSearch: recommendFastSpecificitySearch(DEFAULT_SPECIFICITY_SEARCH_SET),
  }
}

function normalizeSearchSet(raw: unknown): SpecificitySearchSet {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SPECIFICITY_SEARCH_SET }
  const value = raw as Record<string, unknown>
  const database = SPECIFICITY_DATABASES.find((entry) => entry.id === value.database)?.id
  if (!database || typeof value.organism !== 'string') return { ...DEFAULT_SPECIFICITY_SEARCH_SET }
  return { database, organism: value.organism.trim().slice(0, 120) }
}

function normalizeLibrary(raw: unknown): PersistedMisprimingLibrary {
  if (!raw || typeof raw !== 'object') return { kind: 'none' }
  const value = raw as Record<string, unknown>
  if (value.kind === 'builtin' && value.id === PRIMER3_BUILTIN_LIBRARY_HUMREP) {
    return { kind: 'builtin', id: PRIMER3_BUILTIN_LIBRARY_HUMREP }
  }
  if (value.kind === 'custom' && typeof value.name === 'string' && typeof value.fasta === 'string') {
    const bytes = new TextEncoder().encode(value.fasta).byteLength
    if (bytes <= MAX_CUSTOM_LIBRARY_BYTES) {
      return { kind: 'custom', name: value.name, fasta: value.fasta }
    }
  }
  return { kind: 'none' }
}

function normalizeSelectionMode(raw: unknown): Primer3SelectionMode {
  if (raw === 'template' || raw === 'target' || raw === 'included') return raw
  return 'template'
}

function normalizeSettings(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {}
  const defaults = primer3DefaultSettings()
  const out: Record<string, string> = {}
  for (const [tag, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!KNOWN_TAGS.has(tag) || typeof value !== 'string') continue
    if (value !== defaults[tag]) out[tag] = value
  }
  return out
}

function dialogStorage(): Storage | null {
  return typeof window === 'undefined' ? null : (window.localStorage ?? null)
}

export function loadPrimer3DialogState(): Primer3DialogPersistedState {
  const storage = dialogStorage()
  if (!storage) return defaultPersistedState()
  try {
    const text = storage.getItem(STORAGE_KEY)
    if (!text) return defaultPersistedState()
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== 'object') return defaultPersistedState()
    const record = parsed as Record<string, unknown>
    const specificitySearchSet = normalizeSearchSet(record.specificitySearchSet)
    return {
      settings: normalizeSettings(record.settings),
      selectionMode: normalizeSelectionMode(record.selectionMode),
      misprimingLibrary: normalizeLibrary(record.misprimingLibrary),
      internalMishybLibrary: normalizeLibrary(record.internalMishybLibrary),
      specificitySearchSet,
      specificityFastSearch:
        typeof record.specificityFastSearch === 'boolean'
          ? record.specificityFastSearch
          : recommendFastSpecificitySearch(specificitySearchSet),
    }
  } catch {
    return defaultPersistedState()
  }
}

export function savePrimer3DialogState(state: Primer3DialogPersistedState): void {
  const storage = dialogStorage()
  if (!storage) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore quota / private mode
  }
}

export function persistedLibraryToSource(lib: PersistedMisprimingLibrary): Primer3LibrarySource {
  if (lib.kind === 'builtin') return { kind: 'builtin', id: lib.id }
  if (lib.kind === 'custom') return { kind: 'custom', name: lib.name, fasta: lib.fasta }
  return { kind: 'none' }
}

export function librarySourceToPersisted(lib: Primer3LibrarySource): PersistedMisprimingLibrary {
  if (lib.kind === 'builtin') return { kind: 'builtin', id: lib.id }
  if (lib.kind === 'custom') {
    const bytes = new TextEncoder().encode(lib.fasta).byteLength
    if (bytes <= MAX_CUSTOM_LIBRARY_BYTES) {
      return { kind: 'custom', name: lib.name, fasta: lib.fasta }
    }
  }
  return { kind: 'none' }
}
