// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HistoryTreePane } from '../src/components/HistoryTreePane'
import type { HistoryNode } from '../src/domain/types'

const probe = vi.hoisted(() => ({
  moduleLoads: 0,
  lastProps: null as Record<string, unknown> | null,
}))

vi.mock('../src/PcrRecipeDialog', () => {
  probe.moduleLoads += 1
  return {
    PcrRecipeDialog: (props: Record<string, unknown>) => {
      probe.lastProps = props
      return <div role="dialog" data-testid="pcr-recipe-dialog" />
    },
  }
})

function pcrHistory(): HistoryNode {
  const parent: HistoryNode = {
    id: 'template',
    name: 'Template.dna',
    seqLen: 400,
    circular: true,
    operation: 'invalid',
    resurrectable: true,
    hideHistory: false,
    oligos: [],
    regeneratedSites: [],
    inputSummaries: [],
    features: [],
    sequence: 'A'.repeat(400),
    children: [],
  }
  return {
    id: 'pcr',
    name: 'Amplicon.dna',
    seqLen: 280,
    circular: false,
    operation: 'amplifyFragment',
    resurrectable: false,
    hideHistory: false,
    polymerase: 'Creates blunt ends',
    oligos: [
      { name: 'Fwd', sequence: 'AAACCCGGGTTTAAACCCGGGTTT' },
      { name: 'Rev', sequence: 'ATGATGATGATGATGATGATGA' },
    ],
    regeneratedSites: [],
    inputSummaries: [{ manipulation: 'amplify', name1: 'Fwd', name2: 'Rev', val1: '1', val2: '280' }],
    features: [],
    sequence: 'A'.repeat(280),
    children: [parent],
  }
}

describe('HistoryTreePane lazy PCR recipe dialog', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('does not load the recipe dialog until a PCR history node is opened, then passes the recipe through', async () => {
    act(() => {
      root.render(
        <HistoryTreePane
          root={pcrHistory()}
          onOpenConstruct={vi.fn()}
          onInspectPrimer={vi.fn()}
          onInspectEnzyme={vi.fn()}
        />,
      )
    })
    expect(probe.moduleLoads).toBe(0)

    const label = [...host.querySelectorAll('.hop-label')]
      .find((el) => el.textContent === 'PCR amplification') as HTMLButtonElement
    act(() => {
      label.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Loading…')

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(probe.moduleLoads).toBe(1)
    expect(host.querySelector('[data-testid="pcr-recipe-dialog"]')).toBeTruthy()
    expect(probe.lastProps!.recipe).toBeTruthy()

    act(() => {
      ;(probe.lastProps!.onClose as () => void)()
    })
    expect(host.querySelector('[data-testid="pcr-recipe-dialog"]')).toBeNull()
  })
})
