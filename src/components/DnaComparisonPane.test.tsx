// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DnaComparisonPane } from './DnaComparisonPane'
import { alignDnaComparisonSource } from '../domain/dnaComparisonAlignment'
import { themeFixturePalette } from '../test-support/themeFixturePalette'

class TestResizeObserver {
  observe() {}
  disconnect() {}
}

describe('DnaComparisonPane', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('renders comparative mode with an empty source list and reference annotations', () => {
    vi.stubGlobal('ResizeObserver', TestResizeObserver)
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => {
      root.render(
        <DnaComparisonPane
          recordName="Reference"
          reference="ATGC"
          sources={[]}
          entries={[]}
          pending={false}
          annotationFeatures={[{
            id: 'feature-1', name: 'feature', type: 'misc_feature', color: themeFixturePalette.greenBright,
            locations: [{ start: 1, end: 3, strand: 'forward' }],
          }]}
          onSourcesChange={() => undefined}
          onStatus={() => undefined}
        />,
      )
    })
    expect(host.querySelector('.sequence-minimap')).not.toBeNull()
    expect(host.querySelector('.protein-comparison-empty')).not.toBeNull()
    act(() => root.unmount())
  })

  it('renders reference annotations as named feature segments instead of painted base cells', () => {
    vi.stubGlobal('ResizeObserver', TestResizeObserver)
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => {
      root.render(
        <DnaComparisonPane
          recordName="Reference"
          reference="ATGCATGC"
          sources={[{ id: 'source-1', name: 'Source', sequence: 'ATGCATGC', enabled: true }]}
          entries={[{
            source: { id: 'source-1', name: 'Source', sequence: 'ATGCATGC', enabled: true },
            alignment: { ...alignDnaComparisonSource('ATGCATGC', { id: 'source-1', name: 'Source', sequence: 'ATGCATGC', enabled: true }, 'linear')!, sourceId: 'source-1', identityCount: 8 },
            pending: false,
          }]}
          pending={false}
          annotationFeatures={[{
            id: 'feature-1', name: 'Promoter', type: 'misc_feature', color: themeFixturePalette.greenBright,
            locations: [{ start: 1, end: 6, strand: 'forward' }],
          }]}
          onSourcesChange={() => undefined}
          onStatus={() => undefined}
        />,
      )
    })
    expect(host.querySelector('.dna-comparison-annotation-track')).not.toBeNull()
    expect(host.querySelector('.dna-comparison-annotation-segment')?.textContent).toBe('Promoter')
    expect(host.querySelector('.dna-comparison-annotation-row .protein-comparison-cell')).toBeNull()
    act(() => root.unmount())
  })
})
