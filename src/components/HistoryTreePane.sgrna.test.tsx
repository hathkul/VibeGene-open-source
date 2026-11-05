// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HistoryTreePane } from './HistoryTreePane'
import { saveTextAs } from '../desktop/fileIo'
import type { HistoryNode } from '../domain/types'

vi.mock('../desktop/fileIo', () => ({ saveTextAs: vi.fn().mockResolvedValue(undefined) }))

const history: HistoryNode = {
  id: 'clone', name: 'Guide library', seqLen: 5000, circular: true,
  operation: 'cloneSgRNALibrary', resurrectable: false, hideHistory: false,
  oligos: [], regeneratedSites: [], inputSummaries: [], features: [], children: [],
  sgRnaCloning: {
    version: 1, createdAt: '2026-09-27T00:00:00Z', sourceVector: { id: 'vector', name: 'pGuide' },
    cloningChoice: { label: 'BbsI pair', architecture: 'direct-spacer', kind: 'detected' },
    ends: {
      promoter: { enzyme: 'BbsI', polarity: "5'", overhang: 'CACC', modification: 'fivePrimePhosphorylated' },
      scaffold: { enzyme: 'BbsI', polarity: "5'", overhang: 'AAAC', modification: 'fivePrimePhosphorylated' },
    },
    guides: [{
      sourceGuideId: 'g1', name: 'guide 1', nuclease: 'SpCas9', targetSpacer: 'ACGTACGTACGTACGTACGT',
      expressedGuide: 'GACGTACGTACGTACGTACGT', compatibility: 'compatible', compatibilityMessage: 'Compatible.',
      addedSense5: 'CACCG', addedSense3: '', addedAntisense5: 'AAAC', addedAntisense3: '',
      productId: 'product', productName: 'pGuide - guide 1', warnings: [],
    }],
    oligos: [
      { name: 'guide 1_sense', sequence: 'CACCGACGTACGTACGTACGTACGT', modification: '5′ phosphate', guideId: 'g1' },
      { name: 'guide 1_sense duplicate', sequence: 'CACCGACGTACGTACGTACGTACGT', modification: '5′ phosphate', guideId: 'g1' },
      { name: 'guide 1_antisense', sequence: 'AAACACGTACGTACGTACGTACGT', modification: '5′ phosphate', guideId: 'g1' },
    ],
  },
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.clearAllMocks()
})

describe('History sgRNA oligo retrieval', () => {
  it('opens the library order list even without parent nodes and supports copy and export', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    await act(async () => root.render(createElement(HistoryTreePane, {
      root: history, onOpenConstruct: vi.fn(), onInspectPrimer: vi.fn(), onInspectEnzyme: vi.fn(),
    })))
    const view = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('View oligos'))
    expect(view?.textContent).toContain('(2)')
    await act(async () => view!.click())
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('guide 1_sense')
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
    await act(async () => buttons.find((button) => button.textContent === 'Copy oligos')!.click())
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('guide 1_sense [5′ phosphate]\tCACCG'))
    await act(async () => buttons.find((button) => button.textContent === 'Export oligos…')!.click())
    expect(saveTextAs).toHaveBeenCalledWith('sgRNA oligos for Guide library.txt', expect.stringContaining('guide 1_antisense [5′ phosphate]'), 'text/plain')
  })

  it('puts Open as sequence on the sense oligo row', async () => {
    const onOpen = vi.fn()
    await act(async () => root.render(createElement(HistoryTreePane, {
      root: history, onOpenConstruct: vi.fn(), onInspectPrimer: vi.fn(), onInspectEnzyme: vi.fn(),
      onOpenAnnealedInsert: onOpen,
    })))
    const view = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('View oligos'))
    await act(async () => view!.click())
    const rows = [...host.querySelectorAll('.history-sgrna-oligo-row')]
    const sense = rows.find((row) => row.textContent?.includes('guide 1_sense'))
    const antisense = rows.find((row) => row.textContent?.includes('guide 1_antisense'))
    expect(sense?.querySelector('button')?.textContent).toBe('Open as sequence')
    expect(antisense?.querySelector('button')).toBeNull()
    await act(async () => sense!.querySelector('button')!.click())
    expect(onOpen).toHaveBeenCalledWith(history, 'g1')
  })

  it('chooses library member reactions before showing their grouped cloning recipes', async () => {
    const source = (id: string, name: string, seqLen: number): HistoryNode => ({
      id, name, seqLen, circular: true, operation: 'invalid', resurrectable: true, hideHistory: false,
      oligos: [], regeneratedSites: [], inputSummaries: [], features: [], children: [],
    })
    const recipe = (id: string, name: string): HistoryNode => ({
      id, name, seqLen: 5100, circular: true, operation: 'insertFragment', resurrectable: false, hideHistory: false,
      oligos: [], regeneratedSites: [], features: [],
      inputSummaries: [{ manipulation: 'replace' }, { manipulation: 'insert' }],
      children: [source(`${id}-vector`, `${name} vector`, 5000), source(`${id}-insert`, `${name} insert`, 100)],
    })
    const library: HistoryNode = {
      ...history, id: 'library', name: 'Products', operation: 'cloneLibrary', sgRnaCloning: undefined,
    }
    await act(async () => root.render(createElement(HistoryTreePane, {
      root: library, onOpenConstruct: vi.fn(), onInspectPrimer: vi.fn(), onInspectEnzyme: vi.fn(),
      libraryRecipeMembers: [
        { id: 'one', name: 'member one.dna', history: recipe('one', 'member one') },
        { id: 'two', name: 'member two.dna', history: recipe('two', 'member two') },
      ],
    })))
    const label = [...host.querySelectorAll('button')].find((button) => button.textContent === 'Create cloning library')!
    await act(async () => label.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Choose library-member recipes')
    const boxes = [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    await act(async () => boxes[1]!.click())
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Show recipes')!.click())
    const dialog = host.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain('member one')
    expect(dialog?.textContent).not.toContain('member two')
  })
})
