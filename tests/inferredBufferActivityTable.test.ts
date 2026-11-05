import { describe, expect, it } from 'vitest'
import { getEnzymeByName } from '../src/domain/enzymeCatalog'
import {
  buildInferredActivityTable,
  chooseInferenceSource,
  formatActivityCell,
} from '../src/domain/inferredBufferActivityTable'
import type { RestrictionEnzyme } from '../src/domain/types'

function enzymeNamed(name: string) {
  const enzyme = getEnzymeByName(name)
  expect(enzyme).toBeTruthy()
  return enzyme!
}

describe('chooseInferenceSource', () => {
  it('uses the selected manufacturer when it has enough numeric points', () => {
    const enzyme = enzymeNamed('AatII')
    const source = chooseInferenceSource(enzyme, 'thermo')
    expect(source?.id).toBe('thermo')
  })

  it('falls back when the selected listing has fewer than two numeric points', () => {
    const aanI = enzymeNamed('AanI')
    const thinNeb: RestrictionEnzyme = {
      ...aanI,
      manufacturers: [
        {
          id: 'neb',
          bufferSystem: 'neb',
          name: 'New England Biolabs',
          productUrl: 'https://example.test/neb',
          incubationC: 37,
          preferredBuffer: 'r1.1',
          bufferActivity: { 'r1.1': 100 },
          methylation: aanI.manufacturers[0]!.methylation,
        },
        ...aanI.manufacturers,
      ],
    }
    expect(chooseInferenceSource(thinNeb, 'neb')?.id).toBe('thermo')
  })
})

describe('buildInferredActivityTable', () => {
  it('keeps native Thermo cells measured and infers other vendors for AanI', () => {
    const table = buildInferredActivityTable(enzymeNamed('AanI'), 'thermo')
    expect(table).toBeTruthy()
    expect(table!.caption).toBe('Inferred activity for AanI from Thermo chart')
    expect(table!.rows.some((row) => row.vendorId === 'neb')).toBe(true)

    const tango = table!.rows.find((row) => row.vendorId === 'thermo' && row.buffer === 'tango')
    expect(tango?.kind).toBe('measured')
    expect(tango?.confidence).toBe('Measured')
    expect(tango?.activity).toMatch(/%/)

    const r11 = table!.rows.find((row) => row.vendorId === 'neb' && row.buffer === 'r1.1')
    expect(r11?.kind).toBe('inferred')
    expect(['High', 'Medium', 'Low']).toContain(r11?.confidence)
    expect(r11?.activity).toMatch(/%/)

    const rose = table!.rows.find((row) => row.vendorId === 'sibenzyme' && row.buffer === 'rose')
    expect(rose?.kind).toBe('double')
    expect(rose?.confidence).toBe('Double, low')
    expect(rose?.activity).toMatch(/%/)
    expect(rose?.rationale).toMatch(/Double inference/)
    expect(rose?.rationale).toMatch(/50 mM chloride/)
    expect(table!.doubleInferenceNote).toMatch(/double inference/)

    const usbF = table!.rows.find((row) => row.vendorId === 'usb' && row.buffer === 'f')
    expect(usbF?.kind).toBe('unknown')
    expect(usbF?.activity).toBe('—')

    const one = table!.rows.find((row) => row.vendorId === 'eurx' && row.buffer === 'one')
    expect(one?.kind).toBe('double')
    expect(one?.confidence).toBe('Double, low')
    expect(one?.activity).toMatch(/%/)
    expect(one?.rationale).toMatch(/66 mM acetate/)

    const jenaUb = table!.rows.find((row) => row.vendorId === 'jena' && row.buffer === 'ub')
    expect(jenaUb?.kind).toBe('unknown')

    const basal = table!.rows.find((row) => row.vendorId === 'takara' && row.buffer === 'basal')
    expect(basal?.kind).toBe('unknown')
  })

  it('shows published 1X recipes on buffer-name hover, not fitted ROSE/ONE ions', () => {
    const table = buildInferredActivityTable(enzymeNamed('AanI'), 'thermo')
    expect(table).toBeTruthy()

    const r11 = table!.rows.find((row) => row.vendorId === 'neb' && row.buffer === 'r1.1')
    expect(r11?.bufferTitle).toMatch(/1X:/)
    expect(r11?.bufferTitle).toMatch(/pH/)

    const tango = table!.rows.find((row) => row.vendorId === 'thermo' && row.buffer === 'tango')
    expect(tango?.bufferTitle).toMatch(/1X:/)
    expect(tango?.bufferTitle).toMatch(/acetate/)

    const sibY = table!.rows.find((row) => row.vendorId === 'sibenzyme' && row.buffer === 'y')
    expect(sibY?.bufferTitle).toMatch(/1X:/)
    expect(sibY?.bufferTitle).toMatch(/pH/)

    const rose = table!.rows.find((row) => row.vendorId === 'sibenzyme' && row.buffer === 'rose')
    expect(rose?.kind).toBe('double')
    expect(rose?.bufferTitle).not.toMatch(/1X:/)
    expect(rose?.bufferTitle).not.toMatch(/50 mM chloride/)
    expect(rose?.bufferTitle).not.toMatch(/66 mM acetate/)

    const one = table!.rows.find((row) => row.vendorId === 'eurx' && row.buffer === 'one')
    expect(one?.kind).toBe('double')
    expect(one?.bufferTitle).not.toMatch(/1X:/)
    expect(one?.bufferTitle).not.toMatch(/50 mM chloride/)
    expect(one?.bufferTitle).not.toMatch(/66 mM acetate/)
  })

  it('does not overwrite AatII native NEB numbers when inferring from Thermo', () => {
    const enzyme = enzymeNamed('AatII')
    const table = buildInferredActivityTable(enzyme, 'thermo')
    expect(table).toBeTruthy()
    const cutSmart = table!.rows.find((row) => row.vendorId === 'neb' && row.buffer === 'cutSmart')
    expect(cutSmart?.kind).toBe('measured')
    expect(cutSmart?.confidence).toBe('Measured')
    const native = enzyme.manufacturers.find((entry) => entry.id === 'neb')!.bufferActivity.cutSmart
    expect(cutSmart?.activity).toBe(formatActivityCell(native!).activity)
    expect(cutSmart?.activity).toMatch(/%$/)
    const rose = table!.rows.find((row) => row.vendorId === 'sibenzyme' && row.buffer === 'rose')
    expect(rose?.kind).toBe('measured')
    expect(rose?.confidence).toBe('Measured')
    expect(rose?.activity).toBe('50%')
    expect(rose?.bufferTitle).not.toMatch(/1X:/)
    expect(rose?.bufferTitle).not.toMatch(/50 mM chloride/)
    expect(rose?.bufferTitle).not.toMatch(/66 mM acetate/)
    const one = table!.rows.find((row) => row.vendorId === 'eurx' && row.buffer === 'one')
    expect(one?.kind).toBe('double')
    expect(one?.confidence).toBe('Double, low')
  })

  it('includes Vivantis UB dilution columns', () => {
    const table = buildInferredActivityTable(enzymeNamed('EcoRI'), 'neb')
    expect(table).toBeTruthy()
    const ubColumns = table!.rows.filter((row) => row.vendorId === 'vivantis').map((row) => row.buffer)
    expect(ubColumns).toEqual(expect.arrayContaining(['v1', 'ub05', 'ub', 'ub15', 'ub2']))
  })

  it('formats EcoRI activity cells uniformly without star or double percent', () => {
    const table = buildInferredActivityTable(enzymeNamed('EcoRI'), 'neb')
    expect(table).toBeTruthy()
    for (const row of table!.rows) {
      expect(row.activity).not.toMatch(/\*\s*$/)
      expect(row.activity).not.toMatch(/\+/)
      expect(row.activity).not.toMatch(/%%/)
      expect(row.activity).not.toMatch(/\d+-\d+$/)
      if (row.activity !== 'NR' && row.activity !== '—') {
        expect(row.activity).toMatch(/%$/)
      } else {
        expect(row.activity).not.toMatch(/%/)
      }
    }
  })
})

describe('formatActivityCell', () => {
  it('adds a single trailing percent to numeric singles', () => {
    expect(formatActivityCell(100)).toEqual({ activity: '100%', starRisk: false, needsAdditive: false })
    expect(formatActivityCell('100')).toEqual({ activity: '100%', starRisk: false, needsAdditive: false })
    expect(formatActivityCell('100%')).toEqual({ activity: '100%', starRisk: false, needsAdditive: false })
  })

  it('moves trailing star out of the activity text', () => {
    expect(formatActivityCell('100*')).toEqual({ activity: '100%', starRisk: true, needsAdditive: false })
    expect(formatActivityCell('100%*')).toEqual({ activity: '100%', starRisk: true, needsAdditive: false })
  })

  it('normalizes ranges to an en-dash and one trailing percent', () => {
    expect(formatActivityCell('50-100').activity).toBe('50–100%')
    expect(formatActivityCell('50-100%').activity).toBe('50–100%')
    expect(formatActivityCell('50%-100%').activity).toBe('50–100%')
    expect(formatActivityCell('50–100%%').activity).toBe('50–100%')
  })

  it('formats less-than values with one percent', () => {
    expect(formatActivityCell('<20').activity).toBe('<20%')
    expect(formatActivityCell('<20%').activity).toBe('<20%')
  })

  it('unwraps parenthetical numbers', () => {
    expect(formatActivityCell('(20)').activity).toBe('20%')
    expect(formatActivityCell('(100)').activity).toBe('100%')
  })

  it('keeps NR without a percent and flags oligo/SAM additives', () => {
    expect(formatActivityCell('NR')).toEqual({ activity: 'NR', starRisk: false, needsAdditive: false })
    expect(formatActivityCell('NR (+oligo)')).toEqual({ activity: 'NR', starRisk: false, needsAdditive: true })
    expect(formatActivityCell('100 (+SAM)')).toEqual({ activity: '100%', starRisk: false, needsAdditive: true })
  })

  it('uses an em dash for unknown catalog placeholders', () => {
    expect(formatActivityCell('None').activity).toBe('—')
  })

  it('treats a leading-hyphen SibEnzyme value as a 0–N range', () => {
    expect(formatActivityCell('-10').activity).toBe('0–10%')
  })
})

