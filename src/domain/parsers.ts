import type { SequenceRecord } from "./types"
import { defaultDnaEnds } from "./dnaEnds"
import { normalizeSequenceRecord } from "./constructProperties"
import { isAb1Bytes, parseAb1BytesToSequenceRecord } from "./ab1Parser"
import { opensAsLinearDnaFileName } from "./sequenceTopology"
import { makeRecord } from "./parserRecord"
import { inferProteinSequence, parseFasta } from "./fastaParser"
import { parseEmbl, parseGenBank } from "./flatfileParsers"
import { isVibeGeneConstructJson, parseProjectJson } from "./projectJsonParser"
import { isSnapGeneBytes, parseSnapGene, snapGeneHasReadableSequencePayload } from "./snapGeneParser"
const OLE_COMPOUND_MAGIC = [0xd0, 0xcf, 0x11, 0xe0] as const

function skipUtf8Bom(bytes: Uint8Array): Uint8Array {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return bytes.subarray(3)
  }
  return bytes
}

/** Word/TextEdit documents saved with a sequence extension. */
export function rejectedSequenceDocumentReason(bytes: Uint8Array): string | null {
  const start = skipUtf8Bom(bytes)
  if (
    start.length >= 4 &&
    start[0] === OLE_COMPOUND_MAGIC[0] &&
    start[1] === OLE_COMPOUND_MAGIC[1] &&
    start[2] === OLE_COMPOUND_MAGIC[2] &&
    start[3] === OLE_COMPOUND_MAGIC[3]
  ) {
    return 'Microsoft Office document is not a sequence file'
  }
  const head = new TextDecoder('utf-8', { fatal: false }).decode(start.subarray(0, 16)).trimStart()
  if (head.startsWith('{\\rtf')) return 'Rich Text (RTF) is not a sequence file'
  if (isSnapGeneBytes(bytes) && !snapGeneHasReadableSequencePayload(bytes)) {
    return 'Unsupported SnapGene file: no readable sequence block was found.'
  }
  return null
}

export function parseSequenceFile(text: string, fileName = 'Imported sequence'): SequenceRecord {
  const trimmed = text.trim()
  if (!trimmed) return makeRecord({ name: fileName })
  if (trimmed.startsWith('{\\rtf')) {
    throw new Error('Rich Text (RTF) is not a sequence file')
  }
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (isVibeGeneConstructJson(parsed)) return parseProjectJson(trimmed).record
    } catch {
      // RTF and other brace documents are not VibeGene JSON.
    }
  }
  if (trimmed.startsWith('>')) return forceLinearDnaIfNeeded(parseFasta(trimmed, fileName), fileName)
  if (/^LOCUS\s+/m.test(trimmed)) return forceLinearDnaIfNeeded(parseGenBank(trimmed, fileName), fileName)
  if (/^ID\s+\S+/m.test(trimmed) && (/^SQ\s+/m.test(trimmed) || /^FT\s+/m.test(trimmed))) {
    return forceLinearDnaIfNeeded(parseEmbl(trimmed, fileName), fileName)
  }
  const molecule = inferProteinSequence(text, fileName) ? 'protein' : 'dna'
  return makeRecord({
    name: fileName.replace(/\.[^.]+$/, ''),
    description: 'Imported from raw sequence text',
    molecule,
    topology: molecule === 'protein' || opensAsLinearDnaFileName(fileName) ? 'linear' : 'circular',
    sequence: trimmed,
    ...(molecule === 'dna' && opensAsLinearDnaFileName(fileName) ? { dnaEnds: defaultDnaEnds() } : {}),
  })
}

function forceLinearDnaIfNeeded(record: SequenceRecord, fileName: string): SequenceRecord {
  if (!opensAsLinearDnaFileName(fileName) || record.molecule === 'protein' || record.topology === 'linear') {
    return record
  }
  return normalizeSequenceRecord({
    ...record,
    topology: 'linear',
    dnaEnds: record.dnaEnds ?? defaultDnaEnds(),
  })
}

export function parseSequenceBytes(contents: ArrayBuffer, fileName = 'Imported sequence'): SequenceRecord {
  const bytes = new Uint8Array(contents)
  if (isSnapGeneBytes(bytes)) return parseSnapGene(bytes, fileName)
  if (isAb1Bytes(bytes) || /\.ab1$/i.test(fileName)) {
    return parseAb1BytesToSequenceRecord(bytes, fileName)
  }
  return parseSequenceFile(new TextDecoder().decode(bytes), fileName)
}

export { exportProjectJson, isVibeGeneConstructJson, parseProjectJson } from './projectJsonParser'
export { isSnapGeneBytes, parseSnapGene, parseSnapGeneHistoryNodeDocumentData } from './snapGeneParser'
export { exportSnapGene } from './snapGeneExportParser'
export type { ParsedSnapGeneNotes, SnapGeneHistoryNodeDocumentData } from './snapGeneParser'
export { exportFasta, inferProteinSequence, parseFasta } from './fastaParser'
export { exportGenBank, exportGenPept, parseEmbl, parseGenBank } from './flatfileParsers'
