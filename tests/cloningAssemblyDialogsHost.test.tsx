// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import { defaultPrimerHybridizationParams } from '../src/domain/primerHybridization'
import type { SequenceRecord } from '../src/domain/types'
import type { CloningDialogLifecycle } from '../src/presentation/hooks/useCloningWorkspaceController'
import type { CloningAssemblyDialogsHostProps } from '../src/presentation/dialogs/CloningAssemblyDialogsHost'
import { CloningAssemblyDialogsHost } from '../src/presentation/dialogs/CloningAssemblyDialogsHost'

const probes = vi.hoisted(() => ({
  restriction: { moduleLoads: 0, lastProps: null as Record<string, unknown> | null },
  gibson: { moduleLoads: 0, lastProps: null as Record<string, unknown> | null },
  tagc: { moduleLoads: 0, lastProps: null as Record<string, unknown> | null },
  gateway: { moduleLoads: 0, lastProps: null as Record<string, unknown> | null },
}))

vi.mock('../src/RestrictionCloningDialog', () => {
  probes.restriction.moduleLoads += 1
  return {
    RestrictionCloningDialog: (props: Record<string, unknown>) => {
      probes.restriction.lastProps = props
      return <div data-testid="restriction-dialog" />
    },
  }
})

vi.mock('../src/GibsonAssemblyDialog', () => {
  probes.gibson.moduleLoads += 1
  return {
    GibsonAssemblyDialog: function MockGibsonAssemblyDialog(props: Record<string, unknown>) {
      probes.gibson.lastProps = props
      const [draft, setDraft] = useState('')
      return (
        <div data-testid="gibson-dialog">
          <input aria-label="gibson draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
        </div>
      )
    },
  }
})

vi.mock('../src/TaGcCloningDialog', () => {
  probes.tagc.moduleLoads += 1
  return {
    TaGcCloningDialog: (props: Record<string, unknown>) => {
      probes.tagc.lastProps = props
      return <div data-testid="tagc-dialog" />
    },
  }
})

vi.mock('../src/GatewayCloningDialog', () => {
  probes.gateway.moduleLoads += 1
  return {
    GatewayCloningDialog: (props: Record<string, unknown>) => {
      probes.gateway.lastProps = props
      return <div data-testid="gateway-dialog" />
    },
  }
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

describe('CloningAssemblyDialogsHost lazy assembly dialogs', () => {
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
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  it('does not load any assembly dialog chunk while nothing is retained or open', () => {
    act(() => {
      root.render(<CloningAssemblyDialogsHost {...baseProps()} />)
    })
    expect(probes.restriction.moduleLoads).toBe(0)
    expect(probes.gibson.moduleLoads).toBe(0)
    expect(probes.tagc.moduleLoads).toBe(0)
    expect(probes.gateway.moduleLoads).toBe(0)
    expect(host.querySelector('.retained-dialog-host')).toBeNull()
  })

  it('opens the restriction dialog through the lazy boundary with key-derived props', async () => {
    const props = baseProps({
      retainedCloningDialogs: new Set(['restriction:insert']),
      restrictionCloningOpen: true,
      restrictionCloningMode: 'insert',
    })
    act(() => {
      root.render(<CloningAssemblyDialogsHost {...props} />)
    })
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Loading…')
    await flushLazy()
    expect(probes.restriction.moduleLoads).toBe(1)
    const dialogProps = probes.restriction.lastProps!
    expect(dialogProps.active).toBe(true)
    expect(dialogProps.initialMode).toBe('insert')
    expect((dialogProps.currentRecord as SequenceRecord).name).toBe('Vector.dna')
    const renderWorkspace = dialogProps.renderWorkspace as CloningAssemblyDialogsHostProps['renderWorkspace']
    renderWorkspace({} as Parameters<typeof renderWorkspace>[0])
    expect(props.renderWorkspace).toHaveBeenCalledWith({ primerHybridization: defaultPrimerHybridizationParams })
    act(() => {
      ;(dialogProps.onCancel as () => void)()
    })
    expect(props.lifecycle.cancelRestrictionCloning).toHaveBeenCalledWith('restriction:insert')
  })

  it('keeps a closed Gibson dialog mounted and hidden with its draft intact across reopen', async () => {
    const retained = new Set(['gibson:nebuilder-hifi'])
    const props = baseProps({ retainedCloningDialogs: retained, gibsonAssemblyOpen: true })
    act(() => {
      root.render(<CloningAssemblyDialogsHost {...props} />)
    })
    await flushLazy()
    expect(probes.gibson.moduleLoads).toBe(1)
    expect(probes.gibson.lastProps!.active).toBe(true)
    expect(probes.gibson.lastProps!.assemblyMethod).toBe('nebuilder-hifi')

    const input = host.querySelector('input[aria-label="gibson draft"]') as HTMLInputElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, 'atgc draft')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(input.value).toBe('atgc draft')

    // Close: hidden, not unmounted.
    act(() => {
      root.render(<CloningAssemblyDialogsHost {...props} gibsonAssemblyOpen={false} />)
    })
    const wrapper = host.querySelector('.retained-dialog-host')!
    expect(wrapper.hasAttribute('hidden')).toBe(true)
    expect(wrapper.getAttribute('aria-hidden')).toBe('true')
    expect(probes.gibson.lastProps!.active).toBe(false)
    expect((host.querySelector('input[aria-label="gibson draft"]') as HTMLInputElement).value).toBe('atgc draft')

    // Reopen: same mounted instance, no second import, draft preserved.
    act(() => {
      root.render(<CloningAssemblyDialogsHost {...props} gibsonAssemblyOpen />)
    })
    expect(probes.gibson.moduleLoads).toBe(1)
    expect(probes.gibson.lastProps!.active).toBe(true)
    expect(host.querySelector('.retained-dialog-host')!.hasAttribute('hidden')).toBe(false)
    expect((host.querySelector('input[aria-label="gibson draft"]') as HTMLInputElement).value).toBe('atgc draft')
  })

  it('opens the TA/GC and Gateway dialogs through their lazy boundaries', async () => {
    const props = baseProps({
      retainedCloningDialogs: new Set(['ta-gc:ta', 'gateway:lr']),
      taGcCloningOpen: true,
      taGcCloningMethod: 'ta',
      gatewayCloningOpen: true,
      gatewayCloningMethod: 'lr',
    })
    act(() => {
      root.render(<CloningAssemblyDialogsHost {...props} />)
    })
    await flushLazy()
    expect(probes.tagc.moduleLoads).toBe(1)
    expect(probes.tagc.lastProps!.cloningMethod).toBe('ta')
    expect(probes.tagc.lastProps!.active).toBe(true)
    act(() => {
      ;(probes.tagc.lastProps!.onCancel as () => void)()
    })
    expect(props.lifecycle.cancelTaGcCloning).toHaveBeenCalledTimes(1)
    expect(probes.gateway.moduleLoads).toBe(1)
    expect(probes.gateway.lastProps!.cloningMethod).toBe('lr')
    expect(probes.gateway.lastProps!.initialSelectedRange).toBeNull()
    const renderWorkspace = probes.gateway.lastProps!.renderWorkspace as CloningAssemblyDialogsHostProps['renderWorkspace']
    const explicit = { ...defaultPrimerHybridizationParams, allowMismatch: !defaultPrimerHybridizationParams.allowMismatch }
    renderWorkspace({ primerHybridization: explicit } as Parameters<typeof renderWorkspace>[0])
    expect(props.renderWorkspace).toHaveBeenCalledWith({ primerHybridization: explicit })
  })
})
