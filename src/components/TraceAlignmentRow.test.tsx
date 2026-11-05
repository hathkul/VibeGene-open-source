// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildMergedInsertionLayout, visibleMergedLayoutEntries } from '../domain/traceDisplay'
import type { TraceFileRecord } from '../domain/traceTypes'
import { TraceAlignmentRow } from './SequenceAlignmentPane'

const copy = vi.hoisted(() => vi.fn<(text: string) => Promise<void>>(async () => {}))
vi.mock('../desktop/clipboard', () => ({ writeClipboardText: copy }))

describe('trace alignment row selection', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  afterEach(() => { act(() => root?.unmount()); host?.remove(); copy.mockClear() })

  it('selects and copies the trace including inserted and mismatched bases, without selecting the reference', async () => {
    const trace: TraceFileRecord = {
      id: 'read', fileName: 'read.ab1', sequence: 'AGT', enabled: true, expanded: false, showAnnotations: false,
      chromatogram: { baseCalls: ['A', 'G', 'T'], basePos: [], aTrace: [], cTrace: [], gTrace: [], tTrace: [] },
      alignment: { templateStart: 0, templateEnd: 3, traceStart: 0, traceEnd: 3, orientation: 'forward', mismatchCount: 1, gapCount: 2, alignmentScore: 1,
        columns: [
          { kind: 'match', templateIndex: 0, traceIndex: 0, match: true },
          { kind: 'traceInsert', traceIndex: 1 },
          { kind: 'templateGap', templateIndex: 1, traceIndex: -1 },
          { kind: 'match', templateIndex: 2, traceIndex: 2, match: false },
        ] },
    }
    const layout = buildMergedInsertionLayout([trace.alignment!], 3)
    const entries = visibleMergedLayoutEntries(layout, 0, 3)
    const onRangeSelect = vi.fn()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root.render(<TraceAlignmentRow trace={trace} templateSequence="ACC" mergedLayout={layout} visibleEntries={entries}
      visibleStart={0} visibleEnd={3} selectedRange={null} isFocused peakHoverTemplateIndex={null} peakHoverBase={null}
      onFocus={vi.fn()} onRangeSelect={onRangeSelect} onPeakHover={vi.fn()} />))
    const strip = host.querySelector<HTMLElement>('.alignment-trace-interactive')!
    const bases = host.querySelector<HTMLElement>('.alignment-trace-bases')!
    const start = entries[0]!.leftPx + 5
    const end = entries[3]!.leftPx + 5
    act(() => bases.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, clientX: start })))
    act(() => bases.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, buttons: 1, clientX: end })))
    act(() => bases.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0, clientX: end })))
    expect(onRangeSelect).not.toHaveBeenCalled()
    expect(bases.querySelectorAll('.is-selected')).toHaveLength(3)
    expect(host.querySelectorAll('.alignment-template-strip .is-selected')).toHaveLength(0)
    await act(async () => strip.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ctrlKey: true, key: 'c' })))
    expect(copy).toHaveBeenCalledWith('AGT')
    const setData = vi.fn()
    const event = new Event('copy', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { setData } })
    act(() => strip.dispatchEvent(event))
    expect(setData).toHaveBeenCalledWith('text/plain', 'AGT')
    expect(event.defaultPrevented).toBe(true)
    act(() => strip.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
    expect(bases.querySelectorAll('.is-selected')).toHaveLength(0)
  })
})
