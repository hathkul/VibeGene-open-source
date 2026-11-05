import { databasePageWindow } from '../../../domain/databasePagination'
import type { DatabaseBrowseMode } from '../browsePresentation'
import type {
  DatabaseManagerPaginationModel,
  DatabaseManagerTableEmptyState,
} from './neutralTypes'

export type DatabaseManagerPrimersEmptyInput = {
  primerScanBusy: boolean
  primerHitCount: number
  visiblePrimerCount: number
  browse: DatabaseBrowseMode
}

export function buildDatabaseManagerPrimersEmptyState(
  input: DatabaseManagerPrimersEmptyInput,
): DatabaseManagerTableEmptyState | null {
  if (input.primerScanBusy && input.primerHitCount === 0) {
    return { kind: 'loading', message: 'Scanning primers…' }
  }
  if (input.visiblePrimerCount === 0) {
    return {
      kind: 'empty',
      message:
        input.browse.kind === 'common'
          ? 'No common primers yet. Use Primers → Add to Common Primers to save oligos here.'
          : 'No primers in this view.',
    }
  }
  return null
}

export type DatabaseManagerProteinsEmptyInput = {
  proteinScanBusy: boolean
  proteinHitCount: number
  visibleProteinCount: number
}

export function buildDatabaseManagerProteinsEmptyState(
  input: DatabaseManagerProteinsEmptyInput,
): DatabaseManagerTableEmptyState | null {
  if (input.proteinScanBusy && input.proteinHitCount === 0) {
    return { kind: 'loading', message: 'Loading translated CDSes…' }
  }
  if (input.visibleProteinCount === 0) {
    return { kind: 'empty', message: 'No translated CDSes in this view.' }
  }
  return null
}

export function buildDatabaseManagerBuiltinEmptyMessage(visibleBuiltInCount: number): string | null {
  return visibleBuiltInCount === 0 ? 'No built-in plasmids in this category.' : null
}

export type DatabaseManagerFilesEmptyInput = {
  projectPageLoading: boolean
  visibleProjectCount: number
  paginationTotal: number
}

export function buildDatabaseManagerFilesEmptyState(
  input: DatabaseManagerFilesEmptyInput,
): DatabaseManagerTableEmptyState | null {
  if (input.projectPageLoading && input.visibleProjectCount === 0) {
    return { kind: 'loading', message: 'Loading files…' }
  }
  if (input.paginationTotal === 0) {
    return {
      kind: 'empty',
      message: 'No files in this view.',
      hint: 'Drop SnapGene, GenBank, FASTA, or Vibegene files here to import.',
    }
  }
  return null
}

export type DatabaseManagerPaginationInput = {
  total: number
  requestedPage: number
  pageSize: number
}

export function buildDatabaseManagerPaginationModel(
  input: DatabaseManagerPaginationInput,
): DatabaseManagerPaginationModel {
  const window = databasePageWindow(input.total, input.requestedPage, input.pageSize)
  return {
    total: Math.max(0, Math.trunc(input.total)),
    pageSize: Math.max(1, Math.trunc(input.pageSize)),
    visible: input.total > input.pageSize,
    ...window,
  }
}
