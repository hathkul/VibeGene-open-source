/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import {
  preferredDefaultWorkspaceTab,
  retainedOrDefaultWorkspaceTab,
  sequenceLikelyFitsSequencePaneViewport,
} from '../src/domain/moleculeCapabilities'

describe('sequenceLikelyFitsSequencePaneViewport', () => {
  it('treats empty and short oligos as fitting a typical desktop viewport', () => {
    expect(sequenceLikelyFitsSequencePaneViewport(0)).toBe(true)
    expect(
      sequenceLikelyFitsSequencePaneViewport(60, { viewportWidth: 1440, viewportHeight: 900 }),
    ).toBe(true)
  })

  it('rejects long plasmids that need Sequence scrolling', () => {
    expect(
      sequenceLikelyFitsSequencePaneViewport(5000, { viewportWidth: 1440, viewportHeight: 900 }),
    ).toBe(false)
  })
})

describe('preferredDefaultWorkspaceTab', () => {
  it('opens featureless viewport-fitting DNA to Sequence', () => {
    expect(
      preferredDefaultWorkspaceTab({
        molecule: 'dna',
        sequence: 'ATGC'.repeat(20),
        features: [],
      }),
    ).toBe('Sequence')
  })

  it('keeps Map when the construct has features', () => {
    expect(
      preferredDefaultWorkspaceTab({
        molecule: 'dna',
        sequence: 'ATGC'.repeat(20),
        features: [{ id: 'f1' }],
      }),
    ).toBe('Map')
  })

  it('keeps Map for long featureless DNA', () => {
    expect(
      preferredDefaultWorkspaceTab({
        molecule: 'dna',
        sequence: 'A'.repeat(5000),
        features: [],
      }),
    ).toBe('Map')
  })

  it('still prefers Sequence for DNA libraries', () => {
    expect(
      preferredDefaultWorkspaceTab({
        molecule: 'dna',
        dna: { documentRole: 'library' },
        sequence: 'A'.repeat(5000),
        features: [{ id: 'f1' }],
      }),
    ).toBe('Sequence')
  })
})

describe('retainedOrDefaultWorkspaceTab', () => {
  it('keeps the current pane when the new molecule supports it', () => {
    expect(
      retainedOrDefaultWorkspaceTab('Sequence', { molecule: 'dna', sequence: 'A'.repeat(5000), features: [] }),
    ).toBe('Sequence')
    expect(
      retainedOrDefaultWorkspaceTab('Features', { molecule: 'protein', sequence: 'M', features: [] }),
    ).toBe('Features')
  })

  it('falls back to Sequence for short featureless DNA when the pane is unavailable', () => {
    expect(
      retainedOrDefaultWorkspaceTab('Primers', {
        molecule: 'protein',
        sequence: 'ACDEFGHIKLMNPQRSTVWY',
        features: [],
      }),
    ).toBe('Sequence')
    expect(
      retainedOrDefaultWorkspaceTab('Map', { molecule: 'rna', sequence: 'AUGC', features: [] }),
    ).toBe('Sequence')
  })

  it('prefers Sequence when falling back for DNA libraries', () => {
    expect(
      retainedOrDefaultWorkspaceTab('Properties', {
        molecule: 'dna',
        dna: { documentRole: 'library' },
        sequence: 'A',
        features: [],
      }),
    ).toBe('Sequence')
    expect(
      retainedOrDefaultWorkspaceTab('Members', {
        molecule: 'dna',
        dna: { documentRole: 'library' },
        sequence: 'A',
        features: [],
      }),
    ).toBe('Members')
  })
})
