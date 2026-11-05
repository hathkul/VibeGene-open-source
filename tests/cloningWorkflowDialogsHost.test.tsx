// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import type { SequenceRecord } from '../src/domain/types'
import type { CloningDialogLifecycle } from '../src/presentation/hooks/useCloningWorkspaceController'
import type { CloningWorkflowDialogsHostProps } from '../src/presentation/dialogs/CloningWorkflowDialogsHost'
import { CloningWorkflowDialogsHost } from '../src/presentation/dialogs/CloningWorkflowDialogsHost'

const probe = vi.hoisted(() => ({
  moduleLoads: 0,
  lastProps: null as Record<string, unknown> | null,
}))

vi.mock('../src/PcrDialog', () => {
  probe.moduleLoads += 1
  return {
    PcrDialog: function MockPcrDialog(props: Record<string, unknown>) {
      probe.lastProps = props
      const [draft, setDraft] = useState('')
      return (
        <div data-testid="pcr-dialog">
          <input aria-label="pcr draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
        </div>
      )
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

describe('CloningWorkflowDialogsHost lazy PCR dialog', () => {
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

  it('does not load the PCR chunk while the dialog is not retained', () => {
    act(() => {
      root.render(<CloningWorkflowDialogsHost {...baseProps()} />)
    })
    expect(probe.moduleLoads).toBe(0)
    expect(host.querySelector('.retained-dialog-host')).toBeNull()
  })

  it('opens the PCR dialog through the lazy boundary and keeps its draft across close and reopen', async () => {
    const props = baseProps({
      pcrRetained: true,
      pcrOpen: true,
      selectedRange: { start: 10, end: 200 },
      selectedPrimerIds: ['p1', 'p2', 'p3'],
    })
    act(() => {
      root.render(<CloningWorkflowDialogsHost {...props} />)
    })
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Loading…')
    await flushLazy()

    expect(probe.moduleLoads).toBe(1)
    expect(probe.lastProps!.active).toBe(true)
    expect(probe.lastProps!.initialSelectedRange).toEqual({ start: 10, end: 200 })
    expect(probe.lastProps!.initialPrimerIds).toEqual(['p1', 'p2'])
    expect(probe.lastProps!.renderWorkspace).toBe(props.pcrRenderWorkspace)
    expect((probe.lastProps!.currentRecord as SequenceRecord).name).toBe('Template.dna')

    const input = host.querySelector('input[aria-label="pcr draft"]') as HTMLInputElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, 'anneal 55')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    // Close: hidden, not unmounted.
    act(() => {
      root.render(<CloningWorkflowDialogsHost {...props} pcrOpen={false} />)
    })
    const wrapper = host.querySelector('.retained-dialog-host')!
    expect(wrapper.hasAttribute('hidden')).toBe(true)
    expect(probe.lastProps!.active).toBe(false)
    expect((host.querySelector('input[aria-label="pcr draft"]') as HTMLInputElement).value).toBe('anneal 55')

    // Reopen: same mounted instance, no second import, draft preserved.
    act(() => {
      root.render(<CloningWorkflowDialogsHost {...props} pcrOpen />)
    })
    expect(probe.moduleLoads).toBe(1)
    expect(probe.lastProps!.active).toBe(true)
    expect((host.querySelector('input[aria-label="pcr draft"]') as HTMLInputElement).value).toBe('anneal 55')
  })
})
