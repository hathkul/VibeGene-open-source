import { describe, expect, it } from 'vitest'
import {
  compareDoubleDigestCandidates,
  parseDigestActivity,
  recommendDoubleDigest,
  type InferredTableBuilder,
} from '../src/domain/doubleDigest'
import { getEnzymeByName } from '../src/domain/enzymeCatalog'
import type { InferredActivityTableModel, InferredActivityTableRow } from '../src/domain/inferredBufferActivityTable'
import type { EnzymeManufacturerId, RestrictionEnzyme } from '../src/domain/types'

function enzyme(name: string, vendors: EnzymeManufacturerId[] = ['neb']): RestrictionEnzyme {
  return {
    name,
    notation: name,
    recognition: 'GGATCC',
    cutTop: 1,
    cutBottom: 5,
    type: 'II',
    overhang: { type: '5', length: 4 },
    notes: [],
    manufacturers: vendors.map((id) => ({
      id,
      name: id.toUpperCase(),
      productUrl: `https://example.test/${id}/${name}`,
      incubationC: id === 'thermo' ? 25 : 37,
      bufferSystem: id,
      preferredBuffer: id === 'neb' ? 'cutSmart' : 'b',
      bufferActivity: {},
      methylation: { dam: 'unknown', dcm: 'unknown', ecoKI: 'unknown' },
    })) as RestrictionEnzyme['manufacturers'],
  }
}

function row(
  vendorId: EnzymeManufacturerId,
  buffer: string,
  activity: string,
  kind: InferredActivityTableRow['kind'] = 'measured',
): InferredActivityTableRow {
  return {
    vendorId,
    manufacturerShort: vendorId.toUpperCase(),
    manufacturerFull: vendorId.toUpperCase(),
    buffer: buffer as InferredActivityTableRow['buffer'],
    bufferLabel: `${vendorId} ${buffer}`,
    bufferTitle: `${vendorId} ${buffer}`,
    activity,
    kind,
    confidence: kind === 'measured' ? 'Measured' : 'Medium',
    rationale: '',
    needsAdditive: false,
    starRisk: false,
    flagsTitle: '',
  }
}

function table(enzymeName: string, rows: InferredActivityTableRow[]): InferredActivityTableModel {
  return {
    enzymeName,
    source: enzyme(enzymeName).manufacturers[0]!,
    sourceShort: 'NEB',
    sourceFull: 'NEB',
    caption: '',
    doubleInferenceNote: '',
    rows,
  }
}

function builder(tables: Record<string, InferredActivityTableRow[]>): InferredTableBuilder {
  return (selected) => table(selected.name, tables[selected.name] ?? [])
}

describe('parseDigestActivity', () => {
  it('requires activity to be guaranteed strictly above 70%', () => {
    expect(parseDigestActivity('71%')?.guaranteedAbove70).toBe(true)
    expect(parseDigestActivity('71–100%')?.guaranteedAbove70).toBe(true)
    expect(parseDigestActivity('>70%')?.guaranteedAbove70).toBe(true)
    expect(parseDigestActivity('70%')?.guaranteedAbove70).toBe(false)
    expect(parseDigestActivity('70–100%')?.guaranteedAbove70).toBe(false)
    expect(parseDigestActivity('<100%')).toBeNull()
    expect(parseDigestActivity('NR')).toBeNull()
  })
})

describe('recommendDoubleDigest', () => {
  const bam = enzyme('BamHI')
  const eco = enzyme('EcoRI')

  it('recommends a qualifying common buffer', () => {
    const result = recommendDoubleDigest(
      { enzyme: bam, manufacturerId: 'neb' },
      { enzyme: eco, manufacturerId: 'neb' },
      builder({ BamHI: [row('neb', 'cutSmart', '100%')], EcoRI: [row('neb', 'cutSmart', '90%')] }),
    )
    expect(result.kind).toBe('simultaneous')
    expect(result.best?.buffer).toBe('cutSmart')
  })

  it('excludes exact 70% and recommends sequential digestion', () => {
    const result = recommendDoubleDigest(
      { enzyme: bam, manufacturerId: 'neb' },
      { enzyme: eco, manufacturerId: 'neb' },
      builder({ BamHI: [row('neb', 'cutSmart', '70%')], EcoRI: [row('neb', 'cutSmart', '100%')] }),
    )
    expect(result.kind).toBe('sequential')
    expect(result.reason).toContain('more than 70%')
  })

  it('does not combine high activities from different buffer keys', () => {
    const result = recommendDoubleDigest(
      { enzyme: bam, manufacturerId: 'neb' },
      { enzyme: eco, manufacturerId: 'neb' },
      builder({
        BamHI: [row('neb', 'r1.1', '100%'), row('neb', 'r2.1', '20%')],
        EcoRI: [row('neb', 'r1.1', '20%'), row('neb', 'r2.1', '100%')],
      }),
    )
    expect(result.kind).toBe('sequential')
  })

  it('prefers selected same-manufacturer native guidance over stronger inference', () => {
    const result = recommendDoubleDigest(
      { enzyme: bam, manufacturerId: 'neb' },
      { enzyme: eco, manufacturerId: 'neb' },
      builder({
        BamHI: [row('neb', 'cutSmart', '80%'), row('neb', 'r3.1', '100%', 'inferred')],
        EcoRI: [row('neb', 'cutSmart', '80%'), row('neb', 'r3.1', '100%', 'inferred')],
      }),
    )
    expect(result.best?.buffer).toBe('cutSmart')
    expect(result.best?.vendorNative).toBe(true)
  })

  it('uses inferred cross-vendor activity when manufacturers differ', () => {
    const result = recommendDoubleDigest(
      { enzyme: enzyme('BamHI', ['neb']), manufacturerId: 'neb' },
      { enzyme: enzyme('EcoRI', ['thermo']), manufacturerId: 'thermo' },
      builder({
        BamHI: [row('neb', 'cutSmart', '100%'), row('thermo', 'b', '85%', 'inferred')],
        EcoRI: [row('neb', 'cutSmart', '82%', 'inferred'), row('thermo', 'b', '100%')],
      }),
    )
    expect(result.kind).toBe('simultaneous')
    expect(result.best?.vendorId).toBe('thermo')
    expect(result.warnings.some((warning) => warning.includes('inferred'))).toBe(true)
  })

  it('ranks minimum activity before total and breaks ties by stable key', () => {
    const result = recommendDoubleDigest(
      { enzyme: enzyme('BamHI', ['neb', 'thermo']), manufacturerId: 'neb' },
      { enzyme: enzyme('EcoRI', ['neb', 'thermo']), manufacturerId: 'thermo' },
      builder({
        BamHI: [row('neb', 'r1.1', '100%', 'inferred'), row('thermo', 'b', '90%', 'inferred')],
        EcoRI: [row('neb', 'r1.1', '80%', 'inferred'), row('thermo', 'b', '90%', 'inferred')],
      }),
    )
    expect(result.best?.vendorId).toBe('thermo')
    const tied = [result.best!, { ...result.best!, vendorId: 'neb' as const, buffer: 'r1.1' as const }]
      .sort(compareDoubleDigestCandidates)
    expect(tied[0]?.vendorId).toBe('neb')
  })

  it('matches the catalog manufacturer table for a real same-vendor pair', () => {
    const catalogBam = getEnzymeByName('BamHI')
    const catalogEco = getEnzymeByName('EcoRI')
    expect(catalogBam).not.toBeNull()
    expect(catalogEco).not.toBeNull()

    const result = recommendDoubleDigest(
      { enzyme: catalogBam!, manufacturerId: 'neb' },
      { enzyme: catalogEco!, manufacturerId: 'neb' },
    )

    expect(result.kind).toBe('simultaneous')
    expect(result.best?.vendorId).toBe('neb')
    expect(result.best?.buffer).toBe('r2.1')
    expect(result.best?.first.kind).toBe('measured')
    expect(result.best?.second.kind).toBe('measured')
  })
})
