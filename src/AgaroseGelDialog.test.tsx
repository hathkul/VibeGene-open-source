import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AgaroseGelDialog } from './AgaroseGelDialog'
import { defaultConstructProperties } from './domain/constructProperties'
import type { SequenceRecord } from './domain/types'

function dnaRecord(id: string, name: string): SequenceRecord {
  return {
    id,
    name,
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence: 'GAATTCAAAAAAGGATCC',
    features: [],
    primers: [],
    operations: [],
    construct: { ...defaultConstructProperties },
    createdAt: '2026-10-05T00:00:00.000Z',
    updatedAt: '2026-10-05T00:00:00.000Z',
  }
}

describe('AgaroseGelDialog source picker', () => {
  it('keeps a history-derived source and digest in the compact construct dropdown', () => {
    const historySource = dnaRecord('history-parent', 'vector')
    const markup = renderToStaticMarkup(
      <AgaroseGelDialog
        currentRecord={historySource}
        currentTabId="tab-product"
        currentSourceLabel="vector · history source"
        initialSamples={[{
          label: 'vector · history source',
          record: historySource,
          enzymeNames: ['EcoRI', 'BamHI'],
        }]}
        onClose={() => undefined}
        renderWorkspace={() => <div />}
      />,
    )

    expect(markup).toContain('aria-label="Lane construct"')
    expect(markup).toContain('vector · history source')
    expect(markup).toContain('EcoRI')
    expect(markup).toContain('BamHI')
    expect(markup).not.toContain('Search available constructs')
  })
})
