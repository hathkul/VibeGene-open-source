// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultPrimerHybridizationParams } from '../../domain/primerHybridization'
import { enzymes, findRestrictionSites } from '../../domain/enzymes'
import { labPlasmid } from '../../domain/fixtures'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { SequenceRecord } from '../../domain/types'
import {
  useSequenceClipboardController,
  type SequenceClipboardControllerOptions,
} from './useSequenceClipboardController'

function baseOptions(
  overrides: Partial<SequenceClipboardControllerOptions> = {},
): SequenceClipboardControllerOptions {
  return {
    record: labPlasmid,
    selectedRange: { start: 0, end: 20 },
    cutStrandSelection: null,
    cutSelectionEnzymes: null,
    alignmentsVisible: false,
    selectedAlignmentTraceId: null,
    traceFiles: [],
    primerHybridization: defaultPrimerHybridizationParams,
    tabId: 'tab-test',
    getRichClipboardForPaste: vi.fn().mockResolvedValue(null),
    readClipboardText: vi.fn().mockResolvedValue(''),
    richClipboardMatchesPasteText: () => false,
    insertSequenceBases: vi.fn().mockReturnValue(false),
    writeClipboardText: vi.fn().mockResolvedValue(undefined),
    setCopyEventText: vi.fn(),
    storeRichClipboard: vi.fn().mockResolvedValue({ id: 'x', copiedAt: '', sequence: '', features: [], primers: [] }),
    setStatus: vi.fn(),
    ...overrides,
  }
}

async function runHook<T>(
  options: SequenceClipboardControllerOptions,
  run: (value: ReturnType<typeof useSequenceClipboardController>) => Promise<T> | T,
): Promise<T> {
  let value: ReturnType<typeof useSequenceClipboardController> | undefined
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  function Harness() {
    value = useSequenceClipboardController(options)
    return null
  }
  await act(async () => root.render(<Harness />))
  const result = await run(value!)
  act(() => root.unmount())
  host.remove()
  return result
}

describe('useSequenceClipboardController', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('prefers a matching rich fragment and falls back to plain clipboard text', async () => {
    const insert = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    const readClipboardText = vi.fn().mockResolvedValue('ACGT')
    await runHook(
      baseOptions({
        getRichClipboardForPaste: vi.fn().mockResolvedValue({ sequence: 'ACGT', features: [], primers: [] }),
        readClipboardText,
        richClipboardMatchesPasteText: () => true,
        insertSequenceBases: insert,
      }),
      async ({ pasteSequenceFromClipboard }) => {
        await pasteSequenceFromClipboard()
        expect(insert).toHaveBeenNthCalledWith(1, 'ACGT', { sequence: 'ACGT', features: [], primers: [] })
        expect(insert).toHaveBeenNthCalledWith(2, 'ACGT')
        expect(readClipboardText).toHaveBeenCalledOnce()
      },
    )
  })

  it('copies plain DNA, stores rich annotations, and sets status', async () => {
    const writeClipboardText = vi.fn().mockResolvedValue(undefined)
    const storeRichClipboard = vi.fn().mockResolvedValue({ id: 'x', copiedAt: '', sequence: '', features: [], primers: [] })
    const setStatus = vi.fn()
    await runHook(
      baseOptions({ writeClipboardText, storeRichClipboard, setStatus }),
      async ({ copySequenceSelection }) => {
        const ok = await copySequenceSelection()
        expect(ok).toBe(true)
        expect(writeClipboardText).toHaveBeenCalledOnce()
        expect(storeRichClipboard).toHaveBeenCalledOnce()
        expect(setStatus).toHaveBeenCalledWith(expect.stringMatching(/^Copied .* to clipboard/))
      },
    )
  })

  it('sets copy event text before async clipboard write', async () => {
    const callOrder: string[] = []
    const setCopyEventText = vi.fn(() => callOrder.push('sync'))
    const writeClipboardText = vi.fn(async () => { callOrder.push('async') })
    const event = { clipboardData: null } as unknown as ClipboardEvent
    await runHook(
      baseOptions({ setCopyEventText, writeClipboardText }),
      async ({ copySequenceSelection }) => {
        await copySequenceSelection(event)
        expect(setCopyEventText).toHaveBeenCalledOnce()
        expect(callOrder).toEqual(['sync', 'async'])
      },
    )
  })

  it('reports clipboard failure without storing rich data', async () => {
    const setStatus = vi.fn()
    const storeRichClipboard = vi.fn()
    await runHook(
      baseOptions({
        writeClipboardText: vi.fn().mockRejectedValue(new Error('denied')),
        storeRichClipboard,
        setStatus,
      }),
      async ({ copySequenceSelection }) => {
        const ok = await copySequenceSelection()
        expect(ok).toBe(false)
        expect(setStatus).toHaveBeenCalledWith('Could not copy to clipboard.')
        expect(storeRichClipboard).not.toHaveBeenCalled()
      },
    )
  })

  it('keeps plain copy success when rich storage fails', async () => {
    const setStatus = vi.fn()
    await runHook(
      baseOptions({
        storeRichClipboard: vi.fn().mockRejectedValue(new Error('db')),
        setStatus,
      }),
      async ({ copySequenceSelection }) => {
        const ok = await copySequenceSelection()
        expect(ok).toBe(true)
        expect(setStatus).toHaveBeenCalledWith(expect.stringMatching(/^Copied .* to clipboard/))
      },
    )
  })

  it('copies wrapped protein selection text', async () => {
    const protein: SequenceRecord = {
      ...labPlasmid,
      id: 'protein-fixture',
      molecule: 'protein',
      topology: 'circular',
      sequence: 'ABCDEFGH',
      features: [],
      primers: [],
    }
    const writeClipboardText = vi.fn().mockResolvedValue(undefined)
    await runHook(
      baseOptions({
        record: protein,
        selectedRange: { start: 6, end: 2 },
        writeClipboardText,
      }),
      async ({ copySequenceSelection }) => {
        await copySequenceSelection()
        expect(writeClipboardText).toHaveBeenCalledWith('GHAB')
      },
    )
  })

  it('copies from a library member when browsing alignments off', async () => {
    const libraryRecord: SequenceRecord = {
      ...labPlasmid,
      dna: { documentRole: 'library' },
    }
    const memberSequence = 'GATTACA'.repeat(20)
    const trace: TraceFileRecord = {
      id: 'member-1',
      fileName: 'clone-1.ab1',
      sequence: memberSequence,
      chromatogram: { aTrace: [], tTrace: [], gTrace: [], cTrace: [], basePos: [], baseCalls: [] },
      enabled: true,
      expanded: false,
      showAnnotations: false,
      alignment: null,
    }
    const writeClipboardText = vi.fn().mockResolvedValue(undefined)
    await runHook(
      baseOptions({
        record: libraryRecord,
        selectedAlignmentTraceId: 'member-1',
        traceFiles: [trace],
        selectedRange: { start: 0, end: 7 },
        writeClipboardText,
      }),
      async ({ copySequenceSelection }) => {
        await copySequenceSelection()
        expect(writeClipboardText).toHaveBeenCalledWith(memberSequence.slice(0, 7))
      },
    )
  })

  it('labels sticky molecular-weight selection with enzyme positions', async () => {
    const ecoRi = enzymes.find((enzyme) => enzyme.name === 'EcoRI')
    const bamHi = enzymes.find((enzyme) => enzyme.name === 'BamHI')
    expect(ecoRi).toBeDefined()
    expect(bamHi).toBeDefined()
    const ecoTemplate = `${'A'.repeat(100)}GAATTC${'A'.repeat(20)}`
    const bamTemplate = `${'A'.repeat(200)}GGATCC${'A'.repeat(20)}`
    const upstream = findRestrictionSites(ecoTemplate, [ecoRi!], { topology: 'linear' })[0]
    const downstream = findRestrictionSites(bamTemplate, [bamHi!], { topology: 'linear' })[0]
    expect(upstream).toBeDefined()
    expect(downstream).toBeDefined()
    await runHook(
      baseOptions({
        selectedRange: null,
        cutStrandSelection: {
          forward: { start: 10, end: 25 },
          reverse: { start: 20, end: 5 },
        },
        cutSelectionEnzymes: {
          upstream: upstream!,
          downstream: downstream!,
        },
      }),
      ({ toolsMwSelection }) => {
        expect(toolsMwSelection?.kind).toBe('sticky')
        expect(toolsMwSelection?.label).toContain(`EcoRI (${upstream!.start + 2})`)
        expect(toolsMwSelection?.label).toContain(`BamHI (${downstream!.start + 2})`)
      },
    )
  })

  it('projects linear range molecular-weight selection', async () => {
    await runHook(
      baseOptions({ selectedRange: { start: 5, end: 15 } }),
      ({ toolsMwSelection, hasSequenceSelection, canCopySelection }) => {
        expect(hasSequenceSelection).toBe(true)
        expect(canCopySelection).toBe(true)
        expect(toolsMwSelection).toEqual({
          kind: 'range',
          start: 5,
          end: 15,
          label: expect.stringContaining('= 10 bp'),
        })
      },
    )
  })
})
