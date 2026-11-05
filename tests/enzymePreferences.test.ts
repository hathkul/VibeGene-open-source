import { describe, expect, it } from 'vitest'
import { enzymes } from '../src/domain/enzymes'
import {
  buildNonredundantCommercialSet,
  defaultSupplierOrder,
  enzymeLabelDisplayStyle,
  enzymePoolForSettings,
  loadEnzymePreferences,
  normalizeEnzymePreferences,
} from '../src/domain/enzymePreferences'

describe('buildNonredundantCommercialSet', () => {
  it('returns fewer enzymes than the full commercial catalog', () => {
    const nonredundant = buildNonredundantCommercialSet(defaultSupplierOrder())
    expect(nonredundant.length).toBeLessThan(enzymes.length)
    expect(nonredundant.length).toBeGreaterThan(0)
  })

  it('includes only one enzyme per recognition and cut site', () => {
    const nonredundant = buildNonredundantCommercialSet(defaultSupplierOrder())
    const keys = new Set(nonredundant.map((enzyme) => `${enzyme.recognition}:${enzyme.cutTop}:${enzyme.cutBottom}`))
    expect(keys.size).toBe(nonredundant.length)
  })

  it('prefers enzymes from the highest-priority supplier', () => {
    const eco = enzymes.find((enzyme) => enzyme.name === 'EcoRI')
    expect(eco).toBeTruthy()
    const nonredundant = buildNonredundantCommercialSet(['neb'])
    expect(nonredundant.some((enzyme) => enzyme.name === 'EcoRI')).toBe(true)
  })

  it('prefers common names over obscure isoschizomers (XhoI over PaeR7I)', () => {
    const nonredundant = buildNonredundantCommercialSet(defaultSupplierOrder())
    expect(nonredundant.some((enzyme) => enzyme.name === 'XhoI')).toBe(true)
    expect(nonredundant.some((enzyme) => enzyme.name === 'PaeR7I')).toBe(false)
  })

  it('sorts by the chosen representative name, not the displaced isoschizomer slot', () => {
    const nonredundant = buildNonredundantCommercialSet(defaultSupplierOrder())
    const names = nonredundant.map((enzyme) => enzyme.name)
    expect(names).toEqual([...names].toSorted((left, right) => left.localeCompare(right)))
    const xhoIndex = names.indexOf('XhoI')
    expect(xhoIndex).toBeGreaterThan(0)
    // XhoI must sit under X (after XbaI-class names), not in the old PaeR7I slot under P.
    expect(names[xhoIndex - 1]!.localeCompare('X')).toBeGreaterThanOrEqual(0)
  })

  it('prefers base names over HF variants when both share a site', () => {
    const nonredundant = buildNonredundantCommercialSet(defaultSupplierOrder())
    expect(nonredundant.some((enzyme) => enzyme.name === 'NheI')).toBe(true)
    expect(nonredundant.some((enzyme) => enzyme.name === 'NheI-HF')).toBe(false)
  })

  it('prefers ClaI over BspDI', () => {
    const nonredundant = buildNonredundantCommercialSet(defaultSupplierOrder())
    expect(nonredundant.some((enzyme) => enzyme.name === 'ClaI')).toBe(true)
    expect(nonredundant.some((enzyme) => enzyme.name === 'BspDI')).toBe(false)
  })

  it('prefers BsaI / BsmBI over isoschizomers after renaming NEB product variants', () => {
    const nonredundant = buildNonredundantCommercialSet(defaultSupplierOrder())
    expect(nonredundant.some((enzyme) => enzyme.name === 'BsaI')).toBe(true)
    expect(nonredundant.some((enzyme) => enzyme.name === 'BsmBI')).toBe(true)
    expect(nonredundant.some((enzyme) => enzyme.name === 'Esp3I')).toBe(false)
  })
})

describe('enzymeLabelDisplayStyle', () => {
  const preferences = normalizeEnzymePreferences({
    italicizeNames: true,
    boldUniqueCutters: true,
    greenBluntCutters: true,
  })
  const eco = enzymes.find((enzyme) => enzyme.name === 'EcoRI')
  const sma = enzymes.find((enzyme) => enzyme.name === 'SmaI')

  it('applies italic, bold unique, and blunt green styles from preferences', () => {
    expect(eco).toBeTruthy()
    expect(sma).toBeTruthy()
    expect(
      enzymeLabelDisplayStyle(
        { enzyme: eco!, start: 0, end: 6, cutTop: 1, cutBottom: 5 },
        preferences,
        { EcoRI: 1 },
      ),
    ).toEqual({ italic: true, bold: true, bluntGreen: false, greyed: false })
    expect(
      enzymeLabelDisplayStyle(
        { enzyme: sma!, start: 0, end: 6, cutTop: 3, cutBottom: 3 },
        preferences,
        { SmaI: 2 },
      ),
    ).toEqual({ italic: true, bold: false, bluntGreen: true, greyed: false })
  })

  it('bolds merged same-site labels when every member is a unique cutter', () => {
    expect(eco).toBeTruthy()
    const merged = {
      ...eco!,
      name: 'BamHI, EcoRI',
    }
    expect(
      enzymeLabelDisplayStyle(
        { enzyme: merged, start: 0, end: 6, cutTop: 1, cutBottom: 5 },
        preferences,
        { BamHI: 1, EcoRI: 1 },
      ).bold,
    ).toBe(true)
    expect(
      enzymeLabelDisplayStyle(
        { enzyme: merged, start: 0, end: 6, cutTop: 1, cutBottom: 5 },
        preferences,
        { BamHI: 1, EcoRI: 2 },
      ).bold,
    ).toBe(false)
  })
})

describe('loadEnzymePreferences', () => {
  it('normalizes stored preferences', () => {
    const loaded = loadEnzymePreferences()
    expect(loaded.supplierOrder.length).toBeGreaterThan(0)
    expect(loaded.menuSupplierCount).toBeGreaterThanOrEqual(1)
  })
})

describe('enzymePoolForSettings', () => {
  const preferences = normalizeEnzymePreferences(undefined)

  it('returns all enzymes for the all-commercial set', () => {
    expect(enzymePoolForSettings({ set: 'all', selectedNames: [], supplierSetId: null }, preferences).length).toBe(
      enzymes.length,
    )
  })

  it('returns a supplier-specific subset', () => {
    const pool = enzymePoolForSettings(
      { set: 'supplier', selectedNames: [], supplierSetId: 'jena' },
      preferences,
    )
    expect(pool.length).toBeGreaterThan(0)
    expect(pool.every((enzyme) => enzyme.manufacturers.some((manufacturer) => manufacturer.id === 'jena'))).toBe(true)
  })
})
