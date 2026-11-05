// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { labPlasmid } from '../../domain/fixtures'
import { traceRecordFromSequence } from '../../domain/sequenceTraceFactory'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { SequenceFeature, SequenceRecord } from '../../domain/types'
import {
  useFeaturePaneInteractionController,
  type FeaturePaneInteractionOptions,
} from './useFeaturePaneInteractionController'

function feature(id: string, start = 0, end = 10): SequenceFeature {
  return {
    id,
    name: id,
    type: 'misc_feature',
    color: labPlasmid.features[0]!.color,
    locations: [{ start, end, strand: 'forward' }],
  }
}

function dnaRecord(features: SequenceFeature[]): SequenceRecord {
  return {
    ...labPlasmid,
    id: 'rec',
    name: 'rec',
    molecule: 'dna',
    topology: 'linear',
    sequence: 'ACGTACGTACGTACGT',
    features,
    primers: [],
  }
}

function baseOptions(overrides: Partial<FeaturePaneInteractionOptions> = {}): FeaturePaneInteractionOptions {
  const f1 = feature('f1', 0, 4)
  const f2 = feature('f2', 5, 9)
  const record = dnaRecord([f1, f2])
  return {
    record,
    traceFiles: [],
    featureRows: [
      { memberId: null, feature: f1 },
      { memberId: null, feature: f2 },
    ],
    sgRnaRows: [],
    featureTabSelectionMemberId: null,
    featureTabAnchor: null,
    selectedFeatureId: null,
    selectedFeatureIds: [],
    selectedAlignmentTraceId: null,
    selectionFocus: 'dna',
    updateRecord: vi.fn(),
    onTraceFilesChange: vi.fn(),
    setStatus: vi.fn(),
    setFeatureTabSelectionMemberId: vi.fn(),
    setFeatureTabAnchor: vi.fn(),
    setSelectedAlignmentTraceId: vi.fn(),
    setSelectedFeatureId: vi.fn(),
    setSelectedFeatureIds: vi.fn(),
    setSelectedPrimerId: vi.fn(),
    setSelectedPrimerIds: vi.fn(),
    setCutSelectionAnchor: vi.fn(),
    setCutStrandSelection: vi.fn(),
    setCutSelectionEnzymes: vi.fn(),
    setSelectionFocus: vi.fn(),
    setSelectedRange: vi.fn(),
    setSelectionAnchor: vi.fn(),
    getVisibilityTargetIds: () => [],
    ...overrides,
  }
}

async function runHook<T>(
  options: FeaturePaneInteractionOptions,
  run: (value: ReturnType<typeof useFeaturePaneInteractionController>) => T,
): Promise<T> {
  let value: ReturnType<typeof useFeaturePaneInteractionController> | undefined
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  function Harness() {
    value = useFeaturePaneInteractionController(options)
    return null
  }
  await act(async () => root.render(<Harness />))
  const result = run(value!)
  act(() => root.unmount())
  host.remove()
  return result
}

describe('useFeaturePaneInteractionController', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('focusFeatureTabSelection applies feature focus and range for a single feature', async () => {
    const setSelectedFeatureId = vi.fn()
    const setSelectedFeatureIds = vi.fn()
    const setSelectionFocus = vi.fn()
    const setSelectedRange = vi.fn()
    await runHook(
      baseOptions({ setSelectedFeatureId, setSelectedFeatureIds, setSelectionFocus, setSelectedRange }),
      ({ focusFeatureTabSelection }) => {
        focusFeatureTabSelection('f1', ['f1'], null)
        expect(setSelectedFeatureId).toHaveBeenCalledWith('f1')
        expect(setSelectedFeatureIds).toHaveBeenCalledWith(['f1'])
        expect(setSelectionFocus).toHaveBeenCalledWith('feature')
        expect(setSelectedRange).toHaveBeenCalledWith({ start: 0, end: 4 })
      },
    )
  })

  it('selectFeatureTabRow toggles multi-selection within the same member section', async () => {
    const setSelectedFeatureIds = vi.fn()
    const setSelectedFeatureId = vi.fn()
    const options = baseOptions({
      featureTabSelectionMemberId: null,
      selectedFeatureIds: ['f1'],
      selectedFeatureId: 'f1',
      setSelectedFeatureIds,
      setSelectedFeatureId,
    })
    await runHook(options, ({ selectFeatureTabRow }) => {
      selectFeatureTabRow({ memberId: null, feature: feature('f2') }, { shiftKey: false, metaKey: true, ctrlKey: false })
      expect(setSelectedFeatureIds).toHaveBeenCalledWith(['f1', 'f2'])
      expect(setSelectedFeatureId).toHaveBeenCalledWith('f2')
    })
  })

  it('showSelectedFeatures captures visibility target ids at invocation', async () => {
    const updateRecord = vi.fn()
    const getVisibilityTargetIds = vi
      .fn()
      .mockReturnValueOnce(['f1'])
      .mockReturnValueOnce(['f2'])
    const setStatus = vi.fn()
    const { showSelectedFeatures } = await runHook(
      baseOptions({ updateRecord, getVisibilityTargetIds, setStatus, featureTabSelectionMemberId: null }),
      (controller) => controller,
    )
    showSelectedFeatures()
    showSelectedFeatures()
    expect(getVisibilityTargetIds).toHaveBeenCalledTimes(2)
    expect(updateRecord).toHaveBeenCalledTimes(2)
    expect(setStatus).toHaveBeenNthCalledWith(1, 'Showed f1 on map and sequence.')
    expect(setStatus).toHaveBeenNthCalledWith(2, 'Showed f2 on map and sequence.')
  })

  it('hideSelectedFeatures uses member-scoped trace updates when a library member is selected', async () => {
    const memberFeature = feature('m1', 1, 6)
    const traceFiles: TraceFileRecord[] = [{
      ...traceRecordFromSequence('ACGTACGTACGTACGT', 'trace.ab1', { id: 'trace-1' }),
      showAnnotations: true,
      features: [memberFeature],
    }]
    const onTraceFilesChange = vi.fn()
    const updateRecord = vi.fn()
    const setStatus = vi.fn()
    await runHook(
      baseOptions({
        featureTabSelectionMemberId: 'trace-1',
        getVisibilityTargetIds: () => ['m1'],
        onTraceFilesChange,
        updateRecord,
        setStatus,
        traceFiles,
      }),
      ({ hideSelectedFeatures }) => {
        hideSelectedFeatures()
        expect(onTraceFilesChange).toHaveBeenCalledOnce()
        expect(updateRecord).not.toHaveBeenCalled()
        expect(setStatus).toHaveBeenCalledWith('Hid m1 on map and sequence.')
        const updater = onTraceFilesChange.mock.calls[0]![0] as (current: TraceFileRecord[]) => TraceFileRecord[]
        const next = updater(traceFiles)
        expect(next[0]!.features!.find((entry) => entry.id === 'm1')?.visible).toBe(false)
      },
    )
  })
})
