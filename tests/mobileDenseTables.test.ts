import { describe, expect, it } from 'vitest'
import { dbFileColumnClassName } from '../src/ui/mobileDenseTables'

describe('dbFileColumnClassName', () => {
  it('maps column ids to stable db-file-col classes for phone CSS', () => {
    expect(dbFileColumnClassName('name')).toBe('db-file-col-name')
    expect(dbFileColumnClassName('actions')).toBe('db-file-col-actions')
    expect(dbFileColumnClassName('updated')).toBe('db-file-col-updated')
  })
})
