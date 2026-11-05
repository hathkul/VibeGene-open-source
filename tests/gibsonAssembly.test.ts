import { describe, expect, it } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import { defaultDnaEnds } from '../src/domain/dnaEnds'
import {
  analyzeGibsonAssembly,
  assembleGibsonProduct,
  assessGibsonFragmentSize,
  defaultGibsonPartConfig,
  formatGibsonOverlapRecommendationHint,
  GIBSON_FRAGMENT_COLORS,
  gibsonPreviewRecord,
  gradeGibsonOverlap,
  listGibsonAssemblySelectedPrimers,
  recommendGibsonOverlap,
  resolveGibsonPart,
  suggestGibsonFragmentOrder,
} from '../src/domain/gibsonAssembly'
import { reverseComplement } from '../src/domain/sequence'
import type { SequenceRecord } from '../src/domain/types'

function makeRecord(name: string, sequence: string, overrides?: Partial<SequenceRecord>): SequenceRecord {
  return {
    id: `seq-${name}`,
    name,
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence,
    features: [],
    primers: [],
    operations: [],
    construct: defaultConstructProperties,
    dnaEnds: defaultDnaEnds(),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const OVERLAP = 'ATGCGTACGTACGTAC' // 16 bp

function directPart(role: 'vector' | 'fragment', record: SequenceRecord) {
  return {
    ...defaultGibsonPartConfig(role, record),
    linearizationMode: 'direct' as const,
  }
}

describe('gibsonAssembly', () => {
  it('gives Fragment 1 and Fragment 2 distinct colors in linear assembly', () => {
    // Matches GibsonAssemblyDialog: first slot fragmentIndex/colorIndex 0; next slot label 1, color 1.
    const first = resolveGibsonPart(
      directPart('fragment', makeRecord('A', `GGGAAA${OVERLAP}`)),
      0,
      0,
      0,
    )
    const second = resolveGibsonPart(
      directPart('fragment', makeRecord('B', `${OVERLAP}TTTCCC`)),
      0,
      1,
      1,
    )
    expect(first.label).toBe('Fragment 1')
    expect(second.label).toBe('Fragment 2')
    expect(first.color).toBe(GIBSON_FRAGMENT_COLORS[0])
    expect(second.color).toBe(GIBSON_FRAGMENT_COLORS[1])
    expect(first.color).not.toBe(second.color)
  })

  it('keeps vector color distinct from the first cloning insert', () => {
    const vector = resolveGibsonPart(directPart('vector', makeRecord('V', `GGGAAA${OVERLAP}`)), 0, 0, 0)
    const insert = resolveGibsonPart(
      directPart('fragment', makeRecord('I', `${OVERLAP}TTTCCC`)),
      0,
      0,
      1,
    )
    expect(vector.label).toBe('Vector')
    expect(insert.label).toBe('Fragment 1')
    expect(vector.color).toBe(GIBSON_FRAGMENT_COLORS[0])
    expect(insert.color).toBe(GIBSON_FRAGMENT_COLORS[1])
  })

  it('assembles two overlapping fragments into a linear product', () => {
    const fragA = `GGGAAA${OVERLAP}`
    const fragB = `${OVERLAP}TTTCCC`
    const vector = directPart('fragment', makeRecord('A', fragA))
    const fragment = directPart('fragment', makeRecord('B', fragB))
    const parts = [resolveGibsonPart(vector, 0), resolveGibsonPart(fragment, 1, 1)]
    const analysis = analyzeGibsonAssembly(parts, { mode: 'linear' })
    expect(analysis.ready).toBe(true)
    expect(analysis.closed).toBe(false)
    expect(analysis.junctions).toHaveLength(1)
    expect(analysis.junctions[0]?.overlapLength).toBe(OVERLAP.length)
    expect(analysis.fusedSequence).toBe(`GGGAAA${OVERLAP}TTTCCC`)

    const product = assembleGibsonProduct({
      parts,
      analysis,
      productName: 'TestGibson.dna',
    })
    expect(product.topology).toBe('linear')
    expect(product.sequence).toBe(`GGGAAA${OVERLAP}TTTCCC`)
    expect(product.history?.operation).toBe('gibsonAssembly')
    expect(product.operations[0]?.type).toBe('gibson')
    // Part-span ruler bands are preview-only and must not persist on the product.
    expect(product.features.filter((feature) => feature.mapTrack === 'ruler')).toHaveLength(0)
    const preview = gibsonPreviewRecord(analysis, 'Preview')
    expect(preview?.features.filter((feature) => feature.mapTrack === 'ruler')).toHaveLength(2)
  })

  it('rejects fragments without terminal overlap', () => {
    const parts = [
      resolveGibsonPart(directPart('fragment', makeRecord('A', 'ATGCATGCATGCATGC')), 0),
      resolveGibsonPart(directPart('fragment', makeRecord('B', 'GGGGCCCCAAAATTTT')), 1, 1),
    ]
    const analysis = analyzeGibsonAssembly(parts, { mode: 'linear' })
    expect(analysis.ready).toBe(false)
    expect(analysis.message).toMatch(/No terminal overlap/)
  })

  it('keeps linear assembly linear even when ends could circularize', () => {
    const close = 'CGTACGTACGTACGTA'
    const fragA = `${close}AAAA${OVERLAP}`
    const fragB = `${OVERLAP}TTTT${close}`
    const parts = [
      resolveGibsonPart(directPart('fragment', makeRecord('A', fragA)), 0),
      resolveGibsonPart(directPart('fragment', makeRecord('B', fragB)), 1, 1),
    ]
    const analysis = analyzeGibsonAssembly(parts, { mode: 'linear' })
    expect(analysis.ready).toBe(true)
    expect(analysis.closed).toBe(false)
    expect(analysis.fusedSequence).toBe(`${close}AAAA${OVERLAP}TTTT${close}`)
  })

  it('requires circular closure for cloning mode', () => {
    const fragA = `GGGAAA${OVERLAP}`
    const fragB = `${OVERLAP}TTTCCC`
    const parts = [
      resolveGibsonPart(directPart('vector', makeRecord('A', fragA)), 0),
      resolveGibsonPart(directPart('fragment', makeRecord('B', fragB)), 1, 0),
    ]
    const analysis = analyzeGibsonAssembly(parts, { mode: 'cloning' })
    expect(analysis.ready).toBe(false)
    expect(analysis.message).toMatch(/circular closure/)
    // Consecutive overlap is still reported for the schema.
    expect(analysis.junctions).toHaveLength(1)
    expect(analysis.junctions[0]?.leftOrderIndex).toBe(0)
    expect(analysis.junctions[0]?.rightOrderIndex).toBe(1)
  })

  it('keeps detected junctions while other parts are unconfigured', () => {
    const close = 'CGTACGTACGTACGTA'
    const fragA = `${close}AAAA${OVERLAP}`
    const fragB = `${OVERLAP}TTTT${close}`
    const readyVector = resolveGibsonPart(directPart('vector', makeRecord('A', fragA)), 0)
    const readyInsert = resolveGibsonPart(directPart('fragment', makeRecord('B', fragB)), 1, 0)
    const emptyInsert = resolveGibsonPart(defaultGibsonPartConfig('fragment', null), 2, 1)
    expect(emptyInsert.ready).toBe(false)

    const twoPart = analyzeGibsonAssembly([readyVector, readyInsert], { mode: 'cloning' })
    expect(twoPart.ready).toBe(true)
    expect(twoPart.junctions.length).toBe(2)

    const withEmpty = analyzeGibsonAssembly([readyVector, readyInsert, emptyInsert], {
      mode: 'cloning',
    })
    expect(withEmpty.ready).toBe(false)
    // Vector→Insert1 overlap remains visible even though Insert2 is blank.
    expect(
      withEmpty.junctions.some(
        (junction) => junction.leftOrderIndex === 0 && junction.rightOrderIndex === 1,
      ),
    ).toBe(true)
    expect(withEmpty.junctions[0]?.overlapLength).toBe(OVERLAP.length)
  })

  it('reports a circular-only overlap when the consecutive junction is missing', () => {
    const close = 'CGTACGTACGTACGTA'
    // Vector end does not match insert start; insert end matches vector start.
    const vector = resolveGibsonPart(directPart('vector', makeRecord('V', `${close}AAAA`)), 0)
    const insert = resolveGibsonPart(
      directPart('fragment', makeRecord('I', `GGGG${close}`)),
      1,
      0,
    )
    const analysis = analyzeGibsonAssembly([vector, insert], { mode: 'cloning' })
    expect(analysis.ready).toBe(false)
    expect(analysis.junctions).toHaveLength(1)
    expect(analysis.junctions[0]?.leftOrderIndex).toBe(1)
    expect(analysis.junctions[0]?.rightOrderIndex).toBe(0)
    expect(analysis.junctions[0]?.overlapLength).toBe(close.length)
  })

  it('closes a circular cloning product when first and last fragments overlap', () => {
    const close = 'CGTACGTACGTACGTA'
    const fragA = `${close}AAAA${OVERLAP}`
    const fragB = `${OVERLAP}TTTT${close}`
    const parts = [
      resolveGibsonPart(directPart('vector', makeRecord('A', fragA)), 0),
      resolveGibsonPart(directPart('fragment', makeRecord('B', fragB)), 1, 0),
    ]
    const analysis = analyzeGibsonAssembly(parts, { mode: 'cloning' })
    expect(analysis.ready).toBe(true)
    expect(analysis.closed).toBe(true)
    expect(analysis.junctions).toHaveLength(2)
    expect(analysis.fusedSequence).toBe(`${close}AAAA${OVERLAP}TTTT`)

    const product = assembleGibsonProduct({
      parts,
      analysis,
      productName: 'Circle',
    })
    expect(product.topology).toBe('circular')
    expect(product.sequence).toBe(analysis.fusedSequence)
    expect(product.features.filter((feature) => feature.mapTrack === 'ruler')).toHaveLength(0)
  })

  it('requires primers when linearizing by PCR', () => {
    const circular = makeRecord('V', `AAAA${OVERLAP}TTTT${OVERLAP}`, { topology: 'circular' })
    const config = defaultGibsonPartConfig('vector', circular)
    expect(config.linearizationMode).toBe('pcr')
    const resolved = resolveGibsonPart(config, 0)
    expect(resolved.ready).toBe(false)
    expect(resolved.message).toMatch(/two primers/i)
  })

  it('rejects direct use of a circular construct', () => {
    const circular = makeRecord('V', `AAAA${OVERLAP}TTTTCCCC`, { topology: 'circular' })
    const config = {
      ...defaultGibsonPartConfig('vector', circular),
      linearizationMode: 'direct' as const,
    }
    const resolved = resolveGibsonPart(config, 0)
    expect(resolved.ready).toBe(false)
    expect(resolved.message).toMatch(/circular/i)
  })

  it('linearizes by PCR when primers bind the template', () => {
    const annealFwd = 'GCTAGCTAGCTAGCTA'
    const annealRev = 'ATCGATCGATCGATCG'
    const middle = 'CCCCCCCCCCCCCCCCCCCC'
    const templateSeq = `${annealFwd}${middle}${reverseComplement(annealRev)}`
    const template = makeRecord('Template', templateSeq, { topology: 'circular' })
    const overhang = 'GGGGAAAATTTTCCCC'
    const config = {
      ...defaultGibsonPartConfig('vector', template),
      linearizationMode: 'pcr' as const,
      forwardPrimer: {
        name: 'Primer 1',
        sequence: overhang + annealFwd,
        phosphorylated: false,
        sourcePrimerId: null,
      },
      reversePrimer: {
        name: 'Primer 2',
        sequence: annealRev,
        phosphorylated: false,
        sourcePrimerId: null,
      },
    }
    const resolved = resolveGibsonPart(config, 0)
    expect(resolved.ready).toBe(true)
    expect(resolved.amplicons.length).toBeGreaterThan(0)
    expect(resolved.sequence.startsWith(overhang)).toBe(true)
    expect(resolved.sequence.includes(middle)).toBe(true)
  })

  it('suggests fragment order that chains terminal overlaps after the vector', () => {
    const joinBc = 'CGTACGTACGTACGTA'
    const vector = resolveGibsonPart(
      directPart('vector', makeRecord('V', `GGGG${OVERLAP}`)),
      0,
    )
    const fragments = [
      resolveGibsonPart(directPart('fragment', makeRecord('3', `${joinBc}TTTT`)), 1, 0),
      resolveGibsonPart(
        directPart('fragment', makeRecord('2', `${OVERLAP}AAAA${joinBc}`)),
        2,
        1,
      ),
    ]
    const suggestion = suggestGibsonFragmentOrder(vector, fragments)
    expect(suggestion).not.toBeNull()
    const ordered = [
      vector,
      ...suggestion!.fragmentOrder.map((index, orderPos) => {
        const part = fragments[index]!
        const orientation = suggestion!.orientations[orderPos] ?? 'forward'
        return orientation === part.orientation
          ? part
          : {
              ...part,
              orientation,
              sequence:
                orientation === 'forward'
                  ? part.sequence
                  : reverseComplement(part.sequence),
            }
      }),
    ]
    const analysis = analyzeGibsonAssembly(ordered, { mode: 'linear' })
    expect(analysis.ready).toBe(true)
    expect(analysis.junctions.length).toBeGreaterThanOrEqual(2)
  })

  it('respects reverse orientation when detecting overlaps', () => {
    const fragA = `GGGAAA${OVERLAP}`
    const fragB = `${OVERLAP}TTTCCC`
    const parts = [
      resolveGibsonPart(directPart('fragment', makeRecord('A', fragA)), 0),
      resolveGibsonPart(
        {
          ...directPart('fragment', makeRecord('B', reverseComplement(fragB))),
          orientation: 'reverse',
        },
        1,
        1,
      ),
    ]
    const analysis = analyzeGibsonAssembly(parts, { mode: 'linear' })
    expect(analysis.ready).toBe(true)
    expect(analysis.fusedSequence).toBe(`GGGAAA${OVERLAP}TTTCCC`)
  })

  it('recommends method-specific overlap bands', () => {
    const hifi = recommendGibsonOverlap({
      fragmentCount: 2,
      maxFragmentBp: 1000,
      productBp: 2000,
      method: 'nebuilder-hifi',
    })
    expect(hifi.method).toBe('nebuilder-hifi')
    expect(hifi.optimalMinBp).toBe(15)
    expect(hifi.optimalMaxBp).toBe(20)
    expect(hifi.minOverlapTmC).toBe(48)

    const hifiMulti = recommendGibsonOverlap({
      fragmentCount: 5,
      maxFragmentBp: 2000,
      productBp: 8000,
      method: 'nebuilder-hifi',
    })
    expect(hifiMulti.optimalMinBp).toBe(20)
    expect(hifiMulti.optimalMaxBp).toBe(30)

    const classic = recommendGibsonOverlap({
      fragmentCount: 2,
      maxFragmentBp: 1000,
      productBp: 2000,
      method: 'classic-gibson',
    })
    expect(classic.optimalMinBp).toBe(20)
    expect(classic.optimalMaxBp).toBe(40)
    expect(classic.minBp).toBe(15)

    const classicMulti = recommendGibsonOverlap({
      fragmentCount: 5,
      maxFragmentBp: 2000,
      productBp: 8000,
      method: 'classic-gibson',
    })
    expect(classicMulti.optimalMinBp).toBe(25)
    expect(classicMulti.optimalMaxBp).toBe(40)

    const infusion = recommendGibsonOverlap({
      fragmentCount: 2,
      maxFragmentBp: 1000,
      productBp: 2000,
      method: 'infusion',
    })
    expect(infusion.optimalMinBp).toBe(15)
    expect(infusion.optimalMaxBp).toBe(15)
    expect(infusion.acceptableMaxBp).toBe(21)
    expect(infusion.minOverlapTmC).toBeNull()

    const infusionMulti = recommendGibsonOverlap({
      fragmentCount: 4,
      maxFragmentBp: 1000,
      productBp: 4000,
      method: 'infusion',
    })
    expect(infusionMulti.optimalMinBp).toBe(20)
    expect(infusionMulti.optimalMaxBp).toBe(20)
  })

  it('grades short overlaps as suboptimal for multi-fragment NEBuilder designs', () => {
    const recommendation = recommendGibsonOverlap({
      fragmentCount: 5,
      maxFragmentBp: 2000,
      productBp: 7000,
      method: 'nebuilder-hifi',
    })
    const short = gradeGibsonOverlap(16, 55, recommendation)
    expect(short.level).toBe('suboptimal')
    const preferred = gradeGibsonOverlap(25, 55, recommendation)
    expect(preferred.level).toBe('optimal')
  })

  it('grades In-Fusion overlaps without a Tm floor and flags >21 bp', () => {
    const recommendation = recommendGibsonOverlap({
      fragmentCount: 2,
      maxFragmentBp: 1000,
      productBp: 2000,
      method: 'infusion',
    })
    expect(gradeGibsonOverlap(15, 40, recommendation).level).toBe('optimal')
    expect(gradeGibsonOverlap(18, 40, recommendation).level).toBe('good')
    expect(gradeGibsonOverlap(25, 40, recommendation).level).toBe('suboptimal')
  })

  it('formats short schema recommendation hints for junctions', () => {
    const hifi = recommendGibsonOverlap({
      fragmentCount: 2,
      maxFragmentBp: 1000,
      productBp: 2000,
      method: 'nebuilder-hifi',
    })
    expect(formatGibsonOverlapRecommendationHint(12, hifi, 55)).toBe(
      'at least 15 bp is recommended',
    )
    expect(formatGibsonOverlapRecommendationHint(18, hifi, 55)).toBe('15–20 bp preferred')
    expect(formatGibsonOverlapRecommendationHint(18, hifi, 40)).toBe(
      'Tm ≥ 48 °C is recommended',
    )
    expect(formatGibsonOverlapRecommendationHint(28, hifi, 55)).toBe('15–20 bp is preferred')

    const infusion = recommendGibsonOverlap({
      fragmentCount: 2,
      maxFragmentBp: 1000,
      productBp: 2000,
      method: 'infusion',
    })
    expect(formatGibsonOverlapRecommendationHint(25, infusion, null)).toBe(
      '21 bp or less is recommended',
    )
  })

  it('attaches junction and design grades in analysis', () => {
    const overlap20 = 'ATGCGTACGTACGTACGTAC' // 20 bp
    const fragA = `GGGAAA${overlap20}`
    const fragB = `${overlap20}TTTCCC`
    const parts = [
      resolveGibsonPart(directPart('fragment', makeRecord('A', fragA)), 0),
      resolveGibsonPart(directPart('fragment', makeRecord('B', fragB)), 1, 1),
    ]
    const analysis = analyzeGibsonAssembly(parts, { mode: 'linear', method: 'nebuilder-hifi' })
    expect(analysis.ready).toBe(true)
    expect(analysis.method).toBe('nebuilder-hifi')
    expect(analysis.junctions[0]?.grade.level).toBe('optimal')
    expect(analysis.designGrade?.level).toBe('optimal')
    expect(analysis.message).toMatch(/Design: Optimal/)
    expect(analysis.recommendation?.optimalMinBp).toBe(15)
  })

  it('marks a 16 bp junction suboptimal under Classic Gibson', () => {
    const overlap16 = 'ATGCGTACGTACGTAC' // 16 bp
    const parts = [
      resolveGibsonPart(directPart('fragment', makeRecord('A', `GGGAAA${overlap16}`)), 0),
      resolveGibsonPart(directPart('fragment', makeRecord('B', `${overlap16}TTTCCC`)), 1, 1),
    ]
    const analysis = analyzeGibsonAssembly(parts, { mode: 'linear', method: 'classic-gibson' })
    expect(analysis.ready).toBe(true)
    expect(analysis.junctions[0]?.grade.level).toBe('suboptimal')
    expect(analysis.designGrade?.level).toBe('suboptimal')
  })

  it('restores vector parental origin on circular products and shows inherited features in preview', () => {
    const close = 'CGTACGTACGTACGTA' // 16 bp
    const marker = 'GGGGGGGGGG'
    // Parental 0 sits at the marker (after the circularization overlap + spacer).
    const vectorSeq = `${close}AAAA${marker}TTTT${OVERLAP}`
    const insertSeq = `${OVERLAP}CCCC${close}`
    const originOffset = close.length + 4 // start of marker
    const vectorSource = makeRecord('VectorParent', vectorSeq, {
      topology: 'circular',
      features: [
        {
          id: 'ori',
          name: 'OriMarker',
          type: 'misc_feature',
          color: '#111',
          locations: [{ start: 0, end: 10, strand: 'forward' }],
        },
      ],
    })
    const vectorPart = {
      ...resolveGibsonPart(directPart('vector', makeRecord('V', vectorSeq)), 0),
      role: 'vector' as const,
      label: 'Vector',
      sequence: vectorSeq,
      features: [
        {
          id: 'ori-on-part',
          name: 'OriMarker',
          type: 'misc_feature',
          color: '#111',
          locations: [{ start: originOffset, end: originOffset + marker.length, strand: 'forward' as const }],
        },
      ],
      originOffsetInPart: originOffset,
      source: vectorSource,
      ready: true,
    }
    const insertPart = resolveGibsonPart(directPart('fragment', makeRecord('Ins', insertSeq)), 1, 0)
    const parts = [vectorPart, insertPart]
    const analysis = analyzeGibsonAssembly(parts, { mode: 'cloning' })
    expect(analysis.ready).toBe(true)
    expect(analysis.closed).toBe(true)
    // Pre-rotation fusion still begins at the cut/end frame.
    expect(analysis.fusedSequence.startsWith(close)).toBe(true)

    const product = assembleGibsonProduct({
      parts,
      analysis,
      productName: 'OriginRestored',
    })
    expect(product.topology).toBe('circular')
    expect(product.sequence.startsWith(marker)).toBe(true)
    expect(product.features.some((feature) => feature.name === 'OriMarker' && feature.mapTrack !== 'ruler')).toBe(
      true,
    )
    // After rotation, OriMarker should sit at product origin.
    const ori = product.features.find((feature) => feature.name === 'OriMarker' && feature.mapTrack !== 'ruler')
    expect(ori?.locations[0]?.start).toBe(0)

    const preview = gibsonPreviewRecord(analysis, 'Preview')
    expect(preview).not.toBeNull()
    expect(preview!.sequence).toBe(product.sequence)
    expect(preview!.features.some((feature) => feature.name === 'OriMarker' && feature.mapTrack !== 'ruler')).toBe(
      true,
    )
    expect(preview!.features.some((feature) => feature.mapTrack === 'ruler')).toBe(true)
  })

  it('merges the same feature when cloned next to or inside itself across a junction', () => {
    const gene = 'ATGCGTACGTACGTAC' // 16 bp overlap
    const left = `AAAA${gene}`
    const right = `${gene}CCCCTTTT`
    const leftPart = {
      ...resolveGibsonPart(directPart('fragment', makeRecord('L', left)), 0),
      sequence: left,
      features: [
        {
          id: 'gene-left',
          name: 'CDS1',
          type: 'CDS',
          color: '#c00',
          locations: [{ start: 4, end: left.length, strand: 'forward' as const }],
        },
      ],
      ready: true,
    }
    const rightPart = {
      ...resolveGibsonPart(directPart('fragment', makeRecord('R', right)), 1, 1),
      sequence: right,
      features: [
        {
          id: 'gene-right',
          name: 'CDS1',
          type: 'CDS',
          color: '#c00',
          // Covers overlap plus the following CCCC so it survives skipStart trimming.
          locations: [{ start: 0, end: gene.length + 4, strand: 'forward' as const }],
        },
      ],
      ready: true,
    }
    const analysis = analyzeGibsonAssembly([leftPart, rightPart], { mode: 'linear' })
    expect(analysis.ready).toBe(true)
    const product = assembleGibsonProduct({
      parts: [leftPart, rightPart],
      analysis,
      productName: 'MergedGene',
    })
    const genes = product.features.filter((entry) => entry.name === 'CDS1' && entry.mapTrack !== 'ruler')
    expect(genes).toHaveLength(1)
    expect(genes[0]?.locations).toHaveLength(1)
    expect(genes[0]?.locations[0]).toMatchObject({ start: 4, end: 4 + gene.length + 4 })
  })

  it('assesses method-specific fragment min and max sizes', () => {
    expect(assessGibsonFragmentSize(80, 'Insert', 'nebuilder-hifi')?.level).toBe('short')
    expect(assessGibsonFragmentSize(80, 'Insert', 'nebuilder-hifi')?.blocking).toBe(true)
    expect(assessGibsonFragmentSize(80, 'Insert', 'infusion')).toBeNull()
    expect(assessGibsonFragmentSize(40, 'Insert', 'infusion')?.level).toBe('short')
    expect(assessGibsonFragmentSize(90, 'Insert', 'classic-gibson')?.level).toBe('short')
    expect(assessGibsonFragmentSize(100, 'Insert', 'classic-gibson')).toBeNull()

    expect(assessGibsonFragmentSize(12_001, 'Insert', 'nebuilder-hifi')?.level).toBe('large')
    expect(assessGibsonFragmentSize(12_001, 'Insert', 'nebuilder-hifi')?.blocking).toBe(false)
    expect(assessGibsonFragmentSize(21_000, 'Insert', 'nebuilder-hifi')?.level).toBe('very-large')
    expect(assessGibsonFragmentSize(9_000, 'Insert', 'classic-gibson')?.level).toBe('large')
  })

  it('blocks Ready for short PCR fragments under NEBuilder min size', () => {
    const overlap20 = 'ATGCGTACGTACGTACGTAC'
    const left = {
      ...resolveGibsonPart(
        directPart('fragment', makeRecord('A', `${'G'.repeat(200)}${overlap20}`)),
        0,
      ),
      sequence: `${'G'.repeat(200)}${overlap20}`,
      ready: true,
    }
    const right = {
      ...resolveGibsonPart(
        directPart('fragment', makeRecord('B', `${overlap20}${'C'.repeat(40)}`)),
        1,
        1,
      ),
      linearizationMode: 'pcr' as const,
      sequence: `${overlap20}${'C'.repeat(40)}`,
      ready: true,
      message: 'Ready',
    }
    const analysis = analyzeGibsonAssembly([left, right], {
      mode: 'linear',
      method: 'nebuilder-hifi',
    })
    expect(analysis.ready).toBe(false)
    expect(analysis.message).toMatch(/recommended minimum of 120/)
    expect(analysis.issues.some((issue) => issue.message.includes('120'))).toBe(true)
  })

  it('soft-warns large fragments while staying Ready', () => {
    const overlap20 = 'ATGCGTACGTACGTACGTAC'
    const bulky = 'A'.repeat(10_500)
    const left = resolveGibsonPart(
      directPart('fragment', makeRecord('A', `${bulky}${overlap20}`)),
      0,
    )
    const right = resolveGibsonPart(
      directPart('fragment', makeRecord('B', `${overlap20}${bulky}`)),
      1,
      1,
    )
    const analysis = analyzeGibsonAssembly([left, right], {
      mode: 'linear',
      method: 'nebuilder-hifi',
    })
    expect(analysis.ready).toBe(true)
    expect(analysis.issues.some((issue) => /comfort range/.test(issue.message))).toBe(true)
    expect(analysis.message).toMatch(/Size note:/)
  })

  it('lists only PCR-part primers for assembly export', () => {
    const pcr = {
      ...defaultGibsonPartConfig('fragment', makeRecord('I', 'ATGC')),
      linearizationMode: 'pcr' as const,
      forwardPrimer: { sourcePrimerId: 'f1', name: 'I_HiFi_F', sequence: 'ATGCGT', phosphorylated: false },
      reversePrimer: { sourcePrimerId: 'r1', name: 'I_HiFi_R', sequence: 'TACGCA', phosphorylated: false },
    }
    const direct = {
      ...defaultGibsonPartConfig('vector', makeRecord('V', 'GGGG')),
      linearizationMode: 'direct' as const,
      forwardPrimer: { sourcePrimerId: null, name: 'V_F', sequence: 'AAAA', phosphorylated: false },
      reversePrimer: { sourcePrimerId: null, name: 'V_R', sequence: 'TTTT', phosphorylated: false },
    }
    const listed = listGibsonAssemblySelectedPrimers([direct, pcr])
    expect(listed.map((primer) => primer.name)).toEqual(['I_HiFi_F', 'I_HiFi_R'])
    expect(listed.map((primer) => primer.sequence)).toEqual(['ATGCGT', 'TACGCA'])
  })

  it('labels insert cards from exact amplify-range features and exposes stretch length', () => {
    const core = 'A'.repeat(150)
    const record = makeRecord('Template', `GGGG${core}CCCC`, {
      features: [
        {
          id: 'feat-cds',
          name: 'Reporter',
          type: 'CDS',
          color: '#c00',
          locations: [{ start: 4, end: 4 + core.length, strand: 'forward' }],
        },
      ],
    })
    const withFeature = {
      ...defaultGibsonPartConfig('fragment', record),
      linearizationMode: 'pcr' as const,
      amplifyRange: { start: 4, end: 4 + core.length },
    }
    const resolved = resolveGibsonPart(withFeature, 0, 0, 1)
    expect(resolved.label).toBe('Reporter')
    expect(resolved.selectedStretchBp).toBe(core.length)
    expect(resolved.ready).toBe(false)
    expect(resolved.message).toMatch(/Linearization not configured/)

    const dragOnly = {
      ...defaultGibsonPartConfig('fragment', record),
      linearizationMode: 'pcr' as const,
      amplifyRange: { start: 10, end: 90 },
    }
    expect(resolveGibsonPart(dragOnly, 0, 0, 1).label).toBe('Fragment 1')
  })
})
