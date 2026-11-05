import { describe, expect, it } from 'vitest'
import { parseFeatureQualifiers } from '../src/domain/featureQualifiers'
import { defaultFeatureTranslationOptions } from '../src/domain/geneticCode'
import type { SequenceFeature, SequenceRecord } from '../src/domain/types'
import { templateFromRecordFeature } from '../src/storage/userCommonFeatures'

function makeRecord(sequence: string, features: SequenceFeature[]): SequenceRecord {
  return {
    id: 'rec-1',
    name: 'test.dna',
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence,
    features,
    primers: [],
    operations: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

describe('templateFromRecordFeature', () => {
  it('adds /product when exporting a translated CDS without one', () => {
    const feature: SequenceFeature = {
      id: 'cds-1',
      name: 'HisTag',
      type: 'CDS',
      color: '#993366',
      notes: '',
      translateInSequenceView: true,
      translation: defaultFeatureTranslationOptions(1),
      locations: [{ start: 0, end: 9, strand: 'forward' }],
    }
    const template = templateFromRecordFeature(makeRecord('ATGCATCAT', [feature]), feature)
    expect(template).not.toBeNull()
    expect(template!.translateInSequenceView).toBe(true)
    expect(template!.qualifiers.some((entry) => entry.name === 'product' && entry.value === 'HisTag')).toBe(
      true,
    )
    const parsed = parseFeatureQualifiers(template!.notes)
    expect(parsed.product).toBe('HisTag')
    expect(parsed.translation).toBeTruthy()
  })

  it('keeps an existing /product when exporting a translated CDS', () => {
    const feature: SequenceFeature = {
      id: 'cds-2',
      name: 'GFP',
      type: 'CDS',
      color: '#993366',
      notes: '/product="green fluorescent protein"',
      translateInSequenceView: true,
      translation: defaultFeatureTranslationOptions(1),
      locations: [{ start: 0, end: 9, strand: 'forward' }],
    }
    const template = templateFromRecordFeature(makeRecord('ATGGCGTAA', [feature]), feature)
    expect(parseFeatureQualifiers(template!.notes).product).toBe('green fluorescent protein')
  })

  it('does not invent /product for non-translated features', () => {
    const feature: SequenceFeature = {
      id: 'prom-1',
      name: 'T7',
      type: 'promoter',
      color: '#336699',
      notes: '/note="T7 promoter"',
      locations: [{ start: 0, end: 6, strand: 'forward' }],
    }
    const template = templateFromRecordFeature(makeRecord('TAATAC', [feature]), feature)
    expect(template!.qualifiers.some((entry) => entry.name === 'product')).toBe(false)
    expect(parseFeatureQualifiers(template!.notes).product).toBeUndefined()
  })

  it('rejects features shorter than 5 bp', () => {
    const feature: SequenceFeature = {
      id: 'short-1',
      name: 'K->Q',
      type: 'CDS',
      color: '#993366',
      notes: '',
      locations: [{ start: 0, end: 3, strand: 'forward' }],
    }
    expect(templateFromRecordFeature(makeRecord('AAA', [feature]), feature)).toBeNull()
    const fourBp: SequenceFeature = {
      ...feature,
      id: 'short-2',
      locations: [{ start: 0, end: 4, strand: 'forward' }],
    }
    expect(templateFromRecordFeature(makeRecord('AAAA', [fourBp]), fourBp)).toBeNull()
    const fiveBp: SequenceFeature = {
      ...feature,
      id: 'ok-1',
      locations: [{ start: 0, end: 5, strand: 'forward' }],
    }
    expect(templateFromRecordFeature(makeRecord('AAAAA', [fiveBp]), fiveBp)).not.toBeNull()
  })
})
