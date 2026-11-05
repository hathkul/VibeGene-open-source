// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DatabaseHistoryBatchDialog,
  type DatabaseHistoryBatchApplyOptions,
  type DatabaseHistoryBatchResult,
} from '../src/DatabaseHistoryBatchDialog'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import type { HistoryRetentionPolicy } from '../src/domain/historyRetention'
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

function dnaRecord(id = 'dna-1'): SequenceRecord {
  return {
    id,
    name: `${id}.dna`,
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence: 'ATGC',
    features: [],
    primers: [],
    operations: [{ id: `${id}-op`, type: 'assemble', summary: 'Assembled', createdAt: '' }],
    history: historyNode(`${id}-root`, [historyNode(`${id}-parent`)]),
    construct: defaultConstructProperties,
    createdAt: '',
    updatedAt: '',
  }
}

function proteinRecord(): SequenceRecord {
  return {
    id: 'protein-1',
    name: 'protein-1.prot',
    description: '',
    molecule: 'protein',
    topology: 'linear',
    sequence: 'M',
    protein: {
      translationDerivation: {
        kind: 'translated-cds',
        createdAt: '',
        sources: [{
          projectId: 'source-dna',
          projectName: 'source-dna.dna',
          sequenceDigest: 'digest',
          sourceRecord: dnaRecord('source-dna'),
        }],
      },
    },
    features: [],
    primers: [],
    operations: [],
    construct: defaultConstructProperties,
    createdAt: '',
    updatedAt: '',
  }
}

let root: ReturnType<typeof createRoot> | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  container?.remove()
  root = null
  container = null
})

function renderDialog(options: {
  result?: DatabaseHistoryBatchResult | null
  containsOpenRecord?: boolean
  onApply?: (policy: HistoryRetentionPolicy, options: DatabaseHistoryBatchApplyOptions) => void
} = {}) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  const records = [dnaRecord(), proteinRecord()]
  act(() => {
    root!.render(
      <DatabaseHistoryBatchDialog
        records={records}
        busy={false}
        result={options.result}
        containsOpenRecord={options.containsOpenRecord}
        onCancel={() => undefined}
        onApply={options.onApply ?? (() => undefined)}
      />,
    )
  })
}

describe('DatabaseHistoryBatchDialog', () => {
  it('previews mixed records and applies one combined retention policy after confirmation', () => {
    let applied: HistoryRetentionPolicy | null = null
    let recoveryDays: number | null = null
    renderDialog({ onApply: (policy, options) => {
      applied = policy
      recoveryDays = options.recoveryDays
    } })

    expect(container!.textContent).toContain('2 selected files')
    expect(container!.textContent).toContain('dna-1.dna')
    expect(container!.textContent).toContain('protein-1.prot')

    const native = container!.querySelector(
      'select[aria-label="Batch construct ancestry retention"]',
    ) as HTMLSelectElement
    const source = container!.querySelector(
      'select[aria-label="Batch protein source DNA retention"]',
    ) as HTMLSelectElement
    const traces = container!.querySelector(
      'select[aria-label="Batch ancestor trace retention"]',
    ) as HTMLSelectElement
    const operations = container!.querySelector(
      'input[aria-label="Batch clear operation logs"]',
    ) as HTMLInputElement
    act(() => {
      native.value = 'current-only'
      native.dispatchEvent(new Event('change', { bubbles: true }))
      source.value = 'remove'
      source.dispatchEvent(new Event('change', { bubbles: true }))
      traces.value = 'remove'
      traces.dispatchEvent(new Event('change', { bubbles: true }))
      operations.click()
    })

    expect(container!.textContent).toContain('2 / 2')
    const review = [...container!.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Review batch'))!
    expect(review.disabled).toBe(false)
    act(() => review.click())
    expect(container!.textContent).toContain('Trim history in 2 database files?')

    const confirm = [...container!.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Trim 2 files'))!
    act(() => confirm.click())
    expect(applied).toEqual({
      nativeAncestry: { mode: 'current-only' },
      ancestorTraces: { mode: 'remove' },
      translationSources: { mode: 'remove' },
      clearOperationLog: true,
    })
    expect(recoveryDays).toBe(7)
  })

  it('warns when a selected record is open and reports partial batch failures', () => {
    renderDialog({ containsOpenRecord: true })
    const native = container!.querySelector(
      'select[aria-label="Batch construct ancestry retention"]',
    ) as HTMLSelectElement
    act(() => {
      native.value = 'current-only'
      native.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const review = [...container!.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Review batch'))!
    act(() => review.click())
    expect(container!.textContent).toContain('One selected file is currently open in this window.')

    act(() => {
      root!.render(
        <DatabaseHistoryBatchDialog
          records={[dnaRecord(), proteinRecord()]}
          busy={false}
          result={{
            trimmedNames: ['dna-1.dna'],
            failures: [{ name: 'protein-1.prot', error: 'Disk full' }],
          }}
          onCancel={() => undefined}
          onApply={() => undefined}
        />,
      )
    })
    expect(container!.textContent).toContain('1 file trimmed successfully.')
    expect(container!.textContent).toContain('protein-1.prot: Disk full')
  })
})
