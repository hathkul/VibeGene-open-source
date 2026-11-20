import { describe, expect, it } from 'vitest'
import { browserDocumentTitle } from './browserDocumentTitle'

describe('browserDocumentTitle', () => {
  it('uses product copy for the default demo only in the browser', () => {
    expect(browserDocumentTitle('VibeGene-pDemo', false)).toBe('VibeGene — DNA Editing, Cloning & Sequence Analysis')
    expect(browserDocumentTitle('VibeGene-pDemo', true)).toBe('VibeGene-pDemo')
  })

  it('preserves titles for other documents in browser and native windows', () => {
    expect(browserDocumentTitle('My plasmid', false)).toBe('My plasmid')
    expect(browserDocumentTitle('My plasmid', true)).toBe('My plasmid')
  })
})
