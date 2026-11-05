// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { HistoryTreePane } from '../src/components/HistoryTreePane'
import {
  DEFAULT_VISIBLE_HISTORY_GENERATIONS,
  expandNextHistoryGenerations,
  initialCollapsedHistoryIds,
} from '../src/domain/historyTreeExpansion'
import { historyMinimapScrollPosition } from '../src/domain/historyMinimap'
import type { HistoryNode } from '../src/domain/types'

function node(id: string, children: HistoryNode[] = [], hideHistory = false): HistoryNode {
  return {
    id,
    name: `${id}.dna`,
    seqLen: 4,
    circular: false,
    operation: children.length ? 'assemble' : 'invalid',
    resurrectable: children.length === 0,
    hideHistory,
    oligos: [],
    regeneratedSites: [],
    inputSummaries: [],
    features: [],
    sequence: 'ATGC',
    children,
  }
}

function chain() {
  return node('root', [node('parent', [node('grandparent', [node('great-grandparent')])])], true)
}

function longChain(generations: number) {
  let current = node(`generation-${generations}`)
  for (let depth = generations - 1; depth >= 0; depth -= 1) {
    current = node(depth === 0 ? 'root' : `generation-${depth}`, [current])
  }
  return current
}

let reactRoot: ReturnType<typeof createRoot> | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  if (reactRoot) act(() => reactRoot!.unmount())
  container?.remove()
  reactRoot = null
  container = null
})

describe('HistoryTreePane generation expansion', () => {
  it('initially exposes five parent generations and preserves deeper expansion frontiers', () => {
    const root = longChain(8)
    const collapsed = initialCollapsedHistoryIds(root)

    expect(DEFAULT_VISIBLE_HISTORY_GENERATIONS).toBe(5)
    expect(collapsed.has('generation-4')).toBe(false)
    expect(collapsed.has('generation-5')).toBe(true)
    expect(collapsed.has('generation-6')).toBe(true)

    const expanded = expandNextHistoryGenerations(root, collapsed, 2)
    expect(expanded.has('generation-5')).toBe(false)
    expect(expanded.has('generation-6')).toBe(false)
    expect(expanded.has('generation-7')).toBe(true)
  })

  it('renders only five parent generations before the user expands the tree', () => {
    container = document.createElement('div')
    document.body.append(container)
    reactRoot = createRoot(container)
    act(() => {
      reactRoot!.render(
        <HistoryTreePane
          root={longChain(8)}
          onOpenConstruct={() => undefined}
          onInspectPrimer={() => undefined}
          onInspectEnzyme={() => undefined}
        />,
      )
    })

    expect(container.textContent).toContain('generation-5.dna')
    expect(container.textContent).not.toContain('generation-6.dna')
    expect(container.querySelectorAll('[data-history-node-id]')).toHaveLength(6)

    const collapse = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Collapse')!
    const expandNext = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Expand next'))!
    expect(collapse.disabled).toBe(true)
    act(() => expandNext.click())
    expect(container.textContent).toContain('generation-6.dna')
    expect(container.textContent).not.toContain('generation-7.dna')
    expect(collapse.disabled).toBe(false)

    act(() => collapse.click())
    expect(container.textContent).toContain('generation-5.dna')
    expect(container.textContent).not.toContain('generation-6.dna')
    expect(container.querySelectorAll('[data-history-node-id]')).toHaveLength(6)
    expect(collapse.disabled).toBe(true)
  })

  it('reveals only the requested number of generations below a collapsed frontier', () => {
    const root = chain()
    const expanded = expandNextHistoryGenerations(root, new Set(['root']), 2)

    expect(expanded.has('root')).toBe(false)
    expect(expanded.has('parent')).toBe(false)
    expect(expanded.has('grandparent')).toBe(true)
  })

  it('maps minimap dragging to clamped two-axis history scrolling', () => {
    expect(historyMinimapScrollPosition({
      pointerX: 160,
      pointerY: 90,
      contentOffsetX: 10,
      contentOffsetY: 5,
      scale: 0.5,
      dragOffsetX: 40,
      dragOffsetY: 30,
      contentWidth: 1000,
      contentHeight: 500,
      viewportWidth: 300,
      viewportHeight: 200,
    })).toEqual({ left: 260, top: 140 })

    expect(historyMinimapScrollPosition({
      pointerX: 1000,
      pointerY: 1000,
      contentOffsetX: 0,
      contentOffsetY: 0,
      scale: 1,
      dragOffsetX: 0,
      dragOffsetY: 0,
      contentWidth: 1000,
      contentHeight: 500,
      viewportWidth: 300,
      viewportHeight: 200,
    })).toEqual({ left: 700, top: 300 })
  })

  it('offers an Expand next control that advances from the currently visible depth', () => {
    container = document.createElement('div')
    document.body.append(container)
    reactRoot = createRoot(container)
    act(() => {
      reactRoot!.render(
        <HistoryTreePane
          root={chain()}
          onOpenConstruct={() => undefined}
          onInspectPrimer={() => undefined}
          onInspectEnzyme={() => undefined}
        />,
      )
    })

    expect(container.textContent).toContain('root.dna')
    expect(container.textContent).not.toContain('parent.dna')
    expect(container.querySelector('svg[aria-label="History minimap"]')).not.toBeNull()
    expect(container.querySelectorAll('.history-tree-minimap-node')).toHaveLength(1)
    expect(container.querySelector('.history-tree-minimap-viewport')).not.toBeNull()
    const input = container.querySelector(
      'input[aria-label="Extra history generations"]',
    ) as HTMLInputElement
    const expandNext = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Expand next'))!

    act(() => expandNext.click())
    expect(container.textContent).toContain('parent.dna')
    expect(container.textContent).not.toContain('grandparent.dna')
    expect(container.querySelectorAll('.history-tree-minimap-node')).toHaveLength(2)

    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '2')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => expandNext.click())
    expect(container.textContent).toContain('grandparent.dna')
    expect(container.textContent).toContain('great-grandparent.dna')
    expect(container.querySelectorAll('.history-tree-minimap-node')).toHaveLength(4)
    expect(expandNext.disabled).toBe(true)
  })
})

function cloningHistory(
  inputSummaries: HistoryNode['inputSummaries'] = [
    { manipulation: 'replace', name1: 'BamHI', val1: '1001', name2: 'EcoRI', val2: '101' },
    { manipulation: 'insert', name1: 'EcoRI', val1: '1', name2: 'BamHI', val2: '801' },
  ],
): HistoryNode {
  const parent = (id: string, name: string, seqLen: number, circular: boolean): HistoryNode => ({
    id,
    name,
    seqLen,
    circular,
    operation: 'invalid',
    resurrectable: true,
    hideHistory: false,
    oligos: [],
    regeneratedSites: [],
    inputSummaries: [],
    features: [],
    sequence: 'A'.repeat(seqLen),
    children: [],
  })
  return {
    id: 'product',
    name: 'Cloned.dna',
    seqLen: 4200,
    circular: true,
    operation: 'insertFragment',
    resurrectable: false,
    hideHistory: false,
    oligos: [],
    regeneratedSites: [],
    inputSummaries,
    features: [],
    sequence: 'A'.repeat(4200),
    children: [
      parent('vector', 'pUC.dna', 4300, true),
      parent('insert', 'GFP.dna', 1200, false),
    ],
  }
}

describe('HistoryTreePane cloning recipe', () => {
  it('opens a ligation recipe when Insert fragment is double-clicked', () => {
    container = document.createElement('div')
    document.body.append(container)
    reactRoot = createRoot(container)
    act(() => {
      reactRoot!.render(
        <HistoryTreePane
          root={cloningHistory()}
          onOpenConstruct={() => undefined}
          onInspectPrimer={() => undefined}
          onInspectEnzyme={() => undefined}
        />,
      )
    })

    const label = [...container.querySelectorAll('.hop-label')]
      .find((el) => el.textContent === 'Insert fragment') as HTMLButtonElement
    expect(label.tagName).toBe('BUTTON')
    act(() => {
      label.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('Cloning recipe')
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
      `${(3400).toLocaleString()} bp`,
    )
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
      `${(800).toLocaleString()} bp`,
    )
  })

  it('opens a ligation recipe for unique-cutter cloning (vector insertAt, insert XbaI/NheI)', () => {
    container = document.createElement('div')
    document.body.append(container)
    reactRoot = createRoot(container)
    act(() => {
      reactRoot!.render(
        <HistoryTreePane
          root={cloningHistory([
            { manipulation: 'insertAt', name1: 'XbaI', val1: '234' },
            { manipulation: 'insert', name1: 'XbaI', val1: '1', name2: 'NheI', val2: '801' },
          ])}
          onOpenConstruct={() => undefined}
          onInspectPrimer={() => undefined}
          onInspectEnzyme={() => undefined}
        />,
      )
    })

    const label = [...container.querySelectorAll('.hop-label')]
      .find((el) => el.textContent === 'Insert fragment') as HTMLButtonElement
    expect(label.tagName).toBe('BUTTON')
    act(() => {
      label.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain('Cloning recipe')
    expect(dialog?.textContent).toContain(`${(4300).toLocaleString()} bp`)
    expect(dialog?.textContent).toContain(`${(800).toLocaleString()} bp`)
  })
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

describe('HistoryTreePane PCR recipe', () => {
  it('opens a PCR recipe when PCR amplification is double-clicked', async () => {
    container = document.createElement('div')
    document.body.append(container)
    reactRoot = createRoot(container)
    act(() => {
      reactRoot!.render(
        <HistoryTreePane
          root={pcrHistory()}
          onOpenConstruct={() => undefined}
          onInspectPrimer={() => undefined}
          onInspectEnzyme={() => undefined}
        />,
      )
    })

    const label = [...container.querySelectorAll('.hop-label')]
      .find((el) => el.textContent === 'PCR amplification') as HTMLButtonElement
    expect(label.tagName).toBe('BUTTON')
    act(() => {
      label.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    // The recipe dialog is lazy-loaded; flush the import before asserting.
    for (let i = 0; i < 50 && !container.querySelector('[role="dialog"]'); i++) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })
    }
    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain('PCR recipe')
    expect(dialog?.textContent).toContain('Initial denaturation')
    expect(dialog?.textContent).toContain('Fwd')
    expect(
      (dialog?.querySelector('input[aria-label="PCR volume (µl)"]') as HTMLInputElement | null)?.value,
    ).toBe('20')
    expect(
      (dialog?.querySelector('input[aria-label="Primer stock concentration (µM)"]') as HTMLInputElement | null)
        ?.value,
    ).toBe('10')
  })
})

describe('HistoryTreePane restriction digest gel', () => {
  it('reports the parent construct and enzymes when a restriction label is double-clicked', () => {
    container = document.createElement('div')
    document.body.append(container)
    reactRoot = createRoot(container)
    const seen: Array<{ id: string; enzymes: string[] }> = []
    act(() => {
      reactRoot!.render(
        <HistoryTreePane
          root={cloningHistory()}
          onOpenConstruct={() => undefined}
          onInspectPrimer={() => undefined}
          onInspectEnzyme={() => undefined}
          onInspectRestrictionDigest={(node, enzymeNames) => {
            seen.push({ id: node.id, enzymes: enzymeNames })
          }}
        />,
      )
    })

    const vector = container.querySelector('.hedge-parent.is-vector') as HTMLElement
    expect(vector).toBeTruthy()
    expect(vector.classList.contains('is-digest')).toBe(true)
    expect(vector.title).toContain('double-click for agarose gel')
    act(() => {
      vector.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    expect(seen).toEqual([{ id: 'vector', enzymes: ['BamHI', 'EcoRI'] }])

    const insert = container.querySelector('.hedge-parent.is-insert') as HTMLElement
    act(() => {
      insert.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    expect(seen[1]).toEqual({ id: 'insert', enzymes: ['EcoRI', 'BamHI'] })
  })

  it('opens a unique-cutter vector digest from the insertAt label', () => {
    container = document.createElement('div')
    document.body.append(container)
    reactRoot = createRoot(container)
    const seen: Array<{ id: string; enzymes: string[] }> = []
    act(() => {
      reactRoot!.render(
        <HistoryTreePane
          root={cloningHistory([
            { manipulation: 'insertAt', name1: 'XbaI', val1: '234' },
            { manipulation: 'insert', name1: 'XbaI', val1: '1', name2: 'NheI', val2: '801' },
          ])}
          onOpenConstruct={() => undefined}
          onInspectPrimer={() => undefined}
          onInspectEnzyme={() => undefined}
          onInspectRestrictionDigest={(node, enzymeNames) => {
            seen.push({ id: node.id, enzymes: enzymeNames })
          }}
        />,
      )
    })

    const vector = container.querySelector('.hedge-parent.is-vector') as HTMLElement
    act(() => {
      vector.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    expect(seen).toEqual([{ id: 'vector', enzymes: ['XbaI'] }])
  })
})
