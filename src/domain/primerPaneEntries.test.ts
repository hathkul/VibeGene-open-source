import { themeFixturePalette } from '../test-support/themeFixturePalette'
import { describe, expect, it } from 'vitest'
import {
  buildPrimerPaneEntries,
  displayableRecordFeatures,
  sgRnaGuideScanMetrics,
  sortSgRnaPaneAnnotations,
  withSgRnaVisibility,
} from './primerPaneEntries'
import type { GuideScanEvidence } from './guidescan/evidence'
import { defaultPrimerHybridizationParams } from './primerHybridization'
import { createSgRNAFeatures, findSgRNATargets, groupSgRNAFeatures, SGRNA_PRESETS, type SgRNAAnnotation } from './sgrna'
import { defaultConstructProperties } from './constructProperties'
import { createId } from './sequence'
import { sgRnaOligoDescription } from './sgrnaOligoPrimers'
import type { Primer, SequenceFeature, SequenceRecord } from './types'

describe('withSgRnaVisibility', () => {
  const guideA = 'ACGTACGTACGTACGTACGA'
  const guideB = 'TTGACCGATCGATCGGATCC'
  const sequence = `TTT${guideA}AGGTTTTTT${guideB}TGGTTT`
  const sgRnaFeatures = (guide: string, name: string) => createSgRNAFeatures(
    findSgRNATargets(sequence, guide, 'linear', SGRNA_PRESETS[0]!)[0]!,
    { name, nuclease: 'SpCas9', pamMotif: 'NGG', pamSide: '3prime', spacer: guide },
  )
  const plain = { id: 'promoter', name: 'promoter', type: 'promoter', start: 0, end: 3, strand: 'forward', color: themeFixturePalette.black } as unknown as SequenceFeature
  const features = [plain, ...sgRnaFeatures(guideA, 'A'), ...sgRnaFeatures(guideB, 'B')]
  const hiddenIds = (list: SequenceFeature[]) => list.filter((feature) => feature.visible === false).map((feature) => feature.name)

  it('hides every guide with its PAM and leaves other features alone', () => {
    expect(hiddenIds(withSgRnaVisibility(features, false))).toEqual(['A', 'A PAM (AGG)', 'B', 'B PAM (TGG)'])
    const restored = withSgRnaVisibility(withSgRnaVisibility(features, false), true)
    expect(hiddenIds(restored)).toEqual([])
  })

  it('limits the change to the requested guides', () => {
    const guideId = groupSgRNAFeatures(features).find((annotation) => annotation.guide.name === 'B')!.guide.id
    expect(hiddenIds(withSgRnaVisibility(features, false, new Set([guideId])))).toEqual(['B', 'B PAM (TGG)'])
  })

  it('returns the same array when there are no sgRNAs', () => {
    const onlyPlain = [plain]
    expect(withSgRnaVisibility(onlyPlain, false)).toBe(onlyPlain)
  })
})

describe('displayableRecordFeatures', () => {
  const guide = 'ACGTACGTACGTACGTACGA'
  const sequence = `TTT${guide}AGGTTT`
  const [sgGuide, sgPam] = createSgRNAFeatures(
    findSgRNATargets(sequence, guide, 'linear', SGRNA_PRESETS[0]!)[0]!,
    { name: 'A', nuclease: 'SpCas9', pamMotif: 'NGG', pamSide: '3prime', spacer: guide },
  )
  const plain = { id: 'promoter', name: 'promoter', type: 'promoter', locations: [], color: themeFixturePalette.black } as unknown as SequenceFeature
  const primerBind = { ...plain, id: 'pb', name: 'pb', type: 'primer_bind' } as SequenceFeature
  const ruler = { ...plain, id: 'ruler', name: 'ruler', mapTrack: 'ruler' } as SequenceFeature
  const hidden = { ...plain, id: 'hidden', name: 'hidden', visible: false } as SequenceFeature
  const features = [plain, primerBind, ruler, hidden, sgGuide!, sgPam!]
  const names = (featuresVisible: boolean, sgRnasVisible: boolean, includeRulerTrack?: boolean) =>
    displayableRecordFeatures(features, { featuresVisible, sgRnasVisible, includeRulerTrack }).map((feature) => feature.name)

  it('lets the primers sgRNA toggle, not the features toggle, control guides and PAMs', () => {
    expect(names(true, true)).toEqual(['promoter', 'A', 'A PAM (AGG)'])
    expect(names(true, false)).toEqual(['promoter'])
    expect(names(false, true)).toEqual(['A', 'A PAM (AGG)'])
    expect(names(false, false)).toEqual([])
  })

  it('keeps ruler-track features only on request', () => {
    expect(names(true, false, true)).toEqual(['promoter', 'ruler'])
  })
})

const spacer = 'GACGTCGACTAGCTAGCATG'

function evidence(overrides: Partial<GuideScanEvidence> = {}): GuideScanEvidence {
  return {
    version: 1,
    source: 'design',
    capturedAt: '2026-09-27T00:00:00.000Z',
    organism: 'hg38',
    enzyme: 'cas9',
    querySequence: spacer,
    specificity: 0.8765,
    cuttingEfficiency: 0.61,
    offTargetCounts: { distance0: 1, distance1: 0, distance2: 0, distance3: 2, distance4: 17 },
    outcome: 'found',
    ...overrides,
  }
}

describe('sgRnaGuideScanMetrics', () => {
  it('formats GuideScan scores and off-target counts for designed guides', () => {
    expect(sgRnaGuideScanMetrics({ spacer, guideScanEvidence: evidence() })).toEqual({
      specificity: '0.88',
      cuttingEfficiency: '0.61',
      offTargets: '2 at 3, 17 at 4+',
      source: 'Designed by GuideScan2 · SpCas9 · hg38',
    })
  })

  it('leaves guides without found GuideScan evidence empty', () => {
    expect(sgRnaGuideScanMetrics({ spacer, guideScanEvidence: null })).toBeNull()
    expect(sgRnaGuideScanMetrics({ spacer, guideScanEvidence: evidence({ outcome: 'not_found' }) })).toBeNull()
  })

  it('ignores evidence captured for a different spacer', () => {
    expect(sgRnaGuideScanMetrics({ spacer: 'TTGACCGATCGATCGGATCC', guideScanEvidence: evidence() })).toBeNull()
  })

  it('shows dashes for scores GuideScan did not report', () => {
    const metrics = sgRnaGuideScanMetrics({
      spacer,
      guideScanEvidence: evidence({ specificity: null, cuttingEfficiency: undefined, offTargetCounts: undefined }),
    })
    expect(metrics).toMatchObject({ specificity: '—', cuttingEfficiency: '—', offTargets: '—' })
  })
})

function sgRnaAnnotation(
  name: string,
  options: {
    spacer?: string
    start?: number
    strand?: 'forward' | 'reverse'
    guideScanEvidence?: GuideScanEvidence | null
  } = {},
): SgRNAAnnotation {
  const guideSpacer = options.spacer ?? spacer
  const sequence = `TTT${guideSpacer}AGGTTT`
  const target = findSgRNATargets(sequence, guideSpacer, 'linear', SGRNA_PRESETS[0]!)[0]!
  const [guide, pam] = createSgRNAFeatures(target, {
    name,
    nuclease: 'SpCas9',
    pamMotif: 'NGG',
    pamSide: '3prime',
    spacer: guideSpacer,
    guideScanEvidence: options.guideScanEvidence,
  })
  if (options.start != null || options.strand) {
    guide!.locations = [{ ...guide!.locations[0]!, start: options.start ?? guide!.locations[0]!.start, strand: options.strand ?? 'forward' }]
  }
  return groupSgRNAFeatures([guide!, pam!])[0]!
}

function primerRecord(primers: Primer[], features: SequenceFeature[] = []): SequenceRecord {
  return {
    id: createId('record'),
    name: 'test',
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence: 'A'.repeat(120),
    construct: defaultConstructProperties,
    primers,
    features,
    operations: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function cloningOligo(name: string, sequence = 'ACGTACGTACGTACGT'): Primer {
  return {
    id: createId('oligo'),
    name,
    sequence,
    color: themeFixturePalette.black,
    description: sgRnaOligoDescription('sense'),
    bindings: [{
      strand: 'forward',
      templateStart: 1,
      templateEnd: sequence.length,
      components: [{ primerBases: sequence, templateStart: 1, templateEnd: sequence.length }],
    }],
  }
}

function regularPrimer(name: string, sequence = 'ACGTACGTACGTACGT'): Primer {
  return {
    id: createId('primer'),
    name,
    sequence,
    color: themeFixturePalette.black,
    bindings: [{
      strand: 'forward',
      templateStart: 1,
      templateEnd: sequence.length,
      components: [{ primerBases: sequence, templateStart: 1, templateEnd: sequence.length }],
    }],
  }
}

describe('sortSgRnaPaneAnnotations', () => {
  it('sorts names with numeric ordering', () => {
    const guides = [
      sgRnaAnnotation('sgRNA 10'),
      sgRnaAnnotation('sgRNA 2'),
      sgRnaAnnotation('sgRNA 1'),
    ]
    expect(sortSgRnaPaneAnnotations(guides, 'name', 'asc').map((entry) => entry.guide.name))
      .toEqual(['sgRNA 1', 'sgRNA 2', 'sgRNA 10'])
  })

  it('puts guides without GuideScan scores last when sorting by specificity', () => {
    const scored = sgRnaAnnotation('high', { guideScanEvidence: evidence({ specificity: 0.9 }) })
    const unscored = sgRnaAnnotation('none', { guideScanEvidence: null })
    expect(sortSgRnaPaneAnnotations([unscored, scored], 'specificity', 'asc').map((entry) => entry.guide.name))
      .toEqual(['high', 'none'])
    expect(sortSgRnaPaneAnnotations([unscored, scored], 'specificity', 'desc').map((entry) => entry.guide.name))
      .toEqual(['high', 'none'])
  })

  it('sorts off-target count tuples by mismatch level ascending', () => {
    const fewer = sgRnaAnnotation('fewer', {
      guideScanEvidence: evidence({ offTargetCounts: { distance0: 1, distance1: 0, distance2: 0, distance3: 0, distance4: 0 } }),
    })
    const more = sgRnaAnnotation('more', {
      guideScanEvidence: evidence({ offTargetCounts: { distance0: 1, distance1: 2, distance2: 0, distance3: 0, distance4: 0 } }),
    })
    expect(sortSgRnaPaneAnnotations([more, fewer], 'offtargets', 'asc').map((entry) => entry.guide.name))
      .toEqual(['fewer', 'more'])
  })

  it('sorts by spacer sequence and nuclease label', () => {
    const b = sgRnaAnnotation('b', { spacer: 'TTTTTTTTTTTTTTTTTTTT' })
    const a = sgRnaAnnotation('a', { spacer: 'AAAAAAAAAAAAAAAAAAAA' })
    expect(sortSgRnaPaneAnnotations([b, a], 'spacer', 'asc').map((entry) => entry.guide.name))
      .toEqual(['a', 'b'])
  })
})

describe('buildPrimerPaneEntries', () => {
  it('sorts primers by their descriptions', () => {
    const first = { ...regularPrimer('First'), description: 'Zebra' }
    const second = { ...regularPrimer('Second'), description: 'Alpha' }
    const entries = buildPrimerPaneEntries(primerRecord([first, second]), [], {
      hybridization: defaultPrimerHybridizationParams,
      primerSort: { mode: 'description', direction: 'asc' },
      oligoSort: { mode: 'name', direction: 'asc' },
      sgRnaSort: { mode: 'name', direction: 'asc' },
      warningsFor: () => '',
    })
    expect(entries.filter((entry) => entry.kind === 'primer').map((entry) => entry.row.primer.name)).toEqual(['Second', 'First'])
  })

  it('sorts regular primers and cloning oligos independently', () => {
    const record = primerRecord([
      regularPrimer('z primer'),
      regularPrimer('a primer'),
      cloningOligo('z oligo'),
      cloningOligo('a oligo'),
    ])
    const entries = buildPrimerPaneEntries(record, [], {
      hybridization: defaultPrimerHybridizationParams,
      primerSort: { mode: 'name', direction: 'desc' },
      oligoSort: { mode: 'name', direction: 'asc' },
      sgRnaSort: { mode: 'name', direction: 'asc' },
      warningsFor: () => '',
    })
    expect(entries.filter((entry) => entry.kind === 'primer').map((entry) => entry.row.primer.name))
      .toEqual(['z primer', 'a primer', 'a oligo', 'z oligo'])
  })
})
