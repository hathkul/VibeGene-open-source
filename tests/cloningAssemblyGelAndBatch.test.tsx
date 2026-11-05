// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import { defaultPrimerHybridizationParams } from '../src/domain/primerHybridization'
import type { SequenceRecord } from '../src/domain/types'
import type { CloningAssemblyDialogsHostProps } from '../src/presentation/dialogs/CloningAssemblyDialogsHost'
import type { CloningDialogLifecycle } from '../src/presentation/hooks/useCloningWorkspaceController'
import { CloningAssemblyDialogsHost } from '../src/presentation/dialogs/CloningAssemblyDialogsHost'

const probe = vi.hoisted(() => ({
  gel: { moduleLoads: 0, lastProps: null as Record<string, unknown> | null },
  batch: { moduleLoads: 0, lastResultProps: null as Record<string, unknown> | null, lastBlockedProps: null as Record<string, unknown> | null },
}))

vi.mock('../src/AgaroseGelDialog', () => {
  probe.gel.moduleLoads += 1
  return {
    AgaroseGelDialog: (props: Record<string, unknown>) => {
      probe.gel.lastProps = props
      return <div data-testid="agarose-gel-dialog" />
    },
  }
})

vi.mock('../src/cloning/MassRestrictionCloningDialogs', () => {
  probe.batch.moduleLoads += 1
  return {
    MassRestrictionResultsDialog: (props: Record<string, unknown>) => {
      probe.batch.lastResultProps = props
      return <div data-testid="mass-results-dialog" />
    },
    BlockedBatchOpenDialog: (props: Record<string, unknown>) => {
      probe.batch.lastBlockedProps = props
      return <div data-testid="blocked-batch-dialog" />
    },
  }
})

function dnaRecord(name: string): SequenceRecord {
  return {
    id: `id-${name}`,
    name,
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

function baseProps(overrides: Partial<CloningAssemblyDialogsHostProps> = {}): CloningAssemblyDialogsHostProps {
  return {
    record: dnaRecord('Vector.dna'),
    traceFiles: [],
    tabId: 'tab-1',
    selectedRange: null,
    retainedCloningDialogs: new Set(),
    renderWorkspace: vi.fn(() => null),
    primerHybridization: defaultPrimerHybridizationParams,
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

function gelSnapshot(openedAt: number): NonNullable<CloningAssemblyDialogsHostProps['agaroseGelSnapshot']> {
  return {
    currentRecord: dnaRecord('Gel source.dna'),
    currentTabId: 'tab-1',
    openedAt,
    initialSamples: [],
    libraryMemberSources: [],
    currentSourceLabel: 'Gel source.dna',
  }
}

describe('CloningAssemblyDialogsHost lazy gel and batch dialogs', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  async function flushLazy() {
    // Real module transforms can take more than fixed microtask ticks; flush
    // macrotasks until the lazy boundaries settle.
    for (let i = 0; i < 50; i++) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })
      if (!host.querySelector('[role="status"]')) return
    }
  }

  it('does not load the gel or batch chunks while nothing is open', () => {
    act(() => {
      root.render(<CloningAssemblyDialogsHost {...baseProps()} />)
    })
    expect(probe.gel.moduleLoads).toBe(0)
    expect(probe.batch.moduleLoads).toBe(0)
  })

  it('opens the agarose gel lazily and remounts on a new snapshot while reusing the chunk', async () => {
    const props = baseProps({ agaroseGelOpen: true, agaroseGelSnapshot: gelSnapshot(111) })
    act(() => {
      root.render(<CloningAssemblyDialogsHost {...props} />)
    })
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Loading…')
    await flushLazy()

    expect(probe.gel.moduleLoads).toBe(1)
    expect(probe.gel.lastProps!.currentSourceLabel).toBe('Gel source.dna')
    const renderWorkspace = probe.gel.lastProps!.renderWorkspace as CloningAssemblyDialogsHostProps['renderWorkspace']
    renderWorkspace({} as Parameters<typeof renderWorkspace>[0])
    expect(props.renderWorkspace).toHaveBeenCalledWith({ primerHybridization: defaultPrimerHybridizationParams })
    const firstNode = host.querySelector('[data-testid="agarose-gel-dialog"]')
    expect(firstNode).toBeTruthy()
    act(() => {
      ;(probe.gel.lastProps!.onClose as () => void)()
    })
    expect(props.onCloseAgaroseGel).toHaveBeenCalledTimes(1)

    // A new snapshot (new openedAt key) remounts the dialog without re-importing.
    act(() => {
      root.render(<CloningAssemblyDialogsHost {...props} agaroseGelSnapshot={gelSnapshot(222)} />)
    })
    expect(probe.gel.moduleLoads).toBe(1)
    const secondNode = host.querySelector('[data-testid="agarose-gel-dialog"]')
    expect(secondNode).toBeTruthy()
    expect(secondNode).not.toBe(firstNode)
  })

  it('opens the mass-restriction results and blocked-batch dialogs lazily', async () => {
    const props = baseProps({
      massRestrictionResult: { cloned: [{ vectorName: 'v', insertName: 'i', productName: 'p' }], notCloned: [] },
      blockedBatchOpen: { products: [dnaRecord('Product.dna')], openedCount: 0 },
    })
    act(() => {
      root.render(<CloningAssemblyDialogsHost {...props} />)
    })
    await flushLazy()

    expect(probe.batch.moduleLoads).toBe(1)
    expect(probe.batch.lastResultProps!.result).toBe(props.massRestrictionResult)
    expect(probe.batch.lastBlockedProps!.openedCount).toBe(0)
    act(() => {
      ;(probe.batch.lastResultProps!.onClose as () => void)()
      ;(probe.batch.lastBlockedProps!.onDiscard as () => void)()
    })
    expect(props.lifecycle.closeMassRestriction).toHaveBeenCalledTimes(1)
    expect(props.lifecycle.discardBlockedBatch).toHaveBeenCalledTimes(1)
  })
})
