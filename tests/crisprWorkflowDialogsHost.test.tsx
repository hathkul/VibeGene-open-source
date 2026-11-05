// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import type { SequenceRecord } from '../src/domain/types'
import type { CrisprWorkflowDialogsHostProps } from '../src/presentation/dialogs/CrisprWorkflowDialogsHost'
import { CrisprWorkflowDialogsHost } from '../src/presentation/dialogs/CrisprWorkflowDialogsHost'

const probe = vi.hoisted(() => ({
  moduleLoads: 0,
  lastProps: null as Record<string, unknown> | null,
}))

vi.mock('../src/GuideScanDesignDialog', () => {
  probe.moduleLoads += 1
  return {
    GuideScanDesignDialog: function MockGuideScanDesignDialog(props: Record<string, unknown>) {
      probe.lastProps = props
      return <div data-testid="guidescan-design-dialog" />
    },
  }
})

function dnaRecord(id: string): SequenceRecord {
  return {
    id,
    name: `${id}.dna`,
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
    record: dnaRecord('rec-1'),
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

describe('CrisprWorkflowDialogsHost lazy GuideScan design dialog', () => {
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

  it('does not load the GuideScan design chunk while the dialog is closed', () => {
    act(() => {
      root.render(<CrisprWorkflowDialogsHost {...baseProps()} />)
    })
    expect(probe.moduleLoads).toBe(0)
    expect(host.querySelector('[role="status"]')).toBeNull()
  })

  it('opens through the lazy boundary with resolved props and remounts per record id', async () => {
    const props = baseProps({
      guideScanDesignDialog: { memberId: null },
      selectionFocus: 'dna',
      selectedRange: { start: 10, end: 60 },
    })
    act(() => {
      root.render(<CrisprWorkflowDialogsHost {...props} />)
    })
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Loading…')
    await flushLazy()

    expect(probe.moduleLoads).toBe(1)
    expect((probe.lastProps!.record as SequenceRecord).id).toBe('rec-1')
    expect(probe.lastProps!.designSelection).toMatchObject({ kind: 'range', start: 10, end: 60 })
    expect(probe.lastProps!.persistedCache).toBeUndefined()
    expect(probe.lastProps!.onPersistDesignCache).toBe(props.onPersistGuideScanCache)
    expect(probe.lastProps!.onAddSelected).toBe(props.onAddGuideScanSelected)

    const firstNode = host.querySelector('[data-testid="guidescan-design-dialog"]')!

    // Same record id: same key, no remount.
    act(() => {
      root.render(<CrisprWorkflowDialogsHost {...props} />)
    })
    expect(host.querySelector('[data-testid="guidescan-design-dialog"]')).toBe(firstNode)

    // New record id: `guidescan:${id}` key forces a remount without re-importing.
    act(() => {
      root.render(<CrisprWorkflowDialogsHost {...props} record={dnaRecord('rec-2')} />)
    })
    const secondNode = host.querySelector('[data-testid="guidescan-design-dialog"]')!
    expect(secondNode).not.toBe(firstNode)
    expect(probe.moduleLoads).toBe(1)
    expect((probe.lastProps!.record as SequenceRecord).id).toBe('rec-2')

    // Cancel flows back to the host setter.
    act(() => {
      (probe.lastProps!.onCancel as () => void)()
    })
    expect(props.setGuideScanDesignDialog).toHaveBeenCalledWith(null)
  })
})
