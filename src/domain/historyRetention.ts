import type {
  HistoryNode,
  ProteinTranslationDerivation,
  ProteinTranslationSource,
  SequenceRecord,
} from './types'
import { trimSnapGeneNativeHistory } from './snapgeneNativeHistory'

export type AncestryRetention =
  | { mode: 'complete' }
  | { mode: 'generations'; generations: number }
  | { mode: 'tree-only' }
  | { mode: 'current-only' }
  | { mode: 'remove' }

export type TranslationSourceRetention =
  | { mode: 'complete'; ancestry: AncestryRetention }
  | { mode: 'current-dna' }
  | { mode: 'cds-only' }
  | { mode: 'reference-only' }
  | { mode: 'remove' }

export type AncestorTraceRetention =
  | { mode: 'complete' }
  | { mode: 'generations'; generations: number }
  | { mode: 'remove' }

export type HistoryRetentionPolicy = {
  nativeAncestry: AncestryRetention
  ancestorTraces: AncestorTraceRetention
  translationSources: TranslationSourceRetention
  clearOperationLog: boolean
}

export type DnaHistoryRetentionMode = 'complete' | 'generations' | 'tree-only' | 'current-only'
export type ProteinSourceDnaRetentionMode =
  | 'complete'
  | 'generations'
  | 'current-dna'
  | 'cds-only'
  | 'reference-only'
  | 'remove'

function normalizedGenerations(generations: number) {
  return Number.isFinite(generations) ? Math.max(0, Math.floor(generations)) : 0
}

function buildAncestorTraceRetention(
  mode: AncestorTraceRetention['mode'],
  generations: number,
): AncestorTraceRetention {
  return mode === 'generations'
    ? { mode, generations: normalizedGenerations(generations) }
    : { mode }
}

/** Convert the DNA History Manager controls into a complete retention policy. */
export function buildDnaHistoryRetentionPolicy(
  mode: DnaHistoryRetentionMode,
  generations: number,
  clearOperationLog: boolean,
  traceMode: AncestorTraceRetention['mode'] = 'complete',
  traceGenerations = 1,
): HistoryRetentionPolicy {
  const nativeAncestry: AncestryRetention = mode === 'generations'
    ? {
        mode: 'generations',
        generations: normalizedGenerations(generations),
      }
    : { mode }
  return {
    nativeAncestry,
    ancestorTraces: buildAncestorTraceRetention(traceMode, traceGenerations),
    translationSources: { mode: 'complete', ancestry: { mode: 'complete' } },
    clearOperationLog,
  }
}

/** Convert the protein History pane controls into a complete retention policy. */
export function buildProteinSourceHistoryRetentionPolicy(
  mode: ProteinSourceDnaRetentionMode,
  generations: number,
  traceMode: AncestorTraceRetention['mode'] = 'complete',
  traceGenerations = 1,
): HistoryRetentionPolicy {
  const translationSources: TranslationSourceRetention = mode === 'complete'
    ? { mode: 'complete', ancestry: { mode: 'complete' } }
    : mode === 'generations'
      ? {
          mode: 'complete',
          ancestry: { mode: 'generations', generations: normalizedGenerations(generations) },
        }
      : { mode }
  return {
    nativeAncestry: { mode: 'complete' },
    ancestorTraces: buildAncestorTraceRetention(traceMode, traceGenerations),
    translationSources,
    clearOperationLog: false,
  }
}

function cloneHistoryNode(
  node: HistoryNode,
  options: { remainingGenerations?: number; stripSequences?: boolean } = {},
): HistoryNode {
  const remaining = options.remainingGenerations
  const atBoundary = remaining !== undefined && remaining <= 0
  const children = atBoundary
    ? []
    : node.children.map((child) => cloneHistoryNode(child, {
        ...options,
        ...(remaining !== undefined ? { remainingGenerations: remaining - 1 } : {}),
      }))
  const ancestryTrimmed = atBoundary && node.children.length > 0
    ? true
    : node.ancestryTrimmed

  return {
    ...node,
    ...(ancestryTrimmed ? { ancestryTrimmed: true } : { ancestryTrimmed: undefined }),
    oligos: node.oligos.map((oligo) => ({ ...oligo })),
    regeneratedSites: node.regeneratedSites.map((site) => ({ ...site })),
    inputSummaries: node.inputSummaries.map((summary) => ({ ...summary })),
    features: node.features.map((feature) => ({
      ...feature,
      segments: feature.segments.map((segment) => ({ ...segment })),
    })),
    historyColors: node.historyColors
      ? {
          ...node.historyColors,
          topStrand: node.historyColors.topStrand.map((range) => ({ ...range })),
          bottomStrand: node.historyColors.bottomStrand.map((range) => ({ ...range })),
        }
      : undefined,
    ...(options.stripSequences ? { sequence: undefined } : {}),
    primers: node.primers?.map((primer) => ({
      ...primer,
      bindings: primer.bindings?.map((binding) => ({
        ...binding,
        components: binding.components.map((component) => ({ ...component })),
      })),
    })),
    children,
  }
}

/** Return a detached tree transformed according to the requested retention policy. */
export function trimHistoryTree(
  root: HistoryNode | undefined,
  retention: AncestryRetention,
): HistoryNode | undefined {
  if (!root || retention.mode === 'remove') return undefined
  if (retention.mode === 'tree-only') return cloneHistoryNode(root, { stripSequences: true })
  if (retention.mode === 'current-only') {
    return cloneHistoryNode(root, { remainingGenerations: 0, stripSequences: true })
  }
  if (retention.mode === 'generations') {
    const generations = Number.isFinite(retention.generations)
      ? Math.max(0, Math.floor(retention.generations))
      : 0
    return cloneHistoryNode(root, { remainingGenerations: generations })
  }
  return cloneHistoryNode(root)
}

function trimHistoryNodeTraces(root: HistoryNode | undefined, retention: AncestorTraceRetention): HistoryNode | undefined {
  if (!root || retention.mode === 'complete') return root
  const limit = retention.mode === 'generations' ? normalizedGenerations(retention.generations) : -1
  const visit = (node: HistoryNode, depth: number): HistoryNode => ({
    ...node,
    traceFiles: depth > limit ? undefined : node.traceFiles,
    children: node.children.map(child => visit(child, depth + 1)),
  })
  return visit(root, 0)
}

function cloneCds(source: ProteinTranslationSource): ProteinTranslationSource['cds'] {
  if (!source.cds) return undefined
  return {
    ...source.cds,
    locations: source.cds.locations.map((location) => ({ ...location })),
    translation: {
      ...source.cds.translation,
      segmentNumbering: source.cds.translation.segmentNumbering.map((segment) => ({ ...segment })),
    },
  }
}

function cloneSourceRecord(
  record: SequenceRecord,
  ancestry: AncestryRetention,
  ancestorTraces: HistoryRetentionPolicy['ancestorTraces'] = { mode: 'complete' },
): SequenceRecord {
  const history = trimHistoryNodeTraces(trimHistoryTree(record.history, ancestry), ancestorTraces)
  return {
    ...record,
    history,
    snapGeneNativeHistory: trimSnapGeneNativeHistory(
      record.snapGeneNativeHistory,
      history,
      ancestry,
      ancestorTraces,
    ),
    features: record.features.map((feature) => ({
      ...feature,
      locations: feature.locations.map((location) => ({ ...location })),
    })),
    primers: record.primers.map((primer) => ({ ...primer })),
    operations: record.operations.map((operation) => ({ ...operation })),
  }
}

function trimTranslationSource(
  source: ProteinTranslationSource,
  retention: TranslationSourceRetention,
  ancestorTraces: HistoryRetentionPolicy['ancestorTraces'],
): ProteinTranslationSource | undefined {
  if (retention.mode === 'remove') return undefined

  const base = {
    ...source,
    cds: undefined,
    sourceRecord: undefined,
  }
  if (retention.mode === 'reference-only') {
    return { ...base, retention: 'reference-only' }
  }

  const cds = cloneCds(source)
  if (retention.mode === 'cds-only') {
    return cds
      ? { ...base, retention: 'cds-only', cds }
      : { ...base, retention: 'reference-only' }
  }

  const ancestry = retention.mode === 'current-dna'
    ? { mode: 'remove' } as const
    : retention.ancestry
  const retainedLevel = source.sourceRecord
    ? 'complete' as const
    : cds
      ? 'cds-only' as const
      : 'reference-only' as const
  return {
    ...base,
    ...(retainedLevel !== 'complete' || source.retention
      ? { retention: retainedLevel }
      : {}),
    ...(cds ? { cds } : {}),
    ...(source.sourceRecord
      ? { sourceRecord: cloneSourceRecord(source.sourceRecord, ancestry, ancestorTraces) }
      : {}),
  }
}

/** Trim embedded translated-CDS sources without changing native protein history. */
export function trimTranslationDerivation(
  derivation: ProteinTranslationDerivation | undefined,
  retention: TranslationSourceRetention,
  ancestorTraces: HistoryRetentionPolicy['ancestorTraces'] = { mode: 'complete' },
): ProteinTranslationDerivation | undefined {
  if (!derivation || retention.mode === 'remove') return undefined
  const sources = derivation.sources
    .map((source) => trimTranslationSource(source, retention, ancestorTraces))
    .filter((source): source is ProteinTranslationSource => Boolean(source))
  if (!sources.length) return undefined
  return { ...derivation, sources }
}

/** Apply one retention policy to a detached construct record. */
export function applyHistoryRetention(
  record: SequenceRecord,
  policy: HistoryRetentionPolicy,
): SequenceRecord {
  const history = trimHistoryNodeTraces(trimHistoryTree(record.history, policy.nativeAncestry), policy.ancestorTraces)
  const protein = record.protein
    ? {
        ...record.protein,
        translationDerivation: trimTranslationDerivation(
          record.protein.translationDerivation,
          policy.translationSources,
          policy.ancestorTraces,
        ),
      }
    : undefined
  return {
    ...record,
    history,
    snapGeneNativeHistory: trimSnapGeneNativeHistory(
      record.snapGeneNativeHistory,
      history,
      policy.nativeAncestry,
      policy.ancestorTraces,
    ),
    operations: policy.clearOperationLog
      ? []
      : record.operations.map((operation) => ({ ...operation })),
    ...(record.protein ? { protein } : {}),
  }
}
