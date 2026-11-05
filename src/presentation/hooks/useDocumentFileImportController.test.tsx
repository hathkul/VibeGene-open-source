// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cloneFixture } from '../../domain/fixtures'
import type { PreparedImportedFile } from '../../application/documentImport/prepareImportedFile'
import type { DocumentFileImportOptions } from './useDocumentFileImportController'
import { useDocumentFileImportController } from './useDocumentFileImportController'

describe('useDocumentFileImportController openPickedFile', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  function createOptions(overrides: Partial<DocumentFileImportOptions> = {}) {
    const record = cloneFixture()
    const prepared: Extract<PreparedImportedFile, { kind: 'sequence' }> = {
      kind: 'sequence',
      file: { fileName: 'vector.dna', bytes: new Uint8Array() },
      record,
    }
    const calls = {
      prepareFile: vi.fn(async () => prepared),
      actionProfileAsync: vi.fn(async (_name: string, _category: string, run: () => Promise<unknown>) => run()),
      actionProfileSync: vi.fn((_name: string, _category: string, run: () => unknown) => run()),
      setTraceDocument: vi.fn(),
      setStatus: vi.fn(),
      addImportOperation: vi.fn((imported: typeof record) => imported),
      onTraceImport: vi.fn(async () => {}),
      onSnapGeneImport: vi.fn(),
      onSettingsImport: vi.fn(),
      onProjectImport: vi.fn(),
      onSequenceImport: vi.fn(),
      readFileText: vi.fn(async () => ''),
      isSettingsFile: vi.fn(() => false),
      parseSettingsJson: vi.fn(() => ({ version: 1 })),
      applyLoadedSettings: vi.fn(),
      requestDocumentExit: vi.fn((action: () => void | Promise<void>) => action()),
    }
    Object.assign(calls, overrides)
    return { record, calls, options: calls as unknown as DocumentFileImportOptions }
  }

  async function renderController(options: DocumentFileImportOptions) {
    let controller: ReturnType<typeof useDocumentFileImportController>
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      controller = useDocumentFileImportController(options)
      return null
    }
    await act(async () => root.render(<Harness />))
    return controller!
  }

  it('applies a settings JSON pick immediately without confirming document exit', async () => {
    const settings = { version: 1, display: {} }
    const { calls, options } = createOptions({
      readFileText: vi.fn(async () => JSON.stringify(settings)),
      isSettingsFile: vi.fn(() => true),
      parseSettingsJson: vi.fn(() => settings),
      requestDocumentExit: vi.fn(),
    } as unknown as Partial<DocumentFileImportOptions>)
    const controller = await renderController(options)

    await act(async () => controller.openPickedFile(new File(['{}'], 'prefs.json', { type: 'application/json' })))

    expect(calls.readFileText).toHaveBeenCalledTimes(1)
    expect(calls.applyLoadedSettings).toHaveBeenCalledTimes(1)
    expect(calls.applyLoadedSettings.mock.calls[0][1]).toBe('prefs.json')
    expect(calls.requestDocumentExit).not.toHaveBeenCalled()
    expect(calls.prepareFile).not.toHaveBeenCalled()
  })

  it('confirms document exit for a valid non-settings project JSON pick', async () => {
    const { calls, options } = createOptions({
      readFileText: vi.fn(async () => JSON.stringify({ record: {} })),
    } as Partial<DocumentFileImportOptions>)
    const controller = await renderController(options)

    await act(async () => controller.openPickedFile(new File(['{}'], 'project.vbgp.json', { type: 'application/json' })))

    expect(calls.readFileText).toHaveBeenCalledTimes(1)
    expect(calls.applyLoadedSettings).not.toHaveBeenCalled()
    expect(calls.requestDocumentExit).toHaveBeenCalledTimes(1)
    expect(calls.prepareFile).toHaveBeenCalledTimes(1)
    expect(calls.onSequenceImport).toHaveBeenCalledTimes(1)
  })

  it('confirms document exit for malformed JSON and still imports', async () => {
    const { calls, options } = createOptions({
      readFileText: vi.fn(async () => '{not json'),
    } as Partial<DocumentFileImportOptions>)
    const controller = await renderController(options)

    await act(async () => controller.openPickedFile(new File(['x'], 'broken.json', { type: 'application/json' })))

    expect(calls.readFileText).toHaveBeenCalledTimes(1)
    expect(calls.requestDocumentExit).toHaveBeenCalledTimes(1)
    expect(calls.prepareFile).toHaveBeenCalledTimes(1)
  })

  it('confirms document exit for non-JSON picks without reading the file as text', async () => {
    const { calls, options } = createOptions()
    const controller = await renderController(options)

    await act(async () => controller.openPickedFile(new File(['ATGC'], 'vector.dna')))

    expect(calls.readFileText).not.toHaveBeenCalled()
    expect(calls.applyLoadedSettings).not.toHaveBeenCalled()
    expect(calls.requestDocumentExit).toHaveBeenCalledTimes(1)
    expect(calls.prepareFile).toHaveBeenCalledTimes(1)
  })
})
