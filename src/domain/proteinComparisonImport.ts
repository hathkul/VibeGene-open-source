import { parseAb1File } from './ab1Parser'
import { isSnapGeneBytes, parseFasta, parseGenBank, parseSequenceFile, parseSnapGene } from './parsers'
import { createId, normalizeDna, sanitizeProtein } from './sequence'
import type { ProteinComparisonSource, ProteinComparisonSourceKind } from './proteinAlignmentTypes'

export type ProteinComparisonInputKind = ProteinComparisonSourceKind | 'auto'

function sourceFromSequence(
  sequence: string,
  name: string,
  fileName: string | undefined,
  kind: ProteinComparisonSourceKind,
): ProteinComparisonSource {
  return {
    id: createId('protein-comparison'),
    name: name.trim() || fileName || 'Pasted sequence',
    ...(fileName ? { fileName } : {}),
    kind,
    sequence: kind === 'protein' ? sanitizeProtein(sequence).toUpperCase() : normalizeDna(sequence),
    enabled: true,
    disabledFrameShiftKeys: [],
  }
}

/** Build a comparison source from an already-parsed Database construct or CDS peptide. */
export function proteinComparisonSourceFromSequence(
  sequence: string,
  name: string,
  kind: ProteinComparisonSourceKind,
  fileName?: string,
): ProteinComparisonSource | null {
  const source = sourceFromSequence(sequence, name, fileName, kind)
  return source.sequence ? source : null
}

function inferredKind(sequence: string): ProteinComparisonSourceKind {
  const compact = sequence.replace(/^>.*$/gm, '').replace(/[^A-Za-z*]/g, '')
  return compact.length > 0 && /^[ACGTURYSWKMBDHVN]+$/i.test(compact) ? 'dna' : 'protein'
}

export function parseProteinComparisonText(
  text: string,
  name = 'Pasted sequence',
  requestedKind: ProteinComparisonInputKind = 'auto',
): ProteinComparisonSource | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  let sequence = trimmed
  let parsedName = name
  let parsedKind: ProteinComparisonSourceKind | undefined
  if (/^LOCUS\s+/m.test(trimmed)) {
    const record = parseGenBank(trimmed)
    sequence = record.sequence
    parsedName = record.name
    parsedKind = record.molecule === 'protein' ? 'protein' : 'dna'
  } else if (trimmed.startsWith('>')) {
    const record = parseFasta(trimmed, name)
    sequence = record.sequence
    parsedName = record.name
    parsedKind = record.molecule === 'protein' ? 'protein' : 'dna'
  }
  const kind = requestedKind === 'auto' ? parsedKind ?? inferredKind(sequence) : requestedKind
  const source = sourceFromSequence(sequence, parsedName, undefined, kind)
  return source.sequence ? source : null
}

export async function parseProteinComparisonFile(file: File): Promise<ProteinComparisonSource> {
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.ab1')) {
    const trace = await parseAb1File(file)
    if (trace.parseError || !trace.sequence) throw new Error(trace.parseError ?? 'No sequence found')
    return sourceFromSequence(trace.sequence, trace.fileName, file.name, 'dna')
  }
  if (lower.endsWith('.dna') || lower.endsWith('.prot')) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!isSnapGeneBytes(bytes)) throw new Error(`Not a valid SnapGene ${lower.endsWith('.prot') ? '.prot' : '.dna'} file`)
    const record = parseSnapGene(bytes, file.name, { skipTraces: true })
    return sourceFromSequence(record.sequence, record.name, file.name, record.molecule === 'protein' ? 'protein' : 'dna')
  }
  const text = await file.text()
  const trimmed = text.trim()
  if (!trimmed) throw new Error('File is empty')
  const record = /^LOCUS\s+/m.test(trimmed)
    ? parseGenBank(trimmed)
    : trimmed.startsWith('>')
      ? parseFasta(trimmed, file.name)
      : parseSequenceFile(trimmed, file.name)
  return sourceFromSequence(record.sequence, record.name, file.name, record.molecule === 'protein' ? 'protein' : 'dna')
}
