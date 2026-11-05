// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import { createRestrictionCloningProductLibrary } from '../src/domain/restrictionCloningBatch'
import type { SequenceRecord } from '../src/domain/types'

vi.mock('../src/cloning/useConstructSources', () => ({
  constructSourceOptionValue: (option: { record: SequenceRecord }) => `current:${option.record.id}`,
  groupConstructSourceOptions: () => ({ current: [], open: [], recent: [], drafts: [] }),
  useConstructSources: () => ({ options: [], refresh: vi.fn(async () => undefined) }),
}))

import { GatewayCloningDialog } from '../src/GatewayCloningDialog'

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

describe('GatewayCloningDialog mass sources', () => {
  it('opens a DNA library as a navigable BP insert batch with library output', () => {
    const library = createRestrictionCloningProductLibrary([
      record('a', 'Member A', 'ACGT'.repeat(40)),
      record('b', 'Member B', 'TGCA'.repeat(40)),
    ], 'Gateway inputs')
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    act(() => root.render(
      <GatewayCloningDialog
        currentRecord={library}
        currentTabId="tab"
        cloningMethod="bp"
        onCancel={() => undefined}
        onClone={() => undefined}
        renderWorkspace={() => null}
      />,
    ))

    expect(container.textContent).toContain('2 inserts selected')
    expect(container.textContent).toContain('Output as library')
    expect(container.querySelector('button[aria-label="Next insert"]')).not.toBeNull()
    act(() => root.unmount())
  })
})
