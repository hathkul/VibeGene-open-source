import { unzlibSync, zlibSync } from 'fflate'
import { normalizeDnaDocumentData } from './constructProperties'
import { normalizeDna } from './sequence'
import { withPackedLibraryMemberFeatures } from './libraryMemberFeatures'
import {
  encodeSnapGeneAttachmentPackets,
  findSnapGeneAttachment,
  parseSnapGeneAttachments,
  VIBEGENE_DNA_COMPARISON_COMPRESSED_ATTACHMENT_FILE_NAME,
  VIBEGENE_ATTACHMENT_FILE_NAME,
} from './snapgeneAttachments'
import { sequenceRecordJsonReplacer, sequenceRecordJsonReviver } from './sequenceRecordJson'
import type { TraceFileRecord, TraceTemplateAlignment } from './traceTypes'
import type { DnaDocumentData, SequenceRecord } from './types'
import { encodeSavedSpecificity, hydrateSavedSpecificity, SAVED_SPECIFICITY_FILE_NAME } from './primer3/savedSpecificity'

const DNA_COMPARISON_ATTACHMENT_SCHEMA = 'vibegene-dna-comparison' as const
const DNA_COMPARISON_ATTACHMENT_VERSION = 1 as const
const ALIGNMENT_CACHE_FILE_NAME = 'vibegene-alignments.json.zlib'
const ALIGNMENT_CACHE_SCHEMA = 'vibegene-trace-alignments' as const
const ALIGNMENT_CACHE_VERSION = 2 as const
const MAX_ALIGNMENT_CACHE_BYTES = 64 * 1024 * 1024
export const MAX_DNA_COMPARISON_ATTACHMENT_COMPRESSED_BYTES = 64 * 1024 * 1024
export const MAX_DNA_COMPARISON_ATTACHMENT_UNCOMPRESSED_BYTES = 128 * 1024 * 1024

type DnaComparisonAttachment = {
  schema: typeof DNA_COMPARISON_ATTACHMENT_SCHEMA
  schemaVersion: typeof DNA_COMPARISON_ATTACHMENT_VERSION
  dna: DnaDocumentData
}

type AlignmentCacheEntry = {
  index: number
  fileName: string
  sequence: string
  alignment: PackedAlignment
}

type PackedAlignment = Omit<TraceTemplateAlignment, 'columns'> & {
  columnCount: number
  columnsEncoded: string
}

type AlignmentCacheAttachment = {
  schema: typeof ALIGNMENT_CACHE_SCHEMA
  schemaVersion: typeof ALIGNMENT_CACHE_VERSION
  consensus: string
  topology: 'linear' | 'circular'
  entries: AlignmentCacheEntry[]
}

function writeSignedVarint(bytes: number[], delta: number) {
  let value = delta >= 0 ? delta * 2 : -delta * 2 - 1
  while (value >= 128) {
    bytes.push((value % 128) + 128)
    value = Math.floor(value / 128)
  }
  bytes.push(value)
}

function encodeAlignmentColumns(alignment: TraceTemplateAlignment): string {
  const bytes: number[] = []
  let templateIndex = 0
  let traceIndex = 0
  for (const column of alignment.columns) {
    if (column.kind === 'match') {
      bytes.push(column.match ? 0 : 1)
      writeSignedVarint(bytes, column.templateIndex - templateIndex)
      writeSignedVarint(bytes, column.traceIndex - traceIndex)
      templateIndex = column.templateIndex
      traceIndex = column.traceIndex
    } else if (column.kind === 'templateGap') {
      bytes.push(2)
      writeSignedVarint(bytes, column.templateIndex - templateIndex)
      templateIndex = column.templateIndex
    } else {
      bytes.push(3)
      writeSignedVarint(bytes, column.traceIndex - traceIndex)
      traceIndex = column.traceIndex
    }
  }
  const packed = new Uint8Array(bytes)
  let binary = ''
  for (let offset = 0; offset < packed.length; offset += 8192) {
    binary += String.fromCharCode(...packed.subarray(offset, offset + 8192))
  }
  return btoa(binary)
}

function packAlignment(alignment: TraceTemplateAlignment): PackedAlignment {
  return {
    templateStart: alignment.templateStart,
    templateEnd: alignment.templateEnd,
    traceStart: alignment.traceStart,
    traceEnd: alignment.traceEnd,
    mismatchCount: alignment.mismatchCount,
    gapCount: alignment.gapCount,
    orientation: alignment.orientation,
    alignmentScore: alignment.alignmentScore,
    columnCount: alignment.columns.length,
    columnsEncoded: encodeAlignmentColumns(alignment),
  }
}

function decodeAlignment(value: unknown, templateLength: number, traceLength: number): TraceTemplateAlignment | null {
  if (!value || typeof value !== 'object') return null
  const packed = value as Partial<PackedAlignment>
  if (
    !Number.isInteger(packed.columnCount)
    || Number(packed.columnCount) > templateLength + traceLength
    || Number(packed.columnCount) < 0
    || typeof packed.columnsEncoded !== 'string'
  ) return null
  try {
    const binary = atob(packed.columnsEncoded)
    let offset = 0
    let templateIndex = 0
    let traceIndex = 0
    const readSignedVarint = () => {
      let value = 0
      let factor = 1
      for (let count = 0; count < 9; count += 1) {
        if (offset >= binary.length) throw new Error('Truncated alignment cache')
        const byte = binary.charCodeAt(offset++)
        value += (byte % 128) * factor
        if (!Number.isSafeInteger(value)) throw new Error('Invalid alignment coordinate')
        if (byte < 128) return value % 2 === 0 ? value / 2 : -(value + 1) / 2
        factor *= 128
      }
      throw new Error('Invalid alignment coordinate')
    }
    const columns: TraceTemplateAlignment['columns'] = []
    for (let index = 0; index < packed.columnCount!; index += 1) {
      if (offset >= binary.length) return null
      const kind = binary.charCodeAt(offset++)
      if (kind === 0 || kind === 1) {
        templateIndex += readSignedVarint()
        traceIndex += readSignedVarint()
        columns.push({ kind: 'match', templateIndex, traceIndex, match: kind === 0 })
      } else if (kind === 2) {
        templateIndex += readSignedVarint()
        columns.push({ kind: 'templateGap', templateIndex, traceIndex: -1 })
      } else if (kind === 3) {
        traceIndex += readSignedVarint()
        columns.push({ kind: 'traceInsert', traceIndex })
      } else return null
    }
    if (offset !== binary.length) return null
    const alignment = {
      templateStart: packed.templateStart,
      templateEnd: packed.templateEnd,
      traceStart: packed.traceStart,
      traceEnd: packed.traceEnd,
      mismatchCount: packed.mismatchCount,
      gapCount: packed.gapCount,
      orientation: packed.orientation,
      alignmentScore: packed.alignmentScore,
      columns,
    }
    return validAlignment(alignment, templateLength, traceLength) ? alignment : null
  } catch {
    return null
  }
}

function encodeAlignmentCache(record: SequenceRecord): Uint8Array | null {
  if (record.dna?.documentRole !== 'library') return null
  const entries = (record.traceFiles ?? [])
    .filter((trace) => normalizeDna(trace.sequence || trace.chromatogram.baseCalls.join('')).length > 0)
    .flatMap((trace, index) => (
      trace.alignment && !trace.parseError
        ? [{ index, fileName: trace.fileName, sequence: trace.sequence, alignment: packAlignment(trace.alignment) }]
        : []
    ))
  if (!entries.length) return null
  const payload: AlignmentCacheAttachment = {
    schema: ALIGNMENT_CACHE_SCHEMA,
    schemaVersion: ALIGNMENT_CACHE_VERSION,
    consensus: record.sequence,
    topology: record.topology,
    entries,
  }
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(payload))
    if (bytes.length > MAX_ALIGNMENT_CACHE_BYTES) return null
    const compressed = zlibSync(bytes, { level: 6 })
    const attachment = new Uint8Array(4 + compressed.length)
    new DataView(attachment.buffer).setUint32(0, bytes.length, false)
    attachment.set(compressed, 4)
    return attachment
  } catch {
    // Caching must never prevent export of the standard DNA and trace packets.
    return null
  }
}

function validAlignment(value: unknown, templateLength: number, traceLength: number): value is TraceTemplateAlignment {
  if (!value || typeof value !== 'object') return false
  const alignment = value as Partial<TraceTemplateAlignment>
  const within = (number: unknown, maximum: number) => Number.isInteger(number) && Number(number) >= 0 && Number(number) <= maximum
  if (
    !within(alignment.templateStart, templateLength)
    || !within(alignment.templateEnd, templateLength)
    || !within(alignment.traceStart, traceLength)
    || !within(alignment.traceEnd, traceLength)
    || Number(alignment.templateStart) > Number(alignment.templateEnd)
    || (alignment.orientation === 'forward' && Number(alignment.traceStart) > Number(alignment.traceEnd))
    || !within(alignment.mismatchCount, templateLength + traceLength)
    || !within(alignment.gapCount, templateLength + traceLength)
    || (alignment.orientation !== 'forward' && alignment.orientation !== 'reverse')
    || typeof alignment.alignmentScore !== 'number'
    || !Number.isFinite(alignment.alignmentScore)
    || !Array.isArray(alignment.columns)
    || alignment.columns.length > templateLength + traceLength
  ) return false
  return alignment.columns.every((column) => {
    if (!column || typeof column !== 'object') return false
    if (column.kind === 'match') {
      return within(column.templateIndex, templateLength - 1)
        && within(column.traceIndex, traceLength - 1)
        && typeof column.match === 'boolean'
    }
    if (column.kind === 'templateGap') {
      return within(column.templateIndex, templateLength - 1) && column.traceIndex === -1
    }
    if (column.kind === 'traceInsert') return within(column.traceIndex, traceLength - 1)
    return false
  })
}

/** Restore only coordinates tied to exactly the current consensus and member sequence. */
export function hydrateSnapGeneTraceAlignments(
  traces: TraceFileRecord[],
  consensus: string,
  topology: 'linear' | 'circular',
  attachmentBlocks: readonly Uint8Array[],
): TraceFileRecord[] {
  if (!traces.length || !attachmentBlocks.length) return traces
  try {
    const attachment = findSnapGeneAttachment(attachmentBlocks, ALIGNMENT_CACHE_FILE_NAME)
    if (!attachment || attachment.data.length < 4 || attachment.data.length > MAX_ALIGNMENT_CACHE_BYTES) return traces
    const expectedLength = new DataView(
      attachment.data.buffer,
      attachment.data.byteOffset,
      4,
    ).getUint32(0, false)
    if (expectedLength > MAX_ALIGNMENT_CACHE_BYTES) return traces
    const bytes = unzlibSync(attachment.data.subarray(4), { out: new Uint8Array(expectedLength) })
    if (bytes.length !== expectedLength) return traces
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as Partial<AlignmentCacheAttachment>
    if (
      payload.schema !== ALIGNMENT_CACHE_SCHEMA
      || payload.schemaVersion !== ALIGNMENT_CACHE_VERSION
      || payload.consensus !== consensus
      || payload.topology !== topology
      || !Array.isArray(payload.entries)
      || payload.entries.length > traces.length
    ) return traces
    const restored = [...traces]
    const seen = new Set<number>()
    for (const entry of payload.entries) {
      if (!entry || !Number.isInteger(entry.index) || seen.has(entry.index)) return traces
      const trace = traces[entry.index]
      if (!trace || trace.fileName !== entry.fileName || trace.sequence !== entry.sequence) continue
      const alignment = decodeAlignment(entry.alignment, consensus.length, trace.sequence.length)
      if (!alignment) continue
      seen.add(entry.index)
      restored[entry.index] = { ...trace, alignment }
    }
    return restored
  } catch {
    // An optional cache must never prevent opening the DNA and trace blocks.
    return traces
  }
}

export function encodeDnaComparisonAttachmentPackets(record: SequenceRecord, includeTraces = true) {
  if (record.molecule !== 'dna') return []
  const withMembers = withPackedLibraryMemberFeatures(record, record.traceFiles ?? [])
  const dna = normalizeDnaDocumentData(withMembers.dna)
  const hasDnaMetadata = Boolean(
    dna.comparisonSources?.length
    || dna.comparisonAlignmentCache?.length
    || dna.documentRole === 'library'
    || dna.libraryMemberFeatures?.length
    || dna.libraryMemberPrimers?.length
    || dna.libraryMemberHistory?.length
    || dna.libraryMemberHistoryPool
    || dna.libraryMemberReads?.length
    || dna.genomicAnchor
    || dna.guideScanDesignCache
    || dna.sangerAlleleAnalysis
  )
  const cache = includeTraces ? encodeAlignmentCache(record) : null
  const specificity = encodeSavedSpecificity(record.primers)
  if (!hasDnaMetadata && !cache && !specificity) return []
  const files = []
  if (specificity) files.push(specificity)
  if (hasDnaMetadata) {
    const payload: DnaComparisonAttachment = {
      schema: DNA_COMPARISON_ATTACHMENT_SCHEMA,
      schemaVersion: DNA_COMPARISON_ATTACHMENT_VERSION,
      dna,
    }
    const uncompressed = new TextEncoder().encode(JSON.stringify(payload, sequenceRecordJsonReplacer))
    if (uncompressed.length > MAX_DNA_COMPARISON_ATTACHMENT_UNCOMPRESSED_BYTES) {
      throw new Error(
        `DNA comparison metadata is too large to save (${uncompressed.length} bytes; limit ${MAX_DNA_COMPARISON_ATTACHMENT_UNCOMPRESSED_BYTES}).`,
      )
    }

    const compressed = zlibSync(uncompressed, { level: 6 })
    if (compressed.length > MAX_DNA_COMPARISON_ATTACHMENT_COMPRESSED_BYTES) {
      throw new Error(
        `Compressed DNA comparison metadata is too large to save (${compressed.length} bytes; limit ${MAX_DNA_COMPARISON_ATTACHMENT_COMPRESSED_BYTES}).`,
      )
    }
    const framed = new Uint8Array(4 + compressed.length)
    new DataView(framed.buffer).setUint32(0, uncompressed.length, false)
    framed.set(compressed, 4)
    files.push({
      name: VIBEGENE_DNA_COMPARISON_COMPRESSED_ATTACHMENT_FILE_NAME,
      data: framed,
      compressible: false,
    })
  }
  if (cache) files.push({ name: ALIGNMENT_CACHE_FILE_NAME, data: cache, compressible: false })
  return encodeSnapGeneAttachmentPackets(files)
}

function parsePayload(bytes: Uint8Array): DnaDocumentData | null {
  if (bytes.length === 0 || bytes.length > MAX_DNA_COMPARISON_ATTACHMENT_UNCOMPRESSED_BYTES) return null
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes), sequenceRecordJsonReviver) as {
      schema?: unknown
      schemaVersion?: unknown
      dna?: Partial<DnaDocumentData>
    }
    if (parsed.schema !== DNA_COMPARISON_ATTACHMENT_SCHEMA) return null
    if (parsed.schemaVersion !== DNA_COMPARISON_ATTACHMENT_VERSION) return null
    if (!parsed.dna || typeof parsed.dna !== 'object') return null
    return normalizeDnaDocumentData(parsed.dna)
  } catch {
    return null
  }
}

function parseCompressedPayload(bytes: Uint8Array): DnaDocumentData | null {
  if (
    bytes.length < 5
    || bytes.length > 4 + MAX_DNA_COMPARISON_ATTACHMENT_COMPRESSED_BYTES
  ) return null

  const expectedLength = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, false)
  if (expectedLength === 0 || expectedLength > MAX_DNA_COMPARISON_ATTACHMENT_UNCOMPRESSED_BYTES) return null

  try {
    // One extra byte detects output that exceeds the declared size while keeping
    // decompression memory bounded even for a malicious stream.
    const output = new Uint8Array(expectedLength + 1)
    const uncompressed = unzlibSync(bytes.subarray(4), { out: output })
    if (uncompressed.length !== expectedLength) return null
    return parsePayload(uncompressed)
  } catch {
    return null
  }
}

export function hydrateSnapGeneDnaComparisonRecord(
  record: SequenceRecord,
  attachmentBlocks: readonly Uint8Array[] = [],
): SequenceRecord {
  if (record.molecule !== 'dna') return record
  const attachments = parseSnapGeneAttachments(attachmentBlocks)
  const primers = hydrateSavedSpecificity(record.primers, attachments.find((file) => file.name.toLowerCase() === SAVED_SPECIFICITY_FILE_NAME))
  const compressed = attachments.find(
    (file) => file.name.toLowerCase() === VIBEGENE_DNA_COMPARISON_COMPRESSED_ATTACHMENT_FILE_NAME,
  )
  let dna = compressed ? parseCompressedPayload(compressed.data) : null
  if (!dna) {
    const legacy = attachments.find((file) => file.name.toLowerCase() === VIBEGENE_ATTACHMENT_FILE_NAME)
    dna = legacy ? parsePayload(legacy.data) : null
  }
  if (!dna) {
    for (const file of attachments) {
      if (
        file.name.toLowerCase() === VIBEGENE_DNA_COMPARISON_COMPRESSED_ATTACHMENT_FILE_NAME
        || file.name.toLowerCase() === VIBEGENE_ATTACHMENT_FILE_NAME
        || file.name.toLowerCase() === ALIGNMENT_CACHE_FILE_NAME
      ) continue
      dna = parsePayload(file.data)
      if (dna) break
    }
  }
  return dna ? { ...record, primers, dna } : { ...record, primers }
}
