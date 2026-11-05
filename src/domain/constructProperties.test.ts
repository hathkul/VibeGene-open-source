import { describe, expect, it } from 'vitest'
import { themeFixturePalette } from '../test-support/themeFixturePalette'
import { defaultConstructProperties, normalizeSequenceRecord } from './constructProperties'

describe('normalizeSequenceRecord', () => {
  it('converts non-portable CSS variable primer colours to the persisted purple fallback', () => {
    const record = normalizeSequenceRecord({
      id: 'record-1',
      name: 'Example',
      description: '',
      molecule: 'dna',
      topology: 'linear',
      sequence: 'ACGT',
      features: [],
      primers: [
        { id: 'primer-1', name: 'P1', sequence: 'AC', color: 'var(--vg-data-mark)' },
        { id: 'primer-2', name: 'P2', sequence: 'GT', color: themeFixturePalette.purpleFixture },
      ],
      operations: [],
      construct: { ...defaultConstructProperties },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    expect(record.primers.map((primer) => primer.color)).toEqual([themeFixturePalette.purple, themeFixturePalette.purpleFixture])
  })
})
