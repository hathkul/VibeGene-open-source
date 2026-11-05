import { describe, expect, it } from 'vitest'
import { DATABASE_TABLE_PAGE_SIZE } from '../../../domain/databasePagination'
import {
  buildDatabaseManagerBuiltinEmptyMessage,
  buildDatabaseManagerFilesEmptyState,
  buildDatabaseManagerPaginationModel,
  buildDatabaseManagerPrimersEmptyState,
  buildDatabaseManagerProteinsEmptyState,
} from './recordsModel'

describe('database manager records empty states', () => {
  it('labels primer empty and loading states', () => {
    expect(
      buildDatabaseManagerPrimersEmptyState({
        primerScanBusy: true,
        primerHitCount: 0,
        visiblePrimerCount: 0,
        browse: { kind: 'all' },
      }),
    ).toEqual({ kind: 'loading', message: 'Scanning primers…' })

    expect(
      buildDatabaseManagerPrimersEmptyState({
        primerScanBusy: false,
        primerHitCount: 0,
        visiblePrimerCount: 0,
        browse: { kind: 'common' },
      })?.message,
    ).toContain('No common primers yet')

    expect(
      buildDatabaseManagerPrimersEmptyState({
        primerScanBusy: false,
        primerHitCount: 1,
        visiblePrimerCount: 2,
        browse: { kind: 'tag', tag: 'pcr' },
      }),
    ).toBeNull()
  })

  it('labels protein and builtin empty states', () => {
    expect(
      buildDatabaseManagerProteinsEmptyState({
        proteinScanBusy: true,
        proteinHitCount: 0,
        visibleProteinCount: 0,
      }),
    ).toEqual({ kind: 'loading', message: 'Loading translated CDSes…' })

    expect(
      buildDatabaseManagerProteinsEmptyState({
        proteinScanBusy: false,
        proteinHitCount: 0,
        visibleProteinCount: 0,
      })?.message,
    ).toBe('No translated CDSes in this view.')

    expect(buildDatabaseManagerBuiltinEmptyMessage(0)).toBe('No built-in plasmids in this category.')
    expect(buildDatabaseManagerBuiltinEmptyMessage(3)).toBeNull()
  })

  it('labels files empty and loading states', () => {
    expect(
      buildDatabaseManagerFilesEmptyState({
        projectPageLoading: true,
        visibleProjectCount: 0,
        paginationTotal: 0,
      }),
    ).toEqual({ kind: 'loading', message: 'Loading files…' })

    expect(
      buildDatabaseManagerFilesEmptyState({
        projectPageLoading: false,
        visibleProjectCount: 0,
        paginationTotal: 0,
      }),
    ).toEqual({
      kind: 'empty',
      message: 'No files in this view.',
      hint: 'Drop SnapGene, GenBank, FASTA, or Vibegene files here to import.',
    })
  })
})

describe('database manager records pagination', () => {
  it('hides pagination below the page-size boundary', () => {
    expect(
      buildDatabaseManagerPaginationModel({
        total: DATABASE_TABLE_PAGE_SIZE,
        requestedPage: 0,
        pageSize: DATABASE_TABLE_PAGE_SIZE,
      }).visible,
    ).toBe(false)

    const above = buildDatabaseManagerPaginationModel({
      total: DATABASE_TABLE_PAGE_SIZE + 1,
      requestedPage: 1,
      pageSize: DATABASE_TABLE_PAGE_SIZE,
    })
    expect(above.visible).toBe(true)
    expect(above.page).toBe(1)
    expect(above.start).toBe(DATABASE_TABLE_PAGE_SIZE)
    expect(above.end).toBe(DATABASE_TABLE_PAGE_SIZE + 1)
  })

  it('clamps requested pages to the last page', () => {
    const model = buildDatabaseManagerPaginationModel({
      total: 60,
      requestedPage: 99,
      pageSize: 50,
    })
    expect(model.pageCount).toBe(2)
    expect(model.page).toBe(1)
    expect(model.end).toBe(60)
  })
})
