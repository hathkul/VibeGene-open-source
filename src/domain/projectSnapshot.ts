import { normalizeSequenceRecord } from './constructProperties'
import type { HistoryNode, ProteinTranslationSource, SequenceRecord } from './types'
import { summarizeSnapGeneNativeHistory } from './snapgeneNativeHistory'
import type { ChromatogramData, TraceFileRecord, TraceTemplateAlignment } from './traceTypes'

/** Compact stand-in for chromatogram sample arrays (too large to JSON.stringify on every keystroke). */
function fingerprintChromatogram(chromatogram: ChromatogramData) {
  return {
    a: chromatogram.aTrace.length,
    t: chromatogram.tTrace.length,
    g: chromatogram.gTrace.length,
    c: chromatogram.cTrace.length,
    pos: chromatogram.basePos.length,
    calls: chromatogram.baseCalls.length,
    callsHead: chromatogram.baseCalls.slice(0, 8).join(''),
    callsTail: chromatogram.baseCalls.slice(-8).join(''),
    qual: chromatogram.qualNums?.length ?? 0,
  }
}

function fingerprintAlignment(alignment: TraceTemplateAlignment | null) {
  if (!alignment) return null
  return {
    templateStart: alignment.templateStart,
    templateEnd: alignment.templateEnd,
    traceStart: alignment.traceStart,
    traceEnd: alignment.traceEnd,
    mismatchCount: alignment.mismatchCount,
    gapCount: alignment.gapCount,
    orientation: alignment.orientation,
    alignmentScore: alignment.alignmentScore,
    columns: alignment.columns.length,
  }
}

function fingerprintTrace(trace: TraceFileRecord) {
  return {
    id: trace.id,
    fileName: trace.fileName,
    fileLastModified: trace.fileLastModified,
    sequence: trace.sequence,
    enabled: trace.enabled,
    expanded: trace.expanded,
    showAnnotations: trace.showAnnotations,
    alignmentPurpose: trace.alignmentPurpose,
    parseError: trace.parseError,
    sequenceAssembled: trace.sequenceAssembled,
    features: (trace.features ?? []).map((feature) => ({
      id: feature.id,
      name: feature.name,
      type: feature.type,
      color: feature.color,
      visible: feature.visible,
      locations: feature.locations.map((location) => ({
        start: location.start,
        end: location.end,
        strand: location.strand,
      })),
    })),
    history: trace.history ? fingerprintHistoryNode(trace.history) : undefined,
    reads: (trace.reads ?? []).map((read) => ({
      id: read.id,
      fileName: read.fileName,
      sequence: read.sequence,
      enabled: read.enabled,
      parseError: read.parseError,
      sequenceEdited: read.sequenceEdited,
      alignment: fingerprintAlignment(read.alignment),
      chromatogram: fingerprintChromatogram(read.chromatogram),
    })),
    alignment: fingerprintAlignment(trace.alignment),
    chromatogram: fingerprintChromatogram(trace.chromatogram),
  }
}

function fingerprintHistoryNode(node: HistoryNode): unknown {
  return {
    id: node.id,
    name: node.name,
    seqLen: node.seqLen,
    sequenceLength: node.sequence?.length ?? 0,
    circular: node.circular,
    operation: node.operation,
    resurrectable: node.resurrectable,
    hideHistory: node.hideHistory,
    oligos: node.oligos.length,
    sgRnaCloning: node.sgRnaCloning,
    regeneratedSites: node.regeneratedSites.length,
    inputSummaries: node.inputSummaries.length,
    features: node.features.length,
    children: node.children.map(fingerprintHistoryNode),
  }
}

function fingerprintTranslationSource(source: ProteinTranslationSource) {
  if (!source.sourceRecord) return source
  const sourceRecord = source.sourceRecord
  return {
    ...source,
    sourceRecord: {
      id: sourceRecord.id,
      name: sourceRecord.name,
      description: sourceRecord.description,
      molecule: sourceRecord.molecule,
      topology: sourceRecord.topology,
      sequenceLength: sourceRecord.sequence.length,
      features: sourceRecord.features.map((feature) => ({
        id: feature.id,
        name: feature.name,
        type: feature.type,
        locations: feature.locations,
      })),
      primers: sourceRecord.primers.map((primer) => ({ id: primer.id, name: primer.name })),
      operations: sourceRecord.operations.map((operation) => ({
        id: operation.id,
        type: operation.type,
        createdAt: operation.createdAt,
      })),
      history: sourceRecord.history ? fingerprintHistoryNode(sourceRecord.history) : undefined,
      snapGeneNativeHistory: summarizeSnapGeneNativeHistory(sourceRecord.snapGeneNativeHistory),
      createdAt: sourceRecord.createdAt,
      updatedAt: sourceRecord.updatedAt,
    },
  }
}

function fingerprintEmbeddedProteinSources(record: SequenceRecord): SequenceRecord {
  const derivation = record.protein?.translationDerivation
  if (record.molecule !== 'protein' || !derivation?.sources.some((source) => source.sourceRecord)) {
    return record
  }
  return {
    ...record,
    protein: {
      ...record.protein,
      translationDerivation: {
        ...derivation,
        sources: derivation.sources.map(fingerprintTranslationSource),
      },
    },
  } as SequenceRecord
}

/**
 * Canonical JSON snapshot of persisted plasmid state for dirty checking.
 * Trace chromatogram samples and alignment column arrays are fingerprinted so
 * typing stays fast when many AB1/ZTR traces are loaded.
 */
export function serializeProjectSnapshot(record: SequenceRecord, traceFiles: TraceFileRecord[]): string {
  const normalized = fingerprintEmbeddedProteinSources(normalizeSequenceRecord({
    ...record,
    traceFiles: undefined,
  }))
  return JSON.stringify({
    ...normalized,
    snapGeneNativeHistory: summarizeSnapGeneNativeHistory(normalized.snapGeneNativeHistory),
    traceFiles: traceFiles.map(fingerprintTrace),
  })
}

export function projectSnapshotsEqual(
  left: SequenceRecord,
  leftTraces: TraceFileRecord[],
  right: SequenceRecord,
  rightTraces: TraceFileRecord[],
): boolean {
  return serializeProjectSnapshot(left, leftTraces) === serializeProjectSnapshot(right, rightTraces)
}
