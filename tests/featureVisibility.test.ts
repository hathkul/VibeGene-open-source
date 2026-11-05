import { describe, expect, it } from 'vitest'
import { featureLocationsKey, hideGenesMatchingCds } from '../src/domain/featureVisibility'
import { parseGenBank } from '../src/domain/parsers'
import type { SequenceFeature } from '../src/domain/types'

function feature(
  type: string,
  locations: SequenceFeature['locations'],
  name = type,
  visible?: boolean,
): SequenceFeature {
  return {
    id: `${type}-${name}`,
    name,
    type,
    color: '#000',
    locations,
    ...(visible === false ? { visible: false } : {}),
  }
}

describe('hideGenesMatchingCds', () => {
  it('hides gene when intervals and strand exactly match a CDS', () => {
    const locations = [{ start: 10, end: 100, strand: 'forward' as const }]
    const result = hideGenesMatchingCds([
      feature('gene', locations, 'orfA'),
      feature('CDS', locations, 'orfA'),
      feature('promoter', [{ start: 0, end: 10, strand: 'forward' }], 'p'),
    ])
    expect(result.find((f) => f.type === 'gene')?.visible).toBe(false)
    expect(result.find((f) => f.type === 'CDS')?.visible).toBeUndefined()
    expect(result.find((f) => f.type === 'promoter')?.visible).toBeUndefined()
  })

  it('keeps gene visible when it extends beyond CDS', () => {
    const result = hideGenesMatchingCds([
      feature('gene', [{ start: 0, end: 200, strand: 'forward' }], 'BRCA1'),
      feature('CDS', [{ start: 50, end: 150, strand: 'forward' }], 'BRCA1'),
    ])
    expect(result.find((f) => f.type === 'gene')?.visible).toBeUndefined()
  })

  it('requires matching strand', () => {
    const result = hideGenesMatchingCds([
      feature('gene', [{ start: 10, end: 100, strand: 'forward' }], 'x'),
      feature('CDS', [{ start: 10, end: 100, strand: 'reverse' }], 'x'),
    ])
    expect(result.find((f) => f.type === 'gene')?.visible).toBeUndefined()
  })

  it('matches multi-segment joins in order', () => {
    const locs = [
      { start: 10, end: 20, strand: 'forward' as const },
      { start: 40, end: 50, strand: 'forward' as const },
    ]
    expect(featureLocationsKey(locs)).toBe('10:20:forward|40:50:forward')
    const result = hideGenesMatchingCds([feature('gene', locs, 'j'), feature('CDS', locs, 'j')])
    expect(result[0]?.visible).toBe(false)
  })
})

describe('parseGenBank redundant gene hiding', () => {
  it('imports coextensive gene+CDS with gene hidden', () => {
    const gb = `LOCUS       TEST 120 bp DNA circular SYN 01-JAN-2020
DEFINITION  test.
FEATURES             Location/Qualifiers
     gene            11..100
                     /gene="orfA"
     CDS             11..100
                     /gene="orfA"
                     /product="protein A"
     gene            1..120
                     /gene="big"
     CDS             21..80
                     /gene="big"
                     /product="protein B"
ORIGIN
${'a'.repeat(120)}
//`
    const record = parseGenBank(gb)
    const orfGene = record.features.find((f) => f.type === 'gene' && f.name === 'orfA')
    const bigGene = record.features.find((f) => f.type === 'gene' && f.name === 'big')
    expect(orfGene?.visible).toBe(false)
    expect(bigGene?.visible).toBeUndefined()
    expect(record.features.filter((f) => f.type === 'CDS').every((f) => f.visible !== false)).toBe(true)
  })
})
