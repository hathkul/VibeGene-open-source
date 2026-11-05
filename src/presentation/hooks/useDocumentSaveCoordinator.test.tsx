// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDocumentSaveCoordinator } from './useDocumentSaveCoordinator'

describe('useDocumentSaveCoordinator', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('uses the normal SnapGene export path for a database Save DNA toolbar action', () => {
    const handleExportSnapGene = vi.fn().mockResolvedValue(null)
    const exportSnapGeneFile = vi.fn().mockResolvedValue(null)
    let coordinator: ReturnType<typeof useDocumentSaveCoordinator>
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      coordinator = useDocumentSaveCoordinator({
        traceDocument: false,
        documentSaveBinding: 'database',
        pendingDocumentExit: null,
        pendingSaveCompletionRef: { current: null },
        refreshSessionDraftsRef: { current: vi.fn().mockResolvedValue(undefined) },
        recordId: () => 'record-1',
        setStatus: vi.fn(),
        setPendingDocumentExit: vi.fn(),
        saveDiskFile: vi.fn().mockResolvedValue(false),
        save: vi.fn().mockResolvedValue(undefined),
        saveToDatabase: vi.fn(),
        handleExportSnapGene,
        exportSnapGeneFile,
        completeDatabaseSave: vi.fn().mockResolvedValue(undefined),
        clearSessionDraftForRecord: vi.fn().mockResolvedValue(undefined),
        suppressPageHideDraftSave: vi.fn(),
        resolveDocumentExitWorkflow: vi.fn().mockResolvedValue(undefined),
        isNativeDesktop: () => false,
      })
      return null
    }
    act(() => root.render(<Harness />))
    act(() => coordinator!.runSaveToolbarMode('save-dna'))
    expect(handleExportSnapGene).toHaveBeenCalledOnce()
    expect(exportSnapGeneFile).not.toHaveBeenCalled()
  })
})
