import { describe, expect, it } from 'vitest'
import { defaultDnaEnds } from '../../domain/dnaEnds'
import { enzymes } from '../../domain/enzymes'
import { cloneFixture, labPlasmid } from '../../domain/fixtures'
import { defaultPrimerHybridizationParams } from '../../domain/primerHybridization'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { Primer, RestrictionSite, SequenceFeature, SequenceRecord } from '../../domain/types'
import {
  buildLibraryMapBrowseKeys,
  clampMapViewSelectedRange,
  libraryMapBrowseIndex,
  libraryMapConsensusVisible,
  resolveLibraryMapBrowseMemberId,
  resolveMapViewAnnotationFeatures,
  resolveMapViewPrimerBindings,
  resolveMapViewRecord,
  resolveMapViewRestrictionSites,
  selectLibraryMapMembers,
} from './libraryMapView'

const fixtureFeatureColor = labPlasmid.features.find((feature) => feature.type === 'misc_feature')!.color
const fixtureCdsColor = labPlasmid.features.find((feature) => feature.type === 'CDS')!.color
const fixturePrimerColors = cloneFixture().primers.map((primer) => primer.color)

function libraryRecord(overrides: Partial<SequenceRecord> = {}): SequenceRecord {
  return {
    id: 'lib-1',
    name: 'Library',
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence: 'AAAAAAAAAA',
    features: [],
    primers: [],
    history: [],
    operations: [],
    dna: { documentRole: 'library', libraryConsensusEnabled: true },
    construct: undefined,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
    ...overrides,
  } as SequenceRecord
}

function traceMember(
  id: string,
  sequence: string,
  overrides: Partial<TraceFileRecord> = {},
): TraceFileRecord {
  return {
    id,
    fileName: `${id}.ab1`,
    sequence,
    chromatogram: {
      aTrace: [],
      tTrace: [],
      gTrace: [],
      cTrace: [],
      basePos: [],
      baseCalls: [],
    },
    enabled: true,
    expanded: false,
    showAnnotations: true,
    alignment: null,
    ...overrides,
  }
}

const defaultEnzymeDisplay = {
  visible: true,
  set: 'all' as const,
  selectedNames: [] as string[],
}

function precomputedConsensusRestrictionSites(): RestrictionSite[] {
  return [{
    enzyme: {
      name: '__PRECOMPUTED_CONSENSUS_ONLY__',
      notation: '__PRECOMPUTED_CONSENSUS_ONLY__',
      recognition: 'N',
      cutTop: 0,
      cutBottom: 0,
      type: 'II',
      overhang: { type: 'blunt', sequence: null, length: 0 },
      manufacturers: [],
      notes: [],
    },
    start: 99,
    end: 100,
    match: 'consensus-marker',
    cutTop: 99,
    cutBottom: 100,
  }]
}

function precomputedMapAnnotationFeatures(): SequenceFeature[] {
  return [{
    id: '__precomputed-map-annotation__',
    name: 'Consensus map layer',
    type: 'misc_feature',
    color: fixtureFeatureColor,
    locations: [{ start: 0, end: 1, strand: 'forward' }],
  }]
}

describe('library map view projection', () => {
  it('returns precomputed consensus restriction sites and annotations by reference', () => {
    const record = libraryRecord({ sequence: 'ACGTACGTACGT' })
    const member = traceMember('m1', 'GAATTCACGTACGT')
    const mapViewRecord = resolveMapViewRecord(record, member)
    const displayedRestrictionSites = precomputedConsensusRestrictionSites()
    const mapAnnotationFeatures = precomputedMapAnnotationFeatures()
    const restrictionInput = {
      activeEnzymePool: enzymes.slice(0, 8),
      construct: record.construct,
      displayedRestrictionSites,
      enzymeDisplay: defaultEnzymeDisplay,
      mapViewRecord: record,
      restrictionEnzymesEnabled: true,
    }

    expect(
      resolveMapViewRestrictionSites({ ...restrictionInput, browseMember: null }),
    ).toBe(displayedRestrictionSites)

    const memberRestrictionSites = resolveMapViewRestrictionSites({
      ...restrictionInput,
      browseMember: member,
      mapViewRecord,
    })
    expect(memberRestrictionSites).not.toBe(displayedRestrictionSites)
    expect(memberRestrictionSites.some((site) => site.enzyme.name === '__PRECOMPUTED_CONSENSUS_ONLY__')).toBe(false)

    expect(
      resolveMapViewAnnotationFeatures({
        browseMember: null,
        featureDisplay: { featuresVisible: true, orfsVisible: true, sgRnasVisible: false },
        mapAnnotationFeatures,
        memberOrfFeatures: [{ id: 'injected-orf' } as SequenceFeature],
        orfPredictionEnabled: true,
      }),
    ).toBe(mapAnnotationFeatures)
  })

  it('recomputes member restriction sites and appends regenerated sticky-end markers', () => {
    const record = libraryRecord({ sequence: 'AAAAAAAAAA', topology: 'linear' })
    const member = traceMember('m1', 'TTTTTTTTTT')
    const mapViewRecord = {
      ...resolveMapViewRecord(record, member),
      dnaEnds: {
        upstream: { modification: 'fivePrimePhosphorylated' as const, stickiness: 4, enzymeName: 'MfeI' },
        downstream: { modification: 'fivePrimePhosphorylated' as const, stickiness: 3, enzymeName: 'BbvCI' },
      },
    }
    const precomputed = precomputedConsensusRestrictionSites()
    const sites = resolveMapViewRestrictionSites({
      activeEnzymePool: [],
      browseMember: member,
      construct: record.construct,
      displayedRestrictionSites: precomputed,
      enzymeDisplay: defaultEnzymeDisplay,
      mapViewRecord,
      restrictionEnzymesEnabled: true,
    })
    expect(sites).not.toBe(precomputed)
    expect(sites.map((site) => site.enzyme.name)).toEqual(['<MfeI>', '<BbvCI>'])
    expect(sites[0]).toMatchObject({ start: 0, end: 4 })
    expect(sites[1]).toMatchObject({ start: 7, end: 10 })

    const withMfeIHidden = resolveMapViewRestrictionSites({
      activeEnzymePool: [],
      browseMember: member,
      construct: record.construct,
      displayedRestrictionSites: precomputed,
      enzymeDisplay: { ...defaultEnzymeDisplay, hiddenNames: ['<MfeI>'] },
      mapViewRecord,
      restrictionEnzymesEnabled: true,
    })
    expect(withMfeIHidden.map((site) => site.enzyme.name)).toEqual(['<BbvCI>'])
  })

  it('honors disabled restriction and ORF gates on member browse', () => {
    const record = libraryRecord()
    const member = traceMember('m1', 'ACGT', {
      features: [{
        id: 'member-feat',
        name: 'Member CDS',
        type: 'CDS',
        color: fixtureCdsColor,
        locations: [{ start: 0, end: 2, strand: 'forward' }],
      }],
    })
    const mapViewRecord = resolveMapViewRecord(record, member)
    const precomputed = precomputedConsensusRestrictionSites()
    const restrictionBase = {
      activeEnzymePool: enzymes.slice(0, 4),
      browseMember: member,
      construct: record.construct,
      displayedRestrictionSites: precomputed,
      enzymeDisplay: defaultEnzymeDisplay,
      mapViewRecord,
    }
    expect(resolveMapViewRestrictionSites({
      ...restrictionBase,
      restrictionEnzymesEnabled: false,
    })).toEqual([])
    expect(resolveMapViewRestrictionSites({
      ...restrictionBase,
      enzymeDisplay: { ...defaultEnzymeDisplay, visible: false },
      restrictionEnzymesEnabled: true,
    })).toEqual([])

    const orfFeature: SequenceFeature = {
      id: 'orf:injected',
      name: 'ORF',
      type: 'CDS',
      color: fixtureCdsColor,
      locations: [{ start: 0, end: 3, strand: 'forward' }],
    }
    const featureBase = {
      browseMember: member,
      featureDisplay: { featuresVisible: true, orfsVisible: true, sgRnasVisible: false },
      mapAnnotationFeatures: precomputedMapAnnotationFeatures(),
      memberOrfFeatures: [orfFeature],
      orfPredictionEnabled: true,
    }
    expect(
      resolveMapViewAnnotationFeatures({
        ...featureBase,
        featureDisplay: { ...featureBase.featureDisplay, orfsVisible: false },
      }).some((feature) => feature.id === 'orf:injected'),
    ).toBe(false)
    expect(
      resolveMapViewAnnotationFeatures({
        ...featureBase,
        orfPredictionEnabled: false,
      }).some((feature) => feature.id === 'orf:injected'),
    ).toBe(false)
    expect(
      resolveMapViewAnnotationFeatures(featureBase).some((feature) => feature.id === 'member-feat'),
    ).toBe(true)
  })

  it('falls back to cut-strand forward range when selected range is absent', () => {
    expect(
      clampMapViewSelectedRange({
        selectedRange: null,
        cutStrandForward: { start: 1, end: 5 },
        mapViewSequenceLength: 8,
      }),
    ).toEqual({ start: 1, end: 5 })
    expect(
      clampMapViewSelectedRange({
        selectedRange: { start: 2, end: 4 },
        cutStrandForward: { start: 0, end: 6 },
        mapViewSequenceLength: 8,
      }),
    ).toEqual({ start: 2, end: 4 })
  })

  it('selects enabled members and resolves browse id for consensus on/off', () => {
    const record = libraryRecord()
    const members = selectLibraryMapMembers({
      alignmentsVisible: false,
      record,
      traceFiles: [
        traceMember('m1', 'ACGT'),
        traceMember('m2', 'TTTT', { enabled: false }),
        traceMember('m3', ''),
      ],
    })
    expect(members.map((member) => member.id)).toEqual(['m1'])

    expect(
      resolveLibraryMapBrowseMemberId({
        browseActive: true,
        consensusVisible: true,
        members,
        selectedAlignmentTraceId: 'missing',
      }),
    ).toBeNull()

    expect(
      resolveLibraryMapBrowseMemberId({
        browseActive: true,
        consensusVisible: false,
        members,
        selectedAlignmentTraceId: null,
      }),
    ).toBe('m1')

    expect(
      resolveLibraryMapBrowseMemberId({
        browseActive: true,
        consensusVisible: true,
        members,
        selectedAlignmentTraceId: 'm1',
      }),
    ).toBe('m1')
  })

  it('builds browse keys with a leading null consensus entry when visible', () => {
    const members = [traceMember('a', 'AC'), traceMember('b', 'GT')]
    expect(buildLibraryMapBrowseKeys(true, members)).toEqual([null, 'a', 'b'])
    expect(buildLibraryMapBrowseKeys(false, members)).toEqual(['a', 'b'])
    expect(libraryMapBrowseIndex([null, 'a', 'b'], null)).toBe(0)
    expect(libraryMapBrowseIndex([null, 'a', 'b'], 'missing')).toBe(0)
  })

  it('uses consensus map record until a member is selected', () => {
    const record = libraryRecord({ sequence: 'AAAAAAAAAA' })
    const member = traceMember('m1', 'TTTT', {
      primers: [{ id: 'p1', name: 'member primer', sequence: 'TTTT', color: fixturePrimerColors[0]!, bindings: [] } as Primer],
    })
    expect(resolveMapViewRecord(record, null)).toBe(record)
    const memberRecord = resolveMapViewRecord(record, member)
    expect(memberRecord.sequence).toBe('TTTT')
    expect(memberRecord.primers?.[0]?.name).toBe('member primer')
  })

  it('derives member restriction sites and primer bindings separately from main', () => {
    const ecoRi = enzymes.find((enzyme) => enzyme.name === 'EcoRI')
    expect(ecoRi).toBeDefined()
    const mainPrimer: Primer = {
      id: 'main',
      name: 'main',
      sequence: 'ACGTACGT',
      color: fixturePrimerColors[0]!,
      bindings: [{
        strand: 'forward',
        templateStart: 0,
        templateEnd: 8,
        components: [{ primerBases: 'ACGTACGT', templateStart: 0, templateEnd: 8 }],
      }],
    }
    const memberPrimer: Primer = {
      id: 'mem',
      name: 'mem',
      sequence: 'GAATTCAC',
      color: fixturePrimerColors[1]!,
      bindings: [{
        strand: 'forward',
        templateStart: 0,
        templateEnd: 8,
        components: [{ primerBases: 'GAATTCAC', templateStart: 0, templateEnd: 8 }],
      }],
    }
    const record = libraryRecord({
      sequence: 'ACGTACGTACGT',
      dnaEnds: defaultDnaEnds(),
      primers: [mainPrimer],
    })
    const member = traceMember('m1', 'GAATTCACGTACGT', { primers: [memberPrimer] })
    const mapViewRecord = resolveMapViewRecord(record, member)
    const mainSites = [{ enzyme: ecoRi!, start: 0, end: 6 } as never]
    const memberSites = resolveMapViewRestrictionSites({
      activeEnzymePool: [ecoRi!],
      browseMember: member,
      construct: record.construct,
      displayedRestrictionSites: mainSites,
      enzymeDisplay: defaultEnzymeDisplay,
      mapViewRecord,
      restrictionEnzymesEnabled: true,
    })
    expect(memberSites.some((site) => site.enzyme.name === 'EcoRI')).toBe(true)
    expect(mainSites).toHaveLength(1)

    const hybridization = defaultPrimerHybridizationParams
    const mainBindings = [
      { primer: mainPrimer, start: 0, end: 8, strand: 'forward' as const, mismatches: 0 },
    ]
    expect(
      resolveMapViewPrimerBindings({
        browseMember: null,
        mapViewRecord: record,
        primerBindings: mainBindings,
        primerDisplay: { visible: true, hybridization },
      }),
    ).toBe(mainBindings)
    expect(
      resolveMapViewPrimerBindings({
        browseMember: member,
        mapViewRecord,
        primerBindings: mainBindings,
        primerDisplay: { visible: false, hybridization },
      }),
    ).toEqual([])
  })

  it('clamps selected range to the shorter member sequence', () => {
    const record = libraryRecord({ sequence: 'AAAAAAAAAA' })
    const member = traceMember('m1', 'TTTT')
    const mapViewRecord = resolveMapViewRecord(record, member)
    expect(
      clampMapViewSelectedRange({
        selectedRange: { start: 2, end: 8 },
        cutStrandForward: null,
        mapViewSequenceLength: mapViewRecord.sequence.length,
      }),
    ).toEqual({ start: 2, end: 4 })
    expect(
      clampMapViewSelectedRange({
        selectedRange: { start: 10, end: 12 },
        cutStrandForward: null,
        mapViewSequenceLength: mapViewRecord.sequence.length,
      }),
    ).toBeNull()
  })

  it('reports consensus visibility from library settings', () => {
    expect(libraryMapConsensusVisible(libraryRecord())).toBe(true)
    expect(
      libraryMapConsensusVisible(
        libraryRecord({ dna: { documentRole: 'library', libraryConsensusEnabled: false } }),
      ),
    ).toBe(false)
  })

  it('merges member stored features with injected ORF features', () => {
    const memberFeature: SequenceFeature = {
      id: 'feat-1',
      name: 'CDS',
      type: 'CDS',
      color: fixtureCdsColor,
      locations: [{ start: 0, end: 2, strand: 'forward' }],
    }
    const orfFeature: SequenceFeature = {
      id: 'orf:1',
      name: 'ORF',
      type: 'CDS',
      color: fixtureCdsColor,
      locations: [{ start: 0, end: 3, strand: 'forward' }],
    }
    const member = traceMember('m1', 'ACGT', { features: [memberFeature] })
    const merged = resolveMapViewAnnotationFeatures({
      browseMember: member,
      featureDisplay: { featuresVisible: true, orfsVisible: true, sgRnasVisible: false },
      mapAnnotationFeatures: [{ id: 'consensus' } as SequenceFeature],
      memberOrfFeatures: [orfFeature],
      orfPredictionEnabled: true,
    })
    expect(merged.some((feature) => feature.id === 'feat-1')).toBe(true)
    expect(merged.some((feature) => feature.id === 'orf:1')).toBe(true)
    expect(merged.some((feature) => feature.id === 'consensus')).toBe(false)
  })
})
