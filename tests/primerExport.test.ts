import { describe, expect, it } from 'vitest'
import type { Primer, SequenceFeature } from '../src/domain/types'
import {
  exportSgRnaDataTsv,
  isPrimerListTabText,
  parsePrimerDataTsv,
  resolvePrimerImportCandidates,
  retainHybridizingPrimers,
  retainHybridizingPrimersAgainstAny,
} from '../src/domain/primerExport'
import { defaultPrimerHybridizationParams } from '../src/domain/primerHybridization'

describe('exportSgRnaDataTsv', () => {
  it('writes guide name and spacer in the primer list format', () => {
    const guide = (name: string) => ({ id: name, name, type: 'misc_feature', start: 0, end: 20, strand: 'forward', color: '#000' }) as unknown as SequenceFeature
    const text = exportSgRnaDataTsv([
      { guide: guide('SpCas9 sgRNA 1'), spacer: 'GACGTCGACTAGCTAGCATG' },
      { guide: guide('SpCas9 sgRNA 2'), spacer: 'TTGACCGATCGATCGGATCC' },
    ])
    expect(text).toBe('SpCas9 sgRNA 1\tGACGTCGACTAGCTAGCATG\nSpCas9 sgRNA 2\tTTGACCGATCGATCGGATCC')
    expect(parsePrimerDataTsv(text, { requireTab: true })).toEqual([
      { name: 'SpCas9 sgRNA 1', sequence: 'GACGTCGACTAGCTAGCATG' },
      { name: 'SpCas9 sgRNA 2', sequence: 'TTGACCGATCGATCGGATCC' },
    ])
  })
})

describe('parsePrimerDataTsv', () => {
  it('parses tab-separated name/sequence lines', () => {
    expect(
      parsePrimerDataTsv('M13F\tGTAAAACGACGGCCAGT\n# comment\nM13R\tCAGGAAACAGCTATGAC\n'),
    ).toEqual([
      { name: 'M13F', sequence: 'GTAAAACGACGGCCAGT' },
      { name: 'M13R', sequence: 'CAGGAAACAGCTATGAC' },
    ])
  })

  it('requires strict name<tab>sequence lines for folder .txt detection', () => {
    expect(parsePrimerDataTsv('M13F GTAAAACGACGGCCAGT', { requireTab: true })).toEqual([])
    expect(isPrimerListTabText('M13F GTAAAACGACGGCCAGT')).toBe(false)
    expect(isPrimerListTabText('M13F\tGTAAAACGACGGCCAGT')).toBe(true)
  })

  it('accepts SnapGene-style trailing empty tab columns', () => {
    const text =
      'tagRFP EcoRI dir\tagagagaattcaccatggtgtctaagggcgaag\t\r\n' +
      'tagRFP Spe rev  \tggttgattactagtgtcttaattaagtttgtg \t\n' +
      'WPRE alpha direct\tGTGCGCTTGCCTCATTGGGTGTGCACTGTGTTTGCTGAC\n'
    expect(isPrimerListTabText(text)).toBe(true)
    expect(parsePrimerDataTsv(text, { requireTab: true })).toEqual([
      { name: 'tagRFP EcoRI dir', sequence: 'AGAGAGAATTCACCATGGTGTCTAAGGGCGAAG' },
      { name: 'tagRFP Spe rev', sequence: 'GGTTGATTACTAGTGTCTTAATTAAGTTTGTG' },
      { name: 'WPRE alpha direct', sequence: 'GTGCGCTTGCCTCATTGGGTGTGCACTGTGTTTGCTGAC' },
    ])
  })

  it('rejects feature exports and mixed non-primer .txt content', () => {
    expect(isPrimerListTabText('LDLR\t87..2669\t2583\t=>\tCDS')).toBe(false)
    expect(parsePrimerDataTsv('LDLR\t87..2669\t2583\t=>\tCDS', { requireTab: true })).toEqual([])
    expect(
      isPrimerListTabText('M13F\tGTAAAACGACGGCCAGT\nnot a primer line\nM13R\tCAGGAAACAGCTATGAC\n'),
    ).toBe(false)
  })
})

describe('resolvePrimerImportCandidates', () => {
  const template = `${'N'.repeat(20)}GAATTCGCGGCCGC${'N'.repeat(20)}`

  it('keeps source primer color and description when hybridizing onto another template', () => {
    const { candidates, skipped } = resolvePrimerImportCandidates(
      template,
      [
        {
          name: 'Eco-F',
          sequence: 'GAATTCGCGGCCGC',
          color: '#c0265a',
          description: 'from other file',
        },
      ],
      [],
      defaultPrimerHybridizationParams,
    )

    expect(skipped).toBe(0)
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      name: 'Eco-F',
      alreadyPresent: false,
      primer: {
        name: 'Eco-F',
        sequence: 'GAATTCGCGGCCGC',
        color: '#c0265a',
        description: 'from other file',
      },
    })
    expect(candidates[0]!.strand).toBe('forward')
    expect(candidates[0]!.primer.bindings?.length).toBeGreaterThan(0)
  })

  it('marks primers already present by sequence and skips non-hybridizing entries', () => {
    const existing = [
      {
        id: 'existing',
        name: 'Eco-F',
        sequence: 'GAATTCGCGGCCGC',
        color: '#111',
      },
    ]
    const { candidates, skipped } = resolvePrimerImportCandidates(
      template,
      [
        { name: 'Eco-F', sequence: 'GAATTCGCGGCCGC', color: '#c0265a' },
        { name: 'NoHit', sequence: 'AAAAAAAAAAAAAAAA' },
      ],
      existing,
      defaultPrimerHybridizationParams,
    )

    expect(skipped).toBe(1)
    expect(candidates).toHaveLength(1)
    expect(candidates[0]!.alreadyPresent).toBe(true)
  })

  it('skips primers whose only hit has a 3-prime mismatch', () => {
    const annealed = 'GACCACCATGTCAACGTTGG'
    const template = `NNNN${annealed.slice(0, -1)}A${'N'.repeat(20)}`
    const { candidates, skipped } = resolvePrimerImportCandidates(
      template,
      [{ name: 'TermMM', sequence: annealed }],
      [],
      defaultPrimerHybridizationParams,
    )
    expect(candidates).toHaveLength(0)
    expect(skipped).toBe(1)
  })

  it('keeps primers that miss consensus but anneal to a library member template', () => {
    const consensus = `${'N'.repeat(40)}`
    const member = `${'N'.repeat(20)}GAATTCGCGGCCGC${'N'.repeat(20)}`
    const { candidates, skipped } = resolvePrimerImportCandidates(
      consensus,
      [{ name: 'Eco-F', sequence: 'GAATTCGCGGCCGC', color: '#c0265a' }],
      [],
      defaultPrimerHybridizationParams,
      { additionalTemplates: [member] },
    )
    expect(skipped).toBe(0)
    expect(candidates).toHaveLength(1)
    expect(candidates[0]!.name).toBe('Eco-F')
    // No consensus duplex — bindings left empty for redistribute onto members.
    expect(candidates[0]!.primer.bindings).toBeUndefined()
  })

  it('still skips primers that anneal to neither consensus nor members', () => {
    const { candidates, skipped } = resolvePrimerImportCandidates(
      `${'N'.repeat(40)}`,
      [{ name: 'NoHit', sequence: 'AAAAAAAAAAAAAAAA' }],
      [],
      defaultPrimerHybridizationParams,
      { additionalTemplates: [`${'N'.repeat(40)}`] },
    )
    expect(candidates).toHaveLength(0)
    expect(skipped).toBe(1)
  })
})

describe('retainHybridizingPrimers', () => {
  const template = `${'N'.repeat(20)}GAATTCGCGGCCGC${'N'.repeat(20)}`

  it('keeps primers that hybridize and drops the rest', () => {
    const binders: Primer[] = [
      { id: 'eco', name: 'Eco-F', sequence: 'GAATTCGCGGCCGC', color: '#111' },
    ]
    const misses: Primer[] = [
      { id: 'polyA', name: 'NoHit', sequence: 'AAAAAAAAAAAAAAAA', color: '#222' },
    ]
    const { kept, dropped } = retainHybridizingPrimers(
      template,
      [...binders, ...misses],
      defaultPrimerHybridizationParams,
    )
    expect(dropped).toBe(1)
    expect(kept).toHaveLength(1)
    expect(kept[0]!.name).toBe('Eco-F')
    expect(kept[0]!.bindings?.length).toBeGreaterThan(0)
  })
})

describe('retainHybridizingPrimersAgainstAny', () => {
  it('keeps primers that only hit an additional template', () => {
    const primer: Primer = {
      id: 'eco',
      name: 'Eco-F',
      sequence: 'GAATTCGCGGCCGC',
      color: '#111',
    }
    const { kept, dropped } = retainHybridizingPrimersAgainstAny(
      [`${'N'.repeat(40)}`, `${'N'.repeat(20)}GAATTCGCGGCCGC${'N'.repeat(20)}`],
      [primer],
      defaultPrimerHybridizationParams,
    )
    expect(dropped).toBe(0)
    expect(kept).toHaveLength(1)
    expect(kept[0]!.bindings).toBeUndefined()
  })
})
