import { describe, expect, it } from 'vitest'
import { parsePrimer3Output } from './parseResult'
import type { Primer3TemplateMapping } from './types'

const LINEAR: Primer3TemplateMapping = { topology: 'linear', recordLength: 500, templateLength: 300, offset: 100 }

const OUTPUT = [
  'SEQUENCE_ID=demo',
  'SEQUENCE_TEMPLATE=ACGT',
  'PRIMER_LEFT_EXPLAIN=considered 10, ok 5',
  'PRIMER_RIGHT_EXPLAIN=considered 12, ok 6',
  'PRIMER_INTERNAL_EXPLAIN=considered 3, ok 1',
  'PRIMER_PAIR_EXPLAIN=considered 4, ok 1',
  'PRIMER_WARNING=first warning; second warning',
  'PRIMER_LEFT_NUM_RETURNED=1',
  'PRIMER_RIGHT_NUM_RETURNED=1',
  'PRIMER_INTERNAL_NUM_RETURNED=1',
  'PRIMER_PAIR_NUM_RETURNED=1',
  'PRIMER_PAIR_0_PENALTY=0.512',
  'PRIMER_LEFT_0_PENALTY=0.2',
  'PRIMER_RIGHT_0_PENALTY=0.312',
  'PRIMER_INTERNAL_0_PENALTY=1.5',
  'PRIMER_LEFT_0_SEQUENCE=ACGTACGTACGTACGTACGT',
  'PRIMER_RIGHT_0_SEQUENCE=TTGGCCAATTGGCCAATTGG',
  'PRIMER_INTERNAL_0_SEQUENCE=GGGGCCCCAAAATTTTGGGG',
  'PRIMER_LEFT_0=10,20',
  'PRIMER_RIGHT_0=209,20',
  'PRIMER_INTERNAL_0=100,20',
  'PRIMER_LEFT_0_TM=60.1',
  'PRIMER_RIGHT_0_TM=59.9',
  'PRIMER_INTERNAL_0_TM=64.2',
  'PRIMER_LEFT_0_GC_PERCENT=50.000',
  'PRIMER_RIGHT_0_GC_PERCENT=50.000',
  'PRIMER_INTERNAL_0_GC_PERCENT=50.000',
  'PRIMER_LEFT_0_SELF_ANY_TH=1.50',
  'PRIMER_LEFT_0_SELF_END_TH=0.00',
  'PRIMER_LEFT_0_HAIRPIN_TH=12.30',
  'PRIMER_LEFT_0_END_STABILITY=3.9000',
  'PRIMER_LEFT_0_TEMPLATE_MISPRIMING_TH=20.00',
  'PRIMER_LEFT_0_LIBRARY_MISPRIMING=12.00, ALU',
  'PRIMER_LEFT_0_PROBLEMS=Tm too low',
  'PRIMER_LEFT_0_BOUND=98.4',
  'PRIMER_RIGHT_0_SELF_ANY=4.00',
  'PRIMER_RIGHT_0_SELF_END=2.00',
  'PRIMER_RIGHT_0_TEMPLATE_MISPRIMING=8.00',
  'PRIMER_PAIR_0_COMPL_ANY_TH=0.00',
  'PRIMER_PAIR_0_COMPL_END_TH=0.00',
  'PRIMER_PAIR_0_COMPL_ANY=3.00',
  'PRIMER_PAIR_0_COMPL_END=1.00',
  'PRIMER_PAIR_0_PRODUCT_SIZE=200',
  'PRIMER_PAIR_0_PRODUCT_TM=80.5',
  'PRIMER_PAIR_0_T_OPT_A=58.1',
  '=',
  '',
].join('\n')

describe('parsePrimer3Output', () => {
  it('parses oligos, pairs, explain lines, warnings and raw tags', () => {
    const result = parsePrimer3Output(OUTPUT, 'INPUT', LINEAR)
    expect(result.input).toBe('INPUT')
    expect(result.output).toBe(OUTPUT)
    expect(result.raw.SEQUENCE_ID).toBe('demo')
    expect(result.explain).toEqual({
      left: 'considered 10, ok 5',
      right: 'considered 12, ok 6',
      internal: 'considered 3, ok 1',
      pair: 'considered 4, ok 1',
    })
    expect(result.warnings).toEqual(['first warning', 'second warning'])
    expect(result.errors).toEqual([])

    const [left] = result.lefts
    expect(left).toMatchObject({
      kind: 'left',
      rank: 0,
      sequence: 'ACGTACGTACGTACGTACGT',
      length: 20,
      templateStart: 10,
      templateEnd: 30,
      recordStart: 110,
      recordEnd: 130,
      tm: 60.1,
      gcPercent: 50,
      penalty: 0.2,
      selfAnyTh: 1.5,
      selfEndTh: 0,
      hairpinTh: 12.3,
      endStability: 3.9,
      templateMisprimingTh: 20,
      libraryMispriming: '12.00, ALU',
      problems: 'Tm too low',
      extra: { BOUND: '98.4' },
    })

    const [right] = result.rights
    expect(right).toMatchObject({
      templateStart: 190,
      templateEnd: 210,
      recordStart: 290,
      recordEnd: 310,
      selfAny: 4,
      selfEnd: 2,
      templateMispriming: 8,
    })
    expect(result.internals[0]).toMatchObject({ templateStart: 100, templateEnd: 120, tm: 64.2 })

    expect(result.pairs).toHaveLength(1)
    const [pair] = result.pairs
    expect(pair).toMatchObject({
      rank: 0,
      penalty: 0.512,
      productSize: 200,
      productTm: 80.5,
      complAny: 3,
      complEnd: 1,
      complAnyTh: 0,
      complEndTh: 0,
      extra: { T_OPT_A: '58.1' },
    })
    expect(pair.left).toBe(left)
    expect(pair.right).toBe(right)
    expect(pair.internal).toBe(result.internals[0])
  })

  it('maps template spans across the origin of circular records', () => {
    const circular: Primer3TemplateMapping = { topology: 'circular', recordLength: 400, templateLength: 400, offset: 300 }
    const output = ['PRIMER_LEFT_0=95,20', 'PRIMER_RIGHT_0=119,20', 'PRIMER_LEFT_1=80,20', 'PRIMER_LEFT_NUM_RETURNED=2', '='].join('\n')
    const result = parsePrimer3Output(output, '', circular)
    expect(result.lefts.map(({ recordStart, recordEnd }) => [recordStart, recordEnd])).toEqual([
      [395, 15],
      [380, 400],
    ])
    expect(result.rights[0]).toMatchObject({ templateStart: 100, recordStart: 0, recordEnd: 20 })
    expect(result.pairs).toEqual([])
  })

  it('collects Primer3 errors', () => {
    const result = parsePrimer3Output('SEQUENCE_ID=x\nPRIMER_ERROR=Unrecognized tag: FOO=1; Missing SEQUENCE tag\n=\n', '', LINEAR)
    expect(result.errors).toEqual(['Unrecognized tag: FOO=1', 'Missing SEQUENCE tag'])
    expect(result.pairs).toEqual([])
    expect(result.lefts).toEqual([])
  })
})
