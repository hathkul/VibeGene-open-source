import { describe, expect, it } from 'vitest'
import {
  decodeDatabaseProjectsDragPayload,
  encodeDatabaseProjectsDragPayload,
} from './databaseProjectDrag'

describe('database project drag payload', () => {
  it('round-trips unique project ids', () => {
    expect(decodeDatabaseProjectsDragPayload(encodeDatabaseProjectsDragPayload(['a', 'a', 'b']))).toEqual(['a', 'b'])
  })

  it('rejects malformed or foreign payloads', () => {
    expect(decodeDatabaseProjectsDragPayload('{"version":2,"projectIds":["a"]}')).toEqual([])
    expect(decodeDatabaseProjectsDragPayload('not json')).toEqual([])
  })
})
