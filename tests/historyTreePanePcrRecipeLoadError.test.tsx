// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HistoryTreePane } from '../src/components/HistoryTreePane'
import type { HistoryNode } from '../src/domain/types'

vi.mock('../src/PcrRecipeDialog', () => {
  throw new Error('chunk unavailable')
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

describe('HistoryTreePane PCR recipe dialog load failure', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    consoleError.mockRestore()
  })

  it('logs the failure, dismisses the recipe, and keeps the pane intact', async () => {
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
    expect(consoleError).toHaveBeenCalledWith('Could not load the PCR recipe dialog.', expect.anything())
    // The recipe state was cleared and the tree still renders.
    expect(host.querySelector('[role="status"]')).toBeNull()
    expect(host.querySelector('[role="dialog"]')).toBeNull()
    expect(host.querySelector('.hop-label')).toBeTruthy()
  })
})
