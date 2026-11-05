import { describe, expect, it } from 'vitest'
import { exportFeatureDataTsv, formatFeatureExportRow } from '../src/domain/featureExport'
import type { SequenceFeature } from '../src/domain/types'

const feature: SequenceFeature = {
  id: 'f1',
  name: 'LDLR',
  type: 'CDS',
  color: '#a6acb3',
  locations: [{ start: 86, end: 2669, strand: 'forward' }],
}

describe('feature export TSV', () => {
  it('matches SnapGene-style columns for full export', () => {
    expect(
      formatFeatureExportRow(feature, 5000, ['name', 'location', 'size', 'directionality', 'type']),
    ).toBe('LDLR\t87..2669\t2583\t=>\tCDS')
  })

  it('exports only requested fields', () => {
    expect(exportFeatureDataTsv([feature], 5000, ['name', 'location'])).toBe('LDLR\t87..2669')
  })
})
