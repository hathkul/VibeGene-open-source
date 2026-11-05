// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { labPlasmid } from '../../domain/fixtures'
import type { CloningCompletionControllerSlice } from './useCloningCompletionHandlers'
import { useCloningCompletionHandlers } from './useCloningCompletionHandlers'

function makeCloningSlice(overrides: Partial<CloningCompletionControllerSlice> = {}): CloningCompletionControllerSlice {
  return {
    setRestrictionCloningOpen: vi.fn(),
    setGibsonAssemblyOpen: vi.fn(),
    setTaGcCloningOpen: vi.fn(),
    setMutagenesisOpen: vi.fn(),
    discardCloningDialog: vi.fn(),
    setMassRestrictionResult: vi.fn(),
    setBlockedBatchOpen: vi.fn(),
    ...overrides,
  }
}

describe('useCloningCompletionHandlers', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('closes restriction cloning, opens tabs, and sets default status', () => {
    const cloning = makeCloningSlice()
    const openUnsavedRecordsInNewTabs = vi.fn()
    const setStatus = vi.fn()
    let handlers: ReturnType<typeof useCloningCompletionHandlers> | undefined
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    function Harness() {
      handlers = useCloningCompletionHandlers(cloning, {
        openUnsavedRecordsInNewTabs,
        openRecordInNewTab: vi.fn(),
        setStatus,
      })
      return null
    }
    act(() => root.render(<Harness />))
    act(() => handlers!.cloningAssemblyHandlers.onRestrictionClone('restriction:insert', [labPlasmid]))
    expect(cloning.setRestrictionCloningOpen).toHaveBeenCalledWith(false)
    expect(cloning.discardCloningDialog).toHaveBeenCalledWith('restriction:insert')
    expect(openUnsavedRecordsInNewTabs).toHaveBeenCalledWith([labPlasmid])
    expect(setStatus).toHaveBeenCalledWith(expect.stringContaining('Opened cloning product'))
    act(() => root.unmount())
  })

  it('respects custom PCR status and skips default copy', () => {
    const setStatus = vi.fn()
    let handlers: ReturnType<typeof useCloningCompletionHandlers> | undefined
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    function Harness() {
      handlers = useCloningCompletionHandlers(makeCloningSlice(), {
        openUnsavedRecordsInNewTabs: vi.fn(),
        openRecordInNewTab: vi.fn(),
        setStatus,
      })
      return null
    }
    act(() => root.render(<Harness />))
    act(() => handlers!.cloningWorkflowHandlers.onPcr([labPlasmid], { statusMessage: 'Custom PCR status.' }))
    expect(setStatus).toHaveBeenCalledWith('Custom PCR status.')
    act(() => root.unmount())
  })

  it('opens a single gateway product in a new tab without closing gateway state', () => {
    const cloning = makeCloningSlice()
    const openRecordInNewTab = vi.fn()
    let handlers: ReturnType<typeof useCloningCompletionHandlers> | undefined
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    function Harness() {
      handlers = useCloningCompletionHandlers(cloning, {
        openUnsavedRecordsInNewTabs: vi.fn(),
        openRecordInNewTab,
        setStatus: vi.fn(),
      })
      return null
    }
    act(() => root.render(<Harness />))
    act(() => handlers!.cloningAssemblyHandlers.onGatewayClone([labPlasmid], 'bp'))
    expect(openRecordInNewTab).toHaveBeenCalledWith(labPlasmid, { activate: true, initiallyUnsaved: true })
    expect(cloning.discardCloningDialog).not.toHaveBeenCalled()
    act(() => root.unmount())
  })
})
