import { createId, normalizeDna } from './sequence'
import { encodeSnapGeneZtr, parseSnapGeneZtr, snapGeneZtrToChromatogram } from './snapgeneZtr'
import { actionProfileEnabled, recordAction } from './actionProfiler'
import { hydrateSnapGeneTraceAlignments } from './snapgeneDnaComparison'
import { hydrateLibraryTracesFromDocument } from './libraryMemberFeatures'
import { SNAPGENE_ATTACHMENT_BLOCK } from './snapgeneAttachments'
import { readSnapGeneHistoryNodePackets } from './snapgeneHistoryPackets'
import type { TraceFileRecord } from './traceTypes'
import type { SequenceRecord } from './types'

const SNAPGENE_BLOCK_ZTR = 0x12
const SNAPGENE_BLOCK_TRACE_CONTAINER = 0x10
const SNAPGENE_BLOCK_ALIGNABLE = 0x11

export type SnapGeneAlignableSequence = {
  id: string
  name: string
  isTrace: boolean
  useInAlignment?: boolean
  sortOrder: number
  alignmentPurpose?: 'trace' | 'comparative'
}

function readSnapGeneNestedBlocks(data: Uint8Array) {
  const blocks = new Map<number, Uint8Array[]>()
  let offset = 0
  while (offset + 5 <= data.length) {
    const blockType = data[offset]!
    const length = new DataView(data.buffer, data.byteOffset + offset + 1, 4).getUint32(0, false)
    const start = offset + 5
    const end = start + length
    if (end > data.length) break
    const payload = data.subarray(start, end)
    const existing = blocks.get(blockType) ?? []
    existing.push(payload)
    blocks.set(blockType, existing)
    offset = end
  }
  return blocks
}

function parseAlignableSequencesXml(xml: string): SnapGeneAlignableSequence[] {
  // Prefer DOMParser in the browser; fall back to attribute regex for Node/tests.
  if (typeof DOMParser !== 'undefined') {
    const document = new DOMParser().parseFromString(xml, 'application/xml')
    if (!document.querySelector('parsererror')) {
      return [...document.querySelectorAll('AlignableSequences > Sequence')].map((element, index) => ({
        id: element.getAttribute('ID') ?? String(index),
        name: element.getAttribute('name') ?? `Trace ${index + 1}`,
        isTrace: element.getAttribute('isTrace') === '1',
        useInAlignment: element.hasAttribute('use') ? element.getAttribute('use') === '1' : undefined,
        sortOrder: Number(element.getAttribute('sortOrder') ?? index),
        alignmentPurpose: element.getAttribute('vibegenePurpose') === 'comparative' ? 'comparative' : undefined,
      }))
    }
  }

  return [...xml.matchAll(/<Sequence\b([^>]*)\/>/g)].map((match, index) => {
    const attrs = match[1]!
    const get = (name: string) => attrs.match(new RegExp(`${name}="([^"]*)"`))?.[1]
    return {
      id: get('ID') ?? String(index),
      name: get('name') ?? `Trace ${index + 1}`,
      isTrace: get('isTrace') === '1',
      useInAlignment: get('use') === undefined ? undefined : get('use') === '1',
      sortOrder: Number(get('sortOrder') ?? index),
      alignmentPurpose: get('vibegenePurpose') === 'comparative' ? 'comparative' : undefined,
    }
  })
}

function sortedAlignable(alignable: SnapGeneAlignableSequence[]) {
  return alignable.toSorted((left, right) => left.sortOrder - right.sortOrder)
}

function alignableEntryForIndex(alignable: SnapGeneAlignableSequence[], index: number) {
  return sortedAlignable(alignable)[index]
}

function traceNameForIndex(alignable: SnapGeneAlignableSequence[], index: number) {
  return alignableEntryForIndex(alignable, index)?.name ?? `Trace ${index + 1}`
}

function traceEnabledForIndex(alignable: SnapGeneAlignableSequence[], index: number) {
  const entry = alignableEntryForIndex(alignable, index)
  if (!entry) return true
  // `isTrace` describes the data type; `use` records whether it is enabled.
  // Preserve the previous behavior for older files without a use attribute.
  return entry.useInAlignment ?? entry.isTrace
}

function parseSnapGeneTraceContainer(
  container: Uint8Array,
  alignable: SnapGeneAlignableSequence[],
  index: number,
): TraceFileRecord | null {
  if (container.length < 5) return null
  const nested = readSnapGeneNestedBlocks(container.subarray(4))
  const ztrPayloads = nested.get(SNAPGENE_BLOCK_ZTR) ?? []
  const ztrData = ztrPayloads[0]
  if (!ztrData) return null

  const fileName = traceNameForIndex(alignable, index)
  const id = createId('trace')
  const enabled = traceEnabledForIndex(alignable, index)
  const alignmentPurpose = alignableEntryForIndex(alignable, index)?.alignmentPurpose

  const parsed = parseSnapGeneZtr(ztrData)
  if (!parsed) {
    return {
      id,
      fileName,
      sequence: '',
      chromatogram: { aTrace: [], tTrace: [], gTrace: [], cTrace: [], basePos: [], baseCalls: [] },
      enabled,
      expanded: false,
      showAnnotations: false,
      alignment: null,
      alignmentPurpose,
      parseError: `Failed to parse SnapGene trace ${fileName}`,
    }
  }

  const chromatogram = snapGeneZtrToChromatogram(parsed)
  const sequence = normalizeDna(chromatogram.baseCalls.join('') || parsed.bases)
  return {
    id,
    fileName,
    sequence,
    chromatogram,
    enabled,
    expanded: false,
    showAnnotations: false,
    alignment: null,
    alignmentPurpose,
  }
}

export function collectSnapGeneTraceBlocks(bytes: Uint8Array) {
  const containers: Uint8Array[] = []
  const attachmentBlocks: Uint8Array[] = []
  let alignableXml: string | undefined
  let offset = 0
  while (offset + 5 <= bytes.length) {
    const blockType = bytes[offset]!
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 4).getUint32(0, false)
    const start = offset + 5
    const end = start + length
    if (end > bytes.length) break
    const data = bytes.subarray(start, end)
    if (blockType === SNAPGENE_BLOCK_TRACE_CONTAINER) containers.push(data)
    if (blockType === SNAPGENE_BLOCK_ALIGNABLE) alignableXml = new TextDecoder().decode(data)
    if (blockType === SNAPGENE_ATTACHMENT_BLOCK) attachmentBlocks.push(data)
    offset = end
  }
  return { containers, alignableXml, attachmentBlocks }
}

export function parseSnapGeneTraceContainers(
  containers: Uint8Array[],
  alignableXml?: string,
): TraceFileRecord[] {
  const alignable = alignableXml ? parseAlignableSequencesXml(alignableXml) : []
  const traces: TraceFileRecord[] = []

  containers.forEach((container, index) => {
    const trace = parseSnapGeneTraceContainer(container, alignable, index)
    if (trace) traces.push(trace)
  })

  return traces
}

export async function parseSnapGeneTracesAsync(
  bytes: Uint8Array,
  consensus?: string,
  topology?: 'linear' | 'circular',
  record?: Pick<SequenceRecord, 'dna'>,
): Promise<TraceFileRecord[]> {
  const collectStarted = performance.now()
  const { containers, alignableXml, attachmentBlocks } = collectSnapGeneTraceBlocks(bytes)
  if (!containers.length) return []

  const alignable = alignableXml ? parseAlignableSequencesXml(alignableXml) : []
  if (actionProfileEnabled()) {
    recordAction('collectSnapGeneTraceBlocks', performance.now() - collectStarted, 'import', `${containers.length} containers`)
  }

  const traces: TraceFileRecord[] = []
  let parseZtrMs = 0
  let toChromatogramMs = 0
  let sliceStarted = performance.now()

  for (let index = 0; index < containers.length; index += 1) {
    // Yield occasionally so the UI can paint a status update, but not between every
    // trace — that interleaved Map layout and inflated wall-clock to tens of seconds.
    if (index > 0 && performance.now() - sliceStarted > 12) {
      await new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, 0)
      })
      sliceStarted = performance.now()
    }

    const container = containers[index]!
    if (container.length < 5) continue
    const nested = readSnapGeneNestedBlocks(container.subarray(4))
    const ztrData = (nested.get(SNAPGENE_BLOCK_ZTR) ?? [])[0]
    if (!ztrData) continue

    const fileName = traceNameForIndex(alignable, index)
    const id = createId('trace')
    const enabled = traceEnabledForIndex(alignable, index)
    const alignmentPurpose = alignableEntryForIndex(alignable, index)?.alignmentPurpose

    const ztrStarted = performance.now()
    const parsed = parseSnapGeneZtr(ztrData)
    parseZtrMs += performance.now() - ztrStarted
    if (!parsed) {
      traces.push({
        id,
        fileName,
        sequence: '',
        chromatogram: { aTrace: [], tTrace: [], gTrace: [], cTrace: [], basePos: [], baseCalls: [] },
        enabled,
        expanded: false,
        showAnnotations: false,
        alignment: null,
        alignmentPurpose,
        parseError: `Failed to parse SnapGene trace ${fileName}`,
      })
      continue
    }

    const chromStarted = performance.now()
    const chromatogram = snapGeneZtrToChromatogram(parsed)
    toChromatogramMs += performance.now() - chromStarted
    const sequence = normalizeDna(chromatogram.baseCalls.join('') || parsed.bases)
    traces.push({
      id,
      fileName,
      sequence,
      chromatogram,
      enabled,
      expanded: false,
      showAnnotations: false,
      alignment: null,
      alignmentPurpose,
    })
  }

  if (actionProfileEnabled()) {
    recordAction('parseSnapGeneZtr', parseZtrMs, 'import', `${traces.length} traces`)
    recordAction('snapGeneZtrToChromatogram', toChromatogramMs, 'import', `${traces.length} traces`)
  }

  const aligned = consensus && topology
    ? hydrateSnapGeneTraceAlignments(traces, consensus, topology, attachmentBlocks)
    : traces
  // The fast open path parses document metadata before traces. Restore the
  // member-local annotations after trace IDs are regenerated by SnapGene import.
  return record ? hydrateLibraryTracesFromDocument(record, aligned) : aligned
}

export function parseSnapGeneTracesFromBlocks(
  blocks: Map<number, Uint8Array[]>,
  consensus?: string,
  topology?: 'linear' | 'circular',
): TraceFileRecord[] {
  const containers = blocks.get(SNAPGENE_BLOCK_TRACE_CONTAINER) ?? []
  if (!containers.length) return []

  const alignableBlocks = blocks.get(SNAPGENE_BLOCK_ALIGNABLE) ?? []
  const alignableXml = alignableBlocks[0] ? new TextDecoder().decode(alignableBlocks[0]) : undefined
  const traces = parseSnapGeneTraceContainers(containers, alignableXml)
  return consensus && topology
    ? hydrateSnapGeneTraceAlignments(traces, consensus, topology, blocks.get(SNAPGENE_ATTACHMENT_BLOCK) ?? [])
    : traces
}

/** Lazily decode traces embedded inside one native SnapGene history-node packet. */
export function parseSnapGeneHistoryNodeTraces(payload: Uint8Array | undefined): TraceFileRecord[] {
  if (!payload || payload.byteLength <= 4) return []
  return parseSnapGeneTracesFromBlocks(readSnapGeneHistoryNodePackets(payload))
}

function xmlEscape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function snapGeneNestedPacket(type: number, payload: Uint8Array) {
  const packet = new Uint8Array(5 + payload.length)
  packet[0] = type
  new DataView(packet.buffer).setUint32(1, payload.length, false)
  packet.set(payload, 5)
  return packet
}

function concatBytes(parts: Uint8Array[]) {
  const size = parts.reduce((total, part) => total + part.length, 0)
  const output = new Uint8Array(size)
  let offset = 0
  parts.forEach((part) => {
    output.set(part, offset)
    offset += part.length
  })
  return output
}

function hasChromatogramSamples(trace: TraceFileRecord) {
  return (
    Math.min(
      trace.chromatogram.aTrace.length,
      trace.chromatogram.cTrace.length,
      trace.chromatogram.gTrace.length,
      trace.chromatogram.tTrace.length,
    ) > 0
  )
}

function encodeAlignableSequencesXml(traces: TraceFileRecord[]) {
  const entries = traces
    .map((trace, index) => {
      // Keep the existing sequence-only encoding for compatibility; `use`
      // independently stores whether this entry is enabled.
      const isTrace = hasChromatogramSamples(trace) || trace.enabled ? '1' : '0'
      const use = trace.enabled ? '1' : '0'
      const purpose = trace.alignmentPurpose === 'comparative' ? ' vibegenePurpose="comparative"' : ''
      return `<Sequence name="${xmlEscape(trace.fileName)}" ID="${index}" isTrace="${isTrace}" use="${use}" sortOrder="${index}"${purpose}/>`
    })
    .join('')
  return `<AlignableSequences>${entries}</AlignableSequences>`
}

function encodeTraceContainer(trace: TraceFileRecord, index: number) {
  const bases = normalizeDna(trace.sequence || trace.chromatogram.baseCalls.join(''))
  const samples = hasChromatogramSamples(trace)
    ? {
        A: trace.chromatogram.aTrace,
        C: trace.chromatogram.cTrace,
        G: trace.chromatogram.gTrace,
        T: trace.chromatogram.tTrace,
      }
    : undefined
  const ztr = encodeSnapGeneZtr({
    bases,
    samples,
    positions: samples ? trace.chromatogram.basePos : undefined,
  })
  const nested = snapGeneNestedPacket(SNAPGENE_BLOCK_ZTR, ztr)
  const header = new Uint8Array(4)
  new DataView(header.buffer).setUint32(0, index, false)
  return concatBytes([header, nested])
}

/**
 * Build SnapGene alignment packets (0x11 AlignableSequences + 0x10 containers with 0x12 ZTR)
 * for the current Vibegene alignment list. Empty when there are no exportable sequences.
 */
export function encodeSnapGeneAlignmentPackets(traces: TraceFileRecord[]): Uint8Array[] {
  const exportable = traces.filter((trace) => {
    if (trace.parseError && !normalizeDna(trace.sequence).length) return false
    return normalizeDna(trace.sequence || trace.chromatogram.baseCalls.join('')).length > 0
  })
  if (!exportable.length) return []

  const encoder = new TextEncoder()
  const packets: Uint8Array[] = [
    snapGeneNestedPacket(SNAPGENE_BLOCK_ALIGNABLE, encoder.encode(encodeAlignableSequencesXml(exportable))),
  ]
  exportable.forEach((trace, index) => {
    packets.push(snapGeneNestedPacket(SNAPGENE_BLOCK_TRACE_CONTAINER, encodeTraceContainer(trace, index)))
  })
  return packets
}

export const SNAPGENE_TRACE_BLOCK_TYPES = {
  traceContainer: SNAPGENE_BLOCK_TRACE_CONTAINER,
  alignableSequences: SNAPGENE_BLOCK_ALIGNABLE,
  ztr: SNAPGENE_BLOCK_ZTR,
} as const
