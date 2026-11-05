// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import { createRestrictionCloningProductLibrary } from '../src/domain/restrictionCloningBatch'
import type { SequenceRecord } from '../src/domain/types'

vi.mock('../src/cloning/useConstructSources', () => ({
  constructSourceOptionValue: (option: { record: SequenceRecord }) => `current:${option.record.id}`,
  useConstructSources: () => ({
    groups: { current: [], open: [], recent: [], drafts: [] },
    options: [],
    refresh: vi.fn(async () => undefined),
  }),
}))

import { GibsonAssemblyDialog } from '../src/GibsonAssemblyDialog'

function record(id: string, name: string, sequence: string): SequenceRecord {
  return {
    id,
    name,
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence,
    features: [],
    primers: [],
    operations: [],
    construct: { ...defaultConstructProperties },
    createdAt: '',
    updatedAt: '',
  }
}

afterEach(() => document.body.replaceChildren())

describe('GibsonAssemblyDialog mass sources', () => {
  it('opens an existing library as a navigable mass source and enables library output', () => {
    const library = createRestrictionCloningProductLibrary([
      record('a', 'Member A', 'A'.repeat(150)),
      record('b', 'Member B', 'C'.repeat(150)),
    ], 'Input library')
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    act(() => root.render(
      <GibsonAssemblyDialog
        currentRecord={library}
        currentTabId="tab"
        onCancel={() => undefined}
        onAssemble={() => undefined}
        renderWorkspace={() => null}
      />,
    ))

    expect(container.textContent).toContain('2 inserts selected')
    expect(container.textContent).toContain('Output as library')
    expect(container.querySelector('button[aria-label="Next insert"]')).not.toBeNull()
    act(() => root.unmount())
  })
})
