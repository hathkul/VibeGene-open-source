import { describe, expect, it } from 'vitest'
import { themeFixturePalette } from '../test-support/themeFixturePalette'
import {
  decodeDatabasePrimersDragPayload,
  encodeDatabasePrimersDragPayload,
} from './databasePrimerDrag'

describe('database primer drag payload', () => {
  it('round-trips primer metadata', () => {
    expect(decodeDatabasePrimersDragPayload(encodeDatabasePrimersDragPayload([{
      name: 'Forward',
      sequence: 'atgc',
      color: themeFixturePalette.purple,
      description: 'test',
    }]))).toEqual([{
      name: 'Forward',
      sequence: 'atgc',
      color: themeFixturePalette.purple,
      description: 'test',
    }])
  })

  it('rejects malformed and incomplete payloads', () => {
    expect(decodeDatabasePrimersDragPayload('{"version":2,"primers":[]}')).toEqual([])
    expect(decodeDatabasePrimersDragPayload('{"version":1,"primers":[{"name":"","sequence":"ATGC"}]}')).toEqual([])
    expect(decodeDatabasePrimersDragPayload('not json')).toEqual([])
  })
})
