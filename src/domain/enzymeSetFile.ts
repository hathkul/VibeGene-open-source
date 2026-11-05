import { enzymes } from './enzymes'
import type { SavedEnzymeSet } from './enzymePreferences'

const LINE_WIDTH = 78

/** SnapGene-compatible enzyme-set text export. */
export function formatEnzymeSetTxt(name: string, enzymeNames: string[]): string {
  const unique = [...new Set(enzymeNames.map((entry) => entry.trim()).filter(Boolean))].toSorted((left, right) =>
    left.localeCompare(right),
  )
  if (unique.length === 0) return `${name.trim() || 'Enzyme Set'}\n\n`
  const lines: string[] = []
  let current = ''
  for (const enzymeName of unique) {
    const next = current ? `${current}, ${enzymeName}` : enzymeName
    if (current && next.length > LINE_WIDTH) {
      lines.push(`${current},`)
      current = enzymeName
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return `${name.trim() || 'Enzyme Set'}\n\n${lines.join('\n')}\n`
}

export function parseEnzymeSetTxt(text: string): { name: string; enzymeNames: string[] } {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')
  let name = ''
  let bodyStart = 0
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim()
    if (!line) continue
    name = line
    bodyStart = index + 1
    break
  }
  while (bodyStart < lines.length && !lines[bodyStart]!.trim()) bodyStart += 1
  const known = new Set(enzymes.map((enzyme) => enzyme.name))
  const namesByLower = new Map(enzymes.map((enzyme) => [enzyme.name.toLowerCase(), enzyme.name]))
  const enzymeNames: string[] = []
  const seen = new Set<string>()
  for (let index = bodyStart; index < lines.length; index += 1) {
    const line = lines[index]!.trim().replace(/,$/, '')
    if (!line) continue
    for (const part of line.split(',')) {
      const raw = part.trim()
      if (!raw) continue
      const canonical = known.has(raw) ? raw : namesByLower.get(raw.toLowerCase())
      if (!canonical || seen.has(canonical)) continue
      seen.add(canonical)
      enzymeNames.push(canonical)
    }
  }
  return {
    name: name || 'Imported Enzyme Set',
    enzymeNames: enzymeNames.toSorted((left, right) => left.localeCompare(right)),
  }
}

export function parseEnzymeSetsTxt(text: string): Array<{ name: string; enzymeNames: string[] }> {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!normalized) return []
  // SnapGene usually exports one set per file; still accept multiple name/body blocks separated by blank lines.
  const blocks = normalized.split(/\n\s*\n(?=[^\n,]+\n)/)
  if (blocks.length <= 1) return [parseEnzymeSetTxt(normalized)]
  const parsed = blocks.map((block) => parseEnzymeSetTxt(block)).filter((entry) => entry.enzymeNames.length > 0 || entry.name)
  return parsed.length ? parsed : [parseEnzymeSetTxt(normalized)]
}

export function enzymeSetDownloadFileName(name: string): string {
  const safe = name.trim().replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'Enzyme_Set'
  return `${safe}.txt`
}

export function suggestMergedEnzymeSetName(names: string[]): string {
  if (names.length === 0) return 'Merged Enzyme Set'
  if (names.length === 1) return `${names[0]} copy`
  if (names.length === 2) return `${names[0]} + ${names[1]}`
  return `Merged (${names.length} sets)`
}

export function suggestOverlapEnzymeSetName(names: string[]): string {
  if (names.length === 0) return 'Overlapping Enzymes'
  if (names.length === 1) return `${names[0]} overlap`
  return `Overlap of ${names.length} sets`
}

export function mergeEnzymeNameLists(lists: string[][]): string[] {
  const seen = new Set<string>()
  for (const list of lists) {
    for (const name of list) seen.add(name)
  }
  return [...seen].toSorted((left, right) => left.localeCompare(right))
}

export function overlapEnzymeNameLists(lists: string[][]): string[] {
  if (lists.length === 0) return []
  let current = new Set(lists[0])
  for (let index = 1; index < lists.length; index += 1) {
    const next = new Set(lists[index])
    current = new Set([...current].filter((name) => next.has(name)))
  }
  return [...current].toSorted((left, right) => left.localeCompare(right))
}

export function upsertSavedEnzymeSet(
  sets: SavedEnzymeSet[],
  next: SavedEnzymeSet,
): SavedEnzymeSet[] {
  const index = sets.findIndex((entry) => entry.id === next.id)
  if (index < 0) return [...sets, next]
  const copy = [...sets]
  copy[index] = next
  return copy
}
