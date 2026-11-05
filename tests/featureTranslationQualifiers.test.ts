import { describe, expect, it } from 'vitest'
import {
  featureFromEditor,
  featureEditorFromFeature,
  parseFeatureQualifiers,
  syncFeatureTranslationNotes,
  syncTranslationQualifiers,
} from '../src/domain/featureQualifiers'
import { defaultFeatureTranslationOptions } from '../src/domain/geneticCode'
import { exportGenBank } from '../src/domain/parsers'
import type { SequenceFeature, SequenceRecord } from '../src/domain/types'

const atgFeature: SequenceFeature = {
  id: 'cds-1',
  name: 'demo CDS',
  type: 'CDS',
  color: '#993366',
  notes: '/product="demo"',
  translateInSequenceView: true,
  translation: defaultFeatureTranslationOptions(1),
  locations: [{ start: 0, end: 9, strand: 'forward' }],
}

describe('translation qualifier sync', () => {
  it('writes /translation when a feature is translated', () => {
    const synced = syncFeatureTranslationNotes(atgFeature, 'ATGCATTAG', 'linear')
    const qualifiers = parseFeatureQualifiers(synced.notes)
    expect(qualifiers.product).toBe('demo')
    expect(qualifiers.translation).toBe('MH*')
    expect(qualifiers.transl_table).toBe('1')
    expect(qualifiers.codon_start).toBe('1')
  })

  it('clears /translation when translation is turned off', () => {
    const withTranslation = syncFeatureTranslationNotes(atgFeature, 'ATGCATTAG', 'linear')
    const cleared = syncFeatureTranslationNotes(
      { ...withTranslation, translateInSequenceView: false, translation: undefined },
      'ATGCATTAG',
      'linear',
    )
    const qualifiers = parseFeatureQualifiers(cleared.notes)
    expect(qualifiers.translation).toBeUndefined()
    expect(qualifiers.product).toBe('demo')
  })

  it('stores translation on featureFromEditor save', () => {
    const draft = featureEditorFromFeature(atgFeature, 'ATGGCGTAA', 'linear')
    draft.translateInSequenceView = true
    const patch = featureFromEditor(draft, 'ATGGCGTAA', 'linear')
    expect(parseFeatureQualifiers(patch.notes).translation).toBe('MA*')
  })

  it('emits /translation on GenBank export for translated CDS', () => {
    const record = {
      id: 'rec-1',
      name: 'demo',
      description: '',
      molecule: 'dna' as const,
      topology: 'linear' as const,
      sequence: 'ATGCATTAG',
      features: [syncFeatureTranslationNotes(atgFeature, 'ATGCATTAG', 'linear')],
      primers: [],
      operations: [],
      createdAt: '',
      updatedAt: '',
    } as SequenceRecord
    const gbk = exportGenBank(record)
    expect(gbk).toContain('/translation="MH*"')
    expect(gbk).toContain('/transl_table="1"')
  })

  it('syncTranslationQualifiers leaves unrelated keys intact', () => {
    const next = syncTranslationQualifiers(
      { product: 'GFP', note: 'synthetic' },
      atgFeature,
      'ATGCATTAG',
      'linear',
    )
    expect(next.product).toBe('GFP')
    expect(next.note).toBe('synthetic')
    expect(next.translation).toBe('MH*')
  })
})
