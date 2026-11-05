import { describe, expect, it } from 'vitest'
import { alignTraceToTemplate } from '../src/domain/traceAlignment'
import { buildMergedInsertionLayout } from '../src/domain/traceDisplay'
import { enzymes, findRestrictionSites } from '../src/domain/enzymes'
import {
  buildTraceDerivedRestrictionSites,
  buildTraceDerivedTemplateSequence,
  buildTraceDerivedTranslationByFeatureId,
  filterRestrictionSitesToAlignmentSpan,
  traceAnnotationSlotVisible,
} from '../src/domain/traceAnnotationView'
import { computeFeatureTranslationCells } from '../src/domain/geneticCode'
import { cloneFixture } from '../src/domain/fixtures'

describe('trace annotation context', () => {
  it('uses trace bases in the derived template sequence', () => {
    const template = 'AAAGAATTCAAA'
    const trace = 'AAACAATTCAAA'
    const alignment = alignTraceToTemplate(trace, template)
    expect(alignment).not.toBeNull()
    const derived = buildTraceDerivedTemplateSequence(template, alignment!, trace.split(''))
    expect(derived).toContain('C')
    expect(derived).not.toBe(template)
  })

  it('drops restriction sites disrupted by trace mutations within the alignment span', () => {
    const template = 'GAATTC'
    const trace = 'GAAGTC'
    const alignment = alignTraceToTemplate(trace, template)
    expect(alignment).not.toBeNull()
    const mergedLayout = buildMergedInsertionLayout([alignment!], template.length)
    const record = { ...cloneFixture(), sequence: template, topology: 'linear' as const }
    const ecoRi = enzymes.filter((enzyme) => enzyme.name === 'EcoRI')
    const wildtypeSites = findRestrictionSites(template, ecoRi)
    const traceSites = buildTraceDerivedRestrictionSites(record, alignment!, trace.split(''), mergedLayout, ecoRi)
    expect(wildtypeSites.some((site) => site.enzyme.name === 'EcoRI')).toBe(true)
    expect(traceSites.some((site) => site.enzyme.name === 'EcoRI')).toBe(false)
  })

  it('keeps reference bases outside the trace alignment span in derived template sequence', () => {
    const template = 'TTTTGAATTCTTTT'
    const trace = 'GAAGTC'
    const alignment = alignTraceToTemplate(trace, template)
    expect(alignment).not.toBeNull()
    const derived = buildTraceDerivedTemplateSequence(template, alignment!, trace.split(''))
    expect(derived.startsWith('TTTT')).toBe(true)
    expect(derived.endsWith('TTTT')).toBe(true)
    expect(derived).not.toContain('NNNN')
  })

  it('limits annotation slots to the trace alignment span', () => {
    const alignment = alignTraceToTemplate('GAAGTC', 'GAATTC')!
    expect(
      traceAnnotationSlotVisible({ kind: 'template', templateIndex: 0 }, alignment),
    ).toBe(true)
    expect(
      traceAnnotationSlotVisible({ kind: 'template', templateIndex: 99 }, alignment),
    ).toBe(false)
  })

  it('filters restriction sites to the trace alignment span', () => {
    const alignment = alignTraceToTemplate('GAAGTC', 'GAATTC')!
    const sites = [
      { enzyme: enzymes[0]!, start: 0, end: 1, match: 'A', cutTop: 0, cutBottom: 0 },
      { enzyme: enzymes[0]!, start: 99, end: 100, match: 'A', cutTop: 99, cutBottom: 99 },
    ]
    const filtered = filterRestrictionSitesToAlignmentSpan(sites, alignment)
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.cutTop).toBe(0)
  })

  it('translates CDS features from trace-derived template sequence', () => {
    const template = 'ATGAAA'
    const trace = 'ATGCAA'
    const alignment = alignTraceToTemplate(trace, template)
    expect(alignment).not.toBeNull()
    const mergedLayout = buildMergedInsertionLayout([alignment!], template.length)
    const feature = {
      id: 'cds-1',
      name: 'CDS',
      type: 'CDS',
      color: '#4ade80',
      translateInSequenceView: true,
      translation: {
        geneticCode: 1,
        firstCodonAsMet: false,
        readingFrame: 1,
        consecutiveNumbering: true,
        segmentNumbering: [{ startAt: 1, skip: false }],
      },
      locations: [{ start: 0, end: 6, strand: 'forward' as const }],
    }
    const referenceTranslations = buildTraceDerivedTranslationByFeatureId(
      [feature],
      buildMergedInsertionLayout([], template.length),
      alignment!,
      template.split(''),
    )
    const traceTranslations = buildTraceDerivedTranslationByFeatureId(
      [feature],
      mergedLayout,
      alignment!,
      trace.split(''),
    )
    expect(referenceTranslations.get('cds-1')?.[1]?.aa).toBe('K')
    expect(traceTranslations.get('cds-1')?.[1]?.aa).toBe('Q')
  })

  it('shifts CDS translation across trace insertions in layout order', () => {
    const template = 'ATGAAATTT'
    const trace = 'ATGAGAAATTT'
    const alignment = {
      orientation: 'forward' as const,
      templateStart: 0,
      templateEnd: template.length,
      traceStart: 0,
      mismatchCount: 0,
      gapCount: 1,
      columns: [
        { kind: 'match' as const, templateIndex: 0, traceIndex: 0, match: true },
        { kind: 'match' as const, templateIndex: 1, traceIndex: 1, match: true },
        { kind: 'match' as const, templateIndex: 2, traceIndex: 2, match: true },
        { kind: 'match' as const, templateIndex: 3, traceIndex: 3, match: true },
        { kind: 'traceInsert' as const, traceIndex: 4 },
        { kind: 'match' as const, templateIndex: 4, traceIndex: 5, match: true },
        { kind: 'match' as const, templateIndex: 5, traceIndex: 6, match: true },
        { kind: 'match' as const, templateIndex: 6, traceIndex: 7, match: true },
        { kind: 'match' as const, templateIndex: 7, traceIndex: 8, match: true },
        { kind: 'match' as const, templateIndex: 8, traceIndex: 9, match: true },
      ],
    }
    const mergedLayout = buildMergedInsertionLayout([alignment], template.length)
    const feature = {
      id: 'cds-1',
      name: 'CDS',
      type: 'CDS',
      color: '#4ade80',
      translateInSequenceView: true,
      translation: {
        geneticCode: 1,
        firstCodonAsMet: false,
        readingFrame: 1,
        consecutiveNumbering: true,
        segmentNumbering: [{ startAt: 1, skip: false }],
      },
      locations: [{ start: 0, end: template.length, strand: 'forward' as const }],
    }
    const referenceTranslations = computeFeatureTranslationCells(feature, template, feature.translation)
    const traceTranslations = buildTraceDerivedTranslationByFeatureId(
      [feature],
      mergedLayout,
      alignment,
      trace.split(''),
    )
    expect(referenceTranslations.map((cell) => cell.aa).join('')).toBe('MKF')
    expect(traceTranslations.get('cds-1')?.map((cell) => cell.aa).join('')).toBe('MRN')
    expect(traceTranslations.get('cds-1')?.[1]?.layoutSpan).toBeDefined()
  })

  it('shifts CDS translation across trace deletions in layout order', () => {
    const template = 'ATGAAATTT'
    const trace = 'ATGATTT'
    const alignment = {
      orientation: 'forward' as const,
      templateStart: 0,
      templateEnd: template.length,
      traceStart: 0,
      mismatchCount: 0,
      gapCount: 2,
      columns: [
        { kind: 'match' as const, templateIndex: 0, traceIndex: 0, match: true },
        { kind: 'match' as const, templateIndex: 1, traceIndex: 1, match: true },
        { kind: 'match' as const, templateIndex: 2, traceIndex: 2, match: true },
        { kind: 'templateGap' as const, templateIndex: 3 },
        { kind: 'templateGap' as const, templateIndex: 4 },
        { kind: 'match' as const, templateIndex: 5, traceIndex: 3, match: true },
        { kind: 'match' as const, templateIndex: 6, traceIndex: 4, match: true },
        { kind: 'match' as const, templateIndex: 7, traceIndex: 5, match: true },
        { kind: 'match' as const, templateIndex: 8, traceIndex: 6, match: true },
      ],
    }
    const mergedLayout = buildMergedInsertionLayout([alignment], template.length)
    const feature = {
      id: 'cds-1',
      name: 'CDS',
      type: 'CDS',
      color: '#4ade80',
      translateInSequenceView: true,
      translation: {
        geneticCode: 1,
        firstCodonAsMet: false,
        readingFrame: 1,
        consecutiveNumbering: true,
        segmentNumbering: [{ startAt: 1, skip: false }],
      },
      locations: [{ start: 0, end: template.length, strand: 'forward' as const }],
    }
    const referenceTranslations = computeFeatureTranslationCells(feature, template, feature.translation)
    const traceTranslations = buildTraceDerivedTranslationByFeatureId(
      [feature],
      mergedLayout,
      alignment,
      trace.split(''),
    )
    expect(referenceTranslations.map((cell) => cell.aa).join('')).toBe('MKF')
    expect(traceTranslations.get('cds-1')?.map((cell) => cell.aa).join('')).toBe('MI')
  })
})
