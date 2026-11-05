import { applyHistoryRetention, type HistoryRetentionPolicy } from './historyRetention'
import {
  snapGeneNativeHistoryBase64Bytes,
  snapGeneNativeHistoryTraceMetrics,
  summarizeSnapGeneNativeHistory,
} from './snapgeneNativeHistory'
import type { SnapGeneNativeHistory } from './types'
import type { HistoryNode, ProteinTranslationSource, SequenceRecord } from './types'

function recordAncestorTraceMetrics(record: SequenceRecord | undefined) {
  const native = snapGeneNativeHistoryTraceMetrics(record?.snapGeneNativeHistory)
  const covered = new Set(native.nodeIds)
  let traceCount = native.traceCount
  let packetBytes = native.packetBytes
  const nodeIds = [...native.nodeIds]
  const visit = (node: HistoryNode) => {
    if (!covered.has(node.id) && node.traceFiles?.length) {
      traceCount += node.traceFiles.length
      packetBytes += new TextEncoder().encode(JSON.stringify(node.traceFiles)).length
      nodeIds.push(node.id)
    }
    node.children.forEach(visit)
  }
  if (record?.history) visit(record.history)
  return { traceCount, packetBytes, nodeIds }
}

export type HistoryTreeMetrics = {
  nodeCount: number
  ancestorCount: number
  ancestorGenerations: number
  leafCount: number
  truncatedBranchCount: number
  decodedSequenceCount: number
  decodedSequenceBases: number
  decodedAncestorSequenceCount: number
  decodedAncestorBases: number
}

export type TranslationSourceReference = {
  key: string
  projectId?: string
  projectName: string
  sequenceDigest: string
}

export type TranslationProvenanceMetrics = {
  sourceCount: number
  embeddedDnaSourceCount: number
  cdsPayloadCount: number
  cdsOnlySourceCount: number
  referenceOnlySourceCount: number
  embeddedDnaBases: number
  embeddedDnaHistory: HistoryTreeMetrics
  embeddedDnaAncestorTraces: {
    traceCount: number
    packetBytes: number
  }
  referenceOnlySources: TranslationSourceReference[]
}

export type RecordHistoryMetrics = {
  nativeHistory: HistoryTreeMetrics
  nativeAncestorTraces: {
    traceCount: number
    packetBytes: number
  }
  translationProvenance: TranslationProvenanceMetrics
  operationCount: number
  serializedBytes: number
}

export type RemovedEmbeddedHistory = {
  source: TranslationSourceReference
  nodeIds: string[]
  decodedSequenceNodeIds: string[]
}

export type HistoryTrimRemovalDetails = {
  nativeHistoryNodeIds: string[]
  nativeDecodedSequenceNodeIds: string[]
  nativeAncestorTraceNodeIds: string[]
  translationSources: TranslationSourceReference[]
  embeddedDnaSources: TranslationSourceReference[]
  cdsPayloadSources: TranslationSourceReference[]
  embeddedHistory: RemovedEmbeddedHistory[]
  operationIds: string[]
}

export type HistoryTrimRemovalCounts = {
  nativeHistoryNodes: number
  nativeDecodedSequences: number
  nativeDecodedSequenceBases: number
  nativeAncestorTraces: number
  nativeAncestorTraceBytes: number
  translationSources: number
  embeddedDnaSources: number
  embeddedDnaBases: number
  embeddedHistoryNodes: number
  embeddedDecodedSequences: number
  embeddedDecodedSequenceBases: number
  embeddedAncestorTraces: number
  embeddedAncestorTraceBytes: number
  cdsPayloads: number
  operations: number
  serializedBytes: number
  newlyTruncatedBranches: number
  newlyReferenceOnlySources: number
}

export type RecordHistoryTrimPreview = {
  recordId: string
  recordName: string
  molecule: SequenceRecord['molecule']
  policy: HistoryRetentionPolicy
  changed: boolean
  serializedByteDelta: number
  before: RecordHistoryMetrics
  after: RecordHistoryMetrics
  removed: HistoryTrimRemovalCounts
  details: HistoryTrimRemovalDetails
}

export type BatchHistoryTrimPreview = {
  recordCount: number
  changedRecordCount: number
  beforeSerializedBytes: number
  afterSerializedBytes: number
  serializedByteDelta: number
  removed: HistoryTrimRemovalCounts
  records: RecordHistoryTrimPreview[]
}

type HistoryNodeSnapshot = {
  id: string
  name: string
  depth: number
  decodedBases: number
}

const emptyTreeMetrics = (): HistoryTreeMetrics => ({
  nodeCount: 0,
  ancestorCount: 0,
  ancestorGenerations: 0,
  leafCount: 0,
  truncatedBranchCount: 0,
  decodedSequenceCount: 0,
  decodedSequenceBases: 0,
  decodedAncestorSequenceCount: 0,
  decodedAncestorBases: 0,
})

function historyNodeSnapshots(root: HistoryNode | undefined): HistoryNodeSnapshot[] {
  if (!root) return []
  const snapshots: HistoryNodeSnapshot[] = []
  const visit = (node: HistoryNode, depth: number) => {
    snapshots.push({
      id: node.id,
      name: node.name,
      depth,
      decodedBases: node.sequence?.length ?? 0,
    })
    node.children.forEach((child) => visit(child, depth + 1))
  }
  visit(root, 0)
  return snapshots
}

export function analyzeHistoryTree(root: HistoryNode | undefined): HistoryTreeMetrics {
  if (!root) return emptyTreeMetrics()
  const snapshots = historyNodeSnapshots(root)
  const decoded = snapshots.filter((node) => node.decodedBases > 0)
  const decodedAncestors = decoded.filter((node) => node.depth > 0)
  let leafCount = 0
  let truncatedBranchCount = 0
  const visit = (node: HistoryNode) => {
    if (node.children.length === 0) leafCount += 1
    if (node.ancestryTrimmed) truncatedBranchCount += 1
    node.children.forEach(visit)
  }
  visit(root)
  return {
    nodeCount: snapshots.length,
    ancestorCount: Math.max(0, snapshots.length - 1),
    ancestorGenerations: snapshots.reduce((maximum, node) => Math.max(maximum, node.depth), 0),
    leafCount,
    truncatedBranchCount,
    decodedSequenceCount: decoded.length,
    decodedSequenceBases: decoded.reduce((total, node) => total + node.decodedBases, 0),
    decodedAncestorSequenceCount: decodedAncestors.length,
    decodedAncestorBases: decodedAncestors.reduce((total, node) => total + node.decodedBases, 0),
  }
}

function addTreeMetrics(left: HistoryTreeMetrics, right: HistoryTreeMetrics): HistoryTreeMetrics {
  return {
    nodeCount: left.nodeCount + right.nodeCount,
    ancestorCount: left.ancestorCount + right.ancestorCount,
    ancestorGenerations: Math.max(left.ancestorGenerations, right.ancestorGenerations),
    leafCount: left.leafCount + right.leafCount,
    truncatedBranchCount: left.truncatedBranchCount + right.truncatedBranchCount,
    decodedSequenceCount: left.decodedSequenceCount + right.decodedSequenceCount,
    decodedSequenceBases: left.decodedSequenceBases + right.decodedSequenceBases,
    decodedAncestorSequenceCount: left.decodedAncestorSequenceCount + right.decodedAncestorSequenceCount,
    decodedAncestorBases: left.decodedAncestorBases + right.decodedAncestorBases,
  }
}

function translationSourceReference(
  source: ProteinTranslationSource,
  index: number,
): TranslationSourceReference {
  return {
    key: `${source.projectId || source.projectName || 'source'}#${index}`,
    ...(source.projectId ? { projectId: source.projectId } : {}),
    projectName: source.projectName || 'Source DNA',
    sequenceDigest: source.sequenceDigest || '',
  }
}

function sourceIsReferenceOnly(source: ProteinTranslationSource) {
  return !source.sourceRecord && !source.cds
}

export function analyzeTranslationProvenance(
  record: SequenceRecord,
): TranslationProvenanceMetrics {
  const sources = record.protein?.translationDerivation?.sources ?? []
  let embeddedDnaHistory = emptyTreeMetrics()
  let embeddedAncestorTraceCount = 0
  let embeddedAncestorTraceBytes = 0
  for (const source of sources) {
    embeddedDnaHistory = addTreeMetrics(
      embeddedDnaHistory,
      analyzeHistoryTree(source.sourceRecord?.history),
    )
    const traceMetrics = recordAncestorTraceMetrics(source.sourceRecord)
    embeddedAncestorTraceCount += traceMetrics.traceCount
    embeddedAncestorTraceBytes += traceMetrics.packetBytes
  }
  return {
    sourceCount: sources.length,
    embeddedDnaSourceCount: sources.filter((source) => Boolean(source.sourceRecord)).length,
    cdsPayloadCount: sources.filter((source) => Boolean(source.cds)).length,
    cdsOnlySourceCount: sources.filter((source) => !source.sourceRecord && Boolean(source.cds)).length,
    referenceOnlySourceCount: sources.filter(sourceIsReferenceOnly).length,
    embeddedDnaBases: sources.reduce(
      (total, source) => total + (source.sourceRecord?.sequence.length ?? 0),
      0,
    ),
    embeddedDnaHistory,
    embeddedDnaAncestorTraces: {
      traceCount: embeddedAncestorTraceCount,
      packetBytes: embeddedAncestorTraceBytes,
    },
    referenceOnlySources: sources.flatMap((source, index) => (
      sourceIsReferenceOnly(source) ? [translationSourceReference(source, index)] : []
    )),
  }
}

function serializedRecord(record: SequenceRecord) {
  let nativeBase64Bytes = 0
  const serialized = JSON.stringify(record, (key, value: unknown) => {
    if (key !== 'snapGeneNativeHistory') return value
    const nativeHistory = value as SnapGeneNativeHistory | undefined
    nativeBase64Bytes += snapGeneNativeHistoryBase64Bytes(nativeHistory)
    return summarizeSnapGeneNativeHistory(nativeHistory)
  })
  return {
    serialized,
    estimatedBytes: new TextEncoder().encode(serialized).length + nativeBase64Bytes,
  }
}

export function analyzeRecordHistory(record: SequenceRecord): RecordHistoryMetrics {
  const nativeAncestorTraces = recordAncestorTraceMetrics(record)
  return {
    nativeHistory: analyzeHistoryTree(record.history),
    nativeAncestorTraces: {
      traceCount: nativeAncestorTraces.traceCount,
      packetBytes: nativeAncestorTraces.packetBytes,
    },
    translationProvenance: analyzeTranslationProvenance(record),
    operationCount: record.operations.length,
    serializedBytes: serializedRecord(record).estimatedBytes,
  }
}

function removedNodeIds(before: HistoryNode | undefined, after: HistoryNode | undefined) {
  const retained = new Set(historyNodeSnapshots(after).map((node) => node.id))
  return historyNodeSnapshots(before)
    .filter((node) => !retained.has(node.id))
    .map((node) => node.id)
}

function removedDecodedSequenceNodeIds(
  before: HistoryNode | undefined,
  after: HistoryNode | undefined,
) {
  const retainedDecoded = new Set(
    historyNodeSnapshots(after)
      .filter((node) => node.decodedBases > 0)
      .map((node) => node.id),
  )
  return historyNodeSnapshots(before)
    .filter((node) => node.decodedBases > 0 && !retainedDecoded.has(node.id))
    .map((node) => node.id)
}

function removalDetails(
  before: SequenceRecord,
  after: SequenceRecord,
): HistoryTrimRemovalDetails {
  const beforeSources = before.protein?.translationDerivation?.sources ?? []
  const afterSources = after.protein?.translationDerivation?.sources ?? []
  const translationSources: TranslationSourceReference[] = []
  const embeddedDnaSources: TranslationSourceReference[] = []
  const cdsPayloadSources: TranslationSourceReference[] = []
  const embeddedHistory: RemovedEmbeddedHistory[] = []

  beforeSources.forEach((source, index) => {
    const retained = afterSources[index]
    const reference = translationSourceReference(source, index)
    if (!retained) translationSources.push(reference)
    if (source.sourceRecord && !retained?.sourceRecord) embeddedDnaSources.push(reference)
    if (source.cds && !retained?.cds) cdsPayloadSources.push(reference)
    const nodeIds = removedNodeIds(source.sourceRecord?.history, retained?.sourceRecord?.history)
    const decodedSequenceNodeIds = removedDecodedSequenceNodeIds(
      source.sourceRecord?.history,
      retained?.sourceRecord?.history,
    )
    if (nodeIds.length || decodedSequenceNodeIds.length) {
      embeddedHistory.push({ source: reference, nodeIds, decodedSequenceNodeIds })
    }
  })

  const retainedOperationIds = new Set(after.operations.map((operation) => operation.id))
  const retainedTraceNodeIds = new Set(
    recordAncestorTraceMetrics(after).nodeIds,
  )
  return {
    nativeHistoryNodeIds: removedNodeIds(before.history, after.history),
    nativeDecodedSequenceNodeIds: removedDecodedSequenceNodeIds(before.history, after.history),
    nativeAncestorTraceNodeIds: recordAncestorTraceMetrics(before)
      .nodeIds.filter((nodeId) => !retainedTraceNodeIds.has(nodeId)),
    translationSources,
    embeddedDnaSources,
    cdsPayloadSources,
    embeddedHistory,
    operationIds: before.operations
      .filter((operation) => !retainedOperationIds.has(operation.id))
      .map((operation) => operation.id),
  }
}

function removedCount(before: number, after: number) {
  return Math.max(0, before - after)
}

function removalCounts(
  before: RecordHistoryMetrics,
  after: RecordHistoryMetrics,
): HistoryTrimRemovalCounts {
  const beforeTranslation = before.translationProvenance
  const afterTranslation = after.translationProvenance
  return {
    nativeHistoryNodes: removedCount(before.nativeHistory.nodeCount, after.nativeHistory.nodeCount),
    nativeDecodedSequences: removedCount(
      before.nativeHistory.decodedSequenceCount,
      after.nativeHistory.decodedSequenceCount,
    ),
    nativeDecodedSequenceBases: removedCount(
      before.nativeHistory.decodedSequenceBases,
      after.nativeHistory.decodedSequenceBases,
    ),
    nativeAncestorTraces: removedCount(
      before.nativeAncestorTraces.traceCount,
      after.nativeAncestorTraces.traceCount,
    ),
    nativeAncestorTraceBytes: removedCount(
      before.nativeAncestorTraces.packetBytes,
      after.nativeAncestorTraces.packetBytes,
    ),
    translationSources: removedCount(beforeTranslation.sourceCount, afterTranslation.sourceCount),
    embeddedDnaSources: removedCount(
      beforeTranslation.embeddedDnaSourceCount,
      afterTranslation.embeddedDnaSourceCount,
    ),
    embeddedDnaBases: removedCount(
      beforeTranslation.embeddedDnaBases,
      afterTranslation.embeddedDnaBases,
    ),
    embeddedHistoryNodes: removedCount(
      beforeTranslation.embeddedDnaHistory.nodeCount,
      afterTranslation.embeddedDnaHistory.nodeCount,
    ),
    embeddedDecodedSequences: removedCount(
      beforeTranslation.embeddedDnaHistory.decodedSequenceCount,
      afterTranslation.embeddedDnaHistory.decodedSequenceCount,
    ),
    embeddedDecodedSequenceBases: removedCount(
      beforeTranslation.embeddedDnaHistory.decodedSequenceBases,
      afterTranslation.embeddedDnaHistory.decodedSequenceBases,
    ),
    embeddedAncestorTraces: removedCount(
      beforeTranslation.embeddedDnaAncestorTraces.traceCount,
      afterTranslation.embeddedDnaAncestorTraces.traceCount,
    ),
    embeddedAncestorTraceBytes: removedCount(
      beforeTranslation.embeddedDnaAncestorTraces.packetBytes,
      afterTranslation.embeddedDnaAncestorTraces.packetBytes,
    ),
    cdsPayloads: removedCount(beforeTranslation.cdsPayloadCount, afterTranslation.cdsPayloadCount),
    operations: removedCount(before.operationCount, after.operationCount),
    serializedBytes: removedCount(before.serializedBytes, after.serializedBytes),
    newlyTruncatedBranches: Math.max(
      0,
      after.nativeHistory.truncatedBranchCount
        + afterTranslation.embeddedDnaHistory.truncatedBranchCount
        - before.nativeHistory.truncatedBranchCount
        - beforeTranslation.embeddedDnaHistory.truncatedBranchCount,
    ),
    newlyReferenceOnlySources: Math.max(
      0,
      afterTranslation.referenceOnlySourceCount - beforeTranslation.referenceOnlySourceCount,
    ),
  }
}

export function previewHistoryTrim(
  record: SequenceRecord,
  policy: HistoryRetentionPolicy,
): RecordHistoryTrimPreview {
  const beforeSerialized = serializedRecord(record)
  const trimmed = applyHistoryRetention(record, policy)
  const afterSerialized = serializedRecord(trimmed)
  const before = analyzeRecordHistory(record)
  const after = analyzeRecordHistory(trimmed)
  return {
    recordId: record.id,
    recordName: record.name,
    molecule: record.molecule,
    policy,
    changed: beforeSerialized.serialized !== afterSerialized.serialized,
    serializedByteDelta: after.serializedBytes - before.serializedBytes,
    before,
    after,
    removed: removalCounts(before, after),
    details: removalDetails(record, trimmed),
  }
}

function emptyRemovalCounts(): HistoryTrimRemovalCounts {
  return {
    nativeHistoryNodes: 0,
    nativeDecodedSequences: 0,
    nativeDecodedSequenceBases: 0,
    nativeAncestorTraces: 0,
    nativeAncestorTraceBytes: 0,
    translationSources: 0,
    embeddedDnaSources: 0,
    embeddedDnaBases: 0,
    embeddedHistoryNodes: 0,
    embeddedDecodedSequences: 0,
    embeddedDecodedSequenceBases: 0,
    embeddedAncestorTraces: 0,
    embeddedAncestorTraceBytes: 0,
    cdsPayloads: 0,
    operations: 0,
    serializedBytes: 0,
    newlyTruncatedBranches: 0,
    newlyReferenceOnlySources: 0,
  }
}

function addRemovalCounts(
  total: HistoryTrimRemovalCounts,
  next: HistoryTrimRemovalCounts,
): HistoryTrimRemovalCounts {
  const result = { ...total }
  for (const key of Object.keys(result) as Array<keyof HistoryTrimRemovalCounts>) {
    result[key] += next[key]
  }
  return result
}

export function previewHistoryTrimBatch(
  records: readonly SequenceRecord[],
  policy: HistoryRetentionPolicy | ((record: SequenceRecord) => HistoryRetentionPolicy),
): BatchHistoryTrimPreview {
  const previews = records.map((record) => previewHistoryTrim(
    record,
    typeof policy === 'function' ? policy(record) : policy,
  ))
  const beforeSerializedBytes = previews.reduce(
    (total, preview) => total + preview.before.serializedBytes,
    0,
  )
  const afterSerializedBytes = previews.reduce(
    (total, preview) => total + preview.after.serializedBytes,
    0,
  )
  return {
    recordCount: previews.length,
    changedRecordCount: previews.filter((preview) => preview.changed).length,
    beforeSerializedBytes,
    afterSerializedBytes,
    serializedByteDelta: afterSerializedBytes - beforeSerializedBytes,
    removed: previews.reduce(
      (total, preview) => addRemovalCounts(total, preview.removed),
      emptyRemovalCounts(),
    ),
    records: previews,
  }
}
