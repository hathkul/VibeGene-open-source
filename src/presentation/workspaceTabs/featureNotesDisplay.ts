import { proteinMolecularWeight } from '../../domain/protein'

export function isFormattedFeatureNote(value: string) {
  return /<\/?(?:html|body|b|strong|i|em|u|s|sup|sub|br|p|div|span|a)(?:\s|>|\/)/i.test(value)
}

export type FeatureNoteDisplayPart =
  | { kind: 'text'; text: string }
  | { kind: 'qualifier'; name: string; value: string | null }

/** Separate qualifiers for display without parsing away or rewriting their values. */
export function featureNotesDisplayParts(notes: string | undefined): FeatureNoteDisplayPart[] {
  if (!notes) return [{ kind: 'text', text: '-' }]
  const starts: Array<{ index: number; format: 'slash' | 'colon' | 'equals' }> = []
  let inQuotes = false
  let escaped = false
  let inTag = false
  for (let index = 0; index < notes.length; index++) {
    const char = notes[index]!
    if (char === '<' && /^<\/?[A-Za-z]/.test(notes.slice(index))) inTag = true
    if (inTag) {
      if (char === '>') inTag = false
      continue
    }
    const boundary = index === 0 || /\s/.test(notes[index - 1]!)
    if (!inQuotes && boundary) {
      if (char === '/' && /^\/[A-Za-z0-9_-]+(?==|\s|$)/.test(notes.slice(index))) {
        starts.push({ index, format: 'slash' })
      } else if (/[A-Za-z0-9_]/.test(char)
        && (starts.length > 0 || !notes.slice(0, index).trim())
        && /^[A-Za-z0-9_-]+:\s+/.test(notes.slice(index))) {
        starts.push({ index, format: 'colon' })
      } else if (/[A-Za-z0-9_]/.test(char)
        && (starts.length > 0 || !notes.slice(0, index).trim())
        && /^[A-Za-z0-9_-]+\s*=/.test(notes.slice(index))) {
        starts.push({ index, format: 'equals' })
      }
    }
    if (char === '"' && !escaped) inQuotes = !inQuotes
    escaped = char === '\\' && !escaped
  }
  if (!starts.length) return [{ kind: 'text', text: notes }]
  const parts: FeatureNoteDisplayPart[] = []
  const prefix = notes.slice(0, starts[0]!.index).trim()
  if (prefix) parts.push({ kind: 'text', text: prefix })
  starts.forEach((start, index) => {
    const raw = notes.slice(start.index, starts[index + 1]?.index ?? notes.length).trim()
    const match = start.format === 'slash'
      ? /^\/([A-Za-z0-9_-]+)(?:\s*=\s*([\s\S]*))?$/.exec(raw)
      : start.format === 'colon'
        ? /^([A-Za-z0-9_-]+):\s+([\s\S]*)$/.exec(raw)
        : /^([A-Za-z0-9_-]+)\s*=\s*([\s\S]*)$/.exec(raw)
    if (!match) {
      parts.push({ kind: 'text', text: raw })
      return
    }
    let value = match[2] ?? null
    if (value !== null && value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    parts.push({ kind: 'qualifier', name: match[1]!, value })
  })
  return parts
}

/** Estimate average unmodified peptide mass; stop symbols are not residues. */
export function translationSummary(value: string): string | null {
  const sequence = value.replace(/\s+/g, '').toUpperCase()
  if (!sequence || !/^[A-Z*]+$/.test(sequence)) return null
  const residues = sequence.replaceAll('*', '')
  if (!residues) return null
  const count = residues.length
  const mass = proteinMolecularWeight(residues)
  return `${count.toLocaleString()} amino acid${count === 1 ? '' : 's'}${mass === null ? ' · weight unavailable' : ` = ${(mass / 1000).toFixed(1)} kDa`}`
}
