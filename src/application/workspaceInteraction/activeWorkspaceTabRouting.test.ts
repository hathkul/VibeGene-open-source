import { describe, expect, it } from 'vitest'
import { cloneFixture } from '../../domain/fixtures'
import { resolveActiveWorkspaceTabTransition } from './activeWorkspaceTabRouting'

describe('resolveActiveWorkspaceTabTransition', () => {
  it('forces Sequence for trace documents', () => {
    expect(
      resolveActiveWorkspaceTabTransition({
        activeTab: 'Map',
        record: cloneFixture(),
        traceDocument: true,
      }),
    ).toBe('Sequence')
    expect(
      resolveActiveWorkspaceTabTransition({
        activeTab: 'Sequence',
        record: cloneFixture(),
        traceDocument: true,
      }),
    ).toBeNull()
  })

  it('falls back when the active tab is unavailable for the record', () => {
    const protein = { ...cloneFixture(), molecule: 'protein' as const, dna: undefined }
    expect(
      resolveActiveWorkspaceTabTransition({
        activeTab: 'Enzymes',
        record: protein,
        traceDocument: false,
      }),
    ).toBe('Map')
  })

  it('keeps the tab when it remains available', () => {
    const dna = cloneFixture()
    expect(
      resolveActiveWorkspaceTabTransition({
        activeTab: 'Sequence',
        record: dna,
        traceDocument: false,
      }),
    ).toBeNull()
  })
})
