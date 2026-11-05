import { describe, expect, it } from 'vitest'
import type { Primer } from '../src/domain/types'
import {
  collectPrimerTagNames,
  commonPrimerTags,
  dedupePrimerHits,
  primerHitsFromRecord,
  primerIdentityKey,
} from '../src/storage/databasePrimers'

function primer(name: string, sequence: string, id = name): Primer {
  return { id, name, sequence, color: '#7c3aed' }
}

describe('primerIdentityKey', () => {
  it('treats name case and DNA case as the same primer', () => {
    expect(primerIdentityKey('T7-F', 'atgc')).toBe(primerIdentityKey('t7-f', 'ATGC'))
  })

  it('keeps different names with the same sequence distinct', () => {
    expect(primerIdentityKey('T7-F', 'ATGC')).not.toBe(primerIdentityKey('T7-R', 'ATGC'))
  })
})

describe('dedupePrimerHits', () => {
  it('dedupes the same primer from two files in one folder', () => {
    const hits = [
      ...primerHitsFromRecord([primer('T7-F', 'ATGC')], {
        projectId: 'a',
        projectName: 'pA',
        folderId: 'folder-1',
      }),
      ...primerHitsFromRecord([primer('T7-F', 'atgc')], {
        projectId: 'b',
        projectName: 'pB',
        folderId: 'folder-1',
      }),
    ]
    const rows = dedupePrimerHits(hits)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.sources.map((source) => source.projectId)).toEqual(['a', 'b'])
  })

  it('keeps the same primer separate when files live in different folders', () => {
    const folderA = primerHitsFromRecord([primer('T7-F', 'ATGC')], {
      projectId: 'a',
      projectName: 'pA',
      folderId: 'folder-1',
    })
    const folderB = primerHitsFromRecord([primer('T7-F', 'ATGC')], {
      projectId: 'b',
      projectName: 'pB',
      folderId: 'folder-2',
    })
    expect(dedupePrimerHits(folderA)).toHaveLength(1)
    expect(dedupePrimerHits(folderB)).toHaveLength(1)
    expect(dedupePrimerHits([...folderA, ...folderB])).toHaveLength(1)
  })

  it('collapses a global All primers list to unique name+sequence rows', () => {
    const hits = [
      ...primerHitsFromRecord([primer('T7-F', 'ATGC'), primer('T7-R', 'GCAT')], {
        projectId: 'a',
        projectName: 'pA',
        folderId: 'folder-1',
      }),
      ...primerHitsFromRecord([primer('T7-F', 'ATGC')], {
        projectId: 'b',
        projectName: 'pB',
        folderId: 'folder-2',
      }),
    ]
    const rows = dedupePrimerHits(hits)
    expect(rows.map((row) => row.name).sort()).toEqual(['T7-F', 'T7-R'])
    expect(rows.find((row) => row.name === 'T7-F')?.sources).toHaveLength(2)
  })
})

describe('primer library tags', () => {
  const t7 = primerIdentityKey('T7-F', 'ATGC')
  const t7r = primerIdentityKey('T7-R', 'GCAT')
  const sp6 = primerIdentityKey('SP6', 'GGAT')

  it('collects unique tag names with first-seen casing', () => {
    const map = new Map<string, string[]>([
      [t7, ['PCR', 'set-A']],
      [t7r, ['pcr', 'set-B']],
    ])
    expect(collectPrimerTagNames(map)).toEqual(['PCR', 'set-A', 'set-B'])
  })

  it('intersects tags across a selection', () => {
    const map = new Map<string, string[]>([
      [t7, ['PCR', 'set-A']],
      [t7r, ['pcr', 'set-B']],
      [sp6, ['Other']],
    ])
    expect(commonPrimerTags([t7, t7r], map)).toEqual(['PCR'])
    expect(commonPrimerTags([t7, sp6], map)).toEqual([])
    expect(commonPrimerTags([], map)).toEqual([])
  })
})
