import { describe, expect, it } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import { defaultDnaEnds } from '../src/domain/dnaEnds'
import { findRestrictionSites } from '../src/domain/enzymes'
import {
  constructNameStem,
  createRestrictionCloningProductLibrary,
  createRestrictionCloningProductLibraryAsync,
  describeMissingRestrictionSites,
  expandRestrictionInsertSources,
  formatSkippedRestrictionInserts,
  formatSkippedRestrictionProducts,
  hasMassInsertNameToken,
  hasMassVectorNameToken,
  initialRestrictionOperationBatchSources,
  remapRestrictionInsertConfig,
  renderMassRestrictionProductName,
  restrictionBatchPairs,
} from '../src/domain/restrictionCloningBatch'
import {
  defaultCloningPartConfig,
  defaultDigestFragmentId,
  listDigestFragmentsBetweenCuts,
} from '../src/domain/restrictionCloning'
import type { RestrictionEnzyme, SequenceRecord } from '../src/domain/types'
import { emptyChromatogramForSequence } from '../src/domain/sequenceTraceFactory'

const ecoRi: RestrictionEnzyme = {
  name: 'EcoRI',
  notation: 'G^AATTC',
  recognition: 'GAATTC',
  cutTop: 1,
  cutBottom: 5,
  type: 'II',
  overhang: { type: "5'", sequence: 'AATT', length: 4 },
  manufacturers: [],
  notes: [],
}

function record(id: string, name: string, sequence: string): SequenceRecord {
  return {
    id,
    name,
    description: '',
    molecule: 'dna',
    topology: 'circular',
    sequence,
    features: [],
    primers: [],
    operations: [],
    dnaEnds: defaultDnaEnds(),
    construct: { ...defaultConstructProperties },
    createdAt: '',
    updatedAt: '',
  }
}

describe('mass restriction cloning', () => {
  it('starts unary restriction operations with every member of an open library', () => {
    const library = createRestrictionCloningProductLibrary(
      [record('member-one', 'Member one', 'AAAGAATTCTTT'), record('member-two', 'Member two', 'CCGAATTCAAA')],
      'Open library.dna',
    )

    const choices = initialRestrictionOperationBatchSources(library, 'delete-fragment')

    expect(choices.map((choice) => choice.record.name)).toEqual(['Member one', 'Member two'])
    expect(choices.every((choice) => choice.record.topology === 'circular')).toBe(true)
    expect(initialRestrictionOperationBatchSources(library, 'destroy-site')).toHaveLength(2)
    expect(initialRestrictionOperationBatchSources(library, 'insert')).toEqual([])
  })

  it('packages cloned products as annotated members of one DNA library', () => {
    const first = {
      ...record('product-one', 'Product one', 'AAAGAATTCTTT'),
      features: [
        {
          id: 'feature-one',
          name: 'Insert CDS',
          type: 'CDS',
          color: '#447744',
          locations: [{ start: 3, end: 9, strand: 'forward' as const }],
        },
      ],
      primers: [
        {
          id: 'primer-one',
          name: 'Product F',
          sequence: 'AAAGAATTC',
          color: '#3366aa',
        },
      ],
    }
    const second = record('product-two', 'Product two', 'AAAGAATTCTTA')

    const library = createRestrictionCloningProductLibrary(
      [first, second],
      'Screen output.dna',
    )

    expect(library.name).toBe('Screen output')
    expect(library.dna?.documentRole).toBe('library')
    expect(library.topology).toBe('circular')
    expect(library.traceFiles?.map((member) => member.fileName)).toEqual([
      'Product one',
      'Product two',
    ])
    expect(library.traceFiles?.[0]?.features?.[0]?.id).toBe('feature-one')
    expect(library.traceFiles?.[0]?.primers?.[0]?.id).toBe('primer-one')
    expect(library.features.map((feature) => feature.id)).toEqual(['feature-one'])
    expect(library.primers.map((primer) => primer.id)).toEqual(['primer-one'])
    expect(library.dna?.libraryMemberFeatures?.[0]?.features[0]?.id).toBe('feature-one')
    expect(library.dna?.libraryMemberPrimers?.[0]?.primers[0]?.id).toBe('primer-one')
  })

  it('packages the same aligned, annotated members asynchronously', async () => {
    const first = {
      ...record('first', 'First', 'AAAGAATTCTTT'),
      features: [{
        id: 'insert', name: 'Insert', type: 'misc_feature', color: '#447744',
        locations: [{ start: 3, end: 9, strand: 'forward' as const }],
      }],
    }
    const products = [first, record('second', 'Second', 'AAAGAATTCTTA')]
    const expected = createRestrictionCloningProductLibrary(products, 'Async products.dna')
    const pending = createRestrictionCloningProductLibraryAsync(products, 'Async products.dna')
    expect(pending).toBeInstanceOf(Promise)
    const actual = await pending

    expect(actual.name).toBe(expected.name)
    expect(actual.sequence).toBe(first.sequence)
    expect(actual.topology).toBe(expected.topology)
    expect(actual.features).toEqual(expected.features)
    expect(actual.traceFiles?.map((member) => member.alignment)).toEqual(
      expected.traceFiles?.map((member) => member.alignment),
    )
    expect(actual.dna?.libraryMemberFeatures).toEqual(expected.dna?.libraryMemberFeatures)
  })

  it('seeds product-library consensus from the first product, not the longest', () => {
    const first = {
      ...record('product-one', 'Product one', 'AAAGAATTCTTT'),
      features: [
        {
          id: 'feature-first',
          name: 'From first insert',
          type: 'misc_feature',
          color: '#447744',
          locations: [{ start: 3, end: 9, strand: 'forward' as const }],
        },
      ],
    }
    const longer = {
      ...record('product-long', 'Product long', 'AAAGAATTCTTTCCCC'),
      features: [
        {
          id: 'feature-long',
          name: 'From longest insert',
          type: 'misc_feature',
          color: '#aa4444',
          locations: [{ start: 3, end: 9, strand: 'forward' as const }],
        },
      ],
    }

    const library = createRestrictionCloningProductLibrary(
      [first, longer],
      'Seed order.dna',
    )

    expect(library.sequence).toBe(first.sequence)
    expect(library.features.map((feature) => feature.id)).toEqual(['feature-first'])
    expect(library.features[0]?.name).toBe('From first insert')
  })

  it('renders the insert-name token without carrying a file extension', () => {
    expect(renderMassRestrictionProductName('pDest-<insert_name>.dna', 'Kinase.gb')).toBe(
      'pDest-Kinase.dna',
    )
    expect(hasMassInsertNameToken('pDest-<INSERT_NAME>')).toBe(true)
    expect(hasMassVectorNameToken('<VECTOR_NAME>-product')).toBe(true)
    expect(
      renderMassRestrictionProductName(
        '<vector_name>-<insert_name>.dna',
        'Kinase.gb',
        'pDest.dna',
      ),
    ).toBe('pDest-Kinase.dna')
    expect(constructNameStem('Kinase.dna')).toBe('Kinase')
  })

  it('creates every vector–insert combination in stable vector-major order', () => {
    expect(
      restrictionBatchPairs(
        [{ key: 'v1' }, { key: 'v2' }],
        [{ key: 'i1' }, { key: 'i2' }],
      ).map((pair) => pair.key),
    ).toEqual([
      'vector:v1|insert:i1',
      'vector:v1|insert:i2',
      'vector:v2|insert:i1',
      'vector:v2|insert:i2',
    ])
  })

  it('expands a DNA library into one linear insert choice per member', () => {
    const library: SequenceRecord = {
      ...record('library', 'Clone library', 'AAA'),
      dna: { documentRole: 'library' },
      traceFiles: [
        {
          id: 'member-a',
          fileName: 'Clone A.seq',
          sequence: 'AAAGAATTCTTT',
          chromatogram: emptyChromatogramForSequence('AAAGAATTCTTT'),
          enabled: true,
          expanded: false,
          showAnnotations: true,
          alignment: null,
        },
        {
          id: 'member-b',
          fileName: 'Clone B.seq',
          sequence: 'CCCGGG',
          chromatogram: emptyChromatogramForSequence('CCCGGG'),
          enabled: false,
          expanded: false,
          showAnnotations: true,
          alignment: null,
        },
      ],
    }

    const expanded = expandRestrictionInsertSources([
      { key: 'database:library', record: library },
      { key: 'database:plain', record: record('plain', 'Plain insert', 'ATGC') },
    ])

    expect(expanded.map((choice) => choice.key)).toEqual([
      'database:library|library-member:member-a',
      'database:library|library-member:member-b',
      'database:plain',
    ])
    expect(expanded.map((choice) => choice.record.name)).toEqual([
      'Clone A.seq',
      'Clone B.seq',
      'Plain insert',
    ])
    expect(expanded.map((choice) => choice.record.topology)).toEqual([
      'linear',
      'linear',
      'circular',
    ])
    expect(expanded[0]?.librarySource).toEqual({
      key: 'database:library',
      name: 'Clone library',
      memberId: 'member-a',
    })
    expect(expanded[2]?.librarySource).toBeUndefined()

    const expandedOpenLibrary = expandRestrictionInsertSources([
      { key: 'open-tab:library-window', record: library },
    ])
    expect(expandedOpenLibrary.map((choice) => choice.key)).toEqual([
      'open-tab:library-window|library-member:member-a',
      'open-tab:library-window|library-member:member-b',
    ])
    expect(
      expandRestrictionInsertSources(
        [{ key: 'open-tab:library-window', record: library }],
        { topology: 'source' },
      ).map((choice) => choice.record.topology),
    ).toEqual(['circular', 'circular'])
  })

  it('does not use a DNA-library consensus when the library has no members', () => {
    const library: SequenceRecord = {
      ...record('library', 'Empty library', 'AAAGAATTCTTT'),
      dna: { documentRole: 'library' },
      traceFiles: [],
    }
    expect(expandRestrictionInsertSources([{ key: 'database:library', record: library }])).toEqual([])
  })

  it('maps the selected enzyme occurrence and fragment direction to another insert', () => {
    const templateRecord = record('one', 'Insert one', `AAA${ecoRi.recognition}CCC${ecoRi.recognition}TTT`)
    const targetRecord = record('two', 'Insert two', `GGG${ecoRi.recognition}AAA${ecoRi.recognition}CCC`)
    const templateSites = findRestrictionSites(templateRecord.sequence, [ecoRi], {
      construct: templateRecord.construct,
      topology: templateRecord.topology,
      annotateMethylation: true,
    })
    const template = {
      ...defaultCloningPartConfig('insert', templateRecord),
      leftCut: {
        ...defaultCloningPartConfig('insert', templateRecord).leftCut,
        enzymeName: ecoRi.name,
        site: templateSites[0]!,
      },
      rightCut: {
        ...defaultCloningPartConfig('insert', templateRecord).rightCut,
        enzymeName: ecoRi.name,
        site: templateSites[1]!,
      },
      selectedFragmentId: 'forward',
    }

    const mapped = remapRestrictionInsertConfig(template, targetRecord)
    expect(mapped.leftCut.site?.start).toBe(3)
    expect(mapped.rightCut.site?.start).toBe(12)
    expect(mapped.selectedFragmentId).toBe('forward')
  })

  it('uses vector fragment defaults when remapping a batch deletion target', () => {
    const templateRecord = record('one', 'Template', `AAA${ecoRi.recognition}CCC${ecoRi.recognition}${'T'.repeat(30)}`)
    const targetRecord = record('two', 'Target', `GGG${ecoRi.recognition}${'A'.repeat(20)}${ecoRi.recognition}CCC`)
    const templateSites = findRestrictionSites(templateRecord.sequence, [ecoRi], {
      construct: templateRecord.construct,
      topology: templateRecord.topology,
    })
    const base = defaultCloningPartConfig('vector', templateRecord)
    const template = {
      ...base,
      leftCut: { ...base.leftCut, enzymeName: ecoRi.name, site: templateSites[0]! },
      rightCut: { ...base.rightCut, enzymeName: ecoRi.name, site: templateSites[1]! },
      selectedFragmentId: 'not-a-fragment',
    }

    const mapped = remapRestrictionInsertConfig(template, targetRecord)
    const fragments = listDigestFragmentsBetweenCuts(
      targetRecord,
      mapped.leftCut.site!,
      mapped.rightCut.site!,
    )
    expect(mapped.selectedFragmentId).toBe(
      defaultDigestFragmentId('vector', fragments, targetRecord.sequence.length),
    )
  })

  it('leaves a missing enzyme site unresolved so normal cloning validation can explain it', () => {
    const templateRecord = record('one', 'Insert one', `AAA${ecoRi.recognition}CCC`)
    const targetRecord = record('two', 'Insert two', 'GGGAAACCC')
    const [site] = findRestrictionSites(templateRecord.sequence, [ecoRi], {
      construct: templateRecord.construct,
      topology: templateRecord.topology,
      annotateMethylation: true,
    })
    const base = defaultCloningPartConfig('insert', templateRecord)
    const mapped = remapRestrictionInsertConfig(
      {
        ...base,
        leftCut: { ...base.leftCut, enzymeName: ecoRi.name, site: site! },
        rightCut: { ...base.rightCut, enzymeName: ecoRi.name, site: site! },
        selectedFragmentId: 'linearized',
      },
      targetRecord,
    )
    expect(mapped.leftCut.enzymeName).toBe('EcoRI')
    expect(mapped.leftCut.site).toBeNull()
    expect(mapped.rightCut.site).toBeNull()
    expect(describeMissingRestrictionSites(base, mapped)).toBeNull()
  })

  it('describes missing digest sites and explicitly lists every skipped insert', () => {
    const templateRecord = record('one', 'Template', `AAA${ecoRi.recognition}CCC`)
    const targetRecord = record('two', 'Missing', 'GGGAAACCC')
    const [site] = findRestrictionSites(templateRecord.sequence, [ecoRi], {
      construct: templateRecord.construct,
      topology: templateRecord.topology,
    })
    const base = defaultCloningPartConfig('insert', templateRecord)
    const template = {
      ...base,
      leftCut: { ...base.leftCut, enzymeName: ecoRi.name, site: site! },
      rightCut: { ...base.rightCut, enzymeName: ecoRi.name, site: site! },
    }
    const mapped = remapRestrictionInsertConfig(template, targetRecord)

    expect(describeMissingRestrictionSites(template, mapped)).toBe(
      'missing EcoRI restriction site',
    )
    expect(
      formatSkippedRestrictionInserts([
        { insertName: 'Insert A', reason: 'missing XbaI restriction site' },
        { insertName: 'Insert B', reason: 'missing BamHI restriction site.' },
      ]),
    ).toBe(
      '2 inserts could not be cloned: Insert A — missing XbaI restriction site; Insert B — missing BamHI restriction site.',
    )
    expect(
      formatSkippedRestrictionProducts([
        {
          vectorName: 'Vector A',
          insertName: 'Insert B',
          reason: 'missing EcoRI restriction site',
        },
      ]),
    ).toBe(
      '1 product could not be cloned: Vector A ← Insert B — missing EcoRI restriction site.',
    )
  })
})
