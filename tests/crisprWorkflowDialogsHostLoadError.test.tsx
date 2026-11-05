// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import type { SequenceRecord } from '../src/domain/types'
import type { CrisprWorkflowDialogsHostProps } from '../src/presentation/dialogs/CrisprWorkflowDialogsHost'
import { CrisprWorkflowDialogsHost } from '../src/presentation/dialogs/CrisprWorkflowDialogsHost'

vi.mock('../src/GuideScanDesignDialog', () => {
  throw new Error('chunk unavailable')
})

function dnaRecord(): SequenceRecord {
  return {
    id: 'rec-1',
    name: 'Template.dna',
    description: '',
    molecule: 'dna',
    topology: 'circular',
    sequence: 'ACGT'.repeat(500),
    features: [],
    primers: [],
    operations: [],
    construct: { ...defaultConstructProperties },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function baseProps(overrides: Partial<CrisprWorkflowDialogsHostProps> = {}): CrisprWorkflowDialogsHostProps {
  return {
    record: dnaRecord(),
    traceFiles: [],
    sgRnaDialog: null,
    setSgRnaDialog: vi.fn(),
    onSaveSgRna: vi.fn(),
    sgRnaCloningSnapshot: null,
    currentTabId: 'tab-1',
    setSgRnaCloningSnapshot: vi.fn(),
    onOpenAnnealedInsert: vi.fn(),
    onCloneSgRna: vi.fn(),
    renderWorkspace: () => null,
    guideScanDesignDialog: null,
    setGuideScanDesignDialog: vi.fn(),
    selectionFocus: 'dna',
    selectedFeatureId: null,
    selectedRange: null,
    onPersistGuideScanCache: vi.fn(),
    onAddGuideScanSelected: vi.fn(),
    setStatus: vi.fn(),
    commonPrimerMatches: null,
    setCommonPrimerMatches: vi.fn(),
    onAddDatabasePrimers: vi.fn(),
    ...overrides,
  }
}

describe('CrisprWorkflowDialogsHost GuideScan design load failure', () => {
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

  it('reports the failed import, and re-reports when the dialog is dismissed and reopened', async () => {
    const setStatus = vi.fn()
    const setGuideScanDesignDialog = vi.fn()
    const renderHost = (open: boolean) =>
      root.render(
        <CrisprWorkflowDialogsHost
          {...baseProps({ guideScanDesignDialog: open ? { memberId: null } : null, setStatus, setGuideScanDesignDialog })}
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
    // Host-owned failure path: dismiss the dialog and report the status.
    expect(setGuideScanDesignDialog).toHaveBeenCalledWith(null)
    expect(setStatus).toHaveBeenCalledWith('Could not load the GuideScan design dialog.')

    // App wiring dismisses the dialog state; the boundary unmounts.
    act(() => {
      renderHost(false)
    })
    expect(host.querySelector('[role="status"]')).toBeNull()

    // Reopening re-mounts the boundary, which re-reports the cached rejection.
    act(() => {
      renderHost(true)
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(setStatus).toHaveBeenCalledTimes(2)
  })
})
