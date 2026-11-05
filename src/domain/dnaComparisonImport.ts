import { parseFasta, parseGenBank, parseSequenceFile, parseSnapGene, isSnapGeneBytes } from './parsers'
import { createId, normalizeDna } from './sequence'
import type { DnaComparisonSource } from './dnaComparisonTypes'

function sourceFromSequence(
  sequence: string,
  name: string,
  fileName?: string,
): DnaComparisonSource {
  return {
    id: createId('dna-comparison'),
    name: name.trim() || fileName || 'Comparison sequence',
    ...(fileName ? { fileName } : {}),
    sequence: normalizeDna(sequence),
    enabled: true,
  }
}

export function dnaComparisonSourceFromSequence(
  sequence: string,
  name: string,
  fileName?: string,
) {
  const source = sourceFromSequence(sequence, name, fileName)
  return source.sequence ? source : null
}

/** Thin comparison-source view of library members (same ids as `traceFiles`). */
export function dnaComparisonSourcesFromLibraryMembers(
  members: readonly { id: string; fileName: string; sequence: string; enabled: boolean; parseError?: string }[],
): DnaComparisonSource[] {
  return members
    .filter((member) => member.sequence.length > 0 && !member.parseError)
    .map((member) => ({
      id: member.id,
      name: member.fileName,
      fileName: member.fileName,
      sequence: normalizeDna(member.sequence),
      enabled: member.enabled,
    }))
}

/** Merge library members (first) with extra homologs; member ids win over duplicate homolog ids. */
export function mergeLibraryMembersIntoDnaComparisonSources(
  members: readonly { id: string; fileName: string; sequence: string; enabled: boolean; parseError?: string }[],
  homologs: readonly DnaComparisonSource[],
): DnaComparisonSource[] {
  const fromMembers = dnaComparisonSourcesFromLibraryMembers(members)
  const memberIds = new Set(fromMembers.map((source) => source.id))
  return [...fromMembers, ...homologs.filter((source) => !memberIds.has(source.id))]
}

function recordToSource(record: ReturnType<typeof parseSequenceFile>, fileName?: string) {
  if (record.molecule === 'protein') throw new Error('Protein sequences cannot be added to a DNA comparison')
  const source = sourceFromSequence(record.sequence, record.name, fileName)
  if (!source.sequence) throw new Error('No DNA sequence found')
  return source
}

export function parseDnaComparisonText(text: string, name = 'Pasted sequence'): DnaComparisonSource | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (/^LOCUS\s+/m.test(trimmed)) return recordToSource(parseGenBank(trimmed))
  if (trimmed.startsWith('>')) return recordToSource(parseFasta(trimmed, name))
  return recordToSource(parseSequenceFile(trimmed, name))
}

export async function parseDnaComparisonFile(file: File): Promise<DnaComparisonSource> {
  if (/\.ab1$/i.test(file.name)) {
    throw new Error('AB1 files belong in sequence trace verification')
  }
  if (/\.dna$/i.test(file.name)) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!isSnapGeneBytes(bytes)) throw new Error('Not a valid SnapGene .dna file')
    return recordToSource(parseSnapGene(bytes, file.name, { skipTraces: true }), file.name)
  }
  const text = await file.text()
  const trimmed = text.trim()
  if (!trimmed) throw new Error('File is empty')
  const record = /^LOCUS\s+/m.test(trimmed)
    ? parseGenBank(trimmed)
    : trimmed.startsWith('>')
      ? parseFasta(trimmed, file.name)
      : parseSequenceFile(trimmed, file.name)
  return recordToSource(record, file.name)
}
