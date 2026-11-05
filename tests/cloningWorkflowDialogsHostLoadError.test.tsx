// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import type { SequenceRecord } from '../src/domain/types'
import type { CloningDialogLifecycle } from '../src/presentation/hooks/useCloningWorkspaceController'
import type { CloningWorkflowDialogsHostProps } from '../src/presentation/dialogs/CloningWorkflowDialogsHost'
import { CloningWorkflowDialogsHost } from '../src/presentation/dialogs/CloningWorkflowDialogsHost'

vi.mock('../src/PcrDialog', () => {
  throw new Error('chunk unavailable')
})


function lifecycleMock(overrides: Partial<CloningDialogLifecycle> = {}): CloningDialogLifecycle {
  return {
    cancelRestrictionCloning: vi.fn(),
    cancelGibsonAssembly: vi.fn(),
    cancelTaGcCloning: vi.fn(),
    cancelGatewayCloning: vi.fn(),
    closeMassRestriction: vi.fn(),
    discardBlockedBatch: vi.fn(),
    reportLazyLoadFailure: vi.fn(),
    onRestrictionCloningLoadError: vi.fn(),
    onGibsonAssemblyLoadError: vi.fn(),
    onTaGcCloningLoadError: vi.fn(),
    onGatewayCloningLoadError: vi.fn(),
    onMassRestrictionLoadError: vi.fn(),
    onBlockedBatchLoadError: vi.fn(),
    onPcrLoadError: vi.fn(),
    ...overrides,
  }
}

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

function baseProps(overrides: Partial<CloningWorkflowDialogsHostProps> = {}): CloningWorkflowDialogsHostProps {
  return {
    record: dnaRecord(),
    traceFiles: [],
    tabId: 'tab-1',
    pcrOpen: false,
    pcrRetained: false,
    setPcrOpen: vi.fn(),
    selectedRange: null,
    selectedPrimerIds: [],
    onPcr: vi.fn(),
    pcrRenderWorkspace: () => null,
    lifecycle: lifecycleMock(),
    mutagenesisOpen: false,
    mutagenesisRetained: false,
    setMutagenesisOpen: vi.fn(),
    onMutagenize: vi.fn(),
    mutagenesisRenderWorkspace: () => null,
    ...overrides,
  }
}

describe('CloningWorkflowDialogsHost retained PCR load failure', () => {
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

  it('reports the failed import, and re-reports when the retained shell is discarded and reopened', async () => {
    const lifecycle = lifecycleMock()
    const renderHost = (retained: boolean, open: boolean) =>
      root.render(
        <CloningWorkflowDialogsHost {...baseProps({ pcrRetained: retained, pcrOpen: open, lifecycle })} />,
      )

    act(() => {
      renderHost(true, true)
    })
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Loading…')

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(lifecycle.onPcrLoadError).toHaveBeenCalledTimes(1)

    // The retained wrapper stays mounted but harmless: empty.
    const wrapper = host.querySelector('.retained-dialog-host')!
    expect(wrapper).toBeTruthy()
    expect(wrapper.textContent).toBe('')

    // App wiring discards the retained key; the shell unmounts.
    act(() => {
      renderHost(false, false)
    })
    expect(host.querySelector('.retained-dialog-host')).toBeNull()

    // Reopening re-mounts the boundary, which re-reports the cached rejection.
    act(() => {
      renderHost(true, true)
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(lifecycle.onPcrLoadError).toHaveBeenCalledTimes(2)
  })
})
