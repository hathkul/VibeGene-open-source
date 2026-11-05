// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import type { SequenceRecord } from '../src/domain/types'
import type { CloningAssemblyDialogsHostProps } from '../src/presentation/dialogs/CloningAssemblyDialogsHost'
import { CloningAssemblyDialogsHost } from '../src/presentation/dialogs/CloningAssemblyDialogsHost'
import type { CloningDialogLifecycle } from '../src/presentation/hooks/useCloningWorkspaceController'

vi.mock('../src/GibsonAssemblyDialog', () => {
  throw new Error('chunk unavailable')
})

vi.mock('../src/AgaroseGelDialog', () => {
  throw new Error('chunk unavailable')
})

vi.mock('../src/cloning/MassRestrictionCloningDialogs', () => {
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
    name: 'Vector.dna',
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

function baseProps(overrides: Partial<CloningAssemblyDialogsHostProps> = {}): CloningAssemblyDialogsHostProps {
  return {
    record: dnaRecord(),
    traceFiles: [],
    tabId: 'tab-1',
    selectedRange: null,
    retainedCloningDialogs: new Set(),
    renderWorkspace: () => null,
    lifecycle: lifecycleMock(),
    restrictionCloningOpen: false,
    restrictionCloningMode: 'insert',
    initialVectorSites: [],
    onRestrictionClone: vi.fn(),
    gibsonAssemblyOpen: false,
    gibsonAssemblyMethod: 'nebuilder-hifi',
    onGibsonAssemble: vi.fn(),
    taGcCloningOpen: false,
    taGcCloningMethod: 'ta',
    onTaGcClone: vi.fn(),
    gatewayCloningOpen: false,
    gatewayCloningMethod: 'bp',
    onGatewayClone: vi.fn(),
    massRestrictionResult: null,
    blockedBatchOpen: null,
    onOpenBlockedProduct: vi.fn(),
    agaroseGelOpen: false,
    agaroseGelSnapshot: null,
    onCloseAgaroseGel: vi.fn(),
    ...overrides,
  }
}

describe('CloningAssemblyDialogsHost retained dialog load failure', () => {
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

  it('reports the failed import, leaves an empty retained shell, and re-reports on retry after the key is discarded', async () => {
    const lifecycle = lifecycleMock()
    const retained = new Set(['gibson:nebuilder-hifi'])
    const renderHost = (keys: ReadonlySet<string>, open: boolean) =>
      root.render(
        <CloningAssemblyDialogsHost
          {...baseProps({
            retainedCloningDialogs: keys,
            gibsonAssemblyOpen: open,
            lifecycle,
          })}
        />,
      )

    act(() => {
      renderHost(retained, true)
    })
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Loading…')

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(lifecycle.onGibsonAssemblyLoadError).toHaveBeenCalledTimes(1)

    // The retained wrapper stays mounted but harmless: empty, and closable.
    const wrapper = host.querySelector('.retained-dialog-host')!
    expect(wrapper).toBeTruthy()
    expect(wrapper.textContent).toBe('')

    // App wiring drops the retained key; the shell unmounts.
    act(() => {
      renderHost(new Set(), false)
    })
    expect(host.querySelector('.retained-dialog-host')).toBeNull()

    // Reopening re-mounts the boundary, which re-reports the cached rejection.
    act(() => {
      renderHost(retained, true)
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(lifecycle.onGibsonAssemblyLoadError).toHaveBeenCalledTimes(2)
  })

  it('routes batch dialog load failures to the lifecycle and clears the gel itself', async () => {
    const lifecycle = lifecycleMock()
    const onCloseAgaroseGel = vi.fn()
    act(() => {
      root.render(
        <CloningAssemblyDialogsHost
          {...baseProps({
            agaroseGelOpen: true,
            agaroseGelSnapshot: {
              currentRecord: dnaRecord(),
              currentTabId: 'tab-1',
              openedAt: 111,
              initialSamples: [],
              libraryMemberSources: [],
              currentSourceLabel: 'Vector.dna',
            },
            massRestrictionResult: { cloned: [], notCloned: [] },
            blockedBatchOpen: { products: [dnaRecord()], openedCount: 0 },
            lifecycle,
            onCloseAgaroseGel,
          })}
        />,
      )
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    // The gel's failure path is host-owned: close the gel, then report.
    expect(onCloseAgaroseGel).toHaveBeenCalledTimes(1)
    expect(lifecycle.reportLazyLoadFailure).toHaveBeenCalledWith('Could not load the agarose gel dialog.')
    expect(lifecycle.onMassRestrictionLoadError).toHaveBeenCalledTimes(1)
    expect(lifecycle.onBlockedBatchLoadError).toHaveBeenCalledTimes(1)
    expect(host.querySelector('[role="status"]')).toBeNull()
  })
})
