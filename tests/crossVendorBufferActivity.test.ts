import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { RestrictionEnzyme } from '../src/domain/types.ts'
import {
  compositionFor,
  inferCatalog,
  inferEnzyme,
  nativeObservedPoints,
  parseActivity,
  profileNeedsAdditive,
} from '../src/domain/crossVendorBufferActivity.ts'

const catalogPath = join(dirname(fileURLToPath(import.meta.url)), '../src/data/enzymes.json')
const enzymes = JSON.parse(readFileSync(catalogPath, 'utf8')) as RestrictionEnzyme[]

function enzymeNamed(name: string) {
  const enzyme = enzymes.find((entry) => entry.name === name)
  expect(enzyme).toBeTruthy()
  return enzyme!
}

function sourceOf(name: string, vendor: RestrictionEnzyme['manufacturers'][number]['id']) {
  const { entry } = inferEnzyme(enzymeNamed(name))
  const source = entry.sources.find((item) => item.vendor === vendor)
  expect(source).toBeTruthy()
  return source!
}

function inferred(name: string, vendor: RestrictionEnzyme['manufacturers'][number]['id'], targetVendor: string, buffer: string) {
  const hit = sourceOf(name, vendor).inferred.find((item) => item.targetVendor === targetVendor && item.buffer === buffer)
  expect(hit, `${name} ${vendor} → ${targetVendor}:${buffer}`).toBeTruthy()
  return hit!
}

describe('parseActivity', () => {
  it('parses ranges, NR, star, less-than, parenthetical, and additives', () => {
    expect(parseActivity('100')).toMatchObject({ interpolatable: true, lo: 100, hi: 100, mid: 100, star: false })
    expect(parseActivity('50-100')).toMatchObject({ interpolatable: true, lo: 50, hi: 100, mid: 75 })
    expect(parseActivity('20-50')).toMatchObject({ lo: 20, hi: 50, mid: 35 })
    expect(parseActivity('0-20')).toMatchObject({ lo: 0, hi: 20, mid: 10 })
    expect(parseActivity('75-100')).toMatchObject({ lo: 75, hi: 100 })
    expect(parseActivity('NR')).toMatchObject({ interpolatable: false, nr: true })
    expect(parseActivity('NR (+oligo)')).toMatchObject({ interpolatable: false, nr: true, additives: ['oligo'] })
    expect(parseActivity('100*')).toMatchObject({ interpolatable: true, mid: 100, star: true })
    expect(parseActivity('<20')).toMatchObject({ interpolatable: true, lo: 0, hi: 20, mid: 10 })
    expect(parseActivity('(20)')).toMatchObject({ interpolatable: true, mid: 20 })
    expect(parseActivity('100 (+SAM)')).toMatchObject({ interpolatable: true, mid: 100, additives: ['sam'] })
    expect(parseActivity(100)).toMatchObject({ interpolatable: true, mid: 100 })
  })
})

describe('published compositions', () => {
  it('marks ROSE / Jena UB / EURx ONE / Sau3AI proprietary and USB F absent', () => {
    expect(compositionFor('sibenzyme', 'rose')?.proprietary).toBe(true)
    expect(compositionFor('jena', 'ub')?.proprietary).toBe(true)
    expect(compositionFor('eurx', 'one')?.proprietary).toBe(true)
    expect(compositionFor('eurx', 'sau3AI')?.proprietary).toBe(true)
    expect(compositionFor('usb', 'f')?.known).toBe(false)
    expect(compositionFor('roche', 'b')?.mg_mM).toBe(5)
    expect(compositionFor('thermo', 'tango')?.anion).toBe('acetate')
    expect(compositionFor('vivantis', 'ub')?.compositionSource).toBe('medium')
  })
})

describe('AanI Thermo-only, Tango-preferring, salt-sensitive', () => {
  it('uses Thermo B/G/O/R/Tango as native points and infers foreign salt windows', () => {
    const enzyme = enzymeNamed('AanI')
    expect(enzyme.manufacturers.map((entry) => entry.id)).toEqual(['thermo'])
    const thermo = enzyme.manufacturers[0]!
    expect(thermo.preferredBuffer).toBe('tango')
    expect(nativeObservedPoints(thermo).length).toBeGreaterThanOrEqual(5)

    const r11 = inferred('AanI', 'thermo', 'neb', 'r1.1')
    expect(r11.inferredLo).toBeGreaterThanOrEqual(40)
    expect(r11.inferredHi).toBeGreaterThanOrEqual(80)
    expect(r11.confidence).not.toBe('none')

    const r31 = inferred('AanI', 'thermo', 'neb', 'r3.1')
    expect(r31.inferredHi).toBeLessThanOrEqual(30)

    const cutSmart = inferred('AanI', 'thermo', 'neb', 'cutSmart')
    expect(cutSmart.inferredHi).toBeGreaterThanOrEqual(80)
    expect(cutSmart.rationale.toLowerCase()).toMatch(/acetate/)

    const rose = sourceOf('AanI', 'thermo').skipped.find((item) => item.targetVendor === 'sibenzyme')
    expect(rose?.confidence).toBe('none')
    expect(rose?.rationale).toMatch(/ROSE/i)

    expect(sourceOf('AanI', 'thermo').inferred.some((item) => item.targetVendor === 'thermo' && item.buffer === 'tango')).toBe(
      false,
    )
  })
})

describe('AarI oligo-dependent Thermo chart', () => {
  it('does not claim 100% in a generic foreign buffer', () => {
    const enzyme = enzymeNamed('AarI')
    const thermo = enzyme.manufacturers.find((entry) => entry.id === 'thermo')!
    expect(profileNeedsAdditive(thermo)).toContain('oligo')
    const neb = inferred('AarI', 'thermo', 'neb', 'r2.1')
    expect(neb.needsAdditive).toBe(true)
    expect(neb.inferredHi).toBeLessThanOrEqual(50)
    expect(neb.confidence).toBe('low')
  })
})

describe('AatII multi-vendor overlap', () => {
  it('keeps native charts and records measured vs inferred on the other vendor', () => {
    const enzyme = enzymeNamed('AatII')
    expect(enzyme.manufacturers.some((entry) => entry.id === 'neb')).toBe(true)
    expect(enzyme.manufacturers.some((entry) => entry.id === 'thermo')).toBe(true)
    const fromThermo = inferred('AatII', 'thermo', 'neb', 'cutSmart')
    expect(fromThermo.measuredIfAny).toBeTruthy()
    const nativeNeb = enzyme.manufacturers.find((entry) => entry.id === 'neb')!.bufferActivity.cutSmart
    expect(fromThermo.measuredIfAny).toBe(String(nativeNeb))
    expect(sourceOf('AatII', 'neb').inferred.some((item) => item.targetVendor === 'neb')).toBe(false)
  })
})

describe('catalog inference', () => {
  it('covers the full enzyme list with validation stats', () => {
    const result = inferCatalog(enzymes)
    expect(result.summary.catalogEnzymes).toBe(enzymes.length)
    expect(result.summary.inferenceCount).toBeGreaterThan(1000)
    expect(result.summary.profilesWithEnoughPoints).toBeGreaterThan(100)
    expect(result.summary.proprietarySkipCount).toBeGreaterThan(0)
    expect(result.summary.validation.comparedPoints).toBeGreaterThan(100)
    expect(result.summary.validation.mae).not.toBeNull()
  })
})
