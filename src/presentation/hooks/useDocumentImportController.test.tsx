// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cloneFixture } from '../../domain/fixtures'
import type { DocumentImportControllerOptions } from './useDocumentImportController'
import { useDocumentImportController } from './useDocumentImportController'

describe('useDocumentImportController', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('clears selections when a document replaces the workspace', async () => {
    const clearDocumentSelection = vi.fn()
    const record = cloneFixture()
    const options: DocumentImportControllerOptions = {
      record,
      traceDocument: null,
      setTraceDocument: vi.fn(),
      setRecord: vi.fn(),
      setTraceFiles: vi.fn(),
      setLibraryFolderId: vi.fn(),
      setWorkspaceDiskPath: vi.fn(),
      clearDocumentSelection,
      setActiveTab: vi.fn(),
      setActiveTabForRecord: vi.fn(),
      applyDefaultMapViewForTopology: vi.fn(),
      setAlignmentsVisible: vi.fn(),
      setLastAlignedSequence: vi.fn(),
      setTracesNeedRealign: vi.fn(),
      setNeverSaved: vi.fn(),
      markClean: vi.fn(),
      touchRecentLocalFile: vi.fn(),
      setStatus: vi.fn(),
      addImportOperation: (imported) => imported,
      parseTrace: vi.fn(),
      parseTraceShell: vi.fn(() => null),
      createTraceFallback: vi.fn(() => record),
      openTraceInNewWorkspace: vi.fn(),
      setPendingTopologyImport: vi.fn(),
    }
    let controller: ReturnType<typeof useDocumentImportController>
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      controller = useDocumentImportController(options)
      return null
    }

    await act(async () => root.render(<Harness />))
    act(() => controller!.commitImportedRecord(record, 'vector.dna'))
    act(() => controller!.commitUnsavedDownloadedRecord(record))
    expect(clearDocumentSelection).toHaveBeenCalledTimes(2)

    const trace = {
      id: 'trace-1', fileName: 'read.ab1', sequence: '', enabled: true, expanded: false, showAnnotations: false,
      alignment: null, parseError: 'unreadable', chromatogram: { aTrace: [], tTrace: [], gTrace: [], cTrace: [], basePos: [], baseCalls: [] },
    }
    await act(async () => controller!.openTraceDocument(new File([], 'read.ab1'), new Uint8Array(), undefined, trace))
    expect(clearDocumentSelection).toHaveBeenCalledTimes(3)
  })
})
