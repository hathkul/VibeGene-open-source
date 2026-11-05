// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { HistoryManagerDialog } from '../src/HistoryManagerDialog'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import {
  buildDnaHistoryRetentionPolicy,
  type HistoryRetentionPolicy,
} from '../src/domain/historyRetention'
import type { HistoryNode, SequenceRecord } from '../src/domain/types'

function historyNode(id: string, children: HistoryNode[] = []): HistoryNode {
  return {
    id,
    name: `${id}.dna`,
    seqLen: 4,
    circular: false,
    operation: children.length ? 'assemble' : 'invalid',
    resurrectable: children.length === 0,
    hideHistory: false,
    oligos: [],
    regeneratedSites: [],
    inputSummaries: [],
    features: [],
    sequence: 'ATGC',
    children,
  }
}

function record(): SequenceRecord {
  return {
    id: 'dna-1',
    name: 'demo.dna',
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence: 'ATGC',
    features: [],
    primers: [],
    operations: [{ id: 'op-1', type: 'assemble', summary: 'Assembled', createdAt: '' }],
    history: historyNode('root', [historyNode('parent', [historyNode('grandparent')])]),
    construct: defaultConstructProperties,
    createdAt: '',
    updatedAt: '',
  }
}

function recordWithAncestorTrace(): SequenceRecord {
  const source = record()
  const payload = new Uint8Array(4 + 5 + 3 + 5 + 2)
  new DataView(payload.buffer).setUint32(0, 1, false)
  payload[4] = 0x10
  new DataView(payload.buffer).setUint32(5, 3, false)
  payload.set([1, 2, 3], 9)
  payload[12] = 0x11
  new DataView(payload.buffer).setUint32(13, 2, false)
  payload.set([4, 5], 17)
  source.snapGeneNativeHistory = {
    nodePackets: [
      { nodeId: 'parent', payload },
      { nodeId: 'grandparent', payload: payload.slice() },
    ],
  }
  return source
}

let root: ReturnType<typeof createRoot> | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  container?.remove()
  root = null
  container = null
})

describe('HistoryManagerDialog', () => {
  it('builds normalized DNA policies', () => {
    expect(buildDnaHistoryRetentionPolicy('generations', 2.8, true)).toEqual({
      nativeAncestry: { mode: 'generations', generations: 2 },
      ancestorTraces: { mode: 'complete' },
      translationSources: { mode: 'complete', ancestry: { mode: 'complete' } },
      clearOperationLog: true,
    })
    expect(buildDnaHistoryRetentionPolicy('current-only', 99, false).nativeAncestry).toEqual({
      mode: 'current-only',
    })
    expect(buildDnaHistoryRetentionPolicy('complete', 99, false, 'generations', 2.8).ancestorTraces)
      .toEqual({ mode: 'generations', generations: 2 })
  })

  it('shows a live preview and requires confirmation before applying', () => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    let applied: HistoryRetentionPolicy | null = null
    act(() => {
      root!.render(
        <HistoryManagerDialog
          record={record()}
          onCancel={() => undefined}
          onApply={(policy) => { applied = policy }}
        />,
      )
    })

    const review = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Review changes'))!
    expect(review.disabled).toBe(true)

    const select = container.querySelector('select[aria-label="DNA ancestry retention"]') as HTMLSelectElement
    act(() => {
      select.value = 'current-only'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const clearOperations = container.querySelector(
      'input[aria-label="Clear operation log"]',
    ) as HTMLInputElement
    act(() => clearOperations.click())

    expect(container.textContent).toContain('3 → 1')
    expect(container.textContent).toContain('1 → 0')
    expect(review.disabled).toBe(false)

    act(() => review.click())
    expect(container.textContent).toContain('Trim this construct’s history?')
    expect(applied).toBeNull()

    const confirm = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Trim history'))!
    act(() => confirm.click())
    expect(applied).toEqual({
      nativeAncestry: { mode: 'current-only' },
      ancestorTraces: { mode: 'complete' },
      translationSources: { mode: 'complete', ancestry: { mode: 'complete' } },
      clearOperationLog: true,
    })
  })

  it('can remove traces older than a selected generation depth', () => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    let applied: HistoryRetentionPolicy | null = null
    act(() => {
      root!.render(
        <HistoryManagerDialog
          record={recordWithAncestorTrace()}
          onCancel={() => undefined}
          onApply={(policy) => { applied = policy }}
        />,
      )
    })

    expect(container.textContent).toContain('Embedded ancestor traces')
    expect(container.textContent).toContain('2 → 2')
    const traceRetention = container.querySelector(
      'select[aria-label="Ancestor trace retention"]',
    ) as HTMLSelectElement
    act(() => {
      traceRetention.value = 'generations'
      traceRetention.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(container.textContent).toContain('2 → 1')

    const review = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Review changes'))!
    expect(review.disabled).toBe(false)
    act(() => review.click())
    const confirm = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Trim history'))!
    act(() => confirm.click())
    expect(applied).toMatchObject({
      nativeAncestry: { mode: 'complete' },
      ancestorTraces: { mode: 'generations', generations: 1 },
    })
  })
})
