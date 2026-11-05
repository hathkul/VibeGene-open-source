import { sequenceRecordForAgaroseGel } from './agaroseGelLibrary'
import { defaultConstructProperties, normalizeSequenceRecord } from './constructProperties'
import { parseSnapGeneModification } from './dnaEnds'
import { parseSnapGeneHistoryNodeDocumentData, type SnapGeneHistoryNodeDocumentData } from './parsers'
import { scopeSnapGeneNativeHistoryToSubtree } from './snapgeneNativeHistory'
import { parseSnapGeneHistoryNodeTraces } from './snapgeneTraces'
import { createId, normalizeDna, nowIso } from './sequence'
import type { HistoryNode, SequenceRecord, SnapGeneNativeHistory } from './types'

/** Build a standalone, viewable construct from one ancestry-tree node. */
export function recordFromHistoryNode(
  node: HistoryNode,
  nativeHistory?: SnapGeneNativeHistory,
  nativeDocument?: SnapGeneHistoryNodeDocumentData,
): SequenceRecord {
  const timestamp = nowIso()
  const scopedNativeHistory = scopeSnapGeneNativeHistoryToSubtree(nativeHistory, node)
  const nodePayload = scopedNativeHistory?.nodePackets.find((packet) => packet.nodeId === node.id)?.payload
  const sequence = nativeDocument?.sequence ?? node.sequence
  const hasExactSequence = typeof sequence === 'string' && sequence.length > 0
  const fallbackPrimers =
    node.primers && node.primers.length > 0
      ? node.primers.map((primer) => ({
          ...primer,
          id: createId('primer'),
          bindings: primer.bindings?.map((binding) => ({
            ...binding,
            components: binding.components.map((component) => ({ ...component })),
          })),
        }))
      : node.oligos.map((oligo) => ({
          id: createId('primer'),
          name: oligo.name,
          sequence: normalizeDna(oligo.sequence),
          color: '#7c3aed',
          description: oligo.description ?? '',
        }))
  const primers = nativeDocument?.primers ?? fallbackPrimers
  const traceFiles = node.traceFiles ?? parseSnapGeneHistoryNodeTraces(nodePayload)
  const traceDescription = traceFiles.length
    ? ` with ${traceFiles.length} embedded sequencing trace${traceFiles.length === 1 ? '' : 's'}`
    : ''
  const fallbackFeatures = node.features.map((feature) => ({
    id: createId('feature'),
    name: feature.name,
    type: feature.type,
    color: feature.color,
    locations: feature.segments.map((segment) => ({
      start: segment.start,
      end: segment.end,
      strand: feature.strand,
    })),
  }))
  const fallbackDnaEnds =
    node.upstreamModification ||
    node.downstreamModification ||
    node.upstreamStickiness !== undefined ||
    node.downstreamStickiness !== undefined
      ? {
          upstream: {
            modification: parseSnapGeneModification(node.upstreamModification),
            stickiness: node.upstreamStickiness ?? 0,
          },
          downstream: {
            modification: parseSnapGeneModification(node.downstreamModification),
            stickiness: node.downstreamStickiness ?? 0,
          },
        }
      : undefined
  const hasCompleteHistoryEnds =
    /^(?:Unmodified|FivePrimePhosphorylated|CovalentlyClosed)$/.test(node.upstreamModification ?? '') &&
    /^(?:Unmodified|FivePrimePhosphorylated|CovalentlyClosed)$/.test(node.downstreamModification ?? '') &&
    Number.isFinite(node.upstreamStickiness) && Number.isFinite(node.downstreamStickiness)
  const notes = nativeDocument?.notes
  return normalizeSequenceRecord({
    id: createId('seq'),
    name: node.name.replace(/\.dna$/i, ''),
    mapLabel: notes?.mapLabel,
    description: notes?.description ?? (hasExactSequence
      ? `Reconstructed from construct history${traceDescription}.`
      : `Reconstructed from construct history (bases unknown${traceDescription}).`),
    molecule: nativeDocument?.molecule ?? 'dna',
    topology: nativeDocument?.topology ?? (node.circular ? 'circular' : 'linear'),
    sequence: hasExactSequence ? sequence! : 'N'.repeat(Math.max(0, node.seqLen)),
    history: node,
    snapGeneNativeHistory: scopedNativeHistory,
    features: nativeDocument?.features ?? fallbackFeatures,
    primers,
    traceFiles: traceFiles.length ? traceFiles : undefined,
    strandColors: nativeDocument?.strandColors ?? node.historyColors,
    snapGeneEnzymes: nativeDocument?.snapGeneEnzymes,
    fileEnzymeSets: nativeDocument?.fileEnzymeSets,
    dnaEnds: nativeDocument?.dnaEnds ?? fallbackDnaEnds,
    dnaEndsProvenance: nativeDocument?.dnaEndsProvenance ?? (hasCompleteHistoryEnds ? 'snapgene-history' : undefined),
    operations: [],
    construct: { ...defaultConstructProperties, ...notes?.construct },
    createdAt: notes?.createdAt ?? timestamp,
    updatedAt: notes?.updatedAt ?? timestamp,
  })
}

/**
 * Gel snapshot of one history-tree parent. Always rebuilds from that node
 * (never the open product, even when node ids collide) and drops native
 * packets that cannot be JSON-serialized into the hybrid gel window.
 */
export function agaroseGelRecordFromHistoryNode(
  node: HistoryNode,
  nativeHistory?: SnapGeneNativeHistory,
  nativeDocument?: SnapGeneHistoryNodeDocumentData,
): SequenceRecord {
  const nodePayload = nativeHistory?.nodePackets.find((packet) => packet.nodeId === node.id)?.payload
  const reconstructed = recordFromHistoryNode(
    node,
    nativeHistory,
    nativeDocument ?? parseSnapGeneHistoryNodeDocumentData(nodePayload),
  )
  const hasNodeSequence = typeof node.sequence === 'string' && node.sequence.length > 0
  return sequenceRecordForAgaroseGel({
    ...reconstructed,
    sequence: hasNodeSequence ? node.sequence! : reconstructed.sequence,
    topology: hasNodeSequence ? (node.circular ? 'circular' : 'linear') : reconstructed.topology,
  })
}
