// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { ProteinSourceHistoryDialog } from '../src/ProteinSourceHistoryDialog'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import { defaultFeatureTranslationOptions } from '../src/domain/geneticCode'
import { dnaSequenceDigest } from '../src/domain/proteinTranslationProvenance'
import {
  buildProteinSourceHistoryRetentionPolicy,
  type HistoryRetentionPolicy,
} from '../src/domain/historyRetention'
import type { HistoryNode, SequenceRecord } from '../src/domain/types'

function historyNode(id: string, children: HistoryNode[] = []): HistoryNode {
  return {
    id,
    name: `${id}.dna`,
    seqLen: 9,
    circular: false,
    operation: children.length ? 'assemble' : 'invalid',
    resurrectable: children.length === 0,
    hideHistory: false,
    oligos: [],
    regeneratedSites: [],
    inputSummaries: [],
    features: [],
    sequence: 'ATGGTTTAA',
    children,
  }
}

function tracePayload() {
  const payload = new Uint8Array(4 + 5 + 3 + 5 + 2)
  new DataView(payload.buffer).setUint32(0, 1, false)
  payload[4] = 0x10
  new DataView(payload.buffer).setUint32(5, 3, false)
  payload.set([1, 2, 3], 9)
  payload[12] = 0x11
  new DataView(payload.buffer).setUint32(13, 2, false)
  payload.set([4, 5], 17)
  return payload
}

function proteinRecord(): SequenceRecord {
  const sourceRecord: SequenceRecord = {
    id: 'source-1',
    name: 'source.dna',
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence: 'ATGGTTTAA',
    features: [],
    primers: [],
    operations: [],
    history: historyNode('source-root', [
      historyNode('source-parent', [historyNode('source-grandparent')]),
    ]),
    snapGeneNativeHistory: {
      nodePackets: [
        { nodeId: 'source-parent', payload: tracePayload() },
        { nodeId: 'source-grandparent', payload: tracePayload() },
      ],
    },
    construct: defaultConstructProperties,
    createdAt: '',
    updatedAt: '',
  }
  return {
    id: 'protein-1',
    name: 'translated.prot',
    description: '',
    molecule: 'protein',
    topology: 'linear',
    sequence: 'MV',
    features: [],
    primers: [],
    operations: [],
    protein: {
      numberingStart: 1,
      numberingRegions: [],
      bonds: [],
      translationDerivation: {
        kind: 'translated-cds',
        createdAt: '',
        sources: [{
          projectId: sourceRecord.id,
          projectName: sourceRecord.name,
          sequenceDigest: dnaSequenceDigest(sourceRecord.sequence),
          sourceRecord,
          cds: {
            featureName: 'CDS',
            locations: [{ start: 0, end: 9, strand: 'forward' }],
            translation: defaultFeatureTranslationOptions(1),
            nucleotideSequence: sourceRecord.sequence,
            includedTerminalStop: true,
          },
        }],
      },
    },
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

describe('ProteinSourceHistoryDialog', () => {
  it('builds normalized protein source policies', () => {
    expect(buildProteinSourceHistoryRetentionPolicy('generations', 2.8, 'generations', 1.9))
      .toEqual({
        nativeAncestry: { mode: 'complete' },
        ancestorTraces: { mode: 'generations', generations: 1 },
        translationSources: {
          mode: 'complete',
          ancestry: { mode: 'generations', generations: 2 },
        },
        clearOperationLog: false,
      })
    expect(buildProteinSourceHistoryRetentionPolicy('cds-only', 99).translationSources)
      .toEqual({ mode: 'cds-only' })
  })

  it('previews source trace generation trimming and requires confirmation', () => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    let applied: HistoryRetentionPolicy | null = null
    act(() => root!.render(
      <ProteinSourceHistoryDialog
        record={proteinRecord()}
        onCancel={() => undefined}
        onApply={(policy) => { applied = policy }}
      />,
    ))

    const review = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Review changes'))!
    expect(review.disabled).toBe(true)
    expect(container.textContent).toContain('Embedded source DNA')
    expect(container.textContent).toContain('2 → 2')

    const traceRetention = container.querySelector(
      'select[aria-label="Protein source ancestor trace retention"]',
    ) as HTMLSelectElement
    act(() => {
      traceRetention.value = 'generations'
      traceRetention.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(container.textContent).toContain('2 → 1')
    expect(review.disabled).toBe(false)

    act(() => review.click())
    expect(container.textContent).toContain('Trim this protein’s source DNA?')
    expect(applied).toBeNull()
    const confirm = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Trim source DNA'))!
    act(() => confirm.click())
    expect(applied).toMatchObject({
      ancestorTraces: { mode: 'generations', generations: 1 },
      translationSources: { mode: 'complete', ancestry: { mode: 'complete' } },
    })
  })

  it('can retain only the CDS payload', () => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    let applied: HistoryRetentionPolicy | null = null
    act(() => root!.render(
      <ProteinSourceHistoryDialog
        record={proteinRecord()}
        onCancel={() => undefined}
        onApply={(policy) => { applied = policy }}
      />,
    ))
    const retention = container.querySelector(
      'select[aria-label="Protein source DNA retention"]',
    ) as HTMLSelectElement
    act(() => {
      retention.value = 'cds-only'
      retention.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(container.textContent).toContain('without a reopenable source DNA construct')
    expect(container.querySelector(
      'select[aria-label="Protein source ancestor trace retention"]',
    )).toBeNull()

    const review = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Review changes'))!
    act(() => review.click())
    const confirm = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Trim source DNA'))!
    act(() => confirm.click())
    expect(applied).toMatchObject({ translationSources: { mode: 'cds-only' } })
  })

  it('blocks reference-only trimming until the database source is verified', async () => {
    const protein = proteinRecord()
    const sourceRecord = protein.protein!.translationDerivation!.sources[0]!.sourceRecord!
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => root!.render(
      <ProteinSourceHistoryDialog
        record={protein}
        onLoadProject={async (id) => id === sourceRecord.id ? sourceRecord : null}
        onCancel={() => undefined}
        onApply={() => undefined}
      />,
    ))
    const retention = container.querySelector(
      'select[aria-label="Protein source DNA retention"]',
    ) as HTMLSelectElement
    await act(async () => {
      retention.value = 'reference-only'
      retention.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })
    expect(container.textContent).toContain('Database reference verification')
    expect(container.textContent).toContain('Verified')
    const review = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Review changes'))!
    expect(review.disabled).toBe(false)
  })
})
