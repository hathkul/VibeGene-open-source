// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildDnaHistoryRetentionPolicy } from '../../domain/historyRetention'
import { labPlasmid } from '../../domain/fixtures'
import { traceRecordFromSequence } from '../../domain/sequenceTraceFactory'
import type { SequenceFeature } from '../../domain/types'
import {
  useHistoryRetentionFeatureExportController,
  type HistoryRetentionFeatureExportPorts,
} from './useHistoryRetentionFeatureExportController'

const feature: SequenceFeature = {
  id: 'feature-1',
  type: 'CDS',
  name: 'LDLR',
  color: labPlasmid.features.find((entry) => entry.type === 'CDS')!.color,
  locations: [{ start: 86, end: 2669, strand: 'forward' }],
}

function mountController(input: {
  selectedFeatures?: SequenceFeature[]
  featureTabSelectionMemberId?: string | null
  traceFiles?: ReturnType<typeof traceRecordFromSequence>[]
  ports?: Partial<HistoryRetentionFeatureExportPorts>
}) {
  let controller!: ReturnType<typeof useHistoryRetentionFeatureExportController>
  const callOrder: string[] = []
  const download = vi.fn(() => callOrder.push('download'))
  const updateRecord = vi.fn((updater: (current: typeof labPlasmid) => typeof labPlasmid) => {
    callOrder.push('history:push-via-update')
    callOrder.push('updateRecord')
    updater(labPlasmid)
  })
  const setStatus = vi.fn((status: string) => {
    callOrder.push(`status:${status}`)
  })
  const setHistoryManagerOpen = vi.fn((open: boolean) => {
    if (!open) callOrder.push('close-history')
  })
  const setProteinSourceHistoryManagerOpen = vi.fn((open: boolean) => {
    if (!open) callOrder.push('close-protein-source')
  })
  const setExportFeatureDataOpen = vi.fn((open: boolean) => {
    if (!open) callOrder.push('close-export')
  })

  const ports: HistoryRetentionFeatureExportPorts = {
    download,
    updateRecord,
    setStatus,
    setHistoryManagerOpen,
    setProteinSourceHistoryManagerOpen,
    setExportFeatureDataOpen,
    ...input.ports,
  }

  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)

  function Harness() {
    controller = useHistoryRetentionFeatureExportController(
      {
        record: labPlasmid,
        traceFiles: input.traceFiles ?? [],
        selectedFeatures: input.selectedFeatures ?? [feature],
        featureTabSelectionMemberId: input.featureTabSelectionMemberId ?? null,
      },
      ports,
    )
    return null
  }

  return {
    render: async () => act(async () => root.render(<Harness />)),
    unmount: () => {
      act(() => root.unmount())
      host.remove()
    },
    controller: () => controller,
    callOrder,
    download,
    updateRecord,
    setStatus,
    setExportFeatureDataOpen,
  }
}

describe('useHistoryRetentionFeatureExportController', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('pushes undo snapshot via updateRecord before closing native history and reporting status', async () => {
    const harness = mountController({})
    await harness.render()
    act(() => {
      harness.controller().applyManagedHistoryRetention(buildDnaHistoryRetentionPolicy('current-only', 0, false))
    })
    expect(harness.updateRecord).toHaveBeenCalledOnce()
    expect(harness.callOrder.slice(0, 3)).toEqual(['history:push-via-update', 'updateRecord', 'close-history'])
    expect(harness.setStatus.mock.calls[0]?.[0]).toMatch(/^Trimmed history: removed/)
    harness.unmount()
  })

  it('closes feature export without download when fields are empty', async () => {
    const harness = mountController({})
    await harness.render()
    act(() => {
      harness.controller().confirmExportFeatureData([])
    })
    expect(harness.download).not.toHaveBeenCalled()
    expect(harness.callOrder).toEqual(['close-export'])
    harness.unmount()
  })

  it('downloads member-length export data through the injected adapter', async () => {
    const member = traceRecordFromSequence('A'.repeat(321), 'read.ab1', { id: 'member-1' })
    const harness = mountController({
      traceFiles: [member],
      featureTabSelectionMemberId: member.id,
    })
    await harness.render()
    act(() => {
      harness.controller().confirmExportFeatureData(['name', 'location'])
    })
    expect(harness.download).toHaveBeenCalledWith(
      'Features from VibeGene-pDemo.txt',
      expect.stringContaining('LDLR'),
      'text/plain',
    )
    expect(harness.callOrder).toEqual(['download', 'close-export', 'status:Exported data for LDLR.'])
    harness.unmount()
  })
})
