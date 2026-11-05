// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import { defaultPrimerHybridizationParams } from '../src/domain/primerHybridization'
import type { SequenceRecord } from '../src/domain/types'
import { PrimerDialogsHost } from '../src/presentation/dialogs/PrimerDialogsHost'

vi.mock('../src/PickPrimersDialog', () => {
  throw new Error('chunk unavailable')
})

function dnaRecord(): SequenceRecord {
  return {
    id: 'rec-1',
    name: 'Test.dna',
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence: 'ACGT'.repeat(200),
    features: [],
    primers: [],
    operations: [],
    construct: { ...defaultConstructProperties },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('PrimerDialogsHost lazy primer picking', () => {
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

  it('clears the open state and reports a status when the dialog chunk import fails', async () => {
    const setStatus = vi.fn()
    const setPickPrimersRange = vi.fn()
    const renderHost = (open: boolean) =>
      root.render(
        <PrimerDialogsHost
          record={dnaRecord()}
          primerEditor={null}
          onSavePrimerEditor={vi.fn()}
          setPrimerEditor={vi.fn()}
          primerMergeNotice={null}
          setPrimerMergeNotice={vi.fn()}
          primerNameWarning={null}
          setPrimerNameWarning={vi.fn()}
          libraryPrimer={null}
          setLibraryPrimer={vi.fn()}
          primerOrientationOpen={false}
          setPrimerOrientationOpen={vi.fn()}
          openPrimerEditorFromSelection={vi.fn()}
          primerColorPickerOpen={false}
          setPrimerColorPickerOpen={vi.fn()}
          selectedPrimer={null}
          applyPrimerColor={vi.fn()}
          hybridizationParamsOpen={false}
          setHybridizationParamsOpen={vi.fn()}
          hybridization={defaultPrimerHybridizationParams}
          saveHybridizationParameters={vi.fn()}
          pickPrimersRange={open ? { start: 100, end: 300 } : null}
          setPickPrimersRange={setPickPrimersRange}
          addPickedPrimers={vi.fn()}
          setStatus={setStatus}
          primerImportDialog={null}
          setPrimerImportDialog={vi.fn()}
          addImportedPrimers={vi.fn()}
          primersImportFromFileOpen={false}
          otherOpenTabs={[]}
          onLoadOpenTab={vi.fn(async () => null)}
          setPrimersImportFromFileOpen={vi.fn()}
        />,
      )

    act(() => {
      renderHost(true)
    })
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Loading…')

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(setPickPrimersRange).toHaveBeenCalledWith(null)
    expect(setStatus).toHaveBeenCalledWith('Could not load the primer picking dialog.')
    expect(host.querySelector('[role="status"]')).toBeNull()

    act(() => {
      renderHost(false)
    })
    expect(host.querySelector('.lazy-dialog-status')).toBeNull()
    expect(host.innerHTML).toBe('')
  })
})
