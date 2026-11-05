import { themeFixturePalette } from '../test-support/themeFixturePalette'
import { describe, expect, it } from 'vitest'
import { annealComplementaryOligos, complementaryPrimerPair, partnerForCloningOligo, presentAnnealedInsert } from './annealedOligos'
import { defaultConstructProperties } from './constructProperties'
import { reverseComplement } from './sequence'
import type { Primer, SequenceRecord } from './types'

const target = 'ACGTACGTACGTACGTACGT'

function primer(id: string, name: string, sequence: string): Primer {
  return { id, name, sequence, color: themeFixturePalette.greenPrimary }
}

function parent(): SequenceRecord {
  return {
    id: 'vector', name: 'pGuide', description: '', molecule: 'dna', topology: 'circular',
    sequence: 'A'.repeat(40), features: [], primers: [], operations: [],
    construct: defaultConstructProperties, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('annealed cloning oligos', () => {
  it('keeps 5′ tails as sticky ends and the shared duplex once', () => {
    const duplexBody = `G${target}`
    const sense = `CACC${duplexBody}`
    const antisense = reverseComplement(`${duplexBody}AAAC`)
    const annealed = annealComplementaryOligos(sense, antisense)
    expect(annealed).toMatchObject({
      sequence: `CACC${duplexBody}AAAC`,
      upstreamStickiness: 4,
      downstreamStickiness: 4,
    })
  })

  it('rejects oligos that do not share one duplex', () => {
    expect(annealComplementaryOligos('ACGTACGTACGTACGT', 'TTTTTTTTTTTTTTTT')).toBeNull()
  })

  it('opens a linear insert whose history parent is the source plasmid', () => {
    const sense = primer('s', 'guide 1_sense', `CACC${target}`)
    const antisense = primer('a', 'guide 1_antisense', reverseComplement(target))
    const pair = complementaryPrimerPair([antisense, sense])
    expect(pair?.sense.name).toBe('guide 1_sense')
    const insert = presentAnnealedInsert({
      parent: parent(),
      sense: { name: sense.name, sequence: sense.sequence },
      antisense: { name: antisense.name, sequence: antisense.sequence },
      guide: { id: 'g1', name: 'guide 1', spacer: target, expressedGuide: target },
    })
    expect(insert?.topology).toBe('linear')
    expect(insert?.dnaEnds?.upstream.stickiness).toBe(4)
    expect(insert?.dnaEnds?.downstream.stickiness).toBe(0)
    expect(insert?.primers.map((item) => item.name)).toEqual(['guide 1_sense', 'guide 1_antisense'])
    expect(insert?.history?.operation).toBe('annealOligos')
    expect(insert?.history?.children.map((child) => child.name)).toEqual(['pGuide.dna'])
    expect(insert?.features[0]?.notes).toContain('vibegene_sgrna_source_id')
    expect(partnerForCloningOligo(sense, [sense, antisense, primer('other', 'other_sense', 'AAAA')])?.antisense.id).toBe('a')
  })
})
