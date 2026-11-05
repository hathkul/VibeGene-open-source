import { describe, expect, it } from 'vitest'
import { databasePageWindow, DATABASE_TABLE_PAGE_SIZE } from './databasePagination'

describe('databasePageWindow', () => {
  it('bounds an 8,499-row library to the configured mounted rows per page', () => {
    expect(DATABASE_TABLE_PAGE_SIZE).toBe(50)
    expect(databasePageWindow(8_499, 0, DATABASE_TABLE_PAGE_SIZE)).toEqual({
      page: 0,
      pageCount: 170,
      start: 0,
      end: DATABASE_TABLE_PAGE_SIZE,
    })
    expect(databasePageWindow(8_499, 169, DATABASE_TABLE_PAGE_SIZE)).toEqual({
      page: 169,
      pageCount: 170,
      start: 8_450,
      end: 8_499,
    })
  })

  it('clamps stale page numbers after filtering or deletion', () => {
    expect(databasePageWindow(12, 20, DATABASE_TABLE_PAGE_SIZE)).toEqual({
      page: 0,
      pageCount: 1,
      start: 0,
      end: 12,
    })
  })

  it('returns an empty first page for an empty result set', () => {
    expect(databasePageWindow(0, 0, DATABASE_TABLE_PAGE_SIZE)).toEqual({
      page: 0,
      pageCount: 1,
      start: 0,
      end: 0,
    })
  })
})
