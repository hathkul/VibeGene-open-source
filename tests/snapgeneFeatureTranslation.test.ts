// @vitest-environment jsdom
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseSnapGene } from '../src/domain/parsers'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import {
  exportSnapGeneTranslationQualifiers,
  featureSnapGeneShowsTranslation,
  formatSnapGeneCleavageArrows,
  geneticCodeFromSnapGeneTranslTable,
  parseSnapGeneCleavageArrows,
  parseSnapGeneFeatureTranslation,
  snapGeneFeatureTranslationAttrs,
  snapGeneImportedFeatureFields,
  snapGeneSegmentTranslatedAttr,
} from '../src/domain/snapgeneFeatureTranslation'
import { exportSnapGeneFeaturesXmlNative } from '../src/domain/snapgeneNativeExport'
import type { SequenceFeature, SequenceRecord } from '../src/domain/types'

function featureXml(body: string) {
  return `<?xml version="1.0"?><Features nextValidID="1">${body}</Features>`
}

function parseFeatureXml(body: string) {
  const document = new DOMParser().parseFromString(featureXml(body), 'application/xml')
  const featureElement = document.querySelector('Feature')
  if (!featureElement) throw new Error('Missing Feature element')
  return featureElement
}

function makeRecord(sequence: string, features: SequenceFeature[]): SequenceRecord {
  return {
    id: 'record-1',
    name: 'test',
    description: 'test',
    molecule: 'dna',
    topology: 'linear',
    sequence,
    features,
    primers: [],
    construct: defaultConstructProperties,
    updatedAt: new Date().toISOString(),
  }
}

describe('snapgeneFeatureTranslation', () => {
  it('detects translated CDS segments from SnapGene XML', () => {
    const featureElement = parseFeatureXml(
      '<Feature name="VSV-G" type="CDS" directionality="1"><Segment range="1-30" type="standard" translated="1"/></Feature>',
    )
    const segments = [...featureElement.querySelectorAll('Segment')]
    expect(featureSnapGeneShowsTranslation(featureElement, segments)).toBe(true)
  })

  it('does not treat /translation or translationMW alone as Sequence-view translation', () => {
    const featureElement = parseFeatureXml(
      '<Feature name="VHH site 1" type="CDS" directionality="1" translationMW="500"><Segment range="2011-2025" type="standard"/><Q name="translation"><V text="AAAAA"/></Q></Feature>',
    )
    const segments = [...featureElement.querySelectorAll('Segment')]
    expect(featureSnapGeneShowsTranslation(featureElement, segments)).toBe(false)
    expect(snapGeneImportedFeatureFields(featureElement, 1, 'forward').translateInSequenceView).toBeUndefined()
  })

  it('parses translation options from SnapGene feature attributes', () => {
    const featureElement = parseFeatureXml(
      '<Feature name="lacI" type="CDS" directionality="2" readingFrame="-1" translateFirstCodonAsMet="1" consecutiveTranslationNumbering="1"><Segment range="1-30" type="standard" translated="1"/><Q name="transl_table"><V int="1"/></Q></Feature>',
    )
    const options = parseSnapGeneFeatureTranslation(featureElement, 1, 'reverse')
    expect(options.readingFrame).toBe(-1)
    expect(options.firstCodonAsMet).toBe(true)
    expect(options.geneticCode).toBe('Standard')
  })

  it('maps SnapGene genetic code table numbers to names', () => {
    expect(geneticCodeFromSnapGeneTranslTable(1)).toBe('Standard')
    expect(geneticCodeFromSnapGeneTranslTable(2)).toBe('Vertebrate Mitochondrial')
  })

  it('exports translated feature attrs and segment markers', () => {
    const feature: SequenceFeature = {
      id: 'feature-1',
      name: 'CDS',
      type: 'CDS',
      color: '#993366',
      translateInSequenceView: true,
      translation: {
        geneticCode: 'Standard',
        firstCodonAsMet: true,
        readingFrame: -1,
        consecutiveNumbering: true,
        segmentNumbering: [{ startAt: 17, skip: false }],
      },
      locations: [{ start: 0, end: 30, strand: 'reverse' }],
    }
    expect(snapGeneFeatureTranslationAttrs(feature)).toContain('readingFrame="-1"')
    expect(snapGeneFeatureTranslationAttrs(feature)).toContain('translateFirstCodonAsMet="1"')
    expect(snapGeneFeatureTranslationAttrs(feature)).toContain('consecutiveNumberingStartsFrom="17"')
    expect(snapGeneSegmentTranslatedAttr(feature)).toBe(' translated="1"')
    expect(exportSnapGeneTranslationQualifiers(feature, 'ATG'.repeat(10), 'linear')).toContain('<Q name="transl_table"><V int="1"/>')
  })

  it('imports and exports translation visibility through SnapGene feature XML', () => {
    const imported = snapGeneImportedFeatureFields(
      parseFeatureXml(
        '<Feature name="Reporter" type="CDS" directionality="1" translationMW="1000"><Segment range="10-40" type="standard" translated="1"/><Q name="transl_table"><V int="1"/></Q></Feature>',
      ),
      1,
      'forward',
    )
    expect(imported.translateInSequenceView).toBe(true)
    expect(imported.translation?.geneticCode).toBe('Standard')

    const record = makeRecord('A'.repeat(100), [{
      id: 'feature-1',
      name: 'Reporter',
      type: 'CDS',
      color: '#993366',
      locations: [{ start: 9, end: 40, strand: 'forward' }],
      ...imported,
    }])
    const xml = exportSnapGeneFeaturesXmlNative(record)
    expect(xml).toContain('translated="1"')
    expect(xml).toContain('<Q name="translation">')
    expect(xml).toContain('<Q name="transl_table"><V int="1"/>')
  })
})

describe('parseSnapGene CDS translation integration', () => {
  it('preserves translateInSequenceView across SnapGene feature XML round trip', () => {
    const record = makeRecord('ATG' + 'TAA' + 'A'.repeat(200), [{
      id: 'feature-1',
      name: 'Reporter',
      type: 'CDS',
      color: '#993366',
      translateInSequenceView: true,
      translation: {
        geneticCode: 'Standard',
        firstCodonAsMet: false,
        readingFrame: 1,
        consecutiveNumbering: true,
        segmentNumbering: [{ startAt: 1, skip: false }],
      },
      locations: [{ start: 0, end: 6, strand: 'forward' }],
    }])
    const xml = exportSnapGeneFeaturesXmlNative(record)
    const featureElement = new DOMParser().parseFromString(xml, 'application/xml').querySelector('Feature')
    expect(featureElement).not.toBeNull()
    const reimported = snapGeneImportedFeatureFields(featureElement!, 1, 'forward')
    expect(reimported.translateInSequenceView).toBe(true)
    expect(reimported.translation?.geneticCode).toBe('Standard')
  })
})

describe('SnapGene cleavageArrows', () => {
  it('parses and formats 1-based cleavageArrows as 0-based positions', () => {
    expect(parseSnapGeneCleavageArrows('1771')).toEqual([1770])
    expect(parseSnapGeneCleavageArrows('100,250,900')).toEqual([99, 249, 899])
    expect(formatSnapGeneCleavageArrows([1770])).toBe('1771')
    expect(formatSnapGeneCleavageArrows([99, 899, 249])).toBe('100,250,900')
  })

  it('imports and exports cleavageArrows on Feature XML', () => {
    const featureElement = parseFeatureXml(
      `<Feature recentID="1" name="LDLR" type="gene" directionality="1" cleavageArrows="1771,2000" allowSegmentOverlaps="0"><Segment range="1-100" color="#a6acb3" type="standard"/></Feature>`,
    )
    const imported = snapGeneImportedFeatureFields(featureElement, 1, 'forward')
    expect(imported.cleavageArrows).toEqual([1770, 1999])

    const record = makeRecord('A'.repeat(2200), [{
      id: 'feature-1',
      name: 'LDLR',
      type: 'gene',
      color: '#a6acb3',
      cleavageArrows: [1770, 1999],
      locations: [{ start: 0, end: 100, strand: 'forward' }],
    }])
    const xml = exportSnapGeneFeaturesXmlNative(record)
    expect(xml).toContain('cleavageArrows="1771,2000"')
  })

  it('imports and exports Feature visible="0"', () => {
    const featureElement = parseFeatureXml(
      `<Feature recentID="1" name="source" type="source" visible="0" allowSegmentOverlaps="0"><Segment range="1-100" color="#cccccc" type="standard"/></Feature>`,
    )
    const imported = snapGeneImportedFeatureFields(featureElement, 1, 'forward')
    expect(imported.visible).toBe(false)

    const record = makeRecord('A'.repeat(100), [{
      id: 'feature-1',
      name: 'source',
      type: 'source',
      color: '#cccccc',
      visible: false,
      locations: [{ start: 0, end: 100, strand: 'forward' }],
    }])
    expect(exportSnapGeneFeaturesXmlNative(record)).toContain('visible="0"')
  })

  it('exports Gateway attL/attR as separate gene/note/bound_moiety qualifiers for LR', () => {
    const record = makeRecord('A'.repeat(200), [
      {
        id: 'att-l1',
        name: 'attL1',
        type: 'protein_bind',
        color: '#31849b',
        notes:
          '/bound_moiety="LR Clonase™" /gene="mutant version of attL" /note="recombination site for the Gateway® LR reaction"',
        locations: [{ start: 10, end: 110, strand: 'forward' }],
      },
      {
        id: 'att-l2',
        name: 'attL2',
        type: 'protein_bind',
        color: '#31849b',
        notes:
          '/bound_moiety="LR Clonase™" /gene="mutant version of attL" /note="recombination site for the Gateway® LR reaction"',
        locations: [{ start: 120, end: 220, strand: 'reverse' }],
      },
    ])
    const xml = exportSnapGeneFeaturesXmlNative(record)
    // Match Addgene/SnapGene-native HTML qualifier bodies (not plain text).
    expect(xml).toContain(
      '<Q name="gene"><V text="&lt;html&gt;&lt;body&gt;mutant version of &lt;i&gt;att&lt;/i&gt;L&lt;/body&gt;&lt;/html&gt;"/></Q>',
    )
    expect(xml).toContain(
      '<Q name="note"><V text="&lt;html&gt;&lt;body&gt;recombination site for the Gateway® LR reaction&lt;/body&gt;&lt;/html&gt;"/></Q>',
    )
    expect(xml).toContain(
      '<Q name="bound_moiety"><V text="&lt;html&gt;&lt;body&gt;LR Clonase™&lt;/body&gt;&lt;/html&gt;"/></Q>',
    )
    expect(xml).not.toContain('<Q name="label"><V text="attL1"/>')
    expect(xml).not.toMatch(/<Q name="note"><V text="\/gene=/)
    // Attribute order + reverse swapped numbering match Addgene entry clones.
    expect(xml).toMatch(/name="attL1" directionality="1" type="protein_bind"/)
    expect(xml).toMatch(/name="attL2" directionality="2" type="protein_bind" swappedSegmentNumbering="1"/)
    expect(xml).not.toMatch(/name="attL2"[^>]*readingFrame=/)
  })

  it('loads cleavageArrows from LDLR.dna when available', () => {
    const ldlrPath = join(process.cwd(), 'tests/fixtures/LDLR.dna')
    if (!existsSync(ldlrPath)) return
    const bytes = readFileSync(ldlrPath)
    const record = parseSnapGene(bytes, 'LDLR.dna', { skipTraces: true })
    const gene = record.features.find((feature) => feature.type === 'gene' && feature.name === 'LDLR')
    const cds = record.features.find((feature) => feature.type === 'CDS' && feature.name === 'LDLR')
    expect(gene?.cleavageArrows).toEqual([1770])
    expect(cds?.cleavageArrows).toEqual([1877])
  })
})
