import type { TraceFileRecord } from '../../domain/traceTypes'
import type { HistoryNode, ProteinTranslationSource, SequenceRecord } from '../../domain/types'

export type WorkspaceHistoryTranslationSourceRow = {
  key: string
  projectName: string
  detailLine: string
  openDisabled: boolean
  source: ProteinTranslationSource
}

export type WorkspaceHistoryOperationRow = {
  id: string
  title: string
  summary: string
  createdAtLabel: string
}

export type WorkspaceHistoryTabModel = {
  constructHistoryToolbar: {
    subtitle: string
    manageDisabled: boolean
  } | null
  proteinSourceToolbar: boolean
  translationSources: WorkspaceHistoryTranslationSourceRow[]
  tree: {
    root: HistoryNode
    remountKey: string
    libraryRecipeMembers?: Array<{ id: string; name: string; history: HistoryNode }>
  } | null
  operationsFallback: {
    showEmptyMessage: boolean
    rows: WorkspaceHistoryOperationRow[]
    mapRecord: SequenceRecord
  } | null
}

export type WorkspaceHistoryTabModelInput = {
  record: SequenceRecord
  traceFiles: TraceFileRecord[]
}

function translationSourceDetailLine(source: ProteinTranslationSource): string {
  if (source.cds) {
    return `${source.cds.featureName} · ${source.cds.nucleotideSequence.length.toLocaleString()} nt`
  }
  if (source.retention === 'reference-only') return 'Database reference only'
  return 'CDS details unavailable'
}

function buildLibraryRecipeMembers(
  record: SequenceRecord,
  traceFiles: TraceFileRecord[],
): Array<{ id: string; name: string; history: HistoryNode }> | undefined {
  const root = record.history
  if (!root || (root.operation !== 'cloneLibrary' && root.operation !== 'cloneSgRNALibrary')) {
    return undefined
  }
  return traceFiles.flatMap((member) => member.history
    && (member.history.operation === 'insertFragment'
      || member.history.operation === 'insertFragments'
      || member.history.operation === 'ligateFragments'
      || member.history.operation === 'cloneSgRNA')
    ? [{ id: member.id, name: member.fileName, history: member.history }]
    : [])
}

export function buildWorkspaceHistoryTabModel(
  input: WorkspaceHistoryTabModelInput,
): WorkspaceHistoryTabModel {
  const { record, traceFiles } = input
  const translationSources = record.protein?.translationDerivation?.sources ?? []
  const constructHistoryToolbar = record.molecule !== 'protein'
    ? {
        subtitle: record.history
          ? 'Manage retained ancestry and sequence snapshots.'
          : 'No ancestry tree is currently stored.',
        manageDisabled: !record.history && record.operations.length === 0,
      }
    : null
  const proteinSourceToolbar = record.molecule === 'protein' && translationSources.length > 0
  const translationSourceRows = translationSources.map((source, index) => ({
    key: `${source.projectId ?? source.projectName}-${index}`,
    projectName: source.projectName,
    detailLine: translationSourceDetailLine(source),
    openDisabled: !source.sourceRecord && !source.projectId,
    source,
  }))
  if (record.history) {
    return {
      constructHistoryToolbar,
      proteinSourceToolbar,
      translationSources: translationSourceRows,
      tree: {
        root: record.history,
        remountKey: `${record.id}:${record.history.id}`,
        libraryRecipeMembers: buildLibraryRecipeMembers(record, traceFiles),
      },
      operationsFallback: null,
    }
  }
  return {
    constructHistoryToolbar,
    proteinSourceToolbar,
    translationSources: translationSourceRows,
    tree: null,
    operationsFallback: {
      showEmptyMessage: record.operations.length === 0,
      rows: record.operations.map((operation, index) => ({
        id: operation.id,
        title: index === 0 ? record.name : operation.type,
        summary: operation.summary,
        createdAtLabel: new Date(operation.createdAt).toLocaleString(),
      })),
      mapRecord: record,
    },
  }
}
