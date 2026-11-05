/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'
import { PRIMER3_BUILTIN_LIBRARY_HUMREP } from './types'
import { loadPrimer3DialogState, savePrimer3DialogState } from './settingsStorage'

describe('primer3 dialog settings storage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns defaults when storage is missing or corrupt', () => {
    expect(loadPrimer3DialogState().selectionMode).toBe('template')
    window.localStorage.setItem('vibegene.primer3.dialog.v1', '{not json')
    expect(loadPrimer3DialogState().selectionMode).toBe('template')
  })

  it('persists non-default settings and libraries under size limit', () => {
    savePrimer3DialogState({
      settings: { PRIMER_OPT_SIZE: '22' },
      selectionMode: 'target',
      misprimingLibrary: { kind: 'builtin', id: PRIMER3_BUILTIN_LIBRARY_HUMREP },
      internalMishybLibrary: { kind: 'none' },
      specificitySearchSet: { database: 'refseq_representative_genomes', organism: '10090' },
      specificityFastSearch: false,
    })
    const loaded = loadPrimer3DialogState()
    expect(loaded.specificitySearchSet).toEqual({ database: 'refseq_representative_genomes', organism: '10090' })
    expect(loaded.specificityFastSearch).toBe(false)
    expect(loaded.settings.PRIMER_OPT_SIZE).toBe('22')
    expect(loaded.selectionMode).toBe('target')
    expect(loaded.misprimingLibrary.kind).toBe('builtin')
  })

  it('drops unknown tags and oversized custom libraries', () => {
    const huge = 'N'.repeat(600_000)
    savePrimer3DialogState({
      settings: { NOT_A_TAG: '1', PRIMER_NUM_RETURN: '3', SEQUENCE_QUALITY: '40 40 40' },
      selectionMode: 'included',
      misprimingLibrary: { kind: 'custom', name: 'big.fa', fasta: huge },
      internalMishybLibrary: { kind: 'none' },
      specificitySearchSet: { database: 'not_a_db' as never, organism: '9606' },
      specificityFastSearch: true,
    })
    const loaded = loadPrimer3DialogState()
    expect(loaded.settings.NOT_A_TAG).toBeUndefined()
    expect(loaded.settings.SEQUENCE_QUALITY).toBeUndefined()
    expect(loaded.settings.PRIMER_NUM_RETURN).toBe('3')
    expect(loaded.misprimingLibrary.kind).toBe('none')
    expect(loaded.specificitySearchSet).toEqual({ database: 'refseq_rna', organism: '9606' })
  })

  it('defaults fast search from the stored search set when the flag is missing', () => {
    window.localStorage.setItem(
      'vibegene.primer3.dialog.v1',
      JSON.stringify({ specificitySearchSet: { database: 'refseq_representative_genomes', organism: '9606' } }),
    )
    expect(loadPrimer3DialogState().specificityFastSearch).toBe(true)
    window.localStorage.setItem(
      'vibegene.primer3.dialog.v1',
      JSON.stringify({ specificitySearchSet: { database: 'refseq_rna', organism: '9606' } }),
    )
    expect(loadPrimer3DialogState().specificityFastSearch).toBe(false)
  })
})
