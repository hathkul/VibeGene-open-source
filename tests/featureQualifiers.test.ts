import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  featureEditorFromNewSelection,
  featureQualifierValues,
  parseFeatureQualifiers,
  serializeFeatureQualifiers,
} from '../src/domain/featureQualifiers'
import { parseSnapGene } from '../src/domain/parsers'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('featureEditorFromNewSelection', () => {
  it('creates a CDS draft from a sequence range', () => {
    const draft = featureEditorFromNewSelection('feature-1', 12, 48)
    expect(draft.name).toBe('new feature')
    expect(draft.type).toBe('CDS')
    expect(draft.segments).toEqual([
      {
        start: 12,
        end: 48,
        strand: 'forward',
        color: '#993366',
        name: 'new feature',
      },
    ])
  })
})

describe('parseFeatureQualifiers / serializeFeatureQualifiers', () => {
  it('keeps HTML with quoted links and slash characters inside one qualifier', () => {
    const html = '<html><body><b>packaging </b><a href="https://vibe-gene.com/a">signal</a><i>virus</i></body></html>'
    expect(parseFeatureQualifiers(`note: ${html} gene: HIV`)).toEqual({ note: html, gene: 'HIV' })
    expect(parseFeatureQualifiers(`/note="${html}" /gene="HIV"`)).toEqual({ note: html, gene: 'HIV' })
    const saved = serializeFeatureQualifiers({ note: html, gene: 'HIV' })
    expect(parseFeatureQualifiers(saved).note).toContain("href='https://vibe-gene.com/a'")
    expect(parseFeatureQualifiers(saved).note).toContain('<i>virus</i>')
  })
  it('preserves repeated GenBank /db_xref qualifiers', () => {
    const notes =
      '/gene="VLDLR" /db_xref="GeneID:7436" /db_xref="HGNC:HGNC:12698" /db_xref="MIM:192977"'
    const parsed = parseFeatureQualifiers(notes)
    expect(featureQualifierValues(parsed.db_xref)).toEqual([
      'GeneID:7436',
      'HGNC:HGNC:12698',
      'MIM:192977',
    ])
  })

  it('does not treat GeneID inside quoted GenBank values as a separate key', () => {
    const notes = '/db_xref="GeneID:7436" /gene="VLDLR"'
    const parsed = parseFeatureQualifiers(notes)
    expect(parsed.GeneID).toBeUndefined()
    expect(featureQualifierValues(parsed.db_xref)).toEqual(['GeneID:7436'])
  })

  it('serializes newline-joined values as repeated /key= entries', () => {
    const serialized = serializeFeatureQualifiers({
      db_xref: 'GeneID:7436\nHGNC:HGNC:12698',
    })
    expect(serialized).toBe('/db_xref="GeneID:7436" /db_xref="HGNC:HGNC:12698"')
  })

  it('accumulates repeated SnapGene-style db_xref keys', () => {
    const notes = 'db_xref: GeneID:3949 db_xref: HGNC:6547 gene: LDLR'
    const parsed = parseFeatureQualifiers(notes)
    expect(featureQualifierValues(parsed.db_xref)).toEqual(['GeneID:3949', 'HGNC:6547'])
    expect(parsed.gene).toBe('LDLR')
  })
})

describe('SnapGene native db_xref import', () => {
  // @vitest-environment jsdom
  beforeAll(async () => {
    const { initSnapGeneLzma } = await import('../src/domain/snapgeneLzma')
    await initSnapGeneLzma()
  })

  it('combines db_xref predef and text as DB:rest', () => {
    const bytes = readFileSync(join(repoRoot, 'tests/fixtures/LDLR.dna'))
    const record = parseSnapGene(bytes, 'LDLR.dna')
    const ldlr = record.features.find((feature) => (
      feature.type.toLowerCase() === 'gene' && feature.name === 'LDLR'
    ))
    expect(ldlr).toBeDefined()
    expect(featureQualifierValues(parseFeatureQualifiers(ldlr!.notes).db_xref)).toContain('GeneID:3949')
  })
})
