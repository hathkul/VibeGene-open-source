import { describe, expect, it } from 'vitest'
import { defaultPrimerHybridizationParams } from '../../domain/primerHybridization'
import { serializeFeatureQualifiers } from '../../domain/featureQualifiers'
import type { TraceFileRecord } from '../../domain/traceTypes'
import { cloneFixture } from '../../domain/fixtures'
import type { Primer, SequenceFeature, SequenceRecord } from '../../domain/types'

const fixtureFeatureColor = cloneFixture().features[0]!.color
import {
  buildPrimerTabProjection,
  buildSelectedSgRnasForCloning,
  buildSelectedSgRnasForExport,
  resolveSelectedPrimerPaneSgRna,
} from './primerTabProjection'

function primer(id: string): Primer {
  return { id, name: id, sequence: 'ACGTACGT', color: id }
}

function sgRnaFeatures(tag: string): SequenceFeature[] {
  const common = { vibegene_sgrna_id: tag, vibegene_sgrna: '1' }
  return [
    {
      id: `guide-${tag}`,
      name: tag,
      type: 'misc_feature',
      color: fixtureFeatureColor,
      locations: [{ start: 0, end: 20, strand: 'forward' }],
      notes: serializeFeatureQualifiers({ ...common, vibegene_sgrna_part: 'guide' }),
    },
    {
      id: `pam-${tag}`,
      name: `${tag} PAM`,
      type: 'misc_feature',
      color: fixtureFeatureColor,
      locations: [{ start: 20, end: 23, strand: 'forward' }],
      notes: serializeFeatureQualifiers({ ...common, vibegene_sgrna_part: 'pam' }),
    },
  ]
}

function record(features: SequenceFeature[] = [], primers: Primer[] = [], library = false): SequenceRecord {
  return {
    id: 'rec',
    name: 'rec',
    molecule: 'dna',
    topology: 'linear',
    sequence: 'ACGTACGTACGTACGTACGT',
    features,
    primers,
    history: [],
    ...(library ? { dna: { documentRole: 'library' } } : {}),
  } as unknown as SequenceRecord
}

function member(id: string, features: SequenceFeature[] = [], primers: Primer[] = []): TraceFileRecord {
  return {
    id,
    fileName: `${id}.ab1`,
    sequence: 'ACGTACGTACGTACGTACGT',
    chromatogram: {} as never,
    enabled: true,
    expanded: false,
    showAnnotations: true,
    alignment: null,
    features,
    primers,
  }
}

const defaultSorts = {
  primerSort: { mode: 'name' as const, direction: 'asc' as const },
  oligoSort: { mode: 'name' as const, direction: 'asc' as const },
  sgRnaSort: { mode: 'name' as const, direction: 'asc' as const },
}

describe('primerTabProjection', () => {
  it('partitions primer pane entries into primer and sgRNA rows', () => {
    const rec = record(sgRnaFeatures('g1'), [primer('p1')])
    const projection = buildPrimerTabProjection({
      record: rec,
      traceFiles: [],
      hybridization: defaultPrimerHybridizationParams,
      sorts: defaultSorts,
      warningsFor: () => 'ok',
    })
    expect(projection.primerRows).toHaveLength(1)
    expect(projection.sgRnaRows).toHaveLength(1)
    expect(projection.entries.length).toBeGreaterThan(projection.primerRows.length)
  })

  it('resolves the selected sgRNA pane row only under feature focus', () => {
    const rec = record(sgRnaFeatures('g1'))
    const projection = buildPrimerTabProjection({
      record: rec,
      traceFiles: [],
      hybridization: defaultPrimerHybridizationParams,
      sorts: defaultSorts,
      warningsFor: () => 'ok',
    })
    const row = projection.sgRnaRows[0]!
    expect(
      resolveSelectedPrimerPaneSgRna(projection.entries, 'feature', row.memberId, row.annotation.guide.id),
    ).toEqual(row)
    expect(
      resolveSelectedPrimerPaneSgRna(projection.entries, 'dna', row.memberId, row.annotation.guide.id),
    ).toBeUndefined()
  })

  it('exports selected sgRNAs from the tab member or alignment member on DNA records', () => {
    const features = sgRnaFeatures('g1')
    const rec = record([], [], true)
    const traces = [member('m1', features)]
    const exported = buildSelectedSgRnasForExport(rec, traces, null, traces[0]!, ['guide-g1'])
    expect(exported).toHaveLength(1)
    expect(buildSelectedSgRnasForExport(rec, traces, 'm1', null, ['pam-g1'])).toHaveLength(1)
    expect(buildSelectedSgRnasForExport({ ...rec, molecule: 'rna' }, traces, null, null, ['guide-g1'])).toEqual([])
  })

  it('limits cloning exports to sgRNAs that include a PAM feature', () => {
    const features = sgRnaFeatures('g1')
    const rec = record(features)
    const exported = buildSelectedSgRnasForExport(rec, [], null, null, ['guide-g1'])
    expect(buildSelectedSgRnasForCloning(exported)).toHaveLength(1)
    const guideOnly = exported.map((annotation) => ({ ...annotation, pam: undefined }))
    expect(buildSelectedSgRnasForCloning(guideOnly)).toEqual([])
  })
})
