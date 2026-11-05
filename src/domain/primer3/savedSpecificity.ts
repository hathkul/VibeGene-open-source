import type { Primer } from '../types'
import { SPECIFICITY_DATABASES, type SavedPrimerSpecificity } from './specificity'

const FILE_NAME = 'vibegene-primer-specificity.json'
const MAX_BYTES = 16 * 1024 * 1024

type SavedEntry = { name: string; sequence: string; specificity: SavedPrimerSpecificity }

/** Separate named attachment avoids changing SnapGene's primer XML. */
export function encodeSavedSpecificity(primers: readonly Primer[]) {
  const entries: SavedEntry[] = primers.flatMap((primer) => primer.specificity
    ? [{ name: primer.name, sequence: primer.sequence.toUpperCase(), specificity: primer.specificity }]
    : [])
  if (!entries.length) return null
  const data = new TextEncoder().encode(JSON.stringify({ schema: 'vibegene-primer-specificity', version: 1, entries }))
  if (data.length > MAX_BYTES) throw new Error('Primer specificity results are too large to save in this file.')
  return { name: FILE_NAME, data }
}

function isSavedSpecificity(value: unknown): value is SavedPrimerSpecificity {
  if (!value || typeof value !== 'object') return false
  const item = value as SavedPrimerSpecificity
  const result = item.result
  if (typeof item.primerSequence !== 'string' || typeof item.searchedSequence !== 'string'
    || typeof item.completedAt !== 'string' || !Number.isFinite(Date.parse(item.completedAt))
    || !result || typeof result !== 'object' || !result.searchSet
    || !SPECIFICITY_DATABASES.some((database) => database.id === result.searchSet.database)
    || typeof result.searchSet.organism !== 'string' || typeof result.sequenceLength !== 'number'
    || typeof result.fastSearch !== 'boolean' || typeof result.truncated !== 'boolean'
    || !Array.isArray(result.sites) || result.sites.length > 500) return false
  return result.sites.every((site) => site && typeof site.accession === 'string' && typeof site.title === 'string'
    && (site.strand === 'plus' || site.strand === 'minus')
    && [site.subjectLength, site.low, site.high, site.mismatches, site.threePrimeMismatches].every(Number.isFinite))
}

export function hydrateSavedSpecificity(primers: Primer[], file: { name: string; data: Uint8Array } | undefined): Primer[] {
  if (!file || file.name.toLowerCase() !== FILE_NAME || !file.data.length || file.data.length > MAX_BYTES) return primers
  try {
    const parsed = JSON.parse(new TextDecoder().decode(file.data)) as { schema?: unknown; version?: unknown; entries?: unknown }
    if (parsed.schema !== 'vibegene-primer-specificity' || parsed.version !== 1 || !Array.isArray(parsed.entries)) return primers
    const byIdentity = new Map<string, SavedPrimerSpecificity>()
    for (const entry of parsed.entries) {
      if (entry && typeof entry.name === 'string' && typeof entry.sequence === 'string' && isSavedSpecificity(entry.specificity)) {
        byIdentity.set(JSON.stringify([entry.name, entry.sequence.toUpperCase()]), entry.specificity)
      }
    }
    return primers.map((primer) => {
      const specificity = byIdentity.get(JSON.stringify([primer.name, primer.sequence.toUpperCase()]))
      return specificity ? { ...primer, specificity } : primer
    })
  } catch {
    return primers
  }
}

export const SAVED_SPECIFICITY_FILE_NAME = FILE_NAME
