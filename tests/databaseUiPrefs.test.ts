import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DATABASE_FILE_COLUMN_ORDER,
  moveColumnInOrder,
  normalizeColumnOrder,
  normalizeDatabaseFileColumnOrder,
} from '../src/storage/databaseUiPrefs'

describe('database UI column order', () => {
  it('normalizes partial and invalid orders', () => {
    expect(normalizeColumnOrder(['tags', 'name', 'nope'], DEFAULT_DATABASE_FILE_COLUMN_ORDER)).toEqual([
      'tags',
      'name',
      'format',
      'folder',
      'size',
      'fileSize',
      'updated',
      'actions',
    ])
  })

  it('moves a column before another', () => {
    const next = moveColumnInOrder(DEFAULT_DATABASE_FILE_COLUMN_ORDER, 'size', 'name')
    expect(next).toEqual(['size', 'name', 'format', 'folder', 'fileSize', 'tags', 'updated', 'actions'])
  })

  it('migrates the Format column beside Name in a legacy saved order', () => {
    expect(
      normalizeDatabaseFileColumnOrder([
        'name',
        'folder',
        'tags',
        'updated',
        'size',
        'actions',
      ]),
    ).toEqual(['name', 'format', 'folder', 'size', 'fileSize', 'tags', 'updated', 'actions'])
  })

  it('is a no-op when from and to match', () => {
    expect(moveColumnInOrder(DEFAULT_DATABASE_FILE_COLUMN_ORDER, 'tags', 'tags')).toEqual([
      ...DEFAULT_DATABASE_FILE_COLUMN_ORDER,
    ])
  })
})
