import { describe, expect, it } from 'vitest'
import {
  PCR_PRODUCT_ACKNOWLEDGEMENT_BP,
  ampliconRangeForFacingPrimerSelection,
  pcrProductAcknowledgementMessage,
  requiresPcrProductAcknowledgement,
  createPcrProductRecord,
} from './pcr'
import { defaultConstructProperties } from './constructProperties'
import type { SequenceFeature, SequenceRecord } from './types'
import { themeFixturePalette } from '../test-support/themeFixturePalette'

describe('PCR long-product acknowledgement policy', () => {
  it('selects the complete amplicon, including both primer binding sites', () => {
    expect(ampliconRangeForFacingPrimerSelection('linear', 100, ['forward', 'reverse'], [
      { primerId: 'forward', strand: 'forward', start: 12, end: 30 },
      { primerId: 'reverse', strand: 'reverse', start: 70, end: 88 },
    ])).toEqual({ start: 12, end: 88 })
  })

  it('requires explicit acknowledgement for implausibly broad amplicons', () => {
    expect(requiresPcrProductAcknowledgement(45_270)).toBe(true)
    expect(pcrProductAcknowledgementMessage([45_270])).toContain(`${(45270).toLocaleString()} bp`)
  })

  it('does not block normal products and keeps long-range PCR available after acknowledgement', () => {
    expect(requiresPcrProductAcknowledgement(PCR_PRODUCT_ACKNOWLEDGEMENT_BP)).toBe(false)
    expect(pcrProductAcknowledgementMessage([500, 12_000])).toBeNull()
    expect(pcrProductAcknowledgementMessage([25_000, 30_000])).toContain('2 PCR products')
  })
})

describe('PCR product provenance and naming', () => {
  function templateWithFeature(feature: SequenceFeature): SequenceRecord {
    return {
      id: 'template', name: 'Template', description: '', molecule: 'dna', topology: 'linear',
      sequence: 'A'.repeat(100), features: [feature], primers: [], operations: [],
      construct: { ...defaultConstructProperties }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    }
  }

  it('preserves source feature identity and adjusts a clipped CDS frame', () => {
    const feature: SequenceFeature = {
      id: 'cds-source', name: 'CDS', type: 'CDS', color: themeFixturePalette.greenPrimary,
      locations: [{ start: 12, end: 30, strand: 'forward' }],
      translateInSequenceView: true,
      translation: {
        geneticCode: 'Standard', firstCodonAsMet: false, readingFrame: 2,
        consecutiveNumbering: true, segmentNumbering: [{ startAt: 1, skip: false }],
      },
    }
    const product = createPcrProductRecord({
      template: templateWithFeature(feature),
      amplicon: {
        id: 'amp', regionStart: 10, regionEnd: 90, productSize: 82, sequence: 'A'.repeat(82),
        forwardAnnealStart: 10, forwardAnnealEnd: 18, reverseAnnealStart: 84, reverseAnnealEnd: 90,
      },
      name: 'Named product.dna',
      forwardPrimer: { name: 'F', sequence: 'AAAAAAAA', phosphorylated: false },
      reversePrimer: { name: 'R', sequence: 'AAAAAA', phosphorylated: false },
      polymerase: 'blunt',
    })
    const copied = product.features[0]!
    expect(copied.sourceFeatureId).toBe('cds-source')
    expect(copied.locations[0]).toMatchObject({ start: 2, end: 20 })
    expect(copied.translation?.readingFrame).toBe(2)
    expect(copied.sourceTranslationAnchor).toBe(3)
    expect(product.name).toBe('Named product')
    expect(product.history?.name).toBe('Named product.dna')
  })
})
