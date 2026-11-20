// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { db } from './projects'
import { getCommonPrimer, setCommonPrimerSpecificity, upsertCommonPrimer } from './commonPrimers'
import { primerPropertiesPayloadFromDatabaseRow, commonPrimersToHits, dedupePrimerHits } from './databasePrimers'

const specificity = {
  primerSequence: 'ACGTACGTACGT', searchedSequence: 'ACGTACGTACGT', completedAt: '2026-11-18T00:00:00.000Z',
  result: { searchSet: { database: 'refseq_rna' as const, organism: '9606' }, sequenceLength: 12, sites: [], truncated: false, fastSearch: false },
}

afterEach(async () => { await db.commonPrimers.clear() })

describe('common primer specificity', () => {
  it('keeps each construct source when identical database primers are deduplicated', () => {
    const row = dedupePrimerHits([
      { key: 'same', name: 'Primer', sequence: 'ACGT', color: '', description: '', projectId: 'one', projectName: 'First', folderId: null },
      { key: 'same', name: 'Primer', sequence: 'ACGT', color: '', description: '', projectId: 'two', projectName: 'Second', folderId: null },
    ])[0]!
    expect(row.sources.map((source) => source.projectId)).toEqual(['one', 'two'])
  })

  it('persists, reloads through the database dialog, and deletes a saved result', async () => {
    const primer = await upsertCommonPrimer({ name: 'Primer', sequence: specificity.primerSequence })
    await setCommonPrimerSpecificity(primer.id, specificity)
    const saved = await getCommonPrimer(primer.id)
    expect(saved?.specificity).toEqual(specificity)
    const row = dedupePrimerHits(commonPrimersToHits([saved!]))[0]!
    const payload = await primerPropertiesPayloadFromDatabaseRow(row, async () => null)
    expect(payload.specificity).toEqual(specificity)
    expect(payload.commonId).toBe(primer.id)
    await upsertCommonPrimer({ id: primer.id, name: 'Renamed', sequence: primer.sequence })
    expect((await getCommonPrimer(primer.id))?.specificity).toEqual(specificity)
    await setCommonPrimerSpecificity(primer.id, undefined)
    expect((await getCommonPrimer(primer.id))?.specificity).toBeUndefined()
  })
})
