import { themeFixturePalette } from '../test-support/themeFixturePalette'
import { describe, expect, it } from 'vitest'
import { isPrimerNameTaken, mergeIdenticalPrimers, primerNameConflicts } from './primerNames'
import type { Primer } from './types'

const primer = (id: string, name: string, sequence: string): Primer => ({ id, name, sequence, color: themeFixturePalette.black })

describe('primer names', () => {
  it('reports only same-name primers whose sequences differ', () => {
    expect(primerNameConflicts([
      primer('a', 'M13 F', 'ATGC'),
      primer('b', 'm13 f', 'ATGC'),
      primer('c', 'M13 F', 'GCTA'),
    ])).toMatchObject([{ name: 'M13 F', primers: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }])
  })

  it('treats names case-insensitively and excludes the primer being edited', () => {
    const primers = [primer('a', 'M13 F', 'ATGC'), primer('b', 'M13 R', 'GCTA')]
    expect(isPrimerNameTaken(primers, ' m13 f ')).toBe(true)
    expect(isPrimerNameTaken(primers, 'm13 f', 'a')).toBe(false)
  })

  it('merges exact duplicate identities and retains their separate bindings', () => {
    const first = { ...primer('a', 'M13 F', 'ATGC'), bindings: [{ strand: 'forward' as const, templateStart: 1, templateEnd: 5, components: [] }] }
    const second = { ...primer('b', 'm13 f', 'ATGC'), bindings: [{ strand: 'forward' as const, templateStart: 9, templateEnd: 13, components: [] }] }
    const result = mergeIdenticalPrimers([first, second, primer('c', 'M13 F', 'GCTA')])
    expect(result.merges).toEqual([{ name: 'M13 F', sequence: 'ATGC', mergedCount: 1 }])
    expect(result.primers).toHaveLength(2)
    expect(result.primers[0]?.bindings).toHaveLength(2)
  })
})
