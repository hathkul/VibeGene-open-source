import { describe, expect, it } from 'vitest'
import { exportProjectJson, parseProjectJson } from '../src/domain/parsers'
import type { SequenceRecord } from '../src/domain/types'

function makeRecord(): SequenceRecord {
  return {
    id: 'rec-1',
    name: 'test',
    description: '',
    molecule: 'dna',
    topology: 'circular',
    sequence: 'ATGC',
    features: [],
    primers: [],
    operations: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

describe('project JSON display settings', () => {
  it('round-trips displaySettings through Project export/import', () => {
    const displaySettings = {
      sequenceVisual: { sequenceFontSizePx: 16, sequenceFontWeight: 500 },
      circularVisual: { outsideLabelFontSizePx: 14, enzymeFontWeight: 600 },
    }
    const json = exportProjectJson(makeRecord(), { displaySettings })
    const parsed = JSON.parse(json)
    expect(parsed.schemaVersion).toBe(6)
    expect(parsed.displaySettings.sequenceVisual.sequenceFontSizePx).toBe(16)

    const project = parseProjectJson(json)
    expect(project.displaySettings).toEqual(displaySettings)
  })

  it('rejects AlphaFold-style info.json instead of treating it as a construct', () => {
    expect(() =>
      parseProjectJson(
        JSON.stringify({
          version: 1,
          sequences: [{ protein: { id: 'A', sequence: 'MVL' } }],
        }),
      ),
    ).toThrow('Not a VibeGene construct file')
  })
})
