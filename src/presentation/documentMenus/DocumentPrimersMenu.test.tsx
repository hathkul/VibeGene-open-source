// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { primerIdentityKey } from '../../application/primerWorkflow/commonPrimerTags'
import { DocumentPrimersMenu, type DocumentPrimersMenuProps } from './DocumentPrimersMenu'

function makeProps(overrides: Partial<DocumentPrimersMenuProps> = {}): DocumentPrimersMenuProps {
  return {
    hasPrimerSelected: false,
    hasSelectionRange: false,
    canShowSelectedPrimers: false,
    canHideSelectedPrimers: false,
    onAddPrimer: vi.fn(),
    onPickPrimers: vi.fn(),
    onEditPrimers: vi.fn(),
    onDuplicatePrimers: vi.fn(),
    onRemovePrimers: vi.fn(),
    onPrimerColor: vi.fn(),
    onHybridizationParameters: vi.fn(),
    onShowSelectedPrimers: vi.fn(),
    onHideSelectedPrimers: vi.fn(),
    onImportPrimersFromAnotherFile: vi.fn(),
    onImportPrimersFromList: vi.fn(),
    onDetectCommonPrimers: vi.fn(),
    onAddToCommonPrimers: vi.fn(),
    onExportPrimers: vi.fn(),
    loadCommonPrimers: vi.fn().mockResolvedValue([]),
    loadPrimerTagMap: vi.fn().mockResolvedValue(new Map()),
    ...overrides,
  }
}

describe('DocumentPrimersMenu', () => {
  let host: HTMLDivElement | null = null
  let root: Root | null = null

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    root = null
    host = null
  })

  function render(props: DocumentPrimersMenuProps) {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root!.render(<DocumentPrimersMenu {...props} />))
    return host
  }

  function trigger(dom: HTMLElement) {
    return dom.querySelector<HTMLButtonElement>('.toolbar-edit-trigger')!
  }

  it('loads common-primer tags only after opening and deduplicates them', async () => {
    const primers = [
      { name: 'Forward', sequence: 'ATGC' },
      { name: 'Reverse', sequence: 'GGCA' },
    ]
    const loadCommonPrimers = vi.fn().mockResolvedValue(primers)
    const loadPrimerTagMap = vi.fn().mockResolvedValue(new Map([
      [primerIdentityKey('Forward', 'ATGC'), ['PCR', 'Assembly']],
      [primerIdentityKey('Reverse', 'GGCA'), ['pcr', 'Sequencing']],
    ]))
    const dom = render(makeProps({ loadCommonPrimers, loadPrimerTagMap }))

    expect(loadCommonPrimers).not.toHaveBeenCalled()
    expect(loadPrimerTagMap).not.toHaveBeenCalled()

    await act(async () => trigger(dom).click())
    expect(loadCommonPrimers).toHaveBeenCalledTimes(1)
    expect(loadPrimerTagMap).toHaveBeenCalledTimes(1)
    expect(dom.textContent).toContain('PCR')
    expect(dom.textContent).toContain('Assembly')
    expect(dom.textContent).toContain('Sequencing')
    expect(dom.querySelectorAll('.toolbar-edit-submenu-panel button')).toHaveLength(4)
  })

  it('ignores a loader result after the menu closes', async () => {
    let resolveCommonPrimers!: (primers: readonly { name: string; sequence: string }[]) => void
    let resolvePrimerTagMap!: (tagMap: Map<string, string[]>) => void
    const loadCommonPrimers = vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolveCommonPrimers = resolve
    }))
    const loadPrimerTagMap = vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolvePrimerTagMap = resolve
    }))
    const dom = render(makeProps({ loadCommonPrimers, loadPrimerTagMap }))

    await act(async () => trigger(dom).click())
    await act(async () => trigger(dom).click())
    resolveCommonPrimers([{ name: 'Stale', sequence: 'ATGC' }])
    resolvePrimerTagMap(new Map([[primerIdentityKey('Stale', 'ATGC'), ['Stale tag']]]))
    await act(async () => await Promise.resolve())

    expect(dom.querySelector('.toolbar-edit-dropdown')).toBeNull()
    await act(async () => trigger(dom).click())
    expect(dom.textContent).not.toContain('Stale tag')
  })
})
