// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SequenceDatabaseImportDialog } from '../src/SequenceDatabaseImportDialog'
import type { SequenceSearchResult } from '../src/domain/externalSequences'

const mockSearch = vi.fn()
const mockFetch = vi.fn()

vi.mock('../src/domain/externalSequences', () => ({
  sequenceProviders: {
    ncbi: { id: 'ncbi', label: 'NCBI', search: (...args: unknown[]) => mockSearch(...args), fetch: (...args: unknown[]) => mockFetch(...args) },
    uniprot: { id: 'uniprot', label: 'UniProt', search: vi.fn(), fetch: vi.fn() },
    ensembl: { id: 'ensembl', label: 'Ensembl', search: vi.fn(), fetch: vi.fn() },
  },
}))

const sampleResult: SequenceSearchResult = {
  provider: 'ncbi',
  id: 'NM_000546.6',
  accession: 'NM_000546.6',
  name: 'TP53',
  description: 'tumor protein p53',
  molecule: 'dna',
  length: 2512,
  database: 'nuccore',
}

function renderDialog() {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      <SequenceDatabaseImportDialog
        onCancel={() => undefined}
        onOpen={() => undefined}
        onOpenExternal={() => undefined}
      />,
    )
  })
  return { container, root }
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setNativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setNativeValue.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

afterEach(() => {
  document.body.replaceChildren()
  vi.clearAllMocks()
})

describe('SequenceDatabaseImportDialog activity log', () => {
  beforeEach(() => {
    mockSearch.mockImplementation(async (query: { onProgress?: (message: string) => void }) => {
      query.onProgress?.('Querying NCBI Nucleotide (esearch) for "TP53"…')
      return {
        results: [sampleResult],
        total: 1,
        page: 0,
        pageSize: 25,
      }
    })
  })

  it('logs search request and success entry', async () => {
    const { container, root } = renderDialog()
    const input = container.querySelector<HTMLInputElement>('.sequence-database-search-term')!
    setInputValue(input, 'TP53')
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.sequence-database-search-submit')!.click()
    })
    await act(async () => {
      await Promise.resolve()
    })
    const log = container.querySelector('.sequence-database-activity-log')
    expect(log?.textContent).toContain('Search requested: "TP53"')
    expect(log?.textContent).toContain('Found 1 of 1 sequence records')
    act(() => root.unmount())
  })

  it('shows alert when search fails', async () => {
    mockSearch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { container, root } = renderDialog()
    const input = container.querySelector<HTMLInputElement>('.sequence-database-search-term')!
    setInputValue(input, 'TP53')
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.sequence-database-search-submit')!.click()
    })
    await act(async () => {
      await Promise.resolve()
    })
    const alert = container.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain('Search failed')
    act(() => root.unmount())
  })

  it('logs cancel when the user stops the request', async () => {
    mockSearch.mockImplementation((_query, signal?: AbortSignal) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => {
        reject(new DOMException('The request was cancelled.', 'AbortError'))
      }, { once: true })
    }))
    const { container, root } = renderDialog()
    const input = container.querySelector<HTMLInputElement>('.sequence-database-search-term')!
    setInputValue(input, 'TP53')
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.sequence-database-search-submit')!.click()
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.sequence-database-footer button')!.click()
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(container.querySelector('.sequence-database-activity-log')?.textContent).toContain('Cancelled by user')
    act(() => root.unmount())
  })
})
