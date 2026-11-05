import { describe, expect, it } from 'vitest'
import { findRestrictionSites } from '../src/domain/enzymes'
import {
  adjustFeaturesForInsert,
  applySequenceReplacementAnnotations,
  circularizeLinearRecord,
  complementDnaBase,
  extractRange,
  extractRangePreserveCase,
  featureLength,
  findPrimerBindings,
  linearizeCircularAtOrigin,
  parseOriginPositionInput,
  primerAnneal3PrimePosition,
  primerAnneal5PrimePosition,
  primerBindingToCalloutSite,
  reverseComplement,
  restrictionCutAnchorStrandSelection,
  restrictionFragmentStrandSelection,
  setCircularOrigin,
} from '../src/domain/sequence'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import type { Primer, SequenceFeature, SequenceRecord } from '../src/domain/types'

describe('complementDnaBase', () => {
  it('complements lowercase bases in lowercase', () => {
    expect(complementDnaBase('a')).toBe('t')
    expect(complementDnaBase('c')).toBe('g')
    expect(complementDnaBase('g')).toBe('c')
    expect(complementDnaBase('t')).toBe('a')
  })

  it('complements uppercase bases in uppercase', () => {
    expect(complementDnaBase('A')).toBe('T')
    expect(complementDnaBase('C')).toBe('G')
  })
})

describe('extractRangePreserveCase', () => {
  it('keeps mixed case on a linear slice', () => {
    expect(extractRangePreserveCase('ATgcGA', 1, 5)).toBe('TgcG')
  })

  it('keeps mixed case across a circular wrap', () => {
    expect(extractRangePreserveCase('atGCga', 4, 2)).toBe('gaat')
  })

  it('still uppercases via extractRange', () => {
    expect(extractRange('ATgcGA', 1, 5)).toBe('TGCG')
  })

  it('lets reverseComplement preserve case from a preserved extract', () => {
    expect(reverseComplement(extractRangePreserveCase('ATgc', 0, 4))).toBe('gcAT')
  })
})

describe('sequence annotation edits', () => {
  const feature: SequenceFeature = {
    id: 'f1',
    name: 'CDS',
    type: 'CDS',
    color: '#22c55e',
    locations: [{ start: 10, end: 20, strand: 'forward' }],
  }

  it('extends a feature when sequence is inserted inside it', () => {
    const [updated] = adjustFeaturesForInsert([feature], 15, 5)
    expect(updated?.locations[0]).toEqual({ start: 10, end: 25, strand: 'forward' })
  })

  it('shifts downstream features when sequence is inserted before them', () => {
    const downstream: SequenceFeature = {
      ...feature,
      id: 'f2',
      locations: [{ start: 30, end: 40, strand: 'forward' }],
    }
    const [updated] = adjustFeaturesForInsert([downstream], 5, 8)
    expect(updated?.locations[0]).toEqual({ start: 38, end: 48, strand: 'forward' })
  })

  it('updates features and leaves primers sequence-only during replacement', () => {
    const record: SequenceRecord = {
      id: 'seq-1',
      name: 'test',
      description: '',
      molecule: 'dna',
      topology: 'linear',
      sequence: 'A'.repeat(40),
      features: [feature],
      primers: [{ id: 'p1', name: 'p1', sequence: 'GACCACCATGTC', color: '#000' }],
      operations: [],
      construct: defaultConstructProperties,
      createdAt: '',
      updatedAt: '',
    }
    const updated = applySequenceReplacementAnnotations(record, 15, 15, 6)
    expect(updated.features[0]?.locations[0]?.end).toBe(26)
    expect(updated.primers[0]?.bindings).toBeUndefined()
  })
})

describe('primer binding geometry', () => {
  const sequence = 'AAAATGACCATGATTACGCCAAGAAA'
  const forwardPrimer: Primer = { id: 'p-f', name: 'Forward', sequence: 'ATGACCATGATTAC', color: '#2563eb' }
  const reversePrimer: Primer = { id: 'p-r', name: 'Reverse', sequence: 'GTAATCATGGTCAT', color: '#db2777' }

  it('places the 3-prime and 5-prime anneal points at opposite ends of the binding', () => {
    const bindings = findPrimerBindings(sequence, [forwardPrimer, reversePrimer])
    const forward = bindings.find((binding) => binding.primer.id === forwardPrimer.id && binding.strand === 'forward')
    const reverse = bindings.find((binding) => binding.primer.id === reversePrimer.id && binding.strand === 'reverse')

    expect(forward).toBeDefined()
    expect(reverse).toBeDefined()
    expect(primerAnneal3PrimePosition(forward!)).toBe(forward!.end - 1)
    expect(primerAnneal5PrimePosition(forward!)).toBe(forward!.start)
    expect(primerAnneal3PrimePosition(reverse!)).toBe(reverse!.start)
    expect(primerAnneal5PrimePosition(reverse!)).toBe(reverse!.end - 1)
  })

  it('anchors primer callout sites at the 5-prime anneal coordinate', () => {
    const [binding] = findPrimerBindings(sequence, [forwardPrimer])
    const site = primerBindingToCalloutSite(binding, 0)

    expect(site.cutTop).toBe(primerAnneal5PrimePosition(binding))
    expect(site.cutBottom).toBe(primerAnneal5PrimePosition(binding))
    expect(site.match).toBe('__primer_callout__0')
  })

  it('does not treat an empty oligo as matching every template position', () => {
    const empty = { id: 'empty', name: 'Empty', sequence: '', color: '#000' }
    expect(findPrimerBindings(sequence, [empty])).toEqual([])
  })
})

describe('restriction cut selection', () => {
  it('anchors XbaI at independent cut positions on each strand', () => {
    const sequence = 'AAATCTAGAAA'
    const [site] = findRestrictionSites(sequence, [{
      name: 'XbaI',
      notation: 'T/CTAGA',
      recognition: 'TCTAGA',
      cutTop: 1,
      cutBottom: 5,
      type: 'II',
      overhang: { type: "5'", sequence: 'CTAG', length: 4 },
      manufacturers: [],
      notes: [],
    }])
    expect(site.start).toBe(3)
    expect(sequence.slice(site.cutTop, site.end)).toBe('CTAGA')
    expect(restrictionCutAnchorStrandSelection(site)).toEqual({
      forward: { start: site.cutTop, end: site.cutTop + 1 },
      reverse: { start: site.cutBottom, end: site.cutBottom + 1 },
    })
  })

  it('selects independent template spans between two cut sites on linear DNA', () => {
    const left = {
      enzyme: {
        name: 'A',
        notation: 'G/AATTC',
        recognition: 'GAATTC',
        cutTop: 1,
        cutBottom: 5,
        type: 'II' as const,
        overhang: { type: "5'" as const, sequence: 'AATT', length: 4 },
        manufacturers: [],
        notes: [],
      },
      start: 10,
      end: 16,
      match: 'GAATTC',
      cutTop: 11,
      cutBottom: 15,
    }
    const right = {
      enzyme: {
        name: 'B',
        notation: 'G/GATCC',
        recognition: 'GGATCC',
        cutTop: 1,
        cutBottom: 5,
        type: 'II' as const,
        overhang: { type: "5'" as const, sequence: 'GATC', length: 4 },
        manufacturers: [],
        notes: [],
      },
      start: 40,
      end: 46,
      match: 'GGATCC',
      cutTop: 41,
      cutBottom: 45,
    }
    expect(restrictionFragmentStrandSelection(left, right, 'linear')).toEqual({
      forward: { start: 11, end: 41 },
      reverse: { start: 15, end: 45 },
    })
  })
})

describe('sequence topology', () => {
  const circularRecord: SequenceRecord = {
    id: 'seq-c',
    name: 'plasmid',
    description: '',
    molecule: 'dna',
    topology: 'circular',
    sequence: 'ATGCATGC',
    features: [
      {
        id: 'wrap',
        name: 'wrap',
        type: 'misc_feature',
        color: '#888',
        locations: [{ start: 6, end: 2, strand: 'forward' }],
      },
    ],
    primers: [],
    operations: [],
    construct: defaultConstructProperties,
    createdAt: '',
    updatedAt: '',
  }

  it('parses 1-based origin positions', () => {
    expect(parseOriginPositionInput('1', 8)).toBe(0)
    expect(parseOriginPositionInput('8', 8)).toBe(7)
    expect(parseOriginPositionInput('0', 8)).toBeNull()
    expect(parseOriginPositionInput('9', 8)).toBeNull()
    expect(parseOriginPositionInput('', 8)).toBeNull()
  })

  it('rotates circular sequence and wrap-around features', () => {
    const rotated = setCircularOrigin(circularRecord, 2)
    expect(rotated.sequence).toBe('GCATGCAT')
    expect(rotated.features[0]?.locations).toEqual([{ start: 4, end: 0, strand: 'forward' }])
  })

  it('preserves mixed case when rotating the circular origin', () => {
    const mixed = {
      ...circularRecord,
      sequence: 'atgcATGC',
    }
    expect(setCircularOrigin(mixed, 2).sequence).toBe('gcATGCat')
  })

  it('linearizes at origin and splits wrap-around features', () => {
    const linear = linearizeCircularAtOrigin({ ...circularRecord, dnaEndsProvenance: 'snapgene-block8' })
    expect(linear.topology).toBe('linear')
    expect(linear.dnaEndsProvenance).toBeUndefined()
    expect(linear.sequence).toBe('ATGCATGC')
    expect(linear.features[0]?.locations).toEqual([
      { start: 6, end: 8, strand: 'forward', originWrapSplit: true },
      { start: 0, end: 2, strand: 'forward', originWrapSplit: true },
    ])
  })

  it('does not invent mid-molecule joins after wrap-split linearization', () => {
    const linear = linearizeCircularAtOrigin(circularRecord)
    const locs = linear.features[0]?.locations ?? []
    expect(locs.every((location) => location.originWrapSplit === true)).toBe(true)
  })

  it('circularizes a linear record', () => {
    const linear = { ...circularRecord, topology: 'linear' as const, dnaEndsProvenance: 'snapgene-block8' as const }
    expect(circularizeLinearRecord(linear).topology).toBe('circular')
    expect(circularizeLinearRecord(linear).dnaEndsProvenance).toBeUndefined()
  })

  it('keeps a feature whole (single wrapping location) when the origin lands inside it', () => {
    const record: SequenceRecord = {
      ...circularRecord,
      sequence: 'ACGT'.repeat(250),
      features: [
        { id: 'gene', name: 'GeneA', type: 'CDS', color: '#123', locations: [{ start: 100, end: 200, strand: 'forward' }] },
      ],
    }
    const rotated = setCircularOrigin(record, 150)
    expect(rotated.features).toHaveLength(1)
    expect(rotated.features[0]?.locations).toHaveLength(1)
    const location = rotated.features[0]!.locations[0]!
    expect(location.start).toBe(950)
    expect(location.end).toBe(50)
    // Wrap-aware length is preserved (100 bp), not negative or the whole molecule.
    expect(featureLength(rotated.features[0]!, rotated.sequence.length)).toBe(100)
  })

  it('computes wrap-aware feature length for origin-spanning features', () => {
    const wrapFeature: SequenceFeature = {
      id: 'w', name: 'w', type: 'misc_feature', color: '#888',
      locations: [{ start: 6, end: 2, strand: 'forward' }],
    }
    expect(featureLength(wrapFeature, 8)).toBe(4)
    const linearFeature: SequenceFeature = {
      id: 'l', name: 'l', type: 'misc_feature', color: '#888',
      locations: [{ start: 1, end: 5, strand: 'forward' }],
    }
    expect(featureLength(linearFeature, 8)).toBe(4)
  })
})
