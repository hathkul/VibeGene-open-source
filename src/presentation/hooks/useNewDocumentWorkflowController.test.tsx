// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultConstructProperties } from '../../domain/constructProperties'
import type { SequenceRecord } from '../../domain/types'
import { useNewDocumentWorkflowController } from './useNewDocumentWorkflowController'

const source = (): SequenceRecord => ({
  id: 'source-1',
  name: 'plasmid.dna',
  molecule: 'dna',
  topology: 'circular',
  sequence: 'ACGTACGTACGTACGT',
  features: [],
  primers: [],
  constructProperties: defaultConstructProperties,
} as unknown as SequenceRecord)

describe('useNewDocumentWorkflowController', () => {
  let host: HTMLDivElement | undefined
  let root: ReturnType<typeof createRoot> | undefined

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('opens the naming dialog for a valid range selection', () => {
    const setStatus = vi.fn()
    let workflow: ReturnType<typeof useNewDocumentWorkflowController> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      workflow = useNewDocumentWorkflowController(
        {
          record: source(),
          selectedRange: { start: 2, end: 6 },
          cutStrandSelection: null,
          cutEnzymes: null,
        },
        {
          normalizeConstructFileName: (name) => name.replace(/\.dna$/i, ''),
          createDnaRecord: vi.fn(),
          createProteinRecord: vi.fn(),
          openRecordInNewTab: vi.fn(),
          setStatus,
        },
      )
      return null
    }
    act(() => { root!.render(<Harness />) })
    act(() => { workflow!.handleNewFileFromSelection() })
    expect(workflow!.pendingNewFileFromSelection?.sequence).toBe('GTAC')
    expect(setStatus).not.toHaveBeenCalled()
  })

  it('confirms a pending selection into a new unsaved tab', () => {
    const openRecordInNewTab = vi.fn()
    const setStatus = vi.fn()
    let workflow: ReturnType<typeof useNewDocumentWorkflowController> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      workflow = useNewDocumentWorkflowController(
        {
          record: source(),
          selectedRange: { start: 0, end: 4 },
          cutStrandSelection: null,
          cutEnzymes: null,
        },
        {
          normalizeConstructFileName: (name) => name,
          createDnaRecord: vi.fn(),
          createProteinRecord: vi.fn(),
          openRecordInNewTab,
          setStatus,
        },
      )
      return null
    }
    act(() => { root!.render(<Harness />) })
    act(() => { workflow!.handleNewFileFromSelection() })
    act(() => { workflow!.confirmNewFileFromSelection('fragment.dna') })
    expect(workflow!.pendingNewFileFromSelection).toBeNull()
    expect(openRecordInNewTab).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'fragment.dna' }),
      { initiallyUnsaved: true },
    )
    expect(setStatus).toHaveBeenCalledWith('Opened new file from selection: fragment.dna (4 bp).')
  })
})
