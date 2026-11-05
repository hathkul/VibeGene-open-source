// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultConstructProperties } from '../../domain/constructProperties'
import type { HistoryNode, SequenceRecord } from '../../domain/types'
import { useDocumentHistoryOpenController } from './useDocumentHistoryOpenController'

const historyNode = (id: string): HistoryNode => ({
  id,
  name: 'ancestor.dna',
  seqLen: 4,
  circular: false,
  operation: 'invalid',
  resurrectable: false,
  hideHistory: false,
  oligos: [],
  regeneratedSites: [],
  inputSummaries: [],
  features: [],
  sequence: 'AAAA',
  children: [],
})

const live = (): SequenceRecord => ({
  id: 'live',
  name: 'product.dna',
  molecule: 'dna',
  topology: 'linear',
  sequence: 'TTTT',
  features: [],
  primers: [],
  history: historyNode('current'),
  constructProperties: defaultConstructProperties,
} as unknown as SequenceRecord)

describe('useDocumentHistoryOpenController', () => {
  let host: HTMLDivElement | undefined
  let root: ReturnType<typeof createRoot> | undefined

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('opens the live record for the current history node', () => {
    const openRecordInNewTab = vi.fn()
    const current = live()
    let controller: ReturnType<typeof useDocumentHistoryOpenController> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      controller = useDocumentHistoryOpenController(
        { record: current },
        { openRecordInNewTab, openAgaroseGelWindow: vi.fn() },
      )
      return null
    }
    act(() => { root!.render(<Harness />) })
    act(() => { controller!.openHistoryConstruct(current.history!) })
    expect(openRecordInNewTab).toHaveBeenCalledWith(current)
  })

  it('routes restriction gel opens through the parent snapshot plan', () => {
    const openAgaroseGelWindow = vi.fn()
    const parent = historyNode('parent')
    parent.sequence = 'GGGG'
    let controller: ReturnType<typeof useDocumentHistoryOpenController> | undefined
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    function Harness() {
      controller = useDocumentHistoryOpenController(
        { record: live() },
        { openRecordInNewTab: vi.fn(), openAgaroseGelWindow },
      )
      return null
    }
    act(() => { root!.render(<Harness />) })
    act(() => { controller!.openHistoryRestrictionGel(parent, ['EcoRI']) })
    expect(openAgaroseGelWindow).toHaveBeenCalledWith(expect.objectContaining({
      currentRecord: expect.objectContaining({ sequence: 'GGGG' }),
      initialSamples: [expect.objectContaining({ enzymeNames: ['EcoRI'] })],
      currentSourceLabel: 'ancestor',
    }))
  })
})
