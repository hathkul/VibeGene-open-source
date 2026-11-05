// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SequenceRecord } from '../../domain/types'
import { useProteinComparisonController } from './useProteinComparisonController'

function proteinRecord(): SequenceRecord {
  return {
    id: 'protein', name: 'Protein', description: '', molecule: 'protein', topology: 'linear', sequence: 'MKT',
    features: [], primers: [], operations: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    construct: {
      syntheticDna: false, confirmedExperimentally: false, laboratoryHostOrganism: null, sourceOrganism: null,
      bacterialTransformationStrain: null, hostMethylation: { dam: false, dcm: false, ecoKI: false },
      sequenceClass: '', accessionNumber: '', codeNumber: '', sequenceAuthor: '', comments: '', references: '',
    },
    protein: {
      numberingStart: 1, numberingRegions: [], bonds: [],
      comparisonSources: [{ id: 'old', name: 'Old', kind: 'protein', sequence: 'M', enabled: true }],
      comparisonVariableRegions: [{ id: 'old-region', start: 0, end: 1 }],
      comparisonAlignmentCache: [],
    },
  }
}

describe('useProteinComparisonController', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  function mountController(record: SequenceRecord) {
    let recordState = record
    const updateRecord = vi.fn((updater: (current: SequenceRecord) => SequenceRecord) => {
      recordState = updater(recordState)
    })
    const commands = {
      updateProteinComparisonSources: null as ReturnType<typeof useProteinComparisonController>['updateProteinComparisonSources'] | null,
      updateProteinComparisonVariableRegions: null as ReturnType<typeof useProteinComparisonController>['updateProteinComparisonVariableRegions'] | null,
    }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    function Harness() {
      const controller = useProteinComparisonController({
        record: recordState,
        traceFiles: [],
        selectedRange: null,
        updateRecord,
        setRecord: updateRecord,
        onTraceFilesChange: vi.fn(),
        setStatus: vi.fn(),
        writeClipboardText: vi.fn(),
        openRecordInNewTab: vi.fn(),
        createDnaRecord: vi.fn(),
        createProteinRecord: vi.fn(),
        getProject: vi.fn(),
      })
      commands.updateProteinComparisonSources = controller.updateProteinComparisonSources
      commands.updateProteinComparisonVariableRegions = controller.updateProteinComparisonVariableRegions
      return null
    }

    act(() => root.render(<Harness />))
    return { commands, updateRecord, getRecord: () => recordState }
  }

  it('normalizes null, undefined, and array comparison sources to replace the list', () => {
    const nextSource = { id: 'next', name: 'Next', kind: 'protein' as const, sequence: 'M', enabled: true }
    const env = mountController(proteinRecord())

    act(() => env.commands.updateProteinComparisonSources!(null))
    expect(env.getRecord().protein?.comparisonSources).toEqual([])

    act(() => env.commands.updateProteinComparisonSources!(undefined))
    expect(env.getRecord().protein?.comparisonSources).toEqual([])

    act(() => env.commands.updateProteinComparisonSources!([nextSource]))
    expect(env.getRecord().protein?.comparisonSources).toEqual([nextSource])
  })

  it('normalizes null, undefined, and array variable regions to replace the list', () => {
    const nextRegion = { id: 'next-region', start: 1, end: 2 }
    const env = mountController(proteinRecord())

    act(() => env.commands.updateProteinComparisonVariableRegions!(null))
    expect(env.getRecord().protein?.comparisonVariableRegions).toEqual([])

    act(() => env.commands.updateProteinComparisonVariableRegions!(undefined))
    expect(env.getRecord().protein?.comparisonVariableRegions).toEqual([])

    act(() => env.commands.updateProteinComparisonVariableRegions!([nextRegion]))
    expect(env.getRecord().protein?.comparisonVariableRegions).toEqual([nextRegion])
  })
})
