import { parseAb1File } from './ab1Parser'
import { SEQUENCE_OPEN_EXTENSIONS } from './fileFormats'
import { isSnapGeneBytes, parseFasta, parseGenBank, parseSequenceFile, parseSnapGene } from './parsers'
import { traceRecordFromSequence } from './sequenceTraceFactory'
import { createId } from './sequence'
import type { TraceFileRecord } from './traceTypes'

const alignmentTraceExtensions = new Set<string>([
  '.ab1',
  ...SEQUENCE_OPEN_EXTENSIONS.filter((ext) => ext !== '.json'),
])

export function isAlignmentTraceFileName(fileName: string) {
  const lower = fileName.toLowerCase()
  const dot = lower.lastIndexOf('.')
  if (dot < 0) return false
  return alignmentTraceExtensions.has(lower.slice(dot))
}

function emptyTraceRecord(fileName: string, parseError: string): TraceFileRecord {
  return {
    id: createId('trace'),
    fileName,
    sequence: '',
    chromatogram: { aTrace: [], tTrace: [], gTrace: [], cTrace: [], basePos: [], baseCalls: [] },
    enabled: true,
    expanded: false,
    showAnnotations: false,
    alignment: null,
    parseError,
  }
}

function traceFromSequenceRecord(sequence: string, fileName: string, displayName?: string, fileLastModified?: number) {
  const trace = traceRecordFromSequence(sequence, displayName ?? fileName, { fileLastModified })
  if (!trace.sequence.length) {
    return { ...trace, parseError: 'No sequence found' }
  }
  return trace
}

export async function parseAlignmentTraceFile(file: File): Promise<TraceFileRecord> {
  const lower = file.name.toLowerCase()

  if (lower.endsWith('.ab1')) {
    return parseAb1File(file)
  }

  if (lower.endsWith('.dna')) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (!isSnapGeneBytes(bytes)) {
        return emptyTraceRecord(file.name, 'Not a valid SnapGene .dna file')
      }
      const record = parseSnapGene(bytes, file.name, { skipTraces: true })
      return traceFromSequenceRecord(record.sequence, file.name, record.name, file.lastModified)
    } catch (error) {
      return emptyTraceRecord(
        file.name,
        error instanceof Error ? error.message : 'Failed to parse SnapGene .dna file',
      )
    }
  }

  try {
    const text = await file.text()
    const trimmed = text.trim()
    if (!trimmed) {
      return emptyTraceRecord(file.name, 'File is empty')
    }

    if (
      lower.endsWith('.gb') ||
      lower.endsWith('.gbk') ||
      lower.endsWith('.flat') ||
      /^LOCUS\s+/m.test(trimmed)
    ) {
      const record = parseGenBank(trimmed)
      return traceFromSequenceRecord(record.sequence, file.name, record.name, file.lastModified)
    }

    if (trimmed.startsWith('>') || lower.endsWith('.fasta') || lower.endsWith('.fa') || lower.endsWith('.fna')) {
      const record = parseFasta(trimmed, file.name)
      return traceFromSequenceRecord(record.sequence, file.name, record.name, file.lastModified)
    }

    const record = parseSequenceFile(trimmed, file.name)
    return traceFromSequenceRecord(record.sequence, file.name, record.name, file.lastModified)
  } catch (error) {
    return emptyTraceRecord(file.name, error instanceof Error ? error.message : 'Failed to parse sequence file')
  }
}

export function parseAlignmentTraceText(text: string, fileName = 'Pasted sequence'): TraceFileRecord | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  try {
    if (/^LOCUS\s+/m.test(trimmed)) {
      const record = parseGenBank(trimmed)
      return traceFromSequenceRecord(record.sequence, fileName, record.name)
    }
    if (trimmed.startsWith('>')) {
      const record = parseFasta(trimmed, fileName)
      return traceFromSequenceRecord(record.sequence, fileName, record.name)
    }
    const record = parseSequenceFile(trimmed, fileName)
    return traceFromSequenceRecord(record.sequence, fileName, record.name)
  } catch (error) {
    return {
      ...traceRecordFromSequence('', fileName),
      parseError: error instanceof Error ? error.message : 'Failed to parse pasted sequence',
    }
  }
}

export async function parseAlignmentTraceFiles(files: FileList | File[]): Promise<TraceFileRecord[]> {
  const list = Array.from(files).filter((file) => isAlignmentTraceFileName(file.name))
  return Promise.all(list.map((file) => parseAlignmentTraceFile(file)))
}
